// The portal's telemetry sink, without names (js/telemetry.js, wire version 3;
// docs/ARCHITECTURE.md "Telemetry sink", docs/TELEMETRY.md), driven through the real
// portal and real game pages. Playwright answers the ingest server (https://ingest.test),
// so nothing leaves this machine; any other request still fails the test. The sink is
// switched on with window.SG_TELEMETRY = { url, allowLocal: true }, which no build ever
// writes. Every batch sent is also checked with the ingest server's own validator
// (server/schema.mjs): the server keeps it whole. The same site is also served at
// /copy/, as a second copy on the same origin. The browser's time zone is Asia/Riyadh.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
// The fast build inlines the portal's scripts; its version is then a 16-hex hash.
const sourceTree = fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('src="js/telemetry.js"');
const INGEST = 'https://ingest.test/v1/batch';
const ON = { url: INGEST, allowLocal: true };
// The queue of the copy that sends to url (js/telemetry.js: a 32-bit hash of the address),
// and the key where builds before wire version 3 queue theirs.
const urlHash = url => ([...url].reduce((h, c) => h * 31 + c.charCodeAt(0) | 0, 0) >>> 0).toString(36);
const qKey = url => 'sg:site:tm:q4:' + urlHash(url);
const q3Key = url => 'sg:site:tm:q3:' + urlHash(url);
const oldKey = url => 'sg:site:tm:q:' + urlHash(url);
const COOKIE = { name: 'trackme', value: 'cookie-value', domain: 'ingest.test', path: '/', secure: true, sameSite: 'None' };
const SOURCES = ['featured', 'catalog', 'recent', 'favorites', 'category', 'quick', 'search', 'related', 'surprise',
  'reload', 'history', 'direct', 'starter'];
const ZONE = 'Asia/Riyadh';
// Events of wire version 3, with their kind; and those of version 2, which batches queued
// by an older build still carry.
const ARITY = { ss: 8, go: 7, ld: 5, er: 5, rs: 8, re: 14, gp: 5, gx: 7, tu: 5, fv: 5, ct: 4, lv: 3, pr: 3, cd: 3, se: 4 };
const ARITY_V2 = { ss: 6, go: 5, ld: 4, er: 4, rs: 6, re: 11, gx: 6, lv: 3, se: 3 };
// The events of a game visit: n (the visit in its session) after t, then the slug (after
// the round number k for rs and re).
const VISIT = ['go', 'ld', 'er', 'rs', 're', 'gp', 'gx', 'tu', 'fv'];
const slugOf = ev => ev[0] === 'rs' || ev[0] === 're' ? ev[4] : VISIT.includes(ev[0]) ? ev[3] : undefined;
// The server's validator, from this checkout once the server is merged in, or from the copy
// SG_SERVER_SCHEMA names (git show <server branch>:server/schema.mjs > schema.mjs, with
// git show <server branch>:server/clock.mjs > clock.mjs beside it).
const schemaFile = [path.join(repo, 'server/schema.mjs'), process.env.SG_SERVER_SCHEMA].find(file => file && fs.existsSync(file));
const schema = schemaFile ? await import(pathToFileURL(path.resolve(schemaFile)).href) : null;
let browser, server, origin, pings = 0;

before(async () => {
  server = await startTestServer(root, { pages: { '/seed.html': '<!doctype html><title>seed</title>' }, mounts: { '/copy/': root } });
  origin = server.origin;
  browser = await launchChromium();
});
after(async () => { await browser?.close(); await server?.close(); });

// telemetry: window.SG_TELEMETRY (null: none), copy: the one of the copy at /copy/, and
// teacher: the teacher page's (as built: no address of its own, so it uses the one the
// portal noted); answer(n, post): the ingest server's status for the n-th request, or
// { status, headers, body }. Every test: no page or console errors, and no request other
// than this server's files and the answered requests to the ingest server.
async function setup(t, { telemetry = ON, copy = telemetry, teacher = { allowLocal: true }, gpc = false, clock = false, answer = () => 204 } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', timezoneId: ZONE });
  t.after(() => context.close());
  const state = { context, errors: [], requests: [], posts: [], answer };
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === 'https://ingest.test') return;
    if (request.method() !== 'GET' || /^(fetch|xhr|websocket|eventsource|ping)$/.test(request.resourceType()) ||
      (/^https?:$/.test(url.protocol) && url.origin !== origin)) state.requests.push(request.method() + ' ' + request.url());
  });
  // 'abort': the network fails; 'hang': the request is never answered. The server's own
  // CORS headers: the page may read Retry-After and X-Batch-Every.
  const answered = post => {
    state.posts.push(post);
    const answer = state.answer(state.posts.length, post);
    return typeof answer === 'object' ? answer : { status: answer, headers: {} };
  };
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'Retry-After, X-Batch-Every' };
  await context.route('https://ingest.test/**', async route => {
    const request = route.request();
    const { status, headers, body } = answered({ url: request.url(), method: request.method(), type: request.resourceType(), headers: await request.allHeaders(), body: request.postData() });
    if (status === 'abort') await route.abort('failed');
    else if (status === 'hang') return;
    else await route.fulfill({ status, headers: { ...cors, ...headers }, body });
  });
  // What a page sends while it unloads leaves after the page is gone, where the routes
  // above no longer see it; an interception for the whole browser does, with its headers.
  const cdp = await browser.newBrowserCDPSession();
  t.after(() => cdp.detach().catch(() => {}));
  cdp.on('Fetch.requestPaused', ({ requestId, request, resourceType }) => {
    const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]));
    const { status, headers: answer, body } = answered({ url: request.url, method: request.method, type: resourceType.toLowerCase(), headers, body: request.postData });
    // The page is gone: nothing waits for the answer.
    if (status === 'abort') cdp.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
    else if (status !== 'hang') {
      const responseHeaders = Object.entries({ ...cors, ...answer }).map(([name, value]) => ({ name, value }));
      cdp.send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders,
        ...(body === undefined ? {} : { body: Buffer.from(body).toString('base64') }) }).catch(() => {});
    }
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://ingest.test/*' }] });
  await context.addInitScript(([config, copy, teacher, gpc]) => {
    // The test's setting wins over a build's own (CI may build with SG_TELEMETRY_URL).
    Object.defineProperty(window, 'SG_TELEMETRY', { value: (location.pathname.endsWith('/teacher.html') ? teacher :
      location.pathname.startsWith('/copy/') ? copy : config) || undefined, writable: false });
    if (gpc) Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { configurable: true, get: () => true });
    addEventListener('message', e => {
      const d = e.data;
      if (d && d.type === 'test:ping') window.lastPing = d.n;
      if (d && d.type === 'sg:telemetry') window.telemetryMessages = (window.telemetryMessages || 0) + 1;
      // Inside game frames: every sg:preferences the portal sends.
      if (d && d.type === 'sg:preferences') (window.prefs = window.prefs || []).push(d);
    });
    if (window.top !== window) return;
    // Settled fetches, so a fake clock moves on only after the page has seen each answer
    // (and fetches, the ones started, to wait for every answer: inFlight below).
    const realFetch = window.fetch;
    window.fetch = function () {
      window.fetches = (window.fetches || 0) + 1;
      const p = realFetch.apply(this, arguments), settled = () => { window.fetched = (window.fetched || 0) + 1; };
      p.then(settled, settled);
      return p;
    };
  }, [telemetry, copy, teacher, gpc]);
  if (clock) await context.clock.install();
  state.page = await context.newPage();
  state.page.on('pageerror', error => state.errors.push(error.message));
  // Chromium itself logs a failed request (a 4xx or 5xx answer, or no answer) to the
  // console; the site never does. Only that line, and only for the ingest server, is allowed.
  state.page.on('console', message => {
    if (message.type() !== 'error') return;
    if (/^Failed to load resource: (?:the server responded with a status of (?:4|5)\d\d\b|net::ERR_FAILED$)/.test(message.text()) &&
      message.location().url.startsWith('https://ingest.test/')) return;
    state.errors.push(message.text());
  });
  t.after(() => {
    assert.deepEqual(state.errors, [], 'no page or console errors');
    assert.deepEqual(state.requests, [], 'nothing else goes over the network');
  });
  return state;
}

/* ------------------------------------------------------------- helpers */
// The ingest server's own answers, as server/handler.mjs sends them: its JSON error with
// its status, and GET /v1/health. Then what a school filter or captive portal answers itself.
const JSON_TYPE = { 'Content-Type': 'application/json; charset=utf-8' };
const serverError = (status, error = 'server') => ({ status, headers: JSON_TYPE, body: JSON.stringify({ error }) });
const HEALTH = { status: 200, headers: JSON_TYPE, body: '{"ok":true,"accepts":[2,3],"schema":4}' };
const filterPage = status => ({ status, headers: { 'Content-Type': 'text/html' }, body: '<!doctype html><title>Blocked by the school filter</title>' });
const isHealth = post => post.method === 'GET' && post.url === 'https://ingest.test/v1/health';
const batches = state => state.posts.filter(post => post.method === 'POST').map(post => JSON.parse(post.body));
// Each batch once, where it was first sent: a page that goes before the answer leaves its
// batches queued, and the next page sends them again (the server keeps each once).
const once = list => list.filter((b, i) => list.findIndex(x => x.b === b.b) === i);
// Every event received, per session id, in the order it was sent.
function bySession(list) {
  const out = new Map();
  for (const b of list) out.set(b.s, [...(out.get(b.s) || []), ...b.ev]);
  return out;
}
const allEvents = state => batches(state).flatMap(b => b.ev);
// The ingest server keeps every batch whole: a valid envelope (else 400, dropped for good),
// no event dropped, nothing it would round or clamp, and no lenient field (u p z w) it
// would blank. A batch queued by an older build is still v2, with no codes.
function serverKeeps(list) {
  if (!schema) return;
  for (const b of list) {
    const kept = schema.validateBatch(structuredClone(b));
    assert.ok(kept, 'the server accepts ' + JSON.stringify(b).slice(0, 300));
    assert.equal(kept.wire, b.v);
    assert.equal(kept.dropped, 0, 'the server drops no event of ' + JSON.stringify(b.ev));
    assert.deepEqual(kept.events, b.ev, 'the server changes no event');
    const core = { b: b.b, s: b.s, k: b.k, m: b.m, a: b.a, d: b.d };
    assert.deepEqual(kept.envelope, b.v === 3 ? { ...core, u: b.u, p: b.p, z: b.z, w: b.w } : { ...core, u: '', p: '', z: '', w: null });
  }
}
// A batch as queued: the body without w, which each send adds anew.
const bare = b => { const { w, ...rest } = b; return rest; };
const rid = async page => JSON.parse(await page.evaluate(() => localStorage.getItem('sg:site:rid')));
async function until(check, label, ms = 20000) {
  for (const end = Date.now() + ms; !check();) {
    if (Date.now() > end) throw new Error('timed out waiting for ' + label);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
const tm = (page, key) => page.evaluate(k => localStorage.getItem(k), key);
const queue = async (page, url = INGEST) => JSON.parse(await tm(page, qKey(url)));
const tmKeys = page => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('sg:site:tm:')).sort());
// The delivery record for the teacher page (sg:site:tm:dx).
const dx = async page => JSON.parse(await tm(page, 'sg:site:tm:dx'));
// Every request the page started has its answer. Moving a fake clock a minute on while one
// is still on its way would send its batch again, as the sink does for a request a real
// minute left unanswered.
const inFlight = page => page.waitForFunction(() => (window.fetched || 0) === (window.fetches || 0));
async function home(page) {
  await page.locator('#logo').click();
  await page.waitForFunction(() => document.body.className === 'route-home');
}
const ready = page => page.waitForFunction(() => document.querySelector('#stage')?.getAttribute('aria-busy') === 'false' && document.querySelector('#stageMsg').hidden);
const gameFrame = (page, slug) => page.frames().find(frame => frame.url().includes(`/games/${slug}/`));
// Opens a game from home through its tile and waits for Kit.ready().
async function play(page, slug) {
  await page.locator(`.catalog-grid .tile[data-slug="${slug}"]`).click();
  await ready(page);
  return gameFrame(page, slug);
}
// A real two-player round of tic-tac-toe: the first seat takes the top row; 'local' ends neutrally.
async function localRound(page) {
  const game = page.frameLocator('#stage iframe');
  for (const [i, move] of [0, 3, 1, 4, 2].entries()) {
    await game.locator(`#gameBoard [data-move="${move}"]`).click();
    await game.locator(`#gameBoard[data-moves="${i + 1}"]`).waitFor();
  }
}
// A message from inside the game frame, through the game's own parent.postMessage.
async function post(page, frame, data) {
  const n = ++pings;
  await frame.evaluate(([d, n]) => { parent.postMessage(d, location.origin); parent.postMessage({ type: 'test:ping', n }, location.origin); }, [data, n]);
  await page.waitForFunction(n => window.lastPing === n, n);
}
const setHidden = (page, hidden) => page.evaluate(h => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

// Expected values may be predicates.
const int = v => Number.isInteger(v) && v >= 0;
const pos = v => Number.isInteger(v) && v > 0;
const tierOf = v => Number.isInteger(v) && v >= 0 && v <= 9;
const zeros = n => Array(n).fill(0);
const hist = n => v => Array.isArray(v) && v.length === n && v.every(int);
function like(actual, expected, label = 'events') {
  if (typeof expected === 'function') return assert.ok(expected(actual), `${label}: ${JSON.stringify(actual)}`);
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual) && actual.length === expected.length,
      `${label}: ${JSON.stringify(actual)} should have ${expected.length} entries like ${JSON.stringify(expected, (k, v) => typeof v === 'function' ? '?' : v)}`);
    return expected.forEach((e, i) => like(actual[i], e, `${label}[${i}]`));
  }
  if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual || {}), Object.keys(expected), `${label}: ${JSON.stringify(actual)} keys`);
    return Object.keys(expected).forEach(key => like(actual[key], expected[key], `${label}.${key}`));
  }
  assert.equal(actual, expected, label);
}
// The contract's shape: exact keys, ids and buckets; every event has its arity, times are
// whole seconds since the session started and never go back; w is at least the last
// time; a session's batches all carry its codes.
async function checkBatches(page, list) {
  const device = await page.evaluate(() => [navigator.hardwareConcurrency, navigator.deviceMemory, screen.width]);
  const bucket = (v, steps) => steps.filter((s, i) => i === 0 || v >= s).at(-1);
  const d = [bucket(device[0], [1, 2, 4, 8, 16]), bucket(device[1], [0, 1, 2, 4, 8]), bucket(device[2], [1366, 1600, 1920, 2560])];
  for (const b of list) {
    assert.deepEqual(Object.keys(b), ['v', 'b', 's', 'k', 'm', 'a', 'd', 'u', 'p', 'z', 'ev', 'w']);
    assert.equal(b.v, 3);
    assert.match(b.b, /^[0-9a-f]{16}$/);
    assert.match(b.s, /^[0-9a-f]{12}$/);
    if (sourceTree) assert.equal(b.k, 'src'); else assert.match(b.k, /^[0-9a-f]{16}$/);
    assert.equal(b.m, 'web');
    assert.ok(['', '6-7', '8-9', '10-11'].includes(b.a), b.a);
    assert.deepEqual(b.d, d, 'device buckets');
    assert.match(b.u, /^(?:[0-9a-f]{12})?$/);
    assert.match(b.p, /^(?:[0-9a-f]{12})?$/);
    assert.equal(b.z, ZONE);
    assert.ok(b.ev.length >= 1 && b.ev.length <= 200 && JSON.stringify(b).length <= 32768);
    for (const ev of b.ev) assert.equal(ev.length, ARITY[ev[0]], JSON.stringify(ev));
    assert.ok(int(b.w) && b.w >= Math.max(...b.ev.map(ev => ev[1])) && b.w <= 691200, 'w ' + b.w);
  }
  serverKeeps(list);
  // A retry sends the very same batch again, only with a later w; different batches never share an id.
  const seen = new Map();
  for (const b of list) {
    const body = JSON.stringify(bare(b));
    if (seen.has(b.b)) {
      assert.equal(body, seen.get(b.b).body, 'a batch id is never reused');
      assert.ok(b.w >= seen.get(b.b).w, 'a retry is sent later');
    }
    seen.set(b.b, { body, w: b.w });
  }
  for (const [s, events] of bySession(list)) {
    events.forEach((ev, i) => { assert.ok(int(ev[1]) && (!i || ev[1] >= events[i - 1][1]), 'times: ' + JSON.stringify(events)); });
    const mine = list.filter(b => b.s === s);
    assert.equal(new Set(mine.map(b => b.u + ' ' + b.p)).size, 1, 'one student code and one PC code per session');
  }
}

