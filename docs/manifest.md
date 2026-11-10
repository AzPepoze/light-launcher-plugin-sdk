[Back to the README](../README.md)

# Manifest (plugin.json)

Every plugin has a `plugin.json` file at its root. The launcher reads it before it starts
the plugin. The file must match [schema/plugin.schema.json](../schema/plugin.schema.json).
Unknown keys are errors, so a typo shows up at once.

## Top-level fields

| Field | Type | Required | What it means |
|---|---|---|---|
| `id` | text | yes | Unique id. Lowercase letters, digits and dashes. 2 to 40 characters |
| `name` | text | yes | Name shown to users |
| `version` | text | yes | Your plugin version, in [semver](https://semver.org) form, such as `1.0.0` |
| `apiVersion` | text | yes | Major protocol version you target. Today: `"1"` |
| `minHost` | text | yes | Oldest launcher version that can run the plugin, such as `2.0.0` |
| `entry` | object | yes | The program to start, one path per platform |
| `contributes` | object | yes | What the plugin adds to the launcher |
| `permissions` | object | yes | What the plugin may use |

## entry

Map each platform to a file inside the package. Keys: `linux-x64`, `linux-arm64`,
`windows-x64`, `windows-arm64`, `mac-x64`, `mac-arm64`.

```json
"entry": {
  "linux-x64": "bin/linux-x64/my-plugin",
  "windows-x64": "bin/windows-x64/my-plugin.exe"
}
```

> [!IMPORTANT]
> Paths are relative to the package root. They cannot start with `/` or contain `..`.
> `llp pack` fails if a declared file is missing.

## contributes

| Key | What it adds | Shape |
|---|---|---|
| `sources` | A game source: search, fetch, files, updates | `{ id, label, capabilities[] }` |
| `settings` | A settings form, built from a JSON Schema file | `{ "$ref": "settings.schema.json" }` |
| `pages` | A page in the app | `{ id, title, path }` |
| `commands` | An action in the command palette | `{ id, label }` |
| `hooks` | Events to react to | `onGameLaunch`, `onGameExit`, `onGameInstalled` |
| `launchAdapters` | A wrapper around game launch | `{ id, label }` |
| `importers` | Import games from another launcher | `{ id, label }` |
| `themes` | Colors and fonts | `{ id, label, path }` |

Source capabilities:

| Capability | The launcher may call |
|---|---|
| `browse` | `source.search` |
| `auth` | Reserved. No protocol method yet |
| `updateCheck` | `source.checkUpdate` |
| `resolveFiles` | `source.resolveFiles`, `source.prepareDownload` |
| `sync` | `source.sync` |

## permissions

| Field | Type | What it allows |
|---|---|---|
| `network` | list of hosts | Requests to these hosts. Use `*.example.com` for subdomains |
| `fs` | list of folder names | Access to named folders such as `$GAMES` or `$DOWNLOADS` |
| `secrets` | yes or no | Store and read secrets in the system keyring |
| `browser` | yes or no | Open the browser and capture a download link |
| `exec` | yes or no | Start other programs |

> [!WARNING]
> The launcher blocks what goes through its services. A plugin that opens its own sockets
> is not blocked by the launcher. Only install plugins you trust.

## Example

```json
{
  "id": "demo-site",
  "name": "Demo Site",
  "version": "0.1.0",
  "apiVersion": "1",
  "minHost": "2.0.0",
  "entry": { "linux-x64": "bin/linux-x64/demo-site" },
  "contributes": {
    "sources": [{ "id": "demo", "label": "Demo", "capabilities": ["browse"] }],
    "settings": { "$ref": "settings.schema.json" }
  },
  "permissions": { "network": ["demo.example"], "fs": [], "secrets": false, "browser": false, "exec": false }
}
```

Check a file with `llp validate`.
