// Magic Crayon engine (games/magic-crayon/engine.js): purity, 4 worlds x 5 levels schema,
// capsule collision & polyline joint smoothness, live drawing, ink meter, undo/erase,
// bouncy pads, wind fans, hinged gates, portals, gravity-flip pads, purple slime hazard,
// double-marble rescue, DDA scaling, save/shop rules, and verified crayon solutions for all 20 levels.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginePath = path.join(repo, 'games/magic-crayon/engine.js');
const engineSource = fs.readFileSync(enginePath, 'utf8');

const browserBox = { window: {} };
vm.runInNewContext(engineSource, browserBox);
const MC = browserBox.window.MC;

const DT = 1 / 60;
const EASY = MC.params(0), DEF = MC.params(0.3), MID = MC.params(0.5), HARD = MC.params(1);
const ARABIC = /[\u0600-\u06ff]/;
const plain = v => JSON.parse(JSON.stringify(v));

// Verified crayon stroke solutions for all 20 levels across all 4 sketchbook worlds.
const SOLUTIONS = [
  // World 1: دفتر الجسور (Notebook Bridges)
  [[[368, 355], [570, 362], [772, 369]]],
  [[[288, 236], [575, 378], [862, 497]]],
  [[[348, 344], [575, 374], [822, 327]]],
  [[[280, 222], [495, 355]], [[685, 375], [885, 515]]],
  [[[420, 234], [750, 320]], [[610, 484], [400, 522]]],
  // World 2: الوسائد النطّاطة (Bouncy Pads)
  [[[250, 295], [535, 542]]],
  [[[215, 290], [360, 546]]],
  [[[240, 288], [455, 554]]],
  [[[270, 298], [450, 452]], [[550, 466], [645, 550]]],
  [[[235, 278], [430, 552]], [[660, 255], [895, 428]]],
  // World 3: مراوح الهواء (Breezy Fans)
  [[[300, 486], [450, 515]]],
  [[[285, 346], [520, 415]]],
  [[[295, 312], [470, 358]], [[660, 395], [850, 468]]],
  [[[255, 492], [455, 525]]],
  [[[235, 286], [400, 536]]],
  // World 4: البوابات العجيبة (Portal Sketchbook)
  [[[245, 284], [465, 415]], [[735, 290], [895, 356]]],
  [[[290, 516], [415, 525]], [[640, 134], [820, 134]], [[965, 275], [1030, 515]]],
  [[[240, 288], [430, 546]], [[750, 270], [905, 316]]],
  [[[290, 244], [515, 366]], [[675, 385], [890, 486]]],
  [[[240, 288], [415, 544]], [[815, 352], [935, 436]]]
];

function simulate(levelIdx, strokes, params = DEF, maxSec = 16) {
  const w = MC.create(levelIdx, params);
  for (const pts of strokes) MC.drawStroke(w, pts);
  MC.launch(w);
  const events = [];
  for (let i = 0; i < maxSec * 60 && !w.done && !w.popped; i++) {
    w.ev.length = 0;
    MC.step(w, DT);
    events.push(...w.ev);
  }
  return { w, events };
}

test('engine.js is pure UMD: works in browser & Node contexts, zero Kit/DOM/timer/random/storage globals', () => {
  assert.ok(MC && MC.create && MC.step && MC.drawStroke && MC.launch, 'exposes window.MC');
  const nodeBox = { module: { exports: {} } };
  vm.runInNewContext(engineSource, nodeBox);
  assert.equal(typeof nodeBox.module.exports.create, 'function', 'exposes module.exports = MC');

  const stripped = engineSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(
    stripped,
    /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage|fetch|XMLHttpRequest|WebSocket/
  );
});

