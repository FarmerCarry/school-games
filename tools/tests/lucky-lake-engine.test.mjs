// Lucky Lake engine (games/lucky-lake/engine.js): tuning, casting, nibbles and bites, the
// reel bar, catches, goals, rods, the derby and saves, fished by scripted players.
// Node only, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(repo, 'games/lucky-lake/engine.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const LL = sandbox.window.LL;
const DT = 1 / 60;
const plain = v => JSON.parse(JSON.stringify(v));

// Steps the world, collecting events; input(w, i) gives the inputs of step i.
function run(w, steps, input) {
  const events = [];
  for (let i = 0; i < steps && !w.over; i++) {
    LL.step(w, DT, input ? input(w, i, events) : []);
    for (const e of w.ev) events.push({ ...e, at: w.t });
    w.ev.length = 0;
  }
  return events;
}
// A child who reels well: hold while the fish is above the middle of the green zone
// (a little ahead of where it is going), let go while it is below.
function reeler(p) {
  const r = p.reel, err = r.f + r.fv * 0.2 - (r.z + r.h / 2);
  return Math.max(-1, Math.min(1, err * 7)) > r.zv;
}
// A scripted angler after one species: aims at the fish, waits, strikes at the «!», reels.
function angler(sp, tier, seed) {
  const S = LL.SPECIES[sp];
  const w = LL.create({ place: S.place, tier, seed, fishN: 0, junk: false });
  const p = w.players[0];
  let f = null, waited = 0, strike = false, hooks = 0;
  for (let i = 0; i < 60 * 300; i++) {
    if (!f || !w.fish.includes(f)) { f = LL.spawnFish(w, sp, 500 + (seed * 97) % 500, LL.depthOf(w, S, 0.5)); f.leave = false; }
    let press = strike;
    strike = false;
    const aim = () => { const m = LL.mouth(f); p.aim.x = m.x + f.dir * 40; p.aim.y = m.y; };
    if (p.state === 'ready') { aim(); press = true; waited = 0; }
    if (p.state === 'wait' && !p.fish && (waited += DT) > 7) { aim(); press = true; waited = 0; }
    LL.step(w, DT, [{ press, hold: p.state === 'reel' && reeler(p) }]);
    for (const e of w.ev) {
      if (e.t === 'bite') strike = true;
      if (e.t === 'hooked') hooks++;
      if (e.t === 'landed') return { landed: true, hooks, catch: plain(e.c), t: w.t };
    }
    w.ev.length = 0;
  }
  return { landed: false, hooks, t: w.t };
}
// A lone fish of species sp right beside the hook, and a player waiting there.
function hookedWorld(sp, tier, seed = 3) {
  const S = LL.SPECIES[sp];
  const w = LL.create({ place: S.place, tier, seed, fishN: 0, junk: false });
  const p = w.players[0], y = LL.depthOf(w, S, 0.5);
  p.aim.x = 700; p.aim.y = y;
  run(w, 1, () => [{ press: true }]);
  run(w, 300, () => []);
  assert.equal(p.state, 'wait');
  const f = LL.spawnFish(w, sp, p.hook.x - 90, p.hook.y, 1);
  f.leave = false;
  return { w, p, f };
}

test('the engine is pure: no Kit, no page, no timers, no unseeded randomness', () => {
  assert.ok(LL && LL.TUNE && LL.step && LL.create, 'loads with only { window: {} }');
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage/);
});

