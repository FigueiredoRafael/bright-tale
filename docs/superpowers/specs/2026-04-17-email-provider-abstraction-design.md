# Email Provider Abstraction (Resend → SMTP swap) — Design Spec

**Date:** 2026-04-17
**Status:** draft (post-brainstorm, pre-plan)
**Context:** Sub-project 0 of the affiliate-migration long-lived branch. Unblocks
rigorous smoke-test validation by swapping Resend-only email transport for a
provider abstraction that supports SMTP (via MailHog in dev). All downstream
sub-projects (2B through 2F) depend on this foundation being in place before
their integration tests run.

---

## 1. Context & Goals

### Background

Current email wiring in `apps/api/src/lib/email/resend.ts` exposes `sendEmail`
and `isResendConfigured` tightly coupled to the Resend HTTP API. The only
consumer in production code is `lib/affiliate/email-service.ts` (the affiliate
email service, 4+ call sites). Two pre-built transactional templates
(`sendContentPublishedEmail`, `sendCreditsLowEmail`) are defined but currently
unwired in application code.

The user has expanded scope: the affiliate migration will complete phases 2B
through 2F on a single long-lived branch before any staging deployment. Smoke
tests, integration validation, and local-only rehearsals (per cross-cutting
decision CC-4) replace the 48h staging soak of spec `2026-04-17-affiliate-2a-foundation-design.md` §7.2A.6.

Because the user has no Resend production account provisioned for this branch
and prefers SMTP for dev/test validation, the email transport needs a
provider-abstraction layer selectable via environment variable — the exact
design prescribed in the 2A spec §11.2F handoff notes, brought forward from
Phase 2F.

### Goals

1. Introduce `EMAIL_PROVIDER=resend|smtp|none` environment-variable dispatch
   behind a single public entrypoint `sendEmail(params)` exported from
   `apps/api/src/lib/email/provider.ts`.
2. Ship a SMTP provider implementation via `nodemailer` (pooled transporter
   singleton) suitable for local dev against MailHog and future production
   use against any RFC-5321 SMTP host.
3. Preserve Resend as a selectable provider with zero behavior change for
   callers that don't set `EMAIL_PROVIDER`.
4. Provide a silent `none` provider so dev environments without email
   infrastructure can run the full stack without polluting logs or throwing.
5. Split `apps/api/src/lib/email/resend.ts` into focused files:
   `provider.ts` (dispatcher) + `resend.ts` (impl) + `smtp.ts` (impl) +
   `noop.ts` (impl) + `templates.ts` (cross-cutting templates).
6. Wire MailHog Docker sidecar for integration tests; split vitest configs
   so `npm test` stays fast (unit only) and `npm run test:integration`
   exercises real SMTP flow.
7. Replace the `isResendConfigured()`-based silent-skip pattern with
   explicit opt-out via `EMAIL_PROVIDER=none`. This is a semantic evolution:
   silent behavior is now driven by an explicit env var rather than the
   implicit presence/absence of `RESEND_API_KEY`. Update the single
   production consumer (`lib/affiliate/email-service.ts`) and its test file
   atomically in the same commit.
8. Reconcile doc drift: `.env.example`, affiliate 2A spec, affiliate 2A plan,
   phase-5 milestone doc.
