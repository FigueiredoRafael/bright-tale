---
title: WordPress Config Channel-Scoping
date: 2026-04-24
status: approved
branch: feat/persona-eeat-layer
authors: Hector Siman
---

# WordPress Config Channel-Scoping — Design

## Goal

Make WordPress configuration a property of a channel, not a shared global resource. One channel owns at most one WordPress site. The publishing pipeline derives credentials from the project's channel automatically, removing `configId` from client contracts.

## In Scope

- Schema: invert the FK so `wordpress_configs` belongs to a channel (1:1, cascade delete).
- Routes: channel-scoped CRUD (`/api/channels/:id/wordpress`); delete all global `/api/wordpress/config` endpoints; publish-draft + publish derive config from channel.
- UI: WordPress card in channel detail → Blog tab; delete `/settings/wordpress` page and its nav / breadcrumb / settings-index entries.
- Data: drop the single orphan row in `wordpress_configs`. User re-enters credentials once per channel.
- PersonaForm channel filter: adjust to the inverted schema via a server-derived `has_wordpress` flag on `GET /api/channels`.

## Out of Scope

- Multi-site per channel.
- Non-WordPress platforms (Medium / Ghost / Substack).
- Backfill of the orphan row (confirmed OK to drop).

## Schema Change

**Migration file:** `supabase/migrations/YYYYMMDDHHMMSS_wordpress_configs_channel_scope.sql`

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

**Post-migration housekeeping:**

- `npm run db:push:dev` → apply.
- `npm run db:types` → regenerate `packages/shared/src/types/database.ts`.
- No entry to update in `packages/shared/src/mappers/db.ts` (no WP-specific mapper today).

**Rollback:** migration is one-way (data + column drops). To reverse, revert the SQL file (re-add `channels.wordpress_config_id nullable`, drop the new index/column) and re-push. Orphan row is unrecoverable — accepted.

## API Routes

### New — channel-scoped WP config

All mount under the existing channels plugin (`apps/api/src/routes/channels.ts`):

| Method | Path | Behavior |
|---|---|---|
| `GET`    | `/api/channels/:id/wordpress`      | Fetch config. Password masked. `404 WP_CONFIG_NOT_FOUND` if none. |
| `POST`   | `/api/channels/:id/wordpress`      | Create. Body: `{ site_url, username, password }`. Encrypts password. `409 WP_CONFIG_EXISTS` if unique constraint would fire. |
| `PUT`    | `/api/channels/:id/wordpress`      | Partial update. Body: `{ site_url?, username?, password? }`. Re-encrypts if `password` provided. |
| `DELETE` | `/api/channels/:id/wordpress`      | Remove config. |
| `POST`   | `/api/channels/:id/wordpress/test` | Test connection. `GET {site_url}/wp-json/wp/v2/users/me` with Basic auth. Returns `{ ok: boolean, message: string }`. |

Every route:

- `preHandler: authenticate` (existing middleware).
- Authorization: verify `channels.org_id === requester.org_id` using the existing `getOrgId` pattern in `channels.ts` before touching `wordpress_configs`.
- Envelope `{ data, error }` on all responses.
- Encryption unchanged — AES-256-GCM via `ENCRYPTION_SECRET`, same `encrypt()` / `decrypt()` helpers in `apps/api/src/lib/crypto.ts`.

### Removed

- `POST/GET/GET(:id)/PUT/PATCH/DELETE /api/wordpress/config*` — all six global CRUD endpoints deleted from `apps/api/src/routes/wordpress.ts`.

### Updated — publish routes

**`POST /api/wordpress/publish-draft` and `/publish-draft/stream`:**

- `publishDraftSchema` (in `packages/shared/src/schemas/pipeline.ts`): remove `configId` field.
- Handler replaces the `if (body.configId) { ... }` lookup block with:
  ```ts
  const { data: draft } = await sb
    .from('content_drafts')
    .select('channel_id')
    .eq('id', body.draftId)
    .single();
  if (!draft?.channel_id) {
    throw new ApiError(400, 'Draft has no channel', 'VALIDATION_ERROR');
  }
  const { data: config } = await sb
    .from('wordpress_configs')
    .select('*')
    .eq('channel_id', draft.channel_id)
    .maybeSingle();
  if (!config) {
    throw new ApiError(400, 'Channel has no WordPress configured', 'NO_WP_CONFIG');
  }
  ```
- Legacy `POST /api/wordpress/publish`: same change, but derives from `projects.channel_id` instead of `content_drafts.channel_id`.

### Updated — persona → WP link

**`POST /api/personas/:id/integrations/wordpress`** (`apps/api/src/routes/personas.ts:217-296`):

- Current lookup reads `channels.wordpress_config_id`. Change to `wordpress_configs where channel_id = body.channelId`.
- Error codes unchanged — `NO_WP_CONFIG` still fires when no config exists. Frontend mapping (commit `ae9d16e`) continues to work.

### Updated — WP taxonomy + metrics routes

**`GET /api/wordpress/tags`, `/categories`, `/blog-metrics`:**

