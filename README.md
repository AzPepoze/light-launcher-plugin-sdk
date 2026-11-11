# Light Launcher plugin SDK

Build plugins for Light Launcher. A plugin is a separate program. The launcher starts it,
talks to it over text messages, and stops it if it crashes.

## What is in this repo

| Part | Import | What it gives you |
|---|---|---|
| Schemas | `schema/` | The rules for `plugin.json` and for the messages |
| Types | `@light-launcher/plugin-sdk/types` | TypeScript types that match the schemas |
| Runtime | `@light-launcher/plugin-sdk/runtime` | `servePlugin`, `sourceHandlers` and the `SourceProvider` contract |
| Helpers | `@light-launcher/plugin-sdk/helpers` | Version compare, title match, link parsing, HTML and HTTP helpers |
| Manifest check | `@light-launcher/plugin-sdk/manifest` | `manifestProblems`, the same check as `llp validate` |
| CLI | `src/cli/llp.ts` | Creates, checks, tests and packs plugins |

## Quick start

> [!NOTE]
> The SDK is not on npm yet. Link it from a local checkout, as shown below.

```bash
# in the SDK folder
bun install
bun link

# in the SDK folder, makes ./my-plugin
bun src/cli/llp.ts init my-plugin
cd my-plugin
bun link @light-launcher/plugin-sdk
bun ../src/cli/llp.ts validate
```

## Use the SDK before it is published

Bun can link a local folder into any project. Do it in two steps:

| Step | Run it in | Command |
|---|---|---|
| 1. Register the SDK | the SDK folder | `bun link` |
| 2. Use the SDK | your plugin folder | `bun link @light-launcher/plugin-sdk` |

The template's `package.json` already says `"link:@light-launcher/plugin-sdk"`, so a
new plugin only needs step 2. If you move the SDK folder, run step 1 again.

> [!IMPORTANT]
> After you change the SDK, run `bun install` in each plugin folder that uses it.
> Bun copies a `file:` dependency into `node_modules`, so the plugin keeps the old copy
> until you install again.

## More

| Topic | Read it when you want to |
|---|---|
| [Writing a plugin](docs/writing-a-plugin.md) | Build your first plugin step by step |
| [Manifest](docs/manifest.md) | Know every field in `plugin.json`, including folder names |
| [Protocol](docs/protocol.md) | Know every message the launcher and plugin send |
| [Download hints](docs/download-hints.md) | Save downloads in the right folder, install them, and build safe folder names |
| [List games](docs/list-games.md) | Show the games a user owns or follows, page through them, and pick the card shape |
| [Sidebar](docs/sidebar.md) | Add search, toggles, choices, tags and a sort beside a source's list |

## Commands

```bash
bun test               # run the tests
bun run typecheck      # check the types
bun src/cli/llp.ts test <dir>   # start a plugin and check the protocol
```
