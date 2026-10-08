/* Paint Grab (لوّن الأرض) — game flow, rendering, HUD, UI, sound. */
(function () {
  'use strict';
  var PG = window.PG, Art = PG.Art;
  var W = 1280, H = 720, N = PG.N, NN = N * N, CS = PG.CS, MW = N * CS;
  var TEX = 4, TW = N * TEX;
  var TAU = Math.PI * 2;
  var FONT = 'Fredoka';

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), uiEl = $('ui');
  var view = Kit.fit(canvas, W, H, { onResize: function (v) { layoutUI(v); } });
  var ctx = view.ctx;
  var ptr = Kit.pointer(view);
  var store = Kit.store('paint-grab');
  var muteBtn = Kit.muteButton();
  muteBtn.setAttribute('aria-label', 'تشغيل/كتم الصوت');
  muteBtn.title = 'الصوت (M)';

  function layoutUI(v) {
    frameDirty = true;   // resizing clears the canvas
    if (!uiEl) uiEl = $('ui');
    uiEl.style.transform = 'scale(' + v.scale + ')';
    uiEl.style.left = canvas.style.left;
    uiEl.style.top = canvas.style.top;
  }
  layoutUI(view);

  /* ============================================================ save */
  var save = (function () {
    var s = store.get('save', null) || {};
    function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
    // list index: a whole number inside the list, else 0 (a stale or edited save must not crash boot)
    function idx(v, list) { return typeof v === 'number' && v % 1 === 0 && v >= 0 && v < list.length ? v : 0; }
    var o = {
      best: num(s.best, 0), kills: num(s.kills, 0), rounds: num(s.rounds, 0), wins: num(s.wins, 0),
      stars: [], bestA: [], arena: idx(s.arena, PG.ARENAS),
      skin: { c: 0, f: 0, p: 0 }, seen: s.seen && typeof s.seen === 'object' ? s.seen : null
    };
    for (var i = 0; i < PG.ARENAS.length; i++) {
      var st = s.stars && s.stars[i] || [0, 0, 0];
      o.stars.push([st[0] ? 1 : 0, st[1] ? 1 : 0, st[2] ? 1 : 0]);
      o.bestA.push(num(s.bestA && s.bestA[i], 0));
    }
    if (s.skin) { o.skin.c = idx(s.skin.c, PG.COLORS); o.skin.f = idx(s.skin.f, PG.FACES); o.skin.p = idx(s.skin.p, PG.PATTERNS); }
    return o;
  })();
  // A failed write (full or blocked storage) keeps progress in memory and shows the shared retry note.
  var saveUi = Kit.saveStatus({ retry: persist });
  function persist() { if (store.set('save', save)) saveUi.saved(); else saveUi.failed(); }
  function totalStars() { var t = 0; save.stars.forEach(function (a) { t += a[0] + a[1] + a[2]; }); return t; }
  function statOf(t) {
    return t === 'best' ? save.best : t === 'kills' ? save.kills : t === 'stars' ? totalStars() : t === 'rounds' ? save.rounds : t === 'wins' ? save.wins : 0;
  }
  function unlocked(item) { return !!item && (!item.req || statOf(item.req.t) >= item.req.v); }
  function arenaUnlocked(i) { if (i === 0) return true; var s = save.stars[i - 1]; return s[0] + s[1] + s[2] >= 2; }
  function unlockedKeys() {
    var k = [];
    PG.COLORS.forEach(function (it, i) { if (unlocked(it)) k.push('c' + i); });
    PG.FACES.forEach(function (it, i) { if (unlocked(it)) k.push('f' + i); });
    PG.PATTERNS.forEach(function (it, i) { if (unlocked(it)) k.push('p' + i); });
    return k;
  }
  if (!save.seen) { save.seen = {}; unlockedKeys().forEach(function (k) { save.seen[k] = 1; }); }
  if (!unlocked(PG.COLORS[save.skin.c])) save.skin.c = 0;
  if (!unlocked(PG.FACES[save.skin.f])) save.skin.f = 0;
  if (!unlocked(PG.PATTERNS[save.skin.p])) save.skin.p = 0;
  if (!arenaUnlocked(save.arena)) save.arena = 0;

  /* ============================================================ sound */
  var A = Kit.audio;
  // Sound design notes: no raw square waves (they buzz and click on laptop speakers), no
  // bright noise bursts (a 6 kHz noise tail on big captures used to hiss), and bigger
  // captures get a deeper, heavier "whomp" so they *feel* bigger instead of just longer.
  var lastWarnS = -1;
  var S = {
    leave: function () { A.tone({ freq: 380, to: 620, type: 'sine', dur: 0.1, vol: 0.09 }); },
    capture: function (g) {
      var n = g > 900 ? 6 : g > 350 ? 5 : g > 120 ? 4 : g > 30 ? 3 : 2;
      var big = Math.min(1, g / 900);
      A.tone({ freq: 260, to: 1000, type: 'sine', dur: 0.12, vol: 0.24 });
      var notes = [523, 659, 784, 1047, 1319, 1568];
      for (var i = 0; i < n; i++) A.tone({ freq: notes[i], type: 'triangle', dur: 0.14 + (i === n - 1 ? 0.12 : 0), vol: 0.13 + big * 0.04, delay: 0.05 + i * 0.055 });
      if (n >= 4) {
        // soft low "whomp" + a sparkle an octave up for the big ones
        A.tone({ freq: 150, to: 55, type: 'sine', dur: 0.3 + big * 0.2, vol: 0.2 + big * 0.18, attack: 0.01 });
        A.tone({ freq: notes[n - 1] * 2, type: 'sine', dur: 0.25, vol: 0.05 + big * 0.04, delay: 0.08 + n * 0.055 });
      }
    },
    kill: function () {
      A.tone({ freq: 240, to: 70, type: 'triangle', dur: 0.22, vol: 0.4 });
      A.noise({ dur: 0.16, vol: 0.2, filter: 1500, to: 250 });
      A.tone({ freq: 880, type: 'triangle', dur: 0.08, vol: 0.16, delay: 0.14 });
      A.tone({ freq: 1320, type: 'triangle', dur: 0.18, vol: 0.16, delay: 0.2 });
    },
    poof: function (v) { A.noise({ dur: 0.25, vol: 0.16 * v, filter: 1200, to: 200 }); A.tone({ freq: 500, to: 150, type: 'sine', dur: 0.18, vol: 0.12 * v }); },
    die: function () {
      A.noise({ dur: 0.4, vol: 0.34, filter: 1500, to: 100 });
      [440, 370, 311, 262].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.25, delay: 0.15 + i * 0.13 }); });
    },
    // danger beeps: soft two-note triangle "uh-oh", never faster than 2.5 per second
    warn: function () {
      var t = A.ctx ? A.ctx.currentTime : 0;
      if (t - lastWarnS < 0.38) return;
      lastWarnS = t;
      A.tone({ freq: 880, type: 'triangle', dur: 0.07, vol: 0.09 }); A.tone({ freq: 660, type: 'triangle', dur: 0.08, vol: 0.09, delay: 0.08 });
    },
    tick: function () { A.tone({ freq: 1175, type: 'triangle', dur: 0.06, vol: 0.12 }); },
    milestone: function () { [659, 784, 988, 1319].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.17, delay: i * 0.07 }); }); },
    star: function (i) { A.tone({ freq: [784, 988, 1319][i] || 988, type: 'triangle', dur: 0.3, vol: 0.28 }); A.tone({ freq: ([784, 988, 1319][i] || 988) * 1.5, type: 'sine', dur: 0.3, vol: 0.12, delay: 0.06 }); },
    click: function () { A.tone({ freq: 620, to: 880, type: 'triangle', dur: 0.06, vol: 0.16 }); },
    start: function () { [392, 523, 659, 784].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.2, delay: i * 0.08 }); }); },
    win: function () { Kit.sfx.win(); },
    lose: function () { Kit.sfx.lose(); },
    unlock: function () { [784, 988, 1175, 1568].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.2, delay: 0.4 + i * 0.09 }); }); },
    nope: function () { A.tone({ freq: 220, to: 150, type: 'triangle', dur: 0.14, vol: 0.2 }); }
  };

  /* ============================================================ textures */
  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  var topCv = mkCanvas(TW, TW), topCtx = topCv.getContext('2d'), topImg = topCtx.createImageData(TW, TW), topU = new Uint32Array(topImg.data.buffer);
  var shCv = mkCanvas(TW, TW), shCtx = shCv.getContext('2d'), shImg = shCtx.createImageData(TW, TW), shU = new Uint32Array(shImg.data.buffer);
  var miniCv = mkCanvas(N, N), miniCtx = miniCv.getContext('2d'), miniImg = miniCtx.createImageData(N, N), miniU = new Uint32Array(miniImg.data.buffer);
  var dirty = { any: false, x0: N, y0: N, x1: -1, y1: -1 };
  var skins = [];      // by agent id
  var world = null;

  function markDirty(x, y) {
    dirty.any = true;
    if (x < dirty.x0) dirty.x0 = x; if (x > dirty.x1) dirty.x1 = x;
    if (y < dirty.y0) dirty.y0 = y; if (y > dirty.y1) dirty.y1 = y;
  }
  // Territory is drawn from shown[] (what the reveal wave has reached so far), never straight from
  // world.owner. A changed cell repaints its own 4x4 block and the 8 around it at the next flush,
  // because each block's corners depend on its neighbours (see paintBlock).
  var shown = new Uint8Array(NN), flashing = new Uint8Array(NN);
  var need = new Uint8Array(NN), needList = new Int32Array(NN), needN = 0;
  function showCell(c, id, flash) {
    shown[c] = id; flashing[c] = flash;
    var x = c % N, y = (c / N) | 0;
    miniU[c] = id ? Art.baseOf(skins[id], x, y) : 0;
    for (var yy = Math.max(0, y - 1); yy <= Math.min(N - 1, y + 1); yy++) {
      for (var xx = Math.max(0, x - 1); xx <= Math.min(N - 1, x + 1); xx++) {
        var k = yy * N + xx;
        if (!need[k]) { need[k] = 1; needList[needN++] = k; }
      }
    }
  }
  function paintCell(c) { showCell(c, world.owner[c], 0); }
  function flashCell(c) { var id = world.owner[c]; if (id) showCell(c, id, 1); }

  // Smooth edges at texel level: the 3 texels nearest each block corner (CORNER: quadrant 0-3,
  // 4 = middle) take cornerOwner(). Outside corners of a territory are cut back to the floor and
  // inside corners of a neighbouring territory are filled with its colour, so captured land gets
  // rounded edges instead of hard 16 px stairs. The grid rules in sim.js still use whole cells.
  var CORNER = [0, 0, 1, 1, 0, 4, 4, 1, 2, 4, 4, 3, 2, 2, 3, 3], cq = new Uint8Array(5);
  function cornerOwner(id, h, v) { return h === v && h && h !== id ? h : id && h !== id && v !== id ? 0 : id; }
  function paintBlock(c) {
    var x = c % N, y = (c / N) | 0, id = shown[c], fl = flashing[c];
    // off-map neighbours count as this cell's owner, so land stays square along the map edge
    var up = y > 0 ? shown[c - N] : id, dn = y < N - 1 ? shown[c + N] : id;
    var lf = x > 0 ? shown[c - 1] : id, rt = x < N - 1 ? shown[c + 1] : id;
    cq[0] = cornerOwner(id, lf, up); cq[1] = cornerOwner(id, rt, up);
    cq[2] = cornerOwner(id, lf, dn); cq[3] = cornerOwner(id, rt, dn); cq[4] = id;
    for (var py = 0; py < TEX; py++) {
      var row = (y * TEX + py) * TW + x * TEX;
      for (var px = 0; px < TEX; px++) {
        var o = cq[CORNER[py * TEX + px]], sk = o && skins[o];
        if (!sk) { topU[row + px] = 0; shU[row + px] = 0; continue; }
        topU[row + px] = fl && o === id ? Art.flashOf(sk, x, y) : Art.texel(sk, x, y, px, py);
        shU[row + px] = Art.shadeOf(sk, x, y);
      }
    }
    markDirty(x, y);
  }
  function flushTex() {
    for (var i = 0; i < needN; i++) { need[needList[i]] = 0; paintBlock(needList[i]); }
    needN = 0;
    if (!dirty.any) return;
    var x = dirty.x0 * TEX, y = dirty.y0 * TEX, w = (dirty.x1 - dirty.x0 + 1) * TEX, h = (dirty.y1 - dirty.y0 + 1) * TEX;
    topCtx.putImageData(topImg, 0, 0, x, y, w, h);
    shCtx.putImageData(shImg, 0, 0, x, y, w, h);
    miniCtx.putImageData(miniImg, 0, 0);
    dirty.any = false; dirty.x0 = N; dirty.y0 = N; dirty.x1 = -1; dirty.y1 = -1;
  }
  function clearTex() {
    topU.fill(0); shU.fill(0); miniU.fill(0);
    shown.fill(0); flashing.fill(0); need.fill(0); needN = 0;
    putTex();
    dirty.any = false; dirty.x0 = N; dirty.y0 = N; dirty.x1 = -1; dirty.y1 = -1;
    waves.length = 0; ringHead = ringTail = 0;
  }
  // copies all kept pixel data to the cached canvases (also after a GPU reset blanked them)
  function putTex() { topCtx.putImageData(topImg, 0, 0); shCtx.putImageData(shImg, 0, 0); miniCtx.putImageData(miniImg, 0, 0); }

  // reveal waves (fill animation) and flash ring
  var waves = [];
  var RING = 1 << 16, ringC = new Int32Array(RING), ringT = new Float32Array(RING), ringHead = 0, ringTail = 0;
  var clock = 0;
  function addWave(cells, ox, oy, flash, dur) {
    if (!cells.length) return;
    var n = cells.length, keys = new Float64Array(n), maxD = 1;
    for (var i = 0; i < n; i++) {
      var c = cells[i], dx = (c % N) + 0.5 - ox, dy = ((c / N) | 0) + 0.5 - oy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > maxD) maxD = d;
      keys[i] = Math.floor(d * 16) * NN + c;
    }
    keys.sort();
    waves.push({ keys: keys, i: 0, t0: clock, k: Math.min(0.03, (dur || 0.55) / maxD) / 16, flash: flash });
  }
  function updateWaves() {
    for (var w = waves.length - 1; w >= 0; w--) {
      var wv = waves[w], el = clock - wv.t0, keys = wv.keys;
      while (wv.i < keys.length) {
        var key = keys[wv.i], dq = Math.floor(key / NN);
        if (dq * wv.k > el) break;
        var c = key - dq * NN;
        if (wv.flash && world.owner[c]) {
          flashCell(c);
          var nx = (ringTail + 1) & (RING - 1);
          if (nx === ringHead) paintCell(c); else { ringC[ringTail] = c; ringT[ringTail] = clock; ringTail = nx; }
        } else paintCell(c);
        wv.i++;
      }
      if (wv.i >= keys.length) waves.splice(w, 1);
    }
    while (ringHead !== ringTail && clock - ringT[ringHead] > 0.12) { paintCell(ringC[ringHead]); ringHead = (ringHead + 1) & (RING - 1); }
  }

  /* ============================================================ effects */
  var parts = [], sparts = [];   // world-space and screen-space particles
  // Confetti, sparkles and full-screen flashes are decoration: reduced motion (or the classroom
  // preset) turns them off. Capture waves, popups and banners stay because they carry information.
  var calm = Kit.motion.reduced();
  Kit.motion.onChange(function (r) { calm = r; frameDirty = true; if (r) { parts.length = 0; sparts.length = 0; flashA = 0; } });
  function part(x, y, o) {
    if (calm) return;
    var L = o.screen ? sparts : parts;
    if (L.length > 420) L.shift();
    L.push({ x: x, y: y, vx: o.vx || 0, vy: o.vy || 0, life: o.life || 0.6, max: o.life || 0.6, size: o.size || 5, color: o.color || '#fff', g: o.g == null ? 300 : o.g, kind: o.kind || 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, drag: o.drag || 0 });
  }
  function burst(x, y, n, colors, speed, o) {
    o = o || {};
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, sp = speed * (0.35 + Math.random() * 0.65);
      part(x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0), life: (o.life || 0.7) * (0.6 + Math.random() * 0.5), size: (o.size || 6) * (0.6 + Math.random() * 0.7), color: colors[i % colors.length], g: o.g == null ? 380 : o.g, kind: o.kind == null ? (i % 3) : o.kind, drag: o.drag || 0, screen: o.screen });
    }
  }
  function updateParts(dt) { updList(parts, dt); updList(sparts, dt); }
  function updList(parts, dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  }
  function drawParts(parts) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], a = Math.min(1, p.life / p.max * 1.5);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 1) { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.6, 0, TAU); ctx.fill(); }
      else if (p.kind === 2) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); Art.star(ctx, 0, 0, p.size, p.size * 0.45); ctx.fill(); ctx.restore(); }
      else if (p.kind === 3) { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - a * 0.6), 0, TAU); ctx.fill(); }
      else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
  }
  var popups = [];   // world space
  function popup(x, y, text, color, size, life) { popups.push({ x: x, y: y, text: text, color: color, size: size || 30, t: 0, life: life || 1.2 }); if (popups.length > 20) popups.shift(); }
  var banners = [];  // screen space
  // Banners play one at a time (a queue) so they never draw on top of each other.
  function banner(text, color, size, life, sub, now) {
    var b = { text: text, color: color || '#ffcf33', size: size || 60, t: 0, life: life || 1.6, sub: sub || '' };
    if (now) banners.length = 0;
    banners.push(b);
    if (banners.length > 3) banners.splice(1, 1);
  }
  var feed = [];
  function addFeed(text, hl) { feed.unshift({ text: text, t: 0, hl: hl }); if (feed.length > 4) feed.pop(); }
  var shake = Kit.shake();
  var flashA = 0, flashColor = '#fff';

  /* ============================================================ game state */
  var state = 'title';        // title | skins | play | pause | ending | over
  var arenaIdx = save.arena, arena = PG.ARENAS[arenaIdx], theme = arena.theme;
  var player = null, timeLeft = PG.MATCH_TIME, matchT = 0;
  var cam = { x: MW / 2, y: MW / 2, z: 1 };
  var agentFx = [];           // per id anim state
  var inputMode = 'keys', lastPtr = { x: 0, y: 0, t: 0 }, keysUsed = false;
  var namePool = [], nameIdx = 0;
  var lb = [], lbT = 0;
  var warnT = 0, threat = null, lastTick = -1;
  var ending = null, endT = 0, result = null;
  var milestones = {}, killStreakT = 0, killStreak = 0;
  var attract = { t: 0, follow: 0 };
  var overLock = 0;
  var PLAYER_START_R = 4.8;   // a roomier start base than the bots (kids need a safe spot to learn)
  var homeDir = null, homeT = 0, capCount = 0;

  // Floor tile per arena: the checker plus faint themed doodads (sweets, shells, mushrooms,
  // balloons, clouds). 256 px is 16 cells, a multiple of the 2-cell checker. Each tile is built once
  // and the floor stays a single pattern fill, so the per-frame cost does not change.
  var floorTiles = [], FT = 256;
  function seeded(s) { return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
  function floorTile(i) {
    if (floorTiles[i]) return floorTiles[i];
    var th = PG.ARENAS[i].theme, t = mkCanvas(FT, FT), c = t.getContext('2d');
    c.fillStyle = th.bg; c.fillRect(0, 0, FT, FT);
    c.fillStyle = th.grid;
    for (var y = 0; y < FT; y += CS) for (var x = (y / CS & 1) ? 0 : CS; x < FT; x += CS * 2) c.fillRect(x, y, CS, CS);
    // doodads are drawn solid on their own layer, then laid over the checker at low opacity so they
    // stay pale and never read as territory or trails; white details become soft cut-outs
    var L = mkCanvas(FT, FT), d = L.getContext('2d'), rnd = seeded(i * 131 + 7), k;
    d.lineCap = 'round'; d.lineJoin = 'round';
    for (k = 0; k < 9; k++) {   // jittered 3x3 grid, kept clear of the tile edge so nothing is cut
      doodad(d, i, rnd() < 0.5 ? 1 : 2, (k % 3 + 0.5) * FT / 3 + (rnd() - 0.5) * 40, ((k / 3 | 0) + 0.5) * FT / 3 + (rnd() - 0.5) * 40, 11 + rnd() * 4, (rnd() - 0.5) * 0.9, th);
    }
    for (k = 0; k < 5; k++) doodad(d, i, 0, 14 + rnd() * (FT - 28), 14 + rnd() * (FT - 28), 6 + rnd() * 2, rnd() * TAU, th);
    c.globalAlpha = 0.22; c.drawImage(L, 0, 0); c.globalAlpha = 1;
    return (floorTiles[i] = t);
  }
  // kind 0 = small bit, 1 and 2 = the arena's two motifs, drawn around (0,0) at size s
  function doodad(d, arena, kind, x, y, s, rot, th) {
    var a = th.accent, b = th.accent2, j;
    d.save(); d.translate(x, y); d.rotate(rot);
    d.fillStyle = kind === 2 ? b : a; d.strokeStyle = '#fff'; d.lineWidth = s * 0.16;
    if (arena === 0) {
      if (kind === 0) { d.strokeStyle = rot > 3 ? a : b; d.lineWidth = s * 0.5; line(d, -s * 0.6, 0, s * 0.6, 0); }   // sprinkle
      else {   // wrapped sweet
        d.beginPath(); d.arc(0, 0, s * 0.62, 0, TAU); d.fill();
        d.beginPath(); d.moveTo(-s * 0.4, 0); d.lineTo(-s * 1.25, -s * 0.55); d.lineTo(-s * 1.25, s * 0.55); d.closePath();
        d.moveTo(s * 0.4, 0); d.lineTo(s * 1.25, -s * 0.55); d.lineTo(s * 1.25, s * 0.55); d.closePath(); d.fill();
        line(d, -s * 0.25, -s * 0.45, s * 0.05, s * 0.5); line(d, s * 0.2, -s * 0.5, s * 0.45, s * 0.2);
      }
    } else if (arena === 1) {
      if (kind === 0) { d.beginPath(); d.arc(0, 0, s * 0.3, 0, TAU); d.fill(); }   // pebble
      else if (kind === 1) {   // shell
        d.beginPath(); d.moveTo(0, s * 0.65); d.arc(0, s * 0.65, s * 1.2, Math.PI * 1.17, Math.PI * 1.83); d.closePath(); d.fill();
        for (j = -2; j <= 2; j++) line(d, 0, s * 0.65, Math.sin(j * 0.3) * s, s * 0.65 - Math.cos(j * 0.3) * s);
      } else { Art.star(d, 0, 0, s, s * 0.45); d.fill(); d.strokeStyle = b; d.lineWidth = s * 0.3; d.stroke(); }   // starfish
    } else if (arena === 2) {
      if (kind === 0) { d.beginPath(); d.arc(0, 0, s * 0.28, 0, TAU); d.fill(); }
      else if (kind === 1) {   // mushroom
        d.fillStyle = '#c9a27a'; d.fillRect(-s * 0.26, -s * 0.1, s * 0.52, s * 0.85);
        d.fillStyle = a; d.beginPath(); d.ellipse(0, -s * 0.1, s * 0.95, s * 0.72, 0, Math.PI, TAU); d.closePath(); d.fill();
        d.fillStyle = '#fff'; d.beginPath(); d.arc(-s * 0.4, -s * 0.4, s * 0.16, 0, TAU); d.arc(s * 0.25, -s * 0.55, s * 0.13, 0, TAU); d.fill();
      } else {   // leaf
        d.beginPath(); d.moveTo(-s, 0); d.quadraticCurveTo(0, -s * 0.8, s, 0); d.quadraticCurveTo(0, s * 0.8, -s, 0); d.fill();
        line(d, -s * 0.8, 0, s * 0.7, 0);
      }
    } else if (arena === 3) {
      if (kind === 0) { d.fillStyle = rot > 3 ? a : b; d.fillRect(-s * 0.35, -s * 0.16, s * 0.7, s * 0.32); }   // confetti
      else {   // balloon on a string
        d.strokeStyle = d.fillStyle; d.lineWidth = s * 0.12; d.beginPath(); d.moveTo(0, s * 0.9); d.quadraticCurveTo(s * 0.35, s * 1.25, 0, s * 1.6); d.stroke();
        d.beginPath(); d.ellipse(0, 0, s * 0.72, s * 0.88, 0, 0, TAU); d.fill(); d.beginPath(); d.moveTo(-s * 0.18, s * 1.02); d.lineTo(0, s * 0.8); d.lineTo(s * 0.18, s * 1.02); d.closePath(); d.fill();
        d.fillStyle = '#fff'; d.beginPath(); d.ellipse(-s * 0.3, -s * 0.38, s * 0.14, s * 0.24, -0.5, 0, TAU); d.fill();
      }
    } else {
      if (kind === 0) { d.fillStyle = b; Art.star(d, 0, 0, s * 0.55, s * 0.22); d.fill(); }   // tiny star
      else if (kind === 1) {   // cloud
        d.beginPath(); d.arc(-s * 0.6, s * 0.15, s * 0.45, 0, TAU); d.moveTo(s * 0.6, -s * 0.2);
        d.arc(0, -s * 0.2, s * 0.6, 0, TAU); d.moveTo(s * 1.05, s * 0.15); d.arc(s * 0.6, s * 0.15, s * 0.45, 0, TAU);
        d.rect(-s * 0.6, s * 0.1, s * 1.2, s * 0.5); d.fill();
      } else { Art.star(d, 0, 0, s * 0.9, s * 0.42); d.fill(); d.strokeStyle = b; d.lineWidth = s * 0.25; d.stroke(); }   // star
    }
    d.restore();
  }
  function line(d, x0, y0, x1, y1) { d.beginPath(); d.moveTo(x0, y0); d.lineTo(x1, y1); d.stroke(); }

  function makePatterns() {
    var b = floorTile(arenaIdx);
    var o = mkCanvas(64, 64), oc = o.getContext('2d');
    oc.fillStyle = theme.out; oc.fillRect(0, 0, 64, 64);
    oc.fillStyle = theme.out2;
    oc.beginPath(); oc.moveTo(0, 0); oc.lineTo(32, 0); oc.lineTo(0, 32); oc.closePath(); oc.fill();
    oc.beginPath(); oc.moveTo(64, 0); oc.lineTo(64, 32); oc.lineTo(32, 64); oc.lineTo(0, 64); oc.closePath(); oc.fill();
    oc.fillStyle = 'rgba(255,255,255,0.35)';
    oc.beginPath(); oc.arc(48, 16, 4, 0, TAU); oc.fill();
    return { bg: ctx.createPattern(b, 'repeat'), out: ctx.createPattern(o, 'repeat') };
  }
  var pats = makePatterns();

  function setArena(i) {
    arenaIdx = i; arena = PG.ARENAS[i]; theme = arena.theme;
    pats = makePatterns();
    document.body.style.background = theme.out;
  }

  function playerSkin() { return Art.makeSkin(save.skin.c, save.skin.f, save.skin.p); }

  // Colours that look alike on the map (pink/coral, mint/turquoise, grape/violet, orange/caramel,
  // sky/blue, gold/lemon). Rainbow draws its trail, outline and minimap dot in pink.
  var LOOKALIKE = { 0: [6], 6: [0], 2: [8], 8: [2], 4: [9], 9: [4], 5: [11], 11: [5], 1: [10], 10: [1], 12: [0, 6], 13: [3] };
  function pickBotColor() {
    var used = {}, near = player && skins[player.id] && LOOKALIKE[skins[player.id].colorIdx] || [];
    for (var i = 1; i < skins.length; i++) {
      var a = world.agents[i];
      // newWorld picks every bot skin before anyone spawns, so unspawned bots (no deaths yet) count too
      if (skins[i] && a && (a.alive || a.isPlayer || !a.deaths)) used[skins[i].colorIdx] = 1;
    }
    // never the player's colour or its look-alike; a colour whose look-alike another bot wears
    // is only a second choice, so bots are told apart too while other colours are free
    var opts = [], spare = [];
    for (var c = 0; c < PG.BOT_COLORS; c++) {
      if (used[c] || near.indexOf(c) >= 0) continue;
      var twin = LOOKALIKE[c];
      (twin && used[twin[0]] ? spare : opts).push(c);
    }
    if (!opts.length) opts = spare;
    if (!opts.length) near.forEach(function (n) { if (!used[n]) opts.push(n); });
    if (!opts.length) opts = [Kit.randInt(0, PG.BOT_COLORS - 1)];
    return Kit.pick(opts);
  }
  function botSkin(a) {
    var faces = [0, 0, 1, 1, 2, 3, 5, 11, 4, 6, 9, 10];
    var pp = [0, 0, 0, 1, 2, 3, 4];
    return Art.makeSkin(pickBotColor(), Kit.pick(faces), Kit.pick(pp), { brows: a.personality === 'hunter' ? 'angry' : a.personality === 'cautious' ? 'worried' : null });
  }
  function nextName() {
    if (nameIdx >= namePool.length) { namePool = Kit.shuffle(PG.BOT_NAMES.slice()); nameIdx = 0; }
    return namePool[nameIdx++];
  }

  function newWorld(withPlayer) {
    var P = arena.bot;
    world = new PG.World(N, P);
    skins = [null]; agentFx = [null];
    clearTex();
    parts.length = 0; sparts.length = 0; popups.length = 0; banners.length = 0; feed.length = 0;
    namePool = Kit.shuffle(PG.BOT_NAMES.slice()); nameIdx = 0;
    var nb = 8, defs = [];
    if (withPlayer) {
      player = world.addAgent({ isPlayer: true, name: 'أنت', turn: PG.PLAYER_TURN });
      skins.push(playerSkin()); agentFx.push(newFx());
    } else { player = null; nb = 9; }
    for (var i = 0; i < nb; i++) {
      var pers = i < P.hunters ? 'hunter' : (Math.random() < 0.5 ? 'greedy' : 'cautious');
      var a = world.addAgent({ name: nextName(), personality: pers, speedMul: P.speed, turn: P.turn });
      skins.push(null); agentFx.push(newFx());
      skins[a.id] = botSkin(a);
    }
    world.onRespawn = function (a) {
      if (Math.random() < 0.5 && a.personality !== 'hunter') a.personality = Math.random() < 0.5 ? 'greedy' : 'cautious';
      a.name = nextName();
      skins[a.id] = null;
      skins[a.id] = botSkin(a);
    };
    // spread spawns on a jittered 3x3 grid
    var slots = [];
    for (var gy = 0; gy < 3; gy++) for (var gx = 0; gx < 3; gx++) slots.push([Math.floor((gx + 0.5) * N / 3 + Kit.rand(-8, 8)), Math.floor((gy + 0.5) * N / 3 + Kit.rand(-8, 8))]);
    Kit.shuffle(slots);
    for (var k = 1; k < world.agents.length; k++) world.spawn(world.agents[k], slots[k - 1][0], slots[k - 1][1], world.agents[k].isPlayer ? PLAYER_START_R : 0);
    world.events.length = 0;
    for (var c = 0; c < NN; c++) if (world.owner[c]) paintCell(c);
    flushTex();
  }
  function newFx() { return { sq: 0, sqv: 0, blink: Kit.rand(1, 4), blinkOn: 0, hurt: 0, spawnT: 0 }; }

  /* ============================================================ flow */
  function showScreen(id) {
    ['scr-title', 'scr-skins', 'scr-pause', 'scr-over'].forEach(function (s) { $(s).hidden = s !== id; });
    $('bPause').hidden = !(state === 'play');
  }

  function toTitle() {
    state = 'title';
    // an arena unlocked by the last round (finishRound stores it in save.arena) is preselected
    if (save.arena !== arenaIdx && arenaUnlocked(save.arena)) arenaIdx = save.arena;
    world && (world.allowRespawn = true);
    setArena(arenaIdx);
    newWorld(false);
    attract.follow = 1; attract.t = 0;
    var f = world.agents[1]; cam.x = f.x * CS; cam.y = f.y * CS; cam.z = 0.85;
    buildTitle();
    showScreen('scr-title');
  }

  function startMatch() {
    if (!arenaUnlocked(arenaIdx)) return;
    // play stats: every start (play, again, restart, next arena) opens a round; the coach line shows in the first 3 rounds
    Kit.stats.round('arena' + (arenaIdx + 1));
    if (save.rounds < 3) Kit.stats.tutorial('start');
    save.arena = arenaIdx; persist();
    setArena(arenaIdx);
    newWorld(true);
    state = 'play';
    timeLeft = PG.MATCH_TIME; matchT = 0; lastTick = -1;
    milestones = {}; killStreak = 0; killStreakT = 0;
    homeDir = null; homeT = 0; capCount = 0;
    ending = null; result = null; threat = null;
    cam.x = player.x * CS; cam.y = player.y * CS; cam.z = 1.25;
    agentFx[player.id].sqv = 8;
    Kit.keys.reset();
    inputMode = 'keys';
    lastPtr.x = ptr.x; lastPtr.y = ptr.y;
    banner('انطلق!', '#3ddc84', 84, 1.1);
    S.start();
    showScreen(null);
    canvas.focus();
  }

  function pauseGame() {
    if (state !== 'play') return;
    state = 'pause'; frameDirty = true; showScreen('scr-pause');
  }
  function resumeGame() {
    if (state !== 'pause') return;
    state = 'play'; Kit.keys.reset(); showScreen(null); canvas.focus();
  }

  /* ============================================================ events from the sim */
  function onScreen(x, y, m) {
    var sx = (x * CS - cam.x) * cam.z + W / 2, sy = (y * CS - cam.y) * cam.z + H / 2;
    m = m || 60;
    return sx > -m && sx < W + m && sy > -m && sy < H + m;
  }
  function handleEvents() {
    var ev = world.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i], a = world.agents[e.id], sk = skins[e.id];
      if (e.type === 'spawn') {
        for (var k = 0; k < e.cells.length; k++) paintCell(e.cells[k]);
        agentFx[e.id].sqv = 7; agentFx[e.id].spawnT = 0.5;
        if (onScreen(e.x, e.y)) burst(e.x * CS, e.y * CS, 14, [sk.c.base, sk.c.light, '#fff'], 220, { g: 0, drag: 3, life: 0.6 });
      } else if (e.type === 'leave') {
        if (a === player) { S.leave(); agentFx[e.id].sqv -= 3; }
      } else if (e.type === 'capture') {
        addWave(e.cells, e.x, e.y, true, a === player ? 0.6 : 0.45);
        var fx = agentFx[e.id];
        fx.sqv += Math.min(9, 3 + e.cells.length / 60);
        if (a === player) onPlayerCapture(e);
        else if (onScreen(e.x, e.y, 200) && e.cells.length > 10) {
          burst(e.x * CS, e.y * CS, 8, [sk.c.base, '#fff'], 180, { g: 0, drag: 3, kind: 2, life: 0.5, size: 7 });
        }
      } else if (e.type === 'die') {
        addWave(e.cells, e.x, e.y, false, 0.5);
        onDeath(e, a, sk);
      }
    }
    ev.length = 0;
  }

  function onPlayerCapture(e) {
    var g = e.gained, pct = g * 100 / NN, sk = skins[player.id];
    S.capture(g);
    // the coach line stops after 2 captures (play stats: tutorial done)
    if (g > 0 && ++capCount > 1 && save.rounds < 3) Kit.stats.tutorial('done');
    var hx = e.x * CS, hy = e.y * CS;
    burst(hx, hy, 12 + Math.min(30, g / 12 | 0), [sk.c.base, sk.c.light, '#fff', '#ffcf33'], 260 + Math.min(300, g), { g: 200, life: 0.8 });
    // sparkles over captured area
    var n = Math.min(26, e.cells.length);
    for (var i = 0; i < n; i++) {
      var c = e.cells[(Math.random() * e.cells.length) | 0];
      part(((c % N) + 0.5) * CS, (((c / N) | 0) + 0.5) * CS, { vx: 0, vy: -40, g: -30, life: 0.5 + Math.random() * 0.5, size: 6 + Math.random() * 6, color: i & 1 ? '#fff' : '#ffe45c', kind: 2 });
    }
    if (pct >= 0.05) popup(e.x, e.y - 1.5, '+' + pct.toFixed(1) + '%', sk.c.base, 26 + Math.min(30, pct * 6), 1.3);
    if (g > 350) { shake.add(Math.min(9, 3 + g / 200)); if (!calm) { flashA = 0.25; flashColor = '#fff'; } }
    if (pct >= 4) banner('ضربة هائلة!', '#ff6fae', 70, 1.5, '+' + pct.toFixed(1) + '%');
    else if (pct >= 2) banner('رائع!', '#ffcf33', 64, 1.2);
    // star goals first, then % milestones (only one celebration banner per capture besides the big-hit one)
    var starHit = false;
    arena.goals.forEach(function (gl, i) {
      if (player.maxCells * 100 / NN >= gl && !milestones['g' + i]) {
        milestones['g' + i] = 1;
        S.star(i);
        starHit = true;
        banner('نجمة!', '#ffcf33', 70, 1.4, 'وصلت إلى ' + iso(gl + '%'));
        burst(W / 2, 190, 22, ['#ffcf33', '#fff', '#ffe45c'], 320, { g: 250, kind: 2, life: 1, size: 10, screen: true });
      }
    });
    var now = world.pct(player), msHit = 0;
    [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 90].forEach(function (m) {
      if (now >= m && !milestones[m]) { milestones[m] = 1; msHit = m; }
    });
    if (msHit) {
      if (pct < 4 && !starHit) banner(msHit + '%', '#3ddc84', 80, 1.3, msHit >= 20 ? 'أنت نجم!' : 'استمر!');
      if (!starHit) S.milestone();
    }
  }

  function onDeath(e, a, sk) {
    var visible = onScreen(e.x, e.y, 120);
    var killer = e.killer ? world.agents[e.killer] : null;
    if (visible) {
      var x = e.x * CS, y = e.y * CS;
      burst(x, y, 26, [sk.c.base, sk.c.light, sk.c.dark], 330, { g: 500, life: 0.8, kind: 1, size: 9 });
      burst(x, y, 10, ['#ffffff'], 120, { g: -40, life: 0.7, kind: 3, size: 12, drag: 2 });
      // paint splats along trail
      var pts = e.pts || [];
      for (var i = 0; i < pts.length; i += 6) part(pts[i] * CS, pts[i + 1] * CS, { vx: Kit.rand(-40, 40), vy: Kit.rand(-90, -20), g: 300, life: 0.6, size: 7, color: sk.c.light, kind: 1 });
    }
    if (a === player) {
      S.die();
      shake.add(14);
      if (!calm) { flashA = 0.5; flashColor = '#ff5b6e'; }
      beginEnd('death', e);
      return;
    }
    if (killer === player) {
      S.kill();
      shake.add(7);
      killStreak = killStreakT > 0 ? killStreak + 1 : 1; killStreakT = 3;
      var txt = e.reason === 'swallow' ? 'ابتلعتَ ' + a.name + '!' : 'أقصيتَ ' + a.name + '!';
      banner(killStreak >= 2 ? (killStreak >= 3 ? 'إقصاء ثلاثي!' : 'إقصاء مزدوج!') : 'طاخ!', '#ff8a3d', 70, 1.4, txt);
      popup(e.x, e.y - 1.5, '+1', '#ff8a3d', 40, 1.2);
      addFeed(txt, true);
    } else {
      if (state === 'play' || state === 'ending') S.poof(visible ? 0.8 : 0.15);
      if (state === 'play' || state === 'ending') {
        var msg = e.reason === 'self' ? a.name + ' اصطدم بخطّه!' : killer ? (e.reason === 'swallow' ? killer.name + ' ابتلع ' + a.name : killer.name + ' أقصى ' + a.name) : a.name + ' خرج';
        addFeed(msg, false);
      }
    }
  }

  function beginEnd(reason, e) {
    if (ending) return;
    var pctNow;
    if (reason === 'death') pctNow = e.cells.length * 100 / NN;
    else pctNow = world.pct(player);
    // rank among agents at this moment
    var myCells = reason === 'death' ? e.cells.length : player.cells, rank = 1;
    for (var i = 1; i < world.agents.length; i++) { var o = world.agents[i]; if (o !== player && o.alive && o.cells > myCells) rank++; }
    ending = { reason: reason, killer: e && e.killer ? world.agents[e.killer] : null, deathReason: e && e.reason, pct: pctNow, peak: player.maxCells * 100 / NN, rank: rank, kills: player.kills, time: matchT, x: player.x, y: player.y };
    state = 'ending'; endT = 0;
    $('bPause').hidden = true;
    world.allowRespawn = reason === 'death';
    if (reason !== 'death') {
      if (rank === 1) { S.win(); banner(reason === 'domination' ? 'سيطرة كاملة!' : 'فزت!', '#ffcf33', 96, 2.2, 'المركز الأول!', true); for (var k = 0; k < 5; k++) burst(Kit.rand(100, 1180), -20, 18, ['#ff6fae', '#ffcf33', '#45c1ff', '#34d994', '#a77bff'], 200, { g: 300, life: 2, screen: true }); }
      else { banner('انتهى الوقت!', '#45c1ff', 80, 2, 'المركز ' + rank, true); S.milestone(); }
    }
  }

  function finishRound() {
    var en = ending, peak = Math.min(100, en.peak);
    var beforeKeys = unlockedKeys(), beforeArenaNext = arenaIdx + 1 < PG.ARENAS.length && arenaUnlocked(arenaIdx + 1);
    var st = save.stars[arenaIdx], got = [peak >= arena.goals[0], peak >= arena.goals[1], en.reason !== 'death' && en.rank === 1];
    var newStars = [];
    got.forEach(function (g, i) { if (g && !st[i]) { st[i] = 1; newStars.push(i); } });
    var prevBest = save.best;
    var newBest = peak > save.best + 0.001 && peak >= 0.5;
    if (peak > save.best) save.best = Math.round(peak * 10) / 10;
    if (peak > save.bestA[arenaIdx]) save.bestA[arenaIdx] = Math.round(peak * 10) / 10;
    save.kills += en.kills; save.rounds++;
    if (got[2]) save.wins++;
    // play stats: the coach line stops after 3 rounds (sent with the result); first place when time is up
    // (or full domination) wins, anything else loses; score = peak territory %
    if (save.rounds == 3) Kit.stats.tutorial('done');
    Kit.stats.end(got[2] ? 'win' : 'lose', peak | 0);
    var afterKeys = unlockedKeys(), newUnl = afterKeys.filter(function (k) { return beforeKeys.indexOf(k) < 0; });
    var arenaUnl = !beforeArenaNext && arenaIdx + 1 < PG.ARENAS.length && arenaUnlocked(arenaIdx + 1);
    if (arenaUnl) save.arena = arenaIdx + 1;
    persist();
    result = { en: en, peak: peak, got: got, newStars: newStars, newBest: newBest, prevBest: prevBest, newUnl: newUnl, arenaUnl: arenaUnl };
    showOver();
  }

  /* ============================================================ update */
  function update(dt) {
    // a paused round is frozen (effects too), so render() can keep showing its last frame
    if (state === 'pause') { Kit.keys.endFrame(); ptr.endFrame(); return; }
    clock += dt;
    if (state === 'play' || state === 'ending' || state === 'title' || state === 'skins') {
      var simDt = dt;
      if (state === 'ending') {
        endT += dt;
        if (ending.reason === 'death') simDt = endT < 0.7 ? dt * 0.3 : dt;
        else simDt = 0;
        if (endT > (ending.reason === 'death' ? 1.5 : 2.0)) { finishRound(); }
      }
      if (state === 'play') {
        playerInput(dt);
        matchT += dt;
        timeLeft -= dt;
        var sec = Math.ceil(timeLeft);
        if (timeLeft <= 10 && sec !== lastTick && sec > 0) { lastTick = sec; S.tick(); if (sec === 10) banner('آخر 10 ثوانٍ!', '#ff5b6e', 58, 1.3); }
        if (timeLeft <= 30 && !milestones.t30) { milestones.t30 = 1; banner('بقي 30 ثانية!', '#45c1ff', 52, 1.4); }
        world.allowRespawn = timeLeft > 12;
      }
      if (simDt > 0) world.step(simDt);
      handleEvents();
      if (state === 'play') {
        if (timeLeft <= 0) { timeLeft = 0; beginEnd('time'); }
        else if (player.alive && player.cells >= NN - 2) beginEnd('domination');
        updateThreat(dt);
        updateHomeDir(dt);
      }
      if (state === 'title' || state === 'skins') updateAttract(dt);
    } else if (state === 'over') {
      // (overLock is a real-time guard, see showOver)
      // world keeps animating slowly behind the results
      if (!player || !player.alive) world.step(dt * 0.5);
      handleEvents();
    }
    updateWaves();
    updateParts(dt);
    for (var i = popups.length - 1; i >= 0; i--) { popups[i].t += dt; if (popups[i].t > popups[i].life) popups.splice(i, 1); }
    if (banners.length) { banners[0].t += dt * (banners.length > 1 ? 1.7 : 1); if (banners[0].t > banners[0].life) banners.shift(); }
    for (i = feed.length - 1; i >= 0; i--) { feed[i].t += dt; if (feed[i].t > 4.5) feed.splice(i, 1); }
    killStreakT -= dt;
    flashA = Math.max(0, flashA - dt * 1.6);
    shake.update(dt);
    if (world) {
      for (i = 1; i < agentFx.length; i++) {
        var f = agentFx[i];
        f.sqv += (-120 * f.sq - 9 * f.sqv) * dt; f.sq += f.sqv * dt;
        if (f.sq > 0.45) f.sq = 0.45; if (f.sq < -0.35) f.sq = -0.35;
        f.blink -= dt; if (f.blink < 0) { f.blinkOn = 0.12; f.blink = Kit.rand(2, 5); }
        f.blinkOn -= dt; f.spawnT -= dt;
      }
      updateCamera(dt);
      updateLeaderboard();
    }
    Kit.keys.endFrame();
    ptr.endFrame();
  }

  function playerInput(dt) {
    if (!player || !player.alive) return;
    var K = Kit.keys;
    var kx = (K.anyDown(['ArrowRight', 'KeyD']) ? 1 : 0) - (K.anyDown(['ArrowLeft', 'KeyA']) ? 1 : 0);
    var ky = (K.anyDown(['ArrowDown', 'KeyS']) ? 1 : 0) - (K.anyDown(['ArrowUp', 'KeyW']) ? 1 : 0);
    if (kx || ky) { inputMode = 'keys'; keysUsed = true; player.target = Math.atan2(ky, kx); syncPtr(); return; }
    // Once arrows/WASD have steered, a small bump of the mouse on a shared desk must not take over
    // (the blob would swerve into its own trail): switching needs a deliberate 40 px move within
    // 0.3 s. Players who only use the mouse still switch after 4 px.
    if (Math.abs(ptr.x - lastPtr.x) + Math.abs(ptr.y - lastPtr.y) > (keysUsed ? 40 : 4)) { inputMode = 'mouse'; syncPtr(); }
    else if (keysUsed && clock - lastPtr.t > 0.3) syncPtr();   // slow drift never adds up
    if (inputMode === 'mouse') {
      var sx = (player.x * CS - cam.x) * cam.z + W / 2, sy = (player.y * CS - cam.y) * cam.z + H / 2;
      var dx = ptr.x - sx, dy = ptr.y - sy;
      if (dx * dx + dy * dy > 16 * 16) player.target = Math.atan2(dy, dx);
    }
  }
  function syncPtr() { lastPtr.x = ptr.x; lastPtr.y = ptr.y; lastPtr.t = clock; }

  function updateThreat(dt) {
    threat = null;
    if (!player.alive || !player.trail.length) { warnT = 0; return; }
    var th = world.threatTo(player);
    if (th.d < 7) {
      threat = th;
      warnT -= dt;
      if (warnT <= 0) { warnT = 0.6; S.warn(); }
    } else warnT = 0;
  }

  // Where is the closest piece of my land? (for the "go home" arrow while drawing a trail)
  function updateHomeDir(dt) {
    homeT -= dt;
    if (!player.alive || !player.trail.length) { homeDir = null; return; }
    if (homeT > 0) return;
    homeT = 0.12;
    var hc = nearestHome(player, 90);
    if (hc < 0) { homeDir = null; return; }
    if (!homeDir) homeDir = { x: 0, y: 0 };
    homeDir.x = (hc % N) + 0.5; homeDir.y = ((hc / N) | 0) + 0.5;
  }
  // allocation-free ring search for the closest own (non-trail) cell
  function nearestHome(a, maxR) {
    var own = world.owner, tr = world.trail, id = a.id, cx = a.cx, cy = a.cy;
    for (var r = 1; r <= maxR; r++) {
      var best = -1, bd = 1e9;
      for (var k = -r; k <= r; k++) {
        for (var j = 0; j < 4; j++) {
          var x = j === 0 || j === 1 ? cx + k : (j === 2 ? cx - r : cx + r);
          var y = j === 0 ? cy - r : j === 1 ? cy + r : cy + k;
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          var c = y * N + x;
          if (own[c] === id && !tr[c]) { var d = (x - cx) * (x - cx) + (y - cy) * (y - cy); if (d < bd) { bd = d; best = c; } }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  function updateCamera(dt) {
    var tx, ty, tz;
    if (state === 'title' || state === 'skins') {
      var f = world.agents[attract.follow];
      if (!f || !f.alive) { tx = cam.x; ty = cam.y; } else { tx = f.x * CS; ty = f.y * CS + 60; }
      tz = 0.85;
    } else if (state === 'over' || (state === 'ending' && endT > (ending.reason === 'death' ? 1.0 : 1.3))) {
      tz = Math.min((W * 0.5) / (MW + 60), (H * 0.9) / (MW + 60));
      tx = MW / 2 + (W / 2 - 330) / tz; ty = MW / 2;
    } else if (player) {
      var lx = player.alive ? Math.cos(player.ang) * 70 : 0, ly = player.alive ? Math.sin(player.ang) * 50 : 0;
      tx = player.x * CS + lx; ty = player.y * CS + ly;
      var pct = world.pct(player);
      tz = 1.08 - Math.min(0.28, pct * 0.009);
      if (state === 'ending' && ending.reason === 'death') tz = 1.25;
    } else { tx = cam.x; ty = cam.y; tz = cam.z; }
    var k = Math.min(1, dt * (state === 'play' ? 7 : 2.5));
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    cam.z += (tz - cam.z) * Math.min(1, dt * 2.5);
  }

  function updateAttract(dt) {
    attract.t += dt;
    var f = world.agents[attract.follow];
    if (attract.t > 8 || !f || !f.alive) {
      attract.t = 0;
      var best = 1, bc = -1;
      for (var i = 1; i < world.agents.length; i++) { var a = world.agents[i]; if (a.alive && a.cells > bc && i !== attract.follow) { bc = a.cells; best = i; } }
      attract.follow = best;
    }
  }

  function updateLeaderboard() {
    lb.length = 0;
    for (var i = 1; i < world.agents.length; i++) { var a = world.agents[i]; if (a.alive) lb.push(a); }
    lb.sort(function (a, b) { return b.cells - a.cells; });
  }

  /* ============================================================ render */
  // A paused scene is drawn once, then again only after a resize, a canvas restore or late fonts.
  var frameDirty = true, restoreDue = false;
  function render() {
    if (state === 'pause' && !frameDirty) return;
    frameDirty = false;
    if (restoreDue) { restoreDue = false; restoreCanvases(); }
    flushTex();
    ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, 0, 0);
    ctx.direction = 'ltr';
    drawWorld();
    if (flashA > 0) { ctx.globalAlpha = flashA; ctx.fillStyle = flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (state === 'play' || state === 'pause' || state === 'ending') drawHUD();
    drawBanners();
    if (sparts.length) drawParts(sparts);
    if (state === 'skins') drawSkinPreview();
    if (state === 'title') drawSkinBtn();
  }

  function drawWorld() {
    var z = cam.z;
    ctx.fillStyle = theme.out; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + shake.x, H / 2 + shake.y);
    ctx.scale(z, z);
    ctx.translate(-Math.round(cam.x * z) / z, -Math.round(cam.y * z) / z);
    var vx0 = cam.x - W / 2 / z - 40, vy0 = cam.y - H / 2 / z - 40, vw = W / z + 80, vh = H / z + 80;
    ctx.fillStyle = pats.out; ctx.fillRect(vx0, vy0, vw, vh);
    // map slab
    ctx.fillStyle = theme.rim;
    roundRect(-12, -12, MW + 24, MW + 34, 26); ctx.fill();
    ctx.fillStyle = 'rgba(43,35,80,0.25)';
    roundRect(-12, MW + 6, MW + 24, 16, 8); ctx.fill();
    ctx.fillStyle = pats.bg; ctx.fillRect(0, 0, MW, MW);
    // territory
    var sx0 = Math.max(0, Math.floor(vx0 / CS)), sy0 = Math.max(0, Math.floor(vy0 / CS));
    var sx1 = Math.min(N, Math.ceil((vx0 + vw) / CS)), sy1 = Math.min(N, Math.ceil((vy0 + vh) / CS));
    if (sx1 > sx0 && sy1 > sy0) {
      ctx.imageSmoothingEnabled = false;
      var sw = sx1 - sx0, sh = sy1 - sy0;
      ctx.drawImage(shCv, sx0 * TEX, sy0 * TEX, sw * TEX, sh * TEX, sx0 * CS, sy0 * CS + 6, sw * CS, sh * CS);
      ctx.drawImage(topCv, sx0 * TEX, sy0 * TEX, sw * TEX, sh * TEX, sx0 * CS, sy0 * CS, sw * CS, sh * CS);
      ctx.imageSmoothingEnabled = true;
    }
    var ags = world.agents, i, a;
    // trails
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (i = 1; i < ags.length; i++) {
      a = ags[i];
      if (!a.alive || a.pts.length < 2) continue;
      var sk = skins[a.id];
      var danger = a === player && threat && ((clock * 8) | 0) % 2 === 0;
      ctx.beginPath();
      ctx.moveTo(a.pts[0] * CS, a.pts[1] * CS);
      for (var k = 2; k < a.pts.length; k += 2) ctx.lineTo(a.pts[k] * CS, a.pts[k + 1] * CS);
      ctx.lineTo(a.x * CS, a.y * CS);
      ctx.lineWidth = CS * 0.78; ctx.strokeStyle = danger ? '#ff3b4f' : sk.c.dark; ctx.stroke();
      ctx.lineWidth = CS * 0.46; ctx.strokeStyle = danger ? '#ffd0d6' : sk.c.light; ctx.stroke();
    }
    // heads (sorted by y)
    var order = [];
    for (i = 1; i < ags.length; i++) if (ags[i].alive) order.push(ags[i]);
    order.sort(function (p, q) { return p.y - q.y; });
    for (i = 0; i < order.length; i++) drawAgent(order[i]);
    // threat marker
    if (threat && player.alive) {
      var e = ags[threat.id];
      if (e && e.alive) {
        var bob = Math.sin(clock * 14) * 3;
        ctx.fillStyle = '#ff3b4f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x * CS, e.y * CS - 46 + bob, 13, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '700 20px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', e.x * CS, e.y * CS - 45 + bob);
      }
    }
    // "go home" arrow next to the player's head while it is out drawing a trail
    if (homeDir && player && player.alive && player.trail.length && state === 'play') {
      var hdx = homeDir.x - player.x, hdy = homeDir.y - player.y, hd = Math.sqrt(hdx * hdx + hdy * hdy);
      if (hd > 3.5) {
        var ha = Math.atan2(hdy, hdx), hr = 44 + Math.sin(clock * 9) * 4;
        var hAlpha = Math.min(1, 0.35 + player.trail.length / 40);
        ctx.save();
        ctx.globalAlpha = hAlpha;
        ctx.translate(player.x * CS + Math.cos(ha) * hr, player.y * CS + Math.sin(ha) * hr);
        ctx.rotate(ha);
        ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-7, -11); ctx.lineTo(-3, 0); ctx.lineTo(-7, 11); ctx.closePath();
        ctx.lineJoin = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = '#2b2350'; ctx.stroke();
        ctx.fillStyle = skins[player.id].c.base; ctx.fill();
        ctx.restore();
      }
    }
    drawParts(parts);
    // popups
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
    for (i = 0; i < popups.length; i++) {
      var p = popups[i], t = p.t / p.life;
      var sc = calm ? 1.1 : t < 0.15 ? 0.5 + t / 0.15 * 0.7 : t < 0.25 ? 1.2 - (t - 0.15) : 1.1;
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      ctx.font = '700 ' + Math.round(p.size * sc) + 'px ' + FONT;
      var py = p.y * CS - (calm ? 0 : t * 50);
      ctx.lineWidth = 7; ctx.strokeStyle = '#2b2350'; ctx.strokeText(p.text, p.x * CS, py);
      ctx.fillStyle = p.color; ctx.fillText(p.text, p.x * CS, py);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawAgent(a) {
    var sk = skins[a.id], f = agentFx[a.id];
    var x = a.x * CS, y = a.y * CS;
    var r = CS * 1.05;
    var wob = Math.sin(clock * 16 + a.id) * 0.035;
    var sq = f.sq + wob;
    var sp = f.spawnT > 0 ? 1 - f.spawnT / 0.5 * 0.6 : 1;
    ctx.save();
    ctx.translate(x, y);
    if (a === player) {
      // ring under the player for readability
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, r * 0.9, r * 1.15, r * 0.38, 0, 0, TAU); ctx.stroke();
    }
    ctx.scale(sp, sp);
    Art.drawHead(ctx, sk, r, { look: a.ang, t: clock + a.id, sx: 1 + sq, sy: 1 - sq, blink: f.blinkOn > 0 });
    ctx.restore();
    if (a !== player) {
      ctx.font = '700 15px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(43,35,80,0.85)'; ctx.strokeText(a.name, x, y - r * 1.75);
      ctx.fillStyle = '#fff'; ctx.fillText(a.name, x, y - r * 1.75);
      ctx.direction = 'ltr';
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function panel(x, y, w, h, r, fill) {
    ctx.fillStyle = 'rgba(43,35,80,0.35)'; roundRect(x, y + 5, w, h, r); ctx.fill();
    ctx.fillStyle = fill || 'rgba(255,255,255,0.93)'; roundRect(x, y, w, h, r); ctx.fill();
    ctx.lineWidth = 3.5; ctx.strokeStyle = '#2b2350'; ctx.stroke();
  }
  var AR_RE = /[\u0600-\u06FF]/;
  // Numbers like "12%" inside Arabic text get re-ordered by the bidi algorithm ("%12"); isolate them.
  function iso(v) { return '\u2066' + v + '\u2069'; }
  function ltrHtml(v) { return '<bdi dir="ltr">' + v + '</bdi>'; }
  function isoHtml(str) { return String(str).replace(/[+-]?\d+(?:\.\d+)?%?(?:\s*\/\s*\d+(?:\.\d+)?%?)?/g, function (m) { return ltrHtml(m); }); }
  function txt(s, x, y, size, color, align, rtl, stroke) {
    ctx.font = '700 ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.direction = AR_RE.test(s) ? 'rtl' : 'ltr';
    if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = '#2b2350'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = color; ctx.fillText(s, x, y);
    ctx.direction = 'ltr';
  }
  function starShape(x, y, R, on) {
    Art.star(ctx, x, y, R, R * 0.48);
    ctx.fillStyle = on ? '#ffcf33' : '#d7d2e6'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#2b2350'; ctx.stroke();
  }

  function drawHUD() {
    // leaderboard (top-left)
    var x = 14, y = 14, w = 262, rowH = 27;
    var rows = Math.min(5, lb.length), pIn = false, pRank = 0;
    for (var i = 0; i < lb.length; i++) if (lb[i] === player) { pRank = i + 1; if (i < 5) pIn = true; }
    var extra = (!pIn && player.alive) ? 1 : 0;
    panel(x, y, w, 40 + (rows + extra) * rowH + 8, 18);
    txt('المتصدرون', x + w - 16, y + 21, 20, '#6b4bb8', 'right', true);
    txt(arena.short, x + 16, y + 21, 15, '#9a8fc2', 'left', true);
    var maxC = lb.length ? Math.max(1, lb[0].cells) : 1;
    function row(a, rank, ry) {
      var sk = skins[a.id], pct = a.cells * 100 / NN, me = a === player;
      var bw = (w - 24) * Math.max(0.06, Math.min(1, a.cells / maxC));
      ctx.fillStyle = sk.c.light; roundRect(x + 12 + (w - 24) - bw, ry, bw, rowH - 5, 8); ctx.fill();
      if (me) { ctx.lineWidth = 3; ctx.strokeStyle = sk.c.ink; roundRect(x + 10, ry - 1, w - 20, rowH - 3, 9); ctx.stroke(); }
      txt(rank + '', x + w - 26, ry + 11, 17, '#2b2350', 'center', false);
      txt(me ? 'أنت' : a.name, x + w - 44, ry + 11, 17, me ? '#d61f5a' : '#2b2350', 'right', true);
      txt(pct.toFixed(1) + '%', x + 20, ry + 11, 16, '#2b2350', 'left', false);
    }
    for (i = 0; i < rows; i++) row(lb[i], i + 1, y + 42 + i * rowH);
    if (extra) row(player, pRank, y + 42 + rows * rowH);

    // timer (top-center)
    var tl = Math.ceil(Math.max(0, timeLeft)), m = Math.floor(tl / 60), s = tl % 60;
    var ts = m + ':' + (s < 10 ? '0' : '') + s;
    var low = tl <= 10;
    var pulse = low && !calm ? 1 + Math.max(0, Math.sin(clock * 12)) * 0.08 : 1;
    ctx.save(); ctx.translate(W / 2, 38); ctx.scale(pulse, pulse);
    panel(-78, -26, 156, 52, 26, low ? '#ffdfe3' : 'rgba(255,255,255,0.93)');
    txt(ts, 0, 2, 36, low ? '#e8414f' : '#2b2350', 'center', false);
    ctx.restore();
    // feed
    for (i = 0; i < feed.length; i++) {
      var fd = feed[i], fa = fd.t > 3.8 ? 1 - (fd.t - 3.8) / 0.7 : 1;
      ctx.globalAlpha = Math.max(0, fa);
      ctx.font = '700 17px ' + FONT;
      var fw = Math.min(420, ctx.measureText(fd.text).width + 30);
      ctx.fillStyle = fd.hl ? 'rgba(255,138,61,0.92)' : 'rgba(43,35,80,0.6)';
      roundRect(W / 2 - fw / 2, 76 + i * 30, fw, 26, 13); ctx.fill();
      txt(fd.text, W / 2, 90 + i * 30, 17, '#fff', 'center', true);
    }
    ctx.globalAlpha = 1;

    // my area bar (bottom-center)
    var bw2 = 470, bx = W / 2 - bw2 / 2, by = H - 82;
    panel(bx, by, bw2, 66, 22);
    var pct = player.alive ? world.pct(player) : (ending ? ending.pct : 0);
    var peak = player.maxCells * 100 / NN;
    var goalMax = arena.goals[1] * 1.25;
    var barX = bx + 22, barW = bw2 - 150, barY = by + 38;
    ctx.fillStyle = '#ece8f7'; roundRect(barX, barY - 9, barW, 18, 9); ctx.fill();
    var sk = skins[player.id];
    var fillW = Math.max(18, Math.min(1, pct / goalMax) * barW);
    ctx.fillStyle = sk.c.base; roundRect(barX, barY - 9, fillW, 18, 9); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#2b2350'; roundRect(barX, barY - 9, barW, 18, 9); ctx.stroke();
    arena.goals.forEach(function (g, gi) {
      var gx = barX + Math.min(1, g / goalMax) * barW;
      starShape(gx, barY, 13, peak >= g);
      txt(g + '%', gx, barY - 23, 13, '#6b4bb8', 'center', false);
    });
    txt('مساحتك', bx + bw2 - 18, by + 16, 16, '#6b4bb8', 'right', true);
    txt(pct.toFixed(1) + '%', bx + bw2 - 70, by + 42, 30, '#2b2350', 'center', false);
    // kills chip
    panel(bx + bw2 + 12, by + 8, 108, 50, 18);
    drawBonk(bx + bw2 + 40, by + 33);
    txt('×' + player.kills, bx + bw2 + 82, by + 34, 26, '#ff8a3d', 'center', false);

    drawMinimap();
    // first-rounds coaching line above the area bar
    if (save.rounds < 3 && state === 'play' && player.alive && capCount < 2 && matchT < 45) {
      var hint = player.trail.length ? 'عُد إلى أرضك لتلوين كل ما حوّطته!' : (capCount ? 'رائع! اخرج مرة أخرى وارسم دائرة أكبر!' : 'اخرج من أرضك وارسم دائرة ثم عُد إليها!');
      ctx.font = '700 22px ' + FONT; ctx.direction = 'rtl';
      var hw = ctx.measureText(hint).width + 44;
      ctx.direction = 'ltr';
      var hy = by - 52 + (calm ? 0 : Math.sin(clock * 4) * 2);
      ctx.globalAlpha = 0.95;
      panel(W / 2 - hw / 2, hy, hw, 38, 19, '#fff6c9');
      ctx.globalAlpha = 1;
      txt(hint, W / 2, hy + 20, 22, '#2b2350', 'center', true);
    }
    // mouse hint
    if (inputMode === 'mouse' && player.alive && state === 'play') {
      ctx.strokeStyle = 'rgba(43,35,80,0.5)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 9, 0, TAU); ctx.stroke();
    }
  }

  function drawBonk(x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#ff8a3d'; ctx.strokeStyle = '#2b2350'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (var i = 0; i < 16; i++) { var a = i * Math.PI / 8, r = i & 1 ? 8 : 15; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawMinimap() {
    var s = 150, x = W - s - 20, y = H - s - 20;
    panel(x - 6, y - 6, s + 12, s + 12, 14, theme.bg);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(miniCv, x, y, s, s);
    ctx.imageSmoothingEnabled = true;
    var k = s / N;
    for (var i = 1; i < world.agents.length; i++) {
      var a = world.agents[i];
      if (!a.alive) continue;
      var sk = skins[i];
      if (a === player) continue;
      ctx.fillStyle = sk.c.dark;
      ctx.beginPath(); ctx.arc(x + a.x * k, y + a.y * k, 3, 0, TAU); ctx.fill();
    }
    if (player.alive) {
      var pr = 4.5 + Math.sin(clock * 8) * 1.2;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + player.x * k, y + player.y * k, pr + 2, 0, TAU); ctx.fill();
      ctx.fillStyle = skins[player.id].c.dark; ctx.beginPath(); ctx.arc(x + player.x * k, y + player.y * k, pr, 0, TAU); ctx.fill();
    }
    // view rect
    var vw = W / cam.z / CS * k, vh = H / cam.z / CS * k;
    ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y - 2, s + 4, s + 4); ctx.clip();
    ctx.strokeStyle = 'rgba(43,35,80,0.55)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(x + cam.x / CS * k - vw / 2, y + cam.y / CS * k - vh / 2, vw, vh);
    ctx.restore();
  }

  function drawBanners() {
    for (var i = 0; i < Math.min(1, banners.length); i++) {
      var b = banners[i], t = b.t / b.life;
      var sc = calm ? 1 : b.t < 0.18 ? 0.3 + b.t / 0.18 * 0.95 : b.t < 0.3 ? 1.25 - (b.t - 0.18) / 0.12 * 0.25 : 1;
      var a = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      var yy = 190 - (t > 0.75 && !calm ? (t - 0.75) * 80 : 0);
      ctx.save(); ctx.globalAlpha = Math.max(0, a);
      ctx.translate(W / 2, yy); ctx.scale(sc, sc);
      if (!calm) ctx.rotate(Math.sin(b.t * 6) * 0.03);
      txt(b.text, 0, 0, b.size, b.color, 'center', true, 14);
      if (b.sub) txt(b.sub, 0, b.size * 0.72, 28, '#fff', 'center', true, 8);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* ============================================================ title UI */
  var LOCK_SVG = '<svg viewBox="0 0 48 48"><rect x="9" y="21" width="30" height="22" rx="6" fill="#ffcf33" stroke="#2b2350" stroke-width="4"/><path d="M15 21v-6a9 9 0 0 1 18 0v6" fill="none" stroke="#2b2350" stroke-width="5"/><circle cx="24" cy="31" r="3.5" fill="#2b2350"/></svg>';
  var BONK_SVG = '<svg class="st" viewBox="0 0 32 32" style="width:22px;height:22px"><path d="M16 1l3.5 7.5 7.5-3-3 7.5 7.5 3.5-7.5 3.5 3 7.5-7.5-3-3.5 7.5-3.5-7.5-7.5 3 3-7.5-7.5-3.5 7.5-3.5-3-7.5 7.5 3z" style="fill:#ff8a3d"/><circle cx="16" cy="16" r="4" fill="#fff"/></svg>';
  function starSvg(on) { return '<svg class="st' + (on ? ' on' : '') + '" viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.2 6.7.8-5 4.6 1.3 6.7L12 17.5l-5.9 3.3 1.3-6.7-5-4.6 6.7-.8z"/></svg>'; }

  function buildTitle() {
    var box = $('arenas');
    box.innerHTML = '';
    PG.ARENAS.forEach(function (ar, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'arena' + (i === arenaIdx ? ' sel' : '') + (arenaUnlocked(i) ? '' : ' locked');
      b.style.setProperty('--bg', ar.theme.card);
      var st = save.stars[i];
      b.innerHTML = '<div class="anum">' + (i + 1) + '</div><canvas width="360" height="184"></canvas><div class="aname">' + ar.name + '</div><div class="astars">' + starSvg(st[0]) + starSvg(st[1]) + starSvg(st[2]) + '</div>' +
        (arenaUnlocked(i) ? '' : '<div class="alock">' + LOCK_SVG + '<span style="font-size:21px">' + ar.name + '</span><span style="opacity:.8">اجمع نجمتين في الساحة ' + i + '</span></div>');
      b.addEventListener('click', function (e) {
        if (!arenaUnlocked(i)) { S.nope(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        S.click();
        if (arenaIdx !== i) { arenaIdx = i; save.arena = i; persist(); toTitle(); }
        if (e.detail > 0) b.blur();
      });
      box.appendChild(b);
      drawArenaIcon(b.querySelector('canvas'), ar, i);
    });
    var st = totalStars();
    $('statBox').innerHTML = '<div class="lbl">أفضل مساحة</div><div class="big" dir="ltr">' + save.best.toFixed(1) + '%</div>' +
      '<div class="row2"><span title="النجوم">' + starSvg(1) + '<bdi dir="ltr">' + st + '/' + PG.ARENAS.length * 3 + '</bdi></span><span title="الإقصاءات">' + BONK_SVG + '<bdi dir="ltr">' + save.kills + '</bdi></span></div>';
    var nb = unlockedKeys().some(function (k) { return !save.seen[k]; });
    $('skBadge').hidden = !nb;
  }

  function drawArenaIcon(cv, ar, idx) {
    var c = cv.getContext('2d'), w = cv.width, h = cv.height;
    cv.repaint = function () { drawArenaIcon(cv, ar, idx); };   // after a GPU reset
    // the arena's own floor (same doodads as in play), drawn 1.5x so the card reads at its size
    c.save(); c.scale(1.5, 1.5); c.fillStyle = c.createPattern(floorTile(idx), 'repeat'); c.fillRect(0, 0, w / 1.5, h / 1.5); c.restore();
    var cols = ['#ff6fae', '#45c1ff', '#34d994', '#ffcf33', '#a77bff'];
    var rnd = seeded(idx * 77 + 5);
    for (var k = 0; k < 4; k++) {
      var col = cols[(k + idx) % cols.length];
      var bx = rnd() * (w - 120), by = rnd() * (h - 80), bw = 60 + rnd() * 70, bh = 40 + rnd() * 50;
      c.fillStyle = Art.css(Art.mix(Art.hexToRgb(col), [20, 16, 40], 0.34)); c.fillRect(bx, by + 8, bw, bh);
      c.fillStyle = col; c.fillRect(bx, by, bw, bh);
    }
    var sk = Art.makeSkin(idx % 4, [0, 1, 3, 7, 9][idx], 0, { brows: idx >= 2 ? 'angry' : null });
    c.save(); c.translate(w / 2, h / 2 + 8);
    Art.drawHead(c, sk, 46, { look: 0.3, t: 0 });
    c.restore();
  }

  function drawSkinBtn() {
    var cv = $('skinBtnCv'); if (!cv || $('scr-title').hidden) return;
    var c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    if (!drawSkinBtn.sk || drawSkinBtn.key !== save.skin.c + ',' + save.skin.f + ',' + save.skin.p) { drawSkinBtn.sk = playerSkin(); drawSkinBtn.key = save.skin.c + ',' + save.skin.f + ',' + save.skin.p; }
    c.save(); c.translate(76, 84);
    var bob = Math.sin(clock * 4) * 0.06;
    Art.drawHead(c, drawSkinBtn.sk, 52, { look: Math.sin(clock * 1.3) * 1.2 + 1.57, t: clock, sx: 1 + bob, sy: 1 - bob, blink: (clock % 3.3) < 0.12 });
    c.restore();
  }

  /* ============================================================ skins UI */
  var skTab = 'c', skSel = null;
  function openSkins() {
    state = 'skins';
    showScreen('scr-skins');
    skSel = null;
    buildSkinGrid();
  }
  function closeSkins() {
    unlockedKeys().forEach(function (k) { save.seen[k] = 1; });
    persist();
    state = 'title';
    buildTitle();
    showScreen('scr-title');
  }
  function listFor(tab) { return tab === 'c' ? PG.COLORS : tab === 'f' ? PG.FACES : PG.PATTERNS; }
  function buildSkinGrid() {
    var grid = $('skGrid'); grid.innerHTML = '';
    var list = listFor(skTab);
    var cur = skTab === 'c' ? save.skin.c : skTab === 'f' ? save.skin.f : save.skin.p;
    list.forEach(function (it, i) {
      var b = document.createElement('button'); b.type = 'button';
      var ok = unlocked(it);
      b.className = 'it' + (i === cur ? ' on' : '') + (ok ? '' : ' locked');
      var cv = document.createElement('canvas'); cv.width = 120; cv.height = 120;
      b.appendChild(cv);
      if (!ok) { var lk = document.createElement('div'); lk.className = 'lk'; lk.innerHTML = LOCK_SVG; b.appendChild(lk); }
      else if (!save.seen[skTab + i]) { var nw = document.createElement('div'); nw.className = 'nw'; nw.textContent = 'جديد'; b.appendChild(nw); }
      drawItemIcon(cv, skTab, i);
      b.addEventListener('mouseenter', function () { showItemInfo(it, ok); });
      b.addEventListener('click', function () {
        showItemInfo(it, ok);
        if (!ok) { S.nope(); return; }
        S.click();
        if (skTab === 'c') save.skin.c = i; else if (skTab === 'f') save.skin.f = i; else save.skin.p = i;
        save.seen[skTab + i] = 1;
        persist();
        skinPrevFx = 1;
        buildSkinGrid();
      });
      grid.appendChild(b);
    });
    var tabs = document.querySelectorAll('.tab');
    for (var t = 0; t < tabs.length; t++) tabs[t].classList.toggle('on', tabs[t].getAttribute('data-tab') === skTab);
    showItemInfo(list[cur], true);
  }
  function showItemInfo(it, ok) {
    $('skInfo').innerHTML = ok ? '<b>' + it.name + '</b>' : '<b>' + it.name + '</b> — مقفل: ' + isoHtml(PG.reqText(it.req)) + ' <span style="opacity:.6">(' + isoHtml(progressText(it.req)) + ')</span>';
  }
  function progressText(r) {
    var v = statOf(r.t);
    return (r.t === 'best' ? v.toFixed(1) + '%' : v) + ' من ' + r.v + (r.t === 'best' ? '%' : '');
  }
  function drawItemIcon(cv, tab, i) {
    var c = cv.getContext('2d');
    cv.repaint = function () { drawItemIcon(cv, tab, i); };   // after a GPU reset
    if (tab === 'p') {
      var sk = Art.makeSkin(save.skin.c, save.skin.f, i);
      Art.drawSwatch(cv, sk, 8);
      return;
    }
    var sk2 = tab === 'c' ? Art.makeSkin(i, save.skin.f, save.skin.p) : Art.makeSkin(save.skin.c, i, save.skin.p);
    c.fillStyle = '#f4f0ff'; c.fillRect(0, 0, 120, 120);
    c.save(); c.translate(60, tab === 'f' ? 70 : 64);
    Art.drawHead(c, sk2, tab === 'f' ? 34 : 38, { look: 1.2, t: 0.3 });
    c.restore();
  }
  var skinPrevFx = 0, prevSk = null, prevKey = '';
  function drawSkinPreview() {
    var cv = $('skPrev'), c = cv.getContext('2d');
    var key = save.skin.c + ',' + save.skin.f + ',' + save.skin.p;
    if (key !== prevKey) { prevSk = playerSkin(); prevKey = key; var sw = mkCanvas(64, 64); Art.drawSwatch(sw, prevSk, 16); drawSkinPreview.sw = sw; }
    c.clearRect(0, 0, 520, 520);
    c.imageSmoothingEnabled = false;
    c.drawImage(drawSkinPreview.sw, 0, 300, 520, 220);
    c.imageSmoothingEnabled = true;
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, 300, 520, 8);
    skinPrevFx = Math.max(0, skinPrevFx - 0.03);
    var sq = Math.sin(clock * 5) * 0.04 + skinPrevFx * Math.sin(clock * 30) * 0.15;
    c.save(); c.translate(260, 250);
    Art.drawHead(c, prevSk, 130, { look: Math.sin(clock * 1.2) * 1.4 + 1.57, t: clock, sx: 1 + sq, sy: 1 - sq, blink: (clock % 3.1) < 0.12 });
    c.restore();
    var name = PG.COLORS[save.skin.c].name + ' · ' + PG.FACES[save.skin.f].name + ' · ' + PG.PATTERNS[save.skin.p].name;
    if ($('skName').textContent !== name) $('skName').textContent = name;
  }

  /* ============================================================ game over UI */
  function showOver() {
    state = 'over';
    overLock = performance.now() + 600;   // ignore replay keys for 0.6 s so a held key does not skip the results
    var r = result, en = r.en;
    var head = $('oHead'), why = $('oWhy');
    if (en.reason === 'death') {
      head.textContent = 'أوه لا!'; head.style.color = '#ff6fae';
      if (en.deathReason === 'self') why.textContent = 'اصطدمتَ بخطّك!';
      else if (en.deathReason === 'swallow') why.textContent = (en.killer ? en.killer.name : 'روبوت') + ' ابتلع أرضك!';
      else why.textContent = (en.killer ? en.killer.name : 'روبوت') + ' قطع خطّك!';
    } else if (en.rank === 1) {
      head.textContent = en.reason === 'domination' ? 'سيطرة كاملة!' : 'فزت!'; head.style.color = '#ffcf33';
      why.textContent = 'أكبر أرض على الخريطة!';
    } else {
      head.textContent = 'انتهى الوقت!'; head.style.color = '#45c1ff';
      why.textContent = 'نجوت حتى النهاية!';
    }
    countUp($('oPct'), r.peak, function (v) { return v.toFixed(1) + '%'; });
    $('oRank').textContent = en.rank;
    $('oKills').textContent = en.kills;
    var ob = $('oBest');
    if (r.newBest) { ob.className = 'nb'; ob.textContent = 'رقم قياسي جديد!'; }
    else { ob.className = ''; ob.innerHTML = 'أفضل مساحة: ' + ltrHtml(save.best.toFixed(1) + '%'); }
    // stars
    var st = save.stars[arenaIdx], labels = ['لوّن ' + ltrHtml(arena.goals[0] + '%'), 'لوّن ' + ltrHtml(arena.goals[1] + '%'), 'المركز الأول عند نهاية الوقت'];
    var box = $('oStars'); box.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      var d = document.createElement('div');
      var isNew = r.newStars.indexOf(i) >= 0;
      d.className = 'ostar' + (st[i] ? ' got' : '');
      d.innerHTML = starSvg(st[i]) + labels[i];
      if (isNew) d.querySelector('svg').style.animationDelay = (0.5 + i * 0.35) + 's';
      box.appendChild(d);
    }
    r.newStars.forEach(function (s, k) { setTimeout(function () { if (state === 'over') S.star(s); }, 500 + k * 350); });
    // so close!
    var close = '';
    if (!st[0]) close = 'ينقصك ' + Math.max(0.1, arena.goals[0] - r.peak).toFixed(1) + '% فقط للنجمة الأولى!';
    else if (!st[1]) close = 'ينقصك ' + Math.max(0.1, arena.goals[1] - r.peak).toFixed(1) + '% للنجمة الثانية!';
    else if (!st[2]) close = 'ابقَ الأكبر حتى نهاية الوقت لتربح النجمة الثالثة!';
    else if (arenaIdx + 1 < PG.ARENAS.length) close = 'جرّب الساحة التالية: ' + PG.ARENAS[arenaIdx + 1].name + '!';
    else close = 'أنت بطل لوّن الأرض!';
    $('oClose').innerHTML = isoHtml(close);
    // unlocks
    var ub = $('oUnlocks'); ub.innerHTML = '';
    var any = false;
    if (r.arenaUnl) {
      any = true;
      var u0 = document.createElement('div'); u0.className = 'unl'; u0.style.animationDelay = '1.2s';
      u0.innerHTML = '<span style="padding:6px 4px">ساحة جديدة: ' + PG.ARENAS[arenaIdx + 1].name + '!</span>';
      ub.appendChild(u0);
    }
    r.newUnl.slice(0, 4).forEach(function (k, j) {
      any = true;
      var tab = k[0], i = +k.slice(1);
      var u = document.createElement('div'); u.className = 'unl'; u.style.animationDelay = (1.3 + j * 0.2) + 's';
      var cv = document.createElement('canvas'); cv.width = 120; cv.height = 120;
      u.appendChild(cv);
      var sp = document.createElement('span'); sp.textContent = 'جديد: ' + listFor(tab)[i].name; u.appendChild(sp);
      ub.appendChild(u);
      drawItemIcon(cv, tab, i);
    });
    if (any) S.unlock();
    var nx = nextArenaReady();
    $('bNext').hidden = !nx; $('oBtns').classList.toggle('three', nx);
    if (r.newBest) setTimeout(function () { if (state === 'over') { S.milestone(); burst(330, 160, 40, ['#ff6fae', '#ffcf33', '#45c1ff', '#34d994'], 300, { g: 400, life: 1.2, screen: true }); } }, 800);
    showScreen('scr-over');
  }
  // the next arena is open but has never been played: offer a one-click way there
  function nextArenaReady() { var n = arenaIdx + 1; return n < PG.ARENAS.length && arenaUnlocked(n) && !save.bestA[n]; }
  function countUp(el, target, fmt) {
    var t0 = performance.now();
    function f() {
      var k = Math.min(1, (performance.now() - t0) / 800);
      el.textContent = fmt(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && state === 'over') requestAnimationFrame(f);
    }
    f();
  }

  /* ============================================================ input wiring */
  function btn(id, fn) { var b = $(id); b.addEventListener('click', function (e) { e.stopPropagation(); A.unlock(); fn(); if (e.detail > 0) b.blur(); }); }
  btn('bPlay', function () { S.click(); startMatch(); });
  btn('bSkins', function () { S.click(); openSkins(); });
  btn('skDone', function () { S.click(); closeSkins(); });
  btn('bResume', function () { S.click(); resumeGame(); });
  btn('bRestart', function () { S.click(); startMatch(); });
  btn('bMenu', function () { S.click(); toTitle(); });
  btn('bAgain', function () { S.click(); startMatch(); });
  btn('bNext', function () { if (state !== 'over' || !nextArenaReady()) return; S.click(); arenaIdx++; startMatch(); });
  btn('bOverMenu', function () { S.click(); toTitle(); });
  btn('bPause', function () { pauseGame(); });
  $('bPause').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  var tabs = document.querySelectorAll('.tab');
  for (var ti = 0; ti < tabs.length; ti++) (function (t) {
    t.addEventListener('click', function (e) { S.click(); skTab = t.getAttribute('data-tab'); buildSkinGrid(); if (e.detail > 0) t.blur(); });
  })(tabs[ti]);

  function changeArena(d) {
    var n = arenaIdx + d;
    if (n < 0 || n >= PG.ARENAS.length) return;
    if (!arenaUnlocked(n)) {
      S.nope();
      var cards = document.querySelectorAll('.arena'); var c = cards[n];
      if (c) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
      return;
    }
    S.click(); arenaIdx = n; save.arena = n; persist(); toTitle();
  }

  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e)) return;
    var c = e.code;
    if (e.repeat && c !== 'ArrowLeft' && c !== 'ArrowRight') return;
    var go = c === 'Enter' || c === 'Space' || c === 'NumpadEnter';
    if (state === 'title') {
      if (go) { e.preventDefault(); startMatch(); }
      else if (c === 'ArrowLeft') { e.preventDefault(); changeArena(1); }
      else if (c === 'ArrowRight') { e.preventDefault(); changeArena(-1); }
    } else if (state === 'play') {
      if (c === 'KeyP' || c === 'Escape') { e.preventDefault(); pauseGame(); }
    } else if (state === 'pause') {
      if (c === 'KeyP' || c === 'Escape' || go) { e.preventDefault(); resumeGame(); }
      else if (c === 'KeyR') { e.preventDefault(); startMatch(); }
    } else if (state === 'over') {
      if (performance.now() < overLock) return;
      if (go || c === 'KeyR') { e.preventDefault(); startMatch(); }
      else if (c === 'Escape') { e.preventDefault(); toTitle(); }
    } else if (state === 'skins') {
      if (c === 'Escape' || go) { e.preventDefault(); closeSkins(); }
    }
  });
  canvas.addEventListener('pointerdown', function () { canvas.focus(); });

  /* ============================================================ debug hook */
  window.__game = {
    get state() { return state; },
    get world() { return world; },
    get player() { return player; },
    get save() { return save; },
    get ending() { return ending && { reason: ending.reason, why: ending.deathReason, killer: ending.killer && ending.killer.name, pct: ending.pct, rank: ending.rank }; },
    pct: function () { return player ? world.pct(player) : 0; },
    time: function () { return timeLeft; },
    setTime: function (t) { timeLeft = t; },
    arena: function (i) { if (i != null) { arenaIdx = i; save.arena = i; } return arenaIdx; },
    botColors: function () { var o = []; for (var i = 1; i < skins.length; i++) if (world.agents[i] && !world.agents[i].isPlayer && skins[i]) o.push(skins[i].colorIdx); return o; },
    // paint a square of territory for the player around its head (for testing)
    grab: function (r) {
      if (!player || !player.alive) return 0;
      var cells = [];
      for (var y = Math.max(0, player.cy - r); y <= Math.min(N - 1, player.cy + r); y++) for (var x = Math.max(0, player.cx - r); x <= Math.min(N - 1, player.cx + r); x++) {
        var c = y * N + x; if (world.owner[c] !== player.id && !world.trail[c]) { world.setOwner(c, player.id); cells.push(c); }
      }
      world.events.push({ type: 'capture', id: player.id, cells: cells, gained: cells.length, x: player.x, y: player.y });
      for (var i = 1; i < world.agents.length; i++) { var o = world.agents[i]; if (o !== player && o.alive && o.cells === 0) world.pending.push({ v: i, k: player.id, r: 'swallow' }); }
      world.resolve();
      return world.pct(player);
    },
    die: function () { if (player && player.alive) { world.pending.push({ v: player.id, k: 0, r: 'self' }); world.resolve(); } },
    unlockArenas: function () { save.stars.forEach(function (s) { s[0] = s[1] = 1; }); persist(); },
    reset: function () { store.remove('save'); location.reload(); },
    sfx: S,
    fps: 0
  };

  /* ============================================================ boot */
  // After a GPU reset (a PC waking from sleep) every canvas comes back blank, each at its own moment.
  // The main ones wait for the next frame, so the repaint runs once: the territory from its kept pixel
  // data, the floor tiles and patterns, and the arena cards and skin/unlock icons in place (keyboard
  // focus stays). An icon that comes back later repaints itself. The pattern preview is rebuilt when
  // next shown; the skin button and preview redraw every frame.
  function restoreCanvases() {
    floorTiles = []; pats = makePatterns(); putTex(); prevKey = '';
    var q = uiEl.querySelectorAll('canvas');
    for (var i = 0; i < q.length; i++) if (q[i].repaint) q[i].repaint();
  }
  [canvas, topCv, shCv, miniCv].forEach(function (c) { c.addEventListener('contextrestored', function () { restoreDue = frameDirty = true; }); });
  uiEl.addEventListener('contextrestored', function (e) { if (e.target.repaint) e.target.repaint(); }, true);
  try { document.fonts.ready.then(function () { frameDirty = true; }); } catch (e) { /* no font loading API */ }
  toTitle();
  Kit.loop(update, render);
  Kit.lifecycle({ pause: pauseGame });
  Kit.ready();
})();

