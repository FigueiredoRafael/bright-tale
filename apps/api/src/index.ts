/**
 * BrightTale API
 *
 * Application entry point.
 * Initializes Fastify and registers plugins and routes.
 */
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';

const server = Fastify({ logger: true });

server.register(fastifyCors, {
  origin: [
    'http://localhost:3000',
    process.env.APP_ORIGIN ?? 'https://app.brighttale.io',
  ],
  credentials: true,
});

server.register(fastifyCookie);
server.register(healthRoutes);
server.register(authRoutes);

if (!process.env.VERCEL) {
  const PORT = parseInt(process.env.PORT ?? '3001', 10);
  server.listen({ port: PORT, host: '0.0.0.0' }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export default server;
