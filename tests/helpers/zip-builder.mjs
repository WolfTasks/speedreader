// tests/helpers/zip-builder.mjs — builds real (deflate) ZIP archives in memory for tests.
import { crc32, deflateRawSync } from 'node:zlib';

/**
 * entries: [{ name, data (string|Uint8Array), declaredSize? }]
 * declaredSize overrides the uncompressed size written to the central directory.
 * options.zip64Locator: insert a ZIP64 EOCD locator before the EOCD record.
 */
export function buildZip(entries, { zip64Locator = false, comment = '' } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data, declaredSize } of entries) {
    const raw = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
    const compressed = deflateRawSync(raw);
    const nameBuf = Buffer.from(name);
    const crc = crc32(raw);
    const size = declaredSize ?? raw.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);                       // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const cd = Buffer.concat(centrals);
  const parts = [...locals, cd];
  if (zip64Locator) {
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0);
    parts.push(loc);
  }
  const commentBuf = Buffer.from(comment);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(commentBuf.length, 20);
  parts.push(eocd, commentBuf);

  return new Uint8Array(Buffer.concat(parts));
}

/** Copy into a standalone ArrayBuffer (Buffer pools share memory). */
export const toArrayBuffer = (u8) => u8.slice().buffer;
