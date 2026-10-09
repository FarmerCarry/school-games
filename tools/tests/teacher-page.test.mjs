// Teacher statistics page (teacher.html, docs/PLAY_STATS.md sections 3 and 4).
// Node checks run the page's pure functions without a browser (in the built page,
// the inlined scripts), including unpacking the .xlsx byte by byte. Browser checks
// use seeded day records and a fixed clock: numbers, periods, exports, combining
// other PCs' files, clear, stop, blocked storage, requests and console errors.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const read = file => fs.readFileSync(file, 'utf8');
// Thursday 8 October 2026; the school week (Sunday first) began on 4 October.
const NOW = new Date('2026-10-08T10:30:00+03:00');
const EXPORTED_AT = '2026-10-08T10:30:00+03:00';

// The exact columns of docs/PLAY_STATS.md section 4, written out here on purpose.
const SOURCES = ['featured', 'catalog', 'recent', 'favorites', 'category', 'quick', 'search', 'related', 'surprise',
  'reload', 'history', 'direct'];
const CONTRACT = {
  days: ['pc', 'pc_label', 'copy', 'date', 'seconds', 'sessions', 'short_sessions', 'calm_on', 'fullscreen',
    'mute_toggles', 'day_complete', 'exported_at'],
  games: ['pc', 'pc_label', 'copy', 'date', 'game', 'game_name', 'opens', 'sessions', 'short_sessions', 'sessions_1_5',
    'sessions_5_15', 'sessions_15_plus', 'never_started', 'seconds', 'hearted', 'rounds', 'wins', 'losses', 'draws',
    'ends', 'quits', 'tutorial_shown', 'tutorial_done', 'loads', 'load_ms_sum', 'load_ms_max', 'loads_skipped',
    'errors', 'timeouts', 'frames_smooth', 'frames_ok', 'frames_choppy', 'frames_stall',
    ...SOURCES.map(source => 'from_' + source), 'day_complete', 'exported_at'],
  levels: ['pc', 'pc_label', 'copy', 'date', 'game', 'game_name', 'level', 'starts', 'visits', 'gave_up', 'wins',
    'losses', 'draws', 'ends', 'quits', 'seconds', 'score_sum', 'score_count', 'score_max', 'day_complete', 'exported_at'],
  hours: ['pc', 'pc_label', 'copy', 'game', 'game_name', 'hour', 'seconds', 'days', 'exported_at']
};
const TEXT = new Set(['pc', 'pc_label', 'copy', 'date', 'game', 'game_name', 'level', 'exported_at']);

/* ------------------------------------------------- the page without a DOM */
function loadPage() {
  const sandbox = vm.createContext({ window: {}, TextEncoder });
  const scripts = process.env.SG_ROOT
    ? [...read(path.join(root, 'teacher.html')).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1])
    : ['js/catalog.js', 'js/teacher.js'].map(file => read(path.join(repo, file)));
  assert.equal(scripts.length, 2, 'the teacher page runs the catalog and its own script');
  for (const script of scripts) vm.runInContext(script, sandbox);
  assert.ok(sandbox.window.SGTeacher, 'pure functions load without a document');
  // Results come back as plain host values (the page's objects belong to the
  // sandbox realm, which strict deep equality would tell apart).
  const plain = value => value && typeof value === 'object'
    ? (value.BYTES_PER_ELEMENT ? Buffer.from(value) : JSON.parse(JSON.stringify(value))) : value;
  const api = new Proxy(sandbox.window.SGTeacher, { get: (target, key) => typeof target[key] === 'function'
    ? (...args) => plain(target[key](...args)) : plain(target[key]) });
  return { api, names: api.names(sandbox.window.GAMES) };
}
const { api, names } = loadPage();

/* ------------------------------------------------------------ seeded data */
const day = (d, g, s = {}) => JSON.stringify({ v: 1, d, s, g });
const META = { pc: { id: 'pcabcd', label: 'جهاز 7' }, off: false, since: '2026-06-01', custom: 'kept' };
function seed() {
  return {
    'sg:site:stats:d:2026-10-08': day('2026-10-08', {
      // lb (load buckets) is no longer recorded; older records that have it still read.
      'candy-rope': { o: 4, e: 1260431, hh: { 9: 840212, 10: 420219 }, b: [1, 1, 2, 0], ns: 1,
        src: { recent: 2, category: 1, direct: 1 }, l: [4, 5230, 2100], lb: [2, 2, 0, 0, 0], ls: 0, x: 1, t: 0,
        f: [8120, 960, 44, 2], tu: [1, 1], fav: 1,
        lv: { L3: [5, 1, 3, 0, 0, 1, 96200, 0, 0, 0, 6, 4], L4: [2, 1, 0, 0, 0, 1, 30000, 0, 0, 0, 2, 1],
          '1-4': [9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9], abc1234: [9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9] } },
      'rail-rush': { o: 2, e: 300000, hh: { 10: 300000, 25: 5000 }, b: [1, 1, 0, 0], ns: -2, src: { featured: 2, evil: 7 },
        f: [300, 20, 0, 0], lv: { endless: [6, 0, 0, 0, 6, 0, 250000, 6000, 1800, 6, 6, 0] } },
      'Bad Slug': { o: 5, e: 999000 }
    }, { calm: 1, fs: 3, mute: 2 }),
    'sg:site:stats:d:2026-10-06': day('2026-10-06', {
      'candy-rope': { o: 2, e: 600000, hh: { 11: 600000 }, b: [0, 0, 1, 0], fav: 1, lv: { L3: [3, 0, 2, 0, 0, 1, 40000, 0, 0, 0, 2, 2] } }
    }),
    'sg:site:stats:d:2026-10-02': day('2026-10-02', {}, { calm: 2 }),
    'sg:site:stats:d:2026-09-20': day('2026-09-20', {
      'tic-tac-toe': { o: 3, e: 900000, hh: { 12: 900000 }, b: [0, 3, 0, 0], tu: [1, 0], lv: { duo: [6, 0, 0, 2, 4, 0, 800000, 0, 0, 0, 1, 0], '2p': [1, 0, 0, 0, 1, 0, 1000, 0, 0, 0, 1, 0] } }
    }),
    'sg:site:stats:d:2026-06-01': day('2026-06-01', { 'merge-2048': { o: 1, e: 120000, hh: { 8: 120000 }, b: [0, 1, 0, 0] } }),
    // Foreign or broken values: ignored, never shown or exported.
    'sg:site:stats:d:2026-10-07': '{not json',
    'sg:site:stats:d:2026-10-05': JSON.stringify({ v: 2, d: '2026-10-05', g: { 'candy-rope': { e: 5000000 } } }),
    'sg:site:stats:d:2026-10-03': day('2026-10-04', { 'candy-rope': { e: 5000000, b: [0, 9, 0, 0] } }),
    'sg:site:stats:d:2026-02-30': day('2026-02-30', { 'candy-rope': { e: 5000000, b: [0, 9, 0, 0] } }),
    'sg:site:stats:live': JSON.stringify({ game: 'candy-rope', e: 1000 }),
    'sg:site:statsmeta': JSON.stringify(META),
    'sg:site:favs': '["candy-rope"]',
    'sg:candy-rope:save': '{"level":4}',
    'other-site-key': 'keep me'
  };
}
function fakeStorage(entries) {
  const map = new Map(Object.entries(entries));
  return { get length() { return map.size; }, key: i => [...map.keys()][i] ?? null, getItem: k => map.has(k) ? map.get(k) : null,
    setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), map };
}
const info = { pc: 'pcabcd', label: 'جهاز 7', copy: 'web', exportedAt: EXPORTED_AT, today: '2026-10-08', names };
function exportRow(table, values) {
  return Object.fromEntries(CONTRACT[table].map(column => [column, Object.hasOwn(values, column) ? values[column] : TEXT.has(column) ? '' : 0]));
}
function otherPcFile(label, exportedAt, days, games, hours) {
  const common = { pc: 'pcwxyz', pc_label: label, copy: 'web', exported_at: exportedAt };
  return { format: 'sg-play-stats', v: 1, pc: { id: 'pcwxyz', label, copy: 'web' }, exported_at: exportedAt, tables: {
    days: days.map(date => exportRow('days', { ...common, date, day_complete: 1 })),
    games: games.map(([date, game, seconds, sessions]) => exportRow('games', { ...common, date, game, game_name: names[game], seconds, sessions, opens: sessions })),
    levels: [],
    hours: hours.map(([game, hour, seconds]) => exportRow('hours', { ...common, game, game_name: names[game], hour, seconds, days: 1 }))
  } };
}
const olderFile = otherPcFile('جهاز 9', '2026-10-05T12:00:00+03:00', ['2026-10-04', '2026-10-05'],
  [['2026-10-04', 'candy-rope', 600, 1], ['2026-10-05', 'candy-rope', 1200, 2]], [['candy-rope', 9, 1800]]);
const newerFile = otherPcFile('جهاز 9ب', '2026-10-07T12:00:00+03:00', ['2026-10-05', '2026-10-06'],
  [['2026-10-05', 'candy-rope', 1800, 3], ['2026-10-06', 'tic-tac-toe', 300, 1]], [['candy-rope', 9, 2400], ['tic-tac-toe', 13, 300]]);

