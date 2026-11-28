import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../../games/hoop-heads/engine.js');

const idle = () => ({ l: false, r: false, j: false, jPressed: false, s: false, sPressed: false, sReleased: false });

test('engine is pure, deterministic across runs with identical seeds, and exposes 5 ladder opponents', () => {
  assert.equal(E.OPPONENTS.length, 5);
  assert.equal(E.BALLS.length, 5);
  assert.equal(E.HEADS.length, 6);

  const a = E.createMatch({ mode: 'demo', stage: 1, seed: 2026 });
  const b = E.createMatch({ mode: 'demo', stage: 1, seed: 2026 });
  for (let i = 0; i < 300; i++) {
    E.stepMatch(a, E.FIXED_DT);
    E.stepMatch(b, E.FIXED_DT);
  }
  assert.equal(a.ball.x, b.ball.x);
  assert.equal(a.ball.y, b.ball.y);
  assert.equal(a.players[0].x, b.players[0].x);
  assert.equal(a.players[1].x, b.players[1].x);
  assert.equal(a.players[0].score, b.players[0].score);
  assert.equal(a.players[1].score, b.players[1].score);
});

test('sweet-spot charged 2-point and 3-point shots swish cleanly through the hoop without touching rim', () => {
  for (const [startX, expectedPts] of [[860, 2], [620, 3]]) {
    const m = E.createMatch({ mode: 'duo', seed: 101 });
    m.phase = 'play';
    const p0 = m.players[0];
    p0.x = startX; p0.y = E.FLOOR_Y; p0.onGround = true;
    m.players[1].x = 200; // keep defender out of the way
    m.ball.holder = p0; m.ball.state = 'held';

    // Press shoot to begin charging
    E.stepMatch(m, E.FIXED_DT, [{ ...idle(), s: true, sPressed: true }, idle()]);
    assert.equal(p0.charging, true);

    // Hold until inside sweet spot (0.65)
    for (let i = 0; i < 60 && p0.charge < E.SWEET_MID; i++) {
      E.stepMatch(m, E.FIXED_DT, [{ ...idle(), s: true }, idle()]);
    }
    assert.ok(p0.charge >= E.SWEET_MIN && p0.charge <= E.SWEET_MAX, 'charge reaches sweet spot');

    // Release shoot
    E.stepMatch(m, E.FIXED_DT, [{ ...idle(), s: false, sReleased: true }, idle()]);
    assert.equal(m.ball.state, 'shot');
    assert.equal(m.ball.swishAim, true);
    assert.equal(m.ball.pts, expectedPts);

    let scoreEv = null;
    for (let i = 0; i < 120 && !scoreEv; i++) {
      const evs = E.stepMatch(m, E.FIXED_DT, [idle(), idle()]);
      scoreEv = evs.find(e => e.type === 'score');
    }
    assert.ok(scoreEv, `sweet-spot ${expectedPts}pt shot must score`);
    assert.equal(scoreEv.pts, expectedPts);
    assert.equal(scoreEv.swish, true, 'sweet-spot shot must register as a swish');
    assert.equal(p0.score, expectedPts);
    assert.equal(p0.st.swishes, 1);
  }
});

test('normal Slam Dunk and half-court Fireball Super Dunk score 2 and 3 points with defender blast', () => {
  const m = E.createMatch({ mode: 'duo', seed: 202 });
  m.phase = 'play';
  const p0 = m.players[0], p1 = m.players[1];

  // Normal dunk near hoop
  p0.x = 960; p0.y = E.FLOOR_Y; p0.onGround = true;
  p1.x = 240;
  m.ball.holder = p0; m.ball.state = 'held';
  assert.equal(E.canDunk(m, p0), true);
  E.stepMatch(m, E.FIXED_DT, [{ ...idle(), s: true, sPressed: true }, idle()]);
  assert.ok(p0.dunk && !p0.dunk.isSuper);
  for (let i = 0; i < 60; i++) E.stepMatch(m, E.FIXED_DT, [idle(), idle()]);
  assert.equal(p0.score, 2);
  assert.equal(p0.st.dunks, 1);

  // Fireball Super Dunk from near half-court!
  m.phase = 'play';
  p0.x = 580; p0.y = E.FLOOR_Y; p0.onGround = true; p0.dunk = null;
  p1.x = 720; p1.y = E.FLOOR_Y; p1.onGround = true; p1.stunT = 0;
  m.ball.holder = p0; m.ball.state = 'held'; m.ball.scoredT = 0;
  assert.equal(E.canDunk(m, p0), false, 'half-court requires super meter');

  p0.super = 100;
  assert.equal(E.canDunk(m, p0), true, 'full super meter unlocks half-court Fireball Super Dunk');
  E.stepMatch(m, E.FIXED_DT, [{ ...idle(), s: true, sPressed: true }, idle()]);
  assert.ok(p0.dunk && p0.dunk.isSuper, 'launches Fireball Super Dunk');
  assert.ok(p1.stunT > 0 && p1.vx > 200, 'blasts nearby defender playfully');
  assert.equal(p0.super, 0, 'consumes super meter');

  for (let i = 0; i < 70; i++) E.stepMatch(m, E.FIXED_DT, [idle(), idle()]);
  assert.equal(p0.score, 5, 'Super Dunk adds +3 points');
});