test('every tuning knob moves one way from tier 1 to tier 5, in the direction that makes it harder', () => {
  for (const [key, row] of Object.entries(LL.TUNE)) {
    const dir = LL.HARDER[key];
    assert.ok(dir === 1 || dir === -1, `${key} has a direction`);
    assert.equal(row.length, LL.TIERS, `${key} has one entry per tier`);
    for (let i = 1; i < row.length; i++) assert.ok((row[i] - row[i - 1]) * dir >= 0, `${key} tier ${i + 1}: ${row}`);
    assert.notEqual(row[0], row[row.length - 1], `${key} changes between tier 1 and tier 5`);
  }
  // The headline knobs: the bite window shrinks from about 1.4 s to about 0.4 s, the
  // fake-out nibbles grow, the green zone shrinks and the fish darts faster.
  assert.deepEqual(plain(LL.TUNE.bite), [1.4, 1.1, 0.85, 0.6, 0.4]);
  assert.ok(LL.TUNE.nibMax[0] <= 1 && LL.TUNE.nibMax[4] >= 3 && LL.TUNE.nibMin[0] === 0);
  assert.ok(LL.TUNE.zone[0] > LL.TUNE.zone[4] * 1.6);
  assert.ok(LL.TUNE.dart[4] > LL.TUNE.dart[0] * 2);
  assert.ok(LL.TUNE.fill[0] > LL.TUNE.fill[4] && LL.TUNE.drain[0] < LL.TUNE.drain[4]);
  // Calm fish for young children, darting rare ones.
  for (let i = 1; i < LL.PULL.length; i++) assert.ok(LL.PULL[i].v > LL.PULL[i - 1].v && LL.PULL[i].rest[1] < LL.PULL[i - 1].rest[1]);
});

test('five places with their own species and goals; every species belongs to one place', () => {
  assert.equal(LL.PLACES.length, 5);
  const ids = new Set();
  LL.PLACES.forEach((P, i) => {
    assert.ok(P.species.length >= 6 && P.species.length <= 8, `${P.id}: ${P.species.length} species`);
    assert.match(P.name, /[؀-ۿ]/);
    assert.ok(LL.byId[P.goals.sp] && LL.byId[P.goals.sp].place === i, `${P.id}: the goal species lives there`);
    assert.ok(P.goals.n >= 3 && P.goals.w > 0);
    // The weight goal can be met by a fish of the place.
    assert.ok(P.species.some(s => LL.SPECIES[s].max >= P.goals.w), `${P.id}: a fish can weigh ${P.goals.w}`);
  });
  for (const s of LL.SPECIES) {
    assert.ok(!ids.has(s.id), 'unique ' + s.id); ids.add(s.id);
    assert.match(s.name, /[؀-ۿ]/, s.id);
    assert.ok(s.rarity >= 1 && s.rarity <= 3 && s.min > 0 && s.max > s.min && s.pull >= 1 && s.pull <= 4, s.id);
  }
  assert.equal(LL.SPECIES.filter(s => s.legend).length, 1, 'one legendary golden fish');
  assert.equal(LL.byId.golden.place, 4);
  // A crab and a turtle by the sea, glowing fish in the magic lagoon.
  assert.ok(LL.byId.crab.place === 2 && LL.byId.turtle.place === 2);
  assert.ok(LL.PLACES[4].species.every(i => LL.SPECIES[i].glow));
  assert.ok(LL.PLACES[3].holes.length >= 3, 'the frozen lake has ice holes');
  assert.ok(LL.PLACES[1].current > 0, 'the river has a current');
});

