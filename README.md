# Light Launcher plugin SDK

Build plugins for Light Launcher. A plugin is a separate program. The launcher starts it,
talks to it over text messages, and stops it if it crashes.

## What is in this repo

| Part | Folder | What it gives you |
|---|---|---|
| Schemas | `schema/` | The rules for `plugin.json` and for the messages |
| Types | `src/types/` | TypeScript types that match the schemas |
| Runtime | `src/runtime/` | Reads and writes messages, and calls launcher services |
| Helpers | `src/helpers/` | Version compare, title match, link parsing, HTML and HTTP helpers |
| CLI | `src/cli/llp.ts` | Creates, checks and packs plugins |

## Quick start

> [!NOTE]
> The SDK is not on npm yet. Use it from a local checkout.

```bash
bun install
bun src/cli/llp.ts init my-plugin
cd my-plugin
bun src/cli/llp.ts validate
```

## More

| Topic | Read it when you want to |
|---|---|
| [Writing a plugin](docs/writing-a-plugin.md) | Build your first plugin step by step |
| [Manifest](docs/manifest.md) | Know every field in `plugin.json` |
| [Protocol](docs/protocol.md) | Know every message the launcher and plugin send |

## Commands

```bash
bun test               # run the tests
bun run typecheck      # check the types
```
