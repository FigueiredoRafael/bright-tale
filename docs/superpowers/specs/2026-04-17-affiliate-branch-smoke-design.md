# Affiliate-Migration Branch Smoke Automation — Design Spec

**Date:** 2026-04-17
**Status:** draft (post-brainstorm, pre-plan; iteration 5 — post-self-review: envelope-path consistency, NUMERIC serialization, cleanup-failure exit policy, seed ordering)
**Context:** One-shot, deterministic rehearsal for the `feat/affiliate-2a-foundation` branch before PR review/merge. Targets the runtime-wiring gap that unit tests mock out across SP1 (2B end-user), SP2 (2C admin), SP3 (2E fraud + rate-limit), SP4 (2F billing hook). SP0 (email provider) is exercised only as a side-effect of probes that generate outbound mail; no explicit SP0 probe.
**Related:** `BRANCH_NOTES-affiliate-migration.md` §"Known residual gaps" item 1.

---

## 1. Goals

1. **Runtime plumbing assertion** — container composition, plugin registration, middleware chain, DB writes against the real local stack, across all 4 additive sub-projects.
2. **Root-cause on failure** — each probe emits either PASS, or FAIL with an explicit `expected vs. actual` diagnostic sufficient to localize the break to a single file path or service.
3. **Deterministic & idempotent** — same exit code on back-to-back runs; no orphan rows after a clean or an interrupted run.
4. **Cheap** — `<45 s` wall time after preflight for 16 probes; no new runtime deps in `apps/*`; devDeps limited to what's already installed (`tsx`, `@supabase/supabase-js`, `stripe`).
5. **CI-friendly** — `--json` output emits a machine-readable summary that a pipeline can parse without screen-scraping.

### Non-goals

- Replacing unit/integration tests. Probes verify plumbing, not logic branches.
- Full UI click-through. 6 residual manual items (clipboard, `localStorage` `bt.ref`, PIX CPF client validation, payout button disabled tooltip, approve/pause dialog confirmation, skipped-2F error fallback toast) remain manual, ~5 min.
- SP0 email wiring beyond side-effect paths. Covered by `apps/api/src/lib/email/__tests__/smtp.integration.test.ts`.
- SP3 fraud-engine end-to-end. Covered by `affiliate-fraud-flow.test.ts` (`describe.skip` + `TODO-test`); activating that stub is a separate task in 2E spec §5.
- Next.js rewrite layer (port 3000 → 3001). Covered by apps/app `middleware.ts` unit tests + runtime boot in BRANCH_NOTES §Verification. Probes hit apps/api directly on `:3001` with `X-Internal-Key` + `x-user-id`, per the service-to-service trust model declared in CLAUDE.md §Security.

---

## 2. Prerequisites (user-driven)

Minimum running services. Preflight fails fast on any miss.

| Service | Start command | Port | Health probe |
|---|---|---|---|
| Supabase local | `npm run db:start` | 54321 (REST), 54322 (Postgres) | `supabase-js.auth.admin.listUsers({perPage:1})` with service-role key — returns `{data, error:null}` |
| apps/api | `npm run dev:api` | 3001 | `GET http://localhost:3001/health` returns 200 (route at `apps/api/src/routes/health.ts`) |

Dropped from preflight (rationale each):
- **MailHog** — no SP0 probe in the current inventory; re-add only if a probe asserts inbox state.
- **apps/app (`:3000`)** — probes bypass the rewrite layer (§1 non-goals). Running apps/app buys nothing.
- **Inngest dev server** — not exercised by any probe; orthogonal.

Environment is read from `apps/api/.env.local`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_API_KEY`, optionally `STRIPE_WEBHOOK_SECRET` (SP4 gating — see §5).

**Safety interlock:** if `SUPABASE_URL` is not `http://localhost:*` or `http://127.0.0.1:*`, preflight aborts with exit 2 and a message pointing at the foot-gun. Override with `--force` (non-interactive; documented for CI-against-staging use, not dev).

---

## 3. Architecture

```
scripts/
├── smoke-affiliate.ts              ← entry; `tsx scripts/smoke-affiliate.ts [flags]`
└── smoke/
    ├── cli.ts                      ← flag parsing (--only, --json, --no-cleanup, --help, --force, --cleanup-orphans, --timeout)
    ├── preflight.ts                ← 2 health checks + env validation; also resolves apiUrl, supabaseUrl, internalKey
    ├── fixture.ts                  ← seed() + cleanup(); single module because they share handles and table order
    ├── http.ts                     ← fetch wrapper: injects X-Internal-Key + x-user-id, returns { status, headers, body } (body parsed as JSON if possible). Envelope interpretation is per-probe — affiliate package uses `{success, data, error?}`, /ref rate-limit errors use `{data, error}`, /billing/webhook is opaque. The wrapper stays envelope-agnostic.
    ├── stripe-helpers.ts           ← builds signed Stripe test events via stripe.webhooks.generateTestHeaderString
    ├── reporter.ts                 ← normal/quiet/verbose/JSON output; collects {id, sp, desc, status, detail, durationMs}
    └── probes/
        ├── sp1.ts                  ← 3 probes
        ├── sp2.ts                  ← 6 probes
        ├── sp3.ts                  ← 4 probes
        └── sp4.ts                  ← 3 probes
```

