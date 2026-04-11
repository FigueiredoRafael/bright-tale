import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';

export async function buildServer() {
  const fastify = Fastify({ logger: true });

  const allowedOrigins = [
    'http://localhost:3000',
    process.env.APP_ORIGIN ?? 'https://app.brighttale.io',
  ];

  await fastify.register(fastifyCors, {
    origin: allowedOrigins,
    credentials: true,
  });

  await fastify.register(fastifyCookie);

  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);

  return fastify;
}
