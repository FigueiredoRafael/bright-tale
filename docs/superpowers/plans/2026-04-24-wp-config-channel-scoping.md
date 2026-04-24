---
title: WordPress Config Channel-Scoping — Implementation Plan
date: 2026-04-24
status: approved
branch: feat/persona-eeat-layer
spec: docs/superpowers/specs/2026-04-24-wp-config-channel-scoping-design.md
---

# WordPress Config Channel-Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WordPress configuration a property of a channel (1:1 cascade), so the publish pipeline derives credentials from the project's channel automatically. Remove global `/api/wordpress/config` management in favor of a WordPress card on the channel-detail Blog tab.

**Architecture:** Invert the FK (`wordpress_configs.channel_id → channels.id`, unique). Add nested `/api/channels/:id/wordpress` routes. Drop `configId` from `publishDraftSchema` and derive config via `content_drafts.channel_id → wordpress_configs.channel_id`. Delete the `/settings/wordpress` page and all global `/api/wordpress/config*` routes.

**Tech Stack:** Supabase Postgres, Fastify, Zod, Next.js 16, shadcn/ui, Vitest 4.

---

## File Structure

**DB**
- `supabase/migrations/20260424000000_wordpress_configs_channel_scope.sql` (NEW)
- `packages/shared/src/types/database.ts` (regenerated)

**API routes (Fastify)**
- `apps/api/src/routes/channels.ts` — add nested `/:id/wordpress` routes; update `GET /` to include `has_wordpress`
- `apps/api/src/routes/wordpress.ts` — delete `/config*` CRUD + `/publish`/`/publish-draft*` refactor; update `/tags` `/categories` to accept `channel_id`
- `apps/api/src/routes/personas.ts` — persona→WP link looks up via `wordpress_configs.channel_id`

**Shared schema**
- `packages/shared/src/schemas/pipeline.ts` — remove `configId` from `publishDraftSchema`

**Tests**
- `apps/api/src/routes/__tests__/channels-wordpress.test.ts` (NEW) — CRUD + test endpoint + cross-org 404
- `apps/api/src/__tests__/routes/wordpress.test.ts` — drop `configId` fixtures; stub channel→config lookup

**UI**
- `apps/app/src/app/[locale]/(app)/channels/[id]/page.tsx` — new WordPress card in Blog tab
- `apps/app/src/components/personas/PersonaForm.tsx` — switch filter to `has_wordpress`
- `apps/app/src/components/engines/PublishEngine.tsx` — stop passing `configId`
- `apps/app/src/components/preview/PublishPanel.tsx` — stop fetching configs / stop passing `configId`
- `apps/app/src/components/wordpress/PublishingForm.tsx` — stop fetching configs / remove `config_id` from legacy publish body

**Deletions**
- `apps/app/src/app/[locale]/(app)/settings/wordpress/page.tsx` — entire file
- `apps/app/src/components/layout/Sidebar.tsx:82` — `/settings/wordpress` nav entry
- `apps/app/src/components/layout/Topbar.tsx:27` — `/settings/wordpress` title mapping
- `apps/app/src/app/[locale]/(app)/settings/page.tsx:42-47` — WordPress card
- `apps/app/messages/en.json` + `apps/app/messages/pt-BR.json` — `pages.settingsWordpress` key

---

## Task 1: Schema migration — invert wordpress_configs FK

**Commit:** `feat(db): wordpress_configs channel-scoped migration + types regen`

**Files:**
- Create: `supabase/migrations/20260424000000_wordpress_configs_channel_scope.sql`
- Regenerate: `packages/shared/src/types/database.ts`

**Prerequisite state (verified in spec brainstorm):** `wordpress_configs` has 1 orphan row, 0 channels link to it. Safe to drop the row and repopulate per-channel after the migration lands.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260424000000_wordpress_configs_channel_scope.sql`:

```sql
-- 1. Drop orphan row (no channel references it; confirmed empty via query).
delete from public.wordpress_configs;

-- 2. Remove the channel → config FK (relationship is inverting).
alter table public.channels drop column wordpress_config_id;

-- 3. Add channel_id on wordpress_configs, enforce 1:1.
alter table public.wordpress_configs
  add column channel_id uuid not null
    references public.channels(id) on delete cascade;

create unique index wordpress_configs_channel_id_unique
  on public.wordpress_configs(channel_id);

-- 4. Drop user_id / org_id — redundant once channel_id is required.
alter table public.wordpress_configs drop column if exists user_id;
alter table public.wordpress_configs drop column if exists org_id;
```

- [ ] **Step 2: Apply migration to dev DB**

Run: `npm run db:push:dev`
Expected: migration applies cleanly; no constraint violations (table already empty).

- [ ] **Step 3: Regenerate DB types**

Run: `npm run db:types`
Expected: `packages/shared/src/types/database.ts` updates — `wordpress_configs.Row` gains `channel_id: string` and loses `user_id` / `org_id`; `channels.Row` loses `wordpress_config_id`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: FAIL. Failures are expected in exactly the following places (will be fixed in later tasks):
- `apps/api/src/routes/personas.ts` — reads removed `channels.wordpress_config_id`
- `apps/api/src/routes/wordpress.ts` — legacy `/publish` reads `wordpress_configs.id` without `channel_id`
- `apps/app/src/components/personas/PersonaForm.tsx` — types the field
- Any test fixture referencing `wordpress_config_id`

Record failures. Do NOT attempt to fix inside this task.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260424000000_wordpress_configs_channel_scope.sql packages/shared/src/types/database.ts
git commit -m "$(cat <<'EOF'
feat(db): wordpress_configs channel-scoped migration + types regen

Invert the FK so wordpress_configs belongs to a channel (1:1, cascade delete).
Drop redundant user_id / org_id columns. Drop the single orphan row — confirmed
empty in the design spec. channels.wordpress_config_id removed.

Downstream typecheck failures in routes/personas, routes/wordpress, PersonaForm
are expected and will be addressed in subsequent tasks.
EOF
)"
```

---

## Task 2: Channel-scoped WordPress routes + persona→WP lookup

**Commit:** `feat(api): channel-scoped WordPress routes (POST/GET/PUT/DELETE/test)`

**Files:**
- Modify: `apps/api/src/routes/channels.ts` — add nested routes under `/:id/wordpress`
- Modify: `apps/api/src/routes/personas.ts:217-296` — lookup via `wordpress_configs.channel_id`
- Create: `apps/api/src/routes/__tests__/channels-wordpress.test.ts`

