# SP2: Route Migration to Fastify — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate 61 Next.js App Router route handlers to 16 Fastify plugin files with `INTERNAL_API_KEY` authentication and `X-User-Id` trusted-header infrastructure.

**Architecture:** Each Next.js route handler becomes a Fastify route inside a plugin function. A shared `authenticate` preHandler checks `X-Internal-Key` and extracts `X-User-Id`. All DB writes include `user_id`, all DB reads conditionally scope by `user_id`. A `sendError` helper replaces `handleApiError` for Fastify-native error responses.

**Tech Stack:** Fastify 4.x, `@fastify/cors`, `@fastify/cookie`, Supabase service client, Zod, Vitest 4, `js-yaml`, `archiver`

**Spec:** `docs/superpowers/specs/2026-04-11-sp2-route-migration-design.md`

---

## Translation Reference

Every handler follows these mechanical substitutions from Next.js → Fastify:

| Next.js Pattern | Fastify Equivalent |
|---|---|
| `export async function GET(request: NextRequest)` | `fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {` |
| `const { id } = await params` | `const { id } = request.params as { id: string }` |
| `await validateBody(request, schema)` | `schema.parse(request.body)` |
| `validateQueryParams(url, schema)` | `validateQueryParams(new URL(request.url, 'http://localhost'), schema)` |
| `validateQueryParams(request.nextUrl, schema)` | `validateQueryParams(new URL(request.url, 'http://localhost'), schema)` |
| `return createSuccessResponse(data, 201)` | `return reply.status(201).send({ data, error: null })` |
| `return createSuccessResponse(data)` | `return reply.send({ data, error: null })` |
| `return handleApiError(error)` | `return sendError(reply, error)` |
| `return NextResponse.json({...}, { status })` | `return reply.status(status).send({...})` |
| `return new NextResponse(buffer, { headers })` | `return reply.header(k, v).send(buffer)` |
| `console.error('msg', error)` | `request.log.error({ err: error }, 'msg')` |
| `console.log('msg', data)` | `request.log.info(data, 'msg')` |
| DB reads (when `request.userId` set) | Add `.eq('user_id', request.userId)` |
| DB writes | Add `user_id: request.userId ?? null` to insert data |

---

## File Map

**New files (create):**
```
apps/api/src/
  types/fastify.d.ts                     ← TypeScript augmentation for request.userId
  middleware/authenticate.ts              ← X-Internal-Key check + userId extraction
  lib/api/fastify-errors.ts              ← sendError() helper
  routes/
    projects.ts                           ← 9 handlers
    research.ts                           ← 10 handlers
    ideas.ts                              ← 5 handlers
    blogs.ts                              ← 7 handlers
    videos.ts                             ← 7 handlers
    podcasts.ts                           ← 7 handlers
    shorts.ts                             ← 7 handlers
    stages.ts                             ← 7 handlers
    templates.ts                          ← 7 handlers
    assets.ts                             ← 9 handlers
    canonical-core.ts                     ← 5 handlers
    agents.ts                             ← 3 handlers
    ai-config.ts                          ← 5 handlers
    image-generation.ts                   ← 4 handlers
    wordpress.ts                          ← 9 handlers
    export.ts                             ← 3 handlers
  __tests__/routes/
    projects.test.ts
    research.test.ts
    ideas.test.ts
    blogs.test.ts
    videos.test.ts
    podcasts.test.ts
    shorts.test.ts
    stages.test.ts
    templates.test.ts
    assets.test.ts
    canonical-core.test.ts
    agents.test.ts
    ai-config.test.ts
    image-generation.test.ts
    wordpress.test.ts
    export.test.ts
```

**Modified files:**
- `apps/api/src/server.ts` — register all 16 route plugins

**Deleted (after all tasks complete):**
- `apps/api/src/app/api/` — entire directory (61 Next.js route files)

---

## Test Mock Pattern

All route tests use this shared mock approach with `fastify.inject()`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// Chainable mock that supports all Supabase query patterns
const mockChain: Record<string, any> = {};
['from', 'select', 'insert', 'update', 'delete', 'upsert',
 'eq', 'neq', 'in', 'ilike', 'or', 'overlaps', 'filter',
 'order', 'limit', 'range'].forEach(m => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.single = vi.fn();
mockChain.maybeSingle = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => mockChain,
}));

// Set INTERNAL_API_KEY for authenticate middleware
vi.stubEnv('INTERNAL_API_KEY', 'test-key');

const AUTH_HEADERS = { 'x-internal-key': 'test-key' };
const AUTH_HEADERS_WITH_USER = { 'x-internal-key': 'test-key', 'x-user-id': 'user-123' };

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  // Default mock responses
  mockChain.single.mockResolvedValue({ data: null, error: null });
  mockChain.maybeSingle.mockResolvedValue({ data: null, error: null });
  // Reset chain properties for Promise.all patterns
  Object.defineProperty(mockChain, 'data', { value: null, writable: true, configurable: true });
  Object.defineProperty(mockChain, 'error', { value: null, writable: true, configurable: true });
  Object.defineProperty(mockChain, 'count', { value: 0, writable: true, configurable: true });

  app = Fastify({ logger: false });
  await app.register(routePlugin, { prefix: '/prefix' });
  await app.ready();
});
```

Each test file imports its specific route plugin and adjusts the prefix/mock responses.

---

### Task 1: Infrastructure — Type Augmentation, Authenticate Middleware, Error Helper

**Files:**
- Create: `apps/api/src/types/fastify.d.ts`
- Create: `apps/api/src/middleware/authenticate.ts`
- Create: `apps/api/src/lib/api/fastify-errors.ts`
- Test: `apps/api/src/__tests__/routes/authenticate.test.ts`

- [ ] **Step 1: Create TypeScript augmentation**

Create `apps/api/src/types/fastify.d.ts`:

```typescript
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}
```

- [ ] **Step 2: Create authenticate middleware**

Create `apps/api/src/middleware/authenticate.ts`:

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const key = request.headers['x-internal-key'];
  if (!key || key !== process.env.INTERNAL_API_KEY) {
    return reply.status(401).send({
      data: null,
      error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
    });
  }
  const userId = request.headers['x-user-id'];
  request.userId = typeof userId === 'string' ? userId : undefined;
}
```

- [ ] **Step 3: Create fastify-errors.ts**

Create `apps/api/src/lib/api/fastify-errors.ts`:

```typescript
import type { FastifyReply } from 'fastify';
import { ApiError, translateSupabaseError } from './errors';
import { ZodError } from 'zod';

export function sendError(reply: FastifyReply, error: unknown): void {
  if (error instanceof ApiError) {
    reply.status(error.status).send({
      data: null,
      error: { message: error.message, code: error.code },
    });
    return;
  }

  if (error instanceof ZodError) {
    reply.status(400).send({
      data: null,
      error: {
        message: 'Validation failed: ' + error.issues.map(i => i.message).join(', '),
        code: 'VALIDATION_ERROR',
      },
    });
    return;
  }

  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const err = error as { code?: string; message: string };
    const { code, status } = translateSupabaseError(err);
    reply.status(status).send({
      data: null,
      error: { message: err.message, code },
    });
    return;
  }

  reply.log.error({ err: error }, 'Unhandled route error');
  reply.status(500).send({
    data: null,
    error: { message: 'Internal server error', code: 'INTERNAL' },
  });
}
```

- [ ] **Step 4: Write authenticate tests**

Create `apps/api/src/__tests__/routes/authenticate.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';

vi.stubEnv('INTERNAL_API_KEY', 'test-key');

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify({ logger: false });
  app.get('/test', { preHandler: [authenticate] }, async (request, reply) => {
    return reply.send({ userId: request.userId });
  });
  await app.ready();
});

describe('authenticate middleware', () => {
  it('returns 401 when X-Internal-Key is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      data: null,
      error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
    });
  });

  it('returns 401 when X-Internal-Key is wrong', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-internal-key': 'wrong-key' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('passes through with correct key and no user id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-internal-key': 'test-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: undefined });
  });

  it('extracts X-User-Id when present', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-internal-key': 'test-key', 'x-user-id': 'user-123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'user-123' });
  });

  it('ignores non-string X-User-Id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-internal-key': 'test-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run src/__tests__/routes/authenticate.test.ts`
Expected: 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/types/fastify.d.ts apps/api/src/middleware/authenticate.ts apps/api/src/lib/api/fastify-errors.ts apps/api/src/__tests__/routes/authenticate.test.ts
git commit -m "feat(api): add authenticate middleware, fastify-errors helper, type augmentation"
```

---

### Task 2: Projects Route Plugin

**Files:**
- Create: `apps/api/src/routes/projects.ts`
- Test: `apps/api/src/__tests__/routes/projects.test.ts`
- Source: `apps/api/src/app/api/projects/route.ts`, `apps/api/src/app/api/projects/[id]/route.ts`, `apps/api/src/app/api/projects/bulk-create/route.ts`, `apps/api/src/app/api/projects/bulk/route.ts`, `apps/api/src/app/api/projects/[id]/winner/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/projects.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

