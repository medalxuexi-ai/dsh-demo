import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../validation.js';
import { ApiError } from '../errors.js';
import { clearMemory, summarizeChat, updateMemory } from '../services/memory.js';

const updateSchema = z.object({ summary: z.string().min(1).max(20_000) });

export const memoryRoutes: FastifyPluginAsync = async (app) => {
  app.post('/chats/:id/memory/summarize', async (request) => {
    const { id } = request.params as { id: string };
    return summarizeChat(app.ctx, id);
  });

  app.patch('/chats/:id/memory', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(updateSchema, request.body);
    return updateMemory(app.ctx, id, input.summary);
  });

  app.delete('/chats/:id/memory', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!app.ctx.repos.chats.get(id)) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    clearMemory(app.ctx, id);
    reply.status(204).send();
  });
};
