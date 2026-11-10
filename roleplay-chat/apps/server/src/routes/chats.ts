import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { estimateTokens, type NormalizedError } from '@roleplay/core';
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
import type { AppContext, ActiveGeneration, PreparedGeneration } from '../types.js';

const createChatSchema = z.object({
  characterId: z.string().min(1),
  providerId: z.string().min(1).optional(),
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
  model: z.string().trim().max(200).optional(),
  params: paramsSchema.optional(),
});

const messageSchema = z.object({ content: z.string().min(1).max(20_000) });
const generateSchema = z.object({ parentMessageId: z.string().min(1).optional() });
const regenerateSchema = z.object({ messageId: z.string().min(1) });

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
};
