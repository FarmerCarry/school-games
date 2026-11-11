// Keyboard Obby engine (games/keyboard-obby/engine.js): the keyboard table against the
// school's Dell Arabic 101 layout, every level's course, hops, wrong keys, the type-ahead
// queue, crumbly and sinking keys, bumper bars, the rising jelly, checkpoints, stars, DDA
// outcomes, the shop and saves, played by scripted typists. Node only, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(repo, 'games/keyboard-obby/engine.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const KO = sandbox.window.KO;
const krBox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(repo, 'games/key-runner/engine.js'), 'utf8'), krBox);
const KR = krBox.window.KR;
const DT = 1 / 60;
const plain = v => JSON.parse(JSON.stringify(v));
const LEVELS = KO.WORLDS.flatMap((W, w) => W.levels.map((spec, l) => ({ w, l, spec })));

// Steps the course, collecting events; act(w, events) runs before each step.
function run(w, steps, act) {
  const events = [];
  for (let i = 0; i < steps && !w.done; i++) {
    if (act) act(w, events);
    KO.step(w, DT);
    for (const e of w.ev) events.push({ ...e, at: w.t });
    w.ev.length = 0;
  }
  return events;
}
// A scripted typist: presses the next key `delay` seconds after the last one, whenever the
// hero stands with nothing queued (a six-year-old hunting for each key, or an expert).
function typist(L, tier, delay, max = 60 * 900) {
  const w = KO.create(L, { tier });
  let wait = 0;
  const events = run(w, max, w => {
    wait -= DT;
    if (wait <= 0 && (w.hero.phase === 'stand' || w.hero.phase === 'oops') && !w.queue.length) {
      const code = KO.target(w);
      if (code) { assert.equal(KO.press(w, code), 'hop'); wait = delay; }
    }
  });
  return { w, events };
}
// A plain course for hazard tests: one path, chosen hazards, no randomness to fight.
function course(path, extra = {}) {
  return { w: 0, l: 0, id: 'test', lang: 'ar', name: '', path: KO.codes(path), words: [], start: 'Space', kind: {}, sinkPhase: {}, cps: [], coins: [], gems: [], bumpers: [], ...extra };
}

test('the engine is pure: no Kit, no page, no timers, no unseeded randomness', () => {
  assert.ok(KO && KO.step && KO.create && KO.level, 'loads with only { window: {} }');
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage/);
});

test('the keyboard table is the school Dell Arabic 101 keyboard, key for key (the same table as Key Runner)', () => {
  const main = KR.KEYS.filter(k => k.finger !== 9);
  assert.equal(KO.KEYS.length, main.length);
  KO.KEYS.forEach((k, i) => {
    const r = main[i];
    for (const f of ['code', 'lat', 'ar', 'finger', 'row', 'x', 'w', 'sym']) assert.equal(k[f], r[f], `${k.code}.${f}`);
  });
  // Every row is 15 keys wide, with the real stagger.
  for (let r = 0; r < 5; r++) {
    const row = KO.KEYS.filter(k => k.row === r);
    assert.equal(row.reduce((a, k) => a + k.w, 0), 15, `row ${r} width`);
  }
  assert.deepEqual(['KeyQ', 'KeyA', 'KeyZ'].map(c => KO.KEY[c].x), [1.5, 1.75, 2.25], 'the rows are staggered like the real keyboard');
  assert.equal(KO.KEY.Space.w, 6.25);
  assert.equal(KO.KEY.Space.x, 3.75);
  const ar = { KeyF: 'ب', KeyJ: 'ت', KeyH: 'ا', Semicolon: 'ك', Quote: 'ط', KeyB: 'لا', Backquote: 'ذ', BracketLeft: 'ج', BracketRight: 'د', Comma: 'و', Period: 'ز', Slash: 'ظ', KeyQ: 'ض', KeyM: 'ة' };
  for (const [code, letter] of Object.entries(ar)) assert.equal(KO.KEY[code].ar, letter, code);
  // The Arabic letters map back to their keys (لا is one key, so it is not a single letter).
  assert.equal(KO.AR_CODE['ب'], 'KeyF'); assert.equal(KO.AR_CODE['ك'], 'Semicolon'); assert.equal(KO.AR_CODE['لا'], undefined);
  assert.equal(KO.norm('Numpad7'), 'Digit7');
  assert.ok(KO.isGameKey('KeyA') && KO.isGameKey('Space') && KO.isGameKey('Digit0') && KO.isGameKey('Backquote'));
  for (const code of ['ShiftLeft', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'Backspace', 'CapsLock', 'Minus', 'F2']) assert.equal(KO.isGameKey(code), false, code);
  assert.equal(KO.label('KeyF', 'ar'), 'ب'); assert.equal(KO.label('KeyF', 'en'), 'F');
  assert.equal(KO.label('Digit4', 'ar'), '4', 'digits are Western digits in both languages');
  assert.equal(KO.label('Space', 'ar'), 'مسافة'); assert.equal(KO.label('Space', 'en'), 'مسافة', 'Space is «مسافة» in both languages');
  for (const k of ['Enter', 'ShiftLeft', 'Tab', 'CapsLock']) assert.equal(KO.label(k, 'en'), KO.KEY[k].lat, `${k} keeps its printed name`);
});

