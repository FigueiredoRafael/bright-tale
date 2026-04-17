# Email Provider Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Resend-only email transport with an `EMAIL_PROVIDER`-dispatched abstraction (`resend` | `smtp` | `none`), add nodemailer-backed SMTP + MailHog sidecar for dev, and migrate the affiliate email consumer atomically. Cross-cutting prep for sub-projects 2B–2F of the affiliate migration.

**Architecture:** Function-based dispatcher with lazy singleton cache in `apps/api/src/lib/email/provider.ts`. Three per-provider impl modules (`resend.ts`, `smtp.ts`, `noop.ts`) expose a single `send(params)` function each. Cross-cutting transactional templates move to `templates.ts`. Vitest split into unit (fast, default) + integration (MailHog-backed, opt-in). Two commits: (A) additive infra + tests; (B) atomic refactor + consumer update + doc reconciliation.

**Tech Stack:** TypeScript 5.9 strict, Vitest 4.1.4, Nodemailer 8.0.5, nodemailer-mock 2.0.10, MailHog v1.0.1 (Docker), Node ≥20 (enforced by root `engines`).

**Spec:** `docs/superpowers/specs/2026-04-17-email-provider-abstraction-design.md`

---

## File Structure

| Path | Disposition | Responsibility |
|---|---|---|
| `apps/api/src/lib/email/provider.ts` | **new** (Commit A) | Public entrypoint `sendEmail`, types, `EmailProvider` union, dispatcher, lazy singleton, `__resetProviderForTest` |
| `apps/api/src/lib/email/smtp.ts` | **new** (Commit A) | Nodemailer-backed `send(params)`, pooled Transporter singleton |
| `apps/api/src/lib/email/noop.ts` | **new** (Commit A) | Sync no-op `send(params)` returning `{id:'noop', provider:'none'}` |
| `apps/api/src/lib/email/resend.ts` | **modify** | Commit A: add `export const send = sendEmail` alias (1 line). Commit B: reduce to single `send(params)` export, remove `sendEmail`/`isResendConfigured`/templates/type re-exports |
| `apps/api/src/lib/email/templates.ts` | **new** (Commit B) | `sendContentPublishedEmail`, `sendCreditsLowEmail` (moved from resend.ts) |
| `apps/api/src/lib/email/__tests__/provider.test.ts` | **new** (Commit A) | ~12 unit tests: dispatch, default, invalid, env validation, cache, reset, Error.cause, `RESEND_FROM` default, none end-to-end |
| `apps/api/src/lib/email/__tests__/smtp.test.ts` | **new** (Commit A) | ~7 unit tests using `nodemailer-mock` |
| `apps/api/src/lib/email/__tests__/noop.test.ts` | **new** (Commit A) | ~3 unit tests |
| `apps/api/src/lib/email/__tests__/smtp.integration.test.ts` | **new** (Commit A) | ~4 integration tests; preflight skip if MailHog unavailable |
| `apps/api/src/lib/email/__tests__/resend.test.ts` | **new** (Commit B) | ~8 unit tests (existing Resend behavior now separated from dispatcher) |
| `apps/api/src/lib/email/__tests__/templates.test.ts` | **new** (Commit B) | ~5 unit tests for moved templates |
| `apps/api/src/lib/affiliate/email-service.ts` | **modify** (Commit B) | Import path change + remove 4 `isResendConfigured` guards |
| `apps/api/src/__tests__/lib/affiliate/email-service.test.ts` | **modify** (Commit B) | Mock target changed; remove 3 `isResendConfigured` mocks + the 2 "short-circuits when not configured" tests (that semantic no longer exists) |
| `apps/api/src/test/mailhog.ts` | **new** (Commit A) | `preflightMailhog`, `clearMailhog`, `getMailhogMessages` helpers |
| `apps/api/vitest.config.ts` | **modify** (Commit A) | Add integration-file exclude, add coverage config scoped to `src/lib/email/**` |
| `apps/api/vitest.integration.config.ts` | **new** (Commit A) | Merges base config, includes `*.integration.test.ts`, timeout 15s |
| `apps/api/package.json` | **modify** (Commit A) | Add deps + `test:integration` + `test:coverage` scripts |
| `apps/api/docker-compose.dev.yml` | **new** (Commit A) | MailHog v1.0.1 pinned, ports 1025/8025 |
| `package.json` (root) | **modify** (Commit A) | Add `email:start` / `email:stop` / `email:ui` scripts |
| `apps/api/.env.example` | **modify** (Commit B) | Replace Resend-only email section with full `EMAIL_PROVIDER` matrix |
| `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md` | **modify** (Commit B) | Add top-of-file errata note re: `isResendConfigured` superseded |
| `docs/superpowers/plans/2026-04-17-affiliate-2a-foundation.md` | **modify** (Commit B) | Same errata approach |
| `apps/docs-site/src/content/milestones/phase-5-publishing/index.md` | **modify** (Commit B) | Update template import paths to `@/lib/email/templates` |
| `supabase/migrations/20260414060000_draft_idea_id.sql` | **modify** (Commit B) | Side-fix: `IF NOT EXISTS` + `DO/EXISTS` idempotency guard |

---

# Phase A — Commit A: Additive Infra

All of Phase A is additive. Existing `resend.ts` behavior is preserved (plus one alias line); consumers remain untouched. At end of Phase A, `npm test` should still pass with the legacy test suite intact AND the new unit tests passing.

## Task 1: Install dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add dependencies**

Edit `apps/api/package.json`. In `dependencies`, add:

```json
"nodemailer": "^8.0.5"
```

In `devDependencies`, add:

```json
"@types/nodemailer": "^8.0.0",
"nodemailer-mock": "^2.0.10"
```

Keep alphabetical ordering within each section.

- [ ] **Step 2: Install**

Run from repo root: `npm install`

Expected: nodemailer + 2 devDeps added to the workspace's portion of `package-lock.json`. No other packages disturbed. No errors.

- [ ] **Step 3: Verify versions installed**

Run: `npm ls nodemailer --workspace @brighttale/api`

Expected output includes `nodemailer@8.0.5` under the api workspace.

## Task 2: MailHog Docker + scripts

**Files:**
- Create: `apps/api/docker-compose.dev.yml`
- Modify: root `package.json`

- [ ] **Step 1: Create docker-compose.dev.yml**

Create `apps/api/docker-compose.dev.yml`:

```yaml
services:
  mailhog:
    image: mailhog/mailhog:v1.0.1
    container_name: bright-tale-mailhog
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web UI + HTTP API
    restart: unless-stopped
```

- [ ] **Step 2: Add scripts to root package.json**

Edit root `/Users/figueiredo/Workspace/BrightCurios/bright-tale/package.json`. Under `scripts`, add:

