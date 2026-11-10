[Back to the README](../README.md)

# Protocol

The launcher and a plugin talk with JSON-RPC 2.0. JSON-RPC is a simple format for
requests, answers and notifications. Each message is one JSON object on one line.
The launcher writes to the plugin's stdin. The plugin writes to its stdout.
The full rules are in [schema/protocol.schema.json](../schema/protocol.schema.json).

> [!IMPORTANT]
> stdout carries protocol messages only. Write logs with `ctx.host.log(...)`, not with
> `console.log`. A stray line on stdout breaks the connection.

## Message kinds

| Kind | Has `id` | Gets an answer | Example |
|---|---|---|---|
| Request | yes | yes, a result or an error | `source.search` |
| Notification | no | no | `progress`, `log`, `cancel` |

## Direction

| Direction | Methods |
|---|---|
| Launcher to plugin | `initialize`, `shutdown`, `source.*` |
| Plugin to launcher | `http.request`, `secrets.*`, `storage.*`, `downloads.enqueue`, `extract`, `library.upsert`, `settings.get`, `browser.assist` |
| Either way (notifications) | `cancel`, `progress`, `log`, `notify`, `browser.progress`, `browser.waiting` |

## Lifecycle

1. The launcher sends `initialize`. The plugin answers with its version and capabilities.
2. The launcher sends `source.*` requests as the user works.
3. The launcher sends `shutdown`. The plugin lets running requests finish for up to 2 seconds,
   answers `shutdown`, then exits.

> [!IMPORTANT]
> The launcher never sends a credential in `initialize`. The plugin reads and saves its
> own secrets with `secrets.get`, `secrets.set` and `secrets.delete`.

## Launcher methods

| Method | Params | Result |
|---|---|---|
| `initialize` | `hostVersion`, `apiVersion`, `platform`, `grantedPermissions`, `dataDir` | `pluginVersion`, `capabilities` |
| `shutdown` | none | `null` |
| `source.search` | `source`, `url?`, `query?`, `page?` | `games[]` |
| `source.fetchGame` | `source`, `ref` | `game` |
| `source.resolveFiles` | `source`, `game` | `files[]` |
| `source.prepareDownload` | `source`, `file`, `game` | `url`, `headers`, `filename?`, `size?` |
| `source.checkUpdate` | `source`, `game` | `update` or `null` |
| `source.sync` | `source` | `games[]` or `SyncStatus` (see below) |
| `source.authStatus` | `source` | `AuthState` |
| `source.setCredential` | `source`, `value` | `AuthState` |
| `source.clearCredential` | `source` | `AuthState` |
| `source.parseRef` | `url` | `Ref` or `null` |

### GameRef

The launcher sends a `GameRef` as `game` in `source.resolveFiles`, `source.prepareDownload`
and `source.checkUpdate`.

| Field | Type | What it is |
|---|---|---|
| `id` | integer, optional | The launcher's own id for the game, when it has one |
| `source`, `sourceId`, `url`, `title` | string | The game as the source reported it |
| `version`, `updatedAt` | string or null, optional | The version and date the launcher has |
| `extra` | object or null, optional | Extra data the source stored |

### initialize

| Field | Type | What it is |
|---|---|---|
| `hostVersion` | string | The launcher version |
| `apiVersion` | string | The protocol major version |
| `platform` | string | `windows`, `linux`, `mac`, `android` or `unknown` |
| `grantedPermissions` | object | The permissions the user allowed |
| `dataDir` | string | A private folder for this plugin. Put caches and indexes here |

### source.sync result

`source.sync` returns one of two shapes. The `syncMode` is set by the source's
`sync:games` or `sync:index` capability in `plugin.json`. See [Manifest](manifest.md).

| Capability | Result |
|---|---|
| `sync:games` | An array of games: `GameDTO[]` |
| `sync:index` | A status object: `{ count, syncedAt, running }` |

```json
{"count": 1250, "syncedAt": "2026-11-10T08:00:00Z", "running": false}
```

| Field | Type | Meaning |
|---|---|---|
| `count` | integer | How many entries the index holds |
| `syncedAt` | string or null | When the last sync finished |
| `running` | boolean | `true` while a sync is still running |

### Credentials

| Method | Result | What the plugin does |
|---|---|---|
| `source.setCredential` | `AuthState` | Checks the value, then calls `secrets.set` when it works |
| `source.authStatus` | `AuthState` | Reads the secret with `secrets.get` and checks it |
| `source.clearCredential` | `AuthState` | Calls `secrets.delete` |

`AuthState` has `status` (`unconfigured`, `ok`, `expired`, `invalid` or `error`), and
optional `user`, `message` and `checkedAt`.

### parseRef

`source.parseRef` takes a URL and returns the `Ref` for it (`kind`, `id`, `url`), or `null`
when the URL is not one the source knows.

### Plugin-defined methods

