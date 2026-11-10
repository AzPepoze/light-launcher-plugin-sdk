import { describe, expect, test } from 'bun:test';
import { ErrorCode, RpcFailure } from '../src/types/protocol';
import { RpcPeer, servePlugin, type PluginHandlers } from '../src/runtime';
import { memoryIo, until } from './support/memory-io';

const initializeParams = {
  hostVersion: '2.0.0',
  apiVersion: '1',
  platform: 'linux',
  grantedPermissions: { network: [], fs: [], secrets: false, browser: false, exec: false },
};

function startPlugin(handlers: PluginHandlers) {
  const mem = memoryIo();
  const done = servePlugin(handlers, mem.io);
  return { ...mem, done };
}

describe('request handling', () => {
  test('answers a request with the handler result', async () => {
    const plugin = startPlugin({
      initialize: () => ({ pluginVersion: '1.0.0', capabilities: {} }),
    });
    plugin.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: initializeParams }) + '\n');
    await until(() => plugin.outgoing().length === 1);
    expect(plugin.outgoing()[0]).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { pluginVersion: '1.0.0', capabilities: {} },
    });
    plugin.end();
    await plugin.done;
  });

  test('answers unknown methods with method not found', async () => {
    const plugin = startPlugin({});
    plugin.send('{"jsonrpc":"2.0","id":"a","method":"nope"}\n');
    await until(() => plugin.outgoing().length === 1);
    expect(plugin.outgoing()[0]).toMatchObject({ id: 'a', error: { code: ErrorCode.MethodNotFound } });
    plugin.end();
    await plugin.done;
  });

  test('reports a parse error with a null id and keeps serving', async () => {
    const plugin = startPlugin({
      'source.search': () => ({ games: [] }),
    });
    plugin.send('not json\n');
    plugin.send('{"jsonrpc":"2.0","id":2,"method":"source.search","params":{"source":"x"}}\n');
    await until(() => plugin.outgoing().length === 2);
    const [parseError, result] = plugin.outgoing();
    expect(parseError).toMatchObject({ id: null, error: { code: ErrorCode.ParseError } });
    expect(result).toEqual({ jsonrpc: '2.0', id: 2, result: { games: [] } });
    plugin.end();
    await plugin.done;
  });

  test('maps thrown errors to protocol codes', async () => {
    const plugin = startPlugin({
      'source.fetchGame': () => {
        throw new RpcFailure(ErrorCode.NotModified, 'not modified');
      },
      'source.sync': () => {
        throw new Error('boom');
      },
    });
    plugin.send('{"jsonrpc":"2.0","id":1,"method":"source.fetchGame","params":{}}\n');
    plugin.send('{"jsonrpc":"2.0","id":2,"method":"source.sync","params":{}}\n');
    await until(() => plugin.outgoing().length === 2);
    expect(plugin.outgoing()[0]).toMatchObject({ id: 1, error: { code: ErrorCode.NotModified } });
    expect(plugin.outgoing()[1]).toMatchObject({ id: 2, error: { code: ErrorCode.InternalError, message: 'boom' } });
    plugin.end();
    await plugin.done;
  });

  test('joins lines split across chunks and accepts CRLF', async () => {
    const plugin = startPlugin({ 'source.sync': () => [] });
    plugin.send('{"jsonrpc":"2.0","id":3,"method":"source.sy');
    plugin.send('nc","params":{}}\r\n');
    await until(() => plugin.outgoing().length === 1);
    expect(plugin.outgoing()[0]).toMatchObject({ id: 3, result: [] });
    plugin.end();
    await plugin.done;
  });
});

describe('cancellation and progress', () => {
  test('cancel notification aborts the running handler', async () => {
    const plugin = startPlugin({
      'source.sync': (_params, ctx) =>
        new Promise((_resolve, reject) => {
          ctx.signal.addEventListener('abort', () => reject(new Error('stopped')));
        }),
    });
    plugin.send('{"jsonrpc":"2.0","id":7,"method":"source.sync","params":{}}\n');
    plugin.send('{"jsonrpc":"2.0","method":"cancel","params":{"id":7}}\n');
    await until(() => plugin.outgoing().length === 1);
    expect(plugin.outgoing()[0]).toMatchObject({ id: 7, error: { code: ErrorCode.Canceled } });
    plugin.end();
    await plugin.done;
  });

  test('progress reports go out as notifications tied to the request id', async () => {
    const plugin = startPlugin({
      'source.sync': (_params, ctx) => {
        ctx.progress({ done: 1, total: 4, message: 'page 1' });
        return [];
      },
    });
    plugin.send('{"jsonrpc":"2.0","id":9,"method":"source.sync","params":{}}\n');
    await until(() => plugin.outgoing().length === 2);
    expect(plugin.outgoing()[0]).toEqual({
      jsonrpc: '2.0',
      method: 'progress',
      params: { id: 9, done: 1, total: 4, message: 'page 1' },
    });
    plugin.end();
    await plugin.done;
  });
});

