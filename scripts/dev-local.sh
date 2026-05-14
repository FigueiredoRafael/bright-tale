#!/usr/bin/env bash
# dev-local.sh — starts local Supabase if not running, then starts dev servers.
# Usage: npm run dev:local
set -euo pipefail

# Check if local Supabase is already running
if supabase status 2>/dev/null | grep -q "local development setup is running"; then
  echo "✅ Supabase local already running — skipping db:start"
else
  echo "🐳 Starting Supabase local (this may take a minute on first run)..."
  npm run db:start
  echo "✅ Supabase local ready"
fi

echo "🚀 Starting dev servers..."
exec npm run dev
