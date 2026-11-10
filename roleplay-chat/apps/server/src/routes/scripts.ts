import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../validation.js';
import { ApiError } from '../errors.js';

const scriptInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(20_000).optional(),
  opening: z.string().max(20_000).optional(),
});

const scriptUpdateSchema = scriptInputSchema.partial();

export const scriptsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/scripts', async () => app.ctx.repos.scripts.list());

  app.post('/scripts', async (request, reply) => {
    const input = parse(scriptInputSchema, request.body);
    const script = app.ctx.repos.scripts.create({
      name: input.name,
      description: input.description ?? '',
      opening: input.opening ?? '',
    });
    reply.status(201).send(script);
  });

  app.patch('/scripts/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(scriptUpdateSchema, request.body);
    const script = app.ctx.repos.scripts.update(id, input);
    if (!script) throw new ApiError(404, 'NOT_FOUND', '剧本不存在');
    return script;
  });

  app.delete('/scripts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!app.ctx.repos.scripts.get(id)) throw new ApiError(404, 'NOT_FOUND', '剧本不存在');
    app.ctx.repos.scripts.remove(id);
    reply.status(204).send();
  });
};
