import { describe, expect, test } from 'bun:test';
import { DOWNLOAD_SETTINGS_DEFAULTS } from '../src/downloads/hints';
import type { DownloadSettings } from '../src/downloads/settings';
import { boolOr, intInRange, parseDownloadSettings, readSettings, textOr } from '../src/helpers';
import type { HostClient } from '../src/runtime/host-client';

function fakeHost(answer: () => Promise<unknown>) {
  const calls: { method: string; timeoutMs?: number }[] = [];
  const host = {
    call: async (method: string, _params: unknown, options?: { timeoutMs?: number }) => {
      calls.push({ method, timeoutMs: options?.timeoutMs });
      return answer();
    },
  } as unknown as Pick<HostClient, 'call'>;
  return { host, calls };
}

describe('settings parsers', () => {
  test('textOr, boolOr and intInRange keep valid values and use the fallback otherwise', () => {
    expect(textOr('  hello ', 'x')).toBe('hello');
    expect(textOr(3, 'x')).toBe('x');
    expect(boolOr(false, true)).toBe(false);
    expect(boolOr('yes', true)).toBe(true);
    expect(intInRange(0, 10)(7, 3)).toBe(7);
    expect(intInRange(0, 10)(11, 3)).toBe(3);
    expect(intInRange(0, 10)(1.5, 3)).toBe(3);
  });
});

describe('parseDownloadSettings', () => {
  test.each<[Record<string, unknown>, DownloadSettings]>([
    [{}, DOWNLOAD_SETTINGS_DEFAULTS],
    [
      { downloadRoot: 'games', gameSubfolder: false, installAfterDownload: true, deleteArchiveAfterInstall: true },
      { downloadRoot: 'games', gameSubfolder: false, installAfterDownload: true, deleteArchiveAfterInstall: true },
    ],
    [
      { downloadRoot: 'music', gameSubfolder: 'yes', installAfterDownload: 1, deleteArchiveAfterInstall: null },
      DOWNLOAD_SETTINGS_DEFAULTS,
    ],
  ])('%j uses the download defaults for missing or invalid values', (raw, expected) => {
    expect(parseDownloadSettings(raw)).toEqual(expected);
  });
});

describe('readSettings', () => {
  test('reads through settings.get with a 5 s timeout and parses the result', async () => {
    const { host, calls } = fakeHost(async () => ({ settings: { size: '7' } }));
    const parsed = await readSettings(host, (raw) => ({ size: Number(raw.size) }), { size: 0 });
    expect(parsed).toEqual({ size: 7 });
    expect(calls).toEqual([{ method: 'settings.get', timeoutMs: 5000 }]);
  });

  test('falls back to the defaults when the host or the parser fails', async () => {
    const failing = fakeHost(async () => {
      throw new Error('no host');
    });
    expect(await readSettings(failing.host, () => ({ ok: true }), { ok: false })).toEqual({ ok: false });

    const badValue = fakeHost(async () => ({ settings: { size: 'nope' } }));
    const parser = (raw: Record<string, unknown>) => {
      if (raw.size === 'nope') throw new Error('bad value');
      return { size: Number(raw.size) };
    };
    expect(await readSettings(badValue.host, parser, { size: 0 })).toEqual({ size: 0 });
  });
});
