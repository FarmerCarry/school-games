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

// The game only advances through stepGame()/drawGame(), and every canvas readback is counted.
async function game(t, { reducedMotion = 'no-preference', clock = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    window.readbacks = 0;
    for (const [proto, name] of [[HTMLCanvasElement.prototype, 'toDataURL'], [HTMLCanvasElement.prototype, 'toBlob'], [CanvasRenderingContext2D.prototype, 'getImageData']]) {
      const original = proto[name];
      proto[name] = function (...args) { window.readbacks++; return original.apply(this, args); };
    }
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        window.stepGame = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
        window.drawGame = () => render(0);
        return { stop() {} };
      };
    } });
  });
  if (clock) await page.clock.install();
  await page.goto(`${origin}/games/block-burst/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}
const fxVisibility = page => page.evaluate(() => getComputedStyle(document.getElementById('fx')).visibility);

test('title, skin change, map and fail panel draw thumbnails without reading canvases back', async t => {
  const page = await game(t);
  assert.equal(await page.locator('.logo-blocks i canvas').count(), 3);
  assert.equal(await page.locator('.mode-art canvas').count(), 2);
  assert.equal(await page.locator('#skins .sprev canvas').count(), 6);
  await clickControl(page, '#skins .skin');
  await clickControl(page, '#btnAdv');
  assert.equal(await page.locator('#worlds .wgem canvas').count(), 4);
  await page.evaluate(() => { __game.startLevel(9); __game.endNow(); stepGame(300); });
  assert.equal(await page.evaluate(() => __game.state), 'fail');
  assert.equal(await page.locator('#failGoal .gi canvas').count(), 2);
  assert.match(await page.locator('#failGoal').textContent(), /^بقي: .*النقاط 0 \/ 500$/);
  assert.equal(await page.evaluate(() => window.readbacks), 0);
});

test('a bomb dropped on an empty area is kept; over blocks it clears them', async t => {
  const page = await game(t);
  await clickControl(page, '#btnClassic');
  assert.equal(await page.evaluate(() => __game.run.bombs), 1);
  // click the bomb, then click where it should go (the board starts empty)
  await page.mouse.click(120, 612);
  await page.mouse.click(700, 400);
  assert.equal(await page.evaluate(() => __game.run.bombs), 1);
  assert.equal(await page.locator('#toast').textContent(), 'ضع القنبلة فوق المكعبات!');
  const area = [0, 1, 2, 8, 9, 10, 16, 17, 18];
  await page.evaluate(area => { for (const i of area) __game.run.cells[i] = 3; }, area);
  await page.mouse.click(120, 612);
  await page.mouse.click(485, 127); // the centre of that 3x3 area
  assert.deepEqual(await page.evaluate(area => [__game.run.bombs, area.filter(i => __game.run.cells[i]).length], area), [0, 0]);
});

test('failed saves warn with a retry, keep progress, and clear once a retry succeeds', async t => {
  const page = await game(t);
  await clickControl(page, '#btnClassic');
  await page.evaluate(() => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('sg:block-burst:')) throw new DOMException('full', 'QuotaExceededError');
      return window.restoreStorage.call(this, key, value);
    };
    __game.auto(2);
  });
  const progress = await page.evaluate(() => ({ moves: __game.run.moves, best: __game.save.best }));
  assert.equal(progress.moves, 2);
  assert.ok(progress.best > 0);
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:block-burst:run')), null);
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true, 'a failing retry keeps the warning');
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').isVisible(), true);
  assert.deepEqual(await page.evaluate(() => ({
    moves: JSON.parse(localStorage.getItem('sg:block-burst:run')).moves,
    best: JSON.parse(localStorage.getItem('sg:block-burst:best'))
  })), progress);
});

test('reduced motion skips confetti; otherwise the fx layer shows only while confetti flies', async t => {
  for (const reducedMotion of ['reduce', 'no-preference']) {
    const page = await game(t, { reducedMotion, clock: true });
    assert.equal(await fxVisibility(page), 'hidden');
    await page.evaluate(() => { __game.startLevel(0); __game.win(); stepGame(30); drawGame(); });
    assert.equal(await page.evaluate(() => __game.state), 'win');
    assert.equal(await fxVisibility(page), reducedMotion === 'reduce' ? 'hidden' : 'visible', reducedMotion);
    // The stars light up (with their own confetti) on timeouts: fire them all before the last check.
    await page.clock.runFor(1300);
    assert.equal(await page.locator('#winStars .on').count(), 3);
    await page.evaluate(() => { stepGame(480); drawGame(); }); // every confetti piece has landed
    assert.equal(await fxVisibility(page), 'hidden', reducedMotion);
  }
});

test('a paused game draws until its effects settle, then only after a resize, canvas restore or resume', async t => {
  const page = await game(t);
  const thumb = await page.evaluate(() => {
    // A GPU reset leaves a canvas blank: the title thumbnail repaints itself when restored.
    const art = document.querySelector('.art-classic canvas'), painted = () => art.getContext('2d').getImageData(0, 0, 160, 160).data.some((v, i) => i % 4 === 3 && v > 0);
    art.width = art.width;
    const wiped = painted();
    art.dispatchEvent(new Event('contextrestored'));
    return { wiped, restored: painted() };
  });
  assert.deepEqual(thumb, { wiped: false, restored: true });
  await page.evaluate(() => {
    const background = BBArt.background;
    window.paints = 0;
    BBArt.background = function (...args) { window.paints++; return (window.lastBg = background.apply(this, args)); };
    window.frames = n => { window.paints = 0; for (let i = 0; i < n; i++) { stepGame(); drawGame(); } return window.paints; };
  });
  const paused = await page.evaluate(() => {
    __game.classic(true); stepGame(150); // the start banner has gone
    __game.auto(1); // its score popup stays up for a second
    document.getElementById('btnPause').click();
    const settling = frames(10);
    stepGame(60);
    return { state: __game.state, settling, settled: frames(20) };
  });
  assert.deepEqual(paused, { state: 'pause', settling: 10, settled: 1 }, 'one last frame once the effects are over');
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => frames(10)), 1, 'a resize draws the paused scene once');
  const restored = await page.evaluate(() => {
    const canvas = document.getElementById('game'), before = lastBg;
    canvas.width = canvas.width; // a restored 2D context has lost its pixels and drawing state
    canvas.dispatchEvent(new Event('contextrestored'));
    return { paints: frames(10), rebuilt: lastBg !== before, scale: canvas.getContext('2d').getTransform().a };
  });
  assert.equal(restored.paints, 1);
  assert.equal(restored.rebuilt, true, 'the cached background is rebuilt');
  assert.ok(restored.scale > 0.7 && restored.scale < 0.9, `the logical transform is reapplied (${restored.scale})`);
  await page.evaluate(() => document.getElementById('btnResume').click());
  assert.equal(await page.evaluate(() => frames(10)), 10, 'play draws every frame again');
});

test('a classic run whose save failed is continued from the menu instead of being lost', async t => {
  const page = await game(t);
  await clickControl(page, '#btnClassic');
  const run = await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'sg:block-burst:run') throw new DOMException('full', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
    __game.auto(2);
    return { moves: __game.run.moves, score: __game.run.score };
  });
  const status = () => page.locator('.sg-save-status').getAttribute('data-state');
  assert.equal(await status(), 'failed');
  await clickControl(page, '#btnPause');
  await clickControl(page, '#btnPauseMenu');
  assert.equal(await page.locator('#classicSub').textContent(), 'النقاط الآن: ' + run.score);
  await clickControl(page, '#btnClassic');
  assert.deepEqual(await page.evaluate(() => ({ moves: __game.run.moves, score: __game.run.score })), run);
  assert.equal(await status(), 'failed', 'the continued run is still unsaved');
  // A new game drops that run; the warning clears only because a real write then succeeds.
  await page.evaluate(() => __game.title());
  await clickControl(page, '#btnNew');
  assert.equal(await page.evaluate(() => __game.run.moves), 0);
  assert.equal(await status(), 'saved');
});

test('the gem tip hand drags a tray piece to a spot where it fits and fills a gem row or column', async t => {
  const page = await game(t);
  const moves = await page.evaluate(() => {
    let seed = 7;
    Math.random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const out = [];
    for (const level of [0, 2]) for (let k = 0; k < 12; k++) {
      __game.startLevel(level);
      const m = __game.tipMove, run = __game.run;
      if (!m) { out.push({ level, move: false }); continue; }
      const shape = run.tray[m.slot].shape, gemAt = i => run.gems[i] > 0;
      const fits = BBCore.fits(BBCore.maskFromBoard(run.cells), shape, m.r, m.c);
      const gemLine = shape.cells.some(([y, x]) => [0, 1, 2, 3, 4, 5, 6, 7].some(i => gemAt((m.r + y) * 8 + i) || gemAt(i * 8 + m.c + x)));
      out.push({ level, move: true, fits, gemLine });
    }
    return out;
  });
  assert.ok(moves.filter(m => m.move).length >= 20, JSON.stringify(moves));
  for (const m of moves.filter(m => m.move)) assert.deepEqual(m, { level: m.level, move: true, fits: true, gemLine: true });
});
