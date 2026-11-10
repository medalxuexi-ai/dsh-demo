import type { ActiveGeneration } from './types.js';

export class GenerationManager {
  private readonly byId = new Map<string, ActiveGeneration>();
  private readonly byChat = new Map<string, ActiveGeneration>();

  has(chatId: string): boolean {
    return this.byChat.has(chatId);
  }

  start(generation: ActiveGeneration): void {
    if (this.byChat.has(generation.chatId)) {
      throw new Error('GENERATION_IN_PROGRESS');
    }
    this.byId.set(generation.id, generation);
    this.byChat.set(generation.chatId, generation);
  }

  finish(generation: ActiveGeneration): void {
    this.byId.delete(generation.id);
    const current = this.byChat.get(generation.chatId);
    if (current?.id === generation.id) this.byChat.delete(generation.chatId);
  }

  cancel(generationId: string): boolean {
    const generation = this.byId.get(generationId);
    if (!generation) return false;
    generation.controller.abort();
    return true;
  }

  cancelChat(chatId: string): boolean {
    const generation = this.byChat.get(chatId);
    if (!generation) return false;
    generation.controller.abort();
    return true;
  }
}
