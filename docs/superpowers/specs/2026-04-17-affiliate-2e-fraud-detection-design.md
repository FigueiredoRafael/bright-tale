# Affiliate Phase 2E — Fraud detection + `/ref/:code` rate-limit — Design Spec

**Date:** 2026-04-17
**Status:** draft (post-brainstorm, pre-plan)
**Context:** Sub-project 3 of the affiliate-migration long-lived branch
`feat/affiliate-2a-foundation`. Closes the two gaps accepted in Phase 2A
(§9 R9 + R15): (a) `AttributeSignupToAffiliateUseCase` currently receives
`undefined` where `IAffiliateFraudDetectionService` should go, so self-referral
checks are silently skipped; (b) `GET /ref/:code` is public and un-rate-limited,
allowing an affiliate to spam their own code to inflate `total_clicks`. Both
are classified **High (financial)** in the 2A risk register and were deferred
to this sub-project.

---

## 1. Context & Goals

### Background

Phase 2A wired all four `@tn-figueiredo/affiliate@0.4.0` route helpers and
instantiated `AttributeSignupToAffiliateUseCase` with `undefined` for its
third constructor argument (the optional fraud-detection service). That use
case is invoked by the signup flow whenever a user arrives via `?ref=CODE`.
When the fraud service is `undefined`, the use case short-circuits the
`checkSelfReferral` call — no-op semantics, not even logged — which in turn
means the `affiliate_fraud_flags` and `affiliate_risk_scores` tables (wired
and RLS-protected in 2A) are never populated by runtime traffic. Admin UI
(planned 2C) shows empty lists. An affiliate can sign up a second account
through their own code and the system will never flag it.

The published package `@tn-figueiredo/fraud-detection@0.2.0` (verified on
`npm.pkg.github.com` 2026-04-17) ships a generic `FraudDetectionEngine<T>`
that implements six detection patterns (self-referral IP match, email
similarity, IP cluster, signup burst, device cluster, suspicious pattern),
maintains weighted risk scores, and can auto-pause entities above a
configurable threshold. Consumer responsibilities are narrow: implement
`IFraudRepository`, implement `IEntityRepository<Affiliate>`, provide an
`onAdminAlert` callback, and call `hashIp()`/`fingerprintDevice()` from the
sibling utilities package before passing data in.

The 2A repository already exposes `affiliate_fraud_flags` and
`affiliate_risk_scores` tables with a column schema that is **structurally
equivalent** to the upstream `fraud_flags` / `risk_scores` schema — only the
column names differ (`affiliate_id` vs `entity_id`). The engine's
`IFraudRepository` is an abstract port; the column-name difference is
absorbed inside the consumer's repo impl. **We do not apply the package's
migrations** (001_schema.sql, 002_indexes.sql) because equivalent tables
already exist under the `affiliate_` prefix. §4 covers the adapter layer.

Separately, `GET /api/ref/:code` is registered on the root `apps/api` scope
(no auth, no rate-limit) as the redirect target for `https://brighttale.io/r/CODE`
marketing links. Any adversary — including the affiliate themselves — can
issue unbounded requests, each incrementing the click counter. The 2A spec
accepts the risk "because Fastify rate-limit can be added in <1d patch"; this
sub-project does exactly that.

### Goals

1. Install `@tn-figueiredo/fraud-detection@0.2.0` with `--save-exact` and its
   transitive dep `@tn-figueiredo/fraud-detection-utils@0.1.0` (auto-installed).
2. Implement `IAffiliateFraudDetectionService` (the narrow 1-method port from
   `@tn-figueiredo/affiliate`) as a thin adapter around `FraudDetectionEngine<Affiliate>`.
3. Implement `IFraudRepository` against the existing `affiliate_fraud_flags` /
   `affiliate_risk_scores` tables (name-remapping inside the adapter).
4. Implement `IEntityRepository<Affiliate>` by adapting the existing
   `SupabaseAffiliateRepository` (reuses `findById`, `pause`, `addHistory`).
5. Wire `onAdminAlert` through the existing `ResendAffiliateEmailService`
   (or the 2F-era `provider.sendEmail`; see §6 for the import decision).
6. Replace the `undefined` placeholder in `apps/api/src/lib/affiliate/container.ts`
   line 62 with a real `AffiliateFraudAdapter` instance.
7. Install `@fastify/rate-limit@^9` (v10 requires Fastify 5; repo is on
   Fastify 4) and apply it **scoped to the `/ref` prefix** so the limit
   affects only the public redirect, not the entire API.
8. Provide a `FRAUD_DETECTION_ENABLED=false` kill-switch for emergency
   rollback: when unset-or-`false`, `AttributeSignupToAffiliateUseCase`
   reverts to the 2A `undefined` behavior with zero code branches in the
   hot path.
9. Propagate the real client IP into `AttributeSignupToAffiliateUseCase`
   by extracting `x-forwarded-for` in the signup pipeline (or the
   `/ref/:code` click path) using `extractRealIp()` from
   `@tn-figueiredo/fraud-detection-utils`, hashing via `hashIp()`, and
   passing `signupIpHash` through the existing `options` arg.
10. Preserve CC-1 through CC-4 discipline: branch stays as
    `feat/affiliate-2a-foundation` (rename deferred per CC-1); rebase
    cadence per CC-2; Stripe/billing stays out (CC-3); local-only
    validation per CC-4.

### Non-goals (explicitly out of scope)

- **Upstream package migrations** for `fraud_flags` / `risk_scores` —
  2A already owns structurally equivalent tables. Applying 001/002 from
  the package would create duplicate tables with no foreign-key link to
  `affiliates`.
- **Admin UI for fraud flags / risk scores** — that's 2C. This sub-project
  populates the tables; the UI that displays them ships separately.
- **IP-cluster, signup-burst, device-cluster detection wiring** — the
  engine implements them, but they require historical IP/fingerprint data
  that BrightTale does not yet collect at scale. 2E activates
  `checkSelfReferral` only (the single path required by `AttributeSignupToAffiliateUseCase`).
  Other flag types become reachable in 2F+ when click/signup telemetry is richer.
- **Fraud admin actions** (approve flag, dismiss, mark false-positive) —
  route handlers exist via `ResolveFraudFlagUseCase` (wired in 2A); UI in 2C.
- **IP extraction at `/ref/:code`** — redirect route does not currently
  compute `signupIpHash`. Adding it requires changing the package route
  helper (not scoped here) or a consumer middleware (considered but not
  pursued — see §8 R4). IP hashing happens at the `/api/auth/signup`
  hand-off point where `AttributeSignupToAffiliateUseCase` is invoked.
- **`FraudDetectionConfig` tuning beyond defaults** — ship with
  `DEFAULT_FRAUD_CONFIG`; tune post-launch from observed false-positive rate.
