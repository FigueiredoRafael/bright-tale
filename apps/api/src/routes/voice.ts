/**
 * F4-003 — Voice generation routes.
 *
 * POST /voice/synthesize — gera áudio a partir de texto, retorna base64.
 * GET  /voice/voices?provider=elevenlabs — lista vozes disponíveis.
 *
 * Custo: debitado do plano (tabela `voice_usage` implícita via usage_events).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { getVoiceProvider } from '../lib/voice/index.js';

const synthesizeSchema = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string(),
  provider: z.enum(['elevenlabs', 'openai']).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  format: z.enum(['mp3', 'wav']).default('mp3'),
  style: z.string().optional(),
});

export async function voiceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/synthesize', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const body = synthesizeSchema.parse(request.body);
      const provider = getVoiceProvider(body.provider ?? 'elevenlabs');
      if (!provider) {
        throw new ApiError(
          500,
          `Voice provider "${body.provider ?? 'elevenlabs'}" não configurado. Setar ELEVENLABS_API_KEY ou OPENAI_API_KEY em apps/api/.env.local.`,
          'CONFIG_ERROR',
        );
      }

      const result = await provider.synthesize({
        text: body.text,
        voiceId: body.voiceId,
        speed: body.speed,
        format: body.format,
        style: body.style,
      });

      return reply.send({
        data: {
          audioBase64: result.audio.toString('base64'),
          mimeType: result.mimeType,
          estimatedSeconds: result.estimatedSeconds,
          provider: result.providerName,
          voiceId: result.voiceId,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get('/voices', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const q = request.query as { provider?: string };
      const provider = getVoiceProvider(q.provider ?? 'elevenlabs');
      if (!provider) {
        return reply.send({ data: { voices: [], configured: false }, error: null });
      }
      const voices = await provider.listVoices();
      return reply.send({ data: { voices, configured: true, provider: provider.name }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
