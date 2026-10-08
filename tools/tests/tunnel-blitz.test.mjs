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

// Opens Tunnel Blitz with its frame loop captured, so each test drives update/render
// one fixed step at a time, and with a seeded Math.random so the rows repeat.
async function game(t, { reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, reducedMotion });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit, update, render, seed = 7;
    Math.random = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
    const tb = window.tb = { paints: 0, shaken: 0, maxFlash: 0, failSave: false, checkShake: false };
    tb.step = (count, paint = true) => { for (let i = 0; i < count; i++) { update(1 / 60); if (paint) render(0); } };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (key === 'sg:tunnel-blitz:save' && tb.failSave) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
    const proto = CanvasRenderingContext2D.prototype, fillRect = proto.fillRect, fill = proto.fill;
    proto.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'game' && x === 0 && y === 0 && w === 1280 && h === 720 && typeof this.fillStyle === 'string') {
        // The solid background starts every scene paint; translucent full-screen fills are flashes.
        const alpha = /^rgba\(.*,\s*([\d.]+)\)$/.exec(this.fillStyle);
        if (alpha) tb.maxFlash = Math.max(tb.maxFlash, +alpha[1]);
        else { tb.paints++; tb.checkShake = true; }
      }
      return fillRect.apply(this, arguments);
    };
    proto.fill = function () {
      // The first tunnel face after the background shows whether the camera was shaken.
      if (tb.checkShake && this.canvas.id === 'game') {
        tb.checkShake = false;
        const m = this.getTransform();
        if (m.e || m.f) tb.shaken++;
      }
      return fill.apply(this, arguments);
    };
  });
  await page.goto(`${server.origin}/games/tunnel-blitz/`);
  await page.waitForFunction(() => window.__game);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

const play = page => page.evaluate(() => document.getElementById('playBtn').click());

test('reduced motion keeps toasts visible and calms the crash shake and flash', async t => {
  for (const mode of ['no-preference', 'reduce']) {
    const page = await game(t, { reducedMotion: mode });
    await page.evaluate(() => {
      __game.addOrbs(100);
      document.getElementById('hangarBtn').click();
      document.querySelector('.card[data-id="bubble"]').click();
      document.querySelector('#hangar .back').click();
    });
    await page.waitForTimeout(400);
    const toast = await page.$eval('.toast', e => ({ opacity: getComputedStyle(e).opacity, animation: getComputedStyle(e).animationName }));
    // Reduced motion would otherwise jump the toast to its last, transparent keyframe.
    if (mode === 'reduce') assert.deepEqual(toast, { opacity: '1', animation: 'none' }, 'purchase toast is shown still');
    else assert.equal(toast.animation, 'toastIn', 'full motion keeps the toast animation');
    await play(page);
    // Each painted frame costs slow software-GPU time, so the flight to the crash is not painted.
    // Full motion only has to show the crash shake and flash; reduced motion is painted until both
    // have settled (about half a second) to prove it stays calm. Then the game-over screen opens.
    const run = await page.evaluate(painted => {
      for (let i = 0; i < 3600 && __game.info().state === 'play'; i++) tb.step(1, false);
      tb.shaken = 0; tb.maxFlash = 0; tb.step(painted); tb.step(90 - painted, false);
      return { state: __game.info().state, shaken: tb.shaken, maxFlash: tb.maxFlash };
    }, mode === 'reduce' ? 40 : 5);
    assert.equal(run.state, 'over', `${mode}: the run ends in a crash`);
    if (mode === 'reduce') {
      assert.equal(run.shaken, 0, 'no camera shake');
      assert.ok(run.maxFlash <= 0.2, `gentle crash flash (${run.maxFlash})`);
    } else {
      assert.ok(run.shaken > 0, 'full motion still shakes');
      assert.ok(run.maxFlash > 0.5, `full motion still flashes (${run.maxFlash})`);
    }
  }
});

