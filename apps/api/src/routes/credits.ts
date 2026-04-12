/**
 * Credits Fastify Route Plugin
 * F1-009: Credit balance and usage endpoints
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { getBalance } from '../lib/credits.js';

/** Helper: get user's org_id */
async function getOrgId(userId: string): Promise<string> {
  const sb = createServiceClient();
  const { data } = await sb
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!data) throw new ApiError(404, 'No organization found', 'NOT_FOUND');
  return data.org_id;
}

export async function creditsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /balance — Current org credit balance
   */
  fastify.get('/balance', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const orgId = await getOrgId(request.userId);
      const balance = await getBalance(orgId);

      return reply.send({ data: balance, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /usage — Credit usage history
   */
  fastify.get('/usage', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');
      const sb = createServiceClient();
      const orgId = await getOrgId(request.userId);

      const url = new URL(request.url, 'http://localhost');
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
      const page = Math.max(parseInt(url.searchParams.get('page') ?? '1', 10), 1);
      const offset = (page - 1) * limit;

      const { data: usage, error, count } = await sb
        .from('credit_usage')
        .select('*', { count: 'exact' })
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return reply.send({
        data: { items: usage, total: count, page, limit },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /usage/by-member — Usage aggregated by member (admin+)
   */
  fastify.get('/usage/by-member', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');
      const sb = createServiceClient();
      const orgId = await getOrgId(request.userId);

      // Get all members with their cycle usage
      const { data: members, error } = await sb
        .from('org_memberships')
        .select('user_id, credits_used_cycle, user_profiles(first_name, last_name, email)')
        .eq('org_id', orgId)
        .order('credits_used_cycle', { ascending: false });

      if (error) throw error;

      return reply.send({ data: { members }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /usage/by-category — Usage aggregated by category
   */
  fastify.get('/usage/by-category', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');
      const sb = createServiceClient();
      const orgId = await getOrgId(request.userId);

      const { data: usage, error } = await sb
        .from('credit_usage')
        .select('category, cost')
        .eq('org_id', orgId);

      if (error) throw error;

      // Aggregate by category
      const byCategory: Record<string, number> = {};
      for (const row of usage ?? []) {
        byCategory[row.category] = (byCategory[row.category] ?? 0) + row.cost;
      }

      return reply.send({ data: { categories: byCategory }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
