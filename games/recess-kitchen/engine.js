/* Recess Kitchen (مطبخ الفسحة) pure simulation engine:
 * 12 handcrafted levels across 4 worlds (Sunny Canteen, Smoothie & Toast Bar,
 * Conveyor Kitchen, Ice Festival), 1P & 2P cooperative chefs, auto-chopping,
 * forgiving fryer/grill/blender cooking, plate assembly, conveyor belts,
 * slippery ice physics, VIP star orders, A* / BFS point-and-walk pathfinding,
 * stars, shop, and save validation.
 * Pure UMD: no DOM, no Kit, no timers, no Math.random. */
(function (root, factory) {
  'use strict';
  var RK = factory();
  if (typeof window !== 'undefined') window.RK = RK;
  if (typeof module === 'object' && module.exports) module.exports = RK;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RK = {};
  var W = 1280, H = 720;
  var COLS = 14, ROWS = 7, TILE = 76, X0 = 108, Y0 = 164;
  RK.W = W; RK.H = H;
  RK.COLS = COLS; RK.ROWS = ROWS; RK.TILE = TILE; RK.X0 = X0; RK.Y0 = Y0;

  RK.CR = 22;           // chef collision radius (leaves generous room in 76px corridors)
  RK.SPEED = 250;       // normal walking speed (px/s)
  RK.DASH_SPEED = 560;  // dash burst speed (px/s)
  RK.DASH_DUR = 0.16;   // dash duration (s)
  RK.DASH_CD = 0.62;    // dash cooldown (s)
  RK.REACH = 88;        // interaction reach from chef center to station center (px)
  RK.CHOP_DIST = 96;    // distance within which standing beside a cutting board auto-chops

  // DDA endpoints: 0 = extra gentle for a 6-year-old, 1 = brisk rush for an 11-year-old.
  RK.EASY = { patienceScale: 1.35, cookSpeed: 1.25, burnDelay: 14.0, goalScale: 0.8 };
  RK.HARD = { patienceScale: 0.82, cookSpeed: 0.90, burnDelay: 6.5, goalScale: 1.15 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  RK.clamp = clamp;

  RK.params = function (k) {
    k = clamp(+k || 0, 0, 1);
    var out = {};
    for (var key in RK.EASY) out[key] = RK.EASY[key] + (RK.HARD[key] - RK.EASY[key]) * k;
    return out;
  };

  // Seeded PRNG (mulberry32) for deterministic order queues and tests.
  RK.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ------------------------------------------------- worlds, dishes, shop */
  RK.WORLDS = [
    { id: 'canteen', name: 'نافذة الفلافل', color: '#ff9f1c', bg0: '#331d0c', bg1: '#522e14', floor0: '#fff8e7', floor1: '#ffe8b8', trim: '#e07a00' },
    { id: 'juice', name: 'ركن العصير والتوست', color: '#ff5d9e', bg0: '#2d1233', bg1: '#491a52', floor0: '#fff2f8', floor1: '#ffd9ec', trim: '#d62872' },
    { id: 'belt', name: 'حزام التوصيل', color: '#2ec4b6', bg0: '#0f2b2e', bg1: '#18454a', floor0: '#ebfcf9', floor1: '#cbf3ec', trim: '#0d9488' },
    { id: 'ice', name: 'مهرجان الجليد', color: '#5ce1e6', bg0: '#102042', bg1: '#1d3768', floor0: '#f0f8ff', floor1: '#dceeff', trim: '#4f46e5' }
  ];

  RK.ANIMALS = ['cat', 'bunny', 'bear', 'penguin', 'dino'];

  RK.DISHES = {
    wrap: { id: 'wrap', name: 'شطيرة فلافل', coins: 24, patience: 48, plate: true, recipe: ['bread', 'falafel'] },
    wrapTomato: { id: 'wrapTomato', name: 'فلافل بالطماطم', coins: 32, patience: 54, plate: true, recipe: ['bread', 'falafel', 'tomato'] },
    toastie: { id: 'toastie', name: 'توست الجبن', coins: 26, patience: 46, plate: false, recipe: ['bread', 'cheese'] },
    smoothieStrawberry: { id: 'smoothieStrawberry', name: 'عصير الفراولة', coins: 18, patience: 40, plate: false, recipe: ['strawberry'] },
    smoothieMango: { id: 'smoothieMango', name: 'عصير المانجو', coins: 18, patience: 40, plate: false, recipe: ['mango'] }
  };

  RK.APRONS = [
    { name: 'سماوي', body: '#38b6ff', trim: '#0284c7', price: 0 },
    { name: 'توتي', body: '#ff5d9e', trim: '#be185d', price: 50 },
    { name: 'شمسي', body: '#ffb703', trim: '#d97706', price: 80 },
    { name: 'نعناعي', body: '#2ec4b6', trim: '#0f766e', price: 110 },
    { name: 'بنفسجي', body: '#9b5de5', trim: '#6d28d9', price: 150 },
    { name: 'برتقالي', body: '#ff6b35', trim: '#c2410c', price: 190 }
  ];

  RK.HATS = [
    { id: 'toque', name: 'قبعة الطاهي', price: 0 },
    { id: 'crown', name: 'تاج ذهبي', price: 70 },
    { id: 'strawberry', name: 'قبعة الفراولة', price: 100 },
    { id: 'catears', name: 'أذنا قطة', price: 130 },
    { id: 'viking', name: 'خوذة الفايكنغ', price: 170 },
    { id: 'halo', name: 'هالة النجوم', price: 220 }
  ];

  /* --------------------------------------------------- 12 handcrafted maps */
  // Legend (14 cols x 7 rows):
  // # wall, C counter, . floor, I ice floor, = 1P walkable bridge (counter in 2P)
  // > < ^ v conveyor belt, S serving window, P plate rack, T confetti recycle bin
  // Crates: B bread, F falafelRaw, M tomatoRaw, H cheese, R strawberry, G mango
  // Appliances: K cutting board (chop), Y fryer, L panini grill, D blender
  // Spawns: 1 Chef 1 (always has walkable floor to its right!), 2 Chef 2
  RK.LEVELS = [
    // World 1: نافذة الفلافل (Sunny Canteen)
    {
      id: '1-1', world: 0, name: 'صباح الفلافل', duration: 70,
      dishes: ['wrap'], goals: [40, 75, 110], vip: false,
      map: [
        '#CPCSSSSCCCP##',
        'C............C',
        'B..1......2..Y',
        'B............Y',
        'C............C',
        'F............T',
        '#CCCCFFCCCCCC#'
      ]
    },
    {
      id: '1-2', world: 0, name: 'فلافل وعصير', duration: 70,
      dishes: ['wrap', 'smoothieStrawberry'], goals: [45, 85, 125], vip: false,
      map: [
        '#CPCSSSSCCCP##',
        'C............C',
        'B..1......2..Y',
        'F............Y',
        'C............D',
        'R............D',
        '#CCCRCCCCCTCC#'
      ]
    },
    {
      id: '1-3', world: 0, name: 'طماطم طازجة', duration: 75,
      dishes: ['wrap', 'wrapTomato', 'smoothieStrawberry'], goals: [55, 100, 145], vip: false,
      map: [
        '#CPCSSSSCCCP##',
        'C............C',
        'B..1......2..Y',
        'F............Y',
        'M............D',
        'R............T',
        '#CCKKCCCCKKCC#'
      ]
    },

    // World 2: ركن العصير والتوست (Smoothie & Toast Bar)
    {
      id: '2-1', world: 1, name: 'توست الجبن', duration: 70,
      dishes: ['toastie', 'smoothieMango'], goals: [50, 90, 130], vip: false,
      map: [
        '#CPCSSSSCCCP##',
        'B............L',
        'H..1......2..L',
        'C....CCCC....D',
        'G............D',
        'C............T',
        '#CCBHCCCCGGCC#'
      ]
    },
    {
      id: '2-2', world: 1, name: 'جزيرة الوسط', duration: 75,
      dishes: ['toastie', 'wrap', 'smoothieStrawberry', 'smoothieMango'], goals: [55, 100, 145], vip: false,
      map: [
        '#CPCSSSSCCCP##',
        'B..1......2..Y',
        'F............L',
        'H..CCCCCCCC..D',
        'R............D',
        'G............T',
        '#CCBCCFCCLCCC#'
      ]
    },
    {
      id: '2-3', world: 1, name: 'فسحة مزدحمة', duration: 80,
      dishes: ['wrapTomato', 'toastie', 'smoothieMango', 'smoothieStrawberry'], goals: [65, 115, 165], vip: false,
      map: [
        '#CPCSSSSCCCP##',
        'B..1......2..Y',
        'F............L',
        'M..CCK..KCC..D',
        'H............D',
        'R............T',
        '#CCGCCMCCYLCC#'
      ]
    },

    // World 3: حزام التوصيل (Conveyor Kitchen — walkable bridge in 1P, awesome pass-play in 2P!)
    {
      id: '3-1', world: 2, name: 'الحزام السريع', duration: 75,
      dishes: ['wrap', 'toastie', 'smoothieStrawberry'], goals: [45, 85, 125], vip: false,
      map: [
        '#CPSSS##SSSPC#',
        'B.1...##..2..Y',
        'F.....>>C....L',
        'H.....==.....D',
        'R....C<<.....D',
        'C.....##.....T',
        '#CTBCC##CCYLC#'
      ]
    },
    {
      id: '3-2', world: 2, name: 'خط الشطائر', duration: 80,
      dishes: ['wrapTomato', 'toastie', 'smoothieMango'], goals: [50, 90, 130], vip: false,
      map: [
        '#CPSSS##SSSPC#',
        'B.1...##..2..Y',
        'F.....>>C....L',
        'M.....==.....D',
        'G....C<<.....K',
        'H.....##.....T',
        '#CTKCC##CCYLD#'
      ]
    },
    {
      id: '3-3', world: 2, name: 'مصنع الفسحة', duration: 85,
      dishes: ['wrap', 'wrapTomato', 'toastie', 'smoothieStrawberry', 'smoothieMango'], goals: [55, 95, 140], vip: false,
      map: [
        '#CPSSS##SSSPC#',
        'B.1...>>C.2..Y',
        'F.....==.....L',
        'M....C<<.....D',
        'R.....>>C....K',
        'G.....##.....T',
        '#CTHKC##CCYLD#'
      ]
    },

    // World 4: مهرجان الجليد (Ice Festival — cheerful slippery ice & golden VIP star orders!)
    {
      id: '4-1', world: 3, name: 'أرضية الجليد', duration: 75,
      dishes: ['toastie', 'wrap', 'smoothieMango'], goals: [55, 100, 145], vip: true,
      map: [
        '#CPCSSSSCCCP##',
        'B.1IIIIIIII2.Y',
        'F.IIIIIIIIII.L',
        'H.IIIIIIIIII.D',
        'G.IIIIIIIIII.D',
        'C.IIIIIIIIII.T',
        '#CCBCCFCCYLCC#'
      ]
    },
    {
      id: '4-2', world: 3, name: 'تزلج وتوصيل', duration: 80,
      dishes: ['wrapTomato', 'toastie', 'smoothieStrawberry', 'smoothieMango'], goals: [60, 110, 155], vip: true,
      map: [
        '#CPCSSSSCCCP##',
        'B.1IIIIIIII2.Y',
        'F.IIIIIIIIII.L',
        'M..CCKIIKCC..D',
        'H.IIIIIIIIII.D',
        'R.IIIIIIIIII.T',
        '#CCGCCMCCYLCC#'
      ]
    },
    {
      id: '4-3', world: 3, name: 'حفلة النجوم', duration: 85,
      dishes: ['wrap', 'wrapTomato', 'toastie', 'smoothieStrawberry', 'smoothieMango'], goals: [65, 115, 165], vip: true,
      map: [
        '#CPCSSSSCCCP##',
        'B.1IIIIIIII2.Y',
        'F.IIIIIIIIII.L',
        'M..>>>>C..K..D',
        'H.IIIIIIIIII.D',
        'R.IIIIIIIIII.T',
        '#CCGCCKCCYLCC#'
      ]
    }
  ];

  /* --------------------------------------------------------- grid helpers */
  RK.cellCenter = function (c, r) {
    return { x: X0 + (c + 0.5) * TILE, y: Y0 + (r + 0.5) * TILE };
  };
  RK.cellAt = function (x, y) {
    return { c: Math.floor((x - X0) / TILE), r: Math.floor((y - Y0) / TILE) };
  };

  var CRATE_MAP = { B: 'bread', F: 'falafelRaw', M: 'tomatoRaw', H: 'cheese', R: 'strawberry', G: 'mango' };
  var BELT_DIRS = { '>': [1, 0], '<': [-1, 0], '^': [0, -1], 'v': [0, 1] };

  RK.walkable = function (w, c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    var t = w.grid[r][c];
    return t === '.' || t === 'I' || t === '=';
  };

  RK.stationAt = function (w, c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return w.stationGrid[r][c];
  };

  /* --------------------------------------------------- dish & plate logic */
  var PLATE_ORDER = { bread: 1, falafel: 2, tomato: 3, cheese: 4, toastie: 5 };
  function sortPlate(items) {
    items.sort(function (a, b) { return (PLATE_ORDER[a] || 9) - (PLATE_ORDER[b] || 9); });
    return items;
  }

  // Can ingredient kind `ing` be placed onto a plate currently holding `items`?
  function canAddToPlate(items, ing) {
    if (items.indexOf(ing) >= 0) return false;
    if (ing === 'toastie') return items.length === 0;
    if (items.indexOf('toastie') >= 0) return false;
    if (ing === 'cheese') {
      return items.length === 0 || (items.length === 1 && items[0] === 'bread');
    }
    if (items.indexOf('cheese') >= 0) {
      return ing === 'bread' && items.length === 1;
    }
    return ing === 'bread' || ing === 'falafel' || ing === 'tomato';
  }
  RK.canAddToPlate = canAddToPlate;

  // Returns the servable dish ID of a held item, or null if incomplete/raw.
  RK.dishOf = function (item) {
    if (!item) return null;
    if (item.kind === 'toastie') return 'toastie';
    if (item.kind === 'smoothieStrawberry') return 'smoothieStrawberry';
    if (item.kind === 'smoothieMango') return 'smoothieMango';
    if (item.kind === 'plate') {
      var it = item.items;
      if (it.length === 1 && it[0] === 'toastie') return 'toastie';
      if (it.indexOf('bread') >= 0 && it.indexOf('falafel') >= 0) {
        if (it.length === 2) return 'wrap';
        if (it.length === 3 && it.indexOf('tomato') >= 0) return 'wrapTomato';
      }
    }
    return null;
  };

  // Attempts to combine item `a` (on counter) and `b` (in chef's hand).
  // Returns { onCounter, inHand, ok: true } if combined, else null.
  function tryCombine(a, b) {
    if (!a || !b) return null;
    // Plate on counter + compatible ingredient in hand
    if (a.kind === 'plate' && canAddToPlate(a.items, b.kind)) {
      var nextA = sortPlate(a.items.concat([b.kind]));
      return { onCounter: { kind: 'plate', items: nextA }, inHand: null, ok: true };
    }
    // Compatible ingredient on counter + plate in hand -> scoop onto plate in hand!
    if (b.kind === 'plate' && canAddToPlate(b.items, a.kind)) {
      var nextB = sortPlate(b.items.concat([a.kind]));
      return { onCounter: null, inHand: { kind: 'plate', items: nextB }, ok: true };
    }
    // Two partial plates whose ingredients are all mutually compatible -> merge onto counter plate, keep clean plate in hand
    if (a.kind === 'plate' && b.kind === 'plate' && a.items.length > 0 && b.items.length > 0) {
      var merged = a.items.slice();
      for (var i = 0; i < b.items.length; i++) {
        if (!canAddToPlate(merged, b.items[i])) return null;
        merged.push(b.items[i]);
      }
      return { onCounter: { kind: 'plate', items: sortPlate(merged) }, inHand: { kind: 'plate', items: [] }, ok: true };
    }
    // Bread + Cheese directly on a counter -> rawToastie ready for grill
    if ((a.kind === 'bread' && b.kind === 'cheese') || (a.kind === 'cheese' && b.kind === 'bread')) {
      return { onCounter: { kind: 'rawToastie' }, inHand: null, ok: true };
    }
    return null;
  }
  RK.tryCombine = tryCombine;

  /* ----------------------------------------------------------- build/init */
  RK.create = function (levelIdx, opts) {
    levelIdx = clamp(levelIdx | 0, 0, RK.LEVELS.length - 1);
    opts = opts || {};
    var R = RK.LEVELS[levelIdx];
    var players = opts.players === 2 ? 2 : 1;
    var pScale = clamp(+opts.patienceScale || 1, 0.4, 2.5);
    var cSpeed = clamp(+opts.cookSpeed || 1, 0.4, 2.5);
    var bDelay = clamp(+opts.burnDelay || 10, 3, 30);
    var gScale = clamp(+opts.goalScale || 1, 0.5, 2.0);
    var rand = RK.rng(opts.seed || ((levelIdx + 1) * 7919 + players * 31));

    var grid = [], stationGrid = [], stations = [], spawns = [null, null], racks = [], belts = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [], srow = [];
      var line = R.map[r];
      for (var c = 0; c < COLS; c++) {
        var ch = line.charAt(c);
        var center = RK.cellCenter(c, r);
        var st = null;
        if (ch === '1' || ch === '2') {
          var idx = ch === '1' ? 0 : 1;
          // Inherit ice if surrounded by ice on row
          var neighborIce = line.charAt(Math.max(0, c - 1)) === 'I' || line.charAt(Math.min(COLS - 1, c + 1)) === 'I';
          var floorCh = neighborIce && R.world === 3 ? 'I' : '.';
          // Keep Chef 1's spawn tile itself crisp or ice — on World 4 row 1, '.' at c=1 and 'I' at c=3, let's check:
          // Actually '.' on spawn tile or 'I' both move immediately on ArrowRight! Using '.' on spawn gives clean footing at t=0.
          floorCh = '.';
          spawns[idx] = { x: center.x, y: center.y, c: c, r: r };
          row.push(floorCh);
          srow.push(null);
          continue;
        }
        if (ch === '.' || ch === 'I') {
          row.push(ch); srow.push(null); continue;
        }
        if (ch === '=') {
          if (players === 1) {
            row.push('='); srow.push(null); continue;
          }
          // In 2P mode, '=' becomes a solid pass-through counter!
          ch = 'C';
        }
        row.push('#');
        if (ch === '#') { srow.push(null); continue; }
        st = { c: c, r: r, x: center.x, y: center.y, type: 'counter', item: null };
        if (CRATE_MAP[ch]) {
          st.type = 'crate'; st.kind = CRATE_MAP[ch];
        } else if (BELT_DIRS[ch]) {
          st.type = 'belt'; st.dir = BELT_DIRS[ch]; st.beltT = 0; belts.push(st);
        } else if (ch === 'S') {
          st.type = 'serve';
        } else if (ch === 'P') {
          st.type = 'plates'; st.plates = 4; racks.push(st);
        } else if (ch === 'T') {
          st.type = 'trash';
        } else if (ch === 'K') {
          st.type = 'chop'; st.chopMilestone = 0;
        } else if (ch === 'Y') {
          st.type = 'fryer'; st.cook = { state: 'idle', prog: 0, over: 0 };
        } else if (ch === 'L') {
          st.type = 'grill'; st.parts = []; st.cook = { state: 'idle', prog: 0, over: 0 };
        } else if (ch === 'D') {
          st.type = 'blender'; st.fruit = null; st.cook = { state: 'idle', prog: 0, over: 0 };
        }
        stations.push(st);
        srow.push(st);
      }
      grid.push(row);
      stationGrid.push(srow);
    }

    var chefs = [];
    for (var p = 0; p < players; p++) {
      var sp = spawns[p] || RK.cellCenter(3 + p * 6, 2);
      chefs.push({
        id: p, x: sp.x, y: sp.y, sx: sp.x, sy: sp.y,
        vx: 0, vy: 0, dirX: p === 0 ? 1 : -1, dirY: 0,
        held: null, dashT: 0, dashCd: 0, moved: false, walk: 0,
        onIce: false, focus: null, nav: null
      });
    }

    var goals = R.goals.map(function (g) { return Math.max(20, Math.round(g * gScale / 5) * 5); });

    var w = {
      level: levelIdx, R: R, world: R.world, players: players,
      opts: { patienceScale: pScale, cookSpeed: cSpeed, burnDelay: bDelay, goalScale: gScale },
      rand: rand, grid: grid, stationGrid: stationGrid, stations: stations, racks: racks, belts: belts,
      chefs: chefs, orders: [], nextOrderId: 1, orderCount: 0, spawnTimer: 3.5,
      plateReturns: [], t: 0, timeLeft: R.duration, done: false,
      coins: 0, served: 0, expired: 0, burnt: 0, streak: 0, goals: goals, ev: []
    };

    // Spawn 2 initial customers immediately so players have clear goals on frame 1!
    spawnOrder(w, R.dishes[0], false);
    spawnOrder(w, R.dishes[1 % R.dishes.length], R.vip);
    updateFocus(w);
    return w;
  };

  function spawnOrder(w, forcedDish, forceVip) {
    var used = {};
    for (var i = 0; i < w.orders.length; i++) used[w.orders[i].slot] = true;
    var maxSlots = 4, slot = -1;
    for (var s = 0; s < maxSlots; s++) { if (!used[s]) { slot = s; break; } }
    if (slot < 0) return false;
    var dishes = w.R.dishes;
    var dish = forcedDish || dishes[Math.floor(w.rand() * dishes.length)];
    var spec = RK.DISHES[dish];
    var animal = RK.ANIMALS[(w.orderCount + Math.floor(w.rand() * 2)) % RK.ANIMALS.length];
    var vip = forceVip != null ? !!forceVip : (w.R.vip && (w.orderCount % 3 === 1));
    var maxT = Math.round(spec.patience * w.opts.patienceScale * (vip ? 0.92 : 1));
    w.orderCount++;
    var ord = { id: w.nextOrderId++, slot: slot, dish: dish, animal: animal, vip: vip, left: maxT, max: maxT };
    w.orders.push(ord);
    w.ev.push({ t: 'order', id: ord.id, slot: slot, dish: dish, animal: animal, vip: vip });
    return true;
  }

  /* --------------------------------------------------- BFS pathfinding */
  RK.findPath = function (w, startC, startR, goalC, goalR) {
    if (!RK.walkable(w, goalC, goalR)) return null;
    if (startC === goalC && startR === goalR) {
      var pt = RK.cellCenter(goalC, goalR);
      return [{ c: goalC, r: goalR, x: pt.x, y: pt.y }];
    }
    var seen = {}, prev = {}, q = [[startC, startR]];
    seen[startR * COLS + startC] = true;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var found = false;
    while (q.length) {
      var cur = q.shift(), cc = cur[0], cr = cur[1];
      if (cc === goalC && cr === goalR) { found = true; break; }
      for (var d = 0; d < 4; d++) {
        var nc = cc + dirs[d][0], nr = cr + dirs[d][1], key = nr * COLS + nc;
        if (!seen[key] && RK.walkable(w, nc, nr)) {
          seen[key] = true;
          prev[key] = [cc, cr];
          q.push([nc, nr]);
        }
      }
    }
    if (!found) return null;
    var out = [], kc = goalC, kr = goalR;
    while (!(kc === startC && kr === startR)) {
      var p = RK.cellCenter(kc, kr);
      out.unshift({ c: kc, r: kr, x: p.x, y: p.y });
      var pr = prev[kr * COLS + kc];
      kc = pr[0]; kr = pr[1];
    }
    return out;
  };

  // Click-to-walk-and-interact for 1P mouse/touch play!
  RK.clickAt = function (w, chefIdx, lx, ly) {
    var chef = w.chefs[chefIdx || 0];
    if (!chef || w.done) return false;
    var cell = RK.cellAt(lx, ly);
    var tc = clamp(cell.c, 0, COLS - 1), tr = clamp(cell.r, 0, ROWS - 1);
    var curCell = RK.cellAt(chef.x, chef.y);
    var sc = clamp(curCell.c, 0, COLS - 1), sr = clamp(curCell.r, 0, ROWS - 1);
    var st = RK.stationAt(w, tc, tr);

    if (st) {
      // Already orthogonally right next to this station? Face it and interact right now!
      if (Math.hypot(st.x - chef.x, st.y - chef.y) <= TILE + 8) {
        var dx = st.x - chef.x, dy = st.y - chef.y, dl = Math.hypot(dx, dy) || 1;
        chef.dirX = dx / dl; chef.dirY = dy / dl;
        chef.moved = true;
        chef.nav = null;
        updateChefFocus(w, chef);
        return interactWith(w, chef, st);
      }
      // Find shortest path to any walkable neighbor of `st`
      var neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      var bestPath = null, bestDist = Infinity;
      for (var i = 0; i < 4; i++) {
        var nc = tc + neighbors[i][0], nr = tr + neighbors[i][1];
        if (!RK.walkable(w, nc, nr)) continue;
        var path = RK.findPath(w, sc, sr, nc, nr);
        if (path) {
          var d = path.length * TILE + Math.hypot(RK.cellCenter(nc, nr).x - chef.x, RK.cellCenter(nc, nr).y - chef.y) * 0.1;
          if (d < bestDist) { bestDist = d; bestPath = path; }
        }
      }
      if (bestPath) {
        chef.nav = { path: bestPath, station: st, act: true };
        chef.moved = true;
        return true;
      }
      return false;
    }

    if (RK.walkable(w, tc, tr)) {
      var floorPath = RK.findPath(w, sc, sr, tc, tr);
      if (floorPath && floorPath.length) {
        chef.nav = { path: floorPath, station: null, act: false };
        chef.moved = true;
        return true;
      }
      // Same cell: walk directly to exact point
      chef.nav = { path: [{ c: tc, r: tr, x: clamp(lx, X0 + RK.CR + 2, X0 + COLS * TILE - RK.CR - 2), y: clamp(ly, Y0 + RK.CR + 2, Y0 + ROWS * TILE - RK.CR - 2) }], station: null, act: false };
      chef.moved = true;
      return true;
    }
    return false;
  };

  /* -------------------------------------------- focus & station targeting */
  function updateChefFocus(w, chef) {
    var best = null, bestScore = -Infinity;
    var probeX = chef.x + chef.dirX * 44, probeY = chef.y + chef.dirY * 44;
    var cc = RK.cellAt(chef.x, chef.y);
    for (var r = Math.max(0, cc.r - 1); r <= Math.min(ROWS - 1, cc.r + 1); r++) {
      for (var c = Math.max(0, cc.c - 1); c <= Math.min(COLS - 1, cc.c + 1); c++) {
        var st = w.stationGrid[r][c];
        if (!st) continue;
        var dx = st.x - chef.x, dy = st.y - chef.y, dist = Math.hypot(dx, dy);
        if (dist > RK.REACH) continue;
        var dot = (dx * chef.dirX + dy * chef.dirY) / (dist || 1);
        if (dot < -0.25) continue;
        var pd = Math.hypot(st.x - probeX, st.y - probeY);
        var score = dot * 40 - pd - dist * 0.3;
        if (score > bestScore) { bestScore = score; best = st; }
      }
    }
    chef.focus = best ? { c: best.c, r: best.r, type: best.type } : null;
    return best;
  }

  function updateFocus(w) {
    for (var i = 0; i < w.chefs.length; i++) updateChefFocus(w, w.chefs[i]);
  }

  /* --------------------------------------------------------- interactions */
  RK.interact = function (w, chefIdx) {
    var chef = w.chefs[chefIdx || 0];
    if (!chef || w.done) return false;
    chef.moved = true;
    var st = updateChefFocus(w, chef);
    return interactWith(w, chef, st);
  };

  function interactWith(w, chef, st) {
    if (!chef || !st || w.done) return false;
    chef.moved = true;
    var held = chef.held;

    // 1. Ingredient Crates
    if (st.type === 'crate') {
      if (!held) {
        chef.held = { kind: st.kind };
        w.ev.push({ t: 'pickup', kind: st.kind, chef: chef.id, x: st.x, y: st.y });
        return true;
      }
      // Put back untouched same raw item
      if (held.kind === st.kind && !held.prog) {
        chef.held = null;
        w.ev.push({ t: 'place', kind: st.kind, chef: chef.id, x: st.x, y: st.y });
        return true;
      }
      // Handy shortcut: holding a plate at Bread or Cheese crate adds directly onto plate!
      if (held.kind === 'plate' && (st.kind === 'bread' || st.kind === 'cheese') && canAddToPlate(held.items, st.kind)) {
        held.items = sortPlate(held.items.concat([st.kind]));
        w.ev.push({ t: 'assemble', chef: chef.id, x: st.x, y: st.y });
        return true;
      }
      // Kid-friendly shortcut: holding bread at Cheese crate (or cheese at Bread crate) stacks rawToastie in hand!
      if ((held.kind === 'bread' && st.kind === 'cheese') || (held.kind === 'cheese' && st.kind === 'bread')) {
        chef.held = { kind: 'rawToastie' };
        w.ev.push({ t: 'assemble', chef: chef.id, x: st.x, y: st.y });
        return true;
      }
      return false;
    }

    // 2. Plate Rack
    if (st.type === 'plates') {
      if (!held && st.plates > 0) {
        st.plates--;
        chef.held = { kind: 'plate', items: [] };
        w.ev.push({ t: 'pickup', kind: 'plate', chef: chef.id, x: st.x, y: st.y });
        return true;
      }
      if (held && held.kind === 'plate' && held.items.length === 0) {
        st.plates++;
        chef.held = null;
        w.ev.push({ t: 'place', kind: 'plate', chef: chef.id, x: st.x, y: st.y });
        return true;
      }
      // Holding a plateable food at the plate rack slips a clean plate right underneath it!
      if (held && st.plates > 0 && canAddToPlate([], held.kind)) {
        st.plates--;
        chef.held = { kind: 'plate', items: [held.kind] };
        w.ev.push({ t: 'assemble', chef: chef.id, x: st.x, y: st.y });
        return true;
      }
      return false;
    }

    // 3. Cutting Board
    if (st.type === 'chop') {
      if (!st.item) {
        if (held && held.kind === 'tomatoRaw') {
          st.item = { kind: 'tomatoRaw', prog: held.prog || 0 };
          st.chopMilestone = Math.floor((st.item.prog || 0) * 4);
          chef.held = null;
          w.ev.push({ t: 'place', kind: 'tomatoRaw', chef: chef.id, x: st.x, y: st.y });
          return true;
        }
        return false;
      }
      if (st.item.kind === 'tomatoRaw') {
        st.item.prog = Math.min(1, (st.item.prog || 0) + 0.28);
        w.ev.push({ t: 'chop', chef: chef.id, x: st.x, y: st.y });
        if (st.item.prog >= 1) {
          st.item = { kind: 'tomato' };
          w.ev.push({ t: 'chopped', chef: chef.id, x: st.x, y: st.y });
        }
        return true;
      }
      if (st.item.kind === 'tomato') {
        if (!held) {
          chef.held = { kind: 'tomato' };
          st.item = null;
          w.ev.push({ t: 'pickup', kind: 'tomato', chef: chef.id, x: st.x, y: st.y });
          return true;
        }
        if (held.kind === 'plate' && canAddToPlate(held.items, 'tomato')) {
          held.items = sortPlate(held.items.concat(['tomato']));
          st.item = null;
          w.ev.push({ t: 'assemble', chef: chef.id, x: st.x, y: st.y });
          return true;
        }
      }
      return false;
    }

    // 4. Fryer (falafelRaw -> falafel)
    if (st.type === 'fryer') {
      if (st.cook.state === 'burnt') {
        st.cook = { state: 'idle', prog: 0, over: 0 };
        st.item = null;
        w.ev.push({ t: 'toss', station: 'fryer', chef: chef.id, x: st.x, y: st.y });
        if (held && held.kind === 'falafelRaw') {
          chef.held = null;
          st.item = { kind: 'falafelRaw' };
          st.cook = { state: 'cooking', prog: 0, over: 0 };
          w.ev.push({ t: 'cookStart', station: 'fryer', chef: chef.id, x: st.x, y: st.y });
        }
        return true;
      }
      if (st.cook.state === 'idle') {
        if (held && held.kind === 'falafelRaw') {
          chef.held = null;
          st.item = { kind: 'falafelRaw' };
          st.cook = { state: 'cooking', prog: 0, over: 0 };
          w.ev.push({ t: 'cookStart', station: 'fryer', chef: chef.id, x: st.x, y: st.y });
          return true;
        }
        return false;
      }
      if (st.cook.state === 'done' || st.cook.state === 'warning') {
        if (!held) {
          chef.held = { kind: 'falafel' };
          st.item = null; st.cook = { state: 'idle', prog: 0, over: 0 };
          w.ev.push({ t: 'pickup', kind: 'falafel', chef: chef.id, x: st.x, y: st.y });
          return true;
        }
        if (held.kind === 'plate' && canAddToPlate(held.items, 'falafel')) {
          held.items = sortPlate(held.items.concat(['falafel']));
          st.item = null; st.cook = { state: 'idle', prog: 0, over: 0 };
          w.ev.push({ t: 'assemble', chef: chef.id, x: st.x, y: st.y });
          return true;
        }
      }
      return false;
    }

    // 5. Panini Grill (bread + cheese -> toastie)
    if (st.type === 'grill') {
      if (st.cook.state === 'burnt') {
        st.cook = { state: 'idle', prog: 0, over: 0 };
        st.parts = [];
        w.ev.push({ t: 'toss', station: 'grill', chef: chef.id, x: st.x, y: st.y });
        if (held && held.kind === 'rawToastie') {
          chef.held = null; st.parts = ['bread', 'cheese'];
          st.cook = { state: 'cooking', prog: 0, over: 0 };
          w.ev.push({ t: 'cookStart', station: 'grill', chef: chef.id, x: st.x, y: st.y });
        }
        return true;
      }
      if (st.cook.state === 'idle') {
        if (held) {
          if (held.kind === 'rawToastie' && st.parts.length === 0) {
            chef.held = null;
            st.parts = ['bread', 'cheese'];
            st.cook = { state: 'cooking', prog: 0, over: 0 };
            w.ev.push({ t: 'cookStart', station: 'grill', chef: chef.id, x: st.x, y: st.y });
            return true;
          }
          if (held.kind === 'plate' && held.items.length === 2 && held.items.indexOf('bread') >= 0 && held.items.indexOf('cheese') >= 0 && st.parts.length === 0) {
            held.items = [];
            st.parts = ['bread', 'cheese'];
            st.cook = { state: 'cooking', prog: 0, over: 0 };
            w.ev.push({ t: 'cookStart', station: 'grill', chef: chef.id, x: st.x, y: st.y });
            return true;
          }
          if ((held.kind === 'bread' || held.kind === 'cheese') && st.parts.indexOf(held.kind) < 0) {
            st.parts.push(held.kind);
            chef.held = null;
            if (st.parts.length === 2) {
              st.cook = { state: 'cooking', prog: 0, over: 0 };
              w.ev.push({ t: 'cookStart', station: 'grill', chef: chef.id, x: st.x, y: st.y });
            } else {
              w.ev.push({ t: 'place', kind: st.parts[0], chef: chef.id, x: st.x, y: st.y });
            }
            return true;
          }
          return false;
        }
        if (!held && st.parts.length === 1) {
          var part = st.parts.pop();
          chef.held = { kind: part };
          w.ev.push({ t: 'pickup', kind: part, chef: chef.id, x: st.x, y: st.y });
          return true;
        }
        return false;
      }
      if (st.cook.state === 'done' || st.cook.state === 'warning') {
        if (!held) {
          chef.held = { kind: 'toastie' };
          st.parts = []; st.cook = { state: 'idle', prog: 0, over: 0 };
          w.ev.push({ t: 'pickup', kind: 'toastie', chef: chef.id, x: st.x, y: st.y });
          return true;
        }
        if (held.kind === 'plate' && canAddToPlate(held.items, 'toastie')) {
          held.items = ['toastie'];
          st.parts = []; st.cook = { state: 'idle', prog: 0, over: 0 };
          w.ev.push({ t: 'assemble', chef: chef.id, x: st.x, y: st.y });
          return true;
        }
      }
      return false;
    }

    // 6. Swirling Blender (strawberry / mango -> smoothie, never burns!)
    if (st.type === 'blender') {
      if (st.cook.state === 'idle') {
        if (held && (held.kind === 'strawberry' || held.kind === 'mango')) {
          st.fruit = held.kind;
          chef.held = null;
          st.cook = { state: 'cooking', prog: 0, over: 0 };
          w.ev.push({ t: 'cookStart', station: 'blender', chef: chef.id, x: st.x, y: st.y });
          return true;
        }
        return false;
      }
      if (st.cook.state === 'done') {
        if (!held) {
          var smKind = st.fruit === 'mango' ? 'smoothieMango' : 'smoothieStrawberry';
          chef.held = { kind: smKind };
          st.fruit = null; st.cook = { state: 'idle', prog: 0, over: 0 };
          w.ev.push({ t: 'pickup', kind: smKind, chef: chef.id, x: st.x, y: st.y });
          return true;
        }
      }
      return false;
    }

    // 7. Counters & Conveyor Belts
    if (st.type === 'counter' || st.type === 'belt') {
      if (!st.item && held) {
        st.item = held;
        if (st.type === 'belt') st.beltT = 0;
        chef.held = null;
        w.ev.push({ t: 'place', kind: st.item.kind, chef: chef.id, x: st.x, y: st.y });
        return true;
      }
      if (st.item && !held) {
        chef.held = st.item;
        st.item = null;
        if (st.type === 'belt') st.beltT = 0;
        w.ev.push({ t: 'pickup', kind: chef.held.kind, chef: chef.id, x: st.x, y: st.y });
        return true;
      }
      if (st.item && held) {
        var comb = tryCombine(st.item, held);
        if (comb) {
          st.item = comb.onCounter;
          if (st.type === 'belt') st.beltT = 0;
          chef.held = comb.inHand;
          w.ev.push({ t: 'assemble', chef: chef.id, x: st.x, y: st.y });
          return true;
        }
      }
      return false;
    }

    // 8. Confetti Recycle Bin
    if (st.type === 'trash') {
      if (!held) return false;
      if (held.kind === 'plate') {
        if (!held.items.length) return false;
        held.items = [];
      } else {
        chef.held = null;
      }
      w.ev.push({ t: 'toss', station: 'trash', chef: chef.id, x: st.x, y: st.y });
      return true;
    }

    // 9. Serving Window
    if (st.type === 'serve') {
      var dish = RK.dishOf(held);
      if (!dish) {
        if (held) w.ev.push({ t: 'wrongOrder', chef: chef.id, x: st.x, y: st.y });
        return false;
      }
      // Match most urgent matching order (VIP tie-breaker)
      var matchIdx = -1, bestUrgency = Infinity;
      for (var i = 0; i < w.orders.length; i++) {
        var o = w.orders[i];
        if (o.dish !== dish) continue;
        var u = (o.left / o.max) - (o.vip ? 0.25 : 0);
        if (u < bestUrgency) { bestUrgency = u; matchIdx = i; }
      }
      if (matchIdx < 0) {
        w.ev.push({ t: 'wrongOrder', dish: dish, chef: chef.id, x: st.x, y: st.y });
        return false;
      }
      var servedOrd = w.orders.splice(matchIdx, 1)[0];
      var base = RK.DISHES[dish].coins;
      var tip = Math.round(6 * clamp(servedOrd.left / servedOrd.max, 0, 1));
      var bonus = Math.min(6, w.streak * 2);
      var earned = Math.round((base + tip) * (servedOrd.vip ? 1.5 : 1)) + bonus;
      w.coins += earned;
      w.served++;
      w.streak++;
      if (held.kind === 'plate') w.plateReturns.push(2.2);
      chef.held = null;
      w.ev.push({
        t: 'serve', dish: dish, coins: earned, vip: servedOrd.vip,
        slot: servedOrd.slot, animal: servedOrd.animal, chef: chef.id, x: st.x, y: st.y
      });
      if (w.orders.length < 2) w.spawnTimer = Math.min(w.spawnTimer, 1.1);
      return true;
    }

    return false;
  };

  /* --------------------------------------------------- physics & movement */
  function collideGrid(w, chef) {
    var cr = RK.CR;
    // Clamp inside kitchen outer boundaries
    chef.x = clamp(chef.x, X0 + cr, X0 + COLS * TILE - cr);
    chef.y = clamp(chef.y, Y0 + cr, Y0 + ROWS * TILE - cr);

    var cell = RK.cellAt(chef.x, chef.y);
    for (var r = Math.max(0, cell.r - 1); r <= Math.min(ROWS - 1, cell.r + 1); r++) {
      for (var c = Math.max(0, cell.c - 1); c <= Math.min(COLS - 1, cell.c + 1); c++) {
        if (RK.walkable(w, c, r)) continue;
        var x0 = X0 + c * TILE, y0 = Y0 + r * TILE, x1 = x0 + TILE, y1 = y0 + TILE;
        var nx = clamp(chef.x, x0, x1), ny = clamp(chef.y, y0, y1);
        var dx = chef.x - nx, dy = chef.y - ny;
        var d2 = dx * dx + dy * dy;
        if (d2 < cr * cr) {
          var d = Math.sqrt(d2);
          if (d > 1e-4) {
            var push = cr - d;
            chef.x += (dx / d) * push;
            chef.y += (dy / d) * push;
          } else {
            // Exact center overlap fallback
            var cx = x0 + TILE * 0.5, cy = y0 + TILE * 0.5;
            if (Math.abs(chef.x - cx) > Math.abs(chef.y - cy)) {
              chef.x = chef.x < cx ? x0 - cr : x1 + cr;
            } else {
              chef.y = chef.y < cy ? y0 - cr : y1 + cr;
            }
          }
        }
      }
    }
  }

  function stepChef(w, chef, dt, inp) {
    inp = inp || {};
    if (inp.click) RK.clickAt(w, chef.id, inp.click.x, inp.click.y);

    var mx = +inp.mx || 0, my = +inp.my || 0;
    var keyMoving = Math.hypot(mx, my) > 0.05;
    var navActive = false;
    if (keyMoving) {
      chef.nav = null;
      var ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      chef.moved = true;
    } else if (inp.hold && !chef.nav) {
      var hdx = inp.hold.x - chef.x, hdy = inp.hold.y - chef.y, hd = Math.hypot(hdx, hdy);
      if (hd > 14) { mx = hdx / hd; my = hdy / hd; chef.moved = true; }
    } else if (chef.nav && chef.nav.path.length) {
      navActive = true;
      var wp = chef.nav.path[0];
      var ndx = wp.x - chef.x, ndy = wp.y - chef.y, nd = Math.hypot(ndx, ndy);
      if (nd <= (chef.nav.path.length === 1 ? 14 : 18)) {
        chef.nav.path.shift();
        if (!chef.nav.path.length) {
          var targetSt = chef.nav.station, doAct = chef.nav.act;
          chef.nav = null;
          navActive = false;
          chef.vx *= 0.35; chef.vy *= 0.35;
          if (targetSt) {
            var sdx = targetSt.x - chef.x, sdy = targetSt.y - chef.y, sdl = Math.hypot(sdx, sdy) || 1;
            chef.dirX = sdx / sdl; chef.dirY = sdy / sdl;
            updateChefFocus(w, chef);
            if (doAct) interactWith(w, chef, targetSt);
          }
          mx = 0; my = 0;
        } else {
          wp = chef.nav.path[0];
          ndx = wp.x - chef.x; ndy = wp.y - chef.y; nd = Math.hypot(ndx, ndy) || 1;
          mx = ndx / nd; my = ndy / nd;
        }
      } else {
        mx = ndx / nd; my = ndy / nd;
      }
    }

    if (Math.hypot(mx, my) > 0.05) {
      var dl = Math.hypot(mx, my);
      chef.dirX = mx / dl; chef.dirY = my / dl;
    }

    if (chef.dashCd > 0) chef.dashCd = Math.max(0, chef.dashCd - dt);
    if (chef.dashT > 0) chef.dashT = Math.max(0, chef.dashT - dt);

    if (inp.dash && chef.dashCd <= 0) {
      chef.dashT = RK.DASH_DUR;
      chef.dashCd = RK.DASH_CD;
      chef.moved = true;
      var ddx = Math.hypot(mx, my) > 0.05 ? mx : chef.dirX;
      var ddy = Math.hypot(mx, my) > 0.05 ? my : chef.dirY;
      var ddl = Math.hypot(ddx, ddy) || 1;
      chef.vx = (ddx / ddl) * RK.DASH_SPEED;
      chef.vy = (ddy / ddl) * RK.DASH_SPEED;
      w.ev.push({ t: 'dash', chef: chef.id, x: chef.x, y: chef.y });
    }

    var curCell = RK.cellAt(chef.x, chef.y);
    var tile = (curCell.r >= 0 && curCell.r < ROWS && curCell.c >= 0 && curCell.c < COLS) ? w.grid[curCell.r][curCell.c] : '.';
    chef.onIce = tile === 'I';

    if (chef.dashT <= 0) {
      var wantVx = mx * RK.SPEED, wantVy = my * RK.SPEED;
      if (chef.onIce) {
        // Cheerful slippery ice physics: gradual acceleration & low friction glide!
        var iceRate = navActive ? 10.5 : (Math.hypot(mx, my) > 0.05 ? 4.2 : 1.7);
        var k = Math.min(1, dt * iceRate);
        chef.vx += (wantVx - chef.vx) * k;
        chef.vy += (wantVy - chef.vy) * k;
      } else {
        var normRate = Math.hypot(mx, my) > 0.05 ? 20 : 24;
        var kn = Math.min(1, dt * normRate);
        chef.vx += (wantVx - chef.vx) * kn;
        chef.vy += (wantVy - chef.vy) * kn;
        if (Math.hypot(mx, my) <= 0.05 && Math.hypot(chef.vx, chef.vy) < 8) { chef.vx = 0; chef.vy = 0; }
      }
    }

    var oldX = chef.x, oldY = chef.y;
    chef.x += chef.vx * dt;
    chef.y += chef.vy * dt;
    collideGrid(w, chef);
    var stepDist = Math.hypot(chef.x - oldX, chef.y - oldY);
    chef.walk += stepDist;
    if (stepDist > 0.05) chef.moved = true;

    if (inp.interact) RK.interact(w, chef.id);
  }

  /* ---------------------------------------------- appliances, belts, queue */
  function stepStations(w, dt) {
    var cs = w.opts.cookSpeed, bd = w.opts.burnDelay;
    for (var i = 0; i < w.stations.length; i++) {
      var st = w.stations[i];
      // Auto-chopping when any chef stands beside a cutting board with raw tomato!
      if (st.type === 'chop' && st.item && st.item.kind === 'tomatoRaw') {
        var near = false;
        for (var p = 0; p < w.chefs.length; p++) {
          if (Math.hypot(w.chefs[p].x - st.x, w.chefs[p].y - st.y) <= RK.CHOP_DIST) { near = true; break; }
        }
        if (near) {
          st.item.prog = (st.item.prog || 0) + dt * 0.68 * cs;
          var m = Math.floor(st.item.prog * 4);
          if (m > (st.chopMilestone || 0) && m < 4) {
            st.chopMilestone = m;
            w.ev.push({ t: 'chop', x: st.x, y: st.y });
          }
          if (st.item.prog >= 1) {
            st.item = { kind: 'tomato' };
            st.chopMilestone = 0;
            w.ev.push({ t: 'chopped', x: st.x, y: st.y });
          }
        }
      }

      // Fryer & Grill (cooking -> done -> warning wiggle -> cartoon burnt puff)
      if (st.type === 'fryer' || st.type === 'grill') {
        var baseDur = st.type === 'fryer' ? 2.8 : 3.0;
        var ck = st.cook;
        if (ck.state === 'cooking') {
          ck.prog += (dt * cs) / baseDur;
          if (ck.prog >= 1) {
            ck.prog = 1; ck.state = 'done'; ck.over = 0;
            w.ev.push({ t: 'cooked', station: st.type, x: st.x, y: st.y });
          }
        } else if (ck.state === 'done' || ck.state === 'warning') {
          ck.over += dt / bd;
          if (ck.state === 'done' && ck.over >= 0.5) {
            ck.state = 'warning';
            w.ev.push({ t: 'warn', station: st.type, x: st.x, y: st.y });
          }
          if (ck.over >= 1) {
            ck.over = 1; ck.state = 'burnt';
            w.burnt++;
            w.ev.push({ t: 'burn', station: st.type, x: st.x, y: st.y });
          }
        }
      }

      // Blender (cooking -> done, never burns!)
      if (st.type === 'blender' && st.cook.state === 'cooking') {
        st.cook.prog += (dt * cs) / 2.4;
        if (st.cook.prog >= 1) {
          st.cook.prog = 1; st.cook.state = 'done';
          w.ev.push({ t: 'cooked', station: 'blender', x: st.x, y: st.y });
        }
      }
    }

    // Conveyor belts: step downstream-first so chains of items advance smoothly together!
    for (var pass = w.belts.length - 1; pass >= 0; pass--) {
      var b = w.belts[pass];
      if (!b.item) { b.beltT = 0; continue; }
      var dst = RK.stationAt(w, b.c + b.dir[0], b.r + b.dir[1]);
      if (dst && (dst.type === 'belt' || dst.type === 'counter') && !dst.item) {
        b.beltT = (b.beltT || 0) + dt * 1.45;
        if (b.beltT >= 1) {
          dst.item = b.item;
          if (dst.type === 'belt') dst.beltT = 0;
          b.item = null; b.beltT = 0;
          w.ev.push({ t: 'beltMove', x: dst.x, y: dst.y });
        }
      } else {
        b.beltT = 0;
      }
    }

    // Clean plates magically return to the rack with the fewest plates
    for (var k = w.plateReturns.length - 1; k >= 0; k--) {
      w.plateReturns[k] -= dt;
      if (w.plateReturns[k] <= 0) {
        w.plateReturns.splice(k, 1);
        if (w.racks.length) {
          var targetRack = w.racks[0];
          for (var ri = 1; ri < w.racks.length; ri++) {
            if (w.racks[ri].plates < targetRack.plates) targetRack = w.racks[ri];
          }
          targetRack.plates++;
          w.ev.push({ t: 'plateReturn', x: targetRack.x, y: targetRack.y });
        }
      }
    }
  }

  function stepOrders(w, dt) {
    for (var i = w.orders.length - 1; i >= 0; i--) {
      var o = w.orders[i];
      o.left -= dt;
      if (o.left <= 0) {
        w.orders.splice(i, 1);
        w.expired++;
        w.streak = 0;
        w.ev.push({ t: 'expire', id: o.id, slot: o.slot, dish: o.dish });
        if (w.orders.length < 2) w.spawnTimer = Math.min(w.spawnTimer, 1.0);
      }
    }
    var cap = w.players === 2 ? 4 : (w.world === 0 ? 3 : 4);
    if (w.orders.length < cap) {
      w.spawnTimer -= dt;
      if (w.spawnTimer <= 0) {
        spawnOrder(w);
        w.spawnTimer = w.players === 2 ? 7.5 : 9.5;
      }
    }
  }

  RK.step = function (w, dt, inputs) {
    if (w.done) return;
    w.t += dt;
    w.timeLeft = Math.max(0, w.timeLeft - dt);
    if (w.timeLeft <= 0) {
      w.done = true;
      w.ev.push({ t: 'bell' });
      return;
    }

    var list = Array.isArray(inputs) ? inputs : [inputs || {}];
    for (var i = 0; i < w.chefs.length; i++) stepChef(w, w.chefs[i], dt, list[i] || {});

    // Soft chef-to-chef nudge in 2P co-op
    if (w.chefs.length === 2) {
      var a = w.chefs[0], b = w.chefs[1];
      var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), minD = RK.CR * 1.75;
      if (d < minD) {
        var nx = d > 0.01 ? dx / d : 1, ny = d > 0.01 ? dy / d : 0;
        var sep = (minD - d) * 0.5;
        a.x -= nx * sep; a.y -= ny * sep;
        b.x += nx * sep; b.y += ny * sep;
        collideGrid(w, a); collideGrid(w, b);
      }
    }

    stepStations(w, dt);
    stepOrders(w, dt);
    updateFocus(w);
  };

  /* --------------------------------------------- stars, DDA outcome, saves */
  RK.stars = function (w) {
    var c = w.coins, g = w.goals;
    return c >= g[2] ? 3 : c >= g[1] ? 2 : c >= g[0] ? 1 : 0;
  };

  RK.outcome = function (w) {
    var ratio = w.coins / Math.max(1, w.goals[2]);
    var penalty = (w.expired * 0.12) + (w.burnt * 0.06);
    return Math.round(clamp(ratio - penalty, 0, 1) * 1000) / 1000;
  };

  RK.freshSave = function () {
    return {
      v: 1,
      lv: RK.LEVELS.map(function () { return { s: 0, best: 0 }; }),
      coins: 0,
      aprons: RK.APRONS.map(function (_, i) { return i === 0 ? 1 : 0; }),
      hats: RK.HATS.map(function (_, i) { return i === 0 ? 1 : 0; }),
      apron: 0,
      hat: 0
    };
  };

  function isInt(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }

  RK.loadSave = function (raw) {
    var s = RK.freshSave(), r = isObj(raw);
    if (!r || r.v !== 1) return s;
    var lv = Array.isArray(r.lv) ? r.lv : [];
    s.lv.forEach(function (e, i) {
      var o = isObj(lv[i]);
      if (!o) return;
      e.s = isInt(o.s, 0, 3) ? o.s : 0;
      e.best = isInt(o.best, 0, 99999) ? o.best : 0;
    });
    s.coins = isInt(r.coins, 0, 99999) ? r.coins : 0;
    var ap = Array.isArray(r.aprons) ? r.aprons : [];
    s.aprons = s.aprons.map(function (_, i) { return i === 0 || ap[i] === 1 ? 1 : 0; });
    var ht = Array.isArray(r.hats) ? r.hats : [];
    s.hats = s.hats.map(function (_, i) { return i === 0 || ht[i] === 1 ? 1 : 0; });
    s.apron = isInt(r.apron, 0, RK.APRONS.length - 1) && s.aprons[r.apron] ? r.apron : 0;
    s.hat = isInt(r.hat, 0, RK.HATS.length - 1) && s.hats[r.hat] ? r.hat : 0;
    return s;
  };

  RK.isOpen = function (s, i) {
    return i === 0 || (i > 0 && i < RK.LEVELS.length && s.lv[i - 1].s > 0);
  };

  RK.totalStars = function (s) {
    var n = 0;
    for (var i = 0; i < s.lv.length; i++) n += s.lv[i].s;
    return n;
  };

  RK.nextLevel = function (s) {
    var top = 0;
    for (var i = 0; i < RK.LEVELS.length; i++) {
      if (!RK.isOpen(s, i)) break;
      top = i;
      if (!s.lv[i].s) return i;
    }
    return top;
  };

  RK.applyResult = function (s, i, stars, coins) {
    var e = s.lv[i];
    var out = {
      first: e.s === 0 && stars > 0,
      best: e.best > 0 && coins > e.best,
      moreStars: stars > e.s,
      earned: Math.max(0, coins | 0),
      opened: -1,
      world: -1
    };
    if (stars > e.s) e.s = stars;
    if (coins > e.best) e.best = coins;
    s.coins = Math.min(99999, s.coins + out.earned);
    if (out.first && i + 1 < RK.LEVELS.length) {
      out.opened = i + 1;
      if ((i + 1) % 3 === 0) out.world = (i + 1) / 3;
    }
    return out;
  };

  RK.buy = function (s, kind, k) {
    var isHat = kind === 'hat';
    var list = isHat ? RK.HATS : RK.APRONS;
    var own = isHat ? s.hats : s.aprons;
    var key = isHat ? 'hat' : 'apron';
    if (!list[k]) return '';
    if (own[k]) { s[key] = k; return 'wear'; }
    if (s.coins < list[k].price) return '';
    s.coins -= list[k].price;
    own[k] = 1;
    s[key] = k;
    return 'bought';
  };

  return RK;
});
