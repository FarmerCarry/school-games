// The portal's local play statistics recorder (js/stats.js, docs/PLAY_STATS.md
// section 2), driven by stand-in game pages and, where time matters, a paused
// fake clock.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const DAY = '2026-10-08';
const START = new Date('2026-10-08T09:00:00+03:00');
const LIVE = 'sg:site:stats:live', META = 'sg:site:statsmeta';
const GAME_KEYS = ['o', 'e', 'hh', 'b', 'ns', 'src', 'l', 'lb', 'ls', 'x', 't', 'f', 'tu', 'fav', 'lv'];
const SOURCES = ['featured', 'catalog', 'recent', 'favorites', 'category', 'quick', 'search', 'related', 'surprise', 'reload', 'history', 'direct'];
let browser, server, origin, pings = 0;

before(async () => {
  server = await startTestServer(root);
  origin = server.origin;
  browser = await launchChromium();
});
after(async () => { await browser?.close(); await server?.close(); });

// A stand-in game loads nothing. It says it is ready unless told not to, posts
// what the test asks for, and sends `window.last` when it is removed (as Kit
// does on pagehide).
function standIn(ready) {
  return `<!doctype html><meta charset="utf-8"><title>stand-in</title><script>
window.send = function (data) { parent.postMessage(data, '*'); };
addEventListener('pagehide', function () { if (window.last) send(window.last); });
${ready ? "send({ type: 'sg:ready', version: 1 });" : ''}
</script>`;
}

async function newPage(state) {
  const page = await state.context.newPage();
  page.on('pageerror', error => state.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') state.errors.push(message.text()); });
  // Nothing may leave the page: no beacons, uploads, sockets or other origins.
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() !== 'GET' || /^(fetch|xhr|websocket|eventsource|ping)$/.test(request.resourceType()) ||
      (/^https?:$/.test(url.protocol) && url.origin !== origin)) state.requests.push(request.method() + ' ' + request.url());
  });
  return page;
}

async function setup(t, { ready = true, storage = true, time = START, clock = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', timezoneId: 'Asia/Riyadh' });
  t.after(() => context.close());
  const state = { context, ready, clock, errors: [], requests: [] };
  await context.route('**/games/*/index.html', route => route.fulfill({ contentType: 'text/html', body: standIn(state.ready) }));
  await context.route('**/seed.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>seed</title>' }));
  await context.addInitScript(() => {
    // A ping posted after a game message is handled after it (same source, same order).
    addEventListener('message', e => { if (e.data && e.data.type === 'test:ping') window.lastPing = e.data.n; });
    addEventListener('storage', e => { if (e.key === 'sg:site:statsmeta') window.metaEvents = (window.metaEvents || 0) + 1; });
    Storage.prototype.clear = function () { throw new Error('localStorage.clear() must never be used'); };
  });
  if (!storage) {
    await context.addInitScript(() => {
      for (const method of ['getItem', 'setItem', 'removeItem', 'key']) {
        Object.defineProperty(Storage.prototype, method, { value() { throw new DOMException('Storage disabled by test', 'SecurityError'); } });
      }
    });
  }
  // Playwright's fake clock also replaces `performance`, hiding the navigation
  // type, so the reload source is checked on the real clock.
  if (clock) {
    await context.clock.install({ time });
    await context.clock.pauseAt(new Date(+time + 1000));
  }
  state.page = await newPage(state);
  t.after(() => {
    assert.deepEqual(state.errors, [], 'no page or console errors');
    assert.deepEqual(state.requests, [], 'nothing goes over the network');
  });
  return state;
}

// Synthetic clicks keep the suite fast; real ones are used where a user gesture matters.
const click = (page, selector) => page.evaluate(s => document.querySelector(s).click(), selector);
const go = (page, hash) => page.evaluate(h => { location.hash = h; }, hash);
const read = (page, key = 'sg:site:stats:d:' + DAY) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
const stats = (e, r = [], o = '', extra = {}) => ({ type: 'sg:stats', version: 1, e, f: [0, 0, 0, 0], m: 0, r, o, ...extra });

