# Fastify Foundation (SP1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `apps/api` Next.js 16 with a Fastify 4.x standalone server, wire up `@tn-figueiredo/auth-fastify` for user auth, and add `user_id` to 13 database tables.

**Architecture:** Raw Fastify instance built in `src/server.ts`, started in `src/index.ts`. CORS and cookie plugins registered via `@fastify/cors` / `@fastify/cookie`. Auth routes delegated to `registerAuthRoutes()` from the ecosystem. Lib code in `src/lib/` is unchanged.

**Tech Stack:** Fastify 4.x, `@fastify/cors`, `@fastify/cookie`, `@tn-figueiredo/auth-fastify@1.1.0`, `@tn-figueiredo/auth-supabase@1.1.0`, `@tn-figueiredo/auth@1.2.1`, `tsx` (dev runner), Vitest (tests), Supabase PostgreSQL.

---

## File Map

| Status | File | Role |
|--------|------|------|
| **Create** | `apps/api/src/server.ts` | Fastify instance factory: registers plugins + routes |
| **Create** | `apps/api/src/index.ts` | Entry point: calls `buildServer()` → `.listen(3001)` |
| **Create** | `apps/api/src/routes/health.ts` | `GET /health` → `{ status: 'ok', timestamp }` |
| **Create** | `apps/api/src/routes/auth.ts` | Wires `registerAuthRoutes()` + `onPostSignUp` hook |
| **Create** | `apps/api/src/__tests__/health.test.ts` | Health route unit tests |
| **Create** | `apps/api/src/__tests__/auth.test.ts` | Auth route HTTP smoke tests |
| **Create** | `supabase/migrations/<ts>_user_profiles.sql` | Migration A: `user_profiles` table |
| **Create** | `supabase/migrations/<ts>_user_id_columns.sql` | Migration B: `user_id` on 13 tables + indexes + trigger |
| **Modify** | `apps/api/package.json` | Remove next/react/react-dom/server-only; add fastify + ecosystem; update scripts |
| **Modify** | `apps/api/tsconfig.json` | Remove Next plugin; exclude `src/app/**`; remove `.next` references |
| **Modify** | `apps/api/vitest.config.ts` | Remove `server-only` alias; add `src/app/**` exclude |
| **Modify** | `apps/api/src/lib/supabase/index.ts` | Remove `import 'server-only'` (line 1) |
| **Delete** | `apps/api/next.config.ts` | Next.js server config — replaced by Fastify |
| **Delete** | `apps/api/next-env.d.ts` | Next.js generated type file |
| **Delete** | `apps/api/src/middleware.ts` | Next.js middleware — not needed in Fastify |
| **Delete** | `apps/api/src/app/layout.tsx` | Next.js App Router shell |
| **Delete** | `apps/api/src/app/page.tsx` | Next.js App Router shell |
| **Delete** | `apps/api/src/app/api/projects/bulk/__tests__/change_status.test.ts` | Imports Next.js; rewritten in SP2 |
| **Delete** | `apps/api/src/app/api/projects/bulk/__tests__/export.test.ts` | Imports Next.js; rewritten in SP2 |
| **Delete** | `apps/api/src/app/api/projects/bulk-create/__tests__/route.test.ts` | Imports Next.js; rewritten in SP2 |
| **Delete** | `apps/api/src/app/api/export/jobs/__tests__/job.test.ts` | Imports Next.js; rewritten in SP2 |

> **Note:** The 61 route handlers in `src/app/api/**` are left in place — dead code until SP2 rewrites them as Fastify routes. The tsconfig and vitest excludes below prevent tsc and vitest from trying to compile/run them.

---

## Confirmed API facts (auth-fastify@1.1.0)

Verified from reading the package source — trust these over the spec where they differ:

| Fact | Source |
|------|--------|
| `signUpSchema` requires `ageConfirmation: z.boolean()` (not optional) | `index.js:36` |
| `handleSignUp` returns HTTP **200** (not 201), body `{ success: true, data: result }` | `index.js:200` |
| `handleSignIn` returns HTTP **200**, body `{ success: true, data: { user, session } }` — **no cookies** | `index.js:~220` |
| Spec's "cookie HttpOnly" description is **incorrect** | confirmed |
| `onPostSignUp` fires on email signup with `{ userId, email, user, requiresEmailVerification }` | `index.js:~190` |
| `onPostAuthenticate` fires on signin (email, social, refresh), not signup | `index.js:~220` |
| Auth middleware reads `Authorization: Bearer <token>` header | `index.js:~310` |
| 401 without token: `{ success: false, error: "No token provided" }` | `index.js:~320` |
| 401 with bad token: `{ success: false, error: "Token validation error" }` | `index.js:~330` |

