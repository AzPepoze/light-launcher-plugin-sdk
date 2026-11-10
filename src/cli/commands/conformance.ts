import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Platform, Ref } from '../../types/game';
import type { PluginManifest } from '../../types/manifest';
import type { GrantedPermissions, InitializeParams, InitializeResult } from '../../types/methods';
import { RpcPeer } from '../../runtime/peer';
import type { Logger } from '../log';
import { readManifest } from '../manifest';

const REQUEST_TIMEOUT_MS = 5000;
const EXIT_TIMEOUT_MS = 2000;
/** A URL no plugin should recognise. parseRef must answer null or a ref. */
const BOGUS_URL = 'https://llp-test.invalid/not-a-game';
const PLATFORM_NAMES: Partial<Record<NodeJS.Platform, Platform>> = { linux: 'linux', win32: 'windows', darwin: 'mac' };

/** Runs the plugin entry for this OS and checks the protocol. Returns the exit code. */
export async function conformanceCommand(dir: string, log: Logger): Promise<number> {
  const read = readManifest(dir);
  if (!read.ok) {
    for (const problem of read.problems) log.error(problem);
    return 1;
  }
  const { manifest } = read;
  const key = currentEntryKey();
  const relative = entryFor(manifest, key);
  if (!relative) {
    log.error(`plugin.json has no entry for ${key}`);
    return 1;
  }
  const executable = path.join(dir, relative);
  if (!fs.existsSync(executable)) {
    log.error(`entry not found: ${relative}. Build the plugin first.`);
    return 1;
  }

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llp-test-'));
  try {
    return await runChecks(executable, dir, manifest, dataDir, log);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function runChecks(
  executable: string,
  dir: string,
  manifest: PluginManifest,
  dataDir: string,
  log: Logger,
): Promise<number> {
  const proc = Bun.spawn([executable], { cwd: dir, stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' });
  const peer = new RpcPeer({
    write: (line) => {
      proc.stdin.write(line);
      proc.stdin.flush();
    },
    requests: {},
  });
  void peer.start(proc.stdout);

  try {
    const init = await peer.request<unknown>('initialize', initializeParams(manifest, dataDir), {
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    checkInitialize(init, manifest);
    log.info('initialize: ok');

    if (manifest.contributes.sources?.length) {
      const ref = await peer.request<unknown>('source.parseRef', { url: BOGUS_URL }, { timeoutMs: REQUEST_TIMEOUT_MS });
      checkParseRef(ref);
      log.info('source.parseRef: ok');
    }

    await peer.request('shutdown', {}, { timeoutMs: REQUEST_TIMEOUT_MS });
    if (!(await exitsWithin(proc, EXIT_TIMEOUT_MS))) {
      throw new Error(`plugin did not exit within ${EXIT_TIMEOUT_MS / 1000} s after shutdown`);
    }
    log.info('shutdown: ok, the plugin exited');
    return 0;
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
    return 1;
  } finally {
    peer.close();
    proc.kill();
  }
}

/** The entry key for this OS and CPU, such as linux-x64. */
export function currentEntryKey(): string {
  return `${PLATFORM_NAMES[process.platform] ?? 'unknown'}-${process.arch}`;
}

function entryFor(manifest: PluginManifest, key: string): string | undefined {
  return (manifest.entry as Record<string, string | undefined>)[key];
}

function currentPlatform(): Platform {
  return PLATFORM_NAMES[process.platform] ?? 'unknown';
}

function initializeParams(manifest: PluginManifest, dataDir: string): InitializeParams {
  return {
    hostVersion: manifest.minHost,
    apiVersion: manifest.apiVersion,
    platform: currentPlatform(),
    grantedPermissions: grantedPermissions(manifest),
    dataDir,
  };
}

function grantedPermissions(manifest: PluginManifest): GrantedPermissions {
  const declared = manifest.permissions;
  return {
    network: declared.network ?? [],
    fs: declared.fs ?? [],
    secrets: declared.secrets ?? false,
    browser: declared.browser ?? false,
    exec: declared.exec ?? false,
  };
}

function checkInitialize(value: unknown, manifest: PluginManifest): void {
  const result = value as Partial<InitializeResult> | null;
  if (!result || typeof result.pluginVersion !== 'string') throw new Error('initialize must return pluginVersion');
  for (const source of manifest.contributes.sources ?? []) {
    if (!result.capabilities?.[source.id]) {
      throw new Error(`initialize has no capabilities for source "${source.id}"`);
    }
  }
}

function checkParseRef(value: unknown): void {
  if (value !== null && !isRef(value)) throw new Error('source.parseRef must return a ref or null');
}

function isRef(value: unknown): value is Ref {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as Partial<Ref>;
  return (ref.kind === 'game' || ref.kind === 'listing') && typeof ref.id === 'string' && typeof ref.url === 'string';
}

async function exitsWithin(proc: Bun.Subprocess, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  const exited = proc.exited.then(() => true);
  try {
    return await Promise.race([exited, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