test('casting puts the hook exactly where the child aimed, through the nearest ice hole on the frozen lake', () => {
  for (let place = 0; place < 5; place++) {
    for (const [x, y] of [[420, 300], [700, 520], [1100, 640], [640, 330], [90, 900]]) {
      const w = LL.create({ place, tier: 3, seed: 5, fishN: 0, junk: false });
      const p = w.players[0];
      const target = LL.target(w, p, x, y);
      const events = run(w, 400, (w, i) => [{ ax: x, ay: y, press: i === 0 }]);
      const sunk = events.find(e => e.t === 'sunk');
      assert.ok(sunk, `place ${place}: the hook sinks`);
      assert.deepEqual([sunk.x, sunk.y], [target.x, target.y], `place ${place}: aimed at ${x},${y}`);
      const splash = events.find(e => e.t === 'splash');
      assert.equal(splash.x, target.x, 'the bobber lands straight above the hook');
      assert.ok(splash.at < sunk.at, 'the bobber lands, then the hook sinks');
      // Inside the water and the player's reach.
      assert.ok(target.y > w.P.surface && target.y < w.P.bed && target.x >= p.x0 && target.x <= p.x1);
      if (w.P.holes) assert.ok(w.P.holes.includes(target.x), 'on the ice the hook goes down a hole');
      else if (x >= p.x0 && x <= p.x1 && y > w.P.surface + 40 && y < w.P.bed - 28) assert.deepEqual([target.x, target.y], [x, y]);
    }
  }
  // The keys move the same aim, and the mouse sets it.
  const w = LL.create({ place: 0, tier: 1, seed: 2, fishN: 0 });
  const p = w.players[0], x0 = p.aim.x;
  run(w, 30, () => [{ mx: 1 }]);
  assert.ok(Math.abs(p.aim.x - (x0 + LL.AIM_SPEED * 0.5)) < 1, 'half a second of → moves the aim');
  run(w, 1, () => [{ ax: 500, ay: 400 }]);
  assert.deepEqual([p.aim.x, p.aim.y], [500, 400]);
});

test('the river\'s current carries a waiting hook downstream; still water does not', () => {
  for (const [place, moves] of [[1, true], [0, false]]) {
    const w = LL.create({ place, tier: 3, seed: 4, fishN: 0, junk: false });
    const p = w.players[0];
    run(w, 200, (w, i) => [{ ax: 600, ay: 400, press: i === 0 }]);
    assert.equal(p.state, 'wait');
    const x = p.hook.x;
    run(w, 120, () => []);
    if (moves) assert.ok(Math.abs(p.hook.x - x - 2 * LL.TUNE.current[2]) < 0.5, `drifted ${p.hook.x - x}`);
    else assert.equal(p.hook.x, x);
    assert.equal(p.bob.x, p.hook.x, 'the bobber stays above the hook');
  }
});

test('a press while waiting reels the hook back and casts it again to the aim', () => {
  const w = LL.create({ place: 0, tier: 2, seed: 8, fishN: 0, junk: false });
  const p = w.players[0];
  run(w, 200, (w, i) => [{ ax: 500, ay: 400, press: i === 0 }]);
  assert.equal(p.state, 'wait');
  const events = run(w, 300, (w, i) => [{ ax: 900, ay: 560, press: i === 0 }]);
  assert.deepEqual(events.filter(e => ['back', 'cast', 'sunk'].includes(e.t)).map(e => e.t), ['back', 'cast', 'sunk']);
  assert.deepEqual([p.hook.x, p.hook.y], [900, 560]);
  assert.equal(p.casts, 2);
});

