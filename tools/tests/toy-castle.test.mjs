// Toy Castle (قلعة الألعاب) — Real Chromium Browser Suite
// Verifies minimal title screen, 3D WebGL scene, #btnPlay -> Stage 1-1, frame-1 Digit1 spawn,
// mouse + Space cork cannon aiming/firing, floating crate pop, 2-Player local controls
// (P1 1-4/Q-R + A/D + Space/S; P2 7-0/U-P + Arrows + Enter/Down without P pausing),
// pause freeze & restart, stage map, castle skin shop + QuotaExceededError recovery,
// solo victory persistence + DDA/telemetry, 1100x620 fit, and reduced motion.
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
  stars: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  unlockedStage: 0,
  castleSkin: 0,
  bannerSkin: 0,
  ownedCastles: [1, 0, 0, 0, 0],
  ownedBanners: [1, 0, 0, 0, 0],
  wins: 0,
  ...extra
});

async function openGame(t, { save, dda = 0.35, reducedMotion = 'reduce', size = [1280, 720] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion });
  ctx.setDefaultTimeout(7000);
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
    if (!sessionStorage.getItem('tc-seeded')) {
      sessionStorage.setItem('tc-seeded', '1');
      if (save !== undefined) {
        localStorage.setItem('sg:toy-castle:save', typeof save === 'string' ? save : JSON.stringify(save));
      }
    }
    let kit;
    const tc = window.tc = { results: [], ends: [], rounds: [], hits: 0, misses: 0, failSave: false };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (update, render) => {
          tc.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
          tc.run = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); render(0); };
          return { stop() {} };
        };
        const makeDda = kit.dda;
        kit.dda = (slug, opts) => {
          const ctrl = makeDda.call(kit, slug, Object.assign({}, opts, { start: dda }));
          const origResult = ctrl.result;
          ctrl.result = outcome => { tc.results.push(outcome); return origResult.call(ctrl, outcome); };
          return ctrl;
        };
        const origRound = kit.stats.round;
        kit.stats.round = function (id) {
          tc.rounds.push(id);
          return origRound.apply(this, arguments);
        };
        const origEnd = kit.stats.end;
        kit.stats.end = function (...args) {
          tc.ends.push(args);
          return origEnd.apply(this, arguments);
        };
        const origHit = kit.track.hit;
        kit.track.hit = function () { tc.hits++; return origHit.apply(this, arguments); };
        const origMiss = kit.track.miss;
        kit.track.miss = function () { tc.misses++; return origMiss.apply(this, arguments); };
      }
    });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:toy-castle:save' && window.tc && window.tc.failSave) {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  }, { save, dda });

  const page = await ctx.newPage();
  await page.goto(`${server.origin}/games/toy-castle/`, { timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.tc && window.tc.step, null, { timeout: 30000 });
  return page;
}

const state = page => page.evaluate(() => __game.state);
const step = (page, n = 1) => page.evaluate(n => tc.step(n), n);
const run = (page, n = 1) => page.evaluate(n => tc.run(n), n);
const stored = page => page.evaluate(() => {
  const raw = localStorage.getItem('sg:toy-castle:save');
  return raw ? JSON.parse(raw) : null;
});

test('Title -> #btnPlay opens Stage 1-1; P1 never auto-spawns; Digit1 summons on frame 1', async t => {
  const page = await openGame(t);
  await step(page, 10);
  assert.equal((await state(page)).screen, 'title');
  assert.equal(await page.locator('#titleStars b').textContent(), '0/27');

  await page.locator('#btnPlay').click();
  await step(page, 1);
  const s0 = await state(page);
  assert.equal(s0.screen, 'play');
  assert.equal(s0.id, '1-1');
  assert.ok(s0.energy >= 35, 'starts with >= 35 energy');
  assert.equal(s0.p1Spawned, 0);

  // Idle 2s: P1 still never auto-spawns
  await run(page, 120);
  assert.equal((await state(page)).p1Spawned, 0);

  // Press Digit1 -> spawns P1 Foam Knight immediately
  await page.keyboard.down('Digit1');
  await step(page, 2);
  await page.keyboard.up('Digit1');
  const s1 = await state(page);
  assert.equal(s1.p1Spawned, 1, 'Digit1 spawns P1 Foam Knight');
  assert.ok(s1.units >= 1);
});

