/*
 * مطبخ الفسحة (Recess Kitchen: Turbo Robo-Chef & Burger Cannon) — Pure Simulation Engine
 * Dual CommonJS (Node tests) + Browser global (window.RKEngine / window.RK).
 * Deterministic: zero DOM, zero browser storage, zero timers, zero Math.random.
 */
(function () {
  'use strict';

  var W = 1280, H = 720, COLS = 13, ROWS = 6, TILE = 84, GX = 94, GY = 196;
  var CHEF_R = 26, BASE_SPEED = 295, DASH_SPEED = 640, DASH_DUR = 0.19, DASH_CD = 0.55;

  var WORLDS = [
    { id: 'canteen', name: 'مقصف المدرسة', color: '#ff8c2b', floorA: '#fff8ec', floorB: '#ffe7be', trim: '#c2410c' },
    { id: 'truck', name: 'شاحنة التيربو', color: '#00b4d8', floorA: '#eefbff', floorB: '#cdeffd', trim: '#0369a1' },
    { id: 'space', name: 'مطبخ الفضاء', color: '#8b5cf6', floorA: '#f4efff', floorB: '#ded1ff', trim: '#5b21b6' },
    { id: 'festival', name: 'مهرجان الأبطال', color: '#ef476f', floorA: '#fff0f4', floorB: '#ffd2e1', trim: '#be123c' }
  ];

  var CUSTOMERS = [
    { id: 'striker', name: 'بطل الكرة', color: '#38bdf8' },
    { id: 'robo', name: 'الآلي الجائع', color: '#a855f7' },
    { id: 'dino', name: 'الديناصور الصغير', color: '#22c55e' },
    { id: 'ninja', name: 'نينجا الفسحة', color: '#f43f5e' }
  ];

  var DIFFICULTIES = {
    easy: { id: 'easy', name: 'سهل', sub: 'بلا احتراق', canBurn: false, patienceMul: 1.4, goalMul: 0.8, reachBonus: 18, orderGap: 6.2, vipChance: 0.12 },
    normal: { id: 'normal', name: 'متوسط', sub: 'متوازن وممتع', canBurn: true, patienceMul: 1.0, goalMul: 1.0, reachBonus: 0, orderGap: 5.0, vipChance: 0.2 },
    hero: { id: 'hero', name: 'بطل', sub: 'سرعة وطلبات ذهبية', canBurn: true, patienceMul: 0.82, goalMul: 1.15, reachBonus: 0, orderGap: 3.8, vipChance: 0.42 }
  };

  var ITEMS = {
    bun: { id: 'bun', name: 'خبز' },
    meatRaw: { id: 'meatRaw', name: 'لحم طازج' },
    meatCooked: { id: 'meatCooked', name: 'برجر مشوي' },
    cheese: { id: 'cheese', name: 'جبن' },
    bunCheese: { id: 'bunCheese', name: 'خبز بالجبن' },
    meatCheese: { id: 'meatCheese', name: 'برجر بالجبن' },
    potatoRaw: { id: 'potatoRaw', name: 'بطاطس' },
    fries: { id: 'fries', name: 'بطاطس مقرمشة' },
    fruitRaw: { id: 'fruitRaw', name: 'فواكه' },
    juice: { id: 'juice', name: 'عصير الصاروخ' },
    dough: { id: 'dough', name: 'عجينة' },
    pizzaRaw: { id: 'pizzaRaw', name: 'عجينة بالجبن' },
    burger: { id: 'burger', name: 'برجر عملاق' },
    cheeseburger: { id: 'cheeseburger', name: 'برجر بالجبن' },
    pizza: { id: 'pizza', name: 'بيتزا النجوم' }
  };

  var DISHES = {
    burger: { id: 'burger', name: 'برجر عملاق', coins: 26, steps: ['bun', 'meatCooked'] },
    cheeseburger: { id: 'cheeseburger', name: 'برجر بالجبن', coins: 34, steps: ['bun', 'meatCooked', 'cheese'] },
    juice: { id: 'juice', name: 'عصير الصاروخ', coins: 20, steps: ['fruitRaw', 'blender'] },
    fries: { id: 'fries', name: 'بطاطس مقرمشة', coins: 22, steps: ['potatoRaw', 'fryer'] },
    pizza: { id: 'pizza', name: 'بيتزا النجوم', coins: 36, steps: ['dough', 'cheese', 'oven'] }
  };

  var APRONS = [
    { id: 'school', name: 'طاهي المدرسة', color: '#ff8c2b', cost: 0 },
    { id: 'neon', name: 'طاهي النيون', color: '#00f5d4', cost: 60 },
    { id: 'turbo', name: 'درع التيربو', color: '#ef476f', cost: 90 },
    { id: 'galaxy', name: 'بدلة المجرة', color: '#8b5cf6', cost: 120 }
  ];

  var HATS = [
    { id: 'toque', name: 'قبعة الشيف', color: '#ffffff', cost: 0 },
    { id: 'pirate', name: 'قبعة القرصان', color: '#2b2d42', cost: 50 },
    { id: 'space', name: 'خوذة الفضاء', color: '#38bdf8', cost: 80 },
    { id: 'crown', name: 'التاج الذهبي', color: '#ffd166', cost: 120 }
  ];

  var LEVELS = [
    { id: '1-1', world: 0, name: 'برجر الجرس الأول', duration: 70, goals: [45, 90, 140], dishes: ['burger', 'juice'], map: [
      '#BM##SSS##FT#',
      '#...........#',
      'G..1........J',
      'G..2..##....J',
      '#.........A.#',
      '#############'
    ] },
    { id: '1-2', world: 0, name: 'شطيرة الجبن الذهبي', duration: 75, goals: [55, 105, 160], dishes: ['burger', 'cheeseburger', 'juice'], map: [
      '#BMC#SSS##FT#',
      '#...........#',
      'G..1........J',
      'G..2.###....J',
      '#.........A.#',
      '#############'
    ] },
    { id: '1-3', world: 0, name: 'زحمة الفسحة الأولى', duration: 75, goals: [60, 115, 175], dishes: ['burger', 'cheeseburger', 'juice'], map: [
      '#BMC#SSS#CFT#',
      '#...........#',
      'G..1........J',
      'G..2.###....J',
      '#.........A.#',
      '#############'
    ] },
    { id: '2-1', world: 1, name: 'انطلاق الشاحنة', duration: 75, goals: [60, 115, 175], dishes: ['burger', 'fries', 'juice'], map: [
      '#BMP#SSS#PFT#',
      '#.>>>>.<<<<.#',
      'G..1........Y',
      'G..2..##....J',
      '#.........A.#',
      '#############'
    ] },
    { id: '2-2', world: 1, name: 'حزام البطاطس السريع', duration: 75, goals: [65, 125, 190], dishes: ['cheeseburger', 'fries', 'burger'], map: [
      '#BMC#SSS#CPT#',
      '#.>>>>.<<<<.#',
      'G..1........Y',
      'G..2.RR#....Y',
      '#.........A.#',
      '#############'
    ] },
    { id: '2-3', world: 1, name: 'سباق الوجبات السريعة', duration: 80, goals: [75, 140, 210], dishes: ['cheeseburger', 'fries', 'juice', 'burger'], map: [
      '#BMC#SSS#PFT#',
      '#.>>>>>>>>>.#',
      'G..1........Y',
      'G..2.RR#....J',
      '#...<<<<<.A.#',
      '######Y######'
    ] },
    { id: '3-1', world: 2, name: 'فرن بيتزا النجوم', duration: 75, goals: [65, 125, 190], dishes: ['pizza', 'juice', 'fries'], map: [
      '#DCF#SSS#PFT#',
      '#...........#',
      'O..1........Y',
      'O..2..##....J',
      '#.........A.#',
      '#############'
    ] },
    { id: '3-2', world: 2, name: 'بوابة الفضاء العجيبة', duration: 80, goals: [75, 140, 210], dishes: ['pizza', 'burger', 'juice'], map: [
      '#DCB#SSS#MFT#',
      '#...........#',
      'O..1........G',
      'O..2..##....J',
      '#.........A.#',
      '##W#######W##'
    ] },
    { id: '3-3', world: 2, name: 'حفل المجرة', duration: 80, goals: [80, 155, 230], dishes: ['pizza', 'cheeseburger', 'fries', 'juice'], map: [
      '#DCB#SSS#MPT#',
      '#.>>>>.<<<<.#',
      'O..1........G',
      'O..2..##....Y',
      '#.........A.J',
      '##W###F###W##'
    ] },
    { id: '4-1', world: 3, name: 'مدرج الأبطال', duration: 80, goals: [85, 160, 240], dishes: ['cheeseburger', 'burger', 'fries', 'juice'], map: [
      '#BMC#SSS#PFT#',
      '#.>>>>>>>>>.#',
      'G..1........Y',
      'G..2.RR#....J',
      '#...<<<<<.A.#',
      '####G###Y####'
    ] },
    { id: '4-2', world: 3, name: 'مهرجان البيتزا والبرجر', duration: 80, goals: [90, 170, 255], dishes: ['pizza', 'cheeseburger', 'fries', 'juice'], map: [
      '#DCB#SSS#MPT#',
      '#.>>>>.<<<<.#',
      'O..1........G',
      'G..2..##....Y',
      '#.........A.J',
      '##W###F###W##'
    ] },
    { id: '4-3', world: 3, name: 'تحدي الشيف الأسطوري', duration: 85, goals: [95, 185, 275], dishes: ['pizza', 'cheeseburger', 'burger', 'fries', 'juice'], map: [
      '#DCB#SSS#MPT#',
      '#.>>>>.<<<<.#',
      'O..1........G',
      'G..2.RR#....Y',
      '#...<<<<<.A.J',
      '##W#O###F#W##'
    ] }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function makeRng(seed) {
    var s = (seed | 0) || 1234567;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cellCenter(c, r) {
    return { x: GX + c * TILE + TILE / 2, y: GY + r * TILE + TILE / 2 };
  }

  function posToCell(x, y) {
    return {
      c: clamp(Math.floor((x - GX) / TILE), 0, COLS - 1),
      r: clamp(Math.floor((y - GY) / TILE), 0, ROWS - 1)
    };
  }

  var COMBOS = {
    'bun+meatCooked': 'burger',
    'bun+cheese': 'bunCheese',
    'cheese+meatCooked': 'meatCheese',
    'burger+cheese': 'cheeseburger',
    'bunCheese+meatCooked': 'cheeseburger',
    'bun+meatCheese': 'cheeseburger',
    'cheese+dough': 'pizzaRaw'
  };

  function combineItems(a, b) {
    if (!a || !b || a === b) return null;
    var k1 = a < b ? a + '+' + b : b + '+' + a;
    return COMBOS[k1] || null;
  }

  function isDish(kind) {
    return !!DISHES[kind];
  }

  function dishOf(item) {
    return item && DISHES[item.kind] ? item.kind : null;
  }

  var APPLIANCES = {
    grill: { inKind: 'meatRaw', outKind: 'meatCooked', time: 2.0, canBurn: true, actionLbl: 'اشوِ اللحم!' },
    fryer: { inKind: 'potatoRaw', outKind: 'fries', time: 1.9, canBurn: true, actionLbl: 'اقلِ البطاطس!' },
    blender: { inKind: 'fruitRaw', outKind: 'juice', time: 1.6, canBurn: false, actionLbl: 'اخلط العصير!' },
    oven: { inKind: 'pizzaRaw', outKind: 'pizza', time: 2.2, canBurn: true, actionLbl: 'اخبز البيتزا!' }
  };

  var CRATE_CHARS = { B: 'bun', M: 'meatRaw', C: 'cheese', P: 'potatoRaw', F: 'fruitRaw', D: 'dough' };
  var APP_CHARS = { G: 'grill', Y: 'fryer', J: 'blender', O: 'oven' };

  function create(levelIndex, opts) {
    opts = opts || {};
    var idx = clamp(levelIndex | 0, 0, LEVELS.length - 1);
    var R = LEVELS[idx];
    var diffKey = DIFFICULTIES[opts.difficulty] ? opts.difficulty : 'normal';
    var diff = DIFFICULTIES[diffKey];
    var players = opts.players === 2 ? 2 : 1;
    var dda = typeof opts.dda === 'number' ? clamp(opts.dda, 0, 1) : 0.35;
    var rng = makeRng(opts.seed || ((idx + 1) * 9173 + players * 313));

    var grid = [], stations = [], floorPads = [], warps = [];
    var p1 = cellCenter(3, 2), p2 = cellCenter(3, 3), sousHome = cellCenter(10, 4);

    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        var ch = R.map[r].charAt(c);
        var pt = cellCenter(c, r);
        var st = null;
        if (ch === '1') { p1 = pt; }
        else if (ch === '2') { p2 = pt; }
        else if (ch === '>' || ch === '<') {
          floorPads.push({ c: c, r: r, x: pt.x, y: pt.y, type: 'boost', dir: ch === '>' ? 1 : -1 });
        } else if (ch === 'A') {
          sousHome = pt;
          floorPads.push({ c: c, r: r, x: pt.x, y: pt.y, type: 'sousPad', dir: 0 });
        } else if (ch !== '.') {
          var type = 'counter', kind = null, dir = 0;
          if (CRATE_CHARS[ch]) { type = 'crate'; kind = CRATE_CHARS[ch]; }
          else if (APP_CHARS[ch]) { type = APP_CHARS[ch]; }
          else if (ch === 'S') type = 'cannon';
          else if (ch === 'T') type = 'trash';
          else if (ch === 'R' || ch === 'L') { type = 'belt'; dir = ch === 'R' ? 1 : -1; }
          else if (ch === 'W') type = 'warp';
          else if (ch === '#' && (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1)) {
            type = (r === 0 && c > 0 && c < COLS - 1) ? 'counter' : 'wall';
            if (r === ROWS - 1 || c === 0 || c === COLS - 1) type = 'wall';
          }
          st = {
            id: stations.length, c: c, r: r, x: pt.x, y: pt.y,
            type: type, kind: kind, dir: dir,
            item: null, prep: null, beltT: 0, warpCd: 0, snapLock: 0, wobble: 0,
            cook: APPLIANCES[type] ? { state: 'idle', t: 0, dur: APPLIANCES[type].time, prog: 0 } : null
          };
          stations.push(st);
          if (type === 'warp') warps.push(st);
        }
        row.push(st);
      }
      grid.push(row);
    }

    for (var wi = 0; wi + 1 < warps.length; wi += 2) {
      warps[wi].partner = warps[wi + 1];
      warps[wi + 1].partner = warps[wi];
      warps[wi].pairId = (wi / 2) | 0;
      warps[wi + 1].pairId = (wi / 2) | 0;
    }

    var goals = R.goals.map(function (g) { return Math.max(20, Math.round(g * diff.goalMul)); });
    var burnHold = typeof opts.burnDelay === 'number' ? opts.burnDelay : (diffKey === 'hero' ? 3.5 : (6.4 - dda * 1.8));
    var warnHold = typeof opts.burnDelay === 'number' ? opts.burnDelay * 0.6 : (diffKey === 'hero' ? 2.8 : 4.2);

    var chefs = [makeChef(0, p1.x, p1.y)];
    if (players === 2) chefs.push(makeChef(1, p2.x, p2.y));

    var w = {
      id: R.id, levelIndex: idx, R: R, world: R.world, players: players,
      difficulty: diffKey, diff: diff, dda: dda, rng: rng,
      burnHold: burnHold, warnHold: warnHold,
      grid: grid, stations: stations, floorPads: floorPads,
      chefs: chefs,
      sousBot: players === 1 ? { x: sousHome.x, y: sousHome.y, homeX: sousHome.x, homeY: sousHome.y, state: 'ready', cd: 0, t: 0, tx: sousHome.x, ty: sousHome.y, targetSt: null } : null,
      orders: [], nextOrderId: 1, orderTimer: 2.2,
      shots: [], hints: [], ev: [],
      time: 0, timeLeft: R.duration, duration: R.duration,
      goals: goals, coins: 0, score: 0, served: 0, expired: 0, burnt: 0,
      streak: 0, bestStreak: 0, mult: 1, fever: false,
      atStart: true, done: false, stars: 0
    };

    spawnOrder(w, false);
    spawnOrder(w, idx >= 9 && diffKey !== 'easy');
    return w;
  }

  function makeChef(index, x, y) {
    return {
      index: index, x: x, y: y, vx: 0, vy: 0, faceX: 1, faceY: 0,
      held: null, moved: false, dashT: 0, dashCd: 0, boostT: 0, nav: null
    };
  }

  function spawnOrder(w, forceVip) {
    if (w.orders.length >= 3) return false;
    var usedSlots = [false, false, false];
    for (var i = 0; i < w.orders.length; i++) usedSlots[w.orders[i].slot] = true;
    var slot = usedSlots.indexOf(false);
    if (slot < 0) return false;

    var dishes = w.R.dishes;
    var dish = dishes[Math.floor(w.rng() * dishes.length)];
    // Ensure early variety on first two orders
    if (w.orders.length === 1 && dishes.length > 1 && w.orders[0].dish === dish) {
      dish = dishes[(dishes.indexOf(dish) + 1) % dishes.length];
    }
    var cust = CUSTOMERS[(w.nextOrderId + Math.floor(w.rng() * CUSTOMERS.length)) % CUSTOMERS.length];
    var vipChance = w.diff.vipChance + (w.world === 3 ? 0.18 : 0);
    var vip = forceVip || (w.nextOrderId > 1 && w.rng() < vipChance);
    var basePat = (46 - w.dda * 6) * w.diff.patienceMul * (vip ? 0.92 : 1);
    var ord = {
      id: w.nextOrderId++,
      slot: slot,
      dish: dish,
      steps: DISHES[dish].steps,
      customer: cust.id,
      customerName: cust.name,
      vip: !!vip,
      patience: basePat,
      maxPatience: basePat
    };
    w.orders.push(ord);
    w.ev.push({ t: 'orderIn', slot: slot, dish: dish, vip: ord.vip });
    return true;
  }

  function findStation(w, pred) {
    for (var i = 0; i < w.stations.length; i++) if (pred(w.stations[i])) return w.stations[i];
    return null;
  }

  function addHint(w, st, x, y, text, pred) {
    var target = pred ? findStation(w, pred) : null;
    if (st) st.wobble = 0.45;
    var h = {
      text: text, x: x, y: y,
      targetX: target ? target.x : null,
      targetY: target ? target.y : null,
      targetId: target ? target.id : -1,
      life: 2.3, max: 2.3
    };
    // Replace existing hint at nearby spot so bubbles stay tidy
    for (var i = w.hints.length - 1; i >= 0; i--) {
      if (Math.hypot(w.hints[i].x - x, w.hints[i].y - y) < 90) w.hints.splice(i, 1);
    }
    w.hints.push(h);
    w.ev.push({ t: 'hint', text: text, x: x, y: y, targetX: h.targetX, targetY: h.targetY });
    return false;
  }

  function nearestStation(w, chef) {
    var reach = 88 + w.diff.reachBonus;
    var best = null, bestScore = 1e9;
    for (var i = 0; i < w.stations.length; i++) {
      var st = w.stations[i];
      if (st.type === 'wall') continue;
      var dx = st.x - chef.x, dy = st.y - chef.y;
      var d = Math.hypot(dx, dy);
      if (d > reach) continue;
      var dot = d > 1 ? (dx / d) * chef.faceX + (dy / d) * chef.faceY : 1;
      var score = d - dot * 18;
      if (score < bestScore) { bestScore = score; best = st; }
    }
    return best;
  }

  function promptFor(w, ci) {
    var chef = w.chefs[ci];
    if (!chef) return null;
    var st = nearestStation(w, chef);
    if (!st) return null;
    var held = chef.held ? chef.held.kind : null;

    if (st.type === 'crate') {
      if (!held) return { station: st, label: 'التقط ' + ITEMS[st.kind].name };
      if (combineItems(held, st.kind)) return { station: st, label: 'ادمج ✨' };
      if (held === st.kind) return { station: st, label: 'أعد للصندوق' };
      return { station: st, label: 'يداك مشغولتان' };
    }
    if (st.type === 'counter' || st.type === 'belt' || st.type === 'warp') {
      var label = st.type === 'warp' ? 'بوابة الفضاء ✨' : 'طاولة';
      if (!held && st.item) return { station: st, label: 'التقط ' + ITEMS[st.item.kind].name };
      if (held && !st.item) return { station: st, label: st.type === 'warp' ? 'انقل بالبوابة ✨' : 'ضع هنا' };
      if (held && st.item && combineItems(held, st.item.kind)) return { station: st, label: 'ادمج فوراً! ✨' };
      return { station: st, label: label };
    }
    if (APPLIANCES[st.type]) {
      var ap = APPLIANCES[st.type];
      if (st.cook.state === 'burnt') return { station: st, label: 'نظّف الدخان! ✨' };
      if (st.cook.state === 'done' || st.cook.state === 'warning') {
        if (!held || combineItems(held, ap.outKind)) return { station: st, label: 'جاهز! التقط 🔥' };
      }
      if (st.cook.state === 'cooking') return { station: st, label: 'جاري التحضير...' };
      if (st.type === 'oven' && (held === 'dough' || held === 'cheese') && !st.prep) return { station: st, label: 'جهّز البيتزا 🍕' };
      if (st.type === 'oven' && st.prep && combineItems(st.prep, held) === 'pizzaRaw') return { station: st, label: ap.actionLbl };
      if (held === ap.inKind) return { station: st, label: ap.actionLbl };
      return { station: st, label: ap.actionLbl };
    }
    if (st.type === 'cannon') {
      if (held && isDish(held)) return { station: st, label: 'أطلق الطلب! 🚀' };
      return { station: st, label: 'مدفع التقديم 🚀' };
    }
    if (st.type === 'trash') {
      return { station: st, label: held ? 'أفرغ اليد ♻️' : 'تدوير ♻️' };
    }
    return null;
  }

  function applyWarpIfPossible(w, st) {
    if (st.type !== 'warp' || !st.item || !st.partner || st.warpCd > 0) return;
    var dst = st.partner;
    if (!dst.item) {
      dst.item = st.item;
      st.item = null;
      dst.warpCd = 0.7;
      st.warpCd = 0.4;
      w.ev.push({ t: 'warp', fromX: st.x, fromY: st.y, x: dst.x, y: dst.y, kind: dst.item.kind });
    } else {
      var merged = combineItems(st.item.kind, dst.item.kind);
      if (merged) {
        st.item = null;
        dst.item = { kind: merged };
        dst.warpCd = 0.7;
        w.ev.push({ t: 'warp', fromX: st.x, fromY: st.y, x: dst.x, y: dst.y, kind: merged });
        w.ev.push({ t: 'combine', kind: merged, x: dst.x, y: dst.y });
      }
    }
  }

  function wrongApplianceHint(w, st, held) {
    if (held === 'meatRaw') return addHint(w, st, st.x, st.y - 44, 'اشوِ اللحم على الشواية! 🔥', function (s) { return s.type === 'grill'; });
    if (held === 'potatoRaw') return addHint(w, st, st.x, st.y - 44, 'البطاطس تذهب للمقلاة! 🍟', function (s) { return s.type === 'fryer'; });
    if (held === 'fruitRaw') return addHint(w, st, st.x, st.y - 44, 'الفاكهة تذهب للخلاط! 🚀', function (s) { return s.type === 'blender'; });
    if (held === 'dough' || held === 'pizzaRaw') return addHint(w, st, st.x, st.y - 44, 'البيتزا تذهب للفرن! 🍕', function (s) { return s.type === 'oven'; });
    return null;
  }

  function interact(w, ci, explicitSt) {
    if (w.done) return false;
    var chef = w.chefs[ci | 0];
    if (!chef) return false;
    w.atStart = false;
    chef.moved = true;

    // Check if standing on sousPad in 1P with empty hands and no station targeted
    var st = explicitSt || nearestStation(w, chef);
    if (!st) {
      if (w.sousBot && Math.hypot(chef.x - w.sousBot.homeX, chef.y - w.sousBot.homeY) < 68) {
        return triggerSousBot(w);
      }
      return addHint(w, null, chef.x, chef.y - 48, 'اقترب من الطاولة أولاً! 👟', function (s) { return s.type === 'crate'; });
    }

    var held = chef.held ? chef.held.kind : null;

    if (st.type === 'crate') {
      if (!held) {
        chef.held = { kind: st.kind };
        st.wobble = 0.25;
        w.ev.push({ t: 'pickup', kind: st.kind, x: st.x, y: st.y, chef: ci });
        return true;
      }
      if (held === st.kind) {
        chef.held = null;
        w.ev.push({ t: 'putback', kind: st.kind, x: st.x, y: st.y, chef: ci });
        return true;
      }
      var crateCombo = combineItems(held, st.kind);
      if (crateCombo) {
        chef.held = { kind: crateCombo };
        st.wobble = 0.35;
        w.ev.push({ t: 'combine', kind: crateCombo, x: st.x, y: st.y, chef: ci });
        return true;
      }
      if (held === 'meatRaw' && st.kind === 'bun') {
        return addHint(w, st, st.x, st.y - 44, 'اشوِ اللحم أولاً! 🔥', function (s) { return s.type === 'grill'; });
      }
      return addHint(w, st, st.x, st.y - 44, 'ضع ما بيدك على طاولة فارغة! ✨', function (s) { return s.type === 'counter' && !s.item; });
    }

    if (st.type === 'counter' || st.type === 'belt' || st.type === 'warp') {
      if (st.snapLock > 0 && !st.item && held) return true;
      if (!held && st.item) {
        chef.held = st.item;
        st.item = null;
        st.beltT = 0;
        w.ev.push({ t: 'pickup', kind: chef.held.kind, x: st.x, y: st.y, chef: ci });
        return true;
      }
      if (held && !st.item) {
        st.item = chef.held;
        chef.held = null;
        st.beltT = 0;
        w.ev.push({ t: 'place', kind: st.item.kind, x: st.x, y: st.y, chef: ci });
        applyWarpIfPossible(w, st);
        return true;
      }
      if (held && st.item) {
        var combo = combineItems(held, st.item.kind);
        if (combo) {
          chef.held = { kind: combo };
          st.item = null;
          st.snapLock = 0.25;
          st.wobble = 0.35;
          w.ev.push({ t: 'combine', kind: combo, x: st.x, y: st.y, chef: ci });
          return true;
        }
        if ((held === 'meatRaw' && (st.item.kind === 'bun' || st.item.kind === 'bunCheese')) ||
            (st.item.kind === 'meatRaw' && (held === 'bun' || held === 'bunCheese'))) {
          return addHint(w, st, st.x, st.y - 44, 'اشوِ اللحم أولاً! 🔥', function (s) { return s.type === 'grill'; });
        }
        return addHint(w, st, st.x, st.y - 44, 'لا يندمجان! استخدم طاولة فارغة ✨', function (s) { return s.type === 'counter' && !s.item; });
      }
      return addHint(w, st, st.x, st.y - 44, 'خذ مكوناً من الصندوق! 📦', function (s) { return s.type === 'crate'; });
    }

    if (APPLIANCES[st.type]) {
      var ap = APPLIANCES[st.type];
      var ck = st.cook;

      if (ck.state === 'burnt') {
        ck.state = 'idle'; ck.t = 0; ck.prog = 0; st.prep = null;
        w.ev.push({ t: 'toss', station: st.type, x: st.x, y: st.y, chef: ci });
        if (held === ap.inKind) {
          chef.held = null;
          ck.state = 'cooking'; ck.t = 0; ck.prog = 0;
          w.ev.push({ t: 'cookStart', station: st.type, x: st.x, y: st.y, chef: ci });
        }
        return true;
      }

      if (ck.state === 'done' || ck.state === 'warning') {
        if (!held) {
          chef.held = { kind: ap.outKind };
          ck.state = 'idle'; ck.t = 0; ck.prog = 0; st.prep = null;
          w.ev.push({ t: 'pickup', kind: ap.outKind, x: st.x, y: st.y, chef: ci });
          return true;
        }
        var outCombo = combineItems(held, ap.outKind);
        if (outCombo) {
          chef.held = { kind: outCombo };
          ck.state = 'idle'; ck.t = 0; ck.prog = 0; st.prep = null;
          st.wobble = 0.35;
          w.ev.push({ t: 'combine', kind: outCombo, x: st.x, y: st.y, chef: ci });
          return true;
        }
        return addHint(w, st, st.x, st.y - 44, 'يداك مشغولتان! ضع ما معك أولاً ✨', function (s) { return s.type === 'counter' && !s.item; });
      }

      if (ck.state === 'cooking') {
        return addHint(w, st, st.x, st.y - 44, 'انتظر لحظة.. ينضج الآن! 🔥', null);
      }

      // Idle appliance
      if (st.type === 'oven') {
        if (held === 'pizzaRaw') {
          chef.held = null; st.prep = null;
          ck.state = 'cooking'; ck.t = 0; ck.prog = 0;
          w.ev.push({ t: 'cookStart', station: 'oven', x: st.x, y: st.y, chef: ci });
          return true;
        }
        if (!st.prep && (held === 'dough' || held === 'cheese')) {
          st.prep = held;
          chef.held = null;
          var needKind = held === 'dough' ? 'cheese' : 'dough';
          var needMsg = held === 'dough' ? 'رائع! أضف الجبن ليبدأ الخبز 🧀' : 'رائع! أضف العجينة ليبدأ الخبز 🫓';
          addHint(w, st, st.x, st.y - 44, needMsg, function (s) { return s.type === 'crate' && s.kind === needKind; });
          w.ev.push({ t: 'place', kind: st.prep, x: st.x, y: st.y, chef: ci });
          return true;
        }
        if (st.prep && combineItems(st.prep, held) === 'pizzaRaw') {
          chef.held = null; st.prep = null;
          ck.state = 'cooking'; ck.t = 0; ck.prog = 0;
          w.ev.push({ t: 'combine', kind: 'pizzaRaw', x: st.x, y: st.y, chef: ci });
          w.ev.push({ t: 'cookStart', station: 'oven', x: st.x, y: st.y, chef: ci });
          return true;
        }
        if (st.prep && !held) {
          chef.held = { kind: st.prep };
          st.prep = null;
          w.ev.push({ t: 'pickup', kind: chef.held.kind, x: st.x, y: st.y, chef: ci });
          return true;
        }
      }

      if (held === ap.inKind) {
        chef.held = null;
        ck.state = 'cooking'; ck.t = 0; ck.prog = 0;
        w.ev.push({ t: 'cookStart', station: st.type, x: st.x, y: st.y, chef: ci });
        return true;
      }

      if (held && wrongApplianceHint(w, st, held) === false) return false;
      var wantCrate = st.type === 'oven' ? 'dough' : ap.inKind;
      var msgMap = {
        grill: 'أحضر اللحم الطازج للشواية! 🥩',
        fryer: 'أحضر البطاطس للمقلاة! 🥔',
        blender: 'أحضر الفواكه للخلاط! 🍓',
        oven: 'أحضر العجينة والجبن للفرن! 🍕'
      };
      return addHint(w, st, st.x, st.y - 44, msgMap[st.type], function (s) { return s.type === 'crate' && s.kind === wantCrate; });
    }

    if (st.type === 'cannon') {
      if (!held) {
        return addHint(w, st, st.x, st.y + 38, 'احمل وجبة جاهزة لإطلاقها! 🚀', function (s) { return s.type === 'crate'; });
      }
      if (!isDish(held)) {
        if (held === 'meatRaw') return addHint(w, st, st.x, st.y + 38, 'اشوِ اللحم أولاً! 🔥', function (s) { return s.type === 'grill'; });
        if (held === 'potatoRaw') return addHint(w, st, st.x, st.y + 38, 'اقلِ البطاطس أولاً! 🍟', function (s) { return s.type === 'fryer'; });
        if (held === 'fruitRaw') return addHint(w, st, st.x, st.y + 38, 'اخلط الفاكهة أولاً! 🚀', function (s) { return s.type === 'blender'; });
        if (held === 'dough') return addHint(w, st, st.x, st.y + 38, 'أضف الجبن ثم اخبزها! 🧀', function (s) { return s.type === 'crate' && s.kind === 'cheese'; });
        if (held === 'pizzaRaw') return addHint(w, st, st.x, st.y + 38, 'اخبز البيتزا في الفرن! 🍕', function (s) { return s.type === 'oven'; });
        if (held === 'meatCooked' || held === 'meatCheese') return addHint(w, st, st.x, st.y + 38, 'أضف الخبز لإكمال البرجر! 🍞', function (s) { return s.type === 'crate' && s.kind === 'bun'; });
        return addHint(w, st, st.x, st.y + 38, 'أضف البرجر المشوي للخبز! 🥩', function (s) { return s.type === 'grill' || (s.type === 'crate' && s.kind === 'meatRaw'); });
      }

      // Find best matching customer order (lowest remaining patience first)
      var matchIdx = -1, lowestPat = 1e9;
      for (var oi = 0; oi < w.orders.length; oi++) {
        if (w.orders[oi].dish === held && w.orders[oi].patience < lowestPat) {
          lowestPat = w.orders[oi].patience;
          matchIdx = oi;
        }
      }
      if (matchIdx < 0) {
        return addHint(w, st, st.x, st.y + 38, 'لا أحد طلب هذا الآن! شاهد الزبائن 👀', function (s) { return s.type === 'counter' && !s.item; });
      }

      var ord = w.orders.splice(matchIdx, 1)[0];
      chef.held = null;
      w.served++;
      w.streak++;
      if (w.streak > w.bestStreak) w.bestStreak = w.streak;
      w.mult = w.streak >= 4 ? 3 : w.streak >= 2 ? 2 : 1;
      w.fever = w.streak >= 4;

      var dishDef = DISHES[held];
      var tip = Math.round(6 * clamp(ord.patience / ord.maxPatience, 0, 1));
      var streakBonus = w.mult === 3 ? 12 : w.mult === 2 ? 5 : 0;
      var earned = (dishDef.coins + tip + streakBonus) * (ord.vip ? 2 : 1);
      w.coins += earned;
      w.score = w.coins;
      updateStars(w);

      var slotX = 330 + ord.slot * 310;
      w.shots.push({ dish: held, x0: st.x, y0: st.y - 16, x1: slotX, y1: 102, t: 0, dur: 0.28, vip: ord.vip });
      st.wobble = 0.4;
      w.ev.push({ t: 'serve', dish: held, coins: earned, streak: w.streak, mult: w.mult, vip: ord.vip, slot: ord.slot, x: st.x, y: st.y });

      if (w.orders.length === 0) spawnOrder(w, false);
      w.orderTimer = Math.min(w.orderTimer, 1.4);
      return true;
    }

    if (st.type === 'trash') {
      if (held) {
        chef.held = null;
        st.wobble = 0.3;
        w.ev.push({ t: 'toss', station: 'trash', x: st.x, y: st.y, chef: ci });
        return true;
      }
      return addHint(w, st, st.x, st.y - 44, 'الحاوية لتفريغ اليد عند الحاجة! ♻️', null);
    }

    return false;
  }

  function dash(w, ci) {
    var chef = w.chefs[ci | 0];
    if (!chef || w.done || chef.dashCd > 0) return false;
    w.atStart = false;
    chef.moved = true;
    chef.dashT = DASH_DUR;
    chef.dashCd = DASH_CD;
    w.ev.push({ t: 'dash', chef: chef.index, x: chef.x, y: chef.y });
    return true;
  }

  function triggerSousBot(w) {
    if (!w.sousBot || w.done) return false;
    var bot = w.sousBot;
    if (bot.state !== 'ready' || bot.cd > 0) {
      return addHint(w, null, bot.x, bot.y - 42, 'المساعد يشحن طاقته! ⚡', null);
    }
    w.atStart = false;

    // 1. Rescue any warning/burnt appliance immediately
    for (var i = 0; i < w.stations.length; i++) {
      var s = w.stations[i];
      if (s.cook && (s.cook.state === 'warning' || s.cook.state === 'burnt')) {
        s.cook.state = 'done';
        s.cook.t = 0;
        w.ev.push({ t: 'botRescue', x: s.x, y: s.y });
      } else if (s.cook && s.cook.state === 'cooking') {
        s.cook.t = s.cook.dur;
      }
    }

    // 2. Pick a helpful item for the first active order and deliver it to a free counter!
    var wantDish = w.orders.length ? w.orders[0].dish : w.R.dishes[0];
    var giftKind = wantDish === 'pizza' ? 'pizzaRaw' : wantDish === 'fries' ? 'fries' : wantDish === 'juice' ? 'juice' : 'meatCooked';
    var freeCounter = findStation(w, function (st) { return st.type === 'counter' && !st.item; });

    bot.state = 'go';
    bot.t = 0;
    bot.gift = giftKind;
    bot.targetSt = freeCounter;
    bot.tx = freeCounter ? freeCounter.x : W / 2;
    bot.ty = freeCounter ? freeCounter.y + 42 : H / 2;
    w.ev.push({ t: 'botGo', x: bot.x, y: bot.y, gift: giftKind });
    return true;
  }

  function isWalkable(w, c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    return !w.grid[r][c];
  }

  function clickAt(w, ci, lx, ly) {
    if (w.done) return false;
    var chef = w.chefs[ci | 0];
    if (!chef) return false;
    var tc = posToCell(lx, ly);

    // Check if clicked Mini Sous-Bot pad directly in 1P
    if (w.sousBot && Math.hypot(lx - w.sousBot.x, ly - w.sousBot.y) < 46 && w.sousBot.state === 'ready') {
      return triggerSousBot(w);
    }

    var targetSt = w.grid[tc.r][tc.c];
    if (targetSt && targetSt.type === 'wall') targetSt = null;

    var start = posToCell(chef.x, chef.y);
    if (!isWalkable(w, start.c, start.r)) {
      // Nudge to nearest walkable cell
      var dirs0 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var d0 = 0; d0 < 4; d0++) {
        if (isWalkable(w, start.c + dirs0[d0][0], start.r + dirs0[d0][1])) {
          start = { c: start.c + dirs0[d0][0], r: start.r + dirs0[d0][1] };
          break;
        }
      }
    }

    var goals = [];
    if (targetSt) {
      var adj = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (var a = 0; a < 4; a++) {
        var nc = targetSt.c + adj[a][0], nr = targetSt.r + adj[a][1];
        if (isWalkable(w, nc, nr)) goals.push({ c: nc, r: nr });
      }
    } else if (isWalkable(w, tc.c, tc.r)) {
      goals.push(tc);
    }
    if (!goals.length) return false;

    w.atStart = false;
    chef.moved = true;

    // If already adjacent to targetSt, interact immediately!
    if (targetSt && Math.hypot(chef.x - targetSt.x, chef.y - targetSt.y) <= 88 + w.diff.reachBonus) {
      var dx0 = targetSt.x - chef.x, dy0 = targetSt.y - chef.y, l0 = Math.hypot(dx0, dy0) || 1;
      chef.faceX = dx0 / l0; chef.faceY = dy0 / l0;
      chef.nav = null;
      interact(w, ci, targetSt);
      return true;
    }

    // BFS shortest path on 13x6 grid
    var seen = {}, queue = [{ c: start.c, r: start.r, path: [] }], found = null;
    seen[start.c + ',' + start.r] = true;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (queue.length) {
      var cur = queue.shift();
      for (var gi = 0; gi < goals.length; gi++) {
        if (cur.c === goals[gi].c && cur.r === goals[gi].r) { found = cur.path; break; }
      }
      if (found) break;
      for (var di = 0; di < 4; di++) {
        var xc = cur.c + dirs[di][0], xr = cur.r + dirs[di][1], key = xc + ',' + xr;
        if (!seen[key] && isWalkable(w, xc, xr)) {
          seen[key] = true;
          queue.push({ c: xc, r: xr, path: cur.path.concat([cellCenter(xc, xr)]) });
        }
      }
    }
    if (!found) return false;
    if (!found.length) found.push(cellCenter(goals[0].c, goals[0].r));

    chef.nav = { pts: found, target: targetSt };
    if (chef.dashCd <= 0 && found.length >= 2) {
      chef.dashT = DASH_DUR;
      chef.dashCd = DASH_CD;
      w.ev.push({ t: 'dash', chef: chef.index, x: chef.x, y: chef.y });
    }
    return true;
  }

  function resolveCollisions(w, chef) {
    var minX = GX + CHEF_R, maxX = GX + COLS * TILE - CHEF_R;
    var minY = GY + CHEF_R, maxY = GY + ROWS * TILE - CHEF_R;
    chef.x = clamp(chef.x, minX, maxX);
    chef.y = clamp(chef.y, minY, maxY);

    var cc = posToCell(chef.x, chef.y);
    var half = TILE / 2 - 2;
    for (var r = Math.max(0, cc.r - 1); r <= Math.min(ROWS - 1, cc.r + 1); r++) {
      for (var c = Math.max(0, cc.c - 1); c <= Math.min(COLS - 1, cc.c + 1); c++) {
        var st = w.grid[r][c];
        if (!st) continue;
        var nx = clamp(chef.x, st.x - half, st.x + half);
        var ny = clamp(chef.y, st.y - half, st.y + half);
        var dx = chef.x - nx, dy = chef.y - ny;
        var d2 = dx * dx + dy * dy;
        if (d2 < CHEF_R * CHEF_R) {
          var d = Math.sqrt(d2);
          if (d > 0.001) {
            var push = CHEF_R - d;
            chef.x += (dx / d) * push;
            chef.y += (dy / d) * push;
          } else {
            chef.y += CHEF_R;
          }
        }
      }
    }
  }

  function checkProximityAutoSnap(w, chef) {
    if (!chef.held) return;
    for (var i = 0; i < w.stations.length; i++) {
      var st = w.stations[i];
      if ((st.type === 'counter' || st.type === 'belt' || st.type === 'warp') && st.item) {
        if (Math.hypot(chef.x - st.x, chef.y - st.y) <= 66) {
          var merged = combineItems(chef.held.kind, st.item.kind);
          if (merged) {
            chef.held = { kind: merged };
            st.item = null;
            st.snapLock = 0.28;
            st.wobble = 0.35;
            if (chef.nav && chef.nav.target === st) chef.nav = null;
            w.ev.push({ t: 'combine', kind: merged, x: st.x, y: st.y, chef: chef.index });
            return;
          }
        }
      }
    }
  }

  function updateStars(w) {
    var s = 0;
    for (var i = 0; i < 3; i++) if (w.coins >= w.goals[i]) s = i + 1;
    w.stars = s;
  }

  function normalizeInputs(inputs, nChefs) {
    if (!inputs) return [{}, {}];
    if (Array.isArray(inputs)) return [inputs[0] || {}, inputs[1] || {}];
    if (typeof inputs.mx === 'number' || typeof inputs.my === 'number' || inputs.act || inputs.dash) {
      return [inputs, {}];
    }
    return [inputs.p1 || {}, nChefs > 1 ? (inputs.p2 || {}) : {}];
  }

  function stepChef(w, chef, inp, dt) {
    if (chef.dashT > 0) chef.dashT = Math.max(0, chef.dashT - dt);
    if (chef.dashCd > 0) chef.dashCd = Math.max(0, chef.dashCd - dt);
    if (chef.boostT > 0) chef.boostT = Math.max(0, chef.boostT - dt);

    var mx = inp.mx || 0, my = inp.my || 0;
    if (mx !== 0 || my !== 0) {
      w.atStart = false;
      chef.moved = true;
      chef.nav = null;
    }

    if (inp.dash) dash(w, chef.index);

    // Check floor boost pad under chef
    for (var fi = 0; fi < w.floorPads.length; fi++) {
      var fp = w.floorPads[fi];
      if (fp.type === 'boost' && Math.abs(chef.x - fp.x) < TILE * 0.5 && Math.abs(chef.y - fp.y) < TILE * 0.5) {
        chef.boostT = 0.22;
      }
    }

    var spMul = (chef.boostT > 0 ? 1.42 : 1) * (w.fever ? 1.12 : 1);
    var sp = (chef.dashT > 0 ? DASH_SPEED : BASE_SPEED) * spMul;

    if (chef.nav) {
      var wp = chef.nav.pts[0];
      if (wp) {
        var dx = wp.x - chef.x, dy = wp.y - chef.y, dist = Math.hypot(dx, dy);
        if (dist <= Math.max(10, sp * dt * 1.1)) {
          chef.x = wp.x; chef.y = wp.y;
          chef.nav.pts.shift();
        } else {
          mx = dx / dist; my = dy / dist;
        }
      }
      if (!chef.nav.pts.length) {
        var tgt = chef.nav.target;
        chef.nav = null;
        chef.vx = 0; chef.vy = 0;
        if (tgt) {
          var tdx = tgt.x - chef.x, tdy = tgt.y - chef.y, tl = Math.hypot(tdx, tdy) || 1;
          chef.faceX = tdx / tl; chef.faceY = tdy / tl;
          interact(w, chef.index, tgt);
        }
        checkProximityAutoSnap(w, chef);
        return;
      }
    }

    var len = Math.hypot(mx, my);
    if (len > 0.01) {
      mx /= len; my /= len;
      chef.faceX = mx; chef.faceY = my;
      chef.vx = mx * sp;
      chef.vy = my * sp;
      chef.x += chef.vx * dt;
      chef.y += chef.vy * dt;
      resolveCollisions(w, chef);
      checkProximityAutoSnap(w, chef);
    } else {
      chef.vx = 0;
      chef.vy = 0;
    }

    if (inp.act) interact(w, chef.index);
  }

  function stepSousBot(w, dt) {
    var bot = w.sousBot;
    if (!bot) return;
    if (bot.cd > 0) {
      bot.cd = Math.max(0, bot.cd - dt);
      if (bot.cd === 0 && bot.state === 'cooldown') bot.state = 'ready';
    }
    if (bot.state === 'go') {
      var dx = bot.tx - bot.x, dy = bot.ty - bot.y, d = Math.hypot(dx, dy);
      var sp = 520 * dt;
      if (d <= sp + 6) {
        bot.x = bot.tx; bot.y = bot.ty;
        if (bot.targetSt && !bot.targetSt.item) {
          bot.targetSt.item = { kind: bot.gift };
          bot.targetSt.wobble = 0.35;
          w.ev.push({ t: 'botDrop', kind: bot.gift, x: bot.targetSt.x, y: bot.targetSt.y });
        }
        bot.state = 'return';
      } else {
        bot.x += (dx / d) * sp;
        bot.y += (dy / d) * sp;
      }
    } else if (bot.state === 'return') {
      var hx = bot.homeX - bot.x, hy = bot.homeY - bot.y, hd = Math.hypot(hx, hy);
      var hsp = 480 * dt;
      if (hd <= hsp + 6) {
        bot.x = bot.homeX; bot.y = bot.homeY;
        bot.state = 'cooldown';
        bot.cd = 7.5;
      } else {
        bot.x += (hx / hd) * hsp;
        bot.y += (hy / hd) * hsp;
      }
    }
  }

  function stepStations(w, dt) {
    var cookMul = w.fever ? 2.0 : 1.0;
    for (var i = 0; i < w.stations.length; i++) {
      var st = w.stations[i];
      if (st.wobble > 0) st.wobble = Math.max(0, st.wobble - dt * 2.4);
      if (st.warpCd > 0) st.warpCd = Math.max(0, st.warpCd - dt);
      if (st.snapLock > 0) st.snapLock = Math.max(0, st.snapLock - dt);

      // Conveyor belts slide items smoothly to neighbor counter/belt
      if (st.type === 'belt' && st.item) {
        st.beltT += dt;
        if (st.beltT >= 0.6) {
          var nc = st.c + st.dir;
          var nextSt = (nc >= 0 && nc < COLS) ? w.grid[st.r][nc] : null;
          if (nextSt && (nextSt.type === 'counter' || nextSt.type === 'belt' || nextSt.type === 'warp')) {
            if (!nextSt.item) {
              nextSt.item = st.item;
              nextSt.beltT = 0;
              st.item = null;
              st.beltT = 0;
              w.ev.push({ t: 'beltMove', x: nextSt.x, y: nextSt.y });
              applyWarpIfPossible(w, nextSt);
            } else {
              var bCombo = combineItems(st.item.kind, nextSt.item.kind);
              if (bCombo) {
                nextSt.item = { kind: bCombo };
                st.item = null;
                st.beltT = 0;
                nextSt.wobble = 0.35;
                w.ev.push({ t: 'combine', kind: bCombo, x: nextSt.x, y: nextSt.y });
              }
            }
          }
        }
      }

      if (st.cook) {
        var ap = APPLIANCES[st.type], ck = st.cook;
        if (ck.state === 'cooking') {
          ck.t += dt * cookMul;
          ck.prog = clamp(ck.t / ck.dur, 0, 1);
          if (ck.t >= ck.dur) {
            ck.state = 'done';
            ck.t = 0;
            ck.prog = 1;
            st.wobble = 0.3;
            w.ev.push({ t: 'cooked', station: st.type, kind: ap.outKind, x: st.x, y: st.y });
          }
        } else if (ck.state === 'done' && w.diff.canBurn && ap.canBurn) {
          ck.t += dt;
          if (ck.t >= w.burnHold) {
            ck.state = 'warning';
            ck.t = 0;
            w.ev.push({ t: 'warn', station: st.type, x: st.x, y: st.y });
          }
        } else if (ck.state === 'warning' && w.diff.canBurn && ap.canBurn) {
          ck.t += dt;
          if (ck.t >= w.warnHold) {
            ck.state = 'burnt';
            ck.t = 0;
            w.burnt++;
            w.streak = 0; w.mult = 1; w.fever = false;
            w.ev.push({ t: 'burn', station: st.type, x: st.x, y: st.y });
          }
        }
      }
    }
  }

  function step(w, dt, inputs) {
    if (w.done || !(dt > 0)) return w;
    dt = Math.min(dt, 0.1);
    w.time += dt;
    w.timeLeft = Math.max(0, w.duration - w.time);

    var pair = normalizeInputs(inputs, w.chefs.length);
    for (var ci = 0; ci < w.chefs.length; ci++) {
      stepChef(w, w.chefs[ci], pair[ci], dt);
    }
    if (w.chefs.length === 2) {
      // Gentle friendly chef-to-chef nudge so they never overlap completely
      var a = w.chefs[0], b = w.chefs[1];
      var dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
      if (dist > 0.1 && dist < CHEF_R * 1.7) {
        var push = (CHEF_R * 1.7 - dist) * 0.5;
        a.x -= (dx / dist) * push; a.y -= (dy / dist) * push;
        b.x += (dx / dist) * push; b.y += (dy / dist) * push;
        resolveCollisions(w, a);
        resolveCollisions(w, b);
      }
    }

    if (pair[0] && pair[0].bot) triggerSousBot(w);
    stepSousBot(w, dt);
    stepStations(w, dt);

    // Order spawning & patience countdown
    w.orderTimer -= dt;
    if (w.orderTimer <= 0) {
      spawnOrder(w, false);
      w.orderTimer = w.diff.orderGap * (0.85 + w.rng() * 0.3);
    }
    for (var oi = w.orders.length - 1; oi >= 0; oi--) {
      var ord = w.orders[oi];
      ord.patience -= dt;
      if (ord.patience <= 0) {
        w.orders.splice(oi, 1);
        w.expired++;
        w.streak = 0; w.mult = 1; w.fever = false;
        w.ev.push({ t: 'expire', slot: ord.slot, dish: ord.dish });
        if (w.orders.length === 0) spawnOrder(w, false);
      }
    }

    for (var si = w.shots.length - 1; si >= 0; si--) {
      w.shots[si].t += dt;
      if (w.shots[si].t >= w.shots[si].dur) w.shots.splice(si, 1);
    }
    for (var hi = w.hints.length - 1; hi >= 0; hi--) {
      w.hints[hi].life -= dt;
      if (w.hints[hi].life <= 0) w.hints.splice(hi, 1);
    }

    if (w.timeLeft <= 0) {
      w.done = true;
      updateStars(w);
      w.ev.push({ t: 'finish', stars: w.stars, coins: w.coins, served: w.served });
    }
    return w;
  }

  /* ------------------------------------------------ Save & Locker Helpers */
  function loadSave(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var lvSrc = Array.isArray(src.lv) ? src.lv : [];
    var lv = [];
    for (var i = 0; i < LEVELS.length; i++) {
      var e = lvSrc[i] && typeof lvSrc[i] === 'object' ? lvSrc[i] : {};
      lv.push({
        s: clamp(e.s | 0, 0, 3),
        best: Math.max(0, e.best | 0)
      });
    }
    var aprons = [1, 0, 0, 0], hats = [1, 0, 0, 0];
    if (Array.isArray(src.aprons)) for (var a = 1; a < APRONS.length; a++) aprons[a] = src.aprons[a] ? 1 : 0;
    if (Array.isArray(src.hats)) for (var h = 1; h < HATS.length; h++) hats[h] = src.hats[h] ? 1 : 0;
    var apIdx = clamp(src.apron | 0, 0, APRONS.length - 1);
    var htIdx = clamp(src.hat | 0, 0, HATS.length - 1);
    var diff = DIFFICULTIES[src.difficulty] ? src.difficulty : 'normal';
    return {
      v: 2,
      lv: lv,
      coins: Math.max(0, src.coins | 0),
      aprons: aprons,
      hats: hats,
      apron: aprons[apIdx] ? apIdx : 0,
      hat: hats[htIdx] ? htIdx : 0,
      difficulty: diff
    };
  }

  function totalStars(save) {
    var sum = 0;
    for (var i = 0; i < save.lv.length; i++) sum += save.lv[i].s | 0;
    return sum;
  }

  function recordRound(save, w) {
    var entry = save.lv[w.levelIndex];
    var isNewBest = w.coins > entry.best;
    if (w.stars > entry.s) entry.s = w.stars;
    if (isNewBest) entry.best = w.coins;
    save.coins += w.coins;
    return isNewBest;
  }

  function buyOrEquip(save, cat, idx) {
    var list = cat === 'hat' ? HATS : APRONS;
    var owned = cat === 'hat' ? save.hats : save.aprons;
    if (idx < 0 || idx >= list.length) return { ok: false };
    if (owned[idx]) {
      if (cat === 'hat') save.hat = idx; else save.apron = idx;
      return { ok: true, action: 'equip' };
    }
    var cost = list[idx].cost;
    if (save.coins < cost) return { ok: false, reason: 'coins' };
    save.coins -= cost;
    owned[idx] = 1;
    if (cat === 'hat') save.hat = idx; else save.apron = idx;
    return { ok: true, action: 'buy' };
  }

  var RKEngine = {
    W: W, H: H, COLS: COLS, ROWS: ROWS, TILE: TILE, GX: GX, GY: GY, CHEF_R: CHEF_R,
    WORLDS: WORLDS, CUSTOMERS: CUSTOMERS, DIFFICULTIES: DIFFICULTIES,
    ITEMS: ITEMS, DISHES: DISHES, APRONS: APRONS, HATS: HATS, LEVELS: LEVELS, APPLIANCES: APPLIANCES,
    cellCenter: cellCenter, posToCell: posToCell, combineItems: combineItems, isDish: isDish, dishOf: dishOf,
    create: create, step: step, interact: interact, dash: dash, clickAt: clickAt,
    triggerSousBot: triggerSousBot, nearestStation: nearestStation, promptFor: promptFor,
    loadSave: loadSave, totalStars: totalStars, recordRound: recordRound, buyOrEquip: buyOrEquip
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RKEngine;
  if (typeof window !== 'undefined') {
    window.RKEngine = RKEngine;
    window.RK = RKEngine;
  }
})();
