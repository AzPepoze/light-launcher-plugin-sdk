/** Signs a package's SHA256SUMS bytes with an ed25519 key, then repacks it. */
import { createPrivateKey, sign as signBytes, type KeyObject } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from '../../runtime/logger';
import { readZip, writeZip, type ZipEntry } from '../zip';
import { CHECKSUM_FILE, checksumLines, sha256Hex } from './pack';

export const SIGNATURE_FILE = 'SIGNATURE';
const SIGNATURE_SIZE = 64;
const FILE_MODE = 0o644;
const MANIFEST_FILE = 'plugin.json';
const MAX_SEGMENT_BYTES = 255;
const DRIVE_LETTER = /^[A-Za-z]:/;
const CONTROL_CHARS = /[\p{Cc}]/u;
const ILLEGAL_CHARS = /[<>:"|?*]/;
const LOWER_HEX = /^[0-9a-f]{64}$/;
const RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
  'COM¹', 'COM²', 'COM³', 'LPT¹', 'LPT²', 'LPT³',
]);

export interface SignOptions {
  key?: string;
  out?: string;
}

interface PackageFile {
  name: string;
  data: Uint8Array;
  mode: number;
}

/**
 * Verifies (or builds) SHA256SUMS, signs those exact bytes, and writes a package with
 * SHA256SUMS and SIGNATURE. Without --out the input package is replaced atomically.
 */
export function signCommand(packagePath: string, options: SignOptions, log: Logger): number {
  const inputPath = path.resolve(packagePath);
  const outputPath = options.out ? path.resolve(options.out) : inputPath;
  if (!options.key) {
    log.error('sign needs --key <private.pem> (run llp keygen first)');
    return 1;
  }
  const keyPath = path.resolve(options.key);
  if (outputPath === keyPath) {
    log.error('refusing to write the package over the private key');
    return 1;
  }

  let packageStat: fs.Stats;
  try {
    packageStat = fs.statSync(inputPath);
  } catch {
    log.error(`package not found: ${inputPath}`);
    return 1;
  }
  if (!packageStat.isFile()) {
    log.error(`package is not a file: ${inputPath}`);
    return 1;
  }

  const privateKey = readPrivateKey(keyPath, log);
  if (!privateKey) return 1;

  let entries: ZipEntry[];
  try {
    entries = readZip(fs.readFileSync(inputPath));
  } catch (err) {
    log.error(`cannot unpack ${inputPath}: ${(err as Error).message}`);
    return 1;
  }

  const files = new Map<string, PackageFile>();
  const validated: { entry: ZipEntry; name: string }[] = [];
  const seen = new Set<string>();
  let checksumBytes: Uint8Array | undefined;
  let hadSignature = false;

  for (const entry of entries) {
    let name: string;
    try {
      name = safePackagePath(entry.name);
    } catch (err) {
      log.error(`unsafe package entry: ${(err as Error).message}`);
      return 1;
    }
    if (seen.has(name)) {
      log.error(`package lists "${name}" twice`);
      return 1;
    }
    seen.add(name);
    validated.push({ entry, name });
    if (entry.directory) continue;

    if (name === CHECKSUM_FILE) {
      checksumBytes = entry.data;
    } else if (name === SIGNATURE_FILE) {
      hadSignature = true;
    } else {
      files.set(name, { name, data: entry.data, mode: entry.mode ?? FILE_MODE });
    }
  }

  if (!files.has(MANIFEST_FILE)) {
    log.error(`package has no ${MANIFEST_FILE}`);
    return 1;
  }

  let generatedChecksums = false;
  if (checksumBytes) {
    try {
      verifyChecksums(checksumBytes, files);
    } catch (err) {
      log.error(`refusing to sign ${inputPath}: ${(err as Error).message}`);
      return 1;
    }
  } else {
    generatedChecksums = true;
    checksumBytes = new TextEncoder().encode(checksumLines([...files.values()].sort((a, b) => a.name.localeCompare(b.name))));
  }

  const signature = signBytes(null, checksumBytes, privateKey);
  if (signature.length !== SIGNATURE_SIZE) {
    log.error(`crypto backend returned a ${signature.length}-byte signature`);
    return 1;
  }

  const outEntries: ZipEntry[] = [];
  for (const { entry, name } of validated) {
    if (entry.directory) {
      outEntries.push({ name: `${name}/`, data: new Uint8Array(0), mode: entry.mode ?? 0o755, directory: true });
    } else if (name !== CHECKSUM_FILE && name !== SIGNATURE_FILE) {
      outEntries.push({ name, data: entry.data, mode: entry.mode ?? FILE_MODE });
    }
  }
  outEntries.push({ name: CHECKSUM_FILE, data: checksumBytes, mode: FILE_MODE });
  outEntries.push({ name: SIGNATURE_FILE, data: new TextEncoder().encode(`${signature.toString('base64')}\n`), mode: FILE_MODE });

  try {
    writePackage(outputPath, writeZip(outEntries));
  } catch (err) {
    log.error(`cannot write ${outputPath}: ${(err as Error).message}`);
    return 1;
  }

  if (generatedChecksums) log.warn(`package had no ${CHECKSUM_FILE}; generated one for ${files.size} files`);
  if (hadSignature) log.warn(`replaced the existing ${SIGNATURE_FILE}`);
  log.info(`signed ${outputPath} with ${keyPath} (${files.size} files, signature over ${checksumBytes.length} ${CHECKSUM_FILE} bytes)`);
  return 0;
}