/* --------------------------------------------------------------- tests */
test('the server\'s validator is here, and it agrees with this test on the contract', { skip: !schema && 'no server/schema.mjs in this checkout and no SG_SERVER_SCHEMA' }, () => {
  assert.deepEqual(schema.SOURCES, SOURCES);
  const arity = kinds => Object.fromEntries(Object.entries(kinds).map(([kind, fields]) => [kind, fields.length + 1]));
  assert.deepEqual(arity(schema.EVENTS_V3), ARITY);
  assert.deepEqual(arity(schema.EVENTS), ARITY_V2);
  assert.deepEqual(schema.WIRES, [2, 3]);
  // A student code is a profile's 12 random hex, as the sink makes them.
  assert.equal(String(schema.U_RE), String(/^[0-9a-f]{12}$/));
  assert.equal(schema.MAX_W, 691200);
  // It refuses what the sink must never send: a wrong device bucket is a 400.
  const batch = { v: 3, b: '0123456789abcdef', s: '0123456789ab', k: 'src', m: 'web', a: '', d: [4, 4, 1920],
    u: '3f9a0c51e2b7', p: '8c21d0e94a6f', z: ZONE, ev: [['ss', 0, 0, -1, -1, 0, 0, 0]], w: 0 };
  assert.deepEqual(schema.validateBatch(batch).envelope, { b: batch.b, s: batch.s, k: 'src', m: 'web', a: '', d: [4, 4, 1920], u: batch.u, p: batch.p, z: ZONE, w: 0 });
  for (const bad of [{ v: 4 }, { d: [3, 4, 1920] }, { d: [4, 4, 1280] }, { k: '5C18C6D2D1C052AD' }, { s: '0123456789abc' }, { a: '6' }, { m: 'pwa' }]) {
    assert.equal(schema.validateBatch({ ...batch, ...bad }), null, JSON.stringify(bad));
  }
  // The fields v3 adds are lenient: a bad one is blanked, the batch is kept. A v2 batch has none.
  assert.deepEqual(schema.validateBatch({ ...batch, u: 'p1', p: 'pcwxyz', z: 'Mars/Base', w: 1e9 }).envelope,
    { b: batch.b, s: batch.s, k: 'src', m: 'web', a: '', d: [4, 4, 1920], u: '', p: '', z: '', w: null });
  const v2 = schema.validateBatch({ v: 2, b: batch.b, s: batch.s, k: 'src', m: 'web', a: '', d: [4, 4, 1920], u: batch.u, ev: [['ss', 0, 0, 0, 4, 0]] });
  assert.deepEqual([v2.wire, v2.envelope.u, v2.envelope.w, v2.dropped], [2, '', null, 0]);
});

// docs/RESEARCH_TELEMETRY_SPEC.md §G and §A.10: the codes make the data pseudonymous, so
// nothing on the client side calls it, or the profiles, anonymous; and nothing is left of
// the player cards the owner dropped for good.
test('no client file calls the telemetry or the profiles anonymous, and nothing of player cards is left', () => {
  const client = [...fs.readdirSync(path.join(repo, 'js')).map(f => 'js/' + f), ...fs.readdirSync(path.join(repo, 'shared')).filter(f => f.endsWith('.js')).map(f => 'shared/' + f)];
  const lines = files => files.flatMap(file => fs.readFileSync(path.join(repo, file), 'utf8').split('\n').map((line, i) => [`${file}:${i + 1}`, line]));
  for (const [where, line] of lines([...client, 'docs/TELEMETRY.md', 'docs/ARCHITECTURE.md', '.github/workflows/build.yml'])) {
    assert.doesNotMatch(line.replace(/\bnot anonymous\b/gi, ''), /anonym|مجهول/i, where);
  }
  for (const [where, line] of lines([...client, 'docs/TELEMETRY.md'])) assert.doesNotMatch(line, /player.?cards?\b|\/cards\b|بطاق(?:ة|ات) (?:ال)?لاعب/i, where);
});

test('real rounds reach the ingest server as the contract says, with codes but nothing that could name a child or a PC', async t => {
  const state = await setup(t), { page } = state;
  await page.goto(origin + '/seed.html');
  await page.evaluate(() => localStorage.setItem('sg:site:statsmeta', JSON.stringify({ pc: { id: 'pcwxyz', label: 'مختبر سارة' }, since: '2026-10-01' })));
  // credentials: 'omit': a cookie of the ingest server never goes with a fetch.
  await state.context.addCookies([COOKIE]);
  await page.goto(origin + '/');
  assert.equal(await page.evaluate(() => SGTelemetry.active()), true);
  assert.deepEqual(await tmKeys(page), ['sg:site:tm:dx', 'sg:site:tm:on'], 'the teacher page is told this PC shares, and where');
  assert.equal(await tm(page, 'sg:site:tm:on'), '"ingest.test"');
  assert.deepEqual(await dx(page), { v: 1, u: INGEST, ok: 0, f: 0, k: '', at: 0, x: 0 }, 'nothing sent yet');
  // The active sink made this PC's code; a guest has none.
  const pc = (await rid(page)).pc;
  assert.deepEqual(await rid(page), { v: 1, pc, k: {}, l: {}, g: {} });
  assert.match(pc, /^[0-9a-f]{12}$/);

  // A child types a search, then goes home and makes a player with the mouse: the
  // guest's session ends and the child's begins.
  await page.locator('#q').fill('زرافة سرية');
  await page.waitForFunction(() => location.hash.startsWith('#/search/'));
  await page.locator('#q').press('Escape');
  await page.waitForFunction(() => document.body.className === 'route-home');
  await page.locator('#who [data-w="add"]').click();
  await page.locator('#who [data-w="a:3"]').click();
  await page.locator('#who [data-w="c:1"]').click();
  await page.locator('#who [data-w="b:8-9"]').click();
  assert.equal(await page.evaluate(() => SGProfiles.player()), 'p1');

  // The starter card, then two real rounds of tic-tac-toe, a rematch in between.
  const starter = await page.locator('#app > a.starter').getAttribute('data-slug');
  await page.locator('#app > a.starter').click();
  await ready(page);
  await home(page);
  await until(() => allEvents(state).some(ev => ev[0] === 'gx' && ev[3] === starter), 'the starter game closing');
  const tttSource = await page.locator('.catalog-grid .tile[data-slug="tic-tac-toe"] .hot').count() ? 'featured' : 'catalog';
  const ttt = await play(page, 'tic-tac-toe');
  assert.ok((await ttt.evaluate(() => window.prefs)).every(p => p.telemetry === true && p.band === '8-9' && p.player === 'p1'),
    'the game is told telemetry is on');
  await page.frameLocator('#stage iframe').locator('#localButton').click();
  await localRound(page);
  await page.frameLocator('#stage iframe').locator('#rematchButton').click();
  await page.frameLocator('#stage iframe').locator('#gameBoard[data-moves="0"]').waitFor();
  await localRound(page);
  assert.ok(await page.evaluate(() => window.telemetryMessages) > 0, 'the game sent sg:telemetry');
  await home(page);
  // Leaving the game sends at once.
  await until(() => allEvents(state).some(ev => ev[0] === 'gx' && ev[3] === 'tic-tac-toe'), 'tic-tac-toe closing');

  // Wins (v1 sg:stats, as for XP) take the child to level 2.
  const hockey = await play(page, 'air-hockey');
  const xp = await page.evaluate(() => SGProfiles.current().xp);
  const wins = Array.from({ length: Math.ceil((30 - xp) / 10) }, () => [['s', 'L1'], ['w', 'L1', 1000]]).flat();
  await post(page, hockey, { type: 'sg:stats', version: 1, e: 0, f: [0, 0, 0, 0], m: 0, r: wins, o: '' });
  assert.equal(await page.evaluate(() => SGProfiles.current().lv), 2);
  await home(page);
  await until(() => allEvents(state).some(ev => ev[0] === 'gx' && ev[3] === 'air-hockey'), 'air-hockey closing');

  const list = batches(state);
  await checkBatches(page, list);
  for (const p of state.posts) {
    assert.deepEqual([p.url, p.method, p.type, p.headers['content-type']], [INGEST, 'POST', 'fetch', 'text/plain']);
    assert.equal(p.headers.cookie, undefined, 'no cookies');
  }
  const sessions = [...bySession(list)];
  assert.equal(sessions.length, 2, 'the guest\'s session and the new player\'s');
  const [[guestId, guest], [childId, child]] = sessions;
  assert.notEqual(guestId, childId);
  assert.deepEqual(list.filter(b => b.s === guestId).map(b => [b.a, b.u, b.p]), list.filter(b => b.s === guestId).map(() => ['', '', pc]));
  // The child's code is random, kept for the profile in sg:site:rid, and never its key.
  const code = (await rid(page)).k.p1;
  assert.deepEqual(await rid(page), { v: 1, pc, k: { p1: code }, l: {}, g: {} });
  assert.match(code, /^[0-9a-f]{12}$/);
  assert.deepEqual([...new Set(list.filter(b => b.s === childId).map(b => [b.a, b.u, b.p].join()))], [['8-9', code, pc].join()]);
  like(guest, [['ss', 0, 0, -1, -1, 0, 0, 0], ['se', int, 0, 'p']], 'guest');
  // The starter game is checked only for its open, load and close (its own rounds are its own).
  const own = child.filter(ev => slugOf(ev) !== starter);
  const start = child.filter(ev => slugOf(ev) === starter);
  like(start.filter(ev => ['go', 'ld', 'gx'].includes(ev[0])), [['go', int, 1, starter, 'starter', 0, 0], ['ld', int, 1, starter, int],
    ['gx', int, 1, starter, int, hist(6), hist(4)]], 'starter');
  const [tier1, tier2] = own.filter(ev => ev[0] === 'rs').map(ev => ev[6]);
  // A round's counters (rx): its wall time, the clicks of its last four moves (the first
  // move's click starts the round), no idle lapse or pause, no reaction time and no DDA
  // level (tic-tac-toe has neither).
  const counters = [pos, 4, 0, 0, 0, 0, -1];
  like(own, [
    ['ss', 0, 1, 0, -1, 1, 1, 0],
    ['go', int, 2, 'tic-tac-toe', tttSource, 0, 0],
    ['ld', int, 2, 'tic-tac-toe', v => int(v) && v < 120000],
    ['rs', int, 2, 1, 'tic-tac-toe', 'local', tierOf, 0],
    ['re', int, 2, 1, 'tic-tac-toe', 'e', 'local', pos, -1, tier1, 0, 0, zeros(6), counters],
    ['rs', int, 2, 2, 'tic-tac-toe', 'local', tierOf, 1],
    ['re', int, 2, 2, 'tic-tac-toe', 'e', 'local', pos, -1, tier2, 0, 0, zeros(6), counters],
    // tic-tac-toe draws no frames; every click went through Kit's input-latency histogram.
    ['gx', int, 2, 'tic-tac-toe', pos, v => hist(6)(v) && v.reduce((a, b) => a + b) > 0, zeros(4)],
    ['go', int, 3, 'air-hockey', 'catalog', 0, 0],
    ['ld', int, 3, 'air-hockey', int],
    ['lv', int, 2],
    ['gx', int, 3, 'air-hockey', 0, zeros(6), zeros(4)]
  ], 'child');
  const gx = own.find(ev => ev[0] === 'gx');
  const res = own.filter(ev => ev[0] === 're');
  assert.ok(gx[4] >= res[0][7] + res[1][7], 'the game\'s engaged time covers its rounds');
  assert.ok(res.every(ev => ev[13][0] >= ev[7]), 'a round\'s wall time covers its engaged time');

  // Nothing that could name a child, a PC or a browser, and no clock time: the codes are
  // random, the teacher page's PC id never goes, and w is seconds since the session started.
  const text = state.posts.map(p => p.body).join('\n');
  for (const secret of ['pcwxyz', 'مختبر', 'سارة', 'زرافة', 'سرية', '"p1"', '🐸', '#f57c00', 'cookie-value', 'Mozilla',
    'Chrome', 'Linux', '127.0.0.1', 'localhost', 'sg:', 'http', 'SG_']) {
    assert.ok(!text.includes(secret), 'the batches never contain ' + secret);
  }
  assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}|\d{2}:\d{2}/, 'no dates or times of day');
  const numbers = JSON.stringify(list.map(b => b.ev)).match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(numbers.every(n => Number.isInteger(n) && n >= -1 && n < 1e8), 'whole numbers, none like a timestamp');
  assert.ok(list.every(b => b.w < 3600), 'w counts seconds since the session started');
  assert.deepEqual(await queue(page), null, 'everything was delivered');
});

test('off unless every gate holds: games are told telemetry: false and nothing is sent or stored, not even a code', async t => {
  const meta = extra => JSON.stringify({ pc: { id: 'pcwxyz' }, ...extra });
  const seeded = JSON.stringify([{ t: Date.now(), e: { v: 2, b: '0123456789abcdef', s: '0123456789ab', k: 'src', m: 'web', a: '', d: [4, 4, 1920], ev: [['ss', 0, 0, 0, 4, 0]] } }]);
  const cases = [
    ['no SG_TELEMETRY', { telemetry: null }, null],
    ['an http:// address', { telemetry: { url: 'http://ingest.test/v1/batch', allowLocal: true } }, null],
    ['a quote in the address', { telemetry: { url: 'https://ingest.test/v1/"batch', allowLocal: true } }, null],
    ['this computer without allowLocal', { telemetry: { url: INGEST } }, null],
    ['Global Privacy Control', { gpc: true }, null],
    ['statistics stopped', {}, meta({ off: true, offSince: Date.now() })],
    ['sharing turned off', {}, meta({ tm: false })]
  ];
  for (const [name, options, statsmeta] of cases) {
    await t.test(name, async t => {
      const state = await setup(t, { ...options, clock: true }), { page } = state;
      await page.goto(origin + '/seed.html');
      // Queues and a note from earlier builds that shared (one before wire version 3).
      await page.evaluate(([m, keys, q]) => {
        if (m) localStorage.setItem('sg:site:statsmeta', m);
        keys.forEach(key => localStorage.setItem(key, q));
        localStorage.setItem('sg:site:tm:on', '"ingest.test"');
        localStorage.setItem('sg:site:tm:dx', JSON.stringify({ v: 1, u: 'https://ingest.test/v1/batch', ok: 1, f: 0, k: '', at: 0 }));
      }, [statsmeta, [qKey(INGEST), oldKey(INGEST)], seeded]);
      await page.goto(origin + '/');
      assert.equal(await page.evaluate(() => SGTelemetry.active()), false);
      // A new player, who would get a code from an active sink.
      await page.evaluate(() => SGProfiles.create(1, 4, '6-7'));
      const frame = await play(page, 'tic-tac-toe');
      await page.frameLocator('#stage iframe').locator('#localButton').click();
      await localRound(page);
      assert.ok((await frame.evaluate(() => window.prefs)).every(p => p.telemetry === false));
      assert.equal(await page.evaluate(() => window.telemetryMessages || 0), 0, 'the game collects no extras and posts no sg:telemetry');
      await home(page);
      await setHidden(page, true);
      await page.clock.runFor(120000);
      await page.goto(origin + '/seed.html');
      assert.deepEqual(state.posts, [], 'nothing is sent, neither while the page lives nor as it unloads');
      // Stopped statistics and sharing turned off drop what waited; otherwise the sink only
      // removes the old notes, so the teacher page neither says that this PC shares nor
      // tests a server it does not send to.
      assert.deepEqual(await tmKeys(page), statsmeta ? [] : [oldKey(INGEST), qKey(INGEST)].sort());
      if (!statsmeta) for (const key of [qKey(INGEST), oldKey(INGEST)]) assert.equal(await tm(page, key), seeded);
      assert.equal(await tm(page, 'sg:site:rid'), null, 'no code is made or written');
    });
  }
});

