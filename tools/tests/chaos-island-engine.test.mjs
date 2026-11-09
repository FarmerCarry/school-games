// Chaos Island engine (games/chaos-island/engine.js): tuning, islands, platformer physics,
// the warning before every hazard, whole rounds and matches played by a scripted child who
// follows each disaster's counter-move, an idle child, and saves. Node only, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(repo, 'games/chaos-island/engine.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const CI = sandbox.window.CI;
const DT = 1 / 60;
const ID = /^[A-Za-z][A-Za-z0-9_:.-]{0,23}$/;
const plain = v => JSON.parse(JSON.stringify(v));

// A scripted child: each frame it asks the same planner the computer islanders use, with
// no reaction delay and no mistakes, which keys to hold, and presses exactly those.
function smartKeys(world, mind) { return CI.think(world, world.actors[0], mind); }
// Plays a world to its end; returns the child's actor and every event seen.
function play(world, how, seed = 1) {
  const mind = CI.mind(0, 0, seed), events = [];
  for (let n = 0; world.phase !== 'done' && n < 60 * 600; n++) {
    CI.step(world, DT, [how === 'smart' ? smartKeys(world, mind) : CI.NONE]);
    for (const e of world.ev) events.push(e);
    world.ev.length = 0;
  }
  assert.equal(world.phase, 'done', 'the match ends');
  return { me: world.actors[0], events };
}
// A child alone on an island, kept in the calm before the first disaster.
function stage(island = 0) {
  return CI.create(CI.plan(island, 1, 3, { rounds: [{ a: 'meteors' }], bots: 0 }), { humans: 1, seed: 3 });
}
function hold(w, keys, n) { for (let i = 0; i < n; i++) { w.pt = Math.min(w.pt, 1); CI.step(w, DT, [keys]); w.ev.length = 0; } }
function put(w, x, plat) { const a = w.actors[0]; a.x = x; a.y = plat ? plat.y : CI.GROUND; a.vx = a.vy = 0; a.ground = plat || w.ground; return a; }

test('the engine is pure: no Kit, no page, no timers, no unseeded randomness', () => {
  assert.ok(CI && CI.TUNE && CI.step && CI.think, 'loads with only { window: {} }');
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage/);
});

test('every tuning knob moves one way from tier 1 to tier 5, the way that makes it harder', () => {
  for (const [key, row] of Object.entries(CI.TUNE)) {
    const dir = CI.HARDER[key];
    assert.ok(dir === 1 || dir === -1, `${key} has a direction`);
    assert.equal(row.length, CI.TIERS, `${key} has one entry per tier`);
    for (let i = 1; i < row.length; i++) assert.ok((row[i] - row[i - 1]) * dir >= 0, `${key} tier ${i + 1}: ${row}`);
    assert.notEqual(row[0], row[row.length - 1], `${key} changes between tier 1 and tier 5`);
  }
  const T = CI.TUNE;
  // The knobs the design names: warning time, meteors and clouds, jelly speed and height,
  // gust strength, round length, rounds and computer islanders.
  assert.ok(T.lead[0] > T.lead[4] && T.lead[4] >= 1, 'warnings shorten but stay at least 1 s');
  assert.ok(T.meteorGap[0] > T.meteorGap[4] && T.burst[0] < T.burst[4] && T.clouds[0] < T.clouds[4]);
  assert.ok(T.jellySpeed[0] < T.jellySpeed[4] && T.jellySteps[0] < T.jellySteps[4]);
  assert.ok(T.gust[0] < T.gust[4] && T.gust[4] < CI.PHYS.run, 'gusts get stronger but walking against one always wins');
  assert.ok(T.len[0] >= 30 && T.len[4] <= 40 && T.len[0] < T.len[4]);
  assert.deepEqual(plain(T.rounds), [3, 5, 5, 5, 5]);
  assert.ok(T.bots[0] === 3 && T.bots[4] === 4);
  assert.deepEqual(plain(T.combos), [0, 0, 0, 1, 2], 'two disasters at once only at the highest tiers');
});

