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
// The queue of the copy that sends to url (js/telemetry.js: a 32-bit hash of the address).
const qKey = url => 'sg:site:tm:q:' + ([...url].reduce((h, c) => h * 31 + c.charCodeAt(0) | 0, 0) >>> 0).toString(36);
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

// telemetry: window.SG_TELEMETRY (null: none), and copy: the one of the copy at /copy/;
// answer(n, post): the ingest server's status for the n-th request, or { status, headers }.
// Every test: no page or console errors, and no request other than this server's files
// and the answered POSTs to the ingest server.
async function setup(t, { telemetry = ON, copy = telemetry, gpc = false, clock = false, answer = () => 204 } = {}) {
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
    const { status, headers } = answered({ url: request.url(), method: request.method(), type: request.resourceType(), headers: await request.allHeaders(), body: request.postData() });
    if (status === 'abort') await route.abort('failed');
    else if (status === 'hang') return;
    else await route.fulfill({ status, headers: { ...cors, ...headers } });
  });
  // What a page sends while it unloads leaves after the page is gone, where the routes
  // above no longer see it; an interception for the whole browser does, with its headers.
  const cdp = await browser.newBrowserCDPSession();
  t.after(() => cdp.detach().catch(() => {}));
  cdp.on('Fetch.requestPaused', ({ requestId, request, resourceType }) => {
    const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]));
    const { status, headers: answer } = answered({ url: request.url, method: request.method, type: resourceType.toLowerCase(), headers, body: request.postData });
    // The page is gone: nothing waits for the answer.
    if (status === 'abort') cdp.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
    else if (status !== 'hang') {
      const responseHeaders = Object.entries({ ...cors, ...answer }).map(([name, value]) => ({ name, value }));
      cdp.send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders }).catch(() => {});
    }
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://ingest.test/*' }] });
  await context.addInitScript(([config, copy, gpc]) => {
    // The test's setting wins over a build's own (CI may build with SG_TELEMETRY_URL).
    Object.defineProperty(window, 'SG_TELEMETRY', { value: (location.pathname.startsWith('/copy/') ? copy : config) || undefined, writable: false });
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
  }, [telemetry, copy, gpc]);
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
const batches = state => state.posts.map(post => JSON.parse(post.body));
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

test('real rounds reach the ingest server as the contract says, with codes but nothing that could name a child or a PC', async t => {
  const state = await setup(t), { page } = state;
  await page.goto(origin + '/seed.html');
  await page.evaluate(() => localStorage.setItem('sg:site:statsmeta', JSON.stringify({ pc: { id: 'pcwxyz', label: 'مختبر سارة' }, since: '2026-10-01' })));
  // credentials: 'omit': a cookie of the ingest server never goes with a fetch.
  await state.context.addCookies([COOKIE]);
  await page.goto(origin + '/');
  assert.equal(await page.evaluate(() => SGTelemetry.active()), true);
  assert.deepEqual(await tmKeys(page), ['sg:site:tm:on'], 'the teacher page is told this PC shares');
  assert.equal(await tm(page, 'sg:site:tm:on'), '"ingest.test"');
  // The active sink made this PC's code; a guest has none.
  const pc = (await rid(page)).pc;
  assert.deepEqual(await rid(page), { v: 1, pc, k: {}, l: {} });
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
  assert.deepEqual(await rid(page), { v: 1, pc, k: { p1: code }, l: {} });
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
      // A queue and a note from an earlier build that shared.
      await page.evaluate(([m, key, q]) => {
        if (m) localStorage.setItem('sg:site:statsmeta', m);
        localStorage.setItem(key, q);
        localStorage.setItem('sg:site:tm:on', '"ingest.test"');
      }, [statsmeta, qKey(INGEST), seeded]);
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
      // removes the old note, so the teacher page does not say that this PC shares.
      assert.deepEqual(await tmKeys(page), statsmeta ? [] : [qKey(INGEST)]);
      if (!statsmeta) assert.equal(await tm(page, qKey(INGEST)), seeded);
      assert.equal(await tm(page, 'sg:site:rid'), null, 'no code is made or written');
    });
  }
});

