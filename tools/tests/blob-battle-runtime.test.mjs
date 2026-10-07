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

// Drives Blob Battle's own update/render callbacks so frame and save counts are exact.
async function blob(t) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit, update, render;
    const runtime = window.runtime = { paints: 0, failSave: false };
    runtime.step = count => { for (let i = 0; i < count; i++) { update(1 / 60); render(0); } };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    // Every scene paint starts with one full-screen fill of the 1280x720 view.
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'c' && x === 0 && y === 0 && w === 1280 && h === 720) runtime.paints++;
      return fill.apply(this, arguments);
    };
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (runtime.failSave && key.startsWith('sg:blob-battle:')) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  });
  await page.goto(`${server.origin}/games/blob-battle/`);
  await page.waitForFunction(() => window.__game);
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => setTimeout(resolve, 0)); });
  return page;
}

const paintsOver = (page, frames) => page.evaluate(n => { runtime.paints = 0; runtime.step(n); return runtime.paints; }, frames);

test('Blob Battle draws a paused scene once, redraws it after resize and context restore, then resumes', async t => {
  const page = await blob(t);
  await page.evaluate(() => { document.getElementById('btnPlay').click(); runtime.step(60); });
  assert.equal(await page.evaluate(() => __game.info().state), 'play');
  assert.equal(await paintsOver(page, 30), 30, 'live play paints every frame');
  await page.evaluate(() => document.getElementById('pauseBtn').click());
  assert.equal(await page.evaluate(() => __game.info().state), 'pause');
  assert.equal(await paintsOver(page, 30), 1, 'pausing paints the frozen scene once');
  assert.equal(await paintsOver(page, 120), 0, 'a settled pause performs no scene paints');

  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await paintsOver(page, 30), 1, 'a resize repaints the paused scene once');
  assert.equal(await paintsOver(page, 60), 0);

  const restored = await page.evaluate(() => {
    const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
    // A restored 2D context has lost its pixels and drawing state.
    canvas.width = canvas.width;
    canvas.dispatchEvent(new Event('contextrestored'));
    runtime.paints = 0; runtime.step(30);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return { paints: runtime.paints, visible: pixels.some((value, i) => i % 4 === 3 && value > 0) };
  });
  assert.equal(restored.paints, 1, 'context restore repaints the paused scene');
  assert.equal(restored.visible, true, 'the restored paused canvas is not blank');

  const before = await page.evaluate(() => __game.info().T);
  await page.evaluate(() => document.getElementById('btnResume').click());
  assert.equal(await paintsOver(page, 30), 30, 'resuming paints every frame again');
  assert.ok(await page.evaluate(() => __game.info().T) > before, 'the simulation resumes');
});

test('Blob Battle warns about failed saves, keeps them queued, and clears the warning after a retry', async t => {
  const page = await blob(t);
  const panel = () => page.evaluate(() => {
    const el = document.querySelector('.sg-save-status');
    return el && !el.hidden ? el.getAttribute('data-state') : 'hidden';
  });
  assert.equal(await panel(), 'hidden');
  // A skin choice that cannot be written stays queued for the next save.
  await page.evaluate(() => { localStorage.removeItem('sg:blob-battle:skin'); runtime.failSave = true; document.getElementById('skinPrev').click(); });
  assert.equal(await panel(), 'failed', 'a failed skin write shows the warning');
  await page.evaluate(() => { document.getElementById('btnPlay').click(); runtime.step(30); document.getElementById('pauseBtn').click(); });
  assert.equal(await panel(), 'failed', 'a failed stats save keeps the warning');
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:blob-battle:skin')), null);

  await page.evaluate(() => { runtime.failSave = false; document.querySelector('.sg-save-status button').click(); });
  assert.equal(await panel(), 'saved', 'a successful retry confirms the save');
  const saved = await page.evaluate(() => ({ skin: JSON.parse(localStorage.getItem('sg:blob-battle:skin')),
    rounds: typeof JSON.parse(localStorage.getItem('sg:blob-battle:stats')).rounds }));
  assert.deepEqual(saved, { skin: 'mint', rounds: 'number' }, 'the retry writes the stats and the queued skin');
});