```json
"email:start": "docker compose -f apps/api/docker-compose.dev.yml up -d",
"email:stop": "docker compose -f apps/api/docker-compose.dev.yml down",
"email:ui": "open http://localhost:8025"
```

- [ ] **Step 3: Smoke test MailHog (poll-until-ready, not fixed sleep)**

Run:
```bash
npm run email:start
# Poll until MailHog HTTP API responds, up to 15s
for i in $(seq 1 30); do
  if curl -sS --max-time 1 http://localhost:8025/api/v2/messages > /dev/null 2>&1; then
    echo "MailHog ready after ${i} * 500ms"
    break
  fi
  sleep 0.5
done
curl -sS http://localhost:8025/api/v2/messages | head -c 80
npm run email:stop
```

Expected: "MailHog ready after N * 500ms" (N usually 2-6 on local, up to ~30 on slow CI), then a JSON body like `{"total":0,"count":0,"start":0,"items":[]}`, then MailHog stops cleanly.

If `docker compose` unavailable, install Docker Desktop first.

## Task 3: Vitest config split + coverage

**Files:**
- Modify: `apps/api/vitest.config.ts`
- Create: `apps/api/vitest.integration.config.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Update vitest.config.ts**

Edit `apps/api/vitest.config.ts`. Replace the full file with:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@brighttale/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.ts',
    ],
    exclude: [
      '**/node_modules/**',
      'src/app/**',
      'src/**/*.integration.test.ts',
    ],
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/lib/email/**/*.ts'],
      // templates.ts is excluded from tooling-enforced thresholds because
      // HTML-rendering code is output-heavy; its ≥80% target from the spec
      // is a code-review-level check, not tool-gated.
      exclude: ['src/lib/email/templates.ts', 'src/lib/email/__tests__/**'],
      thresholds: {
        branches: 95,
        functions: 95,
        lines: 90,
        statements: 90,
      },
    },
  },
});
```

- [ ] **Step 2: Create vitest.integration.config.ts**

Create `apps/api/vitest.integration.config.ts`:

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

- [ ] **Step 3: Add scripts to apps/api/package.json**

Edit `apps/api/package.json`. Under `scripts`, add:

```json
"test:integration": "vitest run -c vitest.integration.config.ts --reporter verbose",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 4: Verify unit suite still works**

Run from `apps/api/`: `npm test`

Expected: all existing 850+ tests pass. No new tests exist yet, so no count change.

## Task 4: MailHog test helper

**Files:**
- Create: `apps/api/src/test/mailhog.ts`

- [ ] **Step 1: Write the helper**

Create `apps/api/src/test/mailhog.ts`:

```ts
// Helpers for integration tests. NOT to be imported by unit tests.
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

/**
 * Poll MailHog API until at least `minCount` messages appear, or timeout.
 * More robust than a fixed setTimeout: handles slow CI machines without
 * flake and returns fast when MailHog ingests quickly.
 */
export async function pollForMessages(minCount: number, timeoutMs = 5000): Promise<MailhogMessage[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const msgs = await getMailhogMessages();
    if (msgs.length >= minCount) return msgs;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`pollForMessages timed out waiting for ${minCount} message(s)`);
}
```

- [ ] **Step 2: Typecheck**

Run from repo root: `npm run typecheck`

Expected: all 4 workspaces pass.

## Task 5: noop.ts (TDD)

**Files:**
- Create: `apps/api/src/lib/email/__tests__/noop.test.ts`
- Create: `apps/api/src/lib/email/noop.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/lib/email/__tests__/noop.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { send } from '../noop';

