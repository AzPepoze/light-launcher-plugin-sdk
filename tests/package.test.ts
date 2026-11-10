import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const SDK_ROOT = path.resolve(import.meta.dir, '..');
const pkg = (await Bun.file(path.join(SDK_ROOT, 'package.json')).json()) as {
  exports: Record<string, string>;
  files: string[];
  scripts: Record<string, string>;
};

describe('package contents', () => {
  test('the published files include the source, schemas and template', () => {
    expect(pkg.files).toEqual(expect.arrayContaining(['src', 'schema', 'templates']));
    for (const entry of pkg.files) expect(fs.existsSync(path.join(SDK_ROOT, entry))).toBe(true);
  });
});

describe('package exports', () => {
  test('the manifest subpath exports manifestProblems', async () => {
    const target = path.join(SDK_ROOT, pkg.exports['./manifest']);
    const mod = (await import(target)) as { manifestProblems: unknown };
    expect(typeof mod.manifestProblems).toBe('function');
  });
});
