/* Keyboard Obby (مغامرة الكيبورد) engine: the school keyboard as a giant obstacle course.
 * The keyboard table, the five worlds and their levels, the course built from each level
 * (the path of keys, crumbly keys, sinking keys, bumper bars, coins, gems, checkpoints),
 * the hero's hops, the rising jelly, stars, DDA outcomes, the shop and saves.
 * Pure: no DOM, no Kit, no timers and no Math.random (a course comes from a fixed seed),
 * so tools/tests/keyboard-obby-engine.test.mjs loads it with { window: {} } and plays
 * every level with scripted players. game.js reads Kit.dda, feeds the child's real key
 * presses and turns the events into pictures and sound; art.js draws the course.
 * Units: one key unit (the width of a letter key). x runs 0..15 from the left edge of the
 * keyboard, z runs 0..5 from the number row (far) to the space row (near), y is up with
 * the key tops at 0. */
(function () {
  'use strict';
  var KO = window.KO = window.KO || {};
  KO.TIERS = 5;
  KO.KB_W = 15; KO.KB_ROWS = 5;

  /* ------------------------------------------------------------ keyboard */
  // THE KEYBOARD TABLE: the school's Dell keyboard with the Windows Arabic 101 layout (the
  // same table as games/key-runner/engine.js). Rows are physical and never mirrored. Each
  // key: code (KeyboardEvent.code, the physical key, so it works whichever language Windows
  // types), the Latin legend, the Arabic legend (the Arabic-Indic digit on a digit key), the
  // finger (0-3 left pinky..index, 4-7 right index..pinky, 8 thumbs, -1 a key the game never
  // asks for), the width in key units and the Shift sign printed top-left on digit and sign keys.
  var ROWS = [
    [['Backquote', '`', 'ذ', 0, 1, '~'], ['Digit1', '1', '١', 0, 1, '!'], ['Digit2', '2', '٢', 1, 1, '@'], ['Digit3', '3', '٣', 2, 1, '#'],
      ['Digit4', '4', '٤', 3, 1, '$'], ['Digit5', '5', '٥', 3, 1, '%'], ['Digit6', '6', '٦', 4, 1, '^'], ['Digit7', '7', '٧', 4, 1, '&'],
      ['Digit8', '8', '٨', 5, 1, '*'], ['Digit9', '9', '٩', 6, 1, '('], ['Digit0', '0', '٠', 7, 1, ')'], ['Minus', '-', '', -1, 1, '_'],
      ['Equal', '=', '', -1, 1, '+'], ['Backspace', '', '', -1, 2]],
    [['Tab', 'Tab', '', -1, 1.5], ['KeyQ', 'Q', 'ض', 0], ['KeyW', 'W', 'ص', 1], ['KeyE', 'E', 'ث', 2], ['KeyR', 'R', 'ق', 3],
      ['KeyT', 'T', 'ف', 3], ['KeyY', 'Y', 'غ', 4], ['KeyU', 'U', 'ع', 4], ['KeyI', 'I', 'ه', 5], ['KeyO', 'O', 'خ', 6],
      ['KeyP', 'P', 'ح', 7], ['BracketLeft', '[', 'ج', 7, 1, '{'], ['BracketRight', ']', 'د', 7, 1, '}'], ['Backslash', '\\', '', -1, 1.5, '|']],
    [['CapsLock', 'Caps Lock', '', -1, 1.75], ['KeyA', 'A', 'ش', 0], ['KeyS', 'S', 'س', 1], ['KeyD', 'D', 'ي', 2], ['KeyF', 'F', 'ب', 3],
      ['KeyG', 'G', 'ل', 3], ['KeyH', 'H', 'ا', 4], ['KeyJ', 'J', 'ت', 4], ['KeyK', 'K', 'ن', 5], ['KeyL', 'L', 'م', 6],
      ['Semicolon', ';', 'ك', 7, 1, ':'], ['Quote', '\'', 'ط', 7, 1, '"'], ['Enter', 'Enter', '', -1, 2.25]],
    [['ShiftLeft', 'Shift', '', -1, 2.25], ['KeyZ', 'Z', 'ئ', 0], ['KeyX', 'X', 'ء', 1], ['KeyC', 'C', 'ؤ', 2], ['KeyV', 'V', 'ر', 3],
      ['KeyB', 'B', 'لا', 3], ['KeyN', 'N', 'ى', 4], ['KeyM', 'M', 'ة', 4], ['Comma', ',', 'و', 5, 1, '<'], ['Period', '.', 'ز', 6, 1, '>'],
      ['Slash', '/', 'ظ', 7, 1, '?'], ['ShiftRight', 'Shift', '', -1, 2.75]],
    [['ControlLeft', 'Ctrl', '', -1, 1.25], ['MetaLeft', '', '', -1, 1.25], ['AltLeft', 'Alt', '', -1, 1.25], ['Space', 'Space', 'مسافة', 8, 6.25],
      ['AltRight', 'Alt', '', -1, 1.25], ['MetaRight', '', '', -1, 1.25], ['ContextMenu', '', '', -1, 1.25], ['ControlRight', 'Ctrl', '', -1, 1.25]]
  ];
  KO.ROWS = ROWS;
  KO.KEYS = [];
  KO.KEY = {};
  ROWS.forEach(function (row, r) {
    var x = 0;
    row.forEach(function (k) {
      var w = k[4] || 1;
      var key = { code: k[0], lat: k[1], ar: k[2], finger: k[3], row: r, x: x, w: w, sym: k[5] || '', letter: /^Key/.test(k[0]),
        digit: /^Digit/.test(k[0]), cx: x + w / 2, cz: r + 0.5, i: KO.KEYS.length };
      KO.KEYS.push(key); KO.KEY[key.code] = key;
      x += w;
    });
  });
  // A key the game can ask for or count as a wrong press: letters, digits, signs, ` and Space.
  KO.isGameKey = function (code) { var k = KO.KEY[code]; return !!k && k.finger >= 0; };
  // The number pad types the same digits as the number row.
  KO.norm = function (code) {
    var m = /^Numpad([0-9])$/.exec(code || '');
    return m ? 'Digit' + m[1] : String(code || '');
  };
  // Arabic letter -> the key that types it on the Arabic (101) layout without Shift.
  KO.AR_CODE = {};
  KO.KEYS.forEach(function (k) { if (k.finger >= 0 && k.finger < 8 && k.ar.length === 1 && !k.digit) KO.AR_CODE[k.ar] = k.code; });
  // What the prompt bubble shows for a key: the Arabic letter or the Latin one. Digits are
  // shown as 0-9 in both languages (the site writes numbers with Western digits).
  KO.LANGS = ['ar', 'en'];
  KO.label = function (code, lang) {
    var k = KO.KEY[code];
    if (!k) return '';
    if (k.code === 'Space') return lang === 'en' ? 'Space' : 'مسافة';
    if (k.digit || lang === 'en' || !k.ar) return k.lat;
    return k.ar;
  };

  /* -------------------------------------------------------------- worlds */
  var SYM = { ';': 'Semicolon', '\'': 'Quote', '[': 'BracketLeft', ']': 'BracketRight', ',': 'Comma', '.': 'Period', '/': 'Slash', '`': 'Backquote', '_': 'Space' };
  function codeOf(c) { return SYM[c] || (/^[0-9]$/.test(c) ? 'Digit' + c : /^[A-Z]$/.test(c) ? 'Key' + c : c); }
  function codes(s) { return String(s || '').split(' ').filter(Boolean).map(codeOf); }
  KO.codes = codes;
  var HOME = 'A S D F G H J K L ; \'', TOP = 'Q W E R T Y U I O P [ ]', BOTTOM = 'Z X C V B N M , . /', DIGITS = '1 2 3 4 5 6 7 8 9 0';
  var LETTERS = HOME + ' ' + TOP + ' ' + BOTTOM;
  // Each level: keys (the keys the path may use), fresh (new keys, each twice first), n (keys
  // on the path), seq (a fixed path instead), words { ar, en } (the path spells them, with
  // Space between them when space is set), and how many coins, gems, crumbly keys (crumble),
  // sinking keys (sink) and bumper bars (bump) the course gets.
  KO.WORLDS = [
    { id: 'home', name: 'الصف الأوسط', levels: [
      { fresh: 'F J', keys: 'F J', n: 8, coins: 3 },
      { fresh: 'D K', keys: 'F J D K', n: 10, coins: 3 },
      { fresh: 'S L', keys: 'F J D K S L', n: 12, coins: 3, crumble: 1 },
      { fresh: 'A ;', keys: 'A S D F J K L ;', n: 14, coins: 4, crumble: 2, gems: 1 },
      { fresh: 'G H', keys: HOME, n: 16, coins: 4, crumble: 2, gems: 1 },
      { words: { ar: ['بيت', 'شمس', 'كتاب'], en: ['DAD', 'FLAG', 'SALAD'] }, coins: 4, crumble: 2, gems: 1 }] },
    { id: 'top', name: 'الصف العلوي', levels: [
      { fresh: 'R U', keys: 'F J R U', n: 10, coins: 3, sink: 1 },
      { fresh: 'E I', keys: 'D K E I R U', n: 12, coins: 3, sink: 1 },
      { fresh: 'W O', keys: 'S L W O E I', n: 12, coins: 3, sink: 1, crumble: 1 },
      { fresh: 'Q P', keys: 'Q W E R U I O P A ;', n: 14, coins: 4, sink: 2, crumble: 1, gems: 1 },
      { fresh: 'T Y [ ]', keys: TOP, n: 16, coins: 4, sink: 2, crumble: 2, gems: 1 },
      { words: { ar: ['فيل', 'قلم', 'تفاح'], en: ['PIG', 'KITE', 'FROG'] }, coins: 4, sink: 1, crumble: 2, gems: 1 }] },
    { id: 'bottom', name: 'الصف السفلي', levels: [
      { fresh: 'V M', keys: 'F J V M', n: 10, coins: 3, bump: 1 },
      { fresh: 'C ,', keys: 'D K C , V M', n: 12, coins: 3, bump: 1, crumble: 1 },
      { fresh: 'X .', keys: 'S L X . C ,', n: 12, coins: 3, bump: 1, sink: 1 },
      { fresh: 'Z / B N', keys: BOTTOM, n: 14, coins: 4, bump: 2, crumble: 1, gems: 1 },
      { keys: LETTERS, n: 16, coins: 4, bump: 2, crumble: 2, sink: 1, gems: 1 },
      { words: { ar: ['قمر', 'موز', 'وردة'], en: ['CAT', 'BOX', 'ZEBRA'] }, coins: 4, bump: 1, crumble: 2, sink: 1, gems: 1 }] },
    { id: 'digits', name: 'الأرقام', levels: [
      { fresh: '4 5 6 7', keys: '4 5 6 7 R U', n: 12, coins: 3, sink: 1 },
      { fresh: '3 8', keys: '3 4 5 6 7 8', n: 12, coins: 3, crumble: 1, bump: 1 },
      { fresh: '2 9 1 0', keys: DIGITS, n: 14, coins: 4, crumble: 1, sink: 1, gems: 1 },
      { seq: DIGITS + ' 9 8 7 6 5 4 3 2 1', coins: 4, crumble: 3, bump: 1, gems: 1 },
      { keys: DIGITS + ' ' + LETTERS, n: 18, coins: 4, crumble: 2, sink: 1, bump: 2, gems: 2 }] },
    { id: 'all', name: 'كل المفاتيح', levels: [
      { keys: DIGITS + ' ' + LETTERS + ' `', n: 16, coins: 4, crumble: 2, sink: 2, bump: 2, gems: 1 },
      { words: { ar: ['شجرة', 'سيارة', 'حديقة'], en: ['APPLE', 'HAPPY', 'WATER'] }, coins: 4, crumble: 2, sink: 1, bump: 2, gems: 1 },
      { words: { ar: ['بحر', 'كبير', 'جدا'], en: ['BIG', 'RED', 'BUS'] }, space: true, coins: 4, crumble: 2, sink: 1, bump: 2, gems: 1 },
      { words: { ar: ['نحن', 'نلعب', 'معا'], en: ['WE', 'CAN', 'JUMP'] }, space: true, coins: 4, crumble: 2, sink: 2, bump: 2, gems: 1 },
      { words: { ar: ['زرافة', 'دلفين', 'عصفور'], en: ['ZEBRA', 'TIGER', 'PANDA'] }, coins: 5, crumble: 3, sink: 2, bump: 3, gems: 2 },
      { keys: DIGITS + ' ' + LETTERS, n: 24, coins: 5, crumble: 3, sink: 2, bump: 3, gems: 2 }] }
  ];
  KO.WORLD_COUNT = KO.WORLDS.length;
  KO.LEVEL_COUNT = KO.WORLDS.reduce(function (n, w) { return n + w.levels.length; }, 0);
  KO.MAX_STARS = KO.LEVEL_COUNT * 3;
  KO.levelId = function (w, l) { return 'w' + (w + 1) + 'l' + (l + 1); };
  // A word -> its keys: Arabic letters by the Arabic layout, English letters by name.
  KO.wordCodes = function (word, lang) {
    return Array.from(word).map(function (ch) {
      if (ch === ' ') return 'Space';
      if (lang === 'en') return /^[A-Za-z]$/.test(ch) ? 'Key' + ch.toUpperCase() : '';
      return KO.AR_CODE[ch] || '';
    });
  };

  /* --------------------------------------------------------------- tuning */
  // One entry per DDA tier: tier 1 is tuned for a six-year-old finding the keys one by one,
  // tier 5 is a real obby for a ten-year-old who types without looking. The path itself is
  // the same at every tier; only the hazards and the time star move.
  // KO.HARDER says which way each knob moves; the engine test checks it.
  KO.TUNE = {
    rise: [1 / 95, 1 / 68, 1 / 50, 1 / 36, 1 / 26], // jelly rise per s (share of the way up to the key tops)
    crumble: [4.6, 3.5, 2.7, 2.1, 1.7],            // s a crumbly key holds after a landing
    sink: [9, 7.6, 6.3, 5.2, 4.4],                 // s per sink-and-rise cycle of a sinking key
    deep: [0.85, 2.4, 2.4, 2.4, 2.4],              // how deep it dives (tier 1: a bob that stays above the jelly)
    bump: [0, 1.1, 1.6, 2.1, 2.6],                 // bumper bar speed, keys per s (0: the bars sleep)
    par: [2.8, 2.2, 1.75, 1.4, 1.15]               // s per key for the time star
  };
  KO.HARDER = { rise: 1, crumble: -1, sink: -1, deep: 1, bump: 1, par: -1 };
  function tierOf(t) { t = Math.round(Number(t)); return t >= 1 && t <= KO.TIERS ? t : 1; }
  KO.tierOf = tierOf;
  // opts: { tier, rise } - rise (from Kit.dda's level in game.js) may replace the tier's rise.
  KO.tuneAt = function (opts) {
    opts = typeof opts === 'object' && opts ? opts : { tier: opts };
    var t = tierOf(opts.tier), out = { tier: t };
    for (var k in KO.TUNE) out[k] = KO.TUNE[k][t - 1];
    if (typeof opts.rise === 'number' && opts.rise > 0 && opts.rise < 1) out.rise = opts.rise;
    return out;
  };

  // Shapes and timings of the course, in key units and seconds.
  KO.JELLY_LOW = -1.75;   // the jelly's surface at its lowest
  KO.JELLY_SPAN = 1.8;    // how far it rises: at the top it laps over the key tops
  KO.LAND_GAP = 1;        // s a hop must land before a sinking key starts its dive
  KO.BONK_T = 0.8;        // a bumper bar bounces the hero up, and down onto the same key
  KO.FALL_T = 0.6;        // falling into the jelly
  KO.BACK_T = 0.9;        // the bounce back to the checkpoint
  KO.OOPS_T = 0.55;       // the wobble after a wrong key
  KO.SAFE_T = 1.6;        // after a bounce back (or a bonk), bumper bars pass under the hero
  KO.QUEUE = 3;           // correct keys typed ahead of the hero
  KO.BAR_HIT = 0.44;      // a bar this close (key units) bonks a hero standing in its row
  KO.MERCY = 3;           // falls from one checkpoint before the hazards ease off one tier
  KO.jellyY = function (h) { return KO.JELLY_LOW + KO.JELLY_SPAN * clamp(h, 0, 1); };
  KO.hopTime = function (d) { return clamp(0.3 + 0.05 * d, 0.3, 0.68); };
  KO.hopHeight = function (d) { return 0.75 + 0.17 * d; };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  KO.clamp = clamp;
  // Seeded random numbers (mulberry32), so a course is the same every time it is played.
  KO.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  function pick(rand, list) { return list[Math.floor(rand() * list.length)]; }
  function unique(list) { var out = []; list.forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); }); return out; }
  function count(list, c) { var n = 0; for (var i = 0; i < list.length; i++) if (list[i] === c) n++; return n; }
  function tripleAt(seq, i) {
    for (var j = Math.max(0, i - 2); j <= i; j++) if (j + 2 < seq.length && seq[j] === seq[j + 1] && seq[j] === seq[j + 2]) return true;
    return false;
  }

  /* -------------------------------------------------------------- levels */
  // The path of a lesson level: each new key twice, then mostly new keys in the first
  // half, never three of one key in a row, and every key of the level at least once.
  function lessonPath(spec, rand) {
    var pool = codes(spec.keys), fresh = codes(spec.fresh), n = spec.n, seq = [], guard = 0;
    fresh.forEach(function (c) { seq.push(c, c); });
    var intro = Math.ceil(n * 0.45);
    while (seq.length < n && guard++ < 5000) {
      var src = seq.length < intro && fresh.length && rand() < 0.6 ? fresh : pool, c = pick(rand, src), last = seq[seq.length - 1];
      if (c === last && (pool.length > 1 && (seq[seq.length - 2] === c || rand() < 0.8))) continue;
      seq.push(c);
    }
    seq = seq.slice(0, n);
    if (pool.length + fresh.length <= n) pool.forEach(function (c) {
      if (seq.indexOf(c) >= 0) return;
      for (var tries = 0; tries < 200; tries++) {
        var i = 2 * fresh.length + Math.floor(rand() * (seq.length - 2 * fresh.length)), old = seq[i];
        if (count(seq, old) < 2) continue;
        seq[i] = c;
        if (!tripleAt(seq, i)) return;
        seq[i] = old;
      }
    });
    return seq;
  }
  // The course of level l of world w, in a language (only word levels differ by language).
  KO.level = function (w, l, lang) {
    w = clamp(w | 0, 0, KO.WORLD_COUNT - 1);
    l = clamp(l | 0, 0, KO.WORLDS[w].levels.length - 1);
    lang = lang === 'en' ? 'en' : 'ar';
    var spec = KO.WORLDS[w].levels[l], seed = (Math.imul(w * 16 + l + 1, 0x9E3779B1) ^ (spec.words && lang === 'en' ? 0x5bd1e995 : 0)) >>> 0;
    var rand = KO.rng(seed), path, words = [];
    if (spec.words) {
      path = [];
      spec.words[lang].forEach(function (word, i) {
        if (i && spec.space) path.push('Space');
        words.push({ start: path.length, len: Array.from(word).length, text: word });
        path = path.concat(KO.wordCodes(word, lang));
      });
    } else if (spec.seq) path = codes(spec.seq);
    else path = lessonPath(spec, rand);
    var n = path.length, last = path[n - 1];
    // Crumbly and sinking keys: keys of the path, never the goal, never Space, never a key
    // the path visits twice in a row, never a sinking key right after a crumbly one or right
    // after another sinking key (the hero could have to wait on a key that is going away).
    var cand = unique(path).filter(function (c) {
      if (c === last || c === 'Space') return false;
      for (var i = 1; i < n; i++) if (path[i] === c && path[i - 1] === c) return false;
      return true;
    });
    var kind = null, i;
    // Some paths leave no room for every sinking key: then the course has fewer of them.
    for (var ns = spec.sink || 0; !kind && ns >= 0; ns--) {
      for (var attempt = 0; attempt < 60 && !kind; attempt++) {
        var k = {}, left = cand.slice(), ok = true, nc = spec.crumble || 0;
        for (i = 0; i < nc + ns && left.length; i++) {
          var j = Math.floor(rand() * left.length);
          k[left[j]] = i < nc ? 'crumble' : 'sink';
          left.splice(j, 1);
        }
        for (i = 1; i < n && ok; i++) if (k[path[i]] === 'sink' && (k[path[i - 1]] === 'crumble' || k[path[i - 1]] === 'sink')) ok = false;
        if (ok) kind = k;
      }
    }
    kind = kind || {};
    // Checkpoints: about every five keys, on a plain key, never the last one.
    var cps = [], m = Math.floor((n - 1) / 5);
    for (i = 1; i <= m; i++) {
      var want = Math.round(n * i / (m + 1)) - 1, at = -1;
      // Not on the goal key either (its flag stands there), unless the path has no other key.
      for (var strict = 0; strict < 2 && at < 0; strict++) for (var d = 0; d < n && at < 0; d++) {
        [want - d, want + d].forEach(function (x) {
          if (at < 0 && x >= 1 && x < n - 1 && !kind[path[x]] && (path[x] !== last || strict === 1) && cps.indexOf(x) < 0 && (!cps.length || x > cps[cps.length - 1])) at = x;
        });
      }
      if (at >= 0) cps.push(at);
    }
    // Coins on keys of the path, a gem on a crumbly or sinking key when there is one.
    var spots = unique(path).filter(function (c) { return c !== last && c !== 'Space'; }), coins = [], gems = [];
    var risky = spots.filter(function (c) { return kind[c]; });
    for (i = 0; i < (spec.gems || 0); i++) {
      var from = risky.filter(function (c) { return gems.indexOf(c) < 0; });
      if (!from.length) from = spots.filter(function (c) { return gems.indexOf(c) < 0; });
      if (from.length) gems.push(pick(rand, from));
    }
    // A key may hold more coins than one: each landing on it picks one up.
    var free = spots.filter(function (c) { return gems.indexOf(c) < 0; });
    if (!free.length) free = spots.slice();
    for (i = free.length - 1; i > 0; i--) { var r = Math.floor(rand() * (i + 1)), tmp = free[i]; free[i] = free[r]; free[r] = tmp; }
    for (i = 0; i < (spec.coins || 0) && free.length; i++) coins.push(free[i % free.length]);
    // Bumper bars sweep along rows the path uses (never the space row), busiest rows first.
    var rows = [0, 1, 2, 3].map(function (r) { return { r: r, n: path.filter(function (c) { return KO.KEY[c].row === r; }).length }; })
      .filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n || a.r - b.r; });
    var bumpers = [];
    for (i = 0; i < (spec.bump || 0) && rows.length; i++) {
      bumpers.push({ row: rows[i % rows.length].r, speed: Math.round((0.85 + rand() * 0.3) * 100) / 100, phase: Math.round(rand() * 200) / 100 });
    }
    var sinkPhase = {};
    for (var c in kind) if (kind[c] === 'sink') sinkPhase[c] = Math.round(rand() * 100) / 100;
    return { w: w, l: l, id: KO.levelId(w, l), lang: lang, name: KO.WORLDS[w].name, path: path, words: words, start: 'Space',
      kind: kind, sinkPhase: sinkPhase, cps: cps, coins: coins, gems: gems, bumpers: bumpers };
  };

  /* -------------------------------------------------------------- course */
  KO.create = function (L, opts) {
    var tune = KO.tuneAt(opts), sinks = L.path.filter(function (c) { return L.kind[c] === 'sink'; }).length;
    var w = {
      L: L, tune: tune, tier: tune.tier, n: L.path.length, t: 0, anim: 0, started: false, done: false,
      next: 0, at: -1, cp: -1, queue: [], jelly: 0, combo: 0, bestCombo: 0,
      mistakes: 0, falls: 0, bonks: 0, hops: 0, presses: 0, cpFalls: 0, mercy: 0, coins: 0, gems: 0, coinsLeft: {}, gemsLeft: {},
      par: Math.round((3 + L.path.length * tune.par + sinks * 1.2) * 10) / 10,
      keys: {}, bars: L.bumpers.map(function (b) { return { row: b.row, speed: b.speed, phase: b.phase, x: 0, z: b.row + 0.5 }; }),
      hero: { x: 0, y: 0, z: 0, phase: 'stand', t: 0, hop: null, face: 0, safe: 0, cause: '', push: 0, from: null, splashed: false },
      ev: []
    };
    L.path.concat([L.start]).forEach(function (c) { if (!w.keys[c]) w.keys[c] = { state: 'solid', t: 0, y: 0, kind: L.kind[c] || '' }; });
    L.coins.forEach(function (c) { w.coinsLeft[c] = (w.coinsLeft[c] || 0) + 1; });
    L.gems.forEach(function (c) { w.gemsLeft[c] = (w.gemsLeft[c] || 0) + 1; });
    var s = KO.KEY[L.start];
    w.hero.x = s.cx; w.hero.z = s.cz;
    bars(w);
    return w;
  };
  KO.standCode = function (w) { return w.at >= 0 ? w.L.path[w.at] : w.L.start; };
  KO.target = function (w) { return w.done ? '' : w.L.path[w.next] || ''; };
  KO.isCp = function (w, i) { return w.L.cps.indexOf(i) >= 0; };
  // The next checkpoint ahead of the hero (a step index), or -1.
  KO.nextCp = function (w) { for (var i = 0; i < w.L.cps.length; i++) if (w.L.cps[i] > w.cp) return w.L.cps[i]; return -1; };

  // A sinking key's cycle: up (shaking near the end), diving, under the jelly, coming up.
  function sinkY(w, code) {
    var f = ((w.anim / w.tune.sink) + (w.L.sinkPhase[code] || 0)) % 1, e;
    if (f < 0.58) return 0;
    var deep = w.tune.deep;
    if (f < 0.68) { e = (f - 0.58) / 0.1; return -deep * e * e; }
    if (f < 0.84) return -deep;
    e = (f - 0.84) / 0.16; return -deep * (1 - e) * (1 - e) * (1 + 2 * e);
  }
  function sinkF(w, code) { return ((w.anim / w.tune.sink) + (w.L.sinkPhase[code] || 0)) % 1; }
  // 0..1 while a sinking key shakes before its dive (for the art), else 0.
  KO.sinkWarn = function (w, code) {
    if (w.L.kind[code] !== 'sink') return 0;
    var f = sinkF(w, code);
    return f >= 0.42 && f < 0.58 ? (f - 0.42) / 0.16 : 0;
  };
  // The height of a key's top now.
  KO.keyY = function (w, code) {
    var k = w.keys[code];
    if (!k) return 0;
    if (k.kind === 'sink') return sinkY(w, code);
    return k.y;
  };
  // Whether a hop that takes dur seconds lands on a key that is up, with a moment to spare
  // before a sinking key dives (else the hop waits for it to come up again). A key that
  // only bobs (tier 1) never dives into the jelly, so it can always be landed on.
  function canLand(w, code, dur) {
    var k = w.keys[code];
    if (!k || k.kind !== 'sink' || w.tune.deep < 1) return true;
    var f = sinkF(w, code), at = f + dur / w.tune.sink, last = 0.58 - KO.LAND_GAP / w.tune.sink;
    if (f < 0.58) return at < last;
    return f >= 0.84 && at >= 1 && at - 1 < last;
  }
  KO.canLand = canLand;
  // A crumbly key that is needed again comes back at once (and one still shaking from an
  // earlier landing holds again until the next landing).
  function restore(w, code) {
    var k = w.keys[code];
    if (!k || k.kind !== 'crumble' || k.state === 'solid') return;
    if (k.state === 'shake') { k.state = 'solid'; k.t = 0; return; }
    k.state = 'pop'; k.t = 0;
    w.ev.push({ t: 'restore', code: code });
  }
  function bars(w) {
    var on = w.tune.bump > 0;
    w.bars.forEach(function (b) {
      var span = KO.KB_W - 0.8, u = on ? ((w.anim * w.tune.bump * b.speed / span + b.phase) % 2 + 2) % 2 : b.phase;
      b.x = 0.4 + span * (u < 1 ? u : 2 - u);
      b.on = on;
    });
  }

  /* --------------------------------------------------------------- input */
  // One key press, in the order the child typed it. The right key is queued for the hero
  // (up to KO.QUEUE keys ahead); any other game key is a mistake and the hero wobbles.
  KO.press = function (w, code) {
    code = KO.norm(code);
    var h = w.hero;
    if (w.done || !KO.isGameKey(code) || h.phase === 'fall' || h.phase === 'back') return 'ignore';
    // During a bonk the right keys still queue up; a wrong key is still a mistake.
    var want = w.L.path[w.next];
    if (!want) return 'ignore';
    if (code === want) {
      if (w.queue.length >= KO.QUEUE) return 'ignore';
      if (!w.started) { w.started = true; w.ev.push({ t: 'start' }); }
      w.queue.push(w.next);
      w.next++; w.presses++; w.combo++;
      if (w.combo > w.bestCombo) w.bestCombo = w.combo;
      w.ev.push({ t: 'ok', step: w.next - 1, code: code, combo: w.combo });
      if (h.phase === 'stand' || h.phase === 'oops' || h.phase === 'wait') go(w);
      return 'hop';
    }
    w.mistakes++; w.combo = 0;
    w.ev.push({ t: 'wrong', code: code, want: want, x: h.x, y: h.y, z: h.z });
    if (h.phase === 'stand' || h.phase === 'oops') { h.phase = 'oops'; h.t = 0; }
    return 'wrong';
  };
  // Starts the hop to the first queued key, or waits for a sinking key to come up.
  function go(w) {
    var h = w.hero;
    if (!w.queue.length) { if (h.phase === 'wait') h.phase = 'stand'; return; }
    var step = w.queue[0], code = w.L.path[step];
    var k = KO.KEY[code], from = { x: h.x, y: h.y, z: h.z }, dx = k.cx - h.x, dz = k.cz - h.z, d = Math.sqrt(dx * dx + dz * dz);
    if (!canLand(w, code, KO.hopTime(d))) {
      if (h.phase !== 'wait') { h.phase = 'wait'; h.t = 0; w.ev.push({ t: 'wait', code: code }); }
      return;
    }
    w.queue.shift();
    restore(w, code);
    h.hop = { step: step, code: code, from: from, d: d, dur: KO.hopTime(d), lift: KO.hopHeight(d) };
    if (d > 0.05) h.face = Math.atan2(dx, dz);
    h.phase = 'hop'; h.t = 0;
    w.hops++;
    w.ev.push({ t: 'hop', step: step, code: code, from: KO.standCode(w), d: d, x: h.x, y: h.y, z: h.z });
  }
  function land(w) {
    var h = w.hero, hop = h.hop, code = hop.code, k = w.keys[code];
    w.at = hop.step; h.hop = null; h.phase = 'stand'; h.t = 0;
    h.x = KO.KEY[code].cx; h.z = KO.KEY[code].cz; h.y = KO.keyY(w, code);
    w.ev.push({ t: 'land', step: w.at, code: code, d: hop.d, x: h.x, y: h.y, z: h.z, chain: w.queue.length > 0 });
    if (w.coinsLeft[code] > 0) { w.coinsLeft[code]--; w.coins++; w.ev.push({ t: 'coin', code: code, n: w.coins, left: w.coinsLeft[code], x: h.x, y: h.y, z: h.z }); }
    if (w.gemsLeft[code] > 0) { w.gemsLeft[code]--; w.gems++; w.ev.push({ t: 'gem', code: code, n: w.gems, x: h.x, y: h.y, z: h.z }); }
    if (w.at === w.n - 1) {
      w.done = true; h.phase = 'win'; w.queue.length = 0;
      w.ev.push({ t: 'finish', x: h.x, y: h.y, z: h.z });
      return;
    }
    if (KO.isCp(w, w.at) && w.at > w.cp) {
      w.cp = w.at; w.jelly = 0; w.cpFalls = 0;
      w.ev.push({ t: 'checkpoint', step: w.at, code: code, x: h.x, y: h.y, z: h.z });
    }
    if (k.kind === 'crumble') { k.state = 'shake'; k.t = 0; k.y = 0; h.y = 0; w.ev.push({ t: 'shake', code: code }); }
    go(w);
  }
  // Into the jelly: the hero splashes and bounces back to the last checkpoint.
  function fall(w, cause, push) {
    var h = w.hero;
    w.falls++; w.combo = 0; w.cpFalls++;
    // Never stuck: falling again and again from one checkpoint makes the hazards (not the
    // time star) one tier gentler for the rest of the level.
    if (w.cpFalls >= KO.MERCY && w.tune.tier > 1) {
      var gentler = KO.tuneAt({ tier: w.tune.tier - 1 });
      gentler.rise = Math.min(w.tune.rise, gentler.rise);
      w.tune = gentler; w.cpFalls = 0; w.mercy++;
      w.ev.push({ t: 'mercy', tier: gentler.tier });
    }
    h.phase = 'fall'; h.t = 0; h.cause = cause; h.hop = null;
    h.from = { x: h.x, y: h.y, z: h.z };
    h.push = typeof push === 'number' ? push : 0;
    w.queue.length = 0;
    w.next = w.cp + 1;
    w.ev.push({ t: 'fall', cause: cause, x: h.x, y: h.y, z: h.z });
  }

  /* ---------------------------------------------------------------- step */
  KO.step = function (w, dt) {
    var h = w.hero;
    w.anim += dt;
    bars(w);
    // Crumbly keys: shake, drop into the jelly, come back up a while later.
    for (var code in w.keys) {
      var k = w.keys[code];
      if (k.kind !== 'crumble' || k.state === 'solid') continue;
      k.t += dt;
      if (k.state === 'shake' && k.t >= w.tune.crumble) { k.state = 'drop'; k.t = 0; w.ev.push({ t: 'crumble', code: code }); }
      else if (k.state === 'drop') { k.y = -6 * k.t * k.t; if (k.y < -3.2) { k.y = -3.2; k.state = 'gone'; k.t = 0; } }
      else if (k.state === 'gone' && k.t >= 3.5) { k.state = 'rise'; k.t = 0; }
      else if (k.state === 'rise') { k.y = -3.2 * (1 - Math.min(1, k.t / 0.7)); if (k.t >= 0.7) { k.state = 'solid'; k.y = 0; } }
      else if (k.state === 'pop') { k.y = Math.min(0, k.y + dt * 14); if (k.y >= 0) { k.state = 'solid'; k.y = 0; } }
    }
    if (w.done) { h.t += dt; return w; }
    if (w.started) w.t += dt;
    if (h.safe > 0) h.safe -= dt;
    if (w.started && h.phase !== 'fall' && h.phase !== 'back') w.jelly = Math.min(1, w.jelly + w.tune.rise * dt);
    h.t += dt;
    if (h.phase === 'hop') {
      var hop = h.hop, p = Math.min(1, h.t / hop.dur), K = KO.KEY[hop.code], y1 = KO.keyY(w, hop.code);
      h.x = hop.from.x + (K.cx - hop.from.x) * p;
      h.z = hop.from.z + (K.cz - hop.from.z) * p;
      h.y = hop.from.y + (y1 - hop.from.y) * p + hop.lift * 4 * p * (1 - p);
      if (p >= 1) land(w);
    } else if (h.phase === 'fall') {
      var jy = KO.jellyY(w.jelly), q = Math.min(1, h.t / KO.FALL_T);
      h.y = h.from.y + (jy - 0.2 - h.from.y) * q * q;
      h.x = h.from.x + h.push * Math.sin(q * Math.PI / 2);
      if (!h.splashed && h.y <= jy) { h.splashed = true; w.ev.push({ t: 'splash', x: h.x, y: jy, z: h.z, cause: h.cause }); }
      if (q >= 1) {
        h.splashed = false;
        // Every crumbly key comes back, and the jelly settles lower before the bounce.
        for (code in w.keys) restore(w, code);
        w.jelly = Math.min(w.jelly, 0.3);
        w.at = w.cp;
        h.phase = 'back'; h.t = 0; h.from = { x: h.x, y: h.y, z: h.z };
      }
    } else if (h.phase === 'bonk') {
      // Boing: up in the air (the bar sweeps by underneath) and down on the same key.
      var bc = KO.standCode(w), bq = Math.min(1, h.t / KO.BONK_T);
      h.y = KO.keyY(w, bc) + 1.5 * 4 * bq * (1 - bq);
      if (bq >= 1) { h.phase = 'stand'; h.t = 0; h.safe = 1; h.y = KO.keyY(w, bc); go(w); }
    } else if (h.phase === 'back') {
      var c = KO.standCode(w), B = KO.KEY[c], r = Math.min(1, h.t / KO.BACK_T), ty = KO.keyY(w, c);
      h.x = h.from.x + (B.cx - h.from.x) * r;
      h.z = h.from.z + (B.cz - h.from.z) * r;
      h.y = h.from.y + (ty - h.from.y) * r + 2.6 * 4 * r * (1 - r);
      if (r >= 1) {
        h.phase = 'stand'; h.t = 0; h.safe = KO.SAFE_T; h.x = B.cx; h.z = B.cz; h.y = ty;
        w.ev.push({ t: 'respawn', code: c, x: h.x, y: h.y, z: h.z });
        go(w);
      }
    } else {
      // Standing, wobbling or waiting: ride the key, and meet the hazards.
      var sc = KO.standCode(w), sk = w.keys[sc], top = KO.keyY(w, sc);
      h.y = top;
      if (h.phase === 'oops' && h.t >= KO.OOPS_T) { h.phase = 'stand'; h.t = 0; }
      if (h.phase === 'wait' || (h.phase === 'stand' && w.queue.length)) go(w);
      if (h.phase !== 'hop') {
        var row = KO.KEY[sc].row;
        if (sk && sk.kind === 'crumble' && (sk.state === 'drop' || sk.state === 'gone')) fall(w, 'crumble');
        else if (KO.jellyY(w.jelly) >= top) fall(w, sk && sk.kind === 'sink' && top < 0 ? 'sink' : 'jelly');
        else if (h.safe <= 0) {
          for (var i = 0; i < w.bars.length; i++) {
            var b = w.bars[i];
            if (b.on && b.row === row && Math.abs(b.x - h.x) < KO.BAR_HIT) {
              h.phase = 'bonk'; h.t = 0; w.bonks++; w.combo = 0;
              w.ev.push({ t: 'bonk', x: h.x, y: h.y, z: h.z, bar: i });
              break;
            }
          }
        }
      }
    }
    return w;
  };
  // How far along the path the hero is, 0..1.
  KO.progress = function (w) { return w.n ? (w.at + 1) / w.n : 0; };

  /* ------------------------------------------------------ stars and DDA */
  KO.allowed = function (n) { return Math.max(1, Math.floor(n / 8)); };
  KO.result = function (w) {
    return { id: w.L.id, n: w.n, time: Math.round(w.t * 10) / 10, par: w.par, mistakes: w.mistakes, falls: w.falls, bonks: w.bonks, coins: w.coins, gems: w.gems,
      acc: Math.round(w.n / Math.max(1, w.n + w.mistakes) * 1000) / 1000, bestCombo: w.bestCombo, tier: w.tier, mercy: w.mercy };
  };
  // Finishing earns a star, one more for few wrong keys, one more for beating the time.
  KO.stars = function (r) { return 1 + (r.mistakes <= KO.allowed(r.n) ? 1 : 0) + (r.time <= r.par ? 1 : 0); };
  // 0..1 for Kit.dda: right keys, pace and staying out of the jelly.
  KO.outcome = function (r) {
    var x = 0.45 * r.acc + 0.3 * Math.min(1, r.par / Math.max(0.1, r.time)) + 0.25 * Math.max(0, 1 - r.falls / 4);
    return Math.round(clamp(x, 0, 1) * 1000) / 1000;
  };
  // Coins a finished level pays: the coins picked up, 5 per gem and 3 per new star.
  KO.payout = function (r, newStars) { return r.coins + 5 * r.gems + 3 * Math.max(0, newStars | 0); };

  /* ---------------------------------------------------------------- shop */
  KO.COLORS = [
    { c: '#4fc3ff', cost: 0 }, { c: '#ff8a3d', cost: 10 }, { c: '#7ee05b', cost: 15 }, { c: '#ff6fb5', cost: 20 },
    { c: '#b48cff', cost: 30 }, { c: '#ffd23f', cost: 40 }, { c: '#ff5d6c', cost: 50 }, { c: '#2fe0c4', cost: 60 }
  ];
  KO.HATS = [
    { id: 'none', cost: 0 }, { id: 'cap', cost: 15 }, { id: 'bow', cost: 20 }, { id: 'party', cost: 30 }, { id: 'flower', cost: 40 },
    { id: 'phones', cost: 55 }, { id: 'crown', cost: 70 }, { id: 'wizard', cost: 90 }, { id: 'prop', cost: 120 }
  ];
  KO.SHOP = { color: KO.COLORS, hat: KO.HATS };
  // Buys (when needed) and wears an item: 'wear' (owned already), 'buy' or 'poor'.
  KO.buy = function (s, kind, i) {
    var list = KO.SHOP[kind], own = kind === 'color' ? s.colors : s.hats;
    if (!list || !(i >= 0 && i < list.length)) return 'poor';
    if (own[i]) { s[kind] = i; return 'wear'; }
    if (s.coins < list[i].cost) return 'poor';
    s.coins -= list[i].cost; own[i] = true; s[kind] = i;
    return 'buy';
  };

  /* --------------------------------------------------------------- saves */
  // { v: 1, lang: 'ar' | 'en', stars: [world][level] 0..3, best: [world][level] best time in
  //   tenths of a second (0: none), coins, colors / hats: [owned...], color, hat, coach }
  KO.freshSave = function () {
    var stars = [], best = [];
    KO.WORLDS.forEach(function (W) { stars.push(W.levels.map(function () { return 0; })); best.push(W.levels.map(function () { return 0; })); });
    return { v: 1, lang: 'ar', stars: stars, best: best, coins: 0, colors: KO.COLORS.map(function (c, i) { return i === 0; }),
      hats: KO.HATS.map(function (h, i) { return i === 0; }), color: 0, hat: 0, coach: false };
  };
  function int(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  // Every field is checked: an old, damaged or hand-edited save always loads as a playable one.
  KO.loadSave = function (raw) {
    var s = KO.freshSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1) return s;
    s.lang = KO.LANGS.indexOf(raw.lang) >= 0 ? raw.lang : 'ar';
    KO.WORLDS.forEach(function (W, w) {
      var row = Array.isArray(raw.stars) && Array.isArray(raw.stars[w]) ? raw.stars[w] : [];
      var times = Array.isArray(raw.best) && Array.isArray(raw.best[w]) ? raw.best[w] : [];
      W.levels.forEach(function (L, l) {
        s.stars[w][l] = int(row[l], 0, 3) ? row[l] : 0;
        s.best[w][l] = s.stars[w][l] && int(times[l], 1, 36000) ? times[l] : 0;
      });
    });
    s.coins = int(raw.coins, 0, 999999) ? raw.coins : 0;
    ['colors', 'hats'].forEach(function (key) {
      var list = Array.isArray(raw[key]) ? raw[key] : [];
      s[key] = s[key].map(function (own, i) { return i === 0 || list[i] === true; });
    });
    s.color = int(raw.color, 0, KO.COLORS.length - 1) && s.colors[raw.color] ? raw.color : 0;
    s.hat = int(raw.hat, 0, KO.HATS.length - 1) && s.hats[raw.hat] ? raw.hat : 0;
    s.coach = raw.coach === true;
    return s;
  };
  KO.total = function (s) { var n = 0; s.stars.forEach(function (row) { row.forEach(function (v) { n += v; }); }); return n; };
  KO.worldStars = function (s, w) { return s.stars[w].reduce(function (a, b) { return a + b; }, 0); };
  // A level opens when the one before it (the last level of the world before, for a
  // world's first level) has a star.
  KO.isOpen = function (s, w, l) {
    if (!(w >= 0 && w < KO.WORLD_COUNT && l >= 0 && l < KO.WORLDS[w].levels.length)) return false;
    if (s.stars[w][l] > 0 || (w === 0 && l === 0)) return true;
    if (l > 0) return s.stars[w][l - 1] > 0;
    var prev = s.stars[w - 1];
    return prev[prev.length - 1] > 0;
  };
  KO.worldOpen = function (s, w) { return KO.isOpen(s, w, 0); };
  // The level after (w, l), or null after the very last one.
  KO.after = function (w, l) {
    if (l + 1 < KO.WORLDS[w].levels.length) return { w: w, l: l + 1 };
    return w + 1 < KO.WORLD_COUNT ? { w: w + 1, l: 0 } : null;
  };
  // The first open level without a star, else the very last level.
  KO.nextLevel = function (s) {
    for (var w = 0; w < KO.WORLD_COUNT; w++) for (var l = 0; l < KO.WORLDS[w].levels.length; l++) if (KO.isOpen(s, w, l) && !s.stars[w][l]) return { w: w, l: l };
    return { w: KO.WORLD_COUNT - 1, l: KO.WORLDS[KO.WORLD_COUNT - 1].levels.length - 1 };
  };
  // Records a finished level; returns what changed for the celebration.
  KO.apply = function (s, w, l, r) {
    var stars = KO.stars(r), before = s.stars[w][l], tenths = Math.max(1, Math.round(r.time * 10)), nx = KO.after(w, l);
    var wasOpen = nx ? KO.isOpen(s, nx.w, nx.l) : true;
    var out = { stars: stars, before: before, newStars: Math.max(0, stars - before), best: !s.best[w][l] || tenths < s.best[w][l], prevBest: s.best[w][l], coins: 0, opened: false };
    if (stars > before) s.stars[w][l] = stars;
    if (out.best) s.best[w][l] = Math.min(36000, tenths);
    out.coins = KO.payout(r, out.newStars);
    s.coins = Math.min(999999, s.coins + out.coins);
    out.opened = !!nx && !wasOpen && KO.isOpen(s, nx.w, nx.l);
    return out;
  };
})();
