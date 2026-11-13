import { describe, expect, test } from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import protocol from '../schema/protocol.schema.json';
import { manifestProblems } from '../src/schema/manifest';
import { settingsSchemaProblems } from '../src/schema/settings';

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

  test('the listGames capability is a boolean and may be left out', () => {
    const capabilities = (extra: object) => ({
      pluginVersion: '1.0.0',
      capabilities: {
        site: { browse: true, auth: 'none', updateCheck: false, resolveFiles: false, versioned: false, ...extra },
      },
    });
    expect(matches('initialize', 'result', capabilities({}))).toBe(true);
    expect(matches('initialize', 'result', capabilities({ listGames: true }))).toBe(true);
    expect(matches('initialize', 'result', capabilities({ listGames: 'yes' }))).toBe(false);
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

describe('invalid_cursor error code', () => {
  test('is listed with the other Light Launcher codes', () => {
    expect(protocol.$defs.errorCodes.enum).toContain(-32007);
  });
});

describe('auth required error code', () => {
  test('is listed with the other Light Launcher codes', () => {
    expect(protocol.$defs.errorCodes.enum).toContain(-32008);
  });
});

describe('browse:filters capability', () => {
  test('is a boolean and may be left out', () => {
    const capabilities = (extra: object) => ({
      pluginVersion: '1.0.0',
      capabilities: {
        site: { browse: true, auth: 'none', updateCheck: false, resolveFiles: false, versioned: false, ...extra },
      },
    });
    expect(matches('initialize', 'result', capabilities({ 'browse:filters': true }))).toBe(true);
    expect(matches('initialize', 'result', capabilities({ 'browse:filters': 'yes' }))).toBe(false);
  });
});

describe('plugin manifest schema', () => {
  const manifest = (source: object) => ({
    id: 'demo-site',
    name: 'Demo Site',
    version: '1.0.0',
    apiVersion: '1',
    minHost: '2.0.0',
    entry: { 'linux-x64': 'bin/linux-x64/demo-site' },
    contributes: { sources: [{ id: 'site', label: 'Site', ...source }] },
    permissions: {},
  });

  test('accepts each tile and a source without one', () => {
    for (const tile of ['poster', 'wide', 'square']) {
      expect(manifestProblems(manifest({ tile, capabilities: ['listGames'] }))).toEqual([]);
    }
    expect(manifestProblems(manifest({ capabilities: ['browse'] }))).toEqual([]);
  });

  test('refuses a tile outside poster, wide and square', () => {
    const problems = manifestProblems(manifest({ tile: 'tall', capabilities: ['browse'] }));
    expect(problems.some((p) => p.startsWith('/contributes/sources/0/tile'))).toBe(true);
  });

  test('accepts the listGames capability and refuses unknown ones', () => {
    expect(manifestProblems(manifest({ capabilities: ['listGames', 'browse'] }))).toEqual([]);
    expect(manifestProblems(manifest({ capabilities: ['listAll'] })).length).toBeGreaterThan(0);
  });

  describe('sidebar', () => {
    const withSidebar = (sidebar: unknown, capabilities = ['browse', 'browse:filters']) =>
      manifest({ capabilities, sidebar });
    const allGroups = [
      { type: 'search', id: 'text', placeholder: 'Search the site' },
      {
        type: 'toggles',
        id: 'show',
        options: [
          { value: 'installed', label: 'Installed', icon: 'check' },
          { value: 'favorite', label: 'Favorites' },
        ],
      },
      { type: 'select', id: 'engine', label: 'Engine', options: [{ value: 'unity', label: 'Unity' }] },
      { type: 'multi', id: 'tags', label: 'Tags', dynamic: true, searchable: true },
      {
        type: 'sort',
        id: 'sort',
        options: [
          { value: 'date', label: 'Date' },
          { value: 'title', label: 'Title' },
        ],
        orderable: true,
        default: { value: 'date', order: 'desc' },
      },
    ];

    test('accepts a sidebar with every group type', () => {
      expect(manifestProblems(withSidebar(allGroups))).toEqual([]);
    });

    test('accepts a select from listFilters, and a sort with no default', () => {
      const groups = [
        { type: 'select', id: 'engine', label: 'Engine', dynamic: true },
        { type: 'sort', id: 'sort', options: [{ value: 'title', label: 'Title' }] },
      ];
      expect(manifestProblems(withSidebar(groups))).toEqual([]);
    });

    test('refuses a sidebar without the browse:filters capability, and the reverse', () => {
      expect(manifestProblems(withSidebar(allGroups, ['browse'])).length).toBeGreaterThan(0);
      expect(manifestProblems(manifest({ capabilities: ['browse', 'browse:filters'] })).length).toBeGreaterThan(0);
    });

    test('refuses an empty sidebar and an unknown group type', () => {
      expect(manifestProblems(withSidebar([])).length).toBeGreaterThan(0);
      expect(manifestProblems(withSidebar([{ type: 'range', id: 'year' }])).length).toBeGreaterThan(0);
    });

    test('refuses a select with both options and dynamic, or with neither', () => {
      const both = [{ type: 'select', id: 'engine', label: 'Engine', options: [{ value: 'a', label: 'A' }], dynamic: true }];
      const neither = [{ type: 'select', id: 'engine', label: 'Engine' }];
      expect(manifestProblems(withSidebar(both)).length).toBeGreaterThan(0);
      expect(manifestProblems(withSidebar(neither)).length).toBeGreaterThan(0);
    });

    test('refuses a multi that is not dynamic', () => {
      const groups = [{ type: 'multi', id: 'tags', label: 'Tags', dynamic: false }];
      expect(manifestProblems(withSidebar(groups)).length).toBeGreaterThan(0);
    });

    test('refuses a bad group id, an empty option list, a bad sort order and unknown keys', () => {
      const badId = [{ type: 'search', id: 'Text Box' }];
      const noOptions = [{ type: 'sort', id: 'sort', options: [] }];
      const badOrder = [
        { type: 'sort', id: 'sort', options: [{ value: 'a', label: 'A' }], default: { value: 'a', order: 'up' } },
      ];
      const extraKey = [{ type: 'search', id: 'text', size: 3 }];
      for (const groups of [badId, noOptions, badOrder, extraKey]) {
        expect(manifestProblems(withSidebar(groups)).length).toBeGreaterThan(0);
      }
    });
  });
});

const stringField = { type: 'string', title: 'Text', default: 'x' };

function settingsSchema(properties: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { type: 'object', additionalProperties: false, properties, ...extra };
}

describe('settings schema', () => {
  test('accepts the supported keywords and extensions', () => {
    const value = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      title: 'Demo settings',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { ...stringField, minLength: 1, maxLength: 20, examples: ['demo'], 'x-ll-group': 'Site' },
        count: { type: 'integer', title: 'Count', default: 1, minimum: 0, maximum: 10 },
        ratio: { type: 'number', title: 'Ratio', default: 0.5 },
        enabled: { type: 'boolean', title: 'Enabled', default: true, 'x-ll-advanced': true },
        mode: { type: 'string', title: 'Mode', default: 'a', enum: ['a', 'b'] },
        folder: { type: 'string', title: 'Folder', default: '', 'x-ll-widget': 'folder' },
        files: { type: 'array', title: 'Files', default: [], items: { type: 'string' }, minItems: 0, maxItems: 5, uniqueItems: true },
        tags: { type: 'array', title: 'Tags', default: [], items: { enum: ['a', 'b'] } },
      },
    };
    expect(settingsSchemaProblems(value)).toEqual([]);
  });

  test('every property needs a title and a default', () => {
    const noDefault = settingsSchema({ a: { type: 'string', title: 'A' } });
    expect(settingsSchemaProblems(noDefault).some((p) => p.startsWith('/properties/a') && p.includes('default'))).toBe(true);
    const noTitle = settingsSchema({ a: { type: 'string', default: 'x' } });
    expect(settingsSchemaProblems(noTitle).some((p) => p.startsWith('/properties/a') && p.includes('title'))).toBe(true);
  });

  test('refuses keywords outside the supported subset', () => {
    const withPattern = settingsSchema({ a: { ...stringField, pattern: '^x$' } });
    expect(settingsSchemaProblems(withPattern).some((p) => p.includes('"pattern"'))).toBe(true);
    const withNestedObject = settingsSchema({ a: { type: 'object', title: 'A', default: {} } });
    expect(settingsSchemaProblems(withNestedObject).some((p) => p.includes('/properties/a/type'))).toBe(true);
    expect(settingsSchemaProblems({ ...settingsSchema({}), definitions: {} }).some((p) => p.includes('"definitions"'))).toBe(true);
  });

  test('checks the extension values and where they may go', () => {
    const badWidget = settingsSchema({ a: { ...stringField, 'x-ll-widget': 'picker' } });
    expect(settingsSchemaProblems(badWidget).some((p) => p.includes('/properties/a/x-ll-widget'))).toBe(true);
    const widgetOnNumber = settingsSchema({ a: { type: 'number', title: 'A', default: 1, 'x-ll-widget': 'folder' } });
    expect(settingsSchemaProblems(widgetOnNumber).some((p) => p.includes('/properties/a/type'))).toBe(true);
    const badAdvanced = settingsSchema({ a: { ...stringField, 'x-ll-advanced': false } });
    expect(settingsSchemaProblems(badAdvanced).some((p) => p.includes('/properties/a/x-ll-advanced'))).toBe(true);
    const badGroup = settingsSchema({ a: { ...stringField, 'x-ll-group': 3 } });
    expect(settingsSchemaProblems(badGroup).some((p) => p.includes('/properties/a/x-ll-group'))).toBe(true);
  });

  test('array fields need a string or enum item type', () => {
    const noItems = settingsSchema({ a: { type: 'array', title: 'A', default: [] } });
    expect(settingsSchemaProblems(noItems).some((p) => p.startsWith('/properties/a') && p.includes('items'))).toBe(true);
    const both = settingsSchema({ a: { type: 'array', title: 'A', default: [], items: { type: 'string', enum: ['a'] } } });
    expect(settingsSchemaProblems(both)).toEqual([]);
    const neither = settingsSchema({ a: { type: 'array', title: 'A', default: [], items: {} } });
    expect(settingsSchemaProblems(neither).some((p) => p.startsWith('/properties/a/items'))).toBe(true);
    const onString = settingsSchema({ a: { ...stringField, items: { type: 'string' } } });
    expect(settingsSchemaProblems(onString).some((p) => p.includes('/properties/a/type'))).toBe(true);
  });

  test('the top level is an object with a properties map', () => {
    expect(settingsSchemaProblems({ type: 'object', properties: {} })).toEqual([]);
    expect(settingsSchemaProblems({ type: 'string', properties: {} }).length).toBeGreaterThan(0);
    expect(settingsSchemaProblems({ type: 'object' }).length).toBeGreaterThan(0);
    expect(settingsSchemaProblems(settingsSchema({}, { additionalProperties: true })).length).toBeGreaterThan(0);
  });

  test('a file that Ajv cannot compile is refused', () => {
    const problems = settingsSchemaProblems({ ...settingsSchema({}), $schema: 'not-a-schema' });
    expect(problems.some((p) => p.includes('not a valid JSON Schema'))).toBe(true);
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
