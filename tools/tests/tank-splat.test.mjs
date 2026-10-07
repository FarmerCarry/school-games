import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

// Paint Tanks (tank-splat): saving, beginner help, reduced motion, floor art and paused redraws.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

// The test drives update/render itself, so frames and saves are deterministic.
async function game(t, entries = {}) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(entries => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem('sg:tank-splat:' + key, JSON.stringify(value));
    let kit, update, render;
    const runtime = window.runtime = { failKeys: [], layerDraws: 0, texts: [], dashes: 0 };
    runtime.step = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) update(1 / 60); };
    runtime.draw = count => { for (let i = 0; i < count; i++) render(0); };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (runtime.failKeys.includes(key)) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
    const proto = CanvasRenderingContext2D.prototype, drawImage = proto.drawImage, fillText = proto.fillText, setLineDash = proto.setLineDash;
    proto.drawImage = function (img) {
      if (this.canvas.id === 'cv' && img instanceof HTMLCanvasElement) runtime.layerDraws++;
      return drawImage.apply(this, arguments);
    };
    proto.fillText = function (text) {
      if (this.canvas.id === 'cv') runtime.texts.push(text);
      return fillText.apply(this, arguments);
    };
    proto.setLineDash = function (dash) {
      if (this.canvas.id === 'cv' && dash.length) runtime.dashes++;
      return setLineDash.apply(this, arguments);
    };
  }, entries);
  await page.goto(`${server.origin}/games/tank-splat/`);
  await page.waitForFunction(() => window.__game && window.runtime);
  return page;
}

// Start a campaign stage whose computer tanks never shoot, and run the countdown.
async function startQuietStage(page, stage) {
  await page.evaluate(stage => {
    __game.start(stage);
    __game.app.game.tanks.forEach(t => { if (t.bot) t.bot.p = Object.assign({}, t.bot.p, { maxBalls: 0 }); });
    runtime.step(3);
  }, stage);
  assert.equal(await page.evaluate(() => __game.app.game.state), 'play');
}

const stored = (page, key) => page.evaluate(key => Kit.store('tank-splat').get(key, null), key);
const saveState = page => page.evaluate(() => {
  const panel = document.querySelector('.sg-save-status');
  return panel && !panel.hidden ? panel.getAttribute('data-state') : 'hidden';
});

