/** Checks plugin.json against schema/plugin.schema.json. Exported as the "./manifest" subpath. */
import Ajv2020 from 'ajv/dist/2020';
import pluginSchema from '../../schema/plugin.schema.json';
import { formatError } from './problems';

const ajv = new Ajv2020({ allErrors: true });
const validateManifest = ajv.compile(pluginSchema);

/** Human-readable problems, one per line. Empty when the manifest is valid. */
export function manifestProblems(value: unknown): string[] {
  if (validateManifest(value)) return sourceRuleProblems(value);
  return (validateManifest.errors ?? []).map(formatError);
}

interface SourceRules {
  cover?: { ratio?: unknown };
  actions?: { id?: unknown }[];
}

/** Checks what JSON Schema cannot: the cover ratio range and unique action ids in each source. */
function sourceRuleProblems(manifest: unknown): string[] {
  const sources = (manifest as { contributes?: { sources?: SourceRules[] } }).contributes?.sources ?? [];
  return sources.flatMap((source, i) => [
    ...coverProblems(source, `/contributes/sources/${i}/cover/ratio`),
    ...actionIdProblems(source, `/contributes/sources/${i}/actions`),
  ]);
}

function coverProblems(source: SourceRules, where: string): string[] {
  const ratio = source.cover?.ratio;
  if (typeof ratio !== 'string' || isCoverInRange(ratio)) return [];
  return [`${where}: must be W:H with sides 1 to 32 and a width to height ratio from 0.25 to 4, not "${ratio}"`];
}

function actionIdProblems(source: SourceRules, where: string): string[] {
  const seen = new Set<unknown>();
  const problems: string[] = [];
  for (const action of source.actions ?? []) {
    if (seen.has(action.id)) problems.push(`${where}: duplicate action id "${String(action.id)}"`);
    seen.add(action.id);
  }
  return problems;
}

const coverPattern = /^([1-9][0-9]?):([1-9][0-9]?)$/;

/** True for "W:H" with sides 1 to 32 and a width to height ratio from 0.25 to 4. */
function isCoverInRange(cover: string): boolean {
  const match = coverPattern.exec(cover);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width <= 32 && height <= 32 && width <= 4 * height && height <= 4 * width;
}
