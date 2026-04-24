#!/usr/bin/env bash
# ============================================================================
# install-tools.sh — install the scanner toolchain on macOS via Homebrew
# ============================================================================
# Installs (or reports) the binaries used by scripts/sec/run-pentest.sh.
# Safe to re-run: skips anything already present.
#
# Authorized by the repository owner on 2026-04-23 for local pentest tooling.
# Does not modify PATH, does not download third-party binaries outside brew.
# ============================================================================

set -Eeuo pipefail
IFS=$'\n\t'

# Lock PATH to known-safe dirs for the duration of this script.
# Prevents PATH-hijack attacks where a malicious `brew` binary earlier in
# PATH could be invoked by accident.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

readonly TOOLS_REQUIRED=(
  # name             formula            reason
  "httpx"           "httpx"            # ProjectDiscovery httpx — baseline probe
  "nuclei"          "nuclei"           # CVE + misconfig templates
  "nikto"           "nikto"            # web server misconfigs
  "sslscan"         "sslscan"          # TLS posture
  "subfinder"       "subfinder"        # passive subdomain discovery
  "dnsx"            "dnsx"             # DNS resolution / dangling CNAMEs
  "gitleaks"        "gitleaks"         # secrets in current tree
  "trufflehog"      "trufflesecurity/trufflehog/trufflehog"  # secrets in git history
  "jq"              "jq"               # JSON wrangling in run-pentest.sh
)

readonly OPTIONAL_TOOLS=(
  "testssl.sh"      "testssl"          # alternate TLS auditor
)

log()  { printf '\033[1;36m[sec-install]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m[sec-install]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[sec-install]\033[0m %s\n' "$*" >&2; exit 1; }

# ── Pre-flight ────────────────────────────────────────────────────────────
if ! command -v brew >/dev/null 2>&1; then
  die "Homebrew not found. Install from https://brew.sh then re-run."
fi

log "using brew at: $(command -v brew)"

# Verify brew is from a normal install location — no supply-chain weirdness.
BREW_PATH="$(command -v brew)"
case "$BREW_PATH" in
  /opt/homebrew/bin/brew|/usr/local/bin/brew) ;;
  *) warn "brew at an unusual path: $BREW_PATH — continue only if this is intended." ;;
esac

# ── OWASP ZAP via Docker ──────────────────────────────────────────────────
# ZAP ships as a large Java app; Docker is cleaner than brew cask.
check_zap_docker() {
  if command -v docker >/dev/null 2>&1; then
    if docker image inspect ghcr.io/zaproxy/zaproxy:stable >/dev/null 2>&1; then
      log "zap-baseline: image present (ghcr.io/zaproxy/zaproxy:stable)"
    else
      log "zap-baseline: pulling ghcr.io/zaproxy/zaproxy:stable (≈1.2 GB, first time)"
      docker pull ghcr.io/zaproxy/zaproxy:stable
    fi
  else
    warn "docker not found — zap-baseline will be skipped in pentests. Install Docker Desktop if you want it."
  fi
}

# ── Install one tool ──────────────────────────────────────────────────────
install_one() {
  local bin="$1" formula="$2"
  if command -v "$bin" >/dev/null 2>&1; then
    log "✓ $bin already installed ($(command -v "$bin"))"
    return 0
  fi
  log "→ installing $formula"
  if ! brew install "$formula"; then
    warn "failed to install $formula — continuing with remaining tools"
    return 1
  fi
  log "✓ $bin installed"
}

# ── Run installs ──────────────────────────────────────────────────────────
failures=0
# shellcheck disable=SC2068
for ((i=0; i<${#TOOLS_REQUIRED[@]}; i+=2)); do
  bin="${TOOLS_REQUIRED[$i]}"
  formula="${TOOLS_REQUIRED[$((i+1))]}"
  install_one "$bin" "$formula" || failures=$((failures+1))
done

for ((i=0; i<${#OPTIONAL_TOOLS[@]}; i+=2)); do
  bin="${OPTIONAL_TOOLS[$i]}"
  formula="${OPTIONAL_TOOLS[$((i+1))]}"
  install_one "$bin" "$formula" || warn "optional $formula skipped"
done

check_zap_docker || true

# ── Post-install: update nuclei templates ─────────────────────────────────
if command -v nuclei >/dev/null 2>&1; then
  log "→ updating nuclei templates"
  nuclei -ut -silent 2>&1 | tail -n 5 || warn "nuclei template update failed — run \`nuclei -ut\` manually"
fi

# ── Summary ───────────────────────────────────────────────────────────────
log "done. failures=$failures"
if (( failures > 0 )); then
  exit 3
fi
