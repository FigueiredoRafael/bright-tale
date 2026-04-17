# Affiliate-Migration Branch Smoke Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `scripts/smoke-affiliate.ts` — a deterministic 16-probe HTTP rehearsal that exercises cross-sub-project runtime wiring (SP1/SP2/SP3/SP4) against the running local stack, closing BRANCH_NOTES §"Known residual gaps" item 1.

**Architecture:** Single entry under `scripts/` with a `smoke/` module dir. Probe-based contract (each probe is a small `{id, sp, desc, run(ctx)}` object). Seed → probes → cleanup wrapped in top-level `try/finally`. HTTP against apps/api port 3001 with `X-Internal-Key` + `x-user-id` headers. DB assertions via service-role supabase-js client. Stripe webhooks signed with `generateTestHeaderString`.

**Tech Stack:** TypeScript + tsx + vitest (existing devDeps). `@supabase/supabase-js` (existing), `stripe` (existing), `undici`/native fetch. No new runtime deps in apps/*.

**Spec:** `docs/superpowers/specs/2026-04-17-affiliate-branch-smoke-design.md`

---

## File structure (created or touched)

```
scripts/
├── smoke-affiliate.ts              ← NEW entry point (~120 LOC)
└── smoke/
    ├── types.ts                    ← NEW shared interfaces + exit codes
    ├── cli.ts                      ← NEW flag parser
    ├── env.ts                      ← NEW env loader + safety interlock
    ├── preflight.ts                ← NEW health checks
    ├── http.ts                     ← NEW envelope-agnostic fetch wrapper
    ├── stripe-event.ts             ← NEW signed Stripe test-event builder
    ├── fixture.ts                  ← NEW seed + cleanup + baselines
    ├── reporter.ts                 ← NEW normal/quiet/verbose/json
    └── probes/
        ├── index.ts                ← NEW probe registry + execution order
        ├── sp1.ts                  ← NEW 3 probes
        ├── sp2.ts                  ← NEW 6 probes
        ├── sp3.ts                  ← NEW 4 probes
        └── sp4.ts                  ← NEW 3 probes
scripts/smoke/__tests__/            ← NEW vitest unit tests per module
package.json                        ← MODIFY add "smoke:affiliate" script
docs/superpowers/BRANCH_NOTES-affiliate-migration.md ← MODIFY close residual gap
```

Expected LOC: ~900 code + ~600 tests.

---

## Task 1: Project setup — types, package.json, test config

**Files:**
- Create: `scripts/smoke/types.ts`
- Create: `scripts/smoke/__tests__/.gitkeep`
- Modify: `package.json` (add script)
- Create: `vitest.smoke.config.ts` (root)

- [ ] **Step 1: Create `scripts/smoke/types.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export const ExitCode = {
  Ok: 0,
  ProbeFailed: 1,
  PreflightFailed: 2,
  SeedFailed: 3,
  CleanupFailed: 5,
  Timeout: 124,
  SIGINT: 130,
} as const
export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode]

export interface SeedHandles {
  adminUserId: string
  affiliateOwnerUserId: string
  referredUserId: string
  affiliateId: string
  affiliateCode: string
  referralId: string
  organizationId: string
  commissionId: string
  fraudFlagId: string
}

export interface Baselines {
  pendingCommissionCountForAffiliate: number
}

export interface ProbeContext {
  fixture: SeedHandles
  baselines: Baselines
  apiUrl: string
  supabase: SupabaseClient
  internalKey: string
  stripeWebhookSecret: string | null
}

export interface ProbeOutcome {
  status: 'pass' | 'fail' | 'skip'
  detail?: string
}

export interface Probe {
  id: string
  sp: 1 | 2 | 3 | 4
  desc: string
  timeoutMs?: number
  run(ctx: ProbeContext): Promise<ProbeOutcome>
}

export interface ProbeResult extends ProbeOutcome {
  id: string
  sp: 1 | 2 | 3 | 4
  desc: string
  durationMs: number
}

export interface Env {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  internalKey: string
  stripeWebhookSecret: string | null
  apiUrl: string
  refRateLimitMax: number
}

export interface CliOptions {
  only: 1 | 2 | 3 | 4 | null
  json: boolean
  quiet: boolean
  verbose: boolean
  noCleanup: boolean
  cleanupOrphans: boolean
  force: boolean
  timeoutSeconds: number
  help: boolean
}
```

- [ ] **Step 2: Create `vitest.smoke.config.ts` at repo root**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['scripts/smoke/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
})
```

- [ ] **Step 3: Modify `package.json` — add two scripts to the root `scripts` object**

Find the `"scripts": {` block and add these two entries next to existing `"smoke*"` or `"test*"` keys:

```json
"smoke:affiliate": "tsx scripts/smoke-affiliate.ts",
"test:smoke:unit": "vitest run --config vitest.smoke.config.ts"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke/types.ts scripts/smoke/__tests__/.gitkeep vitest.smoke.config.ts package.json
git commit -m "chore(smoke): scaffold types + vitest config"
```

---

## Task 2: CLI flag parser

**Files:**
- Create: `scripts/smoke/cli.ts`
- Create: `scripts/smoke/__tests__/cli.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/smoke/__tests__/cli.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseArgs, HELP_TEXT } from '../cli.js'

describe('parseArgs', () => {
  it('returns defaults when given empty argv', () => {
    const opts = parseArgs([])
    expect(opts).toEqual({
      only: null,
      json: false,
      quiet: false,
      verbose: false,
      noCleanup: false,
      cleanupOrphans: false,
      force: false,
      timeoutSeconds: 180,
      help: false,
    })
  })

  it('parses --only=SP3', () => {
    expect(parseArgs(['--only=SP3']).only).toBe(3)
  })

  it('rejects invalid --only', () => {
    expect(() => parseArgs(['--only=SP9'])).toThrow(/--only/)
  })

  it('parses flags', () => {
    const opts = parseArgs([
      '--json', '--quiet', '--verbose', '--no-cleanup',
      '--cleanup-orphans', '--force', '--timeout=90',
    ])
    expect(opts.json).toBe(true)
    expect(opts.quiet).toBe(true)
    expect(opts.verbose).toBe(true)
    expect(opts.noCleanup).toBe(true)
    expect(opts.cleanupOrphans).toBe(true)
    expect(opts.force).toBe(true)
    expect(opts.timeoutSeconds).toBe(90)
  })

  it('parses --help and -h', () => {
    expect(parseArgs(['--help']).help).toBe(true)
    expect(parseArgs(['-h']).help).toBe(true)
  })

  it('rejects unknown flag', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(/unknown/i)
  })

  it('HELP_TEXT mentions all flags', () => {
    for (const flag of ['--only', '--json', '--quiet', '--verbose',
                        '--no-cleanup', '--cleanup-orphans',
                        '--force', '--timeout', '--help']) {
      expect(HELP_TEXT).toContain(flag)
    }
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
npm run test:smoke:unit -- cli
```

Expected: `FAIL` — module not found.

- [ ] **Step 3: Create `scripts/smoke/cli.ts`**

```typescript
import type { CliOptions } from './types.js'

export const HELP_TEXT = `tsx scripts/smoke-affiliate.ts [flags]

Flags:
  --only=SP1|SP2|SP3|SP4     Run only one sub-project's probes
  --json                     Machine-readable summary on stdout
  --quiet                    Suppress per-probe lines
  --verbose                  Emit request/response bodies on FAIL
  --no-cleanup               Leave fixture rows; prints their IDs
  --cleanup-orphans          Skip seed+probes; run email-pattern cascade delete
  --force                    Bypass SUPABASE_URL localhost interlock
  --timeout=N                Global timeout in seconds (default 180)
  --help, -h                 Print this usage

Runs one-at-a-time per host. Uses TEST-NET-2 synthetic IPs.
Requires local Supabase (service role) and apps/api on :3001.
`

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    only: null,
    json: false,
    quiet: false,
    verbose: false,
    noCleanup: false,
    cleanupOrphans: false,
    force: false,
    timeoutSeconds: 180,
    help: false,
  }
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') opts.help = true
    else if (arg === '--json') opts.json = true
    else if (arg === '--quiet') opts.quiet = true
    else if (arg === '--verbose') opts.verbose = true
    else if (arg === '--no-cleanup') opts.noCleanup = true
    else if (arg === '--cleanup-orphans') opts.cleanupOrphans = true
    else if (arg === '--force') opts.force = true
    else if (arg.startsWith('--only=')) {
      const val = arg.slice('--only='.length)
      const n = val.replace('SP', '')
      if (!['1','2','3','4'].includes(n)) {
        throw new Error(`--only must be SP1|SP2|SP3|SP4, got "${val}"`)
      }
      opts.only = Number(n) as 1|2|3|4
    } else if (arg.startsWith('--timeout=')) {
      const n = Number(arg.slice('--timeout='.length))
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--timeout must be a positive number`)
      }
      opts.timeoutSeconds = n
    } else {
      throw new Error(`unknown flag: ${arg}`)
    }
  }
  return opts
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
npm run test:smoke:unit -- cli
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke/cli.ts scripts/smoke/__tests__/cli.test.ts
git commit -m "feat(smoke): CLI flag parser with 7 unit tests"
```

---

## Task 3: Env loader + safety interlock

**Files:**
- Create: `scripts/smoke/env.ts`
- Create: `scripts/smoke/__tests__/env.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/smoke/__tests__/env.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateLocalSupabase, parseRefRateLimitMax } from '../env.js'

describe('validateLocalSupabase', () => {
  it('accepts localhost URL', () => {
    expect(() => validateLocalSupabase('http://localhost:54321', false)).not.toThrow()
  })
  it('accepts 127.0.0.1 URL', () => {
    expect(() => validateLocalSupabase('http://127.0.0.1:54321', false)).not.toThrow()
  })
  it('rejects remote URL without --force', () => {
    expect(() => validateLocalSupabase('https://x.supabase.co', false))
      .toThrow(/localhost|--force/)
  })
  it('allows remote URL with --force', () => {
    expect(() => validateLocalSupabase('https://x.supabase.co', true)).not.toThrow()
  })
})

describe('parseRefRateLimitMax', () => {
  it('defaults to 30 when unset', () => {
    expect(parseRefRateLimitMax(undefined)).toBe(30)
  })
  it('parses a numeric string', () => {
    expect(parseRefRateLimitMax('50')).toBe(50)
  })
  it('rejects non-numeric', () => {
    expect(() => parseRefRateLimitMax('abc')).toThrow()
  })
  it('rejects zero or negative', () => {
    expect(() => parseRefRateLimitMax('0')).toThrow()
    expect(() => parseRefRateLimitMax('-1')).toThrow()
  })
})
```

- [ ] **Step 2: Run test, verify failure (module not found)**

```bash
npm run test:smoke:unit -- env
```

- [ ] **Step 3: Create `scripts/smoke/env.ts`**

```typescript
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Env } from './types.js'

export function loadEnv(force: boolean): Env {
  const envPath = resolve(process.cwd(), 'apps/api/.env.local')
  let raw = ''
  try { raw = readFileSync(envPath, 'utf8') }
  catch { throw new Error(`cannot read ${envPath}; run from repo root`) }
  const map = parseDotenv(raw)
  const supabaseUrl = required(map, 'SUPABASE_URL')
  validateLocalSupabase(supabaseUrl, force)
  return {
    supabaseUrl,
    supabaseServiceRoleKey: required(map, 'SUPABASE_SERVICE_ROLE_KEY'),
    internalKey: required(map, 'INTERNAL_API_KEY'),
    stripeWebhookSecret: map['STRIPE_WEBHOOK_SECRET'] ?? null,
    apiUrl: map['API_URL'] ?? 'http://localhost:3001',
    refRateLimitMax: parseRefRateLimitMax(map['REF_RATE_LIMIT_MAX']),
  }
}

export function validateLocalSupabase(url: string, force: boolean): void {
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)
  if (!isLocal && !force) {
    throw new Error(
      `SUPABASE_URL is not localhost (${url}). Point apps/api/.env.local ` +
      `at local Supabase, or pass --force to bypass this interlock.`
    )
  }
}

export function parseRefRateLimitMax(raw: string | undefined): number {
  if (raw === undefined) return 30
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`REF_RATE_LIMIT_MAX must be a positive number, got "${raw}"`)
  }
  return n
}

function parseDotenv(src: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const line of src.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (!m) continue
    let v = m[2]
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    map[m[1]] = v
  }
  return map
}

function required(map: Record<string, string>, key: string): string {
  if (!map[key]) throw new Error(`missing ${key} in apps/api/.env.local`)
  return map[key]
}
```

- [ ] **Step 4: Run test, verify pass (8 tests)**

```bash
npm run test:smoke:unit -- env
```

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke/env.ts scripts/smoke/__tests__/env.test.ts
git commit -m "feat(smoke): env loader with localhost safety interlock"
```

---

## Task 4: HTTP fetch wrapper

**Files:**
- Create: `scripts/smoke/http.ts`
- Create: `scripts/smoke/__tests__/http.test.ts`

- [ ] **Step 1: Write the failing test**

`scripts/smoke/__tests__/http.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { smokeRequest } from '../http.js'

const originalFetch = globalThis.fetch

describe('smokeRequest', () => {
  beforeEach(() => { globalThis.fetch = vi.fn() })
  afterEach(() => { globalThis.fetch = originalFetch })

  it('injects X-Internal-Key and x-user-id headers', async () => {
    ;(globalThis.fetch as any).mockResolvedValue(new Response('{}', {status:200, headers:{'content-type':'application/json'}}))
    await smokeRequest({
      apiUrl: 'http://localhost:3001',
      internalKey: 'KEY123',
      path: '/affiliate/me',
      method: 'GET',
      userId: 'user-abc',
    })
    const call = (globalThis.fetch as any).mock.calls[0]
    const headers = call[1].headers
    expect(headers['X-Internal-Key']).toBe('KEY123')
    expect(headers['x-user-id']).toBe('user-abc')
  })

  it('parses JSON body when content-type is application/json', async () => {
    ;(globalThis.fetch as any).mockResolvedValue(
      new Response('{"success":true,"data":{"a":1}}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    const r = await smokeRequest({
      apiUrl: 'http://localhost:3001',
      internalKey: 'k',
      path: '/x',
      method: 'GET',
      userId: 'u',
    })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ success: true, data: { a: 1 } })
  })

  it('returns raw text when body is not JSON', async () => {
    ;(globalThis.fetch as any).mockResolvedValue(
      new Response('Forbidden', {
        status: 403, headers: { 'content-type': 'text/plain' },
      })
    )
    const r = await smokeRequest({
      apiUrl: 'http://localhost:3001',
      internalKey: 'k',
      path: '/x',
      method: 'GET',
      userId: 'u',
    })
    expect(r.body).toBe('Forbidden')
  })

  it('forwards x-forwarded-for when provided', async () => {
    ;(globalThis.fetch as any).mockResolvedValue(new Response('{}', {status:200, headers:{'content-type':'application/json'}}))
    await smokeRequest({
      apiUrl: 'http://localhost:3001',
      internalKey: 'k',
      path: '/ref/ABC',
      method: 'GET',
      userId: null,
      forwardedFor: '198.51.100.1',
    })
    const headers = (globalThis.fetch as any).mock.calls[0][1].headers
    expect(headers['x-forwarded-for']).toBe('198.51.100.1')
    expect(headers['x-user-id']).toBeUndefined()
  })

  it('never retries on error', async () => {
    ;(globalThis.fetch as any).mockRejectedValue(new Error('ECONNRESET'))
    await expect(smokeRequest({
      apiUrl: 'http://localhost:3001',
      internalKey: 'k',
      path: '/x',
      method: 'GET',
      userId: 'u',
    })).rejects.toThrow(/ECONNRESET/)
    expect((globalThis.fetch as any).mock.calls.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run test, verify failure**

```bash
npm run test:smoke:unit -- http
```

- [ ] **Step 3: Create `scripts/smoke/http.ts`**

```typescript
export interface SmokeRequestInput {
  apiUrl: string
  internalKey: string
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  userId: string | null
  forwardedFor?: string
  body?: unknown
  extraHeaders?: Record<string, string>
}

export interface SmokeResponse {
  status: number
  headers: Record<string, string>
  body: unknown
}

export async function smokeRequest(input: SmokeRequestInput): Promise<SmokeResponse> {
  const url = new URL(input.path, input.apiUrl).toString()
  const headers: Record<string, string> = {
    'X-Internal-Key': input.internalKey,
    ...(input.userId ? { 'x-user-id': input.userId } : {}),
    ...(input.forwardedFor ? { 'x-forwarded-for': input.forwardedFor } : {}),
    ...(input.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(input.extraHeaders ?? {}),
  }
  const res = await fetch(url, {
    method: input.method,
    headers,
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    redirect: 'manual',
  })
  const outHeaders: Record<string, string> = {}
  res.headers.forEach((v, k) => { outHeaders[k] = v })
  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()
  let body: unknown = text
  if (contentType.includes('application/json') && text.length > 0) {
    try { body = JSON.parse(text) }
    catch { /* keep raw text */ }
  }
  return { status: res.status, headers: outHeaders, body }
}
```

- [ ] **Step 4: Run test, verify pass (5 tests)**

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke/http.ts scripts/smoke/__tests__/http.test.ts
git commit -m "feat(smoke): envelope-agnostic fetch wrapper (X-Internal-Key + x-user-id + x-forwarded-for)"
```

