# Affiliate-Migration Branch Smoke Automation — Design Spec

**Date:** 2026-04-17
**Status:** draft (post-brainstorm, pre-plan)
**Context:** One-shot automation rehearsal for the `feat/affiliate-2a-foundation` branch before PR review / merge. Covers the runtime-wiring gap left by unit tests across SP0 (email abstraction), SP1 (2B end-user), SP2 (2C admin), SP3 (2E fraud + rate-limit), SP4 (2F billing hook). Related: `BRANCH_NOTES-affiliate-migration.md` §"Known residual gaps" item 1.

---

## 1. Goals

1. Exercise the cross-sub-project HTTP wiring that unit tests mock out: container composition, plugin registration, middleware chain, DB writes against the running services.
2. Produce a deterministic pass/fail report over a fixed probe set (16 probes, target <30 s wall time after preflight).
3. Rerunnable and idempotent: seed → probe → cleanup inside a top-level `try/finally`.
4. Zero new runtime dependencies in `apps/*`. One-shot script under `scripts/`.

### Non-goals

- Replacing unit or integration tests. Probes verify runtime plumbing, not logic.
- Full UI click-through coverage. 6 residual items (clipboard, `localStorage`, client-side form validation, payout-button disabled tooltip, approve/pause dialog clicks, skipped-2F error fallback toast) remain manual, ~5 min.
- SP0 email wiring beyond the fraud-alert path. SP0 is already covered by `apps/api/src/lib/email/__tests__/smtp.integration.test.ts` against MailHog.
- SP3 fraud-engine end-to-end. Stub exists as `affiliate-fraud-flow.test.ts` (`describe.skip` + `TODO-test`). Running that stub against local DB is a separate task, tracked in 2E spec §5.

---

## 2. Prerequisites (user-driven)

Script assumes the following are already running in the host shell. Fails preflight fast if any are not.

| Service | Command | Port | Health check |
|---|---|---|---|
| Supabase local | `npm run db:start` | 54321 (API), 54322 (DB) | `GET http://localhost:54321/rest/v1/` returns 200 |
| MailHog | `npm run email:start` | 1025 (SMTP), 8025 (HTTP API) | `GET http://localhost:8025/api/v2/messages` returns `{total, items}` |
| apps/api | `npm run dev:api` | 3001 | `GET /health` or `GET /` returns 200 |
| apps/app | `npm run dev:app` | 3000 | `GET /` returns 200 |

Rationale: booting this stack automatically from a single script is brittle (4 workspaces, Docker, Supabase CLI) and duplicates `npm run dev`. Preflight failure is the natural signal.

---

## 3. Architecture

```
scripts/
├── smoke-affiliate.ts              ← entry; CLI: `tsx scripts/smoke-affiliate.ts`
└── smoke/
    ├── preflight.ts                ← 4 health checks, fails fast on any down
    ├── seed.ts                     ← SQL fixture; returns handles { userId, affiliateId, ... }
    ├── cleanup.ts                  ← reverse-order FK delete; always runs in `finally`
    ├── reporter.ts                 ← collects {id, desc, sp, status, detail}; prints table; returns exit code
    ├── http.ts                     ← shared fetch wrapper (X-Internal-Key injection, error envelope parsing)
    └── probes/
        ├── sp1.ts                  ← 3 probes: end-user backend endpoints
        ├── sp2.ts                  ← 6 probes: admin routes + DB flip verification
        ├── sp3.ts                  ← 4 probes: rate-limit wire
        └── sp4.ts                  ← 3 probes: Stripe webhook signed events
```

Probe module export shape:

```ts
export interface Probe {
  id: string;        // e.g. "SP3-2"
  sp: 1 | 2 | 3 | 4;
  desc: string;
  run(ctx: ProbeContext): Promise<ProbeResult>;
}

export interface ProbeResult {
  status: 'pass' | 'fail' | 'skip';
  detail?: string;   // fail reason or skip rationale
}

export interface ProbeContext {
  fixture: SeedHandles;       // { userId, affiliateId, affiliateCode, commissionId, flagId, contentSubmissionId }
  apiUrl: string;             // default http://localhost:3001
  internalKey: string;        // from apps/api/.env.local
  supabase: SupabaseClient;   // service_role, for DB assertions
  mailhogUrl: string;         // default http://localhost:8025
}
```

Keeping a single `Probe` contract makes the reporter trivial and allows adding or skipping probes by flag without branching per SP.

---

## 4. Fixture (seed)

One cleanup transaction's worth of rows. All rows tagged with `smoke_run_id` metadata so orphan detection (from prior failed runs) is trivial.