test('every platform of every island can be reached, with the door shut or open, wherever the cloud drifts', () => {
  for (let i = 0; i < CI.ISLAND_COUNT; i++) {
    for (const door of [false, true]) for (const t of [0, 1.7, 3.1, 4.6, 6.2]) {
      const w = CI.create(CI.plan(i, 1, 1, { rounds: [{ a: 'meteors' }] }), { humans: 1, seed: 1 });
      w.door = door; w.t = t;
      w.plats.forEach(p => { if (p.amp) p.x = p.base + p.amp * Math.sin(t * 2 * Math.PI / p.period); });
      for (const p of w.plats) {
        assert.ok(CI.reachable(w, w.ground, p), `${w.isl.id}: ${p.id} from the ground (door ${door}, t ${t})`);
        assert.ok(CI.reachable(w, p, w.ground), `${w.isl.id}: back down from ${p.id}`);
      }
    }
    const h = CI.ISLANDS[i].house;
    assert.ok(h.x1 - h.x0 >= 200, 'the house fits everyone');
    assert.ok(h.x0 === CI.EDGE_L || h.x1 === CI.EDGE_R, 'the house stands at one end of the island');
  }
});

test('each jelly level leaves every platform clearly dry or clearly under, and some high spots dry', () => {
  for (const isl of CI.ISLANDS) {
    const tops = [CI.GROUND, isl.house.roofY, ...isl.plats.map(p => p.y)];
    let prev = CI.GROUND;
    isl.jelly.forEach((L, k) => {
      assert.ok(L < prev, `${isl.id}: level ${k + 1} rises`);
      prev = L;
      for (const y of tops) {
        const dry = L - y >= -1, under = L <= y - CI.EYES - 6;
        assert.ok(dry || under, `${isl.id}: a platform at ${y} is half in the jelly at level ${L}`);
      }
      assert.ok(tops.filter(y => L - y >= -1).length >= 2, `${isl.id}: level ${L} leaves high spots`);
      assert.ok(tops.some(y => y < CI.GROUND && L <= y - CI.EYES - 6) || k === 0, `${isl.id}: level ${L} covers some platform`);
    });
  }
});

test('one-way platforms: jump up through them, land on top, and drop through with Down', () => {
  const w = stage(0), leaf = w.plats.find(p => p.id === 'p1'), crate = w.plats.find(p => p.id === 'crate');
  // Jump straight up from under a palm frond: through it, and onto it.
  let a = put(w, leaf.x + leaf.w / 2);
  hold(w, { up: 1 }, 2);
  assert.ok(a.vy < 0, 'the jump starts');
  let passed = false;
  for (let i = 0; i < 60; i++) { hold(w, { up: 1 }, 1); if (a.y < leaf.y - 5) passed = true; }
  assert.ok(passed, 'it rises through the frond');
  hold(w, {}, 30);
  assert.equal(a.ground, leaf, 'it lands on top');
  assert.equal(a.y, leaf.y);
  // Down drops back through to the sand.
  hold(w, { down: 1 }, 2);
  hold(w, {}, 40);
  assert.equal(a.ground, w.ground, 'Down drops through to the sand');
  // The sand is solid: Down does nothing there.
  hold(w, { down: 1 }, 20);
  assert.equal(a.ground, w.ground); assert.equal(a.y, CI.GROUND);
  // The roof is solid from above too (you walk off its door side instead).
  a = put(w, (w.roof.x + w.roof.x + w.roof.w) / 2, w.roof);
  hold(w, { down: 1 }, 2); hold(w, {}, 20);
  assert.equal(a.ground, w.roof, 'the roof cannot be dropped through');
  // A crate is a one-way platform on the sand.
  a = put(w, crate.x + crate.w / 2, crate);
  hold(w, { down: 1 }, 2); hold(w, {}, 30);
  assert.equal(a.ground, w.ground);
});