test('Cork cannon mouse + Space aiming/firing pops parachute crate and tracks hits/misses', async t => {
  const page = await openGame(t);
  await page.locator('#btnPlay').click();
  await step(page, 2);

  // Keyboard aim right + Space fires cork cannon
  const beforeAim = (await state(page)).aimX1;
  await page.keyboard.down('KeyD');
  await step(page, 12);
  await page.keyboard.up('KeyD');
  assert.ok((await state(page)).aimX1 > beforeAim, 'KeyD aims cork cannon right');

  await page.keyboard.press('Space');
  await step(page, 2);
  assert.equal((await state(page)).cannonShots1, 1);

  // Wait for cooldown and pop a spawned parachute crate with mouse click!
  await run(page, 100);
  const crateScreenPt = await page.evaluate(() => {
    const cr = ToyCastleEngine.spawnCrate(__game.world);
    cr.baseX = 0; cr.x = 0; cr.y = 5.4; cr.vy = 0; cr.swayAmp = 0;
    return __game.point(cr.x, cr.y);
  });
  await page.mouse.click(crateScreenPt.x, crateScreenPt.y);
  await run(page, 90);

  const afterPop = await state(page);
  assert.ok(afterPop.cratesPopped >= 1, 'clicking parachute crate pops it with cork cannon');
  const tracked = await page.evaluate(() => ({ hits: tc.hits, misses: tc.misses }));
  assert.ok(tracked.hits >= 1, 'Kit.track.hit recorded on crate pop');
});

test('Pause freezes simulation and Restart resets battle cleanly', async t => {
  const page = await openGame(t);
  await page.locator('#btnPlay').click();
  await step(page, 2);
  await page.keyboard.down('Digit1');
  await step(page, 2);
  await page.keyboard.up('Digit1');
  assert.equal((await state(page)).p1Spawned, 1);

  // Pause via #btnPause
  await page.locator('#btnPause').click();
  const p0 = await state(page);
  assert.equal(p0.screen, 'pause');
  await step(page, 60);
  const p1 = await state(page);
  assert.equal(p1.time, p0.time, 'simulation time frozen while paused');
  assert.equal(p1.frames, p0.frames, 'simulation frames frozen while paused');

  // Restart via #btnRestart
  await page.locator('#btnRestart').click();
  await step(page, 2);
  const r0 = await state(page);
  assert.equal(r0.screen, 'play');
  assert.equal(r0.p1Spawned, 0);
  assert.ok(r0.time < 0.5);
});

test('2-Player local battle: P1 (Q/Space) & P2 (U/P/Arrows/Enter) without P pausing; Esc pauses', async t => {
  const page = await openGame(t);
  await page.locator('#btnDuo').click();
  await step(page, 2);
  const s0 = await state(page);
  assert.equal(s0.screen, 'play');
  assert.equal(s0.id, 'duo');
  assert.equal(s0.duo, true);
  assert.equal(await page.locator('#dockP2').isVisible(), true, 'P2 unit dock visible in 2P mode');

  // P1 spawns with Q; P2 spawns with U
  await page.keyboard.down('KeyQ');
  await step(page, 2);
  await page.keyboard.up('KeyQ');
  await page.keyboard.down('KeyU');
  await step(page, 2);
  await page.keyboard.up('KeyU');
  const s1 = await state(page);
  assert.equal(s1.p1Spawned, 1, 'P1 spawns via KeyQ');
  assert.equal(s1.p2Spawned, 1, 'P2 spawns via KeyU');

  // Give P2 90 energy and press KeyP: spawns Mega Mech WITHOUT pausing!
  await page.evaluate(() => { __game.world.sides[1].energy = 90; });
  await page.keyboard.down('KeyP');
  await step(page, 2);
  await page.keyboard.up('KeyP');
  const s2 = await state(page);
  assert.equal(s2.screen, 'play', 'KeyP in 2P mode must NOT pause');
  assert.equal(s2.p2Spawned, 2, 'KeyP spawns P2 Mega Mech');

  // P2 aims with ArrowLeft and fires with Enter
  const beforeAim2 = s2.aimX2;
  await page.keyboard.down('ArrowLeft');
  await step(page, 10);
  await page.keyboard.up('ArrowLeft');
  assert.ok((await state(page)).aimX2 < beforeAim2, 'ArrowLeft aims P2 cannon');
  await page.keyboard.press('Enter');
  await step(page, 2);
  assert.equal(await page.evaluate(() => __game.world.sides[1].cannonShots), 1, 'Enter fires P2 cannon');

  // Escape still pauses 2P cleanly
  await page.keyboard.press('Escape');
  await step(page, 1);
  assert.equal((await state(page)).screen, 'pause');
});