### Probe contract

```ts
export interface Probe {
  id: string;                  // "SP1-1", "SP3-2a" etc.; unique, sortable
  sp: 1 | 2 | 3 | 4;
  desc: string;                // one-line human label (goes into the report)
  timeoutMs?: number;          // default 10_000; SP3-1 overrides to 20_000
  run(ctx: ProbeContext): Promise<ProbeOutcome>;
}

export interface ProbeOutcome {
  status: 'pass' | 'fail' | 'skip';
  detail?: string;             // fail: "expected X, got Y (at <url>)"; skip: reason
}

export interface ProbeContext {
  fixture: SeedHandles;        // see §4
  baselines: Baselines;        // snapshots captured post-seed (e.g. pendingCommissionCount)
  apiUrl: string;              // http://localhost:3001
  supabase: SupabaseClient;    // service-role, for DB assertions
  internalKey: string;
  stripeWebhookSecret: string | null;
}

export interface SeedHandles {
  adminUserId: string;
  affiliateOwnerUserId: string;
  referredUserId: string;
  affiliateId: string;
  affiliateCode: string;       // 9 chars, e.g. "SMKa3f1e2"
  referralId: string;
  organizationId: string;
  commissionId: string;        // the seeded pending commission (used by SP1-2)
  fraudFlagId: string;
  // Note: no contentSubmissionId — no GET-list endpoint exists in @tn-figueiredo/affiliate;
  // content-submission seeding was removed in v4.
}

export interface Baselines {
  pendingCommissionCountForAffiliate: number; // captured immediately after seed + commissionId row
}
```

`http.ts` owns one subtlety: it NEVER retries on network error. Smoke must be deterministic; a flaky run is a broken stack, not something to paper over.

### Probe execution order

Strict, sequential, enforced by the main loop. Pause is the only irreversible admin mutation exposed by `@tn-figueiredo/affiliate-admin` (there is no re-activate endpoint; the "approve" endpoint takes full contract params and is for pending→approved, not paused→active). SP2-pause therefore runs LAST so earlier probes see an `active` affiliate.

```
SP1-1, SP1-2, SP1-3      ← end-user reads; no state mutation
SP4-1, SP4-2, SP4-3      ← billing webhook; appends to affiliate_commissions
SP2-1, SP2-2, SP2-3,     ← admin reads (fraud-flags list, overview, detail)
SP2-4                    ← admin read (payouts list)
SP2-5 (resolve flag)     ← mutates fraud_flags.status (affiliate status unchanged)
SP3-1, SP3-2, SP3-3,     ← rate-limit on /ref/<code>; requires affiliates.status='active'
SP3-4                    ← scope isolation check
SP2-6 (pause) ← TERMINAL  ← flips affiliates.status to 'paused'; no subsequent probe depends on active
```

`--only=SP<N>` runs only that sub-project's probes; seed + cleanup + baselines always execute. Note: with `--only=SP2`, the terminal pause still runs (it's the last SP2 probe); cleanup removes the affiliate afterward.

---

## 4. Fixture

The fixture provisions **three distinct users** to exercise realistic role separation without cross-triggering fraud:

- **admin user** — owns a `user_roles` row (`role='admin'`). Used as `x-user-id` for all SP2 probes.
- **affiliate-owner user** — owns the seeded affiliate. Used as `x-user-id` for all SP1 probes.
- **referred user** — signed up via the affiliate's code; owns the seeded organization. The `invoice.payment_succeeded` in SP4-1 is on this user's subscription.

Mixing them would either (a) gate admin on self-affiliate (confusing), or (b) let the fraud engine potentially flag self-referral when SP4-1 runs. Three users is the cleanest.

### Tables written

