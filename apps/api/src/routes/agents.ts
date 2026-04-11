/**
 * Agents Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '@/middleware/authenticate';
import { createServiceClient } from '@/lib/supabase';
import { sendError } from '@/lib/api/fastify-errors';

const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  instructions: z.string().optional(),
  input_schema: z.string().optional(),
  output_schema: z.string().optional(),
});

export async function agentsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET / — List all agent prompts ordered by stage
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();

      const { data: agents, error } = await sb
        .from('agent_prompts')
        .select('id, name, slug, stage, instructions, input_schema, output_schema, created_at, updated_at')
        .order('stage', { ascending: true });

      if (error) throw error;

      return reply.send({ data: { agents }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:slug — Get a single agent by slug
   */
  fastify.get('/:slug', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { slug } = request.params as { slug: string };

      const { data: agent, error } = await sb
        .from('agent_prompts')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (error) throw error;

      if (!agent) {
        return reply.status(404).send({
          data: { error: { message: 'Agent not found', code: 'AGENT_NOT_FOUND' } },
          error: null,
        });
      }

      return reply.send({ data: { agent }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PUT /:slug — Update an agent's prompts and schemas
   */
  fastify.put('/:slug', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { slug } = request.params as { slug: string };
      const data = updateAgentSchema.parse(request.body);

      // Check if agent exists
      const { data: existing, error: findErr } = await sb
        .from('agent_prompts')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        return reply.status(404).send({
          data: { error: { message: 'Agent not found', code: 'AGENT_NOT_FOUND' } },
          error: null,
        });
      }

      const { data: agent, error: updateErr } = await sb
        .from('agent_prompts')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('slug', slug)
        .select()
        .single();

      if (updateErr) throw updateErr;

      return reply.send({ data: { agent }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
