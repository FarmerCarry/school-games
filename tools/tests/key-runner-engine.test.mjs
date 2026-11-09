// Key Runner's pure engine in Node: the keyboard table, every lesson, a scripted typist
// that finishes every level at every tier, the type-ahead queue, wrong keys, endless runs,
// the two-player halves and save validation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(path.join(repo, 'games/key-runner/engine.js'), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'engine.js' });
const KR = context.window.KR;
const DT = 1 / 60;
const plain = value => JSON.parse(JSON.stringify(value));

// A typist: presses each shown target `delay` seconds after it became the target.
function play(plan, { seed = 7, delay = 0, maxSeconds = 600, mistakes = 0 } = {}) {
  const w = KR.create(plan, seed);
  let since = 0, current = null, wrongLeft = mistakes;
  for (let i = 0; i < maxSeconds * 60 && !w.done; i++) {
    const target = KR.target(w);
    if (target !== current) { current = target; since = 0; }
    if (target && since >= delay) {
      if (wrongLeft > 0) { wrongLeft--; KR.press(w, target.code === 'KeyQ' ? 'KeyW' : 'KeyQ'); }
      KR.press(w, target.code);
      current = null; since = 0;
    }
    since += DT;
    KR.step(w, DT);
    w.ev.length = 0;
  }
  return w;
}
const allLevels = () => KR.WORLDS.flatMap((world, w) => world.levels.map((_, l) => [w, l]));

test('the engine is pure: no DOM, no Kit, no timers, no Math.random', () => {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /Math\.random|document\.|Kit\.|setTimeout|setInterval|localStorage|requestAnimationFrame|Date\.now/);
});

test('the keyboard table: Arabic 101 letters on the physical keys, and every key the game uses is on it', () => {
  // The standard Windows Arabic (101) layout, key by key.
  const arabic = { KeyQ: 'ض', KeyW: 'ص', KeyE: 'ث', KeyR: 'ق', KeyT: 'ف', KeyY: 'غ', KeyU: 'ع', KeyI: 'ه', KeyO: 'خ', KeyP: 'ح',
    BracketLeft: 'ج', BracketRight: 'د', KeyA: 'ش', KeyS: 'س', KeyD: 'ي', KeyF: 'ب', KeyG: 'ل', KeyH: 'ا', KeyJ: 'ت', KeyK: 'ن',
    KeyL: 'م', Semicolon: 'ك', Quote: 'ط', KeyZ: 'ئ', KeyX: 'ء', KeyC: 'ؤ', KeyV: 'ر', KeyB: 'لا', KeyN: 'ى', KeyM: 'ة',
    Comma: 'و', Period: 'ز', Slash: 'ظ', Backquote: 'ذ' };
  for (const [code, letter] of Object.entries(arabic)) assert.equal(KR.KEY[code].ar, letter, code);
  for (let d = 0; d <= 9; d++) assert.equal(KR.KEY['Digit' + d].lat, String(d));
  // Rows are physical: Q W E R T Y left to right, and each full row is 15 units wide.
  assert.ok(KR.KEY.KeyQ.x < KR.KEY.KeyW.x && KR.KEY.KeyW.x < KR.KEY.KeyY.x);
  for (let r = 0; r < 5; r++) {
    const row = KR.KEYS.filter(k => k.row === r && !k.code.startsWith('Arrow'));
    assert.equal(row.reduce((sum, k) => sum + k.w, 0), 15, 'row ' + r);
  }
  const used = new Set(['Space', 'ArrowUp', 'ArrowDown', ...KR.LEFT, ...KR.RIGHT]);
  for (const world of KR.WORLDS) for (const lv of world.levels) [...lv.n, ...lv.k].forEach(c => used.add(c));
  for (const word of KR.WORDS) KR.wordCodes(word).forEach(c => used.add(c));
  for (const code of used) {
    const key = KR.KEY[code];
    assert.ok(key, code + ' is on the keyboard');
    assert.ok(KR.isGameKey(code), code + ' is a game key');
    assert.ok(key.lat && key.ar, code + ' has a Latin and an Arabic legend');
  }
  // Every letter of the words is one key without Shift, and no word needs the لا key.
  for (const word of KR.WORDS) {
    assert.ok(KR.wordCodes(word).every(Boolean), word);
    assert.doesNotMatch(word, /ل[اأإآ]/, word);
    assert.ok(Array.from(word).length >= 2 && Array.from(word).length <= 5, word);
  }
  assert.equal(new Set(KR.WORDS).size, KR.WORDS.length, 'no word twice');
  // The halves: 20 keys each, no key on both sides, every key a game key.
  assert.equal(KR.LEFT.length, 20); assert.equal(KR.RIGHT.length, 20);
  for (const c of KR.LEFT) { assert.equal(KR.sideOf(c), 0); assert.ok(KR.KEY[c].finger <= 3, c + ' is a left-hand key'); }
  for (const c of KR.RIGHT) { assert.equal(KR.sideOf(c), 1); assert.ok(KR.KEY[c].finger >= 4 && KR.KEY[c].finger <= 7, c + ' is a right-hand key'); }
  assert.equal(KR.sideOf('Space'), -1);
  // Other keys are never game keys; the number pad types digits.
  for (const code of ['ShiftLeft', 'Tab', 'Enter', 'Escape', 'Backspace', 'ControlLeft', 'F5', '']) assert.equal(KR.isGameKey(code), false, code);
  assert.equal(KR.norm('Numpad7'), 'Digit7');
  assert.equal(KR.norm('KeyA'), 'KeyA');
});