function readPrivateKey(keyPath: string, log: Logger): KeyObject | undefined {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(keyPath);
  } catch {
    log.error(`private key not found: ${keyPath}`);
    return undefined;
  }
  if (!stat.isFile()) {
    log.error(`private key is not a file: ${keyPath}`);
    return undefined;
  }

  let key: KeyObject;
  try {
    key = createPrivateKey({ key: fs.readFileSync(keyPath), format: 'pem' });
  } catch (err) {
    log.error(`cannot read private key ${keyPath}: ${(err as Error).message}`);
    return undefined;
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    log.error(`private key is ${key.asymmetricKeyType ?? 'unknown'}, not ed25519; run llp keygen`);
    return undefined;
  }
  return key;
}

/** Checks that SHA256SUMS lists every package file exactly once with the right digest. */
function verifyChecksums(data: Uint8Array, files: Map<string, PackageFile>): void {
  const sums = parseChecksums(data);
  for (const [name, digest] of sums) {
    if (name === CHECKSUM_FILE || name === SIGNATURE_FILE) {
      throw new Error(`${CHECKSUM_FILE} must not list ${name}`);
    }
    const file = files.get(name);
    if (!file) throw new Error(`${CHECKSUM_FILE} lists "${name}", which is not in the package`);
    if (sha256Hex(file.data) !== digest) {
      throw new Error(`checksum mismatch for "${name}": ${CHECKSUM_FILE} is stale, run llp pack again`);
    }
  }
  for (const name of files.keys()) {
    if (!sums.has(name)) throw new Error(`"${name}" is not listed in ${CHECKSUM_FILE}; run llp pack again`);
  }
}

/** Parses sha256sum-style lines. Paths are checked with the same rules as zip entries. */
function parseChecksums(data: Uint8Array): Map<string, string> {
  const sums = new Map<string, string>();
  const lines = new TextDecoder().decode(data).split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].replace(/\r$/, '');
    if (line === '') continue;
    const separator = line.indexOf('  ');
    if (separator < 0) throw new Error(`bad line ${index + 1} in ${CHECKSUM_FILE}: expected "<sha256>  <path>"`);
    const digest = line.slice(0, separator);
    const rawName = line.slice(separator + 2);
    if (!LOWER_HEX.test(digest)) {
      throw new Error(`bad digest on line ${index + 1} in ${CHECKSUM_FILE}: expected 64 lowercase hex characters`);
    }
    const name = safePackagePath(rawName);
    if (sums.has(name)) throw new Error(`${CHECKSUM_FILE} lists "${name}" twice`);
    sums.set(name, digest);
  }
  return sums;
}

/**
 * Returns the cleaned slash path of a zip entry, or throws when the path could escape the
 * package root or names a file the launcher cannot extract. This mirrors the host's checks.
 */
function safePackagePath(name: string): string {
  if (name === '') throw new Error('an entry name is empty');
  if (name.includes('\\')) throw new Error(`path "${name}" contains a backslash`);
  if (name.startsWith('/')) throw new Error(`path "${name}" is absolute`);
  if (DRIVE_LETTER.test(name)) throw new Error(`path "${name}" starts with a drive letter`);

  const clean = path.posix.normalize(name.replace(/\/+$/, ''));
  if (clean === '' || clean === '.' || clean === '..' || clean.startsWith('../')) {
    throw new Error(`path "${name}" leaves the package`);
  }
  for (const segment of clean.split('/')) {
    if (CONTROL_CHARS.test(segment)) throw new Error(`path "${name}" contains a control character`);
    if (ILLEGAL_CHARS.test(segment)) throw new Error(`path "${name}" contains a character that is not allowed in file names`);
    if (segment.endsWith('.') || segment.endsWith(' ')) {
      throw new Error(`path "${name}" has a segment that ends with a dot or a space`);
    }
    if (Buffer.byteLength(segment) > MAX_SEGMENT_BYTES) throw new Error(`path "${name}" has a segment longer than ${MAX_SEGMENT_BYTES} bytes`);
    const stem = segment.split('.')[0].toUpperCase().replace(/[ .]+$/, '');
    if (RESERVED_NAMES.has(stem)) throw new Error(`path "${name}" uses the reserved name "${stem}"`);
  }
  return clean;
}

/** Writes through a temp folder in the destination directory, so a failed sign leaves no half package. */
function writePackage(outputPath: string, bytes: Uint8Array): void {
  const directory = path.dirname(outputPath);
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
    throw new Error(`${outputPath} is a directory`);
  }
  fs.mkdirSync(directory, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(directory, '.llp-sign-'));
  try {
    const tempFile = path.join(tempDir, 'package.llplugin');
    fs.writeFileSync(tempFile, bytes);
    try {
      fs.renameSync(tempFile, outputPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' && code !== 'EPERM') throw err;
      fs.rmSync(outputPath, { force: true });
      fs.renameSync(tempFile, outputPath);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
