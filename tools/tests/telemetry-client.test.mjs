// The portal's anonymous telemetry sink (js/telemetry.js; docs/ARCHITECTURE.md
// "Telemetry sink", docs/TELEMETRY.md), driven through the real portal and real game
// pages. Playwright answers the ingest server (https://ingest.test), so nothing leaves
// this machine; any other request still fails the test. The sink is switched on with
// window.SG_TELEMETRY = { url, allowLocal: true }, which no build ever writes. Every
// batch sent is also checked with the ingest server's own validator (server/schema.mjs).
// The same site is also served at /copy/, as a second copy on the same origin.
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
const ARITY = { ss: 6, go: 5, ld: 4, er: 4, rs: 6, re: 11, gx: 6, lv: 3, se: 3 };
// The server's validator, from this checkout once the server is merged in, or from the copy
// SG_SERVER_SCHEMA names (git show <server branch>:server/schema.mjs > schema.mjs).
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
// answer(n, post): the ingest server's status for the n-th request. Every test: no page
// or console errors, and no request other than this server's files and the answered
// POSTs to the ingest server.
async function setup(t, { telemetry = ON, copy = telemetry, gpc = false, clock = false, answer = () => 204 } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const state = { context, errors: [], requests: [], posts: [], answer };
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === 'https://ingest.test') return;
    if (request.method() !== 'GET' || /^(fetch|xhr|websocket|eventsource|ping)$/.test(request.resourceType()) ||
      (/^https?:$/.test(url.protocol) && url.origin !== origin)) state.requests.push(request.method() + ' ' + request.url());
  });
  // 'abort': the network fails; 'hang': the request is never answered.
  const answered = post => { state.posts.push(post); return state.answer(state.posts.length, post); };
  await context.route('https://ingest.test/**', async route => {
    const request = route.request();
    const status = answered({ url: request.url(), method: request.method(), type: request.resourceType(), headers: await request.allHeaders(), body: request.postData() });
    if (status === 'abort') await route.abort('failed');
    else if (status === 'hang') return;
    else await route.fulfill({ status, headers: { 'Access-Control-Allow-Origin': origin } });
  });
  // What a page sends while it unloads leaves after the page is gone, where the routes
  // above no longer see it; an interception for the whole browser does, with its headers.
  const cdp = await browser.newBrowserCDPSession();
  t.after(() => cdp.detach().catch(() => {}));
  cdp.on('Fetch.requestPaused', ({ requestId, request, resourceType }) => {
    const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]));
    const status = answered({ url: request.url, method: request.method, type: resourceType.toLowerCase(), headers, body: request.postData });
    // The page is gone: nothing waits for the answer.
    if (status === 'abort') cdp.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
    else if (status !== 'hang') {
      cdp.send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: origin }] }).catch(() => {});
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
    // Settled fetches, so a fake clock moves on only after the page has seen each answer.
    const realFetch = window.fetch;
    window.fetch = function () {
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
// no event dropped, and nothing it would round or clamp.
function serverKeeps(list) {
  if (!schema) return;
  for (const b of list) {
    const kept = schema.validateBatch(structuredClone(b));
    assert.ok(kept, 'the server accepts ' + JSON.stringify(b).slice(0, 300));
    assert.equal(kept.dropped, 0, 'the server drops no event of ' + JSON.stringify(b.ev));
    assert.deepEqual(kept.events, b.ev, 'the server changes no event');
    assert.deepEqual(kept.envelope, { b: b.b, s: b.s, k: b.k, m: b.m, a: b.a, d: b.d });
  }
}
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
// whole seconds since the session started and never go back.
async function checkBatches(page, list) {
  const device = await page.evaluate(() => [navigator.hardwareConcurrency, navigator.deviceMemory, screen.width]);
  const bucket = (v, steps) => steps.filter((s, i) => i === 0 || v >= s).at(-1);
  const d = [bucket(device[0], [1, 2, 4, 8, 16]), bucket(device[1], [0, 1, 2, 4, 8]), bucket(device[2], [1366, 1600, 1920, 2560])];
  for (const b of list) {
    assert.deepEqual(Object.keys(b), ['v', 'b', 's', 'k', 'm', 'a', 'd', 'ev']);
    assert.equal(b.v, 2);
    assert.match(b.b, /^[0-9a-f]{16}$/);
    assert.match(b.s, /^[0-9a-f]{12}$/);
    if (sourceTree) assert.equal(b.k, 'src'); else assert.match(b.k, /^[0-9a-f]{16}$/);
    assert.equal(b.m, 'web');
    assert.ok(['', '6-7', '8-9', '10-11'].includes(b.a), b.a);
    assert.deepEqual(b.d, d, 'device buckets');
    assert.ok(b.ev.length >= 1 && b.ev.length <= 200 && JSON.stringify(b).length <= 32768);
    for (const ev of b.ev) assert.equal(ev.length, ARITY[ev[0]], JSON.stringify(ev));
  }
  serverKeeps(list);
  // A retry sends the very same batch again; different batches never share an id.
  const seen = new Map();
  for (const b of list) {
    if (seen.has(b.b)) assert.equal(JSON.stringify(b), seen.get(b.b), 'a batch id is never reused');
    seen.set(b.b, JSON.stringify(b));
  }
  for (const [, events] of bySession(list)) {
    events.forEach((ev, i) => { assert.ok(int(ev[1]) && (!i || ev[1] >= events[i - 1][1]), 'times: ' + JSON.stringify(events)); });
  }
}

/* --------------------------------------------------------------- tests */
test('the server\'s validator is here, and it agrees with this test on the contract', { skip: !schema && 'no server/schema.mjs in this checkout and no SG_SERVER_SCHEMA' }, () => {
  assert.deepEqual(schema.SOURCES, SOURCES);
  assert.deepEqual(Object.fromEntries(Object.entries(schema.EVENTS).map(([kind, fields]) => [kind, fields.length + 1])), ARITY);
  // It refuses what the sink must never send: a wrong device bucket is a 400.
  const batch = { v: 2, b: '0123456789abcdef', s: '0123456789ab', k: 'src', m: 'web', a: '', d: [4, 4, 1920], ev: [['ss', 0, 0, 0, 4, 0]] };
  assert.ok(schema.validateBatch(batch));
  for (const bad of [{ d: [3, 4, 1920] }, { d: [4, 4, 1280] }, { k: '5C18C6D2D1C052AD' }, { s: '0123456789abc' }, { a: '6' }, { m: 'pwa' }]) {
    assert.equal(schema.validateBatch({ ...batch, ...bad }), null, JSON.stringify(bad));
  }
});

test('real rounds reach the ingest server as the contract says, with nothing that could name a child or a PC', async t => {
  const state = await setup(t), { page } = state;
  await page.goto(origin + '/seed.html');
  await page.evaluate(() => localStorage.setItem('sg:site:statsmeta', JSON.stringify({ pc: { id: 'pcwxyz', label: 'مختبر سارة' }, since: '2026-10-01' })));
  // credentials: 'omit': a cookie of the ingest server never goes with a fetch.
  await state.context.addCookies([COOKIE]);
  await page.goto(origin + '/');
  assert.equal(await page.evaluate(() => SGTelemetry.active()), true);
  assert.deepEqual(await tmKeys(page), ['sg:site:tm:on'], 'the teacher page is told this PC shares');
  assert.equal(await tm(page, 'sg:site:tm:on'), '"ingest.test"');

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
  await until(() => allEvents(state).some(ev => ev[0] === 'gx' && ev[2] === starter), 'the starter game closing');
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
  await until(() => allEvents(state).some(ev => ev[0] === 'gx' && ev[2] === 'tic-tac-toe'), 'tic-tac-toe closing');

  // Wins (v1 sg:stats, as for XP) take the child to level 2.
  const hockey = await play(page, 'air-hockey');
  const xp = await page.evaluate(() => SGProfiles.current().xp);
  const wins = Array.from({ length: Math.ceil((30 - xp) / 10) }, () => [['s', 'L1'], ['w', 'L1', 1000]]).flat();
  await post(page, hockey, { type: 'sg:stats', version: 1, e: 0, f: [0, 0, 0, 0], m: 0, r: wins, o: '' });
  assert.equal(await page.evaluate(() => SGProfiles.current().lv), 2);
  await home(page);
  await until(() => allEvents(state).some(ev => ev[0] === 'gx' && ev[2] === 'air-hockey'), 'air-hockey closing');

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
  assert.deepEqual(list.filter(b => b.s === guestId).map(b => b.a), list.filter(b => b.s === guestId).map(() => ''));
  assert.deepEqual([...new Set(list.filter(b => b.s === childId).map(b => b.a))], ['8-9']);
  like(guest, [['ss', 0, 0, 0, 4, 0], ['se', int, 0]], 'guest');
  // The starter game is checked only for its open, load and close (its own rounds are its own).
  const own = child.filter(ev => ev[2] !== starter);
  const start = child.filter(ev => ev[2] === starter);
  like(start.filter(ev => ['go', 'ld', 'gx'].includes(ev[0])), [['go', int, starter, 'starter', 0], ['ld', int, starter, int],
    ['gx', int, starter, int, hist(6), hist(4)]], 'starter');
  const [tier1, tier2] = own.filter(ev => ev[0] === 'rs').map(ev => ev[4]);
  like(own, [
    ['ss', 0, 1, 0, 4, 1],
    ['go', int, 'tic-tac-toe', tttSource, 0],
    ['ld', int, 'tic-tac-toe', v => int(v) && v < 120000],
    ['rs', int, 'tic-tac-toe', 'local', tierOf, 0],
    ['re', int, 'tic-tac-toe', 'e', 'local', pos, -1, tier1, 0, 0, zeros(6)],
    ['rs', int, 'tic-tac-toe', 'local', tierOf, 1],
    ['re', int, 'tic-tac-toe', 'e', 'local', pos, -1, tier2, 0, 0, zeros(6)],
    // tic-tac-toe draws no frames; every click went through Kit's input-latency histogram.
    ['gx', int, 'tic-tac-toe', pos, v => hist(6)(v) && v.reduce((a, b) => a + b) > 0, zeros(4)],
    ['go', int, 'air-hockey', 'catalog', 0],
    ['ld', int, 'air-hockey', int],
    ['lv', int, 2],
    ['gx', int, 'air-hockey', 0, zeros(6), zeros(4)]
  ], 'child');
  const gx = own.find(ev => ev[0] === 'gx');
  const res = own.filter(ev => ev[0] === 're');
  assert.ok(gx[3] >= res[0][5] + res[1][5], 'the game\'s engaged time covers its rounds');

  // Nothing that could name a child, a PC or a browser, and no clock time.
  const text = state.posts.map(p => p.body).join('\n');
  for (const secret of ['pcwxyz', 'مختبر', 'سارة', 'زرافة', 'سرية', '"p1"', '🐸', '#f57c00', 'cookie-value', 'Mozilla',
    'Chrome', 'Linux', '127.0.0.1', 'localhost', 'sg:', 'http', 'SG_']) {
    assert.ok(!text.includes(secret), 'the batches never contain ' + secret);
  }
  assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}|\d{2}:\d{2}/, 'no dates or times of day');
  const numbers = JSON.stringify(list.map(b => b.ev)).match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(numbers.every(n => Number.isInteger(n) && n >= -1 && n < 1e8), 'whole numbers, none like a timestamp');
  assert.deepEqual(await queue(page), null, 'everything was delivered');
});

