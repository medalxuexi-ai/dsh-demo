import { buildMemoryPrompt, type NormalizedError } from '@roleplay/core';
import { streamChat } from '@roleplay/adapters';
import type { AppContext } from '../types.js';
import { ApiError } from '../errors.js';
import { connectionFor, getProviderRow } from './providers.js';

const KEEP_RECENT = 8;

export interface MemorySummaryResult {
  summary: string;
  throughMessageId: string;
  coveredCount: number;
}

export async function summarizeChat(ctx: AppContext, chatId: string): Promise<MemorySummaryResult> {
  const chat = ctx.repos.chats.get(chatId);
  if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
  if (!chat.providerId) throw new ApiError(400, 'NO_PROVIDER', '请先配置模型服务');
  if (ctx.generations.has(chatId)) throw new ApiError(409, 'GENERATION_IN_PROGRESS', '当前会话正在生成');

  const history = ctx.repos.chats.messages(chatId, chat.activeLeafId)
    .filter((message) => message.role !== 'system' && message.content.trim() && message.status !== 'streaming');
  const cutoff = history.length - KEEP_RECENT - 1;
  if (cutoff < 0) {
    throw new ApiError(400, 'MEMORY_TOO_SHORT', `至少需要 ${KEEP_RECENT + 2} 条消息才能整理前情`);
  }

  let start = 0;
  if (chat.memory?.throughMessageId) {
    const covered = history.findIndex((message) => message.id === chat.memory!.throughMessageId);
    if (covered >= 0) start = covered + 1;
  }
  if (start > cutoff) throw new ApiError(400, 'MEMORY_UP_TO_DATE', '前情已经是最新，没有新的早期消息');

  const provider = getProviderRow(ctx, chat.providerId);
  const connection = connectionFor(ctx, provider);
  const messages = history.slice(start, cutoff + 1);
  const prompt = buildMemoryPrompt({
    character: chat.character,
    messages,
    existingSummary: chat.memory?.summary,
  });

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 60_000);
  let text = '';
  let streamError: NormalizedError | undefined;
  try {
    for await (const chunk of streamChat(
      connection,
      {
        model: chat.model || provider.default_model,
        messages: prompt,
        temperature: 0.3,
        topP: 0.9,
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
  }
  if (timedOut) throw new ApiError(504, 'MEMORY_TIMEOUT', '整理前情超时，请重试');
  if (streamError) throw new ApiError(502, streamError.code, streamError.message);
  const summary = text.trim();
  if (!summary) throw new ApiError(502, 'MEMORY_INVALID', '模型没有返回摘要，请重试');

  const through = history[cutoff]!;
  ctx.repos.chats.updateMemory(chatId, summary, through.id);
  return { summary, throughMessageId: through.id, coveredCount: cutoff + 1 };
}

export function updateMemory(ctx: AppContext, chatId: string, summary: string): MemorySummaryResult {
  const chat = ctx.repos.chats.get(chatId);
  if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
  if (!chat.memory) throw new ApiError(400, 'MEMORY_NOT_FOUND', '还没有前情摘要');
  const text = summary.trim();
  if (!text) throw new ApiError(400, 'INVALID_INPUT', '摘要不能为空');
  ctx.repos.chats.updateMemory(chatId, text, chat.memory.throughMessageId);
  return { summary: text, throughMessageId: chat.memory.throughMessageId, coveredCount: 0 };
}

export function clearMemory(ctx: AppContext, chatId: string): void {
  const chat = ctx.repos.chats.get(chatId);
  if (!chat) throw new ApiError(404, 'NOT_FOUND', '会话不存在');
  ctx.repos.chats.clearMemory(chatId);
}