test('five worlds of five or six levels teach the home row, the top row, the bottom row, the digits, then everything', () => {
  assert.equal(KO.WORLD_COUNT, 5);
  KO.WORLDS.forEach(W => assert.ok(W.levels.length >= 5 && W.levels.length <= 6 && W.name));
  const rowsOf = L => new Set(L.path.map(c => KO.KEY[c].row));
  assert.deepEqual([...rowsOf(KO.level(0, 0, 'ar'))], [2], 'world 1 starts on the home row');
  assert.ok(rowsOf(KO.level(1, 4, 'ar')).has(1) && !rowsOf(KO.level(1, 4, 'ar')).has(3), 'world 2: the top row');
  assert.ok(rowsOf(KO.level(2, 3, 'ar')).has(3), 'world 3: the bottom row');
  assert.ok(KO.level(3, 3, 'ar').path.every(c => /^Digit/.test(c)), 'world 4: the number row');
  assert.ok(rowsOf(KO.level(4, 5, 'ar')).size >= 4, 'world 5: the whole keyboard');
  // The new keys of a level come first, each twice.
  const first = KO.level(0, 1, 'ar').path;
  assert.deepEqual(plain(first.slice(0, 4)), ['KeyD', 'KeyD', 'KeyK', 'KeyK']);
});