test('nibbles never count as a bite: the bobber only dips, a press then scares the fish off, and the «!» follows the last nibble', () => {
  for (let tier = 1; tier <= 5; tier++) {
    let nibbles = 0, bites = 0, spooks = 0;
    for (let seed = 1; seed <= 25; seed++) {
      // Watch the fish nibble without pressing.
      const a = hookedWorld(LL.byId.tilapia.i, tier, seed);
      const ev = run(a.w, 60 * 20, () => []);
      const mine = ev.filter(e => e.id === a.f.id), bite = mine.find(e => e.t === 'bite');
      assert.ok(bite, `tier ${tier} seed ${seed}: the fish bites in the end`);
      // Its first visit: from noticing the hook to the «!».
      const nib = mine.filter(e => e.t === 'nibble' && e.at < bite.at);
      assert.ok(nib.length >= LL.TUNE.nibMin[tier - 1] && nib.length <= LL.TUNE.nibMax[tier - 1], `tier ${tier}: ${nib.length} nibbles`);
      const arrive = mine.find(e => e.t === 'arrive');
      assert.ok(arrive && arrive.at < bite.at && nib.every(n => n.at > arrive.at), 'the fish nibbles only once it is at the hook');
      assert.ok(!ev.some(e => e.t === 'bite' && e.at < bite.at), 'no other bite before');
      assert.ok(!ev.some(e => e.t === 'hooked'), 'nothing is hooked without a press');
      nibbles += nib.length; bites++;
      // The same fish again, with a press at the first nibble: a scare, never a catch.
      const b = hookedWorld(LL.byId.tilapia.i, tier, seed);
      let pressed = false;
      const ev2 = run(b.w, 60 * 12, (w, i, seen) => {
        const go = !pressed && seen.some(e => e.t === 'nibble');
        if (go) pressed = true;
        return [{ press: go }];
      });
      if (pressed) {
        spooks++;
        assert.ok(ev2.some(e => e.t === 'spook' && e.id === b.f.id), 'a press during a nibble scares the fish');
        assert.ok(!ev2.some(e => e.t === 'hooked' && e.id === b.f.id), 'it never hooks it');
        assert.equal(b.p.casts, 1, 'the hook stays where it is');
        assert.notEqual(b.f.state, 'bite');
      }
    }
    if (tier >= 3) assert.ok(nibbles >= 25, `tier ${tier}: fake-outs happen (${nibbles})`);
    assert.ok(bites === 25);
    if (tier >= 3) assert.ok(spooks === 25);
  }
});

test('the bite window lasts exactly the tier\'s time: a press inside it hooks, waiting longer loses the fish', () => {
  for (let tier = 1; tier <= 5; tier++) {
    const window = LL.TUNE.bite[tier - 1];
    const a = hookedWorld(LL.byId.perch.i, tier, 11);
    const ev = run(a.w, 60 * 20, () => []);
    const bite = ev.find(e => e.t === 'bite'), late = ev.find(e => e.t === 'late');
    assert.ok(bite && late, `tier ${tier}: a bite, then too late`);
    assert.ok(Math.abs(late.at - bite.at - window) <= DT * 1.5, `tier ${tier}: window ${(late.at - bite.at).toFixed(3)} s, wanted ${window}`);
    assert.equal(a.p.state, 'wait', 'the hook waits on for the next fish');
    // A press just before the window closes still hooks.
    const b = hookedWorld(LL.byId.perch.i, tier, 11);
    let biteAt = -1;
    const ev2 = run(b.w, 60 * 20, (w, i, seen) => {
      const e = seen.find(e => e.t === 'bite');
      if (e && biteAt < 0) biteAt = e.at;
      return [{ press: biteAt >= 0 && w.t >= biteAt + window - DT * 2 && b.p.state === 'bite' }];
    });
    assert.ok(ev2.some(e => e.t === 'hooked'), `tier ${tier}: a late but timely press hooks`);
  }
  assert.ok(LL.TUNE.bite[0] >= 1.3 && LL.TUNE.bite[4] <= 0.45);
});

test('a scripted reeler lands every species at tier 1 and at tier 5', () => {
  for (const tier of [1, 5]) {
    for (const s of LL.SPECIES) {
      let landed = 0, hooks = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const r = angler(s.i, tier, seed);
        if (r.landed) {
          landed++; hooks += r.hooks;
          assert.equal(r.catch.id, s.id);
          assert.ok(r.catch.w10 >= s.min && r.catch.w10 <= s.max, `${s.id} weighs ${r.catch.w10}`);
          assert.ok(r.catch.coins > 0);
        }
      }
      assert.equal(landed, 4, `tier ${tier}: ${s.id} landed ${landed}/4`);
      assert.ok(hooks <= 6, `tier ${tier}: ${s.id} needed ${hooks} hooks for 4 fish`);
    }
  }
});

