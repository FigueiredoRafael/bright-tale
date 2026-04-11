# Users Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full users management page at `/users` with KPI dashboard, filterable/sortable table, and CRUD operations (profile edit, premium management, admin role toggle).

**Architecture:** Client-side rendered page (`"use client"`) following existing bright-tale patterns. Fastify API route with Supabase service_role queries. Shared Zod schemas and mapper in `@brighttale/shared`. SQL RPCs for KPI aggregations.

**Tech Stack:** Next.js 16 (App Router), React 19, Fastify, Supabase JS v2, Zod, shadcn/ui, Tailwind CSS, Lucide React, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-11-users-page-design.md`

**Existing schema context:** `user_profiles` exists (migration `20260411025005`). `user_roles` exists (migration `20260411030000`) with `bigserial` PK, `CHECK (role IN ('admin','user'))`, `UNIQUE(user_id, role)`. This plan extends `user_profiles` and works with the existing `user_roles` as-is.

---

## File Map

### Database
- Create: `supabase/migrations/20260411040000_user_profiles_premium.sql` — add email, premium, is_active columns + indexes
- Create: `supabase/migrations/20260411040100_users_page_rpcs.sql` — 3 RPC functions for KPIs

### Shared Package
- Create: `packages/shared/src/types/users.ts` — API response interfaces
- Create: `packages/shared/src/schemas/users.ts` — Zod schemas for query/update/role
- Create: `packages/shared/src/mappers/users.ts` — row-to-list-item mapper

### API
- Create: `apps/api/src/routes/users.ts` — 5 Fastify endpoints
- Modify: `apps/api/src/server.ts:21-55` — register users route
- Modify: `apps/api/src/routes/auth.ts:45-55` — add email to onPostSignUp upsert

### Frontend
- Create: `apps/app/src/lib/api/users.ts` — API client functions
- Create: `apps/app/src/app/users/page.tsx` — main page
- Create: `apps/app/src/app/users/components/users-kpi-section.tsx` — KPI cards
- Create: `apps/app/src/app/users/components/users-filters.tsx` — search + dropdowns
- Create: `apps/app/src/app/users/components/users-table.tsx` — sortable table
- Create: `apps/app/src/app/users/components/users-pagination.tsx` — pagination
- Create: `apps/app/src/app/users/components/user-edit-modal.tsx` — edit profile/premium
- Create: `apps/app/src/app/users/components/user-role-modal.tsx` — role change confirm
- Create: `apps/app/src/app/users/components/user-delete-dialog.tsx` — delete confirm
- Modify: `apps/app/src/components/layout/Sidebar.tsx:19,89-91` — add Users link

---

## Task 1: Database Migration — user_profiles Premium Columns

**Files:**
- Create: `supabase/migrations/20260411040000_user_profiles_premium.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260411040000_user_profiles_premium.sql`:

```sql
-- Add email, premium, and active columns to user_profiles.
-- pg_trgm enables accelerated ilike '%term%' searches.

create extension if not exists pg_trgm;

alter table public.user_profiles
  add column email              text unique,
  add column is_premium         boolean not null default false,
  add column premium_plan       text check (premium_plan in ('monthly', 'yearly')),
  add column premium_started_at timestamptz,
  add column premium_expires_at timestamptz,
  add column is_active          boolean not null default true;

-- Premium fields must be all-or-nothing
alter table public.user_profiles
  add constraint chk_premium_consistency
  check (
    (is_premium = false and premium_plan is null and premium_started_at is null and premium_expires_at is null)
    or
    (is_premium = true and premium_plan is not null and premium_started_at is not null)
  );

-- Indexes for filters and sort
create index idx_user_profiles_email       on public.user_profiles (email);
create index idx_user_profiles_premium     on public.user_profiles (is_premium) where is_premium = true;
create index idx_user_profiles_active      on public.user_profiles (is_active) where is_active = false;
create index idx_user_profiles_created_at  on public.user_profiles (created_at desc);

-- Trigram indexes for partial name/email search
create index idx_user_profiles_name_trgm
  on public.user_profiles using gin (
    (coalesce(first_name, '') || ' ' || coalesce(last_name, '')) gin_trgm_ops
  );
create index idx_user_profiles_email_trgm
  on public.user_profiles using gin (email gin_trgm_ops);

-- Backfill email from auth.users for existing rows
update public.user_profiles p
set email = a.email
from auth.users a
where p.id = a.id and p.email is null;

