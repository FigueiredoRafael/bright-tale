/**
 * BrightTale API
 *
 * Application entry point.
 * Creates Fastify synchronously and registers plugins at top level
 * so the module evaluates without top-level await (required for
 * Vercel serverless compatibility).
 */
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
import { orgRoutes } from './routes/org.js';
import { orgMembersRoutes } from './routes/org-members.js';
import { creditsRoutes } from './routes/credits.js';
import { channelsRoutes } from './routes/channels.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { youtubeRoutes } from './routes/youtube.js';
import { referencesRoutes } from './routes/references.js';
import { inngestRoutes } from './routes/inngest.js';
import { contentRoutes } from './routes/content.js';
import { brainstormRoutes } from './routes/brainstorm.js';
import { researchSessionsRoutes } from './routes/research-sessions.js';

const server = Fastify({ logger: true });

const allowedOrigins = [
  'http://localhost:3000',
  process.env.APP_ORIGIN ?? 'https://app.brighttale.io',
];

server.register(fastifyCors, {
  origin: allowedOrigins,
  credentials: true,
});

server.register(fastifyCookie);

server.register(healthRoutes);
server.register(authRoutes);
server.register(projectsRoutes, { prefix: '/projects' });
server.register(researchRoutes, { prefix: '/research' });
server.register(ideasRoutes, { prefix: '/ideas' });
server.register(blogsRoutes, { prefix: '/blogs' });
server.register(videosRoutes, { prefix: '/videos' });
server.register(podcastsRoutes, { prefix: '/podcasts' });
server.register(shortsRoutes, { prefix: '/shorts' });
server.register(stagesRoutes, { prefix: '/stages' });
server.register(templatesRoutes, { prefix: '/templates' });
server.register(assetsRoutes, { prefix: '/assets' });
server.register(canonicalCoreRoutes, { prefix: '/canonical-core' });
server.register(agentsRoutes, { prefix: '/agents' });
server.register(aiConfigRoutes, { prefix: '/ai' });
server.register(imageGenerationRoutes, { prefix: '/image-generation' });
server.register(wordpressRoutes, { prefix: '/wordpress' });
server.register(exportRoutes, { prefix: '/export' });
server.register(usersRoutes, { prefix: '/users' });
server.register(orgRoutes, { prefix: '/org' });
server.register(orgMembersRoutes, { prefix: '/org' });
server.register(creditsRoutes, { prefix: '/credits' });
server.register(channelsRoutes, { prefix: '/channels' });
server.register(onboardingRoutes, { prefix: '/onboarding' });
server.register(youtubeRoutes, { prefix: '/youtube' });
server.register(referencesRoutes, { prefix: '/channels' });
server.register(inngestRoutes, { prefix: '/inngest' });
server.register(contentRoutes, { prefix: '/content' });
server.register(brainstormRoutes, { prefix: '/brainstorm' });
server.register(researchSessionsRoutes, { prefix: '/research-sessions' });

if (!process.env.VERCEL) {
  const PORT = parseInt(process.env.PORT ?? '3001', 10);
  server.listen({ port: PORT, host: '0.0.0.0' }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export default server;
