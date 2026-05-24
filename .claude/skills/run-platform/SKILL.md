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

# Trigger user onboarding (Authentik user pk)
source /srv/platform/.env
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
#   https://auth.${PRIMARY_DOMAIN}        — Authentik SSO
#   https://docs.${PRIMARY_DOMAIN}        — Paperless-ngx (redirects to Authentik)
#   https://mail.cbrains.de               — Mailcow (external, mailcow-network)
```

## Run (human path)

```bash
cd /srv/platform
docker compose up -d          # start all services
docker compose ps             # check status
docker compose logs -f api    # stream API logs
docker compose down           # stop
```

## Rebuild and restart a service

```bash
cd /srv/platform
docker compose build api && docker compose up -d api   # rebuild + restart API
docker compose build portal && docker compose up -d portal
```

## Gotchas

- **`GET /` returns 404** — no root route on the API; use `/bootstrap/state` to verify it's alive.
- **Container IPs change on every `docker compose up`** — always use `docker inspect` to get the current IP; never hardcode it.
- **`chromium --headless` needs `--no-sandbox`** — runs as root inside the container; omitting it causes a silent crash.
- **Paperless screenshots show Authentik login** — Paperless has `DISABLE_REGULAR_LOGIN=true` and redirects to Authentik OIDC; 302 is correct, not an error.
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

**User polling loop not onboarding** — new user's consume dir may already exist (pre-created by a script), bypassing detection; trigger manually via webhook POST above.