**Route contract (from spec §API Routes):**

| Method | Path | Behavior |
|---|---|---|
| `GET`    | `/api/channels/:id/wordpress`      | Fetch config. Password masked. `404 WP_CONFIG_NOT_FOUND` if none. |
| `POST`   | `/api/channels/:id/wordpress`      | Create. Encrypts password. `409 WP_CONFIG_EXISTS` on duplicate. |
| `PUT`    | `/api/channels/:id/wordpress`      | Partial update. Re-encrypts if `password` provided. |
| `DELETE` | `/api/channels/:id/wordpress`      | Remove config. |
| `POST`   | `/api/channels/:id/wordpress/test` | `GET {site_url}/wp-json/wp/v2/users/me` with Basic auth. Returns `{ ok, message }`. |

All routes: `preHandler: authenticate`, org scope check via existing `getOrgId` pattern, envelope `{ data, error }`.

- [ ] **Step 1: Write failing test — CRUD happy path**

Create `apps/api/src/routes/__tests__/channels-wordpress.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

const mockFrom = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockMaybeSingle = vi.fn()
const mockSingle = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockLimit = vi.fn()
const mockOrder = vi.fn()

function resetMocks() {
  mockSelect.mockReturnThis()
  mockEq.mockReturnThis()
  mockMaybeSingle.mockReset()
  mockSingle.mockReset()
  mockInsert.mockReturnThis()
  mockUpdate.mockReturnThis()
  mockDelete.mockReturnThis()
  mockLimit.mockReturnThis()
  mockOrder.mockReturnThis()
}

mockFrom.mockImplementation(() => ({
  select: mockSelect,
  eq: mockEq,
  maybeSingle: mockMaybeSingle,
  single: mockSingle,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
  limit: mockLimit,
  order: mockOrder,
}))

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: (req: { userId?: string }, _rep: unknown, done: () => void) => {
    req.userId = 'user-1'
    done()
  },
}))

vi.mock('../../lib/crypto.js', () => ({
  encrypt: (plain: string) => `ENC(${plain})`,
  decrypt: (cipher: string) => cipher.replace(/^ENC\(/, '').replace(/\)$/, ''),
}))

process.env.ENCRYPTION_SECRET = 'test-secret'

const CHANNEL = { id: 'chan-1', org_id: 'org-1' }
const MEMBERSHIP = { org_id: 'org-1' }

import { channelsRoutes } from '../channels.js'

let app: FastifyInstance

beforeEach(async () => {
  vi.clearAllMocks()
  resetMocks()
  app = Fastify()
  await app.register(channelsRoutes, { prefix: '/channels' })
  await app.ready()
})

describe('POST /channels/:id/wordpress', () => {
  it('creates + encrypts password, returns 201', async () => {
    // getOrgId lookup
    mockSingle.mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
    // channel org check
    mockMaybeSingle.mockResolvedValueOnce({ data: CHANNEL, error: null })
    // existing wp config check (none)
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // insert
    mockSingle.mockResolvedValueOnce({
      data: { id: 'wp-1', channel_id: 'chan-1', site_url: 'https://x.com', username: 'u', password: 'ENC(p)' },
      error: null,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/channels/chan-1/wordpress',
      payload: { site_url: 'https://x.com', username: 'u', password: 'p' },
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.error).toBeNull()
    expect(body.data.password).toBeUndefined() // masked
    const insertCall = mockInsert.mock.calls[0][0]
    expect(insertCall.password).toBe('ENC(p)') // encrypted in DB
    expect(insertCall.channel_id).toBe('chan-1')
  })

  it('returns 409 WP_CONFIG_EXISTS when config already present', async () => {
    mockSingle.mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
    mockMaybeSingle.mockResolvedValueOnce({ data: CHANNEL, error: null })
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'wp-existing' }, error: null })

    const res = await app.inject({
      method: 'POST',
      url: '/channels/chan-1/wordpress',
      payload: { site_url: 'https://x.com', username: 'u', password: 'p' },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('WP_CONFIG_EXISTS')
  })

  it('returns 404 CHANNEL_NOT_FOUND when channel belongs to different org', async () => {
    mockSingle.mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const res = await app.inject({
      method: 'POST',
      url: '/channels/chan-x/wordpress',
      payload: { site_url: 'https://x.com', username: 'u', password: 'p' },
    })

    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('NOT_FOUND')
  })
})

describe('GET /channels/:id/wordpress', () => {
  it('returns 404 WP_CONFIG_NOT_FOUND when none exists', async () => {
    mockSingle.mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
    mockMaybeSingle.mockResolvedValueOnce({ data: CHANNEL, error: null })
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const res = await app.inject({ method: 'GET', url: '/channels/chan-1/wordpress' })

    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('WP_CONFIG_NOT_FOUND')
  })

  it('masks password on success', async () => {
    mockSingle.mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
    mockMaybeSingle.mockResolvedValueOnce({ data: CHANNEL, error: null })
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: 'wp-1', channel_id: 'chan-1', site_url: 'https://x.com', username: 'u', password: 'ENC(p)' },
      error: null,
    })

    const res = await app.inject({ method: 'GET', url: '/channels/chan-1/wordpress' })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.password).toBeUndefined()
    expect(body.data.site_url).toBe('https://x.com')
  })
})

describe('PUT /channels/:id/wordpress', () => {
  it('preserves existing password when none provided', async () => {
    mockSingle.mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
    mockMaybeSingle.mockResolvedValueOnce({ data: CHANNEL, error: null })
    mockSingle.mockResolvedValueOnce({
      data: { id: 'wp-1', channel_id: 'chan-1', site_url: 'https://new.com', username: 'u', password: 'ENC(p)' },
      error: null,
    })

    const res = await app.inject({
      method: 'PUT',
      url: '/channels/chan-1/wordpress',
      payload: { site_url: 'https://new.com' },
    })

    expect(res.statusCode).toBe(200)
    const updateCall = mockUpdate.mock.calls[0][0]
    expect(updateCall.password).toBeUndefined()
    expect(updateCall.site_url).toBe('https://new.com')
  })
})

describe('DELETE /channels/:id/wordpress', () => {
  it('deletes config', async () => {
    mockSingle.mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
    mockMaybeSingle.mockResolvedValueOnce({ data: CHANNEL, error: null })
    mockEq.mockResolvedValueOnce({ error: null })

    const res = await app.inject({ method: 'DELETE', url: '/channels/chan-1/wordpress' })

    expect(res.statusCode).toBe(200)
    expect(mockDelete).toHaveBeenCalled()
  })
})

describe('POST /channels/:id/wordpress/test', () => {
  it('returns { ok: true } when WP responds 200', async () => {
    mockSingle.mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
    mockMaybeSingle.mockResolvedValueOnce({ data: CHANNEL, error: null })
    mockMaybeSingle.mockResolvedValueOnce({
      data: { site_url: 'https://x.com', username: 'u', password: 'ENC(p)' },
      error: null,
    })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const res = await app.inject({ method: 'POST', url: '/channels/chan-1/wordpress/test' })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://x.com/wp-json/wp/v2/users/me',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringContaining('Basic ') }) }),
    )
  })

  it('returns { ok: false, message } when WP responds 401', async () => {
    mockSingle.mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
    mockMaybeSingle.mockResolvedValueOnce({ data: CHANNEL, error: null })
    mockMaybeSingle.mockResolvedValueOnce({
      data: { site_url: 'https://x.com', username: 'u', password: 'ENC(p)' },
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' }))

    const res = await app.inject({ method: 'POST', url: '/channels/chan-1/wordpress/test' })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.ok).toBe(false)
    expect(body.data.message).toMatch(/401|Unauthorized/i)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run apps/api/src/routes/__tests__/channels-wordpress.test.ts`
