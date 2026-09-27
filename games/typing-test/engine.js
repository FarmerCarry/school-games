/*
 * أصابع البرق — engine: pure logic, no DOM.
 *   - seeded PRNG + word generation (challenge codes must give EXACTLY the same words on every PC,
 *     so nothing in the generation path may use Math.random)
 *   - lenient hamza matching
 *   - Monkeytype's result formulas (countChars / wpm / raw / acc / consistency)
 * Exposed as window.TTEngine. Runs in the browser and in Node (vm) for tests.
 */
(function () {
  'use strict';

  var E = {};
  var W = window.TT_WORDS;

  /* ------------------------------------------------------------ settings */
  E.MODES = ['time', 'words', 'sentences'];
  E.AMOUNTS = { time: [15, 30, 60], words: [10, 25, 50], sentences: [3, 5, 10] };
  E.MAX_EXTRA = 20; // extra letters allowed past a word's end (like Monkeytype)

  // Class challenge presets: the first digit of a 4-digit code.
  E.PRESETS = {
    1: { lang: 'en', mode: 'time', amt: 15 },
    2: { lang: 'en', mode: 'time', amt: 30 },
    3: { lang: 'en', mode: 'time', amt: 60 },
    4: { lang: 'ar', mode: 'time', amt: 15 },
    5: { lang: 'ar', mode: 'time', amt: 30 },
    6: { lang: 'ar', mode: 'time', amt: 60 },
    7: { lang: 'en', mode: 'words', amt: 25 },
    8: { lang: 'ar', mode: 'words', amt: 25 },
    9: { lang: 'ar', mode: 'sentences', amt: 3 }
  };

  /* ---------------------------------------------------------------- PRNG */
  // mulberry32: 32-bit integer math only (Math.imul, >>>), identical in every JS engine.
  E.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // Mixes a small number (e.g. a challenge code) into a well-spread 32-bit seed.
  E.mixSeed = function (n) {
    var h = (n >>> 0) ^ 0x9E3779B9;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
  };

  /* ------------------------------------------------------ challenge codes */
  // "5372" -> { code: '5372', preset: 5, num: 372, lang, mode, amt, seed }
  E.parseCode = function (str) {
    str = String(str == null ? '' : str).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x6F0); }).replace(/\s+/g, '');
    if (!/^[1-9]\d{3}$/.test(str)) return null;
    var p = E.PRESETS[+str[0]];
    var num = +str.slice(1);
    // pick: sentence presets choose their sentences from the code number one-to-one (see E.generator),
    // so two different codes never give the same text.
    return { code: str, preset: +str[0], num: num, lang: p.lang, mode: p.mode, amt: p.amt, seed: E.mixSeed(+str + 7919),
      pick: p.mode === 'sentences' ? num : null };
  };
  E.makeCode = function (preset, num) {
    num = Math.max(0, Math.min(999, num | 0));
    return String(preset) + ('00' + num).slice(-3);
  };

  /* ---------------------------------------------------- word generation */
  function binom(n, k) {
    if (k < 0 || k > n) return 0;
    var c = 1;
    for (var i = 1; i <= k; i++) c = c * (n - k + i) / i; // exact: every partial product is an integer
    return Math.round(c);
  }
  function gcd(a, b) { while (b) { var t = a % b; a = b; b = t; } return a; }
  // The rank-th (0-based, lexicographic) set of k different indexes out of 0..n-1.
  function unrankCombination(n, k, rank) {
    var out = [], x = 0;
    for (var i = 0; i < k; i++) {
      for (;;) { var c = binom(n - x - 1, k - i - 1); if (rank < c) break; rank -= c; x++; }
      out.push(x); x++;
    }
    return out;
  }
  // Challenge code number (0..999) -> a DIFFERENT set of sentences for every number:
  // rank = num * K mod C(n, k) with K coprime to C(n, k) is one-to-one while C(n, k) > 999.
  function pickSentences(n, k, num) {
    var total = binom(n, k);
    if (total < 1000) return null;
    var K = 4099;
    while (gcd(K, total) !== 1) K++;
    return unrankCombination(n, k, (num * K + 1237) % total);
  }

  // Returns a generator: gen.take(n) -> array of words. Deterministic for a given seed
  // (and pick = the challenge code number, for sentence challenges).
  E.generator = function (lang, mode, amt, seed, pick) {
    var r = E.rng(seed);
    if (mode === 'sentences') {
      var list = lang === 'ar' ? W.arS : W.enS;
      var idx = pick != null ? pickSentences(list.length, Math.min(amt, list.length), pick) : null;
      if (!idx) { idx = []; for (var i = 0; i < list.length; i++) idx.push(i); }
      for (var j = idx.length - 1; j > 0; j--) { // shuffle (the order of the chosen sentences, for a pick)
        var k = Math.floor(r() * (j + 1));
        var t = idx[j]; idx[j] = idx[k]; idx[k] = t;
      }
      var words = [];
      for (var s = 0; s < Math.min(amt, idx.length); s++) words = words.concat(list[idx[s]].split(' '));
      var pos = 0;
      return { finite: true, total: words.length, take: function (n) { var out = words.slice(pos, pos + n); pos += out.length; return out; } };
    }
    var pool = lang === 'ar' ? W.ar : W.en;
    var recent = [];
    function next() {
      var w, tries = 0;
      do { w = pool[Math.floor(r() * pool.length)]; } while (recent.indexOf(w) >= 0 && ++tries < 12);
      recent.push(w);
      if (recent.length > 5) recent.shift();
      return w;
    }
    var made = 0;
    var finite = mode === 'words';
    return {
      finite: finite,
      total: finite ? amt : Infinity,
      take: function (n) {
        var out = [];
        for (var i = 0; i < n && (!finite || made < amt); i++, made++) out.push(next());
        return out;
      }
    };
  };

  /* ----------------------------------------------------- lenient matching */
  // Lenient mode: the hamza/taa-marbuta/alef-maqsura look-alikes count as the same letter,
  // in both directions. Also Arabic vs Latin comma / question mark / semicolon.
  var LENIENT = {
    'أ': 'ا', 'إ': 'ا', 'آ': 'ا', // أ إ آ -> ا
    'ة': 'ه',                                         // ة -> ه
    'ى': 'ي', 'ئ': 'ي',                     // ى ئ -> ي
    'ؤ': 'و',                                         // ؤ -> و
    '،': ',', '؟': '?', '؛': ';'                 // ، ؟ ؛
  };
  E.norm = function (c) { return LENIENT[c] || c; };
  E.charEq = function (typed, target, lenient) {
    return typed === target || (!!lenient && (LENIENT[typed] || typed) === (LENIENT[target] || target));
  };
  E.wordEq = function (typed, target, lenient) {
    if (typed === target) return true;
    if (!lenient || typed.length !== target.length) return false;
    for (var i = 0; i < typed.length; i++) if (!E.charEq(typed[i], target[i], true)) return false;
    return true;
  };

  /* ------------------------------------------------------- script checks */
  E.isArabicChar = function (c) { var n = c.charCodeAt(0); return (n >= 0x0600 && n <= 0x06FF) || (n >= 0xFB50 && n <= 0xFEFF && n !== 0xFEFF); };
  E.isLatinLetter = function (c) { return /^[A-Za-z]$/.test(c); };
  // Some systems send the lam-alef key as one presentation-form glyph (ﻻ); split it into ل + ا.
  E.cleanKey = function (k) {
    if (/[ﭐ-ﻼ]/.test(k) && k.normalize) k = k.normalize('NFKC');
    return k;
  };

  /* ------------------------------------------------- Monkeytype formulas */
  E.roundTo2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };

  // Port of Monkeytype's countChars(). hist = typed input per word (last entry = the word being
  // typed when the test ended, possibly ''), words = target words.
  E.countChars = function (hist, words, mode, lenient) {
    var correctWordChars = 0, correctChars = 0, incorrectChars = 0, extraChars = 0, missedChars = 0, spaces = 0, correctSpaces = 0;
    for (var i = 0; i < hist.length; i++) {
      var input = hist[i], word = words[i] || '';
      if (input === '') continue; // last word that was not started
      if (E.wordEq(input, word, lenient)) {
        correctWordChars += word.length;
        correctChars += word.length;
        if (i < hist.length - 1) correctSpaces++;
      } else if (input.length >= word.length) {
        for (var c = 0; c < input.length; c++) {
          if (c < word.length) { if (E.charEq(input[c], word[c], lenient)) correctChars++; else incorrectChars++; }
          else extraChars++;
        }
      } else {
        var ok = 0, bad = 0, miss = 0;
        for (var d = 0; d < word.length; d++) {
          if (d < input.length) { if (E.charEq(input[d], word[d], lenient)) ok++; else bad++; }
          else miss++;
        }
        correctChars += ok;
        incorrectChars += bad;
        if (i === hist.length - 1 && mode === 'time') {
          // the word being typed when time ran out: its correct letters still count
          if (bad === 0) correctWordChars += ok;
        } else missedChars += miss;
      }
      if (i < hist.length - 1) spaces++;
    }
    return { spaces: spaces, correctWordChars: correctWordChars, allCorrectChars: correctChars, incorrectChars: incorrectChars,
      extraChars: extraChars, missedChars: missedChars, correctSpaces: correctSpaces };
  };

  E.wpmRaw = function (cc, seconds) {
    var f = 60 / seconds / 5;
    return {
      wpm: E.roundTo2((cc.correctWordChars + cc.correctSpaces) * f),
      raw: E.roundTo2((cc.allCorrectChars + cc.spaces + cc.incorrectChars + cc.extraChars) * f)
    };
  };

  E.mean = function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; };
  E.stdDev = function (a) {
    if (!a.length) return 0;
    var m = E.mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / a.length);
  };
  // Monkeytype maps the coefficient of variation to 0..100 with this curve ("kogasa");
  // for small variation it is ~ 100 − CoV%.
  E.kogasa = function (cov) { return 100 * (1 - Math.tanh(cov + Math.pow(cov, 3) / 3 + Math.pow(cov, 5) / 5)); };
  E.consistency = function (rawPerSecond) {
    var m = E.mean(rawPerSecond);
    if (!rawPerSecond.length || !m) return 0;
    var c = E.roundTo2(E.kogasa(E.stdDev(rawPerSecond) / m));
    return isNaN(c) ? 0 : Math.max(0, Math.min(100, c));
  };

  // Everything the results screen needs.
  // o = { hist, words, mode, lenient, seconds, correctKeys, incorrectKeys, keys:[per-second keypress counts],
  //       errs:[per-second error counts], wpmHist:[cumulative wpm at each whole second] }
  E.results = function (o) {
    var cc = E.countChars(o.hist, o.words, o.mode, o.lenient);
    var secs = Math.max(0.01, o.seconds);
    var wr = E.wpmRaw(cc, secs);
    var total = o.correctKeys + o.incorrectKeys;
    var acc = total ? E.roundTo2(o.correctKeys / total * 100) : 0;
    var full = Math.floor(secs + 1e-6), frac = secs - full;
    var rawPS = [], errPS = [], wpmPS = [], xs = [];
    for (var s = 0; s < full; s++) {
      rawPS.push(Math.round(((o.keys[s] || 0) / 5) * 60));
      errPS.push(o.errs[s] || 0);
      wpmPS.push(o.wpmHist[s] != null ? o.wpmHist[s] : wr.wpm);
      xs.push(s + 1);
    }
    // A last partial second counts (scaled) only if it is at least half a second long;
    // a tiny sliver would show a fake speed spike.
    if (frac >= 0.5) {
      rawPS.push(Math.round(((o.keys[full] || 0) / 5) * 60 / frac));
      errPS.push(o.errs[full] || 0);
      wpmPS.push(wr.wpm);
      xs.push(E.roundTo2(secs));
    } else if (frac > 1e-6 && errPS.length) {
      errPS[errPS.length - 1] += o.errs[full] || 0;
      wpmPS[wpmPS.length - 1] = wr.wpm;
    }
    if (!xs.length) { rawPS.push(wr.raw); errPS.push(o.errs[0] || 0); wpmPS.push(wr.wpm); xs.push(E.roundTo2(secs)); }
    return {
      wpm: wr.wpm, raw: wr.raw, acc: acc, consistency: E.consistency(rawPS),
      // Like Monkeytype's charStats: "correct" = letters of correctly typed words + correct spaces,
      // so correct / 5 / minutes = wpm (correct letters inside wrong words are not in any column).
      chars: [cc.correctWordChars + cc.correctSpaces, cc.incorrectChars, cc.extraChars, cc.missedChars],
      seconds: E.roundTo2(secs), correctKeys: o.correctKeys, incorrectKeys: o.incorrectKeys,
      chart: { x: xs, wpm: wpmPS, raw: rawPS, err: errPS }, counts: cc
    };
  };

  /* -------------------------------------------------------------- badges */
  E.BADGES = [
    { min: 0, icon: '🐢', name: 'السلحفاة الصبورة' },
    { min: 10, icon: '🐇', name: 'الأرنب النشيط' },
    { min: 20, icon: '🐎', name: 'الحصان السريع' },
    { min: 30, icon: '🐆', name: 'الفهد الخاطف' },
    { min: 45, icon: '🚀', name: 'الصاروخ' }
  ];
  E.badge = function (wpm) {
    var b = 0;
    for (var i = 0; i < E.BADGES.length; i++) if (wpm >= E.BADGES[i].min) b = i;
    return { i: b, cur: E.BADGES[b], next: E.BADGES[b + 1] || null };
  };

  window.TTEngine = E;
})();
