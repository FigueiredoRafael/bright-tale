/**
 * Vercel Serverless Handler
 *
 * Adapts Fastify to run as a Vercel serverless function.
 * All requests are routed here via vercel.json rewrites.
 *
 * Dynamic import wraps module evaluation so any top-level throw (missing env
 * var, bad import, etc.) is caught and logged with the real error message
 * instead of surfacing as an opaque FUNCTION_INVOCATION_FAILED.
 */
import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const { default: server } = await import('../src/index.js');
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