- Switch from `config_id` query param to `channel_id`. Only the channel-context UI calls these; no external contract to preserve.

## UI Changes

### Channel detail page — new WordPress card

File: `apps/app/src/app/[locale]/(app)/channels/[id]/page.tsx`

- Insert new card inside existing `<TabsContent value="blog">` (conditional tab, only when channel has `blog` in `media_types`).
- Two states:
  - **No config** — "Connect WordPress" form: `site_url`, `username`, `password` (application password). Submit → `POST /api/channels/:id/wordpress`. After success, "Test connection" button appears.
  - **Has config** — Summary: site URL, username (password masked). Action buttons: *Test*, *Edit* (inline form toggle), *Remove* (confirm dialog → `DELETE`).
- Reuse existing `Card`, `Input`, `Label`, `Button`, `AlertDialog` components. Visual language matches the existing YouTube tab.

### Deletions

- `apps/app/src/app/[locale]/(app)/settings/wordpress/page.tsx` — delete entire directory.
- `apps/app/src/components/layout/Sidebar.tsx:82` — remove `/settings/wordpress` nav entry.
- `apps/app/src/app/[locale]/(app)/settings/page.tsx:45` — remove WordPress card from settings index.
- `apps/app/src/components/layout/Topbar.tsx:27` — remove `/settings/wordpress` breadcrumb mapping.
- `apps/app/messages/en.json` + `apps/app/messages/pt-BR.json` — remove `settingsWordpress` i18n key.

### Relink

- `apps/app/src/components/wordpress/PublishingForm.tsx:307` — change "Configure WordPress" link from `/settings/wordpress` to `/${locale}/channels/${channelId}?tab=blog`. PublishingForm already has channel context.

### PersonaForm channel filter

File: `apps/app/src/components/personas/PersonaForm.tsx`

Current filter (commit `3bb6f63`) reads `channel.wordpress_config_id != null`. After the schema change that field no longer exists.

**Fix:** `GET /api/channels` route handler joins `wordpress_configs` and maps a derived `has_wordpress: boolean` field on each item:

```ts
const { data: channels } = await sb
  .from('channels')
  .select('*, wordpress_configs(id)')
  .eq('org_id', orgId)
// ...
const items = channels.map(c => ({ ...c, has_wordpress: c.wordpress_configs !== null }))
```

Frontend filter becomes `c.has_wordpress`. PersonaForm channel type updates from `{ id, name, wordpress_config_id }` to `{ id, name, has_wordpress }`.

## Error Handling

| Code | HTTP | Raised by | Frontend message |
|---|---|---|---|
| `NO_WP_CONFIG` | 400 | publish-draft, persona→WP link | "This channel has no WordPress configured. Configure it in Channel → Blog → WordPress first." (already mapped in commit `ae9d16e`) |
| `WP_CONFIG_EXISTS` | 409 | `POST /api/channels/:id/wordpress` | "This channel already has WordPress configured. Edit or remove the existing one first." |
| `WP_CONFIG_NOT_FOUND` | 404 | `GET/PUT/DELETE /api/channels/:id/wordpress` | "No WordPress config on this channel." |
| `WP_TEST_FAILED` | 200 (body `{ ok: false }`) | test endpoint | Surface `message` inline (red). Does not throw. |
| `CHANNEL_NOT_FOUND` | 404 | every channel-scoped route | "Channel not found." |

## Testing

### Automated (Category A/B — no DB hit)

New file `apps/api/src/routes/__tests__/channels.wordpress.test.ts`:

- `POST /api/channels/:id/wordpress` with valid body → `201`, password encrypted in DB payload, decrypts round-trip.
- `POST` when a config already exists → `409 WP_CONFIG_EXISTS`.
- `PUT` without `password` → existing encrypted password preserved.
- `DELETE` then `GET` → `404 WP_CONFIG_NOT_FOUND`.
- Cross-org channel → `404 CHANNEL_NOT_FOUND`.

Update `apps/api/src/routes/__tests__/wordpress.test.ts` (if exists):

- `publish-draft` tests drop `configId` from fixtures, stub channel→config lookup.

### Manual QA post-merge

1. Create a channel with `blog` in media types.
2. Channel detail → Blog tab → Connect WordPress → test → save.
3. Edit persona → Integrations → pick channel → Link author — succeeds.
4. Create a project on that channel → run pipeline through Publish → post appears on WP.
5. Remove WP config from channel → persona form now hides that channel from the picker.

## Commits

One commit per phase, scoped:

1. `feat(db): wordpress_configs channel-scoped migration + types regen`
2. `feat(api): channel-scoped WordPress routes (POST/GET/PUT/DELETE/test)`
3. `refactor(api): publish-draft derives WP config from channel, drop configId`
4. `refactor(api): remove global /api/wordpress/config endpoints`
5. `feat(app): channel detail Blog tab — WordPress card`
6. `feat(app): PersonaForm channel filter via has_wordpress flag`
7. `chore(app): remove /settings/wordpress page, nav, breadcrumb, i18n`

Plus tests commit bundled with the route commits.

## Open Questions

None — all architectural forks resolved in brainstorm.