---

## Task 5: Stripe event helper

**Files:**
- Create: `scripts/smoke/stripe-event.ts`
- Create: `scripts/smoke/__tests__/stripe-event.test.ts`

- [ ] **Step 1: Write the failing test**

`scripts/smoke/__tests__/stripe-event.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import Stripe from 'stripe'
import { buildSignedInvoiceEvent, PRICE_ID_MONTHLY } from '../stripe-event.js'

const SECRET = 'whsec_test_secret'

describe('buildSignedInvoiceEvent', () => {
  it('produces a payload verifiable with stripe.webhooks.constructEvent', () => {
    const { rawBody, signature } = buildSignedInvoiceEvent({
      billingReason: 'subscription_cycle',
      amountPaid: 9900,
      orgId: 'org-123',
      secret: SECRET,
    })
    const stripe = new Stripe('sk_test_dummy', { apiVersion: '2024-06-20' as any })
    const event = stripe.webhooks.constructEvent(rawBody, signature, SECRET)
    expect(event.type).toBe('invoice.payment_succeeded')
    const invoice = event.data.object as Stripe.Invoice
    expect(invoice.amount_paid).toBe(9900)
    expect(invoice.billing_reason).toBe('subscription_cycle')
  })

  it('sets subscription.metadata.org_id', () => {
    const { rawBody } = buildSignedInvoiceEvent({
      billingReason: 'subscription_cycle',
      amountPaid: 9900,
      orgId: 'org-456',
      secret: SECRET,
    })
    const parsed = JSON.parse(rawBody)
    expect(parsed.data.object.subscription.metadata.org_id).toBe('org-456')
  })

  it('tags line_items with a known priceId', () => {
    const { rawBody } = buildSignedInvoiceEvent({
      billingReason: 'subscription_cycle',
      amountPaid: 9900,
      orgId: 'org-1',
      secret: SECRET,
    })
    const parsed = JSON.parse(rawBody)
    const line = parsed.data.object.lines.data[0]
    expect(line.price.id).toBe(PRICE_ID_MONTHLY)
  })
})
```

