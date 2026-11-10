import { describe, expect, it } from 'vitest';
import { iterateSSE } from './sse.js';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('iterateSSE', () => {
  it('parses events split across arbitrary chunks', async () => {
    const events = [];
    for await (const event of iterateSSE(streamFromChunks([
      'data: {"cho',
      'ices":[{"delta":{"content":"你好"}}]}\r\n\r\n',
      ': keep-alive\n\n',
      'event: custom\ndata: line1\ndata: line2\n\n',
      'data: [DONE]\n\n',
    ]))) {
      events.push(event);
    }
    expect(events).toEqual([
      { data: '{"choices":[{"delta":{"content":"你好"}}]}', event: undefined, id: undefined },
      { data: 'line1\nline2', event: 'custom', id: undefined },
      { data: '[DONE]', event: undefined, id: undefined },
    ]);
  });
});
