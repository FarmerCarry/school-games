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

test('Fire & Ice button glow reuses one sprite per colour while a button eases', async t => {
  const page = await gamePage(t);
  const made = await page.evaluate(() => {
    __game.load(3);
    __game.bench(5);
    let canvases = 0;
    const create = document.createElement;
    document.createElement = function (tag) {
      if (String(tag).toLowerCase() === 'canvas') canvases++;
      return create.apply(document, arguments);
    };
    const w = __game.world, b = w.buttons.find(q => q.ch === 'a');
    for (let i = 0; i < 5; i++) {
      w.fire.x = b.x + 16 - w.fire.w / 2; w.fire.vx = 0; __game.bench(30);
      w.fire.x -= 90; __game.bench(30);
    }
    document.createElement = create;
    return canvases;
  });
  assert.ok(made <= 1, `5 presses created ${made} glow canvases`);
});

test('Fire & Ice drops the win panel star chimes when the next level starts', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    __game.load(1); __game.win(); __game.bench(60);
    window.__chimes = 0;
    ['star', 'win'].forEach(k => {
      const f = __game.sfx[k];
      __game.sfx[k] = function () { window.__chimes++; return f.apply(this, arguments); };
    });
  });
  assert.equal(await page.evaluate(() => document.getElementById('winScreen').hidden), false);
  await page.evaluate(() => document.getElementById('winNext').click());
  await page.waitForTimeout(1400);
  assert.deepEqual(await page.evaluate(() => [__game.world.index, window.__chimes]), [1, 0]);
});

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

test('Fire & Ice reduced motion removes ambient embers and confetti', async t => {
  const page = await gamePage(t);
  const counts = await page.evaluate(() => {
    const run = () => {
      __game.load(1); __game.bench(60);
      const idle = __game.particles();
      __game.win(); __game.bench(1);
      return [idle, __game.particles()];
    };
    Kit.motion.setPreference('reduce');
    const calm = run();
    Kit.motion.setPreference('full');
    return { calm, full: run() };
  });
  assert.deepEqual(counts.calm, [0, 0]);
  assert.ok(counts.full[0] > 0 && counts.full[1] >= 60, `full effects: ${counts.full}`);
});
