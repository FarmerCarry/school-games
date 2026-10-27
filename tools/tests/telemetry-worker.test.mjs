// The Cloudflare Worker entry (server/worker.mjs) driven with real Fetch-API Requests,
// with env.DB a D1-style database over node:sqlite (server/sqlite-d1.mjs) and env.ASSETS a
// stub: D1's free-plan limits per invocation (the request that upgrades the database does
// only that and is answered 503), the batch interval and the usage meter; and two checks
// against earlier servers from Git: the same simulated batches give milestone 2's KPIs
// (git show 743e5ec), and a database of the first server (git show 6866861) is upgraded
// with the same KPIs.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// sqlite-d1.mjs hides node:sqlite's ExperimentalWarning before it loads node:sqlite.
const { openDatabase } = await import('../../server/sqlite-d1.mjs');
const { default: worker } = await import('../../server/worker.mjs');
const { openStore, TABLES, SCHEMA_VERSION } = await import('../../server/store.mjs');
const { validateBatch } = await import('../../server/schema.mjs');
const { history } = await import('../../server/simulate.mjs');

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(repo, 'server/fixtures/sample-batch.json'), 'utf8'));
const fixture3 = JSON.parse(fs.readFileSync(path.join(repo, 'server/fixtures/sample-batch-v3.json'), 'utf8'));
const wrangler = JSON.parse(fs.readFileSync(path.join(repo, 'server/wrangler.json'), 'utf8'));
const ORIGIN = 'https://farmercarry.github.io';
const TOKEN = 'worker-admin-token-0123456789';
const BASE = 'https://school-games-telemetry.example.workers.dev';
const DAY_MS = 86400000;
const START = Date.parse('2026-10-20T09:15:00Z');
const z6 = [0, 0, 0, 0, 0, 0], z4 = [0, 0, 0, 0];
const ctx = { waitUntil() {}, passThroughOnException() {} };
const U = '3f9a0c51e2b7', P = '8c21d0e94a6f';

let batchSeq = 0;
const batchId = () => (0xe000000000000000n + BigInt(++batchSeq)).toString(16);
const envelope = (s, ev, extra = {}) => ({ v: 2, b: batchId(), s, k: 'src', m: 'web', a: '6-7', d: [4, 4, 1920], ev, ...extra });
const envelope3 = (s, ev, extra = {}) => ({ v: 3, b: batchId(), s, k: 'src', m: 'web', a: '8-9', d: [4, 4, 1920], u: U, p: P, z: '', ev,
  w: Math.max(0, ...ev.map(e => e[1])) + 5, ...extra });

