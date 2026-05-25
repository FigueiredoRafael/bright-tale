/**
 * T6.4 — GET /feeds/:channelId.xml
 *
 * Serves the RSS 2.0 + iTunes feed for a channel. Responses are ETag-cached:
 * the client may send If-None-Match to receive a 304 when the feed is unchanged.
 *
 * This route is intentionally NOT behind the authenticate() middleware — RSS
 * feed URLs are public by design (podcast aggregators hit them without auth).
 * The route must still be registered in the Fastify server (index.ts).
 */

import type { FastifyInstance } from 'fastify';
import { generateFeed } from '../lib/publishing/rss-feed.js';

export async function feedsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /:channelId.xml
   * Returns the RSS 2.0 + iTunes feed for the channel.
   *
   * Params:
   *   channelId — channel UUID (the `.xml` suffix is stripped in the route pattern)
   *
   * Headers out:
   *   Content-Type: application/rss+xml; charset=utf-8
   *   ETag: "<sha256-fingerprint>"
   *
   * Returns 304 when the client sends a matching If-None-Match header.
   */
  fastify.get<{ Params: { channelId: string } }>(
    '/:channelId.xml',
    async (request, reply) => {
      const { channelId } = request.params;

      let descriptor: Awaited<ReturnType<typeof generateFeed>>;

      try {
        const feedUrl = `${request.protocol}://${request.hostname}/feeds/${channelId}.xml`;
        descriptor = await generateFeed(channelId, feedUrl);
      } catch (err: unknown) {
        const castErr = err as { statusCode?: number; code?: string; message?: string };
        if (castErr.statusCode === 404 || castErr.code === 'NOT_FOUND') {
          return reply.status(404).send({
            data: null,
            error: { code: 'NOT_FOUND', message: 'Channel not found' },
          });
        }
        request.log.error({ err }, 'Failed to generate RSS feed');
        return reply.status(500).send({
          data: null,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to generate feed' },
        });
      }

      const { xml, etag } = descriptor;

      // ETag / 304 support.
      const ifNoneMatch = request.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) {
        return reply
          .status(304)
          .header('ETag', etag)
          .header('Cache-Control', 'public, max-age=300')
          .send();
      }

      return reply
        .status(200)
        .header('Content-Type', 'application/rss+xml; charset=utf-8')
        .header('ETag', etag)
        .header('Cache-Control', 'public, max-age=300')
        .send(xml);
    },
  );
}