Expected: FAIL. Routes don't exist yet — 404 on all paths.

- [ ] **Step 3: Implement the routes in `apps/api/src/routes/channels.ts`**

Add the imports near the top of the file (after existing imports):

```ts
import { z } from 'zod';
import { encrypt, decrypt } from '../lib/crypto.js';
```

Add these inline Zod schemas near the top of the file (below the existing imports, above `getOrgId`):

```ts
const wpCreateSchema = z.object({
  site_url: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1),
});

const wpUpdateSchema = z.object({
  site_url: z.string().url().optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
});
```

Inside `channelsRoutes`, add this helper (above `GET /`):

```ts
async function loadChannelForOrg(sb: ReturnType<typeof createServiceClient>, id: string, orgId: string) {
  const { data } = await sb
    .from('channels')
    .select('id, org_id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (!data) throw new ApiError(404, 'Channel not found', 'NOT_FOUND');
  return data;
}
```

Add all five routes inside `channelsRoutes`, right before the final closing brace:

```ts
  /**
   * GET /:id/wordpress — Fetch config for a channel. Password masked.
   */
  fastify.get<{ Params: { id: string } }>('/:id/wordpress', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');
      const orgId = await getOrgId(request.userId);
      await loadChannelForOrg(sb, request.params.id, orgId);

      const { data: config } = await sb
        .from('wordpress_configs')
        .select('id, channel_id, site_url, username, created_at, updated_at')
        .eq('channel_id', request.params.id)
        .maybeSingle();
      if (!config) throw new ApiError(404, 'No WordPress config on this channel', 'WP_CONFIG_NOT_FOUND');

      return reply.send({ data: config, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /:id/wordpress — Create config (1:1, encrypted password).
   */
  fastify.post<{ Params: { id: string } }>('/:id/wordpress', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');
      if (!process.env.ENCRYPTION_SECRET) {
        throw new ApiError(500, 'ENCRYPTION_SECRET not configured', 'CONFIGURATION_ERROR');
      }
      const orgId = await getOrgId(request.userId);
      await loadChannelForOrg(sb, request.params.id, orgId);

      const body = wpCreateSchema.parse(request.body);

      const { data: existing } = await sb
        .from('wordpress_configs')
        .select('id')
        .eq('channel_id', request.params.id)
        .maybeSingle();
      if (existing) {
        throw new ApiError(409, 'Channel already has a WordPress config', 'WP_CONFIG_EXISTS');
      }

      const { data: config, error } = await sb
        .from('wordpress_configs')
        .insert({
          channel_id: request.params.id,
          site_url: body.site_url,
          username: body.username,
          password: encrypt(body.password),
        })
        .select('id, channel_id, site_url, username, created_at, updated_at')
        .single();
      if (error) throw error;

      return reply.status(201).send({ data: config, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PUT /:id/wordpress — Partial update. Re-encrypt password if provided.
   */
  fastify.put<{ Params: { id: string } }>('/:id/wordpress', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');
      const orgId = await getOrgId(request.userId);
      await loadChannelForOrg(sb, request.params.id, orgId);

      const body = wpUpdateSchema.parse(request.body);

      const updateData: Record<string, string> = {};
      if (body.site_url) updateData.site_url = body.site_url;
      if (body.username) updateData.username = body.username;
      if (body.password) {
        if (!process.env.ENCRYPTION_SECRET) {
          throw new ApiError(500, 'ENCRYPTION_SECRET not configured', 'CONFIGURATION_ERROR');
        }
        updateData.password = encrypt(body.password);
      }

      const { data: config, error } = await sb
        .from('wordpress_configs')
        .update(updateData)
        .eq('channel_id', request.params.id)
        .select('id, channel_id, site_url, username, updated_at')
        .single();
      if (error) throw error;
      if (!config) throw new ApiError(404, 'No WordPress config on this channel', 'WP_CONFIG_NOT_FOUND');

      return reply.send({ data: config, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /:id/wordpress — Remove config.
   */
  fastify.delete<{ Params: { id: string } }>('/:id/wordpress', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');
      const orgId = await getOrgId(request.userId);
      await loadChannelForOrg(sb, request.params.id, orgId);

      const { error } = await sb
        .from('wordpress_configs')
        .delete()
        .eq('channel_id', request.params.id);
      if (error) throw error;

      return reply.send({ data: { deleted: true }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /:id/wordpress/test — Verify credentials via GET /wp-json/wp/v2/users/me.
   * Does not throw on bad credentials; returns { ok: false, message } in body.
   */
  fastify.post<{ Params: { id: string } }>('/:id/wordpress/test', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');
      const orgId = await getOrgId(request.userId);
      await loadChannelForOrg(sb, request.params.id, orgId);

      const { data: config } = await sb
        .from('wordpress_configs')
        .select('site_url, username, password')
        .eq('channel_id', request.params.id)
        .maybeSingle();
      if (!config) throw new ApiError(404, 'No WordPress config on this channel', 'WP_CONFIG_NOT_FOUND');

      const auth = Buffer.from(`${config.username}:${decrypt(config.password)}`).toString('base64');
      const url = `${config.site_url.replace(/\/$/, '')}/wp-json/wp/v2/users/me`;
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          return reply.send({ data: { ok: true, message: 'Connection OK' }, error: null });
        }
        return reply.send({
          data: { ok: false, message: `WordPress responded ${res.status} ${res.statusText}` },
          error: null,
        });
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : 'Network error';
        return reply.send({ data: { ok: false, message: msg }, error: null });
      }
    } catch (error) {
      return sendError(reply, error);
    }
  });
```

