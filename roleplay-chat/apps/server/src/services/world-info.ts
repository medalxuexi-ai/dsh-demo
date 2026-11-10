import type { Character, WorldInfoEntry } from '@roleplay/core';
import type { AppContext } from '../types.js';
import { ApiError } from '../errors.js';

export interface WorldInfoInput {
  uid?: number;
  name: string;
  keys: string[];
  secondaryKeys?: string[];
  content: string;
  enabled?: boolean;
  constant?: boolean;
  selective?: boolean;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  order?: number;
  position?: number;
  depth?: number;
  role?: number;
  scanDepth?: number;
  probability?: number;
  raw?: Record<string, unknown> | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function rawEntries(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(record).filter((item): item is Record<string, unknown> => item !== null);
  const root = record(value);
  if (!root) return [];
  const entries = root.entries;
  if (Array.isArray(entries)) return entries.map(record).filter((item): item is Record<string, unknown> => item !== null);
  if (record(entries)) return Object.values(entries as Record<string, unknown>).map(record).filter((item): item is Record<string, unknown> => item !== null);
  if (typeof root.content === 'string' || root.key !== undefined || root.keys !== undefined) return [root];
  return Object.values(root).map(record).filter((item): item is Record<string, unknown> => item !== null && typeof item.content === 'string');
}

export function normalizeWorldInfoBook(value: unknown): WorldInfoInput[] {
  const result: WorldInfoInput[] = [];
  rawEntries(value).forEach((entry, index) => {
    const content = text(entry.content).trim();
    if (!content) return;
    result.push({
      uid: numberValue(entry.uid, index),
      name: text(entry.comment) || text(entry.name) || `条目 ${index + 1}`,
      keys: stringList(entry.key ?? entry.keys),
      secondaryKeys: stringList(entry.keysecondary ?? entry.secondary_keys),
      content,
      enabled: !boolValue(entry.disable, false),
      constant: boolValue(entry.constant, false),
      selective: boolValue(entry.selective, true),
      caseSensitive: boolValue(entry.caseSensitive, false),
      matchWholeWords: boolValue(entry.matchWholeWords, true),
      order: numberValue(entry.order, 100),
      position: Math.max(0, Math.min(4, numberValue(entry.position, 0))),
      depth: Math.max(0, Math.min(2000, numberValue(entry.depth, 4))),
      role: Math.max(0, Math.min(2, numberValue(entry.role, 0))),
      scanDepth: Math.max(0, Math.min(200, numberValue(entry.scanDepth, 2))),
      probability: Math.max(0, Math.min(100, numberValue(entry.probability, 100))),
      raw: entry,
    });
  });
  return result;
}

export function importWorldInfo(
  ctx: AppContext,
  scope: { scriptId: string | null; characterId: string | null },
  book: unknown,
): WorldInfoEntry[] {
  const entries = normalizeWorldInfoBook(book);
  if (entries.length === 0) throw new ApiError(400, 'INVALID_WORLD_INFO', '没有找到可导入的世界书条目');
  return entries.map((entry) => ctx.repos.worldInfo.create({
    scriptId: scope.scriptId,
    characterId: scope.characterId,
    uid: entry.uid ?? 0,
    name: entry.name,
    keys: entry.keys,
    secondaryKeys: entry.secondaryKeys ?? [],
    content: entry.content,
    enabled: entry.enabled ?? true,
    constant: entry.constant ?? false,
    selective: entry.selective ?? true,
    caseSensitive: entry.caseSensitive ?? false,
    matchWholeWords: entry.matchWholeWords ?? true,
    order: entry.order ?? 100,
    position: entry.position ?? 0,
    depth: entry.depth ?? 4,
    role: entry.role ?? 0,
    scanDepth: entry.scanDepth ?? 2,
    probability: entry.probability ?? 100,
    raw: entry.raw ?? null,
  }));
}

export function exportWorldInfo(entries: WorldInfoEntry[]): { entries: Record<string, unknown> } {
  const result: Record<string, unknown> = {};
  for (const entry of entries) {
    result[String(entry.uid)] = {
      ...(entry.raw ?? {}),
      uid: entry.uid,
      key: entry.keys,
      keysecondary: entry.secondaryKeys,
      comment: entry.name,
      content: entry.content,
      constant: entry.constant,
      selective: entry.selective,
      disable: !entry.enabled,
      order: entry.order,
      position: entry.position,
      depth: entry.depth,
      role: entry.role,
      scanDepth: entry.scanDepth,
      probability: entry.probability,
      caseSensitive: entry.caseSensitive,
      matchWholeWords: entry.matchWholeWords,
    };
  }
  return { entries: result };
}

export function characterBook(character: Character, entries: WorldInfoEntry[]): Record<string, unknown> {
  return {
    name: `${character.name} Lore`,
    entries: Object.values(exportWorldInfo(entries).entries),
  };
}