test('failures back off 20, 40, 80, 160, 300 s; the server\'s 204 and its JSON 4xx are final; 429, 5xx and network errors retry', async t => {
  const answers = [serverError(500), 'abort', serverError(503, 'migrating'), serverError(500), serverError(502), serverError(500), 204,
    serverError(400, 'bad batch'), serverError(429, 'rate limited'), 204];
  const state = await setup(t, { clock: true, answer: n => answers[n - 1] ?? 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/');
  const settled = n => page.waitForFunction(n => window.fetched === n, n);
  const at = async (ms, count, label) => { await page.clock.runFor(ms); await until(() => state.posts.length === count, label, 5000); };
  await at(59000, 0, 'nothing before 60 s');
  await at(1000, 1, 'the first send after 60 s');
  await settled(1);
  assert.equal((await queue(page)).length, 1, 'a 500 keeps the batch');
  // Each failure (a 5xx, or no answer at all) waits longer, up to 300 s.
  for (const [i, wait] of [20, 40, 80, 160, 300, 300].entries()) {
    await at(wait * 1000 - 1, i + 1, `no retry before ${wait} s`);
    await at(1, i + 2, `retry ${i + 1} after ${wait} s`);
    await settled(i + 2);
    if (answers[i + 1] !== 204) assert.equal((await queue(page)).length, 1, `${answers[i + 1]} keeps the batch`);
  }
  assert.equal(await queue(page), null, 'a 204 removes the batch');
  const tries = batches(state).slice(0, 7);
  assert.ok(tries.every(b => JSON.stringify(bare(b)) === JSON.stringify(bare(tries[0]))), 'the same batch, the same id');
  // Each try says how long its session has run: the start it dates stays the same.
  assert.deepEqual(tries.map(b => b.w), [60, 80, 120, 200, 360, 660, 960]);
  like(tries[0].ev, [['ss', 0, 0, -1, -1, 0, 0, 0]]);

  // A malformed batch (400) is dropped and never sent again.
  await page.evaluate(() => SGTelemetry.level(4));
  await at(60000, 8, 'the next batch');
  await settled(8);
  assert.equal(await queue(page), null, 'a 400 drops the batch');
  await at(400000, 8, 'no retry after a 400');
  // 429 (too many requests) keeps the batch and backs off from 20 s again.
  await page.evaluate(() => SGTelemetry.level(5));
  await at(60000, 9, 'the batch after the 400');
  await settled(9);
  assert.equal((await queue(page)).length, 1, 'a 429 keeps the batch');
  await at(19999, 9, 'no retry before 20 s');
  await at(1, 10, 'the retry after a 429');
  await settled(10);
  assert.equal(await queue(page), null);
  assert.deepEqual(bare(batches(state)[9]), bare(batches(state)[8]));
  assert.equal(batches(state)[9].w, batches(state)[8].w + 20);
  like(state.posts.slice(7).map(p => JSON.parse(p.body).ev), [[['lv', int, 4]], [['lv', int, 5]], [['lv', int, 5]]]);
  await checkBatches(page, batches(state));
});

test('a request that is never answered is given up after a minute and noted as no answer: the batch waits, backs off and goes again', async t => {
  // A school filter or proxy that takes the connection and never answers (28 October: the
  // teacher page would otherwise have stayed green while batches piled up).
  let hang = true;
  const state = await setup(t, { clock: true, answer: () => hang ? 'hang' : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/');
  // This PC delivered three days ago.
  const delivered = await page.evaluate(() => Date.now()) - 3 * 864e5;
  await page.evaluate(([key, u, ok]) => localStorage.setItem(key, JSON.stringify({ v: 1, u, ok, f: 0, k: '', at: 0, x: 0 })), ['sg:site:tm:dx', INGEST, delivered]);
  const at = async (ms, count, label) => { await page.clock.runFor(ms); await until(() => state.posts.length === count, label, 5000); };
  await at(60000, 1, 'the first send');
  const sent = await page.evaluate(() => Date.now());
  await at(59999, 1, 'no second request while the first may still be answered');
  assert.equal((await dx(page)).f, 0, 'nothing noted while the request may still be answered');
  // A minute without an answer: the request is aborted, the batch stays and the failure is noted.
  await at(1, 1, 'no second request at once');
  await page.waitForFunction(() => window.fetched === 1);
  like(await dx(page), { v: 1, u: INGEST, ok: delivered, f: sent + 60000, k: 'network', at: sent + 60000, x: 0 }, 'no answer is noted as a network failure');
  like(await page.evaluate(() => SGTelemetry.status()), { why: '', host: 'ingest.test', ok: delivered, f: sent + 60000, k: 'network', at: sent + 60000, x: 0, n: 1, t: pos, o: pos });
  assert.equal((await queue(page)).length, 1, 'the batch waits');
  // It backs off like any failure, 20 s, then 40 s; each try is cut off after a minute.
  await at(19999, 1, 'no retry before 20 s');
  await at(1, 2, 'the retry after 20 s');
  await at(60000, 2, 'the retry is given up after a minute too');
  await page.waitForFunction(() => window.fetched === 2);
  assert.equal((await dx(page)).f, sent + 60000, 'still failing since the first time');
  hang = false;
  await at(39999, 2, 'no retry before 40 s');
  await at(1, 3, 'the next retry');
  await inFlight(page);
  assert.ok(batches(state).every(b => JSON.stringify(bare(b)) === JSON.stringify(bare(batches(state)[0]))), 'the same batch, the same id');
  assert.deepEqual(batches(state).map(b => b.w), [60, 140, 240]);
  assert.equal(await queue(page), null, 'delivered');
  like(await dx(page), { v: 1, u: INGEST, ok: sent + 180000, f: 0, k: '', at: 0, x: 0 });
  await at(300000, 3, 'nothing more to send');
  await checkBatches(page, batches(state));
});

test('a send that fails while the PC has no connection at all is noted as offline, still failing since the first time; the test then asks nothing', async t => {
  const state = await setup(t, { clock: true, answer: (n, post) => isHealth(post) ? HEALTH : 'abort' }), { page } = state;
  const unplug = p => p.evaluate(() => Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false }));
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/');
  // The school filter drops the first send: the network is to blame.
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the first send');
  await inFlight(page);
  const first = await dx(page);
  like(first, { v: 1, u: INGEST, ok: 0, f: pos, k: 'network', at: first.f, x: 0 });
  // Then the cable is pulled: the retry fails while navigator.onLine is false.
  await unplug(page);
  await page.clock.runFor(20000);
  await until(() => state.posts.length === 2, 'the retry');
  await inFlight(page);
  like(await dx(page), { v: 1, u: INGEST, ok: 0, f: first.f, k: 'offline', at: v => v >= first.f + 20000, x: 0 });
  // The teacher's test on that PC answers at once: no request, and the record stays as it is.
  const teacher = await state.context.newPage();
  teacher.on('pageerror', error => state.errors.push('teacher: ' + error.message));
  await teacher.goto(origin + '/teacher.html');
  await unplug(teacher);
  // A tab of the first v3 build left a batch in its own key: the answer counts it, as status() does.
  await seed(teacher, [[q3Key(INGEST), JSON.stringify([v3At('5'.repeat(16), await teacher.evaluate(() => Date.now()))])]]);
  const record = await tm(teacher, 'sg:site:tm:dx'), n = state.posts.length;
  assert.equal(await teacher.evaluate(() => SGTelemetry.status().n), 2);
  like(await teacher.evaluate(() => new Promise(resolve => SGTelemetry.check(resolve))), { k: 'offline', host: 'ingest.test', reached: false, sent: 0, n: 2 });
  assert.equal(state.posts.length, n, 'nothing is asked');
  assert.equal(await tm(teacher, 'sg:site:tm:dx'), record, 'and nothing is noted');
  await teacher.close();
});

test('every batch stays queued until the server answers it: a short page on a failing network loses nothing, and a later page sends it all, oldest first', async t => {
  let net = 'abort';
  const state = await setup(t, { clock: true, answer: () => net }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/');
  // The first page's session start cannot reach the server at 60 s; its end joins the
  // queue as the page goes (a page whose sends failed hands nothing to fetch then).
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the first send');
  await inFlight(page);
  await page.goto(origin + '/');
  const first = await queue(page);
  like(first.map(x => x.e.ev.map(ev => ev[0])), [['ss'], ['se']]);
  // A second page for a moment (a child opens the portal and closes the tab): it has seen
  // no failure itself, so as it goes it hands the whole queue to fetch, which fails too.
  await page.clock.runFor(1500);
  await page.goto(origin + '/seed.html');
  await until(() => state.posts.length === 4, 'the closing page\'s sends');
  const queued = await queue(page);
  assert.ok(queued, 'the queue is still there');
  assert.deepEqual(queued.slice(0, 2).map(x => x.e.b), first.map(x => x.e.b), 'the first page\'s batches are all still there');
  like(queued.slice(2).map(x => x.e.ev.map(ev => ev[0])), [['ss', 'se']], 'and the second page\'s session');
  assert.deepEqual(batches(state).slice(1).map(b => b.b), queued.map(x => x.e.b), 'handed to fetch oldest first, and kept');
  assert.ok(queued.every(x => x.h === 1), 'and marked as handed over by a closing page');
  like(await dx(page), { v: 1, u: INGEST, ok: 0, f: pos, k: 'network', at: pos, x: 0 }, 'the failure is noted for the teacher page');
  // The network is back: the next page sends every batch again, oldest first, and the queue
  // empties as the server takes them (it keeps each batch once).
  net = 204;
  const sent = state.posts.length;
  await page.goto(origin + '/');
  await page.clock.runFor(60000);
  await until(() => state.posts.length === sent + queued.length + 1, 'every batch, then this page\'s');
  await inFlight(page);
  assert.deepEqual(batches(state).slice(sent, -1).map(b => b.b), queued.map(x => x.e.b));
  like(batches(state).at(-1).ev, [['ss', 0, 0, -1, -1, 0, 0, 0]]);
  assert.equal(await queue(page), null, 'delivered');
  like(await dx(page), { v: 1, u: INGEST, ok: pos, f: 0, k: '', at: 0, x: 0 }, 'the delivery ends the failure');
  const unique = once(batches(state));
  await checkBatches(page, unique);
  for (const b of batches(state)) assert.equal(JSON.stringify(bare(b)), JSON.stringify(bare(unique.find(x => x.b === b.b))), 'the same batch each time');
});

test('only the server\'s own 204 delivers and only its JSON error to a 4xx drops a batch: a filter\'s or captive portal\'s page keeps it, backs off and is noted', async t => {
  const answers = [filterPage(200), filterPage(403), { status: 400, headers: { 'Content-Type': 'text/plain' }, body: 'Bad Request' }, 204,
    serverError(403, 'forbidden'), serverError(503, 'migrating'), 204];
  const state = await setup(t, { clock: true, answer: n => answers[n - 1] ?? 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/');
  const settled = n => page.waitForFunction(n => window.fetched === n, n);
  const at = async (ms, count, label) => { await page.clock.runFor(ms); await until(() => state.posts.length === count, label, 5000); await settled(count); };
  await at(60000, 1, 'the first send');
  const t1 = await page.evaluate(() => Date.now());
  assert.equal((await queue(page))?.length, 1, 'a 200 that is not the server\'s 204 (a captive portal\'s page) keeps the batch');
  like(await dx(page), { v: 1, u: INGEST, ok: 0, f: t1, k: 'network', at: t1, x: 0 });
  await at(19999, 1, 'it backs off 20 s');
  await at(1, 2, 'the retry');
  assert.equal((await queue(page))?.length, 1, 'a 403 page of a school filter keeps the batch');
  await at(40000, 3, 'the retry after 40 s');
  assert.equal((await queue(page))?.length, 1, 'a 400 that is not the server\'s JSON keeps it too');
  like(await dx(page), { v: 1, u: INGEST, ok: 0, f: t1, k: 'network', at: pos, x: 0 }, 'still failing since the first one');
  await at(80000, 4, 'the retry after 80 s');
  assert.equal(await queue(page), null, 'the server\'s 204 delivers it');
  like(await dx(page), { v: 1, u: INGEST, ok: pos, f: 0, k: '', at: 0, x: 0 });
  // The server's own JSON refusal is final: the batch goes and is never sent again.
  await page.evaluate(() => SGTelemetry.level(4));
  await at(60000, 5, 'the next batch');
  assert.equal(await queue(page), null, 'refused by the server: dropped');
  like(await dx(page), { v: 1, u: INGEST, ok: pos, f: pos, k: 'refused', at: pos, x: 0 });
  await page.clock.runFor(400000);
  assert.equal(state.posts.length, 5, 'never sent again');
  // The server's JSON 503 keeps the batch, backs off from 20 s, and is noted as the server's.
  await page.evaluate(() => SGTelemetry.level(5));
  await at(60000, 6, 'the batch after the refusal');
  assert.equal((await queue(page))?.length, 1);
  assert.equal((await dx(page)).k, 'server');
  await at(20000, 7, 'its retry');
  assert.equal(await queue(page), null);
  like(batches(state).map(b => b.ev.map(ev => ev[0] === 'lv' ? ev[2] : ev[0])), [['ss'], ['ss'], ['ss'], ['ss'], [4], [5], [5]]);
  await checkBatches(page, batches(state));
});

test('a teacher\'s clear dated after the PC\'s clock (the clock was set back since) holds nothing back', async t => {
  const state = await setup(t, { clock: true }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/seed.html');
  const now = await page.evaluate(() => Date.now());
  const envelope = (b, ev) => ({ v: 3, b, s: 'abcdefabcdef', k: 'src', m: 'web', a: '', d: [4, 4, 1920], u: '', p: '', z: '', ev });
  // A batch queued an hour ago, and a clear the PC dated a year ahead before its clock was corrected.
  await page.evaluate(([key, q, meta]) => { localStorage.setItem(key, q); localStorage.setItem('sg:site:statsmeta', meta); },
    [qKey(INGEST), JSON.stringify([{ t: now - 3600000, w0: now - 3600000, e: envelope('1'.repeat(16), [['lv', 5, 2]]) }]),
      JSON.stringify({ pc: { id: 'pcwxyz' }, clearedAt: now + 365 * 864e5 })]);
  await page.goto(origin + '/');
  // The clear is dated back to the oldest batch waiting (the clear emptied the queue, so
  // what waits came after it), and written so: it never comes back when the clock passes it.
  assert.equal(JSON.parse(await tm(page, 'sg:site:statsmeta')).clearedAt, now - 3600000);
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 2, 'the waiting batch and this page\'s');
  await inFlight(page);
  like(batches(state).map(b => b.ev.map(ev => ev[0])), [['lv'], ['ss']]);
  assert.equal(await queue(page), null);
  serverKeeps(batches(state));
});

test('a teacher\'s clear drops what the open portal recorded before it, also when the developer tools asked for status() first', async t => {
  const state = await setup(t, { clock: true }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/');
  await page.evaluate(() => SGTelemetry.level(3));
  await page.clock.runFor(1000);
  // The teacher page clears in another tab (statsmeta.clearedAt, and the queue keys go).
  await page.evaluate(() => {
    localStorage.setItem('sg:site:statsmeta', JSON.stringify({ pc: { id: 'pcwxyz' }, clearedAt: Date.now() }));
    Object.keys(localStorage).filter(k => /^sg:site:tm:q/.test(k)).forEach(k => localStorage.removeItem(k));
  });
  like(await page.evaluate(() => SGTelemetry.status()), { why: '', host: 'ingest.test', ok: 0, f: 0, k: '', at: 0, x: 0, n: 0, t: 0, o: 0 });
  await page.evaluate(() => SGTelemetry.level(4));
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the next send');
  await inFlight(page);
  like(batches(state).map(b => b.ev), [[['lv', int, 4]]], 'only what came after the clear');
  serverKeeps(batches(state));
});

test('a teacher\'s clear dated ahead by a fast clock that is corrected later never drops the play recorded until the clock passes it', async t => {
  // The teacher clears while the PC's clock runs 10 minutes fast; the clock is then set
  // right, and the server is blocked, so play waits in the queue.
  const state = await setup(t, { clock: true, answer: () => 'abort' }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/');
  const start = await page.evaluate(() => Date.now());
  await page.evaluate(t => localStorage.setItem('sg:site:statsmeta', JSON.stringify({ pc: { id: 'pcwxyz' }, clearedAt: t })), start + 600000);
  await page.evaluate(() => SGTelemetry.level(2));
  const meta = JSON.parse(await tm(page, 'sg:site:statsmeta'));
  assert.ok(meta.clearedAt <= start && meta.clearedAt > start - 60000, 'dated back to this page\'s start: ' + (meta.clearedAt - start));
  assert.equal(meta.pc.id, 'pcwxyz', 'the other settings stay');
  for (let lv = 3; lv <= 6; lv++) {
    await page.clock.runFor(60000);
    await page.evaluate(lv => SGTelemetry.level(lv), lv);
  }
  await page.clock.runFor(60000);
  const levels = async () => (await queue(page)).flatMap(x => x.e.ev).filter(ev => ev[0] === 'lv').map(ev => ev[2]);
  assert.deepEqual(await levels(), [2, 3, 4, 5, 6]);
  // The clock passes the time the clear first had: nothing goes.
  await page.clock.runFor(600000);
  await page.evaluate(() => SGTelemetry.level(20));
  await page.clock.runFor(60000);
  assert.deepEqual(await levels(), [2, 3, 4, 5, 6, 20], 'the play from before the clock passed the clear is all still there');
  serverKeeps(once(batches(state)));
});

test('check mode (the teacher page): no session, no event and no request until the test; the test asks health, then sends what waits', async t => {
  let down = true, health = HEALTH;
  const state = await setup(t, { clock: true, answer: (n, post) => isHealth(post) ? health : down === 'abort' ? 'abort' : down ? serverError(503, 'migrating') : 204 }), { page } = state;
  await state.context.addCookies([COOKIE]);
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/');
  await page.evaluate(() => SGTelemetry.level(2));
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the first send');
  await inFlight(page);
  // The portal goes (its server is failing, so it hands nothing to fetch): two batches wait.
  await page.goto(origin + '/seed.html');
  const waiting = await queue(page), record = await dx(page);
  like(waiting.map(x => x.e.ev.map(ev => ev[0])), [['ss', 'lv'], ['se']]);
  like(record, { v: 1, u: INGEST, ok: 0, f: pos, k: 'server', at: pos, x: 0 });
  const storage = p => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
  const before = await storage(page);
  const teacher = await state.context.newPage();
  teacher.on('pageerror', error => state.errors.push('teacher: ' + error.message));
  await teacher.goto(origin + '/teacher.html');
  assert.deepEqual(await teacher.evaluate(() => Object.keys(SGTelemetry).sort()), ['active', 'check', 'status']);
  assert.equal(await teacher.evaluate(() => SGTelemetry.active()), false);
  like(await teacher.evaluate(() => SGTelemetry.status()), { why: '', host: 'ingest.test', ok: 0, f: record.f, k: 'server', at: record.at, x: 0, n: 2, t: waiting[0].t, o: waiting[0].t });
  await teacher.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  assert.deepEqual(await storage(teacher), before, 'opening the page wrote nothing: no session, no code, no note');
  assert.equal(state.posts.length, 1, 'and sent nothing');
  const check = () => teacher.evaluate(() => new Promise(resolve => SGTelemetry.check(resolve)));
  let n = state.posts.length;
  const since = () => state.posts.slice(n).map(p => p.method + ' ' + p.url);
  // The server answers health but still fails batches: the first one stays, the test says
  // why, and the failure still dates from when it began (health alone does not end it).
  await teacher.clock.runFor(60000);
  like(await check(), { k: 'server', host: 'ingest.test', reached: true, sent: 0, n: 2 });
  assert.deepEqual(since(), ['GET https://ingest.test/v1/health', 'POST ' + INGEST]);
  assert.ok(state.posts.every(p => p.headers.cookie === undefined), 'no cookie goes with the test either');
  like(await dx(teacher), { v: 1, u: INGEST, ok: 0, f: record.f, k: 'server', at: record.at + 60000, x: 0 });
  // Health answers, but the batch gets no answer the page can read (a filter that lets the
  // address open and stops what is sent to it): reached, then failed, still since the start.
  n = state.posts.length;
  down = 'abort';
  like(await check(), { k: 'network', host: 'ingest.test', reached: true, sent: 0, n: 2 });
  assert.deepEqual(since(), ['GET https://ingest.test/v1/health', 'POST ' + INGEST]);
  like(await dx(teacher), { v: 1, u: INGEST, ok: 0, f: record.f, k: 'network', at: pos, x: 0 });
  down = true;
  // A school filter's page in place of health: not reachable, and nothing is sent.
  n = state.posts.length;
  health = filterPage(200);
  like(await check(), { k: 'network', host: 'ingest.test', reached: false, sent: 0, n: 2 });
  assert.deepEqual(since(), ['GET https://ingest.test/v1/health']);
  like(await dx(teacher), { v: 1, u: INGEST, ok: 0, f: record.f, k: 'network', at: pos, x: 0 });
  // A server that does not take this build's wire version.
  n = state.posts.length;
  health = { ...HEALTH, body: '{"ok":true,"accepts":[2],"schema":3}' };
  like(await check(), { k: 'refused', host: 'ingest.test', reached: false, sent: 0, n: 2 });
  assert.deepEqual(since(), ['GET https://ingest.test/v1/health']);
  // Reachable again: health, then every waiting batch, oldest first, and the record says delivered.
  n = state.posts.length;
  health = HEALTH;
  down = false;
  like(await check(), { k: 'ok', host: 'ingest.test', reached: true, sent: 2, n: 0 });
  assert.deepEqual(since(), ['GET https://ingest.test/v1/health', 'POST ' + INGEST, 'POST ' + INGEST]);
  assert.deepEqual(state.posts.slice(n + 1).map(p => bare(JSON.parse(p.body))), waiting.map(x => x.e), 'the very batches the portal queued');
  assert.equal(await queue(teacher), null);
  like(await dx(teacher), { v: 1, u: INGEST, ok: pos, f: 0, k: '', at: 0, x: 0 });
  // Nothing waits: health only.
  n = state.posts.length;
  like(await check(), { k: 'ok', host: 'ingest.test', reached: true, sent: 0, n: 0 });
  assert.deepEqual(since(), ['GET https://ingest.test/v1/health']);
  // Statistics stopped: no request at all.
  n = state.posts.length;
  await teacher.evaluate(() => localStorage.setItem('sg:site:statsmeta', JSON.stringify({ pc: { id: 'pcwxyz' }, off: true, offSince: Date.now() })));
  like(await check(), { why: 'off', host: 'ingest.test' });
  assert.equal(await teacher.evaluate(() => SGTelemetry.status().why), 'off');
  assert.deepEqual(since(), []);
  assert.ok(batches(state).every(b => b.s === waiting[0].e.s), 'every batch sent is the portal\'s session: the teacher page has none');
  serverKeeps(batches(state));
  await teacher.close();
});

test('check mode reads the address the portal notes at each call, and its test ends within its time limits even when an answer never ends', async t => {
  const state = await setup(t, { clock: true, answer: (n, post) => isHealth(post) ? HEALTH : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  // The teacher page is opened first on this PC: nothing to show or test yet.
  const teacher = await state.context.newPage();
  teacher.on('pageerror', error => state.errors.push('teacher: ' + error.message));
  await teacher.goto(origin + '/teacher.html');
  assert.equal(await teacher.evaluate(() => SGTelemetry.status().why), 'none');
  like(await teacher.evaluate(() => new Promise(resolve => SGTelemetry.check(resolve))), { why: 'none', host: '' });
  // The teacher opens the games page, as the box asks, and comes back: the same page now
  // knows the address, without a reload.
  await page.goto(origin + '/');
  assert.ok(await dx(page), 'the portal noted its address');
  like(await teacher.evaluate(() => SGTelemetry.status()), { why: '', host: 'ingest.test', ok: 0, f: 0, k: '', at: 0, x: 0, n: 0, t: 0, o: 0 });
  like(await teacher.evaluate(() => new Promise(resolve => SGTelemetry.check(resolve))), { k: 'ok', host: 'ingest.test', reached: true, sent: 0, n: 0 });
  // A proxy that sends the headers of an answer, then holds its body back: the test gives
  // up on health after 20 s (with the address to give IT), and on a batch after 20 s too.
  await page.goto(origin + '/seed.html');
  const now = await teacher.evaluate(() => Date.now());
  await teacher.evaluate(([key, q]) => localStorage.setItem(key, q), [qKey(INGEST),
    JSON.stringify([{ t: now - 6e4, w0: now - 6e4, e: { v: 3, b: '1'.repeat(16), s: 'abcdefabcdef', k: 'src', m: 'web', a: '', d: [4, 4, 1920], u: '', p: '', z: '', ev: [['lv', 5, 2]] } }])]);
  const stall = (status, which) => teacher.evaluate(([status, which]) => {
    window.realFetch = window.realFetch || window.fetch;
    window.stalled = [];
    window.fetch = (url, init) => {
      const method = init && init.method || 'GET';
      window.stalled.push(method + ' ' + url);
      if (which === 'POST' && method !== 'POST') return window.realFetch(url, init);
      return Promise.resolve(new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"ok":true,')); } }),
        { status, headers: { 'Content-Type': 'application/json' } }));
    };
    window.result = null;
    SGTelemetry.check(r => { window.result = r; });
  }, [status, which]);
  // Once the request that stalls has started (health itself is answered for real, while the
  // page's clock stands still), no answer comes before ms, and one comes at ms.
  const resultAfter = async (ms, requests) => {
    await teacher.waitForFunction(n => window.stalled.length === n, requests);
    await teacher.clock.runFor(ms - 1);
    assert.equal(await teacher.evaluate(() => window.result), null, 'no answer before ' + ms + ' ms');
    await teacher.clock.runFor(1);
    await teacher.waitForFunction(() => window.result !== null);
    return teacher.evaluate(() => window.result);
  };
  await stall(200, 'all');
  like(await resultAfter(20000, 1), { k: 'network', host: 'ingest.test', reached: false, sent: 0, n: 1 });
  assert.deepEqual(await teacher.evaluate(() => window.stalled), ['GET https://ingest.test/v1/health']);
  // Health answers, and the batch's answer (not the server's 204) never ends.
  await stall(400, 'POST');
  like(await resultAfter(20000, 2), { k: 'network', host: 'ingest.test', reached: true, sent: 0, n: 1 });
  assert.deepEqual(await teacher.evaluate(() => window.stalled), ['GET https://ingest.test/v1/health', 'POST ' + INGEST]);
  assert.equal((await queue(teacher)).length, 1, 'the batch still waits');
  await teacher.close();
});

test('a profile made on an earlier day that has never played is a first time', async t => {
  const state = await setup(t, { clock: true }), { page } = state;
  await page.goto(origin + '/seed.html');
  // Both made 3 days ago; p2 played air-hockey that day.
  await page.evaluate(() => {
    const d = new Date(), today = Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
    localStorage.setItem('sg:site:profiles', JSON.stringify({ v: 1, seq: 2, list: [
      { k: 'p1', a: 1, c: 1, b: '6-7', xp: 0, lv: 1, d0: today - 3, dl: today - 3, g: {} },
      { k: 'p2', a: 2, c: 2, b: '8-9', xp: 40, lv: 2, d0: today - 3, dl: today - 3, g: { 'air-hockey': 1 } }] }));
    sessionStorage.setItem('sg:site:player', 'p1');
  });
  await page.goto(origin + '/');
  await page.evaluate(() => SGProfiles.select('p2'));
  await page.clock.fastForward(60000);
  await until(() => bySession(batches(state)).size === 2, 'both sessions');
  const [[, never], [, played]] = [...bySession(batches(state))];
  // Made 3 days ago; days since the last play -1 for the one that never played; 2 profiles on the PC.
  like(never, [['ss', 0, 0, 3, -1, 1, 2, 0], ['se', int, 0, 'p']], 'never played');
  like(played, [['ss', 0, 0, 3, 3, 2, 2, 0]], 'played 3 days ago');
  await checkBatches(page, batches(state));
  const codes = (await rid(page)).k;
  assert.deepEqual(Object.keys(codes).sort(), ['p1', 'p2']);
  assert.notEqual(codes.p1, codes.p2, 'each profile has its own code');
  assert.deepEqual([...new Set(batches(state).map(b => b.u))], [codes.p1, codes.p2]);
});

test('the queue survives a reload, sends oldest first, and keeps at most 128 KB, 7 days and nothing from before a clear; an older build\'s v2 batches go unchanged', async t => {
  let down = true;
  const state = await setup(t, { clock: true, answer: () => down ? 503 : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/seed.html');
  const now = await page.evaluate(() => Date.now());
  const envelope = (b, ev) => ({ v: 2, b, s: '0123456789ab', k: 'src', m: 'web', a: '', d: [4, 4, 1920], ev });
  // Five batches of about 26 KB (200 of the largest events the server takes), the oldest
  // first, then entries the sink must drop.
  const most = ['re', 1, 'air-hockey', 'w', 'Level_abcdefghijklmnopq', 108e5, 1e9, 9, 1e5, 1e5, [1e5, 1e5, 1e5, 1e5, 1e5, 1e5]];
  const big = i => ({ t: now - 3600000 + i, e: envelope(i.toString(16).padStart(16, 'a'), Array.from({ length: 200 }, () => most)) });
  const seeded = [
    { t: now - 8 * 86400000, e: envelope('b'.repeat(16), [['lv', 1, 2]]) },        // more than 7 days old
    { t: now - 7200000, e: envelope('c'.repeat(16), [['lv', 1, 2]]) },             // before the teacher's clear
    { t: 'yesterday', e: envelope('d'.repeat(16), []) }, null, 'text', { t: now, e: { v: 1, b: 'e'.repeat(16), ev: [] } },
    ...[1, 2, 3, 4, 5].map(big)
  ];
  // Where a build before wire version 3 queued them.
  await page.evaluate(([key, q, cleared]) => {
    localStorage.setItem(key, JSON.stringify(q));
    localStorage.setItem('sg:site:statsmeta', JSON.stringify({ pc: { id: 'pcwxyz' }, clearedAt: cleared }));
  }, [oldKey(INGEST), seeded, now - 5400000]);
  await page.goto(origin + '/');
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the first send');
  await page.waitForFunction(() => window.fetched === 1);
  assert.equal(await tm(page, oldKey(INGEST)), null, 'the older build\'s batches moved to this build\'s queue');
  let stored = await queue(page);
  assert.ok(JSON.stringify(stored).length <= 131072, 'at most 128 KB');
  // The record tells the teacher page that unsent play was dropped: the 8-day-old batch went
  // for its age (a day ago), the oldest big one for room (now).
  const dropped = (await dx(page)).x;
  assert.ok(dropped > now - 864e5 && dropped <= now + 60000, 'dropped for room ' + (dropped - now) + ' ms from the seed');
  const kept = stored.map(x => x.e.b);
  // The oldest big batch made room for the new one; the dropped entries are gone.
  assert.deepEqual(kept.slice(0, -1), [2, 3, 4, 5].map(i => i.toString(16).padStart(16, 'a')));
  like(stored.at(-1).e.ev, [['ss', 0, 0, -1, -1, 0, 0, 0]]);
  // A v3 entry keeps its session's start (w0, never sent); w is added at each send.
  assert.deepEqual(Object.keys(stored.at(-1)), ['t', 'w0', 'e']);
  assert.equal(stored.at(-1).w0, now);
  assert.equal(stored.at(-1).e.w, undefined);
  assert.equal(JSON.parse(state.posts[0].body).b, kept[0], 'the oldest batch goes first');

  // A reload while the server is failing: the session's end joins the queue, and the
  // unloading page sends nothing to a failing server.
  await page.reload();
  assert.equal(state.posts.length, 1);
  stored = await queue(page);
  assert.deepEqual(stored.map(x => x.e.b).slice(0, -1), kept);
  like(stored.at(-1).e.ev, [['se', 60, 0, 'u']]);
  assert.equal(stored.at(-1).e.s, stored.at(-2).e.s);
  const order = stored.map(x => x.e.b);
  down = false;
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 2 + order.length, 'every batch delivered');
  await page.waitForFunction(n => window.fetched === n, 1 + order.length);
  const sent = batches(state).slice(1, 1 + order.length);
  assert.deepEqual(sent.map(b => b.b), order, 'oldest first');
  // Batches queued by an older build go exactly as they were queued, as v2.
  assert.deepEqual(state.posts.slice(1, 5).map(p => p.body), seeded.slice(-4).map(x => JSON.stringify(x.e)));
  // The first page's session, sent by the next page: both batches date from its queued
  // start, 120 s before this send, though its end came at 60 s.
  assert.deepEqual(sent.slice(-2).map(b => [b.ev[0][0], b.w]), [['ss', 120], ['se', 120]]);
  const last = JSON.parse(state.posts.at(-1).body);
  like(last.ev, [['ss', 0, 0, -1, -1, 0, 0, 0]], 'then the new page\'s session');
  assert.equal(last.w, 60, 'by the new page\'s own clock');
  assert.notEqual(last.s, stored.at(-1).e.s, 'a new page has a new session');
  assert.equal(await queue(page), null);
  serverKeeps(batches(state));
});

test('play a closing page handed over is dropped for 7 days or 128 KB without being called lost; play never handed over is', async t => {
  const state = await setup(t, { clock: true, answer: () => 503 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/seed.html');
  const now = await page.evaluate(() => Date.now()), week = 7 * 864e5;
  const envelope = (b, ev) => ({ v: 2, b, s: '0123456789ab', k: 'src', m: 'web', a: '', d: [4, 4, 1920], ev });
  // After the holidays: what the last portal page handed to fetch as it closed, 8 days ago
  // (its answer came after the page had gone), and five batches of about 26 KB, each
  // handed over the same way, that just fit in 128 KB: the page's first batch makes room
  // as it is saved.
  const most = ['re', 1, 'air-hockey', 'w', 'Level_abcdefghijklmnopq', 108e5, 1e9, 9, 1e5, 1e5, [1e5, 1e5, 1e5, 1e5, 1e5, 1e5]];
  const ids = [1, 2, 3, 4, 5].map(i => i.toString(16).padStart(16, 'a'));
  const seeded = [{ t: now - 8 * 864e5, h: 1, e: envelope('b'.repeat(16), [['lv', 1, 2]]) },
    ...ids.map((b, i) => ({ t: now - 36e5 + i, h: 1, e: envelope(b, Array.from({ length: 200 }, () => most)) }))];
  const size = q => 1 + q.reduce((n, x) => n + JSON.stringify(x).length + 1, 0);
  while (size(seeded.slice(1)) > 131072) seeded.at(-1).e.ev.pop();
  await page.evaluate(([key, q]) => localStorage.setItem(key, JSON.stringify(q)), [qKey(INGEST), seeded]);
  await page.goto(origin + '/');
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the first send');
  await inFlight(page);
  const stored = await queue(page);
  assert.deepEqual(stored.map(x => x.e.b).slice(0, -1), ids.slice(1), 'the 8-day-old batch and the oldest big one went');
  like(stored.at(-1).e.ev, [['ss', 0, 0, -1, -1, 0, 0, 0]]);
  assert.equal((await dx(page)).x, 0, 'and the teacher page is not told that play was dropped');
  // A batch no page ever handed over is lost when it turns 7 days old, and the record says when.
  const late = now - 8 * 864e5;
  await page.evaluate(([key, x]) => localStorage.setItem(key, JSON.stringify([x, ...JSON.parse(localStorage.getItem(key))])),
    [qKey(INGEST), { t: late, e: envelope('c'.repeat(16), [['lv', 1, 2]]) }]);
  await page.clock.runFor(20000);
  await until(() => state.posts.length === 2, 'the retry');
  await inFlight(page);
  assert.equal(JSON.parse(state.posts[1].body).b, ids[1], 'it is not sent');
  assert.equal((await dx(page)).x, late + week);
});

test('a hidden page sends what waits by fetch with keepalive, unloading ends the session, offline keeps the queue, and no cookie goes', async t => {
  const state = await setup(t), { page } = state;
  // A cookie of the ingest server (a district sign-in, a load balancer's) goes on
  // neither path; sendBeacon would always send it.
  await state.context.addCookies([COOKIE]);
  await page.goto(origin + '/');
  await setHidden(page, true);
  await until(() => state.posts.length === 1, 'the hidden page\'s send');
  assert.deepEqual([state.posts[0].type, state.posts[0].method, state.posts[0].url], ['fetch', 'POST', INGEST]);
  assert.match(state.posts[0].headers['content-type'], /^text\/plain/);
  const first = JSON.parse(state.posts[0].body);
  like(first.ev, [['ss', 0, 0, -1, -1, 0, 0, 0]]);
  // Kept until the server's answer, which reaches the hidden page: then it goes.
  await page.waitForFunction(key => localStorage.getItem(key) === null, qKey(INGEST));
  like(await dx(page), { v: 1, u: INGEST, ok: pos, f: 0, k: '', at: 0, x: 0 }, 'the delivery is noted for the teacher page');
  await setHidden(page, false);

  // A game, then the page unloads: the open game closes and the session ends at once.
  await play(page, 'air-hockey');
  const before = state.posts.length;
  await page.goto(origin + '/seed.html');
  await until(() => state.posts.slice(before).some(p => JSON.parse(p.body).ev.some(ev => ev[0] === 'se')), 'the unloading page\'s send');
  const unload = state.posts.slice(before);
  // A beacon would be a 'ping' (Chromium reports a keepalive fetch that outlives its page as 'xhr').
  assert.ok(unload.every(p => p.type !== 'ping' && p.method === 'POST' && p.url === INGEST && /^text\/plain/.test(p.headers['content-type'])),
    JSON.stringify(unload.map(p => [p.type, p.method, p.url, p.headers['content-type']])));
  const last = unload.map(p => JSON.parse(p.body)).find(b => b.ev.some(ev => ev[0] === 'se'));
  assert.equal(last.s, first.s, 'the same session');
  like(last.ev.slice(-2), [['gx', int, 1, 'air-hockey', 0, zeros(6), zeros(4)], ['se', int, 0, 'u']]);
  assert.ok(allEvents(state).some(ev => ev[0] === 'go' && ev[3] === 'air-hockey'));
  // The page went before the answer could come: the queue keeps what it handed to fetch,
  // for the next page (the server keeps a batch once), marked as handed over as the page
  // went, so the teacher page does not count it as never sent.
  assert.deepEqual((await queue(page)).map(x => x.e.b), unload.map(p => JSON.parse(p.body).b));
  assert.ok((await queue(page)).every(x => x.h === 1), 'marked h: 1');

  // Offline: nothing goes and the batches wait in the queue.
  const sent = state.posts.length;
  await page.goto(origin + '/');
  await page.evaluate(() => Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false }));
  await setHidden(page, true);
  like((await queue(page)).map(x => x.e.ev.at(-1)[0]), [...unload.map(p => JSON.parse(p.body).ev.at(-1)[0]), 'ss']);
  assert.equal(state.posts.length, sent, 'nothing goes while offline');
  for (const p of state.posts) assert.equal(p.headers.cookie, undefined, 'no cookie, neither while the page lives nor as it unloads');
  await checkBatches(page, batches(state));
});

test('a hidden page hands fetch only what fits in 60 KB of keepalive bodies in flight, oldest first, and keeps every batch until it is answered', async t => {
  const state = await setup(t, { clock: true, answer: n => n === 1 ? 'hang' : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/seed.html');
  const now = await page.evaluate(() => Date.now());
  // Four batches of about 26 KB (200 of the largest events the server takes), oldest first.
  const most = ['re', 1, 'air-hockey', 'w', 'Level_abcdefghijklmnopq', 108e5, 1e9, 9, 1e5, 1e5, [1e5, 1e5, 1e5, 1e5, 1e5, 1e5]];
  const ids = [1, 2, 3, 4].map(i => i.toString(16).padStart(16, 'a'));
  const seeded = ids.map((b, i) => ({ t: now - 3600000 + i,
    e: { v: 2, b, s: '0123456789ab', k: 'src', m: 'web', a: '', d: [4, 4, 1920], ev: Array.from({ length: 200 }, () => most) } }));
  assert.ok(seeded.every(x => JSON.stringify(x.e).length > 20000 && JSON.stringify(x.e).length < 30000));
  await page.evaluate(([key, q]) => localStorage.setItem(key, JSON.stringify(q)), [qKey(INGEST), seeded]);
  await page.goto(origin + '/');
  // The oldest goes by the 60 s send and is never answered: its body stays in flight.
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the first send');
  await setHidden(page, true);
  await until(() => state.posts.length === 2, 'the hidden page\'s send');
  await page.waitForFunction(() => window.fetched === 1);
  assert.deepEqual(state.posts.map(p => JSON.parse(p.body).b), ids.slice(0, 2), 'only one more fits beside the one in flight');
  assert.ok(state.posts.every(p => p.type === 'fetch'));
  let stored = await queue(page);
  assert.deepEqual(stored.map(x => x.e.b).slice(0, -1), [ids[0], ids[2], ids[3]], 'only the answered batch is gone; the one in flight and the rest stay');
  like(stored.at(-1).e.ev, [['ss', 0, 0, -1, -1, 0, 0, 0]]);
  // That send was answered, so its bytes are free again: the page hidden once more sends the
  // next, and not the one still in flight.
  await setHidden(page, false);
  await setHidden(page, true);
  await until(() => state.posts.length === 3, 'the next hidden page\'s send');
  assert.equal(JSON.parse(state.posts[2].body).b, ids[2]);
  await page.waitForFunction(() => window.fetched === 2);
  stored = await queue(page);
  assert.deepEqual(stored.map(x => x.e.b).slice(0, -1), [ids[0], ids[3]]);
  serverKeeps(batches(state));
});

test('a copy of the site elsewhere on this origin, built with another address, never sends this copy\'s queue, and stopping drops both', async t => {
  const OTHER = 'https://ingest.test/copy/v1/batch', down = new Set([INGEST]);
  assert.notEqual(qKey(OTHER), qKey(INGEST));
  const state = await setup(t, { clock: true, copy: { url: OTHER, allowLocal: true }, answer: (n, post) => down.has(post.url) ? 503 : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  // The copy at / cannot reach its server: its session waits in its queue, and the
  // session's end joins it as the page goes.
  await page.goto(origin + '/');
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the first copy\'s send');
  await page.waitForFunction(() => window.fetched === 1);
  const refused = JSON.parse(state.posts[0].body);
  // The copy at /copy/ sends its own session to its own server, and nothing else.
  await page.goto(origin + '/copy/');
  assert.equal(await page.evaluate(() => SGTelemetry.active()), true);
  await page.clock.runFor(60000);
  await until(() => state.posts.length > 1, 'the second copy\'s send');
  await page.waitForFunction(() => window.fetched >= 1);
  await page.clock.runFor(60000);
  const other = state.posts.slice(1);
  assert.ok(other.every(p => p.url === OTHER && JSON.parse(p.body).s !== refused.s), 'the second copy never sends the first one\'s batches');
  like(other.map(p => JSON.parse(p.body).ev), [[['ss', 0, 0, -1, -1, 0, 0, 0]]], 'only its own session');
  // The first copy's queue is neither sent nor dropped by the second.
  const kept = await queue(page, INGEST);
  like(kept.map(x => [x.e.s, x.e.ev.map(ev => ev[0])]), [[refused.s, ['ss']], [refused.s, ['se']]]);
  assert.deepEqual(kept[0].e, bare(refused), 'the very batch its server refused');
  // Both copies share this PC's code (one origin, one sg:site:rid).
  assert.equal(JSON.parse(other[0].body).p, refused.p);
  assert.equal(await queue(page, OTHER), null, 'the second copy delivered its own');

  // The second copy's server fails too: both copies have a queue. Stopping statistics
  // on this PC drops both, and the note.
  down.add(OTHER);
  await page.evaluate(() => SGTelemetry.level(3));
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 3, 'the second copy\'s next send');
  await page.waitForFunction(() => window.fetched === 2);
  like((await queue(page, OTHER)).map(x => x.e.ev), [[['lv', int, 3]]]);
  assert.deepEqual(await tmKeys(page), [qKey(INGEST), qKey(OTHER), 'sg:site:tm:dx', 'sg:site:tm:on'].sort());
  await page.evaluate(() => localStorage.setItem('sg:site:statsmeta', JSON.stringify({ pc: { id: 'pcwxyz' }, off: true, offSince: Date.now() })));
  assert.equal(await page.evaluate(() => SGTelemetry.active()), false);
  assert.deepEqual(await tmKeys(page), [], 'both queues and the notes are gone');
  serverKeeps(batches(state));
});

test('a portal tab of a build before wire version 3, still open on this PC, never drops this build\'s batches, and its own join them', async t => {
  let down = true;
  const state = await setup(t, { clock: true, answer: () => down ? 503 : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/');
  // The server fails: the session's start waits in this build's queue.
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the first send');
  await page.waitForFunction(() => window.fetched === 1);
  const waiting = JSON.parse(state.posts[0].body);
  // The older tab's sink (wire version 2) reads and writes sg:site:tm:q:<hash>: each time
  // it queues a batch of its own, has one delivered or is hidden, it keeps only the v: 2
  // entries there and writes them back.
  const old = await state.context.newPage();
  await old.goto(origin + '/seed.html');
  const now = await old.evaluate(() => Date.now());
  const own = { t: now, e: { v: 2, b: 'f'.repeat(16), s: '0123456789ab', k: 'src', m: 'web', a: '', d: [4, 4, 1920], ev: [['ss', 0, 0, 0, 4, 0]] } };
  await old.evaluate(([key, mine]) => {
    let q = [];
    try { q = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { /* none */ }
    localStorage.setItem(key, JSON.stringify(q.filter(x => x && x.e && x.e.v === 2).concat(mine)));
  }, [oldKey(INGEST), own]);
  assert.deepEqual((await queue(page)).map(x => x.e), [bare(waiting)], 'this build\'s batch is still waiting');
  // The server is back: the waiting batch goes again, then the older tab's, as it queued it.
  down = false;
  await page.clock.runFor(20000);
  await until(() => state.posts.length === 3, 'both batches');
  await page.waitForFunction(() => window.fetched === 3);
  assert.deepEqual(bare(JSON.parse(state.posts[1].body)), bare(waiting));
  assert.equal(state.posts[2].body, JSON.stringify(own.e));
  assert.deepEqual(await tmKeys(page), ['sg:site:tm:dx', 'sg:site:tm:on'], 'nothing waits, and the older key is gone');
  serverKeeps(batches(state));
});

test('a portal tab of the first v3 build, still open on this PC, never drops this build\'s batches when it is hidden, and its own join them', async t => {
  // That build (before 31 October 2026) queued in sg:site:tm:q3:<hash>, and a hidden page
  // of it removed every batch it handed to fetch at once, without waiting for an answer.
  let down = true;
  const state = await setup(t, { clock: true, answer: () => down ? 'abort' : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/');
  // The school filter blocks the server: this build's session start waits in its queue.
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the first send');
  await inFlight(page);
  const waiting = JSON.parse(state.posts[0].body);
  const old = await state.context.newPage();
  await old.goto(origin + '/seed.html');
  const now = await old.evaluate(() => Date.now());
  const own = b => ({ t: now, w0: now, e: { v: 3, b, s: 'fedcbafedcba', k: 'src', m: 'web', a: '', d: [4, 4, 1920], u: '', p: '', z: '', ev: [['lv', 5, 2]] } });
  // What that tab does with its key: it queues a batch of its own, and when it is hidden it
  // hands every batch there to fetch and writes the key back without them.
  const oldTab = {
    queue: x => old.evaluate(([key, x]) => localStorage.setItem(key, JSON.stringify((JSON.parse(localStorage.getItem(key)) || []).concat(x))), [q3Key(INGEST), x]),
    hide: () => old.evaluate(key => localStorage.removeItem(key), q3Key(INGEST))
  };
  await oldTab.queue(own('e'.repeat(16)));
  await oldTab.hide();
  assert.deepEqual((await queue(page)).map(x => x.e), [bare(waiting)], 'this build\'s batch is still waiting');
  // A batch that tab queues joins this build's queue at this build's next send, and its key goes.
  await oldTab.queue(own('f'.repeat(16)));
  await page.clock.runFor(20000);
  await until(() => state.posts.length === 2, 'the retry');
  await inFlight(page);
  assert.equal(await tm(page, q3Key(INGEST)), null, 'the older key is gone');
  assert.deepEqual((await queue(page)).map(x => x.e.b), [waiting.b, 'f'.repeat(16)]);
  await oldTab.hide();
  assert.deepEqual((await queue(page)).map(x => x.e.b), [waiting.b, 'f'.repeat(16)], 'hiding that tab again drops nothing');
  // The filter lets the server through: both go, oldest first, as they were queued.
  down = false;
  await page.clock.runFor(40000);
  await until(() => state.posts.length === 4, 'both batches');
  await inFlight(page);
  assert.deepEqual(state.posts.slice(2).map(p => JSON.parse(p.body).b), [waiting.b, 'f'.repeat(16)]);
  assert.deepEqual(bare(JSON.parse(state.posts[3].body)), own('f'.repeat(16)).e);
  assert.deepEqual(await tmKeys(page), ['sg:site:tm:dx', 'sg:site:tm:on'], 'nothing waits');
  serverKeeps(batches(state));
});

// What the teacher page finds in older builds' keys, written as those builds write them.
const storage = p => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
const v3At = (b, t) => ({ t, w0: t, e: { v: 3, b, s: 'fedcbafedcba', k: 'src', m: 'web', a: '', d: [4, 4, 1920], u: '', p: '', z: '', ev: [['lv', 5, 2]] } });
const seed = (page, items) => page.evaluate(items => items.forEach(([k, v]) => localStorage.setItem(k, v)), items);

test('the teacher page only reads what older builds\' tabs queued: it counts it, its test sends only this build\'s batches and says what still waits', async t => {
  const state = await setup(t, { clock: true, answer: (n, post) => isHealth(post) ? HEALTH : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/seed.html');
  const now = await page.evaluate(() => Date.now());
  // A portal tab of a build before wire version 3 and one of the first v3 build, still open
  // on the PC, each with a batch in its own key; a portal page of this build ran too: it
  // noted the address and left a newer batch.
  const v2 = { t: now - 2 * 36e5, e: { v: 2, b: 'f'.repeat(16), s: '0123456789ab', k: 'src', m: 'web', a: '', d: [4, 4, 1920], ev: [['lv', 5, 2]] } };
  const v3 = v3At('e'.repeat(16), now - 36e5), mine = v3At('1'.repeat(16), now);
  await seed(page, [[oldKey(INGEST), JSON.stringify([v2])], [q3Key(INGEST), JSON.stringify([v3])], [qKey(INGEST), JSON.stringify([mine])],
    ['sg:site:tm:dx', JSON.stringify({ v: 1, u: INGEST, ok: 0, f: 0, k: '', at: 0, x: 0 })]]);
  const before = await storage(page);
  const teacher = await state.context.newPage();
  teacher.on('pageerror', error => state.errors.push('teacher: ' + error.message));
  await teacher.goto(origin + '/teacher.html');
  // The box counts all three, dated from the oldest (no closing page sent it).
  like(await teacher.evaluate(() => SGTelemetry.status()), { why: '', host: 'ingest.test', ok: 0, f: 0, k: '', at: 0, x: 0, n: 3, t: v2.t, o: v2.t });
  assert.deepEqual(await storage(teacher), before, 'reading moved nothing: each older key stays where its tab reads it');
  // The test sends only this build's batch, and counts the others as still waiting.
  like(await teacher.evaluate(() => new Promise(resolve => SGTelemetry.check(resolve))), { k: 'ok', host: 'ingest.test', reached: true, sent: 1, n: 2 });
  assert.deepEqual(state.posts.map(p => p.method + ' ' + p.url), ['GET https://ingest.test/v1/health', 'POST ' + INGEST]);
  assert.deepEqual(bare(JSON.parse(state.posts[1].body)), mine.e);
  assert.deepEqual([await tm(teacher, oldKey(INGEST)), await tm(teacher, q3Key(INGEST))], [before[oldKey(INGEST)], before[q3Key(INGEST)]],
    'the older tabs\' batches are still in their keys');
  like(await teacher.evaluate(() => SGTelemetry.status()), { why: '', host: 'ingest.test', ok: pos, f: 0, k: '', at: 0, x: 0, n: 2, t: v2.t, o: v2.t });
  serverKeeps(batches(state));
  await teacher.close();
});

test('the teacher\'s test ends a failure by health alone only when nothing waits, older builds\' batches included', async t => {
  const state = await setup(t, { clock: true, answer: (n, post) => isHealth(post) ? HEALTH : 'abort' }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/seed.html');
  const now = await page.evaluate(() => Date.now());
  // The school filter lets the health check through and stops what is sent: a portal page of
  // this build noted it, and two batches wait in the key of a first v3 build's tab, which
  // backs off.
  const old = [v3At('2'.repeat(16), now - 2 * 36e5), v3At('3'.repeat(16), now - 36e5)];
  const failing = { v: 1, u: INGEST, ok: now - 2 * 864e5, f: now - 3 * 36e5, k: 'network', at: now - 6e5, x: 0 };
  await seed(page, [[q3Key(INGEST), JSON.stringify(old)], ['sg:site:tm:dx', JSON.stringify(failing)]]);
  const teacher = await state.context.newPage();
  teacher.on('pageerror', error => state.errors.push('teacher: ' + error.message));
  await teacher.goto(origin + '/teacher.html');
  like(await teacher.evaluate(() => SGTelemetry.status()), { why: '', host: 'ingest.test', ok: failing.ok, f: failing.f, k: 'network', at: failing.at, x: 0, n: 2, t: old[0].t, o: old[0].t });
  // The test has nothing of this build's to send, so it asks health alone: that the server
  // answers ends no failure, and the result says that two still wait.
  like(await teacher.evaluate(() => new Promise(resolve => SGTelemetry.check(resolve))), { k: 'ok', host: 'ingest.test', reached: true, sent: 0, n: 2 });
  assert.deepEqual(state.posts.map(p => p.method + ' ' + p.url), ['GET https://ingest.test/v1/health']);
  assert.deepEqual(await dx(teacher), failing, 'the failure still dates from when it began');
  assert.deepEqual(JSON.parse(await tm(teacher, q3Key(INGEST))), old);
  await teacher.close();
});

test('a batch the server refuses in the teacher\'s test stays a refusal: neither health, a later delivery nor a later failure ends it, and the result says how many arrived', async t => {
  let refused = [], later = 204;
  const state = await setup(t, { clock: true, answer: (n, post) => isHealth(post) ? HEALTH : refused.includes(JSON.parse(post.body).b) ? serverError(400, 'envelope') : later }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/seed.html');
  const now = await page.evaluate(() => Date.now());
  // A portal page of this build noted the address, had a batch delivered a day ago, and
  // left one that the server answers with its JSON 400 (a client and a server of versions
  // that do not match).
  const delivered = { v: 1, u: INGEST, ok: now - 864e5, f: 0, k: '', at: 0, x: 0 };
  refused = ['4'.repeat(16)];
  await seed(page, [[qKey(INGEST), JSON.stringify([v3At('4'.repeat(16), now - 36e5)])], ['sg:site:tm:dx', JSON.stringify(delivered)]]);
  const teacher = await state.context.newPage();
  teacher.on('pageerror', error => state.errors.push('teacher: ' + error.message));
  await teacher.goto(origin + '/teacher.html');
  const check = () => teacher.evaluate(() => new Promise(resolve => SGTelemetry.check(resolve)));
  let n = state.posts.length;
  const since = () => state.posts.slice(n).map(p => p.method + ' ' + p.url);
  // The batch is gone, as from the portal; that health answered ends nothing, and the
  // result is the refusal, not «nothing was waiting».
  like(await check(), { k: 'refused', host: 'ingest.test', reached: true, sent: 0, n: 0 });
  assert.deepEqual(since(), ['GET https://ingest.test/v1/health', 'POST ' + INGEST]);
  assert.equal(await queue(teacher), null);
  like(await dx(teacher), { v: 1, u: INGEST, ok: delivered.ok, f: now, k: 'refused', at: now, x: 0 });
  // An older batch refused, a newer one delivered 15 s later: both go, the record notes the
  // delivery and still ends with the refusal, dated when it came, and the result counts
  // what arrived.
  n = state.posts.length;
  refused = ['6'.repeat(16)];
  await seed(teacher, [[qKey(INGEST), JSON.stringify([v3At('6'.repeat(16), now - 2 * 36e5), v3At('7'.repeat(16), now - 36e5)])]]);
  await teacher.evaluate(() => {
    const realFetch = window.fetch;
    window.fetch = (url, init) => init && init.body && JSON.parse(init.body).b === '7'.repeat(16)
      ? new Promise(resolve => { window.release = () => resolve(realFetch(url, init)); }) : realFetch(url, init);
    window.result = null;
    SGTelemetry.check(r => { window.result = r; });
  });
  await teacher.waitForFunction(() => !!window.release);
  await teacher.clock.runFor(15000);
  await teacher.evaluate(() => window.release());
  await teacher.waitForFunction(() => window.result !== null);
  like(await teacher.evaluate(() => window.result), { k: 'refused', host: 'ingest.test', reached: true, sent: 1, n: 0 });
  assert.deepEqual(since(), ['GET https://ingest.test/v1/health', 'POST ' + INGEST, 'POST ' + INGEST]);
  assert.deepEqual(batches(state).slice(-2).map(b => b.b), ['6'.repeat(16), '7'.repeat(16)], 'oldest first');
  assert.equal(await queue(teacher), null);
  const end = now + 15000;
  like(await dx(teacher), { v: 1, u: INGEST, ok: end, f: end, k: 'refused', at: now, x: 0 });
  // A refusal, then a batch that fails another way (a 5xx, or no answer within 20 s): the
  // result and the record are still the refusal, and that batch waits.
  for (const answer of [serverError(503), 'hang']) {
    n = state.posts.length;
    later = answer;
    refused = ['8'.repeat(16)];
    await seed(teacher, [[qKey(INGEST), JSON.stringify([v3At('8'.repeat(16), now - 2 * 36e5), v3At('9'.repeat(16), now - 36e5)])]]);
    const at = await teacher.evaluate(() => Date.now());
    await teacher.evaluate(() => { window.result = null; SGTelemetry.check(r => { window.result = r; }); });
    await until(() => state.posts.length === n + 3, 'the batch after the refusal');
    if (answer === 'hang') await teacher.clock.runFor(20000);
    await teacher.waitForFunction(() => window.result !== null);
    like(await teacher.evaluate(() => window.result), { k: 'refused', host: 'ingest.test', reached: true, sent: 0, n: 1 }, String(answer.status || answer));
    assert.deepEqual(since(), ['GET https://ingest.test/v1/health', 'POST ' + INGEST, 'POST ' + INGEST]);
    assert.deepEqual((await queue(teacher)).map(x => x.e.b), ['9'.repeat(16)], 'the other batch still waits');
    like(await dx(teacher), { v: 1, u: INGEST, ok: end, f: at, k: 'refused', at, x: 0 }, 'the record after ' + (answer.status || answer));
  }
  await teacher.close();
});

// js/telemetry.js of the first v3 build, the last one published before the q4 queue (CI
// checkouts without history skip this; the tests above seed its key as it writes it).
const FIRST_V3 = 'b713f12';
const firstV3 = (() => {
  const shown = spawnSync('git', ['show', `${FIRST_V3}:js/telemetry.js`], { cwd: repo, encoding: 'utf8' });
  return shown.status === 0 && shown.stdout.includes("Q = TM + 'q3:'") ? shown.stdout : null;
})();

test('a portal tab of the first v3 build, still open on this PC, sends what it queued itself after the teacher page counted it',
  { skip: !firstV3 && `commit ${FIRST_V3} is not in this checkout (git show failed)` }, async t => {
  let down = true;
  const state = await setup(t, { clock: true, answer: () => down ? 'abort' : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  // That build's portal tab, never reloaded since the update: the school filter blocks its
  // first send, so its session's start waits in its own key and goes again after 20 s.
  await page.goto(origin + '/seed.html');
  await page.addScriptTag({ content: firstV3 });
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the old tab\'s first send');
  await inFlight(page);
  const old = JSON.parse(await tm(page, q3Key(INGEST)));
  like(old.map(x => x.e.ev.map(ev => ev[0])), [['ss']]);
  // A portal page of this build ran on the PC too and noted the address.
  await seed(page, [['sg:site:tm:dx', JSON.stringify({ v: 1, u: INGEST, ok: 0, f: 0, k: '', at: 0, x: 0 })]]);
  const teacher = await state.context.newPage();
  teacher.on('pageerror', error => state.errors.push('teacher: ' + error.message));
  await teacher.goto(origin + '/teacher.html');
  like(await teacher.evaluate(() => SGTelemetry.status()), { why: '', host: 'ingest.test', ok: 0, f: 0, k: '', at: 0, x: 0, n: 1, t: old[0].t, o: old[0].t });
  // The filter lets the server through: that tab's retry finds its batch where it left it.
  down = false;
  await page.clock.runFor(20000);
  await until(() => state.posts.length === 2, 'the old tab\'s retry');
  await inFlight(page);
  assert.deepEqual(bare(JSON.parse(state.posts.at(-1).body)), old[0].e);
  assert.equal(await tm(page, q3Key(INGEST)), null, 'delivered, and gone');
  like(await teacher.evaluate(() => SGTelemetry.status()), { why: '', host: 'ingest.test', ok: 0, f: 0, k: '', at: 0, x: 0, n: 0, t: 0, o: 0 });
  serverKeeps(batches(state));
  await teacher.close();
});

test('each player gets a new session: the old one ends after its game with why it ended, and a band change marks later batches', async t => {
  const state = await setup(t, { clock: true }), { page } = state;
  await page.goto(origin + '/');
  await page.evaluate(() => { SGProfiles.create(1, 4, '6-7'); });
  await play(page, 'air-hockey');
  // The classroom timer runs out and the device is handed over: the child's game
  // closes after the switch to the guest, and still belongs to the child's session.
  await page.locator('#classroom summary').click();
  await page.locator('#sessionMinutes').selectOption('5');
  await page.locator('#sessionStart').click();
  await page.clock.fastForward(300001);
  await page.locator('#sessionHandoff').waitFor({ state: 'visible' });
  await page.locator('#sessionEnd').click();
  await page.waitForFunction(() => document.body.className === 'route-home');
  await until(() => allEvents(state).some(ev => ev[0] === 'gx'), 'the game closing');
  // The class band for guests changes: later batches carry it.
  await page.evaluate(() => SGProfiles.setClassBand('10-11'));
  await page.evaluate(() => SGTelemetry.level(3));   // a stand-in event so something waits
  await inFlight(page);
  await page.clock.fastForward(60000);
  await until(() => allEvents(state).some(ev => ev[0] === 'lv'), 'the batch after the band change');

  const list = batches(state);
  await checkBatches(page, list);
  const sessions = [...bySession(list)];
  assert.equal(sessions.length, 3);
  const [[first, guest], [second, child], [third, next]] = sessions;
  assert.equal(new Set([first, second, third]).size, 3, 'three session ids');
  like(guest, [['ss', 0, 0, -1, -1, 0, 0, 0], ['se', int, 0, 'p']], 'the first guest');
  // The timer started with 5 minutes and ran out; the hand-over button ended the session.
  like(child, [['ss', 0, 1, 0, -1, 1, 1, 0], ['go', int, 1, 'air-hockey', 'catalog', 0, 0], ['ld', int, 1, 'air-hockey', int],
    ['ct', int, 's', 5], ['ct', v => v >= 300, 'e', 0],
    ['gx', int, 1, 'air-hockey', 0, zeros(6), zeros(4)], ['se', int, 0, 'h']], 'the child: its game closes before its session ends');
  like(next, [['ss', 0, 0, -1, -1, 0, 1, 0], ['lv', int, 3]], 'the next guest');
  const band = s => [...new Set(list.filter(b => b.s === s && b.ev.some(ev => ev[0] !== 'lv')).map(b => b.a))];
  assert.deepEqual(band(first), ['']);
  assert.deepEqual(band(second), ['6-7']);
  assert.deepEqual(list.filter(b => b.s === third).map(b => [b.a, b.ev.map(ev => ev[0])]), [['', ['ss']], ['10-11', ['lv']]]);
});

test('a returning player\'s session start and game opens carry buckets, never the profile itself', async t => {
  const state = await setup(t, { clock: true }), { page } = state;
  await page.goto(origin + '/seed.html');
  // Made 40 days ago, last played 3 days ago, 100 XP (level 3), six visits to air-hockey.
  await page.evaluate(() => {
    const d = new Date(), today = Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
    localStorage.setItem('sg:site:profiles', JSON.stringify({ v: 1, seq: 3, list: [{ k: 'p3', a: 9, c: 6, b: '10-11', xp: 100, lv: 3,
      d0: today - 40, dl: today - 3, g: { 'air-hockey': 6, 'tic-tac-toe': 1 } }] }));
    sessionStorage.setItem('sg:site:player', 'p3');
  });
  await page.goto(origin + '/');
  assert.equal(await page.evaluate(() => SGProfiles.player()), 'p3');
  await play(page, 'air-hockey');
  await home(page);
  await play(page, 'tic-tac-toe');
  await home(page);
  await until(() => allEvents(state).filter(ev => ev[0] === 'gx').length === 2, 'both games closing');
  // The child hands over to a guest: the child's session ends, the guest's begins.
  await page.evaluate(() => SGProfiles.select(''));
  await page.clock.fastForward(60000);
  await until(() => bySession(batches(state)).size === 2, 'the guest\'s session');
  const list = batches(state);
  await checkBatches(page, list);
  const [[, child], [, guest]] = [...bySession(list)];
  // Exact days and plays before: made 40 days ago, last played 3 days ago, level 3.
  like(child.filter(ev => ['ss', 'go', 'se'].includes(ev[0])), [['ss', 0, 0, 40, 3, 3, 1, 0], ['go', int, 1, 'air-hockey', 'catalog', 6, 0],
    ['go', int, 2, 'tic-tac-toe', v => ['featured', 'catalog'].includes(v), 1, 0], ['se', int, int, 'p']], 'the child');
  like(guest, [['ss', 0, 0, -1, -1, 0, 1, 0]], 'the guest');
  assert.deepEqual([...new Set(list.map(b => b.a))], ['10-11', '']);
  const text = state.posts.map(p => p.body).join('\n');
  for (const secret of ['"p3"', '🐙', '#8e24aa', '"xp"', '"d0"']) assert.ok(!text.includes(secret), 'never ' + secret);
});

test('sg:telemetry from the game frame is checked field by field and numbered by visit and round; other windows and late frames are ignored', async t => {
  const state = await setup(t, { clock: true }), { page } = state;
  await page.goto(origin + '/');
  const frame = await play(page, 'air-hockey');
  const msg = (ev, extra) => ({ type: 'sg:telemetry', version: 2, e: 0, f: [0, 0, 0, 0], il: [0, 0, 0, 0, 0, 0], ev, ...extra });
  const rt = [1, 2, 0, 0, 0, 1], none = zeros(6);
  await post(page, frame, msg([
    ['rs', 'L1', 3],
    // A round's counters come right before its end (rounded as the server would).
    ['rx', 4100.4, 6, 2, 3, 650.6, 2, 600],
    ['re', 'w', 'L1', 4000.4, 120, 3, 5, 1, rt],
    ['rs', 'L1', 4],
    // An older Kit sends no counters.
    ['re', 'q', 'L1', 9e9, -1, 4, 2e6, 0, [0, 0, 0, 0, 0, 7]],
    // Dropped: ids that could be typed text, bad tiers, codes, numbers, histograms and arity.
    ['rs', 'L123', 1], ['rs', 'two words', 1], ['rs', 'constructor', 1], ['rs', '1-4', 1], ['rs', 'L1', 10], ['rs', 'L1', 1.5],
    ['rs', 'L1'], ['rs', 'L1', 1, 'extra'], ['re', 'x', 'L1', 1, 1, 1, 1, 1, rt], ['re', ['w'], 'L1', 1, 1, 1, 1, 1, rt],
    ['re', 'w', 'L1', -5, 1, 1, 1, 1, rt], ['re', 'w', 'L1', 1, -2, 1, 1, 1, rt], ['re', 'w', 'L1', 1, 1, 1, 'a', 1, rt],
    ['re', 'w', 'L1', 1, 1, 1, 1, 1, [1, 2, 3, 4, 5]], ['re', 'w', 'L1', 1, 1, 1, 1, 1, [1, 2, 3, 4, 5, -6]],
    ['re', 'w', 'L1', 1, 1, 1, 1, 1, rt, 'extra'], ['re', 'w', 'L1', null, 1, 1, 1, 1, rt], ['go', 0, 'x', 'direct', 0],
    ['se', 1, 2], 'rs', null, 42,
    // Kit's 64-event split: these counters reach the portal a message before their end.
    ['rs', 'w1-2', 0], ['rx', 2e7, 2e5, 2e4, 2e4, 2e9, 2e5, 1000]
  ], { e: 5000, f: [10, 2, 1, 0], il: [3, 1, 0, 0, 0, 0] }));
  await post(page, frame, msg([['re', 'e', 'w1-2', 10.4, -1, 0, 0, 0, none]]));
  // Counters that are malformed give x: null, and so do counters whose end was dropped.
  // An end whose start never came gets a round number of its own.
  await post(page, frame, msg([
    ['rs', 'L5', 1], ['rx', 1, 2, 3, 4, 5, 6], ['re', 'l', 'L5', 1, 1, 1, 0, 0, none],
    ['rs', 'L5', 1], ['rx', 1, 2, 3, 4, 5, 6, -2], ['re', 'l', 'L5', 1, 1, 1, 0, 0, none],
    ['rs', 'L5', 1], ['rx', 1, 2, 3, 4, 5, 6, 7], ['re', 'l', 'L5', 1, 1, 1, 0, 0, [1]], ['re', 'l', 'L5', 1, 1, 1, 0, 0, none],
    ['rs', 'L6', 1], ['rx', 1, 2, 'a', 4, 5, 6, 7], ['re', 'w', 'L7', 1, 1, 1, 0, 0, none]
  ]));
  // Whole messages: the wrong version, broken histograms (ignored), engaged time clamped.
  await post(page, frame, { ...msg([['rs', 'L9', 1]]), version: 1 });
  await post(page, frame, msg([], { e: 1e9, f: [1, 2, 3], il: [1, 1, 1, 1, 1, NaN] }));
  await post(page, frame, msg([], { e: -5, f: [1, 0, 0, 0], il: 'x' }));
  // Another window (the portal itself, a helper frame) never counts.
  await page.evaluate(data => {
    window.postMessage(data, location.origin);
    const helper = document.createElement('iframe');
    helper.srcdoc = '<script>parent.postMessage(' + JSON.stringify(data) + ', "*"); parent.postMessage({ type: "test:ping", n: -1 }, "*")<\/script>';
    document.body.appendChild(helper);
  }, msg([['rs', 'L7', 1]], { e: 7000 }));
  await page.waitForFunction(() => window.lastPing === -1);

  // Leaving: the removed frame's own last message (within 2 s) closes the game at once.
  // Paused a little ahead (a busy machine may take a second to get here); due timers fire once.
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 10000));
  await page.evaluate(() => { window.oldGame = document.querySelector('#stage iframe').contentWindow; });
  await home(page);
  const late = data => page.evaluate(d => dispatchEvent(new MessageEvent('message', { source: window.oldGame, origin: location.origin, data: d })), data);
  await late(msg([['rs', 'L2', 1]], { e: 1000, il: [0, 0, 1, 0, 0, 0] }));
  await until(() => allEvents(state).some(ev => ev[0] === 'gx'), 'the game closing');
  // Once its 'gx' is written, nothing more counts for that game, even within the 2 s.
  await late(msg([['rs', 'L5', 1]], { e: 500 }));
  await page.clock.runFor(2100);
  await late(msg([['rs', 'L3', 1]], { e: 1000 }));
  await page.clock.runFor(30000);

  const events = allEvents(state);
  await checkBatches(page, batches(state));
  like(events, [
    ['ss', 0, 0, -1, -1, 0, 0, 0],
    ['go', int, 1, 'air-hockey', 'catalog', 0, 0],
    ['ld', int, 1, 'air-hockey', int],
    ['rs', int, 1, 1, 'air-hockey', 'L1', 3, 0],
    ['re', int, 1, 1, 'air-hockey', 'w', 'L1', 4000, 120, 3, 5, 1, rt, [4100, 6, 2, 3, 651, 2, 600]],
    ['rs', int, 1, 2, 'air-hockey', 'L1', 4, 1],
    ['re', int, 1, 2, 'air-hockey', 'q', 'L1', 108e5, -1, 4, 1e5, 0, [0, 0, 0, 0, 0, 7], null],
    ['rs', int, 1, 3, 'air-hockey', 'w1-2', 0, 0],
    ['re', int, 1, 3, 'air-hockey', 'e', 'w1-2', 10, -1, 0, 0, 0, none, [108e5, 1e5, 1e4, 1e4, 1e9, 1e5, 1000]],
    ['rs', int, 1, 4, 'air-hockey', 'L5', 1, 0],
    ['re', int, 1, 4, 'air-hockey', 'l', 'L5', 1, 1, 1, 0, 0, none, null],
    ['rs', int, 1, 5, 'air-hockey', 'L5', 1, 1],
    ['re', int, 1, 5, 'air-hockey', 'l', 'L5', 1, 1, 1, 0, 0, none, null],
    ['rs', int, 1, 6, 'air-hockey', 'L5', 1, 2],
    ['re', int, 1, 6, 'air-hockey', 'l', 'L5', 1, 1, 1, 0, 0, none, null],
    ['rs', int, 1, 7, 'air-hockey', 'L6', 1, 0],
    ['re', int, 1, 8, 'air-hockey', 'w', 'L7', 1, 1, 1, 0, 0, none, null],
    ['rs', int, 1, 9, 'air-hockey', 'L2', 1, 0],
    ['gx', int, 1, 'air-hockey', 5000 + 120000 + 0 + 1000, [3, 1, 1, 0, 0, 0], [11, 2, 1, 0]]
  ]);
});

test('load failures are reported by kind, never with their text', async t => {
  const state = await setup(t, { clock: true }), { page } = state;
  // Stand-in game pages: one reports a startup error with a message, one never gets ready.
  await state.context.route('**/games/maze-dash/index.html', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><script>parent.postMessage({ type: "sg:error", version: 1, message: "secret error text" }, location.origin)</script>' }));
  await state.context.route('**/games/snake-arena/index.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>slow</title>' }));
  await page.goto(origin + '/');
  await page.locator('.catalog-grid .tile[data-slug="maze-dash"]').click();
  await page.locator('#stageMsg').waitFor({ state: 'visible' });
  await home(page);
  await page.locator('.catalog-grid .tile[data-slug="snake-arena"]').click();
  await page.waitForFunction(() => document.querySelector('#stage iframe'));
  await page.clock.fastForward(20001);
  await page.locator('#stageMsg').waitFor({ state: 'visible' });
  await home(page);
  await until(() => allEvents(state).filter(ev => ev[0] === 'gx').length === 2, 'both games closing');
  like(allEvents(state), [
    ['ss', 0, 0, -1, -1, 0, 0, 0],
    ['go', int, 1, 'maze-dash', v => SOURCES.includes(v), 0, 0], ['er', int, 1, 'maze-dash', 'x'], ['gx', int, 1, 'maze-dash', 0, zeros(6), zeros(4)],
    ['go', int, 2, 'snake-arena', v => SOURCES.includes(v), 0, 0], ['er', int, 2, 'snake-arena', 't'], ['gx', int, 2, 'snake-arena', 0, zeros(6), zeros(4)]
  ]);
  assert.ok(!state.posts.some(p => p.body.includes('secret')), 'no error text');
  await checkBatches(page, batches(state));
});

test('stopping statistics in another tab drops what waits and tells the open game at once, and keeps the codes', async t => {
  const state = await setup(t), { page } = state;
  await page.goto(origin + '/');
  await page.evaluate(() => SGProfiles.create(1, 4, '6-7'));
  const codes = await rid(page);
  assert.ok(codes.pc && codes.k.p1);
  const frame = await play(page, 'air-hockey');
  await page.evaluate(() => SGTelemetry.level(2));
  assert.equal(await page.evaluate(() => SGTelemetry.active()), true);
  const sent = state.posts.length;
  // The teacher page, in another tab, stops statistics.
  const teacher = await state.context.newPage();
  await teacher.goto(origin + '/seed.html');
  await teacher.evaluate(() => localStorage.setItem('sg:site:statsmeta', JSON.stringify({ pc: { id: 'pcwxyz' }, off: true, offSince: Date.now() })));
  await frame.waitForFunction(() => window.prefs.at(-1).telemetry === false);
  assert.equal(await page.evaluate(() => SGTelemetry.active()), false);
  assert.deepEqual(await tmKeys(page), [], 'the notes and the queue are gone');
  await home(page);
  await setHidden(page, true);
  await page.waitForTimeout(1500);
  assert.equal(state.posts.length, sent, 'nothing is sent after the stop');
  assert.ok(!allEvents(state).some(ev => ev[0] === 'lv'), 'nothing recorded before the stop is sent');
  // A child's long-term record is the server's: the codes stay, unchanged.
  assert.deepEqual(await rid(page), codes);
  await teacher.close();
});

/* ------------------------------------------------------------ wire v3 */
test('a code per profile, stable across sessions and reloads, none for a guest, one for the PC; a removed profile is told once', async t => {
  const state = await setup(t, { clock: true }), { page } = state;
  await page.goto(origin + '/');
  await page.evaluate(() => SGProfiles.create(1, 4, '6-7'));   // p1
  await page.evaluate(() => SGProfiles.create(2, 5, '8-9'));   // p2
  await page.evaluate(() => SGProfiles.select('p1'));
  const { pc, k: { p1, p2 } } = await rid(page);
  assert.ok([pc, p1, p2].every(v => /^[0-9a-f]{12}$/.test(v)) && new Set([pc, p1, p2]).size === 3, [pc, p1, p2].join());
  // A reload keeps the player (sessionStorage) and every code.
  await page.reload();
  assert.equal(await page.evaluate(() => SGProfiles.player()), 'p1');
  // Another profile goes while p1 plays: p1's session says so. Then p1 itself goes: the
  // guest's session that follows says so.
  await page.evaluate(() => SGProfiles.remove('p2'));
  assert.deepEqual(await rid(page), { v: 1, pc, k: { p1 }, l: {}, g: {} });
  await page.evaluate(() => SGProfiles.remove('p1'));
  assert.deepEqual(await rid(page), { v: 1, pc, k: {}, l: {}, g: {} });
  // Told once: the next page's session says nothing more.
  await page.reload();
  await page.clock.fastForward(60000);
  await until(() => bySession(batches(state)).size === 7, 'every session');
  // Each reload hands what waits to fetch as the page goes, and keeps it for the next page.
  const list = once(batches(state));
  await checkBatches(page, list);
  assert.deepEqual([...new Set(list.map(b => b.p))], [pc], 'one PC code, on every batch');
  const sessions = [...bySession(list)].map(([s, events]) => [list.find(b => b.s === s).u, events.filter(ev => ev[0] !== 'se')]);
  like(sessions, [
    ['', [['ss', 0, 0, -1, -1, 0, 0, 0]]],
    [p1, [['ss', 0, 1, 0, -1, 1, 1, 0]]],
    [p2, [['ss', 0, 1, 0, -1, 1, 2, 0]]],
    [p1, [['ss', 0, 0, 0, -1, 1, 2, 0]]],
    [p1, [['ss', 0, 0, 0, -1, 1, 2, 0], ['pr', int, p2]]],
    ['', [['ss', 0, 0, -1, -1, 0, 0, 0], ['pr', 0, p1]]],
    ['', [['ss', 0, 0, -1, -1, 0, 0, 0]]]
  ], 'sessions');
  const text = state.posts.map(p => p.body).join('\n');
  for (const secret of ['"p1"', '"p2"', 'sg:']) assert.ok(!text.includes(secret), 'never ' + secret);
});

test('sg:site:rid: an active sink repairs a damaged key and keeps the valid codes; storage that fails gives no codes', async t => {
  const profile = (k, a) => ({ k, a, c: 1, b: '8-9', xp: 0, lv: 1, d0: 20000, dl: 20000, g: {} });
  const seed = (page, value, player) => page.evaluate(([value, list, player]) => {
    localStorage.setItem('sg:site:profiles', JSON.stringify({ v: 1, seq: 9, list }));
    if (value !== null) localStorage.setItem('sg:site:rid', value);
    if (player) sessionStorage.setItem('sg:site:player', player);
  }, [value, [profile('p7', 1), profile('p9', 2)], player]);
  await t.test('damaged entries are dropped, valid ones kept', async t => {
    const state = await setup(t, { clock: true }), { page } = state;
    await page.goto(origin + '/seed.html');
    await seed(page, JSON.stringify({ v: 1, pc: 'NOT-A-CODE', k: { p7: 'abcdefabcdef', p8: 'short', x1: '0123456789ab', p9: 7 },
      l: { p9: ['0123456789ab'] }, g: { p7: 'abcdefabcdef', p9: 1 }, extra: 1 }), 'p7');
    await page.goto(origin + '/');
    const r = await rid(page);
    assert.match(r.pc, /^[0-9a-f]{12}$/);
    assert.deepEqual(r, { v: 1, pc: r.pc, k: { p7: 'abcdefabcdef' }, l: {}, g: { p7: 'abcdefabcdef' } }, 'p7 keeps its code; the rest is dropped');
    await page.clock.fastForward(60000);
    await until(() => state.posts.length === 1, 'the send');
    assert.deepEqual([batches(state)[0].u, batches(state)[0].p], ['abcdefabcdef', r.pc]);
    await checkBatches(page, batches(state));
  });
  for (const [name, value] of [['not JSON', '{'], ['another version', '{"v":2,"pc":"8c21d0e94a6f","k":{"p7":"abcdefabcdef"}}']]) {
    await t.test(name + ': rewritten from nothing', async t => {
      const state = await setup(t, { clock: true }), { page } = state;
      await page.goto(origin + '/seed.html');
      await seed(page, value, 'p7');
      await page.goto(origin + '/');
      const r = await rid(page);
      assert.deepEqual(Object.keys(r.k), ['p7']);
      assert.notEqual(r.k.p7, 'abcdefabcdef');
      assert.notEqual(r.pc, '8c21d0e94a6f');
    });
  }
  // Full storage: the code cannot be kept, so the session has none (no student or PC that
  // lives only in this page). Blocked storage: nothing can be read either.
  for (const [name, init] of [
    ['a write that fails', () => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'sg:site:rid') throw new DOMException('full', 'QuotaExceededError'); return set.call(this, k, v); };
    }],
    ['blocked storage', () => {
      for (const method of ['getItem', 'setItem', 'removeItem', 'key', 'clear']) {
        Object.defineProperty(Storage.prototype, method, { value() { throw new DOMException('Storage disabled by test', 'SecurityError'); } });
      }
    }]
  ]) {
    await t.test(name + ': u = p = \'\'', async t => {
      const state = await setup(t, { clock: true }), { page } = state;
      await state.context.addInitScript(init);
      await page.goto(origin + '/');
      await page.evaluate(() => SGProfiles.create(1, 4, '6-7'));
      await page.clock.fastForward(60000);
      await until(() => bySession(batches(state)).size === 2, 'both sessions');
      assert.deepEqual([...new Set(batches(state).map(b => b.u + '|' + b.p))], ['|']);
      await checkBatches(page, batches(state));
      assert.equal(await page.evaluate(() => { try { return localStorage.getItem('sg:site:rid'); } catch (e) { return null; } }), null);
    });
  }
});

test('a teacher\'s transfer: the profile\'s next session has the new code and names the older one right after ss, once per page', async t => {
  const NEW = '3f9a0c51e2b7', OLD = '1b2c3d4e5f60', SAME = '0a0b0c0d0e0f', PC = '8c21d0e94a6f';
  const state = await setup(t, { clock: true }), { page } = state;
  await page.goto(origin + '/seed.html');
  await page.evaluate(([NEW, OLD, SAME, PC]) => {
    const p = (k, a) => ({ k, a, c: 1, b: '8-9', xp: 0, lv: 1, d0: 20000, dl: 20000, g: {} });
    localStorage.setItem('sg:site:profiles', JSON.stringify({ v: 1, seq: 2, list: [p('p1', 1), p('p2', 2)] }));
    localStorage.setItem('sg:site:rid', JSON.stringify({ v: 1, pc: PC, k: { p1: NEW, p2: SAME }, l: { p1: OLD, p2: SAME }, g: { p1: NEW, p2: SAME } }));
    sessionStorage.setItem('sg:site:player', 'p1');
  }, [NEW, OLD, SAME, PC]);
  await page.goto(origin + '/');
  // The link waits until a batch that names it is delivered.
  assert.deepEqual(await rid(page), { v: 1, pc: PC, k: { p1: NEW, p2: SAME }, l: { p1: OLD, p2: SAME }, g: { p1: NEW, p2: SAME } });
  // A link to the profile's own code links nothing; it goes at once.
  await page.evaluate(() => SGProfiles.select('p2'));
  assert.deepEqual((await rid(page)).l, { p1: OLD });
  await page.evaluate(() => SGProfiles.select(''));
  await page.evaluate(() => SGProfiles.select('p1'));
  await page.clock.fastForward(60000);
  await until(() => bySession(batches(state)).size === 4, 'every session');
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('sg:site:rid')).l.p1);
  assert.deepEqual(await rid(page), { v: 1, pc: PC, k: { p1: NEW, p2: SAME }, l: {}, g: { p1: NEW, p2: SAME } }, 'delivered: the link is done');
  const list = batches(state);
  await checkBatches(page, list);
  const sessions = [...bySession(list)].map(([s, events]) => [list.find(b => b.s === s).u, events.filter(ev => ev[0] !== 'se')]);
  // Made on day 20000, never played: days since the last play -1.
  const age = v => int(v) && v > 300;
  like(sessions, [
    [NEW, [['ss', 0, 0, age, -1, 1, 2, 0], ['cd', 0, OLD]]],
    [SAME, [['ss', 0, 0, age, -1, 1, 2, 0]]],
    ['', [['ss', 0, 0, -1, -1, 0, 2, 0]]],
    [NEW, [['ss', 0, 0, age, -1, 1, 2, 0]]]
  ], 'sessions');
  // Delivered: the next page names it no more.
  const sent = state.posts.length;
  await page.reload();
  await page.clock.fastForward(60000);
  await until(() => batches(state).slice(sent).some(b => b.ev.some(ev => ev[0] === 'ss')), 'the next page\'s session');
  assert.ok(batches(state).slice(sent).every(b => b.ev.every(ev => ev[0] !== 'cd')));
});

test('a teacher\'s link waits until a batch that names it is delivered: a lost batch never loses it', async t => {
  const NEW = '3f9a0c51e2b7', OLD = '1b2c3d4e5f60', PC = '8c21d0e94a6f';
  let down = true;
  const state = await setup(t, { clock: true, answer: () => down ? 503 : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/seed.html');
  await page.evaluate(([NEW, OLD, PC]) => {
    localStorage.setItem('sg:site:profiles', JSON.stringify({ v: 1, seq: 1, list: [{ k: 'p1', a: 1, c: 1, b: '8-9', xp: 0, lv: 1, d0: 20000, dl: 20000, g: {} }] }));
    localStorage.setItem('sg:site:rid', JSON.stringify({ v: 1, pc: PC, k: { p1: NEW }, l: { p1: OLD }, g: { p1: NEW } }));
    sessionStorage.setItem('sg:site:player', 'p1');
  }, [NEW, OLD, PC]);
  await page.goto(origin + '/');
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the first send');
  await inFlight(page);
  like(JSON.parse(state.posts[0].body).ev, [['ss', 0, 0, int, -1, 1, 1, 0], ['cd', 0, OLD]]);
  assert.deepEqual((await rid(page)).l, { p1: OLD }, 'refused: the link still waits');
  // The batch is lost before the server is back (an old tab, the queue's 128 KB or 7 days,
  // or a PC switched off before the batch was queued): the next page names the code again.
  await page.evaluate(key => localStorage.removeItem(key), qKey(INGEST));
  down = false;
  await page.reload();
  await page.clock.runFor(60000);
  await until(() => batches(state).slice(1).some(b => b.ev.some(ev => ev[0] === 'cd')), 'the link named again');
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('sg:site:rid')).l.p1);
  assert.deepEqual(await rid(page), { v: 1, pc: PC, k: { p1: NEW }, l: {}, g: { p1: NEW } });
  const again = batches(state).slice(1).find(b => b.ev.some(ev => ev[0] === 'cd'));
  like(again.ev.slice(0, 2), [['ss', 0, 0, int, -1, 1, 1, 0], ['cd', 0, OLD]]);
  assert.equal(again.u, NEW);
  await checkBatches(page, batches(state).slice(1));
});

test('a removed profile is told as pr only with a code made here: a code a teacher gave goes on with the child on the other PC', async t => {
  const GIVEN = '3f9a0c51e2b7', OWN = '1b2c3d4e5f60', MADE = '0a0b0c0d0e0f', PC = '8c21d0e94a6f';
  const state = await setup(t, { clock: true }), { page } = state;
  await page.goto(origin + '/seed.html');
  await page.evaluate(([GIVEN, OWN, MADE, PC]) => {
    const p = (k, a) => ({ k, a, c: 1, b: '8-9', xp: 0, lv: 1, d0: 20000, dl: 20000, g: {} });
    localStorage.setItem('sg:site:profiles', JSON.stringify({ v: 1, seq: 2, list: [p('p1', 1), p('p2', 2)] }));
    // p1 plays with the code its child has on another PC; its own still waits to be joined.
    localStorage.setItem('sg:site:rid', JSON.stringify({ v: 1, pc: PC, k: { p1: GIVEN, p2: MADE }, l: { p1: OWN }, g: { p1: GIVEN } }));
  }, [GIVEN, OWN, MADE, PC]);
  await page.goto(origin + '/');
  await page.evaluate(() => SGProfiles.remove('p1'));
  assert.deepEqual(await rid(page), { v: 1, pc: PC, k: { p2: MADE }, l: {}, g: {} });
  await page.evaluate(() => SGProfiles.remove('p2'));
  assert.deepEqual(await rid(page), { v: 1, pc: PC, k: {}, l: {}, g: {} });
  await page.clock.fastForward(60000);
  await until(() => allEvents(state).length >= 2, 'the guest\'s session');
  like(allEvents(state), [['ss', 0, 0, -1, -1, 0, 2, 0], ['pr', 0, MADE]]);
  await checkBatches(page, batches(state));
});

test('the v3 events: profiles on the PC, classroom mode, tutorials, hearts, the classroom timer, engaged time so far and the idle hand-over', async t => {
  const state = await setup(t, { clock: true }), { page } = state;
  await page.goto(origin + '/seed.html');
  await page.evaluate(() => {
    localStorage.setItem('sg:site:classroom', 'true');
    localStorage.setItem('sg:site:favs', JSON.stringify(['tic-tac-toe']));
  });
  await page.goto(origin + '/');
  await page.evaluate(() => { SGProfiles.create(1, 4, '6-7'); SGProfiles.create(2, 5, '8-9'); });
  const frame = await play(page, 'air-hockey');
  // Kit's tutorial steps ride on sg:stats v1: start and done once each per visit, nothing else.
  const stats = r => ({ type: 'sg:stats', version: 1, e: 0, f: [0, 0, 0, 0], m: 0, r, o: '' });
  await post(page, frame, stats([['t', 'start'], ['s', 'L1'], ['t', 'start'], ['t', 'skip'], ['t', 'done']]));
  await post(page, frame, stats([['t', 'done'], ['t', 'start']]));
  await post(page, frame, { ...stats([['t', 'start']]), version: 2 });
  // The heart button, on and off again.
  await page.locator('#favBtn').click();
  await page.locator('#favBtn[aria-pressed="true"]').waitFor();
  await page.locator('#favBtn').click();
  await page.locator('#favBtn[aria-pressed="false"]').waitFor();
  // The classroom timer, started and cancelled.
  await page.locator('#classroom summary').click();
  await page.locator('#sessionMinutes').selectOption('5');
  await page.locator('#sessionStart').click();
  await page.locator('#sessionStop').click();
  // Engaged time so far goes along when other events wait (here as the page is hidden) ...
  const msg = e => ({ type: 'sg:telemetry', version: 2, e, f: [0, 0, 0, 0], il: [0, 0, 0, 0, 0, 0], ev: [] });
  await post(page, frame, msg(5000));
  await setHidden(page, true);
  await until(() => allEvents(state).some(ev => ev[0] === 'gp'), 'the engaged time so far');
  await setHidden(page, false);
  // ... and never on its own.
  await post(page, frame, msg(2000));
  const sent = state.posts.length;
  await setHidden(page, true);
  await page.waitForTimeout(500);
  assert.equal(state.posts.length, sent, 'nothing else waited: no batch');
  await setHidden(page, false);
  await home(page);
  await until(() => allEvents(state).some(ev => ev[0] === 'gx'), 'air-hockey closing');
  // A hearted game opens; then nobody touches the PC for 20 minutes: the idle hand-over.
  await play(page, 'tic-tac-toe');
  await inFlight(page);
  await page.clock.fastForward(20 * 60000 + 1000);
  await page.waitForFunction(() => document.body.className === 'route-home');
  await inFlight(page);
  await page.clock.fastForward(60000);
  await until(() => bySession(batches(state)).size === 4 && allEvents(state).some(ev => ev[0] === 'se' && ev[3] === 'i'), 'the child\'s session end');
  const list = batches(state);
  await checkBatches(page, list);
  const [[, guest], [, first], [, child], [, next]] = [...bySession(list)];
  like(guest, [['ss', 0, 0, -1, -1, 0, 0, 1], ['se', int, 0, 'p']], 'the guest, in classroom mode');
  like(first, [['ss', 0, 1, 0, -1, 1, 1, 1], ['se', int, 0, 'p']], 'the first profile');
  like(child, [
    ['ss', 0, 1, 0, -1, 1, 2, 1],
    ['go', int, 1, 'air-hockey', 'catalog', 0, 0],
    ['ld', int, 1, 'air-hockey', int],
    ['tu', int, 1, 'air-hockey', 's'],
    ['tu', int, 1, 'air-hockey', 'd'],
    ['fv', int, 1, 'air-hockey', 1],
    ['fv', int, 1, 'air-hockey', 0],
    ['ct', int, 's', 5],
    ['ct', int, 'c', 0],
    ['gp', int, 1, 'air-hockey', 5000],
    ['gx', int, 1, 'air-hockey', 7000, hist(6), zeros(4)],
    ['go', int, 2, 'tic-tac-toe', v => ['featured', 'catalog'].includes(v), 0, 1],
    ['ld', int, 2, 'tic-tac-toe', int],
    ['gx', int, 2, 'tic-tac-toe', 0, hist(6), zeros(4)],
    ['se', v => v >= 1200, 7000, 'i']
  ], 'the child: the idle hand-over ends the session after its game');
  like(next, [['ss', 0, 0, -1, -1, 0, 2, 1]], 'the next guest');
});

test('timed sends go 60 s after the first waiting event, or as often as X-Batch-Every last asked (whole seconds 20 to 600)', async t => {
  // The header of each answer; a 5xx's header counts for nothing.
  const asks = ['180', '20', '19', '601', '45.5', 'soon', undefined, { status: 503, ask: '300' }, '90'];
  const answer = n => {
    const a = asks[n - 1] ?? undefined, status = a && a.status || 204, ask = a && a.status ? a.ask : a;
    return { status, headers: ask === undefined ? {} : { 'X-Batch-Every': ask } };
  };
  const state = await setup(t, { clock: true, answer: n => answer(n) }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/');
  const at = async (ms, count, label) => { await page.clock.runFor(ms); await until(() => state.posts.length === count, label, 5000); };
  const settled = n => page.waitForFunction(n => window.fetched === n, n);
  const next = async (lv, seconds, count) => {
    await page.evaluate(lv => SGTelemetry.level(lv), lv);
    await at(seconds * 1000 - 1, count - 1, `no send before ${seconds} s`);
    await at(1, count, `the send after ${seconds} s`);
    await settled(count);
  };
  await at(59999, 0, 'nothing before 60 s');
  await at(1, 1, 'the first send after 60 s');
  await settled(1);
  await next(2, 180, 2);   // asked 180
  await next(3, 20, 3);    // asked 20
  await next(4, 20, 4);    // 19: too short, ignored
  await next(5, 20, 5);    // 601: too long, ignored
  await next(6, 20, 6);    // 45.5: not whole, ignored
  await next(7, 20, 7);    // 'soon': ignored
  await next(8, 60, 8);    // no header: back to 60
  // A 503 asking for 300 is retried after 20 s; it changes nothing.
  await at(20000, 9, 'the retry');
  await settled(9);
  await next(9, 90, 10);   // the retry's 204 asked 90
  like(batches(state).map(b => b.ev.map(ev => ev[0] === 'lv' ? ev[2] : ev[0])), [['ss'], [2], [3], [4], [5], [6], [7], [8], [8], [9]]);
  await checkBatches(page, batches(state));
});

test('w: split batches and retries of one session date the same start; queued batches use their start, else their last time', async t => {
  const answers = [204, 204, 204, 204, 503];
  const state = await setup(t, { clock: true, answer: n => answers[n - 1] ?? 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/seed.html');
  const now = await page.evaluate(() => Date.now());
  const envelope = (b, ev) => ({ v: 3, b, s: 'abcdefabcdef', k: 'src', m: 'web', a: '', d: [4, 4, 1920], u: '', p: '', z: '', ev });
  await page.evaluate(([key, q]) => localStorage.setItem(key, JSON.stringify(q)), [qKey(INGEST), [
    // No start (an entry without w0): its last time. A start 10 days ago: the most the server takes.
    { t: now - 3600000, e: envelope('1'.repeat(16), [['lv', 40, 2], ['lv', 42, 3]]) },
    { t: now - 3600000, w0: now - 864e6, e: envelope('2'.repeat(16), [['lv', 7, 2]]) },
    { t: now - 3600000, w0: now - 100000, e: envelope('3'.repeat(16), [['lv', 5, 2]]) }
  ]]);
  await page.goto(origin + '/');
  // 251 events: two batches of the one session.
  await page.evaluate(() => { for (let i = 1; i <= 250; i++) SGTelemetry.level(i); });
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 5, 'the queue and both batches');
  await page.waitForFunction(() => window.fetched === 5);
  await page.clock.runFor(20000);
  await until(() => state.posts.length === 6, 'the retry');
  const list = batches(state);
  assert.deepEqual(list.map(b => [b.b.slice(0, 1), b.ev.length, b.w]).slice(0, 3), [['1', 2, 42], ['2', 1, 691200], ['3', 1, 160]]);
  const [one, two, again] = list.slice(3);
  assert.equal(one.s, two.s);
  assert.notEqual(one.b, two.b);
  assert.deepEqual([one.ev.length, two.ev.length], [200, 51]);
  // Sent at 60 s, 60 s and (the retry of the second) 80 s after the session started.
  assert.deepEqual([one.w, two.w, again.w], [60, 60, 80]);
  assert.deepEqual(bare(again), bare(two));
  await checkBatches(page, list.slice(3));
  serverKeeps(list);
});
