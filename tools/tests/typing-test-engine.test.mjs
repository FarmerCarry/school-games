// Lightning Fingers engine (games/typing-test/engine.js + words.js): the school keyboard
// table, forgiving key matching, word locking, mistakes without Backspace, class-challenge
// codes, the speed-test formulas, saves, and every level played by scripted typists.
// Node only, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(repo, 'games/typing-test');
const engineSource = fs.readFileSync(path.join(dir, 'engine.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(dir, 'words.js'), 'utf8'), sandbox);
vm.runInNewContext(engineSource, sandbox);
const TT = sandbox.window.TT, WORDS = sandbox.window.TT_WORDS;
const DT = 1 / 60;
const ID = /^[A-Za-z][A-Za-z0-9_:.-]{0,23}$/;
const plain = v => JSON.parse(JSON.stringify(v));
const key = (k, code, shift = false) => ({ key: k, code, shift });

// A scripted typist: reacts `react` s after a cloud can be typed, then presses the right key
// every 1/cps s; `err` is the share of presses that hit a wrong key first.
function play(lang, w, l, tier, { cps = 1, react = 1, err = 0, seed = 7, idle = false } = {}) {
  const world = TT.create(TT.plan(lang, w, l, tier), seed);
  const rr = TT.rng(seed + 99);
  let wait = react;
  const overlaps = [];
  for (let f = 0; f < 60 * 60 * 15 && !world.over; f++) {
    TT.step(world, DT);
    world.ev.length = 0;
    const live = world.clouds.filter(c => c.state !== 'zap');
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      if (Math.abs(live[i].x - live[j].x) < (live[i].w + live[j].w) / 2) overlaps.push([live[i].text, live[j].text]);
    }
    if (idle) continue;
    const n = TT.next(world);
    if (!n || !n.key) { wait = react; continue; }
    if ((wait -= DT) > 0) continue;
    const c = n.cloud;
    if (rr() < err) TT.key(world, lang === 'ar' ? key('ظ', 'Slash') : key('q', 'KeyQ'));
    if (c.text[c.typed] === 'ظ' || c.text[c.typed] === 'q') { /* the wrong key was right: fine */ }
    TT.key(world, TT.perfectKey(c.text, c.typed, lang));
    wait = c.state === 'zap' ? react : 1 / cps;
  }
  return { world, r: TT.result(world), overlaps };
}

test('the engine is pure: no Kit, no page, no timers, no unseeded randomness', () => {
  assert.ok(TT && TT.TUNE && TT.step && TT.key, 'loads with only { window: {} }');
  const code = engineSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bKit\b|\bdocument\b|setTimeout|setInterval|requestAnimationFrame|Math\.random|localStorage/);
});

test('the keyboard table is the school\'s Arabic 101 keyboard: 15 units a row, letters where they are printed', () => {
  for (const row of TT.ROWS) assert.equal(row.reduce((s, k) => s + k[1], 0), 15, 'every row is 15 key units wide');
  const K = TT.KEYS;
  const expect = { KeyQ: 'ض', KeyW: 'ص', KeyE: 'ث', KeyR: 'ق', KeyT: 'ف', KeyY: 'غ', KeyU: 'ع', KeyI: 'ه', KeyO: 'خ', KeyP: 'ح', BracketLeft: 'ج', BracketRight: 'د',
    KeyA: 'ش', KeyS: 'س', KeyD: 'ي', KeyF: 'ب', KeyG: 'ل', KeyH: 'ا', KeyJ: 'ت', KeyK: 'ن', KeyL: 'م', Semicolon: 'ك', Quote: 'ط',
    KeyZ: 'ئ', KeyX: 'ء', KeyC: 'ؤ', KeyV: 'ر', KeyB: 'لا', KeyN: 'ى', KeyM: 'ة', Comma: 'و', Period: 'ز', Slash: 'ظ', Backquote: 'ذ' };
  for (const [code, ar] of Object.entries(expect)) assert.equal(K[code].ar, ar, code);
  assert.deepEqual([K.KeyH.arS, K.KeyY.arS, K.KeyN.arS, K.KeyB.arS, K.KeyG.arS, K.KeyT.arS, K.Slash.arS], ['أ', 'إ', 'آ', 'لآ', 'لأ', 'لإ', '؟']);
  assert.deepEqual([K.Digit1.ar, K.Digit0.ar, K.Digit1.en, K.Digit1.enS], ['١', '٠', '1', '!']);
  for (const code of ['Space', 'ShiftLeft', 'ShiftRight', 'Backspace', 'Enter', 'Tab', 'CapsLock', 'KeyF', 'KeyJ']) assert.ok(K[code], code);
  // Keys never overlap and stay on the 1280 x 720 screen.
  const list = Object.values(K);
  for (const k of list) assert.ok(k.x >= 0 && k.x + k.w <= TT.W && k.y + k.h <= TT.H, k.code);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, a.code + ' / ' + b.code);
  }
});

