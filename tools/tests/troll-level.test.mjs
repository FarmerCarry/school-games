import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { clickControl } from '../ui-input.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;

before(async () => {
  server = await startTestServer(root);
  browser = await launchChromium();
});
after(async () => {
  if (browser) await browser.close();
  await server?.close();
});

// The game's loop is stepped by hand (update + render), so the checks do not
// depend on how fast the software renderer draws frames.
async function game(t) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (update, render) => {
        window.stepGame = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
        return { stop() {} };
      };
    } });
  });
  await page.goto(`${server.origin}/games/troll-level/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}
const where = page => page.evaluate(() => `${__game.mode}:${__game.level}`);

test('Continue moves on past a skipped level instead of sending the player back', async t => {
  const page = await game(t);
  await clickControl(page, '#btn-play');
  assert.equal(await where(page), 'play:0');
  await page.evaluate(() => __game.setDeaths(10));
  await clickControl(page, '#btn-pause');
  await page.locator('#btn-skip').click();
  assert.equal(await where(page), 'play:1');
  await clickControl(page, '#btn-pause');
  await page.locator('#btn-p-menu').click();
  await page.reload();
  await page.waitForFunction(() => window.__game && window.stepGame);
  await clickControl(page, '#btn-play');
  assert.equal(await where(page), 'play:1', 'the skipped level stays in the level select');
});

test('denied saves warn, keep progress in memory and clear only after a full retry', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('sg:troll-level:')) throw new DOMException('full', 'QuotaExceededError');
      return window.restoreStorage.call(this, key, value);
    };
  });
  await clickControl(page, '#btn-play');
  await page.evaluate(() => { __game.win(); stepGame(120); });
  assert.equal(await page.evaluate(() => __game.mode), 'win');
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:troll-level:unl')), null);
  assert.equal(await page.evaluate(() => __game.save.unl), 1);
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').isVisible(), true);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.stepGame);
  assert.deepEqual(await page.evaluate(() => [__game.save.unl, __game.save.stars[0]]), [1, 3]);
});

test('a settled pause stops redrawing until a resize, and reduced motion skips the flash', async t => {
  const page = await game(t);
  await page.evaluate(() => {
    window.draws = 0; window.flashes = 0;
    const ctx = document.getElementById('cv').getContext('2d'), draw = ctx.drawImage, fill = ctx.fillRect;
    ctx.drawImage = function () { window.draws++; return draw.apply(this, arguments); };
    ctx.fillRect = function (x, y, w, h) {
      if (w === 1280 && h === 720 && this.fillStyle === '#ffffff') window.flashes++;
      return fill.apply(this, arguments);
    };
  });
  await clickControl(page, '#btn-play');
  await page.evaluate(() => stepGame(240)); // the intro card and level message finish
  await clickControl(page, '#btn-pause');
  const [paused, later] = await page.evaluate(() => { stepGame(5); const a = draws; stepGame(60); return [a, draws]; });
  assert.ok(paused > 0);
  assert.equal(later, paused, 'a still paused scene is not redrawn every frame');
  await page.setViewportSize({ width: 1100, height: 620 });
  const redrawn = await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    const a = draws; stepGame(10); return draws - a;
  });
  assert.equal(redrawn, 1, 'a resize repaints the paused scene once');
  await page.waitForTimeout(350); // the pause panel pops in
  await clickControl(page, '#btn-resume');
  assert.equal(await page.evaluate(() => { const a = draws; stepGame(3); return draws - a; }), 3);

  async function dieOnce() {
    await page.keyboard.down('ArrowRight');
    await page.evaluate(() => { for (let i = 0; i < 900 && __game.deaths < 1; i++) stepGame(1); stepGame(2); });
    await page.keyboard.up('ArrowRight');
    assert.equal(await page.evaluate(() => __game.deaths), 1);
  }
  await page.evaluate(() => { Kit.motion.setPreference('reduce'); __game.start(0); });
  await dieOnce();
  assert.equal(await page.evaluate(() => flashes), 0, 'no full-screen flash with reduced motion');
  await page.evaluate(() => { Kit.motion.setPreference('full'); __game.start(0); });
  await dieOnce();
  assert.ok(await page.evaluate(() => flashes) > 0, 'full motion keeps the death flash');
});
