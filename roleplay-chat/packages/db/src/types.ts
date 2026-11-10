import type { Character, GenerationParams, StoredMessage } from '@roleplay/core';

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
  created_at: string;
  updated_at: string;
}

export interface ChatRow {
  id: string;
  character_id: string | null;
  character_snapshot: string;
  provider_id: string | null;
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
