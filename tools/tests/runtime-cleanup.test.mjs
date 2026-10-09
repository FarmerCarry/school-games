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

async function game(t, id, { deferFonts = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(({ id, deferFonts }) => {
    let kit, update, render, now = 1000;
    Object.defineProperty(performance, 'now', { value: () => now });
    const runtime = window.runtime = { paints: 0, writes: [], failSave: false };
    if (deferFonts) {
      const fonts = document.fonts;
      const nativeLoad = fonts.load.bind(fonts);
      // Some Chromium builds do not expose the FontFaceSet global, so take the
      // native getter from document.fonts' own prototype chain instead.
      let proto = Object.getPrototypeOf(fonts), nativeReady;
      while (proto && !(nativeReady = Object.getOwnPropertyDescriptor(proto, 'ready')?.get)) proto = Object.getPrototypeOf(proto);
      if (!nativeReady) throw new Error('document.fonts has no native ready getter');
      const gate = new Promise(resolve => { runtime.releaseFonts = resolve; });
      runtime.waitNativeFonts = () => nativeReady.call(fonts);
      fonts.load = (...args) => nativeLoad(...args).then(value => gate.then(() => value));
      Object.defineProperty(fonts, 'ready', { get: () => nativeReady.call(fonts).then(value => gate.then(() => value)) });
    }
    runtime.step = (count, paint = true) => {
      for (let i = 0; i < count; i++) { now += 1000 / 60; update(1 / 60); if (paint) render(0); }
    };
    runtime.draw = (count, hz = 60) => {
      for (let i = 0; i < count; i++) { now += 1000 / hz; render(0); }
    };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === `sg:${id}:save` || key.startsWith(`sg:${id}:slot`)) {
        runtime.writes.push(key);
        if (runtime.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (id === 'critter-mart' && this.canvas.id === 'game' && x === 0 && y === 0 && w === 1280 && h === 720) runtime.paints++;
      return fill.apply(this, arguments);
    };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function () {
      if (id === 'block-world' && this.canvas.id === 'game') runtime.paints++;
      return clear.apply(this, arguments);
    };
    for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!type) continue;
      const clearGL = type.prototype.clear;
      type.prototype.clear = function () {
        if (this.canvas.id === 'gl') runtime.paints++;
        return clearGL.apply(this, arguments);
      };
    }
  }, { id, deferFonts });
  await page.goto(`${server.origin}/games/${id}/`);
  await page.waitForFunction(() => window.__game);
  await page.evaluate(deferred => deferred ? runtime.waitNativeFonts() : document.fonts.ready, deferFonts);
  if (id === 'wacky-soccer') await page.evaluate(() => {
    const draw = WS.art.drawBg;
    WS.art.drawBg = function () { runtime.paints++; return draw.apply(this, arguments); };
  });
  return page;
}

async function assertFrozenAndResize(page, { settle = 600 } = {}) {
  await page.evaluate(n => runtime.step(n), settle);
  assert.equal(await page.evaluate(() => { runtime.paints = 0; runtime.step(120); return runtime.paints; }), 0, 'settled pause performs no scene paints');
  await page.setViewportSize(page.viewportSize().width === 1000 ? { width: 960, height: 540 } : { width: 1000, height: 600 });
  // Wait for the browser to deliver its resize event before driving the captured loop.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const repaints = await page.evaluate(() => { runtime.paints = 0; runtime.step(30); return runtime.paints; });
  assert.ok(repaints > 0 && repaints < 30, `resize repaints then settles (${repaints} paints)`);
  assert.equal(await page.evaluate(() => { runtime.paints = 0; runtime.step(60); return runtime.paints; }), 0);
  const restored = await page.evaluate(() => {
    const canvas = document.getElementById('game');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const transform = () => Array.from(ctx.getTransform().toFloat64Array());
    const before = transform();
    // A restored 2D context has lost both its backing pixels and drawing state.
    canvas.width = canvas.width;
    canvas.dispatchEvent(new Event('contextrestored'));
    runtime.paints = 0; runtime.step(30);
    const paints = runtime.paints, after = transform();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const visible = pixels.some((value, i) => i % 4 === 3 && value > 0);
    runtime.paints = 0; runtime.step(60);
    return { before, after, paints, visible, settled: runtime.paints };
  });
  if (restored) {
    assert.deepEqual(restored.after, restored.before, 'context restore reinstates the logical canvas transform');
    assert.ok(restored.paints > 0 && restored.paints < 30, 'restored paused canvas repaints then settles');
    assert.equal(restored.visible, true, 'restored paused canvas contains visible pixels');
    assert.equal(restored.settled, 0);
  }
}

