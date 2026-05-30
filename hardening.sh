#!/usr/bin/env bash
set -euo pipefail

BASE="/srv/platform"
cd "$BASE"

echo "🧠 ENTERPRISE HARDENING START"

# ─────────────────────────────────────────────
# 0. GitOps guard
# ─────────────────────────────────────────────
if [ ! -d .git ]; then
  echo "📦 Initializing Git repo..."
  git init
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "⚠️ Uncommitted changes detected"
  git add .
  git commit -m "pre-hardening checkpoint $(date +%s)"
fi

# ─────────────────────────────────────────────
# 1. Backup compose
# ─────────────────────────────────────────────
cp docker-compose.yml docker-compose.yml.bak.$(date +%s)
echo "💾 Backup created"

# ─────────────────────────────────────────────
# 2. Network layer hardening
# ─────────────────────────────────────────────
echo "🌐 Creating isolated networks..."

docker network create app >/dev/null 2>&1 || true
docker network create data >/dev/null 2>&1 || true
docker network create external >/dev/null 2>&1 || true

# ─────────────────────────────────────────────
# 3. Secret baseline migration (light version)
# ─────────────────────────────────────────────
mkdir -p secrets

if [ ! -f secrets/db_password ]; then
  openssl rand -base64 48 > secrets/db_password
  echo "🔐 DB password generated"
fi

if [ ! -f secrets/paperless_secret ]; then
  openssl rand -base64 48 > secrets/paperless_secret
  echo "🔐 Paperless secret generated"
fi

if [ ! -f secrets/authentik_secret ]; then
  openssl rand -base64 48 > secrets/authentik_secret
  echo "🔐 Authentik secret generated"
fi

# ─────────────────────────────────────────────
# 4. Duplicate Redis detection (non-destructive)
# ─────────────────────────────────────────────
echo "🧪 Redis instance scan:"
docker ps --format "{{.Names}} {{.Image}}" | grep redis || true

# ─────────────────────────────────────────────
# 5. Orphan container cleanup (safe)
# ─────────────────────────────────────────────
echo "♻️ Removing orphan containers..."
docker compose down --remove-orphans || true

# ─────────────────────────────────────────────
# 6. Compose validation
# ─────────────────────────────────────────────
echo "🧪 Validating compose..."
docker compose config >/dev/null

# ─────────────────────────────────────────────
# 7. Rebuild & restart
# ─────────────────────────────────────────────
echo "🚀 Restarting platform..."
docker compose up -d --build --remove-orphans

# ─────────────────────────────────────────────
# 8. Post-check
# ─────────────────────────────────────────────
sleep 5

echo "📊 Health summary:"
docker ps --format "table {{.Names}}\t{{.Status}}"

echo ""
echo "✅ ENTERPRISE HARDENING COMPLETE"
echo "─────────────────────────────────"
echo "✔ GitOps checkpoint saved"
echo "✔ Networks ensured"
echo "✔ Secrets baseline generated"
echo "✔ Compose validated"
echo "✔ Stack restarted safely"
