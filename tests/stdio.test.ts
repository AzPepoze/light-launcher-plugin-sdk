import { expect, test } from 'bun:test';
import path from 'node:path';
import { LineSplitter } from '../src/runtime/ndjson';

const fixture = path.join(import.meta.dir, 'fixtures/demo-plugin.ts');

/** Reads complete JSON lines from a process stdout, one per call. */
function lineReader(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const splitter = new LineSplitter();
  const ready: string[] = [];
  return async function next(): Promise<Record<string, unknown>> {
    while (ready.length === 0) {
      const { done, value } = await reader.read();
      if (done) throw new Error('plugin stdout closed');
      ready.push(...splitter.push(decoder.decode(value, { stream: true })));
    }
    return JSON.parse(ready.shift() as string) as Record<string, unknown>;
  };
}

function send(stdin: Bun.FileSink, message: object) {
  stdin.write(`${JSON.stringify(message)}\n`);
  stdin.flush();
}

test('a plugin process answers over real stdio, calls the host and exits on shutdown', async () => {
  const proc = Bun.spawn(['bun', fixture], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  try {
    const next = lineReader(proc.stdout);

    send(proc.stdin, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        hostVersion: '2.0.0',
        apiVersion: '1',
        platform: 'linux',
        grantedPermissions: { network: ['demo.example'], fs: [], secrets: true, browser: false, exec: false },
        dataDir: 'demo-data',
      },
    });
    expect(await next()).toMatchObject({ id: 1, result: { pluginVersion: '0.0.1' } });

    send(proc.stdin, { jsonrpc: '2.0', id: 2, method: 'source.search', params: { source: 'demo' } });
    const hostCall = await next();
    expect(hostCall).toMatchObject({ method: 'http.request', params: { url: 'https://demo.example/' } });

    send(proc.stdin, {
      jsonrpc: '2.0',
      id: hostCall.id,
      result: { status: 200, url: 'https://demo.example/', text: 'Hello', headers: {}, notModified: false },
    });
    expect(await next()).toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: { games: [{ source: 'demo', sourceId: '1', url: 'https://demo.example/', title: 'Hello' }] },
    });

    send(proc.stdin, { jsonrpc: '2.0', id: 3, method: 'source.authStatus', params: { source: 'demo' } });
    const emptyRead = await next();
    expect(emptyRead).toMatchObject({ method: 'secrets.get', params: { key: 'credential' } });
    send(proc.stdin, { jsonrpc: '2.0', id: emptyRead.id, result: { value: null } });
    expect(await next()).toEqual({ jsonrpc: '2.0', id: 3, result: { status: 'unconfigured' } });

    send(proc.stdin, {
      jsonrpc: '2.0',
      id: 4,
      method: 'source.setCredential',
      params: { source: 'demo', value: 'abc' },
    });
    const write = await next();
    expect(write).toMatchObject({ method: 'secrets.set', params: { key: 'credential', value: 'abc' } });
    send(proc.stdin, { jsonrpc: '2.0', id: write.id, result: null });
    expect(await next()).toEqual({ jsonrpc: '2.0', id: 4, result: { status: 'ok' } });

    send(proc.stdin, { jsonrpc: '2.0', id: 5, method: 'shutdown', params: {} });
    expect(await next()).toEqual({ jsonrpc: '2.0', id: 5, result: null });
    expect(await proc.exited).toBe(0);
  } finally {
    proc.kill();
  }
}, 20_000);