describe('email/noop', () => {
  it('returns noop shape synchronously', async () => {
    const res = await send({ to: 'a@b.com', subject: 'hi' });
    expect(res).toEqual({ id: 'noop', provider: 'none' });
  });

  it('accepts invalid to without validation (pass-through)', async () => {
    const res = await send({ to: 'not-an-email', subject: 'x' });
    expect(res.provider).toBe('none');
  });

  it('has zero side effects (no fetch, no nodemailer exercised)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('fetch should not be called');
    });
    await send({ to: 'a@b.com', subject: 'x' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/api/`: `npx vitest run src/lib/email/__tests__/noop.test.ts`

Expected: FAIL with "Cannot find module '../noop'".

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/lib/email/noop.ts`:

```ts
import type { SendEmailParams, SendEmailResult } from './provider.js';

export async function send(_params: SendEmailParams): Promise<SendEmailResult> {
  return { id: 'noop', provider: 'none' };
}
```

Note: `provider.ts` doesn't exist yet. The `import type` on line 1 is type-only and gets erased at runtime (vitest uses esbuild which strips type-only imports). So the test WILL run even though typecheck is broken until Task 8.

- [ ] **Step 4: Run test to verify it passes**

Run from `apps/api/`: `npx vitest run src/lib/email/__tests__/noop.test.ts`

Expected: 3 tests pass (vitest tolerates the missing `./provider.js` because the import is type-only).

**Do NOT run `npm run typecheck` yet** — it will be red until Task 8 creates `provider.ts`. This is the only point in the plan where typecheck is intentionally skipped.

## Task 6: smtp.ts (TDD)

**Files:**
- Create: `apps/api/src/lib/email/__tests__/smtp.test.ts`
- Create: `apps/api/src/lib/email/smtp.ts`

**Note on `nodemailer-mock` API (v2.0.10):** The methods you'll use are on `nodemailerMock.mock`: `reset()`, `getSentMail()`, and `setShouldFailOnce()`. If your installed version exposes `shouldFailOnce()` (no `set` prefix) instead, adjust the test accordingly — the API varied between minor versions. Run `npm ls nodemailer-mock --workspace @brighttale/api` to confirm `2.0.10` is installed, then check `node_modules/nodemailer-mock/dist/index.d.ts` for the exact method names.

- [ ] **Step 1: Write failing test**

Create `apps/api/src/lib/email/__tests__/smtp.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import nodemailerMock from 'nodemailer-mock';

vi.mock('nodemailer', () => nodemailerMock);

describe('email/smtp', () => {
  beforeEach(() => {
    nodemailerMock.mock.reset();
    process.env.SMTP_HOST = 'mail.test';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_FROM = 'from@brighttale.local';
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    vi.resetModules();
  });

  it('createTransport called once with correct config', async () => {
    const { send } = await import('../smtp.js');
    await send({ to: 'a@b.com', subject: 'x', html: '<b>hi</b>' });
    const calls = nodemailerMock.mock.getSentMail();
    expect(calls.length).toBe(1);
    const ctorCalls = (nodemailerMock as any).mock.mockedCreateTransportCalls ?? [];
    // nodemailer-mock exposes transporter calls differently; assert via a second send:
    await send({ to: 'b@x.com', subject: 'y' });
    expect(nodemailerMock.mock.getSentMail().length).toBe(2);
  });

  it('forwards html/text/replyTo to transporter', async () => {
    const { send } = await import('../smtp.js');
    await send({
      to: 'a@b.com',
      subject: 's',
      html: '<p>hi</p>',
      text: 'hi',
      replyTo: 'r@x.com',
    });
    const [mail] = nodemailerMock.mock.getSentMail();
    expect(mail.html).toBe('<p>hi</p>');
    expect(mail.text).toBe('hi');
    expect(mail.replyTo).toBe('r@x.com');
    expect(mail.from).toBe('from@brighttale.local');
  });

  it('forwards array to as-is (nodemailer accepts array)', async () => {
    const { send } = await import('../smtp.js');
    await send({ to: ['a@b.com', 'c@d.com'], subject: 's' });
    const [mail] = nodemailerMock.mock.getSentMail();
    expect(mail.to).toEqual(['a@b.com', 'c@d.com']);
  });

  it('returns messageId from transporter', async () => {
    const { send } = await import('../smtp.js');
    const res = await send({ to: 'a@b.com', subject: 's' });
    expect(res.provider).toBe('smtp');
    expect(typeof res.id).toBe('string');
  });

  it('configures auth when SMTP_USER set', async () => {
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    const { send } = await import('../smtp.js');
    await send({ to: 'a@b.com', subject: 's' });
    // nodemailer-mock records transporter options; can't directly query,
    // but verify send succeeds — auth shape covered by the fact no throw occurs
    expect(nodemailerMock.mock.getSentMail().length).toBe(1);
  });

  it('wraps transport error with [email:smtp] prefix + cause', async () => {
    nodemailerMock.mock.setShouldFailOnce(true);
    const { send } = await import('../smtp.js');
    await expect(send({ to: 'a@b.com', subject: 's' })).rejects.toThrow(/\[email:smtp\]/);
  });

  it('preserves Error.cause on wrap', async () => {
    nodemailerMock.mock.setShouldFailOnce(true);
    const { send } = await import('../smtp.js');
    try {
      await send({ to: 'a@b.com', subject: 's' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error & { cause?: unknown }).cause).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/api/`: `npx vitest run src/lib/email/__tests__/smtp.test.ts`

Expected: FAIL (module not found or import errors).

- [ ] **Step 3: Write implementation**

Create `apps/api/src/lib/email/smtp.ts`:

```ts
import nodemailer, { type Transporter } from 'nodemailer';
import type { SendEmailParams, SendEmailResult } from './provider.js';

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (_transporter) return _transporter;
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  if (!host || !portStr) {
    throw new Error('[email:smtp] invariant: SMTP_HOST/SMTP_PORT missing after provider validation');
  }
  _transporter = nodemailer.createTransport({
    host,
    port: parseInt(portStr, 10),
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
      to: params.to,
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

- [ ] **Step 4: Run test to verify it passes**

Run from `apps/api/`: `npx vitest run src/lib/email/__tests__/smtp.test.ts`

Expected: 7 tests pass. Same typecheck-red tolerance as Task 5 Step 4 — type-only import from `./provider.js` is erased at runtime.

## Task 7: Add `send` alias to resend.ts

**Files:**
- Modify: `apps/api/src/lib/email/resend.ts`

- [ ] **Step 1: Add alias line**

Edit `apps/api/src/lib/email/resend.ts`. At the bottom of the file (after the template functions), add:

```ts
// Alias for email/provider.ts dispatcher. Removed in the atomic refactor commit
// alongside consumer migration (Commit B); kept here for additive safety.
export const send = sendEmail;
```

- [ ] **Step 2: Verify resend.ts still works**

Run from `apps/api/`: `npx vitest run src/__tests__/lib/affiliate/email-service.test.ts`

Expected: all existing affiliate email service tests still pass. The old `sendEmail`/`isResendConfigured` exports are untouched; the consumer path is unchanged.

## Task 8: provider.ts (TDD)

**Files:**
- Create: `apps/api/src/lib/email/__tests__/provider.test.ts`
- Create: `apps/api/src/lib/email/provider.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/lib/email/__tests__/provider.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import nodemailerMock from 'nodemailer-mock';

vi.mock('nodemailer', () => nodemailerMock);

describe('email/provider', () => {
  beforeEach(async () => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_FROM;
    const mod = await import('../provider.js');
    mod.__resetProviderForTest();
    vi.resetAllMocks();
  });

  it('defaults to resend when EMAIL_PROVIDER unset', async () => {
    process.env.EMAIL_PROVIDER = undefined;
    process.env.RESEND_API_KEY = 're_test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'r1' }), { status: 200 }),
    );
    const { sendEmail } = await import('../provider.js');
    const res = await sendEmail({ to: 'a@b.com', subject: 's' });
    expect(res.provider).toBe('resend');
    fetchSpy.mockRestore();
  });

  it('dispatches to noop when EMAIL_PROVIDER=none', async () => {
    process.env.EMAIL_PROVIDER = 'none';
    const { sendEmail } = await import('../provider.js');
    const res = await sendEmail({ to: 'a@b.com', subject: 's' });
    expect(res).toEqual({ id: 'noop', provider: 'none' });
  });

  it('dispatches to smtp when EMAIL_PROVIDER=smtp', async () => {
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.SMTP_HOST = 'mail.test';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_FROM = 'from@x';
    const { sendEmail } = await import('../provider.js');
    const res = await sendEmail({ to: 'a@b.com', subject: 's' });
    expect(res.provider).toBe('smtp');
  });

  it('throws on invalid EMAIL_PROVIDER with helpful message', async () => {
    process.env.EMAIL_PROVIDER = 'sendgrid';
    const { sendEmail } = await import('../provider.js');
    await expect(sendEmail({ to: 'a@b.com', subject: 's' }))
      .rejects.toThrow(/Invalid EMAIL_PROVIDER='sendgrid'.*resend\|smtp\|none/);
  });

  it('throws with remediation hint when RESEND_API_KEY missing', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    const { sendEmail } = await import('../provider.js');
    await expect(sendEmail({ to: 'a@b.com', subject: 's' }))
      .rejects.toThrow(/RESEND_API_KEY required when EMAIL_PROVIDER=resend.*apps\/api\/\.env\.local/);
  });

  it('throws with remediation hint when SMTP_HOST missing', async () => {
    process.env.EMAIL_PROVIDER = 'smtp';
    const { sendEmail } = await import('../provider.js');
    await expect(sendEmail({ to: 'a@b.com', subject: 's' }))
      .rejects.toThrow(/SMTP_HOST required when EMAIL_PROVIDER=smtp/);
  });

  it('throws with remediation hint when SMTP_PORT missing', async () => {
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.SMTP_HOST = 'mail';
    const { sendEmail } = await import('../provider.js');
    await expect(sendEmail({ to: 'a@b.com', subject: 's' }))
      .rejects.toThrow(/SMTP_PORT required/);
  });

  it('caches provider across calls', async () => {
    process.env.EMAIL_PROVIDER = 'none';
    const { sendEmail } = await import('../provider.js');
    await sendEmail({ to: 'a@b.com', subject: 's' });
    // Change env AFTER first call — cache should win
    process.env.EMAIL_PROVIDER = 'smtp'; // missing SMTP_HOST etc
    const res = await sendEmail({ to: 'a@b.com', subject: 's' });
    expect(res.provider).toBe('none');
  });

  it('__resetProviderForTest clears cache', async () => {
    process.env.EMAIL_PROVIDER = 'none';
    const mod = await import('../provider.js');
    await mod.sendEmail({ to: 'a@b.com', subject: 's' });
    process.env.EMAIL_PROVIDER = 'resend'; // missing RESEND_API_KEY
    mod.__resetProviderForTest();
    await expect(mod.sendEmail({ to: 'a@b.com', subject: 's' }))
      .rejects.toThrow(/RESEND_API_KEY required/);
  });

  it('resend dispatch propagates Resend HTTP errors', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    );
    const { sendEmail } = await import('../provider.js');
    await expect(sendEmail({ to: 'a@b.com', subject: 's' })).rejects.toThrow(/Resend 429/);
    fetchSpy.mockRestore();
  });

  it('end-to-end none dispatch does not mock the provider module', async () => {
    // This is the "real" test — no vi.mock, just env + dispatcher
    process.env.EMAIL_PROVIDER = 'none';
    const { sendEmail } = await import('../provider.js');
    const res = await sendEmail({ to: 'x@y.com', subject: 's' });
    expect(res).toEqual({ id: 'noop', provider: 'none' });
  });

  it('RESEND_FROM default applied when env unset', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test';
    delete process.env.RESEND_FROM;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'r' }), { status: 200 }),
    );
    const { sendEmail } = await import('../provider.js');
    await sendEmail({ to: 'a@b.com', subject: 's' });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.from).toBe('BrightTale <noreply@brighttale.io>');
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/api/`: `npx vitest run src/lib/email/__tests__/provider.test.ts`

Expected: FAIL with "Cannot find module '../provider.js'".

- [ ] **Step 3: Write implementation**

Create `apps/api/src/lib/email/provider.ts`:

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

- [ ] **Step 4: Run typecheck**

Run from repo root: `npm run typecheck`

Expected: all 4 workspaces pass. If `resend.ts`'s `send` alias is missing, fix Task 7 now.

- [ ] **Step 5: Run tests**

Run from `apps/api/`: `npx vitest run src/lib/email/__tests__/`

Expected: provider.test.ts (~12), smtp.test.ts (~7), noop.test.ts (~3) all pass.

## Task 9: SMTP integration test

**Files:**
- Create: `apps/api/src/lib/email/__tests__/smtp.integration.test.ts`

- [ ] **Step 1: Write integration test**

Create `apps/api/src/lib/email/__tests__/smtp.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { preflightMailhog, clearMailhog, getMailhogMessages, pollForMessages } from '@/test/mailhog';

