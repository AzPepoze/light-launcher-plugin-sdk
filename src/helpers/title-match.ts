/** Title normalisation, ported from interesting-launcher core/title-match.ts. */

const NOISE = new Set([
  'the', 'a', 'an', 'and', 'of', 'for', 'my', 'to', 'in', 'on', 'public', 'trial', 'demo',
  'win', 'windows', 'pc', 'ver', 'version', 'eng', 'english', 'final', 'build', 'update',
  'game', 'games', 'completed', 'abandoned', 'ongoing', 'renpy', 'unity', 'rpgm', 'html',
]);

function normalizeTitle(input: string): string {
  return input
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/['’`]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\b(?:v|ver|version)\s*\d+(?:\s*\d+)*[a-z]?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function compactTitle(input: string): string {
  return normalizeTitle(input).replace(/[^a-z0-9]/g, '');
}

export function titleTokens(input: string): string[] {
  return [...new Set(normalizeTitle(input).split(' ').filter((t) => t.length > 1 && !NOISE.has(t)))];
}

const ENGINE_WORDS = /\b(renpy|rpgm|html|unity|godot|unreal|flash|qsp)\b/gi;

/** "sample-quest-v1-3-1-69-full-dlcs-remtairy.33777" -> a readable title */
export function titleFromSlug(slug: string): string {
  const body = decodeURIComponent(slug).replace(/\.\d+$/, '').replace(/\/$/, '');
  let text = body.replace(/-/g, ' ');
  text = text.replace(/\bv(\d+(?:\s\d+){1,4})\b/gi, (_m, nums: string) => `v${nums.trim().split(/\s+/).join('.')}`);
  text = text.replace(/\bch\s+(\d+)\b/gi, 'Ch.$1');
  text = text.replace(ENGINE_WORDS, (m) => m.toUpperCase());
  return text
    .split(' ')
    .map((word) => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
    .trim();
}

/** Last version-looking token in the text, such as 1.4.2. Years are skipped. */
export function versionFromText(input: string): string | null {
  const matches = [...input.matchAll(/(?<![0-9a-z])[vV]?(\d{1,3}(?:\.\d{1,4}){1,3}[a-z]?)(?![0-9a-z])/g)];
  if (!matches.length) return null;
  const candidate = matches[matches.length - 1][1];
  if (/^(?:19|20)\d{2}$/.test(candidate)) return null;
  return candidate;
}