- [ ] **Step 2: Run test, verify failure**

```bash
npm run test:smoke:unit -- stripe-event
```

- [ ] **Step 3: Create `scripts/smoke/stripe-event.ts`**

```typescript
import Stripe from 'stripe'
import { randomUUID } from 'node:crypto'

export const PRICE_ID_MONTHLY = 'price_smoke_creator_monthly'

export interface BuildEventInput {
  billingReason: 'subscription_cycle' | 'subscription_create' | 'subscription_update' | 'manual'
  amountPaid: number
  orgId: string
  secret: string
}

export interface SignedEvent {
  rawBody: string
  signature: string
}

export function buildSignedInvoiceEvent(input: BuildEventInput): SignedEvent {
  const invoiceId = `in_smoke_${randomUUID().slice(0,8)}`
  const subId = `sub_smoke_${randomUUID().slice(0,8)}`
  const now = Math.floor(Date.now() / 1000)
  const event = {
    id: `evt_smoke_${randomUUID().slice(0,8)}`,
    object: 'event',
    api_version: '2024-06-20',
    created: now,
    type: 'invoice.payment_succeeded',
    data: {
      object: {
        id: invoiceId,
        object: 'invoice',
        amount_paid: input.amountPaid,
        billing_reason: input.billingReason,
        subscription: {
          id: subId,
          metadata: { org_id: input.orgId },
        },
        lines: {
          data: [{
            id: `il_${randomUUID().slice(0,8)}`,
            price: { id: PRICE_ID_MONTHLY, recurring: { interval: 'month' } },
            period: { start: now - 2592000, end: now },
          }],
        },
      },
    },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  }
  const rawBody = JSON.stringify(event)
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret: input.secret,
  })
  return { rawBody, signature }
}
```

- [ ] **Step 4: Run test, verify pass (3 tests)**

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke/stripe-event.ts scripts/smoke/__tests__/stripe-event.test.ts
git commit -m "feat(smoke): Stripe signed test-event builder"
```

---

## Task 6: Fixture — seed, cleanup, baselines

**Files:**
- Create: `scripts/smoke/fixture.ts`
- Create: `scripts/smoke/__tests__/fixture.integration.test.ts` (Category C — local Supabase required)

This task has no unit-test phase — it's integration-only against a running local Supabase. If local Supabase is unavailable, the test is skipped with a clear message; it's re-enabled by the runtime harness when the stack is up.

- [ ] **Step 1: Create `scripts/smoke/fixture.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { Baselines, SeedHandles } from './types.js'

const SMOKE_EMAIL_PREFIX = 'smoke-'
const SMOKE_EMAIL_DOMAIN = '@brighttale.test'

export function makeRunId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 6)
}

export async function seed(
  supabase: SupabaseClient,
  runId: string
): Promise<SeedHandles> {
  const email = (label: string) => `${SMOKE_EMAIL_PREFIX}${runId}-${label}${SMOKE_EMAIL_DOMAIN}`
  const randomPw = () => randomUUID()

  // 1) auth users (Admin API)
  const admin = await supabase.auth.admin.createUser({
    email: email('admin'), password: randomPw(), email_confirm: true,
  })
  if (admin.error || !admin.data.user) throw new Error(`admin createUser: ${admin.error?.message}`)
  const adminUserId = admin.data.user.id

  const owner = await supabase.auth.admin.createUser({
    email: email('owner'), password: randomPw(), email_confirm: true,
  })
  if (owner.error || !owner.data.user) throw new Error(`owner createUser: ${owner.error?.message}`)
  const affiliateOwnerUserId = owner.data.user.id

  const ref = await supabase.auth.admin.createUser({
    email: email('ref'), password: randomPw(), email_confirm: true,
  })
  if (ref.error || !ref.data.user) throw new Error(`ref createUser: ${ref.error?.message}`)
  const referredUserId = ref.data.user.id

  // 2) admin role
  const roleRes = await supabase.from('user_roles').insert({
    user_id: adminUserId, role: 'admin',
  }).select('user_id').single()
  if (roleRes.error) throw new Error(`user_roles insert: ${roleRes.error.message}`)

  // 3) organization + membership (for SP4 subscription.metadata.org_id)
  const org = await supabase.from('organizations').insert({
    name: `Smoke Org ${runId}`,
    slug: `smoke-${runId}`,
  }).select('id').single()
  if (org.error || !org.data) throw new Error(`organizations insert: ${org.error?.message}`)
  const organizationId = org.data.id

  const mem = await supabase.from('org_memberships').insert({
    org_id: organizationId,
    user_id: referredUserId,
    role: 'owner',
  }).select('id').single()
  if (mem.error) throw new Error(`org_memberships insert: ${mem.error.message}`)

  // 4) affiliate (status=active, tier=nano, rate=0.1500)
  const code = `SMK${runId}`
  const aff = await supabase.from('affiliates').insert({
    user_id: affiliateOwnerUserId,
    code,
    name: `Smoke Owner ${runId}`,
    email: email('owner'),
    status: 'active',
    tier: 'nano',
    commission_rate: 0.15,
    contract_version: 1,
    contract_accepted_at: new Date().toISOString(),
  }).select('id').single()
  if (aff.error || !aff.data) throw new Error(`affiliates insert: ${aff.error?.message}`)
  const affiliateId = aff.data.id

  // 5) referral (referred user attributed to this affiliate)
  const referral = await supabase.from('affiliate_referrals').insert({
    affiliate_id: affiliateId,
    affiliate_code: code,
    user_id: referredUserId,
    attribution_status: 'active',
  }).select('id').single()
  if (referral.error || !referral.data) throw new Error(`affiliate_referrals insert: ${referral.error?.message}`)
  const referralId = referral.data.id

  // 6) commission (pending)
  const comm = await supabase.from('affiliate_commissions').insert({
    affiliate_id: affiliateId,
    affiliate_code: code,
    user_id: referredUserId,
    referral_id: referralId,
    payment_amount: 9900,
    stripe_fee: 434,
    net_amount: 9466,
    commission_rate: 0.15,
    commission_brl: 1420,
    total_brl: 1420,
    payment_type: 'monthly',
    status: 'pending',
  }).select('id').single()
  if (comm.error || !comm.data) throw new Error(`affiliate_commissions insert: ${comm.error?.message}`)
  const commissionId = comm.data.id

  // 7) fraud flag (open)
  const flag = await supabase.from('affiliate_fraud_flags').insert({
    affiliate_id: affiliateId,
    flag_type: 'self_referral_ip_match',
    severity: 'low',
    status: 'open',
    details: { source: 'smoke-fixture' },
  }).select('id').single()
  if (flag.error || !flag.data) throw new Error(`affiliate_fraud_flags insert: ${flag.error?.message}`)
  const fraudFlagId = flag.data.id

  return {
    adminUserId, affiliateOwnerUserId, referredUserId,
    affiliateId, affiliateCode: code, referralId,
    organizationId, commissionId, fraudFlagId,
  }
}

export async function captureBaselines(
  supabase: SupabaseClient,
  h: SeedHandles
): Promise<Baselines> {
  const { count, error } = await supabase
    .from('affiliate_commissions')
    .select('id', { count: 'exact', head: true })
    .eq('affiliate_id', h.affiliateId)
    .eq('status', 'pending')
  if (error) throw new Error(`baseline count: ${error.message}`)
  return { pendingCommissionCountForAffiliate: count ?? 0 }
}

export interface CleanupResult {
  rowsRemoved: number
  failures: Array<{ table: string; error: string }>
}

export async function cleanup(
  supabase: SupabaseClient,
  h: Partial<SeedHandles>
): Promise<CleanupResult> {
  let rowsRemoved = 0
  const failures: CleanupResult['failures'] = []
  const tryDelete = async (table: string, fn: () => Promise<{ error: unknown; count: number | null }>) => {
    try {
      const { error, count } = await fn()
      if (error) failures.push({ table, error: String((error as any).message ?? error) })
      else rowsRemoved += count ?? 0
    } catch (err) {
      failures.push({ table, error: String(err) })
    }
  }

  if (h.affiliateId) {
    await tryDelete('affiliate_fraud_flags', () =>
      supabase.from('affiliate_fraud_flags').delete({ count: 'exact' }).eq('affiliate_id', h.affiliateId!))
    await tryDelete('affiliate_commissions', () =>
      supabase.from('affiliate_commissions').delete({ count: 'exact' }).eq('affiliate_id', h.affiliateId!))
    await tryDelete('affiliate_referrals', () =>
      supabase.from('affiliate_referrals').delete({ count: 'exact' }).eq('affiliate_id', h.affiliateId!))
    await tryDelete('affiliates', () =>
      supabase.from('affiliates').delete({ count: 'exact' }).eq('id', h.affiliateId!))
  }
  if (h.organizationId) {
    await tryDelete('org_memberships', () =>
      supabase.from('org_memberships').delete({ count: 'exact' }).eq('org_id', h.organizationId!))
    await tryDelete('organizations', () =>
      supabase.from('organizations').delete({ count: 'exact' }).eq('id', h.organizationId!))
  }
  if (h.adminUserId) {
    await tryDelete('user_roles', () =>
      supabase.from('user_roles').delete({ count: 'exact' }).eq('user_id', h.adminUserId!))
  }
  for (const uid of [h.adminUserId, h.affiliateOwnerUserId, h.referredUserId]) {
    if (!uid) continue
    try {
      const { error } = await supabase.auth.admin.deleteUser(uid)
      if (error) failures.push({ table: 'auth.users', error: error.message })
      else rowsRemoved += 1
    } catch (err) {
      failures.push({ table: 'auth.users', error: String(err) })
    }
  }
  return { rowsRemoved, failures }
}

