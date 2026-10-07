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
  await browser?.close();
  await server?.close();
});

// Drives drift-king's Kit.loop by hand and counts full-sky paints of the world canvas.
async function game(t) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit, update, render;
    const runtime = window.runtime = { paints: 0 };
    runtime.step = count => { for (let i = 0; i < count; i++) { update(1 / 60); render(0); } };
    runtime.paintsOver = count => { const before = runtime.paints; runtime.step(count); return runtime.paints - before; };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'c' && x === 0 && y === 0 && w === 1280 && h === 720) runtime.paints++;
      return fill.apply(this, arguments);
    };
  });
  await page.goto(server.origin + '/games/drift-king/');
  await page.waitForFunction(() => window.__game?.debug && window.runtime);
  return page;
}

test('Drift King keeps one still frame under pause and settled results, and redraws it after resize', async t => {
  const page = await game(t);
  await page.evaluate(() => { __game.debug.start(); __game.debug.autopilot = true; runtime.step(90); });
  await page.locator('#btnPause').click();
  const paused = await page.evaluate(() => {
    runtime.step(30);
    const time = __game.time, idle = runtime.paintsOver(60);
    window.dispatchEvent(new Event('resize'));
    return { mode: __game.mode, idle, resized: runtime.paintsOver(60), clock: __game.time - time };
  });
  assert.deepEqual(paused, { mode: 'paused', idle: 0, resized: 1, clock: 0 });
  await page.locator('#btnResume').click();
  assert.equal(await page.evaluate(() => runtime.paintsOver(30)), 30, 'play redraws every frame again');

  const over = await page.evaluate(() => {
    __game.debug.autopilot = false;
    for (let i = 0; i < 1200 && __game.mode !== 'over'; i++) runtime.step(1);
    runtime.step(120);
    const idle = runtime.paintsOver(60);
    window.dispatchEvent(new Event('resize'));
    return { mode: __game.mode, idle, resized: runtime.paintsOver(60) };
  });
  assert.deepEqual(over, { mode: 'over', idle: 0, resized: 1 });
});
