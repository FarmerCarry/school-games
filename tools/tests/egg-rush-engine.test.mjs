// Egg Rush (سباق البيض) engine in Node: a scripted player finishes every level at the
// easiest and the hardest tier, guards see only what is in their cone and in plain
// view, a kid seen moving is bumped back and drops the egg, golden eggs, ice, the
// two-player race, and saves that load safely whatever is in storage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function load() {
  const context = vm.createContext({ window: {} });
  for (const file of ['levels.js', 'engine.js']) {
    vm.runInContext(readFileSync(path.join(repo, 'games/egg-rush', file), 'utf8'), context, { filename: file });
  }
  return context.window.ER;
}
const ER = load();
const DT = 1 / 60;
const run = (w, input, seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) { ER.step(w, DT, input); if (w.over) break; } };
const kinds = w => w.ev.map(e => e.t);
// Values from the engine's own realm, as plain JSON for deepEqual.
const plain = v => JSON.parse(JSON.stringify(v));
const still = [{ x: 0, y: 0 }];

// A careful scripted player: walks the path finder's way to the nearest egg (or home),
// and holds still whenever a stirring or looking guard could see it, or its next step.
function bot(w, pi = 0) {
  const p = w.players[pi];
  let path = [], target = null, repath = 0;
  const danger = (g, x, y) => {
    if (!(g.state === 'stir' || g.state === 'awake' || g.state === 'alert')) return false;
    const ex = g.x + Math.cos(g.look) * g.r * 0.55, ey = g.y + Math.sin(g.look) * g.r * 0.55;
    const d = Math.hypot(x - ex, y - ey);
    if (d > g.len + 18) return false;
    const a = Math.atan2(y - ey, x - ex);
    if (d > 4) {
      if (g.state === 'awake') {
        let near = false;
        for (const s of [0, 0.2, 0.4, 0.6]) if (Math.abs(ER.wrap(a - (g.look + g.sweep * Math.sin(g.ph + s * g.turn * w.T.sweep)))) <= g.half + 0.2) near = true;
        if (!near) return false;
      } else if (Math.abs(ER.wrap(a - g.look)) > g.sweep + g.half + 0.12) return false;
    }
    return ER.clear(w, ex, ey, x, y);
  };
  const unsafe = (x, y) => !ER.atHome({ x, y, home: p.home }) && w.guards.some(g => danger(g, x, y));
  return () => {
    if (p.stun > 0) return { x: 0, y: 0 };
    let tgt;
    if (p.carry) tgt = { x: p.home.x, y: p.home.y, id: 'home' };
    else {
      let best = null, bd = 1e9;
      for (const e of w.eggsList) if (e.state === 'nest') { const d = Math.hypot(e.x - p.x, e.y - p.y) - (e.gold ? 120 : 0); if (d < bd) { bd = d; best = e; } }
      tgt = best ? { x: best.x, y: best.y, id: best.id } : { x: p.x, y: p.y, id: 'wait' };
    }
    repath -= DT;
    if (!target || target.id !== tgt.id || repath <= 0) { path = ER.path(w, p.x, p.y, tgt.x, tgt.y); target = tgt; repath = 0.5; }
    while (path.length && Math.hypot(path[0].x - p.x, path[0].y - p.y) < 10) path.shift();
    if (!path.length || unsafe(p.x, p.y)) return { x: 0, y: 0 };
    const nx = path[0].x - p.x, ny = path[0].y - p.y, d = Math.hypot(nx, ny), ux = nx / d, uy = ny / d;
    const look = p.ice ? 0.45 : 0.12, sp = Math.max(60, Math.hypot(p.vx, p.vy), w.T.speed * 0.7);
    if (unsafe(p.x + ux * sp * look, p.y + uy * sp * look) || unsafe(p.x + p.vx * look, p.y + p.vy * look)) return { x: 0, y: 0 };
    return { x: ux, y: uy };
  };
}
function play(li, tier, seed, limit = 600) {
  const w = ER.create(ER.plan(li, tier), seed), b = bot(w), ev = [];
  while (!w.over && w.t < limit) { ER.step(w, DT, [b()]); ev.push(...kinds(w)); w.ev.length = 0; }
  return { w, r: ER.result(w), ev };
}

