import { describe, expect, it } from 'vitest';
import { buildPrompt, buildSystemPrompt, DEFAULT_CONTEXT_WINDOW } from './prompt.js';
import { expandMacros } from './macros.js';
import { estimateTokens } from './tokens.js';
import type { Character, StoredMessage } from './types.js';

const character: Character = {
  id: 'c1',
  name: '林晚',
  description: '{{char}}是旧城咖啡馆的老板。',
  personality: '克制，敏锐',
  scenario: '雨夜',
  firstMessage: '风铃响了。',
  systemPrompt: '称呼用户为 {{user}}。',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function message(id: string, role: 'user' | 'assistant', content: string, parentId: string | null = null): StoredMessage {
  return { id, chatId: 'chat', parentId, role, content, status: 'complete', model: 'm', tokenCount: 0, createdAt: '2026-01-01T00:00:00.000Z' };
}

describe('macros', () => {
  it('expands known macros and reports unknown ones', () => {
    const result = expandMacros('{{char}} / {{user}} / {{unknown}}', { char: '林晚', user: '阿岚' });
    expect(result.text).toBe('林晚 / 阿岚 / {{unknown}}');
    expect(result.unknown).toEqual(['unknown']);
  });
});

describe('tokens', () => {
  it('estimates Chinese more heavily than ASCII', () => {
    expect(estimateTokens('你好世界')).toBeGreaterThan(estimateTokens('abcd'));
  });
});

describe('buildSystemPrompt', () => {
  it('includes character fields and expands macros', () => {
    const { content, warnings } = buildSystemPrompt(character, '阿岚');
    expect(content).toContain('你扮演的角色是「林晚」');
    expect(content).toContain('阿岚');
    expect(content).toContain('旧城咖啡馆');
    expect(content).toContain('雨夜');
    expect(warnings).toEqual([]);
  });
});

describe('buildPrompt', () => {
  it('puts system first and keeps history', () => {
    const result = buildPrompt({
      character,
      history: [message('m1', 'assistant', '风铃响了。'), message('m2', 'user', '我推门进去。')],
    });
    expect(result.messages[0]?.role).toBe('system');
    expect(result.messages.at(-1)?.content).toBe('我推门进去。');
    expect(result.warnings).toEqual([]);
  });

  it('trims oldest messages when over budget', () => {
    const longHistory = Array.from({ length: 30 }, (_, index) =>
      message(`m${index}`, index % 2 === 0 ? 'user' : 'assistant', '很长的一段对话内容。'.repeat(80)),
    );
    const result = buildPrompt({
      character,
      history: longHistory,
      contextWindow: 1200,
      params: { maxTokens: 256 },
    });
    expect(result.messages.length).toBeLessThan(longHistory.length + 1);
    expect(result.warnings.join('')).toContain('省略');
    expect(result.estimatedTokens).toBeLessThan(10_000);
    expect(result.budget).toBeLessThan(DEFAULT_CONTEXT_WINDOW);
  });

  it('does not include streaming or empty messages', () => {
    const streaming = { ...message('m3', 'assistant', '正在输入'), status: 'streaming' as const };
    const result = buildPrompt({
      character,
      history: [message('m1', 'user', '你好'), streaming, message('m4', 'assistant', '  ')],
    });
    expect(result.messages).toHaveLength(2);
    expect(result.messages.at(-1)?.content).toBe('你好');
    expect(result.messages.some((m) => m.content === '正在输入')).toBe(false);
  });
});
