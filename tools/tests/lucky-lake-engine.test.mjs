import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const context = vm.createContext({});
vm.runInContext(readFileSync(path.join(repo, 'games/lucky-lake/engine.js'), 'utf8'), context, { filename: 'engine.js' });
const LL = context.LuckyLake;

function opened(spot, extra) {
  const save = Object.assign(LL.blankSave(), extra);
  save.spots = [1, 1, 1, 1, 1, 1, 1];
  save.spot = spot;
  return save;
}

function make(opts) {
  return LL.createGame(Object.assign({ seed: 1, day: 20261025, players: 1 }, opts));
}

function inputFor(i, down, pressed) {
  if (i === 0) return { down: !!down, pressed: !!pressed };
  return { p2down: !!down, p2pressed: !!pressed };
}

function releaseSweet(g, i = 0) {
  g.step(1 / 60, inputFor(i, true, false));
  for (let n = 0; n < 200; n++) {
    const a = g.state.anglers[i];
    if (a.phase !== 'ready' && a.phase !== 'charge') return a;
    const sweet = a.power >= LL.SWEET[0] && a.power <= LL.SWEET[1];
    g.step(1 / 60, inputFor(i, !(sweet || a.chargeT > 1.05), false));
  }
  return g.state.anglers[i];
}

function until(g, pred, seconds = 12, i = 0) {
  const events = [];
  for (let n = 0; n < seconds * 60 && !pred(g.state.anglers[i], g.state); n++) {
    const a = g.state.anglers[i];
    const reel = a.phase === 'reel' && a.fish && a.fish.y > a.zoneY;
    events.push(...g.step(1 / 60, inputFor(i, reel, a.phase === 'bite')));
  }
  return events;
}

test('the same seed plays the same lake', () => {
  const run = () => {
    const g = make({ save: LL.blankSave(), seed: 42 });
    const ev = [];
    for (let i = 0; i < 240; i++) ev.push(...g.step(1 / 60, { down: i % 50 < 30, pressed: i % 37 === 0 }));
    return JSON.stringify({
      phase: g.state.anglers[0].phase, coins: g.state.save.coins, book: g.state.save.book,
      events: ev.map(e => e.t + (e.i || 0))
    });
  };
  assert.equal(run(), run());
});

test('a held cast climbs and a sweet release is a perfect throw', () => {
  const g = make({ save: LL.blankSave(), seed: 3 });
  g.step(1 / 60, { down: true });
  assert.equal(g.state.anglers[0].phase, 'charge');
  const powers = [];
  for (let i = 0; i < 70; i++) {
    g.step(1 / 60, { down: true });
    powers.push(g.state.anglers[0].power);
    const expect = 0.5 - 0.5 * Math.cos(g.state.anglers[0].chargeT * 2.7);
    assert.ok(Math.abs(powers[i] - expect) < 1e-9);
  }
  assert.ok(Math.max(...powers) > 0.9 && Math.min(...powers) < 0.05, 'the meter travels almost the whole bar');
  const cast = make({ save: LL.blankSave(), seed: 3 });
  const sweet = releaseSweet(cast);
  assert.equal(sweet.perfect, 1);
  assert.equal(sweet.phase === 'flight' || sweet.phase === 'wait', true);
  assert.ok(cast.state.save.perfects >= 1);
});

