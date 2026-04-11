# Users Page — Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Pattern reference:** TôNaGarantia admin users page, adapted to bright-tale's client-side architecture

## Overview

Add a full users management page at `/users` with KPI dashboard, filterable/sortable table, and CRUD operations including premium management and admin role assignment.

## 1. Database Schema

### 1.1 Migration: Alter `user_profiles`

Add 6 columns to the existing table:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE user_profiles
  ADD COLUMN email              text UNIQUE,
  ADD COLUMN is_premium         boolean NOT NULL DEFAULT false,
  ADD COLUMN premium_plan       text CHECK (premium_plan IN ('monthly', 'yearly')),
  ADD COLUMN premium_started_at timestamptz,
  ADD COLUMN premium_expires_at timestamptz,
  ADD COLUMN is_active          boolean NOT NULL DEFAULT true;

-- Consistency constraint: premium fields must be all-or-nothing
ALTER TABLE user_profiles
  ADD CONSTRAINT chk_premium_consistency
  CHECK (
    (is_premium = false AND premium_plan IS NULL AND premium_started_at IS NULL AND premium_expires_at IS NULL)
    OR
    (is_premium = true AND premium_plan IS NOT NULL AND premium_started_at IS NOT NULL)
  );

-- Indexes for filters and sort
CREATE INDEX idx_user_profiles_email      ON user_profiles (email);
CREATE INDEX idx_user_profiles_premium    ON user_profiles (is_premium) WHERE is_premium = true;
CREATE INDEX idx_user_profiles_active     ON user_profiles (is_active) WHERE is_active = false;
CREATE INDEX idx_user_profiles_created_at ON user_profiles (created_at DESC);

-- Trigram indexes — accelerate ilike '%term%' queries on name and email
CREATE INDEX idx_user_profiles_name_trgm
  ON user_profiles USING gin ((coalesce(first_name,'') || ' ' || coalesce(last_name,'')) gin_trgm_ops);
CREATE INDEX idx_user_profiles_email_trgm
  ON user_profiles USING gin (email gin_trgm_ops);

-- Backfill emails from auth.users for existing rows
UPDATE user_profiles p
SET email = a.email
FROM auth.users a
WHERE p.id = a.id AND p.email IS NULL;