async function playing(page, slug) {
  await page.waitForFunction(s => location.hash === '#/play/' + s && document.querySelector('#stage iframe')?.contentWindow?.send, slug);
  return (await page.$('#stage iframe')).contentFrame();
}
async function post(page, frame, data) {
  const n = ++pings;
  await frame.evaluate(([d, n]) => { send(d); send({ type: 'test:ping', n }); }, [data, n]);
  await page.waitForFunction(n => window.lastPing === n, n);
}
async function leave(state, page = state.page) {
  await click(page, '#logo');
  await page.waitForFunction(() => document.body.className === 'route-home');
  // A departed game's open round is settled after 1 s without its last message.
  if (state.clock) await state.context.clock.runFor(1000);
  else await new Promise(resolve => setTimeout(resolve, 1100));
}
// Every stored day record, summed by game (for tests on the real clock).
const readAll = page => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sg:site:stats:d:')).map(k => JSON.parse(localStorage.getItem(k))));
const setHidden = (page, hidden) => page.evaluate(h => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

function checkRecord(record, day) {
  const count = value => Number.isInteger(value) && value >= 0;
  assert.deepEqual(Object.keys(record), ['v', 'd', 's', 'g']);
  assert.equal(record.v, 1);
  assert.equal(record.d, day);
  assert.deepEqual(Object.keys(record.s), ['calm', 'fs', 'mute']);
  assert.ok(Object.values(record.s).every(count));
  for (const [slug, g] of Object.entries(record.g)) {
    assert.deepEqual(Object.keys(g), GAME_KEYS, slug);
    for (const key of ['o', 'e', 'ns', 'ls', 'x', 't']) assert.ok(count(g[key]), slug + '.' + key);
    for (const [key, length] of [['b', 4], ['l', 3], ['lb', 5], ['f', 4], ['tu', 2]]) {
      assert.ok(Array.isArray(g[key]) && g[key].length === length && g[key].every(count), slug + '.' + key);
    }
    assert.ok(g.fav === 0 || g.fav === 1);
    for (const [hour, ms] of Object.entries(g.hh)) assert.ok(/^(1?\d|2[0-3])$/.test(hour) && ms > 0 && count(ms));
    for (const [source, n] of Object.entries(g.src)) assert.ok(SOURCES.includes(source) && n > 0 && count(n));
    for (const [id, level] of Object.entries(g.lv)) {
      assert.ok(id === '_other' || (/^[A-Za-z][A-Za-z0-9_:.-]{0,23}$/.test(id) && !/\d{3}/.test(id)), id);
      assert.ok(level.length === 12 && level.every(value => value >= 0), id);
    }
  }
}

test('a session spans restarts and re-renders, quits open rounds and matches the documented format', async t => {
  const state = await setup(t);
  const { page } = state;
  await page.goto(origin + '/#/');
  await click(page, '.catalog-grid .tile[data-slug="air-hockey"]');
  let game = await playing(page, 'air-hockey');
  await post(page, game, stats(45000, [['s', 'L1'], ['w', 'L1', 20000, 950], ['s', 'L2']], 'L2', { f: [100, 10, 1, 0], m: 2 }));
  // Restart: the replaced frame's own last message already ends L2, so it is no quit.
  await game.evaluate(() => { window.last = { type: 'sg:stats', version: 1, e: 5000, f: [0, 0, 0, 0], m: 0, r: [['w', 'L2', 9000, 120]], o: '' }; });
  await click(page, '#restartBtn');
  game = await playing(page, 'air-hockey');
  await post(page, game, stats(10000, [['s', 'L3']], 'L3'));
  // A same-page re-render replaces the frame too; the open L3 becomes a quit.
  await page.evaluate(() => dispatchEvent(new HashChangeEvent('hashchange')));
  game = await playing(page, 'air-hockey');
  await post(page, game, stats(15000, [['s', 'L3'], ['l', 'L3', 4000]], ''));
  await leave(state);

  const record = await read(page);
  checkRecord(record, DAY);
  assert.equal(Object.keys(record.g).length, 1);
  const g = record.g['air-hockey'];
  assert.equal(g.o, 1, 'restart and re-render are not new opens');
  assert.equal(g.e, 75000);
  assert.deepEqual(g.hh, { 9: 75000 });
  assert.deepEqual(g.b, [0, 1, 0, 0], 'one closed session of 75 s');
  assert.equal(g.ns, 0);
  assert.deepEqual(g.src, { catalog: 1 });
  assert.deepEqual([g.l, g.lb, g.ls], [[1, 0, 0], [1, 0, 0, 0, 0], 0], 'only the first frame is timed');
  assert.deepEqual(g.f, [100, 10, 1, 0]);
  assert.deepEqual(record.s, { calm: 0, fs: 0, mute: 2 });
  assert.deepEqual(g.lv, {
    L1: [1, 1, 0, 0, 0, 0, 20000, 950, 950, 1, 1, 0],
    L2: [1, 1, 0, 0, 0, 0, 9000, 120, 120, 1, 1, 0],
    L3: [2, 0, 1, 0, 0, 1, 4000, 0, 0, 0, 1, 1]
  });
  const meta = await read(page, META);
  assert.match(meta.pc.id, /^pc[a-z]{4}$/, 'the PC id is made on the first write');
  assert.equal(meta.since, DAY);
  assert.deepEqual(await read(page, LIVE), {}, 'no session is left open');
});

test('late messages after Back are credited to the game that sent them, never to the next one', async t => {
  const state = await setup(t);
  const { page } = state;
  await page.goto(origin + '/#/');
  await click(page, '.catalog-grid .tile[data-slug="air-hockey"]');
  let game = await playing(page, 'air-hockey');
  await post(page, game, stats(45000, [['s', 'L3']], 'L3'));
  const related = await page.evaluate(() => document.querySelector('.recommendations .tile').dataset.slug);
  await click(page, '.recommendations .tile');
  game = await playing(page, related);
  await post(page, game, stats(20000, [['s', 'w1']], 'w1'));
  await game.evaluate(() => { window.last = { type: 'sg:stats', version: 1, e: 25000, f: [3, 0, 0, 0], m: 1, r: [['l', 'w1', 40000]], o: '' }; });
  await page.evaluate(() => history.back());
  await playing(page, 'air-hockey');
  await leave(state);
  // A tile click is a launch source for 1 s only (here its navigation was cancelled).
  await page.evaluate(() => {
    const tile = document.querySelector('.catalog-grid .tile[data-slug="tic-tac-toe"]');
    tile.addEventListener('click', e => e.preventDefault(), { once: true });
    tile.click();
  });
  await state.context.clock.runFor(1500);
  await go(page, '#/play/tic-tac-toe');
  await playing(page, 'tic-tac-toe');
  await leave(state);

  const record = await read(page);
  checkRecord(record, DAY);
  assert.deepEqual(record.g['tic-tac-toe'].src, { history: 1 }, 'a stale tile click is not used');
  const a = record.g['air-hockey'], b = record.g[related];
  assert.deepEqual([a.o, a.src, a.e, a.b, a.f], [2, { catalog: 1, history: 1 }, 45000, [2, 0, 0, 0], [0, 0, 0, 0]], 'nothing from the departed game reaches the next session');
  assert.deepEqual(a.lv, { L3: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1] }, 'the open round became a quit');
  assert.deepEqual([b.o, b.src, b.e, b.b, b.f], [1, { related: 1 }, 45000, [1, 0, 0, 0], [3, 0, 0, 0]]);
  assert.deepEqual(b.lv, { w1: [1, 0, 1, 0, 0, 0, 40000, 0, 0, 0, 1, 1] }, 'its last loss arrived after removal');
  assert.equal(record.s.mute, 1);
});

