# WordPress Configs Per Channel — Design Spec & Migration Plan

**Date:** 2026-04-20  
**Status:** draft — amendments applied 2026-04-20 (multi-editor + channel-can-swap-WP)
**Phase:** Phase 2 (Channels & Multi-Tenancy)

---

## Goal

Decouple WordPress site configurations from the user/account level and link them to channels instead. Currently, `wordpress_configs` are user-scoped. Target model: **each channel has one WordPress config at a time (but can be swapped), and each WordPress config can be accessed by multiple editors who belong to the channel's team.**

---

## Executive Summary

- **Current state:** `wordpress_configs.user_id` → one WordPress config per user, shared across all projects
- **Target state:** `wordpress_configs.channel_id` → each channel has exactly one WordPress config at any time. History of swaps tracked. Multiple editors (via `channel_members`) can use the same config.
- **Prerequisite:** `channels` table exists (added in migration `20260412234959_channels.sql`). **New table `channel_members` required for multi-editor access.**
- **Breaking change:** API contract changes from `user_id`-based queries to `channel_id`-based queries
- **Impact scope:** 2 database migrations, 4 API route handlers, 3 UI components, 2 Zod schemas, 1 mapper file
- **Rollout:** dev first (test with channels table), then prod

---

## AMENDMENTS (2026-04-20)

### A1. WordPress config can be swapped over time
- `channels.wordpress_config_id` is mutable (FK, NOT NULL enforced when channel is publishing-ready).
- When user swaps WP config, old config row stays (for history + other channels that may reference it).
- Unique constraint: **(channel_id, is_active=true)** in junction table `channel_wordpress_history` — only one active at a time.
- Optional table `channel_wordpress_history` (channel_id, wordpress_config_id, activated_at, deactivated_at, activated_by_user_id) — audit trail.

### A2. Multi-editor per channel
- New table `channel_members` (channel_id, user_id, role, added_at, added_by):
  - `role` enum: `owner`, `editor`, `viewer`
  - Unique `(channel_id, user_id)`
- API permission check reads `channel_members` to decide if user can read/publish the channel's WP config.
- `wordpress_configs.user_id` semantics change: becomes `created_by_user_id` (ownership/audit), not access control.
- Access control lives in `channel_members`, not on config directly.

### A3. Migration from single-editor
- Existing `channels.user_id` backfills as `owner` in `channel_members`.
- `wordpress_configs` created_by_user_id = current `user_id`.
- No data loss; add row to `channel_members` for each existing channel.

### A4. Permission matrix

