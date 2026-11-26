// Recess Kitchen 3D engine (games/recess-kitchen/engine.js): pure deterministic unit tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/recess-kitchen/engine.js');
const E = require(enginePath);

test('engine.js stays pure: no DOM, Kit, or Math.random usage', () => {
  const src = fs.readFileSync(enginePath, 'utf8');
  assert.doesNotMatch(src, /\bMath\.random\s*\(/, 'engine must use seeded PRNG, never Math.random');
  assert.doesNotMatch(src, /\bKit\s*\./, 'engine must never reference Kit');
  assert.doesNotMatch(src, /\bdocument\s*\./, 'engine must never reference document');
});

test('all 9 canteen levels + Endless Rush have valid grids, required stations, and BFS-reachable stations', () => {
  const allLevels = [...E.LEVELS, E.ENDLESS_LEVEL];
  assert.equal(E.LEVELS.length, 9, '9 handcrafted levels across 3 canteens');

  for (const lv of allLevels) {
    assert.equal(lv.grid.length, E.ROWS, `${lv.id}: row count`);
    for (let r = 0; r < E.ROWS; r++) {
      assert.equal(lv.grid[r].length, E.COLS, `${lv.id}: row ${r} col count`);
    }
    const st = E.create({ level: lv.index >= 0 ? lv.index : 0, endless: lv.index < 0, duo: true, seed: 77 });
    // Verify spawns are on walkable floor
    for (const ch of st.chefs) {
      const c = Math.floor(ch.x), r = Math.floor(ch.y);
      assert.equal(st.grid[r][c], null, `${lv.id}: chef ${ch.id} spawns on walkable tile`);
    }
    // BFS from each chef spawn over walkable tiles
    for (const ch of st.chefs) {
      const sc = Math.floor(ch.x), sr = Math.floor(ch.y);
      const vis = new Set([`${sc},${sr}`]);
      const q = [[sc, sr]];
      while (q.length) {
        const [cx, cy] = q.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= E.COLS || ny < 0 || ny >= E.ROWS) continue;
          const key = `${nx},${ny}`;
          if (!vis.has(key) && st.grid[ny][nx] === null) {
            vis.add(key);
            q.push([nx, ny]);
          }
        }
      }
      // Every recipe's needed station kinds must exist AND be adjacent to a reachable floor tile
      for (const recId of lv.recipes) {
        const rec = E.RECIPES[recId];
        assert.ok(rec, `${lv.id}: valid recipe ${recId}`);
        for (const needKind of rec.needs) {
          const matching = st.stations.filter(s => s.kind === needKind);
          assert.ok(matching.length > 0, `${lv.id}: has station ${needKind} for ${recId}`);
          const reachable = matching.some(s =>
            [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => vis.has(`${s.c + dx},${s.r + dy}`))
          );
          assert.ok(reachable, `${lv.id}: chef ${ch.id} can reach ${needKind}`);
        }
      }
    }
  }
});

test('1-1 allows holding right cleanly from spawn without immediate obstacle', () => {
  const st = E.create({ level: 0, duo: false, seed: 101 });
  const x0 = st.chefs[0].x;
  for (let i = 0; i < 20; i++) E.step(st, 1 / 60, [{ mx: 1, my: 0 }]);
  assert.ok(st.chefs[0].x > x0 + 1.2, `expected chef to move right cleanly (${x0} -> ${st.chefs[0].x})`);
  assert.equal(st.atStart, false);
});

test('determinism: identical seed and inputs produce identical simulation states', () => {
  const runOnce = () => {
    const s = E.create({ level: 7, duo: true, seed: 9999 });
    for (let f = 0; f < 180; f++) {
      const i1 = { mx: Math.sin(f * 0.08), my: Math.cos(f * 0.06), interact: f % 25 === 0, dash: f === 40 };
      const i2 = { mx: -Math.cos(f * 0.07), my: Math.sin(f * 0.09), interact: f % 30 === 5, dash: f === 80 };
      E.step(s, 1 / 60, [i1, i2]);
    }
    return E.publicState(s, 'play');
  };
  assert.deepEqual(runOnce(), runOnce());
});

// Helper: walk chef directly adjacent to a station and face it, then interact
function faceAndInteract(st, chefIdx, station) {
  const chef = st.chefs[chefIdx];
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const [dx, dy] of dirs) {
    const nc = station.c + dx, nr = station.r + dy;
    if (nc >= 0 && nc < E.COLS && nr >= 0 && nr < E.ROWS && st.grid[nr][nc] === null) {
      chef.x = nc + 0.5;
      chef.y = nr + 0.5;
      chef.fx = -dx;
      chef.fy = -dy;
      break;
    }
  }
  return E.step(st, 1 / 60, chefIdx === 0 ? [{ interact: true }] : [{}, { interact: true }]);
}

