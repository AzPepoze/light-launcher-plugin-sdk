import { describe, expect, test } from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import protocol from '../schema/protocol.schema.json';
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
    expect(settingsSchemaProblems(both).some((p) => p.startsWith('/properties/a/items'))).toBe(true);
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
