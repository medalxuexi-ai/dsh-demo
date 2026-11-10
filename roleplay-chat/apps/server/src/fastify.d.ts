import type { AppContext } from './types.js';

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
}

export {};
