#!/usr/bin/env python3
"""Signal → Paperless document bridge.

Pollt de Signal API elke 5 seconden. Berichten met bijlagen (of tekst zonder /commando)
worden naar Paperless geüpload voor de juiste gebruiker op basis van het telefoonnummer
dat is opgeslagen als Authentik-attribuut 'phone'.

Redis (queue-redis) markeert verwerkte berichten (TTL 1 uur) zodat de NestJS-poller
(die ook Signal raadpleegt voor tickets/commando's) geen dubbele verwerking doet.
"""
import io
import os
import sys
import time

import redis
import requests

SIGNAL_API_URL = os.environ["SIGNAL_API_URL"]        # http://signal-api:8080
SIGNAL_SENDER = os.environ["SIGNAL_SENDER"]           # +4949534254784
PAPERLESS_URL = os.environ["PAPERLESS_INTERNAL_URL"]  # http://paperless:8000
PAPERLESS_TOKEN = os.environ["PAPERLESS_API_TOKEN"]
AUTHENTIK_URL = os.environ["AUTHENTIK_URL"]
AUTHENTIK_TOKEN = os.environ["AUTHENTIK_BOOTSTRAP_TOKEN"]
REDIS_URL = os.environ.get("QUEUE_REDIS_URL", "redis://queue-redis:6379")
NESTJS_URL = os.environ.get("INTERNAL_API_URL", "http://api:3001")
INTERNAL_SECRET = os.environ.get("INTERNAL_API_SECRET", "")

PAPERLESS_HEADERS = {"Authorization": f"Token {PAPERLESS_TOKEN}"}
AUTHENTIK_HEADERS = {"Authorization": f"Bearer {AUTHENTIK_TOKEN}"}

r = redis.from_url(REDIS_URL, decode_responses=True)

# Cache phone → paperlessUserId to avoid hammering Authentik API
_phone_cache: dict[str, int | None] = {}


def mark_processed(timestamp: int):
    r.setex(f"signal:processed:{timestamp}", 3600, "1")


def is_processed(timestamp: int) -> bool:
    return r.exists(f"signal:processed:{timestamp}") == 1


def find_paperless_user_by_phone(phone: str) -> int | None:
    """Zoek Paperless user ID op basis van telefoonnummer in Authentik."""
    normalized = phone.replace(" ", "")
    if normalized in _phone_cache:
        return _phone_cache[normalized]

    url = f"{AUTHENTIK_URL}/api/v3/core/users/?type=internal&page_size=100"
    while url:
        try:
            resp = requests.get(url, headers=AUTHENTIK_HEADERS, timeout=10)
            if not resp.ok:
                break
            data = resp.json()
            for user in data["results"]:
                attrs = user.get("attributes") or {}
                user_phone = (attrs.get("phone") or attrs.get("phoneNumber", "")).replace(" ", "")
                if user_phone and user_phone == normalized:
                    pl_id = attrs.get("paperlessUserId")
                    _phone_cache[normalized] = pl_id
                    return pl_id
            url = data.get("next")
        except Exception as e:
            print(f"  Waarschuwing: fout bij ophalen Authentik gebruikers: {e}", file=sys.stderr)
            break

    _phone_cache[normalized] = None
    return None


