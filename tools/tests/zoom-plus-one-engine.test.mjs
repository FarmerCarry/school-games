// Zooom +1's pure engine in Node: +1 per keycap row, the speed it gives, pickups, bonks,
// flying over (or bloop into) the jelly gap, the shop, rebirths, save validation, every
// stage's road and a scripted player's pace through the stages.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(path.join(repo, 'games/zoom-plus-one/engine.js'), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'engine.js' });
const ZP = context.window.ZP;
const DT = 1 / 60;
const fresh = (extra = {}) => Object.assign(ZP.newSave(), extra);

// Holds run until something happens (or the time runs out); collects the events.
function run(w, { seconds = 30, until = () => false, input = () => ({ run: true }) } = {}) {
  const events = [];
  for (let i = 0; i < seconds * 60; i++) {
    ZP.step(w, DT, input(w));
    events.push(...w.ev); w.ev.length = 0;
    if (until(w, events)) break;
  }
  return events;
}
// A road with nothing on it, to measure steps alone.
function bare(w) { w.spec.obs = []; w.spec.picks = []; return w; }
// Steers into a lane with no obstacle in the next few rows.
function dodge(w) {
  const blocked = new Set();
  w.spec.obs.forEach((o, j) => {
    if (w.hit[j] || o.row - w.z > 3.5 || o.row - w.z < -0.6) return;
    if (o.kind === 'cube') for (const t of [0, 0.15, 0.3]) { const x = ZP.cubeX(o, w.at + t); blocked.add(Math.floor(x)); blocked.add(Math.ceil(x)); }
    else blocked.add(o.lane);
  });
  let lane = w.lane;
  if (blocked.has(lane)) for (const c of [lane - 1, lane + 1, lane - 2, lane + 2, 0, 4]) if (c >= 0 && c < 5 && !blocked.has(c)) { lane = c; break; }
  return { run: true, lane };
}

test('the engine is pure: no DOM, no Kit, no timers, no Math.random', () => {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /Math\.random|document\.|Kit\.|setTimeout|setInterval|localStorage|requestAnimationFrame|Date\.now/);
});

test('numbers: needs, rewards, run speed and shoes all grow, and needs read nicely', () => {
  for (let n = 1; n < 40; n++) {
    assert.ok(ZP.need(n + 1) > ZP.need(n), 'need ' + n);
    assert.ok(ZP.reward(n + 1) > ZP.reward(n), 'reward ' + n);
    assert.ok(ZP.rows(n + 1) >= ZP.rows(n), 'rows ' + n);
    const digits = String(ZP.need(n)).replace(/0+$/, '');
    assert.ok(digits.length <= 2, 'need ' + n + ' is ' + ZP.need(n));
  }
  assert.equal(ZP.need(1), 25);
  assert.ok(ZP.rows(1) > ZP.need(1), 'the first stage is won on the first run');
  let last = 0;
  for (const s of [0, 10, 100, 1e3, 1e4]) { const v = ZP.vmax(s); assert.ok(v > last && v <= 30, 'vmax ' + s); last = v; }
  assert.equal(ZP.vmax(0), 5);
  assert.equal(ZP.vmax(1e12), 30, 'the top speed is capped so the road stays readable');
  for (let L = 0; L < ZP.SHOES_MAX; L++) {
    assert.ok(ZP.shoesGain(L + 1) > ZP.shoesGain(L), 'shoes ' + L);
    assert.ok(ZP.shoesCost(L + 1) > ZP.shoesCost(L), 'shoes cost ' + L);
  }
});

