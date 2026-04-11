/**
 * Canonical Core Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import {
  createCanonicalCoreSchema,
  updateCanonicalCoreSchema,
} from '@brighttale/shared/schemas/canonicalCoreApi';

const listQuerySchema = z.object({
  idea_id: z.string().optional(),
  project_id: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export async function canonicalCoreRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET / — List canonical cores with optional filters
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const query = listQuerySchema.parse(Object.fromEntries(url.searchParams));
      const { idea_id, project_id, page, limit } = query;

      let countQuery = sb.from('canonical_core').select('*', { count: 'exact', head: true });
      let dataQuery = sb
        .from('canonical_core')
        .select(
          'id, idea_id, project_id, thesis, cta_subscribe, cta_comment_prompt, created_at, updated_at',
        );

      if (request.userId) {
        countQuery = countQuery.eq('user_id', request.userId);
        dataQuery = dataQuery.eq('user_id', request.userId);
      }

      if (idea_id) {
        countQuery = countQuery.eq('idea_id', idea_id);
        dataQuery = dataQuery.eq('idea_id', idea_id);
      }
      if (project_id) {
        countQuery = countQuery.eq('project_id', project_id);
        dataQuery = dataQuery.eq('project_id', project_id);
      }

      const [{ count: total, error: countErr }, { data: cores, error: dataErr }] =
        await Promise.all([
          countQuery,
          dataQuery
            .order('updated_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1),
        ]);

      if (countErr) throw countErr;
      if (dataErr) throw dataErr;

      return reply.send({
        data: {
          canonical_cores: cores,
          pagination: {
            page,
            limit,
            total: total ?? 0,
            total_pages: Math.ceil((total ?? 0) / limit),
          },
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST / — Create a new canonical core
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = createCanonicalCoreSchema.parse(request.body);

      const { data: core, error } = await sb
        .from('canonical_core')
        .insert({
          idea_id: data.idea_id,
          project_id: data.project_id,
          thesis: data.thesis,
          argument_chain_json: JSON.stringify(data.argument_chain),
          emotional_arc_json: JSON.stringify(data.emotional_arc),
          key_stats_json: JSON.stringify(data.key_stats),
          key_quotes_json: data.key_quotes ? JSON.stringify(data.key_quotes) : null,
          affiliate_moment_json: data.affiliate_moment
            ? JSON.stringify(data.affiliate_moment)
            : null,
          cta_subscribe: data.cta_subscribe,
          cta_comment_prompt: data.cta_comment_prompt,
          user_id: request.userId ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      return reply.status(201).send({ data: { canonical_core: core }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id — Fetch a canonical core by id
   */
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: core, error } = await sb
        .from('canonical_core')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!core) {
        throw new ApiError(404, 'Canonical core not found', 'NOT_FOUND');
      }

      return reply.send({ data: { canonical_core: core }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PUT /:id — Update a canonical core
   */
  fastify.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = updateCanonicalCoreSchema.parse(request.body);

      const { data: existing, error: findErr } = await sb
        .from('canonical_core')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Canonical core not found', 'NOT_FOUND');
      }

      const updateData: Record<string, unknown> = {};
      if (data.project_id !== undefined) updateData.project_id = data.project_id;
      if (data.thesis !== undefined) updateData.thesis = data.thesis;
      if (data.argument_chain !== undefined)
        updateData.argument_chain_json = JSON.stringify(data.argument_chain);
      if (data.emotional_arc !== undefined)
        updateData.emotional_arc_json = JSON.stringify(data.emotional_arc);
      if (data.key_stats !== undefined) updateData.key_stats_json = JSON.stringify(data.key_stats);
      if (data.key_quotes !== undefined)
        updateData.key_quotes_json = JSON.stringify(data.key_quotes);
      if (data.affiliate_moment !== undefined)
        updateData.affiliate_moment_json = JSON.stringify(data.affiliate_moment);
      if (data.cta_subscribe !== undefined) updateData.cta_subscribe = data.cta_subscribe;
      if (data.cta_comment_prompt !== undefined)
        updateData.cta_comment_prompt = data.cta_comment_prompt;

      const { data: updated, error } = await sb
        .from('canonical_core')
        .update(updateData as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return reply.send({ data: { canonical_core: updated }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /:id — Delete a canonical core
   */
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: existing, error: findErr } = await sb
        .from('canonical_core')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Canonical core not found', 'NOT_FOUND');
      }

      const { error } = await sb.from('canonical_core').delete().eq('id', id);
      if (error) throw error;

      return reply.send({ data: { deleted: true }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