// Brings a database to the current schema, as the first requests after a deploy do.
async function upgrade(db, now = Date.now()) {
  const store = openStore(db);
  while (await store.setup(now) === 'migrated');
}
// The bindings and variables wrangler.json gives the Worker, with a test database (at the
// current schema unless fresh) and password.
async function makeEnv(extra = {}, { fresh = false } = {}) {
  const assets = [];
  const env = {
    ...wrangler.vars, ADMIN_TOKEN: TOKEN, DB: openDatabase(':memory:'),
    ASSETS: {
      async fetch(request) {
        assets.push(request.method + ' ' + new URL(request.url).pathname);
        return new Response('<!doctype html><title>asset</title>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    },
    assets, ...extra
  };
  if (!fresh && env.DB) await upgrade(env.DB);
  return env;
}
// A database as milestone 2 left it (schema 3: the daily aggregates, seen and the old live table).
async function milestone2(db) {
  const keyList = key => ['day', 'a', ...key].join(', ');
  await db.batch([
    'CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL) STRICT, WITHOUT ROWID',
    'CREATE TABLE batches (b TEXT PRIMARY KEY, day TEXT NOT NULL) STRICT, WITHOUT ROWID',
    'CREATE TABLE seen (day TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, s TEXT NOT NULL, PRIMARY KEY (day, kind, key, s)) STRICT, WITHOUT ROWID',
    'CREATE TABLE live (s TEXT PRIMARY KEY, slug TEXT NOT NULL, seen_minute INTEGER NOT NULL) STRICT, WITHOUT ROWID',
    'CREATE TABLE kpi_cache (key TEXT PRIMARY KEY, made TEXT NOT NULL, rows TEXT NOT NULL) STRICT, WITHOUT ROWID',
    ...Object.entries(TABLES).map(([table, { key, sums }]) => `CREATE TABLE ${table} (day TEXT NOT NULL, a TEXT NOT NULL, ` +
      key.map(c => `${c} ${['slug', 'id', 'src'].includes(c) ? 'TEXT' : 'INTEGER'} NOT NULL, `).join('') +
      sums.map(c => `${c} INTEGER NOT NULL DEFAULT 0, `).join('') + `PRIMARY KEY (${keyList(key)})) STRICT, WITHOUT ROWID`),
    "INSERT INTO meta (key, value) VALUES ('schema', 3)",
    "INSERT INTO agg_days (day, a, sessions, opens) VALUES ('2026-10-19', '6-7', 3, 4)"
  ].map(text => db.prepare(text)));
  return db;
}
async function call(env, method, pathname, { headers = {}, body, ip = '203.0.113.9' } = {}) {
  const request = new Request(BASE + pathname, { method, body, headers: { ...(ip ? { 'CF-Connecting-IP': ip } : {}), ...headers } });
  const res = await worker.fetch(request, env, ctx);
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, json: () => JSON.parse(text) };
}
const post = (env, body, { origin = ORIGIN, ...rest } = {}) => call(env, 'POST', '/v1/batch', {
  ...rest, body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...(origin ? { Origin: origin } : {}), ...rest.headers }
});
const admin = (env, pathname, token = TOKEN) => call(env, 'GET', pathname, { headers: { Authorization: 'Bearer ' + token } });
const rows = async (env, table) => (await env.DB.prepare(`SELECT * FROM ${table}`).all()).results;
const scheduled = (env, cron = wrangler.triggers.crons[0]) => worker.scheduled({ scheduledTime: Date.now(), cron }, env, ctx);
// The Worker reads the time from Date.now(); the test moves it with clock.now.
function useClock(t) {
  const clock = { now: START };
  t.mock.method(Date, 'now', () => clock.now);
  return clock;
}
// The statements each piece of work prepares: D1's free plan allows 50 per invocation.
function counted(env) {
  const prepare = env.DB.prepare.bind(env.DB), counter = { n: 0, sql: [] };
  env.DB.prepare = sql => { counter.n++; counter.sql.push(sql); return prepare(sql); };
  return async work => { counter.n = 0; counter.sql = []; const result = await work(); return { n: counter.n, sql: counter.sql, result }; };
}

test('the Node driver binds values the way D1 does, so the tests see what D1 would do', async () => {
  const db = openDatabase(':memory:');
  // D1 binds every number, and a boolean, as REAL (wrangler dev: typeof(?1) is 'real').
  assert.deepEqual((await db.prepare('SELECT ?1 / 2 AS x, typeof(?1) AS a, typeof(?2) AS b').bind(7, true).all()).results,
    [{ x: 3.5, a: 'real', b: 'real' }]);
  // A STRICT INTEGER column still stores a whole number as an integer, and refuses 1.5.
  await db.prepare('CREATE TABLE t (v INTEGER NOT NULL) STRICT').run();
  await db.prepare('INSERT INTO t (v) VALUES (?1)').bind(5).run();
  assert.deepEqual((await db.prepare('SELECT v, typeof(v) AS t FROM t').all()).results, [{ v: 5, t: 'integer' }]);
  await assert.rejects(db.prepare('INSERT INTO t (v) VALUES (?1)').bind(1.5).run(), /^Error: D1_ERROR: cannot store REAL value/);
  for (const value of [undefined, 5n, {}]) assert.throws(() => db.prepare('SELECT ?1').bind(value), /^TypeError: D1_TYPE_ERROR/);
  // D1 runs every statement of one prepare and answers with the last; node:sqlite would run
  // only the first, so the driver refuses more than one.
  await assert.rejects(db.prepare('SELECT 1 AS a; SELECT 2 AS b').all(), /^Error: D1_ERROR: one statement per query/);
  assert.deepEqual((await db.prepare('SELECT 1 AS a; -- a comment\n').all()).results, [{ a: 1 }]);
});


test('the Node driver bills what D1 bills: a row per index entry written, and the database size', async () => {
  const db = openDatabase(':memory:');
  await db.batch([db.prepare('CREATE TABLE a (k TEXT PRIMARY KEY, v INTEGER) STRICT, WITHOUT ROWID'),
    db.prepare('CREATE TABLE b (id INTEGER PRIMARY KEY, s TEXT NOT NULL UNIQUE, u TEXT, t INTEGER)'),
    db.prepare('CREATE INDEX b_u ON b (u, t)'), db.prepare('CREATE INDEX b_t ON b (t)')]);
  const results = await db.batch([
    db.prepare("INSERT INTO a VALUES ('x', 1), ('y', 2)"), db.prepare("INSERT INTO b (s, u, t) VALUES ('s1', 'u', 1)"),
    db.prepare("INSERT INTO b (s, u, t) VALUES ('s1', 'u', 2) ON CONFLICT (s) DO UPDATE SET t = excluded.t"),
    db.prepare("UPDATE b SET u = 'v' WHERE s = 's1'"), db.prepare("DELETE FROM a WHERE k = 'x'"), db.prepare('SELECT * FROM b'),
    db.prepare("INSERT OR IGNORE INTO a VALUES ('y', 1) RETURNING k"), db.prepare("INSERT INTO a VALUES ('z', 3) RETURNING k")
  ]);
  // A WITHOUT ROWID table is its primary key; b has UNIQUE (s) and two indexes.
  assert.deepEqual(results.map(r => [r.meta.changes, r.meta.rows_written, r.meta.rows_read]),
    [[2, 2, 0], [1, 4, 0], [1, 4, 0], [1, 4, 0], [1, 1, 0], [0, 0, 1], [0, 0, 0], [1, 1, 1]]);
  const size = db.sqlite.prepare('SELECT page_count * page_size AS n FROM pragma_page_count(), pragma_page_size()').get().n;
  assert.ok(size > 0 && results.every(r => r.meta.size_after === size));
  // A new index is billed from the next statement on.
  await db.prepare('CREATE INDEX a_v ON a (v)').run();
  assert.equal((await db.prepare("INSERT INTO a VALUES ('w', 4)").run()).meta.rows_written, 2);
});

test('wrangler.json binds what the Worker reads and keeps request logs off', () => {
  assert.equal(wrangler.main, 'worker.mjs');
  assert.deepEqual(wrangler.d1_databases, [{ binding: 'DB', database_name: 'school-games-telemetry' }], 'no database_id: Wrangler provisions it');
  assert.deepEqual(wrangler.assets, { directory: './dashboard', binding: 'ASSETS' });
  assert.deepEqual(wrangler.vars, { ALLOWED_ORIGINS: ORIGIN, RETENTION_DAYS: '180' });
  assert.deepEqual(wrangler.observability, { enabled: false });
  assert.ok(Date.parse(wrangler.compatibility_date) <= Date.now() - 14 * DAY_MS, 'a compatibility date at least two weeks old');
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'server/package.json'), 'utf8'));
  assert.deepEqual(pkg.devDependencies, { wrangler: '4.149.0' });
  assert.equal(pkg.dependencies, undefined, 'no runtime dependency');
  assert.deepEqual(Object.keys(pkg.cloudflare.bindings).sort(), ['ADMIN_TOKEN', 'DB']);
  assert.equal(fs.readFileSync(path.join(repo, 'server/.dev.vars.example'), 'utf8'), 'ADMIN_TOKEN=\n', 'the password is asked for, never suggested');
  const lock = JSON.parse(fs.readFileSync(path.join(repo, 'server/package-lock.json'), 'utf8'));
  assert.equal(lock.packages['node_modules/wrangler'].version, '4.149.0');
  // The folder is deployed on its own: nothing it imports lives outside it.
  for (const file of fs.readdirSync(path.join(repo, 'server')).filter(name => name.endsWith('.mjs'))) {
    const source = fs.readFileSync(path.join(repo, 'server', file), 'utf8');
    for (const [, spec] of source.matchAll(/^import\s[^;]*?from\s+'([^']+)'|\bimport\(\s*'([^']+)'/gm).map(m => [m[0], m[1] ?? m[2]])) {
      assert.ok(spec.startsWith('./') || spec.startsWith('node:'), `${file} imports ${spec}`);
    }
  }
});


