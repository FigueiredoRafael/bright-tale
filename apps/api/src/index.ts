/**
 * BrightTale API
 *
 * Application entry point.
 * Creates Fastify synchronously and registers plugins at top level
 * so the module evaluates without top-level await (required for
 * Vercel serverless compatibility).
 */
import "./instrument.js";
import * as Sentry from "@sentry/node";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { projectsRoutes } from "./routes/projects.js";
import { researchRoutes } from "./routes/research.js";
import { ideasRoutes } from "./routes/ideas.js";
import { blogsRoutes } from "./routes/blogs.js";
import { videosRoutes } from "./routes/videos.js";
import { podcastsRoutes } from "./routes/podcasts.js";
import { shortsRoutes } from "./routes/shorts.js";
import { stagesRoutes } from "./routes/stages.js";
import { templatesRoutes } from "./routes/templates.js";
import { assetsRoutes } from "./routes/assets.js";
import { canonicalCoreRoutes } from "./routes/canonical-core.js";
import { agentsRoutes } from "./routes/agents.js";
import { aiConfigRoutes } from "./routes/ai-config.js";
import { imageGenerationRoutes } from "./routes/image-generation.js";
import { wordpressRoutes } from "./routes/wordpress.js";
import { exportRoutes } from "./routes/export.js";
import { usersRoutes } from "./routes/users.js";
import { orgRoutes } from "./routes/org.js";
import { orgMembersRoutes } from "./routes/org-members.js";
import { creditsRoutes } from "./routes/credits.js";
import { channelsRoutes } from "./routes/channels.js";
import { onboardingRoutes } from "./routes/onboarding.js";
import { youtubeRoutes } from "./routes/youtube.js";
import { referencesRoutes } from "./routes/references.js";
import { inngestRoutes } from "./routes/inngest.js";
import { contentRoutes } from "./routes/content.js";
import { brainstormRoutes } from "./routes/brainstorm.js";
import { researchSessionsRoutes } from "./routes/research-sessions.js";
import { contentDraftsRoutes } from "./routes/content-drafts.js";
import { usageRoutes } from "./routes/usage.js";
import { billingRoutes } from "./routes/billing.js";
import { bulkRoutes } from "./routes/bulk.js";
import { voiceRoutes } from "./routes/voice.js";
import { publishingDestinationsRoutes } from "./routes/publishing-destinations.js";
import { notificationsRoutes } from "./routes/notifications.js";
import { affiliateLegacyRoutes } from "./routes/affiliate-legacy.js";
import rateLimit from "@fastify/rate-limit";
// Side-effect import: activates `rawBody?: boolean` on FastifyContextConfig
// so routes/billing.ts can use `{ config: { rawBody: true } }` without a
// direct import of the plugin (webhook route reads request.rawBody directly).
import "fastify-raw-body";
import {
  registerAffiliateRedirectRoute,
  registerAffiliateInternalRoutes,
  registerAffiliateRoutes,
  registerAffiliateAdminRoutes,
} from "@tn-figueiredo/affiliate/routes";
import { buildAffiliateContainer } from "./lib/affiliate/container.js";
import { authenticate } from "./middleware/authenticate.js";
import { logRequest, flushAxiom } from "./lib/axiom.js";
import { flushPostHog } from "./lib/posthog.js";

const server = Fastify({
  bodyLimit: 25 * 1024 * 1024, // 25 MB — needed for base64 image uploads
  trustProxy: true, // required for @fastify/rate-limit on Vercel (sets req.ip from X-Forwarded-For)
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
    transport:
      process.env.NODE_ENV !== "production"
        ? {
            target: "pino-pretty",
            options: {
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
              colorize: true,
            },
          }
        : undefined,
    // Silence Inngest polling noise in dev
    serializers: {
      req(req: { method?: string; url?: string }) {
        return { method: req.method, url: req.url };
      },
      res(res: { statusCode?: number }) {
        return { statusCode: res.statusCode };
      },
    },
  },
  disableRequestLogging: true, // We'll log manually with more control
});

const allowedOrigins = [
  "http://localhost:3000",
  process.env.APP_ORIGIN ?? "https://app.brighttale.io",
];

server.register(fastifyCors, {
  origin: allowedOrigins,
  credentials: true,
});

server.register(fastifyCookie);

Sentry.setupFastifyErrorHandler(server);

// Request/response logging — skip Inngest polling noise
const SILENT_ROUTES = new Set(["/inngest", "/health"]);
server.addHook("onResponse", (request, reply, done) => {
  const url = request.url.split("?")[0];
  if (SILENT_ROUTES.has(url)) {
    done();
    return;
  }
  const ms = reply.elapsedTime.toFixed(0);
  const durationMs = Math.round(reply.elapsedTime);
  const status = reply.statusCode;
  const color = status >= 500 ? "❌" : status >= 400 ? "⚠️" : "✅";
  server.log.info(
    `${color} ${request.method} ${request.url} → ${status} (${ms}ms)`,
  );
  logRequest({
    method: request.method,
    path: url,
    statusCode: status,
    durationMs,
    userId: request.headers["x-user-id"] as string | undefined,
    requestId: request.headers["x-request-id"] as string | undefined,
  });
  done();
});

