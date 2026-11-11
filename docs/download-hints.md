[Back to the README](../README.md)

# Download hints

Hints tell the launcher where to save a download, and whether to install it after the
download finishes. A plugin sends them in the result of `source.prepareDownload`.
See [Protocol](protocol.md) for the full message.

The SDK has one helper for this. It turns four user settings into the hint fields, and it
makes folder names that are safe on Windows and Linux.

## Use the helper

1. Add the download settings to your settings schema.
2. Read the settings and call `downloadHints` in `source.prepareDownload`.

```ts
import {
  downloadHints,
  downloadSettingsSchemaProperties,
  type DownloadSettings,
} from '@light-launcher/plugin-sdk';

// 1. settings schema: add the four download settings to your own fields
const properties = {
  ...downloadSettingsSchemaProperties,
  baseUrl: { type: 'string', title: 'Site address', default: 'https://demo.example' },
};

// 2. prepareDownload: turn the settings into hints
const settings = (await ctx.host.settings.get()) as DownloadSettings;
return { url, headers, ...downloadHints(settings, { title: game.title }) };
```

> [!TIP]
> The four settings are in the **Downloads** group of the settings form.
> The settings the user saved are already filled with defaults, so `downloadHints` always
> gets a full set of values.

## The four settings

| Setting | Default | What it does | Hint it sets |
|---|---|---|---|
| `downloadRoot` | `downloads` | Save in the downloads folder, or in the games folder | `root` |
| `gameSubfolder` | `true` | Put the files in a folder named after the game | `subfolder` |
| `installAfterDownload` | `false` | Unpack the archive when the download finishes | `install`, `installSubfolder` |
| `deleteArchiveAfterInstall` | `false` | Delete the archive after a good install (advanced) | `deleteArchive` |

> [!NOTE]
> `deleteArchiveAfterInstall` only matters when `installAfterDownload` is on. Without
> install, the helper does not send `deleteArchive`.

## What the helper returns

| Settings | Hints |
|---|---|
| Folder on, no install | `root`, `subfolder` |
| Folder off, no install | `root` |
| Folder on, install | `root`, `subfolder`, `install`, `installSubfolder`, `deleteArchive` |
| Folder off, install | `root`, `install`, `deleteArchive` |

> [!IMPORTANT]
> `root: "games"` and `install: true` need the `$GAMES` permission in the plugin's `fs`
> list. Without it, the download fails with a permission error.

## Folder names

`sanitizeFolderName(title)` makes the folder name from a game title. You can call it
yourself, but `downloadHints` already does.

| Step | Rule | Example in | Result |
|---|---|---|---|
| 1 | Remove forbidden characters | `Dead/Cells?` | `DeadCells` |
| 2 | Make spaces, tabs and new lines single spaces | `Hades \t II` | `Hades II` |
| 3 | Remove leading and trailing dots and spaces | `.hidden.` | `hidden` |
| 4 | Keep at most 200 bytes of UTF-8 (whole characters only) | 300 times `a` | 200 times `a` |
| 5 | Add `_` to a Windows device name | `CON`, `nul.txt` | `CON_`, `nul_.txt` |
| 6 | Use `game` when nothing is left | `<>:` | `game` |

The forbidden characters in step 1 are:

- `<` `>` `:` `"` `|` `?` `*`
- `/` and `\`
- control characters, such as the null character and the delete character

The device names in step 5 are `CON`, `PRN`, `AUX`, `NUL`, `COM1` to `COM9` and `LPT1` to
`LPT9`. The check ignores upper and lower case, and it looks at the part before the first dot.

> [!NOTE]
> Step 4 counts characters, not bytes. An emoji counts as one character.
