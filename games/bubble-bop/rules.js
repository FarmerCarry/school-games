/* Bubble Bop (فقاعات بوب) rules: the tuning tables, the world simulation, forgiving
 * hit tests, stars, round ids, rewards and saves.
 * Pure: no DOM, no Kit, no timers and no Math.random (a world takes a seed), so the
 * Node test loads this file with { window: {} } and plays whole levels with fake input.
 * game.js reads the DDA tier, builds a plan, steps the world with the child's input
 * and turns the world's events into pictures, sound and statistics. */
(function () {
  'use strict';
  var BB = window.BB = window.BB || {};
  var W = 1280, H = 720;
  BB.W = W; BB.H = H;
  BB.TIERS = 5;
  BB.LEVELS = 3;          // per world, plus one party round
  BB.PARTY_SECONDS = 60;
  BB.WAVE_SECONDS = 15;   // a party gets faster every 15 s
  BB.BOP_R = 42;          // Bop's body radius
  BB.COMBO_WINDOW = 1.6;  // s between two pops that keep a combo going

  // Worlds 1-4 teach one input each and world 5 mixes them; worlds 6-10 teach five more
  // (drag, double click, press and hold, all four arrows, letter keys) and world 11 mixes those.
  BB.WORLDS = [
    { mode: 'touch', scene: 'sea' },
    { mode: 'tap', scene: 'sky' },
    { mode: 'jump', scene: 'pond' },
    { mode: 'catch', scene: 'orchard' },
    { mode: 'mix', scene: 'party' },
    { mode: 'drag', scene: 'beach' },
    { mode: 'dbl', scene: 'reef' },
    { mode: 'hold', scene: 'garden' },
    { mode: 'steer', scene: 'deep' },
    { mode: 'keys', scene: 'dusk' },
    { mode: 'grand', scene: 'carnival' }
  ];
  BB.N = BB.WORLDS.length;
  BB.MODES = ['touch', 'tap', 'jump', 'catch'];
  BB.MODES2 = ['drag', 'dbl', 'hold', 'steer', 'keys'];
  BB.MIXES = { mix: BB.MODES, grand: BB.MODES2 };

  // The frog's pond and the basket's orchard, in logical pixels.
  BB.FROG = { x: 640, ground: 598, h: 96, v: 1020, g: 2900, tongue: 86 };
  // A firefly this many catch windows from the frog lights the Space bar: time to jump.
  BB.NEAR = 1.3;
  BB.BASKET = { y: 604, ground: 676 };
  // On-screen keys that light up with the real ones (art draws them, game clicks them).
  BB.KEYS = {
    space: { x: 640, y: 676, w: 460, h: 62 },
    left: { x: 86, y: 650, w: 112, h: 84 },
    right: { x: 1194, y: 650, w: 112, h: 84 },
    mouse: { x: 1206, y: 636, w: 76, h: 104 },
    // all four arrows (world 9): an inverted T at the bottom right, where it is on a real keyboard
    up: { x: 1126, y: 572, w: 92, h: 70 },
    down: { x: 1126, y: 650, w: 92, h: 70 },
    west: { x: 1026, y: 650, w: 92, h: 70 },
    east: { x: 1226, y: 650, w: 92, h: 70 }
  };
  // The bubble wand (world 8), the submarine (world 9) and the play area it steers in.
  BB.WAND = { x: 640, y: 330 };
  BB.SUB = { r: 46, x0: 70, x1: 1210, y0: 132, y1: 486 };

  // The letter keys (world 10), one entry per key as the school's keyboards print it
  // (Windows Arabic 101): the code the key sends in either input language, its Latin
  // legend (large, top left) and its Arabic letter (bottom right). Adjust labels here only.
  BB.KEY_LABELS = {
    KeyQ: ['Q', 'ض'], KeyW: ['W', 'ص'], KeyE: ['E', 'ث'], KeyR: ['R', 'ق'], KeyT: ['T', 'ف'], KeyY: ['Y', 'غ'],
    KeyU: ['U', 'ع'], KeyI: ['I', 'ه'], KeyO: ['O', 'خ'], KeyP: ['P', 'ح'], BracketLeft: ['[', 'ج'], BracketRight: [']', 'د'],
    KeyA: ['A', 'ش'], KeyS: ['S', 'س'], KeyD: ['D', 'ي'], KeyF: ['F', 'ب'], KeyG: ['G', 'ل'], KeyH: ['H', 'ا'],
    KeyJ: ['J', 'ت'], KeyK: ['K', 'ن'], KeyL: ['L', 'م'], Semicolon: [';', 'ك'], Quote: ["'", 'ط'],
    KeyZ: ['Z', 'ئ'], KeyX: ['X', 'ء'], KeyC: ['C', 'ؤ'], KeyV: ['V', 'ر'], KeyB: ['B', 'لا'], KeyN: ['N', 'ى'],
    KeyM: ['M', 'ة'], Comma: [',', 'و'], Period: ['.', 'ز'], Slash: ['/', 'ظ']
  };
  BB.latin = function (code) { return (BB.KEY_LABELS[code] || '')[0] || ''; };
  BB.arabic = function (code) { return (BB.KEY_LABELS[code] || '')[1] || ''; };
  // The three letter rows as printed, with the stagger of a real keyboard (in key widths).
  BB.KB_ROWS = [
    { off: 1.5, codes: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'] },
    { off: 1.75, codes: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'] },
    { off: 2.25, codes: ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'] }
  ];
  BB.KB = { x: 145, y: 488, u: 66, cap: 58, rows: 3 };
  // Where a key sits on the on-screen keyboard (its centre, logical pixels).
  BB.keyAt = function (code) {
    for (var r = 0; r < BB.KB_ROWS.length; r++) {
      var i = BB.KB_ROWS[r].codes.indexOf(code);
      if (i >= 0) return { x: BB.KB.x + (BB.KB_ROWS[r].off + i + 0.5) * BB.KB.u, y: BB.KB.y + (r + 0.5) * BB.KB.u, row: r };
    }
    return null;
  };
  // The letters a balloon may carry: never P or M (they pause and mute), never Esc or Space.
  // Tier 1 only has F and J (the keys with bumps), then the home row, then the rows above and below.
  var FJ = ['KeyF', 'KeyJ'], DK = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'], HOME8 = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'];
  var HOME = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'];
  var TOP = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO'], TOPI = ['KeyR', 'KeyT', 'KeyY', 'KeyU'];
  var BOT = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'Comma'], BOTI = ['KeyV', 'KeyB', 'KeyN'];
  BB.LETTER_SETS = [
    [FJ, FJ, FJ],
    [DK, HOME8, HOME],
    [HOME, HOME.concat(TOPI), HOME.concat(TOP)],
    [HOME.concat(TOP), HOME.concat(TOP, BOTI), HOME.concat(TOP, BOT)],
    [HOME.concat(TOP), HOME.concat(TOP, BOT), HOME.concat(TOP, BOT)]
  ];
  BB.letters = function (tier, lv) { return BB.LETTER_SETS[tierOf(tier) - 1][lv === 'P' ? 2 : clamp(lv | 0, 0, 2)]; };

  // One entry per DDA tier: 1 is tuned for a six-year-old who has never held a mouse,
  // 5 is a brisk challenge for a ten-year-old. BB.HARDER says which way each knob moves
  // as the tiers get harder; tools/tests/bubble-bop-rules.test.mjs checks every row.
  BB.TUNE = {
    touch: {
      r: [66, 58, 50, 43, 37],            // bubble art radius
      margin: [26, 20, 14, 10, 6],        // hit reach beyond the art (and Bop's body)
      speed: [42, 60, 82, 108, 138],      // drift up, px/s
      live: [2, 3, 3, 4, 5],              // bubbles on screen at once
      gap: [1.5, 1.25, 1, 0.82, 0.68],    // s between new bubbles
      magnet: [170, 125, 88, 56, 30],     // strongest pull towards a moving Bop, px/s
      reach: [240, 205, 170, 140, 115],   // pull range beyond touching, px
      wait: [999, 8, 5.5, 3.8, 2.6],      // s a bubble waits near the top, then floats away
      spread: [380, 480, 620, 820, 1280], // how far from Bop a new bubble may start, px
      sway: [14, 22, 32, 44, 56],         // side-to-side wobble, px
      gold: [0.05, 0.07, 0.09, 0.11, 0.13], // share of gold bubbles in a party
      par: [6, 4.6, 3.6, 2.9, 2.3],       // s per bubble for the pace star
      extra: [0, 3, 6, 9, 12]             // more bubbles per level
    },
    tap: {
      r: [70, 61, 53, 46, 40],
      margin: [46, 36, 27, 19, 12],
      live: [1, 2, 2, 3, 4],
      gap: [1.1, 0.95, 0.8, 0.68, 0.56],
      life: [999, 9, 6.5, 5, 4],          // s before a balloon floats away
      drift: [0, 10, 26, 44, 64],         // sideways wander, px/s
      bob: [8, 11, 15, 19, 24],           // up-and-down bob, px
      magnet: [80, 62, 45, 28, 14],       // pull towards a moving pointer, px/s
      reach: [210, 180, 150, 120, 95],
      spread: [420, 520, 640, 820, 1280],
      gold: [0.05, 0.07, 0.09, 0.11, 0.13],
      par: [5, 3.8, 3, 2.4, 1.9],
      extra: [0, 2, 4, 6, 8]
    },
    jump: {
      speed: [140, 170, 200, 240, 290],   // fly speed, px/s
      window: [140, 118, 100, 86, 74],     // how far beside the frog a fly is still caught, px
      slow: [0, 0.34, 0.48, 0.62, 0.75],   // speed share while passing the frog (0: it waits)
      wait: [999, 0, 0, 0, 0],            // s a fly waits above the frog
      buffer: [0.5, 0.4, 0.3, 0.22, 0.16], // s a press in the air is kept for the next jump
      anyKey: [1, 0, 0, 0, 0],            // 1: any key or a click on the Space bar jumps
      live: [1, 1, 2, 2, 3],
      gap: [1.3, 1.15, 1, 0.85, 0.7],
      spread: [340, 420, 500, 580, 680],  // how far from the frog a fly appears
      zig: [6, 12, 20, 28, 36],           // up-and-down flutter, px
      gold: [0.05, 0.07, 0.09, 0.11, 0.13],
      par: [5, 3.6, 2.8, 2.2, 1.8],
      extra: [0, 2, 4, 6, 8]
    },
    catch: {
      hw: [125, 106, 90, 77, 65],         // half the basket's catching width
      fall: [90, 125, 165, 210, 260],     // fruit speed, px/s
      basket: [560, 600, 650, 700, 760],  // basket top speed, keeps pace with the fruit
      magnet: [150, 110, 76, 46, 22],     // sideways pull into the basket, px/s
      reach: [260, 220, 185, 150, 120],
      live: [1, 1, 2, 2, 3],
      gap: [1.3, 1.1, 0.95, 0.8, 0.66],
      spread: [360, 480, 620, 820, 1280], // how far from the basket a fruit may fall
      sway: [0, 10, 20, 34, 50],
      gold: [0.05, 0.07, 0.09, 0.11, 0.13],
      par: [6, 4.2, 3.2, 2.6, 2.1],
      extra: [0, 2, 4, 6, 8]
    },
    // World 6: press on a baby turtle, hold, move it to its pool and let go.
    drag: {
      r: [60, 54, 49, 45, 41],            // turtle art radius
      grab: [56, 42, 30, 20, 12],         // a press this far beyond the art still picks it up
      pool: [96, 88, 80, 72, 64],         // home pool radius
      snap: [92, 70, 52, 36, 22],         // a turtle let go this far outside its pool still slides in
      pull: [0.55, 0.42, 0.3, 0.18, 0.08], // how much a carried turtle leans into its pool when near
      dist: [300, 380, 470, 560, 660],    // how far from its pool a turtle hatches, px
      sort: [0, 1, 1, 2, 2],              // more pool colours per level
      move: [0, 0, 0, 16, 28],            // pools drift in levels 2 and 3, px/s
      sticky: [1, 0, 0, 0, 0],            // 1: a click also picks a turtle up and a click puts it down
      live: [1, 1, 2, 2, 3],
      gap: [1, 0.9, 0.8, 0.7, 0.6],
      gold: [0.05, 0.07, 0.09, 0.11, 0.13],
      par: [8, 6, 4.8, 4, 3.4],
      extra: [0, 1, 2, 3, 4]
    },
    // World 7: two quick clicks open a clam and show its pearl.
    dbl: {
      r: [70, 62, 55, 49, 44],            // clam art radius (half its width)
      margin: [44, 32, 22, 14, 8],
      dbl: [1.2, 0.9, 0.7, 0.55, 0.4],    // s allowed between the two clicks
      slack: [999, 80, 54, 34, 20],       // px the second click may drift from the first
      live: [1, 2, 2, 3, 3],
      gap: [1.1, 0.95, 0.8, 0.7, 0.6],
      life: [999, 10, 7.5, 6, 5],         // s before a clam closes and digs into the sand
      gold: [0.05, 0.07, 0.09, 0.11, 0.13],
      par: [5, 3.8, 3, 2.5, 2.1],
      extra: [0, 2, 3, 4, 5]
    },
    // World 8: hold the button (or Space) to blow a bubble; let go when it fills the ring.
    hold: {
      tol: [44, 34, 26, 19, 14],          // half the width of the ring's band, px of radius
      grow: [78, 90, 102, 116, 130],      // how fast the bubble grows, px of radius per s
      slow: [0.45, 0.6, 0.72, 0.86, 1],   // growth share while the bubble is in the band
      pulse: [0, 0, 6, 10, 14],           // the ring breathes in level 3, px
      gap: [0.9, 0.8, 0.7, 0.6, 0.5],
      gold: [0.05, 0.07, 0.09, 0.11, 0.13],
      par: [6, 4.6, 3.8, 3.2, 2.7],
      extra: [0, 1, 2, 3, 4]
    },
    // World 9: steer a submarine with all four arrows (or WASD) to the starfish.
    steer: {
      sub: [180, 220, 260, 300, 340],     // top speed, px/s
      r: [36, 33, 30, 28, 26],            // starfish art radius
      margin: [44, 36, 28, 22, 16],       // reach beyond the art and the submarine
      magnet: [140, 95, 60, 30, 10],      // pull towards a moving submarine, px/s
      reach: [190, 160, 130, 100, 80],
      dist: [300, 340, 390, 440, 500],    // how far from the submarine the next starfish appears
      coral: [0, 1, 2, 3, 4],             // soft coral walls in levels 2 and 3
      life: [999, 14, 10, 8, 6.5],
      live: [1, 1, 2, 2, 3],
      gap: [0.8, 0.7, 0.62, 0.55, 0.48],
      gold: [0.05, 0.07, 0.09, 0.11, 0.13],
      par: [6, 4.6, 3.7, 3.1, 2.6],
      extra: [0, 2, 3, 4, 5]
    },
    // World 10: a balloon carries a keycap; pressing that key pops it.
    keys: {
      r: [52, 48, 44, 41, 38],            // balloon radius
      cap: [86, 80, 74, 68, 62],          // keycap size
      live: [1, 1, 2, 2, 3],
      gap: [1.3, 1.1, 0.95, 0.8, 0.68],
      life: [999, 12, 9, 7, 5.5],         // s before a balloon floats away
      drift: [0, 8, 16, 26, 36],
      gold: [0.05, 0.07, 0.09, 0.11, 0.13],
      par: [5, 3.6, 2.8, 2.2, 1.8],
      extra: [0, 2, 4, 6, 8]
    }
  };
  // +1: grows with the tier, -1: shrinks with the tier.
  BB.HARDER = { r: -1, margin: -1, speed: 1, live: 1, gap: -1, magnet: -1, reach: -1, wait: -1, spread: 1, sway: 1,
    gold: 1, par: -1, extra: 1, life: -1, drift: 1, bob: 1, window: -1, slow: 1, buffer: -1, anyKey: -1, zig: 1,
    hw: -1, fall: 1, basket: 1, grab: -1, pool: -1, snap: -1, pull: -1, dist: 1, sort: 1, move: 1, sticky: -1,
    dbl: -1, slack: -1, tol: -1, grow: 1, pulse: 1, sub: 1, coral: 1, cap: -1 };
  // Targets per level (before the tier's extra), and per mode in a world-5 or world-11 level.
  BB.GOALS = { touch: [8, 12, 16], tap: [6, 9, 12], jump: [5, 7, 9], catch: [5, 7, 9], mix: [3, 4, 5],
    drag: [4, 6, 8], dbl: [5, 7, 9], hold: [4, 6, 8], steer: [5, 7, 9], keys: [5, 8, 10], grand: [2, 3, 4] };
  // Seconds a target of the newer modes takes beyond its spawn gap, for a party's expected pops.
  BB.COST = { drag: 1.6, dbl: 0.6, hold: 1.4, steer: 1.2, keys: 0.5 };
  // At most this many on screen at once, even in a party's fastest wave.
  BB.MAX_LIVE = { drag: 4, dbl: 5, hold: 1, steer: 4, keys: 4 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function tierOf(t) { t = Math.round(Number(t)); return t >= 1 && t <= BB.TIERS ? t : 1; }
  BB.clamp = clamp;

  // Seeded random numbers (mulberry32), so a level replays exactly in tests.
  BB.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* --------------------------------------------------------------- ids */
  // 'w1L1'..'w11L3' for levels and 'w1P'..'w11P' for party rounds.
  BB.roundId = function (w, l) { return 'w' + (w + 1) + (l === 'P' ? 'P' : 'L' + (l + 1)); };
  BB.ROUND_IDS = [];
  for (var wi = 0; wi < BB.N; wi++) { for (var li = 0; li < 3; li++) BB.ROUND_IDS.push(BB.roundId(wi, li)); BB.ROUND_IDS.push(BB.roundId(wi, 'P')); }

  /* -------------------------------------------------------------- plans */
  // What one try plays: its modes and goals at a tier, the pace par and, for a party, the clock.
  BB.plan = function (w, l, tier) {
    tier = tierOf(tier);
    w = clamp(w | 0, 0, BB.N - 1);
    var party = l === 'P', lv = party ? 0 : clamp(l | 0, 0, 2), wm = BB.WORLDS[w].mode, mix = !!BB.MIXES[wm];
    var modes = mix ? BB.MIXES[wm] : [wm], par = 0, expect = 0;
    var segments = modes.map(function (mode) {
      var t = BB.TUNE[mode];
      // World 11 has five parts, so it adds one target per part only every second tier.
      var goal = party ? 0 : mix ? BB.GOALS[wm][lv] + (wm === 'grand' ? (tier - 1) >> 1 : tier - 1) : BB.GOALS[mode][lv] + t.extra[tier - 1];
      par += goal * t.par[tier - 1] + 2;
      // A party gives each part an equal share of its minute (one part: four waves of it).
      expect += BB.PARTY_SECONDS / modes.length / (t.gap[tier - 1] * 0.62 + (BB.COST[mode] || 0)) * 0.55;
      return { mode: mode, goal: goal };
    });
    return { w: w, l: party ? 'P' : lv, party: party, tier: tier, segments: segments, par: Math.round(par),
      duration: party ? BB.PARTY_SECONDS : 0, expect: Math.round(expect), id: BB.roundId(w, party ? 'P' : lv) };
  };

  /* --------------------------------------------------------- hit tests */
  // Forgiving hit tests: a point within the art radius plus the margin counts.
  BB.touchHit = function (x, y, t, margin) {
    var dx = x - t.x, dy = y - t.y, r = t.r + (margin || 0);
    return dx * dx + dy * dy <= r * r;
  };
  // A balloon is a little taller than wide: its body counts as 1.1 times its radius.
  BB.clickHit = function (x, y, t, margin) {
    var dx = x - t.x, dy = y - t.y, r = t.r * 1.1 + (margin || 0);
    return dx * dx + dy * dy <= r * r;
  };
  // Aim assist: moves t towards (ax, ay), stronger when closer, only inside reach and
  // never closer than stop. It never pushes a target away and moves it at most
  // strength * dt per step, so a target never jumps. Returns the distance moved.
  BB.magnet = function (t, ax, ay, strength, reach, dt, stop) {
    var dx = ax - t.x, dy = ay - t.y, d = Math.sqrt(dx * dx + dy * dy);
    stop = stop > 0 ? stop : 0;
    if (!(d > stop) || !(d <= reach) || !(strength > 0) || !(dt > 0)) return 0;
    var step = Math.min(strength * (0.35 + 0.65 * (1 - d / reach)) * dt, d - stop);
    t.x += dx / d * step;
    t.y += dy / d * step;
    return step;
  };
  // Bop floats after the pointer on a stiff, critically damped spring.
  BB.follow = function (bop, tx, ty, dt) {
    var k = 24, h = dt / 2;
    for (var i = 0; i < 2; i++) {
      bop.vx += (k * k * (tx - bop.x) - 2 * k * bop.vx) * h;
      bop.vy += (k * k * (ty - bop.y) - 2 * k * bop.vy) * h;
      bop.x += bop.vx * h;
      bop.y += bop.vy * h;
    }
  };

  /* ------------------------------------------------------------- world */
  BB.create = function (plan, seed) {
    var w = {
      plan: plan, tier: plan.tier, party: plan.party, rand: BB.rng(seed == null ? 1 : seed),
      t: 0, seg: -1, mode: '', tune: null, segT: 0, segHits: 0, goal: 0, made: 0,
      hits: 0, escapes: 0, missClicks: 0, spawned: 0, score: 0, combo: 0, bestCombo: 0, mult: 1, lastHit: -9,
      wave: 1, over: false, targets: [], next: 1, spawnT: 0, ev: [], activity: 0,
      bop: { x: W / 2, y: H / 2 + 40, vx: 0, vy: 0 },
      frog: { x: BB.FROG.x, y: BB.FROG.ground, vy: 0, air: false, buffer: 0, tongue: 0, tx: 0, ty: 0, jumps: 0 },
      basket: { x: W / 2, vx: 0, hw: 100, squash: 0 },
      px: W / 2, py: H / 2 + 40, known: false,
      // worlds 6-11: the pools, the turtle in hand, the submarine and its corals, the held button
      pools: [], held: 0, carry: 0, down: false, wasHold: false, lastR: 0, lastCode: '',
      sub: { x: W / 2, y: 320, vx: 0, vy: 0, face: 1 }, walls: [], dirs: null,
      px0: 0, py0: 0
    };
    enter(w, 0);
    return w;
  };
  function enter(w, i) {
    var seg = w.plan.segments[i];
    w.seg = i; w.mode = seg.mode; w.tune = BB.TUNE[seg.mode];
    w.segT = 0; w.segHits = 0; w.goal = seg.goal; w.spawnT = 0; w.made = 0; w.held = 0; w.carry = 0;
    w.basket.hw = w.mode === 'catch' ? knob(w, 'hw') : w.basket.hw;
    if (MODE[w.mode].enter) MODE[w.mode].enter(w);
  }
  // A knob for the current mode and tier, with the party's faster waves on top.
  function knob(w, key) {
    var v = w.tune[key][w.tier - 1];
    if (!w.party) return v;
    var k = Math.pow(1.12, w.wave - 1);
    if (key === 'gap') return v * 0.62 / k;
    if (key === 'speed' || key === 'fall') return v * 1.1 * k;
    if (key === 'live') return v + 1 + Math.min(2, w.wave - 1);
    if (key === 'wait' || key === 'life') return Math.min(v, 6.5 / k);
    if (key === 'grow' || key === 'sub') return v * Math.pow(1.06, w.wave - 1);
    return v;
  }
  BB.knob = knob;
  // How many targets may be on screen at once.
  function liveCap(w) { return w.tune.live ? Math.min(knob(w, 'live'), BB.MAX_LIVE[w.mode] || 99) : 1; }

  function make(w, kind, x, y, r) {
    var t = { id: w.next++, kind: kind, x: x, y: y, r: r, age: 0, phase: w.rand() * 6.283, color: Math.floor(w.rand() * 6),
      gold: w.party && w.rand() < knob(w, 'gold'), dead: false };
    w.targets.push(t); w.spawned++; w.made++;
    w.ev.push({ t: 'spawn', kind: kind, id: t.id, x: x, y: y });
    return t;
  }
  function live(w) { var n = 0; for (var i = 0; i < w.targets.length; i++) if (!w.targets[i].dead) n++; return n; }
  // An x within `spread` of `near` but at least `away` from it, clear of other new targets.
  function pickX(w, near, spread, away, edge) {
    var lo = edge, hi = W - edge, i, x, d;
    for (i = 0; i < 10; i++) {
      x = lo + w.rand() * (hi - lo); d = Math.abs(x - near);
      if (d <= spread && d >= away && !crowded(w, x)) return x;
    }
    var side = w.rand() < 0.5 ? -1 : 1;
    d = away + w.rand() * Math.max(0, Math.min(spread, 420) - away);
    x = near + side * d;
    if (x < lo || x > hi) x = near - side * d;
    return clamp(x, lo, hi);
  }
  function crowded(w, x) {
    for (var i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.dead && Math.abs(t.x - x) < t.r * 2.2 + 30 && (t.kind !== 'bubble' || t.y > H - 260) && (t.kind !== 'fruit' || t.y < 260)) return true;
    }
    return false;
  }

  function pop(w, t, by) {
    t.dead = true;
    w.hits++; w.segHits++;
    w.combo = w.t - w.lastHit <= BB.COMBO_WINDOW ? w.combo + 1 : 1;
    w.lastHit = w.t;
    if (w.combo > w.bestCombo) w.bestCombo = w.combo;
    w.mult = w.party ? Math.min(5, 1 + Math.floor(w.combo / 5)) : 1;
    var points = (t.gold ? 5 : 1) * w.mult;
    w.score += points;
    w.ev.push({ t: 'pop', kind: t.kind, id: t.id, x: t.x, y: t.y, r: t.r, gold: t.gold, color: t.color, combo: w.combo,
      mult: w.mult, points: points, by: by, age: t.age, big: !!t.big, type: t.type, br: t.br, critter: t.critter, home: t.home, code: t.code, cap: t.cap });
    // A big bubble bursts into three little ones.
    if (t.big) {
      for (var i = 0; i < 3; i++) {
        var m = make(w, 'bubble', t.x, t.y, t.r * 0.5);
        m.vx = (i - 1) * 260; m.vy = 0; m.hoverY = Math.min(t.y, 300); m.wait = t.wait; m.waited = 0; m.sway = t.sway * 0.5; m.speedK = 1.3; m.mini = true;
        m.gold = false;
      }
    }
  }
  function escape(w, t) {
    t.dead = true;
    w.escapes++; w.combo = 0; w.mult = 1;
    w.ev.push({ t: 'escape', kind: t.kind, id: t.id, x: t.x, y: t.y, r: t.r, color: t.color, type: t.type });
  }
  function vanish(w) {
    for (var i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.dead) { t.dead = true; w.ev.push({ t: 'vanish', kind: t.kind, x: t.x, y: t.y, r: t.r, color: t.color, type: t.type }); }
    }
  }

  /* ------------------------------------------------------------ modes */
  var MODE = {};
  MODE.touch = {
    spawn: function (w) {
      var r = knob(w, 'r'), lv = w.party ? 0 : w.plan.l, big = !w.party && lv === 2 && w.made % 4 === 3;
      var b = make(w, 'bubble', pickX(w, w.bop.x, knob(w, 'spread'), w.party ? 0 : 150, 150), 0, big ? r * 1.3 : w.party && w.rand() < 0.5 ? r * 0.85 : r);
      b.y = H + b.r + 8;
      if (b.gold) b.r = r * 0.8;
      b.hoverY = 190 + w.rand() * 230; b.wait = knob(w, 'wait'); b.waited = 0;
      b.sway = knob(w, 'sway') * [1, 1.8, 2.4][lv]; b.big = big; b.speedK = big ? 0.8 : b.gold ? 1.35 : 1; b.vx = 0;
    },
    update: function (w, dt) {
      var bop = w.bop, margin = knob(w, 'margin'), magnet = knob(w, 'magnet') * w.activity, reach = knob(w, 'reach'), speed = knob(w, 'speed');
      for (var i = 0; i < w.targets.length; i++) {
        var b = w.targets[i];
        if (b.dead) continue;
        b.age += dt;
        if (b.vx) { b.x += b.vx * dt; b.vx *= Math.pow(0.04, dt); if (Math.abs(b.vx) < 3) b.vx = 0; }
        if (b.y <= b.hoverY && b.waited < b.wait) b.waited += dt;
        else b.y -= (speed * b.speedK + Math.max(0, b.y - 560) * 1.8) * dt;
        b.x = clamp(b.x + Math.cos(b.age * 1.5 + b.phase) * b.sway * 1.5 * dt, b.r + 8, W - b.r - 8);
        if (w.known && magnet > 0) BB.magnet(b, bop.x, bop.y, magnet, reach + b.r + BB.BOP_R, dt, b.r * 0.5);
        // Bop's body or the pointer itself pops a bubble: whichever reaches it first.
        if (w.known && (BB.touchHit(bop.x, bop.y, b, BB.BOP_R + margin) || BB.touchHit(w.px, w.py, b, margin))) pop(w, b, 'touch');
        else if (b.y < -b.r - 12) escape(w, b);
      }
    }
  };
  MODE.tap = {
    spawn: function (w) {
      var r = knob(w, 'r'), spread = knob(w, 'spread'), ax = w.known ? w.px : w.bop.x, ay = w.known ? w.py : w.bop.y;
      var x = 0, y = 0, best = -1, i, j;
      for (i = 0; i < 16; i++) {
        var cx = 170 + w.rand() * (W - 340), cy = 200 + w.rand() * 300, d = Math.sqrt((cx - ax) * (cx - ax) + (cy - ay) * (cy - ay));
        var room = 9999;
        for (j = 0; j < w.targets.length; j++) {
          var o = w.targets[j];
          if (!o.dead) room = Math.min(room, Math.sqrt((o.x - cx) * (o.x - cx) + (o.y - cy) * (o.y - cy)) - o.r - r);
        }
        // Near the pointer (but never right under it) and clear of the other balloons.
        var score = (d <= spread && d >= r + 90 ? 2 : 0) + (room > 40 ? 1 : 0);
        if (score > best) { best = score; x = cx; y = cy; }
        if (score === 3) break;
      }
      var b = make(w, 'balloon', x, y, r);
      if (b.gold) b.r = r * 0.85;
      b.bx = x; b.by = y; b.grow = 0; b.leaving = false; b.life = knob(w, 'life');
      b.vx = (knob(w, 'drift') + (w.party ? 0 : w.plan.l * 8)) * (w.rand() < 0.5 ? -1 : 1) * (0.6 + 0.4 * w.rand());
      b.bob = knob(w, 'bob') * (!w.party && w.plan.l === 1 ? 1.4 : 1);
    },
    update: function (w, dt, input) {
      var margin = knob(w, 'margin'), magnet = knob(w, 'magnet') * w.activity, reach = knob(w, 'reach'), i, b;
      for (i = 0; i < w.targets.length; i++) {
        b = w.targets[i];
        if (b.dead) continue;
        b.age += dt;
        b.grow = Math.min(1, b.grow + dt / 0.35);
        if (!b.leaving && b.age > b.life) b.leaving = true;
        if (b.leaving) b.by -= (160 + 60 * b.age / (b.life + 1)) * dt;
        else {
          b.bx += b.vx * dt;
          if (b.bx < b.r + 40 || b.bx > W - b.r - 40) { b.vx = -b.vx; b.bx = clamp(b.bx, b.r + 40, W - b.r - 40); }
        }
        b.x = b.bx; b.y = b.by + Math.sin(b.age * 2.1 + b.phase) * b.bob;
        if (w.known && !b.leaving && magnet > 0) {
          var m = { x: b.x, y: b.y };
          BB.magnet(m, w.px, w.py, magnet, reach + b.r, dt, b.r * 0.3);
          b.bx = clamp(b.bx + m.x - b.x, b.r + 40, W - b.r - 40); b.by = clamp(b.by + m.y - b.y, 150, 560);
          b.x = b.bx; b.y = b.by + Math.sin(b.age * 2.1 + b.phase) * b.bob;
        }
        b.hot = w.known && BB.clickHit(w.px, w.py, b, margin);
        if (b.y < -b.r * 2.6) escape(w, b);
      }
      var clicks = input.clicks || [];
      for (var c = 0; c < clicks.length; c++) {
        var hit = null, near = Infinity;
        for (i = 0; i < w.targets.length; i++) {
          b = w.targets[i];
          if (b.dead || !BB.clickHit(clicks[c].x, clicks[c].y, b, margin)) continue;
          var d = (clicks[c].x - b.x) * (clicks[c].x - b.x) + (clicks[c].y - b.y) * (clicks[c].y - b.y);
          if (d < near) { near = d; hit = b; }
        }
        if (hit) pop(w, hit, 'click');
        else { w.missClicks++; w.ev.push({ t: 'missClick', x: clicks[c].x, y: clicks[c].y }); }
      }
    }
  };
  function launch(w) {
    var f = w.frog;
    f.air = true; f.vy = -BB.FROG.v; f.buffer = 0; f.jumps++;
    w.ev.push({ t: 'jump' });
  }
  MODE.jump = {
    spawn: function (w) {
      var side = w.made % 2 ? -1 : 1, spread = knob(w, 'spread'), tier = w.tier;
      var pair = !w.party && w.plan.l === 2 && w.made % 3 === 2 && live(w) + 2 <= knob(w, 'live') + 1;
      var n = pair ? 2 : 1;
      for (var i = 0; i < n; i++) {
        var y = (tier <= 2 ? 320 : 300) + w.rand() * (tier <= 2 ? 80 : 120);
        var f = make(w, 'fly', w.frog.x + side * (spread + i * 96), y, w.party && w.rand() < 0.3 ? 22 : 26);
        f.dir = -side; f.baseY = y; f.waited = 0; f.wait = knob(w, 'wait');
        f.zig = knob(w, 'zig') * (!w.party && w.plan.l >= 1 ? 1.5 : 1);
      }
    },
    update: function (w, dt, input) {
      var frog = w.frog, F = BB.FROG, speed = knob(w, 'speed'), win = knob(w, 'window'), slow = knob(w, 'slow'), i;
      if (input.jump) { if (!frog.air) launch(w); else frog.buffer = knob(w, 'buffer'); }
      if (frog.air) {
        frog.vy += F.g * dt; frog.y += frog.vy * dt;
        if (frog.y >= F.ground) {
          frog.y = F.ground; frog.air = false; frog.vy = 0;
          w.ev.push({ t: 'land' });
          if (frog.buffer > 0) launch(w);
        }
      }
      frog.buffer = Math.max(0, frog.buffer - dt);
      frog.tongue = Math.max(0, frog.tongue - dt);
      for (i = 0; i < w.targets.length; i++) {
        var f = w.targets[i];
        if (f.dead) continue;
        f.age += dt;
        var dx = f.x - frog.x, ad = Math.abs(dx), k = slow + (1 - slow) * clamp((ad - 10) / (win * 1.5), 0, 1);
        // The moment to press Space, which a reaction time counts from (not the fly's start).
        if (!f.near && ad < win * BB.NEAR) { f.near = true; w.ev.push({ t: 'near', kind: 'fly', id: f.id, x: f.x, y: f.y }); }
        if (slow === 0 && ad <= 10 && f.waited < f.wait) { f.waited += dt; f.x += (frog.x - f.x) * Math.min(1, dt * 4); }
        else f.x += f.dir * speed * Math.max(k, slow > 0 ? slow : 0.16) * dt;
        f.y = f.baseY + Math.sin(f.age * 3.2 + f.phase) * f.zig;
        if (frog.air && ad <= win && f.y >= frog.y - F.h - F.tongue && f.y <= frog.y) {
          frog.tongue = 0.22; frog.tx = f.x; frog.ty = f.y;
          pop(w, f, 'jump');
        } else if (f.x < -70 || f.x > W + 70) escape(w, f);
      }
    }
  };
  MODE.catch = {
    spawn: function (w) {
      var tier = w.tier, later = !w.party && w.plan.l >= 1;
      var sway = knob(w, 'sway') * (later ? 1.5 : 1) + (later ? 6 : 0);
      // In a level a fruit never falls into a basket that stays put: beyond the catch
      // reach (half-width + 17) plus its full side-to-side wobble (2 * sway), so the
      // child has to steer.
      var away = w.party ? 0 : Math.max(tier <= 2 ? 130 : 60, w.basket.hw + 17 + 2 * sway + 20);
      var x = pickX(w, w.basket.x, knob(w, 'spread'), away, 150);
      var f = make(w, 'fruit', x, 60, 34);
      f.type = Math.floor(w.rand() * 5); f.fallK = 0.9 + 0.2 * w.rand();
      f.sway = sway; f.steered = false;
    },
    update: function (w, dt, input) {
      var bk = w.basket, B = BB.BASKET, top = knob(w, 'basket'), fall = knob(w, 'fall'), magnet = knob(w, 'magnet'), reach = knob(w, 'reach');
      var want = (input.dir || 0) * top;
      bk.vx += clamp(want - bk.vx, -6000 * dt, 6000 * dt);
      bk.x += bk.vx * dt;
      if (bk.x < bk.hw + 16 || bk.x > W - bk.hw - 16) { bk.x = clamp(bk.x, bk.hw + 16, W - bk.hw - 16); bk.vx = 0; }
      bk.squash = Math.max(0, bk.squash - dt * 4);
      for (var i = 0; i < w.targets.length; i++) {
        var f = w.targets[i];
        if (f.dead) continue;
        f.age += dt;
        f.y += fall * f.fallK * dt;
        f.x = clamp(f.x + Math.cos(f.age * 1.7 + f.phase) * f.sway * 1.7 * dt, 60, W - 60);
        // The magnet helps only a fruit the child has steered for (an arrow press while
        // it falls): like the pointer magnet, nothing is caught by itself.
        if (input.dir) f.steered = true;
        if (f.steered && f.y > 330 && f.y < B.y) BB.magnet(f, bk.x, f.y, magnet, reach + bk.hw, dt, 0);
        if (f.y >= B.y - 8 && f.y <= B.y + 30 && Math.abs(f.x - bk.x) <= bk.hw + f.r * 0.5) { bk.squash = 1; pop(w, f, 'catch'); }
        else if (f.y > B.ground) escape(w, f);
      }
    }
  };

  /* ------------------------------------------ worlds 6-11: shared bits */
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function byId(w, id) { for (var i = 0; i < w.targets.length; i++) if (w.targets[i].id === id && !w.targets[i].dead) return w.targets[i]; return null; }
  function shuffle(w, a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(w.rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // A party plays the layouts of level 3.
  function levelOf(w) { return w.party ? 2 : w.plan.l; }
  function missClick(w, x, y) { w.missClicks++; w.ev.push({ t: 'missClick', x: x, y: y }); }
  // A slip in the newer worlds (a carried turtle let go on the sand, a bubble blown too big)
  // counts against the second star like a target that got away, but nothing is lost.
  function slip(w, t, why) {
    w.escapes++; w.combo = 0; w.mult = 1;
    w.ev.push({ t: 'slip', kind: t.kind, why: why, id: t.id, x: t.x, y: t.y, r: t.r });
  }
  // The button was let go by a pause or a lost window, not by the child: the turtle in hand
  // waits where it is and a growing bubble is dropped, with no slip and no sound; the next
  // bubble needs a fresh press.
  function cancel(w) {
    var t = byId(w, w.held);
    if (t) t.state = 'idle';
    w.held = 0; w.wasHold = true;
    for (var i = 0; i < w.targets.length; i++) {
      var b = w.targets[i];
      if (b.kind === 'wand' && b.state === 'grow') { b.state = 'ready'; b.br = 0; b.held = 0; b.inBand = false; }
    }
  }

  /* ---------------------------------------------- world 6: drag and drop */
  // Pools: one in the middle, two side by side, or three in a gentle arc (right to left).
  var POOL_SPOTS = [[[640, 430]], [[900, 420], [380, 420]], [[1010, 400], [640, 480], [270, 400]]];
  var SPOTS = [[240, 280], [1040, 280], [640, 650], [330, 650], [920, 640], [640, 250]];
  function poolOf(w, color) { for (var i = 0; i < w.pools.length; i++) if (w.pools[i].color === color) return w.pools[i]; return w.pools[0]; }
  BB.poolOf = poolOf;
  function dragPress(w, x, y) {
    if (w.held) return;
    // A turtle on the hand after a click (tier 1) is put down by the next click.
    if (w.carry) { w.held = w.carry; w.carry = 0; dragRelease(w, x, y, false, true); return; }
    var best = null, bd = Infinity, grab = knob(w, 'grab');
    for (var i = 0; i < w.targets.length; i++) {
      var t = w.targets[i], d = dist(x, y, t.x, t.y);
      if (!t.dead && t.state === 'idle' && d <= t.r + grab && d < bd) { bd = d; best = t; }
    }
    if (!best) { missClick(w, x, y); return; }
    best.state = 'held'; best.ox = best.x - x; best.oy = best.y - y; best.travel = 0; best.gt = w.t;
    w.held = best.id;
    w.ev.push({ t: 'grab', id: best.id, x: best.x, y: best.y, r: best.r, home: best.home });
  }
  function dragHome(w, t) {
    var p = poolOf(w, t.home);
    t.state = 'home'; t.k = 0; t.sx = t.x; t.sy = t.y;
    w.ev.push({ t: 'home', id: t.id, x: p.x, y: p.y, r: p.r, color: p.color });
  }
  function dragRelease(w, x, y, cancel, byClick) {
    var t = byId(w, w.held), i;
    w.held = 0;
    if (!t) return;
    if (cancel) { t.state = 'idle'; return; }
    // A quick click on a turtle (tier 1 only): it stays on the hand until the next click.
    if (!byClick && knob(w, 'sticky') && t.travel < 16 && w.t - t.gt < 0.5) {
      t.state = 'carry'; w.carry = t.id;
      w.ev.push({ t: 'pick', id: t.id, x: t.x, y: t.y });
      return;
    }
    var p = poolOf(w, t.home);
    if (dist(t.x, t.y, p.x, p.y) <= p.r + knob(w, 'snap')) { dragHome(w, t); return; }
    t.state = 'idle';
    for (i = 0; i < w.pools.length; i++) {
      var o = w.pools[i], d = dist(t.x, t.y, o.x, o.y);
      if (o === p || d >= o.r + t.r * 0.5) continue;
      // Another colour's pool: the turtle hops back out onto the sand beside it.
      var ux = d > 1 ? (t.x - o.x) / d : 0, uy = d > 1 ? (t.y - o.y) / d : 1;
      t.x = clamp(o.x + ux * (o.r + t.r + 14), t.r + 10, W - t.r - 10); t.y = clamp(o.y + uy * (o.r + t.r + 14), 190, H - t.r * 0.7);
      w.ev.push({ t: 'wrong', id: t.id, x: t.x, y: t.y, r: t.r, color: o.color, home: t.home });
      if (!t.fumbled) { t.fumbled = true; slip(w, t, 'wrong'); }
      return;
    }
    w.ev.push({ t: 'drop', id: t.id, x: t.x, y: t.y, r: t.r });
    // Only a real carry let go on the sand is a slip; a click without moving is not.
    if (t.travel > 40 && !t.fumbled) { t.fumbled = true; slip(w, t, 'drop'); }
  }
  MODE.drag = {
    enter: function (w) {
      var lv = levelOf(w), n = 1 + clamp(lv + knob(w, 'sort') - 1, 0, 2), R = knob(w, 'pool'), colors = shuffle(w, [0, 1, 2]);
      w.pools = POOL_SPOTS[n - 1].map(function (p, i) { return { x: p[0], y: p[1], bx: p[0], r: R, color: colors[i], near: 0 }; });
      w.poolMove = lv >= 1 ? knob(w, 'move') : 0;
    },
    spawn: function (w) {
      var r = knob(w, 'r'), d = knob(w, 'dist'), snap = knob(w, 'snap'), best = null, bs = -1, i, j;
      // Every colour gets its turtles, but rarely the same pool twice in a row.
      var pool = w.pools[Math.floor(w.rand() * w.pools.length)];
      if (w.pools.length > 1 && pool.color === w.lastR && w.rand() < 0.7) pool = w.pools[(w.pools.indexOf(pool) + 1) % w.pools.length];
      w.lastR = pool.color;
      // A spot about `dist` from its pool (squashed a little: the beach is wide), clear of every
      // pool's slide-in zone, of the other turtles, of Bop and of the on-screen mouse; a few
      // fixed spots on the sand are the fallback.
      for (i = 0; i < 34 && bs < d * 0.85; i++) {
        var a = w.rand() * Math.PI * 2, x = i < 28 ? clamp(pool.x + Math.cos(a) * d, 110, W - 110) : SPOTS[i - 28][0];
        var y = i < 28 ? clamp(pool.y + Math.sin(a) * d * 0.85, 230, 640) : SPOTS[i - 28][1];
        var score = dist(x, y, pool.x, pool.y);
        if ((x > 960 && y > 500) || (x < 210 && y > 540)) score = -1; // the on-screen mouse, Bop
        for (j = 0; j < w.pools.length; j++) if (dist(x, y, w.pools[j].x, w.pools[j].y) < w.pools[j].r + snap + r * 0.5 + 24) score = -1;
        for (j = 0; j < w.targets.length; j++) { var o = w.targets[j]; if (!o.dead && dist(x, y, o.x, o.y) < o.r + r + 40) score = -1; }
        if (score > bs) { bs = score; best = { x: x, y: y }; }
      }
      if (!best) best = { x: 640, y: 640 };
      var t = make(w, 'turtle', best.x, best.y, r);
      t.home = pool.color; t.state = 'idle'; t.travel = 0; t.ox = 0; t.oy = 0; t.fumbled = false; t.hot = false; t.k = 0;
      t.face = pool.x < best.x ? -1 : 1;
    },
    update: function (w, dt, input) {
      var snap = knob(w, 'snap'), pull = knob(w, 'pull'), grab = knob(w, 'grab'), i, t, p;
      if (w.poolMove) { var sh = 90 * Math.sin(w.segT * w.poolMove / 90); for (i = 0; i < w.pools.length; i++) w.pools[i].x = w.pools[i].bx + sh; }
      var evs = input.mouse || [];
      for (i = 0; i < evs.length; i++) {
        if (evs[i].down) dragPress(w, evs[i].x, evs[i].y);
        else dragRelease(w, evs[i].x, evs[i].y, !!evs[i].cancel, false);
      }
      var hand = w.held || w.carry;
      for (i = 0; i < w.pools.length; i++) w.pools[i].near = 0;
      for (i = 0; i < w.targets.length; i++) {
        t = w.targets[i];
        if (t.dead) continue;
        t.age += dt;
        p = poolOf(w, t.home);
        if (t.state === 'home') {
          t.k = Math.min(1, t.k + dt / 0.28);
          var e = t.k * (2 - t.k);
          t.x = t.sx + (p.x - t.sx) * e; t.y = t.sy + (p.y - t.sy) * e;
          if (t.k >= 1) pop(w, t, 'drag');
          continue;
        }
        if (t.id === hand && w.known) {
          // A carried turtle follows the hand, its grab offset melting away, and leans into its pool.
          var f = Math.pow(0.0005, dt), fx, fy;
          t.ox *= f; t.oy *= f; fx = w.px + t.ox; fy = w.py + t.oy;
          var d = dist(fx, fy, p.x, p.y), zone = p.r + snap * 2 + 40;
          if (d < zone) { var lean = pull * (1 - d / zone); fx += (p.x - fx) * lean; fy += (p.y - fy) * lean; p.near = 1; }
          fx = clamp(fx, t.r, W - t.r); fy = clamp(fy, 150, H - t.r * 0.6);
          t.travel += dist(t.x, t.y, fx, fy);
          if (Math.abs(fx - t.x) > 0.5) t.face = fx < t.x ? -1 : 1;
          t.x = fx; t.y = fy;
          // A turtle carried after a click slides in by itself once it is over its water.
          if (w.carry === t.id && d < p.r * 0.6) { w.carry = 0; dragHome(w, t); }
        }
        t.hot = !hand && w.known && t.state === 'idle' && dist(w.px, w.py, t.x, t.y) <= t.r + grab;
      }
    }
  };

  /* ---------------------------------------------- world 7: double click */
  // Clams sit on the sand and, from level 2, on the rocks (the reef scene draws the rocks).
  BB.REEF = { floor: [[190, 552], [415, 552], [640, 552], [865, 552], [1075, 552]], rocks: [[320, 372], [640, 360], [960, 372]] };
  // A clam is wider than tall: its hit area is an ellipse around the shell, plus the margin.
  BB.clamHit = function (x, y, t, margin) {
    var dx = (x - t.x) / (t.r * 1.05 + margin), dy = (y - t.y) / (t.r * 0.8 + margin);
    return dx * dx + dy * dy <= 1;
  };
  MODE.dbl = {
    spawn: function (w) {
      var lv = levelOf(w), r = knob(w, 'r'), big = !w.party && lv === 2 && w.made % 4 === 3;
      var spots = lv === 0 ? BB.REEF.floor : BB.REEF.floor.concat(BB.REEF.rocks), ax = w.known ? w.px : W / 2, pick = null, best = -1;
      for (var i = 0; i < spots.length; i++) {
        var s = spots[(i + Math.floor(w.rand() * spots.length)) % spots.length], free = true;
        for (var j = 0; j < w.targets.length; j++) { var o = w.targets[j]; if (!o.dead && dist(o.x, o.y, s[0], s[1]) < 120) free = false; }
        // Level 1 starts near the pointer; later anywhere.
        var score = free ? 2 + (lv > 0 || Math.abs(s[0] - ax) < 500 ? 1 : 0) + w.rand() * 0.5 : -1;
        if (score > best) { best = score; pick = s; }
      }
      if (!pick || best < 0) return;
      var c = make(w, 'clam', pick[0], pick[1], big ? r * 1.3 : r);
      c.hp = big ? 2 : 1; c.big = big; c.armed = false; c.at = -9; c.fx = 0; c.fy = 0; c.life = knob(w, 'life'); c.dig = 0; c.knock = 0; c.hot = false;
      c.rock = pick[1] < 500;
    },
    update: function (w, dt, input) {
      var gap = knob(w, 'dbl'), slack = knob(w, 'slack'), margin = knob(w, 'margin'), i, t;
      for (i = 0; i < w.targets.length; i++) {
        t = w.targets[i];
        if (t.dead) continue;
        t.age += dt; t.knock = Math.max(0, t.knock - dt * 3);
        if (t.armed && w.t - t.at > gap) { t.armed = false; w.ev.push({ t: 'unarm', id: t.id }); }
        if (t.age > t.life) { t.dig += dt; if (t.dig > 0.8) { escape(w, t); continue; } }
        t.hot = w.known && BB.clamHit(w.px, w.py, t, margin);
      }
      var clicks = input.clicks || [];
      for (var c = 0; c < clicks.length; c++) {
        var hit = null, near = Infinity, x = clicks[c].x, y = clicks[c].y;
        for (i = 0; i < w.targets.length; i++) {
          t = w.targets[i];
          if (t.dead || !BB.clamHit(x, y, t, margin)) continue;
          var d = dist(x, y, t.x, t.y);
          if (d < near) { near = d; hit = t; }
        }
        if (!hit) { missClick(w, x, y); continue; }
        // The second click of a pair: soon enough, and near enough to the first.
        if (hit.armed && w.t - hit.at <= gap && dist(x, y, hit.fx, hit.fy) <= slack) {
          hit.armed = false; hit.hp--; hit.knock = 1;
          if (hit.hp > 0) w.ev.push({ t: 'crack', id: hit.id, x: hit.x, y: hit.y, r: hit.r });
          else pop(w, hit, 'dbl');
        } else {
          hit.armed = true; hit.at = w.t; hit.fx = x; hit.fy = y; hit.knock = 1;
          w.ev.push({ t: 'knock', id: hit.id, x: hit.x, y: hit.y, r: hit.r });
        }
      }
    }
  };

  /* -------------------------------------------- world 8: press and hold */
  // Ring sizes (radius): one size in level 1, three in level 2, four in level 3.
  BB.RINGS = [[120], [95, 125, 150], [80, 110, 140, 165]];
  BB.BUBBLE0 = 18; // a new bubble's radius
  // A bubble let go too soon floats off small and pops (that costs nothing, like a missed
  // click); one blown too big goes «boing» (a slip).
  function burst(w, t, small) {
    w.ev.push({ t: small ? 'poof' : 'boing', id: t.id, x: t.x, y: t.y, br: t.br, ring: t.ring });
    if (small) w.missClicks++; else slip(w, t, 'big');
    t.state = 'ready'; t.br = 0; t.held = 0; t.inBand = false;
  }
  MODE.hold = {
    spawn: function (w) {
      // The last bubble floats away with its critter before the next one sits on the wand.
      if (w.made > 0 && w.t - w.lastHit < 0.9) return;
      var sizes = BB.RINGS[levelOf(w)], i = Math.floor(w.rand() * sizes.length);
      if (sizes.length > 1 && sizes[i] === w.lastR) i = (i + 1 + Math.floor(w.rand() * (sizes.length - 1))) % sizes.length;
      w.lastR = sizes[i];
      var t = make(w, 'wand', BB.WAND.x, BB.WAND.y, sizes[i]);
      t.br = 0; t.state = 'ready'; t.critter = Math.floor(w.rand() * 4); t.ring = t.r; t.inBand = false; t.held = 0;
      t.pulse = levelOf(w) === 2 ? knob(w, 'pulse') : 0;
    },
    update: function (w, dt, input) {
      var hold = !!input.hold, press = hold && !w.wasHold, tol = knob(w, 'tol');
      w.wasHold = hold;
      for (var i = 0; i < w.targets.length; i++) {
        var t = w.targets[i];
        if (t.dead) continue;
        t.age += dt;
        t.ring = t.r + t.pulse * Math.sin(t.age * 2.4);
        // Only a fresh press starts a bubble, so a button still held from the last one does nothing.
        if (t.state === 'ready') {
          if (press) { t.state = 'grow'; t.br = BB.BUBBLE0; t.held = 0; w.ev.push({ t: 'blow', id: t.id, x: t.x, y: t.y }); }
        } else if (hold) {
          t.held += dt;
          t.br += knob(w, 'grow') * (Math.abs(t.br - t.ring) <= tol ? knob(w, 'slow') : 1) * dt;
          t.inBand = Math.abs(t.br - t.ring) <= tol;
          if (t.br > t.ring + tol + 20) burst(w, t, false);
        } else if (Math.abs(t.br - t.ring) <= tol) { t.inBand = false; pop(w, t, 'hold'); }
        else burst(w, t, t.br < t.ring);
      }
    }
  };
  // How long a bubble has to be held to reach the middle of a ring of radius R at a tier
  // (outside a party), for the ghost hand and the tests.
  BB.holdTime = function (tier, R) {
    var t = BB.TUNE.hold, g = t.grow[tier - 1], tol = t.tol[tier - 1], s = t.slow[tier - 1];
    var lo = Math.max(BB.BUBBLE0, R - tol);
    return (lo - BB.BUBBLE0) / g + (R - lo) / (g * s);
  };

  /* -------------------------------------------- world 9: the four arrows */
  // Soft coral walls { x, y, w, h } (centre and size) for levels 2 and 3; a tier uses the
  // first `coral` of a list. All of them leave the submarine's start in the middle clear.
  BB.CORALS = [
    [{ x: 400, y: 250, w: 70, h: 200 }, { x: 880, y: 400, w: 70, h: 200 }, { x: 640, y: 160, w: 240, h: 56 }, { x: 640, y: 478, w: 240, h: 56 }],
    [{ x: 640, y: 190, w: 260, h: 56 }, { x: 640, y: 450, w: 260, h: 56 }, { x: 330, y: 320, w: 56, h: 180 }, { x: 950, y: 320, w: 56, h: 180 }]
  ];
  // How far a circle (x, y, r) sinks into a wall (a rounded box): null when it is clear.
  BB.wallHit = function (x, y, r, wl) {
    var rad = Math.min(wl.w, wl.h) / 2, cx = clamp(x, wl.x - wl.w / 2 + rad, wl.x + wl.w / 2 - rad), cy = clamp(y, wl.y - wl.h / 2 + rad, wl.y + wl.h / 2 - rad);
    var dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy), need = r + rad;
    if (d >= need) return null;
    if (d < 0.001) { dx = 0; dy = -1; d = 1; }
    return { nx: dx / d, ny: dy / d, depth: need - d };
  };
  function clearSpot(w, x, y, r) {
    var S = BB.SUB;
    if (x < S.x0 + 30 || x > S.x1 - 30 || y < S.y0 + 10 || y > S.y1 - 10) return false;
    for (var i = 0; i < w.walls.length; i++) if (BB.wallHit(x, y, r + 26, w.walls[i])) return false;
    for (i = 0; i < w.targets.length; i++) { var o = w.targets[i]; if (!o.dead && dist(x, y, o.x, o.y) < o.r + r + 50) return false; }
    return true;
  }
  MODE.steer = {
    enter: function (w) {
      var lv = levelOf(w), n = lv >= 1 ? knob(w, 'coral') : 0, s = w.sub;
      w.walls = n ? BB.CORALS[lv - 1].slice(0, n) : [];
      s.x = W / 2; s.y = 320; s.vx = 0; s.vy = 0;
      w.dirs = shuffle(w, [0, 1, 2, 3]);
    },
    spawn: function (w) {
      // The next starfish lies in the next direction of a shuffled round of → ↑ ← ↓,
      // so every level needs all four arrows.
      var r = knob(w, 'r'), d = knob(w, 'dist'), s = w.sub, S = BB.SUB, spot = null, k, i, x, y;
      var away = r + S.r + knob(w, 'margin') + 20;
      for (k = 0; k < 4 && !spot; k++) {
        var dir = w.dirs[(w.made + k) % 4];
        for (i = 0; i < 10 && !spot; i++) {
          var j = (w.rand() - 0.5) * 2;
          if (dir === 0 || dir === 2) { x = s.x + (dir === 0 ? 1 : -1) * d * (0.85 + 0.3 * w.rand()); y = s.y + j * 90; }
          else { x = s.x + j * 60; y = dir === 1 ? S.y0 + 10 + w.rand() * 50 : S.y1 - 10 - w.rand() * 50; if (Math.abs(y - s.y) < 110) continue; }
          if (clearSpot(w, x, y, r) && dist(x, y, s.x, s.y) > away) spot = { x: x, y: y };
        }
      }
      for (i = 0; i < 40 && !spot; i++) {
        x = S.x0 + 40 + w.rand() * (S.x1 - S.x0 - 80); y = S.y0 + 20 + w.rand() * (S.y1 - S.y0 - 40);
        if (clearSpot(w, x, y, r) && dist(x, y, s.x, s.y) > Math.max(away, 200)) spot = { x: x, y: y };
      }
      if (!spot) return;
      var p = make(w, 'star', spot.x, spot.y, r);
      p.life = knob(w, 'life'); p.spin = w.rand() < 0.5 ? -1 : 1;
    },
    update: function (w, dt, input) {
      var s = w.sub, S = BB.SUB, dx = input.dx || 0, dy = input.dy || 0, top = knob(w, 'sub'), len = Math.sqrt(dx * dx + dy * dy) || 1, i;
      var k = Math.min(1, dt * 7);
      s.vx += (dx / len * top - s.vx) * k; s.vy += (dy / len * top - s.vy) * k;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (dx) s.face = dx > 0 ? 1 : -1;
      if (s.x < S.x0 || s.x > S.x1) { s.x = clamp(s.x, S.x0, S.x1); s.vx = 0; }
      if (s.y < S.y0 || s.y > S.y1) { s.y = clamp(s.y, S.y0, S.y1); s.vy = 0; }
      // Soft coral: the submarine slides along it and bounces back a little, never stuck or hurt.
      for (i = 0; i < w.walls.length; i++) {
        var h = BB.wallHit(s.x, s.y, S.r, w.walls[i]);
        if (!h) continue;
        s.x += h.nx * h.depth; s.y += h.ny * h.depth;
        var vn = s.vx * h.nx + s.vy * h.ny;
        if (vn < 0) {
          s.vx -= 1.4 * vn * h.nx; s.vy -= 1.4 * vn * h.ny;
          if (vn < -70) w.ev.push({ t: 'bump', x: s.x - h.nx * S.r, y: s.y - h.ny * S.r, wall: i });
        }
      }
      var moving = !!(dx || dy), margin = knob(w, 'margin'), magnet = knob(w, 'magnet'), reach = knob(w, 'reach');
      for (i = 0; i < w.targets.length; i++) {
        var p = w.targets[i];
        if (p.dead) continue;
        p.age += dt;
        // Like the pointer magnet, it only helps a submarine the child is steering.
        if (moving) BB.magnet(p, s.x, s.y, magnet, reach + p.r + S.r, dt, 0);
        if (dist(p.x, p.y, s.x, s.y) <= p.r + S.r + margin) pop(w, p, 'steer');
        else if (p.age > p.life) escape(w, p);
      }
    }
  };

  /* --------------------------------------------- world 10: letter keys */
  MODE.keys = {
    spawn: function (w) {
      var set = BB.letters(w.tier, w.party ? 'P' : w.plan.l), used = {}, i, j;
      for (i = 0; i < w.targets.length; i++) if (!w.targets[i].dead) used[w.targets[i].code] = 1;
      // Never two balloons with the same key, and rarely the same key twice in a row.
      var free = set.filter(function (c) { return !used[c] && c !== w.lastCode; });
      if (!free.length) free = set.filter(function (c) { return !used[c]; });
      if (!free.length) return;
      var code = free[Math.floor(w.rand() * free.length)], x = W / 2, y = 220, best = -1;
      w.lastCode = code;
      for (i = 0; i < 16 && best < 300; i++) {
        var cx = 190 + w.rand() * (W - 380), cy = 160 + w.rand() * 130, room = 9999;
        for (j = 0; j < w.targets.length; j++) { var o = w.targets[j]; if (!o.dead) room = Math.min(room, Math.abs(o.rx - cx)); }
        if (room > best) { best = room; x = cx; y = cy; }
      }
      // It floats in from the nearer side and settles in the sky above the keyboard.
      var b = make(w, 'kballoon', x < W / 2 ? -120 : W + 120, y + 70, knob(w, 'r'));
      b.code = code; b.rx = x; b.ry = y; b.ex = b.x; b.ey = b.y; b.cap = knob(w, 'cap'); b.life = knob(w, 'life');
      b.leaving = false; b.arrived = false; b.bob = 8;
      b.vx = knob(w, 'drift') * (w.rand() < 0.5 ? -1 : 1) * (0.6 + 0.4 * w.rand());
    },
    update: function (w, dt, input) {
      var i, j, b;
      for (i = 0; i < w.targets.length; i++) {
        b = w.targets[i];
        if (b.dead) continue;
        b.age += dt;
        if (!b.leaving && b.age > b.life) b.leaving = true;
        if (b.leaving) b.ey -= (150 + 40 * b.age / (b.life + 1)) * dt;
        else if (!b.arrived) {
          var k = Math.min(1, dt * 2.6);
          b.ex += (b.rx - b.ex) * k; b.ey += (b.ry - b.ey) * k;
          if (Math.abs(b.rx - b.ex) < 3 && Math.abs(b.ry - b.ey) < 3) b.arrived = true;
        } else {
          b.rx += b.vx * dt;
          if (b.rx < 170 || b.rx > W - 170) { b.vx = -b.vx; b.rx = clamp(b.rx, 170, W - 170); }
          // Drifting balloons turn back before their keycaps overlap.
          for (j = 0; j < w.targets.length; j++) {
            var o = w.targets[j];
            if (o !== b && !o.dead && o.arrived && !o.leaving && Math.abs(o.rx - b.rx) < 200 && (o.rx - b.rx) * b.vx > 0) b.vx = -b.vx;
          }
          b.ex = b.rx;
        }
        b.x = b.ex; b.y = b.ey + Math.sin(b.age * 2 + b.phase) * b.bob;
        if (b.leaving && b.y < -b.r * 2.2 - b.cap - 40) escape(w, b);
      }
      var keys = input.keys || [];
      for (var c = 0; c < keys.length; c++) {
        var hit = null;
        for (i = 0; i < w.targets.length; i++) { b = w.targets[i]; if (!b.dead && b.code === keys[c]) { hit = b; break; } }
        if (hit) pop(w, hit, 'key');
        // A wrong key costs nothing: the game lights the right one.
        else { w.missClicks++; w.ev.push({ t: 'wrongKey', code: keys[c] }); }
      }
    }
  };
  BB.MODE = MODE;

  // One fixed step. input: { px, py (pointer in logical pixels, or null), clicks: [{x, y}],
  // jump: a jump press this step, dir: -1, 0 or 1 for the basket, and for worlds 6-11:
  // mouse: [{ down: true|false, x, y, cancel }] button presses and releases in order,
  // hold: the button or Space is held, dx, dy: -1, 0 or 1 for the submarine,
  // keys: ['KeyF', ...] letter keys pressed this step, cancel: a pause or a lost window let go
  // of the button, so a carried turtle is put down and a growing bubble is dropped quietly }.
  var NONE = { px: null, py: null, clicks: [], jump: false, dir: 0 };
  BB.step = function (w, dt, input) {
    if (w.over) return w;
    input = input || NONE;
    w.t += dt; w.segT += dt;
    if (input.px != null && input.py != null) {
      var nx = clamp(input.px, 0, W), ny = clamp(input.py, 0, H);
      // The magnet only helps a pointer that is moving: nothing pops by itself.
      w.activity = w.known && Math.abs(nx - w.px) + Math.abs(ny - w.py) > 0.5 ? 1 : Math.max(0, w.activity - dt / 1.5);
      w.px = nx; w.py = ny; w.known = true;
    } else w.activity = Math.max(0, w.activity - dt / 1.5);
    if (w.known) BB.follow(w.bop, w.px, w.py, dt);
    if (w.party) {
      var wave = 1 + Math.floor(Math.min(w.t, w.plan.duration - 0.001) / BB.WAVE_SECONDS);
      if (wave !== w.wave) { w.wave = wave; w.ev.push({ t: 'wave', n: wave }); }
      var segs = w.plan.segments.length;
      if (segs > 1) {
        // Each part gets an equal share of the minute: 15 s each in world 5, 12 s in world 11.
        var s = Math.floor(w.t / (w.plan.duration / segs)) % segs;
        if (s !== w.seg && w.t < w.plan.duration) { vanish(w); enter(w, s); w.ev.push({ t: 'segment', mode: w.mode }); }
      }
    }
    if (input.cancel) cancel(w);
    MODE[w.mode].update(w, dt, input);
    // Spawning: never more on screen than the tier allows, never more than the level needs.
    var n = live(w), intro = w.seg > 0 || (w.party && w.t > 1) ? 1.1 : 0.6;
    if (n === 0) w.spawnT = Math.min(w.spawnT, 0.3);
    w.spawnT -= dt;
    if (w.segT >= intro && w.spawnT <= 0 && n < liveCap(w) && (w.party || w.segHits + n < w.goal)) {
      MODE[w.mode].spawn(w);
      w.spawnT = knob(w, 'gap');
    }
    for (var i = w.targets.length - 1; i >= 0; i--) if (w.targets[i].dead) w.targets.splice(i, 1);
    if (!w.party && w.segHits >= w.goal) {
      if (w.seg + 1 < w.plan.segments.length) { vanish(w); enter(w, w.seg + 1); w.ev.push({ t: 'segment', mode: w.mode }); }
      else { w.over = true; w.ev.push({ t: 'done' }); }
    }
    if (w.party && w.t >= w.plan.duration) { w.over = true; w.ev.push({ t: 'timeup' }); }
    return w;
  };
  // Remaining goal and party seconds, for the HUD.
  BB.left = function (w) { return w.party ? Math.max(0, w.plan.duration - w.t) : Math.max(0, w.goal - w.segHits); };

  /* ------------------------------------------------------ stars, DDA */
  BB.result = function (w) {
    return { hits: w.hits, escapes: w.escapes, missClicks: w.missClicks, time: w.t, score: w.score, bestCombo: w.bestCombo,
      par: w.plan.par, expect: w.plan.expect, party: w.party };
  };
  // Finishing a level always earns a star; one more for letting few targets get away,
  // one more for keeping pace. Missed clicks never cost a star: mashing is fine.
  BB.stars = function (r) {
    var acc = r.hits / Math.max(1, r.hits + r.escapes);
    return 1 + (acc >= 0.75 ? 1 : 0) + (r.time <= r.par ? 1 : 0);
  };
  // 0..1 for Kit.dda: accuracy (missed clicks count a little) and pace, or for a party
  // the share of the expected pops.
  BB.outcome = function (r) {
    var acc = r.hits / Math.max(1, r.hits + r.escapes + 0.2 * Math.min(r.missClicks, r.hits * 2 + 2));
    var x = r.party ? 0.6 * acc + 0.4 * Math.min(1, r.hits / Math.max(1, r.expect)) : 0.55 * acc + 0.45 * Math.min(1, r.par / Math.max(1, r.time));
    return Math.round(clamp(x, 0, 1) * 1000) / 1000;
  };

  /* ---------------------------------------------------------- rewards */
  // Bop's closet: colours and hats, unlocked by the total of stars. The first eight colours
  // and ten hats keep their thresholds from the five-world game; the rest reach the new top.
  BB.COLORS = [
    { c: '#ffd23f', need: 0 }, { c: '#ff7eb6', need: 2 }, { c: '#4fd1ff', need: 4 }, { c: '#5be38f', need: 7 },
    { c: '#ff9f43', need: 10 }, { c: '#b48cff', need: 14 }, { c: '#ff5d6c', need: 19 }, { c: 'rainbow', need: 26 },
    { c: '#2ee8c8', need: 34 }, { c: '#6c7cff', need: 44 }, { c: '#ff5fd2', need: 55 }, { c: 'galaxy', need: 70 }, { c: 'gold', need: 88 }
  ];
  BB.HATS = [
    { id: 'none', need: 0 }, { id: 'bow', need: 1 }, { id: 'cap', need: 3 }, { id: 'flower', need: 5 }, { id: 'party', need: 8 },
    { id: 'crown', need: 12 }, { id: 'phones', need: 17 }, { id: 'wizard', need: 23 }, { id: 'astro', need: 30 }, { id: 'halo', need: 40 },
    { id: 'pirate', need: 48 }, { id: 'chef', need: 57 }, { id: 'snorkel', need: 66 }, { id: 'viking', need: 76 }, { id: 'unicorn', need: 87 },
    { id: 'champ', need: 99 }
  ];
  BB.MAX_STARS = BB.N * 3 * 3;
  // Items opened by going from `before` to `after` stars: [{ type: 'color'|'hat', i }].
  BB.unlocks = function (before, after) {
    var out = [];
    BB.COLORS.forEach(function (c, i) { if (c.need > before && c.need <= after) out.push({ type: 'color', i: i }); });
    BB.HATS.forEach(function (h, i) { if (h.need > before && h.need <= after) out.push({ type: 'hat', i: i }); });
    return out;
  };

  /* ------------------------------------------------------------ saves */
  // { v: 1, stars: [world][level] 0..3, best: [world] party score, grip: the picture
  //   cards were seen, color, hat, seenStars: the star total when the closet was last opened }
  // Worlds 6-11 extend the arrays: a save from the five-world game (stars [5][3], best [5])
  // loads with everything it had and the new worlds empty.
  BB.freshSave = function () {
    var stars = [], best = [];
    for (var w = 0; w < BB.N; w++) { stars.push([0, 0, 0]); best.push(0); }
    return { v: 1, stars: stars, best: best, grip: false, color: 0, hat: 0, seenStars: 0 };
  };
  function int(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  // Every field is checked: a damaged or hand-edited save always loads as a playable one.
  BB.loadSave = function (raw) {
    var s = BB.freshSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
    for (var w = 0; w < BB.N; w++) {
      var row = Array.isArray(raw.stars) && Array.isArray(raw.stars[w]) ? raw.stars[w] : [];
      for (var l = 0; l < 3; l++) s.stars[w][l] = int(row[l], 0, 3) ? row[l] : 0;
      var best = Array.isArray(raw.best) ? raw.best[w] : 0;
      s.best[w] = int(best, 0, 9999999) ? best : 0;
    }
    s.grip = raw.grip === true;
    var total = BB.total(s);
    s.color = int(raw.color, 0, BB.COLORS.length - 1) && BB.COLORS[raw.color].need <= total ? raw.color : 0;
    s.hat = int(raw.hat, 0, BB.HATS.length - 1) && BB.HATS[raw.hat].need <= total ? raw.hat : 0;
    s.seenStars = int(raw.seenStars, 0, total) ? raw.seenStars : 0;
    return s;
  };
  BB.total = function (s) { var n = 0; s.stars.forEach(function (row) { row.forEach(function (v) { n += v; }); }); return n; };
  BB.worldOpen = function (s, w) { return w === 0 || s.stars[w - 1][2] > 0 || s.stars[w].some(Boolean); };
  // A level opens when the one before it has a star; the party when level 3 has one.
  BB.isOpen = function (s, w, l) {
    if (!BB.worldOpen(s, w)) return false;
    if (l === 'P') return s.stars[w][2] > 0;
    return l === 0 || s.stars[w][l - 1] > 0 || s.stars[w][l] > 0;
  };
  // The first open level without a star, else the last party.
  BB.nextLevel = function (s) {
    for (var w = 0; w < BB.N; w++) for (var l = 0; l < 3; l++) if (BB.isOpen(s, w, l) && !s.stars[w][l]) return { w: w, l: l };
    return { w: BB.N - 1, l: 'P' };
  };
  // The highest open world (0-based).
  BB.topWorld = function (s) { var t = 0; for (var w = 0; w < BB.N; w++) if (BB.worldOpen(s, w)) t = w; return t; };
})();
