import type { ChatMessage, GenerationParams, ProviderConnection, StoredMessage } from '@roleplay/core';
import type { ChatRecord, ChatRepository, CharacterRepository, ProviderRepository, SceneRepository } from '@roleplay/db';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from './config.js';
import type { SecretBox } from './crypto.js';
import type { GenerationManager } from './generation.js';

export interface Repositories {
  providers: ProviderRepository;
  characters: CharacterRepository;
  chats: ChatRepository;
  scenes: SceneRepository;
}

export interface AppContext {
  config: AppConfig;
  db: DatabaseSync;
  repos: Repositories;
  secrets: SecretBox;
  generations: GenerationManager;
}

export interface ActiveGeneration {
  id: string;
  chatId: string;
  messageId: string;
  controller: AbortController;
}

export interface PreparedGeneration {
  generationId: string;
  chat: ChatRecord;
  message: StoredMessage;
  prompt: { messages: ChatMessage[]; warnings: string[]; estimatedTokens: number };
  connection: ProviderConnection;
  model: string;
  params: GenerationParams;
  consumeSceneIds: string[];
}