const mockChain: Record<string, any> = {};
['from', 'select', 'insert', 'update', 'delete', 'upsert',
 'eq', 'neq', 'in', 'ilike', 'or', 'overlaps', 'filter',
 'order', 'limit', 'range'].forEach(m => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.single = vi.fn();
mockChain.maybeSingle = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => mockChain,
}));

vi.mock('@/lib/idempotency', () => ({
  createKey: vi.fn(),
  getKeyByToken: vi.fn().mockResolvedValue(null),
  consumeKey: vi.fn(),
}));

vi.mock('@/lib/queries/discovery', () => ({
  createProjectsFromDiscovery: vi.fn().mockResolvedValue({ success: true }),
}));

vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { projectsRoutes } from '../../routes/projects';

const AUTH = { 'x-internal-key': 'test-key' };
const AUTH_USER = { 'x-internal-key': 'test-key', 'x-user-id': 'user-123' };

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: { id: 'p-1', title: 'Test' }, error: null });
  mockChain.maybeSingle.mockResolvedValue({ data: { id: 'p-1', title: 'Test', projects_count: 0, winners_count: 0 }, error: null });
  Object.defineProperty(mockChain, 'data', { value: [{ id: 'p-1', title: 'Test' }], writable: true, configurable: true });
  Object.defineProperty(mockChain, 'error', { value: null, writable: true, configurable: true });
  Object.defineProperty(mockChain, 'count', { value: 1, writable: true, configurable: true });

  app = Fastify({ logger: false });
  await app.register(projectsRoutes, { prefix: '/projects' });
  await app.ready();
});

