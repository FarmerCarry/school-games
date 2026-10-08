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

// Hoop Heads with the test driving its loop: hh.step(n) runs n fixed updates, each
// followed by a render, and hh.draw(n) only renders. hh.renders counts scene draws.
async function hoop(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit, update, render;
    const hh = window.hh = { renders: 0, failSave: false };
    hh.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
    hh.draw = (n = 1) => { for (let i = 0; i < n; i++) render(0); };
    hh.down = code => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    hh.up = code => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    // A whole press and release between two frames, as on a stuttering school PC.
    hh.tap = code => { hh.down(code); hh.up(code); };
    hh.untilResult = () => { for (let i = 0; i < 600 && __game.state !== 'result'; i++) hh.step(1); return __game.state; };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { running: true, stop() {} }; };
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (hh.failSave && key === 'sg:hoop-heads:save') throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  });
  await page.goto(`${server.origin}/games/hoop-heads/`);
  await page.waitForFunction(() => window.__game && window.HH);
  // Late fonts redraw once; let that happen before counting scene draws.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => setTimeout(resolve, 50));
    const draw = HH.render;
    HH.render = function (c, v, m, info) { hh.renders++; hh.info = info; return draw.apply(this, arguments); };
  });
  return page;
}

test('Hoop Heads key taps shorter than one frame still jump and dunk', async t => {
  const page = await hoop(t);
  const result = await page.evaluate(() => {
    __game.start({ mode: 'duo' }); __game.skipIntro(); hh.step(1);
    const m = __game.match, p = m.players[0];
    __game.give(0, 400);
    hh.tap('KeyW'); hh.step(1);
    const hopped = !p.onGround;
    hh.step(90);
    __game.give(0, 1000);
    hh.down('KeyW'); hh.step(12); hh.up('KeyW');
    const canDunk = HH.canDunk(m, p);
    hh.tap('KeyS'); hh.step(1);
    const dunking = !!p.dunk;
    hh.step(120);
    return { hopped, canDunk, dunking, score: p.score, dunks: p.st.dunks };
  });
  assert.deepEqual(result, { hopped: true, canDunk: true, dunking: true, score: 2, dunks: 1 });
});

test('Hoop Heads result screen ignores keys mashed from the match, then Enter plays again', async t => {
  const page = await hoop(t);
  const states = await page.evaluate(() => {
    __game.start({ mode: 'cpu', lv: 0 }); __game.endNow(0);
    const seen = [hh.untilResult()];
    hh.tap('Space'); hh.tap('KeyA'); hh.step(1); seen.push(__game.state);
    hh.step(36); hh.tap('Enter'); hh.step(1); seen.push(__game.state);
    return seen;
  });
  assert.deepEqual(states, ['result', 'result', 'play']);
});

test('Hoop Heads failed saves warn with a retry that writes the latest progress', async t => {
  const page = await hoop(t);
  const result = await page.evaluate(() => {
    const before = !!document.querySelector('.sg-save-status');
    hh.failSave = true;
    __game.start({ mode: 'cpu', lv: 0 }); __game.endNow(0); hh.untilResult();
    const panel = document.querySelector('.sg-save-status');
    const failed = { shown: !panel.hidden, state: panel.dataset.state, stored: HH.store.get('save', null) };
    hh.failSave = false;
    panel.querySelector('button').click();
    return { before, failed, state: panel.dataset.state, games: HH.store.get('save', null).stats.games };
  });
  assert.deepEqual(result, { before: false, failed: { shown: true, state: 'failed', stored: null }, state: 'saved', games: 1 });
});