test('playful bump-steal snatches ball and pickup shield prevents immediate counter-steal', () => {
  const m = E.createMatch({ mode: 'duo', seed: 303 });
  m.phase = 'play';
  const p0 = m.players[0], p1 = m.players[1];

  p1.x = 640; p1.y = E.FLOOR_Y; p1.protect = 0;
  p0.x = 565; p0.y = E.FLOOR_Y; p0.stealCd = 0;
  m.ball.holder = p1; m.ball.state = 'held';

  const evs = E.stepMatch(m, E.FIXED_DT, [{ ...idle(), s: true, sPressed: true }, idle()]);
  assert.ok(evs.some(e => e.type === 'steal' && e.player === 0));
  assert.equal(m.ball.holder, p0);
  assert.ok(p0.protect > 0.5, 'stealer gets pickup shield');
  assert.ok(p1.stunT > 0, 'victim gets brief cartoon stun');

  // Immediate counter-steal blocked while shield holds
  p1.stunT = 0; p1.stealCd = 0; p1.x = p0.x + 50;
  E.stepMatch(m, E.FIXED_DT, [idle(), { ...idle(), s: true, sPressed: true }]);
  assert.equal(m.ball.holder, p0, 'pickup shield prevents instant ping-pong counter-steal');
});

test('airborne defender blocks opponent shot cleanly and gains Super Meter', () => {
  const m = E.createMatch({ mode: 'duo', seed: 404 });
  m.phase = 'play';
  const p0 = m.players[0], p1 = m.players[1];
  p1.x = 760; p1.y = 430; p1.onGround = false; p1.super = 0;
  Object.assign(m.ball, {
    holder: null, state: 'shot', shooter: p0,
    x: 745, y: 380, prevX: 720, prevY: 380, vx: 380, vy: -80, scoredT: 0
  });
  const evs = E.stepMatch(m, E.FIXED_DT, [idle(), idle()]);
  assert.ok(evs.some(e => e.type === 'block' && e.player === 1));
  assert.equal(m.ball.state, 'loose');
  assert.ok(p1.super >= 20);
  assert.equal(p1.st.blocks, 1);
});

test('backboard and rim collisions bounce the ball deterministically without tunneling', () => {
  const m = E.createMatch({ mode: 'duo', seed: 505 });
  m.phase = 'play';
  m.players[0].x = 220; m.players[1].x = 320;
  const h = m.hoops[1];

  // Aim fast shot directly at right backboard
  Object.assign(m.ball, {
    holder: null, state: 'shot', shooter: m.players[0],
    x: h.boardX - E.BALL_R - 4, y: h.y - 40,
    prevX: h.boardX - E.BALL_R - 14, prevY: h.y - 40,
    vx: 650, vy: 0, touchedBoard: false, scoredT: 0
  });
  let boardEv = null;
  for (let i = 0; i < 6 && !boardEv; i++) {
    const evs = E.stepMatch(m, E.FIXED_DT, [idle(), idle()]);
    boardEv = evs.find(e => e.type === 'board');
  }
  assert.ok(boardEv, 'backboard must emit board hit event');
  assert.ok(m.ball.vx < 0, 'ball must bounce off right backboard to the left');
  assert.ok(m.ball.x <= h.boardX - E.BALL_R + 0.1, 'ball must never tunnel through backboard');
});

test('save schema ignores legacy shapes, tracks stars/coins/unlocks, and handles locker purchases', () => {
  // Legacy / corrupt saves reset safely to v3 defaults
  const clean = E.loadSave({ coins: 999, cups: { b: true } });
  assert.equal(clean.v, 3);
  assert.equal(clean.coins, 0);
  assert.equal(E.totalStars(clean), 0);

  // Buying a ball deducts coins and equips it
  clean.coins = 50;
  assert.equal(E.buyOrEquipBall(clean, 'gold').ok, false, 'cannot afford gold ball');
  const buy = E.buyOrEquipBall(clean, 'neon');
  assert.equal(buy.ok, true);
  assert.equal(buy.bought, true);
  assert.equal(clean.ball, 'neon');
  assert.equal(clean.coins, 15);

  // Re-equipping owned item costs 0 coins
  const eq = E.buyOrEquipBall(clean, 'classic');
  assert.equal(eq.ok, true);
  assert.equal(eq.bought, false);
  assert.equal(clean.coins, 15);

  // Buying a 3D head
  clean.coins = 40;
  const hBuy = E.buyOrEquipHead(clean, 'cap');
  assert.equal(hBuy.ok, true);
  assert.equal(clean.head, 'cap');
  assert.equal(clean.coins, 10);
});

