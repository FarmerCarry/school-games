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
  // stepGame(n, true) also renders each step and counts the frames that drew.
  await page.addInitScript(() => {
    let kit, draws = 0;
    window.paints = 0;
    window.canvases = [];
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function (tag) {
      const el = create.apply(this, arguments);
      if (String(tag).toLowerCase() === 'canvas') window.canvases.push(el);
      return el;
    };
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function () {
      if (this.canvas.id === 'game') draws++;
      return drawImage.apply(this, arguments);
    };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          window.stepGame = (count = 1, paint = false) => {
            for (let i = 0; i < count; i++) {
              update(1 / 60);
              if (paint) { const before = draws; render(0); if (draws > before) window.paints++; }
            }
          };
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

test('a paused game keeps its last frame, repaints it after a GPU reset or resize, and resumes', async t => {
  const page = await gamePage(t);
  // A small canvas keeps the software-rendered pixel reads quick. Let the game's
  // own font loads finish first, so they cannot add a repaint mid-test.
  await page.setViewportSize({ width: 640, height: 360 });
  await page.evaluate(async () => {
    await Promise.all([document.fonts.load('700 40px Fredoka', 'بـ0'), document.fonts.load('500 20px Fredoka', 'بـ0')]);
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  await page.evaluate(() => { __game.endless(); stepGame(5, true); window.dispatchEvent(new Event('blur')); });
  assert.equal(await page.evaluate(() => __game.state.screen), 'pause');
  assert.equal(await page.evaluate(() => { paints = 0; stepGame(120, true); return paints; }), 1, 'the paused scene is drawn once');
  // A GPU reset hands back every canvas blank, the cached layers included.
  const restored = await page.evaluate(() => {
    const game = document.getElementById('game'), ctx = game.getContext('2d');
    const before = ctx.getImageData(0, 0, game.width, game.height).data;
    for (const c of [game, ...canvases]) c.width = c.width;
    for (const c of [game, ...canvases]) c.dispatchEvent(new Event('contextrestored'));
    paints = 0; stepGame(60, true);
    const after = ctx.getImageData(0, 0, game.width, game.height).data;
    // Software rendering may round a colour channel by one, so allow tiny differences.
    let changed = 0;
    for (let i = 0; i < before.length; i++) if (Math.abs(before[i] - after[i]) > 4) changed++;
    return { paints, changed };
  });
  assert.deepEqual(restored, { paints: 1, changed: 0 }, 'the restored frame is repainted once, as before');
  await page.setViewportSize({ width: 720, height: 400 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => { paints = 0; stepGame(60, true); return paints; }), 1, 'a resize repaints once');
  await page.evaluate(() => document.getElementById('btn-resume').click());
  assert.equal(await page.evaluate(() => { paints = 0; stepGame(10, true); return paints; }), 10, 'play renders every frame again');
  assert.equal(await page.evaluate(() => __game.state.screen), 'play');
});
