#!/usr/bin/env bash
# Wraps any supabase command with SUPABASE_ACCESS_TOKEN from root .env.local
# Usage: bash scripts/db-with-token.sh <supabase args...>
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$ROOT_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.local"
  set +a
fi

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN not set in .env.local" >&2
  echo "Generate one at https://supabase.com/dashboard/account/tokens" >&2
  exit 1
fi

exec supabase "$@"
