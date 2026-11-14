// Word Garden engine (games/word-garden/engine.js with words.js and art.js's picture table):
// the word lists, which letters go missing at each tier, the hamza / taa marbuta / alef
// maqsura rules, the «لا» key, whole levels typed by scripted children, the hint timer,
// stars, seeds, the garden shop and saves. Node only, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(repo, 'games/word-garden');
const sandbox = { window: {} };
// art.js only defines drawing functions while it loads (it never touches the page), so
// its picture table can be checked here too.
for (const file of ['words.js', 'engine.js', 'art.js']) vm.runInNewContext(fs.readFileSync(path.join(dir, file), 'utf8'), sandbox);
const WG = sandbox.window.WG, WORDS = sandbox.window.WG_WORDS, A = WG.art;
const plain = v => JSON.parse(JSON.stringify(v));
const DT = 1 / 60;
const LANGS = ['ar', 'en'];
const entries = (lang, w) => { const p = WG.pool(lang, w); return [...p.easy, ...p.hard]; };
// A Latin key event, as a PC set to English sends it (the game must map it by event.code).
const latin = (code, shift = false) => ({ key: WG.keyChar(code, shift, 'en'), code, shift });
// The same physical key on a PC set to Arabic.
const arabic = (code, shift = false) => ({ key: WG.keyChar(code, shift, 'ar'), code, shift });
// A level of chosen words: [text, gaps] pairs.
function levelOf(lang, tier, words, mode = 'first') {
  const plan = Object.assign(WG.plan(lang, 0, 0, tier), { mode });
  return WG.create(plan, 1, words.map(([text, gaps]) => WG.makeItem({ text, pic: 'cat' }, gaps, lang)));
}
// Types a whole level with the key the engine wants (in the given keyboard layout),
// stepping wait frames before each key; wrongEvery adds a wrong letter now and then.
function play(lv, { layout = latin, wait = 20, wrongEvery = 0, max = 60 * 600 } = {}) {
  const events = [];
  let n = 0;
  for (let i = 0; i < max && !lv.over; i++) {
    WG.step(lv, DT);
    const k = WG.need(lv);
    if (k && i % wait === 0) {
      n++;
      if (wrongEvery && n % wrongEvery === 0) WG.key(lv, layout(k.code === 'KeyX' ? 'KeyQ' : 'KeyX'));
      assert.ok(WG.key(lv, layout(k.code, k.shift)) > 0, `the lit key types ${WG.item(lv).text}[${WG.item(lv).pos}]`);
    }
    events.push(...lv.ev.map(e => e.t));
    lv.ev.length = 0;
  }
  return events;
}