test('Critter Mart freezes paused/confirmation scenes, redraws resize, and resumes simulation', async t => {
  const page = await game(t, 'critter-mart');
  await page.evaluate(() => { __game.start(); runtime.step(60); __game.pause(); });
  const play = await page.evaluate(() => __game.S().stats.play);
  await assertFrozenAndResize(page, { settle: 2 });
  await page.evaluate(() => document.getElementById('restartBtn').click());
  assert.equal(await page.evaluate(() => __game.mode), 'confirm');
  await assertFrozenAndResize(page, { settle: 2 });
  await page.evaluate(() => document.getElementById('noBtn').click());
  assert.equal(await page.evaluate(() => __game.S().stats.play), play);
  await page.evaluate(() => { __game.resume(); runtime.paints = 0; runtime.step(60); });
  assert.equal(await page.evaluate(() => runtime.paints), 60);
  assert.ok(await page.evaluate(p => __game.S().stats.play > p, play));
});

test('Critter Mart critical saves reset the three-second checkpoint, but failures do not defer retry', async t => {
  const page = await game(t, 'critter-mart');
  const writes = await page.evaluate(() => {
    __game.start(); runtime.step(170, false);
    runtime.writes.length = 0; __game.save();
    runtime.step(20, false);
    const afterCritical = runtime.writes.length;
    runtime.step(161, false);
    const atDeadline = runtime.writes.length;
    runtime.step(170, false); runtime.failSave = true; __game.save(); runtime.failSave = false;
    runtime.writes.length = 0; runtime.step(20, false);
    return { afterCritical, atDeadline, afterFailure: runtime.writes.length };
  });
  assert.deepEqual(writes, { afterCritical: 1, atDeadline: 2, afterFailure: 1 });
  const hiddenWrites = await page.evaluate(() => {
    const counts = [];
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    // The shared lifecycle hook must not duplicate the game's pause save, and
    // an already paused game must still checkpoint when hidden again.
    for (let i = 0; i < 2; i++) {
      runtime.writes.length = 0;
      document.dispatchEvent(new Event('visibilitychange'));
      counts.push(runtime.writes.length);
    }
    delete document.hidden;
    return { counts, mode: __game.mode };
  });
  assert.deepEqual(hiddenWrites, { counts: [1, 1], mode: 'pause' });
});

test('Wacky Soccer lets goal/wind effects settle before freezing, then resumes the match', async t => {
  const page = await game(t, 'wacky-soccer');
  await page.evaluate(() => {
    document.getElementById('b1p').click(); document.getElementById('bGo').click();
    __game.setMod('wind'); runtime.step(200); __game.goal(0); __game.world.windX = 1;
    document.getElementById('bPause').click();
  });
  const time = await page.evaluate(() => __game.match.t);
  assert.ok(await page.evaluate(() => { runtime.paints = 0; runtime.step(10); return runtime.paints; }) > 0, 'goal effects finish visibly');
  await assertFrozenAndResize(page);
  assert.equal(await page.evaluate(() => __game.info().parts), 0, 'paused wind stops spawning new particles');
  assert.equal(await page.evaluate(() => __game.match.t), time);
  await page.evaluate(() => { document.getElementById('bResume').click(); runtime.paints = 0; runtime.step(60); });
  assert.equal(await page.evaluate(() => runtime.paints), 60);
  assert.ok(await page.evaluate(t => __game.match.t !== t, time));
});