A plugin can add its own methods, such as one that runs a command. The launcher calls them
the same way as `source.*` methods, with a request and an answer.

| Where it is named | What it does |
|---|---|
| `contributes.commands[].method` in `plugin.json` | The method the launcher calls when the user runs the command |

```ts
type PluginMethods = {
  'demo-site.importKey': { params: Record<string, never>; result: { found: boolean } };
};

const handlers: PluginHandlers<PluginMethods> = {
  'demo-site.importKey': async () => ({ found: true }),
};
```

> [!NOTE]
> The type argument of `PluginHandlers` types each plugin method. A handler with the wrong
> result type does not compile.

## Plugin services

The launcher checks the permission in the manifest before it runs a service.

| Method | Needs permission | Params | Result |
|---|---|---|---|
| `http.request` | `network` host | `url`, `method?`, `headers?`, `body?`, `timeoutMs?`, `retries?`, `cacheKey?`, `maxBytes?`, `allowStatus?` | `status`, `url`, `text`, `headers`, `notModified` |
| `secrets.get` | `secrets` | `key` | `value` or `null` |
| `secrets.set` | `secrets` | `key`, `value` | `null` |
| `secrets.delete` | `secrets` | `key` | `null` |
| `storage.get` | none | `key` | `value` |
| `storage.set` | none | `key`, `value` | `null` |
| `downloads.enqueue` | none | `url`, `filename`, `title?`, `size?`, `headers?` | `id` |
| `extract` | `fs` | `archive`, `destination` | `destination` |
| `library.upsert` | none | `games[]` | `upserted` |
| `settings.get` | none | none | `settings` |
| `browser.assist` | `browser` | `url`, `timeoutMs?`, `token?` | `capturedUrl`, `filename?`, `size?`, `headers?` |

> [!NOTE]
> `http.request` does the rate limit, the retries and the ETag cache for the plugin.

### browser.assist

The launcher opens the system browser at `url` and waits for a download link.

| Field | Params or result | Meaning |
|---|---|---|
| `url` | param | The page to open |
| `timeoutMs` | param, optional | How long to wait |
| `token` | param, optional | A string the launcher echoes in `browser.waiting` and `browser.progress` |
| `capturedUrl` | result | The download link, or `null` when nothing was caught |
| `filename` | result, optional | The file name the browser reported |
| `size` | result, optional | The file size in bytes |
| `headers` | result, optional | Headers the download needs, such as `Cookie` |

While the browser is open, the launcher sends `browser.waiting` and `browser.progress`.
Their `token` is the `token` you sent, or the request id as a string when you sent none.
Use a `token` when one plugin runs several browser calls at once.

### source.prepareDownload result

| Field | Type | Meaning |
|---|---|---|
| `url` | string | The link to download |
| `headers` | object | Headers the download must send |
| `filename` | string, optional | The file name, when the plugin knows it |
| `size` | integer, optional | The size in bytes, when the plugin knows it |

## Notifications

| Notification | Sent by | Params |
|---|---|---|
| `cancel` | launcher | `id`: the request to stop |
| `browser.progress` | launcher | `token`, `percent` (0 to 100), `message?` |
| `browser.waiting` | launcher | `token`, `message`: the user must act, such as press a download button |
| `progress` | plugin | `id`, `done?`, `total?`, `message?` |
| `log` | plugin | `level`, `message`, `data?` |
| `notify` | plugin | `level`, `message` |


## Cancel and timeouts

- The launcher sends `cancel` with the request id. The plugin should stop and answer with error `-32002`.
- A plugin request can have a timeout. When it runs out, the caller gets error `-32003`.

## Errors

| Code | Name | Meaning |
|---|---|---|
| -32700 | Parse error | The line is not JSON |
| -32600 | Invalid request | Not a JSON-RPC 2.0 message |
| -32601 | Method not found | No handler for this method |
| -32602 | Invalid params | Params do not match the schema |
| -32603 | Internal error | Something broke inside the plugin or the launcher |
| -32001 | Permission denied | The manifest does not grant this service |
| -32002 | Canceled | The request was canceled |
| -32003 | Timeout | The request took too long |
| -32004 | Rate limited | The site returned 429 |
| -32005 | Remote error | The site returned an error the plugin did not allow |
| -32006 | Not modified | The site answered 304. Keep the old data |

## Example

Launcher sends a search:

```json
{"jsonrpc":"2.0","id":1,"method":"source.search","params":{"source":"demo","query":"space"}}
```

Plugin asks the launcher for a page:

```json
{"jsonrpc":"2.0","id":7,"method":"http.request","params":{"url":"https://demo.example/search?q=space"}}
```

Launcher answers the page request:

```json
{"jsonrpc":"2.0","id":7,"result":{"status":200,"url":"https://demo.example/search?q=space","text":"...","headers":{},"notModified":false}}
```

Plugin answers the search:

```json
{"jsonrpc":"2.0","id":1,"result":{"games":[]}}
```