test('off unless every gate holds: games are told telemetry: false and nothing is sent or stored', async t => {
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
  await at(19000, 0, 'nothing before 20 s');
  await at(1000, 1, 'the first send after 20 s');
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
  assert.ok(state.posts.slice(1, 7).every(p => p.body === state.posts[0].body), 'the same batch, the same id');
  like(JSON.parse(state.posts[0].body).ev, [['ss', 0, 0, 0, 4, 0]]);

  // A malformed batch (400) is dropped and never sent again.
  await page.evaluate(() => SGTelemetry.level(4));
  await at(20000, 8, 'the next batch');
  await settled(8);
  assert.equal(await queue(page), null, 'a 400 drops the batch');
  await at(400000, 8, 'no retry after a 400');
  // 429 (too many requests) keeps the batch and backs off from 20 s again.
  await page.evaluate(() => SGTelemetry.level(5));
  await at(20000, 9, 'the batch after the 400');
  await settled(9);
  assert.equal((await queue(page)).length, 1, 'a 429 keeps the batch');
  await at(19999, 9, 'no retry before 20 s');
  await at(1, 10, 'the retry after a 429');
  await settled(10);
  assert.equal(await queue(page), null);
  assert.equal(state.posts[9].body, state.posts[8].body);
  like(state.posts.slice(7).map(p => JSON.parse(p.body).ev), [[['lv', int, 4]], [['lv', int, 5]], [['lv', int, 5]]]);
  await checkBatches(page, batches(state));
});

