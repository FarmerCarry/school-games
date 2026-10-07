import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let server, browser, origin;

before(async () => {
  server = await startTestServer(root);
  origin = server.origin;
  browser = await launchChromium();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function gamePage(t) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught browser errors'));
  await page.goto(`${origin}/games/fire-and-ice/`);
  await page.waitForFunction(() => window.__game && window.Kit);
  return page;
}

// __game.bench(n) runs n fixed 1/60 s update+render steps, so these checks do not
// depend on the headless frame rate.

test('Fire & Ice button glow reuses one sprite per colour while a button eases', async t => {
  const page = await gamePage(t);
  const made = await page.evaluate(() => {
    __game.load(3);
    __game.bench(5);
    let canvases = 0;
    const create = document.createElement;
    document.createElement = function (tag) {
      if (String(tag).toLowerCase() === 'canvas') canvases++;
      return create.apply(document, arguments);
    };
    const w = __game.world, b = w.buttons.find(q => q.ch === 'a');
    for (let i = 0; i < 5; i++) {
      w.fire.x = b.x + 16 - w.fire.w / 2; w.fire.vx = 0; __game.bench(30);
      w.fire.x -= 90; __game.bench(30);
    }
    document.createElement = create;
    return canvases;
  });
  assert.ok(made <= 1, `5 presses created ${made} glow canvases`);
});

test('Fire & Ice drops the win panel star chimes when the next level starts', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    __game.load(1); __game.win(); __game.bench(60);
    window.__chimes = 0;
    ['star', 'win'].forEach(k => {
      const f = __game.sfx[k];
      __game.sfx[k] = function () { window.__chimes++; return f.apply(this, arguments); };
    });
  });
  assert.equal(await page.evaluate(() => document.getElementById('winScreen').hidden), false);
  await page.evaluate(() => document.getElementById('winNext').click());
  await page.waitForTimeout(1400);
  assert.deepEqual(await page.evaluate(() => [__game.world.index, window.__chimes]), [1, 0]);
});

test('Fire & Ice warns when saving fails and clears the warning after Retry', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    window.__setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new Error('full'); };
    __game.load(1); __game.win(); __game.bench(60);
  });
  const panel = page.locator('.sg-save-status');
  assert.equal(await panel.getAttribute('data-state'), 'failed');
  assert.equal(await panel.isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
  await panel.locator('button').click();
  assert.equal(await panel.getAttribute('data-state'), 'saved');
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:fire-and-ice:unlocked')), '2');
});

test('Fire & Ice reduced motion removes ambient embers and confetti', async t => {
  const page = await gamePage(t);
  const counts = await page.evaluate(() => {
    const run = () => {
      __game.load(1); __game.bench(60);
      const idle = __game.particles();
      __game.win(); __game.bench(1);
      return [idle, __game.particles()];
    };
    Kit.motion.setPreference('reduce');
    const calm = run();
    Kit.motion.setPreference('full');
    return { calm, full: run() };
  });
  assert.deepEqual(counts.calm, [0, 0]);
  assert.ok(counts.full[0] > 0 && counts.full[1] >= 60, `full effects: ${counts.full}`);
});

const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
// Waits for n real animation frames, so Kit.loop has had n chances to update and render.
const frames = (page, n) => page.evaluate(n => new Promise(done => {
  let k = 0; const f = () => (++k >= n ? done() : requestAnimationFrame(f)); requestAnimationFrame(f);
}), n);

test('Fire & Ice solo hint stays under the top bar and only shows on a level\'s first start', async t => {
  const page = await gamePage(t);
  const r = await page.evaluate(() => {
    const ctx = document.getElementById('game').getContext('2d'), fillText = ctx.fillText, ys = [];
    ctx.fillText = function (s, x, y) { if (String(s).includes('للتبديل')) ys.push(y); return fillText.apply(this, arguments); };
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, cancelable: true }));
    document.activeElement?.blur();
    __game.solo(true); __game.load(1); __game.bench(6);
    const first = __game.soloHint;
    key('keydown', 'ArrowRight'); __game.bench(40); key('keyup', 'ArrowRight');
    const afterMove = __game.soloHint;
    __game.load(1); __game.bench(2);
    const afterRestart = __game.soloHint;
    key('keydown', 'Tab'); __game.bench(1); key('keyup', 'Tab'); __game.bench(1);
    const afterSwap = __game.soloHint;
    __game.load(2);
    const nextLevel = __game.soloHint;
    ctx.fillText = fillText;
    return { first, afterMove, afterRestart, afterSwap, nextLevel, ys };
  });
  assert.ok(r.first > 2.5, `hint shows on the first start: ${r.first}`);
  assert.ok(r.ys.length > 0 && r.ys.every(y => y < 120), `hint drawn under the top bar, not on the hazard row: ${r.ys}`);
  assert.ok(r.afterMove <= 0, `hint fades once the active hero moves: ${r.afterMove}`);
  assert.equal(r.afterRestart, 0, 'a restart does not bring the hint back');
  assert.equal(r.afterSwap, 0, 'a swap does not bring the hint back');
  assert.ok(r.nextLevel > 2.5, 'a new level explains Tab once');
});

