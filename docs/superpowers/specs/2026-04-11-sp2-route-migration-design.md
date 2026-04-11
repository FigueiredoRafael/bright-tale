# SP2: Route Migration to Fastify — Design Spec

## Goal

Migrate 61 Next.js App Router route handlers in `apps/api/src/app/api/` to Fastify plugins. Add `INTERNAL_API_KEY` authentication to all routes. Wire `X-User-Id` trusted-header infrastructure for future per-user DB scoping (activated in SP3).

## Architecture

The existing `src/app/api/` directory is deleted in full. All active routes become Fastify plugin files in `src/routes/`. Four test/connectivity endpoints are deleted without replacement.

A new `authenticate` preHandler guards all migrated routes. It:
1. Checks `X-Internal-Key` against `INTERNAL_API_KEY` env var → 401 if missing or wrong
2. Extracts `X-User-Id` header and attaches it to `request.userId` (string | undefined)

When `request.userId` is present, DB reads append `.eq('user_id', request.userId)` and writes include `user_id: request.userId`. When absent (pre-SP3), queries run unscoped. This is safe because `INTERNAL_API_KEY` proves the caller is a trusted internal service.

`apps/app/src/lib/api-client.ts:17` will be updated in SP3 to pass `X-User-Id` from the authenticated session.

## Tech Stack

Fastify 4.x, `@fastify/cors`, `@fastify/cookie`, Supabase service client, Zod, existing `src/lib/crypto.ts` for encryption/decryption.

---

## File Structure

**New files:**
```
apps/api/src/
  middleware/
    authenticate.ts          ← X-Internal-Key check + request.userId extraction
  lib/api/
    fastify-errors.ts        ← Fastify-native error handler (reply.status().send())
  routes/
    projects.ts              ← GET/POST /projects, GET/PATCH/DELETE /projects/:id,
                                POST /projects/bulk-create, POST /projects/bulk,
                                POST /projects/:id/winner
    research.ts              ← GET/POST /research, GET/PATCH/DELETE /research/:id,
                                GET /research/:id/sources,
                                GET/DELETE /research/:id/sources/:sourceId,
                                GET /research/by-idea/:ideaId
    ideas.ts                 ← POST /ideas/archive, GET /ideas/library,
                                GET/DELETE /ideas/library/:id
    blogs.ts                 ← GET/POST /blogs, GET/PATCH/DELETE /blogs/:id,
                                GET /blogs/:id/export
    videos.ts                ← GET/POST /videos, GET/PATCH/DELETE /videos/:id,
                                GET /videos/:id/export
    podcasts.ts              ← GET/POST /podcasts, GET/PATCH/DELETE /podcasts/:id,
                                GET /podcasts/:id/export
    shorts.ts                ← GET/POST /shorts, GET/PATCH/DELETE /shorts/:id,
                                GET /shorts/:id/export
    stages.ts                ← GET/POST /stages, GET/POST /stages/:projectId,
                                GET/PUT/PATCH /stages/:projectId/:stageType,
                                GET/POST /stages/:projectId/:stageType/revisions
    templates.ts             ← GET/POST /templates, GET/PUT/DELETE /templates/:id,
                                GET /templates/:id/resolved
    assets.ts                ← GET/POST /assets, GET /assets/project/:projectId,
                                GET /assets/download, POST /assets/generate,
                                POST /assets/generate/suggest-prompts
    canonical-core.ts        ← GET/POST /canonical-core,
                                GET/PUT/DELETE /canonical-core/:id
    agents.ts                ← GET /agents, GET /agents/:slug
    ai-config.ts             ← GET/POST /ai/config, GET/PUT/DELETE /ai/config/:id,
                                GET /ai/discovery
    image-generation.ts      ← GET/POST /image-generation/config,
                                GET/PUT/DELETE /image-generation/config/:id
    wordpress.ts             ← GET/POST/PATCH/DELETE /wordpress/config,
                                GET/DELETE /wordpress/config/:id,
                                POST /wordpress/publish,
                                GET /wordpress/tags, GET /wordpress/categories
    export.ts                ← GET/POST /export/jobs, GET/PATCH /export/jobs/:id,
                                GET /export/jobs/:id/download
  __tests__/routes/
    projects.test.ts         ← ~8 tests
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

**Existing files modified:**
- `src/server.ts` — register all new route plugins
- `src/lib/api/errors.ts:25` — `ApiError` reused unchanged
- `src/lib/api/validation.ts:23` — `validateQueryParams` reused (takes `URL`, framework-agnostic)

**Existing files NOT reused:**
- `src/lib/api/validation.ts:8` — `validateBody` uses `request.json()` (Web Fetch API). Fastify handlers call `schema.parse(request.body)` directly.
- `src/lib/api/errors.ts:55` — `createSuccessResponse` returns `NextResponse`. Replaced by `fastify-errors.ts`.

**Deleted (no migration):**
- `src/app/api/` — entire directory (61 Next.js route files)
- `src/app/api/ai/test/route.ts` — connectivity test, no data value
- `src/app/api/image-generation/test/route.ts` — smoke test, no data value
- `src/app/api/wordpress/test/route.ts` — connectivity test, no data value
- `src/app/api/wordpress/test-markdown/route.ts` — rendering test, no data value

---

## Route Handler Pattern

Every handler follows this structure:

```typescript
// Example: POST /projects
fastify.post('/projects', { preHandler: [authenticate] }, async (request, reply) => {
  const data = createProjectSchema.parse(request.body);
  const sb = createServiceClient();

  const { data: project, error } = await sb
    .from('projects')
    .insert({ ...data, user_id: request.userId ?? null })
    .select('*')
    .single();

  if (error) throw error;
  reply.status(201).send({ data: project, error: null });
});