test('Hoop Heads draws a paused match once, redraws on resize or restore, and resumes', async t => {
  const page = await hoop(t);
  const paused = await page.evaluate(() => {
    __game.start({ mode: 'duo' }); __game.skipIntro(); hh.step(30);
    hh.tap('KeyP'); hh.renders = 0; hh.step(1);
    const first = hh.renders;
    hh.renders = 0; hh.step(120);
    return { state: __game.state, first, idle: hh.renders };
  });
  assert.deepEqual(paused, { state: 'pause', first: 1, idle: 0 });
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => { hh.renders = 0; hh.step(30); return hh.renders; }), 1, 'resize redraws once');
  const restored = await page.evaluate(() => {
    const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
    const transform = () => Array.from(ctx.getTransform().toFloat64Array());
    const before = transform();
    canvas.width = canvas.width; // a restored 2D context loses its pixels and drawing state
    canvas.dispatchEvent(new Event('contextrestored'));
    hh.renders = 0; hh.step(30);
    return { same: JSON.stringify(transform()) === JSON.stringify(before), renders: hh.renders };
  });
  assert.deepEqual(restored, { same: true, renders: 1 });
  // Paused mid score flash, then the classroom preset turns reduced motion on.
  const motion = await page.evaluate(() => {
    __game.match.flash = 0.3; Kit.motion.setPreference('reduce');
    hh.renders = 0; hh.step(30);
    const reduced = hh.renders;
    Kit.motion.setPreference('full'); hh.step(1);
    return reduced;
  });
  assert.equal(motion, 1, 'a motion change redraws the still frame once');
  const confirm = await page.evaluate(() => {
    document.getElementById('pMenu').click();
    hh.renders = 0; hh.step(30);
    const r = { state: __game.state, renders: hh.renders };
    document.getElementById('cfNo').click();
    return r;
  });
  assert.deepEqual(confirm, { state: 'confirm', renders: 0 });
  const resumed = await page.evaluate(() => {
    const time = __game.match.time;
    document.getElementById('pResume').click();
    hh.renders = 0; hh.step(60);
    return { renders: hh.renders, moved: __game.match.time < time };
  });
  assert.deepEqual(resumed, { renders: 60, moved: true });
});

test('Hoop Heads withdrawing from a cup after a win drops the old match', async t => {
  const page = await hoop(t);
  const result = await page.evaluate(() => {
    __game.tour(0, 0, 'robo');
    document.getElementById('ladGo').click(); __game.endNow(0); hh.untilResult();
    // The won match keeps its own number behind the result and ladder, even after a redraw.
    const hud = [hh.info.mode];
    document.getElementById('rAgain').click(); // the ladder, with the won match still behind it
    const ladder = __game.state;
    document.getElementById('game').dispatchEvent(new Event('contextrestored')); hh.step(1);
    hud.push(hh.info.tags[1]);
    document.getElementById('ladBack').click(); document.getElementById('cfYes').click();
    // A late redraw of the cups screen used to read the dropped tournament and throw.
    document.getElementById('game').dispatchEvent(new Event('contextrestored'));
    hh.renders = 0; hh.step(2);
    document.getElementById('cupsBack').click();
    const clock = __game.demo.clock; hh.step(2);
    return { hud, ladder, match: __game.match, renders: hh.renders, state: __game.state, demo: __game.demo.clock > clock };
  });
  assert.deepEqual(result, { hud: ['الكأس البرونزية • المباراة 1 من 5', 'الخصم 1 من 5'], ladder: 'ladder', match: null, renders: 4, state: 'title', demo: true });
});

test('Hoop Heads draws a high ball over the scoreboard and skips the flash for reduced motion', async t => {
  const page = await hoop(t);
  const result = await page.evaluate(() => {
    __game.start({ mode: 'duo' }); __game.skipIntro(); hh.step(1);
    const m = __game.match, b = m.ball, ctx = document.getElementById('game').getContext('2d');
    const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
    // The peak of a long shot, over player 1's blue plate (a seam-free spot inside the ball).
    Object.assign(b, { hidden: false, holder: null, state: 'shot', x: 480, y: 50, rot: 0, fire: false });
    b.trail.length = 0;
    hh.draw(1);
    const ball = pixel(484, 58);
    // A fire ball half below the scoreboard: its glow on the sky beside it is painted once.
    Object.assign(b, { x: 640, y: 118, fire: true });
    hh.draw(1); const glow = pixel(618, 122);
    b.hidden = true;
    hh.draw(1); const plain = pixel(640, 250), sky = pixel(618, 122);
    m.flash = 1; Kit.motion.setPreference('reduce');
    hh.draw(1); const reduced = pixel(640, 250);
    Kit.motion.setPreference('full');
    hh.draw(1); const flashed = pixel(640, 250);
    return { ball, glow, sky, plain, reduced, flashed };
  });
  const [r, , b] = result.ball;
  assert.ok(r > 180 && b < 130, `the ball is drawn over the HUD (got rgb ${result.ball})`);
  const once = [255, 159, 28].map((v, i) => (v + result.sky[i]) / 2); // #ff9f1c at 0.5 alpha
  assert.ok(once.every((v, i) => Math.abs(v - result.glow[i]) <= 4), `one glow (got rgb ${result.glow}, want ${once})`);
  assert.deepEqual(result.reduced, result.plain, 'reduced motion draws no full-screen flash');
  assert.notDeepEqual(result.flashed, result.plain, 'full motion keeps the flash');
});
