import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildScript, devCommand, notExecutable } from '../src/cli/commands/dev';
import { initCommand } from '../src/cli/commands/init';
import { createLogger, type LineSink } from '../src/runtime/logger';

let workdir: string;

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'llp-dev-'));
});

afterEach(() => {
  fs.rmSync(workdir, { recursive: true, force: true });
});

function captureLog() {
  const sink = { text: '', isTTY: false, write(chunk: string) { sink.text += chunk; return true; } } as LineSink & { text: string };
  return { log: createLogger('test', sink, false), text: () => sink.text };
}

describe('llp dev', () => {
  test('refuses a folder without plugin.json', async () => {
    const { log, text } = captureLog();
    expect(await devCommand(workdir, log)).toBe(1);
    expect(text()).toContain('plugin.json not found');
  });

  test.skipIf(process.platform === 'win32')('refuses an entry file without the execute bit', async () => {
    expect(initCommand('dev-check', workdir, captureLog().log)).toBe(0);
    const dir = path.join(workdir, 'dev-check');
    const entry = path.join(dir, 'bin/linux-x64/dev-check');
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, '');
    fs.chmodSync(entry, 0o644);

    const { log, text } = captureLog();
    expect(await devCommand(dir, log)).toBe(1);
    expect(text()).toContain('is not executable');
  });
});

describe('notExecutable', () => {
  test('skips entry files that do not exist yet', () => {
    expect(notExecutable(workdir, ['bin/missing'])).toEqual([]);
  });
});

describe('buildScript', () => {
  test('reads the build script from package.json', () => {
    fs.writeFileSync(path.join(workdir, 'package.json'), JSON.stringify({ scripts: { build: 'tsc -w' } }));
    expect(buildScript(workdir)).toBe('tsc -w');
  });

  test('is undefined without package.json', () => {
    expect(buildScript(workdir)).toBeUndefined();
  });
});
