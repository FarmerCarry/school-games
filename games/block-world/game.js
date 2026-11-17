/* Block World — game: physics, auto-tool mining, TNT blasts, cave monsters, quick-craft, quests, saves. */
(function () {
  'use strict';
  var BW = window.BW;
  var B = BW.B, I = BW.I, BLOCKS = BW.BLOCKS, ITEMS = BW.ITEMS, TEX = BW.TEX, W = BW.W, H = BW.H, TS = BW.TS;
  var VW = 1280, VH = 720, VTW = VW / TS, VTH = VH / TS;
  var store = Kit.store('block-world');
  var dda = Kit.dda('block-world', { id: 'adventure', tiers: 3, start: 0.45 });
  var A = Kit.audio, J = Kit.juice, iconURL = BW.iconURL;
  var Mfl = Math.floor, Mmx = Math.max, Mmn = Math.min, Mab = Math.abs, Mrn = Math.round, Mhy = Math.hypot;
  function Mrnd() { return Math.random(); }
  function onEv(t, e, f, o) { t.addEventListener(e, f, o); }

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var AR_RE = /[\u0600-\u06FF]/;
  function dirOf(s) { return AR_RE.test(s) ? 'rtl' : 'ltr'; }
  function ltr(s) { return '\u2066' + s + '\u2069'; }
  function plusN(n, s) { return ltr('+' + n) + ' ' + s; }

  // --------------------------------------------------------------- canvas & artkit
  var canvas = $('game');
  var ui = $('ui');
  var renderDirty = true;
  if (Kit.art && Kit.art.init) Kit.art.init({ canvas: canvas, mode: '2d', theme: 'day' });
  var view = Kit.fit(canvas, VW, VH, {
    smooth: false,
    onResize: function (v) {
      var r = canvas.style;
      ui.style.left = r.left; ui.style.top = r.top;
      ui.style.transform = 'scale(' + v.scale + ')';
      renderDirty = true;
    }
  });
  onEv(canvas, 'contextrestored', function () { view.resize(); renderDirty = true; });
  var shake = Kit.shake();

  // Populate static icons in index.html
  $('icSurv').src = iconURL(I.PICK_DIAMOND);
  $('icCrea').src = iconURL(B.TNT);
  $('icTable').src = iconURL(B.TABLE);
  $('icFurn').src = iconURL(B.FURNACE);

  // ---------------------------------------------------------------- input
  var M = { x: VW / 2, y: VH / 2, left: false, right: false, lp: false, rp: false, wheel: 0, realClick: false };
  onEv(canvas, 'mousedown', function (e) {
    A.unlock();
    var l = view.toLogical(e.clientX, e.clientY);
    M.x = l.x; M.y = l.y;
    if (e.button === 0) { M.left = true; M.lp = true; M.realClick = true; }
    if (e.button === 2) { M.right = true; M.rp = true; }
  });
  onEv(window, 'mouseup', function (e) {
    if (e.button === 0) M.left = false;
    if (e.button === 2) M.right = false;
  });
  onEv(window, 'mousemove', function (e) {
    var l = view.toLogical(e.clientX, e.clientY);
    M.x = l.x; M.y = l.y;
    moveCursorEl(e);
  });
  onEv(canvas, 'wheel', function (e) { e.preventDefault(); M.wheel += e.deltaY > 0 ? 1 : -1; }, { passive: false });
  var K = Kit.keys;
  function kd(c) { return K.anyDown(c); }
  function kp(c) { return K.anyPressed(c); }
  var LEFT = ['KeyA', 'ArrowLeft'], RIGHT = ['KeyD', 'ArrowRight'], UP = ['KeyW', 'ArrowUp'], JUMP = ['Space', 'KeyW', 'ArrowUp'], DOWN = ['KeyS', 'ArrowDown', 'ShiftLeft'];

  // --------------------------------------------------------- crisp one-shot SFX (ZERO BGM!)
  function hitNz(f, dur, vol, to) { A.noise({ dur: dur, vol: vol, filter: f, to: to || f * 0.7 }); }
  function tone(f, to, dur, vol, type, delay) {
    A.tone({ freq: f * (0.96 + Mrnd() * 0.08), to: to, dur: dur, vol: vol, type: type || 'triangle', delay: delay || 0 });
  }
  var SND = {
    mat: function (mat, v) {
      v = v || 1;
      if (mat === 'stone') { hitNz(1600, 0.06, 0.35 * v); tone(250, 175, 0.045, 0.12 * v); }
      else if (mat === 'wood') { tone(280, 195, 0.065, 0.22 * v); hitNz(900, 0.045, 0.22 * v); }
      else if (mat === 'glass' || mat === 'metal') { tone(1200, 920, 0.06, 0.12 * v, 'sine'); hitNz(2800, 0.03, 0.18 * v); }
      else if (mat === 'leaf' || mat === 'wool') { hitNz(1500, 0.065, 0.24 * v); }
      else { hitNz(680, 0.075, 0.34 * v); tone(155, 90, 0.06, 0.15 * v); }
    },
    brk: function (mat) { SND.mat(mat, 1.3); J.pop(0.5); },
    place: function (mat) { tone(165, 95, 0.07, 0.22); SND.mat(mat, 0.7); },
    pickup: function (combo) { J.coin(Mmn(5, 1 + (combo >> 1))); },
    step: function (mat) { hitNz(mat === 'stone' ? 1100 : 520, 0.035, 0.12); },
    jump: function () { J.jump(0.55); },
    spring: function () { tone(260, 980, 0.22, 0.25, 'sine'); tone(520, 1320, 0.16, 0.14, 'triangle', 0.05); },
    jet: function () { hitNz(1400, 0.18, 0.35, 350); tone(240, 620, 0.14, 0.15, 'sawtooth'); },
    land: function (v) { J.land(v); },
    craft: function () { J.chime(2); },
    quest: function () { J.levelUp(); },
    bonk: function () { J.error(); },
    click: function () { J.tap(); },
    door: function () { tone(320, 210, 0.07, 0.16); },
    grow: function () { J.star(2); },
    timber: function () { hitNz(650, 0.35, 0.45, 140); tone(210, 65, 0.32, 0.24); },
    fuse: function () { hitNz(3200, 0.16, 0.25, 1800); tone(620, 920, 0.09, 0.12, 'sine'); },
    boom: function () { J.impact(1); hitNz(1100, 0.52, 0.55, 65); tone(120, 38, 0.38, 0.35, 'sawtooth'); },
    chest: function () { J.chime(3); [523, 659, 784, 1047].forEach(function (f, i) { tone(f, f * 1.02, 0.13, 0.18, 'triangle', i * 0.06); }); },
    slime: function () { tone(360, 680, 0.11, 0.16, 'sine'); },
    pet: function (type) {
      if (type === 'pig') { tone(240, 175, 0.1, 0.14, 'sawtooth'); tone(260, 185, 0.1, 0.14, 'sawtooth', 0.12); }
      else if (type === 'chicken') { tone(940, 640, 0.05, 0.1, 'square'); tone(1100, 700, 0.06, 0.1, 'square', 0.08); }
      else { tone(430, 390, 0.09, 0.12, 'sawtooth'); tone(420, 380, 0.1, 0.12, 'sawtooth', 0.09); }
    }
  };

  // --------------------------------------------------- difficulty & game state
  var DIFF_CFG = {
    easy: { label: '🌟 سهل', desc: 'حفر فائق السرعة · مغناطيس واسع للموارد · كهوف لطيفة ومضيئة!', mine: 1.42, mag: 4.3, amb: 0.24, mobs: 0, tier: 1 },
    normal: { label: '⚔️ متوسط', desc: 'مغامرة متوازنة مع سلايم الكهوف وغرف الكنز والمتفجرات!', mine: 1.12, mag: 2.9, amb: 0.12, mobs: 1, tier: 2 },
    hero: { label: '🔥 بطل', desc: 'وحوش كهوف أسرع · غرف كنز عميقة · تحدي ملك السلايم العملاق!', mine: 1.0, mag: 2.5, amb: 0.09, mobs: 2, tier: 3 }
  };

  var meta = store.get('meta', null);
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) meta = {};
  if (!Array.isArray(meta.slots) || meta.slots.length !== 3) meta.slots = [null, null, null];
  meta.totalStars = meta.totalStars || 0;
  meta.skin = meta.skin || 0;
  meta.lastSlot = meta.lastSlot || 1;
  meta.diff = DIFF_CFG[meta.diff] ? meta.diff : 'normal';
  function saveMeta() { return store.set('meta', meta); }

  var G = {
    mode: 'title', slot: 0, gm: 'survival', diff: meta.diff, name: '', world: null, rend: null,
    inv: [], sel: 0, cursor: null, stats: null, done: {}, tod: 0.12, time: 0, play: 0,
    animals: [], mobs: [], fuses: [], items: [], saplings: [],
    cam: { x: 140, y: 42 }, spawn: { x: BW.SPAWN_X, y: 50 },
    hint: null, toasts: [], banner: null, lastBiome: '', lastZone: '',
    saveT: 0, savedFlash: 0, saveError: null,
    nearTable: false, nearFurnace: false,
    masterShown: false, masterPending: false, questT: 0,
    selPop: 0, selName: 0, openDoors: {}, titleT: 0
  };
  var P = null, rend = null;

  function diffCfg() { return DIFF_CFG[G.diff] || DIFF_CFG.normal; }
  function newStats() {
    return { got: {}, craft: {}, placed: {}, mined: {}, sheared: 0, pets: 0, blasts: 0, chests: 0, bounces: 0, mobsDefeated: 0, maxDepth: 0, placedTotal: 0, biomes: {}, flew: 0, highestPlace: 999 };
  }
  function questsFor(gm) { return gm === 'creative' ? BW.QUESTS_CREATIVE : BW.QUESTS_SURVIVAL; }
  function starCount() { var qs = questsFor(G.gm), n = 0; for (var i = 0; i < qs.length; i++) if (G.done[qs[i].id]) n++; return n; }

  // ---------------------------------------------------------- inventory & tools
  var invDirty = true, quickDirty = true;
  var slotBump = new Float32Array(36);
  function bumpSlot(i) { slotBump[i] = 1; }
  function emptyInv() { var a = []; for (var i = 0; i < 36; i++) a.push(null); return a; }

  function addItem(id, n) {
    var inv = G.inv, mx = BW.maxStack(id), i;
    for (i = 0; i < 36 && n > 0; i++) {
      var s = inv[i];
      if (s && s.id === id && s.n < mx) { var k = Mmn(n, mx - s.n); s.n += k; n -= k; bumpSlot(i); }
    }
    for (i = 0; i < 36 && n > 0; i++) {
      if (!inv[i]) { var k2 = Mmn(n, mx); inv[i] = { id: id, n: k2 }; n -= k2; bumpSlot(i); }
    }
    invDirty = true; quickDirty = true;
    return n;
  }
  function matches(id, want) { return want === BW.FLOWER ? (id === B.FLOWER_RED || id === B.FLOWER_YELLOW || id === B.FLOWER_BLUE) : id === want; }
  function countItem(want) {
    var n = 0;
    for (var i = 0; i < 36; i++) { var s = G.inv[i]; if (s && matches(s.id, want)) n += s.n; }
    return n;
  }
  function hasJetBoots() {
    if (G.gm === 'creative') return true;
    for (var i = 0; i < 36; i++) if (G.inv[i] && G.inv[i].id === I.JET_BOOTS) return true;
    return false;
  }
  function removeItem(want, n) {
    for (var i = 35; i >= 0 && n > 0; i--) {
      var s = G.inv[i];
      if (s && matches(s.id, want)) { var k = Mmn(n, s.n); s.n -= k; n -= k; if (s.n <= 0) G.inv[i] = null; }
    }
    invDirty = true; quickDirty = true;
  }
  // Auto-Best-Tool: always applies the fastest pickaxe anywhere in the 36-slot backpack!
  function bestPick() {
    if (G.gm === 'creative') return { tool: 9, speed: 32, id: I.PICK_DIAMOND };
    var best = { tool: 0, speed: 1.0, id: 0 };
    for (var i = 0; i < 36; i++) {
      var s = G.inv[i];
      if (s) {
        var it = ITEMS[s.id];
        if (it && it.tool && it.tool > best.tool) best = { tool: it.tool, speed: it.speed, id: s.id };
      }
    }
    return best;
  }
  var PICK_NAMES = [null, 'معول خشبي', 'معول حجري', 'معول حديدي'];

  // ---------------------------------------------------------- particles & text
  var PMAX = 420, parts = [], pNext = 0;
  for (var pi = 0; pi < PMAX; pi++) parts.push({ on: false });
  function part(x, y, vx, vy, life, size, col, g, kind) {
    var p = parts[pNext]; pNext = (pNext + 1) % PMAX;
    p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life; p.size = size; p.col = col;
    p.g = g == null ? 30 : g; p.kind = kind || 0;
    return p;
  }
  function burst(x, y, cols, n, spd, size) {
    if (Kit.motion.reduced()) return;
    for (var i = 0; i < n; i++) {
      var a = Mrnd() * Math.PI * 2, s = spd * (0.35 + Mrnd() * 0.65);
      part(x, y, Math.cos(a) * s, Math.sin(a) * s - spd * 0.35, 0.45 + Mrnd() * 0.4, size * (0.65 + Mrnd() * 0.55), cols[i % cols.length], 32);
    }
  }
  function hearts(x, y) {
    if (Kit.motion.reduced()) return;
    for (var i = 0; i < 4; i++) part(x + (Mrnd() - 0.5) * 0.8, y, (Mrnd() - 0.5) * 1.4, -2 - Mrnd() * 1.3, 1.0, 1, '#ff5a8a', -1, 1);
  }
  var texts = [];
  function floatText(x, y, s, col, big, key, n) {
    if (key) {
      for (var i = texts.length - 1; i >= 0; i--) {
        var t = texts[i];
        if (t.key === key && t.life > 0.65) { t.n += n; t.s = plusN(t.n, s); t.life = 1.25; t.pop = 1; return; }
      }
    }
    if (texts.length > 22) texts.shift();
    texts.push({ x: x, y: y, s: key ? plusN(n, s) : s, col: col || '#fff', life: 1.25, max: 1.25, big: big, key: key, n: n || 0, pop: 1 });
  }
  var confetti = [];
  function confettiBurst() {
    if (Kit.motion.reduced()) return;
    var cols = ['#ffcc00', '#ff5470', '#3ddc84', '#4cc9f0', '#c77dff', '#ffffff'];
    for (var i = 0; i < 80; i++) {
      confetti.push({ x: VW / 2 + (Mrnd() - 0.5) * 320, y: 120, vx: (Mrnd() - 0.5) * 700, vy: -220 - Mrnd() * 380, r: Mrnd() * 6, vr: (Mrnd() - 0.5) * 12, col: cols[i % cols.length], life: 2.2 + Mrnd() * 0.8 });
    }
    if (confetti.length > 220) confetti.splice(0, confetti.length - 220);
  }
  Kit.motion.onChange(function (reduced) { if (reduced) { confetti.length = 0; renderDirty = true; } });
  function tip(s, dur) { G.hint = { s: s, t: dur || 3.2 }; renderDirty = true; }

  // -------------------------------------------------------------- physics
  function makeBody(x, y, w, h) { return { x: x, y: y, w: w, h: h, vx: 0, vy: 0, onGround: false, stepOff: 0 }; }
  function boxHits(x, y, w, h, animal) {
    var wd = G.world, x0 = Mfl(x), x1 = Mfl(x + w - 1e-6), y0 = Mfl(y), y1 = Mfl(y + h - 1e-6);
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
      if (tx < 0 || tx >= W || ty >= H) return true;
      if (ty < 0) continue;
      var d = BLOCKS[wd.tiles[ty * W + tx]];
      if (d && (d.solid || (animal && d.animalSolid))) return true;
    }
    return false;
  }
  function moveX(e, dx, animal) {
    if (!dx) return false;
    var nx = e.x + dx;
    if (!boxHits(nx, e.y, e.w, e.h, animal)) { e.x = nx; return false; }
    // Auto step-up 1-block ledges smoothly!
    if (e.onGround && !boxHits(nx, e.y - 1, e.w, e.h, animal) && !boxHits(e.x, e.y - 1, e.w, e.h, animal)) {
      var ny = Mfl(e.y + e.h - 1e-6) - e.h;
      e.stepOff = Mmn(1, (e.stepOff || 0) + (e.y - ny));
      e.y = ny; e.x = nx;
      return false;
    }
    if (dx > 0) e.x = Mfl(nx + e.w - 1e-6) - e.w;
    else e.x = Mfl(nx) + 1;
    e.vx = 0;
    return true;
  }
  function moveY(e, dy, animal) {
    e.onGround = false;
    if (!dy) {
      e.onGround = boxHits(e.x, e.y + 0.02, e.w, e.h, animal);
      return false;
    }
    var ny = e.y + dy;
    if (!boxHits(e.x, ny, e.w, e.h, animal)) { e.y = ny; return false; }
    if (dy > 0) {
      e.y = Mfl(ny + e.h - 1e-6) - e.h;
      e.onGround = true;
    } else {
      e.y = Mfl(ny) + 1;
    }
    return true;
  }

  // -------------------------------------------------------------- player
  var flyTap = 0;
  function makePlayer(x, y) {
    var p = makeBody(x, y, 0.72, 1.75);
    p.face = 1; p.walk = 0; p.walkAmt = 0; p.sx = 1; p.sy = 1;
    p.coyote = 0; p.jbuf = 0; p.flying = false; p.climbing = false;
    p.swingT = 0; p.blink = 0; p.blinkT = 2; p.hurtT = 0; p.jetUsed = false; p.jetT = 0; p.springCD = 0;
    return p;
  }
  function surfaceY(x) {
    x = clamp(Mfl(x), 0, W - 1);
    var t = G.world.tiles;
    for (var y = 0; y < H; y++) {
      var d = BLOCKS[t[y * W + x]];
      if (d && (d.solid || d.liquid)) return y;
    }
    return H - 1;
  }
  function spawnPoint() {
    var sx = clamp(G.spawn.x, 12, W - 12);
    for (var dx = 0; dx < 16; dx++) {
      var x = sx + (dx % 2 ? -((dx + 1) >> 1) : (dx >> 1));
      var y = surfaceY(x);
      if (G.world.get(x, y) !== B.WATER && !boxHits(x + 0.14, y - 1.76, 0.72, 1.75, false)) {
        return { x: x + 0.14, y: y - 1.76 };
      }
    }
    return { x: sx + 0.14, y: G.world.surf[sx] - 1.76 };
  }

  function updatePlayer(dt, controls) {
    var p = P, wd = G.world;
    if (p.hurtT > 0) p.hurtT = Mmx(0, p.hurtT - dt);
    if (p.jetT > 0) p.jetT = Mmx(0, p.jetT - dt);
    if (p.springCD > 0) p.springCD = Mmx(0, p.springCD - dt);
    if (flyTap > 0) flyTap -= dt;

    var dir = controls ? (kd(RIGHT) ? 1 : 0) - (kd(LEFT) ? 1 : 0) : 0;
    if (dir) p.face = dir;

    // Creative double-Space flight toggle
    if (controls && G.gm === 'creative' && K.pressed('Space')) {
      if (flyTap > 0) {
        p.flying = !p.flying; p.vy = 0; flyTap = 0;
        if (p.flying) { G.stats.flew = 1; SND.jet(); burst(p.x + p.w / 2, p.y + p.h, ['#4cc9f0', '#ffffff'], 10, 5, 0.16); }
      } else flyTap = 0.30;
    }

    var cx = p.x + p.w / 2, cy = p.y + p.h * 0.5;
    var inWater = wd.get(Mfl(cx), Mfl(cy)) === B.WATER || wd.get(Mfl(cx), Mfl(p.y + p.h - 0.1)) === B.WATER;
    var onLadder = BLOCKS[wd.get(Mfl(cx), Mfl(cy))].climb || BLOCKS[wd.get(Mfl(cx), Mfl(p.y + p.h - 0.1))].climb;
    p.climbing = !p.flying && onLadder;

    if (p.flying) {
      var flySpd = 12.5;
      p.vx += (dir * flySpd - p.vx) * Mmn(1, 12 * dt);
      var vdir = controls ? (kd(JUMP) ? -1 : 0) + (kd(DOWN) ? 1 : 0) : 0;
      p.vy += (vdir * flySpd - p.vy) * Mmn(1, 12 * dt);
    } else if (p.climbing) {
      p.vx += (dir * 6.5 - p.vx) * Mmn(1, 14 * dt);
      p.vy = controls ? (kd(JUMP) ? -6.5 : kd(DOWN) ? 6.5 : 0) : 0;
      p.jetUsed = false;
    } else if (inWater) {
      p.vx += (dir * 5.6 - p.vx) * Mmn(1, 10 * dt);
      p.vy += 12 * dt;
      if (controls && kd(JUMP)) p.vy = -6.8;
      p.vy = clamp(p.vy, -8, 6);
      p.jetUsed = false;
    } else {
      var maxSpd = 8.4;
      p.vx += (dir * maxSpd - p.vx) * Mmn(1, (p.onGround ? 18 : 11) * dt);
      if (p.onGround) { p.coyote = 0.12; p.jetUsed = false; }
      else p.coyote = Mmx(0, p.coyote - dt);

      if (controls && kp(JUMP)) p.jbuf = 0.13;
      else p.jbuf = Mmx(0, p.jbuf - dt);

      if (p.jbuf > 0 && p.coyote > 0) {
        p.vy = -13.2; p.onGround = false; p.coyote = 0; p.jbuf = 0;
        p.sx = 0.82; p.sy = 1.2;
        SND.jump();
      } else if (controls && kp(JUMP) && !p.onGround && !p.jetUsed && hasJetBoots()) {
        // Rocket Jet Boots mid-air boost!
        p.jetUsed = true; p.jetT = 0.36; p.vy = -14.4;
        p.sx = 0.8; p.sy = 1.24;
        SND.jet();
        burst(cx, p.y + p.h, ['#ff9f1c', '#ffe66d', '#00f5d4'], 14, 6, 0.18);
      }
      p.vy = Mmn(28, p.vy + 34 * dt);
    }

    // Hotbar number keys & scroll wheel in play mode
    if (controls) {
      for (var n = 1; n <= 9; n++) {
        if (K.pressed('Digit' + n)) { G.sel = n - 1; G.selPop = 1; G.selName = 1.8; SND.click(); renderDirty = true; }
      }
      if (M.wheel) {
        G.sel = ((G.sel + (M.wheel > 0 ? 1 : -1)) % 9 + 9) % 9;
        G.selPop = 1; G.selName = 1.8; SND.click(); renderDirty = true;
      }
    }

    var beforeVy = p.vy;
    moveX(p, p.vx * dt, false);
    var hitY = moveY(p, p.vy * dt, false);
    if (hitY) {
      if (beforeVy > 0) {
        // Check Spring Pad block directly beneath feet!
        var footTile = wd.get(Mfl(p.x + p.w / 2), Mfl(p.y + p.h + 0.08));
        if (footTile === B.SPRING && p.springCD <= 0 && !kd(DOWN)) {
          p.vy = -21.5; p.onGround = false; p.jetUsed = false; p.springCD = 0.18;
          p.sx = 0.72; p.sy = 1.35;
          G.stats.bounces = (G.stats.bounces || 0) + 1;
          SND.spring(); shake.add(3);
          burst(p.x + p.w / 2, p.y + p.h, ['#00f5d4', '#ffd60a', '#ffffff'], 16, 7, 0.2);
          floatText(p.x + p.w / 2, p.y - 0.3, 'قفزة خارقة! 🚀', '#00f5d4');
        } else {
          if (beforeVy > 13 && !p.flying) {
            var lv = Mmn(1, beforeVy / 26);
            p.sx = 1 + 0.3 * lv; p.sy = 1 - 0.3 * lv;
            SND.land(lv);
          }
          if (p.flying) p.flying = false;
          p.vy = 0;
        }
      } else {
        p.vy = 0;
      }
    }
    if (p.y < -6) { p.y = -6; p.vy = 0; }

    p.sx += (1 - p.sx) * Mmn(1, 12 * dt);
    p.sy += (1 - p.sy) * Mmn(1, 12 * dt);
    p.stepOff *= Math.pow(0.0001, dt);
    if (Mab(p.stepOff) < 0.01) p.stepOff = 0;

    var moving = Mab(p.vx) > 0.4 && (p.onGround || p.climbing);
    p.walkAmt += ((moving ? 1 : 0) - p.walkAmt) * Mmn(1, 10 * dt);
    if (moving) {
      var prevStep = Mfl(p.walk / Math.PI);
      p.walk += Mab(p.vx) * dt * 2.2;
      if (Mfl(p.walk / Math.PI) !== prevStep && G.mode === 'play') {
        var uBlk = BLOCKS[wd.get(Mfl(p.x + p.w / 2), Mfl(p.y + p.h + 0.05))];
        if (p.onGround && uBlk && uBlk.mat) SND.step(uBlk.mat);
      }
    }
    p.blinkT -= dt;
    if (p.blinkT < 0) { p.blink = 0.12; p.blinkT = 2.2 + Mrnd() * 2.8; }
    if (p.blink > 0) p.blink -= dt;
    p.swingT = Mmx(0, p.swingT - dt);
  }

  // ------------------------------------------------ animals & cave monsters
  var ANIMAL_SIZE = { pig: [0.9, 0.95], sheep: [0.95, 1.05], chicken: [0.55, 0.85] };
  function makeAnimal(type, x, y) {
    var s = ANIMAL_SIZE[type] || ANIMAL_SIZE.sheep;
    var a = makeBody(x - s[0] / 2, y - s[1], s[0], s[1]);
    a.type = type; a.dir = 0; a.face = Mrnd() < 0.5 ? -1 : 1;
    a.timer = 1 + Mrnd() * 3; a.walk = 0; a.walkAmt = 0;
    a.sheared = false; a.regrow = 0; a.petCD = 0;
    return a;
  }
  function spawnAnimals(rnd) {
    var list = [], wd = G.world;
    function tryAt(x, type) {
      x = clamp(Mfl(x), 6, W - 6);
      var y = surfaceY(x), id = wd.get(x, y);
      if ((id !== B.GRASS && id !== B.SNOW_GRASS) || wd.get(x, y - 1) !== B.AIR) return false;
      list.push(makeAnimal(type, x + 0.5, y));
      return true;
    }
    tryAt(G.spawn.x + 5, 'sheep') || tryAt(G.spawn.x + 6, 'sheep');
    tryAt(G.spawn.x - 9, 'pig') || tryAt(G.spawn.x - 10, 'pig');
    tryAt(G.spawn.x + 12, 'chicken');
    var types = ['sheep', 'pig', 'chicken'];
    for (var i = 0; i < 18; i++) {
      var rx = 25 + Mfl(rnd() * (W - 50));
      if (Mab(rx - G.spawn.x) > 14) tryAt(rx, types[i % 3]);
    }
    return list;
  }
  function updateAnimal(a, dt) {
    a.timer -= dt;
    if (a.petCD > 0) a.petCD -= dt;
    if (a.sheared) { a.regrow -= dt; if (a.regrow <= 0) a.sheared = false; }
    if (a.timer <= 0) {
      a.dir = Mrnd() < 0.45 ? 0 : (Mrnd() < 0.5 ? -1 : 1);
      if (a.dir) a.face = a.dir;
      a.timer = 1.2 + Mrnd() * 2.8;
    }
    a.vx = a.dir * 1.6;
    a.vy = Mmn(22, a.vy + 30 * dt);
    var blocked = moveX(a, a.vx * dt, true);
    if (blocked && a.onGround) a.vy = -8.5;
    moveY(a, a.vy * dt, true);
    if (a.dir) a.walk += dt * 6;
  }
  function petAnimal(a) {
    if (a.petCD > 0) return;
    a.petCD = 0.5;
    a.vy = -6.5;
    G.stats.pets = (G.stats.pets || 0) + 1;
    SND.pet(a.type);
    hearts(a.x + a.w / 2, a.y);
    if (a.type === 'sheep' && !a.sheared && G.gm === 'survival') {
      a.sheared = true; a.regrow = 35;
      G.stats.sheared = (G.stats.sheared || 0) + 1;
      spawnItem(a.x + a.w / 2, a.y, B.WOOL, 1 + (Mrnd() < 0.4 ? 1 : 0), (Mrnd() - 0.5) * 3, -4);
      floatText(a.x + a.w / 2, a.y - 0.3, '+صوف ناعم!', '#fff8d6');
    } else {
      floatText(a.x + a.w / 2, a.y - 0.3, '♥ صديق أليف!', '#ff8fc8');
    }
  }

  // Underground Cave Monsters (Bouncy Crystal Slimes, Robo-Moles & Boss Slime)
  function makeMob(type, x, y) {
    var isBoss = type === 'boss';
    var w = isBoss ? 1.55 : 0.92, h = isBoss ? 1.45 : 0.92;
    var m = makeBody(x - w / 2, y - h, w, h);
    m.type = type; m.face = 1; m.hp = isBoss ? 5 : (type === 'mole' ? 2 : 1);
    m.maxHp = m.hp; m.hopT = 0.6 + Mrnd() * 1.2; m.hurtT = 0; m.sq = 0; m.bob = Mrnd() * 6;
    return m;
  }
  function spawnMobs(rnd) {
    var list = [], wd = G.world;
    if (!wd.vaults) return list;
    for (var i = 0; i < wd.vaults.length; i++) {
      var v = wd.vaults[i];
      var mx = v.x + 2 + Mfl(rnd() * 5), my = v.y + v.h - 1;
      var tp = (v.tier === 2 && G.diff === 'hero') ? 'boss' : (i % 3 === 1 ? 'mole' : 'slime');
      list.push(makeMob(tp, mx + 0.5, my));
    }
    // Extra playful cave slimes in open caverns
    for (var k = 0; k < 14; k++) {
      var cx = 20 + Mfl(rnd() * (W - 40));
      var cy = Mmx(wd.surf[cx] + 14, 72) + Mfl(rnd() * 48);
      if (cy < H - 5 && wd.get(cx, cy) === B.AIR && wd.solid(cx, cy + 1)) {
        list.push(makeMob(k % 4 === 0 ? 'mole' : 'slime', cx + 0.5, cy + 1));
      }
    }
    return list;
  }
  function damageMob(m, idx, dmg) {
    m.hp -= dmg; m.hurtT = 0.28; m.vy = -6.5; m.sq = -0.25;
    SND.slime();
    burst(m.x + m.w / 2, m.y + m.h / 2, ['#3bf6ee', '#c77dff', '#ffd60a'], 10, 5, 0.18);
    if (m.hp <= 0) {
      var cx = m.x + m.w / 2, cy = m.y + m.h / 2;
      G.mobs.splice(idx, 1);
      G.stats.mobsDefeated = (G.stats.mobsDefeated || 0) + 1;
      if (G.saveError === null) dda.result(true);
      shake.add(m.type === 'boss' ? 8 : 4);
      burst(cx, cy, ['#00f5d4', '#ff4d94', '#ffd60a', '#ffffff'], m.type === 'boss' ? 26 : 14, 7, 0.22);
      spawnItem(cx, cy, I.SLIME_GEL, m.type === 'boss' ? 4 : 1 + (Mrnd() < 0.5 ? 1 : 0));
      if (m.type === 'mole') spawnItem(cx, cy, Mrnd() < 0.5 ? B.IRON_ORE : I.COAL, 2);
      if (m.type === 'boss') {
        spawnItem(cx, cy, I.DIAMOND, 2);
        spawnItem(cx, cy, I.RUBY, 2);
        spawnItem(cx, cy, B.TNT, 3);
        floatText(cx, cy - 0.5, 'هزمت ملك السلايم! 👑', '#ffd60a', true);
        SND.chest();
      } else {
        floatText(cx, cy - 0.3, '+جل مشع!', '#3bf6ee');
      }
    }
  }
  function updateMobs(dt) {
    if (G.gm === 'creative') return;
    var cfg = diffCfg(), aggro = cfg.mobs; // 0=friendly easy, 1=normal, 2=hero
    var spdMul = aggro === 2 ? 1.32 : 1.0;
    for (var i = G.mobs.length - 1; i >= 0; i--) {
      var m = G.mobs[i];
      var dx = (P.x + P.w / 2) - (m.x + m.w / 2), dy = (P.y + P.h / 2) - (m.y + m.h / 2);
      if (Mab(dx) > 36 || Mab(dy) > 26) continue;
      if (m.hurtT > 0) m.hurtT -= dt;
      m.sq *= Math.pow(0.01, dt);
      m.face = dx >= 0 ? 1 : -1;

      if (m.type === 'mole') {
        var chase = aggro > 0 && Mab(dx) < 11 && Mab(dy) < 5;
        m.vx = (chase ? m.face * 2.8 : m.face * 1.2) * spdMul;
        var hitWall = moveX(m, m.vx * dt, true);
        if (hitWall) { if (m.onGround) m.vy = -8.8; else m.face = -m.face; }
      } else {
        m.hopT -= dt * spdMul;
        if (m.hopT <= 0 && m.onGround) {
          m.hopT = 0.85 + Mrnd() * 0.7;
          var dir = (aggro > 0 && Mab(dx) < 12) ? (dx >= 0 ? 1 : -1) : (Mrnd() < 0.5 ? -1 : 1);
          m.face = dir;
          m.vx = dir * (m.type === 'boss' ? 4.4 : 3.5) * spdMul;
          m.vy = m.type === 'boss' ? -11.5 : -9.8;
          m.sq = 0.28;
          if (G.mode === 'play' && Mab(dx) < 14) SND.slime();
        }
        if (m.onGround) m.vx *= Math.pow(0.002, dt);
        moveX(m, m.vx * dt, true);
      }
      m.vy = Mmn(24, m.vy + 30 * dt);
      moveY(m, m.vy * dt, true);

      // Player <-> Mob interaction!
      var overlap = P.x + P.w > m.x + 0.08 && P.x < m.x + m.w - 0.08 && P.y + P.h > m.y + 0.08 && P.y < m.y + m.h - 0.08;
      if (overlap) {
        var stomp = P.vy > 1.2 && (P.y + P.h - P.vy * dt) <= m.y + m.h * 0.58;
        if (stomp || aggro === 0) {
          P.vy = -13.8; P.jetUsed = false; P.sx = 0.8; P.sy = 1.22;
          damageMob(m, i, 1);
        } else if (P.hurtT <= 0 && m.hurtT <= 0) {
          // Non-lethal playful boing knockback in normal/hero!
          P.hurtT = 1.05;
          P.vx = (dx >= 0 ? 1 : -1) * 9.5;
          P.vy = -8.5;
          shake.add(5); SND.bonk();
          if (G.saveError === null) dda.result(false);
          floatText(P.x + P.w / 2, P.y - 0.3, 'اقفز فوق الوحش أو اضربه بالمعول! ⚔️', '#ffd60a');
        }
      }
    }
  }

  // ------------------------------------------------ items, chests & TNT blasts
  var pickupCombo = 0, pickupComboT = 0;
  function spawnItem(x, y, id, n, vx, vy) {
    if (!id || !ITEMS[id] || n <= 0) return;
    G.items.push({
      id: id, n: n, x: x, y: y,
      vx: vx != null ? vx : (Mrnd() - 0.5) * 4.2,
      vy: vy != null ? vy : -3.4 - Mrnd() * 2.2,
      age: 0, delay: 0.22, bob: Mrnd() * 6.28
    });
  }
  function updateItems(dt) {
    if (pickupComboT > 0) pickupComboT -= dt; else pickupCombo = 0;
    var mag = diffCfg().mag;
    var px = P.x + P.w / 2, py = P.y + P.h * 0.55;
    for (var i = G.items.length - 1; i >= 0; i--) {
      var it = G.items[i];
      it.age += dt;
      if (it.age > 300) { G.items.splice(i, 1); continue; }
      if (it.delay > 0) it.delay = Mmx(0, it.delay - dt);
      it.vy = Mmn(18, it.vy + 26 * dt);

      var dx = px - it.x, dy = py - it.y, dist = Mhy(dx, dy);
      if (it.delay <= 0 && dist < mag) {
        var canTake = false, mx = BW.maxStack(it.id);
        for (var s = 0; s < 36; s++) {
          if (!G.inv[s] || (G.inv[s].id === it.id && G.inv[s].n < mx)) { canTake = true; break; }
        }
        if (canTake) {
          var pull = (1 - dist / mag) * 16 + 5;
          it.vx += (dx / (dist || 1)) * pull * dt * 8;
          it.vy += (dy / (dist || 1)) * pull * dt * 8;
        }
      }

      var nx = it.x + it.vx * dt;
      if (!G.world.solid(Mfl(nx), Mfl(it.y))) it.x = nx; else it.vx *= -0.4;
      var ny = it.y + it.vy * dt;
      if (!G.world.solid(Mfl(it.x), Mfl(ny + 0.25))) it.y = ny;
      else { it.y = Mfl(ny + 0.25) - 0.25; it.vy = 0; it.vx *= Math.pow(0.01, dt); }

      if (it.delay <= 0 && Mab(px - it.x) < 0.85 && Mab(py - it.y) < 1.15) {
        var before = it.n;
        var left = addItem(it.id, it.n);
        var got = before - left;
        if (got > 0) {
          G.stats.got[it.id] = (G.stats.got[it.id] || 0) + got;
          if (G.gm === 'survival' && !G.done.logs && (G.stats.got[B.LOG] || 0) >= 4) Kit.stats.tutorial('done');
          pickupCombo = Mmn(12, pickupCombo + 1); pickupComboT = 1.1;
          SND.pickup(pickupCombo);
          floatText(px, P.y - 0.3, BW.itemName(it.id), '#ffe066', false, 'pk_' + it.id, got);
          renderDirty = true;
        }
        if (left <= 0) G.items.splice(i, 1);
        else it.n = left;
      }
    }
  }

  function openChest(tx, ty) {
    var wd = G.world;
    if (wd.get(tx, ty) !== B.CHEST) return;
    wd.set(tx, ty, B.AIR);
    wd.relight(tx - 14, tx + 14);
    rend.markTile(tx, ty);
    G.stats.chests = (G.stats.chests || 0) + 1;
    SND.chest(); shake.add(4);
    burst(tx + 0.5, ty + 0.5, ['#ffd60a', '#4ef6ec', '#ff4d94', '#ffffff'], 22, 7, 0.22);
    floatText(tx + 0.5, ty - 0.3, 'كنز مخفي! ✨', '#ffd60a', true);

    var surf = wd.surf[clamp(tx, 0, W - 1)];
    var loot;
    if (ty < surf + 6) {
      loot = [[B.TORCH, 6], [B.TNT, 3], [B.SPRING, 2]];
      if (G.diff === 'easy' && bestPick().tool === 0) loot.push([I.PICK_WOOD, 1]);
    } else if (ty < 92) {
      loot = [[B.TNT, 4], [B.TORCH, 6], [I.COPPER_INGOT, 2], [I.IRON_INGOT, 2], [I.SLIME_GEL, 2]];
    } else if (ty < 112) {
      loot = [[B.TNT, 4], [B.SPRING, 2], [I.IRON_INGOT, 3], [I.GOLD_INGOT, 2], [I.RUBY, 2]];
    } else {
      loot = [[B.TNT, 5], [I.DIAMOND, 2], [I.RUBY, 2], [I.GOLD_INGOT, 3], [B.LANTERN, 2]];
    }
    for (var i = 0; i < loot.length; i++) {
      spawnItem(tx + 0.5, ty + 0.3, loot[i][0], loot[i][1], (i - loot.length / 2) * 2.2, -5.2 - Mrnd() * 2);
    }
  }

  function igniteTNT(tx, ty, delay) {
    var wd = G.world;
    if (wd.get(tx, ty) !== B.TNT) return;
    wd.set(tx, ty, B.AIR);
    wd.relight(tx - 6, tx + 6);
    rend.markTile(tx, ty);
    G.fuses.push({ x: tx, y: ty, t: delay != null ? delay : 1.15, max: 1.15 });
    SND.fuse();
    burst(tx + 0.5, ty + 0.2, ['#ffe066', '#ff595e', '#ffffff'], 8, 4, 0.15);
  }

  function detonateTNT(fx, fy) {
    var wd = G.world;
    G.stats.blasts = (G.stats.blasts || 0) + 1;
    SND.boom(); shake.add(11);
    burst(fx + 0.5, fy + 0.5, ['#ff595e', '#ff9f1c', '#ffe66d', '#ffffff', '#4a4e69'], 34, 10, 0.28);
    floatText(fx + 0.5, fy - 0.5, 'بوووم! 💥', '#ff9f1c', true);

    // Blast 3x3 core + cardinal edges, dropping every ore, block & opening chests!
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        if (Mab(dx) === 2 && Mab(dy) === 2) continue;
        if ((Mab(dx) === 2 || Mab(dy) === 2) && Mab(dx) + Mab(dy) > 2) continue;
        var tx = fx + dx, ty = fy + dy;
        if (tx < 1 || tx >= W - 1 || ty < 1 || ty >= H - 2) continue;
        var id = wd.get(tx, ty);
        if (!id || id === B.BEDROCK || id === B.WATER) continue;
        if (id === B.TNT) { igniteTNT(tx, ty, 0.22); continue; }
        if (id === B.CHEST) { openChest(tx, ty); continue; }
        removeBlockAndDrop(tx, ty, true);
      }
    }
    wd.relight(fx - 18, fx + 18);
    for (var cy = fy - 3; cy <= fy + 3; cy += 2) for (var cx = fx - 3; cx <= fx + 3; cx += 2) {
      rend.markTile(clamp(cx, 0, W - 1), clamp(cy, 0, H - 1));
    }

    // Blast nearby cave monsters!
    for (var mi = G.mobs.length - 1; mi >= 0; mi--) {
      var m = G.mobs[mi];
      if (Mhy((m.x + m.w / 2) - (fx + 0.5), (m.y + m.h / 2) - (fy + 0.5)) < 3.8) {
        damageMob(m, mi, 3);
      }
    }
    // Fun upward blast jump if player stands right near TNT (zero harm!)
    if (P && Mhy((P.x + P.w / 2) - (fx + 0.5), (P.y + P.h / 2) - (fy + 0.5)) < 3.2) {
      P.vy = -12.5; P.jetUsed = false;
    }
  }

  function updateFuses(dt) {
    for (var i = G.fuses.length - 1; i >= 0; i--) {
      var f = G.fuses[i];
      f.t -= dt;
      renderDirty = true;
      if (Mrnd() < 0.55) part(f.x + 0.5, f.y + 0.1, (Mrnd() - 0.5) * 3, -2 - Mrnd() * 2, 0.28, 0.14, '#ffe66d', 12);
      if (f.t <= 0) {
        G.fuses.splice(i, 1);
        detonateTNT(f.x, f.y);
      }
    }
  }

  // ------------------------------------------------ mining, chopping & placing
  var mine = { x: -1, y: -1, prog: 0, tickT: 0 };
  var placePop = null, placeCD = 0;

  function removeBlockAndDrop(x, y, skipRelight) {
    var wd = G.world, id = wd.get(x, y);
    if (!id || id === B.BEDROCK || id === B.WATER) return;
    var d = BLOCKS[id];
    wd.set(x, y, B.AIR);
    if (id === B.DOOR_B && wd.get(x, y - 1) === B.DOOR_T) { wd.set(x, y - 1, B.AIR); rend.markTile(x, y - 1); }
    if (id === B.DOOR_T && wd.get(x, y + 1) === B.DOOR_B) {
      wd.set(x, y + 1, B.AIR); rend.markTile(x, y + 1);
      if (G.gm === 'survival') spawnItem(x + 0.5, y + 1.5, I.DOOR, 1);
    }
    G.stats.mined[id] = (G.stats.mined[id] || 0) + 1;
    if (G.gm === 'survival' && d.drop) {
      spawnItem(x + 0.5, y + 0.5, d.drop, 1);
    } else if (G.gm === 'survival' && (id === B.LEAVES || id === B.PINE_LEAVES) && Mrnd() < 0.16) {
      spawnItem(x + 0.5, y + 0.5, B.SAPLING, 1);
    }
    // Check unsupported decorations above
    var above = wd.get(x, y - 1);
    if (above && BLOCKS[above] && BLOCKS[above].support) removeBlockAndDrop(x, y - 1, true);

    if (!skipRelight) {
      wd.relight(x - 14, x + 14);
      rend.markTile(x, y);
    }
  }

  function breakBlock(x, y) {
    var wd = G.world, id = wd.get(x, y);
    if (!id || id === B.BEDROCK || id === B.WATER) return;
    if (id === B.CHEST) { openChest(x, y); return; }
    var d = BLOCKS[id];
    SND.brk(d.mat);
    burst(x + 0.5, y + 0.5, d.cols, 10, 4.8, 0.18);

    // Tree-chopping cascade! Chopping a trunk pops the tree above cleanly!
    if (id === B.TRUNK) {
      SND.timber();
      for (var ty = y; ty >= Mmx(1, y - 9); ty--) {
        if (wd.get(x, ty) !== B.TRUNK) break;
        removeBlockAndDrop(x, ty, true);
        rend.markTile(x, ty);
        for (var ly = ty - 3; ly <= ty + 1; ly++) for (var lx = x - 2; lx <= x + 2; lx++) {
          var lid = wd.get(lx, ly);
          if (lid === B.LEAVES || lid === B.PINE_LEAVES) {
            removeBlockAndDrop(lx, ly, true);
            rend.markTile(lx, ly);
          }
        }
      }
      wd.relight(x - 16, x + 16);
      Kit.track.hit();
      return;
    }

    removeBlockAndDrop(x, y, false);
    Kit.track.hit();
  }

  function canReach(tx, ty) {
    if (G.gm === 'creative') return Mhy(tx + 0.5 - (P.x + P.w / 2), ty + 0.5 - (P.y + P.h * 0.5)) <= 9.5;
    return Mhy(tx + 0.5 - (P.x + P.w / 2), ty + 0.5 - (P.y + P.h * 0.5)) <= 6.2;
  }

  function hasNeighbour(tx, ty) {
    var wd = G.world;
    if (ty < H && wd.walls[ty * W + tx]) return true;
    return wd.get(tx - 1, ty) !== B.AIR || wd.get(tx + 1, ty) !== B.AIR || wd.get(tx, ty - 1) !== B.AIR || wd.get(tx, ty + 1) !== B.AIR;
  }

  function placeBlock(slot, tx, ty) {
    if (tx < 0 || tx >= W || ty < 0 || ty >= H) return false;
    var s = G.inv[slot];
    if (!s || !ITEMS[s.id] || !ITEMS[s.id].place) return false;
    var pid = ITEMS[s.id].place, defB = BLOCKS[pid], wd = G.world;
    var cur = wd.get(tx, ty);
    if (cur !== B.AIR && !(BLOCKS[cur] && BLOCKS[cur].replace)) return false;
    if (!hasNeighbour(tx, ty)) return false;
    if (defB.support && !wd.solid(tx, ty + 1)) return false;

    if (pid === B.DOOR_B) {
      if (ty < 1 || wd.get(tx, ty - 1) !== B.AIR || !wd.solid(tx, ty + 1)) return false;
    }
    if (defB.solid) {
      // Do not trap player inside placed solid block
      if (P.x + P.w > tx + 0.04 && P.x < tx + 0.96 && P.y + P.h > ty + 0.04 && P.y < ty + 0.96) return false;
    }

    wd.set(tx, ty, pid);
    if (pid === B.DOOR_B) { wd.set(tx, ty - 1, B.DOOR_T); rend.markTile(tx, ty - 1); }
    if (pid === B.SAPLING) G.saplings.push({ x: tx, y: ty, t: 18 + Mrnd() * 10 });
    wd.relight(tx - 15, tx + 15);
    rend.markTile(tx, ty);

    if (G.gm === 'survival') {
      s.n--;
      if (s.n <= 0) G.inv[slot] = null;
      invDirty = true; quickDirty = true;
    }
    G.stats.placed[pid] = (G.stats.placed[pid] || 0) + 1;
    G.stats.placedTotal = (G.stats.placedTotal || 0) + 1;
    if (ty < G.stats.highestPlace) G.stats.highestPlace = ty;
    placePop = { x: tx, y: ty, t: 0.16 };
    P.swingT = 0.22;
    SND.place(defB.mat);
    renderDirty = true;
    return true;
  }

  function animalAt(wx, wy) {
    for (var i = 0; i < G.animals.length; i++) {
      var a = G.animals[i];
      if (wx >= a.x - 0.15 && wx <= a.x + a.w + 0.15 && wy >= a.y - 0.15 && wy <= a.y + a.h + 0.15) return a;
    }
    return null;
  }
  function mobAt(wx, wy) {
    for (var i = 0; i < G.mobs.length; i++) {
      var m = G.mobs[i];
      if (wx >= m.x - 0.25 && wx <= m.x + m.w + 0.25 && wy >= m.y - 0.25 && wy <= m.y + m.h + 0.25) return i;
    }
    return -1;
  }

  // ------------------------------------------------ 1-Click HUD Quick-Craft Strip
  var quickList = [], quickRects = [];
  function refreshQuickList() {
    quickDirty = false;
    quickList.length = 0;
    if (G.gm !== 'survival') return;
    nearStations();
    var qr = questRecipe();
    if (qr && stationOK(qr) && hasIngredients(qr)) quickList.push(qr);
    for (var i = 0; i < BW.RECIPES.length && quickList.length < 4; i++) {
      var r = BW.RECIPES[i];
      if (r.cat === 'wool' || r === qr) continue;
      if (ITEMS[r.out] && ITEMS[r.out].max === 1 && countItem(r.out) > 0) continue;
      if (stationOK(r) && hasIngredients(r)) quickList.push(r);
    }
  }
  function tryHudQuickClick() {
    if (!M.realClick) return false;
    // Hotbar slot click (centered bottom bar)
    var hx0 = (VW - (9 * 54 + 8 * 6)) / 2, hy0 = VH - 66;
    if (M.y >= hy0 && M.y <= hy0 + 54 && M.x >= hx0 && M.x <= hx0 + 9 * 60) {
      var sIdx = Mfl((M.x - hx0) / 60);
      if (sIdx >= 0 && sIdx < 9) {
        G.sel = sIdx; G.selPop = 1; G.selName = 1.8; SND.click(); renderDirty = true;
        M.left = false;
        return true;
      }
    }
    // 1-Click Quick-Craft Strip (bottom-left pills)
    if (G.gm === 'survival' && quickRects.length) {
      for (var i = 0; i < quickRects.length; i++) {
        var b = quickRects[i];
        if (M.x >= b.x && M.x <= b.x + b.w && M.y >= b.y && M.y <= b.y + b.h) {
          craft(b.r, 1);
          renderDirty = true;
          M.left = false;
          return true;
        }
      }
    }
    return false;
  }

  function updateHands(dt) {
    if (placeCD > 0) placeCD -= dt;
    if (M.lp && tryHudQuickClick()) { M.realClick = false; return; }
    M.realClick = false;

    var wx = G.cam.x + M.x / TS, wy = G.cam.y + M.y / TS;
    var tx = Mfl(wx), ty = Mfl(wy);
    var reach = canReach(tx, ty);

    // Right-click: pet animal, ignite TNT, open Treasure Chest, or place block (with quest guidance!)
    if (M.rp && reach) {
      var animR = animalAt(wx, wy);
      if (animR) { petAnimal(animR); return; }
      var tidR = G.world.get(tx, ty);
      if (tidR === B.TNT) { igniteTNT(tx, ty); return; }
      if (tidR === B.CHEST) { openChest(tx, ty); return; }
    }
    if (M.right && reach && placeCD <= 0) {
      if (placeBlock(G.sel, tx, ty)) {
        placeCD = 0.16;
      } else if (M.rp) {
        // Helpful quest guidance if a place-quest item is in another hotbar slot or inside backpack!
        var qs = questPlaceSlot();
        if (qs >= 9) {
          var nm = BW.itemName(G.inv[qs].id);
          tip('افتح الحقيبة (E) وانقل ' + nm + ' إلى الشريط السريع!', 4.2);
          SND.bonk();
        } else if (qs >= 0) {
          var nm2 = BW.itemName(G.inv[qs].id);
          tip('اضغط الرقم ' + (qs + 1) + ' لاختيار ' + nm2 + ' ثم انقر باليمين!', 4.0);
          SND.bonk();
        }
      }
    }

    // Left-click: whack cave monster, pet animal on open air, or mine block with Auto-Best-Tool!
    if (M.lp && reach) {
      var mi = mobAt(wx, wy);
      if (mi >= 0) {
        P.swingT = 0.25;
        var pkDmg = Mmx(1, bestPick().tool);
        damageMob(G.mobs[mi], mi, pkDmg);
        mine.prog = 0;
        return;
      }
      var curT = G.world.get(tx, ty);
      if ((curT === B.AIR || curT === B.TALLGRASS) && animalAt(wx, wy)) {
        petAnimal(animalAt(wx, wy));
        mine.prog = 0;
        return;
      }
    }

    if (M.left && reach) {
      var id = G.world.get(tx, ty), d = BLOCKS[id];
      if (!id || !d || id === B.BEDROCK || id === B.WATER) { mine.prog = 0; return; }
      P.swingT = 0.2;
      if (G.gm === 'creative') {
        if (M.lp || placeCD <= 0) { breakBlock(tx, ty); placeCD = 0.11; }
        mine.prog = 0;
        return;
      }
      var pk = bestPick();
      if (d.tier > pk.tool) {
        if (M.lp) {
          SND.bonk();
          tip('تحتاج إلى ' + (PICK_NAMES[d.tier] || 'معول أقوى') + ' أو متفجرات TNT لاستخراج ' + d.name + '!', 3.4);
        }
        mine.prog = 0;
        return;
      }
      if (mine.x !== tx || mine.y !== ty) { mine.x = tx; mine.y = ty; mine.prog = 0; mine.tickT = 0; }
      var spd = pk.speed * diffCfg().mine * (1 + (dda.level - 0.45) * 0.12);
      var dur = Mmx(0.08, d.hard / spd);
      mine.prog += dt / dur;
      mine.tickT -= dt;
      if (mine.tickT <= 0) {
        mine.tickT = 0.17;
        SND.mat(d.mat, 0.75);
        part(tx + 0.5, ty + 0.5, (Mrnd() - 0.5) * 3.5, -2 - Mrnd() * 2, 0.35, 0.15, d.cols[0], 26);
      }
      if (mine.prog >= 1) {
        breakBlock(tx, ty);
        mine.prog = 0; mine.x = -1;
      }
    } else {
      mine.prog = 0; mine.x = -1;
    }
  }

  // --------------------------------------------------- quests & world saves
  function currentQuest() {
    var qs = questsFor(G.gm);
    for (var i = 0; i < qs.length; i++) if (!G.done[qs[i].id]) return qs[i];
    return null;
  }
  var QUEST_RECIPE = {
    planks: B.PLANKS, table: B.TABLE, pickwood: I.PICK_WOOD, pickstone: I.PICK_STONE,
    torch: B.TORCH, furnace: B.FURNACE, copper: I.COPPER_INGOT, iron: I.IRON_INGOT,
    pickiron: I.PICK_IRON, jetboots: I.JET_BOOTS, pickdiamond: I.PICK_DIAMOND
  };
  function questRecipe() {
    if (G.gm !== 'survival') return null;
    var q = currentQuest(), out = q && QUEST_RECIPE[q.id];
    if (!out) return null;
    for (var i = 0; i < BW.RECIPES.length; i++) if (BW.RECIPES[i].out === out) return BW.RECIPES[i];
    return null;
  }
  var QUEST_PLACE = { tableplace: B.TABLE, torchplace: B.TORCH, door: I.DOOR };
  function questPlaceItem() { var q = G.gm === 'survival' && currentQuest(); return (q && QUEST_PLACE[q.id]) || 0; }
  function questPlaceSlot() {
    var id = questPlaceItem(), cur = G.inv[G.sel];
    if (!id || (cur && cur.id === id)) return -1;
    for (var i = 0; i < 36; i++) if (G.inv[i] && G.inv[i].id === id) return i;
    return -1;
  }

  var guide = null;
  function updateGuide() {
    guide = null;
    var q = currentQuest();
    if (G.gm !== 'survival' || !q || q.id !== 'logs' || !P) return;
    var wd = G.world, px = Mfl(P.x + P.w / 2), best = null, bd = 99;
    for (var dx = -22; dx <= 22; dx++) {
      var x = px + dx;
      if (x < 0 || x >= W) continue;
      for (var y = Mmx(0, Mfl(P.y) - 10); y < Mmn(H - 1, Mfl(P.y) + 8); y++) {
        if (wd.tiles[y * W + x] === B.TRUNK && wd.tiles[(y + 1) * W + x] !== B.TRUNK) {
          var d = Mab(dx) + Mab(y - P.y) * 0.5;
          if (d < bd) { bd = d; best = { x: x, y: y }; }
        }
      }
    }
    guide = best;
  }

  var masterQueued = false;
  function scheduleMaster() {
    if (masterQueued || G.masterShown) return;
    masterQueued = true;
    setTimeout(function () {
      masterQueued = false;
      if (G.masterPending && !G.masterShown && G.mode === 'play') showMaster();
    }, 1800);
  }

  function completeQuest(q) {
    if (G.done[q.id]) return;
    G.done[q.id] = 1;
    var prevUnlock = BW.SKINS.filter(function (sk) { return meta.totalStars >= sk.stars; }).length;
    meta.totalStars = (meta.totalStars || 0) + 1;
    var nowUnlock = BW.SKINS.filter(function (sk) { return meta.totalStars >= sk.stars; }).length;
    if (q.id === 'logs') Kit.stats.tutorial('done');
    SND.quest(); confettiBurst();
    G.toasts.push({ title: '★ مهمة مكتملة!', text: q.text, icon: q.icon, t: 0, dur: 3.2 });
    if (nowUnlock > prevUnlock) {
      var newSk = BW.SKINS[nowUnlock - 1];
      G.toasts.push({ title: '🎉 زي جديد مفتوح!', text: newSk.name, icon: I.DIAMOND, t: 0, dur: 3.4 });
    }
    if (starCount() >= questsFor(G.gm).length && !G.masterShown) {
      G.masterPending = true;
      scheduleMaster();
    }
    saveGame();
  }

  function checkQuests() {
    var qs = questsFor(G.gm);
    for (var i = 0; i < qs.length; i++) {
      var q = qs[i];
      if (!G.done[q.id] && q.val(G.stats) >= q.need) completeQuest(q);
    }
    if (G.masterPending && !G.masterShown && !masterQueued && G.mode === 'play') scheduleMaster();
  }

  // World names
  var ADJ = ['الشمس', 'الكنوز', 'الألماس', 'البريق', 'المتفجرات', 'النجوم', 'الياقوت', 'الأبطال', 'الرعد', 'الصخور', 'القفز', 'الزمرد'];
  var NOUN = ['وادي', 'تلال', 'جزيرة', 'قلعة', 'كهف', 'قمم', 'مملكة', 'أرض', 'منجم', 'غابة'];
  function worldName(seed) { return NOUN[Mfl(seed / 7) % NOUN.length] + ' ' + ADJ[seed % ADJ.length]; }
  function fixName(n) { n = String(n || ''); return (!n || /^[A-Za-z ]+$/.test(n)) ? 'عالمي' : n; }

  function startWorld(world) {
    G.world = world;
    G.openDoors = {};
    rend = G.rend = new BW.Renderer(world, G.openDoors);
  }

  function newGame(slot, gm) {
    var seed = ((Date.now() ^ Mfl(Mrnd() * 0x7fffffff)) >>> 0) || 12345;
    var world = new BW.World(seed);
    world.generate();
    G.slot = slot; G.gm = gm; G.diff = meta.diff; G.name = worldName(seed);
    startWorld(world);
    G.spawn = { x: BW.SPAWN_X, y: 0 };
    var sp = spawnPoint();
    P = makePlayer(sp.x, sp.y);
    G.inv = emptyInv();
    if (gm === 'creative') {
      var creaStart = [B.PLANKS, B.BRICKS, B.STONE_BRICKS, B.TNT, B.SPRING, B.LANTERN, B.GLASS, B.DIAMOND_BLOCK, B.WOOL + 1];
      for (var i = 0; i < 9; i++) G.inv[i] = { id: creaStart[i], n: 99 };
    }
    G.sel = 0; G.cursor = null; G.stats = newStats(); G.done = {};
    G.tod = 0.12; G.play = 0; G.saplings = []; G.fuses = []; G.items = [];
    G.masterShown = false; G.masterPending = false;
    var ernd = BW.mulberry(seed ^ 0x27d4eb2d);
    G.animals = spawnAnimals(ernd);
    G.mobs = gm === 'survival' ? spawnMobs(ernd) : [];
    G.lastBiome = ''; G.lastZone = '';
    enterPlay();
    saveGame();
    G.toasts.push({
      title: gm === 'creative' ? '🎨 وضع الإبداع!' : '⛏️ ابدأ المغامرة!',
      text: gm === 'creative' ? 'اضغط مسافة مرتين للطيران وفجّر TNT!' : 'افتح صندوق البداية يسارك أو اقطع شجرة!',
      icon: gm === 'creative' ? B.TNT : B.CHEST, t: 0, dur: 3.5, soft: true
    });
  }

  function loadGame(slot) {
    var data = store.get('slot' + slot, null);
    if (!data || !data.world) return false;
    var world;
    try { world = BW.World.load(data.world); } catch (e) { return false; }
    G.slot = slot; G.gm = data.gm || 'survival';
    G.diff = DIFF_CFG[data.diff] ? data.diff : meta.diff;
    G.name = fixName(data.name || 'عالمي');
    startWorld(world);
    G.spawn = data.spawn || { x: BW.SPAWN_X, y: 0 };
    P = makePlayer(data.p ? data.p.x : BW.SPAWN_X, data.p ? data.p.y : 40);
    if (boxHits(P.x, P.y, P.w, P.h, false)) { var sp = spawnPoint(); P.x = sp.x; P.y = sp.y; }
    G.inv = emptyInv();
    (data.inv || []).forEach(function (s, i) { if (s && ITEMS[s.id] && i < 36) G.inv[i] = { id: s.id, n: s.n }; });
    G.sel = data.sel || 0;
    G.cursor = data.cursor && ITEMS[data.cursor.id] && data.cursor.n > 0 ? { id: data.cursor.id, n: data.cursor.n } : null;
    G.stats = Object.assign(newStats(), data.stats || {});
    G.done = data.done || {};
    G.tod = data.tod != null ? data.tod : 0.12;
    G.play = data.play || 0;
    G.saplings = data.saplings || [];
    G.fuses = [];
    G.masterShown = !!data.master;
    G.masterPending = !G.masterShown && (!!data.masterPending || starCount() >= questsFor(G.gm).length);
    G.animals = (data.animals || []).map(function (o) {
      var a = makeAnimal(o.t, o.x, o.y);
      a.sheared = !!o.s; a.regrow = o.s ? 35 : 0;
      return a;
    });
    var mrnd = BW.mulberry((world.seed ^ 0x27d4eb2d) >>> 0);
    G.mobs = G.gm === 'survival' ? spawnMobs(mrnd) : [];
    G.items = Array.isArray(data.items) ? data.items.filter(function (it) {
      return it && Number.isInteger(it.id) && ITEMS[it.id] && Number.isInteger(it.n) && it.n > 0 &&
        ['x', 'y', 'vx', 'vy', 'age', 'delay', 'bob'].every(function (k) { return typeof it[k] === 'number' && isFinite(it[k]); }) &&
        it.age >= 0 && it.age <= 300;
    }).map(function (it) {
      return { id: it.id, n: it.n, x: it.x, y: it.y, vx: it.vx, vy: it.vy, age: it.age, delay: it.delay, bob: it.bob };
    }) : [];
    G.lastBiome = ''; G.lastZone = '';
    syncDiffUI();
    enterPlay();
    if (G.cursor) openInv();
    if (G.masterPending && !G.masterShown) scheduleMaster();
    return true;
  }

  function saveGame() {
    if (!G.slot || !G.world || !P) return false;
    // Revert any mid-fuse TNT back into world tile for clean lossless persistence
    var invSave = G.inv.map(function (s) { return s ? { id: s.id, n: s.n } : null; });
    var data = {
      v: 4, gm: G.gm, diff: G.diff, name: G.name, world: G.world.serialize(), spawn: G.spawn,
      p: { x: +P.x.toFixed(2), y: +P.y.toFixed(2) },
      inv: invSave, cursor: G.cursor ? { id: G.cursor.id, n: G.cursor.n } : null,
      sel: G.sel, stats: G.stats, done: G.done, tod: +G.tod.toFixed(4), play: Mrn(G.play),
      saplings: G.saplings,
      master: G.masterShown,
      masterPending: !G.masterShown && (G.masterPending || starCount() >= questsFor(G.gm).length),
      savedAt: Date.now(), totalStars: meta.totalStars,
      items: G.items.map(function (it) {
        return { id: it.id, n: it.n, x: it.x, y: it.y, vx: it.vx, vy: it.vy, age: it.age, delay: it.delay, bob: it.bob };
      }),
      animals: G.animals.map(function (a) { return { t: a.type, x: +(a.x + a.w / 2).toFixed(2), y: +(a.y + a.h).toFixed(2), s: a.sheared ? 1 : 0 }; })
    };
    if (!store.set('slot' + G.slot, data)) return showSaveError('world');
    meta.slots[G.slot - 1] = {
      name: G.name, gm: G.gm, diff: G.diff, stars: starCount(),
      max: questsFor(G.gm).length, play: Mrn(G.play), last: Date.now()
    };
    meta.lastSlot = G.slot;
    if (!saveMeta()) return showSaveError('meta');
    G.saveError = null;
    saveErrorEl.hidden = true;
    G.savedFlash = 1.5;
    renderDirty = true;
    return true;
  }

  function recoverSlotMetadata() {
    var changed = false;
    for (var slot = 1; slot <= 3; slot++) {
      var data = store.get('slot' + slot, null), old = meta.slots[slot - 1];
      if (!data || !data.world) continue;
      var newerStars = typeof data.totalStars === 'number' && isFinite(data.totalStars) && data.totalStars > meta.totalStars;
      if (!newerStars && old && (!data.savedAt || old.last >= data.savedAt)) continue;
      try { BW.World.load(data.world); } catch (e) { continue; }
      if (newerStars) meta.totalStars = data.totalStars;
      var gm = data.gm === 'creative' ? 'creative' : 'survival', quests = questsFor(gm), done = data.done || {};
      meta.slots[slot - 1] = {
        name: fixName(data.name || 'عالمي'), gm: gm, diff: data.diff || 'normal',
        stars: quests.filter(function (q) { return !!done[q.id]; }).length, max: quests.length,
        play: data.play || 0, last: data.savedAt || (old && old.last) || 0
      };
      changed = true;
    }
    if (changed) saveMeta();
  }

  // ------------------------------------------------ world sim & exploration
  var DAY_LEN = 420, wtick = 0;
  function updateWorldSim(dt) {
    var wd = G.world;
    G.tod = (G.tod + dt / DAY_LEN) % 1;
    wtick = (wtick + 1) % 6;
    if (wtick === 0) wd.stepWater(Math.random);
    for (var i = G.saplings.length - 1; i >= 0; i--) {
      var s = G.saplings[i];
      if (wd.get(s.x, s.y) !== B.SAPLING) { G.saplings.splice(i, 1); continue; }
      s.t -= dt;
      if (s.t <= 0) {
        var rnd = BW.mulberry((s.x * 31 + s.y * 17 + (G.time * 1000 | 0)) >>> 0);
        wd.set(s.x, s.y, B.AIR);
        if (wd.biomeAt(s.x) === 'snow') wd.pineTree(s.x, s.y, rnd); else wd.oakTree(s.x, s.y, rnd);
        wd.relight(s.x - 18, s.x + 18);
        for (var yy = s.y - 9; yy <= s.y; yy += 4) for (var xx = s.x - 4; xx <= s.x + 4; xx += 4) {
          rend.markTile(clamp(xx, 0, W - 1), Mmx(0, yy));
        }
        rend.markTile(s.x, s.y);
        burst(s.x + 0.5, s.y - 2, ['#7ef263', '#ffffff', '#ffd60a'], 14, 5, 0.18);
        if (G.mode === 'play' && Mab(s.x - P.x) < 24) SND.grow();
        G.saplings.splice(i, 1);
      }
    }
  }

  function updateDoors() {
    var now = {}, changed = false;
    var x0 = Mfl(P.x), x1 = Mfl(P.x + P.w - 1e-6), y0 = Mfl(P.y), y1 = Mfl(P.y + P.h - 1e-6);
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
      var id = G.world.get(tx, ty);
      if (id === B.DOOR_B) now[tx + ',' + ty] = 1;
      else if (id === B.DOOR_T) now[tx + ',' + (ty + 1)] = 1;
    }
    var k;
    for (k in now) if (!G.openDoors[k]) { changed = true; markDoor(k); }
    for (k in G.openDoors) if (!now[k]) { changed = true; markDoor(k); }
    if (changed && G.mode === 'play') SND.door();
    G.openDoors = now;
    rend.setOpenDoors(now);
  }
  function markDoor(k) { var p = k.split(','); rend.markTile(+p[0], +p[1]); rend.markTile(+p[0], +p[1] - 1); }

  var ZONE_LABEL = { Underground: '⛏️ تحت الأرض', 'Deep Caves': '💎 الكهوف العميقة', 'Diamond Depths': '🔥 أعماق الألماس والياقوت' };
  function updateExplore() {
    var cx = clamp(Mfl(P.x + P.w / 2), 0, W - 1), feet = P.y + P.h;
    var bio = G.world.biomeAt(cx), surf = G.world.surf[cx];
    if (feet > G.stats.maxDepth) G.stats.maxDepth = Mfl(feet);
    var zone = '';
    if (feet > surf + 13) { zone = 'Underground'; if (feet > 96) zone = 'Deep Caves'; if (feet > 118) zone = 'Diamond Depths'; }
    if (!zone) {
      var key = bio === 'ocean' ? 'beach' : bio;
      G.stats.biomes[key] = 1;
      if (key !== G.lastBiome) { if (G.lastBiome) G.banner = { s: BW.BIOME_LABEL[key], t: 2.6 }; G.lastBiome = key; }
    }
    if (zone !== G.lastZone) {
      if (zone) G.banner = { s: ZONE_LABEL[zone], t: 2.8 };
      G.lastZone = zone;
      if (!zone) G.lastBiome = '';
    }
  }

  function nearStations() {
    if (G.gm === 'creative') { G.nearTable = G.nearFurnace = true; return; }
    var t = false, f = false, cx = Mfl(P.x + P.w / 2), cy = Mfl(P.y + 1);
    for (var y = cy - 4; y <= cy + 4; y++) for (var x = cx - 5; x <= cx + 5; x++) {
      var id = G.world.get(x, y);
      if (id === B.TABLE) t = true;
      else if (id === B.FURNACE) f = true;
    }
    if (t !== G.nearTable || f !== G.nearFurnace) { G.nearTable = t; G.nearFurnace = f; quickDirty = true; }
  }

  // Keep ambient particle lifetimes <= 3.5s so pause settles cleanly well within 250 frames!
  function ambient() {
    if (Kit.motion.reduced()) return;
    var env = BW.envAt(G.tod), bio = G.world.biomeAt(P.x);
    var surf = G.world.surf[clamp(Mfl(P.x), 0, W - 1)];
    if (P.y > surf + 10) return;
    if (bio === 'snow' && Mrnd() < 0.35) {
      part(G.cam.x + Mrnd() * VTW, G.cam.y, -0.5 + Mrnd() * 0.4, 2.2 + Mrnd(), 3.2, 0.13, '#ffffff', 0, 4);
    } else if (env.night > 0.55 && (bio === 'forest' || bio === 'plains') && Mrnd() < 0.06) {
      part(G.cam.x + Mrnd() * VTW, surf - 1 - Mrnd() * 5, (Mrnd() - 0.5) * 0.6, (Mrnd() - 0.5) * 0.4, 2.4, 0.14, '#d8ff6a', 0, 2);
    }
  }

  // ----------------------------------------------------------------- update loop
  var budget = { n: 4 };
  function update(dt) {
    G.time += dt;
    if (G.mode === 'title') {
      G.titleT += dt;
      G.tod = (0.24 + G.titleT / 80) % 1;
      var tx = 60 + (Math.sin(G.titleT * 0.025) * 0.5 + 0.5) * (W - VTW - 120);
      G.cam.x += (tx - G.cam.x) * Mmn(1, dt * 0.5);
      var sy = G.world.surf[clamp(Mfl(G.cam.x + VTW / 2), 0, W - 1)];
      G.cam.y += (sy - 13 - G.cam.y) * Mmn(1, dt * 0.6);
      for (var ai = 0; ai < G.animals.length; ai++) {
        var a0 = G.animals[ai];
        if (Mab(a0.x - G.cam.x - VTW / 2) < 40) updateAnimal(a0, dt);
      }
      if (kp(['Enter', 'Space']) && !titleBusy) titlePlay();
      K.endFrame(); M.lp = M.rp = false; M.wheel = 0; M.realClick = false;
      return;
    }

    if (G.mode === 'play' || G.mode === 'inv') {
      var controls = G.mode === 'play';
      if (controls && kp(['KeyP', 'Escape'])) { pause(); K.endFrame(); return; }
      if (kp(['KeyE'])) { if (G.mode === 'inv') closeInv(); else openInv(); }
      else if (G.mode === 'inv' && kp(['Escape'])) closeInv();

      G.play += dt;
      updatePlayer(dt, controls);
      if (controls) updateHands(dt); else mine.prog = 0;
      if (G.mode === 'inv') {
        for (var n = 1; n <= 9; n++) if (K.pressed('Digit' + n)) { G.sel = n - 1; invDirty = true; }
      }
      for (var i = 0; i < G.animals.length; i++) {
        var a = G.animals[i];
        if (Mab(a.x - P.x) < 48) updateAnimal(a, dt);
      }
      updateMobs(dt);
      updateFuses(dt);
      updateItems(dt);
      updateWorldSim(dt);
      updateDoors();
      updateExplore();

      G.questT -= dt;
      if (G.questT <= 0) {
        G.questT = 0.35;
        nearStations();
        checkQuests();
        updateGuide();
        quickDirty = true;
      }
      if (quickDirty) refreshQuickList();

      G.saveT += dt;
      if (G.saveT > 30) { G.saveT = 0; saveGame(); }

      var tcx = P.x + P.w / 2 - VTW / 2 + P.face * 1.1;
      var tcy = P.y + P.h / 2 - VTH / 2 - 0.5;
      G.cam.x = clamp(G.cam.x + (tcx - G.cam.x) * (1 - Math.exp(-7.5 * dt)), 0, W - VTW);
      G.cam.y = clamp(G.cam.y + (tcy - G.cam.y) * (1 - Math.exp(-6.5 * dt)), -2, H - VTH);

      if (invDirty && G.mode === 'inv') renderInv();
      ambient();
    }

    // Transient effects settle cleanly to 0 when paused so frozen pause performs 0 paints!
    if (shake.power || shake.x || shake.y || texts.length || confetti.length || G.toasts.length ||
        G.hint || G.banner || placePop || G.selPop > 0 || G.selName > 0 || G.savedFlash > 0) {
      renderDirty = true;
    }
    shake.update(dt);
    for (var pi2 = 0; pi2 < PMAX; pi2++) {
      var pt = parts[pi2];
      if (!pt.on) continue;
      renderDirty = true;
      pt.life -= dt;
      if (pt.life <= 0) { pt.on = false; continue; }
      pt.vy += pt.g * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      if (pt.kind === 0 && pt.g > 0 && G.world.solid(Mfl(pt.x), Mfl(pt.y))) {
        pt.vy *= -0.28; pt.vx *= 0.6; pt.y -= pt.vy * dt * 2;
      }
    }
    for (var ti = texts.length - 1; ti >= 0; ti--) {
      var tt = texts[ti];
      tt.life -= dt; tt.pop = Mmx(0, (tt.pop || 0) - dt * 5);
      if (!tt.key) tt.y -= dt * 0.9;
      else if (P) { tt.x = P.x + P.w / 2; tt.y = P.y - 0.35 - (1.25 - tt.life) * 0.4 - (texts.length - 1 - ti) * 0.55; }
      if (tt.life <= 0) texts.splice(ti, 1);
    }
    for (var ci = confetti.length - 1; ci >= 0; ci--) {
      var c = confetti[ci];
      c.vy += 600 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.99; c.r += c.vr * dt; c.life -= dt;
      if (c.life <= 0 || c.y > VH + 20) confetti.splice(ci, 1);
    }
    if (G.toasts.length) {
      G.toasts[0].t += dt * (G.toasts.length > 2 ? 2.5 : 1);
      if (G.toasts[0].t > G.toasts[0].dur) G.toasts.shift();
    }
    if (G.hint) { G.hint.t -= dt; if (G.hint.t <= 0) G.hint = null; }
    if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
    if (placePop) { placePop.t -= dt; if (placePop.t <= 0) placePop = null; }
    G.selPop = Mmx(0, G.selPop - dt * 4);
    G.selName = Mmx(0, G.selName - dt);
    G.savedFlash = Mmx(0, G.savedFlash - dt);
    for (var sb = 0; sb < 36; sb++) {
      if (slotBump[sb] > 0) { renderDirty = true; slotBump[sb] = Mmx(0, slotBump[sb] - dt * 4); }
    }
    K.endFrame(); M.lp = M.rp = false; M.wheel = 0; M.realClick = false;
  }

  // ----------------------------------------------------------------- render
  var titleDrawTime = 0, renderedMode = '';
  var skyCv = document.createElement('canvas'), skyCtx = skyCv.getContext('2d'), skyState = { n: 0, cx: -99, cy: -99, tod: -1 };

  function drawSkyCached(ctx, cx, cy) {
    var w = Mmx(1, Math.ceil(canvas.width / 2)), h = Mmx(1, Math.ceil(canvas.height / 2));
    if (skyCv.width !== w || skyCv.height !== h) { skyCv.width = w; skyCv.height = h; skyState.n = 0; }
    skyState.n--;
    if (skyState.n <= 0 || Mab(cx - skyState.cx) + Mab(cy - skyState.cy) > 0.06 || Mab(G.tod - skyState.tod) > 0.004) {
      skyCtx.setTransform(w / VW, 0, 0, h / VH, 0, 0);
      rend.drawSky(skyCtx, cx, cy, VTW, VTH, G.tod, G.time);
      skyState.n = 4; skyState.cx = cx; skyState.cy = cy; skyState.tod = G.tod;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(skyCv, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function sx(wx, cx) { return (wx - cx) * TS; }

  function render() {
    var ctx = view.ctx, S = view.scale * view.dpr;
    if (!G.world) return;
    if (G.mode !== renderedMode) renderDirty = true;
    var frozen = G.mode === 'pause' || G.mode === 'master' || G.mode === 'newworld';
    if (frozen && !renderDirty) return;
    if (G.mode === 'title') {
      var now = performance.now(), elapsed = now - titleDrawTime, interval = 1000 / 30;
      if (!renderDirty && elapsed < interval) return;
      titleDrawTime = now - (elapsed % interval);
    }

    var cx = G.cam.x + shake.x / TS, cy = G.cam.y + shake.y / TS;
    cx = Mrn(cx * TS * S) / (TS * S);
    cy = Mrn(cy * TS * S) / (TS * S);

    // Single clearRect per frame on #game (required by runtime-cleanup paint counter)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Sky backdrop (skipped when camera is deep underground below all surface walls)
    var c0 = Mmx(0, Mfl(cx)), c1 = Mmn(W - 1, Math.ceil(cx + VTW)), maxSurf = 0;
    for (var col = c0; col <= c1; col++) if (G.world.surf[col] > maxSurf) maxSurf = G.world.surf[col];
    if (cy < maxSurf + 2) drawSkyCached(ctx, cx, cy);

    // 2. Cached 16x16 world chunks
    budget.n = G.mode === 'title' ? 2 : 4;
    rend.drawChunks(ctx, cx, cy, VTW, VTH, S, budget);

    // 3. World entities (items, animals, cave monsters, TNT fuses, player, cracks)
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawEntities(ctx, cx, cy);

    // 4. Smooth 2D canvas lightmap (pure GPU/2D-canvas composited)
    var env = BW.envAt(G.tod);
    env.ambient = G.gm === 'creative' ? 0.35 : diffCfg().amb;
    env.fuses = G.fuses;
    if (P && G.mode !== 'title') {
      env.px = P.x + P.w / 2; env.py = P.y + 0.85;
      env.pglow = 0.72; env.prad = G.diff === 'easy' ? 6.8 : 5.4;
    } else {
      env.px = -99; env.py = -99; env.pglow = 0;
    }
    rend.drawLight(ctx, cx, cy, VTW, VTH, env, S);

    // 5. Additive emissive glows, bright particles, guide arrow, floating text & HUD
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawEmissive(ctx, cx, cy);
    drawParticles(ctx, cx, cy, true);
    drawGuide(ctx, cx, cy);
    drawTexts(ctx, cx, cy);
    if (G.mode === 'play' || G.mode === 'inv' || G.mode === 'pause') {
      drawTargetBox(ctx, cx, cy);
      drawHUD(ctx);
    }
    drawConfetti(ctx);

    // Restore exact logical transform expected by contextrestored check
    ctx.setTransform(S, 0, 0, S, 0, 0);
    renderedMode = G.mode;
    renderDirty = budget.n <= 0;
  }

  function drawEntities(ctx, cx, cy) {
    var t = G.time, i;
    // Dropped items
    for (i = 0; i < G.items.length; i++) {
      var it = G.items[i], ix = sx(it.x, cx), iy = sx(it.y, cy) - 4 + Math.sin(t * 4.5 + it.bob) * 2.2;
      if (ix < -30 || ix > VW + 30 || iy < -30 || iy > VH + 30) continue;
      if (TEX[it.id]) {
        ctx.drawImage(TEX[it.id], ix - 6, iy - 6, 12, 12);
        if (it.n > 1) ctx.drawImage(TEX[it.id], ix - 4, iy - 9, 12, 12);
      }
    }
    // Surface animals
    for (i = 0; i < G.animals.length; i++) {
      var a = G.animals[i], ax = sx(a.x + a.w / 2, cx), ay = sx(a.y + a.h + a.stepOff, cy);
      if (ax < -50 || ax > VW + 50 || ay < -50 || ay > VH + 60) continue;
      ctx.save(); ctx.translate(Mrn(ax), Mrn(ay)); ctx.scale(a.face, 1);
      BW.drawAnimal(ctx, a, t);
      ctx.restore();
    }
    // Underground Cave Monsters
    for (i = 0; i < G.mobs.length; i++) {
      var m = G.mobs[i], mx = sx(m.x + m.w / 2, cx), my = sx(m.y + m.h + m.stepOff, cy);
      if (mx < -60 || mx > VW + 60 || my < -60 || my > VH + 70) continue;
      ctx.save(); ctx.translate(Mrn(mx), Mrn(my)); ctx.scale(m.face, 1);
      BW.drawMob(ctx, m, t);
      ctx.restore();
    }
    // Sizzling TNT fuses
    for (i = 0; i < G.fuses.length; i++) {
      var f = G.fuses[i], fx = sx(f.x + 0.5, cx), fy = sx(f.y + 0.5, cy);
      var pulse = 1 + Math.sin(t * 28) * 0.14;
      ctx.save();
      ctx.translate(fx, fy); ctx.scale(pulse, pulse);
      ctx.drawImage(TEX[B.TNT], -8, -8, 16, 16);
      if (((t * 14) | 0) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillRect(-8, -8, 16, 16);
      }
      ctx.restore();
    }
    // Player hero
    if (P && G.mode !== 'title') {
      if (P.hurtT <= 0 || ((t * 18) | 0) % 2 === 0) {
        var px = sx(P.x + P.w / 2, cx), py = sx(P.y + P.h + P.stepOff, cy);
        var held = 0;
        if (mine.prog > 0 || (M.left && P.swingT > 0)) held = bestPick().id || (G.inv[G.sel] && G.inv[G.sel].id) || 0;
        else held = (G.inv[G.sel] && G.inv[G.sel].id) || 0;
        var swing = P.swingT > 0 ? -1.15 + Math.sin(t * 24) * 0.9 : (P.flying ? -0.35 : 0);
        var wx = G.cam.x + M.x / TS, wy = G.cam.y + M.y / TS;
        var lx = clamp(Mrn((wx - (P.x + P.w / 2)) * P.face * 0.4), -1, 1);
        var ly = clamp(Mrn((wy - (P.y + 0.5)) * 0.35), -1, 1);
        ctx.save();
        ctx.translate(Mrn(px), Mrn(py));
        ctx.scale(P.face * P.sx * 0.94, P.sy * 0.94);
        BW.drawPlayer(ctx, {
          walk: P.walk, walkAmt: P.climbing ? 0.6 : P.walkAmt, swing: swing,
          look: ly * 0.25, lookX: lx, lookY: ly, skin: wornSkin(), held: held,
          blink: P.blink > 0, jet: hasJetBoots(), jetting: P.jetT > 0 || P.flying
        });
        ctx.restore();
      }
    }
    // Block mining cracks
    if (mine.prog > 0 && mine.x >= 0) {
      var st = Mmn(7, Mfl(mine.prog * 8));
      ctx.drawImage(BW.CRACKS[st], sx(mine.x, cx), sx(mine.y, cy), TS, TS);
    }
    if (placePop) {
      var pk = placePop.t / 0.16;
      ctx.fillStyle = 'rgba(255,255,255,' + (pk * 0.5) + ')';
      ctx.fillRect(sx(placePop.x, cx) - pk * 2, sx(placePop.y, cy) - pk * 2, TS + pk * 4, TS + pk * 4);
    }
    drawParticles(ctx, cx, cy, false);
  }

  function drawEmissive(ctx, cx, cy) {
    var wd = G.world, x0 = Mmx(0, Mfl(cx) - 2), x1 = Mmn(W - 1, Math.ceil(cx + VTW) + 2);
    var y0 = Mmx(0, Mfl(cy) - 2), y1 = Mmn(H - 1, Math.ceil(cy + VTH) + 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    for (var ty = y0; ty <= y1; ty++) {
      var row = ty * W;
      for (var tx = x0; tx <= x1; tx++) {
        var id = wd.tiles[row + tx];
        if (id === B.TORCH || id === B.LANTERN || id === B.JACK || id === B.CHEST || id === B.FURNACE) {
          var r = id === B.CHEST ? 38 : 46;
          ctx.drawImage(BW.GLOW_WARM, sx(tx + 0.5, cx) - r, sx(ty + 0.5, cy) - r, r * 2, r * 2);
        } else if (id === B.CRYSTAL || id === B.MUSHROOM || id === B.DIAMOND_ORE || id === B.SPRING) {
          ctx.drawImage(BW.GLOW_CYAN, sx(tx + 0.5, cx) - 34, sx(ty + 0.5, cy) - 34, 68, 68);
        } else if (id === B.RUBY_ORE) {
          ctx.drawImage(BW.GLOW_RUBY, sx(tx + 0.5, cx) - 34, sx(ty + 0.5, cy) - 34, 68, 68);
        }
      }
    }
    for (var fi = 0; fi < G.fuses.length; fi++) {
      var f = G.fuses[fi];
      ctx.drawImage(BW.GLOW_RUBY, sx(f.x + 0.5, cx) - 52, sx(f.y + 0.5, cy) - 52, 104, 104);
    }
    ctx.restore();
  }

  function drawParticles(ctx, cx, cy, glowing) {
    for (var i = 0; i < PMAX; i++) {
      var p = parts[i];
      if (!p.on) continue;
      var isGlow = p.kind === 1 || p.kind === 2;
      if (isGlow !== glowing) continue;
      var x = sx(p.x, cx), y = sx(p.y, cy);
      ctx.globalAlpha = Mmn(1, p.life / p.max * 1.4);
      if (p.kind === 1) {
        ctx.font = '700 14px var(--sg-font)';
        ctx.fillStyle = p.col;
        ctx.fillText('♥', x - 5, y);
      } else {
        var sz = p.size * TS;
        ctx.fillStyle = p.col;
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawGuide(ctx, cx, cy) {
    if (!guide || G.mode !== 'play' || mine.prog > 0) return;
    var x = sx(guide.x, cx), y = sx(guide.y, cy);
    if (x < -40 || x > VW + 40 || y < -80 || y > VH + 40) return;
    var bob = Kit.motion.reduced() ? 0 : Mab(Math.sin(G.time * 5)) * 9;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffe04a';
    ctx.strokeRect(x - 1, y - 1, TS + 2, TS + 2);
    var ax = x + TS / 2, ay = y - 10 - bob;
    ctx.fillStyle = '#1b1640';
    ctx.beginPath(); ctx.moveTo(ax - 18, ay - 22); ctx.lineTo(ax + 18, ay - 22); ctx.lineTo(ax, ay + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe04a';
    ctx.beginPath(); ctx.moveTo(ax - 14, ay - 20); ctx.lineTo(ax + 14, ay - 20); ctx.lineTo(ax, ay - 2); ctx.closePath(); ctx.fill();
  }

  function txt(ctx, s, x, y, col, sz, align, dir, sw, sc) {
    ctx.direction = dir || 'rtl';
    ctx.textAlign = align || 'right';
    ctx.font = '700 ' + sz + 'px Fredoka, sans-serif';
    if (sw) { ctx.lineWidth = sw; ctx.strokeStyle = sc || '#14162e'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = col;
    ctx.fillText(s, x, y);
  }

  function pill(ctx, x, y, w, h, r, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw || 2; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function drawTexts(ctx, cx, cy) {
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      ctx.save();
      ctx.globalAlpha = Mmn(1, t.life * 2);
      txt(ctx, t.s, sx(t.x, cx), sx(t.y, cy), t.col, t.big ? 22 : 17, 'center', dirOf(t.s), 4);
      ctx.restore();
    }
  }

  function drawTargetBox(ctx, cx, cy) {
    if (G.mode !== 'play') return;
    var tx = Mfl(G.cam.x + M.x / TS), ty = Mfl(G.cam.y + M.y / TS);
    if (!canReach(tx, ty)) return;
    var id = G.world.get(tx, ty), s = G.inv[G.sel];
    if (!id && !(s && ITEMS[s.id] && ITEMS[s.id].place && hasNeighbour(tx, ty))) return;
    ctx.lineWidth = 2;
    ctx.strokeStyle = id === B.TNT ? '#ff595e' : id === B.CHEST ? '#ffd60a' : 'rgba(255,255,255,0.7)';
    ctx.strokeRect(sx(tx, cx) + 0.5, sx(ty, cy) + 0.5, TS - 1, TS - 1);
  }

  function drawHUD(ctx) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    var q = currentQuest(), qs = questsFor(G.gm), qx = 16, qy = 12, qw = 356, qh = q ? 68 : 48;
    pill(ctx, qx, qy, qw, qh, 16, 'rgba(16,20,48,0.82)', 'rgba(255,255,255,0.22)', 2.5);
    txt(ctx, '★ ' + ltr(starCount() + ' / ' + qs.length) + ' · ' + (G.gm === 'creative' ? 'وضع الإبداع' : diffCfg().label), qx + qw - 14, qy + 23, '#ffcc00', 15);
    if (q) {
      var ic = TEX[q.icon === BW.FLOWER ? B.FLOWER_RED : q.icon];
      if (ic) ctx.drawImage(ic, qx + qw - 38, qy + 34, 24, 24);
      txt(ctx, q.text, qx + qw - 46, qy + 52, '#ffffff', 15);
      txt(ctx, Mmn(q.need, q.val(G.stats)) + '/' + q.need, qx + 14, qy + 52, '#7ef263', 15, 'left', 'ltr');
    } else {
      txt(ctx, 'أنجزت كل المهام! أنت بطل عالم المكعبات!', qx + qw - 14, qy + 42, '#7ef263', 15);
    }

    if (G.gm === 'survival') {
      var pk = bestPick(), pillY = qy + qh + 8;
      pill(ctx, qx, pillY, pk.id ? 210 : 185, 30, 12, 'rgba(16,20,48,0.75)');
      if (pk.id && TEX[pk.id]) {
        ctx.drawImage(TEX[pk.id], qx + 182, pillY + 5, 20, 20);
        txt(ctx, 'أداة تلقائية: ' + BW.itemName(pk.id), qx + 176, pillY + 20, '#9cf0b8', 13);
      } else {
        txt(ctx, '💡 اصنع معولًا لحفر أسرع!', qx + 174, pillY + 20, '#ffe066', 13);
      }
      if (hasJetBoots()) {
        pill(ctx, qx + 216, pillY, 134, 30, 12, 'rgba(0,180,216,0.32)');
        ctx.drawImage(TEX[I.JET_BOOTS], qx + 324, pillY + 5, 20, 20);
        txt(ctx, 'قفزة نفاثة جاهزة', qx + 318, pillY + 20, '#72efdd', 13);
      }
    }

    var sw = 54, gap = 6, barW = 9 * sw + 8 * gap, hx0 = (VW - barW) / 2, hy0 = VH - 66;
    pill(ctx, hx0 - 8, hy0 - 6, barW + 16, sw + 12, 18, 'rgba(14,18,44,0.84)', 'rgba(255,255,255,0.2)', 2);
    var qSlot = questPlaceSlot();
    for (var i = 0; i < 9; i++) {
      var x = hx0 + i * (sw + gap), y = hy0 - slotBump[i] * 5, sel = i === G.sel, isQ = i === qSlot;
      pill(ctx, x, y, sw, sw, 11, sel ? 'rgba(255,204,0,0.28)' : isQ ? 'rgba(255,224,102,0.24)' : 'rgba(255,255,255,0.09)', sel ? '#ffcc00' : isQ ? '#ffe066' : 'rgba(255,255,255,0.18)', sel ? 3 : 2);
      var st = G.inv[i];
      if (st && TEX[st.id]) {
        ctx.drawImage(TEX[st.id], x + 9, y + 9, 36, 36);
        if (st.n > 1 && G.gm === 'survival') txt(ctx, String(st.n), x + sw - 5, y + sw - 5, '#fff', 15, 'right', 'ltr', 3, '#000');
      }
      txt(ctx, String(i + 1), x + 5, y + 13, 'rgba(255,255,255,0.55)', 11, 'left', 'ltr');
    }

    var curItem = G.inv[G.sel];
    if (curItem && G.selName > 0) {
      ctx.globalAlpha = Mmn(1, G.selName);
      txt(ctx, BW.itemName(curItem.id) + (curItem.id === B.TNT ? ' (ضعها ثم انقر يمين لتفجيرها!)' : ''), VW / 2, hy0 - 16, '#fff8d6', 17, 'center', 'rtl', 4);
      ctx.globalAlpha = 1;
    }

    quickRects.length = 0;
    if (G.gm === 'survival' && quickList.length > 0 && G.mode === 'play') {
      var qcx = 16, qcy = VH - 66, qcw = 52, qcGap = 7, stripW = quickList.length * (qcw + qcGap) + 12;
      pill(ctx, qcx, qcy - 24, stripW, qcw + 30, 15, 'rgba(14,40,34,0.86)', 'rgba(61,220,132,0.55)', 2);
      txt(ctx, '⚡ صنع بنقرة:', qcx + stripW - 10, qcy - 7, '#7ef263', 13);
      var qRec = questRecipe();
      for (var qi = 0; qi < quickList.length; qi++) {
        var r = quickList[qi], bx = qcx + 8 + qi * (qcw + qcGap);
        quickRects.push({ x: bx, y: qcy, w: qcw, h: qcw, r: r });
        pill(ctx, bx, qcy, qcw, qcw, 11, r === qRec ? 'rgba(255,204,0,0.28)' : 'rgba(61,220,132,0.22)', r === qRec ? '#ffcc00' : '#3ddc84', 2);
        if (TEX[r.out]) ctx.drawImage(TEX[r.out], bx + 9, qcy + 8, 34, 34);
        if (r.n > 1) txt(ctx, '×' + r.n, bx + qcw - 4, qcy + qcw - 4, '#fff', 13, 'right', 'ltr');
      }
    }

    pill(ctx, VW - 168, VH - 56, 152, 44, 14, 'rgba(16,20,48,0.78)');
    txt(ctx, '🎒 الحقيبة (E)', VW - 92, VH - 29, '#dce4ff', 15, 'center');

    if (G.banner) {
      ctx.globalAlpha = Mmn(1, G.banner.t);
      txt(ctx, G.banner.s, VW / 2, 54, '#ffe066', 26, 'center', 'rtl', 5);
      ctx.globalAlpha = 1;
    }
    if (G.hint) {
      ctx.globalAlpha = Mmn(1, G.hint.t * 1.5);
      pill(ctx, VW / 2 - 260, VH - 122, 520, 40, 14, 'rgba(24,20,56,0.92)', '#ffcc00', 2);
      txt(ctx, G.hint.s, VW / 2, VH - 96, '#fff8d6', 16, 'center');
      ctx.globalAlpha = 1;
    }
    if (G.toasts.length) {
      var tst = G.toasts[0], tw = 360, tx2 = (VW - tw) / 2, ty2 = 76;
      ctx.globalAlpha = Mmx(0, Mmn(1, Mmn(tst.t * 4, (tst.dur - tst.t) * 3)));
      pill(ctx, tx2, ty2, tw, 58, 16, 'rgba(20,26,64,0.94)', '#ffcc00', 2.5);
      if (TEX[tst.icon]) ctx.drawImage(TEX[tst.icon], tx2 + tw - 48, ty2 + 11, 36, 36);
      txt(ctx, tst.title, tx2 + tw - 58, ty2 + 25, '#ffcc00', 16);
      txt(ctx, tst.text, tx2 + tw - 58, ty2 + 46, '#ffffff', 14);
      ctx.globalAlpha = 1;
    }
    if (G.savedFlash > 0 && !G.saveError) {
      ctx.globalAlpha = Mmn(1, G.savedFlash);
      txt(ctx, '✓ تم الحفظ', 18, VH - 76, '#7ef263', 14, 'left');
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawConfetti(ctx) {
    for (var i = 0; i < confetti.length; i++) {
      var c = confetti[i];
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r);
      ctx.globalAlpha = Mmn(1, c.life);
      ctx.fillStyle = c.col; ctx.fillRect(-5, -3, 10, 6);
      ctx.restore();
    }
  }

  // ============================================================ DOM UI & Menus
  var titleEl = $('title'), pauseEl = $('pause'), invEl = $('inv'), newEl = $('newworld'), loadEl = $('loading'), masterEl = $('master');
  var pauseBtn = $('pausebtn');
  var titleBusy = false, pausedInventory = false;
  var selSlot = meta.lastSlot || 1;

  // Save error alert banner (#saveError & #saveRetry contract)
  var saveErrorEl = document.createElement('div'), saveErrorText = document.createElement('span');
  saveErrorEl.id = 'saveError'; saveErrorEl.hidden = true; saveErrorEl.dir = 'rtl';
  saveErrorEl.setAttribute('role', 'alert');
  saveErrorEl.appendChild(saveErrorText);
  var saveRetry = document.createElement('button');
  saveRetry.id = 'saveRetry'; saveRetry.className = 'sg-btn secondary'; saveRetry.type = 'button';
  saveRetry.textContent = 'حاول الحفظ مجددًا';
  saveRetry.onclick = function (e) {
    e.stopPropagation();
    saveGame();
    if (e.detail > 0) saveRetry.blur();
  };
  saveErrorEl.appendChild(saveRetry);
  document.body.appendChild(saveErrorEl);

  function showSaveError(kind) {
    G.savedFlash = 0; G.saveError = kind;
    renderDirty = true;
    saveErrorText.textContent = kind === 'meta'
      ? 'تم حفظ العالم، لكن تعذر تحديث قائمة العوالم. حاول مجددًا.'
      : 'تعذر حفظ العالم. مساحة التخزين ممتلئة أو غير متاحة. حاول مجددًا.';
    saveErrorEl.hidden = false;
    return false;
  }

  function show(el, on) { el.hidden = !on; }
  function hideAll() { [titleEl, newEl, loadEl, pauseEl, invEl, masterEl].forEach(function (e) { e.hidden = true; }); }

  // Difficulty selector bars (#newDiffBar & #pauseDiffBar)
  function syncDiffUI() {
    var d = G.mode === 'title' || G.mode === 'newworld' ? meta.diff : G.diff;
    var cfg = DIFF_CFG[d] || DIFF_CFG.normal;
    document.querySelectorAll('.diff-bar .dbtn').forEach(function (b) {
      b.classList.toggle('sel', b.getAttribute('data-d') === d);
    });
    var descEl = $('diffDesc');
    if (descEl) descEl.textContent = cfg.desc;
    var pBar = $('pauseDiffBar');
    if (pBar) pBar.style.display = G.gm === 'creative' ? 'none' : 'inline-flex';
  }
  document.querySelectorAll('.diff-bar .dbtn').forEach(function (b) {
    onEv(b, 'click', function () {
      var d = b.getAttribute('data-d');
      if (!DIFF_CFG[d]) return;
      meta.diff = d; G.diff = d;
      Kit.track.tier(DIFF_CFG[d].tier);
      SND.click();
      syncDiffUI();
      if (G.slot && G.mode === 'pause') { saveGame(); renderPause(); }
      else saveMeta();
      renderDirty = true;
    });
  });

  function enterPlay() {
    if (G.gm === 'creative') fillPalette();
    G.mode = 'play';
    Kit.track.tier(G.gm === 'creative' ? 0 : diffCfg().tier);
    Kit.stats.round(G.gm);
    if (G.gm === 'survival' && !G.done.logs) Kit.stats.tutorial('start');
    hideAll();
    pauseBtn.hidden = false;
    G.cam.x = clamp(P.x - VTW / 2, 0, W - VTW);
    G.cam.y = clamp(P.y - VTH / 2, -2, H - VTH);
    rend.warm(G.cam.x, G.cam.y, VTW, VTH);
    G.saveT = 0; G.questT = 1.0;
    pausedInventory = false;
    quickDirty = true; refreshQuickList();
    renderDirty = true;
    K.reset(); M.left = M.right = false; flyTap = 0;
  }

  function toTitle() {
    Kit.stats.end('end', starCount());
    G.saveError = null; G.savedFlash = 0; saveErrorEl.hidden = true;
    G.mode = 'title'; G.slot = 0;
    hideAll();
    pauseBtn.hidden = true;
    startWorld(titleWorld);
    G.animals = titleAnimals; G.mobs = []; G.fuses = []; G.items = [];
    G.cam.x = 140; G.cam.y = titleWorld.surf[160] - 13;
    G.toasts = []; G.hint = null; G.banner = null;
    buildTitle();
    show(titleEl, true);
    renderDirty = true;
  }

  function pause() {
    if (G.mode !== 'play' && G.mode !== 'inv') return;
    pausedInventory = G.mode === 'inv';
    if (pausedInventory) show(invEl, false);
    G.mode = 'pause';
    saveGame();
    syncDiffUI();
    renderPause();
    show(pauseEl, true);
    SND.click();
    renderDirty = true;
  }

  function resume() {
    show(pauseEl, false);
    G.mode = pausedInventory ? 'inv' : 'play';
    if (pausedInventory) { show(invEl, true); renderInv(); }
    pausedInventory = false;
    renderDirty = true;
    K.reset(); M.left = M.right = false;
  }

  $('resumeBtn').onclick = resume;
  $('homeBtn').onclick = function () {
    var sp = spawnPoint();
    P.x = sp.x; P.y = sp.y; P.vx = P.vy = 0; P.flying = false;
    resume(); SND.grow();
    burst(P.x + 0.35, P.y + 1, ['#ffffff', '#4cc9f0', '#ffd60a'], 18, 6, 0.2);
  };
  $('quitBtn').onclick = function () { if (saveGame()) toTitle(); };
  onEv(pauseBtn, 'click', function (e) {
    e.stopPropagation();
    if (G.mode === 'play' || G.mode === 'inv') pause();
    else if (G.mode === 'pause') resume();
    if (e.detail > 0) pauseBtn.blur();
  });
  onEv(pauseBtn, 'pointerdown', function (e) { e.stopPropagation(); });

  function renderPause() {
    var qs = questsFor(G.gm), html = '';
    qs.forEach(function (q) {
      var d = !!G.done[q.id];
      html += '<div class="q' + (d ? ' done' : '') + '"><img src="' + iconURL(q.icon === BW.FLOWER ? B.FLOWER_RED : q.icon) + '"><span>' + q.text + '</span><b dir="ltr">' + (d ? '★' : Mmn(q.need, q.val(G.stats)) + '/' + q.need) + '</b></div>';
    });
    $('pauseQuests').innerHTML = html;
    $('pauseStars').textContent = '★ ' + ltr(starCount() + ' / ' + qs.length);
    $('pauseName').textContent = G.name + ' · ' + (G.gm === 'creative' ? 'إبداع' : ('مغامرة · ' + diffCfg().label));
  }

  onEv(window, 'keydown', function (e) {
    if (!Kit.isGameKeyEvent(e)) return;
    if (G.mode === 'pause' && (e.code === 'KeyP' || e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
      e.preventDefault(); resume();
    } else if (G.mode === 'master' && (e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
      e.preventDefault(); closeMaster();
    } else if (G.mode === 'newworld' && !e.repeat) {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Digit1') { e.preventDefault(); chooseMode('survival'); }
      else if (e.code === 'Digit2') chooseMode('creative');
      else if (e.code === 'Escape') { G.mode = 'title'; show(newEl, false); renderDirty = true; }
    }
  });

  function showMaster() {
    if (G.mode !== 'play') return;
    G.mode = 'master';
    $('masterStars').textContent = '★ ' + ltr(starCount() + ' / ' + questsFor(G.gm).length);
    show(masterEl, true); SND.quest(); confettiBurst(); confettiBurst();
    renderDirty = true;
  }
  function acknowledgeMaster() { G.masterShown = true; G.masterPending = false; return saveGame(); }
  function closeMaster() { acknowledgeMaster(); show(masterEl, false); G.mode = 'play'; renderDirty = true; K.reset(); }
  $('masterKeep').onclick = closeMaster;
  $('masterMenu').onclick = function () { if (acknowledgeMaster()) toTitle(); };

  // ----- Title Screen & World Slots
  function fmtTime(s) {
    var m = Mrn(s / 60);
    if (m < 1) return 'بدأت للتو';
    return 'لعبت ' + (m === 1 ? 'دقيقة واحدة' : m === 2 ? 'دقيقتين' : m <= 10 ? m + ' دقائق' : m + ' دقيقة');
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
  function buildTitle() {
    var wrap = $('slots'); wrap.innerHTML = '';
    for (var i = 1; i <= 3; i++) {
      (function (i) {
        var m = meta.slots[i - 1];
        var card = document.createElement('div');
        card.className = 'slot-card' + (i === selSlot ? ' sel' : '') + (m ? '' : ' empty');
        if (m) {
          card.innerHTML = '<div class="sc-mode ' + m.gm + '">' + (m.gm === 'creative' ? 'إبداع' : 'مغامرة') + '</div>' +
            '<img class="sc-ic" src="' + iconURL(m.gm === 'creative' ? B.TNT : B.GRASS) + '">' +
            '<div class="sc-name">' + escapeHTML(fixName(m.name)) + '</div>' +
            '<div class="sc-stars">★ <span dir="ltr">' + m.stars + ' / ' + m.max + '</span></div>' +
            '<div class="sc-time">' + fmtTime(m.play || 0) + '</div>' +
            '<button class="sc-del" title="احذف العالم" aria-label="احذف العالم">✕</button>';
        } else {
          card.innerHTML = '<div class="sc-plus">+</div><div class="sc-name">عالم جديد</div><div class="sc-time">الخانة ' + i + '</div>';
        }
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

  function titlePlay() {
    if (titleBusy || G.mode !== 'title') return;
    A.unlock(); SND.click();
    if (meta.slots[selSlot - 1]) {
      titleBusy = true; show(loadEl, true);
      setTimeout(function () {
        var ok = false;
        try { ok = loadGame(selSlot); } catch (e) { ok = false; }
        titleBusy = false;
        if (!ok) { show(loadEl, false); meta.slots[selSlot - 1] = null; saveMeta(); buildTitle(); }
      }, 20);
    } else {
      G.mode = 'newworld';
      syncDiffUI();
      show(newEl, true);
      renderDirty = true;
    }
  }
  function chooseMode(gm) {
    if (titleBusy) return;
    titleBusy = true;
    show(newEl, false); show(loadEl, true); SND.click();
    setTimeout(function () { newGame(selSlot, gm); titleBusy = false; }, 20);
  }
  $('playBtn').onclick = titlePlay;
  $('modeSurv').onclick = function () { chooseMode('survival'); };
  $('modeCrea').onclick = function () { chooseMode('creative'); };
  $('modeBack').onclick = function () { G.mode = 'title'; show(newEl, false); renderDirty = true; };

  // Skin picker preview
  var skinCv = $('skinCv'), skinCtx = skinCv.getContext('2d');
  function drawSkinPreview() {
    var sk = BW.SKINS[meta.skin] || BW.SKINS[0];
    var locked = meta.totalStars < sk.stars;
    skinCtx.setTransform(1, 0, 0, 1, 0, 0);
    skinCtx.clearRect(0, 0, skinCv.width, skinCv.height);
    skinCtx.imageSmoothingEnabled = false;
    skinCtx.translate(skinCv.width / 2, skinCv.height - 8);
    skinCtx.scale(1.85, 1.85);
    if (locked) skinCtx.filter = 'brightness(0)';
    BW.drawPlayer(skinCtx, { walk: 0, walkAmt: 0, swing: -0.35, look: 0, skin: sk, held: I.PICK_DIAMOND });
    skinCtx.filter = 'none';
    $('skinName').textContent = locked ? '🔒 ' + sk.name : sk.name;
    $('skinInfo').textContent = locked ? 'اجمع ' + sk.stars + ' ★ لتفتحه' : 'الزي ' + (meta.skin + 1) + ' من ' + BW.SKINS.length;
  }
  function skinStep(d) {
    var n = BW.SKINS.length;
    meta.skin = (meta.skin + d + n) % n;
    SND.click(); drawSkinPreview();
    if (meta.totalStars >= BW.SKINS[meta.skin].stars) saveMeta();
  }
  $('skinL').onclick = function () { skinStep(-1); };
  $('skinR').onclick = function () { skinStep(1); };
  function wornSkin() { var sk = BW.SKINS[meta.skin]; return sk && meta.totalStars >= sk.stars ? sk : BW.SKINS[0]; }
  function activeSkinFix() { var sk = BW.SKINS[meta.skin]; if (!sk || meta.totalStars < sk.stars) meta.skin = 0; }

  // ============================================================ Backpack (#inv) & Crafting UI
  var bagEl = $('bag'), hotEl = $('hot'), palEl = $('palette'), craftEl = $('craftList'), curEl = $('cursorStack');
  var slotEls = [], pressFrom = -1, craftOrder = null;

  function mkSlot(i) {
    var d = document.createElement('div');
    d.className = 'islot';
    d.innerHTML = '<img draggable="false"><span></span>';
    onEv(d, 'mousedown', function (e) {
      e.preventDefault();
      var held = G.cursor;
      slotClick(i, e);
      pressFrom = e.button === 0 && !held && G.cursor ? i : -1;
    });
    onEv(d, 'mouseup', function (e) {
      var from = pressFrom;
      pressFrom = -1;
      if (e.button === 0 && from >= 0 && from !== i && G.cursor && G.mode === 'inv') slotClick(i, e);
    });
    onEv(d, 'contextmenu', function (e) { e.preventDefault(); });
    slotEls[i] = d;
    return d;
  }
  for (var si = 9; si < 36; si++) bagEl.appendChild(mkSlot(si));
  for (si = 0; si < 9; si++) hotEl.appendChild(mkSlot(si));
  onEv(window, 'mouseup', function () { pressFrom = -1; });

  var PALETTE = [];
  Object.keys(ITEMS).forEach(function (k) { var it = ITEMS[k]; if (it.place && TEX[it.place]) PALETTE.push(+k); });
  PALETTE.sort(function (a, b) { return a - b; });
  var palImgs = [], palFilled = false;
  function fillPalette() {
    if (palFilled) return;
    palFilled = true;
    palImgs.forEach(function (o) { o[0].src = iconURL(o[1]); });
  }
  PALETTE.forEach(function (id) {
    var d = document.createElement('div');
    d.className = 'islot pal';
    d.title = BW.itemName(id);
    d.innerHTML = '<img draggable="false">';
    palImgs.push([d.firstChild, id]);
    onEv(d, 'mousedown', function (e) {
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
      var range = i < 9 ? [9, 36] : [0, 9];
      inv[i] = null;
      var left = s.n, mx = BW.maxStack(s.id), j;
      for (j = range[0]; j < range[1] && left > 0; j++) {
        if (inv[j] && inv[j].id === s.id && inv[j].n < mx) { var k = Mmn(left, mx - inv[j].n); inv[j].n += k; left -= k; }
      }
      for (j = range[0]; j < range[1] && left > 0; j++) {
        if (!inv[j]) { inv[j] = { id: s.id, n: left }; left = 0; }
      }
      if (left > 0) inv[i] = { id: s.id, n: left };
    } else if (e.button === 2) {
      if (!c && s) {
        var half = Math.ceil(s.n / 2);
        G.cursor = { id: s.id, n: half }; s.n -= half;
        if (s.n <= 0) inv[i] = null;
      } else if (c && (!s || (s.id === c.id && s.n < BW.maxStack(s.id)))) {
        if (!s) inv[i] = { id: c.id, n: 1 }; else s.n++;
        c.n--; if (c.n <= 0) G.cursor = null;
      }
    } else {
      if (!c) { if (s) { G.cursor = s; inv[i] = null; } }
      else if (!s) { inv[i] = c; G.cursor = null; }
      else if (s.id === c.id) {
        var mx2 = BW.maxStack(s.id), k2 = Mmn(c.n, mx2 - s.n);
        s.n += k2; c.n -= k2; if (c.n <= 0) G.cursor = null;
      } else { inv[i] = c; G.cursor = s; }
    }
    SND.click(); invDirty = true; quickDirty = true; renderInv();
  }

  function openInv() {
    if (G.mode !== 'play') return;
    G.mode = 'inv';
    craftOrder = null;
    if (G.gm === 'creative') fillPalette();
    nearStations();
    invEl.classList.toggle('creative', G.gm === 'creative');
    show(invEl, true);
    invDirty = true; renderInv();
    SND.click();
    M.left = M.right = false;
    renderDirty = true;
  }

  function closeInv() {
    if (G.cursor) {
      var left = addItem(G.cursor.id, G.cursor.n);
      if (left) spawnItem(P.x + P.w / 2, P.y, G.cursor.id, left, P.face * 4, -4);
      G.cursor = null;
    }
    show(invEl, false);
    G.mode = 'play';
    SND.click(); renderCursor();
    renderDirty = true;
    K.reset(); M.left = M.right = false;
  }
  $('invClose').onclick = closeInv;

  function renderInv() {
    invDirty = false;
    var qid = questPlaceItem(), qs = questPlaceSlot(), c = G.cursor, cur = G.inv[G.sel];
    var inHot = (qs >= 0 && qs < 9) || (qid && cur && cur.id === qid);
    var held = qid && c && c.id === qid && !inHot;
    if (held) qs = -1;
    $('hotTip').textContent = held
      ? '★ انقر على خانة هنا لتضع ' + BW.itemName(qid)
      : qs >= 9 ? '★ انقر على ' + BW.itemName(G.inv[qs].id) + ' ثم على خانة هنا' : '';
    hotEl.classList.toggle('qdrop', !!held);

    for (var i = 0; i < 36; i++) {
      var el = slotEls[i], s = G.inv[i], img = el.firstChild, sp = el.lastChild;
      var src = s ? iconURL(s.id) : '';
      if (img.getAttribute('data-id') !== String(s ? s.id : '')) {
        img.setAttribute('data-id', s ? s.id : '');
        if (src) img.src = src; else img.removeAttribute('src');
      }
      img.style.visibility = s ? 'visible' : 'hidden';
      sp.textContent = s && s.n > 1 && G.gm === 'survival' ? s.n : '';
      el.classList.toggle('selected', i === G.sel);
      el.classList.toggle('qslot', i === qs && qs >= 9);
      el.title = s ? BW.itemName(s.id) : '';
    }
    renderCursor();
    if (G.gm === 'survival') renderCraft();
    $('stTable').className = 'station' + (G.nearTable ? ' on' : '');
    $('stFurnace').className = 'station' + (G.nearFurnace ? ' on' : '');
    var pk = bestPick();
    $('invPick').innerHTML = pk.id
      ? '<img src="' + iconURL(pk.id) + '"> تحفر تلقائيًا بأقوى معول: <b>' + BW.itemName(pk.id) + '</b>'
      : '💡 اصنع معولًا خشبيًا — سيحفر البطل به تلقائيًا حتى لو أمسكت مكعبًا!';
  }

  function renderCursor() {
    var c = G.cursor;
    if (!c) { curEl.hidden = true; return; }
    curEl.hidden = false;
    curEl.innerHTML = '<img src="' + iconURL(c.id) + '"><span>' + (c.n > 1 ? c.n : '') + '</span>';
  }
  function moveCursorEl(e) {
    if (curEl.hidden) return;
    var r = ui.getBoundingClientRect(), sc = view.scale;
    curEl.style.left = ((e.clientX - r.left) / sc - 24) + 'px';
    curEl.style.top = ((e.clientY - r.top) / sc - 24) + 'px';
  }

  function stationOK(r) { return !r.st || G.gm === 'creative' || (r.st === 'table' ? G.nearTable : G.nearFurnace); }
  function hasIngredients(r, times) {
    for (var i = 0; i < r.ing.length; i++) if (countItem(r.ing[i][0]) < r.ing[i][1] * (times || 1)) return false;
    return true;
  }
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
    if (done) {
      SND.craft();
      checkQuests();
      refreshQuickList();
      floatText(P.x + P.w / 2, P.y - 0.3, plusN(r.n * done, BW.itemName(r.out)), '#9cf0b8');
      renderDirty = true;
    }
    return done;
  }

  function recipeRow(r, idx) {
    var ok = stationOK(r), has = hasIngredients(r), can = ok && has;
    var row = document.createElement('div');
    var qr = questRecipe(), isQuest = qr === r;
    row.className = 'crow' + (can ? ' can' : '') + (isQuest ? ' quest' : '');
    var ing = r.ing.map(function (g) {
      var have = countItem(g[0]);
      return '<span class="ing' + (have >= g[1] ? ' ok' : '') + '"><img src="' + iconURL(g[0] === BW.FLOWER ? B.FLOWER_RED : g[0]) + '" title="' + BW.itemName(g[0]) + '"><bdi dir="ltr">' + Mmn(have, 99) + '/' + g[1] + '</bdi></span>';
    }).join('');
    var st = r.st ? '<span class="need' + (ok ? ' ok' : '') + '"><img src="' + iconURL(r.st === 'table' ? B.TABLE : B.FURNACE) + '">' + (ok ? '' : 'قف قربه') + '</span>' : '';
    row.innerHTML = '<img class="out" src="' + iconURL(r.out) + '"><div class="cname">' + (isQuest ? '<span class="qtag">★ مهمتك</span>' : '') + BW.itemName(r.out) + (r.n > 1 ? ' <small dir="ltr">×' + r.n + '</small>' : '') + '</div><div class="cing">' + ing + st + '</div><button class="cbtn">' + (can ? 'اصنع' : '') + '</button>';
    onEv(row, 'mousedown', function (e) {
      e.preventDefault();
      if (!can) {
        row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
        SND.bonk();
        if (!ok) tip('قف قرب ' + (r.st === 'table' ? 'طاولة الصنع' : 'الفرن') + ' لتصنع هذا');
        return;
      }
      var n = craft(r, e.shiftKey ? 10 : 1);
      if (n) {
        renderInv();
        var nr = craftEl.querySelector('[data-r="' + idx + '"]');
        if (nr) nr.classList.add('flash');
      }
    });
    row.setAttribute('data-r', idx);
    return row;
  }

  // Keep craftOrder stable while #inv is open so double-clicking never shuffles another recipe under cursor!
  function renderCraft() {
    var st = craftEl.scrollTop;
    craftEl.innerHTML = '';
    var rows = BW.RECIPES.map(function (r, i) { return { r: r, i: i, can: stationOK(r) && hasIngredients(r), has: hasIngredients(r) }; });
    var wool = rows.filter(function (o) { return o.r.cat === 'wool'; });
    var rest = rows.filter(function (o) { return o.r.cat !== 'wool'; });
    var qr = questRecipe();
    if (craftOrder) {
      rest.sort(function (a, b) { return craftOrder.indexOf(a.i) - craftOrder.indexOf(b.i); });
    } else {
      rest.sort(function (a, b) { return ((b.r === qr) - (a.r === qr)) || (b.can - a.can) || (b.has - a.has) || (a.i - b.i); });
      craftOrder = rest.map(function (o) { return o.i; });
    }
    rest.forEach(function (o) { craftEl.appendChild(recipeRow(o.r, o.i)); });

    var wr = document.createElement('div');
    wr.className = 'crow woolrow' + (countItem(B.WOOL) && countItem(I.DYE) ? ' can' : '');
    var html = '<img class="out" src="' + iconURL(B.WOOL + 1) + '"><div class="cname">لوّن الصوف<br><small><bdi dir="ltr">1 <img src="' + iconURL(B.WOOL) + '"> + 1 <img src="' + iconURL(I.DYE) + '"></bdi></small></div><div class="swatches">';
    wool.forEach(function (o) { html += '<button data-w="' + o.i + '" style="background:' + BW.WOOL_COLS[o.r.out - B.WOOL] + '" title="' + BW.itemName(o.r.out) + '"></button>'; });
    wr.innerHTML = html + '</div>';
    wr.querySelectorAll('button').forEach(function (b) {
      onEv(b, 'mousedown', function (e) {
        e.preventDefault(); e.stopPropagation();
        var r = BW.RECIPES[+b.getAttribute('data-w')];
        if (!craft(r, e.shiftKey ? 10 : 1)) { SND.bonk(); tip('تحتاج صوفًا أبيض وصبغة قوس قزح من الأزهار!'); }
        else renderInv();
      });
    });
    var anchor = craftEl.children[Mmn(craftEl.children.length, 6)];
    craftEl.insertBefore(wr, anchor || null);
    craftEl.scrollTop = st;
  }

  // ----------------------------------------------------------- boot & lifecycle
  var titleWorld = new BW.World(424242);
  titleWorld.generate();
  G.world = titleWorld;
  G.spawn = { x: BW.SPAWN_X, y: 0 };
  var titleAnimals = spawnAnimals(BW.mulberry(99));
  P = makePlayer(BW.SPAWN_X, 40);
  recoverSlotMetadata();
  activeSkinFix();
  syncDiffUI();
  toTitle();
  rend.warm(G.cam.x, G.cam.y, VTW, VTH);

  var muteBtn = Kit.muteButton();
  muteBtn.setAttribute('aria-label', 'تشغيل الصوت أو كتمه');
  muteBtn.title = 'الصوت (M)';

  Kit.loop(update, render);

  // Redraw frozen canvas once when web fonts finish loading, then settle back to 0 paints
  try {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { renderDirty = true; }, function () {});
    }
  } catch (e) { /* ignore */ }

  function persist() {
    // Restore any active sizzling TNT blocks before saving so nothing vanishes across reload
    for (var i = 0; i < G.fuses.length; i++) G.world.set(G.fuses[i].x, G.fuses[i].y, B.TNT);
    if (G.slot && (G.mode === 'play' || G.mode === 'inv' || G.mode === 'pause' || G.mode === 'master')) saveGame();
    for (i = 0; i < G.fuses.length; i++) G.world.set(G.fuses[i].x, G.fuses[i].y, B.AIR);
  }
  onEv(window, 'pagehide', persist);
  onEv(window, 'beforeunload', persist);

  window.__game = {
    G: G, meta: meta,
    get player() { return P; },
    input: M,
    give: function (id, n) { return addItem(id, n || 1); },
    tp: function (x, y) { P.x = x; P.y = y; P.vx = P.vy = 0; },
    setTime: function (t) { G.tod = t; renderDirty = true; },
    completeAll: function () { questsFor(G.gm).forEach(function (q) { if (!G.done[q.id]) completeQuest(q); }); },
    save: saveGame,
    breakAt: function (x, y) { breakBlock(x, y); },
    placeAt: function (x, y) { return placeBlock(G.sel, x, y); },
    craftId: function (id, n) { var r = BW.RECIPES.filter(function (r) { return r.out === id; })[0]; return r ? craft(r, n || 1) : 0; },
    surfaceY: surfaceY,
    get guide() { return guide; },
    get confettiCount() { return confetti.length; },
    render: function () { render(); },
    update: function (dt) { update(dt || 1 / 60); },
    B: B, I: I, sfx: SND
  };

  Kit.lifecycle({
    pause: function (reason) {
      if (G.mode === 'play' || G.mode === 'inv') pause();
      else if (reason === 'hidden') persist();
    },
    reset: function () { M.left = M.right = M.lp = M.rp = false; M.wheel = 0; M.realClick = false; flyTap = 0; }
  });
  Kit.ready();
})();
