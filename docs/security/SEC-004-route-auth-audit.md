# SEC-004 — Full route-level authentication audit (apps/api)

**Status:** draft · **Owner:** Rafael · **Created:** 2026-04-24
**Priority:** high — directly avoided a second crown-jewel leak

## Why

SEC-003's fix (agent prompts) was a patch at three handlers. An inventory
run showed **~175 other handlers** in `apps/api/src/routes/*.ts` still use
the original `authenticate` middleware — which validates
`INTERNAL_API_KEY` but **does not** require a user session. Because
`apps/app`'s proxy always injects the key (even for anonymous browsers),
any of those handlers that returns user-scoped or otherwise sensitive
data could be the next `/api/agents` incident waiting to be found.

Route-by-route triage is required. Many handlers probably have their own
internal `if (!request.userId)` guard and are safe; many don't.

## Route inventory (from grep 2026-04-24)

| File | `authenticate` usages | Category (rough) |
|---|---:|---|
| ai-config.ts | 6 | user creds — **critical** |
| wordpress.ts | 12 | user creds — **critical** |
| ai-provider-configs.ts | n/a | user creds — **critical** |
| content-drafts.ts | 19 | user content |
| research-sessions.ts | 11 | user content |
| projects.ts | 11 | user content |
| brainstorm.ts | 10 | user content |
| research.ts | 10 | user content |
| assets.ts | 10 | user content |
| blogs.ts | 7 | user content |
| stages.ts | 7 | user content |
| videos.ts | 7 | user content |
| podcasts.ts | 7 | user content |
| shorts.ts | 7 | user content |
| channels.ts | 6 | user content |
| ideas.ts | 6 | user content |
| templates.ts | 6 | user content |
| users.ts | 5 | user data |
| references.ts | 5 | user data |
| image-generation.ts | 5 | compute cost — **rate-limit sensitive** |
| canonical-core.ts | 5 | user content |
| org-members.ts | 5 | org access |
| billing.ts | 4 | financial — **sensitive** |
| credits.ts | 4 | financial — **sensitive** |
| org.ts | 3 | org access |
| notifications.ts | 3 | user data |
| export.ts | 3 | user content |
| publishing-destinations.ts | 3 | user creds — **critical** |
| content.ts | 2 | user content |
| voice.ts | 2 | compute cost |
| onboarding.ts | 2 | user data |
| youtube.ts | 2 | user creds — **critical** |
| usage.ts | 1 | telemetry |
| bulk.ts | 1 | compute cost |

**Total: ~178 handler usages across 34 files.**

## Method

For each handler, classify into one of four buckets:

1. **`authenticateWithUser`** — the handler returns/mutates user-scoped
   data or touches user credentials. Change the `preHandler`.
2. **`authenticate` + explicit admin check** — already gated by admin-role
   check inside. Keep as-is, document the invariant in a comment.
3. **`authenticate` + webhook signature** — Stripe / Inngest / etc. Keep
   as-is; verification happens via a different signal (webhook signature).
4. **Public on purpose** — health checks, public auth flow. Move to no
   auth middleware at all; name the route-registration block explicitly
   "public".

For buckets 1-3, add a one-line comment documenting **why** the chosen
middleware is correct for this handler. Future reviewers shouldn't have
to rederive it.

## Implementation order (by blast radius)

1. **Financial + credentials** (billing, credits, ai-config, wordpress,
   publishing-destinations, youtube, ai-provider-configs) — **ship first**.
2. **Content routes** (drafts, research, projects, blogs, videos, …).
3. **Org/user metadata** (org, users, org-members, notifications).
4. **Compute-cost routes** (image-generation, voice, bulk) — add rate
   limit as well as auth check.
5. **Telemetry / read-only** (usage, canonical-core reads).

After each file's triage, run `npm run test` and `npm run typecheck` to
catch any handler that now rejects its real callers.

## Testing

Per-file: for each endpoint,
1. curl with **no** headers → must be 401 `UNAUTHORIZED`.
2. curl with `X-Internal-Key` only (no `x-user-id`) → must be 401 for
   user-scoped handlers, 200 for webhooks/public.
3. curl with both → expected behavior.
4. Add a vitest integration test asserting (1) for every new gated
   handler.

Pentest regression:
- Re-run `npx tsx scripts/sec/playwright/pentest.ts` after each file.
- Any newly 401 endpoint shows as `fixed` in the baseline diff.

## Estimated effort

5–8 points. Most files are 5–20 minute audits each.

## References

- Root-cause discovery: SEC-003 crown-jewel finding.
- Middleware added by SEC-003: `apps/api/src/middleware/authenticate.ts` → `authenticateWithUser`.
