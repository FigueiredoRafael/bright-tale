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
        .update(update as any)
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
