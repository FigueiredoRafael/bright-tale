/**
 * Structured logger (F1-012)
 *
 * Wraps Fastify's built-in Pino logger with context enrichment.
 * When Sentry is configured (SENTRY_DSN), errors are also reported there.
 *
 * Usage in routes:
 *   request.log.info({ orgId, action }, 'credit check passed');
 *   request.log.error({ err, userId }, 'failed to debit credits');
 */

// Re-export the Fastify logger type for convenience
export type { FastifyBaseLogger as Logger } from 'fastify';

/**
 * Creates Pino logger options for the Fastify server.
 * Includes org_id and request_id in every log line.
 */
export function getLoggerConfig() {
  return {
    level: process.env.LOG_LEVEL ?? 'info',
    serializers: {
      req(request: { method: string; url: string; headers: Record<string, unknown> }) {
        return {
          method: request.method,
          url: request.url,
          requestId: request.headers['x-request-id'],
          userId: request.headers['x-user-id'],
        };
      },
    },
  };
}

/**
 * Sentry initialization stub.
 * Install @sentry/node and call this in index.ts when SENTRY_DSN is set.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  // Dynamic import avoids hard dependency — @sentry/node is optional
  const sentryModule = '@sentry/node';
  (Function('m', 'return import(m)')(sentryModule) as Promise<{ init: (opts: Record<string, unknown>) => void }>)
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV ?? 'development',
        tracesSampleRate: 0.1,
      });
    })
    .catch(() => { /* @sentry/node not installed */ });
}

/**
 * Reports an error to Sentry (if configured).
 */
export function captureError(error: Error, context?: Record<string, unknown>): void {
  const sentryModule = '@sentry/node';
  (Function('m', 'return import(m)')(sentryModule) as Promise<{ setContext: (key: string, ctx: Record<string, unknown>) => void; captureException: (err: Error) => void }>)
    .then((Sentry) => {
      if (context) Sentry.setContext('extra', context);
      Sentry.captureException(error);
    })
    .catch(() => { /* @sentry/node not installed */ });
}