test('every word is spelled with keys of the school keyboard, once, with a picture that exists and fits its world', () => {
  const MODS = ['', 'r', 'g', 'b', 'w', 's', 'B', 't'];
  const used = new Set();
  for (const lang of LANGS) {
    const seen = new Set();
    for (let w = 0; w < WG.WORLDS; w++) {
      const p = WG.pool(lang, w), all = [...p.easy, ...p.hard];
      assert.ok(p.easy.length >= 8, `${lang} world ${w + 1} has enough easy words for a level`);
      assert.ok(p.hard.length >= 6, `${lang} world ${w + 1} has harder words to mix in`);
      for (const e of all) {
        assert.ok(!seen.has(e.text), `${lang} «${e.text}» is listed once`);
        seen.add(e.text);
        assert.equal(e.text, e.text.trim());
        assert.ok(lang === 'ar' ? /^[ء-ي ]+$/.test(e.text) && !/[ً-ٟـ]/.test(e.text) : /^[a-z ]+$/.test(e.text), `«${e.text}» is plain ${lang} letters`);
        for (const c of e.text) if (c !== ' ') assert.ok(WG.keyFor(c, lang), `«${c}» of «${e.text}» is printed on a key`);
        assert.ok(A.hasPic(e.pic), `the picture «${e.pic}» of «${e.text}» exists`);
        assert.ok(MODS.includes(e.mod), `«${e.text}» has a known picture change`);
        used.add(e.pic);
        const theme = WORDS.worldThemes[w];
        if (theme) {
          assert.ok(WORDS.themes[theme].split(' ').includes(e.pic), `«${e.text}» (${e.pic}) belongs in the ${theme} world`);
          assert.equal(e.mod, '', 'only phrases change a picture');
          assert.ok(!e.text.includes(' '), 'worlds 1-4 have single words');
        } else assert.equal(WG.wordsOf(e.text).length, 2, `«${e.text}» is two words`);
        // Typed by physical key alone (Windows set to English), the whole text spells itself.
        const units = WG.units(e.text, lang);
        for (const u of units) {
          const k = WG.nextKey(e.text, u[0], lang, WG.rules(lang, 5));
          assert.ok(k, `a key types «${e.text}»[${u[0]}]`);
          assert.equal(WG.match(e.text, u[0], u[1], latin(k.code, k.shift), lang, WG.rules(lang, 5)), u[1] - u[0], `${k.code} types «${e.text.slice(u[0], u[1])}» in «${e.text}»`);
          assert.equal(WG.match(e.text, u[0], u[1], arabic(k.code, k.shift), lang, WG.rules(lang, 5)), u[1] - u[0], `${k.code} on an Arabic PC types «${e.text.slice(u[0], u[1])}»`);
        }
      }
    }
  }
  // Every picture of a theme is the picture of some word, and every drawn picture is used.
  const themed = Object.values(WORDS.themes).flatMap(s => s.split(' '));
  assert.equal(new Set(themed).size, themed.length, 'a picture is in one theme');
  for (const pic of themed) assert.ok(used.has(pic), `the ${pic} picture has a word`);
  assert.deepEqual(Object.keys(A.PICS).filter(id => !used.has(id)), [], 'no picture is drawn for nothing');
});

test('a lam and the alef after it are one piece: the «لا» key types both, and so do ل then ا', () => {
  assert.deepEqual(plain(WG.units('شلال', 'ar')), [[0, 1], [1, 3], [3, 4]]);
  assert.deepEqual(plain(WG.units('نجمة لامعة', 'ar')), [[0, 1], [1, 2], [2, 3], [3, 4], [5, 7], [7, 8], [8, 9], [9, 10]], 'spaces are never typed');
  assert.deepEqual(plain(WG.nextKey('شلال', 1, 'ar', {})), { code: 'KeyB', shift: false }, 'the B key is lit for «لا»');
  // Some PCs report the lam-alef key as one glyph, or report no letter at all for it.
  for (const ev of [latin('KeyB'), arabic('KeyB'), { key: 'ﻻ', code: 'KeyB' }, { key: '', code: 'KeyB' }, { key: 'Unidentified', code: 'KeyB' }]) {
    assert.equal(WG.match('شلال', 1, 3, ev, 'ar', {}), 2, `${ev.key} types both letters`);
  }
  assert.equal(WG.match('شلال', 1, 3, latin('KeyG'), 'ar', {}), 1, 'G types the lam');
  assert.equal(WG.match('شلال', 2, 3, latin('KeyH'), 'ar', {}), 1, 'then H the alef');
  assert.equal(WG.match('شلال', 3, 4, latin('KeyB'), 'ar', {}), 0, '«لا» never fits one letter');
  // With a hamza on the alef: the B key while the hamza rule is on, else Shift+G (printed «لأ»).
  assert.deepEqual(plain(WG.nextKey('ملأ', 1, 'ar', WG.rules('ar', 1))), { code: 'KeyB', shift: false });
  assert.deepEqual(plain(WG.nextKey('ملأ', 1, 'ar', WG.rules('ar', 5))), { code: 'KeyG', shift: true });
  assert.equal(WG.match('ملأ', 1, 3, latin('KeyG', true), 'ar', WG.rules('ar', 5)), 2);
  // A gap never splits the pair, in any mode.
  for (let seed = 1; seed < 300; seed++) {
    const r = WG.rng(seed);
    for (const [text, mode] of [['شلال', 'middle'], ['شلال', 'any'], ['شلال', 'two'], ['نجمة لامعة', 'p1'], ['نجمة لامعة', 'p2']]) {
      for (const g of WG.gaps(text, mode, 'ar', seed % 2 === 0, r)) {
        assert.ok(!(text[g[0] - 1] === 'ل' && text[g[0]] === 'ا') && !(text[g[1] - 1] === 'ل' && text[g[1]] === 'ا'), `${mode} gap ${g} keeps «لا» whole in «${text}»`);
      }
    }
  }
});

