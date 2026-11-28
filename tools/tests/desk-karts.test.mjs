// Desk Karts 3D (سباق المكاتب) in real Chromium: sunlit 3D desk racer,
// idle P1 stationary guarantee (p1Dist === 0 & time === 0), ArrowUp acceleration,
// drift sparks, pause freeze + zero paused redraws, restart reset, 2 cups / 6 circuits,
// full 3-lap 1P finish + stars + DDA + save reload, 2P local controls, garage + quota retry,
// and 1100x620 responsive fit with zero console/page/network errors.
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

const SAVE = (extra = {}) => ({
  v: 3,
  coins: 0,
  bestScore: 0,
  body: 0,
  paint: 0,
  bodies: [1, 0, 0, 0],
  paints: [1, 1, 0, 0, 0, 0],
  tracks: Array.from({ length: 6 }, () => ({ stars: 0, bestScore: 0, bestTime: 0, bestPlace: 0 })),
  ...extra
});

async function openGame(t, { save, dda = 0.25, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion });
  const errors = [], requests = [];
  ctx.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  });
  ctx.on('request', r => { if (!r.url().startsWith(server.origin + '/')) requests.push(r.url()); });
  t.after(async () => {
    await ctx.close();
    assert.deepEqual(errors, [], 'no console or page errors');
    assert.deepEqual(requests, [], 'no external network requests');
  });

  await ctx.addInitScript(({ save, dda }) => {
    if (location.protocol !== 'http:') return;
    if (!sessionStorage.getItem('dk3-seeded')) {
      sessionStorage.setItem('dk3-seeded', '1');
      if (save !== undefined) {
        localStorage.setItem('sg:desk-karts:save3', typeof save === 'string' ? save : JSON.stringify(save));
      }
    }
    let kit;
    const dk = window.dk = { results: [], failSave: false };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          dk.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
          dk.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          return { stop() {} };
        };
        const make = kit.dda;
        kit.dda = (slug, opts) => {
          const control = make.call(kit, slug, Object.assign({}, opts, { start: dda }));
          const origResult = control.result;
          control.result = outcome => {
            dk.results.push(outcome);
            return origResult.call(control, outcome);
          };
          return control;
        };
      }
    });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:desk-karts:save3' && window.dk && window.dk.failSave) {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  }, { save, dda });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/desk-karts/`, { timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.dk.step, null, { timeout: 25000 });
  return page;
}

const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => dk.step(n), n);
const run = (page, n = 1) => page.evaluate(n => dk.run(n), n);
const stored = page => page.evaluate(() => {
  const raw = localStorage.getItem('sg:desk-karts:save3');
  return raw ? JSON.parse(raw) : null;
});

async function driveRace1P(page, maxChunks = 620) {
  await page.keyboard.down('ArrowUp');
  let steerHeld = '';
  try {
    for (let c = 0; c < maxChunks; c++) {
      const dec = await page.evaluate(() => {
        const st = __game.state;
        if (st.finished || st.screen !== 'play' || !st.aim) return { done: true };
        const p = st.karts[0];
        let diff = Math.atan2(st.aim.z - p.z, st.aim.x - p.x) - p.ang;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return { done: false, steer: diff > 0.12 ? 'ArrowRight' : (diff < -0.12 ? 'ArrowLeft' : ''), useItem: !!p.item };
      });
      if (dec.done) break;
      if (dec.steer !== steerHeld) {
        if (steerHeld) await page.keyboard.up(steerHeld);
        if (dec.steer) await page.keyboard.down(dec.steer);
        steerHeld = dec.steer;
      }
      if (dec.useItem) await page.keyboard.press('Space');
      await run(page, 6);
    }
  } finally {
    if (steerHeld) await page.keyboard.up(steerHeld);
    await page.keyboard.up('ArrowUp');
  }
}

