import { randomUUID } from 'node:crypto';
import {
  buildPrompt,
  DEFAULT_GENERATION_PARAMS,
  estimateTokens,
  type GenerationParams,
  type StoredMessage,
} from '@roleplay/core';
import type { ChatRecord, ProviderRow } from '@roleplay/db';
import type { AppContext, PreparedGeneration } from '../types.js';
import { ApiError } from '../errors.js';
import { connectionFor, getProviderRow } from './providers.js';

export interface ChatSummary {
  id: string;
  title: string;
  characterId: string | null;
  characterName: string;
  providerId: string | null;
  providerName: string | null;
  model: string;
  preview: string;
  updatedAt: string;
}

export interface ChatDetail {
  chat: ChatRecord;
  messages: StoredMessage[];
}

export function toSummary(ctx: AppContext, chat: ChatRecord): ChatSummary {
  const provider = chat.providerId ? ctx.repos.providers.get(chat.providerId) : undefined;
  return {
    id: chat.id,
    title: chat.title,
    characterId: chat.characterId,
    characterName: chat.character.name,
    providerId: chat.providerId,
    providerName: provider?.name ?? null,
    model: chat.model,
    preview: (chat.lastMessagePreview ?? '').replace(/\s+/g, ' ').slice(0, 80),
    updatedAt: chat.lastMessageAt ?? chat.updatedAt,
  };
}

export function listChats(ctx: AppContext): ChatSummary[] {
  return ctx.repos.chats.list().map((chat) => toSummary(ctx, chat));
}

export function getChatDetail(ctx: AppContext, chatId: string): ChatDetail {
  const chat = ctx.repos.chats.get(chatId);
  if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
  return { chat, messages: ctx.repos.chats.messages(chatId, chat.activeLeafId) };
}

export function createChat(
  ctx: AppContext,
  input: { characterId: string; providerId?: string; personaId?: string | null; scriptId?: string; greetingIndex?: number; model?: string; title?: string },
): ChatDetail {
  const character = ctx.repos.characters.get(input.characterId);
  if (!character) throw new ApiError(404, 'NOT_FOUND', '角色不存在');
  const scriptId = input.scriptId ?? character.scriptId ?? undefined;
  const script = scriptId ? ctx.repos.scripts.get(scriptId) : undefined;
  if (scriptId && !script) throw new ApiError(404, 'NOT_FOUND', '剧本不存在');
  if (script && character.scriptId && character.scriptId !== script.id) {
    throw new ApiError(400, 'SCRIPT_MISMATCH', '角色不属于该剧本');
  }
  const provider = input.providerId
    ? getProviderRow(ctx, input.providerId)
    : ctx.repos.providers.list()[0];
  if (input.personaId && !ctx.repos.personas.get(input.personaId)) throw new ApiError(404, 'NOT_FOUND', '人设不存在');
  if (!provider) throw new ApiError(400, 'NO_PROVIDER', '请先在设置中配置一个模型服务');
  const model = input.model?.trim() || provider.default_model;
  const greetingIndex = input.greetingIndex ?? 0;
  const alternate = greetingIndex > 0 ? character.alternateGreetings?.[greetingIndex - 1] : undefined;
  if (greetingIndex > 0 && !alternate) throw new ApiError(400, 'INVALID_GREETING', '备选开场白不存在');
  const title = input.title?.trim() || `${script ? `${script.name} · ` : ''}${character.name}`;
  const chat = ctx.repos.chats.create({
    character,
    providerId: provider.id,
    personaId: input.personaId ?? null,
    scriptId: script?.id ?? null,
    scriptSnapshot: script ?? null,
    title,
    model,
    params: { ...DEFAULT_GENERATION_PARAMS },
  });

  if (script && (script.description.trim() || script.opening.trim())) {
    ctx.repos.scenes.create({
      chatId: chat.id,
      title: `剧本：${script.name}`,
      content: [script.description.trim(), script.opening.trim()].filter(Boolean).join('\n\n'),
      role: 'system',
      placement: { mode: 'system-top' },
      lifetime: 'persistent',
      enabled: true,
      sortOrder: 0,
    });
  }
  const greeting = alternate?.trim() || character.firstMessage.trim();
  if (greeting) {
    ctx.repos.chats.insertMessage({
      chatId: chat.id,
      parentId: null,
      role: 'assistant',
      content: greeting,
      status: 'complete',
      model,
      tokenCount: estimateTokens(greeting),
    });
  }

  return getChatDetail(ctx, chat.id);
}

