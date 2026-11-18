#!/usr/bin/env bun
import path from 'node:path';
import { conformanceCommand } from './commands/conformance';
import { devCommand } from './commands/dev';
import { initCommand } from './commands/init';
import { keygenCommand } from './commands/keygen';
import { packCommand } from './commands/pack';
import { signCommand } from './commands/sign';
import { validateCommand } from './commands/validate';
import { createLogger } from '../runtime/logger';

const USAGE = `llp - Light Launcher plugin tool

  llp init <id>                  create a plugin folder from the template
  llp validate [dir]             check plugin.json against the schema
  llp pack [dir] [--out <dir>]   build <id>-<version>.llplugin
  llp test [dir]                 run the plugin and check the protocol
  llp dev [dir]                  link the folder in the launcher and watch its build
  llp keygen [--out <dir>]       create an ed25519 signing key pair
  llp sign <package> --key <pem> [--out <package>]
                                 sign SHA256SUMS and write SIGNATURE
`;

interface ParsedArgs {
  positional: string[];
  out?: string;
  key?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  let out: string | undefined;
  let key: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--key') key = argv[++i];
    else positional.push(argv[i]);
  }
  return { positional, out, key };
}

/** Runs one llp command. Returns the process exit code. */
export async function main(argv: string[], cwd = process.cwd()): Promise<number> {
  const [command, ...rest] = argv;
  const { positional, out, key } = parseArgs(rest);
  const cwdPath = (file: string | undefined) => path.resolve(cwd, file ?? '.');

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
    case 'test':
      return conformanceCommand(cwdPath(positional[0]), createLogger('test'));
    case 'dev':
      return devCommand(cwdPath(positional[0]), createLogger('dev'));
    case 'keygen':
      return keygenCommand(cwdPath(out), createLogger('keygen'));
    case 'sign': {
      const packagePath = positional[0];
      if (!packagePath) return usageError('sign needs a package, e.g. llp sign demo-1.0.0.llplugin --key private.pem');
      return signCommand(
        cwdPath(packagePath),
        { key: key ? cwdPath(key) : undefined, out: out ? cwdPath(out) : undefined },
        createLogger('sign'),
      );
    }
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
