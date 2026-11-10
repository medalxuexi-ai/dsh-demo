import { expandMacros } from './macros.js';
import { estimateMessagesTokens, estimateMessageTokens, estimateTokens } from './tokens.js';
import type {
  Character,
  ChatMessage,
  GenerationParams,
  Persona,
  SceneDirective,
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
  scenes?: SceneDirective[];
  persona?: Persona;
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
  includedSceneIds: string[];
}

function normalizeParams(params?: Partial<GenerationParams>): GenerationParams {
  return { ...DEFAULT_GENERATION_PARAMS, ...params };
}

export function buildSystemPrompt(character: Character, userName = '你', persona?: Persona): { content: string; warnings: string[] } {
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
  if (character.exampleDialogue?.trim()) parts.push(`示例对话：\n${expand(character.exampleDialogue.trim())}`);
  if (persona) {
    parts.push(`用户人设：${persona.name}${persona.description.trim() ? `\n${persona.description.trim()}` : ''}`);
  }
  parts.push('只输出角色视角的内容，不要输出“作为 AI”之类的说明。');

  return { content: parts.join('\n\n'), warnings };
}

function sortScenes(scenes: FormattedScene[]): FormattedScene[] {
  return [...scenes].sort((a, b) => a.scene.sortOrder - b.scene.sortOrder || a.scene.createdAt.localeCompare(b.scene.createdAt));
}

interface FormattedScene {
  scene: SceneDirective;
  text: string;
  tokens: number;
}

function formatScene(scene: SceneDirective, character: Character, userName: string, warnings: string[]): FormattedScene {
  const expanded = expandMacros(scene.content, {
    char: character.name,
    user: userName,
    description: character.description,
    personality: character.personality,
    scenario: character.scenario,
  });
  for (const name of expanded.unknown) warnings.push(`场景「${scene.title || scene.id}」含未知宏 {{${name}}}`);
  const title = scene.title.trim() ? `标题：${scene.title.trim()}\n` : '';
  const text = [
    '【场景说明｜导演指令】',
    '以下是舞台说明，不是角色台词。请在这个设定下继续叙事，不要直接复述本段内容。',
    `${title}${expanded.text.trim()}`,
  ].join('\n');
  return { scene, text, tokens: estimateTokens(text) + 4 };
}

export function buildPrompt(input: BuildPromptInput): BuildPromptResult {
  const params = normalizeParams(input.params);
  const userName = input.persona?.name || input.userName || '你';
  const { content: baseSystem, warnings } = buildSystemPrompt(input.character, userName, input.persona);
  const scenes = (input.scenes ?? [])
    .filter((scene) => scene.enabled && scene.content.trim().length > 0)
    .map((scene) => formatScene(scene, input.character, userName, warnings));

  const systemTop = sortScenes(scenes.filter((scene) => scene.scene.placement.mode === 'system-top'));
  const systemContent = [baseSystem, ...systemTop.map((scene) => scene.text)].join('\n\n');
  const systemTokens = estimateMessageTokens({ content: systemContent });

  const dynamicScenes = scenes.filter((scene) => scene.scene.placement.mode !== 'system-top');
  const sceneTokens = dynamicScenes.reduce((sum, scene) => sum + scene.tokens, 0);

  const candidates = input.history.filter(
    (message) => message.role !== 'system' && message.status !== 'streaming' && message.content.trim().length > 0,
  );

  const budget = Math.max(
    512,
    (input.contextWindow ?? DEFAULT_CONTEXT_WINDOW) - params.maxTokens - SAFETY_MARGIN_TOKENS,
  );

  const selected: StoredMessage[] = [];
  let used = systemTokens + sceneTokens;
  let trimmed = 0;

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const message = candidates[i]!;
    const cost = estimateMessageTokens(message);
    const mustKeep = selected.length < 2;
    if (!mustKeep && used + cost > budget) {
      trimmed += 1;
      continue;
    }
    selected.unshift(message);
    used += cost;
  }

  if (trimmed > 0) warnings.push(`上下文接近上限，已省略最早 ${trimmed} 条消息`);
  if (used > budget) warnings.push('最近消息已超出预算，模型可能拒绝请求；请缩短提示词、关闭场景或提高上下文窗口');

  const selectedIds = new Set(selected.map((message) => message.id));
  const byDepth = new Map<number, FormattedScene[]>();
  const byAnchor = new Map<string, FormattedScene[]>();
  const includedSceneIds = new Set(systemTop.map((scene) => scene.scene.id));

  for (const scene of dynamicScenes) {
    const placement = scene.scene.placement;
    if (placement.mode === 'anchored') {
      if (selectedIds.has(placement.messageId)) {
        const list = byAnchor.get(placement.messageId) ?? [];
        list.push(scene);
        byAnchor.set(placement.messageId, list);
      } else {
        warnings.push(`场景「${scene.scene.title || scene.scene.id}」的锚点消息已不在上下文内，本轮已跳过`);
      }
      continue;
    }
    if (placement.mode === 'depth') {
      const depth = Math.max(0, Math.min(selected.length, Math.trunc(placement.depth)));
      if (depth !== placement.depth) {
        warnings.push(`场景「${scene.scene.title || scene.scene.id}」的深度超出范围，已收敛到 ${depth}`);
      }
      const list = byDepth.get(depth) ?? [];
      list.push(scene);
      byDepth.set(depth, list);
    }
  }

  const messages: ChatMessage[] = [{ role: 'system', content: systemContent }];
  const trace: PromptTrace[] = [{ source: 'system', role: 'system', tokens: systemTokens }];

  const pushScene = (scene: FormattedScene) => {
    messages.push({ role: scene.scene.role, content: scene.text });
    trace.push({ source: `scene:${scene.scene.id}`, role: scene.scene.role, tokens: scene.tokens });
    includedSceneIds.add(scene.scene.id);
  };

  for (let i = 0; i < selected.length; i += 1) {
    const message = selected[i]!;
    const depth = selected.length - i;
    for (const scene of sortScenes(byDepth.get(depth) ?? [])) pushScene(scene);
    messages.push({ role: message.role, content: message.content });
    trace.push({ source: message.id, role: message.role, tokens: estimateTokens(message.content) + 4 });
    for (const scene of sortScenes(byAnchor.get(message.id) ?? [])) pushScene(scene);
  }

  for (const scene of sortScenes(byDepth.get(0) ?? [])) pushScene(scene);

  return {
    messages,
    trace,
    estimatedTokens: estimateMessagesTokens(messages),
    budget,
    warnings,
    includedSceneIds: [...includedSceneIds],
  };
}