test('every level is a valid course in both languages, and the same course every time', () => {
  for (const { w, l, spec } of LEVELS) for (const lang of ['ar', 'en']) {
    const L = KO.level(w, l, lang), id = `${L.id} ${lang}`, n = L.path.length, last = L.path[n - 1];
    assert.deepEqual(plain(KO.level(w, l, lang)), plain(L), `${id}: deterministic`);
    assert.ok(n >= 8 && n <= 26, `${id}: ${n} keys`);
    for (const c of L.path) assert.ok(KO.isGameKey(c), `${id}: ${c} is a key of the game`);
    for (let i = 2; i < n; i++) assert.ok(!(L.path[i] === L.path[i - 1] && L.path[i] === L.path[i - 2]), `${id}: never three of a key in a row`);
    if (spec.keys && !spec.seq) {
      const pool = KO.codes(spec.keys);
      for (const c of L.path) assert.ok(pool.includes(c), `${id}: ${c} belongs to the level`);
      if (pool.length + KO.codes(spec.fresh).length <= n) for (const c of pool) assert.ok(L.path.includes(c), `${id}: uses ${c}`);
      if (spec.n) assert.equal(n, spec.n, `${id}: length`);
    }
    if (spec.words) {
      // The path spells the words of the language, with Space between them when asked.
      const text = L.path.map(c => c === 'Space' ? ' ' : lang === 'en' ? KO.KEY[c].lat : KO.KEY[c].ar).join('');
      assert.equal(text, spec.words[lang].join(spec.space ? ' ' : ''), `${id}: spells the words`);
      assert.equal(L.words.length, spec.words[lang].length);
      for (const word of spec.words[lang]) {
        assert.ok(KO.wordCodes(word, lang).every(Boolean), `${id}: ${word} is typed without Shift`);
        assert.ok(!word.includes('لا'), `${id}: ${word} has no لا (that pair is its own key)`);
      }
    }
    // Hazards sit on keys of the path, never on the goal or the start, never on a key
    // visited twice in a row; a sinking key never follows a crumbly or another sinking key.
    for (const [c, kind] of Object.entries(L.kind)) {
      assert.ok(['crumble', 'sink'].includes(kind), `${id}: ${kind}`);
      assert.ok(L.path.includes(c) && c !== last && c !== 'Space', `${id}: ${kind} key ${c}`);
      for (let i = 1; i < n; i++) assert.ok(!(L.path[i] === c && L.path[i - 1] === c), `${id}: ${c} twice in a row`);
    }
    for (let i = 1; i < n; i++) if (L.kind[L.path[i]] === 'sink') assert.ok(!L.kind[L.path[i - 1]], `${id}: step ${i} sinks right after a hazard`);
    assert.equal(Object.values(L.kind).filter(k => k === 'crumble').length, Math.min(spec.crumble || 0, Object.keys(L.kind).length), `${id}: crumbly keys`);
    // Checkpoints: in order, on plain keys, never the goal.
    L.cps.forEach((s, i) => {
      assert.ok(s >= 1 && s < n - 1, `${id}: checkpoint ${s}`);
      assert.ok(!L.kind[L.path[s]], `${id}: checkpoint on a plain key`);
      if (i) assert.ok(s > L.cps[i - 1]);
    });
    if (n >= 10) assert.ok(L.cps.length >= 1, `${id}: has a checkpoint`);
    assert.equal(L.coins.length, spec.coins || 0, `${id}: coins`);
    assert.equal(L.gems.length, spec.gems || 0, `${id}: gems`);
    for (const c of L.coins.concat(L.gems)) assert.ok(L.path.includes(c) && c !== last && c !== 'Space', `${id}: treasure on ${c}`);
    assert.equal(L.bumpers.length, spec.bump || 0, `${id}: bumper bars`);
    for (const b of L.bumpers) {
      assert.ok(b.row >= 0 && b.row <= 3, `${id}: never over the space row`);
      assert.ok(L.path.some(c => KO.KEY[c].row === b.row), `${id}: a bar sweeps a row of the path`);
    }
  }
});

test('the tuning gets harder from tier 1 to tier 5 in every knob, and the jelly speed can come from Kit.dda', () => {
  for (const [key, row] of Object.entries(KO.TUNE)) {
    assert.equal(row.length, KO.TIERS, key);
    const dir = KO.HARDER[key];
    assert.ok(dir === 1 || dir === -1, `${key} has a direction`);
    for (let i = 1; i < row.length; i++) assert.ok((row[i] - row[i - 1]) * dir >= 0, `${key} moves one way`);
    assert.ok((row[4] - row[0]) * dir > 0, `${key} tier 5 is harder than tier 1`);
  }
  assert.equal(KO.tuneAt({ tier: 9 }).tier, 1, 'an odd tier falls back to 1');
  assert.equal(KO.tuneAt({ tier: 3, rise: 0.05 }).rise, 0.05);
  assert.equal(KO.tuneAt({ tier: 3, rise: NaN }).rise, KO.TUNE.rise[2]);
  assert.equal(KO.TUNE.bump[0], 0, 'tier 1 bars sleep');
  assert.ok(KO.TUNE.deep[0] < -KO.JELLY_LOW, 'tier 1 sinking keys only bob above the jelly');
});

