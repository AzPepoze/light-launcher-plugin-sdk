/** Download link parsing, ported from interesting-launcher core/links.ts. */
import type { FileKind, Platform } from '../types/game';
import { absUrl, type Doc } from './html';

export interface HostRule {
  kind: FileKind;
  platform?: Platform;
}

export type HostMap = Record<string, FileKind | HostRule>;

export interface LinkInfo {
  url: string;
  host: string;
  label: string;
  kind: FileKind;
  platform: Platform;
  filename: string | null;
  requiresAuth: boolean;
}

// underscores, dots and dashes are separators in filenames ("Game_v1.2_Win.zip")
const EDGE = '(?:^|[^a-z0-9])';
const TAIL = '(?=[^a-z0-9]|$)';
const PLATFORM_PATTERNS: [RegExp, Platform][] = [
  [new RegExp(`${EDGE}(?:windows|win(?:32|64)?|x64|pc)${TAIL}`, 'i'), 'windows'],
  [new RegExp(`${EDGE}(?:linux(?:64)?|unix|appimage|x86_64)${TAIL}`, 'i'), 'linux'],
  [new RegExp(`${EDGE}(?:mac(?:os)?|osx|darwin|dmg)${TAIL}`, 'i'), 'mac'],
  [new RegExp(`${EDGE}(?:android|apk)${TAIL}`, 'i'), 'android'],
];

/** Forum posts are written by hand; these are the misspellings seen on real threads. */
const PLATFORM_TYPOS: Record<string, Platform> = {
  andorid: 'android',
  andriod: 'android',
  andoid: 'android',
  androd: 'android',
  windwos: 'windows',
  wndows: 'windows',
  winows: 'windows',
  linx: 'linux',
  lunix: 'linux',
  macso: 'mac',
};

const ARCHIVE_RE = /\.(zip|rar|7z|tar|gz|tgz|xz|bz2|zst|iso|jar|apk)$/i;
const BINARY_RE = /\.(exe|msi|appimage|dmg|sh|bat|cmd|x86_64|run)$/i;
const JUNK_RE = /\.(png|jpe?g|gif|webp|svg|ico|css|js|mp4|webm|mp3|ogg|wav|pdf|txt|md)$/i;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** The longest matching host key wins, so "a.b.com" beats "b.com". */
export function matchHost(host: string, map: HostMap): HostRule | null {
  let best: { key: string; rule: HostRule } | null = null;
  for (const [key, value] of Object.entries(map)) {
    const normalized = key.toLowerCase().replace(/^www\./, '');
    if (host !== normalized && !host.endsWith(`.${normalized}`)) continue;
    if (!best || normalized.length > best.key.length) {
      best = { key: normalized, rule: typeof value === 'string' ? { kind: value } : value };
    }
  }
  return best?.rule ?? null;
}

/** Every platform named in the text, in a stable order. */
export function platformsIn(...texts: (string | null | undefined)[]): Platform[] {
  const haystack = texts.filter(Boolean).join(' ');
  const out: Platform[] = [];
  for (const [pattern, platform] of PLATFORM_PATTERNS) {
    if (pattern.test(haystack) && !out.includes(platform)) out.push(platform);
  }
  for (const word of haystack.toLowerCase().match(/[a-z]+/g) ?? []) {
    const platform = PLATFORM_TYPOS[word];
    if (platform && !out.includes(platform)) out.push(platform);
  }
  return out;
}

export function platformOf(...texts: (string | null | undefined)[]): Platform {
  return platformsIn(...texts)[0] ?? 'unknown';
}

export function fileNameFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const last = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '');
    if (!last || last.length > 160) return null;
    return /\.[a-z0-9]{2,5}$/i.test(last) ? last : null;
  } catch {
    return null;
  }
}

export interface ClassifyInput {
  url: string;
  label?: string | null;
  hosts?: HostMap;
  baseUrl: string;
  knownAttachmentHosts?: string[];
}

/** Decides whether a link is a download, and what kind. Returns null for anything else. */
export function classifyLink(input: ClassifyInput): LinkInfo | null {
  const url = absUrl(input.baseUrl, input.url);
  if (!url) return null;
  const host = hostOf(url);
  if (!host) return null;
  const label = (input.label ?? '').replace(/\s+/g, ' ').trim();
  const filename = fileNameFromUrl(url);

  if (JUNK_RE.test(url) && !ARCHIVE_RE.test(url)) return null;

  const binary = looksBinary(url, label);
  const rule = ruleFor(host, input, binary);
  if (!rule) return null;
  if (rule.kind === 'external' && !binary) return null;

  return {
    url,
    host,
    label: label || filename || host,
    kind: rule.kind,
    platform: platformOf(label, filename, url),
    filename,
    requiresAuth: rule.kind === 'attachment',
  };
}

function looksBinary(url: string, label: string): boolean {
  return ARCHIVE_RE.test(url) || BINARY_RE.test(url) || ARCHIVE_RE.test(label) || BINARY_RE.test(label);
}

/** A known host rule wins. Unknown hosts only count when the link looks like a binary. */
function ruleFor(host: string, input: ClassifyInput, binary: boolean): HostRule | null {
  const mapped = input.hosts ? matchHost(host, input.hosts) : null;
  if (mapped) return mapped;
  if (input.knownAttachmentHosts?.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { kind: 'attachment' };
  }
  return binary ? { kind: 'external' } : null;
}

/** Every real download link inside a post body. */
export function extractLinks(doc: Doc, selector: string, hosts: HostMap, baseUrl: string): LinkInfo[] {
  const out = new Map<string, LinkInfo>();
  doc(selector)
    .find('a[href]')
    .each((_, el) => {
      const anchor = doc(el);
      const href = anchor.attr('href');
      if (!href) return;
      const info = classifyLink({ url: href, label: anchor.text(), hosts, baseUrl });
      if (info && !out.has(info.url)) out.set(info.url, info);
    });
  return [...out.values()];
}

/** Best-guess filename for a mirror whose url is opaque. */
export function guessFilename(link: LinkInfo, fallback: string): string {
  const raw = link.filename ?? `${link.host}-${fallback}`;
  return raw.replace(/[^\w.\-+() \[\]]+/g, '_').trim() || 'download.bin';
}