describe('secrets round trip', () => {
  test('set, get and delete reach the host, and the plugin reports the stored state', async () => {
    const plugin = startPlugin({
      'source.setCredential': async (params, ctx) => {
        await ctx.host.secrets.set('credential', params.value);
        return { status: 'ok' };
      },
      'source.authStatus': async (_params, ctx) => {
        const value = await ctx.host.secrets.get('credential');
        return { status: value ? 'ok' : 'unconfigured' };
      },
      'source.clearCredential': async (_params, ctx) => {
        await ctx.host.secrets.delete('credential');
        return { status: 'unconfigured' };
      },
    });

    // Answers each secrets call from a plain map, the way the launcher's store would.
    const store = new Map<string, string>();
    let read = 0;
    async function nextOutgoing(): Promise<Record<string, any>> {
      await until(() => plugin.outgoing().length > read);
      return plugin.outgoing()[read++];
    }

    plugin.send('{"jsonrpc":"2.0","id":1,"method":"source.setCredential","params":{"source":"x","value":"s3cret"}}\n');
    const write = await nextOutgoing();
    expect(write).toMatchObject({ method: 'secrets.set', params: { key: 'credential', value: 's3cret' } });
    store.set(write.params.key, write.params.value);
    plugin.send(JSON.stringify({ jsonrpc: '2.0', id: write.id, result: null }) + '\n');
    expect(await nextOutgoing()).toEqual({ jsonrpc: '2.0', id: 1, result: { status: 'ok' } });

    plugin.send('{"jsonrpc":"2.0","id":2,"method":"source.authStatus","params":{"source":"x"}}\n');
    const read1 = await nextOutgoing();
    expect(read1).toMatchObject({ method: 'secrets.get', params: { key: 'credential' } });
    plugin.send(JSON.stringify({ jsonrpc: '2.0', id: read1.id, result: { value: store.get('credential') ?? null } }) + '\n');
    expect(await nextOutgoing()).toEqual({ jsonrpc: '2.0', id: 2, result: { status: 'ok' } });

    plugin.send('{"jsonrpc":"2.0","id":3,"method":"source.clearCredential","params":{"source":"x"}}\n');
    const remove = await nextOutgoing();
    expect(remove).toMatchObject({ method: 'secrets.delete', params: { key: 'credential' } });
    store.delete(remove.params.key);
    plugin.send(JSON.stringify({ jsonrpc: '2.0', id: remove.id, result: null }) + '\n');
    expect(await nextOutgoing()).toEqual({ jsonrpc: '2.0', id: 3, result: { status: 'unconfigured' } });

    expect(store.size).toBe(0);
    plugin.end();
    await plugin.done;
  });
});

describe('browser assist notifications', () => {
  test('the host can send browser progress and waiting notifications to the plugin', async () => {
    const seen: unknown[] = [];
    const mem = memoryIo();
    const done = servePlugin(
      {},
      mem.io,
      {
        'browser.progress': (params) => seen.push(['progress', params]),
        'browser.waiting': (params) => seen.push(['waiting', params]),
      },
    );
    mem.send('{"jsonrpc":"2.0","method":"browser.waiting","params":{"token":"4","message":"Press download"}}\n');
    mem.send('{"jsonrpc":"2.0","method":"browser.progress","params":{"token":"4","percent":50}}\n');
    await until(() => seen.length === 2);
    expect(seen).toEqual([
      ['waiting', { token: '4', message: 'Press download' }],
      ['progress', { token: '4', percent: 50 }],
    ]);
    mem.end();
    await done;
  });
});

