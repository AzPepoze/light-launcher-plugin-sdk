// A minimal plugin used by tests/stdio.test.ts. It runs as a real child process over stdio.
import { servePlugin } from '../../src/runtime';

await servePlugin({
  initialize: () => ({ pluginVersion: '0.0.1', capabilities: {} }),
  'source.search': async (_params, ctx) => {
    const res = await ctx.host.http.request({ url: 'https://demo.example/' });
    return { games: [{ source: 'demo', sourceId: '1', url: res.url, title: res.text }] };
  },
  shutdown: () => null,
});
