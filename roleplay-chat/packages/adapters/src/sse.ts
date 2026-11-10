export interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
}

function parseBlock(block: string): SSEEvent | null {
  const lines = block.split('\n');
  const data: string[] = [];
  let event: string | undefined;
  let id: string | undefined;

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    const index = line.indexOf(':');
    const field = index === -1 ? line : line.slice(0, index);
    const value = index === -1 ? '' : line.slice(index + 1).replace(/^ /, '');
    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
    else if (field === 'id') id = value;
  }

  if (data.length === 0) return null;
  return { data: data.join('\n'), event, id };
}

/**
 * Minimal SSE reader used for OpenAI-compatible streaming responses.
 * Handles CRLF, comments, split UTF-8 chunks and multi-line data fields.
 */
export async function* iterateSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const event = parseBlock(block);
        if (event) yield event;
        separator = buffer.indexOf('\n\n');
      }
    }
    buffer += decoder.decode();
    const tail = parseBlock(buffer.replace(/\r\n/g, '\n'));
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}
