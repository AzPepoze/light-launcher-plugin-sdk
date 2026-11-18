import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from '../../runtime/logger';
import { readManifest } from '../manifest';

/** The launcher command that links a folder. It is the same command a person runs by hand. */
export const LAUNCHER_COMMAND = 'light-launcher';
const BUILD_SCRIPT = 'build';

/** Lists the entry files that exist but lack the execute bit. Windows has no such bit, so it is skipped. */
export function notExecutable(dir: string, entries: string[]): string[] {
  if (process.platform === 'win32') return [];
  return entries.filter((rel) => {
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) return false;
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return false;
    } catch {
      return true;
    }
  });
}

/** Reads the build script from package.json, or undefined when there is none. */
export function buildScript(dir: string): string | undefined {
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) return undefined;
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { scripts?: Record<string, string> };
  return pkg.scripts?.[BUILD_SCRIPT];
}

/**
 * Links the plugin folder in the launcher, then runs its build script in watch mode until Ctrl+C.
 * The build script must accept --watch. Returns the exit code.
 */
export async function devCommand(dir: string, log: Logger): Promise<number> {
  const read = readManifest(dir);
  if (!read.ok) {
    for (const problem of read.problems) log.error(problem);
    return 1;
  }

  const entries = Object.values(read.manifest.entry).filter((rel): rel is string => Boolean(rel));
  const bad = notExecutable(dir, entries);
  if (bad.length > 0) {
    for (const rel of bad) log.error(`${rel} is not executable. Run chmod +x ${rel}`);
    return 1;
  }

  if (!linkFolder(dir, log)) return 1;

  if (!buildScript(dir)) {
    log.warn('package.json has no build script, so the build cannot run in watch mode');
    return 0;
  }
  return watchBuild(dir, log);
}

/** Asks the launcher to link the folder. Prints the command to run when the launcher is not on PATH. */
function linkFolder(dir: string, log: Logger): boolean {
  const launcher = Bun.which(LAUNCHER_COMMAND);
  const manual = `${LAUNCHER_COMMAND} plugin dev "${dir}"`;
  if (!launcher) {
    log.info(`launcher not found on PATH. Run this to link the plugin: ${manual}`);
    return true;
  }
  const result = Bun.spawnSync([launcher, 'plugin', 'dev', dir], { stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) {
    log.error(`linking failed. Run this to try again: ${manual}`);
    return false;
  }
  log.info(`linked ${dir} in the launcher`);
  return true;
}

async function watchBuild(dir: string, log: Logger): Promise<number> {
  log.info(`watching: bun run ${BUILD_SCRIPT} -- --watch (Ctrl+C to stop)`);
  const child = Bun.spawn([process.execPath, 'run', BUILD_SCRIPT, '--', '--watch'], {
    cwd: dir,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const stop = () => child.kill();
  process.on('SIGINT', stop);
  try {
    return await child.exited;
  } finally {
    process.off('SIGINT', stop);
  }
}
