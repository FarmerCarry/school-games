import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { clickControl } from '../ui-input.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
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

async function game(t) {
  const context = await browser.newContext(), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        window.stepGame = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        // Full frames, counting kitchen paints (the wall cache is blitted once per scene render).
        window.playFrames = (n = 1) => { window.scenePaints = 0; for (let i = 0; i < n; i++) { update(1 / 60); render(0); } return window.scenePaints; };
        return { stop() {} };
      };
    } });
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function () {
      if (this.canvas.id === 'bg') window.scenePaints = (window.scenePaints || 0) + 1;
      return drawImage.apply(this, arguments);
    };
  });
  await page.goto(`${origin}/games/pizza-clicker/`);
  await clickControl(page, '#bPlay');
  return page;
}

test('denied saves retain earned pizza and purchases, block leaving, and recover on retry', async t => {
  const page = await game(t);
  const previous = await page.evaluate(() => localStorage.getItem('sg:pizza-clicker:save'));
  await page.evaluate(() => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'sg:pizza-clicker:save') throw new DOMException('blocked', 'SecurityError');
      return window.restoreStorage.call(this, key, value);
    };
    __game.add(1000); __game.buy(0); __game.save();
  });
  const earned = await page.evaluate(() => ({ pizzas: __game.S.pizzas, owned: __game.S.owned.slice() }));
  assert.equal(earned.owned[0], 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:pizza-clicker:save')), previous);
  await page.locator('#bPause').click();
  await page.locator('#bMenu').click();
  assert.equal(await page.evaluate(() => __game.mode), 'pause');
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').count(), 0);
  await page.locator('#bMenu').click();
  assert.equal(await page.evaluate(() => __game.mode), 'title');
  await page.reload();
  assert.deepEqual(await page.evaluate(() => ({ pizzas: __game.S.pizzas, owned: __game.S.owned })), earned);
});

test('focus-loss pause preserves idle credit once and menu return cannot count it twice', async t => {
  const page = await game(t);
  const before = await page.evaluate(() => {
    let clock = Date.now(); Date.now = () => clock;
    window.advanceAway = seconds => { clock += seconds * 1000; };
    __game.add(1000); __game.buy(0);
    window.dispatchEvent(new Event('blur'));
    return { pizzas: __game.S.pizzas, playTime: __game.S.playTime };
  });
  assert.equal(await page.evaluate(() => __game.mode), 'pause');
  await page.evaluate(() => { stepGame(120); advanceAway(60); });
  assert.deepEqual(await page.evaluate(() => ({ pizzas: __game.S.pizzas, playTime: __game.S.playTime })), before);
  await page.locator('#bResume').click();
  const collected = await page.evaluate(() => __game.S.pizzas);
  assert.ok(collected > before.pizzas);
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); advanceAway(60); });
  await page.locator('#bMenu').click();
  const fromMenu = await page.evaluate(() => __game.S.pizzas);
  assert.ok(fromMenu > collected);
  await clickControl(page, '#bPlay');
  await page.evaluate(() => advanceAway(60));
  await page.locator('#bPause').click();
  await page.locator('#bResume').click();
  assert.equal(await page.evaluate(() => __game.S.pizzas), fromMenu, 'a manual pause adds no already-collected away interval');
});

test('open windows hold power-up timers and pizza rain, and pay only base production', async t => {
  const page = await game(t);
  const click = await page.evaluate(() => {
    __game.add(1000); __game.clickGolden('click');
    const start = __game.buffs.click;
    __game.openAch(); stepGame(180);
    const held = __game.buffs.click;
    __game.closeModal(); stepGame(60);
    return { start, held, after: __game.buffs.click };
  });
  assert.equal(click.held, click.start, 'super clicks wait while the trophy window is open');
  assert.ok(Math.abs(click.after - (click.start - 1)) < 0.05, `super clicks resume after closing (${click.after})`);

  const rain = await page.evaluate(() => {
    __game.clickGolden('rain'); stepGame(30);
    const before = { left: __game.rain, ys: __game.rainItems.map(item => item.y) };
    __game.openSkins(); stepGame(240);
    const held = { left: __game.rain, ys: __game.rainItems.map(item => item.y) };
    __game.closeModal(); stepGame(30);
    return { before, held, after: __game.rainItems.map(item => item.y) };
  });
  assert.ok(rain.before.ys.length > 0);
  assert.deepEqual(rain.held, rain.before, 'pizza rain neither spawns nor falls behind the skins window');
  assert.ok(rain.after[0] > rain.before.ys[0], 'pizza rain falls again after closing');

  const frenzy = await page.evaluate(() => {
    __game.add(1e5); __game.buy(0, 10); __game.buy(1, 1);
    __game.clickGolden('frenzy');
    const left = __game.buffs.frenzy, base = __game.S.ppsBase;
    __game.openAch();
    const before = __game.S.pizzas;
    stepGame(60);
    return { left, base, gained: __game.S.pizzas - before, held: __game.buffs.frenzy };
  });
  assert.ok(frenzy.base > 0);
  assert.equal(frenzy.held, frenzy.left, 'the frenzy timer waits while a window is open');
  assert.ok(frenzy.gained > frenzy.base * 0.9 && frenzy.gained < frenzy.base * 1.5,
    `a window open during a frenzy pays the base rate (${frenzy.gained} vs ${frenzy.base}/s)`);
});

test('a paused kitchen is drawn once and redrawn only after a resize, restore or window change', async t => {
  const page = await game(t);
  await page.evaluate(() => { __game.add(1e4); __game.buy(0, 4); playFrames(10); });
  await page.locator('#bPause').click();
  assert.equal(await page.evaluate(() => __game.mode), 'pause');
  assert.ok(await page.evaluate(() => playFrames(1)) > 0, 'the first paused frame draws the kitchen');
  assert.equal(await page.evaluate(() => playFrames(120)), 0, 'a settled pause performs no scene paints');

  await page.setViewportSize({ width: 1100, height: 620 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const resized = await page.evaluate(() => playFrames(30));
  assert.ok(resized > 0 && resized <= 4, `resize repaints once (${resized} paints)`);
  assert.equal(await page.evaluate(() => playFrames(60)), 0);

  const restored = await page.evaluate(() => {
    const bg = document.getElementById('bg');
    bg.width = bg.width; // a restored 2D context comes back blank
    bg.dispatchEvent(new Event('contextrestored'));
    const paints = playFrames(30);
    const pixels = bg.getContext('2d').getImageData(0, 0, bg.width, bg.height).data;
    return { paints, visible: pixels.some((value, i) => i % 4 === 3 && value > 0), settled: playFrames(60) };
  });
  assert.ok(restored.paints > 0 && restored.paints <= 4, `context restore repaints once (${restored.paints} paints)`);
  assert.equal(restored.visible, true, 'the restored kitchen is visible behind the pause card');
  assert.equal(restored.settled, 0);

  await page.locator('#bReset').click();
  const confirm = await page.evaluate(() => [playFrames(30), playFrames(60)]);
  assert.ok(confirm[0] > 0 && confirm[0] <= 4 && confirm[1] === 0, `a window over the pause card repaints once (${confirm})`);
  await page.locator('#mcard [data-act="no"]').click();
  assert.equal(await page.evaluate(() => __game.mode), 'pause');

  await page.locator('#bResume').click();
  assert.ok(await page.evaluate(() => playFrames(30)) >= 30, 'resumed play draws every frame');
});
