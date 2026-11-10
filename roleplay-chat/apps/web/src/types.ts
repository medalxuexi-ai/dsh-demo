import type { Character, ChatMessage, GenerationParams, Persona, PublicProvider, SceneDirective, SceneLifetime, ScenePlacement, SceneRole, Script, StoredMessage } from '@roleplay/core';

export type { Character, Persona, PublicProvider, Script, StoredMessage, SceneDirective, SceneLifetime, ScenePlacement, SceneRole };

export interface ChatRecord {
  id: string;
  characterId: string | null;
  character: Character;
  providerId: string | null;
  personaId: string | null;
  scriptId: string | null;
  script: Script | null;
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

export interface SceneView extends SceneDirective {
  placementValid: boolean;
}

export interface SceneInput {
  title?: string;
  content: string;
  role?: SceneRole;
  placement: ScenePlacement;
  lifetime?: SceneLifetime;
  enabled?: boolean;
  sortOrder?: number;
}

export interface ContextPreview {
  model: string;
  budget: number;
  estimatedTokens: number;
  messages: ChatMessage[];
  trace: { source: string; role: string; tokens: number }[];
  warnings: string[];
}

export interface BranchSummary {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: string;
  createdAt: string;
}

export interface BranchList {
  activeLeafId: string | null;
  branches: BranchSummary[];
}
