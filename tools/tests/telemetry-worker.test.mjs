// The Cloudflare Worker entry (server/worker.mjs) driven with real Fetch-API Requests,
// with env.DB a D1-style database over node:sqlite (server/sqlite-d1.mjs) and env.ASSETS a
// stub; and a differential check: the same simulated batches give the same KPIs from the
// daily aggregates as from the first server's per-event store (git show 6866861).
import assert from 'node:assert/strict';
import { test } from 'node:test';
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
const wrangler = JSON.parse(fs.readFileSync(path.join(repo, 'server/wrangler.json'), 'utf8'));
const ORIGIN = 'https://farmercarry.github.io';
const TOKEN = 'worker-admin-token-0123456789';
const BASE = 'https://school-games-telemetry.example.workers.dev';
const DAY_MS = 86400000;
const START = Date.parse('2026-10-20T09:15:00Z');
const z6 = [0, 0, 0, 0, 0, 0];
const ctx = { waitUntil() {}, passThroughOnException() {} };

let batchSeq = 0;
const batchId = () => (0xe000000000000000n + BigInt(++batchSeq)).toString(16);
const envelope = (s, ev, extra = {}) => ({ v: 2, b: batchId(), s, k: 'src', m: 'web', a: '6-7', d: [4, 4, 1920], ev, ...extra });

