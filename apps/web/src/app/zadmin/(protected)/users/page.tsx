import { createAdminClient } from '@/lib/supabase/admin';
import { KpiCard, KpiSection } from '@tn-figueiredo/admin/client';
import { Users, UserCheck, UserX, Crown, ShieldCheck, UserPlus } from 'lucide-react';
import { usersQuerySchema } from '@brighttale/shared/schemas/users';
import { userRowToListItem } from '@brighttale/shared/mappers/users';
import type { UserProfileRow } from '@brighttale/shared/mappers/users';
import type { UsersKpis } from '@brighttale/shared/types/users';
import { UsersFilters } from './components/users-filters';
import { UsersTable } from './components/users-table';
import { UsersPagination } from './components/users-pagination';

export const dynamic = 'force-dynamic';

async function fetchUsersPageData(rawParams: Record<string, string | string[] | undefined>) {
  const db = createAdminClient();

  // Normalise searchParams for Zod (all strings)
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    if (typeof v === 'string') flat[k] = v;
    else if (Array.isArray(v) && v.length > 0) flat[k] = v[0];
  }

  const query = usersQuerySchema.parse(flat);
  const { page, limit, search, premium, active, role, sort, sortDir } = query;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch KPIs, sparklines, growth, and admin IDs in parallel
  const [kpisRes, adminIdsRes] = await Promise.all([
    db.rpc('users_page_kpis'),
    db.from('user_roles').select('user_id').eq('role', 'admin'),
  ]);

  // RPC returns snake_case, our types use camelCase
  const rawKpis = (kpisRes.data ?? {}) as Record<string, number>;
  const kpis: UsersKpis = {
    totalUsers: rawKpis.total_users ?? 0,
    activeUsers: rawKpis.active_users ?? 0,
    inactiveUsers: rawKpis.inactive_users ?? 0,
    premiumCount: rawKpis.premium_count ?? 0,
    adminCount: rawKpis.admin_count ?? 0,
    freeCount: rawKpis.free_count ?? 0,
    newToday: rawKpis.new_today ?? 0,
    newThisWeek: rawKpis.new_this_week ?? 0,
    newThisMonth: rawKpis.new_this_month ?? 0,
  };
  const adminIds = new Set<string>(
    ((adminIdsRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id),
  );

  // Build filters
  let countQuery = db.from('user_profiles').select('*', { count: 'exact', head: true });
  let dataQuery = db.from('user_profiles').select('*');

  if (search) {
    const searchFilter = `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`;
    countQuery = countQuery.or(searchFilter);
    dataQuery = dataQuery.or(searchFilter);
  }

  if (premium !== 'all') {
    const isPremium = premium === 'true';
    countQuery = countQuery.eq('is_premium', isPremium);
    dataQuery = dataQuery.eq('is_premium', isPremium);
  }

  if (active !== 'all') {
    const isActive = active === 'true';
    countQuery = countQuery.eq('is_active', isActive);
    dataQuery = dataQuery.eq('is_active', isActive);
  }

  if (role === 'admin') {
    const ids = Array.from(adminIds);
    if (ids.length === 0) {
      return {
        users: [],
        kpis,
        pagination: { page, pageSize: limit, totalItems: 0, totalPages: 0 },
      };
    }
    countQuery = countQuery.in('id', ids);
    dataQuery = dataQuery.in('id', ids);
  }

  const [{ count: total }, { data: rows }] = await Promise.all([
    countQuery,
    dataQuery
      .order(sort, { ascending: sortDir === 'asc' })
      .range((page - 1) * limit, page * limit - 1),
  ]);

  const users = (rows ?? []).map((row) =>
    userRowToListItem(row as UserProfileRow, adminIds.has(row.id) ? 'admin' : 'user'),
  );

  return {
    users,
    kpis,
    pagination: {
      page,
      pageSize: limit,
      totalItems: total ?? 0,
      totalPages: Math.ceil((total ?? 0) / limit),
    },
  };
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { users, kpis, pagination } = await fetchUsersPageData(params);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div className="flex justify-between items-start animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-v-primary tracking-tight">
            Usuários
          </h1>
          <p className="text-sm text-slate-500 dark:text-v-secondary mt-1">
            Gestão de contas e permissões
          </p>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="animate-fade-in-up-1">
        <KpiSection title="Visão Geral" color="blue">
          <KpiCard
            label="Total"
            value={kpis.totalUsers ?? 0}
            icon={<Users className="w-4 h-4" />}
            subText={`${kpis.newThisWeek ?? 0} esta semana`}
            change={kpis.newThisWeek > 0 ? kpis.newThisWeek : undefined}
            changeLabel="sem"
          />
          <KpiCard
            label="Ativos"
            value={kpis.activeUsers ?? 0}
            icon={<UserCheck className="w-4 h-4" />}
            subText={`${kpis.inactiveUsers ?? 0} inativos`}
          />
          <KpiCard
            label="Premium"
            value={kpis.premiumCount ?? 0}
            icon={<Crown className="w-4 h-4" />}
            subText={`${kpis.freeCount ?? 0} gratuitos`}
          />
          <KpiCard
            label="Admins"
            value={kpis.adminCount ?? 0}
            icon={<ShieldCheck className="w-4 h-4" />}
          />
          <KpiCard
            label="Novos hoje"
            value={kpis.newToday ?? 0}
            icon={<UserPlus className="w-4 h-4" />}
            subText={`${kpis.newThisMonth ?? 0} este mês`}
          />
        </KpiSection>
      </div>

      {/* ── Table card ── */}
      <div className="animate-fade-in-up-2 bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl shadow-sm">
        {/* Filters */}
        <div className="p-4 border-b border-slate-100 dark:border-dash-border">
          <UsersFilters />
        </div>

        {/* Table */}
        <UsersTable users={users} />

        {/* Pagination */}
        <div className="px-4 pb-4">
          <UsersPagination page={pagination.page} totalPages={pagination.totalPages} />
        </div>
      </div>

      {/* Total count */}
      <p className="text-xs text-slate-400 dark:text-v-dim -mt-2 px-1">
        {pagination.totalItems} usuário{pagination.totalItems !== 1 ? 's' : ''} encontrado
        {pagination.totalItems !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
