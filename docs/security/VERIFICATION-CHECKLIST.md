# Security verification checklist

Ship-confidence checklist. Run through this before calling the security
work "done". 20–30 minutes end-to-end.

---

## Part 1 · Smoke (nothing broke) — 5 min

- [ ] **apps/api typecheck**: `(cd apps/api && npx tsc --noEmit)` → clean
- [ ] **apps/web typecheck**: `(cd apps/web && npx tsc --noEmit)` → clean
- [ ] **apps/app typecheck**: `(cd apps/app && npx tsc --noEmit)` → clean
- [ ] **apps/app dev is up**: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → 200 or 307 (not 000)
  - If 000: `npm run dev` didn't spawn apps/app. Restart with `npm run dev` from repo root.
- [ ] **apps/api dev is up**: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health` → 200
- [ ] **apps/web dev is up**: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/` → 200
- [ ] **Login page renders**: open `http://localhost:3002/admin/login` in browser — form visible, no console errors.
- [ ] **Landing renders**: open `http://localhost:3000/` — redirects or shows marketing content without errors.

---

## Part 2 · Security surfaces (new defenses fire) — 10 min

### 2A · Non-indexability

- [ ] `curl -s http://localhost:3002/robots.txt | head` → starts with "# BrightTale" and lists `Disallow: /admin`
- [ ] `curl -sI http://localhost:3002/admin/login | grep -i x-robots` → `X-Robots-Tag: noindex, nofollow, ...`
- [ ] `curl -s http://localhost:3002/admin/login | grep -o '<meta[^>]*robots[^>]*>'` → `<meta name="robots" content="noindex, nofollow, nocache"/>`

### 2B · Trust boundary

- [ ] `curl -sI http://localhost:3001/agents` → 401 (crown-jewel protected)
- [ ] `curl -sI http://localhost:3002/zadmin/login` → 404 (internal path blocked)
- [ ] `curl -s -X POST http://localhost:3001/projects -H 'Origin: https://attacker.example' -H 'Content-Type: application/json' -d '{}' -w "\n%{http_code}\n"` → 403 (CSRF Origin rejected)
- [ ] `curl -s -X POST http://localhost:3001/projects -H 'Content-Type: application/json' -d '{}' -w "\n%{http_code}\n"` → 401 (no Origin, but missing INTERNAL_API_KEY)

### 2C · Admin rate limiter

- [ ] Hammer test:
  ```bash
  for i in $(seq 1 35); do
    curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3002/admin/login -d "x=$i"
  done | sort | uniq -c
  ```
  - Dev expected: all 35 return **200** (loose ceiling: 100/15 min).
  - To test the strict path, touch middleware.ts then rerun with `NODE_ENV=production` in a throwaway shell — expect `30×200 + 5×429`.
- [ ] 429 page renders: open `http://localhost:3002/admin/login?error=rate_limited&retry=60` → countdown banner visible, counts down live.

### 2D · Security headers (defense in depth)

- [ ] `curl -sI http://localhost:3001/health | grep -iE "x-content-type|strict-transport|x-frame|referrer-policy|permissions-policy|x-powered-by"`
  - Expect: 5 headers present, **no** `X-Powered-By`.
- [ ] `curl -sI http://localhost:3002/ | grep -iE "content-security-policy|x-powered-by"`
  - Expect: CSP Report-Only present, **no** `X-Powered-By`.

---

## Part 3 · Close the remaining 3 findings — 10 min

### 3A · Admin slug rotation (LOW → closes)

Action:
1. Append to `apps/web/.env.local`:
   ```
   NEXT_PUBLIC_ADMIN_SLUG=f2d8b1f1932300ce-admin
   ```
2. Restart apps/web (Ctrl+C the dev server, `npm run dev:web` again).
3. Verify:
   - [ ] `curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/admin/login` → **404** (default slug dead)
   - [ ] `curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/f2d8b1f1932300ce-admin/login` → **200** (new slug works)
4. Update your browser bookmarks, 1Password, and Vercel env (preview + production).
5. Also add to `BRIGHTSEC_BYPASS_HMAC_KEY` env for the probe to keep working:
   ```
   BRIGHTSEC_BYPASS_HMAC_KEY=<output of `openssl rand -hex 32`>
   ```
6. Re-run pentest — LOW should be gone.

### 3B · Admin MFA enrollment (CRITICAL → closes)

Action:
1. Log in to admin at the new slug URL from 3A.
2. After login you'll be redirected to `/{slug}/mfa` (middleware detects no AAL2).
3. Scan the QR code in your authenticator app (1Password / Authy / Google Authenticator). Or paste the TOTP secret manually.
4. Enter the 6-digit code from the app → "Verify and finish".
5. You're now at AAL2. Middleware passes on every admin page.
6. Repeat for every admin account (you + Thiago = 2 total).
7. Re-run pentest — CRITICAL should downgrade or disappear.