describe('host client', () => {
  test('sends a plugin-to-host request and resolves with the response', async () => {
    const plugin = startPlugin({
      'source.fetchGame': async (_params, ctx) => {
        const res = await ctx.host.http.request({ url: 'https://example.test/game' });
        return { game: { source: 'x', sourceId: '1', url: res.url, title: res.text } };
      },
    });
    plugin.send('{"jsonrpc":"2.0","id":1,"method":"source.fetchGame","params":{"source":"x","ref":{"kind":"game","id":"1","url":"u"}}}\n');
    await until(() => plugin.outgoing().length === 1);
    const hostCall = plugin.outgoing()[0];
    expect(hostCall).toMatchObject({ method: 'http.request', params: { url: 'https://example.test/game' } });

    plugin.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: hostCall.id,
        result: { status: 200, url: 'https://example.test/game', text: 'Title', headers: {}, notModified: false },
      }) + '\n',
    );
    await until(() => plugin.outgoing().length === 2);
    expect(plugin.outgoing()[1]).toMatchObject({
      id: 1,
      result: { game: { title: 'Title', url: 'https://example.test/game' } },
    });
    plugin.end();
    await plugin.done;
  });

  test('rejects with the host error code when the host denies a service', async () => {
    let caught: unknown;
    const plugin = startPlugin({
      'source.sync': async (_params, ctx) => {
        try {
          await ctx.host.secrets.get('cookie');
        } catch (err) {
          caught = err;
        }
        return [];
      },
    });
    plugin.send('{"jsonrpc":"2.0","id":1,"method":"source.sync","params":{}}\n');
    await until(() => plugin.outgoing().length === 1);
    const hostCall = plugin.outgoing()[0];
    plugin.send(JSON.stringify({ jsonrpc: '2.0', id: hostCall.id, error: { code: ErrorCode.PermissionDenied, message: 'no secrets' } }) + '\n');
    await until(() => caught !== undefined);
    expect(caught).toBeInstanceOf(RpcFailure);
    expect((caught as RpcFailure).code).toBe(ErrorCode.PermissionDenied);
    plugin.end();
    await plugin.done;
  });

  test('a host call times out when the host never answers', async () => {
    let caught: RpcFailure | undefined;
    const plugin = startPlugin({
      'source.sync': async (_params, ctx) => {
        await ctx.host.call('settings.get', {}, { timeoutMs: 5 }).catch((err: RpcFailure) => {
          caught = err;
        });
        return [];
      },
    });
    plugin.send('{"jsonrpc":"2.0","id":1,"method":"source.sync","params":{}}\n');
    await until(() => plugin.outgoing().length === 2);
    expect(caught?.code).toBe(ErrorCode.Timeout);
    plugin.end();
    await plugin.done;
  });

  test('log and notify are sent as notifications with no id', async () => {
    const plugin = startPlugin({
      'source.sync': (_params, ctx) => {
        ctx.host.log('info', 'syncing');
        ctx.host.notify('success', 'done');
        return [];
      },
    });
    plugin.send('{"jsonrpc":"2.0","id":1,"method":"source.sync","params":{}}\n');
    await until(() => plugin.outgoing().length === 3);
    const [log, notify] = plugin.outgoing();
    expect(log).toEqual({ jsonrpc: '2.0', method: 'log', params: { level: 'info', message: 'syncing' } });
    expect(notify).toEqual({ jsonrpc: '2.0', method: 'notify', params: { level: 'success', message: 'done' } });
    plugin.end();
    await plugin.done;
  });
});

describe('shutdown', () => {
  test('shutdown is answered, then serve resolves without waiting for stdin to close', async () => {
    let stopped = false;
    const plugin = startPlugin({
      shutdown: () => {
        stopped = true;
        return null;
      },
    });
    plugin.send('{"jsonrpc":"2.0","id":5,"method":"shutdown","params":{}}\n');
    await plugin.done;
    expect(stopped).toBe(true);
    expect(plugin.outgoing()).toEqual([{ jsonrpc: '2.0', id: 5, result: null }]);
  });

  test('serve resolves when the input ends', async () => {
    const plugin = startPlugin({});
    plugin.end();
    await plugin.done;
    expect(plugin.outgoing()).toEqual([]);
  });

  test('shutdown waits for a request that is still calling the host, so its answer is not lost', async () => {
    const plugin = startPlugin({
      'source.fetchGame': async (_params, ctx) => {
        const apiKey = await ctx.host.secrets.get('apiKey');
        return { game: { source: 'x', sourceId: '1', url: 'u', title: apiKey ?? '' } };
      },
    });
    plugin.send('{"jsonrpc":"2.0","id":1,"method":"source.fetchGame","params":{}}\n');
    await until(() => plugin.outgoing().length === 1);
    const secretCall = plugin.outgoing()[0];
    expect(secretCall).toMatchObject({ method: 'secrets.get' });

    plugin.send('{"jsonrpc":"2.0","id":2,"method":"shutdown","params":{}}\n');
    plugin.send(JSON.stringify({ jsonrpc: '2.0', id: secretCall.id, result: { value: 'key-1' } }) + '\n');
    await plugin.done;

    expect(plugin.outgoing()).toEqual([
      secretCall,
      {
        jsonrpc: '2.0',
        id: 1,
        result: { game: { source: 'x', sourceId: '1', url: 'u', title: 'key-1' } },
      },
      { jsonrpc: '2.0', id: 2, result: null },
    ]);
  });

  test('shutdown answers after the grace period when a request never finishes', async () => {
    const mem = memoryIo();
    const peer = new RpcPeer({
      write: mem.io.write,
      requests: {
        'source.sync': () => new Promise(() => {}),
        shutdown: () => null,
      },
      endAfter: 'shutdown',
      shutdownGraceMs: 20,
    });
    const done = peer.start(mem.io.input);
    mem.send('{"jsonrpc":"2.0","id":1,"method":"source.sync","params":{}}\n');
    mem.send('{"jsonrpc":"2.0","id":2,"method":"shutdown","params":{}}\n');
    await done;
    expect(mem.outgoing()).toEqual([{ jsonrpc: '2.0', id: 2, result: null }]);
  });
});
