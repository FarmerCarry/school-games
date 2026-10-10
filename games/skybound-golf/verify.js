/* Run with: node games/skybound-golf/verify.js */
'use strict';
const assert = require('node:assert/strict');
const P = require('./physics.js');

const all = level => ({ power: level, bounce: Math.min(10, level), rockets: Math.min(5, Math.round(level / 2)), magnet: Math.min(5, Math.round(level / 2)) });

// bot: 'idle' never presses; 'timed' arms each landing just before impact;
// 'rockets' also fires every rocket on the way up; 'skill' fires them at the
// top of each arc instead.
function shot(world = 0, upgrades = {}, power = 1, bot = 'idle') {
  const course = P.createCourse(world);
  const ball = P.launch(course, upgrades, power);
  const events = [];
  let frames = 0, rising = ball.vy > 0;
  while (!ball.done && frames++ < 60 * 70) {
    if (bot !== 'idle' && ball.mode === 'air' && ball.vy < 0 && !ball.armed) {
      const p = P.predictImpact(course, ball, P.ARM_WINDOW);
      if (p && p.t < 0.12) assert.equal(P.press(course, ball, upgrades).type, 'arm');
    }
    if (bot === 'rockets' && ball.mode === 'air' && ball.vy > 0 && ball.rocketsLeft > 0 && frames % 9 === 0) {
      assert.equal(P.press(course, ball, upgrades).type, 'rocket');
    }
    if (bot === 'skill' && ball.mode === 'air' && rising && ball.vy <= 0 && ball.rocketsLeft > 0) P.press(course, ball, upgrades);
    rising = ball.vy > 0;
    events.push(...P.step(course, ball, upgrades, 1 / 60));
    assert(Number.isFinite(ball.x) && Number.isFinite(ball.y), 'finite coordinates');
    if (!ball.done) assert(ball.y >= P.heightAt(course, ball.x) + ball.r - 1e-6, 'the ball never sinks into the ground');
    for (const o of P.features(course, ball.x - 6, ball.x + 6).props) {
      assert(Math.hypot(ball.x - o.x, ball.y - o.ground - o.lift) >= o.r + ball.r - 0.02, `the ball never sinks into a ${o.type}`);
    }
  }
  assert(ball.done, 'every shot terminates');
  assert(ball.time <= 55.02, 'bounded flight duration');
  assert.equal(events.filter(e => e.type === 'stop').length, 1, 'one result per shot');
  assert.equal(new Set(events.filter(e => e.type === 'coin').map(e => e.id)).size, events.filter(e => e.type === 'coin').length, 'each coin is collected once');
  return { ball, events };
}

// Determinism: the same shot always plays out the same way.
const first = shot();
assert.deepEqual(shot(), first, 'identical shots are deterministic');
assert(first.ball.maxX >= 80 && first.ball.maxX <= 160, 'a first perfect swing flies a rewarding distance: ' + first.ball.maxX);
assert(shot(0, {}, 0.3).ball.maxX < first.ball.maxX * 0.6, 'a weak swing goes much shorter');
assert.equal(P.grade(1), 'perfect'); assert.equal(P.grade(0.9), 'perfect'); assert.equal(P.grade(0.8), 'great'); assert.equal(P.grade(0.5), 'good'); assert.equal(P.grade(0.2), 'weak');

// The first chunk teaches: an ordinary first swing flies through coins.
assert(first.events.some(e => e.type === 'coin'), 'the first perfect swing collects coins');

// Upgrades each help in controlled conditions.
const course = P.createCourse(0);
const avg = (world, up, bot) => [0.85, 0.9, 0.95, 1].reduce((sum, p) => sum + shot(world, up, p, bot).ball.maxX, 0) / 4;
assert(avg(0, { power: 6 }) > avg(0, {}) * 1.8, 'power meaningfully improves range');
const soft = P.launch(course, {}, 1), spring = P.launch(course, {}, 1);
for (const b of [soft, spring]) Object.assign(b, { x: 30, y: P.heightAt(course, 30) + b.r + 0.1, vx: 10, vy: -15 });
P.step(course, soft, {}, 1 / 60); P.step(course, spring, { bounce: 10 }, 1 / 60);
assert(spring.vy > soft.vy, 'bounce upgrade keeps more energy');
assert.equal(P.launch(course, { rockets: 3 }, 1).rocketsLeft, 4, 'rocket upgrade adds rockets');
assert(P.magnetOf({ magnet: 5 }) > P.magnetOf({ magnet: 0 }) * 3, 'magnet widens coin pickup');

