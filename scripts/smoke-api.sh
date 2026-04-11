#!/bin/sh
# Smoke test — verifies apps/app proxy to apps/api works end-to-end.
#
# Checks:
#   1. GET /api/health returns 200 (middleware injected the key, rewrite reached Fastify, auth passed)
#   2. Response body contains {"status":"ok"}
#
# Usage:
#   scripts/smoke-api.sh                          # default: http://localhost:3000
#   scripts/smoke-api.sh https://app.brighttale.io
set -e

BASE_URL="${1:-http://localhost:3000}"
ENDPOINT="${BASE_URL}/api/health"

echo "[smoke] GET ${ENDPOINT}"
response=$(curl -sS -w '\n%{http_code}' "${ENDPOINT}")
body=$(printf '%s\n' "$response" | sed '$d')
status=$(printf '%s\n' "$response" | tail -n1)

if [ "$status" != "200" ]; then
  echo "[smoke] FAIL: expected 200, got $status"
  echo "[smoke] body: $body"
  exit 1
fi

if ! printf '%s' "$body" | grep -q '"status":"ok"'; then
  echo "[smoke] FAIL: response missing {\"status\":\"ok\"}"
  echo "[smoke] body: $body"
  exit 1
fi

echo "[smoke] OK"
