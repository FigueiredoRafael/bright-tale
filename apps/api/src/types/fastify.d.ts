export {};

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }

  interface FastifyContextConfig {
    rawBody?: boolean;
  }
}
