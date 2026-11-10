import type { Logger } from '../log';
import { readManifest } from '../manifest';

/** Checks plugin.json against the schema. Returns the exit code. */
export function validateCommand(dir: string, log: Logger): number {
  const result = readManifest(dir);
  if (!result.ok) {
    for (const problem of result.problems) log.error(problem);
    return 1;
  }
  log.info(`${result.manifest.id} ${result.manifest.version} is valid`);
  return 0;
}
