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
  browser = await launchChromium({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
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

test('title demo, idle P1 stationary guarantee, ArrowUp launch, drift boost, pause freeze (0 redraws), and restart', async t => {
  const page = await openGame(t, { size: [1100, 620] });

  // Clean title & responsive 1100x620 fit (no scrollbars)
  const fit = await page.evaluate(() => ({
    screen: __game.state.screen,
    scrollX: document.documentElement.scrollWidth <= window.innerWidth,
    scrollY: document.documentElement.scrollHeight <= window.innerHeight
  }));
  assert.equal(fit.screen, 'title');
  assert.equal(fit.scrollX && fit.scrollY, true, 'fits 1100x620 cleanly with zero scrollbars');

  // Start track 1-1 -> stays stationary until player presses gas
  await page.click('#btnPlay');
  await step(page, 30);
  let st = await state(page);
  assert.equal(st.screen, 'play');
  assert.equal(st.id, '1-1');
  assert.equal(st.p1Dist, 0, 'P1 remains stationary with no input');
  assert.equal(st.time, 0, 'clock stays 0 until launch');

  // Hold ArrowUp -> accelerates cleanly
  await page.keyboard.down('ArrowUp');
  await run(page, 40);
  st = await state(page);
  assert.ok(st.p1Dist > 6, `ArrowUp moves kart forward (${st.p1Dist.toFixed(1)})`);
  assert.ok(st.time > 0.5);

  // Hold drift + turn -> charges drift sparks & releases mini-turbo
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('Space');
  await run(page, 50);
  const midDrift = await state(page);
  assert.equal(midDrift.karts[0].drifting, true, 'drift engaged');
  assert.ok(midDrift.karts[0].driftStage >= 1, 'drift sparks charged');
  await page.keyboard.up('Space');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  await step(page, 2);
  st = await state(page);
  assert.ok(st.karts[0].boostT > 0.3, 'drift release grants mini-turbo');

  // Pause freezes simulation AND stops redraws. With software WebGL the one paused frame
  // waits for the GPU fence and its pacing in real time (art.js mayDraw), so let it land first.
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

test('full 3-lap race finish records stars, coins, DDA result, and persists across reload', async t => {
  const page = await openGame(t, { save: SAVE({ coins: 20 }), dda: 0.20 });
  await page.click('#btnPlay');
  await driveRace1P(page);
  await step(page, 4);

  const st = await state(page);
  assert.equal(st.screen, 'result', 'reached result overlay after 3 laps');
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

test('circuits modal opens all 6 tracks (Cup 2-3), 2P local controls move both karts, and garage quota retry recovers', async t => {
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

  // 2P local mode: W moves P1, ArrowUp moves P2
  await page.click('#btnDuo');
  await page.click('#btnPlay');
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowUp');
  await run(page, 35);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ArrowUp');
  st = await state(page);
  assert.equal(st.duo, true);
  assert.ok(st.karts[0].speed > 10, 'P1 accelerates with W in 2P mode');
  assert.ok(st.karts[1].speed > 10, 'P2 accelerates with ArrowUp in 2P mode');
});