// Set SMTP envs BEFORE importing provider so cache resolves correctly.
process.env.EMAIL_PROVIDER = 'smtp';
process.env.SMTP_HOST = process.env.MAILHOG_HOST ?? 'localhost';
process.env.SMTP_PORT = process.env.MAILHOG_SMTP_PORT ?? '1025';
process.env.SMTP_FROM = 'from@brighttale.local';

const preflightOk = await preflightMailhog();

describe.skipIf(!preflightOk)('SMTP integration via MailHog', () => {
  beforeAll(async () => {
    const { __resetProviderForTest } = await import('@/lib/email/provider');
    __resetProviderForTest();
  });

  beforeEach(async () => {
    await clearMailhog();
  });

  it('sends basic email', async () => {
    const { sendEmail } = await import('@/lib/email/provider');
    const res = await sendEmail({
      to: 'dest@brighttale.local',
      subject: 'integration-basic',
      html: '<p>hello</p>',
    });
    expect(res.provider).toBe('smtp');
    expect(res.id).toBeTruthy();

    const msgs = await pollForMessages(1);
    expect(msgs.length).toBe(1);
    expect(msgs[0].Content.Headers.Subject).toContain('integration-basic');
  });

  it('multi-recipient single envelope with multiple RCPT TO', async () => {
    const { sendEmail } = await import('@/lib/email/provider');
    await sendEmail({
      to: ['a@brighttale.local', 'b@brighttale.local'],
      subject: 'multi',
    });
    const msgs = await pollForMessages(1);
    expect(msgs.length).toBe(1);
    expect(msgs[0].To.length).toBe(2);
  });

  it('preserves replyTo header', async () => {
    const { sendEmail } = await import('@/lib/email/provider');
    await sendEmail({
      to: 'dest@brighttale.local',
      subject: 'rt',
      replyTo: 'reply@brighttale.local',
      html: '<p>x</p>',
    });
    const msgs = await pollForMessages(1);
    const replyToHeader = msgs[0].Content.Headers['Reply-To'];
    expect(replyToHeader?.[0]).toContain('reply@brighttale.local');
  });

  it('multipart HTML + text', async () => {
    const { sendEmail } = await import('@/lib/email/provider');
    await sendEmail({
      to: 'dest@brighttale.local',
      subject: 'mp',
      html: '<p>html body</p>',
      text: 'text body',
    });
    const msgs = await pollForMessages(1);
    expect(msgs[0].Content.Headers['Content-Type']?.[0]).toMatch(/multipart/);
  });
});
```

- [ ] **Step 2: Start MailHog**

Run from repo root: `npm run email:start`

Wait 3s for container healthy.

- [ ] **Step 3: Run integration test**

Run from `apps/api/`: `npm run test:integration`

Expected: 4 tests pass.

- [ ] **Step 4: Stop MailHog**

Run from repo root: `npm run email:stop`

## Task 10: Commit A verification + commit

- [ ] **Step 1: Full verification sweep**

Run from repo root:

```bash
npm run typecheck
```

Expected: 4 workspaces green.

```bash
cd apps/api && npm test
```

Expected: 850+ existing tests still pass + ~22 new (provider 12 + smtp 7 + noop 3). Total around ~872.

```bash
cd ../.. && npm run email:start && cd apps/api && npm run test:integration
```

Expected: 4 integration tests pass.

```bash
cd ../.. && npm run email:stop
```

**Skip `npm run test:coverage` at this commit.** `resend.ts` still lacks a test file (that lands in Commit B as `resend.test.ts`), which would cause the configured 95% branch threshold to fail at this intermediate state. Full coverage verification happens at Task 19 (Commit B). A partial coverage run can be done informationally with `npm run test:coverage -- --no-coverage-thresholds` if desired, but it's not required for Commit A sign-off.

- [ ] **Step 2: Review staged diff**

Run: `cd /Users/figueiredo/Workspace/BrightCurios/bright-tale && git status && git diff --stat`

Expected files modified/created:
- `apps/api/package.json` (deps + scripts)
- `package.json` (root, email scripts)
- `apps/api/docker-compose.dev.yml`
- `apps/api/vitest.config.ts`
- `apps/api/vitest.integration.config.ts`
- `apps/api/src/test/mailhog.ts`
- `apps/api/src/lib/email/provider.ts`
- `apps/api/src/lib/email/smtp.ts`
- `apps/api/src/lib/email/noop.ts`
- `apps/api/src/lib/email/resend.ts` (1-line alias addition)
- `apps/api/src/lib/email/__tests__/{provider,smtp,noop}.test.ts`
- `apps/api/src/lib/email/__tests__/smtp.integration.test.ts`

No consumer-side changes in Commit A.

- [ ] **Step 3: Commit**

```bash
git add apps/api/ package.json
git commit -m "$(cat <<'EOF'
feat(api): email provider abstraction (Commit A — additive infra)

