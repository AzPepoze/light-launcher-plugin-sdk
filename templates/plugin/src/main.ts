import { servePlugin, type PluginHandlers } from '@light-launcher/plugin-sdk';

// Methods this plugin defines. A command in plugin.json names one of them with "method".
type PluginMethods = {
  '__ID__.hello': { params: Record<string, never>; result: { message: string } };
};

const handlers: PluginHandlers<PluginMethods> = {
  '__ID__.hello': () => ({ message: 'hello from __ID__' }),
  initialize: () => ({
    pluginVersion: '0.1.0',
    capabilities: {
      '__ID__': { browse: true, auth: 'none', updateCheck: false, resolveFiles: false, versioned: false },
    },
  }),
  'source.search': (_params, ctx) => {
    ctx.host.log('debug', 'search called');
    return { games: [] };
  },
  // Return a ref when the URL belongs to this source, otherwise null.
  'source.parseRef': () => null,
};

await servePlugin(handlers);