test('full cooking pipelines for all 6 recipes: burger, cheeseburger, salad, fries, pizza, juice', () => {
  const st = E.create({ level: 7, duo: false, seed: 555 }); // level 3-2 has all stations & recipes
  const find = kind => st.stations.find(s => s.kind === kind);

  // Force exact order queue for deterministic end-to-end verification
  const makeOrder = (id, recipe) => ({ id, recipe, patience: 45, maxPatience: 45, age: 0, urgent: false });
  st.orders = [
    makeOrder(101, 'burger'),
    makeOrder(102, 'cheeseburger'),
    makeOrder(103, 'salad'),
    makeOrder(104, 'fries')
  ];

  // 1) BURGER: patty -> stove -> cook -> grab -> combine at bun crate -> serve
  faceAndInteract(st, 0, find('crate_patty'));
  assert.equal(st.chefs[0].holding.kind, 'patty');
  faceAndInteract(st, 0, find('stove'));
  assert.equal(st.chefs[0].holding, null);
  for (let i = 0; i < 180; i++) E.step(st, 1 / 60, [{}]);
  assert.equal(find('stove').item.kind, 'cooked_patty');
  faceAndInteract(st, 0, find('stove'));
  assert.equal(st.chefs[0].holding.kind, 'cooked_patty');
  faceAndInteract(st, 0, find('crate_bun'));
  assert.equal(E.getDishId(st.chefs[0].holding), 'burger');
  let evs = faceAndInteract(st, 0, find('serve'));
  assert.ok(evs.some(e => e.type === 'serve' && e.dish === 'burger'));
  assert.equal(st.served, 1);

  // 2) CHEESEBURGER using plate scooping: plate -> bun -> cheese -> cooked_patty -> serve
  faceAndInteract(st, 0, find('crate_patty'));
  faceAndInteract(st, 0, find('stove'));
  faceAndInteract(st, 0, find('plates'));
  assert.equal(st.chefs[0].holding.kind, 'plate');
  faceAndInteract(st, 0, find('crate_bun'));
  faceAndInteract(st, 0, find('crate_cheese'));
  for (let i = 0; i < 180; i++) E.step(st, 1 / 60, [{}]);
  faceAndInteract(st, 0, find('stove'));
  assert.equal(E.getDishId(st.chefs[0].holding), 'cheeseburger');
  evs = faceAndInteract(st, 0, find('serve'));
  assert.ok(evs.some(e => e.type === 'serve' && e.dish === 'cheeseburger'));
  assert.equal(st.combo, 2);

  // 3) SALAD with turbo-chop boost: lettuce -> chop -> counter; tomato -> chop -> combine -> serve
  const chop = find('chop');
  const counter = st.stations.find(s => s.kind === 'counter' && [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) =>
    s.c + dx >= 0 && s.c + dx < E.COLS && s.r + dy >= 0 && s.r + dy < E.ROWS && !st.grid[s.r + dy][s.c + dx]
  ));
  faceAndInteract(st, 0, find('crate_lettuce'));
  faceAndInteract(st, 0, chop);
  // Turbo-chop 3 taps finishes immediately!
  faceAndInteract(st, 0, chop);
  faceAndInteract(st, 0, chop);
  faceAndInteract(st, 0, chop);
  assert.equal(chop.item.kind, 'chopped_lettuce');
  faceAndInteract(st, 0, chop);
  faceAndInteract(st, 0, counter);
  faceAndInteract(st, 0, find('crate_tomato'));
  faceAndInteract(st, 0, chop);
  for (let i = 0; i < 90; i++) E.step(st, 1 / 60, [{}]);
  assert.equal(chop.item.kind, 'chopped_tomato');
  faceAndInteract(st, 0, chop);
  faceAndInteract(st, 0, counter); // combines right into chef hands!
  assert.equal(E.getDishId(st.chefs[0].holding), 'salad');
  evs = faceAndInteract(st, 0, find('serve'));
  assert.ok(evs.some(e => e.type === 'serve' && e.dish === 'salad'));

  // 4) FRIES: potato -> chop -> stove -> fries -> serve
  faceAndInteract(st, 0, find('crate_potato'));
  faceAndInteract(st, 0, chop);
  for (let i = 0; i < 100; i++) E.step(st, 1 / 60, [{}]);
  assert.equal(chop.item.kind, 'chopped_potato');
  faceAndInteract(st, 0, chop);
  faceAndInteract(st, 0, find('stove'));
  for (let i = 0; i < 190; i++) E.step(st, 1 / 60, [{}]);
  assert.equal(find('stove').item.kind, 'fries');
  faceAndInteract(st, 0, find('stove'));
  evs = faceAndInteract(st, 0, find('serve'));
  assert.ok(evs.some(e => e.type === 'serve' && e.dish === 'fries'));

  // 5) PIZZA & 6) JUICE
  st.orders = [makeOrder(105, 'pizza'), makeOrder(106, 'juice')];
  faceAndInteract(st, 0, find('crate_dough'));
  faceAndInteract(st, 0, find('stove'));
  for (let i = 0; i < 200; i++) E.step(st, 1 / 60, [{}]);
  faceAndInteract(st, 0, find('stove'));
  assert.equal(E.getDishId(st.chefs[0].holding), 'pizza');
  evs = faceAndInteract(st, 0, find('serve'));
  assert.ok(evs.some(e => e.type === 'serve' && e.dish === 'pizza'));

  faceAndInteract(st, 0, find('crate_fruit'));
  faceAndInteract(st, 0, find('juicer'));
  for (let i = 0; i < 120; i++) E.step(st, 1 / 60, [{}]);
  faceAndInteract(st, 0, find('juicer'));
  assert.equal(E.getDishId(st.chefs[0].holding), 'juice');
  evs = faceAndInteract(st, 0, find('serve'));
  assert.ok(evs.some(e => e.type === 'serve' && e.dish === 'juice'));
  assert.equal(st.served, 6);
  assert.equal(st.maxCombo, 6);
});

