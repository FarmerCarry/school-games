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

// Opens Sumo Bonk with Kit.loop captured, so tests drive update/render frame by frame.
// sumo.texts collects canvas text drawn on the main canvas; sumo.paints counts sky paints
// (one per full scene render); sumo.flashes counts full-screen white washes.
async function game(t, { reduce = false, failSaves = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(({ reduce, failSaves }) => {
    if (reduce) localStorage.setItem('sg:site:motion', '"reduce"');
    const sumo = window.sumo = { texts: [], paints: 0, flashes: 0, failSaves };
    let kit, update, render;
    sumo.step = (n = 1, paint = true) => { for (let i = 0; i < n; i++) { update(1 / 60); if (paint) render(0); } };
    sumo.key = (code, n = 1) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code }));
      sumo.step(1);
      window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code }));
      sumo.step(n - 1);
    };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (sumo.failSaves && key.startsWith('sg:sumo-bonk:')) throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
    const proto = CanvasRenderingContext2D.prototype, main = c => c.canvas.id === 'game';
    const fillText = proto.fillText, drawImage = proto.drawImage, fillRect = proto.fillRect;
    proto.fillText = function (s) { if (main(this)) sumo.texts.push(String(s)); return fillText.apply(this, arguments); };
    proto.drawImage = function (img) { if (main(this) && img instanceof HTMLCanvasElement) sumo.paints++; return drawImage.apply(this, arguments); };
    proto.fillRect = function (x, y, w, h) {
      if (main(this) && x === 0 && y === 0 && w === 1280 && h === 720 && /^rgba\(255, ?255, ?255/.test(String(this.fillStyle))) sumo.flashes++;
      return fillRect.apply(this, arguments);
    };
  }, { reduce, failSaves });
  await page.goto(`${server.origin}/games/sumo-bonk/`);
  await page.waitForFunction(() => window.__game);
  return page;
}

// Starts a 1P match with a CPU that never acts on its own, and steps past the intro.
async function fight(page) {
  await page.evaluate(() => { __game.start(1, 'easy'); __game.P[1].ai.think = 1e9; sumo.step(100); });
  assert.equal(await page.evaluate(() => __game.state.phase), 'fight');
}

test('a mashed attack is held while the bonked rival flies past the edge, but fires normally otherwise', async t => {
  const page = await game(t);
  await fight(page);
  const flying = await page.evaluate(() => {
    const [p, o] = __game.P;
    p.x = 850; p.vx = 0; p.action = 'none';
    Object.assign(o, { x: 1000, y: 300, vx: 600, vy: -200, grounded: false, plat: null, wasHit: true, action: 'stun', t: 0.3, noSnap: 1 });
    sumo.key('KeyS');
    return p.action;
  });
  assert.equal(flying, 'none', 'a dash that would follow the flying rival off the ring is held');
  const grounded = await page.evaluate(() => {
    __game.restartRound('classic'); __game.P[1].ai.think = 1e9; sumo.step(100);
    const [p, o] = __game.P;
    p.x = 850; p.vx = 0; o.x = 1000;
    sumo.step(2);
    sumo.key('KeyS');
    return p.action;
  });
  assert.equal(grounded, 'windup', 'the same press attacks a rival standing on the ring');
});

test('a double fall gives two floaties and is not called a perfect round', async t => {
  const page = await game(t);
  await fight(page);
  const result = await page.evaluate(() => {
    const [a, b] = __game.P;
    Object.assign(a, { x: 1150, y: 380, vx: 0, vy: 0, grounded: false, plat: null, action: 'none', hits: 0, noSnap: 1 });
    Object.assign(b, { x: 1200, y: 480, vx: 0, vy: 0, grounded: false, plat: null, action: 'none', noSnap: 1 });
    sumo.step(150);
    return { floats: __game.P.map(p => p.floatX), out: __game.P.map(p => p.out), score: __game.state.score, texts: sumo.texts.slice(-40) };
  });
  assert.deepEqual(result.out, [true, true]);
  assert.deepEqual(result.score, [1, 0], 'the rival fell first, so the point still goes to the player');
  assert.ok(Math.abs(result.floats[0] - result.floats[1]) >= 150, `separate floaties (${result.floats})`);
  assert.ok(result.texts.includes('الخصم سقط أولاً!'));
  assert.ok(!result.texts.includes('جولة مثالية!'));
});