- **`@fastify/rate-limit` Redis backend** — in-memory LRU (default)
  suffices for single-region Vercel deploy; Upstash Redis adapter is a
  2F+ concern if multi-region.
- **Rate-limit on other public routes** — no other affiliate route is
  public. `/api/auth/signup` already goes through `apps/app` SSR and is
  guarded there. Scope-creeping into auth rate-limit is out.
- **Stripe / billing** (deferred per CC-3).
- **SMTP via Sub-project 0** — Sub-project 0 (email provider abstraction)
  ships before this one on the same branch; fraud admin alerts route
  through `@/lib/email/provider.sendEmail` (post-SP0 module path).

---

## 2. Current State

### Container wiring (verified)

`apps/api/src/lib/affiliate/container.ts:62`:
```ts
const attributeUseCase = new AttributeSignupToAffiliateUseCase(
  repo, config, undefined /* fraud — 2E */
)
```

All six places the container references fraud are already connected to the
admin-side **reader** use cases (`ListAffiliateFraudFlagsUseCase`,
`ListAffiliateRiskScoresUseCase`, `ResolveFraudFlagUseCase`) via `adminDeps`.
Only the **writer** path (signup-time detection) is missing.

### Redirect route (verified)

`apps/api/src/index.ts:195-202`:
```ts
const affiliateContainer = buildAffiliateContainer();
server.register(async (scope) => {
  registerAffiliateRedirectRoute(scope as never, {
    webBaseUrl: affiliateContainer.config.webBaseUrl,
    trackClickUseCase: affiliateContainer.trackClickUseCase,
  });
}, { prefix: "/ref" });
```

The redirect is registered inside an **encapsulated child scope** (`async (scope)`
block), which makes it trivial to `register(rateLimitPlugin, ...)` inside the
same scope without polluting sibling routes. Fastify plugin encapsulation
(v4 semantics) guarantees the limit applies only to handlers attached below
`scope` and not to `/affiliate`, `/admin/affiliate`, or `/internal/affiliate`.

### Package interfaces (verified from tarballs)

From `@tn-figueiredo/affiliate@0.4.0/dist/fraud-admin-DiX4kqdI.d.ts:505`:
```ts
interface IAffiliateFraudDetectionService {
  checkSelfReferral(data: {
    affiliate: { id: string; email: string; knownIpHashes?: string[] }
    referral: { id: string }
    signupIpHash: string
    userId: string
    platform?: string
  }): Promise<void>
}
```

From `@tn-figueiredo/fraud-detection@0.2.0/dist/index.d.ts`:
```ts
class FraudDetectionEngine<T> {
  constructor(opts: {
    config?: Partial<FraudDetectionConfig>
    fraudRepo: IFraudRepository
    entityRepo: IEntityRepository<T>
    onAdminAlert?: OnAdminAlert
    logger?: IFraudLogger
  })
  checkSelfReferral(params: CheckSelfReferralParams): Promise<void>
  // ...
}
```

**Signature reconciliation:** `IAffiliateFraudDetectionService.checkSelfReferral`
takes `{ affiliate, referral, signupIpHash, userId, platform? }`.
`FraudDetectionEngine.checkSelfReferral` takes
`{ entity, referral, signupIpHash, userId, platform?, getUserEmail }`. The
adapter translates `affiliate → entity`, keeps the rest verbatim, and
supplies `getUserEmail` (a callback the engine uses for email-similarity
detection) by querying `auth.users.email` via the service-role Supabase
client. `platform` types also differ — adapter narrows `string → 'android'
| 'ios' | 'web' | null` with a single switch.

### Existing repository surface (verified)