test('a six-year-old\'s tier is gentle: a common fish is landed by holding and letting go in a rough rhythm', () => {
  // A clumsy child: holds while the fish is above the zone's top edge, lets go when
  // it is below the bottom edge, and reacts a quarter of a second late.
  for (const sp of ['pebble', 'sunny', 'tilapia']) {
    let ok = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const a = hookedWorld(LL.byId[sp].i, 1, seed);
      let hold = false, lag = [];
      const ev = run(a.w, 60 * 40, (w, i, seen) => {
        const p = a.p;
        if (p.state === 'bite') return [{ press: true }];
        if (p.state !== 'reel') return [{}];
        const r = p.reel;
        lag.push(r.f > r.z + r.h ? true : r.f < r.z ? false : hold);
        if (lag.length > 15) hold = lag.shift();
        return [{ hold }];
      });
      if (ev.some(e => e.t === 'landed')) ok++;
    }
    assert.ok(ok >= 9, `${sp}: landed ${ok}/10`);
  }
});

test('an idle player never lands a fish; a hooked fish nobody reels swims away', () => {
  // Nobody touches anything for ten minutes: no cast, no catch.
  for (let place = 0; place < 5; place++) {
    const w = LL.create({ place, tier: 1, rods: { zone: 3, reel: 3, lure: 3, bait: 3 }, seed: 9 });
    const ev = run(w, 60 * 600, () => []);
    assert.equal(w.players[0].casts, 0);
    assert.ok(!ev.some(e => e.t === 'landed' || e.t === 'hooked'), `place ${place}`);
  }
  // One cast, then nothing: fish come, bite, and leave with the bait.
  const w = LL.create({ place: 0, tier: 1, seed: 21 });
  const ev = run(w, 60 * 300, (w, i) => [{ ax: 700, ay: 450, press: i === 0 }]);
  assert.ok(ev.some(e => e.t === 'bite') && ev.some(e => e.t === 'late'));
  assert.ok(!ev.some(e => e.t === 'landed' || e.t === 'hooked'));
  // Hooked, then never held at any tier, even with the biggest zone: the fish keeps out
  // of the resting zone and the meter runs out.
  for (let tier = 1; tier <= 5; tier++) {
    for (const sp of ['pebble', 'carp', 'koi']) {
      const a = hookedWorld(LL.byId[sp].i, tier, tier * 7);
      a.w.mods = LL.rodMods({ zone: 3, reel: 3 });
      const ev2 = run(a.w, 60 * 60, () => [{ press: a.p.state === 'bite' }]);
      assert.ok(ev2.some(e => e.t === 'hooked'), `${sp} tier ${tier}: hooked`);
      assert.ok(ev2.some(e => e.t === 'escape'), `${sp} tier ${tier}: got away`);
      assert.ok(!ev2.some(e => e.t === 'landed'), `${sp} tier ${tier}: never landed without holding`);
    }
  }
});

test('a funny thing beside the hook snags it: one «!», an easy reel, and it is caught as junk', () => {
  const w = LL.create({ place: 0, tier: 3, seed: 6, fishN: 0 });
  const j = w.junk.find(j => !j.float);
  j.kind = 'chest';
  const p = w.players[0];
  let bite = null;
  const ev = run(w, 60 * 30, (w, i, seen) => {
    if (!bite) bite = seen.find(e => e.t === 'bite');
    return [{ ax: j.x, ay: j.y - 10, press: i === 0 || (bite && p.state === 'bite'), hold: p.state === 'reel' && reeler(p) }];
  });
  assert.ok(bite && bite.junk, 'the chest snags the hook');
  assert.ok(!ev.some(e => e.t === 'nibble'), 'junk never nibbles');
  const landed = ev.find(e => e.t === 'landed');
  assert.ok(landed && landed.c.junk && landed.c.id === 'chest');
  assert.ok(landed.c.coins >= 25, 'a treasure chest is full of coins');
  assert.equal(p.total, 0, 'junk weighs nothing in a derby total');
  assert.equal(j.kind, '', 'the chest is gone until a new thing sinks there');
});