test('which letters go missing: first, last, middle, two, the whole word, phrases; young tiers choose plain letters and keep gaps apart', () => {
  const r = WG.rng(5), gaps = (text, mode, easy = false, lang = 'ar') => plain(WG.gaps(text, mode, lang, easy, r));
  assert.deepEqual(gaps('قطة', 'first'), [[0, 1]]);
  assert.deepEqual(gaps('قطة', 'last'), [[2, 3]]);
  assert.deepEqual(gaps('cat', 'first', false, 'en'), [[0, 1]]);
  assert.deepEqual(gaps('cat', 'last', false, 'en'), [[2, 3]]);
  assert.deepEqual(gaps('دب', 'middle'), [[1, 2]], 'a two-letter word has no middle: its last letter');
  assert.deepEqual(gaps('شجرة', 'whole'), [[0, 4]]);
  assert.deepEqual(gaps('كرة حمراء', 'pw'), [[0, 3], [4, 9]], 'a phrase is typed a word at a time');
  for (let i = 0; i < 200; i++) {
    const m = gaps('برتقالة', 'middle')[0];
    assert.ok(m[0] > 0 && m[1] < 7, 'a middle letter is never the first or the last');
    const e = gaps('برتقالة', 'ends')[0];
    assert.ok(e[0] === 0 || e[1] === 7, 'ends: the first or the last letter');
    assert.notEqual(gaps('بيضة', 'any', true)[0][0], 3, 'young tiers: not the taa marbuta when another letter can go');
    assert.notEqual(gaps('كمثرى', 'any', true)[0][0], 4, 'nor the alef maqsura');
    assert.notEqual(gaps('أرنب', 'any', true)[0][0], 0, 'nor a hamza');
    assert.deepEqual(gaps('فأر', 'middle', true), [[1, 2]], 'with nothing else to choose, the hamza still goes');
    const two = gaps('طاولة', 'two', true);
    assert.equal(two.length, 2);
    assert.ok(two[1][0] - two[0][1] >= 1, 'young tiers: two gaps never touch');
    assert.equal(gaps('كوب', 'two', true).length, 1, 'young tiers: a three-letter word keeps two letters');
    assert.equal(gaps('كوب', 'two', false).length, 2);
    const p2 = gaps('سمكة صغيرة', 'p2');
    assert.ok(p2[0][1] <= 4 && p2[1][0] >= 5, 'two gaps in a phrase: one in each word');
  }
  // Every word of every world, at every tier: gaps in reading order, inside the text, never a space.
  for (const lang of LANGS) for (let w = 0; w < WG.WORLDS; w++) for (let l = 0; l < WG.LEVELS; l++) for (let tier = 1; tier <= 5; tier++) {
    const lv = WG.create(WG.plan(lang, w, l, tier), w * 100 + l * 10 + tier);
    assert.equal(lv.total, WG.TUNE.words[tier - 1], 'the tier sets the words in a level');
    assert.equal(new Set(lv.items.map(it => it.text)).size, lv.total, 'no word twice in a level');
    for (const it of lv.items) {
      assert.ok(it.gaps.length >= 1);
      let end = 0;
      for (const g of it.gaps) {
        assert.ok(g[0] >= end && g[1] > g[0] && g[1] <= it.text.length, `${lang} ${w}-${l} «${it.text}» gap ${g}`);
        assert.ok(!it.text.slice(g[0], g[1]).includes(' '), 'a gap never holds a space');
        end = g[1];
      }
      assert.equal(it.pos, it.gaps[0][0]);
    }
  }
  // Each world ramps: which letters go missing in its six levels.
  assert.deepEqual(plain(WG.WORLD.map(x => x.modes)), [
    ['first', 'first', 'last', 'last', 'ends', 'ends'], ['middle', 'middle', 'middle', 'any', 'any', 'any'], ['two', 'two', 'two', 'two', 'two', 'two'],
    ['whole', 'whole', 'whole', 'whole', 'whole', 'whole'], ['p1', 'p1', 'p2', 'p2', 'pw', 'pw']]);
  // Harder words come in with the tier: none at tier 1 in a first level.
  const hard = new Set(WG.pool('ar', 0).hard.map(e => e.text));
  for (let s = 1; s < 40; s++) assert.ok(WG.create(WG.plan('ar', 0, 0, 1), s).items.every(it => !hard.has(it.text)), 'tier 1 starts with the easier words');
  assert.ok(WG.create(WG.plan('ar', 0, 5, 5), 3).items.filter(it => hard.has(it.text)).length >= 5, 'tier 5 mixes in the harder words');
});

