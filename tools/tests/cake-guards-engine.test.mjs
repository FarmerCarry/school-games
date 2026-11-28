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
const flat = (extra = {}) => ({ w: 0, coins: 1000, hp: 1, starter: false, towers: CG.TOWER_ORDER.slice(), roads: [[[-1, 3], [14, 3]]], waves: ['g1'], ...extra });
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

test('every level has fixed build pads clear of roads, 3 turrets, and auto-places 1 free starter turret', () => {
  assert.equal(CG.LEVELS.length, 12);
  assert.deepEqual([...CG.TOWER_ORDER], ['pop', 'bubble', 'cake']);
  for (const [i, def] of CG.LEVELS.entries()) {
    const pads = CG.padsFor(def), again = CG.padsFor(def), roads = def.roads.map(CG.makeRoad);
    assert.deepEqual(pads, again);
    assert.ok(pads.length >= 8, `level ${i + 1}: ${pads.length} pads`);
    for (const p of pads) {
      assert.ok(CG.roadDist(roads, p.x, p.y) >= CG.ROAD + CG.PAD);
      assert.ok(p.y - CG.PAD >= CG.TOP && p.y + CG.PAD <= CG.BAR);
      for (const q of pads) if (q !== p) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= CG.PAD * 2);
    }
    for (const w of def.waves) assert.doesNotThrow(() => CG.parseWave(w));
    const world = CG.create(def);
    assert.equal(world.phase, 'intro');
    assert.equal(world.breakT, CG.INTRO);
    assert.equal(world.pads.filter(p => p.tower).length, 1, '1 free starter turret placed immediately');
    assert.equal(world.coins, def.coins, 'starter turret costs 0 coins');
  }
});

test('Wave 1 spawns automatically after 0.8s without pressing Start Wave', () => {
  const world = CG.create(CG.LEVELS[0]);
  assert.equal(world.wave, 0);
  run(world, 0.5);
  assert.equal(world.wave, 0, 'still in 0.8s intro');
  run(world, 0.5);
  assert.equal(world.phase, 'wave');
  assert.equal(world.wave, 1);
  assert.ok(world.enemies.length >= 1, 'jelly blobs already marching');
});

test('Active Frosting Blaster pops & knocks back jelly blobs, and Space auto-targets the leading blob', () => {
  const world = CG.create(flat({ waves: ['c1'] }));
  const b = blob(world, 'c', 420);
  const hp0 = b.hp, d0 = b.d;
  // Auto-blast (null coords = Space keyboard auto-target leading blob)
  assert.equal(CG.blast(world), true);
  assert.equal(world.blasts, 1);
  assert.equal(CG.blast(world), false, 'respects blaster cooldown');
  run(world, 0.6);
  assert.ok(b.hp < hp0, 'frosting glob damaged blob');
  assert.ok(b.d < d0 + CG.ENEMIES.c.speed * 0.6 - 10, 'frosting glob knocked blob back along the road');
  assert.ok(world.ev.some(e => e.t === 'splat'));
});

test('1-click quickAct builds on best glowing pad and auto-upgrades once all pads are full', () => {
  const world = CG.create(flat({ coins: 5000 }));
  const best0 = CG.bestPad(world);
  const r1 = CG.quickAct(world, 'pop');
  assert.equal(r1.ok, true); assert.equal(r1.kind, 'build'); assert.equal(r1.pad, best0);
  assert.equal(world.pads[best0].tower.type, 'pop');
  // Fill every remaining pad
  while (CG.bestPad(world) >= 0) assert.equal(CG.quickAct(world, 'bubble').kind, 'build');
  const rUp = CG.quickAct(world, 'pop');
  assert.equal(rUp.ok, true); assert.equal(rUp.kind, 'upgrade'); assert.equal(rUp.pad, best0);
  assert.equal(world.pads[best0].tower.lv, 1);
});

test('building, upgrading, selling, armor piercing cupcake splash, splitters, and bubble slow', () => {
  const world = CG.create(flat({ coins: 200 }));
  assert.equal(CG.build(world, 0, 'pop'), true);
  assert.equal(world.coins, 150);
  assert.equal(CG.upgrade(world, 0), true);
  assert.equal(world.coins, 90);
  assert.equal(CG.sell(world, 0), true);
  assert.equal(world.coins, 90 + Math.floor(110 * CG.SELL));

  // Cupcake splash pierces armor & splits splitters without hitting children
  const w2 = CG.create(flat());
  const arm = blob(w2, 'a', 360), spl = blob(w2, 's', 380);
  spl.hp = 1;
  const armHp = arm.hp;
  w2.shots.push({ kind: 'cake', x: arm.x, y: arm.y, sx: arm.x, sy: arm.y, tx: arm.x, ty: arm.y, t: 0, T: 0.01, dmg: 10, splash: 80, pierce: true });
  CG.step(w2, 1 / 60);
  assert.equal(armHp - arm.hp, 10, 'cupcake pierces armor');
  assert.equal(w2.enemies.filter(e => e.type === 'm').length, 2, 'splitter spawns 2 intact mini blobs');

  // Bubble slow
  const w3 = CG.create(flat());
  const g1 = blob(w3, 'g', 300), boss = blob(w3, 'k', 310);
  w3.shots.push({ kind: 'bubble', x: g1.x, y: g1.y, target: g1.id, tx: g1.x, ty: g1.y, speed: 400, dmg: 1, slow: 0.5, slowT: 2, area: 45 });
  CG.step(w3, 1 / 60);
  assert.equal(g1.slow, 0.5); assert.equal(boss.slow, 0.25);
});

test('leaks lose once, clearing last wave wins with stars, endless scales, and sim is deterministic', () => {
  const wLose = CG.create(flat({ waves: ['g30/0.1'] }));
  run(wLose, 60);
  assert.equal(wLose.phase, 'lost'); assert.equal(wLose.hearts, 0);

  const wWin = CG.create(flat({ waves: ['g2/0.3', 'g2/0.3'] }));
  CG.build(wWin, 0, 'cake'); CG.build(wWin, 1, 'pop');
  run(wWin, 40);
  assert.equal(wWin.phase, 'won');
  assert.equal(wWin.ev.find(e => e.t === 'win').stars, 3);

  assert.ok(CG.endlessHp(20) > CG.endlessHp(10) && CG.endlessHp(10) > CG.endlessHp(1));
  for (let k = 1; k <= 30; k++) assert.doesNotThrow(() => CG.parseWave(CG.endlessWave(k)));

  const play = () => {
    const w = CG.create(CG.LEVELS[2]);
    CG.quickAct(w, 'pop'); CG.quickAct(w, 'bubble');
    run(w, 20);
    return JSON.stringify({ c: w.coins, h: w.hearts, w: w.wave, e: w.enemies.map(e => [e.type, e.hp, Math.round(e.d)]) });
  };
  assert.equal(play(), play());
});
