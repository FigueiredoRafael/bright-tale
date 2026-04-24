# BrightSec authorized-test-traffic bypass

Industry-standard HMAC-signed bypass for running the pentest against a
live app without the defenses blocking legitimate probes.

## TL;DR

```bash
# 1. Generate a key (once, per environment tier)
openssl rand -hex 32          # copy output

# 2. Server side — set env var in apps/web
#    dev:       apps/web/.env.local
#    staging:   Vercel preview env
#    production: DO NOT SET — production hard-disables bypass regardless
BRIGHTSEC_BYPASS_HMAC_KEY=<the hex>

# 3. Probe side — export the SAME value in the shell that runs pentest
export BRIGHTSEC_BYPASS_HMAC_KEY=<the hex>
npx tsx scripts/sec/playwright/pentest.ts
```

## How it works (30 seconds)

1. Probe signs `${timestamp}.${nonce}.${path}` with HMAC-SHA256 using the
   shared key.
2. Sends header `X-BrightSec-Auth: <ts>.<nonce>.<hmac>`.
3. Middleware verifies:
   - Timestamp is within ±60 s (replay window).
   - Nonce not already seen in that window.
   - HMAC matches.
4. If valid → rate limit + Turnstile (when added) are skipped.
5. If any check fails → defenses apply normally, zero partial-pass leak.

## Why HMAC signed, not a plain token

| Threat | Plain token | HMAC signed |
|---|---|---|
| Token leaks in Vercel logs | attacker reuses it forever | stops working in 60 s |
| Shoulder-surfed in a demo | same | same (short TTL) |
| Hooked via compromised devtools extension | replays freely | fails replay check |
| Committed to git by accident | live until rotated | live but path-bound, short-lived |

The HMAC adds tiny complexity (one function each side) and eliminates
every replay-class attack. It's the same pattern AWS SigV4 and Cloudflare
Access signed requests use.

## Hard limits

- **Production:** bypass is **hard-disabled** in code. Even a valid HMAC
  is ignored when `NODE_ENV === 'production'`. You cannot turn it on in
  prod without shipping code that removes the check, which is an
  explicit, review-able change.
- **Staging (Vercel preview):** same as dev. If you set the env var, the
  bypass works. Recommended only for the preview branch that QA uses as
  a pentest target.
- **Dev:** works when env var is set on both server and probe.

## Which probes use the bypass

Every probe except `rate-limit.ts` automatically signs and sends the
header. The rate-limit probe **deliberately does not** — its job is to
verify the limiter fires, so it must be blocked when the budget is
exceeded.

Probe behavior matrix:

| Probe | With bypass | Without bypass |
|---|---|---|
| `headers.ts`, `cookies.ts`, `info-disclosure.ts`, `open-redirect.ts`, `xss-reflected.ts`, `host-header.ts`, `error-leakage.ts`, `csrf.ts`, `api-direct.ts`, `admin.ts`, `agent-prompts.ts` | Runs cleanly. If bypass is absent, probe still works because it sends few requests per target. | Same — these probes do not approach rate-limit budgets. |
| `auth-enumeration.ts` | Same. 60 timed requests fits under ceiling. | Same — but may flake if bucket from prior run is near-full. |
| `rate-limit.ts` | **Skips bypass.** Must hit the limit to validate. | Same — always without bypass. |

## Rotation

Rotate the key when:
- Any team member with access leaves.
- A probe run was captured in shared logs (Axiom, Sentry, Slack).
- Quarterly as preventive hygiene.

After rotation: the new value must go into the server env AND the shell
where you run pentest. Old probes immediately stop working (signatures
fail).

## Auditing

Every bypass use is logged by the middleware at info level with the
nonce (for forensic trace) and without any other request detail. Review
`axiom` logs filtered by `path:/admin/login` and
`x-brightsec-auth=present` quarterly — you should see only your own
test-run nonces.
