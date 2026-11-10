import type { Character, GenerationParams, PublicProvider, StoredMessage } from '@roleplay/core';
import type { ChatDetail, ChatSummary, TestResult } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    throw new ApiError(payload.error?.message ?? `请求失败（${response.status}）`, payload.error?.code, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface GenerationHandlers {
  onMeta?: (meta: { generationId: string; messageId: string; model: string; warnings: string[] }) => void;
  onDelta?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onUsage?: (usage: { promptTokens?: number; completionTokens?: number }) => void;
  onDone?: (result: { finishReason: string }) => void;
  onError?: (error: { code: string; message: string }) => void;
}

async function readSSE(response: Response, handlers: GenerationHandlers): Promise<void> {
  if (!response.body) throw new ApiError('模型服务没有返回数据流');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const dispatch = (block: string) => {
    const lines = block.split('\n');
    let event = 'message';
    const data: string[] = [];
    for (const line of lines) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length === 0) return;
    let payload: any;
    try {
      payload = JSON.parse(data.join('\n'));
    } catch {
      return;
    }
    if (event === 'meta') handlers.onMeta?.(payload);
    else if (event === 'delta') handlers.onDelta?.(payload.text ?? '');
    else if (event === 'reasoning') handlers.onReasoning?.(payload.text ?? '');
    else if (event === 'usage') handlers.onUsage?.(payload);
    else if (event === 'done') handlers.onDone?.(payload);
    else if (event === 'error') handlers.onError?.(payload);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let index = buffer.indexOf('\n\n');
    while (index !== -1) {
      dispatch(buffer.slice(0, index));
      buffer = buffer.slice(index + 2);
      index = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) dispatch(buffer);
}

async function openGeneration(
  url: string,
  body: unknown,
  handlers: GenerationHandlers,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    throw new ApiError(payload.error?.message ?? `请求失败（${response.status}）`, payload.error?.code, response.status);
  }
  await readSSE(response, handlers);
}

export const api = {
  providers: {
    list: () => request<PublicProvider[]>('/api/providers'),
    create: (input: {
      name: string;
      baseUrl: string;
      apiKey: string;
      defaultModel: string;
      contextWindow?: number;
    }) => request<PublicProvider>('/api/providers', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: Partial<{
      name: string;
      baseUrl: string;
      apiKey: string;
      defaultModel: string;
      contextWindow: number;
    }>) => request<PublicProvider>(`/api/providers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: string) => request<void>(`/api/providers/${id}`, { method: 'DELETE' }),
    test: (id: string) => request<TestResult>(`/api/providers/${id}/test`, { method: 'POST' }),
    testDraft: (input: { baseUrl: string; apiKey: string; model?: string }) =>
      request<TestResult>('/api/providers/test', { method: 'POST', body: JSON.stringify(input) }),
  },
  characters: {
    list: () => request<Character[]>('/api/characters'),
    create: (input: Omit<Character, 'id' | 'createdAt' | 'updatedAt'>) =>
      request<Character>('/api/characters', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: Partial<Omit<Character, 'id' | 'createdAt' | 'updatedAt'>>) =>
      request<Character>(`/api/characters/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: string) => request<void>(`/api/characters/${id}`, { method: 'DELETE' }),
  },
  chats: {
    list: () => request<ChatSummary[]>('/api/chats'),
    create: (input: { characterId: string; providerId?: string; model?: string }) =>
      request<ChatDetail>('/api/chats', { method: 'POST', body: JSON.stringify(input) }),
    get: (id: string) => request<ChatDetail>(`/api/chats/${id}`),
    update: (id: string, input: { title?: string; providerId?: string; model?: string; params?: Partial<GenerationParams> }) =>
      request<ChatDetail>(`/api/chats/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: string) => request<void>(`/api/chats/${id}`, { method: 'DELETE' }),
    addMessage: (id: string, content: string) =>
      request<StoredMessage>(`/api/chats/${id}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),
    generate: (id: string, handlers: GenerationHandlers, signal: AbortSignal) =>
      openGeneration(`/api/chats/${id}/generate`, {}, handlers, signal),
    regenerate: (id: string, messageId: string, handlers: GenerationHandlers, signal: AbortSignal) =>
      openGeneration(`/api/chats/${id}/regenerate`, { messageId }, handlers, signal),
    cancel: (generationId: string) =>
      request<void>(`/api/generations/${generationId}/cancel`, { method: 'POST' }),
  },
};
