# SEC-002 — Admin panel hardening (higher priority than SEC-001)

**Status:** draft · **Owner:** Rafael · **Created:** 2026-04-23
**Priority:** critical — ship before any public product launch

## Why this is SEC-002 and above SEC-001

The admin panel at `/admin` (mapped internally to `/zadmin`) controls:
users, orgs, agent prompts, engine logs, affiliates, **payouts**. A single
compromised admin credential grants full tenant takeover, financial fraud
via affiliates/payouts, and visibility into every customer's data.

User login (SEC-001) is the second-highest target. Admin (SEC-002) is first.

Current state (confirmed by source review 2026-04-23):
- Admin login is **password-only**. No MFA/TOTP/WebAuthn. Grep for
  mfa/totp/aal2/factor in `apps/web` + `apps/api` returns zero matches
  outside Stripe and test files.
- Admin JWT lifetime is the Supabase default (typically 1 hour).
- Admin slug default `/admin` is the worst-case for obscurity.
- No rate limit observed on `/admin/login` under 20 rapid POSTs.

Three of the above are HIGH/CRITICAL findings in the pentest report.

## Outcome

After this card ships, an attacker who intercepts an admin password still
cannot:
- Log in without also possessing the TOTP factor or a recovery code.
- Hold a session longer than 15 minutes before re-authenticating.
- Access a `/admin/(protected)` route at AAL1 — the middleware will force
  a step-up to AAL2.
- Use a stolen refresh token twice (rotation + reuse-detection).
- Persist a session across logout.
- Brute-force the login endpoint (3 attempts / identity / 15 min hard cap).

## Changes (ordered)

### 1. TOTP MFA enforced on every admin account (blocking)

- Enroll every existing admin in TOTP via the Supabase MFA APIs
  (`supabase.auth.mfa.enroll({ factorType: "totp" })`).
- Issue recovery codes (Argon2id-hashed, stored in
  `user_mfa_recovery_codes` — see `docs/security/proposed-migrations/20260423120000_mfa_enrolment.sql`).
- Admin login flow:
  1. `signInWithPassword` → returns session at AAL1.
  2. Client detects `aal === "aal1"` + presence of enrolled factor → shows
     TOTP input.
  3. `mfa.challenge()` → `mfa.verify({ code })` → session is promoted to
     AAL2.
- If an admin has no factor, first-time login redirects to
  `/admin/setup-mfa` and the session stays AAL1 until enrollment completes.

### 2. AAL2 gate in `apps/web/src/middleware.ts`

After `isAdminUser(supabase, user.id)`:

```ts
const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
if (aal?.currentLevel !== "aal2") {
  return NextResponse.redirect(new URL(adminPath("/mfa"), request.url));
}
```

Every `/admin/(protected)/*` request is gated. No exceptions.

### 3. Short JWT lifetime

- Supabase project → Authentication → Settings → JWT expiry = **900s (15 min)**.
- Refresh-token rotation: **on**. Reuse detection: **on** (sign out all
  sessions on replay).
- Session cookie (`sb-*-auth-token`): rotate on login (Supabase does this);
  also explicitly rotate on MFA promotion (AAL1→AAL2) to avoid carrying
  pre-MFA state into the authenticated session.

### 4. Admin slug is not the default

- `NEXT_PUBLIC_ADMIN_SLUG` must be set to an unguessable string
  (≥ 16 chars, URL-safe random, e.g. `1c9d2d54-admin`). Scanner-generated
  traffic will never reach `/admin`.
- `/admin` returns 404 when slug != "admin". Rotate the slug after any
  incident.

### 5. Rate limit on admin login (3 attempts / 15 min / identity)

- Adopt the same three-axis limit from SEC-001 but stricter on the identity
  axis. 3 fails → Turnstile. 5 fails → 30 min lock, email-unlock.
- Log every attempt in `auth_audit_log` with `event=admin_login_*`.

### 6. IP allowlist (optional but recommended)

- Vercel firewall or Cloudflare rule: `/admin/*` only serves from an
  allowlisted set of IP ranges (home IP, office IP, VPN egress).
- Not a primary control — IPs change and the admin works remotely — but
  when enabled, raises the attacker cost from "phish once" to "phish + VPN
  pivot".

### 7. Session telemetry + anomaly hooks

- Every admin login event writes to `auth_audit_log` with `ip_hash` +
  `ua_hash`. Compute per-admin baseline for (city, ASN, UA-family).
- Alert (email + Slack) on any admin login from a new city+ASN combination
  or a new UA-family.
- Expose a panel under `/admin/(protected)/security` where the admin sees
  their own recent sessions and can revoke any with one click.

### 8. Cache-Control: no-store on every admin response

- `apps/web/src/middleware.ts` sets `Cache-Control: no-store, must-revalidate`
  on every `/admin/*` response.
- Prevents intermediary or browser cache from retaining admin content.

### 9. Logout hardening

- `/admin/logout` becomes POST-only (currently unknown method handling).
- Logout invalidates the refresh token server-side AND adds the access
  token's JTI to a 24h Postgres blacklist that middleware consults.
- Cookie is set to expired AND overwritten with a random value so a
  network-level replay fails.

### 10. (Stretch) WebAuthn passkey as second factor

- Follow-up after TOTP ships: add WebAuthn (platform authenticator +
  cross-platform key) as an optional factor, displace TOTP as the default
  for admin. TOTP stays as fallback.

## Non-goals

- Not migrating admin to a different subdomain (e.g. `admin.brighttale.io`)
  — worth doing eventually for cookie isolation, but out of scope for this
  card to keep the change surface small.
- Not building a full SIEM — alerts go to email/Slack for now.

## Test plan

- Unit: AAL2 middleware check, recovery-code Argon2id helpers, admin
  rate-limit adapter, slug resolver.
- Integration: full login flow (password → TOTP → AAL2 session), refresh
  rotation, logout revocation, reuse detection.
- Security (regressions tracked by the pentest baseline):
  - `/sec-pentest http://localhost:3002` — admin section: the three
    currently-HIGH/CRITICAL findings (no MFA, no rate limit, default slug)
    must all turn into `fixed` in the baseline diff.
  - `BRIGHTSEC_ADMIN_EMAIL/PASSWORD` run — the authenticated probe must no
    longer report AAL1 sessions after password-only login.
- Manual: log in, wait 16 min, attempt any `/admin/(protected)` action →
  session must re-challenge.
- Recovery: verify the recovery-code flow (enroll, consume one code,
  confirm single-use).

## Estimated effort

8–13 points. Breakdown:
- MFA enrollment UI + challenge flow (3–5)
- AAL2 middleware gate (1)
- Recovery codes backend (migration already drafted; handler + tests) (2)
- Short-JWT + refresh rotation config + refactors (1)
- Admin rate limit + Turnstile (2)
- Audit log wiring (1)
- Slug rotation helper + doc (0.5)

## References

- Supabase MFA docs: https://supabase.com/docs/guides/auth/auth-mfa
- OWASP ASVS V2.8 (MFA), V3.3 (session expiry / rotation)
- NIST SP 800-63B §5.1.5 (replay resistance), §6.1.2 (AAL2)
- RFC 6238 (TOTP), RFC 8628 (device code — for admin emergency flows)
- RFC 8725 (JWT BCP) — §3.3, §3.4 short lifetime + rotation
