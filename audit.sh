#!/bin/bash

echo "=============================="
echo "🧠 CLEAN ARCHITECTURE AUDIT v2"
echo "=============================="

echo ""
echo "🔎 1. SERVICE LAYER CLASSIFICATION"
echo "-----------------------------------"

docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | while read line; do
  echo "$line" | grep -E "mailcow|authentik|caddy|paperless|immich|signal|ollama|redis|postgres"
done

echo ""
echo "🔎 2. ARCHITECTURE BOUNDARY CHECK"
echo "-----------------------------------"

echo "[INFRA LAYER]"
docker ps --format "{{.Names}}" | grep -E "caddy|traefik|nginx" || echo "OK"

echo "[IDENTITY LAYER]"
docker ps --format "{{.Names}}" | grep -E "authentik|keycloak|oauth" || echo "OK"

echo "[COMMUNICATION LAYER]"
docker ps --format "{{.Names}}" | grep -E "mailcow|postfix|dovecot|signal" || echo "OK"

echo "[APP LAYER]"
docker ps --format "{{.Names}}" | grep -E "paperless|immich|portal|api|signal-consumer" || echo "OK"

echo ""
echo "🔎 3. CROSS-CONNECTIVITY ANALYSIS"
echo "-----------------------------------"

docker network ls --format "{{.Name}}" | while read net; do
  echo "--- Network: $net ---"
  docker network inspect "$net" 2>/dev/null | grep -E "Name|IPv4Address" | head -20
done

echo ""
echo "🔎 4. PORT EXPOSURE CLEANLINESS"
echo "-----------------------------------"

ss -tulpn | awk '{print $4}' | sort | uniq -c | sort -nr

echo ""
echo "🔎 5. SECRET EXPOSURE CHECK"
echo "-----------------------------------"

docker inspect $(docker ps -q) 2>/dev/null | \
grep -iE "password|secret|token|key" | \
grep -v "null" | head -50

echo ""
echo "🔎 6. IMAGE VERSION DRIFT"
echo "-----------------------------------"

docker images --format "{{.Repository}}:{{.Tag}}" | sort | uniq -c | sort -nr | head -30

echo ""
echo "🔎 7. ORPHAN / ZOMBIE DETECTION"
echo "-----------------------------------"

docker ps -a --filter "status=exited" --format "{{.Names}} {{.Status}}"

echo ""
echo "🔎 8. NETWORK SEGMENTATION CHECK"
echo "-----------------------------------"

for net in $(docker network ls --format "{{.Name}}"); do
  COUNT=$(docker network inspect $net | grep -c "Name")
  echo "$net -> $COUNT containers"
done

echo ""
echo "=============================="
echo "✔ CLEAN ARCH AUDIT COMPLETE"
echo "=============================="
