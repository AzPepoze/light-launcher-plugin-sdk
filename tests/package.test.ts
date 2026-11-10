import { describe, expect, test } from 'bun:test';
import path from 'node:path';

const SDK_ROOT = path.resolve(import.meta.dir, '..');
const pkg = (await Bun.file(path.join(SDK_ROOT, 'package.json')).json()) as {
  exports: Record<string, string>;
  files: string[];
  scripts: Record<string, string>;
};

describe('package exports', () => {
  test('the manifest subpath exports manifestProblems', async () => {
    const target = path.join(SDK_ROOT, pkg.exports['./manifest']);
    const mod = (await import(target)) as { manifestProblems: unknown };
    expect(typeof mod.manifestProblems).toBe('function');
  });
});