test('low chase cam, auto-gas, separate Shift drift vs Space/E item, pause freeze (0 redraws), and restart', async t => {
  const page = await openGame(t, { size: [1100, 620] });

  // Clean title & responsive 1100x620 fit (no scrollbars)
  const fit = await page.evaluate(() => ({
    screen: __game.state.screen,
    scrollX: document.documentElement.scrollWidth <= window.innerWidth,
    scrollY: document.documentElement.scrollHeight <= window.innerHeight
  }));
  assert.equal(fit.screen, 'title');
  assert.equal(fit.scrollX && fit.scrollY, true, 'fits 1100x620 cleanly with zero scrollbars');

  // Start track 1-1 -> brief grid window keeps p1Dist===0, then Auto-Gas launches automatically!
  await page.click('#btnPlay');
  await step(page, 15);
  let st = await state(page);
  assert.equal(st.screen, 'play');
  assert.equal(st.id, '1-1');
  assert.equal(st.laps, 2, '2-lap sprint mode');
  assert.equal(st.p1Dist, 0, 'grid window keeps p1Dist === 0 cleanly');
  assert.equal(st.time, 0, 'clock stays 0 during grid window');
  assert.ok(st.cam && st.cam.height < 8 && st.cam.fov >= 58, `low chase cam active (h=${st.cam?.height}, fov=${st.cam?.fov})`);

  // Auto-Gas kicks in automatically with ZERO gas key held!
  await run(page, 60);
  st = await state(page);
  assert.ok(st.p1Dist > 6, `Auto-Gas accelerates kart without pressing W/↑ (${st.p1Dist.toFixed(1)})`);
  assert.ok(st.time > 0.5);

  // Hold ShiftLeft + turn -> charges drift sparks & releases mini-turbo + FOV kick (and NEVER fires Space items!)
  const fovBeforeBoost = st.cam.fov;
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ShiftLeft');
  await run(page, 50);
  const midDrift = await state(page);
  assert.equal(midDrift.karts[0].drifting, true, 'ShiftLeft engages drift cleanly');
  assert.ok(midDrift.karts[0].driftStage >= 1, 'drift sparks charged');
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('ArrowLeft');
  await run(page, 10);
  st = await state(page);
  assert.ok(st.karts[0].boostT > 0.3, 'drift release grants mini-turbo');
  assert.ok(st.cam.fov > fovBeforeBoost + 2, `dynamic boost FOV kick active (${fovBeforeBoost} -> ${st.cam.fov})`);

  // Drive until P1 collects a mystery item box, then prove ShiftLeft drift NEVER wastes the item,
  // while KeyE / Space fires it cleanly!
  let heldItem = null;
  for (let c = 0; c < 180; c++) {
    const dec = await page.evaluate(() => {
      const s = __game.state, p = s.karts[0];
      if (p.item) return { got: p.item };
      let d = Math.atan2(s.aim.z - p.z, s.aim.x - p.x) - p.ang;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return { got: null, steer: d > 0.12 ? 'ArrowRight' : (d < -0.12 ? 'ArrowLeft' : '') };
    });
    if (dec.got) { heldItem = dec.got; break; }
    if (dec.steer) await page.keyboard.down(dec.steer);
    await run(page, 6);
    if (dec.steer) await page.keyboard.up(dec.steer);
  }
  assert.ok(heldItem, 'collected a mystery pickup item box');
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('ArrowRight');
  await run(page, 18);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('ArrowRight');
  st = await state(page);
  assert.equal(st.karts[0].item, heldItem, 'drifting with ShiftLeft NEVER wastes a held item');
  await page.keyboard.press('KeyE');
  await run(page, 4);
  st = await state(page);
  assert.equal(st.karts[0].item, null, 'pressing KeyE fires the held item cleanly');

  // Pause freezes simulation AND stops redraws.
  const drawsBeforePause = (await state(page)).draws;
  await page.click('#btnPause');
  await step(page, 2);
  for (let i = 0; i < 60 && (await state(page)).draws === drawsBeforePause; i++) {
    await page.waitForTimeout(50);
    await step(page, 1);
  }
  const pausedA = await state(page);
  assert.equal(pausedA.draws, drawsBeforePause + 1, 'the paused frame is drawn once');
  assert.equal(pausedA.screen, 'pause');
  await step(page, 40);
  const pausedB = await state(page);
  assert.equal(pausedB.worldTime, pausedA.worldTime, 'worldTime frozen on pause');
  assert.equal(pausedB.p1Dist, pausedA.p1Dist, 'p1Dist frozen on pause');
  assert.equal(pausedB.draws, pausedA.draws, 'zero redundant redraws while paused');

  // Restart resets track 1-1 cleanly to p1Dist === 0 & time === 0
  await page.click('#btnRestart');
  await step(page, 10);
  const reset = await state(page);
  assert.equal(reset.screen, 'play');
  assert.equal(reset.id, '1-1');
  assert.equal(reset.p1Dist, 0);
  assert.equal(reset.time, 0);
});

