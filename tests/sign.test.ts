import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { keygenCommand, PRIVATE_KEY_FILE, PUBLIC_KEY_FILE } from '../src/cli/commands/keygen';
import { packCommand } from '../src/cli/commands/pack';
import { SIGNATURE_FILE, signCommand } from '../src/cli/commands/sign';
import { validateCommand } from '../src/cli/commands/validate';
import { main } from '../src/cli/llp';
import { createLogger, type LineSink } from '../src/cli/log';
import { readZip, writeZip, type ZipEntry } from '../src/cli/zip';
import type { PluginManifest } from '../src/types/manifest';

let workdir: string;

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'llp-sign-test-'));
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

function quietLog() {
  return createLogger('test', memorySink(), false);
}

function captureLog() {
  const sink = memorySink();
  return { log: createLogger('test', sink, false), text: () => sink.text };
}

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

function writePlugin(dir: string): void {
  fs.mkdirSync(path.join(dir, 'bin/linux-x64'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(validManifest()));
  fs.writeFileSync(path.join(dir, 'bin/linux-x64/demo-site'), '#!/bin/sh\n', { mode: 0o755 });
}

/** Builds demo-site-1.2.3.llplugin with the real pack command. */
function makePackage(name = 'plugin'): { dir: string; archive: string } {
  const dir = path.join(workdir, name);
  writePlugin(dir);
  const out = path.join(workdir, `${name}-dist`);
  expect(packCommand(dir, out, quietLog())).toBe(0);
  return { dir, archive: path.join(out, 'demo-site-1.2.3.llplugin') };
}

function makeKeys(name = 'keys'): { dir: string; privatePath: string; publicPath: string; raw: Buffer } {
  const dir = path.join(workdir, name);
  expect(keygenCommand(dir, quietLog())).toBe(0);
  const publicPath = path.join(dir, PUBLIC_KEY_FILE);
  return {
    dir,
    privatePath: path.join(dir, PRIVATE_KEY_FILE),
    publicPath,
    raw: parseTrustedKeys(publicPath)[0],
  };
}

/** Reads trusted_keys the way the launcher does: comments, blank lines, base64 ed25519 keys. */
function parseTrustedKeys(file: string): Buffer[] {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.split('#')[0].trim())
    .filter((line) => line !== '')
    .map((line) => Buffer.from(line, 'base64'));
}

function publicKeyFromRaw(raw: Buffer) {
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') }, format: 'jwk' });
}

function entry(bytes: Uint8Array, name: string): ZipEntry {
  const found = readZip(bytes).find((item) => item.name === name);
  if (!found) throw new Error(`entry ${name} is missing`);
  return found;
}

function text(entryValue: ZipEntry): string {
  return new TextDecoder().decode(entryValue.data);
}

function rewrite(archive: string, change: (entries: ZipEntry[]) => ZipEntry[]): Uint8Array {
  return writeZip(change(readZip(fs.readFileSync(archive))));
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

describe('keygen', () => {
  test('writes a PKCS8 private key with mode 0600 and a trusted_keys public key', () => {
    const dir = path.join(workdir, 'nested/keys');
    expect(keygenCommand(dir, quietLog())).toBe(0);

    const privatePath = path.join(dir, PRIVATE_KEY_FILE);
    const publicPath = path.join(dir, PUBLIC_KEY_FILE);
    const pem = fs.readFileSync(privatePath, 'utf8');
    expect(pem).toContain('-----BEGIN PRIVATE KEY-----');
    expect(pem).toContain('-----END PRIVATE KEY-----');
    expect(pem).not.toContain('ENCRYPTED');
    if (process.platform !== 'win32') expect(fs.statSync(privatePath).mode & 0o777).toBe(0o600);

    const publicText = fs.readFileSync(publicPath, 'utf8');
    expect(publicText).not.toContain('BEGIN');
    expect(publicText.endsWith('\n')).toBe(true);
    const lines = publicText.split('\n').filter((line) => line !== '');
    expect(lines).toHaveLength(1);
    expect(Buffer.from(lines[0], 'base64')).toHaveLength(32);

    // The public file must be the key that belongs to the private file.
    const privateKey = createPrivateKey(pem);
    expect(privateKey.asymmetricKeyType).toBe('ed25519');
    const spki = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }) as Buffer;
    expect(spki.subarray(spki.length - 32).equals(parseTrustedKeys(publicPath)[0])).toBe(true);
  });

  test('refuses to overwrite an existing key pair', () => {
    const dir = path.join(workdir, 'taken');
    expect(keygenCommand(dir, quietLog())).toBe(0);
    const pem = fs.readFileSync(path.join(dir, PRIVATE_KEY_FILE));
    const trusted = fs.readFileSync(path.join(dir, PUBLIC_KEY_FILE));

    const { log, text: output } = captureLog();
    expect(keygenCommand(dir, log)).toBe(1);
    expect(output()).toContain('refusing to overwrite');
    expect(fs.readFileSync(path.join(dir, PRIVATE_KEY_FILE))).toEqual(pem);
    expect(fs.readFileSync(path.join(dir, PUBLIC_KEY_FILE))).toEqual(trusted);
  });
});

