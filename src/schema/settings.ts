/** Checks a plugin's settings schema against schema/settings.schema.json. */
import Ajv2020 from 'ajv/dist/2020';
import settingsSchema from '../../schema/settings.schema.json';
import { formatError } from './problems';

const ajv = new Ajv2020({ allErrors: true });
const validateSettingsSchema = ajv.compile(settingsSchema);
// The x-ll-* extensions are unknown to Ajv; the meta-schema above checks them.
const schemaCompiler = new Ajv2020({ strict: false, addUsedSchema: false });

/** Human-readable problems with a settings schema, one per line. Empty when it is valid. */
export function settingsSchemaProblems(value: unknown): string[] {
  if (!validateSettingsSchema(value)) return (validateSettingsSchema.errors ?? []).map(formatError);
  try {
    schemaCompiler.compile(value as object);
  } catch (err) {
    return [`(root): not a valid JSON Schema: ${(err as Error).message}`];
  }
  return [];
}
