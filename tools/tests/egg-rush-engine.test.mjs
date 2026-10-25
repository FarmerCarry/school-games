import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function load() {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(path.join(repo, 'games/egg-rush/engine.js'), 'utf8'), context, { filename: 'engine.js' });
  return context.EggRush;
}
const ER = load();
const step = (w, input, n = 1) => {
  for (let i = 0; i < n; i++) {
    w.now = (w.now || 0) + 1000 / 60;
    ER.step(w, 1 / 60, input || {}, w.now);
  }
};
const kinds = w => w.ev.map(e => e.t);

test('a straight run to the close meadow egg banks on at least 80% of trips', () => {
  const w = ER.create({ tutorial: false, seed: 1, now: 1000 });
  let ok = 0;
  for (let trip = 0; trip < 20; trip++) {
    const p = w.players[0];
    for (let i = 0; i < 500 && !w.nests[0].egg; i++) step(w, {});
    const banks = w.banks;
    let grabbed = false;
    for (let i = 0; i < 360; i++) {
      const nest = w.nests[0];
      const dx = nest.x - p.x, dy = nest.y - p.y, d = Math.hypot(dx, dy) || 1;
      const near = d < 0.85;
      step(w, { x: near && p.egg ? 0 : dx / d, y: near && p.egg ? 0 : dy / d, grab: near && !p.egg });
      if (p.egg) { grabbed = true; break; }
    }
    if (!grabbed) continue;
    for (let i = 0; i < 420; i++) {
      const dx = 6 - p.x, dy = 8 - p.y, d = Math.hypot(dx, dy) || 1;
      step(w, { x: dx / d, y: dy / d });
      if (w.banks > banks) break;
    }
    if (w.banks > banks) ok++;
  }
  assert.ok(ok >= 16, 'banked ' + ok + '/20');
});

test('a chase is always telegraphed by at least 0.6s of stirring', () => {
  const w = ER.create({ tutorial: false, seed: 1, now: 0 });
  const hen = w.guards[0];
  hen.stir = 0.1; hen.state = 'sleep'; hen.timer = 0.01;
  step(w, {}, 1);
  assert.equal(hen.state, 'stir');
  assert.ok(hen.timer >= 0.59, 'stir timer ' + hen.timer);
  let stirred = 0;
  for (let i = 0; i < 120 && hen.state === 'stir'; i++) { step(w, {}); stirred += 1 / 60; }
  assert.ok(stirred >= 0.59, 'stirred ' + stirred);
  assert.notEqual(hen.state, 'chase');
});

test('a player outside the vision cone is not chased', () => {
  const w = ER.create({ tutorial: false, seed: 2, now: 0 });
  const hen = w.guards[0];
  hen.state = 'watch'; hen.timer = 0.4; hen.ang = 0; hen.x = 20; hen.y = 8;
  w.players[0].x = 16; w.players[0].y = 8;
  step(w, {}, 40);
  assert.notEqual(hen.state, 'chase');
  assert.equal(kinds(w).includes('spot'), false);
});

test('a boop sends the egg back and changes nothing the player owns', () => {
  const w = ER.create({ tutorial: false, seed: 1, now: 0 });
  w.coins = 25; w.speedXP = 12;
  w.pets.push({ b: 0, s: 0, v: 0, pad: 0, rate: 4 });
  const p = w.players[0];
  p.x = 20; p.y = 8;
  p.egg = { nest: 0, biome: 0, species: 1, rarity: 1, daily: false };
  const hen = w.guards[0];
  hen.x = 20.4; hen.y = 8; hen.state = 'chase'; hen.air = false; hen.target = 0;
  step(w, {});
  assert.equal(p.egg, null);
  assert.equal(w.coins, 25);
  assert.equal(w.pets.length, 1);
  assert.equal(w.speedXP, 12);
  assert.ok(kinds(w).includes('boop'));
  hen.state = 'chase'; hen.timer = 0; hen.x = p.x + 3; p.egg = null;
  step(w, {}, 150);
  assert.equal(hen.state, 'return');
});