test('every level can be finished at every tier in both languages: an expert never falls, a six-year-old at tier 1 never falls', () => {
  for (const { w, l } of LEVELS) for (const lang of ['ar', 'en']) {
    const L = KO.level(w, l, lang);
    for (let tier = 1; tier <= 5; tier++) {
      const fast = typist(L, tier, 0.25);
      assert.ok(fast.w.done, `${L.id} ${lang} tier ${tier}: an expert finishes`);
      assert.equal(fast.w.falls, 0, `${L.id} ${lang} tier ${tier}: an expert stays out of the jelly`);
      assert.equal(fast.w.mistakes, 0);
      assert.equal(KO.stars(KO.result(fast.w)), 3, `${L.id} tier ${tier}: three stars for an expert`);
      const slow = typist(L, tier, 3);
      assert.ok(slow.w.done, `${L.id} ${lang} tier ${tier}: a slow typist finishes too (gentler hazards after falls)`);
    }
    const young = typist(L, 1, 4.5);
    assert.ok(young.w.done, `${L.id} ${lang}: finishes at tier 1`);
    assert.equal(young.w.falls, 0, `${L.id} ${lang}: tier 1 never drops a child who takes 4.5 s per key into the jelly`);
  }
});

test('a key press hops the hero onto that very key with an arc; a wrong key counts a mistake and only wobbles the hero', () => {
  const L = KO.level(0, 0, 'ar'), w = KO.create(L, { tier: 1 });
  assert.equal(KO.target(w), 'KeyF');
  assert.equal(w.hero.x, KO.KEY.Space.cx); assert.equal(w.hero.z, KO.KEY.Space.cz);
  // Keys that are not keys of the game do nothing at all.
  for (const code of ['ShiftLeft', 'Enter', 'Tab', 'Escape', 'ArrowUp']) assert.equal(KO.press(w, code), 'ignore');
  assert.equal(KO.press(w, 'KeyK'), 'wrong');
  assert.equal(w.mistakes, 1); assert.equal(w.hero.phase, 'oops'); assert.equal(w.next, 0);
  assert.equal(w.started, false, 'the clock waits for the first right key');
  run(w, 10);
  assert.equal(w.t, 0); assert.equal(w.hero.x, KO.KEY.Space.cx, 'the hero never hops for a wrong key');
  assert.equal(KO.press(w, 'KeyF'), 'hop');
  assert.equal(w.hero.phase, 'hop'); assert.equal(w.started, true);
  let top = 0;
  const ev = run(w, 60, w => { top = Math.max(top, w.hero.y); });
  assert.ok(top > 0.9, `an arc (${top})`);
  const land = ev.find(e => e.t === 'land');
  assert.ok(land && land.code === 'KeyF');
  assert.equal(w.hero.x, KO.KEY.KeyF.cx); assert.equal(w.hero.z, KO.KEY.KeyF.cz); assert.equal(w.hero.y, 0);
  assert.equal(w.at, 0); assert.equal(KO.target(w), L.path[1]);
  // The number pad's digits are the number row's.
  const d = KO.create(KO.level(3, 0, 'ar'), { tier: 1 });
  assert.equal(KO.press(d, 'Numpad4'), 'hop');
});

test('right keys typed ahead queue up (three at most) and the hero chains the hops', () => {
  const L = course('F J F J F J F J'), w = KO.create(L, { tier: 3 });
  assert.equal(KO.press(w, 'KeyF'), 'hop');
  assert.equal(KO.press(w, 'KeyJ'), 'hop');
  assert.equal(KO.press(w, 'KeyF'), 'hop');
  assert.equal(KO.press(w, 'KeyJ'), 'hop');
  assert.equal(KO.press(w, 'KeyF'), 'ignore', 'no more than three keys ahead');
  assert.equal(w.queue.length, 3); assert.equal(w.next, 4);
  const ev = run(w, 240);
  assert.deepEqual(plain(ev.filter(e => e.t === 'land').map(e => e.step)), [0, 1, 2, 3]);
  assert.ok(ev.filter(e => e.t === 'land').slice(0, 3).every(e => e.chain), 'each landing hops straight on');
  assert.equal(w.hops, 4);
});

test('the course ends on the goal key: done, and the hero cheers there', () => {
  const L = course('F J'), w = KO.create(L, { tier: 1 });
  KO.press(w, 'KeyF'); KO.press(w, 'KeyJ');
  const ev = run(w, 200);
  assert.ok(w.done); assert.ok(ev.some(e => e.t === 'finish'));
  assert.equal(w.hero.phase, 'win');
  assert.equal(KO.press(w, 'KeyF'), 'ignore');
  const r = KO.result(w);
  assert.equal(r.n, 2); assert.equal(r.mistakes, 0);
});

