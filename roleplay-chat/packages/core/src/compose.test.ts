import { describe, expect, it } from 'vitest';
import { composeUserMessage } from './compose.js';

describe('composeUserMessage', () => {
  it('keeps a pure dialogue natural', () => {
    expect(composeUserMessage({ dialogue: '  你也在等雨停吗？ ' })).toBe('你也在等雨停吗？');
  });

  it('labels scenes, actions, expressions and dialogue', () => {
    expect(composeUserMessage({
      scene: '雨夜，咖啡馆',
      action: '推开门',
      expression: '有些心虚',
      dialogue: '我来晚了。',
    })).toBe('【场景】雨夜，咖啡馆\n【动作】推开门\n【表情】有些心虚\n【对话】我来晚了。');
  });

  it('drops empty fields and returns an empty string when nothing is filled', () => {
    expect(composeUserMessage({ scene: '  ', dialogue: '' })).toBe('');
    expect(composeUserMessage({ action: ' 坐下 ' })).toBe('【动作】坐下');
  });
});