- [ ] **Step 4: Update persona→WP link route**

In `apps/api/src/routes/personas.ts`, replace lines 233-246 (the `channel.wordpress_config_id` lookup) with a direct `wordpress_configs.channel_id` query:

```ts
    const { data: channel } = await sb
      .from('channels')
      .select('id')
      .eq('id', body.channelId)
      .maybeSingle()
    if (!channel) throw new ApiError(404, 'Channel not found', 'CHANNEL_NOT_FOUND')

    const { decrypt } = await import('../lib/crypto.js')
    const { data: wpConfig } = await sb
      .from('wordpress_configs')
      .select('site_url, username, password')
      .eq('channel_id', body.channelId)
      .maybeSingle()
    if (!wpConfig) throw new ApiError(400, 'Channel has no WordPress config', 'NO_WP_CONFIG')
```

- [ ] **Step 5: Run tests — all pass**

Run: `npx vitest run apps/api/src/routes/__tests__/channels-wordpress.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: failures in `wordpress.ts` (legacy `/publish`), `PersonaForm.tsx`, and publish client files. `personas.ts` should now be clean. Record remaining failures — they belong to Tasks 3, 5, 6.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/channels.ts apps/api/src/routes/personas.ts apps/api/src/routes/__tests__/channels-wordpress.test.ts
git commit -m "$(cat <<'EOF'
feat(api): channel-scoped WordPress routes (POST/GET/PUT/DELETE/test)

Mount new nested routes under /api/channels/:id/wordpress. Each route checks
org ownership via the existing getOrgId pattern before touching the config.
Password encryption (AES-256-GCM) unchanged. New error codes:
WP_CONFIG_NOT_FOUND (404), WP_CONFIG_EXISTS (409). Test endpoint authenticates
against GET /wp-json/wp/v2/users/me.

Also updates persona → WP author link to look up the config via
wordpress_configs.channel_id instead of the removed channels.wordpress_config_id.
EOF
)"
```

---

## Task 3: Publish routes derive WP config from channel — drop configId

**Commit:** `refactor(api): publish-draft derives WP config from channel, drop configId`

**Files:**
- Modify: `packages/shared/src/schemas/pipeline.ts:151-167` — remove `configId` from `publishDraftSchema`
- Modify: `apps/api/src/routes/wordpress.ts` — `/publish-draft` + `/publish-draft/stream` + legacy `/publish` lookup; `resolveWpConfig` helper
- Modify: `apps/app/src/components/engines/PublishEngine.tsx:41-53` — stop sending `configId`
- Modify: `apps/app/src/components/preview/PublishPanel.tsx` — remove config fetch + picker; drop `configId` from `onPublish` params
- Modify: `apps/app/src/components/wordpress/PublishingForm.tsx` — remove config picker; drop `config_id` from `/publish` body
- Modify: `apps/api/src/__tests__/routes/wordpress.test.ts` — update fixtures

- [ ] **Step 1: Update `publishDraftSchema`**

In `packages/shared/src/schemas/pipeline.ts`, remove `configId: z.string().uuid().optional(),` (line 153). Leave everything else in the schema untouched.

Result should be:

```ts
export const publishDraftSchema = z.object({
  draftId: z.string().uuid(),
  mode: z.enum(['draft', 'publish', 'schedule']),
  scheduledDate: z.string().datetime().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  imageMap: z.record(z.string(), z.string().uuid()).optional(),
  altTexts: z.record(z.string(), z.string()).optional(),
  seoOverrides: z.object({
    title: z.string(),
    slug: z.string(),
    metaDescription: z.string(),
  }).optional(),
  authorId: z.number().int().optional(),
  idempotencyToken: z.string().uuid().optional(),
});
```

- [ ] **Step 2: Replace `resolveWpConfig` helper in `wordpress.ts`**

Replace the helper at `apps/api/src/routes/wordpress.ts:341-355` with a channel-based variant:

```ts
// Helper: Resolve WordPress config for a channel (fetch and decrypt)
async function resolveWpConfigForChannel(
  sb: ReturnType<typeof createServiceClient>,
  channelId: string,
) {
  const { data: config, error } = await sb
    .from('wordpress_configs')
    .select('*')
    .eq('channel_id', channelId)
    .maybeSingle();
  if (error) throw error;
  if (!config) return null;
  return {
    site_url: config.site_url as string,
    username: config.username as string,
    password: decrypt(config.password as string),
  };
}
```

- [ ] **Step 3: Update `POST /publish-draft` handler**

In `wordpress.ts`, at the credential resolution (lines ~1485-1503), replace the `if (body.configId) { ... } else { throw ... }` block with:

```ts
      // Derive WP config from the draft's channel
      if (!draft.channel_id) {
        throw new ApiError(400, 'Draft has no channel_id', 'VALIDATION_ERROR');
      }
      const wpConfig = await resolveWpConfigForChannel(sb, draft.channel_id as string);
      if (!wpConfig) {
        throw new ApiError(400, 'Channel has no WordPress configured', 'NO_WP_CONFIG');
      }
      const { site_url, username, password } = wpConfig;
```

- [ ] **Step 4: Update `POST /publish-draft/stream` handler**

In `wordpress.ts`, in the stream variant (around line 940-943), replace:

```ts
        sendEvent('preparing', 'Loading WordPress configuration...');
        const wpConfig = await resolveWpConfig(sb, body.configId);
        if (!wpConfig) throw new ApiError(404, 'WordPress config not found');
```

with:

```ts
        sendEvent('preparing', 'Loading WordPress configuration...');
        if (!draft.channel_id) {
          throw new ApiError(400, 'Draft has no channel_id', 'VALIDATION_ERROR');
        }
        const wpConfig = await resolveWpConfigForChannel(sb, draft.channel_id as string);
        if (!wpConfig) {
          throw new ApiError(400, 'Channel has no WordPress configured', 'NO_WP_CONFIG');
        }
```

- [ ] **Step 5: Update legacy `POST /publish` handler**

In `wordpress.ts` at lines ~681-708 (the `if (body.config_id) { ... } else if (body.site_url && ...)` branch), replace the whole credential-resolution block with a project→channel derivation:

```ts
      // Derive WP config from the project's channel (channel-scoped)
      if (!project.channel_id) {
        throw new ApiError(400, 'Project has no channel assigned', 'VALIDATION_ERROR');
      }
      const { data: config, error: cfgErr } = await sb
        .from('wordpress_configs')
        .select('*')
        .eq('channel_id', project.channel_id)
        .maybeSingle();
      if (cfgErr) throw cfgErr;
      if (!config) {
        throw new ApiError(400, 'Channel has no WordPress configured', 'NO_WP_CONFIG');
      }

      const site_url = config.site_url;
      const username = config.username;
      const password = decrypt(config.password);
```

Do NOT preserve the inline-credentials branch (`body.site_url && body.username && body.password`). The legacy endpoint now only accepts the channel-derived path.

- [ ] **Step 6: Update the publish schemas that still reference `config_id`**

Open `packages/shared/src/schemas/wordpress.ts` and find `publishToWordPressSchema`. Remove its `config_id` field (and the inline `site_url`/`username`/`password` fallback fields if they exist there). Leave the non-credential fields (status, categories, tags, featured_image_asset_id) intact.

Also strip `config_id` / `site_url` / `username` / `password` out of `fetchTagsQuerySchema` and `fetchCategoriesQuerySchema`, and add `channel_id: z.string().uuid()` as a required query param.

- [ ] **Step 7: Update `/tags` and `/categories` route handlers**

In `wordpress.ts`, replace the credential-resolution block in both handlers with:

```ts
      const sb = createServiceClient();
      const { data: config } = await sb
        .from('wordpress_configs')
        .select('site_url, username, password')
        .eq('channel_id', params.channel_id)
        .maybeSingle();
      if (!config) {
        throw new ApiError(404, 'Channel has no WordPress configured', 'WP_CONFIG_NOT_FOUND');
      }
      const site_url = config.site_url;
      const username = config.username;
      const password = decrypt(config.password);
```

- [ ] **Step 8: Update `PublishEngine.tsx`**

In `apps/app/src/components/engines/PublishEngine.tsx`:

Change the function signature on line 41 from:

```ts
function handlePublish(params: { mode: string; configId: string; scheduledDate?: string }) {
```

to:

```ts
function handlePublish(params: { mode: string; scheduledDate?: string }) {
```

Remove the `configId` passed to `tracker.trackStarted` on line 45 and from the `body` on line 49. Resulting block:

```ts
    modeRef.current = params.mode;
    tracker.trackStarted({ draftId, mode: params.mode });

    const body: Record<string, unknown> = {
      draftId,
      mode: params.mode,
      scheduledDate: params.scheduledDate,
      idempotencyToken: crypto.randomUUID(),
    };
```

- [ ] **Step 9: Update `PublishPanel.tsx`**

In `apps/app/src/components/preview/PublishPanel.tsx`:

- Remove the `WordPressConfig` interface, `configs`/`selectedConfig` state, the `useEffect` that fetches `/api/wordpress/config`, and the "WordPress Site" `<div>` block (lines ~138-168).
- Change `onPublish` prop type from `(params: { mode: string; configId: string; scheduledDate?: string }) => void` to `(params: { mode: string; scheduledDate?: string }) => void`.
- Update the `Button onClick` to pass only `{ mode, scheduledDate }`.
- Update disabled logic: drop `!configId || configs.length === 0`. Leave `isPublishing`. Draft-not-ready + no-assets are already covered by `canPublish`.
- Update button label: drop the `to ${selectedConfig.site_url}` suffix.

- [ ] **Step 10: Update `PublishingForm.tsx`**

In `apps/app/src/components/wordpress/PublishingForm.tsx`:

- Remove `WordPressConfig` interface, `configs`/`selectedConfigId` state, `loadingConfigs`, the `fetchConfigs()` function, and the early-return block that checks `configs.length === 0`.
- In `handlePublish`, drop `config_id: selectedConfigId` from the body and remove the `if (!selectedConfigId)` guard at the top.
- Remove any UI rendering a config `<Select>` (search for `selectedConfigId` in JSX and delete the surrounding field).
- The "Configure WordPress" link button (line ~307) lives inside the `configs.length === 0` block that was just removed; nothing more to do for it.
- Update the saved-state YAML (`handleSaveProgress`): remove `selectedConfigId` from the object and from the `initialYaml` restore effect.

- [ ] **Step 11: Update API tests**

In `apps/api/src/__tests__/routes/wordpress.test.ts`, remove any `configId` from publish-draft fixtures. For the draft-lookup stub, ensure the draft fixture includes `channel_id: 'chan-1'`. Add a `wordpress_configs` mock chain that responds to `.eq('channel_id', 'chan-1').maybeSingle()` with the expected config.

Run: `npx vitest run apps/api/src/__tests__/routes/wordpress.test.ts`
Expected: PASS.

- [ ] **Step 12: Full typecheck**

Run: `npm run typecheck`
Expected: remaining failures only in `PersonaForm.tsx` (fixed in Task 6) and the `/settings/wordpress` page (deleted in Task 7). Nothing else.

- [ ] **Step 13: Commit**

```bash
git add packages/shared/src/schemas/pipeline.ts packages/shared/src/schemas/wordpress.ts apps/api/src/routes/wordpress.ts apps/api/src/__tests__/routes/wordpress.test.ts apps/app/src/components/engines/PublishEngine.tsx apps/app/src/components/preview/PublishPanel.tsx apps/app/src/components/wordpress/PublishingForm.tsx
git commit -m "$(cat <<'EOF'
refactor(api): publish-draft derives WP config from channel, drop configId

publishDraftSchema loses configId. Publish-draft and publish-draft/stream look
up the config via content_drafts.channel_id → wordpress_configs.channel_id.
Legacy /publish resolves via projects.channel_id. /tags and /categories now
take channel_id instead of config_id.

Frontend publish clients (PublishEngine, PublishPanel, PublishingForm) no
longer render a config picker or send configId — credentials follow the
channel.
EOF
)"
```

---

## Task 4: Remove global /api/wordpress/config endpoints

**Commit:** `refactor(api): remove global /api/wordpress/config endpoints`

**Files:**
- Modify: `apps/api/src/routes/wordpress.ts` — delete six config CRUD handlers
- Modify: `apps/api/src/__tests__/routes/wordpress.test.ts` — delete `/config` test cases

- [ ] **Step 1: Delete the six config handlers**

In `apps/api/src/routes/wordpress.ts`, delete the following handler blocks entirely (each is a `fastify.<method>('/config...')` registration):

