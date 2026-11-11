import { describe, expect, test } from 'bun:test';
import { servePlugin, sourceHandlers, type SourceProvider } from '../src/runtime';
import { ErrorCode } from '../src/types/protocol';
import { memoryIo, until } from './support/memory-io';

/** A provider that records what it was asked, with no real site behind it. */
function fakeProvider(options: { sync?: boolean; listGames?: boolean } = {}) {
  const calls: string[] = [];
  const provider: SourceProvider = {
    id: 'demo',
    capabilities: { browse: true, auth: 'none', updateCheck: false, resolveFiles: true, versioned: false },
    parseRef: (url) => (url.includes('demo.test') ? { kind: 'game', id: '1', url } : null),
    authStatus: async () => ({ status: 'unconfigured' }),
    setCredential: async (value) => ({ status: value ? 'ok' : 'invalid' }),
    clearCredential: async () => ({ status: 'unconfigured' }),
    fetchGame: async (ref) => ({ source: 'demo', sourceId: ref.id, url: ref.url, title: 'Game' }),
    fetchList: async (opts) => {
      calls.push(`list:${opts.query ?? ''}:${opts.page ?? ''}`);
      return [{ source: 'demo', sourceId: '1', url: 'u', title: 'Found' }];
    },
    resolveFiles: async () => [],
    prepareDownload: async (file, _game, hooks) => {
      hooks.progress?.({ done: 1, total: 2, message: 'resolving' });
      return { url: file.url, headers: { Cookie: 'c=1' }, filename: 'a.zip', size: 5 };
    },
    checkUpdate: async () => null,
    ...(options.sync ? { sync: async () => [] } : {}),
    ...(options.listGames
      ? {
          listGames: async (params) => {
            calls.push(`games:${params.cursor ?? ''}:${params.limit}`);
            return { games: [{ source: 'demo', sourceId: '2', url: 'u2', title: 'Owned' }], nextCursor: 'c-2', total: 9 };
          },
        }
      : {}),
  };
  return { provider, calls };
}

function startPlugin(provider: Parameters<typeof sourceHandlers>[0], sourceId = 'demo') {
  const mem = memoryIo();
  const done = servePlugin(sourceHandlers(provider, sourceId), mem.io);
  return { ...mem, done };
}