9. Absorb the orphan side-fix `supabase/migrations/20260414060000_draft_idea_id.sql`
   idempotency adjustment (carried over from the PR #4 resume prompt).

### Non-goals (explicitly out of scope)

- OAuth2 SMTP authentication. PLAIN + STARTTLS only for v1.
- Per-call `from` override. `RESEND_FROM` / `SMTP_FROM` envs drive the from
  address globally per provider.
- Attachments support in `SendEmailParams`. YAGNI; trivial future extension.
- App-level retry, throttle, or idempotency. Caller concerns.
- Graceful SIGTERM transporter shutdown. Parity with current repo, which
  has no signal handling anywhere.
- App-level timeouts. Nodemailer socket defaults + Resend `fetch` defaults
  (i.e., none) carry over.
- GitHub Actions integration-test CI. Local-only validation per CC-4 plus
  Vercel's existing typecheck-on-build remains the CI surface.
- Migration to `@tn-figueiredo/billing@0.2.1` (Phase 2F mega-project — a
  separate sub-project decides this).

---

## 2. Current State

### Email wiring

`apps/api/src/lib/email/resend.ts` (82 LOC) contains:
- `SendEmailParams`, `SendEmailResult` type exports
- `isResendConfigured(): boolean` exported predicate (used as silent-skip guard)
- `sendEmail(params): Promise<SendEmailResult>` — the only HTTP send path;
  throws when `RESEND_API_KEY` unset
- Two pre-built templates (`sendContentPublishedEmail`, `sendCreditsLowEmail`)
  that internally call `sendEmail`

### Consumers (grep-verified)

| Location | Uses | Role |
|---|---|---|
| `apps/api/src/lib/affiliate/email-service.ts` | `sendEmail`, `isResendConfigured` (4 call sites guarded) | Production — all affiliate transactional emails |
| `apps/api/src/__tests__/lib/affiliate/email-service.test.ts` | mocks `@/lib/email/resend`, stubs `isResendConfigured` in 3 places | Tests |
| `apps/docs-site/src/content/milestones/phase-5-publishing/index.md` | mentions template names | Doc-only (no runtime coupling) |

Pre-built templates are **not** consumed anywhere in `apps/api/src/**` — they
are scaffolding for future wiring.

### Known gaps and debt

- `resend.ts` mixes three concerns in one file: the `sendEmail` interface,
  the Resend HTTP implementation, and transactional templates. Splitting
  them improves discoverability and aligns file boundaries with
  responsibilities.
- Silent-skip pattern via `if (!isResendConfigured()) return` is opaque:
  nothing in the code indicates email flows are disabled; the
  `RESEND_API_KEY` env alone drives behavior. An explicit `EMAIL_PROVIDER=none`
  opt-out makes the intent legible.
- No SMTP path exists. Testing email in environments without Resend requires
  mocking at the module level (as the current affiliate test file does).

---

## 3. Target State

### Module structure

```
apps/api/src/lib/email/
├── provider.ts              public entrypoint: sendEmail(), types, EmailProvider union,
│                            __resetProviderForTest (test-only, underscore-marked)
├── resend.ts                ResendProvider.send() via fetch
├── smtp.ts                  SmtpProvider.send() via nodemailer, pooled Transporter singleton
├── noop.ts                  NoopProvider.send() — sync no-op
├── templates.ts             sendContentPublishedEmail + sendCreditsLowEmail
│                            (moved from resend.ts, consume provider.sendEmail)
└── __tests__/
    ├── provider.test.ts
    ├── resend.test.ts
    ├── smtp.test.ts
    ├── noop.test.ts
    ├── templates.test.ts
    └── smtp.integration.test.ts   (MailHog-backed, skipped when unavailable)

apps/api/
├── docker-compose.dev.yml   NEW: MailHog v1.0.1 (ports 1025, 8025)
├── vitest.integration.config.ts NEW: integration test config
└── src/test/mailhog.ts      NEW: helpers for integration tests only
```

### Public API

**Entrypoint (`@/lib/email/provider`):**
```ts
export type EmailProvider = 'resend' | 'smtp' | 'none';
export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}
export interface SendEmailResult {
  id: string;
  provider: EmailProvider;
}
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
export function __resetProviderForTest(): void;   // test-only; underscore signals internal
```

**Removed** from `@/lib/email/resend`:
- `sendEmail` — moved to `provider.ts`
- `isResendConfigured` — removed (callers migrate to `EMAIL_PROVIDER=none`)
- `sendContentPublishedEmail`, `sendCreditsLowEmail` — moved to `templates.ts`

### Shape preserved

`SendEmailParams` unchanged. `SendEmailResult.id` keeps `string` shape;
`.provider` extends from `'resend'` only to `'resend' | 'smtp' | 'none'`.

---

## 4. Architecture

### Data flow

```
caller (affiliate/email-service.ts, templates.ts)
  │
  ▼  sendEmail(params)                          provider.ts (public)
  │
  ▼  getProvider()                              provider.ts (lazy singleton)
  │   1. reads process.env.EMAIL_PROVIDER (default 'resend')
  │   2. validates required envs for chosen provider
  │   3. caches reference to selected send function
  │   4. NO log, NO breadcrumb (strict parity with current code)
  │
  ▼  send(params)                               chosen impl
  │
  ├── resend.send  → fetch POST api.resend.com/emails
  ├── smtp.send    → nodemailer.sendMail on pooled Transporter
  └── noop.send    → sync return { id:'noop', provider:'none' }
  │
  ▼  SendEmailResult { id, provider }
```

### Provider resolution

| `EMAIL_PROVIDER` | Required envs | Optional envs + defaults | Cached |
|---|---|---|---|
| unset or `'resend'` | `RESEND_API_KEY` | `RESEND_FROM` (default `BrightTale <noreply@brighttale.io>`) | `resend.send` |
| `'smtp'` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | `SMTP_USER`, `SMTP_PASS` (both unset = unauthenticated, MailHog) | `smtp.send` |
| `'none'` | — | — | `noop.send` |
| any other value | — | — | throws on first `getProvider()` |

### Error semantics

All wrapping uses `Error.cause` (ES2022) to preserve original stack traces.

| Origin | Trigger | Throw | Caller expectation |
|---|---|---|---|
| `getProvider()` | invalid `EMAIL_PROVIDER` value | `[email:provider] Invalid EMAIL_PROVIDER='X'. Valid: resend\|smtp\|none.` | Fail fast — deployment bug |
| `getProvider()` | required env missing | `[email:provider] <ENV> required when EMAIL_PROVIDER=<p>. Set in deployment env or apps/api/.env.local.` | Fail fast |
| `resend.send` | HTTP 4xx/5xx | `[email:resend] HTTP <status>: <body truncated to 200 chars>` | Runtime — caller decides |
| `resend.send` | network error (`fetch` reject, DNS, connection reset) | `[email:resend] Network error: <msg>` with `cause` = original | Runtime |
| `smtp.send` | nodemailer error (ECONNREFUSED, auth, timeout) | `[email:smtp] <err.message>` with `cause` = original | Runtime |
| `noop.send` | — | never throws | N/A |

No re-initialization on transient send failure. Provider resolved once; errors
bubble; caller owns retry/alert strategy.

### Edge cases

1. **`EMAIL_PROVIDER=none`** — sync return without validating `to` (pure
   pass-through for maximum speed). Use case: CI, dev without email infra,
   smoke tests that verify wiring only.
2. **Both `RESEND_API_KEY` and `SMTP_HOST` set** — `EMAIL_PROVIDER` is the
   tiebreaker; only the selected provider's envs are validated.
3. **Env change mid-process** — not supported; restart required. 12-factor.
4. **Concurrent first-init** — safe. Node event loop is single-threaded
   for the synchronous resolution path. `nodemailer.createTransport` is
   itself synchronous (only prepares config; does not open connection).
5. **Multi-recipient (`to: string[]`)** — one envelope, multiple RCPT TO.
   All recipients see each other (not BCC semantics). Parity with current
   Resend behavior.
6. **Partial delivery failure (bounces)** — transport-level accept =
   resolution success. Bounces arrive via provider webhooks, out of scope.
7. **Timeouts** — no app-level timeout. Nodemailer socket defaults + Resend
   `fetch` defaults (infinite). Matches current behavior.
8. **Payload size** — no app-level limit. Resend enforces ~40MB; SMTP
   depends on receiving MTA (~30MB SES typical). Callers should keep HTML
   under 500KB in practice.
9. **Rate limiting** — no client-side throttle. Resend 429 bubbles as
   transport error; caller decides.
10. **Attachments** — unsupported (`SendEmailParams` lacks `attachments`).
    Future extension trivially adds an optional field.
11. **MailHog not running** — integration test preflight detects and
    skips the suite (see §5).
12. **Template rendering error** — caller's concern. Dispatcher passes
    `html` / `text` verbatim.

---

## 5. Testing

### Unit tests (~39 new: provider 12 + resend 8 + smtp 7 + noop 3 + templates 5 + affiliate/email-service diff ~4 net)

| File | Test count | Focus | Mocks |
|---|---|---|---|
| `provider.test.ts` | ~12 | Dispatch across all `EMAIL_PROVIDER` values (resend / smtp / none); default unset → resend; invalid value throws; missing env throws with remediation-rich message (per provider); cache idempotence; `__resetProviderForTest` clears cache; `Error.cause` preserved on wraps; end-to-end dispatch to noop (verifies no-op return shape without mocking provider module); `RESEND_FROM` default applied when env unset | — |
| `resend.test.ts` | ~8 | Happy path (URL, Authorization header, body shape JSON); HTTP 4xx throws with truncation; HTTP 5xx; network error wrapped with cause; `replyTo` → `reply_to` key; multi-recipient array passes through | `vi.fn()` on `global.fetch` |
| `smtp.test.ts` | ~7 | Happy path; `createTransport` params (host/port/auth — no explicit `secure`, nodemailer auto); singleton reuse (N sends → 1 createTransport); transport error wrapped with cause; `replyTo` header; multi-recipient | `nodemailer-mock` |
| `noop.test.ts` | ~3 | Correct shape; synchronous return; zero side effects (no `fetch`, no nodemailer exercised); accepts invalid `to` without validation | — |
| `templates.test.ts` | ~5 | `sendContentPublishedEmail` renders valid HTML + subject contains title; `sendCreditsLowEmail` renders percentage correctly; both pass-through to `sendEmail`; assert HTML is passed verbatim (no escape at template layer — caller is responsible for input sanitization); import path resolves | `vi.mock('@/lib/email/provider')` |
| `affiliate/email-service.test.ts` (modified) | diff `-8 / +3` | Mock target changed to `@/lib/email/provider`; 3 `isResendConfigured` mocks removed. No new test added here (EMAIL_PROVIDER=none dispatch belongs in provider.test.ts, where it can exercise real dispatch logic; mocking provider in this file would defeat the test's purpose) | `vi.mock('@/lib/email/provider')` |

### Integration test — `smtp.integration.test.ts`

Preflight pattern (top-level await, vitest 4 ESM):
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { preflightMailhog, clearMailhog, getMailhogMessages } from '@/test/mailhog';

const preflightOk = await preflightMailhog();

describe.skipIf(!preflightOk)('SMTP integration via MailHog', () => {
  beforeEach(async () => { await clearMailhog(); });

  it('sends basic email', async () => { /* ... */ }, { timeout: 15_000 });
  it('multi-recipient → single envelope with multiple RCPT TO', async () => { /* ... */ });
  it('preserves replyTo header', async () => { /* ... */ });
  it('multipart HTML + text', async () => { /* ... */ });
});
```

**Safety check** inside `preflightMailhog()`: if `MAILHOG_HOST` is set and is
neither `localhost`, `127.0.0.1`, nor `host.docker.internal`, throw with
"Refusing to run integration tests against non-local SMTP." Prevents
accidental real-email sends against production hosts.

**Test timeout 15s** overrides vitest default 5s for MailHog cold-start
tolerance.

### Test infrastructure

**`apps/api/docker-compose.dev.yml`:**
```yaml
services:
  mailhog:
    image: mailhog/mailhog:v1.0.1   # pinned, not :latest
    container_name: bright-tale-mailhog
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web UI + HTTP API
    restart: unless-stopped
```

**Root `package.json` scripts:**
```json
{
  "email:start": "docker compose -f apps/api/docker-compose.dev.yml up -d",
  "email:stop": "docker compose -f apps/api/docker-compose.dev.yml down",
  "email:ui": "open http://localhost:8025"
}
```

**`apps/api/src/test/mailhog.ts` helpers** — `preflightMailhog()`,
`clearMailhog()`, `getMailhogMessages()`. Convention: only imported by
`*.integration.test.ts`.

### Vitest config split

Modify `apps/api/vitest.config.ts` — add `'src/**/*.integration.test.ts'`
to `exclude`. Add `coverage` config with v8 provider. Coverage is scoped
narrowly via `include: ['src/lib/email/**/*.ts']` so the thresholds apply
only to this sub-project's files; unrelated modules keep their current
(unmeasured) coverage posture. Thresholds at config level are set to the
floor of per-file targets (`branches: 95, functions: 95, lines: 90, statements: 90`);
`templates.ts` is intentionally below the `branches` floor (~80%) and is
listed in `coverage.exclude` so it does not fail the build. This matches
the per-file table: infra ≥95%, templates ≥80% (baseline).

New `apps/api/vitest.integration.config.ts`:
```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

export default mergeConfig(base, defineConfig({
  test: {
    name: 'integration',
    include: ['src/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 15_000,
  },
}));
```

New scripts in `apps/api/package.json`:
```json
{
  "test:integration": "vitest run -c vitest.integration.config.ts --reporter verbose",
  "test:coverage": "vitest run --coverage"
}
```

### Coverage targets

| File | Branch coverage | Rationale |
|---|---|---|
| `provider.ts` | ≥95% | Critical infra — all error paths tested |
| `resend.ts` | ≥95% | Critical infra |
| `smtp.ts` | ≥95% | Critical infra |
| `noop.ts` | 100% | Trivial surface |
| `templates.ts` | ≥80% | Code movement; add baseline tests for HTML/subject shape |

---

## 6. Configuration

### Environment variables (full matrix)

| Var | Required when | Default | Notes |
|---|---|---|---|
| `EMAIL_PROVIDER` | optional | `resend` | `resend` / `smtp` / `none` |
| `RESEND_API_KEY` | `EMAIL_PROVIDER=resend` (or unset) | — | Resend API token |
| `RESEND_FROM` | optional | `BrightTale <noreply@brighttale.io>` | From address |
| `SMTP_HOST` | `EMAIL_PROVIDER=smtp` | — | |
| `SMTP_PORT` | `EMAIL_PROVIDER=smtp` | — | 587 typical prod, 1025 MailHog |
| `SMTP_FROM` | `EMAIL_PROVIDER=smtp` | — | |
| `SMTP_USER` | optional | unset | MailHog requires none |
| `SMTP_PASS` | optional | unset | |
| `MAILHOG_HOST` | optional (integration only) | `localhost` | Preflight + safety check (non-local value refused) |
| `MAILHOG_SMTP_PORT` | optional (integration only) | `1025` | |
| `MAILHOG_API_PORT` | optional (integration only) | `8025` | |

### `.env.example` section (replaces line-92 `isResendConfigured` mention)

```bash
# ─── Email transport ──────────────────────────────────────────────────
# Choose provider: resend (default), smtp (dev/MailHog), none (silent no-op).
# EMAIL_PROVIDER=resend

# Resend (default when EMAIL_PROVIDER unset or =resend)
# RESEND_API_KEY=re_xxx
# RESEND_FROM="BrightTale <noreply@brighttale.io>"

# SMTP (when EMAIL_PROVIDER=smtp; MailHog defaults shown)
# SMTP_HOST=localhost
# SMTP_PORT=1025
# SMTP_FROM=dev@brighttale.local
# SMTP_USER=         # optional; MailHog doesn't require auth
# SMTP_PASS=

# Integration tests only (MailHog preflight — defaults shown)
# MAILHOG_HOST=localhost
# MAILHOG_SMTP_PORT=1025
# MAILHOG_API_PORT=8025
```

---

## 7. Migration Path

Two commits on the long-lived branch `feat/affiliate-2a-foundation` (scope
expanding; branch rename deferred per CC-1 until PR #4 is merged or closed).

### Commit A — Additive infra (green, no consumers touched)

1. Add deps to `apps/api/package.json`: `nodemailer@^8`, devDeps
   `@types/nodemailer@^8`, `nodemailer-mock@^2.0.10`. Run `npm install`.
2. Create `apps/api/docker-compose.dev.yml` with MailHog `v1.0.1` pinned.
   Add root `package.json` scripts: `email:start`, `email:stop`, `email:ui`.
3. Create `src/lib/email/provider.ts`, `smtp.ts`, `noop.ts`. Add one-line
   alias to existing `src/lib/email/resend.ts`: `export const send = sendEmail;`
   — exposes the shape `provider.ts` statically imports without changing
   existing behavior. Consumers (`sendEmail`, `isResendConfigured`, templates)
   remain untouched. **Type duplication note:** during Commit A, both
   `resend.ts` and `provider.ts` export types named `SendEmailParams` and
   `SendEmailResult`. `resend.ts`'s `SendEmailResult.provider: 'resend'` is
   a structural subtype of `provider.ts`'s `SendEmailResult.provider: EmailProvider`,
   so the alias is type-compatible via covariance. The duplication resolves
   in Commit B when resend.ts stops exporting these types.
4. Modify `apps/api/vitest.config.ts` — add integration-file exclude and
   coverage config. Create `apps/api/vitest.integration.config.ts`. Add
   scripts `test:integration`, `test:coverage`.
5. Create `src/test/mailhog.ts` helper.
6. Create `__tests__/{provider,smtp,noop}.test.ts` and
   `__tests__/smtp.integration.test.ts`.
7. Verify: `npm run typecheck`, `npm test` (old suite still passes because
   resend.ts behavior is unchanged), `npm run email:start && npm run test:integration`.

### Commit B — Refactor + consumer update (atomic)

8. Refactor `src/lib/email/resend.ts`: reduce to a single `send(params)` export.
   Remove `sendEmail`, `isResendConfigured`, template functions, AND the
   `SendEmailParams` / `SendEmailResult` type re-exports (now re-exported
   only from `provider.ts`). Update the file-level JSDoc header to
   describe this module as the Resend implementation for the provider
   abstraction (not the top-level email API).
9. Create `src/lib/email/templates.ts`. Move `sendContentPublishedEmail`
   and `sendCreditsLowEmail` out of `resend.ts` into this file; each now
   imports `sendEmail` from `./provider`.
10. Create `__tests__/resend.test.ts` and `__tests__/templates.test.ts`.
11. Update `src/lib/affiliate/email-service.ts`: change import from
    `@/lib/email/resend` to `@/lib/email/provider`; remove all 4
    `if (!isResendConfigured()) return` guards.
12. Update `__tests__/lib/affiliate/email-service.test.ts`: change mock
    target; remove three `isResendConfigured` mock setups; add one new
    test "respects EMAIL_PROVIDER=none".
13. Reconcile doc drift:
    - `apps/api/.env.example` — replace email section per §6 above
    - `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`
      — add a single errata note at the top: "Post-publication: the
      `isResendConfigured()` silent-skip pattern and the `@/lib/email/resend`
      import paths referenced throughout (§3, §4, §5, §6, Appendix A.3)
      were superseded on 2026-04-17 by the email provider abstraction
      (sub-project 0). See `2026-04-17-email-provider-abstraction-design.md`.
      Inline text left unchanged as historical record."
    - `docs/superpowers/plans/2026-04-17-affiliate-2a-foundation.md` — same
      errata approach; do not rewrite inline task mocks
    - `apps/docs-site/src/content/milestones/phase-5-publishing/index.md` —
      update template import paths to `@/lib/email/templates` (this is a
      live doc for future readers, not historical record)
14. Apply side-fix `supabase/migrations/20260414060000_draft_idea_id.sql`
    idempotency (IF NOT EXISTS + DO/EXISTS guard). Orphan from PR #4
    resume prompt; absorbed because it's small and isolated.
15. Full verification (see §9).

### Commit split rationale

Commit A is purely additive and safe to pause, revert, or rebase without
breaking anything. Commit B is atomic by necessity: removing
`isResendConfigured` and updating consumers in the same commit avoids an
intermediate broken state.

---

## 8. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Ungrepped consumer of `isResendConfigured` | Low | Exhaustive grep done (2 callers); typecheck catches any miss in Commit B |
| R2 | Nodemailer engine mismatch with monorepo | Low | Nodemailer 8 declares `engines.node: ">=6.0.0"`; root `package.json` enforces `>=20.0.0` — strictly within bounds |
| R3 | MailHog v1.0.1 is EOL (last release 2020) | Low | Tool is stable and widely used; drop-in replacement `axllent/mailpit` available if it becomes unusable |
| R4 | Commit A breaks the build if `npm install` fails | Low | Verified locally before push; Vercel rebuilds on merge |
| R5 | Commit B rollback touches many files | Medium | Accepted — rollback is a coherent semantic revert; alternative (deprecation shim) adds more debt |
| R6 | Race between `vi.stubEnv` and singleton cache in tests | Low | Mandatory ordering documented: `stubEnv` → `__resetProviderForTest` → send. Enforced via helper template in spec §5 |
| R7 | Doc drift accumulating as 2B+ progress on same branch | Medium | Reconciliation explicit per sub-project; CC-2 (rebase cadence) reduces compounding |
| R8 | `@types/nodemailer` decouples from `nodemailer` in minor bumps | Low | Caret-major pin on both (`^8`); Dependabot covers |
| R9 | TypeScript type duplication between Commit A and Commit B (resend.ts + provider.ts both export same type names) | Low | Covariance makes the transition safe; typecheck passes throughout; fully resolved after Commit B step 8 strips duplicates |

---

## 9. Done Criteria

Consolidated across architecture, testing, and migration.

1. `npm run typecheck` green across 4 workspaces.
2. `npm test` green: existing 850+ tests + ~39 new unit tests.
3. `npm run email:start && npm run test:integration` green — 4 integration
   tests via MailHog.
4. `EMAIL_PROVIDER=none npm test` green — silent mode validates.
5. `npm run test:coverage` hits thresholds per §5.
6. Manual spot-check: API running with `EMAIL_PROVIDER=smtp` + MailHog up;
   trigger affiliate application flow; verify email appears in MailHog UI
   at `http://localhost:8025`.
7. Zero occurrences of `isResendConfigured` in `apps/api/src/**`.
8. Doc drift reconciled in 4 locations (§7.13).
9. Side-fix `draft_idea_id.sql` applied.
10. Diff total ~600–800 LOC inclusive of docs (soft target; not enforced
    but flagged in review if breached significantly — signals scope creep).
11. Vitest split functional: `npm test` runs unit only (fast, no Docker);
    `npm run test:integration` runs separately.
12. Two separate commits (A: additive, B: atomic refactor + consumer update)
    with descriptive messages.

---

## 10. Out of Scope (reiterated)

- OAuth2 SMTP auth, per-call `from` override, attachments, app-level retry/
  throttle/idempotency, SIGTERM graceful shutdown, app-level timeouts,
  GitHub Actions integration-test CI, migration to `@tn-figueiredo/billing`.

---

## 11. Handoff to next sub-project (Sub-project 1 — Phase 2B)

After merge of this sub-project on the long-lived branch:
- SMTP transport is available for any email workflow added by 2B onwards.
- `templates.ts` is the home for cross-cutting transactional emails. New
  product flows add their templates there. **Unwired status preserved:**
  `sendContentPublishedEmail` and `sendCreditsLowEmail` remain exported but
  not invoked from any runtime flow (same as today). Wiring is out of
  scope — a future sub-project calls them from the appropriate event path.
- The provider pattern is established; adding SES, Postmark, or SendGrid in
  the future means: one new `impl.ts` with `send(params)`, plus one new
  case in `provider.ts` dispatcher, plus one new env-var group.
- First change in Sub-project 1: fix `/signup` URL drift documented in
  `apps/api/src/lib/affiliate/config.ts:5-8`, standardizing on
  `/[locale]/auth/signup`.

---

## 12. References

- Affiliate 2A spec: `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md` (§11.2F handoff prescribed this design)
- Affiliate 2A plan: `docs/superpowers/plans/2026-04-17-affiliate-2a-foundation.md`
- Current email impl: `apps/api/src/lib/email/resend.ts`
- Nodemailer 8: https://www.npmjs.com/package/nodemailer
- nodemailer-mock: https://www.npmjs.com/package/nodemailer-mock
- MailHog: https://github.com/mailhog/MailHog

---

## Appendix A — Code skeletons

### A.1 `apps/api/src/lib/email/provider.ts`

```ts
import { send as resendSend } from './resend.js';
import { send as smtpSend } from './smtp.js';
import { send as noopSend } from './noop.js';

export type EmailProvider = 'resend' | 'smtp' | 'none';

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  id: string;
  provider: EmailProvider;
}

type SendFn = (params: SendEmailParams) => Promise<SendEmailResult>;

let _cached: SendFn | null = null;

function requireEnv(name: string, provider: EmailProvider): void {
  if (!process.env[name]) {
    throw new Error(
      `[email:provider] ${name} required when EMAIL_PROVIDER=${provider}. Set in deployment env or apps/api/.env.local.`,
    );
  }
}

function resolve(): SendFn {
  const provider = (process.env.EMAIL_PROVIDER ?? 'resend') as EmailProvider;
  switch (provider) {
    case 'resend':
      requireEnv('RESEND_API_KEY', 'resend');
      return resendSend;
    case 'smtp':
      requireEnv('SMTP_HOST', 'smtp');
      requireEnv('SMTP_PORT', 'smtp');
      requireEnv('SMTP_FROM', 'smtp');
      return smtpSend;
    case 'none':
      return noopSend;
    default:
      throw new Error(
        `[email:provider] Invalid EMAIL_PROVIDER='${provider}'. Valid: resend|smtp|none.`,
      );
  }
}

function getProvider(): SendFn {
  if (_cached) return _cached;
  _cached = resolve();
  return _cached;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  return getProvider()(params);
}

/** Test-only. Resets the provider cache so tests can swap EMAIL_PROVIDER. */
export function __resetProviderForTest(): void {
  _cached = null;
}
```

Static imports chosen over dynamic: nodemailer + Resend modules are small (~500KB combined), import cost amortized at process boot (not at first send), and the synchronous `getProvider()` simplifies the hot path. Tradeoff accepted: all three impls load at init, even if only one provider is used in the active env.

### A.2 `apps/api/src/lib/email/smtp.ts`

```ts
import nodemailer, { type Transporter } from 'nodemailer';
import type { SendEmailParams, SendEmailResult } from './provider.js';

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (_transporter) return _transporter;
  // provider.ts's requireEnv has already validated SMTP_HOST/PORT/FROM by the
  // time we get here; narrow defensively anyway to avoid non-null assertions.
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  if (!host || !portStr) {
    throw new Error('[email:smtp] invariant: SMTP_HOST/SMTP_PORT missing after provider validation');
  }
  _transporter = nodemailer.createTransport({
    host,
    port: parseInt(portStr, 10),
    // `secure` omitted intentionally: nodemailer auto-detects per RFC — port 465
    // defaults to implicit TLS; any other port uses STARTTLS after EHLO (e.g.,
    // 587 prod, 1025 MailHog unauthenticated).
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    pool: true,
  });
  return _transporter;
}

export async function send(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    const info = await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to: params.to,   // nodemailer accepts string or string[] directly
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
    });
    return { id: info.messageId, provider: 'smtp' };
  } catch (err) {
    throw new Error(
      `[email:smtp] ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
```

### A.3 `apps/api/src/lib/email/noop.ts`

```ts
import type { SendEmailParams, SendEmailResult } from './provider.js';

export async function send(_params: SendEmailParams): Promise<SendEmailResult> {
  return { id: 'noop', provider: 'none' };
}
```

### A.4 `apps/api/src/test/mailhog.ts`

```ts
import net from 'node:net';

const host = process.env.MAILHOG_HOST ?? 'localhost';
const smtpPort = parseInt(process.env.MAILHOG_SMTP_PORT ?? '1025', 10);
const apiPort = parseInt(process.env.MAILHOG_API_PORT ?? '8025', 10);

const LOCAL_HOSTS = ['localhost', '127.0.0.1', 'host.docker.internal'];

export async function preflightMailhog(): Promise<boolean> {
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(
      `Refusing to run integration tests against non-local SMTP (MAILHOG_HOST=${host}). ` +
        `Unset MAILHOG_HOST or point to localhost:1025.`,
    );
  }
  return new Promise<boolean>((resolve) => {
    const sock = net.createConnection({ host, port: smtpPort, timeout: 2000 });
    sock.once('connect', () => { sock.end(); resolve(true); });
    sock.once('error', () => { sock.destroy(); resolve(false); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
  });
}

export interface MailhogMessage {
  ID: string;
  From: { Mailbox: string; Domain: string };
  To: Array<{ Mailbox: string; Domain: string }>;
  Content: { Headers: Record<string, string[]>; Body: string };
}

export async function getMailhogMessages(): Promise<MailhogMessage[]> {
  const res = await fetch(`http://${host}:${apiPort}/api/v2/messages`);
  if (!res.ok) throw new Error(`MailHog API ${res.status}`);
  const json = (await res.json()) as { items: MailhogMessage[] };
  return json.items;
}

export async function clearMailhog(): Promise<void> {
  const res = await fetch(`http://${host}:${apiPort}/api/v1/messages`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`MailHog clear ${res.status}`);
}
```

`resend.ts` and `templates.ts` skeletons follow the same patterns and are
straightforward given the current `resend.ts` implementation — reference
existing code.