test('every letter of every word list has a key on that keyboard, and none needs Shift', () => {
  for (const lang of TT.LANGS) {
    const all = [...WORDS[lang].w1.join(' ').split(' '), ...WORDS[lang].w2.split(/[\s|]+/), ...WORDS[lang].w3.split(/[\s|]+/),
      ...WORDS[lang].w4.split(/[\s|]+/), ...WORDS[lang].w5.split('|'), ...WORDS[lang].test.split(' '), ...WORDS[lang].easy.split(' ')].filter(Boolean);
    for (const word of all) {
      assert.doesNotMatch(word, /[ً-ْـ]/, 'no tashkeel or tatweel: ' + word);
      for (let i = 0; i < word.length; i++) {
        const k = TT.nextKey(word, i, lang);
        assert.ok(k && TT.KEYS[k.code], `${lang} «${word}» letter ${i}`);
        assert.equal(k.shift, false, `${lang} «${word}» letter ${i} needs no Shift`);
        const ev = TT.perfectKey(word, i, lang);
        assert.ok(TT.match(word, i, ev, lang) > 0, `${lang} «${word}»: the lit key types letter ${i}`);
      }
    }
  }
  // Worlds 2 to 4 hold words of the right length; world 5 holds short phrases.
  const len = w => [...w].length;
  for (const lang of TT.LANGS) {
    for (const [world, ok] of [[1, n => n === 3], [2, n => n === 4], [3, n => n >= 5]]) {
      const p = TT.pool(lang, world, 0);
      for (const w of [...p.easy, ...p.hard]) assert.ok(ok(len(w)), `${lang} world ${world + 1}: ${w}`);
      assert.ok(p.easy.length >= 12 && p.hard.length >= 6, `${lang} world ${world + 1} has enough words`);
    }
    for (const p of [...TT.pool(lang, 4, 0).easy, ...TT.pool(lang, 4, 0).hard]) assert.ok(p.includes(' ') && p.split(' ').length <= 4, p);
    for (let l = 0; l < 3; l++) for (const c of TT.pool(lang, 0, l).easy) assert.equal(len(c), lang === 'ar' && c === 'لا' ? 2 : 1);
    for (const c of TT.pool(lang, 0, 3).easy) assert.equal(len(c), 2);
  }
});

test('every tuning knob moves one way from tier 1 to tier 5, in the direction that makes it harder', () => {
  for (const [name, row] of Object.entries(TT.TUNE)) {
    const dir = TT.HARDER[name];
    assert.ok(dir === 1 || dir === -1, name + ' has a direction');
    assert.equal(row.length, TT.TIERS, name);
    for (let i = 1; i < row.length; i++) assert.ok((row[i] - row[i - 1]) * dir >= 0, `${name} tier ${i + 1}: ${row}`);
    assert.notEqual(row[0], row[row.length - 1], name + ' changes between tier 1 and tier 5');
  }
  // The youngest tiers: clouds wait at the edge and a dotted line shows the key.
  assert.deepEqual(plain(TT.TUNE.wait), [1, 1, 0, 0, 0]);
  const p1 = TT.plan('ar', 1, 0, 1), p5 = TT.plan('ar', 1, 0, 5);
  assert.ok(p1.fall < p5.fall && p1.live < p5.live && p1.gap > p5.gap && p1.target < p5.target && p1.mix < p5.mix && p1.count < p5.count);
  assert.ok(p1.wait && !p5.wait && p1.guide && !p5.guide);
});

