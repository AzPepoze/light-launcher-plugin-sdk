/** Generates the ed25519 key pair the launcher's trusted_keys file accepts. */
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from '../log';

export const PRIVATE_KEY_FILE = 'private.pem';
/** The launcher reads this file name from its plugins folder. */
export const PUBLIC_KEY_FILE = 'trusted_keys';
const PRIVATE_KEY_MODE = 0o600;
const PUBLIC_KEY_MODE = 0o644;
/** DER prefix of an ed25519 SubjectPublicKeyInfo; the raw 32-byte key follows it. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_PUBLIC_KEY_BYTES = 32;

/** Writes an ed25519 PKCS8 private key and a trusted_keys public key file into outDir. */
export function keygenCommand(outDir: string, log: Logger): number {
  const privatePath = path.join(outDir, PRIVATE_KEY_FILE);
  const publicPath = path.join(outDir, PUBLIC_KEY_FILE);

  const existing = [privatePath, publicPath].find((file) => fs.existsSync(file));
  if (existing) {
    log.error(`refusing to overwrite ${existing}; delete it or pick another --out folder`);
    return 1;
  }

  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch (err) {
    log.error(`cannot create ${outDir}: ${(err as Error).message}`);
    return 1;
  }

  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  if (
    spki.length !== ED25519_SPKI_PREFIX.length + ED25519_PUBLIC_KEY_BYTES ||
    !spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    log.error('crypto backend returned an unexpected ed25519 public key');
    return 1;
  }
  const raw = spki.subarray(ED25519_SPKI_PREFIX.length);

  try {
    fs.writeFileSync(privatePath, pem, { mode: PRIVATE_KEY_MODE, flag: 'wx' });
    fs.chmodSync(privatePath, PRIVATE_KEY_MODE);
    fs.writeFileSync(publicPath, `${raw.toString('base64')}\n`, { mode: PUBLIC_KEY_MODE, flag: 'wx' });
  } catch (err) {
    fs.rmSync(privatePath, { force: true });
    fs.rmSync(publicPath, { force: true });
    log.error(`cannot write the key pair: ${(err as Error).message}`);
    return 1;
  }

  log.info(`wrote ${privatePath} (ed25519 PKCS8 PEM, mode 0600)`);
  log.info(`wrote ${publicPath} (one base64 raw public key)`);
  log.info(`next: add ${PUBLIC_KEY_FILE} to the launcher's plugins folder, then run llp sign`);
  return 0;
}