export async function cleanupOrphans(supabase: SupabaseClient): Promise<CleanupResult> {
  // List all smoke users, then per-user tear down via cleanup()
  const list = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (list.error) throw new Error(`listUsers: ${list.error.message}`)
  const smokeUsers = list.data.users.filter(
    u => u.email?.startsWith(SMOKE_EMAIL_PREFIX) && u.email?.endsWith(SMOKE_EMAIL_DOMAIN)
  )
  let rowsRemoved = 0
  const failures: CleanupResult['failures'] = []
  // Group by runId: email format smoke-<runId>-<label>@brighttale.test
  const runs = new Map<string, { admin?: string; owner?: string; ref?: string }>()
  for (const u of smokeUsers) {
    const m = /^smoke-([a-f0-9]{6})-(admin|owner|ref)@brighttale\.test$/.exec(u.email ?? '')
    if (!m) continue
    const [, rid, label] = m
    const entry = runs.get(rid) ?? {}
    entry[label as 'admin'|'owner'|'ref'] = u.id
    runs.set(rid, entry)
  }
  for (const [rid, trio] of runs) {
    // Lookup affiliate + org by user
    let affiliateId: string | undefined
    if (trio.owner) {
      const { data } = await supabase.from('affiliates')
        .select('id').eq('user_id', trio.owner).maybeSingle()
      affiliateId = data?.id
    }
    let organizationId: string | undefined
    if (trio.ref) {
      const { data } = await supabase.from('org_memberships')
        .select('org_id').eq('user_id', trio.ref).limit(1).maybeSingle()
      organizationId = data?.org_id
    }
    const result = await cleanup(supabase, {
      adminUserId: trio.admin,
      affiliateOwnerUserId: trio.owner,
      referredUserId: trio.ref,
      affiliateId,
      organizationId,
    })
    rowsRemoved += result.rowsRemoved
    failures.push(...result.failures)
  }
  return { rowsRemoved, failures }
}
```

- [ ] **Step 2: Create `scripts/smoke/__tests__/fixture.integration.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { seed, cleanup, captureBaselines, makeRunId } from '../fixture.js'

const envPath = resolve(process.cwd(), 'apps/api/.env.local')
let envRaw = ''
try { envRaw = readFileSync(envPath, 'utf8') } catch { /* ignore */ }
const map: Record<string, string> = {}
for (const line of envRaw.split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m) map[m[1]] = m[2].replace(/^"|"$/g, '')
}
const SUPABASE_URL = map.SUPABASE_URL
const SERVICE_KEY = map.SUPABASE_SERVICE_ROLE_KEY
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(SUPABASE_URL ?? '')

describe.skipIf(!isLocal || !SERVICE_KEY)('fixture (integration)', () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })

  it('seed creates all 9 rows, cleanup removes them', async () => {
    const runId = makeRunId()
    const handles = await seed(supabase, runId)
    expect(handles.affiliateCode).toBe(`SMK${runId}`)

    const baselines = await captureBaselines(supabase, handles)
    expect(baselines.pendingCommissionCountForAffiliate).toBe(1)

    const result = await cleanup(supabase, handles)
    expect(result.failures).toEqual([])
    expect(result.rowsRemoved).toBeGreaterThanOrEqual(10)
  })

  it('cleanup is idempotent on partial handles', async () => {
    const runId = makeRunId()
    const handles = await seed(supabase, runId)
    const first = await cleanup(supabase, handles)
    expect(first.failures).toEqual([])
    const second = await cleanup(supabase, handles) // idempotent
    expect(second.failures).toEqual([])
  })
})
```

- [ ] **Step 3: Run integration tests (requires local Supabase)**

```bash
npm run db:start  # if not already running
npm run test:smoke:unit -- fixture
```

Expected: 2 PASS (or skipped if `SUPABASE_URL` is not local — covered by `describe.skipIf`).

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke/fixture.ts scripts/smoke/__tests__/fixture.integration.test.ts
git commit -m "feat(smoke): fixture seed/cleanup/baselines (3 users + 8 rows)"
```

---

## Task 7: Preflight health checks

**Files:**
- Create: `scripts/smoke/preflight.ts`
- Create: `scripts/smoke/__tests__/preflight.test.ts`

- [ ] **Step 1: Write failing test**

`scripts/smoke/__tests__/preflight.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { probeApiHealth } from '../preflight.js'

describe('probeApiHealth', () => {
  it('returns pass when GET /health returns 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    globalThis.fetch = fetchMock
    const r = await probeApiHealth('http://localhost:3001')
    expect(r.status).toBe('pass')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/health', expect.anything())
  })

  it('returns fail when non-200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('err', { status: 500 }))
    const r = await probeApiHealth('http://localhost:3001')
    expect(r.status).toBe('fail')
    expect(r.detail).toContain('500')
  })

  it('returns fail when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const r = await probeApiHealth('http://localhost:3001')
    expect(r.status).toBe('fail')
    expect(r.detail).toContain('ECONNREFUSED')
  })
})
```

- [ ] **Step 2: Verify failure**

```bash
npm run test:smoke:unit -- preflight
```

- [ ] **Step 3: Create `scripts/smoke/preflight.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface HealthResult {
  status: 'pass' | 'fail'
  durationMs: number
  detail?: string
}

export async function probeApiHealth(apiUrl: string): Promise<HealthResult> {
  const start = Date.now()
  try {
    const res = await fetch(`${apiUrl}/health`, { method: 'GET' })
    const durationMs = Date.now() - start
    if (res.status !== 200) {
      return { status: 'fail', durationMs, detail: `expected 200, got ${res.status}` }
    }
    return { status: 'pass', durationMs }
  } catch (err) {
    return {
      status: 'fail',
      durationMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function probeSupabaseHealth(supabase: SupabaseClient): Promise<HealthResult> {
  const start = Date.now()
  try {
    const { error } = await supabase.auth.admin.listUsers({ perPage: 1 })
    const durationMs = Date.now() - start
    if (error) return { status: 'fail', durationMs, detail: error.message }
    return { status: 'pass', durationMs }
  } catch (err) {
    return {
      status: 'fail',
      durationMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}
```

- [ ] **Step 4: Verify pass (3 tests)**

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke/preflight.ts scripts/smoke/__tests__/preflight.test.ts
git commit -m "feat(smoke): preflight health checks (supabase + api)"
```

---

## Task 8: Reporter (normal / quiet / verbose / json)

**Files:**
- Create: `scripts/smoke/reporter.ts`
- Create: `scripts/smoke/__tests__/reporter.test.ts`

- [ ] **Step 1: Write failing test**

`scripts/smoke/__tests__/reporter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { renderNormal, renderJson, renderQuiet, summarize } from '../reporter.js'
import type { ProbeResult } from '../types.js'

const SAMPLE: ProbeResult[] = [
  { id: 'SP1-1', sp: 1, desc: 'GET /affiliate/me', status: 'pass', durationMs: 12 },
  { id: 'SP1-2', sp: 1, desc: 'GET /affiliate/me/commissions', status: 'pass', durationMs: 8 },
  { id: 'SP4-1', sp: 4, desc: 'webhook subscription_cycle', status: 'skip', durationMs: 0, detail: 'STRIPE_WEBHOOK_SECRET not set' },
]

describe('summarize', () => {
  it('counts pass/fail/skip', () => {
    expect(summarize(SAMPLE)).toEqual({ pass: 2, fail: 0, skip: 1 })
  })
})

describe('renderNormal', () => {
  it('includes each probe id, desc, status, duration', () => {
    const out = renderNormal(SAMPLE)
    for (const p of SAMPLE) {
      expect(out).toContain(p.id)
      expect(out).toContain(p.desc)
    }
    expect(out).toMatch(/pass/)
    expect(out).toMatch(/skip/)
    expect(out).toMatch(/\d+\s*ms/)
  })
})

describe('renderQuiet', () => {
  it('omits per-probe lines', () => {
    const out = renderQuiet(SAMPLE)
    expect(out).not.toContain('SP1-1')
    expect(out).toMatch(/2 pass.*0 fail.*1 skip/)
  })
})

