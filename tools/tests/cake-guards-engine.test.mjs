import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function load() {
  const context = vm.createContext({});
  for (const file of ['data.js', 'engine.js']) vm.runInContext(readFileSync(path.join(repo, 'games/cake-guards', file), 'utf8'), context, { filename: file });
  return context.CG;
}
const CG = load();
// A one-road test level: straight along row 3, nothing spawns unless a test asks for it.
const flat = (extra = {}) => ({ w: 0, coins: 1000, hp: 1, towers: CG.TOWER_ORDER.slice(), roads: [[[-1, 3], [14, 3]]], waves: ['g1'], ...extra });
const run = (world, seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) CG.step(world, 1 / 60); };
const blob = (world, type, d) => {
  world.phase = 'wave';
  const before = world.enemies.length;
  world.queue = [{ type, n: 1, gap: 0 }];
  CG.step(world, 1 / 600);
  const b = world.enemies[before];
  b.d = d; CG.pointAt(world.roads[b.road], d, b);
  return b;
};

test('every level has its own fixed build pads beside, never on, its roads', () => {
  for (const [i, def] of CG.LEVELS.entries()) {
    const pads = CG.padsFor(def), again = CG.padsFor(def), roads = def.roads.map(CG.makeRoad);
    assert.deepEqual(pads, again, `level ${i + 1}: the same pads every time`);
    assert.ok(pads.length >= 8, `level ${i + 1}: ${pads.length} pads`);
    for (const p of pads) {
      assert.ok(CG.roadDist(roads, p.x, p.y) >= CG.ROAD + CG.PAD, `level ${i + 1}: pad ${p.x},${p.y} clear of the road`);
      assert.ok(p.y - CG.PAD >= CG.TOP && p.y + CG.PAD <= CG.BAR, `level ${i + 1}: pad between the HUD and the tower bar`);
      for (const q of pads) if (q !== p) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= CG.PAD * 2, `level ${i + 1}: pads apart`);
    }
    for (const w of def.waves) assert.doesNotThrow(() => CG.parseWave(w), `level ${i + 1}: wave ${w}`);
    assert.ok(def.towers.every(t => CG.TOWERS[t]), `level ${i + 1}: known towers`);
    const ends = roads.map(r => r.pts[r.pts.length - 1]);
    assert.ok(ends.every(e => e.x === ends[0].x && e.y === ends[0].y), `level ${i + 1}: every road ends at the cake`);
  }
});

test('waves parse into groups, and a malformed wave is refused', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(CG.parseWave('g8/0.6 c2'))), [{ type: 'g', n: 8, gap: 0.6 }, { type: 'c', n: 2, gap: 0.9 }]);
  assert.throws(() => CG.parseWave('q3'), /bad wave group/);
  assert.throws(() => CG.parseWave('g'), /bad wave group/);
  for (let k = 1; k <= 60; k++) assert.doesNotThrow(() => CG.parseWave(CG.endlessWave(k)), 'endless wave ' + k);
  assert.match(CG.endlessWave(10), /\bk1\b/);
  assert.match(CG.endlessWave(20), /\bb1\b/);
});

test('building, upgrading and selling move coins exactly, and only where allowed', () => {
  const world = CG.create(flat({ coins: 200, towers: ['pop', 'bubble'] }));
  assert.equal(CG.build(world, 0, 'cake'), false, 'a tower the level does not offer');
  assert.equal(CG.build(world, 0, 'pop'), true);
  assert.equal(world.coins, 150);
  assert.equal(CG.build(world, 0, 'bubble'), false, 'a pad holds one tower');
  assert.equal(CG.upgradeCost(world, 0), 60);
  assert.equal(CG.upgrade(world, 0), true);
  assert.equal(world.coins, 90);
  assert.equal(CG.upgradeCost(world, 0), 110);
  assert.equal(CG.upgrade(world, 0), false, 'not enough coins');
  assert.equal(CG.sellValue(world, 0), Math.floor(110 * CG.SELL));
  assert.equal(CG.sell(world, 0), true);
  assert.equal(world.coins, 90 + 77);
  assert.equal(world.pads[0].tower, null);
  const poor = CG.create(flat({ coins: 40 }));
  assert.equal(CG.build(poor, 0, 'pop'), false);
  assert.equal(poor.coins, 40);
});

test('armour softens every hit but the candy cane, which goes straight through', () => {
  const world = CG.create(flat());
  const a = blob(world, 'a', 300);
  world.pads.forEach(p => { p.tower = null; });
  const pad = world.pads.findIndex(p => Math.hypot(p.x - a.x, p.y - a.y) < 130);
  CG.build(world, pad, 'pop');
  const tw = world.pads[pad].tower;
  tw.cd = 0;
  const hp = a.hp;
  for (let i = 0; i < 60 && a.hp === hp; i++) { a.d = 300; CG.step(world, 1 / 60); }
  assert.equal(hp - a.hp, 1, 'popcorn (2) against armour 3 still does the minimum 1');
  CG.sell(world, pad); CG.build(world, pad, 'cane');
  world.pads[pad].tower.cd = 0;
  const before = a.hp;
  a.d = 300; CG.step(world, 1 / 60);
  assert.equal(before - a.hp, CG.TOWERS.cane.lv[0].dmg, 'the cane ignores armour');
});