test('speed, weight and the beach gate', () => {
  assert.equal(ER.speedOf(0), 4);
  assert.ok(ER.speedOf(40) > 6);
  assert.equal(ER.maxOpen(0), 0);
  assert.equal(ER.maxOpen(40), 1);
  const slow = ER.create({ tutorial: false, seed: 1, now: 0 });
  const p = slow.players[0];
  p.x = 34.5; p.y = 8;
  step(slow, { x: 1 }, 40);
  assert.ok(p.x < ER.BASE + ER.BW - 0.15, 'blocked at ' + p.x);
  const fast = ER.create({ tutorial: false, seed: 1, now: 0 });
  fast.speedXP = 40;
  fast.players[0].x = 34.5; fast.players[0].y = 8;
  step(fast, { x: 1 }, 50);
  assert.ok(fast.players[0].x > ER.BASE + ER.BW, 'crossed at ' + fast.players[0].x);
  const heavy = ER.create({ tutorial: false, seed: 1, now: 0 });
  heavy.players[0].x = 20; heavy.players[0].y = 8;
  heavy.players[0].egg = { nest: -1, biome: 5, species: 5, rarity: 5, daily: false };
  step(heavy, { x: 1 }, 60);
  assert.ok(heavy.players[0].vx < ER.speedOf(0) * 0.8, 'burdened speed ' + heavy.players[0].vx);
});

test('shoes, a save round-trip, a corrupt save and away earnings capped at 30 minutes', () => {
  const w = ER.create({ tutorial: false, seed: 3, now: 5000 });
  w.coins = 40;
  assert.equal(ER.buy(w, 'shoes'), true);
  assert.equal(w.shoes, 1);
  assert.ok(ER.speedOf(w.speedXP) > 6);
  w.pets.push({ b: 0, s: 0, v: 0, pad: 0, rate: 4 });
  w.incs[0] = { b: 0, s: 1, v: 0, end: w.now + 4000, nest: -1, daily: false, force: 0 };
  const raw = ER.exportSave(w);
  assert.equal(ER.readSave(raw), true);
  const again = ER.create({ save: raw, now: 5000, tutorial: false });
  assert.equal(again.coins, w.coins);
  assert.equal(again.shoes, 1);
  assert.ok(again.incs[0]);
  const mid = ER.create({ save: raw, now: raw.awayAt + 2000, tutorial: false });
  assert.ok(mid.incs[0], 'a hatch in progress is still in the incubator');
  step(mid, {}, 180);
  assert.equal(mid.pets.filter(p => p.s === 1).length, 1);
  const bad = ER.create({ save: { v: 0 }, now: 1 });
  assert.match(bad.notice, /تعذّر قراءة الحفظ/);
  assert.equal(bad.coins, 0);
  assert.equal(ER.readSave(null), null);
  assert.equal(ER.readSave('nope'), false);
  raw.awayAt = 0;
  raw.coins = 0;
  const halfHour = ER.awayCoins(raw, 30 * 60 * 1000);
  const twoHours = ER.awayCoins(raw, 2 * 60 * 60 * 1000);
  assert.equal(twoHours, halfHour);
  assert.equal(twoHours, Math.floor(4 * 1800));
  const back = ER.create({ save: raw, now: 2 * 60 * 60 * 1000, tutorial: false });
  assert.equal(back.away, twoHours);
  assert.match(back.notice, /أثناء غيابك/);
});

test('rebirth keeps the index and a finished biome pays 10%', () => {
  const seen = Array(42).fill(0);
  for (let s = 0; s < 6; s++) seen[s] = 1;
  assert.ok(Math.abs(ER.coinMult(0, seen) - 1.1) < 1e-9);
  const w = ER.create({ tutorial: false, seed: 1, now: 0 });
  w.seen = seen.slice();
  w.speedXP = 100000;
  w.coins = 80;
  w.pets.push({ b: 0, s: 0, v: 0, pad: 0, rate: 4 });
  assert.equal(ER.buy(w, 'rebirth'), true);
  assert.equal(w.rebirths, 1);
  assert.equal(w.pets.length, 0);
  assert.equal(w.coins, 0);
  assert.equal(w.speedXP, 0);
  assert.equal(w.seen[0], 1);
  assert.ok(Math.abs(ER.coinMult(w.rebirths, w.seen) - 1.5 * 1.1) < 1e-9);
});

