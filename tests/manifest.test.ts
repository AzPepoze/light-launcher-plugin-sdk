import { describe, expect, test } from 'bun:test';
import { manifestProblems } from '../src/schema/manifest';

interface Manifest {
  [key: string]: unknown;
  contributes: { sources: Record<string, unknown>[]; [key: string]: unknown };
}

function baseManifest(): Manifest {
  return {
    id: 'demo-site',
    name: 'Demo Site',
    version: '1.0.0',
    apiVersion: '1',
    minHost: '2.0.0',
    entry: { 'linux-x64': 'bin/linux-x64/demo-site' },
    contributes: {
      sources: [{ id: 'site', label: 'Site', capabilities: ['browse'] }],
      settings: { $ref: 'settings.schema.json' },
    },
    permissions: {},
  };
}

function withSource(source: Record<string, unknown>): Manifest {
  return {
    ...baseManifest(),
    contributes: { sources: [{ id: 'site', label: 'Site', capabilities: ['browse'], ...source }] },
  };
}

function withFields(fields: Record<string, unknown>): Manifest {
  return { ...baseManifest(), ...fields };
}

const action = (overrides: Record<string, unknown> = {}) => ({
  id: 'sync',
  label: 'Sync',
  method: 'demo-site.sync',
  ...overrides,
});

