/* أصابع البرق (Lightning Fingers) engine: the keyboard table, forgiving key matching,
 * the lightning-cloud levels, the speed test, class-challenge codes and saves.
 * Pure: no DOM, no Kit, no timers and no Math.random (a world takes a seed), so
 * tools/tests/typing-test-engine.test.mjs loads it with { window: {} } and plays whole
 * levels with a scripted typist. game.js reads the DDA tier, feeds key presses in and
 * turns the world's events into pictures and sound. */
(function () {
  'use strict';
  var TT = window.TT = window.TT || {};
  var WORDS = window.TT_WORDS || {};
  TT.W = 1280; TT.H = 720;
  TT.TIERS = 5; TT.WORLDS = 5; TT.LEVELS = 4; TT.SUNS = 3;
  TT.LANGS = ['ar', 'en'];

  /* ------------------------------------------------------- the keyboard */
  // The school's keyboard (a Dell, Windows Arabic 101), row by row, exactly as printed:
  // [code, width in key units, Latin, Latin+Shift, Arabic, Arabic+Shift, label].
  // Change a label here and both the on-screen keyboard and the key matching follow.
  TT.ROWS = [
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
  TT.KB = { x: 265, y: 458, unit: 50, gap: 4 };
  TT.KEYS = {};
  var BY_CHAR = { ar: {}, en: {} };
  TT.ROWS.forEach(function (row, r) {
    var x = TT.KB.x;
    row.forEach(function (k) {
      var key = { code: k[0], row: r, x: x, y: TT.KB.y + r * TT.KB.unit, w: k[1] * TT.KB.unit - TT.KB.gap, h: TT.KB.unit - TT.KB.gap,
        en: k[2] || '', enS: k[3] || '', ar: k[4] || '', arS: k[5] || '', label: k[6] || '' };
      x += k[1] * TT.KB.unit;
      TT.KEYS[key.code] = key;
      [['en', key.en, false], ['en', key.enS, true], ['ar', key.ar, false], ['ar', key.arS, true]].forEach(function (c) {
        if (c[1] && !BY_CHAR[c[0]][c[1]]) BY_CHAR[c[0]][c[1]] = { code: key.code, shift: c[2] };
      });
    });
  });
  // Which hand presses a key (for the opposite Shift) and the finger zone colours.
  TT.FINGER = { Backquote: 0, Digit1: 0, KeyQ: 0, KeyA: 0, KeyZ: 0, Digit2: 1, KeyW: 1, KeyS: 1, KeyX: 1, Digit3: 2, KeyE: 2, KeyD: 2, KeyC: 2,
    Digit4: 3, Digit5: 3, KeyR: 3, KeyT: 3, KeyF: 3, KeyG: 3, KeyV: 3, KeyB: 3, Digit6: 4, Digit7: 4, KeyY: 4, KeyU: 4, KeyH: 4, KeyJ: 4, KeyN: 4, KeyM: 4,
    Digit8: 5, KeyI: 5, KeyK: 5, Comma: 5, Digit9: 6, KeyO: 6, KeyL: 6, Period: 6, Digit0: 7, Minus: 7, Equal: 7, KeyP: 7, BracketLeft: 7,
    BracketRight: 7, Backslash: 7, Semicolon: 7, Quote: 7, Slash: 7 };
  TT.leftHand = function (code) { var f = TT.FINGER[code]; return f != null && f < 4; };

  /* ------------------------------------------------- forgiving matching */
  // Hamza forms, taa marbuta / haa and the yaa look-alikes count as the same letter both
  // ways; Latin letters ignore case (so Caps Lock never blocks a child).
  var LENIENT = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ة': 'ه', 'ى': 'ي', 'ئ': 'ي', 'ؤ': 'و' };
  function base(c) { return LENIENT[c] || c.toLowerCase(); }
  TT.same = function (typed, target) { return typed === target || (!!typed && !!target && base(typed) === base(target)); };
  function isAr(c) { var n = c ? c.charCodeAt(0) : 0; return n >= 0x0600 && n <= 0x06FF; }
  TT.isArabic = isAr;
  // Some PCs send the lam-alef key as one presentation-form glyph: NFKC makes it ل + ا.
  function clean(k) { return /[ﭐ-﷿ﹰ-ﻼ]/.test(k) && k.normalize ? k.normalize('NFKC') : k; }
  TT.isSpace = function (ev) { return ev.key === ' ' || ev.code === 'Space'; };
  // What one physical key prints in a language: the table, not the PC's input language.
  TT.keyChar = function (code, shift, lang) {
    var k = TT.KEYS[code];
    if (!k) return '';
    return lang === 'ar' ? (shift && k.arS ? k.arS : k.ar) : (shift && k.enS ? k.enS : k.en);
  };
  // A printable key press: one character, or the two-letter lam-alef of the B key.
  TT.printable = function (ev) {
    var k = clean(String(ev.key == null ? '' : ev.key));
    if (k.length === 1) return k;
    if (k.length === 2 && isAr(k[0]) && isAr(k[1])) return k;
    return ev.key == null && TT.KEYS[ev.code] ? TT.keyChar(ev.code, ev.shift, 'en') : '';
  };
  // The text one key press may stand for: what the PC typed and, when the PC's input
  // language does not fit the word (an English keyboard for an Arabic word, or the other
  // way round), what that same physical key prints in the word's language.
  TT.candidates = function (ev, lang) {
    var k = TT.printable(ev), out = [];
    if (k) out.push(k);
    var fits = k && (k === ' ' || (lang === 'ar' ? isAr(k[0]) : !isAr(k[0])));
    if (!fits) { var m = TT.keyChar(ev.code, !!ev.shift, lang); if (m && m !== k) out.push(m); }
    // Shift held by mistake turns Arabic letters into marks (Shift+Q is a fatha): the
    // letter printed on that key still counts.
    if (lang === 'ar' && ev.shift) { var u = TT.keyChar(ev.code, false, 'ar'); if (u && out.indexOf(u) < 0) out.push(u); }
    return out;
  };
  // How many letters of text, from pos, this key press types (0: a wrong key).
  TT.match = function (text, pos, ev, lang) {
    var c = TT.candidates(ev, lang);
    for (var i = 0; i < c.length; i++) {
      var s = c[i], ok = pos + s.length <= text.length;
      for (var j = 0; ok && j < s.length; j++) ok = TT.same(s[j], text[pos + j]);
      if (ok) return s.length;
    }
    return 0;
  };
  // The key that types text[pos], and whether it needs Shift. Hamza forms light plain ا
  // (they are accepted); a lam followed by an alef lights the B key, printed «لا».
  TT.nextKey = function (text, pos, lang) {
    var c = text == null ? null : text[pos];
    if (c == null) return null;
    if (c === ' ') return { code: 'Space', shift: false };
    if (lang === 'ar' && c === 'ل' && /[اأإآ]/.test(text[pos + 1] || '')) return { code: 'KeyB', shift: false };
    if (lang === 'ar' && /[أإآٱ]/.test(c)) c = 'ا';
    var hit = BY_CHAR[lang === 'ar' ? 'ar' : 'en'][c] || BY_CHAR.en[c.toLowerCase()] || BY_CHAR.ar[c];
    if (!hit) return null;
    // Latin letters are matched without case: a lower-case key is enough.
    if (lang !== 'ar' && /[A-Z]/.test(c)) return { code: hit.code, shift: false };
    return { code: hit.code, shift: hit.shift };
  };
  // The key event a perfect typist sends for text[pos] (the scripted players use it).
  TT.perfectKey = function (text, pos, lang) {
    var k = TT.nextKey(text, pos, lang);
    if (!k) return null;
    return { key: TT.keyChar(k.code, k.shift, lang), code: k.code, shift: k.shift };
  };

  /* ------------------------------------------------------------ seeds */
  // mulberry32: 32-bit integer math only (Math.imul, >>>), identical in every JS engine.
  TT.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // Mixes a small number (a challenge code) into a well-spread 32-bit seed.
  TT.mixSeed = function (n) {
    var h = (n >>> 0) ^ 0x9E3779B9;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
  };
  function shuffle(list, r) {
    for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = list[i]; list[i] = list[j]; list[j] = t; }
    return list;
  }
  function split(s) { return String(s || '').trim().split(/\s+/).filter(Boolean); }

  /* ------------------------------------------------------------ levels */
  // One entry per DDA tier: 1 suits a six-year-old finding the keys one by one, 5 is a
  // real race for a ten-year-old. TT.HARDER says which way each knob moves.
  TT.TUNE = {
    fall: [7, 10, 13, 17, 22],          // px/s a cloud drifts down (times the world's factor)
    live: [1, 2, 2, 3, 4],              // clouds in the sky at once
    gap: [2.4, 2, 1.7, 1.4, 1.15],      // s between new clouds
    wait: [1, 1, 0, 0, 0],              // 1: clouds wait at the edge, never reach the town
    slow: [0.3, 0.45, 0.6, 0.75, 0.85], // drift speed while the child is typing that cloud
    mix: [0, 0.15, 0.3, 0.5, 0.7],      // share of harder words in worlds 2-5
    target: [4, 6, 9, 12, 16],          // words per minute for the third star (times the pace)
    extra: [0, 1, 2, 2, 3],             // more clouds per level
    guide: [1, 1, 0, 0, 0]              // a dotted line from the cloud's letter to its key
  };
  TT.HARDER = { fall: 1, live: 1, gap: -1, wait: -1, slow: 1, mix: 1, target: 1, extra: 1, guide: -1 };
  // Per world: drift and gap factors, most clouds at once, clouds per level, speed-target factor.
  TT.WORLD = [
    { fall: 1, live: 4, gap: 1, count: [12, 12, 14, 12], pace: 0.7, sample: { ar: 'ب', en: 'a' } },
    { fall: 0.95, live: 4, gap: 1, count: [10, 11, 12, 12], pace: 0.85, sample: { ar: 'قطة', en: 'cat' } },
    { fall: 0.85, live: 4, gap: 1.1, count: [9, 10, 11, 11], pace: 1, sample: { ar: 'أرنب', en: 'frog' } },
    { fall: 0.75, live: 3, gap: 1.3, count: [8, 9, 10, 10], pace: 1.1, sample: { ar: 'فراشة', en: 'tiger' } },
    { fall: 0.5, live: 2, gap: 2.4, count: [6, 6, 7, 7], pace: 1.15, sample: { ar: 'أحب أمي', en: 'a red hat' } }
  ];
  // Heights on screen: clouds slide in to READY_Y, waiting clouds stop near EDGE_Y and the
  // town starts at TOWN_Y (a cloud that gets there rains on it).
  TT.READY_Y = 150; TT.EDGE_Y = 292; TT.TOWN_Y = 350; TT.START_Y = -70;
  TT.plan = function (lang, w, l, tier) {
    var T = TT.TUNE, i = Math.max(0, Math.min(TT.TIERS - 1, (tier | 0) - 1)), wd = TT.WORLD[w];
    return {
      lang: lang, w: w, l: l, tier: i + 1,
      count: wd.count[l] + T.extra[i], fall: T.fall[i] * wd.fall, live: Math.min(T.live[i], wd.live), gap: T.gap[i] * wd.gap,
      wait: !!T.wait[i], slow: T.slow[i], mix: Math.min(0.9, T.mix[i] + l * 0.08), guide: !!T.guide[i],
      target: Math.round(T.target[i] * wd.pace * 10) / 10
    };
  };
  // The words of one level: a shuffled bag (every item once before any repeats), harder
  // words mixed in by the tier, no word twice in a row.
  TT.pool = function (lang, w, l) {
    var L = WORDS[lang] || {};
    if (w === 0) return { easy: split(L.w1 && L.w1[l]), hard: [] };
    if (w === 4) {
      var parts = String(L.w5 || '').split('||');
      var list = function (s) { return String(s || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean); };
      return { easy: list(parts[0]), hard: list(parts[1]) };
    }
    var halves = String(L['w' + (w + 1)] || '').split('|');
    return { easy: split(halves[0]), hard: split(halves[1]) };
  };
  TT.pickWords = function (plan, r) {
    var p = TT.pool(plan.lang, plan.w, plan.l), n = plan.count, hard = p.hard.length ? Math.round(n * plan.mix) : 0, out = [];
    function bag(list, k) {
      var b = [], got = [];
      while (got.length < k && list.length) {
        if (!b.length) b = shuffle(list.slice(), r);
        var x = b.pop();
        if (got.length && got[got.length - 1] === x && list.length > 1) { b.unshift(x); continue; }
        got.push(x);
      }
      return got;
    }
    out = bag(p.easy, n - hard).concat(bag(p.hard, hard));
    shuffle(out, r);
    for (var i = 1; i < out.length; i++) if (out[i] === out[i - 1]) { var j = (i + 1) % out.length, t = out[i]; out[i] = out[j]; out[j] = t; }
    return out;
  };

  /* ------------------------------------------------------- the world */
  TT.cloudWidth = function (text, lang) {
    var n = text.length;
    return n === 1 ? 150 : Math.max(150, 84 + n * (lang === 'ar' ? 23 : 27));
  };
  TT.create = function (plan, seed) {
    var r = TT.rng(seed), words = TT.pickWords(plan, r);
    return {
      plan: plan, r: r, t: 0, queue: words, total: words.length, clouds: [], nextId: 1, lock: 0, spawnT: 0.4, first: true,
      suns: TT.SUNS, hits: 0, errors: 0, chars: 0, done: 0, rained: 0, combo: 0, bestCombo: 0,
      activeT: 0, marks: [], over: false, won: false, ev: []
    };
  };
  function find(w, id) { for (var i = 0; i < w.clouds.length; i++) if (w.clouds[i].id === id) return w.clouds[i]; return null; }
  TT.find = find;
  // A cloud can be typed from the moment its word shows until it pops or rains.
  function typeable(c) { return (c.state === 'in' && c.y > 0) || c.state === 'fly' || c.state === 'wait'; }
  TT.typeable = typeable;
  function active(w) { var n = 0; for (var i = 0; i < w.clouds.length; i++) if (w.clouds[i].state === 'in' || w.clouds[i].state === 'fly' || w.clouds[i].state === 'wait') n++; return n; }
  // The cloud to type now: the one the child is typing, else the one nearest the town.
  TT.target = function (w) {
    var c = w.lock ? find(w, w.lock) : null;
    if (c) return c;
    for (var i = 0; i < w.clouds.length; i++) if (typeable(w.clouds[i]) && (!c || w.clouds[i].y > c.y)) c = w.clouds[i];
    return c;
  };
  TT.next = function (w) {
    var c = TT.target(w);
    return c ? { cloud: c, key: TT.nextKey(c.text, c.typed, w.plan.lang) } : null;
  };
  function spawn(w) {
    var lang = w.plan.lang, firsts = {};
    w.clouds.forEach(function (c) { if (c.state !== 'zap' && c.state !== 'rain') firsts[base(c.text[0])] = 1; });
    // A word that starts like one already in the sky waits its turn, so a first letter
    // always picks one cloud.
    var qi = 0;
    for (var i = 0; i < w.queue.length; i++) if (!firsts[base(w.queue[i][0])]) { qi = i; break; }
    var text = w.queue[qi], width = TT.cloudWidth(text, lang);
    var lo = width / 2 + 24, hi = TT.W - width / 2 - 24, best = null;
    for (var k = 0; k < 9; k++) {
      var x = lo + (hi - lo) * Math.max(0, Math.min(1, (k + (w.r() - 0.5) * 0.7) / 8)), room = 420;
      w.clouds.forEach(function (c) { if (c.state !== 'zap') room = Math.min(room, Math.abs(x - c.x) - (width + c.w) / 2); });
      // Ties (an empty sky) break at random, so clouds do not always start in one place.
      var score = room + w.r() * 60;
      if (!best || score > best.score) best = { x: x, room: room, score: score };
    }
    if (best.room < 36) return false; // no room yet (puffs and sway need some): try again next frame
    w.queue.splice(qi, 1);
    var c = { id: w.nextId++, text: text, typed: 0, x: Math.round(best.x), y: TT.START_Y, w: width, state: 'in', age: 0, shake: 0, t: 0,
      edge: TT.EDGE_Y - 14 + Math.round(w.r() * 28), phase: Math.round(w.r() * 628) / 100 };
    w.clouds.push(c);
    w.spawnT = 0; w.first = false;
    w.ev.push({ t: 'spawn', id: c.id });
    return true;
  }
  TT.step = function (w, dt) {
    if (w.over) return;
    w.t += dt;
    w.spawnT += dt;
    var n = active(w), P = w.plan;
    if (w.queue.length && n < P.live && (w.spawnT >= P.gap || (!n && w.spawnT >= 0.45))) spawn(w);
    var ready = false;
    for (var i = w.clouds.length - 1; i >= 0; i--) {
      var c = w.clouds[i];
      c.age += dt; c.t += dt; c.shake = Math.max(0, c.shake - dt);
      if (c.state === 'in') {
        c.y += Math.max(70, (TT.READY_Y - c.y) * 5) * dt;
        if (c.y >= TT.READY_Y) { c.y = TT.READY_Y; c.state = 'fly'; c.t = 0; }
      } else if (c.state === 'fly') {
        c.y += P.fall * (w.lock === c.id ? P.slow : 1) * dt;
        if (P.wait && c.y >= c.edge) { c.y = c.edge; c.state = 'wait'; c.t = 0; }
        else if (!P.wait && c.y >= TT.TOWN_Y) {
          c.y = TT.TOWN_Y; c.state = 'rain'; c.t = 0;
          if (w.lock === c.id) w.lock = 0;
          w.suns--; w.rained++; w.combo = 0;
          w.ev.push({ t: 'rain', id: c.id, x: c.x, y: c.y, suns: w.suns });
          if (w.suns <= 0) { w.over = true; w.won = false; w.ev.push({ t: 'lose' }); }
        }
      } else if ((c.state === 'zap' && c.t > 0.55) || (c.state === 'rain' && c.t > 1.5)) w.clouds.splice(i, 1);
      if (typeable(c)) ready = true;
    }
    if (ready) w.activeT += dt;
    if (!w.over && !w.queue.length && !w.clouds.length) { w.over = true; w.won = true; w.ev.push({ t: 'done' }); }
  };
  function good(w, c, n) {
    c.typed += n; w.hits++; w.chars += n; w.combo++;
    if (w.combo > w.bestCombo) w.bestCombo = w.combo;
    for (var k = 0; k < n; k++) w.marks.push(w.activeT);
    if (w.marks.length > 80) w.marks.splice(0, w.marks.length - 80);
    var done = c.typed >= c.text.length;
    w.ev.push({ t: 'key', id: c.id, n: n, combo: w.combo });
    if (done) {
      c.state = 'zap'; c.t = 0; w.lock = 0; w.done++;
      w.ev.push({ t: 'zap', id: c.id, x: c.x, y: c.y, text: c.text, combo: w.combo, done: w.done });
    }
  }
  // One key press. Returns the letters it typed, 0 when it is ignored and -1 for a wrong key.
  // Backspace is never needed: a wrong key only shakes the cloud (and counts for accuracy).
  TT.key = function (w, ev) {
    if (w.over || !TT.printable(ev)) return 0;
    var lang = w.plan.lang, c = w.lock ? find(w, w.lock) : null, n;
    if (c) {
      n = TT.match(c.text, c.typed, ev, lang);
      if (n) { good(w, c, n); return n; }
      if (TT.isSpace(ev)) return 0; // a space between words is never a mistake
    } else {
      // The first letter of any word in the sky picks that cloud (the one nearest the town first).
      var best = null, bn = 0;
      for (var i = 0; i < w.clouds.length; i++) {
        var o = w.clouds[i];
        if (!typeable(o)) continue;
        n = TT.match(o.text, 0, ev, lang);
        if (n && (!best || o.y > best.y)) { best = o; bn = n; }
      }
      if (best) { w.lock = best.id; w.ev.push({ t: 'lock', id: best.id }); good(w, best, bn); return bn; }
      if (TT.isSpace(ev)) return 0;
      c = TT.target(w);
      if (!c) return 0; // nothing to type yet: no cost
    }
    w.errors++; w.combo = 0; c.shake = 0.45;
    w.ev.push({ t: 'miss', id: c.id, x: c.x, y: c.y });
    return -1;
  };
  // Live speed for the running animal: letters in the last 6 s of typing time.
  TT.liveWpm = function (w) {
    var span = Math.max(2.5, Math.min(6, w.activeT)), n = 0;
    for (var i = w.marks.length - 1; i >= 0 && w.marks[i] >= w.activeT - span; i--) n++;
    return n / 5 / (span / 60);
  };
  TT.wpm = function (chars, seconds) { return seconds > 0 ? Math.round(chars / 5 / (seconds / 60) * 10) / 10 : 0; };
  TT.result = function (w) {
    var acc = w.hits + w.errors ? w.hits / (w.hits + w.errors) : 1;
    return { won: w.won, suns: w.suns, hits: w.hits, errors: w.errors, acc: acc, chars: w.chars, time: w.activeT,
      wpm: TT.wpm(w.chars, Math.max(1, w.activeT)), target: w.plan.target, done: w.done, total: w.total, rained: w.rained, bestCombo: w.bestCombo };
  };
  // Finishing earns a star; then accuracy of 90 % or better a second; then the tier's speed a third.
  TT.stars = function (r) { return !r.won ? 0 : r.acc < 0.9 ? 1 : r.wpm >= r.target ? 3 : 2; };
  // 0..1 for Kit.dda: accuracy, speed against the target and the suns kept.
  TT.outcome = function (r) {
    var x;
    if (!r.won) x = 0.25 * r.done / Math.max(1, r.total);
    else x = 0.35 + 0.35 * Math.max(0, Math.min(1, (r.acc - 0.6) / 0.35)) + 0.3 * Math.min(1, r.wpm / Math.max(1, r.target)) - 0.08 * (TT.SUNS - r.suns);
    return Math.round(Math.max(0, Math.min(1, x)) * 1000) / 1000;
  };
  // The speed animals: snail, turtle, rabbit, horse, cheetah, rocket (words per minute).
  TT.ANIMALS = ['snail', 'turtle', 'rabbit', 'horse', 'cheetah', 'rocket'];
  TT.ANIMAL_WPM = [0, 4, 8, 14, 22, 32];
  TT.animal = function (wpm) { var a = 0; for (var i = 0; i < TT.ANIMAL_WPM.length; i++) if (wpm >= TT.ANIMAL_WPM[i]) a = i; return a; };

  /* ---------------------------------------------------- the speed test */
  // Class challenge presets: the first digit of a 4-digit code.
  TT.PRESETS = {
    1: { lang: 'en', dur: 30, kind: 'test' }, 2: { lang: 'en', dur: 60, kind: 'test' },
    3: { lang: 'ar', dur: 30, kind: 'test' }, 4: { lang: 'ar', dur: 60, kind: 'test' },
    5: { lang: 'en', dur: 30, kind: 'easy' }, 6: { lang: 'ar', dur: 30, kind: 'easy' }
  };
  // "3417" -> { code, preset, lang, dur, kind, seed }; Arabic-Indic digits are fine too.
  TT.parseCode = function (str) {
    str = String(str == null ? '' : str).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x6F0); }).replace(/\s+/g, '');
    if (!/^[1-9]\d{3}$/.test(str) || !TT.PRESETS[+str[0]]) return null;
    var p = TT.PRESETS[+str[0]];
    return { code: str, preset: +str[0], lang: p.lang, dur: p.dur, kind: p.kind, seed: TT.mixSeed(+str + 7919) };
  };
  TT.makeCode = function (preset, num) { return String(preset) + ('00' + Math.max(0, Math.min(999, num | 0))).slice(-3); };
  // Words for a test: deterministic for a seed (no word again within five).
  TT.wordGen = function (lang, kind, seed) {
    var r = TT.rng(seed), pool = split((WORDS[lang] || {})[kind === 'easy' ? 'easy' : 'test']), recent = [];
    return {
      take: function (n) {
        var out = [];
        for (var i = 0; i < n && pool.length; i++) {
          var x, tries = 0;
          do { x = pool[Math.floor(r() * pool.length)]; } while (recent.indexOf(x) >= 0 && ++tries < 12);
          recent.push(x);
          if (recent.length > 5) recent.shift();
          out.push(x);
        }
        return out;
      }
    };
  };
  TT.test = function (o) {
    var gen = TT.wordGen(o.lang, o.kind, o.seed);
    return { lang: o.lang, dur: o.dur, kind: o.kind || 'test', gen: gen, words: gen.take(40), wi: 0, ci: 0, t: 0, started: false, over: false,
      hits: 0, errors: 0, combo: 0, bestCombo: 0, marks: [], ev: [] };
  };
  TT.testWord = function (s) { return s.words[s.wi] || ''; };
  // One key press in the test: letters only advance when right; a finished word needs a space.
  TT.testKey = function (s, ev) {
    if (s.over || !TT.printable(ev)) return 0;
    if (s.wi > s.words.length - 20) s.words = s.words.concat(s.gen.take(20));
    if (!s.started) { s.started = true; s.ev.push({ t: 'start' }); }
    var word = s.words[s.wi], n = 0;
    if (s.ci >= word.length) {
      if (TT.isSpace(ev)) { s.wi++; s.ci = 0; n = 1; s.ev.push({ t: 'word', wi: s.wi }); }
    } else {
      n = TT.match(word, s.ci, ev, s.lang);
      s.ci += n;
    }
    if (n > 0) {
      s.hits++; s.combo++; s.bestCombo = Math.max(s.bestCombo, s.combo);
      for (var k = 0; k < n; k++) s.marks.push(s.t);
      if (s.marks.length > 120) s.marks.splice(0, s.marks.length - 120);
      s.ev.push({ t: 'key', n: n, combo: s.combo });
      return n;
    }
    s.errors++; s.combo = 0;
    s.ev.push({ t: 'miss' });
    return -1;
  };
  TT.testStep = function (s, dt) {
    if (!s.started || s.over) return;
    s.t = Math.min(s.dur, s.t + dt);
    if (s.t >= s.dur - 1e-9) { s.t = s.dur; s.over = true; s.ev.push({ t: 'over' }); }
  };
  TT.testLiveWpm = function (s) {
    var span = Math.max(2.5, Math.min(6, s.t)), n = 0;
    for (var i = s.marks.length - 1; i >= 0 && s.marks[i] >= s.t - span; i--) n++;
    return n / 5 / (span / 60);
  };

  /* -------------------------------------- results (Monkeytype's rules) */
  TT.roundTo2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };
  // Character counts by Monkeytype's published rules (the previous version of this game
  // used the same ones): hist = what was typed per word (the last entry is the word being
  // typed when time ran out), words = the target words.
  TT.countChars = function (hist, words) {
    var correctWordChars = 0, allCorrectChars = 0, incorrectChars = 0, extraChars = 0, missedChars = 0, spaces = 0, correctSpaces = 0;
    for (var i = 0; i < hist.length; i++) {
      var input = hist[i], word = words[i] || '';
      if (input === '') continue;
      var same = input.length === word.length;
      for (var c = 0; same && c < word.length; c++) same = TT.same(input[c], word[c]);
      if (same) {
        correctWordChars += word.length; allCorrectChars += word.length;
        if (i < hist.length - 1) correctSpaces++;
      } else {
        var ok = 0, bad = 0;
        for (var d = 0; d < Math.max(word.length, input.length); d++) {
          if (d >= input.length) { if (i < hist.length - 1) missedChars++; } else if (d >= word.length) extraChars++;
          else if (TT.same(input[d], word[d])) ok++; else bad++;
        }
        allCorrectChars += ok; incorrectChars += bad;
        // the word being typed when time ran out: its correct letters still count
        if (i === hist.length - 1 && !bad && input.length < word.length) correctWordChars += ok;
      }
      if (i < hist.length - 1) spaces++;
    }
    return { correctWordChars: correctWordChars, allCorrectChars: allCorrectChars, incorrectChars: incorrectChars, extraChars: extraChars,
      missedChars: missedChars, spaces: spaces, correctSpaces: correctSpaces };
  };
  // wpm = (letters of correct words + correct spaces) / 5 per minute; raw adds every other key.
  TT.wpmRaw = function (cc, seconds, wrongKeys) {
    var f = 60 / seconds / 5;
    return { wpm: TT.roundTo2((cc.correctWordChars + cc.correctSpaces) * f),
      raw: TT.roundTo2((cc.allCorrectChars + cc.spaces + cc.incorrectChars + cc.extraChars + (wrongKeys || 0)) * f) };
  };
  TT.testResult = function (s) {
    var hist = s.words.slice(0, s.wi);
    hist.push((s.words[s.wi] || '').slice(0, s.ci));
    var cc = TT.countChars(hist, s.words), secs = Math.max(0.5, s.started ? s.t : 0.5), wr = TT.wpmRaw(cc, secs, s.errors);
    var total = s.hits + s.errors;
    return { wpm: wr.wpm, raw: wr.raw, acc: total ? TT.roundTo2(s.hits / total * 100) : 0, seconds: TT.roundTo2(secs), words: s.wi,
      hits: s.hits, errors: s.errors, lang: s.lang, dur: s.dur, animal: TT.animal(wr.wpm) };
  };

  /* ------------------------------------------------------------ saves */
  // { v: 2, lang: '' | 'ar' | 'en' (the last language picked), stars: { ar|en: [world][level] 0..3 },
  //   coach: the first-time coach was finished, tlang, tdur: the speed test's last choice,
  //   best: { ar30, ar60, en30, en60 } best words per minute, tests: the last 20 test results
  //   [{ k: 'ar30', w: wpm, a: accuracy %, c: 1 for a class challenge }] }
  function grid() { var g = []; for (var w = 0; w < TT.WORLDS; w++) g.push([0, 0, 0, 0]); return g; }
  TT.TEST_KEYS = ['ar30', 'ar60', 'en30', 'en60'];
  TT.freshSave = function () {
    return { v: 2, lang: '', stars: { ar: grid(), en: grid() }, coach: false, tlang: '', tdur: 30, best: { ar30: 0, ar60: 0, en30: 0, en60: 0 }, tests: [] };
  };
  function int(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function num(v, lo, hi) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  // Every field is checked: an old, damaged or hand-edited save loads as a playable one.
  TT.loadSave = function (raw) {
    var s = TT.freshSave();
    if (!obj(raw)) return s;
    if (raw.lang === 'ar' || raw.lang === 'en') s.lang = raw.lang;
    if (raw.tlang === 'ar' || raw.tlang === 'en') s.tlang = raw.tlang;
    if (raw.tdur === 60) s.tdur = 60;
    s.coach = raw.coach === true;
    TT.LANGS.forEach(function (lang) {
      var g = obj(raw.stars) && Array.isArray(raw.stars[lang]) ? raw.stars[lang] : [];
      for (var w = 0; w < TT.WORLDS; w++) for (var l = 0; l < TT.LEVELS; l++) {
        var v = Array.isArray(g[w]) ? g[w][l] : 0;
        s.stars[lang][w][l] = int(v, 0, 3) ? v : 0;
      }
    });
    TT.TEST_KEYS.forEach(function (k) { var v = obj(raw.best) ? raw.best[k] : 0; s.best[k] = num(v, 0, 400) ? TT.roundTo2(v) : 0; });
    if (Array.isArray(raw.tests)) raw.tests.slice(-20).forEach(function (e) {
      if (obj(e) && TT.TEST_KEYS.indexOf(e.k) >= 0 && num(e.w, 0, 400) && num(e.a, 0, 100)) s.tests.push({ k: e.k, w: TT.roundTo2(e.w), a: TT.roundTo2(e.a), c: e.c === 1 ? 1 : 0 });
    });
    return s;
  };
  // Adds a finished test; returns true for a new personal best.
  TT.addTest = function (s, lang, dur, r, isClass) {
    var k = lang + dur;
    if (TT.TEST_KEYS.indexOf(k) < 0) return false;
    s.tests.push({ k: k, w: TT.roundTo2(r.wpm), a: TT.roundTo2(r.acc), c: isClass ? 1 : 0 });
    if (s.tests.length > 20) s.tests.splice(0, s.tests.length - 20);
    if (!(r.wpm > s.best[k])) return false;
    s.best[k] = TT.roundTo2(r.wpm);
    return true;
  };
  TT.total = function (s, lang) {
    var n = 0;
    (lang ? [lang] : TT.LANGS).forEach(function (g) { s.stars[g].forEach(function (row) { row.forEach(function (v) { n += v; }); }); });
    return n;
  };
  // A world opens when the one before it is finished, or straight away for a child who
  // aced its first level with three stars (experts need not type every single letter).
  TT.worldOpen = function (s, lang, w) {
    var g = s.stars[lang];
    return w === 0 || g[w - 1][3] > 0 || g[w - 1][0] === 3 || g[w].some(Boolean);
  };
  TT.isOpen = function (s, lang, w, l) {
    if (!TT.worldOpen(s, lang, w)) return false;
    var g = s.stars[lang][w];
    return l === 0 || g[l - 1] > 0 || g[l] > 0;
  };
  // The first open level without a star, else the last level.
  TT.nextLevel = function (s, lang) {
    for (var w = 0; w < TT.WORLDS; w++) for (var l = 0; l < TT.LEVELS; l++) if (TT.isOpen(s, lang, w, l) && !s.stars[lang][w][l]) return { w: w, l: l };
    return { w: TT.WORLDS - 1, l: TT.LEVELS - 1 };
  };
})();
