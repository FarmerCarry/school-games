/* Run with: node games/skybound-golf/verify.js */
'use strict';
const assert = require('node:assert/strict');
const P = require('./physics.js');

function shot(world = 0, upgrades = {}, quality = 1) {
  const course = P.createCourse(world);
  const ball = P.launch(course, upgrades, quality);
  let frames = 0;
  const events = [];
  while (!ball.stopped && frames++ < 3400) {
    events.push(...P.step(course, ball, upgrades, 1 / 60));
    assert(Number.isFinite(ball.x) && Number.isFinite(ball.y), 'finite coordinates');
    assert(ball.y >= P.heightAt(course, ball.x) + ball.r - .0001, 'ball never penetrates terrain');
  }
  assert(ball.stopped, 'every shot terminates');
  assert(ball.time <= 55.02, 'bounded flight duration');
  assert.equal(events.filter(e => e.type === 'stop').length, 1, 'one result per shot');
  return { ball, events };
}

const start = shot();
assert.deepEqual(start, shot(), 'identical shots and collisions are deterministic');
assert(start.ball.maxX >= 105 && start.ball.maxX <= 180, 'starting perfect shot has rewarding range');
const power = shot(0, { power: 5 });
assert(power.ball.maxX > start.ball.maxX * 1.7, 'power meaningfully improves range');
// Check individual upgrades in controlled flight/impact conditions: whole-shot
// distances may vary when an upgrade carries a ball into a different surface.
const levelCourse = P.createCourse(0);
const plainFlight = P.launch(levelCourse, {}, 1);
const glidingFlight = P.launch(levelCourse, { glide: 10 }, 1);
for (let frame = 0; frame < 90; frame++) {
  P.step(levelCourse, plainFlight, {}, 1 / 60);
  P.step(levelCourse, glidingFlight, { glide: 10 }, 1 / 60);
}
assert(glidingFlight.x > plainFlight.x, 'glide reduces flight drag');
const softImpact = P.launch(levelCourse, {}, 1);
Object.assign(softImpact, { x: 20, y: .8, vx: 10, vy: -15 });
const springImpact = { ...softImpact };
P.step(levelCourse, softImpact, {}, 1 / 60);
P.step(levelCourse, springImpact, { bounce: 10 }, 1 / 60);
assert(springImpact.vy > softImpact.vy, 'bounce upgrade retains more vertical energy');
const max = { power: 10, bounce: 10, glide: 10 };
const late = P.worlds.map((_, world) => shot(world, max));
assert(late[0].ball.maxX > 600, 'meadow supports substantial progress');
assert(late[2].ball.maxX >= 1000, 'moon unlock is reachable');
assert(late[3].ball.maxX >= 1000, 'moon supports long shots');
const greens = [];
for (let q = 0; q <= 1.001; q += .025) {
  const s = shot(0, {}, q);
  if (s.ball.surface === 'green') greens.push(q);
}
assert(greens.length >= 4, 'putting greens are broadly accessible to new players');
for (let w = 0; w < 4; w++) {
  for (const level of [0, 5, 10]) {
    for (const quality of [0, .35, .75, 1]) shot(w, { power: level, bounce: level, glide: level }, quality);
  }
}
const clean = P.sanitizeSave({ coins: -20, best: NaN, world: 3, upgrades: { power: Infinity, bounce: 91, glide: -3 }, shots: -7 });
assert.deepEqual(clean, { coins: 0, best: 0, world: 0, upgrades: { power: 0, bounce: 10, glide: 0 }, shots: 0, holes: 0, skins: ['classic'], skin: 'classic' });
const styled = P.sanitizeSave({ skins: ['gold', 'hacked', 'gold'], skin: 'hacked' });
assert.deepEqual([styled.skins, styled.skin], [['classic', 'gold'], 'classic'], 'unknown ball styles are dropped');
assert.equal(P.sanitizeSave({ skins: ['comet'], skin: 'comet' }).skin, 'comet');
assert.equal(P.sanitizeSave({ skins: 'gold', skin: 'gold' }).skin, 'classic');
const sky = P.createCourse(3);
assert.deepEqual(P.stars(sky, 300, 1100), P.stars(sky, 300, 1100), 'stars are deterministic');
assert(P.stars(sky, 300, 1100).every(s => s.x >= 300 && s.x <= 1100 && s.y > P.heightAt(sky, s.x)), 'stars stay in view, above ground');
assert(P.stars(sky, 0, 1e9).length <= 65 * 8, 'an enormous viewport query stays bounded');
const ids = P.stars(P.createCourse(0), 0, 2000).map(s => s.id);
assert.equal(new Set(ids).size, ids.length, 'star ids are unique');
assert.equal(P.cost('power', 10), Infinity);
for (const kind of ['power', 'bounce', 'glide']) {
  for (let n = 0; n < 9; n++) assert(P.cost(kind, n + 1) > P.cost(kind, n));
}
assert(P.reward(140, true, true) > P.reward(140, false, false));
assert(P.cost('power', 0) <= P.reward(140, false, true) * 2, 'an early upgrade takes at most two good shots');
console.log(JSON.stringify({ status: 'PASS', startingDistance: Math.round(start.ball.maxX),
  upgradedDistance: Math.round(power.ball.maxX), maxDistanceByWorld: late.map(s => Math.round(s.ball.maxX)),
  accessibleGreenQualities: greens.length, testedShots: 96 }, null, 2));
