---
name: run-platform
description: Run, smoke-test, screenshot, and interact with the platform — start services, check status, drive the NestJS API, take screenshots of portal/auth/docs. Use when asked to run the platform, check if it's working, screenshot a service, or interact with the API.
---

# run-platform

Self-hosted control plane running as Docker Compose on the VPS. Interaction is via:
- `curl` against the NestJS API container directly by IP (no Traefik layer needed)
- `chromium --headless` for web UI screenshots (portal, auth, docs)
- `docker inspect` / `docker logs` for service health

The driver is `.claude/skills/run-platform/smoke.sh`. Run it from `/srv/platform`.

## Prerequisites

```bash
apt-get install -y chromium jq
```

chromium gives `chromium --headless` for screenshots. jq parses API responses.

## Run (agent path)

```bash
cd /srv/platform

# Smoke test — all services, API routes, service health
./.claude/skills/run-platform/smoke.sh

# With screenshots (written to /tmp/platform-screenshots/)
./.claude/skills/run-platform/smoke.sh --screenshot

# API only (faster, no Docker UI checks)
./.claude/skills/run-platform/smoke.sh --api-only

# Custom screenshot output directory
SCREENSHOT_DIR=/root/.claude/jobs/$JOBID/screenshots ./.claude/skills/run-platform/smoke.sh --screenshot
```

## Interact with the API directly

Get the API container IP first (changes on every `up`):

```bash
API_IP=$(docker inspect platform-api-1 \
  --format '{{(index .NetworkSettings.Networks "platform").IPAddress}}')
```

Key routes:

```bash
# Bootstrap state (should be READY on a live system)
curl -s http://${API_IP}:3001/bootstrap/state | jq '{state,isReady}'

# Admin users list — ADMIN_GROUP is 'platform-admins' (not 'admin')
source /srv/platform/.env
curl -s http://${API_IP}:3001/admin/users \
  -H "x-internal-secret: ${INTERNAL_API_SECRET}" \
  -H "x-authentik-groups: platform-admins" | jq '.users[].username'

# LDAP custom attributes for a user (Priority 1)
curl -s http://${API_IP}:3001/admin/users/alice/attributes \
  -H "x-internal-secret: ${INTERNAL_API_SECRET}" \
  -H "x-authentik-groups: platform-admins"

# Paperless post-consume webhook (triggers doc-classify BullMQ job, Priority 3)
curl -s -X POST http://${API_IP}:3001/documents/consumed \
  -H "Content-Type: application/json" \
  -d '{"documentId":123,"owner":"alice","title":"Factuur Eneco"}'

# Trigger user onboarding (Authentik user pk)
curl -s -X POST \
  "http://${API_IP}:3001/webhook/authentik?token=${AUTHENTIK_WEBHOOK_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"event":{"action":"model_created","context":{"model":{"model_name":"user","pk":7}}}}'

# SSE bootstrap events stream
curl -s http://${API_IP}:3001/bootstrap/events
```

Via Traefik HTTPS (also works, adds TLS overhead):
```bash
source /srv/platform/.env
curl -s https://portal.${PRIMARY_DOMAIN}/api/bootstrap/state | jq '{state,isReady}'
```

## Take a screenshot of a web UI

```bash
source /srv/platform/.env

chromium --headless --no-sandbox --disable-gpu \
  --screenshot=/tmp/portal.png --window-size=1280,800 \
  "https://portal.${PRIMARY_DOMAIN}" 2>/dev/null

# Other UIs:
#   https://auth.${PRIMARY_DOMAIN}        — Authentik SSO (same loading screen as portal)
#   https://docs.${PRIMARY_DOMAIN}        — Paperless-ngx native login + CollaBrains OIDC button
#   https://mail.cbrains.de               — Mailcow (external, mailcow-network)
```

## Deploy worktree changes to running containers

Changes developed in `.claude/worktrees/*/api` are not live until rebuilt:

