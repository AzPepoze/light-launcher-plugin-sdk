/** Checks the params the launcher sends against schema/protocol.schema.json. */
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import protocolSchema from '../../schema/protocol.schema.json';
import { formatError } from './problems';

interface MethodSchema {
  direction: string;
  params?: object;
}

const methods = protocolSchema.methods as unknown as Record<string, MethodSchema | undefined>;
const ajv = new Ajv2020({ allErrors: true });
const validators = new Map<string, ValidateFunction | null>();

/** Problems with the params of a launcher request, one per line. Empty when valid or unknown. */
export function paramProblems(method: string, params: unknown): string[] {
  const validate = validatorFor(method);
  if (!validate || validate(params ?? {})) return [];
  return (validate.errors ?? []).map(formatError);
}

function validatorFor(method: string): ValidateFunction | null {
  if (!validators.has(method)) validators.set(method, compileParams(method));
  return validators.get(method) ?? null;
}

/** Only launcher-to-plugin methods are checked. Plugin-defined methods are not in the schema. */
function compileParams(method: string): ValidateFunction | null {
  const entry = methods[method];
  if (entry?.direction !== 'host-to-plugin' || !entry.params) return null;
  // $defs comes along so the $ref paths inside the params still resolve
  return ajv.compile({ ...entry.params, $defs: protocolSchema.$defs });
}
