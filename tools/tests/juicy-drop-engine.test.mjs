// Juicy Drop (سلّة الفواكه) pure engine unit tests:
// UMD exports, purity, 10 fruit tiers, circle-circle physics, same-tier merging up to
// Giant Watermelon + double-watermelon 500pt fountain, ice-cube melting, honey bubbles,
// combo shake impulse, 1.2s/2.8s overflow grace, DDA scaling, bot solvability of all 12
// challenge stages, endless coin guard (drops >= 5), saves, and shop.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/juicy-drop/engine.js');
const engineSource = fs.readFileSync(enginePath, 'utf8');

const JD = require(enginePath);
const DT = 1 / 60;
const EASY = JD.params(0), MID = JD.params(0.5), HARD = JD.params(1);
const plain = v => JSON.parse(JSON.stringify(v));

function step(w, n = 1, inp = {}) {
  const events = [];
  for (let i = 0; i < n; i++) {
    w.ev.length = 0;
    JD.step(w, DT, i === 0 ? inp : {});
    if (w.ev.length) events.push(...w.ev);
  }
  return events;
}

// Greedy bot that aims for matching unlocked fruits, honey bubbles, or adjacent ice cubes,
// and triggers Combo Shake whenever charged.
function playStageBot(levelIdx, P, maxDrops = 95) {
  const w = JD.create(levelIdx, P, 4242 + levelIdx * 97);
  for (let d = 0; d < maxDrops && !w.done; d++) {
    if (w.shakeCharge >= 100 && w.fruits.length >= 4) {
      step(w, 24, { shake: true });
      if (w.done) break;
    }
    const cur = w.currentTier;
    const bounds = JD.cloudBounds(w);
    let targetX = null;

    // 1. If a honey bubble goal is still needed and a bubble is floating, aim at it!
    const needBubbles = w.goals.some(g => g.kind === 'bubbles' && !g.done);
    if (needBubbles && w.bubbles.length) {
      targetX = w.bubbles[0].x;
    }

    // 2. Otherwise aim directly over an accessible same-tier fruit!
    if (targetX == null) {
      const same = w.fruits.filter(f => f.tier === cur).sort((a, b) => a.y - b.y);
      for (const cand of same) {
        const blocked = w.fruits.some(o => o !== cand && o.y < cand.y - 6 && Math.abs(o.x - cand.x) < o.r + cand.r * 0.65);
        if (!blocked) { targetX = cand.x; break; }
      }
    }

    // 3. Otherwise aim near an ice cube or near tier+1 so future merges chain!
    if (targetX == null && w.ices.length) {
      const ice = w.ices[d % w.ices.length];
      targetX = ice.x + ((d % 2 ? 1 : -1) * 18);
    }
    if (targetX == null) {
      const nearNext = w.fruits.filter(f => f.tier === cur + 1).sort((a, b) => a.y - b.y)[0];
      if (nearNext) targetX = nearNext.x + (nearNext.x > JD.CX ? -28 : 28);
    }
    if (targetX == null) {
      // Spread across lanes ordered by tier from left to right so high fruits gather neatly!
      const frac = (cur + 0.5) / 5;
      targetX = bounds.min + (bounds.max - bounds.min) * frac + ((d % 3 - 1) * 14);
    }

    targetX = JD.clamp(targetX, bounds.min, bounds.max);
    step(w, 1, { x: targetX, drop: true, dropKind: 'pointer' });
    // Let fruits settle & merge for ~0.55s before next drop
    step(w, 34);
  }
  return w;
}

test('UMD & purity: loads in Node and browser sandbox with zero Kit, DOM, timers, or Math.random', () => {
  assert.ok(JD && JD.create && JD.step && JD.FRUITS.length === 10);
  const sandbox = { window: {} };
  vm.runInNewContext(engineSource, sandbox);
  assert.equal(sandbox.window.JD.FRUITS.length, 10);

  const stripped = engineSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(stripped, /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage/);
});