test('catches fill the goals: n fish, the goal species, a heavy one; two stars open the next place', () => {
  const s = LL.freshSave();
  assert.deepEqual([0, 1, 2, 3, 4].map(i => LL.isOpen(s, i)), [true, false, false, false, false]);
  const G = LL.PLACES[0].goals, small = { junk: false, sp: LL.byId.pebble.i, id: 'pebble', w10: 2, coins: 3 };
  let out;
  for (let i = 0; i < G.n - 1; i++) out = LL.applyCatch(s, 0, small);
  assert.equal(LL.stars(s, 0), 0);
  out = LL.applyCatch(s, 0, { ...small, w10: 3 });
  assert.deepEqual(plain(out.goals), [0], 'the fifth fish earns the first star');
  assert.equal(out.best, true, 'a heavier pebble fish is a new best');
  assert.equal(s.book.pebble, 3);
  assert.equal(LL.isOpen(s, 1), false, 'one star is not enough');
  // Junk is no fish: it pays coins, fills the junk page and no goal.
  out = LL.applyCatch(s, 0, { junk: true, sp: -1, id: 'boot', w10: 10, coins: 1 });
  assert.deepEqual(plain(out.goals), []); assert.equal(s.junk.boot, 1); assert.equal(s.places[0].n, G.n);
  out = LL.applyCatch(s, 0, { junk: false, sp: LL.byId[G.sp].i, id: G.sp, w10: G.w - 1, coins: 9 });
  assert.equal(out.newSpecies, true);
  assert.deepEqual(plain(out.goals), [1]);
  assert.equal(out.unlocked, 1, 'the second star opens the river');
  assert.equal(LL.isOpen(s, 1), true);
  out = LL.applyCatch(s, 0, { junk: false, sp: LL.byId.carp.i, id: 'carp', w10: G.w, coins: 9 });
  assert.deepEqual(plain(out.goals), [2]);
  assert.equal(out.unlocked, -1, 'nothing new opens twice');
  assert.equal(LL.stars(s, 0), 3);
  assert.equal(LL.nextPlace(s), 1, 'the next place to fish is the river');
  assert.equal(s.caught, G.n + 2);
  assert.equal(s.coins, 3 * G.n + 1 + 9 + 9);
  assert.equal(LL.speciesCount(s), 3);
  // A goal is done once: no star twice.
  out = LL.applyCatch(s, 0, { junk: false, sp: LL.byId[G.sp].i, id: G.sp, w10: 99, coins: 1 });
  assert.deepEqual(plain(out.goals), []);
  // A goal fish caught elsewhere does not count for this place.
  const t = LL.freshSave();
  LL.applyCatch(t, 1, { junk: false, sp: LL.byId[G.sp].i, id: G.sp, w10: 50, coins: 1 });
  assert.deepEqual(plain(t.places[0].g), [0, 0, 0]);
  // Every place's goals can be met with its own fish, and opens the next.
  const u = LL.freshSave();
  for (let i = 0; i < 4; i++) {
    const P = LL.PLACES[i], sp = LL.byId[P.goals.sp];
    for (let k = 0; k < P.goals.n; k++) LL.applyCatch(u, i, { junk: false, sp: sp.i, id: sp.id, w10: sp.max, coins: 1 });
    assert.ok(LL.stars(u, i) >= 2 && LL.isOpen(u, i + 1), `${P.id} opens the next place`);
  }
});

