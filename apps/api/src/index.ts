import { buildServer } from './server.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const server = await buildServer();

try {
  await server.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
