// DEBUG BUILD TAG: bright-tale-debug-v3 (force new deploy)
import type { FastifyReply } from 'fastify';
import { ApiError, translateSupabaseError } from './errors.js';
import { ZodError } from 'zod';

const DEBUG_BUILD_TAG = 'v3';

function isZodError(error: unknown): error is ZodError {
  // Use instanceof first (works when both sides are same zod version)
  // Fall back to constructor name check to handle mixed Zod v3/v4 environments
  return (
    error instanceof ZodError ||
    (error != null &&
      typeof error === 'object' &&
      (error as any).constructor?.name === 'ZodError' &&
      Array.isArray((error as any).issues))
  );
}

export function sendError(reply: FastifyReply, error: unknown): void {
  if (error instanceof ApiError) {
    reply.status(error.status).send({
      data: null,
      error: { message: error.message, code: error.code },
    });
    return;
  }

  if (isZodError(error)) {
    reply.status(400).send({
      data: null,
      error: {
        message: 'Validation failed: ' + (error as any).issues.map((i: any) => i.message).join(', '),
        code: 'VALIDATION_ERROR',
      },
    });
    return;
  }

  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const err = error as { code?: string; message: string; details?: string; hint?: string };
    const { code, status } = translateSupabaseError(err);
    reply.status(status).send({
      data: null,
      error: {
        message: err.message,
        code,
        debug_build: DEBUG_BUILD_TAG,
        debug_branch: 'supabase-like',
        debug_origCode: err.code,
        debug_details: err.details,
        debug_hint: err.hint,
        debug_keys: Object.keys(err as object),
        debug_allProps: Object.getOwnPropertyNames(err as object),
        debug_proto: Object.getPrototypeOf(err as object)?.constructor?.name,
        debug_str: String(error),
        debug_json: safeStringify(error),
      },
    });
    return;
  }

  reply.log.error({ err: error }, 'Unhandled route error');
  const err = error as { name?: string; message?: string; stack?: string } | null;
  reply.status(500).send({
    data: null,
    error: {
      message: err?.message ?? 'Internal server error',
      code: 'INTERNAL',
      name: err?.name,
      stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
      debug_build: DEBUG_BUILD_TAG,
      debug_branch: 'fallback',
      debug_str: String(error),
      debug_keys: error && typeof error === 'object' ? Object.keys(error as object) : undefined,
      debug_allProps: error && typeof error === 'object' ? Object.getOwnPropertyNames(error as object) : undefined,
      debug_proto: error && typeof error === 'object' ? Object.getPrototypeOf(error as object)?.constructor?.name : undefined,
      debug_json: safeStringify(error),
    },
  });
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, Object.getOwnPropertyNames(value as object));
  } catch {
    return '<unstringifiable>';
  }
}