test('the Worker stores a batch from the portal once, with CORS and the batch interval for the portal only', async t => {
  useClock(t);
  const env = await makeEnv();
  const res = await post(env, fixture);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(res.headers.get('access-control-expose-headers'), 'Retry-After, X-Batch-Every');
  assert.equal(res.headers.get('x-batch-every'), '60');
  assert.equal(res.headers.get('access-control-allow-credentials'), null);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('vary'), /\bOrigin\b/);
  const before = await rows(env, 'st_rounds');
  assert.equal((await post(env, fixture)).status, 204, 'a repeat is answered the same');
  assert.deepEqual(await rows(env, 'st_rounds'), before, 'and adds nothing');
  assert.deepEqual(await rows(env, 'batches'), [{ b: fixture.b, day: '2026-10-20' }]);
  assert.equal((await rows(env, 'st_visits')).length, 2);
  // v3 needs no batch id: its repeat changes nothing either.
  assert.equal((await post(env, fixture3)).status, 204);
  const facts = JSON.stringify(await Promise.all(['st_sessions', 'st_visits', 'st_rounds', 'st_marks', 'st_students'].map(table => rows(env, table))));
  assert.equal((await post(env, fixture3)).status, 204);
  assert.equal(JSON.stringify(await Promise.all(['st_sessions', 'st_visits', 'st_rounds', 'st_marks', 'st_students'].map(table => rows(env, table)))), facts);
  assert.deepEqual((await rows(env, 'batches')).length, 1);

  for (const origin of ['https://evil.example', 'http://farmercarry.github.io', 'null']) {
    const denied = await post(env, { ...fixture, b: batchId() }, { origin });
    assert.equal(denied.status, 403, origin);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    assert.equal(denied.headers.get('x-batch-every'), null);
  }
  assert.equal((await post(env, { ...fixture, b: batchId() }, { origin: '' })).status, 204, 'tools send no Origin');
  const preflight = await call(env, 'OPTIONS', '/v1/admin/kpis', { headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type, Authorization');
  assert.equal((await call(env, 'OPTIONS', '/v1/batch', { headers: { Origin: 'https://evil.example' } })).headers.get('access-control-allow-methods'), null);
  assert.equal((await post(env, 'not json')).status, 400);
  assert.equal((await post(env, fixture, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 415);
  assert.equal((await post(env, 'x'.repeat(64 * 1024 + 1))).status, 413);
  const streamed = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(40000).fill(32)); } });
  const request = new Request(BASE + '/v1/batch', { method: 'POST', body: streamed, duplex: 'half', headers: { 'Content-Type': 'text/plain' } });
  assert.equal((await worker.fetch(request, env, ctx)).status, 413, 'an endless body stops at 64 KB');
  assert.equal((await call(env, 'GET', '/v1/batch')).status, 405);
  assert.deepEqual((await call(env, 'GET', '/v1/health')).json(), { ok: true, accepts: [2, 3], schema: SCHEMA_VERSION });
});

