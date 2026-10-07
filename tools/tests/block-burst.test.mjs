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
async function game(t, { reducedMotion = 'no-preference' } = {}) {
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
    const page = await game(t, { reducedMotion });
    assert.equal(await fxVisibility(page), 'hidden');
    await page.evaluate(() => { __game.startLevel(0); __game.win(); stepGame(30); drawGame(); });
    assert.equal(await page.evaluate(() => __game.state), 'win');
    assert.equal(await fxVisibility(page), reducedMotion === 'reduce' ? 'hidden' : 'visible', reducedMotion);
    await page.evaluate(() => { stepGame(480); drawGame(); }); // every confetti piece has landed
    assert.equal(await fxVisibility(page), 'hidden', reducedMotion);
  }
});
