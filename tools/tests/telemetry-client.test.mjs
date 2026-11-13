// The portal's anonymous play statistics sender (js/telemetry.js, wire version 3 without
// any field about a child; docs/TELEMETRY.md), driven through the real portal and real game
// pages. Playwright answers the statistics server (https://ingest.test), so nothing leaves
// this machine; any other request still fails the test. The sender is switched on with
// window.SG_TELEMETRY = { url, allowLocal: true }, which no build ever writes. When
// SG_SERVER_SCHEMA names the server's schema.mjs (with clock.mjs beside it), every batch
// is also checked with the server's own validator. The same site is also served at
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
// The queue of the copy that sends to url (js/telemetry.js: a 32-bit hash of the address),
// and the keys where builds with player profiles queued theirs.
const urlHash = url => ([...url].reduce((h, c) => h * 31 + c.charCodeAt(0) | 0, 0) >>> 0).toString(36);
const qKey = url => 'sg:site:tm:anon:' + urlHash(url);
const oldKeys = url => ['sg:site:tm:q:' + urlHash(url), 'sg:site:tm:q3:' + urlHash(url)];
const COOKIE = { name: 'trackme', value: 'cookie-value', domain: 'ingest.test', path: '/', secure: true, sameSite: 'None' };
const SOURCES = ['featured', 'catalog', 'recent', 'favorites', 'category', 'quick', 'search', 'related', 'surprise',
  'reload', 'history', 'direct', 'starter'];
const ZONE = 'Asia/Riyadh';
// The events this build sends, with their length; nothing else.
const ARITY = { ss: 2, go: 7, ld: 5, er: 5, rs: 8, re: 14, gp: 5, gx: 7, tu: 5, fv: 5, se: 4 };
const ENVELOPE = ['v', 'b', 's', 'k', 'm', 'd', 'p', 'z', 'ev', 'w'];
// The events of a game visit: n (the visit in its session) after t, then the slug (after
// the round number k for rs and re).
const VISIT = ['go', 'ld', 'er', 'rs', 're', 'gp', 'gx', 'tu', 'fv'];
const slugOf = ev => ev[0] === 'rs' || ev[0] === 're' ? ev[4] : VISIT.includes(ev[0]) ? ev[3] : undefined;
const schemaFile = process.env.SG_SERVER_SCHEMA && fs.existsSync(process.env.SG_SERVER_SCHEMA) ? process.env.SG_SERVER_SCHEMA : '';
const schema = schemaFile ? await import(pathToFileURL(path.resolve(schemaFile)).href) : null;
let browser, server, origin, pings = 0;

before(async () => {
  server = await startTestServer(root, { pages: { '/seed.html': '<!doctype html><title>seed</title>' }, mounts: { '/copy/': root } });
  origin = server.origin;
  browser = await launchChromium();
});
after(async () => { await browser?.close(); await server?.close(); });

