# SEC-005 — Security polish (low + info residue)

**Status:** draft · **Owner:** Rafael · **Created:** 2026-04-24
**Priority:** low — everything here is ≤ low severity and can ride with any PR

## Why

Iterations 001 → 003 of the pentest closed every critical and high that
was in scope for autonomous fixes. The residue is a mix of dev-only
artifacts, default-config choices, and cosmetic leaks. This card tracks
them so they don't get lost, but none are release blockers.

## Items

### 1. Admin slug rotation

**Finding**: admin panel exposed at default `/admin` slug.

**Fix**: set `NEXT_PUBLIC_ADMIN_SLUG` on the Vercel project for
`apps/web` to an unguessable random string (≥ 16 url-safe chars).
Document the new slug in the team password manager. Rotate every 6 months
or on any security incident.

**Effort**: 0.5 point. Config only.

### 2. Reset-password page uniformity

**Finding**: `/admin/reset-password` renders a different HTML size for
missing vs bogus token — a user-enumeration signal.

**Fix**: the page should render identically regardless of token presence
or validity. Validate only on form submission, and return a generic "if
that token was valid, you'll be redirected" message in both success and
failure paths.

**Effort**: 1 point.

### 3. Cache-Control: no-store on apps/app admin-adjacent routes

**Finding**: already applied to `apps/web` (via `next.config.ts` headers).
Apps/app's dashboard routes should match — session data should never hit
a shared cache.

**Fix**: add `Cache-Control: no-store, must-revalidate, private` to every
authenticated route in `apps/app` via `next.config.ts` headers() or
per-route headers.

**Effort**: 1 point.

### 4. Permissions-Policy defaults review

**Finding**: info-level notes on Permissions-Policy across origins.

**Fix**: already set on apps/app, apps/api, apps/web. This card just
documents a quarterly review: new browser features need explicit `=()`
disablement if not used.

**Effort**: 0.25 point / quarterly.

### 5. Remove legacy repo mirrors from the tree

**Finding**: `bright-curios-automation-workflow-main/` and
`bright-curios-workflow/` under the repo root are legacy imports that
no longer serve a purpose. They are gitleaks-allowlisted (SEC-000 work)
but continue to waste scanner time.

**Fix**: `git rm -r` both directories after confirming none of their
content is referenced from the live codebase. Update `.claude/agents/*`
if any agent references them.

**Effort**: 0.5 point + validation.

### 6. Error envelope standardization across apps/api

**Finding** (post-SEC-004): once every handler is correctly gated, the
error envelope still varies (some routes `{data: null, error: {…}}`,
some `{error: {…}}`, Fastify defaults to `{statusCode, error, message}`).

**Fix**: centralized Fastify `setErrorHandler` that maps every thrown
error to `{data: null, error: {code, message}}`. Unwrap Zod issues into
`code: 'VALIDATION_ERROR'` with a flat message. Never leak Postgres
codes/hints/details to clients.

**Effort**: 1 point. Write once, deletes dozens of try/catch lines.

### 7. Probe refinements (this is the security tooling, not the app)

- Error-leakage probe regex was over-broad (matched any JSON containing
  "message"). Fixed in iteration 004 — tracked here only for completeness.
- CSP probe in Report-Only mode should not flag `unsafe-inline`/`unsafe-eval`
  because dev HMR requires them. Fixed in iteration 004.
- Host-header probe currently only checks reflection — add a variant that
  rewrites the request URL and verifies the app doesn't build password-reset
  links off the incoming Host header.

**Effort**: 1 point.

## Total

~5 points. Ship opportunistically with other PRs.

## Dependencies

None critical. Can be any-order.