test('the scripted lesson stirs, then chases, and a boop takes nothing', () => {
  const w = ER.create({ seed: 1, now: 1000 });
  w.banks = 1;
  const hen = w.guards[0];
  hen.x = 18.55; hen.y = 8; hen.state = 'sleep'; hen.timer = 3;
  const p = w.players[0];
  p.x = 17.6; p.y = 8;
  const coins = w.coins;
  step(w, { grab: true });
  assert.equal(hen.state, 'stir');
  assert.equal(hen.script, true);
  assert.ok(hen.timer >= 0.55);
  let t = 1 / 60;
  while (hen.state !== 'chase' && t < 2) { step(w); t += 1 / 60; }
  assert.ok(t >= 0.59 && t < 1.3, 'chase after ' + t);
  assert.equal(w.taught, true);
  assert.equal(w.coins, coins);
});

test('a full incubator warns once, and a peel slips a chaser', () => {
  const w = ER.create({ tutorial: false, seed: 1, now: 0 });
  w.incs[0] = { b: 0, s: 0, v: 0, end: 1e12, nest: -1, daily: false, force: 0 };
  const p = w.players[0];
  p.x = 5; p.y = 8;
  p.egg = { nest: -1, biome: 0, species: 0, rarity: 0, daily: false };
  step(w, {});
  step(w, {});
  assert.equal(kinds(w).filter(t => t === 'full').length, 1);
  assert.ok(p.egg);
  w.ev.length = 0;
  w.gadgets = ['banana'];
  const hen = w.guards[0];
  hen.state = 'sleep'; hen.x = 40; hen.y = 8;
  step(w, { gadget: true });
  assert.equal(w.gadgets.length, 0);
  const peel = w.items.find(it => it.kind === 'peel');
  assert.ok(peel);
  hen.x = peel.x; hen.y = peel.y; hen.state = 'chase';
  step(w, {});
  assert.equal(hen.state, 'slip');
});

test('two players move, a dash drops an egg, and the match ends in a draw or a win', () => {
  const w = ER.create({ mode: '2p', seed: 1, now: 0 });
  const a = w.players[0], b = w.players[1];
  const ax = a.x, bx = b.x;
  step(w, { x: 1, p2: { x: -1 } }, 20);
  assert.ok(a.x > ax + 0.4);
  assert.ok(b.x < bx - 0.4);
  b.x = 20; b.y = 8; b.egg = { nest: 0, biome: 0, species: 0, rarity: 0, daily: false }; b.immune = 0;
  a.x = 19.2; a.y = 8; a.dashT = 0.16; a.dvx = 15; a.dvy = 0;
  step(w, {});
  assert.equal(b.egg, null);
  assert.ok(kinds(w).includes('bump'));
  const tied = ER.create({ mode: '2p', seed: 1, now: 0 });
  tied.matchT = 0.02;
  step(tied, {}, 3);
  assert.equal(tied.over, true);
  assert.equal(tied.winner, -1);
  const win = ER.create({ mode: '2p', seed: 1, now: 0 });
  win.players[0].coins = 30;
  win.matchT = 0.02;
  step(win, {}, 3);
  assert.equal(win.winner, 0);
  assert.ok(kinds(win).includes('match'));
});

test('the night fox borrows a pet and the den gives it back', () => {
  const w = ER.create({ tutorial: false, seed: 1, now: 0 });
  w.pets.push({ b: 0, s: 0, v: 0, pad: 0, rate: 4 });
  w.foxT = 239.5;
  step(w, {}, 40);
  assert.ok(w.fox);
  w.fox.x = 0.4;
  step(w, {});
  assert.ok(w.stolen);
  assert.equal(w.pets.length, 0);
  const den = ER.denPos(w);
  w.players[0].x = den.x; w.players[0].y = den.y;
  step(w, {});
  assert.equal(w.stolen, null);
  assert.equal(w.pets.length, 1);
});
