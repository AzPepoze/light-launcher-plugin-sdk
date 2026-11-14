import { describe, expect, test } from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import protocol from '../schema/protocol.schema.json';

const methods = protocol.methods as unknown as Record<string, { params?: object; result?: object }>;
const notifications = protocol.notifications as unknown as Record<string, { params?: object }>;
const ajv = new Ajv2020({ allErrors: true });

/** True when value matches the named part of a method, such as its result. */
function matches(method: string, part: 'params' | 'result', value: unknown): boolean {
  const schema = methods[method]?.[part];
  if (!schema) throw new Error(`no ${part} schema for ${method}`);
  return ajv.compile({ ...schema, $defs: protocol.$defs })(value);
}

/** True when value matches the params of a notification. */
function notificationMatches(notification: string, value: unknown): boolean {
  const schema = notifications[notification]?.params;
  if (!schema) throw new Error(`no params schema for ${notification}`);
  return ajv.compile({ ...schema, $defs: protocol.$defs })(value);
}

describe('protocol schema', () => {
  test('prepareDownload may report a filename, size and download hints', () => {
    const base = { url: 'https://cdn.test/a.zip', headers: {} };
    expect(matches('source.prepareDownload', 'result', { ...base, filename: 'a.zip', size: 10 })).toBe(true);
    expect(matches('source.prepareDownload', 'result', { ...base, size: -1 })).toBe(false);

    const hints = {
      root: 'games',
      subfolder: 'Team/Demo 2 (v1)',
      install: true,
      installSubfolder: 'Pack',
      deleteArchive: false,
    };
    expect(matches('source.prepareDownload', 'result', { ...base, ...hints })).toBe(true);
    expect(matches('source.prepareDownload', 'result', base)).toBe(true);

    const decrypt = {
      algorithm: 'aes-128-ctr',
      key: 'MDEyMzQ1Njc4OWFiY2RlZg==',
      nonce: 'MDEyMzQ1Njc4OWFi',
    };
    expect(matches('source.prepareDownload', 'result', { ...base, decrypt })).toBe(true);
    expect(matches('source.prepareDownload', 'result', { ...base, decrypt: { ...decrypt, algorithm: 'aes-256-gcm' } })).toBe(false);
    expect(matches('source.prepareDownload', 'result', { ...base, decrypt: { algorithm: 'aes-128-ctr', key: 'x' } })).toBe(false);
  });

  test('prepareDownload refuses unsafe folders and bad hint values', () => {
    const base = { url: 'https://cdn.test/a.zip', headers: {} };
    const unsafe = ['..', 'a/../b', './a', '/etc', 'C:/games', 'a\\b', 'a:b', 'a//b', 'a/', 'a/.', ''];
    for (const subfolder of unsafe) {
      expect(matches('source.prepareDownload', 'result', { ...base, subfolder })).toBe(false);
      expect(matches('source.prepareDownload', 'result', { ...base, installSubfolder: subfolder })).toBe(false);
    }
    expect(matches('source.prepareDownload', 'result', { ...base, root: 'music' })).toBe(false);
    expect(matches('source.prepareDownload', 'result', { ...base, install: 'yes' })).toBe(false);
    expect(matches('source.prepareDownload', 'result', { ...base, deleteArchive: 1 })).toBe(false);
    expect(matches('source.prepareDownload', 'result', { ...base, where: '/tmp' })).toBe(false);
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

  test('library.upsert result lists the id of each game', () => {
    expect(matches('library.upsert', 'result', { upserted: 2, ids: [7, 8] })).toBe(true);
    expect(matches('library.upsert', 'result', { upserted: 1 })).toBe(false);
    expect(matches('library.upsert', 'result', { upserted: 1, ids: ['7'] })).toBe(false);
  });

  test('downloads.enqueue result is the numeric queue id', () => {
    expect(matches('downloads.enqueue', 'result', { id: 12 })).toBe(true);
    expect(matches('downloads.enqueue', 'result', { id: '12' })).toBe(false);
    expect(matches('downloads.enqueue', 'result', { id: -1 })).toBe(false);
  });

  test('settings.changed carries the full settings object and no other keys', () => {
    expect(notificationMatches('settings.changed', { settings: { baseUrl: 'https://demo.test' } })).toBe(true);
    expect(notificationMatches('settings.changed', { settings: {} })).toBe(true);
    expect(notificationMatches('settings.changed', { settings: 'x' })).toBe(false);
    expect(notificationMatches('settings.changed', {})).toBe(false);
    expect(notificationMatches('settings.changed', { settings: {}, extra: true })).toBe(false);
  });
});

describe('source.listGames schema', () => {
  const params = { source: 'site', scope: 'mine', limit: 60 };
  const game = { source: 'site', sourceId: '1', url: 'https://site.test/1', title: 'Game' };

  test('accepts a first page, a page with a cursor, and the limit bounds', () => {
    expect(matches('source.listGames', 'params', params)).toBe(true);
    expect(matches('source.listGames', 'params', { ...params, cursor: 'c-2' })).toBe(true);
    expect(matches('source.listGames', 'params', { ...params, limit: 1 })).toBe(true);
    expect(matches('source.listGames', 'params', { ...params, limit: 200 })).toBe(true);
  });

  test('refuses a limit outside 1 to 200, a scope other than mine, and unknown keys', () => {
    expect(matches('source.listGames', 'params', { ...params, limit: 0 })).toBe(false);
    expect(matches('source.listGames', 'params', { ...params, limit: 201 })).toBe(false);
    expect(matches('source.listGames', 'params', { ...params, limit: 1.5 })).toBe(false);
    expect(matches('source.listGames', 'params', { ...params, scope: 'all' })).toBe(false);
    expect(matches('source.listGames', 'params', { source: 'site', limit: 60 })).toBe(false);
    expect(matches('source.listGames', 'params', { ...params, sort: 'title' })).toBe(false);
  });

  test('accepts a result with or without nextCursor and total', () => {
    expect(matches('source.listGames', 'result', { games: [game] })).toBe(true);
    expect(matches('source.listGames', 'result', { games: [], nextCursor: 'c-2', total: 500 })).toBe(true);
    expect(matches('source.listGames', 'result', { games: [], total: 0 })).toBe(true);
  });

  test('refuses a result with a negative total, a bad cursor, a bad game or unknown keys', () => {
    expect(matches('source.listGames', 'result', { games: [], total: -1 })).toBe(false);
    expect(matches('source.listGames', 'result', { games: [], nextCursor: 2 })).toBe(false);
    expect(matches('source.listGames', 'result', { games: [{ title: 'no source' }] })).toBe(false);
    expect(matches('source.listGames', 'result', { games: [], more: true })).toBe(false);
    expect(matches('source.listGames', 'result', {})).toBe(false);
  });

});

describe('source.browse schema', () => {
  const params = { source: 'site', limit: 60 };
  const game = { source: 'site', sourceId: '1', url: 'https://site.test/1', title: 'Game' };

  test('accepts a first page with filters, sort and order, and the limit bounds', () => {
    expect(matches('source.browse', 'params', params)).toBe(true);
    expect(
      matches('source.browse', 'params', {
        ...params,
        query: 'pixel',
        filters: { tags: ['rpg', 'horror'], engine: 'unity', installed: true },
        sort: 'date',
        order: 'desc',
      }),
    ).toBe(true);
    expect(matches('source.browse', 'params', { ...params, cursor: 'c-2', limit: 1 })).toBe(true);
    expect(matches('source.browse', 'params', { ...params, limit: 100 })).toBe(true);
  });

  test('refuses a limit outside 1 to 100, a bad order, a bad filter value and unknown keys', () => {
    expect(matches('source.browse', 'params', { ...params, limit: 0 })).toBe(false);
    expect(matches('source.browse', 'params', { ...params, limit: 101 })).toBe(false);
    expect(matches('source.browse', 'params', { source: 'site' })).toBe(false);
    expect(matches('source.browse', 'params', { ...params, order: 'up' })).toBe(false);
    expect(matches('source.browse', 'params', { ...params, filters: { tags: [1] } })).toBe(false);
    expect(matches('source.browse', 'params', { ...params, filters: { year: 2020 } })).toBe(false);
    expect(matches('source.browse', 'params', { ...params, page: 2 })).toBe(false);
  });

  test('accepts a result with or without nextCursor and total', () => {
    expect(matches('source.browse', 'result', { games: [game] })).toBe(true);
    expect(matches('source.browse', 'result', { games: [], nextCursor: 'c-2', total: 40 })).toBe(true);
    expect(matches('source.browse', 'result', { games: [], total: -1 })).toBe(false);
    expect(matches('source.browse', 'result', { games: [{ title: 'no source' }] })).toBe(false);
  });
});

describe('source.listFilters schema', () => {
  const params = { source: 'site', group: 'tags', limit: 50 };

  test('accepts a group, a filter box text and the limit bounds', () => {
    expect(matches('source.listFilters', 'params', params)).toBe(true);
    expect(matches('source.listFilters', 'params', { ...params, query: 'hor' })).toBe(true);
    expect(matches('source.listFilters', 'params', { ...params, limit: 200 })).toBe(true);
    expect(matches('source.listFilters', 'params', { ...params, limit: 201 })).toBe(false);
    expect(matches('source.listFilters', 'params', { ...params, group: '' })).toBe(false);
    expect(matches('source.listFilters', 'params', { source: 'site', limit: 5 })).toBe(false);
  });

  test('accepts options with and without a count, and refuses a bad option', () => {
    const options = [{ value: 'horror', label: 'Horror', count: 12 }, { value: 'rpg', label: 'RPG' }];
    expect(matches('source.listFilters', 'result', { options })).toBe(true);
    expect(matches('source.listFilters', 'result', { options: [] })).toBe(true);
    expect(matches('source.listFilters', 'result', { options: [{ value: 'x' }] })).toBe(false);
    expect(matches('source.listFilters', 'result', { options: [{ value: 'x', label: 'X', count: -1 }] })).toBe(false);
  });
});

describe('optional capability flags', () => {
  const capabilities = (extra: object) => ({
    pluginVersion: '1.0.0',
    capabilities: {
      site: { browse: true, auth: 'none', updateCheck: false, resolveFiles: false, versioned: false, ...extra },
    },
  });

  test.each(['listGames', 'browse:filters'])('%s is a boolean and may be left out', (key) => {
    expect(matches('initialize', 'result', capabilities({}))).toBe(true);
    expect(matches('initialize', 'result', capabilities({ [key]: true }))).toBe(true);
    expect(matches('initialize', 'result', capabilities({ [key]: 'yes' }))).toBe(false);
  });
});

describe('Light Launcher error codes', () => {
  test.each([-32007, -32008])('%i is listed with the other codes', (code) => {
    expect(protocol.$defs.errorCodes.enum).toContain(code);
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
