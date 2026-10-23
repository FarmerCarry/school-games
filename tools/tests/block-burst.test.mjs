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

// The game only advances through stepGame()/drawGame().
async function game(t, { init } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
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
  if (init) await page.addInitScript(init);
  await page.goto(`${origin}/games/block-burst/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}
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

test('a won level is saved at once, before its ending animation and result panel', async t => {
  const page = await game(t);
  const ended = await page.evaluate(() => {
    __game.startLevel(0); stepGame(2);
    for (let i = 0; i < 80 && __game.state === 'play'; i++) __game.auto(1);
    return { state: __game.state, result: __game.run.result };
  });
  assert.equal(ended.state, 'ending', `level 1 is won by greedy play (${JSON.stringify(ended)})`);
  const adv = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:block-burst:adv')));
  assert.ok(adv && adv[0] >= 1, 'the stars are already in storage if the page is left now');
  await page.evaluate(() => { for (let i = 0; i < 600 && __game.state === 'ending'; i++) stepGame(1); });
  assert.equal(await page.evaluate(() => __game.state), 'win', 'the result panel still follows');
});

test('stats saved as null or a number restart from zero, so Classic starts and an Adventure line clear counts', async t => {
  for (const raw of ['null', '7']) {
    const page = await game(t, { init: `localStorage.setItem('sg:block-burst:stats', '${raw}')` });
    await clickControl(page, '#btnClassic');
    assert.equal(await page.evaluate(() => __game.state), 'play', raw);
    const lines = await page.evaluate(() => {
      __game.startLevel(0);
      const run = __game.run;
      for (let i = 0; i < 8; i++) run.cells[i] = i < 7 ? 3 : 0; // the top row lacks only its last cell
      run.tray[0] = { shape: BBCore.BY_ID.dot0, color: 2, gemCell: -1, gemKind: 0 };
      return __game.place(0, 0, 7).lines;
    });
    assert.equal(lines, 1, raw);
    const stats = { games: 1, lines: 1, perfects: 0, bestCombo: 1 };
    assert.deepEqual(await page.evaluate(() => __game.save.stats), stats, raw);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:block-burst:stats'))), stats, raw);
  }
});
