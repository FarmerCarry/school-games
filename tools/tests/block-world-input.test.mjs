// Block World — TNT Mine Dash browser input & gameplay loop tests in real Chromium:
// 1-click launch over live mine, Auto-Drill + Jetpack movement, Space & button TNT 3x3 crater,
// 3-Relic + Escape Portal Victory Card + 1-click Upgrades, and Free Sandbox toggle!
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

async function openMine(t) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 } });
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
  await page.goto(`${origin}/games/block-world/`);
  await page.waitForFunction(() => window.__game && window.stepGame);
  return page;
}

test('1-click Play drops immediately underground; Auto-Drill + Jetpack + TNT blast work cleanly', async t => {
  const page = await openMine(t);
  assert.equal(await page.evaluate(() => __game.G.mode), 'title');
  assert.ok(await page.locator('#playBtn').isVisible());

  // Single click launches straight into active play (zero 2nd modal!)
  await page.locator('#playBtn').click();
  await page.evaluate(() => stepGame(4));
  assert.equal(await page.evaluate(() => __game.G.mode), 'play');
  assert.ok(await page.locator('#tntBtn').isVisible());

  // Place gold right beside miner and hold ArrowRight to auto-drill through it!
  const beforeX = await page.evaluate(() => {
    const w = __game.G.world, p = w.p;
    stepGame(20); // let miner settle cleanly on starter floor
    const tx = Math.floor(p.x) + 1, ty = Math.floor(p.y);
    w.set(tx, ty, BW.T.GOLD);
    window.__testGold = [tx, ty];
    return p.x;
  });
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => stepGame(80));
  await page.keyboard.up('ArrowRight');
  const drillRes = await page.evaluate(() => {
    const [tx, ty] = window.__testGold;
    return { x: __game.player.x, y: __game.player.y, tx, ty, tile: __game.G.world.get(tx, ty), dmg: __game.G.world.dmg[ty * BW.W + tx], gems: __game.G.world.gemsRun };
  });
  assert.equal(drillRes.tile, 0, 'ArrowRight auto-drills right through gold block: ' + JSON.stringify(drillRes));
  assert.ok(drillRes.x > beforeX + 0.4, 'miner advances right');
  assert.ok(drillRes.gems > 0, 'magnetized gems collected');

  // Press Space to plant TNT and blast a 3x3 crater!
  const blastRes = await page.evaluate(() => {
    const w = __game.G.world, p = w.p;
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    w.set(cx, cy + 1, BW.T.DIAMOND);
    w.set(cx + 1, cy + 1, BW.T.RUBY);
    window.__blastSpot = [cx, cy + 1];
    return w.blasts;
  });
  await page.keyboard.press('Space');
  await page.evaluate(() => stepGame(85));
  const afterBlast = await page.evaluate(() => {
    const [bx, by] = window.__blastSpot;
    return { blasts: __game.G.world.blasts, crater: __game.G.world.get(bx, by) === 0, gems: __game.G.world.gemsRun };
  });
  assert.equal(afterBlast.blasts, blastRes + 1, 'Space plants & detonates TNT');
  assert.equal(afterBlast.crater, true, 'TNT blasts 3x3 diamond/ruby crater');
  assert.ok(afterBlast.gems > drillRes.gems, 'blasted ore gems magnetize into miner');
});

test('collecting 3 Relics & escaping shows Result Card with 1-click Upgrades that persist', async t => {
  const page = await openMine(t);
  await page.locator('#playBtn').click();
  await page.evaluate(() => {
    const w = __game.G.world;
    w.gemsRun = 150;
    for (const r of w.relics) {
      w.p.x = r.x; w.p.y = r.y;
      stepGame(8); // advance past joyful 55ms relic hitstop!
    }
    const pt = w.portals.find(p => p.active);
    w.p.x = pt.x; w.p.y = pt.y;
    stepGame(8);
  });
  assert.equal(await page.evaluate(() => __game.G.mode), 'result');
  assert.ok(await page.locator('#result').isVisible());
  assert.ok(await page.locator('#upgradeGrid .up-card[data-upgrade="tnt"]').isVisible());

  const beforeLv = await page.evaluate(() => __game.saveData.upgrades.tnt);
  await page.locator('#upgradeGrid .up-card[data-upgrade="tnt"]').click();
  const afterUp = await page.evaluate(() => ({
    lv: __game.saveData.upgrades.tnt,
    stored: JSON.parse(localStorage.getItem('sg:block-world:save')).upgrades.tnt
  }));
  assert.equal(afterUp.lv, beforeLv + 1, '1-click upgrade on Result Card levels up Mega-TNT');
  assert.equal(afterUp.stored, beforeLv + 1, 'upgrade saved to localStorage');

  // 1-click Play Again launches immediately!
  await page.locator('#againBtn').click();
  await page.evaluate(() => stepGame(2));
  assert.equal(await page.evaluate(() => __game.G.mode), 'play');
  assert.equal(await page.evaluate(() => __game.G.world.stats.tntMax), 4, 'upgraded Mega-TNT applies immediately');
});

test('optional Free Sandbox mode (#modeFree) toggles infinite time and quick-build bar', async t => {
  const page = await openMine(t);
  await page.locator('#modeFree').click();
  await page.locator('#playBtn').click();
  await page.evaluate(() => stepGame(2));
  assert.equal(await page.evaluate(() => __game.G.gm), 'free');
  assert.equal(await page.evaluate(() => __game.G.world.freeMode), true);
  assert.ok(await page.locator('#sandboxBar').isVisible(), '4-block quick-build bar visible in Free Sandbox');

  await page.keyboard.press('Digit3');
  await page.evaluate(() => stepGame(2));
  assert.equal(await page.evaluate(() => __game.G.world.selBlock), 2, 'Digit3 selects Crystal block');
});
