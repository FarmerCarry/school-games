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
// followed by a render, and hh.draw(n) only renders. hh.renders counts scene draws and
// hh.stats lists the Kit.stats.round/end calls, e.g. ['round', 'cpu-0'], ['end', 'win', 5].
async function hoop(t, { fontGate } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let kit, update, render;
    const hh = window.hh = { renders: 0, failSave: false, stats: [] };
    hh.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
    hh.draw = (n = 1) => { for (let i = 0; i < n; i++) render(0); };
    hh.down = code => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    hh.up = code => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    // A whole press and release between two frames, as on a stuttering school PC.
    hh.tap = code => { hh.down(code); hh.up(code); };
    hh.untilResult = () => { for (let i = 0; i < 600 && __game.state !== 'result'; i++) hh.step(1); return __game.state; };
    // Until the engine decides the match, then a third of a second into its celebration.
    hh.untilDecided = () => { for (let i = 0; i < 600 && !__game.match.ended; i++) hh.step(1); hh.step(20); return __game.match.phase; };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { running: true, stop() {} }; };
      for (const name of ['round', 'end']) {
        const call = kit.stats[name];
        kit.stats[name] = function (...args) { hh.stats.push([name, ...args]); return call.apply(this, args); };
      }
    } });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (hh.failSave && key === 'sg:hoop-heads:save') throw new DOMException('Full storage fixture', 'QuotaExceededError');
      return write.apply(this, arguments);
    };
  });
  if (fontGate) await page.route('**/*.woff2', async route => { await fontGate; await route.continue(); });
  await page.goto(`${server.origin}/games/hoop-heads/`, { waitUntil: fontGate ? 'domcontentloaded' : 'load' });
  await page.waitForFunction(() => window.__game && window.HH);
  // Late fonts redraw once; let that happen before counting scene draws.
  await page.evaluate(async waitForFonts => {
    if (waitForFonts) {
      await document.fonts.ready;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const draw = HH.render;
    HH.render = function (c, v, m, info) { hh.renders++; hh.info = info; return draw.apply(this, arguments); };
  }, !fontGate);
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

// The result screen opens 2-3 s after the engine decides a match; a pause in between
// (P, a blur, the portal's Back) used to drop the win on Menu, Restart or R.
test('Hoop Heads keeps a match decided before a pause in its celebration', async t => {
  const page = await hoop(t);
  const result = await page.evaluate(() => {
    const pause = () => { hh.tap('KeyP'); hh.step(1); return __game.state; };
    __game.start({ mode: 'cpu', lv: 0 }); __game.skipIntro(); __game.endNow(0);
    const seen = [hh.untilDecided(), pause()];
    document.getElementById('pMenu').click(); document.getElementById('cfYes').click(); hh.step(1);
    seen.push(__game.state);
    const saved = HH.store.get('save', { stats: {} });
    const cpu = { coins: saved.coins, games: saved.stats.games, wins: saved.stats.wins, streak: saved.streak };
    // Two players, then R: the match counts once, with no winner reported.
    __game.start({ mode: 'duo' }); __game.skipIntro(); __game.endNow(1); hh.untilDecided();
    seen.push(pause()); hh.tap('KeyR'); hh.step(1); seen.push(__game.match.phase);
    // A resumed celebration still opens the result screen without saving again.
    __game.skipIntro(); __game.endNow(0); hh.untilDecided(); pause(); document.getElementById('pResume').click();
    seen.push(hh.untilResult());
    const { stats } = HH.store.get('save', { stats: {} });
    return { seen, cpu, games: stats.games, wins: stats.wins, coins: __game.save.coins, stats: hh.stats };
  });
  assert.deepEqual(result, {
    seen: ['end', 'pause', 'title', 'pause', 'intro', 'result'],
    cpu: { coins: 20, games: 1, wins: 1, streak: 1 }, games: 3, wins: 1, coins: 20 + 12 + 12,
    stats: [['round', 'cpu-0'], ['end', 'win', 5], ['round', 'duo'], ['end', 'end'], ['round', 'duo'], ['end', 'end']]
  });
});

test('Hoop Heads a cup match won before a pause moves the cup on instead of replaying it', async t => {
  const page = await hoop(t);
  const result = await page.evaluate(() => {
    __game.tour(0, 3, 'robo');
    document.getElementById('ladGo').click(); __game.skipIntro(); __game.endNow(0); hh.untilDecided();
    hh.tap('KeyP'); hh.step(1); hh.tap('KeyR'); hh.step(1);
    const ladder = { state: __game.state, done: document.querySelectorAll('#ladder .lslot.done').length };
    // The boss: Restart from the pause menu shows the cup that was just won.
    document.getElementById('ladGo').click(); __game.skipIntro(); __game.endNow(0); hh.untilDecided();
    hh.tap('KeyP'); hh.step(1); document.getElementById('pRestart').click();
    const saved = HH.store.get('save', { cups: {} });
    return { ladder, state: __game.state, text: document.getElementById('trText').textContent, cup: saved.cups.b, coins: saved.coins, stats: hh.stats };
  });
  assert.deepEqual(result, {
    ladder: { state: 'ladder', done: 4 }, state: 'trophy', text: 'فزت بـالكأس البرونزية!+169', cup: true,
    coins: (5 + 20 + 3 * 6) + (5 + 20 + 4 * 6) + 120,
    stats: [['round', 'tour-b-4'], ['end', 'win', 5], ['round', 'tour-b-5'], ['end', 'win', 5]]
  });
});

test('Hoop Heads a pause request on the two-player select screen calls off the ready countdown', async t => {
  const page = await hoop(t);
  const result = await page.evaluate(() => {
    document.querySelector('#mainMenu [data-act="duo"]').click();
    hh.tap('Space'); hh.tap('Enter'); hh.step(1);
    const counting = __game.sel.startT > 0;
    window.dispatchEvent(new Event('blur')); hh.step(120);
    const blurred = { state: __game.state, match: !!__game.match, ready: __game.sel.ready.slice() };
    hh.tap('Space'); hh.tap('Enter'); hh.step(60);
    return { counting, blurred, again: __game.state };
  });
  assert.deepEqual(result, { counting: true, blurred: { state: 'select', match: false, ready: [false, false] }, again: 'play' });
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

test('Hoop Heads bounds vector/fit caches, reuses them across resize and invalidates after restoration', async t => {
  const page = await hoop(t);
  const bounds = await page.evaluate(() => {
    const NativePath = Path2D;
    hh.paths = 0;
    window.Path2D = class extends NativePath { constructor() { super(); hh.paths++; } };
    const c = document.createElement('canvas').getContext('2d');
    HH.resetBg();
    for (let r = 10; r < 18; r++) HH.drawBall(c, 50, 50, r, 0, 'classic');
    const first = hh.paths;
    for (let r = 10; r < 18; r++) HH.drawBall(c, 50, 50, r, 1.2, 'neon');
    const warm = hh.paths - first;
    HH.drawBall(c, 50, 50, 18, 0, 'classic');
    const ninth = hh.paths;
    HH.drawBall(c, 50, 50, 10, 0, 'classic');
    const eviction = hh.paths - ninth;
    let measurements = 0, width = 200;
    c.measureText = () => { measurements++; return { width }; };
    HH.resetBg();
    for (let n = 0; n < 32; n++) HH.fitSize(c, 'label' + n, 24, 100);
    HH.fitSize(c, 'label0', 24, 100); const initialFits = measurements;
    HH.fitSize(c, 'label32', 24, 100); HH.fitSize(c, 'label0', 24, 100);
    const evictedFits = measurements - initialFits;
    width = 100;
    const cached = HH.fitSize(c, 'label0', 24, 100);
    HH.resetBg(); const refreshed = HH.fitSize(c, 'label0', 24, 100);
    __game.start({ mode: 'duo' }); __game.skipIntro(); hh.step(1);
    __game.save.court = 'roof';
    const scene = document.getElementById('game').getContext('2d'), drawImage = scene.drawImage;
    scene.drawImage = function (image) { hh.background = image; return drawImage.apply(this, arguments); };
    hh.draw(1); hh.roofPixels = hh.background.toDataURL();
    hh.paths = 0; hh.draw(30); const steady = hh.paths;
    return { first, warm, eviction, initialFits, evictedFits, cached, refreshed, steady };
  });
  assert.deepEqual(bounds, { first: 40, warm: 0, eviction: 5, initialFits: 32, evictedFits: 2, cached: 12, refreshed: 24, steady: 0 });
  await page.setViewportSize({ width: 1279, height: 719 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const sameBucket = await page.evaluate(() => {
    hh.paths = 0; hh.draw(1);
    return { reusedPaths: hh.paths === 0, sameBackground: hh.background.toDataURL() === hh.roofPixels };
  });
  assert.deepEqual(sameBucket, { reusedPaths: true, sameBackground: true }, 'same-bucket resize preserves the cached star field');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const resized = await page.evaluate(() => {
    hh.paths = 0; hh.draw(1); const rebuilt = hh.paths; hh.paths = 0; hh.draw(30);
    return { rebuilt, steady: hh.paths, backgroundWidth: hh.background.width };
  });
  assert.deepEqual(resized, { rebuilt: 0, steady: 0, backgroundWidth: 1920 }, 'vectors remain sharp while the court follows its scale key');
  const restored = await page.evaluate(() => {
    const cv = document.getElementById('game'); cv.width = cv.width;
    cv.dispatchEvent(new Event('contextrestored'));
    hh.paths = 0; hh.draw(1); const rebuilt = hh.paths; hh.paths = 0; hh.draw(30);
    return { rebuilt, steady: hh.paths };
  });
  assert.deepEqual(restored, { rebuilt: 9, steady: 0 });
});

test('Hoop Heads late local fonts invalidate warmed HUD text fits before repainting', async t => {
  let release;
  const fontGate = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  const page = await hoop(t, { fontGate });
  const before = await page.evaluate(() => {
    hh.widthReads = 0;
    const c = document.getElementById('game').getContext('2d'), measure = c.measureText;
    c.measureText = function () { hh.widthReads++; return measure.apply(this, arguments); };
    __game.start({ mode: 'duo' }); __game.skipIntro(); hh.step(1);
    const fonts = document.fonts.check('700 30px Fredoka', 'روبو A');
    hh.widthReads = 0; hh.draw(30);
    return { fonts, steady: hh.widthReads };
  });
  assert.deepEqual(before, { fonts: false, steady: 0 });
  release();
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => setTimeout(resolve, 50)); });
  const after = await page.evaluate(() => {
    hh.widthReads = 0; hh.draw(1); const rebuilt = hh.widthReads;
    hh.widthReads = 0; hh.draw(30);
    return { fonts: document.fonts.check('700 30px Fredoka', 'روبو A'), rebuilt, steady: hh.widthReads };
  });
  assert.equal(after.fonts, true);
  assert.ok(after.rebuilt > 0, 'font readiness recomputes the formerly cached text widths');
  assert.equal(after.steady, 0);
});
