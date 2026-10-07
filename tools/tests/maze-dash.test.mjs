import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

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

async function gamePage(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  // Drive the real update function with fixed steps instead of animation frames.
  await page.addInitScript(() => {
    let kit;
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = update => {
          window.stepGame = (count = 1) => { for (let i = 0; i < count; i++) update(1 / 60); };
          return { stop() {} };
        };
      }
    });
  });
  await page.goto(`${server.origin}/games/maze-dash/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}

test('a failed save warns with a retry, and the retry writes the progress', async t => {
  const page = await gamePage(t);
  assert.equal(await page.locator('.sg-save-status').isVisible(), false);
  await page.evaluate(() => {
    window.restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
    __game.skip(1);
    __game.win();
    stepGame(90);
  });
  assert.equal(await page.evaluate(() => __game.state.screen), 'win');
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:maze-dash:save')), null);
  await page.evaluate(() => { Storage.prototype.setItem = window.restoreStorage; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').isVisible(), true);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:maze-dash:save')));
  assert.equal(saved.lv['1'].done, 1);
});

test('a swipe left over from before a pause never dashes on plain mouse movement', async t => {
  const page = await gamePage(t);
  const start = await page.evaluate(() => { __game.skip(3); stepGame(2); return [__game.state.px, __game.state.py]; });
  assert.deepEqual(start, [6, 10]);
  const down = () => document.getElementById('game').dispatchEvent(new PointerEvent('pointerdown', { button: 0, buttons: 1, clientX: 550, clientY: 310, bubbles: true }));
  const move = buttons => window.dispatchEvent(new PointerEvent('pointermove', { buttons, clientX: 430, clientY: 310 }));
  // The button is released outside the window while the game is paused.
  await page.evaluate(down);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.evaluate(() => __game.state.screen), 'pause');
  await page.evaluate(() => { document.getElementById('btn-resume').click(); stepGame(2); });
  assert.equal(await page.evaluate(() => __game.state.screen), 'play');
  await page.evaluate(move, 0);
  await page.evaluate(() => stepGame(30));
  assert.equal(await page.evaluate(() => __game.state.px), 6);
  // A lost pointerup without any blur is caught by the button state.
  await page.evaluate(down);
  await page.evaluate(move, 0);
  await page.evaluate(move, 1);
  await page.evaluate(() => stepGame(30));
  assert.equal(await page.evaluate(() => __game.state.px), 6);
  // A real drag still dashes.
  await page.evaluate(down);
  await page.evaluate(move, 1);
  await page.evaluate(() => stepGame(30));
  assert.equal(await page.evaluate(() => __game.state.px), 1);
});