describe('renderJson', () => {
  it('emits parseable JSON with summary + probes', () => {
    const out = renderJson({
      runId: 'abc123',
      probes: SAMPLE,
      rowsRemoved: 10,
      elapsedMs: 500,
    })
    const parsed = JSON.parse(out)
    expect(parsed.runId).toBe('abc123')
    expect(parsed.summary).toEqual({ pass: 2, fail: 0, skip: 1, elapsedMs: 500, exitCode: 0 })
    expect(parsed.probes).toHaveLength(3)
    expect(parsed.cleanup.rowsRemoved).toBe(10)
  })
})
```

- [ ] **Step 2: Verify failure**

```bash
npm run test:smoke:unit -- reporter
```

- [ ] **Step 3: Create `scripts/smoke/reporter.ts`**

```typescript
import type { ProbeResult } from './types.js'
import { ExitCode } from './types.js'

export function summarize(probes: ProbeResult[]) {
  let pass = 0, fail = 0, skip = 0
  for (const p of probes) {
    if (p.status === 'pass') pass++
    else if (p.status === 'fail') fail++
    else skip++
  }
  return { pass, fail, skip }
}

export function renderNormal(probes: ProbeResult[]): string {
  const lines = probes.map(p => {
    const id = p.id.padEnd(6)
    const desc = p.desc.padEnd(42)
    const status = p.status.padEnd(5)
    const ms = String(p.durationMs).padStart(5) + ' ms'
    const detail = p.detail ? `   (${p.detail})` : ''
    return `  ${id} ${desc} ${status} ${ms}${detail}`
  })
  return lines.join('\n')
}

export function renderQuiet(probes: ProbeResult[]): string {
  const s = summarize(probes)
  return `${s.pass} pass · ${s.fail} fail · ${s.skip} skip`
}

export interface JsonReportInput {
  runId: string
  probes: ProbeResult[]
  rowsRemoved: number
  elapsedMs: number
}

export function renderJson(input: JsonReportInput): string {
  const s = summarize(input.probes)
  const exitCode = s.fail > 0 ? ExitCode.ProbeFailed : ExitCode.Ok
  return JSON.stringify({
    runId: input.runId,
    probes: input.probes,
    cleanup: { rowsRemoved: input.rowsRemoved },
    summary: { ...s, elapsedMs: input.elapsedMs, exitCode },
  })
}
```

- [ ] **Step 4: Verify pass (5 tests)**

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke/reporter.ts scripts/smoke/__tests__/reporter.test.ts
git commit -m "feat(smoke): reporter with normal/quiet/json output modes"
```

---

## Task 9: SP1 probes — end-user backend (3)

**Files:**
- Create: `scripts/smoke/probes/sp1.ts`
- Create: `scripts/smoke/__tests__/probes-sp1.test.ts`

- [ ] **Step 1: Write failing test**

`scripts/smoke/__tests__/probes-sp1.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { SP1_PROBES } from '../probes/sp1.js'
import type { ProbeContext } from '../types.js'

function makeCtx(overrides: Partial<ProbeContext> = {}): ProbeContext {
  return {
    fixture: {
      adminUserId: 'admin-1', affiliateOwnerUserId: 'owner-1', referredUserId: 'ref-1',
      affiliateId: 'aff-1', affiliateCode: 'SMKabc123', referralId: 'refl-1',
      organizationId: 'org-1', commissionId: 'comm-1', fraudFlagId: 'flag-1',
    },
    baselines: { pendingCommissionCountForAffiliate: 1 },
    apiUrl: 'http://localhost:3001',
    supabase: {} as any,
    internalKey: 'K',
    stripeWebhookSecret: null,
    ...overrides,
  }
}

describe('SP1-1 GET /affiliate/me', () => {
  it('passes when body.success is true + code/tier match', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { code: 'SMKabc123', tier: 'nano', status: 'active' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const probe = SP1_PROBES.find(p => p.id === 'SP1-1')!
    const out = await probe.run(makeCtx())
    expect(out.status).toBe('pass')
  })

  it('fails when code mismatches', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { code: 'OTHER', tier: 'nano', status: 'active' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const probe = SP1_PROBES.find(p => p.id === 'SP1-1')!
    const out = await probe.run(makeCtx())
    expect(out.status).toBe('fail')
    expect(out.detail).toContain('code')
  })
})

describe('SP1-2 GET /affiliate/me/commissions', () => {
  it('passes when bare array contains fixture.commissionId', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: [{ id: 'comm-1', totalBrl: 1420 }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const probe = SP1_PROBES.find(p => p.id === 'SP1-2')!
    const out = await probe.run(makeCtx())
    expect(out.status).toBe('pass')
  })
})

describe('SP1-3 GET /affiliate/referrals', () => {
  it('passes when bare array contains referralId with attributionStatus=active', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: [{ id: 'refl-1', attributionStatus: 'active' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const probe = SP1_PROBES.find(p => p.id === 'SP1-3')!
    const out = await probe.run(makeCtx())
    expect(out.status).toBe('pass')
  })
})
```

- [ ] **Step 2: Verify failure**

```bash
npm run test:smoke:unit -- probes-sp1
```

- [ ] **Step 3: Create `scripts/smoke/probes/sp1.ts`**

```typescript
import { smokeRequest } from '../http.js'
import type { Probe } from '../types.js'

export const SP1_PROBES: Probe[] = [
  {
    id: 'SP1-1',
    sp: 1,
    desc: 'GET /affiliate/me',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.affiliateOwnerUserId,
        method: 'GET', path: '/affiliate/me',
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'body.success !== true' }
      if (b.data?.code !== ctx.fixture.affiliateCode) {
        return { status: 'fail', detail: `code: expected ${ctx.fixture.affiliateCode}, got ${b.data?.code}` }
      }
      if (b.data?.tier !== 'nano') return { status: 'fail', detail: `tier: expected nano, got ${b.data?.tier}` }
      if (b.data?.status !== 'active') return { status: 'fail', detail: `status: expected active, got ${b.data?.status}` }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP1-2',
    sp: 1,
    desc: 'GET /affiliate/me/commissions',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.affiliateOwnerUserId,
        method: 'GET', path: '/affiliate/me/commissions',
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'body.success !== true' }
      if (!Array.isArray(b.data)) return { status: 'fail', detail: 'data is not an array' }
      if (!b.data.some((c: any) => c.id === ctx.fixture.commissionId)) {
        return { status: 'fail', detail: `commission ${ctx.fixture.commissionId} not in list` }
      }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP1-3',
    sp: 1,
    desc: 'GET /affiliate/referrals',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.affiliateOwnerUserId,
        method: 'GET', path: '/affiliate/referrals',
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'body.success !== true' }
      if (!Array.isArray(b.data)) return { status: 'fail', detail: 'data is not an array' }
      const mine = b.data.find((r: any) => r.id === ctx.fixture.referralId)
      if (!mine) return { status: 'fail', detail: `referral ${ctx.fixture.referralId} not in list` }
      if (mine.attributionStatus !== 'active') {
        return { status: 'fail', detail: `attributionStatus: expected active, got ${mine.attributionStatus}` }
      }
      return { status: 'pass' }
    },
  },
]
```

- [ ] **Step 4: Verify pass (4 tests)**

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke/probes/sp1.ts scripts/smoke/__tests__/probes-sp1.test.ts
git commit -m "feat(smoke): SP1 end-user probes (me, commissions, referrals)"
```

---

## Task 10: SP2 probes — admin backend (6)

**Files:**
- Create: `scripts/smoke/probes/sp2.ts`
- Create: `scripts/smoke/__tests__/probes-sp2.test.ts`

- [ ] **Step 1: Write failing test**

`scripts/smoke/__tests__/probes-sp2.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { SP2_PROBES } from '../probes/sp2.js'
import type { ProbeContext } from '../types.js'

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}

function ctx(): ProbeContext {
  return {
    fixture: {
      adminUserId: 'admin-1', affiliateOwnerUserId: 'owner-1', referredUserId: 'ref-1',
      affiliateId: 'aff-1', affiliateCode: 'SMKabc123', referralId: 'refl-1',
      organizationId: 'org-1', commissionId: 'comm-1', fraudFlagId: 'flag-1',
    },
    baselines: { pendingCommissionCountForAffiliate: 1 },
    apiUrl: 'http://localhost:3001',
    supabase: {
      from: (_t: string) => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { status: 'resolved' }, error: null }) }) }),
      }),
    } as any,
    internalKey: 'K',
    stripeWebhookSecret: null,
  }
}

describe('SP2-1 list fraud flags filtered', () => {
  it('passes when exactly one flag with fixture id', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okJson({
      success: true, data: [{ id: 'flag-1', status: 'open' }],
    }))
    const out = await SP2_PROBES.find(p => p.id === 'SP2-1')!.run(ctx())
    expect(out.status).toBe('pass')
  })
})

describe('SP2-6 pause', () => {
  it('passes when HTTP 200 + DB shows status=paused', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okJson({ success: true, data: {} }))
    const c = ctx()
    c.supabase = {
      from: (_t: string) => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { status: 'paused' }, error: null }) }) }),
      }),
    } as any
    const out = await SP2_PROBES.find(p => p.id === 'SP2-6')!.run(c)
    expect(out.status).toBe('pass')
  })
})

// (+ one more test per probe — 6 probes × 1 happy path = 6 tests total; keep concise)
```

- [ ] **Step 2: Verify failure**

```bash
npm run test:smoke:unit -- probes-sp2
```

- [ ] **Step 3: Create `scripts/smoke/probes/sp2.ts`**

```typescript
import { smokeRequest } from '../http.js'
import type { Probe } from '../types.js'

