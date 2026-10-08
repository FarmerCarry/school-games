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

// Neon Slope drives its own requestAnimationFrame loop. The page's frames are
// captured so each test steps them by hand; `paints` counts WebGL clears of #gl.
async function game(t, { parallelCompile = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(({ parallelCompile }) => {
    const ns = window.ns = { paints: 0, frames: [], now: 1000, failSave: false, shadersDone: false, fallback: null, resized: false };
    addEventListener('resize', () => { ns.resized = true; });
    window.requestAnimationFrame = cb => ns.frames.push(cb);
    ns.step = count => {
      for (let i = 0; i < count; i++) {
        const frames = ns.frames; ns.frames = []; ns.now += 1000 / 60;
        frames.forEach(cb => cb(ns.now));
      }
    };
    ns.count = count => { ns.paints = 0; ns.step(count); return ns.paints; };
    // Reads the last drawn frame back; call it in the same task that drew the frame.
    ns.hash = () => {
      const gl = document.getElementById('gl').getContext('webgl2') || document.getElementById('gl').getContext('webgl');
      const px = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let h = 0;
      for (let i = 0; i < px.length; i++) h = (h * 31 + px[i]) | 0;
      return h;
    };
    for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!type) continue;
      const clear = type.prototype.clear;
      type.prototype.clear = function () { if (this.canvas.id === 'gl') ns.paints++; return clear.apply(this, arguments); };
      if (!parallelCompile) continue;
      // Pretend the browser builds shaders in the background until the test says they are done.
      const getExtension = type.prototype.getExtension, getParameter = type.prototype.getProgramParameter;
      type.prototype.getExtension = function (name) {
        return name === 'KHR_parallel_shader_compile' ? { COMPLETION_STATUS_KHR: 37297 } : getExtension.apply(this, arguments);
      };
      type.prototype.getProgramParameter = function (program, name) {
        return name === 37297 ? ns.shadersDone : getParameter.apply(this, arguments);
      };
    }
    if (parallelCompile) {
      const timeout = window.setTimeout;
      window.setTimeout = function (fn, ms) { if (ms === 4000) { ns.fallback = fn; return 0; } return timeout.apply(this, arguments); };
    }
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (ns.failSave && key.startsWith('sg:neon-slope:')) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  }, { parallelCompile });
  await page.goto(`${server.origin}/games/neon-slope/`);
  await page.waitForFunction(() => window.__game, null, { polling: 50 });
  return page;
}

test('Neon Slope draws a paused scene once, redraws resize and context restore, then resumes', async t => {
  const page = await game(t);
  // Steering just before the pause leaves the camera easing towards the ball.
  assert.equal(await page.evaluate(() => { __game.start(); const n = ns.count(50); __game.dir = 1; return n + ns.count(10); }), 60);
  await page.evaluate(() => { __game.dir = null; document.getElementById('btnPause').click(); });
  const dist = await page.evaluate(() => __game.state.dist);
  assert.equal(await page.evaluate(() => __game.state.mode), 'paused');
  assert.equal(await page.evaluate(() => ns.count(1)), 1, 'pausing draws the scene once');
  assert.equal(await page.evaluate(() => ns.count(120)), 0, 'a settled pause draws nothing');

  await page.setViewportSize({ width: 1000, height: 600 });
  await page.waitForFunction(() => ns.resized, null, { polling: 50 });
  const [drawn, shown] = await page.evaluate(() => [ns.count(30), ns.hash()]);
  assert.equal(drawn, 1, 'resize redraws once');
  assert.equal(await page.evaluate(() => ns.count(60)), 0);
  // Another redraw must not ease the camera or sky of the frozen scene any further.
  await page.evaluate(() => dispatchEvent(new Event('resize')));
  assert.deepEqual(await page.evaluate(() => [ns.count(1), ns.hash()]), [1, shown], 'a paused redraw shows the same frame');

  await page.evaluate(() => new Promise(resolve => {
    const canvas = document.getElementById('gl'), gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const lose = gl.getExtension('WEBGL_lose_context');
    canvas.addEventListener('webglcontextlost', () => setTimeout(() => lose.restoreContext(), 0), { once: true });
    canvas.addEventListener('webglcontextrestored', () => setTimeout(resolve, 0), { once: true });
    lose.loseContext();
  }));
  assert.equal(await page.evaluate(() => ns.count(30)), 1, 'a restored context redraws once');
  assert.equal(await page.evaluate(() => ns.count(60)), 0);
  assert.equal(await page.evaluate(() => __game.state.dist), dist);

  await page.evaluate(() => document.getElementById('btnResume').click());
  assert.equal(await page.evaluate(() => ns.count(60)), 60);
  assert.ok(await page.evaluate(d => __game.state.dist > d, dist), 'play continues after resume');
});