test('rods: coins buy three levels of each upgrade, and they help in the water', () => {
  const s = LL.freshSave();
  assert.equal(LL.buy(s, 'zone'), false, 'no coins, no rod');
  s.coins = 1000;
  for (const kind of LL.RODS) for (let i = 0; i < LL.ROD_MAX; i++) assert.equal(LL.buy(s, kind), true, kind + ' ' + i);
  assert.equal(LL.buy(s, 'reel'), false, 'three levels at most');
  const spent = Object.values(LL.ROD_COST).flat().reduce((a, b) => a + b, 0);
  assert.equal(s.coins, 1000 - spent);
  const m0 = LL.rodMods({}), m3 = LL.rodMods(s.rods);
  assert.ok(m3.zone > m0.zone && m3.fill > m0.fill && m3.drain < m0.drain && m3.lure > m0.lure && m3.bait > m0.bait);
  // A bigger zone in the bar.
  const zone = mods => {
    const a = hookedWorld(LL.byId.pebble.i, 3, 2);
    if (mods) a.w.mods = mods;
    for (let i = 0; i < 60 * 20 && a.p.state !== 'reel'; i++) run(a.w, 1, () => [{ press: a.p.state === 'bite' }]);
    return a.p.reel.h;
  };
  assert.ok(zone(m3) > zone() * 1.3);
  // The shiny lure brings more rare fish into the lake.
  const rare = rods => {
    let n = 0;
    for (let seed = 1; seed <= 40; seed++) n += LL.create({ place: 0, tier: 1, seed, rods }).fish.filter(f => LL.SPECIES[f.sp].rarity >= 2).length;
    return n;
  };
  assert.ok(rare({ lure: 3 }) > rare({}) * 1.3);
});

test('the derby: two fishers on one lake, each with their own aim and reel; time up, the heavier basket wins', () => {
  const w = LL.create({ place: 0, duo: true, seed: 17 });
  assert.equal(w.players.length, 2);
  assert.equal(w.tier, LL.DUO_TIER);
  assert.equal(w.left, LL.DUO_SECONDS);
  const [a, b] = w.players;
  // Player 1 aims with its keys, player 2 with its own; neither moves the other's aim.
  const b0 = { ...b.aim };
  run(w, 20, () => [{ mx: 1, my: 1 }, {}]);
  assert.deepEqual(plain(b.aim), b0);
  run(w, 20, () => [{}, { mx: -1 }]);
  assert.ok(b.aim.x < b0.x);
  // Both fish the whole two minutes with the same skill.
  const events = run(w, 60 * 200, (w, i, seen) => w.players.map(p => {
    const press = p.state === 'ready' || p.state === 'bite' || (p.state === 'wait' && !p.fish && p.t > 8);
    return { press, hold: p.state === 'reel' && reeler(p) };
  }));
  assert.ok(w.over, 'the derby ends');
  assert.ok(events.some(e => e.t === 'timeup'));
  assert.ok(w.t <= LL.DUO_SECONDS + LL.OVERTIME + DT);
  for (const p of w.players) {
    assert.ok(p.catches.length >= 2, `player ${p.i + 1} caught ${p.catches.length}`);
    assert.equal(p.total, p.catches.filter(c => !c.junk).reduce((n, c) => n + c.w10, 0));
  }
  assert.ok(events.filter(e => e.t === 'landed').every(e => e.p === 0 || e.p === 1));
  const win = LL.duoWinner(w);
  assert.equal(win, a.total === b.total ? 0 : a.total > b.total ? 1 : 2);
  // No new cast once the clock has run out.
  const casts = a.casts;
  LL.step(w, DT, [{ press: true }, { press: true }]);
  assert.equal(a.casts, casts);
  // A fish on the line when the clock ends may still be landed.
  const v = LL.create({ place: 0, duo: true, seed: 3, fishN: 0, junk: false });
  const f = LL.spawnFish(v, LL.byId.sunny.i, 560, 400, 1); f.leave = false;
  v.players[0].aim.x = 640; v.players[0].aim.y = 400;
  let hookedAt = -1;
  const ev = run(v, 60 * 200, (w, i, seen) => {
    const p = w.players[0];
    if (hookedAt < 0 && p.state === 'reel') { hookedAt = w.t; w.left = 0.5; }
    return [{ press: p.state === 'ready' || p.state === 'bite', hold: p.state === 'reel' && reeler(p) }, {}];
  });
  assert.ok(hookedAt > 0);
  const landed = ev.find(e => e.t === 'landed'), up = ev.find(e => e.t === 'timeup');
  assert.ok(landed && up && landed.at > hookedAt + 0.5 && up.at >= landed.at, 'the last fish is landed after the clock ends');
});

