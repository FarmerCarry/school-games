import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
const KEY = 'sg:moto-madness:save';
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

// Opens Moto Madness with the frame loop under test control: __game.step(n) advances it.
async function game(t, initialSave) {
  const context = await browser.newContext(), page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(([key, value]) => {
    if (value && !sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); }
    let kit;
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(v) { kit = v; kit.loop = () => ({ stop() {} }); } });
  }, [KEY, initialSave ? JSON.stringify(initialSave) : null]);
  await page.goto(`${origin}/games/moto-madness/`);
  await page.waitForFunction(() => window.__game && __game.state === 'title');
  return page;
}

// Puts the rider just before the line and steps until the run is over.
async function crossLine(page, flips = 0) {
  await page.evaluate(n => {
    __game.world.flips = n;
    __game.finish();
    for (let i = 0; i < 120 && !__game.world.finished; i++) __game.step(1, { gas: true });
  }, flips);
  assert.equal(await page.evaluate(() => __game.world.finished), true);
}

test('Moto Madness saves a finished run at the line, even when R restarts before the results', async t => {
  const page = await game(t);
  await page.evaluate(() => __game.start(0));
  await crossLine(page, 2);
  await page.keyboard.press('KeyR');
  const kept = await page.evaluate(key => ({
    state: __game.state, started: __game.world.started, stars: __game.save.stars[0], best: __game.save.best[0],
    flips: __game.save.flips, stored: JSON.parse(localStorage.getItem(key)), ghost: localStorage.getItem('sg:moto-madness:ghost0'),
    racing: JSON.stringify(__game.ghost)
  }), KEY);
  assert.equal(kept.state, 'play');
  assert.equal(kept.started, false, 'R starts a fresh run');
  assert.ok(kept.stars > 0 && kept.best > 0, 'stars and best time are kept');
  assert.equal(kept.flips, 2);
  assert.deepEqual([kept.stored.stars[0], kept.stored.best[0], kept.stored.flips], [kept.stars, kept.best, 2]);
  assert.ok(kept.ghost, 'the new best run is saved as the ghost');
  assert.equal(kept.racing, JSON.stringify(JSON.parse(kept.ghost).d), 'the restarted run races the new best');

  // the results panel after a normal finish shows the run without counting its flips twice
  await crossLine(page);
  await page.evaluate(() => __game.step(120));
  assert.equal(await page.evaluate(() => __game.state), 'complete');
  assert.equal(await page.evaluate(() => __game.save.flips), 2);
  assert.equal(await page.locator('#complete').isVisible(), true);
});

test('Moto Madness shows a retry warning when progress cannot be saved, and keeps the stars', async t => {
  const page = await game(t);
  await page.evaluate(key => {
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new DOMException('full', 'QuotaExceededError');
      return window.realSetItem.call(this, k, v);
    };
    __game.start(0);
  }, KEY);
  await crossLine(page);
  await page.evaluate(() => __game.step(120));
  assert.equal(await page.evaluate(() => __game.state), 'complete');
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), null);
  const stars = await page.evaluate(() => __game.save.stars[0]);
  assert.ok(stars > 0, 'the stars stay earned while saving fails');
  await page.evaluate(() => { Storage.prototype.setItem = window.realSetItem; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').isVisible(), true);
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).stars[0], KEY), stars);
});

test('Moto Madness opens the garage with a corrupt saved paint or suit', async t => {
  const page = await game(t, { stars: [3], best: [20], paint: 99, suit: -2, flips: 1 });
  await page.keyboard.press('KeyG');
  assert.equal(await page.evaluate(() => __game.state), 'garage');
  assert.equal(await page.locator('#garage').isVisible(), true);
  assert.equal(await page.locator('#paintName').textContent(), 'الصاروخ الأحمر');
  assert.equal(await page.locator('#suitName').textContent(), 'الكلاسيكية');
});

test('Moto Madness reuses the backdrop between levels of the same world', async t => {
  const page = await game(t);
  const made = await page.evaluate(() => {
    let canvases = 0;
    const create = document.createElement.bind(document);
    document.createElement = (name, opts) => { if (String(name).toLowerCase() === 'canvas') canvases++; return create(name, opts); };
    const count = fn => { canvases = 0; fn(); return canvases; };
    return { first: count(() => __game.start(0)), same: count(() => __game.start(1)), desert: count(() => __game.start(5)), retry: count(() => __game.start(5)) };
  });
  assert.equal(made.same, 0, 'the next grass level keeps the grass backdrop');
  assert.equal(made.retry, 0, 'retrying keeps the backdrop');
  assert.ok(made.desert > 0, 'a new world draws its own backdrop');
});
