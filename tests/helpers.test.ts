import { describe, expect, test } from 'bun:test';
import {
  classifyLink,
  compareVersions,
  extractLinks,
  fetchTransport,
  guessFilename,
  HttpClient,
  hostTransport,
  isNewer,
  load,
  matchHost,
  normalizeTitle,
  parseSize,
  platformOf,
  sameVersion,
  scoreMatch,
  versionFromText,
} from '../src/helpers';
import type { HostClient } from '../src/runtime/host-client';
import type { HttpRequestParams, HttpRequestResult } from '../src/types/methods';
import { ErrorCode, RpcFailure } from '../src/types/protocol';

describe('version', () => {
  test('compares numbers part by part', () => {
    expect(compareVersions('0.7', 'v0.8.1')).toBeLessThan(0);
    expect(compareVersions('1.10', '1.9')).toBeGreaterThan(0);
    expect(isNewer('1.0.2', '1.0.1')).toBe(true);
    expect(isNewer('1.0.1', '1.0.1')).toBe(false);
    expect(isNewer('1.0.1', null)).toBe(true);
  });

  test('treats trailing zeros and the v prefix as the same version', () => {
    expect(sameVersion('0.7', 'v0.7.0')).toBe(true);
    expect(sameVersion('0.7', '0.8')).toBe(false);
  });

  test('reads a version out of free text, skipping years', () => {
    expect(versionFromText('My Game Version 1.4.2 Win')).toBe('1.4.2');
    expect(versionFromText('Released 2024')).toBeNull();
  });
});

describe('title match', () => {
  test('normalizes tags, brackets and version noise', () => {
    expect(normalizeTitle('My Game [v0.8.1] (Win)')).toBe('my game');
  });

  test('a compact hit still scores high when spacing differs', () => {
    expect(scoreMatch('Kel Pie Rays', 'KelpieRays')).toBeGreaterThanOrEqual(0.9);
  });

  test('a title that shares its words outscores an unrelated one', () => {
    expect(scoreMatch('Sample Quest', 'Sample Quest Remastered')).toBeGreaterThan(
      scoreMatch('Sample Quest', 'Other Title'),
    );
  });
});

describe('html and size helpers', () => {
  test('parses sizes with decimal and binary units', () => {
    expect(parseSize('1.5 GB')).toBe(1_500_000_000);
    expect(parseSize('512 MiB')).toBe(512 * 1024 * 1024);
    expect(parseSize('1,234.5 MB')).toBe(1_234_500_000);
    expect(parseSize('no size here')).toBeNull();
  });

  test('extracts download anchors from a post body', () => {
    const doc = load(`
      <div class="post">
        <a href="https://pixeldrain.com/u/AbCd1234">Game v1 Win</a>
        <a href="https://example.test/page">Just a page</a>
        <a href="https://other.test/files/game.zip">Linux build</a>
      </div>`);
    const links = extractLinks(doc, '.post', { 'pixeldrain.com': 'mirror' }, 'https://example.test/');
    expect(links.map((l) => [l.host, l.kind, l.platform])).toEqual([
      ['pixeldrain.com', 'mirror', 'windows'],
      ['other.test', 'external', 'linux'],
    ]);
  });
});

describe('link classification', () => {
  test('a mapped host is a mirror, and its label names the platform', () => {
    const info = classifyLink({
      url: 'https://pixeldrain.com/u/xyz',
      label: 'Build Win',
      hosts: { 'pixeldrain.com': 'mirror' },
      baseUrl: 'https://forum.test/',
    });
    expect(info).toMatchObject({ kind: 'mirror', platform: 'windows', requiresAuth: false });
  });

  test('an unknown host only counts when the link looks like a binary', () => {
    const base = { baseUrl: 'https://forum.test/' };
    expect(classifyLink({ url: 'https://unknown.test/page.html', label: 'read', ...base })).toBeNull();
    expect(classifyLink({ url: 'https://unknown.test/game.zip', ...base })?.kind).toBe('external');
  });

  test('a host listed as an attachment host requires auth', () => {
    const info = classifyLink({
      url: 'https://attachments.test/1.zip',
      baseUrl: 'https://forum.test/',
      knownAttachmentHosts: ['attachments.test'],
    });
    expect(info).toMatchObject({ kind: 'attachment', requiresAuth: true });
  });

  test('the longest host key wins', () => {
    expect(matchHost('cdn.files.test', { 'test': 'external', 'files.test': 'mirror' })).toEqual({ kind: 'mirror' });
  });

  test('platform typos are recognised', () => {
    expect(platformOf('Andorid build')).toBe('android');
    expect(platformOf('nothing')).toBe('unknown');
  });

  test('guessFilename removes unsafe characters', () => {
    const link = { url: 'x', host: 'h', label: 'x', kind: 'mirror' as const, platform: 'unknown' as const, filename: null, requiresAuth: false };
    expect(guessFilename(link, 'abc')).toBe('h-abc');
  });
});

describe('http client', () => {
  function fakeHost(respond: (params: HttpRequestParams) => Partial<HttpRequestResult>) {
    const calls: HttpRequestParams[] = [];
    const host = {
      http: {
        request: async (params: HttpRequestParams): Promise<HttpRequestResult> => {
          calls.push(params);
          return { status: 200, url: params.url, text: '{"ok":true}', headers: {}, notModified: false, ...respond(params) };
        },
      },
    } as unknown as HostClient;
    return { host, calls };
  }

  test('routes every request through the host http.request service', async () => {
    const { host, calls } = fakeHost(() => ({}));
    const client = new HttpClient(hostTransport(host));
    await client.request('https://forum.test/thread');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://forum.test/thread');
    expect(calls[0].headers?.['User-Agent']).toContain('Mozilla');
  });

  test('json parses the body', async () => {
    const { host } = fakeHost(() => ({}));
    const client = new HttpClient(hostTransport(host));
    expect(await client.json<{ ok: boolean }>('https://api.test/x')).toEqual({ ok: true });
  });

  test('probe reads size and range support from HEAD headers', async () => {
    const { host, calls } = fakeHost((params) =>
      params.method === 'HEAD' ? { headers: { 'content-length': '2048', 'accept-ranges': 'bytes' } } : {},
    );
    const client = new HttpClient(hostTransport(host));
    expect(await client.probe('https://files.test/game.zip')).toEqual({
      url: 'https://files.test/game.zip',
      status: 200,
      size: 2048,
      ranges: true,
    });
    expect(calls).toHaveLength(1);
  });

  test('the local fetch transport maps 429 to a rate-limit error', async () => {
    const fakeFetch = (async () => new Response('slow down', { status: 429 })) as unknown as typeof fetch;
    const client = new HttpClient(fetchTransport(fakeFetch));
    const err = await client.request('https://site.test/').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcFailure);
    expect((err as RpcFailure).code).toBe(ErrorCode.RateLimited);
  });
});