test('forgiving burn grace warns before burning, trash disposes burnt food, wrong dish keeps item safe', () => {
  const st = E.create({ level: 0, duo: false, seed: 303 });
  const stove = st.stations.find(s => s.kind === 'stove');
  const trash = st.stations.find(s => s.kind === 'trash');
  const serve = st.stations.find(s => s.kind === 'serve');

  // Place patty and cook it
  faceAndInteract(st, 0, st.stations.find(s => s.kind === 'crate_patty'));
  faceAndInteract(st, 0, stove);
  let sawWarn = false, sawBurnt = false;
  for (let i = 0; i < 900; i++) {
    const evs = E.step(st, 1 / 60, [{}]);
    if (evs.some(e => e.type === 'burnWarn')) sawWarn = true;
    if (evs.some(e => e.type === 'burnt')) { sawBurnt = true; break; }
  }
  assert.ok(sawWarn, 'burn warning fires before burning');
  assert.ok(sawBurnt, 'eventually burns if left uncollected');
  assert.equal(stove.item.kind, 'burnt');
  assert.equal(st.burnt, 1);

  // Pick up burnt item and toss in trash
  faceAndInteract(st, 0, stove);
  assert.equal(st.chefs[0].holding.kind, 'burnt');
  const trashEvs = faceAndInteract(st, 0, trash);
  assert.ok(trashEvs.some(e => e.type === 'trash'));
  assert.equal(st.chefs[0].holding, null);

  // Wrong dish on serve keeps dish safely in hands
  st.orders = [{ id: 1, recipe: 'pizza', patience: 40, maxPatience: 40, age: 0, urgent: false }];
  st.chefs[0].holding = { kind: 'plate', parts: ['bun', 'cooked_patty'] };
  const wrongEvs = faceAndInteract(st, 0, serve);
  assert.ok(wrongEvs.some(e => e.type === 'wrongDish'));
  assert.equal(E.getDishId(st.chefs[0].holding), 'burger', 'wrong dish stays in hands');
});

test('Endless Rush grants +10s bonus time on serve and round ends cleanly at timeLeft <= 0', () => {
  const st = E.create({ endless: true, duo: false, seed: 42 });
  st.timeLeft = 20;
  st.orders = [{ id: 1, recipe: 'juice', patience: 30, maxPatience: 30, age: 0, urgent: false }];
  st.chefs[0].holding = { kind: 'juice' };
  faceAndInteract(st, 0, st.stations.find(s => s.kind === 'serve'));
  assert.ok(st.timeLeft > 29 && st.timeLeft <= 30.1, 'serving in Endless adds +10s');

  st.timeLeft = 0.05;
  let endEv = null;
  for (let i = 0; i < 10; i++) {
    const evs = E.step(st, 1 / 60, [{}]);
    endEv = evs.find(e => e.type === 'roundEnd') || endEv;
  }
  assert.ok(st.over && endEv && endEv.result.served === 1);
});

test('save loader ignores old v2 saves cleanly and validates v3 saves', () => {
  const oldV2 = { v: 2, coins: 999, lv: [{ s: 3, best: 500 }] };
  const migrated = E.loadSave(oldV2);
  assert.equal(migrated.v, E.SAVE_VERSION);
  assert.equal(migrated.coins, 0, 'old v2 save resets cleanly');
  assert.equal(E.isLevelUnlocked(migrated, 0), true);
  assert.equal(E.isLevelUnlocked(migrated, 1), false);

  migrated.levels[0].stars = 2;
  migrated.coins = 120;
  migrated.aprons.push(1);
  migrated.apron = 1;
  const reloaded = E.loadSave(JSON.parse(JSON.stringify(migrated)));
  assert.equal(reloaded.coins, 120);
  assert.equal(reloaded.apron, 1);
  assert.equal(E.isLevelUnlocked(reloaded, 1), true);
  assert.equal(E.nextPlayableLevel(reloaded), 1);
});

test('the first level is won by serving one burger, with at most two orders waiting, in a longer round', () => {
  const first = E.LEVELS[0];
  assert.ok(first.stars[0] <= E.RECIPES.burger.points, 'one burger reaches the first star');
  assert.equal(first.maxOrders, 2);
  assert.ok(first.duration >= 120);
});
