import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import { healthRoutes } from './routes/health.js';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  process.env.APP_ORIGIN ?? 'https://app.brighttale.io',
];

export async function buildServer() {
  const fastify = Fastify({ logger: true });

  await fastify.register(fastifyCors, {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  });

  await fastify.register(fastifyCookie);

  await fastify.register(healthRoutes);
  // Auth routes registered in Task 6

  return fastify;
}
