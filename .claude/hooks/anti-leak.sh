#!/usr/bin/env bash
# ============================================================================
# anti-leak.sh — PreToolUse hook, Claude Code
# ============================================================================
# Purpose: prevent accidental secret leakage and writes to sensitive paths.
#
# Stdin format (from Claude Code): JSON with fields
#   { "tool_name": "Write|Edit|Bash|...", "tool_input": {...} }
#
# Exit codes:
#   0 — allow the tool call to proceed
#   2 — block with the reason printed to stderr
#   other — treated as error, tool call is NOT blocked (fail-open to avoid
#           accidental lockout; intentional).
#
# Scope:
#   • Block Write/Edit targeting any file that is a secret surface
#     (.env*, .prod-auth, private keys, etc.)
#   • Block Write/Edit whose file_path OR content matches live-secret
#     regexes (OpenAI, Anthropic, AWS, JWT, Supabase service role, etc.)
#   • Block Bash commands that:
#       - print env vars likely to contain secrets
#       - curl/wget to exfil-ish destinations (data: URIs, transfer.sh,
#         pastebin, webhook.site) while referencing secret-looking envs
#       - force-push to main/master
#       - recursively delete the repo root
# ============================================================================

set -Eeuo pipefail
IFS=$'\n\t'

# Read the tool-call payload from stdin. Keep a copy on disk for audit.
PAYLOAD="$(cat)"
AUDIT_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/audit"
mkdir -p "$AUDIT_DIR" 2>/dev/null || true
TS="$(date -u +%Y%m%dT%H%M%S.%N)"

block() {
  local reason="$1"
  printf '{"decision":"block","reason":%s}' "$(printf '%s' "$reason" | jq -Rs .)" >&2 2>/dev/null || printf '%s' "$reason" >&2
  printf 'BLOCKED %s\n' "$reason" >&2
  # Append to audit.
  { printf '%s %s\n' "$TS" "$reason"; printf '%s\n' "$PAYLOAD" | head -c 4000; printf '\n---\n'; } \
    >> "$AUDIT_DIR/blocked.log" 2>/dev/null || true
  exit 2
}

# jq is expected (bright-tale has it via sec tooling). Fail-open if not found
# but log so we notice.
if ! command -v jq >/dev/null 2>&1; then
  printf 'anti-leak: jq not installed, hook disabled (fail-open)\n' >&2
  exit 0
fi

TOOL="$(printf '%s' "$PAYLOAD" | jq -r '.tool_name // empty')"
INPUT_JSON="$(printf '%s' "$PAYLOAD" | jq -c '.tool_input // {}')"

# ── Helpers ────────────────────────────────────────────────────────────────
field() { printf '%s' "$INPUT_JSON" | jq -r --arg k "$1" '.[$k] // empty'; }

# Combined secret regex — any one match triggers a block.
# Patterns favor specificity to reduce false positives. The named-key
# patterns (SUPABASE_SERVICE_ROLE_KEY=, INTERNAL_API_KEY=, ENCRYPTION_SECRET=)
# require a QUOTED value so code references like `process.env.X` and
# `import.meta.env.X` don't match. Real JWT/Supabase keys are still caught
# by the generic eyJ... pattern regardless of whether they're quoted.
readonly SECRET_REGEX='(sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|sk_(live|test)_[A-Za-z0-9]{20,}|pk_(live|test)_[A-Za-z0-9]{20,}|rk_(live|test)_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----|SUPABASE_SERVICE_ROLE_KEY[[:space:]]*[=:][[:space:]]*["\x27\x60][^"\x27\x60]{20,}["\x27\x60]|INTERNAL_API_KEY[[:space:]]*[=:][[:space:]]*["\x27\x60][^"\x27\x60]{12,}["\x27\x60]|ENCRYPTION_SECRET[[:space:]]*[=:][[:space:]]*["\x27\x60][^"\x27\x60]{32,}["\x27\x60]|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{36,}|glpat-[A-Za-z0-9_-]{20,})'