test('jumps feel fair: a buffered press, coyote time, and a shorter hop on a tap', () => {
  const w = stage(0), a = put(w, 760);
  // Full jump height and a tapped hop.
  hold(w, { up: 1 }, 1);
  let top = CI.GROUND;
  for (let i = 0; i < 50; i++) { hold(w, { up: 1 }, 1); top = Math.min(top, a.y); }
  hold(w, {}, 40);
  const full = CI.GROUND - top;
  assert.ok(Math.abs(full - CI.APEX) < 12, 'a held jump rises about ' + Math.round(CI.APEX) + ' px: ' + full);
  hold(w, { up: 1 }, 3);
  top = CI.GROUND;
  for (let i = 0; i < 50; i++) { hold(w, {}, 1); top = Math.min(top, a.y); }
  assert.ok(CI.GROUND - top < full * 0.6, 'a tap makes a short hop: ' + (CI.GROUND - top));
  hold(w, {}, 30);
  // A press just before landing still jumps when the feet touch down.
  hold(w, { up: 1 }, 1); hold(w, {}, 1);
  for (let i = 0; i < 80 && !(a.vy > 0 && a.y > CI.GROUND - 24); i++) hold(w, {}, 1);
  assert.ok(a.vy > 0 && !a.ground, 'falling, just above the sand');
  hold(w, { up: 1 }, 1);
  let jumped = false;
  for (let i = 0; i < 8; i++) { hold(w, { up: 1 }, 1); if (a.vy < -500) jumped = true; }
  assert.ok(jumped, 'a press just before landing is kept for the landing');
  hold(w, {}, 60);
  // Walk off the crate and press jump a moment later: still a jump.
  const crate = w.plats.find(p => p.id === 'crate');
  put(w, crate.x + crate.w - 2, crate);
  for (let i = 0; i < 30 && a.ground === crate; i++) hold(w, { r: 1 }, 1);
  assert.equal(a.ground, null, 'walked off the crate');
  hold(w, { r: 1 }, 2);
  hold(w, { r: 1, up: 1 }, 1);
  assert.ok(a.vy < -500, 'coyote time lets a late press jump');
});

test('walking stops at the sea; only the wind can blow an islander into it', () => {
  const w = stage(0), a = put(w, 1150);
  hold(w, { r: 1 }, 90);
  assert.ok(a.x <= CI.EDGE_R && a.y === CI.GROUND && a.hearts === 3, 'the beach ends at the water');
  const closed = put(w, 400);
  hold(w, { l: 1 }, 90);
  assert.ok(closed.x >= w.house.x1, 'a shut door is a wall');
});

// Runs a single-disaster round for the scripted child and for an idle child, and checks the
// warnings: every bonk and splash has a warning first, long enough to react.
const RUNS = [];
for (const dis of CI.DIS) for (const tier of [1, 5]) for (let island = 0; island < CI.ISLAND_COUNT; island++) {
  const seed = 101 + island * 7 + tier * 13 + dis.length;
  RUNS.push({ dis, tier, island, seed });
}
const results = new Map();
function runAll() {
  if (results.size) return results;
  for (const r of RUNS) {
    const plan = CI.plan(r.island, r.tier, r.seed, { rounds: [{ a: r.dis }] });
    const smart = play(CI.create(plan, { humans: 1, seed: r.seed }), 'smart', r.seed);
    const idle = play(CI.create(plan, { humans: 1, seed: r.seed }), 'idle', r.seed);
    results.set(r, { smart, idle });
  }
  return results;
}

test('every disaster warns before it can hurt: each bonk has a warning at least half a second earlier', () => {
  const late = [], unwarned = [];
  for (const [r, { smart, idle }] of runAll()) {
    for (const events of [smart.events, idle.events]) {
      const warned = {};
      for (const e of events) {
        if (e.t === 'warn') warned[e.id] = e.at;
        if (e.t === 'bonk') {
          if (warned[e.src] == null) unwarned.push(`${r.dis} t${r.tier} i${r.island}: ${e.kind} #${e.src}`);
          else if (e.at - warned[e.src] < 0.55) late.push(`${r.dis} t${r.tier} i${r.island}: ${(e.at - warned[e.src]).toFixed(2)} s`);
        }
      }
    }
  }
  assert.deepEqual(unwarned, [], 'a bonk without a warning');
  assert.deepEqual(late, [], 'a warning too late to react');
  // Meteors, coconuts and lightning: the shadow or column shows for the whole tier lead time.
  for (const tier of [1, 5]) {
    const w = CI.create(CI.plan(0, tier, 5, { rounds: [{ a: 'meteors' }] }), { humans: 1, seed: 5 });
    while (w.phase !== 'live') CI.step(w, DT, [CI.NONE]);
    for (let i = 0; i < 300; i++) CI.step(w, DT, [CI.NONE]);
    const drops = w.haz.filter(h => h.k === 'drop');
    assert.ok(drops.length > 0);
    for (const h of drops) assert.ok(h.impact - h.born >= CI.TUNE.lead[tier - 1] - 1e-9 && CI.TUNE.lead[tier - 1] >= 1);
  }
});

