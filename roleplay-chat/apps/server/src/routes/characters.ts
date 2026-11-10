import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { buildCharacterCardV2 } from '@roleplay/core';
import { characterCardPng } from '../services/character-png.js';
import { characterBook } from '../services/world-info.js';
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
  scriptId: z.string().min(1).nullable().optional(),
  description: z.string().max(20_000).optional(),
  personality: z.string().max(20_000).optional(),
  scenario: z.string().max(20_000).optional(),
  firstMessage: z.string().max(20_000).optional(),
  systemPrompt: z.string().max(20_000).optional(),
  exampleDialogue: z.string().max(20_000).optional(),
  alternateGreetings: z.array(z.string().max(20_000)).max(50).optional(),
  tags: z.array(z.string().max(80)).max(50).optional(),
  rawExtensions: z.record(z.unknown()).nullable().optional(),
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

  app.get('/characters/:id/export', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { format } = request.query as { format?: string };
    const character = getCharacter(app.ctx, id);
    const entries = app.ctx.repos.worldInfo.listByCharacter(id);
    const book = entries.length > 0 ? characterBook(character, entries) : undefined;
    if (format === 'png') {
      reply.header('content-disposition', `attachment; filename="${encodeURIComponent(character.name)}.png"`);
      return reply.type('image/png').send(characterCardPng(character, book));
    }
    reply.header('content-disposition', `attachment; filename="${encodeURIComponent(character.name)}.json"`);
    const card = buildCharacterCardV2(character);
    if (book) (card.data as Record<string, unknown>).character_book = book;
    return card;
  });

  app.delete('/characters/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    deleteCharacter(app.ctx, id);
    reply.status(204).send();
  });
};
