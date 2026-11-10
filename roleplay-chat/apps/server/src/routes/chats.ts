import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { buildPrompt, buildSuggestionPrompt, estimateTokens, parseSuggestions, type NormalizedError } from '@roleplay/core';
import { streamChat } from '@roleplay/adapters';
import { parse } from '../validation.js';
import { ApiError } from '../errors.js';
import {
  addUserMessage,
  createChat,
  deleteChat,
  getChatDetail,
  listChats,
  prepareGeneration,
  prepareRegeneration,
  updateChat,
} from '../services/chats.js';
import { connectionFor, getProviderRow } from '../services/providers.js';
import { exportChat, importChat } from '../services/sessions.js';
import type { AppContext, ActiveGeneration, PreparedGeneration } from '../types.js';

const createChatSchema = z.object({
  characterId: z.string().min(1),
  providerId: z.string().min(1).optional(),
  personaId: z.string().min(1).nullable().optional(),
  scriptId: z.string().min(1).optional(),
  model: z.string().trim().max(200).optional(),
  title: z.string().trim().max(200).optional(),
});

const paramsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().min(1).max(200_000).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  stop: z.array(z.string().max(200)).max(4).optional(),
});

const updateChatSchema = z.object({
  title: z.string().trim().max(200).optional(),
  providerId: z.string().min(1).optional(),
  personaId: z.string().min(1).nullable().optional(),
  scriptId: z.string().min(1).optional(),
  model: z.string().trim().max(200).optional(),
  params: paramsSchema.optional(),
});

const messageSchema = z.object({ content: z.string().min(1).max(20_000) });
const generateSchema = z.object({ parentMessageId: z.string().min(1).optional() });
const regenerateSchema = z.object({ messageId: z.string().min(1) });
const suggestSchema = z.object({ count: z.number().int().min(1).max(5).optional() });
const branchSwitchSchema = z.object({ messageId: z.string().min(1) });
const importSchema = z.object({ data: z.unknown(), providerId: z.string().min(1).optional() });

function sseWrite(reply: FastifyReply, event: string, data: unknown): void {
  if (reply.raw.writableEnded || reply.raw.destroyed) return;
  try {
    reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // The client may have disconnected; the generation loop will notice.
  }
}

