import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const KEY = 'sg:moto-madness:save';
let browser, server, origin;

before(async () => {
  server = await startTestServer(root);
  origin = server.origin;
  browser = await launchChromium();
});
after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

// Opens Moto Madness with the frame loop under test control: __game.step(n) advances it,
// and __loop.update / __loop.render run one frame of the real loop.
async function game(t, initialSave) {
  const context = await browser.newContext(), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(([key, value]) => {
    if (value && !sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); }
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(v) {
      kit = v;
      kit.loop = (update, render) => { window.__loop = { update, render }; return { stop() {} }; };
    } });
  }, [KEY, initialSave ? JSON.stringify(initialSave) : null]);
  await page.goto(`${origin}/games/moto-madness/`);
  await page.waitForFunction(() => window.__game && __game.state === 'title');
  return page;
}

// Puts the rider just before the line and steps until the run is over.
async function crossLine(page, flips = 0) {
  await page.evaluate(n => {
    __game.world.flips = n;
    __game.finish();
    for (let i = 0; i < 120 && !__game.world.finished; i++) __game.step(1, { gas: true });
  }, flips);
  assert.equal(await page.evaluate(() => __game.world.finished), true);
}

test('Moto Madness saves a finished run at the line, even when R restarts before the results', async t => {
  const page = await game(t);
  await page.evaluate(() => __game.start(0));
  await crossLine(page, 2);
  await page.keyboard.press('KeyR');
  const kept = await page.evaluate(key => ({
    state: __game.state, started: __game.world.started, stars: __game.save.stars[0], best: __game.save.best[0],
    flips: __game.save.flips, stored: JSON.parse(localStorage.getItem(key)), ghost: localStorage.getItem('sg:moto-madness:ghost0'),
    racing: JSON.stringify(__game.ghost)
  }), KEY);
  assert.equal(kept.state, 'play');
  assert.equal(kept.started, false, 'R starts a fresh run');
  assert.ok(kept.stars > 0 && kept.best > 0, 'stars and best time are kept');
  assert.equal(kept.flips, 2);
  assert.deepEqual([kept.stored.stars[0], kept.stored.best[0], kept.stored.flips], [kept.stars, kept.best, 2]);
  assert.ok(kept.ghost, 'the new best run is saved as the ghost');
  assert.equal(kept.racing, JSON.stringify(JSON.parse(kept.ghost).d), 'the restarted run races the new best');

  // the results panel after a normal finish shows the run without counting its flips twice
  await crossLine(page);
  await page.evaluate(() => __game.step(120));
  assert.equal(await page.evaluate(() => __game.state), 'complete');
  assert.equal(await page.evaluate(() => __game.save.flips), 2);
  assert.equal(await page.locator('#complete').isVisible(), true);
});

test('Moto Madness shows a retry warning when progress cannot be saved, and keeps the stars', async t => {
  const page = await game(t);
  await page.evaluate(key => {
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new DOMException('full', 'QuotaExceededError');
      return window.realSetItem.call(this, k, v);
    };
    __game.start(0);
  }, KEY);
  await crossLine(page);
  await page.evaluate(() => __game.step(120));
  assert.equal(await page.evaluate(() => __game.state), 'complete');
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), null);
  const stars = await page.evaluate(() => __game.save.stars[0]);
  assert.ok(stars > 0, 'the stars stay earned while saving fails');
  await page.evaluate(() => { Storage.prototype.setItem = window.realSetItem; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').isVisible(), true);
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).stars[0], KEY), stars);
});

test('Moto Madness only offers a ghost race when the ghost could be saved', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    localStorage.setItem('sg:moto-madness:ghost0', JSON.stringify({ d: [150, -44, 0, 160, -44, 0] })); // an older run
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'sg:moto-madness:ghost0') throw new DOMException('full', 'QuotaExceededError');
      return window.realSetItem.call(this, k, v);
    };
    __game.start(0);
  });
  assert.ok(await page.evaluate(() => __game.ghost), 'the older ghost is raced first');
  await crossLine(page);
  await page.evaluate(() => __game.step(120));
  assert.equal(await page.evaluate(() => __game.state), 'complete');
  assert.doesNotMatch(await page.locator('#cBest').textContent(), /👻/);
  const after = await page.evaluate(key => ({
    ghost: __game.ghost, stored: localStorage.getItem('sg:moto-madness:ghost0'), stars: JSON.parse(localStorage.getItem(key)).stars[0]
  }), KEY);
  assert.deepEqual([after.ghost, after.stored], [null, null], 'the older, slower ghost is dropped');
  assert.ok(after.stars > 0, 'progress is still saved');
});

