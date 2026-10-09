// The offline download (README, "Running it without the internet"): npm run build
// zips the fast site into _site/school-games-offline.zip. A small reader written
// here, independent of tools/lib/zip.mjs, unpacks it with Node's zlib and checks
// every header, CRC-32 and byte against the built folder.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { zip, crc32 } from '../lib/zip.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZIP_NAME = 'school-games-offline.zip';
const FOLDER = 'school-games/';
// 1 January 1980 00:00 in MS-DOS format: the same bytes on every build.
const DOS_TIME = 0, DOS_DATE = 33;

// CRC-32 bit by bit: no table shared with the writer, and no zlib.crc32 (Node 22.2+).
function checksum(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

// Reads a ZIP without data descriptors, encryption, ZIP64 or a comment (all that the
// writer may produce) and refuses gaps or hidden data between its parts.
function readZip(bytes) {
  const buf = Buffer.from(bytes), end = buf.length - 22, entries = [];
  assert.ok(end >= 0, 'ZIP is too short');
  assert.equal(buf.readUInt32LE(end), 0x06054b50, 'end of central directory, without a comment');
  assert.equal(buf.readUInt16LE(end + 4), 0, 'single disk');
  assert.equal(buf.readUInt16LE(end + 6), 0, 'single disk');
  const count = buf.readUInt16LE(end + 10), size = buf.readUInt32LE(end + 12), start = buf.readUInt32LE(end + 16);
  assert.equal(buf.readUInt16LE(end + 8), count, 'entries on this disk');
  assert.equal(start + size, end, 'central directory ends at its end record');
  let p = start, next = 0;
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'central directory entry');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    const time = buf.readUInt16LE(p + 12), date = buf.readUInt16LE(p + 14), crc = buf.readUInt32LE(p + 16);
    const packed = buf.readUInt32LE(p + 20), length = buf.readUInt32LE(p + 24), nameLength = buf.readUInt16LE(p + 28);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength), offset = buf.readUInt32LE(p + 42);
    assert.ok(buf.readUInt16LE(p + 6) <= 20, name + ': needs no newer extractor than ZIP 2.0');
    assert.equal(flags & ~0x0800, 0, name + ': no encryption or data descriptor');
    assert.ok(method === 0 || method === 8, name + ': stored or deflated');
    assert.equal(offset, next, name + ': follows the previous entry without a gap');
    // The local header repeats the central record's fields.
    assert.equal(buf.readUInt32LE(offset), 0x04034b50, name + ': local header');
    const local = [buf.readUInt16LE(offset + 6), buf.readUInt16LE(offset + 8), buf.readUInt16LE(offset + 10), buf.readUInt16LE(offset + 12),
      buf.readUInt32LE(offset + 14), buf.readUInt32LE(offset + 18), buf.readUInt32LE(offset + 22)];
    assert.deepEqual(local, [flags, method, time, date, crc, packed, length], name + ': local header matches the central directory');
    assert.equal(buf.readUInt16LE(offset + 26), nameLength, name + ': local name length');
    assert.equal(buf.toString('utf8', offset + 30, offset + 30 + nameLength), name, name + ': local name');
    const from = offset + 30 + nameLength + buf.readUInt16LE(offset + 28);
    const body = buf.subarray(from, from + packed);
    const data = method === 8 ? zlib.inflateRawSync(body) : Buffer.from(body);
    assert.equal(data.length, length, name + ': uncompressed size');
    assert.equal(checksum(data), crc, name + ': CRC-32');
    entries.push({ name, data, flags, method, time, date });
    next = from + packed;
    p += 46 + nameLength + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  assert.equal(next, start, 'the central directory follows the last entry');
  assert.equal(p, end, 'the central directory holds every entry');
  return entries;
}

function filesUnder(root, rel = '') {
  return fs.readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap(entry => {
    const file = rel ? rel + '/' + entry.name : entry.name;
    return entry.isDirectory() ? filesUnder(root, file) : [file];
  });
}