def ensure_signal_tag() -> int:
    """Zorg dat de 'Signal' tag bestaat en geef het ID terug."""
    resp = requests.get(f"{PAPERLESS_URL}/api/tags/", headers=PAPERLESS_HEADERS, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    tags = data.get("results", data) if isinstance(data, dict) else data
    for tag in tags:
        if tag["name"].lower() == "signal":
            return tag["id"]
    resp = requests.post(
        f"{PAPERLESS_URL}/api/tags/",
        headers={**PAPERLESS_HEADERS, "Content-Type": "application/json"},
        json={"name": "Signal", "color": "#2196f3"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["id"]


def send_signal_reply(recipient: str, message: str):
    """Stuur een tekstbericht terug via Signal API."""
    try:
        requests.post(
            f"{SIGNAL_API_URL}/v2/send",
            json={"message": message, "number": SIGNAL_SENDER, "recipients": [recipient]},
            timeout=10,
        )
    except Exception as e:
        print(f"  Antwoord sturen mislukt: {e}", file=sys.stderr)


def download_attachment(attachment_id: str) -> tuple[bytes, str]:
    """Download bijlage van Signal API. Geeft (data, filename) terug."""
    resp = requests.get(f"{SIGNAL_API_URL}/v1/attachments/{attachment_id}", timeout=60)
    resp.raise_for_status()
    filename = attachment_id
    cd = resp.headers.get("Content-Disposition", "")
    if "filename=" in cd:
        filename = cd.split("filename=")[-1].strip().strip('"')
    return resp.content, filename


def upload_to_paperless(
    file_data: bytes,
    filename: str,
    title: str,
    tag_id: int,
    owner_id: int | None,
) -> str:
    """Upload document naar Paperless API."""
    files = {"document": (filename, io.BytesIO(file_data))}
    data = {"title": title, "tags": [tag_id]}
    if owner_id:
        data["owner"] = owner_id
    resp = requests.post(
        f"{PAPERLESS_URL}/api/documents/post_document/",
        headers=PAPERLESS_HEADERS,
        files=files,
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.text.strip()


def process_message(envelope: dict, signal_tag_id: int):
    """Verwerk één Signal bericht."""
    timestamp = envelope.get("timestamp", 0)
    if is_processed(timestamp):
        return

    source = envelope.get("source", "onbekend")
    data_msg = envelope.get("dataMessage", {})
    text = (data_msg.get("message") or "").strip()
    attachments = data_msg.get("attachments") or []

    # Commando's (beginnen met /) zonder bijlagen: doorsturen naar NestJS
    if text.startswith("/") and not attachments:
        try:
            requests.post(
                f"{NESTJS_URL}/documents/signal-command",
                json={"sender": source, "text": text, "timestamp": timestamp},
                headers={"x-internal-secret": INTERNAL_SECRET},
                timeout=10,
            )
        except Exception as e:
            print(f"  Commando doorsturen mislukt: {e}", file=sys.stderr)
        return

    # Geen inhoud: overslaan
    if not text and not attachments:
        return

    # Beslis of dit een document-upload actie is:
    # - Altijd bij bijlagen
    # - Tekst alleen bij !inbox of !document commando
    INBOX_COMMANDS = ("!inbox", "!document", "!doc", "!opslaan")
    is_inbox_cmd = text.lower().startswith(INBOX_COMMANDS)

    if not attachments and not is_inbox_cmd:
        # Gewoon tekstbericht — stuur gebruiksinstructie terug via Signal
        send_signal_reply(source, "📎 Stuur een bestand om op te slaan in Paperless, of typ !inbox <tekst> om een notitie op te slaan.")
        return

    # Markeer als verwerkt vóór upload om race met NestJS te minimaliseren
    mark_processed(timestamp)

    owner_id = find_paperless_user_by_phone(source)
    print(f"Bericht van {source}: {len(attachments)} bijlage(n), owner_id={owner_id}")

    if attachments:
        for att in attachments:
            att_id = att.get("id", "")
            original_name = att.get("filename") or att_id
            ext = original_name.rsplit(".", 1)[-1] if "." in original_name else "bin"
            title = f"Signal van {source}"
            if text:
                title = f"{text[:60]} (Signal van {source})"
            try:
                file_data, _ = download_attachment(att_id)
                safe_name = f"signal_{att_id}.{ext}"
                doc_id = upload_to_paperless(file_data, safe_name, title, signal_tag_id, owner_id)
                print(f"  → Document aangemaakt: {doc_id}")
            except Exception as e:
                print(f"  FOUT bij bijlage {att_id}: {e}", file=sys.stderr)
        send_signal_reply(source, f"✅ {len(attachments)} bestand(en) opgeslagen in Paperless.")
    else:
        # !inbox commando: tekst als notitie opslaan
        note_text = text[len(text.split()[0]):].strip() or text
        title = f"Signal notitie van {source}"
        try:
            doc_id = upload_to_paperless(
                note_text.encode("utf-8"), "notitie.txt", title, signal_tag_id, owner_id
            )
            print(f"  → Notitie aangemaakt: {doc_id}")
            send_signal_reply(source, "✅ Notitie opgeslagen in Paperless.")
        except Exception as e:
            print(f"  FOUT bij notitie upload: {e}", file=sys.stderr)


def poll_loop():
    print(f"Signal consumer gestart. Pollt {SIGNAL_SENDER} elke 5s...")
    signal_tag_id = ensure_signal_tag()
    print(f"Signal tag ID: {signal_tag_id}")

    while True:
        try:
            resp = requests.get(
                f"{SIGNAL_API_URL}/v1/receive/{SIGNAL_SENDER}",
                timeout=15,
            )
            if resp.ok:
                body = resp.text.strip()
                if body and body not in ("null", "[]"):
                    messages = resp.json()
                    if isinstance(messages, list):
                        for msg in messages:
                            envelope = msg.get("envelope", {})
                            if "dataMessage" in envelope:
                                process_message(envelope, signal_tag_id)
        except requests.exceptions.Timeout:
            pass
        except Exception as e:
            print(f"Poll fout: {e}", file=sys.stderr)

        time.sleep(5)


if __name__ == "__main__":
    poll_loop()