async function streamGeneration(
  app: { ctx: AppContext },
  request: FastifyRequest,
  reply: FastifyReply,
  prepared: PreparedGeneration,
): Promise<void> {
  const ctx = app.ctx;
  const generation: ActiveGeneration = {
    id: prepared.generationId,
    chatId: prepared.chat.id,
    messageId: prepared.message.id,
    controller: new AbortController(),
  };
  try {
    ctx.generations.start(generation);
  } catch {
    throw new ApiError(409, 'GENERATION_IN_PROGRESS', '当前会话正在生成');
  }

  reply.hijack();
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });

  let finished = false;
  let disconnected = false;
  reply.raw.on('close', () => {
    if (!finished) {
      disconnected = true;
      generation.controller.abort();
    }
  });

  sseWrite(reply, 'meta', {
    generationId: generation.id,
    messageId: prepared.message.id,
    model: prepared.model,
    warnings: prepared.prompt.warnings,
  });

  let content = '';
  let finishReason: 'stop' | 'length' | 'cancelled' | 'error' = 'stop';
  let streamError: NormalizedError | undefined;
  let usage: { promptTokens?: number; completionTokens?: number } | undefined;
  let lastPersist = 0;

  const persist = (force = false) => {
    const timestamp = Date.now();
    if (!force && timestamp - lastPersist < 400) return;
    lastPersist = timestamp;
    ctx.repos.chats.updateMessage(prepared.message.id, {
      content,
      status: 'streaming',
      tokenCount: estimateTokens(content),
    });
  };

  try {
    for await (const chunk of streamChat(
      prepared.connection,
      {
        model: prepared.model,
        messages: prepared.prompt.messages,
        temperature: prepared.params.temperature,
        topP: prepared.params.topP,
        maxTokens: prepared.params.maxTokens,
        presencePenalty: prepared.params.presencePenalty,
        frequencyPenalty: prepared.params.frequencyPenalty,
        stop: prepared.params.stop,
      },
      generation.controller.signal,
    )) {
      if (chunk.type === 'text') {
        content += chunk.text;
        sseWrite(reply, 'delta', { text: chunk.text });
        persist();
      } else if (chunk.type === 'reasoning') {
        sseWrite(reply, 'reasoning', { text: chunk.text });
      } else if (chunk.type === 'usage') {
        usage = { promptTokens: chunk.promptTokens, completionTokens: chunk.completionTokens };
        sseWrite(reply, 'usage', usage);
      } else if (chunk.type === 'finish') {
        finishReason = chunk.reason;
      } else if (chunk.type === 'error') {
        streamError = chunk.error;
        break;
      }
    }
  } catch (error) {
    streamError = {
      code: 'UNKNOWN',
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
    };
  }

  finished = true;
  ctx.generations.finish(generation);

  const cancelled = finishReason === 'cancelled' || disconnected;
  const status = streamError ? 'error' : cancelled ? 'cancelled' : 'complete';
  ctx.repos.chats.updateMessage(prepared.message.id, {
    content,
    status,
    finishReason: streamError ? 'error' : cancelled ? 'cancelled' : finishReason,
    tokenCount: estimateTokens(content),
    usage,
  });
  ctx.repos.chats.touch(prepared.chat.id);
  if (!streamError && !cancelled) {
    for (const sceneId of prepared.consumeSceneIds) ctx.repos.scenes.consume(sceneId);
  }

  if (streamError) {
    sseWrite(reply, 'error', streamError);
  } else {
    sseWrite(reply, 'done', { finishReason: cancelled ? 'cancelled' : finishReason, usage });
  }

  try {
    reply.raw.end();
  } catch {
    // ignore disconnected clients
  }

  request.log.info({ chatId: prepared.chat.id, messageId: prepared.message.id, chars: content.length }, 'generation finished');
}