const sidebarGroups = [
  { type: 'search', id: 'text', placeholder: 'Search the site' },
  { type: 'toggles', id: 'show', options: [{ value: 'installed', label: 'Installed', icon: 'check' }] },
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

const withSidebar = (sidebar: unknown, capabilities = ['browse', 'browse:filters']) =>
  withSource({ capabilities, sidebar });

interface Case {
  name: string;
  manifest: unknown;
  valid: boolean;
  path?: string;
  text?: string;
}

const cases: Case[] = [
  { name: 'accepts a valid manifest', manifest: baseManifest(), valid: true },
  { name: 'rejects a bad id', manifest: withFields({ id: 'Demo' }), valid: false, path: '/id' },
  { name: 'rejects a non-semver version', manifest: withFields({ version: '1.2' }), valid: false, path: '/version' },
  { name: 'rejects unknown keys', manifest: withFields({ extra: true }), valid: false, text: '"extra"' },
  { name: 'rejects an entry path that leaves the package', manifest: withFields({ entry: { 'linux-x64': '../evil' } }), valid: false },
  { name: 'accepts the known fs names', manifest: withFields({ permissions: { fs: ['$GAMES', '$DOWNLOADS', '$DATA', '$APPDATA_ITCH'] } }), valid: true },
  { name: 'rejects an unknown fs name', manifest: withFields({ permissions: { fs: ['$ITCH_APP_DATA'] } }), valid: false, path: '/permissions/fs/0' },
  { name: 'rejects a lowercase app data name', manifest: withFields({ permissions: { fs: ['$APPDATA_itch'] } }), valid: false, path: '/permissions/fs/0' },
  { name: 'rejects a home folder name', manifest: withFields({ permissions: { fs: ['$HOME'] } }), valid: false, path: '/permissions/fs/0' },
  {
    name: 'accepts a command method',
    manifest: withFields({ contributes: { sources: [], commands: [{ id: 'import-key', label: 'Import key', method: 'demo-site.importKey' }] } }),
    valid: true,
  },
  {
    name: 'rejects a command method with no dot',
    manifest: withFields({ contributes: { sources: [], commands: [{ id: 'import-key', label: 'Import key', method: 'importKey' }] } }),
    valid: false,
    path: '/contributes/commands/0/method',
  },
  { name: 'accepts author, description and an https homepage', manifest: withFields({ author: 'Ada', description: 'Demo.', homepage: 'https://example.test' }), valid: true },
  { name: 'rejects author, description and homepage of the wrong type', manifest: withFields({ author: 42, description: ['text'], homepage: null }), valid: false, path: '/author' },
  { name: 'rejects a homepage without a scheme', manifest: withFields({ homepage: 'demo-site.test' }), valid: false, path: '/homepage' },
  { name: 'rejects a non-http homepage', manifest: withFields({ homepage: 'ftp://example.test' }), valid: false, path: '/homepage' },
  { name: 'rejects an empty author', manifest: withFields({ author: '' }), valid: false, path: '/author' },
  { name: 'rejects an empty description', manifest: withFields({ description: '' }), valid: false, path: '/description' },
  { name: 'accepts a github repository', manifest: withFields({ repository: 'github:owner/repo' }), valid: true },
  { name: 'rejects a repository url', manifest: withFields({ repository: 'https://github.com/owner/repo' }), valid: false, path: '/repository' },
  { name: 'rejects a repository with no name', manifest: withFields({ repository: 'github:owner' }), valid: false, path: '/repository' },
  { name: 'rejects a repository with extra parts', manifest: withFields({ repository: 'github:owner/repo/extra' }), valid: false, path: '/repository' },
  { name: 'rejects an empty repository', manifest: withFields({ repository: '' }), valid: false, path: '/repository' },
  { name: 'rejects a numeric repository', manifest: withFields({ repository: 42 }), valid: false, path: '/repository' },
  ...['poster', 'wide', 'square'].map((tile) => ({ name: `accepts tile ${tile}`, manifest: withSource({ tile }), valid: true })),
  { name: 'accepts a source without a tile', manifest: withSource({}), valid: true },
  { name: 'rejects an unknown tile', manifest: withSource({ tile: 'tall' }), valid: false, path: '/contributes/sources/0/tile' },
  { name: 'accepts the listGames capability', manifest: withSource({ capabilities: ['browse', 'listGames'] }), valid: true },
  { name: 'rejects an unknown capability', manifest: withSource({ capabilities: ['listAll'] }), valid: false },
  {
    name: 'accepts cover, actions and a card',
    manifest: withSource({
      cover: { ratio: '4:3' },
      actions: [action({ icon: 'sync' }), action({ id: 'open', label: 'Open', method: 'demo-site.open', scope: 'game' })],
      card: { title: 'title', subtitle: 'developer', badges: ['favorite', 'installed'] },
    }),
    valid: true,
  },
  { name: 'accepts a cover beside a tile', manifest: withSource({ tile: 'wide', cover: { ratio: '1:1' } }), valid: true },
  ...['1:4', '4:1', '32:8', '2:3'].map((ratio) => ({ name: `accepts cover ratio ${ratio}`, manifest: withSource({ cover: { ratio } }), valid: true })),
  ...['0:3', '33:1', '1:33', '1:5', '5:1', '4/3', '3:04', ''].map((ratio) => ({
    name: `rejects cover ratio ${ratio}`,
    manifest: withSource({ cover: { ratio } }),
    valid: false,
  })),
  {
    name: 'accepts eight actions',
    manifest: withSource({
      actions: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => action({ id, label: id, method: `demo-site.${id}` })),
    }),
    valid: true,
  },
  { name: 'refuses more than eight actions', manifest: withSource({ actions: Array.from({ length: 9 }, (_, i) => action({ id: `a${i}`, label: 'Run', method: `demo-site.run${i}` })) }), valid: false },
  { name: 'refuses duplicate action ids', manifest: withSource({ actions: [action(), action({ label: 'Again' })] }), valid: false, text: 'duplicate action id "sync"' },
  { name: 'refuses an action method with no dot', manifest: withSource({ actions: [action({ method: 'sync' })] }), valid: false },
  { name: 'refuses an unknown action scope', manifest: withSource({ actions: [action({ scope: 'tray' })] }), valid: false },
  { name: 'refuses a bad action icon', manifest: withSource({ actions: [action({ icon: 'Sync Now' })] }), valid: false },
  { name: 'refuses an unknown card key', manifest: withSource({ card: { color: 'red' } }), valid: false },
  { name: 'refuses an unknown card field', manifest: withSource({ card: { title: 'nickname' } }), valid: false },
  { name: 'refuses an unknown card badge', manifest: withSource({ card: { badges: ['starred'] } }), valid: false },
  { name: 'refuses a repeated card badge', manifest: withSource({ card: { badges: ['installed', 'installed'] } }), valid: false },
  { name: 'accepts a sidebar with every group type', manifest: withSidebar(sidebarGroups), valid: true },
  {
    name: 'accepts a dynamic select and a sort with no default',
    manifest: withSidebar([
      { type: 'select', id: 'engine', label: 'Engine', dynamic: true },
      { type: 'sort', id: 'sort', options: [{ value: 'title', label: 'Title' }] },
    ]),
    valid: true,
  },
  { name: 'refuses a sidebar without browse:filters', manifest: withSidebar(sidebarGroups, ['browse']), valid: false },
  { name: 'refuses browse:filters without a sidebar', manifest: withSource({ capabilities: ['browse', 'browse:filters'] }), valid: false },
  { name: 'refuses an empty sidebar', manifest: withSidebar([]), valid: false },
  { name: 'refuses an unknown sidebar group', manifest: withSidebar([{ type: 'range', id: 'year' }]), valid: false },
  {
    name: 'refuses a select with both options and dynamic',
    manifest: withSidebar([{ type: 'select', id: 'engine', label: 'Engine', options: [{ value: 'a', label: 'A' }], dynamic: true }]),
    valid: false,
  },
  { name: 'refuses a select with neither options nor dynamic', manifest: withSidebar([{ type: 'select', id: 'engine', label: 'Engine' }]), valid: false },
  { name: 'refuses a static multi group', manifest: withSidebar([{ type: 'multi', id: 'tags', label: 'Tags', dynamic: false }]), valid: false },
  { name: 'refuses a sidebar id with a space', manifest: withSidebar([{ type: 'search', id: 'Text Box' }]), valid: false },
  { name: 'refuses an empty sort option list', manifest: withSidebar([{ type: 'sort', id: 'sort', options: [] }]), valid: false },
  {
    name: 'refuses a bad sort order',
    manifest: withSidebar([{ type: 'sort', id: 'sort', options: [{ value: 'a', label: 'A' }], default: { value: 'a', order: 'up' } }]),
    valid: false,
  },
  { name: 'refuses an unknown sidebar key', manifest: withSidebar([{ type: 'search', id: 'text', size: 3 }]), valid: false },
];

describe('manifest validator', () => {
  test.each(cases)('$name', ({ manifest, valid, path, text }) => {
    const problems = manifestProblems(manifest);
    if (valid) {
      expect(problems).toEqual([]);
      return;
    }
    expect(problems.length).toBeGreaterThan(0);
    if (path) expect(problems.some((problem) => problem.startsWith(path)), path).toBe(true);
    if (text) expect(problems.some((problem) => problem.includes(text)), text).toBe(true);
  });
});
