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

// Opens Paint Grab with a seeded Math.random, its game loop captured (each test steps frames
// explicitly) and font readiness held until runtime.releaseFonts().
async function paintGrab(t) {
  const context = await browser.newContext({ viewport: { width: 640, height: 360 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit, update, render, seed = 20261007, releaseFonts;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const runtime = window.runtime = { paints: 0, canvases: new Set() };
    runtime.step = n => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
    const fontsReady = new Promise(resolve => { releaseFonts = resolve; });
    Object.defineProperty(document.fonts, 'ready', { get: () => fontsReady });
    runtime.releaseFonts = () => releaseFonts(document.fonts);
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    // counts the floor fill that starts every frame (the capture/death flash is translucent)
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'game' && this.globalAlpha === 1 && x === 0 && y === 0 && w === 1280 && h === 720) runtime.paints++;
      return fill.apply(this, arguments);
    };
    // Software canvases: the test reads pixels back, and a GPU read-back under SwiftShader is slow.
    // Context loss is simulated below, so every canvas is also recorded.
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, options) {
      runtime.canvases.add(this);
      return getContext.call(this, type, { ...options, willReadFrequently: true });
    };
  });
  await page.goto(`${server.origin}/games/paint-grab/`);
  await page.waitForFunction(() => window.__game && window.runtime.step);
  return page;
}

test('Paint Grab freezes a paused round and paints it once, then only after resize, context restore or late fonts', async t => {
  const page = await paintGrab(t);
  const paused = await page.evaluate(() => {
    document.getElementById('bPlay').click();
    // a big square of land, revealed before the pause (the reveal wave takes 0.6 s)
    __game.grab(12); runtime.step(40);
    document.getElementById('bPause').click();
    const at = { time: __game.time(), x: __game.player.x };
    runtime.paints = 0; runtime.step(60);
    return { state: __game.state, paints: runtime.paints, at, now: { time: __game.time(), x: __game.player.x } };
  });
  assert.deepEqual(paused, { state: 'pause', paints: 1, at: paused.at, now: paused.at }, 'the paused scene is drawn once and nothing moves');

  await page.setViewportSize({ width: 800, height: 450 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const resized = await page.evaluate(() => { runtime.paints = 0; runtime.step(10); return runtime.paints; });
  assert.equal(resized, 1, 'a resize repaints the paused scene once');

  // A GPU reset blanks every canvas, the cached territory and floor textures included.
  const restored = await page.evaluate(() => {
    const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
    const image = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const shown = image();
    runtime.canvases.forEach(c => { c.width = c.width; });
    runtime.canvases.forEach(c => c.dispatchEvent(new Event('contextrestored')));
    runtime.paints = 0; runtime.step(10);
    const paints = runtime.paints, again = image();
    let differ = 0;
    for (let i = 0; i < shown.length; i += 4) if (shown[i] !== again[i] || shown[i + 1] !== again[i + 1] || shown[i + 2] !== again[i + 2]) differ++;
    runtime.paints = 0; runtime.step(10);
    return { paints, differ, settled: runtime.paints };
  });
  assert.deepEqual(restored, { paints: 1, differ: 0, settled: 0 }, 'the restored scene, territory included, matches the paused frame');

  const fonts = await page.evaluate(async () => {
    runtime.releaseFonts();
    await new Promise(resolve => setTimeout(resolve, 0));
    runtime.paints = 0; runtime.step(10);
    const paints = runtime.paints;
    runtime.paints = 0; runtime.step(10);
    return { paints, settled: runtime.paints };
  });
  assert.deepEqual(fonts, { paints: 1, settled: 0 }, 'late fonts repaint the paused scene once');

  const resumed = await page.evaluate(() => {
    const time = __game.time();
    document.getElementById('bResume').click();
    runtime.paints = 0; runtime.step(5);
    return { state: __game.state, paints: runtime.paints, ticking: __game.time() < time };
  });
  assert.deepEqual(resumed, { state: 'play', paints: 5, ticking: true }, 'play repaints every frame again');
});

test('Paint Grab keeps bots off a rainbow player\'s pink and coral and spreads look-alike bot colours', async t => {
  const page = await paintGrab(t);
  const { rounds, title } = await page.evaluate(() => {
    const pairs = [[0, 6], [2, 8], [4, 9], [5, 11], [1, 10]], rounds = [];
    const look = bots => ({ bots: bots.length, distinct: new Set(bots).size, pinkOrCoral: bots.some(c => c === 0 || c === 6), nearPairs: pairs.filter(([a, b]) => bots.includes(a) && bots.includes(b)).length });
    for (const skin of [0, 12]) {
      __game.save.skin.c = skin;
      for (let i = 0; i < 15; i++) {
        document.getElementById('bRestart').click();
        rounds.push({ skin, ...look(__game.botColors()) });
      }
    }
    document.getElementById('bMenu').click();
    return { rounds, title: look(__game.botColors()) };
  });
  // 8 bots share 10 allowed colours in 6 look-alike groups, so exactly 2 near pairs are unavoidable
  for (const r of rounds) assert.deepEqual(r, { skin: r.skin, bots: 8, distinct: 8, pinkOrCoral: false, nearPairs: 2 });
  // the title's 9 bots use all 12 colours (7 groups), so again only 2 near pairs
  assert.deepEqual({ ...title, pinkOrCoral: undefined }, { bots: 9, distinct: 9, pinkOrCoral: undefined, nearPairs: 2 });
});
