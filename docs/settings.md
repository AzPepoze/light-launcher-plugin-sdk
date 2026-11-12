[Back to the README](../README.md)

# Settings

A plugin can declare settings that the user changes in the launcher. The launcher builds
a form from the plugin's schema and stores the values. The plugin reads them at runtime.
The full schema is in [schema/settings.schema.json](../schema/settings.schema.json).

## Declare the settings

Point `contributes.settings.$ref` at a JSON Schema file inside the package:

```json
"contributes": {
  "settings": { "$ref": "settings.schema.json" }
}
```

The file must match [schema/settings.schema.json](../schema/settings.schema.json).
The launcher draws one field per top-level property. Each field needs `title` and
`default`. Every supported keyword is listed in [Manifest](manifest.md#settings).

## Read settings

`settings.get` is a plugin-to-launcher request with no params. It returns the plugin's
settings object, validated against the settings schema.

```ts
'source.search': async (params, ctx) => {
  const settings = await ctx.host.settings.get();
  const baseUrl = String(settings.baseUrl ?? 'https://example.test');
  return searchSite(baseUrl, params.query);
},
```

> [!IMPORTANT]
> The launcher does not restart the plugin when settings change. Read the settings on
> every call, not once in `initialize`.

## settings.changed

The launcher sends `settings.changed` after the user saves the settings. It is a
notification: it has no `id` and the plugin does not answer it. The schema defaults are
already applied.

| Param | Type | Meaning |
|---|---|---|
| `settings` | object | The full settings object, with defaults applied |

```json
{"jsonrpc":"2.0","method":"settings.changed","params":{"settings":{"baseUrl":"https://demo.example","useProxy":false}}}
```

Read the new values when the request runs:

- For a short handler, call `ctx.host.settings.get()` at the start of each call.
- While a request is running, `ctx.onSettingsChanged(handler)` calls `handler` with the
  new settings. The listener is removed when the handler answers.
- To react to every save outside a request, pass a `settings.changed` handler as the
  third argument to `servePlugin`.

```ts
'source.sync': async (_params, ctx) => {
  ctx.onSettingsChanged((settings) => {
    ctx.host.log('info', `new base URL: ${String(settings.baseUrl)}`);
  });
  return runSync();
},
```

## x-ll extensions

These optional keywords tell the launcher how to draw a field. They are allowed only on
a top-level property, next to the normal schema keywords.

| Extension | Value | Effect |
|---|---|---|
| `x-ll-group` | non-empty string | Fields with the same group are drawn together |
| `x-ll-widget` | `"folder"` or `"file"` | Adds a folder or file picker. String fields only |
| `x-ll-advanced` | `true` | Hides the field under advanced settings |

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "baseUrl": { "type": "string", "title": "Base URL", "default": "https://example.test", "x-ll-group": "Site" },
    "browseFolder": { "type": "string", "title": "Folder", "default": "", "x-ll-group": "Files", "x-ll-widget": "folder" },
    "useProxy": { "type": "boolean", "title": "Use a proxy", "default": false, "x-ll-advanced": true }
  }
}
```

The schema checks the extension values:

- `x-ll-group` must be a non-empty string.
- `x-ll-widget` must be `"folder"` or `"file"`, and the field must have `type: "string"`.
- `x-ll-advanced` must be exactly `true`.

> [!WARNING]
> The settings schema accepts only the keywords in
> [schema/settings.schema.json](../schema/settings.schema.json). Any other keyword,
> including a mistyped `x-ll-*` extension, fails `llp validate`.

## Validation

`llp validate` reads the file named by `contributes.settings.$ref` and checks it with the
same rules. A manifest without `contributes.settings` has nothing to check.

## Next

- [Manifest](manifest.md#settings): every supported settings keyword
- [Protocol](protocol.md#settingschanged): `settings.changed` in the message list
- [Download hints](download-hints.md): settings the SDK helper uses for downloads
