// Block World — TNT Mine Dash persistence & Kit.saveStatus retry tests in real Chromium.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
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

async function game(t, init) {
  const context = await browser.newContext();
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit;
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (u, r) => {
          window.stepGame = (n = 1) => { for (let i = 0; i < n; i++) u(1 / 60); if (r) r(0); };
          return { stop() {} };
        };
      }
    });
  });
  if (init) await page.addInitScript(init);
  await page.goto(`${origin}/games/block-world/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}

async function exhaustStorage(page, reserve = 0) {
  return page.evaluate(slack => {
    let lo = 0, hi = 10 * 1024 * 1024;
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      try { localStorage.setItem('quota-fixture', 'x'.repeat(mid)); lo = mid; } catch { hi = mid; }
    }
    localStorage.setItem('quota-fixture', 'x'.repeat(Math.max(0, lo - slack)));
    return lo;
  }, reserve);
}

test('real quota failure shows Kit.saveStatus failed banner, preserves prior save, and retry succeeds', async t => {
  const page = await game(t);
  await page.locator('#playBtn').click();
  await page.evaluate(() => { __game.saveData.gems = 120; __game.save(); });
  const before = await page.evaluate(() => localStorage.getItem('sg:block-world:save'));
  assert.ok(before && before.length < 4096, 'compact RLE save < 4 KB');

  await exhaustStorage(page);
  const failedSave = await page.evaluate(() => {
    __game.saveData.gems = 340123456;
    // Also alter alternating tiles so the serialized RLE grows past the full quota.
    const w = __game.G.world;
    for (let x = 2; x < 30; x += 2) w.set(x, 6, BW.T.DIAMOND);
    return { ok: __game.save(), error: __game.G.saveError, flash: __game.G.savedFlash };
  });
  assert.deepEqual(failedSave, { ok: false, error: 'save', flash: 0 });
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:block-world:save')), before, 'prior stored save preserved on quota failure');

  await page.evaluate(() => localStorage.removeItem('quota-fixture'));
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.evaluate(() => __game.G.saveError), null);
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').isVisible(), true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:block-world:save')).gems), 340123456);
});

test('a failed pointer retry returns keyboard control to gameplay while keyboard retry retains focus', async t => {
  const page = await game(t, () => {
    Storage.prototype.setItem = function () { throw new DOMException('blocked', 'SecurityError'); };
  });
  await page.locator('#playBtn').click();
  await page.evaluate(() => __game.save());
  const retryBtn = page.locator('.sg-save-status button');
  assert.equal(await retryBtn.isVisible(), true);

  await retryBtn.click();
  assert.equal(await page.evaluate(() => __game.G.saveError), 'save');
  await page.keyboard.down('KeyD');
  assert.equal(await page.evaluate(() => Kit.keys.down('KeyD')), true);
  await page.keyboard.up('KeyD');

  await retryBtn.focus();
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.sg-save-status button')), true);

  await retryBtn.click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => stepGame());
  assert.equal(await page.evaluate(() => __game.G.mode), 'pause');
});

test('gems, wins, stars, and upgrades survive full reload; corrupt or legacy storage loads safely', async t => {
  for (const raw of ['5', '{"bad":true}', JSON.stringify({ totalStars: 14, slots: 'corrupt' })]) {
    const page = await game(t, `localStorage.setItem('sg:block-world:save', ${JSON.stringify(raw)})`);
    assert.equal(await page.evaluate(() => __game.G.mode), 'title');
    await page.locator('#playBtn').click();
    assert.equal(await page.evaluate(() => __game.save()), true);
  }

  const page = await game(t);
  await page.locator('#playBtn').click();
  await page.evaluate(() => {
    __game.saveData.gems = 300;
    __game.buyUpgrade('drill');
    __game.buyUpgrade('jetpack');
  });
  await page.reload();
  await page.waitForFunction(() => window.__game);
  const loaded = await page.evaluate(() => ({
    drill: __game.saveData.upgrades.drill,
    jetpack: __game.saveData.upgrades.jetpack,
    gems: __game.saveData.gems
  }));
  assert.deepEqual(loaded, { drill: 2, jetpack: 2, gems: 155 });
});
