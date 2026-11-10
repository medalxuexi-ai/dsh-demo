import type { Character, GenerationParams, PublicProvider, StoredMessage } from '@roleplay/core';

export type { Character, PublicProvider, StoredMessage };

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

export interface ChatSummary {
  id: string;
  title: string;
  characterId: string | null;
  characterName: string;
  providerId: string | null;
  providerName: string | null;
  model: string;
  preview: string;
  updatedAt: string;
}

export interface ChatDetail {
  chat: ChatRecord;
  messages: StoredMessage[];
}

export interface TestResult {
  ok: boolean;
  latencyMs?: number;
  models?: { id: string; name?: string; contextWindow?: number }[];
  error?: { code: string; message: string };
}
