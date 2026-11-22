'use strict';
const assert = require('node:assert/strict');
const P = require('./physics.js');

function simShot({ seed = 101, upgrades = {}, angle = 46, power = 0.96, bot = 'idle', dda = {} } = {}) {
  const course = P.createCourse(seed, dda);
  const ball = P.launch(course, upgrades, angle, power);
  const events = [];
  let frames = 0;

  while (!ball.done && frames++ < 4200) {
    let boost = false;
    if (bot === 'boost' && ball.mode === 'air' && ball.fuel > 0 && ball.time > 0.25) {
      boost = true;
    } else if (bot === 'skill' && ball.mode === 'air') {
      if (ball.fuel > 0 && (ball.vy < 14 || ball.time > 0.35)) boost = true;
      if (ball.vy < -2 && !ball.armed) {
        const pred = P.predictImpact(course, ball, 0.35);
        if (pred && pred.t < 0.20) {
          const res = P.pressDive(course, ball);
          assert.equal(res.type, 'arm');
        }
      }
    } else if (bot === 'dive' && ball.mode === 'air' && ball.vy < -2 && !ball.armed) {
      const pred = P.predictImpact(course, ball, 0.42);
      if (pred && pred.t < 0.18) P.pressDive(course, ball);
    }

    const ev = P.step(course, ball, upgrades, 1 / 60, { boost });
    events.push(...ev);
    assert(Number.isFinite(ball.x) && Number.isFinite(ball.y), 'ball position must stay finite');
    if (!ball.done) {
      assert(ball.y >= P.heightAt(course, ball.x) + ball.r - 1e-6, 'ball stays above terrain');
    }
  }

  assert(ball.done, 'every shot terminates');
  assert(ball.time <= P.MAX_TIME + 0.1, 'shot terminates within max time');
  assert.equal(events.filter(e => e.type === 'stop').length, 1, 'exactly one stop event');
  const coinIds = events.filter(e => e.type === 'coin').map(e => e.id);
  assert.equal(new Set(coinIds).size, coinIds.length, 'each coin collected at most once');
  return { ball, events, course };
}

// 1. Determinism & baseline first-shot sanity
const base = simShot({ seed: 101, upgrades: {}, angle: 45, power: 0.96, bot: 'idle' });
const repeat = simShot({ seed: 101, upgrades: {}, angle: 45, power: 0.96, bot: 'idle' });
assert.deepEqual(repeat.ball, base.ball, 'simulation is strictly deterministic');
assert(base.ball.maxX >= 60 && base.ball.maxX <= 360, 'starter shot distance feels rewarding: ' + base.ball.maxX);
assert(base.events.some(e => e.type === 'coin'), 'starter shot collects coins');

// Weak hit travels noticeably shorter than perfect hit
const weak = simShot({ seed: 101, upgrades: {}, angle: 45, power: 0.25, bot: 'idle' });
assert(weak.ball.maxX < base.ball.maxX * 0.72, 'weak hit travels shorter than perfect hit');

// 2. Aim & Power meter grades & DDA perfect band
assert.equal(P.isPerfectAngle(46), true);
assert.equal(P.isPerfectAngle(22), false);
assert.equal(P.grade(0.96, { perfectWidth: 0.14 }), 'perfect');
assert.equal(P.grade(0.78, { perfectWidth: 0.14 }), 'great');
assert.equal(P.grade(0.55, { perfectWidth: 0.14 }), 'good');
assert.equal(P.grade(0.30, { perfectWidth: 0.14 }), 'weak');
assert.equal(P.grade(0.80, { perfectWidth: 0.24 }), 'perfect', 'easier DDA widens golden zone');

// 3. Upgrades meaningfully improve flight & rewards
const boosted = simShot({ seed: 101, upgrades: { fuel: 4 }, angle: 48, power: 0.96, bot: 'boost' });
assert(boosted.ball.maxX > base.ball.maxX * 1.4, 'rocket boost extends flight significantly');
assert(boosted.events.some(e => e.type === 'boost'), 'rocket boost emits boost events');

const powered = simShot({ seed: 101, upgrades: { power: 6 }, angle: 46, power: 0.96, bot: 'idle' });
assert(powered.ball.maxX > base.ball.maxX * 1.5, 'power upgrade significantly boosts distance');

// Bounce upgrade increases rebound velocity on identical drop
const c0 = P.createCourse(101);
const bLow = Object.assign(P.launch(c0, { bounce: 0 }, 45, 0.9), { x: 24, y: P.heightAt(c0, 24) + P.BALL_R + 0.05, vx: 14, vy: -18 });
const bHigh = Object.assign(P.launch(c0, { bounce: 10 }, 45, 0.9), { x: 24, y: P.heightAt(c0, 24) + P.BALL_R + 0.05, vx: 14, vy: -18 });
P.step(c0, bLow, { bounce: 0 }, 1 / 60);
P.step(c0, bHigh, { bounce: 10 }, 1 / 60);
assert(bHigh.vy > bLow.vy, 'bounce upgrade increases bounce height');
assert(P.magnetRadius({ magnet: 10 }) > P.magnetRadius({ magnet: 0 }) * 2.5, 'magnet upgrade expands radius');

