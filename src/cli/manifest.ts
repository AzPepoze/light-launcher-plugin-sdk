/** Reads and checks plugin.json against schema/plugin.schema.json. */
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
import pluginSchema from '../../schema/plugin.schema.json';
import type { PluginManifest } from '../types/manifest';

export const MANIFEST_FILE = 'plugin.json';

const ajv = new Ajv2020({ allErrors: true });
const validateSchema = ajv.compile<PluginManifest>(pluginSchema);

/** Human-readable problems, one per line. Empty when the manifest is valid. */
export function manifestProblems(value: unknown): string[] {
  if (validateSchema(value)) return [];
  return (validateSchema.errors ?? []).map(formatError);
}

function formatError(error: ErrorObject): string {
  const where = error.instancePath || '(root)';
  const extra = error.params && 'additionalProperty' in error.params ? ` "${error.params.additionalProperty}"` : '';
  return `${where}: ${error.message ?? 'invalid'}${extra}`;
}

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