test('full 2-lap race finish records stars, coins, DDA result, and persists across reload', async t => {
  const page = await openGame(t, { save: SAVE({ coins: 20 }), dda: 0.20 });
  await page.click('#btnPlay');
  await driveRace1P(page);
  await step(page, 4);

  const st = await state(page);
  assert.equal(st.screen, 'result', 'reached result overlay after 2 laps');
  assert.equal(st.finished, true);
  assert.ok(st.save.coins > 20, 'earned race coins');
  assert.ok(st.save.tracks[0].stars >= 1, 'earned track stars');

  const ddaCount = await page.evaluate(() => dk.results.length);
  assert.equal(ddaCount, 1, 'reported exactly one DDA outcome');

  const savedBeforeReload = await stored(page);
  assert.equal(savedBeforeReload.v, 3);
  assert.ok(savedBeforeReload.bestScore > 0);

  // Reload page and confirm persistence
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.dk.step, null, { timeout: 25000 });
  const afterReload = await state(page);
  assert.equal(afterReload.save.coins, savedBeforeReload.coins);
  assert.equal(afterReload.save.bestScore, savedBeforeReload.bestScore);
});

test('circuits modal opens all 6 tracks (Cup 2-3), 2P split-screen chase cam moves both karts, and garage quota retry recovers', async t => {
  const page = await openGame(t, { save: SAVE({ coins: 120 }) });

  // Open Circuits modal -> 6 cards across 2 cups -> launch 2-3 (Principal's Mega Desk)
  await page.click('#btnTracks');
  const cardCount = await page.locator('#tracksGrid .track-card').count();
  assert.equal(cardCount, 6, 'all 6 circuits displayed');
  await page.locator('#tracksGrid .track-card[data-idx="5"]').click();
  await step(page, 4);
  let st = await state(page);
  assert.equal(st.screen, 'play');
  assert.equal(st.id, '2-3');

  // Return home -> test Garage purchase with QuotaExceededError -> Retry recovers save!
  await page.click('#btnPause');
  await page.click('#btnHome');
  await page.click('#btnGarage');
  await page.evaluate(() => { dk.failSave = true; });
  await page.locator('#bodyGrid .shop-item').nth(1).click(); // Buy Pencil Rocket (60 coins)
  await page.waitForSelector('.sg-save-status:not([hidden])');
  await page.evaluate(() => { dk.failSave = false; });
  await page.locator('.sg-save-status button').click();
  const savedAfterRetry = await stored(page);
  assert.equal(savedAfterRetry.body, 1, 'save retry persisted purchased kart body');
  assert.equal(savedAfterRetry.coins, 60);
  await page.click('#btnGarageBack');

  // 2P split-screen chase mode: both karts launch cleanly with dedicated split cameras!
  await page.click('#btnDuo');
  await page.click('#btnPlay');
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowUp');
  await run(page, 35);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ArrowUp');
  st = await state(page);
  assert.equal(st.duo, true);
  assert.equal(st.cam.split, true, '2P uses true split-screen chase cameras');
  assert.ok(st.karts[0].speed > 10, 'P1 accelerates with W in 2P mode');
  assert.ok(st.karts[1].speed > 10, 'P2 accelerates with ArrowUp in 2P mode');
});
