import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  sendDefaultPii: true,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  debug: process.env.DEBUG_SENTRY === "true",
  // Ignore noisy routes from tracing
  ignoreTransactions: [
    "PUT /inngest",
    "GET /inngest",
    "POST /inngest",
    "GET /health",
  ],
});