test('Block World finishes effects, freezes pause, redraws resize, and resumes play', async t => {
  const page = await game(t, 'block-world');
  await page.evaluate(() => { document.getElementById('playBtn').click(); document.getElementById('modeSurv').click(); });
  await page.waitForFunction(() => __game.G.mode === 'play');
  await page.evaluate(() => { runtime.step(60); document.getElementById('pausebtn').click(); });
  const play = await page.evaluate(() => __game.G.play);
  await assertFrozenAndResize(page);
  assert.equal(await page.evaluate(() => __game.G.play), play);
  await page.evaluate(() => { document.getElementById('resumeBtn').click(); runtime.paints = 0; runtime.step(60); });
  assert.equal(await page.evaluate(() => runtime.paints), 60);
  assert.ok(await page.evaluate(p => __game.G.play > p, play));
});

test('Block World hiding active play serializes and writes its world exactly once', async t => {
  const page = await game(t, 'block-world');
  await page.evaluate(() => { document.getElementById('playBtn').click(); document.getElementById('modeSurv').click(); });
  await page.waitForFunction(() => __game.G.mode === 'play');
  const saved = await page.evaluate(() => {
    let serializations = 0;
    const checkpoints = [];
    const serialize = __game.G.world.serialize;
    __game.G.world.serialize = function () { serializations++; return serialize.apply(this, arguments); };
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    for (let i = 0; i < 2; i++) {
      runtime.writes.length = 0; serializations = 0;
      document.dispatchEvent(new Event('visibilitychange'));
      checkpoints.push({ serializations, writes: runtime.writes.length, mode: __game.G.mode, error: __game.G.saveError });
    }
    delete document.hidden;
    return checkpoints;
  });
  assert.deepEqual(saved, [
    { serializations: 1, writes: 1, mode: 'pause', error: null },
    { serializations: 1, writes: 1, mode: 'pause', error: null }
  ]);
});

test('Rail Rush freezes paused WebGL work, redraws resize, and resumes distance', async t => {
  const page = await game(t, 'rail-rush');
  await page.evaluate(() => { __game.god = true; __game.restart(); runtime.step(120); document.getElementById('pauseBtn').click(); });
  const distance = await page.evaluate(() => __game.state.dist);
  await assertFrozenAndResize(page, { settle: 2 });
  assert.equal(await page.evaluate(() => __game.state.dist), distance);
  await page.evaluate(() => { document.getElementById('resumeBtn').click(); runtime.paints = 0; runtime.step(60); });
  assert.ok(await page.evaluate(() => runtime.paints) >= 60);
  assert.ok(await page.evaluate(d => __game.state.dist > d, distance));
});


test('late font readiness repaints each frozen game, then leaves it idle again', async t => {
  for (const id of ['critter-mart', 'wacky-soccer', 'block-world', 'rail-rush']) {
    const page = await game(t, id, { deferFonts: true });
    if (id === 'block-world') {
      await page.evaluate(() => { document.getElementById('playBtn').click(); document.getElementById('modeSurv').click(); });
      await page.waitForFunction(() => __game.G.mode === 'play');
    }
    // Count only the 60 frames drawn here: a page timer can paint between two
    // evaluate calls (Rail Rush draws its shop portraits 1.2 s after load).
    const frozen = await page.evaluate(id => {
      if (id === 'critter-mart') { __game.start(); __game.pause(); }
      if (id === 'wacky-soccer') {
        document.getElementById('b1p').click(); document.getElementById('bGo').click(); document.getElementById('bPause').click();
      }
      if (id === 'block-world') document.getElementById('pausebtn').click();
      if (id === 'rail-rush') { __game.restart(); document.getElementById('pauseBtn').click(); }
      runtime.step(600, false); runtime.draw(120); runtime.paints = 0; runtime.draw(60);
      return runtime.paints;
    }, id);
    assert.equal(frozen, 0, `${id} is frozen before font callbacks`);
    await page.evaluate(async () => {
      runtime.releaseFonts();
      await document.fonts.ready;
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    const repaints = await page.evaluate(() => { runtime.paints = 0; runtime.draw(30); return runtime.paints; });
    assert.ok(repaints > 0 && repaints < 30, `${id} redraws after late font readiness (${repaints} paints)`);
    assert.equal(await page.evaluate(() => { runtime.paints = 0; runtime.draw(60); return runtime.paints; }), 0, `${id} settles again`);
    await page.close();
  }
});