test('without a valid ADMIN_TOKEN secret the admin endpoints answer 404 and say why; batches still count', async t => {
  for (const secret of [undefined, '', 'short', 'has a space in it 0123456789', 'ü'.repeat(20)]) {
    const env = await makeEnv({ ADMIN_TOKEN: secret });
    for (const pathname of ['/v1/admin/kpis', '/v1/admin/live']) {
      const res = await admin(env, pathname, secret || TOKEN);
      assert.equal(res.status, 404, `${secret} ${pathname}`);
      assert.deepEqual(res.json(), { error: 'admin password not set' });
    }
    assert.equal((await post(env, { ...fixture, b: batchId() })).status, 204);
  }
  const env = await makeEnv();
  const none = await call(env, 'GET', '/v1/admin/kpis');
  assert.equal(none.status, 401);
  assert.match(none.headers.get('www-authenticate'), /^Bearer/);
  assert.equal((await admin(env, '/v1/admin/kpis', TOKEN + 'x')).status, 401);
  assert.equal((await admin(env, '/v1/admin/kpis', TOKEN.slice(1))).status, 401);
  const ok = await admin(env, '/v1/admin/kpis');
  assert.equal(ok.status, 200);
  assert.equal(ok.json().v, 1);
  assert.equal((await call(env, 'POST', '/v1/admin/live', { headers: { Authorization: 'Bearer ' + TOKEN } })).status, 405);
});

test('KPIs and live through the Worker; the daily cron forgets old batch ids and live rows', async t => {
  const clock = useClock(t);
  const env = await makeEnv();
  const ids = ['f00000000001', 'f00000000002', 'f00000000003'];
  for (const [i, s] of ids.entries()) {
    assert.equal((await post(env, envelope(s, [
      ['ss', 0, 0, 1, 1, 2], ['go', 1, 'road-hopper', 'featured', 0], ['ld', 2, 'road-hopper', 900 + i * 100],
      ['rs', 3, 'road-hopper', 'L1', 2, 0], ['re', 30, 'road-hopper', i ? 'w' : 'q', 'L1', 27000, 10, 2, 5, 1, [1, 2, 1, 1, 0, 0]]
    ]))).status, 204);
  }
  const live = (await admin(env, '/v1/admin/live')).json();
  assert.deepEqual(live, { v: 1, windowSec: 300, minSessions: 3, total: { sessions: 3 }, games: [{ slug: 'road-hopper', sessions: 3 }] });
  const kpis = (await admin(env, '/v1/admin/kpis?from=2026-10-20&to=2026-10-20')).json();
  assert.deepEqual(kpis.totals, {
    sessions: 3, engagedMinutes: 0, avgEngagedMinutesPerSession: 0, gameOpens: 3, roundsStarted: 3, roundsEnded: 3, levelUps: 0, errors: 0,
    players: { sessionStarts: 3, newProfiles: 0, guests: 0, profileAge: [0, 3, 0, 0], daysSinceLast: [0, 3, 0, 0, 0] }
  });
  const game = kpis.games[0];
  assert.deepEqual([game.slug, game.sessions, game.opens, game.rounds.codes, game.completionRate, game.dropOffRate, game.avgLoadMs, game.avgTier],
    ['road-hopper', 3, 3, { w: 2, l: 0, d: 0, e: 0, q: 1 }, 0.6667, 0.3333, 1000, 2]);
  assert.deepEqual(kpis.bands, [{ band: '6-7', sessions: 3, opens: 3, engagedMinutes: 0, games: [
    { slug: 'road-hopper', sessions: 3, opens: 3, share: 1, avgTier: 2, completionRate: 0.6667, winRate: 1, dropOffRate: 0.3333, engagedMinutes: 0, starts: 3 }
  ] }]);
  assert.equal((await admin(env, '/v1/admin/kpis?from=2026-10-21&to=2026-10-20')).status, 400);

  // Ten minutes later the live rows are gone; 31 days later the batch ids are too.
  clock.now += 10 * 60000;
  await scheduled(env);
  assert.deepEqual(await rows(env, 'live'), []);
  assert.equal((await rows(env, 'batches')).length, 3);
  clock.now += 31 * DAY_MS;
  await scheduled(env);
  assert.deepEqual(await rows(env, 'batches'), []);
});

