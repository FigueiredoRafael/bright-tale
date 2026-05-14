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
import { projectSetupRoutes } from "./routes/project-setup.js";
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
import { personasRoutes } from "./routes/personas.js";
import { channelPersonasRoutes } from "./routes/channel-personas.js";
import { adminPersonaGuardrailsRoutes } from "./routes/admin-persona-guardrails.js";
import { autopilotTemplatesRoutes } from "./routes/autopilot-templates.js";
import { adminPersonaArchetypesRoutes } from "./routes/admin-persona-archetypes.js";
import { adminPipelineSettingsRoutes } from "./routes/admin-pipeline-settings.js";
import { aiProvidersRoutes } from "./routes/ai-providers.js";
import { adminCreditSettingsRoutes } from "./routes/admin-credit-settings.js";
import { currencyRefreshRoutes } from "./routes/currency-refresh.js";
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
import { registerUserAuthHardening } from "./middleware/user-auth-hardening.js";
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
  "http://localhost:3002",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3002",
  process.env.APP_ORIGIN ?? "https://app.brighttale.io",
];

server.register(fastifyCors, {
  origin: allowedOrigins,
  credentials: true,
});

server.register(fastifyCookie);

// ── Origin enforcement for state-changing requests ────────────────────────
// CORS blocks the browser from reading cross-origin responses, but it does
// not stop the server from processing the request. For POST/PUT/PATCH/DELETE,
// we reject outright when Origin is present and not in our allowlist —
// defense in depth against CSRF / side-effect attacks from forged browser
// contexts. Server-to-server calls (e.g. apps/app rewrite) typically don't
// include an Origin header; they're gated by INTERNAL_API_KEY instead.
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_ORIGIN_SET = new Set(allowedOrigins);
server.addHook("onRequest", async (request, reply) => {
  if (!STATE_CHANGING_METHODS.has(request.method)) return;
  const origin = request.headers.origin;
  if (origin && !ALLOWED_ORIGIN_SET.has(origin)) {
    return reply.status(403).send({
      data: null,
      error: {
        code: "ORIGIN_NOT_ALLOWED",
        message: "Origin not permitted for this request",
      },
    });
  }
});

// ── Security headers ──────────────────────────────────────────────────────
// apps/api only serves JSON, so CSP can be the strictest possible. Bots
// probing :3001 get the same baseline headers as apps/app and apps/web.
// In dev, CSP goes Report-Only so HMR / error-pages are not broken.
const isDev = process.env.NODE_ENV !== "production";
server.addHook("onSend", (_request, reply, payload, done) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), usb=(), bluetooth=(), payment=(), magnetometer=(), gyroscope=(), interest-cohort=()",
  );
  reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  reply.header(
    isDev ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  reply.header("Cross-Origin-Opener-Policy", "same-origin");
  reply.header("Cross-Origin-Resource-Policy", "same-site");
  reply.removeHeader("X-Powered-By");
  done(null, payload);
});

Sentry.setupFastifyErrorHandler(server);

// ── Central error handler ────────────────────────────────────────────────
// Every thrown error gets mapped to the {data, error} envelope we document
// in CLAUDE.md. Client never sees Postgres codes, Zod field paths, or
// framework stack frames. Full detail stays in server logs (and Sentry).
server.setErrorHandler((err, request, reply) => {
  // ApiErrors are intentional, developer-controlled — pass code/message through directly.
  if (err.name === 'ApiError') {
    const apiErr = err as unknown as { status: number; code?: string; message: string }
    request.log.error({ err, code: apiErr.code }, `error → ${apiErr.code}`)
    return reply.status(apiErr.status).send({ data: null, error: { code: apiErr.code ?? 'ERROR', message: apiErr.message } })
  }

  const status =
    typeof (err as { statusCode?: number }).statusCode === "number" &&
    (err as { statusCode: number }).statusCode >= 400 &&
    (err as { statusCode: number }).statusCode < 600
      ? (err as { statusCode: number }).statusCode
      : 500;

  // Map framework / library errors to stable codes without leaking internals.
  const map: Array<{ test: RegExp; code: string; safeMessage: string; status?: number }> = [
    { test: /FST_ERR_CTP_INVALID_JSON|Unexpected token|valid JSON|SyntaxError/i, code: "BAD_JSON", safeMessage: "Malformed JSON body", status: 400 },
    { test: /FST_ERR_CTP_EMPTY_JSON_BODY|empty[\w\s]*body/i, code: "EMPTY_BODY", safeMessage: "Request body is empty", status: 400 },
    { test: /body[\w\s.]*exceeded|payload.*large|FST_ERR_CTP_BODY_TOO_LARGE/i, code: "PAYLOAD_TOO_LARGE", safeMessage: "Payload too large", status: 413 },
    { test: /FST_ERR_CTP_INVALID_MEDIA_TYPE|content-type/i, code: "UNSUPPORTED_CONTENT_TYPE", safeMessage: "Unsupported Content-Type", status: 415 },
    { test: /ZodError|validation/i, code: "VALIDATION_ERROR", safeMessage: "Invalid input" },
    { test: /PGRST\d+|PostgresError|duplicate key|violates.*constraint/i, code: "DATABASE_ERROR", safeMessage: "Database error", status: 500 },
    { test: /timeout/i, code: "TIMEOUT", safeMessage: "Request timed out", status: 504 },
  ];
  const match = map.find(
    (m) =>
      m.test.test(err.message ?? "") ||
      m.test.test(err.name ?? "") ||
      m.test.test(String((err as { code?: string }).code ?? "")),
  );
  const code = match?.code ?? (status === 404 ? "NOT_FOUND" : status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST");
  // For 5xx: always the generic safe message — never leak internals.
  // For 4xx: the match's safeMessage, or a generic "Request failed" — never the raw err.message
  // which can contain parser fragments, field paths, etc.
  const message = match?.safeMessage ?? (status >= 500 ? "Internal server error" : "Request failed");
  const finalStatus = match?.status ?? status;

  // Log full detail server-side for diagnosis.
  request.log.error({ err, code }, `error → ${code}`);

  reply.status(finalStatus).send({ data: null, error: { code, message } });
});

// Same for 404 — don't leak the framework default body shape.
server.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    data: null,
    error: { code: "NOT_FOUND", message: "Route not found" },
  });
});

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

// SEC-001: rate-limit + uniform-timing + response-unification hooks
// for the user-facing auth POST endpoints. Registered BEFORE authRoutes
// so preHandler gates fire first.
registerUserAuthHardening(server);

server.register(healthRoutes);
server.register(authRoutes);
server.register(projectsRoutes, { prefix: "/projects" });
server.register(projectSetupRoutes, { prefix: "/projects" });
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
server.register(personasRoutes, { prefix: "/personas" });
server.register(channelPersonasRoutes, { prefix: "/channels" });
server.register(adminPersonaGuardrailsRoutes, { prefix: "/agents/personas/guardrails" });
server.register(adminPersonaArchetypesRoutes, { prefix: "/agents/personas/archetypes" });
server.register(adminPipelineSettingsRoutes, { prefix: "/admin/pipeline-settings" });
server.register(aiProvidersRoutes, { prefix: "/ai-providers" });
server.register(adminCreditSettingsRoutes, { prefix: "/admin/credit-settings" });
server.register(autopilotTemplatesRoutes, { prefix: "/autopilot-templates" });
server.register(currencyRefreshRoutes);

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
