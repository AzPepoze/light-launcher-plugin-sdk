[Back to the README](../README.md)

# Writing a plugin

This guide builds a small source plugin. A source is a website or service that the
launcher can search and read games from.

## 1. Create the folder

```bash
bun src/cli/llp.ts init demo-site
cd demo-site
```

The command makes this layout:

| Path | What it is |
|---|---|
| `plugin.json` | The manifest. See [Manifest](manifest.md) |
| `settings.schema.json` | Settings the user can change. The launcher builds a form from it |
| `src/main.ts` | Your plugin code |
| `package.json` | Build script and SDK dependency |

## 2. Write the handlers

Each handler answers one message from the launcher. The handler gets the params and a
context. The context has `host`, which calls the launcher's services.

```ts
import { servePlugin, type PluginHandlers } from '@light-launcher/plugin-sdk';

const handlers: PluginHandlers = {
  initialize: () => ({
    pluginVersion: '0.1.0',
    capabilities: {
      'demo-site': { browse: true, auth: 'none', updateCheck: false, resolveFiles: false, versioned: false },
    },
  }),

  'source.search': async (params, ctx) => {
    const res = await ctx.host.http.request({ url: `https://demo.example/search?q=${encodeURIComponent(params.query ?? '')}` });
    ctx.host.log('info', `search returned ${res.status}`);
    return { games: [] };
  },
};

await servePlugin(handlers);
```

> [!TIP]
> Use `ctx.host.log(level, message)` for logs. The launcher shows them. Never use `console.log`,
> because stdout carries the protocol.

## 3. Use the helpers

The helpers wrap the host calls, so your code reads like normal code.

| Helper | What it does |
|---|---|
| `HttpClient` with `hostTransport(ctx.host)` | Sends every request through the launcher |
| `load(html)` | Parses HTML with cheerio |
| `extractLinks(doc, selector, hosts, baseUrl)` | Finds download links in a post |
| `compareVersions`, `isNewer` | Compares version text such as `v0.8.1` |
| `scoreMatch`, `normalizeTitle` | Matches a title against another title |

```ts
import { HttpClient, hostTransport, load } from '@light-launcher/plugin-sdk';

const http = new HttpClient(hostTransport(ctx.host));
const page = await http.request('https://demo.example/game/42');
const doc = load(page.text);
const title = doc('h1').text().trim();
```

> [!NOTE]
> For tests, use `fetchTransport()` instead. It calls `fetch` directly. It has no allow-list,
> retries or cache, so it is for tests only.

## 4. Declare what you use

Every host call must be allowed in `plugin.json`. Add the host to `permissions.network`:

```json
"permissions": { "network": ["demo.example"], "fs": [], "secrets": false, "browser": false, "exec": false }
```

A call to a host that is not listed fails with error `-32001`.

## 5. Build the binary

Compile the entry point with Bun. Put the output where the manifest says.

```bash
bun build --compile src/main.ts --outfile bin/linux-x64/demo-site
```

For Windows, cross-compile to a `.exe` file:

```bash
bun build --compile --target=bun-windows-x64 src/main.ts --outfile bin/windows-x64/demo-site.exe
```

Add an entry to `plugin.json` only after its file exists. `llp pack` fails for a missing file.

## 6. Check and pack

```bash
bun src/cli/llp.ts validate
bun src/cli/llp.ts pack --out dist
```

`pack` writes `dist/demo-site-0.1.0.llplugin`. The file is a zip. It holds your manifest,
the binaries, the UI files and a `SHA256SUMS` file with a checksum for each file.

| Check | Done by |
|---|---|
| Manifest matches the schema | `llp validate` and `llp pack` |
| Declared files exist | `llp pack` |
| Checksums | `SHA256SUMS` inside the package |
| Signature | Not yet. Packages are unsigned |

> [!WARNING]
> Unsigned packages show a warning when a user installs them.

## Next

- [Protocol](protocol.md): every message the launcher and plugin send
- [Manifest](manifest.md): every field in `plugin.json`
