/** Minimal zip writer: deflated entries, unix modes, fixed timestamps so packs are reproducible. */
import { deflateRawSync } from 'node:zlib';

export interface ZipEntry {
  /** path inside the archive, forward slashes */
  name: string;
  data: Uint8Array;
  /** unix permission bits, such as 0o755 */
  mode?: number;
}

const DEFLATE = 8;
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = (3 << 8) | VERSION_NEEDED;
const UTF8_FLAG = 0x0800;
// 1980-01-01 00:00:00 in DOS date and time format
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const DEFAULT_MODE = 0o644;

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