test('the hamza, taa marbuta and alef maqsura rules follow the tier', () => {
  assert.deepEqual(plain(WG.rules('ar', 1)), { hamza: true, taa: true, yaa: true, chair: true });
  assert.deepEqual(plain(WG.rules('ar', 3)), { hamza: true, taa: false, yaa: true, chair: false });
  assert.deepEqual(plain(WG.rules('ar', 5)), { hamza: false, taa: false, yaa: false, chair: false });
  assert.deepEqual(plain(WG.rules('en', 1)), {});
  const R = t => WG.rules('ar', t);
  for (const h of ['أ', 'إ', 'آ']) { assert.ok(WG.same('ا', h, R(3)), `ا counts for ${h} at tier 3`); assert.ok(!WG.same('ا', h, R(4)), `not at tier 4`); }
  assert.ok(WG.same('ه', 'ة', R(2)) && !WG.same('ه', 'ة', R(3)), 'ه for ة up to tier 2');
  assert.ok(WG.same('ي', 'ى', R(3)) && !WG.same('ي', 'ى', R(4)), 'ي for ى up to tier 3');
  assert.ok(WG.same('ي', 'ئ', R(2)) && WG.same('و', 'ؤ', R(2)) && !WG.same('ي', 'ئ', R(3)), 'ي for ئ and و for ؤ up to tier 2');
  assert.ok(WG.same('ة', 'ة', R(5)) && WG.same('A', 'a', {}), 'the letter itself always counts; Latin ignores case');
  // Through whole key presses, as a child types them.
  const first = tier => levelOf('ar', tier, [['أسد', [[0, 1]]]]);
  let lv = first(1);
  assert.deepEqual(plain(WG.need(lv)), { code: 'KeyH', shift: false }, 'tier 1 lights the plain alef for أ');
  assert.equal(WG.key(lv, latin('KeyH')), 1, 'and accepts it');
  assert.equal(WG.item(lv).state, 'done');
  lv = first(5);
  assert.deepEqual(plain(WG.need(lv)), { code: 'KeyH', shift: true }, 'tier 5 lights Shift and H for أ');
  assert.equal(WG.key(lv, latin('KeyH')), -1, 'a plain alef is wrong at tier 5');
  assert.equal(WG.key(lv, arabic('KeyH', true)), 1, 'Shift+H (أ) is right');
  const last = (text, tier) => levelOf('ar', tier, [[text, [[text.length - 1, text.length]]]], 'last');
  assert.equal(WG.key(last('بطة', 1), latin('KeyI')), 1, 'ه for ة at tier 1');
  assert.equal(WG.key(last('بطة', 3), latin('KeyI')), -1, 'not at tier 3');
  assert.equal(WG.key(last('بطة', 3), latin('KeyM')), 1, 'the ة key always');
  assert.equal(WG.key(last('كمثرى', 3), latin('KeyD')), 1, 'ي for ى at tier 3');
  assert.equal(WG.key(last('كمثرى', 4), latin('KeyD')), -1, 'not at tier 4');
  assert.equal(WG.key(last('كمثرى', 4), arabic('KeyN')), 1, 'the ى key always');
  // English: Shift or Caps Lock never blocks; a PC set to Arabic still types the Latin letter.
  const en = levelOf('en', 5, [['cat', [[0, 1]]]]);
  assert.equal(WG.key(en, { key: 'C', code: 'KeyC', shift: true }), 1);
  assert.equal(WG.key(levelOf('en', 5, [['cat', [[0, 1]]]]), arabic('KeyC')), 1, 'the key printed C types c with Windows set to Arabic');
  assert.equal(WG.key(levelOf('ar', 5, [['قطة', [[0, 1]]]]), latin('KeyR')), 1, 'the key printed ق types ق with Windows set to English');
  // Shift held by mistake on an Arabic letter (Shift+Q is a fatha): the printed letter counts.
  assert.equal(WG.key(levelOf('ar', 5, [['ضفدع', [[0, 1]]]]), arabic('KeyQ', true)), 1);
});

