# Users Page — Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Pattern reference:** TôNaGarantia admin users page (server components + client interaction, URL-driven state)

## Overview

Add a full users management page at `/users` with KPI dashboard, filterable/sortable table, and CRUD operations including premium management and admin role assignment.

## 1. Database Schema

### 1.1 Alter `user_profiles`

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

-- Trigram indexes for partial search on name and email
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

### 1.2 Create `user_roles` (sparse — admin rows only)

```sql
CREATE TABLE user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
```

**Convention:** Row present = admin. No row = regular user. Never insert role `'user'`.

### 1.3 RPCs for KPIs

**`users_page_kpis()`** returns:
```json
{
  "total_users": 142,
  "active_users": 130,
  "inactive_users": 12,
  "premium_count": 28,
  "admin_count": 3,
  "free_count": 114,
  "new_today": 5,
  "new_this_week": 18,
  "new_this_month": 42
}
```

Premium count uses effective premium check (respects expiration):
```sql
CASE
  WHEN is_premium = true
   AND premium_expires_at IS NOT NULL
   AND premium_expires_at < now()
  THEN false
  ELSE is_premium
END AS is_premium_effective
```

**`users_page_growth(p_from timestamptz, p_to timestamptz)`** returns:
```json
[
  {"date": "2026-04-01", "signups": 3, "premium_signups": 1},
  {"date": "2026-04-02", "signups": 5, "premium_signups": 0}
]
```

**`users_page_sparklines()`** returns 30-day arrays:
```json
{
  "total": [120, 121, 122, ...],
  "premium": [25, 25, 26, ...],
  "signups": [3, 5, 2, ...]
}
```

### 1.4 Premium expiration handling

No cron. Expiration is checked on read via `is_premium_effective` CASE expression. The admin sees the expired status in the UI (red badge) and decides whether to renew or remove manually.

## 2. Shared Package

### 2.1 Types — `packages/shared/src/types/users.ts`

```typescript
// DB row shapes (snake_case)
export interface UserProfileRow {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  is_premium: boolean
  premium_plan: 'monthly' | 'yearly' | null
  premium_started_at: string | null
  premium_expires_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserRoleRow {
  id: string
  user_id: string
  role: 'admin'
  created_at: string
  updated_at: string
}

// API response shape (camelCase)
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

### 2.2 Schemas — `packages/shared/src/schemas/users.ts`

Zod schemas for:
- `usersQuerySchema` — GET query params validation (page, search, premium, active, role, sort, sortDir)
- `userUpdateSchema` — PATCH body with refinement: if `isPremium=true`, require `premiumPlan` and `premiumExpiresAt`
- `userRoleUpdateSchema` — PATCH role body (`role: 'admin' | 'user'`)

### 2.3 Mapper — `packages/shared/src/mappers/users.ts`

```typescript
export function userRowToListItem(
  row: UserProfileRow,
  role: 'admin' | 'user'
): UserListItem
```

Converts snake_case to camelCase and computes `isPremiumEffective` based on `is_premium` + `premium_expires_at`.

## 3. API Routes

### 3.1 Endpoints — `apps/api/src/routes/users.ts`

Registered on Fastify as prefix `/users`. All routes use `{ preHandler: [authenticate] }`.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/users` | Paginated list with filters + KPIs |
| `GET` | `/users/:id` | Single user detail |
| `PATCH` | `/users/:id` | Edit profile, premium, active |
| `PATCH` | `/users/:id/role` | Promote/demote admin |
| `DELETE` | `/users/:id` | Hard delete (cascade) |

### 3.2 GET `/users` query params

```
?page=1                              (default 1, 20 per page)
?search=thiago                       (trigram match on name + email)
?premium=all|true|false              (default: all)
?active=all|true|false               (default: all)
?role=all|admin                      (default: all)
?sort=name|email|created_at|is_premium  (default: created_at)
?sortDir=asc|desc                    (default: desc)
```

**Implementation:**
1. Call 3 RPCs in parallel via `Promise.all`
2. Build query on `user_profiles` with LEFT JOIN on `user_roles`
3. Apply conditional filters (trigram search, premium, active, role)
4. Compute `is_premium_effective` inline via CASE
5. Separate count query for pagination
6. Return in `{ data, error }` envelope

### 3.3 PATCH `/users/:id` body

```typescript
{
  firstName?: string,
  lastName?: string,
  isPremium?: boolean,
  premiumPlan?: "monthly" | "yearly",
  premiumExpiresAt?: string,
  isActive?: boolean,
}
```