test('the first letter of a word in the sky locks onto that cloud (the one nearest the town first)', () => {
  const w = TT.create(TT.plan('en', 1, 0, 3), 5);
  w.queue = [];
  w.clouds = [
    { id: 1, text: 'cat', typed: 0, x: 200, y: 200, w: 170, state: 'fly', t: 0, shake: 0 },
    { id: 2, text: 'cow', typed: 0, x: 600, y: 260, w: 170, state: 'fly', t: 0, shake: 0 },
    { id: 3, text: 'dog', typed: 0, x: 1000, y: 300, w: 170, state: 'fly', t: 0, shake: 0 }
  ];
  assert.equal(TT.target(w).id, 3, 'before any key the cloud nearest the town is the one to type');
  assert.equal(TT.key(w, key('c', 'KeyC')), 1);
  assert.equal(w.lock, 2, 'of two words starting with c, the lower cloud is picked');
  assert.equal(TT.target(w).id, 2);
  assert.equal(TT.key(w, key('a', 'KeyA')), -1, 'cat\'s second letter is not cow\'s: a mistake, the lock stays');
  assert.equal(w.lock, 2);
  assert.equal(TT.key(w, key('o', 'KeyO')), 1);
  assert.equal(TT.key(w, key('w', 'KeyW')), 1);
  assert.equal(w.clouds.find(c => c.id === 2).state, 'zap', 'a finished word pops');
  assert.equal(w.lock, 0, 'and the next key may pick any cloud');
  assert.equal(TT.key(w, key('d', 'KeyD')), 1);
  assert.equal(w.lock, 3);
  assert.deepEqual([w.hits, w.errors, w.done], [4, 1, 1]);
});

test('a wrong key never needs Backspace: it shakes the cloud, counts for accuracy, and the right key carries on', () => {
  const w = TT.create(TT.plan('en', 1, 0, 2), 9);
  w.queue = [];
  w.clouds = [{ id: 1, text: 'sun', typed: 0, x: 600, y: 200, w: 170, state: 'fly', t: 0, shake: 0 }];
  assert.equal(TT.key(w, key('x', 'KeyX')), -1, 'with nothing locked, a letter no word starts with is a mistake');
  assert.ok(w.clouds[0].shake > 0, 'the cloud to type shakes');
  assert.equal(TT.key(w, key('s', 'KeyS')), 1);
  for (const ev of [key('Backspace', 'Backspace'), key('Shift', 'ShiftLeft'), key('Enter', 'Enter'), key('Escape', 'Escape'), key('Tab', 'Tab'), key('Dead', 'Quote'), key('F2', 'F2')]) {
    assert.equal(TT.key(w, ev), 0, ev.key + ' is ignored');
  }
  assert.equal(TT.key(w, key(' ', 'Space')), 0, 'a space between letters of a word costs nothing');
  assert.equal(TT.key(w, key('m', 'KeyM')), -1);
  assert.equal(w.clouds[0].typed, 1, 'a wrong key does not move on');
  assert.equal(TT.key(w, key('u', 'KeyU')), 1);
  assert.equal(TT.key(w, key('n', 'KeyN')), 1);
  const r = TT.result(w);
  assert.deepEqual([r.hits, r.errors, Math.round(r.acc * 100)], [3, 2, 60]);
  // In a phrase the space is a letter like the others.
  const p = TT.create(TT.plan('en', 4, 0, 2), 9);
  p.queue = [];
  p.clouds = [{ id: 1, text: 'a red hat', typed: 1, x: 600, y: 200, w: 300, state: 'fly', t: 0, shake: 0 }];
  p.lock = 1;
  assert.equal(TT.nextKey('a red hat', 1, 'en').code, 'Space');
  assert.equal(TT.key(p, key('r', 'KeyR')), -1, 'the space is needed');
  assert.equal(TT.key(p, key(' ', 'Space')), 1);
});