describe('sign', () => {
  test('signs a package in place and verifies with node ed25519 against trusted_keys', () => {
    const { archive } = makePackage();
    const { privatePath, publicPath, raw } = makeKeys();
    const before = readZip(fs.readFileSync(archive));

    expect(signCommand(archive, { key: privatePath }, quietLog())).toBe(0);

    const after = readZip(fs.readFileSync(archive));
    const sums = entry(fs.readFileSync(archive), 'SHA256SUMS');
    const signature = Buffer.from(text(entry(fs.readFileSync(archive), SIGNATURE_FILE)).trim(), 'base64');
    expect(signature).toHaveLength(64);
    expect(verify(null, sums.data, publicKeyFromRaw(parseTrustedKeys(publicPath)[0]), signature)).toBe(true);

    // SHA256SUMS was already consistent, so the exact bytes must be signed unchanged.
    const originalSums = before.find((item) => item.name === 'SHA256SUMS');
    expect(originalSums).toBeDefined();
    expect(sums.data).toEqual(originalSums!.data);

    // The leaf key in trusted_keys is the one used for the check.
    expect(raw).toHaveLength(32);
    expect(fs.readFileSync(publicPath, 'utf8').split('\n').filter(Boolean)).toHaveLength(1);
    expect(after.filter((item) => !item.directory).length).toBe(before.filter((item) => !item.directory).length + 1);
  });

  test('--out keeps the input and the output holds SIGNATURE plus every original entry', () => {
    const { archive } = makePackage();
    const { privatePath } = makeKeys();
    const out = path.join(workdir, 'signed.llplugin');
    const input = fs.readFileSync(archive);

    expect(signCommand(archive, { key: privatePath, out }, quietLog())).toBe(0);

    expect(fs.readFileSync(archive)).toEqual(input);
    const original = readZip(input).filter((item) => !item.directory);
    const signed = readZip(fs.readFileSync(out)).filter((item) => !item.directory);
    const byName = new Map(signed.map((item) => [item.name, item]));

    expect(byName.has(SIGNATURE_FILE)).toBe(true);
    expect(signed).toHaveLength(original.length + 1);
    for (const file of original) {
      const copy = byName.get(file.name);
      expect(copy).toBeDefined();
      expect(copy?.data).toEqual(file.data);
      expect(copy?.mode).toBe(file.mode);
    }
  });

  test('keeps directory records when repacking', () => {
    const { archive } = makePackage();
    const { privatePath } = makeKeys();
    const withDir = readZip(fs.readFileSync(archive));
    withDir.unshift({ name: 'bin/', data: new Uint8Array(0), mode: 0o755, directory: true });
    fs.writeFileSync(archive, writeZip(withDir));

    expect(signCommand(archive, { key: privatePath }, quietLog())).toBe(0);

    const signed = readZip(fs.readFileSync(archive));
    expect(signed.some((item) => item.name === 'bin/' && item.directory)).toBe(true);
    expect(signed.some((item) => item.name === SIGNATURE_FILE)).toBe(true);
  });

  test('refuses a package whose SHA256SUMS does not match the files', () => {
    const { archive } = makePackage();
    const { privatePath } = makeKeys();
    const tampered = rewrite(archive, (entries) =>
      entries.map((item) => {
        if (item.name !== 'SHA256SUMS') return item;
        const sums = text(item);
        const first = sums[0] === '0' ? '1' : '0';
        return { ...item, data: new TextEncoder().encode(first + sums.slice(1)) };
      }),
    );
    fs.writeFileSync(archive, tampered);
    const { log, text: output } = captureLog();

    expect(signCommand(archive, { key: privatePath }, log)).toBe(1);
    expect(output()).toContain('refusing to sign');
    expect(output()).toContain('checksum mismatch');
    expect(output()).toContain('SHA256SUMS');
    expect(readZip(fs.readFileSync(archive)).some((item) => item.name === SIGNATURE_FILE)).toBe(false);
  });

  test('refuses a package whose files were changed after SHA256SUMS was written', () => {
    const { archive } = makePackage();
    const { privatePath } = makeKeys();
    const tampered = rewrite(archive, (entries) =>
      entries.map((item) => (item.name === 'plugin.json' ? { ...item, data: new TextEncoder().encode('{}') } : item)),
    );
    fs.writeFileSync(archive, tampered);
    const { log, text: output } = captureLog();

    expect(signCommand(archive, { key: privatePath }, log)).toBe(1);
    expect(output()).toContain('checksum mismatch for "plugin.json"');
  });

  test('builds SHA256SUMS when a package has none, then signs it', () => {
    const { archive } = makePackage();
    const { privatePath, raw } = makeKeys();
    const rebuilt = rewrite(archive, (entries) => entries.filter((item) => item.name !== 'SHA256SUMS'));
    fs.writeFileSync(archive, rebuilt);
    const { log, text: output } = captureLog();

    expect(signCommand(archive, { key: privatePath }, log)).toBe(0);
    expect(output()).toContain('generated one');

    const sums = text(entry(fs.readFileSync(archive), 'SHA256SUMS'));
    const files = readZip(fs.readFileSync(archive)).filter(
      (item) => !item.directory && item.name !== 'SHA256SUMS' && item.name !== SIGNATURE_FILE,
    );
    for (const file of files) {
      expect(sums).toContain(`${sha256(file.data)}  ${file.name}\n`);
    }
    const signature = Buffer.from(text(entry(fs.readFileSync(archive), SIGNATURE_FILE)).trim(), 'base64');
    expect(verify(null, new TextEncoder().encode(sums), publicKeyFromRaw(raw), signature)).toBe(true);
  });

  test('fails without a key, with a missing key, and with a non-ed25519 key', () => {
    const { archive } = makePackage();

    let captured = captureLog();
    expect(signCommand(archive, {}, captured.log)).toBe(1);
    expect(captured.text()).toContain('--key');

    captured = captureLog();
    expect(signCommand(archive, { key: path.join(workdir, 'missing.pem') }, captured.log)).toBe(1);
    expect(captured.text()).toContain('private key not found');

    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rsaPath = path.join(workdir, 'rsa.pem');
    fs.writeFileSync(rsaPath, rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    captured = captureLog();
    expect(signCommand(archive, { key: rsaPath }, captured.log)).toBe(1);
    expect(captured.text()).toContain('not ed25519');
    expect(readZip(fs.readFileSync(archive)).some((item) => item.name === SIGNATURE_FILE)).toBe(false);
  });

  test('refuses a missing package and an unsafe entry path', () => {
    const { privatePath } = makeKeys();
    let captured = captureLog();
    expect(signCommand(path.join(workdir, 'nope.llplugin'), { key: privatePath }, captured.log)).toBe(1);
    expect(captured.text()).toContain('package not found');

    const unsafe = path.join(workdir, 'unsafe.llplugin');
    fs.writeFileSync(
      unsafe,
      writeZip([
        { name: 'plugin.json', data: new TextEncoder().encode('{}') },
        { name: '../escape', data: new TextEncoder().encode('x') },
      ]),
    );
    captured = captureLog();
    expect(signCommand(unsafe, { key: privatePath }, captured.log)).toBe(1);
    expect(captured.text()).toContain('unsafe package entry');
    expect(captured.text()).toContain('leaves the package');
  });

  test('the signed package still validates', () => {
    const { archive } = makePackage();
    const { privatePath } = makeKeys();
    expect(signCommand(archive, { key: privatePath }, quietLog())).toBe(0);

    const extracted = path.join(workdir, 'extracted');
    for (const item of readZip(fs.readFileSync(archive))) {
      if (item.directory || item.name === 'SHA256SUMS' || item.name === SIGNATURE_FILE) continue;
      const target = path.join(extracted, item.name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, item.data, { mode: item.mode });
    }
    expect(validateCommand(extracted, quietLog())).toBe(0);
  });

  test('the llp CLI routes keygen and sign', async () => {
    const { archive } = makePackage();
    const keys = path.join(workdir, 'cli-keys');
    const signed = path.join(workdir, 'cli-signed.llplugin');
    const stderrWrite = process.stderr.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      expect(await main(['keygen', '--out', keys], workdir)).toBe(0);
      expect(await main(['sign', archive, '--key', path.join(keys, PRIVATE_KEY_FILE), '--out', signed], workdir)).toBe(0);
    } finally {
      process.stderr.write = stderrWrite;
    }
    expect(entry(fs.readFileSync(signed), SIGNATURE_FILE)).toBeDefined();
  });
});