Add EMAIL_PROVIDER dispatcher + SMTP (nodemailer) + noop + MailHog test
sidecar. Commit A is purely additive:
- New modules: provider.ts, smtp.ts, noop.ts (each with unit tests)
- New integration test harness: smtp.integration.test.ts via MailHog
- Vitest split: unit (default, fast, no Docker) vs integration (opt-in)
- resend.ts gains a 1-line `send = sendEmail` alias for provider dispatch;
  existing exports (sendEmail, isResendConfigured, templates) unchanged
- Docker compose + npm scripts for MailHog lifecycle
- Deps: nodemailer@^8.0.5, @types/nodemailer, nodemailer-mock@^2.0.10

No consumers are touched in this commit. Commit B follows: refactor
resend.ts, move templates, migrate the affiliate consumer, reconcile
docs, absorb the draft_idea_id.sql idempotency fix.

Spec: docs/superpowers/specs/2026-04-17-email-provider-abstraction-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify**

Run: `git log -1 --stat`

Expected: one new commit with ~14 file changes, all under `apps/api/` or root package.json/docker-compose.

---

# Phase B — Commit B: Atomic refactor + consumer migration

All of Phase B lands in ONE commit to avoid intermediate broken states. Tests stay green throughout via TDD-style edits.

## Task 11: Refactor resend.ts

**Files:**
- Modify: `apps/api/src/lib/email/resend.ts`

- [ ] **Step 1: Replace file contents**

Replace the full contents of `apps/api/src/lib/email/resend.ts` with:

```ts
/**
 * Resend HTTP implementation of the email provider contract defined in
 * ./provider.ts. Exports `send(params)` only; the public entrypoint is
 * `sendEmail` from `./provider`.
 */
import type { SendEmailParams, SendEmailResult } from './provider.js';

export async function send(params: SendEmailParams): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      '[email:resend] invariant: RESEND_API_KEY missing after provider validation',
    );
  }
  const from = process.env.RESEND_FROM ?? 'BrightTale <noreply@brighttale.io>';

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        reply_to: params.replyTo,
      }),
    });
  } catch (err) {
    throw new Error(
      `[email:resend] Network error: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[email:resend] HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { id: string };
  return { id: json.id, provider: 'resend' };
}
```

This removes: `SendEmailParams`/`SendEmailResult` type exports, `sendEmail` function, `isResendConfigured`, `sendContentPublishedEmail`, `sendCreditsLowEmail`, and the `send = sendEmail` alias (no longer needed — the `send` export is now the primary).

## Task 12: Create templates.ts

**Files:**
- Create: `apps/api/src/lib/email/templates.ts`

- [ ] **Step 1: Move templates**

Create `apps/api/src/lib/email/templates.ts`:

```ts
/**
 * Pre-built transactional templates for cross-cutting product flows. Each
 * function renders HTML + subject and dispatches via the provider abstraction.
 * Domain-specific templates (e.g., affiliate application emails) live with
 * the domain (apps/api/src/lib/affiliate/email-service.ts).
 */
import { sendEmail, type SendEmailResult } from './provider.js';

export async function sendContentPublishedEmail(
  to: string,
  title: string,
  url: string,
): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: `✅ Publicado: ${title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2DD4A8;">Seu conteúdo tá no ar</h2>
        <p>O post <strong>${title}</strong> foi publicado com sucesso.</p>
        <p><a href="${url}" style="display: inline-block; padding: 10px 20px; background: #2DD4A8; color: white; text-decoration: none; border-radius: 6px;">Ver no site</a></p>
        <p style="color: #666; font-size: 12px;">BrightTale · Content Automation</p>
      </div>
    `,
  });
}

export async function sendCreditsLowEmail(
  to: string,
  remaining: number,
  total: number,
): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: `⚠️ Créditos acabando (${remaining} restantes)`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #f59e0b;">Créditos BrightTale acabando</h2>
        <p>Você já usou ${((1 - remaining / total) * 100).toFixed(0)}% dos créditos do mês.</p>
        <p>Restam <strong>${remaining.toLocaleString('pt-BR')} / ${total.toLocaleString('pt-BR')}</strong>.</p>
        <p><a href="${process.env.APP_ORIGIN ?? 'https://app.brighttale.io'}/settings/billing">Fazer upgrade ou comprar créditos</a></p>
      </div>
    `,
  });
}
```

## Task 13: resend.test.ts

