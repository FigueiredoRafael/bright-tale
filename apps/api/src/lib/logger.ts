/**
 * Structured logger (F1-012)
 *
 * Wraps Fastify's built-in Pino logger with context enrichment.
 * Sentry is initialized via instrument.ts — use captureError() to
 * report errors with additional context.
 *
 * Usage in routes:
 *   request.log.info({ orgId, action }, 'credit check passed');
 *   request.log.error({ err, userId }, 'failed to debit credits');
 */
import * as Sentry from '@sentry/node';

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
 * Reports an error to Sentry with optional context.
 */
export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (context) Sentry.setContext('extra', context);
  Sentry.captureException(error);
}
