/**
 * Vercel Serverless Handler
 *
 * Adapts Fastify to run as a Vercel serverless function.
 * All requests are routed here via vercel.json rewrites.
 *
 * Imports buildServer directly (not via src/index.ts) so Vercel's static
 * analysis can follow the import chain to `fastify` without hitting a
 * top-level await barrier in src/index.ts.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { buildServer } from '../src/fastify.js';

// Built once at cold start
const server = await buildServer();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await server.ready();
    server.server.emit('request', req, res);
  } catch (err) {
    console.error('Serverless handler error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      data: null,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    }));
  }
}
