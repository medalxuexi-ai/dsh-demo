import { describe, expect, it } from 'vitest';
import { GenerationManager } from '../src/generation.js';

describe('GenerationManager', () => {
  it('tracks one generation per chat and aborts on cancel', () => {
    const manager = new GenerationManager();
    const controller = new AbortController();
    const generation = { id: 'g1', chatId: 'c1', messageId: 'm1', controller };
    manager.start(generation);
    expect(manager.has('c1')).toBe(true);
    expect(() => manager.start({ ...generation, id: 'g2' })).toThrow('GENERATION_IN_PROGRESS');
    expect(manager.cancel('g1')).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    manager.finish(generation);
    expect(manager.has('c1')).toBe(false);
  });
});
