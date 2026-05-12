/**
 * Inngest webhook route (F2-014)
 *
 * Serves the Inngest functions via Fastify.
 * In dev: Inngest Dev Server polls this endpoint.
 * In prod: Inngest Cloud sends events here.
 */

import type { FastifyInstance } from 'fastify';
import { serve } from 'inngest/fastify';
import { inngest } from '../jobs/client.js';
import { contentGenerate, brainstormGenerate, researchGenerate, productionGenerate, productionProduce, referenceCheck, affiliateExpireReferrals, pipelineAdvance, pipelineBrainstormDispatch } from '../jobs/index.js';

export async function inngestRoutes(fastify: FastifyInstance): Promise<void> {
  const handler = serve({
    client: inngest,
    functions: [contentGenerate, brainstormGenerate, researchGenerate, productionGenerate, productionProduce, referenceCheck, affiliateExpireReferrals, pipelineAdvance, pipelineBrainstormDispatch],
  });

  // Inngest expects GET (introspection) + POST (events) + PUT (sync)
  fastify.route({
    method: ['GET', 'POST', 'PUT'],
    url: '/',
    handler: handler as never,
  });
}