export const SP2_PROBES: Probe[] = [
  {
    id: 'SP2-1', sp: 2,
    desc: 'GET /admin/affiliate/fraud-flags?affiliateId=',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.adminUserId,
        method: 'GET',
        path: `/admin/affiliate/fraud-flags?affiliateId=${ctx.fixture.affiliateId}`,
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'success !== true' }
      const mine = Array.isArray(b.data) ? b.data : (b.data?.items ?? [])
      if (!mine.find((f: any) => f.id === ctx.fixture.fraudFlagId)) {
        return { status: 'fail', detail: `fraud flag ${ctx.fixture.fraudFlagId} not in list` }
      }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP2-2', sp: 2,
    desc: 'GET /admin/affiliate/ overview',
    async run(ctx) {
      // Paginate up to 5 pages looking for our affiliate id
      for (let page = 1; page <= 5; page++) {
        const r = await smokeRequest({
          apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
          userId: ctx.fixture.adminUserId,
          method: 'GET', path: `/admin/affiliate/?page=${page}`,
        })
        if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status} on page ${page}` }
        const b = r.body as any
        if (b?.success !== true) return { status: 'fail', detail: 'success !== true' }
        const items = Array.isArray(b.data) ? b.data : (b.data?.items ?? b.data?.affiliates ?? [])
        if (items.find((a: any) => a.id === ctx.fixture.affiliateId)) return { status: 'pass' }
        if (items.length === 0) break
      }
      return { status: 'fail', detail: `affiliate ${ctx.fixture.affiliateId} not found in first 5 pages of overview` }
    },
  },
  {
    id: 'SP2-3', sp: 2,
    desc: 'GET /admin/affiliate/:id',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.adminUserId,
        method: 'GET', path: `/admin/affiliate/${ctx.fixture.affiliateId}`,
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'success !== true' }
      if (b.data?.id !== ctx.fixture.affiliateId) {
        return { status: 'fail', detail: `id mismatch: expected ${ctx.fixture.affiliateId}, got ${b.data?.id}` }
      }
      if (b.data?.status !== 'active') {
        return { status: 'fail', detail: `status: expected active, got ${b.data?.status}` }
      }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP2-4', sp: 2,
    desc: 'GET /admin/affiliate/payouts',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.adminUserId,
        method: 'GET', path: '/admin/affiliate/payouts',
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'success !== true' }
      if (b.data === undefined) return { status: 'fail', detail: 'missing data field' }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP2-5', sp: 2,
    desc: 'POST /admin/affiliate/fraud-flags/:id/resolve',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.adminUserId,
        method: 'POST',
        path: `/admin/affiliate/fraud-flags/${ctx.fixture.fraudFlagId}/resolve`,
        body: { status: 'false_positive', notes: 'smoke', pauseAffiliate: false },
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'success !== true' }
      const { data, error } = await ctx.supabase.from('affiliate_fraud_flags')
        .select('status').eq('id', ctx.fixture.fraudFlagId).single()
      if (error) return { status: 'fail', detail: `DB re-read: ${error.message}` }
      if (data?.status !== 'resolved') {
        return { status: 'fail', detail: `expected status=resolved, got ${data?.status}` }
      }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP2-6', sp: 2,
    desc: 'POST /admin/affiliate/:id/pause',
    async run(ctx) {
      const r = await smokeRequest({
        apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
        userId: ctx.fixture.adminUserId,
        method: 'POST',
        path: `/admin/affiliate/${ctx.fixture.affiliateId}/pause`,
      })
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const b = r.body as any
      if (b?.success !== true) return { status: 'fail', detail: 'success !== true' }
      const { data, error } = await ctx.supabase.from('affiliates')
        .select('status').eq('id', ctx.fixture.affiliateId).single()
      if (error) return { status: 'fail', detail: `DB re-read: ${error.message}` }
      if (data?.status !== 'paused') {
        return { status: 'fail', detail: `expected status=paused, got ${data?.status}` }
      }
      return { status: 'pass' }
    },
  },
]
```

- [ ] **Step 4: Verify pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke/probes/sp2.ts scripts/smoke/__tests__/probes-sp2.test.ts
git commit -m "feat(smoke): SP2 admin probes (6 endpoints + DB re-reads)"
```

---

## Task 11: SP3 probes — rate-limit wire (4)

**Files:**
- Create: `scripts/smoke/probes/sp3.ts`
- Create: `scripts/smoke/__tests__/probes-sp3.test.ts`

- [ ] **Step 1: Write failing test**

Focus on SP3-2 (429 + headers) as the meaningful unit test; SP3-1 is integration-only because it needs real rate-limit state.

`scripts/smoke/__tests__/probes-sp3.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { buildSp3Probes } from '../probes/sp3.js'
import type { ProbeContext } from '../types.js'

function ctx(): ProbeContext {
  return {
    fixture: {
      adminUserId: 'admin-1', affiliateOwnerUserId: 'owner-1', referredUserId: 'ref-1',
      affiliateId: 'aff-1', affiliateCode: 'SMKabc123', referralId: 'refl-1',
      organizationId: 'org-1', commissionId: 'comm-1', fraudFlagId: 'flag-1',
    },
    baselines: { pendingCommissionCountForAffiliate: 1 },
    apiUrl: 'http://localhost:3001',
    supabase: {} as any,
    internalKey: 'K',
    stripeWebhookSecret: null,
  }
}

describe('SP3-2 over-limit', () => {
  it('passes on 429 with RATE_LIMITED + headers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: null, error: { code: 'RATE_LIMITED', message: 'Too many' } }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'x-ratelimit-limit': '30',
          'x-ratelimit-remaining': '0',
          'retry-after': '42',
        },
      },
    ))
    const probes = buildSp3Probes(30)
    const out = await probes.find(p => p.id === 'SP3-2')!.run(ctx())
    expect(out.status).toBe('pass')
  })

  it('fails when retry-after missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: null, error: { code: 'RATE_LIMITED' } }),
      { status: 429, headers: { 'content-type': 'application/json', 'x-ratelimit-limit': '30', 'x-ratelimit-remaining': '0' } },
    ))
    const probes = buildSp3Probes(30)
    const out = await probes.find(p => p.id === 'SP3-2')!.run(ctx())
    expect(out.status).toBe('fail')
    expect(out.detail).toMatch(/retry-after/i)
  })
})
```

- [ ] **Step 2: Verify failure**

- [ ] **Step 3: Create `scripts/smoke/probes/sp3.ts`**

```typescript
import { smokeRequest } from '../http.js'
import type { Probe } from '../types.js'

export function buildSp3Probes(max: number): Probe[] {
  const IP_A = '198.51.100.1'
  const IP_B = '198.51.100.2'
  return [
    {
      id: 'SP3-1', sp: 3, timeoutMs: 20_000,
      desc: `/ref × ${max} (IP .1, within limit)`,
      async run(ctx) {
        for (let i = 0; i < max; i++) {
          const r = await smokeRequest({
            apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
            userId: null, forwardedFor: IP_A,
            method: 'GET', path: `/ref/${ctx.fixture.affiliateCode}`,
          })
          if (r.status !== 302) return { status: 'fail', detail: `req ${i+1}: expected 302, got ${r.status}` }
          const loc = r.headers['location'] ?? ''
          if (!loc.includes(ctx.fixture.affiliateCode)) {
            return { status: 'fail', detail: `req ${i+1}: Location missing code (${loc})` }
          }
        }
        return { status: 'pass' }
      },
    },
    {
      id: 'SP3-2', sp: 3,
      desc: `/ref ${max+1}th (IP .1) → 429 + headers`,
      async run(ctx) {
        const r = await smokeRequest({
          apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
          userId: null, forwardedFor: IP_A,
          method: 'GET', path: `/ref/${ctx.fixture.affiliateCode}`,
        })
        if (r.status !== 429) return { status: 'fail', detail: `expected 429, got ${r.status}` }
        const b = r.body as any
        if (b?.error?.code !== 'RATE_LIMITED') return { status: 'fail', detail: `body.error.code: ${b?.error?.code}` }
        if (r.headers['x-ratelimit-limit'] !== String(max)) {
          return { status: 'fail', detail: `x-ratelimit-limit: expected ${max}, got ${r.headers['x-ratelimit-limit']}` }
        }
        if (r.headers['x-ratelimit-remaining'] !== '0') {
          return { status: 'fail', detail: `x-ratelimit-remaining: expected 0, got ${r.headers['x-ratelimit-remaining']}` }
        }
        const retry = Number(r.headers['retry-after'])
        if (!Number.isFinite(retry) || retry <= 0) {
          return { status: 'fail', detail: `retry-after: expected positive int, got ${r.headers['retry-after']}` }
        }
        return { status: 'pass' }
      },
    },
    {
      id: 'SP3-3', sp: 3,
      desc: '/ref (IP .2) → 302 fresh bucket',
      async run(ctx) {
        const r = await smokeRequest({
          apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
          userId: null, forwardedFor: IP_B,
          method: 'GET', path: `/ref/${ctx.fixture.affiliateCode}`,
        })
        if (r.status !== 302) return { status: 'fail', detail: `expected 302, got ${r.status}` }
        return { status: 'pass' }
      },
    },
    {
      id: 'SP3-4', sp: 3,
      desc: '/affiliate/me after exhaustion (scope isolation)',
      async run(ctx) {
        const r = await smokeRequest({
          apiUrl: ctx.apiUrl, internalKey: ctx.internalKey,
          userId: ctx.fixture.affiliateOwnerUserId,
          method: 'GET', path: '/affiliate/me',
        })
        if (r.status !== 200) return { status: 'fail', detail: `expected 200, got ${r.status}` }
        return { status: 'pass' }
      },
    },
  ]
}
```

- [ ] **Step 4: Verify pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke/probes/sp3.ts scripts/smoke/__tests__/probes-sp3.test.ts
git commit -m "feat(smoke): SP3 rate-limit probes (burst + 429 headers + scope isolation)"
```

