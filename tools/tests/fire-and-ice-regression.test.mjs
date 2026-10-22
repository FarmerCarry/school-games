import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let server, browser, origin;

before(async () => {
  server = await startTestServer(root);
  origin = server.origin;
  browser = await launchChromium();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function gamePage(t) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught browser errors'));
  await page.goto(`${origin}/games/fire-and-ice/`);
  await page.waitForFunction(() => window.__game && window.Kit);
  return page;
}

// __game.bench(n) runs n fixed 1/60 s update+render steps, so these checks do not
// depend on the headless frame rate.

test('Fire & Ice warns when saving fails and clears the warning after Retry', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    window.__setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new Error('full'); };
    __game.load(1); __game.win(); __game.bench(60);
  });
  const panel = page.locator('.sg-save-status');
  assert.equal(await panel.getAttribute('data-state'), 'failed');
  assert.equal(await panel.isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
  await panel.locator('button').click();
  assert.equal(await panel.getAttribute('data-state'), 'saved');
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:fire-and-ice:unlocked')), '2');
});

// Waits for n real animation frames, so Kit.loop has had n chances to update and render.
const frames = (page, n) => page.evaluate(n => new Promise(done => {
  let k = 0; const f = () => (++k >= n ? done() : requestAnimationFrame(f)); requestAnimationFrame(f);
}), n);

test('Fire & Ice draws a paused level once and redraws it only after a resize', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => { __game.load(1); __game.bench(10); });
  await page.locator('#pauseBtn').click();
  assert.equal(await page.evaluate(() => __game.mode), 'paused');
  await page.evaluate(() => {
    const ctx = document.getElementById('game').getContext('2d'), fillRect = ctx.fillRect;
    window.__draws = 0;
    ctx.fillRect = function () { window.__draws++; return fillRect.apply(this, arguments); };
  });
  await frames(page, 3);
  const before = await page.evaluate(() => { window.__draws = 0; return __game.particles(); });
  await frames(page, 30);
  assert.deepEqual(await page.evaluate(() => [window.__draws, __game.particles()]), [0, before], 'a paused level is neither redrawn nor animated');
  await page.setViewportSize({ width: 900, height: 520 });
  await page.waitForFunction(() => window.__draws > 0, null, { timeout: 10000 });
  await frames(page, 3);
  await page.evaluate(() => { window.__draws = 0; });
  await frames(page, 30);
  assert.equal(await page.evaluate(() => window.__draws), 0, 'one redraw after the resize, then idle again');
  await page.locator('#resumeBtn').click();
  await page.waitForFunction(() => window.__draws > 0, null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => __game.mode), 'play');
});

test('Fire & Ice glow sprites stop allocating canvases past the colour cap', async t => {
  const page = await gamePage(t);
  const made = await page.evaluate(() => {
    for (let i = 0; i < 40; i++) FI.R.glow('rgba(1,2,' + i + ',0.5)');
    let canvases = 0;
    const create = document.createElement;
    document.createElement = function (tag) {
      if (String(tag).toLowerCase() === 'canvas') canvases++;
      return create.apply(document, arguments);
    };
    for (let i = 0; i < 100; i++) FI.R.glow('rgba(3,4,' + i + ',0.5)');
    document.createElement = create;
    return canvases;
  });
  assert.equal(made, 0, `uncached glow colours created ${made} canvases`);
});
