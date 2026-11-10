import { expandMacros } from './macros.js';
import { estimateMessagesTokens, estimateMessageTokens, estimateTokens } from './tokens.js';
import type {
  Character,
  ChatMessage,
  GenerationParams,
  StoredMessage,
} from './types.js';

export const DEFAULT_GENERATION_PARAMS: GenerationParams = {
  temperature: 0.8,
  topP: 0.95,
  maxTokens: 1024,
  presencePenalty: 0,
  frequencyPenalty: 0,
};

export const SAFETY_MARGIN_TOKENS = 512;
export const DEFAULT_CONTEXT_WINDOW = 8192;

const MAIN_PROMPT = [
  '你正在进行沉浸式角色扮演。',
  '请始终以角色身份回应，保持角色口吻、记忆与世界观；不要跳出角色解释自己，也不要替用户决定行动。',
  '回复使用中文，动作与神态可以用 *斜体* 或括号表示。',
].join('\n');

export interface BuildPromptInput {
  character: Character;
  history: StoredMessage[];
  params?: Partial<GenerationParams>;
  contextWindow?: number;
  userName?: string;
}

export interface PromptTrace {
  source: string;
  role: ChatMessage['role'];
  tokens: number;
}

export interface BuildPromptResult {
  messages: ChatMessage[];
  trace: PromptTrace[];
  estimatedTokens: number;
  budget: number;
  warnings: string[];
}

function normalizeParams(params?: Partial<GenerationParams>): GenerationParams {
  return { ...DEFAULT_GENERATION_PARAMS, ...params };
}

export function buildSystemPrompt(character: Character, userName = '你'): { content: string; warnings: string[] } {
  const macroCtx = {
    char: character.name,
    user: userName,
    description: character.description,
    personality: character.personality,
    scenario: character.scenario,
  };
  const warnings: string[] = [];
  const expand = (text: string) => {
    const result = expandMacros(text, macroCtx);
    for (const name of result.unknown) warnings.push(`未知宏 {{${name}}}`);
    return result.text;
  };

  const parts = [MAIN_PROMPT, `你扮演的角色是「${character.name}」。`];
  if (character.systemPrompt.trim()) parts.push(expand(character.systemPrompt.trim()));
  if (character.description.trim()) parts.push(`角色设定：\n${expand(character.description.trim())}`);
  if (character.personality.trim()) parts.push(`性格：\n${expand(character.personality.trim())}`);
  if (character.scenario.trim()) parts.push(`背景：\n${expand(character.scenario.trim())}`);
  parts.push('只输出角色视角的内容，不要输出“作为 AI”之类的说明。');

  return { content: parts.join('\n\n'), warnings };
}

export function buildPrompt(input: BuildPromptInput): BuildPromptResult {
  const params = normalizeParams(input.params);
  const { content: systemContent, warnings } = buildSystemPrompt(input.character, input.userName);

  const candidates = input.history.filter(
    (message) => message.role !== 'system' && message.status !== 'streaming' && message.content.trim().length > 0,
  );

  const systemTokens = estimateMessageTokens({ content: systemContent });
  const budget = Math.max(
    512,
    (input.contextWindow ?? DEFAULT_CONTEXT_WINDOW) - params.maxTokens - SAFETY_MARGIN_TOKENS,
  );

  const selected: StoredMessage[] = [];
  let used = systemTokens;
  let trimmed = 0;

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const message = candidates[i]!;
    const cost = estimateMessageTokens(message);
    // Always keep at least the last two messages, even when a single message is
    // larger than the budget; warn instead of silently producing an empty prompt.
    const mustKeep = selected.length < 2;
    if (!mustKeep && used + cost > budget) {
      trimmed += 1;
      continue;
    }
    selected.unshift(message);
    used += cost;
  }

  if (trimmed > 0) {
    warnings.push(`上下文接近上限，已省略最早 ${trimmed} 条消息`);
  }
  if (used > budget) {
    warnings.push('最近消息已超出预算，模型可能拒绝请求；请缩短提示词或提高上下文窗口');
  }

  const messages: ChatMessage[] = [{ role: 'system', content: systemContent }];
  for (const message of selected) {
    messages.push({ role: message.role, content: message.content });
  }

  const trace: PromptTrace[] = [
    { source: 'system', role: 'system', tokens: systemTokens },
    ...selected.map((message) => ({
      source: message.id,
      role: message.role,
      tokens: estimateTokens(message.content) + 4,
    })),
  ];

  return {
    messages,
    trace,
    estimatedTokens: estimateMessagesTokens(messages),
    budget,
    warnings,
  };
}