test('tuning tables have one entry per tier and move the right way; the key glow is never delayed', () => {
  assert.equal(KR.TUNE.glow, undefined, 'no hint delay at any tier (the owner wants the glow at once)');
  for (const [knob, list] of Object.entries(KR.TUNE)) {
    assert.equal(list.length, KR.TIERS, knob);
    const dir = KR.HARDER[knob];
    assert.ok(dir === 1 || dir === -1, knob + ' has a direction');
    for (let i = 1; i < list.length; i++) assert.ok(dir > 0 ? list[i] >= list[i - 1] : list[i] <= list[i - 1], `${knob} at tier ${i + 1}`);
    assert.notEqual(list[0], list[list.length - 1], knob + ' changes across the tiers');
  }
  assert.equal(KR.TUNE.ahead[0], 1, 'one key shown ahead at tier 1');
  assert.equal(KR.TUNE.ahead[4], 4, 'four keys shown ahead at tier 5');
  assert.equal(KR.TUNE.wrongCost[0], 0, 'a wrong key costs nothing for the youngest');
  assert.ok(KR.TUNE.wrongCost[4] >= 1, 'a wrong key costs a speed step at the top');
  for (const knob of Object.keys(KR.DUO)) assert.equal(typeof KR.DUO[knob], 'number', knob);
});