```bash
cd /srv/platform

# Rebuild and restart the API (picks up worktree-merged changes)
docker compose build api && docker compose up -d api

# Rebuild portal
docker compose build portal && docker compose up -d portal

# Rebuild signal-bot (Priority 2 new service)
docker compose build signal-bot && docker compose up -d signal-bot

# Check logs after restart
docker compose logs --tail=50 api
```

## Run (human path)

```bash
cd /srv/platform
docker compose up -d          # start all services
docker compose ps             # check status
docker compose logs -f api    # stream API logs
docker compose down           # stop
```

## Gotchas

- **`GET /` returns 404** — no root route on the API; use `/bootstrap/state` to verify it's alive.
- **Container IPs change on every `docker compose up`** — always use `docker inspect` to get the current IP; never hardcode it.
- **`chromium --headless` needs `--no-sandbox`** — runs as root inside the container; omitting it causes a silent crash.
- **Portal and auth screenshots show the CollaBrains Authentik loading screen** — both `portal.cbrains.de` and `auth.cbrains.de` redirect to Authentik forward-auth before rendering content; the "Loading…" spinner is correct behavior.
- **Paperless screenshot shows native login with "CollaBrains" OIDC button** — Paperless renders its own login page (`Please sign in.`) with a single SSO button that redirects to Authentik. It is NOT a blank Authentik page; the Paperless logo and button are visible.
- **Admin API requires `x-authentik-groups: platform-admins`** — the group name is `platform-admins` (hyphen, lowercase). Using `admin` or `platform Admins` returns 403. The header value is set by Traefik/Authentik in production; inject it manually in curl calls.
- **`signal-bot` container may be missing** — it is a new service (Priority 2) that only runs after `docker compose build signal-bot && docker compose up -d signal-bot`. smoke.sh reports `[--] not deployed yet` rather than FAIL when it's absent.
- **New API endpoints (LDAP attributes, archive tree, signal webhook) are only live after rebuilding the API container** — they live in the worktree branch and need `docker compose build api && docker compose up -d api` to appear.
- **`((PASS++))` in bash with `set -e` exits when value is 0** — use `PASS=$((PASS+1))` instead; `((expr))` returns exit code 1 when the result is 0.
- **Mailcow API must be called over HTTPS** — `http://nginx-mailcow:8080/api/v1/edit/admin` redirects; use `https://mail.cbrains.de/api/v1/edit/admin` with header `X-API-Key`.
- **Paperless REST API has no exact field filter** — `?username=x` does partial search matching; fetch with `?search=x&page_size=100` and filter client-side.
- **Paperless `POST /api/workflows/` needs full nested objects** — passing `{"triggers": [id]}` returns `"Expected a dictionary, but got int."`; pass the full trigger/action objects from their POST responses.

## Troubleshooting

**`curl: (7) Failed to connect`** — API container IP changed; re-run `docker inspect` to get the new one.

**`jq: command not found`** — `apt-get install -y jq`

**`chromium: error while loading shared libraries`** — `apt-get install -y chromium` (installs deps too).

**`E: Could not get lock /var/lib/dpkg/lock-frontend`** — another apt process running; `until ! pgrep apt-get; do sleep 2; done` then retry.

**API returns `{"state":"UNINITIALIZED"}`** — bootstrap hasn't run yet; `POST /bootstrap/start` with the full config DTO, or check `.env` for missing vars that trigger auto-start.

**`GET /admin/users` returns 403** — the `x-authentik-groups` header must contain exactly `platform-admins`; any other value is rejected by `RolesGuard`.

**User polling loop not onboarding** — new user's consume dir may already exist (pre-created by a script), bypassing detection; trigger manually via webhook POST above.

**New endpoints return 404 after worktree changes** — the running API container uses the last built image. Run `docker compose build api && docker compose up -d api` to deploy worktree changes.
