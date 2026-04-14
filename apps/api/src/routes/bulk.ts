/**
 * F2-013 — Bulk generation.
 *
 * Fans out N inngest events from a single user action, respecting the org's
 * credit balance. Returns the list of created session/draft ids so the UI can
 * poll each one (ou agrupar em uma visão única).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { checkCredits } from '../lib/credits.js';
import { inngest } from '../jobs/client.js';
import { emitJobEvent } from '../jobs/emitter.js';

const FORMAT_COSTS: Record<string, number> = { blog: 200, video: 200, shorts: 100, podcast: 150 };
const CANONICAL_CORE_COST = 80;

const bulkDraftSchema = z.object({
  channelId: z.string().uuid(),
  researchSessionId: z.string().uuid(),
  type: z.enum(['blog', 'video', 'shorts', 'podcast']),
  provider: z.enum(['gemini', 'openai', 'anthropic', 'ollama']).optional(),
  model: z.string().optional(),
  modelTier: z.string().default('standard'),
  productionParams: z.record(z.unknown()).optional(),
  /** Generate the same format N times (diferentes takes) OR pass a list of
   *  distinct title hints. */
  titles: z.array(z.string().min(1)).min(1).max(20),
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

export async function bulkRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /drafts — crie N drafts de uma vez (mesmo canal, mesma pesquisa,
   * mesmo formato) e enfileire a pipeline pra cada um.
   */
  fastify.post('/drafts', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const body = bulkDraftSchema.parse(request.body);
      const orgId = await getOrgId(request.userId);
      const sb = createServiceClient();

      // Pre-flight cost check (skip se ollama).
      const perDraft = body.provider === 'ollama'
        ? 0
        : (FORMAT_COSTS[body.type] ?? 200) + CANONICAL_CORE_COST;
      const totalCost = perDraft * body.titles.length;
      if (totalCost > 0) await checkCredits(orgId, request.userId, totalCost);

      // Criar drafts + disparar jobs em paralelo.
      const created: Array<{ id: string; title: string }> = [];
      for (const title of body.titles) {
        const { data, error } = await (sb.from('content_drafts') as unknown as {
          insert: (row: Record<string, unknown>) => {
            select: () => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
          };
        })
          .insert({
            org_id: orgId,
            user_id: request.userId,
            channel_id: body.channelId,
            research_session_id: body.researchSessionId,
            type: body.type,
            title,
            status: 'draft',
            production_params: body.productionParams ?? null,
          })
          .select()
          .single();
        if (error || !data) throw error ?? new ApiError(500, 'Failed to create draft', 'DB_ERROR');

        created.push({ id: data.id, title });
        await emitJobEvent(data.id, 'production', 'queued', 'Iniciando (bulk)…');
        await inngest.send({
          name: 'production/generate',
          data: {
            draftId: data.id,
            orgId,
            userId: request.userId,
            type: body.type,
            modelTier: body.modelTier,
            provider: body.provider,
            model: body.model,
            productionParams: body.productionParams ?? null,
          },
        });
      }

      return reply.status(202).send({
        data: {
          drafts: created,
          totalCostReserved: totalCost,
          message: `${created.length} drafts enfileirados`,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
