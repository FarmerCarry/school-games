/* Frog Pinball (بينبول الضفدع): the pure engine. No DOM, no Kit, no timers, no Math.random, no Date.
 *
 * A portrait pinball table (560 x 720 table pixels, y grows down the slope) in a swamp party:
 * two flippers, slingshots, outlanes with kickbacks, three lily-pad pop bumpers, three
 * rubber-duck drop targets (all three: multiplier +1 and lit kickbacks), an orbit loop
 * over the top with a dragonfly spinner (a lily-pad spring at the top of each side lane
 * sends a ball that gets there over the frog), a plunger lane on the right, and a giant frog
 * head at the top: a ball in its mouth is gulped, held, and burped back out; three feeds
 * start a multiball (ball rain). On the first levels a lily bud between the flippers springs
 * balls back up, and on level 1 a gate drops balls coming over the top into the bumpers.
 * Each level is a game of three balls with one mission.
 *
 * Physics: a fixed 60 Hz step split into 8 substeps (480 Hz). Walls are line segments
 * (curves are short segments) with closest-point contacts; bumpers, posts and eyes are
 * circles; flippers are rotating tapered capsules whose surface velocity goes into the
 * contact impulse. At the top speed a ball moves 3.3 px per substep, far less than its
 * radius, so it never tunnels through a wall.
 *
 * The UI layer (game.js) owns the save object and reads Kit.dda; it passes the difficulty in
 * (gravity, ball-save seconds, bumper kick) and reads the events in w.ev after each step.
 */