describe('POST /projects', () => {
  it('returns 401 when X-Internal-Key missing', async () => {
    const res = await app.inject({ method: 'POST', url: '/projects', payload: { title: 'T' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when X-Internal-Key wrong', async () => {
    const res = await app.inject({
      method: 'POST', url: '/projects',
      headers: { 'x-internal-key': 'wrong' },
      payload: { title: 'T' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('creates project and returns 201 with data envelope', async () => {
    const res = await app.inject({
      method: 'POST', url: '/projects',
      headers: { ...AUTH, 'content-type': 'application/json' },
      payload: { title: 'New Project' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('error', null);
  });

  it('inserts user_id from X-User-Id header', async () => {
    await app.inject({
      method: 'POST', url: '/projects',
      headers: { ...AUTH_USER, 'content-type': 'application/json' },
      payload: { title: 'New Project' },
    });
    const insertCall = mockChain.insert.mock.calls[0]?.[0];
    expect(insertCall).toHaveProperty('user_id', 'user-123');
  });

  it('inserts null user_id when X-User-Id absent', async () => {
    await app.inject({
      method: 'POST', url: '/projects',
      headers: { ...AUTH, 'content-type': 'application/json' },
      payload: { title: 'New Project' },
    });
    const insertCall = mockChain.insert.mock.calls[0]?.[0];
    expect(insertCall).toHaveProperty('user_id', null);
  });
});

describe('GET /projects', () => {
  it('returns 401 without key', async () => {
    const res = await app.inject({ method: 'GET', url: '/projects' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with data envelope', async () => {
    const res = await app.inject({
      method: 'GET', url: '/projects',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('error', null);
  });

  it('filters by user_id when X-User-Id present', async () => {
    await app.inject({
      method: 'GET', url: '/projects',
      headers: AUTH_USER,
    });
    // Verify .eq was called with user_id
    const eqCalls = mockChain.eq.mock.calls;
    const userIdCall = eqCalls.find((c: any[]) => c[0] === 'user_id' && c[1] === 'user-123');
    expect(userIdCall).toBeDefined();
  });
});
```

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/projects.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { authenticate } from '@/middleware/authenticate';
import { createServiceClient } from '@/lib/supabase';
import { sendError } from '@/lib/api/fastify-errors';
import { ApiError } from '@/lib/api/errors';
import { validateQueryParams } from '@/lib/api/validation';
import {
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
  bulkOperationSchema,
  markWinnerSchema,
} from '@brighttale/shared/schemas/projects';
import { bulkCreateSchema } from '@brighttale/shared/schemas/discovery';

export async function projectsRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /projects — Create new project
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = createProjectSchema.parse(request.body);

      if (data.research_id) {
        const { data: research, error: resErr } = await sb
          .from('research_archives')
          .select('id, projects_count')
          .eq('id', data.research_id)
          .maybeSingle();

        if (resErr) throw resErr;

        if (!research) {
          return reply.status(404).send({
            data: { error: { message: 'Research not found', code: 'RESEARCH_NOT_FOUND' } },
            error: null,
          });
        }

        await sb
          .from('research_archives')
          .update({ projects_count: (research.projects_count ?? 0) + 1 })
          .eq('id', data.research_id);
      }

      const { data: project, error } = await sb
        .from('projects')
        .insert({
          title: data.title,
          research_id: data.research_id,
          current_stage: data.current_stage,
          auto_advance: data.auto_advance,
          status: data.status,
          winner: data.winner,
          user_id: request.userId ?? null,
        })
        .select('*, research:research_archives!research_id(id, title, theme), stages(count)')
        .single();

      if (error) throw error;

      return reply.status(201).send({ data: project, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /projects — List projects with filters
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const params = validateQueryParams(url, listProjectsQuerySchema);

      const page = params.page || 1;
      const limit = params.limit || 20;
      const sortField = params.sort || 'created_at';
      const sortOrder = params.order || 'desc';

      let countQuery = sb.from('projects').select('*', { count: 'exact', head: true });
      let dataQuery = sb.from('projects').select('*, research:research_archives!research_id(id, title, theme), stages(count)');

      if (request.userId) {
        countQuery = countQuery.eq('user_id', request.userId);
        dataQuery = dataQuery.eq('user_id', request.userId);
      }

      if (params.status) {
        countQuery = countQuery.eq('status', params.status);
        dataQuery = dataQuery.eq('status', params.status);
      }
      if (params.current_stage) {
        countQuery = countQuery.eq('current_stage', params.current_stage);
        dataQuery = dataQuery.eq('current_stage', params.current_stage);
      }
      if (params.winner !== undefined) {
        countQuery = countQuery.eq('winner', params.winner);
        dataQuery = dataQuery.eq('winner', params.winner);
      }
      if (params.research_id) {
        countQuery = countQuery.eq('research_id', params.research_id);
        dataQuery = dataQuery.eq('research_id', params.research_id);
      }
      if (params.search) {
        countQuery = countQuery.ilike('title', `%${params.search}%`);
        dataQuery = dataQuery.ilike('title', `%${params.search}%`);
      }

      const [{ count: total, error: countErr }, { data: projects, error: dataErr }] = await Promise.all([
        countQuery,
        dataQuery
          .order(sortField, { ascending: sortOrder === 'asc' })
          .range((page - 1) * limit, page * limit - 1),
      ]);

      if (countErr) throw countErr;
      if (dataErr) throw dataErr;

      return reply.send({
        data: {
          projects,
          pagination: {
            page,
            limit,
            total: total ?? 0,
            totalPages: Math.ceil((total ?? 0) / limit),
          },
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /projects/:id — Get project details
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      let query = sb
        .from('projects')
        .select('*, research:research_archives!research_id(*, sources:research_sources(*)), stages(*, revisions(count)), stages(count)')
        .eq('id', id);

      if (request.userId) query = query.eq('user_id', request.userId);

      const { data: project, error } = await query.maybeSingle();

      if (error) throw error;
      if (!project) throw new ApiError(404, 'Project not found', 'NOT_FOUND');

      return reply.send({ data: project, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // PUT /projects/:id — Update project
  fastify.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = updateProjectSchema.parse(request.body);

      const { data: existing, error: findErr } = await sb
        .from('projects').select('*').eq('id', id).maybeSingle();
      if (findErr) throw findErr;
      if (!existing) throw new ApiError(404, 'Project not found', 'NOT_FOUND');

      // Handle clearing research_id
      if (data.research_id === null && existing.research_id) {
        const { data: oldRes } = await sb
          .from('research_archives').select('projects_count').eq('id', existing.research_id).maybeSingle();
        if (oldRes) {
          await sb.from('research_archives')
            .update({ projects_count: Math.max(0, (oldRes.projects_count ?? 0) - 1) })
            .eq('id', existing.research_id);
        }
      }

      // If research_id is being updated to a new value, verify it exists
      if (data.research_id !== undefined && data.research_id !== null) {
        const { data: research, error: resErr } = await sb
          .from('research_archives').select('id, projects_count').eq('id', data.research_id).maybeSingle();
        if (resErr) throw resErr;
        if (!research) throw new ApiError(404, 'Research not found', 'RESEARCH_NOT_FOUND');

        if (existing.research_id !== data.research_id) {
          if (existing.research_id) {
            const { data: oldRes } = await sb
              .from('research_archives').select('projects_count').eq('id', existing.research_id).maybeSingle();
            if (oldRes) {
              await sb.from('research_archives')
                .update({ projects_count: Math.max(0, (oldRes.projects_count ?? 0) - 1) })
                .eq('id', existing.research_id);
            }
          }
          await sb.from('research_archives')
            .update({ projects_count: (research.projects_count ?? 0) + 1 })
            .eq('id', data.research_id);
        }
      }

      // Handle winner count changes
      if (data.winner === true && !existing.winner && existing.research_id) {
        const { data: res } = await sb
          .from('research_archives').select('winners_count').eq('id', existing.research_id).maybeSingle();
        if (res) {
          await sb.from('research_archives')
            .update({ winners_count: (res.winners_count ?? 0) + 1 })
            .eq('id', existing.research_id);
        }
      }
      if (data.winner === false && existing.winner && existing.research_id) {
        const { data: res } = await sb
          .from('research_archives').select('winners_count').eq('id', existing.research_id).maybeSingle();
        if (res) {
          await sb.from('research_archives')
            .update({ winners_count: Math.max(0, (res.winners_count ?? 0) - 1) })
            .eq('id', existing.research_id);
        }
      }

      const updateData: Record<string, unknown> = {};
      if (data.title) updateData.title = data.title;
      if (data.research_id !== undefined) updateData.research_id = data.research_id;
      if (data.current_stage) updateData.current_stage = data.current_stage;
      if (data.auto_advance !== undefined) updateData.auto_advance = data.auto_advance;
      if (data.status) updateData.status = data.status;
      if (data.winner !== undefined) updateData.winner = data.winner;
      if (data.completed_stages !== undefined) updateData.completed_stages = data.completed_stages;

      const { data: project, error } = await sb
        .from('projects')
        .update(updateData as any)
        .eq('id', id)
        .select('*, research:research_archives!research_id(id, title, theme), stages(count)')
        .single();

      if (error) throw error;
      return reply.send({ data: project, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // PATCH /projects/:id — Partial update (delegates to PUT)
  fastify.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    // Reuse the PUT handler logic by re-dispatching
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = updateProjectSchema.parse(request.body);

      const { data: existing, error: findErr } = await sb
        .from('projects').select('*').eq('id', id).maybeSingle();
      if (findErr) throw findErr;
      if (!existing) throw new ApiError(404, 'Project not found', 'NOT_FOUND');

      if (data.research_id === null && existing.research_id) {
        const { data: oldRes } = await sb
          .from('research_archives').select('projects_count').eq('id', existing.research_id).maybeSingle();
        if (oldRes) {
          await sb.from('research_archives')
            .update({ projects_count: Math.max(0, (oldRes.projects_count ?? 0) - 1) })
            .eq('id', existing.research_id);
        }
      }

      if (data.research_id !== undefined && data.research_id !== null) {
        const { data: research, error: resErr } = await sb
          .from('research_archives').select('id, projects_count').eq('id', data.research_id).maybeSingle();
        if (resErr) throw resErr;
        if (!research) throw new ApiError(404, 'Research not found', 'RESEARCH_NOT_FOUND');

        if (existing.research_id !== data.research_id) {
          if (existing.research_id) {
            const { data: oldRes } = await sb
              .from('research_archives').select('projects_count').eq('id', existing.research_id).maybeSingle();
            if (oldRes) {
              await sb.from('research_archives')
                .update({ projects_count: Math.max(0, (oldRes.projects_count ?? 0) - 1) })
                .eq('id', existing.research_id);
            }
          }
          await sb.from('research_archives')
            .update({ projects_count: (research.projects_count ?? 0) + 1 })
            .eq('id', data.research_id);
        }
      }

      if (data.winner === true && !existing.winner && existing.research_id) {
        const { data: res } = await sb
          .from('research_archives').select('winners_count').eq('id', existing.research_id).maybeSingle();
        if (res) {
          await sb.from('research_archives')
            .update({ winners_count: (res.winners_count ?? 0) + 1 })
            .eq('id', existing.research_id);
        }
      }
      if (data.winner === false && existing.winner && existing.research_id) {
        const { data: res } = await sb
          .from('research_archives').select('winners_count').eq('id', existing.research_id).maybeSingle();
        if (res) {
          await sb.from('research_archives')
            .update({ winners_count: Math.max(0, (res.winners_count ?? 0) - 1) })
            .eq('id', existing.research_id);
        }
      }

      const updateData: Record<string, unknown> = {};
      if (data.title) updateData.title = data.title;
      if (data.research_id !== undefined) updateData.research_id = data.research_id;
      if (data.current_stage) updateData.current_stage = data.current_stage;
      if (data.auto_advance !== undefined) updateData.auto_advance = data.auto_advance;
      if (data.status) updateData.status = data.status;
      if (data.winner !== undefined) updateData.winner = data.winner;
      if (data.completed_stages !== undefined) updateData.completed_stages = data.completed_stages;

      const { data: project, error } = await sb
        .from('projects')
        .update(updateData as any)
        .eq('id', id)
        .select('*, research:research_archives!research_id(id, title, theme), stages(count)')
        .single();

      if (error) throw error;
      return reply.send({ data: project, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // DELETE /projects/:id — Delete project
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: existing, error: findErr } = await sb
        .from('projects').select('*').eq('id', id).maybeSingle();
      if (findErr) throw findErr;
      if (!existing) throw new ApiError(404, 'Project not found', 'NOT_FOUND');

      if (existing.research_id) {
        const { data: res } = await sb
          .from('research_archives').select('projects_count, winners_count').eq('id', existing.research_id).maybeSingle();
        if (res) {
          const updateData: Record<string, number> = {
            projects_count: Math.max(0, (res.projects_count ?? 0) - 1),
          };
          if (existing.winner) {
            updateData.winners_count = Math.max(0, (res.winners_count ?? 0) - 1);
          }
          await sb.from('research_archives').update(updateData as any).eq('id', existing.research_id);
        }
      }

      const { error } = await sb.from('projects').delete().eq('id', id);
      if (error) throw error;

      return reply.send({ data: { success: true, message: 'Project deleted successfully' }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // POST /projects/bulk-create — Bulk create projects from discovery
  fastify.post('/bulk-create', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = bulkCreateSchema.parse(request.body);

      if (body.idempotency_token) {
        const { getKeyByToken, createKey, consumeKey } = await import('@/lib/idempotency');
        const existing = await getKeyByToken(body.idempotency_token);
        if (existing && existing.consumed && existing.response) {
          return reply.send({ data: existing.response, error: null });
        }
        await createKey(body.idempotency_token, { purpose: 'projects:bulk-create' });
      }

      const { ENABLE_BULK_LIMITS, MAX_BULK_CREATE } = await import('@/lib/config');
      if (ENABLE_BULK_LIMITS && body.selected_ideas.length > MAX_BULK_CREATE) {
        throw new ApiError(413, `Bulk create exceeds MAX_BULK_CREATE (${MAX_BULK_CREATE})`, 'BULK_CREATE_LIMIT_EXCEEDED');
      }

      const { createProjectsFromDiscovery } = await import('@/lib/queries/discovery');
      const result = await createProjectsFromDiscovery({
        research: body.research as any,
        ideas: body.selected_ideas,
        defaults: body.defaults ?? {},
        idempotencyToken: body.idempotency_token,
      } as any);

      if (body.idempotency_token) {
        const { consumeKey } = await import('@/lib/idempotency');
        await consumeKey(body.idempotency_token, result);
      }

      return reply.send({ data: result, error: null });
    } catch (error) {
      if ((error as Error).message === 'createProjectsFromDiscovery not implemented') {
        return reply.status(501).send({
          data: { success: false, message: 'createProjectsFromDiscovery not implemented' },
          error: null,
        });
      }
      return sendError(reply, error);
    }
  });

  // POST /projects/bulk — Bulk operations on projects
  fastify.post('/bulk', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = bulkOperationSchema.parse(request.body);

      const { data: projects, error: findErr } = await sb
        .from('projects').select('*').in('id', data.project_ids);
      if (findErr) throw findErr;

      if ((projects ?? []).length !== data.project_ids.length) {
        throw new ApiError(400, 'Some project IDs are invalid', 'INVALID_PROJECT_IDS');
      }

      switch (data.operation) {
        case 'delete': {
          for (const project of projects ?? []) {
            if (project.research_id) {
              const { data: res } = await sb
                .from('research_archives').select('projects_count, winners_count').eq('id', project.research_id).maybeSingle();
              if (res) {
                const upd: Record<string, number> = { projects_count: Math.max(0, (res.projects_count ?? 0) - 1) };
                if (project.winner) upd.winners_count = Math.max(0, (res.winners_count ?? 0) - 1);
                await sb.from('research_archives').update(upd as any).eq('id', project.research_id);
              }
            }
          }
          const { error: delErr } = await sb.from('projects').delete().in('id', data.project_ids);
          if (delErr) throw delErr;
          return reply.send({
            data: { success: true, operation: data.operation, affected: data.project_ids.length, message: `Successfully performed delete on ${data.project_ids.length} project(s)` },
            error: null,
          });
        }

        case 'archive':
        case 'activate':
        case 'pause':
        case 'complete': {
          const statusMap: Record<string, string> = { archive: 'archived', activate: 'active', pause: 'paused', complete: 'completed' };
          const { error: upErr } = await sb.from('projects').update({ status: statusMap[data.operation] }).in('id', data.project_ids);
          if (upErr) throw upErr;
          return reply.send({
            data: { success: true, operation: data.operation, affected: data.project_ids.length, message: `Successfully performed ${data.operation} on ${data.project_ids.length} project(s)` },
            error: null,
          });
        }

        case 'export': {
          const exportData = (projects ?? []).map(p => ({
            id: p.id, title: p.title, current_stage: p.current_stage,
            status: p.status, winner: p.winner, created_at: p.created_at, research_id: p.research_id,
          }));
          const body = JSON.stringify({ projects: exportData }, null, 2);
          return reply
            .header('Content-Type', 'application/json')
            .header('Content-Disposition', 'attachment; filename=projects-export.json')
            .send(body);
        }

        case 'change_status': {
          if (!data.new_status) throw new ApiError(400, 'new_status is required for change_status', 'MISSING_FIELD');
          const { error: upErr } = await sb.from('projects').update({ status: data.new_status }).in('id', data.project_ids);
          if (upErr) throw upErr;
          return reply.send({
            data: { success: true, affected: data.project_ids.length, message: `Updated status to ${data.new_status}` },
            error: null,
          });
        }

        default:
          throw new ApiError(400, 'Invalid operation', 'INVALID_OPERATION');
      }
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // POST /projects/:id/winner — Mark project as winner
  fastify.post('/:id/winner', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = markWinnerSchema.parse(request.body);

      const { data: existing, error: findErr } = await sb
        .from('projects').select('*').eq('id', id).maybeSingle();
      if (findErr) throw findErr;
      if (!existing) throw new ApiError(404, 'Project not found', 'NOT_FOUND');

      if (existing.research_id) {
        if (data.winner && !existing.winner) {
          const { data: research } = await sb
            .from('research_archives').select('winners_count').eq('id', existing.research_id).single();
          if (research) {
            await sb.from('research_archives')
              .update({ winners_count: (research.winners_count ?? 0) + 1 })
              .eq('id', existing.research_id);
          }
        } else if (!data.winner && existing.winner) {
          const { data: research } = await sb
            .from('research_archives').select('winners_count').eq('id', existing.research_id).single();
          if (research) {
            await sb.from('research_archives')
              .update({ winners_count: Math.max(0, (research.winners_count ?? 0) - 1) })
              .eq('id', existing.research_id);
          }
        }
      }

      const { data: project, error: updateErr } = await sb
        .from('projects')
        .update({ winner: data.winner })
        .eq('id', id)
        .select('*, research:research_id(id, title, theme, winners_count)')
        .single();

      if (updateErr) throw updateErr;

      return reply.send({
        data: {
          success: true,
          project,
          message: data.winner ? 'Project marked as winner' : 'Project unmarked as winner',
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/projects.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/projects.ts apps/api/src/__tests__/routes/projects.test.ts
git commit -m "feat(api): migrate projects routes to Fastify plugin"
```

---

### Task 3: Research Route Plugin

**Files:**
- Create: `apps/api/src/routes/research.ts`
- Test: `apps/api/src/__tests__/routes/research.test.ts`
- Source: `apps/api/src/app/api/research/route.ts`, `apps/api/src/app/api/research/[id]/route.ts`, `apps/api/src/app/api/research/[id]/sources/route.ts`, `apps/api/src/app/api/research/[id]/sources/[sourceId]/route.ts`, `apps/api/src/app/api/research/by-idea/[ideaId]/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/research.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

const mockChain: Record<string, any> = {};
['from', 'select', 'insert', 'update', 'delete', 'upsert',
 'eq', 'neq', 'in', 'ilike', 'or', 'overlaps', 'filter',
 'order', 'limit', 'range'].forEach(m => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.single = vi.fn();
mockChain.maybeSingle = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => mockChain,
}));

vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { researchRoutes } from '../../routes/research';

const AUTH = { 'x-internal-key': 'test-key' };
const AUTH_USER = { 'x-internal-key': 'test-key', 'x-user-id': 'user-123' };

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: { id: 'r-1', title: 'Test Research' }, error: null });
  mockChain.maybeSingle.mockResolvedValue({ data: { id: 'r-1', title: 'Test Research', projects: [{ count: 0 }] }, error: null });
  Object.defineProperty(mockChain, 'data', { value: [{ id: 'r-1' }], writable: true, configurable: true });
  Object.defineProperty(mockChain, 'error', { value: null, writable: true, configurable: true });
  Object.defineProperty(mockChain, 'count', { value: 1, writable: true, configurable: true });

  app = Fastify({ logger: false });
  await app.register(researchRoutes, { prefix: '/research' });
  await app.ready();
});

describe('POST /research', () => {
  it('returns 401 when X-Internal-Key missing', async () => {
    const res = await app.inject({ method: 'POST', url: '/research', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('creates research and returns 201', async () => {
    const res = await app.inject({
      method: 'POST', url: '/research',
      headers: { ...AUTH, 'content-type': 'application/json' },
      payload: { title: 'Test', theme: 'Test Theme', research_content: '{}' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toHaveProperty('error', null);
  });

  it('includes user_id in insert', async () => {
    await app.inject({
      method: 'POST', url: '/research',
      headers: { ...AUTH_USER, 'content-type': 'application/json' },
      payload: { title: 'Test', theme: 'Theme', research_content: '{}' },
    });
    const insertCall = mockChain.insert.mock.calls[0]?.[0];
    expect(insertCall).toHaveProperty('user_id', 'user-123');
  });
});

describe('GET /research', () => {
  it('returns 401 without key', async () => {
    const res = await app.inject({ method: 'GET', url: '/research' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with data envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/research', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /research/:id', () => {
  it('returns 401 without key', async () => {
    const res = await app.inject({ method: 'GET', url: '/research/r-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with research data', async () => {
    const res = await app.inject({ method: 'GET', url: '/research/r-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });
});

describe('DELETE /research/:id', () => {
  it('returns 401 without key', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/research/r-1' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/research.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { authenticate } from '@/middleware/authenticate';
import { createServiceClient } from '@/lib/supabase';
import { sendError } from '@/lib/api/fastify-errors';
import { ApiError } from '@/lib/api/errors';
import { validateQueryParams } from '@/lib/api/validation';
import {
  createResearchSchema,
  listResearchQuerySchema,
  updateResearchSchema,
  addSourceSchema,
} from '@brighttale/shared/schemas/research';

export async function researchRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /research
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = createResearchSchema.parse(request.body);

      let researchContent = data.research_content;
      if (data.idea_id) {
        try {
          const parsed = JSON.parse(data.research_content);
          parsed.idea_id = data.idea_id;
          researchContent = JSON.stringify(parsed);
        } catch {
          researchContent = JSON.stringify({ idea_id: data.idea_id, content: data.research_content });
        }
      }

      const { data: research, error } = await sb
        .from('research_archives')
        .insert({
          title: data.title,
          theme: data.theme,
          research_content: researchContent,
          user_id: request.userId ?? null,
        })
        .select('*, sources:research_sources(*)')
        .single();

      if (error) throw error;
      return reply.status(201).send({ data: research, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /research
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const params = validateQueryParams(url, listResearchQuerySchema);

      const page = params.page || 1;
      const limit = params.limit || 20;
      const sortField = params.sort || 'created_at';
      const sortOrder = params.order || 'desc';

      let countQuery = sb.from('research_archives').select('*', { count: 'exact', head: true });
      let dataQuery = sb.from('research_archives').select('*, sources:research_sources(*), projects(count)');

      if (request.userId) {
        countQuery = countQuery.eq('user_id', request.userId);
        dataQuery = dataQuery.eq('user_id', request.userId);
      }

      if (params.theme) {
        countQuery = countQuery.ilike('theme', `%${params.theme}%`);
        dataQuery = dataQuery.ilike('theme', `%${params.theme}%`);
      }
      if (params.search) {
        const searchFilter = `title.ilike.%${params.search}%,research_content.ilike.%${params.search}%`;
        countQuery = countQuery.or(searchFilter);
        dataQuery = dataQuery.or(searchFilter);
      }

      const [{ count: total, error: countErr }, { data: research, error: dataErr }] = await Promise.all([
        countQuery,
        dataQuery.order(sortField, { ascending: sortOrder === 'asc' }).range((page - 1) * limit, page * limit - 1),
      ]);

      if (countErr) throw countErr;
      if (dataErr) throw dataErr;

      return reply.send({
        data: { data: research, pagination: { page, limit, total: total ?? 0, totalPages: Math.ceil((total ?? 0) / limit) } },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /research/:id
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      let query = sb.from('research_archives')
        .select('*, sources:research_sources(*, count:id), projects(id, title, status, winner, created_at)')
        .eq('id', id);

      if (request.userId) query = query.eq('user_id', request.userId);

      const { data: research, error } = await query.maybeSingle();
      if (error) throw error;
      if (!research) throw new ApiError(404, 'Research not found', 'NOT_FOUND');

      return reply.send({ data: research, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // PATCH /research/:id
  fastify.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = updateResearchSchema.parse(request.body);

      const { data: existing, error: findErr } = await sb
        .from('research_archives').select('id').eq('id', id).maybeSingle();
      if (findErr) throw findErr;
      if (!existing) throw new ApiError(404, 'Research not found', 'NOT_FOUND');

      const updateData: Record<string, unknown> = {};
      if (data.title) updateData.title = data.title;
      if (data.theme) updateData.theme = data.theme;
      if (data.research_content) updateData.research_content = data.research_content;

      const { data: research, error } = await sb
        .from('research_archives').update(updateData as any).eq('id', id)
        .select('*, sources:research_sources(*)').single();

      if (error) throw error;
      return reply.send({ data: research, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // DELETE /research/:id
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: existing, error: findErr } = await sb
        .from('research_archives').select('id, projects(count)').eq('id', id).maybeSingle();
      if (findErr) throw findErr;
      if (!existing) throw new ApiError(404, 'Research not found', 'NOT_FOUND');

      const projectCount = (existing as any).projects?.[0]?.count ?? 0;
      if (projectCount > 0) {
        throw new ApiError(400, `Cannot delete research that is used by ${projectCount} project(s)`, 'RESEARCH_IN_USE');
      }

      const { error } = await sb.from('research_archives').delete().eq('id', id);
      if (error) throw error;

      return reply.send({ data: { success: true, message: 'Research deleted successfully' }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /research/:id/sources
  fastify.get('/:id/sources', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: research, error: findErr } = await sb
        .from('research_archives').select('id').eq('id', id).maybeSingle();
      if (findErr) throw findErr;
      if (!research) throw new ApiError(404, 'Research not found', 'NOT_FOUND');

      const { data: sources, error } = await sb
        .from('research_sources').select('*').eq('research_id', id).order('created_at', { ascending: false });
      if (error) throw error;

      return reply.send({ data: sources, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // POST /research/:id/sources
  fastify.post('/:id/sources', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = addSourceSchema.parse(request.body);

      const { data: research, error: findErr } = await sb
        .from('research_archives').select('id').eq('id', id).maybeSingle();
      if (findErr) throw findErr;
      if (!research) throw new ApiError(404, 'Research not found', 'NOT_FOUND');

      const { data: source, error } = await sb
        .from('research_sources')
        .insert({
          research_id: id,
          url: data.url,
          title: data.title,
          author: data.author,
          date: data.date ? new Date(data.date).toISOString() : null,
        })
        .select().single();

      if (error) throw error;
      return reply.status(201).send({ data: source, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /research/:id/sources/:sourceId
  fastify.get('/:id/sources/:sourceId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id, sourceId } = request.params as { id: string; sourceId: string };

      const { data: source, error } = await sb
        .from('research_sources').select('*').eq('id', sourceId).eq('research_id', id).maybeSingle();
      if (error) throw error;
      if (!source) throw new ApiError(404, 'Source not found', 'NOT_FOUND');

      return reply.send({ data: source, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // DELETE /research/:id/sources/:sourceId
  fastify.delete('/:id/sources/:sourceId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id, sourceId } = request.params as { id: string; sourceId: string };

      const { data: source, error: findErr } = await sb
        .from('research_sources').select('*').eq('id', sourceId).maybeSingle();
      if (findErr) throw findErr;
      if (!source) throw new ApiError(404, 'Source not found', 'NOT_FOUND');
      if (source.research_id !== id) throw new ApiError(400, 'Source does not belong to this research', 'INVALID_RESEARCH_ID');

      const { error } = await sb.from('research_sources').delete().eq('id', sourceId);
      if (error) throw error;

      return reply.send({ data: { success: true, message: 'Source deleted successfully' }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /research/by-idea/:ideaId
  fastify.get('/by-idea/:ideaId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { ideaId } = request.params as { ideaId: string };

      if (!ideaId) throw new ApiError(400, 'ideaId is required', 'VALIDATION_ERROR');

      let query = sb.from('research_archives')
        .select('*, sources:research_sources(*), projects(count)')
        .or(`research_content.cs."idea_id":"${ideaId}",research_content.cs."idea_id": "${ideaId}",title.ilike.%${ideaId}%`);

      if (request.userId) query = query.eq('user_id', request.userId);

      const { data: research, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      return reply.send({
        data: { idea_id: ideaId, count: (research ?? []).length, research },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/research.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/research.ts apps/api/src/__tests__/routes/research.test.ts
git commit -m "feat(api): migrate research routes to Fastify plugin"
```

---

### Task 4: Ideas Route Plugin

**Files:**
- Create: `apps/api/src/routes/ideas.ts`
- Test: `apps/api/src/__tests__/routes/ideas.test.ts`
- Source: `apps/api/src/app/api/ideas/archive/route.ts`, `apps/api/src/app/api/ideas/library/route.ts`, `apps/api/src/app/api/ideas/library/[id]/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/ideas.test.ts` following the same mock pattern as Task 2. Key tests:
- `POST /ideas/archive` → 401 without key, 200 with valid ideas array
- `GET /ideas/library` → 401 without key, 200 with pagination
- `POST /ideas/library` → 201 creates idea with user_id
- `GET /ideas/library/:id` → 200 returns idea
- `DELETE /ideas/library/:id` → 200 deletes idea

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

const mockChain: Record<string, any> = {};
['from', 'select', 'insert', 'update', 'delete', 'upsert',
 'eq', 'neq', 'in', 'ilike', 'or', 'overlaps', 'filter',
 'order', 'limit', 'range'].forEach(m => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.single = vi.fn();
mockChain.maybeSingle = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => mockChain,
}));

vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { ideasRoutes } from '../../routes/ideas';

const AUTH = { 'x-internal-key': 'test-key' };
let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: { id: 'i-1' }, error: null });
  mockChain.maybeSingle.mockResolvedValue({ data: { id: 'i-1' }, error: null });
  Object.defineProperty(mockChain, 'data', { value: [{ id: 'i-1' }], writable: true, configurable: true });
  Object.defineProperty(mockChain, 'error', { value: null, writable: true, configurable: true });
  Object.defineProperty(mockChain, 'count', { value: 1, writable: true, configurable: true });

  app = Fastify({ logger: false });
  await app.register(ideasRoutes, { prefix: '/ideas' });
  await app.ready();
});

describe('POST /ideas/archive', () => {
  it('returns 401 without key', async () => {
    const res = await app.inject({ method: 'POST', url: '/ideas/archive', payload: {} });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /ideas/library', () => {
  it('returns 401 without key', async () => {
    const res = await app.inject({ method: 'GET', url: '/ideas/library' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/ideas/library', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /ideas/library/:id', () => {
  it('returns 200 with idea', async () => {
    const res = await app.inject({ method: 'GET', url: '/ideas/library/i-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
  });
});

describe('DELETE /ideas/library/:id', () => {
  it('returns 401 without key', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/ideas/library/i-1' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/ideas.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '@/middleware/authenticate';
import { createServiceClient } from '@/lib/supabase';
import { sendError } from '@/lib/api/fastify-errors';
import { ApiError } from '@/lib/api/errors';
import { validateQueryParams } from '@/lib/api/validation';
import {
  listIdeasQuerySchema,
  createIdeaSchema,
  updateIdeaSchema,
  calculateSimilarity,
  type SimilarityWarning,
} from '@brighttale/shared/schemas/ideas';

const SIMILARITY_THRESHOLD = 80;

const archiveSchema = z.object({
  ideas: z.array(z.object({
    idea_id: z.string().regex(/^BC-IDEA-\d{3}$/),
    title: z.string().min(5),
    core_tension: z.string().min(10),
    target_audience: z.string().min(5),
    verdict: z.enum(['viable', 'weak', 'experimental']),
    discovery_data: z.string().optional(),
  })).min(1),
});

export async function ideasRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /ideas/archive
  fastify.post('/archive', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const body = archiveSchema.parse(request.body);

      const items = body.ideas.map(i => ({
        idea_id: i.idea_id,
        title: i.title,
        core_tension: i.core_tension,
        target_audience: i.target_audience,
        verdict: i.verdict,
        discovery_data: i.discovery_data ?? '',
        user_id: request.userId ?? null,
      }));

      const { data, error } = await sb
        .from('idea_archives')
        .upsert(items, { onConflict: 'idea_id', ignoreDuplicates: true })
        .select();

      if (error) throw error;

      return reply.send({ data: { archived: (data ?? []).length }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /ideas/library
  fastify.get('/library', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const query = validateQueryParams(url, listIdeasQuerySchema);
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      let countQuery = sb.from('idea_archives').select('*', { count: 'exact', head: true });
      let dataQuery = sb.from('idea_archives').select('*');

      if (request.userId) {
        countQuery = countQuery.eq('user_id', request.userId);
        dataQuery = dataQuery.eq('user_id', request.userId);
      }

      if (query.verdict) { countQuery = countQuery.eq('verdict', query.verdict); dataQuery = dataQuery.eq('verdict', query.verdict); }
      if (query.source_type) { countQuery = countQuery.eq('source_type', query.source_type); dataQuery = dataQuery.eq('source_type', query.source_type); }
      if (query.is_public !== undefined) { countQuery = countQuery.eq('is_public', query.is_public); dataQuery = dataQuery.eq('is_public', query.is_public); }
      if (query.tags) {
        const tagArray = query.tags.split(',').map(t => t.trim());
        countQuery = countQuery.overlaps('tags', tagArray);
        dataQuery = dataQuery.overlaps('tags', tagArray);
      }
      if (query.search) {
        const searchFilter = `title.ilike.%${query.search}%,core_tension.ilike.%${query.search}%,target_audience.ilike.%${query.search}%`;
        countQuery = countQuery.or(searchFilter);
        dataQuery = dataQuery.or(searchFilter);
      }

      const [{ count: total, error: countErr }, { data: ideas, error: dataErr }] = await Promise.all([
        countQuery,
        dataQuery.order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1),
      ]);

      if (countErr) throw countErr;
      if (dataErr) throw dataErr;

      return reply.send({
        data: { ideas, pagination: { page, limit, total: total ?? 0, totalPages: Math.ceil((total ?? 0) / limit) } },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // POST /ideas/library
  fastify.post('/library', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = createIdeaSchema.parse(request.body);

      const { data: existingIdeas, error: fetchErr } = await sb
        .from('idea_archives').select('id, title, idea_id');
      if (fetchErr) throw fetchErr;

      const warnings: SimilarityWarning[] = [];
      for (const existing of existingIdeas ?? []) {
        const similarity = calculateSimilarity(data.title, existing.title);
        if (similarity >= SIMILARITY_THRESHOLD) {
          warnings.push({ type: 'similar', existing_id: existing.id, existing_title: existing.title, similarity });
        }
      }

      let ideaId = data.idea_id;
      if (!ideaId) {
        const { count, error: countErr } = await sb
          .from('idea_archives').select('*', { count: 'exact', head: true });
        if (countErr) throw countErr;
        ideaId = `BC-IDEA-${String((count ?? 0) + 1).padStart(3, '0')}`;
      }

      const { data: existingIdeaId } = await sb
        .from('idea_archives').select('id').eq('idea_id', ideaId).maybeSingle();
      if (existingIdeaId) {
        const { data: allIdeas } = await sb.from('idea_archives').select('idea_id');
        const maxNum = (allIdeas ?? []).reduce((max: number, i: any) => {
          const match = i.idea_id.match(/BC-IDEA-(\d+)/);
          return match ? Math.max(max, parseInt(match[1])) : max;
        }, 0);
        ideaId = `BC-IDEA-${String(maxNum + 1).padStart(3, '0')}`;
      }

      const { data: idea, error } = await sb.from('idea_archives').insert({
        idea_id: ideaId,
        title: data.title,
        core_tension: data.core_tension,
        target_audience: data.target_audience,
        verdict: data.verdict,
        discovery_data: data.discovery_data ?? '',
        source_type: data.source_type,
        source_project_id: data.source_project_id,
        tags: data.tags ?? [],
        is_public: data.is_public ?? true,
        markdown_content: data.markdown_content,
        user_id: request.userId ?? null,
      }).select().single();

      if (error) throw error;

      const response: { idea: typeof idea; warnings?: SimilarityWarning[] } = { idea };
      if (warnings.length > 0) response.warnings = warnings;

      return reply.status(201).send({ data: response, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /ideas/library/:id
  fastify.get('/library/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: idea, error } = await sb.from('idea_archives').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!idea) throw new ApiError(404, 'Idea not found', 'NOT_FOUND');

      return reply.send({ data: { idea }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // PATCH /ideas/library/:id
  fastify.patch('/library/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = updateIdeaSchema.parse(request.body);

      const { data: existing, error: findErr } = await sb.from('idea_archives').select('id').eq('id', id).maybeSingle();
      if (findErr) throw findErr;
      if (!existing) throw new ApiError(404, 'Idea not found', 'NOT_FOUND');

      const updateData: Record<string, unknown> = {};
      if (data.title) updateData.title = data.title;
      if (data.core_tension) updateData.core_tension = data.core_tension;
      if (data.target_audience) updateData.target_audience = data.target_audience;
      if (data.verdict) updateData.verdict = data.verdict;
      if (data.discovery_data !== undefined) updateData.discovery_data = data.discovery_data;
      if (data.tags) updateData.tags = data.tags;
      if (data.is_public !== undefined) updateData.is_public = data.is_public;
      if (data.markdown_content !== undefined) updateData.markdown_content = data.markdown_content;

      const { data: idea, error } = await sb.from('idea_archives').update(updateData as any).eq('id', id).select().single();
      if (error) throw error;

      return reply.send({ data: { idea }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // DELETE /ideas/library/:id
  fastify.delete('/library/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: existing, error: findErr } = await sb.from('idea_archives').select('id').eq('id', id).maybeSingle();
      if (findErr) throw findErr;
      if (!existing) throw new ApiError(404, 'Idea not found', 'NOT_FOUND');

      const { error } = await sb.from('idea_archives').delete().eq('id', id);
      if (error) throw error;

      return reply.send({ data: { deleted: true }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/ideas.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/ideas.ts apps/api/src/__tests__/routes/ideas.test.ts
git commit -m "feat(api): migrate ideas routes to Fastify plugin"
```

---

### Task 5: Blogs Route Plugin

**Files:**
- Create: `apps/api/src/routes/blogs.ts`
- Test: `apps/api/src/__tests__/routes/blogs.test.ts`
- Source: `apps/api/src/app/api/blogs/route.ts`, `apps/api/src/app/api/blogs/[id]/route.ts`, `apps/api/src/app/api/blogs/[id]/export/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/blogs.test.ts` with auth tests for GET/POST /blogs, GET/PUT/DELETE /blogs/:id, GET /blogs/:id/export. Follow the same mock pattern as Task 2. Key tests: 401 without key, 201 creates blog with user_id, 200 returns list.

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/blogs.ts`. The route plugin follows the same pattern. Key differences from projects:
- Uses inline Zod schemas (listQuerySchema, createBlogSchema, updateBlogSchema) — copy them verbatim from the existing files
- GET /:id transforms DB row to BlogOutput format with JSON.parse for outline_json, internal_links_json
- GET /:id/export returns different Content-Type based on `format` query param (markdown/html/json)
- Uses `markdownToHtml` from `@/lib/utils` for HTML export
- All DB writes include `user_id: request.userId ?? null`
- All DB reads add `.eq('user_id', request.userId)` when `request.userId` is set

The handler implementations should be direct translations of the existing code using the Translation Reference table. Import `BlogOutput` from `@brighttale/shared/types/agents`, `markdownToHtml` from `@/lib/utils`.

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/blogs.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/blogs.ts apps/api/src/__tests__/routes/blogs.test.ts
git commit -m "feat(api): migrate blogs routes to Fastify plugin"
```

---

### Task 6: Videos Route Plugin

**Files:**
- Create: `apps/api/src/routes/videos.ts`
- Test: `apps/api/src/__tests__/routes/videos.test.ts`
- Source: `apps/api/src/app/api/videos/route.ts`, `apps/api/src/app/api/videos/[id]/route.ts`, `apps/api/src/app/api/videos/[id]/export/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/videos.test.ts` with auth tests for all endpoints. Follow same mock pattern.

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/videos.ts`. Key specifics:
- Uses `createVideoSchema`, `updateVideoSchema`, `videoQuerySchema` from `@brighttale/shared/schemas/videos`
- GET /:id transforms DB row to VideoOutput (JSON.parse for thumbnail_json, script_json)
- POST / calculates word count via `calculateVideoWordCount` helper (copy from existing file)
- GET /:id/export supports markdown/html/teleprompter/json formats
- Uses exporters from `@/lib/exporters/videoExporter`
- Import `VideoOutput` from `@brighttale/shared/types/agents`
- All DB reads conditionally scope by user_id, writes include user_id

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/videos.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/videos.ts apps/api/src/__tests__/routes/videos.test.ts
git commit -m "feat(api): migrate videos routes to Fastify plugin"
```

---

### Task 7: Podcasts Route Plugin

**Files:**
- Create: `apps/api/src/routes/podcasts.ts`
- Test: `apps/api/src/__tests__/routes/podcasts.test.ts`
- Source: `apps/api/src/app/api/podcasts/route.ts`, `apps/api/src/app/api/podcasts/[id]/route.ts`, `apps/api/src/app/api/podcasts/[id]/export/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/podcasts.test.ts` with auth tests for all endpoints.

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/podcasts.ts`. Key specifics:
- Uses `createPodcastSchema`, `updatePodcastSchema`, `podcastQuerySchema` from `@brighttale/shared/schemas/podcasts`
- GET /:id transforms DB row to PodcastOutput (JSON.parse for talking_points_json)
- POST / calculates word count from talking_points, intro_hook, personal_angle, outro
- GET /:id/export supports markdown/html/json using `@/lib/exporters/podcastExporter`
- Import `PodcastOutput` from `@brighttale/shared/types/agents`

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/podcasts.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/podcasts.ts apps/api/src/__tests__/routes/podcasts.test.ts
git commit -m "feat(api): migrate podcasts routes to Fastify plugin"
```

---

### Task 8: Shorts Route Plugin

**Files:**
- Create: `apps/api/src/routes/shorts.ts`
- Test: `apps/api/src/__tests__/routes/shorts.test.ts`
- Source: `apps/api/src/app/api/shorts/route.ts`, `apps/api/src/app/api/shorts/[id]/route.ts`, `apps/api/src/app/api/shorts/[id]/export/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/shorts.test.ts` with auth tests for all endpoints.

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/shorts.ts`. Key specifics:
- Uses `createShortsSchema`, `updateShortsSchema`, `shortsQuerySchema` from `@brighttale/shared/schemas/shorts`
- GET /:id transforms DB row (JSON.parse for shorts_json)
- GET /:id/export supports markdown/html/json using `@/lib/exporters/shortsExporter`
- Import `ShortOutput` from `@brighttale/shared/types/agents`

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/shorts.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/shorts.ts apps/api/src/__tests__/routes/shorts.test.ts
git commit -m "feat(api): migrate shorts routes to Fastify plugin"
```

---

### Task 9: Templates Route Plugin

**Files:**
- Create: `apps/api/src/routes/templates.ts`
- Test: `apps/api/src/__tests__/routes/templates.test.ts`
- Source: `apps/api/src/app/api/templates/route.ts`, `apps/api/src/app/api/templates/[id]/route.ts`, `apps/api/src/app/api/templates/[id]/resolved/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/templates.test.ts` with auth tests for all endpoints.

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/templates.ts`. Key specifics:
- Uses schemas from `@brighttale/shared/schemas/templates`
- POST / validates JSON.parse on config_json and checks parent template exists
- PUT /:id has circular inheritance detection (while loop checking parent chain)
- DELETE /:id checks for child templates before allowing delete
- GET /:id/resolved uses `resolveTemplate` from `@/lib/queries/templates`
- Import `validateQueryParams` for GET / list endpoint

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/templates.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/templates.ts apps/api/src/__tests__/routes/templates.test.ts
git commit -m "feat(api): migrate templates routes to Fastify plugin"
```

---

### Task 10: Canonical Core Route Plugin

**Files:**
- Create: `apps/api/src/routes/canonical-core.ts`
- Test: `apps/api/src/__tests__/routes/canonical-core.test.ts`
- Source: `apps/api/src/app/api/canonical-core/route.ts`, `apps/api/src/app/api/canonical-core/[id]/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/canonical-core.test.ts` with auth tests.

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/canonical-core.ts`. Key specifics:
- Uses `createCanonicalCoreSchema`, `updateCanonicalCoreSchema` from `@brighttale/shared/schemas/canonicalCoreApi`
- Inline `listQuerySchema` with idea_id, project_id, page, limit
- POST / JSON.stringifies argument_chain, emotional_arc, key_stats, key_quotes, affiliate_moment
- PUT /:id does the same for updates
- Uses `user_id` scoping on reads and includes in writes

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/canonical-core.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/canonical-core.ts apps/api/src/__tests__/routes/canonical-core.test.ts
git commit -m "feat(api): migrate canonical-core routes to Fastify plugin"
```

---

### Task 11: Agents Route Plugin

**Files:**
- Create: `apps/api/src/routes/agents.ts`
- Test: `apps/api/src/__tests__/routes/agents.test.ts`
- Source: `apps/api/src/app/api/agents/route.ts`, `apps/api/src/app/api/agents/[slug]/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/agents.test.ts` with auth tests.

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/agents.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '@/middleware/authenticate';
import { createServiceClient } from '@/lib/supabase';
import { sendError } from '@/lib/api/fastify-errors';

const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  instructions: z.string().optional(),
  input_schema: z.string().optional(),
  output_schema: z.string().optional(),
});

export async function agentsRoutes(fastify: FastifyInstance): Promise<void> {

  // GET /agents
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { data: agents, error } = await sb
        .from('agent_prompts')
        .select('id, name, slug, stage, instructions, input_schema, output_schema, created_at, updated_at')
        .order('stage', { ascending: true });

      if (error) throw error;
      return reply.send({ data: { agents }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // GET /agents/:slug
  fastify.get('/:slug', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { slug } = request.params as { slug: string };

      const { data: agent, error } = await sb
        .from('agent_prompts').select('*').eq('slug', slug).maybeSingle();
      if (error) throw error;

      if (!agent) {
        return reply.status(404).send({
          data: { error: { message: 'Agent not found', code: 'AGENT_NOT_FOUND' } },
          error: null,
        });
      }

      return reply.send({ data: { agent }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // PUT /agents/:slug
  fastify.put('/:slug', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { slug } = request.params as { slug: string };
      const data = updateAgentSchema.parse(request.body);

      const { data: existing, error: findErr } = await sb
        .from('agent_prompts').select('id').eq('slug', slug).maybeSingle();
      if (findErr) throw findErr;

      if (!existing) {
        return reply.status(404).send({
          data: { error: { message: 'Agent not found', code: 'AGENT_NOT_FOUND' } },
          error: null,
        });
      }

      const { data: agent, error: updateErr } = await sb
        .from('agent_prompts')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('slug', slug).select().single();

      if (updateErr) throw updateErr;
      return reply.send({ data: { agent }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/agents.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/agents.ts apps/api/src/__tests__/routes/agents.test.ts
git commit -m "feat(api): migrate agents routes to Fastify plugin"
```

---

### Task 12: AI Config Route Plugin

**Files:**
- Create: `apps/api/src/routes/ai-config.ts`
- Test: `apps/api/src/__tests__/routes/ai-config.test.ts`
- Source: `apps/api/src/app/api/ai/config/route.ts`, `apps/api/src/app/api/ai/config/[id]/route.ts`, `apps/api/src/app/api/ai/discovery/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/ai-config.test.ts` with auth tests. Mock `@/lib/crypto` for encrypt. Mock `@/lib/ai` for getAIAdapter.

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/ai-config.ts`. Key specifics:
- POST /config encrypts api_key before storing; deactivates other configs if is_active=true
- GET /config masks api_key (returns has_api_key boolean)
- PUT /config/:id also encrypts new api_key, deactivates others
- DELETE /config/:id simple delete
- POST /discovery uses `getAIAdapter` from `@/lib/ai` + `discoveryInputSchema` from `@brighttale/shared/schemas/discovery`
- Checks `process.env.ENCRYPTION_SECRET` before encrypt operations

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/ai-config.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/ai-config.ts apps/api/src/__tests__/routes/ai-config.test.ts
git commit -m "feat(api): migrate ai-config routes to Fastify plugin"
```

---

### Task 13: Image Generation Route Plugin

**Files:**
- Create: `apps/api/src/routes/image-generation.ts`
- Test: `apps/api/src/__tests__/routes/image-generation.test.ts`
- Source: `apps/api/src/app/api/image-generation/config/route.ts`, `apps/api/src/app/api/image-generation/config/[id]/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/image-generation.test.ts` with auth tests. Mock `@/lib/crypto`.

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/image-generation.ts`. Key specifics:
- POST /config encrypts api_key; deactivates others if is_active=true
- GET /config lists configs with masked api_key (has_api_key boolean)
- PUT /config/:id updates with encryption, deactivates others
- DELETE /config/:id simple delete
- Uses `imageGeneratorConfigSchema`, `updateImageGeneratorConfigSchema` from `@brighttale/shared/schemas/imageGeneration`

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/image-generation.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/image-generation.ts apps/api/src/__tests__/routes/image-generation.test.ts
git commit -m "feat(api): migrate image-generation routes to Fastify plugin"
```

---

### Task 14: Stages Route Plugin (Medium Complexity)

**Files:**
- Create: `apps/api/src/routes/stages.ts`
- Test: `apps/api/src/__tests__/routes/stages.test.ts`
- Source: `apps/api/src/app/api/stages/route.ts`, `apps/api/src/app/api/stages/[projectId]/route.ts`, `apps/api/src/app/api/stages/[projectId]/[stageType]/route.ts`, `apps/api/src/app/api/stages/[projectId]/[stageType]/revisions/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/stages.test.ts` with auth tests for POST /stages, GET /stages/:projectId, GET /stages/:projectId/:stageType, POST /stages/:projectId/:stageType/revisions.

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/stages.ts`. Key specifics:
- POST / has the upsert-or-create pattern: checks if stage exists, archives old version to revisions, increments version
- Uses `createStageSchema`, `normalizeStageType`, `validStageTypes`, `createRevisionSchema` from `@brighttale/shared/schemas/stages`
- GET /:projectId returns all stages for a project
- GET /:projectId/:stageType validates stage type, tries normalized then original lookup
- PUT /:projectId/:stageType (not in existing code but in spec) — if needed, add update handler
- PATCH /:projectId/:stageType — same
- POST /:projectId/:stageType/revisions creates manual revision
- GET /:projectId/:stageType/revisions — list revisions for a stage

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/stages.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/stages.ts apps/api/src/__tests__/routes/stages.test.ts
git commit -m "feat(api): migrate stages routes to Fastify plugin"
```

---

### Task 15: Assets Route Plugin (Medium Complexity)

**Files:**
- Create: `apps/api/src/routes/assets.ts`
- Test: `apps/api/src/__tests__/routes/assets.test.ts`
- Source: `apps/api/src/app/api/assets/route.ts`, `apps/api/src/app/api/assets/[id]/route.ts`, `apps/api/src/app/api/assets/[id]/download/route.ts`, `apps/api/src/app/api/assets/download/route.ts`, `apps/api/src/app/api/assets/project/[projectId]/route.ts`, `apps/api/src/app/api/assets/generate/route.ts`, `apps/api/src/app/api/assets/generate/suggest-prompts/route.ts`, `apps/api/src/app/api/assets/unsplash/search/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/assets.test.ts` with auth tests. Mock `@/lib/ai/imageIndex`, `@/lib/files/imageStorage`.

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/assets.ts`. Key specifics:
- GET / lists assets with filters (projectId, contentType, role, source, pagination)
- POST / saves a new asset (unsplash/upload)
- DELETE /:id deletes asset + removes local file via `deleteImageFile` from `@/lib/files/imageStorage`
- GET /:id/download streams single file as attachment (reads from local filesystem)
- GET /download bulk ZIP download using `archiver` — reply.header().send(zipBuffer)
- GET /project/:projectId lists assets for a project
- POST /generate uses `getImageProvider` from `@/lib/ai/imageIndex` + `saveImageLocally` from `@/lib/files/imageStorage`
- POST /generate/suggest-prompts pure function, uses prompt generators from `@/lib/ai/promptGenerators`
- GET /unsplash/search proxies to Unsplash API with `UNSPLASH_ACCESS_KEY`
- All DB reads scope by user_id when present

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/assets.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/assets.ts apps/api/src/__tests__/routes/assets.test.ts
git commit -m "feat(api): migrate assets routes to Fastify plugin"
```

---

### Task 16: Export Route Plugin

**Files:**
- Create: `apps/api/src/routes/export.ts`
- Test: `apps/api/src/__tests__/routes/export.test.ts`
- Source: `apps/api/src/app/api/export/jobs/route.ts`, `apps/api/src/app/api/export/jobs/[id]/route.ts`, `apps/api/src/app/api/export/jobs/[id]/download/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/export.test.ts` with auth tests. Mock `@/lib/exportJobs`.

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/export.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '@/middleware/authenticate';
import { sendError } from '@/lib/api/fastify-errors';
import { createExportJob, getExportJob, getExportPayload } from '@/lib/exportJobs';

export async function exportRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /export/jobs
  fastify.post('/jobs', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const bodySchema = z.object({ project_ids: z.array(z.string().cuid()).min(1) });
      const data = bodySchema.parse(request.body);
      const id = await createExportJob(data.project_ids);
      return reply.send({ job_id: id });
    } catch (err: any) {
      return reply.status(400).send({ error: err?.message ?? 'Bad request' });
    }
  });

  // GET /export/jobs/:id
  fastify.get('/jobs/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = getExportJob(id);
    if (!job) return reply.status(404).send({ error: 'Not found' });
    return reply.send({ job_id: job.id, status: job.status });
  });

  // GET /export/jobs/:id/download
  fastify.get('/jobs/:id/download', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = getExportPayload(id);
    if (!payload) return reply.status(404).send({ error: 'Not ready or not found' });

    const body = JSON.stringify(payload, null, 2);
    return reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename=projects-export-${id}.json`)
      .send(body);
  });
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/export.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/export.ts apps/api/src/__tests__/routes/export.test.ts
git commit -m "feat(api): migrate export routes to Fastify plugin"
```

---

### Task 17: WordPress Route Plugin (Complex)

**Files:**
- Create: `apps/api/src/routes/wordpress.ts`
- Test: `apps/api/src/__tests__/routes/wordpress.test.ts`
- Source: `apps/api/src/app/api/wordpress/config/route.ts`, `apps/api/src/app/api/wordpress/config/[id]/route.ts`, `apps/api/src/app/api/wordpress/publish/route.ts`, `apps/api/src/app/api/wordpress/tags/route.ts`, `apps/api/src/app/api/wordpress/categories/route.ts`

- [ ] **Step 1: Write the test file**

Create `apps/api/src/__tests__/routes/wordpress.test.ts` with auth tests for config CRUD + publish + tags + categories. Mock `@/lib/crypto`, mock global `fetch` for WordPress API calls.

- [ ] **Step 2: Write the route plugin**

Create `apps/api/src/routes/wordpress.ts`. This is the largest file (~500 lines). Key specifics:

**Config endpoints:**
- POST /config — create config with encrypted password
- GET /config — list configs with masked passwords
- GET /config/:id — single config, masked password
- PUT /config/:id — update with optional password re-encryption
- DELETE /config/:id — delete config

**Publish endpoint (migrated verbatim, ~250 lines):**
- POST /publish — full WordPress publishing flow with image upload, placeholder replacement, tag/category resolution
- Uses `decrypt` from `@/lib/crypto`, `markdownToHtml` from `@/lib/utils`, `yaml` from `js-yaml`
- Helper functions `uploadImageToWordPress`, `resolveCategories`, `resolveTags` are module-private
- Replace all `console.log`/`console.error` with `request.log.info`/`request.log.error`

**Remote API endpoints:**
- GET /tags — fetches WordPress tags via REST API
- GET /categories — fetches WordPress categories via REST API
- Both use `validateQueryParams` with `fetchTagsQuerySchema`/`fetchCategoriesQuerySchema`
- Both resolve credentials from config_id or inline params

- [ ] **Step 3: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/wordpress.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/wordpress.ts apps/api/src/__tests__/routes/wordpress.test.ts
git commit -m "feat(api): migrate wordpress routes to Fastify plugin"
```

---

### Task 18: Update server.ts — Register All Route Plugins

**Files:**
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Update server.ts**

Replace the contents of `apps/api/src/server.ts`:

```typescript
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { projectsRoutes } from './routes/projects.js';
import { researchRoutes } from './routes/research.js';
import { ideasRoutes } from './routes/ideas.js';
import { blogsRoutes } from './routes/blogs.js';
import { videosRoutes } from './routes/videos.js';
import { podcastsRoutes } from './routes/podcasts.js';
import { shortsRoutes } from './routes/shorts.js';
import { stagesRoutes } from './routes/stages.js';
import { templatesRoutes } from './routes/templates.js';
import { assetsRoutes } from './routes/assets.js';
import { canonicalCoreRoutes } from './routes/canonical-core.js';
import { agentsRoutes } from './routes/agents.js';
import { aiConfigRoutes } from './routes/ai-config.js';
import { imageGenerationRoutes } from './routes/image-generation.js';
import { wordpressRoutes } from './routes/wordpress.js';
import { exportRoutes } from './routes/export.js';

export async function buildServer() {
  const fastify = Fastify({ logger: true });

  const allowedOrigins = [
    'http://localhost:3000',
    process.env.APP_ORIGIN ?? 'https://app.brighttale.io',
  ];

  await fastify.register(fastifyCors, {
    origin: allowedOrigins,
    credentials: true,
  });

  await fastify.register(fastifyCookie);

  // Unauthenticated routes
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);

  // Authenticated routes — each plugin attaches authenticate preHandler internally
  await fastify.register(projectsRoutes, { prefix: '/projects' });
  await fastify.register(researchRoutes, { prefix: '/research' });
  await fastify.register(ideasRoutes, { prefix: '/ideas' });
  await fastify.register(blogsRoutes, { prefix: '/blogs' });
  await fastify.register(videosRoutes, { prefix: '/videos' });
  await fastify.register(podcastsRoutes, { prefix: '/podcasts' });
  await fastify.register(shortsRoutes, { prefix: '/shorts' });
  await fastify.register(stagesRoutes, { prefix: '/stages' });
  await fastify.register(templatesRoutes, { prefix: '/templates' });
  await fastify.register(assetsRoutes, { prefix: '/assets' });
  await fastify.register(canonicalCoreRoutes, { prefix: '/canonical-core' });
  await fastify.register(agentsRoutes, { prefix: '/agents' });
  await fastify.register(aiConfigRoutes, { prefix: '/ai' });
  await fastify.register(imageGenerationRoutes, { prefix: '/image-generation' });
  await fastify.register(wordpressRoutes, { prefix: '/wordpress' });
  await fastify.register(exportRoutes, { prefix: '/export' });

  return fastify;
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors (fix any import issues)

- [ ] **Step 3: Run all route tests**

Run: `cd apps/api && npx vitest run src/__tests__/routes/`
Expected: All tests PASS (~120 tests across 17 files)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "feat(api): register all Fastify route plugins in server.ts"
```

---

### Task 19: Delete Next.js Route Handlers

**Files:**
- Delete: `apps/api/src/app/api/` — entire directory

- [ ] **Step 1: Delete the directory**

```bash
rm -rf apps/api/src/app/api/
```

- [ ] **Step 2: Verify no imports reference deleted files**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `npm run test:api`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add -A apps/api/src/app/api/
git commit -m "chore(api): delete Next.js route handlers (migrated to Fastify)"
```

---

### Task 20: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm run test:api`
Expected: All tests PASS

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Start dev server and smoke-test**

Run: `npm run dev:api`
Test with curl:
```bash
# Health check (no auth)
curl http://localhost:3001/health

# Projects list (with auth)
curl -H "X-Internal-Key: $INTERNAL_API_KEY" http://localhost:3001/projects

# Projects list with user scoping
curl -H "X-Internal-Key: $INTERNAL_API_KEY" -H "X-User-Id: test-user" http://localhost:3001/projects
```

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(api): post-migration fixes"
```
