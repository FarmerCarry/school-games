/* Key Runner (عدّاء المفاتيح) engine: the keyboard and its Arabic 101 letters, the worlds and
 * their key lessons, the tuning tables per DDA tier, the course of keycap stones, the runner
 * and its type-ahead queue, stars, outcomes, wardrobe items and saves.
 * Pure: no DOM, no Kit, no timers and no Math.random (a course takes a seed), so the Node
 * test loads this file with { window: {} } and plays every level with a scripted typist.
 * game.js reads the DDA tier, builds a plan, feeds the child's real key presses in order
 * and turns the events into pictures and sound. */
(function () {
  'use strict';
  var KR = window.KR = window.KR || {};
  KR.W = 1280; KR.H = 720;
  KR.TIERS = 5;
  KR.LEVELS = 4;          // per world

  /* ------------------------------------------------------------ keyboard */
  // THE KEYBOARD TABLE: the one place to change to match the school's keyboards (a Dell
  // keyboard with the Windows Arabic 101 layout; the on-screen keyboard, the stones and the
  // duo halves all read it). Rows are physical and never mirrored. Each key: code
  // (KeyboardEvent.code, the physical key, so it works whether Windows types Arabic or
  // English), the Latin legend (big, top-left on a letter key; bottom-left on a digit or a
  // sign key), the Arabic legend (bottom-right; the Arabic-Indic digit on a digit key), the
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
  KR.KEYS = [];
  KR.KEY = {};
  ROWS.forEach(function (row, r) {
    var x = 0;
    row.forEach(function (k) {
      var key = { code: k[0], lat: k[1], ar: k[2], finger: k[3], row: r, x: x, w: k[4] || 1, sym: k[5] || '', letter: /^Key/.test(k[0]) };
      KR.KEYS.push(key); KR.KEY[key.code] = key;
      x += key.w;
    });
  });
  // The arrow keys sit to the right, as an upside-down T.
  [['ArrowUp', '↑', 16.25, 3], ['ArrowLeft', '←', 15.25, 4], ['ArrowDown', '↓', 16.25, 4], ['ArrowRight', '→', 17.25, 4]].forEach(function (a) {
    var key = { code: a[0], lat: a[1], ar: a[1], finger: 9, row: a[3], x: a[2], w: 1, sym: '', letter: false };
    KR.KEYS.push(key); KR.KEY[key.code] = key;
  });
  KR.KB_UNITS = 18.25;
  // A key the game can ask for or count as a wrong press (letters, digits, Space, arrows).
  KR.isGameKey = function (code) { var k = KR.KEY[code]; return !!k && k.finger >= 0; };
  // The number pad types the same digits as the number row.
  KR.norm = function (code) {
    var m = /^Numpad([0-9])$/.exec(code || '');
    return m ? 'Digit' + m[1] : String(code || '');
  };
  // Arabic letter -> the key that types it on the Arabic (101) layout (لا is one key, B).
  KR.AR_CODE = {};
  KR.KEYS.forEach(function (k) { if (k.finger >= 0 && k.finger < 8 && k.ar.length === 1 && !/^Digit/.test(k.code)) KR.AR_CODE[k.ar] = k.code; });

  // Two players share one keyboard: the left hand's keys and the right hand's keys.
  KR.LEFT = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT',
    'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB'];
  KR.RIGHT = ['Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
    'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'];
  // 0: player 1 (left half), 1: player 2 (right half), -1: neither.
  KR.sideOf = function (code) { return KR.LEFT.indexOf(code) >= 0 ? 0 : KR.RIGHT.indexOf(code) >= 0 ? 1 : -1; };

  /* -------------------------------------------------------------- worlds */
  function codes(s) { return s.split(' ').map(function (c) { return c.length === 1 ? (/[0-9]/.test(c) ? 'Digit' + c : 'Key' + c) : c; }); }
  var HOME = codes('A S D F G H J K L Semicolon Quote');
  var TOP = codes('Q W E R T Y U I O P BracketLeft BracketRight');
  var BOTTOM = codes('Z X C V B N M Comma Period Slash');
  var DIGITS = codes('1 2 3 4 5 6 7 8 9 0');
  // n: the new keys a level introduces (each twice in a row first), k: the keys it uses.
  KR.WORLDS = [
    { name: 'المسافة', levels: [
      { n: ['Space'], k: ['Space'] },
      { n: ['ArrowUp'], k: ['Space', 'ArrowUp'] },
      { n: ['ArrowDown'], k: ['Space', 'ArrowDown'] },
      { n: [], k: ['Space', 'ArrowUp', 'ArrowDown'] }] },
    { name: 'إصبعا السبابة', levels: [
      { n: codes('F J'), k: codes('F J') },
      { n: codes('G H'), k: codes('F J G H') },
      { n: [], k: codes('F G H J') },
      { n: [], k: codes('F G H J') }] },
    { name: 'الصف الأوسط', levels: [
      { n: codes('D K'), k: codes('D K F J') },
      { n: codes('S L'), k: codes('S L D K F J') },
      { n: codes('A Semicolon'), k: codes('A S D F J K L Semicolon') },
      { n: ['Quote'], k: HOME }] },
    { name: 'الصف العلوي', levels: [
      { n: codes('R U E I'), k: codes('R U E I') },
      { n: codes('T Y W O'), k: codes('R U E I T Y W O') },
      { n: codes('Q P'), k: codes('Q W E R T Y U I O P') },
      { n: codes('BracketLeft BracketRight'), k: TOP }] },
    { name: 'الصف السفلي', levels: [
      { n: codes('V M B N'), k: codes('V B N M') },
      { n: codes('C Comma X Period'), k: codes('X C V B N M Comma Period') },
      { n: codes('Z Slash'), k: BOTTOM },
      { n: [], k: BOTTOM }] },
    { name: 'الأرقام', levels: [
      { n: codes('4 5 6 7'), k: codes('4 5 6 7') },
      { n: codes('3 8 2 9'), k: codes('2 3 4 5 6 7 8 9') },
      { n: codes('1 0'), k: DIGITS },
      { n: [], k: DIGITS }] },
    { name: 'كل المفاتيح', levels: [
      { n: [], k: HOME.concat(TOP) },
      { n: [], k: HOME.concat(BOTTOM) },
      { n: ['Backquote'], k: HOME.concat(TOP, BOTTOM, DIGITS, ['Backquote']) },
      { n: [], k: HOME.concat(TOP, BOTTOM), words: true }] }
  ];
  KR.WORLD_COUNT = KR.WORLDS.length;
  // Short words for the last level, typed one letter per stone. Only letters a key types
  // without Shift, and never lam before alef (that pair is the لا key).
  KR.WORDS = ['دب', 'يد', 'فم', 'ظل', 'جد', 'كف', 'عم',
    'بيت', 'باب', 'سمك', 'شمس', 'كلب', 'بطل', 'بنت', 'تين', 'ملك', 'طبل', 'نمل', 'لبن', 'شاي', 'قمر', 'ورد', 'بحر', 'جمل',
    'قلم', 'نور', 'عين', 'فيل', 'بيض', 'ثوب', 'خبز', 'زيت', 'رمل', 'سكر', 'عسل', 'تمر', 'موز', 'بطة', 'قطة', 'كرة', 'ذهب',
    'نهر', 'جبل', 'ثلج', 'حوت', 'ديك', 'كوب', 'ورق', 'نحل', 'قرد',
    'سمكة', 'وردة', 'شجرة', 'نجمة', 'غيمة', 'كتاب', 'حليب', 'دجاج', 'بيضة', 'تفاح', 'قطار', 'عصير', 'خروف', 'ضفدع', 'حصان',
    'صديق', 'ساعة', 'كرسي',
    'فراشة', 'عصفور', 'دلفين', 'حديقة', 'سيارة', 'مدرسة', 'نافذة', 'طائرة', 'زرافة'];
  KR.wordCodes = function (word) { return Array.from(word).map(function (ch) { return KR.AR_CODE[ch] || ''; }); };

  /* --------------------------------------------------------------- tuning */
  // One entry per DDA tier: 1 is tuned for a six-year-old finding the keys one by one (the
  // runner always waits), 5 is a real race for a ten-year-old who types without looking.
  // The on-screen keyboard always shows the keys and the target key always glows at once:
  // higher tiers are harder only through speed, keys shown ahead and the key sets.
  // KR.HARDER says which way each knob moves; tools/tests/key-runner-engine.test.mjs checks it.
  KR.TUNE = {
    speed: [105, 130, 160, 195, 235],      // base run speed, px/s
    step: [5, 7, 9, 11, 13],               // "+1": run speed added per correct key, px/s
    maxSteps: [12, 16, 20, 24, 28],        // the most "+1" steps
    ahead: [1, 2, 2, 3, 4],                // keycaps shown ahead of the runner (type-ahead)
    keys: [12, 15, 18, 21, 25],            // keys per level
    wrongCost: [0, 0, 0, 1, 1],            // "+1" steps a wrong key costs
    par: [3, 2.2, 1.6, 1.2, 0.95],         // s per key for the time star
    mix: [0, 0.12, 0.2, 0.26, 0.32],       // share of keys from earlier worlds
    gap: [46, 54, 62, 70, 78],             // gap between two stones, px
    grace: [3.2, 2.6, 2.1, 1.7, 1.4],      // endless: s a stop may last before it costs a heart
    wordMin: [2, 3, 3, 3, 4],              // letters in a word
    wordMax: [3, 3, 4, 5, 5],
    goal: [15, 25, 35, 50, 70]             // endless: keys for a full DDA outcome
  };
  KR.HARDER = { speed: 1, step: 1, maxSteps: 1, ahead: 1, keys: 1, wrongCost: 1, par: -1, mix: 1, gap: 1, grace: -1,
    wordMin: 1, wordMax: 1, goal: 1 };
  // A two-player race is the same for both players and does not follow either child's tier.
  KR.DUO = { speed: 140, step: 9, maxSteps: 20, ahead: 3, keys: 22, wrongCost: 1, par: 2, mix: 0, gap: 60, grace: 9 };
  function tierOf(t) { t = Math.round(Number(t)); return t >= 1 && t <= KR.TIERS ? t : 1; }
  KR.tuneAt = function (tier) {
    var t = tierOf(tier), out = {};
    for (var k in KR.TUNE) out[k] = KR.TUNE[k][t - 1];
    return out;
  };

  // Course shapes, in logical pixels. A stone's y is its top relative to the lane's base line.
  KR.CAP_W = 118; KR.SPACE_W = 214; KR.CAP_H = 88;
  KR.EDGE = 16;      // the runner stops this far before a stone's edge
  KR.LAND = 34;      // and lands this far onto the next one
  KR.BAR = 46;       // it stops this far before a candy bar
  KR.UP = 58;        // an ↑ stone is this much higher
  KR.START_X = 150;  // where the runner starts on the first platform

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  KR.clamp = clamp;
  // Seeded random numbers (mulberry32), so a course replays exactly in tests.
  KR.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ------------------------------------------------------------ plans */
  KR.roundId = function (w, l) { return 'w' + (w + 1) + 'L' + (l + 1); };
  // Letter keys of the worlds before world w (world 1 teaches Space and the arrows instead).
  KR.reviewPool = function (w) {
    var seen = {}, out = [];
    for (var i = 1; i < w; i++) KR.WORLDS[i].levels.forEach(function (lv) { lv.k.forEach(function (c) { if (!seen[c]) { seen[c] = 1; out.push(c); } }); });
    return out;
  };
  function pickFrom(rand, list) { return list[Math.floor(rand() * list.length)]; }
  // A key that does not make three of the same in a row (when the lesson has more than one key).
  function okNext(seq, c, many) { var n = seq.length; return !many || !(seq[n - 1] === c && seq[n - 2] === c); }
  function triple(seq, i) {
    for (var j = Math.max(0, i - 2); j <= i; j++) if (seq[j + 2] !== undefined && seq[j] === seq[j + 1] && seq[j] === seq[j + 2]) return true;
    return false;
  }
  // A level's keys: each new key twice, the new keys mostly in the first half, then the
  // level's keys with a share of earlier worlds' keys; every key of the level at least once.
  KR.lessonKeys = function (w, l, tier, rand) {
    var lv = KR.WORLDS[w].levels[l], t = tierOf(tier), T = KR.tuneAt(t);
    var count = w === 0 ? Math.round(T.keys * 0.8) : T.keys;
    if (lv.words) return KR.wordKeys(t, count, rand).keys;
    var seq = [], review = KR.reviewPool(w), many = lv.k.length > 1, guard = 0;
    lv.n.forEach(function (c) { seq.push(c, c); });
    var intro = Math.ceil(count * 0.45);
    while (seq.length < count && guard++ < 4000) {
      var src = lv.k;
      if (seq.length < intro && lv.n.length) src = rand() < 0.65 ? lv.n : lv.k;
      else if (review.length && rand() < T.mix) src = review;
      var c = pickFrom(rand, src);
      // Above tier 3 the same key twice in a row gets rarer.
      if (!okNext(seq, c, many || src.length > 1) || (t >= 4 && many && seq[seq.length - 1] === c && rand() < 0.6)) continue;
      seq.push(c);
    }
    // Every key of the level at least once (when the level is long enough), put where it
    // makes no triple and takes the place of a key that is there more than once.
    if (lv.k.length * 2 <= count) lv.k.forEach(function (c) {
      if (seq.indexOf(c) >= 0) return;
      for (var tries = 0; tries < 80; tries++) {
        var i = 2 * lv.n.length + Math.floor(rand() * (seq.length - 2 * lv.n.length)), old = seq[i];
        if (seq.filter(function (x) { return x === old; }).length < 2) continue;
        seq[i] = c;
        if (!triple(seq, i)) return;
        seq[i] = old;
      }
    });
    return seq.slice(0, count);
  };
  // Whole words for the last level: letters per word grow with the tier.
  KR.wordKeys = function (tier, count, rand) {
    var T = KR.tuneAt(tier), list = KR.WORDS.filter(function (w) { var n = Array.from(w).length; return n >= T.wordMin && n <= T.wordMax; });
    var keys = [], words = [], last = '';
    for (var guard = 0; keys.length < count && guard < 400; guard++) {
      var word = pickFrom(rand, list);
      if (word === last || words.some(function (x) { return x.text === word; }) && words.length < list.length) continue;
      last = word;
      words.push({ start: keys.length, len: Array.from(word).length, text: word });
      keys = keys.concat(KR.wordCodes(word));
    }
    return { keys: keys, words: words };
  };
  KR.plan = function (w, l, tier, seed) {
    var t = tierOf(tier);
    w = clamp(w | 0, 0, KR.WORLD_COUNT - 1); l = clamp(l | 0, 0, KR.LEVELS - 1);
    var rand = KR.rng(((seed >>> 0) ^ 0x9E3779B9 ^ ((w * 8 + l + 1) * 0x01000193)) >>> 0), lv = KR.WORLDS[w].levels[l], keys, words = [];
    if (lv.words) {
      var T = KR.tuneAt(t), made = KR.wordKeys(t, T.keys, rand);
      keys = made.keys; words = made.words;
    } else keys = KR.lessonKeys(w, l, t, rand);
    var tune = KR.tuneAt(t);
    return { kind: 'level', w: w, l: l, tier: t, id: KR.roundId(w, l), keys: keys, words: words, fresh: lv.n.slice(),
      par: Math.round((2.5 + keys.length * tune.par) * 10) / 10, tune: tune, seed: seed >>> 0 };
  };
  // Endless: keys from every world the child has opened (letters and digits), newest most often.
  KR.endlessPlan = function (top, tier, seed) {
    var t = tierOf(tier), pool = KR.reviewPool(clamp(top | 0, 2, KR.WORLD_COUNT - 1) + 1);
    return { kind: 'endless', id: 'endless', tier: t, pool: pool, keys: null, words: [], fresh: [], par: 0, tune: KR.tuneAt(t), seed: seed >>> 0 };
  };
  // A two-player race: each side types only its own half of the keyboard on the same course.
  KR.duoPlan = function (side, seed) {
    var pool = side ? KR.RIGHT : KR.LEFT, rand = KR.rng(((seed >>> 0) ^ (side ? 0xA5A5A5 : 0x5A5A5A)) >>> 0), keys = [];
    while (keys.length < KR.DUO.keys) {
      var c = pickFrom(rand, pool);
      if (keys[keys.length - 1] !== c) keys.push(c);
    }
    var tune = {};
    for (var k in KR.DUO) tune[k] = KR.DUO[k];
    return { kind: 'duo', id: 'duo', side: side ? 1 : 0, tier: 0, keys: keys, words: [], fresh: [], par: 0, tune: tune, seed: seed >>> 0 };
  };

  /* -------------------------------------------------------------- course */
  KR.create = function (plan, seed) {
    var w = {
      plan: plan, kind: plan.kind, tune: plan.tune, rand: KR.rng(seed == null ? 1 : seed), stones: [], end: Infinity,
      on: 0, next: 1, offset: 0, made: 0, last: [],
      r: { x: KR.START_X, y: 0, vel: 0, phase: 'run', act: null, waitT: 0, graceT: 0, lost: false },
      steps: 0, hits: 0, misses: 0, stops: 0, combo: 0, bestCombo: 0, coins: 0, coinsMade: 0, t: 0, hearts: 3, boost: 1,
      done: false, over: false, ev: []
    };
    w.stones.push({ x0: -260, x1: 300, y: 0, code: '', kind: 'start', typed: true });
    if (plan.keys) {
      plan.keys.forEach(function (c, i) { add(w, c, wordAt(plan, i)); });
      var last = w.stones[w.stones.length - 1];
      w.end = w.stones.length;
      w.stones.push({ x0: last.x1, x1: last.x1 + 560, y: last.y, code: '', kind: 'finish', typed: true, flag: last.x1 + 250 });
    } else fill(w);
    return w;
  };
  function wordAt(plan, i) {
    for (var j = 0; j < plan.words.length; j++) { var x = plan.words[j]; if (i >= x.start && i < x.start + x.len) return j; }
    return -1;
  }
  function add(w, code, word) {
    var prev = w.stones[w.stones.length - 1], rand = w.rand, T = w.tune;
    var kind = code === 'ArrowUp' ? 'climb' : code === 'ArrowDown' ? 'slide' : 'hop';
    var gap = kind === 'slide' ? 0 : kind === 'climb' ? 34 : code === 'Space' ? 92 + Math.round(rand() * 30) : Math.round(T.gap + (rand() - 0.5) * 22);
    var width = code === 'Space' ? KR.SPACE_W : KR.CAP_W, y;
    if (kind === 'climb') y = Math.max(-2 * KR.UP, prev.y - KR.UP);
    else if (kind === 'slide') y = prev.y;
    else if (code === 'Space' || w.plan.w === 0) y = 0;
    else y = clamp(prev.y + Math.round((rand() - 0.5) * 2.4) * 12, -36, 24);
    // Words sit level, so their stones read as one row.
    if (word >= 0 && prev.word === word) y = prev.y;
    var s = { x0: prev.x1 + gap, x1: prev.x1 + gap + width, y: y, code: code, kind: kind, typed: false, word: word, n: w.made + w.offset, coin: null };
    if (kind === 'hop' && gap >= 40 && rand() < 0.36) { s.coin = { x: prev.x1 + gap / 2, y: Math.min(prev.y, y) - 92, got: false }; w.coinsMade++; }
    w.stones.push(s);
    w.made++;
  }
  // Endless: keep about 14 stones ahead, newest worlds' keys most often.
  function fill(w) {
    var pool = w.plan.pool, rand = w.rand;
    while (w.stones.length - w.on < 16) {
      var recent = pool.slice(Math.max(0, pool.length - 10)), c;
      for (var tries = 0; tries < 20; tries++) {
        c = pickFrom(rand, rand() < 0.45 ? recent : pool);
        if (okNext(w.last, c, true) && w.last[w.last.length - 1] !== c) break;
      }
      w.last.push(c); if (w.last.length > 4) w.last.shift();
      add(w, c, -1);
    }
  }
  // Endless runs drop the stones far behind, so the arrays stay small.
  function trim(w) {
    if (w.kind !== 'endless' || w.on < 12) return;
    var k = w.on - 4;
    w.stones.splice(0, k);
    w.on -= k; w.next -= k; w.offset += k;
  }
  KR.isKeyStone = function (s) { return !!s && s.kind !== 'start' && s.kind !== 'finish'; };
  // The x where the runner must act for the next stone, or null when the way is clear.
  function trigger(w) {
    var a = w.stones[w.on], b = w.stones[w.on + 1];
    if (!KR.isKeyStone(b)) return null;
    return b.kind === 'slide' ? a.x1 - KR.BAR : a.x1 - KR.EDGE;
  }
  KR.trigger = trigger;
  // The stone the child should type now, or null (all typed, or the next one is not shown yet).
  KR.target = function (w) {
    if (w.done || w.next >= w.end || w.next >= w.stones.length || w.next > w.on + w.tune.ahead) return null;
    return w.stones[w.next];
  };
  KR.visible = function (w, i) { return i <= w.on + w.tune.ahead; };

  /* --------------------------------------------------------------- input */
  // One key press, in the order the child typed it. Correct keys queue up ahead of the
  // runner (type-ahead) as far as the keycaps are shown; a wrong one costs accuracy and, at
  // higher tiers, a speed step. Keys that are not keyboard keys of the game are ignored.
  KR.press = function (w, code) {
    code = KR.norm(code);
    if (w.done || !KR.isGameKey(code)) return 'ignore';
    var s = KR.target(w);
    if (!s) return 'ignore';
    if (code === s.code) {
      s.typed = true;
      w.next++;
      w.hits++; w.combo++;
      if (w.combo > w.bestCombo) w.bestCombo = w.combo;
      w.steps = Math.min(w.tune.maxSteps, w.steps + 1);
      w.ev.push({ t: 'hit', i: w.next - 1, code: code, x: s.x0, x1: s.x1, y: s.y, combo: w.combo, steps: w.steps, waiting: w.r.phase === 'wait', word: s.word });
      if (w.r.phase === 'wait' && w.next - 1 === w.on + 1) act(w);
      return 'hit';
    }
    w.misses++; w.combo = 0;
    w.steps = Math.max(0, w.steps - w.tune.wrongCost);
    w.ev.push({ t: 'wrong', i: w.next, code: code, want: s.code, x: s.x0, x1: s.x1, y: s.y, steps: w.steps });
    return 'wrong';
  };

  /* ---------------------------------------------------------------- step */
  function act(w) {
    var r = w.r, j = w.on + 1, s = w.stones[j], T = w.tune;
    var spd = Math.max(r.vel, T.speed * w.boost);
    var x1 = s.kind === 'slide' ? s.x0 + 72 : s.x0 + KR.LAND, dx = Math.max(1, x1 - r.x);
    var d = s.kind === 'slide' ? clamp(dx / (spd + 60), 0.24, 0.6) : clamp(dx / (spd * 1.15 + 150), 0.2, 0.5);
    var lift = s.kind === 'slide' ? 0 : 42 + Math.abs(s.y - r.y) * 0.6 + (s.code === 'Space' ? 22 : 0);
    r.act = { kind: s.kind, t: 0, d: d, x0: r.x, x1: x1, y0: r.y, y1: s.y, lift: lift, from: r.phase };
    w.ev.push({ t: 'act', kind: s.kind, i: j, x: r.x, y: r.y, from: r.phase, code: s.code });
    r.phase = 'act';
    w.on = j;
    r.lost = false;
    if (w.kind === 'endless') { fill(w); w.boost = Math.min(1.6, 1 + 0.035 * Math.floor(w.hits / 10)); }
  }
  KR.step = function (w, dt) {
    if (w.done) return w;
    w.t += dt;
    var r = w.r, T = w.tune;
    var want = r.phase === 'wait' ? 0 : T.speed * w.boost + T.step * w.steps;
    r.vel += (want - r.vel) * Math.min(1, dt * (want > r.vel ? 5 : 12));
    if (r.phase === 'run') {
      r.x += r.vel * dt;
      var trig = trigger(w), ahead = w.stones[w.on + 1];
      if (trig !== null && r.x >= trig) {
        if (w.next > w.on + 1) act(w);
        else {
          r.x = trig; r.phase = 'wait'; r.waitT = 0; r.graceT = 0; r.vel = 0;
          var lost = w.steps;
          w.stops++; w.steps = 0;
          w.ev.push({ t: 'stop', i: w.on + 1, x: r.x, y: r.y, lost: lost, code: ahead.code });
        }
      } else if (trig === null && ahead && ahead.kind === 'finish' && r.x >= ahead.flag) {
        w.done = true;
        w.ev.push({ t: 'finish', x: r.x, y: r.y });
      }
    } else if (r.phase === 'wait') {
      r.waitT += dt; r.graceT += dt;
      // Endless: a stop longer than the grace costs a heart, and every further grace another
      // one (so a run nobody plays ends too); the third one ends the run.
      if (w.kind === 'endless' && r.graceT >= T.grace) {
        r.lost = true; r.graceT = 0; w.hearts--;
        w.ev.push({ t: 'heart', hearts: w.hearts, x: r.x, y: r.y });
        if (w.hearts <= 0) { w.done = true; w.over = true; w.ev.push({ t: 'over', x: r.x, y: r.y }); }
      }
    } else if (r.phase === 'act') {
      var a = r.act;
      a.t += dt;
      var p = Math.min(1, a.t / a.d), s = w.stones[w.on];
      r.x = a.x0 + (a.x1 - a.x0) * p;
      r.y = a.y0 + (a.y1 - a.y0) * p - a.lift * 4 * p * (1 - p);
      if (s.coin && !s.coin.got && p >= 0.45) { s.coin.got = true; w.coins++; w.ev.push({ t: 'coin', x: s.coin.x, y: s.coin.y, coins: w.coins }); }
      if (p >= 1) {
        r.phase = 'run'; r.y = a.y1; r.act = null;
        w.ev.push({ t: 'land', i: w.on, kind: a.kind, x: r.x, y: r.y, code: s.code });
        trim(w);
      }
    }
    return w;
  };
  // How far through the course the runner is, 0..1 (levels and races).
  KR.progress = function (w) {
    if (!isFinite(w.end)) return 0;
    var fin = w.stones[w.stones.length - 1];
    return clamp((w.r.x - KR.START_X) / Math.max(1, fin.flag - KR.START_X), 0, 1);
  };
  // Correct keys so far, counting stones already dropped in endless runs.
  KR.keysTyped = function (w) { return w.hits; };

  /* ------------------------------------------------------ stars and DDA */
  KR.result = function (w) {
    var acc = w.hits / Math.max(1, w.hits + w.misses);
    return { kind: w.kind, hits: w.hits, misses: w.misses, stops: w.stops, time: w.t, par: w.plan.par, acc: acc, coins: w.coins,
      bestCombo: w.bestCombo, tier: w.plan.tier };
  };
  // Finishing earns a star, one more for 90 % right keys, one more for beating the time.
  KR.stars = function (r) { return 1 + (r.acc >= 0.9 ? 1 : 0) + (r.time <= r.par ? 1 : 0); };
  // 0..1 for Kit.dda: right keys and pace, or for an endless run right keys and how far it got.
  KR.outcome = function (r) {
    var x = r.kind === 'endless' ? 0.5 * r.acc + 0.5 * Math.min(1, r.hits / KR.TUNE.goal[tierOf(r.tier) - 1])
      : 0.55 * r.acc + 0.45 * Math.min(1, r.par / Math.max(0.1, r.time));
    return Math.round(clamp(x, 0, 1) * 1000) / 1000;
  };

  /* ------------------------------------------------------------ wardrobe */
  KR.COLORS = [
    { c: '#ff8a3d', need: 0 }, { c: '#4fc3ff', need: 3 }, { c: '#7ee05b', need: 6 }, { c: '#ff6fb5', need: 10 },
    { c: '#b48cff', need: 15 }, { c: '#ffd23f', need: 21 }, { c: '#ff5d6c', need: 28 }, { c: 'rainbow', need: 36 }
  ];
  KR.HATS = [
    { id: 'none', need: 0 }, { id: 'cap', need: 2 }, { id: 'bow', need: 5 }, { id: 'flower', need: 9 }, { id: 'party', need: 14 },
    { id: 'crown', need: 20 }, { id: 'phones', need: 27 }, { id: 'wizard', need: 35 }, { id: 'helmet', need: 45 }
  ];
  KR.MAX_STARS = KR.WORLD_COUNT * KR.LEVELS * 3;
  KR.unlocks = function (before, after) {
    var out = [];
    KR.COLORS.forEach(function (c, i) { if (c.need > before && c.need <= after) out.push({ type: 'color', i: i }); });
    KR.HATS.forEach(function (h, i) { if (h.need > before && h.need <= after) out.push({ type: 'hat', i: i }); });
    return out;
  };

  /* ---------------------------------------------------------------- saves */
  // { v: 2, stars: [world][level] 0..3, best: [world][level] best time in tenths of a second
  //   (0: none), endless: most keys in an endless run, label: 'both' | 'ar' | 'en' (which
  //   letter the keycaps show big), color, hat, seen: the star total when the wardrobe was
  //   last opened, coach: the first-time coach has been shown }
  KR.LABELS = ['both', 'ar', 'en'];
  KR.freshSave = function () {
    var stars = [], best = [];
    for (var w = 0; w < KR.WORLD_COUNT; w++) { stars.push([0, 0, 0, 0]); best.push([0, 0, 0, 0]); }
    return { v: 2, stars: stars, best: best, endless: 0, label: 'both', color: 0, hat: 0, seen: 0, coach: false };
  };
  function int(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  // Every field is checked: an old save from the 3D version, a damaged or a hand-edited one
  // always loads as a playable save.
  KR.loadSave = function (raw) {
    var s = KR.freshSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 2) return s;
    for (var w = 0; w < KR.WORLD_COUNT; w++) {
      var row = Array.isArray(raw.stars) && Array.isArray(raw.stars[w]) ? raw.stars[w] : [];
      var times = Array.isArray(raw.best) && Array.isArray(raw.best[w]) ? raw.best[w] : [];
      for (var l = 0; l < KR.LEVELS; l++) {
        s.stars[w][l] = int(row[l], 0, 3) ? row[l] : 0;
        s.best[w][l] = s.stars[w][l] && int(times[l], 1, 36000) ? times[l] : 0;
      }
    }
    s.endless = int(raw.endless, 0, 999999) ? raw.endless : 0;
    s.label = KR.LABELS.indexOf(raw.label) >= 0 ? raw.label : 'both';
    var total = KR.total(s);
    s.color = int(raw.color, 0, KR.COLORS.length - 1) && KR.COLORS[raw.color].need <= total ? raw.color : 0;
    s.hat = int(raw.hat, 0, KR.HATS.length - 1) && KR.HATS[raw.hat].need <= total ? raw.hat : 0;
    s.seen = int(raw.seen, 0, total) ? raw.seen : 0;
    s.coach = raw.coach === true;
    return s;
  };
  KR.total = function (s) { var n = 0; s.stars.forEach(function (row) { row.forEach(function (v) { n += v; }); }); return n; };
  KR.worldStars = function (s, w) { return s.stars[w].reduce(function (a, b) { return a + b; }, 0); };
  // A world opens when the last level of the world before it has a star.
  KR.worldOpen = function (s, w) { return w === 0 || s.stars[w - 1][KR.LEVELS - 1] > 0 || s.stars[w].some(Boolean); };
  KR.isOpen = function (s, w, l) { return KR.worldOpen(s, w) && (l === 0 || s.stars[w][l - 1] > 0 || s.stars[w][l] > 0); };
  // The endless run opens once world 2 is finished.
  KR.endlessOpen = function (s) { return s.stars[1][KR.LEVELS - 1] > 0; };
  KR.topWorld = function (s) { var t = 0; for (var w = 0; w < KR.WORLD_COUNT; w++) if (KR.worldOpen(s, w)) t = w; return t; };
  // The first open level without a star, else the last level of the top world.
  KR.nextLevel = function (s) {
    for (var w = 0; w < KR.WORLD_COUNT; w++) for (var l = 0; l < KR.LEVELS; l++) if (KR.isOpen(s, w, l) && !s.stars[w][l]) return { w: w, l: l };
    return { w: KR.WORLD_COUNT - 1, l: KR.LEVELS - 1 };
  };
})();