// The one button: rockets in the air, a super bounce near the ground.
const air = P.launch(course, {}, 1);
for (let i = 0; i < 20; i++) P.step(course, air, {}, 1 / 60);
const vy = air.vy, rocket = P.press(course, air, {});
assert.equal(rocket.type, 'rocket'); assert(air.vy > vy + 10, 'a rocket kicks the ball upwards');
assert.equal(P.press(course, air, {}).type, 'empty', 'one rocket without upgrades');
const timed = shot(0, {}, 1, 'timed'), idle = shot(0, {}, 1, 'idle');
assert(timed.ball.supers >= 2, 'timed presses make super bounces');
assert(timed.events.some(e => e.type === 'super' && e.quality === 'perfect'), 'a press just before landing is perfect');
assert(timed.ball.maxX > idle.ball.maxX, 'super bounces carry the ball further');
const mash = P.launch(course, {}, 1);
while (!mash.done && !(mash.vy < 0 && P.predictImpact(course, mash, P.ARM_WINDOW))) P.step(course, mash, {}, 1 / 60);
assert.equal(P.press(course, mash, {}).type, 'arm');
assert.equal(P.press(course, mash, {}).type, 'armed', 'only the first press of a landing counts');
assert.equal(mash.rocketsLeft, 1, 'mashing near the ground never spends rockets');
// A landing too gentle to leave the ground rolls, and is not paid as a super bounce.
const gentle = P.launch(course, {}, 1);
Object.assign(gentle, { x: 30, y: P.heightAt(course, 30) + gentle.r + 0.05, vx: 3, vy: -5.5, time: 2 });
assert.equal(P.press(course, gentle, {}).type, 'arm');
gentle.armAge = 0.3;
assert.deepEqual(P.step(course, gentle, {}, 1 / 60).map(e => e.type), ['roll']);
assert.deepEqual([gentle.supers, gentle.combo, P.reward(gentle).bonus], [0, 0, 5]);
// Landing on a downslope rolls on smoothly instead of hopping and braking.
const slope = P.createCourse(4), roller = P.launch(slope, {}, 0.35);
let rolls = 0;
while (!roller.done) rolls += P.step(slope, roller, {}, P.pace(roller) / 60).filter(e => e.type === 'roll').length;
assert(rolls <= 2 && roller.maxX > 90, `a rolling ball keeps its speed downhill (${rolls} rolls, ${Math.round(roller.maxX)} m)`);
// Absurd coordinates return instead of looping forever.
for (const x of [1e18, -1e18, 7.3e17]) assert(Number.isFinite(P.heightAt(course, x)) && P.surfaceType(course, x));
assert(Array.isArray(P.features(course, 1e18, 1e18 + 100).coins));
const late = P.launch(course, {}, 1);
let bounced = false;
while (!late.done && !bounced) bounced = P.step(course, late, {}, 1 / 60).some(e => e.type === 'bounce');
const lateVy = late.vy, lateRes = P.press(course, late, {});
assert.equal(lateRes.type, 'late', 'a press just after a landing still bounces');
assert(late.vy > lateVy && late.rocketsLeft === 1 && late.supers === 1, 'a late press is a good bounce, not a rocket');
assert.equal(P.press(course, late, {}).type, 'rocket', 'then the button is a rocket again');

