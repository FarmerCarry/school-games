/* Chaos Island (جزيرة الفوضى) engine: the four islands, platformer physics, the eight
 * disasters with their warnings, the islanders' brains, matches, stars, the wardrobe and
 * saves.
 * Pure: no DOM, no Kit, no timers and no Math.random (a world takes a seed), so the Node
 * test loads this file with { window: {} } and plays whole matches with scripted players.
 * game.js reads the DDA tier, builds a plan, steps the world with the children's keys and
 * turns the world's events into pictures, sound and statistics. */
(function () {
  'use strict';
  var CI = window.CI = window.CI || {};
  var W = 1280, H = 720;
  CI.W = W; CI.H = H; CI.TIERS = 5;
  var GROUND = CI.GROUND = 600, SEA = CI.SEA = 668, EDGE_L = CI.EDGE_L = 70, EDGE_R = CI.EDGE_R = 1210;
  var HW = CI.HW = 19, BH = CI.BH = 44, EYES = CI.EYES = 32;
  var PH = CI.PHYS = { run: 330, acc: 2800, dec: 3600, airAcc: 2000, airDec: 1000, grav: 2500, fallMul: 1.2,
    jump: 880, cut: 0.42, maxFall: 1150, coyote: 0.1, buffer: 0.14, drop: 0.28, ghost: 230 };
  CI.APEX = PH.jump * PH.jump / (2 * PH.grav);
  var CARD = CI.CARD = 3.6, CLEAR = CI.CLEAR = 2.6, INV = 1.7, POP = 1080;
  var BIG = 1e9;

  /* -------------------------------------------------------------- disasters */
  CI.DIS = ['flood', 'meteors', 'wind', 'ice', 'quake', 'clouds', 'balls', 'tornado'];
  // Each island's match draws from a pool that grows; NEW are the ones it introduces.
  CI.POOLS = [['flood', 'meteors', 'wind'], ['flood', 'meteors', 'wind', 'ice', 'quake'],
    ['flood', 'meteors', 'wind', 'ice', 'quake', 'clouds', 'balls'], CI.DIS.slice()];
  CI.NEW = [['flood', 'meteors', 'wind'], ['ice', 'quake'], ['clouds', 'balls'], ['tornado']];
  // Two small disasters at once, only in the last rounds of the hardest tiers.
  // (Never the jelly: its high, narrow perches leave no room to dodge as well.)
  CI.COMBOS = [['meteors', 'wind'], ['ice', 'meteors'], ['quake', 'meteors'], ['clouds', 'balls'], ['balls', 'meteors'],
    ['quake', 'clouds'], ['tornado', 'balls']];
  // The house door opens for these (inside is safe from all but the jelly).
  CI.DOOR = { wind: 1, tornado: 1 };

  /* ---------------------------------------------------------------- tuning */
  // One entry per DDA tier: 1 is tuned for a six-year-old, 5 is a real challenge for an
  // eleven-year-old. CI.HARDER says which way each knob moves as the tiers get harder;
  // tools/tests/chaos-island-engine.test.mjs checks every row.
  CI.TUNE = {
    rounds: [3, 5, 5, 5, 5],              // rounds in a match
    bots: [3, 3, 4, 4, 4],                // computer islanders
    len: [30, 32, 35, 38, 40],            // s of disaster per round
    lead: [1.6, 1.45, 1.3, 1.15, 1],      // s from a warning (shadow, column, '!') to the hit
    meteorGap: [1.7, 1.3, 1, 0.8, 0.62],  // s between meteor drops
    burst: [1, 1, 1, 2, 2],               // meteors per drop
    aim: [0.45, 0.55, 0.62, 0.7, 0.78],   // share of drops aimed at an islander
    jellySteps: [2, 2, 3, 3, 4],          // how many times the jelly rises
    jellySpeed: [24, 30, 36, 44, 52],     // px/s
    jellyWarn: [2.6, 2.3, 2, 1.8, 1.6],   // s the next jelly line shows before it rises
    gust: [195, 210, 232, 262, 292],      // gust push, px/s (walking is 330)
    gustLen: [1.7, 1.8, 2, 2.2, 2.5],
    gustGap: [3, 2.8, 2.5, 2.3, 2],
    gustWarn: [1.5, 1.35, 1.2, 1.1, 1],
    grip: [0.55, 0.45, 0.38, 0.32, 0.27], // acceleration share on ice
    slide: [0.3, 0.2, 0.14, 0.1, 0.07],   // braking share on ice
    snowGap: [3.4, 2.8, 2.4, 2, 1.7],
    snowSpeed: [150, 185, 220, 255, 290],
    quakeGap: [6.2, 5.4, 4.7, 4.1, 3.6],
    cracks: [1, 1, 2, 2, 3],              // platforms that crack per tremor
    crackWarn: [2.4, 2.1, 1.8, 1.6, 1.4],
    nutGap: [2, 1.7, 1.45, 1.25, 1.05],   // s between coconuts
    clouds: [2, 2, 2, 3, 3],
    zapHalf: [50, 52, 55, 58, 60],        // half width of a lightning column
    ballGap: [3.6, 3.2, 2.7, 2.3, 1.9],
    ballSpeed: [170, 195, 220, 245, 270],
    ballHop: [290, 265, 245, 225, 205],   // bounce height: lower is quicker between shadows
    twister: [160, 170, 180, 190, 200],   // tornado speed, px/s
    twisterWarn: [2.6, 2.4, 2.2, 2, 1.8],
    slip: [0.4, 0.34, 0.28, 0.22, 0.16],  // chance a computer islander misses a warning
    react: [0.55, 0.48, 0.42, 0.36, 0.3], // its reaction time, s
    goof: [0.12, 0.1, 0.08, 0.06, 0.045], // chance per second it starts a silly dance, nap or run
    combos: [0, 0, 0, 1, 2]               // last rounds with two disasters
  };
  CI.HARDER = { rounds: 1, bots: 1, len: 1, lead: -1, meteorGap: -1, burst: 1, aim: 1, jellySteps: 1, jellySpeed: 1,
    jellyWarn: -1, gust: 1, gustLen: 1, gustGap: -1, gustWarn: -1, grip: -1, slide: -1, snowGap: -1, snowSpeed: 1,
    quakeGap: -1, cracks: 1, crackWarn: -1, nutGap: -1, clouds: 1, zapHalf: 1, ballGap: -1, ballSpeed: 1, ballHop: -1,
    twister: 1, twisterWarn: -1, slip: -1, react: -1, goof: -1, combos: 1 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function tierOf(t) { t = Math.round(Number(t)); return t >= 1 && t <= CI.TIERS ? t : 1; }
  function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  CI.clamp = clamp;
  CI.tune = function (tier) {
    tier = tierOf(tier);
    var o = { tier: tier };
    for (var k in CI.TUNE) o[k] = CI.TUNE[k][tier - 1];
    return o;
  };

  // Seeded random numbers (mulberry32), so a match replays exactly in tests.
  CI.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  function pick(r, list) { return list[Math.floor(r() * list.length) % list.length]; }
  function shuffle(r, list) {
    for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = list[i]; list[i] = list[j]; list[j] = t; }
    return list;
  }

  /* ---------------------------------------------------------------- islands */
  // Platform tops (y) are where feet stand. Every one-way platform can be jumped through
  // from below and dropped through with Down (the roof is not: walk off its door side).
  // house: at one end of the island, its door facing the island (side -1: house on the
  // left). jelly: the levels the flood rises to, chosen so every platform is clearly dry
  // or clearly under at each level (the engine test checks this).
  CI.ISLANDS = [
    { id: 'beach', house: { side: -1, x0: 70, x1: 290, roofY: 480 }, tree: { x: 640, top: 305 }, tower: { x0: 960, x1: 1100 },
      plats: [
        { id: 'crate', x: 330, y: 542, w: 64, kind: 'crate' },
        { id: 'p1', x: 530, y: 500, w: 140, kind: 'leaf' },
        { id: 'p2', x: 620, y: 405, w: 130, kind: 'leaf' },
        { id: 'p3', x: 565, y: 305, w: 140, kind: 'crown' },
        { id: 't1', x: 960, y: 510, w: 140, kind: 'plank' },
        { id: 't2', x: 960, y: 420, w: 140, kind: 'plank' },
        { id: 't3', x: 960, y: 330, w: 140, kind: 'plank' },
        { id: 't4', x: 960, y: 240, w: 140, kind: 'top' },
        { id: 'cloud', x: 725, y: 200, w: 130, kind: 'cloud', amp: 40, period: 9 }
      ],
      jelly: [550, 425, 340, 250] },
    { id: 'snow', house: { side: 1, x0: 990, x1: 1210, roofY: 470 }, tree: { x: 285, top: 318 }, tower: { x0: 560, x1: 690 },
      plats: [
        { id: 'crate', x: 890, y: 542, w: 64, kind: 'crate' },
        { id: 'p1', x: 200, y: 505, w: 140, kind: 'leaf' },
        { id: 'p2', x: 300, y: 412, w: 130, kind: 'leaf' },
        { id: 'p3', x: 215, y: 318, w: 140, kind: 'crown' },
        { id: 't1', x: 560, y: 515, w: 130, kind: 'plank' },
        { id: 't2', x: 560, y: 418, w: 130, kind: 'plank' },
        { id: 't3', x: 560, y: 335, w: 130, kind: 'plank' },
        { id: 't4', x: 560, y: 245, w: 130, kind: 'top' },
        { id: 'cloud', x: 760, y: 205, w: 130, kind: 'cloud', amp: 40, period: 10 }
      ],
      jelly: [550, 422, 345, 255] },
    { id: 'candy', house: { side: -1, x0: 70, x1: 280, roofY: 485 }, tree: { x: 545, top: 315 }, tower: { x0: 1000, x1: 1130 },
      plats: [
        { id: 'crate', x: 330, y: 540, w: 70, kind: 'crate' },
        { id: 'p1', x: 470, y: 502, w: 130, kind: 'leaf' },
        { id: 'p2', x: 560, y: 408, w: 130, kind: 'leaf' },
        { id: 'p3', x: 480, y: 315, w: 140, kind: 'crown' },
        { id: 'cake', x: 760, y: 470, w: 120, kind: 'cake' },
        { id: 't1', x: 1000, y: 507, w: 130, kind: 'plank' },
        { id: 't2', x: 1000, y: 418, w: 130, kind: 'plank' },
        { id: 't3', x: 1000, y: 332, w: 130, kind: 'plank' },
        { id: 't4', x: 1000, y: 242, w: 130, kind: 'top' },
        { id: 'cloud', x: 790, y: 210, w: 125, kind: 'cloud', amp: 40, period: 9.5 }
      ],
      jelly: [550, 428, 345, 252] },
    { id: 'sky', house: { side: 1, x0: 1000, x1: 1210, roofY: 478 }, tree: { x: 215, top: 315 }, tower: { x0: 520, x1: 650 },
      plats: [
        { id: 'crate', x: 905, y: 540, w: 64, kind: 'crate' },
        { id: 'p1', x: 140, y: 505, w: 130, kind: 'leaf' },
        { id: 'p2', x: 235, y: 410, w: 130, kind: 'leaf' },
        { id: 'p3', x: 150, y: 315, w: 140, kind: 'crown' },
        { id: 't1', x: 520, y: 510, w: 130, kind: 'plank' },
        { id: 't2', x: 520, y: 420, w: 130, kind: 'plank' },
        { id: 't3', x: 520, y: 330, w: 130, kind: 'plank' },
        { id: 't4', x: 520, y: 240, w: 130, kind: 'top' },
        { id: 'cloud', x: 700, y: 215, w: 125, kind: 'cloud', amp: 40, period: 9 },
        { id: 'cloud2', x: 770, y: 330, w: 110, kind: 'cloud', amp: 50, period: 7 }
      ],
      jelly: [550, 425, 340, 250] }
  ];
  CI.ISLAND_COUNT = CI.ISLANDS.length;

  /* --------------------------------------------------------------- wardrobe */
  CI.ITEMS = [
    { id: 'c0', kind: 'color', price: 0, color: '#ffd23f' },
    { id: 'c1', kind: 'color', price: 12, color: '#ff6b6b' },
    { id: 'c2', kind: 'color', price: 12, color: '#4fc3ff' },
    { id: 'c3', kind: 'color', price: 15, color: '#5be38f' },
    { id: 'c4', kind: 'color', price: 15, color: '#b48cff' },
    { id: 'c5', kind: 'color', price: 18, color: '#ff8fd0' },
    { id: 'h0', kind: 'hat', price: 0, hat: '' },
    { id: 'h1', kind: 'hat', price: 20, hat: 'straw' },
    { id: 'h2', kind: 'hat', price: 25, hat: 'cap' },
    { id: 'h3', kind: 'hat', price: 35, hat: 'party' },
    { id: 'h4', kind: 'hat', price: 50, hat: 'propeller' },
    { id: 'h5', kind: 'hat', price: 90, hat: 'crown' },
    { id: 'x0', kind: 'extra', price: 0, extra: '' },
    { id: 'x1', kind: 'extra', price: 30, extra: 'glasses' },
    { id: 'x2', kind: 'extra', price: 45, extra: 'scarf' },
    { id: 'x3', kind: 'extra', price: 60, extra: 'cape' }
  ];
  CI.item = function (id) { for (var i = 0; i < CI.ITEMS.length; i++) if (CI.ITEMS[i].id === id) return CI.ITEMS[i]; return null; };
  CI.BOT_COLORS = ['#ff6b6b', '#4fc3ff', '#5be38f', '#b48cff', '#ff9f43', '#ff8fd0', '#2ee6d6'];
  CI.BOT_HATS = ['straw', '', 'cap', 'party', '', 'propeller', 'flower'];
  // What an islander looks like: colour, hat, extra (from save or a computer islander's set).
  CI.look = function (save) {
    var c = CI.item(save.color), h = CI.item(save.hat), x = CI.item(save.extra);
    return { color: c ? c.color : '#ffd23f', hat: h ? h.hat : '', extra: x ? x.extra : '' };
  };

  /* ------------------------------------------------------------------- save */
  CI.SAVE_V = 2;
  CI.freshSave = function () {
    return { v: CI.SAVE_V, coins: 0, stars: [0, 0, 0, 0], best: [0, 0, 0, 0], duo: 0, owned: ['c0', 'h0', 'x0'],
      color: 'c0', hat: 'h0', extra: 'x0', island: 0, tut: false };
  };
  function int(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  // Anything else (an old save, junk, a half-written object) becomes a fresh playable save.
  CI.loadSave = function (raw) {
    var s = CI.freshSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== CI.SAVE_V) return s;
    s.coins = int(raw.coins, 0, 999999) ? raw.coins : 0;
    for (var i = 0; i < 4; i++) {
      var st = Array.isArray(raw.stars) ? raw.stars[i] : 0, b = Array.isArray(raw.best) ? raw.best[i] : 0;
      s.stars[i] = int(st, 0, 3) ? st : 0;
      s.best[i] = int(b, 0, 99999) ? b : 0;
    }
    s.duo = int(raw.duo, 0, 99999) ? raw.duo : 0;
    if (Array.isArray(raw.owned)) raw.owned.forEach(function (id) { if (typeof id === 'string' && CI.item(id) && s.owned.indexOf(id) < 0) s.owned.push(id); });
    ['color', 'hat', 'extra'].forEach(function (k) {
      var it = CI.item(raw[k]);
      if (it && it.kind === k && s.owned.indexOf(raw[k]) >= 0) s[k] = raw[k];
    });
    s.island = int(raw.island, 0, 3) && CI.isOpen(s, raw.island) ? raw.island : 0;
    s.tut = raw.tut === true;
    return s;
  };
  // An island opens with one star on the one before it.
  CI.isOpen = function (s, i) { return i === 0 || (i > 0 && i < 4 && s.stars[i - 1] > 0); };
  CI.totalStars = function (s) { return s.stars.reduce(function (a, b) { return a + b; }, 0); };
  CI.stars = function (survived, rounds) {
    if (!(rounds > 0)) return 0;
    var share = survived / rounds;
    return share >= 1 - 1e-9 ? 3 : share >= 0.8 - 1e-9 ? 2 : share >= 0.6 - 1e-9 ? 1 : 0;
  };
  CI.roundId = function (island, duo) { return duo ? 'duo' : 'i' + (clamp(island | 0, 0, 3) + 1); };

  /* ------------------------------------------------------------------ plans */
  // What one match plays: its rounds (one disaster, or two in a late combo round) at a tier.
  CI.plan = function (island, tier, seed, opts) {
    opts = opts || {};
    tier = tierOf(tier); island = clamp(island | 0, 0, 3);
    var T = CI.tune(tier), r = CI.rng((seed >>> 0) ^ 0x5eed), rounds = [];
    if (opts.rounds) rounds = opts.rounds.map(function (x) { return { a: x.a, b: x.b || null }; });
    else {
      var n = T.rounds, pool = CI.POOLS[island];
      // The first round is a familiar, gentle one; the island's new disasters follow.
      var first = pick(r, island ? CI.POOLS[island - 1] : ['flood', 'meteors']);
      var list = [first], fresh = shuffle(r, CI.NEW[island].filter(function (d) { return d !== first; }));
      while (list.length < n) {
        var prev = list[list.length - 1], cand = null;
        for (var i = 0; i < fresh.length; i++) if (fresh[i] !== prev) { cand = fresh.splice(i, 1)[0]; break; }
        if (!cand) {
          var unused = pool.filter(function (d) { return d !== prev && list.indexOf(d) < 0; });
          var any = pool.filter(function (d) { return d !== prev; });
          cand = pick(r, unused.length ? unused : any);
        }
        list.push(cand);
      }
      rounds = list.map(function (d) { return { a: d, b: null }; });
      for (var k = Math.max(1, n - T.combos); k < n; k++) {
        var a = rounds[k].a, mates = [];
        CI.COMBOS.forEach(function (c) {
          var other = c[0] === a ? c[1] : c[1] === a ? c[0] : null;
          if (other && pool.indexOf(other) >= 0) mates.push(other);
        });
        if (mates.length) rounds[k].b = pick(r, mates);
      }
    }
    return { island: island, tier: tier, T: T, seed: seed >>> 0, rounds: rounds, bots: opts.bots == null ? T.bots : opts.bots, len: opts.len || T.len };
  };

  /* ------------------------------------------------------------------ world */
  function copyPlat(p) {
    var q = { id: p.id, x: p.x, y: p.y, w: p.w, kind: p.kind, one: true, base: p.x, amp: p.amp || 0, period: p.period || 0,
      dx: 0, gone: false, crack: 0, fallAt: 0 };
    return q;
  }
  CI.create = function (plan, opts) {
    opts = opts || {};
    var isl = CI.ISLANDS[plan.island], seed = opts.seed == null ? plan.seed : opts.seed;
    var w = {
      plan: plan, T: plan.T, tier: plan.tier, isl: isl, rand: CI.rng(seed ^ 0xa11ce), t: 0, dt: 1 / 60, frames: 0,
      phase: opts.demo ? 'idle' : 'card', pt: 0, round: 0, rounds: plan.rounds.length, demo: !!opts.demo,
      humans: opts.demo ? 0 : clamp(opts.humans == null ? 1 : opts.humans | 0, 0, 2),
      plats: [], ground: null, roof: null, house: isl.house, door: false, ice: 0, actors: [], haz: [], coins: [], clouds: [],
      ev: [], nextId: 1, warnAt: {}, dis: [], quake: -9, coinT: 2,
      jelly: { y: SEA + 40, target: SEA + 40, line: 0, lineId: 0, src: 0, speed: 0, levels: [] },
      wind: { dir: 0, F: 0, id: 0, warn: -9, start: -9, end: -9, prof: 0 }
    };
    w.ground = { id: 'ground', x: EDGE_L, y: GROUND, w: EDGE_R - EDGE_L, kind: 'ground', solid: true, one: false, base: EDGE_L, amp: 0, dx: 0, gone: false, crack: 0 };
    w.roof = { id: 'roof', x: isl.house.x0, y: isl.house.roofY, w: isl.house.x1 - isl.house.x0, kind: 'roof', one: true, noDrop: true, base: isl.house.x0, amp: 0, dx: 0, gone: false, crack: 0 };
    w.plats.push(w.ground, w.roof);
    isl.plats.forEach(function (p) { w.plats.push(copyPlat(p)); });
    var looks = opts.looks || [], bots = opts.demo ? (opts.bots == null ? 4 : opts.bots) : plan.bots;
    var n = w.humans + bots, palette = shuffle(w.rand, CI.BOT_COLORS.slice()), used = looks.map(function (l) { return l && l.color; });
    for (var i = 0; i < n; i++) {
      var human = i < w.humans, look = looks[i];
      if (!look) {
        var col = palette.filter(function (c) { return used.indexOf(c) < 0; })[0] || palette[i % palette.length];
        used.push(col);
        look = { color: col, hat: CI.BOT_HATS[(i * 3 + plan.island) % CI.BOT_HATS.length], extra: i % 4 === 3 ? 'glasses' : '' };
      }
      w.actors.push(makeActor(w, i, human, look, seed));
    }
    placeActors(w);
    if (!w.demo) startCard(w);
    return w;
  };
  function makeActor(w, i, human, look, seed) {
    return {
      i: i, human: human, look: look, x: 640, y: GROUND, vx: 0, vy: 0, kx: 0, face: 1, ground: null, coyote: 0, buffer: 0,
      upPrev: false, downPrev: false, cut: false, dropT: 0, dropP: null, hearts: 3, ghost: false, inv: 0, bonk: 0,
      survived: 0, coins: 0, walk: 0, inside: false, push: 0, blown: false, inJelly: false, under: false, land: 0, air: 0,
      jumps: 0, sea: 0, results: [], still: 0,
      mind: human ? null : CI.mind(w.T.react, w.T.slip, (seed * 31 + i * 7919) >>> 0, { coins: true, bot: true })
    };
  }
  // The walkable stretch of the ground beside a closed house.
  function groundSpan(w) {
    var h = w.house, lo = EDGE_L + 14, hi = EDGE_R - 14;
    if (!w.door) { if (h.side < 0) lo = Math.max(lo, h.x1 + HW + 1); else hi = Math.min(hi, h.x0 - HW - 1); }
    return [lo, hi];
  }
  CI.groundSpan = groundSpan;
  // Everyone back on the open beach, spread out, the children in the middle.
  function placeActors(w) {
    var door = w.door; w.door = false;
    var s = groundSpan(w), n = w.actors.length, slots = [], free = [], open = [];
    w.door = door;
    // Open sand, under no platform, so everyone starts in plain sight.
    for (var x0 = s[0] + 30; x0 <= s[1] - 30; x0 += 8) {
      if (w.plats.every(function (p) { return p === w.ground || p === w.roof || x0 + HW + 6 < p.x || x0 - HW - 6 > p.x + p.w; })) open.push(x0);
    }
    if (open.length < n) for (var x1 = s[0] + 30; x1 <= s[1] - 30; x1 += 8) open.push(x1);
    // The children take the middle places (player 1 on the left), computer islanders the rest.
    var mid = Math.floor((n - w.humans) / 2);
    for (var k = 0; k < n; k++) free.push(k);
    var kids = free.splice(mid, w.humans);
    shuffle(w.rand, free);
    for (var i = 0; i < n; i++) slots.push(w.actors[i].human ? kids[i] : free.shift());
    w.actors.forEach(function (a0, id) {
      var a = w.actors[id], x = open[Math.round((open.length - 1) * (slots[id] + 0.5) / n)];
      a.x = x; a.y = GROUND; a.vx = a.vy = a.kx = 0; a.ground = w.ground; a.coyote = 0; a.buffer = 0; a.dropT = 0; a.dropP = null;
      a.face = x < 640 ? 1 : -1; a.inside = false; a.push = 0; a.blown = false; a.sea = 0;
      if (a.mind) resetMind(a.mind);
    });
  }

  function emit(w, e) { e.at = w.t; w.ev.push(e); if (w.ev.length > 600) w.ev.splice(0, 300); }
  function newId(w) { return w.nextId++; }
  function warn(w, id, kind, x, y, extra) {
    w.warnAt[id] = w.t;
    var e = { t: 'warn', id: id, kind: kind, x: x, y: y };
    if (extra) for (var k in extra) e[k] = extra[k];
    emit(w, e);
  }
  CI.current = function (w) { var r = w.plan.rounds[w.round]; return r ? [r.a].concat(r.b ? [r.b] : []) : []; };
  function has(w, kind) { var r = w.plan.rounds[w.round]; return !!r && (r.a === kind || r.b === kind) && (w.phase === 'card' || w.phase === 'live'); }
  CI.has = has;

  /* ------------------------------------------------------------- platforms */
  function live(p) { return !p.gone; }
  // Does p hold up an islander standing at x? (More than about half a foot on it.)
  function holds(p, x) { return x + HW * 0.55 > p.x && x - HW * 0.55 < p.x + p.w; }
  // The highest surface at x (what a falling thing hits first), or null over the sea.
  function surfaceAt(w, x, below) {
    var best = null;
    for (var i = 0; i < w.plats.length; i++) {
      var p = w.plats[i];
      if (p.gone || x < p.x || x > p.x + p.w) continue;
      if (below != null && p.y < below) continue;
      if (!best || p.y < best.y) best = p;
    }
    return best;
  }
  CI.surfaceAt = surfaceAt;
  function movePlats(w, dt) {
    w.plats.forEach(function (p) {
      if (!p.amp) { p.dx = 0; return; }
      var nx = p.base + p.amp * Math.sin(w.t * 2 * Math.PI / p.period);
      p.dx = nx - p.x; p.x = nx;
    });
  }
  function inside(w, a) {
    var h = w.house;
    return w.door && a.y > h.roofY + 12 && a.x > h.x0 + 6 && a.x < h.x1 - 6;
  }
  CI.inside = inside;
  // Out of the wind: inside the open house, or right beside it on the side the wind blows to.
  function sheltered(w, a) {
    if (inside(w, a)) return true;
    var h = w.house, d = w.wind.dir;
    if (a.y - BH > h.roofY - 6 && a.y >= h.roofY) {
      if (h.side < 0 && d > 0 && a.x > h.x1 && a.x < h.x1 + 90) return true;
      if (h.side > 0 && d < 0 && a.x < h.x0 && a.x > h.x0 - 90) return true;
    }
    return false;
  }
  CI.sheltered = sheltered;

  /* ---------------------------------------------------------------- physics */
  function moveActor(w, a, inp, dt) {
    var T = w.T, up = !!inp.up, down = !!inp.down, dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    var upHit = up && !a.upPrev, downHit = down && !a.downPrev;
    a.upPrev = up; a.downPrev = down;
    if (a.inv > 0) a.inv -= dt;
    if (a.bonk > 0) a.bonk -= dt;
    if (a.land > 0) a.land -= dt;
    if (a.ghost) {
      // A ghost floats where its keys point, slowly, and can never be hurt.
      var gy = (down ? 1 : 0) - (up ? 1 : 0);
      a.vx += (dir * PH.ghost - a.vx) * Math.min(1, dt * 6);
      a.vy += (gy * PH.ghost - a.vy) * Math.min(1, dt * 6);
      a.x = clamp(a.x + a.vx * dt, 40, W - 40); a.y = clamp(a.y + a.vy * dt, 120, GROUND);
      if (dir) a.face = dir;
      a.ground = null; a.inside = false;
      return;
    }
    var ground = a.ground, icy = w.ice && ground, jel = a.inJelly;
    var top = PH.run * (jel ? 0.45 : 1), target = dir * top, accel;
    if (ground) accel = dir ? PH.acc * (icy ? T.grip : 1) : PH.dec * (icy ? T.slide : 1);
    else accel = dir ? PH.airAcc : PH.airDec;
    if (dir && sign(a.vx) === -dir && ground && !icy) accel = PH.dec;
    var dv = target - a.vx, step = accel * dt;
    a.vx += Math.abs(dv) <= step ? dv : sign(dv) * step;
    if (dir) a.face = dir;
    // Jumps: a press is kept for a moment (buffer) and the ground for a moment after
    // walking off it (coyote time); letting go early makes a shorter hop.
    if (upHit) a.buffer = PH.buffer;
    else if (a.buffer > 0) a.buffer -= dt;
    if (ground) a.coyote = PH.coyote; else if (a.coyote > 0) a.coyote -= dt;
    if (a.buffer > 0 && (ground || a.coyote > 0)) {
      a.vy = -PH.jump * (jel ? 0.82 : 1); a.ground = ground = null; a.coyote = 0; a.buffer = 0; a.cut = false; a.jumps++;
      emit(w, { t: 'jump', who: a.i, x: a.x, y: a.y });
    }
    if (!up && a.vy < 0 && !a.cut) { a.cut = true; if (a.vy < -260) a.vy *= PH.cut; }
    if (downHit && ground && ground.one && !ground.noDrop) {
      a.dropP = ground; a.dropT = PH.drop; a.ground = ground = null; a.coyote = 0; a.y += 1;
      emit(w, { t: 'drop', who: a.i, x: a.x, y: a.y });
    }
    if (a.dropT > 0) { a.dropT -= dt; if (a.dropT <= 0) a.dropP = null; }
    // Wind and knock-backs.
    var push = 0;
    if (w.wind.prof > 0 && !sheltered(w, a)) push = w.wind.prof * w.wind.F * w.wind.dir * (ground ? 1 : 1.25);
    a.push = push; a.blown = Math.abs(push) > 30;
    if (a.kx) { var kd = 1500 * dt; a.kx = Math.abs(a.kx) <= kd ? 0 : a.kx - sign(a.kx) * kd; }
    var px = a.x;
    if (ground && ground.dx) a.x += ground.dx;
    a.x += (a.vx + push + a.kx) * dt;
    if (dir) a.walk += Math.abs(a.vx) * dt;
    // The beach ends at the sea: walking cannot leave it, only the wind can blow you out.
    var lo = EDGE_L + 12, hi = EDGE_R - 12;
    if (!a.blown) {
      if (px >= lo && a.x < lo) { a.x = lo; if (a.vx < 0) a.vx = 0; }
      if (px <= hi && a.x > hi) { a.x = hi; if (a.vx > 0) a.vx = 0; }
    }
    // A closed house is a wall; an open door lets you in.
    var h = w.house;
    if (!w.door && a.y > h.roofY + 2 && a.y - BH < GROUND) {
      if (h.side < 0 && a.x - HW < h.x1 && a.x > h.x0) { a.x = h.x1 + HW; if (a.vx < 0) a.vx = 0; }
      if (h.side > 0 && a.x + HW > h.x0 && a.x < h.x1) { a.x = h.x0 - HW; if (a.vx > 0) a.vx = 0; }
    }
    // Falling and landing (one-way platforms only stop you from above).
    var g = PH.grav * (a.vy > 0 ? PH.fallMul : 1) * (jel ? 0.45 : 1);
    var prev = a.y;
    if (ground) {
      if (ground.gone || !holds(ground, a.x)) { a.ground = ground = null; a.coyote = PH.coyote; }
      else { a.y = ground.y; a.vy = 0; }
    }
    if (!ground) {
      a.vy = Math.min(a.vy + g * dt, PH.maxFall * (jel ? 0.45 : 1));
      a.y += a.vy * dt;
      if (a.vy >= 0) {
        var land = null;
        for (var i = 0; i < w.plats.length; i++) {
          var p = w.plats[i];
          if (p.gone || p === a.dropP || !holds(p, a.x)) continue;
          if (prev <= p.y + 0.5 && a.y >= p.y && (!land || p.y < land.y)) land = p;
        }
        if (land) {
          var power = Math.min(1, a.vy / 1100);
          a.y = land.y; a.ground = land; a.cut = false;
          if (a.vy > 380) { a.land = 0.22; emit(w, { t: 'land', who: a.i, x: a.x, y: a.y, power: power }); }
          a.vy = 0;
        }
      }
    }
    a.air = a.ground ? 0 : a.air + dt;
    a.still = Math.abs(a.vx) > 40 || !a.ground ? 0 : a.still + dt;
    a.inside = inside(w, a);
  }

  /* ------------------------------------------------------------- damage */
  // A bonk: one heart, spinning stars, a short flash of safety; at no hearts, a little ghost.
  function hurt(w, a, kind, src, kx, vy) {
    if (a.ghost || a.inv > 0 || w.phase !== 'live') return false;
    if (a.inside && kind !== 'flood') return false;
    a.hearts--; a.inv = INV; a.bonk = 1.3;
    if (kx) a.kx = kx;
    if (vy) { a.vy = vy; a.ground = null; a.cut = true; }
    var id = src && typeof src === 'object' ? src.id : src | 0;
    if (src && typeof src === 'object' && src.hits) src.hits.push(a.i);
    emit(w, { t: 'bonk', who: a.i, kind: kind, src: id, x: a.x, y: a.y - BH / 2, hearts: a.hearts });
    if (a.hearts <= 0) {
      a.hearts = 0; a.ghost = true; a.vy = -60; a.vx = 0; a.ground = null; a.kx = 0;
      emit(w, { t: 'ghost', who: a.i, x: a.x, y: a.y - BH / 2 });
    }
    return true;
  }
  // Rectangle (an islander's body) against a circle.
  function touch(a, x, y, r) {
    var cx = clamp(x, a.x - HW, a.x + HW), cy = clamp(y, a.y - BH, a.y), dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy < r * r;
  }
  CI.touch = touch;
  function threatList(w, test) {
    var out = [];
    w.actors.forEach(function (a) { if (!a.ghost && test(a)) out.push(a.i); });
    return out;
  }
  // Every hazard that could have hit someone tells them, when it is over, that they dodged it.
  function resolve(w, h) {
    if (h.done) return;
    h.done = true;
    (h.threat || []).forEach(function (i) {
      var a = w.actors[i];
      if (h.hits.indexOf(i) < 0 && !a.ghost) emit(w, { t: 'dodge', who: i, kind: h.kind, src: h.id });
    });
  }

  /* --------------------------------------------------------------- hazards */
  // Disasters like islanders who stand still: aimed things pick one, weighted by how long
  // it has not moved (so doing nothing never wins), a little more often a child.
  function target(w) {
    var sum = 0, pick = null, x;
    w.actors.forEach(function (a) { if (!a.ghost) sum += (a.human ? 1.4 : 1) * (1 + Math.min(4, a.still) * 1.5); });
    x = w.rand() * sum;
    w.actors.forEach(function (a) {
      if (a.ghost || pick) return;
      x -= (a.human ? 1.4 : 1) * (1 + Math.min(4, a.still) * 1.5);
      if (x <= 0) pick = a;
    });
    return pick;
  }
  CI.target = target;
  // Someone standing still for a few seconds draws aimed hazards more often.
  function aimChance(w, extra) {
    var still = 0;
    w.actors.forEach(function (a) { if (!a.ghost) still = Math.max(still, Math.min(1, a.still / 3)); });
    return w.T.aim + (extra || 0) + 0.3 * still;
  }
  function aimX(w, extra) {
    var a = w.rand() < aimChance(w, extra) ? target(w) : null;
    if (a) return clamp(a.x + (w.rand() - 0.5) * (a.still > 1 ? 30 : 70), EDGE_L + 30, EDGE_R - 30);
    return EDGE_L + 40 + w.rand() * (EDGE_R - EDGE_L - 80);
  }
  // Meteors and coconuts: a shadow first, then the fall onto the highest surface below.
  function spawnDrop(w, kind) {
    // Coconuts are shaken off towards the islanders more often than meteors fall on them.
    var bias = kind === 'meteor' ? 0 : 0.25, x = aimX(w, bias), tries = 0, lead = w.T.lead;
    while (tries++ < 8 && w.haz.some(function (h) { return h.k === 'drop' && h.state !== 'land' && Math.abs(h.x - x) < 90; })) x = aimX(w, bias);
    var id = newId(w), r = kind === 'meteor' ? 30 : 24, s = surfaceAt(w, x);
    var h = { k: 'drop', kind: kind === 'meteor' ? 'meteors' : 'quake', art: kind, id: id, x: x, r: r, born: w.t, impact: w.t + lead, fallT: Math.min(0.5, lead * 0.4),
      y: -80, vy: 0, vx: 0, state: 'warn', fade: 0, hits: [], surf: s ? s.y : GROUND,
      threat: threatList(w, function (a) { return Math.abs(a.x - x) < 150; }) };
    w.haz.push(h);
    warn(w, id, h.kind, x, h.surf, { art: kind });
  }
  function stepDrop(w, h, dt) {
    var s = surfaceAt(w, h.x);
    h.surf = s ? s.y : SEA + 60;
    if (h.state === 'warn' && w.t >= h.impact - h.fallT) { h.state = 'fall'; h.y = -60; }
    if (h.state === 'fall') {
      var p = clamp((w.t - (h.impact - h.fallT)) / h.fallT, 0, 1), endY = h.surf - h.r, py = h.y;
      h.y = -60 + (endY + 60) * p * p;
      for (var i = 0; i < w.actors.length; i++) {
        var a = w.actors[i];
        if (a.ghost || Math.abs(a.x - h.x) > HW + h.r) continue;
        if (a.y - BH <= h.y + h.r && a.y >= py - h.r && touch(a, h.x, clamp(a.y - BH / 2, py, h.y), h.r * 0.92)) hurt(w, a, h.kind, h, sign(a.x - h.x || 1) * 220, -420);
      }
      if (p >= 1) {
        h.state = 'land'; h.vy = -340; h.vx = (w.rand() - 0.5) * 160;
        emit(w, { t: 'impact', kind: h.art, x: h.x, y: h.surf });
        resolve(w, h);
      }
    } else if (h.state === 'land') {
      h.fade += dt; h.vy += 1600 * dt; h.y += h.vy * dt; h.x += h.vx * dt;
      if (h.y > h.surf - h.r) { h.y = h.surf - h.r; h.vy = -Math.abs(h.vy) * 0.35; }
      if (h.fade > 0.8) h.gone = true;
    }
  }
  // Lightning: a cloud stops, darkens and lights a column, then zaps it.
  function stepZap(w, h) {
    if (w.t >= h.fire && w.t <= h.end) {
      if (!h.zapped) { h.zapped = true; emit(w, { t: 'zap', x: h.x }); }
      w.actors.forEach(function (a) {
        if (!a.ghost && a.x + HW > h.x - h.hw && a.x - HW < h.x + h.hw) hurt(w, a, 'clouds', h, 0, -300);
      });
    }
    if (w.t > h.end) { resolve(w, h); h.gone = true; }
  }
  // Beach balls: the whole bouncy path is worked out when one is thrown, so its landing
  // spots can be shown long before it gets there; only a ball coming down near its
  // landing spot bonks.
  CI.BALL_G = 900; CI.BALL_R = 44;
  function ballPath(w, x0, dir, vx, hop) {
    var r = CI.BALL_R, g = CI.BALL_G, x = x0, y = 200, vy = -200, dt = 1 / 60, pts = [], lands = [], t = 0, bounce = Math.sqrt(2 * g * hop);
    for (var n = 0; n < 1400; n++) {
      var py = y;
      vy += g * dt; y += vy * dt; x += dir * vx * dt; t += dt;
      if (vy > 0) {
        var s = null;
        for (var i = 0; i < w.plats.length; i++) {
          var p = w.plats[i];
          if (p.gone || p.amp || x < p.x || x > p.x + p.w) continue;
          if (py + r <= p.y + 0.5 && y + r >= p.y && (!s || p.y < s.y)) s = p;
        }
        if (s) { y = s.y - r; vy = -bounce; lands.push({ t: t, x: x, y: s.y, plat: s.id }); }
      }
      pts.push(x, y, vy);
      if (y > SEA + 80 || x < -140 || x > W + 140) break;
    }
    return { pts: pts, lands: lands };
  }
  CI.ballPath = ballPath;
  function spawnBall(w) {
    var T = w.T, side = w.rand() < 0.5 ? -1 : 1, dir = -side, aimed = w.rand() < aimChance(w, 0.2) ? target(w) : null;
    var x0 = side < 0 ? -50 : W + 50, vx = T.ballSpeed, path = ballPath(w, x0, dir, vx, T.ballHop);
    if (aimed) {
      // Throw it a little faster or slower so that one bounce lands on the one it aims at.
      var tx = aimed.x, bd = BIG;
      for (var k = 0; k <= 10; k++) {
        var v = T.ballSpeed * (0.85 + 0.035 * k), p = ballPath(w, x0, dir, v, T.ballHop);
        p.lands.forEach(function (l) { if (l.x > EDGE_L && l.x < EDGE_R && Math.abs(l.x - tx) < bd) { bd = Math.abs(l.x - tx); path = p; vx = v; } });
      }
    }
    var id = newId(w), lead = T.lead;
    var h = { k: 'ball', kind: 'balls', id: id, born: w.t, enter: w.t + lead, dir: dir, vx: vx, r: CI.BALL_R, pts: path.pts,
      lands: path.lands.map(function (l) { return { t: l.t + w.t + lead, x: l.x, y: l.y, plat: l.plat }; }),
      x: x0, y: 200, vy: 0, i: -1, spin: 0, hits: [], side: side,
      threat: threatList(w, function () { return true; }) };
    w.haz.push(h);
    warn(w, id, 'balls', side < 0 ? 30 : W - 30, 300, { side: side });
  }
  function stepBall(w, h) {
    if (w.t < h.enter) return;
    var k = Math.floor((w.t - h.enter) * 60);
    if (k * 3 + 2 >= h.pts.length) { h.gone = true; resolve(w, h); return; }
    var px = h.x;
    h.x = h.pts[k * 3]; h.y = h.pts[k * 3 + 1]; h.vy = h.pts[k * 3 + 2]; h.spin += (h.x - px) / h.r;
    // The landing spot it is coming down on (or has just bounced off).
    var next = null;
    for (var i = 0; i < h.lands.length; i++) if (h.lands[i].t >= w.t - 0.06) { next = h.lands[i]; break; }
    if (next && !next.hit && w.t >= next.t - 0.02) { next.hit = true; emit(w, { t: 'impact', kind: 'ball', x: next.x, y: next.y }); }
    if (next && next.t - w.t < 0.24 && next.y - (h.y + h.r) < 130) {
      w.actors.forEach(function (a) { if (!a.ghost && touch(a, h.x, h.y, h.r * 0.88)) hurt(w, a, 'balls', h, h.dir * 260, -520); });
    }
    if (h.y > SEA && !h.splashed) { h.splashed = true; emit(w, { t: 'splash', who: -1, x: h.x, big: true }); }
  }
  // Snowballs drop in at the open end of the beach and roll along the sand to the house.
  function spawnSnow(w) {
    var hs = w.house, dir = hs.side, x = hs.side < 0 ? EDGE_R - 30 : EDGE_L + 30, y = GROUND - 26, id = newId(w), r = 26;
    var h = { k: 'snow', kind: 'ice', id: id, x: x, y: y - 160, sy: y, vx: dir * w.T.snowSpeed, vy: 0, r: r, born: w.t, enter: w.t + w.T.lead,
      dir: dir, spin: 0, hits: [], plat: null, sx: x,
      threat: threatList(w, function (a) { return a.ground === w.ground; }) };
    w.haz.push(h);
    warn(w, id, 'ice', x, y, { dir: h.dir });
  }
  function stepSnow(w, h, dt) {
    if (w.t < h.enter) return;
    var py = h.y;
    if (!h.plat) {
      h.vy += 2200 * dt; h.y += h.vy * dt;
      if (h.vy > 0) {
        var land = null;
        for (var i = 0; i < w.plats.length; i++) {
          var p = w.plats[i];
          if (p.gone || h.x < p.x || h.x > p.x + p.w) continue;
          if (py + h.r <= p.y + 0.5 && h.y + h.r >= p.y && (!land || p.y < land.y)) land = p;
        }
        if (land && (land === w.ground || land === w.roof)) { h.plat = land; h.y = land.y - h.r; h.vy = 0; emit(w, { t: 'impact', kind: 'snow', x: h.x, y: land.y }); }
      }
    }
    if (h.plat) h.rolled = true;
    if (h.rolled) { h.x += h.vx * dt; h.spin += h.vx * dt / h.r; }
    if (h.plat && (h.x < h.plat.x - 4 || h.x > h.plat.x + h.plat.w + 4)) h.plat = null;
    var hs = w.house;
    if (!w.door && h.y + h.r > hs.roofY + 6 && ((hs.side < 0 && h.x - h.r < hs.x1 && h.vx < 0) || (hs.side > 0 && h.x + h.r > hs.x0 && h.vx > 0))) {
      emit(w, { t: 'impact', kind: 'snowpoof', x: h.x, y: h.y }); h.gone = true; resolve(w, h); return;
    }
    w.actors.forEach(function (a) { if (!a.ghost && touch(a, h.x, h.y, h.r * 0.9)) hurt(w, a, 'ice', h, sign(h.vx) * 240, -480); });
    if (h.y > SEA || h.x < -60 || h.x > W + 60) {
      if (h.y > SEA) emit(w, { t: 'splash', who: -1, x: h.x });
      h.gone = true; resolve(w, h);
    }
  }
  // A crack glows, then its platform falls away (whoever is still on it tumbles down).
  function stepCrack(w, h) {
    var p = h.plat;
    if (!h.fell && w.t >= h.fall) {
      h.fell = true; p.gone = true; p.crack = 0;
      emit(w, { t: 'fall', id: p.id, x: p.x + p.w / 2, y: p.y });
      w.actors.forEach(function (a) { if (a.ground === p) { a.ground = null; hurt(w, a, 'quake', h, 0, -200); } });
      resolve(w, h);
    }
    if (h.fell && w.t >= h.restore) { p.gone = false; emit(w, { t: 'restore', id: p.id, x: p.x + p.w / 2, y: p.y }); h.gone = true; }
  }
  // The tornado sweeps from the open end of the island over the house, turns round at the
  // sea and sweeps back (the house keeps you safe both ways).
  function stepTwister(w, h, dt) {
    if (w.t < h.enter) { h.grow = clamp((w.t - h.born) / (h.enter - h.born), 0, 1); return; }
    h.grow = 1; h.spin += dt;
    if (h.turn > 0) h.turn -= dt;
    else h.x += h.dir * h.speed * dt;
    if (h.leg === 1 && ((h.dir < 0 && h.x < EDGE_L - 30) || (h.dir > 0 && h.x > EDGE_R + 30))) { h.leg = 2; h.dir = -h.dir; h.turn = 0.7; emit(w, { t: 'turn', x: h.x }); }
    w.actors.forEach(function (a) {
      if (!a.ghost && a.y > 110 && a.x + HW > h.x - h.hw && a.x - HW < h.x + h.hw) hurt(w, a, 'tornado', h, -h.dir * 300, -980);
    });
    if (h.leg === 2 && ((h.dir < 0 && h.x < -90) || (h.dir > 0 && h.x > W + 90))) { h.gone = true; resolve(w, h); }
  }

  /* -------------------------------------------------------- the disasters */
  // Each runs only while the round is live; power < 1 is the small half of a combo.
  var DIS = {
    flood: {
      start: function (w, d) {
        var steps = d.power < 1 ? Math.max(1, w.T.jellySteps - 2) : w.T.jellySteps;
        d.levels = w.isl.jelly.slice(0, steps); d.i = 0; d.next = 0.4; d.rise = 0; d.gap = (w.plan.len - 3) / steps;
        w.jelly.levels = d.levels; w.jelly.speed = w.T.jellySpeed;
      },
      step: function (w, d) {
        var j = w.jelly;
        if (d.i < d.levels.length && w.pt >= d.next) {
          var L = d.levels[d.i], id = newId(w);
          j.line = L; j.lineId = id; d.rise = w.pt + w.T.jellyWarn; d.next = w.pt + d.gap; d.i++;
          d.h = { id: id, kind: 'flood', hits: [], threat: threatList(w, function (a) { return L < a.y - EYES; }) };
          warn(w, id, 'flood', 640, L);
        }
        if (d.rise && w.pt >= d.rise) { j.target = j.line; j.src = j.lineId; d.rise = 0; d.cur = d.h; emit(w, { t: 'rise', y: j.target }); }
        if (d.cur && Math.abs(j.y - j.target) < 1) { resolve(w, d.cur); d.cur = null; j.line = 0; }
      }
    },
    meteors: {
      start: function (w, d) { d.next = 0.5; },
      step: function (w, d, dt) {
        d.next -= dt;
        if (d.next <= 0) {
          d.next = w.T.meteorGap / d.power * (0.8 + 0.4 * w.rand());
          for (var n = d.power < 1 ? 1 : w.T.burst; n > 0; n--) spawnDrop(w, 'meteor');
        }
      }
    },
    wind: {
      start: function (w, d) { d.next = 0.5; d.n = 0; },
      step: function (w, d) {
        var wd = w.wind, T = w.T;
        if (w.pt >= d.next && w.t > wd.end + 0.3) {
          var id = newId(w), away = w.house.side < 0 ? 1 : -1;
          wd.dir = d.n < 3 || w.rand() < 0.7 ? away : -away; d.n++;
          // The storm builds up during the round.
          wd.F = T.gust * (d.power < 1 ? 0.8 : 1) * (0.88 + 0.3 * clamp(w.pt / w.plan.len, 0, 1)); wd.id = id; wd.warn = w.t; wd.start = w.t + T.gustWarn; wd.end = wd.start + T.gustLen;
          d.next = w.pt + T.gustWarn + T.gustLen + T.gustGap * (0.85 + 0.3 * w.rand());
          d.h = { id: id, kind: 'wind', hits: [], threat: threatList(w, function (a) { return !inside(w, a); }), until: wd.end + 1.6 };
          warn(w, id, 'wind', wd.dir < 0 ? W - 60 : 60, 300, { dir: wd.dir });
        }
        if (d.h && w.t >= d.h.until) { resolve(w, d.h); d.h = null; }
      }
    },
    ice: {
      start: function (w, d) { d.next = 0.6; },
      step: function (w, d) {
        if (w.pt >= d.next) { spawnSnow(w); d.next = w.pt + w.T.snowGap / d.power * (0.85 + 0.3 * w.rand()); }
      }
    },
    quake: {
      start: function (w, d) { d.nextQ = 0.6; d.nextC = 1.4; },
      step: function (w, d) {
        if (w.pt >= d.nextQ) { tremor(w, d.power < 1 ? 1 : w.T.cracks); d.nextQ = w.pt + w.T.quakeGap / d.power; }
        if (w.pt >= d.nextC) { spawnDrop(w, 'coconut'); d.nextC = w.pt + w.T.nutGap / d.power * (0.85 + 0.3 * w.rand()); }
      }
    },
    clouds: {
      start: function (w, d) {
        var n = d.power < 1 ? 1 : w.T.clouds;
        for (var i = 0; i < n; i++) w.clouds.push({ id: newId(w), x: 200 + (880 * (i + 0.5)) / n + (w.rand() - 0.5) * 80, y: 150 + (i % 2) * 26,
          vx: (w.rand() < 0.5 ? -1 : 1) * (55 + 25 * w.rand()), state: 'drift', st: 0, wait: 0.6 + i * 0.9 + w.rand() * 0.8, tx: 640, h: null, fade: 0 });
      },
      step: function (w, d, dt) {
        w.clouds.forEach(function (c) { cloudStep(w, c, dt); });
      }
    },
    balls: {
      start: function (w, d) { d.next = 0.6; },
      step: function (w, d) {
        if (w.pt >= d.next) { spawnBall(w); d.next = w.pt + w.T.ballGap / d.power * (0.85 + 0.3 * w.rand()); }
      }
    },
    tornado: {
      start: function (w, d) { d.next = 0.5; },
      step: function (w, d) {
        if (w.pt >= d.next && !w.haz.some(function (h) { return h.k === 'twister'; })) {
          var dir = w.house.side < 0 ? -1 : 1, id = newId(w), x = dir < 0 ? W + 40 : -40, T = w.T;
          var h = { k: 'twister', kind: 'tornado', id: id, x: x, dir: dir, born: w.t, enter: w.t + T.twisterWarn, speed: T.twister * (d.power < 1 ? 0.85 : 1),
            hw: 62, grow: 0, spin: 0, leg: 1, turn: 0, hits: [], threat: threatList(w, function () { return true; }) };
          w.haz.push(h); d.next = BIG;
          warn(w, id, 'tornado', dir < 0 ? W - 40 : 40, 360, { dir: dir });
        }
        if (d.next === BIG && !w.haz.some(function (h) { return h.k === "twister"; })) d.next = w.pt + 0.8;
      }
    }
  };
  function tremor(w, n) {
    var cands = w.plats.filter(function (p) { return p.one && p !== w.roof && !p.amp && !p.gone && !p.crack; });
    var busy = cands.filter(function (p) { return w.actors.some(function (a) { return a.ground === p && !a.ghost; }); });
    var chosen = shuffle(w.rand, busy).concat(shuffle(w.rand, cands.filter(function (p) { return busy.indexOf(p) < 0; }))).slice(0, n);
    w.quake = w.t;
    emit(w, { t: 'rumble' });
    chosen.forEach(function (p) {
      var id = newId(w);
      p.crack = 1;
      var h = { k: 'crack', kind: 'quake', id: id, plat: p, born: w.t, fall: w.t + w.T.crackWarn, restore: w.t + w.T.crackWarn + 4.5, hits: [],
        threat: threatList(w, function (a) { return a.ground === p; }) };
      w.haz.push(h);
      warn(w, id, 'quake', p.x + p.w / 2, p.y, { plat: p.id });
    });
  }
  function cloudStep(w, c, dt) {
    c.st += dt;
    if (c.state === 'drift') {
      if (c.st > 1.2 || !c.tgt) {
        var who = w.rand() < aimChance(w) ? target(w) : null;
        c.tgt = 1; c.tx = who ? who.x : EDGE_L + 60 + w.rand() * (EDGE_R - EDGE_L - 120);
        if (c.st > 1.2) c.st = 0.0001;
      }
      var want = clamp(c.tx - c.x, -1, 1) * 95;
      c.vx += (want - c.vx) * Math.min(1, dt * 2);
      c.x = clamp(c.x + c.vx * dt, EDGE_L + 40, EDGE_R - 40);
      c.wait -= dt;
      if (c.wait <= 0) {
        var hw = w.T.zapHalf, ok = !w.clouds.some(function (o) { return o !== c && o.state === 'charge' && Math.abs(o.x - c.x) < 2 * hw + 150; });
        if (ok) {
          var id = newId(w), lead = w.T.lead;
          c.state = 'charge'; c.st = 0;
          c.h = { k: 'zap', kind: 'clouds', id: id, x: c.x, y0: c.y + 24, hw: hw, born: w.t, fire: w.t + lead, end: w.t + lead + 0.34, hits: [], cloud: c.id,
            threat: threatList(w, function (a) { return Math.abs(a.x - c.x) < hw + 60; }) };
          w.haz.push(c.h);
          warn(w, id, 'clouds', c.x, GROUND, { half: hw });
        } else c.wait = 0.3;
      }
    } else if (c.state === 'charge') {
      if (c.h.gone) { c.state = 'drift'; c.st = 0; c.wait = 1 + w.rand() * 1.4; c.h = null; c.vx = (w.rand() < 0.5 ? -1 : 1) * 40; }
    }
  }

  /* ----------------------------------------------------------------- coins */
  function spawnCoin(w) {
    var plats = w.plats.filter(function (p) { return !p.gone && !p.crack && (p !== w.ground || w.rand() < 0.8); });
    var p = plats[Math.floor(w.rand() * plats.length) % plats.length];
    var span = p === w.ground ? groundSpan(w) : [p.x + 18, p.x + p.w - 18];
    var ox = span[0] + w.rand() * (span[1] - span[0]) - p.x;
    var big = w.rand() < 0.14;
    w.coins.push({ id: newId(w), plat: p, ox: ox, x: p.x + ox, y: p.y - 30, v: big ? 3 : 1, born: w.t, life: 9 });
    emit(w, { t: 'coinSpawn', x: p.x + ox, y: p.y - 30, big: big });
  }
  function stepCoins(w, dt) {
    if (w.phase === 'live') {
      w.coinT -= dt;
      if (w.coinT <= 0) { w.coinT = 3.2 + w.rand() * 1.6; if (w.coins.length < 3) spawnCoin(w); }
    }
    for (var i = w.coins.length - 1; i >= 0; i--) {
      var c = w.coins[i];
      c.x = c.plat.x + c.ox;
      if (c.plat.gone || w.t - c.born > c.life || w.phase !== 'live') { w.coins.splice(i, 1); emit(w, { t: 'coinGone', x: c.x, y: c.y }); continue; }
      for (var k = 0; k < w.actors.length; k++) {
        var a = w.actors[k], dx = a.x - c.x, dy = a.y - 22 - c.y;
        if (!a.ghost && dx * dx + dy * dy < 36 * 36) {
          a.coins += c.v; w.coins.splice(i, 1);
          emit(w, { t: 'coin', who: a.i, x: c.x, y: c.y, v: c.v });
          break;
        }
      }
    }
  }

  /* ------------------------------------------------------------- the match */
  function startCard(w) {
    var kinds = CI.current(w);
    w.phase = 'card'; w.pt = 0; w.counted = 0;
    w.door = kinds.some(function (k) { return CI.DOOR[k]; });
    w.ice = kinds.indexOf('ice') >= 0 ? 1 : 0;
    w.actors.forEach(function (a) {
      a.hearts = 3; a.ghost = false; a.inv = 0; a.bonk = 0; a.kx = 0;
    });
    placeActors(w);
    emit(w, { t: 'card', round: w.round, kinds: kinds });
    if (w.door) emit(w, { t: 'door', open: true });
  }
  function goLive(w) {
    w.phase = 'live'; w.pt = 0; w.coinT = 2.2;
    w.dis = CI.current(w).map(function (k, i) { var d = { kind: k, power: i ? 0.6 : 1 }; DIS[k].start(w, d); return d; });
    emit(w, { t: 'live', round: w.round });
  }
  function goClear(w) {
    w.phase = 'clear'; w.pt = 0;
    w.haz.forEach(function (h) {
      if (h.k === 'crack') { if (h.plat.gone || h.plat.crack) { h.plat.gone = false; h.plat.crack = 0; emit(w, { t: 'restore', id: h.plat.id, x: h.plat.x + h.plat.w / 2, y: h.plat.y }); } }
      else if (h.k === 'drop' || h.k === 'snow' || h.k === 'ball' || h.k === 'twister') emit(w, { t: 'poof', x: h.x, y: h.k === 'drop' && h.state === 'warn' ? h.surf : h.y });
      resolve(w, h);
    });
    w.haz = []; w.clouds.forEach(function (c) { c.state = 'leave'; c.h = null; });
    w.dis.forEach(function (d) { if (d.h) resolve(w, d.h); if (d.cur) resolve(w, d.cur); });
    w.dis = [];
    w.wind.prof = 0; w.wind.end = -9; w.jelly.target = SEA + 40; w.jelly.line = 0; w.jelly.speed = 260;
    var survivors = [];
    w.actors.forEach(function (a) {
      var ok = !a.ghost;
      a.results.push(ok);
      if (ok) { a.survived++; a.coins += 2; survivors.push(a.i); }
    });
    emit(w, { t: 'clear', round: w.round, survivors: survivors });
  }
  function stepPhase(w, dt) {
    if (w.phase === 'card') {
      var n = w.pt >= 2.6 ? 3 : w.pt >= 1.6 ? 2 : w.pt >= 0.6 ? 1 : 0;
      while (w.counted < n) { w.counted++; emit(w, { t: 'count', n: 4 - w.counted }); }
      if (w.pt >= CARD) { emit(w, { t: 'count', n: 0 }); goLive(w); }
    } else if (w.phase === 'live') {
      w.dis.forEach(function (d) { DIS[d.kind].step(w, d, dt); });
      if (w.pt >= w.plan.len) goClear(w);
    } else if (w.phase === 'clear') {
      if (w.pt >= CLEAR) {
        w.clouds = []; w.ice = 0;
        if (w.round + 1 < w.rounds) { w.round++; startCard(w); }
        else { w.phase = 'done'; w.door = false; emit(w, { t: 'done' }); }
      }
    }
  }
  function stepWorld(w, dt) {
    var j = w.jelly;
    if (j.y !== j.target) { var dj = j.speed * dt; j.y = Math.abs(j.target - j.y) <= dj ? j.target : j.y + sign(j.target - j.y) * dj; }
    var wd = w.wind;
    if (w.t >= wd.start && w.t <= wd.end) wd.prof = Math.min(1, (w.t - wd.start) / 0.25, (wd.end - w.t) / 0.3);
    else wd.prof = 0;
    for (var i = w.haz.length - 1; i >= 0; i--) {
      var h = w.haz[i];
      if (h.k === 'drop') stepDrop(w, h, dt);
      else if (h.k === 'zap') stepZap(w, h);
      else if (h.k === 'ball') stepBall(w, h);
      else if (h.k === 'snow') stepSnow(w, h, dt);
      else if (h.k === 'crack') stepCrack(w, h);
      else if (h.k === 'twister') stepTwister(w, h, dt);
      if (h.gone) w.haz.splice(i, 1);
    }
    for (var c = w.clouds.length - 1; c >= 0; c--) if (w.clouds[c].state === 'leave') { w.clouds[c].fade += dt; if (w.clouds[c].fade > 1) w.clouds.splice(c, 1); }
  }
  function stepActor(w, a, inp, dt) {
    moveActor(w, a, inp, dt);
    if (a.ghost) return;
    var j = w.jelly;
    a.inJelly = j.y < a.y - 3; a.under = j.y < a.y - EYES;
    if (a.under && w.phase === 'live') {
      if (hurt(w, a, 'flood', j.src)) { if (!a.ghost) { a.vy = -POP; a.ground = null; a.cut = true; emit(w, { t: 'popup', who: a.i, x: a.x, y: j.y }); } }
    }
    // Into the sea: a splash, a heart, and back on the beach.
    if (a.y > SEA) {
      emit(w, { t: 'splash', who: a.i, x: a.x });
      var src = w.wind.id && w.t - w.wind.end < 2.5 ? w.wind.id : 0, hit = false;
      if (w.phase === 'live') { var keep = a.inv; a.inv = 0; hit = hurt(w, a, 'sea', src); if (!hit) a.inv = keep; }
      if (!a.ghost) {
        var s = groundSpan(w);
        a.x = clamp(640 + (w.rand() - 0.5) * 200, s[0] + 20, s[1] - 20); a.y = GROUND - 260; a.vx = a.vy = a.kx = 0; a.ground = null;
        a.inv = Math.max(a.inv, 1.2); a.sea = 1;
        if (a.mind) resetMind(a.mind);
      } else { a.y = SEA - 60; a.vy = -100; }
    }
  }

  // One fixed step. inputs[i] = { l, r, up, down } for child i (held keys).
  CI.step = function (w, dt, inputs) {
    if (w.phase === 'done') return;
    w.dt = dt; w.t += dt; w.pt += dt; w.frames++;
    movePlats(w, dt);
    stepPhase(w, dt);
    stepWorld(w, dt);
    for (var i = 0; i < w.actors.length; i++) {
      var a = w.actors[i];
      var inp = a.human ? (inputs && inputs[i]) || NONE : CI.think(w, a, a.mind);
      stepActor(w, a, inp, dt);
    }
    stepCoins(w, dt);
  };
  var NONE = { l: 0, r: 0, up: 0, down: 0 };
  CI.NONE = NONE;

  /* --------------------------------------------------------------- results */
  CI.ranking = function (w) {
    return w.actors.slice().sort(function (a, b) { return b.survived - a.survived || b.coins - a.coins || a.i - b.i; });
  };
  // The share of rounds the child survived (the difficulty outcome).
  CI.outcome = function (w, i) { var a = w.actors[i || 0]; return w.rounds ? a.survived / w.rounds : 0; };

  /* ------------------------------------------------------------ the brains */
  // Computer islanders (and the coach that shows a child the move) look at the same
  // warnings a child sees and plan a route over the platforms. A computer islander
  // reacts a little late and sometimes misses a warning altogether.
  CI.mind = function (react, slip, seed, opts) {
    opts = opts || {};
    return { react: react || 0, slip: slip || 0, rand: CI.rng(seed || 7), coins: !!opts.coins, bot: !!opts.bot, seen: {}, skip: {},
      tick: 0, goal: null, esc: null, edge: null, edgeT: 0, bad: {}, wander: 0, wx: 640, hold: false, pickFlood: null, gx: 640, gy: 300, gt: 0, holdWind: null };
  };
  function resetMind(m) { m.goal = null; m.esc = null; m.edge = null; m.edgeT = 0; m.tick = 0; m.pickFlood = null; m.holdWind = null; m.holdX = null; m.floodAim = null; m.wgoal = null; }
  CI.resetMind = resetMind;

  function standSpan(w, p) {
    if (p === w.ground) return groundSpan(w);
    return [Math.max(p.x + 8, EDGE_L + 14), Math.min(p.x + p.w - 8, EDGE_R - 14)];
  }
  CI.standSpan = standSpan;
  // How far sideways a full jump carries you while rising dy and still landing.
  function reachUp(dy) {
    var td = Math.sqrt(Math.max(0, 2 * (CI.APEX - dy) / (PH.grav * PH.fallMul)));
    return PH.run * (PH.jump / PH.grav + td) * 0.82 - 12;
  }
  function reachDown(dd) { return PH.run * Math.sqrt(2 * dd / (PH.grav * PH.fallMul)) * 0.8 + 30; }
  CI.reachUp = reachUp;
  // A takeoff point in [lo, hi] closest to want and clear of the given blocked spans.
  function freeX(lo, hi, blocks, want) {
    var best = null;
    for (var x = lo; x <= hi + 0.01; x += 4) {
      var ok = true;
      for (var i = 0; i < blocks.length; i++) if (x > blocks[i][0] && x < blocks[i][1]) { ok = false; break; }
      if (ok && (best === null || Math.abs(x - want) < Math.abs(best - want))) best = x;
    }
    return best;
  }
  // One move from platform A to platform B, or null: 'up' (jump straight up through B),
  // 'gap' (a running jump across), 'drop' (Down through A) or 'off' (walk off A's end).
  function edgeOf(w, A, B) {
    if (A === B || B.gone || A.gone) return null;
    var a = standSpan(w, A), b = [B.x + 16, B.x + B.w - 16], dy = A.y - B.y, lo, hi, mid, blocks, x;
    if (B === w.ground) b = standSpan(w, B);
    if (b[0] > b[1]) return null;
    if (dy > 8) {
      if (dy > 136) return null;
      lo = Math.max(a[0], b[0]); hi = Math.min(a[1], b[1]);
      if (lo <= hi) {
        var apex = A.y - CI.APEX + 6;
        blocks = w.plats.filter(function (C) { return C !== A && C !== B && !C.gone && C.y < B.y && C.y > apex; })
          .map(function (C) { return [C.x - HW, C.x + C.w + HW]; });
        mid = (lo + hi) / 2;
        x = freeX(lo, hi, blocks, mid);
        if (x !== null) return { type: 'up', from: A, to: B, tx: x };
      }
      return gapEdge(w, A, B, a, dy);
    }
    if (dy < -8) {
      lo = Math.max(a[0], b[0]); hi = Math.min(a[1], b[1]);
      if (A.one && !A.noDrop && lo <= hi) {
        blocks = w.plats.filter(function (C) { return C !== A && C !== B && !C.gone && C.y > A.y && C.y < B.y; })
          .map(function (C) { return [C.x - HW, C.x + C.w + HW]; });
        x = freeX(lo, hi, blocks, (lo + hi) / 2);
        if (x !== null) return { type: 'drop', from: A, to: B, tx: x };
      }
      // Walk off the end that faces B.
      var reach = reachDown(-dy), best = null;
      [-1, 1].forEach(function (dir) {
        var edge = dir > 0 ? A.x + A.w : A.x;
        if (dir > 0 && edge > EDGE_R - 14) return;
        if (dir < 0 && edge < EDGE_L + 14) return;
        if (A === w.roof && (w.house.side < 0 ? dir < 0 : dir > 0)) return;
        var land = edge + dir * (HW + 18), lx = clamp(land, b[0], b[1]);
        if (Math.abs(lx - land) > reach) return;
        if ((lx - edge) * dir < -40) return;
        if (!best || Math.abs(lx - land) < Math.abs(best.lx - (best.edge + best.dir * (HW + 18)))) best = { type: 'off', from: A, to: B, dir: dir, tx: edge - dir * 6, lx: lx, edge: edge };
      });
      return best;
    }
    return gapEdge(w, A, B, a, Math.max(0, dy));
  }
  function gapEdge(w, A, B, a, dy) {
    var dir = B.x + B.w / 2 > (A.x + A.w / 2) ? 1 : -1;
    if (A === w.ground) dir = B.x > a[1] ? 1 : B.x + B.w < a[0] ? -1 : dir;
    var tx = dir > 0 ? a[1] : a[0];
    var gap = dir > 0 ? B.x - tx : tx - (B.x + B.w);
    if (gap > reachUp(dy)) return null;
    if (gap < -HW && A !== w.ground) return null;
    var lx = dir > 0 ? B.x + Math.min(42, B.w / 2) : B.x + B.w - Math.min(42, B.w / 2);
    return { type: 'gap', from: A, to: B, dir: dir, tx: tx, lx: lx, rel: lx - B.x };
  }
  CI.edgeOf = edgeOf;
  // A breadth-first route over the platforms; returns the first move.
  function route(w, A, B, m) {
    if (A === B) return null;
    var nodes = w.plats.filter(live), prev = {}, seen = {}, queue = [A];
    seen[A.id] = 1;
    while (queue.length) {
      var u = queue.shift();
      if (u === B) break;
      for (var i = 0; i < nodes.length; i++) {
        var v = nodes[i];
        if (seen[v.id]) continue;
        var e = edgeOf(w, u, v);
        if (!e || (m && m.bad[u.id + '>' + v.id] > w.t)) continue;
        seen[v.id] = 1; prev[v.id] = e; queue.push(v);
      }
    }
    if (!seen[B.id]) return null;
    var e2 = prev[B.id];
    while (e2 && e2.from !== A) e2 = prev[e2.from.id];
    return e2 || null;
  }
  CI.route = route;
  CI.reachable = function (w, A, B) {
    if (A === B) return true;
    var nodes = w.plats.filter(live), seen = {}, queue = [A];
    seen[A.id] = 1;
    while (queue.length) {
      var u = queue.shift();
      if (u === B) return true;
      nodes.forEach(function (v) { if (!seen[v.id] && edgeOf(w, u, v)) { seen[v.id] = 1; queue.push(v); } });
    }
    return !!seen[B.id];
  };
  function hops(w, A, B) {
    if (A === B) return 0;
    var nodes = w.plats.filter(live), dist = {}, queue = [A];
    dist[A.id] = 0;
    while (queue.length) {
      var u = queue.shift();
      if (u === B) return dist[u.id];
      nodes.forEach(function (v) { if (dist[v.id] == null && edgeOf(w, u, v)) { dist[v.id] = dist[u.id] + 1; queue.push(v); } });
    }
    return dist[B.id] == null ? 99 : dist[B.id];
  }

  // Where each known warning makes it unsafe to stand: x spans (islander centres), for
  // which surfaces, and when.
  function zonesFor(w, a, m) {
    var out = [], t = w.t, pad = HW + 10;
    for (var i = 0; i < w.haz.length; i++) {
      var h = w.haz[i];
      if (m.seen[h.id] == null) { m.seen[h.id] = t; if (m.rand() < m.slip) m.skip[h.id] = 1; }
      if (m.skip[h.id] || t - m.seen[h.id] < m.react) continue;
      if (h.k === 'drop' && h.state !== 'land') out.push({ lo: h.x - h.r - pad, hi: h.x + h.r + pad, t0: h.impact - h.fallT - 0.1, t1: h.impact + 0.08, top: h.surf });
      else if (h.k === 'zap') out.push({ lo: h.x - h.hw - pad, hi: h.x + h.hw + pad, t0: h.fire - 0.1, t1: h.end + 0.05, all: true });
      else if (h.k === 'ball') {
        var n = 0;
        for (var k = 0; k < h.lands.length && n < 2; k++) {
          var L = h.lands[k];
          if (L.t < t - 0.05) continue;
          n++;
          var back = L.x - h.dir * h.vx * 0.26;
          out.push({ lo: Math.min(L.x, back) - h.r - pad, hi: Math.max(L.x, back) + h.r + pad, t0: L.t - 0.32, t1: L.t + 0.06, surfY: L.y });
        }
      } else if (h.k === 'crack' && !h.fell) out.push({ lo: -BIG, hi: BIG, t0: h.fall - 1.6, t1: h.fall + 0.1, plat: h.plat });
      else if (h.k === 'twister') out.push({ lo: h.x - h.hw - pad - 40, hi: h.x + h.hw + pad + 40, t0: h.enter - 0.5, t1: BIG, all: true, twister: true });
    }
    return out;
  }
  function zoneOn(z, p, w) {
    if (z.plat) return z.plat === p;
    if (z.all) return true;
    if (z.surfY != null) return Math.abs(p.y - z.surfY) < 2;
    return p.y <= z.top + 1;
  }
  function unsafe(zones, p, x, t, horizon, w, a) {
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (z.t0 - t > horizon || z.t1 < t) continue;
      if (z.twister && w.door && p === w.ground && x > w.house.x0 + 8 && x < w.house.x1 - 8) continue;
      if (zoneOn(z, p, w) && x > z.lo && x < z.hi) return true;
    }
    return false;
  }
  // The nearest safe spot on platform p (prefer one near want), or null.
  function safeSpot(w, a, zones, p, want, horizon) {
    var s = standSpan(w, p), best = null, bd = BIG;
    if (s[0] > s[1]) return null;
    for (var x = s[0]; x <= s[1] + 0.01; x += 6) {
      if (unsafe(zones, p, x, w.t, horizon, w, a)) continue;
      var d = Math.abs(x - want);
      if (d < bd) { bd = d; best = x; }
    }
    return best;
  }
  // The best spot on the platform someone stands on, minding when each danger strikes: no
  // ending up in (or running through) a spot that is hit within `now` seconds; spots hit
  // later only cost extra, since there is time to move again.
  var ESC = [];
  function bestSpot(w, a, zones, p, want, now) {
    var s = standSpan(w, p), t = w.t, best = null, bc = BIG, run = PH.run * (w.ice ? 0.7 : 0.92), n = 0;
    if (s[0] > s[1]) return null;
    for (var i = 0; i < zones.length; i++) { var z0 = zones[i]; if (z0.t1 >= t && zoneOn(z0, p, w) && !(z0.twister && w.door && p === w.ground)) ESC[n++] = z0; }
    for (var x = s[0]; x <= s[1] + 0.01; x += 6) {
      var cost = Math.abs(x - want) + Math.abs(x - a.x) * 0.1, bad = false, lo = Math.min(a.x, x), hi = Math.max(a.x, x);
      for (var k = 0; k < n && !bad; k++) {
        var z = ESC[k], soon = z.t0 - t <= now;
        if (soon) {
          if (x > z.lo && x < z.hi) bad = true;
          else if (hi > z.lo && lo < z.hi) {
            // Time spent inside the zone on the way.
            var enter = t + Math.max(0, x > a.x ? z.lo - a.x : a.x - z.hi) / run + 0.05;
            var leave = t + (x > a.x ? Math.min(x, z.hi) - a.x : a.x - Math.max(x, z.lo)) / run + 0.12;
            if (enter < z.t1 && leave > z.t0) bad = true;
          }
        } else if (x > z.lo && x < z.hi) cost += 260 + 120 * Math.max(0, 2.6 - (z.t0 - t));
      }
      if (!bad && cost < bc) { bc = cost; best = x; }
    }
    return best;
  }
  function houseX(w, a) { var h = w.house; return (h.x0 + h.x1) / 2 + ((a.i % 3) - 1) * 34; }
  function platsDry(w, level) {
    return w.plats.filter(function (p) { return !p.gone && p.y <= level - 2 && p !== w.ground; });
  }
  // The place the round's disasters ask for (before dodging what falls on it).
  function baseGoal(w, a, m) {
    var kinds = (w.phase === 'card' || w.phase === 'live') ? CI.current(w) : [], cur = a.ground || w.ground;
    if (kinds.indexOf('flood') >= 0) {
      var levels = w.isl.jelly.slice(0, kinds[0] === 'flood' ? w.T.jellySteps : Math.max(1, w.T.jellySteps - 2));
      if (m.floodAim == null) {
        // A computer islander sometimes settles for a spot that a later rise will still cover.
        m.floodAim = levels[levels.length - 1];
        if (m.bot && m.rand() < m.slip * 1.5) m.floodAim = levels[Math.min(levels.length - 1, m.rand() < 0.5 ? 0 : 1)];
      }
      var line0 = w.jelly.line || (w.jelly.target < GROUND ? w.jelly.target : GROUND);
      if (m.floodAim > line0 - 2) m.floodAim = levels.filter(function (L) { return L < line0 - 2; })[0] || levels[levels.length - 1];
      if (!m.pickFlood || m.pickFlood.gone || m.pickFlood.y > m.floodAim - 2) {
        var aimLevel = m.floodAim;
        var dry = platsDry(w, aimLevel), best = null, bh = BIG;
        dry.forEach(function (p) {
          var d = hops(w, cur, p) + w.actors.filter(function (o) { return o !== a && o.ground === p; }).length * 0.6 + (p.amp ? 0.5 : 0) + m.rand() * 0.3;
          if (d < bh) { bh = d; best = p; }
        });
        if (best && (!m.pickFlood || best !== m.pickFlood)) m.pickFlood = best;
      }
      if (m.pickFlood) {
        // Keep climbing when the line shows the spot is about to go under.
        var line = w.jelly.line || w.jelly.target;
        if (m.pickFlood.y > line - 2 && line < GROUND) m.pickFlood = null;
        else return { p: m.pickFlood, x: m.pickFlood.x + m.pickFlood.w / 2 + ((a.i % 3) - 1) * 18, tol: 14 };
      }
    }
    if (kinds.indexOf('tornado') >= 0 || (kinds.indexOf('wind') >= 0 && (!m.bot || m.holdWind === false))) return { p: w.ground, x: houseX(w, a), tol: 16, house: true };
    if (kinds.indexOf('wind') >= 0) {
      if (m.holdWind === null) m.holdWind = m.rand() < 0.5;
      if (!m.holdWind) return { p: w.ground, x: houseX(w, a), tol: 16, house: true };
      if (m.holdX == null) m.holdX = clamp(a.x, 420, 860);
      return { p: w.ground, x: m.holdX, tol: 50, hold: true };
    }
    if (kinds.indexOf('ice') >= 0) {
      var safe = w.plats.filter(function (p) { return p.one && p !== w.roof && !p.gone && !p.amp; }), pb = null, pd = BIG;
      safe.forEach(function (p) { var d = hops(w, cur, p) * 100 + Math.abs(p.x + p.w / 2 - a.x) * 0.2 + (p.w < 100 ? 30 : 0); if (d < pd) { pd = d; pb = p; } });
      if (pb) return { p: pb, x: pb.x + pb.w / 2, tol: 8, ice: true };
    }
    if (kinds.length) {
      var gx = a.ground === w.ground ? a.x : clamp(a.x, 420, 860);
      if (!m.bot) gx = clamp(gx, groundSpan(w)[0] + 120, groundSpan(w)[1] - 120);
      return { p: w.ground, x: gx, tol: 40 };
    }
    return null;
  }
  // A computer islander between rounds (or on the title island) wanders and hops about.
  function wanderGoal(w, a, m) {
    if (w.t > m.wander || !m.wgoal || m.wgoal.p.gone) {
      m.wander = w.t + 2.5 + m.rand() * 4;
      var opts = w.plats.filter(function (p) { return !p.gone && (w.demo || p !== w.roof); });
      var p = m.rand() < 0.45 ? w.ground : opts[Math.floor(m.rand() * opts.length) % opts.length], s = standSpan(w, p);
      m.wgoal = { p: p, x: s[0] + m.rand() * (s[1] - s[0]), tol: 20 };
    }
    return m.wgoal;
  }
  function decide(w, a, m) {
    var zones = zonesFor(w, a, m), cur = a.ground, goal = baseGoal(w, a, m);
    if (!goal && m.bot) goal = w.phase === 'idle' || w.phase === 'clear' || w.phase === 'card' ? wanderGoal(w, a, m) : null;
    // Coins: when nothing threatens, a computer islander goes for one nearby.
    if (m.coins && goal && !goal.house && !goal.ice && w.phase === 'live' && w.coins.length && cur) {
      var near = null;
      w.coins.forEach(function (c) {
        if (c.plat !== cur && !(goal.p === w.ground && c.plat === w.ground)) return;
        if (Math.abs(c.x - a.x) > 420 || unsafe(zones, c.plat, c.x, w.t, 2, w, a)) return;
        if (!near || Math.abs(c.x - a.x) < Math.abs(near.x - a.x)) near = c;
      });
      if (near && (!goal.p || goal.p === near.plat || kindsNone(w, 'flood'))) goal = { p: near.plat, x: near.x, tol: 6 };
    }
    m.esc = null; m.zones = zones;
    if (goal && goal.p === cur) {
      var bx = bestSpot(w, a, zones, cur, goal.x, 1.25);
      if (bx === null) bx = safeSpot(w, a, zones, cur, goal.x, 1.25);
      if (bx === null && cur !== w.ground) goal = { p: w.ground, x: a.x, tol: 10 };
      else if (bx !== null && (Math.abs(bx - goal.x) > 3 || unsafe(zones, cur, goal.x, w.t, 1.25, w, a))) goal = { p: cur, x: bx, tol: Math.abs(bx - goal.x) > 3 ? 5 : goal.tol, house: goal.house, ice: goal.ice, hold: goal.hold };
    } else if (goal) {
      var sx = safeSpot(w, a, zones, goal.p, goal.x, 2.2);
      if (sx === null && goal.p !== w.ground) goal = { p: w.ground, x: a.x, tol: 20 };
      else if (sx !== null && sx !== goal.x) goal = { p: goal.p, x: sx, tol: 6, house: goal.house, ice: goal.ice, hold: goal.hold };
      // On the way somewhere else but about to be hit here: step aside first, or leave.
      if (cur && unsafe(zones, cur, a.x, w.t, 1.4, w, a)) {
        var ex = bestSpot(w, a, zones, cur, a.x, 1.25);
        if (ex === null) ex = safeSpot(w, a, zones, cur, a.x, 1.25);
        if (ex !== null) m.esc = { p: cur, x: ex };
        else if (cur !== w.ground) { var gx = safeSpot(w, a, zones, w.ground, a.x, 1.4); goal = { p: w.ground, x: gx === null ? a.x : gx, tol: 10 }; }
      }
    }
    m.goal = goal;
  }
  function kindsNone(w, k) { return CI.current(w).indexOf(k) < 0; }
  // Walk towards x and stop there (braking early, and against the slide on ice).
  function walkTo(w, a, x, tol, inp) {
    var dx = x - a.x, icy = w.ice && a.ground, dec = PH.dec * (icy ? w.T.slide : 1), acc = PH.acc * (icy ? w.T.grip : 1);
    if (Math.abs(dx) <= tol) {
      if (icy && Math.abs(a.vx) > 25) { if (a.vx > 0) inp.l = 1; else inp.r = 1; }
      return;
    }
    var dir = sign(dx), stop = sign(a.vx) === dir ? a.vx * a.vx / (2 * (icy ? acc : dec)) : 0;
    if (stop > Math.abs(dx) - tol * 0.5) { if (icy) { if (dir > 0) inp.l = 1; else inp.r = 1; } return; }
    if (dir > 0) inp.r = 1; else inp.l = 1;
  }
  function steer(a, x, inp, tol) {
    var dx = x - (a.x + a.vx * 0.06);
    if (dx > (tol || 6)) inp.r = 1; else if (dx < -(tol || 6)) inp.l = 1;
  }
  // The child's (or computer islander's) keys for this frame.
  CI.think = function (w, a, m) {
    var inp = { l: 0, r: 0, up: 0, down: 0 };
    if (!m) return inp;
    if (a.ghost) {
      m.gt -= w.dt;
      if (m.gt <= 0) { m.gt = 1.5 + m.rand() * 2; m.gx = 160 + m.rand() * 960; m.gy = 180 + m.rand() * 260; }
      if (Math.abs(m.gx - a.x) > 20) { if (m.gx > a.x) inp.r = 1; else inp.l = 1; }
      if (Math.abs(m.gy - a.y) > 20) { if (m.gy > a.y) inp.down = 1; else inp.up = 1; }
      return inp;
    }
    if (w.phase === 'done') return inp;
    // Now and then a computer islander forgets the danger and dances, naps or runs about.
    if (m.bot && w.phase === 'live') {
      if (m.goofT > 0) {
        m.goofT -= w.dt;
        if (a.ground && m.goof === 'dance') inp.up = a.upPrev ? 0 : 1;
        else if (m.goof === 'run') { if (a.x < EDGE_L + 60) m.goofDir = 1; if (a.x > EDGE_R - 60) m.goofDir = -1; if (m.goofDir > 0) inp.r = 1; else inp.l = 1; }
        return inp;
      }
      if (m.rand() < w.T.goof * w.dt) { m.goofT = 1.4 + m.rand() * 1.6; m.goof = ['dance', 'nap', 'run'][Math.floor(m.rand() * 3) % 3]; m.goofDir = m.rand() < 0.5 ? -1 : 1; }
    } else m.goofT = 0;
    m.tick -= w.dt;
    if (m.tick <= 0) { m.tick = 0.1; decide(w, a, m); }
    var cur = a.ground;
    // Hop over a snowball rolling this way.
    if (cur) {
      for (var i = 0; i < w.haz.length; i++) {
        var h = w.haz[i];
        if (h.k !== 'snow' || w.t < h.enter || m.skip[h.id]) continue;
        if (Math.abs(h.y + h.r - a.y) > 10 || sign(a.x - h.x) !== sign(h.vx)) continue;
        // Jump towards it, so it rolls under quickly.
        var gap = Math.abs(a.x - h.x) - h.r - HW;
        if (gap < 40 + Math.abs(h.vx) * 0.15 && gap > -10) {
          inp.up = a.upPrev ? 0 : 1; m.edge = null; m.snowJump = w.t; m.snowDir = sign(h.x - a.x);
          if (m.snowDir > 0) inp.r = 1; else inp.l = 1;
          return inp;
        }
      }
    } else if (m.snowJump && w.t - m.snowJump < 0.55) { inp.up = a.vy < 0 ? 1 : 0; if (m.snowDir > 0) inp.r = 1; else inp.l = 1; return inp; }
    if (!cur) return airSteer(w, a, m, inp);
    m.edge = null;
    if (m.esc && m.esc.p === cur) { walkTo(w, a, m.esc.x, 6, inp); return inp; }
    var g = m.goal;
    if (!g) { walkTo(w, a, a.x, 4, inp); return inp; }
    if (g.p === cur) {
      walkTo(w, a, g.x, g.tol || 6, inp);
      // Lean into a gust.
      if (g.hold && w.wind.dir && (w.wind.prof > 0 || w.t >= w.wind.warn + m.react && w.t < w.wind.end)) {
        inp.l = inp.r = 0;
        if (w.wind.dir > 0) inp.l = 1; else inp.r = 1;
      }
      return inp;
    }
    var e = route(w, cur, g.p, m);
    if (!e) { walkTo(w, a, g.p === w.ground ? g.x : a.x, 8, inp); return inp; }
    var key = cur.id + '>' + e.to.id;
    if (m.edgeKey !== key) { m.edgeKey = key; m.edgeT = w.t; }
    else if (w.t - m.edgeT > 3) { m.bad[key] = w.t + 4; m.edgeKey = ''; }
    m.plan = e;
    if (e.type === 'up') {
      if (Math.abs(a.x - e.tx) > 7 || Math.abs(a.vx) > 150) walkTo(w, a, e.tx, 5, inp);
      else { inp.up = a.upPrev ? 0 : 1; m.edge = e; }
    } else if (e.type === 'gap') {
      var past = (a.x - e.tx) * e.dir;
      if (past >= -8) { inp.up = a.upPrev ? 0 : 1; if (e.dir > 0) inp.r = 1; else inp.l = 1; m.edge = e; }
      else if (e.dir > 0) inp.r = 1; else inp.l = 1;
    } else if (e.type === 'drop') {
      if (Math.abs(a.x - e.tx) > 7) walkTo(w, a, e.tx, 5, inp);
      else { inp.down = a.downPrev ? 0 : 1; m.edge = e; }
    } else {
      if (e.dir > 0) inp.r = 1; else inp.l = 1;
      m.edge = e;
    }
    return inp;
  };
  function airSteer(w, a, m, inp) {
    var e = m.edge, g = m.goal;
    if (e && !e.to.gone) {
      var B = e.to, lx;
      if (e.type === 'gap') lx = B.x + e.rel;
      else if (e.type === 'off') lx = clamp(e.lx, B.x + 16, B.x + B.w - 16);
      else lx = clamp(a.x, B.x + 18, B.x + B.w - 18);
      if (e.type === 'up' || e.type === 'gap') inp.up = a.vy < 0 ? 1 : 0;
      // Over the target already: stop drifting past it.
      steer(a, lx, inp, 6);
      return inp;
    }
    if (g) {
      var tx = g.x;
      if (m.esc) tx = m.esc.x;
      steer(a, tx, inp, 10);
    }
    return inp;
  }
})();
