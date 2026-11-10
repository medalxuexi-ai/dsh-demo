import { describe, expect, it } from 'vitest';
import { buildSuggestionPrompt, parseSuggestions } from './suggestions.js';
import type { Character, StoredMessage } from './types.js';

const character: Character = {
  id: 'c1',
  name: '林晚',
  description: '咖啡馆老板',
  personality: '克制',
  scenario: '雨夜',
  firstMessage: '',
  systemPrompt: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const history: StoredMessage[] = [
  { id: 'm1', chatId: 'c', parentId: null, role: 'assistant', content: '风铃响了。', status: 'complete', model: 'm', tokenCount: 0, createdAt: '' },
  { id: 'm2', chatId: 'c', parentId: 'm1', role: 'user', content: '我推门进去。', status: 'complete', model: 'm', tokenCount: 0, createdAt: '' },
];

describe('buildSuggestionPrompt', () => {
  it('asks for JSON suggestions and includes character/history', () => {
    const { messages } = buildSuggestionPrompt({ character, history, count: 3 });
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain('编剧助手');
    expect(messages[0]?.content).toContain('林晚');
    expect(messages[0]?.content).toContain('JSON');
    expect(messages[1]?.content).toContain('我推门进去');
  });
});

describe('parseSuggestions', () => {
  it('parses a fenced JSON array with prose around it', () => {
    const raw = '好的，给你三个方向：\n```json\n[{"dialogue":"我来晚了。","action":"推门","expression":"心虚"},{"dialogue":"外面雨很大。"}]\n```';
    expect(parseSuggestions(raw)).toEqual([
      { dialogue: '我来晚了。', action: '推门', expression: '心虚' },
      { dialogue: '外面雨很大。' },
    ]);
  });

  it('accepts an object with suggestions and deduplicates', () => {
    expect(parseSuggestions('{"suggestions":[{"dialogue":"A"},{"dialogue":"A"},{"dialogue":"B"}]}', 5)).toEqual([
      { dialogue: 'A' },
      { dialogue: 'B' },
    ]);
  });

  it('returns an empty list for unusable output', () => {
    expect(parseSuggestions('抱歉，我无法完成')).toEqual([]);
  });
});
