/**
 * POST /assets/generate/video — S7 (#220)
 *
 * Video-track image generation endpoint.
 * Wraps routeImageGeneration with the prompts-only short-circuit.
 *
 * Request shape: GenerateVideoImageRequest (from @brighttale/shared)
 * Response:
 *   201 — generated image (shortCircuited=false)
 *   200 — short-circuited prompt echo (shortCircuited=true)
 *   400 — validation error
 *   401 — auth failure
 *   502 — provider failure
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { generateVideoImageRequestSchema } from '@brighttale/shared/schemas/imageGeneration';
import { routeImageGeneration, ImageGenerationError } from '../lib/ai/image-router.js';

export async function assetsGenerateVideoRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /generate/video
   *
   * Generate or short-circuit an image for a video draft slot.
   *
   * mode='prompts-only' → 200, { shortCircuited: true, prompt }
   * mode='generate'     → 201, { shortCircuited: false, imageUrl, base64, mimeType, provider }
   */
  fastify.post('/generate/video', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const validated = generateVideoImageRequestSchema.parse(request.body);

      const result = await routeImageGeneration({
        prompt: validated.prompt,
        draftId: validated.draftId,
        slot: validated.slot,
        chapterIndex: validated.chapterIndex,
        mode: validated.mode,
        userId: request.userId ?? null,
        aspectRatio: validated.aspectRatio,
      });

      const statusCode = result.shortCircuited ? 200 : 201;
      return reply.status(statusCode).send({ data: result, error: null });
    } catch (err) {
      if (err instanceof ImageGenerationError) {
        return reply.status(502).send({
          data: null,
          error: {
            code: 'IMAGE_GENERATION_FAILED',
            message: err.message,
          },
        });
      }
      return sendError(reply, err);
    }
  });
}
