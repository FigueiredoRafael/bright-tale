import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { projectsRoutes } from './routes/projects.js';
import { researchRoutes } from './routes/research.js';
import { ideasRoutes } from './routes/ideas.js';
import { blogsRoutes } from './routes/blogs.js';
import { videosRoutes } from './routes/videos.js';
import { podcastsRoutes } from './routes/podcasts.js';
import { shortsRoutes } from './routes/shorts.js';
import { stagesRoutes } from './routes/stages.js';
import { templatesRoutes } from './routes/templates.js';
import { assetsRoutes } from './routes/assets.js';
import { canonicalCoreRoutes } from './routes/canonical-core.js';
import { agentsRoutes } from './routes/agents.js';
import { aiConfigRoutes } from './routes/ai-config.js';
import { imageGenerationRoutes } from './routes/image-generation.js';
import { wordpressRoutes } from './routes/wordpress.js';
import { exportRoutes } from './routes/export.js';
import { usersRoutes } from './routes/users.js';

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
  await fastify.register(projectsRoutes, { prefix: '/projects' });
  await fastify.register(researchRoutes, { prefix: '/research' });
  await fastify.register(ideasRoutes, { prefix: '/ideas' });
  await fastify.register(blogsRoutes, { prefix: '/blogs' });
  await fastify.register(videosRoutes, { prefix: '/videos' });
  await fastify.register(podcastsRoutes, { prefix: '/podcasts' });
  await fastify.register(shortsRoutes, { prefix: '/shorts' });
  await fastify.register(stagesRoutes, { prefix: '/stages' });
  await fastify.register(templatesRoutes, { prefix: '/templates' });
  await fastify.register(assetsRoutes, { prefix: '/assets' });
  await fastify.register(canonicalCoreRoutes, { prefix: '/canonical-core' });
  await fastify.register(agentsRoutes, { prefix: '/agents' });
  await fastify.register(aiConfigRoutes, { prefix: '/ai' });
  await fastify.register(imageGenerationRoutes, { prefix: '/image-generation' });
  await fastify.register(wordpressRoutes, { prefix: '/wordpress' });
  await fastify.register(exportRoutes, { prefix: '/export' });
  await fastify.register(usersRoutes, { prefix: '/users' });

  return fastify;
}