/* ------------------------------------------------------- workbook checks */
function unzip(bytes) {
  const buf = Buffer.from(bytes), end = buf.length - 22, files = new Map();
  assert.equal(buf.readUInt32LE(end), 0x06054b50, 'end of central directory');
  const count = buf.readUInt16LE(end + 10), size = buf.readUInt32LE(end + 12), start = buf.readUInt32LE(end + 16);
  assert.equal(buf.readUInt16LE(end + 8), count);
  assert.equal(start + size, end, 'central directory ends at its end record');
  let p = start;
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'central directory entry');
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), stored = buf.readUInt32LE(p + 20);
    const length = buf.readUInt32LE(p + 24), nameLength = buf.readUInt16LE(p + 28), offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    assert.equal(method, 0, name + ' is stored');
    assert.equal(stored, length, name + ' sizes');
    assert.equal(buf.readUInt32LE(offset), 0x04034b50, name + ' local header');
    assert.equal(buf.readUInt16LE(offset + 8), 0, name + ' local method');
    assert.equal(buf.readUInt32LE(offset + 14), crc, name + ' local CRC');
    assert.equal(buf.toString('utf8', offset + 30, offset + 30 + buf.readUInt16LE(offset + 26)), name);
    const from = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    const data = buf.subarray(from, from + length);
    assert.equal(zlib.crc32(data), crc, name + ' CRC-32');
    assert.equal(files.has(name), false, 'one entry per name');
    files.set(name, data.toString('utf8'));
    p += 46 + nameLength + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  assert.equal(p, end);
  return files;
}

// A small XML well-formedness check: one root, balanced tags, quoted unique
// attributes and only the predefined or numeric entities.
function wellFormed(name, xml) {
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'), name + ': XML declaration');
  const body = xml.slice(xml.indexOf('?>') + 2), NAME = '[A-Za-z_][\\w.:-]*';
  const tag = new RegExp(`<(/?)(${NAME})((?:\\s+${NAME}\\s*=\\s*"[^"<]*")*)\\s*(/?)>`, 'y');
  const attr = new RegExp(`(${NAME})\\s*=\\s*"([^"<]*)"`, 'g');
  const bareAmp = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/;
  const stack = [];
  let roots = 0, i = 0;
  for (;;) {
    const lt = body.indexOf('<', i), text = body.slice(i, lt < 0 ? body.length : lt);
    assert.ok(!bareAmp.test(text) && !text.includes('>'), name + ': text escaping');
    if (!stack.length) assert.equal(text.trim(), '', name + ': text outside the root element');
    if (lt < 0) break;
    tag.lastIndex = lt;
    const m = tag.exec(body);
    assert.ok(m, name + ': malformed tag near ' + body.slice(lt, lt + 60));
    const attrs = [...m[3].matchAll(attr)];
    assert.equal(new Set(attrs.map(a => a[1])).size, attrs.length, name + ': duplicate attribute');
    for (const a of attrs) assert.ok(!bareAmp.test(a[2]), name + ': attribute escaping');
    if (m[1]) assert.equal(stack.pop(), m[2], name + ': closing tag ' + m[2]);
    else if (!m[4]) { roots += stack.length ? 0 : 1; stack.push(m[2]); }
    else roots += stack.length ? 0 : 1;
    i = tag.lastIndex;
  }
  assert.deepEqual(stack, [], name + ': unclosed elements');
  assert.equal(roots, 1, name + ': one root element');
}
const unescapeXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const colIndex = letters => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
function sheetRows(xml) {
  return [...xml.matchAll(/<row r="(\d+)">([\s\S]*?)<\/row>/g)].map(row => {
    const cells = [];
    for (const c of row[2].matchAll(/<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      assert.equal(c[2], row[1], 'cell row matches its row');
      cells[colIndex(c[1])] = /t="inlineStr"/.test(c[3])
        ? { type: 'text', value: unescapeXml(c[4].match(/^<is><t(?: xml:space="preserve")?>([\s\S]*)<\/t><\/is>$/)[1]) }
        : { type: 'number', value: Number(c[4].match(/^<v>([^<]+)<\/v>$/)[1]) };
    }
    return cells;
  });
}
const lastCol = n => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };

// Returns the four tables read back from the workbook as arrays of row objects.
function checkWorkbook(bytes) {
  const files = unzip(bytes);
  for (const [name, text] of files) wellFormed(name, text);
  const types = files.get('[Content_Types].xml');
  for (const name of files.keys()) {
    if (!name.endsWith('.rels') && name !== '[Content_Types].xml') assert.ok(types.includes(`PartName="/${name}"`), 'content type for ' + name);
  }
  assert.match(files.get('_rels/.rels'), /officeDocument" Target="xl\/workbook.xml"/);
  const workbook = files.get('xl/workbook.xml'), workbookRels = files.get('xl/_rels/workbook.xml.rels');
  const sheets = [...workbook.matchAll(/<sheet name="([^"]+)" sheetId="(\d+)" r:id="(rId\d+)"\/>/g)];
  assert.deepEqual(sheets.map(s => s[1]), ['اقرأني', 'days', 'games', 'levels', 'hours']);
  assert.match(workbookRels, /\/styles" Target="styles.xml"/);
  const out = {};
  sheets.forEach(([, sheetName, , rid]) => {
    const target = workbookRels.match(new RegExp(`Id="${rid}" Type="[^"]+/worksheet" Target="([^"]+)"`))[1];
    const sheetFile = 'xl/' + target, sheet = files.get(sheetFile);
    assert.ok(sheet, sheetFile);
    assert.match(sheet, /<sheetView rightToLeft="1"/, sheetName + ' is right to left');
    const rows = sheetRows(sheet);
    if (sheetName === 'اقرأني') {
      assert.doesNotMatch(sheet, /<tableParts/);
      const column = rows.map(r => r[0]?.value), explained = rows.map(r => r[1]?.value);
      for (const table of Object.keys(CONTRACT)) {
        const at = column.indexOf('الجدول ' + table);
        assert.ok(at >= 0, 'read-me heading for ' + table);
        assert.deepEqual(column.slice(at + 1, at + 1 + CONTRACT[table].length), CONTRACT[table], 'read-me explains every ' + table + ' column');
        for (let i = 1; i <= CONTRACT[table].length; i++) assert.match(explained[at + i], /[؀-ۿ]/, 'Arabic explanation of ' + column[at + i]);
      }
      return;
    }
    const relsFile = sheetFile.replace('worksheets/', 'worksheets/_rels/') + '.rels';
    const tableFile = 'xl/' + files.get(relsFile).match(/\/table" Target="\.\.\/([^"]+)"/)[1];
    const table = files.get(tableFile), columns = CONTRACT[sheetName];
    assert.match(sheet, /<tableParts count="1"><tablePart r:id="rId1"\/><\/tableParts><\/worksheet>$/);
    assert.match(table, new RegExp(`name="${sheetName}" displayName="${sheetName}" ref="A1:${lastCol(columns.length - 1)}${Math.max(rows.length, 2)}"`));
    assert.deepEqual([...table.matchAll(/<tableColumn id="(\d+)" name="([^"]+)"\/>/g)].map(m => m[2]), columns, sheetName + ' table columns');
    assert.deepEqual(rows[0].map(c => c.type + ':' + c.value), columns.map(c => 'text:' + c), sheetName + ' header row');
    out[sheetName] = rows.slice(1).map(cells => Object.fromEntries(columns.map((column, i) => {
      assert.equal(cells[i].type, TEXT.has(column) ? 'text' : 'number', `${sheetName}.${column} cell type`);
      return [column, cells[i].value];
    })));
  });
  return out;
}

/* ============================================================ node checks */
test('exports use exactly the contract columns', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(api.COLUMNS)), CONTRACT);
  assert.equal(api.FORMAT, 'sg-play-stats');
});

test('stored day records are checked field by field; foreign or broken values are ignored', () => {
  const store = fakeStorage(seed());
  const { days, meta } = api.readStore(store);
  assert.deepEqual(days.map(d => d.d), ['2026-06-01', '2026-09-20', '2026-10-02', '2026-10-06', '2026-10-08']);
  const today = days[4];
  assert.deepEqual(Object.keys(today.g).sort(), ['candy-rope', 'rail-rush'], 'a slug outside the format is dropped');
  assert.deepEqual(Object.keys(today.g['candy-rope'].lv).sort(), ['L3', 'L4'], "ids like '1-4' or with three digits are dropped");
  // '2p' appears among the contract's examples but fails its id rule (a letter first), as at the portal.
  assert.deepEqual(Object.keys(days[1].g['tic-tac-toe'].lv), ['duo']);
  assert.deepEqual(today.g['rail-rush'].hh, { 10: 300000 }, 'hours outside 0-23 are dropped');
  assert.deepEqual(today.g['rail-rush'].src, { featured: 2 }, 'unknown launch sources are dropped');
  assert.equal(today.g['rail-rush'].ns, 0, 'negative numbers count as 0');
  assert.deepEqual([meta.id, meta.label, meta.off, meta.since], ['pcabcd', 'جهاز 7', false, '2026-06-01']);
  for (const [date, text] of [['2026-10-08', 'null'], ['2026-10-08', '[]'], ['2026-10-08', day('2026-10-07', {})],
    ['2026-13-01', day('2026-13-01', {})], ['2026-10-08', JSON.stringify({ v: '1', d: '2026-10-08', g: {} })]]) {
    assert.equal(api.parseDay(date, text), null, text);
  }
  const odd = api.parseDay('2026-10-08', day('2026-10-08', { 'tic-tac-toe': { e: Infinity, o: '3', b: 'x', lv: { L1: 'x', L2: [1, -1, 1e99] }, fav: 'yes' } }));
  assert.deepEqual(odd.g['tic-tac-toe'], { o: 0, e: 0, hh: {}, b: [0, 0, 0, 0], ns: 0, src: {}, l: [0, 0, 0], ls: 0, x: 0, t: 0,
    f: [0, 0, 0, 0], tu: [0, 0], fav: 0, lv: { L2: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } });
  assert.deepEqual(api.parseMeta('{"pc":{"id":"PC-1","label":"=x"},"off":"yes","pruned":"2026-02-30"}'), {
    raw: { pc: { id: 'PC-1', label: '=x' }, off: 'yes', pruned: '2026-02-30' },
    id: '', label: 'x', off: false, offSince: 0, clearedAt: 0, since: '', lastExport: 0, pruned: '' });
  assert.equal(api.parseMeta('{"pruned":"2026-07-14"}').pruned, '2026-07-14');
});

test('PC labels: at most 16 characters, no leading = + - @, no control characters', () => {
  assert.equal(api.cleanLabel('=SUM(A1)'), 'SUM(A1)');
  assert.equal(api.cleanLabel(' +-@ جهاز 7'), 'جهاز 7');
  assert.equal(api.cleanLabel('جهاز\u0000\u0007‮ 7\n'), 'جهاز 7');
  assert.equal(api.cleanLabel('مختبر الحاسوب الكبير رقم 12'), 'مختبر الحاسوب ال');
  assert.equal([...api.cleanLabel('😀'.repeat(20))].length, 16, 'never splits a character');
  assert.equal(api.cleanLabel(42), '');
});

test('tables: one row per day, game, level and game-hour, with additive numbers', () => {
  const { days } = api.readStore(fakeStorage(seed()));
  const t = api.tables(days, info);
  assert.deepEqual(Object.keys(t), ['days', 'games', 'levels', 'hours']);
  for (const table of Object.keys(CONTRACT)) for (const r of t[table]) assert.deepEqual(Object.keys(r), CONTRACT[table]);
  assert.deepEqual(t.days.map(r => [r.date, r.seconds, r.sessions, r.short_sessions, r.calm_on, r.day_complete]), [
    ['2026-06-01', 120, 1, 0, 0, 1], ['2026-09-20', 900, 3, 0, 0, 1], ['2026-10-02', 0, 0, 0, 2, 1],
    ['2026-10-06', 600, 1, 0, 0, 1], ['2026-10-08', 1560, 4, 2, 1, 0]]);
  const candy = t.games.find(r => r.date === '2026-10-08' && r.game === 'candy-rope');
  assert.deepEqual(candy, exportRow('games', { pc: 'pcabcd', pc_label: 'جهاز 7', copy: 'web', date: '2026-10-08', game: 'candy-rope',
    game_name: names['candy-rope'], opens: 4, sessions: 3, short_sessions: 1, sessions_1_5: 1, sessions_5_15: 2, never_started: 1,
    seconds: 1260, hearted: 1, rounds: 7, wins: 2, losses: 3, quits: 2, tutorial_shown: 1, tutorial_done: 1, loads: 4,
    load_ms_sum: 5230, load_ms_max: 2100, errors: 1, frames_smooth: 8120, frames_ok: 960, frames_choppy: 44, frames_stall: 2,
    from_recent: 2, from_category: 1, from_direct: 1, day_complete: 0, exported_at: EXPORTED_AT }));
  assert.deepEqual(t.levels.map(r => [r.date, r.game, r.level, r.visits, r.gave_up, r.seconds]), [
    ['2026-09-20', 'tic-tac-toe', 'duo', 1, 0, 800], ['2026-10-06', 'candy-rope', 'L3', 2, 2, 40],
    ['2026-10-08', 'candy-rope', 'L3', 6, 4, 96], ['2026-10-08', 'candy-rope', 'L4', 2, 1, 30], ['2026-10-08', 'rail-rush', 'endless', 6, 0, 250]]);
  const endless = t.levels.at(-1);
  assert.deepEqual([endless.ends, endless.score_sum, endless.score_count, endless.score_max], [6, 6000, 6, 1800]);
  // Every seeded game and hour was played on fewer than 3 days: no hours row is exported.
  assert.deepEqual(t.hours, []);
  const json = api.exportJson(t, info);
  assert.deepEqual(Object.keys(json), ['format', 'v', 'pc', 'exported_at', 'tables']);
  assert.deepEqual(json.pc, { id: 'pcabcd', label: 'جهاز 7', copy: 'web' });
});

test('hours rows are exported only for a game and hour played on at least 3 days, but not on all its days', () => {
  const rec = (d, hh) => api.parseDay(d, day(d, { 'candy-rope': { o: 1, e: 1, hh, b: [1, 0, 0, 0] } }));
  const days = [rec('2026-10-05', { 9: 60000, 10: 60000 }), rec('2026-10-06', { 9: 30000 }), rec('2026-10-07', { 9: 90000, 10: 1000 }),
    rec('2026-10-08', { 11: 20000 })];
  assert.deepEqual(api.tables(days, info).hours.map(r => [r.game, r.hour, r.seconds, r.days]), [['candy-rope', 9, 180, 3]],
    'hour 10, played on 2 days, and hour 11, on 1 day, are left out');
  assert.deepEqual(api.tables(days.slice(1), info).hours, [], 'a short export has no hours rows at all');
  // A weekly lesson: every day the game was played includes 9:00, so each date's hour could be read back.
  const lesson = days.slice(0, 3);
  assert.deepEqual(api.tables(lesson, info).hours, [], 'hour 9 on all 3 days of the game is left out');
  // A day the game was only opened, with no play time, does not make the hour any less telling.
  const opened = api.parseDay('2026-10-08', day('2026-10-08', { 'candy-rope': { o: 1, e: 0, ns: 1 } }));
  assert.deepEqual(api.tables([...lesson, opened], info).hours, []);
  // The page's own hours chart still uses every local day.
  assert.deepEqual(api.hoursFromDays(days, '', '').slice(9, 12), [180, 61, 20]);
});

test('durations: under a minute is never «دقيقة واحدة»', () => {
  assert.deepEqual([0, 1, 30, 59.9, 60, 89, 150, 3720, 7200].map(api.duration),
    ['0', 'أقل من دقيقة', 'أقل من دقيقة', 'أقل من دقيقة', 'دقيقة واحدة', 'دقيقة واحدة', '3 دقائق', 'ساعة واحدة ودقيقتان', 'ساعتان']);
});

test('periods, summaries and where children stop', () => {
  assert.deepEqual(api.periodRange('week', '2026-10-08'), { from: '2026-10-04', to: '2026-10-08' });
  assert.deepEqual(api.periodRange('week', '2026-10-04'), { from: '2026-10-04', to: '2026-10-04' });
  assert.deepEqual(api.periodRange('month', '2026-10-08'), { from: '2026-09-09', to: '2026-10-08' });
  assert.deepEqual(api.periodRange('all', '2026-10-08'), { from: '', to: '' });
  const { days } = api.readStore(fakeStorage(seed()));
  const t = api.tables(days, info);
  const week = api.summary(t, '2026-10-04', '2026-10-08');
  assert.deepEqual([week.seconds, week.sessions, week.short, week.calm], [2160, 5, 2, 1]);
  assert.deepEqual(week.games.map(g => [g.game, g.seconds, g.sessions, g.short, g.days, g.hearted]),
    [['candy-rope', 1860, 4, 1, 2, 1], ['rail-rush', 300, 1, 1, 1, 0]]);
  const candy = week.games[0];
  assert.deepEqual(candy.levels.map(l => [l.level, l.winnable]), [['L3', true], ['L4', true]]);
  assert.deepEqual(api.stuck(candy.levels).map(l => [l.level, l.gaveUp, l.visits]), [['L3', 6, 8]], 'L4 has under 5 visits');
  // L3: 1 win, 5 losses and 2 quits are 8 tries.
  assert.deepEqual(api.levelResult(candy.levels[0]), { win: 1 / 8, wins: 1, tries: 8 });
  assert.equal(api.levelResult(candy.levels[1]), null, 'under 5 tries');
  assert.equal(week.games[1].levels[0].winnable, false);
  assert.deepEqual(api.levelResult(week.games[1].levels[0]), { avg: 1000, best: 1800 });
  assert.deepEqual(api.stuck(week.games[1].levels), [], 'an endless run is never a place children stop');
  const many = api.markWinnable(['A', 'B', 'C', 'D'].map((level, i) => ({ level, visits: 10, gaveUp: i + 1, wins: 1, losses: 1, draws: 0, ends: 0, quits: 0 })));
  assert.deepEqual(api.stuck(many).map(l => l.level), ['D', 'C', 'B'], 'three highest give-up shares within one game');
  // The folded '_other' row is not one level.
  assert.deepEqual(api.stuck(api.markWinnable([{ level: '_other', visits: 9, gaveUp: 9, wins: 2, losses: 5, draws: 0, ends: 0, quits: 2 }])), []);
  assert.equal(api.levelResult({ level: 'local', wins: 0, losses: 0, draws: 7, ends: 0, quits: 0, scoreCount: 0 }), null, 'draws alone show no win share');
  assert.equal(api.verdict(candy.f, candy.loads, candy.loadSum), 'smooth');
  assert.equal(api.verdict([500, 50, 0, 0], 0, 0), '', 'under 600 counted frames');
  assert.equal(api.verdict([500, 300, 150, 0], 1, 1000), 'slow');
  assert.equal(api.verdict([500, 300, 10, 0], 1, 1000), 'ok');
  const hours = api.hoursFromDays(days, '2026-10-04', '2026-10-08');
  assert.deepEqual(hours.map(Math.round).slice(8, 13), [0, 840, 720, 600, 0]);
  assert.equal(api.oldestUnexported(days, 0), '2026-06-01');
  assert.equal(api.oldestUnexported(days, new Date(2026, 9, 6, 12).getTime()), '2026-10-06');
});

// A level counts when children can win or lose it: it was won or lost and never
// ended without a winner, or it was only left and its id has the shape of such a
// level of the same game (digits aside).
test('where they stop: winnable levels only, with quits counted as tries', () => {
  const L = (level, o) => ({ level, starts: 0, visits: 0, gaveUp: 0, wins: 0, losses: 0, draws: 0, ends: 0, quits: 0, seconds: 0,
    scoreSum: 0, scoreCount: 0, scoreMax: 0, ...o });
  const flags = levels => api.markWinnable(levels).map(l => [l.level, l.winnable]);
  // troll-level: a death respawns inside the level, so every level is won or left.
  const troll = api.markWinnable([L('L1', { starts: 5, visits: 5, wins: 5 }), L('L2', { starts: 5, visits: 5, quits: 5, gaveUp: 5 })]);
  assert.deepEqual(troll.map(l => l.winnable), [true, true]);
  assert.deepEqual(api.stuck(troll).map(l => [l.level, l.gaveUp, l.visits]), [['L2', 5, 5]], 'the level everyone abandons is shown');
  assert.deepEqual([api.levelResult(troll[0]), api.levelResult(troll[1])], [{ win: 1, wins: 5, tries: 5 }, { win: 0, wins: 0, tries: 5 }]);
  // moto-madness ids are 'w#-#': a stage only left counts beside a won one.
  assert.deepEqual(flags([L('w1-1', { wins: 3 }), L('w1-3', { quits: 5 }), L('w2-1', { quits: 1 })]),
    [['w1-1', true], ['w1-3', true], ['w2-1', true]]);
  // merge-2048 reports a board only as a neutral end when it fills up; the goal tile is not a win. One 3x3
  // board reached 256 and was left, five 4x4 boards were left, another filled up: no board counts.
  const merge = api.markWinnable([L('s3', { starts: 9, visits: 9, ends: 4, quits: 5, gaveUp: 5, scoreSum: 4000, scoreCount: 4, scoreMax: 1800 }),
    L('s4', { starts: 5, visits: 5, quits: 5, gaveUp: 5 })]);
  assert.deepEqual(merge.map(l => l.winnable), [false, false]);
  assert.deepEqual(api.stuck(merge), []);
  assert.deepEqual(api.levelResult(merge[0]), { avg: 1000, best: 1800 }, 'a board shows its average and best score');
  assert.deepEqual(flags([L('s3', { quits: 1 }), L('s4', { quits: 5 })]), [['s3', false], ['s4', false]], 'boards only left');
  // block-burst: a saved classic run is continued and reports 'end' only at game over, so a day of
  // classic visits that were all left is not giving up, even beside a won level.
  const burst = api.markWinnable([L('L1', { starts: 1, visits: 1, wins: 1 }),
    L('classic', { starts: 5, visits: 5, quits: 5, gaveUp: 5, seconds: 10134 })]);
  assert.deepEqual(burst.map(l => l.winnable), [true, false]);
  assert.deepEqual(api.stuck(burst), []);
  // maze-dash and swing-hook: an endless run only left beside won levels; swing-hook's abandoned level still counts.
  assert.deepEqual(flags([L('L1', { wins: 2 }), L('L2', { quits: 6 }), L('endless', { starts: 6, visits: 6, quits: 6, gaveUp: 6 })]),
    [['L1', true], ['L2', true], ['endless', false]]);
  assert.deepEqual(flags([L('L3', { losses: 2 }), L('endless', { quits: 5 }), L('main', { quits: 5 }), L('run', { quits: 5 })]),
    [['L3', true], ['endless', false], ['main', false], ['run', false]]);
  // fire-and-ice: co-op levels are 'L#:duo' (the default mode) and never count; a solo level only left does.
  const fire = api.markWinnable([L('L1:solo', { starts: 2, visits: 2, wins: 2 }), L('L4:duo', { starts: 5, visits: 5, quits: 5, gaveUp: 5 }),
    L('L4:solo', { starts: 5, visits: 5, quits: 5, gaveUp: 5 }), L('L2:duo', { ends: 3 })]);
  assert.deepEqual(fire.map(l => [l.level, l.winnable]), [['L1:solo', true], ['L4:duo', false], ['L4:solo', true], ['L2:duo', false]]);
  assert.deepEqual(api.stuck(fire).map(l => l.level), ['L4:solo']);
  // Free play and endless runs: games with nothing to win, whether rounds ended or were left.
  assert.deepEqual(flags([L('main', { starts: 6, visits: 6, ends: 1, quits: 5, gaveUp: 5 })]), [['main', false]]);
  assert.deepEqual(flags([L('endless', { starts: 7, visits: 7, quits: 7, gaveUp: 7 })]), [['endless', false]]);
  // Two-player modes never count, even when only left beside matches against the computer.
  assert.deepEqual(flags([L('local', { starts: 6, visits: 6, quits: 6, gaveUp: 6 }), L('cpu-easy', { starts: 6, visits: 6, wins: 3, losses: 2, draws: 1 }),
    L('duo', { quits: 5 }), L('pvp', { wins: 2 }), L('m1:local', { wins: 1 }), L('m1:pvp', { losses: 1 }), L('duos', { wins: 1 })]),
    [['local', false], ['cpu-easy', true], ['duo', false], ['pvp', false], ['m1:local', false], ['m1:pvp', false], ['duos', true]]);
  // A level that was only left counts in a game with won or lost levels, unless it ever ended neutrally or in a draw.
  assert.deepEqual(flags([L('L1', { wins: 2 }), L('L2', { quits: 3 }), L('L3', { quits: 3, ends: 1 }), L('L4', { quits: 3, draws: 1 }),
    L('L5', { losses: 1, draws: 4 })]), [['L1', true], ['L2', true], ['L3', false], ['L4', false], ['L5', true]]);
  assert.deepEqual(api.levelResult(L('L5', { winnable: true, wins: 1, losses: 1, draws: 2, quits: 1 })), { win: 0.2, wins: 1, tries: 5 },
    'tries are wins, losses, draws and quits');
});

test('combined days count distinct dates; averages leave out sessions still open', () => {
  const { days } = api.readStore(fakeStorage(seed()));
  const local = { pc: { id: 'pcabcd', label: 'جهاز 7', copy: 'web' }, exported_at: EXPORTED_AT, tables: api.tables(days, info), local: true };
  // Another PC played candy-rope on 6 and 8 October too.
  const other = api.readImport(JSON.stringify(otherPcFile('جهاز 9', '2026-10-08T10:00:00+03:00', ['2026-10-06', '2026-10-08'],
    [['2026-10-06', 'candy-rope', 600, 1], ['2026-10-08', 'candy-rope', 600, 1]], [])), names);
  const week = api.summary(api.combine([local, other]).tables, '2026-10-04', '2026-10-08');
  const candy = week.games.find(g => g.game === 'candy-rope');
  assert.deepEqual([candy.days, candy.pcs, week.pcs], [2, 2, 2], 'two dates on two PCs are two play days');
  // Today a game is open on this PC: 3 minutes of play, no closed session yet.
  const live = { pc: 'pcabcd', date: '2026-10-08' };
  const open = api.parseDay('2026-10-08', day('2026-10-08', {
    'connect-four': { o: 1, e: 180000, hh: { 10: 180000 }, b: [0, 0, 0, 0] },
    'candy-rope': { o: 2, e: 240000, hh: { 9: 240000 }, b: [0, 2, 0, 0] }
  }));
  const s = api.summary(api.tables([open], info), '2026-10-08', '2026-10-08', live);
  assert.deepEqual(s.games.map(g => [g.game, g.open]), [['candy-rope', false], ['connect-four', true]]);
  assert.deepEqual([s.seconds, s.closedSeconds, s.sessions], [420, 240, 2], 'the average is 240 s over 2 sessions, not 420 s');
  // Time and no session on a past day (a load timeout, then Retry and a long play), or in another
  // PC's file, will never close: no «still open» there.
  const failed = api.parseDay('2026-10-06', day('2026-10-06', { 'troll-level': { o: 1, e: 600000, hh: { 9: 600000 }, b: [0, 0, 0, 0], t: 1 } }));
  const past = api.summary(api.tables([failed, open], info), '2026-10-04', '2026-10-08', live);
  assert.deepEqual(past.games.map(g => [g.game, g.open]), [['candy-rope', false], ['troll-level', false], ['connect-four', true]]);
  const elsewhere = api.readImport(JSON.stringify(otherPcFile('جهاز 9', '2026-10-08T10:00:00+03:00', ['2026-10-08'],
    [['2026-10-08', 'tic-tac-toe', 300, 0]], [])), names);
  const both = api.summary(api.combine([{ pc: { id: 'pcabcd', label: 'جهاز 7', copy: 'web' }, exported_at: EXPORTED_AT,
    tables: api.tables([open], info), local: true }, elsewhere]).tables, '2026-10-08', '2026-10-08', live);
  assert.deepEqual(both.games.map(g => [g.game, g.open]), [['candy-rope', false], ['tic-tac-toe', false], ['connect-four', true]]);
  assert.equal(api.summary(api.tables([open], info), '2026-10-08', '2026-10-08', null).games.some(g => g.open), false,
    'without this PC\'s own records, nothing is open');
});

test('the export reminder: days removed for space, a nearly full PC, or an old day not exported', () => {
  const days = ['2026-06-01', '2026-10-01', '2026-10-08'].map(d => ({ d, s: {}, g: {} }));
  const meta = o => ({ lastExport: 0, pruned: '', ...o });
  const at = (m, d) => new Date(2026, m - 1, d, 12).getTime();
  const recent = days.slice(1);
  assert.equal(api.reminder(recent, meta({ lastExport: at(10, 2) }), 1000, '2026-10-08'), null);
  // (c) The oldest day not exported is more than 100 days old.
  assert.deepEqual(api.reminder(days, meta(), 1000, '2026-10-08'), { pruned: '', used: 0, oldest: '2026-06-01', age: 129 });
  // (b) The portal removed a day for space that the last export did not cover completely.
  assert.equal(api.reminder(recent, meta({ pruned: '2026-07-14' }), 1000, '2026-10-08').pruned, '2026-07-14', 'never exported');
  assert.equal(api.reminder(recent, meta({ pruned: '2026-10-02', lastExport: at(10, 2) }), 1000, '2026-10-08').pruned, '2026-10-02');
  assert.equal(api.reminder(recent, meta({ pruned: '2026-10-01', lastExport: at(10, 2) }), 1000, '2026-10-08'), null, 'exported before it went');
  // (a) Over 75 % of the 300 KB cap, unless an export in the last 7 days already holds the oldest days.
  assert.equal(api.reminder(recent, meta(), 230400, '2026-10-08'), null, 'exactly 75 %');
  assert.equal(api.reminder(recent, meta(), 245760, '2026-10-08').used, 0.8);
  assert.equal(api.reminder(recent, meta({ lastExport: at(10, 2) }), 245760, '2026-10-08'), null, 'exported 6 days ago');
  assert.equal(api.reminder(recent, meta({ lastExport: at(10, 1) }), 245760, '2026-10-08').used, 0.8, 'exported 7 days ago');
  // readStore counts every stats key as the portal does, and nothing else.
  const record = day('2026-10-08', {});
  const store = fakeStorage({ 'sg:site:stats:d:2026-10-08': record, 'sg:site:statsmeta': '{}', 'sg:site:stats:live': '{}', other: 'x'.repeat(99) });
  assert.equal(api.readStore(store).bytes, 'sg:site:stats:d:2026-10-08'.length + record.length + 'sg:site:statsmeta{}'.length + 'sg:site:stats:live{}'.length);
});

test('combining keeps only the newest export of each PC and day, and of each PC\'s hours', () => {
  const { days } = api.readStore(fakeStorage(seed()));
  const local = { pc: { id: 'pcabcd', label: 'جهاز 7', copy: 'web' }, exported_at: EXPORTED_AT, tables: api.tables(days, info), local: true };
  const files = [newerFile, olderFile].map(file => api.readImport(JSON.stringify(file), names));
  const { tables, pcs } = api.combine([local, ...files]);
  const other = tables.games.filter(r => r.pc === 'pcwxyz').map(r => [r.date, r.game, r.seconds]);
  assert.deepEqual(other.sort(), [['2026-10-04', 'candy-rope', 600], ['2026-10-05', 'candy-rope', 1800], ['2026-10-06', 'tic-tac-toe', 300]]);
  assert.deepEqual(tables.hours.filter(r => r.pc === 'pcwxyz').map(r => [r.game, r.hour, r.seconds]), [['candy-rope', 9, 2400], ['tic-tac-toe', 13, 300]]);
  assert.equal(tables.games.filter(r => r.pc === 'pcabcd').length, 5);
  assert.deepEqual(pcs.map(p => [p.pc, p.first, p.last, p.days, p.conflict]),
    [['pcabcd', '2026-06-01', '2026-10-08', 5, false], ['pcwxyz', '2026-10-04', '2026-10-06', 3, true]]);
  assert.deepEqual(pcs[1].labels.sort(), ['جهاز 9', 'جهاز 9ب']);
  // The same file opened twice is still counted once.
  const twice = api.combine([files[1], files[1]]);
  assert.equal(twice.tables.games.length, 2);
});

test('opened files must be sg-play-stats v1 exports; broken rows are skipped', () => {
  for (const text of ['', '{', '[]', '{"hello":1}', JSON.stringify({ ...olderFile, v: 2 }), JSON.stringify({ ...olderFile, format: 'other' }),
    JSON.stringify({ ...olderFile, pc: { id: 'nope' } }), JSON.stringify({ ...olderFile, exported_at: 'yesterday' })]) {
    assert.equal(api.readImport(text, names), null, text.slice(0, 40));
  }
  const messy = structuredClone(olderFile);
  messy.tables.games.push({ ...messy.tables.games[0], date: '2026-02-31' }, { ...messy.tables.games[0], game: '../x' }, 'row');
  messy.tables.games[0].seconds = -5;
  messy.tables.games[0].pc_label = '=HYPERLINK("x")';
  messy.tables.levels.push(exportRow('levels', { pc: 'pcwxyz', date: '2026-10-04', game: 'candy-rope', level: '123' }));
  const file = api.readImport(JSON.stringify(messy), names);
  assert.equal(file.tables.games.length, 2);
  assert.equal(file.tables.games[0].seconds, 0);
  assert.equal(file.tables.games[0].pc_label, 'HYPERLINK("x")');
  assert.equal(file.tables.levels.length, 0);
  assert.deepEqual(Object.keys(file.tables.games[0]), CONTRACT.games);
});

test('the workbook is a stored ZIP of well-formed parts: RTL sheets, an Arabic read-me and one Excel table per data sheet', () => {
  const { days } = api.readStore(fakeStorage(seed()));
  const t = api.tables(days, info);
  const back = checkWorkbook(api.xlsx(t, info, new Date(2026, 9, 8, 10, 30)));
  for (const table of Object.keys(CONTRACT)) assert.deepEqual(back[table], t[table], table + ' rows survive the round trip');
  const empty = checkWorkbook(api.xlsx(api.tables([], info), info, new Date(2026, 9, 8, 10, 30)));
  for (const table of Object.keys(CONTRACT)) assert.deepEqual(empty[table], [], 'an empty ' + table + ' table keeps a valid range');
  const readme = unescapeXml(unzip(api.xlsx(t, info)).get('xl/worksheets/sheet1.xml'));
  for (const text of ['عندما تمتلئ مساحة الإحصاءات أو بعد 120 يومًا، أيهما أسبق', 'شهرين أو ثلاثة', 'في 3 أيام أو أكثر',
    'احذف الصفوف التي يكون فيها pc فارغًا', 'لا ترسم حركة مستمرة: connect-four، tic-tac-toe، typing-test.',
    'تبدأ من الصفر في متصفح آخر', 'في جدول hours استخدم أحدث ملف لكل جهاز']) {
    assert.ok(readme.includes(text), 'the read-me says: ' + text);
  }
  // Text that looks like XML or a formula stays plain text.
  const tricky = { ...info, label: '<b>&"x"' };
  const trickyRead = checkWorkbook(api.xlsx(api.tables(days, tricky), tricky));
  assert.equal(trickyRead.days[0].pc_label, '<b>&"x"');
  assert.equal(api.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

/* ========================================================= browser checks */
let browser, server, origin;
before(async () => {
  server = await startTestServer(root);
  origin = server.origin;
});
after(async () => { await browser?.close(); await server?.close(); });

const OWN_FILES = /^\/(?:teacher\.html|favicon\.(?:svg|ico)|js\/(?:catalog|teacher)\.js|css\/teacher\.css|shared\/fonts\/[\w.-]+\.woff2)$/;
// Edge and Chrome save exports through their save dialog (showSaveFilePicker), which
// headless Chromium closes at once. A stand-in dialog answers as window.pickerAnswer
// says ('save', 'cancel', 'refuse', 'fail', or 'hold' to stay open until
// window.closePicker() is called), saves under window.pickerName when one is set (the
// teacher renamed the file), refuses a second dialog while one is open, as Chrome
// does, and keeps each saved file in window.savedFiles.
async function teacherPage(t, { blocked = false, entries = seed() } = {}) {
  if (!browser) browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block', timezoneId: 'Asia/Riyadh', acceptDownloads: true });
  t.after(() => context.close());
  await context.addInitScript(() => {
    let open = false;
    window.pickerAnswer = 'save';
    window.pickerCalls = 0;
    window.savedFiles = [];
    window.showSaveFilePicker = async options => {
      window.pickerCalls++;
      if (open) throw new DOMException('File picker already active.', 'NotAllowedError');
      open = true;
      if (window.pickerAnswer === 'hold') await new Promise(resolve => { window.closePicker = resolve; });
      open = false;
      const answer = window.pickerAnswer, name = window.pickerName || options.suggestedName;
      window.pickerOptions = options;
      if (answer === 'cancel') throw new DOMException('The user aborted a request.', 'AbortError');
      if (answer === 'refuse') throw new DOMException('Must be handling a user gesture to show a file picker.', 'SecurityError');
      return { name, createWritable: async () => {
        if (answer === 'fail') throw new DOMException('The file is open in another program.', 'NoModificationAllowedError');
        const parts = [];
        return { write: async data => { parts.push(data); }, close: async () => {
          window.savedFiles.push({ name, bytes: [...new Uint8Array(await new Blob(parts).arrayBuffer())] });
        } };
      } };
    };
  });
  if (blocked) {
    await context.addInitScript(() => {
      for (const method of ['getItem', 'setItem', 'removeItem']) {
        Object.defineProperty(Storage.prototype, method, { value() { throw new DOMException('Storage disabled by test', 'SecurityError'); } });
      }
    });
  }
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', error => problems.push('page error: ' + error.message));
  page.on('console', message => { if (message.type() === 'error') problems.push('console error: ' + message.text()); });
  page.on('request', request => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && (url.origin !== origin || !OWN_FILES.test(url.pathname))) problems.push('request: ' + request.url());
  });
  t.after(() => assert.deepEqual(problems, [], 'no page errors, console errors or requests beyond the page\'s own files'));
  await page.clock.setFixedTime(NOW);
  await page.goto(origin + '/teacher.html');
  if (!blocked) {
    await page.evaluate(entries => { for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value); }, entries);
    await page.reload();
  }
  await page.waitForFunction(() => document.getElementById('source')?.dataset.copy === 'web');
  return page;
}
const storage = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
const statsMeta = async page => JSON.parse((await storage(page))['sg:site:statsmeta']);
const exportStatus = (page, pattern) => page.waitForFunction(source => new RegExp(source).test(document.getElementById('exportStatus').textContent),
  pattern.source).then(() => page.locator('#exportStatus').textContent());
// Presses an export button and returns the file the stand-in save dialog kept.
async function saveFile(page, button) {
  const count = await page.evaluate(() => window.savedFiles.length);
  await page.locator(button).click();
  await page.waitForFunction(n => window.savedFiles.length > n, count);
  await exportStatus(page, /^حُفظ الملف /);
  const file = await page.evaluate(() => window.savedFiles.at(-1));
  return { name: file.name, bytes: Buffer.from(file.bytes) };
}
const gameRow = (page, slug) => page.locator(`#gameTable tr[data-game="${slug}"]`);
const rowNumbers = (page, slug) => gameRow(page, slug).evaluate(row => ['seconds', 'sessions', 'short', 'days'].map(name => Number(row.dataset[name])));

test('seeded records show the right numbers, and the period choice changes them', async t => {
  const page = await teacherPage(t);
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  assert.equal(await page.locator('.note').textContent(), 'الأرقام لكل جهاز وليست لكل طالب، ولا تُرسل إلى أي مكان.');
  assert.equal(await page.locator('input[name="period"]:checked').getAttribute('value'), 'week');
  assert.deepEqual(await page.locator('#gameTable tbody tr').evaluateAll(rows => rows.map(r => r.dataset.game)), ['candy-rope', 'rail-rush']);
  assert.deepEqual(await rowNumbers(page, 'candy-rope'), [1860, 4, 1, 2]);
  assert.deepEqual(await rowNumbers(page, 'rail-rush'), [300, 1, 1, 1]);
  assert.equal(await gameRow(page, 'candy-rope').locator('td').first().textContent(), '31 دقيقة');
  assert.equal(await gameRow(page, 'candy-rope').locator('.heart').textContent(), '❤');
  assert.equal(await gameRow(page, 'rail-rush').locator('.heart').textContent(), '');
  assert.equal(await page.locator('#gameTable thead th').count(), 6, 'at most six columns');
  assert.equal(await page.locator('#cardTime .big').getAttribute('data-seconds'), '2160');
  assert.match(await page.locator('#cardTime').textContent(), /36 دقيقة.*متوسط مرة اللعب: 5 دقائق.*مرات اللعب: 5 · خرجوا بسرعة: 2/s);
  assert.match(await page.locator('#cardTop li').first().textContent(), /4 مرات · 31 دقيقة/);
  assert.deepEqual(await page.locator('#cardHours .hour').evaluateAll(bars => bars.map(b => b.dataset.hour)), ['9', '10', '11']);
  assert.match(await page.locator('#cardStuck li').textContent(), /المرحلة أو الوضع L3 — توقفوا عندها 6 من 8 زيارات/);
  assert.deepEqual(await page.locator('#stuck li').evaluateAll(items => items.map(i => [i.dataset.level, i.dataset.gaveUp, i.dataset.visits])), [['L3', '6', '8']]);
  assert.match(await page.locator('#stuck li').textContent(), /^المرحلة أو الوضع L3: .*فازوا في 1 من 8 محاولات$/);
  assert.equal(await page.locator('#lv-candy-rope tr[data-level="L3"] td').nth(2).textContent(), '6');
  // The game name opens that game's levels.
  await gameRow(page, 'rail-rush').locator('a').click();
  assert.equal(await page.locator('#lv-rail-rush').getAttribute('open'), '');
  assert.match(await page.locator('#lv-rail-rush tr[data-level="endless"]').textContent(), /متوسط النتيجة 1,000 · أفضل نتيجة 1,800/);
  // Leaving an endless run is not giving up: no figure in that column.
  assert.deepEqual(await page.locator('#lv-rail-rush tr[data-level="endless"] td').allTextContents(), ['6', '6', '—', 'متوسط النتيجة 1,000 · أفضل نتيجة 1,800', '4 دقائق']);
  assert.equal(await page.locator('#lv-rail-rush thead th').first().textContent(), 'المرحلة أو الوضع');
  // Device status, launch sources, settings and the first-time tutorial.
  await page.locator('#deviceSection summary').click();
  assert.equal(await page.locator('#device tr[data-game="candy-rope"]').getAttribute('data-verdict'), 'smooth');
  assert.equal(await page.locator('#device tr[data-game="rail-rush"] td').first().textContent(), '—');
  assert.equal(await page.locator('#unmeasured').count(), 0, 'both games count frames');
  await page.locator('#hardware dl').waitFor();
  assert.match(await page.locator('#hardware').textContent(), /أنوية المعالج.*الشاشة.*شريحة الرسوم/s);
  assert.deepEqual(await page.locator('#sources li').evaluateAll(items => items.map(i => i.dataset.key).sort()), ['category', 'direct', 'featured', 'recent']);
  assert.deepEqual(await page.locator('#settings li .num').allTextContents(), ['1', '3', '2']);
  assert.deepEqual(await page.locator('#tutorials tr[data-game="candy-rope"] td').allTextContents(), ['1', '1']);
  // Source and reminder: the oldest day (1 June) has never been exported.
  assert.match(await page.locator('#source').textContent(), /نسخة الموقع على الإنترنت.*البيانات منذ 1\/6\/2026 · الأيام المحفوظة: 5.*اسم الجهاز: جهاز 7 · المعرّف: pcabcd/s);
  assert.match(await page.locator('#reminder').textContent(), /قبل 129 يومًا.*عندما تمتلئ مساحة الإحصاءات أو بعد 120 يومًا، أيهما أسبق.*شهرين أو ثلاثة/);

  for (const [period, numbers, total] of [['today', [1260, 3, 1, 1], 1560], ['month', [1860, 4, 1, 2], 3060], ['all', [1860, 4, 1, 2], 3180]]) {
    await page.locator(`input[name="period"][value="${period}"]`).check();
    assert.deepEqual(await rowNumbers(page, 'candy-rope'), numbers, period);
    assert.equal(await page.locator('#cardTime .big').getAttribute('data-seconds'), String(total), period);
  }
  assert.deepEqual(await page.locator('#gameTable tbody tr').evaluateAll(rows => rows.map(r => r.dataset.game)), ['candy-rope', 'tic-tac-toe', 'rail-rush', 'merge-2048']);
  assert.deepEqual(await page.locator('#settings li .num').allTextContents(), ['3', '3', '2']);
});

test('exports save every stored day with the right names and the contract format; a closed save dialog counts nothing', async t => {
  const page = await teacherPage(t);
  // This PC's hardware is shown on the page but never exported.
  await page.locator('#deviceSection summary').click();
  const hardware = await page.locator('#hardware dd').last().textContent();
  // A file that cannot be written or a closed save dialog: nothing saved, no export counted, the reminder stays.
  for (const [answer, text] of [['fail', /^تعذّر حفظ الملف \u2066play-stats_pcabcd_2026-10-08\.xlsx\u2069 في المكان المختار، فلم يُسجَّل التصدير\./],
    ['cancel', /^لم يُحفظ الملف: أُغلقت نافذة الحفظ أو لم تظهر، فلم يُسجَّل التصدير\.$/]]) {
    await page.evaluate(answer => { window.pickerAnswer = answer; }, answer);
    await page.locator('#exportXlsx').click();
    await exportStatus(page, text);
    assert.equal(await page.locator('#exportStatus').getAttribute('class'), 'status bad', answer);
    assert.deepEqual(await statsMeta(page), META, answer + ': no export recorded');
    assert.equal(await page.locator('#reminder').isVisible(), true, answer);
    assert.equal(await page.locator('#exportAsk').isHidden(), true, answer + ': the dialog said what happened, so no question');
    assert.equal(await page.locator('#exportDownload').isVisible(), answer === 'cancel', answer + ': a plain download is offered after a closed dialog');
  }
  assert.deepEqual(await page.evaluate(() => window.savedFiles), []);
  // A dialog blocked by a school policy ends exactly like a cancel. The offered
  // download needs no dialog and counts only after «نعم».
  const calls = await page.evaluate(() => window.pickerCalls);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportDownload').click()]);
  assert.equal(download.suggestedFilename(), 'play-stats_pcabcd_2026-10-08.xlsx');
  assert.equal(await page.evaluate(() => window.pickerCalls), calls, 'no second dialog');
  assert.equal(await page.locator('#exportStatus').textContent(), 'بدأ تنزيل الملف \u2066play-stats_pcabcd_2026-10-08.xlsx\u2069 (5 أيام).');
  assert.deepEqual([await page.locator('#exportDownload').isHidden(), await page.locator('#exportAsk').isVisible()], [true, true]);
  assert.deepEqual(await statsMeta(page), META, 'not counted before the teacher answers');
  await page.locator('#exportNo').click();
  assert.deepEqual(await statsMeta(page), META);
  // The teacher may rename the file in the dialog: the status names the saved file.
  await page.evaluate(() => { window.pickerAnswer = 'save'; window.pickerName = 'week 41.xlsx'; });
  const workbook = await saveFile(page, '#exportXlsx');
  assert.equal(workbook.name, 'week 41.xlsx');
  assert.deepEqual(await page.evaluate(() => window.pickerOptions), { suggestedName: 'play-stats_pcabcd_2026-10-08.xlsx', id: 'play-stats',
    types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] });
  assert.equal(await page.locator('#exportStatus').textContent(), 'حُفظ الملف \u2066week 41.xlsx\u2069 (5 أيام).',
    'the chosen name, isolated left to right');
  const workbookBytes = workbook.bytes;
  const tablesFromXlsx = checkWorkbook(workbookBytes);
  // More clicks while the dialog is still open do nothing: Chrome would refuse a
  // second dialog, and that error must not start a download behind the open one.
  await page.evaluate(() => { window.pickerAnswer = 'hold'; window.pickerName = ''; window.closePicker = null; });
  const held = await page.evaluate(() => window.pickerCalls);
  await page.locator('#exportJson').click();
  await page.waitForFunction(() => window.closePicker);
  for (const button of ['#exportJson', '#exportXlsx']) await page.locator(button).click();
  assert.equal(await page.evaluate(() => window.pickerCalls), held + 1, 'one dialog');
  assert.equal(await page.locator('#exportAsk').isHidden(), true, 'no download started');
  await page.evaluate(() => { window.pickerAnswer = 'save'; window.closePicker(); });
  await exportStatus(page, /^حُفظ الملف \u2066play-stats_pcabcd_2026-10-08\.json\u2069 /);
  const json = await page.evaluate(() => window.savedFiles.at(-1)).then(file => ({ name: file.name, bytes: Buffer.from(file.bytes) }));
  assert.equal(json.name, 'play-stats_pcabcd_2026-10-08.json');
  assert.deepEqual((await page.evaluate(() => window.pickerOptions)).types, [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]);
  const exported = JSON.parse(json.bytes.toString('utf8'));
  assert.deepEqual(Object.keys(exported), ['format', 'v', 'pc', 'exported_at', 'tables']);
  assert.deepEqual([exported.format, exported.v, exported.exported_at], ['sg-play-stats', 1, EXPORTED_AT]);
  assert.deepEqual(exported.pc, { id: 'pcabcd', label: 'جهاز 7', copy: 'web' });
  assert.deepEqual(Object.keys(exported.tables), ['days', 'games', 'levels', 'hours']);
  for (const table of Object.keys(CONTRACT)) {
    for (const row of exported.tables[table]) assert.deepEqual(Object.keys(row), CONTRACT[table], table + ' columns');
    assert.deepEqual(tablesFromXlsx[table], exported.tables[table], table + ': the workbook and the JSON hold the same rows');
  }
  // All stored days, not just the week on screen; today is not complete yet.
  assert.deepEqual(exported.tables.days.map(r => [r.date, r.day_complete]),
    [['2026-06-01', 1], ['2026-09-20', 1], ['2026-10-02', 1], ['2026-10-06', 1], ['2026-10-08', 0]]);
  assert.deepEqual(exported.tables.games.map(r => r.game), ['merge-2048', 'tic-tac-toe', 'candy-rope', 'candy-rope', 'rail-rush']);
  assert.equal(exported.tables.games.find(r => r.game === 'tic-tac-toe').game_name, names['tic-tac-toe']);
  // Each seeded game and hour was played on fewer than 3 days: left out of the files, still on the page.
  assert.deepEqual(exported.tables.hours, []);
  assert.ok(await page.locator('#cardHours .hour').count() > 0);
  assert.ok(hardware.length > 3);
  for (const text of [JSON.stringify(exported), workbookBytes.toString('utf8')]) {
    assert.equal(text.includes(hardware), false, 'the graphics chip is never exported');
  }
  // The saved export is remembered (the reminder goes away); the PC's id and settings stay.
  assert.deepEqual(await statsMeta(page), { ...META, lastExport: NOW.getTime() });
  assert.equal(await page.locator('#reminder').isHidden(), true);
  assert.match(await page.locator('#lastExport').textContent(), /آخر تصدير: 8\/10\/2026/);
});

// Other browsers and plain http (not a secure context) have no save dialog, and the
// browser may refuse it with an error other than a cancel: the file is downloaded and
// counts only when the teacher confirms it was saved.
test('without a save dialog, an export counts only after the teacher confirms the file was saved', async t => {
  // A PC without an id yet: the first export makes one, and keeps it even before it counts.
  const page = await teacherPage(t, { entries: { ...seed(), 'sg:site:statsmeta': '{}' } });
  await page.evaluate(() => { window.pickerAnswer = 'refuse'; });
  const [first] = await Promise.all([page.waitForEvent('download'), page.locator('#exportJson').click()]);
  const id = first.suggestedFilename().match(/^play-stats_(pc[a-z]{4})_2026-10-08\.json$/)?.[1];
  assert.ok(id, first.suggestedFilename());
  assert.equal(JSON.parse(read(await first.path())).pc.id, id);
  assert.equal(await page.locator('#exportStatus').textContent(), `بدأ تنزيل الملف \u2066play-stats_${id}_2026-10-08.json\u2069 (5 أيام).`);
  assert.equal(await page.locator('#exportAsk').isVisible(), true);
  assert.deepEqual(await statsMeta(page), { pc: { id } }, 'not counted before the teacher answers');
  await page.locator('#exportNo').click();
  assert.equal(await page.locator('#exportAsk').isHidden(), true);
  assert.match(await page.locator('#exportStatus').textContent(), /^لم يُسجَّل التصدير\./);
  assert.deepEqual(await statsMeta(page), { pc: { id } });
  assert.equal(await page.locator('#reminder').isVisible(), true);
  // No dialog at all: the same question, and «نعم» counts the export made at that moment.
  await page.evaluate(() => { delete window.showSaveFilePicker; });
  const [second] = await Promise.all([page.waitForEvent('download'), page.locator('#exportXlsx').click()]);
  assert.equal(second.suggestedFilename(), `play-stats_${id}_2026-10-08.xlsx`);
  assert.deepEqual(await statsMeta(page), { pc: { id } });
  await page.locator('#exportYes').click();
  assert.deepEqual(await statsMeta(page), { pc: { id }, lastExport: NOW.getTime() });
  assert.equal(await page.locator('#exportStatus').textContent(), `سُجّل تصدير الملف \u2066play-stats_${id}_2026-10-08.xlsx\u2069 (5 أيام).`);
  assert.equal(await page.locator('#exportAsk').isHidden(), true);
  assert.equal(await page.locator('#reminder').isHidden(), true);
  assert.match(await page.locator('#lastExport').textContent(), /آخر تصدير: 8\/10\/2026/);
});

test('files from other PCs are viewed together: the newest export per PC and day, nothing saved', async t => {
  const page = await teacherPage(t);
  const before = await storage(page);
  await page.locator('#files').setInputFiles([
    { name: 'play-stats_pcwxyz_2026-10-05.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(olderFile)) },
    { name: 'play-stats_pcwxyz_2026-10-07.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newerFile)) },
    { name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') }
  ]);
  await page.locator('#combined tr[data-pc="pcwxyz"]').waitFor();
  // 1860 s here, plus 600 s on 4 October and the newer 1800 s (not 1200 + 1800) on 5 October.
  assert.deepEqual(await rowNumbers(page, 'candy-rope'), [4260, 8, 1, 4]);
  assert.deepEqual(await rowNumbers(page, 'tic-tac-toe'), [300, 1, 0, 1]);
  assert.equal(await gameRow(page, 'candy-rope').locator('td').nth(3).textContent(), '4على جهازين');
  assert.equal(await gameRow(page, 'tic-tac-toe').locator('td').nth(3).textContent(), '1على جهاز واحد');
  assert.match(await page.locator('#combined tr[data-pc="pcabcd"]').textContent(), /جهاز 7.*هذا الجهاز.*1\/6\/2026.*8\/10\/2026/s);
  const other = page.locator('#combined tr[data-pc="pcwxyz"]');
  assert.match(await other.textContent(), /4\/10\/2026.*6\/10\/2026/s);
  assert.equal(await other.getAttribute('class'), 'conflict');
  assert.match(await other.textContent(), /المعرّف نفسه بأسماء مختلفة/);
  assert.match(await page.locator('#ignoredFiles').textContent(), /notes\.json/);
  assert.deepEqual(await storage(page), before, 'opening files saves nothing');
  await page.locator('#backLocal').click();
  assert.equal(await page.locator('#combined').isHidden(), true);
  assert.deepEqual(await rowNumbers(page, 'candy-rope'), [1860, 4, 1, 2]);
});

test('clearing needs the typed word and removes only sg:site:stats: keys; stop and resume set the settings', async t => {
  const page = await teacherPage(t, { entries: { ...seed(), 'sg:site:statsmeta': JSON.stringify({ ...META, pruned: '2026-05-30' }) } });
  // Name this PC: the label rules apply.
  await page.locator('#pcLabel').fill('=+مختبر الحاسوب الكبير رقم 12');
  const label = api.cleanLabel(await page.locator('#pcLabel').inputValue());
  assert.match(label, /^مختبر/);
  await page.locator('#saveLabel').click();
  assert.equal(JSON.parse((await storage(page))['sg:site:statsmeta']).pc.label, label);
  assert.match(await page.locator('#labelStatus').textContent(), /حُفظ الاسم/);

  await page.locator('#stopBtn').click();
  await page.locator('#stopWord').fill('توقف');
  await page.locator('#stopConfirm button[type="submit"]').click();
  assert.match(await page.locator('#stopStatus').textContent(), /الكلمة غير صحيحة/);
  assert.equal(JSON.parse((await storage(page))['sg:site:statsmeta']).off, false);
  await page.locator('#stopWord').fill('اوقف');
  await page.locator('#stopConfirm button[type="submit"]').click();
  let meta = JSON.parse((await storage(page))['sg:site:statsmeta']);
  assert.deepEqual([meta.off, meta.offSince], [true, NOW.getTime()]);
  assert.equal(await page.locator('#stoppedMsg').isVisible(), true);
  await page.locator('#resumeBtn').click();
  meta = JSON.parse((await storage(page))['sg:site:statsmeta']);
  assert.deepEqual([meta.off, Object.hasOwn(meta, 'offSince')], [false, false]);
  assert.equal(await page.locator('#stoppedMsg').isHidden(), true);
  // Stop again, then clear: the stop setting, id and label survive the clear.
  await page.locator('#stopBtn').click();
  await page.locator('#stopWord').fill('أوقف');
  await page.locator('#stopWord').press('Enter');
  await page.waitForFunction(() => !document.getElementById('stoppedMsg').hidden);

  const before = await storage(page);
  await page.locator('#clearBtn').click();
  assert.match(await page.locator('#clearText').textContent(), /5 أيام/);
  await page.locator('#clearWord').fill('امسخ');
  await page.locator('#clearConfirm button[type="submit"]').click();
  assert.deepEqual(await storage(page), before, 'a wrong word changes nothing');
  await page.locator('#clearWord').fill(' «امسح» ');
  await page.locator('#clearConfirm button[type="submit"]').click();
  const after = await storage(page);
  assert.deepEqual(Object.keys(after), ['other-site-key', 'sg:candy-rope:save', 'sg:site:favs', 'sg:site:statsmeta']);
  for (const key of ['other-site-key', 'sg:candy-rope:save', 'sg:site:favs']) assert.equal(after[key], before[key]);
  meta = JSON.parse(after['sg:site:statsmeta']);
  assert.deepEqual(meta, { pc: { id: 'pcabcd', label }, off: true, custom: 'kept', offSince: NOW.getTime(), clearedAt: NOW.getTime() });
  assert.match(await page.locator('#clearStatus').textContent(), /مُسحت/);
  assert.equal(await page.locator('#gameTable tbody tr').count(), 0);
  assert.match(await page.locator('#source').textContent(), /لا توجد بيانات بعد/);
});

test('a game still open and days removed for space are explained, not hidden', async t => {
  // Opened from 🏫 while connect-four is still open: 3 minutes of play, no closed session yet.
  // The portal removed 2 October for space; the last export was on 1 October.
  // On 6 October neon-slope had a load timeout, then Retry and 10 minutes of play: no length, never open.
  // On 5 October block-burst's saved classic run and fire-and-ice's co-op L4 were left 5 times each.
  const entries = {
    'sg:site:stats:d:2026-10-08': day('2026-10-08', { 'connect-four': { o: 1, e: 180000, hh: { 10: 180000 }, b: [0, 0, 0, 0] } }),
    'sg:site:stats:d:2026-10-06': day('2026-10-06', { 'neon-slope': { o: 1, e: 600000, hh: { 9: 600000 }, b: [0, 0, 0, 0], t: 1 } }),
    'sg:site:stats:d:2026-10-05': day('2026-10-05', { 'troll-level': { o: 5, e: 400000, hh: { 9: 400000 }, b: [0, 5, 0, 0],
      lv: { L1: [5, 5, 0, 0, 0, 0, 200000, 15, 3, 5, 5, 0], L2: [5, 0, 0, 0, 0, 5, 150000, 0, 0, 0, 5, 5] } },
    'block-burst': { o: 5, e: 300000, hh: { 9: 300000 }, b: [0, 5, 0, 0],
      lv: { L1: [1, 1, 0, 0, 0, 0, 30000, 500, 500, 1, 1, 0], classic: [5, 0, 0, 0, 0, 5, 10134, 0, 0, 0, 5, 5] } },
    'fire-and-ice': { o: 6, e: 360000, hh: { 10: 360000 }, b: [0, 6, 0, 0],
      lv: { 'L1:solo': [1, 1, 0, 0, 0, 0, 40000, 3, 3, 1, 1, 0], 'L4:duo': [5, 0, 0, 0, 0, 5, 200000, 0, 0, 0, 5, 5] } } }),
    'sg:site:statsmeta': JSON.stringify({ pc: { id: 'pcabcd' }, lastExport: new Date('2026-10-01T12:00:00+03:00').getTime(), pruned: '2026-10-02' })
  };
  const page = await teacherPage(t, { entries });
  await page.locator('input[name="period"][value="today"]').check();
  assert.equal(await page.locator('#cardTop').textContent(), 'مرة لعب ما زالت مفتوحة، وتظهر هنا بعد إغلاق اللعبة.');
  assert.match(await page.locator('#cardTime').textContent(), /^3 دقائق.*متوسط مرة اللعب: —.*مرات اللعب: 0 · خرجوا بسرعة: 0.*ما زالت مفتوحة/s);
  assert.equal(await gameRow(page, 'connect-four').locator('td').nth(1).textContent(), '0ما زالت مفتوحة');
  // A board game draws no steady frames: its device status says so instead of «—».
  const device = page.locator('#device tr[data-game="connect-four"]');
  assert.deepEqual([await device.getAttribute('data-verdict'), await device.locator('td').first().textContent()], ['unmeasured', 'لا تُقاس']);
  assert.match(await page.locator('#unmeasured').textContent(), /^«لا تُقاس»: «أربعة على التوالي» لا ترسم حركة مستمرة أثناء اللعب، فلا تُقاس فيها سرعة الرسم\./);
  assert.match(await page.locator('#reminder').textContent(),
    /^تذكير: امتلأت مساحة الإحصاءات على هذا الجهاز، فحُذفت أيام قديمة لم تُصدَّر، آخرها 2\/10\/2026\. صدّر ملف Excel الآن\. .*أيهما أسبق/);
  // The week: troll-level's L2, which all five children left, is where they stop; block-burst's
  // classic run and fire-and-ice's co-op level are not, though both games won a level.
  await page.locator('input[name="period"][value="week"]').check();
  assert.deepEqual(await page.locator('#cardStuck li').evaluateAll(items => items.map(li => li.dataset.game + ' ' + li.dataset.level)),
    ['troll-level L2']);
  assert.match(await page.locator('#cardStuck').textContent(), /المرحلة أو الوضع L2 — توقفوا عندها 5 من 5 زيارات/);
  assert.deepEqual(await page.locator('#stuck .stuck').evaluateAll(divs => divs.map(d => d.dataset.game)), ['troll-level']);
  assert.deepEqual(await page.locator('#levels tr[data-winnable="0"]').evaluateAll(rows => rows.map(r => r.dataset.level)),
    ['L4:duo', 'classic'], 'their gave-up cells show «—»');
  assert.equal(await gameRow(page, 'neon-slope').locator('.open-note').count(), 0, 'a past session that failed is not open');
  assert.equal(await gameRow(page, 'connect-four').locator('.open-note').count(), 1);
  assert.match(await page.locator('#stuck li[data-level="L2"]').textContent(), /فازوا في 0 من 5 محاولات/);
  assert.match(await page.locator('#lv-troll-level tr[data-level="L1"]').textContent(), /فازوا في 5 من 5 محاولات/);
  assert.match(await page.locator('#cardTop').textContent(), /5 مرات.*مرة لعب ما زالت مفتوحة/s);
  assert.match(await page.locator('#cardTime').textContent(), /متوسط مرة اللعب: دقيقة واحدة/, '400 s over 5 closed sessions');
  // A saved export covers the removed day's successors: the reminder goes away.
  await saveFile(page, '#exportJson');
  assert.equal(await page.locator('#reminder').isHidden(), true);
  // A nearly full PC (over 75 % of 300 KB) not exported for a week is reminded too.
  await page.evaluate(() => {
    localStorage.setItem('sg:site:stats:d:2026-09-30', JSON.stringify({ v: 1, d: '2026-09-30', s: {}, g: {}, pad: 'x'.repeat(240000) }));
    const meta = JSON.parse(localStorage.getItem('sg:site:statsmeta'));
    localStorage.setItem('sg:site:statsmeta', JSON.stringify({ ...meta, pruned: undefined, lastExport: meta.lastExport - 8 * 864e5 }));
  });
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('reminder').hidden);
  const used = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sg:site:stats'))
    .reduce((n, k) => n + k.length + localStorage.getItem(k).length, 0) / 307200);
  assert.ok(used > 0.75 && used < 0.85, String(used));
  assert.match(await page.locator('#reminder').textContent(),
    new RegExp('^تذكير: مساحة الإحصاءات على هذا الجهاز ممتلئة بنسبة ' + Math.round(used * 100) + '%\\. صدّر ملف Excel الآن\\. '));
});

test('blocked storage is explained; other PCs\' files still open', async t => {
  const page = await teacherPage(t, { blocked: true });
  assert.equal(await page.locator('#storageMsg').isVisible(), true);
  for (const id of ['exportXlsx', 'exportJson', 'saveLabel', 'stopBtn', 'clearBtn']) assert.equal(await page.locator('#' + id).isDisabled(), true, id);
  assert.match(await page.locator('#gameTable').textContent(), /لا يوجد لعب/);
  await page.locator('#files').setInputFiles([{ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newerFile)) }]);
  await page.locator('#combined tr[data-pc="pcwxyz"]').waitFor();
  assert.deepEqual(await rowNumbers(page, 'candy-rope'), [1800, 3, 0, 1]);
});
