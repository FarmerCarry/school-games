// A small ZIP writer for the offline download made by tools/build.mjs. No library:
// Node's raw deflate, a table CRC-32 and one fixed timestamp, so the same files
// always give the same ZIP bytes. No ZIP64: the site is far below 4 GB and 65,535 files.
// js/teacher.js has its own stored-only writer for the Excel export; it cannot share
// this one, because the teacher page is a plain browser script without modules or zlib.
import zlib from 'node:zlib';

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

export function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

// Every entry is dated 1 January 1980 00:00, the earliest date a ZIP can hold.
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;
const UTF8_NAME = 0x0800;
const MAX_32 = 0xffffffff;

// Relative names only: an extractor must never be told to write outside its folder.
function validName(name) {
  return typeof name === 'string' && Buffer.byteLength(name) <= 0xffff && !name.includes('\\') &&
    !name.startsWith('/') && !/^[a-z]:/i.test(name) && name.split('/').every(part => part && part !== '.' && part !== '..');
}

// Version needed, flags, method, time, date, CRC, sizes and name length: the fields
// a local header (from byte 4) and its central directory record (from byte 6) share.
function sharedFields(buffer, at, entry) {
  buffer.writeUInt16LE(20, at);
  buffer.writeUInt16LE(entry.flags, at + 2);
  buffer.writeUInt16LE(entry.method, at + 4);
  buffer.writeUInt16LE(DOS_TIME, at + 6);
  buffer.writeUInt16LE(DOS_DATE, at + 8);
  buffer.writeUInt32LE(entry.crc, at + 10);
  buffer.writeUInt32LE(entry.body.length, at + 14);
  buffer.writeUInt32LE(entry.size, at + 18);
  buffer.writeUInt16LE(entry.name.length, at + 22);
  buffer.writeUInt16LE(0, at + 24); // no extra field
}

// files: [{ name: 'folder/file.ext', data: Buffer }], stored in the given order.
export function zip(files) {
  if (files.length > 0xffff) throw new Error('too many files for a ZIP without ZIP64: ' + files.length);
  const seen = new Set(), parts = [], directory = [];
  let offset = 0;
  for (const file of files) {
    if (!validName(file.name) || seen.has(file.name)) throw new Error('invalid or duplicate ZIP entry name: ' + file.name);
    seen.add(file.name);
    const data = file.data;
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    // Fonts and PNG icons are compressed already: store a file when deflate does not shrink it.
    const method = deflated.length < data.length ? 8 : 0;
    const entry = {
      name: Buffer.from(file.name, 'utf8'), flags: /[^\x00-\x7f]/.test(file.name) ? UTF8_NAME : 0,
      method, body: method ? deflated : data, crc: crc32(data), size: data.length, offset
    };
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    sharedFields(local, 4, entry);
    parts.push(local, entry.name, entry.body);
    offset += local.length + entry.name.length + entry.body.length;
    if (data.length > MAX_32 || offset > MAX_32) throw new Error('ZIP too large without ZIP64');
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4); // made by: MS-DOS attributes, version 2.0
    sharedFields(record, 6, entry);
    // Comment length, disk number, internal and external attributes stay 0.
    record.writeUInt32LE(entry.offset, 42);
    directory.push(record, entry.name);
  }
  const directorySize = directory.reduce((total, part) => total + part.length, 0);
  if (offset + directorySize > MAX_32) throw new Error('ZIP too large without ZIP64');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...directory, end]);
}