-- Delete orphaned user_profiles with no auth.users match (can't have email)
delete from public.user_profiles
where email is null
  and not exists (select 1 from auth.users a where a.id = public.user_profiles.id);

-- After backfill + cleanup, enforce NOT NULL
alter table public.user_profiles alter column email set not null;
```

- [ ] **Step 2: Push migration to dev**

Run: `npm run db:push:dev`
Expected: Migration applies successfully.

- [ ] **Step 3: Regenerate database types**

Run: `npm run db:types`
Expected: `packages/shared/src/types/database.ts` updated with new columns on `user_profiles`.

- [ ] **Step 4: Verify types include new columns**

Open `packages/shared/src/types/database.ts` and confirm `user_profiles.Row` now includes: `email`, `is_premium`, `premium_plan`, `premium_started_at`, `premium_expires_at`, `is_active`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260411040000_user_profiles_premium.sql packages/shared/src/types/database.ts
git commit -m "feat(db): add premium, email, active columns to user_profiles"
```

---

## Task 2: Database Migration — KPI RPCs

**Files:**
- Create: `supabase/migrations/20260411040100_users_page_rpcs.sql`

- [ ] **Step 1: Write the RPCs migration**

Create `supabase/migrations/20260411040100_users_page_rpcs.sql`:

```sql
-- RPC: users_page_kpis — aggregate counts for KPI cards
create or replace function public.users_page_kpis()
returns json language sql stable security definer
set search_path = '' as $$
  with effective as (
    select *,
      case when is_premium and (premium_expires_at is null or premium_expires_at >= now())
           then true else false end as ipe
    from public.user_profiles
  )
  select json_build_object(
    'total_users',    count(*),
    'active_users',   count(*) filter (where is_active),
    'inactive_users', count(*) filter (where not is_active),
    'premium_count',  count(*) filter (where ipe and is_active),
    'admin_count',    (select count(*) from public.user_roles where role = 'admin'),
    'free_count',     count(*) filter (where not ipe and is_active),
    'new_today',      count(*) filter (where created_at >= current_date),
    'new_this_week',  count(*) filter (where created_at >= date_trunc('week', current_date)),
    'new_this_month', count(*) filter (where created_at >= date_trunc('month', current_date))
  ) from effective;
$$;

-- RPC: users_page_growth — daily signup counts in a date range
create or replace function public.users_page_growth(p_from timestamptz, p_to timestamptz)
returns json language sql stable security definer
set search_path = '' as $$
  select coalesce(json_agg(row_to_json(t) order by t.date), '[]'::json)
  from (
    select
      d::date as date,
      count(up.id) filter (where up.id is not null) as signups,
      count(up.id) filter (where up.is_premium and up.premium_started_at::date = d::date) as premium_signups
    from generate_series(p_from::date, p_to::date, '1 day') d
    left join public.user_profiles up on up.created_at::date = d::date
    group by d
  ) t;
$$;

-- RPC: users_page_sparklines — 30-day data arrays for sparkline charts
create or replace function public.users_page_sparklines()
returns json language sql stable security definer
set search_path = '' as $$
  with days as (
    select d::date as day
    from generate_series(current_date - 29, current_date, '1 day') d
  ),
  daily as (
    select
      d.day,
      (select count(*) from public.user_profiles where created_at::date <= d.day) as cumulative_total,
      count(up.id) filter (where up.id is not null) as signups,
      (select count(*) from public.user_profiles
       where is_premium
         and (premium_expires_at is null or premium_expires_at >= d.day + '1 day'::interval)
         and premium_started_at <= d.day + '1 day'::interval
      ) as premium_count
    from days d
    left join public.user_profiles up on up.created_at::date = d.day
    group by d.day
  )
  select json_build_object(
    'total',   (select json_agg(cumulative_total order by day) from daily),
    'premium', (select json_agg(premium_count order by day) from daily),
    'signups', (select json_agg(signups order by day) from daily)
  );
$$;
```

- [ ] **Step 2: Push migration to dev**

Run: `npm run db:push:dev`
Expected: 3 functions created successfully.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260411040100_users_page_rpcs.sql
git commit -m "feat(db): add users page KPI/growth/sparkline RPCs"
```

---

## Task 3: Shared Types

**Files:**
- Create: `packages/shared/src/types/users.ts`

- [ ] **Step 1: Create the types file**

Create `packages/shared/src/types/users.ts`:

```typescript
/** API response types for the users page */

export interface UserListItem {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  isPremium: boolean;
  isPremiumEffective: boolean;
  premiumPlan: 'monthly' | 'yearly' | null;
  premiumStartedAt: string | null;
  premiumExpiresAt: string | null;
  isActive: boolean;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface UsersKpis {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  premiumCount: number;
  adminCount: number;
  freeCount: number;
  newToday: number;
  newThisWeek: number;
  newThisMonth: number;
}

export interface UsersSparklines {
  total: number[];
  premium: number[];
  signups: number[];
}

export interface UsersGrowthPoint {
  date: string;
  signups: number;
  premiumSignups: number;
}

export interface UsersPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface UsersPageData {
  data: UserListItem[];
  kpis: UsersKpis;
  sparklines: UsersSparklines;
  growth: UsersGrowthPoint[];
  pagination: UsersPagination;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/users.ts
git commit -m "feat(shared): add users page API types"
```

---

## Task 4: Shared Schemas

**Files:**
- Create: `packages/shared/src/schemas/users.ts`

- [ ] **Step 1: Create the schemas file**

Create `packages/shared/src/schemas/users.ts`:

```typescript
import { z } from 'zod';

/** GET /users query params */
export const usersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  premium: z.enum(['all', 'true', 'false']).default('all'),
  active: z.enum(['all', 'true', 'false']).default('all'),
  role: z.enum(['all', 'admin']).default('all'),
  sort: z.enum(['first_name', 'email', 'created_at', 'is_premium']).default('created_at'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type UsersQuery = z.infer<typeof usersQuerySchema>;

/** PATCH /users/:id body */
export const userUpdateSchema = z
  .object({
    firstName: z.string().min(1).max(200).optional(),
    lastName: z.string().min(1).max(200).optional(),
    isPremium: z.boolean().optional(),
    premiumPlan: z.enum(['monthly', 'yearly']).optional(),
    premiumExpiresAt: z.string().datetime().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.isPremium === true) {
        return data.premiumPlan !== undefined && data.premiumExpiresAt !== undefined;
      }
      return true;
    },
    { message: 'premiumPlan and premiumExpiresAt are required when isPremium is true' },
  );

export type UserUpdate = z.infer<typeof userUpdateSchema>;

/** PATCH /users/:id/role body */
export const userRoleUpdateSchema = z.object({
  role: z.enum(['admin', 'user']),
});

export type UserRoleUpdate = z.infer<typeof userRoleUpdateSchema>;
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schemas/users.ts
git commit -m "feat(shared): add users page Zod schemas"
```

---

## Task 5: Shared Mapper

**Files:**
- Create: `packages/shared/src/mappers/users.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/mappers/users.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { userRowToListItem } from '../../mappers/users';

describe('userRowToListItem', () => {
  const baseRow = {
    id: 'u1',
    email: 'test@example.com',
    first_name: 'John',
    last_name: 'Doe',
    avatar_url: null,
    is_premium: false,
    premium_plan: null,
    premium_started_at: null,
    premium_expires_at: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  it('maps a free user correctly', () => {
    const result = userRowToListItem(baseRow, 'user');
    expect(result).toEqual({
      id: 'u1',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      avatarUrl: null,
      isPremium: false,
      isPremiumEffective: false,
      premiumPlan: null,
      premiumStartedAt: null,
      premiumExpiresAt: null,
      isActive: true,
      role: 'user',
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('maps a premium user with future expiry as effective', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const row = {
      ...baseRow,
      is_premium: true,
      premium_plan: 'yearly' as const,
      premium_started_at: '2026-01-01T00:00:00Z',
      premium_expires_at: futureDate,
    };
    const result = userRowToListItem(row, 'admin');
    expect(result.isPremium).toBe(true);
    expect(result.isPremiumEffective).toBe(true);
    expect(result.role).toBe('admin');
  });

  it('maps a premium user with past expiry as not effective', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const row = {
      ...baseRow,
      is_premium: true,
      premium_plan: 'monthly' as const,
      premium_started_at: '2025-12-01T00:00:00Z',
      premium_expires_at: pastDate,
    };
    const result = userRowToListItem(row, 'user');
    expect(result.isPremium).toBe(true);
    expect(result.isPremiumEffective).toBe(false);
  });

  it('maps premium with null expiry as effective (no expiration)', () => {
    const row = {
      ...baseRow,
      is_premium: true,
      premium_plan: 'yearly' as const,
      premium_started_at: '2026-01-01T00:00:00Z',
      premium_expires_at: null,
    };
    const result = userRowToListItem(row, 'user');
    expect(result.isPremiumEffective).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/mappers/users.test.ts`
Expected: FAIL — `userRowToListItem` does not exist.

- [ ] **Step 3: Write the mapper implementation**

Create `packages/shared/src/mappers/users.ts`:

```typescript
import type { UserListItem } from '../types/users';

/** Shape of a user_profiles row from the database (snake_case) */
export interface UserProfileRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_premium: boolean;
  premium_plan: string | null;
  premium_started_at: string | null;
  premium_expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Convert a user_profiles DB row + role into a camelCase API response item.
 * Computes isPremiumEffective from is_premium + premium_expires_at.
 */
export function userRowToListItem(
  row: UserProfileRow,
  role: 'admin' | 'user',
): UserListItem {
  const isPremiumEffective =
    row.is_premium &&
    (row.premium_expires_at === null || new Date(row.premium_expires_at) >= new Date());

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
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/mappers/users.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/mappers/users.ts packages/shared/src/__tests__/mappers/users.test.ts
git commit -m "feat(shared): add userRowToListItem mapper with tests"
```

---

## Task 6: API Route — Users

**Files:**
- Create: `apps/api/src/routes/users.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Create the users route plugin**

Create `apps/api/src/routes/users.ts`:

**IMPORTANT:** `user_profiles` and `user_roles` both reference `auth.users(id)` but have NO direct FK between them. PostgREST cannot infer a relationship, so `.select('*, user_roles(role)')` would fail with a 400 error. Instead, we fetch admin IDs separately and merge in JS.

```typescript
import type { FastifyInstance } from 'fastify';
import { authenticate } from '@/middleware/authenticate';
import { createServiceClient } from '@/lib/supabase';
import { sendError } from '@/lib/api/fastify-errors';
import { ApiError } from '@/lib/api/errors';
import {
  usersQuerySchema,
  userUpdateSchema,
  userRoleUpdateSchema,
} from '@brighttale/shared/schemas/users';
import { userRowToListItem } from '@brighttale/shared/mappers/users';

/** Fetch all admin user IDs as a Set */
async function getAdminIds(sb: ReturnType<typeof createServiceClient>): Promise<Set<string>> {
  const { data } = await sb.from('user_roles').select('user_id').eq('role', 'admin');
  return new Set((data ?? []).map((r) => r.user_id));
}

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET / — List users with filters, pagination, and KPIs
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const query = usersQuerySchema.parse(Object.fromEntries(url.searchParams));

      const { page, limit, search, premium, active, role, sort, sortDir } = query;

      // Fetch KPIs, sparklines, growth, and admin IDs in parallel
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [kpisRes, sparklinesRes, growthRes, adminIds] = await Promise.all([
        sb.rpc('users_page_kpis'),
        sb.rpc('users_page_sparklines'),
        sb.rpc('users_page_growth', {
          p_from: thirtyDaysAgo.toISOString(),
          p_to: new Date().toISOString(),
        }),
        getAdminIds(sb),
      ]);

      // Build user list queries (count + data in parallel)
      let countQuery = sb.from('user_profiles').select('*', { count: 'exact', head: true });
      let dataQuery = sb.from('user_profiles').select('*');

      // Apply filters to both queries
      if (search) {
        const searchFilter = `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`;
        countQuery = countQuery.or(searchFilter);
        dataQuery = dataQuery.or(searchFilter);
      }
      if (premium !== 'all') {
        countQuery = countQuery.eq('is_premium', premium === 'true');
        dataQuery = dataQuery.eq('is_premium', premium === 'true');
      }
      if (active !== 'all') {
        countQuery = countQuery.eq('is_active', active === 'true');
        dataQuery = dataQuery.eq('is_active', active === 'true');
      }
      if (role === 'admin') {
        // Filter by admin IDs (from the separate user_roles query)
        const ids = Array.from(adminIds);
        if (ids.length === 0) {
          // No admins — return empty result immediately
          return reply.send({
            data: {
              data: [],
              kpis: kpisRes.data ?? {},
              sparklines: sparklinesRes.data ?? { total: [], premium: [], signups: [] },
              growth: growthRes.data ?? [],
              pagination: { page, pageSize: limit, totalItems: 0, totalPages: 0 },
            },
            error: null,
          });
        }
        countQuery = countQuery.in('id', ids);
        dataQuery = dataQuery.in('id', ids);
      }

      const [{ count: total, error: countErr }, { data: rows, error: dataErr }] =
        await Promise.all([
          countQuery,
          dataQuery
            .order(sort, { ascending: sortDir === 'asc' })
            .range((page - 1) * limit, page * limit - 1),
        ]);

      if (countErr) throw countErr;
      if (dataErr) throw dataErr;

      // Merge role from adminIds Set (no FK join needed)
      const users = (rows ?? []).map((row: any) =>
        userRowToListItem(row, adminIds.has(row.id) ? 'admin' : 'user'),
      );

      return reply.send({
        data: {
          data: users,
          kpis: kpisRes.data ?? {},
          sparklines: sparklinesRes.data ?? { total: [], premium: [], signups: [] },
          growth: growthRes.data ?? [],
          pagination: {
            page,
            pageSize: limit,
            totalItems: total ?? 0,
            totalPages: Math.ceil((total ?? 0) / limit),
          },
        },
        error: null,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list users');
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id — Get single user
   */
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const [{ data: row, error }, { data: roleRow }] = await Promise.all([
        sb.from('user_profiles').select('*').eq('id', id).maybeSingle(),
        sb.from('user_roles').select('role').eq('user_id', id).eq('role', 'admin').maybeSingle(),
      ]);

      if (error) throw error;
      if (!row) throw new ApiError(404, 'User not found', 'NOT_FOUND');

      const userRole = roleRow ? 'admin' as const : 'user' as const;

      return reply.send({
        data: userRowToListItem(row as any, userRole),
        error: null,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get user');
      return sendError(reply, error);
    }
  });

  /**
   * PATCH /:id — Update user profile/premium/active
   */
  fastify.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const body = userUpdateSchema.parse(request.body);

      // Build snake_case update object
      const update: Record<string, unknown> = {};
      if (body.firstName !== undefined) update.first_name = body.firstName;
      if (body.lastName !== undefined) update.last_name = body.lastName;
      if (body.isActive !== undefined) update.is_active = body.isActive;

      if (body.isPremium !== undefined) {
        update.is_premium = body.isPremium;
        if (body.isPremium) {
          update.premium_plan = body.premiumPlan;
          update.premium_expires_at = body.premiumExpiresAt;
          update.premium_started_at = new Date().toISOString();
        } else {
          // Clear premium fields to satisfy CHECK constraint
          update.premium_plan = null;
          update.premium_started_at = null;
          update.premium_expires_at = null;
        }
      }

      const { data: updated, error } = await sb
        .from('user_profiles')
        .update(update)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!updated) throw new ApiError(404, 'User not found', 'NOT_FOUND');

      return reply.send({ data: updated, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update user');
      return sendError(reply, error);
    }
  });

  /**
   * PATCH /:id/role — Change user role (admin/user)
   */
  fastify.patch('/:id/role', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const { role } = userRoleUpdateSchema.parse(request.body);

      // Safety: prevent self-demotion
      if (role === 'user' && request.userId === id) {
        throw new ApiError(400, 'Cannot remove your own admin role', 'SELF_DEMOTION');
      }

      if (role === 'admin') {
        // Upsert admin role
        const { error } = await sb
          .from('user_roles')
          .upsert({ user_id: id, role: 'admin' }, { onConflict: 'user_id,role' });
        if (error) throw error;
      } else {
        // Safety: prevent removing last admin
        const { count, error: countErr } = await sb
          .from('user_roles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'admin');
        if (countErr) throw countErr;
        if ((count ?? 0) <= 1) {
          throw new ApiError(400, 'Cannot remove the last admin', 'LAST_ADMIN');
        }

        const { error } = await sb
          .from('user_roles')
          .delete()
          .eq('user_id', id)
          .eq('role', 'admin');
        if (error) throw error;
      }

      return reply.send({ data: { success: true }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update user role');
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /:id — Delete user (hard delete, cascades)
   */
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      // Safety: prevent self-deletion
      if (request.userId === id) {
        throw new ApiError(400, 'Cannot delete your own account', 'SELF_DELETE');
      }

      // Safety: prevent deleting last admin
      const { data: roleRow } = await sb
        .from('user_roles')
        .select('role')
        .eq('user_id', id)
        .eq('role', 'admin')
        .maybeSingle();

      if (roleRow) {
        const { count, error: countErr } = await sb
          .from('user_roles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'admin');
        if (countErr) throw countErr;
        if ((count ?? 0) <= 1) {
          throw new ApiError(400, 'Cannot delete the last admin', 'LAST_ADMIN');
        }
      }

      const { error } = await sb.from('user_profiles').delete().eq('id', id);
      if (error) throw error;

      return reply.send({ data: { success: true }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete user');
      return sendError(reply, error);
    }
  });
}
```

- [ ] **Step 2: Register route in server.ts**

In `apps/api/src/server.ts`, add the import after line 21 (after `exportRoutes`):

```typescript
import { usersRoutes } from './routes/users.js';
```

Add the register call after line 55 (after `exportRoutes`):

```typescript
await fastify.register(usersRoutes, { prefix: '/users' });
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/users.ts apps/api/src/server.ts
git commit -m "feat(api): add users CRUD route with safety guards"
```

---

## Task 7: Update Auth Hook — Email on SignUp

**Files:**
- Modify: `apps/api/src/routes/auth.ts:45-55`

- [ ] **Step 1: Read the current auth route**

Read `apps/api/src/routes/auth.ts` to confirm the exact onPostSignUp code.

- [ ] **Step 2: Update the upsert to include email**

In `apps/api/src/routes/auth.ts`, change the `onPostSignUp` hook (around line 45-51).

Replace:
```typescript
onPostSignUp: async ({ userId }) => {
  // Create user_profiles row when a new user signs up via email/password.
  // Upsert with ignoreDuplicates: true makes this safe for email-confirm
  // resend flows (same userId, no error on second call).
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });
```

With:
```typescript
onPostSignUp: async ({ userId }) => {
  // Retrieve email from auth.users (the callback may not include it)
  let email: string | undefined;
  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  if (authUser?.user?.email) {
    email = authUser.user.email;
  }

  // Create user_profiles row when a new user signs up via email/password.
  // Upsert with ignoreDuplicates: true makes this safe for email-confirm
  // resend flows (same userId, no error on second call).
  const { error } = await supabase
    .from('user_profiles')
    .upsert(
      { id: userId, ...(email ? { email } : {}) },
      { onConflict: 'id', ignoreDuplicates: true },
    );
```

**Why `auth.admin.getUserById`:** The `@tn-figueiredo/auth` `onPostSignUp` callback signature may not include `email`. Fetching from `auth.admin` is the safest approach since the API already has `service_role` access. The spread `...(email ? { email } : {})` ensures we don't set email to undefined if the lookup somehow fails.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat(auth): include email in user_profiles on signup"
```

---

## Task 8: Frontend API Client

**Files:**
- Create: `apps/app/src/lib/api/users.ts`

- [ ] **Step 1: Create the API client**

Create `apps/app/src/lib/api/users.ts`:

```typescript
import type { UsersPageData, UserListItem } from '@brighttale/shared/types/users';

export interface UsersListParams {
  page?: number;
  search?: string;
  premium?: string;
  active?: string;
  role?: string;
  sort?: string;
  sortDir?: string;
}

export async function fetchUsersList(params: UsersListParams = {}): Promise<UsersPageData> {
  const qp = new URLSearchParams();
  if (params.page) qp.set('page', String(params.page));
  if (params.search) qp.set('search', params.search);
  if (params.premium && params.premium !== 'all') qp.set('premium', params.premium);
  if (params.active && params.active !== 'all') qp.set('active', params.active);
  if (params.role && params.role !== 'all') qp.set('role', params.role);
  if (params.sort) qp.set('sort', params.sort);
  if (params.sortDir) qp.set('sortDir', params.sortDir);

  const url = `/api/users${qp.toString() ? `?${qp.toString()}` : ''}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: 'Failed to fetch users' } }));
    throw new Error(body.error?.message || 'Failed to fetch users');
  }

  const json = await res.json();
  return json.data;
}

export async function fetchUser(id: string): Promise<UserListItem> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: 'Failed to fetch user' } }));
    throw new Error(body.error?.message || 'Failed to fetch user');
  }
  const json = await res.json();
  return json.data;
}

export async function updateUser(
  id: string,
  body: {
    firstName?: string;
    lastName?: string;
    isPremium?: boolean;
    premiumPlan?: 'monthly' | 'yearly';
    premiumExpiresAt?: string;
    isActive?: boolean;
  },
): Promise<void> {
  const res = await fetch(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: { message: 'Failed to update user' } }));
    throw new Error(data.error?.message || 'Failed to update user');
  }
}

export async function updateUserRole(id: string, role: 'admin' | 'user'): Promise<void> {
  const res = await fetch(`/api/users/${id}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: { message: 'Failed to update role' } }));
    throw new Error(data.error?.message || 'Failed to update role');
  }
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: { message: 'Failed to delete user' } }));
    throw new Error(data.error?.message || 'Failed to delete user');
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/lib/api/users.ts
git commit -m "feat(app): add users API client functions"
```

---

## Task 9: Frontend — KPI Section Component

**Files:**
- Create: `apps/app/src/app/users/components/users-kpi-section.tsx`

- [ ] **Step 1: Create the KPI section**

Create `apps/app/src/app/users/components/users-kpi-section.tsx`:

```tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Users, UserCheck, Crown, Shield, UserPlus, UserX } from "lucide-react";
import type { UsersKpis, UsersSparklines } from "@brighttale/shared/types/users";

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="ml-auto">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  sparkline?: number[];
  sparkColor?: string;
}

function KpiCard({ icon, label, value, sparkline, sparkColor }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-muted p-2">{icon}</div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold">{value.toLocaleString("pt-BR")}</p>
            </div>
          </div>
          {sparkline && sparkColor && (
            <MiniSparkline data={sparkline} color={sparkColor} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface UsersKpiSectionProps {
  kpis: UsersKpis;
  sparklines: UsersSparklines;
}

export function UsersKpiSection({ kpis, sparklines }: UsersKpiSectionProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <KpiCard
        icon={<Users className="h-4 w-4 text-blue-500" />}
        label="Total Usuarios"
        value={kpis.totalUsers}
        sparkline={sparklines.total}
        sparkColor="#3b82f6"
      />
      <KpiCard
        icon={<UserCheck className="h-4 w-4 text-green-500" />}
        label="Ativos"
        value={kpis.activeUsers}
      />
      <KpiCard
        icon={<Crown className="h-4 w-4 text-amber-500" />}
        label="Premium"
        value={kpis.premiumCount}
        sparkline={sparklines.premium}
        sparkColor="#f59e0b"
      />
      <KpiCard
        icon={<Shield className="h-4 w-4 text-purple-500" />}
        label="Admin"
        value={kpis.adminCount}
      />
      <KpiCard
        icon={<UserPlus className="h-4 w-4 text-cyan-500" />}
        label="Novos (mes)"
        value={kpis.newThisMonth}
        sparkline={sparklines.signups}
        sparkColor="#06b6d4"
      />
      <KpiCard
        icon={<UserX className="h-4 w-4 text-red-500" />}
        label="Inativos"
        value={kpis.inactiveUsers}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/users/components/users-kpi-section.tsx
git commit -m "feat(app): add users KPI section with sparklines"
```

---

## Task 10: Frontend — Filters Component

**Files:**
- Create: `apps/app/src/app/users/components/users-filters.tsx`

- [ ] **Step 1: Create the filters component**

Create `apps/app/src/app/users/components/users-filters.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

interface UsersFiltersProps {
  totalResults: number;
}

export function UsersFilters({ totalResults }: UsersFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  const pushParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== "all") {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      params.delete("page");
      router.push(`/users?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      const current = searchParams.get("search") ?? "";
      if (search !== current) {
        pushParams({ search });
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, searchParams, pushParams]);

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="relative flex-1 w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select
        value={searchParams.get("premium") ?? "all"}
        onValueChange={(v) => pushParams({ premium: v })}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Premium" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="true">Premium</SelectItem>
          <SelectItem value="false">Free</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("active") ?? "all"}
        onValueChange={(v) => pushParams({ active: v })}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="true">Ativo</SelectItem>
          <SelectItem value="false">Inativo</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("role") ?? "all"}
        onValueChange={(v) => pushParams({ role: v })}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>

      <span className="text-sm text-muted-foreground whitespace-nowrap">
        {totalResults} resultado{totalResults !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/users/components/users-filters.tsx
git commit -m "feat(app): add users filters with debounced search"
```

---

## Task 11: Frontend — Pagination Component

**Files:**
- Create: `apps/app/src/app/users/components/users-pagination.tsx`

- [ ] **Step 1: Create the pagination component**

Create `apps/app/src/app/users/components/users-pagination.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface UsersPaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
}

export function UsersPagination({ page, totalPages, totalItems, pageSize }: UsersPaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(p));
    }
    router.push(`/users?${params.toString()}`, { scroll: false });
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  // Build visible page numbers with ellipsis
  const pages: (number | "...")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Mostrando {start}-{end} de {totalItems}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page <= 1}
          onClick={() => goToPage(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground">
              ...
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="icon"
              className="h-8 w-8"
              onClick={() => goToPage(p)}
            >
              {p}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page >= totalPages}
          onClick={() => goToPage(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/users/components/users-pagination.tsx
git commit -m "feat(app): add users pagination component"
```

---

## Task 12: Frontend — Modals (Edit, Role, Delete)

**Files:**
- Create: `apps/app/src/app/users/components/user-edit-modal.tsx`
- Create: `apps/app/src/app/users/components/user-role-modal.tsx`
- Create: `apps/app/src/app/users/components/user-delete-dialog.tsx`

- [ ] **Step 1: Create the edit modal**

Create `apps/app/src/app/users/components/user-edit-modal.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateUser } from "@/lib/api/users";
import type { UserListItem } from "@brighttale/shared/types/users";

interface UserEditModalProps {
  user: UserListItem | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function UserEditModal({ user, open, onClose, onSaved }: UserEditModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isPremium, setIsPremium] = useState(false);
  const [premiumPlan, setPremiumPlan] = useState<"monthly" | "yearly">("monthly");
  const [premiumExpiresAt, setPremiumExpiresAt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setIsPremium(user.isPremium);
      setPremiumPlan((user.premiumPlan as "monthly" | "yearly") ?? "monthly");
      setPremiumExpiresAt(
        user.premiumExpiresAt ? user.premiumExpiresAt.slice(0, 10) : "",
      );
      setIsActive(user.isActive);
      setError("");
    }
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      // Append T23:59:59 to date-only string to avoid timezone off-by-one
      const expiresIso = isPremium && premiumExpiresAt
        ? new Date(`${premiumExpiresAt}T23:59:59`).toISOString()
        : undefined;

      await updateUser(user.id, {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        isPremium,
        ...(isPremium
          ? { premiumPlan, premiumExpiresAt: expiresIso }
          : {}),
        isActive,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Usuario</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nome</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Sobrenome</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="isActive">Ativo</Label>
            <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="isPremium">Premium</Label>
            <Switch id="isPremium" checked={isPremium} onCheckedChange={setIsPremium} />
          </div>

          {isPremium && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select
                  value={premiumPlan}
                  onValueChange={(v) => setPremiumPlan(v as "monthly" | "yearly")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Expira em</Label>
                <Input
                  type="date"
                  value={premiumExpiresAt}
                  onChange={(e) => setPremiumExpiresAt(e.target.value)}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create the role change modal**

Create `apps/app/src/app/users/components/user-role-modal.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { updateUserRole } from "@/lib/api/users";

interface UserRoleModalProps {
  userId: string | null;
  userName: string;
  currentRole: "admin" | "user";
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function UserRoleModal({
  userId,
  userName,
  currentRole,
  open,
  onClose,
  onSaved,
}: UserRoleModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const newRole = currentRole === "admin" ? "user" : "admin";

  async function handleConfirm() {
    if (!userId) return;
    setSaving(true);
    setError("");
    try {
      await updateUserRole(userId, newRole);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || "Erro ao alterar role");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Alterar Role</AlertDialogTitle>
          <AlertDialogDescription>
            {newRole === "admin"
              ? `Promover ${userName} a Admin?`
              : `Remover admin de ${userName}?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={saving}>
            {saving ? "Salvando..." : "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 3: Create the delete dialog**

Create `apps/app/src/app/users/components/user-delete-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { deleteUser } from "@/lib/api/users";

interface UserDeleteDialogProps {
  userId: string | null;
  userName: string;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function UserDeleteDialog({
  userId,
  userName,
  open,
  onClose,
  onDeleted,
}: UserDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (!userId) return;
    setDeleting(true);
    setError("");
    try {
      await deleteUser(userId);
      onDeleted();
      onClose();
    } catch (e: any) {
      setError(e.message || "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Usuario</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acao e irreversivel. Todos os dados de {userName} serao excluidos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? "Excluindo..." : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/app/users/components/user-edit-modal.tsx apps/app/src/app/users/components/user-role-modal.tsx apps/app/src/app/users/components/user-delete-dialog.tsx
git commit -m "feat(app): add user edit, role, and delete modals"
```

---

## Task 13: Frontend — Users Table Component

**Files:**
- Create: `apps/app/src/app/users/components/users-table.tsx`

- [ ] **Step 1: Create the table component**

Create `apps/app/src/app/users/components/users-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MoreHorizontal,
  Pencil,
  Shield,
  UserX,
  UserCheck,
  Trash2,
  Eye,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { UserEditModal } from "./user-edit-modal";
import { UserRoleModal } from "./user-role-modal";
import { UserDeleteDialog } from "./user-delete-dialog";
import type { UserListItem } from "@brighttale/shared/types/users";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${"*".repeat(Math.min(4, local.length - 2))}${local[local.length - 1]}@${domain}`;
}

function getInitials(firstName: string | null, lastName: string | null): string {
  const f = firstName?.charAt(0)?.toUpperCase() ?? "";
  const l = lastName?.charAt(0)?.toUpperCase() ?? "";
  return f + l || "?";
}

function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-amber-500",
    "bg-purple-500",
    "bg-cyan-500",
    "bg-rose-500",
    "bg-indigo-500",
    "bg-teal-500",
  ];
  return colors[Math.abs(hash) % colors.length];
}

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays < 30) return `${diffDays} dias`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} mes${diffMonths > 1 ? "es" : ""}`;
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} ano${diffYears > 1 ? "s" : ""}`;
}

interface UsersTableProps {
  users: UserListItem[];
  sort: string;
  sortDir: string;
  onRefresh: () => void;
}

export function UsersTable({ users, sort, sortDir, onRefresh }: UsersTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [revealedEmails, setRevealedEmails] = useState<Set<string>>(new Set());
  const [editUser, setEditUser] = useState<UserListItem | null>(null);
  const [roleUser, setRoleUser] = useState<UserListItem | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserListItem | null>(null);

  function handleSort(column: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (sort === column) {
      params.set("sortDir", sortDir === "asc" ? "desc" : "asc");
    } else {
      params.set("sort", column);
      params.set("sortDir", "asc");
    }
    params.delete("page");
    router.push(`/users?${params.toString()}`, { scroll: false });
  }

  function SortIcon({ column }: { column: string }) {
    if (sort !== column) return null;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 inline ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 inline ml-1" />
    );
  }

  function userName(u: UserListItem): string {
    return [u.firstName, u.lastName].filter(Boolean).join(" ") || "Sem nome";
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("first_name")}
              >
                Usuario
                <SortIcon column="first_name" />
              </TableHead>
              <TableHead>Role</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("is_premium")}
              >
                Plano
                <SortIcon column="is_premium" />
              </TableHead>
              <TableHead>Expira em</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("created_at")}
              >
                Cadastro
                <SortIcon column="created_at" />
              </TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum usuario encontrado
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  {/* Usuario */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        {u.avatarUrl && <AvatarImage src={u.avatarUrl} />}
                        <AvatarFallback className={`${hashColor(u.id)} text-white text-xs`}>
                          {getInitials(u.firstName, u.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{userName(u)}</p>
                        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          {revealedEmails.has(u.id) ? u.email : maskEmail(u.email)}
                          {!revealedEmails.has(u.id) && (
                            <button
                              onClick={() =>
                                setRevealedEmails((s) => new Set(s).add(u.id))
                              }
                              className="hover:text-foreground transition-colors"
                            >
                              <Eye className="h-3 w-3" />
                            </button>
                          )}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  {/* Role */}
                  <TableCell>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role === "admin" ? "Admin" : "User"}
                    </Badge>
                  </TableCell>

                  {/* Plano */}
                  <TableCell>
                    {u.isPremium ? (
                      u.isPremiumEffective ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-200">
                          Premium {u.premiumPlan}
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Expirado</Badge>
                      )
                    ) : (
                      <Badge variant="outline">Free</Badge>
                    )}
                  </TableCell>

                  {/* Expira em */}
                  <TableCell>
                    {u.premiumExpiresAt ? (
                      <span
                        className={
                          !u.isPremiumEffective
                            ? "text-destructive"
                            : new Date(u.premiumExpiresAt).getTime() - Date.now() <
                                30 * 86400000
                              ? "text-amber-500"
                              : ""
                        }
                      >
                        {new Date(u.premiumExpiresAt).toLocaleDateString("pt-BR")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Cadastro */}
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="text-sm">
                          {formatRelativeDate(u.createdAt)}
                        </TooltipTrigger>
                        <TooltipContent>
                          {new Date(u.createdAt).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          })}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>

                  {/* Acoes */}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditUser(u)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setRoleUser(u)}>
                          <Shield className="h-4 w-4 mr-2" />
                          {u.role === "admin" ? "Remover Admin" : "Promover Admin"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              const { updateUser } = await import("@/lib/api/users");
                              await updateUser(u.id, { isActive: !u.isActive });
                              onRefresh();
                            } catch {}
                          }}
                        >
                          {u.isActive ? (
                            <>
                              <UserX className="h-4 w-4 mr-2" />
                              Desativar
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-4 w-4 mr-2" />
                              Ativar
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteUser(u)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modals */}
      <UserEditModal
        user={editUser}
        open={!!editUser}
        onClose={() => setEditUser(null)}
        onSaved={onRefresh}
      />
      <UserRoleModal
        userId={roleUser?.id ?? null}
        userName={roleUser ? [roleUser.firstName, roleUser.lastName].filter(Boolean).join(" ") || "usuario" : ""}
        currentRole={roleUser?.role ?? "user"}
        open={!!roleUser}
        onClose={() => setRoleUser(null)}
        onSaved={onRefresh}
      />
      <UserDeleteDialog
        userId={deleteUser?.id ?? null}
        userName={deleteUser ? [deleteUser.firstName, deleteUser.lastName].filter(Boolean).join(" ") || "usuario" : ""}
        open={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        onDeleted={onRefresh}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/users/components/users-table.tsx
git commit -m "feat(app): add users table with sort, actions, and modals"
```

---

## Task 14: Frontend — Main Users Page

**Files:**
- Create: `apps/app/src/app/users/page.tsx`

- [ ] **Step 1: Create the main page**

Create `apps/app/src/app/users/page.tsx`:

```tsx
"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCcw, Users } from "lucide-react";
import { fetchUsersList } from "@/lib/api/users";
import { UsersKpiSection } from "./components/users-kpi-section";
import { UsersFilters } from "./components/users-filters";
import { UsersTable } from "./components/users-table";
import { UsersPagination } from "./components/users-pagination";
import type {
  UserListItem,
  UsersKpis,
  UsersSparklines,
  UsersGrowthPoint,
  UsersPagination as UsersPaginationType,
} from "@brighttale/shared/types/users";

const EMPTY_KPIS: UsersKpis = {
  totalUsers: 0,
  activeUsers: 0,
  inactiveUsers: 0,
  premiumCount: 0,
  adminCount: 0,
  freeCount: 0,
  newToday: 0,
  newThisWeek: 0,
  newThisMonth: 0,
};

const EMPTY_SPARKLINES: UsersSparklines = { total: [], premium: [], signups: [] };

const EMPTY_PAGINATION: UsersPaginationType = {
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 0,
};

function UsersPageContent() {
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [kpis, setKpis] = useState<UsersKpis>(EMPTY_KPIS);
  const [sparklines, setSparklines] = useState<UsersSparklines>(EMPTY_SPARKLINES);
  const [pagination, setPagination] = useState<UsersPaginationType>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsersList({
        page: Number(searchParams.get("page")) || 1,
        search: searchParams.get("search") ?? undefined,
        premium: searchParams.get("premium") ?? undefined,
        active: searchParams.get("active") ?? undefined,
        role: searchParams.get("role") ?? undefined,
        sort: searchParams.get("sort") ?? undefined,
        sortDir: searchParams.get("sortDir") ?? undefined,
      });
      setUsers(data.data);
      setKpis(data.kpis);
      setSparklines(data.sparklines);
      setPagination(data.pagination);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar usuarios");
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sort = searchParams.get("sort") ?? "created_at";
  const sortDir = searchParams.get("sortDir") ?? "desc";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold">Usuarios</h1>
            <p className="text-sm text-muted-foreground">
              Gerenciar usuarios, roles e premium
            </p>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button variant="outline" size="sm" onClick={fetchData}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      ) : (
        !error && (
          <>
            <UsersKpiSection kpis={kpis} sparklines={sparklines} />
            <UsersFilters totalResults={pagination.totalItems} />
            <UsersTable
              users={users}
              sort={sort}
              sortDir={sortDir}
              onRefresh={fetchData}
            />
            <UsersPagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              pageSize={pagination.pageSize}
            />
          </>
        )
      )}
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense>
      <UsersPageContent />
    </Suspense>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/users/page.tsx
git commit -m "feat(app): add users page with KPIs, filters, table, pagination"
```

---

## Task 15: Sidebar — Add Users Link

**Files:**
- Modify: `apps/app/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add Users import and link**

In `apps/app/src/components/layout/Sidebar.tsx`:

Add `Users` to the lucide-react import (line 6):

```typescript
import {
    Home,
    Layers,
    FileText,
    Database,
    Settings,
    Archive,
    Lightbulb,
    PenLine,
    Video,
    Zap,
    Mic,
    Images,
    Wand2,
    Users,
} from "lucide-react";
```

Add the Users nav link after the Assets link (after line 91, before the Settings separator):

```tsx
                <Link className={navClass("/users")} href="/users">
                    <Users className="h-4 w-4 shrink-0" />
                    <span>Users</span>
                </Link>
```

- [ ] **Step 2: Verify typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/layout/Sidebar.tsx
git commit -m "feat(app): add Users link to sidebar navigation"
```

---

## Task 16: Add /api/users Rewrite to Next.js Config

**Files:**
- Modify: `apps/app/next.config.ts` (or verify existing wildcard rewrite covers `/api/users`)

- [ ] **Step 1: Verify existing rewrite config**

Read `apps/app/next.config.ts` and check if there's a wildcard rewrite like `/api/:path*` → API server. If yes, no change needed. If rewrites are explicit per-route, add `/api/users/:path*`.

- [ ] **Step 2: Add rewrite if needed**

If the existing config uses a wildcard like:
```typescript
{ source: '/api/:path*', destination: 'http://localhost:3001/:path*' }
```
Then no change is needed — `/api/users` is already covered.

If rewrites are per-route, add:
```typescript
{ source: '/api/users/:path*', destination: 'http://localhost:3001/users/:path*' }
```

- [ ] **Step 3: Commit if changed**

```bash
git add apps/app/next.config.ts
git commit -m "feat(app): add users API rewrite"
```

---

## Task 17: End-to-End Smoke Test

- [ ] **Step 1: Start dev servers**

Run: `npm run dev`
Expected: Both app (3000) and api (3001) start without errors.

- [ ] **Step 2: Test API endpoint**

Run: `curl -s -H "X-Internal-Key: $(grep INTERNAL_API_KEY apps/api/.env.local | cut -d= -f2)" http://localhost:3001/users | head -c 500`
Expected: JSON response with `{ data: { data: [...], kpis: {...}, ... }, error: null }`.

- [ ] **Step 3: Test the UI**

Open `http://localhost:3000/users` in browser. Verify:
- KPI cards render with numbers
- Table shows users (or empty state)
- Filters work (search, dropdowns)
- Sort headers work (click column, see arrow)
- Pagination works (if enough users)
- Edit modal opens and saves
- Role modal opens and confirms
- Delete dialog opens and deletes
- Sidebar shows "Users" link as active

- [ ] **Step 4: Run full test suite**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: All pass with no new errors.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address smoke test issues for users page"
```
