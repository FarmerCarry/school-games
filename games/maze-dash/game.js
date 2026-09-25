/*
 * Maze Dash (اندفاع المتاهة) — main game.
 * Dash-maze arcade: the masked blob dashes in a direction until it hits a wall.
 * Modes: 30 hand-made levels with 3 stars each, and the endless "Rising Goo".
 * Depends on: shared/kit.js, core.js (MDCore), levels.js (MD_LEVELS),
 *             masks.js (MDMasks), endless.js (MDEndless).
 * Debug hook: window.__game (state, skip(n), win(), god, autoplay, speed).
 */
(function () {
  'use strict';

  var C = window.MDCore, T = C.T, I = C.I, TM = C.TIMING, LEVELS = window.MD_LEVELS, MK = window.MDMasks;
  var W = 1280, H = 720, COLS = 13;
  var DASH_SPEED = 24; // tiles per second
  var COIN_VALUE = 5;  // one coin pickup = 5 coins (x2 with the doubler)
  var STAR_BONUS = 10; // coins for every star earned for the first time

  /* ------------------------------------------------------------ setup */
  var canvas = document.getElementById('game');
  var view = Kit.fit(canvas, W, H);
  var ctx = view.ctx;
  var store = Kit.store('maze-dash');
  var fx = Kit.particles();
  var shake = Kit.shake();
  var muteBtn = Kit.muteButton();
  muteBtn.setAttribute('aria-label', 'تشغيل الصوت أو كتمه');
  try { document.fonts.load('700 40px Fredoka', 'بـ'); document.fonts.load('500 20px Fredoka', 'بـ'); } catch (e) { /* ignore */ }

  var WORLDS = [
    { name: 'سرداب الأشواك', wall: '#2c0d5c', wallHi: '#3d1880', edge: '#ffe600', floor: '#0c0419', dot: '#ffe600', spike: '#ff3f6c' },
    { name: 'كهف الخفافيش', wall: '#08305a', wallHi: '#0e4478', edge: '#34f5ff', floor: '#03101f', dot: '#fff27a', spike: '#ff3f6c' },
    { name: 'مصنع التروس', wall: '#46180a', wallHi: '#632610', edge: '#ff9a1f', floor: '#150703', dot: '#ffe600', spike: '#ff3fa4' }
  ];
  var GOO_PALS = [
    { wall: '#2c0d5c', wallHi: '#3d1880', edge: '#ffe600', floor: '#0c0419', dot: '#ffe600', spike: '#ff3f6c' },
    { wall: '#3d0a44', wallHi: '#5a1263', edge: '#ff3fa4', floor: '#12031a', dot: '#fff27a', spike: '#ffe600' },
    { wall: '#08305a', wallHi: '#0e4478', edge: '#34f5ff', floor: '#03101f', dot: '#fff27a', spike: '#ff3f6c' },
    { wall: '#133d0a', wallHi: '#1d5a10', edge: '#b6ff3a', floor: '#061203', dot: '#ffe600', spike: '#ff3fa4' },
    { wall: '#46180a', wallHi: '#632610', edge: '#ff9a1f', floor: '#150703', dot: '#ffe600', spike: '#ff3fa4' }
  ];

  /* ------------------------------------------------------------- save */
  var save = (function () {
    var s = store.get('save', null) || {};
    if (typeof s !== 'object') s = {};
    s.coins = s.coins | 0;
    s.lv = s.lv || {};
    s.owned = Array.isArray(s.owned) ? s.owned : [0];
    if (s.owned.indexOf(0) < 0) s.owned.push(0);
    s.mask = s.mask | 0;
    if (s.owned.indexOf(s.mask) < 0) s.mask = 0;
    s.bestH = s.bestH | 0;
    s.bestScore = s.bestScore | 0;
    s.tips = s.tips || {};
    s.runs = s.runs | 0;
    return s;
  })();
  function persist() { store.set('save', save); }
  function levelInfo(n) { return save.lv[n] || null; }
  function starCount(n) { var l = save.lv[n]; if (!l) return 0; return (l.s & 1 ? 1 : 0) + (l.s & 2 ? 1 : 0) + (l.s & 4 ? 1 : 0); }
  function totalStars() { var t = 0; for (var i = 1; i <= LEVELS.length; i++) t += starCount(i); return t; }
  function unlockedUpTo() { var n = 1; while (n < LEVELS.length && save.lv[n] && save.lv[n].done) n++; return n; }
  function nextLevelToPlay() {
    var u = unlockedUpTo();
    if (u < LEVELS.length || !(save.lv[u] && save.lv[u].done)) return u;
    for (var i = 1; i <= LEVELS.length; i++) if (starCount(i) < 3) return i;
    return 1;
  }

  /* ------------------------------------------------------------ world */
  function World() {
    this.rows = {};
    this.bats = []; this.traps = []; this.puffers = []; this.blocks = [];
    this.trapMap = {}; this.pufMap = {};
  }
  World.prototype.ensureRow = function (y) {
    var r = this.rows[y];
    if (!r) {
      r = { t: new Uint8Array(COLS), it: new Uint8Array(COLS), lock: new Uint8Array(COLS) };
      r.t.fill(T.WALL);
      this.rows[y] = r;
    }
    return r;
  };
  World.prototype.tile = function (x, y) {
    if (x < 0 || x >= COLS) return T.WALL;
    var r = this.rows[y];
    return r ? r.t[x] : T.WALL;
  };
  World.prototype.item = function (x, y) {
    if (x < 0 || x >= COLS) return 0;
    var r = this.rows[y];
    return r ? r.it[x] : 0;
  };
  World.prototype.setItem = function (x, y, v) { var r = this.rows[y]; if (r && x >= 0 && x < COLS) r.it[x] = v; };
  World.prototype.addBat = function (b) { this.bats.push(b); };
  World.prototype.addTrap = function (tr) { this.traps.push(tr); this.trapMap[C.key(tr.x, tr.y)] = tr; };
  World.prototype.addPuffer = function (p) { this.puffers.push(p); this.pufMap[C.key(p.x, p.y)] = p; };
  World.prototype.pufferAt = function (x, y) { return this.pufMap[C.key(x, y)] || null; };
  World.prototype.prune = function (belowY) {
    var k;
    for (k in this.rows) if (+k > belowY) delete this.rows[k];
    var self = this;
    this.bats = this.bats.filter(function (b) { return (b.axis === 0 ? b.y : b.min) <= belowY; });
    this.traps = this.traps.filter(function (t) { if (t.y > belowY) { delete self.trapMap[C.key(t.x, t.y)]; return false; } return true; });
    this.puffers = this.puffers.filter(function (p) { if (p.y > belowY) { delete self.pufMap[C.key(p.x, p.y)]; return false; } return true; });
  };

  function worldFromLevel(def) {
    var L = C.parseLevel(def), w = new World(), x, y;
    for (y = 0; y < L.h; y++) {
      var r = w.ensureRow(y);
      for (x = 0; x < COLS; x++) { r.t[x] = L.tiles[y * L.w + x]; r.it[x] = L.items[y * L.w + x]; }
    }
    L.bats.forEach(function (b) { w.addBat({ x: b.x, y: b.y, axis: b.axis, min: b.min, max: b.max, speed: b.speed, off: b.off }); });
    L.traps.forEach(function (t) { w.addTrap({ x: t.x, y: t.y, off: t.off }); });
    L.puffers.forEach(function (p) { w.addPuffer({ x: p.x, y: p.y, off: p.off }); });
    L.blocks.forEach(function (b) { w.blocks.push({ x: b.x, y: b.y, dx: b.dx, dy: b.dy, fx: b.x, fy: b.y, anim: 1 }); });
    return { world: w, L: L };
  }

  /* ------------------------------------------------------------- state */
  var G = {
    screen: 'title',      // title | levels | shop | play | pause | win | fail | over
    mode: 'level',        // level | endless
    phase: 'play',        // play | dying | exiting
    phaseT: 0,
    levelN: 1, def: null, L: null, world: null,
    tile: 44, mx: 0, cam: 0,
    ht: 0, time: 0, blockT: 0, blockStep: TM.BLOCK_STEP, blockSteps: 0,
    hearts: 3, hits: 0, dotsGot: 0, dotsTotal: 0, coinsGot: 0, dotsInDash: 0,
    freezeT: 0, magnetT: 0, doubleT: 0, shield: false,
    popups: [], banner: null, firstMoveDone: false,
    gen: null, gooY: 0, gooStarted: false, height: 0, maxHeight: 0, nextMilestone: 50, pal: GOO_PALS[0], palIdx: 0,
    god: false, autoplay: false, speed: 1, ai: null,
    menuT: 0
  };
  var P = {
    x: 0, y: 0, cx: 0, cy: 0, dir: -1, moving: false, sx: 1, sy: 1, lx: 0, ly: 0,
    invuln: 0, hidden: false, safeX: 0, safeY: 0, buffer: -1, bufferT: 0, trail: [], blinkT: 2, bumpT: 0, scale: 1
  };

  /* -------------------------------------------------------- dom refs */
  function $(id) { return document.getElementById(id); }
  var screens = { title: $('scr-title'), levels: $('scr-levels'), shop: $('scr-shop'), pause: $('scr-pause'), win: $('scr-win'), fail: $('scr-fail'), over: $('scr-over') };
  function showScreen(name) {
    for (var k in screens) screens[k].hidden = (k !== name);
    G.screen = name;
    try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function hideAll() { for (var k in screens) screens[k].hidden = true; }
  // Buttons must not keep focus (Enter would click them again).
  Array.prototype.forEach.call(document.querySelectorAll('button'), function (b) {
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
  });
  function on(id, fn) {
    $(id).addEventListener('click', function (e) { e.stopPropagation(); Kit.audio.unlock(); sfx.click(); fn(); this.blur(); });
  }

  var toastTimer = 0;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    toastTimer = 2.8;
  }

  /* ------------------------------------------------------------ sound */
  var A = Kit.audio, lastBlip = 0;
  var sfx = {
    click: function () { A.tone({ freq: 700, type: 'square', dur: 0.05, vol: 0.12 }); },
    dash: function () { A.noise({ dur: 0.12, vol: 0.12, filter: 2500, to: 6000 }); A.tone({ freq: 240, to: 520, type: 'square', dur: 0.07, vol: 0.06 }); },
    stop: function () { A.tone({ freq: 150, to: 70, type: 'triangle', dur: 0.08, vol: 0.28 }); },
    bump: function () { A.tone({ freq: 110, to: 90, type: 'square', dur: 0.05, vol: 0.08 }); },
    dot: function (n) {
      var now = A.ctx ? A.ctx.currentTime : 0;
      if (now - lastBlip < 0.028) return;
      lastBlip = now;
      A.tone({ freq: 520 * Math.pow(2, Math.min(n, 30) / 20), type: 'square', dur: 0.045, vol: 0.07 });
    },
    coin: function () { Kit.sfx.coin(); },
    power: function () { Kit.sfx.power(); },
    hit: function () { Kit.sfx.hit(); A.tone({ freq: 420, to: 90, type: 'sawtooth', dur: 0.35, vol: 0.14 }); },
    shieldBreak: function () { A.noise({ dur: 0.3, vol: 0.25, filter: 6000, to: 800 }); A.tone({ freq: 1200, to: 300, type: 'triangle', dur: 0.25, vol: 0.15 }); },
    exit: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { A.tone({ freq: f, type: 'square', dur: 0.1, vol: 0.13, delay: i * 0.06 }); }); },
    star: function (i) { A.tone({ freq: [880, 1109, 1319][i] || 1319, type: 'triangle', dur: 0.25, vol: 0.28 }); A.tone({ freq: ([880, 1109, 1319][i] || 1319) * 2, type: 'sine', dur: 0.3, vol: 0.1, delay: 0.05 }); },
    lose: function () { Kit.sfx.lose(); },
    goo: function () { A.tone({ freq: 90, to: 50, type: 'sine', dur: 0.5, vol: 0.3 }); A.noise({ dur: 0.5, vol: 0.2, filter: 600, to: 100 }); },
    milestone: function () { [659, 784, 988, 1319].forEach(function (f, i) { A.tone({ freq: f, type: 'square', dur: 0.12, vol: 0.12, delay: i * 0.08 }); }); },
    buy: function () { Kit.sfx.power(); A.tone({ freq: 1568, type: 'triangle', dur: 0.3, vol: 0.15, delay: 0.25 }); },
    no: function () { A.tone({ freq: 200, to: 150, type: 'square', dur: 0.15, vol: 0.12 }); },
    trap: function () { A.tone({ freq: 900, to: 1400, type: 'square', dur: 0.04, vol: 0.03 }); }
  };

  /* ----------------------------------------------------------- helpers */
  var ARABIC = /[؀-ۿ]/;
  function text(str, x, y, size, color, align, opts) {
    opts = opts || {};
    ctx.font = (opts.weight || 700) + ' ' + size + 'px Fredoka';
    ctx.direction = ARABIC.test(str) ? 'rtl' : 'ltr';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    if (opts.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = opts.strokeW || Math.max(3, size * 0.16);
      ctx.strokeStyle = opts.stroke;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.direction = 'ltr';
  }
  function fitSize(str, size, maxW, weight) {
    ctx.font = (weight || 700) + ' ' + size + 'px Fredoka';
    ctx.direction = ARABIC.test(str) ? 'rtl' : 'ltr';
    var w = ctx.measureText(str).width;
    ctx.direction = 'ltr';
    return w > maxW ? Math.max(10, Math.floor(size * maxW / w)) : size;
  }
  function fmtTime(s) { s = Math.max(0, s); var m = Math.floor(s / 60), ss = Math.floor(s % 60); return m + ':' + (ss < 10 ? '0' : '') + ss; }
  var rr = MK.rr;
  function starPath(cx, cy, r) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r;
      ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
  }
  function heartPath(cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.35);
    ctx.bezierCurveTo(cx - s * 0.9, cy - s * 0.25, cx - s * 0.45, cy - s * 0.85, cx, cy - s * 0.38);
    ctx.bezierCurveTo(cx + s * 0.45, cy - s * 0.85, cx + s * 0.9, cy - s * 0.25, cx, cy + s * 0.35);
    ctx.closePath();
  }

  /* ------------------------------------------------ static backgrounds */
  var bgCanvas = document.createElement('canvas'), crtCanvas = document.createElement('canvas');
  (function () {
    bgCanvas.width = W; bgCanvas.height = H;
    var b = bgCanvas.getContext('2d');
    var g = b.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 800);
    g.addColorStop(0, '#1d0838'); g.addColorStop(1, '#05010c');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    b.strokeStyle = 'rgba(180,77,255,0.12)'; b.lineWidth = 1;
    for (var x = 0; x <= W; x += 40) { b.beginPath(); b.moveTo(x + 0.5, 0); b.lineTo(x + 0.5, H); b.stroke(); }
    for (var y = 0; y <= H; y += 40) { b.beginPath(); b.moveTo(0, y + 0.5); b.lineTo(W, y + 0.5); b.stroke(); }
    crtCanvas.width = W; crtCanvas.height = H;
    var c = crtCanvas.getContext('2d');
    c.fillStyle = 'rgba(0,0,0,0.13)';
    for (y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
    var v = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.0);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
  })();

  /* ------------------------------------------------------------ popups */
  function popup(str, wx, wy, color, size, life) {
    if (G.popups.length > 24) G.popups.shift();
    G.popups.push({ s: str, x: wx, y: wy, c: color || '#fff', size: size || 26, life: life || 0.9, max: life || 0.9 });
  }
  function banner(str, dur, color) { G.banner = { s: str, t: dur || 3.2, max: dur || 3.2, c: color || '#ffe600' }; }

  /* ----------------------------------------------------- level control */
  function resetPlayer(x, y) {
    P.x = P.cx = P.safeX = x; P.y = P.cy = P.safeY = y;
    P.dir = -1; P.moving = false; P.sx = P.sy = 1; P.lx = 0; P.ly = 0;
    P.invuln = 0; P.hidden = false; P.buffer = -1; P.trail.length = 0; P.scale = 1;
  }
  function resetRunState() {
    G.ht = 0; G.time = 0; G.blockT = 0; G.blockSteps = 0;
    G.hits = 0; G.dotsGot = 0; G.coinsGot = 0; G.dotsInDash = 0;
    G.freezeT = 0; G.magnetT = 0; G.doubleT = 0; G.shield = false;
    G.popups.length = 0; G.banner = null; G.phase = 'play'; G.phaseT = 0; G.ai = null;
    fx.clear();
  }

  var TIPS = {
    1: 'اضغط سهمًا لتندفع حتى الجدار!',
    4: 'احذر! الجدران الشائكة الحمراء تؤذيك',
    6: 'الدرع الأزرق يحميك من ضربة واحدة',
    7: 'الفخاخ ترتفع وتنخفض... انتظر اللحظة المناسبة!',
    10: 'المغناطيس يجذب النقاط إليك',
    11: 'الخفافيش تطير ذهابًا وإيابًا. مُرّ من خلفها!',
    14: 'التجميد يوقف كل الأخطار لبضع ثوانٍ!',
    15: 'السمكة تنتفخ! لا تقترب منها وهي كبيرة',
    18: 'التقط المضاعِف لتحصل على ضعف العملات!',
    21: 'قف بجانب الصندوق المتحرك لتصل إلى المخرج',
    22: 'الصندوق يصعد وينزل... استخدمه كمصعد!'
  };

  function startLevel(n) {
    n = Math.max(1, Math.min(LEVELS.length, n));
    G.mode = 'level'; G.levelN = n; G.def = LEVELS[n - 1];
    var r = worldFromLevel(G.def);
    G.world = r.world; G.L = r.L;
    G.blockStep = r.L.blockStep || TM.BLOCK_STEP;
    resetRunState();
    G.hearts = 3;
    G.dotsTotal = r.L.dots;
    G.tile = Math.max(38, Math.min(52, Math.floor(700 / r.L.h)));
    G.mx = Math.round((W - COLS * G.tile) / 2);
    var wi = Math.floor((n - 1) / 10);
    G.pal = WORLDS[wi];
    resetPlayer(r.L.start.x, r.L.start.y);
    G.firstMoveDone = false;
    G.cam = camTarget();
    if (TIPS[n]) banner(TIPS[n], n === 1 ? 6 : 4.2);
    else banner(G.def.name, 2.2, '#fff');
    hideAll(); G.screen = 'play';
    try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function startEndless() {
    G.mode = 'endless';
    G.world = new World();
    G.gen = MDEndless.create(G.world);
    G.L = null; G.def = null;
    resetRunState();
    G.hearts = 1;
    G.tile = 48;
    G.mx = Math.round((W - COLS * G.tile) / 2);
    G.pal = GOO_PALS[0]; G.palIdx = 0;
    resetPlayer(6, 0);
    G.gen.fill(-30);
    G.gooY = 7; G.gooStarted = false; G.gooGrace = 2.5;
    G.height = 0; G.maxHeight = 0; G.nextMilestone = 50;
    G.bestLine = save.bestH; G.beatBest = false; G.bonus = 0;
    G.firstMoveDone = false;
    G.cam = camTarget();
    banner(save.runs < 2 ? 'اصعد بسرعة! الهلام يرتفع!' : 'انطلق!', 3);
    hideAll(); G.screen = 'play';
    try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function restart() { if (G.mode === 'endless') startEndless(); else startLevel(G.levelN); }

  /* --------------------------------------------------------- the grid */
  function blockAt(x, y) {
    var bl = G.world.blocks;
    for (var i = 0; i < bl.length; i++) {
      var b = bl[i];
      if (b.x === x && b.y === y) return b;
      if (b.anim < 1 && b.fx === x && b.fy === y) return b;
    }
    return null;
  }
  function solidFor(x, y) {
    var t = G.world.tile(x, y);
    return t === T.WALL || t === T.SPIKE || !!G.world.pufferAt(x, y) || !!blockAt(x, y);
  }
  var worldG = {
    tile: function (x, y) { return G.world.tile(x, y); },
    puffer: function (x, y) { return !!G.world.pufferAt(x, y); }
  };

  /* ---------------------------------------------------------- movement */
  function tryDash(d) {
    if (G.screen !== 'play' || G.phase !== 'play') return;
    if (P.moving) { P.buffer = d; P.bufferT = 0.22; return; }
    var D = C.DIRS[d], nx = P.cx + D.dx, ny = P.cy + D.dy;
    P.lx = D.dx; P.ly = D.dy;
    if (solidFor(nx, ny)) {
      if (G.world.tile(nx, ny) === T.SPIKE) { P.sx = D.dx ? 0.75 : 1.2; P.sy = D.dy ? 0.75 : 1.2; hit('spike'); return; }
      P.bumpT = 0.12; P.sx = D.dx ? 0.85 : 1.1; P.sy = D.dy ? 0.85 : 1.1; sfx.bump();
      return;
    }
    if (!G.firstMoveDone) { G.firstMoveDone = true; if (G.mode === 'endless') G.gooStarted = true; }
    if (G.world.tile(P.cx, P.cy) !== T.TRAP) { P.safeX = P.cx; P.safeY = P.cy; }
    P.dir = d; P.moving = true; P.buffer = -1;
    G.dotsInDash = 0;
    sfx.dash();
    var px = G.mx + (P.x + 0.5) * G.tile, py = (P.y + 0.5) * G.tile;
    fx.burst(px - D.dx * G.tile * 0.4, py - D.dy * G.tile * 0.4, { count: 8, colors: ['#fff', G.pal.edge], speed: 180, life: 0.3, size: 5, gravity: 0, angle: Math.atan2(-D.dy, -D.dx), spread: 1.2 });
  }

  function updatePlayer(dt) {
    if (P.bufferT > 0) { P.bufferT -= dt; if (P.bufferT <= 0) P.buffer = -1; }
    P.sx += (1 - P.sx) * Math.min(1, dt * 14);
    P.sy += (1 - P.sy) * Math.min(1, dt * 14);
    if (P.invuln > 0) P.invuln -= dt;
    P.blinkT -= dt; if (P.blinkT < -0.12) P.blinkT = 1.5 + Math.random() * 2.5;
    if (!P.moving) return;
    var D = C.DIRS[P.dir];
    P.sx = D.dx ? 1.4 : 0.72; P.sy = D.dy ? 1.4 : 0.72;
    var dist = DASH_SPEED * dt;
    var guard = 0;
    while (dist > 0 && P.moving && guard++ < 60) {
      var tx = P.cx + D.dx, ty = P.cy + D.dy;
      var rem = Math.abs(tx - P.x) + Math.abs(ty - P.y);
      var step = Math.min(dist, rem);
      P.x += D.dx * step; P.y += D.dy * step; dist -= step;
      if (step >= rem - 1e-6) {
        P.x = P.cx = tx; P.y = P.cy = ty;
        P.trail.push({ x: P.x, y: P.y, a: 1 });
        if (P.trail.length > 14) P.trail.shift();
        enterCell(P.cx, P.cy);
        if (G.phase !== 'play') return;
        if (solidFor(P.cx + D.dx, P.cy + D.dy)) { stopDash(); return; }
      }
    }
  }

  function enterCell(x, y) {
    collectAt(x, y, true);
    var t = G.world.tile(x, y);
    if (t === T.EXIT) { reachExit(); return; }
    if (t === T.TRAP) {
      var tr = G.world.trapMap[C.key(x, y)];
      if (tr && C.trapState(tr, G.ht) === 2) hit('trap');
    }
  }

  function stopDash() {
    var D = C.DIRS[P.dir];
    P.moving = false;
    P.sx = D.dx ? 0.6 : 1.35; P.sy = D.dy ? 0.6 : 1.35;
    var px = G.mx + (P.x + 0.5 + D.dx * 0.5) * G.tile, py = (P.y + 0.5 + D.dy * 0.5) * G.tile;
    fx.burst(px, py, { count: 10, colors: [G.pal.edge, '#fff'], speed: 200, life: 0.35, size: 5, gravity: 0, angle: Math.atan2(-D.dy, -D.dx), spread: 2.2 });
    shake.add(2.2);
    sfx.stop();
    if (G.world.tile(P.cx + D.dx, P.cy + D.dy) === T.SPIKE) { hit('spike'); return; }
    if (G.world.tile(P.cx, P.cy) !== T.TRAP) { P.safeX = P.cx; P.safeY = P.cy; }
    comboWord();
    if (P.buffer >= 0 && P.bufferT > 0) { var b = P.buffer; P.buffer = -1; tryDash(b); }
  }

  var COMBO = [[24, 'خارق!', '#ff3fa4'], [16, 'مذهل!', '#34f5ff'], [11, 'ممتاز!', '#b6ff3a'], [7, 'رائع!', '#ffe600']];
  function comboWord() {
    for (var i = 0; i < COMBO.length; i++) {
      if (G.dotsInDash >= COMBO[i][0]) {
        popup(COMBO[i][1], P.x + 0.5, P.y - 0.3, COMBO[i][2], 34 + i * -3, 1.0);
        if (G.mode === 'endless') { var bonus = G.dotsInDash * 2; G.bonus = (G.bonus || 0) + bonus; }
        break;
      }
    }
    G.dotsInDash = 0;
  }

  function collectAt(x, y, dashing) {
    var it = G.world.item(x, y);
    if (!it) return;
    G.world.setItem(x, y, 0);
    var px = G.mx + (x + 0.5) * G.tile, py = (y + 0.5) * G.tile;
    if (it === I.DOT) {
      G.dotsGot++; G.dotsInDash++;
      sfx.dot(G.dotsInDash);
      if (fx.list.length < 500) fx.burst(px, py, { count: 3, color: G.pal.dot, speed: 90, life: 0.25, size: 4, gravity: 0 });
    } else if (it === I.COIN) {
      var v = (G.doubleT > 0 ? 2 : 1) * COIN_VALUE;
      G.coinsGot += v;
      sfx.coin();
      fx.burst(px, py, { count: 12, colors: ['#ffd400', '#fff6a8', '#ff9a1f'], speed: 220, life: 0.5, size: 6, gravity: 300 });
      popup('+' + v, x + 0.5, y, '#ffd400', 24, 0.7);
    } else {
      sfx.power();
      fx.burst(px, py, { count: 22, colors: ['#fff', '#34f5ff', '#ffe600', '#ff3fa4'], speed: 280, life: 0.6, size: 6, gravity: 0 });
      shake.add(3);
      var name = '';
      if (it === I.SHIELD) { G.shield = true; name = 'درع!'; }
      else if (it === I.MAGNET) { G.magnetT = 8; name = 'مغناطيس!'; }
      else if (it === I.FREEZE) { G.freezeT = 5; name = 'تجميد!'; }
      else if (it === I.DOUBLE) { G.doubleT = 12; name = 'عملات مضاعفة!'; }
      popup(name, x + 0.5, y - 0.2, '#34f5ff', 32, 1.2);
    }
  }

  function magnetPull() {
    if (G.magnetT <= 0) return;
    var cx = Math.round(P.x), cy = Math.round(P.y);
    for (var y = cy - 3; y <= cy + 3; y++) for (var x = cx - 3; x <= cx + 3; x++) {
      var it = G.world.item(x, y);
      if (it === I.DOT || it === I.COIN) {
        if ((x - P.x) * (x - P.x) + (y - P.y) * (y - P.y) <= 10) {
          // fly-in sparkle then collect
          var px = G.mx + (x + 0.5) * G.tile, py = (y + 0.5) * G.tile;
          fx.burst(px, py, { count: 2, color: '#ff5a5f', speed: 60, life: 0.2, size: 4, gravity: 0 });
          collectAt(x, y, false);
        }
      }
    }
  }

  /* ------------------------------------------------------------ hazards */
  function hit(kind) {
    if (G.phase !== 'play') return;
    if (P.invuln > 0 || G.god) return;
    var px = G.mx + (P.x + 0.5) * G.tile, py = (P.y + 0.5) * G.tile;
    if (G.shield) {
      G.shield = false; P.invuln = 1.1;
      sfx.shieldBreak(); shake.add(6);
      fx.burst(px, py, { count: 26, colors: ['#34f5ff', '#fff', '#9ffcff'], speed: 320, life: 0.5, size: 6, gravity: 0 });
      popup('الدرع أنقذك!', P.x + 0.5, P.y - 0.3, '#34f5ff', 28, 1.2);
      return;
    }
    G.hits++;
    sfx.hit(); shake.add(12);
    fx.burst(px, py, { count: 36, colors: [MK.list[save.mask].body, '#fff', '#ff3fa4', '#ffe600'], speed: 380, life: 0.8, size: 8, gravity: 200 });
    P.hidden = true; P.moving = false;
    G.phase = 'dying'; G.phaseT = 0.75;
    if (G.mode === 'level') G.hearts--;
    else G.hearts = 0;
    G.deathKind = kind;
  }

  function checkHazards() {
    if (P.hidden) return;
    var i, t = G.ht;
    // bats
    var bats = G.world.bats, rad = TM.BAT_RADIUS + TM.PLAYER_RADIUS;
    for (i = 0; i < bats.length; i++) {
      var b = C.batXY(bats[i], t), dx = b.x - P.x, dy = b.y - P.y;
      if (dx * dx + dy * dy < rad * rad) { hit('bat'); return; }
    }
    var cx = Math.round(P.x), cy = Math.round(P.y);
    // traps under the player
    if (G.world.tile(cx, cy) === T.TRAP) {
      var tr = G.world.trapMap[C.key(cx, cy)];
      if (tr && C.trapState(tr, t) === 2 && Math.abs(P.x - cx) < 0.35 && Math.abs(P.y - cy) < 0.35) { hit('trap'); return; }
    }
    // puffers (big = neighbours deadly)
    var pf = G.world.puffers;
    for (i = 0; i < pf.length; i++) {
      var p = pf[i];
      if (Math.abs(p.x - cx) + Math.abs(p.y - cy) === 1 && C.puffState(p, t) === 2) {
        if (Math.abs(P.x - p.x) + Math.abs(P.y - p.y) < 1.25) { hit('puffer'); return; }
      }
    }
  }

  function stepBlocks() {
    var bl = G.world.blocks;
    if (!bl.length) return;
    var D = P.moving ? C.DIRS[P.dir] : null;
    bl.forEach(function (b) { b.moved = false; });
    C.stepBlocks(worldG, bl, function (x, y) {
      if (x === P.cx && y === P.cy) return true;
      if (D && x === P.cx + D.dx && y === P.cy + D.dy) return true;
      if (Math.round(P.x) === x && Math.round(P.y) === y) return true;
      return false;
    });
    bl.forEach(function (b) {
      if (b.moved) { b.fx = b.px; b.fy = b.py; b.anim = 0; }
      else { b.fx = b.x; b.fy = b.y; b.anim = 1; }
    });
    G.blockSteps++;
  }

  function reachExit() {
    G.phase = 'exiting'; G.phaseT = 0.8; P.moving = false;
    sfx.exit();
    var px = G.mx + (P.x + 0.5) * G.tile, py = (P.y + 0.5) * G.tile;
    fx.burst(px, py, { count: 40, colors: ['#ffe600', '#ff3fa4', '#34f5ff', '#b6ff3a', '#fff'], speed: 360, life: 0.9, size: 7, gravity: 150 });
    shake.add(5);
  }

  /* ----------------------------------------------------------- endless */
  function updateEndless(dt) {
    var gen = G.gen;
    gen.fill(Math.floor(G.cam / G.tile) - 6);
    var h = gen.height(P.cy);
    G.height = h;
    if (h > G.maxHeight) G.maxHeight = h;
    if (!G.beatBest && G.bestLine > 5 && G.maxHeight > G.bestLine) {
      G.beatBest = true;
      popup('رقم قياسي جديد!', P.x + 0.5, P.y - 1.2, '#ffe600', 40, 1.8);
      sfx.milestone(); shake.add(5);
      fx.burst(G.mx + (P.x + 0.5) * G.tile, (P.y + 0.5) * G.tile, { count: 50, colors: ['#ffe600', '#fff', '#ff3fa4'], speed: 420, life: 1, size: 7, gravity: 250 });
    }
    if (G.maxHeight >= G.nextMilestone) {
      popup(G.nextMilestone + ' متر!', P.x + 0.5, P.y - 1, '#b6ff3a', 44, 1.6);
      sfx.milestone();
      var px = G.mx + (P.x + 0.5) * G.tile, py = (P.y + 0.5) * G.tile;
      fx.burst(px, py - 40, { count: 40, colors: ['#ffe600', '#ff3fa4', '#34f5ff', '#b6ff3a'], speed: 380, life: 1, size: 7, gravity: 250 });
      G.nextMilestone += 50;
      if (G.nextMilestone % 100 === 50) { G.palIdx = (G.palIdx + 1) % GOO_PALS.length; G.pal = GOO_PALS[G.palIdx]; }
    }
    // goo
    if (G.gooStarted && G.phase === 'play' && G.freezeT <= 0) {
      if (G.gooGrace > 0) G.gooGrace -= dt;
      else {
        var d = Math.min(1, G.maxHeight / 320);
        var v = 0.75 + 1.45 * d;
        var gap = G.gooY - P.y;
        if (gap > 6.5) v += (gap - 6.5) * 0.6;
        G.gooY -= v * dt;
      }
    }
    if (G.phase === 'play' && !P.hidden && P.y + 0.35 > G.gooY) {
      if (G.god) G.gooY = P.y + 3;
      else {
        G.shield = false; P.invuln = 0;
        hit('goo');
        sfx.goo();
      }
    }
    G.world.prune(Math.floor(G.gooY) + 12);
  }

  /* ------------------------------------------------------------ camera */
  function camTarget() {
    var T_ = G.tile;
    if (G.mode === 'endless') return (P.y + 0.5) * T_ - H * 0.56;
    var hpx = G.L.h * T_;
    if (hpx <= H - 16) return -(H - hpx) / 2;
    return Math.max(-8, Math.min(hpx - H + 8, (P.y + 0.5) * T_ - H / 2));
  }

  /* ------------------------------------------------------------ update */
  var DIRKEYS = [['ArrowUp', 'KeyW'], ['ArrowRight', 'KeyD'], ['ArrowDown', 'KeyS'], ['ArrowLeft', 'KeyA']];
  var K = Kit.keys;

  function tick(dt) {
    G.menuT += dt;
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').hidden = true; }
    handleKeys();
    if (G.screen === 'play') updatePlay(dt);
    else if (G.screen === 'title' || G.screen === 'levels' || G.screen === 'shop') updateMenuBg(dt);
    fx.update(dt);
    shake.update(dt);
    for (var i = G.popups.length - 1; i >= 0; i--) { var p = G.popups[i]; p.life -= dt; p.y -= dt * 0.9; if (p.life <= 0) G.popups.splice(i, 1); }
    if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
  }

  function handleKeys() {
    var s = G.screen;
    if (s === 'play') {
      if (K.anyPressed(['KeyP', 'Escape'])) { pause(); return; }
      if (K.pressed('KeyR')) { restart(); return; }
      for (var d = 0; d < 4; d++) if (K.anyPressed(DIRKEYS[d])) tryDash(d);
    } else if (s === 'pause') {
      if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'Space'])) resume();
      else if (K.pressed('KeyR')) { restart(); }
    } else if (s === 'title') {
      if (K.anyPressed(['Enter', 'Space'])) { sfx.click(); startLevel(nextLevelToPlay()); }
    } else if (s === 'win') {
      if (G.resultLock > 0) return;
      if (K.anyPressed(['Enter', 'Space'])) goNext();
      else if (K.pressed('KeyR')) startLevel(G.levelN);
      else if (K.pressed('Escape')) openLevels();
    } else if (s === 'fail') {
      if (G.resultLock > 0) return;
      if (K.anyPressed(['Enter', 'Space', 'KeyR'])) startLevel(G.levelN);
      else if (K.pressed('Escape')) openLevels();
    } else if (s === 'over') {
      if (G.resultLock > 0) return;
      if (K.anyPressed(['Enter', 'Space', 'KeyR'])) startEndless();
      else if (K.pressed('Escape')) toTitle();
    } else if (s === 'levels' || s === 'shop') {
      if (K.pressed('Escape')) toTitle();
    }
  }

  function updatePlay(dt) {
    if (G.phase === 'play') {
      if (G.mode === 'level' && G.firstMoveDone) G.time += dt;
      if (G.freezeT > 0) G.freezeT -= dt;
      else {
        G.ht += dt;
        G.blockT += dt;
        while (G.blockT >= G.blockStep) { G.blockT -= G.blockStep; stepBlocks(); }
      }
      if (G.magnetT > 0) { G.magnetT -= dt; magnetPull(); }
      if (G.doubleT > 0) G.doubleT -= dt;
      updatePlayer(dt);
      if (G.phase === 'play') checkHazards();
      if (G.autoplay) autoStep();
    } else if (G.phase === 'dying') {
      G.phaseT -= dt;
      if (G.phaseT <= 0) afterDeath();
    } else if (G.phase === 'exiting') {
      G.phaseT -= dt;
      P.scale = Math.max(0, G.phaseT / 0.8);
      if (G.phaseT <= 0) showWin();
    }
    // animate blocks
    G.world.blocks.forEach(function (b) { if (b.anim < 1) b.anim = Math.min(1, b.anim + dt / 0.22); });
    for (var i = 0; i < P.trail.length; i++) P.trail[i].a -= dt * 4;
    while (P.trail.length && P.trail[0].a <= 0) P.trail.shift();
    if (G.mode === 'endless') updateEndless(dt);
    var tgt = camTarget();
    var k = G.mode === 'endless' ? 6 : 8;
    G.cam += (tgt - G.cam) * Math.min(1, dt * k);
  }

  function afterDeath() {
    if (G.mode === 'endless') { showOver(); return; }
    if (G.hearts <= 0) { showFail(); return; }
    // respawn at the last safe resting spot
    resetPlayerSoft(P.safeX, P.safeY);
    P.invuln = 1.6;
    G.phase = 'play';
    popup(G.hearts === 1 ? 'بقي قلب واحد!' : 'بقي قلبان!', P.x + 0.5, P.y - 0.3, '#ff6b9a', 26, 1.2);
  }
  function resetPlayerSoft(x, y) {
    P.x = P.cx = x; P.y = P.cy = y; P.moving = false; P.hidden = false; P.buffer = -1; P.sx = 0.5; P.sy = 1.6; P.trail.length = 0;
    var px = G.mx + (x + 0.5) * G.tile, py = (y + 0.5) * G.tile;
    fx.burst(px, py, { count: 16, colors: ['#fff', G.pal.edge], speed: 160, life: 0.4, size: 5, gravity: 0 });
  }

  /* -------------------------------------------------------- menu bg */
  var bgWorld = null, bgGen = null, bgCam = 0, bgHT = 0;
  function initMenuBg() {
    bgWorld = new World();
    bgGen = MDEndless.create(bgWorld);
    bgGen.startY = 400; // start "high" so the preview shows hazards
    bgGen.fill(-40);
    bgCam = -H * 0.7;
  }
  function updateMenuBg(dt) {
    if (!bgWorld) initMenuBg();
    bgCam -= 55 * dt;
    bgHT += dt;
    bgGen.fill(Math.floor(bgCam / 48) - 6);
    bgWorld.prune(Math.floor((bgCam + H) / 48) + 3);
  }

  /* ------------------------------------------------------------ render */
  function render() {
    ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, 0, 0);
    ctx.drawImage(bgCanvas, 0, 0);
    if (G.screen === 'play' || G.screen === 'pause' || G.screen === 'win' || G.screen === 'fail' || G.screen === 'over') {
      ctx.save();
      ctx.translate(Math.round(shake.x), Math.round(shake.y));
      drawWorld(G.world, G.cam, G.tile, G.mx, G.pal, G.ht, true);
      ctx.restore();
      drawHUD();
    } else {
      if (!bgWorld) initMenuBg();
      drawWorld(bgWorld, bgCam, 48, Math.round((W - COLS * 48) / 2), GOO_PALS[Math.floor(G.menuT / 8) % GOO_PALS.length], bgHT, false);
      ctx.fillStyle = 'rgba(7,2,16,0.35)'; ctx.fillRect(0, 0, W, H);
      drawMenuMascots();
    }
    ctx.drawImage(crtCanvas, 0, 0);
    if (G.freezeT > 0 && G.screen === 'play') {
      ctx.fillStyle = 'rgba(120,220,255,' + (0.12 + 0.04 * Math.sin(G.menuT * 6)) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawMenuMascots() {
    var t = G.menuT;
    var b1 = Math.abs(Math.sin(t * 3)) * 40, sq = 1 + Math.max(0, 0.25 - Math.abs(Math.sin(t * 3))) * 1.4;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(170, 600, 60, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(1110, 600, 60, 12, 0, 0, Math.PI * 2); ctx.fill();
    MK.draw(ctx, 170, 540 - b1, 110, save.mask, { sx: sq, sy: 1 / sq, t: t, lx: 0.6, blink: (t % 3.2) < 0.12 });
    var other = (Math.floor(t / 4) % MK.list.length);
    if (other === save.mask) other = (other + 1) % MK.list.length;
    var b2 = Math.abs(Math.sin(t * 3 + 1.2)) * 40, sq2 = 1 + Math.max(0, 0.25 - Math.abs(Math.sin(t * 3 + 1.2))) * 1.4;
    MK.draw(ctx, 1110, 540 - b2, 110, other, { sx: sq2, sy: 1 / sq2, t: t, lx: -0.6, blink: ((t + 1.3) % 2.7) < 0.12 });
  }

  function drawWorld(world, cam, TS, MX, pal, ht, live) {
    var y0 = Math.floor(cam / TS) - 1, y1 = Math.floor((cam + H) / TS) + 1, x, y;
    var mazeW = COLS * TS;
    // maze floor + frame
    ctx.fillStyle = pal.floor;
    ctx.fillRect(MX, 0, mazeW, H);
    ctx.save();
    ctx.beginPath(); ctx.rect(MX, 0, mazeW, H); ctx.clip();
    ctx.translate(MX, -Math.round(cam));
    var t = G.menuT;
    // tiles
    for (y = y0; y <= y1; y++) {
      var row = world.rows[y];
      for (x = 0; x < COLS; x++) {
        var tt = row ? row.t[x] : T.WALL, px = x * TS, py = y * TS;
        if (tt === T.WALL || tt === T.SPIKE) drawWall(world, x, y, px, py, TS, pal, tt === T.SPIKE);
        else if (tt === T.TRAP) drawTrap(world, x, y, px, py, TS, pal, ht);
        else if (tt === T.EXIT) drawExit(px, py, TS, t);
        else if ((x + y) % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.025)'; ctx.fillRect(px, py, TS, TS); }
        if (row && row.it[x]) drawItem(row.it[x], px, py, TS, pal, t, x, y);
      }
    }
    // puffers
    world.puffers.forEach(function (p) { if (p.y >= y0 && p.y <= y1) drawPuffer(p, TS, ht); });
    // blocks
    world.blocks.forEach(function (b) { drawBlock(b, TS); });
    // bats
    world.bats.forEach(function (b) { var q = C.batXY(b, ht); if (q.y >= y0 - 1 && q.y <= y1 + 1) drawBat(q.x, q.y, TS, ht, b); });
    if (live && G.mode === 'endless' && G.bestLine > 0) {
      var by = (-G.bestLine + 0.5) * TS;
      if (by > cam - TS && by < cam + H + TS) {
        ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
        ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(COLS * TS, by); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(20,7,38,0.85)'; rr(ctx, COLS * TS / 2 - 90, by - 34, 180, 30, 12); ctx.fill();
        text('الرقم القياسي', COLS * TS / 2, by - 12, 20, '#ffe600', 'center');
      }
    }
    if (live) {
      drawPlayer(TS);
    }
    ctx.restore();
    // particles and popups in world space (not clipped)
    if (live) {
      ctx.save();
      ctx.translate(0, -Math.round(cam));
      fx.draw(ctx);
      ctx.restore();
      for (var i = 0; i < G.popups.length; i++) {
        var p = G.popups[i], a = Math.min(1, p.life / p.max * 2.5), sc = 1 + Math.max(0, (p.life - p.max + 0.15)) * 3;
        ctx.globalAlpha = a;
        text(p.s, MX + p.x * TS, p.y * TS - cam, Math.round(p.size * sc), p.c, 'center', { stroke: '#12031f', strokeW: 6 });
        ctx.globalAlpha = 1;
      }
      if (G.mode === 'endless') drawGoo(MX, mazeW, cam, TS);
    }
    // neon frame
    ctx.strokeStyle = pal.edge; ctx.lineWidth = 4;
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(MX - 2, 0); ctx.lineTo(MX - 2, H); ctx.moveTo(MX + mazeW + 2, 0); ctx.lineTo(MX + mazeW + 2, H); ctx.stroke();
    ctx.globalAlpha = 0.25; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(MX - 6, 0); ctx.lineTo(MX - 6, H); ctx.moveTo(MX + mazeW + 6, 0); ctx.lineTo(MX + mazeW + 6, H); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function isOpenT(world, x, y) {
    var t = world.tile(x, y);
    return t !== T.WALL && t !== T.SPIKE;
  }

  function drawWall(world, x, y, px, py, TS, pal, spike) {
    ctx.fillStyle = pal.wall;
    ctx.fillRect(px, py, TS, TS);
    // pixel-art texture
    if ((x * 7 + y * 3) % 5 === 0) { ctx.fillStyle = pal.wallHi; ctx.fillRect(px + TS * 0.2, py + TS * 0.2, TS * 0.25, TS * 0.25); }
    else if ((x * 3 + y * 5) % 7 === 0) { ctx.fillStyle = pal.wallHi; ctx.fillRect(px + TS * 0.55, py + TS * 0.5, TS * 0.2, TS * 0.2); }
    var e = Math.max(3, TS * 0.08), up = isOpenT(world, x, y - 1), dn = isOpenT(world, x, y + 1), lf = isOpenT(world, x - 1, y), rt = isOpenT(world, x + 1, y);
    ctx.fillStyle = pal.edge;
    if (up) ctx.fillRect(px, py, TS, e);
    if (dn) ctx.fillRect(px, py + TS - e, TS, e);
    if (lf) ctx.fillRect(px, py, e, TS);
    if (rt) ctx.fillRect(px + TS - e, py, e, TS);
    if (spike) {
      ctx.fillStyle = pal.spike;
      var n = 3, s = TS / n, hgt = TS * 0.3;
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        if (up) { ctx.moveTo(px + i * s, py + e); ctx.lineTo(px + i * s + s / 2, py - hgt * 0.5); ctx.lineTo(px + (i + 1) * s, py + e); }
        if (dn) { ctx.moveTo(px + i * s, py + TS - e); ctx.lineTo(px + i * s + s / 2, py + TS + hgt * 0.5); ctx.lineTo(px + (i + 1) * s, py + TS - e); }
        if (lf) { ctx.moveTo(px + e, py + i * s); ctx.lineTo(px - hgt * 0.5, py + i * s + s / 2); ctx.lineTo(px + e, py + (i + 1) * s); }
        if (rt) { ctx.moveTo(px + TS - e, py + i * s); ctx.lineTo(px + TS + hgt * 0.5, py + i * s + s / 2); ctx.lineTo(px + TS - e, py + (i + 1) * s); }
      }
      ctx.fill();
      // hazard stripes on the block itself
      ctx.fillStyle = 'rgba(255,63,108,0.35)';
      ctx.fillRect(px + TS * 0.3, py + TS * 0.3, TS * 0.4, TS * 0.4);
    }
  }

  function drawTrap(world, x, y, px, py, TS, pal, ht) {
    var tr = world.trapMap[C.key(x, y)];
    var st = tr ? C.trapState(tr, ht) : 0;
    ctx.fillStyle = '#2a1238';
    rr(ctx, px + TS * 0.1, py + TS * 0.1, TS * 0.8, TS * 0.8, TS * 0.12); ctx.fill();
    ctx.fillStyle = st === 1 ? '#ff9a1f' : '#4a2a66';
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) ctx.fillRect(px + TS * (0.22 + i * 0.22), py + TS * (0.22 + j * 0.22), TS * 0.1, TS * 0.1);
    if (st >= 1) {
      var h = st === 2 ? 1 : 0.35 + 0.1 * Math.sin(ht * 40);
      ctx.fillStyle = st === 2 ? '#ff3f6c' : '#ffb35a';
      ctx.beginPath();
      for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) {
        var cx = px + TS * (0.27 + i * 0.22), cy = py + TS * (0.27 + j * 0.22);
        ctx.moveTo(cx - TS * 0.09, cy + TS * 0.05); ctx.lineTo(cx, cy - TS * 0.2 * h); ctx.lineTo(cx + TS * 0.09, cy + TS * 0.05);
      }
      ctx.fill();
      if (st === 2) { ctx.fillStyle = '#fff'; ctx.fillRect(px + TS * 0.26, py + TS * 0.12, TS * 0.03, TS * 0.08); }
    }
  }

  function drawExit(px, py, TS, t) {
    var cx = px + TS / 2, cy = py + TS / 2;
    for (var i = 3; i >= 0; i--) {
      var r = TS * (0.18 + i * 0.1) * (1 + 0.08 * Math.sin(t * 5 + i));
      ctx.fillStyle = ['#ffffff', '#ffe600', '#ff3fa4', '#b44dff'][i];
      ctx.globalAlpha = i === 3 ? 0.5 : 1;
      rr(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.45); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#2a0b52';
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 2);
    starPath(0, 0, TS * 0.16); ctx.fill();
    ctx.restore();
  }

  function drawItem(it, px, py, TS, pal, t, x, y) {
    var cx = px + TS / 2, cy = py + TS / 2;
    if (it === I.DOT) {
      var s = TS * 0.15 * (1 + 0.15 * Math.sin(t * 6 + x + y));
      ctx.fillStyle = pal.dot;
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
      return;
    }
    if (it === I.COIN) {
      var sp = Math.abs(Math.cos(t * 3 + x * 0.7 + y)), r = TS * 0.28;
      cy += Math.sin(t * 4 + x) * TS * 0.04;
      ctx.fillStyle = '#b87300';
      ctx.beginPath(); ctx.ellipse(cx, cy + 2, r * Math.max(0.2, sp), r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd400';
      ctx.beginPath(); ctx.ellipse(cx, cy, r * Math.max(0.2, sp), r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff6a8';
      ctx.fillRect(cx - r * 0.25 * sp, cy - r * 0.35, r * 0.5 * sp, r * 0.7);
      return;
    }
    // power-ups: glowing bubble with an icon
    var bob = Math.sin(t * 4 + x) * TS * 0.05, R = TS * 0.36;
    cy += bob;
    var col = it === I.SHIELD ? '#34f5ff' : it === I.MAGNET ? '#ff5a5f' : it === I.FREEZE ? '#9fe8ff' : '#ffd400';
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 6);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, R * 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1a0830'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, TS * 0.06); ctx.stroke();
    drawPowerIcon(it, cx, cy, R * 0.75, col);
  }

  function drawPowerIcon(it, cx, cy, s, col) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = col; ctx.strokeStyle = col;
    if (it === I.SHIELD) {
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.85, -s * 0.6); ctx.lineTo(s * 0.7, s * 0.3); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, s * 0.3); ctx.lineTo(-s * 0.85, -s * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-s * 0.12, -s * 0.6, s * 0.24, s * 1.1);
    } else if (it === I.MAGNET) {
      ctx.lineWidth = s * 0.45; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.6, Math.PI, 0, true); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.6, -s * 0.05); ctx.lineTo(-s * 0.6, -s * 0.7); ctx.moveTo(s * 0.6, -s * 0.05); ctx.lineTo(s * 0.6, -s * 0.7); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(-s * 0.83, -s * 0.95, s * 0.46, s * 0.3); ctx.fillRect(s * 0.37, -s * 0.95, s * 0.46, s * 0.3);
    } else if (it === I.FREEZE) {
      ctx.lineWidth = s * 0.16; ctx.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 3);
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s);
        ctx.moveTo(-s * 0.3, -s * 0.7); ctx.lineTo(0, -s * 0.45); ctx.lineTo(s * 0.3, -s * 0.7);
        ctx.moveTo(-s * 0.3, s * 0.7); ctx.lineTo(0, s * 0.45); ctx.lineTo(s * 0.3, s * 0.7);
        ctx.stroke(); ctx.restore();
      }
    } else {
      ctx.font = '700 ' + Math.round(s * 1.35) + 'px Fredoka';
      ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('x2', 0, s * 0.08);
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }

  function drawPuffer(p, TS, ht) {
    var ph = C.puffPhase(p, ht), st = C.puffState(p, ht);
    var k; // 0 small .. 1 big
    if (st === 0) k = 0;
    else if (st === 1) k = (ph - TM.PUFF_SMALL) / TM.PUFF_WARN * 0.35 + 0.05 * Math.sin(ht * 50);
    else if (st === 2) k = 1;
    else k = 1 - (ph - TM.PUFF_SMALL - TM.PUFF_WARN - TM.PUFF_BIG) / (TM.PUFF_CYCLE - TM.PUFF_SMALL - TM.PUFF_WARN - TM.PUFF_BIG);
    var cx = (p.x + 0.5) * TS, cy = (p.y + 0.5) * TS, r = TS * (0.3 + 0.62 * k);
    if (st === 2) {
      ctx.fillStyle = 'rgba(255,63,108,0.18)';
      ctx.fillRect((p.x - 1) * TS, p.y * TS, TS * 3, TS); ctx.fillRect(p.x * TS, (p.y - 1) * TS, TS, TS * 3);
    }
    // spikes
    ctx.fillStyle = '#ffb35a';
    ctx.beginPath();
    var n = 10;
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2 + ht * 0.5, sl = r * (1 + 0.25 + 0.2 * k);
      ctx.moveTo(cx + Math.cos(a - 0.18) * r * 0.9, cy + Math.sin(a - 0.18) * r * 0.9);
      ctx.lineTo(cx + Math.cos(a) * sl, cy + Math.sin(a) * sl);
      ctx.lineTo(cx + Math.cos(a + 0.18) * r * 0.9, cy + Math.sin(a + 0.18) * r * 0.9);
    }
    ctx.fill();
    ctx.fillStyle = st === 1 ? '#ff9a1f' : '#ffcf3a';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.35, r * 0.6, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    // face
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.2, r * 0.25, 0, Math.PI * 2); ctx.arc(cx + r * 0.35, cy - r * 0.2, r * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a0b20';
    ctx.beginPath(); ctx.arc(cx - r * 0.32, cy - r * 0.18, r * 0.12, 0, Math.PI * 2); ctx.arc(cx + r * 0.32, cy - r * 0.18, r * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.2, r * (st === 2 ? 0.16 : 0.1), 0, Math.PI * 2); ctx.fill();
  }

  function drawBlock(b, TS) {
    var e = b.anim >= 1 ? 1 : 1 - Math.pow(1 - b.anim, 3);
    var x = b.fx + (b.x - b.fx) * e, y = b.fy + (b.y - b.fy) * e;
    var px = x * TS, py = y * TS, m = TS * 0.06;
    ctx.fillStyle = '#5b6b86';
    rr(ctx, px + m, py + m + 3, TS - 2 * m, TS - 2 * m, TS * 0.12); ctx.fill();
    ctx.fillStyle = '#aebbd4';
    rr(ctx, px + m, py + m, TS - 2 * m, TS - 2 * m - 2, TS * 0.12); ctx.fill();
    ctx.fillStyle = '#7d8cab';
    ctx.fillRect(px + TS * 0.2, py + TS * 0.2, TS * 0.6, TS * 0.56);
    ctx.fillStyle = '#ffe600';
    ctx.save(); ctx.translate(px + TS / 2, py + TS / 2);
    ctx.rotate(Math.atan2(b.dy, b.dx));
    ctx.beginPath(); ctx.moveTo(TS * 0.24, 0); ctx.lineTo(-TS * 0.08, -TS * 0.2); ctx.lineTo(-TS * 0.08, TS * 0.2); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#e8eefa';
    [[0.16, 0.16], [0.84, 0.16], [0.16, 0.8], [0.84, 0.8]].forEach(function (q) { ctx.fillRect(px + TS * q[0] - 2, py + TS * q[1] - 2, 4, 4); });
  }

  function drawBat(x, y, TS, ht, b) {
    var cx = (x + 0.5) * TS, cy = (y + 0.5) * TS + Math.sin(ht * 9 + b.off) * TS * 0.06;
    var flap = Math.sin(ht * 22 + b.off * 3), r = TS * 0.26;
    ctx.fillStyle = '#6a2cc9';
    for (var k = -1; k <= 1; k += 2) {
      ctx.beginPath();
      ctx.moveTo(cx + k * r * 0.6, cy - r * 0.2);
      ctx.lineTo(cx + k * r * 2.1, cy - r * (0.9 * flap + 0.2));
      ctx.lineTo(cx + k * r * 1.6, cy + r * 0.3);
      ctx.lineTo(cx + k * r * 1.1, cy + r * 0.05);
      ctx.lineTo(cx + k * r * 0.7, cy + r * 0.5);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#8e4dff';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - r * 0.7, cy - r * 0.5); ctx.lineTo(cx - r * 0.5, cy - r * 1.2); ctx.lineTo(cx - r * 0.2, cy - r * 0.8);
    ctx.moveTo(cx + r * 0.7, cy - r * 0.5); ctx.lineTo(cx + r * 0.5, cy - r * 1.2); ctx.lineTo(cx + r * 0.2, cy - r * 0.8); ctx.fill();
    ctx.fillStyle = '#ffe600';
    ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.1, r * 0.24, 0, Math.PI * 2); ctx.arc(cx + r * 0.35, cy - r * 0.1, r * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a0830';
    ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.05, r * 0.11, 0, Math.PI * 2); ctx.arc(cx + r * 0.3, cy - r * 0.05, r * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(cx - r * 0.2, cy + r * 0.35); ctx.lineTo(cx - r * 0.1, cy + r * 0.6); ctx.lineTo(cx, cy + r * 0.35);
    ctx.moveTo(cx + r * 0.2, cy + r * 0.35); ctx.lineTo(cx + r * 0.1, cy + r * 0.6); ctx.lineTo(cx, cy + r * 0.35); ctx.fill();
  }

  function drawPlayer(TS) {
    // trail
    var col = MK.list[save.mask].body;
    for (var i = 0; i < P.trail.length; i++) {
      var tr = P.trail[i];
      if (tr.a <= 0) continue;
      ctx.globalAlpha = tr.a * 0.35;
      ctx.fillStyle = save.mask === 11 ? 'hsl(' + ((G.menuT * 120 + i * 20) % 360) + ',95%,62%)' : col;
      var s = TS * 0.62 * (0.5 + tr.a * 0.5);
      rr(ctx, (tr.x + 0.5) * TS - s / 2, (tr.y + 0.5) * TS - s / 2, s, s, s * 0.3); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (P.hidden) return;
    if (P.invuln > 0 && Math.floor(P.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.35;
    var cx = (P.x + 0.5) * TS, cy = (P.y + 0.5) * TS;
    var size = TS * 0.74 * P.scale;
    if (G.phase === 'exiting') { ctx.save(); ctx.translate(cx, cy); ctx.rotate((1 - P.scale) * 6); ctx.translate(-cx, -cy); }
    MK.draw(ctx, cx, cy, size, save.mask, { sx: P.sx, sy: P.sy, lx: P.lx, ly: P.ly, t: G.menuT, blink: P.blinkT < 0 && !P.moving });
    if (G.phase === 'exiting') ctx.restore();
    ctx.globalAlpha = 1;
    if (G.shield) {
      ctx.strokeStyle = 'rgba(52,245,255,' + (0.6 + 0.3 * Math.sin(G.menuT * 8)) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, TS * 0.56, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(52,245,255,0.12)'; ctx.fill();
    }
    if (G.magnetT > 0) {
      ctx.strokeStyle = 'rgba(255,90,95,' + (0.25 + 0.15 * Math.sin(G.menuT * 10)) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, TS * (1.2 + 0.4 * ((G.menuT * 2) % 1)), 0, Math.PI * 2); ctx.stroke();
    }
    // first-move hint arrows
    if (!G.firstMoveDone && G.phase === 'play') {
      var pulse = 0.5 + 0.5 * Math.sin(G.menuT * 6);
      ctx.fillStyle = 'rgba(255,230,0,' + (0.5 + 0.5 * pulse) + ')';
      for (var d = 0; d < 4; d++) {
        var D = C.DIRS[d];
        if (solidFor(P.cx + D.dx, P.cy + D.dy)) continue;
        ctx.save(); ctx.translate(cx + D.dx * TS * (0.85 + pulse * 0.15), cy + D.dy * TS * (0.85 + pulse * 0.15));
        ctx.rotate(Math.atan2(D.dy, D.dx));
        ctx.beginPath(); ctx.moveTo(TS * 0.2, 0); ctx.lineTo(-TS * 0.12, -TS * 0.2); ctx.lineTo(-TS * 0.12, TS * 0.2); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawGoo(MX, mazeW, cam, TS) {
    var sy = G.gooY * TS - cam + TS * 0.5;
    if (sy > H + 40) return;
    var t = G.menuT;
    ctx.save();
    ctx.beginPath(); ctx.rect(MX, 0, mazeW, H); ctx.clip();
    ctx.fillStyle = 'rgba(125,255,58,0.25)';
    ctx.beginPath(); ctx.moveTo(MX, H);
    for (var x = 0; x <= mazeW; x += 16) ctx.lineTo(MX + x, sy - 14 + Math.sin(t * 3 + x * 0.03) * 8);
    ctx.lineTo(MX + mazeW, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5be01f';
    ctx.beginPath(); ctx.moveTo(MX, H);
    for (x = 0; x <= mazeW; x += 12) ctx.lineTo(MX + x, sy + Math.sin(t * 4 + x * 0.05) * 6 + Math.sin(t * 2.3 + x * 0.11) * 4);
    ctx.lineTo(MX + mazeW, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b6ff3a';
    ctx.fillRect(MX, sy + 10, mazeW, 4);
    // bubbles
    ctx.fillStyle = 'rgba(230,255,200,0.6)';
    for (var i = 0; i < 9; i++) {
      var bx = MX + ((i * 97 + 30) % mazeW), by = sy + 30 + ((t * 40 + i * 53) % 160);
      if (by < H) { ctx.beginPath(); ctx.arc(bx, by, 3 + (i % 3) * 2, 0, Math.PI * 2); ctx.fill(); }
    }
    // face in the goo
    if (sy < H - 30) {
      var fx0 = MX + mazeW / 2, fy0 = sy + 50;
      ctx.fillStyle = '#1a4a00';
      ctx.beginPath(); ctx.arc(fx0 - 40, fy0, 9, 0, Math.PI * 2); ctx.arc(fx0 + 40, fy0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(fx0, fy0 + 18, 16, 0, Math.PI); ctx.fill();
    }
    ctx.restore();
  }

  /* --------------------------------------------------------------- HUD */
  var RP = { x: 968, w: 296, cx: 1116 }, LP = { x: 16, w: 296, cx: 164 };
  function panel(p, y, h) {
    ctx.fillStyle = 'rgba(20,7,38,0.82)';
    rr(ctx, p.x, y, p.w, h, 20); ctx.fill();
    ctx.strokeStyle = G.pal.edge; ctx.globalAlpha = 0.55; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
  }
  function coinIcon(x, y, r) {
    ctx.fillStyle = '#b87300'; ctx.beginPath(); ctx.arc(x, y + 2, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd400'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff6a8'; ctx.fillRect(x - r * 0.2, y - r * 0.45, r * 0.4, r * 0.9);
  }
  function dotIcon(x, y, s) { ctx.fillStyle = G.pal.dot; ctx.fillRect(x - s / 2, y - s / 2, s, s); }
  function statLine(label, value, y, iconFn) {
    // label on the right (RTL), value on the left
    text(label, RP.x + RP.w - 22, y, 22, '#d9c7ff', 'right', { weight: 500 });
    text(value, RP.x + 22 + (iconFn ? 30 : 0), y, 28, '#fff', 'left');
    if (iconFn) iconFn(RP.x + 34, y - 9);
  }

  function drawHUD() {
    if (G.mode === 'level') drawLevelHUD(); else drawEndlessHUD();
    drawPowerPanel(G.mode === 'level' ? 300 : 250);
    if (G.banner) drawTipCard();
  }

  function wrapLines(str, size, maxW) {
    ctx.font = '700 ' + size + 'px Fredoka';
    ctx.direction = 'rtl';
    var words = str.split(' '), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var tryS = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(tryS).width > maxW && cur) { lines.push(cur); cur = words[i]; }
      else cur = tryS;
    }
    if (cur) lines.push(cur);
    ctx.direction = 'ltr';
    return lines;
  }
  function drawTipCard() {
    var b = G.banner, a = Math.min(1, b.t * 2, (b.max - b.t) * 5);
    var lines = wrapLines(b.s, 26, LP.w - 40), h = 40 + lines.length * 36;
    var y = 650 - h + (1 - a) * 20;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = 'rgba(20,7,38,0.92)';
    rr(ctx, LP.x, y, LP.w, h, 20); ctx.fill();
    ctx.strokeStyle = b.c; ctx.lineWidth = 3; ctx.stroke();
    // little pointer toward the maze
    ctx.fillStyle = b.c;
    ctx.beginPath(); ctx.moveTo(LP.x + LP.w + 2, y + h / 2 - 12); ctx.lineTo(LP.x + LP.w + 16, y + h / 2); ctx.lineTo(LP.x + LP.w + 2, y + h / 2 + 12); ctx.fill();
    for (var i = 0; i < lines.length; i++) text(lines[i], LP.cx, y + 46 + i * 36, 26, b.c, 'center');
    ctx.globalAlpha = 1;
  }

  function keycap(label, x, y) {
    ctx.font = '700 17px Fredoka';
    ctx.direction = 'ltr';
    var w = Math.max(26, ctx.measureText(label).width + 14);
    ctx.fillStyle = '#9aa3c7'; rr(ctx, x - w, y - 20, w, 26, 6); ctx.fill();
    ctx.fillStyle = '#fff'; rr(ctx, x - w, y - 23, w, 26, 6); ctx.fill();
    text(label, x - w / 2, y - 4, 17, '#1d2340', 'center');
    return w;
  }
  // Right-to-left row of [key] word pairs, starting at the right edge x.
  function keyHints(pairs, x, y) {
    for (var i = 0; i < pairs.length; i++) {
      var w = keycap(pairs[i][0], x, y);
      x -= w + 8;
      ctx.font = '500 19px Fredoka'; ctx.direction = 'rtl';
      var tw = ctx.measureText(pairs[i][1]).width;
      ctx.direction = 'ltr';
      text(pairs[i][1], x, y - 3, 19, 'rgba(255,255,255,0.75)', 'right', { weight: 500 });
      x -= tw + 22;
    }
  }

  function drawLevelHUD() {
    panel(RP, 64, 330);
    var n = G.levelN;
    text('المرحلة ' + n, RP.cx, 112, 40, '#ffe600', 'center', { stroke: '#12031f' });
    var nm = G.def.name, fs = fitSize(nm, 24, RP.w - 30);
    text(nm, RP.cx, 148, fs, '#fff', 'center');
    // hearts
    for (var i = 0; i < 3; i++) {
      var hx = RP.cx + (1 - i) * 52, full = i < G.hearts;
      heartPath(hx, 196, 40);
      ctx.fillStyle = full ? '#ff3f6c' : '#3a2458'; ctx.fill();
      if (full) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(hx - 9, 186, 4, 0, Math.PI * 2); ctx.fill(); }
    }
    statLine('النقاط', G.dotsGot + '/' + G.dotsTotal, 262, function (x, y) { dotIcon(x, y, 12); });
    statLine('العملات', String(G.coinsGot), 312, function (x, y) { coinIcon(x, y, 11); });
    var over = G.time > G.def.par;
    statLine('الوقت', fmtTime(G.time), 362, null);
    // goals panel (left)
    panel(LP, 64, 220);
    text('النجوم', LP.cx, 104, 30, '#ffe600', 'center');
    var goals = [
      ['كل النقاط', G.dotsGot >= G.dotsTotal, G.dotsGot > 0 ? 1 : 0],
      ['بلا إصابة', G.hits === 0, 1],
      ['أسرع من ' + fmtTime(G.def.par), !over, 1]
    ];
    for (i = 0; i < 3; i++) {
      var gy = 150 + i * 44, ok = goals[i][1];
      starPath(LP.x + LP.w - 36, gy - 9, 16);
      ctx.fillStyle = ok ? '#ffe600' : '#3a2458'; ctx.fill();
      if (i === 0 && !ok) { ctx.strokeStyle = '#6b4d8f'; ctx.lineWidth = 2; ctx.stroke(); }
      var lf = fitSize(goals[i][0], 22, LP.w - 80, 500);
      text(goals[i][0], LP.x + LP.w - 62, gy, lf, ok ? '#fff' : (i === 1 || i === 2 ? '#8f7aa8' : '#d9c7ff'), 'right', { weight: 500 });
    }
    // keys hint
    keyHints([['P', 'إيقاف'], ['R', 'إعادة'], ['M', 'الصوت']], LP.x + LP.w - 10, H - 22);
  }

  function drawEndlessHUD() {
    panel(RP, 64, 300);
    text('الارتفاع', RP.cx, 104, 24, '#d9c7ff', 'center', { weight: 500 });
    text(G.maxHeight + ' م', RP.cx, 160, 56, '#b6ff3a', 'center', { stroke: '#12031f' });
    statLine('النتيجة', String(scoreNow()), 222, null);
    statLine('العملات', String(G.coinsGot), 270, function (x, y) { coinIcon(x, y, 11); });
    statLine('الأفضل', String(save.bestScore), 318, null);
    // goo meter (left panel)
    panel(LP, 64, 170);
    text('الهلام', LP.cx, 102, 28, '#7dff3a', 'center');
    var gap = Math.max(0, G.gooY - P.y), danger = Math.max(0, Math.min(1, 1 - (gap - 2) / 10));
    var bx = LP.x + 26, bw = LP.w - 52;
    ctx.fillStyle = '#2a1238'; rr(ctx, bx, 124, bw, 26, 13); ctx.fill();
    ctx.fillStyle = danger > 0.7 ? '#ff3f6c' : danger > 0.4 ? '#ffb35a' : '#7dff3a';
    rr(ctx, bx + bw * (1 - Math.max(0.08, danger)), 124, bw * Math.max(0.08, danger), 26, 13); ctx.fill();
    var msg = !G.gooStarted ? 'ينتظرك...' : danger > 0.7 ? 'أسرع!!' : danger > 0.4 ? 'إنه يقترب!' : 'بعيد عنك';
    text(msg, LP.cx, 190, 24, danger > 0.7 ? '#ff6b9a' : '#fff', 'center');
    if (danger > 0.7 && Math.floor(G.menuT * 4) % 2 === 0 && G.phase === 'play') {
      ctx.strokeStyle = 'rgba(255,63,108,0.5)'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10);
    }
    keyHints([['P', 'إيقاف'], ['R', 'إعادة'], ['M', 'الصوت']], LP.x + LP.w - 10, H - 22);
  }

  function drawPowerPanel(y) {
    var list = [];
    if (G.shield) list.push([I.SHIELD, 'درع', -1, '#34f5ff']);
    if (G.magnetT > 0) list.push([I.MAGNET, 'مغناطيس', G.magnetT / 8, '#ff5a5f']);
    if (G.freezeT > 0) list.push([I.FREEZE, 'تجميد', G.freezeT / 5, '#9fe8ff']);
    if (G.doubleT > 0) list.push([I.DOUBLE, 'مضاعفة', G.doubleT / 12, '#ffd400']);
    if (!list.length) return;
    panel(LP, y, 20 + list.length * 56);
    for (var i = 0; i < list.length; i++) {
      var q = list[i], yy = y + 38 + i * 56;
      ctx.fillStyle = '#1a0830'; ctx.beginPath(); ctx.arc(LP.x + LP.w - 36, yy, 20, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = q[3]; ctx.lineWidth = 3; ctx.stroke();
      drawPowerIcon(q[0], LP.x + LP.w - 36, yy, 14, q[3]);
      text(q[1], LP.x + LP.w - 66, yy + 8, 22, '#fff', 'right');
      if (q[2] >= 0) {
        ctx.fillStyle = '#2a1238'; rr(ctx, LP.x + 20, yy - 6, 110, 12, 6); ctx.fill();
        ctx.fillStyle = q[3]; rr(ctx, LP.x + 20, yy - 6, 110 * Math.max(0, q[2]), 12, 6); ctx.fill();
      }
    }
  }

  function scoreNow() { return G.maxHeight * 10 + G.dotsGot + (G.bonus || 0); }

  /* --------------------------------------------------------- overlays */
  function pause() {
    if (G.screen !== 'play') return;
    showScreen('pause');
    $('pause-sub').textContent = G.mode === 'level' ? ('المرحلة ' + G.levelN + ': ' + G.def.name) : ('الهلام الصاعد · ' + G.maxHeight + ' م');
    P.buffer = -1;
  }
  function resume() { hideAll(); G.screen = 'play'; K.reset(); try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }

  function showWin() {
    var n = G.levelN, prev = save.lv[n] || { done: 0, s: 0, t: 0 };
    var got = [G.dotsGot >= G.dotsTotal, G.hits === 0, G.time <= G.def.par];
    var bits = (got[0] ? 1 : 0) | (got[1] ? 2 : 0) | (got[2] ? 4 : 0);
    var starsBefore = totalStars();
    var newBestTime = !prev.t || G.time < prev.t;
    var newStars = bits & ~(prev.s | 0), starBonus = 0;
    for (var sb = 0; sb < 3; sb++) if (newStars & (1 << sb)) starBonus += STAR_BONUS;
    save.lv[n] = { done: 1, s: (prev.s | bits), t: newBestTime ? Math.round(G.time * 10) / 10 : prev.t };
    save.coins += G.coinsGot + starBonus;
    persist();
    checkMaskUnlocks(starsBefore, totalStars(), -1);
    if (!prev.done && n % 10 === 0 && n < LEVELS.length) toast('فتحت عالمًا جديدًا: ' + WORLDS[n / 10].name + '!');
    $('win-kicker').textContent = 'المرحلة ' + n + ' · ' + G.def.name;
    var nStars = got.filter(Boolean).length;
    $('win-title').textContent = nStars === 3 ? 'مثالي!' : nStars === 2 ? 'رائع جدًا!' : nStars === 1 ? 'أحسنت!' : 'نجحت!';
    $('win-par-lbl').textContent = 'أسرع من ' + fmtTime(G.def.par);
    var starEls = document.querySelectorAll('#win-stars .md-star');
    Array.prototype.forEach.call(starEls, function (el) { el.classList.remove('on'); });
    $('win-stats').innerHTML = 'النقاط: <b>' + G.dotsGot + '/' + G.dotsTotal + '</b> · الوقت: <b dir="ltr">' + fmtTime(G.time) + '</b> · العملات: <b>' + G.coinsGot + '</b>' +
      (starBonus ? '<br>مكافأة النجوم الجديدة: <b>+' + starBonus + '</b> <span class="md-coin-ico"></span>' : '');
    var nb = $('win-new');
    if (prev.done && newBestTime) { nb.hidden = false; nb.textContent = 'أفضل وقت جديد!'; }
    else nb.hidden = true;
    $('btn-next').hidden = n >= LEVELS.length;
    showScreen('win');
    G.resultLock = 0.5;
    var delay = 350;
    got.forEach(function (g, i) {
      if (!g) return;
      setTimeout(function () {
        if (G.screen !== 'win') return;
        starEls[i].classList.add('on');
        sfx.star(i);
      }, delay);
      delay += 380;
    });
    if (nStars === 3) setTimeout(function () { if (G.screen === 'win') confetti(); }, delay);
  }
  function confetti() {
    for (var i = 0; i < 5; i++) {
      var wx = G.mx + Math.random() * COLS * G.tile, wy = G.cam + Math.random() * H * 0.5;
      fx.burst(wx, wy, { count: 24, colors: ['#ffe600', '#ff3fa4', '#34f5ff', '#b6ff3a', '#fff'], speed: 380, life: 1.2, size: 8, gravity: 400 });
    }
    Kit.sfx.win();
  }
  function goNext() {
    if (G.levelN >= LEVELS.length) { openLevels(); return; }
    startLevel(G.levelN + 1);
  }
  function showFail() {
    $('fail-kicker').textContent = 'المرحلة ' + G.levelN + ' · ' + G.def.name;
    var pct = G.dotsTotal ? Math.round(G.dotsGot / G.dotsTotal * 100) : 0;
    $('fail-sub').textContent = pct >= 60 ? 'كدت تنجح! جمعت ' + pct + '% من النقاط.' : 'لا بأس! كل بطل يتعثر أحيانًا.';
    sfx.lose();
    showScreen('fail');
    G.resultLock = 0.5;
  }
  function showOver() {
    var score = scoreNow();
    var isBest = score > save.bestScore;
    var hBefore = save.bestH;
    save.runs++;
    if (isBest) save.bestScore = score;
    if (G.maxHeight > save.bestH) save.bestH = G.maxHeight;
    var hBonus = Math.floor(G.maxHeight / 5);
    save.coins += G.coinsGot + hBonus;
    persist();
    checkMaskUnlocks(-1, -1, hBefore);
    $('over-title').textContent = G.deathKind === 'goo' ? 'ابتلعك الهلام!' : 'أوه! أصابك خطر!';
    $('over-score').textContent = Kit.fmt(score);
    $('over-new').hidden = !isBest || score <= 0;
    $('over-stats').innerHTML = 'الارتفاع: <b>' + G.maxHeight + ' م</b> · النقاط: <b>' + G.dotsGot + '</b> · العملات: <b>' + (G.coinsGot + hBonus) + '</b> <span class="md-coin-ico"></span><br>أفضل نتيجة: <b>' + Kit.fmt(save.bestScore) + '</b> · أعلى ارتفاع: <b>' + save.bestH + ' م</b>';
    if (isBest && score > 0) { setTimeout(function () { confetti(); }, 200); }
    else sfx.lose();
    showScreen('over');
    G.resultLock = 0.6;
  }

  function checkMaskUnlocks(starsBefore, starsAfter, hBefore) {
    MK.list.forEach(function (m) {
      if (save.owned.indexOf(m.id) >= 0) return;
      var u = m.unlock;
      if (u.stars && starsBefore >= 0 && starsBefore < u.stars && starsAfter >= u.stars) { save.owned.push(m.id); toast('قناع جديد: ' + m.name + '!'); }
      if (u.height && hBefore >= 0 && hBefore < u.height && save.bestH >= u.height) { save.owned.push(m.id); toast('قناع جديد: ' + m.name + '!'); }
    });
    persist();
  }

  function toTitle() {
    refreshTitle();
    showScreen('title');
  }
  function refreshTitle() {
    var n = nextLevelToPlay();
    var allDone = save.lv[LEVELS.length] && save.lv[LEVELS.length].done;
    $('sub-play').textContent = allDone ? 'اجمع كل النجوم · المرحلة ' + n : 'المرحلة ' + n;
    $('sub-levels').textContent = '★ ' + totalStars() + ' / ' + LEVELS.length * 3;
    $('sub-endless').textContent = save.bestH ? 'أعلى ارتفاع: ' + save.bestH + ' م' : 'اصعد بلا توقف!';
    $('sub-shop').textContent = save.coins + ' عملة';
  }

  /* ------------------------------------------------------ level select */
  var selWorld = 0;
  function openLevels() {
    selWorld = Math.floor((Math.min(nextLevelToPlay(), LEVELS.length) - 1) / 10);
    buildLevels();
    showScreen('levels');
  }
  function buildLevels() {
    var tabs = $('world-tabs'), grid = $('level-grid');
    tabs.innerHTML = ''; grid.innerHTML = '';
    var unl = unlockedUpTo();
    WORLDS.forEach(function (w, i) {
      var b = document.createElement('button');
      b.type = 'button';
      var locked = unl < i * 10 + 1;
      b.className = 'md-tab' + (i === selWorld ? ' on' : '') + (locked ? ' locked' : '');
      b.textContent = (locked ? '🔒 ' : '') + 'العالم ' + (i + 1);
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { sfx.click(); selWorld = i; buildLevels(); });
      tabs.appendChild(b);
    });
    $('world-name').textContent = WORLDS[selWorld].name;
    for (var n = selWorld * 10 + 1; n <= selWorld * 10 + 10; n++) {
      (function (n) {
        var b = document.createElement('button');
        b.type = 'button';
        var locked = n > unl, st = starCount(n), info = levelInfo(n);
        b.className = 'md-lv' + (locked ? ' locked' : '') + (n === unl && !(info && info.done) ? ' next' : '');
        var s = '';
        for (var k = 0; k < 3; k++) s += '<span class="' + (info && (info.s & (1 << k)) ? 'on' : '') + '">★</span>';
        b.innerHTML = '<span class="n">' + (locked ? '🔒' : n) + '</span><span class="s">' + (locked ? '' : s) + '</span>';
        b.title = LEVELS[n - 1].name;
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });
        b.addEventListener('click', function () {
          if (locked) { sfx.no(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
          sfx.click(); startLevel(n);
        });
        grid.appendChild(b);
      })(n);
    }
    $('stars-total').textContent = '★ ' + totalStars() + ' / ' + LEVELS.length * 3;
  }

  /* -------------------------------------------------------------- shop */
  function openShop() { buildShop(); showScreen('shop'); }
  function unlockLabel(m) {
    var u = m.unlock;
    if (u.stars) return '★ ' + u.stars + ' نجمة';
    if (u.height) return 'اصعد ' + u.height + ' م';
    return u.coins + ' عملة';
  }
  function buildShop() {
    $('shop-coins').textContent = save.coins;
    var grid = $('shop-grid');
    grid.innerHTML = '';
    MK.list.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      var owned = save.owned.indexOf(m.id) >= 0, sel = save.mask === m.id;
      var can = !owned && m.unlock.coins != null && save.coins >= m.unlock.coins;
      b.className = 'md-mask' + (sel ? ' sel' : '') + (!owned && !can ? ' cant' : '');
      var cv = document.createElement('canvas');
      cv.width = 96; cv.height = 96;
      var c2 = cv.getContext('2d');
      MK.draw(c2, 48, 54, 56, m.id, { t: 0.4 });
      if (!owned) { c2.fillStyle = 'rgba(20,7,38,0.45)'; c2.fillRect(0, 0, 96, 96); }
      b.appendChild(cv);
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = m.name; b.appendChild(nm);
      var pr = document.createElement('div'); pr.className = 'pr';
      pr.textContent = sel ? 'مُختار ✓' : owned ? 'اختر' : unlockLabel(m);
      b.appendChild(pr);
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () {
        if (owned) { save.mask = m.id; persist(); sfx.click(); buildShop(); return; }
        if (can) {
          save.coins -= m.unlock.coins; save.owned.push(m.id); save.mask = m.id; persist();
          sfx.buy(); toast('حصلت على قناع ' + m.name + '!'); buildShop(); return;
        }
        sfx.no();
        b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
      });
      grid.appendChild(b);
    });
  }

  /* ------------------------------------------------------------ inputs */
  on('btn-play', function () { startLevel(nextLevelToPlay()); });
  on('btn-endless', function () { startEndless(); });
  on('btn-levels', openLevels);
  on('btn-shop', openShop);
  on('btn-levels-back', toTitle);
  on('btn-shop-back', toTitle);
  on('btn-resume', resume);
  on('btn-restart', restart);
  on('btn-pause-menu', toTitle);
  on('btn-next', goNext);
  on('btn-win-retry', function () { startLevel(G.levelN); });
  on('btn-win-levels', openLevels);
  on('btn-fail-retry', function () { startLevel(G.levelN); });
  on('btn-fail-levels', openLevels);
  on('btn-over-again', startEndless);
  on('btn-over-menu', toTitle);

  // mouse swipe
  var swipe = null;
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    var l = view.toLogical(e.clientX, e.clientY);
    swipe = { x: l.x, y: l.y };
  });
  window.addEventListener('pointermove', function (e) {
    if (!swipe || G.screen !== 'play') return;
    var l = view.toLogical(e.clientX, e.clientY), dx = l.x - swipe.x, dy = l.y - swipe.y;
    if (dx * dx + dy * dy < 30 * 30) return;
    var d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    tryDash(d);
    swipe = { x: l.x, y: l.y };
  });
  window.addEventListener('pointerup', function () { swipe = null; });
  document.addEventListener('visibilitychange', function () { if (document.hidden && G.screen === 'play') pause(); });

  /* ----------------------------------------------------------- autoplay */
  // Debug/test helper: plans with the same rules as tools/verify.js.
  function autoStep() {
    if (P.moving || G.phase !== 'play') return;
    var ai = G.ai;
    if (ai && ai.waitFor != null) { if (G.blockSteps < ai.waitFor) return; ai.waitFor = null; }
    // with moving blocks, only act right after a block step (as a player would)
    if (G.world.blocks.length && G.blockT > G.blockStep * 0.25) return;
    if (!ai || !ai.acts.length || ai.stale) {
      var remaining = {}, left = 0;
      if (G.mode === 'level') {
        for (var y = 0; y < G.L.h; y++) for (var x = 0; x < COLS; x++) {
          var it = G.world.item(x, y);
          if (it === I.DOT || it === I.COIN) { remaining[C.key(x, y)] = 1; left++; }
        }
      }
      if (G.mode === 'level' && G.world.blocks.length) {
        var ex = exactExitPlan();
        if (!ex) return;
        G.ai = ai = { acts: ex, stale: false };
        var a0 = ai.acts.shift();
        if (a0 === 4) { ai.waitFor = G.blockSteps + 1; return; }
        ai.stale = true;
        tryDash(a0);
        return;
      }
      var bl = G.world.blocks.map(function (b) { return { x: b.x, y: b.y, dx: b.dx, dy: b.dy }; });
      var snaps = C.blockSnapshots(worldG, bl, function (x, y) { return x === P.cx && y === P.cy; });
      var r = null;
      if (left) r = C.plan(worldG, P.cx, P.cy, C.itemGoal(worldG, remaining, false), { snaps: snaps });
      if (!r) r = C.plan(worldG, P.cx, P.cy, function (m) { return m.exit; }, { snaps: snaps });
      if (G.mode === 'endless') r = C.plan(worldG, P.cx, P.cy, function (m) { return m.y < P.cy - 1; }, { snaps: snaps, maxNodes: 4000 });
      if (!r) return;
      G.ai = ai = { acts: r.actions.slice(), stale: false };
    }
    var a = ai.acts.shift();
    if (a === 4) { ai.waitFor = G.blockSteps + 1; return; }
    ai.stale = G.world.blocks.length > 0;
    tryDash(a);
  }

  // Exact search over (player cell, block states) to the exit (debug autoplay).
  function exactExitPlan() {
    var enc = function (x, y, bl) { var k = x + ',' + y; for (var i = 0; i < bl.length; i++) k += '|' + bl[i].x + ',' + bl[i].y + ',' + bl[i].dx + ',' + bl[i].dy; return k; };
    var st0 = { x: P.cx, y: P.cy, bl: G.world.blocks.map(function (b) { return { x: b.x, y: b.y, dx: b.dx, dy: b.dy }; }), par: null, act: -1 };
    var seen = {}, q = [st0], h = 0;
    seen[enc(st0.x, st0.y, st0.bl)] = 1;
    function path(s, last) { var acts = [last]; while (s.par) { acts.unshift(s.act); s = s.par; } return acts; }
    while (h < q.length && q.length < 250000) {
      var s = q[h++], snap = {};
      s.bl.forEach(function (b) { snap[C.key(b.x, b.y)] = 1; });
      for (var d = 0; d < 4; d++) {
        var m = C.dash(worldG, s.x, s.y, d, snap);
        if (!m || m.dead) continue;
        if (m.exit) return path(s, d);
        var k = enc(m.x, m.y, s.bl);
        if (!seen[k]) { seen[k] = 1; q.push({ x: m.x, y: m.y, bl: s.bl, par: s, act: d }); }
      }
      var bl2 = s.bl.map(function (b) { return { x: b.x, y: b.y, dx: b.dx, dy: b.dy }; });
      C.stepBlocks(worldG, bl2, function (x, y) { return x === s.x && y === s.y; });
      var k2 = enc(s.x, s.y, bl2);
      if (!seen[k2]) { seen[k2] = 1; q.push({ x: s.x, y: s.y, bl: bl2, par: s, act: 4 }); }
    }
    return null;
  }

  window.__game = {
    get state() { return { screen: G.screen, mode: G.mode, phase: G.phase, level: G.levelN, hearts: G.hearts, dots: G.dotsGot, dotsTotal: G.dotsTotal, coins: G.coinsGot, time: Math.round(G.time * 10) / 10, height: G.maxHeight, gooGap: Math.round((G.gooY - P.y) * 10) / 10, px: P.cx, py: P.cy, moving: P.moving, particles: fx.list.length, saveCoins: save.coins, bats: G.world ? G.world.bats.length : 0, rows: G.world ? Object.keys(G.world.rows).length : 0 }; },
    save: save,
    skip: function (n) { startLevel(n); },
    endless: function () { startEndless(); },
    win: function () { if (G.screen === 'play' && G.mode === 'level') reachExit(); },
    dash: function (d) { tryDash(d); },
    set god(v) { G.god = !!v; }, get god() { return G.god; },
    set autoplay(v) { G.autoplay = !!v; G.ai = null; }, get autoplay() { return G.autoplay; },
    set speed(v) { G.speed = Math.max(1, Math.min(20, v | 0)); }, get speed() { return G.speed; },
    debug: function () { return { ai: G.ai, blocks: G.world.blocks.map(function (b) { return [b.x, b.y, b.dx, b.dy, b.fx, b.fy, +b.anim.toFixed(2)]; }), blockT: +G.blockT.toFixed(2), steps: G.blockSteps, p: [P.cx, P.cy, P.moving] }; },
    title: toTitle, levels: openLevels, shop: openShop,
    unlockAll: function () { for (var i = 1; i <= LEVELS.length; i++) if (!save.lv[i]) save.lv[i] = { done: 1, s: 0, t: 0 }; persist(); }
  };

  /* -------------------------------------------------------------- loop */
  refreshTitle();
  showScreen('title');
  Kit.loop(function (dt) {
    for (var i = 0; i < G.speed; i++) {
      tick(dt);
      if (i === 0) K.endFrame();
    }
    if (G.resultLock > 0) G.resultLock -= dt;
  }, render);
})();