// The bindings and variables wrangler.json gives the Worker, with a test database and password.
function makeEnv(extra = {}) {
  const assets = [];
  return {
    ...wrangler.vars, ADMIN_TOKEN: TOKEN, DB: openDatabase(':memory:'),
    ASSETS: {
      async fetch(request) {
        assets.push(request.method + ' ' + new URL(request.url).pathname);
        return new Response('<!doctype html><title>asset</title>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    },
    assets, ...extra
  };
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
const scheduled = env => worker.scheduled({ scheduledTime: Date.now(), cron: wrangler.triggers.crons[0] }, env, ctx);
// The Worker reads the time from Date.now(); the test moves it with clock.now.
function useClock(t) {
  const clock = { now: START };
  t.mock.method(Date, 'now', () => clock.now);
  return clock;
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

test('the Worker stores a batch from the portal once, with CORS for the portal only', async t => {
  const clock = useClock(t);
  const env = makeEnv();
  const res = await post(env, fixture);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(res.headers.get('access-control-expose-headers'), 'Retry-After');
  assert.equal(res.headers.get('access-control-allow-credentials'), null);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('vary'), /\bOrigin\b/);
  const before = await rows(env, 'agg_games');
  assert.equal((await post(env, fixture)).status, 204, 'a repeat is answered the same');
  assert.deepEqual(await rows(env, 'agg_games'), before, 'and adds nothing');
  assert.deepEqual(await rows(env, 'batches'), [{ b: fixture.b, day: '2026-10-20' }]);
  assert.equal((await rows(env, 'agg_days'))[0].opens, 2);

  for (const origin of ['https://evil.example', 'http://farmercarry.github.io', 'null']) {
    const denied = await post(env, { ...fixture, b: batchId() }, { origin });
    assert.equal(denied.status, 403, origin);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
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
  assert.deepEqual((await call(env, 'GET', '/v1/health')).json(), { ok: true });
});

test('without a valid ADMIN_TOKEN secret the admin endpoints answer 404 and say why; batches still count', async t => {
  for (const secret of [undefined, '', 'short', 'has a space in it 0123456789', 'ü'.repeat(20)]) {
    const env = makeEnv({ ADMIN_TOKEN: secret });
    for (const pathname of ['/v1/admin/kpis', '/v1/admin/live']) {
      const res = await admin(env, pathname, secret || TOKEN);
      assert.equal(res.status, 404, `${secret} ${pathname}`);
      assert.deepEqual(res.json(), { error: 'admin password not set' });
    }
    assert.equal((await post(env, { ...fixture, b: batchId() })).status, 204);
  }
  const env = makeEnv();
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

test('KPIs and live through the Worker; the daily cron purges old days', async t => {
  const clock = useClock(t);
  const env = makeEnv();
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

  // Ten minutes later the live rows are gone; 181 days later the cron deletes the day.
  clock.now += 10 * 60000;
  await scheduled(env);
  assert.deepEqual(await rows(env, 'live'), []);
  assert.equal((await rows(env, 'agg_days')).length, 1);
  clock.now += 181 * DAY_MS;
  await scheduled(env);
  for (const table of Object.keys(TABLES)) assert.deepEqual(await rows(env, table), [], table);
  assert.deepEqual(await rows(env, 'batches'), []);
  assert.deepEqual(await rows(env, 'seen'), []);
});

test('with no request at all, a live row is gone within 10 minutes: a cron sweeps every 5 minutes', async t => {
  const clock = useClock(t);
  const env = makeEnv(), every5 = '*/5 * * * *';
  assert.ok(wrangler.triggers.crons.includes(every5), 'wrangler.json: ' + wrangler.triggers.crons);
  assert.equal((await post(env, fixture)).status, 204);
  const sweep = async () => {
    let statements = 0;
    const prepare = env.DB.prepare;
    env.DB.prepare = sql => { statements++; return prepare.call(env.DB, sql); };
    try { await worker.scheduled({ scheduledTime: Date.now(), cron: every5 }, env, ctx); } finally { env.DB.prepare = prepare; }
    return statements;
  };
  // The cron fires at minutes 0, 5, 10...: a batch at 09:15 is swept at 09:20 at the latest.
  clock.now = Date.parse('2026-10-20T09:19:00Z');
  await sweep();
  assert.equal((await rows(env, 'live')).length, 1, 'still in the window');
  clock.now = Date.parse('2026-10-20T09:20:00Z');
  assert.equal(await sweep(), 1, 'only the live sweep: the daily purge waits for its own cron');
  assert.deepEqual(await rows(env, 'live'), []);
  assert.equal((await rows(env, 'seen')).length, 7);
});

test('the soft rate limit is keyed by CF-Connecting-IP, in memory only', async () => {
  const env = makeEnv({ RATE_PER_MIN: '2' });
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
  const all = JSON.stringify(await Promise.all(['batches', 'seen', 'live', ...Object.keys(TABLES)].map(table => rows(env, table))));
  assert.doesNotMatch(all, /198\.51\.100/, 'no address is stored');
});

test('paths outside /v1/ go to the static assets; the API never does', async () => {
  const env = makeEnv();
  const page = await call(env, 'GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.text, /<title>asset<\/title>/);
  assert.equal((await call(env, 'HEAD', '/app.js')).status, 200);
  assert.equal((await call(env, 'GET', '/v1/nothing')).status, 404);
  assert.equal((await call(env, 'GET', '/v1')).status, 404);
  assert.equal((await call(env, 'POST', '/')).status, 404);
  assert.deepEqual(env.assets, ['GET /', 'HEAD /app.js']);
  const bare = makeEnv({ ASSETS: undefined });
  assert.equal((await call(bare, 'GET', '/')).status, 404);
});

test('a missing DB binding is an internal error for the API only, logged without the request', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const env = makeEnv({ DB: undefined });
  assert.equal((await call(env, 'GET', '/v1/health')).status, 200);
  const res = await post(env, { ...fixture, b: batchId() });
  assert.equal(res.status, 500);
  assert.deepEqual(res.json(), { error: 'server' });
  assert.equal(logged.mock.callCount(), 1);
  assert.match(logged.mock.calls[0].arguments[0], /^telemetry: request failed: the D1 binding DB is missing/);
  assert.doesNotMatch(logged.mock.calls[0].arguments[0], /203\.0\.113|farmercarry|5d02be9a41c7/);
  assert.equal((await call(env, 'GET', '/')).status, 200, 'the dashboard still loads');
});

test('a request stays within D1\'s free per-request limits, even the first one of an instance', async t => {
  const clock = useClock(t);
  const env = makeEnv(), counts = [];
  const prepare = env.DB.prepare.bind(env.DB);
  let statements = 0;
  env.DB.prepare = sql => { statements++; return prepare(sql); };
  const measure = async work => { statements = 0; await work(); counts.push(statements); };
  await measure(() => post(env, fixture));
  // 200 events over 100 games and levels: still one statement per table.
  const wide = envelope('f00000000009', [
    ...Array.from({ length: 100 }, (_, i) => ['go', i, 'game-' + i, 'catalog', 0]),
    ...Array.from({ length: 100 }, (_, i) => ['rs', i, 'game-' + i, 'L' + (i % 50 + 1), 1, 0])
  ]);
  await measure(() => post(env, wide));
  await measure(() => admin(env, '/v1/admin/kpis?from=2026-07-23&to=2026-10-20'));
  await measure(() => admin(env, '/v1/admin/live'));
  await measure(() => scheduled(env));
  assert.ok(counts.every(n => n <= 50), 'at most 50 queries per request: ' + counts);
  assert.ok(counts[1] <= 10, 'a wide batch is still a few statements: ' + counts[1]);
  assert.equal((await rows(env, 'agg_games')).length, 102);
});

test('closed days are read from the aggregates once a day, whichever instance asks', async () => {
  // Cloudflare may answer each dashboard refresh from a new instance, with nothing in memory.
  const db = openDatabase(':memory:'), first = openStore(db);
  for (const { envelope: env, events, now } of simulated()) await first.ingest(env, events, now);
  const scans = [], execute = db.execute.bind(db);
  db.execute = (statement, ...rest) => {
    if (/GROUP BY/.test(statement.sql) && /FROM agg_/.test(statement.sql)) scans.push(statement.params.slice(0, 2).join('..'));
    return execute(statement, ...rest);
  };
  const query = { from: '2026-09-24', to: '2026-10-23', band: null }, now = TODAY + 13 * 3600000;
  const expected = await first.kpis(query, now);
  assert.deepEqual([...new Set(scans)], ['2026-09-24..2026-10-21', '2026-10-22..2026-10-23']);
  scans.length = 0;
  for (const [i, other] of [openStore(db), openStore(db)].entries()) {
    assert.deepEqual(await other.kpis(query, now + (i + 1) * 300000), expected);
  }
  assert.deepEqual([...new Set(scans)], ['2026-10-22..2026-10-23'], 'new instances read only the last two days');
  // The next day's purge lets the next query read them again.
  await first.purge(now + DAY_MS);
  scans.length = 0;
  await openStore(db).kpis(query, now + 60000);
  assert.deepEqual([...new Set(scans)], ['2026-09-24..2026-10-21', '2026-10-22..2026-10-23']);
});

// The first server's store, from Git (CI checkouts without history skip the comparison).
const FIRST = '6866861';
function firstStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-first-store-'));
  for (const file of ['store.mjs', 'schema.mjs']) {
    const shown = spawnSync('git', ['show', `${FIRST}:server/${file}`], { cwd: repo, encoding: 'utf8' });
    if (shown.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); return null; }
    fs.writeFileSync(path.join(dir, file), shown.stdout);
  }
  return dir;
}
const firstDir = firstStore();
const skipFirst = !firstDir && `commit ${FIRST} is not in this checkout (git show failed), so the first store cannot be compared`;

// The documented additions are the only fields the first store did not have.
function withoutAdditions(kpis) {
  const copy = JSON.parse(JSON.stringify(kpis));
  for (const band of copy.bands) for (const game of band.games || []) { delete game.winRate; delete game.dropOffRate; delete game.engagedMinutes; delete game.starts; }
  return copy;
}
// Several days of simulated school sessions in every band, none crossing midnight.
const TODAY = Date.parse('2026-10-23T00:00:00Z');
const simulated = () => [...history({ days: 6, sessions: 45, seed: 11, today: TODAY })].map(({ batch, now }) => ({ ...validateBatch(batch), now }));
const QUERIES = [];
for (const band of [null, '6-7', '8-9', '10-11', '']) {
  for (const [from, to] of [['2026-10-18', '2026-10-23'], ['2026-10-20', '2026-10-20'], ['2026-10-18', '2026-10-19'],
    ['2026-10-19', '2026-10-21'], ['2026-09-24', '2026-10-23'], ['2026-10-24', '2026-10-30']]) QUERIES.push({ from, to, band });
}

test('the daily aggregates give the same KPIs as the first store for the same batches', { skip: skipFirst }, async t => {
  t.after(() => fs.rmSync(firstDir, { recursive: true, force: true }));
  const { openStore: openFirst } = await import(pathToFileURL(path.join(firstDir, 'store.mjs')).href);
  const batches = simulated();
  const bySession = new Map();
  for (const { envelope, now } of batches) (bySession.get(envelope.s) || bySession.set(envelope.s, new Set()).get(envelope.s)).add(new Date(now).toISOString().slice(0, 10));
  assert.ok([...bySession.values()].every(days => days.size === 1), 'no session crosses midnight');
  assert.deepEqual(new Set(batches.map(b => b.envelope.a)), new Set(['6-7', '8-9', '10-11', '']), 'every band');
  assert.ok(batches.length > 500, batches.length + ' batches');

  const first = openFirst(':memory:');
  t.after(() => first.close());
  const store = openStore(openDatabase(':memory:'));
  for (const { envelope, events, now } of batches) {
    assert.equal(await store.ingest(envelope, events, now), first.insertBatch({ envelope, events }, now));
  }
  // Repeats are refused by both.
  for (const { envelope, events, now } of batches.slice(0, 20)) {
    assert.equal(await store.ingest(envelope, events, now + 3600000), false);
    assert.equal(first.insertBatch({ envelope, events }, now + 3600000), false);
  }
  let shown = 0, suppressed = 0;
  for (const query of QUERIES) {
    const expected = first.kpis(query), actual = await store.kpis(query, TODAY + 13 * 3600000);
    assert.deepEqual(withoutAdditions(actual), JSON.parse(JSON.stringify(expected)), JSON.stringify(query));
    const text = JSON.stringify(expected);
    shown += (text.match(/"sessions":/g) || []).length;
    suppressed += (text.match(/"suppressed":true/g) || []).length;
  }
  assert.ok(shown > 1000 && suppressed > 100, `the comparison covers shown (${shown}) and hidden (${suppressed}) groups`);
  // The additions agree with the first store's per-game numbers for a single band.
  const young = await store.kpis({ from: '2026-10-18', to: '2026-10-23', band: '6-7' }, TODAY);
  const band = young.bands[0];
  for (const game of band.games.filter(g => !g.suppressed)) {
    const same = young.games.find(g => g.slug === game.slug);
    assert.deepEqual([game.winRate, game.dropOffRate, game.engagedMinutes, game.starts], [same.winRate, same.dropOffRate, same.engagedMinutes, same.rounds.starts], game.slug);
  }
});

test('a session that crosses midnight counts on both receipt days (the one documented difference)', { skip: skipFirst }, async t => {
  const { openStore: openFirst } = await import(pathToFileURL(path.join(firstDir, 'store.mjs')).href);
  const first = openFirst(':memory:'), store = openStore(openDatabase(':memory:'));
  t.after(() => first.close());
  const late = Date.parse('2026-10-20T23:58:00Z');
  for (const [s, offset] of [['a10000000001', 0], ['a10000000002', 0], ['a10000000003', 0], ['a10000000001', 5 * 60000]]) {
    const { envelope: env, events } = validateBatch(envelope(s, [['go', 1, 'road-hopper', 'featured', 0]]));
    await store.ingest(env, events, late + offset);
    first.insertBatch({ envelope: env, events }, late + offset);
  }
  const query = { from: '2026-10-20', to: '2026-10-21', band: null };
  assert.equal(first.kpis(query).totals.sessions, 3);
  assert.equal((await store.kpis(query)).totals.sessions, 4);
});

test('a database of the first store is upgraded in place on first use, with the same KPIs', { skip: skipFirst }, async t => {
  const { openStore: openFirst } = await import(pathToFileURL(path.join(firstDir, 'store.mjs')).href);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-upgrade-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'telemetry.db');
  const first = openFirst(file);
  const batches = simulated();
  for (const { envelope, events, now } of batches) first.insertBatch({ envelope, events }, now);
  const expected = QUERIES.map(query => JSON.parse(JSON.stringify(first.kpis(query))));
  first.close();

  const db = openDatabase(file), store = openStore(db);
  t.after(() => store.close());
  for (const [i, query] of QUERIES.entries()) assert.deepEqual(withoutAdditions(await store.kpis(query, TODAY + 13 * 3600000)), expected[i], JSON.stringify(query));
  const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY name").all()).results.map(r => r.name);
  assert.deepEqual(tables, ['agg_days', 'agg_devices', 'agg_games', 'agg_levels', 'agg_sources', 'batches', 'kpi_cache', 'live', 'meta', 'seen']);
  assert.equal(db.sqlite.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION, 'the first server now refuses this file');
  assert.deepEqual((await db.prepare('SELECT DISTINCT day FROM seen ORDER BY day').all()).results.map(r => r.day), ['2026-10-22', '2026-10-23']);
  // Batch ids carry over (a repeat is still refused), and later batches add to the same days.
  const last = batches.at(-1);
  assert.equal(await store.ingest(last.envelope, last.events, last.now), false);
  const extra = validateBatch(envelope(last.envelope.s, [['go', 99, 'road-hopper', 'search', 1]], { a: last.envelope.a, m: last.envelope.m, d: last.envelope.d }));
  const before = (await store.kpis({ from: '2026-10-23', to: '2026-10-23', band: null }, TODAY)).totals;
  assert.equal(await store.ingest(extra.envelope, extra.events, last.now + 60000), true);
  const after = (await store.kpis({ from: '2026-10-23', to: '2026-10-23', band: null }, TODAY)).totals;
  assert.deepEqual([after.sessions, after.gameOpens], [before.sessions, before.gameOpens + 1], 'the session was already seen today');
});