test('4 sketchbook worlds of 5 levels (20 total), valid Arabic names, bounds, and gadget progression', () => {
  assert.equal(MC.WORLDS.length, 4);
  assert.equal(MC.LEVELS.length, 20);
  assert.equal(SOLUTIONS.length, 20);

  MC.WORLDS.forEach(wd => {
    assert.match(wd.name, ARABIC);
    assert.match(wd.color, /^#[0-9a-f]{6}$/i);
  });

  const ids = new Set();
  MC.LEVELS.forEach((R, i) => {
    assert.equal(R.id, `${Math.floor(i / 5) + 1}-${(i % 5) + 1}`);
    ids.add(R.id);
    assert.match(R.name, ARABIC, R.id);
    assert.equal(R.stars.length, 3, R.id + ' has 3 collectible stars');
    assert.ok(R.ink > R.inkPar && R.inkPar >= 400, R.id + ' ink & par');
    for (const st of R.starts) {
      assert.ok(st[0] > 40 && st[0] < 1240 && st[1] > 90 && st[1] < 680, R.id + ' start inside frame');
    }
    assert.ok(R.cup.x > 80 && R.cup.x < 1200 && R.cup.y > 120 && R.cup.y < 660, R.id + ' cup inside frame');
  });
  assert.equal(ids.size, 20);

  const worldSlice = w => MC.LEVELS.slice(w * 5, w * 5 + 5);
  assert.ok(worldSlice(0).every(R => !R.pads.length && !R.fans.length && !R.portals.length && !R.slimes.length), 'World 1 is pure bridges');
  assert.ok(worldSlice(1).every(R => R.pads.length >= 1), 'World 2 features bouncy pads');
  assert.ok(worldSlice(2).some(R => R.fans.length > 0) && worldSlice(2).some(R => R.gates.length > 0) && worldSlice(2).some(R => R.slimes.length > 0), 'World 3 features fans, gates, and slime');
  assert.ok(worldSlice(3).some(R => R.portals.length > 0) && worldSlice(3).some(R => R.gravPads.length > 0) && worldSlice(3).some(R => R.starts.length === 2), 'World 4 features portals, gravity flip, and double-marble rescue');
});

test('all 20 levels require drawing and reach the Golden Star Cup with 3 stars across all DDA tiers', () => {
  MC.LEVELS.forEach((R, i) => {
    // Without player crayon strokes, Karroum never reaches the cup on his own.
    for (const k of [0, 0.3, 1]) {
      const emptyRun = simulate(i, [], MC.params(k));
      assert.equal(emptyRun.w.done, false, `${R.id} must not auto-solve without strokes at k=${k}`);
    }

    // Replaying the recorded crayon strokes lands all marbles in the cup with all 3 level stars and ink <= par!
    for (const k of [0, 0.3, 0.5, 1]) {
      const P = MC.params(k);
      const { w } = simulate(i, SOLUTIONS[i], P);
      assert.equal(w.popped, false, `${R.id} at k=${k} should not pop`);
      assert.equal(w.done, true, `${R.id} at k=${k} should reach the Golden Star Cup`);
      assert.ok(w.balls.every(b => b.inCup), `${R.id} at k=${k} every marble in cup`);
      assert.equal(w.starsGot, 3, `${R.id} at k=${k} should collect all 3 floating stars`);
      assert.ok(w.inkUsed <= w.L.inkPar, `${R.id} at k=${k} ink ${w.inkUsed} <= par ${w.L.inkPar}`);
      assert.equal(MC.stars(w.L, w.starsGot, w.inkUsed), 3, `${R.id} at k=${k} earns 3 stars`);
    }
  });
});

test('crayon strokes subdivide cleanly, push immediately on drag, cap at inkMax, undo, eraseAt, and work live mid-roll', () => {
  const w = MC.create(0, MID);
  assert.equal(w.rolling, false);
  assert.equal(w.inkUsed, 0);
  assert.equal(w.strokes.length, 0);

  // Mid-drag pushes immediately so inkUsed > 0 and strokes.length === 1 even before endStroke.
  assert.equal(MC.beginStroke(w, 370, 355), true);
  assert.equal(MC.moveStroke(w, 570, 362), true);
  assert.equal(w.strokes.length, 1);
  assert.ok(w.inkUsed > 190 && w.inkUsed < 210);
  assert.ok(w.strokes[0].segs.every(sg => sg.l <= MC.MAX_SEG + 0.5), 'long drag is subdivided into smooth capsules');
  assert.equal(MC.endStroke(w), true);

  // Add a second stroke, erase the first stroke specifically with eraseAt, then undo the remaining one.
  MC.drawStroke(w, [[420, 480], [620, 480]]);
  assert.equal(w.strokes.length, 2);
  assert.equal(MC.eraseAt(w, 470, 358, 25), true);
  assert.equal(w.strokes.length, 1);
  assert.ok(Math.abs(w.strokes[0].pts[0][1] - 480) < 2, 'erased the targeted upper stroke');
  assert.equal(MC.undo(w), true);
  assert.equal(w.strokes.length, 0);
  assert.equal(w.inkUsed, 0);

  // Ink cap stops strokes at inkMax and emits noInk.
  for (let row = 0; row < 6; row++) {
    MC.drawStroke(w, [[200, 420 + row * 26], [960, 420 + row * 26]]);
  }
  assert.ok(w.inkUsed <= w.L.inkMax + 0.5, `inkUsed ${w.inkUsed} capped at ${w.L.inkMax}`);
  assert.ok(w.ev.some(e => e.t === 'noInk'));

  // Live drawing AFTER Karroum starts rolling catches him mid-journey!
  const live = MC.create(0, DEF);
  MC.launch(live);
  for (let f = 0; f < 20; f++) MC.step(live, DT);
  assert.equal(live.rolling, true);
  assert.equal(MC.drawStroke(live, SOLUTIONS[0][0]), true, 'can draw helper bridge while rolling');
  for (let f = 0; f < 400 && !live.done; f++) MC.step(live, DT);
  assert.equal(live.done, true, 'live bridge guides rolling Karroum into the cup');
});

test('gadgets: bouncy pads, wind fans, hinged gates, portals, gravity-flip pads, slime pop, and double-marble rescue', () => {
  // Bouncy pad emits bounce and sets padBoing.
  const bounceRun = simulate(5, SOLUTIONS[5]);
  assert.ok(bounceRun.events.some(e => e.t === 'bounce'), '2-1 triggers bounce pad');

  // Wind fan emits wind and lifts marble upward.
  const windRun = simulate(10, SOLUTIONS[10]);
  assert.ok(windRun.events.some(e => e.t === 'wind'), '3-1 triggers wind fan');

  // Swinging hinged gate tips under marble weight and springs back.
  const gateW = MC.create(12, DEF);
  for (const s of SOLUTIONS[12]) MC.drawStroke(gateW, s);
  MC.launch(gateW);
  let maxTilt = 0;
  for (let f = 0; f < 400 && !gateW.done; f++) {
    MC.step(gateW, DT);
    maxTilt = Math.max(maxTilt, Math.abs(gateW.gates[0].ang - gateW.L.gates[0].a0));
  }
  assert.ok(maxTilt > 0.05, 'hinged gate swings when Karroum rolls across');
  assert.equal(gateW.done, true);

  // Portal teleports marble across divider wall and emits portal event.
  const portalRun = simulate(15, SOLUTIONS[15]);
  assert.ok(portalRun.events.some(e => e.t === 'portal'), '4-1 teleports through portal');

  // Gravity-flip pad flips upward (-1) and back downward (+1).
  const gravRun = simulate(16, SOLUTIONS[16]);
  assert.ok(gravRun.events.some(e => e.t === 'grav' && e.dir === -1), '4-2 flips gravity upward');
  assert.ok(gravRun.events.some(e => e.t === 'grav' && e.dir === 1), '4-2 restores gravity downward');

  // Purple slime puddle pops Karroum when rolling off without a bridge on 3-2.
  const slimeRun = simulate(11, []);
  assert.equal(slimeRun.w.popped, true);
  assert.equal(slimeRun.w.done, false);
  assert.ok(slimeRun.events.some(e => e.t === 'pop' && e.kind === 'slime'), '3-2 slime pops unbridged marble');

  // Double-marble rescue (4-4): if only 1st bridge is drawn, 1st marble nudges buddy off ledge onto floor so level is not done until both enter cup.
  const rescuePartial = simulate(18, [SOLUTIONS[18][0]], DEF, 8);
  assert.equal(rescuePartial.w.done, false, '4-4 requires both marbles in cup');
});

test('DDA scaling: easier tiers grant more ink, wider cup magnet, and livelier bounce assist', () => {
  assert.ok(EASY.inkBonus > MID.inkBonus && MID.inkBonus > HARD.inkBonus);
  assert.ok(EASY.cupMagnet > MID.cupMagnet && MID.cupMagnet > HARD.cupMagnet);
  assert.ok(EASY.bounceAssist > MID.bounceAssist && MID.bounceAssist > HARD.bounceAssist);

  const easyL = MC.build(5, EASY), hardL = MC.build(5, HARD);
  assert.ok(easyL.inkMax > hardL.inkMax);
  assert.equal(easyL.inkPar, hardL.inkPar, 'par star threshold stays fair across DDA');
  assert.ok(easyL.pads[0].power > hardL.pads[0].power);
});

test('saves, stars, progression, and shop economy', () => {
  const fresh = plain(MC.freshSave());
  assert.equal(fresh.lv.length, 20);
  assert.equal(fresh.crayons.length, 6);
  assert.equal(fresh.skins.length, 6);
  assert.equal(fresh.crayons[0], 1);
  assert.equal(fresh.skins[0], 1);

  for (const bad of [null, undefined, 'bad', 42, [], {}, { v: 2 }, { v: 1, lv: 'nope' }]) {
    assert.deepEqual(plain(MC.loadSave(bad)), fresh);
  }

  const sanitized = plain(MC.loadSave({
    v: 1, coins: -10, crayon: 4, skin: 5, coach: 'nope',
    crayons: [0, 1, 0, 0, 0, 0], skins: [0, 0, 1, 0, 0, 0],
    lv: [{ s: 3, ink: 400, c: 7 }, { s: 0, ink: 250, c: 2 }, { s: 9, ink: 100, c: 99 }]
  }));
  assert.equal(sanitized.coins, 0);
  assert.equal(sanitized.crayon, 0, 'unowned crayon falls back to 0');
  assert.equal(sanitized.skin, 0, 'unowned skin falls back to 0');
  assert.equal(sanitized.crayons[0], 1);
  assert.equal(sanitized.skins[0], 1);
  assert.deepEqual(sanitized.lv[0], { s: 3, ink: 400, c: 7 });
  assert.deepEqual(sanitized.lv[1], { s: 0, ink: 0, c: 2 });
  assert.deepEqual(sanitized.lv[2], { s: 0, ink: 0, c: 0 });

  const s = MC.freshSave();
  assert.equal(MC.isOpen(s, 0), true);
  assert.equal(MC.isOpen(s, 1), false);
  let r = MC.applyResult(s, 0, 2, 540, [true, true, false]);
  assert.equal(r.first, true);
  assert.equal(r.opened, 1);
  assert.equal(r.coins, 2 * 2 + 2);
  assert.equal(MC.isOpen(s, 1), true);

  // Replaying with fewer stars does not downgrade stars or double-award coins.
  r = MC.applyResult(s, 0, 1, 600, [true, false, false]);
  assert.equal(r.coins, 0);
  assert.equal(s.lv[0].s, 2);

  // Improving to 3 stars with lower ink awards only the newly earned star & pickup.
  r = MC.applyResult(s, 0, 3, 404, [true, true, true]);
  assert.equal(r.best, true);
  assert.equal(r.coins, 1 * 2 + 1);
  assert.equal(s.lv[0].s, 3);
  assert.equal(s.lv[0].ink, 404);

  // Completing level 5 (index 4) unlocks World 2 (world === 1).
  for (let i = 1; i < 4; i++) MC.applyResult(s, i, 3, 400, [true, true, true]);
  r = MC.applyResult(s, 4, 3, 400, [true, true, true]);
  assert.equal(r.opened, 5);
  assert.equal(r.world, 1);

  // Shop purchases & equipping.
  s.coins = 10;
  assert.equal(MC.buy(s, 'crayon', 5), '', 'not enough coins for galaxy crayon');
  assert.equal(MC.buy(s, 'crayon', 1), 'bought');
  assert.equal(s.crayon, 1);
  assert.equal(s.coins, 6);
  assert.equal(MC.buy(s, 'skin', 2), 'bought');
  assert.equal(s.skin, 2);
  assert.equal(s.coins, 0);
  assert.equal(MC.buy(s, 'crayon', 0), 'wear');
  assert.equal(s.crayon, 0);

  const maxCoins = MC.LEVELS.length * (3 * 2 + 3);
  const totalShopCost = MC.CRAYONS.concat(MC.SKINS).reduce((n, item) => n + item.price, 0);
  assert.ok(totalShopCost <= maxCoins, `all 12 shop items (${totalShopCost}) affordable within ${maxCoins} earnable coins`);
});
