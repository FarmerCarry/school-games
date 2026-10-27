import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// node:sqlite prints an ExperimentalWarning on Node 22; keep every other warning.
const { hideSqliteWarning } = await import('../../server/warnings.mjs');
hideSqliteWarning();
const { createApp, MAX_BODY } = await import('../../server/app.mjs');
const { EVENTS } = await import('../../server/schema.mjs');
const { COLUMNS } = await import('../../server/store.mjs');

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(repo, 'server/fixtures/sample-batch.json'), 'utf8'));
const ORIGIN = 'https://school.example';
const TOKEN = 'test-admin-token-0123456789';
const DAY_MS = 86400000;
const START = Date.parse('2026-10-20T09:15:00Z');

let batchSeq = 0;
const batchId = () => (++batchSeq).toString(16).padStart(16, '0');
const envelope = (s, ev, extra = {}) => ({ v: 2, b: batchId(), s, k: 'src', m: 'web', a: '6-7', d: [4, 4, 1920], ev, ...extra });

function request(base, method, pathname, { headers = {}, body, chunks } = {}) {
  return new Promise((resolve, reject) => {
    let answered = false;
    const req = http.request(base + pathname, { method, headers, agent: false }, res => {
      answered = true;
      const parts = [];
      res.on('data', part => parts.push(part));
      res.on('end', () => {
        const text = Buffer.concat(parts).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, text, json: () => JSON.parse(text) });
      });
    });
    // An early answer (413) may close the socket while the body is still being written.
    req.on('error', error => { if (!answered) reject(error); });
    if (chunks) { for (const chunk of chunks) req.write(chunk); req.end(); } else req.end(body);
  });
}