test('a child who follows the counter-move survives every disaster on every island at tiers 1 and 5', () => {
  const fails = [];
  for (const [r, { smart }] of runAll()) {
    if (smart.me.ghost || smart.me.survived !== 1) fails.push(`${r.dis} t${r.tier} i${r.island} (seed ${r.seed})`);
  }
  assert.deepEqual(fails, []);
});

test('an idle child is bonked by most disasters, and they get no stars for doing nothing', () => {
  for (const tier of [1, 5]) {
    const hit = new Set();
    for (const [r, { idle }] of runAll()) if (r.tier === tier && idle.events.some(e => e.t === 'bonk' && e.who === 0)) hit.add(r.dis);
    assert.ok(hit.size >= (tier === 1 ? 7 : 8), `tier ${tier}: only ${[...hit]} bonked an idle child`);
  }
  // Whole matches: the scripted child gets three stars on every island at both ends of the
  // difficulty scale, and an idle child none.
  for (const tier of [1, 5]) for (let island = 0; island < CI.ISLAND_COUNT; island++) {
    const seed = 900 + island * 11 + tier;
    const plan = CI.plan(island, tier, seed);
    const smart = play(CI.create(plan, { humans: 1, seed }), 'smart', seed).me;
    const idle = play(CI.create(plan, { humans: 1, seed }), 'idle', seed).me;
    assert.equal(CI.stars(smart.survived, plan.rounds.length), 3, `island ${island + 1} tier ${tier}: ${plain(plan.rounds).map(x => x.a).join(',')}`);
    assert.equal(CI.stars(idle.survived, plan.rounds.length), 0, `island ${island + 1} tier ${tier}: idle survived ${idle.survived}`);
    assert.ok(smart.coins >= 2 * plan.rounds.length, 'every round survived pays coins');
  }
});

test('the scripted child also gets through most two-disaster rounds of the top tiers', () => {
  let ok = 0, n = 0;
  for (const [a, b] of CI.COMBOS) for (const island of [0, 3]) {
    const seed = 40 + island + a.length;
    n++;
    if (play(CI.create(CI.plan(island, 5, seed, { rounds: [{ a, b }] }), { humans: 1, seed }), 'smart', seed).me.survived) ok++;
  }
  assert.ok(ok >= n - 1, `${ok} of ${n}`);
});

test('computer islanders follow the same rules: they survive some rounds and mess up others', () => {
  let survived = 0, total = 0;
  for (const dis of CI.DIS) for (const tier of [1, 5]) {
    const seed = 7 + tier + dis.length;
    const w = CI.create(CI.plan(1, tier, seed, { rounds: [{ a: dis }] }), { humans: 1, seed });
    play(w, 'smart', seed);
    w.actors.slice(1).forEach(a => { total++; survived += a.survived; });
  }
  assert.ok(survived / total > 0.45 && survived / total < 0.97, `computer islanders survived ${survived}/${total}`);
});

test('match plans: rounds per tier, a gentle start, each island\'s new disasters, no repeats in a row', () => {
  for (let island = 0; island < CI.ISLAND_COUNT; island++) for (let tier = 1; tier <= 5; tier++) for (let seed = 1; seed <= 12; seed++) {
    const plan = CI.plan(island, tier, seed), r = plan.rounds;
    assert.equal(r.length, CI.TUNE.rounds[tier - 1]);
    assert.equal(plan.bots, CI.TUNE.bots[tier - 1]);
    if (island === 0) assert.ok(['flood', 'meteors'].includes(r[0].a), 'the very first round is the jelly or the meteors');
    else assert.ok(CI.POOLS[island - 1].includes(r[0].a), 'each island starts with a disaster the child knows');
    assert.equal(r[0].b, null);
    for (const d of CI.NEW[island]) if (r.length >= 1 + CI.NEW[island].length) assert.ok(r.some(x => x.a === d), `island ${island + 1} introduces ${d}`);
    for (let i = 0; i < r.length; i++) {
      assert.ok(CI.POOLS[island].includes(r[i].a));
      if (i) assert.notEqual(r[i].a, r[i - 1].a);
      if (r[i].b) {
        assert.ok(tier >= 4 && i >= r.length - CI.TUNE.combos[tier - 1], 'combos only late in the top tiers');
        assert.ok(CI.POOLS[island].includes(r[i].b));
        assert.ok(CI.COMBOS.some(c => (c[0] === r[i].a && c[1] === r[i].b) || (c[1] === r[i].a && c[0] === r[i].b)));
      }
    }
  }
  assert.deepEqual(plain(CI.plan(2, 3, 77)), plain(CI.plan(2, 3, 77)), 'a seed always gives the same match');
});

