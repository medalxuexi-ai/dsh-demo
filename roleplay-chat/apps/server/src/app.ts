import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { loadConfig, type AppConfig } from './config.js';
import { createContext } from './context.js';
import { ApiError } from './errors.js';
import { providersRoutes } from './routes/providers.js';
import { charactersRoutes } from './routes/characters.js';
import { chatsRoutes } from './routes/chats.js';
import { scenesRoutes } from './routes/scenes.js';
import { personasRoutes } from './routes/personas.js';
import { scriptsRoutes } from './routes/scripts.js';

export async function buildApp(config: AppConfig = loadConfig()): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.logger
      ? { level: config.logLevel, redact: { paths: ['req.headers.authorization'], censor: '***' } }
      : false,
  });
  const ctx = createContext(config);
  app.decorate('ctx', ctx);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      void reply.status(error.status).send({ error: { code: error.code, message: error.message } });
      return;
    }
    request.log.error(error);
    void reply.status(500).send({ error: { code: 'INTERNAL', message: '服务器内部错误，请查看服务端日志' } });
  });

  await app.register(providersRoutes, { prefix: '/api' });
  await app.register(charactersRoutes, { prefix: '/api' });
  await app.register(chatsRoutes, { prefix: '/api' });
  await app.register(scenesRoutes, { prefix: '/api' });
  await app.register(personasRoutes, { prefix: '/api' });
  await app.register(scriptsRoutes, { prefix: '/api' });

  app.get('/api/health', async () => ({ ok: true, name: 'roleplay-chat', version: '0.1.0' }));

  if (config.webDist && existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, prefix: '/' });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api/')) {
        void reply.status(404).send({ error: { code: 'NOT_FOUND', message: '接口不存在' } });
        return;
      }
      void reply.type('text/html').sendFile('index.html');
    });
  }

  app.addHook('onClose', async () => {
    ctx.db.close();
  });

  return app;
}
