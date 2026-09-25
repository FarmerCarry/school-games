/* Block World — game: player, animals, items, mining/placing, crafting UI, quests, saving. */
(function () {
  'use strict';
  var BW = window.BW;
  var B = BW.B, I = BW.I, BLOCKS = BW.BLOCKS, ITEMS = BW.ITEMS, TEX = BW.TEX, W = BW.W, H = BW.H, TS = BW.TS;
  var VW = 1280, VH = 720, VTW = VW / TS, VTH = VH / TS;
  var store = Kit.store('block-world');
  var A = Kit.audio;
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  // Arabic text helpers: pick the canvas text direction from the content, and keep
  // number groups like "+3" or "3 / 27" in left-to-right order inside Arabic text.
  var AR_RE = /[\u0600-\u06FF]/;
  function dirOf(s) { return AR_RE.test(s) ? 'rtl' : 'ltr'; }
  function ltr(s) { return '\u2066' + s + '\u2069'; }
  function plusN(n, s) { return ltr('+' + n) + ' ' + s; }

  // --------------------------------------------------------------- canvas
  var canvas = $('game');
  var ui = $('ui');
  var view = Kit.fit(canvas, VW, VH, {
    smooth: false,
    onResize: function (v) {
      var r = canvas.style;
      ui.style.left = r.left; ui.style.top = r.top;
      ui.style.transform = 'scale(' + v.scale + ')';
    }
  });
  var shake = Kit.shake();

  // ---------------------------------------------------------------- input
  var M = { x: VW / 2, y: VH / 2, left: false, right: false, lp: false, rp: false, wheel: 0, onUI: false };
  canvas.addEventListener('mousedown', function (e) {
    A.unlock();
    if (e.button === 0) { M.left = true; M.lp = true; }
    if (e.button === 2) { M.right = true; M.rp = true; }
  });
  window.addEventListener('mouseup', function (e) { if (e.button === 0) M.left = false; if (e.button === 2) M.right = false; });
  window.addEventListener('mousemove', function (e) { var l = view.toLogical(e.clientX, e.clientY); M.x = l.x; M.y = l.y; moveCursorEl(e); });
  window.addEventListener('blur', function () { M.left = M.right = false; });
  canvas.addEventListener('wheel', function (e) { e.preventDefault(); M.wheel += e.deltaY > 0 ? 1 : -1; }, { passive: false });
  var K = Kit.keys;
  function kd(c) { return K.anyDown(c); }
  function kp(c) { return K.anyPressed(c); }
  var LEFT = ['KeyA', 'ArrowLeft'], RIGHT = ['KeyD', 'ArrowRight'], UP = ['KeyW', 'ArrowUp'], JUMP = ['Space', 'KeyW', 'ArrowUp'], DOWN = ['KeyS', 'ArrowDown', 'ShiftLeft'];

  // ---------------------------------------------------------------- sound
  var SND = {
    mat: function (mat, v) {
      v = v || 1;
      switch (mat) {
        case 'dirt': A.noise({ dur: 0.08, vol: 0.28 * v, filter: 900, to: 250 }); break;
        case 'stone': A.noise({ dur: 0.06, vol: 0.22 * v, filter: 3200, to: 900 }); A.tone({ freq: 190, to: 120, type: 'square', dur: 0.04, vol: 0.05 * v }); break;
        case 'wood': A.tone({ freq: 230, to: 150, type: 'triangle', dur: 0.07, vol: 0.22 * v }); A.noise({ dur: 0.05, vol: 0.1 * v, filter: 1600 }); break;
        case 'sand': A.noise({ dur: 0.1, vol: 0.18 * v, filter: 5200, to: 1800 }); break;
        case 'leaf': A.noise({ dur: 0.07, vol: 0.13 * v, filter: 6500, to: 2500 }); break;
        case 'glass': A.tone({ freq: 1900, to: 1500, type: 'sine', dur: 0.06, vol: 0.09 * v }); break;
        case 'wool': A.noise({ dur: 0.08, vol: 0.16 * v, filter: 700 }); break;
        case 'snow': A.noise({ dur: 0.09, vol: 0.17 * v, filter: 2600, to: 700 }); break;
        case 'metal': A.tone({ freq: 880, to: 700, type: 'square', dur: 0.05, vol: 0.06 * v }); A.noise({ dur: 0.04, vol: 0.1 * v, filter: 4000 }); break;
        case 'water': A.noise({ dur: 0.2, vol: 0.15 * v, filter: 1400, to: 300 }); break;
        default: A.noise({ dur: 0.06, vol: 0.15 * v, filter: 2000 });
      }
    },
    brk: function (mat) {
      SND.mat(mat, 1.5);
      if (mat === 'glass') { [2400, 3100, 2700].forEach(function (f, i) { A.tone({ freq: f, to: f * 0.7, type: 'sine', dur: 0.1, vol: 0.08, delay: i * 0.03 }); }); }
      A.tone({ freq: 420, to: 820, type: 'sine', dur: 0.07, vol: 0.14, delay: 0.02 });
    },
    place: function (mat) { A.tone({ freq: 150, to: 90, type: 'triangle', dur: 0.08, vol: 0.28 }); SND.mat(mat, 0.6); },
    pickup: function (combo) { var f = 700 + Math.min(combo, 12) * 55; A.tone({ freq: f, to: f * 1.4, type: 'square', dur: 0.06, vol: 0.09 }); },
    step: function (mat) { if (mat === 'stone' || mat === 'metal') A.noise({ dur: 0.03, vol: 0.06, filter: 2400 }); else if (mat === 'wood') A.tone({ freq: 160, to: 120, type: 'triangle', dur: 0.04, vol: 0.07 }); else A.noise({ dur: 0.04, vol: 0.07, filter: mat === 'sand' || mat === 'snow' ? 3500 : 1000 }); },
    jump: function () { A.tone({ freq: 260, to: 520, type: 'square', dur: 0.1, vol: 0.08 }); },
    land: function (v) { A.tone({ freq: 130, to: 60, type: 'triangle', dur: 0.1, vol: 0.18 * v }); A.noise({ dur: 0.08, vol: 0.12 * v, filter: 800 }); },
    craft: function () { A.tone({ freq: 660, type: 'triangle', dur: 0.08, vol: 0.2 }); A.tone({ freq: 990, type: 'triangle', dur: 0.14, vol: 0.2, delay: 0.07 }); A.tone({ freq: 1320, type: 'sine', dur: 0.12, vol: 0.12, delay: 0.14 }); },
    quest: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.18, vol: 0.22, delay: i * 0.08 }); }); A.tone({ freq: 1568, type: 'sine', dur: 0.5, vol: 0.14, delay: 0.42 }); },
    bonk: function () { A.tone({ freq: 160, to: 110, type: 'square', dur: 0.09, vol: 0.1 }); },
    oink: function () { A.tone({ freq: 240, to: 170, type: 'sawtooth', dur: 0.12, vol: 0.08 }); A.tone({ freq: 250, to: 180, type: 'sawtooth', dur: 0.12, vol: 0.08, delay: 0.14 }); },
    cluck: function () { A.tone({ freq: 950, to: 620, type: 'square', dur: 0.05, vol: 0.06 }); A.tone({ freq: 1000, to: 650, type: 'square', dur: 0.05, vol: 0.06, delay: 0.08 }); A.tone({ freq: 1200, to: 700, type: 'square', dur: 0.08, vol: 0.06, delay: 0.16 }); },
    baa: function () { [440, 410, 440, 400].forEach(function (f, i) { A.tone({ freq: f, type: 'sawtooth', dur: 0.07, vol: 0.06, delay: i * 0.06 }); }); },
    snip: function () { A.noise({ dur: 0.03, vol: 0.2, filter: 8000 }); A.noise({ dur: 0.03, vol: 0.2, filter: 8000, delay: 0.08 }); },
    splash: function () { A.noise({ dur: 0.35, vol: 0.22, filter: 1600, to: 250 }); },
    door: function () { A.tone({ freq: 320, to: 210, type: 'triangle', dur: 0.08, vol: 0.14 }); A.noise({ dur: 0.05, vol: 0.08, filter: 1200 }); },
    click: function () { A.tone({ freq: 700, type: 'square', dur: 0.04, vol: 0.08 }); },
    grow: function () { [523, 784, 1047].forEach(function (f, i) { A.tone({ freq: f, type: 'sine', dur: 0.12, vol: 0.12, delay: i * 0.06 }); }); },
    timber: function () { A.noise({ dur: 0.5, vol: 0.3, filter: 1200, to: 120 }); A.tone({ freq: 200, to: 60, type: 'triangle', dur: 0.4, vol: 0.2 }); }
  };
  // Gentle ambient music: sparse pentatonic notes.
  var music = { t: 3 };
  function updateMusic(dt) {
    music.t -= dt;
    if (music.t > 0 || !A.ctx || A.muted) return;
    music.t = 2.6 + Math.random() * 3.5;
    var night = BW.envAt(G.tod).night > 0.5, deep = G.mode === 'play' && P.y > 90;
    var scale = night || deep ? [220, 261.6, 293.7, 329.6, 392, 440] : [261.6, 293.7, 329.6, 392, 440, 523.3];
    var n = 1 + Math.floor(Math.random() * 3), base = Math.floor(Math.random() * 4);
    for (var i = 0; i < n; i++) A.tone({ freq: scale[(base + i * 2) % scale.length] * (Math.random() < 0.3 ? 2 : 1), type: 'sine', dur: 1.6, vol: 0.045, attack: 0.04, delay: i * 0.35 });
  }

  // ------------------------------------------------------------ game state
  var meta = store.get('meta', null) || {};
  if (!meta.slots || meta.slots.length !== 3) meta.slots = [null, null, null];
  meta.totalStars = meta.totalStars || 0; meta.skin = meta.skin || 0; meta.lastSlot = meta.lastSlot || 1;
  function saveMeta() { store.set('meta', meta); }

  var G = {
    mode: 'title', slot: 0, gm: 'survival', name: '', world: null, rend: null,
    inv: [], sel: 0, cursor: null, stats: null, done: {}, tod: 0.1, time: 0, play: 0,
    animals: [], items: [], saplings: [], cam: { x: 230, y: 45 }, spawn: { x: 250, y: 50 },
    hint: null, toasts: [], banner: null, lastBiome: '', lastZone: '', saveT: 0, savedFlash: 0,
    nearTable: false, nearFurnace: false, masterShown: false, questT: 0, selPop: 0, selName: 0,
    openDoors: {}, titleT: 0
  };
  var P = null; // player
  function newStats() { return { got: {}, craft: {}, placed: {}, mined: {}, sheared: 0, pets: 0, maxDepth: 0, placedTotal: 0, biomes: {}, flew: 0, highestPlace: 999 }; }
  function questsFor(gm) { return gm === 'creative' ? BW.QUESTS_CREATIVE : BW.QUESTS_SURVIVAL; }

  // ---------------------------------------------------------- inventory
  function emptyInv() { var a = []; for (var i = 0; i < 36; i++) a.push(null); return a; }
  function addItem(id, n) {
    var inv = G.inv, mx = BW.maxStack(id), i;
    for (i = 0; i < 36 && n > 0; i++) { var s = inv[i]; if (s && s.id === id && s.n < mx) { var k = Math.min(n, mx - s.n); s.n += k; n -= k; bumpSlot(i); } }
    for (i = 0; i < 36 && n > 0; i++) { if (!inv[i]) { var k2 = Math.min(n, mx); inv[i] = { id: id, n: k2 }; n -= k2; bumpSlot(i); } }
    invDirty = true;
    return n;
  }
  function canAccept(id) { var mx = BW.maxStack(id); for (var i = 0; i < 36; i++) { var s = G.inv[i]; if (!s || (s.id === id && s.n < mx)) return true; } return false; }
  function matches(id, want) { return want === BW.FLOWER ? (id === B.FLOWER_RED || id === B.FLOWER_YELLOW || id === B.FLOWER_BLUE) : id === want; }
  function countItem(want) { var n = 0; for (var i = 0; i < 36; i++) { var s = G.inv[i]; if (s && matches(s.id, want)) n += s.n; } return n; }
  function removeItem(want, n) {
    for (var i = 35; i >= 0 && n > 0; i--) { var s = G.inv[i]; if (s && matches(s.id, want)) { var k = Math.min(n, s.n); s.n -= k; n -= k; if (s.n <= 0) G.inv[i] = null; } }
    invDirty = true;
  }
  var slotBump = new Float32Array(36);
  function bumpSlot(i) { slotBump[i] = 1; }
  function bestPick() {
    if (G.gm === 'creative') return { tool: 9, speed: 30, id: I.PICK_DIAMOND };
    var best = { tool: 0, speed: 1, id: 0 };
    for (var i = 0; i < 36; i++) { var s = G.inv[i]; if (s) { var it = ITEMS[s.id]; if (it && it.tool && it.tool > best.tool) best = { tool: it.tool, speed: it.speed, id: s.id }; } }
    return best;
  }
  var PICK_FOR_TIER = [null, 'معول خشبي', 'معول حجري', 'معول حديدي'];

  // ---------------------------------------------------------- particles
  var PMAX = 520, parts = [];
  for (var pi = 0; pi < PMAX; pi++) parts.push({ on: false });
  var pNext = 0;
  function part(x, y, vx, vy, life, size, col, g, kind) {
    var p = parts[pNext]; pNext = (pNext + 1) % PMAX;
    p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.col = col; p.g = g == null ? 30 : g; p.kind = kind || 0;
    return p;
  }
  function burst(x, y, cols, n, spd, size) {
    for (var i = 0; i < n; i++) { var a = Math.random() * Math.PI * 2, s = spd * (0.3 + Math.random() * 0.7); part(x, y, Math.cos(a) * s, Math.sin(a) * s - spd * 0.4, 0.5 + Math.random() * 0.4, size * (0.6 + Math.random() * 0.6), cols[i % cols.length], 32); }
  }
  function hearts(x, y) { for (var i = 0; i < 4; i++) part(x + (Math.random() - 0.5) * 0.8, y, (Math.random() - 0.5) * 1.5, -2 - Math.random() * 1.5, 1.1, 1, '#ff5a8a', -1, 1); }
  var texts = [];
  function floatText(x, y, s, col, big, key, n) {
    if (key) {
      for (var i = texts.length - 1; i >= 0; i--) {
        var t = texts[i];
        if (t.key === key && t.life > 0.7) { t.n += n; t.s = plusN(t.n, s); t.life = 1.3; t.pop = 1; return; }
      }
    }
    if (texts.length > 24) texts.shift();
    texts.push({ x: x, y: y, s: key ? plusN(n, s) : s, col: col || '#fff', life: 1.3, max: 1.3, big: big, key: key, n: n || 0, pop: 1 });
  }
  var confetti = [];
  function confettiBurst() {
    var cols = ['#ffcc00', '#ff5a5f', '#3ddc84', '#4f7cff', '#ff8fc8', '#ffffff'];
    for (var i = 0; i < 90; i++) confetti.push({ x: VW / 2 + (Math.random() - 0.5) * 300, y: 120, vx: (Math.random() - 0.5) * 700, vy: -200 - Math.random() * 400, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, col: cols[i % cols.length], life: 2.5 + Math.random() });
    if (confetti.length > 240) confetti.splice(0, confetti.length - 240);
  }

  // -------------------------------------------------------------- physics
  function makeBody(x, y, w, h) { return { x: x, y: y, w: w, h: h, vx: 0, vy: 0, onGround: false, stepOff: 0 }; }
  function boxHits(x, y, w, h, animal) {
    var wd = G.world, x0 = Math.floor(x), x1 = Math.floor(x + w - 1e-6), y0 = Math.floor(y), y1 = Math.floor(y + h - 1e-6);
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
      if (tx < 0 || tx >= W || ty >= H) return true;
      if (ty < 0) continue;
      var d = BLOCKS[wd.tiles[ty * W + tx]];
      if (d.solid || (animal && d.animalSolid)) return true;
    }
    return false;
  }
  function moveX(e, dx, animal) {
    if (!dx) return false;
    var nx = e.x + dx;
    if (!boxHits(nx, e.y, e.w, e.h, animal)) { e.x = nx; return false; }
    if (e.onGround && !boxHits(nx, e.y - 1, e.w, e.h, animal) && !boxHits(e.x, e.y - 1, e.w, e.h, animal)) {
      // auto step-up onto a 1-block ledge
      var ny = Math.floor(e.y + e.h - 1e-6) - e.h; // snap feet to tile top first
      if (!boxHits(nx, ny, e.w, e.h, animal)) { e.stepOff += e.y - ny; e.y = ny; e.x = nx; return false; }
    }
    if (dx > 0) e.x = Math.floor(nx + e.w - 1e-6) - e.w; else e.x = Math.floor(nx) + 1;
    e.vx = 0;
    return true;
  }
  function moveY(e, dy, animal) {
    e.onGround = false;
    if (!dy) return false;
    var ny = e.y + dy;
    if (!boxHits(e.x, ny, e.w, e.h, animal)) { e.y = ny; return false; }
    if (dy > 0) { e.y = Math.floor(ny + e.h - 1e-6) - e.h; e.onGround = true; }
    else e.y = Math.floor(ny) + 1;
    return true;
  }
  function tileIn(e, id) {
    var x0 = Math.floor(e.x), x1 = Math.floor(e.x + e.w - 1e-6), y0 = Math.floor(e.y), y1 = Math.floor(e.y + e.h - 1e-6);
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) if (G.world.get(tx, ty) === id) return true;
    return false;
  }

  // --------------------------------------------------------------- player
  function makePlayer(x, y) {
    var p = makeBody(x, y, 0.7, 1.8);
    p.face = 1; p.coyote = 0; p.jumpBuf = 0; p.flying = false; p.climbing = false; p.inWater = false;
    p.walk = 0; p.walkAmt = 0; p.sx = 1; p.sy = 1; p.swing = 0; p.swingT = 0; p.lastSpace = -1; p.fallV = 0;
    p.blink = 0; p.blinkT = 2; p.stepPhase = 0;
    return p;
  }
  var GRAV = 46, JUMP_V = 14.4, MAX_FALL = 26, RUN = 6.8;
  // Creative flight: double tap Space. Measured on real key-press times so it also works when frames are slow.
  var flyTap = false, lastSpaceMs = -1e9;
  window.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' || e.repeat || G.mode !== 'play' || G.gm !== 'creative') return;
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (now - lastSpaceMs < 350) { flyTap = true; lastSpaceMs = -1e9; } else lastSpaceMs = now;
  });
  function updatePlayer(dt, controls) {
    var p = P;
    var L = controls && kd(LEFT), Rr = controls && kd(RIGHT), up = controls && kd(UP), jumpHeld = controls && kd(JUMP), down = controls && kd(DOWN);
    var mx = (Rr ? 1 : 0) - (L ? 1 : 0);
    // creative flight toggle (double tap Space)
    if (flyTap) {
      flyTap = false;
      if (controls && G.gm === 'creative') { p.flying = !p.flying; if (p.flying) { G.stats.flew = 1; floatText(p.x + p.w / 2, p.y - 0.3, 'أنت تطير!', '#bfe9ff'); SND.jump(); } }
    }
    if (controls && kp(JUMP)) p.jumpBuf = 0.13;
    p.jumpBuf -= dt;
    var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    var wasWater = p.inWater;
    p.inWater = G.world.get(Math.floor(cx), Math.floor(cy)) === B.WATER;
    var headWater = G.world.get(Math.floor(cx), Math.floor(p.y + 0.2)) === B.WATER;
    if (p.inWater && !wasWater && p.vy > 3) { SND.splash(); for (var i = 0; i < 10; i++) part(cx, p.y + p.h * 0.5, (Math.random() - 0.5) * 6, -4 - Math.random() * 4, 0.6, 0.18, '#bfe6ff', 25); }
    var onLadder = tileIn(p, B.LADDER);
    if (onLadder && (up || down) && !p.flying) p.climbing = true;
    if (!onLadder) p.climbing = false;
    var speed = RUN * (p.inWater ? 0.6 : 1) * (p.flying ? 1.45 : 1);
    var acc = p.onGround || p.flying ? 70 : 42;
    if (mx) { p.vx += mx * acc * dt; if (Math.abs(p.vx) > speed) p.vx = Math.sign(p.vx) * speed; p.face = mx; }
    else { var fr = (p.onGround || p.flying ? 60 : 18) * dt; p.vx = Math.abs(p.vx) <= fr ? 0 : p.vx - Math.sign(p.vx) * fr; }
    if (p.flying) {
      var ty = (jumpHeld ? -10 : 0) + (down ? 10 : 0);
      p.vy += (ty - p.vy) * Math.min(1, 10 * dt);
    } else if (p.climbing) {
      p.vy = up ? -5.5 : down ? 5.5 : 0;
      if (controls && kp(['Space'])) { p.climbing = false; p.vy = -JUMP_V * 0.8; }
    } else if (p.inWater) {
      p.vy += GRAV * 0.28 * dt;
      if (jumpHeld) p.vy = Math.max(p.vy - 40 * dt, -5.5);
      if (p.vy > 3.5) p.vy = 3.5;
      if (controls && kp(JUMP) && !headWater) { p.vy = -11; SND.splash(); }
      if (Math.random() < 0.05 && headWater) part(cx + p.face * 0.2, p.y + 0.3, 0, -1.5, 1, 0.14, 'rgba(220,245,255,0.8)', -2, 3);
    } else {
      p.coyote = p.onGround ? 0.1 : p.coyote - dt;
      if (p.jumpBuf > 0 && p.coyote > 0) {
        p.vy = -JUMP_V; p.jumpBuf = 0; p.coyote = 0; p.onGround = false;
        p.sx = 0.78; p.sy = 1.22; SND.jump();
        for (i = 0; i < 5; i++) part(cx, p.y + p.h, (Math.random() - 0.5) * 4, -Math.random() * 2, 0.4, 0.14, 'rgba(230,220,200,0.8)', 10);
      }
      var g = GRAV;
      if (p.vy < 0 && !jumpHeld) g *= 2.3;
      p.vy = Math.min(MAX_FALL, p.vy + g * dt);
    }
    var before = p.vy;
    moveX(p, p.vx * dt, false);
    var hitY = moveY(p, p.vy * dt, false);
    if (hitY) {
      if (before > 0) {
        if (before > 12 && !p.flying) {
          var v = Math.min(1, before / 26);
          p.sx = 1 + 0.35 * v; p.sy = 1 - 0.35 * v; SND.land(v);
          if (before > 19) shake.add(3 + v * 4);
          var mat = BLOCKS[G.world.get(Math.floor(cx), Math.floor(p.y + p.h + 0.05))].mat;
          var col = BLOCKS[G.world.get(Math.floor(cx), Math.floor(p.y + p.h + 0.05))].cols[0];
          for (i = 0; i < 6 + v * 8; i++) part(cx + (Math.random() - 0.5) * 0.6, p.y + p.h, (Math.random() - 0.5) * 7, -Math.random() * 3, 0.45, 0.16, col, 18);
          if (mat) SND.step(mat);
        }
        if (p.flying) p.flying = false;
      }
      p.vy = 0;
    }
    if (p.y < -6) { p.y = -6; p.vy = 0; }
    // anim
    p.sx += (1 - p.sx) * Math.min(1, 12 * dt); p.sy += (1 - p.sy) * Math.min(1, 12 * dt);
    p.stepOff *= Math.pow(0.0001, dt); if (Math.abs(p.stepOff) < 0.01) p.stepOff = 0;
    var moving = Math.abs(p.vx) > 0.4 && (p.onGround || p.climbing);
    p.walkAmt += ((moving ? 1 : 0) - p.walkAmt) * Math.min(1, 10 * dt);
    if (moving || p.climbing && p.vy) {
      var prevPhase = Math.floor(p.walk / Math.PI);
      p.walk += Math.max(Math.abs(p.vx), p.climbing ? Math.abs(p.vy) : 0) * dt * 2.3;
      if (Math.floor(p.walk / Math.PI) !== prevPhase) {
        var under = BLOCKS[G.world.get(Math.floor(cx), Math.floor(p.y + p.h + 0.05))];
        if (p.onGround && under && under.mat) { SND.step(under.mat); if (Math.random() < 0.6) part(cx - p.face * 0.2, p.y + p.h, -p.face * 1.5, -1, 0.35, 0.12, under.cols[under.cols.length - 1], 8); }
        else if (p.climbing) SND.step('wood');
      }
    }
    p.blinkT -= dt; if (p.blinkT < 0) { p.blink = 0.12; p.blinkT = 2 + Math.random() * 3; }
    if (p.blink > 0) p.blink -= dt;
    p.swingT = Math.max(0, p.swingT - dt);
  }

  // -------------------------------------------------------------- animals
  var ANIMAL_SIZE = { pig: [0.9, 0.95], sheep: [0.95, 1.05], chicken: [0.55, 0.85] };
  function makeAnimal(type, x, y) {
    var s = ANIMAL_SIZE[type], a = makeBody(x - s[0] / 2, y - s[1], s[0], s[1]);
    a.type = type; a.dir = 0; a.face = Math.random() < 0.5 ? -1 : 1; a.timer = Math.random() * 3; a.walk = 0; a.walkAmt = 0;
    a.sheared = false; a.regrow = 0; a.blink = 0; a.blinkT = Math.random() * 3; a.headDown = false; a.petCD = 0; a.sayT = 3 + Math.random() * 10;
    return a;
  }
  function surfaceY(x) { var t = G.world.tiles; for (var y = 0; y < H; y++) { var d = BLOCKS[t[y * W + x]]; if (d.solid || d.liquid) return y; } return H - 1; }
  function spawnAnimals(rnd) {
    var list = [], wd = G.world;
    function tryAt(x, type) {
      x = Math.floor(x); var y = surfaceY(x), id = wd.get(x, y);
      if (id !== B.GRASS && id !== B.SNOW_GRASS) return false;
      list.push(makeAnimal(type, x + 0.5, y)); return true;
    }
    tryAt(G.spawn.x + 6, 'pig') || tryAt(G.spawn.x + 7, 'pig');
    tryAt(G.spawn.x - 7, 'sheep') || tryAt(G.spawn.x - 8, 'sheep');
    tryAt(G.spawn.x + 11, 'chicken') || tryAt(G.spawn.x + 12, 'chicken');
    for (var i = 0; i < 70 && list.length < 42; i++) {
      var x = 45 + rnd() * (W - 90), bio = wd.biomeAt(x);
      if (bio === 'desert' || bio === 'ocean' || bio === 'beach') continue;
      var r = rnd(), type = bio === 'snow' ? 'sheep' : r < 0.36 ? 'pig' : r < 0.7 ? 'sheep' : 'chicken';
      tryAt(x, type);
      if (rnd() < 0.5) tryAt(x + 2, type);
    }
    return list;
  }
  function updateAnimal(a, dt) {
    a.timer -= dt;
    if (a.timer <= 0) {
      var r = Math.random();
      a.dir = r < 0.45 ? 0 : r < 0.72 ? -1 : 1; a.timer = 1.5 + Math.random() * 3;
      a.headDown = a.dir === 0 && a.type !== 'chicken' ? Math.random() < 0.5 : (a.type === 'chicken' && a.dir === 0 && Math.random() < 0.6);
      if (a.dir) a.face = a.dir;
    }
    var spd = a.type === 'chicken' ? 1.9 : a.type === 'pig' ? 1.6 : 1.3;
    var inWater = G.world.get(Math.floor(a.x + a.w / 2), Math.floor(a.y + a.h * 0.6)) === B.WATER;
    if (a.dir && a.onGround) {
      var ax = Math.floor(a.x + a.w / 2 + a.dir * (a.w / 2 + 0.35)), fy = Math.floor(a.y + a.h + 0.1);
      var drop = !G.world.solid(ax, fy) && !G.world.solid(ax, fy + 1) && !G.world.solid(ax, fy + 2);
      var water = G.world.get(ax, fy) === B.WATER || G.world.get(ax, fy - 1) === B.WATER;
      if (drop || water) { a.dir = -a.dir; a.face = a.dir; }
    }
    a.vx = a.dir * spd;
    if (inWater) a.vy = Math.max(a.vy - 30 * dt, -2.5);
    else a.vy = Math.min(a.type === 'chicken' ? 4 : MAX_FALL, a.vy + GRAV * dt);
    if (moveX(a, a.vx * dt, true)) { a.dir = -a.dir; a.face = a.dir || a.face; }
    if (moveY(a, a.vy * dt, true)) a.vy = 0;
    a.stepOff *= Math.pow(0.0001, dt);
    a.walkAmt += ((a.dir && a.onGround ? 1 : 0) - a.walkAmt) * Math.min(1, 10 * dt);
    a.walk += Math.abs(a.vx) * dt * 5;
    a.blinkT -= dt; if (a.blinkT < 0) { a.blink = 0.15; a.blinkT = 2 + Math.random() * 4; } if (a.blink > 0) a.blink -= dt;
    a.petCD -= dt;
    if (a.sheared) { a.regrow -= dt; if (a.regrow <= 0) a.sheared = false; }
    a.sayT -= dt;
    if (a.sayT <= 0) {
      a.sayT = 8 + Math.random() * 14;
      var d = Math.abs(a.x - P.x);
      if (G.mode === 'play' && d < 14) { var v = A.master; if (v) { if (a.type === 'pig') SND.oink(); else if (a.type === 'sheep') SND.baa(); else SND.cluck(); } }
    }
  }
  function animalAt(wx, wy) {
    for (var i = 0; i < G.animals.length; i++) {
      var a = G.animals[i];
      if (wx >= a.x - 0.15 && wx <= a.x + a.w + 0.15 && wy >= a.y - 0.3 && wy <= a.y + a.h + 0.05) return a;
    }
    return null;
  }
  function petAnimal(a) {
    if (a.type === 'sheep' && !a.sheared) {
      a.sheared = true; a.regrow = 70;
      SND.snip();
      var n = 1 + Math.floor(Math.random() * 2);
      for (var i = 0; i < n; i++) spawnItem(a.x + a.w / 2, a.y + 0.3, B.WOOL, 1, (Math.random() - 0.5) * 4, -6);
      burst(a.x + a.w / 2, a.y + 0.4, ['#ffffff', '#e8ecf4'], 12, 5, 0.2);
      G.stats.sheared++;
      floatText(a.x + a.w / 2, a.y - 0.4, 'قص قص! صوف', '#ffffff');
    }
    if (a.type === 'pig') SND.oink(); else if (a.type === 'sheep') SND.baa(); else SND.cluck();
    hearts(a.x + a.w / 2, a.y);
    if (a.onGround) a.vy = -7;
    if (a.petCD <= 0) { G.stats.pets++; a.petCD = 2; }
    a.face = P.x < a.x ? -1 : 1;
  }

  // ---------------------------------------------------------------- items
  function spawnItem(x, y, id, n, vx, vy) {
    if (!id || !ITEMS[id]) return;
    if (G.items.length > 220) G.items.shift();
    G.items.push({ id: id, n: n || 1, x: x, y: y, vx: vx == null ? (Math.random() - 0.5) * 3 : vx, vy: vy == null ? -5 - Math.random() * 2 : vy, age: 0, delay: 0.3, bob: Math.random() * 6 });
  }
  var pickCombo = 0, pickComboT = 0;
  function updateItems(dt) {
    var pcx = P.x + P.w / 2, pcy = P.y + P.h / 2;
    for (var i = G.items.length - 1; i >= 0; i--) {
      var it = G.items[i];
      it.age += dt; it.delay -= dt;
      var dx = pcx - it.x, dy = pcy - it.y, d = Math.sqrt(dx * dx + dy * dy);
      if (it.delay <= 0 && d < 3.4 && canAccept(it.id)) {
        var f = 70 / Math.max(0.5, d);
        it.vx += dx / d * f * dt; it.vy += dy / d * f * dt;
        it.vx *= 0.9; it.vy *= 0.9;
        it.x += it.vx * dt; it.y += it.vy * dt;
        if (d < 0.6) {
          var left = addItem(it.id, it.n), got = it.n - left;
          if (got > 0) {
            G.stats.got[it.id] = (G.stats.got[it.id] || 0) + got;
            pickCombo = pickComboT > 0 ? pickCombo + 1 : 0; pickComboT = 0.6;
            SND.pickup(pickCombo);
            floatText(pcx, P.y - 0.2, BW.itemName(it.id), '#fff', false, 'pk' + it.id, got);
            part(it.x, it.y, 0, -1, 0.3, 0.3, '#ffffff', 0, 2);
          }
          if (left > 0) it.n = left; else G.items.splice(i, 1);
        }
        continue;
      }
      it.vy = Math.min(20, it.vy + 30 * dt);
      var nx = it.x + it.vx * dt, ny = it.y + it.vy * dt;
      if (G.world.solid(Math.floor(nx), Math.floor(it.y))) it.vx = -it.vx * 0.3; else it.x = nx;
      if (G.world.solid(Math.floor(it.x), Math.floor(ny + 0.25))) { if (it.vy > 0) { it.y = Math.floor(ny + 0.25) - 0.25; } it.vy = 0; it.vx *= 0.8; }
      else it.y = ny;
      if (G.world.get(Math.floor(it.x), Math.floor(it.y)) === B.WATER) { it.vy = Math.min(it.vy, 1); }
      if (it.age > 300 || it.y > H + 2) G.items.splice(i, 1);
    }
    pickComboT -= dt;
  }

  // --------------------------------------------------------- mine / place
  var mine = { x: -1, y: -1, prog: 0, sndT: 0, hintT: 0, block: false };
  var placeCD = 0;
  function reach() { return G.gm === 'creative' ? 9 : 5.5; }
  function hasAttach(x, y) {
    var wd = G.world;
    return wd.solid(x, y + 1) || wd.solid(x - 1, y) || wd.solid(x + 1, y) || wd.solid(x, y - 1) || wd.wall(x, y) > 0;
  }
  function hasNeighbor(x, y) {
    var wd = G.world;
    if (wd.wall(x, y)) return true;
    var n = [wd.get(x + 1, y), wd.get(x - 1, y), wd.get(x, y + 1), wd.get(x, y - 1)];
    for (var i = 0; i < 4; i++) if (n[i] && n[i] !== B.WATER) return true;
    return y >= H - 1;
  }
  function dropsFor(id) {
    var d = BLOCKS[id];
    if (id === B.LEAVES || id === B.PINE_LEAVES) { var r = Math.random(); return r < 0.12 ? [B.SAPLING] : r < 0.22 ? [I.STICK] : []; }
    if (id === B.TALLGRASS) return [];
    return d.drop ? [d.drop] : [];
  }
  function breakBlock(x, y, fx) {
    var wd = G.world, id = wd.get(x, y), d = BLOCKS[id];
    if (!id || d.liquid) return;
    var surv = G.gm === 'survival';
    if (id === B.TRUNK) { fellTree(x, y); return; }
    if (id === B.DOOR_T) { if (wd.get(x, y + 1) === B.DOOR_B) { breakBlock(x, y + 1, fx); return; } }
    wd.set(x, y, 0);
    if (id === B.DOOR_B && wd.get(x, y - 1) === B.DOOR_T) wd.set(x, y - 1, 0);
    G.stats.mined[id] = (G.stats.mined[id] || 0) + 1;
    if (surv) dropsFor(id).forEach(function (did) { spawnItem(x + 0.5, y + 0.5, did, 1); });
    if (fx !== false) {
      burst(x + 0.5, y + 0.5, d.cols, 12, 7, 0.22);
      SND.brk(d.mat);
      shake.add(d.mat === 'stone' || d.mat === 'metal' ? 2.2 : 1.4);
    }
    // things resting on / attached to it
    var above = wd.get(x, y - 1);
    if (above && BLOCKS[above].support) breakBlock(x, y - 1, true);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) {
      var nx = x + o[0], ny = y + o[1], nid = wd.get(nx, ny);
      if (nid && BLOCKS[nid].attach && !hasAttach(nx, ny)) breakBlock(nx, ny, true);
    });
  }
  function fellTree(x, y) {
    var wd = G.world, logs = 0, top = y, surv = G.gm === 'survival';
    // trunk tiles from here up
    var trunk = [];
    for (var ty = y; ty >= 0 && wd.get(x, ty) === B.TRUNK; ty--) { trunk.push(ty); top = ty; }
    // leaves connected near the crown
    var leaves = [], seen = {};
    var stack = [];
    for (var k = 0; k < trunk.length; k++) stack.push([x, trunk[k]]);
    while (stack.length && leaves.length < 80) {
      var c = stack.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) {
        var nx = c[0] + o[0], ny = c[1] + o[1], key = nx + ',' + ny;
        if (seen[key] || Math.abs(nx - x) > 4 || ny > y || ny < top - 5) return;
        seen[key] = 1;
        var id = wd.get(nx, ny);
        if (id === B.LEAVES || id === B.PINE_LEAVES) { leaves.push([nx, ny, id]); stack.push([nx, ny]); }
      });
    }
    trunk.forEach(function (ty, i) {
      wd.set(x, ty, 0, true); logs++;
      burst(x + 0.5, ty + 0.5, BLOCKS[B.TRUNK].cols, 5, 6, 0.22);
    });
    var saplings = 0;
    leaves.forEach(function (l) {
      wd.set(l[0], l[1], 0, true);
      if (Math.random() < 0.4) burst(l[0] + 0.5, l[1] + 0.5, BLOCKS[l[2]].cols, 3, 4, 0.2);
      if (surv) { var r = Math.random(); if (r < 0.09 && saplings < 3) { spawnItem(l[0] + 0.5, l[1] + 0.5, B.SAPLING, 1); saplings++; } else if (r < 0.14) spawnItem(l[0] + 0.5, l[1] + 0.5, I.STICK, 1); }
    });
    if (surv && saplings === 0) spawnItem(x + 0.5, top + 0.5, B.SAPLING, 1);
    wd.relight(x - 20, x + 20);
    if (surv) for (var i = 0; i < logs; i++) spawnItem(x + 0.5, trunk[i] + 0.5, B.LOG, 1, (Math.random() - 0.5) * 3, -4 - Math.random() * 3);
    G.stats.mined[B.TRUNK] = (G.stats.mined[B.TRUNK] || 0) + logs;
    SND.timber(); shake.add(5);
    if (logs > 1) floatText(x + 0.5, top - 0.5, 'سقطت الشجرة!', '#ffd23a', true);
  }
  function placeBlock(slotIdx, tx, ty) {
    var wd = G.world, s = G.inv[slotIdx];
    if (!s) return false;
    var it = ITEMS[s.id];
    if (!it || !it.place) return false;
    var bid = it.place, bd = BLOCKS[bid], cur = wd.get(tx, ty);
    if (tx < 0 || tx >= W || ty < 1 || ty >= H) return false;
    if (!BLOCKS[cur].replace) return false;
    if (bd.solid) {
      if (boxOverlap(P, tx, ty)) return false;
      for (var i = 0; i < G.animals.length; i++) if (boxOverlap(G.animals[i], tx, ty)) return false;
    }
    if (bid === B.DOOR_B) {
      if (!BLOCKS[wd.get(tx, ty - 1)].replace || !wd.solid(tx, ty + 1)) { tip('الباب يحتاج مكانين فارغين فوق الأرض'); return false; }
    }
    if (bd.support && !wd.solid(tx, ty + 1)) { tip('ضع ' + bd.name + ' فوق أرض صلبة'); return false; }
    if (bid === B.SAPLING) { var below = wd.get(tx, ty + 1); if (below !== B.GRASS && below !== B.DIRT && below !== B.SNOW_GRASS) { tip('ازرع الشتلات على العشب أو التراب'); return false; } }
    if (bd.attach && !hasAttach(tx, ty)) return false;
    if (G.gm === 'survival' && !hasNeighbor(tx, ty)) return false;
    wd.set(tx, ty, bid);
    if (bid === B.DOOR_B) wd.set(tx, ty - 1, B.DOOR_T);
    if (G.gm === 'survival') { s.n--; if (s.n <= 0) G.inv[slotIdx] = null; invDirty = true; }
    G.stats.placed[bid] = (G.stats.placed[bid] || 0) + 1;
    G.stats.placedTotal++;
    if (ty < G.stats.highestPlace) G.stats.highestPlace = ty;
    if (bid === B.SAPLING) G.saplings.push({ x: tx, y: ty, t: 25 + Math.random() * 35 });
    SND.place(bd.mat);
    for (var k = 0; k < 6; k++) part(tx + Math.random(), ty + 1, (Math.random() - 0.5) * 3, -Math.random() * 2, 0.35, 0.14, 'rgba(255,255,255,0.7)', 5);
    placePop = { x: tx, y: ty, t: 0.18 };
    P.swingT = 0.2;
    return true;
  }
  var placePop = null;
  function boxOverlap(e, tx, ty) { return e.x < tx + 1 && e.x + e.w > tx && e.y < ty + 1 && e.y + e.h > ty; }
  function tip(s) { G.hint = { s: s, t: 2.2 }; }

  function updateHands(dt) {
    var wx = G.cam.x + M.x / TS, wy = G.cam.y + M.y / TS;
    var tx = Math.floor(wx), ty = Math.floor(wy);
    var pcx = P.x + P.w / 2, pcy = P.y + 0.6;
    var dist = Math.sqrt((tx + 0.5 - pcx) * (tx + 0.5 - pcx) + (ty + 0.5 - pcy) * (ty + 0.5 - pcy));
    var inReach = dist <= reach();
    G.hover = { x: tx, y: ty, ok: inReach };
    var hb = hotbarHit(M.x, M.y);
    if (M.lp && hb >= 0) { G.sel = hb; selChanged(); mine.block = true; }
    if (!M.left) mine.block = false;
    // animals
    if ((M.lp || M.rp) && hb < 0) {
      var an = animalAt(wx, wy);
      if (an && Math.abs(an.x + an.w / 2 - pcx) < reach() + 1) { petAnimal(an); mine.block = true; P.swingT = 0.25; P.face = wx < pcx ? -1 : 1; M.lp = M.rp = false; return; }
    }
    // mining
    if (M.left && !mine.block && hb < 0) {
      P.face = wx < pcx ? -1 : 1;
      var id = G.world.get(tx, ty), d = BLOCKS[id];
      if (inReach && id && !d.liquid && d.hard !== Infinity) {
        var pk = bestPick();
        if (d.tier > pk.tool) {
          mine.prog = 0;
          if (mine.hintT <= 0) { var deep = P.y + P.h > G.world.surf[clamp(Math.floor(P.x), 0, W - 1)] + 4 && pk.tool === 0; tip('تحتاج إلى ' + PICK_FOR_TIER[Math.min(3, d.tier)] + ' لتحفر ' + d.name + '!' + (deep ? ' عالق؟ اضغط P ثم «العودة للبداية»' : '')); SND.bonk(); mine.hintT = 1.2; shake.add(1); burst(tx + 0.5, ty + 0.5, ['#ffffff'], 3, 3, 0.12); }
        } else {
          if (mine.x !== tx || mine.y !== ty) { mine.x = tx; mine.y = ty; mine.prog = 0; mine.sndT = 0; }
          var spd = d.tier === 0 && pk.tool > 0 ? 1 + (pk.speed - 1) * 0.6 : pk.speed;
          var tNeed = G.gm === 'creative' ? 0.12 : Math.max(0.08, d.hard / spd);
          mine.prog += dt / tNeed;
          P.swingT = 0.15;
          mine.sndT -= dt;
          if (mine.sndT <= 0) { mine.sndT = 0.2; SND.mat(d.mat, 0.8); for (var k = 0; k < 3; k++) part(tx + 0.5 + (Math.random() - 0.5) * 0.8, ty + 0.5 + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 5, -Math.random() * 4, 0.35, 0.14, d.cols[k % d.cols.length], 30); }
          if (mine.prog >= 1) { breakBlock(tx, ty); mine.prog = 0; mine.x = -1; }
        }
      } else { mine.prog = 0; mine.x = -1; }
    } else { mine.prog = Math.max(0, mine.prog - dt * 2); if (mine.prog === 0) mine.x = -1; }
    mine.hintT -= dt;
    // placing / using
    placeCD -= dt;
    if (M.right && hb < 0) {
      var tid = G.world.get(tx, ty);
      if (M.rp && inReach && (tid === B.TABLE || tid === B.FURNACE)) { openInv(); M.right = false; return; }
      if (inReach && (M.rp || placeCD <= 0)) {
        P.face = wx < pcx ? -1 : 1;
        var ok = placeBlock(G.sel, tx, ty);
        placeCD = M.rp ? 0.28 : 0.13;
        if (!ok && M.rp) { var s = G.inv[G.sel]; if (s && ITEMS[s.id] && !ITEMS[s.id].place) tip(ITEMS[s.id].tool ? 'المعول يعمل وحده - اضغط مطوّلًا بالزر الأيسر لتحفر!' : 'لا يمكنك وضع ' + ITEMS[s.id].name + ' - استعمله في الصنع (E)'); }
      }
    }
    if (M.wheel) { G.sel = (G.sel + (M.wheel > 0 ? 1 : -1) + 9) % 9; M.wheel = 0; selChanged(); }
    for (var n = 1; n <= 9; n++) if (K.pressed('Digit' + n) || K.pressed('Numpad' + n)) { G.sel = n - 1; selChanged(); }
  }
  function selChanged() { G.selPop = 1; G.selName = 1.8; SND.click(); }

  // --------------------------------------------------------------- quests
  function checkQuests() {
    var qs = questsFor(G.gm), s = G.stats;
    for (var i = 0; i < qs.length; i++) {
      var q = qs[i];
      if (G.done[q.id]) continue;
      if (q.val(s) >= q.need) completeQuest(q);
    }
  }
  function starCount() { var n = 0; for (var k in G.done) if (G.done[k]) n++; return n; }
  function completeQuest(q) {
    G.done[q.id] = true;
    var before = meta.totalStars;
    meta.totalStars++;
    saveMeta();
    G.toasts.push({ title: 'أنجزت المهمة!', text: q.text, icon: q.icon, t: 0, dur: 3.4 });
    SND.quest(); confettiBurst();
    BW.SKINS.forEach(function (sk, i) {
      if (sk.stars > before && sk.stars <= meta.totalStars) G.toasts.push({ title: 'زيّ جديد: ' + sk.name + '!', text: 'اختره من الشاشة الرئيسية', icon: 0, skin: i, t: 0, dur: 3.4 });
    });
    if (starCount() >= questsFor(G.gm).length && !G.masterShown) { G.masterShown = true; setTimeout(showMaster, 2600); }
  }

  // --------------------------------------------------------- world setup
  var rend = null;
  function startWorld(world) {
    G.world = world;
    if (!rend) { rend = new BW.Renderer(world); rend.doorOpen = function (x, y) { return !!G.openDoors[x + ',' + y]; }; }
    else rend.setWorld(world);
    G.items = []; G.openDoors = {}; guide = null;
    for (var i = 0; i < PMAX; i++) parts[i].on = false;
    texts.length = 0;
  }
  function spawnPoint() { var x = G.spawn.x; var y = surfaceY(x); return { x: x + 0.15, y: y - 1.8 - 0.01 }; }
  function newGame(slot, gm) {
    var seed = (Math.random() * 1e9) >>> 0;
    var world = new BW.World(seed);
    world.generate();
    G.slot = slot; G.gm = gm; G.name = worldName(seed);
    startWorld(world);
    G.spawn = { x: 250, y: 0 };
    var sp = spawnPoint();
    P = makePlayer(sp.x, sp.y);
    G.inv = emptyInv(); G.sel = 0; G.cursor = null;
    G.stats = newStats(); G.done = {}; G.tod = 0.08; G.play = 0; G.saplings = []; G.masterShown = false;
    G.animals = spawnAnimals(BW.mulberry(seed + 5));
    if (gm === 'creative') {
      [B.PLANKS, B.BRICKS, B.GLASS, B.STONE_BRICKS, B.WOOL + 1, B.WOOL + 3, B.WOOL + 7, B.LANTERN, I.DOOR].forEach(function (id, i) { G.inv[i] = { id: id, n: BW.maxStack(id) }; });
    }
    G.lastBiome = ''; G.lastZone = '';
    enterPlay();
    G.toasts.push({ title: gm === 'creative' ? 'عالم الإبداع!' : 'أهلًا بك في ' + G.name + '!', text: gm === 'creative' ? 'كل المكعبات لك! اضغط مسافة مرتين لتطير' : 'ابدأ بقطع شجرة: اضغط عليها مطوّلًا بالفأرة!', icon: gm === 'creative' ? B.WOOL + 4 : B.LOG, t: 0, dur: 4.5, soft: true });
    saveGame();
  }
  function loadGame(slot) {
    var data = store.get('slot' + slot, null);
    if (!data || !data.world) return false;
    var world;
    try { world = BW.World.load(data.world); } catch (e) { return false; }
    G.slot = slot; G.gm = data.gm || 'survival'; G.name = fixName(data.name || 'عالمي');
    startWorld(world);
    G.spawn = data.spawn || { x: 250, y: 0 };
    P = makePlayer(data.p ? data.p.x : 250, data.p ? data.p.y : 40);
    if (boxHits(P.x, P.y, P.w, P.h, false)) { var sp = spawnPoint(); P.x = sp.x; P.y = sp.y; }
    G.inv = emptyInv();
    (data.inv || []).forEach(function (s, i) { if (s && ITEMS[s.id] && i < 36) G.inv[i] = { id: s.id, n: s.n }; });
    G.sel = data.sel || 0; G.cursor = null;
    G.stats = Object.assign(newStats(), data.stats || {});
    G.done = data.done || {}; G.tod = data.tod || 0.1; G.play = data.play || 0;
    G.saplings = data.saplings || []; G.masterShown = !!data.master;
    G.animals = (data.animals || []).map(function (o) { var a = makeAnimal(o.t, o.x, o.y); a.sheared = !!o.s; a.regrow = o.s ? 40 : 0; return a; });
    G.lastBiome = ''; G.lastZone = '';
    enterPlay();
    G.toasts.push({ title: 'أهلًا بعودتك!', text: G.name + ' - ★ ' + ltr(starCount() + ' / ' + questsFor(G.gm).length), icon: G.gm === 'creative' ? B.WOOL + 4 : I.PICK_WOOD, t: 0, dur: 3, soft: true });
    return true;
  }
  function saveGame() {
    if (!G.slot || !G.world || !P) return;
    // A stack held on the mouse cursor (backpack open) is saved as if it were back in the bag,
    // without disturbing the drag that is in progress.
    var invSave = G.inv.map(function (s) { return s ? { id: s.id, n: s.n } : null; });
    if (G.cursor) {
      var cn = G.cursor.n, cmx = BW.maxStack(G.cursor.id), ci;
      for (ci = 0; ci < 36 && cn > 0; ci++) { var cs = invSave[ci]; if (cs && cs.id === G.cursor.id && cs.n < cmx) { var ck = Math.min(cn, cmx - cs.n); cs.n += ck; cn -= ck; } }
      for (ci = 0; ci < 36 && cn > 0; ci++) if (!invSave[ci]) { invSave[ci] = { id: G.cursor.id, n: cn }; cn = 0; }
    }
    var data = {
      v: 1, gm: G.gm, name: G.name, world: G.world.serialize(), spawn: G.spawn,
      p: { x: +P.x.toFixed(2), y: +P.y.toFixed(2) },
      inv: invSave,
      sel: G.sel, stats: G.stats, done: G.done, tod: +G.tod.toFixed(4), play: Math.round(G.play),
      saplings: G.saplings, master: G.masterShown,
      animals: G.animals.map(function (a) { return { t: a.type, x: +(a.x + a.w / 2).toFixed(2), y: +(a.y + a.h).toFixed(2), s: a.sheared ? 1 : 0 }; })
    };
    store.set('slot' + G.slot, data);
    meta.slots[G.slot - 1] = { name: G.name, gm: G.gm, stars: starCount(), max: questsFor(G.gm).length, play: Math.round(G.play), last: Date.now() };
    meta.lastSlot = G.slot;
    saveMeta();
    G.savedFlash = 1.6;
  }
  // World names: "<place> <thing>" e.g. وادي الشمس (Sunny Valley).
  var ADJ = ['الشمس', 'الطحالب', 'البريق', 'الدفء', 'النسيم', 'القيقب', 'الحصى', 'قوس قزح', 'الضباب', 'العسل', 'البرسيم', 'النجوم', 'القفز', 'النعناع'];
  var NOUN = ['وادي', 'تلال', 'جزيرة', 'مرج', 'كهف', 'قمم', 'بستان', 'خليج', 'مملكة', 'أرض', 'سهول', 'غابة'];
  var ADJ_EN = ['Sunny', 'Mossy', 'Sparkle', 'Cozy', 'Breezy', 'Maple', 'Pebble', 'Rainbow', 'Misty', 'Honey', 'Clover', 'Starry', 'Bouncy', 'Minty'];
  var NOUN_EN = ['Valley', 'Hills', 'Island', 'Meadow', 'Hollow', 'Peaks', 'Grove', 'Cove', 'Kingdom', 'Land', 'Canyon', 'Woods'];
  function worldName(seed) { return NOUN[Math.floor(seed / 7) % NOUN.length] + ' ' + ADJ[seed % ADJ.length]; }
  // Worlds saved before the Arabic switch had English names: translate them.
  function fixName(n) {
    n = String(n || '');
    if (n === 'My World') return 'عالمي';
    var p = n.split(' '), a = ADJ_EN.indexOf(p[0]), b = NOUN_EN.indexOf(p[1]);
    return p.length === 2 && a >= 0 && b >= 0 ? NOUN[b] + ' ' + ADJ[a] : n;
  }

  // ------------------------------------------------------------- env/tick
  var DAY_LEN = 420;
  function updateWorldSim(dt) {
    var wd = G.world;
    G.tod = (G.tod + dt / DAY_LEN) % 1;
    wtick = (wtick + 1) % 5;
    if (wtick === 0) wd.stepWater(Math.random);
    // saplings
    for (var i = G.saplings.length - 1; i >= 0; i--) {
      var s = G.saplings[i];
      if (wd.get(s.x, s.y) !== B.SAPLING) { G.saplings.splice(i, 1); continue; }
      s.t -= dt;
      if (s.t <= 0) {
        var rnd = BW.mulberry((s.x * 31 + s.y * 17 + (G.time * 1000 | 0)) >>> 0);
        var snow = wd.biomeAt(s.x) === 'snow';
        wd.tiles[s.y * W + s.x] = 0;
        if (snow) wd.pineTree(s.x, s.y, rnd); else wd.oakTree(s.x, s.y, rnd);
        wd.relight(s.x - 20, s.x + 20);
        for (var yy = s.y - 10; yy <= s.y; yy += 4) for (var xx = s.x - 4; xx <= s.x + 4; xx += 4) rend.markTile(Math.max(0, Math.min(W - 1, xx)), Math.max(0, yy));
        rend.markTile(s.x, s.y);
        burst(s.x + 0.5, s.y - 2, ['#8ae060', '#ffffff', '#ffd93d'], 16, 5, 0.18);
        if (Math.abs(s.x - P.x) < 25) SND.grow();
        G.saplings.splice(i, 1);
      }
    }
  }
  var wtick = 0;
  function updateDoors() {
    var now = {}, changed = false, x0 = Math.floor(P.x), x1 = Math.floor(P.x + P.w - 1e-6), y0 = Math.floor(P.y), y1 = Math.floor(P.y + P.h - 1e-6);
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
      var id = G.world.get(tx, ty);
      if (id === B.DOOR_B) now[tx + ',' + ty] = 1;
      else if (id === B.DOOR_T) now[tx + ',' + (ty + 1)] = 1;
    }
    var k;
    for (k in now) if (!G.openDoors[k]) { changed = true; markDoor(k); }
    for (k in G.openDoors) if (!now[k]) { changed = true; markDoor(k); }
    if (changed) SND.door();
    G.openDoors = now;
  }
  function markDoor(k) { var p = k.split(','); rend.markTile(+p[0], +p[1]); rend.markTile(+p[0], +p[1] - 1); }
  var ZONES = [[0, ''], [1, 'Underground'], [100, 'Deep Caves'], [124, 'Diamond Depths']];
  var ZONE_LABEL = { Underground: 'تحت الأرض', 'Deep Caves': 'الكهوف العميقة', 'Diamond Depths': 'أعماق الألماس' };
  function updateExplore() {
    var cx = Math.floor(P.x + P.w / 2), feet = P.y + P.h;
    var bio = G.world.biomeAt(cx), surf = G.world.surf[clamp(cx, 0, W - 1)];
    if (feet > G.stats.maxDepth) G.stats.maxDepth = Math.floor(feet);
    var zone = '';
    if (feet > surf + 14) { zone = 'Underground'; if (feet > 100) zone = 'Deep Caves'; if (feet > 124) zone = 'Diamond Depths'; }
    if (!zone) {
      var key = bio === 'ocean' ? 'beach' : bio;
      G.stats.biomes[key] = 1;
      if (key !== G.lastBiome) { if (G.lastBiome) G.banner = { s: BW.BIOME_LABEL[key], t: 3 }; G.lastBiome = key; }
    }
    if (zone !== G.lastZone) { if (zone && (G.lastZone === '' || ZONES.map(function (z) { return z[1]; }).indexOf(zone) > ZONES.map(function (z) { return z[1]; }).indexOf(G.lastZone))) G.banner = { s: ZONE_LABEL[zone], t: 3 }; G.lastZone = zone; if (!zone) G.lastBiome = ''; }
  }
  function nearStations() {
    var t = false, f = false, cx = Math.floor(P.x + P.w / 2), cy = Math.floor(P.y + 1);
    if (G.gm === 'creative') { G.nearTable = G.nearFurnace = true; return; }
    for (var y = cy - 4; y <= cy + 4; y++) for (var x = cx - 5; x <= cx + 5; x++) { var id = G.world.get(x, y); if (id === B.TABLE) t = true; else if (id === B.FURNACE) f = true; }
    G.nearTable = t; G.nearFurnace = f;
  }

  // ----------------------------------------------------------------- loop
  var budget = { n: 3 };
  function update(dt) {
    G.time += dt;
    updateMusic(dt);
    if (G.mode === 'title') {
      G.titleT += dt;
      G.tod = (0.3 + G.titleT / 70) % 1;
      var tx = 110 + (Math.sin(G.titleT * 0.02) * 0.5 + 0.5) * 260;
      G.cam.x += (tx - G.cam.x) * Math.min(1, dt * 0.5);
      var sy = G.world.surf[clamp(Math.floor(G.cam.x + VTW / 2), 0, W - 1)];
      G.cam.y += (sy - 13 - G.cam.y) * Math.min(1, dt * 0.6);
      for (var i = 0; i < G.animals.length; i++) { var a = G.animals[i]; if (Math.abs(a.x - G.cam.x - VTW / 2) < 40) updateAnimal(a, dt); }
      if (kp(['Enter', 'Space']) && !titleBusy) titlePlay();
      K.endFrame(); M.lp = M.rp = false; M.wheel = 0;
      return;
    }
    if (G.mode === 'play' || G.mode === 'inv') {
      var controls = G.mode === 'play';
      if (controls && kp(['KeyP', 'Escape'])) { pause(); K.endFrame(); return; }
      if (kp(['KeyE'])) { if (G.mode === 'inv') closeInv(); else openInv(); }
      else if (G.mode === 'inv' && kp(['Escape'])) closeInv();
      G.play += dt;
      updatePlayer(dt, controls);
      if (controls) updateHands(dt); else { mine.prog = 0; }
      if (G.mode === 'inv') { for (var n = 1; n <= 9; n++) if (K.pressed('Digit' + n)) { G.sel = n - 1; invDirty = true; } }
      for (i = 0; i < G.animals.length; i++) { a = G.animals[i]; if (Math.abs(a.x - P.x) < 50) updateAnimal(a, dt); }
      updateItems(dt);
      updateWorldSim(dt);
      updateDoors();
      updateExplore();
      G.questT -= dt; if (G.questT <= 0) { G.questT = 0.4; checkQuests(); if (G.mode === 'inv') { nearStations(); } updateGuide(); }
      G.saveT += dt; if (G.saveT > 30) { G.saveT = 0; saveGame(); }
      // camera
      var tcx = P.x + P.w / 2 - VTW / 2 + P.face * 1.2, tcy = P.y + P.h / 2 - VTH / 2 - 0.5;
      var k = 1 - Math.exp(-7 * dt);
      G.cam.x += (tcx - G.cam.x) * k; G.cam.y += (tcy - G.cam.y) * (1 - Math.exp(-6 * dt));
      G.cam.x = clamp(G.cam.x, 0, W - VTW); G.cam.y = clamp(G.cam.y, -2, H - VTH);
      if (invDirty && G.mode === 'inv') renderInv();
      ambient(dt);
    }
    // shared fx
    shake.update(dt);
    for (i = 0; i < PMAX; i++) {
      var p = parts[i]; if (!p.on) continue;
      p.life -= dt; if (p.life <= 0) { p.on = false; continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 0 && p.g > 0 && G.world.solid(Math.floor(p.x), Math.floor(p.y))) { p.vy *= -0.3; p.vx *= 0.6; p.y -= p.vy * dt * 2; }
    }
    for (i = texts.length - 1; i >= 0; i--) { var tt = texts[i]; tt.life -= dt; tt.pop = Math.max(0, (tt.pop || 0) - dt * 5); if (!tt.key) tt.y -= dt * 0.9; else if (P) { tt.x = P.x + P.w / 2; tt.y = P.y - 0.3 - (1.3 - tt.life) * 0.4 - (texts.length - 1 - i) * 0.55; } if (tt.life <= 0) texts.splice(i, 1); }
    for (i = confetti.length - 1; i >= 0; i--) { var c = confetti[i]; c.vy += 600 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.99; c.r += c.vr * dt; c.life -= dt; if (c.life <= 0 || c.y > VH + 20) confetti.splice(i, 1); }
    for (i = G.toasts.length - 1; i >= 0; i--) { if (i === 0) { G.toasts[0].t += dt * (G.toasts.length > 2 ? 3 : 1); if (G.toasts[0].t > G.toasts[0].dur) G.toasts.shift(); } }
    if (G.hint) { G.hint.t -= dt; if (G.hint.t <= 0) G.hint = null; }
    if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
    if (placePop) { placePop.t -= dt; if (placePop.t <= 0) placePop = null; }
    G.selPop = Math.max(0, G.selPop - dt * 4); G.selName = Math.max(0, G.selName - dt); G.savedFlash = Math.max(0, G.savedFlash - dt);
    for (i = 0; i < 36; i++) if (slotBump[i] > 0) slotBump[i] = Math.max(0, slotBump[i] - dt * 4);
    K.endFrame(); M.lp = M.rp = false; M.wheel = 0;
  }
  function ambient(dt) {
    var env = BW.envAt(G.tod), bio = G.world.biomeAt(P.x);
    var surf = G.world.surf[clamp(Math.floor(P.x), 0, W - 1)];
    if (P.y > surf + 10) return;
    if (bio === 'snow' && Math.random() < 0.5) part(G.cam.x + Math.random() * (VTW + 6) - 3, G.cam.y - 1, -0.6 + Math.random() * 0.4, 1.5 + Math.random(), 8, 0.1 + Math.random() * 0.08, '#ffffff', 0, 4);
    if (env.night > 0.6 && (bio === 'forest' || bio === 'plains') && Math.random() < 0.06) part(G.cam.x + Math.random() * VTW, surf - 1 - Math.random() * 6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, 3, 0.12, '#d8ff6a', 0, 2);
    if (Math.random() < 0.03 && (bio === 'forest')) part(G.cam.x + Math.random() * VTW, G.cam.y + Math.random() * 6, 0.8, 1, 4, 0.14, '#4fbf40', 0.5, 5);
  }

  // --------------------------------------------------------------- render
  var titleFrame = 0;
  function render() {
    var ctx = view.ctx, S = view.scale * view.dpr;
    if (!G.world) return;
    // The title backdrop pans slowly: redraw it at half rate to keep the menu light.
    if (G.mode === 'title' || G.mode === 'newworld') { titleFrame++; if (titleFrame % 2) return; }
    var cx = G.cam.x + shake.x / TS, cy = G.cam.y + shake.y / TS;
    cx = Math.round(cx * TS * S) / (TS * S); cy = Math.round(cy * TS * S) / (TS * S);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    budget.n = G.mode === 'title' ? 2 : 4;
    rend.drawChunks(ctx, cx, cy, VTW, VTH, S, budget);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawEntities(ctx, cx, cy);
    var env = BW.envAt(G.tod);
    env.ambient = 0.075;
    if (P && G.mode !== 'title') { env.px = P.x + P.w / 2; env.py = P.y + 0.8; env.pglow = 0.5; } else { env.px = -99; env.py = -99; env.pglow = 0; }
    rend.drawLight(ctx, cx, cy, VTW, VTH, env, S);
    drawSkyCached(ctx, cx, cy, S);
    ctx.imageSmoothingEnabled = false;
    drawEmissive(ctx, cx, cy, env);
    drawParticles(ctx, cx, cy, true);
    drawTexts(ctx, cx, cy);
    if ((G.mode === 'play' || G.mode === 'inv' || G.mode === 'pause') ) { drawCursor(ctx, cx, cy); drawHUD(ctx); }
    drawConfetti(ctx);
  }
  // Sky is soft and slow-moving: render it at half resolution, refresh only when needed.
  var skyCv = document.createElement('canvas'), skyCtx = skyCv.getContext('2d'), skyState = { n: 0, cx: -99, cy: -99 };
  function drawSkyCached(ctx, cx, cy, S) {
    var w = Math.ceil(canvas.width / 2), h = Math.ceil(canvas.height / 2);
    if (skyCv.width !== w || skyCv.height !== h) { skyCv.width = w; skyCv.height = h; skyState.n = 0; }
    skyState.n--;
    if (skyState.n <= 0 || Math.abs(cx - skyState.cx) + Math.abs(cy - skyState.cy) > 0.05) {
      skyCtx.setTransform(1, 0, 0, 1, 0, 0);
      skyCtx.clearRect(0, 0, w, h);
      skyCtx.setTransform(w / VW, 0, 0, h / VH, 0, 0);
      rend.drawSky(skyCtx, cx, cy, VTW, VTH, G.tod, G.time);
      skyState.n = 4; skyState.cx = cx; skyState.cy = cy;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(skyCv, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  // Cache rarely-changing HUD panels in small canvases keyed by a content signature.
  var panelCache = {};
  function cachedPanel(ctx, key, sig, x, y, w, h, fn) {
    var S = view.scale * view.dpr, pc = panelCache[key];
    if (!pc) { pc = panelCache[key] = { cv: document.createElement('canvas'), sig: null, S: 0 }; }
    if (pc.sig !== sig || pc.S !== S) {
      pc.cv.width = Math.ceil(w * S); pc.cv.height = Math.ceil(h * S);
      var c2 = pc.cv.getContext('2d');
      c2.setTransform(S, 0, 0, S, -x * S, -y * S);
      fn(c2);
      pc.sig = sig; pc.S = S;
    }
    ctx.drawImage(pc.cv, x, y, pc.cv.width / S, pc.cv.height / S);
  }
  function sx(wx, cx) { return (wx - cx) * TS; }
  function drawEntities(ctx, cx, cy) {
    var t = G.time;
    // items
    for (var i = 0; i < G.items.length; i++) {
      var it = G.items[i], x = sx(it.x, cx), y = sx(it.y, cy) - 4 + Math.sin(t * 4 + it.bob) * 2;
      if (x < -40 || x > VW + 40 || y < -40 || y > VH + 40) continue;
      if (TEX[it.id]) ctx.drawImage(TEX[it.id], x - 8, y - 8, 16, 16);
      if (it.n > 1) { ctx.drawImage(TEX[it.id], x - 5, y - 11, 16, 16); }
    }
    // animals
    for (i = 0; i < G.animals.length; i++) {
      var a = G.animals[i], ax = sx(a.x + a.w / 2, cx), ay = sx(a.y + a.h + a.stepOff, cy);
      if (ax < -60 || ax > VW + 60 || ay < -60 || ay > VH + 80) continue;
      ctx.save(); ctx.translate(Math.round(ax), Math.round(ay)); ctx.scale(a.face, 1);
      BW.drawAnimal(ctx, a, t);
      ctx.restore();
    }
    // player
    if (P && G.mode !== 'title') {
      var px = sx(P.x + P.w / 2, cx), py = sx(P.y + P.h + P.stepOff, cy);
      var held = 0;
      if (mine.prog > 0 || (M.left && P.swingT > 0)) held = bestPick().id;
      else { var s = G.inv[G.sel]; held = s ? s.id : 0; }
      var swing = P.swingT > 0 ? -1.2 + Math.sin(G.time * 22) * 0.9 : 0;
      if (P.flying) swing = -0.4;
      var wx = G.cam.x + M.x / TS, wy = G.cam.y + M.y / TS;
      var lookX = clamp(Math.round((wx - (P.x + P.w / 2)) * P.face * 0.4), -1, 1), lookY = clamp(Math.round((wy - (P.y + 0.5)) * 0.35), -1, 1);
      ctx.save();
      ctx.translate(Math.round(px), Math.round(py));
      ctx.scale(P.face * P.sx * 0.93, P.sy * 0.93);
      BW.drawPlayer(ctx, { walk: P.walk, walkAmt: P.climbing ? 0.6 : P.walkAmt, swing: swing, look: lookY * 0.3, lookX: lookX, lookY: lookY, skin: wornSkin(), held: held, blink: P.blink > 0 });
      ctx.restore();
    }
    // mining cracks
    if (mine.prog > 0 && mine.x >= 0) {
      var st = Math.min(7, Math.floor(mine.prog * 8));
      var jx = (Math.random() - 0.5) * 1.5;
      ctx.drawImage(BW.CRACKS[st], sx(mine.x, cx) + jx, sx(mine.y, cy), TS, TS);
    }
    if (placePop) {
      var k = placePop.t / 0.18;
      ctx.fillStyle = 'rgba(255,255,255,' + (k * 0.5) + ')';
      ctx.fillRect(sx(placePop.x, cx) - k * 3, sx(placePop.y, cy) - k * 3, TS + k * 6, TS + k * 6);
    }
    drawGuide(ctx, cx, cy);
    drawParticles(ctx, cx, cy, false);
  }
  // ---- beginner guide: arrow to the nearest tree while "chop a tree" is the current quest
  var guide = null;
  function currentQuest() { var qs = questsFor(G.gm); for (var i = 0; i < qs.length; i++) if (!G.done[qs[i].id]) return qs[i]; return null; }
  // Quests that are finished by crafting something: which recipe output they need.
  var QUEST_RECIPE = { planks: B.PLANKS, table: B.TABLE, pickwood: I.PICK_WOOD, pickstone: I.PICK_STONE, torch: B.TORCH, furnace: B.FURNACE,
    copper: I.COPPER_INGOT, iron: I.IRON_INGOT, pickiron: I.PICK_IRON, glass: B.GLASS, pickdiamond: I.PICK_DIAMOND, diamondblock: B.DIAMOND_BLOCK };
  function questRecipe() {
    if (G.gm !== 'survival') return null;
    var q = currentQuest(), out = q && QUEST_RECIPE[q.id];
    if (!out) return null;
    for (var i = 0; i < BW.RECIPES.length; i++) if (BW.RECIPES[i].out === out) return BW.RECIPES[i];
    return null;
  }
  function updateGuide() {
    guide = null;
    var q = currentQuest();
    if (G.gm !== 'survival' || !q || q.id !== 'logs' || !P) return;
    var wd = G.world, px = Math.floor(P.x + P.w / 2), best = null, bd = 99;
    for (var dx = -18; dx <= 18; dx++) {
      var x = px + dx; if (x < 0 || x >= W) continue;
      // lowest trunk tile of a tree in this column, near the player's height
      for (var y = Math.max(0, Math.floor(P.y) - 10); y < Math.min(H - 1, Math.floor(P.y) + 8); y++) {
        if (wd.tiles[y * W + x] === B.TRUNK && wd.tiles[(y + 1) * W + x] !== B.TRUNK) {
          var d = Math.abs(dx) + Math.abs(y - P.y) * 0.5;
          if (d < bd) { bd = d; best = { x: x, y: y }; }
        }
      }
    }
    guide = best;
  }
  function drawGuide(ctx, cx, cy) {
    if (!guide || G.mode !== 'play' || mine.prog > 0) return;
    var t = G.time, x = sx(guide.x, cx), y = sx(guide.y, cy);
    if (x < -40 || x > VW + 40 || y < -80 || y > VH + 40) return;
    var bob = Math.abs(Math.sin(t * 5)) * 10;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,220,60,' + (0.55 + Math.sin(t * 8) * 0.35) + ')';
    ctx.strokeRect(x - 1, y - 1, TS + 2, TS + 2);
    // down arrow above the tile
    var ax = x + TS / 2, ay = y - 12 - bob;
    ctx.fillStyle = '#1d2340';
    ctx.beginPath(); ctx.moveTo(ax - 17, ay - 22); ctx.lineTo(ax + 17, ay - 22); ctx.lineTo(ax, ay + 3); ctx.closePath(); ctx.fill();
    ctx.fillRect(ax - 8, ay - 44, 16, 24);
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath(); ctx.moveTo(ax - 12, ay - 20); ctx.lineTo(ax + 12, ay - 20); ctx.lineTo(ax, ay - 2); ctx.closePath(); ctx.fill();
    ctx.fillRect(ax - 5, ay - 41, 10, 22);
    txt(ctx, 'اقطعها!', ax, ay - 52, 18, '#ffe066', 'center');
  }
  function drawTexts(ctx, cx, cy) {
    var i;
    ctx.textAlign = 'center';
    for (i = 0; i < texts.length; i++) {
      var tx = texts[i], a2 = Math.min(1, tx.life / tx.max * 2);
      ctx.globalAlpha = a2;
      ctx.font = tx.big ? '700 30px Fredoka, sans-serif' : '700 ' + Math.round(18 + (tx.pop || 0) * 6) + 'px Fredoka, sans-serif';
      ctx.direction = dirOf(tx.s);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(tx.s, sx(tx.x, cx) + 2, sx(tx.y, cy) + 2);
      ctx.fillStyle = tx.col; ctx.fillText(tx.s, sx(tx.x, cx), sx(tx.y, cy));
    }
    ctx.globalAlpha = 1;
  }
  function drawParticles(ctx, cx, cy, glow) {
    for (var i = 0; i < PMAX; i++) {
      var p = parts[i]; if (!p.on) continue;
      var isGlow = p.kind === 2 || p.kind === 1;
      if (isGlow !== glow) continue;
      var x = sx(p.x, cx), y = sx(p.y, cy), a = Math.min(1, p.life / p.max * 1.6);
      if (x < -20 || x > VW + 20 || y < -20 || y > VH + 20) continue;
      ctx.globalAlpha = a;
      if (p.kind === 1) { heart(ctx, x, y, 3); }
      else { var s = p.size * TS; ctx.fillStyle = p.col; ctx.fillRect(x - s / 2, y - s / 2, s, s); }
    }
    ctx.globalAlpha = 1;
  }
  function heart(ctx, x, y, s) {
    ctx.fillStyle = '#ff5a8a';
    ctx.fillRect(x - 2 * s, y - s, 2 * s, 2 * s); ctx.fillRect(x, y - s, 2 * s, 2 * s); ctx.fillRect(x - 1.5 * s, y + s, 3 * s, s); ctx.fillRect(x - 0.5 * s, y + 2 * s, s, s);
    ctx.fillStyle = '#ffc0d4'; ctx.fillRect(x - 1.5 * s, y - 0.5 * s, s * 0.8, s * 0.8);
  }
  var LIGHT_IDS = {};
  LIGHT_IDS[B.TORCH] = 1; LIGHT_IDS[B.LANTERN] = 1; LIGHT_IDS[B.JACK] = 1; LIGHT_IDS[B.FURNACE] = 1; LIGHT_IDS[B.MUSHROOM] = 2;
  function drawEmissive(ctx, cx, cy, env) {
    var wd = G.world, x0 = Math.max(0, Math.floor(cx) - 1), x1 = Math.min(W - 1, Math.floor(cx + VTW) + 1), y0 = Math.max(0, Math.floor(cy) - 1), y1 = Math.min(H - 1, Math.floor(cy + VTH) + 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var t = G.time;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var id = wd.tiles[y * W + x], L = LIGHT_IDS[id];
      if (!L) continue;
      var skyL = wd.sky[y * W + x] / 15 * env.day;
      var str = (1 - skyL * 0.85);
      var flick = 0.85 + Math.sin(t * 9 + x * 3.1 + y) * 0.08 + Math.sin(t * 23 + x) * 0.05;
      var X = sx(x + 0.5, cx), Y = sx(y + 0.5, cy);
      var r = id === B.TORCH ? 90 : id === B.FURNACE ? 60 : id === B.MUSHROOM ? 60 : 110;
      ctx.globalAlpha = Math.max(0, str * (id === B.FURNACE ? 0.35 : 0.5) * flick);
      ctx.drawImage(L === 2 ? BW.glowCyan : BW.glowWarm, X - r, Y - r, r * 2, r * 2);
      if (id === B.TORCH && Math.random() < 0.02) part(x + 0.5, y + 0.15, (Math.random() - 0.5) * 0.5, -1.2, 0.8, 0.07, '#ffcc33', -0.5, 2);
      if (id === B.MUSHROOM && Math.random() < 0.01) part(x + Math.random(), y + 0.5, 0, -0.5, 1.5, 0.07, '#8ff8ff', -0.1, 2);
    }
    ctx.restore();
    // animated flames on top (not additive)
    for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) {
      if (wd.tiles[y * W + x] !== B.TORCH) continue;
      var fx = sx(x, cx) + 12, fy = sx(y, cy) + 2, fl = Math.sin(t * 14 + x * 7) > 0 ? 1 : 0;
      ctx.fillStyle = '#ff9a1a'; ctx.fillRect(fx, fy + 4 - fl, 8, 10 + fl);
      ctx.fillStyle = '#ffd23a'; ctx.fillRect(fx + 2, fy + 2 - fl, 4, 10 + fl);
      ctx.fillStyle = '#fff6b0'; ctx.fillRect(fx + 2, fy + 7, 4, 4);
    }
  }
  function drawCursor(ctx, cx, cy) {
    if (G.mode !== 'play' || !G.hover) return;
    var h = G.hover, x = sx(h.x, cx), y = sx(h.y, cy);
    if (hotbarHit(M.x, M.y) >= 0) return;
    var an = animalAt(G.cam.x + M.x / TS, G.cam.y + M.y / TS);
    if (an) { ctx.fillStyle = '#ff5a8a'; heart(ctx, M.x, M.y - 18, 2.5); return; }
    var id = G.world.get(h.x, h.y);
    var s = G.inv[G.sel];
    if (h.ok && !id && s && ITEMS[s.id] && ITEMS[s.id].place && TEX[ITEMS[s.id].place]) {
      ctx.globalAlpha = 0.35 + Math.sin(G.time * 6) * 0.1;
      ctx.drawImage(TEX[ITEMS[s.id].place], x, y, TS, TS);
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = h.ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,90,95,0.55)';
    ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2);
    if (h.ok) { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.strokeRect(x + 3, y + 3, TS - 6, TS - 6); }
  }

  // ------------------------------------------------------------------ HUD
  var HB = { x: VW / 2 - 9 * 58 / 2, y: VH - 70, s: 54, g: 4 };
  function hotbarHit(x, y) {
    if (G.mode !== 'play') return -1;
    if (y < HB.y - 4 || y > HB.y + HB.s + 4) return -1;
    var i = Math.floor((x - HB.x) / (HB.s + HB.g));
    return i >= 0 && i < 9 ? i : -1;
  }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function txt(ctx, s, x, y, size, col, align, stroke) {
    s = String(s);
    ctx.font = '700 ' + size + 'px Fredoka, sans-serif'; ctx.textAlign = align || 'left'; ctx.direction = dirOf(s);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(s, x + 2, y + 2.5);
    ctx.fillStyle = col || '#fff'; ctx.fillText(s, x, y);
  }
  // Like txt(), but shrinks the font until the text fits in maxW.
  function txtFit(ctx, s, x, y, size, col, align, maxW) {
    s = String(s);
    ctx.direction = dirOf(s);
    while (size > 10) { ctx.font = '700 ' + size + 'px Fredoka, sans-serif'; if (ctx.measureText(s).width <= maxW) break; size--; }
    txt(ctx, s, x, y, size, col, align);
  }
  function icon(ctx, id, x, y, s) { var t = TEX[id === BW.FLOWER ? B.FLOWER_RED : id]; if (t) ctx.drawImage(t, x, y, s, s); }
  function drawHUD(ctx) {
    ctx.textBaseline = 'alphabetic';
    var pk = bestPick(), hsig = G.gm + G.sel + ':' + pk.id;
    for (var hi = 0; hi < 9; hi++) { var hs = G.inv[hi]; hsig += '|' + (hs ? hs.id + 'x' + hs.n : '') + ':' + Math.round((slotBump[hi] + (hi === G.sel ? G.selPop * 0.6 : 0)) * 20); }
    cachedPanel(ctx, 'hotbar', hsig, HB.x - 90, HB.y - 16, 9 * (HB.s + HB.g) + 190, 86, function (ctx) {
    // hotbar
    ctx.fillStyle = 'rgba(12,16,40,0.55)'; rrect(ctx, HB.x - 8, HB.y - 8, 9 * (HB.s + HB.g) + 12, HB.s + 16, 16); ctx.fill();
    for (var i = 0; i < 9; i++) {
      var sel = i === G.sel, bump = slotBump[i] + (sel ? G.selPop * 0.6 : 0);
      var sz = HB.s * (sel ? 1.08 : 1) + bump * 6, x = HB.x + i * (HB.s + HB.g) + HB.s / 2 - sz / 2, y = HB.y + HB.s / 2 - sz / 2 - (sel ? 4 : 0);
      ctx.fillStyle = sel ? 'rgba(255,220,80,0.3)' : 'rgba(255,255,255,0.12)'; rrect(ctx, x, y, sz, sz, 10); ctx.fill();
      ctx.lineWidth = sel ? 4 : 2; ctx.strokeStyle = sel ? '#ffcc00' : 'rgba(255,255,255,0.3)'; ctx.stroke();
      var s = G.inv[i];
      if (s) {
        var is = 34 + bump * 6; icon(ctx, s.id, x + sz / 2 - is / 2, y + sz / 2 - is / 2, is);
        if (G.gm === 'survival' && s.n > 1) txt(ctx, String(s.n), x + sz - 5, y + sz - 5, 17, '#fff', 'right');
      }
      txt(ctx, String(i + 1), x + 5, y + 15, 12, 'rgba(255,255,255,0.7)');
    }
    // pickaxe badge
    var bx = HB.x - 86, by = HB.y - 2;
    ctx.fillStyle = 'rgba(12,16,40,0.55)'; rrect(ctx, bx, by - 4, 70, 62, 14); ctx.fill();
    if (G.gm === 'creative') { txt(ctx, '∞', bx + 35, by + 34, 34, '#ffcc00', 'center'); txt(ctx, 'إبداع', bx + 35, by + 53, 13, '#fff', 'center'); }
    else if (pk.id) { icon(ctx, pk.id, bx + 17, by - 2, 36); txtFit(ctx, ['', 'معول خشب', 'معول حجر', 'معول حديد', 'معول ألماس'][pk.tool] || '', bx + 35, by + 53, 13, '#fff', 'center', 66); }
    else { ctx.globalAlpha = 0.5; icon(ctx, I.PICK_WOOD, bx + 17, by - 2, 36); ctx.globalAlpha = 1; txt(ctx, 'بيديك', bx + 35, by + 53, 13, '#fff', 'center'); }
    // bag button hint
    var ex = HB.x + 9 * (HB.s + HB.g) + 18;
    ctx.fillStyle = 'rgba(12,16,40,0.55)'; rrect(ctx, ex, by - 4, 70, 62, 14); ctx.fill();
    ctx.fillStyle = '#fff'; rrect(ctx, ex + 22, by + 6, 26, 26, 6); ctx.fill();
    ctx.font = '700 17px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.direction = 'ltr'; ctx.fillStyle = '#1d2340'; ctx.fillText('E', ex + 35, by + 26);
    txt(ctx, 'الصنع', ex + 35, by + 53, 13, '#fff', 'center');
    });
    // pulse the crafting badge when the current quest's item can be crafted right now
    var qr = questRecipe();
    if (qr && hasIngredients(qr) && !(ITEMS[qr.out].max === 1 && countItem(qr.out) > 0)) {
      var ebx = HB.x + 9 * (HB.s + HB.g) + 18, eby = HB.y - 6, pulse = 0.5 + Math.sin(G.time * 7) * 0.5;
      ctx.lineWidth = 3 + pulse * 2; ctx.strokeStyle = 'rgba(255,204,0,' + (0.5 + pulse * 0.5) + ')';
      rrect(ctx, ebx - 2 - pulse * 2, eby - 2 - pulse * 2, 74 + pulse * 4, 66 + pulse * 4, 16); ctx.stroke();
      ctx.fillStyle = '#ff5a5f'; ctx.beginPath(); ctx.arc(ebx + 66, eby + 2, 11, 0, Math.PI * 2); ctx.fill();
      txt(ctx, '!', ebx + 66, eby + 9, 17, '#fff', 'center');
    }
    // selected item name
    var cur = G.inv[G.sel];
    if (G.selName > 0 && cur) { ctx.globalAlpha = Math.min(1, G.selName * 2); txt(ctx, BW.itemName(cur.id), VW / 2, HB.y - 18, 22, '#fff', 'center'); ctx.globalAlpha = 1; }
    // quest tracker
    drawQuests(ctx);
    // top right info
    var stars = starCount(), max = questsFor(G.gm).length;
    var tx = VW - 16, ty = 80;
    var env = BW.envAt(G.tod), night = env.night > 0.5;
    var depth = Math.max(0, Math.floor(P.y + P.h) - G.world.surf[clamp(Math.floor(P.x), 0, W - 1)]);
    var where = depth > 3 ? 'العمق: ' + depth + ' م' : BW.BIOME_LABEL[G.world.biomeAt(P.x)] || '';
    var label = (night ? '☾ ليل' : env.sunset > 0.3 ? '☀ غروب' : '☀ نهار') + '  ·  ' + where;
    cachedPanel(ctx, 'info', stars + '/' + max + label, VW - 200, 56, 196, 96, function (c) {
      c.fillStyle = 'rgba(12,16,40,0.55)'; rrect(c, VW - 196, 60, 182, 84, 14); c.fill();
      txt(c, '★ ' + stars + ' / ' + max, tx - 12, ty + 12, 24, '#ffcc00', 'right');
      txtFit(c, label, tx - 12, ty + 45, 15, '#fff', 'right', 166);
    });
    // toasts
    drawToast(ctx);
    if (G.banner) {
      var bt = G.banner.t, a = Math.min(1, bt, (3 - bt) * 3);
      ctx.globalAlpha = Math.max(0, a);
      txt(ctx, '~ ' + G.banner.s + ' ~', VW / 2, 200, 40, '#fff', 'center');
      ctx.globalAlpha = 1;
    }
    if (G.hint) {
      var ha = Math.min(1, G.hint.t * 2);
      ctx.globalAlpha = ha;
      ctx.font = '700 20px Fredoka, sans-serif'; ctx.direction = dirOf(G.hint.s);
      var w = ctx.measureText(G.hint.s).width + 36;
      ctx.fillStyle = 'rgba(12,16,40,0.8)'; rrect(ctx, VW / 2 - w / 2, HB.y - 78, w, 40, 20); ctx.fill();
      txt(ctx, G.hint.s, VW / 2, HB.y - 51, 20, '#ffe066', 'center');
      ctx.globalAlpha = 1;
    }
    if (G.savedFlash > 0) { ctx.globalAlpha = Math.min(1, G.savedFlash); txt(ctx, '✓ تم الحفظ', VW - 20, VH - 20, 16, '#9cf0b8', 'right'); ctx.globalAlpha = 1; }
  }
  function drawQuests(ctx) {
    var qs = questsFor(G.gm), s = G.stats, list = [], sig = G.gm + starCount();
    for (var i = 0; i < qs.length && list.length < 3; i++) if (!G.done[qs[i].id]) { list.push(qs[i]); sig += '|' + qs[i].id + ':' + Math.min(qs[i].need, qs[i].val(s)); }
    cachedPanel(ctx, 'quests', sig, 10, 10, 372, 200, function (c) { drawQuestsRaw(c, qs, s, list); });
  }
  function drawQuestsRaw(ctx, qs, s, list) {
    var i;
    var x = 14, y = 14, w = 360;
    ctx.fillStyle = 'rgba(12,16,40,0.6)'; rrect(ctx, x, y, w, list.length ? 46 + 78 + (list.length - 1) * 30 : 60, 16); ctx.fill();
    // Right-to-left layout: title and icons on the right, counters on the left.
    txt(ctx, G.gm === 'creative' ? 'أهداف البناء' : 'المهام', x + w - 16, y + 31, 19, '#ffcc00', 'right');
    txt(ctx, starCount() + '/' + qs.length + ' ★', x + 16, y + 30, 16, '#fff', 'left');
    if (!list.length) { txt(ctx, 'أنجزت كل شيء! أنت سيّد العالم!', x + w - 16, y + 53, 16, '#9cf0b8', 'right'); return; }
    var q = list[0], v = Math.min(q.need, q.val(s));
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; rrect(ctx, x + 8, y + 42, w - 16, 70, 12); ctx.fill();
    icon(ctx, q.icon, x + w - 58, y + 52, 40);
    wrapText(ctx, q.text, x + w - 68, y + 65, w - 90, 17, 'right');
    var bw = w - 150, bx0 = x + w - 68 - bw, fw = Math.max(12, bw * v / q.need);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; rrect(ctx, bx0, y + 90, bw, 12, 6); ctx.fill();
    ctx.fillStyle = '#3ddc84'; rrect(ctx, bx0 + bw - fw, y + 90, fw, 12, 6); ctx.fill();
    txt(ctx, v + ' / ' + q.need, x + 18, y + 101, 14, '#fff', 'left');
    for (i = 1; i < list.length; i++) {
      icon(ctx, list[i].icon, x + w - 40, y + 118 + (i - 1) * 30, 22);
      ctx.globalAlpha = 0.8; txtFit(ctx, list[i].text, x + w - 48, y + 135 + (i - 1) * 30, 15, '#fff', 'right', w - 64); ctx.globalAlpha = 1;
    }
  }
  function wrapText(ctx, s, x, y, maxW, size, align) {
    ctx.font = '700 ' + size + 'px Fredoka, sans-serif'; ctx.direction = dirOf(s);
    var words = s.split(' '), line = '', lines = [];
    for (var i = 0; i < words.length; i++) { var t = line ? line + ' ' + words[i] : words[i]; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = words[i]; } else line = t; }
    lines.push(line);
    if (lines.length > 1) y -= 9;
    for (i = 0; i < Math.min(2, lines.length); i++) txt(ctx, lines[i], x, y + i * 20, size, '#fff', align);
  }
  function drawToast(ctx) {
    var t = G.toasts[0]; if (!t) return;
    var k = t.t < 0.3 ? t.t / 0.3 : t.t > t.dur - 0.4 ? (t.dur - t.t) / 0.4 : 1;
    var e = 1 - Math.pow(1 - clamp(k, 0, 1), 3);
    var w = 520, h = 86, x = VW / 2 - w / 2, y = -h + e * (h + 16);
    var pop = t.t < 0.5 ? 1 + Math.sin(t.t / 0.5 * Math.PI) * 0.06 : 1;
    ctx.save(); ctx.translate(VW / 2, y + h / 2); ctx.scale(pop, pop); ctx.translate(-VW / 2, -(y + h / 2));
    var grd = ctx.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, t.soft ? '#4f7cff' : '#ffcf3a'); grd.addColorStop(1, t.soft ? '#3a55c8' : '#ff9f1a');
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, x, y + 6, w, h, 20); ctx.fill();
    ctx.fillStyle = grd; rrect(ctx, x, y, w, h, 20); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
    // Icon on the right, text right-aligned next to it (Arabic reads right to left).
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; rrect(ctx, x + w - 78, y + 11, 64, 64, 14); ctx.fill();
    if (t.skin != null) { ctx.save(); ctx.translate(x + w - 46, y + 72); ctx.scale(-0.85, 0.85); BW.drawPlayer(ctx, { walk: 0, walkAmt: 0, swing: 0, look: 0, skin: BW.SKINS[t.skin], held: 0 }); ctx.restore(); }
    else if (t.icon) icon(ctx, t.icon, x + w - 70, y + 19, 48);
    txtFit(ctx, (t.soft ? '' : '★ ') + t.title, x + w - 96, y + 38, 26, '#fff', 'right', w - 116);
    txtFit(ctx, t.text, x + w - 96, y + 67, 18, t.soft ? '#e8eeff' : '#5a2a00', 'right', w - 116);
    ctx.restore();
  }
  function drawConfetti(ctx) {
    for (var i = 0; i < confetti.length; i++) {
      var c = confetti[i];
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.globalAlpha = Math.min(1, c.life);
      ctx.fillStyle = c.col; ctx.fillRect(-5, -3, 10, 6); ctx.restore();
    }
  }

  // ============================================================ DOM UI
  var titleEl = $('title'), pauseEl = $('pause'), invEl = $('inv'), newEl = $('newworld'), loadEl = $('loading'), masterEl = $('master');
  var pauseBtn = $('pausebtn');
  var titleBusy = false;
  var selSlot = meta.lastSlot || 1;
  function show(el, on) { el.hidden = !on; }
  function enterPlay() {
    G.mode = 'play';
    show(titleEl, false); show(newEl, false); show(loadEl, false); show(pauseEl, false); show(invEl, false);
    pauseBtn.hidden = false;
    G.cam.x = clamp(P.x - VTW / 2, 0, W - VTW); G.cam.y = clamp(P.y - VTH / 2, -2, H - VTH);
    rend.warm(G.cam.x, G.cam.y, VTW, VTH);
    G.saveT = 0; G.questT = 1;
    K.reset(); M.left = M.right = false; flyTap = false;
  }
  function toTitle() {
    G.mode = 'title';
    G.slot = 0;
    show(pauseEl, false); show(invEl, false); show(masterEl, false);
    pauseBtn.hidden = true;
    startWorld(titleWorld);
    G.animals = titleAnimals;
    G.cam.x = 200; G.cam.y = titleWorld.surf[220] - 13;
    G.toasts = []; G.hint = null; G.banner = null;
    buildTitle();
    show(titleEl, true);
  }
  function pause() {
    if (G.mode !== 'play') return;
    G.mode = 'pause';
    saveGame();
    renderPause();
    show(pauseEl, true);
    SND.click();
  }
  function resume() { show(pauseEl, false); G.mode = 'play'; K.reset(); M.left = M.right = false; }
  $('resumeBtn').onclick = function () { resume(); };
  $('homeBtn').onclick = function () { var sp = spawnPoint(); P.x = sp.x; P.y = sp.y; P.vx = P.vy = 0; P.flying = false; resume(); SND.grow(); burst(P.x + 0.35, P.y + 1, ['#ffffff', '#bfe9ff', '#ffd93d'], 20, 6, 0.2); };
  $('quitBtn').onclick = function () { saveGame(); toTitle(); };
  pauseBtn.addEventListener('click', function (e) { e.stopPropagation(); if (G.mode === 'play') pause(); else if (G.mode === 'pause') resume(); pauseBtn.blur(); });
  pauseBtn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  function renderPause() {
    var qs = questsFor(G.gm), html = '';
    qs.forEach(function (q) {
      var d = !!G.done[q.id];
      html += '<div class="q' + (d ? ' done' : '') + '"><img src="' + BW.iconURL(q.icon === BW.FLOWER ? B.FLOWER_RED : q.icon) + '"><span>' + q.text + '</span><b dir="ltr">' + (d ? '★' : Math.min(q.need, q.val(G.stats)) + '/' + q.need) + '</b></div>';
    });
    $('pauseQuests').innerHTML = html;
    $('pauseStars').textContent = '★ ' + ltr(starCount() + ' / ' + qs.length);
    $('pauseName').textContent = G.name + ' · ' + (G.gm === 'creative' ? 'إبداع' : 'مغامرة');
  }
  window.addEventListener('keydown', function (e) {
    if (G.mode === 'pause' && (e.code === 'KeyP' || e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') && !e.repeat) { e.preventDefault(); resume(); }
    else if (G.mode === 'master' && (e.code === 'Enter' || e.code === 'Space') && !e.repeat) { e.preventDefault(); closeMaster(); }
    else if (G.mode === 'newworld' && !e.repeat) {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Digit1') { e.preventDefault(); chooseMode('survival'); }
      else if (e.code === 'Digit2') chooseMode('creative');
      else if (e.code === 'Escape') { G.mode = 'title'; show(newEl, false); }
    }
  });
  function showMaster() {
    if (G.mode !== 'play') { G.masterShown = false; return; }
    G.mode = 'master';
    $('masterStars').textContent = '★ ' + ltr(starCount() + ' / ' + questsFor(G.gm).length);
    show(masterEl, true); SND.quest(); confettiBurst(); confettiBurst();
  }
  function closeMaster() { show(masterEl, false); G.mode = 'play'; K.reset(); }
  $('masterKeep').onclick = closeMaster;
  $('masterMenu').onclick = function () { show(masterEl, false); G.mode = 'play'; saveGame(); toTitle(); };

  // ----- title
  function fmtTime(s) {
    var m = Math.round(s / 60);
    if (m < 1) return 'بدأت للتو';
    return 'لعبت ' + (m === 1 ? 'دقيقة واحدة' : m === 2 ? 'دقيقتين' : m <= 10 ? m + ' دقائق' : m + ' دقيقة');
  }
  function buildTitle() {
    var wrap = $('slots'); wrap.innerHTML = '';
    for (var i = 1; i <= 3; i++) {
      (function (i) {
        var m = meta.slots[i - 1];
        var card = document.createElement('div');
        card.className = 'slot-card' + (i === selSlot ? ' sel' : '') + (m ? '' : ' empty');
        if (m) {
          card.innerHTML = '<div class="sc-mode ' + m.gm + '">' + (m.gm === 'creative' ? 'إبداع' : 'مغامرة') + '</div>' +
            '<img class="sc-ic" src="' + BW.iconURL(m.gm === 'creative' ? B.WOOL + 4 : B.GRASS) + '">' +
            '<div class="sc-name">' + escapeHTML(fixName(m.name)) + '</div>' +
            '<div class="sc-stars">★ <span dir="ltr">' + m.stars + ' / ' + m.max + '</span></div>' +
            '<div class="sc-time">' + fmtTime(m.play || 0) + '</div>' +
            '<button class="sc-del" title="احذف العالم" aria-label="احذف العالم">✕</button>';
        } else card.innerHTML = '<div class="sc-plus">+</div><div class="sc-name">عالم جديد</div><div class="sc-time">الخانة ' + i + '</div>';
        card.onclick = function (e) {
          if (e.target.classList.contains('sc-del')) { e.stopPropagation(); askDelete(i, card); return; }
          if (e.target.closest('.sc-confirm')) return;
          if (selSlot === i) { titlePlay(); return; }
          selSlot = i; SND.click(); buildTitle();
        };
        wrap.appendChild(card);
      })(i);
    }
    var m2 = meta.slots[selSlot - 1];
    $('playBtn').textContent = m2 ? '▶ العب: ' + fixName(m2.name) : '▶ عالم جديد';
    $('totalStars').textContent = 'نجومك: ★ ' + meta.totalStars;
    drawSkinPreview();
  }
  function escapeHTML(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function askDelete(i, card) {
    var c = document.createElement('div');
    c.className = 'sc-confirm';
    c.innerHTML = '<div>نحذف هذا العالم؟</div><div><button class="sg-btn yes">احذف</button><button class="sg-btn secondary no">لا، أبقِه</button></div>';
    card.appendChild(c);
    c.querySelector('.yes').onclick = function (e) { e.stopPropagation(); store.remove('slot' + i); meta.slots[i - 1] = null; saveMeta(); SND.brk('stone'); buildTitle(); };
    c.querySelector('.no').onclick = function (e) { e.stopPropagation(); buildTitle(); };
  }
  function titlePlay() {
    if (titleBusy || G.mode !== 'title') return;
    A.unlock();
    SND.click();
    if (meta.slots[selSlot - 1]) {
      titleBusy = true;
      show(loadEl, true);
      setTimeout(function () {
        var ok = false;
        try { ok = loadGame(selSlot); } catch (e) { ok = false; }
        titleBusy = false;
        if (!ok) { show(loadEl, false); meta.slots[selSlot - 1] = null; saveMeta(); buildTitle(); }
      }, 40);
    } else { G.mode = 'newworld'; show(newEl, true); }
  }
  function chooseMode(gm) {
    if (titleBusy) return;
    titleBusy = true;
    show(newEl, false); show(loadEl, true); SND.click();
    setTimeout(function () { newGame(selSlot, gm); titleBusy = false; }, 40);
  }
  $('playBtn').onclick = function () { titlePlay(); };
  $('modeSurv').onclick = function () { chooseMode('survival'); };
  $('modeCrea').onclick = function () { chooseMode('creative'); };
  $('modeBack').onclick = function () { G.mode = 'title'; show(newEl, false); };
  // skin picker
  var skinCv = $('skinCv'), skinCtx = skinCv.getContext('2d');
  function drawSkinPreview() {
    var sk = BW.SKINS[meta.skin] || BW.SKINS[0];
    var locked = meta.totalStars < sk.stars;
    skinCtx.setTransform(1, 0, 0, 1, 0, 0);
    skinCtx.clearRect(0, 0, skinCv.width, skinCv.height);
    skinCtx.imageSmoothingEnabled = false;
    skinCtx.translate(skinCv.width / 2, skinCv.height - 8);
    skinCtx.scale(1.7, 1.7);
    if (locked) skinCtx.filter = 'brightness(0)';
    BW.drawPlayer(skinCtx, { walk: 0, walkAmt: 0, swing: 0, look: 0, skin: sk, held: 0 });
    skinCtx.filter = 'none';
    $('skinName').textContent = locked ? '🔒 ' + sk.name : sk.name;
    $('skinInfo').textContent = locked ? 'اجمع ' + sk.stars + ' ★ لتفتحه' : 'الزي ' + (meta.skin + 1) + ' من ' + BW.SKINS.length;
  }
  function skinStep(d) {
    var n = BW.SKINS.length, i = meta.skin;
    i = (i + d + n) % n;
    meta.skin = i;
    // only save unlocked picks as the active skin
    SND.click(); drawSkinPreview();
    if (meta.totalStars >= BW.SKINS[i].stars) saveMeta();
  }
  $('skinL').onclick = function () { skinStep(-1); };
  $('skinR').onclick = function () { skinStep(1); };
  function wornSkin() { var sk = BW.SKINS[meta.skin]; return sk && meta.totalStars >= sk.stars ? sk : BW.SKINS[0]; }
  function activeSkinFix() { var sk = BW.SKINS[meta.skin]; if (!sk || meta.totalStars < sk.stars) { meta.skin = 0; } }

  // ----- inventory
  var invDirty = true;
  var bagEl = $('bag'), hotEl = $('hot'), palEl = $('palette'), craftEl = $('craftList'), curEl = $('cursorStack');
  var slotEls = [];
  function mkSlot(i) {
    var d = document.createElement('div');
    d.className = 'islot';
    d.innerHTML = '<img draggable="false"><span></span>';
    d.addEventListener('mousedown', function (e) { e.preventDefault(); slotClick(i, e); });
    d.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    slotEls[i] = d;
    return d;
  }
  for (var si = 9; si < 36; si++) bagEl.appendChild(mkSlot(si));
  for (si = 0; si < 9; si++) hotEl.appendChild(mkSlot(si));
  var PALETTE = [];
  Object.keys(ITEMS).forEach(function (k) { var it = ITEMS[k]; if (it.place && TEX[it.place]) PALETTE.push(+k); });
  PALETTE.sort(function (a, b) { return a - b; });
  PALETTE.forEach(function (id) {
    var d = document.createElement('div');
    d.className = 'islot pal';
    d.title = BW.itemName(id);
    d.innerHTML = '<img draggable="false" src="' + BW.iconURL(id) + '">';
    d.addEventListener('mousedown', function (e) {
      e.preventDefault();
      G.inv[G.sel] = { id: id, n: BW.maxStack(id) };
      bumpSlot(G.sel); SND.click(); invDirty = true; renderInv();
    });
    palEl.appendChild(d);
  });
  function slotClick(i, e) {
    var inv = G.inv, s = inv[i], c = G.cursor;
    if (G.gm === 'creative') {
      if (i < 9) { if (e.button === 2) inv[i] = null; G.sel = i; }
      SND.click(); invDirty = true; renderInv(); return;
    }
    if (e.shiftKey && s && !c) {
      // quick move between hotbar and backpack
      var from = i < 9 ? [9, 36] : [0, 9];
      inv[i] = null;
      var left = s.n, mx = BW.maxStack(s.id), j;
      for (j = from[0]; j < from[1] && left > 0; j++) if (inv[j] && inv[j].id === s.id && inv[j].n < mx) { var k = Math.min(left, mx - inv[j].n); inv[j].n += k; left -= k; }
      for (j = from[0]; j < from[1] && left > 0; j++) if (!inv[j]) { inv[j] = { id: s.id, n: left }; left = 0; }
      if (left > 0) inv[i] = { id: s.id, n: left };
    } else if (e.button === 2) {
      if (!c && s) { var half = Math.ceil(s.n / 2); G.cursor = { id: s.id, n: half }; s.n -= half; if (s.n <= 0) inv[i] = null; }
      else if (c && (!s || (s.id === c.id && s.n < BW.maxStack(s.id)))) { if (!s) inv[i] = { id: c.id, n: 1 }; else s.n++; c.n--; if (c.n <= 0) G.cursor = null; }
    } else {
      if (!c) { if (s) { G.cursor = s; inv[i] = null; } }
      else if (!s) { inv[i] = c; G.cursor = null; }
      else if (s.id === c.id) { var mx2 = BW.maxStack(s.id), k2 = Math.min(c.n, mx2 - s.n); s.n += k2; c.n -= k2; if (c.n <= 0) G.cursor = null; }
      else { inv[i] = c; G.cursor = s; }
    }
    SND.click(); invDirty = true; renderInv();
  }
  function openInv() {
    if (G.mode !== 'play') return;
    G.mode = 'inv';
    nearStations();
    invEl.classList.toggle('creative', G.gm === 'creative');
    show(invEl, true);
    invDirty = true; renderInv();
    SND.click();
    M.left = M.right = false;
  }
  function closeInv() {
    if (G.cursor) { var left = addItem(G.cursor.id, G.cursor.n); if (left) spawnItem(P.x + P.w / 2, P.y, G.cursor.id, left, P.face * 4, -4); G.cursor = null; }
    show(invEl, false); G.mode = 'play'; SND.click(); renderCursor();
    K.reset(); M.left = M.right = false;
  }
  $('invClose').onclick = closeInv;
  function renderInv() {
    invDirty = false;
    for (var i = 0; i < 36; i++) {
      var el = slotEls[i], s = G.inv[i], img = el.firstChild, sp = el.lastChild;
      var src = s ? BW.iconURL(s.id) : '';
      if (img.getAttribute('data-id') !== String(s ? s.id : '')) { img.setAttribute('data-id', s ? s.id : ''); if (src) img.src = src; else img.removeAttribute('src'); }
      img.style.visibility = s ? 'visible' : 'hidden';
      sp.textContent = s && s.n > 1 && G.gm === 'survival' ? s.n : '';
      el.classList.toggle('selected', i === G.sel);
      el.title = s ? BW.itemName(s.id) : '';
    }
    renderCursor();
    if (G.gm === 'survival') renderCraft();
    $('stTable').className = 'station' + (G.nearTable ? ' on' : '');
    $('stFurnace').className = 'station' + (G.nearFurnace ? ' on' : '');
    var pk = bestPick();
    $('invPick').innerHTML = pk.id ? '<img src="' + BW.iconURL(pk.id) + '"> تحفر الآن بـ: <b>' + BW.itemName(pk.id) + '</b>' : 'ليس لديك معول بعد - اصنع واحدًا لتحفر الحجر!';
  }
  function renderCursor() {
    var c = G.cursor;
    if (!c) { curEl.hidden = true; return; }
    curEl.hidden = false;
    curEl.innerHTML = '<img src="' + BW.iconURL(c.id) + '"><span>' + (c.n > 1 ? c.n : '') + '</span>';
  }
  function moveCursorEl(e) {
    if (curEl.hidden) return;
    var r = ui.getBoundingClientRect(), sc = view.scale;
    curEl.style.left = ((e.clientX - r.left) / sc - 24) + 'px';
    curEl.style.top = ((e.clientY - r.top) / sc - 24) + 'px';
  }
  function stationOK(r) { return !r.st || G.gm === 'creative' || (r.st === 'table' ? G.nearTable : G.nearFurnace); }
  function hasIngredients(r, times) { for (var i = 0; i < r.ing.length; i++) if (countItem(r.ing[i][0]) < r.ing[i][1] * (times || 1)) return false; return true; }
  function craft(r, times) {
    var done = 0;
    for (var t = 0; t < (times || 1); t++) {
      if (!stationOK(r) || !hasIngredients(r)) break;
      if (ITEMS[r.out].max === 1 && countItem(r.out) > 0) { tip('لديك ' + BW.itemName(r.out) + ' بالفعل!'); break; }
      r.ing.forEach(function (g) { removeItem(g[0], g[1]); });
      var left = addItem(r.out, r.n);
      if (left) spawnItem(P.x + P.w / 2, P.y, r.out, left, P.face * 3, -4);
      G.stats.craft[r.out] = (G.stats.craft[r.out] || 0) + r.n;
      done++;
    }
    if (done) { SND.craft(); checkQuests(); floatText(P.x + P.w / 2, P.y - 0.3, plusN(r.n * done, BW.itemName(r.out)), '#9cf0b8'); }
    return done;
  }
  function recipeRow(r, idx) {
    var ok = stationOK(r), has = hasIngredients(r), can = ok && has;
    var row = document.createElement('div');
    var qr = questRecipe(), isQuest = qr === r;
    row.className = 'crow' + (can ? ' can' : '') + (isQuest ? ' quest' : '');
    var ing = r.ing.map(function (g) { var have = countItem(g[0]); return '<span class="ing' + (have >= g[1] ? ' ok' : '') + '"><img src="' + BW.iconURL(g[0] === BW.FLOWER ? B.FLOWER_RED : g[0]) + '" title="' + BW.itemName(g[0]) + '"><bdi dir="ltr">' + Math.min(have, 99) + '/' + g[1] + '</bdi></span>'; }).join('');
    var st = r.st ? '<span class="need' + (ok ? ' ok' : '') + '"><img src="' + BW.iconURL(r.st === 'table' ? B.TABLE : B.FURNACE) + '">' + (ok ? '' : 'قف قربه') + '</span>' : '';
    row.innerHTML = '<img class="out" src="' + BW.iconURL(r.out) + '"><div class="cname">' + (isQuest ? '<span class="qtag">★ مهمتك</span>' : '') + BW.itemName(r.out) + (r.n > 1 ? ' <small dir="ltr">×' + r.n + '</small>' : '') + '</div><div class="cing">' + ing + st + '</div><button class="cbtn">' + (can ? 'اصنع' : '') + '</button>';
    row.addEventListener('mousedown', function (e) {
      e.preventDefault();
      if (!can) {
        row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
        SND.bonk();
        if (!ok) tip('قف قرب ' + (r.st === 'table' ? 'طاولة الصنع' : 'الفرن') + ' لتصنع هذا');
        return;
      }
      var n = craft(r, e.shiftKey ? 10 : 1);
      if (n) { renderInv(); var nr = craftEl.querySelector('[data-r="' + idx + '"]'); if (nr) { nr.classList.add('flash'); } }
    });
    row.setAttribute('data-r', idx);
    return row;
  }
  function renderCraft() {
    var st = craftEl.scrollTop;
    craftEl.innerHTML = '';
    var rows = BW.RECIPES.map(function (r, i) { return { r: r, i: i, can: stationOK(r) && hasIngredients(r), has: hasIngredients(r) }; });
    var wool = rows.filter(function (o) { return o.r.cat === 'wool'; }), rest = rows.filter(function (o) { return o.r.cat !== 'wool'; });
    var qr = questRecipe();
    rest.sort(function (a, b) { return ((b.r === qr) - (a.r === qr)) || (b.can - a.can) || (b.has - a.has) || (a.i - b.i); });
    rest.forEach(function (o) { craftEl.appendChild(recipeRow(o.r, o.i)); });
    // wool painter row
    var wr = document.createElement('div');
    wr.className = 'crow woolrow' + (countItem(B.WOOL) && countItem(I.DYE) ? ' can' : '');
    var html = '<img class="out" src="' + BW.iconURL(B.WOOL + 1) + '"><div class="cname">لوّن الصوف<br><small><bdi dir="ltr">1 <img src="' + BW.iconURL(B.WOOL) + '"> + 1 <img src="' + BW.iconURL(I.DYE) + '"></bdi> (لديك <bdi dir="ltr">' + countItem(B.WOOL) + ' / ' + countItem(I.DYE) + '</bdi>)</small></div><div class="swatches">';
    wool.forEach(function (o) { html += '<button data-w="' + o.i + '" style="background:' + BW.WOOL_COLS[o.r.out - B.WOOL] + '" title="' + BW.itemName(o.r.out) + '"></button>'; });
    wr.innerHTML = html + '</div>';
    wr.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('mousedown', function (e) {
        e.preventDefault(); e.stopPropagation();
        var r = BW.RECIPES[+b.getAttribute('data-w')];
        if (!craft(r, e.shiftKey ? 10 : 1)) { SND.bonk(); tip('تحتاج صوفًا أبيض (من الخراف) وصبغة قوس قزح (من الأزهار)'); }
        else renderInv();
      });
    });
    var anchor = craftEl.children[Math.min(craftEl.children.length, 6)];
    craftEl.insertBefore(wr, anchor || null);
    craftEl.scrollTop = st;
  }

  // ----------------------------------------------------------- boot
  var titleWorld = new BW.World(424242);
  titleWorld.generate();
  G.world = titleWorld;
  G.spawn = { x: 250, y: 0 };
  var titleAnimals = spawnAnimals(BW.mulberry(99));
  P = makePlayer(250, 40);
  activeSkinFix();
  toTitle();
  rend.warm(G.cam.x, G.cam.y, VTW, VTH);
  var muteBtn = Kit.muteButton();
  muteBtn.setAttribute('aria-label', 'تشغيل الصوت أو كتمه');
  muteBtn.title = 'الصوت (M)';
  Kit.loop(update, render);
  // Cached HUD panels may have been drawn before the Arabic font finished loading: redraw them once it has.
  try { if (document.fonts && document.fonts.load) document.fonts.load('700 20px Fredoka', 'عالم').then(function () { panelCache = {}; }, function () {}); } catch (e) { /* ignore */ }
  function persist() { if (G.slot && (G.mode === 'play' || G.mode === 'inv' || G.mode === 'pause' || G.mode === 'master')) saveGame(); }
  window.addEventListener('pagehide', persist);
  window.addEventListener('beforeunload', persist);
  document.addEventListener('visibilitychange', function () { if (document.hidden) { persist(); if (G.mode === 'play') pause(); } });

  // Debug hook for automated checks.
  window.__game = {
    G: G, meta: meta,
    get player() { return P; },
    input: M,
    give: function (id, n) { return addItem(id, n || 1); },
    tp: function (x, y) { P.x = x; P.y = y; P.vx = P.vy = 0; },
    setTime: function (t) { G.tod = t; },
    completeAll: function () { questsFor(G.gm).forEach(function (q) { if (!G.done[q.id]) completeQuest(q); }); },
    save: saveGame,
    breakAt: function (x, y) { breakBlock(x, y); },
    placeAt: function (x, y) { return placeBlock(G.sel, x, y); },
    craftId: function (id, n) { var r = BW.RECIPES.filter(function (r) { return r.out === id; })[0]; return r ? craft(r, n || 1) : 0; },
    surfaceY: surfaceY,
    render: function () { render(); }, update: function (dt) { update(dt || 1 / 60); },
    B: B, I: I
  };
})();