test('a crumbly key drops a while after a landing: a hero still on it splashes into the jelly and bounces back to the checkpoint', () => {
  const L = course('F J D K S L', { kind: { KeyD: 'crumble' }, cps: [1] }), w = KO.create(L, { tier: 1 });
  for (const c of ['KeyF', 'KeyJ', 'KeyD']) KO.press(w, c);
  let ev = run(w, 120);
  assert.equal(w.at, 2); assert.equal(w.cp, 1);
  assert.ok(ev.some(e => e.t === 'shake' && e.code === 'KeyD'));
  // Waiting on it: it holds for tune.crumble seconds, then drops.
  ev = run(w, Math.ceil(KO.TUNE.crumble[0] * 60) + 120);
  assert.ok(ev.some(e => e.t === 'crumble'));
  const fall = ev.find(e => e.t === 'fall');
  assert.equal(fall.cause, 'crumble');
  assert.ok(ev.some(e => e.t === 'splash'));
  assert.ok(ev.some(e => e.t === 'respawn' && e.code === 'KeyJ'), 'back on the checkpoint key');
  assert.equal(w.falls, 1); assert.equal(w.at, 1); assert.equal(w.next, 2); assert.equal(KO.target(w), 'KeyD');
  assert.equal(w.hero.phase, 'stand');
  // The key comes back for the next try.
  assert.equal(KO.press(w, 'KeyD'), 'hop');
  ev = run(w, 60);
  assert.ok(ev.some(e => e.t === 'land' && e.code === 'KeyD'));
  assert.equal(w.hero.y, 0);
  // Keys pressed during the splash are ignored, not mistakes.
  const w2 = KO.create(L, { tier: 1 });
  for (const c of ['KeyF', 'KeyJ', 'KeyD']) KO.press(w2, c);
  run(w2, 120 + Math.ceil(KO.TUNE.crumble[0] * 60) + 4);
  if (w2.hero.phase === 'fall' || w2.hero.phase === 'back') { assert.equal(KO.press(w2, 'KeyQ'), 'ignore'); assert.equal(w2.mistakes, 0); }
});

test('a crumbly key that is needed again comes back at once, even one that drops while the hero hops onto it', () => {
  const L = course('F D F D', { kind: { KeyD: 'crumble' } }), w = KO.create(L, { tier: 5 });
  KO.press(w, 'KeyF'); KO.press(w, 'KeyD');
  run(w, 70);
  assert.equal(w.at, 1);
  KO.press(w, 'KeyF');
  run(w, 40);
  run(w, Math.ceil(KO.TUNE.crumble[4] * 60) - 40);
  // D is about to drop: hop to it now; it must hold.
  KO.press(w, 'KeyD');
  const ev = run(w, 90);
  assert.ok(w.done, 'landed on the goal');
  assert.equal(w.falls, 0);
  assert.ok(!ev.some(e => e.t === 'fall'));
});

test('the jelly rises once the clock starts; touching the key tops splashes the hero back, and a checkpoint drains it', () => {
  const L = course('F J F J F J F J', { cps: [2] }), w = KO.create(L, { tier: 1, rise: 0.5 });
  run(w, 120);
  assert.equal(w.jelly, 0, 'the jelly waits for the first key');
  KO.press(w, 'KeyF');
  const ev = run(w, 200);
  assert.ok(ev.some(e => e.t === 'fall' && e.cause === 'jelly'));
  assert.ok(w.jelly <= 0.31 + 0.5 * 2, 'the jelly settles after a splash');
  assert.equal(w.at, -1, 'no checkpoint yet: back to the start');
  const w2 = KO.create(L, { tier: 1, rise: 0.2 });
  KO.press(w2, 'KeyF'); KO.press(w2, 'KeyJ');
  run(w2, 60);
  assert.ok(w2.jelly > 0.05);
  KO.press(w2, 'KeyF');
  const ev2 = run(w2, 40);
  assert.ok(ev2.some(e => e.t === 'checkpoint' && e.step === 2));
  assert.ok(w2.jelly < 0.05, 'a checkpoint drains the jelly');
});

