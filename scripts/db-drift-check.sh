#!/usr/bin/env bash
# ============================================================================
# db-drift-check.sh — warn when supabase/migrations/ is out of sync
# ============================================================================
# Runs as a `predev` hook so every `npm run dev` surfaces drift BEFORE it
# turns into a surprise the next time someone pushes. Non-blocking by
# design — prints a warning, exits 0, lets dev proceed.
#
# Drift cases it catches:
#   • Remote has migrations local doesn't (someone pushed direct, like the
#     Thiago affiliate flow that bit us on 2026-04-24)
#   • Local has migrations remote hasn't seen yet (forgot to `db:push:dev`)
# ============================================================================

set -u
IFS=$'\n\t'

# Skip in CI, non-interactive shells, or without a token (offline dev).
if [ -n "${CI:-}" ] || [ -n "${SKIP_DB_DRIFT:-}" ]; then exit 0; fi
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && [ ! -f .env.local ]; then exit 0; fi

# If the supabase CLI is missing entirely, skip silently.
if ! command -v supabase >/dev/null 2>&1; then exit 0; fi

# Delegate to the token-forwarding wrapper so we don't re-implement auth.
WRAPPER=scripts/db-with-token.sh
[ -x "$WRAPPER" ] || exit 0

# Cap wall time so a slow network doesn't block `npm run dev` by more than
# a few seconds. On macOS `timeout` comes from coreutils (brew) OR we fall
# back to a perl alarm.
run_with_timeout() {
  local secs=$1; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "${secs}s" "$@" 2>/dev/null
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "${secs}s" "$@" 2>/dev/null
  else
    perl -e 'alarm shift; exec @ARGV' "$secs" "$@" 2>/dev/null
  fi
}

OUTPUT=$(run_with_timeout 6 bash "$WRAPPER" migration list --linked 2>/dev/null || true)

# If the CLI couldn't reach the linked project or isn't linked, don't nag.
if [ -z "$OUTPUT" ] || echo "$OUTPUT" | grep -qi "not linked\|no project"; then
  exit 0
fi

# `supabase migration list` outputs a pipe-separated table:
#   LOCAL        | REMOTE       | TIME
#   20260420…    | 20260420…    | …
#   20260422…    |              | …     ← local-only (we didn't push yet)
#                | 20260423…    | …     ← remote-only (someone pushed direct)
#
# Skip header rows, then tally lopsided rows.
DRIFT=$(echo "$OUTPUT" | awk -F'|' '
  BEGIN { remote_only=0; local_only=0 }
  NR <= 3 { next }                                 # skip header + divider
  {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1)    # trim
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
    if ($1 == "" && $2 ~ /^[0-9]{14}$/) remote_only++
    if ($2 == "" && $1 ~ /^[0-9]{14}$/) local_only++
  }
  END { printf "%d %d", remote_only, local_only }
')

REMOTE_ONLY=$(echo "$DRIFT" | awk '{print $1}')
LOCAL_ONLY=$(echo "$DRIFT"  | awk '{print $2}')

if [ "${REMOTE_ONLY:-0}" -gt 0 ] || [ "${LOCAL_ONLY:-0}" -gt 0 ]; then
  printf '\n\033[33m⚠  Supabase migration drift detected\033[0m\n'
  if [ "${REMOTE_ONLY:-0}" -gt 0 ]; then
    printf '   \033[31m▸ Remote dev has %d migration(s) NOT in supabase/migrations/\033[0m\n' "$REMOTE_ONLY"
    printf '     Someone pushed direct to the remote without committing the .sql.\n'
    printf '     Ask them to commit, `git pull`, then you can push new migrations.\n'
  fi
  if [ "${LOCAL_ONLY:-0}" -gt 0 ]; then
    printf '   \033[34m▸ Local has %d migration(s) NOT applied on remote dev\033[0m\n' "$LOCAL_ONLY"
    printf '     Run `npm run db:push:dev` to apply.\n'
  fi
  printf '   Inspect with: \033[36mnpm run db:diff\033[0m  (non-blocking — dev will start)\n\n'
fi

exit 0