test('failures keep a session out of the length buckets and never-started sessions are counted apart', async t => {
  const state = await setup(t, { ready: false });
  const { page, context } = state;
  await page.goto(origin + '/#/play/air-hockey');
  await playing(page, 'air-hockey');
  await context.clock.runFor(20001);
  await page.waitForFunction(() => !document.querySelector('#stageMsg').hidden);
  state.ready = true;
  await click(page, '#gameRetry');
  let game = await playing(page, 'air-hockey');
  await page.waitForFunction(() => document.querySelector('#stage').getAttribute('aria-busy') === 'false');
  await post(page, game, stats(90000, [['s', 'L1']], 'L1'));
  await game.evaluate(() => send({ type: 'sg:error', version: 1, message: 'Boom: private text' }));
  await page.waitForFunction(() => !document.querySelector('#stageMsg').hidden);
  await click(page, '#gameRetry');
  await playing(page, 'air-hockey');
  state.ready = false;
  await go(page, '#/play/tic-tac-toe');
  await playing(page, 'tic-tac-toe');
  await leave(state);

  const record = await read(page);
  checkRecord(record, DAY);
  const a = record.g['air-hockey'], b = record.g['tic-tac-toe'];
  assert.deepEqual([a.o, a.t, a.x, a.ns, a.b, a.l], [1, 1, 1, 0, [0, 0, 0, 0], [0, 0, 0]], 'retry continues the session; failures are not short sessions');
  assert.deepEqual(a.lv.L1, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1], 'the failed frame left L1 open');
  assert.deepEqual([b.o, b.ns, b.b, b.t, b.src], [1, 1, [0, 0, 0, 0], 0, { history: 1 }]);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  assert.ok(!/Boom|private/.test(stored), 'error text is never stored');
});

