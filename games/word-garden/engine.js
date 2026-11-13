/* حديقة الكلمات (Word Garden) engine: the school keyboard table, forgiving key matching
 * (hamza, taa marbuta and alef maqsura rules by tier, the «لا» key), which letters of a
 * word go missing, typing them, the hint timer, stars, seeds, the garden shop and saves.
 * Pure: no DOM, no Kit, no timers and no Math.random (a level takes a seed), so
 * tools/tests/word-garden-engine.test.mjs loads it with { window: {} } and plays whole
 * levels with a scripted child. game.js reads the DDA tier, feeds key presses in and
 * turns the level's events into pictures, flowers and sound. */
(function () {
  'use strict';
  var WG = window.WG = window.WG || {};
  var WORDS = window.WG_WORDS || {};
  WG.W = 1280; WG.H = 720;
  WG.TIERS = 5; WG.WORLDS = 5; WG.LEVELS = 6;
  WG.LANGS = ['ar', 'en'];

  /* ------------------------------------------------------- the keyboard */
  // The school's keyboard (a Dell, Windows Arabic 101), row by row, exactly as printed:
  // [code, width in key units, Latin, Latin+Shift, Arabic, Arabic+Shift, label].
  // The same table as «أصابع البرق»: change a label here and both the on-screen keyboard
  // and the key matching follow.
  WG.ROWS = [
    [['Backquote', 1, '`', '~', 'ذ', 'ّ'], ['Digit1', 1, '1', '!', '١'], ['Digit2', 1, '2', '@', '٢'], ['Digit3', 1, '3', '#', '٣'],
      ['Digit4', 1, '4', '$', '٤'], ['Digit5', 1, '5', '%', '٥'], ['Digit6', 1, '6', '^', '٦'], ['Digit7', 1, '7', '&', '٧'],
      ['Digit8', 1, '8', '*', '٨'], ['Digit9', 1, '9', '(', '٩'], ['Digit0', 1, '0', ')', '٠'], ['Minus', 1, '-', '_'], ['Equal', 1, '=', '+'],
      ['Backspace', 2, '', '', '', '', 'Backspace']],
    [['Tab', 1.5, '', '', '', '', 'Tab'], ['KeyQ', 1, 'q', 'Q', 'ض', 'َ'], ['KeyW', 1, 'w', 'W', 'ص', 'ً'], ['KeyE', 1, 'e', 'E', 'ث', 'ُ'],
      ['KeyR', 1, 'r', 'R', 'ق', 'ٌ'], ['KeyT', 1, 't', 'T', 'ف', 'لإ'], ['KeyY', 1, 'y', 'Y', 'غ', 'إ'], ['KeyU', 1, 'u', 'U', 'ع', '‘'],
      ['KeyI', 1, 'i', 'I', 'ه', '÷'], ['KeyO', 1, 'o', 'O', 'خ', '×'], ['KeyP', 1, 'p', 'P', 'ح', '؛'], ['BracketLeft', 1, '[', '{', 'ج', '>'],
      ['BracketRight', 1, ']', '}', 'د', '<'], ['Backslash', 1.5, '\\', '|', '\\', '|']],
    [['CapsLock', 1.75, '', '', '', '', 'Caps Lock'], ['KeyA', 1, 'a', 'A', 'ش', 'ِ'], ['KeyS', 1, 's', 'S', 'س', 'ٍ'], ['KeyD', 1, 'd', 'D', 'ي', '['],
      ['KeyF', 1, 'f', 'F', 'ب', ']'], ['KeyG', 1, 'g', 'G', 'ل', 'لأ'], ['KeyH', 1, 'h', 'H', 'ا', 'أ'], ['KeyJ', 1, 'j', 'J', 'ت', 'ـ'],
      ['KeyK', 1, 'k', 'K', 'ن', '،'], ['KeyL', 1, 'l', 'L', 'م', '/'], ['Semicolon', 1, ';', ':', 'ك', ':'], ['Quote', 1, '\'', '"', 'ط', '"'],
      ['Enter', 2.25, '', '', '', '', 'Enter']],
    [['ShiftLeft', 2.25, '', '', '', '', 'Shift'], ['KeyZ', 1, 'z', 'Z', 'ئ', '~'], ['KeyX', 1, 'x', 'X', 'ء', 'ْ'], ['KeyC', 1, 'c', 'C', 'ؤ', '{'],
      ['KeyV', 1, 'v', 'V', 'ر', '}'], ['KeyB', 1, 'b', 'B', 'لا', 'لآ'], ['KeyN', 1, 'n', 'N', 'ى', 'آ'], ['KeyM', 1, 'm', 'M', 'ة', '’'],
      ['Comma', 1, ',', '<', 'و', ','], ['Period', 1, '.', '>', 'ز', '.'], ['Slash', 1, '/', '?', 'ظ', '؟'], ['ShiftRight', 2.75, '', '', '', '', 'Shift']],
    [['ControlLeft', 1.25, '', '', '', '', 'Ctrl'], ['MetaLeft', 1.25, '', '', '', '', 'win'], ['AltLeft', 1.25, '', '', '', '', 'Alt'],
      ['Space', 6.25, ' ', ' ', ' ', ' ', ''], ['AltRight', 1.25, '', '', '', '', 'Alt'], ['Fn', 1.25, '', '', '', '', 'Fn'],
      ['ContextMenu', 1.25, '', '', '', '', 'menu'], ['ControlRight', 1.25, '', '', '', '', 'Ctrl']]
  ];
  // Where the on-screen keyboard sits (logical pixels): 15 units of 50 px in every row.
  WG.KB = { x: 265, y: 462, unit: 50, gap: 4 };
  WG.KEYS = {};
  var BY_CHAR = { ar: {}, en: {} };
  WG.ROWS.forEach(function (row, r) {
    var x = WG.KB.x;
    row.forEach(function (k) {
      var key = { code: k[0], row: r, x: x, y: WG.KB.y + r * WG.KB.unit, w: k[1] * WG.KB.unit - WG.KB.gap, h: WG.KB.unit - WG.KB.gap,
        en: k[2] || '', enS: k[3] || '', ar: k[4] || '', arS: k[5] || '', label: k[6] || '' };
      x += k[1] * WG.KB.unit;
      WG.KEYS[key.code] = key;
      [['en', key.en, false], ['en', key.enS, true], ['ar', key.ar, false], ['ar', key.arS, true]].forEach(function (c) {
        if (c[1] && !BY_CHAR[c[0]][c[1]]) BY_CHAR[c[0]][c[1]] = { code: key.code, shift: c[2] };
      });
    });
  });
  // The physical key (and Shift) that types one character, or null.
  WG.keyFor = function (ch, lang) { var h = BY_CHAR[lang === 'ar' ? 'ar' : 'en'][ch]; return h ? { code: h.code, shift: h.shift } : null; };
  // Which hand presses a key (the other hand holds Shift).
  var LEFT = 'Backquote Digit1 Digit2 Digit3 Digit4 Digit5 KeyQ KeyW KeyE KeyR KeyT KeyA KeyS KeyD KeyF KeyG KeyZ KeyX KeyC KeyV KeyB'.split(' ');
  WG.leftHand = function (code) { return LEFT.indexOf(code) >= 0; };

  /* ----------------------------------------------------- Arabic letters */
  function isAr(c) { var n = c ? c.charCodeAt(0) : 0; return n >= 0x0600 && n <= 0x06FF; }
  WG.isArabic = isAr;
  // Letters that join only to the letter before them; ء joins to nothing.
  var RIGHT = 'اأإآٱدذرزوؤةى';
  function dual(c) { return !!c && c.length === 1 && c >= 'ؠ' && c <= 'ي' && c !== 'ء' && RIGHT.indexOf(c) < 0; }
  // True when letter a joins on to the letter b that follows it (so a split between them
  // needs a zero-width joiner on both sides to keep the joined shapes).
  WG.joins = function (a, b) { return dual(a) && (dual(b) || (!!b && b.length === 1 && RIGHT.indexOf(b) >= 0)); };

  /* ------------------------------------------------- forgiving matching */
  // rules (Arabic only, by tier): hamza: أ إ آ ا count as one; taa: ة and ه; yaa: ى and ي;
  // chair: ئ and ي, ؤ and و. Latin letters always ignore case (Caps Lock never blocks).
  function norm(c, R) {
    if (R.hamza && (c === 'أ' || c === 'إ' || c === 'آ' || c === 'ٱ')) return 'ا';
    if (R.taa && c === 'ة') return 'ه';
    if (R.yaa && c === 'ى') return 'ي';
    if (R.chair && c === 'ئ') return 'ي';
    if (R.chair && c === 'ؤ') return 'و';
    return c.toLowerCase();
  }
  WG.same = function (typed, target, R) { return typed === target || (!!typed && !!target && norm(typed, R || {}) === norm(target, R || {})); };
  // Some PCs send the lam-alef key as one presentation-form glyph: NFKC makes it ل + ا.
  function clean(k) { return /[ﭐ-﷿ﹰ-ﻼ]/.test(k) && k.normalize ? k.normalize('NFKC') : k; }
  WG.isSpace = function (ev) { return ev.key === ' ' || ev.code === 'Space'; };
  // What one physical key prints in a language: the table, not the PC's input language.
  WG.keyChar = function (code, shift, lang) {
    var k = WG.KEYS[code];
    if (!k) return '';
    return lang === 'ar' ? (shift && k.arS ? k.arS : k.ar) : (shift && k.enS ? k.enS : k.en);
  };
  // A printable key press: one character, or the two-letter lam-alef of the B key. A key
  // whose letter the PC does not report (no key, '' or 'Unidentified', as some PCs do for
  // the lam-alef key) counts as the letter printed on it.
  WG.printable = function (ev) {
    var k = clean(String(ev.key == null ? '' : ev.key));
    if (k.length === 1) return k;
    if (k.length === 2 && isAr(k[0]) && isAr(k[1])) return k;
    return (!k || k === 'Unidentified') && WG.KEYS[ev.code] ? WG.keyChar(ev.code, ev.shift, 'en') : '';
  };
  // The text one key press may stand for: what the PC typed and, when the PC's input
  // language does not fit the word (Windows set to English for an Arabic word, or the
  // other way round), what that same physical key prints in the word's language.
  WG.candidates = function (ev, lang) {
    var k = WG.printable(ev), out = [];
    if (k) out.push(k);
    var fits = k && (k === ' ' || (lang === 'ar' ? isAr(k[0]) : !isAr(k[0])));
    if (!fits) { var m = WG.keyChar(ev.code, !!ev.shift, lang); if (m && m !== k) out.push(m); }
    // Shift held by mistake turns Arabic letters into marks (Shift+Q is a fatha): the
    // letter printed on that key still counts.
    if (lang === 'ar' && ev.shift) { var u = WG.keyChar(ev.code, false, 'ar'); if (u && out.indexOf(u) < 0) out.push(u); }
    return out;
  };
  // How many letters of text, from pos and before end, this key press types (0: a wrong key).
  WG.match = function (text, pos, end, ev, lang, R) {
    var c = WG.candidates(ev, lang);
    for (var i = 0; i < c.length; i++) {
      var s = c[i], ok = pos + s.length <= end;
      for (var j = 0; ok && j < s.length; j++) ok = WG.same(s[j], text[pos + j], R);
      if (ok) return s.length;
    }
    return 0;
  };
  // The key that types text[pos], and whether it needs Shift. With the hamza rule a hamza
  // form lights plain ا; a lam followed by an alef lights the B key, printed «لا».
  WG.nextKey = function (text, pos, lang, R) {
    var c = text == null ? null : text[pos];
    R = R || {};
    if (c == null) return null;
    if (c === ' ') return { code: 'Space', shift: false };
    if (lang === 'ar' && c === 'ل' && /[اأإآ]/.test(text[pos + 1] || '')) {
      var a = text[pos + 1];
      if (a === 'ا' || R.hamza) return { code: 'KeyB', shift: false };
      return { code: a === 'أ' ? 'KeyG' : a === 'إ' ? 'KeyT' : 'KeyB', shift: true };
    }
    if (lang === 'ar' && R.hamza && /[أإآٱ]/.test(c)) c = 'ا';
    var hit = BY_CHAR[lang === 'ar' ? 'ar' : 'en'][c] || BY_CHAR.en[c.toLowerCase()] || BY_CHAR.ar[c];
    if (!hit) return null;
    // Latin letters are matched without case: a lower-case key is enough.
    if (lang !== 'ar' && /[A-Z]/.test(c)) return { code: hit.code, shift: false };
    return { code: hit.code, shift: hit.shift };
  };
  // The key event a perfect typist sends for text[pos] (the scripted players use it).
  WG.perfectKey = function (text, pos, lang, R) {
    var k = WG.nextKey(text, pos, lang, R);
    return k ? { key: WG.keyChar(k.code, k.shift, lang), code: k.code, shift: k.shift } : null;
  };

  /* ------------------------------------------------------------ seeds */
  // mulberry32: 32-bit integer math only (Math.imul, >>>), identical in every JS engine.
  WG.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  function shuffle(list, r) {
    for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = list[i]; list[i] = list[j]; list[j] = t; }
    return list;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ------------------------------------------------------------ words */
  // 'text=pic.mod | …' into [{ text, pic, mod }].
  function entries(s) {
    return String(s || '').split('|').map(function (e) { return e.trim(); }).filter(Boolean).map(function (e) {
      var p = e.split('='), pic = String(p[1] || '').trim().split('.');
      return { text: p[0].trim(), pic: pic[0], mod: pic[1] || '' };
    });
  }
  WG.pool = function (lang, w) {
    var s = String((WORDS[lang] || [])[w] || '').split('||');
    return { easy: entries(s[0]), hard: entries(s[1]) };
  };
  // The typeable pieces of a text: one letter each, except a lam with the alef after it
  // (one press of the «لا» key, or ل then ا). Spaces are never a piece.
  WG.units = function (text, lang) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      if (text[i] === ' ') continue;
      if (lang === 'ar' && text[i] === 'ل' && /[اأإآ]/.test(text[i + 1] || '')) { out.push([i, i + 2]); i++; } else out.push([i, i + 1]);
    }
    return out;
  };
  // The words of a text as [start, end) ranges.
  WG.wordsOf = function (text) {
    var out = [], re = /\S+/g, m;
    while ((m = re.exec(text))) out.push([m.index, m.index + m[0].length]);
    return out;
  };
  var TRICKY = /[أإآؤئءةى]/;

  /* ------------------------------------------------------------ levels */
  // One entry per DDA tier: 1 suits a six-year-old finding letters one by one, 5 an
  // eleven-year-old who spells well.
  WG.TUNE = {
    words: [6, 7, 8, 8, 8],              // words in a level
    hint: [1.5, 3, 5, 8, 12],            // s of thinking before the right key glows by itself
    hintWrong: [0.3, 0.6, 1.2, 2, 3],    // ... and how soon after a first wrong letter (instantly after two)
    pace: [5, 4, 3.2, 2.6, 2.1],         // s per letter for the third star
    mix: [0, 0.15, 0.3, 0.5, 0.7],       // share of harder words
    easy: [1, 1, 0, 0, 0],               // gaps avoid hamza, ة and ى when they can, and never touch
    hamza: [1, 1, 1, 0, 0],              // أ إ آ ا as one letter
    taa: [1, 1, 0, 0, 0],                // ة and ه
    yaa: [1, 1, 1, 0, 0],                // ى and ي
    chair: [1, 1, 0, 0, 0]               // ئ and ي, ؤ and و
  };
  // Per world: its theme and which letters go missing in each of its six levels.
  WG.WORLD = [
    { theme: 'animals', modes: ['first', 'first', 'last', 'last', 'ends', 'ends'] },
    { theme: 'food', modes: ['middle', 'middle', 'middle', 'any', 'any', 'any'] },
    { theme: 'home', modes: ['two', 'two', 'two', 'two', 'two', 'two'] },
    { theme: 'outside', modes: ['whole', 'whole', 'whole', 'whole', 'whole', 'whole'] },
    { theme: '', modes: ['p1', 'p1', 'p2', 'p2', 'pw', 'pw'] }
  ];
  WG.rules = function (lang, tier) {
    if (lang !== 'ar') return {};
    var T = WG.TUNE, i = clamp((tier | 0) - 1, 0, WG.TIERS - 1);
    return { hamza: !!T.hamza[i], taa: !!T.taa[i], yaa: !!T.yaa[i], chair: !!T.chair[i] };
  };
  WG.plan = function (lang, w, l, tier) {
    var T = WG.TUNE, i = clamp((tier | 0) - 1, 0, WG.TIERS - 1);
    return {
      lang: lang, w: w, l: l, tier: i + 1, mode: WG.WORLD[w].modes[l], count: T.words[i],
      hint: T.hint[i], hintWrong: T.hintWrong[i], pace: T.pace[i], mix: Math.min(0.9, T.mix[i] + l * 0.08),
      easy: !!T.easy[i], rules: WG.rules(lang, i + 1)
    };
  };
  // The words of one level: no word twice, harder words mixed in by the tier; whole words
  // and phrases go from short to long.
  WG.pickWords = function (plan, r) {
    var p = WG.pool(plan.lang, plan.w), n = Math.min(plan.count, p.easy.length + p.hard.length);
    var hard = Math.min(p.hard.length, Math.round(n * plan.mix));
    var easy = shuffle(p.easy.slice(), r).slice(0, n - hard);
    hard = n - easy.length;
    var out = easy.concat(shuffle(p.hard.slice(), r).slice(0, hard));
    shuffle(out, r);
    if (plan.mode === 'whole' || plan.mode === 'pw') out.sort(function (a, b) { return a.text.length - b.text.length; });
    return out;
  };
  // Which letters go missing: [start, end) ranges in reading order. A «لا» is never split.
  // easy: a gap that can choose avoids hamza forms, ة and ى, and two gaps never touch.
  WG.gaps = function (text, mode, lang, easy, r) {
    var U = WG.units(text, lang), n = U.length, words = WG.wordsOf(text);
    function pick(list) {
      if (easy) { var plain = list.filter(function (u) { return !TRICKY.test(text.slice(u[0], u[1])); }); if (plain.length) list = plain; }
      return list[Math.floor(r() * list.length)];
    }
    function inWord(wd) { return U.filter(function (u) { return u[0] >= wd[0] && u[1] <= wd[1]; }); }
    function copy(list) { return list.map(function (u) { return [u[0], u[1]]; }).sort(function (a, b) { return a[0] - b[0]; }); }
    if (mode === 'ends') mode = r() < 0.5 ? 'first' : 'last';
    if (mode === 'middle' && n < 3) mode = 'last';
    if (mode === 'two' && (n < 3 || (n === 3 && easy))) mode = n < 3 ? 'last' : 'middle';
    if (mode === 'first') return copy([U[0]]);
    if (mode === 'last') return copy([U[n - 1]]);
    if (mode === 'middle') return copy([pick(U.slice(1, n - 1))]);
    if (mode === 'two') {
      var a = pick(U), ai = U.indexOf(a);
      var rest = U.filter(function (u, i) { return i !== ai && (!easy || Math.abs(i - ai) > 1); });
      if (!rest.length) rest = U.filter(function (u, i) { return i !== ai; });
      return copy([a, pick(rest)]);
    }
    if (mode === 'p2' && words.length > 1) return copy(words.slice(0, 2).map(function (wd) { return pick(inWord(wd)); }));
    if (mode === 'p1' || mode === 'p2' || mode === 'any') return copy([pick(U)]);
    return copy(words); // whole, pw: every word, typed in order
  };
  // A finished word stays (and its flower grows) for this long before the next one.
  WG.WAIT = 1.7;
  // One word to spell: e is { text, pic, mod }; gaps are its missing [start, end) ranges.
  WG.makeItem = function (e, gaps, lang) {
    var presses = 0;
    gaps.forEach(function (g) { presses += WG.units(e.text.slice(g[0], g[1]), lang).length; });
    return { text: e.text, pic: e.pic || '', mod: e.mod || '', gaps: gaps, g: 0, pos: gaps[0][0], presses: presses,
      state: 'type', wrong: 0, misses: 0, idle: 0, lit: false };
  };
  // A level: the plan's words (or the given items) in order.
  WG.create = function (plan, seed, items) {
    var r = WG.rng(seed);
    items = items || WG.pickWords(plan, r).map(function (e) { return WG.makeItem(e, WG.gaps(e.text, plan.mode, plan.lang, plan.easy, r), plan.lang); });
    return { plan: plan, items: items, i: 0, t: 0, active: 0, keys: 0, letters: 0, errors: 0, helped: 0, done: 0,
      total: items.length, wait: 0, over: false, ev: [] };
  };
  WG.item = function (lv) { return lv.items[lv.i] || null; };
  WG.gapEnd = function (it) { return it.gaps[it.g] ? it.gaps[it.g][1] : it.pos; };
  // The key to press now (null between words and after the level).
  WG.need = function (lv) {
    var it = WG.item(lv);
    return !lv.over && it && it.state === 'type' ? WG.nextKey(it.text, it.pos, lv.plan.lang, lv.plan.rules) : null;
  };
  function light(lv, it) { it.lit = true; lv.helped++; lv.ev.push({ t: 'hint' }); }
  WG.step = function (lv, dt) {
    if (lv.over) return;
    lv.t += dt;
    var it = WG.item(lv);
    if (it.state === 'type') {
      lv.active += dt; it.idle += dt;
      if (!it.lit && it.idle >= lv.plan.hint) light(lv, it);
    } else if ((lv.wait -= dt) <= 0) {
      if (lv.i < lv.items.length - 1) { lv.i++; lv.ev.push({ t: 'next', i: lv.i }); } else { lv.over = true; lv.ev.push({ t: 'done' }); }
    }
  };
  // One key press. Returns the letters it typed, 0 when it is ignored and -1 for a wrong
  // letter. A wrong letter never moves anything back: the gap shakes, and the right key
  // glows soon (at once after two wrong letters). Space is never a mistake.
  WG.key = function (lv, ev) {
    var it = WG.item(lv);
    if (lv.over || !it || it.state !== 'type' || !WG.printable(ev) || WG.isSpace(ev)) return 0;
    var P = lv.plan, end = WG.gapEnd(it), n = WG.match(it.text, it.pos, end, ev, P.lang, P.rules);
    if (n > 0) {
      var at = it.pos;
      it.pos += n; lv.keys++; lv.letters += n; it.wrong = 0; it.idle = 0; it.lit = false;
      lv.ev.push({ t: 'good', at: at, n: n });
      if (it.pos >= end) {
        lv.ev.push({ t: 'gap', g: it.g });
        it.g++;
        if (it.g < it.gaps.length) it.pos = it.gaps[it.g][0];
        else { it.state = 'done'; lv.done++; lv.wait = WG.WAIT; lv.ev.push({ t: 'word', i: lv.i, done: lv.done }); }
      }
      return n;
    }
    lv.errors++; it.wrong++; it.misses++;
    if (it.wrong >= 2) { if (!it.lit) light(lv, it); } else it.idle = Math.max(it.idle, P.hint - P.hintWrong);
    lv.ev.push({ t: 'miss', wrong: it.wrong });
    return -1;
  };
  WG.result = function (lv) {
    var presses = 0;
    lv.items.forEach(function (it) { presses += it.presses; });
    var P = lv.plan, time = Math.round(lv.active * 10) / 10;
    return { words: lv.done, total: lv.total, presses: presses, keys: lv.keys, errors: lv.errors, helped: lv.helped, time: time,
      target: Math.round(lv.total * 1.5 + presses * P.pace), acc: lv.keys + lv.errors ? lv.keys / (lv.keys + lv.errors) : 1 };
  };
  // A finished level earns a star; few mistakes a second; few mistakes in good time the third.
  WG.stars = function (r) {
    if (!r.total || r.words < r.total) return 0;
    var ok3 = Math.max(1, Math.round(r.presses * 0.1)), ok2 = Math.max(3, Math.round(r.presses * 0.35));
    if (r.errors <= ok3 && r.time <= r.target) return 3;
    return r.errors <= ok2 ? 2 : 1;
  };
  // 0..1 for Kit.dda: right letters, speed against the target, and how often the key had to glow.
  WG.outcome = function (r) {
    if (!r.total) return 0;
    var x = 0.15 + 0.5 * clamp((r.acc - 0.6) / 0.35, 0, 1) + 0.35 * Math.min(1, r.target / Math.max(1, r.time)) - 0.3 * r.helped / Math.max(1, r.presses);
    return Math.round(clamp(x, 0, 1) * 1000) / 1000;
  };
  // Seeds: one per word and two per star.
  WG.seedsFor = function (r, stars) { return r.words + stars * 2; };

  /* ------------------------------------------------------- the garden */
  WG.FREE = ['tulip', 'daisy', 'sunflower'];
  WG.SHOP = [
    { id: 'carrot', kind: 'plant', cost: 12 }, { id: 'fence', kind: 'deco', cost: 18 }, { id: 'tomato', kind: 'plant', cost: 25 },
    { id: 'birdhouse', kind: 'deco', cost: 30 }, { id: 'cactus', kind: 'plant', cost: 35 }, { id: 'pond', kind: 'deco', cost: 45 },
    { id: 'pumpkin', kind: 'plant', cost: 50 }, { id: 'bench', kind: 'deco', cost: 60 }, { id: 'appletree', kind: 'plant', cost: 75 },
    { id: 'fountain', kind: 'deco', cost: 90 }, { id: 'windmill', kind: 'deco', cost: 120 }
  ];
  function shopItem(id) { for (var i = 0; i < WG.SHOP.length; i++) if (WG.SHOP[i].id === id) return WG.SHOP[i]; return null; }
  WG.shopItem = shopItem;
  // The plants that grow in levels and in the garden: the free ones and the ones bought.
  WG.plantKinds = function (s) {
    return WG.FREE.concat(WG.SHOP.filter(function (x) { return x.kind === 'plant' && s.owned.indexOf(x.id) >= 0; }).map(function (x) { return x.id; }));
  };
  // Buys a shop item: true when the seeds were enough (and it was not owned yet).
  WG.buy = function (s, id) {
    var x = shopItem(id);
    if (!x || s.owned.indexOf(id) >= 0 || s.seeds < x.cost) return false;
    s.seeds -= x.cost; s.owned.push(id);
    return true;
  };

  /* ------------------------------------------------------------ saves */
  // { v: 1, lang: '' | 'ar' | 'en' (the last language picked), stars: { ar|en: [world][level] 0..3 },
  //   best: { ar|en: [world][level] best seconds, 0: none }, seeds, owned: [shop ids], coach: the
  //   first word was spelled (the how-to card is done) }
  function grid() { var g = []; for (var w = 0; w < WG.WORLDS; w++) { var row = []; for (var l = 0; l < WG.LEVELS; l++) row.push(0); g.push(row); } return g; }
  WG.freshSave = function () { return { v: 1, lang: '', stars: { ar: grid(), en: grid() }, best: { ar: grid(), en: grid() }, seeds: 0, owned: [], coach: false }; };
  function int(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function num(v, lo, hi) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  // Every field is checked: an old, damaged or hand-edited save loads as a playable one.
  WG.loadSave = function (raw) {
    var s = WG.freshSave();
    if (!obj(raw)) return s;
    if (raw.lang === 'ar' || raw.lang === 'en') s.lang = raw.lang;
    s.coach = raw.coach === true;
    s.seeds = int(raw.seeds, 0, 1e6) ? raw.seeds : 0;
    if (Array.isArray(raw.owned)) raw.owned.forEach(function (id) { if (typeof id === 'string' && shopItem(id) && s.owned.indexOf(id) < 0) s.owned.push(id); });
    WG.LANGS.forEach(function (lang) {
      var g = obj(raw.stars) && Array.isArray(raw.stars[lang]) ? raw.stars[lang] : [], b = obj(raw.best) && Array.isArray(raw.best[lang]) ? raw.best[lang] : [];
      for (var w = 0; w < WG.WORLDS; w++) for (var l = 0; l < WG.LEVELS; l++) {
        var v = Array.isArray(g[w]) ? g[w][l] : 0, t = Array.isArray(b[w]) ? b[w][l] : 0;
        s.stars[lang][w][l] = int(v, 0, 3) ? v : 0;
        s.best[lang][w][l] = s.stars[lang][w][l] && num(t, 0.1, 36000) ? Math.round(t * 10) / 10 : 0;
      }
    });
    return s;
  };
  // Stores a finished level: returns { prev, newBest } (newBest: better than an earlier try).
  WG.record = function (s, lang, w, l, stars, time) {
    var prev = s.stars[lang][w][l], best = s.best[lang][w][l];
    var newBest = prev > 0 && (stars > prev || (stars === prev && time < best));
    if (stars > prev) s.stars[lang][w][l] = stars;
    if (stars > 0 && (!best || time < best)) s.best[lang][w][l] = Math.round(time * 10) / 10;
    return { prev: prev, newBest: newBest };
  };
  WG.total = function (s, lang) {
    var n = 0;
    (lang ? [lang] : WG.LANGS).forEach(function (g) { s.stars[g].forEach(function (row) { row.forEach(function (v) { n += v; }); }); });
    return n;
  };
  // A world opens when the one before it is finished, or straight away for a child who
  // aced the world before's first level with three stars.
  WG.worldOpen = function (s, lang, w) {
    var g = s.stars[lang];
    return w === 0 || g[w - 1][WG.LEVELS - 1] > 0 || g[w - 1][0] === 3 || g[w].some(Boolean);
  };
  WG.isOpen = function (s, lang, w, l) {
    if (!WG.worldOpen(s, lang, w)) return false;
    var g = s.stars[lang][w];
    return l === 0 || g[l - 1] > 0 || g[l] > 0;
  };
  // The first open level without a star, else the last level.
  WG.nextLevel = function (s, lang) {
    for (var w = 0; w < WG.WORLDS; w++) for (var l = 0; l < WG.LEVELS; l++) if (WG.isOpen(s, lang, w, l) && !s.stars[lang][w][l]) return { w: w, l: l };
    return { w: WG.WORLDS - 1, l: WG.LEVELS - 1 };
  };
})();
