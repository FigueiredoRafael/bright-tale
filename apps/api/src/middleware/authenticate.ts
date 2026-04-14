import { FastifyRequest, FastifyReply } from 'fastify';

function getValidKeys(): string[] {
  const keys: string[] = [];
  const primary = process.env.INTERNAL_API_KEY;
  if (primary) keys.push(primary);
  const previous = process.env.INTERNAL_API_KEY_PREVIOUS;
  if (previous) keys.push(previous);
  return keys;
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const key = request.headers['x-internal-key'];
  const validKeys = getValidKeys();

  if (!key || typeof key !== 'string' || validKeys.length === 0 || !validKeys.includes(key)) {
    return reply.status(401).send({
      data: null,
      error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
    });
  }

  const userId = request.headers['x-user-id'];
  request.userId = typeof userId === 'string' ? userId : undefined;
}
