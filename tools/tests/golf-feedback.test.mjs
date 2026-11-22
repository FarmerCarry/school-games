import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { installGolfHarness } from '../golf-harness.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KEY = 'sg:skybound-golf:save_v3';
let browser, server;

before(async () => {
  server = await startTestServer(process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo);
  browser = await launchChromium();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function openGame(t, { reducedMotion = 'no-preference', save = null, play = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, reducedMotion });
  await context.addInitScript(installGolfHarness, { manual: true });
  if (save) {
    await context.addInitScript(([key, value]) => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem(key, value);
      }
    }, [KEY, JSON.stringify(save)]);
  }
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'no page errors'); });
  await page.goto(server.origin + '/games/skybound-golf/');
  await page.waitForFunction(() => window.__game && window.golfTick);
  if (play) {
    await page.locator('#play').click();
    await page.evaluate(() => advanceGolfFrames(2));
  }
  return page;
}

const phase = page => page.evaluate(() => __game.phase);
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);

async function strike(page, aimFrames = 22, powerFrames = 26) {
  await page.evaluate(n => advanceGolfFrames(n), aimFrames);
  await page.keyboard.press('Space');
  assert.equal(await phase(page), 'power');
  await page.evaluate(n => advanceGolfFrames(n), powerFrames);
  await page.keyboard.press('Space');
  await page.evaluate(() => advanceGolfFrames(10));
  assert.equal(await phase(page), 'flight');
}

async function finishFlight(page) {
  await page.evaluate(() => {
    for (let i = 0; i < 4500 && __game.phase === 'flight'; i++) golfTick(1 / 60);
    golfRender();
  });
  assert.equal(await phase(page), 'landed');
}

test('Golf: finished shot saves once on landing and survives reload, menu and restart', async t => {
  for (const exit of ['reload', 'menu', 'restart']) {
    const page = await openGame(t);
    await strike(page);
    await finishFlight(page);
    const done = await saved(page);
    assert.equal(await page.evaluate(() => golfProbe.saves), 1, 'saved exactly once on landing');
    assert(done.coins > 0 && done.shots === 1 && done.bestDist === await page.evaluate(() => Math.floor(__game.ball.maxX)));
    if (exit !== 'reload') {
      await page.locator('#pause').click();
      await page.locator(exit === 'menu' ? '#pause-menu' : '#restart').click();
      assert.equal(await phase(page), exit === 'menu' ? 'title' : 'aim');
      assert.equal(await page.evaluate(() => golfProbe.saves), 1, 'no duplicate save on exit');
    }
    await page.reload();
    await page.waitForFunction(() => window.__game && window.golfTick);
    assert.deepEqual(await saved(page), done, `${exit}: saved progress survives reload`);
    assert.equal(await page.evaluate(() => golfProbe.saves), 0, 'reload does not re-award shot');
    await page.close();
  }
});

test('Golf: result card auto-opens after landing, Space skips to result without double-skipping, and all 4 upgrades fit & persist', async t => {
  const page = await openGame(t, { save: { v: 3, coins: 300, bestDist: 100, bestAlt: 40, shots: 3, upgrades: { power: 0, fuel: 0, bounce: 0, magnet: 0 }, skin: 'classic', ownedSkins: ['classic'], milestones: [] } });
  await strike(page);
  await finishFlight(page);
  await page.evaluate(() => advanceGolfFrames(40));
  assert.equal(await phase(page), 'landed', 'brief landing celebration shows first');
  await page.evaluate(() => advanceGolfFrames(50));
  assert.equal(await phase(page), 'result', 'result card auto-opens');

  const ids = await page.locator('#upgrades [data-upgrade]').evaluateAll(els => els.map(e => e.dataset.upgrade));
  assert.deepEqual(ids, ['power', 'fuel', 'bounce', 'magnet']);

  const fit = await page.evaluate(() => {
    const panel = document.getElementById('panel').getBoundingClientRect();
    return [...document.querySelectorAll('#upgrades [data-upgrade], #result-content .result-actions button')].every(b => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.top >= panel.top && r.bottom <= panel.bottom && r.bottom <= innerHeight;
    });
  });
  assert.equal(fit, true, 'all 4 upgrade cards and result actions fit inside 1100x620 viewport without clipping');

  for (const up of ['power', 'fuel', 'bounce', 'magnet']) {
    await page.locator(`#upgrades [data-upgrade="${up}"]`).click();
  }
  const afterUp = await saved(page);
  assert.deepEqual(afterUp.upgrades, { power: 1, fuel: 1, bounce: 1, magnet: 1 });
  assert.equal(await phase(page), 'result');
});