test('a wrong letter shakes the gap and never moves back; the right key glows after the tier\'s wait, at once after two wrong letters', () => {
  const lv = levelOf('ar', 1, [['قطة', [[0, 1]]], ['بطة', [[0, 1]]]]);
  const run = s => { for (let i = 0; i < Math.round(s * 60); i++) WG.step(lv, DT); };
  assert.equal(lv.plan.hint, 1.5);
  run(1.4);
  assert.equal(WG.item(lv).lit, false, 'not yet');
  run(0.2);
  assert.equal(WG.item(lv).lit, true, 'tier 1: the key glows by itself after 1.5 s');
  assert.ok(lv.ev.some(e => e.t === 'hint'));
  assert.equal(WG.key(lv, latin('KeyQ')), -1);
  assert.deepEqual([WG.item(lv).pos, lv.errors, WG.item(lv).wrong], [0, 1, 1], 'a wrong letter: the gap stays, one mistake');
  assert.equal(WG.key(lv, { key: ' ', code: 'Space' }), 0, 'Space is never a mistake');
  assert.equal(WG.key(lv, { key: 'Enter', code: 'Enter' }), 0, 'nor Enter');
  assert.equal(WG.key(lv, { key: 'Shift', code: 'ShiftLeft' }), 0, 'nor Shift');
  assert.equal(WG.key(lv, latin('KeyR')), 1);
  assert.equal(WG.item(lv).state, 'done');
  assert.equal(WG.key(lv, latin('KeyQ')), 0, 'between words keys do nothing');
  assert.equal(lv.errors, 1);
  run(WG.WAIT + 0.05);
  assert.equal(lv.i, 1, 'the next word comes after the celebration');
  assert.equal(WG.item(lv).lit, false, 'its key does not glow yet');

  const old = levelOf('ar', 5, [['قطة', [[0, 1]]]]);
  const go = s => { for (let i = 0; i < Math.round(s * 60); i++) WG.step(old, DT); };
  go(5);
  assert.equal(WG.item(old).lit, false, 'tier 5 waits longer');
  WG.key(old, latin('KeyQ'));
  go(2.9);
  assert.equal(WG.item(old).lit, false, 'one wrong letter: the key glows 3 s later');
  go(0.2);
  assert.equal(WG.item(old).lit, true);
  const twice = levelOf('ar', 5, [['قطة', [[0, 1]]]]);
  WG.key(twice, latin('KeyQ'));
  assert.equal(WG.item(twice).lit, false);
  WG.key(twice, latin('KeyW'));
  assert.equal(WG.item(twice).lit, true, 'two wrong letters: at once');
  assert.equal(twice.helped, 1);
  WG.key(twice, latin('KeyR'));
  assert.equal(WG.item(twice).lit, false, 'the glow ends with the right letter');
});

