/** Reads and checks plugin.json from a folder. */
import fs from 'node:fs';
import path from 'node:path';
import { manifestProblems } from '../schema/manifest';
import type { PluginManifest } from '../types/manifest';

export const MANIFEST_FILE = 'plugin.json';

export type ManifestRead =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; problems: string[] };

/** Loads plugin.json from a folder and validates it. */
export function readManifest(dir: string): ManifestRead {
  const file = path.join(dir, MANIFEST_FILE);
  if (!fs.existsSync(file)) return { ok: false, problems: [`${MANIFEST_FILE} not found in ${dir}`] };

  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { ok: false, problems: [`${MANIFEST_FILE} is not valid JSON: ${(err as Error).message}`] };
  }

  const problems = manifestProblems(value);
  if (problems.length) return { ok: false, problems };
  return { ok: true, manifest: value as PluginManifest };
}
