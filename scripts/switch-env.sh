#!/usr/bin/env bash
# switch-env.sh — swap apps/api/.env.local + apps/app/.env.local between
# preset variants. Variants are full env files kept alongside the active one:
#
#   apps/api/.env.local.<variant>   →   apps/api/.env.local
#   apps/app/.env.local.<variant>   →   apps/app/.env.local
#
# Usage:
#   bash scripts/switch-env.sh local         # local Docker Supabase (default)
#   bash scripts/switch-env.sh remote-dev    # remote dev Supabase
#
# First-time setup for a variant: copy the active .env.local files into the
# variant slot, e.g.:
#   cp apps/api/.env.local apps/api/.env.local.remote-dev
#   cp apps/app/.env.local apps/app/.env.local.remote-dev
# then edit those to point at the remote project.
set -euo pipefail

VARIANT="${1:-}"
if [ -z "$VARIANT" ]; then
  echo "usage: bash scripts/switch-env.sh <local|remote-dev|...>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS=(api app)

missing=0
for app in "${APPS[@]}"; do
  src="$ROOT/apps/$app/.env.local.$VARIANT"
  if [ ! -f "$src" ]; then
    echo "missing: $src" >&2
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  echo "" >&2
  echo "Bootstrap with: cp apps/<app>/.env.local apps/<app>/.env.local.$VARIANT" >&2
  exit 1
fi

for app in "${APPS[@]}"; do
  src="$ROOT/apps/$app/.env.local.$VARIANT"
  dst="$ROOT/apps/$app/.env.local"
  cp "$src" "$dst"
  echo "✓ apps/$app/.env.local ← .env.local.$VARIANT"
done

echo ""
echo "Switched env to '$VARIANT'. Restart dev servers to pick up the change."
