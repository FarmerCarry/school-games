// Frog Pinball's pure engine in Node: the table geometry, the physics (cradles, flips,
// bumpers, slingshots, no ball ever escaping or tunnelling in thousands of random shots),
// the plunger, the frog's gulp and burp and the ball rain, ducks and the multiplier,
// kickbacks (never a loop between the outlanes), the orbit and level 5's lit lane springs,
// level 1's gate into the bumpers, ball save and lost balls, every mission, saves, and players:
// a good scripted player wins every level, a sloppy one wins the first level quickly at every
// difficulty, and level 5 sits between levels 4 and 6 for a sloppy player.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(path.join(repo, 'games/frog-pinball/engine.js'), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'engine.js' });
const FP = context.window.FP;
const T = FP.TABLE, R = FP.R, DT = 1 / 60;

// Runs a world frame by frame; collects the events. input(w, i) gives the buttons.
function run(w, { seconds = 10, input = () => ({}), until = () => false, each = () => {} } = {}) {
  const events = [];
  for (let i = 0; i < seconds * 60; i++) {
    FP.step(w, DT, input(w, i));
    events.push(...w.ev); w.ev.length = 0;
    each(w, i);
    if (until(w, events)) break;
  }
  return events;
}
const types = events => events.map(e => e.type);
const count = (events, type) => events.filter(e => e.type === type).length;
// A world with no ball on the plunger, and one ball placed by hand.
function table(level = 4, extra = {}) {
  const w = FP.create(Object.assign({ level, gravity: 1100, save: 10, kick: 400, seed: 1 }, extra));
  w.balls.length = 0;
  return w;
}
function ball(w, x, y, vx = 0, vy = 0) {
  const b = { id: ++w.ids, st: 'live', x, y, vx, vy, fresh: false, arm: 0, armT: 0, slow: 0, age: 0 };
  w.balls.push(b);
  return b;
}
const speed = b => Math.hypot(b.vx, b.vy);
// What game.js passes in at a difficulty level d (0..1): Kit.dda's value(easy, hard).
const tune = d => ({ gravity: 960 + 340 * d, save: 13 - 6 * d, kick: 360 + 80 * d });
const DDA = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
// Values made in the engine's own realm, as plain data to compare.
const plain = v => JSON.parse(JSON.stringify(v));
// The sloppy player: mashes each flipper now and then, for a random while.
function sloppy(rnd) {
  const st = { l: 0, r: 0 };
  return () => {
    for (const k of ['l', 'r']) { if (st[k] > 0) st[k] -= DT; else if (rnd() < 0.03) st[k] = 0.1 + rnd() * 0.5; }
    return { left: st.l > 0, right: st.r > 0 };
  };
}
// Distance from a point to a segment of the built table.
function segDist(s, x, y) {
  const px = x - s.ax, py = y - s.ay;
  let t = px * s.ux + py * s.uy; t = Math.max(0, Math.min(s.len, t));
  return Math.hypot(x - (s.ax + s.ux * t), y - (s.ay + s.uy * t));
}
function inConvex(pts, x, y) {
  let pos = 0, neg = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (c > 0) pos++; else if (c < 0) neg++;
  }
  return pos === 0 || neg === 0;
}
const HULL = FP.headHull();
// Inside the arch (the table's round top), measured at the ball's centre.
function underArch(x, y, margin) {
  if (y >= T.arch.y) return true;
  const a = T.arch, dx = (x - a.x) / (a.rx - margin), dy = (y - a.y) / (a.ry - margin);
  return dx * dx + dy * dy <= 1;
}

test('the engine is pure: no DOM, no Kit, no timers, no Math.random, no Date', () => {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /Math\.random|document\.|window\.|Kit\.|setTimeout|setInterval|localStorage|requestAnimationFrame|Date\b|performance\./);
  // and the same seed with the same input plays out the same way
  const a = FP.create({ level: 10, seed: 42 }), b = FP.create({ level: 10, seed: 42 });
  const ra = FP.rng(3), rb = FP.rng(3), ma = {}, mb = {};
  for (let i = 0; i < 60 * 40; i++) { FP.step(a, DT, FP.bot(a, ra, 0.9, ma)); FP.step(b, DT, FP.bot(b, rb, 0.9, mb)); a.ev.length = b.ev.length = 0; }
  assert.equal(a.score, b.score);
  assert.deepEqual(plain(a.balls.map(q => [q.x, q.y])), plain(b.balls.map(q => [q.x, q.y])));
});

