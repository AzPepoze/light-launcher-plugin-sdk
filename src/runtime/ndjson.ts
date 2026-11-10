import { ErrorCode, RpcFailure, type RpcMessage } from '../types/protocol';

export function encodeLine(message: RpcMessage | object): string {
  return `${JSON.stringify(message)}\n`;
}

/** Parses one line. Throws RpcFailure with ParseError or InvalidRequest. */
export function decodeLine(line: string): RpcMessage {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new RpcFailure(ErrorCode.ParseError, 'Parse error: line is not JSON');
  }
  if (!isMessageShape(value)) {
    throw new RpcFailure(ErrorCode.InvalidRequest, 'Invalid request: not a JSON-RPC 2.0 message');
  }
  return value;
}

function isMessageShape(value: unknown): value is RpcMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const msg = value as Record<string, unknown>;
  if (msg.jsonrpc !== '2.0') return false;
  if ('method' in msg) return typeof msg.method === 'string';
  return 'id' in msg && ('result' in msg || 'error' in msg);
}

/** Splits streamed text into complete lines. Keeps a partial last line for the next chunk. */
export class LineSplitter {
  private rest = '';

  push(chunk: string): string[] {
    const parts = (this.rest + chunk).split('\n');
    this.rest = parts.pop() ?? '';
    return parts.map(stripCarriageReturn).filter((line) => line.trim() !== '');
  }

  end(): string[] {
    const last = stripCarriageReturn(this.rest);
    this.rest = '';
    return last.trim() === '' ? [] : [last];
  }
}

function stripCarriageReturn(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

/** Reads a byte stream line by line until it ends or `stop` fires. */
export async function readLines(
  input: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
  stop?: AbortSignal,
): Promise<void> {
  const decoder = new TextDecoder();
  const splitter = new LineSplitter();
  const reader = input.getReader();
  // a pending read keeps the process alive, so stop must release the reader
  stop?.addEventListener('abort', () => void reader.cancel().catch(() => {}), { once: true });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    splitter.push(decoder.decode(value, { stream: true })).forEach(onLine);
  }
  splitter.push(decoder.decode()).forEach(onLine);
  splitter.end().forEach(onLine);
}