test('a failed purchase save warns, keeps the old coins and saves everything on retry', async t => {
  const page = await game(t, { coins: 100 });
  await page.evaluate(() => __game.show('shop'));
  await page.evaluate(() => { runtime.failKeys = ['sg:tank-splat:hats']; });
  await page.locator('#items .item').nth(1).click(); // party hat, 30 coins
  assert.equal(await saveState(page), 'failed');
  assert.equal(await stored(page, 'coins'), 100, 'coins must not be saved without the item');
  assert.equal(await stored(page, 'hats'), null);
  assert.deepEqual(await page.evaluate(() => [__game.save.coins, __game.save.hats]), [70, [0, 1]]);

  await page.evaluate(() => { runtime.failKeys = []; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await saveState(page), 'saved');
  assert.equal(await stored(page, 'coins'), 70);
  assert.deepEqual(await stored(page, 'hats'), [0, 1]);
  assert.equal((await stored(page, 'equip'))[0].hat, 1);
});

test('the first two stages show an aim guide and explain a self-splat', async t => {
  const page = await game(t);
  await startQuietStage(page, 0);
  assert.equal(await page.evaluate(() => __game.app.game.guide), true);
  assert.ok(await page.evaluate(() => { runtime.dashes = 0; runtime.draw(1); return runtime.dashes; }) > 0, 'guide line drawn');

  // The player's own ball comes back at them.
  await page.evaluate(() => {
    const g = __game.app.game, t = g.tanks[0], c = Math.cos(t.a), s = Math.sin(t.a);
    g.balls.push({ x: t.x + 60 * c, y: t.y + 60 * s, vx: -330 * c, vy: -330 * s, r: 7, owner: t, life: 5, age: 1,
      bounces: 1, maxB: 6, safe: false, dist: 200, color: t.pal.paint, sq: 0, sqA: 0, giant: false });
    t.active++;
    runtime.step(0.3);
  });
  assert.deepEqual(await page.evaluate(() => [__game.app.game.selfOut, __game.app.game.pops.some(p => p.text === 'كرتك ارتدّت عليك!')]), [true, true]);
  await page.evaluate(() => runtime.step(2));
  assert.equal(await page.evaluate(() => __game.app.game.state), 'roundEnd');
  assert.ok(await page.evaluate(() => { runtime.texts.length = 0; runtime.draw(1); return runtime.texts.includes('انتبه: كراتك ترتدّ وتلطّخك!'); }));
  await page.evaluate(() => runtime.step(2.5));
  assert.deepEqual(await page.evaluate(() => [__game.app.game.round, __game.app.game.selfOut]), [2, false]);

  await startQuietStage(page, 2);
  assert.equal(await page.evaluate(() => __game.app.game.guide), false);
  assert.equal(await page.evaluate(() => { runtime.dashes = 0; runtime.draw(1); return runtime.dashes; }), 0, 'no guide from stage 3');
  assert.equal(await page.evaluate(() => { __game.startFree(1, 1); return __game.app.game.guide; }), false);
});

test('reduced motion stops the screen shake', async t => {
  const page = await game(t);
  await page.evaluate(() => Kit.motion.setPreference('reduce'));
  await startQuietStage(page, 2);
  assert.deepEqual(await page.evaluate(() => {
    const g = __game.app.game; g.shakeP = 13; runtime.step(0.05); return [g.shakeP, g.shx, g.shy];
  }), [0, 0, 0]);
  assert.ok(await page.evaluate(() => {
    Kit.motion.setPreference('full');
    const g = __game.app.game; g.shakeP = 13; runtime.step(1 / 60); return g.shakeP;
  }) > 0, 'shake returns with full motion');
});

test('floor decorations are themed and identical when redrawn', async t => {
  const page = await game(t);
  const result = await page.evaluate(() => {
    const m = TS_MAZE.generate(10, 6, 80, 40, 90, 0.3);
    const rng = seed => () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const draw = (theme, seed) => {
      const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
      TS_ART.drawFloor(cv.getContext('2d'), m, theme, rng(seed));
      return cv.toDataURL();
    };
    return TS_ART.THEMES.map(th => {
      const a = draw(th, 7);
      return { deco: th.deco, same: a === draw(th, 7), decorated: a !== draw(Object.assign({}, th, { deco: null }), 7) };
    }).concat({ seed: typeof m.seed });
  });
  assert.deepEqual(result.pop(), { seed: 'number' });
  for (const r of result) assert.deepEqual([r.same, r.decorated], [true, true], `theme ${r.deco}`);
  assert.equal(new Set(result.map(r => r.deco)).size, result.length, 'each theme has its own decorations');
});

test('a paused match keeps its last frame until something changes', async t => {
  const page = await game(t);
  await startQuietStage(page, 0);
  const draws = frames => page.evaluate(frames => { runtime.layerDraws = 0; runtime.draw(frames); return runtime.layerDraws; }, frames);
  assert.equal(await draws(2), 6, 'three cached layers per playing frame');
  await page.locator('#pauseBtn').click();
  assert.equal(await page.evaluate(() => __game.app.screen), 'pause');
  assert.equal(await draws(1), 3, 'one frame when pausing');
  assert.equal(await draws(10), 0, 'paused frames are skipped');
  await page.evaluate(() => { runtime.resized = new Promise(resolve => addEventListener('resize', resolve, { once: true })); });
  await page.setViewportSize({ width: 800, height: 450 });
  await page.evaluate(() => runtime.resized);
  assert.equal(await draws(3), 3, 'redrawn once after a resize');
  await page.evaluate(() => document.getElementById('cv').dispatchEvent(new Event('contextrestored')));
  assert.equal(await draws(3), 3, 'redrawn once after the canvas is restored');
  await page.locator('#scr-pause [data-act="resume"]').click();
  assert.equal(await draws(2), 6, 'every frame again after resuming');
});
