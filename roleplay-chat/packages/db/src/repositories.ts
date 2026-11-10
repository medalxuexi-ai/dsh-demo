import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Character, GenerationParams, Persona, SceneDirective, StoredMessage } from '@roleplay/core';
import type { ChatRecord, CharacterRow, ChatRow, MessageRow, PersonaRow, ProviderRow, SceneRow } from './types.js';
import { rowToCharacter, rowToChat, rowToMessage, rowToPersona, rowToScene } from './types.js';

const now = () => new Date().toISOString();
const id = () => randomUUID();

export class ProviderRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(): ProviderRow[] {
    return this.db.prepare('SELECT * FROM providers ORDER BY updated_at DESC').all() as unknown as ProviderRow[];
  }

  get(providerId: string): ProviderRow | undefined {
    return this.db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId) as unknown as ProviderRow | undefined;
  }

  create(input: {
    name: string;
    baseUrl: string;
    apiKeyEncrypted: string;
    defaultModel: string;
    contextWindow?: number;
    extraHeaders?: Record<string, string>;
  }): ProviderRow {
    const providerId = id();
    const timestamp = now();
    this.db.prepare(`INSERT INTO providers
      (id, name, kind, base_url, api_key_encrypted, default_model, context_window, extra_headers, created_at, updated_at)
      VALUES (?, ?, 'openai-compatible', ?, ?, ?, ?, ?, ?, ?)`).run(
      providerId,
      input.name,
      input.baseUrl,
      input.apiKeyEncrypted,
      input.defaultModel,
      input.contextWindow ?? null,
      input.extraHeaders ? JSON.stringify(input.extraHeaders) : null,
      timestamp,
      timestamp,
    );
    return this.get(providerId)!;
  }

  update(providerId: string, patch: {
    name?: string;
    baseUrl?: string;
    apiKeyEncrypted?: string;
    defaultModel?: string;
    contextWindow?: number | null;
    extraHeaders?: Record<string, string> | null;
  }): ProviderRow | undefined {
    const current = this.get(providerId);
    if (!current) return undefined;
    this.db.prepare(`UPDATE providers SET
      name = ?, base_url = ?, api_key_encrypted = ?, default_model = ?, context_window = ?, extra_headers = ?, updated_at = ?
      WHERE id = ?`).run(
      patch.name ?? current.name,
      patch.baseUrl ?? current.base_url,
      patch.apiKeyEncrypted ?? current.api_key_encrypted,
      patch.defaultModel ?? current.default_model,
      patch.contextWindow === undefined ? current.context_window : patch.contextWindow,
      patch.extraHeaders === undefined ? current.extra_headers : patch.extraHeaders === null ? null : JSON.stringify(patch.extraHeaders),
      now(),
      providerId,
    );
    return this.get(providerId);
  }

  remove(providerId: string): void {
    this.db.prepare('DELETE FROM providers WHERE id = ?').run(providerId);
  }
}