- `fastify.post('/config', ...)` — lines ~361-407
- `fastify.get('/config', ...)` — lines ~412-435
- `fastify.get('/config/:id', ...)` — lines ~440-470
- `fastify.put('/config/:id', ...)` — lines ~475-533
- `fastify.patch('/config/:id', ...)` — lines ~538-595
- `fastify.delete('/config/:id', ...)` — lines ~600-625

Also delete the module-level `createConfigSchema` and `updateConfigSchema` declarations (lines ~58-68) — no other handler uses them now.

- [ ] **Step 2: Delete matching tests**

In `apps/api/src/__tests__/routes/wordpress.test.ts`, delete any `describe`/`it` blocks that hit `/config`. Keep publish-related tests.

- [ ] **Step 3: Confirm nothing else references these endpoints**

Run: `grep -rn "/api/wordpress/config" apps/`
Expected: no matches (PublishEngine, PublishPanel, PublishingForm already updated in Task 3).

- [ ] **Step 4: Run tests + typecheck**

Run: `npm run test:api && npm run typecheck`
Expected: test:api PASS; typecheck shows only the PersonaForm / `/settings/wordpress` residue.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/wordpress.ts apps/api/src/__tests__/routes/wordpress.test.ts
git commit -m "$(cat <<'EOF'
refactor(api): remove global /api/wordpress/config endpoints

Delete POST/GET/GET(:id)/PUT/PATCH/DELETE /api/wordpress/config* — the
channel-scoped equivalents on /api/channels/:id/wordpress supersede them.
Drop the corresponding schemas and tests. No remaining consumers.
EOF
)"
```

---

## Task 5: Channel detail Blog tab — WordPress card

**Commit:** `feat(app): channel detail Blog tab — WordPress card`

**Files:**
- Modify: `apps/app/src/app/[locale]/(app)/channels/[id]/page.tsx` — add a WordPress card inside the existing `<TabsContent value="blog">` (currently ends around line 831)

The card has two states:

- **No config** — "Connect WordPress" form with `site_url`, `username`, `password` fields and a Save button.
- **Has config** — summary (site URL, username; password never shown), and Test / Edit / Remove actions.

- [ ] **Step 1: Add state + fetch hook**

Near the other `useState` declarations in `ChannelDetailPage`, add:

```tsx
interface WpConfig {
  id: string;
  channel_id: string;
  site_url: string;
  username: string;
  created_at: string;
  updated_at: string;
}

const [wpConfig, setWpConfig] = useState<WpConfig | null>(null);
const [wpLoading, setWpLoading] = useState(false);
const [wpEditing, setWpEditing] = useState(false);
const [wpSaving, setWpSaving] = useState(false);
const [wpTesting, setWpTesting] = useState(false);
const [wpTestResult, setWpTestResult] = useState<{ ok: boolean; message: string } | null>(null);
const [wpConfirmDelete, setWpConfirmDelete] = useState(false);
const [wpSiteUrl, setWpSiteUrl] = useState('');
const [wpUsername, setWpUsername] = useState('');
const [wpPassword, setWpPassword] = useState('');
```

Add a fetch helper (below `fetchBlogMetrics`):

```tsx
const fetchWpConfig = useCallback(async () => {
  if (!hasBlog) return;
  setWpLoading(true);
  try {
    const res = await fetch(`/api/channels/${id}/wordpress`);
    const json = await res.json();
    if (json.data) {
      setWpConfig(json.data);
      setWpSiteUrl(json.data.site_url);
      setWpUsername(json.data.username);
    } else {
      setWpConfig(null);
    }
  } catch {
    setWpConfig(null);
  } finally {
    setWpLoading(false);
  }
}, [hasBlog, id]);

useEffect(() => { fetchWpConfig(); }, [fetchWpConfig]);
```

(Reminder: move `const hasBlog = mediaTypes.includes('blog');` above `fetchWpConfig` — it currently sits inside the render body around line 364.)

- [ ] **Step 2: Add save/test/delete handlers**

```tsx
async function handleSaveWp() {
  setWpSaving(true);
  try {
    const method = wpConfig ? 'PUT' : 'POST';
    const payload: Record<string, string> = { site_url: wpSiteUrl, username: wpUsername };
    if (wpPassword) payload.password = wpPassword;
    const res = await fetch(`/api/channels/${id}/wordpress`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message);
      return;
    }
    toast.success(wpConfig ? 'WordPress updated' : 'WordPress connected');
    setWpPassword('');
    setWpEditing(false);
    setWpTestResult(null);
    await fetchWpConfig();
  } catch {
    toast.error('Failed to save');
  } finally {
    setWpSaving(false);
  }
}

async function handleTestWp() {
  setWpTesting(true);
  setWpTestResult(null);
  try {
    const res = await fetch(`/api/channels/${id}/wordpress/test`, { method: 'POST' });
    const json = await res.json();
    if (json.error) {
      setWpTestResult({ ok: false, message: json.error.message });
    } else {
      setWpTestResult(json.data);
    }
  } catch (err) {
    setWpTestResult({ ok: false, message: err instanceof Error ? err.message : 'Network error' });
  } finally {
    setWpTesting(false);
  }
}

