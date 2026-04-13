/**
 * Content generation Fastify Route Plugin
 * F2-010/011: Simplified flow trigger
 * F2-013: Bulk generation
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { inngest } from '../jobs/client.js';

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

export async function contentRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /generate — Trigger content generation pipeline
   */
  fastify.post('/generate', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const { channelId, topic, formats, modelTier } = request.body as {
        channelId: string;
        topic: string;
        formats: string[];
        modelTier?: string;
      };

      if (!channelId || !topic || !formats?.length) {
        throw new ApiError(400, 'channelId, topic, and formats are required', 'VALIDATION_ERROR');
      }

      const orgId = await getOrgId(request.userId);

      // Send event to Inngest
      await inngest.send({
        name: 'content/generate',
        data: {
          orgId,
          userId: request.userId,
          channelId,
          topic,
          formats,
          modelTier,
        },
      });

      return reply.status(202).send({
        data: { status: 'queued', topic, formats },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /bulk-generate — Generate multiple pieces of content from one topic (F2-013)
   */
  fastify.post('/bulk-generate', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const { channelId, topic, formats, quantity, modelTier } = request.body as {
        channelId: string;
        topic: string;
        formats: string[];
        quantity: number;
        modelTier?: string;
      };

      if (!channelId || !topic || !formats?.length || !quantity) {
        throw new ApiError(400, 'channelId, topic, formats, and quantity are required', 'VALIDATION_ERROR');
      }

      const orgId = await getOrgId(request.userId);

      // Check plan limits
      const sb = createServiceClient();
      const { data: org } = await sb
        .from('organizations')
        .select('plan')
        .eq('id', orgId)
        .single();

      const PLAN_BULK_LIMITS: Record<string, number> = {
        free: 0,
        starter: 3,
        creator: 5,
        pro: 10,
      };

      const limit = PLAN_BULK_LIMITS[org?.plan ?? 'free'] ?? 0;
      if (quantity > limit) {
        throw new ApiError(403, `Your plan allows bulk generation of up to ${limit} items. Requested: ${quantity}`, 'PLAN_LIMIT');
      }

      // Queue N generation jobs
      const events = Array.from({ length: quantity }, (_, i) => ({
        name: 'content/generate' as const,
        data: {
          orgId,
          userId: request.userId!,
          channelId,
          topic: `${topic} (variation ${i + 1})`,
          formats,
          modelTier,
        },
      }));

      await inngest.send(events);

      return reply.status(202).send({
        data: { status: 'queued', topic, formats, quantity },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