---

## Task 1: Migration A — `user_profiles` table

**Files:**
- Create: `supabase/migrations/<generated-timestamp>_user_profiles.sql`

> `handle_updated_at()` function already exists in `00000000000000_initial_schema.sql:10`. No need to recreate it.

All commands run from the **repo root** (`/path/to/bright-tale`).

- [ ] **Step 1: Generate the migration file**

```bash
supabase migration new user_profiles
```

Output: `Created new migration at supabase/migrations/<timestamp>_user_profiles.sql`. Open that file.

- [ ] **Step 2: Write the migration SQL**

Replace the empty file content with:

```sql
-- Migration A: user_profiles table
-- Linked to auth.users — stores display name and avatar for each registered user.
-- handle_updated_at() already defined in 00000000000000_initial_schema.sql.

create table public.user_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name  text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.handle_updated_at();

alter table public.user_profiles enable row level security;
```

- [ ] **Step 3: Verify migration applies cleanly**

```bash
npm run db:reset
```

Expected output includes `Applying migration <timestamp>_user_profiles.sql...` with no errors. Check Supabase Studio at `http://localhost:54323` → Table Editor → confirm `user_profiles` table exists.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): add user_profiles table (Migration A)"
```

---

## Task 2: Migration B — `user_id` on 13 tables

**Files:**
- Create: `supabase/migrations/<generated-timestamp>_user_id_columns.sql`

- [ ] **Step 1: Generate the migration file**

```bash
supabase migration new user_id_columns
```

- [ ] **Step 2: Verify table names exist**

Before writing the SQL, confirm the exact table names match the schema:

```bash
grep "^create table" supabase/migrations/00000000000000_initial_schema.sql
```

Expected to see tables including: `research_archives`, `projects`, `idea_archives`, `templates`, `wordpress_configs`, `ai_provider_configs`, `image_generator_configs`, `blog_drafts`, `video_drafts`, `shorts_drafts`, `podcast_drafts`, `assets`, `canonical_core`. If any name differs from what appears in the migration SQL below, adjust accordingly.

- [ ] **Step 3: Write the migration SQL**

```sql
-- Migration B: add user_id to 13 content tables.
-- Nullable — dev uses db:reset so no backfill needed.
-- NOT NULL constraint added in SP2 after first routes are migrated.

-- ─── set_user_id trigger function ─────────────────────────────────────────────
-- Defense-in-depth: if API somehow omits user_id, fallback to auth.uid().
create or replace function public.set_user_id()
returns trigger language plpgsql security definer as $$
begin
  if new.user_id is null then
    new.user_id = auth.uid();
  end if;
  return new;
end;
$$;

-- ─── research_archives ────────────────────────────────────────────────────────
alter table public.research_archives
  add column user_id uuid references auth.users(id);
create index idx_research_archives_user_id on public.research_archives(user_id);
create trigger trg_research_archives_user_id
  before insert on public.research_archives
  for each row execute function public.set_user_id();

-- ─── projects ─────────────────────────────────────────────────────────────────
alter table public.projects
  add column user_id uuid references auth.users(id);
create index idx_projects_user_id     on public.projects(user_id);
create index idx_projects_user_status on public.projects(user_id, status);
create trigger trg_projects_user_id
  before insert on public.projects
  for each row execute function public.set_user_id();

-- ─── idea_archives ────────────────────────────────────────────────────────────
alter table public.idea_archives
  add column user_id uuid references auth.users(id);
create index idx_idea_archives_user_id on public.idea_archives(user_id);
create trigger trg_idea_archives_user_id
  before insert on public.idea_archives
  for each row execute function public.set_user_id();

-- ─── templates ────────────────────────────────────────────────────────────────
alter table public.templates
  add column user_id uuid references auth.users(id);
create index idx_templates_user_id on public.templates(user_id);
create trigger trg_templates_user_id
  before insert on public.templates
  for each row execute function public.set_user_id();

-- ─── wordpress_configs ────────────────────────────────────────────────────────
alter table public.wordpress_configs
  add column user_id uuid references auth.users(id);
create index idx_wordpress_configs_user_id on public.wordpress_configs(user_id);
create trigger trg_wordpress_configs_user_id
  before insert on public.wordpress_configs
  for each row execute function public.set_user_id();

-- ─── ai_provider_configs ──────────────────────────────────────────────────────
alter table public.ai_provider_configs
  add column user_id uuid references auth.users(id);
create index idx_ai_provider_configs_user_id on public.ai_provider_configs(user_id);
create trigger trg_ai_provider_configs_user_id
  before insert on public.ai_provider_configs
  for each row execute function public.set_user_id();