| Table | Row | Key fields |
|---|---|---|
| `auth.users` ×3 | admin, affiliate-owner, referred | Created via `supabase.auth.admin.createUser({ email, password, email_confirm: true })` — the Admin API. Password is `crypto.randomUUID()` per user (unreferenced — probes never sign in with password, they use `X-Internal-Key` + `x-user-id`; the value exists only to satisfy gotrue's password-not-empty check). Never direct SQL into `auth.users`. |
| `user_roles` | admin grant | `user_id = <admin>`, `role = 'admin'` |
| `organizations` | referred user's org | `name = 'Smoke Org <runId>'`, `slug = 'smoke-<runId>'` (unique constraint), `plan = 'free'` (schema default sufficient). **No owner column** — ownership is expressed via `org_memberships` per the schema in `20260412224635_organizations.sql`. |
| `org_memberships` | primary membership | `org_id = <smoke org>`, `user_id = <referred>`, `created_at = now()` — the `getOrg` convention (`apps/api/src/routes/billing.ts:19-27`) picks the earliest-created membership as the billing-recipient user |
| `affiliates` | **active**, tier=nano | `user_id = <affiliate-owner>`, `code = 'SMK<runId>'` (9 chars; schema `VARCHAR(12)`), `status = 'active'` (**not `'approved'`** — verified: `CalculateAffiliateCommissionUseCase` gates on `status === 'active'`; an `'approved'` affiliate silently no-ops the commission hook, which would mask a real wire break), `tier = 'nano'`, `commission_rate = 0.1500`, `name` + `email` set from affiliate-owner fields, `contract_version = 1`, `contract_accepted_at = now()` (approval prerequisites typically set by the approve use case; seeded directly to skip the approval flow in smoke) |
| `affiliate_referrals` | active | `affiliate_id = <affiliate>`, `affiliate_code = 'SMK…'`, `user_id = <referred>` (UNIQUE constraint), `attribution_status = 'active'`, `signup_date = now()`, `window_end = now() + INTERVAL '12 months'` |
| `affiliate_commissions` | pending (SP1-2 fixture) | `affiliate_id = <affiliate>`, `referral_id = <referral>` (NOT NULL FK), `user_id = <referred>`, `payment_amount = 9900`, `stripe_fee = 434`, `net_amount = 9466`, `commission_rate = 0.1500`, `commission_brl = 1420`, `total_brl = 1420` (all INTEGER centavos). Values verified to match `CalculateAffiliateCommissionUseCase` formula exactly (`netAmount = paymentAmount - stripeFee`; `commissionBrl = Math.round(netAmount * commissionRate)`; `totalBrl = commissionBrl + (fixedFeeBrl ?? 0)`). `payment_type = 'monthly'`, `status = 'pending'` |
| `affiliate_fraud_flags` | open (SP2-1, SP2-5 fixture) | `affiliate_id = <affiliate>`, `flag_type = 'self_referral_ip_match'`, `severity = 'low'`, `status = 'open'` |

`affiliate_content_submissions` was seeded in v3 for an SP1-3/SP2-5 pair of probes, but verification against `@tn-figueiredo/affiliate` showed there is no GET-list endpoint for content submissions (only `POST /content-submissions` for create and `PUT /content-submissions/:id/review` for review). The row would be unobservable through the API. Dropped from the fixture in v4 to avoid seeding dead state.

### Identifier scheme

`runId = crypto.randomUUID().replace(/-/g,'').slice(0,6)` — 6 lowercase hex chars (~16 M combinations, ample for human-triggered runs) → used in email (`smoke-<runId>-{admin,owner,ref}@brighttale.test`), affiliate code (`SMK<runId>` → 9 chars, under the schema's `VARCHAR(12)` cap), content URL slug, org name, org slug.

The fingerprint makes orphans trivially discoverable: `--cleanup-orphans` mode queries `auth.users` by email-prefix `smoke-` + `@brighttale.test`, then cascades deletes per the order below. Useful after an OOM kill or `kill -9`.

### Cleanup order (reverse FK)

```
affiliate_fraud_flags → affiliate_commissions → affiliate_referrals →
  affiliates → org_memberships → organizations →
  user_roles → auth.users ×3
```

Delete scoping:
- `affiliate_commissions`: scoped by `affiliate_id = fixture.affiliateId` (NOT by single id). SP4-1 creates additional commission rows during the run; scoping by id would leak them. The other tables have a single seeded row with a known id and are scoped by id.
- All other tables scoped by id from returned `SeedHandles`.
- `--cleanup-orphans` mode instead scopes everything by `auth.users.email LIKE 'smoke-%@brighttale.test'`, deleted bottom-up.

### Seed order (explicit, respects FK chain)

```
auth.users ×3  →  user_roles (admin grant; needs admin user)  →
  organizations (standalone, no FK)  →
  org_memberships (FK → org + user)  →
  affiliates (FK → affiliate-owner user)  →
  affiliate_referrals (FK → affiliate + referred user)  →
  affiliate_commissions (FK → affiliate + referral + referred user)  →
  affiliate_fraud_flags (FK → affiliate)
```

On any insert failure mid-chain, the partial handles collected so far drive a best-effort reverse-order cleanup before exit 3.

### Baselines captured post-seed

After the fixture settles, `baselines.pendingCommissionCountForAffiliate = SELECT count(*) FROM affiliate_commissions WHERE affiliate_id = <smoke> AND status = 'pending'` (= 1 from the seeded row). SP4 probes assert **deltas** against this baseline, not absolute counts — eliminates state-pollution ambiguity.

---

## 5. Probe inventory (16 probes)

### SP1 — end-user backend (3)

Headers on every probe: `X-Internal-Key: <key>`, `x-user-id: <affiliateOwnerUserId>`.

**Envelope contract** (verified against `node_modules/@tn-figueiredo/affiliate/dist/routes.js`): successful responses are `{success: true, data: <T>, error?: unknown}` — **not** the `{data, error: null}` convention. Error responses from admin gate failures are `{success: false, error: "Forbidden"}` (raw string). Probes assert `success === true` + `data` shape; error-path probes assert `success === false`.

| ID | URL + method | Assertions |
|---|---|---|
| SP1-1 | `GET /affiliate/me` | HTTP 200; `body.success === true`; `body.data.code === fixture.affiliateCode` (exact); `body.data.tier === 'nano'`; `body.data.status === 'active'` |
| SP1-2 | `GET /affiliate/me/commissions` (confirmed route — not `/commissions/recent`) | HTTP 200; `body.success === true`; `body.data` is a **bare array** (not wrapped in `items`); at least one element has `id === fixture.commissionId` |
| SP1-3 | `GET /affiliate/referrals` (substitutes the nonexistent `GET /content` — the package exposes `POST /content-submissions` only; `GET /referrals` is the closest read endpoint that has fixture data to match) | HTTP 200; `body.success === true`; `body.data` is a bare array; at least one element has `id === fixture.referralId` and `attributionStatus === 'active'` (camelCase — the package deserializes to camelCase; the DB column is `attribution_status` but the JSON key is `attributionStatus`). |

### SP2 — admin backend (6)

Headers on every probe: `X-Internal-Key: <key>`, `x-user-id: <adminUserId>`. Admin gate is inline per-handler (`await deps.isAdmin(req) ? continue : 403 {success:false, error:'Forbidden'}`) — verified in `node_modules/@tn-figueiredo/affiliate-admin/dist/routes.js`.

Route paths resolved (package verified): prefix `/admin/affiliate` + local paths. No filterable list endpoint for affiliates (only `/` overview + `/:id` detail). No standalone content-submissions list endpoint. Fraud-flags HAS a filterable list with `affiliateId` query — used for SP2-1 instead of the nonexistent affiliates filter.

| ID | URL + method | Assertions |
|---|---|---|
| SP2-1 | `GET /admin/affiliate/fraud-flags?affiliateId=<fixture.affiliateId>` (filterable fraud-flags list; confirmed route) | HTTP 200; `body.success === true`; `body.data` contains exactly one element with `id === fixture.fraudFlagId` + `status === 'open'` |
| SP2-2 | `GET /admin/affiliate/` (overview — no filter param exists; pagination may apply) | HTTP 200; `body.success === true`; among the returned affiliates, at least one has `id === fixture.affiliateId`. If the default page size truncates below the fixture, the probe paginates (up to 5 pages) before failing. |
| SP2-3 | `GET /admin/affiliate/<fixture.affiliateId>` (detail route) | HTTP 200; `body.success === true`; `body.data.id === fixture.affiliateId`; `body.data.status === 'active'` |
| SP2-4 | `GET /admin/affiliate/payouts` (confirmed route — not `/payouts/pending`) | HTTP 200; `body.success === true`; `body.data` is well-formed (may be empty — seeded commission is `pending`, not payout-queued). Validates route + admin-gate wire. |
| SP2-5 | `POST /admin/affiliate/fraud-flags/<fixture.fraudFlagId>/resolve` body `{status:'false_positive', notes:'smoke', pauseAffiliate:false}` (field is `status`, **not `resolution`** — verified in package Zod schema) | HTTP 200; `body.success === true`; DB re-read `affiliate_fraud_flags.status === 'resolved'` |
| SP2-6 | `POST /admin/affiliate/<fixture.affiliateId>/pause` with **no body** (implementation ignores request body; confirmed `deps.pauseUseCase.execute(id)` with no schema parsing) | HTTP 200; `body.success === true`; DB re-read `affiliates.status === 'paused'`. Terminal probe — affiliate stays paused until cleanup. |

**Admin-gate negative probe (optional, SP2-7 — deferred):** a probe that calls SP2-4 with `x-user-id: <affiliateOwnerUserId>` (non-admin) and asserts `403 {success:false, error:'Forbidden'}` would round out admin-gate wire verification. Deferred to keep the probe count at 16; the package's own tests already exercise the gate.

### SP3 — rate-limit wire (4)

All probes use synthetic source IPs in TEST-NET-2 (`198.51.100.0/24`) via `x-forwarded-for` + `trustProxy:true` (verified at `apps/api/src/index.ts:75`). Host-dev IP bucket untouched; reruns only pollute synthetic buckets, whose TTL is `REF_RATE_LIMIT_WINDOW` (default `1 minute`).

`MAX = Number(process.env.REF_RATE_LIMIT_MAX ?? 30)` resolved at probe start; both the burst count and the header-value assertion derive from this constant, so a dev-local override doesn't cause a false fail.

| ID | Action | Assertions |
|---|---|---|
| SP3-1 | `MAX×` `GET /ref/<affiliateCode>` with `x-forwarded-for: 198.51.100.1` | every response: HTTP 302; `Location` header contains `affiliateCode` (ensures 302 is the happy-path redirect, not an error redirect). Timeout raised to 20s for this probe only — default 10s might be tight on cold-cache dev. |
| SP3-2 | `(MAX+1)`th `GET /ref/<affiliateCode>` same IP | HTTP 429; body `{data: null, error: {code: 'RATE_LIMITED', ...}}`; headers: `x-ratelimit-limit === String(MAX)`, `x-ratelimit-remaining === '0'`, `retry-after` present and parseable as positive integer |
| SP3-3 | 1× `GET /ref/<affiliateCode>` with `x-forwarded-for: 198.51.100.2` | HTTP 302 + `Location` with code (confirms fresh-IP bucket isolation) |
| SP3-4 | `GET /affiliate/me` (with `x-user-id: <affiliateOwnerUserId>`, no `x-forwarded-for`) | HTTP 200 (confirms rate-limit scope is `/ref/*` only, not other routes; complements SP1-1 result) |

### SP4 — Stripe webhook hook (3)

**Gating:** reads `STRIPE_WEBHOOK_SECRET` from env. If unset, all three SP4 probes emit `skip` with detail `"STRIPE_WEBHOOK_SECRET not set in apps/api/.env.local — Stripe webhook path unexercised"`. Skipped-only does not fail the run.

Signatures via `stripe.webhooks.generateTestHeaderString({ payload: body, secret })` — the production path `stripe.webhooks.constructEvent` will verify identically.

Event payloads are hand-built `Stripe.Invoice` literals. Each carries `subscription.metadata.org_id = fixture.organizationId` and a known `priceId` that `planFromPriceId` (mocked or real — plan chooses) maps to `{planId:'creator', cycle:'monthly'}`. Commission math per `AFFILIATE_CONFIG.tierRates.nano = 0.15`.

| ID | Event shape | Assertions |
|---|---|---|
| SP4-1 | `invoice.payment_succeeded`, `billing_reason='subscription_cycle'`, `amount_paid=9900` (99 BRL, integer centavos) | HTTP 200. DB re-read: exactly one NEW `affiliate_commissions` row for `fixture.affiliateId` beyond the baseline — i.e. `count(status='pending') === baselines.pendingCommissionCountForAffiliate + 1`. New-row assertions: `status='pending'`, `affiliate_id=fixture.affiliateId`, `referral_id=fixture.referralId`, `payment_amount=9900` (integer, direct), `Number(commission_rate) === 0.15` (NUMERIC(5,4) arrives from supabase-js as a string `"0.1500"`; coerce before compare), `total_brl > 0` (actual centavo value is unit-tested territory — smoke asserts the wire, not the math). |
| SP4-2 | Same event shape, but `billing_reason='subscription_update'` | HTTP 200; post-run commission count equals SP4-1's post-count (no new row). Event-type filter wire verified. |
| SP4-3 | `billing_reason='subscription_cycle'`, `amount_paid=0` | HTTP 200; post-run commission count equals SP4-2's post-count (no new row). The `amount_paid=0` short-circuit is verified by the count assertion alone — no timing heuristic, no log scraping. |

---

## 6. Failure & error handling

- **Preflight failure** → exit 2 (distinguishes pre-run from run failures), no seed, no cleanup.
- **Seed failure** → exit 3, best-effort cleanup on whatever handles succeeded.
- **Probe failure** → collected, non-halting. Report shows exact `expected vs. actual`.
- **Cleanup failure** → if *any* cleanup row fails to delete, exit code becomes 5 (previously-silent foot-gun). Report prints the list of orphan IDs so `--cleanup-orphans` can reconcile. Intentionally disjoint from probe-failure exit 1, so CI can distinguish "test caught a regression" from "test left rows behind".
- **Script-level timeout** → `--timeout=N` (default 180s). On expiry: print "timeout", run cleanup, exit 124 (timeout exit convention).
- **Signal handling** → explicit `process.on('SIGINT', handleSignal)` and `SIGTERM`. Handler runs cleanup once (re-entrance guarded by flag), then `process.exit(130)` (SIGINT convention). Second signal while cleanup runs short-circuits: prints orphan IDs to stderr for `--cleanup-orphans` reconciliation, then `process.exit(130)` regardless (the signal exit code dominates — cleanup abort is implied by the orphan log, not a separate exit code).

### Exit-code matrix

| Exit | Meaning |
|---|---|
| 0 | All probes PASS or SKIP, 0 FAIL |
| 1 | ≥1 FAIL among probes |
| 2 | Preflight failure |
| 3 | Seed failure |
| 5 | Cleanup failure (probes may have passed; rows leaked) |
| 124 | Timeout hit |
| 130 | SIGINT |

Skipped-only (e.g., no Stripe secret) is exit 0. Report makes the skip explicit so CI dashboards can distinguish.

---

## 7. Reporter

### Default (terminal, `--normal`)

```
Affiliate branch smoke rehearsal — runId a3f1e2
───────────────────────────────────────────────

Preflight (2)
  ✓ supabase @ http://localhost:54321            (128 ms)
  ✓ api      @ http://localhost:3001             (14 ms)

Seed
  ✓ 3 auth users   smoke-a3f1e2-{admin,owner,ref}@brighttale.test
  ✓ admin grant
  ✓ org + membership
  ✓ affiliate SMKa3f1e2 (tier=nano, rate=0.1500, status=active)
  ✓ referral (attribution_status=active)
  ✓ commission (pending, total_brl=1420 centavos)
  ✓ fraud flag (open)
  ℹ baseline.pendingCommissions = 1

Probes (16)
  SP1-1  GET /affiliate/me                             pass    12 ms
  SP1-2  GET /affiliate/me/commissions                 pass     8 ms
  SP1-3  GET /affiliate/referrals                      pass     9 ms
  SP4-1  webhook subscription_cycle → commission +1    pass    47 ms   (new row, total_brl>0, rate=0.1500)
  SP4-2  webhook subscription_update → no delta        pass    39 ms
  SP4-3  webhook amount_paid=0 → short-circuit         pass    22 ms
  SP2-1  GET /admin/affiliate/fraud-flags?affiliateId= pass    14 ms
  SP2-2  GET /admin/affiliate/ overview                pass    15 ms
  SP2-3  GET /admin/affiliate/<id> detail              pass    11 ms
  SP2-4  GET /admin/affiliate/payouts                  pass    10 ms
  SP2-5  POST /admin/affiliate/fraud-flags/<id>/resolve pass   19 ms
  SP3-1  /ref × 30 (IP .1, within limit)               pass   345 ms
  SP3-2  /ref 31st (IP .1) → 429 + headers             pass    12 ms
  SP3-3  /ref (IP .2) → 302 fresh bucket               pass     9 ms
  SP3-4  /affiliate/me after exhaustion                pass    10 ms
  SP2-6  pause affiliate (TERMINAL)                    pass    23 ms

Cleanup
  ✓ 11 rows removed (1 flag, 2 commissions, 1 referral, 1 affiliate, 1 membership, 1 org, 1 role, 3 users)

Summary
  16 pass · 0 fail · 0 skip · elapsed 842 ms · exit 0
```

### `--json`

```json
{
  "runId": "a3f1e2",
  "preflight": {"status":"pass","services":[{"name":"supabase","url":"http://localhost:54321","durationMs":128},{"name":"api","url":"http://localhost:3001","durationMs":14}]},
  "seed":{"status":"pass","handles":{"adminUserId":"…","affiliateId":"…", "…":"…"}, "baselines":{"pendingCommissionCountForAffiliate":1}},
  "probes":[{"id":"SP1-1","sp":1,"desc":"GET /affiliate/me","status":"pass","durationMs":12,"detail":null}, ...],
  "cleanup":{"status":"pass","rowsRemoved":11},
  "summary":{"pass":16,"fail":0,"skip":0,"elapsedMs":842,"exitCode":0}
}
```

### `--quiet`

Suppresses per-probe lines. Only the final summary (`16 pass · 0 fail · 0 skip · exit 0`) is printed.

### `--verbose`

On FAIL only, dumps request URL, headers (with `INTERNAL_API_KEY` redacted), response status, response body (truncated to 4 KiB). No-op on PASS to keep the report readable.

---

## 8. CLI

```
tsx scripts/smoke-affiliate.ts [flags]

Flags:
  --only=SP1|SP2|SP3|SP4     Run only one sub-project's probes (seed + cleanup still execute)
  --json                     Machine-readable summary on stdout (log lines go to stderr)
  --quiet                    Suppress per-probe lines
  --verbose                  Emit request/response bodies on FAIL only
  --no-cleanup               Leave fixture rows; prints their IDs. Useful for debugging.
  --cleanup-orphans          Skip seed+probes; run email-pattern-scoped cascade delete, then exit.
  --force                    Bypass the "SUPABASE_URL not localhost" safety interlock.
  --timeout=180              Global timeout in seconds. Default 180.
  --help, -h                 Print this usage and exit 0.

Env:
  Reads apps/api/.env.local for SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INTERNAL_API_KEY, STRIPE_WEBHOOK_SECRET.
  No CLI override for these — if the dev stack is configured correctly, the script reads it automatically.
```

`npm run smoke:affiliate` registered in root `package.json` and forwards args: `"smoke:affiliate": "tsx scripts/smoke-affiliate.ts"`.

---

## 9. Assumptions & risks (residual)

1. **Service-to-service trust model** — direct probes on `:3001` set `x-user-id` themselves. In production, `apps/app/middleware.ts` strips client-supplied `x-user-id` and injects the session-derived one; the security model is "anyone with `INTERNAL_API_KEY` can act as any user". This smoke leverages that deliberately. Any reader who expects session-cookie auth should stop here — the spec relies on the INTERNAL_API_KEY + x-user-id contract documented in `CLAUDE.md §Security` and `apps/api/src/middleware/authenticate.ts`.
2. **Package envelope is `{success, data, error?}`, not `{data, error}`** — verified in v4 against `@tn-figueiredo/affiliate/dist/routes.js` and `@tn-figueiredo/affiliate-admin/dist/routes.js`. This is a pre-existing deviation from CLAUDE.md's `{data, error}` canonical envelope; the affiliate packages emit Express-style envelopes. Probes assert the package shape, not the project convention. If the packages ever conform to `{data, error}` (via major version bump), SP1/SP2 assertions break loudly — that's a welcome smoke signal, not a bug.
3. **Commission math decoupled from smoke on purpose** — SP4-1 asserts only `total_brl > 0` + `commission_rate = 0.1500` + row-identity fields. The exact centavo-by-centavo math (fee formula, rounding mode, rate × net vs × gross) is unit-tested territory owned by `CalculateAffiliateCommissionUseCase`'s test suite. A smoke that duplicated the math would silently absorb drift when the formula changes. The wire-level check here proves "hook fired and a well-shaped row landed", which is what runtime smoke exists to prove.
4. **`affiliate_commissions` schema drift** — seed uses a fixed column set; if a migration adds a `NOT NULL` column without default, seed fails explicitly (insert error → exit 3), which is the correct behavior.
5. **Concurrent runs against same local stack** — two humans running simultaneously would fight over synthetic IPs (collision on `198.51.100.1`). Script documents "one at a time per host" in its `--help` text; no coordination primitive (lock-file is disposable complexity).
6. **Rate-limit header name contract** — `@fastify/rate-limit` emits `x-ratelimit-*` headers by default; asserted in `apps/api/src/__tests__/ref-rate-limit.test.ts` test #3. Plan task 1 re-runs that test and grep-confirms header names before the SP3-2 probe is written, catching package upgrades that silently rename headers.
7. **Supabase Admin API latency** — `auth.admin.createUser` occasionally takes ~1 s on a cold local Supabase. Seed has no per-step timeout; the global `--timeout=180` (default) absorbs cold starts. Users with `SUPABASE_ANALYTICS_ENABLED` disabled and the stack warm should expect `<2 s` for the 3-user seed.
8. **Stripe SDK version** — `stripe.webhooks.generateTestHeaderString` exists since SDK v13+. Script reads `node_modules/stripe/package.json` version in preflight to fail clearly if older.
9. **PauseUseCase synchronicity** — SP2-6's DB-reread assertion assumes `pauseUseCase.execute(id)` is synchronous-enough that a follow-up SELECT sees `status='paused'`. Verified: `node_modules/@tn-figueiredo/affiliate/dist/index.js:785-789` shows `execute` is `async execute(id) { const a = await repo.findById(id); if (!a) throw …; return repo.pause(id); }` — no queue, no background job, direct await on repo.pause (which is a supabase `UPDATE ... RETURNING ...`). The HTTP reply lands AFTER the UPDATE commits, so probe's post-reply DB re-read is causally correct.
10. **NUMERIC serialization** — Postgres `NUMERIC(5,4)` columns (e.g. `commission_rate`) arrive as JavaScript strings through `@supabase/supabase-js` (driver-level, not package-level). All equality checks on NUMERIC columns use `Number(col) === expected`. Integer columns (`payment_amount`, `total_brl`, etc.) arrive as numbers and compare directly.

---

## 10. Smoke-script self-test plan

Meta-assertion — how do we know the smoke script itself is correct?

1. **Happy-path run** — on a clean checkout at branch tip, `npm run smoke:affiliate` exits 0, 16 pass, 0 fail.
2. **Intentional break** (exercised manually once, documented in PR): disable fraud flag resolve endpoint in admin routes, re-run, verify SP2-5 fails with exit 1 and diagnostic `"expected affiliate_fraud_flags.status='resolved', got 'open'"`. Revert.
3. **Orphan cleanup** — run with `--no-cleanup`, capture row count, re-run with `--cleanup-orphans`, verify row count returns to baseline.
4. **SIGINT during SP3-1** — press Ctrl-C mid-30-request burst, verify cleanup runs, exit 130, DB has no smoke-prefixed rows.
5. **Idempotency** — run twice back-to-back, verify exit 0 both times (runId differs; no collisions on unique constraints).

---

## 11. Done criteria

- [ ] `npm run smoke:affiliate` registered in root `package.json`.
- [ ] `tsx scripts/smoke-affiliate.ts` with prerequisites running: exit 0, 0 FAIL, ≥13 PASS (16 PASS if `STRIPE_WEBHOOK_SECRET` is set; else 13 PASS + 3 SKIP), on two consecutive runs without intermediate cleanup (idempotency).
- [ ] `--json` output validates against a schema type declared in `scripts/smoke/types.ts` (self-documenting).
- [ ] `--cleanup-orphans` mode verified to remove rows left by `--no-cleanup`.
- [ ] `SIGINT` during probes verified to leave 0 orphan rows.
- [ ] Intentional-break exercise (§10.2) performed once; diagnostic quality confirmed.
- [ ] `BRANCH_NOTES-affiliate-migration.md` §"Known residual gaps" item 1 marked resolved with link to the first green run's captured output.
- [ ] Script header comment documents: one-at-a-time per host, TEST-NET-2 synthetic IPs, service-role DB access, requires local Supabase.

---

## 12. Coverage traceability

Mapping probes back to the BRANCH_NOTES §"Known residual gaps" item 1 sub-points, so the reviewer can see exactly what each probe is proving.

| Gap (from BRANCH_NOTES) | Probes that close it |
|---|---|
| Admin UI (SP2) → fraud service (SP3) end-to-end flow | SP2-1 (list fraud flags filtered by affiliateId, confirms list route + admin gate) + SP2-5 (resolve flag via admin route → DB status flip, confirms mutation route + service-role DB + package fraud-repo wire) |
| Billing webhook (SP4) → commission hook (2A container) | SP4-1/2/3 — prove the Stripe webhook dispatcher → `CalculateAffiliateCommissionUseCase` → `SupabaseAffiliateCommissionRepository` chain is wired, reacts to event-type filters, and returns the null-no-op on non-matching events |
| End-user UI (SP1) → /api/affiliate/* routes | SP1-1/2/3 — prove the /affiliate scope + authenticate middleware + end-user use cases (me, commissions, referrals) return seeded data with the expected `{success, data}` envelope |
| Admin route registration (SP2 wire at all) | SP2-2 (overview), SP2-3 (detail), SP2-4 (payouts), SP2-6 (pause) — prove `registerAffiliateAdminRoutes` is composed into the `/admin/affiliate` scope and the inline `isAdmin` gate fires per handler |
| Rate-limit plugin registered at /ref scope (SP3) | SP3-1/2 — prove `@fastify/rate-limit` registration took effect on the /ref scope; SP3-3 proves keyGenerator uses forwarded IP (trustProxy wired); SP3-4 proves scope isolation |
| Container ctor-chain composes at boot (SP0 + SP2 + SP3 + SP4) | Implicitly exercised by every probe — any wiring regression surfaces as a 500 or a missing-dep error on the first call that needs the broken dep |

Gaps NOT closed here (stay on the manual/deferred list):
- SP1 UI-only: clipboard paste, localStorage `bt.ref`, PIX CPF client validation, payout button disabled tooltip, approve/pause dialog click-through, skipped-2F error fallback toast
- SP3 fraud-engine full E2E: tracked as the `affiliate-fraud-flow.test.ts` TODO in 2E spec §5
- Next.js rewrite layer: trusted via unit tests + runtime boot log in BRANCH_NOTES §Verification