test('hamza forms and other look-alike letters are accepted both ways; Latin letters ignore case', () => {
  for (const [typed, target] of [['ا', 'أ'], ['ا', 'إ'], ['ا', 'آ'], ['أ', 'ا'], ['إ', 'ا'], ['ه', 'ة'], ['ة', 'ه'], ['ي', 'ى'], ['ي', 'ئ'], ['و', 'ؤ'], ['A', 'a'], ['a', 'A']]) {
    assert.ok(TT.same(typed, target), `${typed} for ${target}`);
  }
  for (const [typed, target] of [['ب', 'ت'], ['ء', 'ا'], ['ل', 'ا'], ['b', 'd']]) assert.equal(TT.same(typed, target), false, `${typed} is not ${target}`);
  assert.equal(TT.match('أسد', 0, key('ا', 'KeyH'), 'ar'), 1, 'plain alef types أ');
  assert.equal(TT.match('أسد', 0, key('أ', 'KeyH', true), 'ar'), 1, 'Shift+H types أ too');
  assert.deepEqual(plain(TT.nextKey('أسد', 0, 'ar')), { code: 'KeyH', shift: false }, 'أ lights the plain alef key, no Shift');
  assert.deepEqual(plain(TT.nextKey('إلى', 0, 'ar')), { code: 'KeyH', shift: false });
  assert.deepEqual(plain(TT.nextKey('cat', 0, 'en')), { code: 'KeyC', shift: false });
  assert.deepEqual(plain(TT.nextKey('Cat', 0, 'en')), { code: 'KeyC', shift: false }, 'capitals are typed without Shift (case is ignored)');
  assert.deepEqual(plain(TT.nextKey('why?', 3, 'en')), { code: 'Slash', shift: true }, 'a symbol on the upper half of a key lights Shift');
  assert.equal(TT.leftHand('KeyA'), true); assert.equal(TT.leftHand('Slash'), false);
  assert.equal(TT.match('cat', 0, key('C', 'KeyC', true), 'en'), 1, 'Caps Lock or Shift never blocks a child');
});

test('the B key\'s «لا» types a lam-alef pair, in any of its forms', () => {
  assert.deepEqual(plain(TT.nextKey('لاعب', 0, 'ar')), { code: 'KeyB', shift: false }, 'a lam before an alef lights B, printed «لا»');
  assert.deepEqual(plain(TT.nextKey('لون', 0, 'ar')), { code: 'KeyG', shift: false }, 'a lam on its own is G');
  assert.equal(TT.match('لاعب', 0, key('لا', 'KeyB'), 'ar'), 2);
  assert.equal(TT.match('لاعب', 0, key('ﻻ', 'KeyB'), 'ar'), 2, 'one presentation-form glyph counts as ل + ا');
  assert.equal(TT.match('لأن', 0, key('لأ', 'KeyG', true), 'ar'), 2);
  assert.equal(TT.match('سلام', 1, key('لا', 'KeyB'), 'ar'), 2);
  assert.equal(TT.match('لاعب', 0, key('ل', 'KeyG'), 'ar'), 1, 'G then H also types it');
  assert.equal(TT.match('لون', 0, key('لا', 'KeyB'), 'ar'), 0, 'B where a lam stands alone is a wrong key');
  assert.equal(TT.match('ل', 0, key('لا', 'KeyB'), 'ar'), 0, 'two letters never fit one');
  const w = TT.create(TT.plan('ar', 0, 3, 1), 3);
  w.queue = [];
  w.clouds = [{ id: 1, text: 'لا', typed: 0, x: 600, y: 200, w: 160, state: 'wait', t: 0, shake: 0 }];
  assert.equal(TT.key(w, key('لا', 'KeyB')), 2);
  assert.equal(w.done, 1, 'one press pops «لا»');
});