(function (root) {
  'use strict';
  var FP = {};
  var M = Math;
  var TW = 560, TH = 720, R = 11, SUB = 8;
  FP.TW = TW; FP.TH = TH; FP.R = R; FP.SUB = SUB;
  FP.MAXV = 1600;          // speed cap, px/s
  FP.HOLD = 1.0;           // seconds the frog holds a ball
  FP.AUTO = 3.5;           // a ball waiting on the plunger launches by itself after this
  FP.BOOST = 1060;         // the lily-pad spring in each orbit lane sends a ball over the top
  FP.TAP = 1340;           // a quick tap of the plunger: always reaches the table
  FP.MINP = 1020;          // launch speed for the shortest pull, and the longest
  FP.MAXP = 1580;
  FP.BALLS = 3;

  /* -------------------------------------------------------------- table */
  // Table coordinates. The playfield is x 20..502, the plunger lane 502..540.
  var T = FP.TABLE = {
    plunger: { x: 528, y: 692, pull: 34 },
    flipLen: 84, flipR0: 13, flipR1: 6.5, rest: 0.52, up: -0.45, upSpeed: 24, downSpeed: 14,
    flippers: [{ side: 1, x: 160, y: 612 }, { side: -1, x: 362, y: 612 }],
    bumpers: [[112, 258], [186, 270], [146, 334]], bumperR: 24,
    ducks: [[322, 268], [353, 282], [384, 296]], duckDir: [0.915, 0.404], duckHalf: 13, duckR: 5,
    head: { x: 261, y: 148, rx: 96, ry: 66 }, eyes: [[215, 90], [307, 90]], eyeR: 26, peak: [261, 56],
    mouth: [261, 226], release: [261, 246],
    post: [261, 676, 8],
    laneY: 262, spinY: 232, lanes: [[20, 64], [458, 540]],
    kick: [[20, 58], [464, 502]], kickY: 648,
    slings: [[[98, 456], [98, 530], [146, 551]], [[424, 456], [424, 530], [376, 551]]],
    arch: { x: 280, y: 215, rx: 260, ry: 192 },
    // level 1's one-way gate across the top of the left lane: a ball coming over the top
    // drops into the bumpers (a ball going up the lane passes it)
    pit: [[64, 205], [64, 108]]
  };
  // The walls, as data for both the physics and the art. k: 0 wall, 1 rubber, 2 slingshot
  // kicker, 3 one-way gate (its front, the left of a->b, faces the playfield). th: half the
  // drawn thickness (the contact distance is the ball radius plus th). look: how art.js draws it.
  T.walls = [
    { pts: [[20, 770], [20, 215]], k: 0, e: 0.45, th: 0, look: 'outer' },
    { arch: 36, k: 0, e: 0.45, th: 0, look: 'outer' },
    { pts: [[540, 215], [540, 770]], k: 0, e: 0.45, th: 0, look: 'outer' },
    { pts: [[502, 770], [502, 332]], k: 0, e: 0.45, th: 4, look: 'rail' },             // plunger lane wall
    { pts: [[540, 296], [502, 332]], k: 3, e: 0.35, th: 2, look: 'gate' },             // one-way gate
    { pts: [[64, 205], [64, 312], [104, 362]], k: 1, e: 0.55, th: 4, look: 'rail' },   // left lane guide
    { pts: [[20, 332], [62, 382]], k: 1, e: 0.55, th: 4, look: 'rail' },               // left lane deflector
    { pts: [[458, 205], [458, 312], [418, 362]], k: 1, e: 0.55, th: 4, look: 'rail' }, // right lane guide
    { pts: [[502, 332], [460, 382]], k: 1, e: 0.55, th: 4, look: 'rail' },             // right lane deflector
    { pts: [[58, 470], [58, 550], [164, 600.5]], k: 0, e: 0.4, th: 4, look: 'rail' },  // left outlane / inlane
    { pts: [[464, 470], [464, 550], [358, 600.5]], k: 0, e: 0.4, th: 4, look: 'rail' }, // right outlane / inlane
    // one-way guides over the outlanes: a kicked ball going up is turned into the playfield,
    // a ball coming down passes through
    { pts: [[20, 452], [44, 412]], k: 3, e: 0.6, th: 2, look: 'gate' },
    { pts: [[478, 412], [502, 452]], k: 3, e: 0.6, th: 2, look: 'gate' }
  ];
  function seg(list, ax, ay, bx, by, k, e, th, i) {
    var dx = bx - ax, dy = by - ay, l = M.sqrt(dx * dx + dy * dy), m = R + th + 1;
    list.push({ ax: ax, ay: ay, bx: bx, by: by, ux: dx / l, uy: dy / l, len: l, nx: -dy / l, ny: dx / l, k: k, e: e, th: th, i: i || 0,
      x0: M.min(ax, bx) - m, x1: M.max(ax, bx) + m, y0: M.min(ay, by) - m, y1: M.max(ay, by) + m });
  }
  // A closed convex shape: normals point outward, so a ball whose centre ever got past an
  // edge is pushed back out of the shape and never through it.
  function solid(list, pts, ks, e, th, i) {
    var cx = 0, cy = 0, j, grp = [];
    for (j = 0; j < pts.length; j++) { cx += pts[j][0] / pts.length; cy += pts[j][1] / pts.length; }
    for (j = 0; j < pts.length; j++) {
      var p = pts[j], q = pts[(j + 1) % pts.length];
      seg(list, p[0], p[1], q[0], q[1], ks[j] !== undefined ? ks[j] : ks[0], e, th, i);
      var sg = list[list.length - 1];
      if ((p[0] - cx) * sg.nx + (p[1] - cy) * sg.ny < 0) { sg.nx = -sg.nx; sg.ny = -sg.ny; }
      sg.grp = grp; grp.push(sg);
    }
  }
  function inside(grp, x, y) {
    for (var j = 0; j < grp.length; j++) { var s = grp[j]; if ((x - s.ax) * s.nx + (y - s.ay) * s.ny > 0) return false; }
    return true;
  }
  function path(list, pts, k, e, th, i) { for (var j = 0; j + 1 < pts.length; j++) seg(list, pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], k, e, th, i); }
  // Convex hull (monotone chain), so the frog's head has no crevice a ball could rest in.
  function hull(pts) {
    pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], hi = [], i;
    for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
    for (i = pts.length - 1; i >= 0; i--) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], pts[i]) <= 0) hi.pop(); hi.push(pts[i]); }
    lo.pop(); hi.pop();
    return lo.concat(hi);
  }
  FP.headHull = function () {
    var h = T.head, pts = [T.peak], a;
    for (a = 0; a < 40; a++) pts.push([h.x + h.rx * M.cos(a / 40 * M.PI * 2), h.y + h.ry * M.sin(a / 40 * M.PI * 2)]);
    for (var e = 0; e < 2; e++) for (a = 0; a < 20; a++) pts.push([T.eyes[e][0] + T.eyeR * M.cos(a / 20 * M.PI * 2), T.eyes[e][1] + T.eyeR * M.sin(a / 20 * M.PI * 2)]);
    return hull(pts);
  };
  FP.archPoints = function (n) {
    var a = T.arch, pts = [];
    for (var j = 0; j <= n; j++) { var t = M.PI + M.PI * j / n; pts.push([a.x + a.rx * M.cos(t), a.y + a.ry * M.sin(t)]); }
    return pts;
  };
  FP.wallPoints = function (wall) { return wall.arch ? FP.archPoints(wall.arch) : wall.pts; };
  // The static colliders. post: the little lily bud between the flippers (easy levels);
  // pit: the gate that drops balls from the orbit into the bumpers.
  FP.build = function (post, pit) {
    var s = [], c = [];
    T.walls.forEach(function (wl) { path(s, FP.wallPoints(wl), wl.k, wl.e, wl.th); });
    T.slings.forEach(function (tri, i) { solid(s, tri, [1, 1, 2], 0.6, 3, i); });
    solid(s, FP.headHull(), [0], 0.5, 0, 9);
    T.bumpers.forEach(function (b, i) { c.push({ x: b[0], y: b[1], r: T.bumperR, k: 1, i: i, e: 0.55 }); });
    if (post) c.push({ x: T.post[0], y: T.post[1], r: T.post[2], k: 2, i: 0, e: 0.6 });
    if (pit) path(s, T.pit, 3, 0.5, 2);
    return { segs: s, circles: c };
  };

  /* ------------------------------------------------------------- levels */
  // m: the mission; goal: how many. save: ball-save seconds per ball (-1: the whole level,
  // 0: from the UI's difficulty). kick: 2 kickbacks always lit, 1 lit at every new ball,
  // 0 lit only by the ducks. post: the centre lily bud. pit: the gate into the bumpers.
  // slope: gravity factor. stars: the scores for 2 and 3 stars once the mission is done.
  FP.LEVELS = [
    { m: 'bump', goal: 10, save: -1, kick: 2, post: true, pit: true, slope: 0.85, mouth: 36, stars: [15000, 28000] },
    { m: 'duck', goal: 3, save: 20, kick: 1, post: true, slope: 0.9, mouth: 34, stars: [7500, 15000] },
    { m: 'feed', goal: 1, save: 20, kick: 1, post: true, slope: 0.93, mouth: 34, stars: [7000, 11000] },
    { m: 'score', goal: 5000, save: 0, kick: 0, post: false, slope: 1, mouth: 30, stars: [7500, 10000] },
    { m: 'orbit', goal: 2, save: 0, kick: 0, post: false, slope: 1, mouth: 30, stars: [40000, 100000] },
    { m: 'feed', goal: 3, save: 0, kick: 0, post: false, slope: 1, mouth: 30, stars: [12000, 25000] },
    { m: 'mult', goal: 3, save: 0, kick: 0, post: false, slope: 1, mouth: 30, stars: [15000, 30000] },
    { m: 'score', goal: 20000, save: 0, kick: 0, post: false, slope: 1, mouth: 30, stars: [25000, 29000] },
    { m: 'multi', goal: 2, save: 0, kick: 0, post: false, slope: 1, mouth: 30, stars: [70000, 130000] },
    { m: 'free', goal: 0, save: 0, kick: 0, post: false, slope: 1, mouth: 30, stars: [0, 0] }
  ];
  FP.FREE = FP.LEVELS.length;      // free play is the last entry (10)
  FP.MISSIONS = FP.FREE - 1;       // 9 mission levels
  FP.SCORE = { bump: 100, sling: 30, duck: 300, bank: 1000, feed: 2000, orbit: 500, spin: 40, kick: 100, multi: 5000, spare: 2500 };
  FP.MULT_MAX = 5;
  FP.stars = function (lv, score) {
    var L = FP.LEVELS[lv - 1];
    if (!L || L.m === 'free') return 0;
    return score >= L.stars[1] ? 3 : score >= L.stars[0] ? 2 : 1;
  };

  /* --------------------------------------------------------------- saves */
  FP.SKINS = [
    { id: 'chrome', cost: 0 }, { id: 'pearl', cost: 2 }, { id: 'eye', cost: 5 }, { id: 'bug', cost: 9 },
    { id: 'planet', cost: 13 }, { id: 'donut', cost: 17 }, { id: 'fly', cost: 22 }
  ];
  FP.THEMES = [{ id: 'day', cost: 0 }, { id: 'night', cost: 7 }, { id: 'candy', cost: 15 }];
  FP.newSave = function () {
    var z = []; for (var i = 0; i < FP.FREE; i++) z.push(0);
    return { v: 1, stars: z.slice(), best: z.slice(), skin: 0, theme: 0, coach: false, seen: 0 };
  };
  function int(v, lo, hi, d) { return typeof v === 'number' && v === v && v >= lo && v <= hi ? M.floor(v) : d; }
  // Anything odd in a stored save falls back to the fresh value for that field.
  FP.loadSave = function (raw) {
    var s = FP.newSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
    for (var i = 0; i < FP.FREE; i++) {
      if (Array.isArray(raw.stars)) s.stars[i] = i < FP.MISSIONS ? int(raw.stars[i], 0, 3, 0) : 0;
      if (Array.isArray(raw.best)) s.best[i] = int(raw.best[i], 0, 1e9, 0);
    }
    s.coach = raw.coach === true;
    s.seen = int(raw.seen, 0, FP.SKINS.length + FP.THEMES.length, 0);
    s.skin = int(raw.skin, 0, FP.SKINS.length - 1, 0);
    s.theme = int(raw.theme, 0, FP.THEMES.length - 1, 0);
    if (!FP.owns(s, 'skin', s.skin)) s.skin = 0;
    if (!FP.owns(s, 'theme', s.theme)) s.theme = 0;
    return s;
  };
  FP.totalStars = function (s) { var n = 0; for (var i = 0; i < FP.MISSIONS; i++) n += s.stars[i]; return n; };
  FP.owns = function (s, kind, i) { var list = kind === 'skin' ? FP.SKINS : FP.THEMES; return !!list[i] && FP.totalStars(s) >= list[i].cost; };
  // How many cosmetics the stars have unlocked (the UI marks new ones).
  FP.unlockCount = function (s) {
    var n = 0, i;
    for (i = 1; i < FP.SKINS.length; i++) if (FP.owns(s, 'skin', i)) n++;
    for (i = 1; i < FP.THEMES.length; i++) if (FP.owns(s, 'theme', i)) n++;
    return n;
  };
  FP.open = function (s, lv) { return lv === 1 || (lv <= FP.MISSIONS ? s.stars[lv - 2] > 0 : s.stars[0] > 0); };
  // Where Play goes: the first level not yet beaten, then free play.
  FP.nextLevel = function (s) { for (var i = 0; i < FP.MISSIONS; i++) if (!s.stars[i]) return i + 1; return FP.FREE; };
  // A finished try. Returns what changed for the result screen.
  FP.record = function (s, lv, score, won) {
    var i = lv - 1, before = FP.unlockCount(s), stars = won ? FP.stars(lv, score) : 0;
    var newBest = score > 0 && score > s.best[i];
    if (newBest) s.best[i] = score;
    var more = stars > s.stars[i];
    if (lv <= FP.MISSIONS) s.stars[i] = M.max(s.stars[i], stars);
    return { stars: stars, newBest: newBest, moreStars: more, unlocked: FP.unlockCount(s) - before };
  };

  /* ---------------------------------------------------------------- RNG */
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
  FP.rng = rng;

  /* -------------------------------------------------------------- world */
  // o: { level 1..10, gravity px/s² (before the level's slope), save seconds (levels with
  // save 0), kick (bumper kick px/s), seed }.
  FP.create = function (o) {
    o = o || {};
    var lv = int(o.level, 1, FP.FREE, 1), L = FP.LEVELS[lv - 1];
    var g = typeof o.gravity === 'number' && o.gravity > 0 ? o.gravity : 1100;
    var w = {
      lv: lv, L: L, ev: [], t: 0, rnd: rng(o.seed == null ? 1 : o.seed), geo: FP.build(L.post, L.pit),
      g: g * L.slope, kickV: typeof o.kick === 'number' ? o.kick : 400,
      saveFor: L.save === -1 ? 1 / 0 : L.save || (typeof o.save === 'number' ? o.save : 10), saveT: 0,
      score: 0, mult: 1, ballsLeft: FP.BALLS, prog: L.m === 'mult' ? 1 : 0, over: '', overT: 0, nextT: 0,
      balls: [], ids: 0, launches: 0,
      flippers: T.flippers.map(function (f) { return { side: f.side, x: f.x, y: f.y, ang: T.rest, w: 0, held: false, press: false, minT: 0 }; }),
      bumpers: T.bumpers.map(function () { return { lit: 0, cd: 0 }; }),
      ducks: T.ducks.map(function () { return { up: true, t: 0 }; }), bankT: 0,
      slings: [{ lit: 0, cd: 0 }, { lit: 0, cd: 0 }],
      kick: [L.kick > 0, L.kick > 0], kickLit: [0, 0], boostLit: [0, 0],
      frog: { feeds: 0, hold: 0, ball: null, cool: 0, multi: false, queue: 0, qT: 0, open: 0 },
      spin: { a: 0, w: 0, acc: 0 },
      combo: 0, comboT: 0, budCd: 0, pull: 0, pullT: 0, pulling: false, waitT: 0, autoT: FP.AUTO,
      bumps: 0, duckHits: 0, banks: 0, feeds: 0, orbits: 0, multis: 0, drains: 0, saves: 0, kicks: 0,
      bonus: 0, maxStep: 0
    };
    serve(w, FP.AUTO);
    return w;
  };
  function emit(w, e) { if (w.ev.length < 200) w.ev.push(e); }
  // A new ball waits on the plunger.
  function serve(w, auto) {
    var b = { id: ++w.ids, st: 'plunger', x: T.plunger.x, y: T.plunger.y - R, vx: 0, vy: 0, fresh: true, arm: 0, armT: 0, slow: 0, age: 0 };
    w.balls.push(b);
    w.waitT = 0; w.autoT = auto; w.pull = 0; w.pullT = 0;
    emit(w, { type: 'serve', id: b.id });
    return b;
  }
  FP.serveExtra = function (w) { return serve(w, 0.5); };
  function onPlunger(w) { for (var i = 0; i < w.balls.length; i++) if (w.balls[i].st === 'plunger') return w.balls[i]; return null; }
  function launch(w, b, power) {
    // a spring is never quite the same twice, so no two balls take the very same path
    b.st = 'live'; b.vx = 0; b.vy = -M.min(FP.MAXV, power + (w.rnd() - 0.5) * 40); b.fresh = true; b.age = 0;
    w.launches++;
    if (!b.saved) w.saveT = M.max(w.saveT, w.saveFor);
    emit(w, { type: 'launch', power: power, x: b.x, y: b.y });
  }
  function add(w, pts, x, y, why) {
    if (w.over) return 0;
    var p = pts * w.mult;
    w.score += p;
    return p;
  }
  // The mission's progress, and the win when it reaches the goal.
  function check(w) {
    if (w.over) return;
    var L = w.L, p = 0;
    switch (L.m) {
      case 'bump': p = w.bumps; break;
      case 'duck': p = w.duckHits; break;
      case 'feed': p = w.feeds; break;
      case 'score': p = w.score; break;
      case 'orbit': p = w.orbits; break;
      case 'mult': p = w.mult; break;
      case 'multi': p = w.multis; break;
      default: p = 0;
    }
    p = M.min(p, L.goal || 0);
    if (p !== w.prog) { w.prog = p; emit(w, { type: 'progress', prog: p, goal: L.goal }); }
    if (L.m !== 'free' && p >= L.goal) {
      // every ball not needed is a bonus (not multiplied), so a clean win earns more stars
      var spare = M.max(0, w.ballsLeft - 1), bonus = spare * FP.SCORE.spare;
      w.score += bonus; w.bonus = bonus;
      w.over = 'win'; w.overT = 0; emit(w, { type: 'mission', score: w.score, bonus: bonus, spare: spare });
    }
  }
  FP.check = check;

  /* ------------------------------------------------------------ physics */
  function flipDir(f) { return [f.side * M.cos(f.ang), M.sin(f.ang)]; }
  FP.flipDir = flipDir;
  FP.flipTip = function (f) { var d = flipDir(f); return [f.x + d[0] * T.flipLen, f.y + d[1] * T.flipLen]; };
  function moveFlippers(w, h) {
    for (var i = 0; i < 2; i++) {
      var f = w.flippers[i], target = f.held ? T.up : T.rest, sp = f.held ? T.upSpeed : T.downSpeed;
      if (f.ang > target) { f.w = -sp; f.ang = M.max(target, f.ang - sp * h); }
      else if (f.ang < target) { f.w = sp; f.ang = M.min(target, f.ang + sp * h); }
      else f.w = 0;
    }
  }
  function cap(b) {
    var v2 = b.vx * b.vx + b.vy * b.vy;
    if (v2 > FP.MAXV * FP.MAXV) { var k = FP.MAXV / M.sqrt(v2); b.vx *= k; b.vy *= k; }
  }
  // Reflects the ball's velocity relative to a surface moving at (sx, sy) along normal n.
  // Returns the impact speed (how fast the ball was closing in), 0 when separating.
  function bounce(b, nx, ny, e, sx, sy) {
    var rx = b.vx - (sx || 0), ry = b.vy - (sy || 0), vn = rx * nx + ry * ny;
    if (vn >= 0) return 0;
    var k = -vn < 35 ? 1 : 1 + e;           // slow contacts settle instead of jittering
    b.vx -= k * vn * nx; b.vy -= k * vn * ny;
    // a little grip along the surface
    var tx = -ny, ty = nx, vt = rx * tx + ry * ty;
    b.vx -= vt * 0.015 * tx; b.vy -= vt * 0.015 * ty;
    return -vn;
  }
  function hitSegs(w, b) {
    var segs = w.geo.segs, x = b.x, y = b.y;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) continue;
      var px = x - s.ax, py = y - s.ay, t = px * s.ux + py * s.uy;
      if (t < 0) t = 0; else if (t > s.len) t = s.len;
      var cx = s.ax + s.ux * t, cy = s.ay + s.uy * t, dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy, rr = R + s.th;
      if (d2 >= rr * rr) continue;
      if (s.k === 3 && (px * s.nx + py * s.ny < 0 || b.vx * s.nx + b.vy * s.ny > 0)) continue; // the gate lets balls out of the lane
      var d = M.sqrt(d2), nx, ny;
      if (s.grp && px * s.nx + py * s.ny < 0 && inside(s.grp, x, y)) { nx = s.nx; ny = s.ny; }
      else if (d > 1e-6) { nx = dx / d; ny = dy / d; } else { nx = s.nx; ny = s.ny; }
      x = cx + nx * rr; y = cy + ny * rr; b.x = x; b.y = y;
      var imp = bounce(b, nx, ny, s.e);
      if (s.k === 2) sling(w, b, s, imp);
      else if (imp > 320 && s.k !== 3) emit(w, { type: 'wall', p: M.min(1, imp / 1400), x: x, y: y });
    }
  }
  function sling(w, b, s, imp) {
    var sl = w.slings[s.i];
    if (sl.cd > 0 || imp < 30) return;
    var tri = T.slings[s.i], cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    var nx = s.nx, ny = s.ny;
    if ((s.ax - cx) * nx + (s.ay - cy) * ny < 0) { nx = -nx; ny = -ny; }   // the edge's outward normal
    b.vx += nx * 380; b.vy += ny * 380; cap(b);
    sl.cd = 0.12; sl.lit = 0.2; b.fresh = false;
    var p = add(w, FP.SCORE.sling);
    emit(w, { type: 'sling', i: s.i, x: b.x, y: b.y, score: p });
  }
  function hitCircles(w, b) {
    var cs = w.geo.circles;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i], dx = b.x - c.x, dy = b.y - c.y, rr = c.r + R, d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      var d = M.sqrt(d2), nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
      b.x = c.x + nx * rr; b.y = c.y + ny * rr;
      var imp = bounce(b, nx, ny, c.e);
      if (c.k === 1) {
        var bp = w.bumpers[c.i];
        if (bp.cd <= 0) {
          b.vx += nx * w.kickV; b.vy += ny * w.kickV; cap(b);
          bp.cd = 0.09; bp.lit = 0.3; b.fresh = false;
          w.bumps++;
          w.combo = w.comboT > 0 ? w.combo + 1 : 1; w.comboT = 1.5;
          var p = add(w, FP.SCORE.bump);
          emit(w, { type: 'bumper', i: c.i, x: c.x + nx * c.r, y: c.y + ny * c.r, score: p, combo: w.combo });
          check(w);
        }
      } else if (c.k === 2 && ny < -0.2) {
        // the lily bud between the flippers springs a ball back up onto a flipper, so a ball
        // never rests (or gets stuck) on it
        var out = b.vx * nx + b.vy * ny;
        if (out < 420 && w.budCd <= 0) {
          var a = (w.rnd() - 0.5) * 0.8, ca = M.cos(a), sa = M.sin(a), kx = nx * ca - ny * sa, ky = nx * sa + ny * ca;
          b.vx += kx * (420 - out); b.vy += ky * (420 - out);
          w.budCd = 0.1;
          emit(w, { type: 'bud', x: b.x, y: b.y });
        }
      } else if (imp > 320) emit(w, { type: 'wall', p: M.min(1, imp / 1400), x: b.x, y: b.y });
    }
  }
  FP.duckSeg = function (i) {
    var d = T.ducks[i], u = T.duckDir, hl = T.duckHalf;
    return [d[0] - u[0] * hl, d[1] - u[1] * hl, d[0] + u[0] * hl, d[1] + u[1] * hl];
  };
  function duckNear(i, x, y, extra) {
    var s = FP.duckSeg(i), ux = T.duckDir[0], uy = T.duckDir[1], t = (x - s[0]) * ux + (y - s[1]) * uy;
    t = M.max(0, M.min(2 * T.duckHalf, t));
    var cx = s[0] + ux * t, cy = s[1] + uy * t, dx = x - cx, dy = y - cy;
    return { cx: cx, cy: cy, dx: dx, dy: dy, d2: dx * dx + dy * dy, hit: dx * dx + dy * dy < (T.duckR + R + (extra || 0)) * (T.duckR + R + (extra || 0)) };
  }
  function hitDucks(w, b) {
    for (var i = 0; i < w.ducks.length; i++) {
      var dk = w.ducks[i];
      if (!dk.up) continue;
      var n = duckNear(i, b.x, b.y);
      if (!n.hit) continue;
      var d = M.sqrt(n.d2), nx = d > 1e-6 ? n.dx / d : -0.404, ny = d > 1e-6 ? n.dy / d : 0.915, rr = T.duckR + R;
      b.x = n.cx + nx * rr; b.y = n.cy + ny * rr;
      var imp = bounce(b, nx, ny, 0.5);
      if (imp > 50) {
        dk.up = false; dk.t = 0; b.fresh = false;
        w.duckHits++;
        var p = add(w, FP.SCORE.duck);
        emit(w, { type: 'duck', i: i, x: T.ducks[i][0], y: T.ducks[i][1], score: p });
        if (w.ducks.every(function (q) { return !q.up; })) bank(w);
        check(w);
      }
    }
  }
  function bank(w) {
    w.banks++;
    var bonus = w.mult >= FP.MULT_MAX ? FP.SCORE.multi : FP.SCORE.bank;
    var p = add(w, bonus);
    if (!w.over) w.mult = M.min(FP.MULT_MAX, w.mult + 1);
    w.kick[0] = w.kick[1] = true;
    w.bankT = 1.3;
    emit(w, { type: 'bank', mult: w.mult, score: p, x: T.ducks[1][0], y: T.ducks[1][1] - 30 });
  }
  function hitFlippers(w, b) {
    for (var i = 0; i < 2; i++) {
      var f = w.flippers[i], c = M.cos(f.ang), sn = M.sin(f.ang), ux = f.side * c, uy = sn, L = T.flipLen;
      var px = b.x - f.x, py = b.y - f.y;
      if (px * px + py * py > (L + R + 16) * (L + R + 16)) continue;
      var t = (px * ux + py * uy) / L;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      var cx = f.x + ux * L * t, cy = f.y + uy * L * t, rr = T.flipR0 + (T.flipR1 - T.flipR0) * t + R;
      var dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      var d = M.sqrt(d2), nx, ny;
      if (d > 1e-6) { nx = dx / d; ny = dy / d; } else { nx = 0; ny = -1; }
      b.x = cx + nx * rr; b.y = cy + ny * rr;
      // the surface velocity of the contact point: side * w * (-(y - py), x - px)
      var om = f.side * f.w, qx = b.x - nx * R - f.x, qy = b.y - ny * R - f.y;
      var sx = om * -qy, sy = om * qx;
      var imp = bounce(b, nx, ny, 0.28, sx, sy);
      cap(b);
      if (f.w !== 0 && imp > 200) { b.fresh = false; emit(w, { type: 'flipHit', side: f.side, p: M.min(1, imp / 1600), x: b.x, y: b.y }); }
    }
  }
  function hitBalls(w) {
    var bs = w.balls;
    for (var i = 0; i < bs.length; i++) {
      var a = bs[i];
      if (a.st !== 'live') continue;
      for (var j = i + 1; j < bs.length; j++) {
        var c = bs[j];
        if (c.st !== 'live') continue;
        var dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 < 1e-9) continue;
        var d = M.sqrt(d2), nx = dx / d, ny = dy / d, push = (2 * R - d) / 2;
        a.x -= nx * push; a.y -= ny * push; c.x += nx * push; c.y += ny * push;
        var vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (vn < 0) {
          var k = vn * 0.95;
          a.vx += k * nx; a.vy += k * ny; c.vx -= k * nx; c.vy -= k * ny;
          if (vn < -250) emit(w, { type: 'clack', x: a.x + nx * R, y: a.y + ny * R });
        }
      }
    }
  }
  // Crossing the lane lines at the top of the side lanes: the orbit and the spinner.
  function lanes(w, b, py) {
    var y = b.y, x = b.x, lane = x >= T.lanes[0][0] && x <= T.lanes[0][1] ? 0 : x >= T.lanes[1][0] && x <= T.lanes[1][1] ? 1 : -1;
    if (lane < 0) return;
    if (lane === 0 && (py - T.spinY) * (y - T.spinY) < 0) {
      w.spin.w = M.min(60, w.spin.w + M.abs(b.vy) * 0.022);
      emit(w, { type: 'spinner' });
    }
    var up = py > T.laneY && y <= T.laneY, down = py < T.laneY && y >= T.laneY;
    if (up) {
      if (b.fresh && lane === 1) return;     // the plunger launch is not an orbit
      b.arm = lane + 1; b.armT = 3;
      if (b.vy > -FP.BOOST) { b.vy = -FP.BOOST; b.vx *= 0.3; }
      w.boostLit[lane] = 0.5;
      emit(w, { type: 'boost', lane: lane, x: x, y: y });
    } else if (down) {
      if (b.arm && b.arm !== lane + 1) {
        w.orbits++;
        var p = add(w, FP.SCORE.orbit);
        emit(w, { type: 'orbit', lane: lane, x: x, y: y, score: p });
        check(w);
      }
      b.arm = 0; b.fresh = false;
    }
  }
  function mouthCatch(w, b) {
    var fr = w.frog;
    if (fr.ball || fr.cool > 0 || w.over) return false;
    var dx = b.x - T.mouth[0], dy = b.y - T.mouth[1], r = w.L.mouth;
    if (dx * dx + dy * dy > r * r || b.y > T.mouth[1] + 14) return false;
    b.st = 'mouth'; b.vx = b.vy = 0; b.fresh = false;
    fr.ball = b; fr.hold = FP.HOLD; fr.open = 0;
    fr.feeds++; w.feeds++;
    if (fr.feeds >= 3) { fr.multi = true; fr.feeds = 0; }
    var p = add(w, FP.SCORE.feed);
    emit(w, { type: 'gulp', x: T.mouth[0], y: T.mouth[1], score: p, feeds: fr.multi ? 3 : fr.feeds, multi: fr.multi, from: [b.x, b.y] });
    check(w);
    return true;
  }
  // The frog burps a ball out downwards, never straight down the middle.
  function spit(w, b) {
    var side = w.rnd() < 0.5 ? -1 : 1, a = (0.42 + w.rnd() * 0.42) * side, sp = 460 + w.rnd() * 180;
    b.st = 'live'; b.x = T.release[0] + side * 4; b.y = T.release[1];
    b.vx = M.sin(a) * sp; b.vy = M.cos(a) * sp; b.fresh = false; b.arm = 0; b.slow = 0;
  }
  function kickback(w, b) {
    for (var s = 0; s < 2; s++) {
      var k = T.kick[s];
      if (b.x < k[0] || b.x > k[1] || b.y < T.kickY || b.vy < 0) continue;
      if (!w.kick[s] || w.over) return;
      // hard enough (and a little different every time) that the gate over the lane lobs
      // the ball into the bumpers at any slope, never across into the other outlane
      b.vy = -1150 - w.rnd() * 100; b.vx = s ? -30 : 30; b.x = (k[0] + k[1]) / 2;
      if (w.L.kick < 2) w.kick[s] = false;
      w.kickLit[s] = 0.6; w.kicks++;
      var p = add(w, FP.SCORE.kick);
      emit(w, { type: 'kick', side: s, x: b.x, y: b.y, score: p });
      return;
    }
  }
  function drain(w, b) {
    w.balls.splice(w.balls.indexOf(b), 1);
    if (w.over) return;
    if (w.balls.length) { emit(w, { type: 'lost', x: b.x }); return; }
    if (w.saveT > 0) {
      w.saves++;
      var nb = serve(w, 0.8);
      nb.saved = true;
      emit(w, { type: 'saved', x: b.x });
      return;
    }
    w.ballsLeft--; w.drains++;
    emit(w, { type: 'drain', left: w.ballsLeft, x: b.x });
    if (w.ballsLeft <= 0) { w.over = w.L.m === 'free' ? 'end' : 'lose'; w.overT = 0; emit(w, { type: 'gameover', score: w.score }); }
    else w.nextT = 1.1;
  }
  function substep(w, h) {
    moveFlippers(w, h);
    var g = w.g, bs = w.balls;
    for (var i = bs.length - 1; i >= 0; i--) {
      var b = bs[i];
      if (b.st !== 'live') continue;
      var px = b.x, py = b.y;
      b.vy += g * h;
      var drag = 1 - 0.09 * h;
      b.vx *= drag; b.vy *= drag;
      cap(b);
      b.x += b.vx * h; b.y += b.vy * h;
      hitSegs(w, b);
      hitCircles(w, b);
      hitDucks(w, b);
      hitFlippers(w, b);
      var mx = b.x - px, my = b.y - py, m2 = mx * mx + my * my;
      if (m2 > w.maxStep) w.maxStep = m2;
      lanes(w, b, py);
      if (b.y < 300 && mouthCatch(w, b)) continue;
      if (b.y > T.kickY) kickback(w, b);
      if (b.y > TH + 26) drain(w, b);
    }
    hitBalls(w);
  }

  /* --------------------------------------------------------------- step */
  // input: { left, right: flipper buttons held; pull: plunger held }.
  FP.step = function (w, dt, input) {
    input = input || {};
    var i, b, f;
    if (!w.over) w.t += dt; else w.overT += dt;
    // A press flips all the way up even when the button is let go at once.
    for (i = 0; i < 2; i++) {
      f = w.flippers[i];
      var press = !!(i ? input.right : input.left);
      if (press && !f.press) { emit(w, { type: 'flip', side: f.side }); f.minT = 0.08; }
      f.press = press;
      f.held = press || f.minT > 0;
      if (f.minT > 0) f.minT -= dt;
    }
    // the plunger
    var pb = onPlunger(w);
    if (pb && !w.over) {
      w.waitT += dt;
      if (input.pull) {
        if (!w.pulling) { w.pulling = true; w.pullT = 0; }
        w.pullT += dt; w.pull = M.min(1, w.pull + dt * 1.7);
      } else if (w.pulling) {
        w.pulling = false;
        launch(w, pb, w.pullT < 0.2 ? FP.TAP : FP.MINP + (FP.MAXP - FP.MINP) * w.pull);
        w.pull = 0;
      } else if (w.waitT >= w.autoT) launch(w, pb, FP.TAP);
      if (pb.st === 'plunger') { pb.x = T.plunger.x; pb.y = T.plunger.y - R + w.pull * T.plunger.pull; }
    } else { w.pulling = !!input.pull && w.pulling; w.pull = M.max(0, w.pull - dt * 5); }
    // a new ball after a drain
    if (w.nextT > 0 && !w.over) { w.nextT -= dt; if (w.nextT <= 0) { w.nextT = 0; serve(w, FP.AUTO); if (w.L.kick === 1) w.kick[0] = w.kick[1] = true; } }
    var h = dt / SUB;
    for (var s = 0; s < SUB; s++) substep(w, h);
    // balls that rest on the plunger again (a launch too weak to clear the gate)
    for (i = 0; i < w.balls.length; i++) {
      b = w.balls[i];
      if (b.st === 'live') {
        b.age += dt;
        if (b.age > 4) b.fresh = false;
        if (b.armT > 0 && (b.armT -= dt) <= 0) b.arm = 0;
        if (b.x > 502 && b.y > T.plunger.y - R - 2 && b.vy >= 0 && !onPlunger(w)) {
          b.st = 'plunger'; b.vx = b.vy = 0; b.y = T.plunger.y - R; b.x = T.plunger.x; w.waitT = 0; w.autoT = 1.2;
          emit(w, { type: 'back' });
        }
        // a ball stuck somewhere gets a little nudge
        // (the frog shakes a ball off its head quickly: the crown is nearly flat)
        var v2 = b.vx * b.vx + b.vy * b.vy, top = b.y < 112, lim = top ? 70 : 30;
        b.slow = v2 < lim * lim ? b.slow + dt : 0;
        var holding = w.flippers[0].held || w.flippers[1].held;
        if (top && b.slow > 0.35) {
          b.vx += (b.x < T.head.x ? -1 : 1) * (170 + w.rnd() * 90); b.vy -= 40; b.slow = 0;
          emit(w, { type: 'nudge', x: b.x, y: b.y, head: true });
        } else if (b.slow > 2.5 && (b.y < 560 || (!holding && b.slow > 5))) {
          b.vx += (w.rnd() - 0.5) * 360; b.vy -= 180 + w.rnd() * 160; b.slow = 0;
          emit(w, { type: 'nudge', x: b.x, y: b.y });
        }
      }
    }
    if (w.saveT > 0 && w.balls.some(function (q) { return q.st === 'live'; })) {
      w.saveT -= dt;
      if (w.saveT <= 0) { w.saveT = 0; emit(w, { type: 'saveOff' }); }
    }
    // the frog
    var fr = w.frog;
    if (fr.cool > 0) fr.cool -= dt;
    if (fr.ball) {
      fr.hold -= dt;
      if (fr.hold <= 0) {
        b = fr.ball; fr.ball = null; fr.cool = 0.5;
        spit(w, b);
        var multi = fr.multi;
        fr.multi = false;
        if (multi) {
          var live = w.balls.length;
          fr.queue = M.max(0, M.min(2, 4 - live)); fr.qT = 0.28;
          if (!w.over) { w.multis++; w.saveT = M.max(w.saveT, 6); }
          var p = add(w, FP.SCORE.multi);
          emit(w, { type: 'multiball', score: p, x: T.mouth[0], y: T.mouth[1] });
          check(w);
        }
        emit(w, { type: 'burp', multi: multi, x: b.x, y: b.y });
      }
    }
    if (fr.queue > 0 && (fr.qT -= dt) <= 0) {
      fr.queue--; fr.qT = 0.3;
      var nb = { id: ++w.ids, st: 'live', x: 0, y: 0, vx: 0, vy: 0, fresh: false, arm: 0, armT: 0, slow: 0, age: 0 };
      spit(w, nb);
      w.balls.push(nb);
      emit(w, { type: 'burp', multi: true, extra: true, x: nb.x, y: nb.y });
    }
    fr.open = fr.ball ? 1 : M.max(0, fr.open - dt * 3);
    // timers
    for (i = 0; i < 3; i++) { w.bumpers[i].lit = M.max(0, w.bumpers[i].lit - dt); w.bumpers[i].cd -= dt; }
    for (i = 0; i < 2; i++) { w.slings[i].lit = M.max(0, w.slings[i].lit - dt); w.slings[i].cd -= dt; w.kickLit[i] = M.max(0, w.kickLit[i] - dt); w.boostLit[i] = M.max(0, w.boostLit[i] - dt); }
    if (w.comboT > 0 && (w.comboT -= dt) <= 0) { w.comboT = 0; w.combo = 0; }
    w.budCd -= dt;
    for (i = 0; i < 3; i++) if (!w.ducks[i].up) w.ducks[i].t += dt;
    if (w.bankT > 0 && (w.bankT -= dt) <= 0) {
      // the ducks pop back up (once no ball sits where one stands)
      var clear = true;
      for (i = 0; i < 3 && clear; i++) for (var j = 0; j < w.balls.length; j++) if (w.balls[j].st === 'live' && duckNear(i, w.balls[j].x, w.balls[j].y, 2).hit) clear = false;
      if (clear) { for (i = 0; i < 3; i++) { w.ducks[i].up = true; w.ducks[i].t = 0; } emit(w, { type: 'ducksUp' }); }
      else w.bankT = 0.2;
    }
    var sp = w.spin;
    if (sp.w > 0.05) {
      sp.a += sp.w * dt; sp.acc += sp.w * dt; sp.w *= M.exp(-1.3 * dt);
      while (sp.acc >= M.PI) { sp.acc -= M.PI; var q = add(w, FP.SCORE.spin); emit(w, { type: 'spin', score: q, w: sp.w }); }
      if (w.L.m === 'score') check(w);
    } else sp.w = 0;
    if (w.L.m === 'score') check(w);
    return w;
  };

  /* --------------------------------------------------------- read-outs */
  // The ball to report and follow: live first, then waiting, then the one in the mouth.
  FP.mainBall = function (w) {
    var best = null, rank = 9;
    for (var i = 0; i < w.balls.length; i++) {
      var b = w.balls[i], r = b.st === 'live' ? 0 : b.st === 'plunger' ? 1 : 2;
      if (r < rank) { rank = r; best = b; }
    }
    return best;
  };
  FP.launched = function (w) { return !onPlunger(w) && w.balls.length > 0; };
  FP.waiting = function (w) { return onPlunger(w); };
  FP.liveCount = function (w) { var n = 0; for (var i = 0; i < w.balls.length; i++) if (w.balls[i].st !== 'plunger') n++; return n; };

  /* ---------------------------------------------------------------- bot */
  // A flipper player for the title's attract run and the tests: it flips when a ball comes
  // into a flipper's reach. skill 0..1 is how well it times the flip.
  FP.bot = function (w, rnd, skill, mem) {
    var inp = { left: false, right: false, pull: false };
    mem = mem || {};
    for (var i = 0; i < 2; i++) {
      var f = w.flippers[i], want = false;
      for (var j = 0; j < w.balls.length; j++) {
        var b = w.balls[j];
        if (b.st !== 'live') continue;
        var along = f.side * (b.x - f.x), dy = b.y - f.y;
        if (along < -10 || along > T.flipLen + 14) continue;
        var surf = along * M.tan(T.rest);
        var lead = b.vy > 0 ? b.vy * (0.03 + 0.04 * (1 - skill)) : 0;
        if (dy + lead > surf - 46 && dy < surf + 14 && b.vy > -250) want = true;
      }
      var k = i ? 'r' : 'l';
      if (want && !mem[k] && rnd() < 0.35 + 0.6 * skill) mem[k] = 0.16 + rnd() * 0.12;
      if (mem[k] > 0) { mem[k] -= 1 / 60; inp[i ? 'right' : 'left'] = true; if (mem[k] <= 0) mem[k] = -0.12; }
      else if (mem[k] < 0) { mem[k] += 1 / 60; if (mem[k] >= 0) mem[k] = 0; }
    }
    return inp;
  };

  root.FP = FP;
})(typeof window !== 'undefined' ? window : this);