test('a nibble is a fake dip, and the real bite is a short hook window', () => {
  const scare = make({ save: LL.blankSave(), seed: 5 });
  releaseSweet(scare);
  let dipped = false;
  for (let i = 0; i < 500 && !['scared', 'bite', 'reel'].includes(scare.state.anglers[0].phase); i++) {
    const a = scare.state.anglers[0];
    const ev = scare.step(1 / 60, { pressed: a.phase === 'wait' && a.dip > 0 });
    if (ev.some(e => e.t === 'nibble')) dipped = true;
  }
  assert.equal(dipped, true);
  assert.equal(scare.state.anglers[0].phase, 'scared');
  assert.equal(scare.state.save.bait[0], 0, 'a scare does not spend bait that was never equipped');

  const hooked = make({ save: LL.blankSave(), seed: 5 });
  releaseSweet(hooked);
  const bite = until(hooked, a => a.phase === 'bite' || a.phase === 'reel', 8);
  assert.ok(bite.some(e => e.t === 'bite'));
  if (hooked.state.anglers[0].phase === 'bite') hooked.step(1 / 60, { pressed: true });
  assert.equal(hooked.state.anglers[0].phase, 'reel');

  const missed = make({ save: LL.blankSave(), seed: 5 });
  releaseSweet(missed);
  for (let i = 0; i < 500 && missed.state.anglers[0].phase !== 'miss'; i++) missed.step(1 / 60, {});
  assert.equal(missed.state.anglers[0].phase, 'miss');
  assert.equal(missed.state.save.coins, 0);
});

test('a patient first pond catch is a gentle common in well under half a minute', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const g = make({ save: LL.blankSave(), seed });
    const started = g.state.t;
    releaseSweet(g);
    const ev = until(g, a => a.phase === 'reveal', 25);
    const fish = g.state.anglers[0].fish;
    assert.ok(fish, 'seed ' + seed + ' reached the card');
    assert.ok(fish.id === 0 || fish.id === 1, 'first pond fish is بلطي or شبّوط');
    assert.ok(ev.some(e => e.t === 'catch'));
    assert.ok(g.state.t - started < 25, 'seed ' + seed + ' took ' + g.state.t);
  }
});

test('the starter rod lands common fish and still lands most legendaries', () => {
  const tally = (id, n) => {
    let caught = 0;
    for (let seed = 1; seed <= n; seed++) {
      const g = make({ save: opened(Math.floor(id / 7)), seed, spot: Math.floor(id / 7) });
      g.hookTest(0, id);
      const ev = until(g, a => a.phase !== 'reel', 20);
      if (ev.some(e => e.t === 'catch')) caught++;
    }
    return caught;
  };
  assert.equal(tally(0, 24) + tally(2, 24), 48, 'common and uncommon fish stay in the green');
  const legends = tally(6, 24);
  assert.ok(legends >= 15, 'legendary catches ' + legends + '/24');
  const idle = make({ save: opened(0), seed: 2, spot: 0 });
  idle.hookTest(0, 6);
  for (let i = 0; i < 20 * 60 && idle.state.anglers[0].phase === 'reel'; i++) idle.step(1 / 60, {});
  assert.equal(idle.state.anglers[0].phase, 'miss');
});

test('a boss can be reeled, and only after that spot is complete', () => {
  const early = make({ save: opened(0, { caught: 6, play: 540 }), seed: 1, spot: 0 });
  let finished = 0;
  for (let n = 0; n < 40 && finished < 12; n++) {
    if (early.state.anglers[0].phase === 'ready') releaseSweet(early);
    until(early, a => a.phase === 'reveal' || a.phase === 'ready' || a.phase === 'miss' || a.phase === 'scared', 8);
    if (early.state.anglers[0].phase !== 'reveal') continue;
    assert.equal(early.state.anglers[0].fish.boss, 0);
    early.resolve(0, 'sell');
    finished++;
  }
  assert.ok(finished >= 8, 'finished ' + finished);
  const save = opened(0, { caught: 6, play: 540 });
  for (let id = 0; id < 7; id++) save.book[id] = 1;
  const late = make({ save, seed: 2, spot: 0 });
  let boss = null;
  for (let n = 0; n < 50 && !boss; n++) {
    releaseSweet(late);
    until(late, a => a.phase === 'reveal' || a.phase === 'ready', 8);
    const fish = late.state.anglers[0].fish;
    if (fish && fish.boss) boss = fish;
    else if (fish) late.resolve(0, 'sell');
  }
  assert.ok(boss, 'the pond boss appears once the seven pond fish are in the book');
  const fight = make({ save: opened(0), seed: 4, spot: 0 });
  fight.hookTest(0, 53);
  const ev = until(fight, a => a.phase !== 'reel', 20);
  assert.ok(ev.some(e => e.t === 'catch'));
});