- `isPremium` false→true: set `premium_started_at = now()` automatically
- `isPremium` true→false: clear `premium_plan`, `premium_started_at`, `premium_expires_at`

### 3.4 PATCH `/users/:id/role` body

```typescript
{ role: "admin" | "user" }
```

- `"admin"` → upsert row in `user_roles`
- `"user"` → delete row from `user_roles`

### 3.5 DELETE `/users/:id`

Hard delete. CASCADE removes `user_roles` row automatically.

### 3.6 Register in server.ts

Add `import { usersRoutes } from './routes/users'` and register with prefix `/users`.

## 4. Frontend

### 4.1 File structure

```
apps/app/src/app/users/
├── page.tsx                          ← Server component, force-dynamic
└── components/
    ├── users-kpi-section.tsx         ← KPI cards grid
    ├── users-filters.tsx             ← Search + filter dropdowns
    ├── users-table.tsx               ← Sortable table
    ├── users-pagination.tsx          ← URL-driven pagination
    ├── user-edit-modal.tsx           ← Edit profile + premium modal
    ├── user-role-modal.tsx           ← Confirm role change
    └── user-delete-dialog.tsx        ← AlertDialog confirm delete
```

### 4.2 Data flow

```
page.tsx (server)
  ├── reads searchParams (page, search, filters, sort)
  ├── fetch GET /api/users?{searchParams}  (server-side, with X-Internal-Key)
  │     → kpis, sparklines, growth, users[], pagination
  │
  ├── <UsersKpiSection kpis={kpis} sparklines={sparklines} />
  ├── <UsersFilters totalResults={pagination.totalItems} />
  ├── <UsersTable users={users} sort={sort} sortDir={sortDir} />
  └── <UsersPagination {...pagination} />
```

Server component fetches data and distributes as props. Client components handle interaction only (sort clicks, filter changes, modal open/close).

### 4.3 KPI cards (6 cards)

| Card | Value | Sparkline |
|------|-------|-----------|
| Total Usuarios | `kpis.totalUsers` | total (30d) |
| Ativos | `kpis.activeUsers` | — |
| Premium | `kpis.premiumCount` | premium (30d) |
| Admin | `kpis.adminCount` | — |
| Novos (mes) | `kpis.newThisMonth` | signups (30d) |
| Inativos | `kpis.inactiveUsers` | — |

Component inspired by TôNaGarantia's KpiCard: Lucide icons, variation badges, inline SVG sparklines.

### 4.4 Table columns

| Column | Content | Sortable |
|--------|---------|----------|
| Usuario | Avatar + name + masked email (eye reveal) | by `name` |
| Role | Badge "Admin" (amber) / "User" (slate) | — |
| Plano | Badge "Premium Monthly/Yearly" (green) / "Free" (gray) / "Expirado" (red) | by `is_premium` |
| Expira em | Formatted date, red if expired, yellow if < 30 days | — |
| Cadastro | Relative date ("3 meses atras") + tooltip with absolute date | by `created_at` |
| Acoes | Dropdown: Editar, Alterar Role, Desativar/Ativar, Excluir | — |

### 4.5 Filters

Client component with `useRouter` + `useSearchParams`:
- Debounced search input (300ms)
- Dropdown: Premium (all/true/false)
- Dropdown: Active (all/true/false)
- Dropdown: Role (all/admin)
- All filters update URL params, reset page to 1

### 4.6 Modals

**User Edit Modal:**
- Fields: first_name, last_name, is_premium toggle, premium_plan select, premium_expires_at date picker, is_active toggle
- PATCH `/api/users/:id` → `router.refresh()` on success
- Toast notification on success/error

**User Role Modal:**
- Confirmation: "Promover {nome} a Admin?" / "Remover admin de {nome}?"
- PATCH `/api/users/:id/role` → `router.refresh()`

**User Delete Dialog:**
- shadcn AlertDialog: "Esta acao e irreversivel. Todos os dados de {nome} serao excluidos."
- DELETE `/api/users/:id` → `router.refresh()`

### 4.7 Sidebar update

Add `/users` link in main nav section of `Sidebar.tsx`, after "Assets" and before the Settings separator. Icon: `Users` from lucide-react.

## 5. Auth hook update

Update `onPostSignUp` in `apps/api/src/routes/auth.ts` to include `email` in the `user_profiles` upsert.

## 6. Out of scope (future)

- Audit logging of role/premium changes
- Soft delete (use `is_active` for now, hard delete available)
- CSV export
- Bulk actions
- Cron to auto-expire premium
- User invitation flow
