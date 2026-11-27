/* Cloud Hop (نطّة السحاب): the pure engine. No DOM, no Kit, no timers, no Math.random.
 *
 * Marshy, a squishy marshmallow, bounces by itself every time it lands on top of a
 * platform; the child only steers sideways (keys, or the mouse's x). Leaving one side of
 * the screen wraps to the other. The camera only moves up. Falling below the bottom of
 * the view uses a rescue bubble (unlimited in level 1); with none left the try ends.
 * Each level ends at the cloud castle; the endless mode keeps going and gets harder.
 *
 * World units are logical pixels. x runs 0..1280 (wrapping), y runs UP from the start
 * cloud's top (y = 0). Marshy's (x, y) is the middle of its feet. 30 px make a metre.
 * The UI layer (game.js) owns the save object and passes the difficulty (Kit.dda) in.
 */
(function (root) {
  'use strict';
  var CH = {}, M = Math;
  CH.W = 1280;            // world width (wraps)
  CH.VIEW = 720;          // view height
  CH.PX = 30;             // pixels per metre
  CH.G = 1600;            // gravity, px/s²
  CH.BOUNCE = 920;        // a normal boing (about 264 px high)
  CH.TRAMP = 1450;        // trampoline
  CH.JELLY = 1800;        // jelly spring
  CH.STOMP = 1250;        // landing on a pigeon's head
  CH.VX = 540;            // top sideways speed
  CH.ACC = 2600;          // sideways acceleration while steering
  CH.DRAG = 1700;         // sideways slow-down without steering
  CH.VFALL = 1100;        // top falling speed
  CH.HW = 26;             // Marshy's half width
  CH.BH = 64;             // Marshy's body height
  CH.SQUAT = 0.6;         // seconds of squish on the start cloud before the first boing
  CH.RESCUE = 1.3;        // seconds in the rescue bubble
  CH.ARRIVE = 1.9;        // seconds of celebration on the castle
  CH.FELL = 1.1;          // seconds of falling before a lost try ends
  CH.REGROW = 4.5;        // seconds before a crumbled cookie cloud grows back
  CH.CAM_UP = 400;        // Marshy's middle stays at most this far above the bottom of the view
  CH.CAM0 = -110;         // the camera's first bottom edge (the start cloud sits 110 px up)
  CH.POWERS = { balloon: { t: 2.2, vy: 520 }, hat: { t: 3, vy: 820 }, rocket: { t: 2.4, vy: 1350 } };
  CH.STAR_BONUS = 5;      // candies per star on a won level
  CH.LEVELS = 12;

  /* --------------------------------------------------------------- data */
  CH.WORLDS = [
    { name: 'سماء الصباح' },
    { name: 'غروب الحلوى' },
    { name: 'ليل الفضاء' },
    { name: 'مجرّة الحلوى' }
  ];
  // Characters: candies buy them; each has its own art and bounce sound.
  CH.CHARS = [
    { id: 'marshy', name: 'مارشي', cost: 0 },
    { id: 'jelly', name: 'جيلي', cost: 45 },
    { id: 'donut', name: 'دوني', cost: 100 },
    { id: 'duck', name: 'بطبوط', cost: 170 },
    { id: 'pickle', name: 'خيارو', cost: 260 },
    { id: 'fatira', name: 'فطيرو', cost: 380 },
    { id: 'boba', name: 'بوبو', cost: 540 },
    { id: 'gold', name: 'مارشي الذهبي', cost: 800 }
  ];
  // One row per level: goal (m), bubbles (-1 = unlimited), row gap px [min, max], platform
  // width px [min, max], extra platforms per row, shares of moving / cookie / thunder
  // clouds, pigeons and UFOs per row, power-ups (cycled), metres between power-ups,
  // between trampolines and between jelly springs (0 = none), candies per row.
  var POW = { b: 'balloon', h: 'hat', r: 'rocket' };
  var T = [
    // goal, bubbles, gap, width, extra, move, cookie, thunder, pigeon, ufo, power-ups,
    // powerAt, powerEvery, trampAt, trampEvery, jellyAt, candy, ring
    [70, -1, [72, 100], [215, 255], 0.8, 0, 0, 0, 0, 0, 'b', 30, 99, 14, 30, 0, 0.75, 0],
    [90, 3, [80, 112], [195, 235], 0.6, 0.22, 0, 0, 0, 0, 'b', 40, 99, 18, 34, 0, 0.7, 0],
    [110, 3, [88, 124], [180, 220], 0.5, 0.22, 0.2, 0, 0, 0, 'bh', 30, 45, 20, 36, 0, 0.7, 0],
    [130, 3, [94, 134], [165, 205], 0.45, 0.25, 0.22, 0, 0, 0, 'hb', 35, 50, 22, 40, 60, 0.7, 0],
    [160, 2, [100, 142], [155, 195], 0.45, 0.25, 0.22, 0, 0.13, 0, 'bh', 35, 50, 22, 40, 70, 0.7, 0],
    [180, 2, [104, 150], [150, 188], 0.4, 0.28, 0.25, 0, 0.16, 0, 'hb', 40, 50, 25, 42, 80, 0.72, 0.06],
    [200, 2, [108, 156], [145, 182], 0.45, 0.28, 0.25, 0.35, 0.16, 0, 'bh', 40, 55, 25, 45, 80, 0.72, 0.07],
    [230, 2, [112, 162], [140, 176], 0.45, 0.32, 0.28, 0.4, 0.2, 0, 'hb', 45, 55, 28, 45, 90, 0.72, 0.08],
    [260, 2, [116, 168], [135, 170], 0.4, 0.32, 0.28, 0.4, 0.12, 0.1, 'rh', 45, 60, 30, 48, 90, 0.72, 0.08],
    [300, 2, [120, 174], [130, 165], 0.4, 0.36, 0.3, 0.42, 0.14, 0.12, 'hrb', 45, 60, 30, 50, 100, 0.72, 0.09],
    [340, 2, [124, 180], [125, 160], 0.4, 0.38, 0.32, 0.45, 0.15, 0.14, 'rh', 45, 65, 32, 52, 110, 0.72, 0.1],
    [400, 2, [128, 186], [120, 155], 0.4, 0.4, 0.34, 0.45, 0.17, 0.16, 'hrb', 45, 65, 32, 55, 120, 0.72, 0.1]
  ].map(function (r) {
    var o = {};
    ['goal', 'bubbles', 'gap', 'wid', 'extra', 'move', 'cookie', 'thunder', 'pigeon', 'ufo', 'powers', 'powerAt', 'powerEvery', 'trampAt', 'trampEvery', 'jellyAt', 'candy', 'ring'].forEach(function (k, i) { o[k] = r[i]; });
    o.powers = o.powers.split('').map(function (c) { return POW[c]; });
    return o;
  });
  CH.worldOf = function (n) { return n >= 1 && n <= 12 ? M.floor((n - 1) / 4) : 0; };
  CH.goal = function (n) { return T[n - 1] ? T[n - 1].goal : 0; };
  CH.bubbles = function (n, diff) {
    var b = T[n - 1] ? T[n - 1].bubbles : 1;
    // A PC that keeps struggling gets one more bubble in the levels that count them.
    return b > 0 && n > 1 && diff < 0.15 ? b + 1 : b;
  };
  // The endless sky by height: morning, sunset, space, then a candy galaxy.
  CH.themeAt = function (metres) { return metres < 150 ? 0 : metres < 400 ? 1 : metres < 800 ? 2 : 3; };

  /* ------------------------------------------------------------ helpers */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function num(v, d) { return typeof v === 'number' && v === v ? v : d; }
  function wrapX(x) { x %= CH.W; return x < 0 ? x + CH.W : x; }
  // The shortest signed horizontal distance on the wrapping world.
  function wrapDx(dx) { dx %= CH.W; if (dx > CH.W / 2) dx -= CH.W; else if (dx < -CH.W / 2) dx += CH.W; return dx; }
  CH.wrapX = wrapX; CH.wrapDx = wrapDx; CH.clamp = clamp;
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
  CH.rng = rng;
  // Seconds in the air after a normal boing until the feet come back down to height dy.
  function airTime(dy, v) { v = v || CH.BOUNCE; var d = v * v - 2 * CH.G * dy; return d < 0 ? 0 : (v + M.sqrt(d)) / CH.G; }
  CH.airTime = airTime;

  /* -------------------------------------------------------------- saves */
  CH.newSave = function () {
    var stars = [], chars = [];
    for (var i = 0; i < CH.LEVELS; i++) stars.push(0);
    for (var c = 0; c < CH.CHARS.length; c++) chars.push(c === 0);
    return { v: 1, played: false, coach: false, unlocked: 1, stars: stars, candies: 0, chars: chars, char: 0, best: 0, bestAt: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
  };
  function int(v, lo, hi, d) { return typeof v === 'number' && v === v && v >= lo && v <= hi ? M.floor(v) : d; }
  // Anything odd in a stored save falls back to the fresh value for that field.
  CH.loadSave = function (raw) {
    var s = CH.newSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
    s.played = raw.played === true;
    s.coach = raw.coach === true;
    s.candies = int(raw.candies, 0, 1e9, 0);
    s.best = int(raw.best, 0, 1e7, 0);
    var top = 0;
    for (var i = 0; i < CH.LEVELS; i++) {
      s.stars[i] = Array.isArray(raw.stars) ? int(raw.stars[i], 0, 3, 0) : 0;
      s.bestAt[i] = Array.isArray(raw.bestAt) ? int(raw.bestAt[i], 0, 1e6, 0) : 0;
      if (s.stars[i] > 0) top = i + 1;
    }
    // A level is open when it is the first one or the one before it was won.
    s.unlocked = M.max(int(raw.unlocked, 1, CH.LEVELS, 1), M.min(CH.LEVELS, top + 1));
    if (Array.isArray(raw.chars)) for (var c = 1; c < s.chars.length; c++) s.chars[c] = raw.chars[c] === true;
    s.char = int(raw.char, 0, CH.CHARS.length - 1, 0);
    if (!s.chars[s.char]) s.char = 0;
    if (s.stars.some(function (n) { return n > 0; }) || s.best > 0) s.played = true;
    return s;
  };
  CH.totalStars = function (s) { var n = 0; for (var i = 0; i < s.stars.length; i++) n += s.stars[i]; return n; };
  // The level the Play button continues with: the first open level not yet won (0 = endless).
  CH.nextLevel = function (s) {
    for (var i = 0; i < CH.LEVELS; i++) if (s.stars[i] === 0) return M.min(i + 1, s.unlocked);
    return 0;
  };
  CH.endlessOpen = function (s) { return s.stars[3] > 0 || s.best > 0; };
  // Wear an owned character, or buy it with candies. Returns true when it is now worn.
  CH.buy = function (s, i) {
    var c = CH.CHARS[i];
    if (!c) return false;
    if (!s.chars[i]) {
      if (s.candies < c.cost) return false;
      s.candies -= c.cost;
      s.chars[i] = true;
    }
    s.char = i;
    return true;
  };
  CH.affordable = function (s) {
    for (var i = 0; i < CH.CHARS.length; i++) if (!s.chars[i] && s.candies >= CH.CHARS[i].cost) return true;
    return false;
  };
  // Stars for a won level: one for the castle, one for no fall, one for most of the candies.
  CH.starsFor = function (w) {
    if (!w.won) return 0;
    return 1 + (w.falls === 0 ? 1 : 0) + (w.total && w.picked >= M.ceil(w.total * 0.6) ? 1 : 0);
  };

  /* -------------------------------------------------------- level shape */
  // The rules of a level row at a given height; the endless mode climbs through the table.
  function params(w, metres) {
    if (w.level) return T[w.level - 1];
    var f = clamp(2 + metres / 45, 2, 12), i = M.floor(f) - 1, k = f - M.floor(f);
    var a = T[i], b = T[M.min(11, i + 1)], o = {};
    for (var key in a) o[key] = typeof a[key] === 'number' ? lerp(a[key], b[key], k) : a[key];
    o.gap = [lerp(a.gap[0], b.gap[0], k), lerp(a.gap[1], b.gap[1], k)];
    o.wid = [lerp(a.wid[0], b.wid[0], k), lerp(a.wid[1], b.wid[1], k)];
    // Above the table's top a little more keeps coming, up to a ceiling.
    var over = clamp((metres - 450) / 900, 0, 1);
    o.gap = [o.gap[0] + 10 * over, o.gap[1] + 14 * over];
    o.wid = [o.wid[0] - 10 * over, o.wid[1] - 10 * over];
    o.pigeon += 0.08 * over; o.ufo += 0.08 * over; o.thunder += 0.1 * over;
    o.powers = metres < 300 ? ['balloon', 'hat'] : ['hat', 'rocket', 'balloon'];
    o.ufo = metres < 400 ? 0 : o.ufo;
    o.ring = 0.08;
    return o;
  }
  var nextId = 1;
  function plat(w, kind, x, y, wd) {
    var p = { id: nextId++, kind: kind, x: x, x0: x, y: y, w: wd, amp: 0, sp: 0, ph: 0, broken: false, hitT: -9, face: 0, off: 0, rescue: false };
    w.plats.push(p);
    return p;
  }
  function item(w, kind, x, y) { var it = { kind: kind, x: wrapX(x), y: y, got: false, ph: (x * 0.013 + y * 0.007) % 6.283 }; w.items.push(it); return it; }
  // Keep a platform of width wd fully on screen.
  function fit(x, wd) { return clamp(wrapX(x), wd / 2 + 8, CH.W - wd / 2 - 8); }
  CH.platX = function (p, t) { return p.amp ? p.x0 + p.amp * M.sin(p.ph + p.sp * t) : p.x; };
  // Thunder clouds crackle for 1.1 s of every 3 s (the last 0.45 s before is a warning).
  CH.THUNDER = 3;
  CH.thunderPhase = function (p, t) { return ((t + p.off) % CH.THUNDER + CH.THUNDER) % CH.THUNDER; };
  CH.charged = function (p, t) { return p.kind === 'thunder' && CH.thunderPhase(p, t) > CH.THUNDER - 1.1; };

  // One row of the course: a path platform always within reach of the one before, and
  // maybe an extra platform, candies, a power-up, a pigeon or a UFO.
  function genRow(w, gapOverride) {
    var r = w.rng, metres = w.genY / CH.PX, P = params(w, metres);
    var gap = gapOverride || lerp(P.gap[0], P.gap[1], r()) * w.gapScale;
    var y = w.genY + gap, m = y / CH.PX;
    var wd = M.round(lerp(P.wid[0], P.wid[1], r()) * w.widScale);
    var hazard = w.hazard;
    var kind = 'cloud', springs = !w.castleY || m < w.castleY / CH.PX - 25;
    if (P.trampAt && m >= w.trampNext && springs) { kind = 'tramp'; w.trampNext = m + P.trampEvery; }
    else if (P.jellyAt && m >= w.jellyNext && springs) { kind = 'jelly'; w.jellyNext = m + P.trampEvery * 1.5; }
    else if (m > 6 && r() < P.move * hazard) kind = 'move';
    else if (m > 6 && r() < P.cookie * hazard && w.lastKind !== 'cookie') kind = 'cookie';
    if (kind === 'tramp') wd = M.max(120, M.round(wd * 0.75));
    if (kind === 'jelly') wd = M.max(130, M.round(wd * 0.8));
    // How far sideways the next platform may be: what a boing can cover, with room to spare.
    var reach = CH.VX * M.max(0.2, airTime(gap) - 0.16) * (w.level === 1 ? 0.5 : 0.72);
    var step = lerp(M.min(70, reach * 0.3), reach, r());
    var dir = r() < 0.5 ? -1 : 1;
    var tx;
    if (w.level >= 1 && w.level <= 4) {
      // Early levels stay within the screen edges so mouse/new players never face cross-seam jumps.
      var lo = wd / 2 + 8, hi = CH.W - wd / 2 - 8;
      if (w.genX + dir * step < lo || w.genX + dir * step > hi) dir = -dir;
      tx = clamp(w.genX + dir * step, lo, hi);
    } else {
      tx = fit(w.genX + dir * step, wd);
    }
    var p = plat(w, kind, tx, y, wd);
    if (kind === 'move') {
      p.amp = M.min(lerp(60, 150, r()) * (0.7 + 0.5 * hazard), (CH.W - wd) / 2 - 12);
      p.x0 = clamp(p.x, p.amp + wd / 2 + 6, CH.W - p.amp - wd / 2 - 6);
      p.sp = lerp(0.7, 1.3, r()) * (0.75 + 0.5 * hazard);
      p.ph = r() * 6.283;
      p.x = CH.platX(p, 0);
    }
    p.face = r() < 0.45 ? 1 + M.floor(r() * 3) : 0;
    var px = p.amp ? p.x0 : p.x;
    // Candies along the way up from the last platform.
    if (r() < P.candy) {
      var n = 1 + M.floor(r() * 3), ddx = wrapDx(px - w.genX);
      for (var c = 0; c < n; c++) {
        var f = n === 1 ? 0.55 : 0.3 + 0.5 * c / (n - 1);
        item(w, 'candy', w.genX + ddx * f, w.genY + gap * f + 70 + 60 * M.sin(f * M.PI));
      }
    }
    // A ring of candies off to one side now and then.
    if (P.ring && r() < P.ring) {
      var rx = fit(px + (r() < 0.5 ? -1 : 1) * lerp(160, 260, r()), 140), ry = y + gap * 0.5 + 40;
      for (var k = 0; k < 8; k++) item(w, 'candy', rx + 58 * M.cos(k * M.PI / 4), ry + 58 * M.sin(k * M.PI / 4));
    }
    // Power-ups sit above the path.
    if (P.powerAt && m >= w.powerNext && kind !== 'tramp' && kind !== 'jelly' && (!w.castleY || m < w.castleY / CH.PX - 15)) {
      item(w, P.powers[w.powerI % P.powers.length], px, y + 95);
      w.powerI++; w.powerNext = m + P.powerEvery;
    }
    // The extra platform of the row before, now that this row is known: off the path,
    // but never a dead end (this row's platform can be reached from it).
    extra(w, p, px);
    if (r() < P.extra) w.pending = { y: w.genY + gap, gap: gap, px: px, wd: wd, P: P, m: m };
    else w.pending = null;
    // A grumpy pigeon flies across the gap.
    var calm = w.castleY ? w.castleY - y < 10 * CH.PX : false;
    if (!calm && m > 15 && r() < P.pigeon * (0.6 + 0.8 * hazard)) {
      w.foes.push({ kind: 'pigeon', x: r() * CH.W, y: y + gap * 0.5 + 34, vx: (r() < 0.5 ? -1 : 1) * lerp(85, 150, r()) * (0.75 + 0.5 * hazard), dead: false, dt: 0, vy: 0, ph: r() * 6, seen: false });
    } else if (!calm && m > 20 && P.ufo && r() < P.ufo * (0.6 + 0.8 * hazard)) {
      var ua = lerp(140, 260, r());
      w.foes.push({ kind: 'ufo', x: CH.W / 2, x0: clamp(r() * CH.W, ua + 60, CH.W - ua - 60), amp: ua, sp: lerp(0.5, 0.9, r()), ph: r() * 6.283, y: y + gap * 0.5 + 90, dead: false, dt: 0, vy: 0, seen: false, off: r() * 3 });
    }
    w.genY = y; w.genX = px; w.lastKind = kind;
    return p;
  }
  function extra(w, next, nx) {
    var e = w.pending;
    if (!e) return;
    w.pending = null;
    var r = w.rng, P = e.P, ek = 'cloud', ew = M.round(lerp(P.wid[0], P.wid[1], r()) * w.widScale * 0.9);
    if (e.m > 8 && r() < P.thunder * w.hazard) ek = 'thunder';
    else if (e.m > 6 && r() < P.cookie * w.hazard) ek = 'cookie';
    var ey = e.y + (r() - 0.6) * 0.4 * e.gap;
    if (next.y - ey > 225) ey = next.y - 225;
    if (w.castleY && ey > w.castleY - 80) return;
    var reach = CH.VX * M.max(0.2, airTime(next.y - ey) - 0.16) * 0.8;
    var noWrap = w.level >= 1 && w.level <= 4;
    for (var tries = 0; tries < 6; tries++) {
      var ex = fit(e.px + CH.W / 2 + (r() - 0.5) * 560, ew), dn = noWrap ? M.abs(ex - nx) : M.abs(wrapDx(ex - nx));
      if (M.abs(wrapDx(ex - e.px)) < (ew + e.wd) / 2 + 30) continue;
      if (next.kind !== 'castle' && dn - next.w / 2 > reach) continue;
      if (dn < (ew + next.w) / 2 + 20 && next.y - ey < 90) continue;
      var q = plat(w, ek, ex, ey, ew);
      q.face = ek === 'thunder' ? 1 : r() < 0.35 ? 1 + M.floor(r() * 3) : 0;
      q.off = r() * CH.THUNDER;
      return;
    }
  }

  /* ------------------------------------------------------------- worlds */
  // opts: { level: 1..12 (0 = endless), diff: 0..1 (Kit.dda level), seed }
  CH.create = function (opts) {
    opts = opts || {};
    var level = int(opts.level, 0, CH.LEVELS, 1), diff = clamp(num(opts.diff, 0.35), 0, 1);
    // Level 1 hardly listens to the difficulty: it stays easy for everyone.
    var d = level === 1 ? 0.35 + (diff - 0.35) * 0.2 : diff;
    var w = {
      level: level, diff: diff, t: 0, phase: 'squat', pt: 0, ev: [],
      rng: rng(level ? level * 7919 + 13 : (num(opts.seed, 1) >>> 0) + 1),
      gapScale: 1 + 0.22 * (d - 0.35), widScale: 1 - 0.2 * (d - 0.35), hazard: clamp(0.6 + 0.9 * d, 0.3, 1.5),
      plats: [], items: [], foes: [], cam: CH.CAM0, genY: 0, genX: CH.W / 2, lastKind: '', pending: null, seed: num(opts.seed, 1),
      trampNext: 0, jellyNext: 0, powerNext: 0, powerI: 0,
      castleY: level ? T[level - 1].goal * CH.PX : 0,
      bubbles: level ? CH.bubbles(level, diff) : 1,
      m: { x: CH.W / 2, y: 0, vx: 0, vy: 0, power: null, pt: 0, inv: 0, zap: 0, land: -9, on: null },
      maxY: 0, height: 0, mile: 0, streak: 0, lastLand: 0, mult: 1,
      candies: 0, picked: 0, total: 0, stars: 0, falls: 0, bonks: 0, stomps: 0, zaps: 0, powers: 0, hops: 0, won: false, lost: false, steered: false, steerDist: 0
    };
    var P = params(w, 0);
    w.trampNext = P.trampAt || 1e9; w.jellyNext = P.jellyAt || 1e9; w.powerNext = P.powerAt || 1e9;
    plat(w, 'ground', CH.W / 2, 0, CH.W + 240);
    if (level) {
      // The whole course up to the castle, made once.
      for (var guard = 0; guard < 400; guard++) {
        var left = w.castleY - w.genY, g = lerp(P.gap[0], P.gap[1], w.rng()) * w.gapScale;
        if (left <= P.gap[1] * w.gapScale * 0.9) break;
        if (left - g < P.gap[0] * 0.6) g = left / 2;
        genRow(w, g);
      }
      var castle = plat(w, 'castle', CH.W / 2, w.castleY, CH.W + 240);
      castle.face = 1;
      extra(w, castle, CH.W / 2);
      // A golden star off the path, more than halfway up.
      var sy = w.castleY * 0.62, sx = CH.W / 2;
      for (var s = 0; s < w.plats.length; s++) if (w.plats[s].y > sy) { sx = w.plats[s].x + CH.W / 2; sy = w.plats[s].y + 120; break; }
      item(w, 'star', fit(sx, 80), sy);
      for (var i = 0; i < w.items.length; i++) if (w.items[i].kind === 'candy') w.total++;
    } else ensure(w);
    return w;
  };
  // The endless mode makes its course a little ahead of the camera and forgets what fell
  // far below it, so its lists stay short.
  function ensure(w) {
    if (w.level) return;
    while (w.genY < w.cam + CH.VIEW + 500) genRow(w);
    var low = w.cam - 400, keep = function (o) { return o.y > low; };
    if (w.plats.length > 60) w.plats = w.plats.filter(keep);
    if (w.items.length > 80) w.items = w.items.filter(function (o) { return o.y > low && !o.got; });
    if (w.foes.length > 16) w.foes = w.foes.filter(function (o) { return o.y > low && !(o.dead && o.dt > 1.5); });
  }
  CH.restart = function (w) { return CH.create({ level: w.level, diff: w.diff, seed: w.seed }); };

  /* --------------------------------------------------------------- step */
  function emit(w, type, a, b, c) { w.ev.push({ type: type, x: w.m.x, y: w.m.y, a: a, b: b, c: c }); }
  function approach(v, to, d) { return v < to ? M.min(to, v + d) : M.max(to, v - d); }
  function overlap(m, p, t, pad) {
    var dx = wrapDx(m.x - CH.platX(p, t));
    return M.abs(dx) < p.w / 2 + CH.HW + pad;
  }
  // input: { dir: -1..1 from keys, mouseX: the pointer's x while mouse steering, else null }
  CH.step = function (w, dt, input) {
    input = input || {};
    var m = w.m, t;
    w.t += dt; w.pt += dt; t = w.t;
    for (var i = 0; i < w.plats.length; i++) {
      var p = w.plats[i];
      if (p.amp) p.x = CH.platX(p, t);
      // A crumbled cookie grows back, so a missed hop is never a dead end.
      if (p.broken && t - p.hitT > CH.REGROW) { p.broken = false; p.hitT = t; p.regrown = true; if (M.abs(p.y - m.y) < CH.VIEW) emit(w, 'regrow', p.x, p.y); }
    }
    stepFoes(w, dt);
    if (w.phase === 'over') return w;
    if (w.phase === 'rescue') { rescue(w, dt, input); return w; }
    if (w.phase === 'fell') {
      m.vy = M.max(-CH.VFALL, m.vy - CH.G * dt); m.y += m.vy * dt;
      if (w.pt >= CH.FELL) { w.phase = 'over'; w.lost = true; emit(w, 'lose'); }
      return w;
    }
    steer(w, dt, input);
    if (w.phase === 'squat') {
      if (w.pt >= CH.SQUAT) { w.phase = 'play'; w.pt = 0; m.vy = CH.BOUNCE; m.land = t; emit(w, 'bounce', 'ground', 0, 1); }
      return w;
    }
    if (w.phase === 'arrive') {
      m.vy -= CH.G * dt; m.y += m.vy * dt;
      if (m.y <= w.castleY) { m.y = w.castleY; m.vy = CH.BOUNCE * 0.42; m.land = t; emit(w, 'hop'); }
      if (w.pt >= CH.ARRIVE) { w.phase = 'over'; emit(w, 'done'); }
      return w;
    }
    // play
    if (m.inv > 0) m.inv = M.max(0, m.inv - dt);
    if (m.zap > 0) m.zap = M.max(0, m.zap - dt);
    var prevY = m.y;
    if (m.power) {
      m.pt -= dt;
      m.vy = CH.POWERS[m.power].vy;
      if (m.pt <= 0 || (w.castleY && m.y > w.castleY - 140)) {
        emit(w, 'powerEnd', m.power);
        m.power = null;
        // A flight that reaches the castle ends with a hop just over its top, to land on it.
        if (w.castleY && m.y > w.castleY - 140) m.vy = M.sqrt(2 * CH.G * M.max(0, w.castleY + 60 - m.y));
      }
    } else m.vy = M.max(-CH.VFALL, m.vy - CH.G * dt);
    m.y += m.vy * dt;
    // Bounce only when falling onto a platform's top (Marshy passes up through them).
    if (m.vy <= 0 && !m.power) {
      var best = null;
      for (var j = 0; j < w.plats.length; j++) {
        var q = w.plats[j];
        if (q.broken || prevY < q.y - 0.01 || m.y > q.y) continue;
        if (!overlap(m, q, t, w.level === 1 ? 16 : 6)) continue;
        if (!best || q.y > best.y) best = q;
      }
      if (best) land(w, best);
    }
    pickups(w);
    foes(w, dt);
    // The camera only goes up, and never past the castle (it stays in view).
    var target = m.y + CH.BH / 2 - CH.CAM_UP;
    if (w.castleY) target = M.min(target, w.castleY - 130);
    if (target > w.cam) w.cam += (target - w.cam) * M.min(1, dt * 9);
    if (w.phase !== 'play') return w;
    // Height and milestones.
    if (m.y > w.maxY) {
      w.maxY = m.y;
      w.height = M.floor(m.y / CH.PX * 10) / 10;
      var mile = M.floor(w.height / 10);
      if (mile > w.mile) { w.mile = mile; emit(w, 'mile', mile * 10); }
    }
    // Below the view: a rescue bubble, or the end of the try.
    if (m.y + CH.BH < w.cam - 20) {
      w.streak = 0; w.mult = 1;
      if (w.bubbles !== 0) {
        if (w.bubbles > 0) w.bubbles--;
        w.falls++;
        w.phase = 'rescue'; w.pt = 0; m.power = null; m.vx *= 0.3; m.vy = 0;
        startRescue(w);
        emit(w, 'fall', w.bubbles);
      } else {
        w.falls++;
        w.phase = 'fell'; w.pt = 0;
        emit(w, 'falling');
      }
    }
    ensure(w);
    return w;
  };
  function steer(w, dt, input) {
    var m = w.m, tv = 0, on = false;
    if (typeof input.mouseX === 'number' && input.mouseX === input.mouseX) {
      var mx = input.mouseX;
      if (mx < 24) {
        // Near the left edge: smoothly wrap left across the seam.
        tv = -CH.VX; on = true;
        m.vx = approach(m.vx, tv, CH.ACC * dt * (m.vx > 0 ? 1.4 : 1));
      } else if (mx > CH.W - 24) {
        // Near the right edge: smoothly wrap right across the seam.
        tv = CH.VX; on = true;
        m.vx = approach(m.vx, tv, CH.ACC * dt * (m.vx < 0 ? 1.4 : 1));
      } else {
        // Ease towards the pointer: straight across the screen, never the wrapped way round.
        var dx = mx - m.x;
        tv = clamp(dx * 7, -CH.VX, CH.VX); on = M.abs(dx) > 1.5;
        m.vx = approach(m.vx, tv, CH.ACC * dt);
        if (!on && M.abs(m.vx) < 30) m.vx = 0;
      }
    } else {
      var dir = clamp(num(input.dir, 0), -1, 1);
      if (dir) { on = true; m.vx = approach(m.vx, dir * CH.VX, CH.ACC * dt * (m.vx * dir < 0 ? 1.4 : 1)); }
      else m.vx = approach(m.vx, 0, CH.DRAG * dt);
    }
    var prevX = m.x;
    if (m.vx) m.x = wrapX(m.x + m.vx * dt);
    if (w.phase === 'play' && on) {
      w.steerDist += M.abs(wrapDx(m.x - prevX));
      if (!w.steered && w.steerDist > 20) { w.steered = true; emit(w, 'steer'); }
    }
  }
  function land(w, p) {
    var m = w.m, t = w.t;
    m.y = p.y; p.hitT = t; m.land = t; m.on = p;
    if (p.kind === 'castle') {
      m.vy = CH.BOUNCE * 0.5; m.vx = 0;
      w.won = true; w.phase = 'arrive'; w.pt = 0;
      w.stars = CH.starsFor(w);
      emit(w, 'arrive', w.stars);
      return;
    }
    if (p.kind === 'thunder' && CH.charged(p, t) && m.inv <= 0) {
      m.vy = -260; m.y = p.y - 1; m.zap = 0.55; m.inv = 0.8;
      w.streak = 0; w.mult = 1; w.zaps++;
      emit(w, 'zap', p.x, p.y);
      return;
    }
    var power = p.kind === 'tramp' ? CH.TRAMP : p.kind === 'jelly' ? CH.JELLY : CH.BOUNCE;
    m.vy = power;
    var dy = p.y - w.lastLand;
    if (dy > 8) w.streak++; else if (dy < -8) w.streak = 1; else w.streak = M.max(1, w.streak);
    w.lastLand = p.y;
    w.hops++;
    var mult = w.streak >= 12 ? 3 : w.streak >= 6 ? 2 : 1;
    if (mult > w.mult) emit(w, 'mult', mult);
    w.mult = mult;
    if (p.kind === 'cookie') { p.broken = true; emit(w, 'crumble', p.x, p.y, p.w); }
    emit(w, 'bounce', p.kind, w.streak, power / CH.BOUNCE);
  }
  function pickups(w) {
    var m = w.m, cy = m.y + CH.BH / 2;
    for (var i = 0; i < w.items.length; i++) {
      var it = w.items[i];
      if (it.got) continue;
      var dy = it.y - cy;
      if (dy > 80 || dy < -80) continue;
      var dx = wrapDx(it.x - m.x), r = it.kind === 'candy' ? 46 : 56;
      if (dx * dx + dy * dy > r * r) continue;
      it.got = true;
      if (it.kind === 'candy') { w.picked++; w.candies += w.mult; emit(w, 'candy', w.mult, it.x, it.y); }
      else if (it.kind === 'star') { w.candies += 10; emit(w, 'star', 10, it.x, it.y); }
      else {
        m.power = it.kind; m.pt = CH.POWERS[it.kind].t; m.vy = CH.POWERS[it.kind].vy; w.powers++;
        emit(w, 'power', it.kind, it.x, it.y);
      }
    }
  }
  function stepFoes(w, dt) {
    for (var i = 0; i < w.foes.length; i++) {
      var f = w.foes[i];
      if (f.dead) { f.dt += dt; f.vy -= CH.G * 0.8 * dt; f.y += f.vy * dt; f.x = wrapX(f.x + f.vx * dt); continue; }
      // After bumping into Marshy a foe leaves in a hurry ("oops!"), so it can't do it again.
      if (f.flee) { f.dt += dt; f.y += (f.kind === 'ufo' ? 380 : 90) * dt; if (f.kind === 'ufo') f.x0 += f.vx * dt; }
      if (f.kind === 'pigeon') f.x = wrapX(f.x + f.vx * dt);
      else f.x = f.x0 + f.amp * M.sin(f.ph + f.sp * w.t);
    }
  }
  CH.beamOn = function (f, t) { return ((t + f.off) % 3.4) < 2.2; };
  function foes(w, dt) {
    var m = w.m, t = w.t;
    for (var i = 0; i < w.foes.length; i++) {
      var f = w.foes[i];
      if (f.dead || f.flee) continue;
      var dy = f.y - m.y;
      if (dy < -120 || dy > 320) continue;
      if (!f.seen && f.y < w.cam + CH.VIEW - 40) { f.seen = true; emit(w, 'foe', f.kind); }
      var dx = wrapDx(f.x - m.x);
      if (f.kind === 'ufo' && CH.beamOn(f, t) && !m.power) {
        // The beam tugs Marshy sideways towards the saucer.
        var depth = f.y - (m.y + CH.BH / 2);
        if (depth > 20 && depth < 280 && M.abs(dx) < 46 + depth * 0.36) m.vx = clamp(m.vx + (dx > 0 ? 1 : -1) * 700 * dt, -CH.VX, CH.VX);
      }
      var hw = f.kind === 'ufo' ? 58 : 36, top = f.kind === 'ufo' ? 18 : 22, bot = f.kind === 'ufo' ? 20 : 24;
      if (M.abs(dx) > hw + CH.HW - 6 || m.y > f.y + top || m.y + CH.BH < f.y - bot) continue;
      if (m.power) { knock(w, f, dx); w.stomps++; w.candies += 3 * w.mult; emit(w, 'stomp', f.kind, 3 * w.mult, 1); continue; }
      if (m.vy < 0 && m.y > f.y - 12) {
        // On its head: bonk, a super bounce and a bonus.
        knock(w, f, dx);
        m.y = f.y + top; m.vy = CH.STOMP; m.land = t;
        w.stomps++; w.streak++; w.candies += 3 * w.mult;
        emit(w, 'stomp', f.kind, 3 * w.mult, 0);
      } else if (m.inv <= 0) {
        // From the side or below: knocked down a bit, never out.
        m.vy = M.min(m.vy, -340); m.vx = (dx > 0 ? -1 : 1) * 260; m.inv = 1.1;
        w.bonks++; w.streak = 0; w.mult = 1;
        f.flee = true; f.dt = 0; f.vx = (dx > 0 ? 1 : -1) * (f.kind === 'ufo' ? 200 : 420);
        emit(w, 'bonk', f.kind);
      }
    }
  }
  function knock(w, f, dx) { f.dead = true; f.dt = 0; f.vy = 420; f.vx = (dx > 0 ? 1 : -1) * 260; }
  function sure(p) { return !p.broken && p.kind !== 'thunder' && p.kind !== 'cookie' && p.kind !== 'ground'; }
  // The bubble floats Marshy straight up (only steering moves it sideways) to just above a
  // new cloud, at a height from which the nearest sure platform above is in reach.
  function startRescue(w) {
    var m = w.m, best = null, bd = 1e9;
    for (var i = 0; i < w.plats.length; i++) {
      var p = w.plats[i];
      if (!sure(p) || p.y < w.cam + 170 || p.y > w.cam + 640) continue;
      var d = M.abs(wrapDx(CH.platX(p, w.t) - m.x)) - p.w / 2;
      if (d < bd) { bd = d; best = p; }
    }
    w.ry = best ? clamp(best.y - 110, w.cam + 120, w.cam + 470) : w.cam + 250;
    w.ry0 = w.cam - CH.BH - 40;
    m.y = w.ry0;
  }
  function rescue(w, dt, input) {
    var m = w.m, k = M.min(1, w.pt / CH.RESCUE), e = 1 - (1 - k) * (1 - k) * (1 - k);
    steer(w, dt, input);
    m.y = w.ry0 + (w.ry + 90 - w.ry0) * e;
    if (k >= 1) {
      // Pop! A wide cloud right under Marshy, unless a sure one is there already.
      var ok = false;
      for (var i = 0; i < w.plats.length; i++) {
        var p = w.plats[i];
        if (!sure(p) || p.y < m.y - 170 || p.y > m.y - 20) continue;
        if (overlap(m, p, w.t, -10)) { ok = true; break; }
      }
      if (!ok) { var c = plat(w, 'cloud', fit(m.x, 300), w.ry, 300); c.rescue = true; c.face = 1; c.hitT = w.t; }
      w.phase = 'play'; w.pt = 0; m.vy = 300; m.inv = 1.5;
      w.lastLand = w.ry;
      emit(w, 'rescued');
    }
  }

  root.CH = CH;
})(typeof window !== 'undefined' ? window : this);
