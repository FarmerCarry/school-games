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

// The game's Kit.loop is captured so each test drives exact frames; WebGL clears and draws on the
// game canvas are counted as "GL work". Pointer lock is removed so play uses the drag fallback.
async function game(t, { viewport = { width: 960, height: 540 }, init } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = undefined;
    let kit, update, render;
    const runtime = window.runtime = { gl: 0 };
    runtime.step = count => { for (let i = 0; i < count; i++) { update(1 / 60); render(1); } };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!type) continue;
      for (const name of ['clear', 'drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const native = type.prototype[name];
        if (!native) continue;
        type.prototype[name] = function () { if (this.canvas.id === 'gl') runtime.gl++; return native.apply(this, arguments); };
      }
    }
  });
  if (init) await page.addInitScript(init);
  await page.goto(`${server.origin}/games/splat-strike/`);
  await page.waitForFunction(() => window.__game);
  return page;
}
const glWork = (page, frames) => page.evaluate(n => { runtime.gl = 0; runtime.step(n); return runtime.gl; }, frames);

test('Splat Strike keeps its paused frame, redraws after a resize or from settings, and resumes', async t => {
  const page = await game(t);
  await page.evaluate(() => { __game.start({ skipCountdown: true }); __game.god = true; __game.botsFrozen = true; runtime.step(30); __game.pause(); });
  const matchT = await page.evaluate(() => __game.state.matchT);
  assert.ok(await glWork(page, 1) > 0, 'the first paused frame draws the scene once');
  assert.equal(await glWork(page, 120), 0, 'a settled pause does no WebGL work');
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const frames = await page.evaluate(() => __game.perf.frames);
  assert.ok(await glWork(page, 30) > 0, 'a resize (which clears the canvas) draws the paused scene again');
  assert.equal(await page.evaluate(f => __game.perf.frames - f, frames), 1, 'only one frame is drawn after the resize');
  assert.equal(await glWork(page, 60), 0);
  // the settings panel opened from pause keeps drawing so a field-of-view change shows at once
  await page.evaluate(() => document.getElementById('pSetBtn').click());
  const open = await page.evaluate(() => { const f = __game.perf.frames; runtime.step(10); return __game.perf.frames - f; });
  assert.equal(open, 10);
  await page.evaluate(() => document.getElementById('sBack').click());
  assert.ok(await glWork(page, 1) > 0);
  assert.equal(await glWork(page, 60), 0, 'back on the pause panel the frame is kept again');
  assert.equal(await page.evaluate(() => __game.state.matchT), matchT, 'the match clock stays frozen');
  await page.evaluate(() => __game.resume());
  const resumed = await page.evaluate(() => { const f = __game.perf.frames; runtime.step(60); return __game.perf.frames - f; });
  assert.equal(resumed, 60);
  assert.ok(await page.evaluate(m => !__game.state.paused && __game.state.matchT > m, matchT));
});