test('lessons: new keys come twice first, no key three times in a row, words in the last level', () => {
  for (const tier of [1, 2, 3, 4, 5]) {
    for (const [w, l] of allLevels()) {
      const plan = KR.plan(w, l, tier, 1234 + w * 10 + l), lv = KR.WORLDS[w].levels[l];
      assert.equal(plan.id, `w${w + 1}L${l + 1}`);
      assert.ok(plan.keys.length >= 10 && plan.keys.length <= 30, plan.id + ' length ' + plan.keys.length);
      assert.ok(plan.keys.every(c => KR.isGameKey(c)), plan.id);
      if (!lv.words) {
        lv.n.forEach((c, i) => { assert.equal(plan.keys[2 * i], c); assert.equal(plan.keys[2 * i + 1], c); });
        const review = KR.reviewPool(w);
        assert.ok(plan.keys.every(c => lv.k.includes(c) || review.includes(c)), plan.id + ' uses its keys and earlier worlds\' keys');
        if (lv.k.length > 1) for (let i = 2; i < plan.keys.length; i++) assert.ok(!(plan.keys[i] === plan.keys[i - 1] && plan.keys[i] === plan.keys[i - 2]), plan.id + ' triple at ' + i);
        if (lv.k.length * 2 <= plan.keys.length) for (const c of lv.k) assert.ok(plan.keys.includes(c), plan.id + ' asks for ' + c);
      } else {
        assert.ok(plan.words.length >= 3, plan.id + ' has words');
        for (const word of plan.words) {
          assert.deepEqual(plan.keys.slice(word.start, word.start + word.len), KR.wordCodes(word.text));
          const n = Array.from(word.text).length;
          assert.ok(n >= KR.TUNE.wordMin[tier - 1] && n <= KR.TUNE.wordMax[tier - 1], word.text + ' at tier ' + tier);
        }
      }
    }
  }
  assert.deepEqual(KR.plan(2, 1, 3, 99).keys, KR.plan(2, 1, 3, 99).keys, 'a seed replays the same keys');
  assert.notDeepEqual(KR.plan(1, 2, 3, 99).keys, KR.plan(1, 3, 3, 99).keys, 'levels differ for the same seed');
  // World 1 teaches the big keys: Space hops gaps, ↑ climbs a step, ↓ slides under a bar.
  const w1 = KR.create(KR.plan(0, 3, 3, 5), 5);
  const kinds = new Set(w1.stones.filter(KR.isKeyStone).map(s => s.code + ':' + s.kind));
  assert.deepEqual([...kinds].sort(), ['ArrowDown:slide', 'ArrowUp:climb', 'Space:hop']);
  for (let i = 1; i < w1.stones.length; i++) {
    const s = w1.stones[i], prev = w1.stones[i - 1];
    if (s.kind === 'climb') assert.ok(s.y < prev.y, 'an ↑ stone is higher');
    if (s.kind === 'slide') assert.equal(s.x0, prev.x1, 'a ↓ bar has no gap');
  }
});

test('a typist finishes every level at every tier, with three stars when quick and sure', () => {
  for (const tier of [1, 2, 3, 4, 5]) {
    for (const [w, l] of allLevels()) {
      const plan = KR.plan(w, l, tier, 40 + w * 4 + l);
      const quick = play(plan, { seed: 3 + l });
      assert.ok(quick.done && !quick.over, `${plan.id} tier ${tier}: finished`);
      const r = KR.result(quick);
      assert.equal(r.hits, plan.keys.length);
      assert.equal(r.misses, 0);
      assert.equal(r.stops, 0, `${plan.id} tier ${tier}: a quick typist never has to stop`);
      assert.equal(KR.stars(r), 3, `${plan.id} tier ${tier}: ${r.time.toFixed(1)} s, par ${r.par}`);
      assert.ok(KR.outcome(r) > 0.95);
    }
  }
});

test('the easiest tier waits for a slow six-year-old and still gives every star', () => {
  for (const [w, l] of allLevels()) {
    const plan = KR.plan(w, l, 1, 900 + w + l);
    // One key every 2.5 s after it is shown: slower than the runner, so it stops at every edge.
    const slow = play(plan, { delay: 2.5 });
    assert.ok(slow.done, plan.id + ' finished');
    const r = KR.result(slow);
    assert.ok(r.stops >= plan.keys.length - 2, plan.id + ' waited at the edges');
    assert.equal(KR.stars(r), 3, plan.id + ': ' + r.time.toFixed(1) + ' s, par ' + r.par);
    // Even a very slow child with a few wrong keys finishes (one star at least).
    const slower = play(plan, { delay: 6, mistakes: 3 });
    assert.ok(slower.done, plan.id + ' finished slowly');
    assert.ok(KR.stars(KR.result(slower)) >= 1);
  }
  // At the top tier the same slow pace misses the time star: a real challenge.
  const top = KR.result(play(KR.plan(2, 2, 5, 1), { delay: 2.5 }));
  assert.equal(KR.stars(top), 2);
});

