import { load as loadCheerio, type Cheerio, type CheerioAPI } from 'cheerio';

/** Ported from interesting-launcher core/html.ts. Parsing uses cheerio. */
export type Doc = CheerioAPI;
export type El = Cheerio<any>;

const WS = /\s+/g;
const UNSAFE_TAGS = 'script,style,iframe,object,embed,form,button,input,textarea,select,noscript,svg,canvas,video,audio';

export function load(html: string): Doc {
  return loadCheerio(html);
}

export function txt(el: El | null | undefined): string {
  if (!el || !el.length) return '';
  return el.text().replace(WS, ' ').trim();
}

export function attr(el: El | null | undefined, name: string): string | null {
  if (!el || !el.length) return null;
  const value = el.attr(name);
  return value == null || value === '' ? null : value;
}

export function absUrl(base: string, href?: string | null): string | null {
  if (!href) return null;
  const raw = href.trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('javascript:') || raw.startsWith('mailto:')) return null;
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

/** Removes anything that can run or track, then makes links absolute. */
export function cleanHtml(doc: Doc, selector: string, baseUrl: string): { html: string; text: string } {
  const found = doc(selector).first();
  if (!found.length) return { html: '', text: '' };

  const clone = found.clone();
  clone.find(UNSAFE_TAGS).remove();
  clone.find('*').each((_, el) => cleanElement(doc(el), baseUrl));

  const html = clone.html()?.trim() ?? '';
  const text = clone.text().replace(WS, ' ').trim();
  return { html, text };
}

function cleanElement(node: El, baseUrl: string): void {
  const attribs: Record<string, string> | undefined = node.get(0)?.attribs;
  if (!attribs) return;
  stripUnsafeAttributes(node, attribs);
  if (node.is('img')) useLazySource(node, attribs, baseUrl);
  for (const name of ['href', 'src']) {
    const abs = absUrl(baseUrl, node.attr(name));
    if (abs) node.attr(name, abs);
  }
}

function stripUnsafeAttributes(node: El, attribs: Record<string, string>): void {
  for (const name of Object.keys(attribs)) {
    if (/^on/i.test(name) || name === 'style' || name.startsWith('data-xf')) node.removeAttr(name);
  }
}

/** Lazy-loaded images keep their real url in data-src or data-url. */
function useLazySource(node: El, attribs: Record<string, string>, baseUrl: string): void {
  const lazy = attribs['data-src'] ?? attribs['data-url'];
  if (!lazy || attribs['src']) return;
  node.attr('src', absUrl(baseUrl, lazy) ?? lazy);
}

export function firstText(doc: Doc, ...selectors: string[]): string {
  for (const selector of selectors) {
    const value = txt(doc(selector).first());
    if (value) return value;
  }
  return '';
}

export function firstAttr(doc: Doc, name: string, ...selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = attr(doc(selector).first(), name);
    if (value) return value;
  }
  return null;
}

/** Site chrome, favicons and avatars are never cover art. */
const IMAGE_SKIP_PATH = /\/(?:styles|emoji|smilies|avatars|assets)\//i;
const IMAGE_SKIP_EXT = /\.(?:svg|ico)$/i;

export function usableImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (IMAGE_SKIP_PATH.test(url) || IMAGE_SKIP_EXT.test(url) || /favicon/i.test(url) || /^data:/i.test(url)) {
    return null;
  }
  return url;
}

const SIZE_MULTIPLIERS: Record<string, number> = {
  b: 1,
  byte: 1,
  bytes: 1,
  kb: 1e3,
  kib: 1024,
  mb: 1e6,
  mib: 1024 ** 2,
  gb: 1e9,
  gib: 1024 ** 3,
  tb: 1e12,
  tib: 1024 ** 4,
};

/** "1.4 GB", "512MB", "1,234.5 MB" -> bytes */
export function parseSize(input?: string | null): number | null {
  if (!input) return null;
  const match = input.replace(/,/g, '').match(/([\d.]+)\s*(bytes?|b|kb|kib|mb|mib|gb|gib|tb|tib)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * (SIZE_MULTIPLIERS[match[2].toLowerCase()] ?? 1));
}

export function absoluteImages(doc: Doc, selector: string, baseUrl: string): string[] {
  const out: string[] = [];
  doc(selector)
    .find('img')
    .each((_, el) => {
      const img = doc(el);
      const src = absUrl(baseUrl, img.attr('src') ?? img.attr('data-src'));
      if (src && !out.includes(src)) out.push(src);
    });
  return out;
}
