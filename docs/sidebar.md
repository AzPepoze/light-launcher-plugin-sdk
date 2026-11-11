[Back to the README](../README.md)

# Sidebar and browse filters

A source can show filters beside its list: a search box, toggles, choices, tags and a sort.
The plugin lists the filters in `plugin.json`. The launcher draws them. The plugin does the
filtering, so the launcher never reads the games itself.

## Turn it on

Add `sidebar` to the source, add the `browse:filters` capability, and report it in `initialize`.

```json
"sources": [{
  "id": "site", "label": "Site", "tile": "wide",
  "capabilities": ["browse", "browse:filters"],
  "sidebar": [
    { "type": "search", "id": "text", "placeholder": "Search the site" },
    { "type": "sort", "id": "sort", "options": [{ "value": "date", "label": "Date" }], "orderable": true, "default": { "value": "date", "order": "desc" } }
  ]
}]
```

```ts
capabilities: {
  site: { browse: true, auth: 'none', updateCheck: false, resolveFiles: false, versioned: false, 'browse:filters': true },
}
```

> [!IMPORTANT]
> `sidebar` and `browse:filters` go together. A manifest with one and not the other fails the check.

## Groups

The order in `sidebar` is the order on screen. Every group needs an `id`. Use it as the key in `filters`.

| Type | Fields | What the launcher shows | Value it sends in `filters` |
|---|---|---|---|
| `search` | `id`, `placeholder?` | A text box | None. The text goes in `query` |
| `toggles` | `id`, `options` (`value`, `label`, `icon?`) | On or off rows | The list of values that are on |
| `select` | `id`, `label`, `options` or `dynamic: true` | One choice | One value |
| `multi` | `id`, `label`, `dynamic: true`, `searchable?` | Many choices, loaded with `source.listFilters` | The list of chosen values |
| `sort` | `id`, `options`, `orderable?`, `default?` | A sort choice, and an ascending or descending button when `orderable` is true | Not in `filters`. Sent as `sort` and `order` |

> [!NOTE]
> `default` is `{ "value", "order" }`. Its value must be one of the sort options. `searchable`
> adds a box that filters the options of a `multi` group. `dynamic: true` on `select` or `multi`
> means the options come from `source.listFilters`.

## Methods

| Method | Params | Result |
|---|---|---|
| `source.browse` | `source`, `query?`, `filters?`, `sort?`, `order?`, `cursor?`, `limit` (1 to 100) | `games[]`, `nextCursor?`, `total?` |
| `source.listFilters` | `source`, `group`, `query?`, `limit` (1 to 200) | `options[]` (`value`, `label`, `count?`) |

- `filters` is keyed by group id. A group id the plugin does not know is ignored.
- `source.listFilters` runs for a `select` or `multi` group with `dynamic: true`. `query` is the text in that group's box.
- `count` is the number of games with that value in the whole source. It does not change with the other filters.
- `total` is the number of games that match the filters, when the source knows it.

## Cursors and errors

- A cursor works only with the same `query`, `filters`, `sort` and `order` that made it.
- With any other cursor, answer with error `-32007`, message `invalid_cursor`.
- The launcher drops its cursor when a filter changes, so a plain change never reaches this error.

## Results are not saved

`source.browse` is read-only. The launcher shows the games but never adds them to the user's
library. For the user's own list, use [List games](list-games.md).

## Example

```ts
browse: async ({ query, filters, sort, order, cursor, limit }) => {
  const tags = (filters?.tags as string[] | undefined) ?? [];
  const games = await searchSite({ query, tags, sort, order, cursor, limit });
  return { games: games.items, nextCursor: games.next, total: games.total };
},
listFilters: async ({ query, limit }) => ({
  options: (await siteTags(query)).slice(0, limit),
}),
```

`searchSite` and `siteTags` stand for your own code.
