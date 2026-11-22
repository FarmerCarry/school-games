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

async function gamePage(t, initScript) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught browser errors'));
  if (initScript) await page.addInitScript(initScript);
  await page.goto(`${origin}/games/fire-and-ice/`);
  await page.waitForFunction(() => window.__game && window.Kit);
  return page;
}

const frames = (page, n) => page.evaluate(n => new Promise(done => {
  let k = 0; const f = () => (++k >= n ? done() : requestAnimationFrame(f)); requestAnimationFrame(f);
}), n);

test('Fire & Ice warns when saving fails, recovers on Retry, and writes save v2 with zero music key', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => {
    window.__setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new Error('quota'); };
    __game.load(1);
    __game.win();
    __game.bench(50);
  });
  const panel = page.locator('.sg-save-status');
  assert.equal(await panel.getAttribute('data-state'), 'failed');
  assert.equal(await panel.isVisible(), true);
  await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
  await panel.locator('button').click();
  assert.equal(await panel.getAttribute('data-state'), 'saved');
  const saved = await page.evaluate(() => ({
    v2: JSON.parse(localStorage.getItem('sg:fire-and-ice:v2') || 'null'),
    music: localStorage.getItem('sg:fire-and-ice:music')
  }));
  assert.equal(saved.v2?.v, 2);
  assert.equal(saved.v2?.unlocked, 2);
  assert.equal(saved.music, null, 'game has zero BGM and never saves a music key');
});

test('Fire & Ice saves a won level immediately before the win overlay opens and ignores legacy v1 saves', async t => {
  const page = await gamePage(t, () => {
    if (!sessionStorage.getItem('fi_seeded')) {
      sessionStorage.setItem('fi_seeded', '1');
      localStorage.setItem('sg:fire-and-ice:unlocked', '9');
      localStorage.setItem('sg:fire-and-ice:v2', JSON.stringify({ v: 1, unlocked: 12 }));
    }
  });
  assert.equal(await page.evaluate(() => __game.save.unlocked), 1, 'old save schema resets cleanly');

  const atWin = await page.evaluate(() => {
    __game.load(1);
    __game.bench(5);
    __game.win();
    __game.bench(1);
    const v2 = JSON.parse(localStorage.getItem('sg:fire-and-ice:v2') || 'null');
    return {
      panel: !document.getElementById('winScreen').hidden,
      unlocked: v2?.unlocked,
      best: v2?.best?.[0]
    };
  });
  assert.equal(atWin.panel, false, 'win modal has not opened yet during victory celebration');
  assert.equal(atWin.unlocked, 2, 'next level already persisted at win');
  assert.ok(atWin.best?.stars >= 1, 'stars already persisted at win');

  const shown = await page.evaluate(() => {
    __game.bench(50);
    return {
      panel: !document.getElementById('winScreen').hidden,
      starsText: document.getElementById('winStars').textContent
    };
  });
  assert.equal(shown.panel, true);
  assert.ok(shown.starsText.includes('★'));

  // Reloading mid-celebration preserves the win
  await page.evaluate(() => { __game.load(2); __game.bench(4); __game.win(); __game.bench(1); });
  await page.reload();
  await page.waitForFunction(() => window.__game);
  assert.equal(await page.evaluate(() => __game.save.unlocked), 3);
});

test('Fire & Ice freezes rendering while paused, redraws once on resize, and has no music toggle', async t => {
  const page = await gamePage(t);
  await page.evaluate(() => { __game.load(1); __game.bench(10); });
  await page.locator('#pauseBtn').click();
  assert.equal(await page.evaluate(() => __game.mode), 'paused');
  assert.doesNotMatch(await page.locator('#pauseScreen').textContent(), /الموسيقى/, 'pause screen has no music toggle');

  await frames(page, 4);
  const before = await page.evaluate(() => [__game.draws(), __game.particles()]);
  await frames(page, 25);
  const afterPause = await page.evaluate(() => [__game.draws(), __game.particles()]);
  assert.deepEqual(afterPause, before, 'paused scene neither re-renders nor animates particles');

  await page.setViewportSize({ width: 900, height: 520 });
  await page.waitForFunction(prev => __game.draws() > prev, before[0], { timeout: 10000 });
  await frames(page, 3);
  const afterResize = await page.evaluate(() => __game.draws());
  await frames(page, 20);
  assert.equal(await page.evaluate(() => __game.draws()), afterResize, 'redraws once on resize then freezes again');

  await page.locator('#resumeBtn').click();
  await page.waitForFunction(prev => __game.draws() > prev, afterResize, { timeout: 10000 });
  assert.equal(await page.evaluate(() => __game.mode), 'play');
});

test('Fire & Ice formats boundary times cleanly and supports 1P hero switching and hats wardrobe', async t => {
  const page = await gamePage(t);
  const winTimeText = await page.evaluate(() => {
    __game.load(1);
    __game.bench(4);
    __game.world.t = 59.96;
    __game.win();
    __game.bench(50);
    return document.getElementById('winTime').textContent;
  });
  assert.equal(winTimeText, '1:00.0');

  // 1P hero switch via Tab and Shift
  await page.evaluate(() => { __game.solo(true); __game.load(1); });
  assert.equal(await page.evaluate(() => __game.activeHero), 'fire');
  await page.locator('#game').focus();
  await page.keyboard.press('Tab');
  await page.evaluate(() => __game.bench(1));
  assert.equal(await page.evaluate(() => __game.activeHero), 'ice');
  await page.keyboard.press('ShiftLeft');
  assert.equal(await page.evaluate(() => __game.activeHero), 'fire');

  // Unlock all stars & equip a hat cleanly
  await page.evaluate(() => { __game.unlockAll(); });
  await page.locator('#pauseBtn').click();
  await page.locator('#pauseHomeBtn').click();
  await page.locator('#hatsBtn').click();
  await page.locator('.hat-btn').nth(1).click();
  assert.equal(await page.evaluate(() => __game.save.hat), 'crown');
});

test('Fire & Ice shows Arabic WebGL fallback when WebGL is unavailable', async t => {
  const page = await gamePage(t, () => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return orig.call(this, type, ...args);
    };
  });
  assert.equal(await page.evaluate(() => __game.mode), 'error');
  assert.equal(await page.locator('#scrError').isVisible(), true);
  assert.match(await page.locator('#scrError').textContent(), /الرسوم ثلاثية الأبعاد غير متاحة/);
});
