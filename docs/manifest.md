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
| `author` | text | no | Who wrote the plugin |
| `description` | text | no | What the plugin does, in a sentence or two |
| `homepage` | text | no | Web page for the plugin, such as its repository. Must start with `http://` or `https://` |
| `repository` | text | no | GitHub repository for the planned updater, in `github:owner/repo` form |
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
| `commands` | An action in the command palette | `{ id, label, method? }` |
| `hooks` | Events to react to | `onGameLaunch`, `onGameExit`, `onGameInstalled` |
| `launchAdapters` | A wrapper around game launch | `{ id, label }` |
| `importers` | Import games from another launcher | `{ id, label }` |
| `themes` | Colors and fonts | `{ id, label, path }` |

### settings

`contributes.settings.$ref` names a JSON Schema file inside the package, such as
`settings.schema.json`. The launcher draws one field per top-level property. The file must
match [schema/settings.schema.json](../schema/settings.schema.json). Every property needs a
`title` and a `default`; `llp validate` checks both.

The top level must be an object. `properties` holds the fields, `required` lists the fields
the user must fill, and `additionalProperties` may only be `false`.

Supported field types: `string`, `number`, `integer`, `boolean` and `array`. The UI does not
draw nested objects, so keep every field at the top level.

| Keyword | Applies to | What it does |
|---|---|---|
| `title` | every field | Label shown in the form. Required |
| `description` | every field | Help text under the field |
| `default` | every field | Starting value. Required |
| `examples` | every field | Example values |
| `enum` | string, number, integer, boolean | The allowed values |
| `minimum`, `maximum` | number, integer | Smallest and largest value |
| `minLength`, `maxLength` | string | Length limits |
| `items` | array | The item type: `{ "type": "string" }` or `{ "enum": [...] }`. Required |
| `minItems`, `maxItems` | array | Number of items |
| `uniqueItems` | array | `true` when items must not repeat |
| `required` | top level | Names of the fields the user must fill |
| `additionalProperties` | top level | Only `false` is supported |

The extensions below are optional:

| Extension | Type | What it does |
|---|---|---|
| `x-ll-group` | string | Fields with the same group are drawn together |
| `x-ll-widget` | `"folder"` or `"file"` | Adds a folder or file picker. String fields only |
| `x-ll-advanced` | `true` | Hides the field under advanced settings |

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["baseUrl"],
  "properties": {
    "baseUrl": { "type": "string", "title": "Base URL", "default": "https://example.test" },
    "browseFolder": { "type": "string", "title": "Folder", "default": "", "x-ll-widget": "folder" },
    "useProxy": { "type": "boolean", "title": "Use a proxy", "default": false, "x-ll-advanced": true }
  }
}
```

> [!IMPORTANT]
> The plugin is not restarted when settings change. Read them on each call with
> `ctx.host.settings.get()`. See [settings.changed](protocol.md#settingschanged).

### commands

| Field | Required | What it means |
|---|---|---|
| `id` | yes | Lowercase letters, digits and dashes |
| `label` | yes | Text shown in the command palette |
| `method` | no | The plugin method that runs the command, such as `demo-site.importKey` |

When the user runs a command, the launcher calls its `method`. A method name is two parts
joined by a dot: a lowercase prefix, then letters and digits. By convention the prefix is
the plugin id. The schema checks only the shape. The plugin answers the method like any
other. See [Plugin-defined methods](protocol.md#plugin-defined-methods).

```json
"commands": [{ "id": "import-key", "label": "Import key", "method": "demo-site.importKey" }]
```

Source capabilities:

| Capability | The launcher may call |
|---|---|
| `browse` | `source.search`, `source.fetchGame` |
| `auth` | `source.authStatus`, `source.setCredential`, `source.clearCredential` |
| `updateCheck` | `source.checkUpdate` |
| `resolveFiles` | `source.resolveFiles`, `source.prepareDownload` |
| `sync:games` | `source.sync`, which returns an array of games |
| `sync:index` | `source.sync`, which returns a status object: `count`, `syncedAt`, `running` |

> [!IMPORTANT]
> Declare `sync:games` or `sync:index`, never both. The two names tell the launcher what
> `source.sync` returns. See [Protocol](protocol.md#sourcesync-result).

```json
"sources": [{ "id": "demo", "label": "Demo", "capabilities": ["browse", "auth", "sync:index"] }]
```

## permissions

| Field | Type | What it allows |
|---|---|---|
| `network` | list of hosts | Requests to these hosts. Use `*.example.com` for subdomains |
| `fs` | list of folder names | Access to named folders. See the table below |
| `secrets` | yes or no | Store and read secrets in the system keyring |
| `browser` | yes or no | Open the browser and capture a download link |
| `exec` | yes or no | Start other programs |

### fs folder names

| Name | Folder |
|---|---|
| `$GAMES` | The games folder |
| `$DOWNLOADS` | The downloads folder |
| `$DATA` | The launcher's data folder |
| `$APPDATA_<NAME>` | The data folder of another app, such as `$APPDATA_ITCH` |

> [!IMPORTANT]
> The launcher maps only these names. Any other name is refused, so a name such as
> `$ITCH_APP_DATA` must be written as `$APPDATA_ITCH`.

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
