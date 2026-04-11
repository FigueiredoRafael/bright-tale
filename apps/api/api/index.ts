/**
 * Vercel Serverless Handler
 *
 * Adapts Fastify to run as a Vercel serverless function.
 * All requests are routed here via vercel.json rewrites.
 *
 * Note: if `src/index.ts` fails to initialize (buildServer error at cold start),
 * the process exits before this handler runs — Vercel receives a function crash,
 * not a JSON error body. This is an inherent limitation of module-level init.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { server } from '../src/index.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await server.ready();
    // Intentionally fire-and-forget: Vercel keeps the function alive until
    // res.end() is called (watches ServerResponse), not until this promise resolves.
    server.server.emit('request', req, res);
  } catch (err) {
    console.error('Serverless handler error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      data: null,
      error: { code: 'INTERNAL', message: 'Internal server error' },
    }));
  }
}
