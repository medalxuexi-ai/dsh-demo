import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { SceneDirective } from '@roleplay/core';
import { parse } from '../validation.js';
import { ApiError } from '../errors.js';

const placementSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('system-top') }),
  z.object({ mode: z.literal('depth'), depth: z.number().int().min(0).max(2000) }),
  z.object({ mode: z.literal('anchored'), messageId: z.string().min(1) }),
]);

const sceneInputSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.string().trim().min(1).max(20_000),
  role: z.enum(['system', 'user', 'assistant']).optional(),
  placement: placementSchema,
  lifetime: z.enum(['persistent', 'once']).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
});

const sceneUpdateSchema = sceneInputSchema.partial();

function validatePlacement(
  ctx: { repos: { chats: { getMessage: (id: string) => { chatId: string } | undefined } } },
  chatId: string,
  placement: SceneDirective['placement'],
): void {
  if (placement.mode !== 'anchored') return;
  const message = ctx.repos.chats.getMessage(placement.messageId);
  if (!message || message.chatId !== chatId) {
    throw new ApiError(409, 'ANCHOR_INVALID', '场景锚点消息不存在或不属于该会话');
  }
}

function placementValid(placement: SceneDirective['placement'], branchIds: Set<string>): boolean {
  if (placement.mode !== 'anchored') return true;
  return branchIds.has(placement.messageId);
}

function sceneView(scene: SceneDirective, branchIds: Set<string>) {
  return { ...scene, placementValid: placementValid(scene.placement, branchIds) };
}

export const scenesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/chats/:id/scenes', async (request) => {
    const { id } = request.params as { id: string };
    const chat = app.ctx.repos.chats.get(id);
    if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    const branchIds = new Set(app.ctx.repos.chats.messages(id, chat.activeLeafId).map((message) => message.id));
    return app.ctx.repos.scenes.list(id).map((scene) => sceneView(scene, branchIds));
  });

  app.post('/chats/:id/scenes', async (request, reply) => {
    const { id } = request.params as { id: string };
    const chat = app.ctx.repos.chats.get(id);
    if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    const input = parse(sceneInputSchema, request.body);
    validatePlacement(app.ctx, id, input.placement);
    const scene = app.ctx.repos.scenes.create({
      chatId: id,
      title: input.title?.trim() || input.content.slice(0, 20),
      content: input.content,
      role: input.role ?? 'system',
      placement: input.placement,
      lifetime: input.lifetime ?? 'persistent',
      enabled: input.enabled ?? true,
      sortOrder: input.sortOrder ?? 0,
    });
    reply.status(201).send(sceneView(scene, new Set(app.ctx.repos.chats.messages(id, chat.activeLeafId).map((message) => message.id))));
  });

  app.patch('/scenes/:id', async (request) => {
    const { id } = request.params as { id: string };
    const current = app.ctx.repos.scenes.get(id);
    if (!current) throw new ApiError(404, 'NOT_FOUND', '场景不存在');
    const input = parse(sceneUpdateSchema, request.body);
    if (input.placement) validatePlacement(app.ctx, current.chatId, input.placement);
    const updated = app.ctx.repos.scenes.update(id, input);
    if (!updated) throw new ApiError(404, 'NOT_FOUND', '场景不存在');
    const chat = app.ctx.repos.chats.get(current.chatId);
    const branchIds = new Set(app.ctx.repos.chats.messages(current.chatId, chat?.activeLeafId).map((message) => message.id));
    return sceneView(updated, branchIds);
  });

  app.delete('/scenes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!app.ctx.repos.scenes.get(id)) throw new ApiError(404, 'NOT_FOUND', '场景不存在');
    app.ctx.repos.scenes.remove(id);
    reply.status(204).send();
  });
};
