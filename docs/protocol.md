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
| Either way (notifications) | `cancel`, `progress`, `log`, `notify` |

## Lifecycle

1. The launcher sends `initialize`. The plugin answers with its version and capabilities.
2. The launcher sends `source.*` requests as the user works.
3. The launcher sends `shutdown`. The plugin answers, then exits.

## Launcher methods

| Method | Params | Result |
|---|---|---|
| `initialize` | `hostVersion`, `apiVersion`, `platform`, `grantedPermissions` | `pluginVersion`, `capabilities` |
| `shutdown` | none | `null` |
| `source.search` | `source`, `url?`, `query?`, `page?` | `games[]` |
| `source.fetchGame` | `source`, `ref` | `game` |
| `source.resolveFiles` | `source`, `game` | `files[]` |
| `source.prepareDownload` | `source`, `file`, `game` | `url`, `headers` |
| `source.checkUpdate` | `source`, `game` | `update` or `null` |
| `source.sync` | `source` | `games[]` |

## Plugin services

The launcher checks the permission in the manifest before it runs a service.

| Method | Needs permission | Params | Result |
|---|---|---|---|
| `http.request` | `network` host | `url`, `method?`, `headers?`, `body?`, `timeoutMs?`, `retries?`, `cacheKey?`, `maxBytes?`, `allowStatus?` | `status`, `url`, `text`, `headers`, `notModified` |
| `secrets.get` | `secrets` | `key` | `value` or `null` |
| `secrets.set` | `secrets` | `key`, `value` | `null` |
| `storage.get` | none | `key` | `value` |
| `storage.set` | none | `key`, `value` | `null` |
| `downloads.enqueue` | none | `url`, `filename`, `title?`, `size?`, `headers?` | `id` |
| `extract` | `fs` | `archive`, `destination` | `destination` |
| `library.upsert` | none | `games[]` | `upserted` |
| `settings.get` | none | none | `settings` |
| `browser.assist` | `browser` | `url`, `message?`, `timeoutMs?` | `capturedUrl` or `null` |

> [!NOTE]
> `http.request` does the rate limit, the retries and the ETag cache for the plugin.

## Notifications

| Notification | Sent by | Params |
|---|---|---|
| `cancel` | launcher | `id`: the request to stop |
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
