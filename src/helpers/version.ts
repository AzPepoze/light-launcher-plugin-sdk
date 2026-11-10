/**
 * Fuzzy version handling, ported from interesting-launcher core/version.ts.
 * Sources are inconsistent: v0.7 / 0.7a / 1.0.2-hotfix / Ch.5 / Ep.3 / 2024-05-01.
 */
export type VersionKind = 'num' | 'v' | 'ch' | 'ep' | 'date';

export interface ParsedVersion {
  raw: string;
  kind: VersionKind;
  nums: number[];
  suffix: string;
}

const PREFIX = /^(?:ch(?:apter)?|ep(?:isode)?|v(?:er(?:sion)?)?|ver\.?|build|update|part)\s*[.:_-]?\s*/i;

function kindOfPrefix(prefix: string): VersionKind {
  if (prefix.startsWith('ch')) return 'ch';
  if (prefix.startsWith('ep')) return 'ep';
  return 'v';
}

export function parseVersion(input?: string | null): ParsedVersion | null {
  if (input == null) return null;
  const raw = String(input).trim().replace(/^[[(<{]+|[)\]>}]+$/g, '').trim();
  if (!raw) return null;

  const date = raw.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (date) {
    return { raw, kind: 'date', nums: [Number(date[1]), Number(date[2]), Number(date[3])], suffix: '' };
  }

  let kind: VersionKind = 'num';
  let rest = raw;
  const prefix = raw.match(PREFIX);
  if (prefix) {
    kind = kindOfPrefix(prefix[0].toLowerCase());
    rest = raw.slice(prefix[0].length);
  }

  const nums = (rest.match(/\d+/g) ?? []).map(Number);
  if (!nums.length) return null;
  const suffix = (rest.match(/([a-z]+)\s*$/i)?.[1] ?? '').toLowerCase();
  return { raw, kind, nums, suffix };
}

/** chapter, episode and date labels: different labels never compare by number */
function isLabelKind(kind: VersionKind): boolean {
  return kind === 'ch' || kind === 'ep' || kind === 'date';
}

/** chapter and episode keys keep their label; plain versions share one family */
function isChapterOrEpisode(kind: VersionKind): boolean {
  return kind === 'ch' || kind === 'ep';
}

/** negative = a older, 0 = equal, positive = a newer */
export function compareVersions(a?: string | null, b?: string | null): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;

  const n = Math.max(pa.nums.length, pb.nums.length);
  for (let i = 0; i < n; i++) {
    const x = pa.nums[i] ?? 0;
    const y = pb.nums[i] ?? 0;
    if (x !== y) return x - y;
  }
  if (pa.suffix !== pb.suffix) return pa.suffix < pb.suffix ? -1 : 1;
  if (pa.kind !== pb.kind && isLabelKind(pa.kind) && isLabelKind(pb.kind)) {
    return pa.raw.localeCompare(pb.raw, undefined, { numeric: true });
  }
  return 0;
}

export function isNewer(candidate?: string | null, current?: string | null): boolean {
  if (candidate == null || candidate === '') return false;
  if (current == null || current === '') return true;
  if (candidate.trim() === current.trim()) return false;
  return compareVersions(candidate, current) > 0;
}

/** stable key for equality checks (0.7 == v0.7 == 0.7.0) */
export function versionKey(input?: string | null): string | null {
  const parsed = parseVersion(input);
  if (!parsed) return null;
  const trimmed = parsed.nums.slice();
  while (trimmed.length > 1 && trimmed[trimmed.length - 1] === 0) trimmed.pop();
  const family = isChapterOrEpisode(parsed.kind) ? parsed.kind : 'v';
  return `${family}${trimmed.join('.')}${parsed.suffix}`;
}

export function sameVersion(a?: string | null, b?: string | null): boolean {
  const keyA = versionKey(a);
  const keyB = versionKey(b);
  if (keyA && keyB) return keyA === keyB;
  return (a ?? '') === (b ?? '');
}
