/**
 * Credits Fastify Route Plugin
 * F1-009: Credit balance and usage endpoints
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateWithUser } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { getBalance } from '../lib/credits.js';
import { assertProjectOwner } from '../lib/projects/ownership.js';

const byTrackQuerySchema = z.object({
  projectId: z.string().uuid('projectId must be a valid UUID'),
});

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
  fastify.get('/balance', { preHandler: [authenticateWithUser] }, async (request, reply) => {
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
  fastify.get('/usage', { preHandler: [authenticateWithUser] }, async (request, reply) => {
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
  fastify.get('/usage/by-member', { preHandler: [authenticateWithUser] }, async (request, reply) => {
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
  fastify.get('/usage/by-category', { preHandler: [authenticateWithUser] }, async (request, reply) => {
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

  /**
   * GET /usage/by-track?projectId=<uuid> — Usage aggregated by track for a project (T7.2).
   *
   * Returns all tracks for the project, each with their total credit spend.
   * Tracks with no spend are included with totalCost: 0.
   * Response: { data: { byTrack: Array<{ trackId, medium, totalCost }> }, error: null }
   */
  fastify.get('/usage/by-track', { preHandler: [authenticateWithUser] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const url = new URL(request.url, 'http://localhost');
      const parseResult = byTrackQuerySchema.safeParse({
        projectId: url.searchParams.get('projectId') ?? undefined,
      });

      if (!parseResult.success) {
        throw new ApiError(400, parseResult.error.issues.map((i) => i.message).join(', '), 'VALIDATION_ERROR');
      }

      const { projectId } = parseResult.data;
      const sb = createServiceClient();

      await assertProjectOwner(projectId, request.userId, sb);

      // Fetch all tracks for this project
      const { data: tracks, error: tracksError } = await sb
        .from('tracks')
        .select('id, medium')
        .eq('project_id', projectId);

      if (tracksError) throw tracksError;

      const trackList = tracks ?? [];
      if (trackList.length === 0) {
        return reply.send({ data: { byTrack: [] }, error: null });
      }

      const trackIds = trackList.map((t) => t.id);

      // Fetch all credit_usage rows attributed to these tracks
      const { data: usageRows, error: usageError } = await sb
        .from('credit_usage')
        .select('track_id, cost')
        .in('track_id', trackIds);

      if (usageError) throw usageError;

      // Aggregate cost per track_id
      const costByTrack: Record<string, number> = {};
      for (const row of usageRows ?? []) {
        if (row.track_id === null || row.track_id === undefined) continue;
        costByTrack[row.track_id] = (costByTrack[row.track_id] ?? 0) + row.cost;
      }

      const byTrack = trackList.map((t) => ({
        trackId: t.id,
        medium: t.medium as string,
        totalCost: costByTrack[t.id] ?? 0,
      }));

      return reply.send({ data: { byTrack }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