test('Neon Slope popups and banners stay visible, without movement, in reduced motion', async t => {
  const page = await game(t);
  // The 4 popups, callout and banner that _fx() (re)starts are pending their first frame.
  // Each is read half-way through, where every one of them should be fully visible.
  const fx = () => {
    __game._fx();
    return document.getAnimations().filter(a => a.pending && a.effect.target.matches('.pop, #banner')).map(a => {
      const duration = a.effect.getTiming().duration;
      a.currentTime = duration / 2;
      return { name: a.animationName, duration, opacity: +getComputedStyle(a.effect.target).opacity };
    });
  };
  const settle = () => page.waitForFunction(() => document.getAnimations().every(a => !a.pending), null, { polling: 50 });
  await page.evaluate(() => { __game.start(); ns.step(30); });
  // A gameplay popup started during those frames must not be counted with _fx()'s six.
  await settle();
  const full = await page.evaluate(fx);
  assert.equal(full.length, 6);
  assert.ok(full.every(a => a.name !== 'nsFadeHold'), 'full motion keeps the moving animations');
  await page.evaluate(() => Kit.motion.setPreference('reduce'));
  // The second round reuses elements of the first, which must replay their fade.
  for (let round = 0; round < 2; round++) {
    await settle();
    const list = await page.evaluate(fx);
    assert.deepEqual(list.map(a => a.name), Array(6).fill('nsFadeHold'));
    assert.deepEqual(list.map(a => a.duration).sort(), [1000, 1000, 1000, 1000, 1400, 2200]);
    assert.deepEqual(list.map(a => a.opacity), Array(6).fill(1));
  }
});

test('Neon Slope shows the save warning on failed writes and keeps progress after retry', async t => {
  const page = await game(t);
  const status = () => { const e = document.querySelector('.sg-save-status'); return e && !e.hidden ? e.textContent : ''; };
  await page.evaluate(() => { __game.start(); ns.step(30); ns.failSave = true; __game.addGems(40); });
  assert.match(await page.evaluate(status), /تعذّر الحفظ/);
  const gems = await page.evaluate(() => { __game.die(); ns.step(120); return __game.state.gems; });
  assert.equal(await page.evaluate(() => __game.state.mode), 'over');
  assert.ok(gems >= 40, 'progress stays in memory while saving fails');
  assert.match(await page.evaluate(status), /تعذّر الحفظ/, 'the warning stays until a write succeeds');
  await page.evaluate(() => { ns.failSave = false; document.querySelector('.sg-save-status button').click(); });
  assert.match(await page.evaluate(status), /تم الحفظ/);
  await page.reload();
  await page.waitForFunction(() => window.__game, null, { polling: 50 });
  assert.equal(await page.evaluate(() => __game.state.gems), gems);
});

// What the player sees: the game mode, which screens are up, and whether Play shows its loading label.
const screens = () => ({ mode: __game.state.mode, title: !document.getElementById('title').hidden,
  hud: !document.getElementById('hud').hidden, loading: getComputedStyle(document.querySelector('#btnPlay .ld')).display !== 'none' });

test('Neon Slope keeps the title, with a loading Play button, until background shader builds finish', async t => {
  const page = await game(t, { parallelCompile: true });
  assert.equal(await page.evaluate(() => ns.count(10)), 0, 'nothing is drawn while shaders build');
  assert.deepEqual(await page.evaluate(screens), { mode: 'title', title: true, hud: false, loading: false });
  // Losing focus drops a waiting Play, so the run does not start unattended.
  await page.evaluate(() => { document.getElementById('btnPlay').click(); dispatchEvent(new Event('blur')); ns.step(5); });
  assert.deepEqual(await page.evaluate(screens), { mode: 'title', title: true, hud: false, loading: false });
  await page.evaluate(() => { document.getElementById('btnPlay').click(); ns.step(20); });
  assert.deepEqual(await page.evaluate(screens), { mode: 'title', title: true, hud: false, loading: true }, 'Play waits, and says so');
  assert.equal(await page.evaluate(() => ns.paints + __game.state.dist), 0);
  await page.evaluate(() => { ns.shadersDone = true; });
  await page.waitForFunction(() => ns.count(1) === 1, null, { polling: 50, timeout: 5000 });
  assert.deepEqual(await page.evaluate(screens), { mode: 'play', title: false, hud: true, loading: false }, 'the first drawn frame is the run');
  assert.equal(await page.evaluate(() => ns.count(60)), 60);
  assert.ok(await page.evaluate(() => __game.state.dist > 0 && __game.state.mode === 'play'));
});

test('Neon Slope starts drawing, and a waiting Play, after the fallback timer if shader builds never report', async t => {
  const page = await game(t, { parallelCompile: true });
  assert.equal(await page.evaluate(() => ns.count(10)), 0);
  assert.equal(await page.evaluate(() => typeof ns.fallback), 'function');
  await page.evaluate(() => { document.getElementById('btnPlay').click(); });
  assert.equal(await page.evaluate(() => { ns.fallback(); return ns.count(10); }), 10);
  assert.deepEqual(await page.evaluate(screens), { mode: 'play', title: false, hud: true, loading: false });
});
