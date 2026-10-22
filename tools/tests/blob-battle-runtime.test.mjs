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
async function blob(t, viewport = { width: 960, height: 540 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit, update, render;
    const runtime = window.runtime = { paints: 0, failSave: false, canvases: [] };
    runtime.step = count => { for (let i = 0; i < count; i++) { update(1 / 60); render(0); } };
    runtime.render = () => render(0);
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function (name) {
      const el = create.apply(this, arguments);
      if (String(name).toLowerCase() === 'canvas') runtime.canvases.push(el);
      return el;
    };
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

test('Blob Battle repaints its sprite canvases after a GPU reset wipes them', async t => {
  const page = await blob(t);
  await page.evaluate(() => { document.getElementById('btnPlay').click(); runtime.step(30); document.getElementById('pauseBtn').click(); runtime.step(5); });
  const result = await page.evaluate(() => {
    // the pellet sheet and the three virus sizes are never attached to the page
    const sprites = runtime.canvases.filter(c => !c.isConnected &&
      ((c.width === 544 && c.height === 144) || (c.width === c.height && [200, 100, 50].includes(c.width))));
    const painted = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; return d.some((v, i) => i % 4 === 3 && v > 0); };
    const wipe = () => sprites.forEach(c => { c.width = c.width; });
    const out = { count: sprites.length, before: sprites.every(painted) };
    wipe();
    out.wiped = sprites.some(painted);
    const sheet = sprites.find(c => c.width === 544);
    runtime.paints = 0;
    sheet.dispatchEvent(new Event('contextrestored'));
    runtime.step(30);
    out.ownRestore = sprites.every(painted);
    out.ownPaints = runtime.paints;
    wipe();
    runtime.paints = 0;
    document.getElementById('c').dispatchEvent(new Event('contextrestored'));
    runtime.step(30);
    out.mainRestore = sprites.every(painted);
    out.mainPaints = runtime.paints;
    return out;
  });
  assert.equal(result.count, 4, 'one pellet sheet and three virus sizes');
  assert.equal(result.before, true);
  assert.equal(result.wiped, false, 'the fixture really wipes the sprites');
  assert.equal(result.ownRestore, true, "a sprite canvas's own restore event repaints the sprites");
  assert.equal(result.ownPaints, 1, 'and repaints the paused scene once');
  assert.equal(result.mainRestore, true, 'a main canvas restore also repaints the sprites');
  assert.equal(result.mainPaints, 1);
});

// Pellets are drawn from a sheet of pre-painted sizes. Shrinking a sprite more than 2x with the
// default filter makes small pellets jagged and lets them crawl with the camera (squares, L-shapes,
// colour fringes from the next cell), so check the chosen sizes and compare the drawn pixels with
// anti-aliased circles at the same sub-pixel positions, at the zooms of mid and late game in the
// 1100x620 portal frame.
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
  // The message and the badge it folds into after 6 s both stay top-right, clear of the
  // leaderboard at the top-left of the HUD (1280x720 logical, x 14-246).
  const spots = await page.evaluate(() => {
    const el = document.querySelector('.sg-save-status'), c = document.getElementById('c').getBoundingClientRect();
    return ['false', 'true'].map(compact => {
      el.setAttribute('data-compact', compact);
      const r = el.getBoundingClientRect();
      return { compact, right: Math.round(innerWidth - r.right), top: Math.round(r.top), clearOfBoard: r.left > c.left + 246 * c.width / 1280 };
    });
  });
  assert.deepEqual(spots, [{ compact: 'false', right: 12, top: 62, clearOfBoard: true }, { compact: 'true', right: 12, top: 62, clearOfBoard: true }]);

  await page.evaluate(() => { runtime.failSave = false; document.querySelector('.sg-save-status button').click(); });
  assert.equal(await panel(), 'saved', 'a successful retry confirms the save');
  const saved = await page.evaluate(() => ({ skin: JSON.parse(localStorage.getItem('sg:blob-battle:skin')),
    rounds: typeof JSON.parse(localStorage.getItem('sg:blob-battle:stats')).rounds }));
  assert.deepEqual(saved, { skin: 'mint', rounds: 'number' }, 'the retry writes the stats and the queued skin');
});