test('doing nothing never wins and nobody falls: the runner waits at the first edge', () => {
  for (const [w, l] of [[0, 0], [0, 1], [0, 2], [3, 2], [6, 3]]) {
    const world = KR.create(KR.plan(w, l, 3, 11), 11);
    for (let i = 0; i < 60 * 120; i++) { KR.step(world, DT); world.ev.length = 0; }
    assert.equal(world.done, false);
    assert.equal(world.r.phase, 'wait');
    assert.equal(world.on, 0);
    assert.equal(world.r.x, KR.trigger(world), 'it waits right at the edge');
    assert.equal(world.r.y, 0, 'it never falls');
    assert.equal(world.stops, 1, 'one stop, counted once');
    assert.equal(world.hits + world.misses, 0);
  }
});

test('type-ahead: correct keys queue up as far as the keycaps are shown, in order', () => {
  const plan = KR.plan(2, 3, 5, 21), w = KR.create(plan, 21);
  assert.equal(w.tune.ahead, 4);
  const keys = plan.keys;
  for (let i = 0; i < 4; i++) assert.equal(KR.press(w, keys[i]), 'hit', 'key ' + i);
  assert.equal(w.next, 5);
  assert.equal(KR.target(w), null, 'nothing more is shown yet');
  assert.equal(KR.press(w, keys[4]), 'ignore', 'a key for a hidden stone is ignored, not wrong');
  assert.equal(w.misses, 0);
  assert.equal(w.steps, 4, '+1 speed for every right key');
  // The runner now hops four stones without stopping; each hop shows one more stone.
  let acts = 0;
  for (let i = 0; i < 60 * 8 && acts < 4; i++) { KR.step(w, DT); acts += w.ev.filter(e => e.t === 'act').length; assert.ok(!w.ev.some(e => e.t === 'stop')); w.ev.length = 0; }
  assert.equal(acts, 4);
  assert.equal(w.stops, 0);
  // Out of order is wrong: the queue only takes the next key.
  const v = KR.create(plan, 21);
  const wrong = keys.find(c => c !== keys[0]);
  assert.equal(KR.press(v, wrong), 'wrong');
  assert.equal(v.next, 1);
  // Tier 1 shows one key at a time, so there is nothing to type ahead.
  const easy = KR.create(KR.plan(1, 0, 1, 3), 3);
  assert.equal(KR.press(easy, easy.stones[1].code), 'hit');
  assert.equal(KR.press(easy, easy.stones[2].code), 'ignore');
  // Pressed while waiting at the edge, the right key hops at once.
  const waiting = KR.create(KR.plan(1, 0, 1, 3), 3);
  while (waiting.r.phase !== 'wait') { KR.step(waiting, DT); waiting.ev.length = 0; }
  KR.press(waiting, waiting.stones[1].code);
  assert.equal(waiting.r.phase, 'act');
  assert.deepEqual(plain(waiting.ev.map(e => e.t)), ['hit', 'act']);
  assert.equal(KR.target(waiting), waiting.stones[2], 'the hop shows the next key');
});

test('wrong keys: a soft miss that never moves on; a speed step only at the top tiers; stops reset the speed', () => {
  for (const [tier, cost] of [[1, 0], [2, 0], [4, 1], [5, 1]]) {
    const plan = KR.plan(1, 2, tier, 8), w = KR.create(plan, 8);
    // Three right keys first (as the stones come into view), so there is speed to lose.
    for (let i = 0; i < 60 * 30 && !(w.hits === 3 && KR.target(w)); i++) {
      const t = KR.target(w);
      if (t && w.hits < 3) KR.press(w, t.code);
      KR.step(w, DT); w.ev.length = 0;
    }
    const before = w.steps, want = KR.target(w).code;
    const other = ['KeyF', 'KeyJ', 'KeyG', 'KeyH'].find(c => c !== want);
    assert.equal(KR.press(w, other), 'wrong');
    assert.equal(w.steps, Math.max(0, before - cost), 'tier ' + tier);
    assert.equal(w.combo, 0);
    assert.equal(w.misses, 1);
    assert.equal(KR.target(w).code, want, 'the same key is still wanted');
    const ev = w.ev.find(e => e.t === 'wrong');
    assert.equal(ev.code, other); assert.equal(ev.want, want);
    // Keys that are not game keys are ignored.
    assert.equal(KR.press(w, 'ShiftLeft'), 'ignore');
    assert.equal(KR.press(w, 'Escape'), 'ignore');
    assert.equal(w.misses, 1);
  }
  // A stop at an edge sets the "+1" speed back to the base speed.
  const plan = KR.plan(1, 0, 3, 4), w = KR.create(plan, 4);
  KR.press(w, plan.keys[0]); KR.press(w, plan.keys[1]);
  assert.equal(w.steps, 2);
  let stop = null;
  for (let i = 0; i < 60 * 20 && !stop; i++) { KR.step(w, DT); stop = w.ev.find(e => e.t === 'stop') || null; w.ev.length = 0; }
  assert.ok(stop);
  assert.equal(stop.lost, 2);
  assert.equal(w.steps, 0);
  assert.equal(w.stops, 1);
  // Number pad digits count as the number row.
  const digits = KR.plan(5, 0, 1, 2), d = KR.create(digits, 2);
  assert.equal(KR.press(d, 'Numpad' + digits.keys[0].slice(5)), 'hit');
});