describe('sourceHandlers', () => {
  test('maps search, fetchGame and parseRef onto the provider', async () => {
    const { provider, calls } = fakeProvider();
    const plugin = startPlugin(provider);
    plugin.send('{"jsonrpc":"2.0","id":1,"method":"source.search","params":{"source":"demo","query":"q","page":2}}\n');
    plugin.send('{"jsonrpc":"2.0","id":2,"method":"source.parseRef","params":{"url":"https://demo.test/g/1"}}\n');
    await until(() => plugin.outgoing().length === 2);
    expect(calls).toEqual(['list:q:2']);
    expect(plugin.outgoing()[0]).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { games: [{ source: 'demo', sourceId: '1', url: 'u', title: 'Found' }] },
    });
    expect(plugin.outgoing()[1]).toEqual({ jsonrpc: '2.0', id: 2, result: { kind: 'game', id: '1', url: 'https://demo.test/g/1' } });
    plugin.end();
    await plugin.done;
  });

  test('a request for another source id gets invalid params', async () => {
    const { provider } = fakeProvider();
    const plugin = startPlugin(provider);
    plugin.send('{"jsonrpc":"2.0","id":3,"method":"source.authStatus","params":{"source":"other"}}\n');
    await until(() => plugin.outgoing().length === 1);
    expect(plugin.outgoing()[0]).toMatchObject({ id: 3, error: { code: ErrorCode.InvalidParams } });
    plugin.end();
    await plugin.done;
  });

  test('prepareDownload passes the request progress and returns filename and size', async () => {
    const { provider } = fakeProvider();
    const plugin = startPlugin(provider);
    plugin.send('{"jsonrpc":"2.0","id":4,"method":"source.prepareDownload","params":{"source":"demo","file":{"id":"f","label":"l","url":"https://cdn.test/a.zip","kind":"direct"},"game":{"source":"demo","sourceId":"1","url":"u","title":"t"}}}\n');
    await until(() => plugin.outgoing().length === 2);
    expect(plugin.outgoing()[0]).toEqual({
      jsonrpc: '2.0',
      method: 'progress',
      params: { id: 4, done: 1, total: 2, message: 'resolving' },
    });
    expect(plugin.outgoing()[1]).toEqual({
      jsonrpc: '2.0',
      id: 4,
      result: { url: 'https://cdn.test/a.zip', headers: { Cookie: 'c=1' }, filename: 'a.zip', size: 5 },
    });
    plugin.end();
    await plugin.done;
  });

  test('source.sync answers with method not found when the provider has no sync', async () => {
    const { provider } = fakeProvider();
    const plugin = startPlugin(provider);
    plugin.send('{"jsonrpc":"2.0","id":5,"method":"source.sync","params":{"source":"demo"}}\n');
    await until(() => plugin.outgoing().length === 1);
    expect(plugin.outgoing()[0]).toMatchObject({ id: 5, error: { code: ErrorCode.MethodNotFound } });
    plugin.end();
    await plugin.done;
  });

  test('source.sync calls the provider when it has sync', async () => {
    const { provider } = fakeProvider({ sync: true });
    const plugin = startPlugin(provider);
    plugin.send('{"jsonrpc":"2.0","id":6,"method":"source.sync","params":{"source":"demo"}}\n');
    await until(() => plugin.outgoing().length === 1);
    expect(plugin.outgoing()[0]).toEqual({ jsonrpc: '2.0', id: 6, result: [] });
    plugin.end();
    await plugin.done;
  });

  test('source.listGames passes the page params to the provider and returns its page', async () => {
    const { provider, calls } = fakeProvider({ listGames: true });
    const plugin = startPlugin(provider);
    plugin.send('{"jsonrpc":"2.0","id":8,"method":"source.listGames","params":{"source":"demo","scope":"mine","cursor":"c-1","limit":50}}\n');
    await until(() => plugin.outgoing().length === 1);
    expect(calls).toEqual(['games:c-1:50']);
    expect(plugin.outgoing()[0]).toEqual({
      jsonrpc: '2.0',
      id: 8,
      result: { games: [{ source: 'demo', sourceId: '2', url: 'u2', title: 'Owned' }], nextCursor: 'c-2', total: 9 },
    });
    plugin.end();
    await plugin.done;
  });

  test('source.listGames answers with method not found when the provider has no listGames', async () => {
    const { provider } = fakeProvider();
    const plugin = startPlugin(provider);
    plugin.send('{"jsonrpc":"2.0","id":9,"method":"source.listGames","params":{"source":"demo","scope":"mine","limit":10}}\n');
    await until(() => plugin.outgoing().length === 1);
    expect(plugin.outgoing()[0]).toMatchObject({ id: 9, error: { code: ErrorCode.MethodNotFound } });
    plugin.end();
    await plugin.done;
  });

  test('source.listGames with validateParams refuses a limit of 0 before the provider runs', async () => {
    const { provider, calls } = fakeProvider({ listGames: true });
    const mem = memoryIo();
    const done = servePlugin(sourceHandlers(provider, 'demo'), mem.io, {}, { validateParams: true });
    mem.send('{"jsonrpc":"2.0","id":10,"method":"source.listGames","params":{"source":"demo","scope":"mine","limit":0}}\n');
    await until(() => mem.outgoing().length === 1);
    expect(mem.outgoing()[0]).toMatchObject({ id: 10, error: { code: ErrorCode.InvalidParams } });
    expect(calls).toEqual([]);
    mem.end();
    await done;
  });

  test('a provider function is looked up on each request, so it can be built in initialize', async () => {
    const { provider } = fakeProvider();
    let lookups = 0;
    const plugin = startPlugin(() => {
      lookups++;
      return provider;
    });
    plugin.send('{"jsonrpc":"2.0","id":7,"method":"source.authStatus","params":{"source":"demo"}}\n');
    await until(() => plugin.outgoing().length === 1);
    expect(plugin.outgoing()[0]).toEqual({ jsonrpc: '2.0', id: 7, result: { status: 'unconfigured' } });
    expect(lookups).toBe(1);
    plugin.end();
    await plugin.done;
  });
});
