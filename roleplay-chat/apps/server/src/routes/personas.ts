import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../validation.js';
import { ApiError } from '../errors.js';

const personaInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(20_000).optional(),
});

const personaUpdateSchema = personaInputSchema.partial();

export const personasRoutes: FastifyPluginAsync = async (app) => {
  app.get('/personas', async () => app.ctx.repos.personas.list());

  app.post('/personas', async (request, reply) => {
    const input = parse(personaInputSchema, request.body);
    const persona = app.ctx.repos.personas.create({
      name: input.name,
      description: input.description ?? '',
    });
    reply.status(201).send(persona);
  });

  app.patch('/personas/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(personaUpdateSchema, request.body);
    const persona = app.ctx.repos.personas.update(id, input);
    if (!persona) throw new ApiError(404, 'NOT_FOUND', '人设不存在');
    return persona;
  });

  app.delete('/personas/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!app.ctx.repos.personas.get(id)) throw new ApiError(404, 'NOT_FOUND', '人设不存在');
    app.ctx.repos.personas.remove(id);
    reply.status(204).send();
  });
};