| Table | Row | Key fields |
|---|---|---|
| `auth.users` | smoke user | `email = smoke-<run-id>@brighttale.test`, `email_confirmed_at = now()` |
| `user_roles` | admin grant | `user_id = <smoke user>`, `role = 'admin'` |
| `affiliates` | approved | `user_id = <smoke user>`, `code = 'SMK<shortRunId>'`, `status = 'approved'`, `tier = 'creator'` |
| `affiliate_commissions` | pending | `affiliate_id = <smoke affiliate>`, `status = 'pending'`, `total_brl = 10.00` |
| `affiliate_content_submissions` | pending | `affiliate_id = <smoke affiliate>`, `url = 'https://example.com/smoke'`, `status = 'pending'` |
| `affiliate_fraud_flags` | open | `affiliate_id = <smoke affiliate>`, `flag_type = 'self_referral_ip_match'`, `severity = 'low'`, `status = 'open'` |
| `organizations` (or `orgs` — TBD per schema) | smoke org | `name = 'Smoke Org <run-id>'`; needed by SP4 `subscription.metadata.org_id` lookup |
| `org_memberships` | primary | `org_id = <smoke org>`, `user_id = <smoke user>`, `created_at = now()` — the `getOrg` convention picks the earliest membership as the billing recipient |

Plan task reads the canonical table/column names from `packages/shared/src/types/database.ts` so the seed module uses the real identifiers.

Run-ID: `crypto.randomUUID().slice(0,8)`. Prevents collisions across parallel runs (unlikely but cheap).

Cleanup order (reverse FK): `affiliate_fraud_flags` → `affiliate_content_submissions` → `affiliate_commissions` → `affiliates` → `org_memberships` → `organizations` → `user_roles` → `auth.users`. All deletes scoped by id from seed handles (captured at seed time).

---

## 5. Probe inventory

### SP1 — end-user backend (3)

| ID | Description | Method | Asserts |
|---|---|---|---|
| SP1-1 | `GET /affiliate/me` with `X-Internal-Key` + `x-user-id: <smoke userId>` | 200 | response envelope `{data: {code: 'SMK…', tier: 'creator'}, error: null}` |
| SP1-2 | `GET /affiliate/commissions/recent` | 200 | response lists seeded commission row |
| SP1-3 | `GET /affiliate/content` | 200 | response lists seeded content submission |

### SP2 — admin backend (6)

| ID | Description | Asserts |
|---|---|---|
| SP2-1 | `GET /admin/affiliate/affiliates` list | 200 + seeded affiliate present in `data.items` |
| SP2-2 | `POST /admin/affiliate/affiliates/:id/pause` | 200 + DB row `status='paused'` (re-read via service_role) |
| SP2-3 | `POST /admin/affiliate/affiliates/:id/approve` (re-activate) | 200 + DB row `status='approved'` |
| SP2-4 | `GET /admin/affiliate/payouts/pending` | 200 + response shape has `items` array |
| SP2-5 | `GET /admin/affiliate/content/pending` | 200 + seeded submission present |
| SP2-6 | `POST /admin/affiliate/fraud-flags/:id/resolve` with `{resolution: 'false_positive', notes: 'smoke', pauseAffiliate: false}` | 200 + DB row `status='resolved'` |

All SP2 probes use `x-user-id = <smoke admin userId>` so admin-gate inside apps/api routes passes.

### SP3 — rate-limit wire (4)

All probes synthetic-IP via `x-forwarded-for: 198.51.100.<N>` (TEST-NET-2). Host dev traffic unaffected because `trustProxy: true` (index.ts:75) keys by the forwarded address.

| ID | Description | Asserts |
|---|---|---|
| SP3-1 | 30× `GET /ref/<smoke code>` with `x-forwarded-for: 198.51.100.1` | all 30 return 302 |
| SP3-2 | 31st `GET /ref/<smoke code>` same IP | 429 + body `{data: null, error: {code: 'RATE_LIMITED', …}}` + header `x-ratelimit-limit` present |
| SP3-3 | `GET /ref/<smoke code>` with `x-forwarded-for: 198.51.100.2` | 302 (fresh IP bucket) |
| SP3-4 | `GET /affiliate/me` (authed) after IP .1 is exhausted | 200 (scope isolation — limit applies only to `/ref/*`) |

### SP4 — Stripe webhook (3)

All probes sign the body with `process.env.STRIPE_WEBHOOK_SECRET` via `stripe.webhooks.generateTestHeaderString`. If `STRIPE_WEBHOOK_SECRET` unset in `apps/api/.env.local`, SP4 probes emit `skip` with detail `"STRIPE_WEBHOOK_SECRET not set — webhook path unexercised"` rather than failing.

| ID | Description | Asserts |
|---|---|---|
| SP4-1 | `POST /billing/webhook` with `invoice.payment_succeeded` event, billing_reason=`subscription_cycle`, `amount_paid=9900`, subscription.metadata.org_id=<smoke orgId>, smoke user has active referral | 200 + DB `affiliate_commissions` count for smoke affiliate +1 |
| SP4-2 | Same event but `billing_reason='subscription_update'` | 200 + DB commission count unchanged |
| SP4-3 | Same event but `amount_paid=0` | 200 + DB commission count unchanged + log contains `"short-circuit"` (not asserted if log not captured) |

---