test('selling, releasing, rainbow and the fish of the day change the purse', () => {
  assert.equal(LL.priceOf({ id: 0, rb: 1, day: 0, glow: 0, stolen: 0 }), 60);
  assert.equal(LL.priceOf({ id: 0, rb: 0, day: 1, glow: 0, stolen: 0 }), 36);
  assert.equal(LL.priceOf({ id: 0, rb: 1, day: 1, glow: 1, stolen: 0 }), 270);
  assert.equal(LL.priceOf({ id: 52, rb: 0, day: 0, glow: 0, stolen: 0 }), 110);
  assert.equal(LL.priceOf({ id: 49, rb: 0, day: 0, glow: 0, stolen: 1 }), 0);

  const g = make({ save: opened(0), seed: 1, spot: 0 });
  g.hookTest(0, 0);
  until(g, a => a.phase === 'reveal', 12);
  const sold = g.resolve(0, 'sell');
  assert.equal(sold.ok, 1);
  assert.ok(g.state.save.coins >= sold.price);
  assert.ok(g.state.save.book[0] > 0);
  assert.equal(g.state.save.spots[1], 1, 'the first fish opens the pier quest');

  const free = make({ save: opened(0), seed: 2, spot: 0 });
  free.hookTest(0, 1);
  until(free, a => a.phase === 'reveal', 12);
  const letGo = free.resolve(0, 'release');
  assert.equal(letGo.choice, 'release');
  assert.equal(free.state.save.kindness, 1);
  assert.equal(free.state.save.book[1] > 0, true);
});

test('bait is spent when the bite starts, junk can carry a hint or a chest, and the gull can steal a boot', () => {
  const save = LL.blankSave();
  save.bait = [2, 0, 0, 0, 0];
  save.baitOn = 0;
  const g = make({ save, seed: 7 });
  releaseSweet(g);
  until(g, a => a.phase === 'bite' || a.phase === 'reel' || a.phase === 'scared', 8);
  assert.ok(g.state.save.bait[0] < 2);

  const scare = make({ save: Object.assign(LL.blankSave(), { bait: [2, 0, 0, 0, 0], baitOn: 0 }), seed: 7 });
  releaseSweet(scare);
  for (let i = 0; i < 500 && scare.state.anglers[0].phase !== 'scared'; i++) {
    const a = scare.state.anglers[0];
    scare.step(1 / 60, { pressed: a.phase === 'wait' && a.dip > 0 });
  }
  assert.equal(scare.state.anglers[0].phase, 'scared');
  assert.equal(scare.state.save.bait[0], 2);

  const junk = make({ save: opened(1, { caught: 4, play: 10 }), seed: 1, spot: 1 });
  let odd = null;
  for (let n = 0; n < 80 && !odd; n++) {
    releaseSweet(junk);
    until(junk, a => a.phase === 'reveal' || a.phase === 'ready', 10);
    const fish = junk.state.anglers[0].fish;
    if (fish && fish.junk) odd = fish;
    else if (fish) junk.resolve(0, 'sell');
  }
  assert.ok(odd, 'junk shows up beside the fish');

  const bottle = make({ save: opened(0), seed: 1, spot: 0 });
  bottle.hookTest(0, 51);
  until(bottle, a => a.phase === 'reveal', 8);
  const note = bottle.resolve(0, 'sell');
  assert.ok(LL.HINTS.includes(note.hint));

  const chest = make({ save: opened(0), seed: 1, spot: 0 });
  chest.hookTest(0, 52);
  until(chest, a => a.phase === 'reveal', 8);
  const coins = chest.state.save.coins;
  const paid = chest.resolve(0, 'sell');
  assert.equal(paid.price, 110);
  assert.equal(chest.state.save.coins, coins + 110);

  let stolen = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const boot = make({ save: opened(0), seed, spot: 0 });
    boot.hookTest(0, 49);
    until(boot, a => a.phase === 'reveal', 8);
    if (boot.resolve(0, 'sell').stolen) stolen++;
  }
  assert.ok(stolen > 0 && stolen < 40);
});

