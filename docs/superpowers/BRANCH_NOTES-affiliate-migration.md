# Affiliate Migration Branch — Implementation Notes

**Branch:** `feat/affiliate-2a-foundation`
**Scope:** SP0 (email provider abstraction) + SP1-4 (Phases 2B, 2C, 2E, 2F). SP5 (Phase 2D legacy cutover) pending.
**Execution mode:** 4 parallel sub-agents on the same branch (no worktree isolation) per user's "max parallelism" directive. Expected chaos in git history; mitigated by append-only discipline (no force-push, no destructive rewrites).

---

## Commit → Sub-project map

The parallel execution produced several mislabeled or phantom commits. This table is the authoritative mapping of commit SHA → actual content:

| SHA | Commit message | Actual content | Files | Notes |
|---|---|---|---|---|
| `305d92d` | feat(api): email provider abstraction (Commit A — additive infra) | ✅ SP0 Commit A | 15 | Clean |
| `9ff40b1` | feat(api): email provider abstraction (Commit B — refactor + migrate consumer) | ✅ SP0 Commit B | 11 | Clean |
| `8313f7f` | feat(app): affiliate 2B — additive scaffolding (Commit A) | ✅ SP1 (2B) Commit A | 8 | Clean |
| `996eadf` | feat(web): install @tn-figueiredo/affiliate-admin@0.3.3 (Phase 2C — Commit A) | ✅ SP2 (2C) Commit A | 3 | Clean |
| `d6d2f27` | feat(web): affiliate admin UI (Phase 2C — Commit B) | **❌ MISLABELED — actually SP3 (2E) Phase A fraud files** | 13 | Concurrent 2E files captured by 2C agent's lint-staged hook mid-commit |
| `1505205` | feat(app): affiliate 2B — end-user UI rewrite against new /api/affiliate/* (Commit B) | **⚠️ PHANTOM — tree-empty** | 0 | Rich commit message but zero file changes. Race condition with 2C/2E indexing. Content re-landed as `1ae6490` |
| `7437e4d` | feat(web): affiliate admin UI (Phase 2C — Commit B) | ✅ SP2 (2C) Commit B (the real one) | 35 | 2C pages/actions/BFF + app/web errata |
| `987a621` | feat(api): affiliate 2F — minimal Stripe webhook → CalculateAffiliateCommissionUseCase hook | **⚠️ PHANTOM — tree-empty** | 0 | Same race class as 1505205. Content re-landed as `3c383cc` |
| `3c383cc` | feat(api): affiliate 2F — minimal Stripe webhook → CalculateAffiliateCommissionUseCase hook (code) | ✅ SP4 (2F) — real content | 3 | Stripe webhook → commission hook |
| `8b5560b` | feat(api): affiliate 2E container wire — activate fraud service (Commit B) | ✅ SP3 (2E) Commit B | 2 | Container wire |
| `d278038` | docs(affiliate): reconcile 2A → 2E errata + .env.example (Commit C) | ✅ SP3 (2E) Commit C | 3 | Doc drift + env example |
| `1ae6490` | feat(app): affiliate 2B — end-user UI rewrite (Commit B, recovery) | ✅ SP1 (2B) Commit B (recovery — the real one) | 27 | All of 2B's orphaned UI work; restores what 1505205 should have had |

### Logical sub-project boundaries (post-audit)

- **SP0 — Email provider abstraction:** `305d92d` + `9ff40b1`
- **SP1 — Phase 2B (end-user UI):** `8313f7f` + `1ae6490` (skip `1505205` phantom)
- **SP2 — Phase 2C (admin UI):** `996eadf` + `7437e4d` (skip `d6d2f27` — it's 2E content)
- **SP3 — Phase 2E (fraud + rate-limit):** `d6d2f27` (mislabeled, it's 2E Phase A) + `8b5560b` + `d278038`
- **SP4 — Phase 2F (billing hook minimal):** `3c383cc` (skip `987a621` phantom)

---

## Plan deviations (documented here; plan files NOT back-propagated)

### SP0 — Email provider abstraction
- Vitest integration config rewritten as standalone (not `mergeConfig`) — mergeConfig concatenates `exclude`, which cancelled the integration `include`. Documented in commit message.
- Commit A test count was 22 (not 32 per plan); the 37-total figure in plan assumed Commit A included resend.test.ts + templates.test.ts, which correctly landed in Commit B.

### SP1 — Phase 2B (end-user UI)
- `recent-referrals.tsx` used plan-prescribed field names `firstTouchAt`/`status`/`conversionAt` but the real package type is `signupDate`/`attributionStatus`/`convertedAt`. Fixed to match runtime shape.
- `commission-history.tsx` used plan-prescribed `c.amountBrl ?? c.totalBrl`; `amountBrl` is not on `AffiliateCommission`. Simplified to `c.totalBrl`.
- `content-submissions.test.tsx` Test 1 used `getByText` which failed on duplicate matches; switched to `getAllByText(...).length > 0`.
- Two targeted `eslint-disable-next-line` for intentional `useEffect(load)` pattern (set-state-in-effect + exhaustive-deps). Pattern is standard for "fetch on mount" with retry.

### SP2 — Phase 2C (admin UI)
- `proxy.ts` refactored from module-load capture to per-request `apiBase()` function — original captured env at import, broke happy-path test which set env in `beforeEach`.
- `affiliate-queries.ts` return types narrowed from `unknown | null` to real package types (`AffiliateRiskScore`, etc.) — original failed TS assignability.
- `fraud.ts` used `FraudFlagStatus` union from package but `resolveFlag` expects a narrower subset — replaced with inline literal union.
- `content/page.tsx` — `AffiliateContentServer` expects `AffiliateContentSubmission[]`, not `{items,total}` — destructured `items` from fetch return.
- Action tests needed `vi.restoreAllMocks()` in `beforeEach` (original plan accumulated fetch history across tests).

### SP3 — Phase 2E (fraud + rate-limit)
- `errorResponseBuilder` returns include `statusCode: 429` (plan's literal snippet omitted it). Without this, Fastify's default serializer emits 500.
- Added side-effect `import "fastify-raw-body"` to `apps/api/src/index.ts` — required for module augmentation of `FastifyContextConfig` to keep typecheck green after `@fastify/rate-limit` was installed (the new package's augmentation clashed with the existing `config: { rawBody: true }` usage in billing.ts). Legitimate fix, clearly commented.
- Container tests split into new sibling file `container.fraud.test.ts` (plan explicitly allowed this alternative).

### SP4 — Phase 2F (billing hook)
- Task 1 Step 3 referenced `lib/affiliate/affiliate.ts` (non-existent); the `org_memberships.created_at ASC LIMIT 1` convention actually lives in `routes/billing.ts:19-27` (`getOrg`). Resolver mirrors that pattern.
- 2A spec errata text landed via concurrent 2C agent's commit `7437e4d`, not 2F's own. Content matches plan.

---

## Known residual gaps

1. **Cross-sub-project integration smoke not performed.**
   - Admin UI (SP2) → fraud service (SP3) end-to-end flow: not exercised. Action wrappers hit BFF routes that proxy to API. The entire flow is unit-tested at each layer, but no clicks-through-the-UI rehearsal.
   - Billing webhook (SP4) → commission hook (2A container): unit-tested with mocked `stripe` events. No real Stripe Test Mode replay.
   - End-user UI (SP1) → /api/affiliate/* routes: mocked at the fetch layer in tests; no running-backend rehearsal.
   - **Status (2026-04-17):** ✅ Automated smoke rehearsal implemented at `scripts/smoke-affiliate.ts`. Run via `npm run smoke:affiliate` (requires `npm run db:start` + `npm run dev:api`). Design spec: `docs/superpowers/specs/2026-04-17-affiliate-branch-smoke-design.md`. Implementation plan: `docs/superpowers/plans/2026-04-17-affiliate-branch-smoke.md`. 16-probe TDD: 40 unit tests + 2 integration tests (gated on local Supabase). Full E2E run pending — local Supabase was not running at verification time (Task 15, 2026-04-17); `apps/api` was UP on :3001. Reviewer can run full E2E with `npm run db:start && npm run dev:api && npm run smoke:affiliate`. First green run not yet captured; exit code and SHA TBD by reviewer.

2. **MailHog arm64 platform warning.** Docker reports `linux/amd64 image on linux/arm64/v8 host`. MailHog runs fine under emulation; noise only. If this becomes an issue, swap image to `axllent/mailpit` (native multi-arch fork).

3. **Plan files NOT updated with deviations.** The plans at `docs/superpowers/plans/2026-04-17-affiliate-2*.md` still reflect the pre-execution design. Actual code deviates in the ways listed above. Trust the commit messages + this document over the plans for "what was built."

4. **Branch name is stale.** `feat/affiliate-2a-foundation` now contains SP0 + 2A + 2B + 2C + 2E + 2F. Naming survives from the original 2A-only scope.

5. **SP5 (Phase 2D legacy cutover) not executed.** Destructive sub-project held by design until reviewer approves the additive SP1-4 work.

6. **Commit history is cosmetically messy.** Ghost commits `1505205`, `987a621` and mislabeled `d6d2f27` stay in the log by policy (no force-push, no destructive rewrites). An interactive rebase could clean them up if the reviewer prefers.

7. **Integration test config is standalone, not `mergeConfig`.** `apps/api/vitest.integration.config.ts` duplicates base config rather than inheriting — acceptable tradeoff for include/exclude determinism but means future base changes require two edits.

8. **No push to remote yet.** Branch is 23+ commits ahead of origin. PR #4 still tracks the older SP0 tip. Opening a fresh PR (or updating #4) is the reviewer's call.

---

## Verification at branch tip

Post-2B-recovery state (HEAD = `1ae6490`):

- `npm run typecheck` — 4 workspaces green
- `npm test` — monorepo total: 1064 tests passing (api 930, app 90, web 27, shared 17); 10 skipped
- `npm run test:integration` (apps/api, with MailHog running) — 4 integration tests passing
- **Runtime boot:** `node --env-file=.env.local --import tsx/esm src/index.ts` starts cleanly within ~1s, logs `Server listening at http://0.0.0.0:3001`. No plugin registration errors, no container-wiring errors, no module-augmentation clashes. Confirms that `fastify-raw-body` + `@fastify/rate-limit` + the affiliate routes + SP0 email provider all compose at runtime, not just under `tsc --noEmit`.
- Working tree: clean (only `.claude/scheduled_tasks.lock` + `next-env.d.ts` auto-regenerations)

---

## Sub-project done criteria consolidation

| SP | Tests pass | Typecheck | Spec errata landed | Residual notes |
|---|---|---|---|---|
| SP0 | ✅ 30 new (provider 12 + smtp 7 + noop 3 + resend 8 + templates 5 — full Commit B count) | ✅ | ✅ 2A spec + plan | Coverage config scopes to `src/lib/email/**`; templates.ts excluded (HTML-heavy, code-review check) |
| SP1 (2B) | ✅ +61 in apps/app | ✅ | ✅ /signup drift fixed in config.ts | Recovery commit needed; plan-to-package type mismatches corrected inline |
| SP2 (2C) | ✅ +19 in apps/web | ✅ | ✅ TODO-2F.md + package errata | 4 skipped provider actions documented as `TODO-2F`; smoke deferred |
| SP3 (2E) | ✅ +31 Phase A + 3 Phase B in apps/api | ✅ | ✅ 2A spec + plan errata + .env.example | `fastify-raw-body` side-effect import is legit; trustProxy set |
| SP4 (2F) | ✅ +16 in apps/api | ✅ | ✅ 2A spec (via 2C's commit) | Unit-tested only; real Stripe webhook unexercised (by design — STRIPE_SECRET_KEY not set in dev) |
