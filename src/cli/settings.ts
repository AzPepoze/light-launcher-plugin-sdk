/** Reads and checks the settings schema that plugin.json points at. */
import fs from 'node:fs';
import path from 'node:path';
import { settingsSchemaProblems } from '../schema/settings';
import type { PluginManifest } from '../types/manifest';

export type SettingsRead = { ok: true } | { ok: false; problems: string[] };

/** Checks contributes.settings.$ref. A manifest without settings has nothing to check. */
export function readSettingsSchema(dir: string, manifest: PluginManifest): SettingsRead {
  const ref = manifest.contributes.settings?.$ref;
  if (!ref) return { ok: true };

  const file = path.join(dir, ref);
  if (!fs.existsSync(file)) return { ok: false, problems: [`settings schema not found: ${ref}`] };

  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { ok: false, problems: [`${ref} is not valid JSON: ${(err as Error).message}`] };
  }

  const problems = settingsSchemaProblems(value);
  if (problems.length) return { ok: false, problems: problems.map((problem) => `${ref}: ${problem}`) };
  return { ok: true };
}
