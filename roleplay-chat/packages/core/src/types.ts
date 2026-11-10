export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface Script {
  id: string;
  name: string;
  description: string;
  opening: string;
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  scriptId?: string | null;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  systemPrompt: string;
  exampleDialogue?: string;
  alternateGreetings?: string[];
  tags?: string[];
  rawExtensions?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  chatId: string;
  parentId: string | null;
  role: ChatRole;
  content: string;
  status: 'streaming' | 'complete' | 'cancelled' | 'error';
  model: string;
  tokenCount: number;
  createdAt: string;
}

export interface GenerationParams {
  temperature: number;
  topP: number;
  maxTokens: number;
  presencePenalty: number;
  frequencyPenalty: number;
  stop?: string[];
}

export interface ProviderConnection {
  baseUrl: string;
  apiKey: string;
  extraHeaders?: Record<string, string>;
}

export interface ProviderConfig extends ProviderConnection {
  id: string;
  name: string;
  kind: 'openai-compatible';
  defaultModel: string;
  contextWindow?: number;
}

export interface ModelInfo {
  id: string;
  name?: string;
  contextWindow?: number;
  maxOutput?: number;
}

export type NormalizedErrorCode =
  | 'PROVIDER_AUTH'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_RESPONSE_INVALID'
  | 'CONTEXT_LENGTH_EXCEEDED'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface NormalizedError {
  code: NormalizedErrorCode;
  status?: number;
  message: string;
  retryable: boolean;
}

export type ChatChunk =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'usage'; promptTokens?: number; completionTokens?: number }
  | { type: 'finish'; reason: 'stop' | 'length' | 'cancelled' | 'error' }
  | { type: 'error'; error: NormalizedError };

export type PublicProvider = Omit<ProviderConfig, 'apiKey'> & {
  apiKeyMasked: string;
};

export type SceneRole = 'system' | 'user' | 'assistant';

export type ScenePlacement =
  | { mode: 'system-top' }
  | { mode: 'depth'; depth: number }
  | { mode: 'anchored'; messageId: string };

export type SceneLifetime = 'persistent' | 'once';

export interface SceneDirective {
  id: string;
  chatId: string;
  title: string;
  content: string;
  role: SceneRole;
  placement: ScenePlacement;
  lifetime: SceneLifetime;
  enabled: boolean;
  sortOrder: number;
  consumedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}