`SupabaseAffiliateRepository` (aggregator, `apps/api/src/lib/affiliate/repository/index.ts`)
already exposes:
- `findById(id)` — `affiliate-query-repo.ts:36` ✓
- `pause(id, options?)` — `affiliate-lifecycle-repo.ts:32` ✓
- `addContractHistory(entry)` — `affiliate-history-repo.ts:8` ✓ (name drift
  vs fraud-engine's `IEntityRepository.addHistory`; adapter bridges)

All three signatures align after argument-shape mapping inside the adapter
(see §4 "Action-name mismatch" for the one non-trivial translation required).

### Fastify server instantiation (verified)

`apps/api/src/index.ts:68-94` instantiates `Fastify({ bodyLimit, logger, disableRequestLogging })`
with **no `trustProxy` option**. On Vercel this means `req.ip` returns the
Vercel proxy IP for every request. §7 Commit A step 6 adds `trustProxy: true`
as a mandatory precondition. Explicit `true` is safe — Fastify only honors
the `X-Forwarded-*` headers when set; Vercel always sets them.

### Action-name mismatch (important)

`FraudDetectionEngine.autoPauseEntity` (package source
`@tn-figueiredo/fraud-detection@0.2.0/dist/index.js:143-151`) calls
`entityRepo.addHistory({ action: 'paused_fraud', ... })`. The literal
`'paused_fraud'` is **not** in the `affiliate_contract_history.action`
CHECK constraint (migration `20260417000004_affiliate_004_contract.sql:6-9`
permits only `approved / paused / terminated / contract_renewed /
proposal_{created,accepted,rejected,cancelled}`). Without translation the
insert fails, the engine logs an error, and the pause row silently never
lands — detection loses fidelity.

**Resolution** (kept inside the adapter, no migration change): the
`AffiliateEntityAdapter.addHistory` method remaps `action === 'paused_fraud'`
to `action: 'paused'` and prefixes the notes field with
`'[fraud-engine] '`. This preserves the auto-pause audit trail without
requiring an upstream package PR or a schema migration, and is forward-compat:
if a future 2F migration widens the CHECK constraint to include
`paused_fraud`, the adapter can drop the remap in a one-line change.

### Existing migrations (verified)

`supabase/migrations/20260417000004_affiliate_004_contract.sql:28-54` already
defines:
- `affiliate_fraud_flags (id, affiliate_id, referral_id, flag_type, severity,
  details, status, admin_notes, resolved_at, created_at)` — matches upstream
  `fraud_flags` column-for-column modulo the `affiliate_id` rename and the
  addition of `admin_notes`/`resolved_at` (both nullable, written by
  `ResolveFraudFlagUseCase`).
- `affiliate_risk_scores (affiliate_id PK, score, flag_count, updated_at)` —
  matches upstream `risk_scores` modulo `affiliate_id` rename. We deliberately
  **omit** the upstream `auto_paused` + `last_calculated_at` columns because
  (a) `affiliates.status = 'paused'` is authoritative for pause state, and
  (b) `updated_at` is equivalent to `last_calculated_at` for the only access
  pattern (admin list sorted by `score DESC`).

**No new migration is required for 2E.** Appendix A confirms the column-name
remapping inside `SupabaseFraudRepository`.

### Fastify version

`apps/api/package.json` pins `fastify: ^4.28.1`. `@fastify/rate-limit@10.x`
transitively requires `fastify-plugin@^5` (Fastify 5 era); v9.1.0 — the last
v9 release — uses `fastify-plugin@^4` and is the correct pin for this repo.

---

## 3. Target State

### Module structure

```
apps/api/src/lib/affiliate/
├── fraud/                                           NEW (Sub-project 3)
│   ├── engine.ts             Factory: buildFraudEngine() → FraudDetectionEngine<Affiliate>
│   ├── service.ts            AffiliateFraudAdapter implements IAffiliateFraudDetectionService
│   ├── fraud-repo.ts         SupabaseFraudRepository implements IFraudRepository
│   │                         (writes to affiliate_fraud_flags / affiliate_risk_scores)
│   ├── entity-adapter.ts     AffiliateEntityAdapter implements IEntityRepository<Affiliate>
│   │                         (delegates to SupabaseAffiliateRepository)
│   ├── alert.ts              sendFraudAdminAlert: OnAdminAlert (email via provider)
│   └── __tests__/
│       ├── service.test.ts
│       ├── fraud-repo.test.ts
│       ├── entity-adapter.test.ts
│       └── alert.test.ts
├── container.ts              MODIFIED: instantiate fraud engine, pass adapter to
│                             AttributeSignupToAffiliateUseCase; gated by FRAUD_DETECTION_ENABLED
└── repository/fraud-repo.ts  UNCHANGED (this is the READER repo for admin UI;
                              the new writer repo lives under fraud/ to keep
                              consumer-port vs admin-reader concerns separate)

apps/api/src/
├── index.ts                  MODIFIED: register @fastify/rate-limit inside the
│                             /ref scope
└── plugins/                  NEW (if absent) — isolates rate-limit plugin config
    └── ref-rate-limit.ts     Exports registerRefRateLimit(scope) convenience
```

Rationale for the separate `fraud/` subdirectory: the existing
`repository/fraud-repo.ts` is the **admin reader** (listFraudFlags,
updateFraudFlagStatus — consumed by `ListAffiliateFraudFlagsUseCase` et al.).
The new `fraud/fraud-repo.ts` is the **engine writer** (findRecentFlag,
createFlag, listOpenFlags, upsertRiskScore — consumed by `FraudDetectionEngine`).
Keeping them in sibling directories avoids name overload inside a single file
and keeps `repository/` focused on the `IAffiliateRepository` surface.

### Public API

**`container.ts` diff (conceptual):**
```diff
- const attributeUseCase = new AttributeSignupToAffiliateUseCase(repo, config, undefined /* fraud — 2E */)
+ const fraudService = process.env.FRAUD_DETECTION_ENABLED === 'true'
+   ? new AffiliateFraudAdapter(buildFraudEngine({ repo, email, logger: createLogger('fraud') }))
+   : undefined
+ const attributeUseCase = new AttributeSignupToAffiliateUseCase(repo, config, fraudService)
```

**Rate-limit registration (inside `/ref` scope):**
```ts
server.register(async (scope) => {
  await scope.register(rateLimit, {
    max: 30,                         // per keyGenerator (IP-derived) per window
    timeWindow: '1 minute',
    cache: 10_000,                   // LRU capacity
    continueExceeding: false,        // after limit: hard 429 until window resets
    keyGenerator: (req) => req.ip,   // trust Fastify's request.ip (uses trustProxy)
    errorResponseBuilder: (_req, ctx) => ({
      data: null,
      error: {
        code: 'RATE_LIMITED',
        message: `Too many requests. Try again in ${ctx.ttl}ms.`,
      },
    }),
  });
  registerAffiliateRedirectRoute(scope as never, {
    webBaseUrl: affiliateContainer.config.webBaseUrl,
    trackClickUseCase: affiliateContainer.trackClickUseCase,
  });
}, { prefix: "/ref" });
```

The error envelope aligns with CLAUDE.md's `{ data, error }` rule verbatim.
`cache` is sized for realistic unique-IP traffic during a campaign burst
(~10k distinct clients before LRU eviction).

### `trustProxy` dependency

`@fastify/rate-limit` uses `request.ip` from Fastify. For accurate
rate-limiting on Vercel (which fronts the API), the Fastify server must be
started with `trustProxy: true` (already standard for Vercel deploys; must
be verified in `apps/api/src/index.ts`'s `fastify(...)` options). If absent,
every request appears to come from the Vercel proxy IP and the 30/min
becomes **global** instead of per-client. §7 makes this a mandatory
precondition check.

---

## 4. Architecture

### Data flow — signup attribution

```
POST /api/auth/signup  (apps/app → apps/api)
  │
  ▼  includes ?ref=CODE in redirect origin, or X-Forwarded-For header
  │
  ▼
AttributeSignupToAffiliateUseCase.execute(code, userId, today, options)
  │
  │  options.signupIpHash = hashIp(extractRealIp(req))      ← caller computes
  │  options.platform     = 'android' | 'ios' | 'web'
  │  options.clickId      = (if correlatable)
  │
  ├──► this.fraudDetectionService?.checkSelfReferral({ ... })
  │         │
  │         ▼  (AffiliateFraudAdapter)
  │         │
  │         ▼  engine.checkSelfReferral({ entity, referral, signupIpHash, userId, platform, getUserEmail })
  │         │
  │         ├── compare affiliate.knownIpHashes ⊃ signupIpHash → FraudFlag('self_referral_ip_match', 'high')
  │         │   via fraudRepo.createFlag + upsertRiskScore
  │         │
  │         ├── emailSimilarity(affiliate.email, await getUserEmail(userId))
  │         │       → FraudFlag('self_referral_email_similar', 'medium')
  │         │
  │         ├── riskScore ≥ notifyAdminThreshold (50) → onAdminAlert(payload)
  │         └── riskScore ≥ autoPauseThreshold   (80) → entityRepo.pause + addHistory
  │
  ▼  engine resolves void; use case continues independent of fraud outcome
  │  (the use case awaits but does NOT gate on fraud — parity with package's
  │  native behavior; auto-pause happens AFTER the referral row is written)
  ▼
return AffiliateReferral   ← signup succeeds; referral row exists; admin UI
                              shows flag+pause via 2C
```

### Data flow — `/ref/:code` redirect

```
GET /api/ref/:code   (ref.brighttale.io/CODE → apps/api)
  │
  ▼  @fastify/rate-limit preHandler  (scoped to /ref)
  │    keyGenerator(req) → req.ip (trustProxy unpacks X-Forwarded-For)
  │    entry = lru.get(req.ip); if >30 in 60s → 429 { data:null, error:{code:'RATE_LIMITED'} }
  │
  ▼  registerAffiliateRedirectRoute handler
  │    trackClickUseCase.execute(code, { …no ipHash yet }) → best-effort
  │    return 302 to {webBaseUrl}/signup?ref={CODE}
  ▼
(302)
```

### Error semantics

| Origin | Trigger | Behavior | Rationale |
|---|---|---|---|
| `AffiliateFraudAdapter.checkSelfReferral` | engine throws (DB error on `createFlag`, etc.) | **Swallow** — log via logger, do not rethrow | Fraud detection is a side-observer; signup flow must not fail because of it |
| `FraudDetectionEngine.checkSelfReferral` | `entityRepo.pause` throws | caught by engine; logger.error; returns void | Upstream design — preserved |
| `sendFraudAdminAlert` | email provider throws | swallow inside alert.ts; log | Alerts are best-effort; system SoT is DB flags |
| `@fastify/rate-limit` 429 | client exceeds 30/min | return `{ data:null, error:{code:'RATE_LIMITED', message:'...'} }`, status 429 | Matches CLAUDE.md envelope; consistent with existing `middleware/rate-limit.ts` |
| `getUserEmail` callback | Supabase returns null | engine skips the email-similarity check (documented upstream behavior) | |
| `FRAUD_DETECTION_ENABLED=false` or unset | container init | passes `undefined` — identical to 2A | Kill-switch preserves rollback path |

**Explicit non-semantics:** the fraud service never raises exceptions into
`AttributeSignupToAffiliateUseCase`. The adapter wraps the engine call in
`try/catch` and logs. This is a deliberate deviation from the "let it bubble"
default (matches CLAUDE.md `api-routes.md` section "Don't expose internal
errors to clients"): signup attribution is a user-facing path; fraud is
asynchronous operator intelligence.

### Edge cases

1. **`options.signupIpHash` absent** — adapter passes through to engine,
   which skips the IP-match branch (documented). Email-similarity still runs.
   No flag without enough signal.
2. **`affiliate.knownIpHashes` empty** — same: IP-match branch skipped. This
   is the realistic state for most newly approved affiliates (the field
   populates over time via a separate flow not in scope for 2E).
3. **Self-referral on second signup** — most common abuse pattern. Engine
   creates `self_referral_email_similar` (if email normalized-match) + IP
   match (if same device). Two flags → weighted score 55 (30+25) → triggers
   `notifyAdminThreshold=50`. Admin receives email. Score below 80 → no
   auto-pause. Intentional: first offense notifies, repeat offenses pause.
4. **Multi-recipient admin alert** — `AFFILIATE_ADMIN_EMAIL` env is a single
   address; parity with 2A. Expanding to a list is 2F+ (operator preference).
5. **Rate-limit hit by legitimate traffic** — 30/min per IP. A single
   shared-NAT source (corporate office, mobile carrier CGNAT) can trip. Risk
   documented in §8 R6; limit chosen to be well above expected per-user
   click rate (~1 click / affiliate landing page / minute).
6. **Bot crawler hits `/ref/:code`** — rate-limit blocks after 30; trackClick
   still records the first 30 (expected; not a correctness issue).
7. **Kill-switch during incident** — set `FRAUD_DETECTION_ENABLED=false`
   on Vercel, redeploy; next cold start reverts to 2A behavior. No data
   loss (existing flags stay in DB; just new detections pause).
8. **Engine logger absent** — `FraudDetectionEngine` silently no-ops log
   calls (documented). We wire `createLogger('fraud')` → Fastify logger
   for observability.
9. **Pool/hot path cost** — engine constructor is O(1) property assignments;
   container builds once per cold start. No per-request init.
10. **`getUserEmail` racing with user deletion** — returns null; engine
    skips email-similarity branch. No partial-write concerns (engine writes
    flags after all inputs gathered).
11. **Rate-limit cache overflow** — `cache: 10_000` LRU evicts the
    least-recently-used entry. Evicted IP gets a fresh window. Under sustained
    attack from >10k IPs this is graceful degradation (matches upstream
    defaults and Upstream 2A in-memory rate-limiter pattern).
12. **Rate-limit clock drift** — single process, `Date.now()`; irrelevant in
    serverless single-region. Multi-region (2F+) requires Redis backend.
13. **Local dev without `FRAUD_DETECTION_ENABLED`** — default is `undefined`
    → kill-switch active → fraud silent → parity with 2A (developer
    experience unchanged). Enable explicitly in `apps/api/.env.local` to test.

---

## 5. Testing

### Unit tests (~28 new)

| File | Test count | Focus | Mocks |
|---|---|---|---|
| `fraud/__tests__/service.test.ts` | ~8 | Adapter maps affiliate→entity correctly; passes knownIpHashes through; `getUserEmail` resolves via Supabase mock; platform narrows `'pwa'` → `null`; swallows engine errors and logs; returns void on engine throw; emits logger.error once; no rethrow into use case | `vi.mock` engine |
| `fraud/__tests__/fraud-repo.test.ts` | ~7 | `findRecentFlag` queries `affiliate_fraud_flags` with `affiliate_id = entityId` (name remap verified); `createFlag` inserts with status `'open'`; `listOpenFlags` returns only `status IN ('open','investigating')`; `upsertRiskScore` upserts on `affiliate_id` PK; error surfaces on Supabase error | chainable Supabase mock |
| `fraud/__tests__/entity-adapter.test.ts` | ~6 | `findById` delegates to `SupabaseAffiliateRepository.findById`; `pause` delegates with `skipAudit` pass-through; `addHistory` maps `{entityId, action, ...}` → `{affiliateId, action, ...}`; null entity returns null; pause throws if affiliate not found | `vi.mock` repo |
| `fraud/__tests__/alert.test.ts` | ~4 | Sends to `AFFILIATE_ADMIN_EMAIL`; subject includes flagType + severity; body escapes `details` HTML; swallows email provider errors | `vi.mock('@/lib/email/provider')` |
| `container.test.ts` (modified) | diff `+3` | When `FRAUD_DETECTION_ENABLED=true`, attributeUseCase receives a non-undefined fraudService; when unset/`false`, receives undefined (parity with 2A); adapter instance is singleton (same ref across reads) | existing Supabase mock |

### Integration test — `__tests__/integration/affiliate-fraud-flow.test.ts` (new stub)

Category C per CLAUDE.md — `describe.skip` + `// TODO-test`; gated on a real
DB (local Supabase). Outline of assertions the skipped stub declares:
1. Applicant A applies → approved → receives code.
2. Applicant A signs up second account via own code + same IP hash.
3. `affiliate_fraud_flags` contains one `self_referral_ip_match` row (severity `high`).
4. `affiliate_risk_scores.score` for A is ≥ `flagTypeWeights.self_referral_ip_match * severityMultiplier.high` = 45.
5. Email captured by MailHog (post-SP0) contains subject "Fraud: self_referral_ip_match".

### Rate-limit test — `__tests__/ref-rate-limit.test.ts`

| # | Assertion | Method |
|---|---|---|
| 1 | First 30 requests return 302 | `inject({ url: '/ref/ABC' })` × 30 |
| 2 | 31st request returns 429 with `{data:null, error:{code:'RATE_LIMITED', …}}` | inject × 31 |
| 3 | Response headers include `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` | header assertion |
| 4 | Different IP gets fresh allowance (`keyGenerator` returns `req.ip`) | inject with `remoteAddress: '9.9.9.9'` |
| 5 | `trustProxy: true` — request with `x-forwarded-for: 1.2.3.4` key's on 1.2.3.4 | header + inspect rate-limit cache (via plugin diagnostic) |
| 6 | Limit applies to `/ref/*` but not `/affiliate/*` (scope isolation) | assert 200 on authenticated `/affiliate/me` after exhausting `/ref` limit for same IP |

Uses Fastify's native `inject()` for in-memory testing — no HTTP server spun
up. Fast, deterministic.

### Coverage targets

| File | Branch coverage | Rationale |
|---|---|---|
| `fraud/service.ts` | ≥95% | Entry point; all mapping branches |
| `fraud/fraud-repo.ts` | ≥95% | Infra; all query paths |
| `fraud/entity-adapter.ts` | ≥90% | Thin delegate; error paths count |
| `fraud/alert.ts` | ≥85% | Small surface; HTML rendering tested once |
| `container.ts` | retain existing | Gated branch adds two tests; no regression |

---

## 6. Configuration

### New environment variables

| Var | Required when | Default | Notes |
|---|---|---|---|
| `FRAUD_DETECTION_ENABLED` | production rollout | unset (= disabled) | Set `true` to activate engine. Kill-switch. |
| `FRAUD_AUTO_PAUSE_THRESHOLD` | optional | `80` | `DEFAULT_FRAUD_CONFIG.autoPauseThreshold`. Tune higher for tolerant rollout. |
| `FRAUD_NOTIFY_ADMIN_THRESHOLD` | optional | `50` | `DEFAULT_FRAUD_CONFIG.notifyAdminThreshold`. |
| `REF_RATE_LIMIT_MAX` | optional | `30` | Per-IP requests per window on `/ref/:code`. |
| `REF_RATE_LIMIT_WINDOW` | optional | `'1 minute'` | `@fastify/rate-limit` duration string. |

Absent all of the above, behavior is identical to 2A (fraud silent, rate-limit
off if we set the plugin load itself behind `REF_RATE_LIMIT_MAX !== '0'`).
Simpler rule adopted: rate-limit plugin **always registers** with the defaults
above; fraud engine is the only behavior gated by an env var. Disabling the
rate-limit requires unregistering (restart) but there's no realistic reason
to want that in any environment.

### Reused environment variables

| Var | Why | Source |
|---|---|---|
| `AFFILIATE_ADMIN_EMAIL` | `sendFraudAdminAlert` recipient | 2A |
| `RESEND_API_KEY` / SMTP vars | email transport | 2A + SP0 |
| `SUPABASE_SERVICE_ROLE_KEY` | all DB writes (fraud repo) | Phase 1 |
| `NEXT_PUBLIC_APP_URL` | admin URL inside alert payload body | 2A |

### `.env.example` diff (apps/api)

```bash
# ─── Affiliate fraud detection (Phase 2E) ─────────────────────────────
# Set to "true" to enable runtime fraud detection on signup attribution.
# Unset or "false" → AttributeSignupToAffiliateUseCase reverts to 2A behavior (no-op).
# FRAUD_DETECTION_ENABLED=true

# Thresholds (defaults from DEFAULT_FRAUD_CONFIG; tune post-launch).
# FRAUD_AUTO_PAUSE_THRESHOLD=80
# FRAUD_NOTIFY_ADMIN_THRESHOLD=50

# ─── /ref/:code rate-limit (Phase 2E) ─────────────────────────────────
# @fastify/rate-limit config for the public redirect route. Applies per IP.
# REF_RATE_LIMIT_MAX=30
# REF_RATE_LIMIT_WINDOW="1 minute"
```

### Email provider coupling

Sub-project 0 (email provider abstraction) is **already merged** on the
branch before this sub-project lands. `fraud/alert.ts` imports
`sendEmail` from `@/lib/email/provider` — not `@/lib/email/resend`. If the
ordering inverts during execution, alert.ts uses the resend import as a
stop-gap and a one-line diff fixes it post-SP0. Flagged in §8 R2.

---

## 7. Migration Path

Three commits on the long-lived branch `feat/affiliate-2a-foundation`.

### Commit A — Install + infra-only (green, no container wire)

1. `cd apps/api && npm install @tn-figueiredo/fraud-detection@0.2.0 --save-exact`
   (auto-installs `@tn-figueiredo/fraud-detection-utils@0.1.0`).
2. `cd apps/api && npm install @fastify/rate-limit@^9.1.0 --save-exact`
   (Fastify 4 compat; v10 is Fastify 5).
3. Create `apps/api/src/lib/affiliate/fraud/` with the 4 impl files
   (`fraud-repo.ts`, `entity-adapter.ts`, `service.ts`, `alert.ts`) + 4
   unit test files. Engine factory `engine.ts`.
4. Do **not** modify `container.ts` yet (no runtime wire).
5. Register `@fastify/rate-limit` on `/ref` scope (index.ts mod). This is
   behaviorally additive (limit-only), no fraud logic active.
6. **Precondition (mandatory):** `apps/api/src/index.ts:68` does not currently
   set `trustProxy`. Add `trustProxy: true` to the `Fastify({ ... })` options
   alongside the existing `bodyLimit`/`logger`. Without this, `req.ip` is the
   Vercel proxy IP for every request and the rate-limit collapses to a
   global 30/min across all clients. This precondition is verified by
   integration test #5 in §5 before Commit A ships.
7. Verify: `npm run typecheck` green (4 workspaces); `npm test --workspace=@brighttale/api`
   green (existing + new 28); in-memory inject rate-limit tests pass.
8. Manual smoke: `curl -I http://localhost:3001/api/ref/ABC` × 31 — 31st
   returns 429 with correct envelope.

### Commit B — Container wire (atomic toggle)

9. Modify `container.ts:62` — replace `undefined` with the env-gated
   `fraudService` expression (§3).
10. Modify `container.test.ts` — add two new assertions (env true/false
    branches).
11. Do **not** set `FRAUD_DETECTION_ENABLED=true` in any `.env*` file.
    Activation is a deploy-time config change, not a code change.
12. Verify: full `npm test` green.

### Commit C — Documentation reconciliation

13. Update `.env.example` per §6.
14. Update 2A spec's §9 R9 + R15 from "Accepted in 2A" to "Addressed in 2E
    (see `2026-04-17-affiliate-2e-fraud-detection-design.md`)" — minimal
    errata note at the top of 2A spec matching SP0's pattern
    (`2026-04-17-email-provider-abstraction-design.md` §7.13).
15. Update `apps/docs-site/src/content/affiliate/*` if fraud-related pages
    exist (spot-check; create skeletons only if drift is obvious).
16. Verify: `npm run typecheck` + `npm test` still green.

### Commit split rationale

A/B split keeps the container change atomic (single commit that changes
runtime behavior, gated by env — safe to revert). C isolates doc work so
code review can focus on the code. Three commits total stay well under
the ~600–800 LOC soft target (this sub-project is ~550 LOC inclusive of
tests + docs).

---

## 8. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | `@tn-figueiredo/fraud-detection@0.2.0` is 2 days old (published 2026-04-15 per `npm view`); undiscovered bugs | Medium | Kill-switch `FRAUD_DETECTION_ENABLED=false` is default; production rollout waits until post-merge observation; fallback is 2A behavior (byte-for-byte) |
| R2 | Order of merge with SP0 (email provider abstraction) — if 2E lands first, `alert.ts` imports break | Low | Sub-project 0 is Sub-project 0 **by numbering**; it ships first. CI will catch if the order inverts. Stop-gap: `alert.ts` imports from `@/lib/email/resend` and is refactored in a trailing patch |
| R3 | `trustProxy` not set on the Fastify server → rate-limit applies globally (single Vercel proxy IP) | **High (correctness)** | §7 Commit A step 6 is a **mandatory** precondition check before merging. Integration test #5 in §5 verifies header-based IP resolution works |
| R4 | `/ref/:code` does not compute `signupIpHash`; it's only computed at `/api/auth/signup` — so click-time IP pattern detection is blind | Medium | **Accepted.** IP-based correlation across click→signup is a 2F+ concern (requires distributed session correlation). 2E closes R15 via rate-limit (prevents click spam) and closes R9 via signup-time detection |
| R5 | Column-name remap (`affiliate_id` ↔ `entity_id`) in adapter is a maintenance burden if upstream package changes `IFraudRepository` signatures | Low | Interface is stable (v0.2.0); `--save-exact` pin; CHANGELOG review before any upgrade |
| R6 | Legitimate CGNAT / office NAT users trip the 30/min limit | Low | Limit chosen at 6× realistic per-user click rate (~1/min); 429 response is cacheable and visible in PostHog (when instrumented); adjust `REF_RATE_LIMIT_MAX` env var if false-positive rate emerges |
| R7 | `affiliate_risk_scores` drifts from upstream schema (no `auto_paused`, no `last_calculated_at`) | Low | Documented in §2; adapter does not write those columns; `affiliates.status='paused'` is authoritative |
| R8 | Fraud engine auto-pauses a legitimate affiliate due to false-positive email-similarity | Medium | `autoPauseThreshold=80` requires multiple flags; self-referral + email-similarity alone = 55 (below threshold, notify only); affiliate remains active; admin reviews and dismisses |
| R9 | Container test now depends on env var — flaky if another test leaks env | Low | `beforeEach` clears `process.env.FRAUD_DETECTION_ENABLED`; `__resetAffiliateContainer()` forces rebuild |
| R10 | `getUserEmail` callback queries `auth.users` — requires service-role client already in container | Low | Container holds `createServiceClient()` via repo; reuse via adapter (no new client) |
| R11 | `@fastify/rate-limit@9` is not the latest (10.x exists); missed backports | Low | Fastify 4 ⇒ v9 is the correct major. Monitor Fastify 5 migration (out of scope until monorepo-wide Fastify upgrade) |
| R12 | Engine's `onAdminAlert` can send emails to admin during a signup burst (N signups → N alerts) | Medium | Engine dedups flags within 24h via `dedupWindowMs` (default 86_400_000); same entity+flagType does not re-alert. Upstream behavior — preserved |
| R13 | Self-referral IP-match branch never fires because `knownIpHashes` is empty for new affiliates | Medium | **Documented trade-off.** `knownIpHashes` populates as affiliates log in from recognized devices. For 2E v1, email-similarity carries most of the detection weight. IP-match activates for established affiliates |

---

## 9. Done Criteria

0. **Zero SQL migrations** authored in `supabase/migrations/` (the 2A tables
   `affiliate_fraud_flags` / `affiliate_risk_scores` are reused verbatim; the
   upstream package's `001_schema.sql` + `002_indexes.sql` are NOT copied).
1. `@tn-figueiredo/fraud-detection@0.2.0` installed with `--save-exact` in
   `apps/api/package.json`.
2. `@fastify/rate-limit@^9.1.0` installed with `--save-exact`.
3. `apps/api/src/lib/affiliate/fraud/` directory exists with 5 impl files
   + 4 test files.
4. `apps/api/src/index.ts` registers `@fastify/rate-limit` inside the `/ref`
   scope with `max: 30, timeWindow: '1 minute'` and envelope-compliant
   `errorResponseBuilder`.
5. `apps/api/src/lib/affiliate/container.ts:62` no longer contains the
   literal `undefined /* fraud — 2E */`.
6. `FRAUD_DETECTION_ENABLED=false` (or unset) + `npm test` green: behavior
   byte-for-byte identical to post-2A.
7. `FRAUD_DETECTION_ENABLED=true` + `npm test` green with the new 28 unit tests.
8. `npm run typecheck` green across 4 workspaces.
9. Manual smoke: 31 consecutive `curl` hits to `/api/ref/ABC` return 30 × 302
   followed by 1 × 429 with `{data:null, error:{code:'RATE_LIMITED', ...}}`.
10. Manual smoke: signup via own affiliate code (same browser) writes one
    row to `affiliate_fraud_flags` (verified via Supabase Studio).
11. `trustProxy: true` present in Fastify constructor options.
12. 2A spec §9 R9 + R15 annotated with errata note linking to this spec.
13. `.env.example` section added per §6.
14. Three commits on `feat/affiliate-2a-foundation`: A (infra), B (wire), C (docs).

---

## 10. Out of Scope (reiterated)

- Upstream fraud-detection migrations (001/002). 2A tables are structurally equivalent.
- Admin UI for fraud flags / risk scores (2C).
- IP-cluster, signup-burst, device-cluster detection wiring (2F+; requires
  richer click telemetry).
- IP extraction at `/ref/:code` (2F+).
- `FraudDetectionConfig` tuning beyond defaults.
- Redis-backed rate-limit (`@fastify/rate-limit` Redis store).
- Rate-limit on other public routes.
- Stripe/billing (CC-3).
- GitHub Actions fraud-integration CI (CC-4).

---

## 11. Handoff to next sub-project (Sub-project 4 — Phase 2F)

After merge of this sub-project on the long-lived branch:
- Fraud engine is live (kill-switch default off; enable via env per deploy).
- `AttributeSignupToAffiliateUseCase` always receives a real
  `IAffiliateFraudDetectionService` implementation (no `undefined`).
- `/ref/:code` is rate-limited (30/min per IP).
- **Open gaps for 2F:**
  - IP extraction at click-time so `ip_cluster` detection activates.
  - Richer `knownIpHashes` population (login-time IP capture).
  - `signup_burst` and `device_cluster` wiring — both require a background
    job (Inngest) scanning `affiliate_clicks` for patterns.
  - Redis rate-limit backend if multi-region.
  - Idempotency tokens on `POST /payouts` (2F; §9 R16 of 2A).
  - `@tn-figueiredo/billing@0.2.1` migration decision (2F mega-project).
  - Receita Federal Tax ID validation API (replaces `StubTaxIdRepository`).

---

## 12. References

- Affiliate 2A spec: `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`
  (§9 R9 + R15 — accepted gaps this sub-project closes; §11.2E handoff notes)
- SP0 email provider spec (format template, 12 sections + Appendix A):
  `docs/superpowers/specs/2026-04-17-email-provider-abstraction-design.md`
- `@tn-figueiredo/fraud-detection@0.2.0` — README.md + `dist/index.d.ts`
  (types: `FraudDetectionEngine`, `IFraudRepository`, `IEntityRepository`,
  `OnAdminAlert`, `DEFAULT_FRAUD_CONFIG`)
- `@tn-figueiredo/fraud-detection-utils@0.1.0` — helper exports verified from
  tarball: `hashIp(ip): 16-char hex SHA-256 prefix`,
  `fingerprintDevice(ip, userAgent, acceptLanguage): 16-char hex`,
  `emailSimilarity(a, b): boolean` (dot-normalize, plus-alias, substring),
  `extractRealIp({ ip, headers }): string` (prefers `x-forwarded-for` first entry)
- `@tn-figueiredo/affiliate@0.4.0/dist/fraud-admin-DiX4kqdI.d.ts:505` —
  `IAffiliateFraudDetectionService` interface definition
- `@fastify/rate-limit@9.1.0`: https://github.com/fastify/fastify-rate-limit/tree/v9.1.0
- Current `/ref` registration: `apps/api/src/index.ts:195-202`
- Current container: `apps/api/src/lib/affiliate/container.ts:51-114`
- Existing admin-reader fraud repo: `apps/api/src/lib/affiliate/repository/fraud-repo.ts`
- Existing fraud tables migration: `supabase/migrations/20260417000004_affiliate_004_contract.sql`

---

## Appendix A — Code skeletons

### A.1 `apps/api/src/lib/affiliate/fraud/fraud-repo.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type {
  IFraudRepository, FraudSeverity, RiskScore,
} from '@tn-figueiredo/fraud-detection'

/**
 * Writer-side IFraudRepository backed by the 2A `affiliate_fraud_flags` and
 * `affiliate_risk_scores` tables. Column-name remap: upstream `entity_id` →
 * local `affiliate_id`.
 *
 * Separate from repository/fraud-repo.ts (which is the admin READER used by
 * ListAffiliateFraudFlagsUseCase et al.) — keeping writer and reader in
 * sibling modules preserves the IAffiliateRepository surface in repository/.
 */
export class SupabaseFraudRepository implements IFraudRepository {
  constructor(private readonly sb: SupabaseClient<Database>) {}

  async findRecentFlag(params: { entityId: string; flagType: string; since: string }) {
    const { data, error } = await this.sb
      .from('affiliate_fraud_flags')
      .select('id')
      .eq('affiliate_id', params.entityId)
      .eq('flag_type', params.flagType)
      .gte('created_at', params.since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data ? { id: data.id } : null
  }

  async createFlag(input: {
    entityId: string; referralId?: string | null; flagType: string;
    severity: FraudSeverity; details: Record<string, unknown>; status: 'open';
  }) {
    const { error } = await this.sb.from('affiliate_fraud_flags').insert({
      affiliate_id: input.entityId,
      referral_id: input.referralId ?? null,
      flag_type: input.flagType,
      severity: input.severity,
      details: input.details as never,      // Database Json cast
      status: input.status,
    })
    if (error) throw error
  }

  async listOpenFlags(entityId: string) {
    const { data, error } = await this.sb
      .from('affiliate_fraud_flags')
      .select('flag_type, severity')
      .eq('affiliate_id', entityId)
      .in('status', ['open', 'investigating'])
    if (error) throw error
    return (data ?? []).map(r => ({
      flagType: r.flag_type,
      severity: r.severity as FraudSeverity,
    }))
  }

  async upsertRiskScore(score: RiskScore) {
    const { error } = await this.sb
      .from('affiliate_risk_scores')
      .upsert({
        affiliate_id: score.entityId,
        score: score.score,
        flag_count: score.flagCount,
        updated_at: score.updatedAt,
      }, { onConflict: 'affiliate_id' })
    if (error) throw error
  }
}
```

### A.2 `apps/api/src/lib/affiliate/fraud/entity-adapter.ts`

```ts
import type { IEntityRepository } from '@tn-figueiredo/fraud-detection'
import type { Affiliate } from '@tn-figueiredo/affiliate'
import type { SupabaseAffiliateRepository } from '../repository'

export class AffiliateEntityAdapter implements IEntityRepository<Affiliate> {
  constructor(private readonly repo: SupabaseAffiliateRepository) {}

  findById(id: string): Promise<Affiliate | null> {
    return this.repo.findById(id)
  }

  pause(id: string, options?: { skipAudit?: boolean }): Promise<Affiliate> {
    return this.repo.pause(id, options)
  }

  async addHistory(entry: {
    entityId: string; action: string; notes?: string | null;
    oldStatus?: string | null; newStatus?: string | null;
  }): Promise<void> {
    // §2 "Action-name mismatch": engine emits 'paused_fraud' which is not a
    // valid ContractHistoryAction per affiliate_contract_history's CHECK
    // constraint. Remap to 'paused' with a prefixed note.
    const isFraudPause = entry.action === 'paused_fraud'
    await this.repo.addContractHistory({
      affiliateId: entry.entityId,
      action: (isFraudPause ? 'paused' : entry.action) as never,
      notes: isFraudPause
        ? `[fraud-engine] ${entry.notes ?? 'auto-pause'}`
        : (entry.notes ?? null),
      oldStatus: entry.oldStatus ?? null,
      newStatus: entry.newStatus ?? null,
    })
  }
}
```

### A.3 `apps/api/src/lib/affiliate/fraud/service.ts`

```ts
import type { FraudDetectionEngine } from '@tn-figueiredo/fraud-detection'
import type { IAffiliateFraudDetectionService, Affiliate } from '@tn-figueiredo/affiliate'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

function narrowPlatform(p?: string): 'android' | 'ios' | 'web' | null {
  return p === 'android' || p === 'ios' || p === 'web' ? p : null
}

export class AffiliateFraudAdapter implements IAffiliateFraudDetectionService {
  constructor(
    private readonly engine: FraudDetectionEngine<Affiliate>,
    private readonly sb: SupabaseClient<Database>,
    private readonly logger = console,
  ) {}

  async checkSelfReferral(data: {
    affiliate: { id: string; email: string; knownIpHashes?: string[] }
    referral: { id: string }
    signupIpHash: string
    userId: string
    platform?: string
  }): Promise<void> {
    try {
      await this.engine.checkSelfReferral({
        entity: data.affiliate,
        referral: data.referral,
        signupIpHash: data.signupIpHash,
        userId: data.userId,
        platform: narrowPlatform(data.platform),
        getUserEmail: async (userId) => {
          // user_profiles.id is the auth.users.id (PK; see existing usages
          // in routes/users.ts:129). No separate user_id column.
          const { data: u } = await this.sb
            .from('user_profiles')
            .select('email')
            .eq('id', userId)
            .maybeSingle()
          return u?.email ?? null
        },
      })
    } catch (err) {
      // Fraud detection is a side-observer; never bubble into signup flow.
      this.logger.error('[fraud] checkSelfReferral failed (swallowed):', err)
    }
  }
}
```

### A.4 `apps/api/src/lib/affiliate/fraud/alert.ts`

```ts
import type { OnAdminAlert } from '@tn-figueiredo/fraud-detection'
import { sendEmail } from '@/lib/email/provider'   // post-SP0

function adminEmail(): string {
  return process.env.AFFILIATE_ADMIN_EMAIL ?? 'admin@brighttale.io'
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export const sendFraudAdminAlert: OnAdminAlert = async (payload) => {
  const adminUrl = payload.adminUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://brighttale.io'}/admin/affiliates/${payload.entityId}`
  const html = `
    <h2>Fraude detectada: ${escapeHtml(payload.flagType)}</h2>
    <p><strong>Severity:</strong> ${escapeHtml(String(payload.severity))}</p>
    <p><strong>Entity:</strong> ${escapeHtml(payload.entityId)}</p>
    <pre>${escapeHtml(JSON.stringify(payload.details, null, 2))}</pre>
    <p><a href="${escapeHtml(adminUrl)}">Open admin view</a></p>
  `
  try {
    await sendEmail({
      to: adminEmail(),
      subject: `[Fraud] ${payload.flagType} (${payload.severity})`,
      html,
    })
  } catch (err) {
    console.error('[fraud:alert] email send failed (swallowed):', err)
  }
}
```

### A.5 `apps/api/src/lib/affiliate/fraud/engine.ts`

```ts
import { FraudDetectionEngine, DEFAULT_FRAUD_CONFIG } from '@tn-figueiredo/fraud-detection'
import type { Affiliate } from '@tn-figueiredo/affiliate'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { SupabaseAffiliateRepository } from '../repository'
import { SupabaseFraudRepository } from './fraud-repo'
import { AffiliateEntityAdapter } from './entity-adapter'
import { sendFraudAdminAlert } from './alert'

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function buildFraudEngine(deps: {
  sb: SupabaseClient<Database>
  repo: SupabaseAffiliateRepository
  logger?: { info: (m: string, meta?: unknown) => void; warn: (m: string, meta?: unknown) => void; error: (m: string, meta?: unknown) => void }
}): FraudDetectionEngine<Affiliate> {
  return new FraudDetectionEngine<Affiliate>({
    config: {
      ...DEFAULT_FRAUD_CONFIG,
      // Number(undefined) === NaN and Number("") === 0 — guard explicitly.
      autoPauseThreshold: parseIntEnv('FRAUD_AUTO_PAUSE_THRESHOLD', DEFAULT_FRAUD_CONFIG.autoPauseThreshold),
      notifyAdminThreshold: parseIntEnv('FRAUD_NOTIFY_ADMIN_THRESHOLD', DEFAULT_FRAUD_CONFIG.notifyAdminThreshold),
    },
    fraudRepo: new SupabaseFraudRepository(deps.sb),
    entityRepo: new AffiliateEntityAdapter(deps.repo),
    onAdminAlert: sendFraudAdminAlert,
    logger: deps.logger,
  })
}
```

### A.6 `apps/api/src/lib/affiliate/container.ts` (diff excerpt)

```ts
// ... existing imports ...
import { buildFraudEngine } from './fraud/engine'
import { AffiliateFraudAdapter } from './fraud/service'

export function buildAffiliateContainer(): AffiliateContainer {
  if (cached) return cached
  const sb = createServiceClient()
  const repo = new SupabaseAffiliateRepository(sb)
  // ... existing taxId, email, config ...

  const fraudService = process.env.FRAUD_DETECTION_ENABLED === 'true'
    ? new AffiliateFraudAdapter(buildFraudEngine({ sb, repo }), sb)
    : undefined

  const attributeUseCase = new AttributeSignupToAffiliateUseCase(repo, config, fraudService)
  // ... rest unchanged ...
}
```

### A.7 `apps/api/src/index.ts` (diff excerpt — rate-limit on `/ref` scope)

```ts
import rateLimit from '@fastify/rate-limit'
// ... existing imports ...

// Existing Fastify({ bodyLimit, logger, disableRequestLogging }) gains one option:
const server = Fastify({
  bodyLimit: 25 * 1024 * 1024,
  logger: { /* ...existing... */ },
  disableRequestLogging: true,
  trustProxy: true,   // ← NEW: required so req.ip is the end client on Vercel
})

// ... existing plugins ...

server.register(async (scope) => {
  await scope.register(rateLimit, {
    // parseIntEnv (same helper as in fraud/engine.ts) guards against NaN.
    max: parseIntEnv('REF_RATE_LIMIT_MAX', 30),
    timeWindow: process.env.REF_RATE_LIMIT_WINDOW ?? '1 minute',
    cache: 10_000,
    keyGenerator: (req) => req.ip,
    continueExceeding: false,
    errorResponseBuilder: (_req, ctx) => ({
      data: null,
      error: {
        code: 'RATE_LIMITED',
        message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.`,
      },
    }),
  })
  registerAffiliateRedirectRoute(scope as never, {
    webBaseUrl: affiliateContainer.config.webBaseUrl,
    trackClickUseCase: affiliateContainer.trackClickUseCase,
  })
}, { prefix: '/ref' })
```

Encapsulation guarantees the limit applies only to handlers attached to this
child scope; `/affiliate`, `/admin/affiliate`, and `/internal/affiliate`
remain unaffected.
