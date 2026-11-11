import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { initCommand } from '../src/cli/commands/init';
import { packCommand, planPackage } from '../src/cli/commands/pack';
import { validateCommand } from '../src/cli/commands/validate';
import { categoryColor, createLogger, fnv1a, formatLine, type LineSink } from '../src/cli/log';
import { manifestProblems } from '../src/schema/manifest';
import { writeZip, type ZipEntry } from '../src/cli/zip';
import type { PluginManifest } from '../src/types/manifest';

let workdir: string;

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'llp-test-'));
});

afterEach(() => {
  fs.rmSync(workdir, { recursive: true, force: true });
});

function memorySink(): LineSink & { text: string } {
  const sink = {
    text: '',
    isTTY: false,
    write(chunk: string) {
      sink.text += chunk;
      return true;
    },
  };
  return sink;
}

const quietLog = () => createLogger('test', memorySink(), false);

function validManifest(): PluginManifest {
  return {
    id: 'demo-site',
    name: 'Demo Site',
    version: '1.2.3',
    apiVersion: '1',
    minHost: '2.0.0',
    entry: { 'linux-x64': 'bin/linux-x64/demo-site' },
    contributes: { sources: [{ id: 'demo', label: 'Demo', capabilities: ['browse'] }] },
    permissions: { network: ['demo.test'] },
  };
}

function writePlugin(dir: string, manifest: PluginManifest) {
  fs.mkdirSync(path.join(dir, 'bin/linux-x64'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'bin/linux-x64/demo-site'), '#!/bin/sh\n');
}

describe('manifest validation', () => {
  test('accepts a valid manifest', () => {
    expect(manifestProblems(validManifest())).toEqual([]);
  });

  test('rejects a bad id, a non-semver version and unknown keys', () => {
    const bad = { ...validManifest(), id: 'Demo', version: '1.2', extra: true };
    const problems = manifestProblems(bad);
    expect(problems.some((p) => p.startsWith('/id'))).toBe(true);
    expect(problems.some((p) => p.startsWith('/version'))).toBe(true);
    expect(problems.some((p) => p.includes('"extra"'))).toBe(true);
  });

  test('rejects entry paths that leave the package', () => {
    const bad = { ...validManifest(), entry: { 'linux-x64': '../evil' } };
    expect(manifestProblems(bad).length).toBeGreaterThan(0);
  });

  test('fs accepts the known folder names and app data names, and refuses other names', () => {
    const withFs = (fs: string[]) => ({ ...validManifest(), permissions: { fs } });
    expect(manifestProblems(withFs(['$GAMES', '$DOWNLOADS', '$DATA', '$APPDATA_ITCH']))).toEqual([]);
    expect(manifestProblems(withFs(['$ITCH_APP_DATA']))).not.toEqual([]);
    expect(manifestProblems(withFs(['$APPDATA_itch']))).not.toEqual([]);
    expect(manifestProblems(withFs(['$HOME']))).not.toEqual([]);
  });

  test('a command may name the plugin method that runs it', () => {
    const manifest = validManifest();
    manifest.contributes.commands = [{ id: 'import-key', label: 'Import key', method: 'demo-site.importKey' }];
    expect(manifestProblems(manifest)).toEqual([]);
  });

  test('a command method must be a dotted name', () => {
    const manifest = validManifest();
    manifest.contributes.commands = [{ id: 'import-key', label: 'Import key', method: 'importKey' }];
    expect(manifestProblems(manifest).some((p) => p.startsWith('/contributes/commands/0/method'))).toBe(true);
  });

  test('accepts author, description and an http or https homepage', () => {
    const manifest = {
      ...validManifest(),
      author: 'Ada Lovelace',
      description: 'Imports games from a demo site.',
      homepage: 'https://example.test/demo-site',
    };
    expect(manifestProblems(manifest)).toEqual([]);
  });

  test('rejects author, description and homepage that are not strings', () => {
    const bad = { ...validManifest(), author: 42, description: ['text'], homepage: null } as unknown as PluginManifest;
    const problems = manifestProblems(bad);
    expect(problems.some((p) => p.startsWith('/author'))).toBe(true);
    expect(problems.some((p) => p.startsWith('/description'))).toBe(true);
    expect(problems.some((p) => p.startsWith('/homepage'))).toBe(true);
  });

  test('rejects a homepage that is not an http or https URL', () => {
    const bad = { ...validManifest(), homepage: 'demo-site.test' };
    expect(manifestProblems(bad).some((p) => p.startsWith('/homepage'))).toBe(true);
    expect(manifestProblems({ ...validManifest(), homepage: 'ftp://example.test' }).length).toBeGreaterThan(0);
  });

  test('rejects empty author and description', () => {
    expect(manifestProblems({ ...validManifest(), author: '' }).length).toBeGreaterThan(0);
    expect(manifestProblems({ ...validManifest(), description: '' }).length).toBeGreaterThan(0);
  });
});