test('a splitter pops into two little blobs, and the splash that popped it spares them', () => {
  const world = CG.create(flat());
  const s = blob(world, 's', 400);
  s.hp = 1;
  world.shots.push({ kind: 'cake', x: s.x, y: s.y, sx: s.x, sy: s.y, tx: s.x, ty: s.y, t: 0, T: 0.01, dmg: 50, splash: 80 });
  CG.step(world, 1 / 60);
  const kids = world.enemies.filter(e => e.type === 'm');
  assert.equal(kids.length, 2);
  assert.ok(kids.every(k => k.hp === k.max), 'the children start whole');
  assert.ok(world.ev.some(e => e.t === 'pop' && e.type === 's'));
});

test('a bubble slows every blob around the one it hits, and a boss only half as much', () => {
  const world = CG.create(flat());
  const a = blob(world, 'g', 300), b = blob(world, 'g', 330), far = blob(world, 'g', 600), boss = blob(world, 'k', 310);
  world.shots.push({ kind: 'bubble', x: a.x, y: a.y, target: a.id, tx: a.x, ty: a.y, speed: 400, dmg: 1, slow: 0.5, slowT: 2, area: 45 });
  CG.step(world, 1 / 60);
  assert.equal(a.slow, 0.5);
  assert.equal(b.slow, 0.5);
  assert.equal(far.slow, 0, 'out of the burst');
  assert.equal(boss.slow, 0.25);
  const d = a.d;
  run(world, 1);
  assert.ok(a.d - d < CG.ENEMIES.g.speed * 0.6, 'a slowed blob moves at half speed');
});

test('blobs that reach the cake take bites; the last bite loses once and stops the world', () => {
  const world = CG.create(flat({ waves: ['g30/0.1'] }));
  world.pads.forEach(p => { p.tower = null; });
  CG.callWave(world);
  run(world, 120);
  assert.equal(world.phase, 'lost');
  assert.equal(world.hearts, 0);
  assert.equal(world.ev.filter(e => e.t === 'lose').length, 1);
  const time = world.time;
  run(world, 5);
  assert.equal(world.time, time, 'nothing moves after the loss');
});

test('clearing the last wave wins with stars for the cake that is left', () => {
  const world = CG.create(flat({ waves: ['g2', 'g2'] }));
  CG.build(world, 0, 'cane'); CG.build(world, 1, 'cane'); CG.build(world, 2, 'pop');
  CG.callWave(world);
  run(world, 60);
  assert.equal(world.phase, 'won');
  const win = world.ev.find(e => e.t === 'win');
  assert.equal(win.stars, 3);
  assert.equal(world.ev.filter(e => e.t === 'clear').length, 1, 'only the first wave pays a clear bonus and a break');
  for (const [hearts, stars] of [[20, 3], [18, 3], [17, 2], [10, 2], [9, 1], [1, 1]]) assert.equal(CG.stars({ hearts }), stars, hearts + ' slices');
});

test('calling the next wave early pays for the seconds skipped', () => {
  const world = CG.create(flat({ waves: ['g1', 'g1'] }));
  CG.build(world, 0, 'cane');
  CG.callWave(world);
  for (let i = 0; i < 6000 && world.phase !== 'break'; i++) CG.step(world, 1 / 60);
  assert.equal(world.phase, 'break');
  const coins = world.coins, left = world.breakT;
  assert.equal(CG.callWave(world), true);
  assert.equal(world.coins, coins + Math.ceil(left) * 2);
  assert.equal(world.wave, 2);
  assert.equal(CG.callWave(world), false, 'not while a wave is spawning');
});

test('endless keeps sending tougher waves and never runs out', () => {
  const world = CG.create(CG.ENDLESS);
  assert.equal(world.total, Infinity);
  CG.callWave(world);
  const first = world.queue.length;
  assert.ok(first > 0);
  assert.ok(CG.endlessHp(20) > CG.endlessHp(10) && CG.endlessHp(10) > CG.endlessHp(1));
});

test('the same moves give the same game', () => {
  const play = () => {
    const world = CG.create(CG.LEVELS[5]);
    [0, 3, 5, 8].forEach((pad, i) => CG.build(world, pad, ['pop', 'bubble', 'cake', 'pop'][i]));
    CG.callWave(world);
    run(world, 40);
    return JSON.stringify({ coins: world.coins, hearts: world.hearts, wave: world.wave, e: world.enemies.map(e => [e.type, e.hp, Math.round(e.d)]) });
  };
  assert.equal(play(), play());
});
