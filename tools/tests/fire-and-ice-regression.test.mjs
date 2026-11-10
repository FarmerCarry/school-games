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
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:fire-and-ice:music')), null, 'the game has no music setting to save');
});

test('Fire & Ice saves a won level at the win, before the result panel opens', async t => {
  const page = await gamePage(t);
  // one evaluate, so the real loop cannot reach the panel 0.7 s later in between
  const atWin = await page.evaluate(() => {
    __game.load(1); __game.bench(5); __game.win(); __game.bench(1);
    return { panel: !document.getElementById('winScreen').hidden, unlocked: localStorage.getItem('sg:fire-and-ice:unlocked'),
      best: (JSON.parse(localStorage.getItem('sg:fire-and-ice:best')) || {})[0] };
  });
  assert.equal(atWin.panel, false, 'the result panel has not opened yet');
  assert.equal(atWin.unlocked, '2', 'the next level is unlocked at the win');
  assert.ok(atWin.best?.stars >= 1, 'the stars are stored at the win');
  // the panel shows the result saved at the win, not a second, already-improved one
  const shown = await page.evaluate(() => {
    __game.bench(60);
    return { panel: !document.getElementById('winScreen').hidden, stars: document.querySelectorAll('#winStars .crit.got').length,
      newBest: !document.getElementById('winNew').hidden, best: JSON.parse(localStorage.getItem('sg:fire-and-ice:best'))[0] };
  });
  assert.deepEqual(shown, { panel: true, stars: atWin.best.stars, newBest: false, best: atWin.best });
  // leaving during the 0.7 s before the panel keeps the level
  await page.evaluate(() => { __game.load(2); __game.bench(5); __game.win(); __game.bench(1); });
  await page.reload();
  await page.waitForFunction(() => window.__game);
  assert.equal(await page.evaluate(() => __game.save.unlocked), 3);
});

test('Fire & Ice times that round up to a whole ten seconds or minute read normally', async t => {
  const page = await gamePage(t);
  const text = await page.evaluate(() => {
    __game.load(1); __game.bench(5);
    __game.save.best[0] = { stars: 1, time: 9.96 };
    __game.world.t = 59.96; __game.win(); __game.bench(60);
    return document.getElementById('winTime').textContent;
  });
  assert.equal(text, 'الوقت 1:00.0   ·   الأفضل 0:10.0');
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
