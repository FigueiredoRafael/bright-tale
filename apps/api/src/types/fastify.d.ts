export {};

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    rawBody?: string | Buffer;
  }

  interface FastifyContextConfig {
    rawBody?: boolean;
  }
}
