/**
 * @deprecated since Phase 2A.5 (2026-04-17). To be removed in Phase 2D cutover.
 * Use new package routes from @tn-figueiredo/affiliate at /api/affiliate/*,
 * /api/admin/affiliate/*, /api/internal/affiliate/*, /api/ref/* instead.
 *
 * This file backs the legacy /api/affiliate-legacy/* namespace, which exists
 * solely to keep apps/app/(app)/settings/affiliate/page.tsx working until 2B
 * rewrites it against the new schema. Do NOT add new routes here.
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import crypto from 'crypto';

const ELIGIBLE_PLANS = ['starter', 'creator', 'pro'];

async function getOrgContext(userId: string) {
  const sb = createServiceClient();
  const { data: membership } = await sb
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!membership) throw new ApiError(404, 'No organization found', 'NOT_FOUND');

  const { data: org } = await sb
    .from('organizations')
    .select('plan')
    .eq('id', membership.org_id)
    .single();

  return { orgId: membership.org_id, plan: org?.plan ?? 'free' };
}

function generateCode(): string {
  return 'BT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

export async function affiliateLegacyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/program', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const { plan } = await getOrgContext(request.userId);

      if (!ELIGIBLE_PLANS.includes(plan)) {
        return reply.send({
          data: { eligible: false, plan, program: null },
          error: null,
        });
      }

      const sb = createServiceClient();
      const { data: program } = await sb
        .from('affiliate_programs')
        .select('*')
        .eq('user_id', request.userId)
        .limit(1)
        .single();

      return reply.send({
        data: { eligible: true, plan, program: program ?? null },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/program', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const { plan } = await getOrgContext(request.userId);

      if (!ELIGIBLE_PLANS.includes(plan)) {
        throw new ApiError(403, 'Affiliate program requires Starter plan or above', 'PLAN_REQUIRED');
      }

      const sb = createServiceClient();

      const { data: existing } = await sb
        .from('affiliate_programs')
        .select('id')
        .eq('user_id', request.userId)
        .limit(1)
        .single();

      if (existing) {
        throw new ApiError(409, 'You already have an affiliate program', 'ALREADY_EXISTS');
      }

      const { data: program, error } = await sb
        .from('affiliate_programs')
        .insert({
          user_id: request.userId,
          code: generateCode(),
          commission_pct: 20,
        })
        .select()
        .single();

      if (error) throw error;

      return reply.status(201).send({ data: { program }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get('/referrals', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');

      const sb = createServiceClient();

      const { data: program } = await sb
        .from('affiliate_programs')
        .select('id')
        .eq('user_id', request.userId)
        .limit(1)
        .single();

      if (!program) {
        return reply.send({ data: { referrals: [] }, error: null });
      }

      const { data: referrals, error } = await sb
        .from('affiliate_referrals_legacy' as never)
        .select('*')
        .eq('affiliate_program_id', program.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return reply.send({ data: { referrals: referrals ?? [] }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
