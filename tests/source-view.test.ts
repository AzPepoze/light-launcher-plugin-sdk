import { describe, expect, test } from 'bun:test';
import { manifestProblems } from '../src/schema/manifest';

/** A valid manifest whose only source is the given fields. */
function manifestWith(source: object) {
  return {
    id: 'demo-site',
    name: 'Demo Site',
    version: '1.0.0',
    apiVersion: '1',
    minHost: '2.0.0',
    entry: { 'linux-x64': 'bin/linux-x64/demo-site' },
    contributes: { sources: [{ id: 'site', label: 'Site', capabilities: ['browse'], ...source }] },
    permissions: {},
  };
}

const action = (overrides: object = {}) => ({ id: 'sync', label: 'Sync', method: 'demo-site.sync', ...overrides });

describe('source tile (older manifests)', () => {
  test('a source with only tile still validates', () => {
    for (const tile of ['poster', 'wide', 'square']) {
      expect(manifestProblems(manifestWith({ tile }))).toEqual([]);
    }
    expect(manifestProblems(manifestWith({}))).toEqual([]);
  });
});

describe('source cover, actions and card', () => {
  test('a source with cover, actions and card validates', () => {
    const source = {
      cover: { ratio: '4:3' },
      actions: [action({ icon: 'sync' }), action({ id: 'open', label: 'Open', method: 'demo-site.open', scope: 'game' })],
      card: { title: 'title', subtitle: 'developer', badges: ['favorite', 'installed'] },
    };
    expect(manifestProblems(manifestWith(source))).toEqual([]);
  });

  test('cover may sit beside tile', () => {
    expect(manifestProblems(manifestWith({ tile: 'wide', cover: { ratio: '1:1' } }))).toEqual([]);
  });

  test('accepts the ratio edges and up to 8 actions', () => {
    for (const ratio of ['1:4', '4:1', '32:8', '2:3']) {
      expect(manifestProblems(manifestWith({ cover: { ratio } }))).toEqual([]);
    }
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => action({ id, label: id, method: `demo-site.${id}` }));
    expect(manifestProblems(manifestWith({ actions: eight }))).toEqual([]);
  });

  test('refuses cover ratios outside the allowed range or shape', () => {
    for (const ratio of ['0:3', '33:1', '1:33', '1:5', '5:1', '4/3', '3:04', '']) {
      expect(manifestProblems(manifestWith({ cover: { ratio } })).length, ratio).toBeGreaterThan(0);
    }
  });

  test('refuses unknown card keys and unknown game fields or badges', () => {
    expect(manifestProblems(manifestWith({ card: { color: 'red' } })).length).toBeGreaterThan(0);
    expect(manifestProblems(manifestWith({ card: { title: 'nickname' } })).length).toBeGreaterThan(0);
    expect(manifestProblems(manifestWith({ card: { subtitle: 'rating' } })).length).toBeGreaterThan(0);
    expect(manifestProblems(manifestWith({ card: { badges: ['starred'] } })).length).toBeGreaterThan(0);
    expect(manifestProblems(manifestWith({ card: { badges: ['installed', 'installed'] } })).length).toBeGreaterThan(0);
  });

  test('refuses duplicate action ids in one source', () => {
    const problems = manifestProblems(manifestWith({ actions: [action(), action({ label: 'Again' })] }));
    expect(problems.some((p) => p.includes('duplicate action id "sync"'))).toBe(true);
  });

  test('refuses more than 8 actions', () => {
    const nine = Array.from({ length: 9 }, (_, i) => action({ id: `a${i}`, label: 'Run', method: `demo-site.run${i}` }));
    expect(manifestProblems(manifestWith({ actions: nine })).length).toBeGreaterThan(0);
  });

  test('refuses an action with a bad method, scope or icon', () => {
    expect(manifestProblems(manifestWith({ actions: [action({ method: 'sync' })] })).length).toBeGreaterThan(0);
    expect(manifestProblems(manifestWith({ actions: [action({ scope: 'tray' })] })).length).toBeGreaterThan(0);
    expect(manifestProblems(manifestWith({ actions: [action({ icon: 'Sync Now' })] })).length).toBeGreaterThan(0);
  });
});
