export interface ParsedCharacterCard {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  systemPrompt: string;
  exampleDialogue: string;
  alternateGreetings: string[];
  tags: string[];
  rawExtensions: Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function cardData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('角色卡不是有效的 JSON 对象');
  const root = value as Record<string, unknown>;
  const spec = asString(root.spec);
  if (root.data && typeof root.data === 'object' && spec.startsWith('chara_card')) {
    return root.data as Record<string, unknown>;
  }
  return root;
}

export function normalizeCharacterCard(value: unknown): ParsedCharacterCard {
  const data = cardData(value);
  const name = asString(data.name).trim();
  if (!name) throw new Error('角色卡缺少角色名');

  let systemPrompt = asString(data.system_prompt) || asString(data.systemPrompt);
  const postHistory = asString(data.post_history_instructions);
  if (postHistory) systemPrompt = [systemPrompt, postHistory].filter(Boolean).join('\n\n');
  return {
    name,
    description: asString(data.description),
    personality: asString(data.personality),
    scenario: asString(data.scenario),
    firstMessage: asString(data.first_mes) || asString(data.firstMessage),
    systemPrompt,
    exampleDialogue: asString(data.mes_example) || asString(data.example_dialogue),
    alternateGreetings: asStringArray(data.alternate_greetings),
    tags: asStringArray(data.tags),
    rawExtensions: { ...data },
  };
}

export function buildCharacterCardV2(character: import('./types.js').Character): Record<string, unknown> {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      ...(character.rawExtensions ?? {}),
      name: character.name,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      first_mes: character.firstMessage,
      system_prompt: character.systemPrompt,
      mes_example: character.exampleDialogue ?? '',
      alternate_greetings: character.alternateGreetings ?? [],
      tags: character.tags ?? [],
    },
  };
}

function decodeBase64Text(input: string): string {
  const normalized = input.replace(/\s+/g, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Read a SillyTavern V2/V3 character card from a PNG tEXt chunk or a JSON file. */
export function parseCharacterCardBuffer(buffer: ArrayBuffer): ParsedCharacterCard {
  const bytes = new Uint8Array(buffer);
  const isPng = bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;

  if (!isPng) {
    const text = new TextDecoder().decode(bytes).trim();
    if (!text) throw new Error('角色卡文件为空');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('无法解析角色卡 JSON');
    }
    return normalizeCharacterCard(parsed);
  }

  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;
    if (type === 'tEXt') {
      const data = bytes.slice(dataStart, dataEnd);
      const nullIndex = data.indexOf(0);
      if (nullIndex > 0) {
        const keyword = decoder.decode(data.slice(0, nullIndex));
        if (keyword === 'chara' || keyword === 'ccv3') {
          const encoded = decoder.decode(data.slice(nullIndex + 1));
          try {
            return normalizeCharacterCard(JSON.parse(decodeBase64Text(encoded)));
          } catch {
            throw new Error('PNG 角色卡数据无法解析');
          }
        }
      }
    }
    offset = dataEnd + 4;
  }
  throw new Error('PNG 中没有找到角色卡数据（chara / ccv3）');
}
