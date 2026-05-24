#!/usr/bin/env bash
# Platform smoke test / interaction driver.
# Must be run from /srv/platform (or pass PLATFORM_DIR=<path>).
# Usage: ./smoke.sh [--screenshot] [--api-only]

set -euo pipefail

DIR="${PLATFORM_DIR:-$(cd "$(dirname "$0")/../../.." && pwd)}"
cd "$DIR"

source .env

API_IP=$(docker inspect platform-api-1 --format '{{(index .NetworkSettings.Networks "platform").IPAddress}}' 2>/dev/null)
PORTAL_IP=$(docker inspect platform-portal-1 --format '{{(index .NetworkSettings.Networks "platform").IPAddress}}' 2>/dev/null)
PAPERLESS_IP=$(docker inspect platform-paperless-1 --format '{{(index .NetworkSettings.Networks "platform").IPAddress}}' 2>/dev/null)
AUTH_IP=$(docker inspect platform-authentik-server-1 --format '{{(index .NetworkSettings.Networks "platform").IPAddress}}' 2>/dev/null)

SCREENSHOTS=false
API_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --screenshot) SCREENSHOTS=true ;;
    --api-only)   API_ONLY=true ;;
  esac
done

PASS=0; FAIL=0
ok()   { echo "  [OK]  $*"; PASS=$((PASS+1)); }
fail() { echo "  [FAIL] $*"; FAIL=$((FAIL+1)); }

echo ""
echo "=== Platform Smoke Test ==="
echo ""

# --- Docker service health ---
echo "-- Service health --"
for svc in db api portal authentik-server paperless; do
  STATUS=$(docker inspect "platform-${svc}-1" --format '{{.State.Status}}' 2>/dev/null || echo "missing")
  HEALTH=$(docker inspect "platform-${svc}-1" --format '{{.State.Health.Status}}' 2>/dev/null || echo "")
  LABEL="${svc}"
  [ -n "$HEALTH" ] && LABEL="${svc} ($HEALTH)"
  if [ "$STATUS" = "running" ]; then ok "$LABEL: running"; else fail "$LABEL: $STATUS"; fi
done

# --- API routes ---
echo ""
echo "-- API routes (direct) --"

# GET /bootstrap/state
STATE=$(curl -sf --max-time 5 "http://${API_IP}:3001/bootstrap/state" | jq -r '.state' 2>/dev/null || echo "error")
if [ "$STATE" = "READY" ]; then ok "GET /bootstrap/state → READY"
else fail "GET /bootstrap/state → $STATE"; fi

# Webhook auth rejection
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
  -X POST "http://${API_IP}:3001/webhook/authentik?token=wrong" \
  -H "Content-Type: application/json" -d '{}')
if [ "$CODE" = "401" ]; then ok "POST /webhook/authentik bad token → 401"
else fail "POST /webhook/authentik bad token → HTTP $CODE (expected 401)"; fi

if ! $API_ONLY; then
  # --- Portal ---
  echo ""
  echo "-- Portal --"
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://${PORTAL_IP}:3000/")
  if [ "$CODE" = "200" ]; then ok "Portal HTTP $CODE"
  else fail "Portal HTTP $CODE (expected 200)"; fi

  # --- Authentik ---
  echo ""
  echo "-- Authentik --"
  AUTH_HEALTH=$(docker inspect platform-authentik-server-1 --format '{{.State.Health.Status}}' 2>/dev/null)
  if [ "$AUTH_HEALTH" = "healthy" ]; then ok "authentik-server: healthy"
  else fail "authentik-server: $AUTH_HEALTH"; fi

  # --- Paperless ---
  echo ""
  echo "-- Paperless --"
  PL_HEALTH=$(docker inspect platform-paperless-1 --format '{{.State.Health.Status}}' 2>/dev/null)
  if [ "$PL_HEALTH" = "healthy" ]; then ok "paperless: healthy"
  else fail "paperless: $PL_HEALTH"; fi

  # Quick HTTP check through its port
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://${PAPERLESS_IP}:8000/")
  [ "$CODE" = "200" ] || [ "$CODE" = "302" ] && ok "paperless HTTP $CODE" || fail "paperless HTTP $CODE"
fi

# --- Screenshots ---
if $SCREENSHOTS; then
  echo ""
  echo "-- Screenshots --"
  SS_DIR="${SCREENSHOT_DIR:-/tmp/platform-screenshots}"
  mkdir -p "$SS_DIR"

  for target in "portal:https://portal.${PRIMARY_DOMAIN}" "auth:https://auth.${PRIMARY_DOMAIN}" "docs:https://docs.${PRIMARY_DOMAIN}"; do
    name="${target%%:*}"
    url="${target#*:}"
    OUT="$SS_DIR/${name}.png"
    chromium --headless --no-sandbox --disable-gpu \
      --screenshot="$OUT" --window-size=1280,800 "$url" 2>/dev/null
    if [ -f "$OUT" ] && [ -s "$OUT" ]; then ok "screenshot → $OUT"
    else fail "screenshot failed for $url"; fi
  done
fi

# --- Summary ---
echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
