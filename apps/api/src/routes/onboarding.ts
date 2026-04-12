/**
 * Onboarding Fastify Route Plugin
 * F2-004: Track onboarding state
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';

export async function onboardingRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /status — Get onboarding state for current user
   */
  fastify.get('/status', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const { data: profile } = await sb
        .from('user_profiles')
        .select('onboarding_completed, onboarding_step')
        .eq('id', request.userId)
        .single();

      return reply.send({
        data: {
          completed: profile?.onboarding_completed ?? false,
          step: profile?.onboarding_step ?? null,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /complete — Mark onboarding as completed
   */
  fastify.post('/complete', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      await sb
        .from('user_profiles')
        .update({ onboarding_completed: true, onboarding_step: 'done' })
        .eq('id', request.userId);

      return reply.send({ data: { completed: true }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
