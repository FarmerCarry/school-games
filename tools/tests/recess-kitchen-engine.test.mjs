// Recess Kitchen engine (games/recess-kitchen/engine.js): pure simulation tests covering
// 4 open worlds / 12 stages, Chef 1 spawn & idle/ArrowRight contract, smart magnet-snap &
// auto-stacking counters, non-silent Arabic visual guidance bubbles with target arrows,
// Easy no-burn rule, Normal warning/recovery, Hero VIP 2x orders & Fever 2x cooking speed,
// Boost strips, Conveyor belts, Warp teleporters, Star Pizza Oven, Mini Sous-Bot, 2P co-op,
// save/locker sanitization, and full 3-star winnability across all 12 stages.
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
const RK = sandbox.window.RKEngine;

const require = createRequire(import.meta.url);
const RKCommon = require(enginePath);

const DT = 1 / 60;
const ARABIC = /[\u0600-\u06FF]/;
const LATIN_WORD = /[A-Za-z]{2,}/;
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

function walkAct(w, ci, st, maxSec = 10) {
  if (w.done) return [];
  w.ev.length = 0;
  const ok = RK.clickAt(w, ci, st.x, st.y);
  assert.ok(ok, `clickAt failed on stage ${w.id} toward (${st.c},${st.r}) ${st.type}`);
  const ev = [...w.ev];
  if (!w.chefs[ci].nav) return ev;
  for (let n = 0; n < maxSec * 60; n++) {
    w.ev.length = 0;
    RK.step(w, DT, {});
    ev.push(...w.ev);
    if (!w.chefs[ci].nav || w.done) break;
  }
  return ev;
}

const findSt = (w, pred) => w.stations.find(pred);

