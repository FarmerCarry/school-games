// Every catalog game reports its play to the portal's anonymous statistics sender
// (docs/TELEMETRY.md): each game is opened in the real portal with the sender on (a
// stand-in server at https://ingest.test answers), played briefly through its own
// gameplay scenario (tools/game-scenarios.mjs) inside the game frame, and left. Its visit
// (go, ld, gx) and at least one round start must reach the server, checked field by
// field, with nothing about any child. Without an address the same play sends nothing.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { prepareScenario, runScenario } from '../game-scenarios.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const catalog = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(repo, 'js/catalog.js'), 'utf8'), catalog);
const slugs = catalog.window.GAMES.filter(game => !game.hidden).map(game => game.slug);
const INGEST = 'https://ingest.test/v1/batch';
const ARITY = { ss: 2, go: 7, ld: 5, er: 5, rs: 8, re: 14, gp: 5, gx: 7, tu: 5, fv: 5, se: 4 };
const ID = /^(?!.*\d{3})[A-Za-z][\w:.-]{0,23}$/;
let browser, server;

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});
after(async () => { await browser?.close(); await server?.close(); });

// The game frame as a scenario's page: evaluate, locator and waitForFunction run in the
// frame; the keyboard is the page's (the portal gives the frame the focus); the mouse
// maps a 1280×720 game viewport onto the frame's box.
function inFrame(page, frame, box) {
  const at = (x, y) => [box.x + x * box.width / 1280, box.y + y * box.height / 720];
  const mouse = {
    move: (x, y, o) => page.mouse.move(...at(x, y), o),
    click: (x, y, o) => page.mouse.click(...at(x, y), o),
    down: o => page.mouse.down(o), up: o => page.mouse.up(o), wheel: (dx, dy) => page.mouse.wheel(dx, dy)
  };
  return new Proxy(frame, {
    get(target, prop) {
      if (prop === 'keyboard') return page.keyboard;
      if (prop === 'mouse') return mouse;
      if (prop === 'waitForTimeout') return ms => page.waitForTimeout(ms);
      if (prop === 'page') return () => page;
      if (prop === 'addInitScript') return script => page.addInitScript(script);
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

async function session(t, telemetry) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const state = { posts: [], errors: [], requests: [] };
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === 'https://ingest.test') return;
    if (request.method() !== 'GET' || /^(fetch|xhr|websocket|eventsource|ping)$/.test(request.resourceType()) ||
      (/^https?:$/.test(url.protocol) && url.origin !== server.origin)) state.requests.push(request.method() + ' ' + request.url());
  });
  await context.route('https://ingest.test/**', async route => {
    state.posts.push(JSON.parse(route.request().postData()));
    await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': server.origin } });
  });
  await context.addInitScript(config => {
    Object.defineProperty(window, 'SG_TELEMETRY', { value: config || undefined, writable: false });
    addEventListener('message', e => { if (e.data && e.data.type === 'sg:telemetry') window.telemetryMessages = (window.telemetryMessages || 0) + 1; });
  }, telemetry);
  state.page = await context.newPage();
  state.page.on('pageerror', error => state.errors.push(error.message));
  return state;
}
const events = state => state.posts.flatMap(b => b.ev);
async function until(check, label, ms = 15000) {
  for (const end = Date.now() + ms; !check();) {
    if (Date.now() > end) throw new Error('timed out waiting for ' + label);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
// Opens the game in the portal, plays it briefly and leaves it. Returns what went wrong
// in the scenario itself (its input checks are not this test's business).
async function playIn(state, slug) {
  const { page } = state;
  await prepareScenario(page, slug);
  await page.evaluate(slug => { location.hash = '#/play/' + slug; }, slug);
  await page.waitForFunction(() => document.querySelector('#stage')?.getAttribute('aria-busy') === 'false' && document.querySelector('#stageMsg').hidden, null, { timeout: 30000 });
  const element = await page.waitForSelector('#stage iframe');
  const frame = await element.contentFrame(), box = await element.boundingBox();
  let problem = '';
  try { await runScenario(inFrame(page, frame, box), slug, { mode: 'performance' }); } catch (error) { problem = String(error.message).split('\n')[0]; }
  await page.waitForTimeout(400);
  await page.locator('#logo').click();
  await page.waitForFunction(() => document.body.className === 'route-home');
  return problem;
}

test('every catalog game reports its visit and its rounds to the statistics sender', { timeout: 30 * 60 * 1000 }, async t => {
  assert.equal(slugs.length, 44);
  const state = await session(t, { url: INGEST, allowLocal: true }), { page } = state;
  await page.goto(server.origin + '/');
  const report = {}, missing = [];
  for (const slug of slugs) {
    const problem = await playIn(state, slug);
    try { await until(() => events(state).some(ev => ev[0] === 'gx' && ev[3] === slug), slug + ' closing'); } catch (error) { missing.push(slug + ': no gx'); }
    const mine = events(state).filter(ev => (ev[0] === 'rs' || ev[0] === 're' ? ev[4] : ev[3]) === slug);
    const rounds = mine.filter(ev => ev[0] === 'rs');
    report[slug] = { rounds: rounds.map(ev => ev[5]), ends: mine.filter(ev => ev[0] === 're').map(ev => ev[5] + ':' + ev[6]), problem };
    if (!mine.some(ev => ev[0] === 'go')) missing.push(slug + ': no go');
    if (!rounds.length) missing.push(slug + ': no round start' + (problem ? ' (' + problem + ')' : ''));
  }
  t.diagnostic(JSON.stringify(report));
  assert.deepEqual(missing, [], JSON.stringify(report, null, 1));
  // Field by field: the wire this build sends, and nothing about any child.
  for (const b of state.posts) {
    assert.deepEqual(Object.keys(b), ['v', 'b', 's', 'k', 'm', 'd', 'p', 'z', 'ev', 'w']);
    for (const ev of b.ev) {
      assert.equal(ev.length, ARITY[ev[0]], JSON.stringify(ev));
      if (ev[0] === 'rs') assert.match(ev[5], ID);
      if (ev[0] === 're') { assert.match(ev[6], ID); assert.match(ev[5], /^[wldeq]$/); assert.ok(ev[13] === null || ev[13].length === 7); }
    }
  }
  assert.equal(new Set(state.posts.map(b => b.s)).size, 1, 'one session for the whole page');
  assert.deepEqual(state.requests, [], 'nothing else goes over the network');
});

test('without an address the same play sends nothing and no game posts statistics', async t => {
  const state = await session(t, null), { page } = state;
  await page.goto(server.origin + '/');
  assert.equal(await page.evaluate(() => SGTelemetry.active()), false);
  for (const slug of ['bubble-bop', 'tic-tac-toe', 'road-hopper', 'key-runner', 'math-gates']) await playIn(state, slug);
  await page.goto(server.origin + '/favicon.svg');
  await page.waitForTimeout(500);
  assert.deepEqual(state.posts, []);
  assert.deepEqual(state.requests, [], 'no network requests');
});