// telemetry: window.SG_TELEMETRY (null: none), and copy: the one of the copy at /copy/;
// answer(n, post): the server's status for the n-th request, or { status, headers }.
// Every test: no page or console errors, and no request other than this server's files
// and the answered POSTs to the statistics server.
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
  // 'abort': the network fails; 'hang': the request is never answered.
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
    if (status === 'abort') cdp.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
    else if (status !== 'hang') {
      const responseHeaders = Object.entries({ ...cors, ...answer }).map(([name, value]) => ({ name, value }));
      cdp.send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders }).catch(() => {});
    }
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://ingest.test/*' }] });
  await context.addInitScript(([config, copy, gpc]) => {
    // The test's setting wins over a build's own (a build may be made with SG_TELEMETRY_URL).
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
    // Settled fetches, so a fake clock moves on only after the page has seen each answer.
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
  // console; the site never does. Only that line, and only for the statistics server, is allowed.
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
function bySession(list) {
  const out = new Map();
  for (const b of list) out.set(b.s, [...(out.get(b.s) || []), ...b.ev]);
  return out;
}
const allEvents = state => batches(state).flatMap(b => b.ev);
// The server keeps every batch whole: a valid envelope (else 400, dropped for good), no
// event dropped, nothing it would round or clamp, no lenient field (p z w) blanked.
function serverKeeps(list) {
  if (!schema) return;
  for (const b of list) {
    const kept = schema.validateBatch(structuredClone(b));
    assert.ok(kept, 'the server accepts ' + JSON.stringify(b).slice(0, 300));
    assert.equal(kept.wire, 3);
    assert.equal(kept.dropped, 0, 'the server drops no event of ' + JSON.stringify(b.ev));
    assert.deepEqual(kept.events, b.ev, 'the server changes no event');
    assert.equal(kept.envelope.p, b.p);
    assert.equal(kept.envelope.z, b.z);
    assert.equal(kept.envelope.w, b.w);
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
// One event for the session, without a game frame: the heart of a visit opened by hand.
const heart = (page, on) => page.evaluate(on => SGTelemetry.fav('air-hockey', on), on);
const openVisit = page => page.evaluate(() => SGTelemetry.open('air-hockey', false));

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
// The contract's shape: exact keys, ids and buckets, nothing about a child; every event
// has its length, times are whole seconds since the session started and never go back;
// w is at least the last time; a session's batches all carry the same PC code.
async function checkBatches(page, list) {
  const device = await page.evaluate(() => [navigator.hardwareConcurrency, navigator.deviceMemory, screen.width]);
  const bucket = (v, steps) => steps.filter((s, i) => i === 0 || v >= s).at(-1);
  const d = [bucket(device[0], [1, 2, 4, 8, 16]), bucket(device[1], [0, 1, 2, 4, 8]), bucket(device[2], [1366, 1600, 1920, 2560])];
  for (const b of list) {
    assert.deepEqual(Object.keys(b), ENVELOPE, 'no age band (a) and no student code (u)');
    assert.equal(b.v, 3);
    assert.match(b.b, /^[0-9a-f]{16}$/);
    assert.match(b.s, /^[0-9a-f]{12}$/);
    if (sourceTree) assert.equal(b.k, 'src'); else assert.match(b.k, /^[0-9a-f]{16}$/);
    assert.equal(b.m, 'web');
    assert.deepEqual(b.d, d, 'device buckets');
    assert.match(b.p, /^(?:[0-9a-f]{12})?$/);
    assert.equal(b.z, ZONE);
    assert.ok(b.ev.length >= 1 && b.ev.length <= 200 && JSON.stringify(b).length <= 32768);
    for (const ev of b.ev) {
      assert.equal(ev.length, ARITY[ev[0]], JSON.stringify(ev));
      if (ev[0] === 'go') assert.equal(ev[5], 0, 'no plays before: there are no players');
      if (ev[0] === 'se') assert.equal(ev[3], 'u', 'a session ends only when its page goes');
    }
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
    assert.equal(new Set(list.filter(b => b.s === s).map(b => b.p)).size, 1, 'one PC code per session');
  }
}

/* --------------------------------------------------------------- tests */
test('the server\'s validator agrees with this test on the contract', { skip: !schema && 'SG_SERVER_SCHEMA names no schema.mjs' }, () => {
  assert.deepEqual(schema.SOURCES, SOURCES);
  for (const [kind, n] of Object.entries(ARITY)) {
    assert.ok(schema.EVENTS_V3[kind], kind);
    // The session start keeps only its time; every other event has exactly its fields.
    assert.ok(kind === 'ss' ? schema.EVENTS_V3.ss.length + 1 <= n : schema.EVENTS_V3[kind].length + 1 === n, kind);
  }
  assert.deepEqual(schema.WIRES, [2, 3]);
  assert.equal(schema.MAX_W, 691200);
  const batch = { v: 3, b: '0123456789abcdef', s: '0123456789ab', k: 'src', m: 'web', d: [4, 4, 1920], p: '8c21d0e94a6f', z: ZONE,
    ev: [['ss', 0], ['go', 1, 1, 'air-hockey', 'catalog', 0, 1], ['se', 2, 0, 'u']], w: 3 };
  const kept = schema.validateBatch(batch);
  assert.ok(kept, 'a batch without a, u or profile fields is accepted');
  assert.deepEqual([kept.dropped, kept.events], [0, batch.ev]);
  for (const bad of [{ v: 4 }, { d: [3, 4, 1920] }, { d: [4, 4, 1280] }, { k: '5C18C6D2D1C052AD' }, { s: '0123456789abc' }, { m: 'pwa' }]) {
    assert.equal(schema.validateBatch({ ...batch, ...bad }), null, JSON.stringify(bad));
  }
});

test('real rounds reach the statistics server as the contract says, with nothing about any child', async t => {
  const state = await setup(t), { page } = state;
  await page.goto(origin + '/seed.html');
  // Left by a build with player profiles: a teacher's PC label and id, a profile and its
  // code, and their queued batches. None of it is ever sent.
  await page.evaluate(() => {
    localStorage.setItem('sg:site:statsmeta', JSON.stringify({ pc: { id: 'pcwxyz', label: 'مختبر سارة' }, since: '2026-10-01' }));
    localStorage.setItem('sg:site:profiles', JSON.stringify({ v: 1, list: [{ k: 'p1', a: 3, c: 1, b: '8-9', xp: 40 }] }));
    localStorage.setItem('sg:site:rid', JSON.stringify({ v: 1, pc: '8c21d0e94a6f', k: { p1: '3f9a0c51e2b7' }, l: { p1: '1b2c3d4e5f60' }, g: {} }));
  });
  // credentials: 'omit': a cookie of the statistics server never goes with a fetch.
  await state.context.addCookies([COOKIE]);
  await page.goto(origin + '/');
  assert.equal(await page.evaluate(() => SGTelemetry.active()), true);
  // The PC keeps its code; the children's codes of the old build are gone.
  assert.deepEqual(await rid(page), { v: 1, pc: '8c21d0e94a6f' });
  assert.deepEqual(await tmKeys(page), [], 'nothing waits yet, and no sharing note');

  // A child types a search, then opens the starter card, then two rounds of tic-tac-toe
  // with a rematch in between, hearts it, and opens a game by the Surprise button.
  await page.locator('#q').fill('زرافة سرية');
  await page.waitForFunction(() => location.hash.startsWith('#/search/'));
  await page.locator('#q').press('Escape');
  await page.waitForFunction(() => document.body.className === 'route-home');
  const starter = await page.locator('#app > a.starter').getAttribute('data-slug');
  await page.locator('#app > a.starter').click();
  await ready(page);
  await home(page);
  await until(() => allEvents(state).some(ev => ev[0] === 'gx' && ev[3] === starter), 'the starter game closing');
  const tttSource = await page.locator('.catalog-grid .tile[data-slug="tic-tac-toe"] .hot').count() ? 'featured' : 'catalog';
  const ttt = await play(page, 'tic-tac-toe');
  assert.ok((await ttt.evaluate(() => window.prefs)).every(p => p.telemetry === true), 'the game is told the sender is on');
  await page.frameLocator('#stage iframe').locator('#localButton').click();
  await localRound(page);
  await page.frameLocator('#stage iframe').locator('#rematchButton').click();
  await page.frameLocator('#stage iframe').locator('#gameBoard[data-moves="0"]').waitFor();
  await localRound(page);
  assert.ok(await page.evaluate(() => window.telemetryMessages) > 0, 'the game sent sg:telemetry');
  await page.locator('#favBtn').click();
  await home(page);
  // Leaving the game sends at once.
  await until(() => allEvents(state).some(ev => ev[0] === 'gx' && ev[3] === 'tic-tac-toe'), 'tic-tac-toe closing');
  await page.locator('#surprise').click();
  await ready(page);
  const surprised = await page.evaluate(() => decodeURIComponent(location.hash.split('/')[2]));
  await page.locator('#favBtn').click();
  await page.locator('#favBtn').click();
  await home(page);
  await until(() => allEvents(state).some(ev => ev[0] === 'gx' && ev[3] === surprised), 'the surprise game closing');

  const list = batches(state);
  await checkBatches(page, list);
  for (const p of state.posts) {
    assert.deepEqual([p.url, p.method, p.type, p.headers['content-type']], [INGEST, 'POST', 'fetch', 'text/plain']);
    assert.equal(p.headers.cookie, undefined, 'no cookies');
  }
  const sessions = [...bySession(list)];
  assert.equal(sessions.length, 1, 'one session per page load: there are no players to switch between');
  const events = sessions[0][1];
  assert.ok(list.every(b => b.p === '8c21d0e94a6f'), 'this PC\'s code');
  // The starter game and the surprise game are checked only for their open, load and close.
  const visit = slug => events.filter(ev => slugOf(ev) === slug && ['go', 'ld', 'gx'].includes(ev[0]));
  like(visit(starter), [['go', int, 1, starter, 'starter', 0, 0], ['ld', int, 1, starter, int], ['gx', int, 1, starter, int, hist(6), hist(4)]], 'starter');
  like(visit(surprised).concat(events.filter(ev => ev[0] === 'fv' && ev[3] === surprised)),
    [['go', int, 3, surprised, 'surprise', 0, 0], ['ld', int, 3, surprised, int], ['gx', int, 3, surprised, int, hist(6), hist(4)],
      ['fv', int, 3, surprised, 1], ['fv', int, 3, surprised, 0]], 'surprise');
  const [tier1, tier2] = events.filter(ev => ev[0] === 'rs' && ev[4] === 'tic-tac-toe').map(ev => ev[6]);
  // A round's counters (rx): its wall time, the clicks of its last four moves (the first
  // move's click starts the round), no idle lapse or pause, no reaction time and no DDA level.
  const counters = [pos, 4, 0, 0, 0, 0, -1];
  like(events.filter(ev => slugOf(ev) === 'tic-tac-toe'), [
    ['go', int, 2, 'tic-tac-toe', tttSource, 0, 0],
    ['ld', int, 2, 'tic-tac-toe', v => int(v) && v < 120000],
    ['rs', int, 2, 1, 'tic-tac-toe', 'local', tierOf, 0],
    ['re', int, 2, 1, 'tic-tac-toe', 'e', 'local', pos, -1, tier1, 0, 0, zeros(6), counters],
    ['rs', int, 2, 2, 'tic-tac-toe', 'local', tierOf, 1],
    ['re', int, 2, 2, 'tic-tac-toe', 'e', 'local', pos, -1, tier2, 0, 0, zeros(6), counters],
    ['fv', int, 2, 'tic-tac-toe', 1],
    // tic-tac-toe draws no frames; every click went through Kit's input-latency histogram.
    ['gx', int, 2, 'tic-tac-toe', pos, v => hist(6)(v) && v.reduce((a, b) => a + b) > 0, zeros(4)]
  ], 'tic-tac-toe');
  like(events[0], ['ss', 0], 'the session start has only its time');
  const gx = events.find(ev => ev[0] === 'gx' && ev[3] === 'tic-tac-toe');
  const res = events.filter(ev => ev[0] === 're');
  assert.ok(gx[4] >= res[0][7] + res[1][7], 'the game\'s engaged time covers its rounds');
  assert.ok(res.every(ev => ev[13][0] >= ev[7]), 'a round\'s wall time covers its engaged time');

  // Nothing that could name a child, a PC or a browser, no profile, age or code of the
  // old build, and no clock time.
  const text = state.posts.map(p => p.body).join('\n');
  for (const secret of ['pcwxyz', 'مختبر', 'سارة', 'زرافة', 'سرية', '"p1"', '3f9a0c51e2b7', '1b2c3d4e5f60', '8-9', '"a"', '"u"',
    'cookie-value', 'Mozilla', 'Chrome', 'Linux', '127.0.0.1', 'localhost', 'sg:', 'http', 'SG_']) {
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
  const cases = [
    ['no SG_TELEMETRY', { telemetry: null }, null],
    ['an http:// address', { telemetry: { url: 'http://ingest.test/v1/batch', allowLocal: true } }, null],
    ['a quote in the address', { telemetry: { url: 'https://ingest.test/v1/"batch', allowLocal: true } }, null],
    ['this computer without allowLocal', { telemetry: { url: INGEST } }, null],
    ['Global Privacy Control', { gpc: true }, null],
    ['statistics stopped on this PC by an earlier version', {}, meta({ off: true, offSince: Date.now() })],
    ['sharing turned off on this PC by an earlier version', {}, meta({ tm: false })]
  ];
  for (const [name, options, statsmeta] of cases) {
    await t.test(name, async t => {
      const state = await setup(t, { ...options, clock: true }), { page } = state;
      await page.goto(origin + '/seed.html');
      if (statsmeta) await page.evaluate(m => localStorage.setItem('sg:site:statsmeta', m), statsmeta);
      const stored = await page.evaluate(() => JSON.stringify(localStorage));
      await page.goto(origin + '/');
      assert.equal(await page.evaluate(() => SGTelemetry.active()), false);
      const frame = await play(page, 'tic-tac-toe');
      await page.frameLocator('#stage iframe').locator('#localButton').click();
      await localRound(page);
      assert.ok((await frame.evaluate(() => window.prefs)).every(p => p.telemetry === false));
      assert.equal(await page.evaluate(() => window.telemetryMessages || 0), 0, 'the game posts no sg:telemetry');
      await page.locator('#favBtn').click();
      await home(page);
      await setHidden(page, true);
      await page.clock.runFor(120000);
      await page.goto(origin + '/seed.html');
      assert.deepEqual(state.posts, [], 'nothing is sent, neither while the page lives nor as it unloads');
      assert.deepEqual(await tmKeys(page), [], 'nothing queued');
      assert.equal(await tm(page, 'sg:site:rid'), null, 'no code is made or written');
      // Only the portal's own favourites and recent games changed.
      const now = JSON.parse(await page.evaluate(() => JSON.stringify(localStorage)));
      for (const key of Object.keys(now)) if (!/^sg:site:(?:favs|recent)$/.test(key) && !key.startsWith('sg:tic-tac-toe:')) assert.equal(now[key], JSON.parse(stored)[key], key);
    });
  }
});

test('the queues and codes of builds with player profiles are never sent: they go, and this PC keeps its code', async t => {
  const state = await setup(t, { clock: true }), { page } = state;
  await page.goto(origin + '/seed.html');
  const now = await page.evaluate(() => Date.now());
  const child = { v: 3, b: 'c'.repeat(16), s: '0123456789ab', k: 'src', m: 'web', a: '8-9', d: [4, 4, 1920], u: '3f9a0c51e2b7', p: '8c21d0e94a6f', z: ZONE,
    ev: [['ss', 0, 0, 41, 2, 7, 19, 0], ['lv', 1, 8]] };
  await page.evaluate(([keys, q, rid]) => {
    for (const key of keys) localStorage.setItem(key, q);
    localStorage.setItem('sg:site:tm:on', '"ingest.test"');
    localStorage.setItem('sg:site:rid', rid);
  }, [oldKeys(INGEST), JSON.stringify([{ t: now - 60000, w0: now - 90000, e: child }]),
    JSON.stringify({ v: 1, pc: 'zz', k: { p1: '3f9a0c51e2b7' } })]);
  await page.goto(origin + '/');
  assert.deepEqual(await tmKeys(page), [], 'the old queues and the sharing note are gone');
  const code = (await rid(page)).pc;
  assert.match(code, /^[0-9a-f]{12}$/, 'a damaged PC code is made anew');
  assert.deepEqual(await rid(page), { v: 1, pc: code });
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the first send');
  like(batches(state).map(b => b.ev), [[['ss', 0]]]);
  assert.equal(batches(state)[0].p, code);
  // The next page load keeps the same PC code and makes a new session.
  await page.reload();
  await page.clock.runFor(60000);
  await until(() => batches(state).some(b => b.ev.some(ev => ev[0] === 'ss') && b.s !== batches(state)[0].s), 'the next page\'s session');
  assert.ok(batches(state).every(b => b.p === code));
  assert.ok(!state.posts.some(p => p.body.includes('3f9a0c51e2b7') || p.body.includes('"lv"')));
  await checkBatches(page, batches(state));
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
  like(tries[0].ev, [['ss', 0]]);

  // A malformed batch (400) is dropped and never sent again.
  await openVisit(page);
  await at(60000, 8, 'the next batch');
  await settled(8);
  assert.equal(await queue(page), null, 'a 400 drops the batch');
  await at(400000, 8, 'no retry after a 400');
  // 429 (too many requests) keeps the batch and backs off from 20 s again.
  await heart(page, true);
  await at(60000, 9, 'the batch after the 400');
  await settled(9);
  assert.equal((await queue(page)).length, 1, 'a 429 keeps the batch');
  await at(19999, 9, 'no retry before 20 s');
  await at(1, 10, 'the retry after a 429');
  await settled(10);
  assert.equal(await queue(page), null);
  assert.deepEqual(bare(batches(state)[9]), bare(batches(state)[8]));
  assert.equal(batches(state)[9].w, batches(state)[8].w + 20);
  like(state.posts.slice(7).map(p => JSON.parse(p.body).ev.map(ev => ev[0])), [['go'], ['fv'], ['fv']]);
  await checkBatches(page, batches(state));
});

test('a request that is never answered holds the queue back for a minute at most', async t => {
  const state = await setup(t, { clock: true, answer: n => n === 1 ? 'hang' : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/');
  const at = async (ms, count, label) => { await page.clock.runFor(ms); await until(() => state.posts.length === count, label, 5000); };
  await at(60000, 1, 'the first send');
  await at(59999, 1, 'no second request while the first may still be answered');
  await at(1, 2, 'the same batch again after a minute');
  await page.waitForFunction(() => window.fetched === 1);
  assert.deepEqual(bare(batches(state)[1]), bare(batches(state)[0]), 'the same batch, the same id');
  assert.deepEqual(batches(state).map(b => b.w), [60, 120]);
  assert.equal(await queue(page), null, 'delivered');
  await at(300000, 2, 'nothing more to send');
  await checkBatches(page, batches(state));
});

test('the queue survives a reload, sends oldest first, and keeps at most 128 KB and 7 days', async t => {
  let down = true;
  const state = await setup(t, { clock: true, answer: () => down ? 503 : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/seed.html');
  const now = await page.evaluate(() => Date.now());
  const envelope = (b, ev) => ({ v: 3, b, s: '0123456789ab', k: 'src', m: 'web', d: [4, 4, 1920], p: '', z: '', ev });
  // Five batches of about 26 KB (200 of the largest events the server takes), the oldest
  // first, then entries the sender must drop.
  const most = ['re', 1, 1, 1, 'air-hockey', 'w', 'Level_abcdefghijklmnopq', 108e5, 1e9, 9, 1e5, 1e5, [1e5, 1e5, 1e5, 1e5, 1e5, 1e5], null];
  const big = i => ({ t: now - 3600000 + i, w0: now - 3700000, e: envelope(i.toString(16).padStart(16, 'a'), Array.from({ length: 200 }, () => most)) });
  const seeded = [
    { t: now - 8 * 86400000, w0: now - 8 * 86400000, e: envelope('b'.repeat(16), [['ss', 0]]) },        // more than 7 days old
    { t: 'yesterday', e: envelope('d'.repeat(16), []) }, null, 'text', { t: now, e: { v: 2, b: 'e'.repeat(16), ev: [] } },
    ...[1, 2, 3, 4, 5].map(big)
  ];
  await page.evaluate(([key, q]) => localStorage.setItem(key, JSON.stringify(q)), [qKey(INGEST), seeded]);
  await page.goto(origin + '/');
  await page.clock.runFor(60000);
  await until(() => state.posts.length === 1, 'the first send');
  await page.waitForFunction(() => window.fetched === 1);
  let stored = await queue(page);
  assert.ok(JSON.stringify(stored).length <= 131072, 'at most 128 KB');
  const kept = stored.map(x => x.e.b);
  // The oldest big batch made room for the new one; the dropped entries are gone.
  assert.deepEqual(kept.slice(0, -1), [2, 3, 4, 5].map(i => i.toString(16).padStart(16, 'a')));
  like(stored.at(-1).e.ev, [['ss', 0]]);
  // An entry keeps its session's start (w0, never sent); w is added at each send.
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
  // The first page's session, sent by the next page: both batches date from its queued
  // start, 120 s before this send, though its end came at 60 s.
  assert.deepEqual(sent.slice(-2).map(b => [b.ev[0][0], b.w]), [['ss', 120], ['se', 120]]);
  const last = JSON.parse(state.posts.at(-1).body);
  like(last.ev, [['ss', 0]], 'then the new page\'s session');
  assert.equal(last.w, 60, 'by the new page\'s own clock');
  assert.notEqual(last.s, stored.at(-1).e.s, 'a new page has a new session');
  assert.equal(await queue(page), null);
  serverKeeps(batches(state).filter(b => b.s !== '0123456789ab'));
});

test('a hidden page sends what waits by fetch with keepalive, unloading ends the session, offline keeps the queue, and no cookie goes', async t => {
  const state = await setup(t), { page } = state;
  await state.context.addCookies([COOKIE]);
  await page.goto(origin + '/');
  await setHidden(page, true);
  await until(() => state.posts.length === 1, 'the hidden page\'s send');
  assert.deepEqual([state.posts[0].type, state.posts[0].method, state.posts[0].url], ['fetch', 'POST', INGEST]);
  assert.match(state.posts[0].headers['content-type'], /^text\/plain/);
  const first = JSON.parse(state.posts[0].body);
  like(first.ev, [['ss', 0]]);
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
  like(last.ev.slice(-2), [['gx', int, 1, 'air-hockey', int, hist(6), hist(4)], ['se', int, int, 'u']]);
  assert.ok(allEvents(state).some(ev => ev[0] === 'go' && ev[3] === 'air-hockey'));
  assert.equal(await queue(page), null);

  // Offline: nothing goes and the batch waits in the queue.
  const sent = state.posts.length;
  await page.goto(origin + '/');
  await page.evaluate(() => Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false }));
  await setHidden(page, true);
  like((await queue(page)).map(x => x.e.ev), [[['ss', 0]]]);
  assert.equal(state.posts.length, sent, 'nothing goes while offline');
  for (const p of state.posts) assert.equal(p.headers.cookie, undefined, 'no cookie, neither while the page lives nor as it unloads');
  await checkBatches(page, batches(state));
});

test('a hidden page hands fetch only what fits in 60 KB of keepalive bodies in flight, oldest first, and keeps the rest', async t => {
  const state = await setup(t, { clock: true, answer: n => n === 1 ? 'hang' : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/seed.html');
  const now = await page.evaluate(() => Date.now());
  const most = ['re', 1, 1, 1, 'air-hockey', 'w', 'Level_abcdefghijklmnopq', 108e5, 1e9, 9, 1e5, 1e5, [1e5, 1e5, 1e5, 1e5, 1e5, 1e5], null];
  const ids = [1, 2, 3, 4].map(i => i.toString(16).padStart(16, 'a'));
  const seeded = ids.map((b, i) => ({ t: now - 3600000 + i, w0: now - 3700000,
    e: { v: 3, b, s: '0123456789ab', k: 'src', m: 'web', d: [4, 4, 1920], p: '', z: '', ev: Array.from({ length: 200 }, () => most) } }));
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
  like(stored.at(-1).e.ev, [['ss', 0]]);
  // That send was answered, so its bytes are free again: the page hidden once more sends the next.
  await setHidden(page, false);
  await setHidden(page, true);
  await until(() => state.posts.length === 3, 'the next hidden page\'s send');
  assert.equal(JSON.parse(state.posts[2].body).b, ids[2]);
  stored = await queue(page);
  assert.deepEqual(stored.map(x => x.e.b).slice(0, -1), [ids[0], ids[3]]);
});

test('a copy of the site elsewhere on this origin, built with another address, never sends this copy\'s queue', async t => {
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
  like(other.map(p => JSON.parse(p.body).ev), [[['ss', 0]]], 'only its own session');
  // The first copy's queue is neither sent nor dropped by the second.
  const kept = await queue(page, INGEST);
  like(kept.map(x => [x.e.s, x.e.ev.map(ev => ev[0])]), [[refused.s, ['ss']], [refused.s, ['se']]]);
  assert.deepEqual(kept[0].e, bare(refused), 'the very batch its server refused');
  // Both copies share this PC's code (one origin, one sg:site:rid).
  assert.equal(JSON.parse(other[0].body).p, refused.p);
  assert.equal(await queue(page, OTHER), null, 'the second copy delivered its own');
  assert.deepEqual(await tmKeys(page), [qKey(INGEST)]);
  serverKeeps(batches(state));
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
    ['se', 1, 2], ['lv', 3], ['tu', 'x'], ['tu', 's', 1], 'rs', null, 42,
    // A tutorial's start and end, at most once each per visit.
    ['tu', 's'], ['tu', 's'],
    // Kit's 64-event split: these counters reach the portal a message before their end.
    ['rs', 'w1-2', 0], ['rx', 2e7, 2e5, 2e4, 2e4, 2e9, 2e5, 1000]
  ], { e: 5000, f: [10, 2, 1, 0], il: [3, 1, 0, 0, 0, 0] }));
  await post(page, frame, msg([['re', 'e', 'w1-2', 10.4, -1, 0, 0, 0, none], ['tu', 'd'], ['tu', 'd']]));
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
  await post(page, frame, { type: 'sg:stats', version: 1, e: 9000, f: [0, 0, 0, 0], m: 0, r: [['t', 'start'], ['s', 'L9']], o: '', om: 0 });
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

  const events = allEvents(state).filter(ev => ev[0] !== 'gp');
  await checkBatches(page, batches(state));
  like(events, [
    ['ss', 0],
    ['go', int, 1, 'air-hockey', 'catalog', 0, 0],
    ['ld', int, 1, 'air-hockey', int],
    ['rs', int, 1, 1, 'air-hockey', 'L1', 3, 0],
    ['re', int, 1, 1, 'air-hockey', 'w', 'L1', 4000, 120, 3, 5, 1, rt, [4100, 6, 2, 3, 651, 2, 600]],
    ['rs', int, 1, 2, 'air-hockey', 'L1', 4, 1],
    ['re', int, 1, 2, 'air-hockey', 'q', 'L1', 108e5, -1, 4, 1e5, 0, [0, 0, 0, 0, 0, 7], null],
    ['tu', int, 1, 'air-hockey', 's'],
    ['rs', int, 1, 3, 'air-hockey', 'w1-2', 0, 0],
    ['re', int, 1, 3, 'air-hockey', 'e', 'w1-2', 10, -1, 0, 0, 0, none, [108e5, 1e5, 1e4, 1e4, 1e9, 1e5, 1000]],
    ['tu', int, 1, 'air-hockey', 'd'],
    ['rs', int, 1, 4, 'air-hockey', 'L5', 1, 0],
    ['re', int, 1, 4, 'air-hockey', 'l', 'L5', 1, 1, 1, 0, 0, none, null],
    ['rs', int, 1, 5, 'air-hockey', 'L5', 1, 1],
    ['re', int, 1, 5, 'air-hockey', 'l', 'L5', 1, 1, 1, 0, 0, none, null],
    ['rs', int, 1, 6, 'air-hockey', 'L5', 1, 2],
    ['re', int, 1, 6, 'air-hockey', 'l', 'L5', 1, 1, 1, 0, 0, none, null],
    ['rs', int, 1, 7, 'air-hockey', 'L6', 1, 0],
    ['re', int, 1, 8, 'air-hockey', 'w', 'L7', 1, 1, 1, 0, 0, none, null],
    ['rs', int, 1, 9, 'air-hockey', 'L2', 1, 0],
    // The real game also counted its own time and frames: at least what was posted here.
    ['gx', int, 1, 'air-hockey', v => v >= 5000 + 120000 + 1000, v => hist(6)(v) && v[0] >= 3 && v[1] >= 1 && v[2] >= 1, v => hist(4)(v) && v[0] >= 11]
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
    ['ss', 0],
    ['go', int, 1, 'maze-dash', v => SOURCES.includes(v), 0, 0], ['er', int, 1, 'maze-dash', 'x'], ['gx', int, 1, 'maze-dash', 0, zeros(6), zeros(4)],
    ['go', int, 2, 'snake-arena', v => SOURCES.includes(v), 0, 0], ['er', int, 2, 'snake-arena', 't'], ['gx', int, 2, 'snake-arena', 0, zeros(6), zeros(4)]
  ]);
  assert.ok(!state.posts.some(p => p.body.includes('secret')), 'no error text');
  await checkBatches(page, batches(state));
});

test('launch sources: catalog, featured, recent, favourites, category, quick filter, search, related, reload, direct and history', async t => {
  const state = await setup(t), { page } = state;
  await page.goto(origin + '/');
  const opened = async (slug, src) => {
    await ready(page);
    await home(page);
    await until(() => allEvents(state).some(ev => ev[0] === 'go' && ev[3] === slug && ev[4] === src), slug + ' from ' + src, 8000);
  };
  const hot = await page.locator('.catalog-grid .tile[data-slug]:has(.hot)').first().getAttribute('data-slug');
  const plain = await page.locator('.catalog-grid .tile[data-slug]:not(:has(.hot)):not(:has(.start))').first().getAttribute('data-slug');
  await page.locator(`.catalog-grid .tile[data-slug="${hot}"]`).click(); await opened(hot, 'featured');
  await page.locator(`.catalog-grid .tile[data-slug="${plain}"]`).click(); await opened(plain, 'catalog');
  await page.locator(`.recent-grid .tile[data-slug="${hot}"]`).click(); await opened(hot, 'recent');
  await page.locator(`.catalog-grid .tile[data-slug="tic-tac-toe"]`).click(); await ready(page);
  await page.locator('#favBtn').click();
  await page.locator('.recommendations .tile[data-slug]').first().click();
  const related = await page.evaluate(() => decodeURIComponent(location.hash.split('/')[2]));
  await opened(related, 'related');
  await page.goto(origin + '/#/favorites');
  await page.locator('.favorites-grid .tile[data-slug="tic-tac-toe"]').click(); await opened('tic-tac-toe', 'favorites');
  for (const [hash, src] of [['#/c/sports', 'category'], ['#/quick/friends', 'quick']]) {
    await page.goto(origin + '/' + hash);
    const tile = page.locator('#app .grid .tile[data-slug]').first(), slug = await tile.getAttribute('data-slug');
    await tile.click();
    await opened(slug, src);
  }
  // A search with one result, opened with Enter.
  await page.locator('#q').fill('2048');
  await page.locator('#q').press('Enter');
  await opened('merge-2048', 'search');
  // A new page load straight onto a game, then a reload of it, then back to it.
  await page.goto(origin + '/seed.html');
  await page.goto(origin + '/#/play/sumo-bonk');
  await ready(page);
  await page.reload();
  await opened('sumo-bonk', 'reload');
  assert.ok(allEvents(state).some(ev => ev[0] === 'go' && ev[3] === 'sumo-bonk' && ev[4] === 'direct'));
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#/play/sumo-bonk');
  await opened('sumo-bonk', 'history');
  await checkBatches(page, batches(state));
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
  await openVisit(page);
  const at = async (ms, count, label) => { await page.clock.runFor(ms); await until(() => state.posts.length === count, label, 5000); };
  const settled = n => page.waitForFunction(n => window.fetched === n, n);
  const next = async (on, seconds, count) => {
    await heart(page, on);
    await at(seconds * 1000 - 1, count - 1, `no send before ${seconds} s`);
    await at(1, count, `the send after ${seconds} s`);
    await settled(count);
  };
  await at(59999, 0, 'nothing before 60 s');
  await at(1, 1, 'the first send after 60 s');
  await settled(1);
  await next(true, 180, 2);   // asked 180
  await next(false, 20, 3);   // asked 20
  await next(true, 20, 4);    // 19: too short, ignored
  await next(false, 20, 5);   // 601: too long, ignored
  await next(true, 20, 6);    // 45.5: not whole, ignored
  await next(false, 20, 7);   // 'soon': ignored
  await next(true, 60, 8);    // no header: back to 60
  // A 503 asking for 300 is retried after 20 s; it changes nothing.
  await at(20000, 9, 'the retry');
  await settled(9);
  await next(false, 90, 10);  // the retry's 204 asked 90
  like(batches(state).map(b => b.ev.map(ev => ev[0] === 'fv' ? ev[4] : ev[0])), [['ss', 'go'], [1], [0], [1], [0], [1], [0], [1], [1], [0]]);
  await checkBatches(page, batches(state));
});

test('w: split batches and retries of one session date the same start; queued batches use their start, else their last time', async t => {
  const answers = [204, 204, 204, 204, 503];
  const state = await setup(t, { clock: true, answer: n => answers[n - 1] ?? 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/seed.html');
  const now = await page.evaluate(() => Date.now());
  const envelope = (b, ev) => ({ v: 3, b, s: 'abcdefabcdef', k: 'src', m: 'web', d: [4, 4, 1920], p: '', z: '', ev });
  await page.evaluate(([key, q]) => localStorage.setItem(key, JSON.stringify(q)), [qKey(INGEST), [
    // No start (an entry without w0): its last time. A start 10 days ago: the most the server takes.
    { t: now - 3600000, e: envelope('1'.repeat(16), [['ss', 40], ['se', 42, 0, 'u']]) },
    { t: now - 3600000, w0: now - 864e6, e: envelope('2'.repeat(16), [['ss', 7]]) },
    { t: now - 3600000, w0: now - 100000, e: envelope('3'.repeat(16), [['ss', 5]]) }
  ]]);
  await page.goto(origin + '/');
  // 252 events: two batches of the one session.
  await openVisit(page);
  await page.evaluate(() => { for (let i = 1; i <= 250; i++) SGTelemetry.fav('air-hockey', i % 2); });
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
  assert.deepEqual([one.ev.length, two.ev.length], [200, 52]);
  // Sent at 60 s, 60 s and (the retry of the second) 80 s after the session started.
  assert.deepEqual([one.w, two.w, again.w], [60, 60, 80]);
  assert.deepEqual(bare(again), bare(two));
  await checkBatches(page, list.slice(3));
  serverKeeps(list);
});
