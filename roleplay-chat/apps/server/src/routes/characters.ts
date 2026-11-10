import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../validation.js';
import {
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  updateCharacter,
} from '../services/characters.js';

const characterSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(20_000).optional(),
  personality: z.string().max(20_000).optional(),
  scenario: z.string().max(20_000).optional(),
  firstMessage: z.string().max(20_000).optional(),
  systemPrompt: z.string().max(20_000).optional(),
});

export const charactersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/characters', async () => listCharacters(app.ctx));

  app.get('/characters/:id', async (request) => {
    const { id } = request.params as { id: string };
    return getCharacter(app.ctx, id);
  });

  app.post('/characters', async (request, reply) => {
    const input = parse(characterSchema, request.body);
    reply.status(201).send(createCharacter(app.ctx, input));
  });

  app.patch('/characters/:id', async (request) => {
    const { id } = request.params as { id: string };
    return updateCharacter(app.ctx, id, parse(characterSchema.partial(), request.body));
  });

  app.delete('/characters/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    deleteCharacter(app.ctx, id);
    reply.status(204).send();
  });
};
