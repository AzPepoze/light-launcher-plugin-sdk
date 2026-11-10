import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from '../log';

export const TEMPLATE_DIR = path.resolve(import.meta.dir, '../../../templates/plugin');
const ID_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;
const ID_PLACEHOLDER = '__ID__';

/** Copies the plugin template into <parentDir>/<id> and fills in the id. */
export function initCommand(id: string, parentDir: string, log: Logger): number {
  if (!ID_PATTERN.test(id)) {
    log.error(`invalid id "${id}": use lowercase letters, digits and dashes, 2 to 40 characters`);
    return 1;
  }

  const target = path.join(parentDir, id);
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    log.error(`${target} already exists and is not empty`);
    return 1;
  }

  const files = fs.readdirSync(TEMPLATE_DIR, { recursive: true }) as string[];
  for (const relative of files) {
    const source = path.join(TEMPLATE_DIR, relative);
    if (fs.statSync(source).isDirectory()) continue;
    const content = fs.readFileSync(source, 'utf8').replaceAll(ID_PLACEHOLDER, id);
    const destination = path.join(target, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }

  log.info(`created ${target}`);
  log.info('next: edit src/main.ts, then run llp validate and llp pack');
  return 0;
}
