#!/usr/bin/env python3
"""Sync Authentik users to Paperless-ngx and store paperlessUserId in Authentik."""
import os
import sys
import secrets
import string
import requests

AUTHENTIK_URL = os.environ["AUTHENTIK_URL"]
AUTHENTIK_TOKEN = os.environ["AUTHENTIK_BOOTSTRAP_TOKEN"]
PAPERLESS_URL = os.environ["PAPERLESS_INTERNAL_URL"]
PAPERLESS_TOKEN = os.environ["PAPERLESS_API_TOKEN"]

AUTHENTIK_HEADERS = {"Authorization": f"Bearer {AUTHENTIK_TOKEN}", "Content-Type": "application/json"}
PAPERLESS_HEADERS = {"Authorization": f"Token {PAPERLESS_TOKEN}", "Content-Type": "application/json"}


def get_authentik_users():
    """Haal alle interne gebruikers op uit Authentik (paginering)."""
    users = []
    url = f"{AUTHENTIK_URL}/api/v3/core/users/?type=internal&page_size=100"
    while url:
        resp = requests.get(url, headers=AUTHENTIK_HEADERS, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        users.extend(data["results"])
        url = data.get("next")
    return users


def get_paperless_users():
    """Geeft dict van username → user_id voor alle Paperless gebruikers."""
    resp = requests.get(f"{PAPERLESS_URL}/api/users/", headers=PAPERLESS_HEADERS, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    # Handle both paginated and non-paginated responses
    results = data.get("results", data) if isinstance(data, dict) else data
    return {u["username"]: u["id"] for u in results}


def create_paperless_user(username, email):
    """Maakt een nieuwe Paperless gebruiker aan. Geeft user_id terug."""
    alphabet = string.ascii_letters + string.digits + string.punctuation
    password = "".join(secrets.choice(alphabet) for _ in range(32))
    payload = {"username": username, "email": email or f"{username}@local", "password": password}
    resp = requests.post(f"{PAPERLESS_URL}/api/users/", headers=PAPERLESS_HEADERS, json=payload, timeout=10)
    resp.raise_for_status()
    return resp.json()["id"]


def set_authentik_paperless_id(authentik_user_id, existing_attrs, paperless_user_id):
    """Sla paperlessUserId op als attribuut in Authentik."""
    attrs = dict(existing_attrs or {})
    attrs["paperlessUserId"] = paperless_user_id
    resp = requests.patch(
        f"{AUTHENTIK_URL}/api/v3/core/users/{authentik_user_id}/",
        headers=AUTHENTIK_HEADERS,
        json={"attributes": attrs},
        timeout=10,
    )
    resp.raise_for_status()


def main():
    print("=== Authentik → Paperless user sync ===")
    authentik_users = get_authentik_users()
    print(f"Gevonden in Authentik: {len(authentik_users)} gebruikers")

    paperless_users = get_paperless_users()
    print(f"Bestaand in Paperless: {len(paperless_users)} gebruikers")

    created = 0
    skipped = 0
    for user in authentik_users:
        username = user["username"]
        if username in ("akadmin", "AnonymousUser"):
            skipped += 1
            continue

        attrs = user.get("attributes") or {}
        existing_paperless_id = attrs.get("paperlessUserId")

        if existing_paperless_id and username in paperless_users:
            skipped += 1
            continue

        if username not in paperless_users:
            print(f"  Aanmaken: {username} ({user.get('email', '')})")
            try:
                pl_id = create_paperless_user(username, user.get("email", ""))
                set_authentik_paperless_id(user["pk"], attrs, pl_id)
                phone = attrs.get("phone") or attrs.get("phoneNumber", "")
                print(f"    → Paperless ID {pl_id}, telefoon: {phone or '(geen)'}")
                created += 1
            except Exception as e:
                print(f"    FOUT: {e}", file=sys.stderr)
        elif not existing_paperless_id:
            # Gebruiker bestaat al in Paperless maar mist het Authentik-attribuut
            pl_id = paperless_users[username]
            try:
                set_authentik_paperless_id(user["pk"], attrs, pl_id)
                print(f"  Attribuut bijgewerkt voor bestaande gebruiker: {username} → ID {pl_id}")
                created += 1
            except Exception as e:
                print(f"    FOUT bij attribuut update voor {username}: {e}", file=sys.stderr)
        else:
            skipped += 1

    print(f"\nKlaar: {created} aangemaakt/bijgewerkt, {skipped} overgeslagen")


if __name__ == "__main__":
    main()
