import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const require = createRequire(import.meta.url);
const DK = require('../../games/drift-king/sim.js');

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

async function openDrift(t) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit, update, render;
    window.dkTest = { step(n, paint = false) { for (let i = 0; i < n; i++) { update(1 / 60); if (paint) render(0); } } };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(v) {
      kit = v;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
  });
  await page.goto(server.origin + '/games/drift-king/');
  await page.waitForFunction(() => window.__game?.debug && window.dkTest);
  return page;
}

test('Drift King sim spawns spaced Sky Jump Ramps with hang-time coin arcs and maps ghost coordinates', () => {
  const road = new DK.Road(42);
  while (road.last().i < 80) road.addSeg();
  const rampSegs = road.segs.filter(s => s.gap);
  assert.ok(rampSegs.length >= 2, `expected multiple ramps in 80 segments, got ${rampSegs.length}`);
  assert.ok(rampSegs[0].d0 > 65, 'ramps wait past the opening warm-up');
  for (let i = 1; i < rampSegs.length; i++) {
    assert.ok(rampSegs[i].i - rampSegs[i - 1].i >= 4, 'consecutive ramps are spaced apart');
  }
  const firstRamp = rampSegs[0];
  const arcCoins = road.coins.filter(c => c.seg === firstRamp.i);
  assert.equal(arcCoins.length, 5, 'hang-time arc has 5 coins');
  assert.ok(arcCoins.some(c => c.kind === 1), 'hang-time arc includes a center gem');
  assert.ok(arcCoins.some(c => c.z > 1.2), 'hang-time arc lifts into the sky');

  // Ghost pointAtDist maps (progress, laneOffset) onto any road, including jump elevation
  const midGapDist = firstRamp.d0 + (firstRamp.gap.a + firstRamp.gap.b) * 0.5;
  const gp = road.pointAtDist(midGapDist, 0.3);
  assert.ok(gp && gp.z > 0.8, `ghost over gap elevates along jumpZ (z=${gp?.z})`);
  assert.equal(gp.yaw, DK.ANG[firstRamp.dir]);
});

test('Drift King corner chains ignite Turbo Slipstream (x2/x3), coin magnet, and blue flames', async t => {
  const page = await openDrift(t);
  const res = await page.evaluate(() => {
    __game.debug.start();
    __game.debug.autopilot = true;
    let tier1 = null, magnetPicked = false, tier2 = null;
    for (let i = 0; i < 4200 && __game.mode === 'play'; i++) {
      dkTest.step(1, i % 30 === 0);
      if (!tier1 && __game.run.cleanChain >= 5) {
        tier1 = { cleanChain: __game.run.cleanChain, turbo: __game.run.turbo, mult: __game.run.mult, gTurbo: __game.turbo };
        // Place a coin off-center within magnet radius (2.3 units) but outside normal 0.78 pickup radius
        const car = __game.car, seg = __game.road.get(car.seg);
        const testCoin = { x: car.x + DK.LX[seg.dir] * 2.2, y: car.y + DK.LY[seg.dir] * 2.2, z: car.z + 0.4, seg: car.seg, kind: 0, taken: false, t: 0 };
        __game.road.coins.push(testCoin);
        const beforeCoins = __game.run.coins;
        dkTest.step(28, true);
        magnetPicked = testCoin.taken && __game.run.coins > beforeCoins;
      }
      if (tier1 && !tier2 && __game.run.cleanChain >= 10) {
        tier2 = { cleanChain: __game.run.cleanChain, turbo: __game.run.turbo, mult: __game.run.mult, score: __game.run.score, prog: Math.floor(__game.car.progress) };
        dkTest.step(5, true);
        break;
      }
    }
    return { tier1, magnetPicked, tier2 };
  });
  assert.ok(res.tier1, 'reached 5 clean corner drifts');
  assert.deepEqual(res.tier1, { cleanChain: 5, turbo: 1, mult: 2, gTurbo: 1 });
  assert.equal(res.magnetPicked, true, 'Turbo Slipstream magnet pulls nearby off-line coins');
  assert.ok(res.tier2, 'reached 10 clean corner drifts');
  assert.equal(res.tier2.turbo, 2);
  assert.equal(res.tier2.mult, 3);
  assert.ok(res.tier2.score > res.tier2.prog + 20, `multiplier increased score (${res.tier2.score} vs dist ${res.tier2.prog})`);
});

test('Drift King glowing cyan Sky Jump Ramp auto-launches and lands cleanly with shake', async t => {
  const page = await openDrift(t);
  const res = await page.evaluate(() => {
    __game.debug.start();
    __game.debug.autopilot = true;
    const rampSeg = __game.debug.toRamp();
    let maxZ = 0, maxShake = 0, sawAir = false;
    for (let i = 0; i < 300 && __game.mode === 'play'; i++) {
      dkTest.step(1, i % 4 === 0);
      if (__game.car.air) sawAir = true;
      if (__game.car.z > maxZ) maxZ = __game.car.z;
      if (__game.shake.power > maxShake) maxShake = __game.shake.power;
      if (sawAir && !__game.car.air) { dkTest.step(3, true); break; }
    }
    return { rampSeg, sawAir, maxZ, maxShake, jumps: __game.run.jumps, state: __game.car.state };
  });
  assert.ok(res.rampSeg > 0, 'found a Sky Jump Ramp');
  assert.equal(res.sawAir, true, 'car auto-launched over the sky gap');
  assert.ok(res.maxZ > 1.0, `car reached sky hang-time (maxZ=${res.maxZ})`);
  assert.ok(res.maxShake >= 4, `landing triggered Kit.shake (maxShake=${res.maxShake})`);
  assert.ok(res.jumps >= 1);
  assert.equal(res.state, 'drive', 'landed cleanly back on the road');
});

test('Drift King saves compact best-run ghost separately from save record and renders it on replay', async t => {
  const page = await openDrift(t);
  const res = await page.evaluate(() => {
    __game.debug.start();
    __game.debug.autopilot = true;
    dkTest.step(200, false); // ~3.3s run recorded at 5 Hz
    __game.debug.autopilot = false;
    for (let i = 0; i < 900 && __game.mode !== 'over'; i++) dkTest.step(1, false);
    const savedRecord = JSON.parse(localStorage.getItem('sg:drift-king:save'));
    const ghostStored = JSON.parse(localStorage.getItem('sg:drift-king:ghost'));

    // Replay: ghost car should load and render beside player
    __game.debug.start();
    __game.debug.autopilot = true;
    dkTest.step(40, true);
    const replayGhost = __game.ghost ? { vis: __game.ghost.vis, x: __game.ghost.x, y: __game.ghost.y } : null;
    return { hasGhostKeyInSave: 'ghost' in savedRecord, ghostStored, replayGhost };
  });
  assert.equal(res.hasGhostKeyInSave, false, 'ghost is stored in its own Kit.store key, keeping save schema intact');
  assert.ok(res.ghostStored && Array.isArray(res.ghostStored.d), 'ghost array persisted in Kit.store');
  assert.ok(res.ghostStored.d.length >= 10 && res.ghostStored.d.length % 2 === 0, 'compact (progress, laneOffset) pairs saved');
  assert.ok(res.replayGhost && res.replayGhost.vis, 'translucent ghost car is active and visible on replay');
});