-- ─── image_generator_configs ──────────────────────────────────────────────────
alter table public.image_generator_configs
  add column user_id uuid references auth.users(id);
create index idx_image_generator_configs_user_id on public.image_generator_configs(user_id);
create trigger trg_image_generator_configs_user_id
  before insert on public.image_generator_configs
  for each row execute function public.set_user_id();

-- ─── blog_drafts ──────────────────────────────────────────────────────────────
alter table public.blog_drafts
  add column user_id uuid references auth.users(id);
create index idx_blog_drafts_user_id     on public.blog_drafts(user_id);
create index idx_blog_drafts_user_status on public.blog_drafts(user_id, status);
create trigger trg_blog_drafts_user_id
  before insert on public.blog_drafts
  for each row execute function public.set_user_id();

-- ─── video_drafts ─────────────────────────────────────────────────────────────
alter table public.video_drafts
  add column user_id uuid references auth.users(id);
create index idx_video_drafts_user_id     on public.video_drafts(user_id);
create index idx_video_drafts_user_status on public.video_drafts(user_id, status);
create trigger trg_video_drafts_user_id
  before insert on public.video_drafts
  for each row execute function public.set_user_id();

-- ─── shorts_drafts ────────────────────────────────────────────────────────────
alter table public.shorts_drafts
  add column user_id uuid references auth.users(id);
create index idx_shorts_drafts_user_id on public.shorts_drafts(user_id);
create trigger trg_shorts_drafts_user_id
  before insert on public.shorts_drafts
  for each row execute function public.set_user_id();

-- ─── podcast_drafts ───────────────────────────────────────────────────────────
alter table public.podcast_drafts
  add column user_id uuid references auth.users(id);
create index idx_podcast_drafts_user_id on public.podcast_drafts(user_id);
create trigger trg_podcast_drafts_user_id
  before insert on public.podcast_drafts
  for each row execute function public.set_user_id();

-- ─── assets ───────────────────────────────────────────────────────────────────
alter table public.assets
  add column user_id uuid references auth.users(id);
create index idx_assets_user_id on public.assets(user_id);
create trigger trg_assets_user_id
  before insert on public.assets
  for each row execute function public.set_user_id();

-- ─── canonical_core ───────────────────────────────────────────────────────────
alter table public.canonical_core
  add column user_id uuid references auth.users(id);
create index idx_canonical_core_user_id on public.canonical_core(user_id);
create trigger trg_canonical_core_user_id
  before insert on public.canonical_core
  for each row execute function public.set_user_id();
```

- [ ] **Step 4: Apply and verify**

```bash
npm run db:reset
```

Expected: both migrations apply with no errors. In Supabase Studio → Table Editor → `projects`: confirm a `user_id` column exists (type: `uuid`, nullable).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): add user_id to 13 tables + set_user_id trigger (Migration B)"
```

---

## Task 3: Swap `apps/api/package.json` — remove Next.js, add Fastify

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Replace package.json content**

```json
{
  "name": "@brighttale/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --noEmit",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --reporter verbose",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.72.1",
    "@brighttale/shared": "*",
    "@fastify/cookie": "^9.4.0",
    "@fastify/cors": "^9.0.1",
    "@google/genai": "^1.49.0",
    "@supabase/supabase-js": "^2.45.0",
    "@tn-figueiredo/auth": "1.2.1",
    "@tn-figueiredo/auth-fastify": "1.1.0",
    "@tn-figueiredo/auth-supabase": "1.1.0",
    "@types/archiver": "^7.0.0",
    "archiver": "^7.0.1",
    "date-fns": "^4.1.0",
    "fastify": "^4.28.1",
    "js-yaml": "^4.1.1",
    "marked": "^17.0.1",
    "openai": "^6.17.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20",
    "tsx": "^4.21.0",
    "typescript": "^5.6.0",
    "vitest": "^4.0.18"
  }
}
```

> **Removed:** `next`, `react`, `react-dom`, `server-only`, `@types/react`, `@types/react-dom`.
> **Added:** `fastify`, `@fastify/cookie`, `@fastify/cors`, `@tn-figueiredo/auth`, `@tn-figueiredo/auth-fastify`, `@tn-figueiredo/auth-supabase`.
> `@tn-figueiredo/*` are pinned to exact versions (no `^`) per ecosystem policy.
> `fastify` and `@fastify/*` use `^` (not ecosystem packages).

- [ ] **Step 2: Install from the repo root**

```bash
npm install
```