test('Space jumps and the walking keys bring back the jump/attack keycaps', async t => {
  const page = await game(t);
  await fight(page);
  const jump = await page.evaluate(() => { const y = __game.P[0].y; sumo.key('Space', 4); return { before: y, after: __game.P[0].y, grounded: __game.P[0].grounded }; });
  assert.ok(jump.after < jump.before && !jump.grounded, 'Space makes player 1 jump');
  const hints = await page.evaluate(() => {
    sumo.step(480);
    sumo.texts.length = 0; sumo.step(1);
    const idle = sumo.texts.includes('قفز');
    sumo.key('ArrowLeft', 20);
    sumo.texts.length = 0; sumo.step(1);
    const after = sumo.texts.slice();
    return { idle, shown: after.includes('قفز'), arrows: after.includes('↑') };
  });
  assert.deepEqual(hints, { idle: false, shown: true, arrows: true });
});

// Dashes into a rival standing near the edge, then follows the ring-out frame by frame.
async function bonkOff(page) {
  return page.evaluate(() => {
    const [p, o] = __game.P, cam = __game.cam;
    p.x = 850; o.x = 1000;
    sumo.step(2);
    sumo.flashes = 0;
    let zoom = 1;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
    for (let i = 0; i < 150; i++) {
      sumo.step(1);
      if (i === 0) window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS' }));
      zoom = Math.max(zoom, cam.z + cam.punch);
    }
    return { hits: o.hits, out: o.out, zoom, flashes: sumo.flashes, reduced: Kit.motion.reduced() };
  });
}

test('reduced motion drops zoom punches, the ring-out zoom and white flashes', async t => {
  const calm = await game(t, { reduce: true });
  await fight(calm);
  const run = await bonkOff(calm);
  assert.equal(run.reduced, true);
  assert.ok(run.hits >= 1 && run.out, 'the dash connects and rings the rival out');
  assert.equal(run.flashes, 0, 'no full-screen white flash');
  assert.ok(run.zoom <= 1.0001, `camera stays unzoomed (${run.zoom})`);
  // the same bonk with full motion still punches, zooms and flashes
  const full = await game(t);
  await fight(full);
  const juicy = await bonkOff(full);
  assert.ok(juicy.hits >= 1 && juicy.out);
  assert.ok(juicy.flashes > 0 && juicy.zoom > 1.05, `full motion keeps the juice (${juicy.flashes} flashes, zoom ${juicy.zoom})`);
});

test('a paused match paints once, repaints after a resize, and resumes painting', async t => {
  const page = await game(t);
  await fight(page);
  await page.evaluate(() => { document.getElementById('bPause').click(); });
  assert.equal(await page.evaluate(() => __game.state.paused), true);
  assert.equal(await page.evaluate(() => { sumo.step(2); sumo.paints = 0; sumo.step(120); return sumo.paints; }), 0, 'settled pause performs no scene paints');
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => { sumo.paints = 0; sumo.step(30); return sumo.paints; }), 1, 'resize repaints the paused scene once');
  await page.evaluate(() => { document.getElementById('bResume').click(); });
  assert.equal(await page.evaluate(() => { sumo.paints = 0; sumo.step(30); return sumo.paints; }), 30);
});

test('denied saves warn, keep progress in memory, and recover on retry', async t => {
  const page = await game(t, { failSaves: true });
  await page.evaluate(() => {
    __game.start(1, 'easy'); __game.P[1].ai.think = 1e9;
    for (let r = 0; r < 5 && __game.state.scr === 'game'; r++) { sumo.step(100, false); __game.skipRound(0); sumo.step(200, false); }
  });
  const over = await page.evaluate(() => ({ scr: __game.state.scr, stars: __game.save.stars, stored: localStorage.getItem('sg:sumo-bonk:stars') }));
  assert.equal(over.scr, 'over');
  assert.ok(over.stars > 0);
  assert.equal(over.stored, null, 'nothing was written');
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  // "change wrestler" opens the select screen without ending the finished match a second time
  const changed = await page.evaluate(() => { sumo.key('KeyC', 10); return { scr: __game.state.scr, stars: __game.save.stars, matches: __game.save.matches }; });
  assert.deepEqual(changed, { scr: 'select', stars: over.stars, matches: 1 });
  // flicking a hat while storage is still blocked keeps the warning
  await page.evaluate(() => { sumo.key('KeyS'); });
  assert.equal(await page.locator('.sg-save-status[data-state="failed"]').isVisible(), true);
  await page.evaluate(() => { sumo.failSaves = false; });
  await page.locator('.sg-save-status button').click();
  assert.equal(await page.locator('.sg-save-status[data-state="saved"]').count(), 1);
  await page.reload();
  await page.waitForFunction(() => window.__game);
  assert.equal(await page.evaluate(() => __game.save.stars), over.stars);
});