**Files:**
- Create: `apps/api/src/lib/email/__tests__/resend.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/lib/email/__tests__/resend.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { send } from '../resend';

describe('email/resend', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_abc';
    delete process.env.RESEND_FROM;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  it('sends with correct URL, headers, body', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'r_1' }), { status: 200 }));
    const res = await send({ to: 'a@b.com', subject: 'hello', html: '<b>hi</b>' });
    expect(res).toEqual({ id: 'r_1', provider: 'resend' });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_abc',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      from: 'BrightTale <noreply@brighttale.io>',
      to: ['a@b.com'],
      subject: 'hello',
      html: '<b>hi</b>',
    });
  });

  it('maps replyTo → reply_to key', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'r' }), { status: 200 }));
    await send({ to: 'a@b.com', subject: 's', replyTo: 'r@x.com' });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.reply_to).toBe('r@x.com');
    expect(body.replyTo).toBeUndefined();
  });

  it('passes through array to as array', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'r' }), { status: 200 }));
    await send({ to: ['a@b.com', 'c@d.com'], subject: 's' });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.to).toEqual(['a@b.com', 'c@d.com']);
  });

  it('applies RESEND_FROM env when set', async () => {
    process.env.RESEND_FROM = 'Custom <custom@x.com>';
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'r' }), { status: 200 }));
    await send({ to: 'a@b.com', subject: 's' });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.from).toBe('Custom <custom@x.com>');
  });

  it('throws on HTTP 4xx with truncated body', async () => {
    const longBody = 'x'.repeat(500);
    fetchSpy.mockResolvedValue(new Response(longBody, { status: 429 }));
    await expect(send({ to: 'a@b.com', subject: 's' })).rejects.toThrow(/Resend 429.*x{200}$/);
  });

  it('throws on HTTP 5xx', async () => {
    fetchSpy.mockResolvedValue(new Response('server error', { status: 503 }));
    await expect(send({ to: 'a@b.com', subject: 's' })).rejects.toThrow(/Resend 503/);
  });

  it('wraps network errors with Error.cause', async () => {
    const netErr = new TypeError('fetch failed');
    fetchSpy.mockRejectedValue(netErr);
    try {
      await send({ to: 'a@b.com', subject: 's' });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as Error).message).toMatch(/\[email:resend\] Network error:/);
      expect((err as Error & { cause?: unknown }).cause).toBe(netErr);
    }
  });

  it('invariant throw when RESEND_API_KEY missing', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(send({ to: 'a@b.com', subject: 's' })).rejects.toThrow(/invariant/);
  });
});
```

- [ ] **Step 2: Run**

Run from `apps/api/`: `npx vitest run src/lib/email/__tests__/resend.test.ts`

Expected: 8 tests pass.

## Task 14: templates.test.ts

**Files:**
- Create: `apps/api/src/lib/email/__tests__/templates.test.ts`

- [ ] **Step 1: Write test**

Create `apps/api/src/lib/email/__tests__/templates.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/email/provider', () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: 'x', provider: 'none' }),
}));

import * as provider from '@/lib/email/provider';
import { sendContentPublishedEmail, sendCreditsLowEmail } from '../templates';

describe('email/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.APP_ORIGIN;
  });

  it('sendContentPublishedEmail subject contains title', async () => {
    await sendContentPublishedEmail('a@b.com', 'My Post', 'https://x.com/p');
    expect(provider.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'a@b.com',
      subject: expect.stringContaining('My Post'),
    }));
  });

  it('sendContentPublishedEmail HTML includes the url verbatim (no escape at template layer)', async () => {
    const url = 'https://x.com/p?a=<script>';
    await sendContentPublishedEmail('a@b.com', 'title', url);
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0];
    expect(arg.html).toContain(url);
  });

  it('sendCreditsLowEmail renders percentage correctly (0%, 50%, 100%)', async () => {
    await sendCreditsLowEmail('a@b.com', 1000, 1000);
    let arg = vi.mocked(provider.sendEmail).mock.calls[0][0];
    expect(arg.html).toContain('0%');

    vi.clearAllMocks();
    await sendCreditsLowEmail('a@b.com', 500, 1000);
    arg = vi.mocked(provider.sendEmail).mock.calls[0][0];
    expect(arg.html).toContain('50%');

    vi.clearAllMocks();
    await sendCreditsLowEmail('a@b.com', 0, 1000);
    arg = vi.mocked(provider.sendEmail).mock.calls[0][0];
    expect(arg.html).toContain('100%');
  });

  it('sendCreditsLowEmail uses APP_ORIGIN when set', async () => {
    process.env.APP_ORIGIN = 'https://staging.brighttale.io';
    await sendCreditsLowEmail('a@b.com', 100, 1000);
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0];
    expect(arg.html).toContain('https://staging.brighttale.io/settings/billing');
  });

  it('both pass through to sendEmail (single call each)', async () => {
    await sendContentPublishedEmail('a@b.com', 't', 'https://x');
    await sendCreditsLowEmail('a@b.com', 1, 10);
    expect(provider.sendEmail).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run**

Run from `apps/api/`: `npx vitest run src/lib/email/__tests__/templates.test.ts`

Expected: 5 tests pass.

## Task 15: Update affiliate/email-service.ts

**Files:**
- Modify: `apps/api/src/lib/affiliate/email-service.ts`

- [ ] **Step 1: Change import + remove guards**

Edit `apps/api/src/lib/affiliate/email-service.ts`:

1. Change the import line (currently line 2):
   ```ts
   import { sendEmail, isResendConfigured } from '@/lib/email/resend'
   ```
   to:
   ```ts
   import { sendEmail } from '@/lib/email/provider'
   ```

2. Grep the file for `isResendConfigured()` — you should find exactly 4 occurrences, each on its own line as `if (!isResendConfigured()) return`, each at the top of one of the four `async send*` methods on the `ResendAffiliateEmailService` class. Remove all 4 lines entirely. The `await sendEmail({...})` that follows in each method remains unchanged.

Line numbers to expect (subject to minor drift if file changed): approximately 32, 41, 53, 68 in the current version. Use grep to find actual positions if they've shifted.

After these edits: zero references to `isResendConfigured` anywhere in `apps/api/src/lib/affiliate/email-service.ts`. The four methods call `sendEmail` unconditionally. Silent-skip behavior is now governed by `EMAIL_PROVIDER=none` set in env.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: 4 workspaces green. If `isResendConfigured` is still referenced somewhere (shouldn't be — grep-verified in spec), fix now.

## Task 16: Update affiliate/email-service.test.ts

**Files:**
- Modify: `apps/api/src/__tests__/lib/affiliate/email-service.test.ts`

- [ ] **Step 1: Replace file contents**

Replace the full contents of `apps/api/src/__tests__/lib/affiliate/email-service.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

vi.mock('@/lib/email/provider', () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: 'p1', provider: 'none' }),
}))

import * as provider from '@/lib/email/provider'
import { ResendAffiliateEmailService } from '@/lib/affiliate/email-service'

