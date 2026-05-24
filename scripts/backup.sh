#!/usr/bin/env bash
# Daily backup: platform DB, authentik DB, paperless media.
# Runs inside the backup container; env vars injected via docker-compose.
set -euo pipefail

BACKUP_ROOT="${BACKUP_DIR:-/backups}"
DATE=$(date +%Y-%m-%d)
DIR="${BACKUP_ROOT}/${DATE}"
mkdir -p "$DIR"

echo "[backup] $(date) — starting"

# Platform PostgreSQL
pg_dump -h db -U platform -d platform > "${DIR}/platform.sql"
echo "[backup] platform DB → ${DIR}/platform.sql ($(du -sh "${DIR}/platform.sql" | cut -f1))"

# Authentik PostgreSQL
PGPASSWORD="${AUTHENTIK_DB_PASSWORD}" pg_dump -h postgresql-authentik -U authentik -d authentik \
  > "${DIR}/authentik.sql"
echo "[backup] authentik DB → ${DIR}/authentik.sql ($(du -sh "${DIR}/authentik.sql" | cut -f1))"

# Paperless media (documents + thumbnails)
tar -czf "${DIR}/paperless-media.tar.gz" -C /paperless_media . 2>/dev/null || true
echo "[backup] paperless media → ${DIR}/paperless-media.tar.gz ($(du -sh "${DIR}/paperless-media.tar.gz" | cut -f1))"

# Rotate: delete backups older than 7 days
find "${BACKUP_ROOT}" -maxdepth 1 -type d -name "????-??-??" | sort | head -n -7 | xargs -r rm -rf
echo "[backup] rotated old backups (keeping 7 days)"

echo "[backup] done — $(du -sh "${DIR}" | cut -f1) total"