async function handleDeleteWp() {
  try {
    const res = await fetch(`/api/channels/${id}/wordpress`, { method: 'DELETE' });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message);
      return;
    }
    toast.success('WordPress disconnected');
    setWpConfig(null);
    setWpSiteUrl('');
    setWpUsername('');
    setWpPassword('');
    setWpConfirmDelete(false);
    setWpTestResult(null);
  } catch {
    toast.error('Failed to remove');
  }
}
```

- [ ] **Step 3: Render the card inside the Blog tab**

Insert this JSX inside the existing `<TabsContent value="blog">` (just below the closing `</Card>` of the blog-URL/metrics Card, before the closing `</TabsContent>`):

```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Globe className="h-5 w-5" /> WordPress
    </CardTitle>
    <CardDescription>
      Conecte o site WordPress pra publicar posts direto deste canal.
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {wpLoading ? (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ) : !wpConfig || wpEditing ? (
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Site URL</Label>
          <Input value={wpSiteUrl} onChange={(e) => setWpSiteUrl(e.target.value)} placeholder="https://your-site.com" />
        </div>
        <div className="space-y-2">
          <Label>Username</Label>
          <Input value={wpUsername} onChange={(e) => setWpUsername(e.target.value)} placeholder="admin" />
        </div>
        <div className="space-y-2">
          <Label>{wpConfig ? 'Application Password (leave blank to keep current)' : 'Application Password'}</Label>
          <Input
            type="password"
            value={wpPassword}
            onChange={(e) => setWpPassword(e.target.value)}
            placeholder="xxxx xxxx xxxx xxxx"
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSaveWp}
            disabled={wpSaving || !wpSiteUrl || !wpUsername || (!wpConfig && !wpPassword)}
          >
            {wpSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {wpConfig ? 'Save changes' : 'Connect'}
          </Button>
          {wpConfig && (
            <Button variant="outline" onClick={() => { setWpEditing(false); setWpSiteUrl(wpConfig.site_url); setWpUsername(wpConfig.username); setWpPassword(''); }}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    ) : (
      <div className="space-y-3">
        <div className="space-y-1 text-sm">
          <div><span className="text-muted-foreground">URL:</span> <span className="font-mono">{wpConfig.site_url}</span></div>
          <div><span className="text-muted-foreground">User:</span> {wpConfig.username}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleTestWp} disabled={wpTesting}>
            {wpTesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TestTube className="h-4 w-4 mr-2" />}
            Test
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWpEditing(true)}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWpConfirmDelete(true)}>
            <Trash2 className="h-4 w-4 mr-1 text-destructive" /> Remove
          </Button>
        </div>
        {wpTestResult && (
          <p className={`text-sm ${wpTestResult.ok ? 'text-green-600' : 'text-destructive'}`}>
            {wpTestResult.ok ? '✓ ' : '✗ '}{wpTestResult.message}
          </p>
        )}
      </div>
    )}
  </CardContent>
</Card>

<AlertDialog open={wpConfirmDelete} onOpenChange={setWpConfirmDelete}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Remove WordPress?</AlertDialogTitle>
      <AlertDialogDescription>
        This disconnects WordPress from this channel. Publishing will be unavailable until you reconnect.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDeleteWp} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
        Remove
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Add the imports this card uses to the file header:

```tsx
import { Globe, TestTube } from 'lucide-react';  // already have lucide imports — add these
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: pass in this file (PersonaForm / `/settings/wordpress` residue remains for Tasks 6-7).

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`
- Create/pick a channel with `blog` in media types.
- Channel detail → Blog tab → see the WordPress card in "No config" state.
- Fill URL/user/pass, click Connect → card flips to summary view.
- Click Test → button shows spinner, then green checkmark (assuming valid creds).
- Click Edit → form re-opens with existing values, password blank.
- Click Remove → confirm dialog → card flips back to "No config" state.

Say "UI not tested" if `npm run dev` cannot be started in the environment.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/app/[locale]/(app)/channels/[id]/page.tsx
git commit -m "$(cat <<'EOF'
feat(app): channel detail Blog tab — WordPress card

Add a WordPress card inside the channel detail Blog tab. Connect / Test /
Edit / Remove flows, all scoped to the active channel. Replaces the global
/settings/wordpress page as the place users manage their WP credentials.
EOF
)"
```

---

## Task 6: PersonaForm channel filter via has_wordpress flag

**Commit:** `feat(app): PersonaForm channel filter via has_wordpress flag`

**Files:**
- Modify: `apps/api/src/routes/channels.ts` — `GET /` joins `wordpress_configs(id)` and maps `has_wordpress: boolean` on each item
- Modify: `apps/app/src/components/personas/PersonaForm.tsx:101-118` — switch filter to `has_wordpress`
- Modify: `apps/api/src/routes/__tests__/channels-wordpress.test.ts` — add a test for the `has_wordpress` field

- [ ] **Step 1: Write failing test for has_wordpress**

Add to `apps/api/src/routes/__tests__/channels-wordpress.test.ts` inside the outermost `describe('channelsRoutes')` block (or create one if it doesn't exist):

```ts
describe('GET /channels (has_wordpress flag)', () => {
  it('adds has_wordpress=true when a config row is present, false otherwise', async () => {
    mockSingle.mockResolvedValueOnce({ data: MEMBERSHIP, error: null })
    mockOrder.mockResolvedValueOnce({
      data: [
        { id: 'c1', name: 'With WP', org_id: 'org-1', wordpress_configs: [{ id: 'wp-1' }] },
        { id: 'c2', name: 'Without WP', org_id: 'org-1', wordpress_configs: [] },
      ],
      error: null,
      count: 2,
    })

    const res = await app.inject({ method: 'GET', url: '/channels' })

    expect(res.statusCode).toBe(200)
    const { data } = JSON.parse(res.body)
    expect(data.items[0].has_wordpress).toBe(true)
    expect(data.items[1].has_wordpress).toBe(false)
    expect(data.items[0].wordpress_configs).toBeUndefined() // nested row stripped from response
  })
})
```

Run: `npx vitest run apps/api/src/routes/__tests__/channels-wordpress.test.ts`
Expected: FAIL (field not present yet).

- [ ] **Step 2: Update `GET /` in `channels.ts`**

Replace the existing query in `GET /` (lines ~51-57) with a version that joins the 1:1 child and maps the flag:

```ts
      const { data: channels, error, count } = await sb
        .from('channels')
        .select('*, wordpress_configs(id)', { count: 'exact' })
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const items = (channels ?? []).map((c: Record<string, unknown>) => {
        const wp = c.wordpress_configs as Array<unknown> | null;
        const { wordpress_configs, ...rest } = c as { wordpress_configs?: unknown } & Record<string, unknown>;
        return { ...rest, has_wordpress: Array.isArray(wp) ? wp.length > 0 : wp != null };
      });

      reply.header('Cache-Control', 'private, max-age=60');
      return reply.send({
        data: { items, total: count, page, limit },
        error: null,
      });