test('table geometry: unit normals, a convex frog head with no crevice, the walls inside the frame', () => {
  const geo = FP.build(true);
  assert.ok(geo.segs.length > 60);
  for (const s of geo.segs) {
    assert.ok(Math.abs(Math.hypot(s.nx, s.ny) - 1) < 1e-9 && Math.abs(Math.hypot(s.ux, s.uy) - 1) < 1e-9);
    assert.ok(s.len > 0.5, 'no zero-length wall');
    for (const [x, y] of [[s.ax, s.ay], [s.bx, s.by]]) assert.ok(x >= 20 && x <= 540 && y >= 20 && y <= 770, `wall point ${x},${y}`);
  }
  // the head hull is convex and wraps the head, the eyes and the crown
  assert.ok(inConvex(HULL, T.head.x, T.head.y));
  for (const e of T.eyes) assert.ok(inConvex(HULL, e[0], e[1]));
  for (let i = 0; i < HULL.length; i++) {
    const a = HULL[i], b = HULL[(i + 1) % HULL.length], c = HULL[(i + 2) % HULL.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    assert.ok(cross * ((HULL[1][0] - HULL[0][0]) * (HULL[2][1] - HULL[1][1]) - (HULL[1][1] - HULL[0][1]) * (HULL[2][0] - HULL[1][0])) >= -1e-6, 'convex');
  }
  // a ball always fits over the frog's head, between it and the arch
  for (let x = 200; x <= 320; x += 5) {
    let top = Infinity;
    for (let y = 20; y < 160; y += 0.5) if (inConvex(HULL, x, y)) { top = y; break; }
    let arch = 20;
    while (!underArch(x, arch, 0)) arch += 0.5;
    assert.ok(top - arch > 2 * R + 6, `room over the head at x ${x}: ${top - arch}`);
  }
  // the bumpers, ducks and frog stay clear of each other
  for (const b of T.bumpers) assert.ok(!inConvex(HULL, b[0], b[1] - T.bumperR));
  assert.equal(geo.circles.filter(c => c.k === 1).length, 3);
  assert.equal(FP.build(false).circles.length, 3, 'no lily bud post on the harder levels');
  // level 1's gate over the left lane: one segment from the lane guide's top up to the arch,
  // leaving no gap a ball could slip through
  const pit = FP.build(true, true).segs;
  assert.equal(pit.length, geo.segs.length + 1);
  assert.equal(pit[pit.length - 1].k, 3, 'a one-way gate');
  assert.deepEqual(plain(T.pit[0]), plain(T.walls[5].pts[0]), 'it starts at the lane guide');
  assert.ok(!underArch(T.pit[1][0], T.pit[1][1] - 1, 0), 'and reaches the arch');
  assert.ok(FP.LEVELS[0].pit && FP.LEVELS.slice(1).every(L => !L.pit), 'on level 1 only');
  // the inlane floor ends on the flipper's base circle, so no ball can wedge in between
  for (const [i, wall] of [[0, T.walls[9]], [1, T.walls[10]]]) {
    const end = wall.pts[wall.pts.length - 1], f = T.flippers[i];
    assert.ok(Math.abs(Math.hypot(end[0] - f.x, end[1] - f.y) - T.flipR0) < 1, 'inlane end ' + i);
  }
});

test('a ball dropped on a held flipper comes to rest on it (a cradle)', () => {
  for (const side of [0, 1]) {
    const w = table(4), f = T.flippers[side];
    const b = ball(w, f.x + (side ? -1 : 1) * 50, 470);
    run(w, { seconds: 3, input: () => (side ? { right: true } : { left: true }) });
    assert.equal(b.st, 'live');
    assert.ok(speed(b) < 25, 'at rest: ' + speed(b));
    assert.ok(b.y < f.y && b.y > f.y - 60, 'on the flipper: ' + b.y);
    assert.ok(Math.abs(b.x - f.x) < T.flipLen, 'along the flipper: ' + b.x);
    assert.equal(w.balls.length, 1, 'not drained');
  }
});

test('a flip sends a resting ball up the table, faster near the tip', () => {
  const shot = (side, along) => {
    const w = table(4), f = w.flippers[side];
    const d = FP.flipDir(f), r = T.flipR0 + (T.flipR1 - T.flipR0) * along / T.flipLen + R + 0.5;
    const b = ball(w, f.x + d[0] * along + d[1] * f.side * r, f.y + d[1] * along - Math.cos(T.rest) * r);
    let top = b.y, fastest = 0;
    const events = run(w, { seconds: 1.5, input: (w, i) => (i < 15 ? (side ? { right: true } : { left: true }) : {}), each: () => { top = Math.min(top, b.y); fastest = Math.max(fastest, speed(b)); } });
    assert.ok(events.some(e => e.type === 'flip'));
    assert.ok(events.some(e => e.type === 'flipHit'), 'the flipper hits the ball');
    return { top, fastest };
  };
  for (const side of [0, 1]) {
    const mid = shot(side, 40), tip = shot(side, 76);
    assert.ok(mid.top < 420, 'mid shot goes up: ' + mid.top);
    assert.ok(tip.top < 380, 'tip shot goes up: ' + tip.top);
    assert.ok(tip.fastest > 1200, 'tip shot is fast: ' + tip.fastest);
    assert.ok(tip.fastest <= FP.MAXV + 1e-6, 'capped');
  }
  // with no input a flipper never moves
  const w = table(4);
  run(w, { seconds: 2 });
  assert.deepEqual(plain(w.flippers.map(f => f.ang)), [T.rest, T.rest]);
  // a tap that comes and goes between two frames still flips all the way
  const tap = table(4);
  FP.step(tap, DT, { left: true }); FP.step(tap, DT, {});
  assert.ok(tap.flippers[0].held, 'a short press still holds a moment');
  run(tap, { seconds: 0.1 });
  assert.ok(Math.min(...[tap.flippers[0].ang]) <= T.rest);
});

test('bumpers kick the ball away harder than it came in; slingshots kick too', () => {
  const w = table(4, { kick: 400 });
  const [bx, by] = T.bumpers[2];
  const b = ball(w, bx, by - T.bumperR - R - 30, 0, 200);
  let after = 0;
  const events = run(w, { seconds: 0.5, until: (w, ev) => ev.some(e => e.type === 'bumper'), each: () => { after = speed(b); } });
  assert.equal(count(events, 'bumper'), 1);
  assert.ok(after > 450, 'kicked: ' + after);
  assert.ok(b.vy < 0, 'away from the bumper');
  assert.equal(w.bumps, 1);
  assert.equal(w.score, FP.SCORE.bump);
  // a stronger kick knob kicks harder
  const soft = table(4, { kick: 300 }), hard = table(4, { kick: 480 });
  const s1 = ball(soft, bx, by - 50, 0, 200), s2 = ball(hard, bx, by - 50, 0, 200);
  run(soft, { seconds: 0.3, until: (w, ev) => ev.some(e => e.type === 'bumper') });
  run(hard, { seconds: 0.3, until: (w, ev) => ev.some(e => e.type === 'bumper') });
  assert.ok(speed(s2) > speed(s1) + 100);
  // the left slingshot's kicker edge sends a ball across the table
  const sw = table(4), tri = T.slings[0];
  const mx = (tri[0][0] + tri[2][0]) / 2, my = (tri[0][1] + tri[2][1]) / 2;
  const sb = ball(sw, mx + 30, my - 10, -300, 0);
  const sev = run(sw, { seconds: 0.4, until: (w, ev) => ev.some(e => e.type === 'sling') });
  assert.equal(count(sev, 'sling'), 1);
  assert.ok(sb.vx > 200, 'kicked to the right: ' + sb.vx);
});

test('no ball ever escapes, tunnels or sinks into a solid in thousands of random shots', () => {
  const rnd = FP.rng(2024);
  const geo = FP.build(true, true);
  const clear = (x, y) => geo.segs.every(s => segDist(s, x, y) > R + s.th + 1) &&
    geo.circles.every(c => Math.hypot(x - c.x, y - c.y) > c.r + R + 1) &&
    !inConvex(HULL, x, y) && underArch(x, y, R + 2) &&
    T.ducks.every(d => Math.hypot(x - d[0], y - d[1]) > T.duckHalf + T.duckR + R + 1) &&
    T.flippers.every(f => Math.hypot(x - f.x, y - f.y) > T.flipLen + 25) && !T.slings.some(t => inConvex(t, x, y));
  let shots = 0, worst = 0, frames = 0;
  // levels 4 and 1 (the gate), then level 5 (the lit springs in the lane mouths)
  for (let k = 0; k < 3000; k++) {
    const w = table(k >= 2400 ? 5 : k % 3 ? 4 : 1, { gravity: 900 + rnd() * 450, seed: k });
    let x, y;
    do { x = 21 + rnd() * 518; y = 25 + rnd() * 640; } while (!clear(x, y));
    const a = rnd() * Math.PI * 2, sp = rnd() * FP.MAXV;
    ball(w, x, y, Math.cos(a) * sp, Math.sin(a) * sp);
    const mash = sloppy(FP.rng(k + 7));
    run(w, {
      seconds: 3, input: mash,
      each: w => {
        frames++;
        for (const b of w.balls) {
          if (b.st !== 'live') continue;
          const where = `shot ${k} from ${x.toFixed(1)},${y.toFixed(1)}: ball at ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
          assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.vx) && Number.isFinite(b.vy), where);
          assert.ok(b.x >= 20 + R - 0.5 && b.x <= 540 - R + 0.5, 'inside the side walls, ' + where);
          assert.ok(underArch(b.x, b.y, R - 0.5), 'under the arch, ' + where);
          assert.ok(!inConvex(HULL, b.x, b.y), 'not inside the frog, ' + where);
          for (const c of T.bumpers) assert.ok(Math.hypot(b.x - c[0], b.y - c[1]) > T.bumperR + R - 2, 'not inside a bumper, ' + where);
          for (const t of T.slings) assert.ok(!inConvex(t, b.x, b.y), 'not inside a slingshot, ' + where);
          assert.ok(speed(b) <= FP.MAXV + 1, 'capped, ' + where);
          // the inlane and outlane rails are never crossed: a ball right of the left rail's
          // vertical part stays right of it, and so on
          if (b.y > 480 && b.y < 545) assert.ok(Math.abs(b.x - 58) > R + 3 && Math.abs(b.x - 464) > R + 3, 'not through a lane rail, ' + where);
        }
      }
    });
    worst = Math.max(worst, Math.sqrt(w.maxStep));
    shots++;
  }
  assert.equal(shots, 3000);
  assert.ok(frames > 3000 * 100);
  assert.ok(worst < R, 'a ball never moves its radius in one substep: ' + worst.toFixed(2));
});

test('no ball stays stuck: with nobody playing, every ball rolls down to the drain; the frog shakes one off its head', () => {
  const rnd = FP.rng(77);
  for (let k = 0; k < 300; k++) {
    const w = table(k % 2 ? 4 : FP.FREE, { gravity: 960 + rnd() * 340, seed: k });
    let x, y;
    do { x = 30 + rnd() * 460; y = 40 + rnd() * 560; } while (inConvex(HULL, x, y) || !underArch(x, y, R + 2) || T.bumpers.some(c => Math.hypot(x - c[0], y - c[1]) < T.bumperR + R + 2) || T.slings.some(t => inConvex(t, x, y)));
    const first = ball(w, x, y, (rnd() - 0.5) * 600, (rnd() - 0.5) * 600);
    run(w, { seconds: 25, until: w => !w.balls.includes(first) });
    assert.ok(!w.balls.includes(first), `ball ${k} from ${Math.round(x)},${Math.round(y)} still at ${Math.round(first.x)},${Math.round(first.y)}`);
  }
  // a ball rolling slowly over the frog's crown is shaken off at once
  const w = table(4);
  const b = ball(w, T.peak[0] - 20, T.peak[1] - R - 6, -10, 0);
  const ev = run(w, { seconds: 2, until: w => b.y > 140 });
  assert.ok(ev.some(e => e.type === 'nudge' && e.head) || b.y > 140);
  assert.ok(b.y > 140, 'off the head');
  // on the first levels the lily bud between the flippers springs a ball going down the
  // middle back up onto a flipper; it never rests there
  for (const x of [250, 261, 272]) {
    const easy = table(1);
    const mid = ball(easy, x, 560, 0, 300);
    let after = Infinity;
    const ev = run(easy, { seconds: 4, each: w => { if (w.budCd > 0) after = Math.min(after, mid.y); } });
    assert.ok(ev.some(e => e.type === 'bud'), 'the bud springs');
    assert.ok(easy.balls.includes(mid), 'not drained');
    let lowest = 0, still = 0;
    run(easy, { seconds: 6, each: () => { lowest = Math.max(lowest, mid.y); still = speed(mid) < 20 ? still + 1 : 0; assert.ok(still < 60, 'never at rest on the bud'); } });
    assert.ok(easy.balls.includes(mid) && lowest < T.post[1], 'kept in play: ' + lowest);
  }
});

test('the plunger: a tap always reaches the table, a longer pull launches harder, it launches by itself', () => {
  const reach = (level, gravity, input, seed = 2) => {
    const w = FP.create({ level, gravity, seed });
    let out = false;
    const events = run(w, { seconds: 4, input, each: w => {
      const b = w.balls[0];
      if (b && b.st === 'live' && b.x < 495 && b.y < 470) out = true;
    } });
    const launch = events.find(e => e.type === 'launch');
    return { out, power: launch ? launch.power : 0 };
  };
  for (const [level, g] of [[1, 960], [1, 1300], [4, 960], [4, 1300]]) {
    // the spring varies a little from ball to ball, and every tap still gets there
    for (let seed = 1; seed <= 6; seed++) {
      const tap = reach(level, g, (w, i) => ({ pull: i === 10 }), seed);
      assert.ok(tap.out, `a tap reaches the table (L${level}, g ${g}, seed ${seed})`);
      assert.equal(tap.power, FP.TAP);
    }
    let last = 0;
    for (const hold of [0.25, 0.4, 0.55, 1.5]) {
      const r = reach(level, g, (w, i) => ({ pull: i >= 10 && i < 10 + hold * 60 }));
      assert.ok(r.out, `a ${hold}s pull reaches the table (L${level}, g ${g})`);
      assert.ok(r.power > last, 'harder with a longer pull');
      last = r.power;
    }
    assert.equal(last, FP.MAXP, 'a full pull');
  }
  // nobody touches anything: the ball launches by itself
  const w = FP.create({ level: 1, seed: 2 });
  const events = run(w, { seconds: FP.AUTO + 0.5 });
  assert.equal(count(events, 'launch'), 1);
  assert.ok(Math.abs(w.t - FP.AUTO) < 0.6);
  // a ball that falls back into the lane sits on the plunger again and goes once more
  const weak = table(4);
  const b = ball(weak, T.plunger.x, 600, 0, -380);
  const back = run(weak, { seconds: 3 });
  assert.ok(back.some(e => e.type === 'back'));
  assert.ok(back.some(e => e.type === 'launch'), 'relaunched by itself');
  assert.ok(b.y < 600 || b.x < 500);
});

test('the frog gulps a ball in its mouth, holds it, burps it out downwards; three feeds start the ball rain', () => {
  const w = table(4);
  const b = ball(w, T.mouth[0] + 6, T.mouth[1] + 12, 0, -200);
  let events = run(w, { seconds: 0.3, until: (w, ev) => ev.some(e => e.type === 'gulp') });
  assert.equal(count(events, 'gulp'), 1);
  assert.equal(b.st, 'mouth');
  assert.equal(w.feeds, 1);
  assert.equal(w.score, FP.SCORE.feed);
  events = run(w, { seconds: FP.HOLD + 0.3, until: (w, ev) => ev.some(e => e.type === 'burp') });
  assert.equal(count(events, 'burp'), 1);
  assert.equal(b.st, 'live');
  assert.ok(b.vy > 300, 'burped downwards: ' + b.vy);
  assert.ok(Math.abs(b.vx) > 150, 'and to a side, never straight down the middle');
  assert.ok(w.t > FP.HOLD, 'held for a moment');
  // the burped ball is not gulped again at once
  events = run(w, { seconds: 0.4 });
  assert.equal(count(events, 'gulp'), 0);
  // the third feed: ball rain, two more balls and a short ball save
  w.balls.length = 0; w.frog.feeds = 2; w.frog.cool = 0;
  const c = ball(w, T.mouth[0], T.mouth[1] + 10, 0, -150);
  events = run(w, { seconds: 3 });
  assert.ok(events.some(e => e.type === 'gulp' && e.multi));
  assert.equal(count(events, 'multiball'), 1);
  assert.equal(w.multis, 1);
  assert.equal(w.balls.filter(q => q.st === 'live').length + w.drains + w.saves, 3, 'three balls in play');
  assert.equal(events.filter(e => e.type === 'burp' && e.extra).length, 2);
  assert.ok(c.st === 'live' || !w.balls.includes(c));
});

test('ducks: each one falls once, all three raise the multiplier (to ×5 at most), light the kickbacks and pop back up', () => {
  const w = table(FP.FREE);
  assert.deepEqual(plain(w.kick), [false, false], 'later levels start with the kickbacks out');
  const hitDuck = i => {
    const s = FP.duckSeg(i), mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2;
    w.balls.length = 0;
    ball(w, mx - T.duckDir[1] * 24, my + T.duckDir[0] * 24, T.duckDir[1] * 400, -T.duckDir[0] * 400);
    return run(w, { seconds: 0.2, until: (w, ev) => ev.some(e => e.type === 'duck') });
  };
  for (let round = 0; round < 5; round++) {
    for (let i = 0; i < 3; i++) {
      const ev = hitDuck(i);
      assert.equal(count(ev, 'duck'), 1, `duck ${i} round ${round}`);
      assert.equal(w.ducks[i].up, false);
      // a duck that is down cannot be hit again
      assert.equal(count(hitDuck(i), 'duck'), 0);
    }
    assert.equal(w.mult, Math.min(FP.MULT_MAX, round + 2));
    assert.deepEqual(plain(w.kick), [true, true]);
    w.balls.length = 0;
    const up = run(w, { seconds: 2 });
    assert.ok(up.some(e => e.type === 'ducksUp'));
    assert.ok(w.ducks.every(d => d.up));
  }
  assert.equal(w.mult, FP.MULT_MAX);
  assert.equal(w.banks, 5);
  // points grow with the multiplier
  const before = w.score;
  hitDuck(0);
  assert.equal(w.score - before, FP.SCORE.duck * FP.MULT_MAX);
});

test('kickbacks fire a ball in the outlane back up; lit for good on level 1, once on later levels', () => {
  const kickOnce = (w, side) => {
    w.balls.length = 0;
    const k = T.kick[side];
    const b = ball(w, (k[0] + k[1]) / 2, T.kickY - 20, 0, 500);
    const ev = run(w, { seconds: 0.8 });
    return { ev, b };
  };
  const easy = table(1);
  for (let i = 0; i < 3; i++) {
    for (const side of [0, 1]) {
      const k = T.kick[side];
      easy.balls.length = 0;
      const b = ball(easy, (k[0] + k[1]) / 2, T.kickY - 20, 0, 500);
      let top = b.y;
      const ev = run(easy, { seconds: 0.8, until: (w, ev) => ev.some(e => e.type === 'kick'), each: () => { top = Math.min(top, b.y); } });
      run(easy, { seconds: 0.3, each: () => { top = Math.min(top, b.y); } });
      assert.equal(count(ev, 'kick'), 1, 'L1 kickback ' + side);
      assert.ok(top < T.kickY - 200, 'back up the table: ' + top);
    }
  }
  assert.deepEqual(plain(easy.kick), [true, true]);
  const later = table(4);
  later.kick = [true, true];
  assert.equal(count(kickOnce(later, 0).ev, 'kick'), 1);
  assert.deepEqual(plain(later.kick), [false, true], 'used up');
  const { ev } = kickOnce(later, 0);
  assert.equal(count(ev, 'kick'), 0);
  assert.ok(ev.some(e => e.type === 'drain' || e.type === 'saved'), 'down the outlane');
  // levels 2 and 3 light them again with every new ball
  const mid = FP.create({ level: 2, seed: 1 });
  assert.deepEqual(plain(mid.kick), [true, true]);
});

test('a kickback lobs the ball into the bumpers at every slope: no endless left-right loop between the outlanes', () => {
  // level 1 keeps both kickbacks lit for good, so a kick that sent the ball straight across into
  // the other outlane would repeat for ever; here nobody plays and every kick must find a bumper
  for (const lv of [1, 2, 4]) for (const d of DDA) for (const side of [0, 1]) for (const [dx, vy, seed] of [[-3, 300, 1], [0, 0, 2], [3, 700, 3]]) {
    const w = table(lv, Object.assign(tune(d), { seed }));
    w.kick = [true, true];
    const k = T.kick[side];
    ball(w, (k[0] + k[1]) / 2 + dx, 560, 0, vy);
    let kicks = 0, bumpedAfter = -1;
    for (const e of run(w, { seconds: 20 })) { if (e.type === 'kick') kicks++; if (e.type === 'bumper' && bumpedAfter < 0) bumpedAfter = kicks; }
    const where = `L${lv} d ${d} side ${side} dx ${dx}`;
    assert.equal(bumpedAfter, 1, 'the first kick reaches the bumpers, ' + where);
    if (lv === 1) assert.ok(kicks <= 6, `${kicks} kicks in 20 s, ` + where);
  }
});

test('level 1: the gate over the left lane drops the plunger shot into the bumpers at every slope; a ball going up the lane still loops', () => {
  for (const d of DDA) for (let seed = 1; seed <= 3; seed++) {
    const w = FP.create(Object.assign({ level: 1, seed }, tune(d)));
    let up = false;
    run(w, {
      seconds: 6, input: (w, i) => ({ pull: i === 2 }),
      until: w => { const b = w.balls[0]; if (b && b.y < 200) up = true; return w.bumps > 0 || (up && b && b.y > 470); }
    });
    assert.ok(w.bumps > 0, `the tap's ball hits a bumper on its way down, d ${d} seed ${seed}`);
  }
  // the gate is one-way: a ball sprung up the left lane passes it and loops round the top
  const o = table(1);
  ball(o, 42, T.laneY + 30, 0, -300);
  const ev = run(o, { seconds: 4, until: (w, ev) => ev.some(e => e.type === 'orbit') });
  assert.equal(count(ev, 'boost'), 1);
  assert.equal(count(ev, 'orbit'), 1, 'over the top and down the right lane');
  // and the later levels keep the open lane: the plunger shot comes down the left lane
  const l2 = FP.create({ level: 2, seed: 1 });
  run(l2, { seconds: 4, input: (w, i) => ({ pull: i === 2 }), until: w => w.balls[0].x < 64 && w.balls[0].y > T.laneY });
  assert.ok(l2.balls[0].x < 64 && l2.balls[0].y > T.laneY, 'down the left lane on level 2');
});

test('the orbit: up one side lane, over the frog and down the other is a loop; the launch is not', () => {
  // the plunger launch goes round the top but scores no loop
  const w = FP.create({ level: 5, seed: 1 });
  const launchEv = run(w, { seconds: 3, input: (w, i) => ({ pull: i === 2 }) });
  assert.equal(count(launchEv, 'orbit'), 0);
  assert.equal(w.orbits, 0);
  // a shot up either side channel loops round the top and comes down the other side (level 6
  // has no lit lane springs; on level 5 the loop is the mission, with a bonus for spare balls)
  for (const lv of [5, 6]) for (const side of [0, 1]) for (const g of [960, 1300]) {
    const o = table(lv, { gravity: g });
    const [x, y, dx, dy] = side ? [442, 384, 42, -50] : [80, 384, -42, -50], l = Math.hypot(dx, dy);
    const b = ball(o, x, y, dx / l * 1300, dy / l * 1300);
    const ev = run(o, { seconds: 4, until: (w, ev) => ev.some(e => e.type === 'orbit') });
    assert.ok(ev.some(e => e.type === 'boost' && e.lane === side), 'boost ' + side);
    assert.equal(count(ev, 'orbit'), 1, `loop from lane ${side}, g ${g}, L${lv}`);
    assert.equal(o.orbits, 1);
    assert.equal(o.score - o.bonus - (ev.filter(e => e.type === 'spin').reduce((a, e) => a + e.score, 0)), FP.SCORE.orbit);
    if (lv === 5) {
      assert.equal(o.prog, 1, 'counts for the orbit mission');
      assert.equal(o.over, 'win', 'one loop wins level 5');
      assert.equal(o.bonus, 2 * FP.SCORE.spare);
    } else assert.equal(o.over, '');
    assert.equal(b.st, 'live');
  }
  // even a lazy ball going up the left lane is sprung over the top by the lane's lily pad
  const lazy = table(5);
  ball(lazy, 42, T.laneY + 30, 0, -300);
  const lev = run(lazy, { seconds: 4, until: (w, ev) => ev.some(e => e.type === 'orbit') });
  assert.equal(count(lev, 'boost'), 1);
  assert.equal(count(lev, 'orbit'), 1);
  // a ball that goes up a lane and falls back down the same lane is no loop
  const back = table(5);
  ball(back, 42, T.laneY - 60, 0, 300);
  back.balls[0].arm = 1; back.balls[0].armT = 3;
  assert.equal(count(run(back, { seconds: 1 }), 'orbit'), 0);
  // the dragonfly spinner in the left lane whirs and scores
  const s = table(4);
  ball(s, 42, T.spinY + 40, 0, -900);
  const sev = run(s, { seconds: 2 });
  assert.ok(sev.some(e => e.type === 'spinner'));
  assert.ok(count(sev, 'spin') >= 3);
  assert.ok(count(sev, 'spin') < 40, 'a spin scores a handful, not a fortune');
});

test('level 5 lights springs in the lane mouths: a shot a little off the lane goes up it, not on other levels', () => {
  // 15° off the lane, from 60 px out: it hits a rail on level 4 and loops on level 5
  for (const side of [0, 1]) for (const turn of [-15, 15]) for (const sp of [800, 1100, 1400]) {
    const m = T.mouths[side], a = turn * Math.PI / 180, ux = m[2] * Math.cos(a) - m[3] * Math.sin(a), uy = m[2] * Math.sin(a) + m[3] * Math.cos(a);
    const up = {};
    for (const lv of [4, 5]) {
      const o = table(lv);
      ball(o, m[0] - m[2] * 60, m[1] - m[3] * 60, ux * sp, uy * sp);
      const ev = run(o, { seconds: 1 });
      up[lv] = ev.some(e => e.type === 'boost' && e.lane === side);
      if (lv === 5) assert.equal(count(run(o, { seconds: 3, until: w => w.orbits > 0 }), 'orbit'), 1, `the loop: lane ${side}, ${turn}°, ${sp}`);
    }
    assert.deepEqual(up, { 4: false, 5: true }, `lane ${side}, ${turn}°, ${sp}`);
  }
  // a ball coming down out of a lane, or a slow one rolling at a mouth, is left alone
  for (const side of [0, 1]) for (const [dir, sp] of [[-1, 700], [1, 150]]) {
    const m = T.mouths[side], path = {};
    for (const lv of [4, 5]) {
      const o = table(lv), b = ball(o, m[0] + m[2] * 4, m[1] + m[3] * 4, m[2] * dir * sp, m[3] * dir * sp);
      run(o, { seconds: 0.5 });
      path[lv] = [b.x, b.y, b.vx, b.vy];
    }
    assert.deepEqual(path[5], path[4], `lane ${side}, ${dir * sp}`);
  }
});

test('ball save brings a drained ball back; after it a drain costs a ball; three lost balls end the game', () => {
  const w = FP.create({ level: 4, save: 10, seed: 1 });
  run(w, { seconds: 1, input: (w, i) => ({ pull: i === 1 }) });
  assert.ok(w.saveT > 8, 'the save starts with the launch');
  w.balls[0].x = 261; w.balls[0].y = 700; w.balls[0].vx = 0; w.balls[0].vy = 600;
  let ev = run(w, { seconds: 0.4 });
  assert.equal(count(ev, 'saved'), 1);
  assert.equal(w.ballsLeft, 3);
  assert.ok(FP.waiting(w), 'the ball is back on the plunger');
  // the saved ball does not restart the save
  run(w, { seconds: 2 });
  w.saveT = 0;
  const drainNow = () => { const b = w.balls.find(q => q.st === 'live'); if (b) { b.x = 261; b.y = 700; b.vx = 0; b.vy = 600; } };
  drainNow();
  ev = run(w, { seconds: 0.5 });
  assert.equal(count(ev, 'drain'), 1);
  assert.equal(w.ballsLeft, 2);
  ev = run(w, { seconds: 2 });
  assert.ok(ev.some(e => e.type === 'serve'), 'the next ball comes');
  for (let i = 0; i < 2; i++) {
    run(w, { seconds: 5, until: w => w.balls.some(q => q.st === 'live' && q.y < 600) });
    w.saveT = 0; drainNow();
    ev = run(w, { seconds: 2.5, until: w => !!w.over });
  }
  assert.equal(w.over, 'lose');
  assert.equal(w.ballsLeft, 0);
  assert.ok(ev.some(e => e.type === 'gameover'));
  // free play ends the same way, as an 'end'
  const free = FP.create({ level: FP.FREE, seed: 1 });
  free.ballsLeft = 1; free.balls.length = 0;
  ball(free, 261, 700, 0, 600);
  run(free, { seconds: 1 });
  assert.equal(free.over, 'end');
  // level 1 cannot be lost: every ball comes back
  const easy = FP.create({ level: 1, seed: 1 });
  for (let i = 0; i < 6; i++) {
    run(easy, { seconds: 6, until: w => w.balls.some(q => q.st === 'live' && q.y < 600) });
    drainNowIn(easy);
    run(easy, { seconds: 1 });
  }
  assert.equal(easy.ballsLeft, 3);
  assert.equal(easy.over, '');
  assert.ok(easy.saves >= 6);
  function drainNowIn(w) { const b = w.balls.find(q => q.st === 'live'); if (b) { b.x = 261; b.y = 700; b.vx = 0; b.vy = 600; } }
});

test('every mission is won when its count reaches the goal, with a bonus for each spare ball', () => {
  const set = {
    bump: w => { w.bumps = 10; }, duck: w => { w.duckHits = 3; }, feed: w => { w.feeds = w.L.goal; },
    score: w => { w.score = w.L.goal; }, orbit: w => { w.orbits = 2; }, mult: w => { w.mult = 3; }, multi: w => { w.multis = 2; }
  };
  for (let lv = 1; lv <= FP.MISSIONS; lv++) {
    const w = FP.create({ level: lv, seed: 1 });
    FP.check(w);
    assert.equal(w.over, '', 'not won at the start: L' + lv);
    assert.equal(w.prog, w.L.m === 'mult' ? 1 : 0, 'the count starts where it really is (the multiplier at ×1): L' + lv);
    set[w.L.m](w);
    w.ballsLeft = 2;
    const before = w.score;
    FP.check(w);
    assert.equal(w.over, 'win', 'L' + lv);
    assert.equal(w.score - before, FP.SCORE.spare, 'one spare ball');
    assert.equal(w.prog, w.L.goal);
    assert.ok(w.ev.some(e => e.type === 'mission' && e.bonus === FP.SCORE.spare));
  }
  const free = FP.create({ level: FP.FREE, seed: 1 });
  free.score = 1e7; FP.check(free);
  assert.equal(free.over, '', 'free play has no mission');
  // stars: one for the mission, more for points; the targets rise with the levels' scores
  for (let lv = 1; lv <= FP.MISSIONS; lv++) {
    const L = FP.LEVELS[lv - 1];
    assert.ok(L.stars[0] < L.stars[1]);
    assert.equal(FP.stars(lv, 0), 1);
    assert.equal(FP.stars(lv, L.stars[0]), 2);
    assert.equal(FP.stars(lv, L.stars[1]), 3);
  }
  assert.equal(FP.stars(FP.FREE, 1e9), 0);
});

test('the easy start: L1 saves every ball and keeps the kickbacks, L2-3 save 20 s, later levels follow the difficulty', () => {
  const l1 = FP.create({ level: 1, save: 7 }), l2 = FP.create({ level: 2, save: 7 }), l5 = FP.create({ level: 5, save: 9 });
  assert.equal(l1.saveFor, Infinity);
  assert.equal(l2.saveFor, 20);
  assert.equal(l5.saveFor, 9);
  assert.ok(l1.g < l5.g, 'a gentler slope on level 1');
  assert.ok(l1.L.post && !l5.L.post);
  assert.ok(l1.L.mouth > l5.L.mouth, 'a wider mouth to start with');
});

test('saves: odd values fall back to fresh ones; stars, bests, unlocks and the level map', () => {
  const fresh = FP.newSave();
  assert.deepEqual(FP.loadSave(null), fresh);
  assert.deepEqual(FP.loadSave('x'), fresh);
  assert.deepEqual(FP.loadSave([1, 2]), fresh);
  const odd = FP.loadSave({ stars: [3, 9, -1, 'x', 2.7, null], best: [100, -5, NaN, 1e12], skin: 6, theme: 2, coach: 'yes', seen: 99 });
  assert.deepEqual(plain(odd.stars), [3, 0, 0, 0, 2, 0, 0, 0, 0, 0]);
  assert.deepEqual(plain(odd.best.slice(0, 4)), [100, 0, 0, 0]);
  assert.equal(odd.coach, false);
  assert.equal(odd.seen, 0);
  assert.equal(odd.skin, 0, 'a skin the stars do not pay for goes back to the first one');
  assert.equal(odd.theme, 0);
  const kept = FP.loadSave({ v: 1, stars: [3, 3, 3, 3, 3, 3, 3, 1, 0, 0], best: [1, 2, 3], skin: 6, theme: 2, coach: true, seen: 3 });
  assert.equal(FP.totalStars(kept), 22);
  assert.equal(kept.skin, 6);
  assert.equal(kept.theme, 2);
  assert.equal(kept.coach, true);
  assert.equal(FP.loadSave({ stars: [1], skin: 6 }).skin, 0, 'not enough stars for the fly');
  // costs rise, and the first unlock comes within the first two levels' stars
  for (let i = 1; i < FP.SKINS.length; i++) assert.ok(FP.SKINS[i].cost > FP.SKINS[i - 1].cost);
  assert.ok(FP.SKINS[1].cost <= 3);
  assert.ok(FP.SKINS[FP.SKINS.length - 1].cost <= FP.MISSIONS * 3);
  // a play-through
  const s = FP.newSave();
  assert.equal(FP.nextLevel(s), 1);
  assert.ok(FP.open(s, 1) && !FP.open(s, 2) && !FP.open(s, FP.FREE));
  let r = FP.record(s, 1, 9000, false);
  assert.deepEqual([r.stars, r.newBest, s.stars[0]], [0, true, 0], 'a loss earns no stars but a best');
  r = FP.record(s, 1, FP.LEVELS[0].stars[0], true);
  assert.equal(r.stars, 2);
  assert.equal(r.unlocked, 1, 'two stars unlock the pearl');
  assert.equal(FP.nextLevel(s), 2);
  assert.ok(FP.open(s, 2) && FP.open(s, FP.FREE) && !FP.open(s, 3));
  r = FP.record(s, 1, 100, true);
  assert.equal(s.stars[0], 2, 'stars never go down');
  assert.equal(r.newBest, false);
  for (let lv = 2; lv <= FP.MISSIONS; lv++) FP.record(s, lv, 1e6, true);
  assert.equal(FP.nextLevel(s), FP.FREE);
  assert.equal(FP.totalStars(s), 26);
  assert.equal(FP.unlockCount(s), FP.SKINS.length - 1 + FP.THEMES.length - 1);
  r = FP.record(s, FP.FREE, 50000, false);
  assert.equal(s.best[FP.FREE - 1], 50000);
  assert.equal(r.stars, 0);
});

test('a good scripted player wins every level within a few minutes', () => {
  for (let lv = 1; lv <= FP.MISSIONS; lv++) {
    let wins = 0, time = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const w = FP.create({ level: lv, gravity: 1100, save: 10, kick: 400, seed });
      const r = FP.rng(seed * 17), mem = {};
      run(w, { seconds: 15 * 60, input: w => FP.bot(w, r, 0.9, mem), until: w => !!w.over });
      if (w.over === 'win') { wins++; time += w.t; }
    }
    assert.ok(wins >= 8, `L${lv}: the good player wins ${wins} of 10`);
    assert.ok(time / wins < 180, `L${lv}: in about ${Math.round(time / wins)} s`);
  }
});

test('level 1 is won quickly by a sloppy masher at every difficulty, and never lost', () => {
  for (const d of DDA) {
    const times = [];
    for (let seed = 1; seed <= 24; seed++) {
      const w = FP.create(Object.assign({ level: 1, seed: seed * 7919 }, tune(d)));
      run(w, { seconds: 5 * 60, input: sloppy(FP.rng(seed * 31)), until: w => !!w.over });
      assert.notEqual(w.over, 'lose');
      assert.equal(w.ballsLeft, 3);
      assert.equal(w.over, 'win', `d ${d} seed ${seed}: won within 5 minutes`);
      times.push(w.t);
    }
    times.sort((a, b) => a - b);
    assert.ok(times[12] < 30, `d ${d}: the median win takes ${times[12].toFixed(1)} s`);
    assert.ok(times[23] < 90, `d ${d}: the slowest win takes ${times[23].toFixed(1)} s`);
  }
});

test('the ramp has no wall at level 5: a sloppy player wins it less often than level 4, not less than level 6', () => {
  // at the first-visit difficulty; the lit lane springs and a single loop make the orbit fair
  const N = 60, wins = {}, time = {};
  for (const lv of [4, 5, 6]) {
    wins[lv] = 0; time[lv] = 0;
    for (let seed = 1; seed <= N; seed++) {
      const w = FP.create(Object.assign({ level: lv, seed: seed * 7919 }, tune(0.35)));
      run(w, { seconds: 10 * 60, input: sloppy(FP.rng(seed * 31)), until: w => !!w.over });
      if (w.over === 'win') wins[lv]++;
      const g = FP.create(Object.assign({ level: lv, seed: seed * 7919 }, tune(0.35))), r = FP.rng(seed * 17), mem = {};
      run(g, { seconds: 10 * 60, input: w => FP.bot(w, r, 0.3, mem), until: w => !!w.over });
      time[lv] += g.t / N;
    }
  }
  const say = `wins of ${N}: L4 ${wins[4]}, L5 ${wins[5]}, L6 ${wins[6]}; a weak flipper's tries: L4 ${time[4].toFixed(0)} s, L5 ${time[5].toFixed(0)} s, L6 ${time[6].toFixed(0)} s`;
  assert.ok(wins[5] >= N / 4, say);
  assert.ok(wins[4] > wins[5] && wins[5] >= wins[6], say);
  assert.ok(time[5] < time[6], say);
});

test('L1 and L8 star targets are achievable: bot earns 2-3 stars on L1 and clean win on L8 earns 3 stars', () => {
  assert.deepEqual(plain(FP.LEVELS[0].stars), [6500, 9500]);
  assert.deepEqual(plain(FP.LEVELS[7].stars), [22500, 25000]);
  // Clean L8 win (goal 20,000 + 2 spare balls * 2,500 = 25,000) earns 3 stars; 1 spare ball (22,500) earns 2 stars
  assert.equal(FP.stars(8, 22500), 2);
  assert.equal(FP.stars(8, 25000), 3);
  let l1TwoPlus = 0, l1Three = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const w = FP.create({ level: 1, gravity: 1100, save: 10, kick: 400, seed });
    const r = FP.rng(seed * 17), mem = {};
    run(w, { seconds: 5 * 60, input: w => FP.bot(w, r, 0.75, mem), until: w => !!w.over });
    assert.equal(w.over, 'win');
    const st = FP.stars(1, w.score);
    if (st >= 2) l1TwoPlus++;
    if (st === 3) l1Three++;
  }
  assert.ok(l1TwoPlus >= 6, `L1 bot earned 2+ stars in ${l1TwoPlus}/12`);
  assert.ok(l1Three >= 2, `L1 bot earned 3 stars in ${l1Three}/12`);
});