test('all 5 mid-court power-ups work, quick taps sink generously, and intro/goal pauses are snappy (0.45s)', () => {
  assert.equal(E.POWERS.length, 5);
  assert.deepEqual(E.POWERS.map(p => p.id), ['mega', 'ice', 'rocket', 'magnet', 'bigrim']);

  // Snappy 0.45s intro
  const m0 = E.createMatch({ mode: 'duo', seed: 601 });
  assert.equal(m0.phase, 'intro');
  for (let i = 0; i < 30; i++) E.stepMatch(m0, E.FIXED_DT, [idle(), idle()]);
  assert.equal(m0.phase, 'play', '0.45s intro transitions to play within 0.5s');

  // Test each of the 5 mid-court power-ups picked up by P0
  for (const pw of E.POWERS) {
    const m = E.createMatch({ mode: 'duo', seed: 602 });
    m.phase = 'play';
    const p0 = m.players[0];
    p0.x = 640; p0.y = E.FLOOR_Y;
    m.powerup = { ...pw, x: 640, y: E.FLOOR_Y - 54, t: 0, life: 10 };
    const evs = E.stepMatch(m, E.FIXED_DT, [idle(), idle()]);
    assert.ok(evs.some(e => e.type === 'powerup' && e.id === pw.id && e.player === 0), `picks up ${pw.id}`);
    assert.equal(m.powerup, null);

    if (pw.id === 'mega') {
      assert.ok(p0.megaT > 5);
      // Giant Ball adds +2 bonus points on top of 2pt basket (= 4 pts)!
      const h = m.hoops[1];
      Object.assign(m.ball, { holder: null, shooter: p0, state: 'shot', pts: 2, isMega: true, x: h.x, y: h.y - 2, prevX: h.x, prevY: h.y - 10, vx: 0, vy: 360, scoredT: 0 });
      E.stepMatch(m, E.FIXED_DT, [idle(), idle()]);
      assert.equal(p0.score, 4, 'Giant Ball scores +2 bonus points');
    } else if (pw.id === 'ice') {
      assert.ok(m.hoops[0].frozenT > 5, 'freezes own hoop against enemy shots');
      const h = m.hoops[0];
      Object.assign(m.ball, { holder: null, shooter: m.players[1], state: 'shot', pts: 2, x: h.x, y: h.y - 16, prevX: h.x, prevY: h.y - 24, vx: 0, vy: 360, scoredT: 0 });
      const bEvs = E.stepMatch(m, E.FIXED_DT, [idle(), idle()]);
      assert.ok(bEvs.some(e => e.type === 'ice_block'), 'frozen hoop bounces enemy shot');
      assert.equal(m.players[1].score, 0);
    } else if (pw.id === 'rocket') {
      assert.ok(p0.rocketT > 5);
      E.stepMatch(m, E.FIXED_DT, [{ ...idle(), j: true, jPressed: true }, idle()]);
      assert.ok(p0.vy < -900, 'Rocket Boots super-boosts jump velocity');
    } else if (pw.id === 'magnet') {
      assert.ok(p0.magnetT > 5);
      Object.assign(m.ball, { holder: null, state: 'loose', x: 760, y: 500, prevX: 760, prevY: 500, vx: 0, vy: 0, pickupCd: 0, scoredT: 0 });
      E.stepMatch(m, E.FIXED_DT, [idle(), idle()]);
      assert.ok(m.ball.vx < -5, 'Ball Magnet pulls nearby loose ball toward player');
    } else if (pw.id === 'bigrim') {
      assert.ok(m.hoops[1].bigRimT > 5);
      assert.ok(m.hoops[1].rimR >= 60, 'Big Rim widens target hoop rim');
    }
  }

  // Generous quick-tap shot magnetism (no harsh forced-miss airball!)
  const mq = E.createMatch({ mode: 'duo', seed: 603 });
  mq.phase = 'play';
  const p0 = mq.players[0];
  p0.x = 840; p0.y = E.FLOOR_Y; p0.onGround = true;
  mq.players[1].x = 200;
  mq.ball.holder = p0; mq.ball.state = 'held';
  E.stepMatch(mq, E.FIXED_DT, [{ ...idle(), s: true, sPressed: true }, idle()]);
  E.stepMatch(mq, E.FIXED_DT, [{ ...idle(), s: false, sReleased: true }, idle()]);
  assert.equal(mq.ball.state, 'shot');
  assert.equal(mq.ball.swishAim, true, 'quick tap enables generous swish magnetism');
  let scored = false;
  for (let i = 0; i < 120 && !scored; i++) {
    const evs = E.stepMatch(mq, E.FIXED_DT, [idle(), idle()]);
    if (evs.some(e => e.type === 'score')) scored = true;
  }
  assert.equal(scored, true, 'quick tap shot sinks cleanly');
});