async function start(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-telemetry-'));
  const clock = { now: START };
  const dbPath = path.join(dir, 'telemetry.db');
  const app = createApp({ dbPath, allowedOrigins: [ORIGIN], adminToken: TOKEN, now: () => clock.now, ...options });
  const { port } = await app.listen(0, '127.0.0.1');
  t.after(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}`;
  const send = (method, pathname, init) => request(base, method, pathname, init);
  const post = (body, { origin = ORIGIN, type = 'text/plain;charset=UTF-8', headers = {} } = {}) =>
    send('POST', '/v1/batch', { headers: { 'content-type': type, ...(origin ? { origin } : {}), ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body) });
  const admin = (pathname, headers = {}) => send('GET', pathname, { headers: { authorization: 'Bearer ' + TOKEN, ...headers } });
  const rows = table => app.store.db.prepare(`SELECT * FROM ${table}`).all().map(row => ({ ...row }));
  const count = table => app.store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  return { app, clock, dir, dbPath, base, send, post, admin, rows, count };
}

const eventTables = () => Object.keys(COLUMNS).map(kind => 'ev_' + kind);
const storedEvents = s => Object.fromEntries(eventTables().map(table => [table, s.count(table)]));

test('health answers ok; unknown routes are 404 and wrong methods 405', async t => {
  const s = await start(t);
  const health = await s.send('GET', '/v1/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.json(), { ok: true });
  assert.match(health.headers['content-type'], /^application\/json/);
  assert.equal((await s.send('HEAD', '/v1/health')).status, 200);
  assert.equal((await s.send('GET', '/v1/nothing')).status, 404);
  assert.equal((await s.send('GET', '/')).status, 404);
  const wrong = await s.send('GET', '/v1/batch');
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.allow, 'POST, OPTIONS');
  assert.equal((await s.send('POST', '/v1/health')).status, 405);
});

test('the shared fixture is a valid envelope with every event kind, stored row for row', async t => {
  assert.deepEqual([...new Set(fixture.ev.map(e => e[0]))].sort(), Object.keys(EVENTS).sort(), 'the fixture exercises every kind');
  const s = await start(t);
  const res = await s.post(fixture);
  assert.equal(res.status, 204);
  assert.equal(res.text, '');
  for (const kind of Object.keys(EVENTS)) {
    assert.equal(s.count('ev_' + kind), fixture.ev.filter(e => e[0] === kind).length, kind);
  }
  assert.deepEqual(s.rows('session_days'), [{ s: fixture.s, day: '2026-10-20', hour: 9, a: '6-7', m: 'web',
    k: fixture.k, cores: 4, mem: 4, screen: 1920 }]);
  assert.deepEqual(s.rows('batches'), [{ b: fixture.b, day: '2026-10-20' }]);
  const re = fixture.ev.filter(e => e[0] === 're').map(e => e.slice(1).flat());
  const columns = ['t', ...COLUMNS.re];
  assert.deepEqual(s.rows('ev_re').map(row => columns.map(c => row[c])), re);
  for (const row of s.rows('ev_gx')) assert.deepEqual([row.s, row.day, row.hour, row.a], [fixture.s, '2026-10-20', 9, '6-7']);
});

test('a repeated batch id is answered 204 and stored once', async t => {
  const s = await start(t);
  assert.equal((await s.post(fixture)).status, 204);
  const before = storedEvents(s);
  s.clock.now += 3600000;
  assert.equal((await s.post(fixture)).status, 204);
  assert.equal((await s.post({ ...fixture, ev: [['lv', 1, 9]] })).status, 204, 'the id alone decides');
  assert.deepEqual(storedEvents(s), before);
  assert.equal(s.count('batches'), 1);
  assert.equal(s.count('session_days'), 1);
});

test('invalid envelopes are 400 and other media types 415, storing nothing', async t => {
  const s = await start(t);
  const { b: _b, ...noBatch } = fixture;
  const bad = [
    'not json', '', '[]', 'null', '2', JSON.stringify([fixture]),
    { ...fixture, v: 1 }, { ...fixture, v: '2' }, noBatch,
    { ...fixture, b: 'ABCDEF0123456789' }, { ...fixture, b: '9f3c0a17b2e44d1' }, { ...fixture, b: [fixture.b] },
    { ...fixture, s: '5d02be9a41c7aa' }, { ...fixture, s: 'p1' }, { ...fixture, s: undefined },
    { ...fixture, k: 'v1.2 build' }, { ...fixture, k: 7 }, { ...fixture, k: 'abcdef' }, { ...fixture, k: '5c18c6d2d1c052ad00' },
    { ...fixture, m: 'desktop' },
    { ...fixture, a: '6' }, { ...fixture, a: null }, { ...fixture, d: [4, 4] }, { ...fixture, d: [3, 4, 1920] },
    { ...fixture, d: [4, 4, '1920'] }, { ...fixture, d: [4, 3, 1920] }, { ...fixture, d: [4, 4, 1024] },
    { ...fixture, ev: {} }, { ...fixture, ev: undefined }, { ...fixture, ev: new Array(201).fill(['lv', 1, 2]) }
  ];
  for (const body of bad) {
    const res = await s.post(body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
    assert.match(res.headers['content-type'], /^application\/json/);
  }
  for (const type of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', '']) {
    assert.equal((await s.post(fixture, { type })).status, 415, type);
  }
  assert.equal((await s.post(fixture, { type: 'application/json' })).status, 204);
  assert.equal((await s.post({ ...fixture, b: batchId(), ev: new Array(200).fill(['lv', 1, 2]) })).status, 204, '200 events are fine');
  assert.equal(s.count('batches'), 2);
});

test('bodies over 64 KB are 413, declared or streamed; exactly 64 KB is accepted', async t => {
  const s = await start(t);
  const json = JSON.stringify(fixture);
  const exact = json + ' '.repeat(MAX_BODY - Buffer.byteLength(json));
  assert.equal(Buffer.byteLength(exact), 65536);
  const over = exact + ' ';
  assert.equal((await s.post(over)).status, 413);
  const streamed = await s.send('POST', '/v1/batch', { headers: { 'content-type': 'text/plain', origin: ORIGIN },
    chunks: [over.slice(0, 40000), over.slice(40000)] });
  assert.equal(streamed.status, 413);
  assert.equal(streamed.headers['transfer-encoding'], undefined);
  // The rest of a large body is drained, so the answer is never lost to a connection reset.
  assert.equal((await s.post('x'.repeat(900 * 1024))).status, 413);
  assert.equal((await s.send('GET', '/v1/health')).status, 200);
  assert.equal(s.count('batches'), 0);
  assert.equal((await s.post(exact)).status, 204);
  assert.equal(s.count('batches'), 1);
});

test('a client that disconnects mid-body is not logged as a server error', async t => {
  const logs = [];
  const s = await start(t, { log: message => logs.push(message) });
  await new Promise((resolve, reject) => {
    const socket = net.connect(Number(new URL(s.base).port), '127.0.0.1', () => {
      socket.write('POST /v1/batch HTTP/1.1\r\nHost: x\r\nContent-Type: text/plain\r\nContent-Length: 1000\r\n\r\n{"v":2,');
      setTimeout(() => socket.destroy(), 50);
    });
    socket.on('close', resolve);
    socket.on('error', reject);
  });
  const open = () => new Promise(resolve => s.app.server.getConnections((_, n) => resolve(n)));
  while (await open()) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await s.send('GET', '/v1/health')).status, 200);
  assert.deepEqual(logs, []);
  assert.equal(s.count('batches'), 0);
});

test('unknown and malformed events are dropped while valid ones are kept; measures are clamped', async t => {
  const s = await start(t);
  const z6 = [0, 0, 0, 0, 0, 0];
  const malformed = [
    ['zz', 1], 'go', null, 42, {}, [], ['go'], [7, 1], ['toString', 1],
    ['go', -1, 'road-hopper', 'search', 1], ['go', 1, 'Road-Hopper', 'search', 1], ['go', 1, 'road--hopper', 'search', 1],
    ['go', 1, 'a'.repeat(41), 'search', 1], ['go', 1, 'constructor', 'search', 1], ['go', 1, 'road-hopper', 'email', 1],
    ['go', 1, 'road-hopper', 'search', 5], ['go', 1, 'road-hopper', 'search', '1'], ['go', '1', 'road-hopper', 'search', 1],
    ['go', 1, 'road-hopper', 'search'], ['go', 1, 'road-hopper', 'search', 1, 'extra'],
    ['rs', 1, 'road-hopper', 'L123', 1, 0], ['rs', 1, 'road-hopper', '1up', 1, 0], ['rs', 1, 'road-hopper', 'toString', 1, 0],
    ['rs', 1, 'road-hopper', 'Sara Ahmed', 1, 0], ['rs', 1, 'road-hopper', 'L'.repeat(25), 1, 0],
    ['rs', 1, 'road-hopper', 'L1', 10, 0], ['rs', 1, 'road-hopper', 'L1', 1.5, 0], ['rs', 1, 'road-hopper', 'L1', 1, -1],
    ['re', 1, 'road-hopper', 's', 'L1', 1, 1, 1, 1, 1, z6], ['re', 1, 'road-hopper', 'w', 'L1', 1, -2, 1, 1, 1, z6],
    ['re', 1, 'road-hopper', 'w', 'L1', 1, 1, 1, 1, 1, [0, 0, 0, 0, 0]], ['re', 1, 'road-hopper', 'w', 'L1', 1, 1, 1, 1, 1, [0, 0, 0, 0, 0, 'x']],
    ['re', 1, 'road-hopper', 'w', 'L1', 1, 1, 1, -1, 1, z6],
    ['gx', 1, 'road-hopper', 1000, z6, [0, 0, 0, null]], ['gx', 1, 'road-hopper', 1000, z6, [0, 0, 0]],
    ['er', 1, 'road-hopper', 'x', 'TypeError: secret is undefined'], ['er', 1, 'road-hopper', 'boom'],
    ['ss', 1, 2, 0, 0, 1], ['ss', 1, 0, 4, 0, 1], ['ss', 1, 0, 0, 5, 1], ['lv', 1, 0], ['se', 1, null]
  ];
  const valid = [
    ['go', 3.4, 'road-hopper', 'search', 1], ['ld', 5, 'road-hopper', 999999],
    ['rs', 6, 'road-hopper', 'w1-2', 9, 20000], ['re', 9, 'road-hopper', 'e', 'endless', 99999999, 5e12, 3, 7, 2, [1, 2, 3, 4, 5, 6]],
    ['lv', 10, 5000], ['er', 11, 'road-hopper', 'l'], ['ss', 1e9, 1, 3, 4, 0], ['se', 12, 800.6]
  ];
  // 1e400 parses to Infinity, which is not a measure to clamp.
  const raw = JSON.stringify(envelope('b00000000001', [...malformed, ...valid])).slice(0, -2) + ',["ld",1,"road-hopper",1e400]]}';
  assert.equal((await s.post(raw)).status, 204);
  assert.deepEqual(storedEvents(s), { ev_ss: 1, ev_go: 1, ev_ld: 1, ev_er: 1, ev_rs: 1, ev_re: 1, ev_gx: 0, ev_lv: 1, ev_se: 1 });
  const one = table => { const { s: _, day, hour, a, ...rest } = s.rows(table)[0]; return rest; };
  assert.deepEqual(one('ev_go'), { t: 3, slug: 'road-hopper', src: 'search', plays: 1 });
  assert.deepEqual(one('ev_ld'), { t: 5, slug: 'road-hopper', ms: 120000 });
  assert.deepEqual(one('ev_rs'), { t: 6, slug: 'road-hopper', id: 'w1-2', tier: 9, replay: 9999 });
  assert.deepEqual(one('ev_re'), { t: 9, slug: 'road-hopper', code: 'e', id: 'endless', ms: 10800000, score: 1e9, tier: 3,
    hits: 7, misses: 2, rt0: 1, rt1: 2, rt2: 3, rt3: 4, rt4: 5, rt5: 6 });
  assert.deepEqual(one('ev_lv'), { t: 10, level: 999 });
  assert.deepEqual(one('ev_ss'), { t: 604800, new_profile: 1, profile_age: 3, since_last: 4, level: 0 });
  assert.deepEqual(one('ev_se'), { t: 12, ms: 801 });
  // A batch whose events were all dropped is still a valid, de-duplicated batch.
  assert.equal((await s.post(envelope('b00000000002', malformed))).status, 204);
  assert.equal(s.count('batches'), 2);
  assert.equal(s.count('session_days'), 1, 'no session row without a stored event');
});

test('names, user agents, PC labels, error text, profile keys and addresses are never stored', async t => {
  const s = await start(t);
  const secrets = ['SENTINEL-NAME', 'SENTINEL-UA', 'SENTINEL-PC-LAB', 'SENTINEL-LABEL', 'SENTINEL-ERROR', 'p9z8y7',
    'SENTINEL-AVATAR', '198.51.100.23', '127.0.0.1', 'SENTINEL-COOKIE', 'SENTINEL-REFERER', 'SENTINEL-UA-HEADER', 'sara'];
  const body = {
    ...fixture, b: batchId(), name: 'sara SENTINEL-NAME', ua: 'Mozilla/5.0 SENTINEL-UA', pc: 'SENTINEL-PC-LAB',
    label: 'SENTINEL-LABEL', err: 'TypeError SENTINEL-ERROR', p: 'p9z8y7', player: 'p9z8y7', avatar: 'SENTINEL-AVATAR',
    ip: '198.51.100.23', time: Date.now(),
    ev: [
      ...fixture.ev,
      ['er', 200, 'road-hopper', 'x', 'TypeError SENTINEL-ERROR'], ['ss', 0, 0, 0, 4, 0, 'p9z8y7'],
      ['go', 201, 'road-hopper', 'search', 0, 'sara SENTINEL-NAME'], ['rs', 202, 'road-hopper', 'p9z8y7', 1, 0, 'SENTINEL-LABEL'],
      { t: 'go', name: 'SENTINEL-NAME' }
    ]
  };
  const res = await s.post(body, { headers: { 'user-agent': 'SENTINEL-UA-HEADER', 'x-forwarded-for': '198.51.100.23',
    cookie: 'sid=SENTINEL-COOKIE', referer: 'https://school.example/SENTINEL-REFERER' } });
  assert.equal(res.status, 204);
  assert.equal(s.count('ev_go'), 2, 'the valid events are kept');
  // Only contract columns exist.
  const allowed = new Set(['b', 's', 'day', 'hour', 'a', 'm', 'k', 'cores', 'mem', 'screen', 't', ...Object.values(COLUMNS).flat()]);
  const tables = s.app.store.db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map(r => r.name);
  assert.deepEqual(tables.sort(), ['batches', 'session_days', 'session_games', 'session_levels', ...eventTables()].sort());
  for (const table of tables) {
    for (const { name } of s.app.store.db.prepare(`PRAGMA table_info(${table})`).all()) assert.ok(allowed.has(name), `${table}.${name}`);
    for (const row of s.rows(table)) {
      for (const [column, value] of Object.entries(row)) {
        for (const secret of secrets) assert.ok(!String(value).includes(secret), `${table}.${column} holds ${secret}`);
      }
    }
  }
  // Nor anywhere in the database files, including the write-ahead log.
  for (const file of fs.readdirSync(s.dir)) {
    const bytes = fs.readFileSync(path.join(s.dir, file));
    for (const secret of secrets.filter(x => x.length > 5)) assert.equal(bytes.indexOf(secret), -1, `${file} holds ${secret}`);
  }
});

test('CORS echoes only listed origins, never with credentials, and null only when listed', async t => {
  const s = await start(t);
  const allowed = await s.post(fixture);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers['access-control-allow-origin'], ORIGIN);
  assert.match(allowed.headers.vary, /\bOrigin\b/);
  assert.equal(allowed.headers['access-control-allow-credentials'], undefined);
  for (const origin of ['https://evil.example', 'http://school.example', 'https://school.example.evil', 'null']) {
    const health = await s.send('GET', '/v1/health', { headers: { origin } });
    assert.equal(health.status, 200);
    assert.equal(health.headers['access-control-allow-origin'], undefined, origin);
    assert.match(health.headers.vary, /\bOrigin\b/);
    const denied = await s.post({ ...fixture, b: batchId() }, { origin });
    assert.equal(denied.status, 403, origin);
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
    assert.equal(denied.headers['access-control-expose-headers'], undefined);
  }
  assert.equal(s.count('batches'), 1);
  // Tools without a browser send no Origin.
  assert.equal((await s.post({ ...fixture, b: batchId() }, { origin: '' })).status, 204);

  const withNull = await start(t, { allowedOrigins: [ORIGIN, 'null'] });
  const fromFile = await withNull.post(fixture, { origin: 'null' });
  assert.equal(fromFile.status, 204);
  assert.equal(fromFile.headers['access-control-allow-origin'], 'null');
  assert.equal(fromFile.headers['access-control-allow-credentials'], undefined);
});

test('OPTIONS preflight answers listed origins only', async t => {
  const s = await start(t);
  const preflight = { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' };
  const ok = await s.send('OPTIONS', '/v1/batch', { headers: preflight });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers['access-control-allow-origin'], ORIGIN);
  assert.match(ok.headers['access-control-allow-methods'], /\bPOST\b/);
  assert.match(ok.headers['access-control-allow-headers'], /Content-Type/i);
  assert.match(ok.headers['access-control-allow-headers'], /Authorization/i);
  assert.equal(ok.headers['access-control-max-age'], '86400');
  assert.equal(ok.headers['access-control-allow-credentials'], undefined);
  const admin = await s.send('OPTIONS', '/v1/admin/kpis', { headers: { ...preflight, 'access-control-request-method': 'GET' } });
  assert.equal(admin.status, 204);
  assert.equal(admin.headers['access-control-allow-origin'], ORIGIN);
  const denied = await s.send('OPTIONS', '/v1/batch', { headers: { ...preflight, origin: 'https://evil.example' } });
  assert.equal(denied.status, 204);
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
  assert.equal(denied.headers['access-control-allow-methods'], undefined);
  assert.match(denied.headers.vary, /\bOrigin\b/);
});

test('the per-client token bucket answers 429 with Retry-After and refills', async t => {
  const s = await start(t, { ratePerMin: 2 });
  assert.equal((await s.send('GET', '/v1/health')).status, 200);
  assert.equal((await s.post(fixture)).status, 204);
  const limited = await s.post({ ...fixture, b: batchId() });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['retry-after'], '30');
  assert.equal(limited.headers['access-control-allow-origin'], ORIGIN, 'the page can read the status');
  assert.equal(limited.headers['access-control-expose-headers'], 'Retry-After', 'and the wait');
  assert.equal(s.count('batches'), 1);
  s.clock.now += 30000;
  assert.equal((await s.send('GET', '/v1/health')).status, 200);
  assert.equal((await s.send('GET', '/v1/health')).status, 429);
  s.clock.now += 60000;
  assert.equal((await s.send('GET', '/v1/health')).status, 200);
  assert.equal((await s.send('GET', '/v1/health')).status, 200);
  assert.equal((await s.send('GET', '/v1/health')).status, 429);

  // Behind a trusted proxy each client address gets its own bucket; spoofed entries do not help.
  const proxied = await start(t, { ratePerMin: 2, trustProxy: 1 });
  const from = xff => proxied.send('GET', '/v1/health', { headers: { 'x-forwarded-for': xff } });
  assert.equal((await from('203.0.113.1')).status, 200);
  assert.equal((await from('203.0.113.1')).status, 200);
  assert.equal((await from('203.0.113.1')).status, 429);
  assert.equal((await from('198.51.100.7, 203.0.113.1')).status, 429);
  assert.equal((await from('203.0.113.2')).status, 200);
  const off = await start(t, { ratePerMin: 0 });
  for (let i = 0; i < 5; i++) assert.equal((await off.send('GET', '/v1/health')).status, 200);
});

test('admin endpoints are 404 without ADMIN_TOKEN and 401 without the right bearer token', async t => {
  const closed = await start(t, { adminToken: '' });
  for (const pathname of ['/v1/admin/kpis', '/v1/admin/live']) {
    assert.equal((await closed.send('GET', pathname)).status, 404);
    assert.equal((await closed.admin(pathname)).status, 404);
  }
  const s = await start(t);
  for (const pathname of ['/v1/admin/kpis', '/v1/admin/live']) {
    const none = await s.send('GET', pathname);
    assert.equal(none.status, 401);
    assert.match(none.headers['www-authenticate'], /^Bearer/);
    for (const authorization of ['Bearer wrong-token-0123456789', 'Bearer ' + TOKEN + 'x', 'Bearer ' + TOKEN.slice(1),
      'Basic ' + Buffer.from('admin:' + TOKEN).toString('base64'), TOKEN, 'Bearer']) {
      assert.equal((await s.send('GET', pathname, { headers: { authorization } })).status, 401, authorization);
    }
    const ok = await s.admin(pathname);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers['cache-control'], 'no-store');
    assert.equal((await s.send('GET', pathname, { headers: { authorization: 'bearer ' + TOKEN } })).status, 200);
    assert.equal((await s.send('POST', pathname, { headers: { authorization: 'Bearer ' + TOKEN } })).status, 405);
  }
});

// Four sessions on two days. S1 to S3 are 6-7 year olds on day one, S4 is 10-11 on day two.
const z6 = [0, 0, 0, 0, 0, 0];
const S1 = 'a00000000001', S2 = 'a00000000002', S3 = 'a00000000003', S4 = 'a00000000004';
const DAY_ONE = [
  envelope(S1, [
    ['ss', 0, 1, 0, 4, 1], ['go', 1, 'road-hopper', 'featured', 0], ['ld', 2, 'road-hopper', 800],
    ['rs', 3, 'road-hopper', 'L1', 1, 0], ['re', 30, 'road-hopper', 'w', 'L1', 27000, 120, 2, 10, 2, [5, 4, 2, 1, 0, 0]],
    ['rs', 31, 'road-hopper', 'L2', 2, 0], ['re', 60, 'road-hopper', 'l', 'L2', 29000, 80, 2, 6, 4, [2, 3, 3, 1, 1, 0]],
    ['gx', 61, 'road-hopper', 58000, [50, 10, 2, 0, 0, 0], [900, 80, 15, 5]], ['lv', 62, 2]
  ]),
  envelope(S1, [
    ['go', 70, 'tank-splat', 'catalog', 0], ['gx', 100, 'tank-splat', 30000, [10, 0, 0, 0, 0, 0], [500, 0, 0, 0]],
    ['se', 110, 88000]
  ]),
  envelope(S2, [
    ['ss', 0, 0, 1, 1, 3], ['go', 1, 'road-hopper', 'recent', 2], ['ld', 2, 'road-hopper', 1200],
    ['rs', 3, 'road-hopper', 'L1', 1, 0], ['re', 20, 'road-hopper', 'q', 'L1', 17000, -1, 1, 3, 5, [0, 1, 2, 2, 1, 1]],
    ['rs', 21, 'road-hopper', 'L1', 1, 1], ['re', 50, 'road-hopper', 'w', 'L1', 29000, 100, 1, 8, 1, [3, 3, 2, 1, 0, 0]],
    ['gx', 51, 'road-hopper', 46000, [20, 10, 5, 5, 0, 0], [400, 200, 90, 10]]
  ], { d: [4, 2, 1366] }),
  envelope(S3, [
    ['go', 1, 'road-hopper', 'featured', 1], ['ld', 3, 'road-hopper', 1000],
    ['rs', 4, 'road-hopper', 'L1', 0, 0], ['re', 40, 'road-hopper', 'w', 'L1', 36000, 150, 0, 0, 0, z6],
    ['gx', 41, 'road-hopper', 36000, z6, [100, 0, 0, 0]]
  ], { m: 'app' })
];
const DAY_TWO = [
  envelope(S4, [
    ['ss', 0, 0, 3, 0, 9], ['go', 1, 'tank-splat', 'featured', 4], ['er', 5, 'tank-splat', 't'],
    ['gx', 6, 'tank-splat', 0, z6, [0, 0, 0, 0]]
  ], { a: '10-11', d: [8, 8, 2560], k: '5c18c6d2d1c052ad' })
];

async function dataset(t) {
  const s = await start(t);
  for (const body of DAY_ONE) assert.equal((await s.post(body)).status, 204);
  s.clock.now += DAY_MS;
  for (const body of DAY_TWO) assert.equal((await s.post(body)).status, 204);
  return s;
}

test('KPIs are exact for a hand-built dataset, with groups under three sessions suppressed', async t => {
  const s = await dataset(t);
  const res = await s.admin('/v1/admin/kpis?from=2026-10-20&to=2026-10-21');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json(), {
    v: 1, range: { from: '2026-10-20', to: '2026-10-21', days: 2, band: 'all' }, minSessions: 3,
    totals: {
      sessions: 4, engagedMinutes: 2.8, avgEngagedMinutesPerSession: 0.71, gameOpens: 5, roundsStarted: 5, roundsEnded: 5,
      levelUps: 1, errors: 1,
      players: { sessionStarts: 3, newProfiles: 1, guests: 0, profileAge: [1, 1, 0, 1], daysSinceLast: [1, 1, 0, 0, 1] }
    },
    daily: [{ day: '2026-10-20', sessions: 3, engagedMinutes: 2.8, opens: 4 }, { day: '2026-10-21', suppressed: true }],
    games: [
      {
        slug: 'road-hopper', sessions: 3, opens: 3, closes: 3, engagedMinutes: 2.3, avgEngagedSecPerOpen: 46.7,
        rounds: { starts: 5, ends: 5, codes: { w: 3, l: 1, d: 0, e: 0, q: 1 } },
        completionRate: 0.6, winRate: 0.75, dropOffRate: 0.2, avgTier: 1.25, hits: 27, misses: 12, accuracy: 0.6923,
        rt: [10, 11, 9, 5, 2, 1], il: [70, 20, 7, 5, 0, 0],
        frames: { counts: [1400, 280, 105, 15], smoothShare: 0.7778, stallShare: 0.0083 },
        loads: 3, avgLoadMs: 1000, errors: { t: 0, x: 0, l: 0 }, sources: { featured: 2, recent: 1 },
        replay: { replayIndex: [4, 1, 0, 0, 0, 0], playsBefore: [1, 1, 1, 0, 0] }
      },
      { slug: 'tank-splat', suppressed: true }
    ],
    levels: [
      { slug: 'road-hopper', id: 'L1', sessions: 3, starts: 4, ends: 4, codes: { w: 3, l: 0, d: 0, e: 0, q: 1 },
        completionRate: 0.75, winRate: 1, dropOffRate: 0.25, avgMs: 27250, avgTier: 1 },
      { slug: 'road-hopper', id: 'L2', suppressed: true }
    ],
    bands: [
      { band: '6-7', sessions: 3, opens: 4, engagedMinutes: 2.8, games: [
        { slug: 'road-hopper', sessions: 3, opens: 3, share: 0.75, avgTier: 1.25, completionRate: 0.6 },
        { slug: 'tank-splat', suppressed: true }
      ] },
      { band: '10-11', suppressed: true }
    ],
    sources: [{ src: 'featured', sessions: 3, opens: 3 }, { src: 'catalog', suppressed: true }, { src: 'recent', suppressed: true }],
    devices: {
      cores: [
        { value: 4, sessions: 3, frames: { counts: [1900, 280, 105, 15], smoothShare: 0.8261, stallShare: 0.0065 },
          il: [80, 20, 7, 5, 0, 0], avgLoadMs: 1000 },
        { value: 8, suppressed: true }
      ],
      memory: [{ value: 2, suppressed: true }, { value: 4, suppressed: true }, { value: 8, suppressed: true }],
      screen: [{ value: 1366, suppressed: true }, { value: 1920, suppressed: true }, { value: 2560, suppressed: true }]
    },
    modes: [{ mode: 'web', sessions: 3 }, { mode: 'app', suppressed: true }]
  });

  // One band.
  const young = (await s.admin('/v1/admin/kpis?from=2026-10-20&to=2026-10-21&band=6-7')).json();
  assert.deepEqual(young.range, { from: '2026-10-20', to: '2026-10-21', days: 2, band: '6-7' });
  assert.deepEqual(young.totals, {
    sessions: 3, engagedMinutes: 2.8, avgEngagedMinutesPerSession: 0.94, gameOpens: 4, roundsStarted: 5, roundsEnded: 5,
    levelUps: 1, errors: 0,
    players: { sessionStarts: 2, newProfiles: 1, guests: 0, profileAge: [1, 1, 0, 0], daysSinceLast: [0, 1, 0, 0, 1] }
  });
  assert.deepEqual(young.daily[1], { day: '2026-10-21', sessions: 0, engagedMinutes: 0, opens: 0 });
  assert.deepEqual(young.games.map(g => [g.slug, g.suppressed || false]), [['road-hopper', false], ['tank-splat', true]]);
  assert.deepEqual(young.bands.map(b => b.band), ['6-7']);
  // Nobody of unknown age: empty groups keep their zeros.
  const unknown = (await s.admin('/v1/admin/kpis?from=2026-10-20&to=2026-10-21&band=unknown')).json();
  assert.equal(unknown.range.band, 'unknown');
  assert.equal(unknown.totals.sessions, 0);
  assert.equal(unknown.totals.avgEngagedMinutesPerSession, null);
  assert.deepEqual([unknown.games, unknown.levels, unknown.bands, unknown.sources], [[], [], [], []]);
  // A single session's day: everything is suppressed, nothing is a number.
  const lonely = (await s.admin('/v1/admin/kpis?from=2026-10-21&to=2026-10-21')).json();
  assert.deepEqual(lonely.totals, { suppressed: true });
  assert.deepEqual(lonely.games, [{ slug: 'tank-splat', suppressed: true }]);
  assert.deepEqual(lonely.daily, [{ day: '2026-10-21', suppressed: true }]);
  assert.ok(!/"sessions":[12]\b/.test(JSON.stringify(lonely)), 'no group reports one or two sessions');
});

test('KPI query parameters are validated and default to the last 30 days', async t => {
  const s = await dataset(t);
  for (const query of ['from=2026-02-30&to=2026-03-01', 'from=2026-10-22&to=2026-10-21', 'from=2025-01-01&to=2026-10-21',
    'from=20261020&to=2026-10-21', 'to=yesterday', 'band=5-6', 'band=', 'from=2026-10-20&to=2026-10-21&band=All']) {
    const res = await s.admin('/v1/admin/kpis?' + query);
    assert.equal(res.status, 400, query);
  }
  assert.equal((await s.admin('/v1/admin/kpis?from=2025-10-21&to=2026-10-21')).status, 200, '366 days are allowed');
  const defaults = (await s.admin('/v1/admin/kpis')).json();
  assert.deepEqual(defaults.range, { from: '2026-09-22', to: '2026-10-21', days: 30, band: 'all' });
  assert.equal(defaults.daily.length, 30);
  assert.equal(defaults.totals.sessions, 4);
});

test('live counts sessions seen in the last five minutes and the games they have open', async t => {
  const s = await start(t);
  const live = async () => (await s.admin('/v1/admin/live')).json();
  assert.deepEqual(await live(), { v: 1, windowSec: 300, minSessions: 3, total: { sessions: 0 }, games: [] });
  const ids = ['c00000000001', 'c00000000002', 'c00000000003', 'c00000000004', 'c00000000005', 'c00000000006'];
  for (const id of ids.slice(0, 3)) await s.post(envelope(id, [['go', 1, 'road-hopper', 'featured', 0]]));
  await s.post(envelope(ids[3], [['go', 1, 'road-hopper', 'featured', 0], ['gx', 9, 'road-hopper', 8000, z6, [1, 0, 0, 0]]]));
  for (const id of ids.slice(4)) await s.post(envelope(id, [['go', 1, 'tank-splat', 'catalog', 0]]));
  assert.deepEqual(await live(), { v: 1, windowSec: 300, minSessions: 3, total: { sessions: 6 },
    games: [{ slug: 'road-hopper', sessions: 3 }, { slug: 'tank-splat', suppressed: true }] });
  // A close, a session end and a switch to another game.
  s.clock.now += 4 * 60000;
  await s.post(envelope(ids[0], [['gx', 60, 'road-hopper', 50000, z6, [1, 0, 0, 0]]]));
  await s.post(envelope(ids[4], [['gx', 60, 'tank-splat', 50000, z6, [1, 0, 0, 0]], ['go', 61, 'road-hopper', 'related', 0]]));
  await s.post(envelope(ids[5], [['se', 70, 60000]]));
  assert.deepEqual((await live()).games, [{ slug: 'road-hopper', sessions: 3 }]);
  // Five minutes after their last batch, sessions leave the window.
  s.clock.now += 60000;
  assert.deepEqual(await live(), { v: 1, windowSec: 300, minSessions: 3, total: { sessions: 3 },
    games: [{ slug: 'road-hopper', suppressed: true }] });
  s.clock.now += 4 * 60000 - 1;
  assert.deepEqual((await live()).total, { sessions: 3 });
  s.clock.now += 1;
  assert.deepEqual((await live()).total, { sessions: 0 });
  await s.post(envelope(ids[1], [['lv', 90, 3]]));
  assert.deepEqual(await live(), { v: 1, windowSec: 300, minSessions: 3, total: { suppressed: true }, games: [] });
  s.clock.now += 5 * 60000;
  // A repeated batch is not a sign of life.
  const repeat = envelope('c00000000007', [['go', 1, 'road-hopper', 'featured', 0]]);
  await s.post(repeat);
  s.clock.now += 5 * 60000;
  await s.post(repeat);
  assert.deepEqual((await live()).total, { sessions: 0 });
});

test('retention purges old rows on start and daily; batch ids are kept for 30 days', async t => {
  const s = await start(t);
  const day0 = Date.parse('2026-01-01T12:00:00Z');
  s.clock.now = day0;
  await s.post(envelope('d00000000001', [['lv', 1, 2]]));
  s.clock.now = day0 + DAY_MS;
  await s.post(envelope('d00000000002', [['lv', 1, 3]]));
  s.clock.now = day0 + 30 * DAY_MS;
  assert.deepEqual(s.app.purge(), { cutoff: '2025-08-04', rows: 0, batches: 0 });
  s.clock.now = day0 + 31 * DAY_MS;
  assert.deepEqual(s.app.purge(), { cutoff: '2025-08-05', rows: 0, batches: 1 }, 'the first batch id is forgotten');
  s.clock.now = day0 + 180 * DAY_MS;
  assert.deepEqual(s.app.purge(), { cutoff: '2026-01-01', rows: 0, batches: 1 }, 'exactly 180 days old is kept');
  s.clock.now = day0 + 181 * DAY_MS;
  assert.deepEqual(s.app.purge(), { cutoff: '2026-01-02', rows: 2, batches: 0 }, 'one event row and one session row');
  assert.deepEqual(s.rows('ev_lv').map(r => [r.day, r.level]), [['2026-01-02', 3]]);
  assert.deepEqual(s.rows('session_days').map(r => r.day), ['2026-01-02']);
  assert.equal(s.count('batches'), 0);

  // A restart purges at once.
  await s.app.close();
  const later = createApp({ dbPath: s.dbPath, now: () => day0 + 182 * DAY_MS });
  t.after(() => later.close());
  await later.listen(0, '127.0.0.1');
  assert.equal(later.store.db.prepare('SELECT COUNT(*) AS n FROM ev_lv').get().n, 0);
  assert.equal(later.store.db.prepare('SELECT COUNT(*) AS n FROM session_days').get().n, 0);
  const custom = createApp({ retentionDays: 7, now: () => day0 + 8 * DAY_MS });
  t.after(() => custom.close());
  custom.store.insertBatch({ envelope: envelope('d00000000003', []), events: [['lv', 1, 2]] }, day0);
  assert.equal(custom.purge().rows, 2);
});

test('main.mjs starts from the environment without the SQLite warning and refuses bad settings', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-telemetry-main-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { PATH: process.env.PATH, PORT: '0', HOST: '127.0.0.1', DB_PATH: path.join(dir, 'sub', 't.db'),
    ALLOWED_ORIGINS: ORIGIN + ', null', ADMIN_TOKEN: TOKEN, RETENTION_DAYS: '30', RATE_PER_MIN: '600' };
  const child = spawn(process.execPath, [path.join(repo, 'server/main.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  const exited = new Promise(resolve => child.on('exit', code => resolve(code)));
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', d => { stdout += d; const m = /listening on port (\d+)/.exec(stdout); if (m) resolve(Number(m[1])); });
    child.on('exit', () => reject(new Error('main.mjs exited: ' + stderr)));
  });
  try {
    assert.match(stdout, /2 allowed origin\(s\), admin on, retention 30 days, 600 requests per minute/);
    assert.equal((await request(`http://127.0.0.1:${port}`, 'GET', '/v1/health')).status, 200);
    assert.equal((await request(`http://127.0.0.1:${port}`, 'GET', '/v1/admin/live', { headers: { authorization: 'Bearer ' + TOKEN } })).status, 200);
  } finally {
    child.kill('SIGTERM');
  }
  assert.equal(await exited, 0);
  assert.doesNotMatch(stderr, /ExperimentalWarning|SQLite/);
  assert.ok(fs.existsSync(env.DB_PATH));
  for (const [name, value, message] of [['ALLOWED_ORIGINS', ORIGIN + '/', /not an origin/], ['ALLOWED_ORIGINS', 'school.example', /not an origin/],
    ['ADMIN_TOKEN', 'short', /at least 16/], ['ADMIN_TOKEN', 'ü'.repeat(20), /printable ASCII/],
    ['RETENTION_DAYS', '0', /RETENTION_DAYS/], ['RETENTION_DAYS', '1000000000', /RETENTION_DAYS must be a whole number from 1 to 36500/],
    ['PORT', '70000', /PORT must be a whole number from 0 to 65535/],
    ['RATE_PER_MIN', 'many', /RATE_PER_MIN/]]) {
    const run = spawnSync(process.execPath, [path.join(repo, 'server/main.mjs')], { env: { ...env, [name]: value }, encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 1, name + '=' + value);
    assert.match(run.stderr, message);
  }
});

test('the build refuses to write its output into server/', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'school-games-telemetry-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'tools/lib'), { recursive: true });
  fs.copyFileSync(path.join(repo, 'tools/build.mjs'), path.join(root, 'tools/build.mjs'));
  for (const helper of ['svg-data-uri.mjs', 'zip.mjs']) fs.copyFileSync(path.join(repo, 'tools/lib', helper), path.join(root, 'tools/lib', helper));
  fs.mkdirSync(path.join(root, 'server'));
  fs.writeFileSync(path.join(root, 'server/main.mjs'), '// canary');
  for (const out of ['server', 'server/site']) {
    const run = spawnSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--no-minify', '--out', out], { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.notEqual(run.status, 0, out);
    assert.match(run.stderr, /refusing a source or protected output directory/);
  }
  assert.deepEqual(fs.readdirSync(path.join(root, 'server')), ['main.mjs']);
});