export class CharacterRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(): Character[] {
    return (this.db.prepare('SELECT * FROM characters ORDER BY updated_at DESC').all() as unknown as CharacterRow[]).map(rowToCharacter);
  }

  get(characterId: string): Character | undefined {
    const row = this.db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId) as unknown as CharacterRow | undefined;
    return row ? rowToCharacter(row) : undefined;
  }

  create(input: Omit<Character, 'id' | 'createdAt' | 'updatedAt'>): Character {
    const characterId = id();
    const timestamp = now();
    this.db.prepare(`INSERT INTO characters
      (id, name, description, personality, scenario, first_message, system_prompt, example_dialogue, alternate_greetings, tags, raw_extensions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      characterId,
      input.name,
      input.description,
      input.personality,
      input.scenario,
      input.firstMessage,
      input.systemPrompt,
      input.exampleDialogue ?? '',
      JSON.stringify(input.alternateGreetings ?? []),
      JSON.stringify(input.tags ?? []),
      input.rawExtensions ? JSON.stringify(input.rawExtensions) : null,
      timestamp,
      timestamp,
    );
    return this.get(characterId)!;
  }

  update(characterId: string, patch: Partial<Omit<Character, 'id' | 'createdAt' | 'updatedAt'>>): Character | undefined {
    const current = this.get(characterId);
    if (!current) return undefined;
    this.db.prepare(`UPDATE characters SET
      name = ?, description = ?, personality = ?, scenario = ?, first_message = ?, system_prompt = ?, example_dialogue = ?, alternate_greetings = ?, tags = ?, raw_extensions = ?, updated_at = ?
      WHERE id = ?`).run(
      patch.name ?? current.name,
      patch.description ?? current.description,
      patch.personality ?? current.personality,
      patch.scenario ?? current.scenario,
      patch.firstMessage ?? current.firstMessage,
      patch.systemPrompt ?? current.systemPrompt,
      patch.exampleDialogue ?? current.exampleDialogue ?? '',
      JSON.stringify(patch.alternateGreetings ?? current.alternateGreetings ?? []),
      JSON.stringify(patch.tags ?? current.tags ?? []),
      patch.rawExtensions === undefined
        ? (current.rawExtensions ? JSON.stringify(current.rawExtensions) : null)
        : (patch.rawExtensions ? JSON.stringify(patch.rawExtensions) : null),
      now(),
      characterId,
    );
    return this.get(characterId);
  }

  remove(characterId: string): void {
    this.db.prepare('DELETE FROM characters WHERE id = ?').run(characterId);
  }
}

export class ChatRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(): ChatRecord[] {
    const rows = this.db.prepare(`SELECT c.*,
      (SELECT content FROM messages m WHERE m.id = c.active_leaf_id) AS last_content
      FROM chats c ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC`).all() as unknown as (ChatRow & { last_content: string | null })[];
    return rows.map(rowToChat);
  }

  get(chatId: string): ChatRecord | undefined {
    const row = this.db.prepare(`SELECT c.*,
      (SELECT content FROM messages m WHERE m.id = c.active_leaf_id) AS last_content
      FROM chats c WHERE c.id = ?`).get(chatId) as unknown as (ChatRow & { last_content: string | null }) | undefined;
    return row ? rowToChat(row) : undefined;
  }

  create(input: {
    character: Character;
    providerId: string | null;
    personaId?: string | null;
    title: string;
    model: string;
    params: GenerationParams;
  }): ChatRecord {
    const chatId = id();
    const timestamp = now();
    this.db.prepare(`INSERT INTO chats
      (id, character_id, character_snapshot, provider_id, persona_id, title, model, params, active_leaf_id, created_at, updated_at, last_message_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`).run(
      chatId,
      input.character.id,
      JSON.stringify(input.character),
      input.providerId,
      input.personaId ?? null,
      input.title,
      input.model,
      JSON.stringify(input.params),
      timestamp,
      timestamp,
    );
    return this.get(chatId)!;
  }

  update(chatId: string, patch: {
    title?: string;
    providerId?: string | null;
    personaId?: string | null;
    model?: string;
    params?: GenerationParams;
    activeLeafId?: string | null;
  }): ChatRecord | undefined {
    const current = this.get(chatId);
    if (!current) return undefined;
    this.db.prepare(`UPDATE chats SET title = ?, provider_id = ?, persona_id = ?, model = ?, params = ?, active_leaf_id = ?, updated_at = ?
      WHERE id = ?`).run(
      patch.title ?? current.title,
      patch.providerId === undefined ? current.providerId : patch.providerId,
      patch.personaId === undefined ? current.personaId : patch.personaId,
      patch.model ?? current.model,
      JSON.stringify(patch.params ?? current.params),
      patch.activeLeafId === undefined ? current.activeLeafId : patch.activeLeafId,
      now(),
      chatId,
    );
    return this.get(chatId);
  }

  remove(chatId: string): void {
    this.db.prepare('DELETE FROM chats WHERE id = ?').run(chatId);
  }

  all(chatId: string): StoredMessage[] {
    return (this.db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY rowid ASC').all(chatId) as unknown as MessageRow[]).map(rowToMessage);
  }

  leaves(chatId: string): StoredMessage[] {
    const rows = this.db.prepare(`
      SELECT m.* FROM messages m
      LEFT JOIN messages child ON child.parent_id = m.id
      WHERE m.chat_id = ? AND child.id IS NULL
      ORDER BY m.created_at DESC
    `).all(chatId) as unknown as MessageRow[];
    return rows.map(rowToMessage);
  }

  setActiveLeaf(chatId: string, messageId: string): ChatRecord | undefined {
    const message = this.getMessage(messageId);
    if (!message || message.chatId !== chatId) return undefined;
    this.db.prepare('UPDATE chats SET active_leaf_id = ?, updated_at = ? WHERE id = ?').run(messageId, now(), chatId);
    return this.get(chatId);
  }

  messages(chatId: string, leafId?: string | null): StoredMessage[] {
    const start = leafId ?? this.get(chatId)?.activeLeafId;
    if (!start) return [];
    const rows = this.db.prepare(`
      WITH RECURSIVE branch(id, chat_id, parent_id, role, content, status, model, token_count, finish_reason, usage_json, created_at, seq) AS (
        SELECT id, chat_id, parent_id, role, content, status, model, token_count, finish_reason, usage_json, created_at, rowid
        FROM messages WHERE id = ?
        UNION ALL
        SELECT m.id, m.chat_id, m.parent_id, m.role, m.content, m.status, m.model, m.token_count, m.finish_reason, m.usage_json, m.created_at, m.rowid
        FROM messages m JOIN branch b ON m.id = b.parent_id
      )
      SELECT * FROM branch ORDER BY seq ASC
    `).all(start) as unknown as MessageRow[];
    return rows.map(rowToMessage);
  }

  insertMessage(input: {
    chatId: string;
    parentId: string | null;
    role: StoredMessage['role'];
    content: string;
    status: StoredMessage['status'];
    model: string;
    tokenCount?: number;
  }): StoredMessage {
    const messageId = id();
    const timestamp = now();
    this.db.prepare(`INSERT INTO messages
      (id, chat_id, parent_id, role, content, status, model, token_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      messageId,
      input.chatId,
      input.parentId,
      input.role,
      input.content,
      input.status,
      input.model,
      input.tokenCount ?? 0,
      timestamp,
    );
    this.db.prepare('UPDATE chats SET active_leaf_id = ?, last_message_at = ?, updated_at = ? WHERE id = ?').run(
      messageId,
      timestamp,
      timestamp,
      input.chatId,
    );
    return this.getMessage(messageId)!;
  }

  getMessage(messageId: string): StoredMessage | undefined {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as unknown as MessageRow | undefined;
    return row ? rowToMessage(row) : undefined;
  }

  updateMessage(messageId: string, patch: {
    content?: string;
    status?: StoredMessage['status'];
    finishReason?: string | null;
    tokenCount?: number;
    usage?: { promptTokens?: number; completionTokens?: number } | null;
  }): void {
    this.db.prepare(`UPDATE messages SET content = COALESCE(?, content), status = COALESCE(?, status),
      finish_reason = ?, token_count = COALESCE(?, token_count), usage_json = ? WHERE id = ?`).run(
      patch.content ?? null,
      patch.status ?? null,
      patch.finishReason ?? null,
      patch.tokenCount ?? null,
      patch.usage ? JSON.stringify(patch.usage) : null,
      messageId,
    );
  }

  touch(chatId: string): void {
    const timestamp = now();
    this.db.prepare('UPDATE chats SET last_message_at = ?, updated_at = ? WHERE id = ?').run(timestamp, timestamp, chatId);
  }
}

export class SceneRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(chatId: string): SceneDirective[] {
    return (this.db.prepare('SELECT * FROM scenes WHERE chat_id = ? ORDER BY sort_order ASC, created_at ASC').all(chatId) as unknown as SceneRow[]).map(rowToScene);
  }

  get(sceneId: string): SceneDirective | undefined {
    const row = this.db.prepare('SELECT * FROM scenes WHERE id = ?').get(sceneId) as unknown as SceneRow | undefined;
    return row ? rowToScene(row) : undefined;
  }

  create(input: {
    chatId: string;
    title: string;
    content: string;
    role: SceneDirective['role'];
    placement: SceneDirective['placement'];
    lifetime: SceneDirective['lifetime'];
    enabled: boolean;
    sortOrder: number;
  }): SceneDirective {
    const sceneId = id();
    const timestamp = now();
    const placement = input.placement;
    this.db.prepare(`INSERT INTO scenes
      (id, chat_id, title, content, role, placement_mode, depth, anchor_message_id, sort_order, lifetime, enabled, consumed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`).run(
      sceneId,
      input.chatId,
      input.title,
      input.content,
      input.role,
      placement.mode,
      placement.mode === 'depth' ? placement.depth : 0,
      placement.mode === 'anchored' ? placement.messageId : null,
      input.sortOrder,
      input.lifetime,
      input.enabled ? 1 : 0,
      timestamp,
      timestamp,
    );
    return this.get(sceneId)!;
  }

  update(sceneId: string, patch: Partial<{
    title: string;
    content: string;
    role: SceneDirective['role'];
    placement: SceneDirective['placement'];
    lifetime: SceneDirective['lifetime'];
    enabled: boolean;
    sortOrder: number;
  }>): SceneDirective | undefined {
    const current = this.get(sceneId);
    if (!current) return undefined;
    const placement = patch.placement ?? current.placement;
    this.db.prepare(`UPDATE scenes SET
      title = ?, content = ?, role = ?, placement_mode = ?, depth = ?, anchor_message_id = ?, sort_order = ?, lifetime = ?, enabled = ?, updated_at = ?
      WHERE id = ?`).run(
      patch.title ?? current.title,
      patch.content ?? current.content,
      patch.role ?? current.role,
      placement.mode,
      placement.mode === 'depth' ? placement.depth : 0,
      placement.mode === 'anchored' ? placement.messageId : null,
      patch.sortOrder ?? current.sortOrder,
      patch.lifetime ?? current.lifetime,
      (patch.enabled ?? current.enabled) ? 1 : 0,
      now(),
      sceneId,
    );
    return this.get(sceneId);
  }

  remove(sceneId: string): void {
    this.db.prepare('DELETE FROM scenes WHERE id = ?').run(sceneId);
  }

  consume(sceneId: string): void {
    this.db.prepare('UPDATE scenes SET enabled = 0, consumed_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), sceneId);
  }
}

export class PersonaRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(): Persona[] {
    return (this.db.prepare('SELECT * FROM personas ORDER BY created_at ASC').all() as unknown as PersonaRow[]).map(rowToPersona);
  }

  get(personaId: string): Persona | undefined {
    const row = this.db.prepare('SELECT * FROM personas WHERE id = ?').get(personaId) as unknown as PersonaRow | undefined;
    return row ? rowToPersona(row) : undefined;
  }

  create(input: { name: string; description: string }): Persona {
    const personaId = id();
    const timestamp = now();
    this.db.prepare('INSERT INTO personas (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(personaId, input.name, input.description, timestamp, timestamp);
    return this.get(personaId)!;
  }

  update(personaId: string, patch: { name?: string; description?: string }): Persona | undefined {
    const current = this.get(personaId);
    if (!current) return undefined;
    this.db.prepare('UPDATE personas SET name = ?, description = ?, updated_at = ? WHERE id = ?')
      .run(patch.name ?? current.name, patch.description ?? current.description, now(), personaId);
    return this.get(personaId);
  }

  remove(personaId: string): void {
    this.db.prepare('DELETE FROM personas WHERE id = ?').run(personaId);
    this.db.prepare('UPDATE chats SET persona_id = NULL WHERE persona_id = ?').run(personaId);
  }
}
