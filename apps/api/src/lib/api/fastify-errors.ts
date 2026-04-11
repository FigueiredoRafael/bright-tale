import type { FastifyReply } from 'fastify';
import { ApiError, translateSupabaseError } from './errors';
import { ZodError } from 'zod';

export function sendError(reply: FastifyReply, error: unknown): void {
  if (error instanceof ApiError) {
    reply.status(error.status).send({
      data: null,
      error: { message: error.message, code: error.code },
    });
    return;
  }

  if (error instanceof ZodError) {
    reply.status(400).send({
      data: null,
      error: {
        message: 'Validation failed: ' + error.issues.map(i => i.message).join(', '),
        code: 'VALIDATION_ERROR',
      },
    });
    return;
  }

  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const err = error as { code?: string; message: string };
    const { code, status } = translateSupabaseError(err);
    reply.status(status).send({
      data: null,
      error: { message: err.message, code },
    });
    return;
  }

  reply.log.error({ err: error }, 'Unhandled route error');
  reply.status(500).send({
    data: null,
    error: { message: 'Internal server error', code: 'INTERNAL' },
  });
}