test('Fire & Ice keeps a failed-save warning off the level, the win panel and the map buttons', async t => {
  const page = await gamePage(t);
  const panel = page.locator('.sg-save-status');
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new Error('blocked'); }; __game.solo(true); });
  assert.equal(await panel.isVisible(), true, 'the title shows the failed save');
  await page.evaluate(() => { __game.load(1); __game.bench(2); });
  assert.equal(await panel.isVisible(), false, 'hidden while the level is played');
  await page.locator('#pauseBtn').click();
  assert.equal(await panel.isVisible(), true, 'the pause panel shows it again');
  await page.locator('#resumeBtn').click();
  assert.equal(await panel.isVisible(), false, 'hidden again after resuming');
  await page.evaluate(() => { __game.win(); __game.bench(60); });
  assert.equal(await panel.isVisible(), true, 'the win panel shows it');
  const box = await panel.boundingBox();
  for (const sel of ['#winScreen .sg-panel', '#pauseBtn', '.sg-mute']) {
    assert.ok(!overlap(box, await page.locator(sel).boundingBox()), `save warning clear of ${sel}`);
  }
  await page.evaluate(() => document.getElementById('winNext').click());
  assert.equal(await panel.isVisible(), false, 'hidden in the next level');
  await page.evaluate(() => { document.getElementById('pauseBtn').click(); document.getElementById('pauseMapBtn').click(); });
  assert.equal(await page.evaluate(() => __game.mode), 'map');
  assert.equal(await panel.isVisible(), true, 'the map shows it');
  const map = await page.locator('#game').boundingBox(), mapBox = await panel.boundingBox(), s = map.width / 1280;
  // map canvas buttons and the star counter, in 1280x720 game units
  for (const [name, x, y, w, h] of [['star counter', 30, 26, 170, 42], ['play', 540, 648, 200, 54], ['back', 1100, 648, 150, 50],
    ['hat left', 30, 650, 44, 46], ['hat right', 250, 650, 44, 46]]) {
    assert.ok(!overlap(mapBox, { x: map.x + x * s, y: map.y + y * s, width: w * s, height: h * s }), `save warning clear of the map ${name}`);
  }
});

test('Fire & Ice draws a paused level once and redraws it only after a resize', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => { __game.load(1); __game.bench(10); });
  await page.locator('#pauseBtn').click();
  assert.equal(await page.evaluate(() => __game.mode), 'paused');
  await page.evaluate(() => {
    const ctx = document.getElementById('game').getContext('2d'), fillRect = ctx.fillRect;
    window.__draws = 0;
    ctx.fillRect = function () { window.__draws++; return fillRect.apply(this, arguments); };
  });
  await frames(page, 3);
  const before = await page.evaluate(() => { window.__draws = 0; return __game.particles(); });
  await frames(page, 30);
  assert.deepEqual(await page.evaluate(() => [window.__draws, __game.particles()]), [0, before], 'a paused level is neither redrawn nor animated');
  await page.setViewportSize({ width: 900, height: 520 });
  await page.waitForFunction(() => window.__draws > 0, null, { timeout: 10000 });
  await frames(page, 3);
  await page.evaluate(() => { window.__draws = 0; });
  await frames(page, 30);
  assert.equal(await page.evaluate(() => window.__draws), 0, 'one redraw after the resize, then idle again');
  await page.locator('#resumeBtn').click();
  await page.waitForFunction(() => window.__draws > 0, null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => __game.mode), 'play');
});

test('Fire & Ice glow sprites stop allocating canvases past the colour cap', async t => {
  const page = await gamePage(t);
  const made = await page.evaluate(() => {
    for (let i = 0; i < 40; i++) FI.R.glow('rgba(1,2,' + i + ',0.5)');
    let canvases = 0;
    const create = document.createElement;
    document.createElement = function (tag) {
      if (String(tag).toLowerCase() === 'canvas') canvases++;
      return create.apply(document, arguments);
    };
    for (let i = 0; i < 100; i++) FI.R.glow('rgba(3,4,' + i + ',0.5)');
    document.createElement = create;
    return canvases;
  });
  assert.equal(made, 0, `uncached glow colours created ${made} canvases`);
});
