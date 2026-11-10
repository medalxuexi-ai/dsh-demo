import type {
  ChatChunk,
  ChatMessage,
  ModelInfo,
  NormalizedError,
  ProviderConnection,
} from '@roleplay/core';
import { normalizeHttpError, normalizeThrown } from './errors.js';
import { iterateSSE } from './sse.js';

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stop?: string[];
}

export interface TestResult {
  ok: boolean;
  latencyMs?: number;
  models?: ModelInfo[];
  error?: NormalizedError;
}

function endpoint(baseUrl: string, path: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (path === '/chat/completions' && trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}${path}`;
}

function headers(connection: ProviderConnection): Record<string, string> {
  const result: Record<string, string> = { 'content-type': 'application/json' };
  if (connection.apiKey.trim()) result.authorization = `Bearer ${connection.apiKey.trim()}`;
  return { ...result, ...(connection.extraHeaders ?? {}) };
}

async function readBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 4000);
  } catch {
    return '';
  }
}

function parseModels(payload: unknown): ModelInfo[] {
  const root = payload as { data?: unknown; models?: unknown };
  const raw = Array.isArray(root.data) ? root.data : Array.isArray(root.models) ? root.models : [];
  return raw.flatMap((item): ModelInfo[] => {
    if (typeof item === 'string') return [{ id: item }];
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : undefined;
    if (!id) return [];
    return [{
      id,
      name: typeof record.name === 'string' ? record.name : undefined,
      contextWindow: typeof record.context_window === 'number'
        ? record.context_window
        : typeof record.contextWindow === 'number' ? record.contextWindow : undefined,
      maxOutput: typeof record.max_output === 'number' ? record.max_output : undefined,
    }];
  });
}

export async function listModels(connection: ProviderConnection, signal?: AbortSignal): Promise<ModelInfo[]> {
  const response = await fetch(endpoint(connection.baseUrl, '/models'), {
    headers: headers(connection),
    signal: signal ?? AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw normalizeHttpError(response.status, await readBody(response));
  return parseModels(await response.json());
}

export async function testConnection(connection: ProviderConnection, model?: string): Promise<TestResult> {
  const started = Date.now();
  try {
    const models = await listModels(connection);
    return { ok: true, latencyMs: Date.now() - started, models };
  } catch (error) {
    const normalized: NormalizedError =
      error && typeof error === 'object' && 'code' in error
        ? (error as NormalizedError)
        : normalizeThrown(error);
    // Some gateways do not expose /models. Fall back to a tiny chat request if
    // we know which model to try, so the "test" button still means something.
    if (model && normalized.code === 'PROVIDER_UNAVAILABLE' && normalized.status === 404) {
      try {
        const response = await fetch(endpoint(connection.baseUrl, '/chat/completions'), {
          method: 'POST',
          headers: headers(connection),
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
            stream: false,
          }),
          signal: AbortSignal.timeout(25_000),
        });
        if (!response.ok) return { ok: false, latencyMs: Date.now() - started, error: normalizeHttpError(response.status, await readBody(response)) };
        return { ok: true, latencyMs: Date.now() - started };
      } catch (fallbackError) {
        return { ok: false, latencyMs: Date.now() - started, error: normalizeThrown(fallbackError) };
      }
    }
    return { ok: false, latencyMs: Date.now() - started, error: normalized };
  }
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function* streamChat(
  connection: ProviderConnection,
  request: ChatRequest,
  signal: AbortSignal,
): AsyncGenerator<ChatChunk> {
  const body = {
    model: request.model,
    messages: request.messages,
    stream: true,
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.topP === undefined ? {} : { top_p: request.topP }),
    ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
    ...(request.presencePenalty === undefined ? {} : { presence_penalty: request.presencePenalty }),
    ...(request.frequencyPenalty === undefined ? {} : { frequency_penalty: request.frequencyPenalty }),
    ...(request.stop?.length ? { stop: request.stop } : {}),
  };

  let response: Response | undefined;
  let lastError: NormalizedError | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(endpoint(connection.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: headers(connection),
        body: JSON.stringify(body),
        signal,
      });
      if (response.ok) break;
      if (isRetryable(response.status) && attempt < 2) {
        lastError = normalizeHttpError(response.status, await readBody(response));
        response = undefined;
        await sleep(500 * 2 ** attempt);
        continue;
      }
      lastError = normalizeHttpError(response.status, await readBody(response));
      response = undefined;
      break;
    } catch (error) {
      lastError = normalizeThrown(error, signal);
      if (lastError.code === 'CANCELLED') {
        yield { type: 'finish', reason: 'cancelled' };
        return;
      }
      if (attempt < 2 && lastError.retryable) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      break;
    }
  }

  if (!response) {
    yield { type: 'error', error: lastError ?? { code: 'UNKNOWN', message: '模型请求失败', retryable: false } };
    return;
  }

  let finishReason: 'stop' | 'length' = 'stop';
  try {
    if (!response.body) {
      yield { type: 'error', error: { code: 'PROVIDER_RESPONSE_INVALID', message: '上游没有返回响应流', retryable: false } };
      return;
    }
    for await (const event of iterateSSE(response.body)) {
      if (signal.aborted) {
        yield { type: 'finish', reason: 'cancelled' };
        return;
      }
      if (event.data === '[DONE]') break;
      let payload: any;
      try {
        payload = JSON.parse(event.data);
      } catch {
        continue;
      }
      if (payload?.error) {
        yield {
          type: 'error',
          error: {
            code: 'PROVIDER_RESPONSE_INVALID',
            message: payload.error.message ?? '上游返回错误',
            retryable: false,
          },
        };
        return;
      }
      if (payload?.usage) {
        yield {
          type: 'usage',
          promptTokens: payload.usage.prompt_tokens,
          completionTokens: payload.usage.completion_tokens,
        };
      }
      const choice = payload?.choices?.[0];
      const delta = choice?.delta;
      if (typeof delta?.reasoning_content === 'string' && delta.reasoning_content) {
        yield { type: 'reasoning', text: delta.reasoning_content };
      }
      if (typeof delta?.content === 'string' && delta.content) {
        yield { type: 'text', text: delta.content };
      }
      if (choice?.finish_reason) {
        finishReason = choice.finish_reason === 'length' ? 'length' : 'stop';
      }
    }
    if (signal.aborted) {
      yield { type: 'finish', reason: 'cancelled' };
      return;
    }
    yield { type: 'finish', reason: finishReason };
  } catch (error) {
    if (signal.aborted) {
      yield { type: 'finish', reason: 'cancelled' };
      return;
    }
    yield { type: 'error', error: normalizeThrown(error) };
  }
}
