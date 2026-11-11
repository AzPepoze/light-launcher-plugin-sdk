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
  'source.search': async (_params, ctx) => {
    // Settings can change while the plugin runs, so read them on each call.
    const settings = await ctx.host.settings.get();
    const baseUrl = String(settings.baseUrl ?? 'https://example.test');
    ctx.host.log('debug', `search called for ${baseUrl}`);
    return { games: [] };
  },
  // Return a ref when the URL belongs to this source, otherwise null.
  'source.parseRef': () => null,
};

await servePlugin(handlers);
