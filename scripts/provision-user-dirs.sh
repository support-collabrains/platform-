#!/usr/bin/env bash
# Creates Paperless consume dirs for all Authentik internal users.
# Run manually or via cron after adding new users.
set -euo pipefail

CONSUME_DIR="/srv/platform/data/paperless/consume"
AUTHENTIK_URL="http://172.18.0.6:9000"
TOKEN=$(grep AUTHENTIK_BOOTSTRAP_TOKEN /srv/platform/.env | cut -d= -f2)

users=$(curl -s "${AUTHENTIK_URL}/api/v3/core/users/?page_size=100&type=internal" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for u in d['results']:
    print(u['username'])
")

for user in $users; do
  dir="${CONSUME_DIR}/${user}"
  if [[ ! -d "$dir" ]]; then
    mkdir -p "$dir"
    echo "Created: $dir"
  else
    echo "Exists:  $dir"
  fi
done
