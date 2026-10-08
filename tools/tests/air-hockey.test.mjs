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

// Opens Air Hockey with its game loop captured, so each test steps frames explicitly.
async function hockey(t, viewport = { width: 1280, height: 720 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit, update, render;
    const runtime = window.runtime = { paints: 0, failSave: false };
    runtime.step = n => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
    runtime.pointer = (x, y) => window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:air-hockey:save' && runtime.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
    // counts only the background clear that starts every frame; the goal flash overlay
    // is also a full-canvas fill, but in the scorer's colour
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'game' && this.fillStyle === '#050716' && x === 0 && y === 0 && w === 1280 && h === 720) runtime.paints++;
      return fill.apply(this, arguments);
    };
  });
  await page.goto(`${server.origin}/games/air-hockey/`);
  await page.waitForFunction(() => window.__game);
  return page;
}

test('Air Hockey table art is opaque above the rink and every frame repaints the whole canvas', async t => {
  const page = await hockey(t);
  const alphas = await page.evaluate(() => AH.TABLES.map(th => {
    const x = AH.art.buildTable(th, 1).getContext('2d');
    return [x.getImageData(200, 40, 1, 1).data[3], x.getImageData(640, 8, 1, 1).data[3]];
  }));
  assert.equal(alphas.length, 5);
  assert.deepEqual(alphas, alphas.map(() => [255, 255]), 'the strip above the rink is not see-through');
  const pixel = await page.evaluate(() => {
    const x = document.getElementById('game').getContext('2d');
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#ff0000'; x.fillRect(40, 20, 10, 10); x.restore();
    runtime.step(1);
    return Array.from(x.getImageData(45, 25, 1, 1).data);
  });
  assert.notDeepEqual(pixel.slice(0, 3), [255, 0, 0], 'stale pixels above the rink are painted over');
});

test('Air Hockey paints a paused match once, then only after resize or context restore', async t => {
  const page = await hockey(t);
  await page.evaluate(() => { document.getElementById('btnPlay').click(); runtime.step(150); document.getElementById('pauseBtn').click(); runtime.paints = 0; runtime.step(60); });
  assert.equal(await page.evaluate(() => runtime.paints), 1, 'the paused scene is drawn once');
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const resized = await page.evaluate(() => { runtime.paints = 0; runtime.step(30); return runtime.paints; });
  assert.ok(resized > 0 && resized < 30, `resize repaints then settles (${resized} paints)`);
  const restored = await page.evaluate(() => {
    const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
    canvas.width = canvas.width; // a restored 2D context has lost its pixels and drawing state
    canvas.dispatchEvent(new Event('contextrestored'));
    runtime.paints = 0; runtime.step(30);
    const paints = runtime.paints, scale = ctx.getTransform().a;
    const visible = ctx.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data[3] === 255;
    runtime.paints = 0; runtime.step(30);
    return { paints, scale, visible, settled: runtime.paints };
  });
  assert.equal(restored.paints, 1);
  assert.ok(restored.scale > 0.7 && restored.scale < 0.8, 'the logical transform is reapplied');
  assert.equal(restored.visible, true);
  assert.equal(restored.settled, 0);
  await page.evaluate(() => { document.getElementById('btnResume').click(); runtime.paints = 0; runtime.step(30); });
  assert.equal(await page.evaluate(() => runtime.paints), 30, 'play repaints every frame again');
});

test('Air Hockey holds mid-rally award banners for the goal and reports failed saves', async t => {
  const page = await hockey(t);
  // A fast mouse swipe through a resting puck earns the rocket award mid-rally.
  const rally = await page.evaluate(() => {
    runtime.pointer(200, 406); document.getElementById('btnPlay').click(); runtime.step(150);
    __game.shot(0, 0, 420, 406); runtime.pointer(700, 406); runtime.step(12);
    return { scene: __game.st.scene, saved: !!__game.save.awards.rocket, queued: __game.st.awardQ.length, toasts: document.querySelectorAll('#toasts .toast').length };
  });
  assert.deepEqual(rally, { scene: 'play', saved: true, queued: 1, toasts: 0 });
  const goal = await page.evaluate(() => {
    runtime.failSave = true; __game.goal(-1); runtime.step(4);
    const status = document.querySelector('.sg-save-status');
    return { scene: __game.st.scene, queued: __game.st.awardQ.length, toasts: document.querySelectorAll('#toasts .toast').length, failed: !status.hidden && status.dataset.state };
  });
  assert.deepEqual(goal, { scene: 'goal', queued: 0, toasts: 2, failed: 'failed' });
  const retried = await page.evaluate(() => {
    runtime.failSave = false; document.querySelector('.sg-save-status button').click();
    return { state: document.querySelector('.sg-save-status').dataset.state, awards: JSON.parse(localStorage.getItem('sg:air-hockey:save')).awards };
  });
  assert.deepEqual(retried, { state: 'saved', awards: { rocket: 1, goal1: 1 } });
});

