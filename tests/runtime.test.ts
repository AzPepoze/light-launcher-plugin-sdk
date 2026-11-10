import { describe, expect, test } from 'bun:test';
import { ErrorCode, RpcFailure } from '../src/types/protocol';
import { servePlugin, type PluginHandlers } from '../src/runtime';
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
    const plugin = startPlugin({ 'source.sync': () => ({ games: [] }) });
    plugin.send('{"jsonrpc":"2.0","id":3,"method":"source.sy');
    plugin.send('nc","params":{}}\r\n');
    await until(() => plugin.outgoing().length === 1);
    expect(plugin.outgoing()[0]).toMatchObject({ id: 3, result: { games: [] } });
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
        return { games: [] };
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
        return { games: [] };
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
        return { games: [] };
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
        return { games: [] };
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
});
