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

function mockProvider(body: string, _req: IncomingMessage, res: ServerResponse) {
  const parsed = JSON.parse(body) as { messages?: { content?: string }[] };
  const isSuggestion = parsed.messages?.some((message) => String(message.content).includes('编剧助手'));
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  if (isSuggestion) {
    const suggestions = [
      { dialogue: '我来晚了。', action: '推门进去，抖了抖伞。', expression: '有点心虚。' },
      { dialogue: '外面雨很大吧？' },
      { dialogue: '这杯我请。', action: '把伞靠在门边。' },
    ];
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(suggestions) } }] })}\n\n`);
    res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
    res.end('data: [DONE]\n\n');
    return;
  }
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
      mockProvider(body, req, res);
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

    const exportedResponse = await fetch(`${baseUrl}/api/characters/${(await (await fetch(`${baseUrl}/api/characters`)).json() as { id: string; name: string }[]).find((item) => item.name === '测试角色')!.id}/export`);
    expect(exportedResponse.status).toBe(200);
    const exported = (await exportedResponse.json()) as { spec: string; data: Record<string, unknown> };
    expect(exported.spec).toBe('chara_card_v2');
    expect(exported.data.name).toBe('测试角色');
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

  it('returns AI suggestions without adding messages to the chat', async () => {
    const chatId = (globalThis as { testChatId?: string }).testChatId!;
    const before = (await (await fetch(`${baseUrl}/api/chats/${chatId}`)).json()) as { messages: unknown[] };
    const response = await fetch(`${baseUrl}/api/chats/${chatId}/suggestions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ count: 3 }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { suggestions: { dialogue: string; action?: string; expression?: string }[] };
    expect(body.suggestions).toHaveLength(3);
    expect(body.suggestions[0]).toMatchObject({ dialogue: '我来晚了。', action: '推门进去，抖了抖伞。' });
    const after = (await (await fetch(`${baseUrl}/api/chats/${chatId}`)).json()) as { messages: unknown[] };
    expect(after.messages).toHaveLength(before.messages.length);
    const parsed = JSON.parse(capturedBody) as { messages: { content: string }[] };
    expect(parsed.messages.some((message) => message.content.includes('编剧助手'))).toBe(true);
    expect(parsed.messages.some((message) => message.content.includes('我推门进去'))).toBe(true);
  });

  it('inserts a one-shot scene into the prompt and consumes it after generation', async () => {
    const chatId = (globalThis as { testChatId?: string }).testChatId!;
    const sceneResponse = await fetch(`${baseUrl}/api/chats/${chatId}/scenes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '停电',
        content: '灯灭了，只有应急灯亮着。',
        placement: { mode: 'depth', depth: 0 },
        lifetime: 'once',
      }),
    });
    expect(sceneResponse.status).toBe(201);
    const scene = (await sceneResponse.json()) as { id: string; enabled: boolean };

    const preview = (await (await fetch(`${baseUrl}/api/chats/${chatId}/context-preview`)).json()) as {
      messages: { content: string }[];
      trace: { source: string }[];
    };
    expect(preview.messages.some((message) => message.content.includes('灯灭了'))).toBe(true);
    expect(preview.trace.some((entry) => entry.source === `scene:${scene.id}`)).toBe(true);

    await fetch(`${baseUrl}/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '我摸黑往前走。' }),
    });
    const generation = await fetch(`${baseUrl}/api/chats/${chatId}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    await generation.text();
    const parsed = JSON.parse(capturedBody) as { messages: { content: string }[] };
    expect(parsed.messages.some((message) => message.content.includes('灯灭了'))).toBe(true);

    const scenes = (await (await fetch(`${baseUrl}/api/chats/${chatId}/scenes`)).json()) as { id: string; enabled: boolean; consumedAt: string | null }[];
    const consumed = scenes.find((item) => item.id === scene.id);
    expect(consumed?.enabled).toBe(false);
    expect(consumed?.consumedAt).toBeTruthy();

    const after = (await (await fetch(`${baseUrl}/api/chats/${chatId}/context-preview`)).json()) as { messages: { content: string }[] };
    expect(after.messages.some((message) => message.content.includes('灯灭了'))).toBe(false);
  });

  it('includes the selected persona in the prompt', async () => {
    const chatId = (globalThis as { testChatId?: string }).testChatId!;
    const personaResponse = await fetch(`${baseUrl}/api/personas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '阿澈', description: '雨夜走进咖啡馆的旅人。' }),
    });
    expect(personaResponse.status).toBe(201);
    const persona = (await personaResponse.json()) as { id: string };

    const update = await fetch(`${baseUrl}/api/chats/${chatId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personaId: persona.id }),
    });
    expect(update.status).toBe(200);
    const detail = (await update.json()) as { chat: { personaId: string | null } };
    expect(detail.chat.personaId).toBe(persona.id);

    await fetch(`${baseUrl}/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '我找了个靠窗的位置。' }),
    });
    const generation = await fetch(`${baseUrl}/api/chats/${chatId}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    await generation.text();
    const parsed = JSON.parse(capturedBody) as { messages: { content: string }[] };
    expect(parsed.messages[0]?.content).toContain('阿澈');
    expect(parsed.messages[0]?.content).toContain('雨夜走进咖啡馆的旅人');
  });

  it('lists branches and switches the active leaf', async () => {
    const chatId = (globalThis as { testChatId?: string }).testChatId!;
    const initial = (await (await fetch(`${baseUrl}/api/chats/${chatId}`)).json()) as {
      chat: { activeLeafId: string | null };
      messages: { id: string; role: string }[];
    };
    const oldLeaf = initial.chat.activeLeafId!;
    const lastAssistant = [...initial.messages].reverse().find((message) => message.role === 'assistant')!;

    const regenerate = await fetch(`${baseUrl}/api/chats/${chatId}/regenerate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId: lastAssistant.id }),
    });
    await regenerate.text();

    const branches = (await (await fetch(`${baseUrl}/api/chats/${chatId}/branches`)).json()) as {
      activeLeafId: string;
      branches: { id: string }[];
    };
    expect(branches.branches.length).toBeGreaterThanOrEqual(2);
    expect(branches.activeLeafId).not.toBe(oldLeaf);

    const switched = await fetch(`${baseUrl}/api/chats/${chatId}/branches/switch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId: oldLeaf }),
    });
    expect(switched.status).toBe(200);
    const detail = (await switched.json()) as { chat: { activeLeafId: string } };
    expect(detail.chat.activeLeafId).toBe(oldLeaf);
  });

  it('exports and imports a session without provider secrets', async () => {
    const chatId = (globalThis as { testChatId?: string }).testChatId!;
    const exportResponse = await fetch(`${baseUrl}/api/chats/${chatId}/export`);
    expect(exportResponse.status).toBe(200);
    const exported = (await exportResponse.json()) as {
      version: number;
      chat: { title: string };
      activeLeafId: string | null;
      messages: { id: string; parentId: string | null; content: string }[];
      scenes: unknown[];
    };
    expect(exported.version).toBe(1);
    expect(JSON.stringify(exported)).not.toContain('sk-test-12345678');

    const importResponse = await fetch(`${baseUrl}/api/chats/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: exported }),
    });
    expect(importResponse.status).toBe(201);
    const imported = (await importResponse.json()) as {
      chat: { id: string; title: string; activeLeafId: string | null };
      messages: { content: string }[];
    };
    expect(imported.chat.id).not.toBe(chatId);
    expect(imported.chat.title).toBe(exported.chat.title);
    expect(imported.chat.activeLeafId).toBeTruthy();
    const byId = new Map(exported.messages.map((item) => [item.id, item]));
    let activeCount = 0;
    let cursor = exported.activeLeafId;
    while (cursor) {
      activeCount += 1;
      cursor = byId.get(cursor)?.parentId ?? null;
    }
    expect(imported.messages.length).toBe(activeCount);
    const importedScenes = (await (await fetch(`${baseUrl}/api/chats/${imported.chat.id}/scenes`)).json()) as unknown[];
    expect(importedScenes.length).toBe(exported.scenes.length);
  });
});