test('Moto Madness keeps its paused frame and repaints it only when needed', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    let paints = 0;
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'game' && x === 0 && y === 0 && w === 1280 && h === 720) paints++; // the sky
      return fill.apply(this, arguments);
    };
    window.frames = n => { paints = 0; for (let i = 0; i < n; i++) { __loop.update(1 / 60); __loop.render(0); } return paints; };
    __game.start(0);
  });
  assert.equal(await page.evaluate(() => frames(3)), 3, 'a running game paints every frame');
  await page.keyboard.press('KeyP');
  assert.equal(await page.evaluate(() => __game.state), 'paused');
  assert.equal(await page.evaluate(() => frames(20)), 1, 'pausing paints the scene once, then keeps it');
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.evaluate(() => frames(5)), 1, 'a resize repaints the paused scene once');
  // A GPU reset wipes the canvas and its scale; the cached backdrop canvases are painted again.
  const reset = await page.evaluate(() => {
    const canvas = document.getElementById('game'), ctx = canvas.getContext('2d'), scale = ctx.getTransform().a;
    let made = 0;
    const create = document.createElement.bind(document);
    document.createElement = (name, opts) => { if (String(name).toLowerCase() === 'canvas') made++; return create(name, opts); };
    canvas.width = canvas.width;
    canvas.dispatchEvent(new Event('contextrestored'));
    return { paints: frames(5), made, scale, after: ctx.getTransform().a };
  });
  assert.equal(reset.paints, 1, 'a restored canvas repaints the paused scene once');
  assert.ok(reset.made > 0, 'the backdrop layers are painted again');
  assert.equal(reset.after, reset.scale, 'the canvas scale is restored');
  await page.keyboard.press('KeyP');
  assert.equal(await page.evaluate(() => __game.state), 'play');
  assert.equal(await page.evaluate(() => frames(3)), 3, 'a resumed game paints every frame');
});

test('Moto Madness leaves out the finish confetti with reduced motion', async t => {
  const page = await game(t);
  // each confetti piece is drawn rotated; the bike adds only a few rotations
  const rotations = () => page.evaluate(() => {
    let n = 0;
    const rotate = CanvasRenderingContext2D.prototype.rotate;
    CanvasRenderingContext2D.prototype.rotate = function () { if (this.canvas.id === 'game') n++; return rotate.apply(this, arguments); };
    __game.start(0);
    __game.finish();
    for (let i = 0; i < 120 && !__game.world.finished; i++) __game.step(1, { gas: true });
    __game.step(3);
    n = 0; __loop.render(0);
    CanvasRenderingContext2D.prototype.rotate = rotate;
    return n;
  });
  assert.ok(await rotations() > 50, 'confetti flies at the finish');
  await page.evaluate(() => Kit.motion.setPreference('reduce'));
  assert.ok(await rotations() < 20, 'no confetti with reduced motion');
});

test('Moto Madness opens the garage with a corrupt saved paint or suit', async t => {
  const page = await game(t, { stars: [3], best: [20], paint: 99, suit: -2, flips: 1 });
  await page.keyboard.press('KeyG');
  assert.equal(await page.evaluate(() => __game.state), 'garage');
  assert.equal(await page.locator('#garage').isVisible(), true);
  assert.equal(await page.locator('#paintName').textContent(), 'الصاروخ الأحمر');
  assert.equal(await page.locator('#suitName').textContent(), 'الكلاسيكية');
});

test('Moto Madness reuses the backdrop between levels of the same world', async t => {
  const page = await game(t);
  const made = await page.evaluate(() => {
    let canvases = 0;
    const create = document.createElement.bind(document);
    document.createElement = (name, opts) => { if (String(name).toLowerCase() === 'canvas') canvases++; return create(name, opts); };
    const count = fn => { canvases = 0; fn(); return canvases; };
    return { first: count(() => __game.start(0)), same: count(() => __game.start(1)), desert: count(() => __game.start(5)), retry: count(() => __game.start(5)) };
  });
  assert.equal(made.same, 0, 'the next grass level keeps the grass backdrop');
  assert.equal(made.retry, 0, 'retrying keeps the backdrop');
  assert.ok(made.desert > 0, 'a new world draws its own backdrop');
});
