// Recess Kitchen engine (games/recess-kitchen/engine.js): pure simulation tests covering
// all 4 worlds / 12 levels, ingredient crates, auto-chopping, forgiving fryer/grill/blender
// lifecycles, plate assembly, order matching, conveyor belts, 1P bridge vs 2P divider,
// slippery ice physics, VIP orders, click-to-walk BFS, DDA scaling, saves/shop, and full
// order completion across all 12 levels in Node without a browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/recess-kitchen/engine.js');
const engineSource = fs.readFileSync(enginePath, 'utf8');

const sandbox = { window: {} };
vm.runInNewContext(engineSource, sandbox);
const RK = sandbox.window.RK;

const require = createRequire(import.meta.url);
const RKCommon = require(enginePath);

const DT = 1 / 60;
const ARABIC = /^[\u0600-\u06FF\s]+$/;
const plain = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const eq = (a, b, msg) => assert.deepEqual(plain(a), plain(b), msg);

function step(w, inputs = {}, n = 1) {
  const ev = [];
  for (let i = 0; i < n; i++) {
    w.ev.length = 0;
    RK.step(w, DT, inputs);
    ev.push(...w.ev);
    if (w.done) break;
  }
  return ev;
}

// Walks chef `ci` via clickAt to station `st` and interacts once there (up to `maxSec` seconds).
function walkAct(w, ci, st, maxSec = 14) {
  if (w.done) return [];
  const ok = RK.clickAt(w, ci, st.x, st.y);
  assert.ok(ok, `clickAt failed on level ${w.R.id} toward (${st.c},${st.r}) ${st.type}`);
  const ev = [];
  for (let n = 0; n < maxSec * 60; n++) {
    w.ev.length = 0;
    RK.step(w, DT, []);
    ev.push(...w.ev);
    if (!w.chefs[ci].nav || w.done) break;
  }
  return ev;
}

function findSt(w, pred) {
  return w.stations.find(pred);
}

