// Teacher statistics page (teacher.html, docs/PLAY_STATS.md sections 3 and 4).
// Node checks run the page's pure functions without a browser (in the built page,
// the inlined scripts), including unpacking the .xlsx byte by byte. Browser checks
// use seeded day records and a fixed clock: numbers, periods, exports, combining
// other PCs' files, clear, stop, blocked storage, the dashboard codes and "the same
// child as on another PC", the delivery panel and its connection test, requests and
// console errors.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
// site: the published address the build gives the page (SG_SITE_URL), or none.
function loadPage(site) {
  const sandbox = vm.createContext({ window: site ? { SG_SITE: { url: site } } : {}, TextEncoder });
  const scripts = process.env.SG_ROOT
    ? [...read(path.join(root, 'teacher.html')).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1])
    : ['js/catalog.js', 'js/telemetry.js', 'js/teacher.js'].map(file => read(path.join(repo, file)));
  assert.equal(scripts.length, 3, 'the teacher page runs the catalog, the telemetry sink in check mode and its own script');
  // The sink needs a page; the teacher page's pure functions do not. The address a build
  // put before the page's script gives way to the one asked for here.
  for (const script of [scripts[0], scripts[2].replace(/^window\.SG_SITE=\{url:"[^"]*"\};\n/, '')]) vm.runInContext(script, sandbox);
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
// Dashboard codes (js/telemetry.js): this PC's, and those of two of the portal's players.
const PC_CODE = '8c21d0e94a6f', P1 = '3f9a0c51e2b7', P13 = 'a1b2c3d4e5f6';
const RID_TEXT = JSON.stringify({ v: 1, pc: PC_CODE, k: { p1: P1, p13: P13 }, l: {} });
// The check character as the spec defines it (Luhn mod 16), written out here on purpose:
// from the rightmost hex digit the factors are 2, 1, 2, …; each product adds floor(p / 16)
// and p % 16; the check is (16 - sum % 16) % 16.
function luhn16(hex) {
  let sum = 0;
  [...hex].reverse().forEach((c, i) => { const p = (i % 2 ? 1 : 2) * parseInt(c, 16); sum += Math.floor(p / 16) + p % 16; });
  return ((16 - sum % 16) % 16).toString(16);
}
// A code as another PC's teacher page shows it: 3F9A-0C51-E2B7-5.
const shown = hex => (hex + luhn16(hex)).toUpperCase().match(/.{1,4}/g).join('-');
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
test('the delivery panel says in plain words why this PC sends nothing, or how its batches arrive; the test button says what it found', () => {
  const now = NOW.getTime(), H = 36e5, D = 864e5, host = 'ingest.test';
  const text = html => html.replace(/<[^>]+>/g, '');
  const ltr = html => [...html.matchAll(/<bdi dir="ltr">([^<]*)<\/bdi>/g)].map(match => match[1]);
  // The PC's clock, D/M/YYYY HH:MM (the browser checks below pin the zone).
  const two = n => String(n).padStart(2, '0');
  const hm = ms => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`; };
  const status = extra => ({ why: '', host, ok: 0, f: 0, k: '', at: 0, x: 0, n: 0, t: 0, o: 0, ...extra });
  const raw = (v = {}, extra = {}) => api.delivery({ copy: 'web', off: false, tm: false, share: host, st: status(extra), ...v }, now);
  const panel = (v, extra) => { const d = raw(v, extra); return { ...d, state: text(d.state), problem: text(d.problem), facts: d.facts.map(([a, b]) => [a, text(b)]) }; };
  // Kept, but at most 128 KB and 7 days: the teacher must not think there is a week to ask IT.
  const KEEPS = 'ما لم يصل يبقى محفوظًا على هذا الجهاز ويُرسل وحده عندما يعود الاتصال، لكن مكانه محدود: بعد بضع ساعات من اللعب، أو بعد 7 أيام، يُحذف الأقدم أولًا.';

  // Nothing is sent, and why: no facts and no test button.
  for (const [v, extra, why, state, problem = ''] of [
    // A build without SG_SITE_URL (the source tree, a local build) knows no address.
    [{ copy: 'folder' }, {}, 'folder', 'هذه نسخة منزَّلة من الموقع (مجلد على هذا الجهاز)، ولا ترسل أبدًا شيئًا إلى لوحة المؤشرات في المدرسة.',
      'لكي يصل لعب الأطفال إلى لوحة المؤشرات، يجب أن تفتح الأجهزة موقع ألعاب المدرسة على الإنترنت بدلًا من هذا المجلد.'],
    [{ off: true }, {}, 'off', 'لا يُرسل هذا الجهاز شيئًا إلى لوحة المؤشرات ما دام جمع الإحصاءات متوقفًا.'],
    [{ tm: true }, {}, 'tm', 'المشاركة مع لوحة المؤشرات متوقفة في إعدادات هذا الجهاز، فلا يُرسل شيء.'],
    [{}, { why: 'gpc' }, 'gpc', 'يطلب هذا المتصفح من المواقع ألّا تشارك بياناته (Global Privacy Control)، فلا يرسل هذا الجهاز شيئًا إلى لوحة المؤشرات.'],
    [{}, { why: 'local' }, 'local', 'هذه النسخة تعمل من هذا الحاسوب نفسه، فلا ترسل شيئًا إلى لوحة المؤشرات.'],
    [{ share: '' }, { why: 'none' }, 'none', 'لم يرسل هذا الجهاز إحصاءات إلى لوحة المؤشرات حتى الآن.',
      'يبدأ الإرسال عندما تُفتح صفحة الألعاب على هذا الجهاز، إذا كانت نسخة الموقع مربوطة بخادم للإحصاءات.'],
    [{ share: '', st: null }, {}, 'none', 'لم يرسل هذا الجهاز إحصاءات إلى لوحة المؤشرات حتى الآن.',
      'يبدأ الإرسال عندما تُفتح صفحة الألعاب على هذا الجهاز، إذا كانت نسخة الموقع مربوطة بخادم للإحصاءات.'],
    // The sharing note of a build before the delivery record: the portal's next load writes it.
    [{}, { why: 'none' }, 'none', 'لا توجد بعد معلومات عن وصول إحصاءات هذا الجهاز.', 'افتح صفحة الألعاب على هذا الجهاز مرة واحدة، ثم عد إلى هذه الصفحة.']
  ]) {
    const d = panel(v, extra);
    assert.deepEqual([d.why, d.state, d.problem, d.facts, d.test], [why, state, problem, [], false], why);
  }
  assert.deepEqual(ltr(raw({ copy: 'folder' }).problem), [], 'no address');
  // The build of a published copy names where it is published, left to right.
  const published = loadPage('https://name.github.io/school-games/').api.delivery({ copy: 'folder', off: false, tm: false, share: '', st: null }, now);
  assert.equal(text(published.problem), 'لكي يصل لعب الأطفال إلى لوحة المؤشرات، يجب أن تفتح الأجهزة الموقع على الإنترنت: https://name.github.io/school-games/');
  assert.deepEqual(ltr(published.problem), ['https://name.github.io/school-games/'], 'the address reads left to right');
  assert.equal(raw({ off: true }, { ok: now, f: now, k: 'network' }).why, 'off', 'stopped wins over any record');

  // Sharing, nothing delivered yet and nothing waiting.
  assert.deepEqual(panel(), { why: '', tone: 'wait', state: 'لم تصل إحصاءات من هذا الجهاز إلى لوحة المؤشرات بعد.',
    facts: [['آخر وصول إلى لوحة المؤشرات', 'لم يصل شيء من هذا الجهاز بعد'], ['ينتظر الإرسال', 'لا شيء']],
    problem: 'اضغط «اختبر الاتصال الآن» لتعرف إن كان هذا الجهاز يصل إلى خادم الإحصاءات.', test: true });
  // Delivered 5 minutes ago; one batch has waited for a minute.
  assert.deepEqual(panel({}, { ok: now - 3e5, n: 1, t: now - 6e4, o: now - 6e4 }), { why: '', tone: 'ok', state: '✓ تصل إحصاءات هذا الجهاز إلى لوحة المؤشرات.',
    facts: [['آخر وصول إلى لوحة المؤشرات', 'قبل 5 دقائق (' + hm(now - 3e5) + ')'], ['ينتظر الإرسال', 'دفعة واحدة، أقدمها من قبل دقيقة']],
    problem: '', test: true });
  // A network that holds requests open never answers, so nothing may be noted yet: batches
  // that no closing page sent, waiting longer than 15 minutes since the last delivery, are
  // not green (the hang of the review: delivered 3 days ago, 21 batches since 20 minutes).
  assert.deepEqual(panel({}, { ok: now - 3 * D, n: 21, t: now - 12e5, o: now - 12e5 }), { why: '', tone: 'wait',
    state: 'لم يتأكد وصول إحصاءات هذا الجهاز إلى لوحة المؤشرات منذ 20 دقيقة.',
    facts: [['آخر وصول إلى لوحة المؤشرات', 'قبل 3 أيام (' + hm(now - 3 * D) + ')'], ['ينتظر الإرسال', '21 دفعة، أقدمها من قبل 20 دقيقة']],
    problem: 'ما ينتظر يُرسل عندما تكون صفحة الألعاب مفتوحة على هذا الجهاز. اضغط «اختبر الاتصال الآن» لترسله الآن، ولتعرف إن كان هذا الجهاز يصل إلى خادم الإحصاءات.',
    test: true });
  for (const [extra, label] of [[{ ok: now - 3 * D, n: 2, t: now - 9e5 + 1e3, o: now - 9e5 + 1e3 }, 'under 15 minutes'],
    [{ ok: now - 6e5, n: 2, t: now - 3 * D, o: now - 3 * D }, 'a delivery since it was queued']]) {
    assert.equal(panel({}, extra).tone, 'ok', label);
  }
  // What the portal sent as it closed waits for the next page to see its answer: still green.
  const closed = panel({}, { ok: now - 3 * H, n: 1, t: now - 3 * H + 3e4, o: 0 });
  assert.deepEqual([closed.tone, closed.facts[1][1]], ['ok', 'دفعة واحدة، أقدمها من قبل ساعتين (أُرسل ما ينتظر عند إغلاق صفحة الألعاب، ويتأكد وصوله عند فتحها من جديد)']);
  // Unsent play dropped for room or age in the last 7 days is said, with when.
  assert.deepEqual(panel({}, { ok: now - H, x: now - 2 * H }).facts[2], ['حُذف قبل أن يصل',
    'لعب قبل ساعتين (' + hm(now - 2 * H) + ')، لأن مكان الانتظار على هذا الجهاز امتلأ أو مضت عليه 7 أيام']);
  assert.equal(panel({}, { ok: now - H, x: now - 8 * D }).facts.length, 2, 'not after 7 days');
  // Blocked since the day before yesterday (the school filter of 28 October): red, since
  // when, the host it blocks and the address to ask IT for.
  const blocked = raw({}, { ok: now - 3 * D, f: now - 2 * D - H, k: 'network', at: now - 6e4, n: 12, t: now - 2 * D, o: now - 2 * D });
  assert.deepEqual(panel({}, { ok: now - 3 * D, f: now - 2 * D - H, k: 'network', at: now - 6e4, n: 12, t: now - 2 * D, o: now - 2 * D }), { why: '', tone: 'bad',
    state: '⚠ لا تصل إحصاءات هذا الجهاز إلى لوحة المؤشرات منذ يومين.',
    facts: [['آخر وصول إلى لوحة المؤشرات', 'قبل 3 أيام (' + hm(now - 3 * D) + ')'], ['ينتظر الإرسال', '12 دفعة، أقدمها من قبل يومين']],
    problem: 'تعذّر الوصول إلى خادم الإحصاءات منذ ' + hm(now - 2 * D - H) + '. السبب في الغالب أن مرشّح الإنترنت في المدرسة يحجب ingest.test. ' +
      'اطلب من مسؤول تقنية المعلومات في المدرسة السماح بالعنوان https://ingest.test. ' + KEEPS, test: true });
  assert.deepEqual(ltr(blocked.problem), [hm(now - 2 * D - H), 'ingest.test', 'https://ingest.test']);
  // The server's own error, and its refusal (those batches are gone).
  assert.deepEqual(panel({}, { f: now - 2 * H, k: 'server', at: now - 6e4, n: 2, t: now - 2 * H, o: now - 2 * H }).problem,
    'يردّ خادم الإحصاءات ingest.test بخطأ منذ ' + hm(now - 2 * H) + '. ' + KEEPS + ' إذا استمر ذلك، أخبر من يدير خادم الإحصاءات.');
  assert.equal(panel({}, { f: now - 2 * H, k: 'server', at: now - 6e4 }).state, '⚠ لا تصل إحصاءات هذا الجهاز إلى لوحة المؤشرات منذ ساعتين.');
  // No connection at all (the cable out, the Wi-Fi down): since when, and that the play
  // waits; neither the school's filter nor IT is named.
  const offline = panel({}, { ok: now - 3 * D, f: now - 2 * H, k: 'offline', at: now - 6e4, n: 4, t: now - 2 * H, o: now - 2 * H });
  assert.deepEqual([offline.tone, offline.state, offline.problem], ['bad', '⚠ لا تصل إحصاءات هذا الجهاز إلى لوحة المؤشرات منذ ساعتين.',
    'لم يكن هذا الجهاز متصلًا بالإنترنت منذ ' + hm(now - 2 * H) + '. ' + KEEPS]);
  const refused = panel({}, { ok: now - H, f: now - 3e5, k: 'refused', at: now - 3e5 });
  assert.deepEqual([refused.tone, refused.state, refused.problem], ['bad', '⚠ رفض خادم الإحصاءات بيانات من هذا الجهاز قبل 5 دقائق.',
    'رفض الخادم ingest.test بيانات أُرسلت من هذا الجهاز في ' + hm(now - 3e5) + '، فحُذفت. إذا تكرر ذلك، أخبر من يدير خادم الإحصاءات.']);
  // The words after «قبل» and «منذ»; a time ahead of the PC's clock reads «أقل من دقيقة».
  for (const [ago, words] of [[3e4, 'أقل من دقيقة'], [6e4, 'دقيقة'], [12e4, 'دقيقتين'], [3e5, '5 دقائق'], [9e5, '15 دقيقة'], [H, 'ساعة'],
    [2 * H, 'ساعتين'], [5 * H, '5 ساعات'], [D, '24 ساعة'], [47 * H, '47 ساعة'], [2 * D, 'يومين'], [3 * D, '3 أيام'], [11 * D, '11 يومًا'], [-H, 'أقل من دقيقة']]) {
    assert.equal(panel({}, { ok: now - ago }).facts[0][1], 'قبل ' + words + ' (' + hm(now - ago) + ')', words);
  }
  // A host is text, never markup.
  assert.ok(!raw({}, { host: '<b>x</b>', f: now - H, k: 'network', at: now }).problem.includes('<b>'));

  // What the test button reports.
  const IT = '✗ تعذّر الوصول إلى خادم الإحصاءات من هذا الجهاز. أعطِ مسؤول تقنية المعلومات في المدرسة هذا العنوان ليسمح به في مرشّح الإنترنت: https://ingest.test';
  for (const [result, ok, said] of [
    [{ k: 'ok', host, sent: 0, n: 0 }, true, '✓ يصل هذا الجهاز إلى خادم الإحصاءات ingest.test. لم يكن شيء ينتظر الإرسال.'],
    [{ k: 'ok', host, sent: 2, n: 0 }, true, '✓ يصل هذا الجهاز إلى خادم الإحصاءات ingest.test. أُرسل الآن ما كان ينتظر: دفعتان.'],
    [{ k: 'ok', host, sent: 30, n: 4 }, true, '✓ يصل هذا الجهاز إلى خادم الإحصاءات ingest.test. أُرسل الآن ما كان ينتظر: 30 دفعة. ' +
      'وما زال ينتظر: 4 دفعات، ويُرسل من صفحة الألعاب.'],
    [{ k: 'network', host, sent: 0, n: 3 }, false, IT],
    [{ k: 'network', host, sent: 1, n: 3 }, false, IT + ' (أُرسل قبل انقطاع الاتصال: دفعة واحدة.)'],
    [{ k: 'network', host, reached: false, sent: 0, n: 3 }, false, IT],
    // Health answered, then the batches got no answer: the address opens, sending to it does not.
    [{ k: 'network', host, reached: true, sent: 0, n: 3 }, false, '✗ وصل هذا الجهاز إلى خادم الإحصاءات، لكن تعذّر إرسال البيانات إليه. ' +
      'قد يسمح مرشّح الإنترنت في المدرسة بفتح العنوان ويمنع إرسال البيانات إليه. أعطِ مسؤول تقنية المعلومات في المدرسة هذا العنوان ليسمح به كاملًا، مع إرسال البيانات: https://ingest.test'],
    // No connection at all: nothing was asked, and there is no address to give IT.
    [{ k: 'offline', host, reached: false, sent: 0, n: 3 }, false, '✗ هذا الجهاز غير متصل بالإنترنت الآن. ما ينتظر الإرسال يبقى محفوظًا على هذا الجهاز ويُرسل وحده عندما يعود الاتصال.'],
    [{ k: 'server', host, sent: 0, n: 3 }, false, '✗ وصل هذا الجهاز إلى خادم الإحصاءات، لكنه ردّ بخطأ مؤقت. البيانات محفوظة على هذا الجهاز؛ جرّب مرة أخرى بعد قليل.'],
    [{ k: 'refused', host, sent: 0, n: 3 }, false, '✗ وصل هذا الجهاز إلى خادم الإحصاءات، لكنه لا يقبل بيانات هذه النسخة من الموقع. أخبر من يدير خادم الإحصاءات.'],
    [{ why: 'off', host }, false, 'لا يرسل هذا الجهاز إلى لوحة المؤشرات الآن، فلا يوجد اتصال لاختباره.'],
    [{}, false, 'لا يرسل هذا الجهاز إلى لوحة المؤشرات الآن، فلا يوجد اتصال لاختباره.']
  ]) {
    const c = api.checked(result);
    assert.deepEqual([c.ok, text(c.text)], [ok, said], JSON.stringify(result));
  }
  assert.deepEqual(ltr(api.checked({ k: 'network', host, sent: 0, n: 0 }).text), ['https://ingest.test']);
  assert.deepEqual(ltr(api.checked({ k: 'network', host, reached: true, sent: 0, n: 0 }).text), ['https://ingest.test']);
});

test('dashboard codes: the Luhn mod 16 check character, how codes are shown and typed, and the transfer', () => {
  for (let i = 0; i < 500; i++) {
    const hex = [...Array(12)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    assert.equal(api.checkChar(hex), luhn16(hex), hex);
  }
  // Any one wrong character is caught.
  const full = P1 + luhn16(P1);
  for (let i = 0; i < 13; i++) {
    for (const d of '0123456789abcdef') if (d !== full[i]) assert.deepEqual(api.readCode(full.slice(0, i) + d + full.slice(i + 1)), { error: 'check' });
  }
  assert.equal(api.showCode(P1, true), shown(P1));
  assert.equal(shown(P1), '3F9A-0C51-E2B7-5');
  assert.equal(api.showCode(PC_CODE), '8C21-D0E9-4A6F');
  // Case, dashes and spaces do not matter; Arabic digits count as digits.
  for (const typed of [full, shown(P1), ' 3f9a 0c51-e2b7 5 ', '٣F9A-٠C51-E2B7-٥']) assert.deepEqual(api.readCode(typed), { code: P1 }, typed);
  for (const bad of ['', P1, full + '0', full.replace('3', 'g'), shown(P1) + 'A', 'ABCD-EFGH-IJKL-M']) {
    assert.deepEqual(api.readCode(bad), { error: 'length' }, bad);
  }

  // The player takes the other PC's code, noted in g; its own waits in l for the portal to link.
  const P2 = '0a0b0c0d0e0f', OTHER = 'b0b1b2b3b4b5', THIRD = 'c0ffee000000';
  const rid = { v: 1, pc: PC_CODE, k: { p1: P1, p2: P2 }, l: {}, g: {} }, copy = structuredClone(rid);
  const first = api.transfer(rid, 'p1', shown(OTHER));
  assert.deepEqual(first, { rid: { v: 1, pc: PC_CODE, k: { p1: OTHER, p2: P2 }, l: { p1: P1 }, g: { p1: OTHER } }, joined: true });
  assert.deepEqual(rid, copy, 'the record read is not changed in place');
  // A second transfer before the portal linked: the oldest code still waits.
  assert.deepEqual(api.transfer(first.rid, 'p1', shown(THIRD)), { rid: { v: 1, pc: PC_CODE, k: { p1: THIRD, p2: P2 }, l: { p1: P1 }, g: { p1: THIRD } }, joined: true });
  // Correcting a wrong transfer once the portal linked: the code given before is another
  // child's on the other PC, so it never waits to be joined to this one.
  const linked = { ...first.rid, l: {} };
  assert.deepEqual(api.transfer(linked, 'p1', shown(THIRD)), { rid: { v: 1, pc: PC_CODE, k: { p1: THIRD, p2: P2 }, l: {}, g: { p1: THIRD } }, joined: false });
  // A player with no code yet: nothing waits.
  assert.deepEqual(api.transfer(rid, 'p3', shown(OTHER)), { rid: { v: 1, pc: PC_CODE, k: { p1: P1, p2: P2, p3: OTHER }, l: {}, g: { p3: OTHER } }, joined: false });
  // Refused: the player's own code, another player's code on this PC, and malformed codes.
  assert.deepEqual(api.transfer(rid, 'p1', shown(P1)), { error: 'own' });
  assert.deepEqual(api.transfer(rid, 'p1', shown(P2)), { error: 'other' });
  assert.deepEqual(api.transfer(rid, 'p1', OTHER), { error: 'length' });
  assert.deepEqual(api.transfer(rid, 'p1', shown(OTHER).replace(/.$/, c => c === '0' ? '1' : '0')), { error: 'check' });

  // sg:site:rid and the portal's players are read as the portal keeps them; the rest is left out.
  const none = { v: 1, pc: '', k: {}, l: {}, g: {} };
  for (const text of [null, '{', '[]', '{"v":2,"pc":"8c21d0e94a6f"}']) assert.deepEqual(api.parseRid(text), none, String(text));
  assert.deepEqual(api.parseRid(JSON.stringify({ v: 1, pc: 'PC', k: { p1: P1, p2: 'short', x1: P1, p3: 7, pqrstuvwxyz: P1 }, l: { p1: [P1], p4: P13 },
    g: { p1: P1, p2: true, X: P13 }, more: 1 })), { v: 1, pc: '', k: { p1: P1 }, l: { p4: P13 }, g: { p1: P1 } });
  const record = (k, a, c) => ({ k, a, c, b: '8-9', xp: 0, lv: 1, d0: 20000, dl: 20000, g: {} });
  const main = { v: 1, seq: 30, list: [record('p1', 3, 1), record('p2', 99, -1), { k: 'Bad' }, record('p1', 5, 5)] };
  const more = { v: 1, list: [...Array(30)].map((_, i) => record('p' + (i + 3), i % 12, i % 8)) };
  const players = api.parsePlayers(JSON.stringify(main), JSON.stringify(more));
  assert.equal(players.length, 24, 'at most 24 players');
  assert.deepEqual(players.slice(0, 3), [{ k: 'p1', a: 3, c: 1 }, { k: 'p2', a: 0, c: 0 }, { k: 'p3', a: 0, c: 0 }]);
  assert.deepEqual(api.parsePlayers('{', null), []);
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

// A level counts when children can win or lose it: it was won or lost and never
// ended without a winner, or it was only left and its id has the shape of such a
// level of the same game (digits aside).
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
    'تبدأ من الصفر في متصفح آخر', 'في جدول hours استخدم أحدث ملف لكل جهاز',
    'الأرقام لكل جهاز وليست لكل طالب. لا يُرسل الموقع هذا الملف إلى أي مكان. وإذا ربط مسؤول المدرسة نسخة الموقع ' +
    'بخادم للإحصاءات فلا تصله إلا معلومات اللعب بلا أسماء ولا اسم للجهاز ولا أي نص كتبه الأطفال، ويظهر فيها كل طفل برمز عشوائي.']) {
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

const OWN_FILES = /^\/(?:teacher\.html|favicon\.(?:svg|ico)|js\/(?:catalog|telemetry|teacher)\.js|css\/teacher\.css|shared\/fonts\/[\w.-]+\.woff2)$/;
// Edge and Chrome save exports through their save dialog (showSaveFilePicker), which
// headless Chromium closes at once. A stand-in dialog answers as window.pickerAnswer
// says ('save', 'cancel', 'refuse', 'fail', or 'hold' to stay open until
// window.closePicker() is called), saves under window.pickerName when one is set (the
// teacher renamed the file), refuses a second dialog while one is open, as Chrome
// does, and keeps each saved file in window.savedFiles. ingest(request): the answer of
// a stand-in ingest server at https://ingest.test ({ status, contentType, body }, or
// 'abort'), which the page may then reach (from this computer, as a test allows); it
// returns nothing to leave the page without that server.
async function teacherPage(t, { blocked = false, entries = seed(), ingest = null } = {}) {
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
  if (ingest) {
    await context.addInitScript(() => Object.defineProperty(window, 'SG_TELEMETRY', { value: { allowLocal: true }, writable: false }));
    await context.route('https://ingest.test/**', async route => {
      const answer = ingest(route.request());
      if (answer === 'abort') return route.abort('failed');
      await route.fulfill({ ...answer, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'Retry-After, X-Batch-Every' } });
    });
  }
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
  // Chromium itself logs a request to the stand-in ingest server that gets no answer; the page never logs.
  page.on('console', message => {
    if (message.type() !== 'error' || ingest && /^Failed to load resource: net::ERR_FAILED$/.test(message.text()) &&
      message.location().url.startsWith('https://ingest.test/')) return;
    problems.push('console error: ' + message.text());
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (ingest && url.origin === 'https://ingest.test') return;
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
// What the export tool shows, in one round trip: a red status, the «هل حُفظ؟» question,
// the offered download and the reminder.
const exportView = page => page.evaluate(() => {
  const shown = id => document.getElementById(id).checkVisibility();
  return { bad: document.getElementById('exportStatus').classList.contains('bad'), ask: shown('exportAsk'),
    download: shown('exportDownload'), reminder: shown('reminder') };
});
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
  // Milestone 2.5: the codes make the data pseudonymous, so the note no longer says «مجهولة».
  assert.equal(await page.locator('.note').textContent(), 'الأرقام لكل جهاز وليست لكل طالب، وتبقى على هذا الجهاز. ' +
    'لا يُرسل شيء إلا إذا ربط مسؤول المدرسة نسخة الموقع بخادم للإحصاءات، وعندها يُرسل الموقع معلومات اللعب ' +
    'بلا أسماء ولا اسم للجهاز ولا أي نص كتبه الأطفال، ويظهر فيها كل طفل برمز عشوائي.');
  // Nothing on this PC says it shares (js/telemetry.js writes sg:site:tm:on while it does),
  // and it never did (no codes): no codes panel, no note about the server beside clear.
  assert.equal(await page.locator('#shareMsg').isHidden(), true);
  assert.equal(await page.locator('#codesPanel').isHidden(), true);
  assert.equal(await page.locator('#clearServer').isHidden(), true);
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
    // The dialog said what happened, so no question; a plain download is offered after a closed dialog.
    assert.deepEqual(await exportView(page), { bad: true, ask: false, download: answer === 'cancel', reminder: true }, answer);
    assert.deepEqual(await statsMeta(page), META, answer + ': no export recorded');
  }
  assert.deepEqual(await page.evaluate(() => window.savedFiles), []);
  // A dialog blocked by a school policy ends exactly like a cancel. The offered
  // download needs no dialog and counts only after «نعم».
  const calls = await page.evaluate(() => window.pickerCalls);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportDownload').click()]);
  assert.equal(download.suggestedFilename(), 'play-stats_pcabcd_2026-10-08.xlsx');
  assert.equal(await page.evaluate(() => window.pickerCalls), calls, 'no second dialog');
  assert.equal(await page.locator('#exportStatus').textContent(), 'بدأ تنزيل الملف \u2066play-stats_pcabcd_2026-10-08.xlsx\u2069 (5 أيام).');
  assert.deepEqual(await exportView(page), { bad: false, ask: true, download: false, reminder: true });
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
  await page.locator('#exportXlsx').click();
  assert.equal(await page.evaluate(() => window.pickerCalls), held + 1, 'one dialog');
  assert.equal((await exportView(page)).ask, false, 'no download started');
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

test('clearing needs the typed word and removes only sg:site:stats: and sg:site:tm: keys; stop and resume set the settings', async t => {
  // The portal's telemetry sink is sharing: its queue (and one of a build before wire
  // version 3), its note and the dashboard codes are there.
  const page = await teacherPage(t, { entries: { ...seed(), 'sg:site:statsmeta': JSON.stringify({ ...META, pruned: '2026-05-30' }),
    'sg:site:tm:q3:abc12': JSON.stringify([{ t: NOW.getTime(), e: { v: 3, b: '0123456789abcdef', ev: [] } }]),
    'sg:site:tm:q:abc12': JSON.stringify([{ t: NOW.getTime(), e: { v: 2, b: 'fedcba9876543210', ev: [] } }]), 'sg:site:tm:on': '"ingest.example.org"',
    'sg:site:tm:dx': JSON.stringify({ v: 1, u: 'https://ingest.example.org/v1/batch', ok: NOW.getTime() - 60000, f: 0, k: '', at: 0 }),
    'sg:site:rid': RID_TEXT } });
  assert.equal(await page.locator('#shareMsg').textContent(),
    'مشاركة إحصاءات اللعب مفعّلة على هذا الجهاز: تُرسل بلا أسماء، ويظهر كل طفل برمز عشوائي، إلى ingest.example.org.');
  assert.equal(await page.locator('#shareMsg bdi[dir="ltr"]').textContent(), 'ingest.example.org');
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
  assert.equal(await page.locator('#shareMsg').isHidden(), true, 'stopped statistics stop sharing too');
  await page.locator('#resumeBtn').click();
  meta = JSON.parse((await storage(page))['sg:site:statsmeta']);
  assert.deepEqual([meta.off, Object.hasOwn(meta, 'offSince')], [false, false]);
  assert.equal(await page.locator('#stoppedMsg').isHidden(), true);
  assert.equal(await page.locator('#shareMsg').isVisible(), true);
  // Sharing turned off in the settings (statsmeta.tm === false), or a damaged note: not said.
  await page.evaluate(() => {
    localStorage.setItem('sg:site:statsmeta', JSON.stringify({ ...JSON.parse(localStorage.getItem('sg:site:statsmeta')), tm: false }));
  });
  await page.reload();
  assert.equal(await page.locator('#shareMsg').isHidden(), true, 'sharing turned off');
  await page.evaluate(() => {
    const meta = JSON.parse(localStorage.getItem('sg:site:statsmeta'));
    delete meta.tm;
    localStorage.setItem('sg:site:statsmeta', JSON.stringify(meta));
    localStorage.setItem('sg:site:tm:on', '"<b>x</b>"');
  });
  await page.reload();
  assert.equal(await page.locator('#shareMsg').isHidden(), true, 'a damaged note');
  await page.evaluate(() => localStorage.setItem('sg:site:tm:on', '"ingest.example.org"'));
  await page.reload();
  assert.equal(await page.locator('#shareMsg').isVisible(), true);
  // Stop again, then clear: the stop setting, id and label survive the clear.
  await page.locator('#stopBtn').click();
  await page.locator('#stopWord').fill('أوقف');
  await page.locator('#stopWord').press('Enter');
  await page.waitForFunction(() => !document.getElementById('stoppedMsg').hidden);

  const before = await storage(page);
  // Beside clear: what was sent stays on the server, and the codes stay here.
  assert.equal(await page.locator('#clearServer').textContent(), 'ما أُرسل إلى خادم المدرسة يبقى هناك؛ لحذف بيانات طفل استخدم رمزه في لوحة المؤشرات.');
  assert.equal(await page.locator('#clearServer').isVisible(), true);
  await page.locator('#clearBtn').click();
  assert.match(await page.locator('#clearText').textContent(), /5 أيام.*يبقى اسم الجهاز ومعرّفه وإعداد الإيقاف ورموز لوحة المؤشرات\./);
  await page.locator('#clearWord').fill('امسخ');
  await page.locator('#clearConfirm button[type="submit"]').click();
  assert.deepEqual(await storage(page), before, 'a wrong word changes nothing');
  await page.locator('#clearWord').fill(' «امسح» ');
  await page.locator('#clearConfirm button[type="submit"]').click();
  const after = await storage(page);
  assert.deepEqual(Object.keys(after), ['other-site-key', 'sg:candy-rope:save', 'sg:site:favs', 'sg:site:rid', 'sg:site:statsmeta', 'sg:site:tm:dx', 'sg:site:tm:on'],
    'the telemetry queue goes; the notes that this PC shares and when its batches last arrived, and the dashboard codes, stay');
  for (const key of ['other-site-key', 'sg:candy-rope:save', 'sg:site:favs', 'sg:site:rid', 'sg:site:tm:dx']) assert.equal(after[key], before[key]);
  meta = JSON.parse(after['sg:site:statsmeta']);
  assert.deepEqual(meta, { pc: { id: 'pcabcd', label }, off: true, custom: 'kept', offSince: NOW.getTime(), clearedAt: NOW.getTime() });
  assert.match(await page.locator('#clearStatus').textContent(), /مُسحت/);
  assert.equal(await page.locator('#gameTable tbody tr').count(), 0);
  assert.match(await page.locator('#source').textContent(), /لا توجد بيانات بعد/);
  // The PC still shares after a clear, and the page still says so once statistics resume.
  await page.locator('#resumeBtn').click();
  assert.equal(await page.locator('#shareMsg').isVisible(), true, 'the sharing line comes back after a clear');
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

test('the codes panel: this PC\'s code, each player\'s code with its check character, and "the same child as on another PC"', async t => {
  const record = (k, a, c) => ({ k, a, c, b: '8-9', xp: 0, lv: 1, d0: 20000, dl: 20000, g: {} });
  const main = { v: 1, seq: 13, list: [record('p1', 3, 1), record('p2', 9, 6), ...[...Array(10)].map((_, i) => record('p' + (i + 3), i, i % 8))] };
  const more = { v: 1, list: [record('p13', 10, 7)] };
  const sharing = { 'sg:site:tm:on': '"ingest.example.org"', 'sg:site:profiles': JSON.stringify(main), 'sg:site:profiles:more': JSON.stringify(more) };
  const page = await teacherPage(t, { entries: { ...seed(), ...sharing, 'sg:site:rid': RID_TEXT } });
  const rid = async () => JSON.parse((await storage(page))['sg:site:rid']);
  const row = key => page.locator(`#codes li[data-key="${key}"]`);
  assert.equal(await page.locator('#codesPanel').isVisible(), true);
  await page.locator('#codesPanel summary').click();
  assert.equal(await page.locator('#codes p').first().textContent(), 'رمز هذا الجهاز: 8C21-D0E9-4A6F');
  assert.deepEqual(await page.locator('#codes li').evaluateAll(items => items.map(li => li.dataset.key)),
    [...Array(13)].map((_, i) => 'p' + (i + 1)), 'every player, the 13th from sg:site:profiles:more too');
  // The player's animal in its colour ring, its code with the check character, and its dashboard label.
  assert.deepEqual([await row('p1').locator('.ring').textContent(), await row('p1').locator('.ring').getAttribute('style')], ['🐸', 'border-color:#f57c00']);
  assert.equal(await row('p1').locator('.code').textContent(), '3F9A-0C51-E2B7-5');
  assert.equal(await row('p1').locator('.hint').textContent(), 'في لوحة المؤشرات: الطالب 3F9A…');
  assert.equal(await row('p13').locator('.code').textContent(), shown(P13));
  assert.equal(await row('p2').locator('.code').count(), 0);
  assert.equal(await row('p2').locator('.hint').textContent(), 'يُصنع في المرة القادمة التي يلعب فيها هذا الطفل.');

  // The same child as on another PC: the code that PC's teacher page shows for the child.
  const OTHER = 'b0b1b2b3b4b5', THIRD = 'c0ffee000000';
  const before = await storage(page);
  await row('p1').locator('[data-link]').click();
  assert.equal(await page.locator('#linkForm').isVisible(), true);
  assert.equal(await page.locator('#linkText').textContent(), '🐸 رمز هذا الطفل كما يظهر على الجهاز الآخر (13 خانة، بالحروف الإنجليزية):');
  for (const [typed, message] of [
    ['3F9A-0C51', 'الرمز 13 خانة؛ تحقّق منه.'],
    [shown(OTHER).replace(/^B/, 'C'), 'إحدى خانات الرمز خاطئة؛ تحقّق منه.'],
    [shown(P1), 'هذا رمزه على هذا الجهاز؛ اكتب رمزه على الجهاز الآخر.'],
    [shown(P13), 'هذا رمز لاعب آخر على هذا الجهاز.']
  ]) {
    await page.locator('#linkCode').fill(typed);
    await page.locator('#linkForm button[type="submit"]').click();
    assert.equal(await page.locator('#linkStatus').textContent(), message, typed);
    assert.equal(await page.locator('#linkStatus').getAttribute('class'), 'status bad');
  }
  assert.deepEqual(await storage(page), before, 'a refused code changes nothing');
  await page.locator('#linkCode').fill(' ' + shown(OTHER).toLowerCase().replace(/-/g, ' ') + ' ');
  await page.locator('#linkCode').press('Enter');
  assert.equal(await page.locator('#linkStatus').textContent(),
    'من اللعبة القادمة يُحسب لعب هذا الطفل مع رمزه على الجهاز الآخر، ويُضم إليه ما لعبه هنا من قبل.');
  assert.equal(await page.locator('#linkForm').isHidden(), true);
  assert.deepEqual(await rid(), { v: 1, pc: PC_CODE, k: { p1: OTHER, p13: P13 }, l: { p1: P1 }, g: { p1: OTHER } });
  assert.equal(await row('p1').locator('.code').textContent(), shown(OTHER));
  // A player with no code yet takes the other code; nothing of its own waits to be joined.
  await row('p2').locator('[data-link]').click();
  await page.locator('#linkCode').fill(shown(THIRD));
  await page.locator('#linkForm button[type="submit"]').click();
  assert.equal(await page.locator('#linkStatus').textContent(), 'من اللعبة القادمة يُحسب لعب هذا الطفل مع رمزه على الجهاز الآخر.');
  assert.deepEqual(await rid(), { v: 1, pc: PC_CODE, k: { p1: OTHER, p2: THIRD, p13: P13 }, l: { p1: P1 }, g: { p1: OTHER, p2: THIRD } });
  // Cancel closes the form and writes nothing.
  await row('p3').locator('[data-link]').click();
  await page.locator('#linkCode').fill(shown(P1));
  await page.locator('#linkForm [data-cancel]').click();
  assert.equal(await page.locator('#linkForm').isHidden(), true);
  assert.deepEqual(Object.keys((await rid()).k), ['p1', 'p13', 'p2']);

  // Sharing off on this PC: the codes stay visible, nothing can be linked, nothing new is made.
  await page.evaluate(() => localStorage.setItem('sg:site:statsmeta', JSON.stringify({ ...JSON.parse(localStorage.getItem('sg:site:statsmeta')), tm: false })));
  await page.reload();
  await page.locator('#codesPanel summary').click();
  assert.equal(await row('p1').locator('.code').textContent(), shown(OTHER));
  assert.equal(await page.locator('#codes .notice').textContent(),
    'المشاركة غير مفعّلة على هذا الجهاز، فلا تُصنع رموز جديدة ولا يُربط طفل بجهاز آخر.');
  assert.deepEqual(await page.locator('#codes [data-link]').evaluateAll(buttons => buttons.map(b => b.disabled)), Array(13).fill(true));
  assert.equal(await row('p4').locator('.hint').textContent(), 'لا رمز بعد.');
  // Sharing on, no code made yet for this PC.
  await page.evaluate(() => {
    const meta = JSON.parse(localStorage.getItem('sg:site:statsmeta'));
    delete meta.tm;
    localStorage.setItem('sg:site:statsmeta', JSON.stringify(meta));
    localStorage.removeItem('sg:site:rid');
  });
  await page.reload();
  await page.locator('#codesPanel summary').click();
  assert.equal(await page.locator('#codes p').first().textContent(), 'رمز هذا الجهاز: يُصنع في المرة القادمة التي يلعب فيها طفل هنا.');
  assert.equal(await page.locator('#codes .notice').count(), 0);
  assert.equal(await page.locator('#clearServer').isVisible(), true, 'this PC shares: the clear note says what stays on the server');
});

test('the delivery panel says at a glance whether this PC\'s play reaches the dashboard; its test names the address to allow, then sends what waited', async t => {
  const INGEST = 'https://ingest.test/v1/batch', H = 36e5, D = 864e5, now = NOW.getTime();
  // The queue of the portal that sends to INGEST (js/telemetry.js: a 32-bit hash of the address).
  const queueKey = 'sg:site:tm:q4:' + ([...INGEST].reduce((h, c) => h * 31 + c.charCodeAt(0) | 0, 0) >>> 0).toString(36);
  const envelope = b => ({ v: 3, b, s: 'abcdefabcdef', k: 'src', m: 'web', a: '', d: [4, 4, 1920], u: '', p: '', z: 'Asia/Riyadh', ev: [['ss', 0, 0, -1, -1, 0, 0, 0]] });
  const waiting = [{ t: now - 2 * D, w0: now - 2 * D, e: envelope('1'.repeat(16)) }, { t: now - 2 * H, w0: now - 2 * H, e: envelope('2'.repeat(16)) }];
  const requests = [];
  let allowed = false;
  // The portal noted the server, its last delivery three days ago and the failures since
  // the day before yesterday; it sends to the address in that record.
  const page = await teacherPage(t, { entries: { ...seed(), 'sg:site:tm:on': '"ingest.test"', [queueKey]: JSON.stringify(waiting),
    'sg:site:tm:dx': JSON.stringify({ v: 1, u: INGEST, ok: now - 3 * D, f: now - 2 * D - H, k: 'network', at: now - 6e4 }) },
  ingest: request => {
    requests.push([request.method() + ' ' + request.url(), request.postData()]);
    if (!allowed) return 'abort';
    return request.method() === 'GET' ? { status: 200, contentType: 'application/json; charset=utf-8', body: '{"ok":true,"accepts":[2,3],"schema":4}' } : { status: 204 };
  } });
  const panel = () => page.evaluate(() => {
    const el = id => document.getElementById(id);
    const shown = id => el(id).checkVisibility();
    return { tone: el('delivery').dataset.tone, state: el('deliveryState').textContent,
      facts: shown('deliveryFacts') ? [...el('deliveryFacts').children].map(c => c.textContent) : [],
      problem: shown('deliveryProblem') ? el('deliveryProblem').textContent : '', test: shown('checkRow') };
  });
  const tested = mark => page.waitForFunction(mark => document.getElementById('checkStatus').textContent.startsWith(mark), mark)
    .then(() => page.locator('#checkStatus').textContent());
  // Sharing is on, and in the same box: red, since when, the host and what to ask IT.
  assert.equal(await page.locator('#shareMsg').textContent(), 'مشاركة إحصاءات اللعب مفعّلة على هذا الجهاز: تُرسل بلا أسماء، ويظهر كل طفل برمز عشوائي، إلى ingest.test.');
  assert.deepEqual(await panel(), { tone: 'bad', state: '⚠ لا تصل إحصاءات هذا الجهاز إلى لوحة المؤشرات منذ يومين.',
    facts: ['آخر وصول إلى لوحة المؤشرات', 'قبل 3 أيام (5/10/2026 10:30)', 'ينتظر الإرسال', 'دفعتان، أقدمها من قبل يومين'],
    problem: 'تعذّر الوصول إلى خادم الإحصاءات منذ 6/10/2026 09:30. السبب في الغالب أن مرشّح الإنترنت في المدرسة يحجب ingest.test. ' +
      'اطلب من مسؤول تقنية المعلومات في المدرسة السماح بالعنوان https://ingest.test. ما لم يصل يبقى محفوظًا على هذا الجهاز ويُرسل وحده عندما يعود الاتصال، ' +
      'لكن مكانه محدود: بعد بضع ساعات من اللعب، أو بعد 7 أيام، يُحذف الأقدم أولًا.',
    test: true });
  assert.deepEqual(await page.locator('#deliveryProblem bdi[dir="ltr"]').allTextContents(), ['6/10/2026 09:30', 'ingest.test', 'https://ingest.test']);
  assert.deepEqual(requests, [], 'nothing goes over the network until the teacher asks');
  // The school's filter still blocks the server: the test names the address to give IT.
  await page.locator('#checkBtn').click();
  assert.equal(await tested('✗'), '✗ تعذّر الوصول إلى خادم الإحصاءات من هذا الجهاز. أعطِ مسؤول تقنية المعلومات في المدرسة هذا العنوان ليسمح به في مرشّح الإنترنت: https://ingest.test');
  assert.equal(await page.locator('#checkStatus').getAttribute('class'), 'status bad');
  assert.deepEqual(requests.map(r => r[0]), ['GET https://ingest.test/v1/health']);
  assert.equal((await panel()).state, '⚠ لا تصل إحصاءات هذا الجهاز إلى لوحة المؤشرات منذ يومين.', 'still failing since the same time');
  // IT allowed it: the test reaches the server and sends both waiting batches, oldest first.
  allowed = true;
  await page.locator('#checkBtn').click();
  assert.equal(await tested('✓'), '✓ يصل هذا الجهاز إلى خادم الإحصاءات ingest.test. أُرسل الآن ما كان ينتظر: دفعتان.');
  assert.equal(await page.locator('#checkStatus').getAttribute('class'), 'status');
  assert.deepEqual(requests.slice(1).map(r => r[0]), ['GET https://ingest.test/v1/health', 'POST ' + INGEST, 'POST ' + INGEST]);
  assert.deepEqual(requests.slice(2).map(r => JSON.parse(r[1]).b), ['1'.repeat(16), '2'.repeat(16)]);
  assert.deepEqual(await panel(), { tone: 'ok', state: '✓ تصل إحصاءات هذا الجهاز إلى لوحة المؤشرات.',
    facts: ['آخر وصول إلى لوحة المؤشرات', 'قبل أقل من دقيقة (8/10/2026 10:30)', 'ينتظر الإرسال', 'لا شيء'], problem: '', test: true });
  const stored = await storage(page);
  assert.equal(stored[queueKey], undefined, 'nothing waits');
  assert.deepEqual(JSON.parse(stored['sg:site:tm:dx']), { v: 1, u: INGEST, ok: now, f: 0, k: '', at: 0, x: 0 });
  // Later the portal's sends fail (in another tab): the box turns red, and the green result
  // of the earlier test goes with it rather than contradict it.
  const portal = await page.context().newPage();
  await portal.goto(origin + '/favicon.svg');
  await portal.evaluate(([u, t]) => localStorage.setItem('sg:site:tm:dx', JSON.stringify({ v: 1, u, ok: t, f: t, k: 'network', at: t, x: 0 })), [INGEST, now]);
  await page.waitForFunction(() => document.getElementById('delivery').dataset.tone === 'bad');
  assert.equal(await page.locator('#checkStatus').textContent(), '', 'the earlier result is gone');
  await portal.close();
  // Statistics stopped: the panel says that nothing is sent, beside the stop notice, and offers no test.
  await page.evaluate(() => localStorage.setItem('sg:site:statsmeta', JSON.stringify({ ...JSON.parse(localStorage.getItem('sg:site:statsmeta')), off: true })));
  await page.reload();
  assert.deepEqual(await panel(), { tone: 'off', state: 'لا يُرسل هذا الجهاز شيئًا إلى لوحة المؤشرات ما دام جمع الإحصاءات متوقفًا.', facts: [], problem: '', test: false });
  assert.equal(await page.locator('#stoppedMsg').isVisible(), true);
  assert.equal(await page.locator('#shareMsg').isHidden(), true);
  assert.equal(requests.length, 4, 'opening the page sent nothing');
});

test('a downloaded folder\'s teacher page says that copy never sends to the dashboard and names the website the PCs must open', async t => {
  if (!browser) browser = await launchChromium();
  const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'Asia/Riyadh' });
  t.after(() => context.close());
  const page = await context.newPage(), problems = [];
  page.on('pageerror', error => problems.push('page error: ' + error.message));
  page.on('console', message => { if (message.type() === 'error') problems.push('console error: ' + message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) problems.push('request: ' + request.url()); });
  await page.goto(pathToFileURL(path.join(root, 'teacher.html')).href);
  await page.waitForFunction(() => document.getElementById('source')?.dataset.copy === 'folder');
  assert.equal(await page.locator('#delivery').isVisible(), true);
  assert.equal(await page.locator('#delivery').getAttribute('data-why'), 'folder');
  assert.equal(await page.locator('#deliveryState').textContent(), 'هذه نسخة منزَّلة من الموقع (مجلد على هذا الجهاز)، ولا ترسل أبدًا شيئًا إلى لوحة المؤشرات في المدرسة.');
  // The address this build was published at (SG_SITE_URL), if it was given one; the source tree has none.
  const site = await page.evaluate(() => window.SG_SITE ? window.SG_SITE.url : '');
  if (!process.env.SG_ROOT) assert.equal(site, '');
  assert.equal(await page.locator('#deliveryProblem').textContent(), 'لكي يصل لعب الأطفال إلى لوحة المؤشرات، يجب أن تفتح الأجهزة ' +
    (site ? 'الموقع على الإنترنت: ' + site : 'موقع ألعاب المدرسة على الإنترنت بدلًا من هذا المجلد.'));
  assert.deepEqual(await page.locator('#deliveryProblem bdi[dir="ltr"]').allTextContents(), site ? [site] : []);
  assert.equal(await page.locator('#checkRow').isHidden(), true, 'nothing to test');
  assert.equal(await page.locator('#shareMsg').isHidden(), true);
  assert.equal(await page.evaluate(() => SGTelemetry.status().why), 'folder');
  assert.deepEqual(problems, []);
});

test('the teacher page\'s copies of the animals and ring colours are the portal\'s own', async t => {
  if (!browser) browser = await launchChromium();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(origin + '/');
  const portal = await page.evaluate(() => [SGProfiles.ANIMALS, SGProfiles.COLORS]);
  assert.deepEqual([api.ANIMALS, api.COLORS], portal);
  await page.goto(origin + '/teacher.html');
  assert.deepEqual(await page.evaluate(() => [SGTeacher.ANIMALS, SGTeacher.COLORS]), portal);
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