-- After backfill, enforce NOT NULL
ALTER TABLE user_profiles ALTER COLUMN email SET NOT NULL;
```

### 1.2 `user_roles` — Already exists (migration `20260411030000`)

The table already exists with this schema:

```sql
-- Already in 20260411030000_user_roles.sql — DO NOT recreate
CREATE TABLE user_roles (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('admin', 'user')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
```

**Convention:** Only insert `role = 'admin'` rows. Absence of a row = regular user. The CHECK allows 'user' but we never insert it — query for admin presence instead.

### 1.3 RPCs for KPIs

All RPCs use `is_premium_effective` logic inline:

```sql
-- Reusable CTE for effective premium
WITH effective AS (
  SELECT *,
    CASE
      WHEN is_premium = true
       AND premium_expires_at IS NOT NULL
       AND premium_expires_at < now()
      THEN false
      ELSE is_premium
    END AS is_premium_effective
  FROM user_profiles
)
```

**`users_page_kpis()`** returns single row:

```sql
CREATE OR REPLACE FUNCTION users_page_kpis()
RETURNS json LANGUAGE sql STABLE AS $$
  WITH effective AS (
    SELECT *,
      CASE WHEN is_premium AND (premium_expires_at IS NULL OR premium_expires_at >= now())
           THEN true ELSE false END AS ipe
    FROM user_profiles
  )
  SELECT json_build_object(
    'total_users',   count(*),
    'active_users',  count(*) FILTER (WHERE is_active),
    'inactive_users', count(*) FILTER (WHERE NOT is_active),
    'premium_count', count(*) FILTER (WHERE ipe AND is_active),
    'admin_count',   (SELECT count(*) FROM user_roles),
    'free_count',    count(*) FILTER (WHERE NOT ipe AND is_active),
    'new_today',     count(*) FILTER (WHERE created_at >= current_date),
    'new_this_week', count(*) FILTER (WHERE created_at >= date_trunc('week', current_date)),
    'new_this_month', count(*) FILTER (WHERE created_at >= date_trunc('month', current_date))
  ) FROM effective;
$$;
```

**`users_page_growth(p_from timestamptz, p_to timestamptz)`** returns daily signup counts:

```sql
CREATE OR REPLACE FUNCTION users_page_growth(p_from timestamptz, p_to timestamptz)
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
  FROM (
    SELECT
      d::date AS date,
      count(up.id) FILTER (WHERE up.id IS NOT NULL) AS signups,
      count(up.id) FILTER (WHERE up.is_premium AND up.premium_started_at::date = d::date) AS premium_signups
    FROM generate_series(p_from::date, p_to::date, '1 day') d
    LEFT JOIN user_profiles up ON up.created_at::date = d::date
    GROUP BY d
    ORDER BY d
  ) t;
$$;
```

**`users_page_sparklines()`** returns 30-day arrays (cumulative total, daily signups):

```sql
CREATE OR REPLACE FUNCTION users_page_sparklines()
RETURNS json LANGUAGE sql STABLE AS $$
  WITH days AS (
    SELECT d::date AS day FROM generate_series(current_date - 29, current_date, '1 day') d
  ),
  daily AS (
    SELECT
      d.day,
      (SELECT count(*) FROM user_profiles WHERE created_at::date <= d.day) AS cumulative_total,
      count(up.id) FILTER (WHERE up.id IS NOT NULL) AS signups,
      (SELECT count(*) FROM user_profiles
       WHERE is_premium AND (premium_expires_at IS NULL OR premium_expires_at >= d.day + '1 day'::interval)
         AND premium_started_at <= d.day + '1 day'::interval
      ) AS premium_count
    FROM days d
    LEFT JOIN user_profiles up ON up.created_at::date = d.day
    GROUP BY d.day
    ORDER BY d.day
  )
  SELECT json_build_object(
    'total',   (SELECT json_agg(cumulative_total ORDER BY day) FROM daily),
    'premium', (SELECT json_agg(premium_count ORDER BY day) FROM daily),
    'signups', (SELECT json_agg(signups ORDER BY day) FROM daily)
  );
$$;
```

**Note on premium sparklines:** Premium count per day is reconstructed from `premium_started_at` and `premium_expires_at`. This is an approximation — if premium is removed manually (not expired), the sparkline won't reflect that retroactively. This is acceptable for dashboard-level analytics.

### 1.4 Premium expiration handling

No cron. Expiration is checked on read:
- **In RPCs:** via CASE expression (see above)
- **In list query:** raw `is_premium` + `premium_expires_at` returned from DB; `isPremiumEffective` computed in the JS mapper
- **In UI:** expired premium shows red "Expirado" badge; admin manually renews or removes

### 1.5 Post-migration step

Run `npm run db:types` to regenerate `packages/shared/src/types/database.ts` with the new columns and table.

## 2. Shared Package

### 2.1 Types — `packages/shared/src/types/users.ts`

```typescript
// API response shape (camelCase) — used by both API and frontend
export interface UserListItem {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  isPremium: boolean
  isPremiumEffective: boolean
  premiumPlan: 'monthly' | 'yearly' | null
  premiumStartedAt: string | null
  premiumExpiresAt: string | null
  isActive: boolean
  role: 'admin' | 'user'
  createdAt: string
}

export interface UsersKpis {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  premiumCount: number
  adminCount: number
  freeCount: number
  newToday: number
  newThisWeek: number
  newThisMonth: number
}

export interface UsersSparklines {
  total: number[]
  premium: number[]
  signups: number[]
}

export interface UsersGrowthPoint {
  date: string
  signups: number
  premiumSignups: number
}

export interface UsersPagination {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface UsersPageData {
  kpis: UsersKpis
  sparklines: UsersSparklines
  growth: UsersGrowthPoint[]
  users: UserListItem[]
  pagination: UsersPagination
}
```

DB row types are auto-generated by `db:types` — no need to duplicate manually.

### 2.2 Schemas — `packages/shared/src/schemas/users.ts`

```typescript
import { z } from 'zod'

export const usersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  premium: z.enum(['all', 'true', 'false']).default('all'),
  active: z.enum(['all', 'true', 'false']).default('all'),
  role: z.enum(['all', 'admin']).default('all'),
  sort: z.enum(['first_name', 'email', 'created_at', 'is_premium']).default('created_at'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

export const userUpdateSchema = z.object({
  firstName: z.string().min(1).max(200).optional(),
  lastName: z.string().min(1).max(200).optional(),
  isPremium: z.boolean().optional(),
  premiumPlan: z.enum(['monthly', 'yearly']).optional(),
  premiumExpiresAt: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.isPremium === true) {
      return data.premiumPlan !== undefined && data.premiumExpiresAt !== undefined
    }
    return true
  },
  { message: 'premiumPlan and premiumExpiresAt required when isPremium is true' }
)

export const userRoleUpdateSchema = z.object({
  role: z.enum(['admin', 'user']),
})
```

### 2.3 Mapper — `packages/shared/src/mappers/users.ts`

```typescript
import type { Database } from '../types/database'
import type { UserListItem } from '../types/users'

type UserProfileRow = Database['public']['Tables']['user_profiles']['Row']

export function userRowToListItem(
  row: UserProfileRow,
  role: 'admin' | 'user'
): UserListItem {
  const isPremiumEffective =
    row.is_premium &&
    (row.premium_expires_at === null || new Date(row.premium_expires_at) >= new Date())

  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.avatar_url,
    isPremium: row.is_premium,
    isPremiumEffective,
    premiumPlan: row.premium_plan as 'monthly' | 'yearly' | null,
    premiumStartedAt: row.premium_started_at,
    premiumExpiresAt: row.premium_expires_at,
    isActive: row.is_active,
    role,
    createdAt: row.created_at,
  }
}
```

**`isPremiumEffective`** is computed here in JS, not in the Supabase query. The DB stores raw `is_premium` + `premium_expires_at`; the mapper derives the effective state.

## 3. API Routes

### 3.1 Endpoints — `apps/api/src/routes/users.ts`

Registered on Fastify as prefix `/users`. All routes use `{ preHandler: [authenticate] }`.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/` | Paginated list with filters + KPIs |
| `GET` | `/:id` | Single user detail |
| `PATCH` | `/:id` | Edit profile, premium, active |
| `PATCH` | `/:id/role` | Promote/demote admin |
| `DELETE` | `/:id` | Hard delete (cascade) |

### 3.2 GET `/` — List with KPIs

**Query params:** Validated by `usersQuerySchema` (see 2.2).

**Implementation:**

```
1. Parse & validate query params with usersQuerySchema
2. Fetch KPIs + sparklines + growth in parallel:
     Promise.all([
       supabase.rpc('users_page_kpis'),
       supabase.rpc('users_page_sparklines'),
       supabase.rpc('users_page_growth', { p_from, p_to }),
     ])
3. Build user list query:
     supabase.from('user_profiles').select('*, user_roles(role)', { count: 'exact' })
   - Search filter: .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
     (pg_trgm indexes accelerate these ilike queries automatically)
   - Premium filter: .eq('is_premium', true/false)
   - Active filter: .eq('is_active', true/false)
   - Role filter: .not('user_roles', 'is', null)  (has admin row)
   - Sort: .order(sort, { ascending: sortDir === 'asc' })
   - Pagination: .range((page-1)*limit, page*limit-1)
4. Map rows through userRowToListItem() — derives isPremiumEffective + role from nested user_roles
5. Return { data: { data: users[], kpis, sparklines, growth, pagination }, error: null }
```

**Response envelope** follows existing pattern: `{ data: { data, pagination, ...extras }, error }`.

### 3.3 PATCH `/:id` — Edit user

**Body:** Validated by `userUpdateSchema`.

**Logic:**
- `isPremium` false→true: set `premium_started_at = now()` automatically
- `isPremium` true→false: clear `premium_plan`, `premium_started_at`, `premium_expires_at` (satisfy CHECK constraint)
- Map camelCase body → snake_case columns via simple object mapping
- `supabase.from('user_profiles').update({...}).eq('id', id).select().single()`

### 3.4 PATCH `/:id/role` — Change role

**Body:** Validated by `userRoleUpdateSchema`.

**Safety guards:**
- **Self-demotion prevention:** If `request.userId === id` and role is `'user'`, return 400: "Cannot remove your own admin role"
- **Last-admin prevention:** If role is `'user'`, count remaining admins. If count <= 1, return 400: "Cannot remove the last admin"

**Logic:**
- `"admin"` → `supabase.from('user_roles').upsert({ user_id: id, role: 'admin' })`
- `"user"` → `supabase.from('user_roles').delete().eq('user_id', id)`

### 3.5 DELETE `/:id`

**Safety guards:**
- **Self-deletion prevention:** If `request.userId === id`, return 400: "Cannot delete your own account"
- **Admin deletion prevention:** Check if user is admin. If so, apply last-admin check (count remaining admins).

`supabase.from('user_profiles').delete().eq('id', id)` — CASCADE removes `user_roles` row automatically.

### 3.6 Register in server.ts

Add `import { usersRoutes } from './routes/users'` and register with prefix `/users`.

## 4. Frontend

### 4.1 Architecture decision

**Client-side rendering** (`"use client"`), consistent with all existing pages in the app. Data fetched via `fetch('/api/users?...')` with URL-driven state via `useSearchParams` + `useRouter`.

This differs from TôNaGarantia's server component approach, but matches bright-tale's existing patterns in research, projects, blogs, etc.

### 4.2 File structure

```
apps/app/src/app/users/
├── page.tsx                          ← "use client", main page with state management
└── components/
    ├── users-kpi-section.tsx         ← KPI cards grid
    ├── users-filters.tsx             ← Search + filter dropdowns
    ├���─ users-table.tsx               ← Sortable table with actions
    ├── users-pagination.tsx          ← URL-driven pagination
    ├── user-edit-modal.tsx           ← Edit profile + premium modal
    ├── user-role-modal.tsx           ← Confirm role change
    └── user-delete-dialog.tsx        ← AlertDialog confirm delete

apps/app/src/lib/api/users.ts        ← API client functions (fetchUsersList, updateUser, etc.)
```

### 4.3 API client — `apps/app/src/lib/api/users.ts`

Following the pattern in `apps/app/src/lib/api/research.ts`:

```typescript
export async function fetchUsersList(params: UsersListParams): Promise<UsersPageData> {
  const queryParams = new URLSearchParams()
  if (params.search) queryParams.set('search', params.search)
  if (params.premium && params.premium !== 'all') queryParams.set('premium', params.premium)
  if (params.active && params.active !== 'all') queryParams.set('active', params.active)
  if (params.role && params.role !== 'all') queryParams.set('role', params.role)
  if (params.sort) queryParams.set('sort', params.sort)
  if (params.sortDir) queryParams.set('sortDir', params.sortDir)
  if (params.page) queryParams.set('page', String(params.page))

  const url = `/api/users${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch users')
  const json = await response.json()
  return json.data
}

export async function updateUser(id: string, body: UserUpdateBody): Promise<void> { ... }
export async function updateUserRole(id: string, role: 'admin' | 'user'): Promise<void> { ... }
export async function deleteUser(id: string): Promise<void> { ... }
```

### 4.4 Data flow

```
page.tsx ("use client")
  ├── useSearchParams() → read filters, sort, page from URL
  ├── useEffect() → fetchUsersList(params) → setState
  ├── useState: users, kpis, sparklines, growth, pagination, loading, error
  │
  ├── {loading ? <Skeleton /> : (
  │     <>
  │       <UsersKpiSection kpis={kpis} sparklines={sparklines} />
  │       <UsersFilters totalResults={pagination.totalItems} />
  │       <UsersTable users={users} sort={sort} sortDir={sortDir} onRefresh={refetch} />
  │       <UsersPagination {...pagination} />
  │     </>
  ���   )}
  └── {error && <Alert variant="destructive">...</Alert>}
```

### 4.5 KPI cards (6 cards)

| Card | Icon | Value | Sparkline |
|------|------|-------|-----------|
| Total Usuarios | `Users` | `kpis.totalUsers` | total (30d) |
| Ativos | `UserCheck` | `kpis.activeUsers` | — |
| Premium | `Crown` | `kpis.premiumCount` | premium (30d) |
| Admin | `Shield` | `kpis.adminCount` | �� |
| Novos (mes) | `UserPlus` | `kpis.newThisMonth` | signups (30d) |
| Inativos | `UserX` | `kpis.inactiveUsers` | — |

Sparklines rendered as inline SVG polylines (no chart library needed for mini sparklines).

### 4.6 Table columns

| Column | Content | Sortable |
|--------|---------|----------|
| Usuario | Avatar + name + masked email (eye reveal) | by `first_name` |
| Role | Badge "Admin" (amber) / "User" (slate) | — |
| Plano | Badge "Premium Monthly/Yearly" (green) / "Free" (gray) / "Expirado" (red) | by `is_premium` |
| Expira em | Formatted date, red if expired, yellow if < 30 days. "—" if not premium | — |
| Cadastro | Relative date ("3 meses atras") + tooltip with absolute date | by `created_at` |
| Acoes | DropdownMenu: Editar, Alterar Role, Desativar/Ativar, Excluir | — |

**Avatar component:** Renders `<img>` from `avatarUrl` if available, otherwise shows initials (first letter of first + last name) in a colored circle. Color derived from user ID hash for consistency.

**Email masking:** `t****o@example.com` — show first char, mask middle with `****`, show last char before `@`, show full domain. Reveal on eye icon click (client-side only, full email already in data).

### 4.7 Filters

Client component with `useSearchParams` + `useRouter`:
- Debounced search input (300ms) — on change, update `search` URL param
- Dropdown: Premium (Todos / Premium / Free)
- Dropdown: Status (Todos / Ativo / Inativo)
- Dropdown: Role (Todos / Admin)
- All filter changes reset `page` param to 1
- URL is source of truth; `useEffect` triggers refetch when params change

### 4.8 Modals

**User Edit Modal:**
- Fields: first_name, last_name, is_premium toggle, premium_plan select (shown only when premium=true), premium_expires_at date picker (shown only when premium=true), is_active toggle
- On save: `updateUser(id, body)` → toast success → `refetch()`
- On error: toast error with message from API
- Loading state on save button

**User Role Modal:**
- Confirmation dialog: "Promover {nome} a Admin?" / "Remover admin de {nome}?"
- On confirm: `updateUserRole(id, role)` → toast → `refetch()`
- Error from API (last admin, self-demotion) shown in toast

**User Delete Dialog:**
- shadcn AlertDialog with destructive variant
- Text: "Esta acao e irreversivel. Todos os dados de {nome} serao excluidos."
- On confirm: `deleteUser(id)` → toast → `refetch()`
- Error from API (self-deletion, last admin) shown in toast

### 4.9 Empty & error states

- **Loading:** Skeleton grid for KPIs + skeleton table rows (matching existing pattern in research page)
- **Error:** `<Alert variant="destructive">` with error message + retry button
- **Empty (no users):** Centered illustration with "Nenhum usuario encontrado" message
- **Empty (filtered):** "Nenhum resultado para os filtros selecionados" with clear filters button

### 4.10 Sidebar update

Add `/users` link in main nav section of `Sidebar.tsx`, after "Assets" and before the Settings separator. Icon: `Users` from lucide-react.

## 5. Auth hook update

Update `onPostSignUp` in `apps/api/src/routes/auth.ts` to include `email` in the `user_profiles` upsert:

```typescript
await supabase.from('user_profiles').upsert({
  id: user.id,
  email: user.email,  // ← NEW
  first_name: metadata.first_name ?? null,
  last_name: metadata.last_name ?? null,
})
```

## 6. Safety guards summary

| Guard | Endpoint | Error |
|-------|----------|-------|
| Self-deletion | DELETE /:id | "Cannot delete your own account" |
| Self-demotion | PATCH /:id/role | "Cannot remove your own admin role" |
| Last admin (role) | PATCH /:id/role | "Cannot remove the last admin" |
| Last admin (delete) | DELETE /:id | "Cannot delete the last admin" |

## 7. Out of scope (future)

- Audit logging of role/premium changes
- Soft delete (use `is_active` for now, hard delete available)
- CSV export
- Bulk actions
- Cron to auto-expire premium
- User invitation flow
