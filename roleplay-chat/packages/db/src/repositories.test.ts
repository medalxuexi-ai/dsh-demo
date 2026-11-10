import { describe, expect, it } from 'vitest';
import { ChatRepository, CharacterRepository, SceneRepository } from './repositories.js';
import { openDatabase } from './database.js';
import { DEFAULT_GENERATION_PARAMS } from '@roleplay/core';

describe('repositories', () => {
  it('creates a character, a chat and a message branch', () => {
    const db = openDatabase(':memory:');
    const characters = new CharacterRepository(db);
    const chats = new ChatRepository(db);

    const character = characters.create({
      name: '林晚',
      description: '咖啡馆老板',
      personality: '克制',
      scenario: '雨夜',
      firstMessage: '风铃响了。',
      systemPrompt: '',
    });
    expect(characters.list()).toHaveLength(1);

    const chat = chats.create({
      character,
      providerId: 'p1',
      title: '测试会话',
      model: 'mock',
      params: DEFAULT_GENERATION_PARAMS,
    });
    const first = chats.insertMessage({
      chatId: chat.id,
      parentId: null,
      role: 'assistant',
      content: '风铃响了。',
      status: 'complete',
      model: 'mock',
    });
    const second = chats.insertMessage({
      chatId: chat.id,
      parentId: first.id,
      role: 'user',
      content: '我推门进去。',
      status: 'complete',
      model: 'mock',
    });

    const branch = chats.messages(chat.id);
    expect(branch.map((message) => message.content)).toEqual(['风铃响了。', '我推门进去。']);
    expect(chats.getMessage(second.id)?.parentId).toBe(first.id);
    expect(chats.get(chat.id)?.activeLeafId).toBe(second.id);

    chats.updateMessage(second.id, { content: '我坐下了。', status: 'complete', finishReason: 'stop' });
    expect(chats.getMessage(second.id)?.content).toBe('我坐下了。');

    const scenes = new SceneRepository(db);
    const scene = scenes.create({
      chatId: chat.id,
      title: '停电',
      content: '灯灭了。',
      role: 'system',
      placement: { mode: 'anchored', messageId: second.id },
      lifetime: 'once',
      enabled: true,
      sortOrder: 0,
    });
    expect(scenes.list(chat.id)).toHaveLength(1);
    expect(scenes.get(scene.id)?.placement).toEqual({ mode: 'anchored', messageId: second.id });
    scenes.consume(scene.id);
    expect(scenes.get(scene.id)).toMatchObject({ enabled: false });
    expect(scenes.get(scene.id)?.consumedAt).toBeTruthy();
    scenes.remove(scene.id);
    expect(scenes.list(chat.id)).toHaveLength(0);
    db.close();
  });
});