test('Air Hockey 2-player chaos: player 2 is lime next to melon, and rally banners wait for the respawn', async t => {
  const page = await hockey(t);
  const result = await page.evaluate(() => {
    Object.assign(__game.save, { mode: 2, chaos: true });
    __game.save.eq.mallet = 'melon';
    document.getElementById('btnPlay').click(); runtime.step(150);
    const banner = () => [...document.querySelectorAll('#toasts .toast')].some(el => el.textContent.includes('جائزة الاختبار'));
    const skins = __game.st.mallets.map(m => m.skin.id);
    __game.st.awardQ.push('جائزة الاختبار'); __game.goal(-1); runtime.step(4);
    const atGoal = { scene: __game.st.scene, score: __game.st.score.slice(), queued: __game.st.awardQ.length, banner: banner() };
    let frames = 4; // another chaos goal restarts the wait, so step until the queue is shown
    while (__game.st.awardQ.length && frames < 600) { runtime.step(1); frames++; }
    return { skins, atGoal, frames, banner: banner() };
  });
  assert.deepEqual(result.skins, ['melon', 'lime']);
  assert.deepEqual(result.atGoal, { scene: 'play', score: [1, 0], queued: 1, banner: false }, 'no banner over the live rink');
  assert.ok(result.frames >= 55 && result.frames < 600, `the banner waits about a second (${result.frames} frames)`);
  assert.equal(result.banner, true);
});

test('Air Hockey 1-player HUD shows the player in blue when the mallet matches the bot', async t => {
  const page = await hockey(t);
  const result = await page.evaluate(() => {
    const seen = {}, fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s) { if (this.canvas.id === 'game') seen[s] = this.fillStyle; return fillText.apply(this, arguments); };
    const play = (mallet, bot) => {
      Object.assign(__game.save, { mode: 1, bot }); __game.save.eq.mallet = mallet;
      document.getElementById('btnPlay').click(); runtime.step(1);
      return { you: seen['أنت'], bot: seen[__game.st.bot.name], skin: __game.st.mallets[0].skin.id };
    };
    const plain = play('melon', 'easy'), clash = play('melon', 'insane');
    runtime.step(150); __game.setScore(6, 0); __game.goal(-1);
    for (let i = 0; i < 400 && __game.st.scene !== 'over'; i++) runtime.step(1);
    const score = [...document.querySelectorAll('#ovScore > span:not(.dash)')].map(el => el.style.color);
    return { plain, clash, score };
  });
  assert.deepEqual(result.plain, { you: '#ff5a6e', bot: '#7cf29a', skin: 'melon' }, 'a melon next to a green bot keeps its colour');
  assert.deepEqual(result.clash, { you: '#35c8ff', bot: '#ff5c7a', skin: 'melon' }, 'the plate turns blue, the mallet stays a melon');
  assert.deepEqual(result.score, ['rgb(53, 200, 255)', 'rgb(255, 92, 122)'], 'the results use the same colours');
});

test('Air Hockey save warning stays off the rink, the score plates and the title hints', async t => {
  const page = await hockey(t, { width: 1100, height: 620 });
  const rects = await page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const status = document.querySelector('.sg-save-status');
    runtime.failSave = true; document.getElementById('tab1').click();
    const title = { warn: box(status), hints: ['howto1', 'btnPlay', 'btnShop', 'btnAwards'].map(id => box(document.getElementById(id))), coins: box(document.querySelector('.coinbar')) };
    runtime.failSave = false; status.querySelector('button').click();
    document.getElementById('btnPlay').click(); runtime.step(150);
    runtime.failSave = true; __game.goal(-1); runtime.step(4);
    const game = box(document.getElementById('game')), k = (game.r - game.l) / 1280;
    // free corner: left of the score plates (x 170) and above the rink's rim (y 96)
    const corner = { r: game.l + 170 * k, b: game.t + 96 * k };
    const open = box(status);
    status.setAttribute('data-compact', 'true');
    return { title, corner, open, folded: box(status), state: status.dataset.state };
  });
  const apart = (a, b) => a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t;
  for (const hint of [...rects.title.hints, rects.title.coins]) assert.ok(apart(rects.title.warn, hint), `title warning ${JSON.stringify(rects.title.warn)} clears ${JSON.stringify(hint)}`);
  assert.equal(rects.state, 'failed');
  for (const r of [rects.open, rects.folded]) {
    assert.ok(r.l >= 0 && r.t >= 0 && r.r <= rects.corner.r && r.b <= rects.corner.b, `match warning ${JSON.stringify(r)} fits the corner ${JSON.stringify(rects.corner)}`);
  }
});
