import { describe, expect, it } from 'vitest';
import { normalizeCharacterCard, parseCharacterCardBuffer } from './character-card.js';

const card = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: '林晚',
    description: '咖啡馆老板',
    personality: '克制',
    scenario: '雨夜',
    first_mes: '风铃响了。',
    system_prompt: '保持克制。',
    mes_example: '{{user}}：你好',
    alternate_greetings: ['雨很大。'],
    tags: ['日常'],
  },
};

function pngWithCard(value: unknown, keyword = 'chara'): ArrayBuffer {
  const json = JSON.stringify(value);
  const base64 = Buffer.from(json, 'utf8').toString('base64');
  const chunkData = Buffer.from(`${keyword}\0${base64}`, 'utf8');
  const out = Buffer.alloc(8 + 12 + 4 + chunkData.length + 12);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(out, 0);
  out.writeUInt32BE(chunkData.length, 8);
  out.write('tEXt', 12, 'ascii');
  chunkData.copy(out, 16);
  // CRC is intentionally left zero: the parser only reads the length/type/data.
  out.writeUInt32BE(0, 16 + chunkData.length);
  out.writeUInt32BE(0, 20 + chunkData.length);
  out.write('IEND', 24 + chunkData.length, 'ascii');
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

describe('character cards', () => {
  it('normalizes a V2 card and folds example dialogue into the system prompt', () => {
    const parsed = normalizeCharacterCard(card);
    expect(parsed).toMatchObject({ name: '林晚', firstMessage: '风铃响了。' });
    expect(parsed.systemPrompt).toContain('示例对话');
    expect(parsed.alternateGreetings).toEqual(['雨很大。']);
  });

  it('reads a V2 card from a PNG tEXt chunk', () => {
    expect(parseCharacterCardBuffer(pngWithCard(card)).name).toBe('林晚');
  });

  it('rejects JSON without a name', () => {
    expect(() => normalizeCharacterCard({ description: '没有名字' })).toThrow('角色名');
  });
});