test('a request that is never answered holds the queue back for a minute at most', async t => {
  const state = await setup(t, { clock: true, answer: n => n === 1 ? 'hang' : 204 }), { page } = state;
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto(origin + '/');
  const at = async (ms, count, label) => { await page.clock.runFor(ms); await until(() => state.posts.length === count, label, 5000); };
  await at(20000, 1, 'the first send');
  // Nothing else happens on the page: the same batch goes again a minute later.
  await at(59999, 1, 'no second request while the first may still be answered');
  await at(1, 2, 'the same batch again after a minute');
  await page.waitForFunction(() => window.fetched === 1);
  assert.equal(state.posts[1].body, state.posts[0].body, 'the same batch, the same id');
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
  await page.clock.fastForward(20000);
  await until(() => bySession(batches(state)).size === 2, 'both sessions');
  const [[, never], [, played]] = [...bySession(batches(state))];
  like(never, [['ss', 0, 0, 1, 4, 1], ['se', int, 0]], 'never played');
  like(played, [['ss', 0, 0, 1, 2, 2]], 'played 3 days ago');
  await checkBatches(page, batches(state));
});

test('the queue survives a reload, sends oldest first, and keeps at most 128 KB, 7 days and nothing from before a clear', async t => {
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
  await page.clock.runFor(20000);
  await until(() => state.posts.length === 1, 'the first send');
  await page.waitForFunction(() => window.fetched === 1);
  let stored = await queue(page);
  assert.ok(JSON.stringify(stored).length <= 131072, 'at most 128 KB');
  const kept = stored.map(x => x.e.b);
  // The oldest big batch made room for the new one; the dropped entries are gone.
  assert.deepEqual(kept.slice(0, -1), [2, 3, 4, 5].map(i => i.toString(16).padStart(16, 'a')));
  like(stored.at(-1).e.ev, [['ss', 0, 0, 0, 4, 0]]);
  assert.equal(JSON.parse(state.posts[0].body).b, kept[0], 'the oldest batch goes first');

  // A reload while the server is failing: the session's end joins the queue, and the
  // unloading page sends nothing to a failing server.
  await page.reload();
  assert.equal(state.posts.length, 1);
  stored = await queue(page);
  assert.deepEqual(stored.map(x => x.e.b).slice(0, -1), kept);
  like(stored.at(-1).e.ev, [['se', int, 0]]);
  assert.equal(stored.at(-1).e.s, stored.at(-2).e.s);
  const order = stored.map(x => x.e.b);
  down = false;
  await page.clock.runFor(20000);
  await until(() => state.posts.length === 2 + order.length, 'every batch delivered');
  await page.waitForFunction(n => window.fetched === n, 1 + order.length);
  assert.deepEqual(state.posts.slice(1, 1 + order.length).map(p => JSON.parse(p.body).b), order, 'oldest first');
  like(JSON.parse(state.posts.at(-1).body).ev, [['ss', 0, 0, 0, 4, 0]], 'then the new page\'s session');
  assert.notEqual(JSON.parse(state.posts.at(-1).body).s, stored.at(-1).e.s, 'a new page has a new session');
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
  like(first.ev, [['ss', 0, 0, 0, 4, 0]]);
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
  like(last.ev.slice(-2), [['gx', int, 'air-hockey', 0, zeros(6), zeros(4)], ['se', int, 0]]);
  assert.ok(allEvents(state).some(ev => ev[0] === 'go' && ev[2] === 'air-hockey'));
  assert.equal(await queue(page), null);

  // Offline: nothing goes and the batch waits in the queue.
  const sent = state.posts.length;
  await page.goto(origin + '/');
  await page.evaluate(() => Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false }));
  await setHidden(page, true);
  like((await queue(page)).map(x => x.e.ev), [[['ss', 0, 0, 0, 4, 0]]]);
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
  // The oldest goes by the 20 s send and is never answered: its body stays in flight.
  await page.clock.runFor(20000);
  await until(() => state.posts.length === 1, 'the first send');
  await setHidden(page, true);
  await until(() => state.posts.length === 2, 'the hidden page\'s send');
  await page.waitForFunction(() => window.fetched === 1);
  assert.deepEqual(state.posts.map(p => JSON.parse(p.body).b), ids.slice(0, 2), 'only one more fits beside the one in flight');
  assert.ok(state.posts.every(p => p.type === 'fetch'));
  let stored = await queue(page);
  assert.deepEqual(stored.map(x => x.e.b).slice(0, -1), [ids[0], ids[2], ids[3]], 'the batch in flight and every batch not handed to fetch stay');
  like(stored.at(-1).e.ev, [['ss', 0, 0, 0, 4, 0]]);
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
  await page.clock.runFor(20000);
  await until(() => state.posts.length === 1, 'the first copy\'s send');
  await page.waitForFunction(() => window.fetched === 1);
  const refused = JSON.parse(state.posts[0].body);
  // The copy at /copy/ sends its own session to its own server, and nothing else.
  await page.goto(origin + '/copy/');
  assert.equal(await page.evaluate(() => SGTelemetry.active()), true);
  await page.clock.runFor(20000);
  await until(() => state.posts.length > 1, 'the second copy\'s send');
  await page.waitForFunction(() => window.fetched >= 1);
  await page.clock.runFor(60000);
  const other = state.posts.slice(1);
  assert.ok(other.every(p => p.url === OTHER && JSON.parse(p.body).s !== refused.s), 'the second copy never sends the first one\'s batches');
  like(other.map(p => JSON.parse(p.body).ev), [[['ss', 0, 0, 0, 4, 0]]], 'only its own session');
  // The first copy's queue is neither sent nor dropped by the second.
  const kept = await queue(page, INGEST);
  like(kept.map(x => [x.e.s, x.e.ev.map(ev => ev[0])]), [[refused.s, ['ss']], [refused.s, ['se']]]);
  assert.deepEqual(kept[0].e, refused, 'the very batch its server refused');
  assert.equal(await queue(page, OTHER), null, 'the second copy delivered its own');

  // The second copy's server fails too: both copies have a queue. Stopping statistics
  // on this PC drops both, and the note.
  down.add(OTHER);
  await page.evaluate(() => SGTelemetry.level(3));
  await page.clock.runFor(20000);
  await until(() => state.posts.length === 3, 'the second copy\'s next send');
  await page.waitForFunction(() => window.fetched === 2);
  like((await queue(page, OTHER)).map(x => x.e.ev), [[['lv', int, 3]]]);
  assert.deepEqual(await tmKeys(page), [qKey(INGEST), qKey(OTHER), 'sg:site:tm:on'].sort());
  await page.evaluate(() => localStorage.setItem('sg:site:statsmeta', JSON.stringify({ pc: { id: 'pcwxyz' }, off: true, offSince: Date.now() })));
  assert.equal(await page.evaluate(() => SGTelemetry.active()), false);
  assert.deepEqual(await tmKeys(page), [], 'both queues and the note are gone');
  serverKeeps(batches(state));
});