// Serve uploaded/generated images from apps/api/public/
const publicDir = path.resolve(__dirname, "../public");
server.get("/generated-images/*", async (request, reply) => {
  const filePath = path.join(publicDir, "generated-images", (request.params as { "*": string })["*"]);
  const safe = path.resolve(filePath);
  if (!safe.startsWith(path.join(publicDir, "generated-images"))) {
    return reply.status(403).send({ data: null, error: { code: "FORBIDDEN", message: "Forbidden" } });
  }
  if (!fs.existsSync(safe)) {
    return reply.status(404).send({ data: null, error: { code: "NOT_FOUND", message: "File not found" } });
  }
  const ext = path.extname(safe).slice(1).toLowerCase();
  const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
  const mime = mimeMap[ext] ?? "application/octet-stream";
  return reply.header("Content-Type", mime).send(fs.createReadStream(safe));
});

server.register(healthRoutes);
server.register(authRoutes);
server.register(projectsRoutes, { prefix: "/projects" });
server.register(researchRoutes, { prefix: "/research" });
server.register(ideasRoutes, { prefix: "/ideas" });
server.register(blogsRoutes, { prefix: "/blogs" });
server.register(videosRoutes, { prefix: "/videos" });
server.register(podcastsRoutes, { prefix: "/podcasts" });
server.register(shortsRoutes, { prefix: "/shorts" });
server.register(stagesRoutes, { prefix: "/stages" });
server.register(templatesRoutes, { prefix: "/templates" });
server.register(assetsRoutes, { prefix: "/assets" });
server.register(canonicalCoreRoutes, { prefix: "/canonical-core" });
server.register(agentsRoutes, { prefix: "/agents" });
server.register(aiConfigRoutes, { prefix: "/ai" });
server.register(imageGenerationRoutes, { prefix: "/image-generation" });
server.register(wordpressRoutes, { prefix: "/wordpress" });
server.register(exportRoutes, { prefix: "/export" });
server.register(usersRoutes, { prefix: "/users" });
server.register(orgRoutes, { prefix: "/org" });
server.register(orgMembersRoutes, { prefix: "/org" });
server.register(creditsRoutes, { prefix: "/credits" });
server.register(channelsRoutes, { prefix: "/channels" });
server.register(onboardingRoutes, { prefix: "/onboarding" });
server.register(youtubeRoutes, { prefix: "/youtube" });
server.register(referencesRoutes, { prefix: "/channels" });
server.register(inngestRoutes, { prefix: "/inngest" });
server.register(contentRoutes, { prefix: "/content" });
server.register(brainstormRoutes, { prefix: "/brainstorm" });
server.register(researchSessionsRoutes, { prefix: "/research-sessions" });
server.register(contentDraftsRoutes, { prefix: "/content-drafts" });
server.register(usageRoutes, { prefix: "/usage" });
server.register(billingRoutes, { prefix: "/billing" });
server.register(bulkRoutes, { prefix: "/bulk" });
server.register(voiceRoutes, { prefix: "/voice" });
server.register(publishingDestinationsRoutes, {
  prefix: "/publishing-destinations",
});
server.register(notificationsRoutes, { prefix: "/channels" });
server.register(affiliateLegacyRoutes, { prefix: "/affiliate-legacy" });

// Affiliate platform — @tn-figueiredo/affiliate@0.4.0 (Phase 2A.3 wires /ref + /internal)
const affiliateContainer = buildAffiliateContainer();

function parseRefRateLimitMax(): number {
  const raw = process.env.REF_RATE_LIMIT_MAX;
  if (raw === undefined || raw === "") return 30;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

server.register(async (scope) => {
  await scope.register(rateLimit, {
    max: parseRefRateLimitMax(),
    timeWindow: process.env.REF_RATE_LIMIT_WINDOW ?? "1 minute",
    cache: 10_000,
    keyGenerator: (req) => req.ip,
    continueExceeding: false,
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      data: null,
      error: {
        code: "RATE_LIMITED",
        message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.`,
      },
    }),
  });
  registerAffiliateRedirectRoute(scope as never, {
    webBaseUrl: affiliateContainer.config.webBaseUrl,
    trackClickUseCase: affiliateContainer.trackClickUseCase,
  });
}, { prefix: "/ref" });

server.register(async (scope) => {
  scope.addHook("preHandler", authenticate);
  registerAffiliateInternalRoutes(scope as never, {
    getAuthenticatedUser: affiliateContainer.getAuthenticatedUser,
    isAdmin: affiliateContainer.isAdmin,
    expirePendingUseCase: affiliateContainer.expirePendingUseCase,
  });
}, { prefix: "/internal/affiliate" });

server.register(async (scope) => {
  scope.addHook("preHandler", authenticate);
  registerAffiliateRoutes(scope as never, affiliateContainer.endUserDeps);
}, { prefix: "/affiliate" });

server.register(async (scope) => {
  scope.addHook("preHandler", authenticate);
  registerAffiliateAdminRoutes(scope as never, affiliateContainer.adminDeps);
}, { prefix: "/admin/affiliate" });

if (!process.env.VERCEL) {
  // Surface async errors that would otherwise crash the dev process silently
  // (mid-request ECONNRESETs on the proxy side often trace back to this).
  process.on("unhandledRejection", (reason) => {
    server.log.error({ reason }, "unhandledRejection — process kept alive");
    if (reason instanceof Error) Sentry.captureException(reason);
  });
  process.on("uncaughtException", (err) => {
    server.log.error({ err }, "uncaughtException — process kept alive");
    Sentry.captureException(err);
  });

  // Flush Axiom logs before shutdown
  const shutdown = async () => {
    await Promise.all([flushAxiom(), flushPostHog()]);
    await server.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  const PORT = parseInt(process.env.PORT ?? "3001", 10);
  server.listen({ port: PORT, host: "0.0.0.0" }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export default server;
