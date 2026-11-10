import { describe, expect, it } from 'vitest';
import { buildMemoryPrompt, buildPrompt, buildSystemPrompt, DEFAULT_CONTEXT_WINDOW } from './prompt.js';
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

describe('scene assembly', () => {
  const scenes = [
    {
      id: 's1', chatId: 'chat', title: '叙事风格', content: '第二人称，克制。', role: 'system' as const,
      placement: { mode: 'system-top' as const }, lifetime: 'persistent' as const, enabled: true, sortOrder: 0,
      consumedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 's2', chatId: 'chat', title: '停电', content: '灯灭了。', role: 'system' as const,
      placement: { mode: 'anchored' as const, messageId: 'm1' }, lifetime: 'persistent' as const, enabled: true, sortOrder: 0,
      consumedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 's3', chatId: 'chat', title: '单轮', content: '这一轮让她道歉。', role: 'system' as const,
      placement: { mode: 'depth' as const, depth: 0 }, lifetime: 'once' as const, enabled: true, sortOrder: 0,
      consumedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  it('places system-top, anchored and depth scenes at the expected positions', () => {
    const result = buildPrompt({
      character,
      history: [message('m1', 'assistant', '风铃响了。'), message('m2', 'user', '我推门进去。')],
      scenes,
    });
    expect(result.messages[0]?.role).toBe('system');
    expect(result.messages[0]?.content).toContain('第二人称');
    expect(result.messages.findIndex((item) => item.content.includes('灯灭了'))).toBe(2);
    expect(result.messages.at(-1)?.content).toContain('这一轮让她道歉');
    expect(result.includedSceneIds).toEqual(expect.arrayContaining(['s1', 's2', 's3']));
  });

  it('skips disabled and orphaned scenes with a warning', () => {
    const result = buildPrompt({
      character,
      history: [message('m1', 'assistant', '风铃响了。')],
      scenes: [
        { ...scenes[1]!, placement: { mode: 'anchored', messageId: 'missing' } },
        { ...scenes[2]!, enabled: false },
      ],
    });
    expect(result.messages.some((item) => item.content.includes('灯灭了'))).toBe(false);
    expect(result.messages.some((item) => item.content.includes('这一轮让她道歉'))).toBe(false);
    expect(result.warnings.join('')).toContain('锚点消息');
  });
});

it('includes the selected user persona', () => {
  const result = buildPrompt({
    character,
    history: [message('m1', 'assistant', '风铃响了。')],
    persona: {
      id: 'p1', name: '阿澈', description: '雨夜走进咖啡馆的旅人。',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
  });
  expect(result.messages[0]?.content).toContain('阿澈');
  expect(result.messages[0]?.content).toContain('雨夜走进咖啡馆的旅人');
});

describe('chat memory', () => {
  it('injects the summary and skips messages covered by it', () => {
    const result = buildPrompt({
      character,
      history: [
        message('m1', 'assistant', '风铃响了。'),
        message('m2', 'user', '我推门进去。'),
        message('m3', 'assistant', '她抬起头。'),
      ],
      memory: {
        summary: '你雨夜走进咖啡馆，林晚给你留了位置。',
        throughMessageId: 'm1',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(result.messages[0]?.content).toContain('前情摘要');
    expect(result.messages[0]?.content).toContain('林晚给你留了位置');
    expect(result.messages.some((item) => item.content === '风铃响了。')).toBe(false);
    expect(result.messages.some((item) => item.content === '我推门进去。')).toBe(true);
  });

  it('builds a summary prompt with the transcript', () => {
    const messages2 = [message('m1', 'assistant', '风铃响了。'), message('m2', 'user', '我推门进去。')];
    const prompt = buildMemoryPrompt({ character, messages: messages2 });
    expect(prompt[0]?.content).toContain('前情摘要');
    expect(prompt[1]?.content).toContain('我推门进去');
  });
});