test('launch sources come from the clicked tile, or from how the play page was reached', async t => {
  const state = await setup(t, { clock: false });
  const { page } = state;
  await page.goto(origin + '/seed.html');
  await page.evaluate(() => {
    localStorage.setItem('sg:site:favs', '["pool-party"]');
    localStorage.setItem('sg:site:recent', '["maze-dash"]');
  });
  await page.goto(origin + '/#/play/drift-king');
  await playing(page, 'drift-king');
  const launch = async (hash, routeClass, selector) => {
    await go(page, hash);
    await page.waitForFunction(c => document.body.className === c, routeClass);
    const slug = await page.evaluate(s => document.querySelector(s).dataset.slug, selector);
    await click(page, selector);
    await playing(page, slug);
    return slug;
  };
  const featured = await launch('#/', 'route-home', '.catalog-grid .tile:has(.badge.hot)');
  await launch('#/', 'route-home', '.catalog-grid .tile[data-slug="tunnel-blitz"]');
  await launch('#/', 'route-home', '.recent-grid .tile[data-slug="maze-dash"]');
  await launch('#/favorites', 'route-favorites', '.favorites-grid .tile[data-slug="pool-party"]');
  await launch('#/c/racing', 'route-cat', '.tile[data-slug="moto-madness"]');
  const quick = await launch('#/quick/simple', 'route-quick', '#app .tile');
  const searched = await launch('#/search/two', 'route-search', '#app .tile');
  // Search submit with exactly one result, and a related game on the play page.
  await go(page, '#/');
  await page.waitForFunction(() => document.body.className === 'route-home');
  await page.evaluate(() => { document.querySelector('#q').value = 'Snake Arena'; document.querySelector('#searchForm').requestSubmit(); });
  await playing(page, 'snake-arena');
  const related = await page.evaluate(() => document.querySelector('.recommendations .tile').dataset.slug);
  await click(page, '.recommendations .tile');
  await playing(page, related);
  await click(page, '#surprise');
  await page.waitForFunction(() => /^#\/play\//.test(location.hash) && document.querySelector('#stage iframe')?.contentWindow?.send);
  const surprise = await page.evaluate(() => decodeURIComponent(location.hash.slice(7)));
  await go(page, '#/');
  await page.waitForFunction(() => document.body.className === 'route-home');
  await page.evaluate(() => history.back());
  await playing(page, surprise);
  await page.reload();
  await playing(page, surprise);
  await leave(state);

  // Sum over the stored days in case the real clock passed midnight.
  const record = { g: {} };
  for (const day of await readAll(page)) {
    checkRecord(day, day.d);
    for (const [slug, g] of Object.entries(day.g)) {
      const sum = record.g[slug] = record.g[slug] || { o: 0, src: {} };
      sum.o += g.o;
      for (const [source, n] of Object.entries(g.src)) sum.src[source] = (sum.src[source] || 0) + n;
    }
  }
  const totals = {};
  for (const g of Object.values(record.g)) for (const [source, n] of Object.entries(g.src)) totals[source] = (totals[source] || 0) + n;
  assert.deepEqual(totals, { direct: 1, featured: 1, catalog: 1, recent: 1, favorites: 1, category: 1, quick: 1, search: 2, related: 1, surprise: 1, history: 1, reload: 1 });
  assert.equal(record.g['drift-king'].src.direct, 1);
  assert.equal(record.g[featured].src.featured, 1);
  assert.equal(record.g['tunnel-blitz'].src.catalog, 1);
  assert.equal(record.g['maze-dash'].src.recent, 1);
  assert.equal(record.g['pool-party'].src.favorites, 1);
  assert.equal(record.g['moto-madness'].src.category, 1);
  assert.equal(record.g[quick].src.quick, 1);
  assert.ok(record.g[searched].src.search >= 1);
  assert.ok(record.g['snake-arena'].src.search >= 1);
  assert.equal(record.g[related].src.related, 1);
  assert.deepEqual([record.g[surprise].src.history, record.g[surprise].src.reload], [1, 1]);
  assert.ok(record.g[surprise].src.surprise >= 1);
  assert.equal(Object.values(record.g).reduce((n, g) => n + g.o, 0), 13);
});

test('a hidden page writes but keeps its session; otherwise writes wait about a minute', async t => {
  const state = await setup(t);
  const { page, context } = state;
  await page.goto(origin + '/#/play/air-hockey');
  const game = await playing(page, 'air-hockey');
  await post(page, game, stats(10000, [['s', 'L1']], 'L1'));
  await context.clock.runFor(59000);
  assert.equal(await read(page), null, 'a visible page does not write after every message');
  await context.clock.runFor(1000);
  let g = (await read(page)).g['air-hockey'];
  assert.deepEqual([g.o, g.e, g.b], [1, 10000, [0, 0, 0, 0]], 'written within a minute; the session is still open');
  const live = Object.values(await read(page, LIVE));
  assert.deepEqual(live.map(s => [s.g, s.e, s.p]), [['air-hockey', 10000, 'L1']], 'the open session is mirrored');

  await setHidden(page, true);
  await post(page, game, stats(5000, [], 'L1'));
  assert.equal((await read(page)).g['air-hockey'].e, 10000);
  await context.clock.runFor(1000);
  assert.equal((await read(page)).g['air-hockey'].e, 15000, 'a message while hidden is written about 1 s later');
  await post(page, game, stats(2000, [], 'L1'));
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  g = (await read(page)).g['air-hockey'];
  assert.deepEqual([g.e, g.b], [17000, [0, 0, 0, 0]], 'a persisted pagehide only writes');
  assert.equal(Object.keys(await read(page, LIVE)).length, 1);

  await setHidden(page, false);
  await post(page, game, stats(50000, [['w', 'L1', 60000]], ''));
  await leave(state);
  g = (await read(page)).g['air-hockey'];
  assert.deepEqual([g.o, g.e, g.b, g.lv.L1], [1, 67000, [0, 1, 0, 0], [1, 1, 0, 0, 0, 0, 60000, 0, 0, 0, 1, 0]], 'one session from open to close');
  assert.deepEqual(await read(page, LIVE), {});
});

test('load time counts only a session\'s first frame, and only while the page stayed visible', async t => {
  const state = await setup(t, { ready: false });
  const { page, context } = state;
  await page.goto(origin + '/#/play/air-hockey');
  let game = await playing(page, 'air-hockey');
  await context.clock.runFor(1500);
  await post(page, game, { type: 'sg:ready', version: 1 });
  await post(page, game, { type: 'sg:ready', version: 1 });
  await click(page, '#restartBtn');
  game = await playing(page, 'air-hockey');
  await context.clock.runFor(9000);
  await post(page, game, { type: 'sg:ready', version: 1 });
  await go(page, '#/play/maze-dash');
  game = await playing(page, 'maze-dash');
  await setHidden(page, true);
  await setHidden(page, false);
  await post(page, game, { type: 'sg:ready', version: 1 });
  await leave(state);

  const record = await read(page);
  const a = record.g['air-hockey'], b = record.g['maze-dash'];
  assert.deepEqual([a.l, a.lb, a.ls], [[1, 1500, 1500], [0, 1, 0, 0, 0], 0], 'a doubled sg:ready and a restart are not loads');
  assert.deepEqual([b.l, b.lb, b.ls], [[0, 0, 0], [0, 0, 0, 0, 0], 1], 'a load while hidden is skipped');
  assert.deepEqual([a.b, b.b], [[1, 0, 0, 0], [1, 0, 0, 0]]);
});

test('two portal pages add up, and stop and clear from another page take effect at once', async t => {
  const state = await setup(t);
  const { page, context } = state;
  const other = await newPage(state);
  const metaChange = async change => {
    const seen = await page.evaluate(() => window.metaEvents || 0);
    await other.evaluate(change);
    await page.waitForFunction(n => (window.metaEvents || 0) > n, seen);
  };
  await page.goto(origin + '/#/play/air-hockey');
  await other.goto(origin + '/#/play/air-hockey');
  await post(page, await playing(page, 'air-hockey'), stats(10000, [['s', 'L1']], 'L1'));
  await post(other, await playing(other, 'air-hockey'), stats(20000, [['s', 'L1'], ['w', 'L1', 15000]], ''));
  await leave(state);
  await leave(state, other);
  // Read where the last write happened: other pages see it a moment later.
  let g = (await read(other)).g['air-hockey'];
  assert.deepEqual([g.o, g.e, g.b, g.lv.L1], [2, 30000, [2, 0, 0, 0], [2, 1, 0, 0, 0, 1, 15000, 0, 0, 0, 2, 1]]);
  const pc = (await read(page, META)).pc.id;

  await metaChange(() => {
    const meta = JSON.parse(localStorage.getItem('sg:site:statsmeta'));
    localStorage.setItem('sg:site:statsmeta', JSON.stringify({ ...meta, off: true, offSince: Date.now() }));
  });
  assert.equal(await page.isVisible('#statsOff'), false, 'the notice lives in the closed classroom strip');
  await page.evaluate(() => { document.querySelector('#classroom').open = true; });
  assert.equal(await page.locator('#statsOff').innerText(), 'الإحصاءات متوقفة');
  assert.equal(await page.isVisible('#statsOff'), true);
  assert.deepEqual(await page.locator('#statsLink').evaluate(a => [a.getAttribute('href'), a.target, a.rel, a.textContent.trim()]),
    ['teacher.html', '_blank', 'noopener', '📊 إحصاءات هذا الجهاز'], 'the teacher page opens in a new tab');
  await go(page, '#/play/maze-dash');
  await post(page, await playing(page, 'maze-dash'), stats(30000, [['s', 'L1']], 'L1'));
  await leave(state);
  let record = await read(page);
  assert.deepEqual(Object.keys(record.g), ['air-hockey'], 'nothing is recorded while collection is stopped');
  assert.equal(record.g['air-hockey'].o, 2);

  await metaChange(() => {
    const meta = JSON.parse(localStorage.getItem('sg:site:statsmeta'));
    localStorage.setItem('sg:site:statsmeta', JSON.stringify({ ...meta, off: false, pc: { ...meta.pc, label: 'جهاز 7' } }));
  });
  assert.equal(await page.isVisible('#statsOff'), false);
  await go(page, '#/play/pool-party');
  await post(page, await playing(page, 'pool-party'), stats(40000, [['s', 'L1'], ['w', 'L1', 30000]], ''));
  await context.clock.runFor(10);
  // The teacher page's clear: only stats keys, and a clearedAt time.
  await metaChange(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith('sg:site:stats:')) localStorage.removeItem(key);
    const meta = JSON.parse(localStorage.getItem('sg:site:statsmeta'));
    localStorage.setItem('sg:site:statsmeta', JSON.stringify({ ...meta, clearedAt: Date.now() }));
  });
  await leave(state);
  assert.equal(await read(page), null, 'numbers from before the clear do not come back');
  const meta = await read(page, META);
  assert.deepEqual([meta.pc.id, meta.pc.label, meta.off], [pc, 'جهاز 7', false]);

  await go(page, '#/play/maze-dash');
  await post(page, await playing(page, 'maze-dash'), stats(5000));
  await leave(state);
  record = await read(page);
  assert.deepEqual(Object.keys(record.g), ['maze-dash']);
  assert.deepEqual([record.g['maze-dash'].e, record.g['maze-dash'].b], [5000, [1, 0, 0, 0]]);
});