test('scripted children spell whole levels in every world and mode, in both languages and keyboard layouts', () => {
  for (const lang of LANGS) for (let w = 0; w < WG.WORLDS; w++) for (const l of [0, 5]) for (const tier of [1, 5]) {
    const lv = WG.create(WG.plan(lang, w, l, tier), 7 + w * 13 + l + tier);
    const events = play(lv, { layout: (w + l) % 2 ? latin : arabic });
    assert.ok(lv.over, `${lang} ${w + 1}-${l + 1} tier ${tier} ends`);
    assert.equal(lv.done, lv.total);
    assert.equal(events.filter(e => e === 'word').length, lv.total, 'one word event per word');
    assert.equal(events.filter(e => e === 'done').length, 1);
    assert.equal(lv.errors, 0);
    const r = WG.result(lv);
    assert.equal(r.keys, r.presses, 'one press per missing piece');
    assert.equal(WG.stars(r), 3, 'quick and right: three stars');
    assert.ok(WG.outcome(r) >= 0.8, `a great level is a great result for the difficulty (${WG.outcome(r)})`);
    assert.ok(WG.seedsFor(r, 3) === lv.total + 6);
  }
  // A child who makes mistakes and takes their time still finishes, with fewer stars.
  const lv = WG.create(WG.plan('ar', 3, 2, 3), 99);
  play(lv, { wait: 300, wrongEvery: 2 });
  const r = WG.result(lv);
  assert.ok(lv.over && r.errors > 5);
  assert.ok(WG.stars(r) < 3 && WG.stars(r) >= 1);
  assert.ok(WG.outcome(r) < 0.6, `a hard level is a poor result for the difficulty (${WG.outcome(r)})`);
});

test('stars count mistakes and time; the difficulty outcome stays in 0..1', () => {
  const r = (o = {}) => Object.assign({ words: 8, total: 8, presses: 20, keys: 20, errors: 0, helped: 0, time: 40, target: 60, acc: 1 }, o);
  assert.equal(WG.stars(r()), 3);
  assert.equal(WG.stars(r({ errors: 2 })), 3, 'up to one mistake in ten letters');
  assert.equal(WG.stars(r({ errors: 3 })), 2);
  assert.equal(WG.stars(r({ time: 61 })), 2, 'slow: two stars');
  assert.equal(WG.stars(r({ errors: 7 })), 2);
  assert.equal(WG.stars(r({ errors: 8 })), 1, 'many mistakes: one star');
  assert.equal(WG.stars(r({ presses: 4, errors: 3 })), 2, 'short levels allow a few slips');
  assert.equal(WG.stars(r({ words: 7 })), 0, 'an unfinished level has none');
  for (const o of [r(), r({ errors: 30, acc: 0.4, time: 900, helped: 20 }), r({ time: 0 })]) {
    const x = WG.outcome(o);
    assert.ok(x >= 0 && x <= 1);
  }
  assert.ok(WG.outcome(r()) > WG.outcome(r({ helped: 10 })), 'needing the glowing key counts against the result');
  assert.ok(WG.outcome(r()) > WG.outcome(r({ time: 200 })));
});

test('seeds buy plants and decorations once; bought plants grow in the levels', () => {
  const s = WG.freshSave();
  assert.deepEqual(plain(WG.plantKinds(s)), ['tulip', 'daisy', 'sunflower']);
  assert.equal(WG.buy(s, 'carrot'), false, 'no seeds yet');
  s.seeds = 40;
  assert.equal(WG.buy(s, 'carrot'), true);
  assert.equal(s.seeds, 28);
  assert.equal(WG.buy(s, 'carrot'), false, 'only once');
  assert.equal(WG.buy(s, 'rocket-car'), false, 'only shop items');
  assert.equal(WG.buy(s, 'fence'), true);
  assert.equal(s.seeds, 10);
  assert.deepEqual(plain(WG.plantKinds(s)), ['tulip', 'daisy', 'sunflower', 'carrot'], 'a fence is not a plant');
  for (const x of WG.SHOP) assert.ok(x.kind === 'plant' ? A.PLANTS[x.id] : A.DECOS[x.id], `${x.id} can be drawn`);
  for (const id of WG.FREE) assert.ok(A.PLANTS[id]);
});

