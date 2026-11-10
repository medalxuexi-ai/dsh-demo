import { DEFAULT_GENERATION_PARAMS, type GenerationParams } from '@roleplay/core';
import type { AppContext } from '../types.js';
import { ApiError } from '../errors.js';
import { getChatDetail, type ChatDetail } from './chats.js';
import { getProviderRow } from './providers.js';

interface ExportMessage {
  id: string;
  parentId: string | null;
  role: 'user' | 'assistant';
  content: string;
  status: string;
  model: string;
  createdAt: string;
}

interface ExportScene {
  title: string;
  content: string;
  role: 'system' | 'user' | 'assistant';
  placement: { mode: 'system-top' } | { mode: 'depth'; depth: number } | { mode: 'anchored'; messageId: string };
  lifetime: 'persistent' | 'once';
  enabled: boolean;
  sortOrder: number;
}

export interface SessionExport {
  version: 1;
  exportedAt: string;
  chat: { title: string; model: string; params: GenerationParams };
  character: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    firstMessage: string;
    systemPrompt: string;
    exampleDialogue?: string;
    alternateGreetings?: string[];
    tags?: string[];
    rawExtensions?: Record<string, unknown> | null;
  };
  persona: { name: string; description: string } | null;
  activeLeafId: string | null;
  messages: ExportMessage[];
  scenes: ExportScene[];
}

export function exportChat(ctx: AppContext, chatId: string): SessionExport {
  const chat = ctx.repos.chats.get(chatId);
  if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
  const persona = chat.personaId ? ctx.repos.personas.get(chat.personaId) : undefined;
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    chat: { title: chat.title, model: chat.model, params: chat.params },
    character: {
      name: chat.character.name,
      description: chat.character.description,
      personality: chat.character.personality,
      scenario: chat.character.scenario,
      firstMessage: chat.character.firstMessage,
      systemPrompt: chat.character.systemPrompt,
      exampleDialogue: chat.character.exampleDialogue,
      alternateGreetings: chat.character.alternateGreetings,
      tags: chat.character.tags,
      rawExtensions: chat.character.rawExtensions,
    },
    persona: persona ? { name: persona.name, description: persona.description } : null,
    activeLeafId: chat.activeLeafId,
    messages: ctx.repos.chats.all(chatId).map((message) => ({
      id: message.id,
      parentId: message.parentId,
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.content,
      status: message.status,
      model: message.model,
      createdAt: message.createdAt,
    })),
    scenes: ctx.repos.scenes.list(chatId).map((scene) => ({
      title: scene.title,
      content: scene.content,
      role: scene.role,
      placement: scene.placement,
      lifetime: scene.lifetime,
      enabled: scene.enabled,
      sortOrder: scene.sortOrder,
    })),
  };
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function importChat(
  ctx: AppContext,
  raw: unknown,
  providerId?: string,
): ChatDetail {
  if (!raw || typeof raw !== 'object') throw new ApiError(400, 'INVALID_IMPORT', '导入文件格式不正确');
  const data = raw as Partial<SessionExport>;
  if (!data.chat || !Array.isArray(data.messages) || !data.character) {
    throw new ApiError(400, 'INVALID_IMPORT', '导入文件缺少 chat / messages / character');
  }
  const provider = providerId
    ? getProviderRow(ctx, providerId)
    : ctx.repos.providers.list()[0];
  if (!provider) throw new ApiError(400, 'NO_PROVIDER', '请先配置模型服务再导入会话');

  const character = ctx.repos.characters.create({
    name: asString(data.character.name, '导入角色') || '导入角色',
    description: asString(data.character.description),
    personality: asString(data.character.personality),
    scenario: asString(data.character.scenario),
    firstMessage: asString(data.character.firstMessage),
    systemPrompt: asString(data.character.systemPrompt),
    exampleDialogue: asString(data.character.exampleDialogue),
    alternateGreetings: Array.isArray(data.character.alternateGreetings) ? data.character.alternateGreetings.filter((item): item is string => typeof item === 'string') : [],
    tags: Array.isArray(data.character.tags) ? data.character.tags.filter((item): item is string => typeof item === 'string') : [],
    rawExtensions: data.character.rawExtensions ?? null,
  });

  let personaId: string | null = null;
  if (data.persona?.name) {
    const existing = ctx.repos.personas.list().find((item) => item.name === data.persona!.name);
    const persona = existing ?? ctx.repos.personas.create({
      name: asString(data.persona.name),
      description: asString(data.persona.description),
    });
    personaId = persona.id;
  }

  const params: GenerationParams = {
    ...DEFAULT_GENERATION_PARAMS,
    ...(data.chat.params && typeof data.chat.params === 'object' ? data.chat.params : {}),
  };
  const chat = ctx.repos.chats.create({
    character,
    providerId: provider.id,
    personaId,
    title: asString(data.chat.title, `${character.name} · 导入会话`) || `${character.name} · 导入会话`,
    model: asString(data.chat.model, provider.default_model) || provider.default_model,
    params,
  });

  const idMap = new Map<string, string>();
  for (const message of data.messages) {
    if (!message || typeof message !== 'object') continue;
    const role = message.role === 'user' ? 'user' : 'assistant';
    const content = asString(message.content);
    if (!content.trim() && message.status !== 'complete') continue;
    const parentId = message.parentId ? idMap.get(message.parentId) ?? null : null;
    const stored = ctx.repos.chats.insertMessage({
      chatId: chat.id,
      parentId,
      role,
      content,
      status: 'complete',
      model: asString(message.model, chat.model),
    });
    if (typeof message.id === 'string') idMap.set(message.id, stored.id);
  }

  const mappedActive = data.activeLeafId ? idMap.get(data.activeLeafId) : undefined;
  if (mappedActive) ctx.repos.chats.setActiveLeaf(chat.id, mappedActive);

  for (const scene of Array.isArray(data.scenes) ? data.scenes : []) {
    if (!scene?.content?.trim()) continue;
    const placement = scene.placement;
    let mappedPlacement = placement;
    if (placement?.mode === 'anchored') {
      const anchor = idMap.get(placement.messageId);
      if (!anchor) continue;
      mappedPlacement = { mode: 'anchored', messageId: anchor };
    }
    if (placement?.mode === 'depth') mappedPlacement = { mode: 'depth', depth: Math.max(0, Math.trunc(placement.depth)) };
    if (placement?.mode === 'system-top') mappedPlacement = { mode: 'system-top' };
    if (!mappedPlacement) continue;
    ctx.repos.scenes.create({
      chatId: chat.id,
      title: asString(scene.title),
      content: scene.content,
      role: scene.role === 'user' || scene.role === 'assistant' ? scene.role : 'system',
      placement: mappedPlacement,
      lifetime: scene.lifetime === 'once' ? 'once' : 'persistent',
      enabled: scene.enabled !== false,
      sortOrder: Number.isFinite(scene.sortOrder) ? scene.sortOrder : 0,
    });
  }

  return getChatDetail(ctx, chat.id);
}