test('a sinking key dives under the jelly and comes back; a hop to it waits until it is up, and tier 1 keys only bob', () => {
  const L = course('F J F J', { kind: { KeyJ: 'sink' }, sinkPhase: { KeyJ: 0.7 } }), w = KO.create(L, { tier: 3 });
  assert.ok(KO.keyY(w, 'KeyJ') < -1, 'diving at the start');
  KO.press(w, 'KeyF');
  run(w, 40);
  KO.press(w, 'KeyJ');
  const ev = run(w, 1);
  assert.equal(w.hero.phase, 'wait', 'waits for the key');
  const all = ev.concat(run(w, 60 * 8));
  assert.ok(all.some(e => e.t === 'land' && e.code === 'KeyJ'), 'hops once it is up');
  const landT = all.find(e => e.t === 'land' && e.code === 'KeyJ').at;
  assert.ok(landT > 1, 'after a wait');
  // Staying on it: it dives with the hero, who splashes back.
  const w2 = KO.create(L, { tier: 3 });
  KO.press(w2, 'KeyF'); run(w2, 40); KO.press(w2, 'KeyJ');
  const ev2 = run(w2, 60 * 14);
  assert.ok(ev2.some(e => e.t === 'fall' && e.cause === 'sink'));
  // Tier 1: the same key bobs and never drops the hero, however long the child stays.
  const w3 = KO.create(L, { tier: 1 });
  KO.press(w3, 'KeyF'); run(w3, 40); KO.press(w3, 'KeyJ');
  const ev3 = run(w3, 60 * 30);
  assert.ok(!ev3.some(e => e.t === 'fall'));
  assert.ok(ev3.some(e => e.t === 'land' && e.code === 'KeyJ'));
  assert.ok(KO.sinkWarn(w3, 'KeyJ') >= 0 && KO.sinkWarn(w3, 'KeyF') === 0);
});

test('a bumper bar bonks a hero standing in its row up into the air and back onto the same key; tier 1 bars sleep', () => {
  const L = course('F J D K', { bumpers: [{ row: 2, speed: 1, phase: 0 }] }), w = KO.create(L, { tier: 5 });
  KO.press(w, 'KeyF');
  const ev = run(w, 60 * 12);
  const bonk = ev.find(e => e.t === 'bonk');
  assert.ok(bonk, 'the bar reaches the hero');
  assert.ok(!ev.some(e => e.t === 'fall'), 'a bonk is no fall');
  assert.equal(w.at, 0, 'still on F');
  assert.ok(w.bonks >= 1);
  // Right after a bonk the bar passes under the hero.
  const after = ev.filter(e => e.t === 'bonk' && e.at > bonk.at && e.at < bonk.at + KO.BONK_T + 0.9);
  assert.equal(after.length, 0);
  const w1 = KO.create(L, { tier: 1 });
  KO.press(w1, 'KeyF');
  const ev1 = run(w1, 60 * 20);
  assert.ok(!ev1.some(e => e.t === 'bonk'));
  assert.ok(w1.bars.every(b => !b.on));
});

test('falling again and again from one checkpoint makes the hazards gentler for the rest of the level', () => {
  const L = course('F D J K', { kind: { KeyD: 'crumble' } }), w = KO.create(L, { tier: 4 });
  const ev = [];
  for (let k = 0; k < 3; k++) {
    KO.press(w, 'KeyF'); ev.push(...run(w, 40));
    KO.press(w, 'KeyD'); ev.push(...run(w, 60 * 6));
  }
  assert.ok(w.falls >= 3);
  assert.ok(ev.some(e => e.t === 'mercy'));
  assert.equal(w.tune.tier, 3);
  assert.equal(KO.result(w).tier, 4, 'the result keeps the tier the level began at');
});

