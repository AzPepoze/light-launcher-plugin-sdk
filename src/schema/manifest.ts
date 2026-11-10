/** Checks plugin.json against schema/plugin.schema.json. Exported as the "./manifest" subpath. */
import Ajv2020 from 'ajv/dist/2020';
import pluginSchema from '../../schema/plugin.schema.json';
import { formatError } from './problems';

const ajv = new Ajv2020({ allErrors: true });
const validateManifest = ajv.compile(pluginSchema);

/** Human-readable problems, one per line. Empty when the manifest is valid. */
export function manifestProblems(value: unknown): string[] {
  if (validateManifest(value)) return [];
  return (validateManifest.errors ?? []).map(formatError);
}