test('blocked storage changes nothing for the child and raises no errors', async t => {
  const state = await setup(t, { storage: false });
  const { page } = state;
  await page.goto(origin + '/#/');
  await click(page, '.catalog-grid .tile[data-slug="air-hockey"]');
  const game = await playing(page, 'air-hockey');
  await post(page, game, stats(45000, [['s', 'L1']], 'L1'));
  await click(page, '#restartBtn');
  await playing(page, 'air-hockey');
  await setHidden(page, true);
  await setHidden(page, false);
  await state.context.clock.runFor(60000);
  await leave(state);
  await page.reload();
  await page.waitForFunction(() => document.body.className === 'route-home');
  assert.equal(await page.evaluate(() => typeof window.SGStats.msg), 'function');
});

test('messages from other windows, and from a removed game after 2 s, are ignored', async t => {
  const state = await setup(t);
  const { page, context } = state;
  await page.goto(origin + '/#/play/air-hockey');
  await post(page, await playing(page, 'air-hockey'), stats(1000, [['s', 'L1']], 'L1'));
  // The portal window itself and a same-origin frame that is not the game.
  await page.evaluate(() => {
    const data = { type: 'sg:stats', version: 1, e: 99000, f: [5, 5, 5, 5], m: 9, r: [['s', 'X1']], o: 'X1' };
    window.postMessage(data, location.origin);
    const helper = document.createElement('iframe');
    helper.srcdoc = '<script>parent.postMessage(' + JSON.stringify(data) + ', "*"); parent.postMessage({ type: "test:ping", n: -1 }, "*")<\/script>';
    document.body.appendChild(helper);
  });
  await page.waitForFunction(() => window.lastPing === -1);
  await page.evaluate(() => { window.oldGame = document.querySelector('#stage iframe').contentWindow; });
  state.ready = false;
  await go(page, '#/play/maze-dash');
  await playing(page, 'maze-dash');
  await page.evaluate(() => { window.unready = document.querySelector('#stage iframe').contentWindow; });
  await go(page, '#/');
  await page.waitForFunction(() => document.body.className === 'route-home');
  // Within 2 s a removed game may still send sg:stats, but never sg:ready.
  await page.evaluate(() => dispatchEvent(new MessageEvent('message', { source: window.unready, origin: location.origin, data: { type: 'sg:ready', version: 1 } })));
  await context.clock.runFor(2001);
  await page.evaluate(() => dispatchEvent(new MessageEvent('message', { source: window.oldGame, origin: location.origin, data: { type: 'sg:stats', version: 1, e: 77000, r: [['s', 'Y1']], o: '' } })));
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));

  const record = await read(page);
  const a = record.g['air-hockey'], b = record.g['maze-dash'];
  assert.deepEqual([a.e, a.f, Object.keys(a.lv), record.s.mute], [1000, [0, 0, 0, 0], ['L1'], 0]);
  assert.deepEqual([b.ns, b.b, b.l], [1, [0, 0, 0, 0], [0, 0, 0]], 'a removed game cannot report readiness');
});