test('a key still counts when the PC\'s input language does not fit the word (mapped through the key table)', () => {
  // English input language, Arabic word: the physical keys count.
  assert.equal(TT.match('قطة', 0, key('r', 'KeyR'), 'ar'), 1);
  assert.equal(TT.match('قطة', 1, key('\'', 'Quote'), 'ar'), 1);
  assert.equal(TT.match('قطة', 2, key('m', 'KeyM'), 'ar'), 1);
  assert.equal(TT.match('كلب', 0, key(';', 'Semicolon'), 'ar'), 1);
  assert.equal(TT.match('ورد', 0, key(',', 'Comma'), 'ar'), 1);
  assert.equal(TT.match('لاعب', 0, key('b', 'KeyB'), 'ar'), 2, 'English B on an Arabic word is «لا»');
  assert.equal(TT.match('أسد', 0, key('H', 'KeyH', true), 'ar'), 1);
  // Arabic input language, English word.
  assert.equal(TT.match('cat', 0, key('ؤ', 'KeyC'), 'en'), 1);
  assert.equal(TT.match('cat', 1, key('ش', 'KeyA'), 'en'), 1);
  assert.equal(TT.match('bus', 0, key('لا', 'KeyB'), 'en'), 1);
  // A real Arabic letter on the wrong key is still wrong.
  assert.equal(TT.match('قطة', 0, key('ف', 'KeyT'), 'ar'), 0);
  assert.equal(TT.match('cat', 0, key('d', 'KeyD'), 'en'), 0);
  // Synthetic events without a key are read from the code.
  assert.equal(TT.match('قطة', 0, { code: 'KeyR' }, 'ar'), 1);
});

test('a class code means the same words on every PC; codes are checked', () => {
  const a = TT.parseCode('3417'), b = TT.parseCode('٣٤١٧'), c = TT.parseCode('3418');
  assert.deepEqual(plain(a), { code: '3417', preset: 3, lang: 'ar', dur: 30, kind: 'test', seed: TT.mixSeed(3417 + 7919) });
  assert.deepEqual(plain(b), plain(a), 'Arabic-Indic digits are the same code');
  const words = code => { const p = TT.parseCode(code); return TT.wordGen(p.lang, p.kind, p.seed).take(60); };
  assert.deepEqual(plain(words('3417')), plain(words('3417')));
  assert.notDeepEqual(plain(words('3417')), plain(words('3418')));
  assert.equal(c.lang, 'ar');
  // Pinned: this exact code gives these first words with this version of the word lists.
  assert.deepEqual(plain(words('1234').slice(0, 3)), plain(TT.wordGen('en', 'test', TT.mixSeed(1234 + 7919)).take(3)));
  assert.equal(TT.mixSeed(1), 920564995, 'the seed mixer is unchanged (the previous version\'s formula)');
  for (const bad of ['', '123', '12345', '0123', '7123', '8000', '9999', 'abcd', null, undefined, '12a4']) assert.equal(TT.parseCode(bad), null, String(bad));
  assert.equal(TT.makeCode(2, 7), '2007');
  assert.equal(TT.makeCode(6, 999), '6999');
  for (const n of Object.keys(TT.PRESETS)) { const p = TT.parseCode(TT.makeCode(+n, 512)); assert.ok(p && p.dur >= 30 && TT.LANGS.includes(p.lang)); }
  // A test made from a code starts with its words; no word repeats within five.
  const t = TT.test({ lang: 'en', dur: 30, kind: 'test', seed: a.seed });
  for (let i = 5; i < t.words.length; i++) assert.ok(!t.words.slice(i - 5, i).includes(t.words[i]) || new Set(t.words).size < 6, 'no word again within five');
});

