import type { Character, ChatMemory, GenerationParams, Persona, SceneDirective, Script, StoredMessage } from '@roleplay/core';

export interface ProviderRow {
  id: string;
  name: string;
  kind: string;
  base_url: string;
  api_key_encrypted: string;
  default_model: string;
  context_window: number | null;
  extra_headers: string | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterRow {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_message: string;
  system_prompt: string;
  script_id: string | null;
  example_dialogue: string;
  alternate_greetings: string | null;
  tags: string | null;
  raw_extensions: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatRow {
  id: string;
  character_id: string | null;
  character_snapshot: string;
  provider_id: string | null;
  persona_id: string | null;
  script_id: string | null;
  script_snapshot: string | null;
  memory_summary: string | null;
  memory_through_message_id: string | null;
  memory_updated_at: string | null;
  title: string;
  model: string;
  params: string;
  active_leaf_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface MessageRow {
  id: string;
  chat_id: string;
  parent_id: string | null;
  role: string;
  content: string;
  status: string;
  model: string;
  token_count: number;
  finish_reason: string | null;
  usage_json: string | null;
  created_at: string;
}

export interface ChatRecord {
  id: string;
  characterId: string | null;
  character: Character;
  providerId: string | null;
  personaId: string | null;
  scriptId: string | null;
  script: Script | null;
  memory: ChatMemory | null;
  title: string;
  model: string;
  params: GenerationParams;
  activeLeafId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

export function rowToCharacter(row: CharacterRow): Character {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    personality: row.personality,
    scenario: row.scenario,
    firstMessage: row.first_message,
    systemPrompt: row.system_prompt,
    scriptId: row.script_id,
    exampleDialogue: row.example_dialogue ?? '',
    alternateGreetings: parseStringArray(row.alternate_greetings),
    tags: parseStringArray(row.tags),
    rawExtensions: parseObject(row.raw_extensions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    parentId: row.parent_id,
    role: row.role as StoredMessage['role'],
    content: row.content,
    status: row.status as StoredMessage['status'],
    model: row.model,
    tokenCount: row.token_count,
    createdAt: row.created_at,
  };
}

export function rowToChat(row: ChatRow & { last_content?: string | null }): ChatRecord {
  return {
    id: row.id,
    characterId: row.character_id,
    character: JSON.parse(row.character_snapshot) as Character,
    providerId: row.provider_id,
    personaId: row.persona_id,
    scriptId: row.script_id,
    script: row.script_snapshot ? JSON.parse(row.script_snapshot) as Script : null,
    memory: row.memory_summary && row.memory_through_message_id
      ? { summary: row.memory_summary, throughMessageId: row.memory_through_message_id, updatedAt: row.memory_updated_at ?? '' }
      : null,
    title: row.title,
    model: row.model,
    params: JSON.parse(row.params) as GenerationParams,
    activeLeafId: row.active_leaf_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_content ?? null,
  };
}

export interface SceneRow {
  id: string;
  chat_id: string;
  title: string;
  content: string;
  role: string;
  placement_mode: string;
  depth: number;
  anchor_message_id: string | null;
  sort_order: number;
  lifetime: string;
  enabled: number;
  consumed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToScene(row: SceneRow): SceneDirective {
  const placement: SceneDirective['placement'] = row.placement_mode === 'system-top'
    ? { mode: 'system-top' }
    : row.placement_mode === 'anchored'
      ? { mode: 'anchored', messageId: row.anchor_message_id ?? '' }
      : { mode: 'depth', depth: row.depth };
  return {
    id: row.id,
    chatId: row.chat_id,
    title: row.title,
    content: row.content,
    role: row.role as SceneDirective['role'],
    placement,
    lifetime: row.lifetime as SceneDirective['lifetime'],
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface PersonaRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export function rowToPersona(row: PersonaRow): Persona {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export interface ScriptRow {
  id: string;
  name: string;
  description: string;
  opening: string;
  created_at: string;
  updated_at: string;
}

export function rowToScript(row: ScriptRow): Script {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    opening: row.opening,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface WorldInfoRow {
  id: string;
  script_id: string | null;
  character_id: string | null;
  uid: number;
  name: string;
  keys: string;
  secondary_keys: string;
  content: string;
  enabled: number;
  constant: number;
  selective: number;
  case_sensitive: number;
  match_whole_words: number;
  sort_order: number;
  position: number;
  depth: number;
  role: number;
  scan_depth: number;
  probability: number;
  raw_json: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToWorldInfo(row: WorldInfoRow): import('@roleplay/core').WorldInfoEntry {
  const parseArray = (value: string): string[] => {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  };
  let raw: Record<string, unknown> | null = null;
  if (row.raw_json) {
    try {
      const parsed: unknown = JSON.parse(row.raw_json);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
    } catch {
      raw = null;
    }
  }
  return {
    id: row.id,
    scriptId: row.script_id,
    characterId: row.character_id,
    uid: row.uid,
    name: row.name,
    keys: parseArray(row.keys),
    secondaryKeys: parseArray(row.secondary_keys),
    content: row.content,
    enabled: row.enabled === 1,
    constant: row.constant === 1,
    selective: row.selective === 1,
    caseSensitive: row.case_sensitive === 1,
    matchWholeWords: row.match_whole_words === 1,
    order: row.sort_order,
    position: row.position,
    depth: row.depth,
    role: row.role,
    scanDepth: row.scan_depth,
    probability: row.probability,
    raw,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