export function updateChat(
  ctx: AppContext,
  chatId: string,
  input: {
    title?: string;
    providerId?: string;
    personaId?: string | null;
    model?: string;
    params?: Partial<GenerationParams>;
  },
): ChatDetail {
  const current = ctx.repos.chats.get(chatId);
  if (!current) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
  if (input.providerId) getProviderRow(ctx, input.providerId);
  if (input.personaId && !ctx.repos.personas.get(input.personaId)) throw new ApiError(404, 'NOT_FOUND', '人设不存在');
  const params = input.params ? { ...current.params, ...input.params } : undefined;
  const updated = ctx.repos.chats.update(chatId, {
    title: input.title?.trim(),
    providerId: input.providerId,
    personaId: input.personaId,
    model: input.model?.trim(),
    params,
  });
  if (!updated) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
  return getChatDetail(ctx, chatId);
}

export function deleteChat(ctx: AppContext, chatId: string): void {
  const chat = ctx.repos.chats.get(chatId);
  if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
  ctx.generations.cancelChat(chatId);
  ctx.repos.chats.remove(chatId);
}

export function addUserMessage(ctx: AppContext, chatId: string, content: string): StoredMessage {
  const chat = ctx.repos.chats.get(chatId);
  if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
  if (ctx.generations.has(chatId)) throw new ApiError(409, 'GENERATION_IN_PROGRESS', '请先停止当前生成');
  const text = content.trim();
  if (!text) throw new ApiError(400, 'INVALID_INPUT', '消息不能为空');
  if (text.length > 20_000) throw new ApiError(400, 'INVALID_INPUT', '消息过长');
  return ctx.repos.chats.insertMessage({
    chatId,
    parentId: chat.activeLeafId,
    role: 'user',
    content: text,
    status: 'complete',
    model: chat.model,
    tokenCount: estimateTokens(text),
  });
}

function prepare(
  ctx: AppContext,
  chat: ChatRecord,
  provider: ProviderRow,
  parentId: string | null,
  model: string,
): PreparedGeneration {
  const connection = connectionFor(ctx, provider);
  const history = ctx.repos.chats.messages(chat.id, parentId);
  const sceneList = ctx.repos.scenes.list(chat.id);
  const persona = chat.personaId ? ctx.repos.personas.get(chat.personaId) : undefined;
  const prompt = buildPrompt({
    character: chat.character,
    history,
    persona,
    scenes: sceneList,
    params: chat.params,
    contextWindow: provider.context_window ?? undefined,
  });
  const consumeSceneIds = sceneList
    .filter((scene) => scene.lifetime === 'once' && prompt.includedSceneIds.includes(scene.id))
    .map((scene) => scene.id);

  const message = ctx.repos.chats.insertMessage({
    chatId: chat.id,
    parentId,
    role: 'assistant',
    content: '',
    status: 'streaming',
    model,
  });

  return {
    generationId: randomUUID(),
    chat,
    message,
    prompt: {
      messages: prompt.messages,
      warnings: prompt.warnings,
      estimatedTokens: prompt.estimatedTokens,
    },
    connection,
    model,
    params: chat.params,
    consumeSceneIds,
  };
}

export function prepareGeneration(
  ctx: AppContext,
  chatId: string,
  parentMessageId?: string,
): PreparedGeneration {
  const chat = ctx.repos.chats.get(chatId);
  if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
  if (ctx.generations.has(chatId)) throw new ApiError(409, 'GENERATION_IN_PROGRESS', '当前会话正在生成');
  if (!chat.providerId) throw new ApiError(400, 'NO_PROVIDER', '请先在设置中配置一个模型服务');
  const provider = getProviderRow(ctx, chat.providerId);

  let parentId = parentMessageId ?? chat.activeLeafId;
  if (parentMessageId) {
    const parent = ctx.repos.chats.getMessage(parentMessageId);
    if (!parent || parent.chatId !== chatId) throw new ApiError(404, 'NOT_FOUND', '父消息不存在');
    parentId = parent.id;
  }
  return prepare(ctx, chat, provider, parentId, chat.model || provider.default_model);
}

export function prepareRegeneration(
  ctx: AppContext,
  chatId: string,
  messageId: string,
): PreparedGeneration {
  const chat = ctx.repos.chats.get(chatId);
  if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
  if (ctx.generations.has(chatId)) throw new ApiError(409, 'GENERATION_IN_PROGRESS', '当前会话正在生成');
  if (!chat.providerId) throw new ApiError(400, 'NO_PROVIDER', '请先在设置中配置一个模型服务');
  const target = ctx.repos.chats.getMessage(messageId);
  if (!target || target.chatId !== chatId) throw new ApiError(404, 'NOT_FOUND', '消息不存在');
  if (target.role !== 'assistant') throw new ApiError(400, 'INVALID_INPUT', '只能重新生成角色回复');
  const provider = getProviderRow(ctx, chat.providerId);
  return prepare(ctx, chat, provider, target.parentId, chat.model || provider.default_model);
}