test('with no request at all, a live row is gone within 10 minutes: a cron sweeps every 5 minutes', async t => {
  const clock = useClock(t);
  const env = await makeEnv(), every5 = '*/5 * * * *', measure = counted(env);
  assert.ok(wrangler.triggers.crons.includes(every5), 'wrangler.json: ' + wrangler.triggers.crons);
  assert.equal((await post(env, fixture)).status, 204);
  const sweep = () => measure(() => worker.scheduled({ scheduledTime: Date.now(), cron: every5 }, env, ctx));
  // The cron fires at minutes 0, 5, 10...: a batch at 09:15 is swept at 09:20 at the latest.
  clock.now = Date.parse('2026-10-20T09:19:00Z');
  await sweep();
  assert.equal((await rows(env, 'live')).length, 1, 'still in the window');
  clock.now = Date.parse('2026-10-20T09:20:00Z');
  const { sql } = await sweep();
  assert.ok(sql.includes('DELETE FROM live WHERE seen_minute <= ?1'));
  // With the settings read every 5 minutes and the usage flush; the daily purge waits for its own cron.
  assert.ok(sql.every(text => /^DELETE FROM live |^INSERT INTO usage |^SELECT \(SELECT value FROM meta/.test(text)), sql.join('\n'));
  assert.deepEqual(await rows(env, 'live'), []);
});

test('the soft rate limit is keyed by CF-Connecting-IP, in memory only', async () => {
  const env = await makeEnv({ RATE_PER_MIN: '2' });
  assert.equal((await call(env, 'GET', '/v1/health', { ip: '198.51.100.1' })).status, 200);
  assert.equal((await post(env, { ...fixture, b: batchId() }, { ip: '198.51.100.1' })).status, 204);
  const limited = await post(env, { ...fixture, b: batchId() }, { ip: '198.51.100.1' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '30');
  assert.equal(limited.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal((await call(env, 'GET', '/v1/health', { ip: '198.51.100.2' })).status, 200, 'another school has its own bucket');
  assert.equal((await call(env, 'GET', '/', { ip: '198.51.100.1' })).status, 429, 'what reaches the Worker counts');
  // The same bindings keep the same bucket from one request to the next.
  assert.equal((await call({ ...env }, 'GET', '/v1/health', { ip: '198.51.100.1' })).status, 429);
  const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map(r => r.name);
  const all = JSON.stringify(await Promise.all(tables.map(table => rows(env, table))));
  assert.doesNotMatch(all, /198\.51\.100/, 'no address is stored');
});

test('paths outside /v1/ go to the static assets; the API never does', async () => {
  const env = await makeEnv();
  const page = await call(env, 'GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.text, /<title>asset<\/title>/);
  assert.equal((await call(env, 'HEAD', '/app.js')).status, 200);
  assert.equal((await call(env, 'GET', '/v1/nothing')).status, 404);
  assert.equal((await call(env, 'GET', '/v1')).status, 404);
  assert.equal((await call(env, 'POST', '/')).status, 404);
  assert.deepEqual(env.assets, ['GET /', 'HEAD /app.js']);
  const bare = await makeEnv({ ASSETS: undefined });
  assert.equal((await call(bare, 'GET', '/')).status, 404);
});


test('a missing DB binding is an internal error for the API only, logged without the request', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const env = await makeEnv({ DB: undefined });
  assert.equal((await call(env, 'GET', '/v1/health')).status, 200);
  const res = await post(env, { ...fixture, b: batchId() });
  assert.equal(res.status, 500);
  assert.deepEqual(res.json(), { error: 'server' });
  assert.equal(logged.mock.callCount(), 1);
  assert.match(logged.mock.calls[0].arguments[0], /^telemetry: request failed: the D1 binding DB is missing/);
  assert.doesNotMatch(logged.mock.calls[0].arguments[0], /203\.0\.113|farmercarry|5d02be9a41c7/);
  assert.equal((await call(env, 'GET', '/')).status, 200, 'the dashboard still loads');
});


test('every invocation stays inside D1\'s free limits: the upgrade alone (503), then a batch and an admin request at most 20 statements, the crons 35 and 25', async t => {
  const clock = useClock(t);
  // A new database: the first request creates schema 4 and does nothing else.
  const env = await makeEnv({}, { fresh: true }), measure = counted(env);
  let { n, result: res } = await measure(() => post(env, fixture));
  assert.equal(res.status, 503);
  assert.deepEqual(res.json(), { error: 'updating' });
  assert.equal(res.headers.get('retry-after'), '2');
  assert.equal(res.headers.get('access-control-expose-headers'), 'Retry-After, X-Batch-Every', 'the page can read the wait');
  assert.ok(n <= 45, `the upgrade took ${n} statements`);
  assert.deepEqual((await rows(env, 'meta'))[0], { key: 'schema', value: SCHEMA_VERSION });
  assert.deepEqual(await rows(env, 'st_sessions'), [], 'nothing else happened');
  // The portal sends the batch again.
  ({ n, result: res } = await measure(() => post(env, fixture)));
  assert.equal(res.status, 204);
  assert.ok(n <= 20, `the first batch after the upgrade took ${n} statements`);

  // Milestone 2's database: an admin request meets the upgrade and gets the same answer.
  const old = await makeEnv({ DB: await milestone2(openDatabase(':memory:')) }, { fresh: true }), measureOld = counted(old);
  ({ n, result: res } = await measureOld(() => admin(old, '/v1/admin/kpis')));
  assert.deepEqual([res.status, res.headers.get('retry-after'), res.json()], [503, '2', { error: 'updating' }]);
  assert.ok(n <= 45, `the upgrade from schema 3 took ${n} statements`);
  assert.equal((await rows(old, 'agg_days')).length, 1, 'the frozen totals stay');
  // The worst first batch of an instance: a late session (a rolled day) from a PC that
  // reports the zone first, its student with a removed profile and an older code, over 200
  // events of every kind.
  await old.DB.batch([old.DB.prepare("UPDATE settings SET value = '2026-10-18' WHERE key = 'facts_since'"),
    old.DB.prepare("UPDATE settings SET value = '2026-10-19' WHERE key = 'rolled_through'"),
    old.DB.prepare("INSERT INTO roll_days (day, dirty, rolled_s) VALUES ('2026-10-19', 0, 1)"),
    old.DB.prepare("INSERT INTO st_students (u, label, first_s, last_s, band_first, band_last) VALUES ('77aa00bb11cc', '77AA', 1, 1, '', '')")]);
  const games = Array.from({ length: 38 }, (_, i) => 'game-' + i);
  const wide = envelope3('f0000000000a', [['ss', 0, 0, 30, 1, 5, 7, 1], ['pr', 0, '77aa00bb11cc'], ['cd', 0, '1b2c3d4e5f60'], ['ct', 1, 's', 20],
    ...games.flatMap((slug, i) => [['go', 2 + i, i + 1, slug, 'catalog', 1, 0], ['rs', 2 + i, i + 1, 1, slug, 'L1', 1, 0],
      ['re', 3 + i, i + 1, 1, slug, 'w', 'L1', 9000, 5, 1, 2, 1, z6, null], ['tu', 3 + i, i + 1, slug, 's'], ['gx', 4 + i, i + 1, slug, 9000, z6, z4]]),
    ['lv', 60, 6], ['se', 61, 50000, 'p']], { z: 'Asia/Riyadh', w: DAY_MS / 1000 });
  assert.equal(wide.ev.length, 196);
  wide.ev.push(['fv', 62, 1, 'game-0', 1], ['gp', 62, 1, 'game-0', 9000], ['ld', 62, 1, 'game-0', 500], ['er', 62, 1, 'game-0', 'x']);
  assert.equal(validateBatch(wide).dropped, 0);
  clock.now += 5000;
  // A new instance (other settings): its first statement reads the schema and the settings.
  const next = { ...old, RATE_PER_MIN: '600' }, measureNext = counted(next);
  ({ n, result: res } = await measureNext(() => post(next, wide)));
  assert.equal(res.status, 204);
  assert.ok(n <= 20, `the worst batch took ${n} statements`);
  assert.deepEqual((await rows(next, 'roll_days')).map(r => r.dirty), [2], 'it marked the late day, then the zone change rebuilt it');
  assert.equal((await rows(next, 'st_rounds')).length, 38);
  // 200 events over 100 games and levels (v2): still one statement per table.
  const v2wide = envelope('f00000000009', [
    ...Array.from({ length: 100 }, (_, i) => ['go', i, 'game-' + i, 'catalog', 0]),
    ...Array.from({ length: 100 }, (_, i) => ['rs', i, 'game-' + i, 'L' + (i % 50 + 1), 1, 0])
  ]);
  ({ n, result: res } = await measureNext(() => post(next, v2wide)));
  assert.equal(res.status, 204);
  assert.ok(n <= 20, `a wide v2 batch took ${n} statements`);
  // Admin requests and the crons.
  for (const [label, work, limit] of [['kpis', () => admin(next, '/v1/admin/kpis?from=2026-07-23&to=2026-10-20'), 20],
    ['live', () => admin(next, '/v1/admin/live'), 20], ['sweep', () => scheduled(next, '*/5 * * * *'), 35], ['purge', () => scheduled(next, '23 3 * * *'), 25]]) {
    clock.now += 6 * 60000;
    const counts = await measureNext(work);
    assert.ok(counts.n <= limit, `${label} took ${counts.n} statements`);
    if (counts.result) assert.equal(counts.result.status, 200, label);
  }
});

test('X-Batch-Every tells the PCs to wait longer as the day\'s writes near the free limit, and the page can read it', async t => {
  useClock(t);
  for (const [writes, every] of [[0, '60'], [59900, '60'], [60001, '180'], [79900, '180'], [80001, '300'], [99000, '300']]) {
    const env = await makeEnv();
    await env.DB.prepare("INSERT INTO usage (day, writes) VALUES ('2026-10-20', ?1)").bind(writes).run();
    const res = await post(env, { ...fixture, b: batchId() });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('x-batch-every'), every, String(writes));
    assert.match(res.headers.get('access-control-expose-headers'), /\bX-Batch-Every\b/);
  }
});

test('the usage meter adds up the rows of every result and writes them once a minute, so the guards see every instance', async t => {
  const clock = useClock(t);
  const env = await makeEnv(), batch = env.DB.batch.bind(env.DB), sums = [];
  let flushes = 0;
  env.DB.batch = async statements => {
    const results = await batch(statements);
    sums.push([results.reduce((n, r) => n + r.meta.rows_written, 0), results.reduce((n, r) => n + r.meta.rows_read, 0)]);
    if (statements.some(st => st.sql.startsWith('INSERT INTO usage'))) flushes++;
    return results;
  };
  for (let i = 0; i < 6; i++) {
    assert.equal((await post(env, envelope('f1000000000' + i, [['ss', 0, 0, 1, 1, 2], ['go', 1, 'road-hopper', 'featured', 0]]))).status, 204);
    clock.now += 9000;
  }
  assert.equal(flushes, 1, 'once in the first minute');
  clock.now = START + 5 * 60000;
  await scheduled(env, '*/5 * * * *');
  assert.equal(flushes, 2);
  // Everything but the last call's own counts (they wait for the next flush) is in the table.
  const [usage] = await rows(env, 'usage');
  const total = i => sums.slice(0, -1).reduce((n, s) => n + s[i], 0);
  assert.deepEqual([usage.day, usage.writes, usage.reads], ['2026-10-20', total(0), total(1)]);
  assert.ok(usage.size > 0);
});

// The earlier stores, from Git (CI checkouts without history skip these comparisons).
function fromGit(commit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-store-' + commit + '-'));
  for (const file of ['store.mjs', 'schema.mjs']) {
    const shown = spawnSync('git', ['show', `${commit}:server/${file}`], { cwd: repo, encoding: 'utf8' });
    if (shown.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); return null; }
    fs.writeFileSync(path.join(dir, file), shown.stdout);
  }
  return dir;
}
const M2 = '743e5ec', FIRST = '6866861';
const m2Dir = fromGit(M2), firstDir = fromGit(FIRST);
const skipM2 = !m2Dir && `commit ${M2} is not in this checkout (git show failed), so milestone 2's store cannot be compared`;
const skipFirst = !firstDir && `commit ${FIRST} is not in this checkout (git show failed), so the first store cannot be compared`;
after(() => { for (const dir of [m2Dir, firstDir]) if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

// Several days of simulated school sessions in every band, none crossing midnight.
const TODAY = Date.parse('2026-10-23T00:00:00Z');
const simulated = () => [...history({ days: 6, sessions: 45, seed: 11, today: TODAY })];
const QUERIES = [];
for (const band of [null, '6-7', '8-9', '10-11', '']) {
  for (const [from, to] of [['2026-10-18', '2026-10-23'], ['2026-10-20', '2026-10-20'], ['2026-10-18', '2026-10-19'],
    ['2026-10-19', '2026-10-21'], ['2026-09-24', '2026-10-23'], ['2026-10-24', '2026-10-30']]) QUERIES.push({ from, to, band });
}

test('the same v2 batches give milestone 2\'s KPIs, every group of them, from the facts with the school\'s zone UTC', { skip: skipM2 }, async () => {
  const { openStore: openM2 } = await import(pathToFileURL(path.join(m2Dir, 'store.mjs')).href);
  const { validateBatch: validateM2 } = await import(pathToFileURL(path.join(m2Dir, 'schema.mjs')).href);
  const batches = simulated();
  const days = new Map();
  for (const { batch, now } of batches) (days.get(batch.s) || days.set(batch.s, new Set()).get(batch.s)).add(new Date(now).toISOString().slice(0, 10));
  assert.ok([...days.values()].every(set => set.size === 1), 'no session crosses midnight');
  assert.deepEqual(new Set(batches.map(b => b.batch.a)), new Set(['6-7', '8-9', '10-11', '']), 'every band');
  assert.ok(batches.length > 500, batches.length + ' batches');
  const m2 = openM2(openDatabase(':memory:')), store = openStore(openDatabase(':memory:'));
  for (const { batch, now } of batches) {
    const old = validateM2(batch);
    assert.equal(await store.ingest(validateBatch(batch), now), await m2.ingest(old.envelope, old.events, now));
  }
  // Repeats are refused by both.
  for (const { batch, now } of batches.slice(0, 20)) {
    const old = validateM2(batch);
    assert.equal(await store.ingest(validateBatch(batch), now + 3600000), false);
    assert.equal(await m2.ingest(old.envelope, old.events, now + 3600000), false);
  }
  let shown = 0, suppressed = 0;
  for (const query of QUERIES) {
    const expected = JSON.parse(JSON.stringify(await m2.kpis(query, TODAY + 13 * 3600000)));
    assert.deepEqual(await store.kpis(query, TODAY + 13 * 3600000), expected, JSON.stringify(query));
    const text = JSON.stringify(expected);
    shown += (text.match(/"sessions":/g) || []).length;
    suppressed += (text.match(/"suppressed":true/g) || []).length;
  }
  assert.ok(shown > 1000 && suppressed > 100, `the comparison covers shown (${shown}) and hidden (${suppressed}) groups`);
});

test('the frozen days before the update are read from the aggregates once, whichever instance asks, until the daily purge', { skip: skipM2 }, async () => {
  // Milestone 2 filled the database; Cloudflare may answer each dashboard refresh from a new instance, with nothing in memory.
  const { openStore: openM2 } = await import(pathToFileURL(path.join(m2Dir, 'store.mjs')).href);
  const { validateBatch: validateM2 } = await import(pathToFileURL(path.join(m2Dir, 'schema.mjs')).href);
  const db = openDatabase(':memory:'), m2 = openM2(db);
  for (const { batch, now } of simulated()) { const old = validateM2(batch); await m2.ingest(old.envelope, old.events, now); }
  const query = { from: '2026-09-24', to: '2026-10-23', band: null }, now = TODAY + 13 * 3600000;
  const expected = JSON.parse(JSON.stringify(await m2.kpis(query, now)));
  await upgrade(db, now);
  const scans = [], execute = db.execute.bind(db);
  db.execute = (statement, ...rest) => {
    if (/GROUP BY/.test(statement.sql) && /FROM agg_/.test(statement.sql)) scans.push(statement.params.slice(0, 2).join('..'));
    return execute(statement, ...rest);
  };
  const first = openStore(db);
  assert.deepEqual(await first.kpis(query, now), expected);
  assert.deepEqual([...new Set(scans)], ['2026-09-24..2026-10-23']);
  scans.length = 0;
  for (const [i, other] of [openStore(db), openStore(db)].entries()) assert.deepEqual(await other.kpis(query, now + (i + 1) * 300000), expected);
  assert.deepEqual(scans, [], 'new instances read the kept rows');
  // The next day's purge lets the next query read them again.
  await first.purge(now + DAY_MS);
  await openStore(db).kpis(query, now + 60000);
  assert.deepEqual([...new Set(scans)], ['2026-09-24..2026-10-23']);
});

test('a session that crosses midnight counts once, on the school\'s day it started', async () => {
  const store = openStore(openDatabase(':memory:'));
  const late = Date.parse('2026-10-20T23:58:00Z');
  for (const [s, offset] of [['a10000000001', 0], ['a10000000002', 0], ['a10000000003', 0], ['a10000000001', 5 * 60000]]) {
    await store.ingest(validateBatch(envelope(s, [['go', 1, 'road-hopper', 'featured', 0]])), late + offset);
  }
  const kpis = await store.kpis({ from: '2026-10-20', to: '2026-10-21', band: null }, late + 10 * 60000);
  assert.equal(kpis.totals.sessions, 3);
  assert.deepEqual(kpis.daily.map(d => [d.day, d.sessions]), [['2026-10-20', 3], ['2026-10-21', 0]]);
  // In Riyadh the same evening is after midnight already: those sessions count on the 21st there.
  const riyadh = openStore(openDatabase(':memory:'));
  await riyadh.ingest(validateBatch(envelope3('a10000000009', [['lv', 1, 2]], { z: 'Asia/Riyadh' })), late - DAY_MS);
  for (const [s, offset] of [['a10000000001', 0], ['a10000000002', 0], ['a10000000003', 0], ['a10000000001', 5 * 60000]]) {
    await riyadh.ingest(validateBatch(envelope(s, [['go', 1, 'road-hopper', 'featured', 0]])), late + offset);
  }
  const there = await riyadh.kpis({ from: '2026-10-20', to: '2026-10-21', band: '6-7' }, late + 10 * 60000);
  assert.deepEqual(there.daily.map(d => [d.day, d.sessions]), [['2026-10-20', 0], ['2026-10-21', 3]]);
});

// The documented additions of milestone 2 are the only fields the first store did not have.
function withoutAdditions(kpis) {
  const copy = JSON.parse(JSON.stringify(kpis));
  for (const band of copy.bands) for (const game of band.games || []) { delete game.winRate; delete game.dropOffRate; delete game.engagedMinutes; delete game.starts; }
  return copy;
}

test('a database of the first server is upgraded over two requests, to schema 3 and then 4, with the same KPIs', { skip: skipFirst }, async t => {
  const { openStore: openFirst } = await import(pathToFileURL(path.join(firstDir, 'store.mjs')).href);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-upgrade-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'telemetry.db');
  const first = openFirst(file);
  const batches = simulated().map(({ batch, now }) => ({ ...validateBatch(batch), now }));
  for (const { envelope: env, events, now } of batches) first.insertBatch({ envelope: env, events }, now);
  const expected = QUERIES.map(query => JSON.parse(JSON.stringify(first.kpis(query))));
  first.close();

  const clock = useClock(t);
  clock.now = TODAY + 13 * 3600000;
  const env = { ...wrangler.vars, ADMIN_TOKEN: TOKEN, DB: openDatabase(file) };
  t.after(() => env.DB.close());
  const answers = [];
  for (let i = 0; i < 3; i++) answers.push((await admin(env, '/v1/admin/kpis?from=2026-10-18&to=2026-10-23')).status);
  assert.deepEqual(answers, [503, 503, 200], 'one version step per request');
  const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'r\\_%' ESCAPE '\\' ORDER BY name").all()).results.map(r => r.name);
  assert.deepEqual(tables, ['agg_days', 'agg_devices', 'agg_games', 'agg_levels', 'agg_sources', 'aliases', 'batches', 'cards', 'kpi_cache', 'live',
    'meta', 'roll_days', 'settings', 'st_marks', 'st_pcs', 'st_rounds', 'st_sessions', 'st_student_games', 'st_student_pcs', 'st_students', 'st_visits', 'usage']);
  assert.ok(env.DB.sqlite.prepare('PRAGMA user_version').get().user_version > 1, 'the first server now refuses this file');
  const store = openStore(env.DB);
  for (const [i, query] of QUERIES.entries()) assert.deepEqual(withoutAdditions(await store.kpis(query, clock.now)), expected[i], JSON.stringify(query));
  // Batch ids carry over: a repeat is still refused.
  const last = batches.at(-1);
  assert.equal(await store.ingest(last, last.now), false);
});