test('the scripted player finishes all 20 levels at tier 1 and at tier 5, mostly without being caught', () => {
  assert.equal(ER.LEVELS.length, 20);
  for (let li = 0; li < 20; li++) {
    for (const tier of [1, 5]) {
      for (const seed of [11, 29]) {
        const { w, r, ev } = play(li, tier, seed);
        const id = `${ER.roundId(li)} tier ${tier} seed ${seed}`;
        assert.ok(w.over, `${id}: finished (${r.hatched}/${r.goal} after ${w.t.toFixed(0)} s)`);
        assert.ok(r.hatched >= r.goal, id);
        assert.equal(ev.filter(t => t === 'done').length, 1, `${id}: one done event`);
        assert.ok(r.catches <= 2, `${id}: ${r.catches} catches`);
        assert.ok(r.time < 240, `${id}: ${r.time} s`);
        assert.ok(ER.stars(r) >= 2, `${id}: a careful player earns at least two stars`);
      }
    }
  }
});

test('every level is finishable at every tier, and a careful, quick player can beat the par time', () => {
  for (let li = 0; li < 20; li++) {
    for (let tier = 1; tier <= 5; tier++) {
      const { w, r } = play(li, tier, 5);
      assert.ok(w.over, `${ER.roundId(li)} tier ${tier}`);
      assert.ok(r.time <= r.par, `${ER.roundId(li)} tier ${tier}: ${r.time} s within the par of ${r.par} s`);
    }
  }
});

test('doing nothing never wins: no egg moves by itself', () => {
  for (let li = 0; li < 20; li++) {
    const w = ER.create(ER.plan(li, 3), 3);
    run(w, still, 120);
    assert.equal(w.over, false, ER.roundId(li));
    assert.equal(w.hatched, 0, ER.roundId(li));
    assert.equal(w.catches, 0, 'standing still is never seen: ' + ER.roundId(li));
  }
});

test('the tuning tables move the right way with the tier', () => {
  for (const [key, row] of Object.entries(ER.TUNE)) {
    assert.equal(row.length, ER.TIERS, key);
    const dir = ER.GROWS[key];
    assert.ok(dir === 1 || dir === -1, key + ' has a direction');
    for (let i = 1; i < row.length; i++) assert.ok(dir > 0 ? row[i] >= row[i - 1] : row[i] <= row[i - 1], `${key}[${i}]`);
    assert.notEqual(row[0], row[row.length - 1], key + ' changes');
  }
  // A six-year-old gets a long warning; the stir is never shorter than 0.6 s.
  assert.ok(ER.TUNE.warn[0] >= 2 && Math.min(...ER.TUNE.warn) >= 0.6);
  // The first yard teaches the freeze with an even longer warning.
  const first = ER.plan(0, 1);
  assert.ok(first.T.warn * first.warnMul >= 3);
  assert.equal(first.guards.length, 1);
  // More eggs and extra guards at the top tiers; never fewer guards at a harder tier.
  for (let li = 0; li < 20; li++) {
    let prev = 0;
    for (let tier = 1; tier <= 5; tier++) {
      const plan = ER.plan(li, tier);
      assert.ok(plan.guards.length >= prev, ER.roundId(li));
      prev = plan.guards.length;
    }
    assert.ok(ER.plan(li, 5).goal > ER.plan(li, 1).goal, ER.roundId(li));
  }
});

