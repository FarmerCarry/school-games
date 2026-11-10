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
// Steps only simulate unless asked to paint (painting every frame on SwiftShader is what made
// this file slow), and Math.random is seeded so every run plays out the same way.
// sumo.texts collects text drawn on the main canvas.
async function game(t) {
  const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(() => {
    let seed = 7;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const sumo = window.sumo = { texts: [] };
    let kit, update, render;
    sumo.step = (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); };
    sumo.key = (code, n = 1) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code }));
      sumo.step(1);
      window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code }));
      sumo.step(n - 1);
    };
    // the canvas text of one painted frame
    sumo.frameTexts = () => { sumo.texts.length = 0; render(0); return sumo.texts.slice(); };
    Object.defineProperty(window, 'Kit', { configurable: true, get: () => kit, set(value) {
      kit = value;
      kit.loop = (u, r) => { update = u; render = r; return { stop() {} }; };
    } });
    const proto = CanvasRenderingContext2D.prototype, main = c => c.canvas.id === 'game';
    const fillText = proto.fillText;
    proto.fillText = function (s) { if (main(this)) sumo.texts.push(String(s)); return fillText.apply(this, arguments); };
  });
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
  // a belly slam from trampoline height travels (and bounces) much further than a low one
  const slams = await page.evaluate(() => {
    const slam = rivalFlying => {
      __game.restartRound('bouncy'); __game.P[1].ai.think = 1e9; sumo.step(100);
      const [p, o] = __game.P;
      Object.assign(p, { x: 760, y: 150, vx: 0, vy: 0, grounded: false, plat: null, action: 'none', canDive: true, noSnap: 1 });
      if (rivalFlying) Object.assign(o, { x: 1080, y: 300, vx: 600, vy: -200, grounded: false, plat: null, wasHit: true, action: 'stun', t: 0.3, noSnap: 1 });
      else o.x = 1000;
      sumo.key('KeyS');
      return p.action;
    };
    return [slam(true), slam(false)];
  });
  assert.deepEqual(slams, ['none', 'dive'], 'a high slam that would land past the trampoline is held, but hits a standing rival');
});

test('a double fall gives two floaties and is not called a perfect round', async t => {
  const page = await game(t);
  await fight(page);
  const result = await page.evaluate(() => {
    const [a, b] = __game.P;
    Object.assign(a, { x: 1150, y: 380, vx: 0, vy: 0, grounded: false, plat: null, action: 'none', hits: 0, noSnap: 1 });
    Object.assign(b, { x: 1200, y: 480, vx: 0, vy: 0, grounded: false, plat: null, action: 'none', noSnap: 1 });
    let texts = [];
    for (let i = 0; i < 150; i++) { sumo.step(1); if (!texts.length && __game.state.score[0]) texts = sumo.frameTexts(); }
    return { floats: __game.P.map(p => p.floatX), out: __game.P.map(p => p.out), score: __game.state.score, texts };
  });
  assert.deepEqual(result.out, [true, true]);
  assert.deepEqual(result.score, [1, 0], 'the rival fell first, so the point still goes to the player');
  assert.ok(Math.abs(result.floats[0] - result.floats[1]) >= 150, `separate floaties (${result.floats})`);
  assert.ok(result.texts.includes('الخصم سقط أولاً!'));
  assert.ok(!result.texts.includes('جولة مثالية!'));
  // falling together into the gap arena's middle gap: the second floatie does not sit in front of a pillar
  const gap = await page.evaluate(() => {
    __game.restartRound('gap'); __game.P[1].ai.think = 1e9; sumo.step(100);
    const [a, b] = __game.P;
    Object.assign(a, { x: 640, y: 380, vx: 0, vy: 0, grounded: false, plat: null, action: 'none', noSnap: 1 });
    Object.assign(b, { x: 645, y: 470, vx: 0, vy: 0, grounded: false, plat: null, action: 'none', noSnap: 1 });
    sumo.step(150);
    return { floats: __game.P.map(p => p.floatX), splashed: __game.P.map(p => p.splashed) };
  });
  assert.deepEqual(gap.splashed, [true, true]);
  assert.ok(Math.abs(gap.floats[0] - gap.floats[1]) >= 150, `separate floaties (${gap.floats})`);
  // the stone pillars span x 290-580 and 700-990 at the start of a round
  for (const x of gap.floats) assert.ok(!(x > 290 && x < 580) && !(x > 700 && x < 990), `floatie at ${x} is in open water`);
});