test('every new keycap row adds the step gain to the speed, once, and the speed sets the run speed', () => {
  const save = fresh();
  const w = bare(ZP.create(save, 0));
  assert.equal(w.z, ZP.SPAWN, 'a try starts on the pad');
  run(w, { seconds: 2, input: () => ({ run: false }) });
  assert.equal(save.speed, 0, 'standing still adds nothing');
  assert.equal(w.z, ZP.SPAWN);
  const events = run(w, { until: w => w.z >= 10 });
  const steps = events.filter(e => e.type === 'step');
  assert.deepEqual(steps.map(e => e.row), Array.from({ length: steps.length }, (_, i) => i), 'one step per row, in order');
  assert.ok(steps.every(e => e.gain === 1));
  assert.equal(save.speed, steps.length);
  assert.equal(save.steps, steps.length);
  // Bouncy shoes, a rebirth and a rainbow key multiply the gain.
  const s2 = fresh({ shoes: 3, rebirths: 2 });
  const w2 = bare(ZP.create(s2, 0));
  w2.turbo = 5;
  const first = run(w2, { until: (w, ev) => ev.some(e => e.type === 'step') }).find(e => e.type === 'step');
  assert.equal(first.gain, ZP.shoesGain(3) * 3 * 2);
  // Faster with more speed.
  const slow = bare(ZP.create(fresh(), 0)), fast = bare(ZP.create(fresh({ speed: 5000 }), 0));
  run(slow, { seconds: 1.5 }); run(fast, { seconds: 1.5 });
  assert.ok(fast.z > slow.z + 5, `${fast.z} > ${slow.z}`);
});

test('pickups: golden keys add ten steps, a rainbow key doubles steps for a while, a chest gives trophies', () => {
  const save = fresh({ shoes: 2 });
  const w = ZP.create(save, 0);
  w.spec.obs = [];
  w.spec.picks = [{ row: 3, lane: 2, kind: 'gold' }, { row: 6, lane: 2, kind: 'turbo' }, { row: 9, lane: 2, kind: 'chest' }, { row: 12, lane: 0, kind: 'gold' }];
  const events = run(w, { until: w => w.z > 14 });
  const gold = events.filter(e => e.type === 'gold');
  assert.equal(gold.length, 1, 'only the key in the runner\'s lane');
  assert.equal(gold[0].gain, ZP.shoesGain(2) * 10);
  assert.ok(events.some(e => e.type === 'turbo'));
  const after = events.filter(e => e.type === 'step' && e.row > 7);
  assert.ok(after.length && after.every(e => e.gain === ZP.shoesGain(2) * 2), 'doubled after the rainbow key');
  const chest = events.find(e => e.type === 'chest');
  assert.ok(chest.wins > 0);
  assert.equal(save.wins, chest.wins);
  assert.ok(w.turbo > 0 && w.turbo < ZP.TURBO);
});

test('a bonk stuns the runner, costs a little speed (twelve steps at most) and knocks the obstacle away', () => {
  const save = fresh({ speed: 100000, shoes: 1 });
  const w = ZP.create(save, 0);
  w.spec.picks = [];
  w.spec.obs = [{ row: 5, lane: 2, kind: 'duck' }];
  const before = save.speed;
  const events = run(w, { until: (w, ev) => ev.some(e => e.type === 'bonk') });
  const bonk = events.find(e => e.type === 'bonk');
  assert.equal(bonk.idx, 0);
  assert.equal(bonk.lost, ZP.stepGain(save) * 12);
  assert.ok(save.speed > before - ZP.stepGain(save) * 12 - 1);
  assert.equal(w.phase, 'bonk');
  run(w, { seconds: ZP.BONK - 0.05 });
  assert.equal(w.phase, 'bonk');
  assert.equal(w.v, 0);
  run(w, { seconds: 0.1 });
  assert.equal(w.phase, 'run');
  const later = run(w, { until: w => w.z > 8 });
  assert.equal(later.filter(e => e.type === 'bonk').length, 0, 'the knocked duck is gone for this try');
  // A small speed only loses a tenth.
  const s2 = fresh({ speed: 50 });
  const w2 = ZP.create(s2, 0);
  w2.spec.picks = []; w2.spec.obs = [{ row: 2, lane: 2, kind: 'duck' }];
  const b2 = run(w2, { until: (w, ev) => ev.some(e => e.type === 'bonk') }).find(e => e.type === 'bonk');
  assert.ok(b2.lost <= 6);
  // Changing lanes goes around it.
  const s3 = fresh();
  const w3 = ZP.create(s3, 0);
  w3.spec.picks = []; w3.spec.obs = [{ row: 4, lane: 2, kind: 'duck' }];
  const e3 = run(w3, { until: w => w.z > 7, input: () => ({ run: true, lane: 3 }) });
  assert.equal(e3.filter(e => e.type === 'bonk').length, 0);
});

