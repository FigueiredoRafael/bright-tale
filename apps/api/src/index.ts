// Local development entrypoint — not used on Vercel (see api/index.ts)
import { buildServer } from './fastify.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const server = await buildServer().catch((err: unknown) => {
  console.error('Failed to initialize server:', err);
  process.exit(1);
});

await server.listen({ port: PORT, host: '0.0.0.0' });
