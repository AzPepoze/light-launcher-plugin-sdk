import { servePlugin, type PluginHandlers } from '@light-launcher/plugin-sdk';

const handlers: PluginHandlers = {
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
