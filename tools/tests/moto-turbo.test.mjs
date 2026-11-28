import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const require = createRequire(import.meta.url);
require('../../games/moto-madness/engine.js');
require('../../games/moto-madness/levels.js');
const MM = globalThis.MM;
const TAU = Math.PI * 2;

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

test('Moto Madness clean backflip and frontflip both trigger a 1.5s Turbo Nitro burst and speed surge', () => {
  for (const dir of ['back', 'front']) {
    const w = new MM.World(MM.build(MM.LEVELS[0]));
    const x = 600, gy = w.groundAt(x, -1e9, true);
    // Drop the bike from a clean air flip onto flat ground
    w.placeBike(x, gy - 140, 0);
    w.bike.vx = 520; w.started = true;
    for (let f = 0; f < 10 && w.grounded; f++) w.step({ gas: true });
    w.airT = 0.5;
    w.takeoffA = w.bike.a + (dir === 'back' ? TAU : -TAU);
    let flipEv = null, peakVx = 0;
    for (let f = 0; f < 150; f++) {
      w.step({ gas: true });
      for (const e of w.events) if (e.type === 'flip') flipEv = e;
      if (w.nitroT > 0 && w.bike.vx > peakVx) peakVx = w.bike.vx;
    }
    assert.ok(flipEv, `${dir}flip must emit flip event`);
    assert.equal(flipEv.dir, dir);
    assert.equal(flipEv.nitro, true, `${dir}flip before finish activates Turbo Nitro`);
    assert.ok(peakVx > 760, `${dir}flip nitro surges forward speed (peakVx=${Math.round(peakVx)})`);
    assert.equal(w.nitroT, 0, '1.5s nitro timer expires cleanly');
  }
});

test('Moto Madness forgives +10 deg extra landing pitch when finishing a full flip, without forgiving head-plants', () => {
  // ~117 deg tilt (2.04 rad -> cos = -0.453, between base -0.37 and flip-forgiven -0.53)
  function dropAt(angle, fullFlip) {
    const w = new MM.World(MM.build(MM.LEVELS[0]));
    const x = 600, gy = w.groundAt(x, -1e9, true);
    w.placeBike(x, gy - 68, angle);
    w.bike.wheels[0].air = w.bike.wheels[1].air = 1;
    w.bike.vx = 280; w.bike.vy = 180; w.started = true;
    w.grounded = false; w.airT = 0.6;
    w.takeoffA = fullFlip ? angle + TAU : angle;
    for (let f = 0; f < 45; f++) w.step({ gas: true });
    return w.crashed;
  }
  assert.equal(dropAt(2.04, true), false, '117 deg landing while finishing a full flip is heroically forgiven');
  assert.equal(dropAt(2.04, false), true, '117 deg landing without a full flip still bonks normally');
  assert.equal(dropAt(Math.PI, true), true, 'upside-down 180 deg head-plant still crashes');
});

test('Moto Madness browser Flip-to-Turbo plays turbo SFX, hitstop, shake, and renders exhaust flames', async t => {
  const context = await browser.newContext(), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit;
    window.mmTest = { texts: [], turboCalls: 0, hitstopCalls: 0 };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(v) {
      kit = v;
      kit.loop = (u, r) => { window.__loop = { update: u, render: r }; return { stop() {} }; };
      const origHit = kit.hitstop;
      const wrapped = function (sec) { if (sec > 0) window.mmTest.hitstopCalls++; return origHit.apply(this, arguments); };
      wrapped.active = origHit.active; wrapped.tick = origHit.tick; wrapped.reset = origHit.reset;
      kit.hitstop = wrapped;
    } });
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text) {
      if (this.canvas.id === 'game') window.mmTest.texts.push(String(text));
      return fillText.apply(this, arguments);
    };
  });
  await page.goto(`${server.origin}/games/moto-madness/`);
  await page.waitForFunction(() => window.__game && __game.state === 'title');

  const res = await page.evaluate(() => {
    const origTurbo = MMA.turbo;
    MMA.turbo = function () { mmTest.turboCalls++; return origTurbo.apply(this, arguments); };
    __game.start(0);
    const w = __game.world, x = 600, gy = w.groundAt(x, -1e9, true);
    w.placeBike(x, gy - 140, 0);
    w.bike.vx = 520; w.started = true;
    for (let f = 0; f < 10 && w.grounded; f++) __game.step(1, { gas: true });
    w.airT = 0.5;
    w.takeoffA = w.bike.a + Math.PI * 2;
    let peakNitro = 0;
    for (let f = 0; f < 90; f++) {
      __game.step(1, { gas: true });
      if (w.nitroT > peakNitro) peakNitro = w.nitroT;
      if (w.nitroT > 0) __loop.render(0);
    }
    return {
      flips: w.flips, peakNitro, turboCalls: mmTest.turboCalls, hitstopCalls: mmTest.hitstopCalls,
      hasBanner: mmTest.texts.some(s => s.includes('شقلبة توربو'))
    };
  });
  assert.equal(res.flips, 1);
  assert.ok(res.peakNitro > 1.3, `nitro activated for ~1.5s (${res.peakNitro})`);
  assert.equal(res.turboCalls, 1, 'ascending turbo SFX triggered');
  assert.equal(res.hitstopCalls, 1, 'Kit.hitstop fired on flip-to-turbo landing');
  assert.equal(res.hasBanner, true, 'Arabic Flip-to-Turbo banner rendered');
});