# Paths that can never be written/edited by an agent call.
# Note: `.env.example` and `.env.sample` are EXPLICITLY allowed (templates
# committed to git, no real secrets) — the regex below rejects `.env`,
# `.env.local`, `.env.production`, `.env.dev`, etc. but not *.example /
# *.sample.
readonly -a PROTECTED_PATHS=(
  '\.env$'
  '\.env\.(local|prod|production|dev|development|staging|test|preview)($|\.)'
  '\.claude/security/\.prod-auth$'
  '\.claude/security/baselines/.*\.json$'
  'apps/.*\.key$'
  '.*\.pem$'
  '.*_rsa(\.pub)?$'
)

# ── Write / Edit ───────────────────────────────────────────────────────────
case "$TOOL" in
  Write|Edit|MultiEdit|NotebookEdit)
    FP="$(field file_path)"
    CONTENT="$(field content)$(field new_string)$(field old_string)"

    # 1. Protected-path check.
    for pat in "${PROTECTED_PATHS[@]}"; do
      if [[ "$FP" =~ $pat ]]; then
        block "Write/Edit blocked: $FP matches protected pattern ($pat). Ask the user to apply this change manually."
      fi
    done

    # 2. Secret-in-content check.
    if printf '%s' "$CONTENT" | grep -Eq "$SECRET_REGEX"; then
      block "Write/Edit blocked: content appears to contain a live secret (regex hit). If this is a placeholder, restructure to use an env reference."
    fi
    ;;

  Bash)
    CMD="$(field command)"

    # Block env-printing patterns that could echo secrets to tool output.
    if printf '%s' "$CMD" | grep -Eq '(^|[;&| ])(env|printenv|export)([[:space:]]|$)'; then
      if ! printf '%s' "$CMD" | grep -Eq '(^|[;&| ])(env|printenv)([[:space:]]+[A-Z_]+[[:space:]]*$|([[:space:]]*\|[[:space:]]*grep))'; then
        block "Bash blocked: \`env/printenv/export\` without a specific variable filter could dump secrets into tool output."
      fi
    fi

    # Block exfil-looking patterns: piping env/secret to external POST.
    if printf '%s' "$CMD" | grep -Eq '(curl|wget).*(transfer\.sh|webhook\.site|pastebin\.com|paste\.rs|ngrok\.io|bashupload\.com)'; then
      block "Bash blocked: outbound to suspicious host. If legitimate, run manually."
    fi

    # Block force-push to main/master.
    if printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+push.*--force.*(main|master)(\b|$)'; then
      block "Bash blocked: --force push to main/master. Never."
    fi
    if printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+push.*\+.*(main|master)(\b|$)'; then
      block "Bash blocked: refspec-force push to main/master."
    fi

    # Block rm -rf against repo root or parents.
    if printf '%s' "$CMD" | grep -Eq 'rm[[:space:]]+(-[a-zA-Z]*[rfR][a-zA-Z]*[[:space:]]+)+(/[[:space:]]|\.[[:space:]]*$|\*[[:space:]]*$|\$HOME|~)'; then
      block "Bash blocked: rm -rf against root / repo / HOME."
    fi

    # Block cat / reading known secret files. The .env reference must be a
    # direct argument to the read command, not just elsewhere in the pipeline.
    # `[^|;&\n]*` stops at the next command boundary so e.g.
    #   ls -la .env.local | head -2
    # is allowed (head's args don't include .env), while
    #   cat .env.local
    #   head -2 .env.local
    # are still blocked.
    if printf '%s' "$CMD" | grep -Eq '(^|[|;&[:space:]])(cat|less|more|head|tail|bat)[[:space:]]+[^|;&\n]*\.env(\.[a-zA-Z]+)?($|[[:space:]])'; then
      block "Bash blocked: reading .env files into tool output could leak secrets. Ask the user if they want you to read a specific variable."
    fi

    # Block skipping git hooks / bypassing signing.
    if printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+commit.*(--no-verify|--no-gpg-sign)'; then
      block "Bash blocked: --no-verify / --no-gpg-sign. Fix the underlying hook/signing issue."
    fi

    # Block network installs that pipe to shell (`curl | sh`).
    if printf '%s' "$CMD" | grep -Eq '(curl|wget)[[:space:]].*\|[[:space:]]*(sh|bash|zsh)'; then
      block "Bash blocked: curl | sh. Download, inspect, then run."
    fi
    ;;
esac

exit 0
