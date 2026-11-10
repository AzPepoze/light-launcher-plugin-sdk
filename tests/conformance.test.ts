import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { conformanceCommand, currentEntryKey } from '../src/cli/commands/conformance';
import { initCommand } from '../src/cli/commands/init';
import { createLogger, type LineSink } from '../src/cli/log';

const SDK_ROOT = path.resolve(import.meta.dir, '..');
const PLUGIN_ID = 'demo-site';

let workdir: string;

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'llp-conformance-'));
});

afterEach(() => {
  fs.rmSync(workdir, { recursive: true, force: true });
});

/** A logger that keeps its text, so tests can read the messages. */
function captureLog() {
  const sink = {
    text: '',
    isTTY: false,
    write(chunk: string) {
      sink.text += chunk;
      return true;
    },
  } satisfies LineSink & { text: string };
  return { log: createLogger('test', sink, false), text: () => sink.text };
}

/** Scaffolds the template and links the SDK the way bun link does, so its imports resolve. */
function scaffoldTemplate(): string {
  initCommand(PLUGIN_ID, workdir, captureLog().log);
  const pluginDir = path.join(workdir, PLUGIN_ID);
  const scope = path.join(pluginDir, 'node_modules/@light-launcher');
  fs.mkdirSync(scope, { recursive: true });
  fs.symlinkSync(SDK_ROOT, path.join(scope, 'plugin-sdk'), 'dir');
  return pluginDir;
}

/** Points plugin.json at the entry for this machine, where the test writes the binary. */
function useEntryForThisMachine(pluginDir: string): string {
  const key = currentEntryKey();
  const relative = `bin/${key}/${PLUGIN_ID}`;
  const file = path.join(pluginDir, 'plugin.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.entry = { [key]: relative };
  fs.writeFileSync(file, JSON.stringify(manifest));
  fs.mkdirSync(path.dirname(path.join(pluginDir, relative)), { recursive: true });
  return path.join(pluginDir, relative);
}

/** Writes a small Bun script as the plugin entry. It speaks just enough protocol for one check. */
function writeEntryScript(pluginDir: string, body: string): void {
  const entry = useEntryForThisMachine(pluginDir);
  fs.writeFileSync(entry, `#!/usr/bin/env bun\n${body}`);
  fs.chmodSync(entry, 0o755);
}

const ANSWER_EVERYTHING = `
let pending = '';
for await (const chunk of Bun.stdin.stream()) {
  pending += new TextDecoder().decode(chunk);
  let end;
  while ((end = pending.indexOf('\\n')) !== -1) {
    const request = JSON.parse(pending.slice(0, end));
    pending = pending.slice(end + 1);
    const result = request.method === 'initialize'
      ? { pluginVersion: '0.1.0', capabilities: { '${PLUGIN_ID}': {} } }
      : null;
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');
    if (request.method === 'shutdown') process.exit(0);
  }
}
`;

describe('llp test', () => {
  test('passes for the template plugin', async () => {
    const pluginDir = scaffoldTemplate();
    const entry = useEntryForThisMachine(pluginDir);
    const build = Bun.spawnSync(['bun', 'build', '--compile', 'src/main.ts', '--outfile', entry], { cwd: pluginDir });
    expect(build.exitCode).toBe(0);

    const { log, text } = captureLog();
    expect(await conformanceCommand(pluginDir, log)).toBe(0);
    expect(text()).toContain('shutdown: ok');
  }, 60_000);

  test('fails when the plugin does not exit within 2 s after shutdown', async () => {
    const pluginDir = scaffoldTemplate();
    writeEntryScript(pluginDir, ANSWER_EVERYTHING.replace('process.exit(0)', 'setInterval(() => {}, 1000)'));

    const { log, text } = captureLog();
    expect(await conformanceCommand(pluginDir, log)).toBe(1);
    expect(text()).toContain('did not exit within 2 s');
  }, 30_000);

  test('fails when the plugin has no source.parseRef handler', async () => {
    const pluginDir = scaffoldTemplate();
    writeEntryScript(
      pluginDir,
      ANSWER_EVERYTHING.replace(
        "const result = request.method === 'initialize'",
        "if (request.method === 'source.parseRef') { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'method not found' } }) + '\\n'); continue; }\n    const result = request.method === 'initialize'",
      ),
    );

    const { log, text } = captureLog();
    expect(await conformanceCommand(pluginDir, log)).toBe(1);
    expect(text()).toContain('method not found');
  }, 30_000);

  test('fails for a folder with no plugin.json', async () => {
    const { log, text } = captureLog();
    expect(await conformanceCommand(workdir, log)).toBe(1);
    expect(text()).toContain('plugin.json not found');
  });
});