test('levels are well formed: ids, worlds, eggs in reach, nothing inside an obstacle', () => {
  const ids = [];
  for (let li = 0; li < 20; li++) {
    const plan = ER.plan(li, 5), w = ER.create(plan, 1), id = ER.roundId(li);
    ids.push(id);
    assert.match(id, /^w[1-5]L[1-4]$/);
    assert.equal(plan.w, Math.floor(li / 4));
    assert.ok(plan.nests.length >= 1 && plan.guards.length >= 1, id);
    const inside = (x, y, r) => plan.obs.some(o => x > o.x - r && x < o.x + o.w + r && y > o.y - r && y < o.y + o.h + r);
    for (const n of plan.nests) {
      assert.equal(inside(n.x, n.y, 4), false, `${id}: nest ${n.x},${n.y} is clear`);
      assert.ok(ER.path(w, plan.starts[0][0], plan.starts[0][1], n.x, n.y).length > 0, `${id}: a way to the nest at ${n.x},${n.y}`);
    }
    for (const g of plan.guards) assert.equal(inside(g.x, g.y, 0), false, `${id}: guard at ${g.x},${g.y}`);
    assert.equal(inside(plan.homes[0].x, plan.homes[0].y, 0), false);
    // golden eggs live in world levels 4
    if (li % 4 === 3) assert.ok(plan.nests.some(n => n.gold), id + ' has a golden egg');
  }
  assert.equal(new Set(ids).size, 20);
  assert.ok(ER.plan(19, 1).nests.some(n => n.gold === 2), 'the last yard has the giant golden egg');
});

test('a guard sees only inside its cone, only while awake, and never through a hay bale', () => {
  const w = ER.create(ER.plan(0, 1), 1), g = w.guards[0];
  g.state = 'awake'; g.dir = Math.PI; g.t = g.dur = 3;
  const e = ER.eye(g);
  assert.equal(ER.sees(w, g, e.x - 100, e.y), true, 'straight ahead');
  assert.equal(ER.sees(w, g, e.x - g.len - 10, e.y), false, 'beyond the cone');
  assert.equal(ER.sees(w, g, e.x + 60, e.y), false, 'behind it');
  assert.equal(ER.sees(w, g, e.x - 60, e.y - 90), false, 'outside the angle');
  g.state = 'sleep';
  assert.equal(ER.sees(w, g, e.x - 100, e.y), false, 'asleep');
  g.state = 'stir';
  assert.equal(ER.sees(w, g, e.x - 100, e.y), false, 'stirring only warns');
  // a hay bale between the guard and the kid hides the kid
  g.state = 'awake';
  w.obs.push({ kind: 'hay', x: e.x - 80, y: e.y - 30, w: 30, h: 60 });
  assert.equal(ER.clear(w, e.x, e.y, e.x - 140, e.y), false);
  assert.equal(ER.sees(w, g, e.x - 140, e.y), false, 'hidden behind the bale');
  assert.equal(ER.sees(w, g, e.x - 40, e.y), true, 'in front of the bale');
  // the drawn cone stops at the bale too
  const pts = ER.cone(w, g, 20);
  assert.equal(pts.length, 2 + 21 * 2);
  const mid = [pts[2 + 20], pts[2 + 21]];
  assert.ok(Math.hypot(mid[0] - e.x, mid[1] - e.y) < 81, 'the middle ray ends at the bale');
});