test('a session left open by a crash or power cut is closed on the next load', async t => {
  const first = await setup(t);
  await first.page.goto(origin + '/#/play/air-hockey');
  await post(first.page, await playing(first.page, 'air-hockey'), stats(90000, [['s', 'L5'], ['l', 'L5', 30000], ['s', 'L6']], 'L6'));
  await first.context.clock.runFor(60000);
  const live = await first.page.evaluate(k => localStorage.getItem(k), LIVE);
  const day = await first.page.evaluate(k => localStorage.getItem(k), 'sg:site:stats:d:' + DAY);
  assert.equal(Object.keys(JSON.parse(live)).length, 1);

  // The same PC after a power cut: no pagehide ever ran.
  const second = await setup(t, { time: new Date(+START + 3600e3) });
  await second.page.goto(origin + '/seed.html');
  await second.page.evaluate(([live, day, key]) => { localStorage.setItem('sg:site:stats:live', live); localStorage.setItem(key, day); }, [live, day, 'sg:site:stats:d:' + DAY]);
  await second.page.goto(origin + '/#/');
  const record = await read(second.page);
  checkRecord(record, DAY);
  const g = record.g['air-hockey'];
  assert.deepEqual([g.o, g.e, g.b, g.ns], [1, 90000, [0, 1, 0, 0], 0]);
  assert.deepEqual(g.lv, {
    L5: [1, 0, 1, 0, 0, 0, 30000, 0, 0, 0, 1, 1],
    L6: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1]
  });
  assert.deepEqual(await read(second.page, LIVE), {});
});