**If the enrollment page errors**: confirm Supabase project has MFA enabled in its dashboard (Authentication → Providers → Multi-factor → TOTP on). Free Supabase tier supports TOTP.

### 3B.1 · Resend SMTP wired for auth email (dependency of 3B)

Before the MFA enrollment flow emails actually arrive, wire Resend:

1. Follow `docs/security/EMAIL-CONFIG.md` Steps 1-5 (5 min).
2. Paste the SMTP block into `apps/api/.env.local` and Vercel envs.
3. Paste the same SMTP config into Supabase dashboard → Auth → SMTP.
4. Run the test send command from EMAIL-CONFIG.md Step 3 to confirm.

Without this, the forgot-password email won't arrive (Supabase
default rate-limit caps at 4/hour and mail may land in spam anyway).

### 3C · Rate-limit validation in staging (HIGH → closes)

The HIGH on the current report is a **meta finding**: "dev config is loose, validate in staging". To close:

Action:
1. Deploy current branch to Vercel preview (auto on push).
2. Run pentest against preview URL:
   ```bash
   npx tsx scripts/sec/playwright/pentest.ts \
     --app=https://<preview>.vercel.app \
     --api=https://<preview-api>.vercel.app \
     --web=https://<preview-web>.vercel.app
   ```
3. Rate-limit probe should now find the 429 at attempt ≈ 31 and record:
   - `[INFO] Rate limit verified on login — first 429 at attempt 31/40` ✓
4. The HIGH "No rate limit observed" becomes an INFO "verified ✓".

---

## Part 4 · Production deploy — 5 min env config

Before merging to main:

- [ ] Vercel (apps/web) env vars:
  - `NEXT_PUBLIC_SUPABASE_URL` — prod project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — prod anon key
  - `SUPABASE_SERVICE_ROLE_KEY` — prod service role (admin layout only)
  - `NEXT_PUBLIC_ADMIN_SLUG` — your rotated slug (NOT `admin`)
  - `NEXT_PUBLIC_APP_URL=https://app.brighttale.io`
  - **DO NOT SET** `BRIGHTSEC_BYPASS_HMAC_KEY` in production — bypass is hard-disabled there anyway, but leaving the var absent is defense in depth.
- [ ] Vercel (apps/api) env vars:
  - `INTERNAL_API_KEY` — shared secret
  - `ENCRYPTION_SECRET` — 64-hex master key
  - `SUPABASE_SERVICE_ROLE_KEY` — prod
  - `STRIPE_WEBHOOK_SECRET` — prod
- [ ] Vercel (apps/app) env vars:
  - `API_URL=https://api.brighttale.io`
  - `INTERNAL_API_KEY` — same as apps/api
  - `NEXT_PUBLIC_SUPABASE_*` — prod

- [ ] Supabase MFA enabled in dashboard
- [ ] Every admin account has MFA enrolled (check via `select * from auth.mfa_factors`)

---

## Part 5 · What still needs a sprint (out of scope)

| Card | What it does | Estimate |
|---|---|---|
| [SEC-001](SEC-001-login-hardening.md) | User login: HIBP breached-password check, Turnstile, response unification, session rotation verification | 5–8 pts |
| [SEC-003](SEC-003-agent-prompts-protection.md) | Agent prompts: AAD-bound encryption, versioning, audit log, step-up MFA on writes | 13–21 pts |
| [SEC-004](SEC-004-route-auth-audit.md) | Audit ~150 remaining apps/api routes (content-drafts, ideas, brainstorm, research, channels, ...) for `authenticate` → `authenticateWithUser` | 5–8 pts |
| SEC-006 | Turnstile on `/admin/login` + user `/auth/login` (code pre-wired, needs site-key from Cloudflare) | 2 pts |

SEC-006 is the quickest next — code is already prepared in `docs/security/SEC-006-turnstile.md`, you only need to generate keys in the Cloudflare dashboard and paste them.

---

## Part 6 · Regression protection (going forward)

- The pentest dashboard is your guardrail. Open `http://127.0.0.1:3030/history.html` (with `npx tsx scripts/sec/server.ts` running) and click **Run pentest** before each deploy.
- Any new finding that appears in a future iteration → delta pill goes red → investigate the commit that introduced it.
- For CI: add `.github/workflows/pentest.yml` that runs `npx tsx scripts/sec/playwright/pentest.ts` on every PR. Fail build if critical or high appears.

That's the loop. 49 → 5 now; goal is: keep it ≤ 5 indefinitely, each added finding reviewed within 24h.
