# SEC-006 — Cloudflare Turnstile on auth endpoints

**Status:** ready-to-ship — code pre-wired, only needs keys
**Priority:** medium · **Estimate:** 2 points (30 min of integration + testing)

## Why

Turnstile is the final layer against credential stuffing and brute force.
Rate limit (IP + identity) catches volume. MFA catches post-password
compromise. Turnstile catches the automation that shows up in between —
distributed bot traffic from VPN pools that stays under any single-IP
cap.

On Cloudflare free tier it's **100% free up to 1M challenges/month**,
which is orders of magnitude beyond what your actual usage will need.

## Code already in place

| File | What it does |
|---|---|
| `apps/web/src/lib/auth/turnstile-verify.ts` | Server-side siteverify call. Passthrough in dev when no secret. Fail-closed in prod when secret missing or verify fails. |

The Server Action and UI wiring still need to land (below).

## Integration steps

### 1. Generate keys in Cloudflare dashboard

- Log in → **Turnstile** → **Add site**
- Domain: `brighttale.io` (and optionally `staging.brighttale.io`,
  `localhost` as separate widgets)
- Widget mode: **Managed** (recommended — invisible for real users, shows challenge only under bot suspicion)
- Copy the **Site Key** (public) and **Secret Key** (server-side)

### 2. Env vars

```
# apps/web/.env.local (AND Vercel preview + production)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<the site key from step 1>
TURNSTILE_SECRET_KEY=<the secret key from step 1>

# optional (for separate staging widget):
NEXT_PUBLIC_TURNSTILE_SITE_KEY_STAGING=...
```

### 3. Client: render the widget on the login form

Add to `apps/web/src/app/zadmin/login/page.tsx`:

```tsx
// near the top
import Script from 'next/script'

// inside LoginForm, just before the form
<Script
  src="https://challenges.cloudflare.com/turnstile/v0/api.js"
  async
  defer
/>
<div
  className="cf-turnstile"
  data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
  data-callback="__brightsecOnTurnstile"
/>
```

The widget auto-renders a hidden input `cf-turnstile-response` with the
token when the challenge clears. Your form submits it alongside email /
password.

### 4. Server Action: verify the token

Update `apps/web/src/lib/auth/admin-actions.ts`:

```ts
import { verifyTurnstile } from './turnstile-verify'

export async function signInWithPassword(input: {
  email: string
  password: string
  turnstileToken?: string    // NEW
}) {
  const startedAt = Date.now()

  // Turnstile — fail closed in prod, passthrough in dev.
  const ip = (await sourceIp()) ?? undefined
  const captcha = await verifyTurnstile(input.turnstileToken, ip)
  if (!captcha.ok) {
    await finishWithUniformDelay(startedAt)
    return {
      ok: false as const,
      message: 'Invalid credentials',   // uniform failure
    }
  }

  // existing rate-limit gate + signInWithPassword...
}
```

The admin-actions.ts wrapper already does rate limit + uniform delay;
Turnstile slots in as the first check.

### 5. Same for user-facing login (apps/app)

Mirror the pattern in `apps/app/src/app/[locale]/(auth)/auth/login/` —
add widget + verify. The `verifyTurnstile` library has zero state so it
can be imported from apps/app too (copy the file in or promote to a
shared workspace).

### 6. Update the bypass policy

In `apps/web/src/lib/auth/admin-login-gate.ts` add an early return if
the request carries a valid `X-BrightSec-Auth` HMAC (as the edge
limiter already does) — so authorized probe traffic skips Turnstile in
dev. Trivial check:

```ts
if (await verifyBypass(request).then(r => r.honored)) {
  return { allowed: true }
}
```

## Verification

After deploy:

- [ ] Open login → widget renders (usually invisible, shows checkbox/puzzle only if suspicious)
- [ ] Submit form → no visible change; auth completes
- [ ] `curl -s -X POST …/admin/login -d 'email=x&password=y'` (no token) → in prod, returns uniform failure
- [ ] Pentest probe — automated requests should now see an increase in rejected POSTs in staging; rate-limit probe still dominates

## Why this is post-MVP

- Requires a working signup/login UI integration test
- Requires Supabase test account for the probe to drive
- Every change here touches user-visible flow; bigger coordination needed

## Rotation

- Keys can be rotated in Cloudflare dashboard with zero downtime
  (widget picks up site-key change on next render, verify continues with
  the old secret until replaced server-side)
- Change secret → restart apps/web
- Quarterly rotation is reasonable