// 4. Interactive course features exist & respond
const scan = P.features(c0, 0, 2600);
assert(scan.trampolines.length >= 10, 'trampolines spawn');
assert(scan.tnts.length >= 10, 'tnt crates spawn');
assert(scan.balloons.length >= 25, 'balloons spawn');
assert(scan.rings.length >= 20, 'boost rings spawn');
assert(scan.ufos.length >= 15, 'ufos spawn');
assert(scan.stars.length >= 150, 'stars/coins spawn');

// Direct collision checks for TNT, Balloon, Ring, UFO & Water Skip
const t0 = scan.tnts[0];
const bt = Object.assign(P.launch(c0, {}, 45, 0.8), { x: t0.x, y: t0.y, vx: 10, vy: -2 });
assert(P.step(c0, bt, {}, 1 / 60).some(e => e.type === 'tnt') && bt.vy >= 28, 'TNT launches upward');

const r0 = scan.rings[0];
const br = Object.assign(P.launch(c0, {}, 45, 0.8), { x: r0.x, y: r0.y, vx: 14, vy: 2 });
assert(P.step(c0, br, {}, 1 / 60).some(e => e.type === 'ring') && br.vx > 24, 'boost ring accelerates');

const u0 = scan.ufos[0];
const bu = Object.assign(P.launch(c0, {}, 45, 0.8), { x: u0.x, y: u0.y, vx: 14, vy: -3 });
assert(P.step(c0, bu, {}, 1 / 60).some(e => e.type === 'ufo') && bu.vy >= 30, 'UFO launches ball high');

const w0 = scan.flats.find(f => f.type === 'water');
assert(w0, 'water pond exists');
const bwFast = Object.assign(P.launch(c0, { bounce: 4 }, 45, 0.9), { x: w0.x, y: w0.level + P.BALL_R + 0.05, vx: 18, vy: -10 });
assert(P.step(c0, bwFast, { bounce: 4 }, 1 / 60).some(e => e.type === 'skip'), 'fast ball skips on water');
const bwSlow = Object.assign(P.launch(c0, {}, 45, 0.9), { x: w0.x, y: w0.level + P.BALL_R + 0.05, vx: 2, vy: -6 });
assert(P.step(c0, bwSlow, {}, 1 / 60).some(e => e.type === 'splash') && bwSlow.done, 'slow ball splashes cleanly');

// 5. Outer space & milestones reachable with upgrades + rocket boost
const maxUp = { power: 12, fuel: 10, bounce: 10, magnet: 10 };
const spaceRun = simShot({ seed: 101, upgrades: maxUp, angle: 50, power: 1.0, bot: 'skill' });
assert(spaceRun.ball.space && spaceRun.ball.maxY >= 310, 'upgraded shot reaches outer space: maxY=' + spaceRun.ball.maxY);
assert(spaceRun.ball.maxX >= 1200, 'upgraded shot reaches Moon milestone: maxX=' + spaceRun.ball.maxX);
const rew = P.reward(spaceRun.ball, maxUp, []);
assert(rew.total > 200 && rew.newMilestones.length >= 2 && rew.stars === 3, 'space run earns rich reward & 3 stars');

// Multiple seeds all terminate cleanly
for (const seed of [7, 42, 202, 777]) {
  simShot({ seed, upgrades: {}, angle: 35, power: 0.7, bot: 'dive' });
  simShot({ seed, upgrades: { power: 6, fuel: 5, bounce: 5, magnet: 4 }, angle: 48, power: 0.96, bot: 'skill' });
}

// 6. Save sanitization (rejects old v2 shapes cleanly, clamps invalid v3 fields)
const oldV2 = P.sanitizeSave({ v: 2, coins: 999, best: 500, world: 3 });
assert.deepEqual([oldV2.v, oldV2.coins, oldV2.bestDist, oldV2.skin], [P.SAVE_VERSION, 0, 0, 'classic']);
const dirtyV3 = P.sanitizeSave({
  v: P.SAVE_VERSION,
  coins: -50,
  bestDist: NaN,
  bestAlt: 420.9,
  shots: -3,
  upgrades: { power: 99, fuel: -2, bounce: 5, magnet: Infinity },
  skin: 'hacked',
  ownedSkins: ['fireball', 'bogus'],
  milestones: ['moon', 'fake', 'moon']
});
assert.deepEqual(
  [dirtyV3.coins, dirtyV3.bestDist, dirtyV3.bestAlt, dirtyV3.upgrades.power, dirtyV3.upgrades.fuel, dirtyV3.upgrades.bounce, dirtyV3.skin, dirtyV3.ownedSkins, dirtyV3.milestones],
  [0, 0, 420, 12, 0, 5, 'classic', ['classic', 'fireball'], ['moon']]
);
assert.deepEqual(P.sanitizeSave(dirtyV3), dirtyV3, 'sanitization is idempotent');

console.log(JSON.stringify({
  status: 'PASS',
  starterDist: Math.round(base.ball.maxX),
  spaceDist: Math.round(spaceRun.ball.maxX),
  spaceAlt: Math.round(spaceRun.ball.maxY)
}));
