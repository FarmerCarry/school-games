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

function run(w, steps, input) {
  const events = [];
  for (let i = 0; i < steps && !w.over; i++) {
    LL.step(w, DT, input ? input(w, i, events) : []);
    for (const e of w.ev) events.push({ ...e, at: w.t });
    w.ev.length = 0;
  }
  return events;
}
function reeler(p) {
  const r = p.reel, err = r.f + r.fv * 0.2 - (r.z + r.h / 2);
  return Math.max(-1, Math.min(1, err * 7)) > r.zv;
}
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
  assert.deepEqual(plain(LL.TUNE.bite), [1.4, 1.1, 0.85, 0.6, 0.4]);
  assert.ok(LL.TUNE.nibMax[0] <= 1 && LL.TUNE.nibMax[4] >= 3 && LL.TUNE.nibMin[0] === 0);
  assert.ok(LL.TUNE.zone[0] > LL.TUNE.zone[4] * 1.6);
  assert.ok(LL.TUNE.dart[4] > LL.TUNE.dart[0] * 2);
  assert.ok(LL.TUNE.fill[0] > LL.TUNE.fill[4] && LL.TUNE.drain[0] < LL.TUNE.drain[4]);
  for (let i = 1; i < LL.PULL.length; i++) assert.ok(LL.PULL[i].v > LL.PULL[i - 1].v && LL.PULL[i].rest[1] < LL.PULL[i - 1].rest[1]);
});

test('five places with their own species and goals; every species belongs to one place', () => {
  assert.equal(LL.PLACES.length, 5);
  const ids = new Set();
  LL.PLACES.forEach((P, i) => {
    assert.ok(P.species.length >= 6 && P.species.length <= 8, `${P.id}: ${P.species.length} species`);
    assert.match(P.name, /[\u0600-\u06FF]/);
    assert.ok(LL.byId[P.goals.sp] && LL.byId[P.goals.sp].place === i, `${P.id}: the goal species lives there`);
    assert.ok(P.goals.n >= 3 && P.goals.w > 0);
    assert.ok(P.species.some(s => LL.SPECIES[s].max >= P.goals.w), `${P.id}: a fish can weigh ${P.goals.w}`);
  });
  for (const s of LL.SPECIES) {
    assert.ok(!ids.has(s.id), 'unique ' + s.id); ids.add(s.id);
    assert.match(s.name, /[\u0600-\u06FF]/, s.id);
    assert.ok(s.rarity >= 1 && s.rarity <= 3 && s.min > 0 && s.max > s.min && s.pull >= 1 && s.pull <= 4, s.id);
  }
  assert.equal(LL.SPECIES.filter(s => s.legend).length, 1, 'one legendary golden fish');
  assert.equal(LL.byId.golden.place, 4);
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
      assert.ok(target.y > w.P.surface && target.y < w.P.bed && target.x >= p.x0 && target.x <= p.x1);
      if (w.P.holes) assert.ok(w.P.holes.includes(target.x), 'on the ice the hook goes down a hole');
      else if (x >= p.x0 && x <= p.x1 && y > w.P.surface + 40 && y < w.P.bed - 28) assert.deepEqual([target.x, target.y], [x, y]);
    }
  }
  const w = LL.create({ place: 0, tier: 1, seed: 2, fishN: 0 });
  const p = w.players[0], x0 = p.aim.x;
  run(w, 30, () => [{ mx: 1 }]);
  assert.ok(Math.abs(p.aim.x - (x0 + LL.AIM_SPEED * 0.5)) < 1, 'half a second of Right moves the aim');
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

test('nibbles never count as a bite: pressing then scares the fish off, and the bite follows the last nibble', () => {
  for (let tier = 1; tier <= 5; tier++) {
    let nibbles = 0, bites = 0, spooks = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const a = hookedWorld(LL.byId.tilapia.i, tier, seed);
      const ev = run(a.w, 60 * 20, () => []);
      const mine = ev.filter(e => e.id === a.f.id), bite = mine.find(e => e.t === 'bite');
      assert.ok(bite, `tier ${tier} seed ${seed}: the fish bites`);
      const nib = mine.filter(e => e.t === 'nibble' && e.at < bite.at);
      assert.ok(nib.length >= LL.TUNE.nibMin[tier - 1] && nib.length <= LL.TUNE.nibMax[tier - 1]);
      const arrive = mine.find(e => e.t === 'arrive');
      assert.ok(arrive && arrive.at < bite.at && nib.every(n => n.at > arrive.at));
      assert.ok(!ev.some(e => e.t === 'hooked'));
      nibbles += nib.length; bites++;
      const b = hookedWorld(LL.byId.tilapia.i, tier, seed);
      let pressed = false;
      const ev2 = run(b.w, 60 * 12, (w, i, seen) => {
        const go = !pressed && seen.some(e => e.t === 'nibble');
        if (go) pressed = true;
        return [{ press: go }];
      });
      if (pressed) {
        spooks++;
        assert.ok(ev2.some(e => e.t === 'spook' && e.id === b.f.id));
        assert.ok(!ev2.some(e => e.t === 'hooked' && e.id === b.f.id));
        assert.equal(b.p.casts, 1);
      }
    }
    if (tier >= 3) assert.ok(nibbles >= 25 && spooks === 25);
    assert.equal(bites, 25);
  }
});

