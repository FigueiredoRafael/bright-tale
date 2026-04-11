import { buildServer } from './fastify.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

// Built once at module init — cold start cost on Vercel, normal startup locally
export const server = await buildServer().catch((err: unknown) => {
  console.error('Failed to initialize server:', err);
  process.exit(1);
});

// Vercel uses serverless functions — do not start the HTTP server
if (!process.env.VERCEL) {
  try {
    await server.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
