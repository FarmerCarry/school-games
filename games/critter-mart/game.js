/* Critter Mart — main game: simulation, AI, rendering, UI, saving. */
(function () {
  'use strict';
  var K = window.Kit, CM = window.CM, A = CM.art;
  var ITEMS = CM.ITEMS, TAU = Math.PI * 2, OUT = A.OUT;
  var VW = 1280, VH = 720, ZOOM = 0.85;
  var canvas = document.getElementById('game');
  var view = K.fit(canvas, VW, VH);
  var ctx = view.ctx;
  var ptr = K.pointer(view);
  var store = K.store('critter-mart');
  var au = K.audio;
  var DEF = {}; CM.UNLOCKS.forEach(function (d) { DEF[d.id] = d; });
  var UPG = {}; CM.UPGRADES.forEach(function (u) { UPG[u.id] = u; });
  var PAID_UNLOCKS = CM.UNLOCKS.filter(function (d) { return d.cost > 0; }).length;

  /* ================================================================ save */
  function freshSave() {
    return { v: 1, coins: 0, un: {}, paid: {}, up: {}, shelves: {}, mach: {}, piles: {}, carry: [],
      stats: { earned: 0, served: 0, play: 0 }, last: 0, rate: 0, tut: 0, lvl: 1,
      px: CM.START.x, py: CM.START.y, done: false };
  }
  function loadSave() {
    var s = store.get('save', null), f = freshSave();
    if (!s || typeof s !== 'object' || s.v !== 1) return f;
    for (var k in f) if (s[k] === undefined || s[k] === null) s[k] = f[k];
    if (typeof s.coins !== 'number' || !isFinite(s.coins)) s.coins = 0;
    return s;
  }
  var META = store.get('meta', null) || {};
  if (!META.hat) META.hat = 'none';
  if (!META.maxLvl) META.maxLvl = 1;
  if (META.music === undefined) META.music = true;
  if (!META.best) META.best = 0;
  var S = loadSave();

  /* ============================================================= runtime */
  var R = {
    mode: 'title', t: 0, objs: [], byId: {}, rects: [], walls: [], npcs: [],
    shelves: [], machines: [], producers: [], registers: [], pads: [], decor: {},
    expanded: false, cam: { x: CM.START.x, y: CM.START.y }, spawnT: 2, rushT: 150, rush: 0,
    banners: [], hint: null, hintT: 0, idleT: 0, disp: S.coins, coinBump: 0, lvl: 1,
    timeScale: 1, bot: false, saveT: 0, incomeT: 0, income: 0, welcome: 0, chicks: [],
    firstCust: false, finaleT: -1, dl: [], shake: K.shake(), lastAction: 0
  };
  var P = { x: S.px, y: S.py, vx: 0, vy: 0, look: 0, back: false, phase: 0, moving: false, stack: [],
    tick: 0, sway: 0, squash: 1, path: null, pi: 0, pad: null, padT: 0, fullT: 0, onDesk: false, stepT: 0,
    blinkT: 3, repathT: 0, walkTo: null, coinT: 0, payTickT: 0 };

  var lv = function (id) { return S.up[id] || 0; };
  function carryCap() { return 4 + 2 * lv('carry'); }
  function speedP() { return 265 * (1 + 0.13 * lv('speed')); }
  function growMult() { return 1 + 0.28 * lv('grow'); }
  function helperMult() { return 1 + 0.18 * lv('helper'); }
  function decorBonus() { var b = 0; for (var k in R.decor) b += R.decor[k].d.bonus || 0; return b; }
  function priceMult() { return (1 + 0.2 * lv('price')) * (1 + decorBonus()); }
  function priceOf(type) { return ITEMS[type].price * priceMult(); }
  function unlockedCount() { var n = 0; for (var k in S.un) if (S.un[k] && DEF[k] && DEF[k].cost > 0) n++; return n; }
  function levelFor(n) { return 1 + Math.floor(n / 3); }
  function isUnlocked(id) { return DEF[id].cost === 0 || !!S.un[id]; }

  /* ========================================================= helpers */
  // Canvas text direction: Arabic strings draw RTL, pure numbers/symbols LTR
  // (so "+25" never flips to "25+"). Always call through dir() before drawing text.
  var ARX = /[\u0600-\u06FF]/;
  function dir(c, s) { s = String(s); c.direction = ARX.test(s) ? 'rtl' : 'ltr'; return s; }
  function coinWord(n) { n = Math.floor(n) % 100; return (n >= 3 && n <= 10) ? 'عملات' : 'عملة'; }
  function d2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function hash(i, j) { var h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function easeOutBack(t) { var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function popScale(o) {
    if (o.pop == null || o.pop > 0.7) return 1;
    return Math.max(0.01, easeOutBack(Math.min(1, o.pop / 0.7)));
  }

  /* ========================================================= audio */
  function tone(o) { au.tone(o); }
  var SFX = {
    pick: function (n) { tone({ freq: 480 + n * 50, to: 760 + n * 60, type: 'sine', dur: 0.09, vol: 0.22 }); },
    stock: function (n) { tone({ freq: 760 + (n % 8) * 40, to: 1200 + (n % 8) * 40, type: 'triangle', dur: 0.07, vol: 0.2 }); },
    full: function () { tone({ freq: 240, to: 150, type: 'square', dur: 0.12, vol: 0.1 }); },
    take: function () { tone({ freq: 620, to: 930, type: 'sine', dur: 0.06, vol: 0.09 }); },
    beep: function () { tone({ freq: 1560, type: 'square', dur: 0.045, vol: 0.06 }); },
    ching: function () {
      tone({ freq: 1319, type: 'triangle', dur: 0.1, vol: 0.2 });
      tone({ freq: 1760, type: 'triangle', dur: 0.28, vol: 0.2, delay: 0.08 });
      au.noise({ dur: 0.07, vol: 0.08, filter: 7000 });
    },
    coins: function (n) { n = Math.min(n, 8); for (var i = 0; i < n; i++) tone({ freq: 1250 + i * 110, type: 'square', dur: 0.05, vol: 0.07, delay: i * 0.045 }); },
    pay: function (p) { tone({ freq: 320 + p * 760, type: 'triangle', dur: 0.05, vol: 0.12 }); },
    unlock: function () {
      [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.22, delay: i * 0.07 }); });
      tone({ freq: 1568, type: 'sine', dur: 0.5, vol: 0.12, delay: 0.36 });
      au.noise({ dur: 0.3, vol: 0.12, filter: 5000, to: 600 });
    },
    level: function () { [392, 523, 659, 784, 659, 784, 1047].forEach(function (f, i) { tone({ freq: f, type: 'square', dur: 0.12, vol: 0.12, delay: i * 0.09 }); }); },
    upgrade: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone({ freq: f, type: 'square', dur: 0.09, vol: 0.13, delay: i * 0.055 }); }); },
    trash: function () { au.noise({ dur: 0.18, vol: 0.12, filter: 2500, to: 300 }); },
    happy: function () { tone({ freq: 880, to: 1100, type: 'sine', dur: 0.08, vol: 0.1 }); tone({ freq: 1175, to: 1400, type: 'sine', dur: 0.1, vol: 0.1, delay: 0.09 }); },
    sad: function () { tone({ freq: 420, to: 300, type: 'triangle', dur: 0.25, vol: 0.12 }); },
    click: function () { tone({ freq: 700, type: 'square', dur: 0.04, vol: 0.12 }); },
    no: function () { tone({ freq: 200, to: 140, type: 'square', dur: 0.14, vol: 0.12 }); },
    step: function () { au.noise({ dur: 0.03, vol: 0.025, filter: 900 }); },
    rush: function () { [659, 784, 988, 784, 988, 1319].forEach(function (f, i) { tone({ freq: f, type: 'square', dur: 0.08, vol: 0.12, delay: i * 0.07 }); }); },
    hire: function () { [784, 988, 1175].forEach(function (f, i) { tone({ freq: f, type: 'sine', dur: 0.14, vol: 0.18, delay: i * 0.08 }); }); }
  };

  // Cozy background tune (tiny step sequencer).
  var MUS = { next: 0, step: 0 };
  var MEL = [72, -1, 76, 79, 81, -1, 79, 76, 74, -1, 76, 74, 72, -1, 67, -1, 69, -1, 72, 74, 76, -1, 74, 72, 74, -1, 72, 69, 67, -1, -1, -1,
    72, -1, 76, 79, 81, -1, 84, 81, 79, -1, 76, 79, 81, -1, 79, -1, 76, -1, 74, 72, 74, -1, 76, 74, 72, -1, 67, 69, 72, -1, -1, -1];
  var BASS = [48, 55, 45, 52, 41, 48, 43, 50];
  function mfreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function musicTick() {
    var ac = au.ctx;
    if (!ac || au.muted || !META.music || R.mode !== 'play') { if (ac) MUS.next = ac.currentTime + 0.1; return; }
    var spb = 60 / (R.rush > 0 ? 138 : 112) / 2;
    if (MUS.next < ac.currentTime) MUS.next = ac.currentTime + 0.05;
    while (MUS.next < ac.currentTime + 0.2) {
      var dl = MUS.next - ac.currentTime, st = MUS.step % 64;
      var m = MEL[st];
      if (m > 0) tone({ freq: mfreq(m), type: 'triangle', dur: spb * 1.6, vol: 0.045, delay: dl, attack: 0.01 });
      if (st % 8 === 0) tone({ freq: mfreq(BASS[(st / 8) | 0]), type: 'sine', dur: spb * 6, vol: 0.08, delay: dl, attack: 0.02 });
      if (st % 8 === 4) tone({ freq: mfreq(BASS[(st / 8) | 0] + 7), type: 'sine', dur: spb * 3, vol: 0.05, delay: dl, attack: 0.02 });
      if (st % 2 === 1) au.noise({ dur: 0.03, vol: 0.012, filter: 9000, delay: dl });
      MUS.next += spb; MUS.step++;
    }
  }

  /* ========================================================= effects */
  var PARTS = [];
  function part(x, y, o) {
    if (PARTS.length > 450) PARTS.shift();
    PARTS.push({ x: x, y: y, vx: o.vx || 0, vy: o.vy || 0, life: o.life || 0.6, max: o.life || 0.6, size: o.size || 6,
      color: o.color || '#fff', g: o.g == null ? 500 : o.g, shape: o.shape || 'c', rot: Math.random() * 6, vr: rnd(-8, 8), z: o.z || 0 });
  }
  function burst(x, y, n, o) {
    for (var i = 0; i < n; i++) {
      var a = o.angle != null ? o.angle + rnd(-1, 1) * (o.spread || Math.PI) : Math.random() * TAU;
      var sp = (o.speed || 200) * rnd(0.4, 1);
      part(x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0), life: (o.life || 0.6) * rnd(0.7, 1.1), size: (o.size || 6) * rnd(0.6, 1.2),
        color: o.colors ? o.colors[(Math.random() * o.colors.length) | 0] : o.color, g: o.g, shape: o.shape });
    }
  }
  var CONF = ['#ff4d5e', '#ffd23f', '#3ddc84', '#3d8bfd', '#ff8fbf', '#9b6bff', '#ff9f1c'];
  function confetti(x, y, n) { burst(x, y, n || 60, { speed: 520, up: 260, life: 1.4, size: 9, colors: CONF, g: 700, shape: 'conf' }); }

  var FLY = [];
  // A flying thing with an arc. tgt may be an object with x/y (followed) plus dy offset.
  function fly(kind, type, x0, y0, tgt, dur, h, size, done, screen) {
    if (FLY.length > 220) { var f0 = FLY.shift(); if (f0.done) f0.done(); }
    FLY.push({ kind: kind, type: type, x0: x0, y0: y0, tgt: tgt, t: 0, dur: dur, h: h, size: size, done: done, screen: !!screen, x: x0, y: y0 });
  }
  function tgtPos(f) {
    var t = f.tgt;
    if (typeof t === 'function') return t();
    return t;
  }

  var TEXTS = [];
  function floatText(x, y, text, color, size, screen) {
    if (TEXTS.length > 40) TEXTS.shift();
    TEXTS.push({ x: x, y: y, text: text, color: color || '#fff', size: size || 30, t: 0, life: 1.2, screen: !!screen });
  }
  var BQ = [];
  function banner(text, sub, color, life) {
    var b = { text: text, sub: sub || '', color: color || '#ffd23f', t: 0, life: life || 2.4 };
    if (R.banners.length < 2) R.banners.push(b); else { BQ.push(b); if (BQ.length > 4) BQ.shift(); }
  }

  /* ========================================================= world build */
  function makeSpots(d, kind) {
    var spots = [];
    if (kind === 'field' || kind === 'orchard') {
      for (var r = 0; r < d.rows; r++) for (var c = 0; c < d.cols; c++) {
        spots.push({ x: d.x + (c - (d.cols - 1) / 2) * d.sx + (kind === 'orchard' ? (r % 2) * 30 - 15 : 0), y: d.y + (r - (d.rows - 1) / 2) * d.sy, g: 1, seed: Math.random() * 10, bump: 0 });
      }
    } else if (kind === 'coop') {
      for (var i = 0; i < 4; i++) spots.push({ x: d.x - 66 + i * 44, y: d.y + 88, g: 1, seed: Math.random() * 10, bump: 0 });
    } else if (kind === 'pen') {
      for (var j = 0; j < 4; j++) spots.push({ x: d.x - 54 + j * 36, y: d.y + 102, g: 1, seed: Math.random() * 10, bump: 0 });
    }
    return spots;
  }

  function buildObj(d, fresh) {
    var o = { d: d, id: d.id, kind: d.kind, x: d.x, y: d.y, pop: fresh ? 0 : 99, k: d.kind, dy: d.y };
    switch (d.kind) {
      case 'field': case 'orchard': case 'coop': case 'pen':
        o.item = d.item; o.spots = makeSpots(d, d.kind); o.grow = d.grow;
        o.pickR = d.kind === 'orchard' ? 80 : (d.kind === 'field' ? 62 : 46);
        o.spots.forEach(function (sp) { sp.k = 'plant'; sp.o = o; sp.dy = sp.y; sp.pop = o.pop; });
        if (d.kind === 'coop') { o.dy = d.y + 45; o.nests = { k: 'nests', o: o, dy: d.y + 96 }; }
        if (d.kind === 'pen') { o.dy = d.y + 65; o.crate = { k: 'crate', o: o, dy: d.y + 110 }; o.cow = { x: 0, dir: 1, t: 0 }; }
        R.producers.push(o);
        break;
      case 'shelf':
        o.item = d.item; o.count = Math.min(8, S.shelves[d.id] || 0); o.cap = 8; o.inflight = 0; o.res = 0; o.bump = 0;
        o.dy = d.y + 23; o.slots = [{ x: d.x - 46, y: d.y + 60, n: 0 }, { x: d.x, y: d.y + 64, n: 0 }, { x: d.x + 46, y: d.y + 60, n: 0 }];
        o.stockPt = { x: d.x, y: d.y - 58 };
        R.shelves.push(o);
        break;
      case 'machine':
        var m = S.mach[d.id] || { i: 0, o: 0 };
        o.inCount = Math.min(8, m.i || 0); o.outCount = Math.min(8, m.o || 0); o.cap = 8; o.prog = 0; o.res = 0; o.working = false;
        o.inMat = { x: d.x - 112, y: d.y + 12 }; o.outMat = { x: d.x + 112, y: d.y + 12 }; o.dy = d.y + 35; o.inflight = 0; o.outInflight = 0;
        R.machines.push(o);
        break;
      case 'register':
        o.queue = []; o.pile = S.piles[d.id] || 0; o.pileVis = o.pile; o.serveT = 0; o.scan = 0; o.ching = 0; o.dy = d.y + 27;
        o.pileObj = { k: 'pile', o: o, dy: d.pile.y + 6 };
        R.registers.push(o);
        if (d.helper) spawnHelper('cashier', o, !fresh);
        break;
      case 'desk': o.dy = 866; break;
      case 'trash': o.dy = d.y + 12; o.lid = 0; break;
      case 'decor':
        R.decor[d.id] = o;
        if (d.decor === 'fountain') o.dy = d.y + 36;
        if (d.decor === 'statue') o.dy = d.y + 26;
        if (d.decor === 'balloons') o.dy = 1772;
        if (d.decor === 'rug') o.k = 'none';
        if (d.decor === 'plants') o.k = 'none';
        break;
      case 'hire':
        o.k = 'none';
        if (d.role === 'cashier') spawnHelper('cashier', R.byId[d.reg], !fresh);
        else spawnHelper('farmer', null, !fresh, d);
        break;
      case 'expand': o.k = 'none'; R.expanded = true; break;
    }
    R.objs.push(o); R.byId[d.id] = o;
    return o;
  }

  function buildWorld() {
    R.objs = []; R.byId = {}; R.npcs = []; R.shelves = []; R.machines = []; R.producers = []; R.registers = []; R.decor = {};
    R.expanded = false; R.chicks = [];
    CM.UNLOCKS.forEach(function (d) { if (isUnlocked(d.id)) buildObj(d, false); });
    rebuildStatic();
    R.lvl = levelFor(unlockedCount());
    // restore carried stack
    P.stack = [];
    (S.carry || []).forEach(function (t) { if (ITEMS[t] && P.stack.length < carryCap()) P.stack.push({ type: t, f: 1 }); });
    P.x = S.px; P.y = S.py; P.vx = P.vy = 0; P.path = null;
    PARTS.length = 0; FLY.length = 0; TEXTS.length = 0; R.banners = []; BQ.length = 0;
    R.cam.x = P.x; R.cam.y = P.y;
  }

  function rebuildStatic() {
    R.rects = []; R.walls = [];
    var H = CM.HALL, Wg = CM.WING, D = CM.DOOR;
    // walls: horizontal: [y, x0, x1, gapA, gapB, kind]
    function wallH(y, x0, x1, gap, kind) {
      var segs = gap ? [[x0, gap[0]], [gap[1], x1]] : [[x0, x1]];
      segs.forEach(function (s) {
        R.rects.push({ x0: s[0] - 8, y0: y - 8, x1: s[1] + 8, y1: y + 8 });
        R.walls.push({ k: kind, x0: s[0] - 8, x1: s[1] + 8, y: y, dy: y + 8 });
      });
    }
    function wallV(x, y0, y1, gap) {
      var segs = gap ? [[y0, gap[0]], [gap[1], y1]] : [[y0, y1]];
      segs.forEach(function (s) {
        R.rects.push({ x0: x - 8, y0: s[0] - 8, x1: x + 8, y1: s[1] + 8 });
        for (var yy = s[0]; yy < s[1]; yy += 40) {
          var ye = Math.min(s[1], yy + 40);
          R.walls.push({ k: 'wallv', x: x, y0: yy, y1: ye, end: ye >= s[1], dy: ye + 2 });
        }
      });
    }
    wallH(H.y0, H.x0, H.x1, [D.x0, D.x1], 'wallback');
    wallH(H.y1, H.x0, H.x1, [D.x0, D.x1], 'wallfront');
    wallV(H.x0, H.y0, H.y1, [CM.WDOOR.y0, CM.WDOOR.y1]);
    if (R.expanded) {
      wallV(H.x1, H.y0, H.y1, [CM.EGAP.y0, CM.EGAP.y1]);
      wallH(Wg.y0, Wg.x0, Wg.x1, null, 'wallback');
      wallH(Wg.y1, Wg.x0, Wg.x1, null, 'wallfront');
      wallV(Wg.x1, Wg.y0, Wg.y1, null);
    } else {
      wallV(H.x1, H.y0, H.y1, null);
    }
    R.walls.push({ k: 'sign', dy: H.y1 + 10 });
    R.objs.forEach(function (o) {
      var d = o.d;
      switch (o.kind) {
        case 'shelf': R.rects.push({ x0: d.x - 75, y0: d.y - 23, x1: d.x + 75, y1: d.y + 23 }); break;
        case 'machine': R.rects.push({ x0: d.x - 65, y0: d.y - 35, x1: d.x + 65, y1: d.y + 35 }); break;
        case 'register': R.rects.push({ x0: d.x - 85, y0: d.y - 27, x1: d.x + 85, y1: d.y + 27 }); break;
        case 'coop': R.rects.push({ x0: d.x - 90, y0: d.y - 45, x1: d.x + 90, y1: d.y + 45 }); break;
        case 'pen': R.rects.push({ x0: d.x - 120, y0: d.y - 65, x1: d.x + 120, y1: d.y + 65 }); break;
        case 'trash': R.rects.push({ x0: d.x - 20, y0: d.y - 14, x1: d.x + 20, y1: d.y + 12 }); break;
        case 'orchard': o.spots.forEach(function (s) { R.rects.push({ x0: s.x - 12, y0: s.y - 8, x1: s.x + 12, y1: s.y + 8 }); }); break;
        case 'decor':
          if (d.decor === 'fountain') R.rects.push({ x0: d.x - 70, y0: d.y - 34, x1: d.x + 70, y1: d.y + 34 });
          if (d.decor === 'statue') R.rects.push({ x0: d.x - 38, y0: d.y - 24, x1: d.x + 38, y1: d.y + 24 });
          break;
      }
    });
    buildNav();
    refreshPads();
    groundInvalidate();
  }

  function refreshPads() {
    var old = {};
    R.pads.forEach(function (p) { old[p.d.id] = p; });
    R.pads = [];
    CM.UNLOCKS.forEach(function (d) {
      if (isUnlocked(d.id)) return;
      for (var i = 0; i < d.req.length; i++) if (!isUnlocked(d.req[i])) return;
      var p = old[d.id] || { d: d, x: d.x, y: d.y, acc: 0, pop: 0, fill: 0 };
      p.paid = S.paid[d.id] || 0;
      if (d.kind === 'shelf' || d.kind === 'machine') { p.x = d.x; p.y = d.y; }
      R.pads.push(p);
    });
  }

  /* ========================================================= nav grid */
  var NAV = { cs: 40, cols: 0, rows: 0, block: null, g: null, from: null, seen: null, stamp: 1, heap: null };
  function buildNav() {
    var cs = NAV.cs;
    NAV.cols = Math.ceil(CM.W / cs); NAV.rows = Math.ceil(CM.H / cs);
    var n = NAV.cols * NAV.rows;
    if (!NAV.block || NAV.block.length !== n) {
      NAV.block = new Uint8Array(n); NAV.g = new Float32Array(n); NAV.from = new Int32Array(n);
      NAV.seen = new Uint32Array(n); NAV.closed = new Uint32Array(n); NAV.heap = new Int32Array(n * 4); NAV.f = new Float32Array(n);
      NAV.cblock = new Uint8Array(n);
    }
    var inf = 16;
    for (var r = 0; r < NAV.rows; r++) for (var c = 0; c < NAV.cols; c++) {
      var x = c * cs + cs / 2, y = r * cs + cs / 2, b = 0;
      if (x < 20 || x > CM.W - 20 || y < 130 || y > CM.ROAD_Y) b = 1;
      for (var i = 0; !b && i < R.rects.length; i++) {
        var q = R.rects[i];
        if (x > q.x0 - inf && x < q.x1 + inf && y > q.y0 - inf && y < q.y1 + inf) b = 1;
      }
      NAV.block[r * NAV.cols + c] = b;
      // customers only use the front door
      var cb = b;
      if (x > CM.HALL.x0 - 50 && x < CM.HALL.x0 + 50 && y > CM.WDOOR.y0 - 10 && y < CM.WDOOR.y1 + 10) cb = 1;
      if (y > CM.HALL.y0 - 50 && y < CM.HALL.y0 + 50 && x > CM.DOOR.x0 - 10 && x < CM.DOOR.x1 + 10) cb = 1;
      NAV.cblock[r * NAV.cols + c] = cb;
    }
  }
  function cellAt(x, y) {
    var c = Math.floor(x / NAV.cs), r = Math.floor(y / NAV.cs);
    if (c < 0 || r < 0 || c >= NAV.cols || r >= NAV.rows) return -1;
    return r * NAV.cols + c;
  }
  var BLK = null;
  function blockedAt(x, y) { var i = cellAt(x, y); return i < 0 || BLK[i] === 1; }
  function nearestFree(i) {
    if (i >= 0 && !BLK[i]) return i;
    var c0 = i >= 0 ? i % NAV.cols : 0, r0 = i >= 0 ? (i / NAV.cols) | 0 : 0;
    for (var rad = 1; rad < 8; rad++) {
      var best = -1, bd = 1e9;
      for (var dr = -rad; dr <= rad; dr++) for (var dc = -rad; dc <= rad; dc++) {
        if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
        var r = r0 + dr, c = c0 + dc;
        if (r < 0 || c < 0 || r >= NAV.rows || c >= NAV.cols) continue;
        var j = r * NAV.cols + c;
        if (!BLK[j]) { var dd = dr * dr + dc * dc; if (dd < bd) { bd = dd; best = j; } }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  function losClear(x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy), n = Math.ceil(L / 12);
    for (var i = 1; i < n; i++) if (blockedAt(x0 + dx * i / n, y0 + dy * i / n)) return false;
    return true;
  }
  function findPath(sx, sy, tx, ty, cust) {
    BLK = cust ? NAV.cblock : NAV.block;
    var s = nearestFree(cellAt(sx, sy)), t = nearestFree(cellAt(tx, ty));
    var dest = { x: tx, y: ty };
    if (s < 0 || t < 0) return [dest];
    if (s === t || losClear(sx, sy, tx, ty)) return [dest];
    var cols = NAV.cols, cs = NAV.cs, st = ++NAV.stamp;
    var heap = NAV.heap, hn = 0, g = NAV.g, f = NAV.f, from = NAV.from, seen = NAV.seen, closed = NAV.closed, block = BLK;
    var tc = t % cols, tr = (t / cols) | 0;
    function hfn(i) { var c = i % cols, r = (i / cols) | 0, dx = Math.abs(c - tc), dy = Math.abs(r - tr); return (dx + dy) + (1.414 - 2) * Math.min(dx, dy); }
    function push(i) {
      var k = hn++; heap[k] = i;
      while (k > 0) { var p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; var tmp = heap[p]; heap[p] = heap[k]; heap[k] = tmp; k = p; }
    }
    function pop() {
      var top = heap[0]; hn--; heap[0] = heap[hn]; var k = 0;
      for (;;) {
        var l = k * 2 + 1, r = l + 1, m = k;
        if (l < hn && f[heap[l]] < f[heap[m]]) m = l;
        if (r < hn && f[heap[r]] < f[heap[m]]) m = r;
        if (m === k) break; var tmp = heap[m]; heap[m] = heap[k]; heap[k] = tmp; k = m;
      }
      return top;
    }
    seen[s] = st; g[s] = 0; f[s] = hfn(s); from[s] = -1; push(s);
    var found = false, iter = 0;
    while (hn > 0 && iter < 6000) {
      iter++;
      var cur = pop();
      if (closed[cur] === st) continue;
      closed[cur] = st;
      if (cur === t) { found = true; break; }
      var cc = cur % cols, cr = (cur / cols) | 0;
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var nc = cc + dc, nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= NAV.rows) continue;
        var ni = nr * cols + nc;
        if (block[ni] || closed[ni] === st) continue;
        if (dr && dc && (block[cr * cols + nc] || block[nr * cols + cc])) continue;
        var ng = g[cur] + (dr && dc ? 1.414 : 1);
        if (seen[ni] !== st || ng < g[ni]) { seen[ni] = st; g[ni] = ng; f[ni] = ng + hfn(ni); from[ni] = cur; push(ni); }
      }
    }
    if (!found) return [dest];
    var cells = [];
    for (var i = t; i !== -1; i = from[i]) cells.push(i);
    cells.reverse();
    var pts = [{ x: sx, y: sy }];
    for (var j = 1; j < cells.length; j++) pts.push({ x: (cells[j] % cols) * cs + cs / 2, y: ((cells[j] / cols) | 0) * cs + cs / 2 });
    pts.push(dest);
    // string-pull
    var out = [], a = 0;
    while (a < pts.length - 1) {
      var b = pts.length - 1;
      while (b > a + 1 && !losClear(pts[a].x, pts[a].y, pts[b].x, pts[b].y)) b--;
      out.push(pts[b]); a = b;
    }
    return out;
  }

  /* ========================================================= NPCs */
  function goTo(n, x, y) { n.path = findPath(n.x, n.y, x, y, n.type === 'cust'); n.pi = 0; n.arrived = false; }
  function npcMove(n, dt) {
    if (!n.path || n.pi >= n.path.length) { n.moving = false; n.arrived = true; return true; }
    var p = n.path[n.pi], dx = p.x - n.x, dy = p.y - n.y, d = Math.sqrt(dx * dx + dy * dy), step = n.speed * dt;
    if (d <= step) { n.x = p.x; n.y = p.y; n.pi++; }
    else { n.x += dx / d * step; n.y += dy / d * step; }
    if (d > 0.5) faceDir(n, dx, dy, dt);
    n.moving = true;
    n.phase += dt * n.speed / 11;
    if (n.pi >= n.path.length) { n.moving = false; n.arrived = true; return true; }
    return false;
  }
  function faceDir(n, dx, dy, dt) {
    var L = Math.sqrt(dx * dx + dy * dy) || 1;
    var tl = dx / L;
    n.look += (tl - n.look) * Math.min(1, dt * 10);
    n.back = dy / L < -0.6;
  }

  function spawnHelper(role, reg, instant, d) {
    var home = role === 'cashier' ? reg.d.cashier : { x: 690, y: 1560 };
    var h = { type: 'helper', role: role, sp: role === 'farmer' ? 'frog' : 'cat', reg: reg,
      x: d ? d.x : home.x + 60, y: d ? d.y : home.y + 40, speed: 150, look: 0, back: false, phase: 0, moving: false,
      stack: [], state: 'idle', thinkT: Math.random(), t: Math.random() * 10, pop: instant ? 99 : 0, gT: 0, waitT: 0,
      hat: role === 'farmer' ? 'straw' : 'visor', k: 'critter', dy: 0, blinkT: rnd(1, 4), sway: 0, home: home };
    if (role === 'farmer') { h.overalls = ['#3d8bfd', '#9b6bff', '#ff8c42'][R.npcs.filter(function (n) { return n.role === 'farmer'; }).length % 3]; }
    else { h.apron = '#1fb5a8'; h.pocket = '#fff'; reg.helper = h; }
    if (instant && role === 'cashier') { h.x = home.x; h.y = home.y; }
    R.npcs.push(h);
    return h;
  }

  function customerSpecies() {
    var pool = CM.CUSTOMERS.filter(function (c) { return c.lvl <= R.lvl; });
    return pool[(Math.random() * pool.length) | 0].sp;
  }
  function spawnCustomer(first) {
    var types = [];
    R.shelves.forEach(function (s) { if (types.indexOf(s.item) < 0) types.push(s.item); });
    if (!types.length) return;
    var wants = [];
    if (first) wants = ['banana', 'banana'];
    else {
      // favour the newest shelves a little so the player sees demand for new stuff
      var pool = types.slice();
      var newest = R.shelves.slice(-2);
      newest.forEach(function (s) { pool.push(s.item); });
      var nT = Math.min(types.length, 1 + (Math.random() < 0.55 ? 1 : 0) + (types.length > 4 && Math.random() < 0.35 ? 1 : 0));
      var chosen = [];
      var guard = 0;
      while (chosen.length < nT && guard++ < 30) { var tpe = pool[(Math.random() * pool.length) | 0]; if (chosen.indexOf(tpe) < 0) chosen.push(tpe); }
      chosen.forEach(function (tp) {
        var cnt = 1 + (Math.random() < 0.4 ? 1 : 0) + (types.length === 1 ? 1 : 0);
        for (var i = 0; i < cnt; i++) wants.push(tp);
      });
      if (wants.length > 5) wants.length = 5;
    }
    var sp = customerSpecies(), d = A.SPECIES[sp];
    var left = Math.random() < 0.5;
    var sx = first ? 1250 + (left ? -60 : 60) : 1250 + (left ? -1 : 1) * rnd(380, 640);
    var c = { type: 'cust', sp: sp, color: d.alt && Math.random() < 0.45 ? d.alt[(Math.random() * d.alt.length) | 0] : null,
      bow: Math.random() < 0.25 ? ['#ff5d8f', '#3d8bfd', '#ffd23f', '#9b6bff'][(Math.random() * 4) | 0] : null,
      glasses: Math.random() < 0.12, hat: Math.random() < 0.12 ? ['cap', 'flower', 'party'][(Math.random() * 3) | 0] : null,
      x: sx, y: first ? CM.WALK_Y + 10 : CM.CUST_Y, speed: rnd(165, 195), wants: wants, wi: 0, basket: [], state: 'shop', wait: 0, mood: 1,
      phase: Math.random() * 6, look: 0, back: false, moving: true, t: Math.random() * 10, takeT: 0, paid: 0, k: 'critter', dy: 0,
      blinkT: rnd(1, 4), pop: 0.2, shelf: null, slot: null, reg: null, qi: -1, exitX: left ? -60 : CM.W + 60 };
    R.npcs.push(c);
    nextWant(c);
  }
  function shelfFor(type) {
    for (var i = 0; i < R.shelves.length; i++) if (R.shelves[i].item === type) return R.shelves[i];
    return null;
  }
  function releaseSlot(c) { if (c.slot) { c.slot.n--; c.slot = null; } }
  function nextWant(c) {
    releaseSlot(c);
    c.wait = 0;
    while (c.wi < c.wants.length && !shelfFor(c.wants[c.wi])) c.wi++;
    if (c.wi >= c.wants.length) {
      if (c.basket.length) toQueue(c); else leave(c);
      return;
    }
    var sh = shelfFor(c.wants[c.wi]);
    c.shelf = sh;
    var best = sh.slots[0];
    sh.slots.forEach(function (s) { if (s.n < best.n) best = s; });
    best.n++; c.slot = best;
    c.state = 'shop';
    goTo(c, best.x + rnd(-6, 6), best.y + rnd(-3, 3));
  }
  function toQueue(c) {
    releaseSlot(c);
    var best = null;
    R.registers.forEach(function (r) { if (!best || r.queue.length < best.queue.length) best = r; });
    c.reg = best; best.queue.push(c); c.qi = -1; c.state = 'queue'; c.wait = 0;
  }
  function queueSpot(reg, i) {
    var q = reg.d.queue;
    if (i < q.length) return { x: q[i][0], y: q[i][1] };
    var a = q[q.length - 2], b = q[q.length - 1], k = i - q.length + 1;
    return { x: b[0] + (b[0] - a[0]) * k, y: b[1] + (b[1] - a[1]) * k };
  }
  function leave(c) {
    releaseSlot(c);
    c.state = 'leave';
    var ex = c.exitX < 0 ? 40 : CM.W - 40;
    c.path = findPath(c.x, c.y, ex, CM.CUST_Y, true); c.path.push({ x: c.exitX, y: CM.CUST_Y }); c.pi = 0; c.arrived = false;
  }

  function updateCustomer(c, dt) {
    c.t += dt;
    if (c.pop < 1) c.pop += dt * 3;
    switch (c.state) {
      case 'shop':
        if (npcMove(c, dt)) { c.state = 'pick'; c.takeT = 0.25; c.look = 0; c.back = true; }
        break;
      case 'pick':
        var sh = c.shelf;
        if (!sh || R.byId[sh.id] !== sh) { c.wi++; nextWant(c); break; }
        c.back = true;
        c.takeT -= dt;
        if (sh.count > 0) {
          c.wait = Math.max(0, c.wait - dt * 2);
          if (c.takeT <= 0) {
            sh.count--; sh.bump = 0.2;
            var slotI = Math.min(7, sh.count);
            var sp0 = shelfSlotPos(sh, slotI);
            var type = sh.item;
            c.basket.push(type); c.incoming = (c.incoming || 0) + 1;
            (function (cc, tp) { fly('item', tp, sp0.x, sp0.y - 14, function () { return { x: cc.x, y: cc.y - 30 }; }, 0.35, 40, 26, function () { cc.incoming = Math.max(0, cc.incoming - 1); }); })(c, type);
            SFX.take();
            c.wi++; c.takeT = 0.4;
            if (c.wi >= c.wants.length || c.wants[c.wi] !== type) { c.state = 'waitfly'; c.flyT = 0.4; }
          }
        } else {
          c.wait += dt;
          if (c.wait > 38) {
            c.mood = Math.max(0, c.mood - 0.45);
            floatText(c.x, c.y - 100, 'أين ' + ITEMS[c.wants[c.wi]].al + '؟', '#ffb3b3', 22);
            SFX.sad();
            var skip = c.wants[c.wi];
            while (c.wi < c.wants.length && c.wants[c.wi] === skip) c.wi++;
            nextWant(c);
          }
        }
        break;
      case 'waitfly':
        c.flyT -= dt;
        if (c.flyT <= 0) nextWant(c);
        break;
      case 'queue':
        var qi = c.reg.queue.indexOf(c);
        if (qi !== c.qi) { c.qi = qi; var qs = queueSpot(c.reg, qi); goTo(c, qs.x, qs.y); }
        if (npcMove(c, dt)) { c.back = true; c.look = 0; if (qi === 0) c.wait += dt; }
        break;
      case 'paying':
        c.back = true;
        break;
      case 'leave':
        if (npcMove(c, dt)) c.dead = true;
        break;
    }
  }

  /* ---------- helper (farmer/cashier) AI */
  function sourcesFor(type) {
    var out = [];
    R.producers.forEach(function (p) { if (p.item === type) out.push(p); });
    R.machines.forEach(function (m) { if (m.d.output === type) out.push(m); });
    return out;
  }
  function availAt(src) {
    if (src.kind === 'machine') return src.outCount;
    var n = 0; src.spots.forEach(function (s) { if (s.g >= 1) n++; else if (s.g > 0.85) n += 0.5; }); return n;
  }
  function srcPoint(src) {
    if (src.kind === 'machine') return src.outMat;
    if (src.kind === 'coop' || src.kind === 'pen') return { x: src.x, y: src.spots[0].y + 38 };
    return { x: src.x, y: src.y };
  }
  function dstPoint(dst) {
    if (dst.kind === 'machine') return dst.inMat;
    return dst.stockPt;
  }
  function accepts(dst, type) {
    if (dst.kind === 'shelf') return dst.item === type && dst.count < dst.cap;
    if (dst.kind === 'machine') return dst.d.input === type && dst.inCount < dst.cap;
    return false;
  }
  function chooseTask(who, cap) {
    var best = null, bs = -1e9;
    function consider(dst, type, need, base) {
      if (need <= 0) return;
      sourcesFor(type).forEach(function (src) {
        var av = availAt(src);
        if (av <= 0) return;
        var sp = srcPoint(src);
        var sc = base + Math.min(av, need, cap) * 0.6 - Math.sqrt(d2(who.x, who.y, sp.x, sp.y)) / 500 + Math.random() * 0.8;
        if (sc > bs) { bs = sc; best = { src: src, dst: dst, n: Math.min(need, cap), type: type }; }
      });
    }
    R.shelves.forEach(function (s) {
      var need = s.cap - s.count - s.res;
      var waiting = 0;
      s.slots.forEach(function (sl) { waiting += sl.n; });
      consider(s, s.item, need, (1 - s.count / s.cap) * 10 + waiting * 4);
    });
    R.machines.forEach(function (m) {
      var need = m.cap - m.inCount - m.res;
      var sh = shelfFor(m.d.output);
      var outNeed = sh ? (1 - sh.count / sh.cap) : 0.3;
      consider(m, m.d.input, need, (1 - m.inCount / m.cap) * 6 + outNeed * 4 - (m.outCount >= m.cap ? 20 : 0));
    });
    return best;
  }
  function takeFrom(src, who) {
    if (src.kind === 'machine') {
      if (src.outCount <= 0) return null;
      src.outCount--; return { type: src.d.output, x: src.outMat.x, y: src.outMat.y - 20 };
    }
    var bestS = null, bd = 1e9;
    for (var i = 0; i < src.spots.length; i++) {
      var s = src.spots[i];
      if (s.g < 1) continue;
      var dd = d2(who.x, who.y, s.x, s.y);
      if (dd < bd) { bd = dd; bestS = s; }
    }
    if (!bestS) return null;
    harvest(bestS);
    return { type: src.item, x: bestS.x, y: bestS.y - 30 };
  }
  function harvest(s) {
    s.g = 0; s.bump = 0.35;
    var o = s.o;
    var col = o.item === 'banana' || o.item === 'corn' ? ['#6cd35a', '#4fae3a', '#ffe14a'] : (o.item === 'egg' ? ['#f5d36b', '#fff4e0'] : (o.item === 'milk' ? ['#ffffff', '#cfe6ff'] : ['#6cd35a', '#ff4b4b']));
    burst(s.x, s.y - 30, 7, { speed: 160, up: 120, life: 0.5, size: 6, colors: col, g: 500 });
  }
  function giveTo(dst, type, fromX, fromY) {
    if (!accepts(dst, type)) return false;
    if (dst.kind === 'shelf') {
      dst.count++; dst.inflight++;
      var sp = shelfSlotPos(dst, dst.count - 1);
      fly('item', type, fromX, fromY, sp, 0.28, 50, 30, function () { dst.inflight = Math.max(0, dst.inflight - 1); dst.bump = 0.2; });
    } else {
      dst.inCount++; dst.inflight++;
      fly('item', type, fromX, fromY, { x: dst.x - 28, y: dst.y - 96 }, 0.3, 50, 28, function () { dst.inflight = Math.max(0, dst.inflight - 1); dst.bump = 0.15; });
    }
    return true;
  }

  function updateHelper(h, dt) {
    h.t += dt;
    if (h.pop < 1) h.pop += dt * 2;
    var hm = helperMult();
    h.speed = (h.role === 'farmer' ? 150 : 140) * hm;
    if (h.role === 'cashier') {
      var post = h.reg.d.cashier;
      if (h.state === 'idle') { goTo(h, post.x, post.y); h.state = 'walk'; }
      if (h.state === 'walk' && npcMove(h, dt)) { h.state = 'post'; }
      if (h.state === 'post') { h.back = false; h.look *= 0.9; h.atPost = true; }
      return;
    }
    var cap = 4 + lv('helper');
    switch (h.state) {
      case 'idle':
        h.thinkT -= dt;
        if (h.thinkT > 0) { npcMove(h, dt); break; }
        h.thinkT = 0.5;
        if (h.stack.length) { depositAnywhere(h); break; }
        var task = chooseTask(h, cap);
        if (task) {
          h.task = task; task.dst.res += task.n;
          var sp = srcPoint(task.src); goTo(h, sp.x + rnd(-20, 20), sp.y + rnd(-10, 10)); h.state = 'toSrc';
        } else if (!h.path || h.arrived) {
          goTo(h, h.home.x + rnd(-80, 80), h.home.y + rnd(-50, 50));
          h.thinkT = rnd(1, 2);
        }
        break;
      case 'toSrc':
        if (npcMove(h, dt)) { h.state = 'gather'; h.gT = 0.2; h.waitT = 0; h.took = 0; }
        break;
      case 'gather':
        h.gT -= dt;
        if (h.gT <= 0) {
          h.gT = 0.22 / hm;
          if (h.took < h.task.n && h.stack.length < cap) {
            var got = takeFrom(h.task.src, h);
            if (got) {
              h.took++; h.waitT = 0;
              h.stack.push({ type: got.type, f: 0, fx: got.x, fy: got.y });
            } else h.waitT += 0.22 / hm;
          }
          if (h.took >= h.task.n || h.stack.length >= cap || (h.took > 0 && h.waitT > 0.8) || h.waitT > 3.5) {
            if (h.took === 0) { h.task.dst.res -= h.task.n; h.task = null; h.state = 'idle'; h.thinkT = 0.4; }
            else { var dp = dstPoint(h.task.dst); goTo(h, dp.x + rnd(-15, 15), dp.y); h.state = 'toDst'; }
          }
        }
        break;
      case 'toDst':
        if (npcMove(h, dt)) { h.state = 'deposit'; h.gT = 0.1; }
        break;
      case 'deposit':
        h.gT -= dt;
        if (h.gT <= 0) {
          h.gT = 0.12 / hm;
          var idx = topIndexOf(h.stack, h.task.type);
          if (idx >= 0 && accepts(h.task.dst, h.task.type)) {
            var it = h.stack.splice(idx, 1)[0];
            giveTo(h.task.dst, it.type, h.x, h.y - 80 - idx * 13);
          } else {
            h.task.dst.res -= h.task.n; h.task = null; h.state = 'idle'; h.thinkT = 0.1;
          }
        }
        break;
      case 'dump':
        if (npcMove(h, dt)) {
          var dst = h.dumpTo;
          while (h.stack.length) {
            var it2 = h.stack.pop();
            if (dst && giveTo(dst, it2.type, h.x, h.y - 80)) continue;
            burst(h.x, h.y - 60, 5, { speed: 120, life: 0.4, colors: ['#cccccc', '#ffffff'] });
          }
          h.state = 'idle'; h.thinkT = 0.3;
        }
        break;
    }
  }
  function topIndexOf(stack, type) {
    for (var i = stack.length - 1; i >= 0; i--) if (stack[i].type === type) return i;
    return -1;
  }
  function depositAnywhere(h) {
    var type = h.stack[h.stack.length - 1].type, dst = null;
    R.shelves.forEach(function (s) { if (!dst && accepts(s, type)) dst = s; });
    R.machines.forEach(function (m) { if (!dst && accepts(m, type)) dst = m; });
    if (dst) { var p = dstPoint(dst); h.dumpTo = dst; goTo(h, p.x, p.y); }
    else { h.dumpTo = null; var tr = R.byId.trash; goTo(h, tr.x + 40, tr.y); }
    h.state = 'dump';
  }

  /* ========================================================= player */
  function playerInput(dt) {
    var ix = 0, iy = 0, keys = K.keys;
    if (keys.anyDown(['KeyA', 'ArrowLeft'])) ix -= 1;
    if (keys.anyDown(['KeyD', 'ArrowRight'])) ix += 1;
    if (keys.anyDown(['KeyW', 'ArrowUp'])) iy -= 1;
    if (keys.anyDown(['KeyS', 'ArrowDown'])) iy += 1;
    if (ix || iy) { P.path = null; P.walkTo = null; R.bot = R.bot && false; }
    else if (mouseHeld && R.mode === 'play') {
      P.repathT -= dt;
      var w = screenToWorld(ptr.x, ptr.y);
      if (P.repathT <= 0) { P.repathT = 0.2; P.path = findPath(P.x, P.y, w.x, w.y); P.pi = 0; P.walkTo = w; }
    }
    if (!ix && !iy && P.path && P.pi < P.path.length) {
      var p = P.path[P.pi], dx = p.x - P.x, dy = p.y - P.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 10) { P.pi++; if (P.pi >= P.path.length) { P.path = null; } }
      else { ix = dx / d; iy = dy / d; if (d < 40 && P.pi === P.path.length - 1) { ix *= d / 40; iy *= d / 40; } }
    }
    var L = Math.sqrt(ix * ix + iy * iy);
    if (L > 1) { ix /= L; iy /= L; }
    return { x: ix, y: iy };
  }
  function updatePlayer(dt) {
    var inp = R.bot ? botInput(dt) : playerInput(dt);
    var spd = speedP();
    var a = Math.min(1, dt * 16);
    P.vx += (inp.x * spd - P.vx) * a;
    P.vy += (inp.y * spd - P.vy) * a;
    moveCollide(P, P.vx * dt, P.vy * dt, 16);
    var v = Math.sqrt(P.vx * P.vx + P.vy * P.vy);
    var wasMoving = P.moving;
    P.moving = v > 30;
    if (P.moving) {
      P.phase += dt * (8 + v / 30);
      faceDir(P, P.vx, P.vy, dt);
      P.stepT -= dt; if (P.stepT <= 0) { P.stepT = 0.28; SFX.step(); if (Math.random() < 0.5) part(P.x + rnd(-8, 8), P.y - 2, { vx: rnd(-30, 30), vy: -rnd(10, 40), life: 0.4, size: 7, color: 'rgba(255,255,255,0.7)', g: 0 }); }
      R.idleT = 0;
    } else {
      R.idleT += dt;
      if (wasMoving) P.squash = 0.86;
    }
    P.squash += (1 - P.squash) * Math.min(1, dt * 12);
    P.sway += ((-P.vx / spd) * 0.5 - P.sway) * Math.min(1, dt * 6);
    P.blinkT -= dt; if (P.blinkT < -0.12) P.blinkT = rnd(2, 5);
    P.x = Math.max(30, Math.min(CM.W - 30, P.x));
    P.y = Math.max(150, Math.min(CM.ROAD_Y - 20, P.y));
    for (var i = 0; i < P.stack.length; i++) if (P.stack[i].f < 1) P.stack[i].f = Math.min(1, P.stack[i].f + dt * 4.5);
  }
  function moveCollide(e, mx, my, r) {
    e.x += mx; resolve(e, r);
    e.y += my; resolve(e, r);
  }
  function resolve(e, r) {
    for (var i = 0; i < R.rects.length; i++) {
      var q = R.rects[i];
      var cx = Math.max(q.x0, Math.min(e.x, q.x1)), cy = Math.max(q.y0, Math.min(e.y, q.y1));
      var dx = e.x - cx, dy = e.y - cy, dd = dx * dx + dy * dy;
      if (dd < r * r) {
        if (dd > 0.0001) { var d = Math.sqrt(dd); e.x = cx + dx / d * r; e.y = cy + dy / d * r; }
        else {
          var l = e.x - q.x0, rr = q.x1 - e.x, t = e.y - q.y0, b = q.y1 - e.y, m = Math.min(l, rr, t, b);
          if (m === l) e.x = q.x0 - r; else if (m === rr) e.x = q.x1 + r; else if (m === t) e.y = q.y0 - r; else e.y = q.y1 + r;
        }
      }
    }
  }

  function inShelfZone(s, x, y) { var d = s.d; return x > d.x - 75 - 46 && x < d.x + 75 + 46 && y > d.y - 23 - 50 && y < d.y + 23 + 46; }
  function shelfSlotPos(s, i) {
    var d = s.d, H = d.fridge ? 62 : 40;
    i = Math.max(0, Math.min(7, i));
    var col = i % 4, row = i < 4 ? 0 : 1;
    if (d.fridge) return { x: d.x - 52 + col * 35, y: d.y + 23 - H + 22 + row * 24 };
    return { x: d.x - 52 + col * 35, y: d.y - 23 - H + 18 + row * 22 };
  }
  function flashFull() {
    if (P.fullT > 0) return;
    P.fullT = 1.0;
    floatText(P.x, P.y - 110 - P.stack.length * 14, 'يداك ممتلئتان!', '#ff5d5d', 26);
    SFX.full();
  }

  function interact(dt) {
    if (P.fullT > 0) P.fullT -= dt;
    P.tick -= dt;
    var act = P.tick <= 0;
    if (act) P.tick = 0.075;
    var cap = carryCap();
    // coins
    R.registers.forEach(function (reg) {
      var pp = reg.d.pile;
      if (reg.pile > 0 && d2(P.x, P.y, pp.x, pp.y) < 75 * 75) collectPile(reg);
    });
    P.onDesk = !!(R.byId.desk && d2(P.x, P.y, R.byId.desk.x, R.byId.desk.y) < 48 * 48);
    if (!act) return;
    // shelves
    for (var i = 0; i < R.shelves.length; i++) {
      var s = R.shelves[i];
      if (!inShelfZone(s, P.x, P.y)) continue;
      var idx = topIndexOf(P.stack, s.item);
      if (idx >= 0 && s.count < s.cap) {
        var it = P.stack.splice(idx, 1)[0];
        giveTo(s, it.type, P.x, P.y - 84 - idx * 14);
        SFX.stock(s.count); R.lastAction = R.t;
        if (S.tut === 1) setTut(2);
        return;
      }
    }
    // machines
    for (var j = 0; j < R.machines.length; j++) {
      var m = R.machines[j];
      if (d2(P.x, P.y, m.inMat.x, m.inMat.y) < 52 * 52) {
        var ii = topIndexOf(P.stack, m.d.input);
        if (ii >= 0 && m.inCount < m.cap) { var it2 = P.stack.splice(ii, 1)[0]; giveTo(m, it2.type, P.x, P.y - 84 - ii * 14); SFX.stock(m.inCount); R.lastAction = R.t; return; }
      }
      if (d2(P.x, P.y, m.outMat.x, m.outMat.y) < 52 * 52 && m.outCount > 0) {
        if (P.stack.length >= cap) { flashFull(); }
        else { m.outCount--; pushStack(m.d.output, m.outMat.x, m.outMat.y - 30); return; }
      }
    }
    // producers
    for (var k = 0; k < R.producers.length; k++) {
      var pr = R.producers[k], best = null, bd = pr.pickR * pr.pickR;
      for (var q = 0; q < pr.spots.length; q++) {
        var sp = pr.spots[q];
        if (sp.g < 1) continue;
        var dd = d2(P.x, P.y, sp.x, sp.y);
        if (dd < bd) { bd = dd; best = sp; }
      }
      if (best) {
        if (P.stack.length >= cap) { flashFull(); break; }
        harvest(best);
        pushStack(pr.item, best.x, best.y - 30);
        if (S.tut === 0 && P.stack.length >= Math.min(cap, 2)) setTut(1);
        return;
      }
    }
    // trash
    var tr = R.byId.trash;
    if (tr && P.stack.length && d2(P.x, P.y, tr.x, tr.y) < 58 * 58) {
      var t0 = P.stack.pop();
      fly('item', t0.type, P.x, P.y - 84 - P.stack.length * 14, { x: tr.x, y: tr.y - 30 }, 0.3, 60, 28, function () {
        tr.lid = 0.3; burst(tr.x, tr.y - 36, 6, { speed: 140, up: 100, life: 0.4, colors: ['#9bd88a', '#ffffff'] });
      });
      SFX.trash();
    }
  }
  function pushStack(type, fx, fy) {
    P.stack.push({ type: type, f: 0, fx: fx, fy: fy });
    SFX.pick(P.stack.length);
    R.lastAction = R.t;
    P.squash = 0.9;
  }

  function collectPile(reg) {
    var v = Math.floor(reg.pile);
    if (v <= 0) return;
    reg.pile -= v;
    S.coins += v; S.stats.earned += v;
    var n = Math.min(14, 3 + Math.floor(v / 6));
    var sp = worldToScreen(reg.d.pile.x, reg.d.pile.y - 10);
    for (var i = 0; i < n; i++) {
      (function (i) {
        fly('coin', null, sp.x + rnd(-20, 20), sp.y + rnd(-14, 6), { x: 50, y: 42 }, 0.5 + i * 0.035, rnd(60, 140), 26, function () { R.coinBump = 1; }, true);
      })(i);
    }
    SFX.coins(n);
    floatText(reg.d.pile.x, reg.d.pile.y - 50, '+' + K.fmt(v), '#ffe14a', 34);
    R.lastAction = R.t;
    if (S.tut === 3) setTut(4);
  }

  /* ---------- pads */
  function updatePads(dt) {
    var on = null;
    R.pads.forEach(function (p) {
      p.pop = Math.min(1, (p.pop || 0) + dt * 2.5);
      if (d2(P.x, P.y, p.x, p.y) < 50 * 50) on = p;
    });
    if (on !== P.pad) { P.pad = on; P.padT = 0; }
    if (!on) return;
    P.padT += dt;
    if (P.padT < 0.25) return;
    var remain = on.d.cost - on.paid;
    if (S.coins < 1) {
      if (P.padT > 0.3 && !on.warned) { on.warned = true; floatText(on.x, on.y - 70, 'تحتاج عملات أكثر!', '#ffd23f', 24); SFX.no(); }
      return;
    }
    on.warned = false;
    var rate = Math.max(on.d.cost / 1.3, 30);
    on.acc += rate * dt;
    var amt = Math.min(Math.floor(on.acc), remain, Math.floor(S.coins));
    if (amt > 0) {
      on.acc -= amt;
      S.coins -= amt; on.paid += amt; S.paid[on.d.id] = on.paid;
      P.coinT -= dt;
      if (P.coinT <= 0) {
        P.coinT = 0.04;
        fly('coin', null, P.x + rnd(-8, 8), P.y - 70, { x: on.x + rnd(-10, 10), y: on.y - 6 }, 0.28, 50, 22, null);
      }
      P.payTickT -= dt;
      if (P.payTickT <= 0) { P.payTickT = 0.06; SFX.pay(on.paid / on.d.cost); }
      R.lastAction = R.t;
    }
    if (on.paid >= on.d.cost) doUnlock(on.d);
  }

  var ULOG = [];
  function doUnlock(d) {
    ULOG.push(Math.round(S.stats.play) + ':' + d.id);
    S.un[d.id] = true; delete S.paid[d.id];
    var o = buildObj(d, true);
    rebuildStatic();
    // push the player out of any new solid object
    resolve(P, 16);
    confetti(d.x, d.y - 40, 70);
    burst(d.x, d.y - 20, 20, { speed: 300, up: 100, life: 0.7, size: 12, colors: ['#ffffff', '#ffe14a'], g: 300, shape: 'star' });
    R.shake.add(9);
    SFX.unlock();
    var sub = { field: 'امشِ إلى المحاصيل الناضجة لتقطفها', shelf: 'املأه لتبيع ' + (d.item ? ITEMS[d.item].al : ''), machine: 'أحضر ' + (d.input ? ITEMS[d.input].al : '') + ' لتصنع ' + (d.output ? ITEMS[d.output].al : ''),
      coop: 'الدجاجات تضع البيض في الأعشاش', pen: 'خذ الحليب الطازج من الصندوق', orchard: 'التفاح ينمو على الأشجار', decor: 'الزبائن يدفعون ' + Math.round((d.bonus || 0) * 100) + '% أكثر!',
      hire: d.role === 'farmer' ? 'المزارع يقطف ويملأ الرفوف عنك' : 'الكاشير يبيع للزبائن عنك', expand: 'غرفة جديدة كاملة!', desk: 'اشترِ التطويرات من هنا', register: 'ومعه كاشير خاص!' }[d.kind] || '';
    banner(d.name.replace(/!$/, '') + '!', sub, '#ffd23f', 2.6);
    if (d.kind === 'hire' || d.helper) SFX.hire();
    if (d.id === 'cornField' && S.tut < 5) setTut(5);
    if (d.id === 'cornShelf') setTut(6);
    checkLevel();
    if (d.final) { R.finaleT = 2.2; }
    saveGame();
    return o;
  }
  function checkLevel() {
    var lvl = levelFor(unlockedCount());
    if (lvl > R.lvl) {
      R.lvl = lvl;
      setTimeout(function () {
        var hat = null;
        CM.HATS.forEach(function (h) { if (h.lvl === lvl && lvl > META.maxLvl) hat = h; });
        banner('مستوى السوق ' + lvl + '!', hat ? 'قبعة جديدة: ' + hat.name + '!' : 'زبائن جدد في الطريق!', '#7ef0ff', 3);
        SFX.level();
        confetti(P.x, P.y - 80, 50);
        if (lvl > META.maxLvl) { META.maxLvl = lvl; saveMeta(); }
      }, 900);
    }
    R.lvl = lvl; S.lvl = lvl;
  }

  function buyUpgrade(id) {
    var u = UPG[id]; if (!u) return false;
    var l = lv(id);
    if (u.needs && !isUnlocked(u.needs)) { SFX.no(); return false; }
    if (l >= u.costs.length) { SFX.no(); return false; }
    var c = u.costs[l];
    if (S.coins < c) { SFX.no(); floatText(P.x, P.y - 120, 'تحتاج ' + K.fmt(c) + ' ' + coinWord(c), '#ffd23f', 24); return false; }
    S.coins -= c; S.up[id] = l + 1;
    SFX.upgrade();
    burst(P.x, P.y - 40, 26, { speed: 300, up: 150, life: 0.8, size: 9, colors: ['#7ef0ff', '#ffe14a', '#ffffff'], shape: 'star', g: 300 });
    floatText(P.x, P.y - 120, u.name + ' ' + (l + 2) + '!', '#7ef0ff', 28);
    R.shake.add(4);
    renderUpgrades(true);
    saveGame();
    return true;
  }

  /* ========================================================= tutorial + hints */
  function setTut(n) {
    if (n <= S.tut) return;
    S.tut = n;
    if (n === 2 && !R.firstCust) { R.firstCust = true; spawnCustomer(true); R.spawnT = 7; }
  }
  var TUT_TEXT = ['امشِ إلى أشجار الموز لتقطف الموز!', 'احمل الموز إلى رف الموز!', 'زبون قادم! قف عند صندوق الدفع لتبيع.', 'امشِ فوق العملات لتجمعها!', ''];
  function computeHint() {
    var h = null;
    var cashierSpot = function (reg) { return { x: reg.d.cashier.x, y: reg.d.cashier.y }; };
    var reg1 = R.byId.register1;
    if (S.tut === 0) { var bf = R.byId.bananaField; h = { text: TUT_TEXT[0], x: bf.x, y: bf.y - 20, icon: 'banana' }; }
    else if (S.tut === 1) { var bs = R.byId.bananaShelf; h = { text: P.stack.length ? TUT_TEXT[1] : 'اقطف بعض الموز أولًا!', x: P.stack.length ? bs.x : R.byId.bananaField.x, y: P.stack.length ? bs.y - 30 : R.byId.bananaField.y, icon: 'banana' }; }
    else if (S.tut === 2) {
      var anyQ = reg1.queue.length > 0;
      if (reg1.pile > 0) { setTut(3); }
      h = { text: anyQ ? 'قف عند صندوق الدفع لتبيع!' : TUT_TEXT[2], x: reg1.d.cashier.x, y: reg1.d.cashier.y, icon: 'register' };
      if (!anyQ && P.stack.length && shelfFor('banana').count < 8) h = { text: 'ضع موزًا أكثر على الرف وأنت تنتظر!', x: R.byId.bananaShelf.x, y: R.byId.bananaShelf.y - 30, icon: 'banana' };
    }
    if (S.tut === 3) { h = { text: TUT_TEXT[3], x: reg1.d.pile.x, y: reg1.d.pile.y, icon: 'coin' }; if (reg1.pile <= 0 && S.coins > 0) setTut(4); }
    if (h) return h;
    // generic hints
    for (var i = 0; i < R.registers.length; i++) {
      var r = R.registers[i];
      if (r.queue.length && r.queue[0].arrived && !(r.helper && r.helper.atPost) && r.queue[0].wait > (S.tut < 5 ? 0 : 4)) return { text: 'الزبائن ينتظرون الدفع!', x: cashierSpot(r).x, y: cashierSpot(r).y, icon: 'register', urgent: true };
    }
    var cheapest = null;
    R.pads.forEach(function (p) { if (!cheapest || p.d.cost - p.paid < cheapest.d.cost - cheapest.paid) cheapest = p; });
    if (cheapest && S.coins >= cheapest.d.cost - cheapest.paid) return { text: 'تستطيع أن تفتح: ' + cheapest.d.name.replace(/!$/, '') + '!', x: cheapest.x, y: cheapest.y, icon: 'star', pad: true };
    for (var j = 0; j < R.registers.length; j++) { var rg = R.registers[j]; if (rg.pile >= 20 || (S.tut < 6 && rg.pile > 0)) return { text: 'اجمع عملاتك!', x: rg.d.pile.x, y: rg.d.pile.y, icon: 'coin' }; }
    if (P.stack.length) {
      var type = P.stack[P.stack.length - 1].type, dst = null;
      R.shelves.forEach(function (s) { if (!dst && s.item === type && s.count < s.cap) dst = s; });
      R.machines.forEach(function (m) { if (!dst && m.d.input === type && m.inCount < m.cap) dst = m; });
      if (dst) { var dp = dst.kind === 'machine' ? dst.inMat : { x: dst.x, y: dst.y - 30 }; return { text: dst.kind === 'machine' ? 'ضع ' + ITEMS[type].al + ' في ' + dst.d.name + '!' : 'املأ ' + dst.d.name + '!', x: dp.x, y: dp.y, icon: type }; }
    }
    // an empty shelf that customers want
    var want = null;
    R.shelves.forEach(function (s) { var w = 0; s.slots.forEach(function (sl) { w += sl.n; }); if (s.count === 0 && w > 0 && !want) want = s; });
    if (want) {
      var srcs = sourcesFor(want.item), src = null;
      srcs.forEach(function (sr) { if (!src || availAt(sr) > availAt(src)) src = sr; });
      if (src) {
        var sp = srcPoint(src);
        if (src.kind === 'machine' && src.outCount === 0) { sp = src.inMat; return { text: 'لتصنع ' + ITEMS[want.item].al + ': أحضر ' + ITEMS[src.d.input].al + ' إلى ' + src.d.name + '!', x: sp.x, y: sp.y, icon: src.d.input }; }
        return { text: 'زبون يريد ' + ITEMS[want.item].al + '!', x: sp.x, y: sp.y - 10, icon: want.item };
      }
    }
    if (cheapest) return { text: 'اجمع ' + K.fmt(cheapest.d.cost - cheapest.paid) + ' ' + coinWord(cheapest.d.cost - cheapest.paid) + ' لتفتح: ' + cheapest.d.name.replace(/!$/, ''), x: cheapest.x, y: cheapest.y, icon: 'star', soft: true };
    return null;
  }

  /* ========================================================= update */
  function updateProducers(dt) {
    var gm = growMult();
    R.producers.forEach(function (o) {
      if (o.pop < 5) o.pop += dt;
      var rate = gm / o.grow;
      o.spots.forEach(function (s) {
        if (s.pop < 5) s.pop += dt;
        if (s.bump > 0) s.bump -= dt;
        if (s.g < 1) {
          s.g += rate * dt * (0.9 + 0.2 * ((s.seed * 7) % 1));
          if (s.g >= 1) { s.g = 1; s.bump = 0.3; if ((o.kind === 'coop' || o.kind === 'pen') && d2(P.x, P.y, s.x, s.y) < 500 * 500) tone({ freq: 900, to: 1300, type: 'sine', dur: 0.06, vol: 0.05 }); }
        }
      });
      if (o.kind === 'pen') { var cw = o.cow; cw.t += dt; cw.x += cw.dir * dt * 14; if (Math.abs(cw.x) > 55) { cw.dir *= -1; cw.x = Math.max(-55, Math.min(55, cw.x)); } }
    });
    // chickens that wander in front of the coop
    var coop = R.byId.coop;
    if (coop && R.chicks.length === 0) for (var i = 0; i < 3; i++) R.chicks.push({ k: 'chick', x: coop.x + rnd(-80, 80), y: coop.y + rnd(130, 170), tx: 0, ty: 0, t: 0, peck: 0, dy: 0, look: 1 });
    R.chicks.forEach(function (c) {
      c.t -= dt;
      if (c.t <= 0) { c.t = rnd(1, 3); c.tx = coop.x + rnd(-100, 100); c.ty = coop.y + rnd(125, 175); c.peck = Math.random() < 0.4 ? 1 : 0; }
      var dx = c.tx - c.x, dy = c.ty - c.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 3 && !c.peck) { c.x += dx / d * 40 * dt; c.y += dy / d * 40 * dt; c.look = dx > 0 ? 1 : -1; c.moving = true; } else c.moving = false;
      c.dy = c.y;
    });
  }
  function updateMachines(dt) {
    var gm = growMult();
    R.machines.forEach(function (m) {
      if (m.pop < 5) m.pop += dt;
      if (m.bump > 0) m.bump -= dt;
      m.working = m.inCount > 0 && m.outCount < m.cap;
      if (m.working) {
        m.prog += dt * gm / m.d.time;
        if (Math.random() < dt * 6) part(m.x + 40 + rnd(-6, 6), m.y - 120, { vx: rnd(-15, 15), vy: -rnd(40, 70), life: 0.9, size: rnd(8, 14), color: 'rgba(255,255,255,0.8)', g: -20 });
        if (m.prog >= 1) {
          m.prog = 0; m.inCount--; m.outCount++;
          m.bump = 0.25;
          burst(m.outMat.x, m.outMat.y - 40, 6, { speed: 150, up: 80, life: 0.45, size: 7, colors: ['#ffffff', '#ffe14a'], shape: 'star' });
          if (d2(P.x, P.y, m.x, m.y) < 600 * 600) tone({ freq: 700, to: 1400, type: 'sine', dur: 0.08, vol: 0.07 });
        }
      } else m.prog = Math.max(0, m.prog - dt * 0.2);
    });
  }
  function updateRegisters(dt) {
    R.registers.forEach(function (reg) {
      if (reg.pop < 5) reg.pop += dt;
      if (reg.scan > 0) reg.scan -= dt;
      if (reg.ching > 0) reg.ching -= dt;
      reg.pileVis += (reg.pile - reg.pileVis) * Math.min(1, dt * 6);
      var playerHere = d2(P.x, P.y, reg.d.cashier.x, reg.d.cashier.y) < 62 * 62;
      var helperHere = reg.helper && reg.helper.atPost;
      reg.manned = playerHere || helperHere;
      var c = reg.queue[0];
      if (!c || !c.arrived || c.qi !== 0) { reg.serveT = 0.15; return; }
      if (!reg.manned) return;
      c.state = 'paying';
      reg.serveT -= dt;
      if (reg.serveT > 0) return;
      if (c.basket.length) {
        var it = c.basket.pop();
        c.paid += priceOf(it) * (R.rush > 0 ? 1.5 : 1);
        fly('item', it, c.x, c.y - 30, { x: reg.x - 40, y: reg.y - 50 }, 0.2, 30, 24, null);
        SFX.beep(); reg.scan = 0.12;
        reg.serveT = playerHere ? 0.14 : 0.42 / helperMult();
      } else {
        var value = Math.max(1, Math.round(c.paid));
        reg.pile += value;
        reg.ching = 0.5;
        R.income += value;
        S.stats.served++;
        SFX.ching();
        floatText(reg.x - 30, reg.y - 90, '+' + value, '#ffe14a', 30);
        var n = Math.min(10, 2 + Math.floor(value / 5));
        for (var i = 0; i < n; i++) fly('coin', null, reg.x - 40, reg.y - 60, { x: reg.d.pile.x + rnd(-14, 14), y: reg.d.pile.y - rnd(0, 10) }, 0.35 + i * 0.04, rnd(50, 90), 20, null);
        c.mood = Math.min(1, c.mood + 0.5);
        if (playerHere) praiseSale(reg);
        burst(c.x, c.y - 110, 1, { speed: 10, up: 60, life: 1.0, size: 22, color: '#ff5d8f', g: -30, shape: 'heart' });
        SFX.happy();
        reg.queue.shift();
        c.basket.length = 0;
        leave(c);
        reg.serveT = 0.3;
        if (S.tut === 2) setTut(3);
      }
    });
  }

  // Serving customers back to back at the checkout builds a little combo with praise words.
  var PRAISE = [['رائع!', '#7ef0ff'], ['ممتاز!', '#3ddc84'], ['مذهل!', '#ff8fbf'], ['خارق!', '#ffd23f']];
  function praiseSale(reg) {
    R.combo = (R.t - (R.lastSale || -99) < 4.5) ? (R.combo || 0) + 1 : 1;
    R.lastSale = R.t;
    if (R.combo < 2) return;
    var pr = PRAISE[Math.min(PRAISE.length - 1, R.combo - 2)];
    var old = TEXTS.indexOf(R.praiseTxt); if (old >= 0) TEXTS.splice(old, 1);
    floatText(reg.x + 125, reg.y - 105, pr[0], pr[1], 30 + Math.min(4, R.combo) * 3);
    R.praiseTxt = TEXTS[TEXTS.length - 1];
    var f = 660 * Math.pow(1.12, Math.min(8, R.combo));
    tone({ freq: f, to: f * 1.5, type: 'triangle', dur: 0.12, vol: 0.12, delay: 0.25 });
    if (R.combo >= 4) { R.shake.add(3); burst(reg.x + 125, reg.y - 105, 10, { speed: 220, up: 80, life: 0.6, size: 9, colors: CONF, g: 300, shape: 'star' }); }
  }

  function spawnLogic(dt) {
    if (S.tut < 2) return;
    var nS = R.shelves.length;
    var custs = 0; R.npcs.forEach(function (n) { if (n.type === 'cust') custs++; });
    var maxC = Math.min(18, 3 + Math.ceil(nS * 1.2) + lv('fame') * 2 + (R.rush > 0 ? 4 : 0));
    var interval = Math.max(1.2, 4.6 - nS * 0.33) / (1 + 0.22 * lv('fame')) * (R.rush > 0 ? 0.4 : 1);
    if (S.tut < 5) { interval = 3.2; maxC = 3; }
    R.spawnT -= dt;
    if (R.spawnT <= 0 && custs < maxC) { R.spawnT = interval * rnd(0.7, 1.3); spawnCustomer(false); }
    // rush hour
    if (R.lvl >= 3) {
      if (R.rush > 0) { R.rush -= dt; if (R.rush <= 0) { R.rushT = rnd(150, 210); banner('انتهت الزحمة', 'أحسنت! عمل رائع!', '#ffffff', 2); } }
      else { R.rushT -= dt; if (R.rushT <= 0) { R.rush = 25; banner('وقت الزحمة!', 'زبائن كثيرون يدفعون 50% زيادة!', '#ff7a59', 3); SFX.rush(); R.shake.add(5); } }
    }
  }

  function step(dt) {
    R.t += dt;
    S.stats.play += dt;
    updatePlayer(dt);
    interact(dt);
    updatePads(dt);
    updateProducers(dt);
    updateMachines(dt);
    updateRegisters(dt);
    spawnLogic(dt);
    for (var i = R.npcs.length - 1; i >= 0; i--) {
      var n = R.npcs[i];
      if (n.blinkT !== undefined) { n.blinkT -= dt; if (n.blinkT < -0.12) n.blinkT = rnd(2, 5); }
      if (n.type === 'cust') updateCustomer(n, dt); else updateHelper(n, dt);
      if (n.dead) R.npcs.splice(i, 1);
      else if (n.stack) for (var j = 0; j < n.stack.length; j++) if (n.stack[j].f < 1) n.stack[j].f = Math.min(1, n.stack[j].f + dt * 4.5);
    }
    R.objs.forEach(function (o) { if (o.pop < 5) o.pop += dt; if (o.bump > 0) o.bump -= dt; if (o.lid > 0) o.lid -= dt; });
    R.pads.forEach(function (p) { p.fill += ((p.paid / p.d.cost) - p.fill) * Math.min(1, dt * 10); });
    // income rate for offline earnings
    R.incomeT += dt;
    if (R.incomeT >= 10) { S.rate = S.rate * 0.85 + (R.income / R.incomeT) * 0.15; R.income = 0; R.incomeT = 0; }
    R.saveT += dt;
    if (R.saveT > 3) { R.saveT = 0; saveGame(); }
    if (R.finaleT > 0) { R.finaleT -= dt; if (R.finaleT <= 0) showFinale(); }
  }

  function updateFx(dt) {
    for (var i = PARTS.length - 1; i >= 0; i--) {
      var p = PARTS[i];
      p.life -= dt;
      if (p.life <= 0) { PARTS.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.shape === 'conf') { p.vx *= 0.985; p.vy = Math.min(p.vy, 160); }
    }
    for (var j = FLY.length - 1; j >= 0; j--) {
      var f = FLY[j];
      f.t += dt / f.dur;
      var tp = tgtPos(f), e = Math.min(1, f.t), ee = e * e * (3 - 2 * e);
      f.x = f.x0 + (tp.x - f.x0) * ee; f.y = f.y0 + (tp.y - f.y0) * ee - Math.sin(e * Math.PI) * f.h;
      if (f.t >= 1) { FLY.splice(j, 1); if (f.done) f.done(); }
    }
    for (var k = TEXTS.length - 1; k >= 0; k--) { var tx = TEXTS[k]; tx.t += dt; if (tx.t > tx.life) TEXTS.splice(k, 1); }
    for (var b = R.banners.length - 1; b >= 0; b--) { R.banners[b].t += dt; if (R.banners[b].t > R.banners[b].life) R.banners.splice(b, 1); }
    while (R.banners.length < 2 && BQ.length) R.banners.push(BQ.shift());
    R.shake.update(dt);
    if (R.coinBump > 0) R.coinBump = Math.max(0, R.coinBump - dt * 4);
    R.disp += (S.coins - R.disp) * Math.min(1, dt * 8);
    if (Math.abs(S.coins - R.disp) < 0.5) R.disp = S.coins;
  }

  function camUpdate(dt, follow) {
    var hw = VW / 2 / ZOOM, hh = VH / 2 / ZOOM;
    var tx, ty;
    if (follow) { tx = P.x + P.vx * 0.25; ty = P.y - 40 + P.vy * 0.2; }
    else { tx = 1250 + Math.sin(R.t * 0.12) * 500; ty = 1250 + Math.sin(R.t * 0.09) * 260; }
    var k = Math.min(1, dt * (follow ? 5 : 1.5));
    R.cam.x += (tx - R.cam.x) * k; R.cam.y += (ty - R.cam.y) * k;
    R.cam.x = Math.max(hw, Math.min(CM.W - hw, R.cam.x));
    R.cam.y = Math.max(hh + 60, Math.min(CM.H - hh, R.cam.y));
  }

  var mouseHeld = false;
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    mouseHeld = true; P.repathT = 0;
  });
  window.addEventListener('pointerup', function () { mouseHeld = false; });
  window.addEventListener('blur', function () { mouseHeld = false; });

  function update(dt) {
    if (DBG.noUpdate) return;
    var keys = K.keys;
    if (R.mode === 'title') {
      if (keys.anyPressed(['Enter', 'Space', 'NumpadEnter'])) startPlay();
      R.t += dt; camUpdate(dt, false);
      updateProducersIdle(dt);
      updateFx(dt);
    } else if (R.mode === 'play') {
      if (keys.anyPressed(['KeyP', 'Escape'])) { pauseGame(); keys.endFrame(); return; }
      if (P.onDesk) {
        for (var i = 0; i < CM.UPGRADES.length; i++) if (keys.pressed('Digit' + (i + 1)) || keys.pressed('Numpad' + (i + 1))) buyUpgrade(CM.UPGRADES[i].id);
      }
      var n = R.timeScale;
      for (var s = 0; s < n; s++) { step(dt); if (s < n - 1) updateFx(dt); }
      updateFx(dt);
      camUpdate(dt, true);
      R.hintT -= dt;
      if (R.hintT <= 0) { R.hintT = 0.25; R.hint = computeHint(); }
      renderUpgrades(false);
      musicTick();
    } else if (R.mode === 'pause' || R.mode === 'confirm') {
      if (keys.anyPressed(['KeyP', 'Escape']) && R.mode === 'pause') resumeGame();
      else if (keys.anyPressed(['Enter', 'Space']) && R.mode === 'pause') resumeGame();
    } else if (R.mode === 'welcome') {
      if (keys.anyPressed(['Enter', 'Space'])) closeWelcome();
      updateFx(dt);
    } else if (R.mode === 'finale') {
      updateFx(dt);
      if (Math.random() < dt * 3) confetti(R.cam.x + rnd(-500, 500), R.cam.y - 300, 20);
      if (keys.anyPressed(['Enter', 'Space'])) closeFinale();
      else if (keys.pressed('KeyR')) askNewStore();
    }
    keys.endFrame();
    ptr.endFrame();
  }
  function updateProducersIdle(dt) {
    R.producers.forEach(function (o) { if (o.kind === 'pen') { var cw = o.cow; cw.t += dt; cw.x += cw.dir * dt * 14; if (Math.abs(cw.x) > 55) cw.dir *= -1; } });
  }

  /* ========================================================= rendering */
  function worldToScreen(x, y) { return { x: (x - R.cam.x) * ZOOM + VW / 2, y: (y - R.cam.y) * ZOOM + VH / 2 }; }
  function screenToWorld(x, y) { return { x: (x - VW / 2) / ZOOM + R.cam.x, y: (y - VH / 2) / ZOOM + R.cam.y }; }

  var VR = { x0: 0, y0: 0, x1: 0, y1: 0 };
  var DBG = {};
  function render() {
    if (DBG.noRender) return;
    var c = ctx;
    c.save();
    c.fillStyle = '#8fd46a'; c.fillRect(0, 0, VW, VH);
    c.translate(VW / 2 + R.shake.x, VH / 2 + R.shake.y);
    c.scale(ZOOM, ZOOM);
    c.translate(-R.cam.x, -R.cam.y);
    VR.x0 = R.cam.x - VW / 2 / ZOOM - 20; VR.x1 = R.cam.x + VW / 2 / ZOOM + 20;
    VR.y0 = R.cam.y - VH / 2 / ZOOM - 20; VR.y1 = R.cam.y + VH / 2 / ZOOM + 20;
    c.lineJoin = 'round'; c.lineCap = 'round';
    if (!DBG.noGround) drawGround(c);
    if (!DBG.noMats) drawMats(c);
    R.pads.forEach(function (p) { if (inView(p.x, p.y, 200)) drawPad(c, p); });
    if (R.mode === 'play') drawFootArrow(c);
    if (!DBG.noSorted) drawSorted(c);
    if (!DBG.noOver) drawWorldOverlay(c);
    c.restore();
    drawScreenFx(c);
    if (R.mode !== 'title' && !DBG.noHud) drawHUD(c);
  }
  function inView(x, y, m) { return x > VR.x0 - m && x < VR.x1 + m && y > VR.y0 - m && y < VR.y1 + m; }

  /* ---------- ground (static part cached in chunks) */
  var GC = { size: 400, scale: 0, map: {}, n: 0, tick: 0 };
  function groundInvalidate() { GC.map = {}; GC.n = 0; }
  function evictChunks() {
    for (var k in GC.map) if (GC.tick - GC.map[k].used > 30) { delete GC.map[k]; GC.n--; }
    if (GC.n > 40) groundInvalidate();
  }
  function drawGround(c) {
    var eff = Math.min(2.4, ZOOM * view.scale * view.dpr);
    if (Math.abs(eff - GC.scale) > 0.01) { GC.scale = eff; groundInvalidate(); }
    var S0 = GC.size, cx0 = Math.floor(VR.x0 / S0), cx1 = Math.floor(VR.x1 / S0), cy0 = Math.floor(VR.y0 / S0), cy1 = Math.floor(VR.y1 / S0);
    GC.tick++;
    var budget = 2;
    for (var cy = cy0; cy <= cy1; cy++) for (var cx = cx0; cx <= cx1; cx++) {
      var key = cx + ',' + cy, ch = GC.map[key];
      if (!ch) {
        if (budget <= 0) {
          // not cached yet: draw this piece directly this frame
          var sv = [VR.x0, VR.y0, VR.x1, VR.y1];
          VR.x0 = Math.max(sv[0], cx * S0 - 1); VR.y0 = Math.max(sv[1], cy * S0 - 1); VR.x1 = Math.min(sv[2], (cx + 1) * S0 + 1); VR.y1 = Math.min(sv[3], (cy + 1) * S0 + 1);
          c.save(); c.beginPath(); c.rect(VR.x0, VR.y0, VR.x1 - VR.x0, VR.y1 - VR.y0); c.clip();
          drawGroundStatic(c);
          c.restore();
          VR.x0 = sv[0]; VR.y0 = sv[1]; VR.x1 = sv[2]; VR.y1 = sv[3];
          continue;
        }
        budget--;
        if (GC.n > 40) evictChunks();
        ch = GC.map[key] = { cv: makeChunk(cx, cy, eff), used: 0 }; GC.n++;
      }
      ch.used = GC.tick;
      c.drawImage(ch.cv, 0, 0, ch.cv.width, ch.cv.height, cx * S0, cy * S0, ch.cv.width / eff, ch.cv.height / eff);
    }
    // live bits on top of the cached ground
    if (R.decor.rug) { var rp = popScale(R.decor.rug); c.save(); c.translate(1250, 1190); c.scale(rp, rp); drawRug(c); c.restore(); }
    R.pads.forEach(function (p) { if (p.d.kind === 'field') drawSoil(c, p.d, 0); });
  }
  function makeChunk(cx, cy, eff) {
    var S0 = GC.size, cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(S0 * eff) + 2;
    var g = cv.getContext('2d');
    g.scale(eff, eff); g.translate(-cx * S0, -cy * S0);
    g.lineJoin = 'round'; g.lineCap = 'round';
    var sv = [VR.x0, VR.y0, VR.x1, VR.y1];
    VR.x0 = cx * S0 - 4; VR.y0 = cy * S0 - 4; VR.x1 = (cx + 1) * S0 + 8; VR.y1 = (cy + 1) * S0 + 8;
    drawGroundStatic(g);
    VR.x0 = sv[0]; VR.y0 = sv[1]; VR.x1 = sv[2]; VR.y1 = sv[3];
    return cv;
  }
  function drawGroundStatic(c) {
    var x0 = VR.x0, y0 = VR.y0, x1 = VR.x1, y1 = VR.y1;
    c.fillStyle = '#8fd46a'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    c.fillStyle = '#99da73';
    for (var sx = Math.floor(x0 / 160) * 160; sx < x1; sx += 160) c.fillRect(sx, y0, 80, y1 - y0);
    // tufts and flowers
    var cs = 70;
    for (var gy = Math.floor(y0 / cs); gy * cs < y1; gy++) for (var gx = Math.floor(x0 / cs); gx * cs < x1; gx++) {
      var h = hash(gx, gy); if (h > 0.22 && h < 0.93) continue;
      var px = gx * cs + hash(gy, gx) * 50, py = gy * cs + hash(gx + 3, gy) * 50;
      if (h <= 0.22) { c.strokeStyle = '#6fbf4f'; c.lineWidth = 3; c.beginPath(); c.moveTo(px - 5, py); c.lineTo(px - 7, py - 8); c.moveTo(px, py); c.lineTo(px, py - 11); c.moveTo(px + 5, py); c.lineTo(px + 7, py - 8); c.stroke(); }
      else { var fc = ['#ffffff', '#ffd23f', '#ff8fbf', '#b69cff'][(h * 97 | 0) % 4]; for (var k = 0; k < 5; k++) { A.circ(c, px + Math.cos(k * 1.256) * 4, py + Math.sin(k * 1.256) * 4, 3); c.fillStyle = fc; c.fill(); } A.circ(c, px, py, 2.5); c.fillStyle = '#ffb020'; c.fill(); }
    }
    var H = CM.HALL, Wg = CM.WING;
    // dirt paths
    c.fillStyle = '#e8cf9f';
    A.rr(c, 120, 1128, 700, 64, 30); c.fill();
    A.rr(c, 1188, 700, 124, 180, 30); c.fill();
    A.rr(c, 280, 720, 1500, 70, 34); c.fill();
    A.rr(c, 640, 1150, 70, 520, 30); c.fill();
    // front plaza, sidewalk, road
    c.fillStyle = '#efe2c8'; c.fillRect(H.x0 - 40, CM.YARD_Y, (R.expanded ? Wg.x1 : H.x1) - H.x0 + 80, CM.WALK_Y - CM.YARD_Y);
    c.fillStyle = '#e3d3b4'; c.fillRect(1180, CM.YARD_Y, 140, CM.WALK_Y - CM.YARD_Y);
    c.strokeStyle = 'rgba(160,130,90,0.25)'; c.lineWidth = 2;
    c.beginPath();
    for (var tx = H.x0 - 40; tx < (R.expanded ? Wg.x1 : H.x1) + 40; tx += 80) { c.moveTo(tx, CM.YARD_Y); c.lineTo(tx, CM.WALK_Y); }
    c.stroke();
    c.fillStyle = '#d8d3cb'; c.fillRect(x0, CM.WALK_Y, x1 - x0, CM.ROAD_Y - CM.WALK_Y);
    c.fillStyle = '#c2bcb2'; c.fillRect(x0, CM.WALK_Y, x1 - x0, 6);
    c.strokeStyle = 'rgba(0,0,0,0.1)'; c.beginPath();
    for (var sw = Math.floor(x0 / 70) * 70; sw < x1; sw += 70) { c.moveTo(sw, CM.WALK_Y); c.lineTo(sw, CM.ROAD_Y); } c.stroke();
    c.fillStyle = '#9aa0ae'; c.fillRect(x0, CM.ROAD_Y, x1 - x0, 10);
    c.fillStyle = '#5d6275'; c.fillRect(x0, CM.ROAD_Y + 10, x1 - x0, CM.H - CM.ROAD_Y);
    c.fillStyle = '#ffd23f';
    for (var rx = Math.floor(x0 / 120) * 120; rx < x1; rx += 120) c.fillRect(rx, CM.ROAD_Y + 72, 60, 8);
    // store floors
    drawFloor(c, H.x0, H.y0, H.x1, H.y1, '#fff1d6', '#ffe4bd');
    if (R.expanded) drawFloor(c, Wg.x0, Wg.y0, Wg.x1, Wg.y1, '#e6f7ef', '#d2efe2');
    // doormat
    c.fillStyle = '#e07a5f'; A.rr(c, 1196, 1700, 108, 50, 8); c.fill();
    c.strokeStyle = '#c45f45'; c.lineWidth = 3; c.stroke();
    // fields soil
    R.producers.forEach(function (o) {
      if (o.kind === 'field') drawSoil(c, o.d, 1);
      else if (o.kind === 'coop') { A.ell(c, o.x, o.y + 110, 160, 70); c.fillStyle = '#dcc08e'; c.fill(); }
      else if (o.kind === 'orchard') { o.spots.forEach(function (s) { A.ell(c, s.x, s.y + 4, 62, 22); c.fillStyle = 'rgba(60,120,40,0.28)'; c.fill(); }); }
    });
  }
  function drawFloor(c, x0, y0, x1, y1, a, b) {
    c.fillStyle = a; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    c.fillStyle = b;
    var ts = 60;
    var sx = Math.max(x0, Math.floor(VR.x0 / ts) * ts), ex = Math.min(x1, VR.x1), sy = Math.max(y0, Math.floor(VR.y0 / ts) * ts), ey = Math.min(y1, VR.y1);
    for (var y = sy - (sy - y0) % ts; y < ey; y += ts) for (var x = sx - (sx - x0) % ts; x < ex; x += ts) {
      if (((x - x0) / ts + (y - y0) / ts) % 2 === 0) c.fillRect(x, y, Math.min(ts, x1 - x), Math.min(ts, y1 - y));
    }
  }
  function drawRug(c) {
    A.rr(c, -60, -250, 120, 500, 16); c.fillStyle = '#6c63ff'; c.fill(); c.strokeStyle = '#4a42c9'; c.lineWidth = 4; c.stroke();
    A.rr(c, -46, -236, 92, 472, 10); c.strokeStyle = '#ffd23f'; c.lineWidth = 5; c.stroke();
    for (var i = -3; i <= 3; i++) { A.star(c, 0, i * 64, 5, 14, 6); c.fillStyle = i % 2 ? '#ff8fbf' : '#ffd23f'; c.fill(); }
  }
  function drawSoil(c, d, real) {
    var w = (d.cols - 1) * d.sx + 90, h = (d.rows - 1) * d.sy + 80;
    var x = d.x - w / 2, y = d.y - h / 2 + 10;
    if (real) {
      A.rr(c, x - 4, y + 6, w + 8, h, 22); c.fillStyle = '#7c5334'; c.fill();
      A.rr(c, x, y, w, h, 20); c.fillStyle = '#a8744a'; c.fill();
      c.strokeStyle = '#8f5f3a'; c.lineWidth = 5;
      for (var r = 0; r < d.rows; r++) { var yy = d.y + (r - (d.rows - 1) / 2) * d.sy + 6; c.beginPath(); c.moveTo(x + 18, yy); c.lineTo(x + w - 18, yy); c.stroke(); }
    } else {
      c.setLineDash([14, 10]); c.lineDashOffset = -R.t * 20;
      A.rr(c, x, y, w, h, 20); c.fillStyle = 'rgba(168,116,74,0.18)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 4; c.stroke();
      c.setLineDash([]);
    }
  }

  /* ---------- mats + pads */
  function mat(c, x, y, w, h, col, glow, icon, alpha) {
    c.save();
    c.globalAlpha = alpha == null ? 1 : alpha;
    A.rr(c, x - w / 2, y - h / 2 + 3, w, h, 12); c.fillStyle = 'rgba(0,0,0,0.12)'; c.fill();
    A.rr(c, x - w / 2, y - h / 2, w, h, 12); c.fillStyle = col; c.fill();
    c.setLineDash([10, 7]); c.lineDashOffset = -R.t * 25;
    c.strokeStyle = glow ? '#ffffff' : 'rgba(255,255,255,0.7)'; c.lineWidth = glow ? 5 : 3; c.stroke(); c.setLineDash([]);
    if (icon) A.icon(c, icon, x, y, Math.min(w, h) * 0.62);
    c.restore();
  }
  function drawMats(c) {
    R.registers.forEach(function (reg) {
      var cs = reg.d.cashier, here = d2(P.x, P.y, cs.x, cs.y) < 62 * 62;
      var needs = reg.queue.length && !(reg.helper && reg.helper.atPost);
      mat(c, cs.x, cs.y, 96, 58, here ? '#ffd23f' : (needs ? 'rgba(255,210,63,' + (0.55 + Math.sin(R.t * 8) * 0.3) + ')' : 'rgba(255,210,63,0.55)'), here, null);
      A.coin(c, cs.x, cs.y, 14);
      var pp = reg.d.pile;
      A.ell(c, pp.x, pp.y, 48, 26); c.fillStyle = 'rgba(255,210,63,0.28)'; c.fill();
      c.setLineDash([8, 7]); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3; c.stroke(); c.setLineDash([]);
    });
    R.machines.forEach(function (m) {
      var carrying = topIndexOf(P.stack, m.d.input) >= 0;
      mat(c, m.inMat.x, m.inMat.y, 74, 74, carrying ? 'rgba(61,220,132,0.85)' : 'rgba(61,220,132,0.4)', carrying, m.d.input, popScale(m) < 1 ? 0.5 : 1);
      mat(c, m.outMat.x, m.outMat.y, 74, 74, m.outCount ? 'rgba(255,206,64,0.9)' : 'rgba(255,246,214,0.8)', m.outCount > 0, null, popScale(m) < 1 ? 0.5 : 1);
      arrowShape(c, m.inMat.x + 44, m.inMat.y, 0, 12, '#ffffff');
      arrowShape(c, m.outMat.x - 50, m.outMat.y, 0, 12, '#ffffff');
    });
    if (R.byId.desk) { var dk = R.byId.desk; mat(c, dk.x, dk.y, 90, 62, P.onDesk ? 'rgba(126,240,255,0.95)' : 'rgba(126,240,255,0.55)', P.onDesk, 'desk'); }
    var tr = R.byId.trash;
    if (tr) mat(c, tr.x + 44, tr.y + 2, 46, 58, 'rgba(160,160,170,0.35)', false, null);
    // shelf glow when carrying something that fits
    R.shelves.forEach(function (s) {
      if (s.count < s.cap && topIndexOf(P.stack, s.item) >= 0) {
        var d = s.d;
        A.rr(c, d.x - 75 - 30, d.y - 23 - 30, 210, 46 + 60, 22);
        c.fillStyle = 'rgba(255,255,255,' + (0.25 + Math.sin(R.t * 7) * 0.12) + ')'; c.fill();
        c.setLineDash([12, 8]); c.lineDashOffset = -R.t * 30; c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.stroke(); c.setLineDash([]);
      }
    });
  }
  function arrowShape(c, x, y, ang, s, col) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(s, 0); c.lineTo(-s * 0.4, -s * 0.8); c.lineTo(-s * 0.4, s * 0.8); c.closePath();
    c.fillStyle = col; c.fill(); c.restore();
  }
  function padIcon(d) {
    switch (d.kind) {
      case 'field': case 'shelf': case 'orchard': return d.item;
      case 'machine': return d.output;
      case 'coop': return 'coop'; case 'pen': return 'pen';
      case 'hire': return d.role === 'farmer' ? 'farmer' : 'cashier';
      case 'expand': return 'expand'; case 'desk': return 'desk'; case 'register': return 'register';
      case 'decor': return d.decor;
    }
    return 'star';
  }
  function drawPad(c, p) {
    var d = p.d, remain = d.cost - p.paid, afford = S.coins >= remain;
    var on = P.pad === p;
    var sc = easeOutBack(Math.min(1, p.pop)) * (1 + (afford ? Math.sin(R.t * 5) * 0.04 : 0)) * (on ? 1.08 : 1);
    // ghost footprint for buildings
    c.save();
    c.setLineDash([12, 9]); c.lineDashOffset = -R.t * 18; c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 3;
    if (d.kind === 'shelf') { A.rr(c, d.x - 75, d.y - 23, 150, 46, 8); c.stroke(); }
    if (d.kind === 'machine') { A.rr(c, d.x - 65, d.y - 35, 130, 70, 10); c.stroke(); A.rr(c, d.x - 149, d.y - 25, 74, 74, 10); c.stroke(); A.rr(c, d.x + 75, d.y - 25, 74, 74, 10); c.stroke(); }
    if (d.kind === 'coop') { A.rr(c, d.x - 90, d.y - 45, 180, 90, 10); c.stroke(); }
    if (d.kind === 'pen') { A.rr(c, d.x - 120, d.y - 65, 240, 130, 10); c.stroke(); }
    if (d.kind === 'register') { A.rr(c, d.x - 85, d.y - 27, 170, 54, 10); c.stroke(); }
    if (d.kind === 'expand') { A.rr(c, CM.WING.x0 + 20, CM.WING.y0 + 20, CM.WING.x1 - CM.WING.x0 - 40, CM.WING.y1 - CM.WING.y0 - 40, 20); c.stroke(); }
    c.setLineDash([]);
    c.translate(p.x, p.y); c.scale(sc, sc * 0.62);
    // base disk
    A.circ(c, 0, 6, 52); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fill();
    A.circ(c, 0, 0, 52); c.fillStyle = afford ? 'rgba(255,236,150,0.75)' : 'rgba(255,255,255,0.45)'; c.fill();
    // fill progress
    if (p.fill > 0.001) {
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 52, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.fill)); c.closePath();
      c.fillStyle = '#ffc93c'; c.fill();
    }
    c.setLineDash([16, 10]); c.lineDashOffset = -R.t * 30;
    A.circ(c, 0, 0, 52); c.strokeStyle = afford ? '#ffffff' : 'rgba(255,255,255,0.85)'; c.lineWidth = 7; c.stroke(); c.setLineDash([]);
    c.restore();
    if (afford && Math.random() < 0.08 && R.mode === 'play') part(p.x + rnd(-40, 40), p.y + rnd(-20, 20), { vx: 0, vy: -rnd(30, 60), life: 0.8, size: 7, color: '#fff7b0', g: -10, shape: 'star' });
  }
  function drawPadLabel(c, p) {
    var d = p.d, remain = d.cost - p.paid, afford = S.coins >= remain;
    var sc = easeOutBack(Math.min(1, p.pop));
    var bob = Math.sin(R.t * 3 + p.x) * 4;
    c.save(); c.translate(p.x, p.y - 58 + bob); c.scale(sc, sc);
    // icon bubble
    A.circ(c, 0, -30, 32); c.fillStyle = afford ? '#fff6c8' : '#ffffff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 4; c.stroke();
    A.icon(c, padIcon(d), 0, -30, 46);
    // name
    c.font = '700 20px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    var nw = c.measureText(dir(c, d.name)).width + 24;
    A.rr(c, -nw / 2, -86, nw, 28, 14); c.fillStyle = 'rgba(40,30,60,0.8)'; c.fill();
    c.fillStyle = '#ffffff'; c.fillText(dir(c, d.name), 0, -71);
    // cost
    c.font = '700 22px Fredoka, sans-serif';
    var txt = dir(c, K.fmt(remain)), tw = c.measureText(txt).width + 44;
    A.rr(c, -tw / 2, 6, tw, 32, 16); c.fillStyle = afford ? '#3ddc84' : '#ffffff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    A.coin(c, -tw / 2 + 17, 22, 11);
    c.fillStyle = afford ? '#08361d' : '#4a2e1f'; c.textAlign = 'left'; c.fillText(txt, -tw / 2 + 32, 23);
    c.restore();
  }
  function drawFootArrow(c) {
    var h = R.hint;
    if (!h || !showArrow()) return;
    var dx = h.x - P.x, dy = h.y - P.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 90) return;
    var a = Math.atan2(dy, dx), r = 58 + Math.sin(R.t * 8) * 6;
    c.save(); c.translate(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r * 0.7); c.rotate(a);
    c.beginPath(); c.moveTo(22, 0); c.lineTo(-10, -18); c.lineTo(-4, 0); c.lineTo(-10, 18); c.closePath();
    c.fillStyle = h.urgent ? '#ff5d5d' : '#ffffff'; c.fill(); c.strokeStyle = h.urgent ? '#8a1f1f' : '#e07a00'; c.lineWidth = 4; c.stroke();
    c.restore();
  }
  function showArrow() {
    var h = R.hint; if (!h) return false;
    if (S.tut < 5) return true;
    if (h.urgent || h.pad) return true;
    if (h.soft) return R.idleT > 6;
    return R.idleT > 3 || S.tut < 6 && R.t < 120;
  }

  /* ---------- sorted objects */
  function drawSorted(c) {
    var dl = R.dl; dl.length = 0;
    var m = 260;
    R.objs.forEach(function (o) {
      if (o.k === 'none') return;
      if (o.spots) {
        o.spots.forEach(function (s) { if (inView(s.x, s.y, m)) dl.push(s); });
        if (o.kind === 'coop' || o.kind === 'pen') { if (inView(o.x, o.y, m + 100)) dl.push(o); if (o.nests) dl.push(o.nests); if (o.crate) dl.push(o.crate); }
        return;
      }
      if (o.kind === 'register') { dl.push(o.pileObj); }
      if (inView(o.x, o.y, m + 100)) dl.push(o);
    });
    R.walls.forEach(function (w) { dl.push(w); });
    R.chicks.forEach(function (ch) { if (inView(ch.x, ch.y, m)) dl.push(ch); });
    R.npcs.forEach(function (n) { n.dy = n.y; if (inView(n.x, n.y, m)) dl.push(n); });
    if (R.mode !== 'title' || true) { P.k = 'player'; P.dy = P.y; dl.push(P); }
    dl.sort(function (a, b) { return a.dy - b.dy; });
    for (var i = 0; i < dl.length; i++) drawThing(c, dl[i]);
  }
  function drawThing(c, o) {
    switch (o.k) {
      case 'plant': drawPlant(c, o); break;
      case 'shelf': drawShelf(c, o); break;
      case 'machine': drawMachine(c, o); break;
      case 'register': drawCounter(c, o); break;
      case 'pile': drawPile(c, o.o); break;
      case 'coop': drawCoop(c, o); break;
      case 'nests': drawNests(c, o.o); break;
      case 'pen': drawPen(c, o); break;
      case 'crate': drawCrate(c, o.o); break;
      case 'chick': A.critter(c, { sp: 'chicken', x: o.x, y: o.y, s: 0.5, moving: o.moving, phase: R.t * 14, look: o.look * 0.8, t: R.t + o.x }); break;
      case 'critter': drawNPC(c, o); break;
      case 'player': drawPlayer(c); break;
      case 'wallback': drawBackWall(c, o); break;
      case 'wallfront': drawLowWallH(c, o); break;
      case 'wallv': drawLowWallV(c, o); break;
      case 'sign': drawSign(c); break;
      case 'desk': drawDesk(c, o); break;
      case 'trash': drawTrash(c, o); break;
      case 'decor': drawDecor(c, o); break;
    }
  }

  function drawPlayer(c) {
    A.critter(c, { sp: 'raccoon', x: P.x, y: P.y, s: 1.08, phase: P.phase, moving: P.moving, look: P.look, back: P.back,
      apron: '#1fb5a8', pocket: '#ffd23f', hat: META.hat, t: R.t, squash: P.squash, carryArms: P.stack.length > 0, blink: P.blinkT < 0 });
  }
  function drawNPC(c, n) {
    var s = n.type === 'cust' ? 0.95 : 0.98;
    if (n.pop < 1) s *= easeOutBack(Math.max(0.01, n.pop));
    A.critter(c, { sp: n.sp, x: n.x, y: n.y, s: s, phase: n.phase, moving: n.moving, look: n.look, back: n.back, color: n.color,
      hat: n.hat, apron: n.apron, pocket: n.pocket, overalls: n.overalls, bow: n.bow, glasses: n.glasses, t: n.t,
      basket: n.type === 'cust' && n.basket.length - (n.incoming || 0) > 0 ? (n.incoming ? n.basket.slice(0, n.basket.length - n.incoming) : n.basket) : null, mood: n.mood, blink: n.blinkT < 0, carryArms: n.stack && n.stack.length > 0 });
  }

  function drawPlant(c, s) {
    var o = s.o, x = s.x, y = s.y, g = s.g, t = R.t;
    var ps = popScale(s);
    var b = s.bump > 0 ? 1 + Math.sin(s.bump * 30) * s.bump * 0.4 : 1;
    c.save(); c.translate(x, y); c.scale(ps * (2 - b), ps * b);
    var ripe = g >= 1, sway = Math.sin(t * 1.6 + s.seed) * 0.04;
    switch (o.item) {
      case 'banana':
        A.ell(c, 0, 0, 26, 8); c.fillStyle = 'rgba(40,30,20,0.2)'; c.fill();
        A.rr(c, -5, -52, 10, 52, 4); c.fillStyle = '#a4733f'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
        c.strokeStyle = '#7d5530'; c.lineWidth = 2; for (var i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-4, -i * 13); c.lineTo(4, -i * 13 + 3); c.stroke(); }
        c.save(); c.translate(0, -52); c.rotate(sway);
        var L = [-2.6, -2.0, -1.1, -0.5, 0.15];
        for (var k = 0; k < L.length; k++) { c.save(); c.rotate(L[k] + 0.9); A.ell(c, 0, -22, 10, 26); c.fillStyle = k % 2 ? '#4fbf45' : '#5fd253'; c.fill(); c.strokeStyle = '#2f7d2a'; c.lineWidth = 3; c.stroke(); c.beginPath(); c.moveTo(0, -2); c.lineTo(0, -44); c.strokeStyle = '#3c9a35'; c.lineWidth = 2; c.stroke(); c.restore(); }
        if (ripe) A.item(c, 'banana', 4, 34, 50 + Math.sin(t * 5 + s.seed) * 2);
        else { var gs = 0.35 + 0.65 * g; c.save(); c.translate(6, 14); c.scale(gs, gs); for (var q = 0; q < 3; q++) { A.ell(c, -6 + q * 6, 0, 4, 11, -0.3 + q * 0.3); c.fillStyle = '#9bd35a'; c.fill(); c.strokeStyle = '#4f8a2a'; c.lineWidth = 2; c.stroke(); } c.restore(); }
        c.restore();
        break;
      case 'corn':
        A.ell(c, 0, 0, 22, 7); c.fillStyle = 'rgba(40,30,20,0.2)'; c.fill();
        c.save(); c.rotate(sway);
        c.beginPath(); c.moveTo(-3, 0); c.lineTo(-2, -70); c.lineTo(2, -70); c.lineTo(3, 0); c.closePath(); c.fillStyle = '#5cbf45'; c.fill(); c.strokeStyle = '#2f7d2a'; c.lineWidth = 2.5; c.stroke();
        c.beginPath(); c.moveTo(0, -20); c.quadraticCurveTo(-26, -30, -30, -8); c.quadraticCurveTo(-18, -22, 0, -26); c.fillStyle = '#6cd35a'; c.fill(); c.stroke();
        c.beginPath(); c.moveTo(0, -40); c.quadraticCurveTo(28, -52, 30, -30); c.quadraticCurveTo(18, -44, 0, -46); c.fillStyle = '#6cd35a'; c.fill(); c.stroke();
        c.beginPath(); c.moveTo(0, -66); c.quadraticCurveTo(-16, -84, -10, -92); c.quadraticCurveTo(-6, -80, 0, -70); c.fillStyle = '#e8d05a'; c.fill(); c.stroke();
        if (ripe) A.item(c, 'corn', 10, -22, 46 + Math.sin(t * 5 + s.seed) * 2);
        else { var cg = 0.3 + 0.7 * g; A.ell(c, 8, -46, 6 * cg, 13 * cg, 0.3); c.fillStyle = '#8fd46a'; c.fill(); c.strokeStyle = '#3f8f33'; c.lineWidth = 2; c.stroke(); }
        c.restore();
        break;
      case 'pumpkin':
        c.fillStyle = '#4fbf45'; c.strokeStyle = '#2f7d2a'; c.lineWidth = 2.5;
        A.circ(c, -20, -6, 11); c.fill(); c.stroke(); A.circ(c, 22, -4, 10); c.fill(); c.stroke(); A.circ(c, 4, -18, 9); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(-26, 2); c.quadraticCurveTo(0, -12, 26, 4); c.strokeStyle = '#3f8f33'; c.lineWidth = 3; c.stroke();
        A.ell(c, 0, 2, 22, 7); c.fillStyle = 'rgba(40,30,20,0.18)'; c.fill();
        if (ripe) A.item(c, 'pumpkin', 0, 8, 50 + Math.sin(t * 5 + s.seed) * 1.5);
        else { var pg = 0.25 + 0.6 * g; A.ell(c, 0, -10 * pg, 18 * pg, 13 * pg); c.fillStyle = g > 0.6 ? '#e6b64a' : '#9bd35a'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke(); }
        break;
      case 'apple':
        A.ell(c, 0, 0, 30, 9); c.fillStyle = 'rgba(40,30,20,0.25)'; c.fill();
        A.rr(c, -8, -60, 16, 60, 5); c.fillStyle = '#9a6a3c'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
        c.save(); c.translate(0, -80); c.rotate(sway * 0.5);
        var cc = [[-30, 6, 32], [30, 6, 32], [0, -20, 38], [0, 14, 34]];
        cc.forEach(function (q) { A.circ(c, q[0], q[1], q[2]); c.fillStyle = '#3f9e3a'; c.fill(); c.strokeStyle = '#2a6f28'; c.lineWidth = 4; c.stroke(); });
        cc.forEach(function (q) { A.circ(c, q[0] - 4, q[1] - 5, q[2] - 7); c.fillStyle = '#56bf4a'; c.fill(); });
        A.circ(c, -12, -30, 10); c.fillStyle = 'rgba(255,255,255,0.18)'; c.fill();
        var ap = [[-26, 4], [22, -4], [2, 22], [-4, -22]];
        for (var j = 0; j < ap.length; j++) {
          if (ripe) A.itemC(c, 'apple', ap[j][0], ap[j][1] + Math.sin(t * 4 + j) * 1.2, 24);
          else { A.circ(c, ap[j][0], ap[j][1], 3 + 6 * g); c.fillStyle = g > 0.7 ? '#e0a040' : '#8fd46a'; c.fill(); c.strokeStyle = '#2a6f28'; c.lineWidth = 1.5; c.stroke(); }
        }
        c.restore();
        break;
    }
    if (ripe && Math.sin(t * 3 + s.seed * 5) > 0.97) part(x + rnd(-14, 14), y - 50 + rnd(-15, 15), { vx: 0, vy: -20, life: 0.6, size: 8, color: '#fff7b0', g: 0, shape: 'star' });
    c.restore();
  }

  function drawShelf(c, o) {
    var d = o.d, x = d.x, y = d.y, w = 150, dd = 46, H = d.fridge ? 62 : 40;
    var x0 = x - w / 2, yt = y - dd / 2, yb = y + dd / 2;
    var ps = popScale(o), b = o.bump > 0 ? 1 + Math.sin(o.bump * 40) * o.bump * 0.25 : 1;
    c.save(); c.translate(x, yb); c.scale(ps * (2 - b), ps * b); c.translate(-x, -yb);
    A.rr(c, x0 + 6, yb - 10, w, 18, 9); c.fillStyle = 'rgba(40,30,20,0.2)'; c.fill();
    var col = SHELF_COL[o.item] || '#5aa9e6';
    var vis = Math.max(0, o.count - o.inflight);
    if (!d.fridge) {
      A.rr(c, x0, yt - H, w, dd, 8); c.fillStyle = '#fffaf0'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
      A.rr(c, x0 + 6, yt - H + 5, w - 12, dd - 10, 5); c.fillStyle = '#f3ead8'; c.fill();
      for (var i = 0; i < Math.min(8, vis); i++) { var sp = shelfSlotPos(o, i); A.item(c, o.item, sp.x, sp.y, 32); }
      A.rr(c, x0, yb - H, w, H, 8); c.fillStyle = col; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x0 + 4, yb - H + 4, w - 8, 6);
      c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x0 + 4, yb - 10, w - 8, 6);
    } else {
      A.rr(c, x0, yt - H, w, dd, 8); c.fillStyle = '#f7fbff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
      A.rr(c, x0, yb - H, w, H, 8); c.fillStyle = col; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
      A.rr(c, x0 + 8, yb - H + 6, w - 16, H - 14, 6); c.fillStyle = '#dff4ff'; c.fill();
      c.fillStyle = 'rgba(120,180,220,0.5)'; c.fillRect(x0 + 10, yb - H + 32, w - 20, 3);
      for (var j = 0; j < Math.min(8, vis); j++) { var sp2 = shelfSlotPos(o, j); A.item(c, o.item, sp2.x, sp2.y, 26); }
      A.rr(c, x0 + 8, yb - H + 6, w - 16, H - 14, 6); c.fillStyle = 'rgba(255,255,255,0.18)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.moveTo(x0 + 24, yb - H + 10); c.lineTo(x0 + 12, yb - 14); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 4; c.stroke();
    }
    // price tag
    var price = Math.round(priceOf(o.item));
    c.font = '700 17px Fredoka, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    var tw = c.measureText(dir(c, price)).width + 30;
    A.rr(c, x - tw / 2, yb - (d.fridge ? 14 : 30), tw, 22, 8); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
    A.coin(c, x - tw / 2 + 12, yb - (d.fridge ? 3 : 19), 8);
    c.fillStyle = OUT; c.fillText(price, x - tw / 2 + 22, yb - (d.fridge ? 2 : 18));
    c.restore();
  }
  var SHELF_COL = { banana: '#ffcf40', corn: '#8fd46a', egg: '#ffb86b', milk: '#6fb1ff', apple: '#ff7070', pumpkin: '#ff9a3c', juice: '#ffd84a', popcorn: '#ff6b7d', icecream: '#ff9ecb', pie: '#e0a15a' };

  function drawMachine(c, o) {
    var d = o.d, x = d.x, y = d.y, w = 130, dd = 70, H = 76;
    var x0 = x - w / 2, yt = y - dd / 2, yb = y + dd / 2;
    var ps = popScale(o), b = o.bump > 0 ? 1 + Math.sin(o.bump * 40) * o.bump * 0.3 : 1;
    var sh = o.working ? Math.sin(R.t * 45) * 1.2 : 0;
    c.save(); c.translate(x + sh, yb); c.scale(ps * (2 - b), ps * b); c.translate(-x, -yb);
    A.rr(c, x0 + 6, yb - 10, w, 18, 9); c.fillStyle = 'rgba(40,30,20,0.2)'; c.fill();
    var col = d.color;
    var tt = yb - H - 40;
    A.rr(c, x0, tt, w, 52, 14); c.fillStyle = A.shade(col, 55); c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    A.rr(c, x0 + 8, tt + 6, w - 16, 26, 9); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
    // chimney
    A.rr(c, x + 32, tt - 26, 22, 44, 5); c.fillStyle = '#b8c0d0'; c.fill(); c.strokeStyle = OUT; c.stroke();
    A.rr(c, x + 29, tt - 30, 28, 10, 4); c.fillStyle = '#9aa3b5'; c.fill(); c.stroke();
    // hopper
    c.beginPath(); c.moveTo(x0 + 8, tt - 22); c.lineTo(x0 + 66, tt - 22); c.lineTo(x0 + 52, tt + 22); c.lineTo(x0 + 22, tt + 22); c.closePath();
    c.fillStyle = '#e3e8f2'; c.fill(); c.strokeStyle = OUT; c.stroke();
    var vin = Math.max(0, o.inCount - o.inflight);
    for (var i = 0; i < Math.min(vin, 6); i++) A.item(c, d.input, x0 + 23 + (i % 3) * 14, tt - 4 - Math.floor(i / 3) * 12, 24);
    A.rr(c, x0, yb - H, w, H, 14); c.fillStyle = col; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x0 + 8, yb - H + 5, w - 16, 6);
    // window with product
    var wy = yb - H / 2 - 4;
    A.circ(c, x - 10, wy, 26); c.fillStyle = '#eaf7ff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    if (o.prog > 0.01) { c.beginPath(); c.arc(x - 10, wy, 31, -Math.PI / 2, -Math.PI / 2 + TAU * o.prog); c.strokeStyle = '#3ddc84'; c.lineWidth = 6; c.stroke(); }
    c.save(); c.translate(x - 10, wy); if (o.working) c.rotate(Math.sin(R.t * 12) * 0.25);
    A.itemC(c, o.working ? d.output : d.input, 0, 0, 34); c.restore();
    // lights
    A.circ(c, x + 40, yb - H + 22, 6); c.fillStyle = o.working ? (Math.sin(R.t * 10) > 0 ? '#3ddc84' : '#b8ffd6') : '#ff8a8a'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
    A.circ(c, x + 40, yb - H + 44, 6); c.fillStyle = '#ffd23f'; c.fill(); c.stroke();
    // chute to output
    c.beginPath(); c.moveTo(x0 + w - 2, yb - 40); c.lineTo(x0 + w + 26, yb - 22); c.lineTo(x0 + w + 26, yb - 12); c.lineTo(x0 + w - 2, yb - 24); c.closePath(); c.fillStyle = '#c9ccd6'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.5; c.stroke();
    // label
    c.font = '700 14px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillText(dir(c, d.name), x + 1, yb - 9);
    c.fillStyle = '#ffffff'; c.fillText(d.name, x, yb - 10);
    c.restore();
    // output items on out mat
    var vout = Math.max(0, o.outCount);
    for (var k = 0; k < Math.min(vout, 8); k++) A.item(c, d.output, o.outMat.x - 18 + (k % 3) * 18, o.outMat.y + 16 - Math.floor(k / 3) * 14, 30);
    if (vin > 0 && ps >= 1) { badge(c, o.inMat.x + 26, o.inMat.y - 34, vin + '/8', '#3ddc84'); }
  }
  function badge(c, x, y, txt, col) {
    c.font = '700 16px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    var w = c.measureText(dir(c, txt)).width + 14;
    A.rr(c, x - w / 2, y - 11, w, 22, 11); c.fillStyle = col; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#ffffff'; c.fillText(txt, x, y + 1);
  }

  function drawCounter(c, o) {
    var d = o.d, x = d.x, y = d.y, w = 170, dd = 54, H = 44;
    var x0 = x - w / 2, yt = y - dd / 2, yb = y + dd / 2;
    var ps = popScale(o);
    c.save(); c.translate(x, yb); c.scale(ps, ps); c.translate(-x, -yb);
    A.rr(c, x0 + 6, yb - 10, w, 18, 9); c.fillStyle = 'rgba(40,30,20,0.2)'; c.fill();
    A.rr(c, x0, yt - H, w, dd, 8); c.fillStyle = '#f0b878'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    // conveyor
    A.rr(c, x0 + 60, yt - H + 10, w - 70, dd - 20, 6); c.fillStyle = '#4b4f63'; c.fill();
    c.strokeStyle = '#6b7085'; c.lineWidth = 3;
    var off = o.manned && o.queue.length ? (R.t * 40) % 16 : 0;
    for (var bx = x0 + 64 + off; bx < x0 + w - 12; bx += 16) { c.beginPath(); c.moveTo(bx, yt - H + 12); c.lineTo(bx, yt - H + dd - 12); c.stroke(); }
    A.rr(c, x0, yb - H, w, H, 8); c.fillStyle = '#d98f4e'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    c.strokeStyle = 'rgba(120,60,20,0.35)'; c.lineWidth = 2;
    for (var px = x0 + 34; px < x0 + w; px += 34) { c.beginPath(); c.moveTo(px, yb - H + 4); c.lineTo(px, yb - 4); c.stroke(); }
    c.fillStyle = '#1fb5a8'; c.fillRect(x0 + 3, yb - H + 6, w - 6, 8);
    // register machine
    var ry = yt - H + 4;
    if (o.ching > 0) { A.rr(c, x0 + 14, ry + 30 + o.ching * 16, 44, 12, 3); c.fillStyle = '#c9ccd6'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke(); }
    A.rr(c, x0 + 10, ry + 8, 52, 30, 6); c.fillStyle = '#5b6dcd'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    A.rr(c, x0 + 16, ry - 22, 40, 30, 6); c.fillStyle = '#3f4ea8'; c.fill(); c.stroke();
    A.rr(c, x0 + 21, ry - 17, 30, 16, 3); c.fillStyle = o.scan > 0 ? '#ffffff' : '#9ff7d6'; c.fill();
    c.fillStyle = '#1b5e4a'; c.font = '700 13px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(dir(c, o.ching > 0 ? 'شكرًا' : (o.queue.length && o.queue[0].state === 'paying' ? Math.round(o.queue[0].paid) + '' : 'أهلًا')), x0 + 36, ry - 8);
    c.fillStyle = '#ffffff'; for (var i = 0; i < 3; i++) { c.fillRect(x0 + 16 + i * 14, ry + 16, 9, 6); c.fillRect(x0 + 16 + i * 14, ry + 26, 9, 6); }
    c.restore();
  }
  function drawPile(c, reg) {
    var p = reg.d.pile, v = reg.pileVis;
    if (v < 0.5) return;
    var n = Math.min(30, Math.ceil(v / 3));
    var stacks = [[0, 0], [-18, 8], [18, 8], [-10, -8], [12, -8], [0, 14], [-26, -2], [26, -2]];
    var per = Math.ceil(n / stacks.length);
    var order = [3, 4, 6, 7, 0, 1, 2, 5];
    var left = n;
    var hs = [];
    for (var i = 0; i < stacks.length; i++) { var take = Math.min(left, i === 0 ? per + 2 : per); hs.push(take); left -= take; }
    for (var j = 0; j < order.length; j++) { var k = order[j]; if (hs[k] > 0) A.coinStack(c, p.x + stacks[k][0], p.y + stacks[k][1], hs[k]); }
    if (Math.random() < 0.05) part(p.x + rnd(-20, 20), p.y - 10 - rnd(0, 30), { vx: 0, vy: -30, life: 0.5, size: 8, color: '#fff7b0', g: 0, shape: 'star' });
  }
  function drawCoop(c, o) {
    var x = o.x, y = o.y, w = 180, H = 62, yb = y + 45, yt = y - 45;
    var ps = popScale(o);
    c.save(); c.translate(x, yb); c.scale(ps, ps); c.translate(-x, -yb);
    A.rr(c, x - 94, yb - 10, 196, 20, 10); c.fillStyle = 'rgba(40,30,20,0.22)'; c.fill();
    // wall
    A.rr(c, x - 86, yb - H, 172, H, 6); c.fillStyle = '#e8594f'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    c.strokeStyle = 'rgba(120,20,20,0.3)'; c.lineWidth = 2; for (var i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x - 86, yb - H + i * 15); c.lineTo(x + 86, yb - H + i * 15); c.stroke(); }
    c.fillStyle = '#ffffff'; c.fillRect(x - 86, yb - H, 8, H); c.fillRect(x + 78, yb - H, 8, H);
    // door
    c.beginPath(); c.moveTo(x - 20, yb); c.lineTo(x - 20, yb - 34); c.arc(x, yb - 34, 20, Math.PI, 0); c.lineTo(x + 20, yb); c.closePath(); c.fillStyle = '#5a2e22'; c.fill(); c.strokeStyle = OUT; c.stroke();
    A.circ(c, x + 50, yb - 36, 11); c.fillStyle = '#fff7d6'; c.fill(); c.stroke();
    // roof
    c.beginPath(); c.moveTo(x - 104, yb - H + 6); c.lineTo(x - 80, yt - H - 50); c.lineTo(x + 80, yt - H - 50); c.lineTo(x + 104, yb - H + 6); c.closePath();
    c.fillStyle = '#9b4a32'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    c.beginPath(); c.moveTo(x - 92, yt - H - 14); c.lineTo(x + 92, yt - H - 14); c.strokeStyle = '#7d3622'; c.lineWidth = 3; c.stroke();
    c.beginPath(); c.moveTo(x - 98, yb - H - 20); c.lineTo(x + 98, yb - H - 20); c.stroke();
    A.rr(c, x - 82, yt - H - 56, 164, 12, 6); c.fillStyle = '#b85a3e'; c.fill(); c.strokeStyle = OUT; c.stroke();
    // sign
    A.rr(c, x - 44, yt - H - 32, 88, 26, 8); c.fillStyle = '#fff7d6'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.5; c.stroke();
    c.font = '700 16px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#9b4a32'; c.fillText(dir(c, 'بيض'), x, yt - H - 18);
    // hen peeking in the window
    A.head(c, 'chicken', x + 50, yb - 32, 0.42, { look: Math.sin(R.t) });
    c.restore();
  }
  function drawNests(c, o) {
    var ps = popScale(o);
    o.spots.forEach(function (s) {
      c.save(); c.translate(s.x, s.y); c.scale(ps, ps);
      A.ell(c, 0, 0, 20, 9); c.fillStyle = '#c9953f'; c.fill(); c.strokeStyle = '#8a5f22'; c.lineWidth = 2.5; c.stroke();
      c.strokeStyle = '#e8c068'; c.lineWidth = 2; c.beginPath(); c.moveTo(-14, -2); c.lineTo(-4, 3); c.moveTo(4, -3); c.lineTo(14, 2); c.stroke();
      if (s.g >= 1) { var b = s.bump > 0 ? 1 + s.bump : 1; A.item(c, 'egg', 0, 4, 30 * b); }
      else if (s.g > 0.7) { A.ell(c, 0, -2, 6 * (s.g - 0.7) * 3, 5 * (s.g - 0.7) * 3); c.fillStyle = '#fff4e0'; c.fill(); }
      c.restore();
    });
  }
  function drawPen(c, o) {
    var x = o.x, y = o.y, w = 240, h = 130;
    var ps = popScale(o), yb = y + h / 2;
    c.save(); c.translate(x, yb); c.scale(ps, ps); c.translate(-x, -yb);
    A.rr(c, x - w / 2, y - h / 2, w, h, 12); c.fillStyle = '#e3c46e'; c.fill();
    c.strokeStyle = '#cfa94a'; c.lineWidth = 2;
    for (var i = 0; i < 14; i++) { var hx = x - w / 2 + 12 + hash(i, 7) * (w - 24), hy = y - h / 2 + 10 + hash(7, i) * (h - 20); c.beginPath(); c.moveTo(hx - 6, hy); c.lineTo(hx + 6, hy - 2); c.stroke(); }
    fence(c, x - w / 2, x + w / 2, y - h / 2);
    // cow
    var cw = o.cow, cx = x + cw.x, cy = y + 10, bob = Math.abs(Math.sin(cw.t * 3)) * 2;
    A.ell(c, cx, cy + 22, 44, 10); c.fillStyle = 'rgba(40,30,20,0.2)'; c.fill();
    c.save(); c.translate(cx, cy - bob); c.scale(cw.dir, 1);
    for (var l = 0; l < 4; l++) { A.rr(c, -30 + l * 17, 0, 10, 22 + (l % 2 ? Math.sin(cw.t * 6) * 2 : -Math.sin(cw.t * 6) * 2), 4); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.5; c.stroke(); }
    A.ell(c, 0, -8, 42, 24); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    A.ell(c, -14, -14, 12, 9, 0.3); c.fillStyle = '#3a3a44'; c.fill(); A.ell(c, 16, -2, 9, 7); c.fill(); A.ell(c, -2, 6, 6, 4); c.fill();
    A.ell(c, 4, 12, 9, 6); c.fillStyle = '#ffb6c8'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.moveTo(-40, -12); c.quadraticCurveTo(-54, -4 + Math.sin(cw.t * 4) * 6, -50, 10); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    A.head(c, 'cow', 44, -22, 0.95, { look: 0.6 });
    c.restore();
    fence(c, x - w / 2, x + w / 2, y + h / 2);
    fenceV(c, x - w / 2, y - h / 2, y + h / 2); fenceV(c, x + w / 2, y - h / 2, y + h / 2);
    A.rr(c, x - 42, y - h / 2 - 50, 84, 26, 8); c.fillStyle = '#fff7d6'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.5; c.stroke();
    c.font = '700 16px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#3d6ecf'; c.fillText(dir(c, 'حليب'), x, y - h / 2 - 36);
    c.restore();
  }
  function fence(c, x0, x1, y) {
    c.fillStyle = '#c98a4b'; c.strokeStyle = OUT; c.lineWidth = 2.5;
    A.rr(c, x0, y - 30, x1 - x0, 8, 3); c.fill(); c.stroke();
    A.rr(c, x0, y - 16, x1 - x0, 8, 3); c.fill(); c.stroke();
    for (var x = x0; x <= x1 + 1; x += 40) { A.rr(c, x - 5, y - 40, 10, 42, 3); c.fillStyle = '#b07840'; c.fill(); c.stroke(); }
  }
  function fenceV(c, x, y0, y1) {
    c.fillStyle = '#c98a4b'; c.strokeStyle = OUT; c.lineWidth = 2.5;
    A.rr(c, x - 4, y0 - 34, 8, y1 - y0, 3); c.fill(); c.stroke();
  }
  function drawCrate(c, o) {
    var ps = popScale(o), x = o.x, y = o.spots[0].y + 6;
    c.save(); c.translate(x, y); c.scale(ps, ps);
    A.rr(c, -86, -10, 172, 22, 6); c.fillStyle = 'rgba(40,30,20,0.2)'; c.fill();
    A.rr(c, -80, -26, 160, 20, 5); c.fillStyle = '#d9a066'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.5; c.stroke();
    o.spots.forEach(function (s) {
      if (s.g >= 1) { var b = s.bump > 0 ? 1 + s.bump : 1; A.item(c, 'milk', s.x - x, -16, 34 * b); }
      else { c.globalAlpha = 0.3; A.item(c, 'milk', s.x - x, -16, 34 * Math.max(0.2, s.g)); c.globalAlpha = 1; }
    });
    A.rr(c, -80, -14, 160, 18, 5); c.fillStyle = '#c98a4b'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.5; c.stroke();
    c.restore();
  }

  function drawBackWall(c, w) {
    var H = 80, y = w.y + 8;
    A.rr(c, w.x0, y - H, w.x1 - w.x0, H, 3); c.fillStyle = '#fdf0dc'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#2ec4b6'; c.fillRect(w.x0 + 2, y - 22, w.x1 - w.x0 - 4, 14);
    c.fillStyle = '#ffd23f'; c.fillRect(w.x0 + 2, y - 26, w.x1 - w.x0 - 4, 4);
    // windows
    for (var x = w.x0 + 70; x < w.x1 - 60; x += 170) {
      if (x > CM.DOOR.x0 - 60 && x < CM.DOOR.x1 + 20) continue;
      if (R.byId.desk && Math.abs(x + 30 - R.byId.desk.x) < 90) continue;
      A.rr(c, x, y - H + 14, 60, 34, 6); c.fillStyle = '#bfe8ff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.5; c.stroke();
      c.beginPath(); c.moveTo(x + 30, y - H + 14); c.lineTo(x + 30, y - H + 48); c.stroke();
      c.beginPath(); c.moveTo(x + 8, y - H + 40); c.lineTo(x + 20, y - H + 20); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 3; c.stroke();
    }
    A.rr(c, w.x0 - 2, y - H - 10, w.x1 - w.x0 + 4, 14, 4); c.fillStyle = '#e07a5f'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    if (R.byId.desk && w.x0 < R.byId.desk.x && w.x1 > R.byId.desk.x) drawDeskBoard(c, R.byId.desk, y);
    if (R.decor.plants && w.x0 < 1000) {
      // hanging bunting above the back wall of the hall
      var ps = popScale(R.decor.plants);
      c.save(); c.globalAlpha = Math.min(1, ps);
      for (var bx = w.x0 + 20; bx < w.x1 - 20; bx += 36) {
        c.beginPath(); c.moveTo(bx, y - H - 4); c.lineTo(bx + 30, y - H - 4); c.lineTo(bx + 15, y - H + 16); c.closePath();
        c.fillStyle = CONF[(bx / 36 | 0) % CONF.length]; c.fill();
      }
      c.restore();
    }
  }
  function drawDeskBoard(c, o, y) {
    var ps = popScale(o), x = o.x;
    c.save(); c.translate(x, y - 40); c.scale(ps, ps);
    A.rr(c, -52, -40, 104, 64, 8); c.fillStyle = '#c98a4b'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    A.rr(c, -45, -33, 90, 50, 5); c.fillStyle = '#f5deb3'; c.fill();
    c.fillStyle = '#ffffff'; c.fillRect(-38, -28, 26, 20); c.fillStyle = '#fff6a0'; c.fillRect(-6, -30, 24, 22); c.fillStyle = '#c8f0ff'; c.fillRect(22, -26, 18, 18);
    c.font = '700 13px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#9b4a32';
    c.fillText(dir(c, 'تطويرات'), 0, 6);
    arrowShape(c, 0, -46 + Math.sin(R.t * 4) * 3, -Math.PI / 2, 12, '#3ddc84');
    c.restore();
  }
  function drawLowWallH(c, w) {
    var H = 26, y = w.y + 8;
    A.rr(c, w.x0, y - H, w.x1 - w.x0, H, 3); c.fillStyle = '#fdf0dc'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#2ec4b6'; c.fillRect(w.x0 + 2, y - 12, w.x1 - w.x0 - 4, 8);
    A.rr(c, w.x0 - 2, y - H - 12, w.x1 - w.x0 + 4, 16, 4); c.fillStyle = '#e07a5f'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
  }
  function drawLowWallV(c, w) {
    var H = 26;
    c.fillStyle = '#e07a5f';
    c.fillRect(w.x - 8, w.y0 - H - 4, 16, w.y1 - w.y0 + 4);
    c.strokeStyle = OUT; c.lineWidth = 3;
    c.beginPath(); c.moveTo(w.x - 8, w.y0 - H - 4); c.lineTo(w.x - 8, w.y1 - H); c.moveTo(w.x + 8, w.y0 - H - 4); c.lineTo(w.x + 8, w.y1 - H); c.stroke();
    if (w.end) {
      A.rr(c, w.x - 8, w.y1 - H, 16, H + 8, 3); c.fillStyle = '#fdf0dc'; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(w.x - 8, w.y1 - H); c.lineTo(w.x + 8, w.y1 - H); c.stroke();
    }
  }
  function drawSign(c) {
    var x = 1250, y = CM.HALL.y1 + 8;
    c.fillStyle = '#9a6a3c'; c.strokeStyle = OUT; c.lineWidth = 3;
    A.rr(c, CM.DOOR.x0 - 6, y - 150, 12, 150, 4); c.fill(); c.stroke();
    A.rr(c, CM.DOOR.x1 - 6, y - 150, 12, 150, 4); c.fill(); c.stroke();
    var bob = Math.sin(R.t * 2) * 1.5;
    A.rr(c, x - 125, y - 196 + bob, 250, 62, 16); c.fillStyle = '#ffcf3f'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 4; c.stroke();
    A.rr(c, x - 116, y - 188 + bob, 232, 46, 11); c.fillStyle = '#ff7a59'; c.fill();
    c.font = '700 30px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 6; c.strokeStyle = OUT; c.strokeText(dir(c, 'سوق الحيوانات'), x, y - 163 + bob);
    c.fillStyle = '#ffffff'; c.fillText('سوق الحيوانات', x, y - 163 + bob);
  }
  function drawDesk() { /* board is drawn on the back wall */ }
  function drawTrash(c, o) {
    var x = o.x, y = o.y + 12, lid = o.lid > 0 ? o.lid * 40 : 0;
    A.ell(c, x, y, 24, 7); c.fillStyle = 'rgba(40,30,20,0.2)'; c.fill();
    c.beginPath(); c.moveTo(x - 20, y - 44); c.lineTo(x + 20, y - 44); c.lineTo(x + 16, y); c.lineTo(x - 16, y); c.closePath(); c.fillStyle = '#7fbf6a'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    c.strokeStyle = '#5a9a48'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 7, y - 36); c.lineTo(x - 6, y - 8); c.moveTo(x + 7, y - 36); c.lineTo(x + 6, y - 8); c.stroke();
    c.save(); c.translate(x - 22, y - 46); c.rotate(-lid * 0.03);
    A.rr(c, 0, -6, 44, 10, 4); c.fillStyle = '#9bd88a'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    c.restore();
  }
  function drawDecor(c, o) {
    var d = o.d, ps = popScale(o);
    if (d.decor === 'balloons') {
      c.save(); c.translate(1250, 1768); c.scale(ps, ps);
      for (var i = 0; i < 15; i++) {
        var a = Math.PI + i / 14 * Math.PI, bx = Math.cos(a) * 112, by = Math.sin(a) * 62 - 26 + Math.sin(R.t * 2 + i) * 3;
        A.ell(c, bx, by, 15, 18); c.fillStyle = CONF[i % CONF.length]; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.5; c.stroke();
        A.ell(c, bx - 5, by - 6, 3, 5, 0.4); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fill();
      }
      c.restore();
    } else if (d.decor === 'fountain') {
      var x = d.x, y = d.y;
      c.save(); c.translate(x, y + 36); c.scale(ps, ps); c.translate(-x, -y - 36);
      A.ell(c, x, y + 10, 80, 38); c.fillStyle = 'rgba(40,30,20,0.2)'; c.fill();
      A.ell(c, x, y, 76, 34); c.fillStyle = '#c9d2e3'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
      A.ell(c, x, y - 4, 64, 26); c.fillStyle = '#5ad1ff'; c.fill();
      for (var r = 0; r < 3; r++) { var rr2 = ((R.t * 20 + r * 20) % 60); A.ell(c, x, y - 4, rr2, rr2 * 0.4); c.strokeStyle = 'rgba(255,255,255,' + (0.6 - rr2 / 100) + ')'; c.lineWidth = 2; c.stroke(); }
      A.rr(c, x - 10, y - 60, 20, 56, 5); c.fillStyle = '#dfe5f0'; c.fill(); c.strokeStyle = OUT; c.stroke();
      A.ell(c, x, y - 60, 28, 10); c.fillStyle = '#c9d2e3'; c.fill(); c.stroke();
      c.strokeStyle = 'rgba(120,220,255,0.9)'; c.lineWidth = 5;
      for (var j = -1; j <= 1; j += 2) { c.beginPath(); c.moveTo(x, y - 70); c.quadraticCurveTo(x + j * 30, y - 110, x + j * 50, y - 20); c.stroke(); }
      if (Math.random() < 0.5) part(x + rnd(-50, 50), y - 16, { vx: rnd(-20, 20), vy: -rnd(40, 90), life: 0.5, size: 5, color: '#bff0ff', g: 300 });
      c.restore();
    } else if (d.decor === 'statue') {
      var sx = d.x, sy = d.y;
      c.save(); c.translate(sx, sy + 24); c.scale(ps, ps); c.translate(-sx, -sy - 24);
      A.rr(c, sx - 44, sy - 20, 88, 44, 8); c.fillStyle = '#c9ccd6'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
      A.rr(c, sx - 44, sy - 36, 88, 20, 6); c.fillStyle = '#e3e6ee'; c.fill(); c.stroke();
      A.critter(c, { sp: 'raccoon', x: sx, y: sy - 26, s: 1.5, gold: true, t: 0, hat: 'crown', apron: '#ffcf3f', pocket: '#fff3a0', carryArms: true });
      if (Math.random() < 0.15) part(sx + rnd(-40, 40), sy - rnd(40, 150), { vx: 0, vy: -20, life: 0.7, size: 10, color: '#fff7b0', g: 0, shape: 'star' });
      c.restore();
    }
  }
  function drawPots(c) {
    if (!R.decor.plants) return;
    var ps = popScale(R.decor.plants);
    POTS.forEach(function (p) {
      if (!inView(p[0], p[1], 100)) return;
      c.save(); c.translate(p[0], p[1]); c.scale(ps, ps);
      A.ell(c, 0, 2, 20, 6); c.fillStyle = 'rgba(40,30,20,0.2)'; c.fill();
      c.beginPath(); c.moveTo(-16, -26); c.lineTo(16, -26); c.lineTo(12, 0); c.lineTo(-12, 0); c.closePath(); c.fillStyle = '#e2724a'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
      var sw = Math.sin(R.t * 1.5 + p[0]) * 0.05;
      c.rotate(sw);
      A.circ(c, -10, -38, 13); c.fillStyle = '#4fbf45'; c.fill(); c.strokeStyle = '#2f7d2a'; c.lineWidth = 3; c.stroke();
      A.circ(c, 10, -38, 13); c.fill(); c.stroke();
      A.circ(c, 0, -52, 14); c.fillStyle = '#62d257'; c.fill(); c.stroke();
      A.circ(c, -4, -54, 4); c.fillStyle = '#ff8fbf'; c.fill(); A.circ(c, 8, -40, 3.5); c.fillStyle = '#ffd23f'; c.fill();
      c.restore();
    });
  }
  var HAT_LIFT = { cap: 4, chef: 20, party: 24, crown: 10, straw: 2, flower: 0 };
  var POTS = [[836, 900], [1160, 900], [1340, 900], [836, 1720], [1156, 1740], [1344, 1740]];

  /* ---------- overlays in world space */
  function drawWorldOverlay(c) {
    drawPots(c);
    // pad labels
    R.pads.forEach(function (p) { if (inView(p.x, p.y, 200)) drawPadLabel(c, p); });
    // stacks
    drawStack(c, P.x, P.y - 84 - (HAT_LIFT[META.hat] || 0), P.stack, P.sway, carryCap(), true);
    R.npcs.forEach(function (n) {
      if (!inView(n.x, n.y, 200)) return;
      if (n.stack && n.stack.length) drawStack(c, n.x, n.y - 78, n.stack, 0, 99, false);
      if (n.type === 'cust') drawBubble(c, n);
    });
    // flyers
    for (var i = 0; i < FLY.length; i++) {
      var f = FLY[i]; if (f.screen) continue;
      if (f.kind === 'coin') A.coin(c, f.x, f.y, f.size / 2);
      else A.itemC(c, f.type, f.x, f.y, f.size);
    }
    // particles
    for (var j = 0; j < PARTS.length; j++) drawPart(c, PARTS[j]);
    // texts
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (var k = 0; k < TEXTS.length; k++) {
      var tx = TEXTS[k]; if (tx.screen) continue;
      var a = 1 - Math.max(0, (tx.t - tx.life * 0.6) / (tx.life * 0.4)), sc = tx.t < 0.15 ? 0.5 + tx.t / 0.15 * 0.7 : 1.2 - Math.min(0.2, (tx.t - 0.15));
      c.save(); c.globalAlpha = Math.max(0, a); c.translate(tx.x, tx.y - tx.t * 50); c.scale(sc, sc);
      c.font = '700 ' + tx.size + 'px Fredoka, sans-serif';
      c.lineWidth = 7; c.strokeStyle = OUT; c.strokeText(dir(c, tx.text), 0, 0); c.fillStyle = tx.color; c.fillText(tx.text, 0, 0);
      c.restore();
    }
    // target arrow above hint target
    if (R.mode === 'play' && R.hint && showArrow()) {
      var h = R.hint, by = h.y - (h.pad || (h.text && R.pads.some(function (p) { return p.x === h.x && p.y === h.y; })) ? 205 : 110) + Math.sin(R.t * 6) * 10;
      if (inView(h.x, h.y, -40) && d2(P.x, P.y, h.x, h.y) > 70 * 70) {
        c.save(); c.translate(h.x, by);
        c.beginPath(); c.moveTo(-18, -22); c.lineTo(18, -22); c.lineTo(18, 2); c.lineTo(30, 2); c.lineTo(0, 30); c.lineTo(-30, 2); c.lineTo(-18, 2); c.closePath();
        c.fillStyle = h.urgent ? '#ff5d5d' : '#ffd23f'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 4; c.stroke();
        c.restore();
      }
    }
  }
  function drawPart(c, p) {
    var a = Math.max(0, Math.min(1, p.life / p.max * 1.5));
    c.globalAlpha = a; c.fillStyle = p.color;
    if (p.shape === 'conf') { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); c.restore(); }
    else if (p.shape === 'star') { A.star(c, p.x, p.y, 4, p.size, p.size * 0.4); c.fill(); }
    else if (p.shape === 'heart') { heart(c, p.x, p.y, p.size); c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke(); }
    else { A.circ(c, p.x, p.y, p.size / 2); c.fill(); }
    c.globalAlpha = 1;
  }
  function heart(c, x, y, s) {
    c.beginPath(); c.moveTo(x, y + s * 0.35);
    c.bezierCurveTo(x - s * 0.6, y - s * 0.1, x - s * 0.35, y - s * 0.6, x, y - s * 0.25);
    c.bezierCurveTo(x + s * 0.35, y - s * 0.6, x + s * 0.6, y - s * 0.1, x, y + s * 0.35);
    c.closePath();
  }
  function drawStack(c, x, y, stack, sway, cap, isPlayer) {
    var n = stack.length;
    for (var i = 0; i < n; i++) {
      var it = stack[i];
      var ix = x + sway * Math.pow(i, 1.25) * 3, iy = y - i * 14;
      if (it.f < 1) {
        var e = it.f, ee = e * e * (3 - 2 * e);
        ix = it.fx + (ix - it.fx) * ee; iy = it.fy + (iy - it.fy) * ee - Math.sin(e * Math.PI) * 50;
      }
      A.item(c, it.type, ix, iy + 12, 34);
    }
    if (isPlayer && n > 0) {
      var full = n >= cap;
      var ty = y - n * 14 - 24;
      c.font = '700 17px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      var txt = dir(c, full ? 'ممتلئ' : n + '/' + cap), w = c.measureText(txt).width + 16;
      A.rr(c, x + sway * Math.pow(n, 1.25) * 3 - w / 2, ty - 11, w, 22, 11); c.fillStyle = full ? '#ff5d5d' : 'rgba(40,30,60,0.8)'; c.fill();
      c.fillStyle = '#fff'; c.fillText(txt, x + sway * Math.pow(n, 1.25) * 3, ty + 1);
    }
  }
  function drawBubble(c, n) {
    var type = null, ico = null, cnt = 0;
    if (n.state === 'shop' || n.state === 'pick') {
      type = n.wants[n.wi];
      for (var i = n.wi; i < n.wants.length && n.wants[i] === type; i++) cnt++;
    } else if (n.state === 'queue' || n.state === 'paying') {
      if (n.qi === 0 && n.arrived && !n.reg.manned) ico = 'register';
      else return;
    } else if (n.state === 'leave' && n.mood < 0.3) {
      ico = 'sad';
    } else return;
    if (!type && !ico) return;
    var waitLong = n.state === 'pick' && n.wait > 5;
    var shake = waitLong ? Math.sin(R.t * 30) * 2 : 0;
    var x = n.x + 26 + shake, y = n.y - 112 + Math.sin(R.t * 3 + n.t) * 3;
    c.save(); c.translate(x, y);
    var s = n.pop < 1 ? easeOutBack(Math.max(0.01, n.pop)) : 1;
    c.scale(s, s);
    A.circ(c, -20, 34, 5); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.5; c.stroke();
    A.circ(c, -12, 24, 7); c.fill(); c.stroke();
    A.rr(c, -26, -24, 52, 48, 20); c.fillStyle = waitLong ? '#ffe3e3' : '#ffffff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    if (type) A.itemC(c, type, 0, 0, 38);
    else if (ico === 'register') { A.icon(c, 'register', 0, 0, 38); }
    else if (ico === 'sad') { c.font = '700 26px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#6b7085'; c.fillText(dir(c, ':('), 0, 1); }
    if (cnt > 1) { A.circ(c, 22, -20, 12); c.fillStyle = '#ff5d8f'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.5; c.stroke(); c.font = '700 15px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(dir(c, '×' + cnt), 22, -19); }
    if (waitLong) { A.circ(c, -24, -20, 11); c.fillStyle = '#ff5d5d'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.5; c.stroke(); c.font = '700 17px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(dir(c, '!'), -24, -19); }
    c.restore();
  }

  /* ---------- screen-space fx + HUD */
  function drawScreenFx(c) {
    for (var i = 0; i < FLY.length; i++) { var f = FLY[i]; if (f.screen) A.coin(c, f.x, f.y, f.size / 2); }
  }
  function pill(c, x, y, w, h, col) { A.rr(c, x, y, w, h, h / 2); c.fillStyle = col; c.fill(); }
  function drawHUD(c) {
    c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineCap = 'round';
    // coins
    var bump = R.coinBump;
    c.save(); c.translate(22, 16);
    pill(c, 0, 4, 230, 56, 'rgba(30,22,50,0.55)');
    c.save(); c.translate(28, 32); c.scale(1 + bump * 0.3, 1 + bump * 0.3); A.coin(c, 0, 0, 24); c.restore();
    c.font = '700 36px Fredoka, sans-serif'; c.textAlign = 'left';
    c.lineWidth = 6; c.strokeStyle = OUT; c.strokeText(dir(c, K.fmt(R.disp)), 60, 34); c.fillStyle = '#ffe14a'; c.fillText(K.fmt(R.disp), 60, 34);
    c.restore();
    // level bar
    var n = unlockedCount(), lvl = R.lvl, prog = (n % 3) / 3;
    if (n >= PAID_UNLOCKS) prog = 1;
    var bx = VW / 2 - 150, byy = 16;
    pill(c, bx, byy, 300, 54, 'rgba(30,22,50,0.55)');
    pill(c, bx + 58, byy + 11, 226, 14, 'rgba(255,255,255,0.25)');
    if (prog > 0) pill(c, bx + 58, byy + 11, Math.max(14, 226 * prog), 14, '#7ef0ff');
    A.star(c, bx + 28, byy + 27, 5, 24, 11); c.fillStyle = '#ffd23f'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    c.font = '700 18px Fredoka, sans-serif'; c.textAlign = 'center'; c.fillStyle = OUT; c.fillText(dir(c, lvl), bx + 28, byy + 29);
    c.font = '700 14px Fredoka, sans-serif'; c.fillStyle = '#fff'; c.fillText(dir(c, 'مستوى السوق ' + lvl + '  ·  فتحت ' + n + ' من ' + PAID_UNLOCKS), bx + 171, byy + 38);
    // rush timer
    if (R.rush > 0) {
      c.save(); c.translate(VW / 2, 100); var rs = 1 + Math.sin(R.t * 10) * 0.04; c.scale(rs, rs);
      pill(c, -120, -20, 240, 40, '#ff7a59'); c.strokeStyle = OUT; c.lineWidth = 3; A.rr(c, -120, -20, 240, 40, 20); c.stroke();
      c.font = '700 22px Fredoka, sans-serif'; c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(dir(c, 'وقت الزحمة  ' + Math.ceil(R.rush) + ' ث'), 0, 1);
      c.restore();
    }
    // hint
    if (R.hint && R.mode === 'play' && (S.tut < 5 || showArrow())) {
      var h = R.hint;
      c.font = '700 24px Fredoka, sans-serif'; c.textAlign = 'right';
      var tw = c.measureText(dir(c, h.text)).width;
      if (tw > VW - 130) { c.font = '700 ' + Math.floor(24 * (VW - 130) / tw) + 'px Fredoka, sans-serif'; tw = c.measureText(h.text).width; }
      var w = Math.min(VW - 40, tw + 84), x = VW / 2 - w / 2, y = VH - 74;
      var pulse = S.tut < 5 ? 1 + Math.sin(R.t * 5) * 0.02 : 1;
      c.save(); c.translate(VW / 2, y + 26); c.scale(pulse, pulse); c.translate(-VW / 2, -(y + 26));
      A.rr(c, x, y + 4, w, 52, 26); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fill();
      A.rr(c, x, y, w, 52, 26); c.fillStyle = h.urgent ? '#ff6b6b' : '#ffffff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 4; c.stroke();
      if (h.icon === 'coin') A.coin(c, x + w - 34, y + 26, 17);
      else A.icon(c, h.icon, x + w - 34, y + 26, 38);
      c.fillStyle = h.urgent ? '#ffffff' : '#3a2a50'; c.fillText(h.text, x + w - 60, y + 28);
      c.restore();
    }
    // off-screen hint arrow
    if (R.hint && R.mode === 'play' && showArrow()) {
      var sp = worldToScreen(R.hint.x, R.hint.y - 40);
      var m = 60;
      if (sp.x < m || sp.x > VW - m || sp.y < m + 40 || sp.y > VH - m - 60) {
        var cx = VW / 2, cy = VH / 2, dx = sp.x - cx, dy = sp.y - cy;
        var sc = Math.min((VW / 2 - m) / Math.abs(dx || 1), (VH / 2 - m - 50) / Math.abs(dy || 1));
        var ax = cx + dx * sc, ay = cy + dy * sc, ang = Math.atan2(dy, dx);
        c.save(); c.translate(ax, ay);
        var pl = 1 + Math.sin(R.t * 8) * 0.08; c.scale(pl, pl);
        A.circ(c, 0, 0, 30); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 4; c.stroke();
        if (R.hint.icon === 'coin') A.coin(c, 0, 0, 16); else A.icon(c, R.hint.icon, 0, 0, 36);
        c.rotate(ang); arrowShape(c, 42, 0, 0, 16, R.hint.urgent ? '#ff5d5d' : '#ffd23f');
        c.beginPath(); c.moveTo(58, 0); c.lineTo(35.6, -12.8); c.lineTo(35.6, 12.8); c.closePath(); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
        c.restore();
      }
    }
    // banners
    for (var i = 0; i < R.banners.length; i++) {
      var b = R.banners[i], t = b.t, life = b.life;
      var inT = Math.min(1, t / 0.35), outT = Math.max(0, (t - (life - 0.4)) / 0.4);
      var sc2 = easeOutBack(inT) * (1 - outT * 0.3), al = 1 - outT;
      var yy = 150 + i * 88;
      c.save(); c.globalAlpha = al; c.translate(VW / 2, yy); c.scale(sc2, sc2);
      c.font = '700 44px Fredoka, sans-serif'; c.textAlign = 'center';
      c.lineWidth = 10; c.strokeStyle = OUT; c.strokeText(dir(c, b.text), 0, 0);
      c.fillStyle = b.color; c.fillText(b.text, 0, 0);
      if (b.sub) {
        c.font = '700 22px Fredoka, sans-serif';
        c.lineWidth = 6; c.strokeText(dir(c, b.sub), 0, 38); c.fillStyle = '#ffffff'; c.fillText(b.sub, 0, 38);
      }
      c.restore();
    }
  }

  /* ========================================================= UI (DOM) */
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    title: $('title'), pause: $('pause'), welcome: $('welcome'), finale: $('finale'), confirm: $('confirm'),
    upg: $('upgrades'), upgList: $('upgList'), pauseBtn: $('pauseBtn'), hats: $('hats'), prog: $('prog'), hero: $('hero')
  };
  var muteBtn = K.muteButton();
  muteBtn.setAttribute('aria-label', 'الصوت'); muteBtn.title = 'الصوت (M)';

  function show(o, on) { if (on) o.removeAttribute('hidden'); else o.setAttribute('hidden', ''); }
  var titleSize = null;
  function fitUI() {
    var s = Math.min(window.innerWidth / 1100, window.innerHeight / 640);
    // never let the (tall) title card run past the window edges
    var tc = document.querySelector('.cm-title-card');
    if (tc && tc.offsetHeight) titleSize = { w: tc.offsetWidth, h: tc.offsetHeight };
    if (titleSize) s = Math.min(s, (window.innerWidth - 16) / titleSize.w, (window.innerHeight - 24) / (titleSize.h + 10));
    s = Math.max(0.45, Math.min(1.5, s));
    document.documentElement.style.setProperty('--ui', s.toFixed(3));
  }
  window.addEventListener('resize', fitUI); fitUI();

  function setMode(m) {
    R.mode = m;
    try { if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* ignore */ }
    show(el.title, m === 'title');
    show(el.pause, m === 'pause');
    show(el.welcome, m === 'welcome');
    show(el.finale, m === 'finale');
    show(el.confirm, m === 'confirm');
    show(el.pauseBtn, m === 'play');
    if (m !== 'play') { show(el.upg, false); upgVisible = false; }
    mouseHeld = false;
  }

  function titleInfo() {
    var n = unlockedCount();
    if (n === 0 && S.coins === 0 && S.tut === 0) { el.prog.innerHTML = 'متجرك الخاص بانتظارك!'; $('playBtn').textContent = 'العب!'; }
    else { el.prog.innerHTML = '<b>مستوى السوق ' + levelFor(n) + '</b> · فتحت ' + n + ' من ' + PAID_UNLOCKS + ' · <span class="cm-coin"></span> ' + K.fmt(S.coins); $('playBtn').textContent = 'تابع!'; }
    $('newBtn').style.display = (n > 0 || S.tut > 0) ? '' : 'none';
    $('bestLine').textContent = META.best ? 'أسرع إنهاء للسوق: ' + fmtTime(META.best) : '';
    buildHats();
    fitUI();
  }
  function buildHats() {
    el.hats.innerHTML = '';
    CM.HATS.forEach(function (h) {
      var b = document.createElement('button');
      b.type = 'button';
      var locked = h.lvl > Math.max(META.maxLvl, R.lvl);
      b.className = 'cm-hat' + (META.hat === h.id ? ' on' : '') + (locked ? ' locked' : '');
      var cv = document.createElement('canvas'); cv.width = 84; cv.height = 84;
      var c2 = cv.getContext('2d'); c2.scale(1.4, 1.4);
      A.head(c2, 'raccoon', 30, 36, 0.95, { hat: h.id });
      if (locked) { c2.fillStyle = 'rgba(40,30,60,0.55)'; c2.fillRect(0, 0, 60, 60); A.icon(c2, 'lock', 30, 30, 34); }
      b.appendChild(cv);
      var sp = document.createElement('span'); sp.textContent = locked ? 'مستوى ' + h.lvl : h.name; b.appendChild(sp);
      b.addEventListener('click', function () {
        if (locked) { SFX.no(); return; }
        META.hat = h.id; saveMeta(); SFX.click(); buildHats();
      });
      el.hats.appendChild(b);
    });
  }
  function fmtTime(sec) { var m = Math.floor(sec / 60), s = Math.floor(sec % 60); return m + ':' + (s < 10 ? '0' : '') + s; }

  function startPlay() {
    au.unlock();
    SFX.click();
    setMode('play');
    K.keys.reset();
    R.cam.x = P.x; R.cam.y = P.y - 40; camUpdate(0, true);
    if (R.welcome > 0) { setMode('welcome'); $('welcomeAmt').textContent = K.fmt(R.welcome); }
    if (S.tut === 0 && P.stack.length === 0) banner('أهلًا في سوق الحيوانات!', 'هيا نربح العملات!', '#ffd23f', 2.6);
  }
  function closeWelcome() {
    if (R.welcome > 0) {
      S.coins += R.welcome; S.stats.earned += R.welcome;
      for (var i = 0; i < 12; i++) fly('coin', null, VW / 2 + rnd(-100, 100), VH / 2 + rnd(-40, 40), { x: 50, y: 42 }, 0.5 + i * 0.05, rnd(60, 160), 28, function () { R.coinBump = 1; }, true);
      SFX.coins(8);
      R.welcome = 0;
      saveGame();
    }
    setMode('play');
  }
  function pauseGame() { if (R.mode !== 'play') return; saveGame(); setMode('pause'); $('musicBtn').textContent = 'الموسيقى: ' + (META.music ? 'تعمل' : 'متوقفة'); }
  function resumeGame() { SFX.click(); setMode('play'); K.keys.reset(); }
  function toMenu() { saveGame(); setMode('title'); titleInfo(); }
  var confirmFrom = 'title';
  function askNewStore() { confirmFrom = R.mode; setMode('confirm'); }
  function newStore() {
    S = freshSave(); R.welcome = 0; R.firstCust = false; R.rush = 0; R.rushT = 150; R.spawnT = 2; R.finaleT = -1;
    store.set('save', S);
    buildWorld();
    R.disp = 0;
    setMode('title'); titleInfo();
  }
  function showFinale() {
    var t = S.stats.play;
    var isBest = !S.cheat && (!META.best || t < META.best);
    if (!S.done) { if (isBest) META.best = t; S.done = true; saveMeta(); saveGame(); }
    $('finStats').innerHTML = '<div><b>' + fmtTime(t) + '</b><span>الوقت</span></div><div><b>' + K.fmt(S.stats.served) + '</b><span>زبون سعيد</span></div><div><b>' + K.fmt(S.stats.earned) + '</b><span>عملة ربحتها</span></div>';
    show($('finBest'), isBest);
    setMode('finale');
    SFX.level(); setTimeout(function () { K.sfx.win(); }, 700);
    confetti(R.cam.x, R.cam.y - 200, 120);
  }
  function closeFinale() { setMode('play'); banner('تابع البيع!', 'سوقك هو الأفضل في المدينة!', '#ffd23f', 2.4); }

  $('playBtn').addEventListener('click', startPlay);
  $('newBtn').addEventListener('click', function () { SFX.click(); askNewStore(); });
  $('resumeBtn').addEventListener('click', resumeGame);
  $('menuBtn').addEventListener('click', function () { SFX.click(); toMenu(); });
  $('restartBtn').addEventListener('click', function () { SFX.click(); askNewStore(); });
  $('musicBtn').addEventListener('click', function () { META.music = !META.music; saveMeta(); au.unlock(); SFX.click(); $('musicBtn').textContent = 'الموسيقى: ' + (META.music ? 'تعمل' : 'متوقفة'); });
  $('yesBtn').addEventListener('click', function () { SFX.click(); newStore(); });
  $('noBtn').addEventListener('click', function () { SFX.click(); if (confirmFrom === 'pause') setMode('pause'); else if (confirmFrom === 'finale') setMode('finale'); else { setMode('title'); titleInfo(); } });
  $('collectBtn').addEventListener('click', closeWelcome);
  $('keepBtn').addEventListener('click', closeFinale);
  $('finNewBtn').addEventListener('click', function () { SFX.click(); askNewStore(); });
  $('finMenuBtn').addEventListener('click', function () { SFX.click(); toMenu(); });
  el.pauseBtn.addEventListener('click', function (e) { e.stopPropagation(); pauseGame(); });
  el.pauseBtn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  window.addEventListener('keydown', function (e) {
    if (R.mode === 'confirm') {
      if (e.code === 'Escape' || e.code === 'KeyN') { $('noBtn').click(); }
      else if (e.code === 'KeyY') { $('yesBtn').click(); }
    }
  });

  // Upgrade panel
  var upgRows = {};
  function buildUpgPanel() {
    el.upgList.innerHTML = '';
    CM.UPGRADES.forEach(function (u, i) {
      var row = document.createElement('button'); row.type = 'button'; row.className = 'cm-upg-row';
      var img = document.createElement('img'); img.src = A.iconURL(u.icon); img.alt = '';
      var mid = document.createElement('div'); mid.className = 'cm-upg-mid';
      var nm = document.createElement('div'); nm.className = 'cm-upg-name'; nm.textContent = u.name;
      var ds = document.createElement('div'); ds.className = 'cm-upg-desc'; ds.textContent = u.desc;
      var pips = document.createElement('div'); pips.className = 'cm-pips';
      mid.appendChild(nm); mid.appendChild(ds); mid.appendChild(pips);
      var cost = document.createElement('div'); cost.className = 'cm-upg-cost';
      var key = document.createElement('span'); key.className = 'sg-key cm-upg-key'; key.textContent = (i + 1);
      row.appendChild(key); row.appendChild(img); row.appendChild(mid); row.appendChild(cost);
      row.addEventListener('click', function () { buyUpgrade(u.id); });
      row.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      el.upgList.appendChild(row);
      upgRows[u.id] = { row: row, pips: pips, cost: cost, last: '' };
    });
  }
  var upgVisible = false;
  function renderUpgrades(force) {
    var want = R.mode === 'play' && P.onDesk;
    if (want !== upgVisible) { upgVisible = want; show(el.upg, want); if (want) { SFX.click(); force = true; } }
    if (!want) return;
    CM.UPGRADES.forEach(function (u) {
      var r = upgRows[u.id], l = lv(u.id), max = u.costs.length;
      var locked = u.needs && !isUnlocked(u.needs);
      var c = l < max ? u.costs[l] : 0;
      var state = locked ? 'locked' : (l >= max ? 'max' : (S.coins >= c ? 'yes' : 'no'));
      var sig = state + l + '|' + c;
      if (!force && r.last === sig) return;
      r.last = sig;
      r.row.className = 'cm-upg-row ' + state;
      var ph = '';
      for (var i = 0; i < max; i++) ph += '<i class="' + (i < l ? 'on' : '') + '"></i>';
      r.pips.innerHTML = ph;
      r.cost.innerHTML = locked ? 'وظّف كاشير<br>أولًا' : (l >= max ? 'مكتمل' : '<span class="cm-coin"></span>' + K.fmt(c));
    });
  }

  /* ========================================================= save/load */
  function saveGame() {
    if (R.noSave) return;
    S.px = Math.round(P.x); S.py = Math.round(P.y);
    S.carry = P.stack.map(function (s) { return s.type; });
    S.shelves = {}; R.shelves.forEach(function (s) { S.shelves[s.id] = s.count; });
    S.mach = {}; R.machines.forEach(function (m) { S.mach[m.id] = { i: m.inCount, o: m.outCount }; });
    S.piles = {}; R.registers.forEach(function (r) { S.piles[r.id] = Math.floor(r.pile); });
    // customers carrying items walk away when the page closes; nothing else to store
    S.last = Date.now();
    S.coins = Math.floor(S.coins);
    store.set('save', S);
  }
  function saveMeta() { store.set('meta', META); }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (R.mode === 'play') pauseGame(); else saveGame(); }
  });
  window.addEventListener('beforeunload', function () { if (R.noSave) return; if (R.mode !== 'title' || S.tut > 0) saveGame(); });

  function offlineEarnings() {
    if (!S.last) return 0;
    var el2 = (Date.now() - S.last) / 1000;
    if (el2 < 60 || S.rate <= 0) return 0;
    var hasHelper = isUnlocked('cashier');
    var amt = Math.floor(Math.min(el2, 3600) * S.rate * (hasHelper ? 0.4 : 0.12));
    return amt >= 5 ? amt : 0;
  }

  /* ========================================================= title hero */
  var heroCtx = el.hero.getContext('2d');
  function drawHero() {
    var c = heroCtx, W = 880, H = 268, t = R.t;
    // backing store matches the on-screen size so the logo stays crisp when the card is scaled up
    var ui = parseFloat(document.documentElement.style.getPropertyValue('--ui')) || 1;
    var k = Math.max(1, Math.min(2.5, ui * (window.devicePixelRatio || 1)));
    if (Math.abs(el.hero.width - Math.round(W * k)) > 1) { el.hero.width = Math.round(W * k); el.hero.height = Math.round(H * k); }
    c.setTransform(el.hero.width / W, 0, 0, el.hero.height / H, 0, 0);
    c.clearRect(0, 0, W, H);
    c.lineJoin = 'round'; c.lineCap = 'round';
    // sun rays
    c.save(); c.translate(W / 2, H * 0.62); c.rotate(t * 0.15);
    for (var i = 0; i < 14; i++) { c.rotate(TAU / 14); c.beginPath(); c.moveTo(0, 0); c.lineTo(-40, -520); c.lineTo(40, -520); c.closePath(); c.fillStyle = i % 2 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)'; c.fill(); }
    c.restore();
    // logo: two whole Arabic words (never letter by letter, so the letters stay joined).
    // RTL: the first word "سوق" sits on the right.
    var words = [['سوق', '#ffcf3f'], ['الحيوانات', '#ff7a59']];
    c.font = '700 88px Fredoka, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'center'; c.direction = 'rtl';
    var gap = 26, w0 = c.measureText(words[0][0]).width, w1 = c.measureText(words[1][0]).width;
    var total = w0 + gap + w1, xr = W / 2 + total / 2 - 30, y = 84;
    for (var k = 0; k < words.length; k++) {
      var wd = words[k][0], cw = k === 0 ? w0 : w1, cx0 = k === 0 ? xr - w0 / 2 : xr - w0 - gap - w1 / 2;
      var by = Math.sin(t * 3 - k * 1.3) * 6;
      c.save(); c.translate(cx0, y + by); c.rotate(Math.sin(t * 2 + k * 2) * 0.03);
      c.lineWidth = 18; c.strokeStyle = OUT; c.strokeText(wd, 0, 6);
      c.strokeText(wd, 0, 0);
      c.fillStyle = words[k][1]; c.fillText(wd, 0, 0);
      c.fillStyle = 'rgba(255,255,255,0.3)'; c.save(); c.beginPath(); c.rect(-cw / 2 - 10, -46, cw + 20, 26); c.clip(); c.fillText(wd, 0, 0); c.restore();
      c.restore();
    }
    // tagline ribbon
    c.save(); c.translate(W / 2 - 30, 158);
    A.rr(c, -170, -20, 340, 40, 20); c.fillStyle = '#1fb5a8'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 4; c.stroke();
    c.font = '700 26px Fredoka, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(dir(c, 'ازرع! رتّب! بِع!'), 0, 3);
    c.restore();
    // mascot with stack
    var mx = W - 110, my = H - 18;
    A.critter(c, { sp: 'raccoon', x: mx, y: my, s: 1.9, t: t, moving: true, phase: t * 7, look: -0.4, apron: '#1fb5a8', pocket: '#ffd23f', hat: META.hat, carryArms: true, blink: (t % 3) < 0.12 });
    var stack = ['corn', 'milk', 'banana'];
    var lift = (HAT_LIFT[META.hat] || 0) * 1.9;
    for (var s = 0; s < (lift > 20 ? 2 : 3); s++) A.item(c, stack[s], mx + Math.sin(t * 7 + 1) * s * 1.2, my - 132 - lift - s * 27, 46);
    // bunny customer on left
    A.critter(c, { sp: 'bunny', x: 110, y: H - 18, s: 1.7, t: t + 2, look: 0.4, basket: ['apple', 'popcorn'], moving: true, phase: t * 6 + 1, bow: '#ff5d8f' });
    // coins
    for (var q = 0; q < 5; q++) { var cx = 210 + q * 30, cy = H - 30 - Math.abs(Math.sin(t * 4 + q)) * 26; A.coin(c, cx, cy, 13); }
  }

  /* ========================================================= loop */
  function frame() {
    render();
    if (R.mode === 'title') drawHero();
  }
  K.loop(update, frame);

  /* ========================================================= bot (debug / balancing) */
  var BOT = { job: null, t: 0 };
  function botInput(dt) {
    BOT.t -= dt;
    var j = BOT.job;
    BOT.cool -= dt;
    if ((!j || BOT.t <= 0 || j.done()) && !(BOT.cool > 0)) { BOT.cool = 0.25; BOT.job = j = botChoose(); BOT.t = 20; P.path = j ? findPath(P.x, P.y, j.x, j.y) : null; P.pi = 0; }
    if (!j) return { x: 0, y: 0 };
    if (j.buy) j.buy();
    if (P.path && P.pi < P.path.length) {
      var p = P.path[P.pi], dx = p.x - P.x, dy = p.y - P.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 8) { P.pi++; return { x: 0, y: 0 }; }
      return { x: dx / d, y: dy / d };
    }
    return { x: 0, y: 0 };
  }
  function botChoose() {
    var i;
    for (i = 0; i < R.registers.length; i++) {
      var r = R.registers[i];
      if (r.queue.length && r.queue[0].arrived && !(r.helper && r.helper.atPost)) {
        return { x: r.d.cashier.x, y: r.d.cashier.y, done: (function (rr) { return function () { return !rr.queue.length || !rr.queue[0].arrived; }; })(r) };
      }
    }
    for (i = 0; i < R.registers.length; i++) { var rg = R.registers[i]; if (rg.pile >= 1) return { x: rg.d.pile.x, y: rg.d.pile.y, done: (function (rr) { return function () { return rr.pile < 1; }; })(rg) }; }
    var pad = null;
    R.pads.forEach(function (p) { if (S.coins >= p.d.cost - p.paid && (!pad || p.d.cost < pad.d.cost)) pad = p; });
    if (pad) return { x: pad.x, y: pad.y, done: function () { return !isUnlocked(pad.d.id) ? S.coins < 1 : true; } };
    if (R.byId.desk) {
      var cheap = null;
      CM.UPGRADES.forEach(function (u) { var l = lv(u.id); if (l < u.costs.length && !(u.needs && !isUnlocked(u.needs)) && u.costs[l] <= S.coins * 0.6 && (!cheap || u.costs[l] < cheap.c)) cheap = { u: u, c: u.costs[l] }; });
      if (cheap) { var dk = R.byId.desk; return { x: dk.x, y: dk.y, buy: function () { if (P.onDesk) buyUpgrade(cheap.u.id); }, done: function () { return lv(cheap.u.id) > 0 && P.onDesk && S.coins < cheap.c; } }; }
    }
    if (P.stack.length) {
      var type = P.stack[P.stack.length - 1].type, dst = null;
      R.shelves.forEach(function (s) { if (!dst && accepts(s, type)) dst = s; });
      R.machines.forEach(function (m) { if (!dst && accepts(m, type)) dst = m; });
      if (dst) { var dp = dst.kind === 'machine' ? dst.inMat : { x: dst.x, y: dst.y + 60 }; return { x: dp.x, y: dp.y, done: function () { return topIndexOf(P.stack, type) < 0 || !accepts(dst, type); } }; }
      var tr = R.byId.trash; return { x: tr.x + 40, y: tr.y, done: function () { return !P.stack.length; } };
    }
    var task = chooseTask(P, carryCap());
    if (task) {
      var sp = srcPoint(task.src);
      return { x: sp.x, y: sp.y, done: function () { return P.stack.length >= Math.min(carryCap(), task.n) || availAt(task.src) < 1; } };
    }
    return { x: 1250, y: 1300, done: function () { return true; } };
  }

  /* ========================================================= boot */
  buildUpgPanel();
  Array.prototype.forEach.call(document.querySelectorAll('[data-icon]'), function (im) { im.src = A.iconURL(im.getAttribute('data-icon')); });
  buildWorld();
  R.welcome = offlineEarnings();
  titleInfo();
  setMode('title');
  if (document.fonts && document.fonts.load) {
    // make sure the Arabic half of the composite Fredoka family is ready for canvas text
    try { document.fonts.load('700 20px Fredoka', 'سوق'); document.fonts.load('700 20px Fredoka', '0'); document.fonts.ready.then(fitUI); } catch (e) { /* ignore */ }
  }

  window.__game = {
    get mode() { return R.mode; },
    state: function () {
      var custs = R.npcs.filter(function (n) { return n.type === 'cust'; });
      return { mode: R.mode, coins: Math.floor(S.coins), lvl: R.lvl, unlocked: unlockedCount(), total: PAID_UNLOCKS, tut: S.tut,
        customers: custs.length, helpers: R.npcs.length - custs.length, stack: P.stack.map(function (s) { return s.type; }),
        pads: R.pads.map(function (p) { return p.d.id + ':' + p.paid + '/' + p.d.cost; }), up: S.up, player: { x: Math.round(P.x), y: Math.round(P.y) },
        served: S.stats.served, earned: S.stats.earned, play: Math.round(S.stats.play), rush: R.rush > 0, done: S.done,
        shelves: R.shelves.map(function (s) { return s.item + ':' + s.count; }), piles: R.registers.map(function (r) { return Math.floor(r.pile); }), parts: PARTS.length, fly: FLY.length };
    },
    give: function (n) { S.coins += n; },
    tp: function (x, y) { P.x = x; P.y = y; P.path = null; },
    unlockNext: function () {
      var p = R.pads.slice().sort(function (a, b) { return a.d.cost - b.d.cost; })[0];
      if (p) { S.cheat = true; doUnlock(p.d); return p.d.id; } return null;
    },
    unlockAll: function () { S.cheat = true; var n = 0; while (R.pads.length && n++ < 60) this.unlockNext(); R.finaleT = -1; },
    finale: function () { R.finaleT = 0.01; },
    fakeAway: function (sec, rate) { saveGame(); S.last = Date.now() - sec * 1000; S.rate = rate; store.set('save', S); R.noSave = true; },
    bot: function (on) { R.bot = !!on; BOT.job = null; },
    speed: function (n) { R.timeScale = Math.max(1, Math.min(20, n | 0)); },
    start: startPlay,
    pause: pauseGame,
    resume: resumeGame,
    hint: function () { return R.hint && R.hint.text; },
    dbg: DBG,
    ulog: ULOG,
    countOps: function () {
      var names = ['fill', 'stroke', 'fillRect', 'drawImage', 'fillText', 'strokeText', 'arc', 'ellipse', 'setLineDash'], cnt = {}, orig = {};
      names.forEach(function (n) { cnt[n] = 0; orig[n] = CanvasRenderingContext2D.prototype[n]; CanvasRenderingContext2D.prototype[n] = function () { cnt[n]++; return orig[n].apply(this, arguments); }; });
      render();
      names.forEach(function (n) { CanvasRenderingContext2D.prototype[n] = orig[n]; });
      return cnt;
    },
    bench: function () {
      var t0 = performance.now(); for (var i = 0; i < 20; i++) render(); var t1 = performance.now();
      for (var j = 0; j < 60; j++) step(1 / 60); var t2 = performance.now();
      var t3 = performance.now(); for (var k = 0; k < 20; k++) drawHero(); var t4 = performance.now();
      var g0 = performance.now(); for (var m = 0; m < 20; m++) { ctx.save(); ctx.translate(VW / 2, VH / 2); ctx.scale(ZOOM, ZOOM); ctx.translate(-R.cam.x, -R.cam.y); drawGround(ctx); ctx.restore(); } var g1 = performance.now();
      return { render: (t1 - t0) / 20, step: (t2 - t1) / 60, hero: (t4 - t3) / 20, ground: (g1 - g0) / 20 };
    },
    npcs: function () { return R.npcs.map(function (n) { return [n.type, n.role || n.sp, n.state, Math.round(n.x), Math.round(n.y), n.path ? n.path.length : -1, n.pi, n.arrived, n.qi, n.wi + '/' + (n.wants ? n.wants.length : 0)].join(','); }); },
    save: saveGame,
    S: function () { return S; },
    setTut: function (n) { S.tut = n; },
    spawn: function () { spawnCustomer(false); },
    rush: function () { R.rushT = 0.01; },
    praise: function (n) { for (var i = 0; i < (n || 2); i++) praiseSale(R.registers[0]); return R.combo; }
  };
})();