test('the bite window lasts exactly the tier time: timely press hooks, waiting longer loses the fish', () => {
  for (let tier = 1; tier <= 5; tier++) {
    const win = LL.TUNE.bite[tier - 1];
    const a = hookedWorld(LL.byId.perch.i, tier, 11);
    const ev = run(a.w, 60 * 20, () => []);
    const bite = ev.find(e => e.t === 'bite'), late = ev.find(e => e.t === 'late');
    assert.ok(bite && late);
    assert.ok(Math.abs(late.at - bite.at - win) <= DT * 1.5);
    assert.equal(a.p.state, 'wait');
    const b = hookedWorld(LL.byId.perch.i, tier, 11);
    let biteAt = -1;
    const ev2 = run(b.w, 60 * 20, (w, i, seen) => {
      const e = seen.find(e => e.t === 'bite');
      if (e && biteAt < 0) biteAt = e.at;
      return [{ press: biteAt >= 0 && w.t >= biteAt + win - DT * 2 && b.p.state === 'bite' }];
    });
    assert.ok(ev2.some(e => e.t === 'hooked'));
  }
});

test('a scripted reeler lands every species at tier 1 and tier 5', () => {
  for (const tier of [1, 5]) {
    for (const s of LL.SPECIES) {
      let landed = 0, hooks = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const r = angler(s.i, tier, seed);
        if (r.landed) {
          landed++; hooks += r.hooks;
          assert.equal(r.catch.id, s.id);
          assert.ok(r.catch.w10 >= s.min && r.catch.w10 <= s.max);
          assert.ok(r.catch.coins > 0);
        }
      }
      assert.equal(landed, 4, `tier ${tier}: ${s.id} landed ${landed}/4`);
      assert.ok(hooks <= 6);
    }
  }
});

