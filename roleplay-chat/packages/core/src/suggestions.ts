import { estimateMessagesTokens, estimateTokens } from './tokens.js';
import type { Character, ChatMessage, Persona, StoredMessage } from './types.js';

export interface SuggestionParts {
  dialogue: string;
  action?: string;
  expression?: string;
}

export interface SuggestionPromptInput {
  character: Character;
  persona?: Persona;
  history: StoredMessage[];
  count?: number;
  contextWindow?: number;
}

export interface SuggestionPromptResult {
  messages: ChatMessage[];
  warnings: string[];
}

const MAX_HISTORY_MESSAGES = 24;
const OUTPUT_RESERVE = 1600;

function clampCount(value?: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.trunc(value!)));
}

/**
 * Build a dedicated prompt for the "what might the user send next?" helper.
 * It deliberately does not use the roleplay system prompt: the helper must
 * describe the user's options, not answer as the character.
 */
export function buildSuggestionPrompt(input: SuggestionPromptInput): SuggestionPromptResult {
  const count = clampCount(input.count);
  const warnings: string[] = [];
  const characterParts = [`角色名：${input.character.name}`];
  if (input.persona) characterParts.push(`用户人设：${input.persona.name}${input.persona.description.trim() ? `\n${input.persona.description.trim()}` : ''}`);
  if (input.character.description.trim()) characterParts.push(`角色设定：${input.character.description.trim()}`);
  if (input.character.personality.trim()) characterParts.push(`性格：${input.character.personality.trim()}`);
  if (input.character.scenario.trim()) characterParts.push(`背景：${input.character.scenario.trim()}`);
  const characterBlock = characterParts.join('\n');

  const system = [
    '你是角色扮演的编剧助手，不参与扮演，也不要替角色回复。',
    `任务：根据角色卡和最近对话，推测「用户」接下来可能发送的内容，给出 ${count} 条方向不同、符合当前情境的建议。`,
    '每条建议包含：',
    '- dialogue：用户说出口的话（必填，自然口语）',
    '- action：用户做的动作（可空，简短）',
    '- expression：用户的神态或心理（可空，简短）',
    '三条建议分别偏向：主动推进剧情、观察或试探、表达情绪或关系。',
    '不要续写角色台词，不要解释，不要输出 Markdown；只输出 JSON 数组，例如：',
    '[{"dialogue":"……","action":"……","expression":"……"}]',
    '',
    characterBlock,
  ].join('\n');

  const recent = input.history
    .filter((message) => message.role !== 'system' && message.content.trim() && message.status !== 'streaming')
    .slice(-MAX_HISTORY_MESSAGES);

  let selected = recent;
  const budget = Math.max(1800, Math.min(input.contextWindow ?? 8192, 14_000) - OUTPUT_RESERVE);
  const renderTranscript = (messages: StoredMessage[]): string =>
    messages
      .map((message) => {
        const speaker = message.role === 'user' ? '用户' : `角色（${input.character.name}）`;
        return `${speaker}：${message.content.trim().slice(0, 1200)}`;
      })
      .join('\n');

  let transcript = renderTranscript(selected);
  const systemTokens = estimateTokens(system);
  while (selected.length > 0 && systemTokens + estimateTokens(transcript) > budget) {
    selected = selected.slice(1);
    warnings.push('对话过长，AI 推荐只参考了最近的部分内容');
    transcript = renderTranscript(selected);
  }

  const user = [
    selected.length > 0 ? `最近对话：\n${transcript}` : '当前还没有对话，请基于角色卡给出开场建议。',
    '',
    `请给出 ${count} 条用户可以发送的内容，只返回 JSON 数组。`,
  ].join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  if (estimateMessagesTokens(messages) > budget) {
    warnings.push('参考上下文已压缩到预算内');
  }
  return { messages, warnings: [...new Set(warnings)] };
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function parseSuggestions(raw: string, limit = 3): SuggestionParts[] {
  const text = raw.replace(/```json/gi, '```').replace(/```/g, '').trim();
  if (!text) return [];

  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  let parsed: unknown;

  try {
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      parsed = JSON.parse(text.slice(arrayStart, arrayEnd + 1));
    } else if (objectStart !== -1 && objectEnd > objectStart) {
      parsed = JSON.parse(text.slice(objectStart, objectEnd + 1));
    } else {
      return [];
    }
  } catch {
    return [];
  }

  let items: unknown[] = [];
  if (Array.isArray(parsed)) items = parsed;
  else if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.suggestions)) items = record.suggestions;
    else if (record.dialogue) items = [record];
  }

  const suggestions: SuggestionParts[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const dialogue = clip(record.dialogue, 600);
    if (!dialogue || seen.has(dialogue)) continue;
    seen.add(dialogue);
    suggestions.push({
      dialogue,
      ...(clip(record.action, 400) ? { action: clip(record.action, 400) } : {}),
      ...(clip(record.expression, 400) ? { expression: clip(record.expression, 400) } : {}),
    });
    if (suggestions.length >= Math.min(5, Math.max(1, limit))) break;
  }
  return suggestions;
}
