/* Shortcut Factory (مصنع الاختصارات) engine: the toys, the five worlds and their levels,
 * the factory floor (conveyor belts and shipping boxes), the selection, the copy machine
 * (the clipboard), the undo/redo history, orders, the cheeky gremlin robot «بُرغي», the
 * hint planner, stars, coins and saves.
 * Pure: no DOM, no Kit, no timers and no Math.random (a world takes a seed), so
 * tools/tests/shortcut-factory-engine.test.mjs loads it with { window: {} } and plays
 * every level with the shortcuts it teaches. game.js reads the DDA, turns the child's
 * clicks and real key presses into actions and the events into pictures and sound. */
(function () {
  'use strict';
  const SF = window.SF = window.SF || {};
  const W = 1280, H = 720;
  SF.W = W; SF.H = H;
  SF.TIERS = 5;

  /* ---------------------------------------------------------------- toys */
  SF.KINDS = ['duck', 'ball', 'car', 'robot', 'teddy', 'rocket'];
  // One, two (the Arabic dual) and several.
  SF.NAMES = {
    duck: ['بطة', 'بطتان', 'بطات'],
    ball: ['كرة', 'كرتان', 'كرات'],
    car: ['سيارة', 'سيارتان', 'سيارات'],
    robot: ['روبوت', 'روبوتان', 'روبوتات'],
    teddy: ['دبدوب', 'دبدوبان', 'دباديب'],
    rocket: ['صاروخ', 'صاروخان', 'صواريخ']
  };
  SF.say = function (kind, n) { const w = SF.NAMES[kind]; return n === 1 ? w[0] : n === 2 ? w[1] : n + ' ' + w[2]; };
  // «3 بطات وسيارة»
  SF.orderText = function (order) {
    return SF.KINDS.filter(k => order[k] > 0).map(k => SF.say(k, order[k])).join(' و');
  };

  /* ----------------------------------------------------------- shortcuts */
  // Every action the factory knows, with the keycaps the game shows for it and the
  // KeyboardEvent.code of each key (the physical key, so Ctrl+C is KeyC even while
  // Windows types Arabic and event.key is «ؤ»).
  SF.ACTS = {
    select: { keys: ['انقر'], codes: [], name: 'اختر لعبة' },
    copy: { keys: ['Ctrl', 'C'], codes: ['ControlLeft', 'KeyC'], name: 'نسخ' },
    paste: { keys: ['Ctrl', 'V'], codes: ['ControlLeft', 'KeyV'], name: 'لصق' },
    ship: { keys: ['Enter'], codes: ['Enter'], name: 'اشحن' },
    place: { keys: ['انقر'], codes: [], name: 'اختر الصندوق' },
    save: { keys: ['Ctrl', 'S'], codes: ['ControlLeft', 'KeyS'], name: 'احفظ واختم', short: 'احفظ' },
    cut: { keys: ['Ctrl', 'X'], codes: ['ControlLeft', 'KeyX'], name: 'قص' },
    tab: { keys: ['Tab'], codes: ['Tab'], name: 'التالي' },
    del: { keys: ['Delete'], codes: ['Delete'], name: 'احذف' },
    undo: { keys: ['Ctrl', 'Z'], codes: ['ControlLeft', 'KeyZ'], name: 'تراجع' },
    gremlin: { keys: ['Ctrl', 'Z'], codes: ['ControlLeft', 'KeyZ'], name: 'أصلح الفوضى' },
    redo: { keys: ['Ctrl', 'Y'], codes: ['ControlLeft', 'KeyY'], name: 'إعادة' },
    multi: { keys: ['Shift', 'انقر'], codes: ['ShiftLeft'], name: 'اختر أكثر' },
    all: { keys: ['Ctrl', 'A'], codes: ['ControlLeft', 'KeyA'], name: 'تحديد الكل', short: 'حدّد الكل' }
  };
  // The factory's actions card: a click, then the shortcuts in the order they are taught.
  SF.CARD = ['select', 'copy', 'paste', 'ship', 'save', 'cut', 'tab', 'del', 'undo', 'redo', 'multi', 'all'];

  /* -------------------------------------------------------------- worlds */
  SF.WORLDS = [
    { id: 'copy', name: 'ورشة النسخ', color: '#ffd23f', acts: ['copy', 'paste'] },
    { id: 'cut', name: 'قسم القص', color: '#4fd1ff', acts: ['cut', 'tab'] },
    { id: 'bin', name: 'ركن التدوير', color: '#5be38f', acts: ['del', 'undo'] },
    { id: 'gremlin', name: 'بُرغي المشاغب', color: '#c79bff', acts: ['undo', 'redo'] },
    { id: 'big', name: 'المصنع الكبير', color: '#ff9a4d', acts: ['multi', 'all'] }
  ];
  SF.PER_WORLD = 6;

  // Levels. belts: one string per belt (the first toy is the rightmost: the belts carry
  // the toys from the toy maker on the right to the tunnel on the left); boxes: [order,
  // what is already inside]; queue: the orders whose boxes come after; time: a level
  // clock in seconds (0: none); par: seconds for the third star; gremlin: seconds before
  // «بُرغي» first comes to mess a box (0: he stays away); mess: changes he made just
  // before the level starts (each one Ctrl+Z); redo: changes that were undone just
  // before it starts (each one Ctrl+Y; g: it was the gremlin's).
  // "!duck" is a broken duck, "duck*3" three ducks.
  const RAW = [
    // 1 — the copy workshop: click a toy, Ctrl+C, Ctrl+V, Enter, Ctrl+S
    { teach: ['copy', 'paste'], belts: ['duck'], boxes: [['duck*2', '']], par: 40 },
    { teach: ['place'], belts: ['ball car'], boxes: [['car ball', ''], ['ball*2', '']], par: 60 },
    { teach: ['save'], belts: ['car teddy'], boxes: [['car*3', '']], queue: ['teddy*2'], par: 60 },
    { belts: ['duck ball teddy'], boxes: [['duck teddy', ''], ['ball*3', '']], queue: ['teddy*2 duck'], par: 80 },
    { belts: ['robot duck', 'car ball'], boxes: [['robot*2', ''], ['car duck ball', '']], queue: ['duck*3'], par: 90 },
    { belts: ['duck car rocket', 'teddy ball'], boxes: [['rocket*2', ''], ['teddy car', ''], ['ball*2 duck', '']], queue: ['rocket duck*2', 'car*2 teddy'], time: 150 },
    // 2 — the cutting room: Ctrl+X moves a toy, Tab and the arrows move the selection
    { teach: ['cut'], belts: ['robot'], boxes: [['car*2', 'car ball'], ['ball*2', 'ball car']], par: 60 },
    { teach: ['tab'], belts: ['rocket duck rocket car rocket ball'], boxes: [['duck car', 'rocket']], queue: ['ball*2'], par: 70 },
    { belts: ['teddy ball'], boxes: [['teddy*2', 'teddy duck'], ['duck*2', 'ball teddy']], par: 80 },
    { belts: ['car rocket', 'duck'], boxes: [['rocket car', ''], ['duck*2', 'duck rocket']], queue: ['car*2 rocket'], par: 90 },
    { belts: ['ball robot teddy'], boxes: [['robot*2', 'ball robot'], ['ball teddy', 'robot'], ['teddy*2', '']], par: 100 },
    { belts: ['duck car ball', 'robot teddy'], boxes: [['car*2', 'car duck'], ['duck ball', 'ball'], ['robot*2', 'teddy']], queue: ['teddy*2 ball', 'duck*3'], time: 150 },
    // 3 — the recycling corner: Delete recycles a broken toy, Ctrl+Z undoes a change
    { teach: ['del'], belts: ['!teddy duck !car'], boxes: [['duck*3', 'duck !duck duck !duck']], par: 60 },
    { teach: ['undo'], belts: ['ball'], boxes: [['ball*2 car', 'ball ball car'], ['teddy*2', 'teddy teddy']], mess: [{ b0: 'ball !car robot', b1: 'teddy' }], par: 40 },
    { belts: ['!duck rocket duck ball'], boxes: [['rocket*2', '!rocket rocket !ball'], ['ball duck', 'ball']], queue: ['rocket ball'], par: 90 },
    { belts: ['car teddy !car'], boxes: [['car teddy', 'car car !teddy'], ['teddy*2', 'car']], mess: [{ b1: 'car !car' }], par: 90 },
    { belts: ['robot duck'], boxes: [['robot*2 duck', 'robot robot duck'], ['duck*2', 'duck duck']], mess: [{ b0: 'robot duck', b1: 'duck duck robot' }, { b0: 'robot !duck', b1: '!robot duck duck robot' }], par: 50 },
    { belts: ['!ball teddy ball', '!car rocket car'], boxes: [['ball*2', '!ball ball'], ['car rocket', 'car !rocket'], ['teddy*2 ball', 'teddy']], queue: ['rocket*2 car', 'ball teddy'], time: 150 },
    // 4 — the gremlin: Ctrl+Z undoes his mess, Ctrl+Y redoes what was undone
    { teach: ['gremlin'], belts: ['duck teddy'], boxes: [['duck*2', ''], ['teddy duck', '']], queue: ['teddy*3'], gremlin: 8, par: 100 },
    { teach: ['redo'], belts: ['ball car'], boxes: [['robot*3', '']], redo: [{ b0: 'robot' }, { b0: 'robot robot' }, { b0: 'robot robot robot' }], queue: ['ball car'], par: 50 },
    { belts: ['rocket ball', 'car'], boxes: [['rocket ball', ''], ['car*2', '']], queue: ['ball*2 rocket', 'car rocket'], gremlin: 9, par: 110 },
    { belts: ['teddy'], boxes: [['duck*2 teddy', 'teddy']], redo: [{ b0: 'teddy duck' }, { b0: 'teddy duck duck' }, { b0: '!teddy duck', g: true }], queue: ['teddy*2'], par: 50 },
    { belts: ['!robot robot duck', 'ball'], boxes: [['robot ball', '!robot'], ['duck*2', 'duck ball'], ['ball*2', '']], queue: ['robot*2 duck'], gremlin: 7, par: 120 },
    { belts: ['car teddy rocket', 'duck ball'], boxes: [['car teddy', ''], ['rocket*2', 'rocket !rocket'], ['duck ball', '']], queue: ['teddy*2 car', 'ball*2 duck', 'rocket car'], gremlin: 7, time: 180 },
    // 5 — the big factory: Shift+click and Ctrl+A pick many toys at once; everything mixed
    { teach: ['multi'], belts: ['car ball duck'], boxes: [['car ball', ''], ['car ball', ''], ['car ball', '']], par: 70 },
    { teach: ['all'], belts: ['rocket teddy duck'], boxes: [['rocket teddy duck', ''], ['rocket teddy duck', ''], ['rocket teddy duck', '']], par: 70 },
    { belts: ['car ball', '!duck !duck !teddy !car'], boxes: [['car*2 ball', '!car !car !ball'], ['ball car', '']], queue: ['car*2 ball'], par: 90 },
    { belts: ['duck teddy', 'robot rocket'], boxes: [['duck teddy', ''], ['duck teddy', ''], ['robot rocket', '']], queue: ['robot rocket', 'duck teddy robot'], time: 150 },
    { belts: ['ball car rocket'], boxes: [['ball car rocket', ''], ['ball car rocket', '!ball'], ['rocket*2', 'car']], queue: ['ball car rocket'], gremlin: 8, par: 130 },
    { belts: ['duck car teddy', 'ball robot rocket'], boxes: [['duck car', ''], ['teddy ball', '!teddy'], ['robot rocket', 'rocket rocket']], queue: ['duck car', 'teddy ball robot', 'rocket*2 duck', 'car ball'], gremlin: 9, time: 210 }
  ];

  // "duck*2 car" -> { duck: 2, car: 1 }
  function bag(s) {
    const o = {};
    String(s || '').split(/\s+/).forEach(word => {
      const m = /^(\w+)(?:\*(\d))?$/.exec(word);
      if (m) o[m[1]] = (o[m[1]] || 0) + (m[2] ? +m[2] : 1);
    });
    return o;
  }
  // "duck !duck" -> [{ k: 'duck', b: false }, { k: 'duck', b: true }]
  function list(s) {
    const out = [];
    String(s || '').split(/\s+/).forEach(word => {
      const m = /^(!?)(\w+)(?:\*(\d))?$/.exec(word);
      if (m) for (let i = 0; i < (m[3] ? +m[3] : 1); i++) out.push({ k: m[2], b: !!m[1] });
    });
    return out;
  }
  SF.bag = bag; SF.list = list;

  const taught = {};
  SF.LEVELS = RAW.map((r, i) => {
    const world = Math.floor(i / SF.PER_WORLD);
    (r.teach || []).forEach(a => { taught[a] = true; });
    // Shipping and clicking are there from the first level.
    const tools = Object.assign({ select: true, ship: true }, taught);
    if (tools.gremlin) tools.undo = true;
    return {
      i: i, id: (world + 1) + '-' + (i % SF.PER_WORLD + 1), world: world, n: i % SF.PER_WORLD,
      teach: r.teach || [], tools: tools, belts: r.belts || [], boxes: r.boxes, queue: r.queue || [],
      time: r.time || 0, par: r.par || Math.round((r.time || 120) * 0.6), gremlin: r.gremlin || 0,
      mess: r.mess || null, redo: r.redo || null,
      // From the level that teaches Ctrl+S on, every day's work ends with its stamp.
      stamp: i >= 2
    };
  });
  SF.COUNT = SF.LEVELS.length;
  SF.levelOf = function (world, n) { return world * SF.PER_WORLD + n; };

  /* ---------------------------------------------------------- the floor */
  // Belts carry their toys right to left and loop: a toy goes into the tunnel on the
  // left and comes out of the toy maker on the right. Each belt has cap slots.
  const BELT = SF.BELT = { x0: 150, x1: 1130, xr: 1170, sp: 130, cap: 8, L: 1040, vis0: 190, vis1: 1100 };
  SF.BELT_Y = [[188], [132, 238]];
  const BOX = SF.BOX = { w: 270, h: 200, y: 296, cap: 6 };
  SF.BOX_X = [[630], [790, 470], [945, 630, 315]];
  // The seven slots in sight when a level starts, from the right (the eighth one is in
  // the tunnel): a list's toys are spread out evenly over them.
  const RIGHT_TO_LEFT = [7, 0, 1, 2, 3, 4, 5];
  function mod(a, b) { return ((a % b) + b) % b; }
  SF.beltX = function (w, slot) { return BELT.xr - mod(slot * BELT.sp + w.offset, BELT.L); };
  SF.visible = function (x) { return x >= BELT.vis0 && x <= BELT.vis1; };
  // A box's toys stand in two rows of three, read right to left.
  SF.boxSpot = function (con, idx) {
    const col = idx % 3, row = Math.floor(idx / 3);
    return { x: con.x + (1 - col) * 80, y: BOX.y + (row ? 104 : 58) };
  };
  function live(c) { return !!c && (c.type === 'belt' || (!c.gone && c.ship <= 0)); }
  SF.live = live;
  SF.boxes = function (w) { return w.cons.filter(c => c.type === 'box' && live(c)); };

  // Where a toy is: its container, index and centre.
  SF.find = function (w, id) {
    for (const c of w.cons) {
      const i = c.items.indexOf(id);
      if (i >= 0) {
        const p = c.type === 'belt' ? { x: SF.beltX(w, i), y: c.y } : SF.boxSpot(c, i);
        return { con: c.i, idx: i, x: p.x, y: p.y };
      }
    }
    return null;
  };
  // Toys of a container in reading order: right to left (a belt's hidden toys last).
  function ordered(w, c) {
    if (c.type === 'box') return c.items.slice();
    const ids = [];
    c.items.forEach((id, s) => { if (id) ids.push({ id: id, x: SF.beltX(w, s) }); });
    ids.sort((a, b) => (SF.visible(b.x) - SF.visible(a.x)) || b.x - a.x);
    return ids.map(o => o.id);
  }
  SF.ordered = ordered;
  function reading(w, visibleOnly) {
    const out = [];
    w.cons.forEach(c => {
      if (!live(c)) return;
      ordered(w, c).forEach(id => { if (!visibleOnly || c.type === 'box' || SF.visible(SF.find(w, id).x)) out.push(id); });
    });
    return out;
  }

  // What is under a point: { con, toy } (toy 0 for the container itself) or null.
  SF.hit = function (w, x, y) {
    for (const c of w.cons) {
      if (c.type !== 'box' || !live(c)) continue;
      if (x < c.x - BOX.w / 2 || x > c.x + BOX.w / 2 || y < BOX.y - 30 || y > BOX.y + BOX.h) continue;
      for (let i = c.items.length - 1; i >= 0; i--) {
        const p = SF.boxSpot(c, i);
        if (Math.abs(x - p.x) < 40 && Math.abs(y - p.y) < 40) return { con: c.i, toy: c.items[i] };
      }
      return { con: c.i, toy: 0 };
    }
    for (const c of w.cons) {
      if (c.type !== 'belt' || y < c.y - 52 || y > c.y + 50 || x < BELT.x0 || x > BELT.x1) continue;
      let best = 0, bd = 47;
      c.items.forEach((id, s) => {
        if (!id) return;
        const tx = SF.beltX(w, s), d = Math.abs(x - tx);
        if (SF.visible(tx) && d < bd) { bd = d; best = id; }
      });
      return { con: c.i, toy: best };
    }
    return null;
  };

  /* ----------------------------------------------------------- random */
  // Seeded random numbers (mulberry32), so a level replays exactly in tests.
  SF.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  /* ------------------------------------------------------------ worlds */
  function make(w, t) { const id = w.nextId++; w.toys[id] = { id: id, k: t.k, b: !!t.b }; return id; }
  function fillBelt(w, c, items) {
    c.items = new Array(BELT.cap).fill(null);
    const m = Math.min(items.length, RIGHT_TO_LEFT.length);
    for (let j = 0; j < m; j++) c.items[RIGHT_TO_LEFT[Math.round((j + 0.5) * RIGHT_TO_LEFT.length / m - 0.5)]] = make(w, items[j]);
  }
  // A box's new contents; toys that stay keep their ids (the same toy is still there).
  function setItems(w, c, s) {
    const items = list(s);
    if (c.type === 'belt') { fillBelt(w, c, items); return; }
    const old = c.items.slice();
    c.items = items.slice(0, BOX.cap).map(t => {
      const i = old.findIndex(id => id && w.toys[id] && w.toys[id].k === t.k && w.toys[id].b === t.b);
      if (i < 0) return make(w, t);
      const id = old[i];
      old[i] = 0;
      return id;
    });
    old.forEach(id => { if (id) delete w.toys[id]; });
  }
  function conRef(w, key) {
    const m = /^([bL])(\d)$/.exec(key);
    if (!m) return null;
    const type = m[1] === 'b' ? 'box' : 'belt', n = +m[2];
    return w.cons.filter(c => c.type === type)[n] || null;
  }

  // o: { speed (px/s), timeScale, parScale, gremlinEvery (s), seed }
  SF.create = function (li, o) {
    o = o || {};
    const def = SF.LEVELS[li] || SF.LEVELS[0];
    const w = {
      li: def.i, def: def, t: 0, phase: 'play', ev: [],
      speed: Math.max(0, num(o.speed, 24)), offset: 270,
      limit: def.time ? Math.round(def.time * Math.max(0.5, num(o.timeScale, 1))) : 0,
      par: Math.round(def.par * Math.max(0.5, num(o.parScale, 1))),
      toys: {}, nextId: 1, cons: [], queue: def.queue.map(bag), done: 0,
      sel: [], cur: -1, curToy: 0, place: -1, clip: null, undo: [], redo: [],
      mistakes: 0, bonus: 0, combo: 0, lastShip: -99, bonks: 0, actions: 0,
      rng: SF.rng(o.seed || 1)
    };
    w.left = w.limit;
    const ys = SF.BELT_Y[Math.max(0, Math.min(1, def.belts.length - 1))];
    def.belts.forEach((s, i) => {
      const c = { i: w.cons.length, type: 'belt', cap: BELT.cap, items: [], y: ys[i], x: (BELT.x0 + BELT.x1) / 2 };
      w.cons.push(c);
      fillBelt(w, c, list(s));
    });
    const xs = SF.BOX_X[def.boxes.length - 1];
    def.boxes.forEach((b, i) => {
      const c = { i: w.cons.length, type: 'box', cap: BOX.cap, items: [], order: bag(b[0]), x: xs[i], y: BOX.y, ship: 0, arrive: 0, gone: false, oid: i + 1, n: i };
      w.cons.push(c);
      setItems(w, c, b[1]);
    });
    w.total = def.boxes.length + w.queue.length;
    w.nextOrder = def.boxes.length + 1;
    const first = w.cons.find(c => c.type === 'box');
    w.place = w.cur = first.i;
    // «بُرغي» the gremlin: away, coming to a box, messing it up, leaving (or fleeing).
    w.g = { on: def.gremlin > 0, every: Math.max(4, num(o.gremlinEvery, 20)), next: def.gremlin, phase: 'away', t: 0, x: 1380, x0: 1380, tx: 0, box: -1, entry: null };
    // Changes made just before the level: the gremlin's mess is on the undo history...
    if (def.mess) {
      def.mess.forEach(m => {
        const before = snap(w);
        for (const k in m) { const c = conRef(w, k); if (c) setItems(w, c, m[k]); }
        commit(w, 'gremlin', before);
      });
      const g = w.g, c = conRef(w, Object.keys(def.mess[def.mess.length - 1])[0]);
      g.phase = 'mess'; g.t = -0.4; g.box = c.i; g.x = c.x + 70; g.entry = w.undo[w.undo.length - 1];
    }
    // ...and changes that were undone wait on the redo history.
    if (def.redo) {
      const start = snap(w), entries = [];
      def.redo.forEach(m => {
        const before = snap(w);
        for (const k in m) if (k !== 'g') { const c = conRef(w, k); if (c) setItems(w, c, m[k]); }
        entries.push({ label: m.g ? 'gremlin' : 'player', before: before, after: snap(w) });
      });
      restore(w, start);
      w.redo = entries.reverse();
    }
    return w;
  };

  /* ------------------------------------------------------------ history */
  function snap(w) { return { items: w.cons.map(c => c.items.slice()), toys: Object.assign({}, w.toys) }; }
  function restore(w, s) {
    w.cons.forEach((c, i) => { c.items = s.items[i].slice(); });
    w.toys = Object.assign({}, s.toys);
    tidy(w);
  }
  function commit(w, label, before) {
    const entry = { label: label, before: before, after: snap(w) };
    w.undo.push(entry);
    if (w.undo.length > 60) w.undo.shift();
    w.redo.length = 0;
    return entry;
  }
  // Drops toys that no longer exist from the selection and the cursor.
  function tidy(w) {
    w.sel = w.sel.filter(id => w.toys[id] && SF.find(w, id) && live(w.cons[SF.find(w, id).con]));
    if (w.curToy && !(w.toys[w.curToy] && SF.find(w, w.curToy))) w.curToy = 0;
    if (!live(w.cons[w.place])) {
      const b = SF.boxes(w)[0];
      if (b) w.place = b.i;
    }
    if (!live(w.cons[w.cur])) w.cur = live(w.cons[w.place]) ? w.place : 0;
  }

  /* ------------------------------------------------------------- orders */
  // What a box still needs: { ok, missing: { kind: n }, extra: [toy ids] } (a broken toy,
  // or one more than the order asks for, is extra).
  SF.need = function (w, c) {
    const missing = Object.assign({}, c.order), extra = [];
    c.items.forEach(id => {
      const t = w.toys[id];
      if (!t || t.b || !missing[t.k]) extra.push(id); else missing[t.k]--;
    });
    for (const k in missing) if (!missing[k]) delete missing[k];
    return { ok: !extra.length && !Object.keys(missing).length, missing: missing, extra: extra };
  };
  SF.ready = function (w, c) { return !!c && c.type === 'box' && live(c) && SF.need(w, c).ok; };

  /* ------------------------------------------------------------ actions */
  function ev(w, e) { w.ev.push(e); if (w.ev.length > 40) w.ev.shift(); }
  function sorted(w, ids) {
    const order = reading(w, false);
    return ids.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  function removeToys(w, ids) {
    const gone = [];
    ids.forEach(id => {
      const f = SF.find(w, id);
      if (!f) return;
      const c = w.cons[f.con];
      gone.push({ id: id, k: w.toys[id].k, b: w.toys[id].b, x: f.x, y: f.y, con: f.con });
      if (c.type === 'belt') c.items[f.idx] = null; else c.items.splice(f.idx, 1);
      delete w.toys[id];
    });
    return gone;
  }
  function room(c) { return c.type === 'belt' ? c.items.filter(x => !x).length : c.cap - c.items.length; }
  function addToy(w, c, t) {
    const id = make(w, t);
    if (c.type === 'box') c.items.push(id);
    else {
      // The free slot nearest the toy maker on the right that is in sight.
      let best = -1, bx = -1;
      c.items.forEach((x, s) => { if (!x) { const px = SF.beltX(w, s), score = (SF.visible(px) ? 2000 : 0) + px; if (score > bx) { bx = score; best = s; } } });
      c.items[best] = id;
    }
    return id;
  }
  function select(w, con, toy, add) {
    const c = w.cons[con];
    if (!c || !live(c)) return;
    if (toy) {
      if (add) {
        const i = w.sel.indexOf(toy);
        if (i >= 0) w.sel.splice(i, 1); else w.sel.push(toy);
      } else w.sel = [toy];
      w.cur = con; w.curToy = toy;
      if (c.type === 'box') w.place = con;
    } else {
      // Only a box is a place to paste in: a click that misses a moving toy on a belt
      // must not send the next Ctrl+V onto the belt.
      if (!add) w.sel = [];
      w.cur = con; w.curToy = 0;
      if (c.type === 'box') w.place = con;
    }
  }
  function shipBox(w, c) {
    c.ship = 0.9;
    w.done++;
    w.combo = w.t - w.lastShip < 12 ? w.combo + 1 : 1;
    w.lastShip = w.t;
    if (w.combo > 1) w.bonus += w.combo;
    w.undo.length = 0; w.redo.length = 0; w.g.entry = null;
    w.sel = w.sel.filter(id => c.items.indexOf(id) < 0);
    if (w.curToy && c.items.indexOf(w.curToy) >= 0) w.curToy = 0;
    ev(w, { t: 'ship', con: c.i, combo: w.combo, left: w.total - w.done });
  }

  // One action. a.t: 'pick' (con, toy: 0 for the container itself, add: Shift/Ctrl
  // held), 'click' (x, y, add), 'copy', 'paste', 'cut', 'del', 'undo', 'redo', 'all',
  // 'ship' (con: a box's own Enter button, or none for the Enter key), 'save', 'tab',
  // 'move' (dir: 'left' | 'right' | 'up' | 'down', add). Returns what happened: 'ok' or why not.
  SF.act = function (w, a) {
    if (!a || (w.phase !== 'play' && w.phase !== 'stamp')) return 'over';
    const t = a.t;
    w.actions++;
    if (t === 'click') {
      const h = SF.hit(w, a.x, a.y);
      if (!h) { if (!a.add && w.sel.length) { w.sel = []; ev(w, { t: 'select', ids: [] }); } return 'none'; }
      return SF.act(w, { t: 'pick', con: h.con, toy: h.toy, add: a.add });
    }
    if (t === 'pick') {
      select(w, a.con, a.toy || 0, !!a.add);
      ev(w, { t: 'select', ids: w.sel.slice(), con: a.con, toy: a.toy || 0 });
      return 'ok';
    }
    if (t === 'copy' || t === 'cut' || t === 'del') {
      tidy(w);
      if (!w.sel.length) { ev(w, { t: 'nothing', a: t }); return 'nothing'; }
      const ids = sorted(w, w.sel);
      if (t === 'copy') {
        w.clip = { cut: false, items: ids.map(id => ({ k: w.toys[id].k, b: w.toys[id].b })) };
        ev(w, { t: 'copy', ids: ids, n: ids.length });
        return 'ok';
      }
      const before = snap(w), gone = removeToys(w, ids);
      if (t === 'cut') w.clip = { cut: true, items: gone.map(g => ({ k: g.k, b: g.b })) };
      w.sel = []; w.curToy = 0;
      commit(w, t, before);
      ev(w, { t: t, toys: gone, n: gone.length });
      return 'ok';
    }
    if (t === 'paste') {
      tidy(w);
      if (!w.clip || !w.clip.items.length) { ev(w, { t: 'nothing', a: t }); return 'empty'; }
      const c = w.cons[w.place];
      if (!c || !live(c)) { ev(w, { t: 'nothing', a: 'place' }); return 'nothing'; }
      if (room(c) < w.clip.items.length) { ev(w, { t: 'full', con: c.i }); return 'full'; }
      const before = snap(w), ids = w.clip.items.map(it => addToy(w, c, it));
      w.sel = ids.slice(); w.cur = c.i; w.curToy = ids[ids.length - 1];
      commit(w, 'paste', before);
      ev(w, { t: 'paste', ids: ids, con: c.i, n: ids.length });
      return 'ok';
    }
    if (t === 'undo' || t === 'redo') {
      const from = t === 'undo' ? w.undo : w.redo, to = t === 'undo' ? w.redo : w.undo;
      if (!from.length) { ev(w, { t: 'nothing', a: t }); return 'nothing'; }
      const entry = from.pop(), had = Object.keys(w.toys);
      restore(w, t === 'undo' ? entry.before : entry.after);
      to.push(entry);
      const back = Object.keys(w.toys).filter(id => had.indexOf(id) < 0).map(Number);
      w.sel = back.filter(id => SF.find(w, id));
      if (w.sel.length) { const f = SF.find(w, w.sel[0]); w.cur = f.con; w.curToy = w.sel[0]; }
      const g = w.g;
      let bonk = false;
      if (t === 'undo' && entry === g.entry) {
        g.entry = null;
        if (g.phase === 'mess' || g.phase === 'leave' || g.phase === 'come') { g.phase = 'flee'; g.t = 0; bonk = true; w.bonks++; w.bonus += 2; }
      }
      ev(w, { t: t, label: entry.label, ids: w.sel.slice(), bonk: bonk });
      return 'ok';
    }
    if (t === 'all') {
      const c = live(w.cons[w.cur]) ? w.cons[w.cur] : w.cons[w.place];
      const ids = c ? ordered(w, c) : [];
      if (!ids.length) { ev(w, { t: 'nothing', a: t }); return 'nothing'; }
      w.sel = ids; w.curToy = ids[0]; w.cur = c.i;
      if (c.type === 'box') w.place = c.i;
      ev(w, { t: 'all', ids: ids.slice(), con: c.i });
      return 'ok';
    }
    if (t === 'ship') {
      if (w.phase !== 'play') return 'nothing';
      const boxes = SF.boxes(w);
      let c = a.con != null ? w.cons[a.con] : null;
      if (c && (c.type !== 'box' || !live(c))) c = null;
      if (!c && SF.ready(w, w.cons[w.place])) c = w.cons[w.place];
      if (!c) c = boxes.find(b => SF.ready(w, b)) || null;
      if (!c) c = live(w.cons[w.place]) && w.cons[w.place].type === 'box' ? w.cons[w.place] : boxes[0];
      if (!c) return 'nothing';
      if (!SF.ready(w, c)) {
        // An empty box only shakes; sending one with the wrong toys is a mistake.
        if (c.items.length) w.mistakes++;
        ev(w, { t: 'wrong', con: c.i, need: SF.need(w, c), empty: !c.items.length });
        return 'wrong';
      }
      shipBox(w, c);
      return 'ok';
    }
    if (t === 'save') {
      if (w.phase === 'stamp') { w.phase = 'done'; ev(w, { t: 'stamp' }); return 'ok'; }
      ev(w, { t: 'saved' });
      return 'early';
    }
    if (t === 'tab') {
      const order = reading(w, true);
      if (!order.length) { ev(w, { t: 'nothing', a: t }); return 'nothing'; }
      const i = order.indexOf(w.curToy), id = order[(i + 1) % order.length];
      select(w, SF.find(w, id).con, id, false);
      ev(w, { t: 'select', ids: w.sel.slice(), key: true });
      return 'ok';
    }
    if (t === 'move') {
      const target = moveTarget(w, a.dir);
      if (!target) { ev(w, { t: 'nothing', a: t }); return 'nothing'; }
      if (a.add && target.toy) {
        // Shift+arrow grows the selection.
        if (w.sel.indexOf(target.toy) < 0) w.sel.push(target.toy);
        w.cur = target.con; w.curToy = target.toy;
        if (w.cons[target.con].type === 'box') w.place = target.con;
      } else select(w, target.con, target.toy, false);
      ev(w, { t: 'select', ids: w.sel.slice(), key: true });
      return 'ok';
    }
    w.actions--;
    return 'unknown';
  };

  // The arrow keys: the nearest toy (or empty box) in that direction.
  function rowOf(w, c) { return c.type === 'belt' ? w.cons.indexOf(c) : w.def.belts.length; }
  function moveTarget(w, dir) {
    const cur = live(w.cons[w.cur]) ? w.cons[w.cur] : w.cons[w.place];
    if (!cur) return null;
    const f = w.curToy ? SF.find(w, w.curToy) : null;
    const fx = f ? f.x : cur.x, fy = f ? f.y : (cur.type === 'box' ? BOX.y + 80 : cur.y);
    const row = rowOf(w, cur), rows = w.def.belts.length + 1;
    const spots = [];
    w.cons.forEach(c => {
      if (!live(c)) return;
      const ids = ordered(w, c);
      ids.forEach(id => { const p = SF.find(w, id); if (c.type === 'box' || SF.visible(p.x)) spots.push({ con: c.i, toy: id, x: p.x, y: p.y, row: rowOf(w, c) }); });
      if (c.type === 'box' && !ids.length) spots.push({ con: c.i, toy: 0, x: c.x, y: BOX.y + 80, row: rowOf(w, c) });
    });
    let best = null, bd = Infinity;
    for (const s of spots) {
      if (s.con === cur.i && s.toy === w.curToy) continue;
      let d;
      if (dir === 'left' || dir === 'right') {
        if (s.row !== row) continue;
        const dx = dir === 'left' ? fx - s.x : s.x - fx;
        if (dx < 6) continue;
        d = dx + Math.abs(s.y - fy) * 0.6;
      } else {
        const want = dir === 'up' ? row - 1 : row + 1;
        if (want < 0 || want >= rows) return null;
        if (s.row !== want) continue;
        d = Math.abs(s.x - fx);
      }
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /* -------------------------------------------------------------- time */
  SF.step = function (w, dt) {
    if (w.phase === 'done' || w.phase === 'fail') return w;
    w.t += dt;
    w.offset += w.speed * dt;
    // Boxes leave on the truck, and the next order's box slides in.
    w.cons.forEach(c => {
      if (c.type !== 'box') return;
      if (c.arrive > 0) c.arrive = Math.max(0, c.arrive - dt);
      if (c.ship > 0) {
        c.ship -= dt;
        if (c.ship <= 0) {
          c.ship = 0;
          c.items.forEach(id => { delete w.toys[id]; });
          c.items = [];
          if (w.queue.length) { c.order = w.queue.shift(); c.oid = w.nextOrder++; c.arrive = 0.7; ev(w, { t: 'arrive', con: c.i }); }
          else c.gone = true;
          tidy(w);
        }
      }
    });
    if (w.phase === 'play') {
      if (w.done >= w.total && !w.cons.some(c => c.type === 'box' && c.ship > 0)) {
        w.phase = w.def.stamp ? 'stamp' : 'done';
        ev(w, { t: 'allShipped' });
      } else if (w.limit) {
        w.left = Math.max(0, w.left - dt);
        if (w.left <= 0) { w.phase = 'fail'; ev(w, { t: 'timeup' }); }
      }
    }
    gremlin(w, dt);
    return w;
  };

  /* ----------------------------------------------------------- gremlin */
  const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  function gremlin(w, dt) {
    const g = w.g;
    if (g.phase === 'away') {
      if (!g.on || w.phase !== 'play') return;
      g.next -= dt;
      if (g.next > 0) return;
      const target = messTarget(w);
      if (!target) { g.next = 3; return; }
      g.phase = 'come'; g.t = 0; g.box = target.i; g.x0 = 1380; g.tx = target.x + 70;
      ev(w, { t: 'gremlin', con: target.i });
      return;
    }
    g.t += dt;
    if (g.phase === 'come') {
      const k = Math.min(1, g.t / 1.6);
      g.x = g.x0 + (g.tx - g.x0) * ease(k);
      if (w.phase !== 'play' || !live(w.cons[g.box])) { leave(g); return; }
      if (k >= 1) { mess(w); g.phase = 'mess'; g.t = 0; }
    } else if (g.phase === 'mess') {
      if (g.t >= 1.1) leave(g);
    } else if (g.phase === 'leave') {
      const k = Math.min(1, g.t / 1.4);
      g.x = g.x0 + (1380 - g.x0) * ease(k);
      if (k >= 1) away(w);
    } else if (g.phase === 'flee') {
      g.x += dt * 1100;
      if (g.x > 1400) away(w);
    }
  }
  function leave(g) { g.phase = 'leave'; g.t = 0; g.x0 = g.x; }
  function away(w) { const g = w.g; g.phase = 'away'; g.t = 0; g.x = 1380; g.next = g.every * (0.8 + 0.4 * w.rng()); }
  // He goes for the box with the most toys in it (the one nearest to done).
  function messTarget(w) {
    const boxes = SF.boxes(w).filter(c => c.arrive <= 0);
    if (!boxes.length) return null;
    boxes.sort((a, b) => b.items.length - a.items.length || a.i - b.i);
    return boxes[0];
  }
  function pick(w, arr) { return arr[Math.floor(w.rng() * arr.length) % arr.length]; }
  function mess(w) {
    const g = w.g, c = w.cons[g.box];
    if (!live(c)) return;
    const others = SF.boxes(w).filter(b => b !== c && b.items.length);
    const belts = w.cons.filter(b => b.type === 'belt' && room(b) > 0);
    const kinds = [];
    if (c.items.length < c.cap) kinds.push('junk');
    if (c.items.length) {
      if (others.some(o => o.items.some(id => c.items.some(m => w.toys[m].k !== w.toys[id].k)))) kinds.push('swap', 'swap');
      if (belts.length) kinds.push('steal');
      kinds.push('switch');
    }
    if (!kinds.length) return;
    const kind = pick(w, kinds), before = snap(w);
    if (kind === 'junk') addToy(w, c, { k: pick(w, SF.KINDS), b: true });
    else if (kind === 'steal') {
      const id = pick(w, c.items), toy = w.toys[id];
      removeToys(w, [id]);
      addToy(w, pick(w, belts), { k: toy.k, b: toy.b });
    } else if (kind === 'switch') {
      const i = Math.floor(w.rng() * c.items.length) % c.items.length, old = w.toys[c.items[i]];
      const k = pick(w, SF.KINDS.filter(k => k !== old.k));
      delete w.toys[c.items[i]];
      c.items[i] = make(w, { k: k, b: old.b });
    } else {
      const o = pick(w, others.filter(o => o.items.some(id => c.items.some(m => w.toys[m].k !== w.toys[id].k))));
      const pairs = [];
      c.items.forEach((a, i) => o.items.forEach((b, j) => { if (w.toys[a].k !== w.toys[b].k) pairs.push([i, j]); }));
      const p = pick(w, pairs), a = c.items[p[0]];
      c.items[p[0]] = o.items[p[1]]; o.items[p[1]] = a;
    }
    tidy(w);
    g.entry = commit(w, 'gremlin', before);
    ev(w, { t: 'mess', kind: kind, con: c.i });
  }

  /* ------------------------------------------------------------- hints */
  function onlySel(w, id) { return w.sel.length === 1 && w.sel[0] === id; }
  function fits(items, missing) {
    const m = Object.assign({}, missing);
    for (const t of items) { if (t.b || !m[t.k]) return false; m[t.k]--; }
    return true;
  }
  // The next useful step, with only the tools this level has taught so far:
  // { act, con, toy }, act one of SF.ACTS ('select' and 'place' are clicks).
  SF.hint = function (w) {
    if (w.phase === 'stamp') return { act: 'save' };
    if (w.phase !== 'play') return null;
    const T = w.def.tools, top = w.undo[w.undo.length - 1], rtop = w.redo[w.redo.length - 1];
    if (T.undo && top && top.label === 'gremlin') return { act: T.gremlin ? 'gremlin' : 'undo' };
    if (T.redo && w.def.redo && rtop && rtop.label !== 'gremlin') return { act: 'redo' };
    const boxes = SF.boxes(w);
    if (!boxes.length) return null;
    const ready = boxes.find(b => SF.ready(w, b));
    if (ready) return { act: 'ship', con: ready.i };
    // The copy machine holds what a box needs: paste it there.
    if (w.clip && w.clip.items.length) {
      const ok = boxes.filter(b => b.cap - b.items.length >= w.clip.items.length && fits(w.clip.items, SF.need(w, b).missing));
      if (ok.length) {
        const b = ok.find(b => b.i === w.place) || ok[0];
        return b.i === w.place ? { act: 'paste', con: b.i } : { act: 'place', con: b.i };
      }
    }
    const B = boxes.find(b => b.i === w.place) || boxes[0], n = SF.need(w, B);
    // A broken toy or one too many goes first.
    if (n.extra.length) {
      const id = n.extra[n.extra.length - 1];
      if (onlySel(w, id)) return { act: T.del ? 'del' : 'cut', toy: id, con: B.i };
      return { act: 'select', con: B.i, toy: id };
    }
    const kind = SF.KINDS.find(k => n.missing[k] > 0);
    if (!kind) return null;
    // Where to take it from: one too many in another box (cut it out), a belt, any box.
    let src = 0, how = 'copy';
    for (const b of boxes) {
      if (b === B) continue;
      const id = SF.need(w, b).extra.find(id => w.toys[id].k === kind && !w.toys[id].b);
      if (id) { src = id; if (T.cut) how = 'cut'; break; }
    }
    if (!src) {
      let bd = Infinity;
      w.cons.forEach(c => {
        if (c.type !== 'belt') return;
        c.items.forEach((id, s) => {
          if (!id || w.toys[id].k !== kind || w.toys[id].b) return;
          const x = SF.beltX(w, s), d = SF.visible(x) ? Math.abs(x - 640) : 5000;
          if (d < bd) { bd = d; src = id; }
        });
      });
    }
    if (!src) for (const b of boxes) { const id = b.items.find(id => w.toys[id].k === kind && !w.toys[id].b); if (id) { src = id; break; } }
    if (!src) return null;
    if (onlySel(w, src)) return { act: how, toy: src };
    return { act: 'select', con: SF.find(w, src).con, toy: src };
  };

  /* ------------------------------------------------------- stars, coins */
  SF.slow = function (w) { return w.limit ? w.left < w.limit * 0.3 : w.t > w.par; };
  // 3 stars: no box sent with the wrong toys, and quick. A wrong box or a slow day costs one.
  SF.stars = function (w) {
    if (w.phase !== 'done') return 0;
    return Math.max(1, 3 - (w.mistakes > 0 ? 1 : 0) - (SF.slow(w) ? 1 : 0));
  };
  SF.coins = function (w) { return w.done * 2 + w.bonus + SF.stars(w) * 2; };
  // 0..1 for Kit.dda, once per level played: a finished day by its stars, a day the
  // clock ran out on a little for the boxes that went out.
  SF.outcome = function (w) {
    if (w.phase === 'done') return [0, 0.55, 0.8, 1][SF.stars(w)];
    return Math.round(0.3 * (w.done / Math.max(1, w.total)) * 1000) / 1000;
  };

  /* -------------------------------------------------------------- saves */
  SF.HATS = [
    { id: 'none', name: 'بلا قبعة', price: 0 }, { id: 'cap', name: 'قبعة', price: 15 }, { id: 'hard', name: 'خوذة', price: 30 },
    { id: 'chef', name: 'الطاهي', price: 45 }, { id: 'party', name: 'الحفلة', price: 60 }, { id: 'crown', name: 'تاج', price: 90 },
    { id: 'prop', name: 'المروحة', price: 120 }
  ];
  SF.COLORS = [
    { id: 'sun', name: 'شمسي', price: 0 }, { id: 'mint', name: 'نعناعي', price: 25 }, { id: 'sky', name: 'سماوي', price: 40 },
    { id: 'candy', name: 'حلوى', price: 55 }, { id: 'night', name: 'ليلي', price: 90 }
  ];
  // { v: 1, stars: [0..3 per level], best: [fastest seconds per level, 0 none], coins,
  //   hats: [owned ids], colors: [owned ids], hat, color }
  SF.freshSave = function () {
    return { v: 1, stars: new Array(SF.COUNT).fill(0), best: new Array(SF.COUNT).fill(0), coins: 0, hats: ['none'], colors: ['sun'], hat: 'none', color: 'sun' };
  };
  function int(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
  // Every field is checked: an old, a damaged or a hand-edited save always loads as a
  // playable one, and keeps whatever is still good in it.
  SF.loadSave = function (raw) {
    const s = SF.freshSave(), r = obj(raw);
    if (!r || r.v !== 1) return s;
    const stars = Array.isArray(r.stars) ? r.stars : [], best = Array.isArray(r.best) ? r.best : [];
    for (let i = 0; i < SF.COUNT; i++) {
      s.stars[i] = int(stars[i], 0, 3) ? stars[i] : 0;
      s.best[i] = int(best[i], 1, 99999) && s.stars[i] ? best[i] : 0;
    }
    s.coins = int(r.coins, 0, 9999999) ? r.coins : 0;
    const owned = (key, all) => {
      const list = Array.isArray(r[key]) ? r[key] : [];
      return all.filter((x, i) => i === 0 || list.indexOf(x.id) >= 0).map(x => x.id);
    };
    s.hats = owned('hats', SF.HATS); s.colors = owned('colors', SF.COLORS);
    s.hat = s.hats.indexOf(r.hat) >= 0 ? r.hat : 'none';
    s.color = s.colors.indexOf(r.color) >= 0 ? r.color : 'sun';
    return s;
  };
  // A level opens when the one before it has a star.
  SF.isOpen = function (s, li) { return li === 0 || (li > 0 && li < SF.COUNT && s.stars[li - 1] > 0); };
  SF.totalStars = function (s) { return s.stars.reduce((a, b) => a + b, 0); };
  SF.worldStars = function (s, wi) { let n = 0; for (let i = 0; i < SF.PER_WORLD; i++) n += s.stars[wi * SF.PER_WORLD + i]; return n; };
  // The level to play next: the first open one without a star, else the first without three.
  SF.nextLevel = function (s) {
    for (let i = 0; i < SF.COUNT; i++) if (SF.isOpen(s, i) && !s.stars[i]) return i;
    for (let i = 0; i < SF.COUNT; i++) if (s.stars[i] < 3) return i;
    return SF.COUNT - 1;
  };
  // Records a finished (or failed) day. Returns what changed, for the result screen.
  SF.applyResult = function (s, w) {
    const li = w.li, stars = SF.stars(w), before = s.stars[li], coins = w.phase === 'done' ? SF.coins(w) : w.done;
    const wasOpen = li + 1 < SF.COUNT && SF.isOpen(s, li + 1);
    const out = { stars: stars, before: before, coins: coins, best: false, fast: false, unlocked: -1, time: Math.max(1, Math.round(w.t)) };
    s.coins = Math.min(9999999, s.coins + coins);
    if (stars > before) { s.stars[li] = stars; out.best = true; }
    if (stars && (!s.best[li] || out.time < s.best[li])) { out.fast = !!s.best[li]; s.best[li] = out.time; }
    if (li + 1 < SF.COUNT && !wasOpen && SF.isOpen(s, li + 1)) out.unlocked = li + 1;
    return out;
  };
  SF.shopItem = function (type, id) { return (type === 'hat' ? SF.HATS : SF.COLORS).find(x => x.id === id) || null; };
  // Buys (if needed) and puts on a hat or a factory colour. Returns 'wear', 'bought' or 'poor'.
  SF.buy = function (s, type, id) {
    const item = SF.shopItem(type, id), owned = type === 'hat' ? s.hats : s.colors;
    if (!item) return 'poor';
    if (owned.indexOf(id) < 0) {
      if (s.coins < item.price) return 'poor';
      s.coins -= item.price; owned.push(id);
      s[type] = id;
      return 'bought';
    }
    s[type] = id;
    return 'wear';
  };
})();
