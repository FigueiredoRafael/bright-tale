/**
 * Export Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 *
 * NOTE: Export routes do NOT use the standard { data, error } envelope.
 * They return raw JSON to preserve backward compatibility.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { createExportJob, getExportJob, getExportPayload } from '../lib/exportJobs.js';

const createJobSchema = z.object({
  project_ids: z.array(z.string().cuid()).min(1),
});

export async function exportRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /jobs — Create a new export job
   */
  fastify.post('/jobs', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const data = createJobSchema.parse(request.body);
      const id = await createExportJob(data.project_ids);
      return reply.status(200).send({ job_id: id });
    } catch (err: any) {
      return reply
        .status(400)
        .send({ error: err?.message ?? 'Bad request' });
    }
  });

  /**
   * GET /jobs/:id — Get export job status
   */
  fastify.get('/jobs/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = getExportJob(id);
    if (!job) {
      return reply.status(404).send({ error: 'Not found' });
    }
    return reply.status(200).send({ job_id: job.id, status: job.status });
  });

  /**
   * GET /jobs/:id/download — Download export job result as JSON attachment
   */
  fastify.get('/jobs/:id/download', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = getExportPayload(id);
    if (!payload) {
      return reply.status(404).send({ error: 'Not ready or not found' });
    }

    const body = JSON.stringify(payload, null, 2);

    return reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename=projects-export-${id}.json`)
      .status(200)
      .send(body);
  });
}