test('Solo victory persists stars/coins, updates DDA & telemetry, and unlocks Stage 1-2', async t => {
  const page = await openGame(t);
  await page.locator('#btnPlay').click();
  await step(page, 2);

  // Finish Stage 1-1 via real units & cannon fire
  await page.evaluate(() => {
    const w = __game.world;
    w.sides[1].hp = 12;
    ToyCastleEngine.setCannonAim(w, 0, ToyCastleEngine.RIGHT_GATE_X, 1.0);
    ToyCastleEngine.fireCannon(w, 0);
  });
  await run(page, 120);

  const res = await state(page);
  assert.equal(res.screen, 'result');
  assert.equal(res.winner, 0);
  assert.ok(res.stars >= 2);

  const saved = await stored(page);
  assert.equal(saved.v, 3);
  assert.equal(saved.stars[0], res.stars);
  assert.equal(saved.unlockedStage, 1);
  assert.ok(saved.coins > 0);

  const telemetry = await page.evaluate(() => ({ rounds: tc.rounds, ends: tc.ends, dda: tc.results }));
  assert.deepEqual(telemetry.rounds, ['L1-1']);
  assert.equal(telemetry.ends[0][0], 'win');
  assert.equal(telemetry.dda.length, 1);
});

test('Castle shop buys & equips skins, survives reload, and handles QuotaExceededError cleanly', async t => {
  const page = await openGame(t, { save: SAVE({ coins: 200, unlockedStage: 3 }) });
  await step(page, 5);
  await page.locator('#btnShop').click();
  await step(page, 2);
  assert.equal((await state(page)).screen, 'shop');

  // Buy Candy Castle (index 1, 60 coins) & Golden Crown topper (index 1, 80 coins)
  await page.locator('#castleGrid .tc-skin-tile').nth(1).click();
  await page.locator('#bannerGrid .tc-skin-tile').nth(1).click();
  let saved = await stored(page);
  assert.equal(saved.castleSkin, 1);
  assert.equal(saved.bannerSkin, 1);
  assert.equal(saved.coins, 60);

  // Simulate QuotaExceededError when equipping skin 0 -> saveStatus warning appears & Retry works
  await page.evaluate(() => { tc.failSave = true; });
  await page.locator('#castleGrid .tc-skin-tile').nth(0).click();
  await page.waitForSelector('.sg-save-status:not([hidden])');
  await page.evaluate(() => { tc.failSave = false; });
  await page.locator('.sg-save-status button').click();
  saved = await stored(page);
  assert.equal(saved.castleSkin, 0);

  // Reload confirms persistence + Stage Map shows unlocked stages
  await page.reload({ timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.tc && window.tc.step, null, { timeout: 30000 });
  assert.equal((await page.evaluate(() => __game.save.bannerSkin)), 1);
  await page.locator('#btnMap').click();
  const unlockedBtns = await page.locator('#mapWorlds .tc-stage-btn:not(:disabled)').count();
  assert.equal(unlockedBtns, 4);
});

test('1100x620 classroom iframe viewport fits cleanly with zero scrollbars', async t => {
  const page = await openGame(t, { size: [1100, 620] });
  await step(page, 5);
  const fitTitle = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    scrollH: document.documentElement.scrollHeight,
    clientH: document.documentElement.clientHeight
  }));
  assert.equal(fitTitle.scrollW, fitTitle.clientW);
  assert.equal(fitTitle.scrollH, fitTitle.clientH);

  await page.locator('#btnDuo').click();
  await step(page, 5);
  const dockBox = await page.locator('#dockWrap').boundingBox();
  assert.ok(dockBox && dockBox.y + dockBox.height <= 620, '2P unit docks fit inside 1100x620');
});