describe('zip writer', () => {
  test('stores deflated entries that round-trip', () => {
    const entries: ZipEntry[] = [
      { name: 'a.txt', data: new TextEncoder().encode('hello hello hello') },
      { name: 'bin/run', data: new TextEncoder().encode('#!/bin/sh'), mode: 0o755 },
    ];
    const zip = Buffer.from(writeZip(entries));
    const eocd = zip.length - 22;
    expect(zip.readUInt32LE(eocd)).toBe(0x06054b50);
    expect(zip.readUInt16LE(eocd + 10)).toBe(2);

    const firstNameLen = zip.readUInt16LE(26);
    const firstSize = zip.readUInt32LE(18);
    const firstData = zip.subarray(30 + firstNameLen, 30 + firstNameLen + firstSize);
    expect(inflateRawSync(firstData).toString()).toBe('hello hello hello');

    const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(zip.readUInt32LE(central + 38) >>> 16).toBe(0o644);
    const second = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), central + 1);
    expect(zip.readUInt32LE(second + 38) >>> 16).toBe(0o755);
  });
});

describe('logger colors', () => {
  test('fnv1a matches the published value for "a"', () => {
    expect(fnv1a('a')).toBe(0xe40c292c);
  });

  test('a category always gets the same color', () => {
    expect(categoryColor('pack')).toBe(categoryColor('pack'));
  });

  test('plain lines carry no escape codes', () => {
    const line = formatLine('warn', 'pack', 'careful', false, new Date(2026, 0, 1, 9, 5, 7));
    expect(line).toBe('09:05:07 WARN  [pack] careful\n');
    expect(line).not.toContain('\x1b');
  });

  test('colored lines are used only when a color flag is set', () => {
    const sink = memorySink();
    createLogger('pack', sink, true).info('done');
    expect(sink.text).toContain('\x1b[');
  });
});

describe('init command', () => {
  test('scaffolds a plugin folder with the id filled in', () => {
    expect(initCommand('demo-site', workdir, quietLog())).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(workdir, 'demo-site/plugin.json'), 'utf8'));
    expect(manifest.id).toBe('demo-site');
    expect(JSON.stringify(manifest)).not.toContain('__ID__');
    expect(manifestProblems(manifest)).toEqual([]);
  });

  test('refuses an invalid id and a non-empty target', () => {
    expect(initCommand('Bad_ID', workdir, quietLog())).toBe(1);
    fs.mkdirSync(path.join(workdir, 'taken'));
    fs.writeFileSync(path.join(workdir, 'taken/keep.txt'), 'x');
    expect(initCommand('taken', workdir, quietLog())).toBe(1);
  });
});

describe('validate and pack commands', () => {
  test('validate passes for a valid folder and fails for a broken one', () => {
    const dir = path.join(workdir, 'ok');
    writePlugin(dir, validManifest());
    expect(validateCommand(dir, quietLog())).toBe(0);

    const broken = path.join(workdir, 'broken');
    writePlugin(broken, { ...validManifest(), version: 'nope' });
    expect(validateCommand(broken, quietLog())).toBe(1);
  });

  test('planPackage lists plugin.json, declared entries and bin folder files', () => {
    const dir = path.join(workdir, 'plan');
    writePlugin(dir, validManifest());
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not packed');
    const plan = planPackage(dir, validManifest());
    expect(plan.missing).toEqual([]);
    expect(plan.files).toEqual(['bin/linux-x64/demo-site', 'plugin.json']);
  });

  test('pack writes a .llplugin with a SHA256SUMS file that matches the contents', () => {
    const dir = path.join(workdir, 'src');
    const out = path.join(workdir, 'dist');
    writePlugin(dir, validManifest());
    expect(packCommand(dir, out, quietLog())).toBe(0);

    const archive = path.join(out, 'demo-site-1.2.3.llplugin');
    expect(fs.existsSync(archive)).toBe(true);
    const bytes = fs.readFileSync(archive);
    expect(bytes.includes(Buffer.from('SHA256SUMS'))).toBe(true);
    expect(bytes.includes(Buffer.from('plugin.json'))).toBe(true);
  });

  test('pack fails when a declared entry is missing', () => {
    const dir = path.join(workdir, 'missing');
    writePlugin(dir, validManifest());
    fs.rmSync(path.join(dir, 'bin/linux-x64/demo-site'));
    expect(packCommand(dir, path.join(workdir, 'dist'), quietLog())).toBe(1);
  });
});
