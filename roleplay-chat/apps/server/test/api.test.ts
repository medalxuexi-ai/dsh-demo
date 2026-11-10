import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let dataDir: string;
let baseUrl: string;
let mockServer: ReturnType<typeof createServer>;
let capturedBody = '';

function mockProvider(_req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write('data: {"choices":[{"delta":{"content":"雨"}}]}\n\n');
  res.write('data: {"choices":[{"delta":{"content":"还没停。"},"finish_reason":"stop"}]}\n\n');
  res.end('data: [DONE]\n\n');
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'roleplay-chat-test-'));
  mockServer = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      capturedBody = body;
      mockProvider(req, res);
    });
  });
  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const mockPort = (mockServer.address() as AddressInfo).port;

  const config = loadConfig({
    dataDir,
    dbFile: join(dataDir, 'app.db'),
    masterKeyPath: join(dataDir, '.master.key'),
    webDist: '',
    logger: false,
    logLevel: 'silent',
    port: 0,
  });
  app = await buildApp(config);
  await app.listen({ host: '127.0.0.1', port: 0 });
  baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  // Provider, chat and message setup uses the real HTTP API so the test covers
  // validation, persistence and the masked-key response together.
  const providerResponse = await fetch(`${baseUrl}/api/providers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Mock',
      baseUrl: `http://127.0.0.1:${mockPort}/v1`,
      apiKey: 'sk-test-12345678',
      defaultModel: 'mock-model',
      contextWindow: 8192,
    }),
  });
  expect(providerResponse.status).toBe(201);
  const provider = (await providerResponse.json()) as { id: string; apiKeyMasked: string };
  expect(provider.apiKeyMasked).toBe('sk-t…5678');
  expect(JSON.stringify(provider)).not.toContain('12345678');

  const characters = (await (await fetch(`${baseUrl}/api/characters`)).json()) as { id: string; name: string }[];
  expect(characters[0]?.name).toBe('林晚');

  const chatResponse = await fetch(`${baseUrl}/api/chats`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ characterId: characters[0]!.id, providerId: provider.id }),
  });
  expect(chatResponse.status).toBe(201);
  const chat = (await chatResponse.json()) as { chat: { id: string }; messages: unknown[] };
  expect(chat.messages).toHaveLength(1);
  expect(chat.chat.id).toBeTruthy();

  // Keep the chat id for the generation test through a module-level variable.
  (globalThis as { testChatId?: string }).testChatId = chat.chat.id;
});

afterAll(async () => {
  await app?.close();
  await new Promise<void>((resolve) => mockServer?.close(() => resolve()));
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('roleplay-chat API', () => {
  it('returns masked providers and persists characters', async () => {
    const providers = (await (await fetch(`${baseUrl}/api/providers`)).json()) as { apiKeyMasked: string }[];
    expect(providers).toHaveLength(1);
    expect(providers[0]?.apiKeyMasked).toContain('…');
    expect(JSON.stringify(providers)).not.toContain('sk-test-12345678');

    const created = await fetch(`${baseUrl}/api/characters`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '测试角色', description: '一个用于测试的角色' }),
    });
    expect(created.status).toBe(201);
    const character = (await created.json()) as { name: string };
    expect(character.name).toBe('测试角色');
  });

  it('streams a generated assistant message into the branch', async () => {
    const chatId = (globalThis as { testChatId?: string }).testChatId!;
    const userResponse = await fetch(`${baseUrl}/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '我推门进去。' }),
    });
    expect(userResponse.status).toBe(201);

    const response = await fetch(`${baseUrl}/api/chats/${chatId}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('event: meta');
    expect(stream).toContain('event: delta');
    expect(stream).toContain('雨');
    expect(stream).toContain('event: done');

    const parsedBody = JSON.parse(capturedBody) as { messages: { role: string; content: string }[] };
    expect(parsedBody.messages[0]?.role).toBe('system');
    expect(parsedBody.messages[0]?.content).toContain('林晚');

    const detail = (await (await fetch(`${baseUrl}/api/chats/${chatId}`)).json()) as {
      messages: { role: string; content: string; status: string }[];
    };
    expect(detail.messages).toHaveLength(3);
    expect(detail.messages.at(-1)).toMatchObject({ role: 'assistant', status: 'complete' });
    expect(detail.messages.at(-1)?.content).toBe('雨还没停。');
  });
});