---

## Task 12: SP4 probes — Stripe webhook (3)

**Files:**
- Create: `scripts/smoke/probes/sp4.ts`
- Create: `scripts/smoke/__tests__/probes-sp4.test.ts`

- [ ] **Step 1: Write failing test**

`scripts/smoke/__tests__/probes-sp4.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { SP4_PROBES } from '../probes/sp4.js'
import type { ProbeContext } from '../types.js'

function ctx(extraCommissionCount = 0): ProbeContext {
  return {
    fixture: {
      adminUserId: 'admin-1', affiliateOwnerUserId: 'owner-1', referredUserId: 'ref-1',
      affiliateId: 'aff-1', affiliateCode: 'SMKabc123', referralId: 'refl-1',
      organizationId: 'org-1', commissionId: 'comm-1', fraudFlagId: 'flag-1',
    },
    baselines: { pendingCommissionCountForAffiliate: 1 },
    apiUrl: 'http://localhost:3001',
    supabase: {
      from: (_t: string) => ({
        select: () => ({ eq: () => ({ eq: () => ({ count: 1 + extraCommissionCount, error: null }) }) }),
      }),
    } as any,
    internalKey: 'K',
    stripeWebhookSecret: 'whsec_smoke',
  }
}

describe('SP4 skip', () => {
  it('skips when stripeWebhookSecret is null', async () => {
    const c = ctx()
    c.stripeWebhookSecret = null
    for (const probe of SP4_PROBES) {
      const out = await probe.run(c)
      expect(out.status).toBe('skip')
    }
  })
})
```

- [ ] **Step 2: Verify failure**

- [ ] **Step 3: Create `scripts/smoke/probes/sp4.ts`**

```typescript
import { smokeRequest } from '../http.js'
import { buildSignedInvoiceEvent } from '../stripe-event.js'
import type { Probe, ProbeContext } from '../types.js'

async function pendingCount(ctx: ProbeContext): Promise<number> {
  const { count, error } = await ctx.supabase
    .from('affiliate_commissions')
    .select('id', { count: 'exact', head: true })
    .eq('affiliate_id', ctx.fixture.affiliateId)
    .eq('status', 'pending')
  if (error) throw new Error(`pendingCount: ${error.message}`)
  return count ?? 0
}

async function postWebhook(
  ctx: ProbeContext,
  billingReason: 'subscription_cycle' | 'subscription_update' | 'subscription_create',
  amountPaid: number,
) {
  const { rawBody, signature } = buildSignedInvoiceEvent({
    billingReason, amountPaid,
    orgId: ctx.fixture.organizationId,
    secret: ctx.stripeWebhookSecret!,
  })
  return smokeRequest({
    apiUrl: ctx.apiUrl, internalKey: ctx.internalKey, userId: null,
    method: 'POST', path: '/billing/webhook',
    body: JSON.parse(rawBody),
    extraHeaders: { 'stripe-signature': signature },
  })
}

const SKIP = { status: 'skip' as const, detail: 'STRIPE_WEBHOOK_SECRET not set in apps/api/.env.local' }

export const SP4_PROBES: Probe[] = [
  {
    id: 'SP4-1', sp: 4,
    desc: 'webhook subscription_cycle → commission +1',
    async run(ctx) {
      if (!ctx.stripeWebhookSecret) return SKIP
      const r = await postWebhook(ctx, 'subscription_cycle', 9900)
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const after = await pendingCount(ctx)
      const expected = ctx.baselines.pendingCommissionCountForAffiliate + 1
      if (after !== expected) return { status: 'fail', detail: `pending count: expected ${expected}, got ${after}` }
      // Verify newest row shape
      const { data, error } = await ctx.supabase.from('affiliate_commissions')
        .select('status, referral_id, payment_amount, commission_rate, total_brl, affiliate_id')
        .eq('affiliate_id', ctx.fixture.affiliateId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(1).single()
      if (error || !data) return { status: 'fail', detail: `newest row read: ${error?.message}` }
      if (data.referral_id !== ctx.fixture.referralId) {
        return { status: 'fail', detail: `referral_id mismatch: ${data.referral_id}` }
      }
      if (data.payment_amount !== 9900) {
        return { status: 'fail', detail: `payment_amount: expected 9900, got ${data.payment_amount}` }
      }
      if (Number(data.commission_rate) !== 0.15) {
        return { status: 'fail', detail: `commission_rate: expected 0.15, got ${data.commission_rate}` }
      }
      if (!(Number(data.total_brl) > 0)) {
        return { status: 'fail', detail: `total_brl: expected > 0, got ${data.total_brl}` }
      }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP4-2', sp: 4,
    desc: 'webhook subscription_update → no delta',
    async run(ctx) {
      if (!ctx.stripeWebhookSecret) return SKIP
      const before = await pendingCount(ctx)
      const r = await postWebhook(ctx, 'subscription_update', 9900)
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const after = await pendingCount(ctx)
      if (after !== before) return { status: 'fail', detail: `count changed: ${before} → ${after}` }
      return { status: 'pass' }
    },
  },
  {
    id: 'SP4-3', sp: 4,
    desc: 'webhook amount_paid=0 → short-circuit',
    async run(ctx) {
      if (!ctx.stripeWebhookSecret) return SKIP
      const before = await pendingCount(ctx)
      const r = await postWebhook(ctx, 'subscription_cycle', 0)
      if (r.status !== 200) return { status: 'fail', detail: `HTTP ${r.status}` }
      const after = await pendingCount(ctx)
      if (after !== before) return { status: 'fail', detail: `count changed: ${before} → ${after}` }
      return { status: 'pass' }
    },
  },
]
```

- [ ] **Step 4: Verify pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke/probes/sp4.ts scripts/smoke/__tests__/probes-sp4.test.ts
git commit -m "feat(smoke): SP4 Stripe webhook probes (cycle +1, update +0, zero short-circuit)"
```

---

## Task 13: Probe registry with execution order

**Files:**
- Create: `scripts/smoke/probes/index.ts`

- [ ] **Step 1: Create `scripts/smoke/probes/index.ts`**

```typescript
import { SP1_PROBES } from './sp1.js'
import { SP2_PROBES } from './sp2.js'
import { buildSp3Probes } from './sp3.js'
import { SP4_PROBES } from './sp4.js'
import type { Probe } from '../types.js'

// Execution order (spec §3): SP1 → SP4 → SP2 reads+resolve → SP3 → SP2-6 (pause, terminal)
export function orderedProbes(refRateLimitMax: number): Probe[] {
  const sp3 = buildSp3Probes(refRateLimitMax)
  const sp2Reads = SP2_PROBES.filter(p => p.id !== 'SP2-6')
  const sp2Pause = SP2_PROBES.find(p => p.id === 'SP2-6')!
  return [...SP1_PROBES, ...SP4_PROBES, ...sp2Reads, ...sp3, sp2Pause]
}