test('a kid seen moving is spotted, bumped back gently, and the egg rolls home to its nest', () => {
  const w = ER.create(ER.plan(0, 1), 1), p = w.players[0], g = w.guards[0], egg = w.eggsList[0];
  // carry the egg, standing in front of the hen while she looks
  p.x = egg.x - 60; p.y = egg.y; egg.state = 'carry'; egg.by = 0; p.carry = egg;
  g.state = 'awake'; g.t = g.dur = 2; g.ph = 0; g.dir = g.look;
  run(w, [{ x: 0, y: 0 }], 1);
  assert.equal(w.catches, 0, 'standing still is safe, even in plain view');
  assert.ok(p.carry, 'still carrying');
  g.state = 'awake'; g.t = g.dur = 2; g.ph = 0;
  w.ev.length = 0;
  let caught = null;
  for (let i = 0; i < 240 && !caught; i++) { ER.step(w, DT, [{ x: -1, y: 0 }]); caught = w.ev.find(e => e.t === 'caught'); }
  assert.ok(caught, 'moving in the cone is seen');
  assert.equal(w.catches, 1);
  assert.equal(p.spotted, true);
  const at = [p.x, p.y];
  run(w, [{ x: 1, y: 1 }], 0.3);
  assert.deepEqual([p.x, p.y], at, 'the kid freezes in surprise while the guard hops over');
  const seen = [];
  for (let i = 0; i < 300; i++) { ER.step(w, DT, [{ x: 0, y: 0 }]); seen.push(...kinds(w)); w.ev.length = 0; }
  assert.ok(seen.includes('hop') && seen.includes('bump') && seen.includes('drop') && seen.includes('back'), seen.join(','));
  assert.equal(p.carry, null, 'the egg was dropped');
  assert.equal(egg.state, 'nest', 'and rolled back');
  assert.deepEqual([egg.x, egg.y], [w.nests[0].x, w.nests[0].y]);
  assert.ok(p.safe >= 0 && !p.spotted);
  // no damage and no game over: the level goes on
  assert.equal(w.over, false);
  assert.ok(seen.includes('sleep'), 'the hen goes back to sleep');
});

test('touching an egg picks it up, the home nest hatches it, and the hen lays another', () => {
  const w = ER.create(ER.plan(0, 1), 1), p = w.players[0], n = w.nests[0];
  p.x = n.x - 30; p.y = n.y;
  ER.step(w, DT, still);
  assert.ok(kinds(w).includes('pick'));
  assert.ok(p.carry);
  w.ev.length = 0;
  p.x = p.home.x + 10; p.y = p.home.y;
  ER.step(w, DT, still);
  const hatch = w.ev.find(e => e.t === 'hatch');
  assert.ok(hatch);
  assert.equal(hatch.value, 1);
  assert.equal(w.hatched, 1);
  assert.equal(n.egg, null);
  run(w, still, w.relay + 0.1);
  assert.ok(n.egg && n.egg.state === 'nest', 'a new egg in the nest');
});

test('a golden egg is worth 3 (the giant one 5), is laid once, and slows the kid down', () => {
  const plan = ER.plan(3, 1), w = ER.create(plan, 1), p = w.players[0];
  const gi = w.nests.findIndex(n => n.gold === 1), gn = w.nests[gi];
  assert.ok(gi >= 0);
  // walking speed with and without it
  const speed = carry => {
    const v = ER.create(plan, 2), q = v.players[0];
    q.x = 400; q.y = 460;
    if (carry) { const e = v.nests[gi].egg; e.state = 'carry'; e.by = 0; q.carry = e; }
    run(v, [{ x: 0, y: 1 }], 0.6);
    return q.speed;
  };
  assert.ok(speed(true) < speed(false) * 0.75, 'slower with the golden egg');
  p.x = gn.x - 40; p.y = gn.y;
  ER.step(w, DT, still);
  assert.equal(p.carry.gold, 1);
  p.x = p.home.x; p.y = p.home.y;
  ER.step(w, DT, still);
  assert.equal(w.hatched, 3);
  assert.equal(w.eggs, 1);
  run(w, still, 5);
  assert.equal(gn.egg, null, 'a golden egg comes once');
  const giant = ER.create(ER.plan(19, 1), 1), q = giant.players[0], gnest = giant.nests.find(n => n.gold === 2);
  q.x = gnest.x - 40; q.y = gnest.y;
  ER.step(giant, DT, still);
  q.x = q.home.x; q.y = q.home.y;
  ER.step(giant, DT, still);
  assert.equal(giant.hatched, 5);
});