test('engine is pure UMD: exports window.RKEngine + CommonJS, zero DOM/Kit/timers/random/console', () => {
  assert.ok(RK && RK.create && RK.step && RK.interact && RK.clickAt, 'window.RKEngine loaded');
  assert.equal(sandbox.window.RK, RK, 'window.RK alias matches window.RKEngine');
  assert.equal(RKCommon.LEVELS.length, 12, 'CommonJS exports 12 stages');

  const stripped = engineSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(
    stripped,
    /\bKit\b|\bdocument\b|\blocalStorage\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|\bconsole\./
  );
  assert.doesNotMatch(engineSource, /^\s*import\s[\w{*]/m);
});

test('4 themed kitchens x 3 stages = 12 stages, 100% Arabic labels, station reachability, idle stillness & immediate ArrowRight', () => {
  assert.equal(RK.WORLDS.length, 4);
  assert.equal(RK.LEVELS.length, 12);
  assert.equal(RK.CUSTOMERS.length, 4);

  for (const list of [RK.WORLDS, RK.CUSTOMERS, Object.values(RK.DISHES), Object.values(RK.ITEMS), RK.APRONS, RK.HATS, Object.values(RK.DIFFICULTIES)]) {
    for (const entry of list) {
      assert.match(entry.name, ARABIC, entry.id);
      assert.doesNotMatch(entry.name, LATIN_WORD, entry.id);
    }
  }

  RK.LEVELS.forEach((lv, i) => {
    assert.equal(lv.id, `${Math.floor(i / 3) + 1}-${(i % 3) + 1}`);
    assert.equal(lv.world, Math.floor(i / 3));
    assert.match(lv.name, ARABIC);
    assert.equal(lv.map.length, RK.ROWS, `${lv.id} rows`);
    lv.map.forEach(row => assert.equal(row.length, RK.COLS, `${lv.id} cols`));
    assert.ok(lv.goals[0] < lv.goals[1] && lv.goals[1] < lv.goals[2], `${lv.id} ascending goals`);

    const w = RK.create(i, { players: 1, seed: 101 + i });
    const sx = w.chefs[0].x, sy = w.chefs[0].y;
    step(w, {}, 120);
    assert.equal(w.chefs[0].x, sx, `${lv.id} Chef 1 stays completely still when idle`);
    assert.equal(w.chefs[0].y, sy);
    assert.equal(w.atStart, true, `${lv.id} atStart remains true while idle`);

    step(w, { mx: 1, my: 0 }, 4);
    assert.ok(w.chefs[0].x > sx + 12, `${lv.id} Chef 1 moves right immediately on ArrowRight`);
    assert.equal(w.atStart, false);

    // Zero slippery ice drift: releasing keys stops velocity immediately
    const stoppedX = w.chefs[0].x;
    step(w, { mx: 0, my: 0 }, 10);
    assert.equal(w.chefs[0].x, stoppedX, `${lv.id} zero ice drift when keys released`);
    assert.equal(w.chefs[0].vx, 0);

    // Every interactive station on every map is reachable via clickAt
    for (const st of w.stations) {
      if (st.type === 'wall') continue;
      const wCheck = RK.create(i, { players: 1, seed: 77 });
      assert.equal(RK.clickAt(wCheck, 0, st.x, st.y), true, `${lv.id} station (${st.c},${st.r}) ${st.type} reachable`);
    }
  });
});

test('smart magnet-snap & auto-stacking counters: bread + grilled burger snaps automatically in any order', () => {
  const w = RK.create(1, { players: 1, difficulty: 'easy', seed: 9 }); // 1-2 has bun, meat, cheese
  const bunCrate = findSt(w, s => s.type === 'crate' && s.kind === 'bun');
  const meatCrate = findSt(w, s => s.type === 'crate' && s.kind === 'meatRaw');
  const cheeseCrate = findSt(w, s => s.type === 'crate' && s.kind === 'cheese');
  const grill = findSt(w, s => s.type === 'grill');
  const counter = findSt(w, s => s.type === 'counter' && !s.item);

  // Put bun on counter
  walkAct(w, 0, bunCrate);
  eq(w.chefs[0].held, { kind: 'bun' });
  walkAct(w, 0, counter);
  assert.equal(w.chefs[0].held, null);
  eq(counter.item, { kind: 'bun' });

  // Grill meat
  walkAct(w, 0, meatCrate);
  walkAct(w, 0, grill);
  assert.equal(grill.cook.state, 'cooking');
  step(w, {}, 140);
  assert.equal(grill.cook.state, 'done');
  walkAct(w, 0, grill);
  eq(w.chefs[0].held, { kind: 'meatCooked' });

  // Walk toward the counter holding bun -> proximity magnet auto-snaps into finished burger!
  const snapEv = walkAct(w, 0, counter);
  assert.ok(snapEv.some(e => e.t === 'combine' && e.kind === 'burger'));
  eq(w.chefs[0].held, { kind: 'burger' });
  assert.equal(counter.item, null);

  // Touch/act at cheese crate while holding burger -> snaps directly into cheeseburger!
  const chEv = walkAct(w, 0, cheeseCrate);
  assert.ok(chEv.some(e => e.t === 'combine' && e.kind === 'cheeseburger'));
  eq(w.chefs[0].held, { kind: 'cheeseburger' });

  // Verify order-independence of combineItems
  assert.equal(RK.combineItems('bun', 'cheese'), 'bunCheese');
  assert.equal(RK.combineItems('bunCheese', 'meatCooked'), 'cheeseburger');
  assert.equal(RK.combineItems('meatCooked', 'cheese'), 'meatCheese');
  assert.equal(RK.combineItems('meatCheese', 'bun'), 'cheeseburger');
  assert.equal(RK.combineItems('dough', 'cheese'), 'pizzaRaw');
});

test('non-silent friendly visual guidance: wrong item or station ALWAYS pops Arabic hint bubble + target arrow', () => {
  const w = RK.create(3, { players: 1, seed: 15 }); // 2-1 has grill, fryer, blender, cannon
  const meatCrate = findSt(w, s => s.type === 'crate' && s.kind === 'meatRaw');
  const potatoCrate = findSt(w, s => s.type === 'crate' && s.kind === 'potatoRaw');
  const bunCrate = findSt(w, s => s.type === 'crate' && s.kind === 'bun');
  const grill = findSt(w, s => s.type === 'grill');
  const fryer = findSt(w, s => s.type === 'fryer');
  const cannon = findSt(w, s => s.type === 'cannon');
  const counter = findSt(w, s => s.type === 'counter');

  // 1. Empty hands at Serving Cannon -> helpful guidance bubble, never silent!
  let ev = walkAct(w, 0, cannon);
  let hint = ev.find(e => e.t === 'hint');
  assert.ok(hint && ARABIC.test(hint.text), 'empty cannon gives Arabic hint');
  assert.ok(cannon.wobble > 0, 'station wobbles gently on wrong interact');

  // 2. Raw meat at Serving Cannon -> tells kid to grill meat first + points arrow to Grill!
  walkAct(w, 0, meatCrate);
  ev = walkAct(w, 0, cannon);
  hint = ev.find(e => e.t === 'hint');
  assert.ok(hint && hint.text.includes('اشوِ اللحم'), `expected grill hint, got: ${hint?.text}`);
  assert.equal(hint.targetX, grill.x, 'arrow points directly to Grill X');
  assert.equal(hint.targetY, grill.y, 'arrow points directly to Grill Y');

  // 3. Raw meat against bun on counter -> tells kid to grill meat first!
  const trash = findSt(w, s => s.type === 'trash');
  walkAct(w, 0, trash);
  walkAct(w, 0, bunCrate);
  walkAct(w, 0, counter);
  walkAct(w, 0, meatCrate);
  ev = walkAct(w, 0, counter);
  hint = ev.find(e => e.t === 'hint');
  assert.ok(hint && hint.text.includes('اشوِ اللحم'), 'raw meat on bun counter gives grill hint');

  // 4. Raw potato at Grill -> redirects kid to Fryer!
  walkAct(w, 0, trash);
  walkAct(w, 0, potatoCrate);
  ev = walkAct(w, 0, grill);
  hint = ev.find(e => e.t === 'hint');
  assert.ok(hint && hint.text.includes('للمقلاة'), `expected fryer hint, got: ${hint?.text}`);
  assert.equal(hint.targetX, fryer.x);
});

test('difficulty modes: Easy NEVER burns food; Normal warns then burns with 1-tap recovery; Hero VIP 2x & Fever 2x cook speed', () => {
  // 1. Easy mode: food stays done forever (45 seconds!)
  const easyW = RK.create(0, { difficulty: 'easy', seed: 3 });
  const eMeat = findSt(easyW, s => s.type === 'crate' && s.kind === 'meatRaw');
  const eGrill = findSt(easyW, s => s.type === 'grill');
  walkAct(easyW, 0, eMeat);
  walkAct(easyW, 0, eGrill);
  step(easyW, {}, 60 * 45);
  assert.equal(eGrill.cook.state, 'done', 'Easy mode food NEVER warns or burns');
  assert.equal(easyW.burnt, 0);

  // 2. Normal mode: cooks -> done -> warning -> burnt, and interacting with fresh meat recovers & cooks in 1 tap!
  const normW = RK.create(0, { difficulty: 'normal', burnDelay: 2.0, seed: 4 });
  const nMeat = findSt(normW, s => s.type === 'crate' && s.kind === 'meatRaw');
  const nGrill = findSt(normW, s => s.type === 'grill');
  walkAct(normW, 0, nMeat);
  walkAct(normW, 0, nGrill);
  step(normW, {}, 130);
  assert.equal(nGrill.cook.state, 'done');
  step(normW, {}, 130);
  assert.equal(nGrill.cook.state, 'warning');
  step(normW, {}, 90);
  assert.equal(nGrill.cook.state, 'burnt');
  assert.equal(normW.burnt, 1);

  walkAct(normW, 0, nMeat);
  const recEv = walkAct(normW, 0, nGrill);
  assert.ok(recEv.some(e => e.t === 'toss') && recEv.some(e => e.t === 'cookStart'));
  assert.equal(nGrill.cook.state, 'cooking');

  // 3. Hero VIP 2x coins & Fever Streak 2x cooking speed
  const heroW = RK.create(0, { difficulty: 'hero', seed: 5 });
  heroW.orders[0].dish = 'juice';
  heroW.orders[0].vip = true;
  heroW.orders[0].patience = heroW.orders[0].maxPatience;
  heroW.streak = 3; // Next serve hits streak 4 -> Fever!

  const fruitCrate = findSt(heroW, s => s.type === 'crate' && s.kind === 'fruitRaw');
  const blender = findSt(heroW, s => s.type === 'blender');
  const cannon = findSt(heroW, s => s.type === 'cannon');

  walkAct(heroW, 0, fruitCrate);
  walkAct(heroW, 0, blender);
  step(heroW, {}, 110);
  walkAct(heroW, 0, blender);
  const srvEv = walkAct(heroW, 0, cannon).find(e => e.t === 'serve');
  assert.ok(srvEv && srvEv.vip === true);
  assert.equal(heroW.fever, true, '4th consecutive serve triggers Fever');
  assert.ok(srvEv.coins >= (20 + 12) * 2, `VIP + Fever 3x bonus doubled coins: ${srvEv.coins}`);

  // Verify Fever cooks meat in ~1.0s instead of 2.0s!
  const hMeat = findSt(heroW, s => s.type === 'crate' && s.kind === 'meatRaw');
  const hGrill = findSt(heroW, s => s.type === 'grill');
  walkAct(heroW, 0, hMeat);
  walkAct(heroW, 0, hGrill);
  step(heroW, {}, 64);
  assert.equal(hGrill.cook.state, 'done', 'Fever cooks grill 2x faster');
});

test('Conveyor belts, Warp-teleporter counters, Star Pizza Oven, Mini Sous-Bot & 2P Co-Op', () => {
  // 1. Conveyor belt (2-2) slides item onto adjacent counter and auto-combines!
  const beltW = RK.create(4, { difficulty: 'easy', seed: 21 }); // 2-2
  const belts = beltW.stations.filter(s => s.type === 'belt');
  const endCounter = beltW.grid[belts[1].r][belts[1].c + 1];
  endCounter.item = { kind: 'bun' };
  belts[0].item = { kind: 'meatCooked' };
  const bEv = step(beltW, {}, 90);
  assert.ok(bEv.some(e => e.t === 'combine' && e.kind === 'burger'), 'conveyor slides & auto-combines');
  eq(endCounter.item, { kind: 'burger' });

  // 2. Warp-teleporter counters & Star Pizza Oven (3-2)
  const spaceW = RK.create(7, { difficulty: 'easy', seed: 32 }); // 3-2
  const warps = spaceW.stations.filter(s => s.type === 'warp');
  assert.equal(warps.length, 2);
  warps[1].item = { kind: 'bun' };
  const mCrate = findSt(spaceW, s => s.type === 'crate' && s.kind === 'meatRaw');
  const sGrill = findSt(spaceW, s => s.type === 'grill');
  walkAct(spaceW, 0, mCrate);
  walkAct(spaceW, 0, sGrill);
  step(spaceW, {}, 130);
  walkAct(spaceW, 0, sGrill);
  const wEv = walkAct(spaceW, 0, warps[0]);
  assert.ok(wEv.some(e => e.t === 'warp') && wEv.some(e => e.t === 'combine' && e.kind === 'burger'));
  eq(warps[1].item, { kind: 'burger' });

  // Pizza Oven accepts dough first then cheese directly inside oven!
  const oven = findSt(spaceW, s => s.type === 'oven');
  const doughCrate = findSt(spaceW, s => s.type === 'crate' && s.kind === 'dough');
  const cheeseCrate = findSt(spaceW, s => s.type === 'crate' && s.kind === 'cheese');
  walkAct(spaceW, 0, doughCrate);
  walkAct(spaceW, 0, oven);
  assert.equal(oven.prep, 'dough');
  walkAct(spaceW, 0, cheeseCrate);
  walkAct(spaceW, 0, oven);
  assert.equal(oven.cook.state, 'cooking');
  step(spaceW, {}, 140);
  assert.equal(oven.cook.state, 'done');
  walkAct(spaceW, 0, oven);
  eq(spaceW.chefs[0].held, { kind: 'pizza' });

  // 3. Mini Sous-Bot in 1P delivers helper item to free counter when triggered
  const botEv = [];
  spaceW.ev.length = 0;
  assert.equal(RK.triggerSousBot(spaceW), true);
  botEv.push(...spaceW.ev, ...step(spaceW, {}, 180));
  assert.ok(botEv.some(e => e.t === 'botDrop'), 'Mini Sous-Bot delivers prepped gift to free counter');

  // 4. 2P Co-Op independent controls + save/locker helper checks
  const coopW = RK.create(0, { players: 2, seed: 8 });
  assert.equal(coopW.chefs.length, 2);
  assert.equal(coopW.sousBot, null);
  const x0 = coopW.chefs[0].x, x1 = coopW.chefs[1].x;
  step(coopW, [{ mx: -1, my: 0 }, { mx: 1, my: 0, dash: true }], 10);
  assert.ok(coopW.chefs[0].x < x0 - 20);
  assert.ok(coopW.chefs[1].x > x1 + 60);

  const sv = RK.loadSave({ coins: 200 });
  assert.equal(RK.buyOrEquip(sv, 'apron', 1).action, 'buy');
  assert.equal(sv.apron, 1);
  assert.equal(sv.coins, 140);
  assert.equal(RK.buyOrEquip(sv, 'hat', 2).action, 'buy');
  assert.equal(sv.hat, 2);
  assert.equal(sv.coins, 60);
});

test('all 12 stages (1-1 .. 4-3) are 3-star winnable by real chef navigation & cooking', () => {
  function cookOrder(w, dish) {
    const c = w.chefs[0];
    const trash = findSt(w, s => s.type === 'trash');
    if (c.held) walkAct(w, 0, trash);

    const crate = kind => findSt(w, s => s.type === 'crate' && s.kind === kind);
    const app = type => w.stations.filter(s => s.type === type).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
    const waitCook = st => {
      for (let i = 0; i < 200 && st.cook.state === 'cooking' && !w.done; i++) step(w, {}, 1);
    };

    if (dish === 'juice') {
      const bl = app('blender');
      if (bl.cook.state === 'idle') { walkAct(w, 0, crate('fruitRaw')); walkAct(w, 0, bl); }
      waitCook(bl);
      walkAct(w, 0, bl);
    } else if (dish === 'fries') {
      const fr = app('fryer');
      if (fr.cook.state === 'burnt') walkAct(w, 0, fr);
      if (fr.cook.state === 'idle') { walkAct(w, 0, crate('potatoRaw')); walkAct(w, 0, fr); }
      waitCook(fr);
      walkAct(w, 0, fr);
    } else if (dish === 'burger' || dish === 'cheeseburger') {
      const gr = app('grill');
      if (gr.cook.state === 'burnt') walkAct(w, 0, gr);
      if (gr.cook.state === 'idle') { walkAct(w, 0, crate('meatRaw')); walkAct(w, 0, gr); }
      walkAct(w, 0, crate('bun'));
      if (dish === 'cheeseburger') walkAct(w, 0, crate('cheese'));
      waitCook(gr);
      walkAct(w, 0, gr);
    } else if (dish === 'pizza') {
      const ov = app('oven');
      if (ov.cook.state === 'burnt') walkAct(w, 0, ov);
      if (ov.cook.state === 'idle') {
        walkAct(w, 0, crate('dough'));
        walkAct(w, 0, crate('cheese'));
        walkAct(w, 0, ov);
      }
      waitCook(ov);
      walkAct(w, 0, ov);
    }

    const cannon = findSt(w, s => s.type === 'cannon' && s.c === 6) || findSt(w, s => s.type === 'cannon');
    walkAct(w, 0, cannon);
  }

  for (let i = 0; i < RK.LEVELS.length; i++) {
    const w = RK.create(i, { players: 1, difficulty: 'normal', seed: 500 + i });
    while (!w.done) {
      if (!w.orders.length) { step(w, {}, 10); continue; }
      const targetDish = w.orders[0].dish;
      cookOrder(w, targetDish);
    }
    assert.equal(w.stars, 3, `Stage ${w.id} achieved 3 stars (coins=${w.coins}, 3-star=${w.goals[2]}, served=${w.served})`);
  }
});