test('failures back off 20, 40, 80, 160, 300 s; a 2xx and a 4xx are final; 429, 5xx and network errors retry', async t => {
  const answers = [500, 'abort', 503, 500, 502, 500, 204, 400, 429, 204];
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

test('a request that is never answered holds the queue back for a minute at most', async t => {
  const state = await setup(t, { clock: true, answer: n => n === 1 ? 'hang' : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/');
  const at = async (ms, count, label) => { await page.clock.runFor(ms); await until(() => state.posts.length === count, label, 5000); };
  await at(60000, 1, 'the first send');
  // Nothing else happens on the page: the same batch goes again a minute later.
  await at(59999, 1, 'no second request while the first may still be answered');
  await at(1, 2, 'the same batch again after a minute');
  await page.waitForFunction(() => window.fetched === 1);
  assert.deepEqual(bare(batches(state)[1]), bare(batches(state)[0]), 'the same batch, the same id');
  assert.deepEqual(batches(state).map(b => b.w), [60, 120]);
  assert.equal(await queue(page), null, 'delivered');
  await at(300000, 2, 'nothing more to send');
  await checkBatches(page, batches(state));
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

test('the queue survives a reload, sends oldest first, and keeps at most 128 KB, 7 days and nothing from before a clear; v2 batches go unchanged', async t => {
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
  await page.evaluate(([key, q, cleared]) => {
    localStorage.setItem(key, JSON.stringify(q));
    localStorage.setItem('sg:site:statsmeta', JSON.stringify({ pc: { id: 'pcwxyz' }, clearedAt: cleared }));
  }, [qKey(INGEST), seeded, now - 5400000]);
  await page.goto(origin + '/');
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the first send');
  await page.waitForFunction(() => window.fetched === 1);
  let stored = await queue(page);
  assert.ok(JSON.stringify(stored).length <= 131072, 'at most 128 KB');
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
  assert.equal(await queue(page), null, 'a batch handed to fetch is not kept');
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
  assert.equal(await queue(page), null);

  // Offline: nothing goes and the batch waits in the queue.
  const sent = state.posts.length;
  await page.goto(origin + '/');
  await page.evaluate(() => Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false }));
  await setHidden(page, true);
  like((await queue(page)).map(x => x.e.ev), [[['ss', 0, 0, -1, -1, 0, 0, 0]]]);
  assert.equal(state.posts.length, sent, 'nothing goes while offline');
  for (const p of state.posts) assert.equal(p.headers.cookie, undefined, 'no cookie, neither while the page lives nor as it unloads');
  await checkBatches(page, batches(state));
});

test('a hidden page hands fetch only what fits in 60 KB of keepalive bodies in flight, oldest first, and keeps the rest', async t => {
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
  assert.deepEqual(stored.map(x => x.e.b).slice(0, -1), [ids[0], ids[2], ids[3]], 'the batch in flight and every batch not handed to fetch stay');
  like(stored.at(-1).e.ev, [['ss', 0, 0, -1, -1, 0, 0, 0]]);
  // That send was answered, so its bytes are free again: the page hidden once more sends the next.
  await setHidden(page, false);
  await setHidden(page, true);
  await until(() => state.posts.length === 3, 'the next hidden page\'s send');
  assert.equal(JSON.parse(state.posts[2].body).b, ids[2]);
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
  assert.deepEqual(await tmKeys(page), [qKey(INGEST), qKey(OTHER), 'sg:site:tm:on'].sort());
  await page.evaluate(() => localStorage.setItem('sg:site:statsmeta', JSON.stringify({ pc: { id: 'pcwxyz' }, off: true, offSince: Date.now() })));
  assert.equal(await page.evaluate(() => SGTelemetry.active()), false);
  assert.deepEqual(await tmKeys(page), [], 'both queues and the note are gone');
  serverKeeps(batches(state));
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
  assert.deepEqual(await tmKeys(page), [], 'the note and the queue are gone');
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
  assert.deepEqual(await rid(page), { v: 1, pc, k: { p1 }, l: {} });
  await page.evaluate(() => SGProfiles.remove('p1'));
  assert.deepEqual(await rid(page), { v: 1, pc, k: {}, l: {} });
  // Told once: the next page's session says nothing more.
  await page.reload();
  await page.clock.fastForward(60000);
  await until(() => bySession(batches(state)).size === 7, 'every session');
  const list = batches(state);
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
      l: { p9: ['0123456789ab'] }, extra: 1 }), 'p7');
    await page.goto(origin + '/');
    const r = await rid(page);
    assert.match(r.pc, /^[0-9a-f]{12}$/);
    assert.deepEqual(r, { v: 1, pc: r.pc, k: { p7: 'abcdefabcdef' }, l: {} }, 'p7 keeps its code; the rest is dropped');
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

test('a teacher\'s transfer: the profile\'s next session has the new code and names the older one once, right after ss', async t => {
  const NEW = '3f9a0c51e2b7', OLD = '1b2c3d4e5f60', SAME = '0a0b0c0d0e0f', PC = '8c21d0e94a6f';
  const state = await setup(t, { clock: true }), { page } = state;
  await page.goto(origin + '/seed.html');
  await page.evaluate(([NEW, OLD, SAME, PC]) => {
    const p = (k, a) => ({ k, a, c: 1, b: '8-9', xp: 0, lv: 1, d0: 20000, dl: 20000, g: {} });
    localStorage.setItem('sg:site:profiles', JSON.stringify({ v: 1, seq: 2, list: [p('p1', 1), p('p2', 2)] }));
    localStorage.setItem('sg:site:rid', JSON.stringify({ v: 1, pc: PC, k: { p1: NEW, p2: SAME }, l: { p1: OLD, p2: SAME } }));
    sessionStorage.setItem('sg:site:player', 'p1');
  }, [NEW, OLD, SAME, PC]);
  await page.goto(origin + '/');
  assert.deepEqual(await rid(page), { v: 1, pc: PC, k: { p1: NEW, p2: SAME }, l: { p2: SAME } }, 'the link is used once');
  // A link to the profile's own code links nothing; it goes too.
  await page.evaluate(() => SGProfiles.select('p2'));
  assert.deepEqual(await rid(page), { v: 1, pc: PC, k: { p1: NEW, p2: SAME }, l: {} });
  await page.evaluate(() => SGProfiles.select(''));
  await page.evaluate(() => SGProfiles.select('p1'));
  await page.clock.fastForward(60000);
  await until(() => bySession(batches(state)).size === 4, 'every session');
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