test('ice is slippery: the kid slides on after letting go, and stops on grass at once', () => {
  const slide = li => {
    const w = ER.create(ER.plan(li, 1), 1), p = w.players[0], z = w.zones.find(z => z.kind === 'ice');
    p.x = z ? z.x + 30 : 400; p.y = z ? z.y + z.h / 2 : 460;
    run(w, [{ x: 1, y: 0 }], 0.8);
    const x0 = p.x;
    run(w, still, 0.3);
    return p.x - x0;
  };
  const ice = slide(8), grass = slide(0);
  assert.ok(ice > 25, 'slid ' + ice.toFixed(0) + ' px on ice');
  assert.ok(grass < 12, 'stopped within ' + grass.toFixed(0) + ' px on grass');
  // and an icy slide always stops within the shortest warning (0.6 s plus the grace)
  const w = ER.create(ER.plan(8, 5), 1), p = w.players[0], z = w.zones.find(z => z.kind === 'ice');
  p.x = z.x + 20; p.y = z.y + z.h / 2;
  run(w, [{ x: 1, y: 0 }], 0.8);
  run(w, still, ER.TUNE.warn[4] + ER.TUNE.grace[4]);
  assert.ok(p.speed <= ER.MOVE, 'standing still again: ' + p.speed.toFixed(1));
});

test('shallow water slows the kid; lily pads do not', () => {
  const w = ER.create(ER.plan(4, 1), 1), p = w.players[0], z = w.zones[0], pad = w.pads[0];
  assert.equal(ER.zoneAt(w, z.x + z.w / 2, z.y + 10), 'water');
  assert.equal(ER.zoneAt(w, pad.x, pad.y), 'pad');
  p.x = z.x + z.w / 2; p.y = z.y + 12;
  run(w, [{ x: 1, y: 0 }], 0.5);
  assert.ok(p.speed < w.T.speed * 0.6 && p.speed > 40, 'wading at ' + p.speed.toFixed(0));
});

test('walls and the edges of the yard stop the kid without trapping it', () => {
  const w = ER.create(ER.plan(0, 1), 1), p = w.players[0], hay = w.obs.find(o => o.kind === 'hay');
  p.x = hay.x - 40; p.y = hay.y + hay.h / 2;
  run(w, [{ x: 1, y: 0 }], 1);
  assert.ok(p.x <= hay.x - ER.PR + 0.5, 'stopped by the bale');
  run(w, [{ x: 1, y: -1 }], 1.2);
  assert.ok(p.y < hay.y, 'slid along it');
  run(w, [{ x: -1, y: -1 }], 6);
  assert.ok(p.x >= ER.YARD.x0 + ER.PR - 0.01 && p.y >= ER.YARD.y0 + ER.PR - 0.01, 'inside the yard');
});

test('patrolling guards walk their path, stop, warn and look; standing still is still safe', () => {
  const w = ER.create(ER.plan(16, 1), 1), g = w.guards.find(g => g.path);
  assert.ok(g);
  assert.equal(g.state, 'walk');
  const seen = new Set();
  let moved = 0;
  for (let i = 0; i < 60 * 40; i++) { const x = g.x, y = g.y; ER.step(w, DT, still); moved += Math.hypot(g.x - x, g.y - y); kinds(w).forEach(k => seen.add(k)); w.ev.length = 0; }
  assert.ok(moved > 300, 'walked ' + moved.toFixed(0));
  assert.ok(seen.has('stir') && seen.has('wake'), [...seen].join(','));
  assert.equal(w.catches, 0);
});

