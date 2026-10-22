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
    // __game.goal(-1) shoots from 30 px out; a bot guarding its goal mouth can still block that
    // shot, so the bot is moved off the shot's line and frozen until the goal has counted.
    // If the bot has just scored, its goal pause runs out first so there is a live puck to shoot.
    runtime.scoreGoal = () => {
      const live = () => __game.st.scene === 'play' && __game.st.pucks.some(p => p.alive && !p.scored);
      for (let i = 0; i < 300 && !live(); i++) runtime.step(1);
      __game.goal(-1);
      const puck = __game.st.pucks.find(p => p.alive && !p.scored), bot = __game.st.mallets[1];
      Object.assign(bot, { y: puck.y - 220, vx: 0, vy: 0, avx: 0, avy: 0, frozen: 9 });
    };
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
    runtime.failSave = true; runtime.scoreGoal(); runtime.step(4);
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

// 798x449 is the portal on 1366x768 or 1024x768 with a bookmarks bar,
// where the warning shrinks with the game.
test('Air Hockey save warning stays off the rink, the score plates and the hints at 798x449', async t => {
  const page = await hockey(t, { width: 798, height: 449 });
  await page.evaluate(() => document.fonts.ready); // the warning's size follows its text
  const rects = await page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const status = document.querySelector('.sg-save-status'), click = id => document.getElementById(id).click();
    runtime.failSave = true; click('tab1');
    const title = { warn: box(status), hints: ['howto1', 'btnPlay', 'btnShop', 'btnAwards'].map(id => box(document.getElementById(id))), coins: box(document.querySelector('.coinbar')) };
    click('btnAwards'); status.setAttribute('data-compact', 'true');
    const awards = { warn: box(status), hints: [...document.querySelectorAll('#scr-awards .hdr > *, #awGrid > .aw')].map(box) };
    click('awBack'); runtime.failSave = false; status.querySelector('button').click();
    click('btnPlay'); runtime.step(150);
    runtime.failSave = true; runtime.scoreGoal(); runtime.step(4);
    const game = box(document.getElementById('game')), k = (game.r - game.l) / 1280;
    // free corner: left of the score plates (x 170, the player's name starts at 188) and above the rink's rim (y 96)
    const corner = { r: game.l + 170 * k, b: game.t + 96 * k };
    const open = box(status);
    status.setAttribute('data-compact', 'true');
    return { title, awards, corner, open, folded: box(status), state: status.dataset.state };
  });
  const apart = (a, b) => a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t;
  for (const screen of [rects.title, rects.awards]) {
    assert.ok(screen.hints.length >= 4);
    for (const hint of [...screen.hints, screen.coins].filter(Boolean)) assert.ok(apart(screen.warn, hint), `warning ${JSON.stringify(screen.warn)} clears ${JSON.stringify(hint)}`);
  }
  assert.equal(rects.state, 'failed');
  for (const r of [rects.open, rects.folded]) {
    assert.ok(r.l >= 0 && r.t >= 0 && r.r <= rects.corner.r && r.b <= rects.corner.b, `match warning ${JSON.stringify(r)} fits the corner ${JSON.stringify(rects.corner)}`);
  }
});

test('Air Hockey keeps a won match when Menu is chosen from a pause during the slow-motion ending', async t => {
  const page = await hockey(t);
  const ending = await page.evaluate(() => {
    document.getElementById('btnPlay').click(); runtime.step(150);
    __game.setScore(__game.st.goalsToWin - 1, 0); runtime.scoreGoal(); runtime.step(4);
    return { scene: __game.st.scene, bot: __game.st.bot.id };
  });
  assert.equal(ending.scene, 'ending');
  await page.evaluate(() => { document.getElementById('pauseBtn').click(); runtime.step(1); document.getElementById('btnMenu1').click(); runtime.step(1); });
  assert.deepEqual(await page.evaluate(() => [!document.getElementById('scr-title').hidden, __game.st.demo]), [true, true], 'Menu opens the title');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sg:air-hockey:save')));
  assert.deepEqual([saved.matches, saved.wins[ending.bot], saved.beaten[ending.bot]], [1, 1, true], 'the win counts and unlocks the next bot');
});
