import { FastifyRequest, FastifyReply } from 'fastify';

// Trust invariant: `x-user-id` is read only after `x-internal-key` is
// validated. Browser requests reach this API exclusively through the
// apps/app Next.js middleware, which strips any client-supplied
// `x-user-id` before injecting the real one. Server-to-server callers
// that hold `INTERNAL_API_KEY` may set `x-user-id` themselves.
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const key = request.headers['x-internal-key'];
  if (!key || key !== process.env.INTERNAL_API_KEY) {
    return reply.status(401).send({
      data: null,
      error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
    });
  }
  const userId = request.headers['x-user-id'];
  request.userId = typeof userId === 'string' ? userId : undefined;
}
