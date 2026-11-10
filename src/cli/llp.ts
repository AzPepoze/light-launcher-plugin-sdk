#!/usr/bin/env bun
import path from 'node:path';
import { initCommand } from './commands/init';
import { packCommand } from './commands/pack';
import { validateCommand } from './commands/validate';
import { createLogger } from './log';

const USAGE = `llp - Light Launcher plugin tool

  llp init <id>                  create a plugin folder from the template
  llp validate [dir]             check plugin.json against the schema
  llp pack [dir] [--out <dir>]   build <id>-<version>.llplugin
`;

interface ParsedArgs {
  positional: string[];
  out?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i];
    else positional.push(argv[i]);
  }
  return { positional, out };
}

/** Runs one llp command. Returns the process exit code. */
export async function main(argv: string[], cwd = process.cwd()): Promise<number> {
  const [command, ...rest] = argv;
  const { positional, out } = parseArgs(rest);
  const cwdPath = (dir: string | undefined) => path.resolve(cwd, dir ?? '.');

  switch (command) {
    case 'init': {
      const id = positional[0];
      if (!id) return usageError('init needs a plugin id, e.g. llp init my-plugin');
      return initCommand(id, cwd, createLogger('init'));
    }
    case 'validate':
      return validateCommand(cwdPath(positional[0]), createLogger('validate'));
    case 'pack':
      return packCommand(cwdPath(positional[0]), out ? cwdPath(out) : cwd, createLogger('pack'));
    case undefined:
    case '--help':
    case 'help':
      process.stdout.write(USAGE);
      return 0;
    default:
      return usageError(`unknown command "${command}"`);
  }
}

function usageError(message: string): number {
  process.stderr.write(`${message}\n\n${USAGE}`);
  return 1;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