test('engine is pure UMD: loads in browser sandbox & CommonJS, zero DOM/Kit/timers/random/console', () => {
  assert.ok(RK && RK.create && RK.step && RK.interact, 'loads on window.RK');
  assert.ok(RKCommon && RKCommon.LEVELS.length === 12, 'exports via module.exports');
  const stripped = engineSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(
    stripped,
    /\bKit\b|\bdocument\b|\blocalStorage\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|\bconsole\./
  );
  assert.doesNotMatch(engineSource, /^\s*import\s[\w{*]/m);
});

test('4 worlds x 3 levels = 12 handcrafted levels, valid Arabic names, 65-85s rounds, Chef 1 clear to move right', () => {
  assert.equal(RK.WORLDS.length, 4);
  assert.equal(RK.LEVELS.length, 12);
  RK.WORLDS.forEach(wd => {
    assert.match(wd.name, ARABIC);
    assert.match(wd.color, /^#[0-9a-f]{6}$/i);
  });
  Object.values(RK.DISHES).forEach(d => assert.match(d.name, ARABIC));
  RK.APRONS.forEach(a => assert.match(a.name, ARABIC));
  RK.HATS.forEach(h => assert.match(h.name, ARABIC));

  const ids = new Set();
  RK.LEVELS.forEach((R, i) => {
    assert.equal(R.id, `${Math.floor(i / 3) + 1}-${(i % 3) + 1}`);
    ids.add(R.id);
    assert.equal(R.world, Math.floor(i / 3));
    assert.match(R.name, ARABIC, R.id);
    assert.ok(R.duration >= 65 && R.duration <= 85, `${R.id} duration ${R.duration}`);
    assert.equal(R.map.length, RK.ROWS, `${R.id} rows`);
    R.map.forEach(row => assert.equal(row.length, RK.COLS, `${R.id} cols`));
    assert.ok(R.goals[0] < R.goals[1] && R.goals[1] < R.goals[2], `${R.id} goals`);

    // Chef 1 stays completely stationary with zero input, and moves right on frame 1 with mx=1.
    const w = RK.create(i, { players: 1, seed: 42 });
    const sx = w.chefs[0].x, sy = w.chefs[0].y;
    step(w, {}, 30);
    assert.equal(w.chefs[0].x, sx, `${R.id} chef stays still when idle`);
    assert.equal(w.chefs[0].y, sy);
    assert.equal(w.chefs[0].moved, false);

    step(w, { mx: 1, my: 0 }, 4);
    assert.ok(w.chefs[0].x > sx + 4, `${R.id} chef moves right immediately on ArrowRight/KeyD`);
    assert.equal(w.chefs[0].moved, true);
  });
  assert.equal(ids.size, 12);
});

test('auto-chopping: standing beside a cutting board chops tomatoRaw automatically; walking away pauses it', () => {
  const idx = RK.LEVELS.findIndex(r => r.id === '1-3');
  const w = RK.create(idx, { players: 1, seed: 7 });
  const mCrate = findSt(w, s => s.type === 'crate' && s.kind === 'tomatoRaw');
  const board = findSt(w, s => s.type === 'chop');
  const farFloor = RK.cellCenter(6, 1);

  walkAct(w, 0, mCrate);
  eq(w.chefs[0].held, { kind: 'tomatoRaw' });

  walkAct(w, 0, board);
  assert.equal(w.chefs[0].held, null);
  assert.equal(board.item.kind, 'tomatoRaw');

  // Step slightly so progress starts, then walk far away and verify progress pauses.
  step(w, {}, 20);
  const progNear = board.item.prog;
  assert.ok(progNear > 0.1 && progNear < 0.8);

  RK.clickAt(w, 0, farFloor.x, farFloor.y);
  step(w, {}, 90);
  const progPaused = board.item.prog;
  step(w, {}, 30);
  assert.equal(board.item.prog, progPaused, 'chopping pauses when no chef is beside the board');

  // Walk back next to the cutting board (without pressing interact!) and let auto-chop finish.
  const neighbor = RK.cellCenter(board.c, board.r - 1);
  RK.clickAt(w, 0, neighbor.x, neighbor.y);
  const ev = step(w, {}, 180);
  assert.ok(ev.some(e => e.t === 'chopped'), 'emits chopped event automatically');
  eq(board.item, { kind: 'tomato' });

  walkAct(w, 0, board);
  eq(w.chefs[0].held, { kind: 'tomato' });
});

test('fryer, panini grill, and swirling blender lifecycles + forgiving burnt puff recovery', () => {
  const idx = RK.LEVELS.findIndex(r => r.id === '2-2');
  const w = RK.create(idx, { players: 1, seed: 11, burnDelay: 3.2 });
  const fryer = findSt(w, s => s.type === 'fryer');
  const grill = findSt(w, s => s.type === 'grill');
  const blender = findSt(w, s => s.type === 'blender');
  const falafelCrate = findSt(w, s => s.type === 'crate' && s.kind === 'falafelRaw');
  const breadCrate = findSt(w, s => s.type === 'crate' && s.kind === 'bread');
  const cheeseCrate = findSt(w, s => s.type === 'crate' && s.kind === 'cheese');
  const mangoCrate = findSt(w, s => s.type === 'crate' && s.kind === 'mango');

  // 1. Fryer cooks -> warns -> burns -> tosses burnt puff & immediately accepts fresh falafel!
  walkAct(w, 0, falafelCrate);
  walkAct(w, 0, fryer);
  assert.equal(fryer.cook.state, 'cooking');

  let ev = step(w, {}, 190);
  assert.ok(ev.some(e => e.t === 'cooked' && e.station === 'fryer'));
  assert.equal(fryer.cook.state, 'done');

  ev = step(w, {}, 110);
  assert.ok(ev.some(e => e.t === 'warn' && e.station === 'fryer'));
  assert.equal(fryer.cook.state, 'warning');

  ev = step(w, {}, 120);
  assert.ok(ev.some(e => e.t === 'burn' && e.station === 'fryer'));
  assert.equal(fryer.cook.state, 'burnt');
  assert.equal(w.burnt, 1);

  // Pick up fresh raw falafel and interact with the burnt fryer: tosses puff AND starts cooking!
  walkAct(w, 0, falafelCrate);
  const tossEv = walkAct(w, 0, fryer);
  assert.ok(tossEv.some(e => e.t === 'toss' && e.station === 'fryer'));
  assert.ok(tossEv.some(e => e.t === 'cookStart' && e.station === 'fryer'));
  assert.equal(fryer.cook.state, 'cooking');

  // 2. Panini grill accepts bread + cheese -> cooks toastie
  walkAct(w, 0, breadCrate);
  walkAct(w, 0, grill);
  eq(grill.parts, ['bread']);
  assert.equal(grill.cook.state, 'idle');

  walkAct(w, 0, cheeseCrate);
  walkAct(w, 0, grill);
  assert.equal(grill.cook.state, 'cooking');
  step(w, {}, 200);
  assert.ok(['done', 'warning'].includes(grill.cook.state));
  walkAct(w, 0, grill);
  eq(w.chefs[0].held, { kind: 'toastie' });
  assert.equal(RK.dishOf(w.chefs[0].held), 'toastie');

  // 3. Swirling blender blends fruit and NEVER burns!
  const trash = findSt(w, s => s.type === 'trash');
  walkAct(w, 0, trash);
  assert.equal(w.chefs[0].held, null);

  walkAct(w, 0, mangoCrate);
  walkAct(w, 0, blender);
  assert.equal(blender.cook.state, 'cooking');
  step(w, {}, 600); // 10 full seconds: done, never burnt!
  assert.equal(blender.cook.state, 'done');
  walkAct(w, 0, blender);
  eq(w.chefs[0].held, { kind: 'smoothieMango' });
});

test('plate assembly in any order, wrong-order safety, serving coins, and clean plate return', () => {
  const w = RK.create(0, { players: 1, seed: 99 }); // 1-1: dish is 'wrap'
  const plates = findSt(w, s => s.type === 'plates');
  const breadCrate = findSt(w, s => s.type === 'crate' && s.kind === 'bread');
  const falafelCrate = findSt(w, s => s.type === 'crate' && s.kind === 'falafelRaw');
  const fryer = findSt(w, s => s.type === 'fryer');
  const serve = findSt(w, s => s.type === 'serve');
  const counter = findSt(w, s => s.type === 'counter' && RK.walkable(w, s.c, s.r + 1));

  // Trying to serve raw bread emits wrongOrder and keeps bread in hand!
  walkAct(w, 0, breadCrate);
  const wrongEv = walkAct(w, 0, serve);
  assert.ok(wrongEv.some(e => e.t === 'wrongOrder'));
  eq(w.chefs[0].held, { kind: 'bread' });

  // Place bread on counter, get plate, scoop bread onto plate, cook falafel, scoop from fryer, serve!
  walkAct(w, 0, counter);
  const initPlates = plates.plates;
  walkAct(w, 0, plates);
  assert.equal(plates.plates, initPlates - 1);
  walkAct(w, 0, counter);
  eq(w.chefs[0].held, { kind: 'plate', items: ['bread'] });
  walkAct(w, 0, counter); // park plate with bread on counter

  walkAct(w, 0, falafelCrate);
  walkAct(w, 0, fryer);
  step(w, {}, 185);
  walkAct(w, 0, fryer);
  eq(w.chefs[0].held, { kind: 'falafel' });

  walkAct(w, 0, counter); // combine falafel onto parked plate
  assert.equal(w.chefs[0].held, null);
  assert.equal(RK.dishOf(counter.item), 'wrap');

  walkAct(w, 0, counter); // pick up completed wrap plate
  const serveEv = walkAct(w, 0, serve);
  assert.ok(serveEv.some(e => e.t === 'serve' && e.dish === 'wrap'));
  assert.equal(w.served, 1);
  assert.ok(w.coins >= 24);
  assert.equal(w.chefs[0].held, null);

  // Clean plate magically returns to rack after ~2.2s
  assert.equal(plates.plates, initPlates - 1);
  const retEv = step(w, {}, 150);
  assert.ok(retEv.some(e => e.t === 'plateReturn'));
  assert.equal(plates.plates, initPlates);
});

test('World 3 Conveyor Kitchen: 1P walkable bridge vs 2P solid divider + automatic belt transport', () => {
  const idx = RK.LEVELS.findIndex(r => r.id === '3-1');
  const w1 = RK.create(idx, { players: 1, seed: 5 });
  const w2 = RK.create(idx, { players: 2, seed: 5 });

  // Bridge at (6,3) and (7,3) is walkable in 1P, solid counter in 2P
  assert.equal(RK.walkable(w1, 6, 3), true);
  assert.equal(RK.walkable(w1, 7, 3), true);
  assert.ok(RK.findPath(w1, 2, 1, 10, 1), '1P can walk across the bridge to right side');

  assert.equal(RK.walkable(w2, 6, 3), false);
  assert.equal(RK.walkable(w2, 7, 3), false);
  assert.equal(RK.stationAt(w2, 6, 3).type, 'counter');
  assert.equal(RK.findPath(w2, 2, 1, 10, 1), null, '2P halves are separated for pass-play');

  // Place strawberry on outbound belt (6,2) '>' -> moves to (7,2) '>' -> lands on (8,2) 'C'!
  const rCrate = findSt(w2, s => s.type === 'crate' && s.kind === 'strawberry');
  const beltIn = RK.stationAt(w2, 6, 2);
  const recvCounter = RK.stationAt(w2, 8, 2);
  assert.equal(beltIn.type, 'belt');
  assert.equal(recvCounter.type, 'counter');

  walkAct(w2, 0, rCrate);
  walkAct(w2, 0, beltIn);
  eq(beltIn.item, { kind: 'strawberry' });

  const beltEv = step(w2, [], 120);
  assert.ok(beltEv.filter(e => e.t === 'beltMove').length >= 2);
  assert.equal(beltIn.item, null);
  eq(recvCounter.item, { kind: 'strawberry' });
});

test('World 4 Ice Festival: slippery ice glide physics and 1.5x VIP golden order bonus', () => {
  const normalW = RK.create(0, { players: 1, seed: 3 });
  const iceW = RK.create(RK.LEVELS.findIndex(r => r.id === '4-1'), { players: 1, seed: 3 });

  // Accelerate right for 0.45s on both normal floor and ice floor
  step(normalW, { mx: 1, my: 0 }, 27);
  step(iceW, { mx: 1, my: 0 }, 27);
  assert.equal(iceW.chefs[0].onIce, true);

  const nx0 = normalW.chefs[0].x;
  const ix0 = iceW.chefs[0].x;

  // Release keys for 0.5s: ice chef glides far further than normal chef!
  step(normalW, { mx: 0, my: 0 }, 30);
  step(iceW, { mx: 0, my: 0 }, 30);
  const normalGlide = normalW.chefs[0].x - nx0;
  const iceGlide = iceW.chefs[0].x - ix0;
  assert.ok(iceGlide > normalGlide * 3 && iceGlide > 25, `ice glide ${iceGlide} vs normal ${normalGlide}`);

  // VIP order earns 1.5x coins compared to non-VIP identical order
  const dish = iceW.orders[0].dish;
  iceW.orders = [
    { id: 10, slot: 0, dish, animal: 'cat', vip: false, left: 40, max: 40 },
    { id: 11, slot: 1, dish, animal: 'dino', vip: true, left: 40, max: 40 }
  ];
  const serve = findSt(iceW, s => s.type === 'serve');
  const makeHeld = d => (RK.DISHES[d].plate ? { kind: 'plate', items: RK.DISHES[d].recipe.slice() } : { kind: d });

  // VIP order has higher urgency tie-breaker, so first serve claims VIP!
  iceW.chefs[0].x = serve.x;
  iceW.chefs[0].y = serve.y + RK.TILE * 0.8;
  iceW.chefs[0].dirX = 0; iceW.chefs[0].dirY = -1;
  iceW.chefs[0].held = makeHeld(dish);
  iceW.ev.length = 0;
  RK.interact(iceW, 0);
  const vipCoins = iceW.ev.find(e => e.t === 'serve').coins;

  iceW.streak = 0;
  iceW.chefs[0].held = makeHeld(dish);
  iceW.ev.length = 0;
  RK.interact(iceW, 0);
  const regCoins = iceW.ev.find(e => e.t === 'serve').coins;
  assert.equal(vipCoins, Math.round(regCoins * 1.5));
});

test('chef dash burst & cooldown, DDA endpoints, and save/shop validation', () => {
  const w = RK.create(0, { players: 1 });
  const x0 = w.chefs[0].x;
  const ev = step(w, { mx: 1, my: 0, dash: true }, 10);
  assert.ok(ev.some(e => e.t === 'dash'));
  const dashDist = w.chefs[0].x - x0;

  const wWalk = RK.create(0, { players: 1 });
  step(wWalk, { mx: 1, my: 0, dash: false }, 10);
  const walkDist = wWalk.chefs[0].x - wWalk.chefs[0].sx;
  assert.ok(dashDist > walkDist * 1.6, `dash (${dashDist}) faster than walk (${walkDist})`);

  // DDA scaling
  const easy = RK.params(0), hard = RK.params(1);
  assert.ok(easy.patienceScale > hard.patienceScale);
  assert.ok(easy.cookSpeed > hard.cookSpeed);
  assert.ok(easy.burnDelay > hard.burnDelay);
  assert.ok(easy.goalScale < hard.goalScale);

  // Save validation & shop purchases
  const corrupt = RK.loadSave({ v: 1, coins: -50, apron: 99, hat: 'bad', lv: [{ s: 9, best: -1 }, null] });
  assert.equal(corrupt.coins, 0);
  assert.equal(corrupt.apron, 0);
  assert.equal(corrupt.hat, 0);
  assert.equal(corrupt.lv[0].s, 0);
  assert.equal(RK.isOpen(corrupt, 0), true);
  assert.equal(RK.isOpen(corrupt, 1), false);

  const res = RK.applyResult(corrupt, 0, 2, 200);
  assert.equal(res.first, true);
  assert.equal(res.opened, 1);
  assert.equal(RK.isOpen(corrupt, 1), true);
  assert.equal(RK.totalStars(corrupt), 2);
  assert.equal(corrupt.coins, 200);

  assert.equal(RK.buy(corrupt, 'apron', 1), 'bought');
  assert.equal(corrupt.apron, 1);
  assert.equal(RK.buy(corrupt, 'hat', 2), 'bought');
  assert.equal(corrupt.hat, 2);
  assert.equal(RK.buy(corrupt, 'hat', 5), ''); // costs 220, not enough left
  assert.equal(RK.buy(corrupt, 'apron', 0), 'wear');
  assert.equal(corrupt.apron, 0);
});

// Helper bot that prepares and serves one customer order in 1P on ANY of the 12 levels!
function serveOneOrder1P(w) {
  assert.ok(w.orders.length > 0, `no orders on ${w.R.id}`);
  if (w.chefs[0].held) {
    const trash = findSt(w, s => s.type === 'trash');
    walkAct(w, 0, trash);
    if (w.chefs[0].held && w.chefs[0].held.kind === 'plate') {
      const rack = findSt(w, s => s.type === 'plates');
      walkAct(w, 0, rack);
    }
  }
  if (!w.orders.length || w.done) return;
  const ord = w.orders.reduce((best, o) => (o.left > best.left ? o : best), w.orders[0]);
  const dish = ord.dish;
  const near = pred => {
    const c = w.chefs[0];
    let best = null, bd = Infinity;
    for (const s of w.stations) {
      if (!pred(s)) continue;
      const d = Math.hypot(s.x - c.x, s.y - c.y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
  const crate = kind => near(s => s.type === 'crate' && s.kind === kind);
  const plates = near(s => s.type === 'plates' && s.plates > 0);

  const waitStation = (st, targetStates) => {
    for (let n = 0; n < 360; n++) {
      if (w.done || targetStates.includes(st.cook.state)) return;
      step(w, {}, 1);
    }
    if (!w.done) assert.fail(`station ${st.type} did not finish on ${w.R.id}`);
  };

  if (dish === 'smoothieStrawberry' || dish === 'smoothieMango') {
    const fruit = dish === 'smoothieMango' ? 'mango' : 'strawberry';
    walkAct(w, 0, crate(fruit));
    const blender = near(s => s.type === 'blender' && s.cook.state === 'idle');
    walkAct(w, 0, blender);
    waitStation(blender, ['done']);
    walkAct(w, 0, blender);
    walkAct(w, 0, near(s => s.type === 'serve'));
    return;
  }

  if (dish === 'toastie') {
    walkAct(w, 0, crate('bread'));
    walkAct(w, 0, crate('cheese')); // combines into rawToastie in hand!
    const grill = near(s => s.type === 'grill' && s.cook.state === 'idle');
    walkAct(w, 0, grill);
    waitStation(grill, ['done', 'warning']);
    walkAct(w, 0, grill);
    walkAct(w, 0, near(s => s.type === 'serve'));
    return;
  }

  // 'wrap' or 'wrapTomato': prep plate/bread/tomato first, then fry falafel hot & fresh!
  if (dish === 'wrapTomato') {
    walkAct(w, 0, crate('tomatoRaw'));
    const board = near(s => s.type === 'chop' && !s.item);
    walkAct(w, 0, board);
    for (let n = 0; n < 240 && !w.done && board.item && board.item.kind !== 'tomato'; n++) step(w, {}, 1);
    if (w.done) return;
    eq(board.item, { kind: 'tomato' });
    walkAct(w, 0, plates);
    walkAct(w, 0, board);          // scoops chopped tomato onto plate
    walkAct(w, 0, crate('bread')); // adds bread onto plate
    const park = near(s => s.type === 'counter' && !s.item);
    walkAct(w, 0, park);           // park plate with bread + tomato
    walkAct(w, 0, crate('falafelRaw'));
    const fryer = near(s => s.type === 'fryer' && s.cook.state === 'idle') || near(s => s.type === 'fryer');
    walkAct(w, 0, fryer);
    if (w.done) return;
    waitStation(fryer, ['done', 'warning']);
    walkAct(w, 0, fryer);
    walkAct(w, 0, park);           // combine hot falafel onto plate
    walkAct(w, 0, park);           // pick up finished wrapTomato
    walkAct(w, 0, near(s => s.type === 'serve'));
    return;
  }

  // 'wrap'
  walkAct(w, 0, crate('falafelRaw'));
  const fryer = near(s => s.type === 'fryer' && s.cook.state === 'idle') || near(s => s.type === 'fryer');
  walkAct(w, 0, fryer);
  walkAct(w, 0, near(s => s.type === 'plates' && s.plates > 0));
  walkAct(w, 0, crate('bread'));
  if (w.done) return;
  waitStation(fryer, ['done', 'warning']);
  walkAct(w, 0, fryer);
  walkAct(w, 0, near(s => s.type === 'serve'));
}

test('all 12 levels are solvable in 1P and earn stars via real cooking & serving', () => {
  RK.LEVELS.forEach((R, i) => {
    const w = RK.create(i, { players: 1, seed: 100 + i });
    while (!w.done && RK.stars(w) < 2) {
      if (!w.orders.length) { step(w, {}, 20); continue; }
      serveOneOrder1P(w);
    }
    assert.ok(w.served >= 3, `${R.id} served ${w.served}`);
    assert.ok(RK.stars(w) >= 2, `${R.id} earned ${RK.stars(w)} stars (${w.coins} / ${w.goals})`);
  });
});

test('2P co-op pass-play across Conveyor Kitchen (World 3) works end-to-end', () => {
  for (const id of ['3-1', '3-2', '3-3']) {
    const idx = RK.LEVELS.findIndex(r => r.id === id);
    const w = RK.create(idx, { players: 2, seed: 77 });
    // Force a wrap order so Chef 1 (left) passes raw falafel over >>C belt to Chef 2 (right fryer),
    // and Chef 2 sends cooked falafel back over C<< belt (or serves directly on right)!
    w.orders[0].dish = 'wrap';
    const leftFalafel = findSt(w, s => s.type === 'crate' && s.kind === 'falafelRaw' && s.c < 6);
    const outBelt = findSt(w, s => s.type === 'belt' && s.dir[0] === 1 && s.c === 6);
    const rightRecv = RK.stationAt(w, 8, outBelt.r);
    const rightFryer = findSt(w, s => s.type === 'fryer' && s.c > 7);
    const inBelt = findSt(w, s => s.type === 'belt' && s.dir[0] === -1 && s.c === 7);
    const leftRecv = RK.stationAt(w, 5, inBelt.r);
    const leftPlates = findSt(w, s => s.type === 'plates' && s.c < 6);
    const leftBread = findSt(w, s => s.type === 'crate' && s.kind === 'bread' && s.c < 6);
    const leftServe = findSt(w, s => s.type === 'serve' && s.c < 6);

    // Chef 1 sends raw falafel right via belt
    walkAct(w, 0, leftFalafel);
    walkAct(w, 0, outBelt);
    step(w, [], 110);
    eq(rightRecv.item, { kind: 'falafelRaw' }, `${id} belt delivered raw falafel to Chef 2`);

    // Chef 2 picks up raw falafel, fries it, and sends cooked falafel back left via belt!
    walkAct(w, 1, rightRecv);
    walkAct(w, 1, rightFryer);
    step(w, [], 185);
    walkAct(w, 1, rightFryer);
    walkAct(w, 1, inBelt);
    step(w, [], 110);
    eq(leftRecv.item, { kind: 'falafel' }, `${id} return belt delivered hot falafel to Chef 1`);

    // Chef 1 plates bread + hot falafel and serves!
    walkAct(w, 0, leftPlates);
    walkAct(w, 0, leftBread);
    walkAct(w, 0, leftRecv);
    walkAct(w, 0, leftServe);
    assert.equal(w.served, 1, `${id} co-op wrap served!`);
    assert.ok(w.coins >= 24);
  }
});
