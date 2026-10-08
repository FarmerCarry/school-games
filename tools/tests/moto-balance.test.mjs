import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

// Replays every games/moto-madness level with simple riders in the shipped physics, to keep
// the star times honest: holding ↑ alone earns 2 stars and a run with a landed flip earns 3.
const require = createRequire(import.meta.url);
require('../../games/moto-madness/engine.js');
require('../../games/moto-madness/levels.js');
const MM = globalThis.MM;
const TAU = Math.PI * 2;

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// The game's own lift rule (isOnLift in game.js): on a lift means both wheels on it, or it is moving.
const onLift = m => m.on === 3 || (m.on && (m.st === 1 || m.st === 3));

// Plays level i to the finish, with the game's own "stuck for 6 s: back to the checkpoint" rule.
function ride(i, rider) {
  const random = Math.random;
  Math.random = seeded(1234 + i); // crashes and crates use Math.random; keep runs repeatable
  try {
    const w = new MM.World(MM.build(MM.LEVELS[i]));
    let stuckX = 0, stuckT = 0, rescues = 0;
    for (let frame = 0; frame < 90 * 60 && !w.finished; frame++) {
      const inp = rider(w);
      w.step(inp);
      if (Math.abs(w.bike.x - stuckX) > 60 || w.crashed || w.movers.some(onLift)) { stuckX = w.bike.x; stuckT = 0; }
      else stuckT += 1 / 60;
      if (stuckT > 6 && inp.gas) { w.crash('stuck'); stuckT = 0; rescues++; }
    }
    // the game judges stars on the time as shown, in tenths
    return { finished: w.finished, time: Math.round(w.finalTime * 10) / 10, crashes: w.crashes, flips: w.flips, rescues };
  } finally {
    Math.random = random;
  }
}

const holdUp = () => ({ gas: true, brake: false, lean: 0 });
const autopilot = w => MM.autopilot(w, {});

// seconds until the bike lands, from the same projectile scan the autopilot uses
function airLeft(w) {
  const b = w.bike;
  let prevY = b.y;
  for (let t = 0.04; t < 2.5; t += 0.04) {
    const x = b.x + b.vx * t, y = b.y + b.vy * t + 0.5 * MM.G * t * t;
    if (w.groundAt(x, prevY - 10) < y + 50) return t;
    prevY = y;
  }
  return 2.5;
}

// A kid who holds ↑ all the way and, on a jump that will last at least 0.8 s, holds ←
// until the bike has turned most of the way round, then levels out for the landing.
function flipRider() {
  let flipping = false;
  return w => {
    if (w.grounded || w.crashed) { flipping = false; return holdUp(); }
    const turned = w.bike.a - w.takeoffA;
    if (!flipping && w.airT < 0.3 && turned > -1 && airLeft(w) >= 0.8) flipping = true;
    if (!flipping) return holdUp();
    if (turned > -TAU + 0.9) return { gas: true, brake: false, lean: -1 };
    return { ...autopilot(w), gas: true, brake: false };
  };
}

const levels = MM.LEVELS.map((def, i) => ({ i, name: `${Math.floor(i / 5) + 1}-${i % 5 + 1}`, stars: def.stars }));

test('Moto Madness star times are ordered: 3 stars is faster than 2 stars', () => {
  for (const { name, stars } of levels) assert.ok(stars[0] < stars[1], `${name}: ${stars}`);
});

test('Moto Madness riding without flips finishes every level with at most 2 stars', () => {
  for (const { i, name, stars } of levels) {
    const held = ride(i, holdUp);
    assert.ok(held.finished, `${name}: holding ↑ must finish`);
    assert.equal(held.flips, 0);
    assert.ok(held.time > stars[0], `${name}: holding ↑ took ${held.time} s, 3 stars is ${stars[0]} s`);
    assert.ok(held.time <= stars[1], `${name}: holding ↑ took ${held.time} s, 2 stars is ${stars[1]} s`);
    const steered = ride(i, autopilot);
    assert.ok(steered.finished && steered.flips === 0, `${name}: autopilot must finish without flips`);
    assert.ok(steered.time > stars[0], `${name}: steering without flips took ${steered.time} s, 3 stars is ${stars[0]} s`);
  }
});

test('Moto Madness a clean run with landed flips earns 3 stars on every level', () => {
  for (const { i, name, stars } of levels) {
    const run = ride(i, flipRider());
    assert.ok(run.finished, `${name}: the flip rider must finish`);
    assert.equal(run.crashes, 0, `${name}: the flip rider must not crash`);
    assert.ok(run.flips >= 1, `${name}: the flip rider must land a flip`);
    // leave room for a kid who is a little slower than the bot
    assert.ok(run.time <= stars[0] - 0.3, `${name}: flipping took ${run.time} s, 3 stars is ${stars[0]} s`);
  }
});

// The tutorial sign before 1-1's first kicker says to press ← on the ramp. A kid who does that
// anywhere along the ramp, and lets go when the flip meter turns green or a little later,
// lands the flip and earns 3 stars: the timing is forgiving, not frame-perfect.
test('Moto Madness the 1-1 tutorial flip works from anywhere on the ramp', () => {
  const kicker = MM.build(MM.LEVELS[0]).shapes.find(s => s.type === 'kicker');
  const stars = MM.LEVELS[0].stars;
  for (const along of [0, 0.5, 0.9]) {
    for (const letGo of [0, 0.3]) {
      let phase = 'ride', green = null;
      const run = ride(0, w => {
        const b = w.bike;
        if (phase === 'ride' && w.grounded && b.x >= kicker.x1 + (kicker.x2 - kicker.x1) * along && b.x < kicker.x2) phase = 'ramp';
        if (phase === 'ramp' && !w.grounded) phase = 'air';
        if (phase === 'air' && w.grounded) phase = 'done';
        if (phase === 'air' && green == null && Math.abs(w.bike.a - w.takeoffA) >= TAU - 1.1) green = w.time;
        const lean = phase === 'ramp' || (phase === 'air' && (green == null || w.time - green < letGo));
        return { gas: true, brake: false, lean: lean ? -1 : 0 };
      });
      const label = `pressed ${along * 100}% along the ramp, let go ${letGo} s after green`;
      assert.ok(run.finished && run.crashes === 0 && run.flips === 1, `${label}: ${JSON.stringify(run)}`);
      assert.ok(run.time <= stars[0] - 0.3, `${label}: took ${run.time} s, 3 stars is ${stars[0]} s`);
    }
  }
});

// A short ← tap while holding ↑ can leave the bike in a wheelie against a waiting lift's end wall,
// with only the rear wheel on it. The lift waits for both wheels, so the bike would stand there
// for good; the stuck rule must still see it and send the rider back to the checkpoint.
test('Moto Madness a wheelie into a waiting lift still gets rescued', () => {
  let t0 = null;
  const run = ride(16, w => {
    if (t0 == null && w.bike.x >= 600) t0 = w.time;
    return { gas: true, brake: false, lean: t0 != null && w.time - t0 < 0.3 ? -1 : 0 };
  });
  assert.ok(run.finished, `4-2 with a 0.3 s ← tap at x 600 must finish: ${JSON.stringify(run)}`);
  assert.ok(run.rescues >= 1, `the bike should have been stuck at the lift: ${JSON.stringify(run)}`);
});