test('10 expressive fruit tiers and 3 worlds × 4 stages have valid Arabic names and ascending radii', () => {
  const expectedNames = ['توت', 'كرز', 'تمرة', 'تين', 'ليمونة', 'برتقالة', 'تفاحة', 'رمانة', 'شمّام', 'بطيخة عملاقة'];
  assert.deepEqual(JD.FRUITS.map(f => f.name), expectedNames);
  for (let i = 0; i < JD.FRUITS.length; i++) {
    const f = JD.FRUITS[i];
    assert.equal(f.tier, i);
    assert.match(f.color, /^#[0-9a-f]{6}$/i);
    if (i > 0) {
      assert.ok(f.r > JD.FRUITS[i - 1].r, `tier ${i} radius grows`);
      assert.ok(f.score > JD.FRUITS[i - 1].score, `tier ${i} score grows`);
    }
  }

  assert.equal(JD.WORLDS.length, 3);
  assert.equal(JD.LEVELS.length, 12);
  assert.deepEqual(JD.WORLDS.map(w => w.name), ['سلّة الصباح', 'مكعبات الثلج', 'فقاعات العسل']);
  JD.LEVELS.forEach((L, i) => {
    assert.equal(L.id, `${Math.floor(i / 4) + 1}-${(i % 4) + 1}`);
    assert.equal(L.world, Math.floor(i / 4));
    assert.match(L.name, /[\u0600-\u06FF]/);
    assert.match(L.desc, /[\u0600-\u06FF]/);
    assert.ok(L.goals.length >= 1);
  });
});

test('nothing moves by itself before input, and one-button Space drops spread across the jar', () => {
  for (const mode of [0, 4, 8, 'endless']) {
    const w = JD.create(mode);
    assert.equal(w.drops, 0);
    assert.equal(w.score, 0);
    assert.equal(w.fruits.length, 0);
    assert.equal(w.cloudX, JD.CX);
    step(w, 180);
    assert.equal(w.drops, 0);
    assert.equal(w.fruits.length, 0);
    assert.equal(w.bubbles.length, 0, 'World 3 honey bubbles wait for first drop');
    assert.equal(w.cloudX, JD.CX, 'cloud stays stationary until player input');
  }

  // Repeated Space-only drops gently shift cloudX so fruits merge instead of towering vertically!
  const w = JD.create('endless', EASY, 77);
  const xs = [];
  for (let k = 0; k < 10; k++) {
    step(w, 1, { drop: true, dropKind: 'key' });
    xs.push(w.fruits[w.fruits.length - 1].x);
    step(w, 30);
  }
  assert.equal(w.drops, 10);
  assert.ok(new Set(xs.map(x => Math.round(x))).size >= 4, 'Space-only drops spread horizontally');
});

test('circle-circle elastic/damped physics keeps fruits inside jar walls and floor without overlap', () => {
  const w = JD.create('endless', MID, 123);
  // Drop non-matching fruits with fast sideways & downward velocity
  JD.addFruit(w, 0, w.jar.left - 50, 200, -700, 600);
  JD.addFruit(w, 3, w.jar.right + 50, 220, 700, 600);
  JD.addFruit(w, 5, JD.CX, 250, 0, 400);
  JD.addFruit(w, 2, JD.CX + 3, 180, 0, 200);
  step(w, 180);

  assert.equal(w.fruits.length, 4);
  for (let i = 0; i < w.fruits.length; i++) {
    const a = w.fruits[i];
    assert.ok(a.x - a.r >= w.jar.left - 0.5 && a.x + a.r <= w.jar.right + 0.5, 'within left/right walls');
    assert.ok(a.y + a.r <= w.jar.bottom + 0.5, 'above jar floor');
    for (let j = i + 1; j < w.fruits.length; j++) {
      const b = w.fruits[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r - 1.5, 'non-matching circles do not overlap');
    }
  }
});

test('same-tier merging climbs all 10 tiers up to Giant Watermelon + 500pt double-watermelon celebration', () => {
  for (let tier = 0; tier < 9; tier++) {
    const w = JD.create('endless', MID, 500 + tier);
    const r = JD.FRUITS[tier].r;
    JD.addFruit(w, tier, JD.CX - r * 0.85, w.jar.bottom - r);
    JD.addFruit(w, tier, JD.CX + r * 0.85, w.jar.bottom - r);
    const ev = step(w, 10);
    assert.equal(w.fruits.length, 1, `tier ${tier} merged into one fruit`);
    assert.equal(w.fruits[0].tier, tier + 1);
    assert.equal(w.merges, 1);
    assert.ok(ev.some(e => e.t === 'merge' && e.tier === tier && e.toTier === tier + 1));
    assert.ok(w.score >= JD.FRUITS[tier + 1].score);
  }

  // Merging two Tier-9 Giant Watermelons pops both + awards 500 bonus points!
  const w = JD.create('endless', EASY, 999);
  const wr = JD.FRUITS[9].r;
  JD.addFruit(w, 9, JD.CX - wr * 0.9, w.jar.bottom - wr);
  JD.addFruit(w, 9, JD.CX + wr * 0.9, w.jar.bottom - wr);
  const ev = step(w, 12);
  assert.equal(w.fruits.length, 0, 'both Giant Watermelons vanish in celebration');
  assert.equal(w.watermelonsMerged, 1);
  assert.equal(w.score, 500);
  assert.equal(w.shakeCharge, 100);
  assert.ok(ev.some(e => e.t === 'watermelon_boom' && e.bonus === 500));
});

test('World 2 ice cubes block fruits until adjacent merges crack and melt them into active fruits', () => {
  const w = JD.create(4, MID, 321); // Stage 2-1 has 2 ice cubes (tier 3 Figs inside)
  assert.equal(w.ices.length, 2);
  const iceX = w.ices[0].x, iceY = w.ices[0].y;
  // Place two Cherries right next to the first ice cube so they merge adjacent to it
  JD.addFruit(w, 1, iceX, iceY - w.ices[0].r - 22);
  JD.addFruit(w, 1, iceX + 18, iceY - w.ices[0].r - 22);
  const ev = step(w, 20);
  assert.ok(ev.some(e => e.t === 'melt' && e.freed === true), 'adjacent merge melted the ice cube');
  assert.equal(w.melted, 1);
  assert.equal(w.ices.length, 1);
  assert.ok(w.fruits.some(f => f.tier === 3), 'trapped Fig popped out into active fruits');

  // Multi-layer ice cube (hp = 2) takes 2 nearby merges
  const w2 = JD.create('endless', MID, 111);
  JD.addIce(w2, 5, JD.CX, w2.jar.bottom - 62, 2);
  JD.addFruit(w2, 0, JD.CX - 10, w2.jar.bottom - 140);
  JD.addFruit(w2, 0, JD.CX + 10, w2.jar.bottom - 140);
  step(w2, 10);
  assert.equal(w2.ices.length, 1);
  assert.equal(w2.ices[0].hp, 1, 'first merge cracked 1 frost layer');
  JD.addFruit(w2, 0, JD.CX + 55, w2.jar.bottom - 75);
  JD.addFruit(w2, 0, JD.CX + 75, w2.jar.bottom - 75);
  step(w2, 15);
  assert.equal(w2.ices.length, 0, 'second merge freed the Orange');
  assert.ok(w2.fruits.some(f => f.tier === 5));
});

test('World 3 honey bubbles rise gently after play starts and pop for score + shake charge', () => {
  const w = JD.create(8, MID, 777); // Stage 3-1
  const bu = JD.addBubble(w, JD.CX, 420);
  const y0 = bu.y;
  step(w, 20);
  assert.ok(bu.y < y0, 'honey bubble floats upward');
  // Drop a fruit straight onto the honey bubble
  JD.addFruit(w, 2, bu.x, bu.y - 10, 0, 120);
  const ev = step(w, 10);
  assert.ok(ev.some(e => e.t === 'honey_pop'));
  assert.equal(w.bubblesPopped, 1);
  assert.ok(w.score >= 15);
  assert.ok(w.shakeCharge >= 22);
});

test('Combo Shake charges from merges and nudges separated same-tier fruits into chain merges', () => {
  const w = JD.create('endless', MID, 202);
  assert.equal(JD.shakeJar(w), false, 'cannot shake when meter < 100');

  // Put two Lemons separated horizontally on the floor so they cannot reach each other alone
  JD.addFruit(w, 4, JD.CX - 115, w.jar.bottom - 46);
  JD.addFruit(w, 4, JD.CX + 115, w.jar.bottom - 46);
  step(w, 45);
  assert.equal(w.merges, 0);

  w.shakeCharge = 100;
  const ev = step(w, 1, { shake: true });
  assert.ok(ev.some(e => e.t === 'shake'));
  assert.equal(w.shakeCharge, 0);
  assert.equal(w.shakesUsed, 1);
  step(w, 80);
  assert.ok(w.merges >= 1 && w.fruits.some(f => f.tier === 5), 'Combo Shake nudged the two Lemons into merging into an Orange');
});

test('overflow timer grace: warns only after 1.2s settled and ends round only after 2.8s continuous overflow', () => {
  const w = JD.create('endless', JD.params(null), 808);
  // Build a stable column of non-matching fruits reaching above TOP_Y (152)
  // Floor = 668: radii 93 (d=186 -> 482), 79 (d=158 -> 324), 67 (d=134 -> 190), 46 (d=92 -> top at 98 < 152!)
  const tiers = [8, 7, 6, 4];
  let y = w.jar.bottom;
  for (const t of tiers) {
    const r = JD.FRUITS[t].r;
    const f = JD.addFruit(w, t, w.jar.left + r + 2, y - r);
    f.landed = true;
    y -= r * 2;
  }
  // Keep vertical column pinned against wall by blocking beside it
  const side = JD.addFruit(w, 9, w.jar.left + 250, w.jar.bottom - 108);
  side.landed = true;
  // Pin x so we test exact timer thresholds cleanly without rolling off
  const pin = () => {
    let py = w.jar.bottom;
    for (let i = 0; i < 4; i++) {
      const f = w.fruits[i];
      f.x = w.jar.left + f.r + 2; f.y = py - f.r; f.vx = 0; f.vy = 0; f.landed = true;
      py -= f.r * 2;
    }
  };

  // At 1.0s (< 1.2s): NO warning, NO overflow
  for (let i = 0; i < 60; i++) { pin(); JD.step(w, DT, {}); }
  assert.equal(w.warning, false, 'no warning before 1.2s');
  assert.equal(w.over, false);

  // At 1.3s (>= 1.2s, < 2.8s): warning is ON, still NOT game over!
  for (let i = 0; i < 18; i++) { pin(); JD.step(w, DT, {}); }
  assert.equal(w.warning, true, 'pulses warning after 1.2s');
  assert.equal(w.over, false, 'does not end round at 1.3s');

  // If overflow clears before 2.8s, warning & timer reset cleanly!
  w.fruits.splice(3, 1); // top fruit merged/cleared
  JD.step(w, DT, {});
  assert.equal(w.warning, false, 'warning clears immediately when fruit settles below line');
  assert.equal(w.overTime, 0, 'continuous overflow timer resets to 0');

  // Put top fruit back and hold past 2.8s continuous overflow -> triggers round end!
  const topF = JD.addFruit(w, 4, w.jar.left + 48, 130);
  topF.landed = true;
  for (let i = 0; i < 172; i++) {
    topF.x = w.jar.left + 48; topF.y = 130; topF.vx = 0; topF.vy = 0; topF.landed = true;
    JD.step(w, DT, {});
  }
  assert.equal(w.over, true, 'round ends after 2.8s continuous overflow');
  assert.equal(w.done, true);
  assert.equal(w.won, false);
});

test('DDA parameters scale jar width, merge magnet, overflow grace, and multi-count goals cleanly', () => {
  assert.ok(EASY.jarWidthBonus > MID.jarWidthBonus && MID.jarWidthBonus > HARD.jarWidthBonus);
  assert.ok(EASY.mergeMagnet > MID.mergeMagnet && MID.mergeMagnet > HARD.mergeMagnet);
  assert.ok(EASY.overflowGrace >= MID.overflowGrace && MID.overflowGrace >= HARD.overflowGrace);
  assert.ok(EASY.goalScale < MID.goalScale && MID.goalScale < HARD.goalScale);

  const wEasy = JD.create(8, EASY); // Stage 3-1 has bubbles: 3, oranges: 2
  const wHard = JD.create(8, HARD);
  assert.ok(wEasy.jar.hw > wHard.jar.hw, 'easy jar is wider than hard jar');
  assert.ok(wEasy.goals[0].target <= wHard.goals[0].target, 'easy goal count <= hard goal count');
});

test('all 12 challenge stages are solvable by the greedy bot across EASY, MID, and HARD difficulty', () => {
  for (let i = 0; i < JD.LEVELS.length; i++) {
    for (const [label, P] of [['easy', EASY], ['mid', MID], ['hard', HARD]]) {
      const w = playStageBot(i, P);
      assert.equal(w.won, true, `Stage ${JD.LEVELS[i].id} (${label}) won: goals=${JSON.stringify(w.goals)} over=${w.over}`);
      assert.ok(JD.stars(w) >= 1 && JD.stars(w) <= 3);
    }
  }
});

test('saves, stars, shop purchases (5 jars + 5 faces), and endless coin guard (drops >= 5)', () => {
  const fresh = plain(JD.freshSave());
  assert.equal(fresh.lv.length, 12);
  assert.equal(JD.JARS.length, 5);
  assert.equal(JD.FACES.length, 5);

  for (const corrupt of [null, undefined, 'bad', 42, [], {}, { v: 2 }, { v: 1, coins: -99, jar: 9, face: 3 }]) {
    assert.deepEqual(plain(JD.loadSave(corrupt)), fresh);
  }

  // Endless mode NEVER pays coins when drops < 5 (anti-farming guard)
  const wShort = JD.create('endless');
  wShort.score = 300;
  wShort.drops = 4;
  assert.equal(JD.endlessCoins(wShort), 0);
  const s = JD.freshSave();
  assert.equal(JD.applyEndlessResult(s, 300, 4, 10).coins, 0);
  assert.equal(s.coins, 0);

  // With drops >= 5, endless mode awards coins and tracks personal best!
  wShort.drops = 5;
  wShort.score = 350;
  const c5 = JD.endlessCoins(wShort);
  assert.ok(c5 > 0);
  const er = JD.applyEndlessResult(s, 350, 5, c5);
  assert.equal(er.best, true);
  assert.equal(er.coins, c5);
  assert.equal(s.bestEndless, 350);

  // Stage progression unlocks next stage and worlds (every 4 stages)
  for (let i = 0; i < 4; i++) {
    const r = JD.applyStageResult(s, i, 3, 250, 8);
    if (i === 3) assert.equal(r.world, 1, 'completing 1-4 opens World 2');
  }
  assert.equal(JD.totalStars(s), 12);
  assert.equal(JD.isOpen(s, 4), true);
  assert.equal(JD.nextLevel(s), 4);

  // Shop buys & equips jars and face packs
  s.coins = 50;
  assert.equal(JD.buy(s, 'jar', 1), 'bought');
  assert.equal(s.jar, 1);
  assert.equal(JD.buy(s, 'face', 2), 'bought');
  assert.equal(s.face, 2);
  assert.equal(JD.buy(s, 'jar', 0), 'wear');
  assert.equal(s.jar, 0);
  s.coins = 1;
  assert.equal(JD.buy(s, 'jar', 4), '', 'insufficient coins rejected');
});
