/* Shortcut Factory (مصنع الاختصارات): the pure factory simulation.
 * Toys ride a conveyor belt from the toy machine (left) to the delivery box (right).
 * The child's real shortcuts copy, paste, cut, delete, undo, redo, select all and seal.
 * No DOM and no Kit here: game.js reads Kit.dda and passes the belt speed and tier in,
 * and the Node tests load this file on its own. */
(function (root) {
  'use strict';
  var SF = {};

  /* ------------------------------------------------------------ constants */
  SF.KINDS = ['car', 'duck', 'robot', 'teddy', 'rocket'];
  SF.COLORS = ['#ff4b5c', '#3d8bff', '#ffc928', '#35d07f', '#a66bff'];
  // Belt coordinates (world x): toys appear at `start`, the robot arm pastes at `arm`,
  // and a toy that passes `end` drops off into the delivery box.
  SF.BELT = { start: -8.4, end: 4.3, arm: -1.2, gap: 1.2 };
  SF.ACTIONS = ['copy', 'paste', 'cut', 'delete', 'undo', 'redo', 'selectAll', 'save'];
  SF.KEY = { copy: 'KeyC', paste: 'KeyV', cut: 'KeyX', undo: 'KeyZ', redo: 'KeyY', selectAll: 'KeyA', save: 'KeyS', delete: 'Delete' };
  SF.LETTER = { copy: 'C', paste: 'V', cut: 'X', undo: 'Z', redo: 'Y', selectAll: 'A', save: 'S', delete: 'Delete' };
  SF.AR = { copy: 'نسخ', paste: 'لصق', cut: 'قص', delete: 'حذف', undo: 'تراجع', redo: 'إعادة', selectAll: 'تحديد الكل', save: 'حفظ' };
  SF.CLIP_MAX = 4;
  SF.UNDO_MAX = 20;

  /* --------------------------------------------------------------- levels */
  // boxes: one entry per delivery box, each a list of order lines [kind, colour, count].
  // pre: toys already on the belt [x, kind, colour, broken]. first: seconds before the
  // toy machine starts. stream: chances that a new toy is one the box needs, a broken one
  // or one the NEXT box needs (the rest are other toys). teach: [shortcut, moment] lessons:
  // when the moment comes the belt waits for that shortcut. par: seconds for the clock star
  // (0 = no clock). seal: a full box waits for Ctrl+S. gremlin: Nattout's tricks.
  SF.HALLS = [
    { name: 'قاعة النسخ', color: '#ffb020' },
    { name: 'قاعة التراجع', color: '#3d8bff' },
    { name: 'قاعة الشحن', color: '#ff5fa2' }
  ];
  var B = SF.BELT, A = B.arm;
  SF.LEVELS = [
    // Hall 1: calm, no clock. The belt waits for each new shortcut.
    { id: '1-1', hall: 0, keys: ['copy', 'paste'], fresh: ['copy', 'paste'], speed: [0.55, 0.75], gap: [4.6, 3.6],
      boxes: [[[1, 2, 3]]], pre: [[A - 2.2, 1, 2]], first: 10, stream: { need: 0.15 },
      teach: [['copy', 'needArm'], ['paste', 'clipNeed']], allow: 2 },
    { id: '1-2', hall: 0, keys: ['copy', 'paste', 'delete'], fresh: ['delete'], speed: [0.55, 0.8], gap: [4.2, 3.4],
      boxes: [[[0, 0, 3]], [[3, 1, 2]]], pre: [[A - 1.6, 0, 0], [A - 4.4, 3, 1, true]], first: 9, stream: { need: 0.25, broken: 0.3 },
      teach: [['delete', 'brokenArm']], allow: 2 },
    { id: '1-3', hall: 0, keys: ['copy', 'paste', 'delete', 'cut'], fresh: ['cut'], speed: [0.55, 0.8], gap: [4.2, 3.4],
      boxes: [[[3, 4, 2]], [[4, 0, 2]]], pre: [[A + 1.6, 3, 4], [A - 0.4, 3, 4], [A - 2.6, 4, 0]], first: 12, stream: { need: 0.25, broken: 0.15, next: 0.15 },
      teach: [['cut', 'nextArm'], ['paste', 'clipNeed']], allow: 2 },
    { id: '1-4', hall: 0, keys: ['copy', 'paste', 'delete', 'cut'], fresh: [], speed: [0.6, 0.9], gap: [3.8, 3],
      boxes: [[[2, 1, 2]], [[0, 3, 3]], [[1, 4, 2]]], pre: [[A - 1.8, 2, 1]], first: 4, stream: { need: 0.3, broken: 0.2, next: 0.15 }, allow: 2 },
    // Hall 2: a clock star, Nattout the gremlin, select all.
    { id: '2-1', hall: 1, keys: ['copy', 'paste', 'delete', 'undo'], fresh: ['undo'], speed: [0.65, 0.95], gap: [3.8, 2.9],
      boxes: [[[3, 0, 3]], [[4, 2, 3]]], pre: [[A - 1.8, 3, 0]], first: 6, stream: { need: 0.3, broken: 0.15 },
      gremlin: { type: 'steal', first: 7, every: [13, 18], grace: 5 }, teach: [['undo', 'stolen']], par: 95, allow: 2 },
    { id: '2-2', hall: 1, keys: ['copy', 'paste', 'delete', 'selectAll'], fresh: ['selectAll'], speed: [0.65, 0.95], gap: [3.8, 2.9],
      boxes: [[[1, 1, 3]], [[2, 0, 3]]], pre: [[A - 1.8, 1, 1], [A - 4.4, 0, 3, true], [A - 5.6, 2, 4, true], [A - 6.8, 4, 1, true]], first: 9,
      stream: { need: 0.3, broken: 0.1, wave: [26, 24, 3] }, teach: [['selectAll', 'junk'], ['delete', 'junkSel']], par: 100, allow: 2 },
    { id: '2-3', hall: 1, keys: ['selectAll', 'copy', 'paste', 'delete'], fresh: [], speed: [0.65, 0.95], gap: [3.8, 2.9],
      boxes: [[[1, 2, 2], [0, 0, 2]], [[2, 1, 2], [3, 4, 2]]], pre: [[A - 1.6, 1, 2], [A - 2.9, 0, 0]], first: 9,
      stream: { need: 0.35, broken: 0.15 }, teach: [['selectAll', 'pair'], ['copy', 'multiSel'], ['paste', 'clipNeed']], par: 100, allow: 2 },
    { id: '2-4', hall: 1, keys: ['copy', 'paste', 'cut', 'delete', 'undo', 'selectAll'], fresh: [], speed: [0.7, 1.05], gap: [3.4, 2.6],
      boxes: [[[0, 2, 2], [1, 1, 1]], [[4, 4, 3]], [[2, 3, 2], [3, 0, 1]]], pre: [[A - 1.8, 0, 2]], first: 4,
      stream: { need: 0.32, broken: 0.15, next: 0.12, wave: [30, 28, 3] }, gremlin: { type: 'steal', first: 14, every: [15, 22], grace: 5 }, par: 140, allow: 3 },
    // Hall 3: full boxes wait for Ctrl+S, Nattout presses Ctrl+Z on you, everything mixed.
    { id: '3-1', hall: 2, keys: ['copy', 'paste', 'delete', 'save'], fresh: ['save'], speed: [0.7, 1.05], gap: [3.6, 2.8], seal: true,
      boxes: [[[0, 1, 3]], [[4, 3, 2]], [[1, 0, 2]]], pre: [[A - 1.8, 0, 1]], first: 6, stream: { need: 0.3, broken: 0.15 },
      teach: [['save', 'full']], par: 120, allow: 2 },
    { id: '3-2', hall: 2, keys: ['copy', 'paste', 'delete', 'undo', 'redo', 'save'], fresh: ['redo'], speed: [0.7, 1.05], gap: [3.6, 2.8], seal: true,
      boxes: [[[3, 2, 3]], [[2, 4, 3]], [[0, 0, 2]]], pre: [[A - 1.8, 3, 2]], first: 6, stream: { need: 0.28, broken: 0.15 },
      gremlin: { type: 'undo', first: 3, every: [10, 16], grace: 5 }, teach: [['redo', 'gundo']], par: 130, allow: 2 },
    { id: '3-3', hall: 2, keys: ['copy', 'paste', 'cut', 'delete', 'undo', 'redo', 'selectAll', 'save'], fresh: [], speed: [0.8, 1.15], gap: [3.2, 2.4], seal: true,
      boxes: [[[1, 0, 2], [4, 1, 1]], [[2, 2, 3]], [[3, 3, 2], [0, 4, 2]]], pre: [[A - 1.8, 1, 0]], first: 4,
      stream: { need: 0.32, broken: 0.15, next: 0.12, wave: [28, 26, 3] }, gremlin: { type: 'both', first: 12, every: [12, 18], grace: 4.5 }, par: 140, allow: 3 },
    { id: '3-4', hall: 2, keys: ['copy', 'paste', 'cut', 'delete', 'undo', 'redo', 'selectAll', 'save'], fresh: [], speed: [0.85, 1.25], gap: [3, 2.2], seal: true,
      boxes: [[[0, 2, 3]], [[1, 3, 2], [2, 1, 2]], [[4, 4, 3]], [[3, 1, 2], [0, 0, 2]]], pre: [[A - 1.8, 0, 2]], first: 4,
      stream: { need: 0.32, broken: 0.18, next: 0.12, wave: [26, 24, 4] }, gremlin: { type: 'both', first: 10, every: [11, 16], grace: 4.5 }, par: 175, allow: 3 }
  ];
  SF.RUSH = { id: 'rush', hall: 3, rush: true, keys: ['copy', 'paste', 'cut', 'delete', 'undo', 'redo', 'selectAll', 'save'], fresh: [],
    speed: [0.7, 1.0], gap: [3.4, 2.6], boxes: [], pre: [[A - 1.8, 1, 2]], first: 3, stream: { need: 0.32, broken: 0.16, next: 0.1 }, allow: 0 };
  SF.COUNT = SF.LEVELS.length;
  SF.MAX_STARS = SF.COUNT * 3;
  SF.RUSH_AFTER = 3; // finishing 1-4 opens the rush

  /* ------------------------------------------------------------- helpers */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  SF.rng = rng;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function same(a, b) { return !a.b && !b.b && a.k === b.k && a.c === b.c; }
  function ev(w, e) { if (w.ev.length < 64) w.ev.push(e); return e; }
  function snap(t) { return { id: t.id, k: t.k, c: t.c, b: t.b, x: t.x }; }

  /* --------------------------------------------------------------- create */
  function makeBox(lines) {
    return { lines: lines.map(function (l) { return { k: l[0], c: l[1], n: l[2], got: 0 }; }), state: 'open', bad: 0 };
  }
  // opts: { speed: 0..1 difficulty level, tier: 1..5, seed }
  SF.create = function (L, opts) {
    opts = opts || {};
    var lvl = clamp(typeof opts.level === 'number' ? opts.level : 0.35, 0, 1);
    var w = {
      L: L, rush: !!L.rush, rand: rng(opts.seed || 7), level: lvl, tier: opts.tier || 1,
      speed: lerp(L.speed[0], L.speed[1], lvl), gap: lerp(L.gap[0], L.gap[1], lvl),
      t: 0, anim: 0, toys: [], nextId: 1, sel: [], clip: null, clipCut: false,
      boxes: [], box: 0, shipped: 0, undo: [], redo: [], ev: [],
      lesson: 0, hold: null, spawnT: L.first == null ? 2 : L.first, waveT: L.stream && L.stream.wave ? L.stream.wave[0] : -1,
      gremlin: null, gremT: L.rush ? 8 : L.gremlin ? L.gremlin.first : -1,
      misses: 0, hits: 0, delivered: 0, coins: 0, score: 0, combo: 0, comboT: 0, bestCombo: 0, hearts: 3,
      counts: { copy: 0, paste: 0, cut: 0, delete: 0, undo: 0, redo: 0, selectAll: 0, save: 0 },
      done: false, won: false, lastPaste: -99
    };
    if (w.rush) { w.boxes.push(SF.rushBox(w, 0)); w.boxes.push(SF.rushBox(w, 1)); }
    else w.boxes = L.boxes.map(makeBox);
    (L.pre || []).forEach(function (p) { addToy(w, p[0], p[1], p[2], !!p[3]); });
    return w;
  };
  function addToy(w, x, k, c, b) {
    var t = { id: w.nextId++, k: k, c: c, b: !!b, x: x, born: w.anim };
    w.toys.push(t);
    return t;
  }
  SF.active = function (w) { return w.boxes[w.box] || null; };
  SF.nextBox = function (w) { return w.boxes[w.box + 1] || null; };
  SF.needsSeal = function (w) { return w.rush ? w.shipped >= 2 : !!w.L.seal; };
  function lineFor(box, toy) {
    if (!box || box.state !== 'open' || toy.b) return -1;
    for (var i = 0; i < box.lines.length; i++) { var l = box.lines[i]; if (l.got < l.n && l.k === toy.k && l.c === toy.c) return i; }
    return -1;
  }
  SF.lineFor = lineFor;
  function boxDone(box) { for (var i = 0; i < box.lines.length; i++) if (box.lines[i].got < box.lines[i].n) return false; return true; }
  // Toys still wanted by the active box after those already on the belt drop in.
  SF.missing = function (w, box) {
    box = box || SF.active(w);
    var out = [];
    if (!box || box.state !== 'open') return out;
    box.lines.forEach(function (l) {
      var onBelt = 0;
      w.toys.forEach(function (t) { if (!t.b && t.k === l.k && t.c === l.c) onBelt++; });
      var left = l.n - l.got - onBelt;
      if (left > 0) out.push({ k: l.k, c: l.c, n: left });
    });
    return out;
  };

  /* ----------------------------------------------------------- the rush */
  // An endless box: bigger and mixed orders as the shipped count and the tier grow.
  SF.rushBox = function (w, i) {
    var r = w.rand, step = Math.min(6, Math.floor(i / 2) + (w.tier - 1));
    var lines = step >= 3 && r() < 0.5 + step * 0.06 ? 2 : 1, out = [], used = {};
    for (var j = 0; j < lines; j++) {
      var k, c, guard = 0;
      do { k = Math.floor(r() * 5); c = Math.floor(r() * 5); } while (used[k * 5 + c] && guard++ < 20);
      used[k * 5 + c] = 1;
      out.push([k, c, lines === 2 ? 1 + Math.floor(r() * (step >= 5 ? 3 : 2)) : 2 + Math.floor(r() * (step >= 2 ? 2 : 1))]);
    }
    return makeBox(out);
  };

  /* ------------------------------------------------------------ placement */
  function isFree(w, x, ignore) {
    for (var i = 0; i < w.toys.length; i++) { var t = w.toys[i]; if (t !== ignore && Math.abs(t.x - x) < B.gap * 0.92) return false; }
    return true;
  }
  // The free belt spot nearest to `target`, or null when the belt is packed there.
  function place(w, target) {
    var lo = B.start + 0.4, hi = B.end - 0.7;
    for (var i = 0; i <= 28; i++) {
      var d = i * 0.25;
      var a = target - d, b = target + d;
      if (a >= lo && a <= hi && isFree(w, a)) return a;
      if (b >= lo && b <= hi && isFree(w, b)) return b;
    }
    return null;
  }
  function byId(w, id) { for (var i = 0; i < w.toys.length; i++) if (w.toys[i].id === id) return w.toys[i]; return null; }
  SF.byId = byId;
  function removeToy(w, t) {
    var i = w.toys.indexOf(t);
    if (i >= 0) w.toys.splice(i, 1);
    var s = w.sel.indexOf(t.id);
    if (s >= 0) w.sel.splice(s, 1);
  }
  function restore(w, list) {
    var out = [];
    list.forEach(function (s) {
      var x = place(w, Math.min(s.x, B.end - 0.8));
      if (x == null) return;
      var t = { id: s.id, k: s.k, c: s.c, b: s.b, x: x, born: w.anim };
      w.toys.push(t);
      out.push(t);
    });
    return out;
  }
  function selected(w) {
    var out = [];
    w.toys.forEach(function (t) { if (w.sel.indexOf(t.id) >= 0) out.push(t); });
    out.sort(function (a, b) { return b.x - a.x; }); // nearest the box first
    return out;
  }
  SF.selected = selected;
  function record(w, r) {
    w.undo.push(r);
    if (w.undo.length > SF.UNDO_MAX) w.undo.shift();
    w.redo.length = 0;
  }

  /* ------------------------------------------------------------- choosing */
  SF.select = function (w, id) {
    if (w.done) return false;
    var t = id == null ? null : byId(w, id);
    w.sel = t ? [t.id] : [];
    ev(w, { t: 'select', id: t ? t.id : 0 });
    return !!t;
  };
  // Arrow keys: the toy to the right (dir +1, towards the box) or to the left.
  SF.selectStep = function (w, dir) {
    if (w.done || !w.toys.length) return false;
    var list = w.toys.slice().sort(function (a, b) { return a.x - b.x; }), cur = -1;
    if (w.sel.length) {
      var last = byId(w, w.sel[w.sel.length - 1]);
      cur = list.indexOf(last);
    }
    var next;
    if (cur < 0) {
      next = list[0];
      list.forEach(function (t) { if (Math.abs(t.x - A) < Math.abs(next.x - A)) next = t; });
    } else next = list[clamp(cur + (dir > 0 ? 1 : -1), 0, list.length - 1)];
    return SF.select(w, next.id);
  };
  SF.selectAll = function (w) {
    if (w.done) return false;
    if (!w.toys.length) { ev(w, { t: 'nothing', a: 'selectAll' }); return false; }
    w.sel = w.toys.map(function (t) { return t.id; });
    w.counts.selectAll++;
    ev(w, { t: 'selectAll', ids: w.sel.slice() });
    learnt(w, 'selectAll');
    return true;
  };

  /* -------------------------------------------------------------- actions */
  SF.copy = function (w) {
    if (w.done) return false;
    var list = selected(w).slice(0, SF.CLIP_MAX);
    if (!list.length) { ev(w, { t: 'nothing', a: 'copy' }); return false; }
    w.clip = list.map(function (t) { return { k: t.k, c: t.c, b: t.b }; });
    w.clipCut = false;
    w.counts.copy++;
    ev(w, { t: 'copy', ids: list.map(function (t) { return t.id; }) });
    learnt(w, 'copy');
    return true;
  };
  SF.cut = function (w) {
    if (w.done) return false;
    var list = selected(w).slice(0, SF.CLIP_MAX);
    if (!list.length) { ev(w, { t: 'nothing', a: 'cut' }); return false; }
    var prev = w.clip, prevCut = w.clipCut, snaps = list.map(snap);
    list.forEach(function (t) { removeToy(w, t); });
    w.clip = snaps.map(function (t) { return { k: t.k, c: t.c, b: t.b }; });
    w.clipCut = true;
    record(w, { a: 'cut', toys: snaps, prev: prev, prevCut: prevCut });
    w.counts.cut++;
    ev(w, { t: 'cut', toys: snaps });
    learnt(w, 'cut');
    return true;
  };
  SF.paste = function (w) {
    if (w.done) return false;
    if (!w.clip || !w.clip.length) { ev(w, { t: 'nothing', a: 'paste' }); return false; }
    var made = [];
    for (var j = 0; j < w.clip.length; j++) {
      var x = place(w, A - j * B.gap);
      if (x == null) break;
      var it = w.clip[j];
      made.push(addToy(w, x, it.k, it.c, it.b));
    }
    if (!made.length) { ev(w, { t: 'blocked' }); return false; }
    record(w, { a: 'paste', ids: made.map(function (t) { return t.id; }), toys: made.map(snap) });
    w.counts.paste++;
    w.lastPaste = w.t;
    ev(w, { t: 'paste', ids: made.map(function (t) { return t.id; }) });
    learnt(w, 'paste');
    return true;
  };
  SF.del = function (w) {
    if (w.done) return false;
    var list = selected(w);
    if (!list.length) { ev(w, { t: 'nothing', a: 'delete' }); return false; }
    var snaps = list.map(snap), broken = 0;
    list.forEach(function (t) { if (t.b) broken++; removeToy(w, t); });
    record(w, { a: 'del', toys: snaps });
    w.counts.delete++;
    w.hits += broken;
    ev(w, { t: 'delete', toys: snaps, broken: broken });
    learnt(w, 'delete');
    return true;
  };
  // Takes back one step: the last paste, cut or delete, or the toy Nattout took.
  function unapply(w, r) {
    if (r.a === 'paste') {
      var gone = [];
      r.ids.forEach(function (id) { var t = byId(w, id); if (t) { gone.push(snap(t)); removeToy(w, t); } });
      if (!gone.length) return null;
      r.toys = gone;
      return { t: 'undo', a: 'paste', toys: gone };
    }
    if (r.a === 'cut' || r.a === 'del') {
      var back = restore(w, r.toys);
      if (!back.length) return null;
      if (r.a === 'cut') { w.clip = r.prev; w.clipCut = r.prevCut; }
      return { t: 'undo', a: r.a, ids: back.map(function (t) { return t.id; }) };
    }
    if (r.a === 'steal') {
      var box = w.boxes[r.box], g = w.gremlin;
      if (!box || box.state !== 'open' || w.box !== r.box || !g || g.rec !== r) return null;
      box.lines[r.line].got++;
      w.gremlin = { phase: 'bonk', t: 0, kind: 'steal' };
      w.hits++;
      return { t: 'undo', a: 'steal', foil: true, line: r.line };
    }
    return null;
  }
  SF.undo = function (w) {
    if (w.done) return false;
    // While Nattout runs off with a toy, Ctrl+Z brings that toy back first.
    var g = w.gremlin, gi = g && g.kind === 'steal' && g.phase === 'hold' ? w.undo.indexOf(g.rec) : -1;
    if (gi >= 0) { w.undo.splice(gi, 1); w.undo.push(g.rec); }
    while (w.undo.length) {
      var r = w.undo.pop(), e = unapply(w, r);
      if (e) {
        if (r.a !== 'steal') w.redo.push(r);
        w.counts.undo++;
        ev(w, e);
        if (r.a === 'steal') ev(w, { t: 'foil' });
        if (r.a === 'paste') checkFull(w);
        learnt(w, 'undo');
        return true;
      }
    }
    ev(w, { t: 'nothing', a: 'undo' });
    return false;
  };
  SF.redo = function (w) {
    if (w.done) return false;
    while (w.redo.length) {
      var r = w.redo.pop(), done = null;
      if (r.a === 'paste') {
        var back = restore(w, r.toys.map(function (s) { return { id: w.nextId++, k: s.k, c: s.c, b: s.b, x: s.x }; }));
        if (back.length) { r.ids = back.map(function (t) { return t.id; }); done = { t: 'redo', a: 'paste', ids: r.ids }; }
      } else if (r.a === 'cut' || r.a === 'del') {
        var gone = [];
        r.toys.forEach(function (s) { var t = byId(w, s.id); if (t) { gone.push(snap(t)); removeToy(w, t); } });
        if (gone.length) {
          r.toys = gone;
          if (r.a === 'cut') { w.clip = gone.map(function (t) { return { k: t.k, c: t.c, b: t.b }; }); w.clipCut = true; }
          done = { t: 'redo', a: r.a, toys: gone };
        }
      }
      if (done) {
        w.undo.push(r);
        w.counts.redo++;
        var g = w.gremlin;
        if (g && g.kind === 'undo' && g.phase === 'hold' && g.rec === r) { w.gremlin = { phase: 'bonk', t: 0, kind: 'undo' }; w.hits++; done.foil = true; }
        ev(w, done);
        if (done.foil) ev(w, { t: 'foil' });
        learnt(w, 'redo');
        return true;
      }
    }
    ev(w, { t: 'nothing', a: 'redo' });
    return false;
  };
  SF.seal = function (w) {
    if (w.done) return false;
    var box = SF.active(w);
    if (!box || box.state !== 'full') { ev(w, { t: 'nothing', a: 'save' }); return false; }
    w.counts.save++;
    w.hits++;
    ev(w, { t: 'seal', box: w.box });
    learnt(w, 'save');
    ship(w);
    return true;
  };
  SF.act = function (w, name) {
    switch (name) {
      case 'copy': return SF.copy(w);
      case 'paste': return SF.paste(w);
      case 'cut': return SF.cut(w);
      case 'delete': return SF.del(w);
      case 'undo': return SF.undo(w);
      case 'redo': return SF.redo(w);
      case 'selectAll': return SF.selectAll(w);
      case 'save': return SF.seal(w);
    }
    return false;
  };

  /* -------------------------------------------------------------- boxes */
  function checkFull(w) {
    var box = SF.active(w);
    if (!box || box.state !== 'open' || !boxDone(box)) return;
    if (SF.needsSeal(w)) { box.state = 'full'; ev(w, { t: 'full', box: w.box }); }
    else ship(w);
  }
  function ship(w) {
    var box = SF.active(w);
    box.state = 'shipped';
    w.shipped++;
    var bonus = 5 + Math.min(5, w.combo);
    w.coins += bonus;
    w.score += 10 + w.combo * 2;
    ev(w, { t: 'ship', box: w.box, coins: bonus });
    // A trick on a box that just left cannot be undone any more.
    if (w.gremlin && w.gremlin.kind === 'steal' && w.gremlin.phase === 'hold') escape(w);
    w.box++;
    if (w.rush) {
      w.boxes.push(SF.rushBox(w, w.boxes.length));
      w.speed = Math.min(w.speed + 0.045, 1.9);
      w.gap = Math.max(w.gap - 0.06, 1.7);
    } else if (w.box >= w.boxes.length) finish(w, true);
  }
  function drop(w, t) {
    removeToy(w, t);
    var box = SF.active(w), s = snap(t);
    if (t.b) {
      w.misses++;
      if (box) box.bad++;
      w.combo = 0;
      if (w.rush) w.hearts--;
      ev(w, { t: 'drop', res: 'bad', toy: s, box: w.box });
      if (w.rush && w.hearts <= 0) finish(w, false);
      return;
    }
    var li = lineFor(box, t);
    if (li < 0) { ev(w, { t: 'drop', res: 'store', toy: s, box: w.box }); return; }
    box.lines[li].got++;
    w.delivered++;
    w.hits++;
    w.coins++;
    w.combo = w.comboT > 0 ? w.combo + 1 : 1;
    w.comboT = 3;
    w.bestCombo = Math.max(w.bestCombo, w.combo);
    w.score += 2 + w.combo;
    ev(w, { t: 'drop', res: 'fill', toy: s, box: w.box, line: li, combo: w.combo });
    checkFull(w);
  }
  function finish(w, won) {
    if (w.done) return;
    w.done = true;
    w.won = won;
    w.hold = null;
    ev(w, { t: won ? 'win' : 'over' });
  }

  /* --------------------------------------------------------------- spawns */
  function pickToy(w) {
    var r = w.rand, s = w.L.stream || {}, box = SF.active(w), next = SF.nextBox(w);
    var broken = (s.broken || 0) + (w.tier - 1) * 0.02, roll = r();
    if (roll < broken) return { k: Math.floor(r() * 5), c: Math.floor(r() * 5), b: true };
    roll -= broken;
    var want = SF.missing(w, box);
    if (want.length && roll < (s.need || 0)) { var m = want[Math.floor(r() * want.length)]; return { k: m.k, c: m.c, b: false }; }
    roll -= s.need || 0;
    if (next && roll < (s.next || 0)) { var l = next.lines[Math.floor(r() * next.lines.length)]; return { k: l.k, c: l.c, b: false }; }
    // Any other toy: not one the active box asks for.
    for (var g = 0; g < 12; g++) {
      var k = Math.floor(r() * 5), c = Math.floor(r() * 5);
      if (lineFor(box, { k: k, c: c, b: false }) < 0) return { k: k, c: c, b: false };
    }
    return { k: 0, c: 4, b: false };
  }
  function spawn(w, dt) {
    w.spawnT -= dt;
    if (w.waveT >= 0) {
      w.waveT -= dt;
      if (w.waveT <= 0 && isFree(w, B.start) ) {
        var n = w.L.stream.wave[2];
        for (var i = 0; i < n; i++) addToy(w, B.start - i * B.gap * 1.02, Math.floor(w.rand() * 5), Math.floor(w.rand() * 5), true);
        ev(w, { t: 'wave', n: n });
        w.waveT = w.L.stream.wave[1];
        w.spawnT = Math.max(w.spawnT, w.gap + n * B.gap / w.speed);
      }
    }
    if (w.spawnT > 0) return;
    if (!isFree(w, B.start)) { w.spawnT = 0.3; return; }
    var p = pickToy(w), t = addToy(w, B.start, p.k, p.c, p.b);
    ev(w, { t: 'spawn', id: t.id, b: t.b });
    w.spawnT = w.gap * (0.85 + w.rand() * 0.3);
  }

  /* -------------------------------------------------------------- Nattout */
  function escape(w) {
    var g = w.gremlin;
    if (!g) return;
    if (g.rec) { var i = w.undo.indexOf(g.rec); if (i >= 0) w.undo.splice(i, 1); }
    w.misses++;
    w.combo = 0;
    if (w.rush) w.hearts--;
    w.gremlin = { phase: 'run', t: 0, kind: g.kind };
    ev(w, { t: 'escape', kind: g.kind });
    if (w.rush && w.hearts <= 0) finish(w, false);
  }
  function gremlinType(w) {
    var G = w.rush ? (w.shipped >= 3 ? { type: 'both' } : null) : w.L.gremlin;
    if (!G) return null;
    return G.type === 'both' ? (w.rand() < 0.5 ? 'steal' : 'undo') : G.type;
  }
  function gremlinStep(w, dt) {
    var G = w.rush ? { every: [14, 20], grace: 4.5 } : w.L.gremlin;
    var g = w.gremlin;
    if (g) {
      g.t += dt;
      if (g.phase === 'hold' && g.t >= G.grace) escape(w);
      else if ((g.phase === 'bonk' || g.phase === 'run') && g.t > 1.2) w.gremlin = null;
      return;
    }
    if (w.gremT < 0 || (w.rush && w.shipped < 3)) return;
    w.gremT -= dt;
    if (w.gremT > 0) return;
    var kind = gremlinType(w), box = SF.active(w);
    if (kind === 'steal') {
      var li = -1;
      if (box && box.state === 'open') for (var i = 0; i < box.lines.length; i++) if (box.lines[i].got > 0) li = i;
      if (li < 0) { w.gremT = 1; return; }
      box.lines[li].got--;
      var r = { a: 'steal', box: w.box, line: li };
      w.undo.push(r);
      w.gremlin = { phase: 'hold', t: 0, kind: 'steal', rec: r, toy: { k: box.lines[li].k, c: box.lines[li].c } };
      ev(w, { t: 'steal', line: li, toy: w.gremlin.toy });
    } else {
      // Ctrl+Z on the child's newest paste, while its toys are still on the belt.
      var top = w.undo[w.undo.length - 1];
      var alive = top && top.a === 'paste' && top.ids.some(function (id) { return !!byId(w, id); });
      if (!alive || w.t - w.lastPaste > 6) { w.gremT = 0.5; return; }
      w.undo.pop();
      var e = unapply(w, top);
      w.redo.length = 0;
      w.redo.push(top);
      w.gremlin = { phase: 'hold', t: 0, kind: 'undo', rec: top };
      ev(w, { t: 'gundo', toys: e.toys });
    }
    w.gremT = G.every[0] + w.rand() * (G.every[1] - G.every[0]);
  }

  /* -------------------------------------------------------------- lessons */
  function frontWhere(w, test) {
    var best = null;
    w.toys.forEach(function (t) { if (t.x >= A - 0.35 && t.x < B.end - 0.4 && test(t) && (!best || t.x > best.x)) best = t; });
    return best;
  }
  // When does the lesson's moment come? Returns the toy to aim at, true, or false.
  function moment(w, when) {
    var box = SF.active(w), next = SF.nextBox(w), g = w.gremlin;
    switch (when) {
      case 'needArm': return frontWhere(w, function (t) { return lineFor(box, t) >= 0; }) || false;
      case 'brokenArm': return frontWhere(w, function (t) { return t.b; }) || false;
      case 'nextArm': return frontWhere(w, function (t) { return lineFor(box, t) < 0 && lineFor(next, t) >= 0; }) || false;
      case 'clipNeed': return !!(w.clip && w.clip.length && box && box.state === 'open' && lineFor(box, w.clip[0]) >= 0);
      case 'junk': {
        var n = 0, front = null;
        w.toys.forEach(function (t) { if (t.b) { n++; if (!front || t.x > front.x) front = t; } });
        return n >= 3 && front && front.x >= A - 1.2;
      }
      case 'junkSel': return w.sel.length >= 2 && selected(w).every(function (t) { return t.b; });
      case 'pair': {
        if (!box || box.lines.length < 2) return false;
        var have = box.lines.every(function (l) { return w.toys.some(function (t) { return !t.b && t.k === l.k && t.c === l.c; }); });
        var front2 = frontWhere(w, function (t) { return lineFor(box, t) >= 0; });
        return have && !!front2;
      }
      case 'multiSel': return w.sel.length >= 2;
      case 'stolen': return !!(g && g.kind === 'steal' && g.phase === 'hold');
      case 'gundo': return !!(g && g.kind === 'undo' && g.phase === 'hold');
      case 'full': return !!(box && box.state === 'full');
    }
    return false;
  }
  function lessonCheck(w) {
    var T = w.L.teach;
    if (!T || w.lesson >= T.length || w.done) { if (w.hold) w.hold = null; return; }
    var step = T[w.lesson], m = moment(w, step[1]);
    if (!m) { if (w.hold) w.hold = null; return; }
    if (!w.hold || w.hold.key !== step[0]) {
      w.hold = { key: step[0], when: step[1], n: w.lesson };
      if (m && typeof m === 'object' && (step[0] === 'copy' || step[0] === 'cut' || step[0] === 'delete')) w.sel = [m.id];
      ev(w, { t: 'cue', key: step[0], lesson: w.lesson });
    }
  }
  function learnt(w, key) {
    var T = w.L.teach;
    if (!T || w.lesson >= T.length || T[w.lesson][0] !== key) return;
    w.lesson++;
    w.hold = null;
    ev(w, { t: 'learnt', key: key, lesson: w.lesson - 1 });
  }
  SF.lessonCheck = lessonCheck;

  /* ----------------------------------------------------------------- step */
  SF.step = function (w, dt) {
    w.anim += dt;
    if (w.done) return;
    lessonCheck(w);
    if (w.hold) return; // the belt, the clock and Nattout wait for the lesson
    w.t += dt;
    if (w.comboT > 0) { w.comboT -= dt; if (w.comboT <= 0) w.combo = 0; }
    var end = B.end, mv = w.speed * dt;
    for (var i = w.toys.length - 1; i >= 0; i--) w.toys[i].x += mv;
    for (var j = w.toys.length - 1; j >= 0; j--) if (w.toys[j] && w.toys[j].x >= end) drop(w, w.toys[j]);
    if (w.done) return;
    spawn(w, dt);
    gremlinStep(w, dt);
    lessonCheck(w);
  };

  /* ------------------------------------------------------------- advice */
  // The most useful next move, for the wordless coach: { key, id? }.
  SF.advice = function (w) {
    if (w.done) return null;
    if (w.hold) return { key: w.hold.key };
    var L = w.L, has = function (k) { return L.keys.indexOf(k) >= 0; }, g = w.gremlin, box = SF.active(w);
    if (g && g.phase === 'hold') return { key: g.kind === 'steal' ? 'undo' : 'redo' };
    if (box && box.state === 'full') return { key: 'save' };
    var sel = selected(w), broken = w.toys.filter(function (t) { return t.b; }).sort(function (a, b) { return b.x - a.x; });
    if (broken.length && has('delete')) {
      if (sel.length && sel.every(function (t) { return t.b; })) return { key: 'delete' };
      if (broken.length >= 3 && has('selectAll') && broken.length >= w.toys.length - 1) {
        return sel.length === w.toys.length ? { key: 'delete' } : { key: 'selectAll' };
      }
      if (broken[0].x > A - 2.5) return { key: 'select', id: broken[0].id };
    }
    var miss = SF.missing(w, box);
    var isMissing = function (t) { return !t.b && miss.some(function (m) { return m.k === t.k && m.c === t.c; }); };
    if (miss.length) {
      if (w.clip && w.clip.some(isMissing)) return { key: 'paste' };
      if (sel.some(isMissing) || (sel.length && sel.some(function (t) { return lineFor(box, t) >= 0; }) && !(w.clip && w.clip.some(function (c) { return sel.some(function (t) { return same(c, t); }); })))) return { key: 'copy' };
      var want = null;
      w.toys.forEach(function (t) { if (lineFor(box, t) >= 0 && (!want || t.x > want.x)) want = t; });
      if (want && w.sel.indexOf(want.id) < 0) return { key: 'select', id: want.id };
    }
    var next = SF.nextBox(w);
    if (has('cut') && next) {
      if (sel.length && sel.every(function (t) { return lineFor(box, t) < 0 && lineFor(next, t) >= 0; })) return { key: 'cut' };
      var keep = null;
      w.toys.forEach(function (t) { if (lineFor(box, t) < 0 && lineFor(next, t) >= 0 && t.x > A - 1 && (!keep || t.x > keep.x)) keep = t; });
      if (keep && !(w.clip && w.clip.some(function (c) { return same(c, keep); }))) return { key: 'select', id: keep.id };
    }
    return null;
  };

  /* -------------------------------------------------------------- result */
  SF.result = function (w) {
    var L = w.L, stars = 3, par = L.par || 0;
    if (w.misses > L.allow) stars--;
    if (w.misses > L.allow * 2 + 2) stars--;
    if (par && w.t > par) stars--;
    stars = clamp(stars, 1, 3);
    return { stars: stars, misses: w.misses, time: w.t, par: par, boxes: w.shipped, coins: w.coins + stars * 5, score: w.score, combo: w.bestCombo };
  };
  // A 0..1 outcome for the difficulty controller.
  SF.outcome = function (w, r) {
    if (w.rush) return clamp(w.shipped / 8, 0, 1);
    return r.stars === 3 ? 1 : r.stars === 2 ? 0.7 : 0.35;
  };

  /* ---------------------------------------------------------------- saves */
  SF.SKINS = [
    { id: 'orange', cost: 0, a: '#ff8a1f', b: '#ffd23f', c: '#3b4a6b' },
    { id: 'mint', cost: 60, a: '#2fd6a3', b: '#e9fff7', c: '#25507a' },
    { id: 'candy', cost: 120, a: '#ff6fb5', b: '#fff0f8', c: '#7a2d6b' },
    { id: 'space', cost: 200, a: '#3b3fd6', b: '#7ef0ff', c: '#1b1f4b' },
    { id: 'gold', cost: 320, a: '#ffc21f', b: '#fff6c8', c: '#8a5a00' },
    { id: 'rainbow', cost: 500, a: '#ff4b5c', b: '#35d07f', c: '#3d8bff' }
  ];
  SF.STORE_KEY = 'factory3d';
  SF.freshSave = function () {
    var z = [];
    for (var i = 0; i < SF.COUNT; i++) z.push(0);
    return { v: 1, stars: z.slice(), best: z.slice(), coins: 0, skins: SF.SKINS.map(function (s, i) { return i === 0; }), skin: 0, rushBest: 0, coach: false };
  };
  // Anything odd (an old save, a hand-edited one) falls back to a fresh save, field by field.
  SF.loadSave = function (raw) {
    var s = SF.freshSave();
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return s;
    var num = function (v, hi) { return typeof v === 'number' && v >= 0 && v <= hi && v === v ? Math.floor(v) : 0; };
    if (Array.isArray(raw.stars)) for (var i = 0; i < SF.COUNT; i++) s.stars[i] = num(raw.stars[i], 3);
    if (Array.isArray(raw.best)) for (var j = 0; j < SF.COUNT; j++) s.best[j] = num(raw.best[j], 1e7);
    s.coins = num(raw.coins, 1e7);
    if (Array.isArray(raw.skins)) for (var k = 1; k < SF.SKINS.length; k++) s.skins[k] = raw.skins[k] === true;
    s.skin = s.skins[num(raw.skin, SF.SKINS.length - 1)] ? num(raw.skin, SF.SKINS.length - 1) : 0;
    s.rushBest = num(raw.rushBest, 1e7);
    s.coach = raw.coach === true;
    return s;
  };
  SF.isOpen = function (save, i) { return i === 0 || (i > 0 && i < SF.COUNT && save.stars[i - 1] > 0); };
  SF.rushOpen = function (save) { return save.stars[SF.RUSH_AFTER] > 0; };
  SF.totalStars = function (save) { return save.stars.reduce(function (a, b) { return a + b; }, 0); };
  SF.nextLevel = function (save) {
    for (var i = 0; i < SF.COUNT; i++) if (!save.stars[i]) return i;
    return SF.COUNT - 1;
  };
  // Writes a finished level into the save; returns what changed.
  SF.apply = function (save, i, r) {
    var prev = save.stars[i], prevBest = save.best[i];
    var opened = !prev && i + 1 < SF.COUNT;
    save.stars[i] = Math.max(prev, r.stars);
    save.best[i] = Math.max(prevBest, r.score);
    save.coins += r.coins;
    return { stars: r.stars, coins: r.coins, best: r.score > prevBest && prevBest > 0, opened: opened, rushOpened: i === SF.RUSH_AFTER && !prev };
  };
  SF.applyRush = function (save, w) {
    var prev = save.rushBest, coins = w.coins;
    save.rushBest = Math.max(prev, w.score);
    save.coins += coins;
    return { coins: coins, best: w.score > prev && prev > 0, score: w.score };
  };
  SF.buy = function (save, i) {
    var s = SF.SKINS[i];
    if (!s) return 'none';
    if (save.skins[i]) { save.skin = i; return 'wear'; }
    if (save.coins < s.cost) return 'poor';
    save.coins -= s.cost;
    save.skins[i] = true;
    save.skin = i;
    return 'buy';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SF;
  else root.SF = SF;
})(typeof window !== 'undefined' ? window : this);
