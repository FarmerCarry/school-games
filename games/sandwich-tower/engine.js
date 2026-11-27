/* Sandwich Tower (برج السندويش): the pure engine. No DOM, no Kit, no timers, no Math.random.
 *
 * One ingredient at a time slides (or swings on a crane) above the tower top; a drop lets
 * it fall straight down. Whatever overhangs the piece below is sliced off, so the next
 * piece is only as wide as what is left. A drop close enough to the middle is "perfect":
 * it snaps onto the piece below, and three perfects in a row grow the piece back a little.
 * A piece that misses the tower tumbles off (from level 3 on that costs a heart). At the
 * level's goal the top bun drops by itself and a giant eater chomps the whole sandwich.
 *
 * Units are logical pixels. x runs right as on screen; y is the height above the plate
 * (up is +). The UI layer (game.js) owns the save object and passes difficulty in.
 */
(function (root) {
  'use strict';
  var ST = {};
  var M = Math;
  ST.HOVER = 150;        // the moving piece floats this far above the tower top
  ST.GRAVITY = 2600;     // px/s² for a falling piece (world 3 falls slower)
  ST.WAIT = 0.12;        // seconds from a landing to the next piece
  ST.GROW = 30;          // px a run of perfects adds back
  ST.GROW_RUN = 3;       // perfects in a row that grow the piece
  ST.TOL_TIME = 0.025;   // a perfect also allows this many seconds of the piece's travel
  ST.EAT_IN = 0.55;      // the eater slides in
  ST.BITE = 0.36;        // one bite
  ST.BITES = 7;          // the most bites for a whole sandwich
  ST.BURP = 0.9;
  ST.BUN_WAIT = 0.25;    // from the bun landing to the eater
  ST.LOST = 1.1;         // from the last heart to the result
  ST.MAX_PIECES = 400;   // endless keeps the newest pieces only
  ST.DUO_GOAL = 15;
  ST.ROPE = 340;         // the crane rope in world 3

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  ST.clamp = clamp;
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = M.imul(t ^ (t >>> 15), t | 1);
      t ^= t + M.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  ST.rng = rng;

  /* ------------------------------------------------------------ pieces */
  // h: the slab's thickness. silly items land as a slab of the current width too.
  ST.KINDS = {
    bread: { h: 30 }, bun: { h: 44 }, lettuce: { h: 20 }, tomato: { h: 20 }, cheese: { h: 18 },
    cucumber: { h: 22 }, egg: { h: 22 }, patty: { h: 28 }, falafel: { h: 28 }, pickles: { h: 20 },
    cat: { h: 38, silly: 1 }, sneaker: { h: 34, silly: 1 }, duck: { h: 36, silly: 1 }, pillow: { h: 32, silly: 1 },
    donut: { h: 32, silly: 1 }, melon: { h: 30, silly: 1 }, pizza: { h: 24, silly: 1 }, gamepad: { h: 30, silly: 1 },
    toaster: { h: 40, silly: 1 }, cactus: { h: 42, silly: 1 }
  };
  ST.REAL = ['lettuce', 'tomato', 'cheese', 'cucumber', 'egg', 'patty', 'falafel', 'pickles'];
  ST.SILLY = ['cat', 'sneaker', 'duck', 'pillow', 'donut', 'melon', 'pizza', 'gamepad', 'toaster', 'cactus'];

  /* ------------------------------------------------------------ levels */
  ST.WORLDS = [
    { id: 'canteen', name: 'مقصف المدرسة' },
    { id: 'clouds', name: 'نزهة الغيوم' },
    { id: 'space', name: 'مطعم الفضاء' }
  ];
  // goal pieces, start width, slide speed (px/s), slide reach either side of the tower,
  // floor width (a slice never leaves less), hearts (0 = misses are free), extra perfect
  // tolerance (px), how it moves, and the silly item each level shows first.
  function L(goal, w0, speed, amp, floor, hearts, tolBonus, move, feature, more) {
    var s = { goal: goal, w0: w0, speed: speed, amp: amp, floor: floor, hearts: hearts, tolBonus: tolBonus, move: move,
      feature: feature, silly: 0.3, wobble: 0, period: 4, gravity: ST.GRAVITY };
    for (var k in more) s[k] = more[k];
    return s;
  }
  ST.LEVELS = [
    // World 1, the school canteen: a plain slide from the left. Levels 1 and 2 cannot be
    // lost: misses are free and the floor width is wider than the reach, so even a drop at
    // the very edge lands.
    L(6, 320, 170, 200, 220, 0, 26, 'slide', 'cat', { silly: 0.22 }),
    L(8, 310, 185, 170, 180, 0, 18, 'slide', 'sneaker', { silly: 0.26 }),
    L(10, 300, 195, 215, 72, 3, 12, 'slide', 'duck', { silly: 0.3 }),
    L(12, 290, 210, 230, 64, 3, 8, 'slide', 'pillow', { silly: 0.32 }),
    // World 2, the cloud picnic: faster, from alternating sides, some pieces wobble.
    L(12, 290, 230, 240, 60, 3, 8, 'alt', 'donut', { silly: 0.34 }),
    L(14, 290, 245, 245, 58, 3, 7, 'alt', 'melon', { silly: 0.36, wobble: 0.3 }),
    L(15, 285, 260, 250, 56, 3, 6, 'alt', 'pizza', { silly: 0.38, wobble: 0.45 }),
    L(16, 285, 275, 255, 54, 3, 5, 'alt', 'gamepad', { silly: 0.4, wobble: 0.6 }),
    // World 3, the space diner: the piece swings on a crane rope and falls slowly.
    L(16, 290, 0, 220, 56, 3, 10, 'swing', 'toaster', { silly: 0.4, period: 4.0, gravity: 1100 }),
    L(18, 290, 0, 225, 54, 3, 9, 'swing', 'cactus', { silly: 0.42, period: 3.8, gravity: 1100 }),
    L(19, 285, 0, 230, 52, 3, 8, 'swing', 'cat', { silly: 0.45, period: 3.6, gravity: 1050 }),
    L(20, 285, 0, 235, 50, 3, 8, 'swing', 'duck', { silly: 0.5, period: 3.4, gravity: 1000 })
  ];
  ST.COUNT = ST.LEVELS.length;
  ST.worldOf = function (level) { return M.floor((clamp(level, 1, ST.COUNT) - 1) / 4); };
  // «إلى القمر»: as high as you can, the moves change and the speed ramps with the height.
  ST.ENDLESS = L(0, 300, 195, 220, 56, 3, 9, 'mix', 'cat', { silly: 0.3 });
  // The two-player duel: first to 15, two towers side by side, no difficulty adjustment.
  ST.DUO = L(ST.DUO_GOAL, 230, 215, 170, 50, 3, 8, 'alt', 'cat', { silly: 0.35 });
  ST.spec = function (mode, level) {
    if (mode === 'endless') return ST.ENDLESS;
    if (mode === 'duo') return ST.DUO;
    return ST.LEVELS[clamp(M.floor(level) || 1, 1, ST.COUNT) - 1];
  };
  // Stars: one for the finish, two and three by perfects.
  ST.starNeed = function (goal) { return [M.ceil(goal * 0.3), M.ceil(goal * 0.6)]; };
  ST.stars = function (goal, perfects) {
    var n = ST.starNeed(goal);
    return perfects >= n[1] ? 3 : perfects >= n[0] ? 2 : 1;
  };

  /* ------------------------------------------------------------- eaters */
  // The giant faces that chomp the sandwich; star totals unlock them (stars are never spent).
  ST.EATERS = [
    { id: 'hippo', name: 'هيبو', need: 0 },
    { id: 'rex', name: 'ريكسو', need: 4 },
    { id: 'robot', name: 'روبوتو', need: 9 },
    { id: 'shark', name: 'قرشوش', need: 14 },
    { id: 'fluffy', name: 'فروفرو', need: 20 },
    { id: 'alien', name: 'زوغلو', need: 26 },
    { id: 'walrus', name: 'جدّو الفظ', need: 32 }
  ];
  ST.MEDALS = [25, 50, 100]; // endless heights that each give a star once

  /* -------------------------------------------------------------- saves */
  ST.newSave = function () {
    var z = [];
    for (var i = 0; i < ST.COUNT; i++) z.push(0);
    return { v: 1, stars: z.slice(), best: z.slice(), endless: 0, eater: 0, seen: 1, coach: false, duo: [0, 0] };
  };
  function int(v, lo, hi, d) { return typeof v === 'number' && v === v && v >= lo && v <= hi ? M.floor(v) : d; }
  // Anything odd in a stored save falls back to the fresh value for that field.
  ST.loadSave = function (raw) {
    var s = ST.newSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
    for (var i = 0; i < ST.COUNT; i++) {
      if (Array.isArray(raw.stars)) s.stars[i] = int(raw.stars[i], 0, 3, 0);
      if (Array.isArray(raw.best)) s.best[i] = int(raw.best[i], 0, 1e6, 0);
    }
    // A level only counts as beaten when every level before it was beaten too.
    for (var j = 1; j < ST.COUNT; j++) if (!s.stars[j - 1]) { s.stars[j] = 0; }
    s.endless = int(raw.endless, 0, 1e5, 0);
    s.eater = int(raw.eater, 0, ST.EATERS.length - 1, 0);
    if (!ST.eaterOpen(s, s.eater)) s.eater = 0;
    s.seen = M.max(1, M.min(ST.eatersOpen(s), int(raw.seen, 1, ST.EATERS.length, 1)));
    s.coach = raw.coach === true;
    if (Array.isArray(raw.duo)) { s.duo[0] = int(raw.duo[0], 0, 1e6, 0); s.duo[1] = int(raw.duo[1], 0, 1e6, 0); }
    return s;
  };
  ST.totalStars = function (save) {
    var n = 0;
    for (var i = 0; i < ST.COUNT; i++) n += save.stars[i];
    for (var j = 0; j < ST.MEDALS.length; j++) if (save.endless >= ST.MEDALS[j]) n++;
    return n;
  };
  ST.eaterOpen = function (save, i) { return !!ST.EATERS[i] && ST.totalStars(save) >= ST.EATERS[i].need; };
  ST.eatersOpen = function (save) { var n = 0; for (var i = 0; i < ST.EATERS.length; i++) if (ST.eaterOpen(save, i)) n++; return n; };
  ST.levelOpen = function (save, level) { return level === 1 || (level >= 2 && level <= ST.COUNT && save.stars[level - 2] > 0); };
  // The next unbeaten level (1-based), or 0 when every level is beaten.
  ST.nextLevel = function (save) {
    for (var i = 0; i < ST.COUNT; i++) if (!save.stars[i]) return i + 1;
    return 0;
  };
  // Writes a finished round into the save. Returns what the result screen shows.
  ST.record = function (save, w) {
    var t = w.towers[0], before = ST.eatersOpen(save), out = { stars: 0, newBest: false, score: t.score, height: t.height, eaters: [] };
    if (w.mode === 'levels') {
      var i = w.level - 1;
      if (w.won) {
        out.stars = ST.stars(w.spec.goal, t.perfects);
        out.newStars = M.max(0, out.stars - save.stars[i]);
        save.stars[i] = M.max(save.stars[i], out.stars);
      }
      out.newBest = w.won && t.score > save.best[i];
      if (w.won) save.best[i] = M.max(save.best[i], t.score);
    } else if (w.mode === 'endless') {
      out.newBest = t.height > save.endless;
      save.endless = M.max(save.endless, t.height);
    } else if (w.mode === 'duo' && w.winner >= 0) {
      save.duo[w.winner]++;
    }
    for (var e = before; e < ST.EATERS.length; e++) if (ST.eaterOpen(save, e)) out.eaters.push(e);
    return out;
  };

  /* -------------------------------------------------------------- world */
  // o: { mode: 'levels'|'endless'|'duo'|'demo', level, speedMul, tol (base perfect px), seed,
  //      cx (single tower centre), spec (override) }
  ST.create = function (o) {
    o = o || {};
    var mode = o.mode || 'levels';
    var w = {
      mode: mode, level: mode === 'levels' ? clamp(M.floor(o.level) || 1, 1, ST.COUNT) : 0,
      spec: o.spec || ST.spec(mode, o.level), t: 0, phase: 'play', pt: 0, ev: [], towers: [],
      eat: null, won: false, winner: -1, speedMul: typeof o.speedMul === 'number' && o.speedMul > 0 ? o.speedMul : 1,
      tol: typeof o.tol === 'number' && o.tol >= 0 ? o.tol : 12, eatFast: 1
    };
    var seed = (o.seed >>> 0) || 1;
    var cxs = mode === 'duo' ? [320, 960] : [typeof o.cx === 'number' ? o.cx : 640];
    for (var i = 0; i < cxs.length; i++) w.towers.push(makeTower(w, i, cxs[i], seed + i * 7919));
    return w;
  };
  function makeTower(w, i, cx, seed) {
    var s = w.spec;
    var t = { i: i, cx: cx, rng: rng(seed), pieces: [], top: 0, tx: cx, tw: s.w0, cur: null, phase: 'wait', pt: 0,
      drops: 0, perfects: 0, combo: 0, bestCombo: 0, run: 0, hearts: s.hearts || 3, misses: 0, score: 0, height: 0,
      idx: 0, sides: 0, eaten: 0, lastKind: '', cam: 0, out: false };
    spawn(w, t);
    return t;
  }
  function emit(w, e) { if (w.ev.length < 64) w.ev.push(e); }

  function nextKind(w, t) {
    var i = t.idx++, s = w.spec, r = t.rng;
    if (i === 0) return 'bread';
    if (i === 2 && s.feature) return s.feature;
    if (i % 7 === 0) return 'bread'; // a middle slice: a club sandwich
    var silly = s.silly + M.min(0.25, t.height * 0.005);
    var list = r() < silly ? ST.SILLY : ST.REAL, k = list[M.floor(r() * list.length)];
    if (k === t.lastKind) k = list[(list.indexOf(k) + 1 + M.floor(r() * (list.length - 1))) % list.length];
    return k;
  }
  function spawn(w, t) {
    var s = w.spec, kind = nextKind(w, t), move = s.move, wob = 0, f = 1, amp = s.amp, period = s.period, g = s.gravity;
    var bonus = s.tolBonus, floor = s.floor;
    t.lastKind = kind;
    if (move === 'mix') {
      // Endless: plain slides first, then sides and wobbles, then the crane, then all mixed,
      // faster and less forgiving the higher it gets.
      var h = t.height;
      f = M.min(2.6, 1 + M.min(0.9, h / 70) + M.max(0, h - 63) / 150);
      bonus = M.max(2, s.tolBonus - h / 12);
      floor = M.max(36, s.floor - h / 5);
      amp = s.amp + M.min(40, h * 0.5);
      move = h < 20 ? 'slide' : h < 40 ? 'alt' : h < 60 ? 'swing' : ['slide', 'alt', 'swing'][M.floor(t.rng() * 3)];
      if (move === 'alt' && h >= 25 && t.rng() < 0.4) wob = 0.5;
      period = 4.2 / M.pow(f, 0.8);
      g = move === 'swing' ? 1100 : ST.GRAVITY;
    } else if (move === 'alt' && s.wobble && t.rng() < s.wobble) wob = 0.55;
    var side = move === 'slide' ? -1 : (t.sides % 2 ? 1 : -1);
    t.sides++;
    if (w.mode === 'duo') {
      var laneLo = t.i * 640 + 16, laneHi = (t.i + 1) * 640 - 16;
      var maxAmp = M.min(t.tx - (laneLo + t.tw / 2), (laneHi - t.tw / 2) - t.tx);
      amp = M.max(36, M.min(amp, maxAmp));
    }
    var speed = s.speed * w.speedMul * f;
    t.cur = {
      kind: kind, w: t.tw, h: ST.KINDS[kind].h, x: t.tx + side * amp, y: t.top + ST.HOVER, cx: t.tx, amp: amp,
      dir: -side, side: side, speed: speed, v: speed, wob: wob, ph: t.rng() * 6.283, move: move,
      period: period / w.speedMul, t: 0, vy: 0, g: g, swing: side, bonus: bonus, floor: floor, face: t.rng() < 0.45 ? 1 + M.floor(t.rng() * 3) : 0
    };
    t.cur.base = t.cur.y;
    if (move === 'swing') { t.cur.v = 0; arc(t.cur); }
    t.phase = 'slide';
    emit(w, { type: 'spawn', tower: t.i, kind: kind, move: move });
  }
  // A swinging piece hangs on a rope from a pivot above the screen: it rises at the ends of
  // its swing, and swing is the rope's angle (radians, + to the right).
  function arc(c) {
    var dx = c.x - c.cx, L = ST.ROPE;
    c.y = c.base + L - M.sqrt(M.max(0, L * L - dx * dx));
    c.swing = M.asin(clamp(dx / L, -1, 1));
  }
  // How far a piece travels each second right now (a swing is fastest in the middle).
  function moveCur(c, dt) {
    c.t += dt;
    if (c.move === 'swing') {
      var om = 2 * M.PI / c.period, ph = c.side * M.PI / 2 + om * c.t;
      c.x = c.cx + c.amp * M.sin(ph);
      c.v = c.amp * om * M.abs(M.cos(ph));
      arc(c);
      return;
    }
    c.v = c.speed * (1 + c.wob * M.sin(c.t * 5.2 + c.ph));
    c.x += c.dir * c.v * dt;
    var hi = c.cx + c.amp, lo = c.cx - c.amp;
    if (c.x > hi) { c.x = hi - (c.x - hi); c.dir = -1; } else if (c.x < lo) { c.x = lo + (lo - c.x); c.dir = 1; }
    c.swing = (c.x - c.cx) / c.amp;
  }
  // The perfect window for the piece in flight, in px either side of the tower top.
  ST.tolerance = function (w, c) {
    if (!c) return w.tol + w.spec.tolBonus;
    return w.tol + (c.bonus != null ? c.bonus : w.spec.tolBonus) + (c.dropV != null ? c.dropV : c.v) * ST.TOL_TIME;
  };

  // A drop request for tower i. Only a sliding piece drops; true when it did.
  ST.drop = function (w, i) {
    var t = w.towers[i || 0];
    if (!t || w.phase !== 'play' || t.out || t.phase !== 'slide') return false;
    t.phase = 'fall';
    t.cur.vy = 0; t.cur.dropV = t.cur.v;
    t.drops++;
    emit(w, { type: 'drop', tower: t.i, kind: t.cur.kind, x: t.cur.x });
    return true;
  };

  function land(w, t) {
    var c = t.cur, s = w.spec, tw = t.tw, d = c.x - t.tx, side = d >= 0 ? 1 : -1;
    var piece = { kind: c.kind, x: c.x, w: c.w, h: c.h, y: t.top, at: w.t, face: c.face, perfect: false, puff: 0 };
    var ev = { type: 'land', tower: t.i, kind: c.kind, d: d, perfect: false, grow: false, gain: 1 };
    if (M.abs(d) <= ST.tolerance(w, c)) {
      piece.x = t.tx; piece.perfect = true;
      t.perfects++; t.combo++; t.run++;
      t.bestCombo = M.max(t.bestCombo, t.combo);
      ev.perfect = true; ev.gain = 3;
      if (t.run % ST.GROW_RUN === 0 && piece.w < s.w0) { piece.w = M.min(s.w0, piece.w + ST.GROW); ev.grow = true; }
    } else {
      var overlap = M.min(c.x + c.w / 2, t.tx + tw / 2) - M.max(c.x - c.w / 2, t.tx - tw / 2);
      if (overlap <= 0) { miss(w, t, side); return; }
      // The overhang is sliced off; a level's floor width puffs a thin piece back up.
      var cut = c.w - overlap, keep = M.max(overlap, M.min(tw, c.floor != null ? c.floor : s.floor));
      piece.x = keep > overlap ? clamp(c.x, t.tx - tw / 2 + keep / 2, t.tx + tw / 2 - keep / 2)
        : (M.max(c.x - c.w / 2, t.tx - tw / 2) + M.min(c.x + c.w / 2, t.tx + tw / 2)) / 2;
      if (w.mode === 'duo') piece.x = clamp(piece.x, t.i * 640 + 180, (t.i + 1) * 640 - 180);
      piece.w = keep; piece.puff = keep > overlap ? 1 : 0;
      if (cut > 0.5) emit(w, { type: 'slice', tower: t.i, kind: c.kind, side: side, w: cut, h: c.h, y: t.top, x: t.tx + side * (tw / 2 + cut / 2), face: c.face });
      t.combo = 0; t.run = 0;
    }
    t.score += ev.gain;
    t.pieces.push(piece);
    if (t.pieces.length > ST.MAX_PIECES) t.pieces.shift();
    t.top += c.h; t.tx = piece.x; t.tw = piece.w; t.height++;
    ev.x = piece.x; ev.y = piece.y; ev.w = piece.w; ev.h = piece.h; ev.combo = t.combo; ev.score = t.score; ev.height = t.height;
    emit(w, ev);
    t.cur = null; t.phase = 'wait'; t.pt = 0;
    if (w.phase !== 'play') return;
    if (s.goal && t.height >= s.goal) {
      if (w.mode === 'duo') w.winner = t.i;
      w.won = true;
      startBun(w, t);
    } else if (w.mode === 'endless' && t.height % 25 === 0) emit(w, { type: 'milestone', height: t.height });
  }
  function miss(w, t, side) {
    var c = t.cur, cost = w.spec.hearts > 0;
    t.misses++; t.combo = 0; t.run = 0;
    if (cost) t.hearts--;
    emit(w, { type: 'miss', tower: t.i, kind: c.kind, x: c.x, y: c.y, w: c.w, h: c.h, vy: c.vy, side: side, face: c.face, heart: cost, hearts: t.hearts });
    t.cur = null; t.phase = 'wait'; t.pt = 0;
    if (cost && t.hearts <= 0 && w.phase === 'play') out(w, t);
  }
  // A tower with no hearts left.
  function out(w, t) {
    t.out = true;
    if (w.mode === 'duo') {
      var other = w.towers[1 - t.i];
      w.winner = other.i; w.won = true;
      startBun(w, other);
    } else if (w.mode === 'endless' && t.height > 0) {
      w.won = false;
      startBun(w, t);
    } else {
      w.won = false; w.phase = 'lost'; w.pt = 0;
      emit(w, { type: 'lose', tower: t.i });
    }
  }
  function startBun(w, t) {
    w.phase = 'bun'; w.pt = 0; w.eat = { tower: t.i };
    t.cur = { kind: 'bun', w: t.tw * 1.04, h: ST.KINDS.bun.h, x: t.tx, y: t.top + ST.HOVER * 0.9, vy: 0, g: ST.GRAVITY, face: 0, v: 0, swing: 0, move: 'drop' };
    t.phase = 'bun';
    emit(w, { type: 'goal', tower: t.i, won: w.won });
  }
  function startEat(w, t) {
    var n = t.pieces.length, k = M.max(1, M.ceil(n / ST.BITES));
    w.phase = 'eat'; w.pt = 0;
    w.eat = { tower: t.i, t: 0, pt: 0, phase: 'in', k: k, bite: 0, bites: M.ceil(n / k), closed: false };
    emit(w, { type: 'eat', tower: t.i, bites: w.eat.bites });
  }
  function finish(w) {
    w.phase = 'done'; w.pt = 0;
    emit(w, { type: 'done', won: w.won, winner: w.winner });
  }
  // The top of what is left of the tower while it is eaten.
  ST.leftTop = function (t) {
    var n = t.pieces.length - t.eaten;
    return n > 0 ? t.pieces[n - 1].y + t.pieces[n - 1].h : 0;
  };

  function stepTower(w, t, dt) {
    var c = t.cur;
    if (t.phase === 'slide') moveCur(c, dt);
    else if (t.phase === 'fall' || t.phase === 'bun') {
      c.vy += c.g * dt; c.y -= c.vy * dt;
      if (c.y <= t.top) {
        c.y = t.top;
        if (t.phase === 'fall') land(w, t);
        else {
          t.pieces.push({ kind: 'bun', x: c.x, w: c.w, h: c.h, y: t.top, at: w.t, face: 0, perfect: true, puff: 0 });
          t.top += c.h; t.cur = null; t.phase = 'done'; w.phase = 'bunwait'; w.pt = 0;
          emit(w, { type: 'bun', tower: t.i, x: c.x, y: t.top - c.h, w: c.w });
        }
      }
    } else if (t.phase === 'wait') {
      t.pt += dt;
      if (t.pt >= ST.WAIT && w.phase === 'play' && !t.out) spawn(w, t);
    }
    // The camera keeps the tower top in the lower middle of the screen.
    var focus = w.eat && w.eat.tower === t.i && (w.phase === 'eat' || w.phase === 'done') ? ST.leftTop(t) : t.top;
    var target = M.max(0, focus - 160);
    t.cam += (target - t.cam) * M.min(1, dt * (w.phase === 'eat' ? 7 : 4));
  }

  ST.step = function (w, dt) {
    w.t += dt; w.pt += dt;
    for (var i = 0; i < w.towers.length; i++) stepTower(w, w.towers[i], dt);
    if (w.phase === 'bunwait' && w.pt >= ST.BUN_WAIT) startEat(w, w.towers[w.eat.tower]);
    else if (w.phase === 'eat') {
      var e = w.eat, t = w.towers[e.tower], d = dt * w.eatFast;
      e.t += d; e.pt += d;
      if (e.phase === 'in' && e.pt >= ST.EAT_IN) { e.phase = 'bite'; e.pt = 0; e.closed = false; }
      if (e.phase === 'bite') {
        if (!e.closed && e.pt >= ST.BITE * 0.6) {
          e.closed = true;
          var left = t.pieces.length - t.eaten, k = M.min(e.k, left);
          t.eaten += k;
          emit(w, { type: 'bite', tower: t.i, count: k, left: left - k, bite: e.bite, y: ST.leftTop(t), x: t.tx });
        }
        if (e.pt >= ST.BITE) {
          e.bite++; e.pt = 0; e.closed = false;
          if (t.eaten >= t.pieces.length) { e.phase = 'burp'; emit(w, { type: 'burp', tower: t.i }); }
        }
      } else if (e.phase === 'burp' && e.pt >= ST.BURP) { e.phase = 'gone'; finish(w); }
    } else if (w.phase === 'lost' && w.pt >= ST.LOST) finish(w);
    return w;
  };

  root.ST = ST;
})(typeof window !== 'undefined' ? window : this);
