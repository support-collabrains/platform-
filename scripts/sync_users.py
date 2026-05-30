#!/usr/bin/env python3
"""Sync Authentik users to Paperless-ngx and Immich. Stores paperlessUserId in Authentik."""
import os
import sys
import secrets
import string
import requests

AUTHENTIK_URL = os.environ["AUTHENTIK_URL"]
AUTHENTIK_TOKEN = os.environ["AUTHENTIK_BOOTSTRAP_TOKEN"]
PAPERLESS_URL = os.environ["PAPERLESS_INTERNAL_URL"]
PAPERLESS_TOKEN = os.environ["PAPERLESS_API_TOKEN"]
IMMICH_URL = os.environ.get("IMMICH_INTERNAL_URL", "")
IMMICH_TOKEN = os.environ.get("IMMICH_API_KEY", "")

AUTHENTIK_HEADERS = {"Authorization": f"Bearer {AUTHENTIK_TOKEN}", "Content-Type": "application/json"}
PAPERLESS_HEADERS = {"Authorization": f"Token {PAPERLESS_TOKEN}", "Content-Type": "application/json"}
IMMICH_HEADERS = {"x-api-key": IMMICH_TOKEN, "Content-Type": "application/json"} if IMMICH_TOKEN else {}

SKIP_USERS = {"akadmin", "AnonymousUser"}


def random_password(length=32):
    alphabet = string.ascii_letters + string.digits + string.punctuation
    return "".join(secrets.choice(alphabet) for _ in range(length))


# ── Authentik ────────────────────────────────────────────────────────────────

def get_authentik_users():
    users = []
    url = f"{AUTHENTIK_URL}/api/v3/core/users/?type=internal&page_size=100"
    while url:
        resp = requests.get(url, headers=AUTHENTIK_HEADERS, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        users.extend(data["results"])
        url = data.get("next")
    return users


def set_authentik_attrs(authentik_pk, existing_attrs, patch):
    attrs = dict(existing_attrs or {})
    attrs.update(patch)
    resp = requests.patch(
        f"{AUTHENTIK_URL}/api/v3/core/users/{authentik_pk}/",
        headers=AUTHENTIK_HEADERS,
        json={"attributes": attrs},
        timeout=10,
    )
    resp.raise_for_status()


# ── Paperless ─────────────────────────────────────────────────────────────────

def get_paperless_users():
    resp = requests.get(f"{PAPERLESS_URL}/api/users/", headers=PAPERLESS_HEADERS, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    results = data.get("results", data) if isinstance(data, dict) else data
    return {u["username"]: u["id"] for u in results}


def create_paperless_user(username, email):
    payload = {"username": username, "email": email or f"{username}@local", "password": random_password()}
    resp = requests.post(f"{PAPERLESS_URL}/api/users/", headers=PAPERLESS_HEADERS, json=payload, timeout=10)
    resp.raise_for_status()
    return resp.json()["id"]


def sync_paperless(user, paperless_users, current_attrs):
    username = user["username"]
    existing_id = current_attrs.get("paperlessUserId")

    if existing_id and username in paperless_users:
        return None  # already synced

    if username not in paperless_users:
        print(f"  [Paperless] Aanmaken: {username}")
        pl_id = create_paperless_user(username, user.get("email", ""))
        print(f"    → ID {pl_id}")
        return {"paperlessUserId": pl_id}
    else:
        pl_id = paperless_users[username]
        if not existing_id:
            print(f"  [Paperless] Attribuut bijwerken: {username} → ID {pl_id}")
            return {"paperlessUserId": pl_id}
    return None


# ── Immich ────────────────────────────────────────────────────────────────────

def get_immich_users():
    if not IMMICH_TOKEN or not IMMICH_URL:
        return {}
    resp = requests.get(f"{IMMICH_URL}/api/admin/users", headers=IMMICH_HEADERS, timeout=10)
    if not resp.ok:
        print(f"  [Immich] Ophalen gebruikers mislukt: {resp.status_code}", file=sys.stderr)
        return {}
    return {u["email"]: u["id"] for u in resp.json()}


def create_immich_user(username, email, name):
    payload = {
        "email": email,
        "password": random_password(),
        "name": name or username,
        "storageLabel": username,
    }
    resp = requests.post(f"{IMMICH_URL}/api/admin/users", headers=IMMICH_HEADERS, json=payload, timeout=10)
    resp.raise_for_status()
    return resp.json()["id"]


def sync_immich(user, immich_users_by_email):
    if not IMMICH_TOKEN or not IMMICH_URL:
        return None

    email = user.get("email", "")
    if not email:
        return None

    if email in immich_users_by_email:
        return None  # already exists

    username = user["username"]
    name = user.get("name") or username
    print(f"  [Immich] Aanmaken: {username} ({email})")
    try:
        immich_id = create_immich_user(username, email, name)
        print(f"    → Immich ID {immich_id}")
        return {"immichUserId": immich_id}
    except Exception as e:
        print(f"    FOUT: {e}", file=sys.stderr)
        return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=== Authentik → Paperless + Immich user sync ===")

    authentik_users = get_authentik_users()
    print(f"Authentik: {len(authentik_users)} gebruikers")

    paperless_users = get_paperless_users()
    print(f"Paperless: {len(paperless_users)} bestaande gebruikers")

    immich_users = get_immich_users()
    print(f"Immich:    {len(immich_users)} bestaande gebruikers" + (" (Immich niet geconfigureerd)" if not IMMICH_TOKEN else ""))

    created = 0
    skipped = 0

    for user in authentik_users:
        username = user["username"]
        if username in SKIP_USERS:
            skipped += 1
            continue

        attrs = user.get("attributes") or {}
        patch = {}

        try:
            pl_patch = sync_paperless(user, paperless_users, attrs)
            if pl_patch:
                patch.update(pl_patch)
                created += 1
            else:
                skipped += 1

            im_patch = sync_immich(user, immich_users)
            if im_patch:
                patch.update(im_patch)

            if patch:
                set_authentik_attrs(user["pk"], attrs, patch)

        except Exception as e:
            print(f"  FOUT bij {username}: {e}", file=sys.stderr)

    print(f"\nKlaar: {created} bijgewerkt, {skipped} overgeslagen")


if __name__ == "__main__":
    main()