test('Space jumps and the walking keys bring back the jump/attack keycaps', async t => {
  const page = await game(t);
  await fight(page);
  const jump = await page.evaluate(() => { const y = __game.P[0].y; sumo.key('Space', 4); return { before: y, after: __game.P[0].y, grounded: __game.P[0].grounded }; });
  assert.ok(jump.after < jump.before && !jump.grounded, 'Space makes player 1 jump');
  const hints = await page.evaluate(() => {
    sumo.step(480);
    const idle = sumo.frameTexts().includes('قفز');
    sumo.key('ArrowLeft', 20);
    const after = sumo.frameTexts();
    return { idle, shown: after.includes('قفز'), arrows: after.includes('↑') };
  });
  assert.deepEqual(hints, { idle: false, shown: true, arrows: true });
});

test('mashing Space (jump) through the final round does not skip the end screen', async t => {
  const page = await game(t);
  const result = await page.evaluate(() => {
    __game.start(1, 'easy'); __game.P[1].ai.think = 1e9;
    for (let r = 0; r < 4; r++) { sumo.step(100); __game.skipRound(0); sumo.step(200); }
    sumo.step(100); __game.skipRound(0);
    // about six presses a second, through the end of the round and two seconds of the podium
    for (let f = 0; f < 400 && __game.state.scr === 'game'; f += 10) sumo.key('Space', 10);
    const reached = __game.state.scr;
    for (let i = 0; i < 12; i++) sumo.key('Space', 10);
    const mashed = __game.state.scr;
    sumo.step(40);
    sumo.key('Space');
    return { reached, mashed, again: __game.state.scr, score: __game.state.score };
  });
  assert.deepEqual(result, { reached: 'over', mashed: 'over', again: 'game', score: [0, 0] }, 'a calm Space press still plays again');
});

test('a match won and then left from the pause menu during the celebration still counts, once', async t => {
  const page = await game(t);
  const run = await page.evaluate(() => {
    // wins a match 5-0 and pauses half a second into the winning celebration, before the podium
    const winAndPause = mode => {
      __game.start(mode, 'easy'); __game.P[1].ai.think = 1e9;
      for (let r = 0; r < 4; r++) { sumo.step(100); __game.skipRound(0); sumo.step(200); }
      sumo.step(100); __game.skipRound(0);
      for (let f = 0; f < 120 && __game.state.score[0] < 5; f++) sumo.step(1);
      sumo.step(30);
      sumo.key('KeyP');
      return { scr: __game.state.scr, paused: __game.state.paused, stored: localStorage.getItem('sg:sumo-bonk:stars') };
    };
    const saved = () => ({ stars: __game.save.stars, easy: __game.save.wins.easy, pvp: __game.save.wins.pvp, matches: __game.save.matches });
    const menu = winAndPause(1);
    document.getElementById('bMenu').click(); sumo.step(200);
    const afterMenu = { scr: __game.state.scr, halo: !!__game.save.special.halo, ...saved() };
    const restart = winAndPause(1);
    sumo.key('KeyR', 10);
    const afterRestart = { scr: __game.state.scr, phase: __game.state.phase, score: __game.state.score, ...saved() };
    // resuming still reaches the podium, which shows the saved result without awarding it again
    const resume = winAndPause(1);
    document.getElementById('bResume').click(); sumo.step(300);
    const podium = { scr: __game.state.scr, earned: document.getElementById('oStars').textContent, ...saved() };
    // two players on one PC are saved the same way
    const duo = winAndPause(2);
    document.getElementById('bMenu').click(); sumo.step(10);
    return { menu, afterMenu, restart, afterRestart, resume, podium, duo, afterDuo: { scr: __game.state.scr, ...saved() } };
  });
  const celebrating = { scr: 'game', paused: true };
  assert.deepEqual(run.menu, { ...celebrating, stored: '8' }, 'the win is stored before the podium, so leaving the page keeps it too');
  assert.deepEqual(run.afterMenu, { scr: 'title', halo: true, stars: 8, easy: 1, pvp: 0, matches: 1 }, 'Menu keeps the stars (5 points + 3), the win and the 5-0 halo');
  assert.deepEqual(run.restart, { ...celebrating, stored: '16' });
  assert.deepEqual(run.afterRestart, { scr: 'game', phase: 'intro', score: [0, 0], stars: 16, easy: 2, pvp: 0, matches: 2 }, 'R keeps the win and starts a fresh match');
  assert.deepEqual(run.resume, { ...celebrating, stored: '24' });
  assert.deepEqual(run.podium, { scr: 'over', earned: '+8', stars: 24, easy: 3, pvp: 0, matches: 3 }, 'the podium counts up the same +8 and awards nothing more');
  assert.deepEqual(run.duo, { ...celebrating, stored: '32' });
  assert.deepEqual(run.afterDuo, { scr: 'title', stars: 32, easy: 3, pvp: 1, matches: 4 }, 'the two-player match counts once too');
});