test('each player gets a new session: the old one ends after its game, and a band change marks later batches', async t => {
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
  await page.clock.fastForward(20000);
  await until(() => allEvents(state).some(ev => ev[0] === 'lv'), 'the batch after the band change');

  const list = batches(state);
  await checkBatches(page, list);
  const sessions = [...bySession(list)];
  assert.equal(sessions.length, 3);
  const [[first, guest], [second, child], [third, next]] = sessions;
  assert.equal(new Set([first, second, third]).size, 3, 'three session ids');
  like(guest, [['ss', 0, 0, 0, 4, 0], ['se', int, 0]], 'the first guest');
  like(child, [['ss', 0, 1, 0, 4, 1], ['go', int, 'air-hockey', 'catalog', 0], ['ld', int, 'air-hockey', int],
    ['gx', int, 'air-hockey', 0, zeros(6), zeros(4)], ['se', int, 0]], 'the child: its game closes before its session ends');
  like(next, [['ss', 0, 0, 0, 4, 0], ['lv', int, 3]], 'the next guest');
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
  await page.clock.fastForward(20000);
  await until(() => bySession(batches(state)).size === 2, 'the guest\'s session');
  const list = batches(state);
  await checkBatches(page, list);
  const [[, child], [, guest]] = [...bySession(list)];
  like(child.filter(ev => ['ss', 'go', 'se'].includes(ev[0])), [['ss', 0, 0, 3, 2, 3], ['go', int, 'air-hockey', 'catalog', 3],
    ['go', int, 'tic-tac-toe', v => ['featured', 'catalog'].includes(v), 1], ['se', int, int]], 'the child');
  like(guest, [['ss', 0, 0, 0, 4, 0]], 'the guest');
  assert.deepEqual([...new Set(list.map(b => b.a))], ['10-11', '']);
  const text = state.posts.map(p => p.body).join('\n');
  for (const secret of ['"p3"', '🐙', '#8e24aa', '"xp"', '"d0"']) assert.ok(!text.includes(secret), 'never ' + secret);
});

