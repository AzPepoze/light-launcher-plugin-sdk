import fs from 'node:fs';
import path from 'node:path';

/** Writes `<name>.html`; every run of characters outside letters, digits, dot, dash and underscore becomes `_`. */
export function writeDump(dir: string, name: string, body: string): void {
  if (!dir) return;
  const safe = name.replace(/[^\w.-]+/g, '_') || 'page';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${safe}.html`), body);
}
