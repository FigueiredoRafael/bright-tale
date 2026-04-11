/**
 * Vercel Serverless Handler
 *
 * Adapts Fastify to run as a Vercel serverless function.
 * All requests are routed here via vercel.json rewrites.
 *
 * Fastify is initialized directly here (not imported from src/fastify.ts)
 * so Vercel's entrypoint scanner sees `import Fastify from 'fastify'` in this
 * file without needing to cross directory boundaries in the import chain.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import { healthRoutes } from '../src/routes/health.js';
import { authRoutes } from '../src/routes/auth.js';

const app = Fastify({ logger: true });

await app.register(fastifyCors, {
  origin: [
    'http://localhost:3000',
    process.env.APP_ORIGIN ?? 'https://app.brighttale.io',
  ],
  credentials: true,
});
await app.register(fastifyCookie);
await app.register(healthRoutes);
await app.register(authRoutes);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await app.ready();
    app.server.emit('request', req, res);
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