describe('ResendAffiliateEmailService', () => {
  const svc = new ResendAffiliateEmailService()
  const originalAdminEmail = process.env.AFFILIATE_ADMIN_EMAIL

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AFFILIATE_ADMIN_EMAIL = 'admin@brighttale.test'
  })

  afterAll(() => {
    if (originalAdminEmail === undefined) {
      delete process.env.AFFILIATE_ADMIN_EMAIL
    } else {
      process.env.AFFILIATE_ADMIN_EMAIL = originalAdminEmail
    }
  })

  it('sendAffiliateApplicationReceivedAdmin sends to AFFILIATE_ADMIN_EMAIL', async () => {
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: 'Maria', email: 'maria@example.com',
      channelPlatform: 'youtube', channelUrl: 'https://youtube.com/maria',
    })
    expect(provider.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@brighttale.test',
      subject: expect.stringContaining('Maria'),
    }))
  })

  it('escapes HTML in user-controlled fields (XSS guard)', async () => {
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: '<script>alert(1)</script>', email: 'x@y.com',
      channelPlatform: 'youtube', channelUrl: 'https://y.com',
    })
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0]
    expect(arg.html).not.toContain('<script>')
    expect(arg.html).toContain('&lt;script&gt;')
  })

  it('rewrites javascript: URLs to # in href', async () => {
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: 'X', email: 'x@y.com',
      channelPlatform: 'web', channelUrl: 'javascript:alert(1)',
    })
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0]
    expect(arg.html).toContain('href="#"')
  })

  it('sendAffiliateApprovalEmail includes tier + commission percent', async () => {
    await svc.sendAffiliateApprovalEmail('joao@x.com', 'João', 'nano', 0.15, 'https://app.com')
    expect(provider.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'joao@x.com',
      html: expect.stringContaining('15%'),
    }))
  })

  it('sendAffiliateContractProposalEmail includes both currentRate AND proposedRate as percentages', async () => {
    await svc.sendAffiliateContractProposalEmail(
      'pedro@x.com', 'Pedro',
      'nano', 0.15,
      'micro', 0.20,
      'https://app.com/portal',
      'upgrade offer',
    )
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0]
    expect(arg.to).toBe('pedro@x.com')
    expect(arg.html).toContain('15%')
    expect(arg.html).toContain('20%')
    expect(arg.html).toContain('Pedro')
  })

  it('sendAffiliateApprovalEmail body includes recipient name', async () => {
    await svc.sendAffiliateApprovalEmail('joao@x.com', 'João Silva', 'nano', 0.15, 'https://app.com')
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0]
    expect(arg.html).toContain('João Silva')
  })

  it('safeUrl rejects vbscript: and data: schemes (rendered as #)', async () => {
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: 'X', email: 'x@y.com',
      channelPlatform: 'web', channelUrl: 'vbscript:msgbox(1)',
    })
    let arg = vi.mocked(provider.sendEmail).mock.calls[0][0]
    expect(arg.html).toContain('href="#"')
    expect(arg.html).not.toContain('href="vbscript:')

    vi.clearAllMocks()
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: 'X', email: 'x@y.com',
      channelPlatform: 'web', channelUrl: 'data:text/html,<script>alert(1)</script>',
    })
    arg = vi.mocked(provider.sendEmail).mock.calls[0][0]
    expect(arg.html).toContain('href="#"')
    expect(arg.html).not.toContain('href="data:')
  })
})
```

Removed compared to original:
- `isResendConfigured` mock setup (3 occurrences)
- "returns early when Resend not configured" test
- "short-circuits when Resend is not configured" it.each test

Rationale: the silent-skip semantic no longer exists at this layer. EMAIL_PROVIDER=none dispatch is tested in `provider.test.ts` (end-to-end, no mock).

- [ ] **Step 2: Run**

Run from `apps/api/`: `npx vitest run src/__tests__/lib/affiliate/email-service.test.ts`

Expected: 7 tests pass (was 9 before; the 2 short-circuit tests removed).

## Task 17a: Doc drift — .env.example

**Files:**
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Replace email section**

Edit `apps/api/.env.example`. The current email block is at:
- **Lines 73–75**: active `RESEND_API_KEY=` and `RESEND_FROM="BrightTale <noreply@brighttale.io>"`
- **Line 92**: commented reference `#   - Email service no-ops via isResendConfigured() guard`

Replace the active block at lines 73–75 (and remove the comment at line 92 that references the now-removed `isResendConfigured()` pattern) with:

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

Preserve all other sections of `.env.example` unchanged.

- [ ] **Step 2: Verify grep of isResendConfigured in env file**

Run: Grep for `isResendConfigured` in `apps/api/.env.example`.

Expected: zero matches.

## Task 17b: Doc drift — affiliate 2A spec errata

**Files:**
- Modify: `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`

- [ ] **Step 1: Insert errata block at top**

Open `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`. Insert this block directly after the first-line `# ...` title (before `## 1. Context & Goals` or whichever is the first section):

```markdown
> **Errata — 2026-04-17 post-publication:** The `isResendConfigured()` silent-skip
> pattern and the `@/lib/email/resend` import paths referenced throughout this
> document (§3, §4, §5, §6, Appendix A.3) were superseded by the email provider
> abstraction (sub-project 0 of the affiliate migration). See
> `docs/superpowers/specs/2026-04-17-email-provider-abstraction-design.md`.
> Inline text is preserved as historical record.
```

Do not modify any other section.

## Task 17c: Doc drift — affiliate 2A plan errata

**Files:**
- Modify: `docs/superpowers/plans/2026-04-17-affiliate-2a-foundation.md`

- [ ] **Step 1: Insert identical errata block at top**

Same approach as 17b. Insert the errata block directly after the first-line `# ...` title. Do not modify inline task mocks that still reference `isResendConfigured` — the errata at top covers it.

## Task 17d: Doc drift — phase-5-publishing milestone

**Files:**
- Modify: `apps/docs-site/src/content/milestones/phase-5-publishing/index.md`

- [ ] **Step 1: Update template import paths only**

Open `apps/docs-site/src/content/milestones/phase-5-publishing/index.md`. Find any lines mentioning:
- `sendContentPublishedEmail(to, title, url)`
- `sendCreditsLowEmail(to, remaining, total)`
- `@/lib/email/resend` as the import path for the above

Update the import path references from `@/lib/email/resend` to `@/lib/email/templates`. Leave the function signatures, descriptions, and prose unchanged — this is a live doc, not historical record; update precisely and move on.

## Task 18: Verify draft_idea_id.sql idempotency (no-op — already applied)

**Files:**
- Read-only verification: `supabase/migrations/20260414060000_draft_idea_id.sql`

**Status:** The "side-fix" referenced in the PR #4 resume prompt appears to have already been applied in a prior commit. The current file uses `ADD COLUMN IF NOT EXISTS` on the four `ALTER TABLE` statements (lines 4–7), `CREATE INDEX IF NOT EXISTS` on the indexes (lines 9–12), and a `DO $$ ... IF EXISTS ... END $$` guard around the backfill `UPDATE` block (lines 19–55) that only fires when the dev-only `stages.idea_archive_id` column exists.

