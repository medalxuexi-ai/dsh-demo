import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../validation.js';
import { ApiError } from '../errors.js';
import { exportWorldInfo, importWorldInfo } from '../services/world-info.js';
import type { AppContext } from '../types.js';

const entrySchema = z.object({
  uid: z.number().int().min(0).max(1_000_000).optional(),
  name: z.string().trim().max(200).optional().default(''),
  keys: z.array(z.string().max(200)).max(100).optional().default([]),
  secondaryKeys: z.array(z.string().max(200)).max(100).optional().default([]),
  content: z.string().trim().min(1).max(50_000),
  enabled: z.boolean().optional().default(true),
  constant: z.boolean().optional().default(false),
  selective: z.boolean().optional().default(true),
  caseSensitive: z.boolean().optional().default(false),
  matchWholeWords: z.boolean().optional().default(true),
  order: z.number().int().min(-10000).max(10000).optional().default(100),
  position: z.number().int().min(0).max(4).optional().default(0),
  depth: z.number().int().min(0).max(2000).optional().default(4),
  role: z.number().int().min(0).max(2).optional().default(0),
  scanDepth: z.number().int().min(0).max(200).optional().default(2),
  probability: z.number().int().min(0).max(100).optional().default(100),
  raw: z.record(z.unknown()).nullable().optional(),
});

const updateSchema = entrySchema.partial();
const importSchema = z.object({ book: z.unknown() });

export const worldInfoRoutes: FastifyPluginAsync = async (app) => {
  app.get('/chats/:id/world-info', async (request) => {
    const { id } = request.params as { id: string };
    const chat = app.ctx.repos.chats.get(id);
    if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    return app.ctx.repos.worldInfo.listForChat(chat.scriptId, chat.characterId);
  });

  app.get('/scripts/:id/world-info', async (request) => {
    const { id } = request.params as { id: string };
    if (!app.ctx.repos.scripts.get(id)) throw new ApiError(404, 'NOT_FOUND', '剧本不存在');
    return app.ctx.repos.worldInfo.listByScript(id);
  });

  app.post('/scripts/:id/world-info', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!app.ctx.repos.scripts.get(id)) throw new ApiError(404, 'NOT_FOUND', '剧本不存在');
    const input = parse(entrySchema, request.body);
    const payload = {
      scriptId: id,
      characterId: null,
      uid: input.uid ?? 0,
      name: String(input.name || input.content.slice(0, 20)),
      keys: input.keys ?? [],
      secondaryKeys: input.secondaryKeys ?? [],
      content: input.content,
      enabled: input.enabled ?? true,
      constant: input.constant ?? false,
      selective: input.selective ?? true,
      caseSensitive: input.caseSensitive ?? false,
      matchWholeWords: input.matchWholeWords ?? true,
      order: input.order ?? 100,
      position: input.position ?? 0,
      depth: input.depth ?? 4,
      role: input.role ?? 0,
      scanDepth: input.scanDepth ?? 2,
      probability: input.probability ?? 100,
      raw: input.raw ?? null,
    } as Parameters<typeof app.ctx.repos.worldInfo.create>[0];
    reply.status(201).send(app.ctx.repos.worldInfo.create(payload));
  });

  app.patch('/world-info/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(updateSchema, request.body);
    const entry = app.ctx.repos.worldInfo.update(id, input);
    if (!entry) throw new ApiError(404, 'NOT_FOUND', '世界书条目不存在');
    return entry;
  });

  app.delete('/world-info/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!app.ctx.repos.worldInfo.get(id)) throw new ApiError(404, 'NOT_FOUND', '世界书条目不存在');
    app.ctx.repos.worldInfo.remove(id);
    reply.status(204).send();
  });

  app.post('/scripts/:id/world-info/import', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!app.ctx.repos.scripts.get(id)) throw new ApiError(404, 'NOT_FOUND', '剧本不存在');
    const input = parse(importSchema, request.body);
    const entries = importWorldInfo(app.ctx, { scriptId: id, characterId: null }, input.book);
    reply.status(201).send(entries);
  });

  app.get('/scripts/:id/world-info/export', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!app.ctx.repos.scripts.get(id)) throw new ApiError(404, 'NOT_FOUND', '剧本不存在');
    const script = app.ctx.repos.scripts.get(id)!;
    reply.header('content-disposition', `attachment; filename="${encodeURIComponent(script.name)}-world-info.json"`);
    return exportWorldInfo(app.ctx.repos.worldInfo.listByScript(id));
  });

  app.get('/characters/:id/world-info', async (request) => {
    const { id } = request.params as { id: string };
    if (!app.ctx.repos.characters.get(id)) throw new ApiError(404, 'NOT_FOUND', '角色不存在');
    return app.ctx.repos.worldInfo.listByCharacter(id);
  });

  app.post('/characters/:id/import-book', async (request, reply) => {
    const { id } = request.params as { id: string };
    const character = app.ctx.repos.characters.get(id);
    if (!character) throw new ApiError(404, 'NOT_FOUND', '角色不存在');
    const input = parse(importSchema, request.body);
    const entries = importWorldInfo(app.ctx, {
      scriptId: character.scriptId ?? null,
      characterId: id,
    }, input.book);
    reply.status(201).send(entries);
  });
};
