/* Ball Storm (عاصفة الكرات): the pure engine. No DOM, no Kit, no timers, no Math.random.
 *
 * A jelly paddle at the bottom, a wall of jelly bricks at the top and balls that bounce
 * between them. Power-up capsules multiply the balls (×3, +10, ×2 rings) up to CAP. A
 * level is won when every breakable brick has popped; the last ball falling costs a
 * life. The endless mode slides new brick rows down from the top until they reach the
 * line above the paddle.
 *
 * Units are the 1280x720 logical canvas. Bricks live in a COLS x ROWS grid of CW x CH
 * cells whose top edge is at w.oy. Balls are kept in flat typed arrays (positions,
 * unit directions); every ball moves at the world speed w.speed in px/s, in substeps of
 * at most 0.8 of its radius so it can never skip through a brick.
 * The UI layer (game.js) owns the save object and reads w.ev, the events of the last step.
 */
(function (root) {
  'use strict';
  var BS = root.BS || (root.BS = {});
  var M = Math;

  var W = 1280, H = 720;
  var L = 40, R = 1240, TOP = 96;                 // the walls' inner edges
  var CW = 60, CH = 48, COLS = 20, ROWS = 12, GX = 40, GY = 96, N = COLS * ROWS;
  var PY = 648, PH = 28;                          // the paddle's top and thickness
  var FLOOR = 700, DANGER = 600, LOST = 735;
  var RAD = 10, CAP = 500, CAPS = 8;
  var SERVE = 3.5, STICK = 1.8, RING_LIFE = 6, RING_R = 40, CLEAR_T = 1.8, OVER_T = 1.4;
  var PADDLE_SPEED = 1000, CAP_FALL = 190;
  var EMPTY = 0, JELLY = 1, TOUGH = 2, STEEL = 3, TNT = 4, GEM = 5;
  var COLORS = 'roygcbvpwkn';
  var KINDS = ['x3', 'plus', 'big', 'fire', 'slow', 'sticky', 'shield'];
  var WEIGHTS = [30, 22, 13, 12, 6, 7, 10];
  var POW = { big: 12, fire: 7, slow: 7, sticky: 10, shield: 10 };

  BS.W = W; BS.H = H;
  BS.F = { L: L, R: R, TOP: TOP, CW: CW, CH: CH, COLS: COLS, ROWS: ROWS, GX: GX, GY: GY, PY: PY, PH: PH,
    FLOOR: FLOOR, DANGER: DANGER, RAD: RAD, CAP: CAP, RING_R: RING_R, RING_LIFE: RING_LIFE, SERVE: SERVE };
  BS.T = { EMPTY: EMPTY, JELLY: JELLY, TOUGH: TOUGH, STEEL: STEEL, TNT: TNT, GEM: GEM };
  BS.KINDS = KINDS;
  BS.POW = POW;
  BS.COLORS = COLORS;
  BS.GEMS = ['', 'x3', 'plus'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  // mulberry32 on the world's own seed: the same seed plays the same game.
  function rnd(w) {
    var t = (w.seed = (w.seed + 0x6D2B79F5) | 0);
    t = M.imul(t ^ (t >>> 15), t | 1);
    t ^= t + M.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  BS.rnd = rnd;
  // At most `cap` events of one type per step, so a storm of balls never floods the UI.
  function emit(w, type, cap) {
    if (cap && (w.fc[type] = (w.fc[type] || 0) + 1) > cap) return null;
    var e = { type: type };
    w.ev.push(e);
    return e;
  }

  /* ------------------------------------------------------------- levels */
  // One level's picture placed on the grid: [{ k, t, hp, col, gem }], rings [{ c, r }].
  BS.parse = function (spec) {
    var rows = spec.rows, wide = 0, out = { cells: [], rings: [] };
    for (var i = 0; i < rows.length; i++) wide = M.max(wide, rows[i].length);
    var c0 = M.floor((COLS - wide) / 2);
    for (var r = 0; r < rows.length && r + 1 < ROWS; r++) {
      for (var c = 0; c < rows[r].length && c + c0 < COLS; c++) {
        var ch = rows[r].charAt(c), k = (r + 1) * COLS + c + c0, lo = COLORS.indexOf(ch), up = COLORS.indexOf(ch.toLowerCase());
        if (ch === 'x') out.rings.push({ c: c + c0, r: r + 1 });
        else if (lo >= 0) out.cells.push({ k: k, t: JELLY, hp: 1, col: lo, gem: 0 });
        else if (up >= 0 && ch !== ch.toLowerCase()) out.cells.push({ k: k, t: TOUGH, hp: 2, col: up, gem: 0 });
        else if (ch === '&') out.cells.push({ k: k, t: TOUGH, hp: 3, col: 11, gem: 0 });
        else if (ch === '#') out.cells.push({ k: k, t: STEEL, hp: 1, col: 12, gem: 0 });
        else if (ch === 't') out.cells.push({ k: k, t: TNT, hp: 1, col: 0, gem: 0 });
        else if (ch === '*' || ch === '3' || ch === '+') out.cells.push({ k: k, t: GEM, hp: 1, col: 13, gem: ch === '3' ? 1 : ch === '+' ? 2 : 0 });
      }
    }
    return out;
  };
  // Breakable bricks in a level (everything but steel).
  BS.count = function (spec) { return BS.parse(spec).cells.filter(function (c) { return c.t !== STEEL; }).length; };

  /* -------------------------------------------------------------- saves */
  BS.BALLS = [
    { id: 'candy', name: 'كرة الحلوى', stars: 0 },
    { id: 'tennis', name: 'كرة التنس', stars: 3 },
    { id: 'eye', name: 'عين مدوّرة', stars: 8 },
    { id: 'planet', name: 'كوكب صغير', stars: 14 },
    { id: 'donut', name: 'دونات', stars: 20 },
    { id: 'bubble', name: 'فقاعة', stars: 28 },
    { id: 'pea', name: 'بازلاء بعيون', stars: 34 }
  ];
  BS.PADDLES = [
    { id: 'jelly', name: 'جيلي', stars: 0 },
    { id: 'banana', name: 'موزة', stars: 5 },
    { id: 'skate', name: 'لوح تزلّج', stars: 11 },
    { id: 'surf', name: 'لوح أمواج', stars: 17 },
    { id: 'cat', name: 'قطة طويلة', stars: 24 }
  ];
  BS.ENDLESS_AT = 5; // the endless mode opens once level 5 is won
  BS.newSave = function () {
    var z = [];
    for (var i = 0; i < BS.LEVELS.length; i++) z.push(0);
    return { v: 1, stars: z.slice(), best: z.slice(), endless: 0, ball: 0, paddle: 0, coach: false, storm: 1, seen: 0 };
  };
  function int(v, lo, hi, d) { return typeof v === 'number' && v === v && v >= lo && v <= hi ? M.floor(v) : d; }
  // Anything odd in a stored save falls back to the fresh value for that field.
  BS.loadSave = function (raw) {
    var s = BS.newSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
    for (var i = 0; i < s.stars.length; i++) {
      if (Array.isArray(raw.stars)) s.stars[i] = int(raw.stars[i], 0, 3, 0);
      if (Array.isArray(raw.best)) s.best[i] = int(raw.best[i], 0, 1e12, 0);
    }
    s.endless = int(raw.endless, 0, 1e12, 0);
    s.storm = int(raw.storm, 1, CAP, 1);
    s.coach = raw.coach === true;
    s.seen = int(raw.seen, 0, 999, 0);
    s.ball = int(raw.ball, 0, BS.BALLS.length - 1, 0);
    s.paddle = int(raw.paddle, 0, BS.PADDLES.length - 1, 0);
    if (!BS.owns(s, 'ball', s.ball)) s.ball = 0;
    if (!BS.owns(s, 'paddle', s.paddle)) s.paddle = 0;
    return s;
  };
  BS.totalStars = function (save) { var n = 0; for (var i = 0; i < save.stars.length; i++) n += save.stars[i]; return n; };
  BS.owns = function (save, kind, i) {
    var list = kind === 'ball' ? BS.BALLS : BS.PADDLES;
    return !!list[i] && BS.totalStars(save) >= list[i].stars;
  };
  // Wear an unlocked ball or paddle. Returns false when it is still locked.
  BS.wear = function (save, kind, i) {
    if (!BS.owns(save, kind, i)) return false;
    save[kind] = i;
    return true;
  };
  BS.levelOpen = function (save, n) { return n === 1 || (n >= 2 && n <= BS.LEVELS.length && save.stars[n - 2] > 0); };
  BS.endlessOpen = function (save) { return save.stars[BS.ENDLESS_AT - 1] > 0; };
  // Where Play goes: the first level not won yet, or the endless mode once all are won.
  BS.nextLevel = function (save) {
    for (var i = 0; i < save.stars.length; i++) if (!save.stars[i]) return i + 1;
    return 0;
  };
  // The cosmetics whose star price lies in (before, after]: just unlocked.
  BS.unlockedBetween = function (before, after) {
    var out = [];
    [['ball', BS.BALLS], ['paddle', BS.PADDLES]].forEach(function (p) {
      p[1].forEach(function (it, i) { if (it.stars > before && it.stars <= after) out.push({ kind: p[0], i: i, name: it.name, stars: it.stars }); });
    });
    return out.sort(function (a, b) { return a.stars - b.stars; });
  };
  // Stars for a won level: one for the win, one for losing no life, one for the time.
  BS.stars = function (w) {
    if (w.endless) return 0;
    return 1 + (w.lives >= 3 ? 1 : 0) + (w.clearAt <= w.spec.par ? 1 : 0);
  };
  // Writes a finished round into the save: { stars, newBest, unlocked }.
  BS.record = function (save, w) {
    var before = BS.totalStars(save), res = { stars: 0, newBest: false, unlocked: [], first: false };
    save.storm = M.max(save.storm, M.min(CAP, w.maxBalls));
    if (w.endless) {
      if (w.score > save.endless) { res.newBest = save.endless > 0; save.endless = w.score; }
      return res;
    }
    var i = w.level - 1;
    if (w.won) {
      res.stars = BS.stars(w);
      res.first = !save.stars[i];
      if (res.stars > save.stars[i]) save.stars[i] = res.stars;
    }
    if (w.won && w.score > save.best[i]) { res.newBest = save.best[i] > 0; save.best[i] = w.score; }
    res.unlocked = BS.unlockedBetween(before, BS.totalStars(save));
    return res;
  };

  /* -------------------------------------------------------------- world */
  // o: { level 1..15 (0 = endless), speed (px/s before the level's factor), paddle (px),
  //      drop (chance a jelly drops a capsule), magnet (0..1 capsules drift to the paddle),
  //      descent (endless px/s), seed }
  BS.create = function (o) {
    o = o || {};
    var lv = clamp(o.level | 0, 0, BS.LEVELS.length), spec = lv ? BS.LEVELS[lv - 1] : null;
    var w = {
      level: lv, endless: !lv, spec: spec, seed: (o.seed >>> 0) || 7,
      t: 0, pt: 0, phase: 'play', ev: [], fc: {}, won: false, clearAt: 0,
      lives: 3, score: 0, maxBalls: 1, pops: 0, caught: 0, launches: 0, moves: 0, paddleHits: 0,
      // a wider paddle that steps down over levels 1-3; later worlds are a little narrower
      px: W / 2, pv: 0, pwBase: (o.paddle || 180) + ([50, 24, 12][lv - 1] || (spec ? -6 * spec.world : 0)), pw: 0,
      speedBase: (o.speed || 460) * (spec ? spec.speed : 1), speed: 0,
      // later worlds drop fewer capsules from plain jelly (gems always drop one)
      drop: (o.drop == null ? 0.07 : o.drop) * (spec ? [1, 0.75, 0.55][spec.world] : 0.8), magnet: o.magnet == null ? 0 : o.magnet,
      first: spec ? spec.first : 'x3', firstDone: false,
      type: new Uint8Array(N), hp: new Uint8Array(N), max: new Uint8Array(N), col: new Uint8Array(N), gem: new Uint8Array(N),
      hitAt: new Float32Array(N),
      rings: [], ringId: 0, caps: [],
      n: 0, x: new Float32Array(CAP), y: new Float32Array(CAP), dx: new Float32Array(CAP), dy: new Float32Array(CAP),
      combo: new Uint16Array(CAP), inRing: new Int16Array(CAP), stuck: new Uint8Array(CAP), soff: new Float32Array(CAP),
      stuckN: 0, stickT: 0, comboMax: 0,
      launched: false, serveT: SERVE, serveSide: 1,
      pow: { big: 0, fire: 0, slow: 0, sticky: 0, shield: 0 },
      floorPerm: !!(spec && spec.floor === 'perm'), floorHits: spec && typeof spec.floor === 'number' ? spec.floor : 0,
      left: 0, oy: GY, scroll: 0, descent: o.descent || 4.5, rowsMade: 0, wiped: false
    };
    w.pw = w.pwBase;
    for (var h = 0; h < N; h++) w.hitAt[h] = -9;
    if (spec) {
      var p = BS.parse(spec);
      p.cells.forEach(function (c) { put(w, c.k, c.t, c.hp, c.col, c.gem); });
      p.rings.forEach(function (rg) { addRing(w, rg.c, rg.r); });
    } else {
      w.oy = GY - CH;
      for (var i = 0; i < 5; i++) shift(w);
    }
    serveBall(w);
    return w;
  };
  function put(w, k, t, hp, col, gem) {
    w.type[k] = t; w.hp[k] = hp; w.max[k] = hp; w.col[k] = col; w.gem[k] = gem || 0;
    if (t !== STEEL) w.left++;
  }
  function clearCell(w, k) { if (w.type[k] && w.type[k] !== STEEL) w.left--; w.type[k] = EMPTY; w.hp[k] = 0; }
  function addRing(w, c, r) { w.rings.push({ c: c, r: r, x: 0, y: 0, life: -1, id: w.ringId++ }); placeRings(w); }
  function placeRings(w) {
    for (var j = 0; j < w.rings.length; j++) { var g = w.rings[j]; g.x = GX + g.c * CW + CW / 2; g.y = w.oy + g.r * CH + CH / 2; }
  }
  BS.cellX = function (k) { return GX + (k % COLS) * CW; };
  BS.cellY = function (w, k) { return w.oy + M.floor(k / COLS) * CH; };

  /* -------------------------------------------------------------- balls */
  function addBall(w, x, y, dx, dy) {
    if (w.n >= CAP) return -1;
    var i = w.n++;
    w.x[i] = x; w.y[i] = y; w.dx[i] = dx; w.dy[i] = dy;
    w.combo[i] = 0; w.inRing[i] = -1; w.stuck[i] = 0; w.soff[i] = 0;
    return i;
  }
  function removeBall(w, i) {
    var j = --w.n;
    if (w.stuck[i]) w.stuckN--;
    if (i !== j) {
      w.x[i] = w.x[j]; w.y[i] = w.y[j]; w.dx[i] = w.dx[j]; w.dy[i] = w.dy[j];
      w.combo[i] = w.combo[j]; w.inRing[i] = w.inRing[j]; w.stuck[i] = w.stuck[j]; w.soff[i] = w.soff[j];
    }
  }
  // Keeps a direction from going too flat or too straight (no endless sideways or
  // straight up-and-down loops), then makes it unit length.
  function tidy(w, i) {
    var dx = w.dx[i], dy = w.dy[i], l = M.sqrt(dx * dx + dy * dy) || 1;
    dx /= l; dy /= l;
    if (M.abs(dy) < 0.3) dy = dy < 0 ? -0.3 : 0.3;
    if (M.abs(dx) < 0.08) dx = (dx < 0 || (dx === 0 && rnd(w) < 0.5)) ? -0.08 : 0.08;
    l = M.sqrt(dx * dx + dy * dy);
    w.dx[i] = dx / l; w.dy[i] = dy / l;
  }
  function turn(w, i, a) {
    var c = M.cos(a), s = M.sin(a), dx = w.dx[i], dy = w.dy[i];
    w.dx[i] = dx * c - dy * s; w.dy[i] = dx * s + dy * c;
    tidy(w, i);
  }
  // A copy of ball i, turned by angle a.
  function copyBall(w, i, a) {
    var j = addBall(w, w.x[i], w.y[i], w.dx[i], w.dy[i]);
    if (j < 0) return -1;
    w.combo[j] = w.combo[i]; w.inRing[j] = w.inRing[i]; w.stuck[j] = w.stuck[i]; w.soff[j] = w.soff[i];
    if (w.stuck[j]) w.stuckN++;
    if (!w.stuck[j]) turn(w, j, a);
    return j;
  }
  function serveBall(w) {
    w.n = 0; w.stuckN = 0;
    addBall(w, w.px, PY - RAD, 0, -1);
    w.launched = false; w.serveT = SERVE;
  }
  // The serve flies at a brick (a random one of the lowest), a little to the side the paddle moves.
  function launch(w, auto) {
    if (w.launched) return;
    w.launched = true; w.launches++;
    var k = aimBrick(w), a = w.serveSide * 0.3;
    if (k >= 0) a = M.atan2(BS.cellX(k) + CW / 2 - w.px, PY - (BS.cellY(w, k) + CH));
    a += w.pv > 60 ? 0.12 : w.pv < -60 ? -0.12 : 0;
    w.serveSide = -w.serveSide;
    a = clamp(a, -0.75, 0.75);
    if (M.abs(a) < 0.08) a = a < 0 ? -0.08 : 0.08;
    w.dx[0] = M.sin(a); w.dy[0] = -M.cos(a); w.y[0] = PY - RAD - 1;
    emit(w, 'launch').auto = !!auto;
  }
  function aimBrick(w) {
    for (var r = ROWS - 1; r >= 0; r--) {
      var n = 0, c;
      for (c = 0; c < COLS; c++) if (w.type[r * COLS + c] && w.type[r * COLS + c] !== STEEL) n++;
      if (!n) continue;
      var pick = M.floor(rnd(w) * n);
      for (c = 0; c < COLS; c++) if (w.type[r * COLS + c] && w.type[r * COLS + c] !== STEEL && pick-- === 0) return r * COLS + c;
    }
    return -1;
  }
  function release(w) {
    var half = w.pw / 2;
    for (var i = 0; i < w.n; i++) if (w.stuck[i]) {
      var a = clamp(w.soff[i] / half, -1, 1) * 1.0;
      w.stuck[i] = 0; w.dx[i] = M.sin(a); w.dy[i] = -M.cos(a); w.y[i] = PY - RAD - 1;
      tidy(w, i);
    }
    w.stuckN = 0; w.stickT = 0;
    emit(w, 'unstick');
  }

  /* ------------------------------------------------------------- bricks */
  var boomQ = [];
  // A ball (or TNT, when i < 0) hits cell k. fire pops anything but steel at once.
  function damage(w, k, i, fire) {
    var t = w.type[k];
    if (!t) return;
    if (t === STEEL) { var cl = emit(w, 'clang', 3); if (cl) { cl.x = BS.cellX(k) + CW / 2; cl.y = BS.cellY(w, k) + CH / 2; } w.hitAt[k] = w.t; return; }
    w.hitAt[k] = w.t;
    if (!fire && w.hp[k] > 1) {
      w.hp[k]--;
      w.score += 50;
      var e = emit(w, 'hit', 24);
      if (e) { e.x = BS.cellX(k) + CW / 2; e.y = BS.cellY(w, k) + CH / 2; e.k = k; e.hp = w.hp[k]; }
      return;
    }
    pop(w, k, i);
  }
  function pop(w, k, i) {
    var t = w.type[k], x = BS.cellX(k) + CW / 2, y = BS.cellY(w, k) + CH / 2, col = w.col[k], gem = w.gem[k], mx = w.max[k];
    clearCell(w, k);
    w.pops++;
    var combo = 1;
    if (i >= 0) { combo = ++w.combo[i]; if (combo > w.comboMax) w.comboMax = combo; }
    var pts = (t === TNT ? 250 : 100 + 50 * (mx - 1)) * M.min(combo, 10);
    w.score += pts;
    var e = emit(w, 'pop', 40);
    if (e) { e.x = x; e.y = y; e.k = k; e.t = t; e.col = col; e.pts = pts; e.combo = combo; }
    if (i >= 0 && (combo === 5 || combo === 10 || combo === 20 || combo === 30 || combo === 50)) {
      var c = emit(w, 'combo', 2);
      if (c) { c.x = x; c.y = y; c.n = combo; }
    }
    // What falls out of it.
    // In endless a big storm drops fewer capsules, so it thins out again and the wall creeps on.
    var kind = null, crowd = w.endless ? M.min(1, 8 / M.max(1, w.n)) : 1;
    if (!w.firstDone && w.first) { kind = w.first; w.firstDone = true; }
    else if (t === GEM) { if (crowd >= 1 || rnd(w) < crowd * 2) kind = BS.GEMS[gem] || pickKind(w); }
    else if (t !== TNT && rnd(w) < w.drop * crowd) kind = pickKind(w);
    if (kind) dropCap(w, x, y, kind);
    if (t === TNT) boomQ.push(k);
    if (!w.endless && w.left === 0 && w.phase === 'play') {
      w.phase = 'clear'; w.pt = 0; w.won = true; w.clearAt = w.t;
      emit(w, 'clear');
    }
  }
  // TNT pops its eight neighbours (tough ones too, but never steel); chains go on.
  function booms(w) {
    while (boomQ.length) {
      var k = boomQ.shift(), c = k % COLS, r = M.floor(k / COLS);
      var e = emit(w, 'boom');
      e.x = GX + c * CW + CW / 2; e.y = w.oy + r * CH + CH / 2;
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        var cc = c + dc, rr = r + dr;
        if ((dr || dc) && cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS) {
          var kk = rr * COLS + cc;
          if (w.type[kk] && w.type[kk] !== STEEL) pop(w, kk, -1);
        }
      }
    }
  }
  function pickKind(w) {
    var sum = 0, i;
    for (i = 0; i < WEIGHTS.length; i++) sum += WEIGHTS[i];
    var p = rnd(w) * sum;
    for (i = 0; i < WEIGHTS.length; i++) { p -= WEIGHTS[i]; if (p < 0) return KINDS[i]; }
    return KINDS[0];
  }
  function dropCap(w, x, y, kind) {
    if (w.caps.length >= CAPS || w.phase !== 'play') return;
    w.caps.push({ x: x, y: y, kind: kind, t: 0 });
    var e = emit(w, 'drop', 4);
    if (e) { e.x = x; e.y = y; e.kind = kind; }
  }
  // Ball i against the bricks around it: bounce off the nearest one (fireballs pop
  // straight through everything but steel).
  function hitBricks(w, i, fire, px, py) {
    var x = w.x[i], y = w.y[i], oy = w.oy;
    var c0 = M.floor((x - RAD - GX) / CW), c1 = M.floor((x + RAD - GX) / CW);
    var r0 = M.floor((y - RAD - oy) / CH), r1 = M.floor((y + RAD - oy) / CH);
    if (c1 < 0 || c0 >= COLS || r1 < 0 || r0 >= ROWS) return;
    c0 = M.max(0, c0); c1 = M.min(COLS - 1, c1); r0 = M.max(0, r0); r1 = M.min(ROWS - 1, r1);
    var best = -1, bd = RAD * RAD, bx = 0, by = 0;
    for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
      var k = r * COLS + c;
      if (!w.type[k]) continue;
      var left = GX + c * CW, top = oy + r * CH;
      var qx = clamp(x, left, left + CW), qy = clamp(y, top, top + CH);
      var ddx = x - qx, ddy = y - qy, d2 = ddx * ddx + ddy * ddy;
      if (d2 >= RAD * RAD) continue;
      if (fire && w.type[k] !== STEEL) { damage(w, k, i, true); continue; }
      if (d2 < bd || best < 0) { best = k; bd = d2; bx = qx; by = qy; }
    }
    if (best < 0) return;
    var nx, ny, d = M.sqrt(bd);
    if (d > 0.001) { nx = (x - bx) / d; ny = (y - by) / d; }
    else {
      // The ball is inside the brick (a row slid onto it): push it out downwards.
      var bc = best % COLS, br = M.floor(best / COLS);
      nx = 0; ny = 1; bx = clamp(px, GX + bc * CW, GX + bc * CW + CW); by = oy + br * CH + CH;
    }
    var dot = w.dx[i] * nx + w.dy[i] * ny;
    if (dot < 0) { w.dx[i] -= 2 * dot * nx; w.dy[i] -= 2 * dot * ny; }
    w.x[i] = bx + nx * (RAD + 0.01); w.y[i] = by + ny * (RAD + 0.01);
    turn(w, i, (rnd(w) - 0.5) * 0.06);
    damage(w, best, i, false);
  }

  /* ------------------------------------------------------------ the step */
  var NOINPUT = { dir: 0, target: null, launch: false };
  // inp: { dir: -1|0|1 (keys), target: x or null (the mouse), launch: true on the frame of a click or Space }
  BS.step = function (w, dt, inp) {
    inp = inp || NOINPUT;
    w.ev.length = 0;
    for (var f in w.fc) w.fc[f] = 0; // the per-type counts, reset in place (no new object a step)
    w.t += dt; w.pt += dt;
    if (w.phase === 'won' || w.phase === 'lost') return w;
    var p = w.pow;
    for (var k in p) if (p[k] > 0) { p[k] -= dt; if (p[k] <= 0) { p[k] = 0; emit(w, 'expire').kind = k; } }
    movePaddle(w, dt, inp);
    w.speed = w.speedBase * (1 + M.min(0.18, w.t / 160)) * (p.slow > 0 ? 0.55 : 1);
    if (w.phase === 'play') {
      if (!w.launched) {
        w.serveT -= dt;
        w.x[0] = w.px; w.y[0] = PY - RAD;
        if (inp.launch || w.serveT <= 0) launch(w, !inp.launch);
      } else if (w.stuckN > 0) {
        w.stickT += dt;
        if (inp.launch || w.stickT > STICK || p.sticky <= 0) release(w);
      }
    }
    if (w.phase !== 'over' && w.launched) moveBalls(w, dt);
    booms(w);
    for (var j = w.rings.length - 1; j >= 0; j--) {
      var g = w.rings[j];
      if (g.life > 0 && (g.life -= dt) <= 0) { w.rings.splice(j, 1); emit(w, 'ringGone').x = g.x; }
    }
    moveCaps(w, dt);
    if (w.endless && w.phase === 'play') descend(w, dt);
    if (w.phase === 'play' && w.launched && w.n === 0) loseLife(w);
    if (w.n > w.maxBalls) w.maxBalls = w.n;
    if (w.phase === 'clear' && w.pt >= CLEAR_T) { w.phase = 'won'; emit(w, 'result').won = true; }
    if (w.phase === 'over' && w.pt >= OVER_T) { w.phase = 'lost'; emit(w, 'result').won = false; }
    return w;
  };
  function movePaddle(w, dt, inp) {
    var want = w.pwBase * (w.pow.big > 0 ? 1.55 : 1);
    w.pw += (want - w.pw) * M.min(1, dt * 10);
    if (M.abs(want - w.pw) < 0.5) w.pw = want;
    var x0 = w.px, half = w.pw / 2;
    if (typeof inp.target === 'number' && inp.target === inp.target) {
      var d = inp.target - w.px, mx = 4200 * dt;
      w.px += d > mx ? mx : d < -mx ? -mx : d;
    } else if (inp.dir) w.px += (inp.dir > 0 ? 1 : -1) * PADDLE_SPEED * dt;
    w.px = clamp(w.px, L + half, R - half);
    w.pv = (w.px - x0) / dt;
    if (w.px !== x0 && (inp.dir || typeof inp.target === 'number')) w.moves++;
  }
  function floorOn(w) { return w.floorPerm || w.floorHits > 0 || w.pow.shield > 0 || w.phase === 'clear'; }
  function moveBalls(w, dt) {
    var dist = w.speed * dt, sub = M.max(1, M.ceil(dist / (RAD * 0.8))), d = dist / sub;
    var fire = w.pow.fire > 0, half = w.pw / 2, reach = half + RAD * 0.9, rings = w.rings, nr = rings.length;
    var sticky = w.pow.sticky > 0 && w.phase === 'play';
    w.comboMax = 0;
    for (var i = 0; i < w.n; i++) {
      if (w.stuck[i]) { w.x[i] = clamp(w.px + w.soff[i], L + RAD, R - RAD); w.y[i] = PY - RAD; continue; }
      var gone = false;
      for (var s = 0; s < sub; s++) {
        var px = w.x[i], py = w.y[i];
        var x = (w.x[i] = px + w.dx[i] * d), y = (w.y[i] = py + w.dy[i] * d);
        // walls
        if (x < L + RAD) { w.x[i] = L + RAD; w.dx[i] = M.abs(w.dx[i]); tidy(w, i); }
        else if (x > R - RAD) { w.x[i] = R - RAD; w.dx[i] = -M.abs(w.dx[i]); tidy(w, i); }
        if (y < TOP + RAD) { w.y[i] = TOP + RAD; w.dy[i] = M.abs(w.dy[i]); tidy(w, i); }
        // bricks
        if (w.y[i] - RAD < w.oy + ROWS * CH) hitBricks(w, i, fire, px, py);
        x = w.x[i]; y = w.y[i];
        // ×2 rings: a ball flying into one gets a twin
        for (var j = 0; j < nr; j++) {
          var g = rings[j], ex = x - g.x, ey = y - g.y, inside = ex * ex + ey * ey < RING_R * RING_R;
          if (inside && w.inRing[i] !== g.id) {
            w.inRing[i] = g.id;
            if (g.life < 0) { g.life = RING_LIFE; emit(w, 'ringOn').x = g.x; }
            var cpy = copyBall(w, i, (w.n & 1) ? 0.45 : -0.45);
            if (cpy >= 0) { var re = emit(w, 'ring', 6); if (re) { re.x = x; re.y = y; } }
          } else if (!inside && w.inRing[i] === g.id) w.inRing[i] = -1;
        }
        // the paddle
        if (w.dy[i] > 0 && y + RAD >= PY && y - RAD <= PY + PH && x >= w.px - reach && x <= w.px + reach) {
          w.combo[i] = 0;
          w.paddleHits++;
          var u = clamp((x - w.px) / half, -1, 1);
          if (sticky) {
            w.stuck[i] = 1; w.stuckN++; w.soff[i] = clamp(x - w.px, -half, half); w.y[i] = PY - RAD; w.stickT = 0;
            emit(w, 'stick', 4);
            break;
          }
          var a = u * 1.05;
          w.dx[i] = M.sin(a); w.dy[i] = -M.cos(a); w.y[i] = PY - RAD;
          tidy(w, i);
          var pe = emit(w, 'pad', 6);
          if (pe) { pe.x = x; pe.u = u; }
          continue;
        }
        // the bubble floor
        if (y + RAD >= FLOOR && w.dy[i] > 0 && floorOn(w)) {
          w.y[i] = FLOOR - RAD; w.dy[i] = -M.abs(w.dy[i]);
          turn(w, i, (rnd(w) - 0.5) * 0.3);
          var fe = emit(w, 'floor', 4);
          if (fe) fe.x = x;
          if (!w.floorPerm && w.pow.shield <= 0 && w.phase === 'play' && w.floorHits > 0 && --w.floorHits === 0) emit(w, 'floorPop');
          continue;
        }
        if (y - RAD > LOST) { gone = true; break; }
      }
      if (gone) {
        var le = emit(w, 'lost', 6);
        if (le) le.x = w.x[i];
        removeBall(w, i);
        i--;
        continue;
      }
      if (w.combo[i] > w.comboMax) w.comboMax = w.combo[i];
    }
  }
  function moveCaps(w, dt) {
    var slow = w.pow.slow > 0 ? 0.6 : 1, half = w.pw / 2;
    for (var i = w.caps.length - 1; i >= 0; i--) {
      var c = w.caps[i];
      c.t += dt; c.y += CAP_FALL * slow * dt;
      if (w.magnet > 0 && c.y > 360) c.x += (w.px - c.x) * M.min(1, w.magnet * 2.5 * dt);
      if (w.phase !== 'play') { if (c.y > LOST) w.caps.splice(i, 1); continue; }
      if (c.y + 16 >= PY && c.y - 16 <= PY + PH && M.abs(c.x - w.px) <= half + 30) { w.caps.splice(i, 1); power(w, c.kind, c.x, 'paddle'); continue; }
      // On a never-popping bubble floor the bubble catches the capsule for you.
      if (w.floorPerm && c.y + 16 >= FLOOR) { w.caps.splice(i, 1); power(w, c.kind, c.x, 'floor'); continue; }
      if (c.y > LOST) { w.caps.splice(i, 1); var e = emit(w, 'capMiss'); e.kind = c.kind; e.x = c.x; }
    }
  }
  function power(w, kind, x, how) {
    w.caught++;
    var n0 = w.n, i;
    if ((kind === 'x3' || kind === 'plus') && !w.launched) launch(w, false);
    if (kind === 'x3') {
      for (i = 0; i < n0; i++) { copyBall(w, i, 0.42); copyBall(w, i, -0.42); }
    } else if (kind === 'plus') {
      for (i = 0; i < 10; i++) {
        var a = -0.95 + i * 0.211, j = addBall(w, clamp(w.px + (i - 4.5) * 5, L + RAD, R - RAD), PY - RAD - 2, M.sin(a), -M.cos(a));
        if (j >= 0) tidy(w, j);
      }
    } else w.pow[kind] = POW[kind];
    var e = emit(w, 'power');
    e.kind = kind; e.x = x; e.added = w.n - n0; e.how = how;
  }
  function loseLife(w) {
    w.lives--;
    w.pow.fire = w.pow.slow = w.pow.sticky = 0;
    emit(w, 'life').lives = w.lives;
    if (w.lives <= 0) { w.phase = 'over'; w.pt = 0; emit(w, 'over').reason = 'balls'; return; }
    serveBall(w);
    emit(w, 'serve');
  }

  /* -------------------------------------------------------------- endless */
  function descend(w, dt) {
    var low = lowRow(w);
    if (w.left === 0 && !w.wiped) { w.wiped = true; w.score += 1000; emit(w, 'wipe'); }
    if (w.left > 0) w.wiped = false;
    // A thin wall rolls in fast, so even a huge storm always has something to smash.
    var rush = low < 1 ? 40 : low < 3 ? 12 : low < 4 ? 4 : 1;
    w.scroll += w.descent * rush * (1 + w.t * w.t / 12000) * (w.pow.slow > 0 ? 0.5 : 1) * dt;
    while (w.scroll >= CH) { w.scroll -= CH; shift(w); emit(w, 'row'); }
    w.oy = GY - CH + w.scroll;
    placeRings(w);
    low = lowRow(w);
    if (low >= 0 && w.oy + (low + 1) * CH >= DANGER) { w.phase = 'over'; w.pt = 0; emit(w, 'over').reason = 'line'; }
  }
  function lowRow(w) {
    for (var k = N - 1; k >= 0; k--) if (w.type[k]) return M.floor(k / COLS);
    return -1;
  }
  // Moves every row down one and makes a fresh row 0 (still hidden behind the top wall).
  function shift(w) {
    for (var k = N - 1; k >= COLS; k--) {
      var f = k - COLS;
      w.type[k] = w.type[f]; w.hp[k] = w.hp[f]; w.max[k] = w.max[f]; w.col[k] = w.col[f]; w.gem[k] = w.gem[f]; w.hitAt[k] = w.hitAt[f];
    }
    for (var c = 0; c < COLS; c++) { w.type[c] = EMPTY; w.hp[c] = 0; w.hitAt[c] = -9; }
    for (var j = w.rings.length - 1; j >= 0; j--) if (++w.rings[j].r >= ROWS - 1) w.rings.splice(j, 1);
    var n = 0;
    for (var kk = 0; kk < N; kk++) if (w.type[kk] && w.type[kk] !== STEEL) n++;
    w.left = n;
    makeRow(w);
  }
  function makeRow(w) {
    var lvl = w.rowsMade++, c1 = M.floor(rnd(w) * 9), c2 = (c1 + 2 + M.floor(rnd(w) * 6)) % 9;
    var style = M.floor(rnd(w) * 4), hole = 0.1 + rnd(w) * 0.12;
    var tough = M.min(0.45, 0.02 * M.max(0, lvl - 3)), hard = lvl > 14 ? 0.35 : 0;
    var ring = lvl > 4 && lvl % 8 === 5 && w.n < 40 ? 2 + M.floor(rnd(w) * 16) : -1;
    for (var c = 0; c < COLS; c++) {
      if (c === ring) { addRing(w, c, 0); continue; }
      if (rnd(w) < hole || (style === 1 && c % 5 === 2)) continue;
      var col = style === 2 ? (c < COLS / 2 ? c1 : c2) : style === 3 ? (c % 2 ? c1 : c2) : ((c >> 1) % 2 ? c1 : c2);
      var p = rnd(w);
      if (p < 0.035) put(w, c, TNT, 1, 0, 0);
      else if (p < 0.085) put(w, c, GEM, 1, 13, rnd(w) < 0.3 ? 1 : 0);
      else if (p < 0.085 + tough) put(w, c, TOUGH, rnd(w) < hard ? 3 : 2, col, 0);
      else put(w, c, JELLY, 1, col, 0);
    }
  }
})(typeof window !== 'undefined' ? window : this);