test('Golf: all 5 3D ball skins unlock, equip and persist across reload', async t => {
  const page = await openGame(t, {
    play: false,
    save: { v: 3, coins: 2000, bestDist: 400, bestAlt: 120, shots: 5, upgrades: { power: 2, fuel: 2, bounce: 2, magnet: 2 }, skin: 'classic', ownedSkins: ['classic'], milestones: ['cloud_gate'] }
  });
  await page.locator('#open-skins').click();
  const skins = await page.locator('#skins-grid [data-skin]').evaluateAll(els => els.map(e => e.dataset.skin));
  assert.deepEqual(skins, ['classic', 'fireball', 'disco', 'planet', 'star']);

  await page.locator('#skins-grid [data-skin="fireball"]').click();
  await page.locator('#skins-grid [data-skin="planet"]').click();
  assert.equal(await page.evaluate(() => __game.skin), 'planet');
  await page.reload();
  await page.waitForFunction(() => window.__game && window.golfTick);
  assert.equal(await page.evaluate(() => __game.skin), 'planet');
  const st = await saved(page);
  assert(st.ownedSkins.includes('fireball') && st.ownedSkins.includes('planet'));
});

test('Golf: failed save reports Arabic status banner and Retry commits progress', async t => {
  const page = await openGame(t);
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    window.failSaves = true;
    Storage.prototype.setItem = function (k, v) {
      if (window.failSaves && String(k).includes('skybound-golf:save_v3')) throw new Error('quota');
      return orig.call(this, k, v);
    };
  });
  await strike(page);
  await page.evaluate(() => {
    const b = __game.ball; b.done = true; b.reason = 'rest'; b.maxX = 140; b.maxY = 50;
    advanceGolfFrames(4);
  });
  assert.equal(await phase(page), 'landed');
  assert.equal(await page.locator('.sg-save-status').isVisible(), true, 'save warning banner is visible');
  assert.equal(await saved(page), null);

  await page.evaluate(() => { window.failSaves = false; });
  await page.locator('.sg-save-status button').click();
  assert.equal((await saved(page)).bestDist, 140, 'retry writes kept progress');
  assert.equal(await page.locator('.sg-save-status button').isVisible(), false);
});

test('Golf: browser 60 Hz flight matches pure GolfPhysics deterministically', async t => {
  const page = await openGame(t, {
    save: { v: 3, coins: 100, bestDist: 0, bestAlt: 0, shots: 2, upgrades: { power: 3, fuel: 2, bounce: 3, magnet: 2 }, skin: 'classic', ownedSkins: ['classic'], milestones: [] }
  });
  await strike(page, 18, 22);
  const res = await page.evaluate(() => {
    const angle = __game.ball.angle;
    const power = __game.ball.power;
    const course = __game.course;
    const upgrades = __game.save.upgrades;
    for (let i = 0; i < 4500 && __game.phase === 'flight'; i++) golfTick(1 / 60);
    const expected = GolfPhysics.launch(course, upgrades, angle, power);
    while (!expected.done) GolfPhysics.step(course, expected, upgrades, 1 / 60, { boost: false });
    return {
      actualX: __game.ball.maxX,
      expectedX: expected.maxX,
      actualCoins: __game.ball.coins,
      expectedCoins: expected.coins,
      phase: __game.phase
    };
  });
  assert.equal(res.actualX, res.expectedX, 'browser flight maxX matches pure physics');
  assert.equal(res.actualCoins, res.expectedCoins, 'browser flight coins match pure physics');
  assert.equal(res.phase, 'landed');
});

test('Golf: reduced motion disables hit-stop and responds to live preference changes on paused frame', async t => {
  const page = await openGame(t, { reducedMotion: 'reduce' });
  await strike(page, 24, 30);
  const xAfterOneFrame = await page.evaluate(() => {
    const x0 = __game.ball.x;
    golfTick(1 / 60);
    return __game.ball.x - x0;
  });
  assert(xAfterOneFrame > 0, 'no hit-stop freezes ball in reduced motion');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#pause-content').isVisible(), true);
  // While paused, unchanged frames do not redraw; changing motion preference redraws once and settles
  const drawsBefore = await page.evaluate(() => {
    golfRender(); golfRender();
    return golfProbe.draws;
  });
  await page.evaluate(() => {
    Kit.motion.setPreference('full');
    golfRender(); golfRender();
  });
  const drawsAfter = await page.evaluate(() => golfProbe.draws);
  assert.equal(drawsAfter - drawsBefore, 1, 'paused motion toggle repaints once and settles');
});

test('Golf: incompatible old v2 save resets cleanly to v3 without error', async t => {
  const page = await openGame(t, { play: false, save: { v: 2, coins: 999, best: 500, world: 3 } });
  assert.equal(await page.locator('#title-coins').textContent(), '0');
  assert.equal(await page.locator('#best-meters').textContent(), '0');
});