test('the two-player race: two homes, bumps knock an egg loose (with a cooldown), and the clock ends it', () => {
  for (let b = 0; b < 5; b++) {
    const plan = ER.duoPlan(b, 2);
    assert.equal(plan.id, 'duo');
    assert.equal(plan.homes.length, 2);
    assert.ok(plan.homes[0].x < 640 && plan.homes[1].x > 640);
    assert.ok(plan.nests.some(n => n.at > 0 && n.gold), 'a golden egg arrives later');
    const w = ER.create(plan, 4);
    assert.equal(w.players.length, 2);
    const [a, c] = w.players;
    assert.ok(Math.abs((a.x + c.x) / 2 - 640) < 1, 'mirrored starts');
  }
  const w = ER.create(ER.duoPlan(0, 1), 4), [a, b] = w.players, egg = w.eggsList[0];
  egg.state = 'carry'; egg.by = 1; b.carry = egg;
  a.x = 600; a.y = 500; b.x = 640; b.y = 500;
  ER.step(w, DT, [{ x: 1, y: 0 }, { x: 0, y: 0 }]);
  const steal = w.ev.find(e => e.t === 'steal');
  assert.ok(steal && steal.p === 0 && steal.from === 1);
  assert.equal(b.carry, null);
  assert.ok(a.bumpCd > 0);
  // with the cooldown running, another bump does nothing
  w.ev.length = 0;
  const e2 = w.eggsList.find(e => e.state === 'nest');
  e2.state = 'carry'; e2.by = 1; b.carry = e2; b.safe = 0; b.stun = 0;
  a.x = 600; a.y = 400; b.x = 630; b.y = 400;
  ER.step(w, DT, [{ x: 1, y: 0 }, { x: 0, y: 0 }]);
  assert.equal(w.ev.filter(e => e.t === 'steal').length, 0);
  assert.ok(b.carry);
  // hatching scores for the kid at their own home
  b.x = b.home.x; b.y = b.home.y;
  ER.step(w, DT, [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  assert.equal(b.hatched, 1);
  assert.equal(ER.winner(w), 1);
  run(w, [{ x: 0, y: 0 }, { x: 0, y: 0 }], ER.DUO_SECONDS + 1);
  assert.ok(w.over);
  assert.ok(w.ev.some(e => e.t === 'timeup'));
  // first to the goal ends it early
  const q = ER.create(ER.duoPlan(1, 1), 2);
  q.players[0].hatched = ER.DUO_GOAL;
  ER.step(q, DT, [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  assert.ok(q.over && ER.winner(q) === 0);
  const draw = ER.create(ER.duoPlan(2, 1), 2);
  assert.equal(ER.winner(draw), -1);
});

test('both two-player kids can play a whole race with the scripted player', () => {
  for (let b = 0; b < 5; b++) {
    const w = ER.create(ER.duoPlan(b, 3), 8), b0 = bot(w, 0), b1 = bot(w, 1);
    while (!w.over) { ER.step(w, DT, [b0(), b1()]); w.ev.length = 0; }
    assert.ok(w.players[0].hatched >= 3 && w.players[1].hatched >= 3, `yard ${b}: ${w.players.map(p => p.hatched)}`);
  }
});

test('the path finder goes around obstacles and finds the egg behind the fences', () => {
  const w = ER.create(ER.plan(3, 1), 1), p = w.players[0], gold = w.nests.find(n => n.gold);
  const path = ER.path(w, p.x, p.y, gold.x, gold.y);
  assert.ok(path.length >= 2);
  const end = path[path.length - 1];
  assert.deepEqual([end.x, end.y], [gold.x, gold.y]);
  let prev = { x: p.x, y: p.y };
  for (const pt of path) {
    for (let k = 1; k <= 10; k++) {
      const x = prev.x + (pt.x - prev.x) * k / 10, y = prev.y + (pt.y - prev.y) * k / 10;
      for (const o of w.obs) {
        const cx = Math.max(o.x, Math.min(x, o.x + o.w)), cy = Math.max(o.y, Math.min(y, o.y + o.h));
        assert.ok(Math.hypot(x - cx, y - cy) >= ER.PR - 1, `clear of ${o.kind} at ${x.toFixed(0)},${y.toFixed(0)}`);
      }
    }
    prev = pt;
  }
});

test('stars, the DDA outcome and the par', () => {
  const base = { hatched: 5, eggs: 5, goal: 5, catches: 0, time: 30, par: 40, allowed: 2 };
  assert.equal(ER.stars(base), 3);
  assert.equal(ER.stars({ ...base, catches: 3 }), 2);
  assert.equal(ER.stars({ ...base, time: 41 }), 2);
  assert.equal(ER.stars({ ...base, catches: 5, time: 99 }), 1);
  const good = ER.outcome(base), bad = ER.outcome({ ...base, catches: 5, time: 120 });
  assert.ok(good > 0.9 && good <= 1);
  assert.ok(bad < 0.3 && bad >= 0);
  for (let li = 0; li < 20; li++) for (let t = 1; t <= 5; t++) {
    const plan = ER.plan(li, t);
    assert.ok(plan.par > 10 && plan.par < 400, `${plan.id} par ${plan.par}`);
    assert.equal(plan.allowed, ER.TUNE.allowed[t - 1]);
  }
});

test('saves: fresh, old, damaged and hand-edited saves all load as playable ones', () => {
  const fresh = ER.freshSave();
  assert.deepEqual(plain(ER.loadSave(null)), plain(fresh));
  for (const junk of [undefined, 0, 'x', [], [1, 2], { v: 1 }, { coins: 500, shoes: 2, pets: [1] }, { v: '2' }, { v: 3, stars: [3] }]) {
    assert.deepEqual(plain(ER.loadSave(junk)), plain(fresh), JSON.stringify(junk));
  }
  const s = ER.loadSave({ v: 2, stars: [3, 2, 9, -1, 1.5, 'x', 3], best: [400, -5, 1e9], babies: [5, 'a', -2, 1, 2, 99], golden: [1, 0, 0, 0, 0],
    color: 1, hat: 99, seen: 500, coached: 'yes', duo: 3, music: true });
  assert.deepEqual(plain(s.stars.slice(0, 8)), [3, 2, 0, 0, 0, 0, 3, 0]);
  assert.equal(s.stars.length, 20);
  assert.deepEqual(plain(s.best.slice(0, 3)), [400, 0, 0]);
  assert.deepEqual(plain(s.babies), [5, 0, 0, 1, 2]);
  assert.deepEqual(plain(ER.loadSave({ v: 2, babies: [2, 0, 0, 0, 0], golden: [9, 3, 0, 0, 0] }).golden), [2, 0, 0, 0, 0], 'never more golden babies than babies');
  assert.equal(s.color, 1, 'unlocked with 8 stars');
  assert.equal(s.hat, 0);
  assert.equal(s.seen, 0);
  assert.equal(s.coached, false);
  assert.equal(s.duo, 3);
  assert.equal('music' in s, false);
  // a colour or hat that is not unlocked yet falls back
  assert.equal(ER.loadSave({ v: 2, stars: [1], color: 7, hat: 7 }).color, 0);
  // round-trips through JSON
  assert.deepEqual(plain(ER.loadSave(plain(s))), plain(s));
});

test('levels open one by one, worlds with their first level, and rewards by stars', () => {
  const s = ER.freshSave();
  assert.equal(ER.isOpen(s, 0), true);
  assert.equal(ER.isOpen(s, 1), false);
  assert.equal(ER.nextLevel(s), 0);
  s.stars[0] = 1;
  assert.equal(ER.isOpen(s, 1), true);
  assert.equal(ER.nextLevel(s), 1);
  for (let i = 0; i < 4; i++) s.stars[i] = 2;
  assert.equal(ER.worldOpen(s, 1), true);
  assert.equal(ER.worldOpen(s, 2), false);
  assert.equal(ER.topWorld(s), 1);
  assert.equal(ER.worldStars(s, 0), 8);
  assert.deepEqual(plain(ER.unlocks(0, 3).map(u => u.type + u.i)), ['color1', 'hat1']);
  assert.equal(ER.MAX_STARS, 60);
  assert.ok(ER.COLORS.every(c => c.need <= ER.MAX_STARS) && ER.HATS.every(h => h.need <= ER.MAX_STARS));
});

test('the engine stays pure: no DOM, no Kit, no Math.random, no timers', () => {
  for (const file of ['engine.js', 'levels.js']) {
    const src = readFileSync(path.join(repo, 'games/egg-rush', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /Math\.random|document\.|Kit\.|setTimeout|setInterval|requestAnimationFrame/, file);
  }
  // same seed, same game
  const a = play(2, 3, 42), b = play(2, 3, 42);
  assert.equal(a.r.time, b.r.time);
  assert.deepEqual(plain(a.ev), plain(b.ev));
});
