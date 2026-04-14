/**
 * F2-049 — Usage analytics for the current org.
 * Aggregates usage_events by month, provider, stage so the settings/usage
 * dashboard can show spend.
 */
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';

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

interface UsageRow {
  stage: string;
  sub_stage: string | null;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: string | number;
  created_at: string;
  channel_id: string | null;
}

export async function usageRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /summary — returns aggregates for the active org over a time window.
   *  ?days=30 (default) → last N days
   */
  fastify.get('/summary', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const orgId = await getOrgId(request.userId);
      const sb = createServiceClient();
      const days = Math.min(Number((request.query as { days?: string })?.days ?? 30), 365);
      const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await sb
        .from('usage_events')
        .select('stage, sub_stage, provider, model, input_tokens, output_tokens, cost_usd, created_at, channel_id')
        .eq('org_id', orgId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;

      const events = (data ?? []) as UsageRow[];

      // Totals
      let totalIn = 0, totalOut = 0, totalCost = 0;
      for (const e of events) {
        totalIn += e.input_tokens ?? 0;
        totalOut += e.output_tokens ?? 0;
        totalCost += Number(e.cost_usd) || 0;
      }

      // Group helpers
      const byKey = <T>(items: UsageRow[], key: (e: UsageRow) => string, init: () => T, fold: (acc: T, e: UsageRow) => T) => {
        const m = new Map<string, T>();
        for (const e of items) {
          const k = key(e);
          m.set(k, fold(m.get(k) ?? init(), e));
        }
        return Array.from(m.entries()).map(([name, value]) => ({ name, ...(value as Record<string, unknown>) }));
      };
      const tokenFold = (acc: { inputTokens: number; outputTokens: number; costUsd: number; calls: number }, e: UsageRow) => ({
        inputTokens: acc.inputTokens + (e.input_tokens ?? 0),
        outputTokens: acc.outputTokens + (e.output_tokens ?? 0),
        costUsd: acc.costUsd + (Number(e.cost_usd) || 0),
        calls: acc.calls + 1,
      });
      const init = () => ({ inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 });

      const byProvider = byKey(events, (e) => e.provider, init, tokenFold);
      const byStage = byKey(events, (e) => e.stage, init, tokenFold);
      const byModel = byKey(events, (e) => e.model, init, tokenFold);
      const byDay = byKey(events, (e) => e.created_at.slice(0, 10), init, tokenFold).sort((a, b) => a.name.localeCompare(b.name));

      return reply.send({
        data: {
          windowDays: days,
          totals: { inputTokens: totalIn, outputTokens: totalOut, costUsd: totalCost, calls: events.length },
          byProvider,
          byStage,
          byModel,
          byDay,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