test('stars: one for finishing, one for few wrong keys, one for the time; outcomes and payouts', () => {
  const r = { n: 16, time: 20, par: 30, mistakes: 0, falls: 0, coins: 3, gems: 1, acc: 1 };
  assert.equal(KO.stars(r), 3);
  assert.equal(KO.allowed(16), 2);
  assert.equal(KO.stars({ ...r, mistakes: 2 }), 3);
  assert.equal(KO.stars({ ...r, mistakes: 3 }), 2);
  assert.equal(KO.stars({ ...r, time: 31 }), 2);
  assert.equal(KO.stars({ ...r, time: 31, mistakes: 9 }), 1);
  assert.equal(KO.allowed(8), 1);
  assert.equal(KO.outcome(r), 1);
  const poor = KO.outcome({ ...r, acc: 0.5, time: 90, falls: 6 });
  assert.ok(poor > 0 && poor < 0.4, `${poor}`);
  assert.ok(KO.outcome({ ...r, falls: 2 }) < KO.outcome(r));
  assert.equal(KO.payout(r, 2), 3 + 5 + 6);
  // A real par: 3 s plus per-key seconds of the tier (and a little for each sinking key).
  const w = KO.create(KO.level(0, 0, 'ar'), { tier: 1 });
  assert.equal(w.par, Math.round((3 + 8 * KO.TUNE.par[0]) * 10) / 10);
  assert.ok(KO.create(KO.level(0, 0, 'ar'), { tier: 5 }).par < w.par);
});

test('coins and gems are picked up by landing on their key; a key with two coins needs two landings', () => {
  const L = course('F J F J', { coins: ['KeyF', 'KeyF'], gems: ['KeyJ'] }), w = KO.create(L, { tier: 1 });
  for (const c of ['KeyF', 'KeyJ', 'KeyF']) KO.press(w, c);
  const ev = run(w, 200);
  assert.equal(ev.filter(e => e.t === 'coin').length, 2);
  assert.equal(ev.filter(e => e.t === 'gem').length, 1);
  assert.equal(w.coins, 2); assert.equal(w.gems, 1);
  assert.equal(w.coinsLeft.KeyF, 0);
});

test('saves: a fresh save, every damaged or old save loads as a playable one, and a good save survives a round trip', () => {
  const fresh = KO.freshSave();
  assert.equal(fresh.v, 1); assert.equal(fresh.lang, 'ar');
  assert.equal(fresh.stars.length, 5); assert.deepEqual(plain(fresh.stars.map(r => r.length)), plain(KO.WORLDS.map(W => W.levels.length)));
  assert.equal(fresh.colors[0], true); assert.equal(fresh.hats[0], true); assert.equal(fresh.colors.filter(Boolean).length, 1);
  for (const bad of [null, undefined, 'save', 42, [], [1, 2], {}, { v: 2, coins: 50 }, { v: '1' }, { v: 0, stars: [[3]] }]) {
    assert.deepEqual(plain(KO.loadSave(bad)), plain(fresh), JSON.stringify(bad));
  }
  const odd = KO.loadSave({
    v: 1, lang: 'fr', stars: [[3, 9, -1, 2.5, '3', null, 2], 'x', [1]], best: [[120, 50, 50, 50, 50, 50], [0, 0], [99999999]],
    coins: -5, colors: [false, true, 'yes', true], hats: 'all', color: 2, hat: 3, coach: 'true', music: true, extra: { a: 1 }
  });
  assert.equal(odd.lang, 'ar');
  assert.deepEqual(plain(odd.stars[0]), [3, 0, 0, 0, 0, 0]);
  assert.deepEqual(plain(odd.stars[1]), [0, 0, 0, 0, 0, 0]);
  assert.equal(odd.stars[2][0], 1);
  assert.equal(odd.best[0][0], 120); assert.equal(odd.best[0][1], 0, 'no time without a star');
  assert.equal(odd.best[2][0], 0, 'an impossible time is dropped');
  assert.equal(odd.coins, 0);
  assert.deepEqual(plain(odd.colors.slice(0, 4)), [true, true, false, true], 'the first colour is always owned');
  assert.equal(odd.color, 0, 'a colour that is not owned is not worn');
  assert.equal(odd.hat, 0); assert.equal(odd.coach, false);
  assert.equal(odd.music, undefined, 'old keys are dropped');
  assert.equal(KO.loadSave({ v: 1, coins: 12.5 }).coins, 0);
  assert.equal(KO.loadSave({ v: 1, coins: 1e9 }).coins, 0);
  assert.equal(KO.loadSave({ v: 1, colors: [true, true], color: 1 }).color, 1);
  const good = KO.freshSave();
  good.lang = 'en'; good.stars[0] = [3, 2, 1, 0, 0, 0]; good.best[0] = [123, 456, 789, 0, 0, 0]; good.coins = 77; good.hats[4] = true; good.hat = 4; good.coach = true;
  assert.deepEqual(plain(KO.loadSave(plain(good))), plain(good));
});

