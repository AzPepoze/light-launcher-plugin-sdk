import type { ErrorObject } from 'ajv/dist/2020';

/** One line per problem: where it is, what is wrong, and the unknown key when there is one. */
export function formatError(error: ErrorObject): string {
  const where = error.instancePath || '(root)';
  const extra = error.params && 'additionalProperty' in error.params ? ` "${error.params.additionalProperty}"` : '';
  return `${where}: ${error.message ?? 'invalid'}${extra}`;
}
