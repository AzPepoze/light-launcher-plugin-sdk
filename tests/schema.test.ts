import { describe, expect, test } from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import protocol from '../schema/protocol.schema.json';

const methods = protocol.methods as unknown as Record<string, { params?: object; result?: object }>;
const ajv = new Ajv2020({ allErrors: true });

/** True when value matches the named part of a method, such as its result. */
function matches(method: string, part: 'params' | 'result', value: unknown): boolean {
  const schema = methods[method]?.[part];
  if (!schema) throw new Error(`no ${part} schema for ${method}`);
  return ajv.compile({ ...schema, $defs: protocol.$defs })(value);
}

describe('protocol schema', () => {
  test('prepareDownload may report a filename and size', () => {
    const base = { url: 'https://cdn.test/a.zip', headers: {} };
    expect(matches('source.prepareDownload', 'result', { ...base, filename: 'a.zip', size: 10 })).toBe(true);
    expect(matches('source.prepareDownload', 'result', { ...base, size: -1 })).toBe(false);
  });

  test('browser.assist takes a token and may return headers', () => {
    expect(matches('browser.assist', 'params', { url: 'https://page.test', token: 'job-1' })).toBe(true);
    expect(matches('browser.assist', 'result', { capturedUrl: null, headers: { Cookie: 'c=1' } })).toBe(true);
    expect(matches('browser.assist', 'result', { capturedUrl: null, headers: { Cookie: 1 } })).toBe(false);
  });

  test('a game ref may carry a numeric id', () => {
    const game = { source: 'x', sourceId: '1', url: 'u', title: 't' };
    expect(matches('source.checkUpdate', 'params', { source: 'x', game: { ...game, id: 3 } })).toBe(true);
    expect(matches('source.checkUpdate', 'params', { source: 'x', game: { ...game, id: 'three' } })).toBe(false);
  });

  test('granted fs names follow the same rule as the manifest', () => {
    const permissions = (fs: string[]) => ({ network: [], fs, secrets: false, browser: false, exec: false });
    expect(matches('initialize', 'params', initializeWith(permissions(['$GAMES', '$APPDATA_ITCH'])))).toBe(true);
    expect(matches('initialize', 'params', initializeWith(permissions(['$ITCH_APP_DATA'])))).toBe(false);
  });

  test('downloads.enqueue takes folder and install options', () => {
    const base = { url: 'https://cdn.test/a.zip', filename: 'a.zip' };
    const options = {
      gameId: 3,
      root: 'games',
      subfolder: 'Team/Demo 2 (v1)',
      install: true,
      installSubfolder: 'Pack',
      deleteArchive: false,
    };
    expect(matches('downloads.enqueue', 'params', { ...base, ...options })).toBe(true);
    expect(matches('downloads.enqueue', 'params', base)).toBe(true);
  });

  test('downloads.enqueue refuses unsafe folder paths and unknown roots', () => {
    const base = { url: 'https://cdn.test/a.zip', filename: 'a.zip' };
    const unsafe = ['..', 'a/../b', './a', '/etc', 'C:/games', 'a\\b', 'a:b', 'a//b', 'a/', 'a/.', ''];
    for (const subfolder of unsafe) {
      expect(matches('downloads.enqueue', 'params', { ...base, subfolder })).toBe(false);
      expect(matches('downloads.enqueue', 'params', { ...base, installSubfolder: subfolder })).toBe(false);
    }
    expect(matches('downloads.enqueue', 'params', { ...base, root: 'music' })).toBe(false);
    expect(matches('downloads.enqueue', 'params', { ...base, install: 'yes' })).toBe(false);
    expect(matches('downloads.enqueue', 'params', { ...base, gameId: -1 })).toBe(false);
    expect(matches('downloads.enqueue', 'params', { ...base, where: '/tmp' })).toBe(false);
  });
});

function initializeWith(grantedPermissions: object) {
  return {
    hostVersion: '2.0.0',
    apiVersion: '1',
    platform: 'linux',
    grantedPermissions,
    dataDir: 'plugin-data',
  };
}