> **Always run `npm install` from the repo root**, not from `apps/api/`. npm workspaces hoists all packages to the root `node_modules/`. Running install from a workspace subfolder can corrupt workspace resolution.

Expected: installs without errors. `node_modules/next/` at the repo root disappears. `node_modules/fastify/` appears.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json package-lock.json
git commit -m "chore(api): swap Next.js for Fastify 4.x + install auth-fastify ecosystem"
```

---

## Task 4: Remove Next.js artifacts + fix tsconfig and vitest config

**Files:**
- Delete: `apps/api/next.config.ts`
- Delete: `apps/api/next-env.d.ts`
- Delete: `apps/api/src/middleware.ts`
- Delete: `apps/api/src/app/layout.tsx`
- Delete: `apps/api/src/app/page.tsx`
- Delete: `apps/api/src/app/api/projects/bulk/__tests__/change_status.test.ts`
- Delete: `apps/api/src/app/api/projects/bulk/__tests__/export.test.ts`
- Delete: `apps/api/src/app/api/projects/bulk-create/__tests__/route.test.ts`
- Delete: `apps/api/src/app/api/export/jobs/__tests__/job.test.ts`
- Modify: `apps/api/tsconfig.json`
- Modify: `apps/api/vitest.config.ts`
- Modify: `apps/api/src/lib/supabase/index.ts`

- [ ] **Step 1: Delete Next.js-only files**

```bash
rm apps/api/next.config.ts
rm apps/api/next-env.d.ts
rm apps/api/src/middleware.ts
rm apps/api/src/app/layout.tsx
rm apps/api/src/app/page.tsx
rm apps/api/src/app/api/projects/bulk/__tests__/change_status.test.ts
rm apps/api/src/app/api/projects/bulk/__tests__/export.test.ts
rm apps/api/src/app/api/projects/bulk-create/__tests__/route.test.ts
rm apps/api/src/app/api/export/jobs/__tests__/job.test.ts
```

> The 61 route handler files under `src/app/api/**` are **not deleted** — they stay as dead code until SP2 migrates them to Fastify routes. The `tsconfig` and `vitest.config` excludes below prevent tsc and vitest from touching them.

- [ ] **Step 2: Update `apps/api/tsconfig.json`**

Replace the entire file:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@brighttale/shared": ["../../packages/shared/src"],
      "@brighttale/shared/*": ["../../packages/shared/src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "src/app/**"]
}
```

> **Key changes:**
> - Removed `"plugins": [{ "name": "next" }]` — Next.js type plugin gone.
> - Removed `"next-env.d.ts"` from `include` — file is now deleted.
> - Added `"src/app/**"` to `exclude` — prevents `tsc` from failing on the 61 route handlers that still import `next/server`. These will be migrated in SP2 and removed from the exclude list then.

- [ ] **Step 3: Update `apps/api/vitest.config.ts`**

Replace the entire file:

```typescript
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
    ],
    pool: 'forks',
  },
});
```

> **Key changes:**
> - Removed the `'server-only': path.resolve(...)` alias — package is gone.
> - Added `'src/app/**'` to `exclude` — safety net preventing vitest from picking up any test files still under `src/app/` (the 4 deleted files are gone, but exclude makes it explicit and defensive).

- [ ] **Step 4: Remove `import 'server-only'` from `apps/api/src/lib/supabase/index.ts`**

Delete only line 1 (`import 'server-only';`). The rest of the file is unchanged:

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@brighttale/shared/types/database';

// Allows tests to inject a mock client by setting this global
declare global {
  // eslint-disable-next-line no-var
  var __supabaseMock: ReturnType<typeof createClient<Database>> | undefined;
}

export function createServiceClient(): ReturnType<typeof createClient<Database>> {
  if (process.env.NODE_ENV === 'test' && global.__supabaseMock) {
    return global.__supabaseMock as ReturnType<typeof createClient<Database>>;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 5: Verify the 20 surviving lib tests still pass**

```bash
cd apps/api && npx vitest run --reporter verbose
```

Expected: 20 lib test suites pass. The 4 deleted route test files no longer appear. No failures.

- [ ] **Step 6: Verify TypeScript compiles without errors**

```bash
npm run typecheck --workspace=@brighttale/api
```

Expected: no errors. The `src/app/**` exclude prevents tsc from seeing the Next.js route handlers.

- [ ] **Step 7: Commit**

```bash
git add apps/api/
git commit -m "chore(api): remove Next.js artifacts, update tsconfig + vitest config"
```

---

## Task 5: Health route (TDD)

**Files:**
- Create: `apps/api/src/__tests__/health.test.ts`
- Create: `apps/api/src/routes/health.ts`
- Create: `apps/api/src/server.ts` ← partial (auth routes added in Task 6)
- Create: `apps/api/src/index.ts`

- [ ] **Step 1: Write the failing health test**

Create `apps/api/src/__tests__/health.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes } from '@/routes/health';

// Isolated server — no auth deps, no env vars, no CORS plugin needed.
async function buildHealthServer(): Promise<FastifyInstance> {
  const server = Fastify();
  await server.register(healthRoutes);
  return server;
}

describe('GET /health', () => {
  let server: FastifyInstance;

  afterEach(async () => {
    await server?.close();
  });

  it('returns 200 with { status: "ok" }', async () => {
    server = await buildHealthServer();
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('returns a valid ISO 8601 timestamp', async () => {
    server = await buildHealthServer();
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/health' });

    const { timestamp } = res.json<{ timestamp: string }>();
    expect(typeof timestamp).toBe('string');
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd apps/api && npx vitest run health
```

Expected: FAIL with `Cannot find module '@/routes/health'`.

- [ ] **Step 3: Create `apps/api/src/routes/health.ts`**

```typescript
import type { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}
```

- [ ] **Step 4: Create `apps/api/src/server.ts`**

CORS allowed origins match `next.config.ts` exactly:

```typescript
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import { healthRoutes } from './routes/health.js';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  process.env.APP_ORIGIN ?? 'https://app.brighttale.io',
];

export async function buildServer() {
  const fastify = Fastify({ logger: true });

  await fastify.register(fastifyCors, {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  });

  await fastify.register(fastifyCookie);

  await fastify.register(healthRoutes);
  // Auth routes registered in Task 6

  return fastify;
}
```

- [ ] **Step 5: Create `apps/api/src/index.ts`**

```typescript
import { buildServer } from './server.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const server = await buildServer();

try {
  await server.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
```

- [ ] **Step 6: Run test — confirm it passes**

```bash
cd apps/api && npx vitest run health
```

Expected:

```
✓ GET /health > returns 200 with { status: "ok" }
✓ GET /health > returns a valid ISO 8601 timestamp
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/
git commit -m "feat(api): add Fastify server skeleton + GET /health route"
```

---

## Task 6: Auth routes (TDD)

**Files:**
- Create: `apps/api/src/__tests__/auth.test.ts`
- Create: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/server.ts` (add auth routes registration)

### Background

`registerAuthRoutes()` from `@tn-figueiredo/auth-fastify` wires these endpoints:

| Method | Path | Auth required |
|--------|------|---------------|
| POST | `/auth/signup` | No |
| POST | `/auth/signin` | No |
| POST | `/auth/social` | No |
| POST | `/auth/refresh` | No |
| POST | `/auth/signout` | No |
| POST | `/auth/forgot-password` | No |
| POST | `/account/set-password` | Bearer token |
| POST | `/account/change-password` | Bearer token |
| POST | `/account/change-email` | Bearer token |
| DELETE | `/account` | Bearer token |

Response format: `{ success: true, data: ... }` or `{ success: false, error: "..." }`.
Session returned in JSON body — there are no cookies.

**`signUpSchema` requires `ageConfirmation: z.boolean()`** (confirmed from source). All signup requests must include `ageConfirmation: true`.

- [ ] **Step 1: Write the failing auth tests**

Create `apps/api/src/__tests__/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';

// =============================================================================
// MOCKS — vi.hoisted() runs before any import, so mocks are available
// throughout the file including inside vi.mock() factories.
// =============================================================================

const mockSignUpExecute = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    user: { id: 'user-uuid-123', email: 'test@brighttale.io' },
    session: null,
    requiresEmailVerification: false,
    isNewUser: true,
  }),
);

const mockAuthService = vi.hoisted(() => ({
  signUp: vi.fn(),
  signIn: vi.fn().mockResolvedValue({
    user: { id: 'user-uuid-123', email: 'test@brighttale.io' },
    session: { access_token: 'mock-jwt', refresh_token: 'mock-refresh' },
  }),
  signInWithIdToken: vi.fn(),
  refreshSession: vi.fn(),
  validateToken: vi.fn().mockRejectedValue(
    Object.assign(new Error('Invalid token'), { code: 'INVALID_TOKEN' }),
  ),
  signOut: vi.fn(),
  deleteUser: vi.fn(),
  updatePassword: vi.fn(),
  getUserProviders: vi.fn(),
  getUserById: vi.fn(),
  updateUserEmail: vi.fn(),
  verifyEmailOtp: vi.fn(),
  resendSignupConfirmation: vi.fn(),
}));

const mockUpsert = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: null, error: null }),
);

// Mock all use cases — auth-fastify constructs them and calls .execute()
vi.mock('@tn-figueiredo/auth/use-cases', () => ({
  SignUpUseCase: vi.fn().mockImplementation(() => ({ execute: mockSignUpExecute })),
  SocialSignInUseCase: vi.fn().mockImplementation(() => ({ execute: vi.fn() })),
  SetPasswordUseCase: vi.fn().mockImplementation(() => ({ execute: vi.fn() })),
  ChangePasswordUseCase: vi.fn().mockImplementation(() => ({ execute: vi.fn() })),
  ChangeEmailUseCase: vi.fn().mockImplementation(() => ({ execute: vi.fn() })),
  VerifyEmailOtpUseCase: vi.fn().mockImplementation(() => ({ execute: vi.fn() })),
  ResendSignupConfirmationUseCase: vi.fn().mockImplementation(() => ({ execute: vi.fn() })),
}));

// Mock SupabaseAuthService — constructor returns mockAuthService
vi.mock('@tn-figueiredo/auth-supabase', () => ({
  SupabaseAuthService: vi.fn().mockImplementation(() => mockAuthService),
}));

// Mock Supabase client used in the onPostSignUp hook
vi.mock('@/lib/supabase/index', () => ({
  createServiceClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
  }),
}));

// Stub env vars read inside authRoutes() at plugin registration time
vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');

// =============================================================================
// IMPORTS — must come after vi.mock() declarations
// =============================================================================

import { authRoutes } from '@/routes/auth';

// =============================================================================
// TESTS
// =============================================================================

describe('Auth routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-apply default resolved values after clearAllMocks resets mock state
    mockSignUpExecute.mockResolvedValue({
      user: { id: 'user-uuid-123', email: 'test@brighttale.io' },
      session: null,
      requiresEmailVerification: false,
      isNewUser: true,
    });
    mockAuthService.signIn.mockResolvedValue({
      user: { id: 'user-uuid-123', email: 'test@brighttale.io' },
      session: { access_token: 'mock-jwt', refresh_token: 'mock-refresh' },
    });
    mockAuthService.validateToken.mockRejectedValue(
      Object.assign(new Error('Invalid token'), { code: 'INVALID_TOKEN' }),
    );
    mockUpsert.mockResolvedValue({ data: null, error: null });

    // Create a minimal Fastify instance that mirrors server.ts registration order
    app = Fastify();
    await app.register(fastifyCookie);
    await app.register(authRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  // ── POST /auth/signup ──────────────────────────────────────────────────────

  describe('POST /auth/signup', () => {
    it('returns 400 when body is missing required fields', async () => {
      // signUpSchema requires: email, password, ageConfirmation
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
    });

    it('returns 400 when ageConfirmation is missing (required by signUpSchema)', async () => {
      // ageConfirmation: z.boolean() is NOT optional — omitting it is a 400
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email: 'test@brighttale.io', password: 'Password123!' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
    });

    it('returns 200 and user data when all required fields provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {
          email: 'test@brighttale.io',
          password: 'Password123!',
          ageConfirmation: true,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ success: boolean; data: { user: { email: string } } }>();
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe('test@brighttale.io');
    });

    it('calls onPostSignUp hook and upserts user_profiles row after signup', async () => {
      await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {
          email: 'test@brighttale.io',
          password: 'Password123!',
          ageConfirmation: true,
        },
      });

      // onPostSignUp fires fire-and-forget — wait a tick for it to settle
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockUpsert).toHaveBeenCalledWith(
        { id: 'user-uuid-123' },
        { onConflict: 'id', ignoreDuplicates: true },
      );
    });
  });

  // ── POST /auth/signin ──────────────────────────────────────────────────────

  describe('POST /auth/signin', () => {
    it('returns 200 with session in JSON body when credentials are valid', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/signin',
        payload: { email: 'test@brighttale.io', password: 'Password123!' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ success: boolean; data: { session: { access_token: string } } }>();
      expect(body.success).toBe(true);
      // auth-fastify returns session in JSON body, not in a cookie
      expect(body.data.session.access_token).toBe('mock-jwt');
    });
  });

  // ── Protected routes (Bearer token auth) ──────────────────────────────────

  describe('DELETE /account (protected route)', () => {
    it('returns 401 with "No token provided" when Authorization header is absent', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/account' });

      expect(res.statusCode).toBe(401);
      const body = res.json<{ success: boolean; error: string }>();
      expect(body.success).toBe(false);
      expect(body.error).toBe('No token provided');
    });

    it('returns 401 when Bearer token fails validateToken', async () => {
      // mockAuthService.validateToken rejects by default (set in beforeEach)
      const res = await app.inject({
        method: 'DELETE',
        url: '/account',
        headers: { authorization: 'Bearer invalid-token-xyz' },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json<{ success: boolean; error: string }>();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/token/i);
    });
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd apps/api && npx vitest run auth
```

Expected: FAIL with `Cannot find module '@/routes/auth'`.

- [ ] **Step 3: Create `apps/api/src/routes/auth.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { registerAuthRoutes } from '@tn-figueiredo/auth-fastify';
import {
  SignUpUseCase,
  SocialSignInUseCase,
  SetPasswordUseCase,
  ChangePasswordUseCase,
  ChangeEmailUseCase,
  VerifyEmailOtpUseCase,
  ResendSignupConfirmationUseCase,
} from '@tn-figueiredo/auth/use-cases';
import { SupabaseAuthService } from '@tn-figueiredo/auth-supabase';
import { createServiceClient } from '../lib/supabase/index.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const authService = new SupabaseAuthService({ supabaseUrl: url, supabaseServiceKey: key });
  const supabase = createServiceClient();

  registerAuthRoutes(fastify, {
    authService,
    signUp: new SignUpUseCase({ auth: authService }),
    socialSignIn: new SocialSignInUseCase({ auth: authService }),
    setPassword: new SetPasswordUseCase({ auth: authService }),
    changePassword: new ChangePasswordUseCase({ auth: authService }),
    changeEmail: new ChangeEmailUseCase({ auth: authService }),
    verifyOtp: new VerifyEmailOtpUseCase({ auth: authService }),
    resendOtp: new ResendSignupConfirmationUseCase({ auth: authService }),
    hooks: {
      onPostSignUp: async ({ userId }) => {
        // Create user_profiles row when a new user signs up via email/password.
        // Upsert with ignoreDuplicates: true makes this safe for email-confirm
        // resend flows (same userId, no error on second call).
        await supabase
          .from('user_profiles')
          .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });
      },
    },
  });
}
```

- [ ] **Step 4: Update `apps/api/src/server.ts` to register auth routes**

```typescript
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  process.env.APP_ORIGIN ?? 'https://app.brighttale.io',
];

export async function buildServer() {
  const fastify = Fastify({ logger: true });

  await fastify.register(fastifyCors, {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  });

  await fastify.register(fastifyCookie);

  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);

  return fastify;
}
```

> **Export job cleanup:** `src/lib/exportJobs.ts` manages an in-memory `jobs` Map that is not exported. Adding the cleanup TTL from the spec requires exporting a `cleanupExpiredJobs()` function, which would be a lib change. Since SP1 keeps lib unchanged, defer this to SP2 when that file is first modified.

- [ ] **Step 5: Run auth tests — confirm they pass**

```bash
cd apps/api && npx vitest run auth
```

Expected:

```
✓ Auth routes > POST /auth/signup > returns 400 when body is missing required fields
✓ Auth routes > POST /auth/signup > returns 400 when ageConfirmation is missing
✓ Auth routes > POST /auth/signup > returns 200 and user data when all required fields provided
✓ Auth routes > POST /auth/signup > calls onPostSignUp hook and upserts user_profiles row after signup
✓ Auth routes > POST /auth/signin > returns 200 with session in JSON body when credentials are valid
✓ Auth routes > DELETE /account (protected route) > returns 401 with "No token provided" ...
✓ Auth routes > DELETE /account (protected route) > returns 401 when Bearer token fails validateToken
```

7 tests, 0 failures.

- [ ] **Step 6: Run the full test suite**

```bash
cd apps/api && npx vitest run --reporter verbose
```

Expected: 20 lib suites + 2 new suites (health + auth) = 22 suites total. 0 failures.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/
git commit -m "feat(api): add auth routes via @tn-figueiredo/auth-fastify + user_profiles hook"
```

---

## Task 7: Final acceptance check

Manual verification of all spec acceptance criteria.

### Setup: Supabase local credentials for running the server

Before starting the server, configure `apps/api/.env`. Get the local Supabase credentials:

```bash
npm run db:status
# or: supabase status
```

Expected output includes:

```
API URL: http://localhost:54321
anon key: eyJ...
service_role key: eyJ...
```

Create or update `apps/api/.env` with:

```dotenv
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status>
INTERNAL_API_KEY=any-value-for-dev
```

> `apps/api/.env` is gitignored. Do not commit it.

- [ ] **Step 1: Reset database and start server**

```bash
# Terminal 1 — reset DB (applies all migrations from scratch)
npm run db:reset

# Terminal 2 — start API server
npm run dev:api
```

Expected in Terminal 2:

```
{"level":30,"msg":"Server listening at http://0.0.0.0:3001"}
```

- [ ] **Step 2: AC1 — health endpoint returns 200**

```bash
curl -s -w "\nHTTP %{http_code}" http://localhost:3001/health
```

Expected:

```json
{"status":"ok","timestamp":"2026-04-10T..."}
HTTP 200
```

- [ ] **Step 3: AC2 — signup creates user + profile row**

```bash
curl -s -w "\nHTTP %{http_code}" -X POST http://localhost:3001/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@brighttale.io","password":"Password123!","ageConfirmation":true}'
```

Expected:

```json
{"success":true,"data":{"user":{"id":"<uuid>","email":"smoke@brighttale.io",...},...}}
HTTP 200
```

Then verify the profile row in Supabase Studio (`http://localhost:54323`) → Table Editor → `user_profiles`: confirm a row exists with the user's UUID as `id`.

- [ ] **Step 4: AC3 — signin returns session in JSON body**

```bash
curl -s -w "\nHTTP %{http_code}" -X POST http://localhost:3001/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@brighttale.io","password":"Password123!"}'
```

Expected:

```json
{"success":true,"data":{"user":{...},"session":{"access_token":"eyJ...","refresh_token":"..."}}}
HTTP 200
```

Copy the `access_token` for Step 6.

- [ ] **Step 5: AC4 — protected route without auth returns 401**

```bash
curl -s -w "\nHTTP %{http_code}" -X DELETE http://localhost:3001/account
```

Expected:

```json
{"success":false,"error":"No token provided"}
HTTP 401
```

- [ ] **Step 6: AC4b — invalid token returns 401**

```bash
curl -s -w "\nHTTP %{http_code}" -X DELETE http://localhost:3001/account \
  -H "Authorization: Bearer invalid-token"
```

Expected:

```json
{"success":false,"error":"Token validation error"}
HTTP 401
```

- [ ] **Step 7: AC5 — db:reset with both migrations applies cleanly**

```bash
npm run db:reset
```

Expected: output shows both migration files applied without errors:

```
Applying migration <ts>_user_profiles.sql...
Applying migration <ts>_user_id_columns.sql...
Finished supabase db reset on branch main.
```

- [ ] **Step 8: AC6 — apps/app still works unchanged**

```bash
# Terminal 3
npm run dev:app
```

Open `http://localhost:3000`. The frontend loads. The rewrites in `apps/app/next.config.ts` (proxying `/api/*` to `localhost:3001`) continue to work — port 3001 unchanged.

> Note: existing frontend routes that call `INTERNAL_API_KEY`-authenticated endpoints will receive 404 until SP2 rewrites those handlers. This is expected: the old handlers are now dead code. SP3 removes `INTERNAL_API_KEY` auth from `apps/app`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/ apps/api/.env.example  # update .env.example if you added APP_ORIGIN
git commit -m "chore(api): SP1 complete — Fastify foundation + auth + migrations verified"
```

---

## Troubleshooting

### `Cannot find module '@tn-figueiredo/auth'` or `@tn-figueiredo/auth-fastify`

These packages are in the private GitHub npm registry. Verify `.npmrc` at the repo root:

```bash
cat .npmrc | grep tn-figueiredo
# Expected: @tn-figueiredo:registry=https://npm.pkg.github.com
```

If missing, copy it from `~/Workspace/tonagarantia/.npmrc`. Also ensure you have a valid GitHub PAT with `read:packages` scope:

```bash
cat ~/.npmrc | grep npm.pkg.github.com
# Expected: //npm.pkg.github.com/:_authToken=ghp_...
```

### Table not found in Migration B

If `supabase migration new user_id_columns` fails on a table that doesn't exist, check exact names:

```bash
grep "^create table" supabase/migrations/00000000000000_initial_schema.sql
```

Adjust the SQL column names and trigger names accordingly.

### Auth tests: `vi.mock` order issues

Vitest automatically hoists `vi.mock()` calls above imports, but `vi.hoisted()` must be called at the module's top level (not inside a describe/it block). If you see "Cannot access before initialization", ensure all `vi.hoisted()` declarations appear before any `vi.mock()` or `import` statements.

### TypeScript reports errors in `src/app/**`

If tsc still reports errors from route handlers: confirm `"src/app/**"` is in the `exclude` array in `apps/api/tsconfig.json`. Run `cd apps/api && npx tsc --noEmit --listFiles` to see which files tsc is processing.

### Server fails to start: `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set`

Ensure `apps/api/.env` exists with valid values. Get them from `supabase status`. The `.env` is gitignored — it is never committed.
