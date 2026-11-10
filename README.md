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
bun src/cli/llp.ts test <dir>   # start a plugin and check the protocol
```