test('the speed builds with every right key up to the tier\'s limit', () => {
  const plan = KR.plan(3, 2, 5, 31), w = KR.create(plan, 31);
  const speeds = [];
  for (let i = 0; i < 60 * 30 && !w.done; i++) {
    const t = KR.target(w);
    if (t) KR.press(w, t.code);
    KR.step(w, DT); w.ev.length = 0;
    if (i % 60 === 0) speeds.push(w.r.vel);
  }
  assert.ok(w.done);
  assert.ok(w.steps <= w.tune.maxSteps);
  assert.ok(Math.max(...speeds) > w.tune.speed * 1.5, 'it runs much faster than the base speed');
});

test('coins along the path, events carry positions, progress goes from 0 to 1', () => {
  const plan = KR.plan(2, 0, 2, 17), w = KR.create(plan, 17);
  assert.ok(w.coinsMade > 0);
  assert.equal(KR.progress(w), 0);
  const seen = new Set();
  for (let i = 0; i < 60 * 120 && !w.done; i++) {
    const t = KR.target(w);
    if (t) KR.press(w, t.code);
    KR.step(w, DT);
    for (const e of w.ev) { seen.add(e.t); assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), e.t); }
    w.ev.length = 0;
  }
  assert.equal(w.coins, w.coinsMade, 'every coin over a gap is collected on the hop');
  assert.equal(KR.progress(w), 1);
  for (const t of ['hit', 'act', 'land', 'coin', 'finish']) assert.ok(seen.has(t), t);
});

test('every key becomes the key to press once, in order', () => {
  const plan = KR.plan(1, 1, 3, 5), w = KR.create(plan, 5);
  const shown = [];
  const take = () => { if (KR.target(w) && shown[shown.length - 1] !== w.next) shown.push(w.next); w.ev.length = 0; };
  take();
  assert.deepEqual(shown, [1]);
  for (let i = 0; i < 60 * 60 && !w.done; i++) { const t = KR.target(w); if (t && i % 40 === 0) KR.press(w, t.code); KR.step(w, DT); take(); }
  assert.ok(w.done);
  assert.deepEqual(shown, plain(plan.keys.map((_, i) => i + 1)), 'one key after another, in order');
});

