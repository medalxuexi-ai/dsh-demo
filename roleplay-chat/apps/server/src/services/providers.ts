import { testConnection as testAdapter, listModels as listAdapter } from '@roleplay/adapters';
import type { NormalizedError, ProviderConnection, PublicProvider } from '@roleplay/core';
import type { ProviderRow } from '@roleplay/db';
import type { AppContext } from '../types.js';
import { ApiError } from '../errors.js';

export interface ProviderInput {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  contextWindow?: number;
  extraHeaders?: Record<string, string>;
}

function parseHeaders(row: ProviderRow): Record<string, string> | undefined {
  if (!row.extra_headers) return undefined;
  try {
    return JSON.parse(row.extra_headers) as Record<string, string>;
  } catch {
    return undefined;
  }
}

export function connectionFor(ctx: AppContext, row: ProviderRow): ProviderConnection {
  let apiKey = '';
  try {
    apiKey = ctx.secrets.decrypt(row.api_key_encrypted);
  } catch {
    throw new ApiError(400, 'PROVIDER_CONFIG_INVALID', '模型服务的密钥无法解密，请重新填写 API Key');
  }
  return { baseUrl: row.base_url, apiKey, extraHeaders: parseHeaders(row) };
}

export function toPublicProvider(ctx: AppContext, row: ProviderRow): PublicProvider {
  let masked = '••••••••';
  try {
    masked = ctx.secrets.mask(ctx.secrets.decrypt(row.api_key_encrypted));
  } catch {
    // keep the mask
  }
  return {
    id: row.id,
    name: row.name,
    kind: 'openai-compatible',
    baseUrl: row.base_url,
    defaultModel: row.default_model,
    contextWindow: row.context_window ?? undefined,
    apiKeyMasked: masked,
  };
}

export function listProviders(ctx: AppContext): PublicProvider[] {
  return ctx.repos.providers.list().map((row) => toPublicProvider(ctx, row));
}

export function getProviderRow(ctx: AppContext, providerId: string): ProviderRow {
  const row = ctx.repos.providers.get(providerId);
  if (!row) throw new ApiError(404, 'NOT_FOUND', '模型服务不存在');
  return row;
}

export function createProvider(ctx: AppContext, input: ProviderInput): PublicProvider {
  const row = ctx.repos.providers.create({
    name: input.name,
    baseUrl: input.baseUrl.replace(/\/+$/, ''),
    apiKeyEncrypted: ctx.secrets.encrypt(input.apiKey),
    defaultModel: input.defaultModel,
    contextWindow: input.contextWindow,
    extraHeaders: input.extraHeaders,
  });
  return toPublicProvider(ctx, row);
}

export function updateProvider(
  ctx: AppContext,
  providerId: string,
  patch: Partial<ProviderInput>,
): PublicProvider {
  const current = getProviderRow(ctx, providerId);
  const row = ctx.repos.providers.update(providerId, {
    name: patch.name,
    baseUrl: patch.baseUrl?.replace(/\/+$/, ''),
    apiKeyEncrypted: patch.apiKey === undefined ? undefined : ctx.secrets.encrypt(patch.apiKey),
    defaultModel: patch.defaultModel,
    contextWindow: patch.contextWindow === undefined ? undefined : patch.contextWindow,
    extraHeaders: patch.extraHeaders,
  });
  if (!row) throw new ApiError(404, 'NOT_FOUND', '模型服务不存在');
  return toPublicProvider(ctx, row);
}

export function deleteProvider(ctx: AppContext, providerId: string): void {
  getProviderRow(ctx, providerId);
  ctx.repos.providers.remove(providerId);
}

export async function testProviderConnection(
  ctx: AppContext,
  input: { baseUrl: string; apiKey: string; model?: string; extraHeaders?: Record<string, string> },
): Promise<{ ok: boolean; latencyMs?: number; models?: { id: string; name?: string; contextWindow?: number }[]; error?: NormalizedError }> {
  return testAdapter(
    { baseUrl: input.baseUrl.replace(/\/+$/, ''), apiKey: input.apiKey, extraHeaders: input.extraHeaders },
    input.model,
  );
}

export async function testExistingProvider(
  ctx: AppContext,
  providerId: string,
): Promise<{ ok: boolean; latencyMs?: number; models?: { id: string; name?: string; contextWindow?: number }[]; error?: NormalizedError }> {
  const row = getProviderRow(ctx, providerId);
  return testAdapter(connectionFor(ctx, row), row.default_model);
}

export async function providerModels(ctx: AppContext, providerId: string) {
  const row = getProviderRow(ctx, providerId);
  try {
    return await listAdapter(connectionFor(ctx, row));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) throw new ApiError(502, (error as NormalizedError).code, (error as NormalizedError).message);
    throw error;
  }
}
