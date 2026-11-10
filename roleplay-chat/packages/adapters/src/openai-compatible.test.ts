import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChatChunk } from '@roleplay/core';
import { listModels, streamChat, testConnection } from './openai-compatible.js';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.length = 0;
});

async function mockServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return `http://127.0.0.1:${port}/v1`;
}

async function collect(stream: AsyncGenerator<ChatChunk>): Promise<ChatChunk[]> {
  const chunks: ChatChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe('openai-compatible adapter', () => {
  it('streams text, usage and finish', async () => {
    const baseUrl = await mockServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: {"choices":[{"delta":{"content":"你"}}]}\n\n');
        res.write('data: {"choices":[{"delta":{"content":"好"},"finish_reason":null}]}\n\n');
        res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n');
        res.end('data: [DONE]\n\n');
        return;
      }
      res.writeHead(404).end();
    });

    const chunks = await collect(streamChat(
      { baseUrl, apiKey: 'test-key' },
      { model: 'deepseek-v4.1-flash', messages: [{ role: 'user', content: '你好' }] },
      new AbortController().signal,
    ));

    expect(chunks.filter((chunk) => chunk.type === 'text').map((chunk) => chunk.text)).toEqual(['你', '好']);
    expect(chunks).toContainEqual({ type: 'usage', promptTokens: 10, completionTokens: 2 });
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: 'stop' });
  });

  it('maps 401 to PROVIDER_AUTH', async () => {
    const baseUrl = await mockServer((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'invalid key' } }));
    });
    const chunks = await collect(streamChat(
      { baseUrl, apiKey: 'bad' },
      { model: 'm', messages: [{ role: 'user', content: 'x' }] },
      new AbortController().signal,
    ));
    expect(chunks[0]).toMatchObject({ type: 'error', error: { code: 'PROVIDER_AUTH', retryable: false } });
  });

  it('lists models and tests a connection', async () => {
    const baseUrl = await mockServer((req, res) => {
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'deepseek-v4.1-flash', context_window: 1000000 }] }));
        return;
      }
      res.writeHead(404).end();
    });
    await expect(listModels({ baseUrl, apiKey: 'test' }, AbortSignal.timeout(2000))).resolves.toEqual([
      { id: 'deepseek-v4.1-flash', name: undefined, contextWindow: 1000000, maxOutput: undefined },
    ]);
    const result = await testConnection({ baseUrl, apiKey: 'test' });
    expect(result.ok).toBe(true);
    expect(result.models?.[0]?.id).toBe('deepseek-v4.1-flash');
  });
});