test('keepers fill 24 tanks, a reload restores the card, and a mid-cast reload does not', () => {
  const save = opened(0);
  for (let i = 0; i < 24; i++) save.aqua.push({ id: i % 7, w: 1, rb: 0 });
  const full = make({ save, seed: 1, spot: 0 });
  full.hookTest(0, 3);
  until(full, a => a.phase === 'reveal', 8);
  const denied = full.resolve(0, 'keep');
  assert.equal(denied.full, 1);
  assert.equal(full.state.anglers[0].phase, 'reveal');
  assert.equal(full.resolve(0, 'sell').ok, 1);

  const card = make({ save: opened(0), seed: 9, spot: 0 });
  card.hookTest(0, 4);
  until(card, a => a.phase === 'reveal', 8);
  const id = card.state.anglers[0].fish.id;
  const again = make({ save: card.exportSave(), seed: 1, spot: 0 });
  assert.equal(again.state.anglers[0].phase, 'reveal');
  assert.equal(again.state.anglers[0].fish.id, id);
  assert.equal(again.state.save.book[id] > 0, false, 'the book updates when the card is resolved');

  const cast = make({ save: LL.blankSave(), seed: 1 });
  cast.step(1 / 60, { down: true });
  cast.step(1 / 60, { down: true });
  assert.equal(cast.state.anglers[0].phase, 'charge');
  const reloaded = make({ save: cast.exportSave(), seed: 1 });
  assert.equal(reloaded.state.anglers[0].phase, 'ready');
});

test('a damaged save becomes a playable blank lake and keeps the fields that are real', () => {
  const wild = {
    coins: 12.9, kindness: -4, rod: 9, rods: [0, 1], bait: [3, -1, 4], baitOn: 2,
    aqua: Array.from({ length: 30 }, (_, i) => ({ id: i % 10, w: 1.26, rb: i === 1 })),
    quests: [{ k: 'nope', n: 1 }, { k: 'catch', n: 4, have: 2, reward: 11, spot: 3 }],
    book: { 0: 5 }, spots: [0, 1], pending: { id: 2, w: 1.5, rb: 1 }
  };
  const s = LL.normalize(wild);
  assert.equal(s.coins, 12);
  assert.equal(s.kindness, 0);
  assert.equal(s.rods[0], 1);
  assert.equal(s.rod, 0);
  assert.equal(s.aqua.length, 24);
  assert.equal(s.quests.length, 3);
  assert.equal(s.quests[0].k, 'catch');
  assert.equal(s.pending.id, 2);
  assert.equal(s.hat, 0);
  assert.equal(LL.normalize({ hat: 1, coins: 3 }).hat, 1);
  assert.equal(LL.normalize(s).coins, s.coins);
  assert.equal(LL.normalize('nope').coins, 0);
  const g = make({ save: s, seed: 1 });
  assert.equal(g.state.anglers[0].phase, 'reveal');
});

