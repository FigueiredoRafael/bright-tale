import { FastifyRequest, FastifyReply } from 'fastify';

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