test('saves: old, damaged or hand-edited saves load as playable ones; a record keeps the best', () => {
  const fresh = plain(WG.freshSave());
  for (const raw of [null, undefined, 'x', 42, [], { v: 9 }, { stars: 'lots' }, { stars: { ar: 'x', en: [[9, -1]] } }]) assert.deepEqual(plain(WG.loadSave(raw)), fresh);
  const s = plain(WG.loadSave({
    lang: 'fr', seeds: -5, coach: 'yes', owned: ['pond', 'pond', 'unicorn', 7, 'cactus'],
    stars: { ar: [[3, 2.5, 4, '3', null, 1], 'x', [1]], en: [[2]] },
    best: { ar: [[12.34, 50, 0, 0, 0, -3], [], [99]], en: [[1e9]] }
  }));
  assert.equal(s.lang, '');
  assert.equal(s.seeds, 0);
  assert.equal(s.coach, false);
  assert.deepEqual(s.owned, ['pond', 'cactus']);
  assert.deepEqual(s.stars.ar[0], [3, 0, 0, 0, 0, 1]);
  assert.deepEqual(s.stars.ar[2], [1, 0, 0, 0, 0, 0]);
  assert.deepEqual(s.best.ar[0], [12.3, 0, 0, 0, 0, 0], 'a best time only for a level with stars');
  assert.deepEqual(s.best.ar[2], [99, 0, 0, 0, 0, 0]);
  assert.deepEqual(s.stars.en[0], [2, 0, 0, 0, 0, 0]);
  assert.deepEqual(s.best.en[0], [0, 0, 0, 0, 0, 0], 'an impossible time is dropped');
  assert.deepEqual(plain(WG.loadSave(JSON.parse(JSON.stringify(s)))), s, 'loading a clean save changes nothing');
  assert.equal(WG.loadSave({ seeds: 1.5 }).seeds, 0);
  assert.equal(WG.loadSave({ seeds: 120, lang: 'en', coach: true }).seeds, 120);
  // Records: more stars or a faster time on a played level is a new best.
  const g = WG.freshSave();
  assert.deepEqual(plain(WG.record(g, 'ar', 0, 0, 2, 40)), { prev: 0, newBest: false }, 'the first try is not a record');
  assert.deepEqual(plain(WG.record(g, 'ar', 0, 0, 1, 20)), { prev: 2, newBest: false }, 'fewer stars is not a record');
  assert.equal(g.stars.ar[0][0], 2, 'stars never go down');
  assert.equal(g.best.ar[0][0], 20, 'the best time is kept');
  assert.deepEqual(plain(WG.record(g, 'ar', 0, 0, 2, 18)), { prev: 2, newBest: true }, 'as many stars, faster');
  assert.deepEqual(plain(WG.record(g, 'ar', 0, 0, 3, 30)), { prev: 2, newBest: true }, 'more stars');
  assert.equal(WG.total(g), 3);
  // Opening levels and worlds.
  assert.ok(WG.isOpen(g, 'ar', 0, 1) && !WG.isOpen(g, 'ar', 0, 2), 'a star opens the next level');
  assert.ok(!WG.isOpen(g, 'en', 0, 1), 'each language has its own path');
  assert.ok(WG.worldOpen(g, 'ar', 1), 'three stars on a world\'s first level open the next world');
  g.stars.ar[0][0] = 2;
  assert.ok(!WG.worldOpen(g, 'ar', 1));
  g.stars.ar[0][5] = 1;
  assert.ok(WG.worldOpen(g, 'ar', 1), 'finishing a world opens the next');
  assert.deepEqual(plain(WG.nextLevel(g, 'ar')), { w: 0, l: 1 });
  assert.deepEqual(plain(WG.nextLevel(WG.freshSave(), 'en')), { w: 0, l: 0 });
});

test('Arabic joining: the letters that join the next one', () => {
  assert.ok(WG.joins('ب', 'ا') && WG.joins('ن', 'ح') && WG.joins('ع', 'ة') && WG.joins('ل', 'ا'));
  assert.ok(!WG.joins('ا', 'ب') && !WG.joins('ر', 'ة') && !WG.joins('د', 'ب') && !WG.joins('و', 'ت'), 'ا د ذ ر ز و never join forward');
  assert.ok(!WG.joins('ء', 'ب') && !WG.joins('ب', 'ء') && !WG.joins('ب', ' ') && !WG.joins('a', 'b'), 'ء, spaces and Latin never join');
});