test('a round replays exactly from its seed', () => {
  const one = play(CI.create(CI.plan(2, 4, 31), { humans: 1, seed: 31 }), 'smart', 31).me;
  const two = play(CI.create(CI.plan(2, 4, 31), { humans: 1, seed: 31 }), 'smart', 31).me;
  assert.deepEqual([one.x, one.y, one.coins, one.survived], [two.x, two.y, two.coins, two.survived]);
});

test('hearts, the little ghost, the splash, and the next round', () => {
  // An idle child in the jelly loses its hearts, floats as a ghost, and is back next round.
  const w = CI.create(CI.plan(0, 5, 9, { rounds: [{ a: 'flood' }, { a: 'meteors' }] }), { humans: 1, seed: 9 });
  const a = w.actors[0];
  let ghostAt = -1, events = [];
  while (w.round === 0 && w.phase !== 'done') { CI.step(w, DT, [CI.NONE]); events.push(...w.ev); w.ev.length = 0; if (a.ghost && ghostAt < 0) ghostAt = w.t; }
  assert.ok(ghostAt > 0, 'three bonks make a ghost');
  assert.equal(events.filter(e => e.t === 'bonk' && e.who === 0).length, 3);
  assert.deepEqual(plain(a.results), [false]);
  assert.equal(a.ghost, false, 'back for the next round');
  assert.equal(a.hearts, 3);
  // The sea: blown in by a gust it costs a heart, and the child is back on the beach.
  const s = CI.create(CI.plan(0, 5, 4, { rounds: [{ a: 'wind' }] }), { humans: 1, seed: 4 });
  while (s.phase !== 'live') CI.step(s, DT, [CI.NONE]);
  const b = s.actors[0];
  let splash = null;
  for (let i = 0; i < 60 * 30 && !splash; i++) {
    CI.step(s, DT, [s.wind.dir > 0 ? { r: 1 } : s.wind.dir < 0 ? { l: 1 } : CI.NONE]);
    splash = s.ev.find(e => e.t === 'splash' && e.who === 0); s.ev.length = 0;
  }
  assert.ok(splash, 'walking with the gust ends in the sea');
  assert.equal(b.hearts, 2);
  assert.ok(b.x > CI.EDGE_L && b.x < CI.EDGE_R && b.y < CI.GROUND, 'back over the beach');
});

test('coins appear during a round, are picked up by touching them, and surviving pays two more', () => {
  const w = CI.create(CI.plan(0, 1, 12, { rounds: [{ a: 'meteors' }], bots: 0 }), { humans: 1, seed: 12 });
  w.actors[0].inv = 99; // out of the meteors' way for this check
  while (w.phase !== 'live') CI.step(w, DT, [CI.NONE]);
  let spawned = 0;
  for (let i = 0; i < 60 * 8; i++) { CI.step(w, DT, [CI.NONE]); spawned += w.ev.filter(e => e.t === 'coinSpawn').length; w.ev.length = 0; }
  assert.ok(spawned >= 1 && w.coins.length >= 1);
  const c = w.coins[0], a = w.actors[0];
  a.x = c.x; a.y = c.plat.y; a.ground = c.plat; a.vx = a.vy = 0; a.inv = 99;
  CI.step(w, DT, [CI.NONE]);
  assert.ok(w.ev.some(e => e.t === 'coin' && e.who === 0));
  assert.ok(a.coins >= 1);
  let clear = null, picked = 0;
  while (w.phase === 'live') {
    const before = a.coins;
    CI.step(w, DT, [CI.NONE]);
    for (const e of w.ev) { if (e.t === 'clear') clear = e; if (e.t === 'coin' && e.who === 0) picked += e.v; }
    w.ev.length = 0;
    if (clear) { assert.equal(a.coins - before - picked, 2, 'two coins for surviving the round'); break; }
    picked = 0;
  }
  assert.ok(clear && clear.survivors.includes(0));
});

