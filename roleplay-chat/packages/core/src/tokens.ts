import type { ChatMessage } from './types.js';

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u;

/** Rough estimate that is deliberately conservative for mixed Chinese/English. */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    if (CJK_RE.test(char)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk + other / 4) + 1;
}

export function estimateMessageTokens(message: Pick<ChatMessage, 'content'>): number {
  return estimateTokens(message.content) + 4;
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}
