/**
 * F5-004 — Publishing destinations CRUD.
 *
 * CRUD basic pros destinos que o usuário configura (além do WordPress
 * legacy, que já tem sua própria tabela). Usado pelo UI de config.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';

const createSchema = z.object({
  kind: z.enum(['wordpress', 'youtube', 'custom_webhook']),
  label: z.string().min(1),
  config: z.record(z.unknown()),
});

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

export async function publishingDestinationsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const orgId = await getOrgId(request.userId);
      const sb = createServiceClient();
      const { data } = await sb
        .from('publishing_destinations')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      return reply.send({ data: { destinations: data ?? [] }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const body = createSchema.parse(request.body);
      const orgId = await getOrgId(request.userId);
      const sb = createServiceClient();
      const { data, error } = await (sb.from('publishing_destinations') as unknown as {
        insert: (row: Record<string, unknown>) => {
          select: () => { single: () => Promise<{ data: unknown; error: unknown }> };
        };
      })
        .insert({
          org_id: orgId,
          user_id: request.userId,
          kind: body.kind,
          label: body.label,
          config: body.config,
        })
        .select()
        .single();
      if (error) throw error;
      return reply.status(201).send({ data, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const { id } = request.params as { id: string };
      const sb = createServiceClient();
      const { error } = await sb.from('publishing_destinations').delete().eq('id', id);
      if (error) throw error;
      return reply.send({ data: { deleted: true }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
