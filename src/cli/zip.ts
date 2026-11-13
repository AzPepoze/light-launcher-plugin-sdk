/** Minimal zip reader and writer: deflated entries, unix modes, fixed timestamps so packs are reproducible. */
import { deflateRawSync, inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  /** path inside the archive, forward slashes */
  name: string;
  data: Uint8Array;
  /** unix permission bits, such as 0o755 */
  mode?: number;
  /** true for a directory record, which carries no data */
  directory?: boolean;
}

const DEFLATE = 8;
const STORED = 0;
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = (3 << 8) | VERSION_NEEDED;
const UTF8_FLAG = 0x0800;
// 1980-01-01 00:00:00 in DOS date and time format
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const DEFAULT_MODE = 0o644;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_SIZE = 22;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const MAX_ENTRIES = 5000;
const MAX_ENTRY_BYTES = 256 << 20;
const MAX_TOTAL_BYTES = 512 << 20;
const UNIX_PLATFORM = 3;
const FILE_TYPE = 0o170000;
const REGULAR_FILE = 0o100000;
const DIRECTORY = 0o040000;
const SYMLINK = 0o120000;

export function writeZip(entries: ZipEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const crc = Bun.hash.crc32(entry.data);
    const packed = new Uint8Array(deflateRawSync(entry.data));

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, VERSION_NEEDED, true);
    local.setUint16(6, UTF8_FLAG, true);
    local.setUint16(8, DEFLATE, true);
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, packed.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);

    const header = new Uint8Array(local.buffer);
    parts.push(header, name, packed);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, VERSION_MADE_BY, true);
    dir.setUint16(6, VERSION_NEEDED, true);
    dir.setUint16(8, UTF8_FLAG, true);
    dir.setUint16(10, DEFLATE, true);
    dir.setUint16(12, DOS_TIME, true);
    dir.setUint16(14, DOS_DATE, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, packed.length, true);
    dir.setUint32(24, entry.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint16(30, 0, true);
    dir.setUint16(32, 0, true);
    dir.setUint16(34, 0, true);
    dir.setUint16(36, 0, true);
    dir.setUint32(38, ((entry.mode ?? DEFAULT_MODE) << 16) >>> 0, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);

    offset += header.length + name.length + packed.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return concat([...parts, ...central, new Uint8Array(end.buffer)]);
}

/**
 * Reads a zip archive into its entries. Stored and deflated files are supported; zip64,
 * encrypted entries and special files are refused. Directory records are returned with
 * `directory: true`. Entry names are not checked for safety here.
 */
export function readZip(data: Uint8Array): ZipEntry[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  const count = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);

  if (count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('zip64 archives are not supported');
  }
  if (count > MAX_ENTRIES) throw new Error(`archive has ${count} entries, the limit is ${MAX_ENTRIES}`);
  if (centralOffset + centralSize > eocd) throw new Error('the central directory is out of bounds');

  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  const decoder = new TextDecoder();
  let total = 0;
  let pos = centralOffset;

  for (let index = 0; index < count; index++) {
    if (pos + CENTRAL_HEADER_SIZE > data.length || view.getUint32(pos, true) !== CENTRAL_SIGNATURE) {
      throw new Error(`central directory entry ${index + 1} is truncated`);
    }
    const madeBy = view.getUint16(pos + 4, true);
    const flags = view.getUint16(pos + 8, true);
    const method = view.getUint16(pos + 10, true);
    const crc = view.getUint32(pos + 16, true);
    const packedSize = view.getUint32(pos + 20, true);
    const unpackedSize = view.getUint32(pos + 24, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const externalAttributes = view.getUint32(pos + 38, true);
    const localOffset = view.getUint32(pos + 42, true);
    const next = pos + CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
    if (next > data.length) throw new Error(`central directory entry ${index + 1} is truncated`);

    const name = decoder.decode(data.subarray(pos + CENTRAL_HEADER_SIZE, pos + CENTRAL_HEADER_SIZE + nameLength));
    pos = next;

    if (packedSize === 0xffffffff || unpackedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error(`"${name}" needs zip64, which is not supported`);
    }
    if ((flags & 0x0001) !== 0) throw new Error(`"${name}" is encrypted; encrypted archives are not supported`);
    if (name === '') throw new Error(`central directory entry ${index + 1} has an empty name`);
    if (seen.has(name)) throw new Error(`archive lists "${name}" twice`);
    seen.add(name);

    const platform = madeBy >>> 8;
    const mode = platform === UNIX_PLATFORM ? (externalAttributes >>> 16) & 0xffff : 0;
    const type = mode & FILE_TYPE;
    const directory = name.endsWith('/') || type === DIRECTORY;
    if (directory) {
      entries.push({ name, data: new Uint8Array(0), mode: (mode & 0o777) || 0o755, directory: true });
      continue;
    }
    if (type === SYMLINK) throw new Error(`"${name}" is a symbolic link; packages may only hold regular files`);
    if (type !== 0 && type !== REGULAR_FILE) throw new Error(`"${name}" is not a regular file`);
    if (method !== STORED && method !== DEFLATE) {
      throw new Error(`"${name}" uses unsupported compression method ${method}; use stored or deflate`);
    }
    if (unpackedSize > MAX_ENTRY_BYTES) {
      throw new Error(`"${name}" is larger than ${MAX_ENTRY_BYTES} bytes`);
    }
    total += unpackedSize;
    if (total > MAX_TOTAL_BYTES) throw new Error(`archive expands past ${MAX_TOTAL_BYTES} bytes`);

    if (localOffset + LOCAL_HEADER_SIZE > data.length || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error(`local header for "${name}" is missing`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + LOCAL_HEADER_SIZE + localNameLength + localExtraLength;
    const end = start + packedSize;
    if (end > data.length) throw new Error(`data for "${name}" is truncated`);

    let content: Uint8Array;
    try {
      content =
        method === STORED
          ? data.slice(start, end)
          : new Uint8Array(inflateRawSync(data.subarray(start, end), { maxOutputLength: Math.max(unpackedSize, 1) }));
    } catch (err) {
      throw new Error(`cannot unpack "${name}": ${(err as Error).message}`);
    }
    if (content.length !== unpackedSize) {
      throw new Error(`"${name}" unpacked to ${content.length} bytes, expected ${unpackedSize}`);
    }
    if ((Bun.hash.crc32(content) >>> 0) !== crc) throw new Error(`checksum mismatch inside the archive for "${name}"`);

    entries.push({ name, data: content, mode: (mode & 0o777) || DEFAULT_MODE });
  }

  return entries;
}

function findEndOfCentralDirectory(view: DataView): number {
  const first = Math.max(0, view.byteLength - EOCD_SIZE - 0xffff);
  for (let pos = view.byteLength - EOCD_SIZE; pos >= first; pos--) {
    if (view.getUint32(pos, true) !== EOCD_SIGNATURE) continue;
    const commentLength = view.getUint16(pos + 20, true);
    if (pos + EOCD_SIZE + commentLength === view.byteLength) return pos;
  }
  throw new Error('not a zip file: the end of central directory record is missing');
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of parts) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}
