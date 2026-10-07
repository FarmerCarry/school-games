import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.SG_ROOT ? path.resolve(repo, process.env.SG_ROOT) : repo;
let browser, server;
before(async () => { server = await startTestServer(root); browser = await launchChromium(); });
after(async () => { await browser?.close(); await server?.close(); });

async function game(t, { loop = false } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'game should not throw'); });
  // The test drives __game.ff() itself, so the real loop must not advance play.
  await page.addInitScript(loop => {
    if (!loop) { window.requestAnimationFrame = () => 0; return; }
    // Or capture the loop, so the test steps update + render itself and counts scene paints.
    let kit, update, render;
    const runtime = window.runtime = { paints: 0 };
    runtime.step = n => { for (let i = 0; i < n; i++) { update(1 / 60); render(0.5); } };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    // A read-back can move an accelerated canvas to the CPU rasterizer mid-test; start it there
    // so two draws of the same scene compare equal pixel for pixel.
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, opts) {
      return getContext.call(this, type, type === '2d' ? { ...opts, willReadFrequently: true } : opts);
    };
    // every scene paint starts with the full-canvas background gradient
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'game' && this.fillStyle instanceof CanvasGradient && !x && !y && w === 1280 && h === 720) runtime.paints++;
      return fill.apply(this, arguments);
    };
  }, loop);
  await page.goto(server.origin + '/games/beat-dash/index.html');
  await page.waitForFunction(() => window.__game && window.Kit);
  return page;
}

test('practice auto-checkpoints never respawn the cube just before a spike', async t => {
  const page = await game(t);
  // With no input the cube dies at the first spike of level 1 (x 25.5). A checkpoint
  // placed 0.3-0.5 s before it used to trap the player in instant re-deaths.
  const state = await page.evaluate(() => { __game.start(0, true); return __game.ff(700); });
  assert.equal(state.practice, true);
  assert.equal(state.cps, 0, 'no auto-checkpoint in front of the first spike');
  assert.ok(state.attempt <= 5, `only full-length tries (attempt ${state.attempt})`);
});

test('failed saves stay visible until a retry writes every key', async t => {
  const page = await game(t);
  const failed = await page.evaluate(() => {
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new Error('quota'); };
    __game.start(0, false);
    __game.ff(2);
    const panel = document.querySelector('.sg-save-status');
    return { hidden: panel.hidden, state: panel.dataset.state, att: localStorage.getItem('sg:beat-dash:att') };
  });
  assert.deepEqual(failed, { hidden: false, state: 'failed', att: null });
  const retried = await page.evaluate(() => {
    Storage.prototype.setItem = window.realSetItem;
    document.querySelector('.sg-save-status button').click();
    const panel = document.querySelector('.sg-save-status'), store = Kit.store('beat-dash');
    return { state: panel.dataset.state, att: store.get('att', null), last: store.get('last', null), attempts: store.get('total', {}).attempts };
  });
  assert.deepEqual(retried, { state: 'saved', att: { 'neon-steps': 1 }, last: 0, attempts: 1 });
});

test('toasts wait while a death popup is up, then show in full', async t => {
  const page = await game(t);
  const r = await page.evaluate(() => {
    const toast = document.getElementById('toast'), shown = () => (toast.hidden ? null : toast.textContent);
    const untilDeath = () => { for (let n = 0; n < 2000 && !__game.ff(1).dead; n++); };
    const during = () => { const seen = []; for (let i = 0; i < 95; i++) { __game.ff(1); seen.push(shown()); } return seen.filter(Boolean); };
    __game.start(0, false);
    while (__game.state.attempt < 5) __game.ff(1);
    // The 5th death queues the practice hint; as a new best it also raises the centred popup,
    // which sits just under the toast band. The popup lasts 1.6 s (96 ticks).
    __game.save.best['neon-steps'] = 0;
    untilDeath();
    const queued = { atDeath: shown(), during: during() };
    __game.ff(3);
    queued.after = shown();
    // A toast that is already showing steps aside for a new death popup and comes back afterwards.
    __game.save.best['neon-steps'] = 0;
    __game.skipTo(4);
    untilDeath();
    const showing = { atDeath: shown(), during: during() };
    __game.ff(3);
    showing.after = shown();
    return { queued, showing };
  });
  const hint = 'صعبة؟ جرّب وضع التدريب: اضغط P ثم «وضع التدريب»';
  assert.deepEqual(r.queued, { atDeath: null, during: [], after: hint });
  assert.deepEqual(r.showing, { atDeath: null, during: [], after: hint });
});

test('a paused run is drawn once with its effects held still, then only on resize, restore or motion change', async t => {
  const page = await game(t, { loop: true });
  await page.evaluate(() => document.fonts.ready);
  const paused = await page.evaluate(() => {
    const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
    const pixels = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const paintsIn = n => { runtime.paints = 0; runtime.step(n); return runtime.paints; };
    __game.start(0, false);
    // With no input the cube dies at the first spike; pause while its burst, ring, flash and shake are live.
    for (let n = 0; n < 2000 && !__game.state.dead; n++) __game.ff(1);
    runtime.step(3);
    document.getElementById('b-pause').click();
    const first = paintsIn(60), picture = pixels(), idle = paintsIn(120);
    canvas.width = canvas.width; // a restored 2D context has lost its pixels and drawing state
    canvas.dispatchEvent(new Event('contextrestored'));
    // the redrawn frame is the same picture: nothing moved during the 2 paused seconds
    const restored = paintsIn(30), same = pixels().every((v, i) => v === picture[i]), settled = paintsIn(30);
    Kit.motion.setPreference('reduce');
    const motion = paintsIn(30);
    return { first, idle, restored, same, settled, motion, attempt: __game.state.attempt };
  });
  assert.deepEqual(paused, { first: 1, idle: 0, restored: 1, same: true, settled: 0, motion: 1, attempt: 1 });
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => { runtime.paints = 0; runtime.step(30); return runtime.paints; }), 1, 'a resize redraws the paused frame once');
  const resumed = await page.evaluate(() => {
    document.getElementById('b-resume').click();
    runtime.paints = 0; runtime.step(40);
    return { paints: runtime.paints, attempt: __game.state.attempt, paused: __game.state.paused };
  });
  assert.deepEqual(resumed, { paints: 40, attempt: 2, paused: false }, 'resume draws every frame and the next try starts');
});