test('sg:telemetry from the game frame is checked field by field; other windows and late frames are ignored', async t => {
  const state = await setup(t, { clock: true }), { page } = state;
  await page.goto(origin + '/');
  const frame = await play(page, 'air-hockey');
  const msg = (ev, extra) => ({ type: 'sg:telemetry', version: 2, e: 0, f: [0, 0, 0, 0], il: [0, 0, 0, 0, 0, 0], ev, ...extra });
  const rt = [1, 2, 0, 0, 0, 1];
  await post(page, frame, msg([
    ['rs', 'L1', 3],
    ['re', 'w', 'L1', 4000.4, 120, 3, 5, 1, rt],
    ['rs', 'L1', 4],
    ['re', 'q', 'L1', 9e9, -1, 4, 2e6, 0, [0, 0, 0, 0, 0, 7]],
    ['rs', 'w1-2', 0],
    // Dropped: ids that could be typed text, bad tiers, codes, numbers, histograms and arity.
    ['rs', 'L123', 1], ['rs', 'two words', 1], ['rs', 'constructor', 1], ['rs', '1-4', 1], ['rs', 'L1', 10], ['rs', 'L1', 1.5],
    ['rs', 'L1'], ['rs', 'L1', 1, 'extra'], ['re', 'x', 'L1', 1, 1, 1, 1, 1, rt], ['re', ['w'], 'L1', 1, 1, 1, 1, 1, rt],
    ['re', 'w', 'L1', -5, 1, 1, 1, 1, rt], ['re', 'w', 'L1', 1, -2, 1, 1, 1, rt], ['re', 'w', 'L1', 1, 1, 1, 'a', 1, rt],
    ['re', 'w', 'L1', 1, 1, 1, 1, 1, [1, 2, 3, 4, 5]], ['re', 'w', 'L1', 1, 1, 1, 1, 1, [1, 2, 3, 4, 5, -6]],
    ['re', 'w', 'L1', 1, 1, 1, 1, 1, rt, 'extra'], ['re', 'w', 'L1', null, 1, 1, 1, 1, rt], ['go', 0, 'x', 'direct', 0],
    ['se', 1, 2], 'rs', null, 42
  ], { e: 5000, f: [10, 2, 1, 0], il: [3, 1, 0, 0, 0, 0] }));
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
    ['ss', 0, 0, 0, 4, 0],
    ['go', int, 'air-hockey', 'catalog', 0],
    ['ld', int, 'air-hockey', int],
    ['rs', int, 'air-hockey', 'L1', 3, 0],
    ['re', int, 'air-hockey', 'w', 'L1', 4000, 120, 3, 5, 1, rt],
    ['rs', int, 'air-hockey', 'L1', 4, 1],
    ['re', int, 'air-hockey', 'q', 'L1', 108e5, -1, 4, 1e5, 0, [0, 0, 0, 0, 0, 7]],
    ['rs', int, 'air-hockey', 'w1-2', 0, 0],
    ['rs', int, 'air-hockey', 'L2', 1, 0],
    ['gx', int, 'air-hockey', 5000 + 120000 + 0 + 1000, [3, 1, 1, 0, 0, 0], [11, 2, 1, 0]]
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
    ['ss', 0, 0, 0, 4, 0],
    ['go', int, 'maze-dash', v => SOURCES.includes(v), 0], ['er', int, 'maze-dash', 'x'], ['gx', int, 'maze-dash', 0, zeros(6), zeros(4)],
    ['go', int, 'snake-arena', v => SOURCES.includes(v), 0], ['er', int, 'snake-arena', 't'], ['gx', int, 'snake-arena', 0, zeros(6), zeros(4)]
  ]);
  assert.ok(!state.posts.some(p => p.body.includes('secret')), 'no error text');
  await checkBatches(page, batches(state));
});

test('stopping statistics in another tab drops what waits and tells the open game at once', async t => {
  const state = await setup(t), { page } = state;
  await page.goto(origin + '/');
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
  await teacher.close();
});