| Action | owner | editor | viewer |
|--------|-------|--------|--------|
| Read WP config (metadata only, no password) | ✓ | ✓ | ✓ |
| Read decrypted WP password | ✓ | ✓ | ✗ |
| Update WP config | ✓ | ✓ | ✗ |
| Swap WP config (change channel's active WP) | ✓ | ✗ | ✗ |
| Delete WP config | ✓ | ✗ | ✗ |
| Add/remove channel members | ✓ | ✗ | ✗ |
| Publish content via channel's WP | ✓ | ✓ | ✗ |

### A5. Additional critérios de aceite

- [ ] `channel_members` table created with role enum.
- [ ] Existing channel owners auto-added as `owner` role.
- [ ] API checks `channel_members.role` before granting read/write of WP config.
- [ ] Swap WP config creates entry in `channel_wordpress_history` (if implemented).
- [ ] Viewer role cannot see decrypted password.
- [ ] Editor role can publish but cannot swap or delete config.

---

## 1. Current State

### Database: `wordpress_configs` Table

**Location:** `supabase/migrations/00000000000000_initial_schema.sql` + additions in subsequent migrations

**Current columns:**
```sql
id                 text primary key
site_url           text not null
username           text not null
password           text not null (encrypted)
user_id            uuid references auth.users(id)  -- added in 20260411025622
org_id             uuid references public.organizations(id)  -- added in 20260412224910
created_at         timestamptz
updated_at         timestamptz
```

**Current constraints & triggers:**
- Index: `idx_wordpress_configs_user_id`
- Index: `idx_wordpress_configs_org_id`
- Trigger: `trg_wordpress_configs_updated_at` (updates `updated_at` on write)
- Trigger: `trg_wordpress_configs_user_id` (sets `user_id = auth.uid()` if null)
- Trigger: `trg_wordpress_configs_org_id` (sets `org_id` from user's primary org membership if null)
- RLS enabled: deny-all (only `service_role` can read/write)

**Related table:** `channels` (added in `20260412234959_channels.sql`)
```sql
id                 uuid primary key
org_id             uuid not null references public.organizations(id)
user_id            uuid not null references auth.users(id)
name               text not null
wordpress_config_id text references public.wordpress_configs(id)  -- FOREIGN KEY exists
...other columns...
```

**Note:** `channels.wordpress_config_id` is already a FK but it's nullable and not enforced at DB level. This will become NOT NULL after migration.

### API Routes (File: `apps/api/src/routes/wordpress.ts`)

**Current behavior:** All routes query/create `wordpress_configs` with implicit `user_id` scoping via middleware or explicit filtering.

**Route handlers affected:**

1. **POST `/config`** (line 331)
   - Request: `{ site_url, username, password }`
   - Creates config with `user_id` auto-set by trigger
   - Response: config object
   - **Change:** Accept `channel_id` in request body (optional, or derive from context)

2. **GET `/config`** (line 382)
   - Lists all configs for current user
   - **Change:** Filter by channel_id or org_id (depends on UX design)

3. **GET `/config/:id`** (line 410)
   - Fetches single config by ID
   - **Change:** Verify requesting user has access to channel that owns this config

4. **PUT `/config/:id`** (line 445)
   - Updates config (site_url, username, password)
   - **Change:** Same access control as GET

5. **PATCH `/config/:id`** (line 508)
   - Alias for PUT
   - **Change:** Same access control as PUT

6. **DELETE `/config/:id`** (line 570)
   - Deletes config
   - **Change:** Verify access + ensure no active projects use this config (optional soft delete?)

7. **POST `/publish` (deprecated)** (line 601)
   - Legacy publish flow using `projects` table
   - **Change:** Lookup config by `channel_id` from project context

8. **POST `/publish-draft/stream`** (line 842)
   - Main streaming publish (uses `content_drafts`)
   - **Change:** Lookup config by `channel_id`

9. **POST `/publish-draft`** (line 1346)
   - Async publish (uses `content_drafts`)
   - **Change:** Lookup config by `channel_id`

10. **GET `/tags`** (line 1182)
    - Accepts `config_id` or `site_url/username/password`
    - **Change:** Support both, with channel scoping for `config_id`

11. **GET `/categories`** (line 1263)
    - Same as `/tags`
    - **Change:** Support both, with channel scoping for `config_id`

12. **GET `/blog-metrics`** (line 1600)
    - Public metrics fetch (no auth on WordPress needed)
    - **Change:** No change needed (doesn't use config lookup)

### UI Components

**File:** `apps/app/src/app/[locale]/(app)/settings/wordpress/page.tsx` (lines 1-745)

**Current behavior:**
- Fetches all `wordpress_configs` via `GET /api/wordpress/config`
- Displays list of configs for current user
- User can create/edit/delete configs
- No channel context

**Change:**
- Add channel selector or context-aware config list
- Show configs linked to current channel only
- On create: link new config to current channel

**File:** `apps/app/src/components/wordpress/PublishingForm.tsx` (lines 1-300+)

**Current behavior:**
- Fetches all configs for form selection
- Used in pipeline publish step
- No channel awareness

**Change:**
- Accept `channelId` prop
- Fetch configs scoped to that channel
- Pre-select the single config if only one exists

**File:** `apps/app/src/components/preview/PublishPanel.tsx` (lines 1-220)

**Current behavior:**
- Fetches all configs via `GET /api/wordpress/config`
- Presents selector to user
- No channel scoping

**Change:**
- Accept `channelId` prop
- Fetch configs filtered by channel
- Auto-select if single config
- Show warning if no config for channel

### Zod Schemas (File: `packages/shared/src/schemas/wordpress.ts`)

**Current schemas:**

1. `publishToWordPressSchema` (line 14)
   - Fields: `project_id`, `config_id` (optional)
   - **Change:** Add `channel_id` field (optional, can derive from context)

2. `publishDraftSchema` (referenced in routes but likely in `pipeline.ts`)
   - Fields: `draftId`, `configId`
   - **Change:** Replace `configId` with `channelId` (derive config from channel)

**No breaking change to request envelope** — still `{ data, error }`.

### Database Mappers (File: `packages/shared/src/mappers/db.ts`)

**Current mappers:**
- `fromDb()` — snake_case → camelCase
- `toDb()` — camelCase → snake_case

**Change:**
- Add handling for `channel_id` ↔ `channelId` mapping
- No new mapper needed if column names follow convention

### Types (File: `packages/shared/src/types/database.ts`)

**Current `wordpress_configs` type (auto-generated from database):**

```typescript
wordpress_configs: {
  Row: {
    created_at: string
    id: string
    org_id: string | null
    password: string
    site_url: string
    updated_at: string
    user_id: string | null
    username: string
  }
  // Insert, Update, Relationships
}
```

**Change:**
- Add `channel_id: string | null` to Row/Insert/Update
- Keep `user_id` and `org_id` (for backward compat + audit)
- Update foreign key relationship to reference `channels` table

---

## 2. Target State

### Schema Changes

**New column on `wordpress_configs`:**
```sql
channel_id uuid not null default gen_random_uuid()  -- will be made NOT NULL after backfill
             references public.channels(id) on delete cascade
```

**New index:**
```sql
create unique index idx_wordpress_configs_channel_id 
  on public.wordpress_configs(channel_id);
```

**Note:** Unique constraint ensures one WordPress config per channel.

**Columns to keep (for context):**
- `user_id` — may be dropped in Phase 3, but keep for now (ownership audit trail)
- `org_id` — may be dropped in Phase 3, but keep for now (fast org-level filtering)

### Access Control Model

- Only users who are members of the channel's org AND have edit permission on the channel can modify WordPress configs
- Read access: any org member can list/view configs for their channels
- Write access: channel admin or org admin only
- Delete: channel admin or org admin only

### API Contract Changes

**Before (user-scoped):**
```
GET /api/wordpress/config
→ Returns all configs for authenticated user
```

**After (org-scoped with channel context):**
```
GET /api/wordpress/config?channelId={id}
→ Returns config linked to that channel (if user has access)
→ If no channelId: returns empty or error (no default scope)
```

**Before (create):**
```
POST /api/wordpress/config
{ site_url, username, password }
→ Auto-scoped to auth.uid()
```

**After (create):**
```
POST /api/wordpress/config
{ site_url, username, password, channelId }
→ Must provide channelId (required)
→ Verify user has access to channel
```

**Before (publish):**
```
POST /api/wordpress/publish-draft
{ draftId, configId, ... }
→ configId may be user's only config
```

**After (publish):**
```
POST /api/wordpress/publish-draft
{ draftId, configId, channelId, ... }
→ configId must belong to channelId
→ Verify consistency
```

---

## 3. Migration Strategy

### Step 0: Verify Channels Table Exists

**Migration:** `20260412234959_channels.sql` already created `channels` table with `wordpress_config_id` FK.

**Status:** ✓ Prerequisite met.

### Step 1: Create New Migration

**File:** `supabase/migrations/20260420HHMMSS_wordpress_per_channel.sql`

**Timestamp:** Use current time, e.g., `20260420120000`

**Actions:**

```sql
-- F2-006: Link wordpress_configs to channels (one-to-one per channel)
-- Adds channel_id column, backfills existing configs to their projects' channels,
-- adds unique constraint to enforce 1:1 mapping, eventually makes column NOT NULL.

-- Step 1: Add channel_id column (nullable for backfill)
alter table public.wordpress_configs
  add column channel_id uuid references public.channels(id) on delete cascade;

-- Step 2: Create index for fast lookup
create index idx_wordpress_configs_channel_id 
  on public.wordpress_configs(channel_id);

-- Step 3: Backfill channel_id from existing data
-- For each config, find projects that use it, get their channel_id
-- This assumes projects.channel_id is already populated
update public.wordpress_configs wc
set channel_id = (
  select p.channel_id
  from public.projects p
  where p.user_id = wc.user_id
  limit 1
)
where wc.channel_id is null
  and exists (
    select 1 from public.projects p
    where p.user_id = wc.user_id
  );

-- Step 4: Handle configs with no project link (orphaned)
-- These configs may be unused or require manual cleanup.
-- For now, we leave them with channel_id = NULL.
-- In production, review and assign manually or delete.

-- Step 5: Add unique constraint (one config per channel)
-- This ensures each channel can have at most one WordPress config
-- First create the constraint (non-blocking, allows NULL)
alter table public.wordpress_configs
  add constraint unique_wordpress_config_per_channel 
  unique (channel_id) where channel_id is not null;

-- Step 6: Document that channel_id should be made NOT NULL in Phase 3
-- For now, we keep it nullable to allow for configs unlinked to channels.
```

**Rationale:**
- Backfill from `projects` table via `user_id` (assumes projects table already has `channel_id`)
- Use `where channel_id is not null` in unique constraint to allow orphaned configs (nullable)
- Leaving column nullable for now allows gradual migration; Phase 3 can make it NOT NULL

### Step 2: Regenerate Types

After migration is applied to dev:

```bash
npm run db:push:dev
npm run db:types
```

This updates `packages/shared/src/types/database.ts` to include `channel_id` in the `wordpress_configs` type.

---

## 4. Code Impact List

### Database & Types

| File | Change | Details |
|------|--------|---------|
| `supabase/migrations/20260420HHMMSS_wordpress_per_channel.sql` | NEW | Add channel_id column, backfill, unique constraint |
| `packages/shared/src/types/database.ts` | EDIT | Auto-generated; add `channel_id` to Row/Insert/Update |

### API Routes

| File | Handler | Change |
|------|---------|--------|
| `apps/api/src/routes/wordpress.ts` | `POST /config` | Accept `channel_id` in body; validate user access to channel |
| `apps/api/src/routes/wordpress.ts` | `GET /config` | Add optional `?channelId` query param; filter by channel |
| `apps/api/src/routes/wordpress.ts` | `GET /config/:id` | Verify config's `channel_id` is accessible by user |
| `apps/api/src/routes/wordpress.ts` | `PUT /config/:id` | Same access check as GET |
| `apps/api/src/routes/wordpress.ts` | `PATCH /config/:id` | Same access check as PUT |
| `apps/api/src/routes/wordpress.ts` | `DELETE /config/:id` | Same access check + cascade safety |
| `apps/api/src/routes/wordpress.ts` | `POST /publish` | Lookup config by channel_id from project |
| `apps/api/src/routes/wordpress.ts` | `POST /publish-draft/stream` | Lookup config by channel_id (add to request) |
| `apps/api/src/routes/wordpress.ts` | `POST /publish-draft` | Lookup config by channel_id (add to request) |
| `apps/api/src/routes/wordpress.ts` | `GET /tags` | Support config_id lookup scoped by channel |
| `apps/api/src/routes/wordpress.ts` | `GET /categories` | Support config_id lookup scoped by channel |

### Schemas & Validation

| File | Change | Details |
|------|--------|---------|
| `packages/shared/src/schemas/wordpress.ts` | EDIT `publishToWordPressSchema` | Add optional `channel_id` field |
| `packages/shared/src/schemas/wordpress.ts` | EDIT `publishDraftSchema` (in `pipeline.ts`) | Add `channel_id` field; make `config_id` optional or derive from channel |

### Mappers

| File | Change | Details |
|------|--------|---------|
| `packages/shared/src/mappers/db.ts` | REVIEW | Check if `channel_id` ↔ `channelId` mapping is needed (likely automatic) |

### UI Components

| File | Component | Change |
|------|-----------|--------|
| `apps/app/src/app/[locale]/(app)/settings/wordpress/page.tsx` | WordPressSettingsPage | Add channel context awareness; filter configs by channel; modify create flow |
| `apps/app/src/components/wordpress/PublishingForm.tsx` | PublishingForm | Accept `channelId` prop; fetch configs for that channel |
| `apps/app/src/components/preview/PublishPanel.tsx` | PublishPanel | Accept `channelId` prop; fetch scoped configs; auto-select single |

### Views/Pages Using WordPress Config

| File | Context | Change |
|------|---------|--------|
| `apps/app/src/components/engines/PublishEngine.tsx` | Pipeline publish | Pass `channelId` to PublishPanel |
| `apps/app/src/app/[locale]/(app)/channels/[id]/drafts/[draftId]/page.tsx` | Draft publish page | Extract `channelId` from URL params; pass to PublishEngine |

---

## 5. Breaking Changes

### API Request/Response Envelope

**No change to envelope structure** — still `{ data, error }`.

### Request Contract Changes

| Endpoint | Old Request | New Request | Impact |
|----------|------------|------------|--------|
| `POST /api/wordpress/config` | `{ site_url, username, password }` | `{ site_url, username, password, channel_id }` | **BREAKING** — `channel_id` becomes required |
| `GET /api/wordpress/config` | No params | Optional `?channelId={id}` | **Soft break** — callers passing no `channelId` will get different results (empty or error) |
| `POST /api/wordpress/publish-draft` | `{ draftId, configId, ... }` | `{ draftId, channelId, ... }` | **BREAKING** — `configId` replaced with `channelId`; API derives config from channel |

### Response Contract Changes

**GET /api/wordpress/config**

**Old:**
```json
{
  "data": [
    { "id": "cfg-1", "site_url": "...", "username": "...", "created_at": "..." },
    { "id": "cfg-2", "site_url": "...", "username": "...", "created_at": "..." }
  ],
  "error": null
}
```

**New (with channel filter):**
```json
{
  "data": [
    { "id": "cfg-1", "site_url": "...", "username": "...", "channel_id": "ch-1", "created_at": "..." }
  ],
  "error": null
}
```

**Impact:** Clients not expecting `channel_id` field in response will ignore it (safe). But if client code filters by `user_id`, that will no longer be present in the new scoped response (may break some clients).

**Recommendation:** Keep `user_id` and `org_id` in response for backward compat; client code can ignore them.

### Frontend Breaking Changes

| Component | Old API | New API | Migration |
|-----------|---------|---------|-----------|
| PublishPanel | Fetches all user's configs | Fetches channel-scoped configs | Add `channelId` prop; pass from parent |
| PublishingForm | Fetches all user's configs | Fetches channel-scoped configs | Add `channelId` prop; pass from parent |
| Settings page | Lists all user's configs | Lists org's channels + linked configs | Redesign UX (see section 6) |

---

## 6. Implementation Details

### API Route Handler Changes

**Example: `POST /api/wordpress/config`**

**Before:**
```typescript
fastify.post('/config', { preHandler: [authenticate] }, async (request, reply) => {
  const body = createConfigSchema.parse(request.body);
  // user_id auto-set by trigger
  const { data: config, error } = await sb
    .from('wordpress_configs')
    .insert({
      site_url: body.site_url,
      username: body.username,
      password: encryptedPassword,
    })
    .select()
    .single();
  // ...
});
```

**After:**
```typescript
fastify.post('/config', { preHandler: [authenticate] }, async (request, reply) => {
  const body = createConfigSchema.parse(request.body);
  
  // Validate channel_id provided
  if (!body.channel_id) {
    return fail(reply, 400, { code: 'MISSING_CHANNEL_ID', message: 'channel_id is required' });
  }
  
  // Verify user has access to channel
  const { data: channel, error: chErr } = await sb
    .from('channels')
    .select('org_id')
    .eq('id', body.channel_id)
    .maybeSingle();
  if (chErr || !channel) {
    return fail(reply, 404, { code: 'CHANNEL_NOT_FOUND', message: 'Channel not found' });
  }
  
  // Verify user is member of channel's org (simplified; use org_members table)
  // TODO: implement org access check
  
  const { data: config, error } = await sb
    .from('wordpress_configs')
    .insert({
      site_url: body.site_url,
      username: body.username,
      password: encryptedPassword,
      channel_id: body.channel_id,
      user_id: request.headers['x-user-id'],  // For audit
      org_id: channel.org_id,  // For org-level filtering
    })
    .select()
    .single();
  // ...
});
```

**Example: `GET /api/wordpress/config` with filtering**

**Before:**
```typescript
fastify.get('/config', { preHandler: [authenticate] }, async (request, reply) => {
  const { data: configs, error } = await sb
    .from('wordpress_configs')
    .select('*')
    .order('created_at', { ascending: false });
  // Returns all configs (RLS filters by user_id in production)
});
```

**After:**
```typescript
fastify.get('/config', { preHandler: [authenticate] }, async (request, reply) => {
  const { channelId } = request.query as { channelId?: string };
  
  if (!channelId) {
    // Option 1: Return empty array + warning
    return reply.send({ data: [], error: null });
    // Option 2: Return error
    // return fail(reply, 400, { code: 'MISSING_CHANNEL_ID', message: 'channelId query param required' });
  }
  
  // Verify user has access to channel
  const userId = request.headers['x-user-id'] as string;
  const { data: channel } = await sb
    .from('channels')
    .select('org_id')
    .eq('id', channelId)
    .maybeSingle();
  
  if (!channel) {
    return fail(reply, 404, { code: 'CHANNEL_NOT_FOUND', message: 'Channel not found' });
  }
  
  // Check org membership (simplified)
  // TODO: implement access check
  
  const { data: configs, error } = await sb
    .from('wordpress_configs')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false });
  
  if (error) return fail(reply, 500, error);
  
  return reply.send({ 
    data: configs ?? [],
    error: null 
  });
});
```

### UI Component Changes

**PublishPanel with channel context:**

```typescript
interface PublishPanelProps {
  channelId: string;  // NEW
  // ... other props
}

export function PublishPanel({ channelId, ... }: PublishPanelProps) {
  useEffect(() => {
    async function fetchConfigs() {
      try {
        const res = await fetch(`/api/wordpress/config?channelId=${channelId}`);
        const { data } = await res.json();
        setConfigs(Array.isArray(data) ? data : []);
      } catch (err) {
        // Handle error
      }
    }
    if (channelId) fetchConfigs();
  }, [channelId]);
  
  // ... rest of component
}
```

### Schema Changes (Zod)

**wordpress.ts:**

```typescript
// Before: createConfigSchema
const createConfigSchema = z.object({
  site_url: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1),
});

// After: createConfigSchema with channel_id
const createConfigSchema = z.object({
  site_url: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1),
  channel_id: z.string().uuid('Invalid channel ID'),  // NEW, required
});
```

---

## 7. Test Plan

### Unit Tests

**Location:** `apps/api/src/routes/__tests__/wordpress.test.ts` (create if not exists)

**Test cases:**

| Case | Setup | Action | Expected |
|------|-------|--------|----------|
| Create config for channel | User + channel | POST /config with channel_id | Config created, linked to channel |
| List configs for channel | User + channel + configs | GET /config?channelId=X | Returns only configs for channel X |
| Reject create without channel_id | User | POST /config (no channel_id) | 400 MISSING_CHANNEL_ID |
| Reject access to other org's channel | User A + channel (org 2) | GET /config?channelId=Y (org 2) | 403 FORBIDDEN or 404 NOT_FOUND |
| Delete config | User + config | DELETE /config/:id | Config deleted, channel.wordpress_config_id nullified |
| Publish to channel's config | Draft + channel + config | POST /publish-draft with channelId | Uses linked config, publishes successfully |

### Integration Tests

| Case | Setup | Action | Expected |
|------|-------|--------|----------|
| Full publish flow with channel config | Draft + channel + config | Create config, publish draft | Post created in WordPress |
| Upgrade from user-scoped to channel-scoped | Existing user configs | Backfill migration | Configs linked to projects' channels |

### Manual Testing (Dev)

1. **Setup:** Create organization, channel, WordPress config
2. **Scenario 1:** Create config → verify it's linked to channel
3. **Scenario 2:** Edit channel's config → verify changes apply
4. **Scenario 3:** Delete config → verify cascade to channel
5. **Scenario 4:** Publish draft → verify correct WordPress config used
6. **Scenario 5:** Switch channels → verify different config shown in publish panel

---

## 8. Rollout Plan

### Phase 1: Development (this environment)

1. Run migration: `npm run db:push:dev`
2. Regenerate types: `npm run db:types`
3. Update API routes (start with single route for testing)
4. Update Zod schemas
5. Update UI components
6. Run tests (unit + integration)
7. Manual testing on localhost
8. **Gate:** All tests pass + manual testing complete

### Phase 2: Staging

1. Deploy code changes to staging (without breaking old clients yet)
2. Deploy migration to staging DB
3. Backfill validation (check configs were linked to channels)
4. Verify API works with new schema
5. Test with staging WordPress instance
6. **Gate:** Staging deploy successful, no data loss

### Phase 3: Production Cutover

1. **Backup:** Snapshot production database
2. **Dark deploy:** Deploy code (routes compatible with both old & new requests)
3. **Migration window:** Apply migration during low-traffic period
4. **Verification:** Check backfill results, no orphaned configs
5. **Cutover:** Activate new client code that sends `channel_id`
6. **Monitoring:** Watch error rates, WordPress publish success rate
7. **Rollback plan:** If critical issues, revert code + restore DB from snapshot

### Phase 4: Cleanup (Phase 3)

After 2-4 weeks in production:
- Make `channel_id` NOT NULL (requires zero configs with null channel_id)
- Drop `user_id` and `org_id` columns if backward compat not needed
- Drop old `idx_wordpress_configs_user_id` index
- Drop old `idx_wordpress_configs_org_id` index

---

## 9. Success Criteria

1. **Data integrity:** All existing configs backfilled with channel_id (no orphaned rows)
2. **API compatibility:** Old API calls fail gracefully with clear error messages
3. **Publishing:** Drafts publish successfully using channel-scoped configs
4. **Permissions:** Users can only access configs in their org's channels
5. **UI flow:** Publish panel auto-detects and uses correct config per channel
6. **Tests:** 100% of new test cases pass
7. **Performance:** No regression in WordPress config lookup time

---

## 10. Risk Analysis

### High Risk

- **Data loss on backfill:** Configs not linked to any project will have NULL channel_id
  - *Mitigation:* Pre-migration audit to identify orphaned configs; manual assignment or delete
  
- **Breaking API change:** Callers not updated to pass `channel_id` will fail
  - *Mitigation:* Gradual rollout; maintain backward compat layer temporarily in Phase 3

### Medium Risk

- **Channel deletion cascade:** If channel is deleted, its config is cascade-deleted
  - *Mitigation:* Implement soft delete on channels or add constraint check before deletion

- **Multiple configs per channel edge case:** Old data may have multiple configs per channel
  - *Mitigation:* Unique constraint catches this; migration should clean up duplicates

### Low Risk

- **Null channel_id in responses:** Clients may not expect this new field
  - *Mitigation:* Field is nullable, won't break JSON parsing; document in API changelog

---

## 11. Documentation Updates Required

After implementation, update:

1. **API Reference** (`docs/SPEC.md`):
   - Document new `channel_id` field on wordpress_configs
   - Update POST /config, GET /config request/response schemas
   - Add channel scoping requirement

2. **Database Schema Docs** (`apps/docs-site/src/content/database/schema.md`):
   - Add `wordpress_configs.channel_id` column documentation
   - Update foreign key relationships

3. **Feature Docs** (if exists):
   - Update WordPress integration docs with channel concept
   - Add "one config per channel" rule

4. **API Changelog**:
   - Note breaking changes
   - Provide migration guide for API clients

---

## 12. Summary of Files to Edit

| Category | File | Action |
|----------|------|--------|
| **Database** | `supabase/migrations/20260420HHMMSS_wordpress_per_channel.sql` | NEW |
| **Types** | `packages/shared/src/types/database.ts` | AUTO (run db:types) |
| **Schemas** | `packages/shared/src/schemas/wordpress.ts` | EDIT |
| **Schemas** | `packages/shared/src/schemas/pipeline.ts` | EDIT (if needed) |
| **API Routes** | `apps/api/src/routes/wordpress.ts` | EDIT (11 handlers) |
| **UI** | `apps/app/src/app/[locale]/(app)/settings/wordpress/page.tsx` | EDIT |
| **UI** | `apps/app/src/components/wordpress/PublishingForm.tsx` | EDIT |
| **UI** | `apps/app/src/components/preview/PublishPanel.tsx` | EDIT |
| **UI** | `apps/app/src/components/engines/PublishEngine.tsx` | EDIT (pass channelId) |
| **Docs** | `docs/SPEC.md` | EDIT |
| **Docs** | `apps/docs-site/src/content/database/schema.md` | EDIT |

---

## Appendix A: Channels Table Context

The `channels` table (migration `20260412234959_channels.sql`, lines 4-55) is the prerequisite for this change:

```sql
create table public.channels (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  user_id             uuid not null references auth.users(id),
  name                text not null,
  ...
  wordpress_config_id text references public.wordpress_configs(id),  -- Existing FK
  ...
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
```

**Current state:** `channels.wordpress_config_id` is a nullable FK, allowing channels without WordPress configs.

**After this migration:** The relationship is inverted — `wordpress_configs.channel_id` becomes the source of truth. `channels.wordpress_config_id` becomes redundant but can be kept for backward compat.

---

## Appendix B: Phases (Channel Architecture)

This change is part of Phase 2 (Channels) multi-tenancy work:

- **Phase 2A:** Add channels table, link projects to channels ✓
- **Phase 2B:** Link WordPress configs to channels ← **This spec**
- **Phase 2C:** Link other configs (image generator, AI provider) to channels
- **Phase 3:** Make channel_id NOT NULL, drop user_id/org_id, clean up legacy code