test('ice keeps more reel speed than the pond, and the derby is two reels on one clock', () => {
  const kick = spot => {
    const g = make({ save: opened(spot), seed: 1, spot });
    g.hookTest(0, spot * 7);
    for (let i = 0; i < 12; i++) g.step(1 / 60, { down: true });
    const before = g.state.anglers[0].zoneV;
    g.step(1 / 60, { down: false });
    return g.state.anglers[0].zoneV / before;
  };
  assert.ok(kick(3) > kick(0) + 0.05);

  const derby = make({ save: LL.blankSave(), players: 2, seconds: 30, seed: 3, forceSpot: 1, spot: 1 });
  assert.equal(derby.state.spot, 1);
  derby.hookTest(0, 0);
  derby.hookTest(1, 8);
  for (let i = 0; i < 20; i++) derby.step(1 / 60, { down: true, p2down: false });
  assert.notEqual(derby.state.anglers[0].zoneY, derby.state.anglers[1].zoneY);
  const finish = make({ save: LL.blankSave(), players: 2, seconds: 30, seed: 3, forceSpot: 1, spot: 1 });
  finish.state.anglers[0].weight = 4;
  finish.state.anglers[1].weight = 4;
  finish.state.anglers[0].best = 1;
  finish.state.anglers[1].best = 2.5;
  finish.state.left = 0.02;
  let end = [];
  for (let i = 0; i < 5; i++) end.push(...finish.step(1 / 60, {}));
  const result = end.find(e => e.t === 'derby');
  assert.equal(result.result, 'draw');
  assert.equal(finish.state.crown, 1);
  assert.equal(finish.state.over, 1);
  assert.equal(finish.step(1 / 60, { down: true }).length, 0);

  const win = make({ save: LL.blankSave(), players: 2, seconds: 1, seed: 1, forceSpot: 1, spot: 1 });
  win.state.anglers[0].weight = 3;
  win.state.anglers[1].weight = 1;
  win.state.left = 0.01;
  const events = win.step(1 / 60, {});
  assert.equal(events.find(e => e.t === 'derby').result, 'end');
  assert.equal(win.state.winner, 0);
});

test('a banked derby fish is the biggest catch, and the crown follows that fish', () => {
  const g = make({ save: LL.blankSave(), players: 2, seconds: 90, seed: 2, forceSpot: 1, spot: 1 });
  assert.equal(g.hookTest(0, 0), 1);
  const first = until(g, a => a.weight > 0, 20, 0);
  assert.ok(first.some(e => e.t === 'banked' && e.i === 0));
  const light = g.state.anglers[0];
  assert.ok(light.best > 0 && light.best < 4);
  assert.equal(light.best, light.weight);

  assert.equal(g.hookTest(1, 6), 1);
  const second = until(g, a => a.weight > 0, 25, 1);
  assert.ok(second.some(e => e.t === 'banked' && e.i === 1));
  const heavy = g.state.anglers[1];
  assert.ok(heavy.best >= 8);
  assert.ok(heavy.best > light.best);
  light.weight = Math.round((heavy.weight + 5) * 10) / 10;
  g.state.left = 0.02;
  const end = [];
  for (let i = 0; i < 5; i++) end.push(...g.step(1 / 60, {}));
  assert.equal(end.some(e => e.t === 'derby'), true);
  assert.equal(g.state.winner, 0);
  assert.equal(g.state.crown, 1);
  assert.equal(g.state.anglers[1].best, heavy.best);

  const late = make({ save: LL.blankSave(), players: 2, seconds: 90, seed: 4, forceSpot: 1, spot: 1 });
  assert.equal(late.hookTest(1, 6), 1);
  until(late, a => a.phase === 'show', 20, 1);
  assert.equal(late.state.anglers[1].phase, 'show');
  assert.equal(late.state.anglers[1].best, 0);
  const held = late.state.anglers[1].fish.w;
  late.state.left = 0.01;
  late.step(1 / 60, {});
  assert.equal(late.state.over, 1);
  assert.equal(late.state.anglers[1].best, held);
  assert.equal(late.state.anglers[1].weight, held);
  assert.equal(late.state.crown, 1);
  assert.equal(late.state.winner, 1);
});

test('visible odds add up, and a moon night favors the sky legendary', () => {
  const odds = LL.odds({ luck: 0.2, spot: 6, day: 5, event: 'rainbow' });
  const sum = odds.rare.reduce((total, row) => total + row.pct, 0);
  assert.ok(Math.abs(sum - 100) < 1.5, sum);
  assert.equal(odds.rainbow, 10);
  assert.equal(odds.glow, 0);
  const moon = LL.odds({ luck: 0, spot: 6, day: 5 });
  const plain = LL.odds({ luck: 0, spot: 6, day: 1 });
  assert.ok(moon.rare[4].pct > plain.rare[4].pct * 2);
  assert.equal(LL.moonBoost(5), true);
  assert.equal(LL.dayIndex(20261025), LL.dayIndex(20261025));
});