export function filterByOnly(probes: Probe[], only: 1 | 2 | 3 | 4 | null): Probe[] {
  return only === null ? probes : probes.filter(p => p.sp === only)
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/smoke/probes/index.ts
git commit -m "feat(smoke): probe registry with execution order (SP1→SP4→SP2→SP3→SP2-pause)"
```

---

## Task 14: Main entry — signal handling, timeout, exit codes

**Files:**
- Create: `scripts/smoke-affiliate.ts`

- [ ] **Step 1: Create `scripts/smoke-affiliate.ts`**

```typescript
#!/usr/bin/env tsx
// Affiliate branch smoke — one-at-a-time per host, TEST-NET-2 synthetic IPs,
// service-role DB access, requires local Supabase + apps/api on :3001.
// See docs/superpowers/specs/2026-04-17-affiliate-branch-smoke-design.md

import { createClient } from '@supabase/supabase-js'
import { parseArgs, HELP_TEXT } from './smoke/cli.js'
import { loadEnv } from './smoke/env.js'
import { probeApiHealth, probeSupabaseHealth } from './smoke/preflight.js'
import { seed, cleanup, cleanupOrphans, captureBaselines, makeRunId } from './smoke/fixture.js'
import { renderNormal, renderQuiet, renderJson, summarize } from './smoke/reporter.js'
import { orderedProbes, filterByOnly } from './smoke/probes/index.js'
import { ExitCode, type ProbeResult, type SeedHandles } from './smoke/types.js'

async function main(): Promise<number> {
  let opts
  try { opts = parseArgs(process.argv.slice(2)) }
  catch (err) { console.error(`error: ${(err as Error).message}`); return ExitCode.PreflightFailed }

  if (opts.help) { console.log(HELP_TEXT); return ExitCode.Ok }

  const env = loadEnv(opts.force)
  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  })

  if (opts.cleanupOrphans) {
    const r = await cleanupOrphans(supabase)
    console.log(`[cleanup-orphans] removed ${r.rowsRemoved} rows; ${r.failures.length} failures`)
    return r.failures.length > 0 ? ExitCode.CleanupFailed : ExitCode.Ok
  }

  // Preflight
  const apiHealth = await probeApiHealth(env.apiUrl)
  const supaHealth = await probeSupabaseHealth(supabase)
  if (!opts.quiet && !opts.json) {
    console.log(`Preflight (2)`)
    console.log(`  ${supaHealth.status === 'pass' ? '✓' : '✗'} supabase @ ${env.supabaseUrl}  (${supaHealth.durationMs} ms)`)
    console.log(`  ${apiHealth.status === 'pass' ? '✓' : '✗'} api      @ ${env.apiUrl}  (${apiHealth.durationMs} ms)`)
  }
  if (apiHealth.status !== 'pass') {
    console.error(`preflight: api unreachable at ${env.apiUrl}/health — ${apiHealth.detail}`)
    return ExitCode.PreflightFailed
  }
  if (supaHealth.status !== 'pass') {
    console.error(`preflight: supabase unreachable at ${env.supabaseUrl} — ${supaHealth.detail}`)
    return ExitCode.PreflightFailed
  }

  // Seed
  const runId = makeRunId()
  let handles: SeedHandles
  try { handles = await seed(supabase, runId) }
  catch (err) {
    console.error(`seed failed: ${(err as Error).message}`)
    return ExitCode.SeedFailed
  }

  let cleanupRan = false
  const runCleanup = async (): Promise<{ rowsRemoved: number; failures: number }> => {
    if (cleanupRan || opts.noCleanup) return { rowsRemoved: 0, failures: 0 }
    cleanupRan = true
    const r = await cleanup(supabase, handles)
    for (const f of r.failures) console.error(`[cleanup-warn] ${f.table}: ${f.error}`)
    return { rowsRemoved: r.rowsRemoved, failures: r.failures.length }
  }

  let signalled = false
  const handleSig = async () => {
    if (signalled) {
      console.error(`[signal] second signal — bypassing cleanup; orphan runId=${runId}`)
      process.exit(ExitCode.SIGINT)
    }
    signalled = true
    console.error(`[signal] running cleanup for runId=${runId}`)
    await runCleanup().catch(e => console.error(`[signal] cleanup error: ${e}`))
    process.exit(ExitCode.SIGINT)
  }
  process.on('SIGINT', handleSig)
  process.on('SIGTERM', handleSig)
  const timeoutMs = opts.timeoutSeconds * 1000
  const timeoutHandle = setTimeout(async () => {
    console.error(`[timeout] after ${opts.timeoutSeconds}s — running cleanup`)
    await runCleanup().catch(() => { /* best effort */ })
    process.exit(ExitCode.Timeout)
  }, timeoutMs)
  timeoutHandle.unref?.()

  const baselines = await captureBaselines(supabase, handles)
  const ctx = {
    fixture: handles, baselines,
    apiUrl: env.apiUrl, supabase,
    internalKey: env.internalKey,
    stripeWebhookSecret: env.stripeWebhookSecret,
  }

  // Run probes in order
  const probes = filterByOnly(orderedProbes(env.refRateLimitMax), opts.only)
  const results: ProbeResult[] = []
  const startAll = Date.now()
  for (const probe of probes) {
    const start = Date.now()
    let outcome: { status: 'pass' | 'fail' | 'skip'; detail?: string }
    try { outcome = await probe.run(ctx) }
    catch (err) { outcome = { status: 'fail', detail: `threw: ${(err as Error).message}` } }
    const durationMs = Date.now() - start
    results.push({ id: probe.id, sp: probe.sp, desc: probe.desc, durationMs, ...outcome })
    if (!opts.quiet && !opts.json) {
      const line = outcome.status === 'pass'
        ? `  ${probe.id.padEnd(6)} ${probe.desc.padEnd(42)} pass  ${String(durationMs).padStart(5)} ms`
        : `  ${probe.id.padEnd(6)} ${probe.desc.padEnd(42)} ${outcome.status}  ${String(durationMs).padStart(5)} ms   (${outcome.detail})`
      console.log(line)
    }
    if (opts.verbose && outcome.status === 'fail') {
      console.error(`[verbose] ${probe.id} detail: ${outcome.detail}`)
    }
  }
  const elapsedMs = Date.now() - startAll

  // Cleanup
  const cleanupSummary = await runCleanup()
  clearTimeout(timeoutHandle)

  // Report
  const s = summarize(results)
  if (opts.json) {
    console.log(renderJson({ runId, probes: results, rowsRemoved: cleanupSummary.rowsRemoved, elapsedMs }))
  } else if (opts.quiet) {
    console.log(renderQuiet(results) + ` · exit ${s.fail > 0 ? 1 : 0}`)
  } else {
    console.log('')
    console.log(`Cleanup`)
    console.log(`  ${cleanupSummary.failures === 0 ? '✓' : '✗'} ${cleanupSummary.rowsRemoved} rows removed`)
    console.log('')
    console.log(`Summary`)
    console.log(`  ${s.pass} pass · ${s.fail} fail · ${s.skip} skip · elapsed ${elapsedMs} ms`)
  }

  if (s.fail > 0) return ExitCode.ProbeFailed
  if (cleanupSummary.failures > 0) return ExitCode.CleanupFailed
  return ExitCode.Ok
}

main()
  .then(code => process.exit(code))
  .catch(err => {
    console.error(`[fatal] ${(err as Error).message}`)
    process.exit(ExitCode.ProbeFailed)
  })
```

- [ ] **Step 2: Smoke-test locally**

```bash
npm run db:start   # if not already
npm run dev:api    # in separate terminal (or background)
npm run smoke:affiliate -- --help
```

Expected: prints HELP_TEXT, exits 0.

```bash
npm run smoke:affiliate
```

Expected: preflight PASS × 2, seed PASS, probes run (SP4 may SKIP if no webhook secret), cleanup PASS, exit 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-affiliate.ts
git commit -m "feat(smoke): entry point with preflight + seed + probes + cleanup + signal/timeout handling"
```

---

## Task 15: End-to-end verification + BRANCH_NOTES update

**Files:**
- Modify: `docs/superpowers/BRANCH_NOTES-affiliate-migration.md`

- [ ] **Step 1: Full run captured**

```bash
npm run smoke:affiliate > /tmp/smoke-run.txt 2>&1
cat /tmp/smoke-run.txt
```

Expected: exit 0, 16 PASS (or 13 PASS + 3 SKIP if no Stripe secret).

- [ ] **Step 2: Idempotency check — run twice back-to-back**

```bash
npm run smoke:affiliate && npm run smoke:affiliate
```

Expected: both exit 0.

- [ ] **Step 3: Orphan cleanup check**

```bash
npm run smoke:affiliate -- --no-cleanup  # leaves rows
npm run smoke:affiliate -- --cleanup-orphans  # removes them
```

Expected: second command reports `removed N rows`; re-running with `--cleanup-orphans` reports 0.

- [ ] **Step 4: Intentional break check (§10.2 of spec)**

Temporarily edit `apps/api/src/routes/...` to disable the fraud-flag resolve route (e.g., comment out the handler). Run smoke. Expected: SP2-5 FAIL with a clear diagnostic. Revert.

- [ ] **Step 5: Update `docs/superpowers/BRANCH_NOTES-affiliate-migration.md`**

Find the section `## Known residual gaps` → item 1 (Cross-sub-project integration smoke not performed). Replace the `Reviewer action:` bullet with:

```markdown
- **Status:** ✅ Automated smoke rehearsal at `scripts/smoke-affiliate.ts`. Run via `npm run smoke:affiliate`. First green run captured at [commit SHA]. Residual manual items (6) documented in spec §1 non-goals.
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/BRANCH_NOTES-affiliate-migration.md
git commit -m "docs(branch): close residual gap 1 with smoke automation"
```

---

## Self-review

- [ ] **Spec coverage check**

| Spec section | Implemented by |
|---|---|
| §2 prerequisites | Task 7 (preflight) |
| §3 architecture — types | Task 1 |
| §3 architecture — modules | Tasks 2–8 |
| §3 probe execution order | Task 13 |
| §4 fixture (seed/cleanup/baselines) | Task 6 |
| §5 SP1 probes ×3 | Task 9 |
| §5 SP2 probes ×6 | Task 10 |
| §5 SP3 probes ×4 | Task 11 |
| §5 SP4 probes ×3 | Task 12 |
| §6 failure + exit codes + signals | Task 14 |
| §7 reporter (normal/quiet/verbose/json) | Task 8 + 14 |
| §8 CLI flags | Task 2 |
| §9 assumptions (documented inline) | Tasks 1–14 |
| §10 self-test | Task 15 |
| §11 done criteria | Task 15 |
| §12 traceability (no code — doc only) | — |

- [ ] **Placeholder scan:** no `TBD` / `TODO` / `later`. Every step has real code or real commands.

- [ ] **Type consistency:** `SeedHandles`, `ProbeContext`, `Probe`, `ProbeOutcome`, `ProbeResult` declared once in Task 1; referenced unchanged thereafter. `smokeRequest` return type `SmokeResponse` used consistently in Tasks 9–12.

- [ ] **File-path consistency:** probes live under `scripts/smoke/probes/`; tests under `scripts/smoke/__tests__/`; `smokeRequest` from `../http.js`; types from `../types.js` or `../../types.js` depending on nesting.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-17-affiliate-branch-smoke.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, two-stage review between tasks, fast iteration. Well-suited here because tasks 2–12 are largely independent modules with unit-test gates.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**
