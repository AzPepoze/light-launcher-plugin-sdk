[Back to the README](../README.md)

# List games

`source.listGames` lets the launcher ask a source for the games the user owns, follows or
bookmarks. The launcher reads the list one page at a time and adds the games to its library.

> [!NOTE]
> This is a backwards compatible addition, so it is a minor version change. A plugin that does
> not implement it keeps working as before.

Browsing a whole site stays `source.search`. `source.listGames` is only for the user's own list.

## Turn it on

Declare the capability and the card shape in `plugin.json`, then report it in `initialize`:

```json
"sources": [{ "id": "site", "label": "Site", "tile": "wide", "capabilities": ["browse", "listGames"] }]
```

```ts
capabilities: {
  site: { browse: true, auth: 'none', updateCheck: false, resolveFiles: false, versioned: false, listGames: true },
}
```

## Params

| Field | Type | Required | Meaning |
|---|---|---|---|
| `source` | string | yes | The source id |
| `scope` | `"mine"` | yes | The only value for now: the games the user owns, follows or bookmarked |
| `cursor` | string | no | The `nextCursor` from the last page. Left out on the first page |
| `limit` | integer, 1 to 200 | yes | How many games to return at most |

## Result

| Field | Type | Meaning |
|---|---|---|
| `games` | `GameDTO[]` | The games on this page. Same shape as in `source.search` |
| `nextCursor` | string | Send it back as `cursor` for the next page. Left out on the last page |
| `total` | integer, 0 or more | How many games the list has, when the source knows it |

## Cursor and paging rules

- **Stable cursors.** A cursor you gave out must still work for the next call. Do not change
  the order of the list between pages without a reason.
- **Opaque cursors.** The launcher does not read the cursor. Use any string, such as an offset
  or a site token.
- **Quick pages.** The launcher waits for each page before it asks for the next one. Answer
  each page with a few requests at most, and use your cache for slow sites.
- **Page size.** Return no more than `limit` games, which is at most 200.
- **The launcher pages through everything.** It keeps asking until there is no `nextCursor`.
  Never return a cursor that leads back to the same page.
- **Plugins own their caching.** The launcher does not cache the list for you. Keep the full
  list, or an index of it, in `dataDir` from `initialize`.

## The tile

`tile` sets the shape of the game cards for this source in the library.

| Tile | Ratio | Use it for |
|---|---|---|
| `poster` | 3:4 | Tall cover art. The default when `tile` is left out |
| `wide` | 16:9 | Wide banners |
| `square` | 1:1 | Square icons |

## Example

A handler that pages through a list it has already fetched and cached:

```ts
import { servePlugin, type PluginHandlers } from '@light-launcher/plugin-sdk';

// Your code: fetch the owned games once, keep them in dataDir, and return them.
declare function loadOwnedGames(): Promise<{ id: string; url: string; title: string }[]>;

const handlers: PluginHandlers = {
  initialize: () => ({
    pluginVersion: '0.1.0',
    capabilities: {
      site: { browse: true, auth: 'none', updateCheck: false, resolveFiles: false, versioned: false, listGames: true },
    },
  }),
  'source.listGames': async ({ source, cursor, limit }) => {
    const all = await loadOwnedGames();
    const start = Number(cursor ?? 0);
    const games = all.slice(start, start + limit).map((item) => ({
      source,
      sourceId: item.id,
      url: item.url,
      title: item.title,
    }));
    const next = start + games.length;
    return { games, total: all.length, nextCursor: next < all.length ? String(next) : undefined };
  },
};

await servePlugin(handlers);
```

> [!TIP]
> An offset works as a cursor when the list only changes between runs. If the site can add
> or remove games while the user pages, use the site's own page token instead.