test('stars, outcomes and round ids', () => {
  assert.equal(CI.stars(0, 5), 0); assert.equal(CI.stars(2, 5), 0); assert.equal(CI.stars(3, 5), 1);
  assert.equal(CI.stars(4, 5), 2); assert.equal(CI.stars(5, 5), 3);
  assert.equal(CI.stars(1, 3), 0); assert.equal(CI.stars(2, 3), 1); assert.equal(CI.stars(3, 3), 3);
  assert.equal(CI.stars(1, 0), 0);
  for (let i = 0; i < 4; i++) assert.match(CI.roundId(i), ID);
  assert.deepEqual([0, 1, 2, 3].map(i => CI.roundId(i)), ['i1', 'i2', 'i3', 'i4']);
  assert.equal(CI.roundId(2, true), 'duo');
  assert.equal(CI.roundId(99), 'i4');
});

test('saves: a fresh one, junk and the old version load as a fresh playable save; fields are checked', () => {
  const fresh = plain(CI.freshSave());
  assert.equal(fresh.v, 2);
  for (const junk of [null, undefined, 7, 'x', [], [1, 2], { v: 1 }, { v: 3, coins: 9 },
    { v: 1, coins: 40, hat: 'cap', hats: ['cap'], color: '#ffd23f', colors: [], outfit: 'plain', islands: ['beach'], book: {}, streak: 0, settings: { bots: 6 } }]) {
    assert.deepEqual(plain(CI.loadSave(junk)), fresh, JSON.stringify(junk));
  }
  const ok = plain(CI.loadSave({ v: 2, coins: 55, stars: [3, 1, 0, 0], best: [12, 4, 0, 0], duo: 9, owned: ['c0', 'h0', 'x0', 'h2', 'c3', 'h2', 'zz', 7], color: 'c3', hat: 'h2', extra: 'x0', island: 2, tut: true }));
  assert.deepEqual(ok, { v: 2, coins: 55, stars: [3, 1, 0, 0], best: [12, 4, 0, 0], duo: 9, owned: ['c0', 'h0', 'x0', 'h2', 'c3'], color: 'c3', hat: 'h2', extra: 'x0', island: 2, tut: true });
  const bad = plain(CI.loadSave({ v: 2, coins: -4, stars: [9, 'x', 2.5, null], best: 'no', duo: 1e9, owned: 'all', color: 'c5', hat: 'x1', extra: 'h1', island: 3, tut: 'yes' }));
  assert.deepEqual(bad, fresh, 'every bad field falls back (and a locked island is not selected)');
  assert.equal(CI.loadSave({ v: 2, stars: [0, 0, 0, 0], island: 1 }).island, 0, 'a locked island is not selected');
  assert.equal(CI.loadSave({ v: 2, stars: [1, 0, 0, 0], island: 1 }).island, 1);
  // Islands open one by one with a star on the island before.
  const s = CI.freshSave();
  assert.deepEqual([0, 1, 2, 3].map(i => CI.isOpen(s, i)), [true, false, false, false]);
  s.stars[0] = 1; s.stars[1] = 2;
  assert.deepEqual([0, 1, 2, 3].map(i => CI.isOpen(s, i)), [true, true, true, false]);
  // Every wardrobe item has a kind, a price and a picture to draw; the starters are free.
  for (const it of CI.ITEMS) assert.ok(['color', 'hat', 'extra'].includes(it.kind) && it.price >= 0 && it.id);
  assert.deepEqual(plain(CI.ITEMS.filter(it => it.price === 0).map(it => it.id)), ['c0', 'h0', 'x0']);
  assert.deepEqual(plain(CI.look(CI.loadSave(ok))), { color: '#5be38f', hat: 'cap', extra: '' });
});