test('levels open one after another; a finished level records stars, the best time and pays coins', () => {
  const s = KO.freshSave();
  assert.ok(KO.isOpen(s, 0, 0)); assert.ok(!KO.isOpen(s, 0, 1)); assert.ok(!KO.isOpen(s, 1, 0)); assert.ok(!KO.isOpen(s, 9, 0));
  assert.deepEqual(plain(KO.nextLevel(s)), { w: 0, l: 0 });
  const r = { n: 8, time: 20, par: 25, mistakes: 0, falls: 0, coins: 3, gems: 0, acc: 1 };
  const out = KO.apply(s, 0, 0, r);
  assert.equal(out.stars, 3); assert.equal(out.newStars, 3); assert.equal(out.opened, true);
  assert.equal(s.stars[0][0], 3); assert.equal(s.best[0][0], 200); assert.equal(s.coins, 3 + 9);
  assert.ok(KO.isOpen(s, 0, 1)); assert.deepEqual(plain(KO.nextLevel(s)), { w: 0, l: 1 });
  // A slower, worse run keeps the stars and the best time; replays still pay coins.
  const again = KO.apply(s, 0, 0, { ...r, time: 40, mistakes: 5 });
  assert.equal(again.stars, 1); assert.equal(again.newStars, 0); assert.equal(again.best, false);
  assert.equal(s.stars[0][0], 3); assert.equal(s.best[0][0], 200); assert.equal(s.coins, 12 + 3);
  const faster = KO.apply(s, 0, 0, { ...r, time: 15 });
  assert.equal(faster.best, true); assert.equal(faster.prevBest, 200); assert.equal(s.best[0][0], 150);
  // The last level of a world opens the next world.
  s.stars[0] = [1, 1, 1, 1, 1, 0];
  assert.ok(!KO.isOpen(s, 1, 0));
  KO.apply(s, 0, 5, r);
  assert.ok(KO.isOpen(s, 1, 0));
  assert.deepEqual(KO.after(4, KO.WORLDS[4].levels.length - 1), null);
  assert.equal(KO.MAX_STARS, KO.LEVEL_COUNT * 3);
});

test('the shop: coins buy colours and hats, owned items are worn for free, and a child without coins buys nothing', () => {
  const s = KO.freshSave();
  assert.equal(KO.buy(s, 'hat', 1), 'poor');
  assert.equal(s.hat, 0);
  s.coins = KO.HATS[1].cost + 3;
  assert.equal(KO.buy(s, 'hat', 1), 'buy');
  assert.equal(s.hat, 1); assert.equal(s.coins, 3); assert.equal(s.hats[1], true);
  assert.equal(KO.buy(s, 'hat', 0), 'wear');
  assert.equal(KO.buy(s, 'hat', 1), 'wear'); assert.equal(s.coins, 3);
  assert.equal(KO.buy(s, 'color', 99), 'poor');
  assert.equal(KO.buy(s, 'shoe', 1), 'poor');
  assert.ok(KO.COLORS.every((c, i) => i === 0 ? c.cost === 0 : c.cost > 0));
  // Enough coins in the game for most of the shop.
  const shop = KO.COLORS.concat(KO.HATS).reduce((a, x) => a + x.cost, 0);
  const coins = LEVELS.reduce((a, { w, l }) => { const L = KO.level(w, l, 'ar'); return a + L.coins.length + 5 * L.gems.length + 9; }, 0);
  assert.ok(coins >= shop * 0.6, `${coins} coins for a shop of ${shop}`);
});
