import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';

export async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { channelId: string }; Querystring: { unread?: string; limit?: string } }>(
    '/:channelId/notifications',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');

        const { channelId } = request.params;
        const limit = Math.min(parseInt(request.query.limit ?? '20', 10), 50);
        const unreadOnly = request.query.unread === 'true';

        let query = sb
          .from('reference_notifications')
          .select('*')
          .eq('channel_id', channelId)
          .is('dismissed_at', null)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (unreadOnly) {
          query = query.is('read_at', null);
        }

        const { data, error } = await query;
        if (error) throw error;

        return reply.send({ data: { notifications: data ?? [] }, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.patch<{ Params: { channelId: string; notifId: string } }>(
    '/:channelId/notifications/:notifId/read',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');

        const { error } = await sb
          .from('reference_notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', request.params.notifId)
          .eq('channel_id', request.params.channelId);

        if (error) throw error;

        return reply.send({ data: { success: true }, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.patch<{ Params: { channelId: string; notifId: string } }>(
    '/:channelId/notifications/:notifId/dismiss',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');

        const { error } = await sb
          .from('reference_notifications')
          .update({ dismissed_at: new Date().toISOString() })
          .eq('id', request.params.notifId)
          .eq('channel_id', request.params.channelId);

        if (error) throw error;

        return reply.send({ data: { success: true }, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