test('storage stays bounded: 120 newest days, 300 KB in all, 16 KB a day, one retry when full', async t => {
  const state = await setup(t);
  const { page } = state;
  const dayKeys = () => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sg:site:stats:d:')).sort());
  const play = async (slug, messages) => {
    await go(page, '#/play/' + slug);
    const game = await playing(page, slug);
    for (const message of messages) await post(page, game, message);
    await leave(state);
  };
  await page.goto(origin + '/seed.html');
  await page.evaluate(() => {
    for (let i = 0; i < 125; i++) {
      const d = new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10);
      localStorage.setItem('sg:site:stats:d:' + d, JSON.stringify({ v: 1, d, s: { calm: 0, fs: 0, mute: 0 }, g: {} }));
    }
  });
  await page.goto(origin + '/#/');
  await play('air-hockey', [stats(1000)]);
  let keys = await dayKeys();
  assert.equal(keys.length, 120, 'the newest 120 day records are kept');
  assert.deepEqual([keys[0], keys.at(-1)], ['sg:site:stats:d:2026-06-07', 'sg:site:stats:d:' + DAY]);

  // A full storage: the oldest day goes and the write is tried once more.
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    let full = true;
    Storage.prototype.setItem = function (key, value) {
      if (full && key.startsWith('sg:site:stats:d:')) { full = false; throw new DOMException('Storage is full', 'QuotaExceededError'); }
      return set.call(this, key, value);
    };
  });
  await play('air-hockey', [stats(2000)]);
  keys = await dayKeys();
  assert.deepEqual([keys.length, keys[0]], [119, 'sg:site:stats:d:2026-06-08']);
  assert.equal((await read(page)).g['air-hockey'].e, 3000);

  // Many level ids in one day fold into '_other'; nothing else is lost.
  const ids = [];
  for (const letter of 'abcdefgh') for (let i = 0; i < 80; i++) ids.push(letter + 'x' + i);
  const messages = [];
  for (let i = 0; i < ids.length; i += 100) messages.push(stats(1000, ids.slice(i, i + 100).map(id => ['s', id])));
  await play('maze-dash', messages);
  const record = await read(page);
  checkRecord(record, DAY);
  assert.ok(JSON.stringify(record).length < 16384, 'one day stays under 16 KB');
  const levels = record.g['maze-dash'].lv;
  assert.ok(levels._other && Object.keys(levels).length <= 65);
  assert.equal(Object.values(levels).reduce((n, level) => n + level[0], 0), ids.length, 'every start is still counted');
  assert.equal(Object.values(levels).reduce((n, level) => n + level[10], 0), ids.length);

  // Large old days: all stats keys together stay under 300 KB, oldest first.
  await page.evaluate(() => {
    const filler = 'x'.repeat(15000);
    for (let i = 0; i < 25; i++) {
      const d = new Date(Date.UTC(2026, 5, 20 + i)).toISOString().slice(0, 10);
      localStorage.setItem('sg:site:stats:d:' + d, JSON.stringify({ v: 1, d, s: { calm: 0, fs: 0, mute: 0 }, g: {}, pad: filler }));
    }
  });
  await play('air-hockey', [stats(1000)]);
  const size = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sg:site:stats')).reduce((n, k) => n + k.length + localStorage.getItem(k).length, 0));
  assert.ok(size <= 300 * 1024, 'all stats keys stay under 300 KB: ' + size);
  keys = await dayKeys();
  assert.equal(keys.at(-1), 'sg:site:stats:d:' + DAY);
  assert.ok(keys[0] > 'sg:site:stats:d:2026-06-20', 'the oldest days went first: ' + keys[0]);
});