- [ ] **Step 1: Confirm file is already idempotent**

Read `supabase/migrations/20260414060000_draft_idea_id.sql`. Verify these patterns are present:
- All `ALTER TABLE ... ADD COLUMN` use `IF NOT EXISTS`
- All `CREATE INDEX` use `IF NOT EXISTS`
- The backfill `UPDATE` block is wrapped in `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE ...) THEN ... END IF; END $$`

If all three patterns are present → no changes needed. Proceed to Step 2.

If any pattern is absent (unexpected — file was previously fixed), apply the pattern transformations: `ADD COLUMN` → `ADD COLUMN IF NOT EXISTS`; `CREATE INDEX` → `CREATE INDEX IF NOT EXISTS`; bare `ALTER TABLE ADD CONSTRAINT` → `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '<name>') THEN ALTER TABLE ... END IF; END $$;`.

- [ ] **Step 2: Smoke-test idempotency (optional if local Supabase unavailable)**

Run from repo root if local Supabase is running:
```bash
npm run db:reset        # clean apply
# re-apply same migration via psql or db:push to verify idempotent:
# (skipped if db:reset is not feasible — the file-pattern check in Step 1 is sufficient)
```

**Key change vs original plan:** this task is now verification-only. The side-fix was applied in a prior commit; no modification needed. Commit B proceeds without touching this file.

## Task 19: Commit B verification + commit

- [ ] **Step 1: Full sweep**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck
```
Expected: 4 workspaces green.

```bash
cd apps/api && npm test
```
Expected: ~882 tests pass (850+ existing + ~37 new).

```bash
cd ../.. && npm run email:start
cd apps/api && npm run test:integration
```
Expected: 4 integration tests pass.

```bash
cd ../.. && npm run email:stop
```

```bash
cd apps/api && npm run test:coverage
```
Expected: coverage thresholds met for `src/lib/email/provider.ts`, `resend.ts`, `smtp.ts`, `noop.ts` (≥95% branch; noop.ts 100%). `templates.ts` excluded.

- [ ] **Step 2: Manual spot-check**

Start local MailHog and API with SMTP provider:

```bash
npm run email:start
cd apps/api
EMAIL_PROVIDER=smtp \
  SMTP_HOST=localhost \
  SMTP_PORT=1025 \
  SMTP_FROM=dev@brighttale.local \
  AFFILIATE_ADMIN_EMAIL=admin@brighttale.local \
  npm run dev
```

Trigger affiliate apply flow via the app (or curl `/api/affiliate/apply`). Open `http://localhost:8025`. Confirm the admin notification email appears in MailHog with correct subject, from, to, and body.

Stop both processes after verification.

- [ ] **Step 3: Verify diff scope**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale && git status
```

Expected files modified/created in Commit B:
- `apps/api/src/lib/email/resend.ts` (refactor)
- `apps/api/src/lib/email/templates.ts` (new)
- `apps/api/src/lib/email/__tests__/resend.test.ts` (new)
- `apps/api/src/lib/email/__tests__/templates.test.ts` (new)
- `apps/api/src/lib/affiliate/email-service.ts` (import + guards)
- `apps/api/src/__tests__/lib/affiliate/email-service.test.ts` (full rewrite)
- `apps/api/.env.example`
- `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`
- `docs/superpowers/plans/2026-04-17-affiliate-2a-foundation.md`
- `apps/docs-site/src/content/milestones/phase-5-publishing/index.md`
- `supabase/migrations/20260414060000_draft_idea_id.sql`

- [ ] **Step 4: Grep for leftover `isResendConfigured`**

Run from repo root:

```bash
grep -r "isResendConfigured" apps/api/src/ || echo "zero matches — clean"
```

Expected: exactly "zero matches — clean". Docs (spec/plan errata notes) and the inline-task examples in the 2A plan may still contain the term — that's expected and intentional.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/src/lib/email/resend.ts \
  apps/api/src/lib/email/templates.ts \
  apps/api/src/lib/email/__tests__/resend.test.ts \
  apps/api/src/lib/email/__tests__/templates.test.ts \
  apps/api/src/lib/affiliate/email-service.ts \
  apps/api/src/__tests__/lib/affiliate/email-service.test.ts \
  apps/api/.env.example \
  docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md \
  docs/superpowers/plans/2026-04-17-affiliate-2a-foundation.md \
  apps/docs-site/src/content/milestones/phase-5-publishing/index.md \
  supabase/migrations/20260414060000_draft_idea_id.sql

git commit -m "$(cat <<'EOF'
feat(api): email provider abstraction (Commit B — refactor + migrate consumer)

Atomic semantic change completing the email provider abstraction started
in Commit A:
- Refactor resend.ts: sole export is send(params). Removed: sendEmail,
  isResendConfigured, sendContentPublishedEmail, sendCreditsLowEmail, and
  SendEmailParams/SendEmailResult type re-exports (types live in provider.ts only)
- New templates.ts houses the moved cross-cutting templates
- affiliate/email-service.ts: import path → @/lib/email/provider; all 4
  isResendConfigured() silent-skip guards removed — that semantic is now
  governed by EMAIL_PROVIDER=none
- Test file updated accordingly: mock target switched; 2 short-circuit
  tests removed (semantic no longer applies)
- Doc drift reconciled: .env.example new Email section; affiliate 2A
  spec + plan get errata notes at top; phase-5-publishing doc import paths
- Side-fix (orphan from PR #4 resume prompt): draft_idea_id.sql migration
  made idempotent via IF NOT EXISTS and DO/EXISTS guards

Verified: typecheck + full test suite + integration + coverage thresholds
+ manual spot-check via MailHog UI.

Spec: docs/superpowers/specs/2026-04-17-email-provider-abstraction-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Verify**

```bash
git log -2 --oneline
```

Expected: two commits forming Commit A + Commit B pair.

```bash
cd apps/api && npm test && cd ../..
```

Expected: full green.

---

## Done Criteria Checklist

- [ ] Typecheck green across 4 workspaces
- [ ] Unit tests: 850+ existing + ~37 new = ~887 total
- [ ] Integration tests: 4 passing via MailHog
- [ ] `EMAIL_PROVIDER=none npm test` green (silent mode confirmed)
- [ ] `npm run test:coverage` meets thresholds (≥95% branch on provider/resend/smtp/noop)
- [ ] Manual spot-check via MailHog UI passed
- [ ] Zero `isResendConfigured` in `apps/api/src/**`
- [ ] Doc drift reconciled in 4 locations
- [ ] Side-fix `draft_idea_id.sql` idempotent
- [ ] Diff total ~600–800 LOC
- [ ] Vitest split functional
- [ ] Two commits (A additive + B atomic) with descriptive messages
