/* Lucky Lake (بحيرة الحظ) engine: the five places, the species, the fishing
 * simulation (aim, cast, nibbles, the bite, the reel bar), catches, goals, rods and saves.
 * Pure: no DOM, no Kit, no timers and no Math.random (a world takes a seed), so
 * tools/tests/lucky-lake-engine.test.mjs loads it with { window: {} } and fishes whole
 * sessions with scripted players. game.js reads the DDA tier, steps the world with the
 * child's input and turns its events into pictures, sound and statistics. */
(function () {
  'use strict';
  var LL = window.LL = window.LL || {};
  var W = 1280, H = 720;
  LL.W = W; LL.H = H;
  LL.TIERS = 5;
  LL.DUO_SECONDS = 120;  // a derby lasts two minutes
  LL.DUO_TIER = 2;       // both players fish at the same gentle tier
  LL.OVERTIME = 12;      // a fish already on the line when the clock ends may still be landed
  LL.AIM_SPEED = 430;    // keyboard aim, px/s
  LL.ZONE_V = 0.95;      // top speed of the catch zone, bar heights per s

  // One entry per DDA tier: tier 1 is tuned for a six-year-old who has never fished,
  // tier 5 is a real challenge. LL.HARDER says which way each knob moves as the tiers
  // get harder; the engine test checks every row.
  LL.TUNE = {
    bite: [1.4, 1.1, 0.85, 0.6, 0.4],     // s to press after the «!»
    nibMin: [0, 0, 1, 1, 1],              // fake-out nibbles before the bite
    nibMax: [1, 2, 2, 3, 3],
    zone: [0.44, 0.37, 0.31, 0.27, 0.24], // catch-zone height, share of the bar
    snap: [12, 9, 7, 5.5, 4.5],           // how quickly the zone answers the button, 1/s
    dart: [0.5, 0.7, 0.9, 1.1, 1.3],      // fish speed in the bar
    rest: [1.6, 1.3, 1.05, 0.85, 0.7],    // how long the fish rests between moves
    fill: [0.5, 0.42, 0.36, 0.32, 0.3],   // meter per s while the fish is in the zone
    drain: [0.1, 0.15, 0.2, 0.24, 0.28],  // meter per s while it is outside
    meter0: [0.45, 0.4, 0.35, 0.3, 0.28], // the meter when the fish is hooked
    reach: [300, 270, 240, 210, 185],     // how far away a fish notices the hook, px
    eager: [1.6, 1.25, 1, 0.85, 0.7],     // chance per s that a fish in reach notices it
    swim: [0.8, 0.9, 1, 1.1, 1.2],        // swimming speed in the lake
    current: [5, 8, 11, 14, 17]           // the river's drift of the hook, px/s
  };
  LL.HARDER = { bite: -1, nibMin: 1, nibMax: 1, zone: -1, snap: -1, dart: 1, rest: -1, fill: -1, drain: 1, meter0: -1,
    reach: -1, eager: -1, swim: 1, current: 1 };
  // How a hooked fish moves in the bar, by its pull: 0 junk, 1 calm .. 4 legendary.
  // v: speed (bar heights per s), rest: [min, max] s, jump: how far it moves, dash: chance of a dash.
  LL.PULL = [
    { v: 0.07, rest: [1.4, 2.4], jump: 0.14, dash: 0 },
    { v: 0.22, rest: [1, 1.8], jump: 0.3, dash: 0 },
    { v: 0.36, rest: [0.6, 1.2], jump: 0.42, dash: 0.12 },
    { v: 0.5, rest: [0.4, 0.85], jump: 0.52, dash: 0.25 },
    { v: 0.56, rest: [0.32, 0.7], jump: 0.56, dash: 0.3 }
  ];

  /* ------------------------------------------------------------ species */
  // [id, Arabic name, place, rarity 1..3, weight min, max (tenths of a kg), length px,
  //  shape, [body, belly, fin], pattern, depth min, max (0 surface .. 1 bed), speed px/s, pull, glow]
  var RAW = [
    ['pebble', 'سمكة الحصى', 0, 1, 1, 4, 48, 'fish', ['#7fb2ec', '#eaf5ff', '#4f7fd0'], 'spots', 0.05, 0.55, 70, 1],
    ['sunny', 'سمكة الشمس', 0, 1, 2, 7, 54, 'round', ['#ffbf2e', '#fff3b0', '#ff7a1a'], 'stripes', 0.1, 0.6, 55, 1],
    ['tilapia', 'البلطي الضاحك', 0, 1, 4, 14, 66, 'fish', ['#86d66f', '#ecffd8', '#3f9a4f'], 'stripes', 0.3, 0.8, 50, 1],
    ['redfin', 'زعنفة حمراء', 0, 1, 3, 10, 60, 'fish', ['#c6d4ea', '#ffffff', '#ff4d4d'], 'band', 0.15, 0.6, 65, 2],
    ['catfish', 'أبو شنب', 0, 2, 10, 32, 96, 'whisker', ['#7a74a8', '#ddd8f6', '#524c86'], 'spots', 0.78, 1, 38, 2],
    ['carp', 'الشبوط الكسول', 0, 2, 15, 42, 104, 'fish', ['#eea93c', '#fff0c2', '#c97b1c'], 'scales', 0.5, 0.95, 34, 2],
    ['koi', 'كوي المرقّط', 0, 3, 10, 26, 84, 'fish', ['#ffffff', '#ffffff', '#ff5a3c'], 'koi', 0.2, 0.7, 46, 3],
    ['dace', 'سهم الماء', 1, 1, 2, 6, 58, 'long', ['#bccde0', '#f4f9ff', '#5f86c8'], 'band', 0.05, 0.5, 100, 2],
    ['perch', 'الفرخ المخطط', 1, 1, 3, 12, 62, 'fish', ['#a8d85e', '#fff3c4', '#ff7a2e'], 'stripes', 0.2, 0.7, 75, 2],
    ['trout', 'السلمون المرقّط', 1, 1, 5, 20, 74, 'fish', ['#a4be6c', '#ffe6ec', '#e0668e'], 'trout', 0.3, 0.8, 80, 2],
    ['salmon', 'السلمون القافز', 1, 2, 20, 50, 100, 'fish', ['#f4907f', '#ffe6df', '#cf5a5a'], 'spots', 0.2, 0.75, 85, 3],
    ['pike', 'رمح النهر', 1, 2, 20, 60, 118, 'long', ['#62ae5c', '#eef8cc', '#3f7a3a'], 'spots', 0.4, 0.85, 70, 3],
    ['sturgeon', 'الحفش العجوز', 1, 3, 50, 120, 140, 'long', ['#8e9fb6', '#e6ecf4', '#5d6d86'], 'plates', 0.8, 1, 40, 3],
    ['sardine', 'السردين اللامع', 2, 1, 1, 3, 46, 'long', ['#72acff', '#f2f7ff', '#3f74d6'], 'band', 0.05, 0.45, 110, 2],
    ['clown', 'سمكة المهرج', 2, 1, 1, 4, 48, 'round', ['#ff8a2a', '#ffd1a1', '#1c2250'], 'clown', 0.3, 0.8, 60, 2],
    ['crab', 'السلطعون العنيد', 2, 1, 4, 20, 64, 'crab', ['#ff5a4a', '#ffb3a8', '#c93a2e'], '', 1, 1, 42, 2],
    ['bream', 'الدنيس الفضي', 2, 1, 6, 24, 78, 'flat', ['#c9d6e8', '#ffffff', '#ffcc33'], 'stripes', 0.3, 0.85, 70, 2],
    ['puffer', 'المنفوخ', 2, 2, 5, 16, 62, 'puffer', ['#ffe066', '#fff7d1', '#e0a800'], 'spots', 0.2, 0.7, 40, 2],
    ['turtle', 'السلحفاة الطيبة', 2, 3, 60, 200, 124, 'turtle', ['#58c66f', '#e8f5c8', '#2f8a4a'], '', 0.25, 0.75, 36, 3],
    ['tuna', 'التونة السريعة', 2, 3, 80, 240, 150, 'fish', ['#3363bb', '#eaf1ff', '#ffd23f'], 'band', 0.35, 0.9, 120, 3],
    ['smelt', 'سمكة الثلج', 3, 1, 1, 3, 44, 'long', ['#c2eaff', '#ffffff', '#6fb8e6'], 'band', 0.05, 0.5, 85, 1],
    ['whitefish', 'السمكة البيضاء', 3, 1, 5, 20, 72, 'fish', ['#e8eff8', '#ffffff', '#93a9c4'], 'scales', 0.3, 0.8, 55, 2],
    ['char', 'الشار القطبي', 3, 1, 8, 30, 80, 'fish', ['#62809f', '#ff8a5a', '#ff9a6b'], 'spots', 0.3, 0.85, 60, 2],
    ['grayling', 'ذات الشراع', 3, 2, 5, 20, 76, 'sail', ['#9099bf', '#f0f2ff', '#b45bd6'], 'spots', 0.2, 0.7, 65, 3],
    ['burbot', 'سمكة الشتاء', 3, 2, 10, 40, 108, 'eel', ['#a2915e', '#f0e6c6', '#6f6240'], 'spots', 0.8, 1, 35, 2],
    ['icepike', 'الرمح الجليدي', 3, 3, 30, 90, 126, 'long', ['#82cbe9', '#f2fbff', '#3f8fb8'], 'spots', 0.4, 0.9, 75, 3],
    ['glowfin', 'زعنفة النور', 4, 1, 2, 6, 52, 'fish', ['#3df5ff', '#d4feff', '#ff5df0'], 'band', 0.05, 0.6, 75, 2, '#3df5ff'],
    ['jelly', 'قنديل القمر', 4, 1, 1, 5, 54, 'jelly', ['#ff9cf0', '#ffe6fb', '#c45bff'], '', 0.1, 0.7, 22, 1, '#ff9cf0'],
    ['star', 'نجمة البحيرة', 4, 1, 2, 6, 52, 'star', ['#ffd23f', '#fff3b0', '#ff9a1f'], '', 1, 1, 16, 1, '#ffd23f'],
    ['crystal', 'سمكة الكريستال', 4, 2, 5, 20, 74, 'flat', ['#b98cff', '#f1e6ff', '#7a4dff'], 'gems', 0.3, 0.8, 60, 3, '#c8a2ff'],
    ['lantern', 'أبو فانوس', 4, 2, 10, 30, 86, 'angler', ['#4a50a0', '#9aa0e6', '#ffe14d'], 'spots', 0.7, 1, 30, 2, '#ffe14d'],
    ['rainbow', 'سمكة قوس قزح', 4, 3, 10, 30, 84, 'fish', ['#ff6b7a', '#ffffff', '#4fd1ff'], 'rainbow', 0.2, 0.75, 70, 3, '#ffffff'],
    ['golden', 'السمكة الذهبية', 4, 3, 30, 70, 96, 'fish', ['#ffd23f', '#fff6c2', '#ffa21a'], 'scales', 0.3, 0.8, 60, 4, '#ffd23f']
  ];
  LL.SPECIES = RAW.map(function (r, i) {
    return { i: i, id: r[0], name: r[1], place: r[2], rarity: r[3], min: r[4], max: r[5], len: r[6], kind: r[7], c: r[8], pat: r[9],
      d0: r[10], d1: r[11], speed: r[12], pull: r[13], glow: r[14] || '', legend: r[0] === 'golden',
      move: r[7] === 'crab' || r[7] === 'star' ? 'bed' : r[7] === 'jelly' ? 'drift' : 'swim' };
  });
  LL.byId = {};
  LL.SPECIES.forEach(function (s) { LL.byId[s.id] = s; });

  // Funny things that are not fish. They sit on the lake bed (the duck floats) and snag
  // a hook left beside them. w: weight range (tenths of a kg), coins: [min, max].
  LL.JUNK = {
    boot: { id: 'boot', name: 'حذاء قديم', min: 6, max: 18, coins: [1, 1], float: false },
    teapot: { id: 'teapot', name: 'إبريق شاي', min: 5, max: 12, coins: [3, 3], float: false },
    chest: { id: 'chest', name: 'صندوق كنز!', min: 30, max: 60, coins: [25, 45], float: false },
    duck: { id: 'duck', name: 'بطة مطاطية', min: 1, max: 3, coins: [2, 2], float: true }
  };
  LL.JUNK_IDS = ['boot', 'duck', 'teapot', 'chest'];

  /* ------------------------------------------------------------- places */
  // surface/bed: the water line and the lake floor; x0/x1: where fish turn back;
  // aim: where the hook may go; holes: the ice holes a hook goes through;
  // junk: the spots where funny things wait; goals: catch n fish here, catch species sp,
  // catch one of at least w tenths of a kg.
  function place(id, name, surface, bed, fishN, extra) {
    var p = { id: id, name: name, surface: surface, bed: bed, x0: 330, x1: 1250, aim: [380, 1215], fishN: fishN, holes: null,
      current: 0, night: false, junk: [], goals: null, species: [] };
    for (var k in extra) p[k] = extra[k];
    return p;
  }
  LL.PLACES = [
    place('pond', 'بركة القرية', 236, 676, 7, { junk: [{ x: 760, y: 652 }, { x: 1120, y: 234, float: true }], goals: { n: 5, sp: 'catfish', w: 20 } }),
    place('river', 'النهر', 226, 680, 7, { current: 1, junk: [{ x: 640, y: 656 }, { x: 1010, y: 658 }], goals: { n: 6, sp: 'pike', w: 30 } }),
    place('sea', 'الشاطئ', 222, 684, 8, { junk: [{ x: 900, y: 660 }, { x: 560, y: 222, float: true }], goals: { n: 6, sp: 'puffer', w: 20 } }),
    place('ice', 'البحيرة المتجمدة', 232, 680, 7, { holes: [520, 800, 1080], junk: [{ x: 800, y: 656 }, { x: 1080, y: 660 }], goals: { n: 6, sp: 'grayling', w: 25 } }),
    place('lagoon', 'البحيرة السحرية', 236, 676, 7, { night: true, junk: [{ x: 700, y: 652 }, { x: 1040, y: 654 }], goals: { n: 6, sp: 'golden', w: 25 } })
  ];
  LL.SPECIES.forEach(function (s) { LL.PLACES[s.place].species.push(s.i); });
  LL.ROUND_IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'duo'];
  LL.roundId = function (p) { return 'p' + (clamp(p | 0, 0, 4) + 1); };
  // The rod tips: player 1 on the dock at the left, player 2 in the boat at the right.
  LL.ROD = [{ x: 330, y: 66 }, { x: 990, y: 92 }];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function tierOf(t) { t = Math.round(Number(t)); return t >= 1 && t <= LL.TIERS ? t : 1; }
  LL.clamp = clamp;
  // Seeded random numbers (mulberry32), so a session replays exactly in tests.
  LL.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  function knob(w, key) { return LL.TUNE[key][w.tier - 1]; }
  LL.knob = knob;
  function between(w, a, b) { return a + w.rand() * (b - a); }

  /* --------------------------------------------------------------- rods */
  LL.RODS = ['zone', 'reel', 'lure', 'bait'];
  LL.ROD_MAX = 3;
  LL.ROD_COST = { zone: [25, 60, 120], reel: [25, 60, 120], lure: [40, 90, 160], bait: [30, 70, 130] };
  // What the upgrades do: a bigger catch zone, a stronger reel (fills faster, drains
  // slower), a shiny lure (rare fish come more often), tasty bait (fish notice sooner).
  LL.rodMods = function (rods) {
    rods = rods || {};
    var lv = function (k) { return clamp(rods[k] | 0, 0, LL.ROD_MAX); };
    return { zone: 1 + 0.12 * lv('zone'), fill: 1 + 0.2 * lv('reel'), drain: 1 - 0.12 * lv('reel'), lure: lv('lure'), bait: 1 + 0.18 * lv('bait') };
  };
  LL.rodCost = function (save, kind) { var l = save.rods[kind] | 0; return l >= LL.ROD_MAX ? 0 : LL.ROD_COST[kind][l]; };
  LL.buy = function (save, kind) {
    var cost = LL.rodCost(save, kind);
    if (!cost || save.coins < cost) return false;
    save.coins -= cost; save.rods[kind]++;
    return true;
  };

  /* -------------------------------------------------------------- world */
  // o: { place, duo, tier, rods, seed, boost (a species id that comes more often),
  //      fishN (fish kept in the lake), junk (false: no junk) }
  LL.create = function (o) {
    o = o || {};
    var pi = clamp(o.place | 0, 0, 4), P = LL.PLACES[pi];
    var w = {
      place: pi, P: P, duo: !!o.duo, tier: tierOf(o.duo ? LL.DUO_TIER : o.tier), mods: LL.rodMods(o.duo ? null : o.rods),
      rand: LL.rng(o.seed == null ? 1 : o.seed), t: 0, fish: [], junk: [], players: [], ev: [], next: 1,
      want: o.fishN != null ? o.fishN : P.fishN + (o.duo ? 3 : 0), spawnT: 1, boost: o.boost || '',
      left: o.duo ? LL.DUO_SECONDS : 0, over: false, overtime: 0, landed: 0
    };
    addPlayer(w, 0);
    if (w.duo) addPlayer(w, 1);
    if (o.junk !== false) P.junk.forEach(function (s) { w.junk.push({ x: s.x, y: s.y, float: !!s.float, kind: '', wait: 0, t: 0 }); });
    w.junk.forEach(function (j) { fillJunk(w, j); });
    for (var i = 0; i < w.want; i++) spawn(w, true);
    return w;
  };
  function addPlayer(w, i) {
    var P = w.P, rod = LL.ROD[i];
    var bounds = w.duo ? (i ? [420, 1040] : [380, 1010]) : P.aim;
    var p = {
      i: i, rod: { x: rod.x, y: rod.y }, side: i ? -1 : 1, x0: bounds[0], x1: bounds[1],
      aim: { x: w.duo ? (i ? 820 : 600) : 640, y: P.surface + (P.bed - P.surface) * 0.42 },
      state: 'ready', t: 0, dur: 0, from: { x: rod.x, y: rod.y }, to: { x: 0, y: 0 },
      bob: { x: rod.x, y: rod.y }, hook: { x: rod.x, y: rod.y }, fish: 0, junk: null, reel: null,
      biteT: 0, calm: 0, snag: 0, recast: false, dip: 0, casts: 0, catches: [], total: 0, last: null, streak: 0
    };
    w.players.push(p);
    return p;
  }
  // Where a hook aimed at (x, y) goes: inside the water and the player's reach, and on
  // the ice through the nearest hole.
  LL.target = function (w, p, x, y) {
    var P = w.P;
    x = clamp(x, p.x0, p.x1);
    if (P.holes) {
      var best = P.holes[0];
      for (var i = 1; i < P.holes.length; i++) if (Math.abs(P.holes[i] - x) < Math.abs(best - x)) best = P.holes[i];
      x = best;
    }
    return { x: x, y: clamp(y, P.surface + 40, P.bed - 28) };
  };
  LL.aimTarget = function (w, p) { return LL.target(w, p, p.aim.x, p.aim.y); };

  /* --------------------------------------------------------------- fish */
  function spOf(f) { return LL.SPECIES[f.sp]; }
  LL.spOf = spOf;
  function pickSpecies(w) {
    var list = w.P.species, total = 0, weights = [], i;
    for (i = 0; i < list.length; i++) {
      var s = LL.SPECIES[list[i]], k = [0, 10, 4, 1.3][s.rarity] * (s.legend ? 0.4 : 1);
      if (s.rarity >= 2) k *= 1 + 0.55 * w.mods.lure;
      if (w.boost === s.id) k *= 2.5;
      // Keep the lake varied: fewer of a species that is already swimming here.
      for (var j = 0; j < w.fish.length; j++) if (w.fish[j].sp === s.i) k *= 0.6;
      weights.push(k); total += k;
    }
    var r = w.rand() * total;
    for (i = 0; i < list.length; i++) { r -= weights[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }
  function depthY(w, s, d) {
    var P = w.P;
    if (s.move === 'bed') return P.bed - 18 - s.len * 0.18;
    return P.surface + 44 + (P.bed - P.surface - 92) * d;
  }
  // The y where species s swims, d from 0 (top of its band) to 1 (bottom).
  LL.depthOf = function (w, s, d) { return depthY(w, s, s.d0 + (s.d1 - s.d0) * clamp(d, 0, 1)); };
  // A fish of species index sp at (x, y); x and y may be left out for a random one.
  LL.spawnFish = function (w, sp, x, y, dir) {
    var s = LL.SPECIES[sp], P = w.P;
    var w10 = Math.round(s.min + (s.max - s.min) * Math.pow(w.rand(), 1.7));
    var f = {
      id: w.next++, sp: sp, x: x, y: 0, by: 0, dir: dir || (w.rand() < 0.5 ? -1 : 1),
      v: s.speed * (0.85 + 0.3 * w.rand()), ph: w.rand() * 6.283, t: 0, amp: s.move === 'swim' ? 4 + w.rand() * 6 : 0,
      state: 'swim', st: 0, nib: 0, p: -1, cool: 0, turn: 2 + w.rand() * 5, walk: 0, leave: w.rand() < 0.3,
      w10: w10, size: 0.85 + 0.38 * (w10 - s.min) / Math.max(1, s.max - s.min), wig: 0
    };
    f.by = y != null ? y : depthY(w, s, s.d0 + (s.d1 - s.d0) * w.rand());
    f.y = f.tby = f.by;
    if (x == null) f.x = P.x0 + 40 + w.rand() * (P.x1 - P.x0 - 80);
    w.fish.push(f);
    return f;
  };
  function spawn(w, anywhere) {
    var sp = pickSpecies(w), P = w.P, fromLeft = w.rand() < 0.5;
    var x = anywhere ? null : fromLeft ? P.x0 - 70 : W + 70;
    var f = LL.spawnFish(w, sp, x, null, anywhere ? 0 : fromLeft ? 1 : -1);
    if (!anywhere) f.leave = false;
    w.ev.push({ t: 'spawn', id: f.id });
    return f;
  }
  function fishById(w, id) { for (var i = 0; i < w.fish.length; i++) if (w.fish[i].id === id) return w.fish[i]; return null; }
  LL.fishById = fishById;
  // The point of a fish that takes the hook.
  function mouth(f) {
    var s = spOf(f), L = s.len * f.size;
    if (s.kind === 'crab' || s.kind === 'star' || s.kind === 'jelly') return { x: f.x, y: f.y - L * 0.22 };
    return { x: f.x + f.dir * L * 0.46, y: f.y + L * 0.04 };
  }
  LL.mouth = mouth;
  function release(w, f, flee, cool) {
    var p = f.p >= 0 ? w.players[f.p] : null;
    if (p && p.fish === f.id) p.fish = 0;
    f.p = -1; f.cool = cool;
    if (flee) {
      f.state = 'flee'; f.st = 1.3;
      if (p) f.dir = f.x < p.hook.x ? -1 : 1;
      f.wig = 1;
    } else f.state = 'swim';
  }
  function swim(w, f, dt) {
    var s = spOf(f), P = w.P, k = knob(w, 'swim');
    if (s.move === 'bed') {
      // Crabs and stars walk along the floor with little stops.
      f.walk -= dt;
      if (f.walk <= -1.2) f.walk = 1.2 + w.rand() * 2.2;
      if (f.walk > 0) f.x += f.dir * f.v * 0.7 * k * dt;
      f.y = f.by;
    } else {
      f.x += f.dir * f.v * k * dt;
      f.by += (f.tby - f.by) * Math.min(1, dt * 0.7);
      f.y = f.by + Math.sin(f.t * (s.move === 'drift' ? 0.9 : 1.6) + f.ph) * (s.move === 'drift' ? 22 : f.amp);
    }
    f.turn -= dt;
    if (f.turn <= 0) {
      f.turn = 3 + w.rand() * 6;
      if (w.rand() < 0.3 && f.x > P.x0 && f.x < P.x1) f.dir = -f.dir;
      if (s.move !== 'bed') f.tby = clamp(f.by + (w.rand() - 0.5) * 70, depthY(w, s, s.d0), depthY(w, s, s.d1));
    }
    if ((f.x < P.x0 - 50 && f.dir < 0) || (f.x > P.x1 + 40 && f.dir > 0)) {
      if (f.leave) f.gone = true; else { f.dir = -f.dir; f.leave = w.rand() < 0.3; }
    }
  }
  // Moves f towards (x, y) at speed v; true when it is there.
  function toward(f, x, y, v, dt) {
    var dx = x - f.x, dy = y - f.y, d = Math.sqrt(dx * dx + dy * dy), step = v * dt;
    if (d <= step || d < 0.5) { f.x = x; f.y = y; return true; }
    f.x += dx / d * step; f.y += dy / d * step;
    return false;
  }
  // Puts the fish's mouth on the hook.
  function stick(f, p, dt) {
    var s = spOf(f), L = s.len * f.size, m = s.kind === 'crab' || s.kind === 'star' || s.kind === 'jelly';
    var tx = m ? p.hook.x : p.hook.x - f.dir * L * 0.46, ty = m ? p.hook.y + L * 0.22 : p.hook.y - L * 0.04;
    return toward(f, tx, ty, Math.max(60, s.speed * 1.4), dt);
  }
  function updateFish(w, f, dt) {
    var s = spOf(f), p = f.p >= 0 ? w.players[f.p] : null;
    f.t += dt;
    if (f.cool > 0) f.cool -= dt;
    if (f.wig > 0) f.wig = Math.max(0, f.wig - dt * 0.8);
    if (p && (p.fish !== f.id || (p.state !== 'wait' && p.state !== 'bite' && p.state !== 'reel'))) {
      if (f.state !== 'hooked') release(w, f, false, 2);
      p = null;
    }
    switch (f.state) {
      case 'swim': swim(w, f, dt); break;
      case 'notice':
        f.dir = p.hook.x >= f.x ? 1 : -1;
        f.st -= dt;
        if (f.st <= 0) { f.state = 'approach'; f.st = 6; }
        break;
      case 'approach':
        f.dir = p.hook.x >= f.x ? 1 : -1;
        f.st -= dt;
        if (stick(f, p, dt)) {
          f.state = 'nibble'; f.st = between(w, 0.55, 1.05);
          f.nib = knob(w, 'nibMin') + Math.floor(w.rand() * (knob(w, 'nibMax') - knob(w, 'nibMin') + 1));
          w.ev.push({ t: 'arrive', p: p.i, id: f.id });
        } else if (f.st <= 0) release(w, f, false, 4);
        break;
      case 'nibble':
        stick(f, p, dt);
        f.st -= dt;
        if (f.st <= 0) {
          if (f.nib > 0) {
            // A nibble is a fake-out: the bobber dips a little, nothing more.
            f.nib--; f.st = between(w, 0.75, 1.3); p.dip = 1;
            w.ev.push({ t: 'nibble', p: p.i, id: f.id, x: p.bob.x, y: p.bob.y });
          } else {
            f.state = 'bite';
            p.state = 'bite'; p.biteT = knob(w, 'bite'); p.t = 0;
            w.ev.push({ t: 'bite', p: p.i, id: f.id, x: p.bob.x, y: p.bob.y, junk: false });
          }
        }
        break;
      case 'bite': stick(f, p, dt); break;
      case 'hooked': break;
      case 'flee':
        f.x += f.dir * Math.max(90, s.speed * 2) * dt;
        f.y += Math.sin(f.t * 18) * 30 * dt * f.wig;
        f.st -= dt;
        if (f.st <= 0) { f.state = 'swim'; f.leave = true; f.by = f.y; f.tby = clamp(f.y, depthY(w, s, s.d0), depthY(w, s, s.d1)); }
        if (f.x < -120 || f.x > W + 120) f.gone = true;
        break;
    }
  }
  // Fish in reach of a waiting hook may notice it («؟»), then swim over.
  function lookForFish(w, p, dt) {
    var R = knob(w, 'reach') * w.mods.bait, Ry = R * 0.5, best = null, near = Infinity;
    for (var i = 0; i < w.fish.length; i++) {
      var f = w.fish[i];
      if (f.state !== 'swim' || f.cool > 0 || f.gone || f.x < w.P.x0 - 10 || f.x > W - 20) continue;
      var m = mouth(f), dx = Math.abs(m.x - p.hook.x), dy = Math.abs(m.y - p.hook.y);
      if (dx > R || dy > Ry) continue;
      var d = dx + dy * 1.5;
      if (d < near) { near = d; best = f; }
    }
    if (!best) return;
    var s = spOf(best), chance = knob(w, 'eager') * w.mods.bait * (s.legend ? 0.5 : s.rarity === 3 ? 0.8 : 1);
    if (w.rand() < chance * dt) {
      best.state = 'notice'; best.st = 0.6; best.p = p.i; p.fish = best.id; p.snag = 0;
      w.ev.push({ t: 'notice', p: p.i, id: best.id, x: best.x, y: best.y });
    }
  }

  /* --------------------------------------------------------------- junk */
  function fillJunk(w, j) {
    var opts = j.float ? ['duck'] : w.P.night ? ['boot', 'teapot', 'chest', 'chest'] : ['boot', 'teapot', 'boot', 'teapot', 'chest'];
    if (j.float && w.P.holes) { j.kind = ''; return; }
    j.kind = opts[Math.floor(w.rand() * opts.length)];
    j.t = w.rand() * 6;
  }
  function junkNear(w, p) {
    for (var i = 0; i < w.junk.length; i++) {
      var j = w.junk[i];
      if (!j.kind || j.taken) continue;
      if (Math.abs(j.x - p.hook.x) < 74 && Math.abs(j.y - p.hook.y) < (j.float ? 110 : 74)) return j;
    }
    return null;
  }

  /* ------------------------------------------------------------ players */
  function cast(w, p) {
    var to = LL.aimTarget(w, p), P = w.P, dx = to.x - p.rod.x, dy = P.surface - p.rod.y;
    p.state = 'cast'; p.t = 0; p.recast = false;
    p.from = { x: p.rod.x, y: p.rod.y }; p.to = to;
    p.dur = 0.36 + Math.sqrt(dx * dx + dy * dy) / 2100;
    p.arc = LL.arcHeight(dx);
    p.casts++; p.snag = 0; p.fish = 0; p.junk = null;
    w.ev.push({ t: 'cast', p: p.i, x: to.x, y: to.y });
  }
  LL.arcHeight = function (dx) { return 36 + Math.abs(dx) * 0.08; };
  // The bobber's flight from the rod tip to the water above the aim, t in 0..1.
  LL.arcPoint = function (from, to, surface, arc, t) {
    return { x: from.x + (to.x - from.x) * t, y: from.y + (surface - from.y) * t - arc * 4 * t * (1 - t) };
  };
  function reelBack(w, p, recast) {
    p.state = 'back'; p.t = 0; p.recast = !!recast;
    p.from = { x: p.hook.x, y: p.hook.y };
    if (p.fish) { var f = fishById(w, p.fish); if (f) release(w, f, false, 3); }
    p.fish = 0; p.junk = null;
    w.ev.push({ t: 'back', p: p.i });
  }
  function press(w, p) {
    var f = p.fish ? fishById(w, p.fish) : null;
    if (p.state === 'ready') {
      if (w.duo && w.left <= 0) return;
      cast(w, p);
    } else if (p.state === 'wait') {
      if (f && f.state === 'nibble') {
        // Too soon: the fish swims off (gently), the hook stays where it is.
        release(w, f, true, 5);
        p.calm = 1;
        w.ev.push({ t: 'spook', p: p.i, id: f.id, x: f.x, y: f.y });
      } else reelBack(w, p, !(w.duo && w.left <= 0));
    } else if (p.state === 'bite') hook(w, p, f);
  }
  function hook(w, p, f) {
    var s = f ? spOf(f) : null, pull = f ? LL.PULL[s.pull] : LL.PULL[0];
    var h = clamp(knob(w, 'zone') * w.mods.zone, 0.1, 0.62);
    p.state = 'reel'; p.t = 0;
    p.reel = { h: h, z: 0, zv: 0, f: 0.72 + w.rand() * 0.2, ft: 0, fv: 0, rest: 0.4, meter: knob(w, 'meter0'), pull: pull,
      dash: 0, peak: 0, junk: !f, inZone: false, hold: false };
    p.reel.ft = p.reel.f;
    if (f) { f.state = 'hooked'; f.st = 0; f.hx = f.x; f.hy = f.y; }
    else p.junk.taken = true;
    w.ev.push({ t: 'hooked', p: p.i, id: f ? f.id : 0, junk: !f, x: p.bob.x, y: p.bob.y });
  }
  // The reel bar: hold to lift the catch zone, let go and it sinks. The fish keeps out of
  // the zone's resting place at the bottom, so nobody lands a fish without holding.
  function reelStep(w, p, dt, hold) {
    var r = p.reel, pull = r.pull, vmax = LL.ZONE_V;
    r.hold = !!hold;
    var tv = hold ? vmax : -vmax;
    r.zv += (tv - r.zv) * Math.min(1, knob(w, 'snap') * dt);
    r.z += r.zv * dt;
    if (r.z < 0) { r.z = 0; r.zv = Math.max(0, r.zv); }
    if (r.z > 1 - r.h) { r.z = 1 - r.h; r.zv = Math.min(0, r.zv); }
    var lo = Math.min(0.9, r.h + 0.06), hi = 0.97;
    if (r.rest > 0) { r.rest -= dt; r.fv = 0; }
    else {
      var v = pull.v * (r.junk ? 1 : knob(w, 'dart')) * (r.dash > 0 ? 1.6 : 1), d = r.ft - r.f, step = v * dt;
      r.fv = d > 0 ? v : -v;
      if (Math.abs(d) <= step) {
        r.f = r.ft; r.dash = 0;
        r.rest = between(w, pull.rest[0], pull.rest[1]) * (r.junk ? 1 : knob(w, 'rest'));
        var j = pull.jump * (0.5 + w.rand() * 0.5);
        r.ft = clamp(r.f + (w.rand() < 0.5 ? -j : j), lo, hi);
        if (Math.abs(r.ft - r.f) < j * 0.5) r.ft = clamp(r.f + (r.ft > (lo + hi) / 2 ? -j : j), lo, hi);
        if (w.rand() < pull.dash) r.dash = 1;
      } else r.f += d > 0 ? step : -step;
    }
    r.f = clamp(r.f, lo - 0.001, hi);
    var tol = 0.025;
    r.inZone = r.f >= r.z - tol && r.f <= r.z + r.h + tol;
    if (r.inZone) r.meter += knob(w, 'fill') * w.mods.fill * dt;
    else r.meter -= knob(w, 'drain') * w.mods.drain * dt;
    r.meter = clamp(r.meter, 0, 1);
    if (r.meter > r.peak) r.peak = r.meter;
    if (r.meter >= 1) land(w, p);
    else if (r.meter <= 0) lose(w, p);
  }
  LL.weightText = function (w10) { return (w10 / 10).toFixed(1); };
  function land(w, p) {
    var f = p.fish ? fishById(w, p.fish) : null, c;
    if (f) {
      var s = spOf(f);
      c = { junk: false, sp: f.sp, id: s.id, w10: f.w10, coins: [0, 3, 8, 20][s.rarity] + (s.legend ? 60 : 0) + Math.floor(f.w10 / 10), place: w.place };
      f.gone = true;
    } else {
      var J = LL.JUNK[p.junk.kind], jw = Math.round(J.min + (J.max - J.min) * w.rand());
      c = { junk: true, sp: -1, id: J.id, w10: jw, coins: J.coins[0] + Math.floor(w.rand() * (J.coins[1] - J.coins[0] + 1)), place: w.place };
      p.junk.kind = ''; p.junk.taken = false; p.junk.wait = between(w, 22, 40);
    }
    p.catches.push(c);
    if (!c.junk) p.total += c.w10;
    p.last = c; p.streak++;
    p.state = 'land'; p.t = 0; p.fish = 0; p.junk = null;
    w.landed++;
    w.ev.push({ t: 'landed', p: p.i, c: c, peak: p.reel.peak });
  }
  function lose(w, p) {
    var f = p.fish ? fishById(w, p.fish) : null;
    if (f) { f.state = 'swim'; release(w, f, true, 8); }
    else if (p.junk) p.junk.taken = false;
    p.streak = 0;
    w.ev.push({ t: 'escape', p: p.i, junk: !f, sp: f ? f.sp : -1, x: f ? f.x : p.hook.x, y: f ? f.y : p.hook.y, peak: p.reel.peak });
    p.state = 'lost'; p.t = 0; p.fish = 0; p.junk = null;
  }
  function updatePlayer(w, p, dt, input) {
    var P = w.P;
    input = input || {};
    // Aiming: the mouse sets the aim, the keys move it.
    if (input.ax != null && input.ay != null) { p.aim.x = clamp(input.ax, p.x0, p.x1); p.aim.y = clamp(input.ay, P.surface + 40, P.bed - 28); }
    else if (input.mx || input.my) {
      p.aim.x = clamp(p.aim.x + (input.mx || 0) * LL.AIM_SPEED * dt, p.x0, p.x1);
      p.aim.y = clamp(p.aim.y + (input.my || 0) * LL.AIM_SPEED * 0.8 * dt, P.surface + 40, P.bed - 28);
    }
    if (p.calm > 0) p.calm -= dt;
    p.dip = Math.max(0, p.dip - dt * 3.2);
    p.t += dt;
    if (input.press) press(w, p);
    switch (p.state) {
      case 'cast': {
        var k = Math.min(1, p.t / p.dur), a = LL.arcPoint(p.from, p.to, P.surface, p.arc, k);
        p.bob.x = a.x; p.bob.y = a.y; p.hook.x = a.x; p.hook.y = a.y;
        if (k >= 1) {
          p.state = 'sink'; p.t = 0; p.bob.y = P.surface; p.hook.y = P.surface;
          w.ev.push({ t: 'splash', p: p.i, x: p.bob.x, y: P.surface });
        }
        break;
      }
      case 'sink':
        p.hook.y += 470 * dt;
        if (p.hook.y >= p.to.y) {
          p.hook.y = p.to.y; p.state = 'wait'; p.t = 0;
          w.ev.push({ t: 'sunk', p: p.i, x: p.hook.x, y: p.hook.y });
        }
        break;
      case 'wait':
      case 'bite':
        // The river slowly carries the hook downstream.
        if (P.current) {
          p.hook.x = Math.min(P.x1 - 20, p.hook.x + knob(w, 'current') * dt);
          p.bob.x = p.hook.x;
        }
        if (p.state === 'bite') {
          p.biteT -= dt;
          if (p.biteT <= 0) {
            // Too late: the fish wiggles away with the bait.
            var f = p.fish ? fishById(w, p.fish) : null;
            if (f) release(w, f, true, 6);
            if (p.junk) p.junk = null;
            p.state = 'wait'; p.t = 0; p.calm = 0.8; p.snag = 0; p.fish = 0;
            w.ev.push({ t: 'late', p: p.i, id: f ? f.id : 0, junk: !f, x: f ? f.x : p.hook.x, y: f ? f.y : p.hook.y });
          }
        } else if (!p.fish && p.calm <= 0 && !(w.duo && w.left <= 0)) {
          var j = junkNear(w, p);
          if (j) {
            p.snag += dt;
            // A funny thing snags the hook: one tug and the «!», no fake-outs.
            if (p.snag > 1.5) {
              p.snag = 0; p.junk = j; p.state = 'bite'; p.biteT = knob(w, 'bite') + 0.6; p.t = 0;
              w.ev.push({ t: 'bite', p: p.i, id: 0, x: p.bob.x, y: p.bob.y, junk: true, kind: j.kind });
            }
          } else p.snag = 0;
          if (!p.junk) lookForFish(w, p, dt);
        }
        break;
      case 'reel': {
        reelStep(w, p, dt, input.hold);
        // The fish comes closer as the meter fills, and splashes up at the end.
        var r = p.reel;
        if (p.state === 'reel') {
          var ff = p.fish ? fishById(w, p.fish) : null, m = r.meter, ex = p.rod.x + p.side * 150, ey = P.surface + 30;
          var hx = ff ? ff.hx : p.hook.x, hy = ff ? ff.hy : p.hook.y;
          var gx = hx + (ex - hx) * Math.pow(m, 1.25), gy = hy + (ey - hy) * Math.pow(m, 1.1);
          if (P.holes) gx = hx;
          var thrash = Math.sin(w.t * 9) * 18 * (1 - m * 0.6);
          if (ff) { ff.x = gx + thrash * 0.6; ff.y = gy + Math.cos(w.t * 7) * 8; ff.dir = p.side * (Math.sin(w.t * 2.3) > -0.3 ? -1 : 1); }
          p.hook.x = ff ? mouth(ff).x : gx; p.hook.y = ff ? mouth(ff).y : gy;
          p.bob.x = p.hook.x; p.bob.y = P.surface;
        }
        break;
      }
      case 'land':
        if (p.t >= 0.9) { p.state = 'ready'; p.t = 0; p.reel = null; }
        break;
      case 'lost':
        if (p.t >= 0.5) { reelBack(w, p, false); p.reel = null; }
        break;
      case 'back': {
        var b = Math.min(1, p.t / 0.32);
        p.hook.x = p.from.x + (p.rod.x - p.from.x) * b; p.hook.y = p.from.y + (p.rod.y - p.from.y) * b;
        p.bob.x = p.hook.x; p.bob.y = p.hook.y;
        if (b >= 1) { if (p.recast) cast(w, p); else { p.state = 'ready'; p.t = 0; } }
        break;
      }
      default:
        p.hook.x = p.rod.x; p.hook.y = p.rod.y; p.bob.x = p.rod.x; p.bob.y = p.rod.y;
    }
  }

  // One fixed step. inputs: one object per player, { ax, ay: the mouse aim in logical px
  // (or null), mx, my: -1..1 from the aiming keys, press: a press this step, hold: held }.
  LL.step = function (w, dt, inputs) {
    if (w.over) return w;
    inputs = inputs || [];
    w.t += dt;
    if (w.duo) {
      w.left = Math.max(0, w.left - dt);
      if (w.left <= 0) {
        w.overtime += dt;
        var reeling = false;
        w.players.forEach(function (p) {
          // Time is up: only a fish already on the line may still be landed.
          if (p.state === 'bite' || ((p.state === 'wait' || p.state === 'sink' || p.state === 'cast') && !p.ended)) { p.ended = true; reelBack(w, p, false); }
          if (p.state === 'reel') reeling = true;
        });
        if (!reeling || w.overtime >= LL.OVERTIME) {
          w.players.forEach(function (p) { if (p.state === 'reel') lose(w, p); });
          w.over = true; w.ev.push({ t: 'timeup' });
          return w;
        }
      }
    }
    for (var i = 0; i < w.players.length; i++) updatePlayer(w, w.players[i], dt, inputs[i]);
    for (i = 0; i < w.fish.length; i++) updateFish(w, w.fish[i], dt);
    for (i = w.fish.length - 1; i >= 0; i--) if (w.fish[i].gone) w.fish.splice(i, 1);
    for (i = 0; i < w.junk.length; i++) {
      var j = w.junk[i];
      j.t += dt;
      if (!j.kind && j.wait > 0) { j.wait -= dt; if (j.wait <= 0) fillJunk(w, j); }
    }
    w.spawnT -= dt;
    if (w.fish.length < w.want && w.spawnT <= 0) { spawn(w, false); w.spawnT = between(w, 1.2, 2.6); }
    return w;
  };

  /* ---------------------------------------------------------- derby */
  // 0: a draw, 1: player 1 wins, 2: player 2 wins.
  LL.duoWinner = function (w) {
    var a = w.players[0].total, b = w.players[1] ? w.players[1].total : 0;
    return a === b ? 0 : a > b ? 1 : 2;
  };
  LL.duoScore = function (w) { return Math.max(w.players[0].total, w.players[1] ? w.players[1].total : 0); };

  /* ------------------------------------------------- DDA outcomes */
  // 0..1 for Kit.dda, once per fish that came to the hook: landed 1, lost on the reel a
  // little for getting it hooked, a bite missed (too soon or too late) 0.
  LL.outcome = function (kind, peak) {
    if (kind === 'landed') return 1;
    if (kind === 'escape') return Math.round((0.15 + 0.25 * clamp(peak || 0, 0, 1)) * 1000) / 1000;
    return 0;
  };

  /* ------------------------------------------------------------ saves */
  // { v: 2, coins, caught: fish landed in all, book: { species id: best weight in tenths },
  //   junk: { junk id: how many }, places: [{ n: fish caught there, g: [0|1, 0|1, 0|1] }],
  //   rods: { zone, reel, lure, bait: 0..3 }, coach: the first fish was landed }
  LL.freshSave = function () {
    var places = [];
    for (var i = 0; i < 5; i++) places.push({ n: 0, g: [0, 0, 0] });
    return { v: 2, coins: 0, caught: 0, book: {}, junk: {}, places: places, rods: { zone: 0, reel: 0, lure: 0, bait: 0 }, coach: false };
  };
  function int(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
  // Every field is checked: an old save from the first version of the lake, a damaged or
  // a hand-edited one always loads as a playable save.
  LL.loadSave = function (raw) {
    var s = LL.freshSave(), r = obj(raw);
    if (!r || r.v !== 2) return s;
    s.coins = int(r.coins, 0, 9999999) ? r.coins : 0;
    s.caught = int(r.caught, 0, 9999999) ? r.caught : 0;
    var book = obj(r.book) || {};
    LL.SPECIES.forEach(function (sp) { if (int(book[sp.id], 1, 99999)) s.book[sp.id] = book[sp.id]; });
    var junk = obj(r.junk) || {};
    LL.JUNK_IDS.forEach(function (id) { if (int(junk[id], 1, 99999)) s.junk[id] = junk[id]; });
    var places = Array.isArray(r.places) ? r.places : [];
    for (var i = 0; i < 5; i++) {
      var pl = obj(places[i]);
      if (!pl) continue;
      s.places[i].n = int(pl.n, 0, 99999) ? pl.n : 0;
      var g = Array.isArray(pl.g) ? pl.g : [];
      for (var k = 0; k < 3; k++) s.places[i].g[k] = g[k] === 1 ? 1 : 0;
    }
    var rods = obj(r.rods) || {};
    LL.RODS.forEach(function (k) { s.rods[k] = int(rods[k], 0, LL.ROD_MAX) ? rods[k] : 0; });
    s.coach = r.coach === true;
    return s;
  };
  LL.stars = function (s, p) { var g = s.places[p].g; return g[0] + g[1] + g[2]; };
  LL.totalStars = function (s) { var n = 0; for (var i = 0; i < 5; i++) n += LL.stars(s, i); return n; };
  // A place opens with 2 stars in the place before it.
  LL.isOpen = function (s, p) { return p === 0 || (p > 0 && p < 5 && (LL.stars(s, p - 1) >= 2 || s.places[p].n > 0)); };
  LL.speciesCount = function (s) { var n = 0; for (var k in s.book) if (s.book[k] > 0) n++; return n; };
  // The place to fish next: the newest open place that still has a goal, else the newest.
  LL.nextPlace = function (s) {
    var top = 0;
    for (var i = 0; i < 5; i++) if (LL.isOpen(s, i)) top = i;
    for (i = top; i >= 0; i--) if (LL.stars(s, i) < 3) return i;
    return top;
  };
  // Records one solo catch at place p. Returns what changed, for the celebration.
  LL.applyCatch = function (s, p, c) {
    var out = { newSpecies: false, best: false, goals: [], unlocked: -1, coins: c.coins };
    s.coins = Math.min(9999999, s.coins + c.coins);
    if (c.junk) { s.junk[c.id] = Math.min(99999, (s.junk[c.id] || 0) + 1); return out; }
    var prev = s.book[c.id] || 0, pl = s.places[p], G = LL.PLACES[p].goals, wasOpen = p < 4 && LL.isOpen(s, p + 1);
    if (!prev) out.newSpecies = true; else if (c.w10 > prev) out.best = true;
    if (c.w10 > prev) s.book[c.id] = Math.min(99999, c.w10);
    s.caught = Math.min(9999999, s.caught + 1);
    pl.n = Math.min(99999, pl.n + 1);
    if (!pl.g[0] && pl.n >= G.n) { pl.g[0] = 1; out.goals.push(0); }
    if (!pl.g[1] && c.id === G.sp) { pl.g[1] = 1; out.goals.push(1); }
    if (!pl.g[2] && c.w10 >= G.w) { pl.g[2] = 1; out.goals.push(2); }
    if (p < 4 && !wasOpen && LL.isOpen(s, p + 1)) out.unlocked = p + 1;
    return out;
  };
})();