```

- [ ] **Step 3: Re-run the test**

Run: `npx vitest run apps/api/src/routes/__tests__/channels-wordpress.test.ts`
Expected: PASS.

- [ ] **Step 4: Update `PersonaForm.tsx`**

In `apps/app/src/components/personas/PersonaForm.tsx`, replace lines 101-118 with:

```tsx
    const [channels, setChannels] = useState<Array<{ id: string; name: string; has_wordpress: boolean }>>([])
    const [rawChannelCount, setRawChannelCount] = useState(0)
    const [selectedChannelId, setSelectedChannelId] = useState<string>("")

    useEffect(() => {
        if (!personaId) return
        fetch("/api/channels")
            .then(r => r.json())
            .then(({ data }) => {
                const items = (data?.items ?? []) as Array<{ id: string; name: string; has_wordpress: boolean }>
                setRawChannelCount(items.length)
                const wpConfiguredChannels = items.filter(c => c.has_wordpress)
                setChannels(wpConfiguredChannels)
                if (wpConfiguredChannels.length && !selectedChannelId) setSelectedChannelId(wpConfiguredChannels[0].id)
            })
            .catch(() => { /* channel list is optional — silently skip if it fails */ })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [personaId])
```

Also update the "no WP channels" copy on line 270 to reflect the new UX:

```tsx
                ) : channels.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None of your channels have WordPress configured. Connect it in Channel → Blog → WordPress first.</p>
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: only the `/settings/wordpress` page residue remains (fixed in Task 7).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/channels.ts apps/api/src/routes/__tests__/channels-wordpress.test.ts apps/app/src/components/personas/PersonaForm.tsx
git commit -m "$(cat <<'EOF'
feat(app): PersonaForm channel filter via has_wordpress flag

GET /api/channels joins wordpress_configs(id) and maps a derived
has_wordpress: boolean on each item. PersonaForm uses this flag to filter
the channel picker in the Integrations section, replacing the removed
channels.wordpress_config_id check.
EOF
)"
```

---

## Task 7: Remove /settings/wordpress page, nav, breadcrumb, i18n

**Commit:** `chore(app): remove /settings/wordpress page, nav, breadcrumb, i18n`

**Files:**
- Delete: `apps/app/src/app/[locale]/(app)/settings/wordpress/page.tsx` (and the empty folder)
- Modify: `apps/app/src/components/layout/Sidebar.tsx:82` — remove the `/settings/wordpress` nav entry
- Modify: `apps/app/src/components/layout/Topbar.tsx:27` — remove the `/settings/wordpress` title mapping
- Modify: `apps/app/src/app/[locale]/(app)/settings/page.tsx:42-47` — remove the WordPress card from the settings index
- Modify: `apps/app/messages/en.json` — remove `pages.settingsWordpress`
- Modify: `apps/app/messages/pt-BR.json` — remove `pages.settingsWordpress`

- [ ] **Step 1: Delete the settings page**

```bash
rm -rf apps/app/src/app/[locale]/\(app\)/settings/wordpress/
```

- [ ] **Step 2: Edit Sidebar**

In `apps/app/src/components/layout/Sidebar.tsx`, delete line 82:

```tsx
                { href: "/settings/wordpress", label: "WordPress", icon: Globe },
```

Also remove `Globe` from the lucide-react import on line 12 if it is now unused.

- [ ] **Step 3: Edit Topbar**

In `apps/app/src/components/layout/Topbar.tsx`, delete the entry on line 27:

```tsx
    "/settings/wordpress": { ns: "pages", key: "settingsWordpress" },
```

- [ ] **Step 4: Edit Settings index**

In `apps/app/src/app/[locale]/(app)/settings/page.tsx`, remove the WordPress object from `settingsCards` (lines 42-47):

```tsx
        {
            title: "WordPress",
            description: "Conecte o site WordPress pra publicar posts direto da plataforma. Sem isso, dá pra marcar como publicado manualmente.",
            href: "/settings/wordpress",
            icon: <Globe className="h-6 w-6" />,
        },
```

Also remove `Globe` from the lucide-react import on that page if unused afterward.

- [ ] **Step 5: Remove i18n keys**

In `apps/app/messages/en.json`, delete the line:

```json
        "settingsWordpress": "WordPress"
```

and fix the trailing comma on the preceding line so JSON remains valid.

Repeat for `apps/app/messages/pt-BR.json`.

- [ ] **Step 6: Confirm no dangling references**

Run: `grep -rn "/settings/wordpress\|settingsWordpress" apps/`
Expected: no matches.

- [ ] **Step 7: Build + typecheck + lint**

Run: `npm run typecheck && npm run lint && npm run build:api`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add -u apps/app/src/app/[locale]/\(app\)/settings/ apps/app/src/components/layout/Sidebar.tsx apps/app/src/components/layout/Topbar.tsx apps/app/messages/en.json apps/app/messages/pt-BR.json
git commit -m "$(cat <<'EOF'
chore(app): remove /settings/wordpress page, nav, breadcrumb, i18n

The global WordPress settings page is superseded by the WordPress card on
channel-detail → Blog. Remove the page, sidebar entry, breadcrumb mapping,
settings-index card, and the settingsWordpress i18n key in both locales.
EOF
)"
```

---

## Documentation Updates

Per `.claude/rules/docs-update-on-code-change.md`:

- [ ] **Step 1: Update API reference**

`apps/docs-site/src/content/api-reference/wordpress.md` — remove the `/config*` CRUD section; document publish-draft without `configId`; cross-link to the new channel-scoped routes.

`apps/docs-site/src/content/api-reference/channels.md` (create if missing, else extend) — document `GET/POST/PUT/DELETE /api/channels/:id/wordpress` and `POST /api/channels/:id/wordpress/test`.

- [ ] **Step 2: Update schema docs**

`apps/docs-site/src/content/database/schema.md` — note: `wordpress_configs.channel_id` now required + unique; `channels.wordpress_config_id` removed; `wordpress_configs.user_id`/`org_id` removed.

- [ ] **Step 3: Commit docs**

```bash
git add apps/docs-site/src/content/
git commit -m "docs: WordPress config channel-scoping (schema + routes)"
```

---

## Verification

After all tasks:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test:api` passes
- [ ] `npm run build:api` succeeds
- [ ] `grep -rn "wordpress_config_id" apps/` returns 0 matches (outside of docs-site historical milestones)
- [ ] `grep -rn "/settings/wordpress" apps/` returns 0 matches
- [ ] Manual: end-to-end flow — create channel → connect WP in Blog tab → link persona → run pipeline → post appears on WP

---

## Self-Review Notes

- **Spec coverage:** Each §Commits item in the design maps to Tasks 1-7 here (plus a bundled docs commit).
- **Placeholder scan:** No TBDs; every code step shows concrete code, file paths and line ranges.
- **Type consistency:** `WpConfig`, `PublishPanelProps.onPublish`, `publishDraftSchema`, `has_wordpress` all consistent across tasks.
- **Types regen coupling:** Task 1 intentionally leaves downstream typecheck errors visible; Tasks 2-7 resolve them in order.
- **Token in legacy /publish:** The inline-credentials branch is removed. If any external caller still posts `site_url`/`username`/`password`, it now 400s with `VALIDATION_ERROR` — acceptable per spec.