## 6. Failure & error handling

- **Preflight failure:** exit code 1 immediately. No seed, no cleanup. User gets clear message: "apps/api not reachable at http://localhost:3001 — run `npm run dev:api`".
- **Seed failure:** exit code 1. Cleanup best-effort on whatever handles were returned before the error.
- **Probe failure:** collected, not halting. Report prints the fail detail (expected vs actual).
- **Cleanup failure:** logged as warning (not a smoke fail, but surfaced). Exit code honors probe results.
- **Signal handling:** `SIGINT` / `SIGTERM` triggers cleanup via a top-level `finally` block.

Exit code semantics: `0` = all probes pass, `1` = at least one fail or preflight/seed failed.

---

## 7. Reporter output

```
Affiliate smoke rehearsal
─────────────────────────

Preflight
  ✓ supabase  :54321       (120 ms)
  ✓ mailhog   :8025        (8 ms)
  ✓ api       :3001        (15 ms)
  ✓ app       :3000        (210 ms)

Seed
  ✓ auth user     smoke-a3f1@brighttale.test
  ✓ admin role
  ✓ affiliate     SMKa3f1 (id=…)
  ✓ commission    pending, 10.00 BRL
  ✓ content       pending
  ✓ fraud flag    open

Probes (16)
  SP1-1  GET /affiliate/me                           pass   12 ms
  SP1-2  GET /affiliate/commissions/recent           pass    8 ms
  SP1-3  GET /affiliate/content                      pass    9 ms
  SP2-1  GET /admin/affiliate/affiliates (list)      pass   14 ms
  SP2-2  POST /admin/affiliate/…/pause               pass   22 ms
  SP2-3  POST /admin/affiliate/…/approve             pass   20 ms
  SP2-4  GET /admin/affiliate/payouts/pending        pass   11 ms
  SP2-5  GET /admin/affiliate/content/pending        pass   10 ms
  SP2-6  POST /admin/affiliate/fraud-flags/…/resolve pass   18 ms
  SP3-1  /ref × 30 within limit                      pass  340 ms
  SP3-2  /ref 31st over limit                        pass   12 ms
  SP3-3  /ref fresh IP                               pass    9 ms
  SP3-4  /affiliate/me after exhaustion              pass   10 ms
  SP4-1  webhook subscription_cycle                  pass   45 ms
  SP4-2  webhook subscription_update                 pass   40 ms
  SP4-3  webhook amount_paid=0                       pass   38 ms

Cleanup
  ✓ 1 fraud flag, 1 content, 1 commission, 1 affiliate, 1 role, 1 user

Results: 16 pass, 0 fail, 0 skip   (exit 0)
```

---

## 8. Observability / developer UX

- `LOG_LEVEL` env var: `quiet` (only PASS/FAIL lines + summary), `normal` (default, as above), `verbose` (full request/response bodies for failures).
- `--only=SP3` CLI flag: runs just that SP's probes. Seed + cleanup still execute.
- `--no-cleanup` CLI flag: for debugging; prints handle IDs and exits without deleting. User cleans up manually.

---

## 9. Assumptions & risks

- **Rate-limit cache persistence:** `@fastify/rate-limit` uses in-process cache, so re-running the script reuses the same host dev api process's cache. Synthetic `x-forwarded-for: 198.51.100.x` prevents polluting the dev host's bucket; reruns pollute the synthetic bucket but that's harmless. Between runs, bucket TTL (1 minute by default) expires naturally.
- **`STRIPE_WEBHOOK_SECRET`:** often unset in dev. SP4 probes degrade to `skip` rather than fail, with clear message. No false negatives.
- **Supabase local vs remote:** script reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `apps/api/.env.local`. If the URL is not `localhost` / `127.0.0.1`, preflight aborts with a clear error telling the user to point `apps/api/.env.local` at local Supabase (or override with `--force` — documented but expected to be rare, e.g. smoke-against-staging CI hook). No `process.stdin` prompt; non-interactive safety is simpler to reason about.
- **App SSR not probed:** by design (see §1). Next.js rewrites are thin pass-through; their correctness is covered by existing middleware unit tests + the runtime boot in BRANCH_NOTES §Verification.
- **Concurrent runs:** two humans running the script simultaneously could step on each other's rate-limit buckets (same synthetic IP). Contract: script documents "one at a time" in its header comment. Cheap; no coordination primitive.

---

## 10. Done criteria

- [ ] `npm run smoke:affiliate` registered in root `package.json`.
- [ ] `tsx scripts/smoke-affiliate.ts` runs end-to-end on a clean checkout with prerequisites running, produces exit code 0, all 16 probes pass.
- [ ] Rerunning back-to-back produces the same result (idempotency).
- [ ] Killing with `Ctrl-C` during probes triggers cleanup (orphan rows = 0).
- [ ] Script tested twice on local stack before being declared done.
- [ ] BRANCH_NOTES updated: §Known-residual-gaps item 1 marked resolved with a link to smoke script output capture.
