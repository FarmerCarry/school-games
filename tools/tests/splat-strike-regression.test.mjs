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

test('Splat Strike settles the sniper zoom before it keeps the paused frame', async t => {
  // a fake clock gives each frame 1/60 s, as on a school PC (slow headless frames would hide the bug)
  const page = await game(t, { init: () => {
    const now = performance.now.bind(performance);
    window.clock = null;
    performance.now = () => window.clock ?? now();
  } });
  const view = await page.evaluate(() => {
    const step = n => { for (let i = 0; i < n; i++) { clock += 1000 / 60; runtime.step(1); } };
    clock = performance.now();
    __game.save.wpn = 2;
    __game.start({ skipCountdown: true }); __game.god = true; __game.botsFrozen = true; step(30);
    document.getElementById('gl').dispatchEvent(new MouseEvent('mousedown', { button: 2 }));
    step(30);
    const scoped = SS.G.camera.fov;
    __game.pause(); step(1);
    return { scoped, fov: SS.G.camera.fov, zoomK: __game._vm().zoomK, normal: __game.save.set.fov };
  });
  assert.ok(view.scoped < 30, `the sniper scope zooms in (fov ${view.scoped})`);
  assert.equal(view.fov, view.normal, 'the kept paused frame has the normal field of view');
  assert.equal(view.zoomK, 0, 'and shows the blaster, not a zoomed view without the scope');
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

test('Splat Strike locker: a double-click only tries a locked item on and a later click buys it', async t => {
  const page = await game(t);
  const coins = await page.evaluate(() => __game.give(500));
  await page.locator('#lockerBtn').click();
  const id = await page.locator('#lGrid .card.locked').first().getAttribute('data-id');
  const card = page.locator(`#lGrid .card[data-id="${id}"]`);
  const saved = () => page.evaluate(() => { const d = JSON.parse(localStorage.getItem('sg:splat-strike:data')); return { coins: d.coins, owned: d.ownC, color: d.color }; });
  await card.dblclick();
  const tried = await saved();
  assert.equal(tried.coins, coins, 'the double-click spends nothing');
  assert.ok(!tried.owned.includes(id) && tried.color !== id, `${id} is not bought`);
  assert.match(await card.getAttribute('class'), /\bsel\b/, 'the item is being tried on');
  await card.click();
  const bought = await saved();
  assert.ok(bought.coins < coins && bought.owned.includes(id) && bought.color === id, `a separate click buys and wears ${id}`);
});

test('Splat Strike results show the experience gained in Arabic with the number kept left to right', async t => {
  const page = await game(t);
  const xp = await page.evaluate(() => {
    __game.start({ skipCountdown: true }); __game.god = true; __game.botsFrozen = true; runtime.step(5); __game.endNow();
    const el = document.getElementById('oXpT');
    for (let i = 0; i < 600 && !el.textContent; i++) runtime.step(1);
    return el.textContent;
  });
  assert.match(xp, /^⁦\+\d+⁩ خبرة$/);
  assert.doesNotMatch(xp, /[A-Za-z]/, 'no English on the results screen');
});