test('numbers are filed under the local date and hour they were recorded, with settings and hearts', async t => {
  const state = await setup(t, { time: new Date('2026-10-08T23:58:00+03:00') });
  const { page, context } = state;
  await page.goto(origin + '/#/play/air-hockey');
  const game = await playing(page, 'air-hockey');
  await page.evaluate(() => { document.querySelector('#classroom').open = true; });
  await click(page, '#classroomMode');
  await click(page, '#classroomMode');
  await page.locator('#fsBtn').click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.evaluate(() => document.exitFullscreen());
  await click(page, '#favBtn');
  await post(page, game, stats(30000, [['s', 'L1']], 'L1', { m: 1 }));
  await context.clock.runFor(120000);
  await post(page, game, stats(20000, [['w', 'L1', 50000]], '', { m: 1 }));
  await leave(state);

  const first = await read(page), second = await read(page, 'sg:site:stats:d:2026-10-09');
  checkRecord(first, DAY);
  checkRecord(second, '2026-10-09');
  assert.deepEqual(first.s, { calm: 1, fs: 1, mute: 1 });
  assert.deepEqual(second.s, { calm: 0, fs: 0, mute: 1 });
  const a = first.g['air-hockey'], b = second.g['air-hockey'];
  assert.deepEqual([a.o, a.e, a.hh, a.b, a.fav], [1, 30000, { 23: 30000 }, [1, 0, 0, 0], 1], 'the session length goes to the day it opened');
  assert.deepEqual([b.o, b.e, b.hh, b.b, b.fav], [0, 20000, { 0: 20000 }, [0, 0, 0, 0], 1]);
  assert.deepEqual([a.lv.L1, b.lv.L1], [[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], [0, 1, 0, 0, 0, 0, 50000, 0, 0, 0, 0, 0]]);
});
