// A minimal plugin used by tests/stdio.test.ts. It runs as a real child process over stdio.
import { servePlugin } from '../../src/runtime';

await servePlugin({
  initialize: () => ({ pluginVersion: '0.0.1', capabilities: {} }),
  'source.search': async (_params, ctx) => {
    const res = await ctx.host.http.request({ url: 'https://demo.example/' });
    return { games: [{ source: 'demo', sourceId: '1', url: res.url, title: res.text }] };
  },
  'source.setCredential': async (params, ctx) => {
    await ctx.host.secrets.set('credential', params.value);
    return { status: 'ok' };
  },
  'source.authStatus': async (_params, ctx) => {
    const value = await ctx.host.secrets.get('credential');
    return { status: value ? 'ok' : 'unconfigured' };
  },
  shutdown: () => null,
});
