/**
 * BrightTale API
 *
 * Application entry point.
 * Initializes Fastify via buildServer() and starts listening (non-Vercel).
 */
import { buildServer } from './server.js';

const server = await buildServer();

if (!process.env.VERCEL) {
  const PORT = parseInt(process.env.PORT ?? '3001', 10);
  server.listen({ port: PORT, host: '0.0.0.0' }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export default server;