test('with enough speed the runner flies over the gap, wins trophies and lands on the next stage', () => {
  const save = fresh({ winx: 2 });
  const w = bare(ZP.create(save, 0));
  const events = run(w, { seconds: 40, until: (w, ev) => ev.some(e => e.type === 'next') });
  const launch = events.find(e => e.type === 'launch');
  assert.equal(launch.ok, true, 'stage 1 is won on the first run');
  const clear = events.find(e => e.type === 'clear');
  assert.equal(clear.stage, 1);
  assert.equal(clear.wins, ZP.reward(1) * ZP.WINX[2]);
  assert.equal(save.wins, clear.wins);
  assert.equal(save.stage, 2);
  assert.equal(save.best, 2);
  assert.equal(w.spec.n, 2);
  assert.equal(w.z, ZP.SPAWN);
  assert.equal(w.maxRow, -1);
  assert.ok(w.v > 0, 'the runner keeps running after landing');
});

test('short of the need the runner lands in the jelly and tries the stage again, keeping its speed', () => {
  const save = fresh({ stage: 6, best: 6, speed: 10 });
  const w = bare(ZP.create(save, 0));
  const events = run(w, { seconds: 60, until: (w, ev) => ev.some(e => e.type === 'respawn') });
  const launch = events.find(e => e.type === 'launch');
  assert.equal(launch.ok, false);
  assert.ok(launch.frac > 0 && launch.frac < 1);
  const fall = events.find(e => e.type === 'fall');
  assert.equal(fall.short, ZP.need(6) - save.speed);
  assert.equal(save.stage, 6, 'same stage');
  assert.equal(save.speed, 10 + ZP.rows(6), 'every step of the try is kept');
  assert.equal(w.z, ZP.SPAWN);
  assert.equal(w.falls, 1);
  assert.equal(events.filter(e => e.type === 'clear').length, 0);
});

test('the shop: shoes, the trophy multiplier and runners cost trophies; a rebirth starts over stronger', () => {
  const save = fresh({ wins: 0 });
  assert.equal(ZP.buy(save, 'shoes'), false, 'no trophies, no shoes');
  save.wins = ZP.shoesCost(0) + ZP.winxCost(0) + ZP.SKINS[2].cost;
  assert.equal(ZP.buy(save, 'shoes'), true);
  assert.equal(save.shoes, 1);
  assert.equal(ZP.buy(save, 'winx'), true);
  assert.equal(ZP.winMult(save), 2);
  assert.equal(ZP.buy(save, 'skin:2'), true);
  assert.equal(save.skin, 2);
  assert.equal(save.wins, 0);
  assert.equal(ZP.buy(save, 'skin:0'), true, 'an owned runner is free to wear');
  assert.equal(save.skin, 0);
  assert.equal(ZP.buy(save, 'skin:5'), false);
  assert.equal(ZP.buy(save, 'skin:99'), false);
  assert.equal(ZP.buy(save, 'nothing'), false);
  save.wins = 1e12; save.winx = ZP.WINX.length - 1;
  assert.equal(ZP.price(save, 'winx'), 0);
  assert.equal(ZP.buy(save, 'winx'), false, 'the multiplier tops out');
  save.shoes = ZP.SHOES_MAX;
  assert.equal(ZP.buy(save, 'shoes'), false, 'so do the shoes');

  const r = fresh({ stage: 10, speed: 5000, wins: 40, shoes: 4 });
  assert.equal(ZP.rebirth(r), false, 'not before stage ' + ZP.REBIRTH_AT);
  r.stage = ZP.REBIRTH_AT;
  assert.equal(ZP.rebirth(r), true);
  assert.deepEqual([r.stage, r.speed, r.rebirths, r.wins, r.shoes], [1, 0, 1, 40, 4]);
  assert.equal(ZP.stepGain(r), ZP.shoesGain(4) * 2);
});

