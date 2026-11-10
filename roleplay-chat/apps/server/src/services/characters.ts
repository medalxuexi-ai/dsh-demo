import type { Character } from '@roleplay/core';
import type { AppContext } from '../types.js';
import { ApiError } from '../errors.js';

export interface CharacterInput {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  systemPrompt?: string;
  exampleDialogue?: string;
  alternateGreetings?: string[];
  tags?: string[];
  rawExtensions?: Record<string, unknown> | null;
}

export function listCharacters(ctx: AppContext): Character[] {
  return ctx.repos.characters.list();
}

export function getCharacter(ctx: AppContext, id: string): Character {
  const character = ctx.repos.characters.get(id);
  if (!character) throw new ApiError(404, 'NOT_FOUND', '角色不存在');
  return character;
}

export function createCharacter(ctx: AppContext, input: CharacterInput): Character {
  return ctx.repos.characters.create({
    name: input.name,
    description: input.description ?? '',
    personality: input.personality ?? '',
    scenario: input.scenario ?? '',
    firstMessage: input.firstMessage ?? '',
    systemPrompt: input.systemPrompt ?? '',
    exampleDialogue: input.exampleDialogue ?? '',
    alternateGreetings: input.alternateGreetings ?? [],
    tags: input.tags ?? [],
    rawExtensions: input.rawExtensions ?? null,
  });
}

export function updateCharacter(ctx: AppContext, id: string, input: Partial<CharacterInput>): Character {
  const character = ctx.repos.characters.update(id, input);
  if (!character) throw new ApiError(404, 'NOT_FOUND', '角色不存在');
  return character;
}

export function deleteCharacter(ctx: AppContext, id: string): void {
  getCharacter(ctx, id);
  ctx.repos.characters.remove(id);
}