test('the speed test uses Monkeytype\'s formulas: (letters of correct words + spaces) / 5 per minute, accuracy = right keys / all keys', () => {
  const cc = TT.countChars(['cat', 'dog', 'su'], ['cat', 'dog', 'sun']);
  assert.deepEqual(plain(cc), { correctWordChars: 8, allCorrectChars: 8, incorrectChars: 0, extraChars: 0, missedChars: 0, spaces: 2, correctSpaces: 2 });
  const wr = TT.wpmRaw(cc, 30, 3);
  assert.equal(wr.wpm, TT.roundTo2((8 + 2) * 60 / 30 / 5));
  assert.equal(wr.raw, TT.roundTo2((8 + 2 + 3) * 60 / 30 / 5));
  // Monkeytype's rules for a wrong word and an unfinished one.
  const bad = TT.countChars(['cat', 'dxg', 'sunny', ''], ['cat', 'dog', 'sun', 'bee']);
  assert.deepEqual([bad.correctWordChars, bad.incorrectChars, bad.extraChars, bad.correctSpaces, bad.spaces], [3, 1, 2, 1, 3]);
  // A whole 30 s test typed by a steady typist: 3 keys a second, one wrong key.
  const s = TT.test({ lang: 'en', dur: 30, kind: 'test', seed: 42 });
  let typedChars = 0, spaces = 0, wrong = 0;
  for (let f = 0; f < 60 * 40 && !s.over; f++) {
    if (f % 20 === 0) {
      const word = TT.testWord(s);
      if (f === 100) { assert.equal(TT.testKey(s, key('Z', 'KeyZ')), -1); wrong++; }
      if (s.ci >= word.length) { TT.testKey(s, key(' ', 'Space')); spaces++; }
      else { TT.testKey(s, TT.perfectKey(word, s.ci, 'en')); typedChars++; }
    }
    TT.testStep(s, DT);
  }
  assert.ok(s.over && s.t === 30, 'the test stops at exactly 30 s');
  const r = TT.testResult(s);
  // Every letter typed is in a correct word (wrong keys never enter the text).
  assert.equal(r.wpm, TT.roundTo2((typedChars + spaces) * 60 / 30 / 5));
  assert.equal(r.acc, TT.roundTo2((typedChars + spaces) / (typedChars + spaces + wrong) * 100));
  assert.ok(r.wpm > 30 && r.wpm < 40, 'about 36 wpm at 3 keys a second: ' + r.wpm);
  assert.equal(r.animal, TT.animal(r.wpm));
  // The clock starts with the first key; keys after the end do nothing.
  const idle = TT.test({ lang: 'ar', dur: 60, kind: 'easy', seed: 1 });
  for (let f = 0; f < 600; f++) TT.testStep(idle, DT);
  assert.equal(idle.t, 0); assert.equal(idle.started, false);
  assert.equal(TT.testKey(s, key('a', 'KeyA')), 0, 'a finished test takes no keys');
  // A space in the middle of a word is a wrong key, not a skip.
  const sp = TT.test({ lang: 'en', dur: 30, kind: 'test', seed: 3 });
  TT.testKey(sp, TT.perfectKey(TT.testWord(sp), 0, 'en'));
  assert.equal(TT.testKey(sp, key(' ', 'Space')), -1);
  assert.equal(sp.wi, 0);
});