test('saves: odd values fall back to fresh ones and owned runners stay owned', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(ZP.loadSave(null))), JSON.parse(JSON.stringify(ZP.newSave())));
  assert.deepEqual(JSON.parse(JSON.stringify(ZP.loadSave('x'))), JSON.parse(JSON.stringify(ZP.newSave())));
  const s = ZP.loadSave({ speed: -5, stage: 1e9, best: 3, wins: NaN, shoes: 99, winx: 1, rebirths: 2, skins: [false, true, 'yes'], skin: 2, steps: 10, coach: true });
  assert.equal(s.speed, 0);
  assert.equal(s.stage, 1);
  assert.equal(s.best, 3);
  assert.equal(s.wins, 0);
  assert.equal(s.shoes, 0);
  assert.equal(s.winx, 1);
  assert.equal(s.rebirths, 2);
  assert.deepEqual([...s.skins.slice(0, 3)], [true, true, false], 'the toast is always owned');
  assert.equal(s.skin, 0, 'a runner that is not owned is not worn');
  assert.equal(s.coach, true);
  const kept = ZP.loadSave({ speed: 123456, stage: 14, best: 14, wins: 77, skins: [true, true], skin: 1 });
  assert.deepEqual([kept.speed, kept.stage, kept.wins, kept.skin], [123456, 14, 77, 1]);
});

test('every stage\'s road is the same each time and always leaves a way through', () => {
  for (let n = 1; n <= 60; n++) for (const busy of [0, 0.5, 1]) {
    const a = ZP.stage(n, busy), b = ZP.stage(n, busy);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.equal(a.rows, ZP.rows(n));
    const rows = new Map();
    for (const o of a.obs) {
      assert.ok(o.row >= 9 && o.row < a.rows - 6, `stage ${n}: obstacles stay off the start and the ramp`);
      assert.ok(o.lane >= 0 && o.lane < ZP.LANES);
      if (o.kind === 'cube') assert.ok(o.lane - o.amp >= 0 && o.lane + o.amp <= 4, 'a cube stays on the road');
      rows.set(o.row, (rows.get(o.row) || 0) + 1);
    }
    for (const [row, count] of rows) assert.ok(count <= 2, `stage ${n} row ${row}`);
    const sorted = [...rows.keys()].sort((x, y) => x - y);
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] >= 4, `stage ${n}: room to change lanes`);
    for (const p of a.picks) assert.ok(p.row >= 0 && p.row < a.rows);
  }
  assert.ok(ZP.stage(5, 1).obs.length > ZP.stage(5, 0).obs.length, 'a busier road has more obstacles');
  assert.equal(ZP.stage(1, 1).obs.some(o => o.kind === 'cube'), false, 'no jelly cubes on the first stages');
});

test('pace: a player who dodges and buys shoes wins the first stages on the first run and keeps progressing', () => {
  const save = fresh();
  const w = ZP.create(save, 0.5);
  const firstTry = [], cleared = {};
  let t = 0, tries = 0;
  while (t < 15 * 60 && save.stage < 13) {
    ZP.step(w, DT, dodge(w));
    for (const e of w.ev) {
      if (e.type === 'clear' || e.type === 'fall') tries++;
      if (e.type === 'clear') {
        cleared[e.stage] = t;
        if (tries === e.stage) firstTry.push(e.stage);
        for (let bought = true; bought;) {
          bought = false;
          const item = ['shoes', 'winx'].map(i => [i, ZP.price(save, i)]).filter(([, p]) => p > 0 && p <= save.wins).sort((a, b) => a[1] - b[1])[0];
          if (item) bought = ZP.buy(save, item[0]);
        }
      }
    }
    w.ev.length = 0;
    t += DT;
  }
  assert.deepEqual(firstTry.slice(0, 5), [1, 2, 3, 4, 5], 'the first five stages fall on the first run');
  assert.ok(cleared[5] < 60, `stage 5 in ${cleared[5]} s`);
  assert.ok(cleared[10] > 120 && cleared[10] < 8 * 60, `stage 10 in ${cleared[10]} s`);
  assert.ok(cleared[12] < 15 * 60, `stage 12 in ${cleared[12]} s`);
  assert.ok(w.bonks < tries, 'dodging works');
});