// Progression: every world is reachable and late upgrades reach space.
const max = all(12);
for (let w = 0; w < P.worlds.length; w++) {
  const prev = w ? P.worlds[w - 1] : null;
  assert(!prev || P.worlds[w].unlock > prev.unlock, 'world unlocks increase');
  for (const level of [0, 4, 8, 12]) for (const power of [0, 0.5, 0.9, 1]) for (const bot of ['idle', 'timed', 'rockets', 'skill']) shot(w, all(level), power, bot);
}
for (let w = 0; w < P.worlds.length - 1; w++) {
  const best = Math.max(...[0.9, 0.95, 1].map(p => shot(w, max, p, 'skill').ball.maxX));
  assert(best >= P.worlds[w + 1].unlock, `${P.worlds[w].id} can unlock ${P.worlds[w + 1].id} (${Math.round(best)} m)`);
}
assert(shot(0, all(8), 1, 'rockets').ball.space, 'rockets fired upwards can reach space');
assert(!shot(0, {}, 1, 'rockets').ball.space, 'space is a late goal');

// Course content is deterministic, bounded and placed above the ground.
const moon = P.createCourse(4);
assert.deepEqual(P.features(moon, 300, 1100), P.features(P.createCourse(4), 300, 1100), 'features are deterministic');
const view = P.features(course, 0, 4000);
assert(view.coins.length > 80 && view.balloons.length > 5 && view.props.length > 10, 'the course is full of things');
assert(view.coins.every(c => c.y > P.heightAt(course, c.x) + 0.5), 'coins float above the ground');
assert.equal(new Set(view.coins.map(c => c.id)).size, view.coins.length, 'coin ids are unique');
assert(P.features(course, 0, 1e9).coins.length < 41 * 64, 'an enormous query stays bounded');
for (let x = 0; x < 3000; x += 0.37) assert(Number.isFinite(P.heightAt(moon, x)));

// Saves: clean, migrated from the first version, never trusted blindly.
const clean = P.sanitizeSave({ coins: -20, best: NaN, world: 3, upgrades: { power: Infinity, bounce: 91, rockets: -3 }, shots: -7 });
assert.deepEqual([clean.coins, clean.best, clean.world, clean.upgrades], [0, 0, 0, { power: 0, bounce: 10, rockets: 0, magnet: 0 }]);
assert.equal(clean.skin, 'classic');
const old = P.sanitizeSave({ coins: 100, best: 640, world: 2, upgrades: { power: 2, bounce: 1, glide: 0 }, skins: ['gold', 'hacked'], skin: 'gold', shots: 9, holes: 2 });
assert.equal(old.coins, 100 + 65 + 95 + 50, 'old upgrades are refunded as coins');
assert.deepEqual([old.best, old.world, old.skin, old.skins, old.shots, old.holes, old.tips], [640, 2, 'gold', ['classic', 'gold'], 9, 2, 2]);
assert.deepEqual(old.upgrades, { power: 0, bounce: 0, rockets: 0, magnet: 0 });
assert.deepEqual(P.sanitizeSave(old), old, 'a sanitized save is stable');
assert.equal(P.sanitizeSave({ v: 2, best: 100, world: 4 }).world, 0, 'locked worlds fall back');
assert.equal(P.sanitizeSave({ v: 2, bests: { snow: 700 } }).best, 700, 'best follows the world records');

// Prices and rewards.
for (const kind of P.kinds) {
  for (let n = 0; n < P.upgrades[kind].max - 1; n++) assert(P.cost(kind, n + 1) > P.cost(kind, n));
  assert.equal(P.cost(kind, P.upgrades[kind].max), Infinity);
}
assert(P.reward(first.ball).total >= P.cost('power', 0) / 2, 'an early upgrade takes about two shots');
assert(P.reward({ maxX: 140, hole: true }).total > P.reward({ maxX: 140 }).total);

console.log(JSON.stringify({ status: 'PASS', firstShot: Math.round(first.ball.maxX), firstCoins: P.reward(first.ball).total,
  timedFirstShot: Math.round(timed.ball.maxX),
  maxSkillByWorld: P.worlds.map((_, w) => Math.round(shot(w, max, 1, 'skill').ball.maxX)),
  unlocks: P.worlds.map(w => w.unlock) }, null, 2));