test('stars: finishing earns one, 90 % accuracy a second, the tier\'s speed the third; DDA outcomes stay in 0..1', () => {
  const r = (o) => Object.assign({ won: true, acc: 1, wpm: 20, target: 10, suns: 3, done: 10, total: 10 }, o);
  assert.equal(TT.stars(r({ won: false })), 0);
  assert.equal(TT.stars(r({ acc: 0.8 })), 1);
  assert.equal(TT.stars(r({ acc: 0.8, wpm: 99 })), 1, 'speed without accuracy is not enough');
  assert.equal(TT.stars(r({ acc: 0.95, wpm: 5 })), 2);
  assert.equal(TT.stars(r({ acc: 0.9, wpm: 10 })), 3);
  for (const o of [{}, { won: false, done: 0 }, { won: false, done: 9 }, { acc: 0, wpm: 0, suns: 1 }, { acc: 1, wpm: 1000 }]) {
    const x = TT.outcome(r(o));
    assert.ok(x >= 0 && x <= 1, JSON.stringify(o) + ' -> ' + x);
  }
  assert.ok(TT.outcome(r({})) > TT.outcome(r({ acc: 0.8, wpm: 5 })), 'better play, higher outcome');
  assert.ok(TT.outcome(r({ won: false, done: 2 })) < 0.3, 'a rained-out level is a poor try');
  assert.deepEqual(plain(TT.ANIMALS), ['snail', 'turtle', 'rabbit', 'horse', 'cheetah', 'rocket']);
  assert.deepEqual([0, 3.9, 4, 10, 20, 25, 40].map(TT.animal), [0, 0, 1, 2, 3, 4, 5]);
});

test('every level of both languages is won by a slow typist at tier 1 and a quick one at tier 5', () => {
  for (const lang of TT.LANGS) for (let w = 0; w < TT.WORLDS; w++) for (let l = 0; l < TT.LEVELS; l++) {
    const id = TT.roundId(lang, w, l);
    assert.match(id, ID); assert.doesNotMatch(id, /\d{3}/);
    // A six-year-old finding each key: half a key a second, two seconds to start a word.
    const slow = play(lang, w, l, 1, { cps: 0.5, react: 2, seed: 11 + w * 7 + l });
    assert.ok(slow.r.won, `${id} tier 1 slow typist wins`);
    assert.equal(slow.r.suns, 3, `${id} tier 1: clouds wait at the edge, no sun is lost`);
    assert.equal(slow.r.done, slow.r.total);
    assert.ok(TT.stars(slow.r) === 3, `${id} tier 1: steady and accurate earns three stars (${slow.r.wpm} / ${slow.r.target})`);
    // A ten-year-old who types well: three keys a second.
    const quick = play(lang, w, l, 5, { cps: 3, react: 0.5, seed: 5 + w * 3 + l });
    assert.ok(quick.r.won, `${id} tier 5 quick typist wins`);
    assert.ok(TT.stars(quick.r) >= 2, `${id} tier 5 quick typist earns stars`);
    assert.deepEqual(slow.overlaps.concat(quick.overlaps), [], `${id}: clouds never overlap`);
  }
});

test('mistakes cost a star, not the level; a typist who does nothing never wins', () => {
  const sloppy = play('ar', 1, 0, 1, { cps: 0.6, react: 1.5, err: 0.3, seed: 4 });
  assert.ok(sloppy.r.won && sloppy.r.errors > 0 && TT.stars(sloppy.r) === 1, 'many wrong keys: still finished, one star');
  for (const lang of TT.LANGS) {
    const waiting = play(lang, 1, 0, 1, { idle: true });
    assert.equal(waiting.world.over, false, 'at tier 1 the clouds simply wait');
    assert.equal(waiting.r.suns, 3);
    assert.ok(waiting.world.clouds.every(c => c.state === 'wait'));
    const rained = play(lang, 2, 1, 5, { idle: true });
    assert.ok(rained.world.over && !rained.world.won && rained.r.suns === 0, 'at tier 5 doing nothing loses the suns');
    assert.equal(TT.stars(rained.r), 0);
  }
  // At the top tier, a typist who is far too slow does not win.
  const tooSlow = play('en', 3, 3, 5, { cps: 0.4, react: 2 });
  assert.equal(tooSlow.r.won, false);
});

