import { buildServer } from './server.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

try {
  const server = await buildServer();
  await server.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  // Fastify/Pino logger not bootstrapped yet — console.error is the only option here
  console.error(err);
  process.exit(1);
}