// Example: GET /projects (with user scoping)
fastify.get('/projects', { preHandler: [authenticate] }, async (request, reply) => {
  const sb = createServiceClient();
  let query = sb.from('projects').select('*');
  if (request.userId) query = query.eq('user_id', request.userId);
  const { data, error } = await query;
  if (error) throw error;
  reply.send({ data, error: null });
});
```

---

## Error Handling

`src/lib/api/fastify-errors.ts` exports `sendError(reply, err)`:

```typescript
export function sendError(reply: FastifyReply, error: unknown): void {
  if (error instanceof ApiError) {
    reply.status(error.status).send({ data: null, error: { message: error.message, code: error.code } });
    return;
  }
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const { code, status } = translateSupabaseError(error as { code?: string; message: string });
    reply.status(status).send({ data: null, error: { message: (error as { message: string }).message, code } });
    return;
  }
  reply.log.error({ err: error }, 'Unhandled route error');
  reply.status(500).send({ data: null, error: { message: 'Internal server error', code: 'INTERNAL' } });
}
```

All routes: `try { ... } catch (err) { sendError(reply, err) }`.

All `console.error` / `console.log` in migrated handlers become `request.log.error({ err }, 'message')` (Pino structured logging per CLAUDE.md standard).

---

## Route Complexity Tiers

**Simple** (thin DB wrapper, direct Supabase CRUD, <100 lines each):
`projects`, `research`, `ideas`, `blogs`, `videos`, `podcasts`, `shorts`, `templates`, `canonical-core`, `agents`, `ai-config`, `image-generation`

**Medium** (business logic or cross-table operations):
- `stages` — upsert-or-create pattern with revision tracking (archive old version before update)
- `assets` — AI image generation calls + signed URL download
- `export` — async job creation and download via `src/lib/exportJobs.ts`

**Complex** (large outbound integration):
- `wordpress` — `wordpress/publish` is 455 lines with full WordPress REST API calls (tags, categories, post creation). Logic migrated verbatim, no refactoring in SP2.

---

## `authenticate` Middleware

```typescript
// src/middleware/authenticate.ts
import { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const key = request.headers['x-internal-key'];
  if (!key || key !== process.env.INTERNAL_API_KEY) {
    reply.status(401).send({ data: null, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
    return;
  }
  const userId = request.headers['x-user-id'];
  (request as any).userId = typeof userId === 'string' ? userId : undefined;
}
```

TypeScript augmentation added to `src/types/fastify.d.ts`:
```typescript
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}
```

---

## `server.ts` Registration

Each route plugin receives `authenticate` via a scoped sub-instance. `/health` and `/auth/*` are registered separately and do not receive the preHandler.

```typescript
// Unauthenticated routes (existing, unchanged)
await fastify.register(healthRoutes);
await fastify.register(authRoutes);

// Authenticated routes — each plugin attaches authenticate internally
// e.g. inside projects.ts: fastify.post('/', { preHandler: [authenticate] }, handler)
await fastify.register(projectsRoutes, { prefix: '/projects' });
await fastify.register(researchRoutes, { prefix: '/research' });
// ... (one register per module, same pattern)
```

---

## Testing

**Baseline:** `src/lib/__tests__/` — 14 files, existing lib tests. No route tests exist.

**SP2 creates:** `src/__tests__/routes/` — 16 files (~120 tests total).

**Per-file coverage:**
```
describe('POST /projects')
  ✓ returns 401 when X-Internal-Key missing
  ✓ returns 401 when X-Internal-Key wrong
  ✓ creates project, returns 201 with data envelope
  ✓ inserts user_id from X-User-Id header
  ✓ inserts null user_id when X-User-Id absent
  ✓ returns 400 on Zod validation failure

describe('GET /projects')
  ✓ returns 401 without key
  ✓ filters by user_id when X-User-Id present
  ✓ returns all rows when X-User-Id absent
```

**Note on `validateQueryParams` in Fastify:** Fastify's `request.url` is a path string (e.g. `/projects?status=active`), not a full URL. Construct the `URL` object as:
```typescript
const url = new URL(request.url, 'http://localhost');
const params = validateQueryParams(url, schema);
```

Mock pattern: `src/test/supabase-mock.ts` (existing) + `vi.hoisted()` for module-level mocks.

---

## Constraints

- No logic changes to existing handlers during migration — translate structure only
- `wordpress/publish` migrated verbatim (455 lines); no simplification in SP2
- `validateBody` is NOT reused — each handler calls `schema.parse(request.body)`
- `validateQueryParams` IS reused — takes `URL` object, framework-agnostic
- `ApiError`, `translateSupabaseError` from `errors.ts` reused unchanged
- `encrypt`/`decrypt` from `src/lib/crypto.ts` reused unchanged
- All DB writes include `user_id: request.userId ?? null`
- All DB reads add `.eq('user_id', request.userId)` when `request.userId` is set
