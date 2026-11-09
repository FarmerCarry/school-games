/* Egg Rush (سباق البيض) engine: tuning tables, the farmyard simulation (the kid, the
 * sleepy guards and their vision cones, eggs, nests and the home nest), line of sight,
 * a path finder, stars, round ids, rewards and saves.
 * Pure: no DOM, no Kit, no timers and no Math.random (a world takes a seed), so the
 * Node test loads this file (with levels.js) in { window: {} } and plays every level
 * with a scripted player. game.js reads the DDA tier, builds a plan, steps the world
 * with the child's keys and turns the world's events into pictures, sound and stats. */
(function () {
  'use strict';
  var ER = window.ER = window.ER || {};
  var W = 1280, H = 720, TAU = Math.PI * 2, RAD = Math.PI / 180;
  ER.W = W; ER.H = H;
  ER.TIERS = 5;
  ER.PR = 22;                 // the kid's body radius
  ER.MOVE = 40;               // px/s: faster than this is "moving" for a guard's eyes
  ER.PICK = 48;               // reach for an egg in a nest
  ER.RELAY = 1.4;             // s until a hen lays the next egg in an emptied nest (the only nest)
  ER.RELAY_MORE = 2.2;        // s more for each other nest, so the far nests matter too
  ER.YARD = { x0: 24, y0: 96, x1: 1256, y1: 704 };
  ER.DUO_SECONDS = 90;
  ER.DUO_GOAL = 12;           // first to this many egg points wins a race early
  ER.BUMP_COOLDOWN = 3;       // s before the same kid can bump an egg loose again
  ER.HOP = 430;               // px/s of a guard's comic hop

  // One entry per DDA tier: 1 is tuned for a six-year-old, 5 is a real challenge for an
  // eleven-year-old. ER.GROWS says which way each knob moves as the tiers get harder;
  // tools/tests/egg-rush-engine.test.mjs checks every row.
  ER.TUNE = {
    speed: [215, 228, 240, 252, 265],    // the kid's top speed, px/s
    warn: [2.2, 1.6, 1.15, 0.85, 0.6],   // s a guard stirs (one eye open, «؟») before it looks
    awake: [2.3, 2.6, 2.8, 3.0, 3.2],    // s a guard looks around
    sleep: [4.6, 4.2, 3.8, 3.4, 3.0],    // s a guard sleeps at least
    spread: [1.6, 1.4, 1.2, 1.0, 0.9],   // up to this much longer sleep, s
    len: [185, 210, 232, 254, 276],      // vision cone length, px
    half: [24, 28, 32, 35, 38],          // vision cone half angle, degrees
    grace: [0.35, 0.28, 0.2, 0.14, 0.1], // s a waking guard needs before it notices anything
    sweep: [0.7, 0.85, 1, 1.15, 1.3],    // how fast a looking guard turns its head
    patrol: [46, 54, 62, 70, 78],        // walking speed of patrolling guards, px/s
    extra: [0, 0, 1, 1, 2],              // eggs needed above the level's own number
    allowed: [3, 2, 1, 1, 1],            // catches allowed for the second star
    par: [1.75, 1.5, 1.3, 1.15, 1]      // time allowed for the third star (x the level's pace)
  };
  // +1: grows with the tier, -1: shrinks with the tier.
  ER.GROWS = { speed: 1, warn: -1, awake: 1, sleep: -1, spread: -1, len: 1, half: 1, grace: -1, sweep: 1, patrol: 1, extra: 1, allowed: -1, par: -1 };

  // Guard animals: body radius, vision multipliers, head-turn rate and walking speed.
  ER.KINDS = {
    hen: { r: 28, len: 1, half: 1, turn: 1.1, walk: 1 },
    duck: { r: 28, len: 1, half: 1, turn: 1.1, walk: 1 },
    penguin: { r: 28, len: 1, half: 1, turn: 1.1, walk: 0.9 },
    ostrich: { r: 32, len: 1.22, half: 1.12, turn: 1.6, walk: 1.2 },
    dino: { r: 50, len: 1.18, half: 1.08, turn: 0.8, walk: 0.85 }
  };
  // Worlds: the biome, its guard, its eggs and babies.
  ER.WORLDS = [
    { id: 'farm', guard: 'hen' },
    { id: 'pond', guard: 'duck' },
    { id: 'snow', guard: 'penguin' },
    { id: 'desert', guard: 'ostrich' },
    { id: 'dino', guard: 'dino' }
  ];
  ER.GOLD = [1, 3, 5];        // value of a normal, golden and giant golden egg
  ER.CARRY = [0.92, 0.68, 0.52]; // speed while carrying each of them
  ER.WATER = 0.55;            // speed share wading through shallow water
  ER.HOME = { x: 112, y: 424, r: 54 };
  ER.START = [208, 436];
  ER.HOUSE = [22, 236, 172, 118];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function tierOf(t) { t = Math.round(Number(t)); return t >= 1 && t <= ER.TIERS ? t : 1; }
  function wrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  ER.clamp = clamp;
  ER.wrap = wrap;

  // Seeded random numbers (mulberry32), so a level replays exactly in tests.
  ER.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // The tuning of one tier as plain numbers.
  ER.knobs = function (tier) {
    var t = tierOf(tier) - 1, k = {};
    for (var key in ER.TUNE) k[key] = ER.TUNE[key][t];
    return k;
  };

  /* ---------------------------------------------------------------- ids */
  ER.LEVELS_PER_WORLD = 4;
  ER.roundId = function (li) { return 'w' + (Math.floor(li / 4) + 1) + 'L' + (li % 4 + 1); };

  /* -------------------------------------------------------------- plans */
  function rect(o) { return { kind: o[0], x: o[1], y: o[2], w: o[3], h: o[4] }; }
  function guardOf(g, kind, extra) {
    return { kind: g.kind || kind, x: g.at[0], y: g.at[1], look: (g.look || 0) * RAD, sweep: (g.sweep == null ? 14 : g.sweep) * RAD,
      sleep: g.sleep == null ? 3 : g.sleep, path: g.path ? g.path.map(function (p) { return { x: p[0], y: p[1], look: p[2] == null ? null : p[2] * RAD }; }) : null, extra: extra || 0 };
  }
  // What one try plays: the yard, the guards and nests for the tier, the goal and the par.
  ER.plan = function (li, tier) {
    li = clamp(li | 0, 0, ER.LEVELS.length - 1);
    var L = ER.LEVELS[li], t = tierOf(tier), T = ER.knobs(t), wd = ER.WORLDS[L.w];
    var goal = L.goal + T.extra;
    return {
      id: ER.roundId(li), li: li, w: L.w, l: li % 4, tier: t, duo: false, T: T, biome: wd.id, kind: wd.guard,
      goal: goal, par: Math.ceil(L.pace * goal * T.par), allowed: T.allowed, warnMul: L.warnMul || 1,
      homes: [{ x: ER.HOME.x, y: ER.HOME.y, r: ER.HOME.r }], starts: [ER.START.slice()],
      houses: [ER.HOUSE.slice()],
      obs: [['house'].concat(ER.HOUSE)].concat(L.obs || []).map(rect),
      zones: (L.zones || []).map(rect), pads: (L.pads || []).map(function (p) { return { x: p[0], y: p[1], r: p[2] }; }),
      deco: L.deco || [],
      guards: L.guards.filter(function (g) { return (g.tier || 1) <= t; }).map(function (g) { return guardOf(g, wd.guard); }),
      nests: L.nests.filter(function (n) { return (n[3] || 1) <= t; }).map(function (n) { return { x: n[0], y: n[1], gold: n[2] || 0, at: 0 }; })
    };
  };
  // A two-player race: a symmetric yard (the left half mirrored), a home on each side.
  ER.duoPlan = function (b, tier) {
    b = clamp(b | 0, 0, ER.DUO.length - 1);
    var D = ER.DUO[b], t = Math.min(3, tierOf(tier)), T = ER.knobs(t), wd = ER.WORLDS[b];
    var mx = function (o) { return [o[0], W - o[1] - o[3], o[2], o[3], o[4]]; };
    var obs = [], zones = [], pads = [], guards = [], nests = [], deco = [];
    (D.obs || []).forEach(function (o) { obs.push(o); if (!o[5]) obs.push(mx(o)); });
    (D.zones || []).forEach(function (o) { zones.push(o); if (!o[5]) zones.push(mx(o)); });
    (D.pads || []).forEach(function (p) { pads.push(p); if (!p[3]) pads.push([W - p[0], p[1], p[2]]); });
    (D.deco || []).forEach(function (p) { deco.push(p); if (!p[3]) deco.push([p[0], W - p[1], p[2]]); });
    D.guards.forEach(function (g) {
      guards.push(guardOf(g, wd.guard));
      if (!g.center) {
        var m = { at: [W - g.at[0], g.at[1]], look: 180 - (g.look || 0), sweep: g.sweep, sleep: g.sleep2 == null ? g.sleep : g.sleep2, kind: g.kind,
          path: g.path ? g.path.map(function (p) { return [W - p[0], p[1], p[2] == null ? null : 180 - p[2]]; }) : null };
        guards.push(guardOf(m, wd.guard));
      }
    });
    D.nests.forEach(function (n) {
      nests.push({ x: n[0], y: n[1], gold: n[2] || 0, at: n[4] || 0 });
      if (!n[5]) nests.push({ x: W - n[0], y: n[1], gold: n[2] || 0, at: n[4] || 0 });
    });
    var houseR = [W - ER.HOUSE[0] - ER.HOUSE[2], ER.HOUSE[1], ER.HOUSE[2], ER.HOUSE[3]];
    return {
      id: 'duo', li: -1, w: b, l: 0, tier: t, duo: true, T: T, biome: wd.id, kind: wd.guard,
      goal: ER.DUO_GOAL, par: 0, allowed: 0, warnMul: 1, seconds: ER.DUO_SECONDS,
      homes: [{ x: ER.HOME.x, y: ER.HOME.y, r: ER.HOME.r }, { x: W - ER.HOME.x, y: ER.HOME.y, r: ER.HOME.r }],
      starts: [ER.START.slice(), [W - ER.START[0], ER.START[1]]],
      houses: [ER.HOUSE.slice(), houseR],
      obs: [['house'].concat(ER.HOUSE), ['house'].concat(houseR)].concat(obs).map(rect),
      zones: zones.map(rect), pads: pads.map(function (p) { return { x: p[0], y: p[1], r: p[2] }; }), deco: deco,
      guards: guards, nests: nests
    };
  };

  /* -------------------------------------------------------------- world */
  ER.create = function (plan, seed) {
    var w = {
      plan: plan, T: plan.T, rng: ER.rng(seed), t: 0, over: false, ev: [], duo: plan.duo,
      hatched: 0, eggs: 0, catches: 0, goal: plan.goal, left: plan.duo ? plan.seconds : 0,
      obs: plan.obs, zones: plan.zones, pads: plan.pads, players: [], guards: [], nests: [], eggsList: [], nextId: 1
    };
    plan.starts.forEach(function (s, i) {
      w.players.push({ i: i, x: s[0], y: s[1], sx: s[0], sy: s[1], vx: 0, vy: 0, speed: 0, moving: false, face: 1, dy: 0, inX: 0, inY: 0,
        carry: null, stun: 0, safe: 0, bumpCd: 0, spotted: false, home: plan.homes[i], hatched: 0, eggs: 0, catches: 0,
        ice: false, water: false, still: 0 });
    });
    plan.guards.forEach(function (g, i) {
      var k = ER.KINDS[g.kind] || ER.KINDS.hen;
      var o = { id: i, kind: g.kind, x: g.x, y: g.y, hx: g.x, hy: g.y, r: k.r, look: g.look, dir: g.look, sweep: g.sweep, ph: 0,
        len: plan.T.len * k.len, half: plan.T.half * RAD * k.half, turn: k.turn, walkSpeed: plan.T.patrol * k.walk,
        state: 'sleep', t: g.sleep, dur: g.sleep, path: g.path, pi: 0, target: -1, air: 0, hopT: 0, moved: 0 };
      if (o.path) {
        // A patrolling guard sleepwalks to its first stop, then looks around there.
        o.state = 'walk'; o.t = 0; o.dur = 0; o.pi = 0;
        o.x = o.hx = g.x; o.y = o.hy = g.y;
      }
      w.guards.push(o);
    });
    var plain = plan.nests.filter(function (n) { return !n.gold; }).length;
    w.relay = ER.RELAY + ER.RELAY_MORE * Math.max(0, plain - 1);
    plan.nests.forEach(function (n, i) {
      var nest = { i: i, x: n.x, y: n.y, gold: n.gold, egg: null, relay: 0, done: false, at: n.at || 0 };
      w.nests.push(nest);
      if (!nest.at) lay(w, nest, true);
    });
    return w;
  };
  function ev(w, e) { w.ev.push(e); return e; }
  function lay(w, nest, quiet) {
    var e = { id: w.nextId++, nest: nest.i, x: nest.x, y: nest.y, gold: nest.gold, value: ER.GOLD[nest.gold], state: 'nest', by: -1, t: 0, dur: 0, x0: 0, y0: 0 };
    nest.egg = e;
    w.eggsList.push(e);
    if (!quiet) ev(w, { t: 'lay', x: nest.x, y: nest.y, gold: nest.gold, nest: nest.i });
    return e;
  }

  /* ----------------------------------------------------------- geometry */
  // Where along the segment (x0,y0)->(x0+dx*len, y0+dy*len) it first enters the rectangle, or -1.
  function slab(x0, y0, dx, dy, len, r) {
    var t0 = 0, t1 = len, inv, a, b, s;
    if (Math.abs(dx) < 1e-9) { if (x0 < r.x || x0 > r.x + r.w) return -1; }
    else { inv = 1 / dx; a = (r.x - x0) * inv; b = (r.x + r.w - x0) * inv; if (a > b) { s = a; a = b; b = s; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1; }
    if (Math.abs(dy) < 1e-9) { if (y0 < r.y || y0 > r.y + r.h) return -1; }
    else { inv = 1 / dy; a = (r.y - y0) * inv; b = (r.y + r.h - y0) * inv; if (a > b) { s = a; a = b; b = s; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1; }
    return t0;
  }
  // How far a ray goes before an obstacle stops it (up to len).
  ER.ray = function (w, x, y, ang, len) {
    var dx = Math.cos(ang), dy = Math.sin(ang), best = len;
    for (var i = 0; i < w.obs.length; i++) {
      var t = slab(x, y, dx, dy, best, w.obs[i]);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  };
  // True when nothing blocks the straight line between two points.
  ER.clear = function (w, x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return true;
    dx /= len; dy /= len;
    for (var i = 0; i < w.obs.length; i++) if (slab(x0, y0, dx, dy, len, w.obs[i]) >= 0) return false;
    return true;
  };
  // The point a guard looks from: its head.
  ER.eye = function (g) { return { x: g.x + Math.cos(g.dir) * g.r * 0.55, y: g.y + Math.sin(g.dir) * g.r * 0.55 }; };
  function looking(g) { return g.state === 'awake'; }
  // Is (x, y) inside the guard's vision cone, with nothing in between?
  ER.inCone = function (w, g, x, y) {
    var e = ER.eye(g), dx = x - e.x, dy = y - e.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > g.len) return false;
    if (d > 4 && Math.abs(wrap(Math.atan2(dy, dx) - g.dir)) > g.half) return false;
    return ER.clear(w, e.x, e.y, x, y);
  };
  ER.sees = function (w, g, x, y) { return looking(g) && ER.inCone(w, g, x, y); };
  // The visible part of a cone as points for drawing: eye, then n + 1 ray ends.
  ER.cone = function (w, g, n, out) {
    out = out || [];
    var e = ER.eye(g);
    out.length = 0;
    out.push(e.x, e.y);
    for (var i = 0; i <= n; i++) {
      var a = g.dir - g.half + (2 * g.half * i) / n, d = ER.ray(w, e.x, e.y, a, g.len);
      out.push(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d);
    }
    return out;
  };
  function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  // '' (grass), 'water', 'pad' (a lily pad in the water) or 'ice'; an island ('land') is dry.
  ER.zoneAt = function (w, x, y) {
    var kind = '';
    for (var i = 0; i < w.zones.length; i++) {
      var z = w.zones[i];
      if (!inRect(x, y, z)) continue;
      if (z.kind === 'land') return '';
      if (z.kind === 'ice' || !kind) kind = z.kind;
    }
    if (kind === 'water') for (var j = 0; j < w.pads.length; j++) { var p = w.pads[j]; if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) <= p.r * p.r) return 'pad'; }
    return kind;
  };
  function atHome(p) { var dx = p.x - p.home.x, dy = p.y - p.home.y; return dx * dx + dy * dy <= (p.home.r + 14) * (p.home.r + 14); }
  ER.atHome = atHome;

  // Pushes a circle out of a rectangle; returns the push normal or null.
  function pushRect(o, r, R) {
    var cx = clamp(o.x, r.x, r.x + r.w), cy = clamp(o.y, r.y, r.y + r.h), dx = o.x - cx, dy = o.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return null;
    var nx, ny, pen;
    if (d2 > 1e-9) { var d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = R - d; }
    else {
      // The centre is inside: leave by the nearest side.
      var l = o.x - r.x, rr = r.x + r.w - o.x, t = o.y - r.y, b = r.y + r.h - o.y, m = Math.min(l, rr, t, b);
      if (m === l) { nx = -1; ny = 0; pen = l + R; } else if (m === rr) { nx = 1; ny = 0; pen = rr + R; }
      else if (m === t) { nx = 0; ny = -1; pen = t + R; } else { nx = 0; ny = 1; pen = b + R; }
    }
    o.x += nx * pen; o.y += ny * pen;
    var vn = o.vx * nx + o.vy * ny;
    if (vn < 0) { o.vx -= vn * nx; o.vy -= vn * ny; }
    return true;
  }
  function pushCircle(o, x, y, R) {
    var dx = o.x - x, dy = o.y - y, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return false;
    var d = Math.sqrt(d2) || 1e-6, nx = d2 > 1e-9 ? dx / d : 0, ny = d2 > 1e-9 ? dy / d : 1;
    o.x = x + nx * R; o.y = y + ny * R;
    var vn = o.vx * nx + o.vy * ny;
    if (vn < 0) { o.vx -= vn * nx; o.vy -= vn * ny; }
    return true;
  }
  function solid(g) { return g.state !== 'hop' && g.state !== 'back'; }
  function collide(w, p) {
    var Y = ER.YARD, R = ER.PR;
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < w.guards.length; i++) { var g = w.guards[i]; if (solid(g)) pushCircle(p, g.x, g.y, g.r + R - 4); }
      for (var j = 0; j < w.obs.length; j++) pushRect(p, w.obs[j], R);
    }
    if (p.x < Y.x0 + R) { p.x = Y.x0 + R; if (p.vx < 0) p.vx = 0; }
    if (p.x > Y.x1 - R) { p.x = Y.x1 - R; if (p.vx > 0) p.vx = 0; }
    if (p.y < Y.y0 + R) { p.y = Y.y0 + R; if (p.vy < 0) p.vy = 0; }
    if (p.y > Y.y1 - R) { p.y = Y.y1 - R; if (p.vy > 0) p.vy = 0; }
  }

  /* ---------------------------------------------------------- the step */
  // input: one { x, y } per player, each -1..1 (the arrow keys or WASD).
  ER.step = function (w, dt, input) {
    if (w.over) return w;
    w.t += dt;
    for (var i = 0; i < w.players.length; i++) movePlayer(w, w.players[i], dt, (input && input[i]) || null);
    for (var g = 0; g < w.guards.length; g++) guardStep(w, w.guards[g], dt);
    for (var e = 0; e < w.eggsList.length; e++) eggStep(w, w.eggsList[e], dt);
    nestStep(w, dt);
    for (var k = 0; k < w.players.length; k++) reach(w, w.players[k]);
    if (w.duo) duoStep(w, dt);
    for (var c = w.eggsList.length - 1; c >= 0; c--) if (w.eggsList[c].state === 'gone') w.eggsList.splice(c, 1);
    if (!w.over && !w.duo && w.hatched >= w.goal) { w.over = true; ev(w, { t: 'done' }); }
    return w;
  };
  function movePlayer(w, p, dt, inp) {
    var ix = 0, iy = 0;
    if (inp && p.stun <= 0) {
      ix = clamp(+inp.x || 0, -1, 1); iy = clamp(+inp.y || 0, -1, 1);
      var m = Math.sqrt(ix * ix + iy * iy);
      if (m > 1) { ix /= m; iy /= m; }
    }
    p.inX = ix; p.inY = iy;
    var zone = ER.zoneAt(w, p.x, p.y), push = ix !== 0 || iy !== 0;
    p.ice = zone === 'ice'; p.water = zone === 'water';
    var sp = w.T.speed * (p.carry ? ER.CARRY[p.carry.gold] : 1) * (p.water ? ER.WATER : 1);
    var k = p.stun > 0 ? 5 : p.ice ? (push ? 2.2 : 3.4) : (push ? 16 : 18);
    var a = 1 - Math.exp(-k * dt);
    p.vx += (ix * sp - p.vx) * a; p.vy += (iy * sp - p.vy) * a;
    if (p.water) { var v = Math.sqrt(p.vx * p.vx + p.vy * p.vy), cap = w.T.speed * ER.WATER; if (v > cap && p.stun <= 0) { p.vx *= cap / v; p.vy *= cap / v; } }
    var ox = p.x, oy = p.y;
    p.x += p.vx * dt; p.y += p.vy * dt;
    collide(w, p);
    var mx = p.x - ox, my = p.y - oy;
    p.speed = Math.sqrt(mx * mx + my * my) / dt;
    p.moving = p.speed > ER.MOVE;
    p.still = p.moving ? 0 : p.still + dt;
    if (ix > 0.2) p.face = 1; else if (ix < -0.2) p.face = -1;
    if (push) p.dy = iy;
    if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
    if (p.safe > 0) p.safe = Math.max(0, p.safe - dt);
    if (p.bumpCd > 0) p.bumpCd = Math.max(0, p.bumpCd - dt);
  }

  function sleepAgain(w, g, extra) {
    if (g.path) { g.pi = (g.pi + 1) % g.path.length; g.state = 'walk'; g.t = g.dur = 0; return; }
    g.state = 'sleep';
    g.t = g.dur = w.T.sleep + w.rng() * w.T.spread + (extra || 0);
    g.dir = g.look;
    ev(w, { t: 'sleep', g: g.id });
  }
  function hopTo(g, x, y, dt) {
    var dx = x - g.x, dy = y - g.y, d = Math.sqrt(dx * dx + dy * dy), s = ER.HOP * dt;
    g.hopT += dt;
    g.air = Math.abs(Math.sin(g.hopT * 9));
    if (d > 0.5) g.dir = Math.atan2(dy, dx);
    if (d <= s) { g.x = x; g.y = y; return 0; }
    g.x += dx / d * s; g.y += dy / d * s;
    return d - s;
  }
  function guardStep(w, g, dt) {
    var T = w.T;
    g.moved = 0;
    if (g.state === 'walk') {
      var to = g.path[g.pi], dx = to.x - g.x, dy = to.y - g.y, d = Math.sqrt(dx * dx + dy * dy), s = g.walkSpeed * dt;
      if (d > 0.5) g.dir = Math.atan2(dy, dx);
      if (d <= s) {
        g.x = to.x; g.y = to.y;
        g.look = to.look == null ? g.dir : to.look;
        g.state = 'stir'; g.t = g.dur = T.warn * w.plan.warnMul;
        ev(w, { t: 'stir', g: g.id });
      } else { g.x += dx / d * s; g.y += dy / d * s; g.moved = s; }
      // A sleepwalker nudges a kid in its way aside.
      for (var q = 0; q < w.players.length; q++) {
        var p = w.players[q];
        if (pushCircle(p, g.x, g.y, g.r + ER.PR - 4)) collide(w, p);
      }
      return;
    }
    if (g.state === 'sleep') {
      g.t -= dt;
      if (g.t <= 0) { g.state = 'stir'; g.t = g.dur = T.warn * w.plan.warnMul; ev(w, { t: 'stir', g: g.id }); }
      return;
    }
    if (g.state === 'stir') {
      // Turning towards where it will look, a little wobbly.
      g.dir = g.look;
      g.t -= dt;
      if (g.t <= 0) { g.state = 'awake'; g.t = g.dur = T.awake; g.ph = 0; ev(w, { t: 'wake', g: g.id }); }
      return;
    }
    if (g.state === 'awake') {
      g.t -= dt;
      g.ph += dt * g.turn * T.sweep;
      g.dir = g.look + g.sweep * Math.sin(g.ph);
      if (g.dur - g.t >= T.grace) {
        for (var i = 0; i < w.players.length; i++) {
          var pl = w.players[i];
          if (pl.moving && pl.stun <= 0 && pl.safe <= 0 && !atHome(pl) && ER.inCone(w, g, pl.x, pl.y)) { spot(w, g, pl); return; }
        }
      }
      if (g.t <= 0) sleepAgain(w, g, 0);
      return;
    }
    if (g.state === 'alert') {
      g.t -= dt;
      var tp = w.players[g.target];
      g.dir = Math.atan2(tp.y - g.y, tp.x - g.x);
      if (g.t <= 0) { g.state = 'hop'; g.hopT = 0; ev(w, { t: 'hop', g: g.id }); }
      return;
    }
    if (g.state === 'hop') {
      var tq = w.players[g.target], dd = Math.sqrt((tq.x - g.x) * (tq.x - g.x) + (tq.y - g.y) * (tq.y - g.y)), reachD = g.r + ER.PR + 6;
      if (dd > reachD) {
        var dx2 = tq.x - g.x, dy2 = tq.y - g.y;
        hopTo(g, tq.x - dx2 / dd * reachD, tq.y - dy2 / dd * reachD, dt);
        g.t += dt;
      }
      dd = Math.sqrt((tq.x - g.x) * (tq.x - g.x) + (tq.y - g.y) * (tq.y - g.y));
      if (dd <= reachD + 1 || g.t > 3) bump(w, g, tq);
      return;
    }
    if (g.state === 'back') {
      if (hopTo(g, g.hx, g.hy, dt) <= 0) {
        g.air = 0;
        if (g.path) { g.state = 'walk'; g.pi = (g.pi + 1) % g.path.length; }
        else sleepAgain(w, g, 1);
      }
    }
  }
  // Seen moving: «!», the kid freezes in surprise until the guard has hopped over.
  function spot(w, g, p) {
    g.state = 'alert'; g.t = 0.5; g.target = p.i;
    if (g.path) { g.hx = g.x; g.hy = g.y; }
    p.stun = 9; p.spotted = true; p.vx = p.vy = 0;
    p.catches++;
    if (!w.duo) w.catches++;
    ev(w, { t: 'caught', g: g.id, p: p.i, x: p.x, y: p.y, gx: g.x, gy: g.y });
  }
  // A gentle bump back: the egg drops and rolls home to its nest.
  function bump(w, g, p) {
    var dx = p.x - g.x, dy = p.y - g.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    p.vx = dx / d * 520; p.vy = dy / d * 520; p.stun = 0.55; p.safe = 1.9; p.spotted = false;
    drop(w, p);
    g.state = 'back'; g.t = 0; g.hopT = 0;
    ev(w, { t: 'bump', g: g.id, p: p.i, x: p.x, y: p.y });
  }
  function drop(w, p) {
    var e = p.carry;
    if (!e) return;
    p.carry = null;
    var n = w.nests[e.nest];
    e.state = 'roll'; e.by = -1; e.x0 = p.x; e.y0 = p.y; e.x = p.x; e.y = p.y; e.t = 0;
    e.dur = clamp(Math.sqrt((n.x - p.x) * (n.x - p.x) + (n.y - p.y) * (n.y - p.y)) / 380, 0.45, 1.6);
    ev(w, { t: 'drop', p: p.i, x: p.x, y: p.y, gold: e.gold });
  }
  function eggStep(w, e, dt) {
    if (e.state === 'carry') { var p = w.players[e.by]; e.x = p.x; e.y = p.y; return; }
    if (e.state !== 'roll') return;
    var n = w.nests[e.nest];
    e.t += dt;
    var k = Math.min(1, e.t / e.dur), s = 1 - (1 - k) * (1 - k);
    e.x = e.x0 + (n.x - e.x0) * s; e.y = e.y0 + (n.y - e.y0) * s;
    if (k >= 1) { e.state = 'nest'; e.x = n.x; e.y = n.y; ev(w, { t: 'back', x: n.x, y: n.y, gold: e.gold }); }
  }
  function nestStep(w, dt) {
    for (var i = 0; i < w.nests.length; i++) {
      var n = w.nests[i];
      if (n.egg || n.done) continue;
      if (n.at) { if (w.t >= n.at) { n.at = 0; lay(w, n, false); } continue; }
      n.relay -= dt;
      if (n.relay <= 0) lay(w, n, false);
    }
  }
  // Touching an egg picks it up; walking into the home nest hatches it.
  function reach(w, p) {
    if (p.stun > 0) return;
    if (!p.carry) {
      for (var i = 0; i < w.eggsList.length; i++) {
        var e = w.eggsList[i];
        if (e.state !== 'nest') continue;
        var dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy <= ER.PICK * ER.PICK) {
          e.state = 'carry'; e.by = p.i; p.carry = e;
          w.nests[e.nest].egg = e;
          ev(w, { t: 'pick', p: p.i, x: e.x, y: e.y, gold: e.gold });
          break;
        }
      }
      return;
    }
    var h = p.home, hx = p.x - h.x, hy = p.y - h.y;
    if (hx * hx + hy * hy <= h.r * h.r) {
      var egg = p.carry, nest = w.nests[egg.nest];
      p.carry = null; egg.state = 'gone';
      nest.egg = null;
      if (egg.gold) nest.done = true; else nest.relay = w.relay;
      p.hatched += egg.value; p.eggs++;
      w.hatched += egg.value; w.eggs++;
      ev(w, { t: 'hatch', p: p.i, x: h.x, y: h.y, gold: egg.gold, value: egg.value });
    }
  }
  function duoStep(w, dt) {
    var a = w.players[0], b = w.players[1], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy), R = ER.PR * 2;
    if (d < R) {
      var nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0, pen = (R - d) / 2;
      a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
      collide(w, a); collide(w, b);
      // A bump knocks the other kid's egg loose (each kid then waits a few seconds).
      var pairs = [[a, b, 1], [b, a, -1]];
      for (var i = 0; i < 2; i++) {
        var by = pairs[i][0], from = pairs[i][1], s = pairs[i][2];
        if (!by.carry && from.carry && by.bumpCd <= 0 && from.safe <= 0 && from.stun <= 0 && by.stun <= 0) {
          drop(w, from);
          from.vx = nx * s * 380; from.vy = ny * s * 380; from.stun = 0.45; from.safe = 1.4;
          by.bumpCd = ER.BUMP_COOLDOWN;
          ev(w, { t: 'steal', p: by.i, from: from.i, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          break;
        }
      }
    }
    w.left = Math.max(0, w.plan.seconds - w.t);
    if (a.hatched >= w.goal || b.hatched >= w.goal) { w.over = true; ev(w, { t: 'done' }); }
    else if (w.left <= 0) { w.over = true; ev(w, { t: 'timeup' }); }
  }

  /* --------------------------------------------------------- path finder */
  // A* on a 20 px grid around the obstacles and resting guards, then straightened.
  // The test's scripted player and the idle coach (the ghost kid) both walk it.
  var CELL = 20, GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
  function blockedGrid(w, extra) {
    var grid = new Uint8Array(GW * GH), R = ER.PR + 3, Y = ER.YARD;
    for (var gy = 0; gy < GH; gy++) {
      for (var gx = 0; gx < GW; gx++) {
        var x = gx * CELL + CELL / 2, y = gy * CELL + CELL / 2, b = x < Y.x0 + R || x > Y.x1 - R || y < Y.y0 + R || y > Y.y1 - R;
        for (var i = 0; !b && i < w.obs.length; i++) {
          var r = w.obs[i], cx = clamp(x, r.x, r.x + r.w), cy = clamp(y, r.y, r.y + r.h);
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < R * R) b = true;
        }
        for (var j = 0; !b && j < w.guards.length; j++) {
          var g = w.guards[j];
          if (g.path) continue;
          if ((x - g.hx) * (x - g.hx) + (y - g.hy) * (y - g.hy) < (g.r + ER.PR) * (g.r + ER.PR)) b = true;
        }
        if (!b && extra) b = extra(x, y);
        grid[gy * GW + gx] = b ? 1 : 0;
      }
    }
    return grid;
  }
  function nearestFree(grid, c) {
    if (!grid[c]) return c;
    var cx = c % GW, cy = (c / GW) | 0;
    for (var r = 1; r < 12; r++) {
      var best = -1, bd = 1e9;
      for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
        var x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= GW || y >= GH || grid[y * GW + x]) continue;
        var d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = y * GW + x; }
      }
      if (best >= 0) return best;
    }
    return c;
  }
  function freeLine(w, x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy), n = Math.ceil(len / 8), R = ER.PR + 1;
    for (var i = 1; i <= n; i++) {
      var x = x0 + dx * i / n, y = y0 + dy * i / n;
      for (var j = 0; j < w.obs.length; j++) {
        var r = w.obs[j], cx = clamp(x, r.x, r.x + r.w), cy = clamp(y, r.y, r.y + r.h);
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < R * R) return false;
      }
      for (var k = 0; k < w.guards.length; k++) {
        var g = w.guards[k];
        if (!g.path && (x - g.hx) * (x - g.hx) + (y - g.hy) * (y - g.hy) < (g.r + ER.PR - 2) * (g.r + ER.PR - 2)) return false;
      }
    }
    return true;
  }
  // Points from (x0, y0) to (x1, y1), excluding the start; [] when there is no way.
  // extra(x, y): optional, true for more cells to avoid.
  ER.path = function (w, x0, y0, x1, y1, extra) {
    var grid = blockedGrid(w, extra);
    var cell = function (x, y) { return clamp(Math.floor(y / CELL), 0, GH - 1) * GW + clamp(Math.floor(x / CELL), 0, GW - 1); };
    var s = nearestFree(grid, cell(x0, y0)), goal = nearestFree(grid, cell(x1, y1));
    var N = GW * GH, gs = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    var heap = [], gx = goal % GW, gy = (goal / GW) | 0;
    function h(c) { var dx = Math.abs(c % GW - gx), dy = Math.abs(((c / GW) | 0) - gy); return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy); }
    function push(c, f) {
      heap.push([f, c]);
      for (var i = heap.length - 1; i > 0;) { var p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; }
    }
    function pop() {
      var top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (var i = 0; ;) {
          var l = 2 * i + 1, r = l + 1, m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
        }
      }
      return top;
    }
    gs[s] = 0; push(s, h(s));
    var found = false;
    while (heap.length) {
      var c = pop()[1];
      if (closed[c]) continue;
      closed[c] = 1;
      if (c === goal) { found = true; break; }
      var cx = c % GW, cy = (c / GW) | 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        var n = ny * GW + nx;
        if (grid[n] || closed[n]) continue;
        if (dx && dy && (grid[cy * GW + nx] || grid[ny * GW + cx])) continue;
        var cost = gs[c] + (dx && dy ? 1.4142 : 1);
        if (cost < gs[n]) { gs[n] = cost; from[n] = c; push(n, cost + h(n)); }
      }
    }
    if (!found) return [];
    var cells = [];
    for (var at = goal; at !== -1; at = from[at]) cells.push(at);
    cells.reverse();
    var pts = cells.map(function (q) { return { x: (q % GW) * CELL + CELL / 2, y: ((q / GW) | 0) * CELL + CELL / 2 }; });
    pts[pts.length - 1] = { x: x1, y: y1 };
    // Straighten: from each point jump to the farthest one in a clear line.
    var out = [], cur = { x: x0, y: y0 }, i0 = 0;
    while (i0 < pts.length) {
      var far = i0;
      for (var j = pts.length - 1; j > i0; j--) if (freeLine(w, cur.x, cur.y, pts[j].x, pts[j].y)) { far = j; break; }
      out.push(pts[far]); cur = pts[far]; i0 = far + 1;
    }
    return out;
  };

  /* -------------------------------------------------------- stars, DDA */
  ER.result = function (w) {
    var p = w.players;
    return { hatched: w.hatched, eggs: w.eggs, goal: w.goal, catches: w.catches, time: Math.round(w.t * 10) / 10, par: w.plan.par,
      allowed: w.plan.allowed, duo: w.duo, scores: p.map(function (q) { return q.hatched; }), counts: p.map(function (q) { return q.eggs; }) };
  };
  // Finishing always earns a star; one more for few catches, one more for beating the par time.
  ER.stars = function (r) { return 1 + (r.catches <= r.allowed ? 1 : 0) + (r.time <= r.par ? 1 : 0); };
  // 0..1 for Kit.dda: few catches and a good pace.
  ER.outcome = function (r) {
    var safe = clamp(1 - r.catches / (r.allowed + 2), 0, 1), pace = Math.min(1, r.par / Math.max(1, r.time));
    return Math.round(clamp(0.6 * safe + 0.4 * pace, 0, 1) * 1000) / 1000;
  };
  // A two-player race: 0 or 1 for the winner, -1 for a draw.
  ER.winner = function (w) {
    var a = w.players[0].hatched, b = w.players[1] ? w.players[1].hatched : 0;
    return a === b ? -1 : a > b ? 0 : 1;
  };

  /* ---------------------------------------------------------- rewards */
  // The kid's wardrobe: overall colours and hats, opened by the total of stars.
  ER.COLORS = [
    { c: '#3f8cff', need: 0 }, { c: '#ff5a5f', need: 2 }, { c: '#3fcf6b', need: 5 }, { c: '#a66bff', need: 8 },
    { c: '#ff9a2e', need: 12 }, { c: '#ff6fb5', need: 17 }, { c: '#19c3c3', need: 23 }, { c: '#ffc61a', need: 30 }
  ];
  ER.HATS = [
    { id: 'straw', need: 0 }, { id: 'cap', need: 3 }, { id: 'flower', need: 6 }, { id: 'bunny', need: 10 },
    { id: 'cowboy', need: 15 }, { id: 'party', need: 21 }, { id: 'beanie', need: 28 }, { id: 'crown', need: 36 }
  ];
  ER.MAX_STARS = 20 * 3;
  ER.unlocks = function (before, after) {
    var out = [];
    ER.COLORS.forEach(function (c, i) { if (c.need > before && c.need <= after) out.push({ type: 'color', i: i }); });
    ER.HATS.forEach(function (h, i) { if (h.need > before && h.need <= after) out.push({ type: 'hat', i: i }); });
    return out;
  };

  /* ------------------------------------------------------------ saves */
  // { v: 2, stars: 20 levels 0..3, best: 20 best times in tenths of a second (0: none),
  //   babies: hatched per world, golden: golden babies per world, color, hat,
  //   seen: the star total when the wardrobe was last opened, coached: the first-level
  //   freeze lesson was finished, duo: two-player races played }
  ER.SAVE_VERSION = 2;
  ER.freshSave = function () {
    var z = function (n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; };
    return { v: 2, stars: z(20), best: z(20), babies: z(5), golden: z(5), color: 0, hat: 0, seen: 0, coached: false, duo: 0 };
  };
  function int(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function ints(src, n, lo, hi) { var a = []; for (var i = 0; i < n; i++) a.push(Array.isArray(src) && int(src[i], lo, hi) ? src[i] : 0); return a; }
  // Every field is checked: an old save from the earlier game, a damaged or a hand-edited
  // save always loads as a playable one.
  ER.loadSave = function (raw) {
    var s = ER.freshSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 2) return s;
    s.stars = ints(raw.stars, 20, 0, 3);
    s.best = ints(raw.best, 20, 0, 99999);
    s.babies = ints(raw.babies, 5, 0, 999999);
    s.golden = ints(raw.golden, 5, 0, 999999).map(function (g, i) { return Math.min(g, s.babies[i]); });
    var total = ER.total(s);
    s.color = int(raw.color, 0, ER.COLORS.length - 1) && ER.COLORS[raw.color].need <= total ? raw.color : 0;
    s.hat = int(raw.hat, 0, ER.HATS.length - 1) && ER.HATS[raw.hat].need <= total ? raw.hat : 0;
    s.seen = int(raw.seen, 0, total) ? raw.seen : 0;
    s.coached = raw.coached === true;
    s.duo = int(raw.duo, 0, 999999) ? raw.duo : 0;
    return s;
  };
  ER.total = function (s) { var n = 0; for (var i = 0; i < s.stars.length; i++) n += s.stars[i]; return n; };
  ER.worldStars = function (s, w) { var n = 0; for (var i = 0; i < 4; i++) n += s.stars[w * 4 + i]; return n; };
  // A level opens when the one before it has a star; a world with its first level.
  ER.isOpen = function (s, li) { return li === 0 || s.stars[li - 1] > 0 || s.stars[li] > 0; };
  ER.worldOpen = function (s, w) { return ER.isOpen(s, w * 4); };
  // The first open level without a star, else the last open one.
  ER.nextLevel = function (s) {
    var last = 0;
    for (var i = 0; i < 20; i++) { if (!ER.isOpen(s, i)) break; last = i; if (!s.stars[i]) return i; }
    return last;
  };
  ER.topWorld = function (s) { var t = 0; for (var w = 0; w < 5; w++) if (ER.worldOpen(s, w)) t = w; return t; };
})();