test('a paused scene is painted once, repainted for resize and context restore, and resumes', async t => {
  const page = await game(t);
  await play(page);
  const distance = await page.evaluate(() => {
    tb.step(60, false); document.getElementById('pauseBtn').click(); tb.step(60);
    return __game.info().D;
  });
  assert.equal(await page.evaluate(() => { tb.paints = 0; tb.step(120); return tb.paints; }), 0, 'settled pause paints nothing');
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => { tb.paints = 0; tb.step(30); return tb.paints; }), 1, 'resize repaints once');
  const restored = await page.evaluate(() => {
    const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
    const before = ctx.getTransform().toString();
    // A restored 2D context has lost both its pixels and its transform.
    canvas.width = canvas.width;
    canvas.dispatchEvent(new Event('contextrestored'));
    tb.paints = 0; tb.step(30);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return { paints: tb.paints, same: ctx.getTransform().toString() === before, visible: pixels.some((v, i) => i % 4 === 3 && v > 0) };
  });
  assert.deepEqual(restored, { paints: 1, same: true, visible: true });
  assert.equal(await page.evaluate(() => { Kit.motion.setPreference('reduce'); tb.paints = 0; tb.step(10); Kit.motion.setPreference('system'); return tb.paints; }), 1, 'motion change repaints');
  assert.equal(await page.evaluate(() => __game.info().D), distance, 'pause keeps the run still');
  await page.evaluate(() => { document.getElementById('resumeBtn').click(); tb.paints = 0; tb.step(10); });
  assert.equal(await page.evaluate(() => tb.paints), 10);
  assert.ok(await page.evaluate(d => __game.info().D > d, distance));
});

test('a denied save warns, keeps progress in memory, and clears after a retry', async t => {
  const page = await game(t);
  await page.evaluate(() => { tb.failSave = true; });
  await play(page);
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  assert.equal(await page.evaluate(() => __game.info().runs), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('sg:tunnel-blitz:save')), null);
  await page.evaluate(() => { tb.failSave = false; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status').getAttribute('data-state'), 'saved');
  await page.reload();
  await page.waitForFunction(() => window.__game);
  assert.equal(await page.evaluate(() => __game.info().runs), 1);
});

test('the gold ring reaches the ship in the frame the record is broken', async t => {
  // nearMissAt: 0 breaks the record by distance; otherwise a near miss at that score jumps past it.
  for (const nearMissAt of [0, 142]) {
    const page = await game(t);
    await page.evaluate(() => __game.setBest(150));
    await play(page);
    assert.equal(await page.evaluate(() => __game.info().ring), 151);
    const crossing = await page.evaluate(nearMissAt => {
      __game.invincible(true); __game.autopilot(true);
      let prev = __game.info();
      for (let i = 0; i < 3600 && prev.score <= 150; i++) {
        // A near miss adds its bonus after this frame's record check, so the record breaks next frame.
        if (nearMissAt && prev.score >= nearMissAt && !prev.closeRun) __game.nearMiss();
        tb.step(1, false);
        const now = __game.info();
        if (now.score > 150) return { before: prev.ring, at: now.ring, D: now.D, closeRun: now.closeRun };
        prev = now;
      }
      return null;
    }, nearMissAt);
    const how = nearMissAt ? 'bonus' : 'distance';
    assert.ok(crossing, `${how}: the run passes the record`);
    if (nearMissAt) {
      assert.ok(crossing.closeRun === 1 && crossing.D < 150, `the bonus broke the record (${JSON.stringify(crossing)})`);
      assert.ok(crossing.before > 5, `ring was well ahead before the bonus (${crossing.before} m)`);
    } else {
      assert.equal(crossing.closeRun, 0, 'the record is crossed by distance alone');
      assert.ok(crossing.before > 0, `ring was still ahead before the record (${crossing.before} m)`);
    }
    assert.ok(crossing.at <= 0.5 && crossing.at > -1.5, `${how}: ring is at the ship when the record breaks (${crossing.at} m)`);
  }
});