test('a six-year-old tier is gentle: rough hold-and-release rhythm lands common fish', () => {
  for (const sp of ['pebble', 'sunny', 'tilapia']) {
    let ok = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const a = hookedWorld(LL.byId[sp].i, 1, seed);
      let hold = false, lag = [];
      const ev = run(a.w, 60 * 40, () => {
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
  for (let place = 0; place < 5; place++) {
    const w = LL.create({ place, tier: 1, rods: { zone: 3, reel: 3, lure: 3, bait: 3 }, seed: 9 });
    const ev = run(w, 60 * 300, () => []);
    assert.equal(w.players[0].casts, 0);
    assert.ok(!ev.some(e => e.t === 'landed' || e.t === 'hooked'));
  }
  const w = LL.create({ place: 0, tier: 1, seed: 21 });
  const ev = run(w, 60 * 300, (w, i) => [{ ax: 700, ay: 450, press: i === 0 }]);
  assert.ok(ev.some(e => e.t === 'bite') && ev.some(e => e.t === 'late'));
  assert.ok(!ev.some(e => e.t === 'landed' || e.t === 'hooked'));
  for (let tier = 1; tier <= 5; tier++) {
    for (const sp of ['pebble', 'carp', 'koi']) {
      const a = hookedWorld(LL.byId[sp].i, tier, tier * 7);
      a.w.mods = LL.rodMods({ zone: 3, reel: 3 });
      const ev2 = run(a.w, 60 * 60, () => [{ press: a.p.state === 'bite' }]);
      assert.ok(ev2.some(e => e.t === 'hooked') && ev2.some(e => e.t === 'escape'));
      assert.ok(!ev2.some(e => e.t === 'landed'));
    }
  }
});

test('junk beside the hook snags it with no fake-out nibbles and pays coins', () => {
  const w = LL.create({ place: 0, tier: 3, seed: 6, fishN: 0 });
  const j = w.junk.find(j => !j.float);
  j.kind = 'chest';
  const p = w.players[0];
  let bite = null;
  const ev = run(w, 60 * 30, (w, i, seen) => {
    if (!bite) bite = seen.find(e => e.t === 'bite');
    return [{ ax: j.x, ay: j.y - 10, press: i === 0 || (bite && p.state === 'bite'), hold: p.state === 'reel' && reeler(p) }];
  });
  assert.ok(bite && bite.junk && !ev.some(e => e.t === 'nibble'));
  const landed = ev.find(e => e.t === 'landed');
  assert.ok(landed && landed.c.junk && landed.c.id === 'chest' && landed.c.coins >= 25);
  assert.equal(p.total, 0);
  assert.equal(j.kind, '');
});

test('catches fill goals and two stars open the next place', () => {
  const s = LL.freshSave();
  assert.deepEqual([0, 1, 2, 3, 4].map(i => LL.isOpen(s, i)), [true, false, false, false, false]);
  const G = LL.PLACES[0].goals, small = { junk: false, sp: LL.byId.pebble.i, id: 'pebble', w10: 2, coins: 3 };
  let out;
  for (let i = 0; i < G.n - 1; i++) out = LL.applyCatch(s, 0, small);
  assert.equal(LL.stars(s, 0), 0);
  out = LL.applyCatch(s, 0, { ...small, w10: 3 });
  assert.deepEqual(plain(out.goals), [0]);
  assert.equal(out.best, true);
  assert.equal(LL.isOpen(s, 1), false);
  out = LL.applyCatch(s, 0, { junk: true, sp: -1, id: 'boot', w10: 10, coins: 1 });
  assert.deepEqual(plain(out.goals), []);
  out = LL.applyCatch(s, 0, { junk: false, sp: LL.byId[G.sp].i, id: G.sp, w10: G.w - 1, coins: 9 });
  assert.equal(out.unlocked, 1);
  assert.equal(LL.isOpen(s, 1), true);
  out = LL.applyCatch(s, 0, { junk: false, sp: LL.byId.carp.i, id: 'carp', w10: G.w, coins: 9 });
  assert.equal(LL.stars(s, 0), 3);
  assert.equal(LL.nextPlace(s), 1);
  assert.equal(LL.speciesCount(s), 3);
});

test('rods: coins buy three levels of each upgrade and improve fishing stats', () => {
  const s = LL.freshSave();
  assert.equal(LL.buy(s, 'zone'), false);
  s.coins = 1000;
  for (const kind of LL.RODS) for (let i = 0; i < LL.ROD_MAX; i++) assert.equal(LL.buy(s, kind), true);
  assert.equal(LL.buy(s, 'reel'), false);
  const m0 = LL.rodMods({}), m3 = LL.rodMods(s.rods);
  assert.ok(m3.zone > m0.zone && m3.fill > m0.fill && m3.drain < m0.drain && m3.lure > m0.lure && m3.bait > m0.bait);
});

test('2P derby: independent aims, two-minute clock with overtime, heavier basket wins', () => {
  const w = LL.create({ place: 0, duo: true, seed: 17 });
  const [a, b] = w.players, b0 = { ...b.aim };
  run(w, 20, () => [{ mx: 1, my: 1 }, {}]);
  assert.deepEqual(plain(b.aim), b0);
  const events = run(w, 60 * 200, w => w.players.map(p => ({
    press: p.state === 'ready' || p.state === 'bite' || (p.state === 'wait' && !p.fish && p.t > 8),
    hold: p.state === 'reel' && reeler(p)
  })));
  assert.ok(w.over && events.some(e => e.t === 'timeup'));
  assert.equal(LL.duoWinner(w), a.total === b.total ? 0 : a.total > b.total ? 1 : 2);
});

test('saves sanitize damaged inputs, DDA outcomes scale cleanly, and seeds are deterministic', () => {
  const fresh = plain(LL.freshSave());
  for (const raw of [null, undefined, 'broken{', 42, [], {}, { v: 1, coins: 9 }, { v: 3, coins: 500 }]) {
    assert.deepEqual(plain(LL.loadSave(raw)), fresh);
  }
  const bad = LL.loadSave({ v: 2, coins: -5, caught: 1.5, book: { koi: 'big', carp: 30, nemo: 4 }, junk: { boot: 2, sock: 1 },
    places: [{ n: 3, g: [1, 2, 'x'] }, null], rods: { zone: 9, reel: 2, lure: '1', bait: 1.5 }, coach: 'yes' });
  assert.deepEqual(plain(bad.book), { carp: 30 });
  assert.deepEqual(plain(bad.rods), { zone: 0, reel: 2, lure: 0, bait: 0 });
  assert.equal(LL.outcome('landed'), 1);
  assert.equal(LL.outcome('late'), 0);
  assert.ok(LL.outcome('escape', 1) > LL.outcome('escape', 0));
  const play = () => {
    const w = LL.create({ place: 2, tier: 4, seed: 99 });
    run(w, 60 * 30, (w, i) => [{ ax: 600 + (i % 300), ay: 420, press: i % 600 === 0, hold: i % 40 < 20 }]);
    return JSON.stringify([w.t, w.fish.map(f => [f.id, f.x, f.y, f.state]), w.players[0].catches]);
  };
  assert.equal(play(), play());
});