test('saves: a fresh save, every field checked, and old or junk saves load as a fresh playable save', () => {
  const fresh = plain(LL.freshSave());
  assert.deepEqual(fresh, { v: 2, coins: 0, caught: 0, book: {}, junk: {}, places: [0, 1, 2, 3, 4].map(() => ({ n: 0, g: [0, 0, 0] })), rods: { zone: 0, reel: 0, lure: 0, bait: 0 }, coach: false });
  // The first version of the lake saved coins, quests, an aquarium and more, without v: 2.
  const old = { coins: 500, rod: 3, caught: 40, book: { 'bass': 1 }, quests: [{ k: 'x' }], aqua: [{ id: 3 }], derby: 180, music: true };
  for (const raw of [null, undefined, 'broken{', 42, [], [1, 2], {}, { v: 1, coins: 9 }, old, { ...old, v: '2' }]) assert.deepEqual(plain(LL.loadSave(raw)), fresh, JSON.stringify(raw));
  // A good save survives a round trip through JSON.
  const s = LL.freshSave();
  s.coins = 77; s.caught = 9; s.book.koi = 21; s.junk.duck = 2; s.places[0] = { n: 9, g: [1, 0, 1] }; s.rods.lure = 2; s.coach = true;
  assert.deepEqual(plain(LL.loadSave(JSON.parse(JSON.stringify(s)))), plain(s));
  // Damaged fields fall back one by one; unknown species and junk are dropped.
  const bad = LL.loadSave({ v: 2, coins: -5, caught: 1.5, book: { koi: 'big', carp: 30, nemo: 4, golden: 0 }, junk: { boot: 2, sock: 1, duck: -1 },
    places: [{ n: 3, g: [1, 2, 'x'] }, null, 'x', { n: -1, g: 'abc' }], rods: { zone: 9, reel: 2, lure: '1', bait: 1.5 }, coach: 'yes', extra: 1 });
  assert.deepEqual(plain(bad), { v: 2, coins: 0, caught: 0, book: { carp: 30 }, junk: { boot: 2 },
    places: [{ n: 3, g: [1, 0, 0] }, { n: 0, g: [0, 0, 0] }, { n: 0, g: [0, 0, 0] }, { n: 0, g: [0, 0, 0] }, { n: 0, g: [0, 0, 0] }],
    rods: { zone: 0, reel: 2, lure: 0, bait: 0 }, coach: false });
  // A loaded save always plays.
  for (const raw of [bad, old, 'x']) {
    const t = LL.loadSave(raw);
    assert.equal(LL.isOpen(t, 0), true);
    const w = LL.create({ place: LL.nextPlace(t), tier: 1, rods: t.rods, seed: 1 });
    run(w, 60, (w, i) => [{ press: i === 0 }]);
    assert.equal(w.players[0].casts, 1);
  }
});

test('the DDA outcome: a landed fish is a success, a fish lost on the reel a little, a missed bite nothing', () => {
  assert.equal(LL.outcome('landed'), 1);
  assert.equal(LL.outcome('late'), 0);
  assert.equal(LL.outcome('spook'), 0);
  const lo = LL.outcome('escape', 0), hi = LL.outcome('escape', 1);
  assert.ok(lo > 0 && hi > lo && hi < 0.5);
});

test('the same seed replays the same lake', () => {
  const play = () => {
    const w = LL.create({ place: 2, tier: 4, seed: 99 });
    run(w, 60 * 60, (w, i) => [{ ax: 600 + (i % 300), ay: 420, press: i % 600 === 0, hold: i % 40 < 20 }]);
    return JSON.stringify([w.t, w.fish.map(f => [f.id, f.x, f.y, f.state]), w.players[0].catches, w.players[0].casts]);
  };
  assert.equal(play(), play());
});