test('endless: keys from the opened worlds, a heart lost per long stop, three end the run, arrays stay small', () => {
  const plan = KR.endlessPlan(2, 3, 9), pool = new Set(plan.pool);
  assert.ok(pool.has('KeyF') && pool.has('KeyA') && !pool.has('KeyQ') && !pool.has('Space'));
  const w = KR.create(plan, 9);
  // Type 120 keys quickly: the run goes on and the stones behind are dropped.
  let typed = 0;
  for (let i = 0; i < 60 * 300 && typed < 120; i++) {
    const t = KR.target(w);
    if (t) { assert.ok(pool.has(t.code), t.code); KR.press(w, t.code); typed++; }
    KR.step(w, DT); w.ev.length = 0;
    assert.ok(w.stones.length < 40, 'bounded stones');
  }
  assert.equal(w.hits, 120);
  assert.equal(w.done, false);
  assert.ok(w.boost > 1, 'it gets faster');
  // Then stop typing: each stop longer than the grace costs a heart, the third ends it.
  const hearts = [];
  for (let i = 0; i < 60 * 60 && !w.done; i++) {
    KR.step(w, DT);
    for (const e of w.ev) if (e.t === 'heart') hearts.push(e.hearts);
    w.ev.length = 0;
    // After a heart is lost the child types one key, then stops again.
    if (w.r.lost && w.r.phase === 'wait') { const t = KR.target(w); if (t) KR.press(w, t.code); }
  }
  assert.deepEqual(hearts, [2, 1, 0]);
  assert.ok(w.done && w.over);
  const r = KR.result(w);
  assert.equal(r.kind, 'endless');
  assert.ok(KR.outcome(r) > 0.5);
  // A quick stop (within the grace) costs no heart.
  const v = KR.create(KR.endlessPlan(6, 1, 3), 3);
  while (v.r.phase !== 'wait') { KR.step(v, DT); v.ev.length = 0; }
  for (let i = 0; i < 60; i++) KR.step(v, DT);
  KR.press(v, KR.target(v).code);
  assert.equal(v.hearts, 3);
  assert.ok(KR.endlessPlan(6, 1, 3).pool.includes('Digit5') && KR.endlessPlan(6, 1, 3).pool.includes('Backquote'));
  // Nobody typing: every grace costs a heart, so a run left alone ends by itself.
  const idle = KR.create(KR.endlessPlan(3, 2, 5), 5);
  for (let i = 0; i < 60 * 60 && !idle.done; i++) { KR.step(idle, DT); idle.ev.length = 0; }
  assert.ok(idle.done && idle.over);
  assert.equal(idle.hearts, 0);
  assert.equal(idle.stops, 1, 'one long stop');
});

test('two-player race: each side types only its own half, on the same course', () => {
  const seed = 4242, left = KR.duoPlan(0, seed), right = KR.duoPlan(1, seed);
  assert.equal(left.id, 'duo'); assert.equal(left.keys.length, KR.DUO.keys); assert.equal(right.keys.length, KR.DUO.keys);
  assert.ok(left.keys.every(c => KR.sideOf(c) === 0));
  assert.ok(right.keys.every(c => KR.sideOf(c) === 1));
  const a = KR.create(left, seed), b = KR.create(right, seed);
  assert.deepEqual(a.stones.map(s => [s.x0, s.x1, s.y]), b.stones.map(s => [s.x0, s.x1, s.y]), 'the same stones and gaps');
  // Both finish when typing; a press for the other side is a wrong key for this one.
  assert.equal(KR.press(a, right.keys[0]), 'wrong');
  const pa = play(left, { seed }), pb = play(right, { seed, delay: 0.5 });
  assert.ok(pa.done && pb.done);
  assert.ok(pa.t < pb.t, 'the quicker typist arrives first');
});

test('stars and the DDA outcome follow accuracy and pace', () => {
  const base = { kind: 'level', hits: 20, misses: 0, stops: 0, time: 20, par: 30, acc: 1, tier: 3 };
  assert.equal(KR.stars(base), 3);
  assert.equal(KR.stars({ ...base, acc: 0.85 }), 2);
  assert.equal(KR.stars({ ...base, time: 40 }), 2);
  assert.equal(KR.stars({ ...base, acc: 0.5, time: 99 }), 1);
  assert.ok(KR.outcome(base) > KR.outcome({ ...base, acc: 0.7 }));
  assert.ok(KR.outcome(base) > KR.outcome({ ...base, time: 60 }));
  const value = KR.outcome({ ...base, acc: 0, time: 1e9 });
  assert.ok(value >= 0 && value <= 1);
});

