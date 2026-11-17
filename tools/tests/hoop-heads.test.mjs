import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../browser.mjs';
import { startTestServer } from '../test-server.mjs';
import { testHoopRewards } from '../regressions-hoop.mjs';

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

async function hoop(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });

  await page.addInitScript(() => {
    let kit, update, render;
    const hh = window.hh = { renders: 0, failSave: false, matches: [] };
    hh.step = (n = 1) => { for (let i = 0; i < n; i++) { update(1 / 60); render(0); } };
    hh.draw = (n = 1) => { for (let i = 0; i < n; i++) render(0); };
    hh.down = code => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    hh.up = code => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    hh.tap = code => { hh.down(code); hh.up(code); };
    hh.untilResult = () => { for (let i = 0; i < 600 && __game.state !== 'result'; i++) hh.step(1); return __game.state; };
    hh.untilDecided = () => { for (let i = 0; i < 600 && !__game.match.ended; i++) hh.step(1); hh.step(12); return __game.match.phase; };
    Object.defineProperty(window, 'Kit', {
      configurable: true,
      get: () => kit,
      set(value) {
        kit = value;
        kit.loop = (u, r) => { update = u; render = r; return { running: true, stop() {} }; };
      }
    });
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key) {
      if (hh.failSave && key === 'sg:hoop-heads:save') {
        throw new DOMException('Full storage fixture', 'QuotaExceededError');
      }
      return write.apply(this, arguments);
    };
  });

  await page.goto(`${server.origin}/games/hoop-heads/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.HH);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const draw = HH.render, make = HH.newMatch;
    HH.render = function (c, v, m, info) { hh.renders++; hh.info = info; return draw.apply(this, arguments); };
    HH.newMatch = function (o) {
      if (o.mode !== 'demo') hh.matches.push(o.mode === 'cpu' ? 'cpu-' + o.diff : o.mode);
      return make.apply(this, arguments);
    };
  });
  return page;
}

test('Hoop Heads sub-frame key taps jump, slam dunk, and shoot at 100% movement speed without freezing', async t => {
  const page = await hoop(t);
  const result = await page.evaluate(() => {
    __game.start({ mode: 'duo' }); __game.skipIntro(); hh.step(1);
    const m = __game.match, p = m.players[0];

    // 1. Sub-frame tap jumps cleanly
    __game.give(0, 420);
    hh.tap('KeyW'); hh.step(1);
    const hopped = !p.onGround && p.vy < -600;
    hh.step(80);

    // 2. Holding shoot while sprinting keeps 100% movement speed (ZERO movement freeze!)
    __game.give(0, 350);
    hh.down('KeyD'); hh.down('Space');
    hh.step(12);
    const mobileSpeed = p.vx;
    hh.up('Space'); hh.up('KeyD');
    hh.step(2);
    const cleanlyShot = m.ball.state === 'shot' && m.ball.vy < -250;

    // 3. Sub-frame tap inside dunk range launches flying Slam Dunk and scores!
    __game.give(0, 980);
    const canDunk = HH.canDunk(m, p);
    hh.tap('KeyS'); hh.step(1);
    const dunking = !!p.dunk;
    hh.step(60);

    return {
      hopped,
      mobileFree: mobileSpeed > 440,
      cleanlyShot,
      canDunk,
      dunking,
      score: p.score,
      dunks: p.st.dunks
    };
  });
  assert.deepEqual(result, {
    hopped: true,
    mobileFree: true,
    cleanlyShot: true,
    canDunk: true,
    dunking: true,
    score: 2,
    dunks: 1
  });
});

test('Hoop Heads full Fire Super Bar launches half-court Meteor Super Dunk and shatters Ice Shield', async t => {
  const page = await hoop(t);
  const result = await page.evaluate(() => {
    __game.start({ mode: 'duo' }); __game.skipIntro(); hh.step(1);
    const m = __game.match, p0 = m.players[0], p1 = m.players[1];
    __game.give(0, 560); // 572px from right hoop (3pt half-court territory!)
    p1.x = 700; p1.y = HH.FLOOR;
    m.hoops[1].iceT = 5.0; // Enemy hoop protected by Ice Shield
    const blockedBeforeSuper = !HH.canDunk(m, p0);

    p0.super = 100;
    const superRangeReady = HH.canDunk(m, p0);
    hh.tap('Space'); hh.step(1);
    const isSuper = !!(p0.dunk && p0.dunk.isSuper);
    const blastedDefender = p1.vx > 300 && p1.stunT > 0;
    const shatteredIce = m.hoops[1].iceT === 0;
    hh.step(70);

    return {
      blockedBeforeSuper,
      superRangeReady,
      isSuper,
      blastedDefender,
      shatteredIce,
      score: p0.score,
      superReset: p0.super < 25
    };
  });
  assert.deepEqual(result, {
    blockedBeforeSuper: true,
    superRangeReady: true,
    isSuper: true,
    blastedDefender: true,
    shatteredIce: true,
    score: 3,
    superReset: true
  });
});

test('Hoop Heads bidirectional Dash-Steal works from either side with anti-ping-pong pickup shield', async t => {
  const page = await hoop(t);
  const result = await page.evaluate(() => {
    __game.start({ mode: 'duo' }); __game.skipIntro(); hh.step(1);
    const m = __game.match, p0 = m.players[0], p1 = m.players[1];

    // Steal from the left of ball-handler
    __game.give(1, 650);
    p1.protect = 0;
    p0.x = 580; p0.y = HH.FLOOR; p0.stealCd = 0;
    hh.tap('Space'); hh.step(1);
    const stoleFromLeft = m.ball.holder === p0 && p0.protect > 0.5;

    // Immediate counter-steal blocked by pickup shield!
    p1.x = p0.x + 40; p1.stealCd = 0; p1.stunT = 0;
    hh.tap('Enter'); hh.step(1);
    const shieldHeld = m.ball.holder === p0;

    // Steal from the right of ball-handler once shield expires
    __game.give(1, 600);
    p1.protect = 0;
    p0.x = 675; p0.y = HH.FLOOR; p0.stealCd = 0; p0.stunT = 0;
    hh.tap('Space'); hh.step(1);
    const stoleFromRight = m.ball.holder === p0 && p0.st.steals === 2;

    return { stoleFromLeft, shieldHeld, stoleFromRight };
  });
  assert.deepEqual(result, { stoleFromLeft: true, shieldHeld: true, stoleFromRight: true });
});

test('Hoop Heads mid-court power-ups (Mega-Ball, Ice Shield, Rocket Shoes, Magnet) all work cleanly', async t => {
  const page = await hoop(t);
  const result = await page.evaluate(() => {
    __game.start({ mode: 'duo' }); __game.skipIntro(); hh.step(1);
    const m = __game.match, p0 = m.players[0];

    // 1. Mega-Ball (+1 bonus point & bigger ball)
    m.orb = { id: 'mega', x: p0.x, y: p0.y - 40, baseY: p0.y - 40, t: 0, life: 10 };
    hh.step(2);
    const megaActive = m.megaT > 0 && m.ball.r > HH.BALL_R;
    __game.give(0, 990);
    hh.tap('Space'); hh.step(55);
    const megaDunkPts = p0.score; // 2 + 1 = 3!

    // 2. Ice Shield freezes P1's own hoop and bounces opponent shots
    m.phase = 'play';
    m.orb = { id: 'ice', x: p0.x, y: p0.y - 40, baseY: p0.y - 40, t: 0, life: 10 };
    hh.step(2);
    const iceActive = m.hoops[0].iceT > 4;
    Object.assign(m.ball, {
      holder: null, state: 'shot', shooter: m.players[1],
      x: m.hoops[0].x, y: m.hoops[0].y - 52, vx: 0, vy: 320, pts: 2, touched: false, scoredT: 0
    });
    hh.step(4);
    const iceBlocked = m.players[1].score === 0 && m.ball.vy < 0;

    // 3. Rocket Shoes grants sky-high jump
    m.orb = { id: 'rocket', x: p0.x, y: p0.y - 40, baseY: p0.y - 40, t: 0, life: 10 };
    hh.step(2);
    p0.y = HH.FLOOR; p0.onGround = true;
    hh.tap('KeyW'); hh.step(1);
    const rocketJumpVy = p0.vy;

    // 4. Magnet charges next shot with homing
    m.orb = { id: 'magnet', x: p0.x, y: p0.y - 20, baseY: p0.y - 20, t: 0, life: 10 };
    hh.step(2);
    const hasMagnet = p0.magnet === 1;

    return {
      megaActive,
      megaDunkPts,
      iceActive,
      iceBlocked,
      rocketBoosted: rocketJumpVy < -950,
      hasMagnet
    };
  });
  assert.deepEqual(result, {
    megaActive: true,
    megaDunkPts: 3,
    iceActive: true,
    iceBlocked: true,
    rocketBoosted: true,
    hasMagnet: true
  });
});

test('Hoop Heads all 4 arenas, 6 fighters, 3 unlocked cups, quick play and locker shop work', async t => {
  const page = await hoop(t);
  const check = await page.evaluate(() => {
    const arenas = HH.COURTS.length;
    const fighters = HH.CHARS.length;
    document.querySelector('[data-act="tour"]').click();
    const cupsShown = document.querySelectorAll('#cupRow .cupc').length;
    document.getElementById('cupsBack').click();

    // Buy & equip a ball in shop
    HH.save.coins = 100;
    document.querySelector('[data-act="shop"]').click();
    const shopItems = document.querySelectorAll('#shopGrid .sh-item');
    shopItems[1].click(); // Buy neon ball (45 coins)
    const boughtNeon = HH.save.ball === 'neon' && HH.save.coins === 55;
    document.getElementById('shopBack').click();

    // 1-Click Quick Play from title screen
    document.getElementById('quickPlay').click();
    const quickStarted = __game.state === 'play' && __game.match.ballSkin === 'neon';

    return { arenas, fighters, cupsShown, boughtNeon, quickStarted };
  });
  assert.deepEqual(check, {
    arenas: 4,
    fighters: 6,
    cupsShown: 3,
    boughtNeon: true,
    quickStarted: true
  });
});

test('Hoop Heads result screen ignores mashed match keys during lock, then Enter plays again', async t => {
  const page = await hoop(t);
  const states = await page.evaluate(() => {
    __game.start({ mode: 'cpu', diff: 0 }); __game.endNow(0);
    const seen = [hh.untilResult()];
    hh.tap('Space'); hh.tap('Enter'); hh.step(1); seen.push(__game.state);
    hh.step(35); hh.tap('Enter'); hh.step(1); seen.push(__game.state);
    return seen;
  });
  assert.deepEqual(states, ['result', 'result', 'play']);
});

test('Hoop Heads failed saves warn with a retry that writes the latest progress', async t => {
  const page = await hoop(t);
  const result = await page.evaluate(() => {
    const before = !!document.querySelector('.sg-save-status');
    hh.failSave = true;
    __game.start({ mode: 'cpu', diff: 0 }); __game.endNow(0); hh.untilResult();
    const panel = document.querySelector('.sg-save-status');
    const failed = { shown: !panel.hidden, state: panel.dataset.state, stored: HH.store.get('save', null) };
    hh.failSave = false;
    panel.querySelector('button').click();
    return { before, failed, state: panel.dataset.state, games: HH.store.get('save', null).stats.games };
  });
  assert.deepEqual(result, {
    before: false,
    failed: { shown: true, state: 'failed', stored: null },
    state: 'saved',
    games: 1
  });
});

test('Hoop Heads draws a paused match once, redraws on resize or restore, and resumes cleanly', async t => {
  const page = await hoop(t);
  const paused = await page.evaluate(() => {
    __game.start({ mode: 'duo' }); __game.skipIntro(); hh.step(20);
    hh.tap('KeyP'); hh.renders = 0; hh.step(1);
    const first = hh.renders;
    hh.renders = 0; hh.step(90);
    return { state: __game.state, first, idle: hh.renders };
  });
  assert.deepEqual(paused, { state: 'pause', first: 1, idle: 0 });

  await page.setViewportSize({ width: 1000, height: 600 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => { hh.renders = 0; hh.step(20); return hh.renders; }), 1, 'resize redraws once');

  const restored = await page.evaluate(() => {
    const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
    const transform = () => Array.from(ctx.getTransform().toFloat64Array());
    const before = transform();
    canvas.width = canvas.width;
    canvas.dispatchEvent(new Event('contextrestored'));
    hh.renders = 0; hh.step(20);
    return { same: JSON.stringify(transform()) === JSON.stringify(before), renders: hh.renders };
  });
  assert.deepEqual(restored, { same: true, renders: 1 });

  const motion = await page.evaluate(() => {
    __game.match.flash = 0.25;
    Kit.motion.setPreference('reduce');
    hh.renders = 0; hh.step(20);
    const reduced = hh.renders;
    Kit.motion.setPreference('full'); hh.step(1);
    return reduced;
  });
  assert.equal(motion, 1, 'motion preference change redraws still frame once');

  const resumed = await page.evaluate(() => {
    const time = __game.match.time;
    document.getElementById('pResume').click();
    hh.renders = 0; hh.step(30);
    return { renders: hh.renders, moved: __game.match.time < time };
  });
  assert.deepEqual(resumed, { renders: 30, moved: true });
});

test('Hoop Heads rewards & tournament final persistence match shared regression contract', async t => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  const { checks } = await testHoopRewards({ page, baseURL: `${server.origin}/` });
  assert.equal(checks, 4);
});
