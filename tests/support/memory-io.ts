import type { PluginIo } from '../../src/runtime/serve';

/** An in-memory stdio pair: send lines in, read lines out. */
export function memoryIo() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const input = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  let written = '';

  const io: PluginIo = {
    input,
    write: (line) => {
      written += line;
    },
  };

  return {
    io,
    send(text: string) {
      controller.enqueue(encoder.encode(text));
    },
    end() {
      controller.close();
    },
    /** every complete line written so far, parsed as JSON */
    outgoing(): Record<string, unknown>[] {
      return written
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}

/** Polls until the condition holds, or fails after about a second. */
export async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('condition not met in time');
}