export const chatsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/chats', async () => listChats(app.ctx));

  app.post('/chats', async (request, reply) => {
    const input = parse(createChatSchema, request.body);
    reply.status(201).send(createChat(app.ctx, input));
  });

  app.get('/chats/:id', async (request) => {
    const { id } = request.params as { id: string };
    return getChatDetail(app.ctx, id);
  });

  app.patch('/chats/:id', async (request) => {
    const { id } = request.params as { id: string };
    return updateChat(app.ctx, id, parse(updateChatSchema, request.body));
  });

  app.delete('/chats/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    deleteChat(app.ctx, id);
    reply.status(204).send();
  });

  app.get('/chats/:id/messages', async (request) => {
    const { id } = request.params as { id: string };
    return getChatDetail(app.ctx, id).messages;
  });

  app.post('/chats/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = parse(messageSchema, request.body);
    reply.status(201).send(addUserMessage(app.ctx, id, input.content));
  });

  app.post('/chats/:id/generate', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (app.ctx.generations.has(id)) throw new ApiError(409, 'GENERATION_IN_PROGRESS', '当前会话正在生成');
    const input = parse(generateSchema, request.body ?? {});
    const prepared = prepareGeneration(app.ctx, id, input.parentMessageId);
    await streamGeneration(app, request, reply, prepared);
    return reply;
  });

  app.post('/chats/:id/regenerate', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (app.ctx.generations.has(id)) throw new ApiError(409, 'GENERATION_IN_PROGRESS', '当前会话正在生成');
    const input = parse(regenerateSchema, request.body);
    const prepared = prepareRegeneration(app.ctx, id, input.messageId);
    await streamGeneration(app, request, reply, prepared);
    return reply;
  });

  app.post('/generations/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const cancelled = app.ctx.generations.cancel(id);
    if (!cancelled) throw new ApiError(404, 'NOT_FOUND', '生成任务不存在或已结束');
    reply.status(204).send();
  });

  app.get('/chats/:id/export', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = exportChat(app.ctx, id);
    reply.header('content-disposition', `attachment; filename="${encodeURIComponent(data.chat.title)}.json"`);
    return data;
  });

  app.post('/chats/import', { bodyLimit: 20 * 1024 * 1024 }, async (request, reply) => {
    const input = parse(importSchema, request.body);
    reply.status(201).send(importChat(app.ctx, input.data, input.providerId));
  });

  app.get('/chats/:id/branches', async (request) => {
    const { id } = request.params as { id: string };
    const chat = app.ctx.repos.chats.get(id);
    if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    return {
      activeLeafId: chat.activeLeafId,
      branches: app.ctx.repos.chats.leaves(id).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        status: message.status,
        createdAt: message.createdAt,
      })),
    };
  });

  app.post('/chats/:id/branches/switch', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(branchSwitchSchema, request.body);
    const chat = app.ctx.repos.chats.setActiveLeaf(id, input.messageId);
    if (!chat) throw new ApiError(404, 'NOT_FOUND', '分支消息不存在或不属于该会话');
    return getChatDetail(app.ctx, id);
  });

  app.get('/chats/:id/context-preview', async (request) => {
    const { id } = request.params as { id: string };
    const chat = app.ctx.repos.chats.get(id);
    if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    if (!chat.providerId) throw new ApiError(400, 'NO_PROVIDER', '请先在设置中配置一个模型服务');
    const provider = getProviderRow(app.ctx, chat.providerId);
    const persona = chat.personaId ? app.ctx.repos.personas.get(chat.personaId) : undefined;
    const prompt = buildPrompt({
      character: chat.character,
      history: app.ctx.repos.chats.messages(id, chat.activeLeafId),
      persona,
      scenes: app.ctx.repos.scenes.list(id),
      params: chat.params,
      contextWindow: provider.context_window ?? undefined,
    });
    return {
      model: chat.model || provider.default_model,
      budget: prompt.budget,
      estimatedTokens: prompt.estimatedTokens,
      messages: prompt.messages,
      trace: prompt.trace,
      warnings: prompt.warnings,
    };
  });

  app.post('/chats/:id/suggestions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = parse(suggestSchema, request.body ?? {});
    const chat = app.ctx.repos.chats.get(id);
    if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    if (app.ctx.generations.has(id)) throw new ApiError(409, 'GENERATION_IN_PROGRESS', '当前会话正在生成');
    if (!chat.providerId) throw new ApiError(400, 'NO_PROVIDER', '请先在设置中配置一个模型服务');
    const provider = getProviderRow(app.ctx, chat.providerId);
    const connection = connectionFor(app.ctx, provider);
    const count = input.count ?? 3;
    const suggestionPersona = chat.personaId ? app.ctx.repos.personas.get(chat.personaId) : undefined;
    const prompt = buildSuggestionPrompt({
      character: chat.character,
      persona: suggestionPersona,
      history: app.ctx.repos.chats.messages(id, chat.activeLeafId),
      count,
      contextWindow: provider.context_window ?? undefined,
    });

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60_000);
    const onClose = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    reply.raw.once('close', onClose);

    let text = '';
    let streamError: NormalizedError | undefined;
    try {
      for await (const chunk of streamChat(
        connection,
        {
          model: chat.model || provider.default_model,
          messages: prompt.messages,
          temperature: 0.9,
          topP: 0.95,
          maxTokens: 1200,
        },
        controller.signal,
      )) {
        if (chunk.type === 'text') text += chunk.text;
        else if (chunk.type === 'error') {
          streamError = chunk.error;
          break;
        }
      }
    } finally {
      clearTimeout(timeout);
      reply.raw.off('close', onClose);
    }

    if (timedOut) throw new ApiError(504, 'SUGGESTION_TIMEOUT', 'AI 推荐超时，请重试');
    if (reply.raw.destroyed) return { suggestions: [] };
    if (streamError) throw new ApiError(502, streamError.code, streamError.message);
    const suggestions = parseSuggestions(text, count);
    if (suggestions.length === 0) {
      throw new ApiError(502, 'SUGGESTION_INVALID', '模型没有返回可用的建议，请重试');
    }
    return { suggestions, warnings: prompt.warnings };
  });
};