test('saves: old, damaged or hand-edited saves load as fresh playable ones; tests and bests are kept tidy', () => {
  const fresh = plain(TT.freshSave());
  for (const junk of [null, undefined, 0, 'x', [], [1, 2], { v: 1 }, { stars: 'lots' }, { lang: 'fr', stars: { ar: 'x', en: [[9, -1, 2.5, '3']] } },
    // the previous version's keys never reach this one, but a stray copy must not break it
    { lang: 'en', mode: 'time', amt: 30, lenient: true }]) {
    const s = plain(TT.loadSave(junk));
    assert.deepEqual(Object.keys(s).sort(), Object.keys(fresh).sort());
    assert.equal(s.v, 2);
    for (const lang of TT.LANGS) assert.ok(s.stars[lang].length === 5 && s.stars[lang].every(r => r.length === 4 && r.every(v => [0, 1, 2, 3].includes(v))));
  }
  assert.equal(TT.loadSave({ lang: 'en' }).lang, 'en');
  const kept = TT.loadSave({ lang: 'ar', coach: true, tlang: 'en', tdur: 60, stars: { ar: [[3, 2, 1, 0]], en: [] }, best: { ar30: 22.456, en60: -3, ar60: 'x', en30: 1e9 },
    tests: [{ k: 'ar30', w: 12, a: 95 }, { k: 'zz', w: 1, a: 1 }, { k: 'en60', w: 30, a: 200 }, null, { k: 'en30', w: 18.5, a: 90, c: 1 }] });
  assert.deepEqual(plain(kept.stars.ar[0]), [3, 2, 1, 0]);
  assert.deepEqual(plain(kept.best), { ar30: 22.46, ar60: 0, en30: 0, en60: 0 });
  assert.deepEqual(plain(kept.tests), [{ k: 'ar30', w: 12, a: 95, c: 0 }, { k: 'en30', w: 18.5, a: 90, c: 1 }]);
  assert.deepEqual([kept.coach, kept.tlang, kept.tdur], [true, 'en', 60]);
  // Bests and the list of the last 20 tests.
  const s = TT.freshSave();
  assert.equal(TT.addTest(s, 'en', 30, { wpm: 10, acc: 90 }, false), true, 'a first result is a best');
  assert.equal(TT.addTest(s, 'en', 30, { wpm: 9, acc: 99 }, false), false);
  assert.equal(TT.addTest(s, 'en', 30, { wpm: 12.345, acc: 99 }, true), true);
  assert.equal(TT.addTest(s, 'en', 30, { wpm: 0, acc: 0 }, false), false);
  assert.equal(s.best.en30, 12.35);
  for (let i = 0; i < 30; i++) TT.addTest(s, 'ar', 60, { wpm: i, acc: 100 }, false);
  assert.equal(s.tests.length, 20);
  assert.equal(TT.addTest(s, 'fr', 30, { wpm: 99, acc: 1 }, false), false);
});

test('levels unlock in order; a world opens when the one before is done, or at once after three stars on its first level', () => {
  const s = TT.freshSave();
  assert.deepEqual(plain(TT.nextLevel(s, 'ar')), { w: 0, l: 0 });
  assert.equal(TT.isOpen(s, 'ar', 0, 1), false);
  assert.equal(TT.worldOpen(s, 'ar', 1), false);
  s.stars.ar[0][0] = 2;
  assert.equal(TT.isOpen(s, 'ar', 0, 1), true);
  assert.equal(TT.worldOpen(s, 'ar', 1), false, 'two stars on the first level open the next level only');
  s.stars.ar[0][0] = 3;
  assert.equal(TT.worldOpen(s, 'ar', 1), true, 'three stars let an expert skip ahead');
  assert.equal(TT.worldOpen(s, 'en', 1), false, 'each language has its own path');
  s.stars.en[0] = [1, 1, 1, 1];
  assert.equal(TT.worldOpen(s, 'en', 1), true);
  assert.deepEqual(plain(TT.nextLevel(s, 'en')), { w: 1, l: 0 });
  assert.equal(TT.total(s, 'en'), 4);
  assert.equal(TT.total(s), 7);
});