test('saves: a fresh save, a round trip, and junk or the old 3D save load as a playable save', () => {
  const fresh = KR.freshSave();
  assert.equal(fresh.v, 2);
  assert.equal(fresh.stars.length, KR.WORLD_COUNT);
  assert.ok(fresh.stars.every(row => row.length === KR.LEVELS));
  assert.equal(fresh.label, 'both');
  const old3d = { v: 1, speed: 80, wins: 5, rebirths: 1, unlocked: 3, best: 80, shoe: 2, trail: 0, aura: 0, hat: 0, charm: 0,
    owned: { shoes: [1, 2] }, medals: {}, tower: {}, quality: 'low' };
  for (const junk of [null, undefined, 0, 'save', [], [1, 2], { v: 9 }, { v: 2, stars: 'lots' }, old3d, { v: 2, stars: [[9, -1, 2.5, '3']] }]) {
    const s = KR.loadSave(junk);
    assert.deepEqual(plain(s.stars), plain(fresh.stars.map((row, w) => junk && junk.v === 2 && Array.isArray(junk.stars) && w === 0 && Array.isArray(junk.stars[0]) ? [0, 0, 0, 0] : row)));
    assert.equal(s.v, 2);
    assert.equal(KR.total(s), 0);
  }
  const good = KR.freshSave();
  good.stars[0] = [3, 2, 1, 3]; good.stars[1] = [1, 1, 1, 1]; good.best[0] = [215, 199, 302, 251];
  good.endless = 77; good.label = 'ar'; good.color = 1; good.hat = 2; good.seen = 4; good.coach = true;
  const back = KR.loadSave(JSON.parse(JSON.stringify(good)));
  assert.deepEqual(plain(back), plain(good));
  // Each field on its own: wrong types, out of range, locked items, best times without stars.
  const odd = KR.loadSave({ ...good, label: 'fr', color: 7, hat: 99, seen: 999, coach: 'yes', endless: -5, best: [[0, 'x', 1e9, 10]], stars: [[0, 2, 2, 2]] });
  assert.equal(odd.label, 'both');
  assert.equal(odd.color, 0, 'a colour the stars do not unlock yet');
  assert.equal(odd.hat, 0);
  assert.equal(odd.seen, 0);
  assert.equal(odd.coach, false);
  assert.equal(odd.endless, 0);
  assert.deepEqual(plain(odd.best[0]), [0, 0, 0, 10]);
});

test('worlds open in order, levels one by one, endless after world 2, items by stars', () => {
  const s = KR.freshSave();
  assert.ok(KR.worldOpen(s, 0) && !KR.worldOpen(s, 1));
  assert.ok(KR.isOpen(s, 0, 0) && !KR.isOpen(s, 0, 1));
  assert.deepEqual(plain(KR.nextLevel(s)), { w: 0, l: 0 });
  s.stars[0] = [1, 1, 1, 0];
  assert.ok(KR.isOpen(s, 0, 3) && !KR.worldOpen(s, 1));
  s.stars[0][3] = 1;
  assert.ok(KR.worldOpen(s, 1));
  assert.deepEqual(plain(KR.nextLevel(s)), { w: 1, l: 0 });
  assert.equal(KR.endlessOpen(s), false);
  s.stars[1] = [2, 2, 2, 2];
  assert.equal(KR.endlessOpen(s), true);
  assert.equal(KR.topWorld(s), 2);
  for (let w = 0; w < KR.WORLD_COUNT; w++) s.stars[w] = [3, 3, 3, 3];
  assert.equal(KR.total(s), KR.MAX_STARS);
  assert.deepEqual(plain(KR.nextLevel(s)), { w: KR.WORLD_COUNT - 1, l: KR.LEVELS - 1 });
  assert.equal(KR.COLORS[0].need, 0); assert.equal(KR.HATS[0].need, 0);
  assert.ok(KR.COLORS.every(c => c.need <= KR.MAX_STARS) && KR.HATS.every(h => h.need <= KR.MAX_STARS));
  assert.deepEqual(plain(KR.unlocks(0, 3)), [{ type: 'color', i: 1 }, { type: 'hat', i: 1 }]);
  assert.deepEqual(plain(KR.unlocks(3, 3)), []);
});