test('the ZIP writer keeps exact bytes with checked CRC-32s, fixed dates and UTF-8 names only where needed', () => {
  for (const sum of [crc32, checksum]) assert.equal(sum(Buffer.from('123456789')), 0xcbf43926, 'standard CRC-32 check value');
  let noise = Buffer.alloc(0);
  while (noise.length < 4096) noise = Buffer.concat([noise, crypto.createHash('sha256').update(noise).digest()]);
  const files = [
    { name: 'site/index.html', data: Buffer.from('<p>مرحبا</p>\n'.repeat(400)) },
    { name: 'site/noise.bin', data: noise },
    { name: 'site/empty.txt', data: Buffer.alloc(0) },
    { name: 'site/خط المدرسة.woff2', data: Buffer.from('font bytes') }
  ];
  const bytes = zip(files);
  assert.deepEqual(zip(files), bytes, 'the same files always give the same ZIP');
  const entries = readZip(bytes);
  assert.deepEqual(entries.map(entry => entry.name), files.map(file => file.name));
  entries.forEach((entry, i) => {
    assert.ok(entry.data.equals(files[i].data), entry.name + ' round-trips');
    assert.equal(crc32(files[i].data), checksum(files[i].data), entry.name + ' CRC-32 agrees with the bitwise one');
    assert.deepEqual([entry.time, entry.date], [DOS_TIME, DOS_DATE], entry.name + ' has the fixed date');
  });
  // Text shrinks; random bytes, empty and tiny files are stored as they are.
  assert.deepEqual(entries.map(entry => entry.method), [8, 0, 0, 0]);
  assert.deepEqual(entries.map(entry => entry.flags), [0, 0, 0, 0x0800], 'only the Arabic name is marked UTF-8');
  for (const name of ['../escape.txt', 'site/../escape.txt', '/root.txt', 'C:/root.txt', 'site\\file.txt', 'site//file.txt', 'site/./file.txt', 'site/', '']) {
    assert.throws(() => zip([{ name, data: Buffer.from('x') }]), /invalid or duplicate ZIP entry name/, JSON.stringify(name));
  }
  assert.throws(() => zip([files[0], files[0]]), /invalid or duplicate ZIP entry name/);
});

test('the fast build ships itself as one school-games/ folder in a ZIP that the offline cache never downloads', t => {
  fs.mkdirSync(path.join(repo, '.work'), { recursive: true });
  // An empty, untracked folder that the builder accepts as its output.
  const out = fs.mkdtempSync(path.join(repo, '.work', 'offline-download-test-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const built = spawnSync(process.execPath, ['tools/build.mjs', '--out', path.relative(repo, out)], { cwd: repo, encoding: 'utf8', timeout: 120000 });
  assert.equal(built.status, 0, built.stderr || built.error?.message);
  assert.match(built.stdout, new RegExp('offline download: ' + ZIP_NAME.replace(/\./g, '\\.') + ', \\d+ files in school-games/'));

  const site = filesUnder(out).sort();
  const download = fs.readFileSync(path.join(out, ZIP_NAME));
  const entries = readZip(download);
  for (const entry of entries) {
    assert.ok(entry.name.startsWith(FOLDER), entry.name + ' sits inside the one school-games/ folder');
    assert.equal(entry.flags, /[^\x00-\x7f]/.test(entry.name) ? 0x0800 : 0, entry.name + ': UTF-8 flag only for non-ASCII names');
    assert.deepEqual([entry.time, entry.date], [DOS_TIME, DOS_DATE], entry.name + ' has the fixed date');
  }
  // Exactly the files the folder needs: everything built except GitHub Pages'
  // .nojekyll, the builder's ownership marker and the download itself.
  const outside = ['.nojekyll', '.school-games-build.json', ZIP_NAME];
  for (const file of outside) assert.ok(site.includes(file), 'the build writes ' + file);
  const names = entries.map(entry => entry.name.slice(FOLDER.length));
  assert.deepEqual(names, site.filter(file => !outside.includes(file)), 'the ZIP holds every other built file once, in sorted order');
  for (const entry of entries) {
    assert.ok(entry.data.equals(fs.readFileSync(path.join(out, entry.name.slice(FOLDER.length)))), entry.name + ' matches the built file byte for byte');
  }
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(repo, 'js/catalog.js'), 'utf8'), sandbox);
  for (const file of ['index.html', 'teacher.html', 'sw.js', 'favicon.svg', 'manifest.webmanifest', 'lib/three/three.min.js', 'lib/three/LICENSE',
    ...sandbox.window.GAMES.map(game => 'games/' + game.slug + '/index.html')]) {
    assert.ok(names.includes(file), 'the folder has ' + file);
  }
  assert.ok(names.some(file => /^shared\/fonts\/LICENSE/.test(file)), 'font licenses travel with the fonts');
  assert.ok(entries.filter(entry => entry.name.endsWith('.html')).every(entry => entry.method === 8), 'pages are deflated');
  const total = entries.reduce((sum, entry) => sum + entry.data.length, 0);
  assert.ok(download.length < total * 0.6, `the download (${download.length} bytes) is compressed (${total} bytes unpacked)`);

  // Children's PCs never cache the teacher's download; the next build may replace it.
  const worker = fs.readFileSync(path.join(out, 'sw.js'), 'utf8');
  const precache = JSON.parse(worker.match(/^var FILES = (.+);$/m)[1]);
  assert.ok(Object.hasOwn(precache, 'index.html') && Object.hasOwn(precache, 'teacher.html'));
  assert.equal(Object.hasOwn(precache, ZIP_NAME), false, 'the ZIP is not in the offline cache');
  assert.equal(worker.includes(ZIP_NAME), false, 'the worker never names the ZIP');
  const marker = JSON.parse(fs.readFileSync(path.join(out, '.school-games-build.json'), 'utf8'));
  assert.ok(marker.files.includes(ZIP_NAME), 'the ownership marker lets the next build replace the ZIP');
});
