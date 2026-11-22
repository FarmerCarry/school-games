/* Recess Kitchen (مطبخ الفسحة) — Pure deterministic co-op kitchen simulation.
 * UMD module: works in browser (window.RecessEngine) and Node tests (module.exports).
 * No DOM, no Kit, no Math.random — fully seeded & testable. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RecessEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLS = 11;
  var ROWS = 7;

  /* ------------------------------------------------------------- seeded RNG */
  function mulberry32(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* --------------------------------------------------------------- recipes */
  var RECIPES = {
    burger: {
      id: 'burger',
      name: 'برغر',
      points: 100,
      patience: 48,
      parts: ['bun', 'cooked_patty'],
      needs: ['crate_bun', 'crate_patty', 'stove', 'serve']
    },
    cheeseburger: {
      id: 'cheeseburger',
      name: 'تشيز برغر',
      points: 130,
      patience: 54,
      parts: ['bun', 'cooked_patty', 'cheese'],
      needs: ['crate_bun', 'crate_patty', 'crate_cheese', 'stove', 'serve']
    },
    salad: {
      id: 'salad',
      name: 'سلطة طازجة',
      points: 110,
      patience: 48,
      parts: ['chopped_lettuce', 'chopped_tomato'],
      needs: ['crate_lettuce', 'crate_tomato', 'chop', 'serve']
    },
    fries: {
      id: 'fries',
      name: 'بطاطس مقرمشة',
      points: 115,
      patience: 50,
      parts: ['fries'],
      needs: ['crate_potato', 'chop', 'stove', 'serve']
    },
    pizza: {
      id: 'pizza',
      name: 'شريحة بيتزا',
      points: 105,
      patience: 46,
      parts: ['pizza'],
      needs: ['crate_dough', 'stove', 'serve']
    },
    juice: {
      id: 'juice',
      name: 'عصير فواكه',
      points: 95,
      patience: 44,
      parts: ['juice'],
      needs: ['crate_fruit', 'juicer', 'serve']
    }
  };

  var CHOP_MAP = {
    lettuce: { out: 'chopped_lettuce', time: 1.2 },
    tomato: { out: 'chopped_tomato', time: 1.2 },
    potato: { out: 'chopped_potato', time: 1.3 }
  };

  var COOK_MAP = {
    patty: { out: 'cooked_patty', time: 2.5 },
    chopped_potato: { out: 'fries', time: 2.7 },
    dough: { out: 'pizza', time: 2.8 }
  };

  var JUICE_MAP = {
    fruit: { out: 'juice', time: 1.6 }
  };

  var CRATE_PROVIDES = {
    crate_bun: 'bun',
    crate_patty: 'patty',
    crate_cheese: 'cheese',
    crate_lettuce: 'lettuce',
    crate_tomato: 'tomato',
    crate_potato: 'potato',
    crate_dough: 'dough',
    crate_fruit: 'fruit'
  };

  var BURGER_PARTS = { bun: 1, cooked_patty: 1, cheese: 1 };
  var SALAD_PARTS = { chopped_lettuce: 1, chopped_tomato: 1 };
  var SINGLE_DISHES = { fries: 1, pizza: 1, juice: 1 };

  function isPlatableKind(kind) {
    return !!(BURGER_PARTS[kind] || SALAD_PARTS[kind] || SINGLE_DISHES[kind]);
  }

  function cloneItem(item) {
    if (!item) return null;
    if (item.kind === 'plate') return { kind: 'plate', parts: item.parts.slice() };
    return { kind: item.kind };
  }

  function itemParts(item) {
    if (!item) return null;
    if (item.kind === 'plate') return item.parts.slice();
    if (isPlatableKind(item.kind)) return [item.kind];
    return null;
  }

  function partFamily(kind) {
    if (BURGER_PARTS[kind]) return 'burger';
    if (SALAD_PARTS[kind]) return 'salad';
    if (SINGLE_DISHES[kind]) return kind;
    return null;
  }

  function canCombine(a, b) {
    if (!a || !b) return false;
    var pa = itemParts(a);
    var pb = itemParts(b);
    if (!pa || !pb) return false;
    // Two empty plates don't combine
    if (pa.length === 0 && pb.length === 0) return false;
    var merged = pa.concat(pb);
    var fam = null;
    var seen = {};
    for (var i = 0; i < merged.length; i++) {
      var k = merged[i];
      if (seen[k]) return false;
      seen[k] = 1;
      var f = partFamily(k);
      if (!f) return false;
      if (fam && fam !== f) return false;
      fam = f;
    }
    return true;
  }

  function combineItems(a, b) {
    if (!canCombine(a, b)) return null;
    var merged = itemParts(a).concat(itemParts(b));
    merged.sort();
    return { kind: 'plate', parts: merged };
  }

  function getDishId(item) {
    if (!item) return null;
    if (SINGLE_DISHES[item.kind]) return item.kind;
    if (item.kind !== 'plate') return null;
    var p = item.parts;
    if (p.length === 1 && SINGLE_DISHES[p[0]]) return p[0];
    if (p.length === 2 && p[0] === 'bun' && p[1] === 'cooked_patty') return 'burger';
    if (p.length === 3 && p[0] === 'bun' && p[1] === 'cheese' && p[2] === 'cooked_patty') return 'cheeseburger';
    if (p.length === 2 && p[0] === 'chopped_lettuce' && p[1] === 'chopped_tomato') return 'salad';
    return null;
  }

  /* --------------------------------------------------------------- canteens & levels */
  var CANTEENS = [
    { id: 0, name: 'مقصف المدرسة', theme: 'school' },
    { id: 1, name: 'البيسترو المشمس', theme: 'bistro' },
    { id: 2, name: 'الكافتيريا الكبرى', theme: 'mega' }
  ];

  var TILE_CHAR = {
    '.': null,
    '#': 'counter',
    'B': 'crate_bun',
    'M': 'crate_patty',
    'H': 'crate_cheese',
    'L': 'crate_lettuce',
    'T': 'crate_tomato',
    'O': 'crate_potato',
    'D': 'crate_dough',
    'F': 'crate_fruit',
    'S': 'stove',
    'C': 'chop',
    'J': 'juicer',
    'P': 'plates',
    'V': 'serve',
    'X': 'trash'
  };

  var LEVELS = [
    {
      index: 0, id: '1-1', canteen: 0, name: 'برغر الصباح',
      duration: 90, maxOrders: 3, spawnEvery: 10.5, burnGrace: 8.5,
      stars: [180, 420, 700],
      recipes: ['burger'],
      spawns: [{ x: 3.5, y: 3.5 }, { x: 7.5, y: 3.5 }],
      grid: [
        '###SS#VV###',
        'M.........#',
        'B.........P',
        '#.........#',
        '#.........#',
        '#.........X',
        '###########'
      ]
    },
    {
      index: 1, id: '1-2', canteen: 0, name: 'الجبن اللذيذ',
      duration: 90, maxOrders: 3, spawnEvery: 10.0, burnGrace: 8.0,
      stars: [220, 480, 800],
      recipes: ['burger', 'cheeseburger'],
      spawns: [{ x: 3.5, y: 2.5 }, { x: 7.5, y: 2.5 }],
      grid: [
        '##SS##VV###',
        'M.........#',
        'B.........P',
        'H.........#',
        '#...###...#',
        '#.........X',
        '###########'
      ]
    },
    {
      index: 2, id: '1-3', canteen: 0, name: 'سلطة الفسحة',
      duration: 95, maxOrders: 3, spawnEvery: 9.5, burnGrace: 7.5,
      stars: [240, 520, 860],
      recipes: ['burger', 'salad', 'cheeseburger'],
      spawns: [{ x: 3.5, y: 3.5 }, { x: 7.5, y: 3.5 }],
      grid: [
        '##SS#VV#CC#',
        'M.........L',
        'B.........T',
        'H.........P',
        '#.........#',
        '#.........X',
        '###########'
      ]
    },
    {
      index: 3, id: '2-1', canteen: 1, name: 'بطاطس مقرمشة',
      duration: 95, maxOrders: 4, spawnEvery: 9.2, burnGrace: 7.0,
      stars: [260, 560, 920],
      recipes: ['fries', 'burger', 'cheeseburger'],
      spawns: [{ x: 2.5, y: 2.5 }, { x: 8.5, y: 2.5 }],
      grid: [
        '#SSS#VV#CC#',
        'M.........O',
        'B.........#',
        'H...###...P',
        '#.........#',
        '#.........X',
        '###########'
      ]
    },
    {
      index: 4, id: '2-2', canteen: 1, name: 'ركن البيتزا',
      duration: 95, maxOrders: 4, spawnEvery: 8.8, burnGrace: 6.5,
      stars: [280, 600, 960],
      recipes: ['pizza', 'fries', 'salad'],
      spawns: [{ x: 2.5, y: 2.5 }, { x: 8.5, y: 2.5 }],
      grid: [
        '#SSS#VV#CC#',
        'D.........L',
        'O.........T',
        '#..##.##..P',
        '#.........#',
        '#.........X',
        '###########'
      ]
    },
    {
      index: 5, id: '2-3', canteen: 1, name: 'بار العصير',
      duration: 95, maxOrders: 4, spawnEvery: 8.5, burnGrace: 6.5,
      stars: [300, 640, 1020],
      recipes: ['juice', 'pizza', 'cheeseburger'],
      spawns: [{ x: 3.5, y: 2.5 }, { x: 7.5, y: 2.5 }],
      grid: [
        '#SS#VV#JJ##',
        'M.........F',
        'B.........D',
        'H.........P',
        '#...###...#',
        '#.........X',
        '###########'
      ]
    },
    {
      index: 6, id: '3-1', canteen: 2, name: 'وجبة متكاملة',
      duration: 100, maxOrders: 4, spawnEvery: 8.4, burnGrace: 6.2,
      stars: [320, 680, 1080],
      recipes: ['burger', 'fries', 'juice', 'salad'],
      spawns: [{ x: 2.5, y: 3.5 }, { x: 8.5, y: 3.5 }],
      grid: [
        '#SS#VV#JJ##',
        'M.........F',
        'B...#C#...L',
        'O.........T',
        '#...#C#...P',
        '#.........X',
        '###########'
      ]
    },
    {
      index: 7, id: '3-2', canteen: 2, name: 'ساعة الذروة',
      duration: 100, maxOrders: 4, spawnEvery: 8.0, burnGrace: 5.8,
      stars: [350, 740, 1180],
      recipes: ['burger', 'cheeseburger', 'salad', 'fries', 'pizza', 'juice'],
      spawns: [{ x: 2.5, y: 3.5 }, { x: 8.5, y: 3.5 }],
      grid: [
        '#SS#VV#JJ##',
        'M.........F',
        'B...C#C...L',
        'H.........T',
        'O.........D',
        '#.........X',
        '####P######'
      ]
    },
    {
      index: 8, id: '3-3', canteen: 2, name: 'المطبخ الذهبي',
      duration: 105, maxOrders: 4, spawnEvery: 7.6, burnGrace: 5.5,
      stars: [380, 800, 1280],
      recipes: ['burger', 'cheeseburger', 'salad', 'fries', 'pizza', 'juice'],
      spawns: [{ x: 2.5, y: 2.5 }, { x: 8.5, y: 2.5 }],
      grid: [
        'SSS#VV#JJ##',
        'M.........F',
        'B.........L',
        'H..C###C..T',
        'O.........D',
        '#.........X',
        '####P#P####'
      ]
    }
  ];

  var ENDLESS_LEVEL = {
    index: -1, id: 'endless', canteen: 2, name: 'الاندفاع اللانهائي',
    duration: 90, maxOrders: 4, spawnEvery: 8.8, burnGrace: 6.5,
    stars: [300, 700, 1200],
    recipes: ['burger', 'juice', 'salad', 'fries', 'pizza', 'cheeseburger'],
    spawns: [{ x: 2.5, y: 2.5 }, { x: 8.5, y: 2.5 }],
    grid: [
      'SSS#VV#JJ##',
      'M.........F',
      'B.........L',
      'H..C###C..T',
      'O.........D',
      '#.........X',
      '####P#P####'
    ]
  };

  /* --------------------------------------------------------------- wardrobe & save */
  var APRONS = [
    { id: 'coral', name: 'مرجاني كلاسيكي', color: 0xff5a5f, trim: 0xffe066, cost: 0 },
    { id: 'sky', name: 'أزرق السماء', color: 0x2ec4f1, trim: 0xffffff, cost: 40 },
    { id: 'sunny', name: 'أصفر الشمس', color: 0xffbe0b, trim: 0xff5a5f, cost: 80 },
    { id: 'berry', name: 'توت بنفسجي', color: 0x9b5de5, trim: 0xffd166, cost: 120 },
    { id: 'mint', name: 'نعناع منعش', color: 0x2ec4b6, trim: 0xfff3b0, cost: 160 },
    { id: 'royal', name: 'أزرق ملكي', color: 0x3a5aff, trim: 0xffd166, cost: 220 }
  ];

  var HATS = [
    { id: 'toque', name: 'قبعة الطاهي', cost: 0 },
    { id: 'bandana', name: 'عصابة الشيف', cost: 50 },
    { id: 'bistro', name: 'قبعة البيسترو', cost: 90 },
    { id: 'berry', name: 'قبعة الفراولة', cost: 140 },
    { id: 'star', name: 'قبعة النجمة', cost: 200 },
    { id: 'crown', name: 'التاج الذهبي', cost: 280 }
  ];

  var SAVE_VERSION = 3;

  function defaultSave() {
    var lv = [];
    for (var i = 0; i < LEVELS.length; i++) lv.push({ stars: 0, best: 0 });
    return {
      v: SAVE_VERSION,
      levels: lv,
      bestScore: 0,
      bestEndless: 0,
      coins: 0,
      aprons: [0],
      hats: [0],
      apron: 0,
      hat: 0,
      tutorialDone: false
    };
  }

  function loadSave(raw) {
    var base = defaultSave();
    if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return base;
    if (Array.isArray(raw.levels)) {
      for (var i = 0; i < LEVELS.length; i++) {
        var r = raw.levels[i];
        if (r && typeof r === 'object') {
          base.levels[i].stars = Math.max(0, Math.min(3, (r.stars | 0)));
          base.levels[i].best = Math.max(0, (r.best | 0));
        }
      }
    }
    base.bestScore = Math.max(0, raw.bestScore | 0);
    base.bestEndless = Math.max(0, raw.bestEndless | 0);
    base.coins = Math.max(0, raw.coins | 0);
    if (Array.isArray(raw.aprons)) {
      var ap = [0];
      for (var a = 0; a < raw.aprons.length; a++) {
        var idx = raw.aprons[a] | 0;
        if (idx >= 0 && idx < APRONS.length && ap.indexOf(idx) === -1) ap.push(idx);
      }
      base.aprons = ap;
    }
    if (Array.isArray(raw.hats)) {
      var ht = [0];
      for (var h = 0; h < raw.hats.length; h++) {
        var hidx = raw.hats[h] | 0;
        if (hidx >= 0 && hidx < HATS.length && ht.indexOf(hidx) === -1) ht.push(hidx);
      }
      base.hats = ht;
    }
    base.apron = base.aprons.indexOf(raw.apron | 0) !== -1 ? (raw.apron | 0) : 0;
    base.hat = base.hats.indexOf(raw.hat | 0) !== -1 ? (raw.hat | 0) : 0;
    base.tutorialDone = !!raw.tutorialDone;
    return base;
  }

  function isLevelUnlocked(save, index) {
    if (index <= 0) return true;
    if (index >= LEVELS.length) return false;
    return !!(save && save.levels && save.levels[index - 1] && save.levels[index - 1].stars >= 1);
  }

  function nextPlayableLevel(save) {
    if (!save || !save.levels) return 0;
    for (var i = 0; i < LEVELS.length; i++) {
      if (save.levels[i].stars === 0) return i;
    }
    return 0;
  }

  function totalStars(save) {
    if (!save || !save.levels) return 0;
    var s = 0;
    for (var i = 0; i < save.levels.length; i++) s += save.levels[i].stars;
    return s;
  }

  /* --------------------------------------------------------------- simulation */
  var CHEF_RADIUS = 0.34;
  var WALK_SPEED = 5.4;
  var DASH_SPEED = 12.2;
  var DASH_DUR = 0.17;
  var DASH_CD = 0.52;

  function buildStations(level) {
    var stations = [];
    var grid = [];
    var id = 0;
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      var line = level.grid[r];
      for (var c = 0; c < COLS; c++) {
        var ch = line.charAt(c);
        var kind = TILE_CHAR[ch] || null;
        if (kind) {
          var st = {
            id: id++,
            c: c,
            r: r,
            x: c + 0.5,
            y: r + 0.5,
            kind: kind,
            provides: CRATE_PROVIDES[kind] || null,
            item: null,
            progress: 0,
            burnProgress: 0,
            warning: false,
            active: false,
            pulseT: 0,
            conveyorItem: null,
            conveyorT: 0,
            lidT: 0
          };
          stations.push(st);
          row.push(st);
        } else {
          row.push(null);
        }
      }
      grid.push(row);
    }
    return { stations: stations, grid: grid };
  }

  function create(opts) {
    opts = opts || {};
    var endless = !!opts.endless;
    var demo = !!opts.demo;
    var levelIdx = typeof opts.level === 'number' ? Math.max(0, Math.min(LEVELS.length - 1, opts.level | 0)) : 0;
    var level = endless ? ENDLESS_LEVEL : LEVELS[levelIdx];
    var duo = !!opts.duo || demo;
    var seed = opts.seed != null ? (opts.seed >>> 0) : (1013 + levelIdx * 7919 + (endless ? 31337 : 0));
    var rng = mulberry32(seed);

    var built = buildStations(level);
    var patienceMult = typeof opts.patienceMult === 'number' ? opts.patienceMult : (duo ? 1.08 : 1.0);
    var spawnMult = typeof opts.spawnMult === 'number' ? opts.spawnMult : (duo ? 0.90 : 1.0);
    var burnMult = typeof opts.burnMult === 'number' ? opts.burnMult : 1.0;

    var chefs = [];
    var count = duo ? 2 : 1;
    for (var i = 0; i < count; i++) {
      var sp = level.spawns[i] || { x: 3.5 + i * 4, y: 3.5 };
      chefs.push({
        id: i,
        x: sp.x,
        y: sp.y,
        spawnX: sp.x,
        spawnY: sp.y,
        vx: 0,
        vy: 0,
        fx: i === 0 ? 1 : -1,
        fy: 0,
        holding: null,
        targetId: -1,
        dashT: 0,
        dashCd: 0,
        dashDirX: 1,
        dashDirY: 0,
        walkPhase: 0,
        squash: 1,
        actionT: 0,
        moved: false,
        apron: i === 0 ? (opts.apron | 0) : ((opts.apron2 != null ? opts.apron2 : 4) | 0),
        hat: i === 0 ? (opts.hat | 0) : ((opts.hat2 != null ? opts.hat2 : 1) | 0)
      });
    }

    var state = {
      id: level.id,
      levelIndex: level.index,
      canteen: level.canteen,
      theme: CANTEENS[level.canteen].theme,
      levelName: level.name,
      endless: endless,
      demo: demo,
      duo: duo,
      seed: seed,
      rng: rng,
      level: level,
      cols: COLS,
      rows: ROWS,
      stations: built.stations,
      grid: built.grid,
      chefs: chefs,
      orders: [],
      nextOrderId: 1,
      spawnTimer: 0,
      time: 0,
      timeLeft: level.duration,
      duration: level.duration,
      score: 0,
      served: 0,
      expired: 0,
      burnt: 0,
      combo: 0,
      maxCombo: 0,
      coinsEarned: 0,
      over: false,
      result: null,
      patienceMult: patienceMult,
      spawnMult: spawnMult,
      burnGrace: Math.max(3.5, level.burnGrace * burnMult),
      lastRecipeIdx: -1,
      humanMoved: false,
      atStart: true,
      demoClock: 0,
      demoWaypoints: []
    };

    // Spawn first order immediately so the player always has a clear goal on frame 1!
    spawnOrder(state, []);
    state.spawnTimer = Math.max(3.5, level.spawnEvery * spawnMult * 0.55);

    // Precompute initial station targets
    for (var c = 0; c < chefs.length; c++) updateTarget(state, chefs[c]);

    return state;
  }

  function activeRecipes(state) {
    if (!state.endless) return state.level.recipes;
    if (state.served < 3) return ['burger', 'juice'];
    if (state.served < 7) return ['burger', 'juice', 'salad', 'fries'];
    return state.level.recipes;
  }

  function spawnOrder(state, events) {
    if (state.orders.length >= state.level.maxOrders) return;
    var pool = activeRecipes(state);
    var idx = Math.floor(state.rng() * pool.length);
    if (pool.length > 1 && idx === state.lastRecipeIdx) {
      idx = (idx + 1 + Math.floor(state.rng() * (pool.length - 1))) % pool.length;
    }
    state.lastRecipeIdx = idx;
    var rId = pool[idx];
    var rec = RECIPES[rId];
    var endlessFactor = state.endless ? Math.max(0.72, 1 - state.served * 0.015) : 1;
    var maxP = Math.round(rec.patience * state.patienceMult * endlessFactor);
    var order = {
      id: state.nextOrderId++,
      recipe: rId,
      patience: maxP,
      maxPatience: maxP,
      age: 0,
      urgent: false
    };
    state.orders.push(order);
    events.push({ type: 'newOrder', orderId: order.id, recipe: rId });
  }

  function isBlocked(state, c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true;
    return state.grid[r][c] !== null;
  }

  function resolveCircleGrid(state, chef) {
    var rad = CHEF_RADIUS;
    // Clamp inside kitchen perimeter
    chef.x = Math.max(rad, Math.min(COLS - rad, chef.x));
    chef.y = Math.max(rad, Math.min(ROWS - rad, chef.y));

    var minC = Math.max(0, Math.floor(chef.x - rad - 0.1));
    var maxC = Math.min(COLS - 1, Math.floor(chef.x + rad + 0.1));
    var minR = Math.max(0, Math.floor(chef.y - rad - 0.1));
    var maxR = Math.min(ROWS - 1, Math.floor(chef.y + rad + 0.1));

    for (var r = minR; r <= maxR; r++) {
      for (var c = minC; c <= maxC; c++) {
        if (!isBlocked(state, c, r)) continue;
        var nearX = Math.max(c, Math.min(chef.x, c + 1));
        var nearY = Math.max(r, Math.min(chef.y, r + 1));
        var dx = chef.x - nearX;
        var dy = chef.y - nearY;
        var d2 = dx * dx + dy * dy;
        if (d2 < rad * rad) {
          if (d2 > 1e-8) {
            var d = Math.sqrt(d2);
            var push = rad - d;
            chef.x += (dx / d) * push;
            chef.y += (dy / d) * push;
          } else {
            // Center fell exactly inside tile — push out along smallest penetration
            var dl = chef.x - c, dr = (c + 1) - chef.x;
            var dt = chef.y - r, db = (r + 1) - chef.y;
            var m = Math.min(dl, dr, dt, db);
            if (m === dl) chef.x = c - rad;
            else if (m === dr) chef.x = c + 1 + rad;
            else if (m === dt) chef.y = r - rad;
            else chef.y = r + 1 + rad;
          }
        }
      }
    }
  }

  function stationRelevance(chef, st) {
    var h = chef.holding;
    if (!h) {
      if (st.item) return 0.25;
      if (st.provides || st.kind === 'plates') return 0.12;
      return 0;
    }
    var dish = getDishId(h);
    if (dish && st.kind === 'serve') return 0.45;
    if (h.kind === 'burnt' && st.kind === 'trash') return 0.45;
    if (CHOP_MAP[h.kind] && st.kind === 'chop' && !st.item) return 0.40;
    if (COOK_MAP[h.kind] && st.kind === 'stove' && !st.item) return 0.40;
    if (JUICE_MAP[h.kind] && st.kind === 'juicer' && !st.item) return 0.40;
    if (st.item && canCombine(h, st.item)) return 0.35;
    if (st.provides && canCombine(h, { kind: st.provides })) return 0.30;
    if (st.kind === 'counter' && !st.item) return 0.10;
    return 0;
  }

  function updateTarget(state, chef) {
    var px = chef.x + chef.fx * 0.72;
    var py = chef.y + chef.fy * 0.72;
    var bestId = -1;
    var bestScore = -1e9;
    var list = state.stations;
    for (var i = 0; i < list.length; i++) {
      var st = list[i];
      var dx = st.x - chef.x;
      var dy = st.y - chef.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1.32) continue;
      var dot = dist > 1e-5 ? (dx * chef.fx + dy * chef.fy) / dist : 1;
      if (dot < 0.15) continue;
      var pd = Math.hypot(st.x - px, st.y - py);
      var score = dot * 1.15 - pd * 1.1 + stationRelevance(chef, st);
      if (score > bestScore) {
        bestScore = score;
        bestId = st.id;
      }
    }
    chef.targetId = bestId;
  }

  function findStation(state, id) {
    if (id < 0 || id >= state.stations.length) return null;
    return state.stations[id];
  }

  function interact(state, chef, events) {
    updateTarget(state, chef);
    var st = findStation(state, chef.targetId);
    if (!st) return false;

    var h = chef.holding;
    st.pulseT = 0.22;
    chef.actionT = 0.18;
    chef.squash = 0.82;

    // 1. SERVING WINDOW
    if (st.kind === 'serve') {
      if (!h) {
        events.push({ type: 'bonk', chef: chef.id, x: st.x, y: st.y });
        return false;
      }
      var dishId = getDishId(h);
      if (!dishId) {
        events.push({ type: 'notReady', chef: chef.id, x: st.x, y: st.y });
        return false;
      }
      // Find matching order with lowest remaining patience
      var matchIdx = -1;
      var minPat = 1e9;
      for (var i = 0; i < state.orders.length; i++) {
        if (state.orders[i].recipe === dishId && state.orders[i].patience < minPat) {
          minPat = state.orders[i].patience;
          matchIdx = i;
        }
      }
      if (matchIdx === -1) {
        events.push({ type: 'wrongDish', chef: chef.id, dish: dishId, x: st.x, y: st.y });
        return false;
      }
      var ord = state.orders.splice(matchIdx, 1)[0];
      var rec = RECIPES[dishId];
      var patRatio = Math.max(0, Math.min(1, ord.patience / Math.max(1, ord.maxPatience)));
      state.combo++;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      var tip = Math.round(patRatio * 40);
      var comboBonus = Math.min(state.combo - 1, 5) * 20;
      var pts = rec.points + tip + comboBonus;
      state.score += pts;
      state.served++;
      state.coinsEarned += 10 + Math.min(state.combo, 4) * 2;
      if (state.endless) {
        state.timeLeft = Math.min(99, state.timeLeft + 10);
      }
      chef.holding = null;
      st.conveyorItem = dishId;
      st.conveyorT = 0.85;
      events.push({
        type: 'serve',
        chef: chef.id,
        dish: dishId,
        points: pts,
        tip: tip,
        combo: state.combo,
        x: st.x,
        y: st.y
      });
      // Immediately queue a new order if none left so kitchen stays lively
      if (state.orders.length === 0) {
        spawnOrder(state, events);
        state.spawnTimer = Math.max(3.0, state.level.spawnEvery * state.spawnMult * 0.65);
      }
      return true;
    }

    // 2. TRASH BIN
    if (st.kind === 'trash') {
      if (!h) return false;
      chef.holding = null;
      st.lidT = 0.45;
      events.push({ type: 'trash', chef: chef.id, x: st.x, y: st.y });
      return true;
    }

    // 3. PLATE STACK
    if (st.kind === 'plates') {
      if (!h) {
        chef.holding = { kind: 'plate', parts: [] };
        events.push({ type: 'pickup', chef: chef.id, item: 'plate', x: st.x, y: st.y });
        return true;
      }
      if (h.kind === 'plate' && h.parts.length === 0) {
        chef.holding = null;
        events.push({ type: 'drop', chef: chef.id, x: st.x, y: st.y });
        return true;
      }
      if (isPlatableKind(h.kind)) {
        chef.holding = { kind: 'plate', parts: [h.kind] };
        events.push({ type: 'combine', chef: chef.id, dish: getDishId(chef.holding), x: st.x, y: st.y });
        return true;
      }
      return false;
    }

    // 4. INGREDIENT CRATE
    if (st.provides) {
      // If someone set an item on top of the crate, interact with that first
      if (st.item) {
        if (!h) {
          chef.holding = st.item;
          st.item = null;
          events.push({ type: 'pickup', chef: chef.id, item: chef.holding.kind, x: st.x, y: st.y });
          return true;
        }
        if (canCombine(h, st.item)) {
          chef.holding = combineItems(h, st.item);
          st.item = null;
          events.push({ type: 'combine', chef: chef.id, dish: getDishId(chef.holding), x: st.x, y: st.y });
          return true;
        }
        return false;
      }
      var fresh = { kind: st.provides };
      if (!h) {
        chef.holding = fresh;
        events.push({ type: 'pickup', chef: chef.id, item: fresh.kind, x: st.x, y: st.y });
        return true;
      }
      // Allow scooping crate ingredient directly onto a held plate or compatible ingredient!
      if (canCombine(h, fresh)) {
        chef.holding = combineItems(h, fresh);
        events.push({ type: 'combine', chef: chef.id, dish: getDishId(chef.holding), x: st.x, y: st.y });
        return true;
      }
      // Put back exact same fresh ingredient cleanly
      if (h.kind === st.provides) {
        chef.holding = null;
        events.push({ type: 'drop', chef: chef.id, x: st.x, y: st.y });
        return true;
      }
      return false;
    }

    // 5. CHOPPING BOARD
    if (st.kind === 'chop') {
      if (!st.item) {
        if (!h) return false;
        st.item = h;
        chef.holding = null;
        st.progress = 0;
        st.active = !!CHOP_MAP[st.item.kind];
        events.push({ type: st.active ? 'chopStart' : 'drop', chef: chef.id, item: st.item.kind, x: st.x, y: st.y });
        return true;
      }
      // Currently chopping — tapping Interact gives a turbo-chop boost!
      if (st.active && CHOP_MAP[st.item.kind]) {
        st.progress = Math.min(1, st.progress + 0.34);
        events.push({ type: 'chopBoost', chef: chef.id, x: st.x, y: st.y });
        if (st.progress >= 1) {
          st.item = { kind: CHOP_MAP[st.item.kind].out };
          st.progress = 0;
          st.active = false;
          events.push({ type: 'chopDone', item: st.item.kind, x: st.x, y: st.y });
        }
        return true;
      }
      // Finished item or placed item on board
      if (!h) {
        chef.holding = st.item;
        st.item = null;
        st.progress = 0;
        st.active = false;
        events.push({ type: 'pickup', chef: chef.id, item: chef.holding.kind, x: st.x, y: st.y });
        return true;
      }
      if (canCombine(h, st.item)) {
        chef.holding = combineItems(h, st.item);
        st.item = null;
        st.progress = 0;
        st.active = false;
        events.push({ type: 'combine', chef: chef.id, dish: getDishId(chef.holding), x: st.x, y: st.y });
        return true;
      }
      return false;
    }

    // 6. STOVE / GRILL
    if (st.kind === 'stove') {
      if (!st.item) {
        if (!h || !COOK_MAP[h.kind]) {
          if (h) events.push({ type: 'bonk', chef: chef.id, x: st.x, y: st.y });
          return false;
        }
        st.item = h;
        chef.holding = null;
        st.progress = 0;
        st.burnProgress = 0;
        st.warning = false;
        st.active = true;
        events.push({ type: 'cookStart', chef: chef.id, item: st.item.kind, x: st.x, y: st.y });
        return true;
      }
      // Don't pull raw uncooked item off mid-cook unless hands empty & < 15% progress (prevents accidental cancel)
      if (st.active && COOK_MAP[st.item.kind]) {
        if (!h && st.progress < 0.15) {
          chef.holding = st.item;
          st.item = null;
          st.progress = 0;
          st.active = false;
          events.push({ type: 'pickup', chef: chef.id, item: chef.holding.kind, x: st.x, y: st.y });
          return true;
        }
        return false;
      }
      // Cooked (or burnt) item waiting on stove
      if (!h) {
        chef.holding = st.item;
        st.item = null;
        st.progress = 0;
        st.burnProgress = 0;
        st.warning = false;
        st.active = false;
        events.push({ type: 'pickup', chef: chef.id, item: chef.holding.kind, x: st.x, y: st.y });
        return true;
      }
      if (canCombine(h, st.item)) {
        chef.holding = combineItems(h, st.item);
        st.item = null;
        st.progress = 0;
        st.burnProgress = 0;
        st.warning = false;
        st.active = false;
        events.push({ type: 'combine', chef: chef.id, dish: getDishId(chef.holding), x: st.x, y: st.y });
        return true;
      }
      return false;
    }

    // 7. JUICER
    if (st.kind === 'juicer') {
      if (!st.item) {
        if (!h || !JUICE_MAP[h.kind]) {
          if (h) events.push({ type: 'bonk', chef: chef.id, x: st.x, y: st.y });
          return false;
        }
        st.item = h;
        chef.holding = null;
        st.progress = 0;
        st.active = true;
        events.push({ type: 'juiceStart', chef: chef.id, x: st.x, y: st.y });
        return true;
      }
      if (st.active) return false;
      if (!h) {
        chef.holding = st.item;
        st.item = null;
        st.progress = 0;
        events.push({ type: 'pickup', chef: chef.id, item: chef.holding.kind, x: st.x, y: st.y });
        return true;
      }
      if (canCombine(h, st.item)) {
        chef.holding = combineItems(h, st.item);
        st.item = null;
        st.progress = 0;
        events.push({ type: 'combine', chef: chef.id, dish: getDishId(chef.holding), x: st.x, y: st.y });
        return true;
      }
      return false;
    }

    // 8. PREP COUNTER
    if (st.kind === 'counter') {
      if (!st.item && !h) return false;
      if (!st.item && h) {
        st.item = h;
        chef.holding = null;
        events.push({ type: 'drop', chef: chef.id, x: st.x, y: st.y });
        return true;
      }
      if (st.item && !h) {
        chef.holding = st.item;
        st.item = null;
        events.push({ type: 'pickup', chef: chef.id, item: chef.holding.kind, x: st.x, y: st.y });
        return true;
      }
      if (canCombine(h, st.item)) {
        chef.holding = combineItems(h, st.item);
        st.item = null;
        events.push({ type: 'combine', chef: chef.id, dish: getDishId(chef.holding), x: st.x, y: st.y });
        return true;
      }
      // Swap held item and counter item
      var tmp = st.item;
      st.item = h;
      chef.holding = tmp;
      events.push({ type: 'drop', chef: chef.id, x: st.x, y: st.y });
      return true;
    }

    return false;
  }

  /* --------------------------------------------------------------- demo AI */
  function demoInputs(state) {
    // Simple lively title-screen choreography: Chef 1 cooks burgers, Chef 2 grabs plates & serves!
    var out = [];
    for (var i = 0; i < state.chefs.length; i++) {
      var c = state.chefs[i];
      var goal = null;
      var wantInteract = false;
      if (i === 0) {
        // Patrol between patty crate, stove, bun crate, serve
        var stove = findFirstStation(state, 'stove');
        var mCrate = findFirstStation(state, 'crate_patty');
        var bCrate = findFirstStation(state, 'crate_bun');
        var serve = findFirstStation(state, 'serve');
        if (c.holding && getDishId(c.holding)) {
          goal = serve; wantInteract = true;
        } else if (c.holding && c.holding.kind === 'patty') {
          goal = stove; wantInteract = true;
        } else if (c.holding && c.holding.kind === 'cooked_patty') {
          goal = bCrate; wantInteract = true;
        } else if (stove && stove.item && stove.item.kind === 'cooked_patty') {
          goal = stove; wantInteract = true;
        } else if (stove && stove.item && stove.active) {
          goal = { x: 5.5, y: 2.5 }; // wait cheerfully in front of stove
        } else {
          goal = mCrate; wantInteract = true;
        }
      } else {
        // Chef 2 dances cheerfully around right half / serves salads or waves
        var t = state.time;
        goal = { x: 7.5 + Math.cos(t * 0.9) * 1.4, y: 3.2 + Math.sin(t * 1.3) * 1.0 };
      }
      var mx = 0, my = 0, act = false;
      if (goal) {
        var gx = goal.c != null ? (goal.x + (goal.c === 0 ? 1 : goal.c === COLS - 1 ? -1 : 0) * 0.85) : goal.x;
        var gy = goal.r != null ? (goal.y + (goal.r === 0 ? 1 : goal.r === ROWS - 1 ? -1 : 0) * 0.85) : goal.y;
        var dx = gx - c.x, dy = gy - c.y;
        var d = Math.hypot(dx, dy);
        if (d > 0.28) {
          mx = dx / d;
          my = dy / d;
        } else if (wantInteract && goal.id != null) {
          // Face the station
          var fdx = goal.x - c.x, fdy = goal.y - c.y;
          var fd = Math.hypot(fdx, fdy) || 1;
          c.fx = fdx / fd; c.fy = fdy / fd;
          updateTarget(state, c);
          if (c.targetId === goal.id) act = true;
        }
      }
      out.push({ mx: mx, my: my, interact: act, dash: false });
    }
    return out;
  }

  function findFirstStation(state, kind) {
    for (var i = 0; i < state.stations.length; i++) {
      if (state.stations[i].kind === kind) return state.stations[i];
    }
    return null;
  }

  /* --------------------------------------------------------------- step */
  function step(state, dt, inputs) {
    var events = [];
    if (state.over) return events;
    dt = Math.max(0, Math.min(0.05, dt || 0));
    state.time += dt;

    if (state.demo) {
      inputs = demoInputs(state);
    }
    inputs = inputs || [];

    // 1. Update chefs (movement, dash, interact)
    for (var i = 0; i < state.chefs.length; i++) {
      var chef = state.chefs[i];
      var inp = inputs[i] || {};
      var mx = inp.mx || 0;
      var my = inp.my || 0;
      var mag = Math.hypot(mx, my);
      if (mag > 1) { mx /= mag; my /= mag; mag = 1; }

      if (chef.dashCd > 0) chef.dashCd = Math.max(0, chef.dashCd - dt);
      if (chef.actionT > 0) chef.actionT = Math.max(0, chef.actionT - dt);
      chef.squash += (1 - chef.squash) * Math.min(1, dt * 14);

      if (inp.dash && chef.dashCd <= 0 && chef.dashT <= 0) {
        chef.dashT = DASH_DUR;
        chef.dashCd = DASH_CD;
        if (mag > 0.1) { chef.dashDirX = mx; chef.dashDirY = my; }
        else { chef.dashDirX = chef.fx; chef.dashDirY = chef.fy; }
        chef.squash = 1.24;
        chef.moved = true;
        state.humanMoved = true;
        state.atStart = false;
        events.push({ type: 'dash', chef: chef.id, x: chef.x, y: chef.y });
      }

      if (chef.dashT > 0) {
        chef.dashT = Math.max(0, chef.dashT - dt);
        chef.vx = chef.dashDirX * DASH_SPEED;
        chef.vy = chef.dashDirY * DASH_SPEED;
        chef.fx = chef.dashDirX;
        chef.fy = chef.dashDirY;
      } else if (mag > 0.05) {
        chef.vx = mx * WALK_SPEED;
        chef.vy = my * WALK_SPEED;
        chef.fx = mx / mag;
        chef.fy = my / mag;
        chef.moved = true;
        state.humanMoved = true;
        state.atStart = false;
      } else {
        chef.vx = 0;
        chef.vy = 0;
      }

      if (chef.vx !== 0 || chef.vy !== 0) {
        chef.x += chef.vx * dt;
        chef.y += chef.vy * dt;
        resolveCircleGrid(state, chef);
        chef.walkPhase += Math.hypot(chef.vx, chef.vy) * dt * 2.6;
      }
    }

    // Gentle separation between 2 chefs so co-op feels bouncy, never stuck
    if (state.chefs.length === 2) {
      var c0 = state.chefs[0], c1 = state.chefs[1];
      var cdx = c1.x - c0.x, cdy = c1.y - c0.y;
      var cd = Math.hypot(cdx, cdy);
      var minD = 0.66;
      if (cd < minD && cd > 1e-5) {
        var sep = (minD - cd) * 0.5;
        var nx = cdx / cd, ny = cdy / cd;
        c0.x -= nx * sep; c0.y -= ny * sep;
        c1.x += nx * sep; c1.y += ny * sep;
        resolveCircleGrid(state, c0);
        resolveCircleGrid(state, c1);
      }
    }

    // Update targets & process interact edges
    for (var j = 0; j < state.chefs.length; j++) {
      var ch = state.chefs[j];
      updateTarget(state, ch);
      var inp2 = inputs[j] || {};
      if (inp2.interact) {
        state.humanMoved = true;
        state.atStart = false;
        interact(state, ch, events);
        updateTarget(state, ch);
      }
    }

    // 2. Update stations (chopping, cooking, burn grace, juicing, animations)
    for (var s = 0; s < state.stations.length; s++) {
      var st = state.stations[s];
      if (st.pulseT > 0) st.pulseT = Math.max(0, st.pulseT - dt);
      if (st.lidT > 0) st.lidT = Math.max(0, st.lidT - dt);
      if (st.conveyorT > 0) {
        st.conveyorT = Math.max(0, st.conveyorT - dt);
        if (st.conveyorT <= 0) st.conveyorItem = null;
      }

      if (st.kind === 'chop' && st.active && st.item && CHOP_MAP[st.item.kind]) {
        var cSpec = CHOP_MAP[st.item.kind];
        st.progress += dt / cSpec.time;
        if (st.progress >= 1) {
          st.item = { kind: cSpec.out };
          st.progress = 0;
          st.active = false;
          events.push({ type: 'chopDone', item: st.item.kind, x: st.x, y: st.y });
        }
      } else if (st.kind === 'stove' && st.item) {
        var cookSpec = COOK_MAP[st.item.kind];
        if (st.active && cookSpec) {
          st.progress += dt / cookSpec.time;
          if (st.progress >= 1) {
            st.item = { kind: cookSpec.out };
            st.progress = 1;
            st.burnProgress = 0;
            st.warning = false;
            st.active = false;
            events.push({ type: 'cookDone', item: st.item.kind, x: st.x, y: st.y });
          }
        } else if (!st.active && st.item.kind !== 'burnt' && !state.demo) {
          // Forgiving burn timer once cooked
          st.burnProgress += dt / state.burnGrace;
          var wasWarn = st.warning;
          st.warning = st.burnProgress >= 0.45;
          if (st.warning && !wasWarn) {
            events.push({ type: 'burnWarn', x: st.x, y: st.y });
          }
          if (st.burnProgress >= 1) {
            st.item = { kind: 'burnt' };
            st.burnProgress = 0;
            st.warning = false;
            state.burnt++;
            events.push({ type: 'burnt', x: st.x, y: st.y });
          }
        }
      } else if (st.kind === 'juicer' && st.active && st.item && JUICE_MAP[st.item.kind]) {
        var jSpec = JUICE_MAP[st.item.kind];
        st.progress += dt / jSpec.time;
        if (st.progress >= 1) {
          st.item = { kind: jSpec.out };
          st.progress = 0;
          st.active = false;
          events.push({ type: 'juiceDone', item: st.item.kind, x: st.x, y: st.y });
        }
      }
    }

    // 3. Update orders & round clock (demo never times out)
    if (!state.demo) {
      state.timeLeft = Math.max(0, state.timeLeft - dt);

      for (var o = state.orders.length - 1; o >= 0; o--) {
        var ord = state.orders[o];
        ord.age += dt;
        ord.patience -= dt;
        ord.urgent = ord.patience / ord.maxPatience <= 0.28;
        if (ord.patience <= 0) {
          state.orders.splice(o, 1);
          state.expired++;
          state.combo = 0;
          state.score = Math.max(0, state.score - 15);
          events.push({ type: 'expired', orderId: ord.id, recipe: ord.recipe });
        }
      }

      state.spawnTimer -= dt;
      var endlessCadence = state.endless ? Math.max(0.62, 1 - state.served * 0.022) : 1;
      if (state.orders.length === 0 || (state.spawnTimer <= 0 && state.orders.length < state.level.maxOrders)) {
        spawnOrder(state, events);
        state.spawnTimer = Math.max(3.2, state.level.spawnEvery * state.spawnMult * endlessCadence);
      }

      if (state.timeLeft <= 0) {
        finishRound(state, events);
      }
    } else {
      // Keep demo orders topped up
      if (state.orders.length < 2) spawnOrder(state, events);
    }

    return events;
  }

  function calcStars(level, score, served) {
    if (served <= 0) return 0;
    var s = 0;
    for (var i = 0; i < 3; i++) {
      if (score >= level.stars[i]) s = i + 1;
    }
    return s;
  }

  function finishRound(state, events) {
    state.over = true;
    var stars = state.endless ? 0 : calcStars(state.level, state.score, state.served);
    var won = state.endless ? state.served >= 1 : stars >= 1;
    var bonusCoins = stars * 15 + state.maxCombo * 4;
    var totalCoins = state.coinsEarned + bonusCoins;
    // Normalized 0..1 DDA performance metric
    var target2Star = state.level.stars[1] || 500;
    var ddaOutcome = state.humanMoved ? Math.max(0, Math.min(1, state.score / target2Star)) : 0;

    state.result = {
      id: state.id,
      levelIndex: state.levelIndex,
      endless: state.endless,
      duo: state.duo,
      score: state.score,
      served: state.served,
      expired: state.expired,
      burnt: state.burnt,
      maxCombo: state.maxCombo,
      stars: stars,
      won: won,
      coins: totalCoins,
      humanMoved: state.humanMoved,
      ddaOutcome: ddaOutcome
    };
    events.push({ type: 'roundEnd', result: state.result });
  }

  /* --------------------------------------------------------------- ghost hint */
  // Returns the single best next station & action hint for a new/idle player on the first order.
  function nextHint(state) {
    if (!state || state.over || state.orders.length === 0) return null;
    var chef = state.chefs[0];
    var ord = state.orders[0];
    var h = chef.holding;

    if (h) {
      if (h.kind === 'burnt') return { station: findFirstStation(state, 'trash'), text: 'ارمِ المحترق في السلة' };
      var dish = getDishId(h);
      if (dish) return { station: findFirstStation(state, 'serve'), text: 'قدّم الطلب عند النافذة!' };
      if (CHOP_MAP[h.kind]) return { station: findFirstStation(state, 'chop'), text: 'قطّعه على لوح التقطيع' };
      if (COOK_MAP[h.kind]) return { station: findFirstStation(state, 'stove'), text: 'اطبخه على الموقد' };
      if (JUICE_MAP[h.kind]) return { station: findFirstStation(state, 'juicer'), text: 'اعصره في الخلاط' };
      // Holding a ready burger/salad part
      if (ord.recipe === 'burger' || ord.recipe === 'cheeseburger') {
        var parts = itemParts(h) || [];
        if (parts.indexOf('bun') === -1) return { station: findFirstStation(state, 'crate_bun'), text: 'التقط الخبز للتجميع' };
        if (parts.indexOf('cooked_patty') === -1) {
          var stCook = findStationWith(state, 'cooked_patty') || findFirstStation(state, 'stove');
          return { station: stCook, text: 'أضف شريحة اللحم المشوية' };
        }
        if (ord.recipe === 'cheeseburger' && parts.indexOf('cheese') === -1) {
          return { station: findFirstStation(state, 'crate_cheese'), text: 'أضف شريحة الجبن!' };
        }
      }
      if (ord.recipe === 'salad') {
        var sp = itemParts(h) || [];
        if (sp.indexOf('chopped_lettuce') === -1) return { station: findFirstStation(state, 'crate_lettuce'), text: 'قطّع الخس للسلطة' };
        if (sp.indexOf('chopped_tomato') === -1) return { station: findFirstStation(state, 'crate_tomato'), text: 'قطّع الطماطم للسلطة' };
      }
    }

    // Empty hands: check if something ready is already sitting on a stove/chop/juicer
    for (var i = 0; i < state.stations.length; i++) {
      var s = state.stations[i];
      if (!s.item || s.active) continue;
      if (s.kind === 'stove' && s.item.kind !== 'burnt') return { station: s, text: 'التقط الطعام الجاهز!' };
      if (s.kind === 'chop' && !CHOP_MAP[s.item.kind]) return { station: s, text: 'التقط المكون المقطّع!' };
      if (s.kind === 'juicer') return { station: s, text: 'التقط العصير الطازج!' };
    }

    // Otherwise point to first ingredient crate of order 0
    if (ord.recipe === 'burger' || ord.recipe === 'cheeseburger') {
      return { station: findFirstStation(state, 'crate_patty'), text: 'ابدأ بشريحة اللحم واشوها' };
    }
    if (ord.recipe === 'salad') return { station: findFirstStation(state, 'crate_lettuce'), text: 'التقط الخس للتقطيع' };
    if (ord.recipe === 'fries') return { station: findFirstStation(state, 'crate_potato'), text: 'التقط البطاطس للتقطيع' };
    if (ord.recipe === 'pizza') return { station: findFirstStation(state, 'crate_dough'), text: 'التقط عجينة البيتزا للفرن' };
    if (ord.recipe === 'juice') return { station: findFirstStation(state, 'crate_fruit'), text: 'التقط الفواكه للخلاط' };
    return null;
  }

  function findStationWith(state, itemKind) {
    for (var i = 0; i < state.stations.length; i++) {
      if (state.stations[i].item && state.stations[i].item.kind === itemKind) return state.stations[i];
    }
    return null;
  }

  /* --------------------------------------------------------------- snapshot */
  function publicState(state, screen) {
    if (!state) {
      return { screen: screen || 'title', id: '', time: 0, timeLeft: 0, served: 0, score: 0, atStart: true, chefs: [], orders: [] };
    }
    var chefsOut = [];
    for (var i = 0; i < state.chefs.length; i++) {
      var c = state.chefs[i];
      chefsOut.push({
        x: Math.round(c.x * 1000) / 1000,
        y: Math.round(c.y * 1000) / 1000,
        fx: Math.round(c.fx * 100) / 100,
        fy: Math.round(c.fy * 100) / 100,
        holding: c.holding ? cloneItem(c.holding) : null,
        targetId: c.targetId,
        moved: c.moved
      });
    }
    var ordOut = [];
    for (var o = 0; o < state.orders.length; o++) {
      var od = state.orders[o];
      ordOut.push({ id: od.id, recipe: od.recipe, patience: Math.round(od.patience * 10) / 10, maxPatience: od.maxPatience });
    }
    return {
      screen: screen || 'play',
      id: state.id,
      levelIndex: state.levelIndex,
      endless: state.endless,
      duo: state.duo,
      time: Math.round(state.time * 1000) / 1000,
      timeLeft: Math.round(state.timeLeft * 100) / 100,
      score: state.score,
      served: state.served,
      expired: state.expired,
      burnt: state.burnt,
      combo: state.combo,
      atStart: state.atStart,
      over: state.over,
      chefs: chefsOut,
      orders: ordOut
    };
  }

  return {
    COLS: COLS,
    ROWS: ROWS,
    RECIPES: RECIPES,
    CHOP_MAP: CHOP_MAP,
    COOK_MAP: COOK_MAP,
    JUICE_MAP: JUICE_MAP,
    CRATE_PROVIDES: CRATE_PROVIDES,
    CANTEENS: CANTEENS,
    LEVELS: LEVELS,
    ENDLESS_LEVEL: ENDLESS_LEVEL,
    APRONS: APRONS,
    HATS: HATS,
    SAVE_VERSION: SAVE_VERSION,
    mulberry32: mulberry32,
    cloneItem: cloneItem,
    canCombine: canCombine,
    combineItems: combineItems,
    getDishId: getDishId,
    defaultSave: defaultSave,
    loadSave: loadSave,
    isLevelUnlocked: isLevelUnlocked,
    nextPlayableLevel: nextPlayableLevel,
    totalStars: totalStars,
    create: create,
    step: step,
    interact: interact,
    updateTarget: updateTarget,
    nextHint: nextHint,
    calcStars: calcStars,
    publicState: publicState
  };
});
