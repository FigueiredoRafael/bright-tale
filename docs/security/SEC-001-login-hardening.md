# SEC-001 — Login hardening

**Status:** draft · **Owner:** Rafael · **Created:** 2026-04-23

## Why

The login flow is the single highest-value attack surface we expose to the
internet. Today it has none of the controls below. This card brings the flow
to **ASVS Level 3** for the authentication chapter (V2 / V3) — the highest
verification level OWASP defines for critical applications.

## Outcome

After this card ships:

- An attacker cannot tell from the login response whether an email exists.
- An attacker cannot measure timing to tell whether a password check ran.
- An attacker cannot brute-force passwords against a single account (rate
  limit), distribute against many accounts (per-IP limit), or rotate IPs
  (Turnstile + velocity check).
- Users cannot set passwords known to be breached (HIBP) or trivially weak
  (zxcvbn < 3).
- Stolen session cookies cannot be used from another device for sensitive
  operations (MFA gate on change-password, change-email, API-key rotation).
- Every authentication decision lands in `user_mfa_audit_log` / a new
  `auth_audit_log`, appendable only.

## Changes

### 1. Response unification
Login endpoint returns the **same body + status code** for:
- email does not exist
- password incorrect
- MFA required
- MFA incorrect
- account locked

Single message: `"Invalid credentials"` + HTTP 401. The client branches on an
opaque `next_step` field set only after successful first-factor:
`"mfa_required" | "ok"`.

### 2. Constant-time comparison + jitter
- Password check always runs, even when the user does not exist. Compare
  against a fixed dummy Argon2id hash so total work is identical.
- After the check, pad to a deterministic floor of `400ms + uniform(0,100ms)`
  using `await new Promise(r => setTimeout(r, floor - elapsed + jitter))`.
- Use `crypto.timingSafeEqual` for any token compare elsewhere in the chain.

**Acceptance test**: 200 trials × (valid-email, invalid-email) with same
password. Mean Δ < 15ms, two-sample t-test p > 0.2.

### 3. Rate limiting — three axes
- **Per IP**: 30 login attempts / 10 min. Sliding window via Upstash or
  Postgres `rate_limits` table (we already have `apps/api/src/middleware/rate-limit.ts`).
- **Per identity** (email hash): 5 attempts / 15 min. After 5 fails, require
  Turnstile on next attempt; after 10, soft-lock for 30 min (user can unlock
  via email).
- **Per route**: global ceiling 1000 rps on `/api/auth/*`.

All three must pass. Failures return identical 429 body to valid-credential
rejections; only `Retry-After` differs.

### 4. Breached-password + zxcvbn
- On signup and password change: check the password's SHA-1 prefix (first 5
  chars) against the HIBP range API over HTTPS. If the full hash appears in
  the response, reject.
- Run `zxcvbn` on the candidate; require score ≥ 3.
- Minimum length 12; maximum 72 (bcrypt ceiling — Supabase default is bcrypt,
  plan to migrate to Argon2id per ASVS V6).

### 5. Cloudflare Turnstile
- Siteverify on login + signup + password-reset endpoints.
- Surface after 3 failures per identity, always on signup.
- Fallback: if Turnstile is down, fail-closed on signup, fail-open on login
  (users must still log in). Document the tradeoff.

### 6. Cookie hardening
- Session cookie: `__Host-` prefix (forces `Secure`, no `Domain`, `Path=/`).
- Attributes: `Secure`, `HttpOnly`, `SameSite=Strict`.
- Split session and refresh cookies. Access token rotates every ≤15 min;
  refresh token rotates on each use (reuse detection → force re-login).

### 7. MFA gate on sensitive routes
After the MFA migration lands, require `aal2` in the JWT for:
- `POST /api/account/password` (change password)
- `POST /api/account/email`    (change email)
- `POST /api/providers/*`      (add / rotate AI provider credentials)
- `POST /api/wordpress-configs/*` (add / rotate WP credentials)
- `DELETE /api/account`        (delete account — GDPR erase)

Middleware parses `request.jwt.claims.aal`. If `aal !== "aal2"`, return a
structured error: `{ error: { code: "MFA_REQUIRED" } }`. Frontend intercepts
and prompts for MFA.

### 8. Audit log
Every login attempt writes to a new `auth_audit_log` (append-only, same
pattern as `user_mfa_audit_log`):
- `event`: `login_success | login_failed | login_locked | password_reset_requested | password_changed | email_changed`
- `user_id` (nullable — unknown-email case)
- `ip_hash`, `ua_hash`
- `metadata`: reason category (`bad_password | no_user | rate_limited | mfa_required | mfa_failed`), never the credential.

### 9. Login form UX (accessibility + security)
- `autocomplete="current-password"` on password input.
- `autocomplete="one-time-code"` + `inputmode="numeric"` on TOTP input.
- No password in URL query (redirect on error preserves only email).
- Error surfaces in `aria-live="polite"` region.
- No email + password in browser history or referrer.

## Non-goals (out of scope for this card)

- Passkeys / WebAuthn — a follow-up card after this.
- IP reputation feeds — follow-up; relies on external data source.
- Risk-based authentication / device fingerprinting — follow-up.

## Test plan

- Unit: timing-floor util, Turnstile verifier, HIBP checker, zxcvbn gate.
- Integration: all four login paths (good / bad pass / no user / locked)
  return identical response shape.
- Security: `/sec-pentest localhost:3000/auth/login` after the change must
  show the baseline findings fixed (no timing delta, no enumeration).
- Regression: existing auth integration tests stay green.

## Estimated effort

5–8 points. Majority of work is in: rate-limit plumbing, HIBP integration,
timing-jitter floor helper, MFA middleware.

## References

- OWASP ASVS v4.0.3 — V2 Authentication, V3 Session Management
- NIST SP 800-63B — Digital Identity, authentication assurance levels
- RFC 8725 — JSON Web Token Best Current Practices
- HIBP range API: `https://api.pwnedpasswords.com/range/{prefix}`
- Cloudflare Turnstile siteverify