test('Splat Strike shows the save warning when a write is refused and its retry saves the same progress', async t => {
  const page = await game(t, { init: () => {
    const write = Storage.prototype.setItem;
    window.blockSave = false;
    Storage.prototype.setItem = function (key) {
      if (window.blockSave && key === 'sg:splat-strike:data') throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  } });
  const status = () => page.evaluate(() => { const el = document.querySelector('.sg-save-status'); return { hidden: el.hidden, state: el.getAttribute('data-state') }; });
  await page.evaluate(() => __game.give(10));
  assert.deepEqual(await status(), { hidden: true, state: null }, 'a normal save shows nothing');
  const coins = await page.evaluate(() => { window.blockSave = true; return __game.give(25); });
  assert.deepEqual(await status(), { hidden: false, state: 'failed' });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:splat-strike:data')).coins), coins - 25, 'the old save is untouched');
  await page.evaluate(() => { window.blockSave = false; document.querySelector('.sg-save-status button').click(); });
  assert.equal((await status()).state, 'saved');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sg:splat-strike:data')).coins), coins, 'the retry writes the coins kept in memory');
});

test('Splat Strike keeps the camera steady and skips confetti when motion is reduced', async t => {
  for (const preference of ['full', 'reduce']) {
    const page = await game(t);
    const { jitter, confetti } = await page.evaluate(pref => {
      Kit.motion.setPreference(pref);
      __game.start({ skipCountdown: true }); __game.botsFrozen = true; runtime.step(5);
      const G = SS.G, p = G.player;
      p.shield = 0;
      G.damage(p, 30, G.ents.find(e => e.bot), false, 0, 1, 0);
      let most = 0;
      for (let i = 0; i < 10; i++) {
        runtime.step(1);
        most = Math.max(most, Math.abs(G.camera.rotation.x - (p.pitch + p.rp)), Math.abs(G.camera.rotation.y - (p.yaw + p.ry)));
      }
      let confetti = 0;
      const pop = G.fx.confetti;
      G.fx.confetti = function () { confetti++; return pop.apply(this, arguments); };
      const bot = G.ents.find(e => e.bot && e.alive);
      bot.shield = 0;
      G.damage(bot, 999, p, false, 0, 1, 0);
      return { jitter: most, confetti };
    }, preference);
    if (preference === 'reduce') {
      assert.equal(jitter, 0, 'no camera shake with reduced motion');
      assert.equal(confetti, 0, 'a splat pops into paint only');
    } else {
      assert.ok(jitter > 0, 'a hit still shakes the camera with full motion');
      assert.equal(confetti, 1, 'a splat pops into paint and confetti');
    }
  }
});

test('Splat Strike lays the balloon aim ring on the floor when the throw hits a wall', async t => {
  const page = await game(t);
  const ring = await page.evaluate(() => {
    __game.start({ map: 0, mode: 'ffa', skipCountdown: true }); __game.god = true; __game.botsFrozen = true; runtime.step(2);
    // stand 4.5 m in front of a wide, tall wall on open floor and face it
    const W = SS.G.W;
    let spot = null;
    for (const b of W.boxes) {
      if (spot || b.noShot || b.y0 > 0.2 || b.y1 - b.y0 < 2 || b.y1 > 8) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if ((dx ? b.z1 - b.z0 : b.x1 - b.x0) < 1.5) continue;
        const fx = dx > 0 ? b.x1 : dx < 0 ? b.x0 : (b.x0 + b.x1) / 2, fz = dz > 0 ? b.z1 : dz < 0 ? b.z0 : (b.z0 + b.z1) / 2;
        const px = fx + dx * 4.5, pz = fz + dz * 4.5;
        const gy = W.ground(px, pz, 0.4, 3);
        if (Math.abs(px) > 18 || Math.abs(pz) > 18 || gy > 0.3 || !W.los(px, gy + 1.5, pz, fx + dx * 0.05, gy + 1.5, fz + dz * 0.05)) continue;
        spot = { px, gy, pz, yaw: Math.atan2(dx, dz) };
        break;
      }
    }
    if (!spot) return null;
    __game.teleport(spot.px, spot.gy, spot.pz, spot.yaw, 0.05);
    __game.throwHold(true); runtime.step(3);
    const r = SS.G.fx.ring;
    return { visible: r.visible, y: r.position.y, up: [r.quaternion.x, r.quaternion.y, r.quaternion.z, r.quaternion.w].map(v => +v.toFixed(3)) };
  });
  assert.ok(ring, 'found a wall to throw at');
  assert.equal(ring.visible, true);
  assert.deepEqual(ring.up, [0, 0, 0, 1], 'the ring faces up instead of standing on the wall');
  assert.ok(ring.y < 0.5, `the ring lies on the floor (y = ${ring.y})`);
});

test('Splat Strike states the goal at match start and sizes its minimap to the screen', async t => {
  const page = await game(t, { viewport: { width: 1920, height: 1080 } });
  const start = await page.evaluate(() => {
    __game.start({ mode: 'ffa' }); runtime.step(2);
    const mm = document.getElementById('minimap');
    return { goal: document.getElementById('callout').textContent, target: SS.G.target, width: mm.width, shown: mm.clientWidth };
  });
  assert.match(start.goal, /يفوز/);
  assert.ok(start.goal.includes(String(start.target)), start.goal);
  assert.ok(Math.abs(start.width - start.shown) <= 3, `minimap backing store ${start.width} px matches its ${start.shown} px box`);
  await page.setViewportSize({ width: 1100, height: 620 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const small = await page.evaluate(() => { const mm = document.getElementById('minimap'); return { width: mm.width, shown: mm.clientWidth }; });
  assert.ok(small.width < start.width && Math.abs(small.width - small.shown) <= 3, JSON.stringify(small));
  assert.match(await page.evaluate(() => { __game.start({ mode: 'team' }); return document.getElementById('callout').textContent; }), /فريق/);
});
