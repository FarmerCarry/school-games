/* دمج 2048 — original slide-and-merge puzzle for Recess Arcade.
 * Canvas draws the background, board, tiles and effects; DOM (#ui) holds
 * menus and the HUD. Logical resolution 1280x720 (Kit.fit).
 */
(function () {
  'use strict';

  var W = 1280, H = 720, SLUG = 'merge-2048';
  var M = window.M2048, THEMES = M.themes;
  var store = Kit.store(SLUG);
  function $(id) { return document.getElementById(id); }

  var SLIDE = 0.1, POP = 0.24, SPAWN = 0.18;
  var SIZES = [3, 4, 5, 6];
  var SIZE_NAMES = { 3: 'تحدٍّ صعب', 4: 'كلاسيكي', 5: 'واسع', 6: 'عملاق' };
  var GAP = { 3: 0.034, 4: 0.03, 5: 0.024, 6: 0.02 };
  var WIN = { 3: 512, 4: 2048, 5: 2048, 6: 2048 };
  var DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1]; // up, right, down, left
  var KEYDIR = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
  var INK = '#22123f';
  var BX = 335, BY = 56, BS = 610;          // game board
  var DX = 472, DY = 176, DS = 336;         // title demo board

  var canvas = $('game'), ui = $('ui');
  var sprites = {}, spriteN = 0, bgCache = {}, boardCache = {};
  var view = Kit.fit(canvas, W, H, { onResize: onResize });
  var ctx = view.ctx;

  function onResize(v) {
    ui.style.left = canvas.style.left;
    ui.style.top = canvas.style.top;
    ui.style.transform = 'scale(' + v.scale + ')';
    clearCaches();
  }
  function clearCaches() { sprites = {}; spriteN = 0; bgCache = {}; boardCache = {}; }

  /* ================================================================ save */
  function num(v, d) { v = Number(v); return isFinite(v) && v >= 0 ? v : d; }
  var save = {
    size: num(store.get('size', 4), 4),
    theme: store.get('theme', 'classic'),
    bestTile: num(store.get('bestTile', 0), 0),
    best: store.get('best', {}) || {},
    bt: store.get('bt', {}) || {},
    seen: store.get('seen', ['classic']) || ['classic'],
    games: num(store.get('games', 0), 0)
  };
  if (SIZES.indexOf(save.size) < 0) save.size = 4;
  SIZES.forEach(function (n) { save.best[n] = num(save.best[n], 0); save.bt[n] = num(save.bt[n], 0); });
  if (!Array.isArray(save.seen)) save.seen = ['classic'];
  if (!M.byId[save.theme] || !unlocked(M.byId[save.theme])) save.theme = 'classic';

  function unlocked(t) { return save.bestTile >= t.req; }
  function theme() { return M.byId[save.theme]; }

  function validVals(v, N) {
    if (!Array.isArray(v) || v.length !== N * N) return false;
    for (var i = 0; i < v.length; i++) {
      var x = v[i];
      if (x !== 0 && !(x >= 2 && x <= 1048576 && (x & (x - 1)) === 0)) return false;
    }
    return true;
  }
  function loadSaved(N) {
    var d = store.get('g' + N, null);
    if (!d || !validVals(d.v, N)) return null;
    var hist = [];
    if (Array.isArray(d.h)) d.h.forEach(function (h) { if (h && validVals(h.v, N)) hist.push({ v: h.v, s: num(h.s, 0) }); });
    return { v: d.v, s: num(d.s, 0), u: Kit.clamp(num(d.u, 3), 0, 3), h: hist.slice(-3), w: !!d.w, k: !!d.k, m: num(d.m, 0), sb: num(d.sb, 0) };
  }
  function liveSave(N) {
    var d = loadSaved(N);
    if (!d) return null;
    var any = false; for (var i = 0; i < d.v.length; i++) if (d.v[i]) any = true;
    return any && canMoveVals(d.v, N) ? d : null;
  }

  /* ============================================================== board */
  function canMoveVals(v, N) {
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      var x = v[r * N + c];
      if (!x) return true;
      if (c + 1 < N && v[r * N + c + 1] === x) return true;
      if (r + 1 < N && v[(r + 1) * N + c] === x) return true;
    }
    return false;
  }
  function order(N, d) { var a = []; for (var i = 0; i < N; i++) a.push(d === 1 ? N - 1 - i : i); return a; }

  function Board(N) {
    this.N = N; this.grid = []; this.ghosts = [];
    for (var i = 0; i < N * N; i++) this.grid.push(null);
  }
  Board.prototype.values = function () { return this.grid.map(function (t) { return t ? t.v : 0; }); };
  Board.prototype.load = function (vals, at, stagger) {
    var N = this.N; this.ghosts = [];
    for (var i = 0; i < N * N; i++) {
      var v = vals[i];
      this.grid[i] = v ? { v: v, r: (i / N) | 0, c: i % N, fr: (i / N) | 0, fc: i % N, t0: -9, born: at + (stagger ? (((i / N) | 0) + i % N) * stagger : 0), pop: -9 } : null;
    }
  };
  Board.prototype.empties = function () { var e = []; for (var i = 0; i < this.grid.length; i++) if (!this.grid[i]) e.push(i); return e; };
  Board.prototype.spawn = function (at, v) {
    var e = this.empties(); if (!e.length) return null;
    var i = e[(Math.random() * e.length) | 0], N = this.N;
    var t = { v: v || (Math.random() < 0.9 ? 2 : 4), r: (i / N) | 0, c: i % N, fr: (i / N) | 0, fc: i % N, t0: -9, born: at, pop: -9 };
    this.grid[i] = t; return t;
  };
  Board.prototype.maxTile = function () { var m = 0; this.grid.forEach(function (t) { if (t && t.v > m) m = t.v; }); return m; };
  Board.prototype.canMove = function () { return canMoveVals(this.values(), this.N); };
  Board.prototype.move = function (dir, t) {
    var N = this.N, g = this.grid, dr = DR[dir], dc = DC[dir];
    var res = { moved: false, gained: 0, merges: [] };
    var merged = [];
    // finish any running animation instantly
    for (var i = 0; i < g.length; i++) {
      var q = g[i]; if (!q) continue;
      q.fr = q.r; q.fc = q.c; q.t0 = t;
      if (q.pop > t) q.pop = t - POP;
      if (q.born > t) q.born = t - SPAWN;
    }
    this.ghosts.length = 0;
    var rs = order(N, dr), cs = order(N, dc);
    for (var a = 0; a < N; a++) for (var b = 0; b < N; b++) {
      var r = rs[a], c = cs[b], tile = g[r * N + c];
      if (!tile) continue;
      var nr = r, nc = c, did = false;
      for (;;) {
        var tr = nr + dr, tc = nc + dc;
        if (tr < 0 || tr >= N || tc < 0 || tc >= N) break;
        var o = g[tr * N + tc];
        if (!o) { nr = tr; nc = tc; continue; }
        if (o.v === tile.v && !merged[tr * N + tc]) {
          g[r * N + c] = null;
          var nt = { v: tile.v * 2, r: tr, c: tc, fr: tr, fc: tc, t0: t, born: -9, pop: t + SLIDE };
          this.ghosts.push({ v: tile.v, fr: r, fc: c, r: tr, c: tc, t0: t });
          this.ghosts.push({ v: o.v, fr: o.fr, fc: o.fc, r: tr, c: tc, t0: t });
          g[tr * N + tc] = nt; merged[tr * N + tc] = true;
          res.gained += nt.v; res.merges.push(nt); res.moved = true; did = true;
        }
        break;
      }
      if (did) continue;
      if (nr !== r || nc !== c) { g[r * N + c] = null; g[nr * N + nc] = tile; tile.r = nr; tile.c = nc; res.moved = true; }
    }
    return res;
  };
  function simulate(vals, N, dir) {
    var b = new Board(N); b.load(vals, 0);
    var r = b.move(dir, 0); return { moved: r.moved, gained: r.gained, merges: r.merges.length };
  }

  /* ============================================================== state */
  var now = 0;
  var G = {
    screen: 'title', N: save.size, board: null, score: 0, undos: 3, hist: [], won: false, keep: false,
    moves: 0, dead: false, deadAt: 0, maxT: 0, startBest: 0, newBest: false, shownScore: 0
  };
  var queue = [];
  function later(d, fn) { queue.push({ at: now + d, fn: fn }); }

  var fx = { parts: [], floats: [], rings: [], big: null, shake: 0, sx: 0, sy: 0, bx: 0, by: 0, flash: 0 };

  /* ============================================================== audio */
  var A = Kit.audio;
  var PENTA = [0, 2, 4, 7, 9];
  function log2(v) { return Math.round(Math.log(v) / Math.LN2); }
  function noteFreq(k) { var i = Math.max(0, k - 1); return 261.63 * Math.pow(2, (12 * Math.floor(i / 5) + PENTA[i % 5]) / 12); }
  var sfx = {
    slide: function () { A.noise({ dur: 0.07, vol: 0.05, filter: 1800, to: 500 }); },
    merge: function (v, i) {
      var k = log2(v), f = noteFreq(k), d = i * 0.045;
      A.tone({ freq: f * 0.72, to: f, type: 'triangle', dur: 0.17, vol: 0.3, delay: d });
      A.tone({ freq: f * 2, type: 'sine', dur: 0.14, vol: k >= 5 ? 0.13 : 0.07, delay: d + 0.012 });
      if (k >= 6) A.tone({ freq: f * 1.5, type: 'square', dur: 0.09, vol: 0.05, delay: d + 0.05 });
      if (k >= 8 && f * 3 < 6000) A.tone({ freq: f * 3, type: 'sine', dur: 0.3, vol: 0.08, delay: d + 0.08 });
      if (k >= 9) A.noise({ dur: 0.18, vol: 0.06, filter: 7000, to: 2500, delay: d });
    },
    spawn: function () { A.tone({ freq: 1250, to: 1600, type: 'sine', dur: 0.045, vol: 0.05 }); },
    blocked: function () { A.tone({ freq: 140, to: 80, type: 'triangle', dur: 0.12, vol: 0.28 }); A.noise({ dur: 0.06, vol: 0.06, filter: 600 }); },
    undo: function () { A.tone({ freq: 900, to: 300, type: 'sine', dur: 0.22, vol: 0.2 }); A.noise({ dur: 0.2, vol: 0.06, filter: 900, to: 3000 }); },
    combo: function (n) { for (var i = 0; i < Math.min(n, 5); i++) A.tone({ freq: 660 * Math.pow(1.19, i), type: 'square', dur: 0.07, vol: 0.07, delay: 0.1 + i * 0.05 }); },
    milestone: function (v) {
      var f = noteFreq(Math.min(log2(v), 12)) / 2;
      [1, 1.26, 1.5, 2].forEach(function (m, i) { A.tone({ freq: f * m, type: 'triangle', dur: 0.2, vol: 0.22, delay: i * 0.08 }); });
      A.tone({ freq: f * 4, type: 'sine', dur: 0.5, vol: 0.1, delay: 0.32 });
    },
    click: function () { A.tone({ freq: 700, to: 900, type: 'square', dur: 0.05, vol: 0.1 }); },
    start: function () { [523, 659, 784].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.2, delay: i * 0.06 }); }); },
    win: function () {
      [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.28, delay: i * 0.11 }); A.tone({ freq: f / 2, type: 'square', dur: 0.1, vol: 0.06, delay: i * 0.11 }); });
      A.noise({ dur: 0.8, vol: 0.12, filter: 8000, to: 2000, delay: 0.7 });
    },
    lose: function () { [392, 330, 262, 196].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.24, vol: 0.26, delay: i * 0.15 }); }); },
    unlock: function () { [784, 988, 1175, 1568].forEach(function (f, i) { A.tone({ freq: f, type: 'square', dur: 0.09, vol: 0.1, delay: i * 0.07 }); }); },
    best: function () { [659, 880, 1109, 1319].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.2, delay: i * 0.07 }); }); },
    deny: function () { A.tone({ freq: 220, to: 160, type: 'square', dur: 0.12, vol: 0.12 }); }
  };

  /* ============================================================ sprites */
  function res() { return view.scale * view.dpr; }
  function sprite(th, v, s) {
    var key = th.id + ':' + v + ':' + Math.round(s * 10);
    var sp = sprites[key];
    if (sp) return sp;
    if (spriteN > 260) { sprites = {}; spriteN = 0; }
    var P = Math.ceil(s * 0.16), full = s + P * 2, k = res() * 1.2;
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(full * k)); cv.height = cv.width;
    var c = cv.getContext('2d');
    c.scale(cv.width / full, cv.height / full); c.translate(P, P);
    c.direction = 'ltr';
    M.drawTile(c, th, v, s);
    sp = { cv: cv, full: full };
    sprites[key] = sp; spriteN++;
    return sp;
  }
  function drawTileAt(th, v, s, cx, cy, sx, sy) {
    var sp = sprite(th, v, s), w = sp.full * sx, h = sp.full * sy;
    ctx.drawImage(sp.cv, cx - w / 2, cy - h / 2, w, h);
  }
  function geom(N, S) { var g = S * GAP[N]; return { g: g, s: (S - g * (N + 1)) / N }; }

  function boardSprite(th, N, S) {
    var key = th.id + ':' + N + ':' + S;
    if (boardCache[key]) return boardCache[key];
    var P = 24, full = S + P * 2, k = res();
    var cv = document.createElement('canvas');
    cv.width = Math.ceil(full * k); cv.height = cv.width;
    var c = cv.getContext('2d');
    c.scale(k, k); c.translate(P, P);
    var R = S * 0.045, lip = Math.max(6, S * 0.022);
    c.fillStyle = 'rgba(0,0,0,0.25)'; M.rr(c, 6, lip + 8, S - 12, S, R); c.fill();
    c.fillStyle = th.boardLip; M.rr(c, 0, lip, S, S, R); c.fill();
    if (th.style === 'neon') { c.shadowColor = th.boardLip; c.shadowBlur = 22; }
    c.fillStyle = th.board; M.rr(c, 0, 0, S, S, R); c.fill();
    c.shadowBlur = 0;
    if (th.style === 'neon') { c.strokeStyle = th.boardLip; c.lineWidth = 3; M.rr(c, 1.5, 1.5, S - 3, S - 3, R); c.stroke(); }
    else { c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 3; M.rr(c, 3, 3, S - 6, S - 6, R * 0.9); c.stroke(); }
    var gm = geom(N, S);
    for (var r = 0; r < N; r++) for (var q = 0; q < N; q++) {
      var x = gm.g + q * (gm.s + gm.g), y = gm.g + r * (gm.s + gm.g);
      c.fillStyle = th.cell; M.rr(c, x, y, gm.s, gm.s, gm.s * 0.16); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.08)'; M.rr(c, x, y, gm.s, gm.s * 0.18, gm.s * 0.12); c.fill();
    }
    var o = { cv: cv, P: P, full: full };
    boardCache[key] = o;
    return o;
  }

  /* ========================================================= background */
  var deco = [];
  function buildDeco() {
    deco.length = 0;
    var th = theme();
    for (var i = 0; i < 28; i++) {
      deco.push({ x: Math.random() * W, y: Math.random() * H, s: Kit.rand(0.4, 1), ph: Math.random() * 6.28, rot: Math.random() * 6.28, v: Kit.rand(0.4, 1),
        col: ['#ff5fa2', '#ffe066', '#5fd3ff', '#7fe0bd', '#b88bff', '#ffffff'][i % 6] });
    }
    document.body.style.backgroundColor = th.page;
  }
  function bgSprite(th) {
    if (bgCache[th.id]) return bgCache[th.id];
    var k = Math.min(res(), 1.5);
    var cv = document.createElement('canvas');
    cv.width = Math.ceil(W * k); cv.height = Math.ceil(H * k);
    var c = cv.getContext('2d'); c.scale(k, k);
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    var rg = c.createRadialGradient(W / 2, H * 0.45, 50, W / 2, H * 0.45, 700);
    rg.addColorStop(0, 'rgba(255,255,255,0.16)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    if (th.deco === 'meadow') {
      c.fillStyle = '#7ccf4f';
      c.beginPath(); c.moveTo(0, 560); c.quadraticCurveTo(320, 470, 640, 560); c.quadraticCurveTo(960, 640, 1280, 530); c.lineTo(1280, 720); c.lineTo(0, 720); c.fill();
      c.fillStyle = '#5eb33a';
      c.beginPath(); c.moveTo(0, 640); c.quadraticCurveTo(400, 560, 800, 650); c.quadraticCurveTo(1060, 700, 1280, 620); c.lineTo(1280, 720); c.lineTo(0, 720); c.fill();
      for (var f = 0; f < 40; f++) {
        var fx0 = (f * 97) % 1280, fy = 600 + ((f * 53) % 110);
        c.fillStyle = ['#fff', '#ffe066', '#ff8fc5'][f % 3];
        c.beginPath(); c.arc(fx0, fy, 4, 0, 6.28); c.fill();
      }
    } else if (th.deco === 'grid') {
      c.strokeStyle = 'rgba(255,59,212,0.35)'; c.lineWidth = 2;
      var hy = 470;
      for (var i = 0; i < 12; i++) { var y = hy + Math.pow(i / 11, 2) * 250; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      for (var j = -12; j <= 12; j++) { c.beginPath(); c.moveTo(W / 2 + j * 20, hy); c.lineTo(W / 2 + j * 160, H); c.stroke(); }
      var sg = c.createLinearGradient(0, hy - 60, 0, hy + 10);
      sg.addColorStop(0, 'rgba(255,59,212,0)'); sg.addColorStop(1, 'rgba(255,59,212,0.35)');
      c.fillStyle = sg; c.fillRect(0, hy - 60, W, 70);
    } else if (th.deco === 'dots') {
      c.fillStyle = 'rgba(255,255,255,0.1)';
      for (var y2 = 0; y2 < H + 40; y2 += 60) for (var x2 = (y2 / 60) % 2 ? 30 : 0; x2 < W + 40; x2 += 60) { c.beginPath(); c.arc(x2, y2, 9, 0, 6.28); c.fill(); }
    } else if (th.deco === 'sprinkles') {
      c.fillStyle = 'rgba(255,255,255,0.18)';
      for (var y3 = -40; y3 < H + 80; y3 += 80) { c.beginPath(); c.moveTo(0, y3); c.lineTo(W, y3 + 160); c.lineTo(W, y3 + 190); c.lineTo(0, y3 + 30); c.fill(); y3 += 80; }
    }
    bgCache[th.id] = cv;
    return cv;
  }
  function drawBG(t) {
    var th = theme();
    ctx.drawImage(bgSprite(th), 0, 0, W, H);
    var i, d;
    if (th.deco === 'bubbles') {
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      for (i = 0; i < deco.length; i++) {
        d = deco[i];
        var y = (d.y - t * 22 * d.v) % (H + 120); if (y < -60) y += H + 120;
        ctx.beginPath(); ctx.arc(d.x + Math.sin(t * 0.7 + d.ph) * 20, y, 10 + d.s * 34, 0, 6.28); ctx.fill();
      }
    } else if (th.deco === 'sprinkles') {
      for (i = 0; i < deco.length; i++) {
        d = deco[i];
        var yy = (d.y + t * 30 * d.v) % (H + 40) - 20;
        ctx.save(); ctx.translate(d.x, yy); ctx.rotate(d.rot + t * d.v);
        ctx.fillStyle = d.col; M.rr(ctx, -12, -4, 24, 8, 4); ctx.fill(); ctx.restore();
      }
    } else if (th.deco === 'meadow') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (i = 0; i < 6; i++) {
        d = deco[i];
        var cx = (d.x + t * 12 * d.v) % (W + 300) - 150, cy = 40 + i * 70 % 260;
        var s = 0.7 + d.s * 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy, 30 * s, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 34 * s, cy - 14 * s, 36 * s, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 70 * s, cy, 28 * s, 0, 6.28); ctx.fill();
        M.rr(ctx, cx - 14 * s, cy, 98 * s, 30 * s, 15 * s); ctx.fill();
      }
    } else if (th.deco === 'dots') {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      for (i = 0; i < 10; i++) {
        d = deco[i];
        ctx.beginPath(); ctx.arc(d.x + Math.sin(t * 0.3 + d.ph) * 40, d.y + Math.cos(t * 0.4 + d.ph) * 30, 30 + d.s * 50, 0, 6.28); ctx.fill();
      }
    } else if (th.deco === 'grid' || th.deco === 'sparkle') {
      ctx.fillStyle = th.deco === 'grid' ? '#ffffff' : '#ffd76a';
      for (i = 0; i < deco.length; i++) {
        d = deco[i];
        var a = 0.5 + 0.5 * Math.sin(t * 2 * d.v + d.ph);
        ctx.globalAlpha = a * 0.9;
        M.star(ctx, d.x, d.y * (th.deco === 'grid' ? 0.62 : 1), 3 + d.s * (th.deco === 'grid' ? 4 : 9)); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ============================================================ drawing */
  function easeOut(p) { return 1 - (1 - p) * (1 - p) * (1 - p); }
  function easeBack(p) { var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }

  function drawBoard(b, x, y, S, th, dim) {
    var bs = boardSprite(th, b.N, S);
    ctx.drawImage(bs.cv, x - bs.P, y - bs.P, bs.full, bs.full);
    var gm = geom(b.N, S), g = gm.g, s = gm.s;
    function cx(c) { return x + g + c * (s + g) + s / 2; }
    function cy(r) { return y + g + r * (s + g) + s / 2; }
    var i, p, e;
    for (i = 0; i < b.ghosts.length; i++) {
      var gh = b.ghosts[i];
      p = (now - gh.t0) / SLIDE;
      if (p >= 1) continue;
      e = easeOut(Math.max(0, p));
      drawTileAt(th, gh.v, s, cx(Kit.lerp(gh.fc, gh.c, e)), cy(Kit.lerp(gh.fr, gh.r, e)), 1, 1);
    }
    var pops = null;
    for (i = 0; i < b.grid.length; i++) {
      var t = b.grid[i];
      if (!t) continue;
      if (t.born > now || t.pop > now) continue;
      if (t.pop > -9 && now - t.pop < POP) { (pops || (pops = [])).push(t); continue; }
      var sx = 1, sy = 1, px = t.c, py = t.r;
      p = (now - t.t0) / SLIDE;
      if (p < 1 && (t.fr !== t.r || t.fc !== t.c)) {
        e = easeOut(Math.max(0, p));
        px = Kit.lerp(t.fc, t.c, e); py = Kit.lerp(t.fr, t.r, e);
        var st = 0.13 * Math.sin(Math.PI * p);
        if (t.fr === t.r) { sx = 1 + st; sy = 1 - st * 0.6; } else { sy = 1 + st; sx = 1 - st * 0.6; }
      }
      var q = (now - t.born) / SPAWN;
      if (q < 1) { var sc = easeBack(Math.max(0, q)); sx *= sc; sy *= sc; }
      drawTileAt(th, t.v, s, cx(px), cy(py), sx, sy);
    }
    if (pops) for (i = 0; i < pops.length; i++) {
      var tp = pops[i], qq = (now - tp.pop) / POP;
      var k = 1 + 0.32 * Math.sin(Math.PI * qq) * (1 - qq * 0.4);
      var sq = 0.09 * Math.sin(Math.PI * 2 * qq);
      var X = cx(tp.c), Y = cy(tp.r);
      drawTileAt(th, tp.v, s, X, Y, k * (1 + sq), k * (1 - sq));
      var fl = (1 - qq) * (1 - qq) * 0.55;
      if (fl > 0.02) {
        ctx.globalAlpha = fl; ctx.fillStyle = '#ffffff';
        M.rr(ctx, X - s * k / 2, Y - s * k / 2, s * k, s * k * 0.93, s * 0.17 * k); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (dim > 0) {
      ctx.globalAlpha = dim;
      ctx.fillStyle = '#1a0d3a';
      M.rr(ctx, x, y, S, S, S * 0.045); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function tileCenter(N, S, x, y, r, c) {
    var gm = geom(N, S);
    return { x: x + gm.g + c * (gm.s + gm.g) + gm.s / 2, y: y + gm.g + r * (gm.s + gm.g) + gm.s / 2, s: gm.s };
  }

  /* ============================================================ effects */
  function part(x, y, vx, vy, life, size, col, type, grav) {
    if (fx.parts.length > 460) fx.parts.splice(0, 20);
    fx.parts.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, size: size, col: col, type: type || 0, g: grav == null ? 500 : grav, rot: Math.random() * 6.28, vr: Kit.rand(-10, 10) });
  }
  function burst(x, y, n, speed, cols, size, type, grav) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = speed * Kit.rand(0.35, 1);
      part(x, y, Math.cos(a) * sp, Math.sin(a) * sp - speed * 0.2, Kit.rand(0.4, 0.8), size * Kit.rand(0.6, 1.2), cols[i % cols.length], type, grav);
    }
  }
  function confetti(n, fromTop) {
    var cols = ['#ff4f9a', '#ffd23f', '#4fdc7a', '#4fb8ff', '#b88bff', '#ff8a3d', '#ffffff'];
    for (var i = 0; i < n; i++) {
      if (fromTop) part(Kit.rand(0, W), Kit.rand(-120, -10), Kit.rand(-60, 60), Kit.rand(80, 260), Kit.rand(2.5, 4), Kit.rand(9, 15), cols[i % cols.length], 1, 120);
      else { var a = Kit.rand(-2.4, -0.7); var sp = Kit.rand(350, 800); part(W / 2 + Kit.rand(-80, 80), H * 0.55, Math.cos(a) * sp, Math.sin(a) * sp, Kit.rand(2, 3.5), Kit.rand(9, 15), cols[i % cols.length], 1, 420); }
    }
  }
  function floatText(x, y, text, size, col) {
    if (fx.floats.length > 24) fx.floats.shift();
    fx.floats.push({ x: x, y: y, text: text, size: size, col: col, t: 0, max: 0.85 });
  }
  function bigText(text, col, sub, tileV) {
    fx.big = { text: text, col: col, sub: sub || '', v: tileV || 0, t: 0, max: tileV ? 1.25 : 0.9 };
  }

  function updateFX(dt) {
    var i, p;
    for (i = fx.parts.length - 1; i >= 0; i--) {
      p = fx.parts[i];
      p.life -= dt;
      if (p.life <= 0) { fx.parts.splice(i, 1); continue; }
      if (p.type === 1) { p.vx *= 0.985; p.vy = Math.min(p.vy + p.g * dt, 260); p.x += Math.sin(p.life * 5 + p.rot) * 30 * dt; }
      else p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (i = fx.floats.length - 1; i >= 0; i--) { fx.floats[i].t += dt; if (fx.floats[i].t >= fx.floats[i].max) fx.floats.splice(i, 1); }
    for (i = fx.rings.length - 1; i >= 0; i--) { fx.rings[i].t += dt; if (fx.rings[i].t >= fx.rings[i].max) fx.rings.splice(i, 1); }
    if (fx.big) { fx.big.t += dt; if (fx.big.t >= fx.big.max) fx.big = null; }
    fx.shake = Math.max(0, fx.shake - dt * 30);
    fx.sx = (Math.random() - 0.5) * 2 * fx.shake; fx.sy = (Math.random() - 0.5) * 2 * fx.shake;
    var damp = Math.pow(0.0005, dt);
    fx.bx *= damp; fx.by *= damp;
    fx.flash = Math.max(0, fx.flash - dt * 2.5);
  }

  function drawFX() {
    var i, p;
    for (i = 0; i < fx.rings.length; i++) {
      var rg = fx.rings[i], q = rg.t / rg.max;
      ctx.globalAlpha = (1 - q) * 0.8;
      ctx.strokeStyle = rg.col; ctx.lineWidth = 10 * (1 - q) + 2;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r0 + (rg.r1 - rg.r0) * easeOut(q), 0, 6.28); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < fx.parts.length; i++) {
      p = fx.parts[i];
      ctx.globalAlpha = Math.min(1, p.life / p.max * 1.6);
      ctx.fillStyle = p.col;
      if (p.type === 1) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 1.7)); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
      } else if (p.type === 2) {
        M.star(ctx, p.x, p.y, p.size); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * p.life / p.max), 0, 6.28); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.direction = 'ltr';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (i = 0; i < fx.floats.length; i++) {
      var f = fx.floats[i], q2 = f.t / f.max;
      var sc = q2 < 0.15 ? 0.6 + q2 / 0.15 * 0.5 : 1.1 - Math.min(0.1, (q2 - 0.15));
      ctx.globalAlpha = q2 > 0.6 ? 1 - (q2 - 0.6) / 0.4 : 1;
      ctx.font = '700 ' + Math.round(f.size * sc) + 'px Fredoka';
      var yy = f.y - easeOut(q2) * 60;
      ctx.lineWidth = f.size * 0.2; ctx.strokeStyle = INK; ctx.strokeText(f.text, f.x, yy);
      ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, yy);
    }
    ctx.globalAlpha = 1;
    if (fx.big) drawBig(fx.big);
  }

  function drawBig(b) {
    var q = b.t / b.max, cx = BX + BS / 2, cy = BY + BS / 2;
    var inT = Math.min(1, b.t / 0.25), sc = easeBack(inT);
    var alpha = q > 0.6 ? 1 - (q - 0.6) / 0.4 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (b.v) {
      // rays + tile
      ctx.save(); ctx.translate(cx, cy - 40); ctx.rotate(now * 0.8);
      ctx.fillStyle = 'rgba(255,240,150,0.28)';
      for (var i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40 * sc, -260 * sc); ctx.lineTo(40 * sc, -260 * sc); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      var ts = 150;
      drawTileAt(theme(), b.v, ts, cx, cy - 40, sc * (1 + 0.04 * Math.sin(now * 8)), sc * (1 - 0.04 * Math.sin(now * 8)));
      cy += 95;
    }
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.rotate(-0.05);
    ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.font = '700 64px Fredoka';
    ctx.lineWidth = 14; ctx.strokeStyle = INK; ctx.strokeText(b.text, 0, 0);
    ctx.fillStyle = b.col; ctx.fillText(b.text, 0, 0);
    if (b.sub) {
      ctx.font = '700 30px Fredoka';
      ctx.lineWidth = 9; ctx.strokeText(b.sub, 0, 52);
      ctx.fillStyle = '#ffffff'; ctx.fillText(b.sub, 0, 52);
    }
    ctx.restore();
  }

  /* ============================================================== game */
  function startGame(N, fresh) {
    G.N = N; save.size = N; store.set('size', N);
    queue.length = 0;
    fx.parts.length = 0; fx.floats.length = 0; fx.rings.length = 0; fx.big = null;
    G.board = new Board(N);
    var d = fresh ? null : liveSave(N);
    if (d) {
      G.board.load(d.v, now + 0.05, 0.03);
      G.score = d.s; G.undos = d.u; G.hist = d.h; G.won = d.w; G.keep = d.k; G.moves = d.m;
      G.startBest = d.sb;
    } else {
      G.board.spawn(now + 0.1); G.board.spawn(now + 0.22);
      G.score = 0; G.undos = 3; G.hist = []; G.won = false; G.keep = false; G.moves = 0;
      G.startBest = save.best[N];
      save.games++; store.set('games', save.games);
    }
    G.dead = false; G.maxT = G.board.maxTile(); G.newBest = G.startBest > 0 && G.score > G.startBest;
    G.shownScore = G.score;
    setScreen('play');
    refreshHUD(true);
    saveGame();
    sfx.start();
  }

  function saveGame() {
    if (!G.board) return;
    store.set('g' + G.N, { v: G.board.values(), s: G.score, u: G.undos, h: G.hist, w: G.won, k: G.keep, m: G.moves, sb: G.startBest });
  }

  function doMove(dir) {
    if (G.screen !== 'play' || G.dead || !G.board) return;
    var b = G.board, N = G.N;
    var before = { v: b.values(), s: G.score };
    var r = b.move(dir, now);
    if (!r.moved) {
      fx.bx = DC[dir] * 9; fx.by = DR[dir] * 9;
      sfx.blocked();
      return;
    }
    G.hist.push(before); if (G.hist.length > 3) G.hist.shift();
    G.moves++;
    G.score += r.gained;
    fx.bx = DC[dir] * 3; fx.by = DR[dir] * 3;
    sfx.slide();
    b.spawn(now + SLIDE * 0.9);
    later(SLIDE * 0.9, sfx.spawn);
    var merges = r.merges, gained = r.gained;
    if (merges.length) later(SLIDE, function () { mergeFX(merges, gained); });

    if (G.score > save.best[N]) {
      save.best[N] = G.score; store.set('best', save.best);
      if (!G.newBest && G.startBest > 0) {
        G.newBest = true;
        later(SLIDE + 0.1, function () { toast('🏆 رقم قياسي جديد!'); sfx.best(); confetti(40, true); });
      }
    }
    var mx = b.maxTile();
    if (mx > G.maxT) {
      var prevMax = G.maxT; G.maxT = mx;
      if (mx >= 128 && prevMax > 0 && mx !== WIN[N]) later(SLIDE + 0.05, function () { milestone(mx); });
    }
    if (mx > save.bt[N]) { save.bt[N] = mx; store.set('bt', save.bt); }
    if (mx > save.bestTile) {
      var prev = save.bestTile;
      save.bestTile = mx; store.set('bestTile', mx);
      THEMES.forEach(function (th) {
        if (th.req > prev && th.req <= mx) later(0.9, function () { toast('🔓 شكل جديد: «' + th.name + '»! اضغط T'); sfx.unlock(); refreshHUD(); });
      });
    }
    if (mx >= WIN[N] && !G.won) {
      G.won = true;
      later(0.45, showWin);
    }
    if (!b.canMove()) markDead();
    refreshHUD();
    saveGame();
  }

  function markDead() {
    G.dead = true; G.deadAt = now + 0.3;
    later(0.5, sfx.lose);
    later(1.1, function () { if (G.screen === 'play') showOver(); });
  }

  var COMBO = { 2: 'مزدوج!', 3: 'ثلاثي!', 4: 'رائع!', 5: 'مذهل!' };
  var COMBO_COL = { 2: '#4fdc7a', 3: '#ffd23f', 4: '#ff8a3d', 5: '#ff4f9a' };
  function mergeFX(merges, gained) {
    var th = theme(), top = 0;
    for (var i = 0; i < merges.length; i++) {
      var t = merges[i], k = log2(t.v);
      var c = tileCenter(G.N, BS, BX, BY, t.r, t.c);
      var col = th.style === 'neon' ? M.tileColor(th, t.v) : M.shade(M.tileColor(th, t.v), -0.05);
      burst(c.x, c.y, Math.min(26, 6 + k * 2), 180 + k * 22, [col, '#ffffff', col], 5 + k * 0.5, k >= 7 ? 2 : 0, 420);
      if (k >= 6) fx.rings.push({ x: c.x, y: c.y, r0: c.s * 0.4, r1: c.s * (0.9 + k * 0.05), t: 0, max: 0.4, col: k >= 9 ? '#fff3a0' : '#ffffff' });
      floatText(c.x, c.y - c.s * 0.1, '+' + t.v, Math.min(46, 22 + k * 2.2), k >= 9 ? '#ffd23f' : '#ffffff');
      sfx.merge(t.v, i);
      if (t.v > top) top = t.v;
    }
    var tk = log2(top);
    if (tk >= 7) fx.shake = Math.max(fx.shake, Math.min(9, (tk - 6) * 1.6));
    if (merges.length >= 2) {
      var n = Math.min(5, merges.length);
      if (!fx.big || !fx.big.v) bigText(COMBO[n], COMBO_COL[n]);
      sfx.combo(n);
    }
    bumpScore(gained);
  }

  function milestone(v) {
    var th = theme(), name = M.tileName(th, v);
    bigText(name ? name + '!' : 'وصلت إلى ' + v + '!', '#ffd23f', name ? 'وصلت إلى ' + v : '', v);
    sfx.milestone(v);
    var c = { x: BX + BS / 2, y: BY + BS / 2 - 40 };
    burst(c.x, c.y, 30, 520, ['#ffd23f', '#ffffff', '#ff4f9a', '#4fb8ff'], 7, 2, 300);
    fx.shake = Math.max(fx.shake, 6);
  }

  function undo() {
    if (!(G.screen === 'play' || G.screen === 'over') || !G.board) return;
    if (G.undos <= 0 || !G.hist.length) {
      sfx.deny();
      var bu = $('btnUndo'); bu.classList.remove('shake'); void bu.offsetWidth; bu.classList.add('shake');
      if (G.undos <= 0) toast('لا مزيد من التراجع في هذه اللعبة');
      return;
    }
    var h = G.hist.pop();
    G.undos--;
    queue.length = 0;
    fx.big = null;
    G.board.load(h.v, now, 0.012);
    G.board.grid.forEach(function (t) { if (t) t.born = now - SPAWN * 0.55; });
    G.score = h.s; G.shownScore = G.score;
    G.dead = false; G.maxT = G.board.maxTile();
    if (G.screen === 'over') setScreen('play');
    sfx.undo();
    for (var i = 0; i < 18; i++) {
      var a = i / 18 * 6.28;
      part(BX + BS / 2 + Math.cos(a) * BS * 0.45, BY + BS / 2 + Math.sin(a) * BS * 0.45, -Math.cos(a) * 240 - Math.sin(a) * 200, -Math.sin(a) * 240 + Math.cos(a) * 200, 0.5, 7, '#ffd23f', 2, 0);
    }
    refreshHUD(true);
    saveGame();
  }

  function restart() { sfx.click(); startGame(G.N, true); }

  /* ============================================================ screens */
  function setScreen(s) {
    G.screen = s;
    $('scrTitle').hidden = s !== 'title';
    $('hud').hidden = s === 'title';
    $('scrPause').hidden = s !== 'pause';
    $('scrOver').hidden = s !== 'over';
    $('scrWin').hidden = s !== 'win';
    if (s === 'title') refreshTitle();
    armRestart(false);
    try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function pause() { if (G.screen !== 'play') return; sfx.click(); setScreen('pause'); }
  function resume() { if (G.screen !== 'pause') return; sfx.click(); setScreen('play'); }
  function toMenu() { sfx.click(); saveGame(); queue.length = 0; fx.big = null; demoReset(); setScreen('title'); }

  function showOver() {
    var N = G.N;
    setScreen('over');
    $('overScore').textContent = Kit.fmt(G.score);
    $('overBestVal').textContent = Kit.fmt(save.best[N]);
    $('overBest').hidden = !G.newBest;
    $('overHead').textContent = G.newBest ? 'نتيجة رائعة!' : 'لا توجد حركات!';
    var canU = G.undos > 0 && G.hist.length > 0;
    $('btnOverUndo').hidden = !canU;
    $('overUndoN').textContent = canU ? '(' + G.undos + ')' : '';
    drawIcon($('overTile'), theme(), G.maxT || 2);
    var hint;
    if (G.newBest) hint = 'تفوّقت على نفسك! هل تستطيع أكثر؟';
    else if (G.maxT >= 1024 && !G.won) hint = 'كنت قريباً جداً من 2048! 😮';
    else if (save.best[N] > 0 && G.score >= save.best[N] * 0.85) hint = 'قريب جداً من رقمك القياسي!';
    else if (canU) hint = 'جرّب التراجع وغيّر خطتك! ↶';
    else hint = Kit.pick(['نصيحة: اجمع أكبر بلاطة في زاوية واحدة!', 'نصيحة: لا تحرّك البلاطة الكبيرة من زاويتها.', 'نصيحة: استعمل اتجاهين أو ثلاثة فقط معظم الوقت.']);
    $('overHint').textContent = hint;
    if (G.newBest) { confetti(90, false); sfx.best(); }
  }

  function showWin() {
    if (G.screen !== 'play') return;
    setScreen('win');
    $('winNum').textContent = WIN[G.N];
    drawIcon($('winTile'), theme(), WIN[G.N]);
    confetti(160, false);
    later(0.5, function () { confetti(80, true); });
    fx.shake = 8;
    sfx.win();
  }
  function keepGoing() {
    if (G.screen !== 'win') return;
    sfx.click(); G.keep = true; saveGame();
    setScreen('play');
    if (G.dead) showOver();
  }

  /* ================================================================ HUD */
  function refreshHUD(instant) {
    if (!G.board) return;
    $('score').textContent = Kit.fmt(G.score);
    $('best').textContent = Kit.fmt(save.best[G.N]);
    $('sizeLbl').textContent = G.N + '×' + G.N;
    var dots = $('undoDots').children;
    for (var i = 0; i < 3; i++) dots[i].className = i < G.undos ? '' : 'off';
    $('btnUndo').classList.toggle('empty', G.undos <= 0 || !G.hist.length);
    $('themeName').textContent = theme().name;
    var mx = Math.max(2, G.maxT), target = WIN[G.N];
    if (G.won || mx >= target) { target *= 2; while (target <= mx) target *= 2; }
    $('goalTxt').textContent = target;
    drawIcon($('goalTile'), theme(), target);
    $('goalBar').style.width = Math.min(100, Math.round(log2(mx) / log2(target) * 100)) + '%';
    void instant;
  }
  function bumpScore(gained) {
    var box = $('scoreBox');
    box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
    if (gained > 0) {
      var el = document.createElement('div');
      el.className = 'plus'; el.textContent = '+' + gained;
      box.appendChild(el);
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 950);
    }
  }

  function drawIcon(cv, th, v) {
    var c = cv.getContext('2d'), w = cv.width;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, w);
    var s = w * 0.78;
    c.translate((w - s) / 2, (w - s) / 2);
    c.direction = 'ltr';
    M.drawTile(c, th, v, s);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  var toastQ = [], toastBusy = false, toastT1 = 0, toastT2 = 0;
  function toast(text, now2) {
    if (now2) {
      // replace whatever is showing right now (used for quick theme switching)
      toastQ.length = 0; clearTimeout(toastT1); clearTimeout(toastT2);
      toastQ.push(text); nextToast(); return;
    }
    toastQ.push(text);
    if (!toastBusy) nextToast();
  }
  function nextToast() {
    var el = $('toast');
    if (!toastQ.length) { toastBusy = false; return; }
    toastBusy = true;
    el.textContent = toastQ.shift();
    el.classList.add('show');
    toastT1 = setTimeout(function () { el.classList.remove('show'); toastT2 = setTimeout(nextToast, 380); }, 2100);
  }

  var restartArmed = 0, restartTimer = 0;
  function armRestart(on) {
    restartArmed = on;
    var b = $('btnRestart');
    b.classList.toggle('warn', !!on);
    $('restartLbl').textContent = on ? 'متأكد؟ انقر مجدداً' : 'لعبة جديدة';
    clearTimeout(restartTimer);
    if (on) restartTimer = setTimeout(function () { armRestart(false); }, 3500);
  }

  /* ============================================================== title */
  function buildTitle() {
    var sz = $('sizes');
    sz.innerHTML = '';
    SIZES.forEach(function (n) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'szb'; b.dataset.n = n;
      b.innerHTML = '<span class="kn" dir="ltr">' + n + '</span><span class="sv" hidden>▶ محفوظة</span><b>' + n + '×' + n + '</b><span class="nm">' + SIZE_NAMES[n] + '</span><span class="bs"></span>';
      b.addEventListener('click', function () { selectSize(n); });
      sz.appendChild(b);
    });
    var tb = $('themes');
    tb.innerHTML = '';
    THEMES.forEach(function (th) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'thb'; b.dataset.id = th.id;
      b.innerHTML = '<canvas width="132" height="132"></canvas><span class="nm">' + th.name + '</span><span class="lk"></span><span class="pad"></span>';
      b.addEventListener('click', function () {
        if (!unlocked(th)) { sfx.deny(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        setTheme(th.id); sfx.click();
      });
      tb.appendChild(b);
    });
    renderThemeIcons();
  }
  function renderThemeIcons() {
    var btns = $('themes').children;
    for (var i = 0; i < btns.length; i++) {
      var th = M.byId[btns[i].dataset.id];
      drawIcon(btns[i].querySelector('canvas'), th, th.icon);
    }
  }
  function refreshTitle() {
    var szb = $('sizes').children;
    for (var i = 0; i < szb.length; i++) {
      var n = +szb[i].dataset.n;
      szb[i].classList.toggle('on', n === save.size);
      szb[i].querySelector('.bs').textContent = save.best[n] ? '🏆 ' + Kit.fmt(save.best[n]) : 'لم تلعب بعد';
      szb[i].querySelector('.sv').hidden = !liveSave(n);
    }
    var tb = $('themes').children;
    for (var j = 0; j < tb.length; j++) {
      var th = M.byId[tb[j].dataset.id], un = unlocked(th);
      tb[j].classList.toggle('locked', !un);
      tb[j].classList.toggle('on', th.id === save.theme);
      tb[j].classList.toggle('fresh', un && save.seen.indexOf(th.id) < 0);
      tb[j].querySelector('.lk').textContent = un ? '' : 'اصنع ' + th.req;
      tb[j].querySelector('.pad').textContent = un ? '' : '🔒';
    }
    $('bestTileLine').innerHTML = save.bestTile ? 'أكبر بلاطة صنعتها: <b dir="ltr">' + save.bestTile + '</b>' : 'افتح أشكالاً جديدة بصنع بلاطات كبيرة!';
    var d = liveSave(save.size);
    $('playLbl').textContent = d ? '▶ تابع' : '▶ العب';
    $('playSub').textContent = d ? 'النقاط: ' + Kit.fmt(d.s) : '';
    $('btnNewT').hidden = !d;
  }
  function selectSize(n) {
    if (SIZES.indexOf(n) < 0) return;
    save.size = n; store.set('size', n);
    sfx.click();
    demoReset();
    refreshTitle();
  }
  function setTheme(id) {
    var th = M.byId[id]; if (!th || !unlocked(th)) return;
    save.theme = id; store.set('theme', id);
    if (save.seen.indexOf(id) < 0) { save.seen.push(id); store.set('seen', save.seen); }
    buildDeco();
    if (G.screen === 'title') refreshTitle(); else refreshHUD();
  }
  function cycleTheme() {
    var list = THEMES.filter(unlocked);
    var i = 0;
    for (var j = 0; j < list.length; j++) if (list[j].id === save.theme) i = j;
    var nx = list[(i + 1) % list.length];
    if (list.length < 2) { sfx.deny(); toast('اصنع ' + THEMES[1].req + ' لتفتح شكلاً جديداً!'); return; }
    setTheme(nx.id); sfx.click();
    toast('🎨 ' + nx.name, true);
  }

  /* ========================================================== title demo */
  var demo = { b: null, next: 0, resetAt: 0 };
  function demoReset() {
    demo.b = new Board(save.size);
    demo.b.spawn(now + 0.1); demo.b.spawn(now + 0.2); demo.b.spawn(now + 0.3);
    demo.next = now + 0.9; demo.resetAt = 0;
  }
  function demoTick() {
    if (!demo.b) demoReset();
    if (demo.resetAt && now >= demo.resetAt) { demoReset(); return; }
    if (now < demo.next || demo.resetAt) return;
    demo.next = now + 0.55;
    var vals = demo.b.values(), N = demo.b.N, best = -1, bd = -1;
    for (var d = 0; d < 4; d++) {
      var r = simulate(vals, N, d);
      if (!r.moved) continue;
      var sc = r.gained + (d === 2 || d === 3 ? 6 : 0) + (d === 0 ? -8 : 0) + Math.random() * 5;
      if (sc > best) { best = sc; bd = d; }
    }
    if (bd < 0 || demo.b.maxTile() >= 512) { demo.resetAt = now + 1.2; return; }
    var res2 = demo.b.move(bd, now);
    demo.b.spawn(now + SLIDE * 0.9);
    res2.merges.forEach(function (t) {
      later(SLIDE, function () {
        if (G.screen !== 'title') return;
        var c = tileCenter(N, DS, DX, DY, t.r, t.c);
        burst(c.x, c.y, 8, 160, [M.tileColor(theme(), t.v), '#ffffff'], 4, 0, 300);
      });
    });
  }

  /* ============================================================== input */
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var k = e.code;
    var go = k === 'Enter' || k === 'NumpadEnter' || k === 'Space';
    if (go) e.preventDefault();
    switch (G.screen) {
      case 'title':
        if (e.repeat) return;
        if (go) play(false);
        else if (/^(Digit|Numpad)[3-6]$/.test(k)) selectSize(+k.slice(-1));
        else if (k === 'KeyT') { cycleTheme(); }
        break;
      case 'play':
        if (KEYDIR[k] != null) { e.preventDefault(); if (!e.repeat) doMove(KEYDIR[k]); }
        else if (e.repeat) return;
        else if (k === 'KeyU' || k === 'KeyZ' || k === 'Backspace') undo();
        else if (k === 'KeyP' || k === 'Escape') pause();
        else if (k === 'KeyT') cycleTheme();
        break;
      case 'pause':
        if (e.repeat) return;
        if (go || k === 'KeyP' || k === 'Escape') resume();
        else if (k === 'KeyR') restart();
        break;
      case 'over':
        if (e.repeat) return;
        if (go || k === 'KeyR') restart();
        else if (k === 'KeyU' || k === 'KeyZ' || k === 'Backspace') undo();
        else if (k === 'Escape') toMenu();
        break;
      case 'win':
        if (e.repeat) return;
        if (go) keepGoing();
        else if (k === 'KeyR') { G.keep = true; restart(); }
        break;
    }
  });

  var drag = null;
  window.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest('button, .card, .panel, .box')) return;
    var p = view.toLogical(e.clientX, e.clientY);
    drag = { x: p.x, y: p.y, done: false };
  });
  window.addEventListener('pointermove', function (e) {
    if (!drag || drag.done) return;
    var p = view.toLogical(e.clientX, e.clientY), dx = p.x - drag.x, dy = p.y - drag.y;
    if (dx * dx + dy * dy < 34 * 34) return;
    drag.done = true;
    var dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    if (G.screen === 'play') doMove(dir);
  });
  window.addEventListener('pointerup', function () { drag = null; });
  window.addEventListener('blur', function () { drag = null; });
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('button');
    if (b) b.blur();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden && G.screen === 'play') pause(); });

  function play(fresh) { sfx.click(); startGame(save.size, fresh); }
  function on(id, fn) { $(id).addEventListener('click', function (e) { e.stopPropagation(); fn(); }); }
  on('btnPlay', function () { play(false); });
  on('btnNewT', function () { play(true); });
  on('btnUndo', undo);
  on('btnTheme', cycleTheme);
  on('btnPause', pause);
  on('btnRestart', function () {
    if (G.moves >= 3 && !restartArmed && !G.dead) { sfx.click(); armRestart(true); return; }
    restart();
  });
  on('btnResume', resume);
  on('btnPauseRestart', restart);
  on('btnPauseMenu', toMenu);
  on('btnAgain', restart);
  on('btnOverUndo', undo);
  on('btnOverMenu', toMenu);
  on('btnKeep', keepGoing);
  on('btnWinNew', function () { G.keep = true; restart(); });

  Kit.muteButton();

  /* =============================================================== loop */
  function update(dt) {
    now += dt;
    for (var i = 0; i < queue.length; i++) {
      if (queue[i].at <= now) { var q = queue[i]; queue.splice(i, 1); i--; q.fn(); }
    }
    updateFX(dt);
    if (G.screen === 'title') demoTick();
  }
  function render() {
    ctx.save();
    drawBG(now);
    if (G.screen === 'title') {
      if (demo.b) drawBoard(demo.b, DX, DY, DS, theme(), 0);
    } else if (G.board) {
      var dim = G.dead ? Math.min(0.35, Math.max(0, now - G.deadAt) * 0.6) : 0;
      drawBoard(G.board, BX + fx.sx + fx.bx, BY + fx.sy + fx.by, BS, theme(), dim);
    }
    drawFX();
    ctx.restore();
  }

  /* =============================================================== init */
  buildDeco();
  buildTitle();
  demoReset();
  setScreen('title');
  function fontsReady() { clearCaches(); renderThemeIcons(); if (G.board) refreshHUD(); }
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 40px Fredoka', '2048'), document.fonts.load('700 40px Fredoka', 'دمج')]).then(fontsReady, function () {});
    if (document.fonts.ready) document.fonts.ready.then(fontsReady, function () {});
  }
  Kit.loop(update, render);

  /* ============================================================== debug */
  window.__game = {
    state: function () {
      return { screen: G.screen, N: G.N, score: G.score, undos: G.undos, hist: G.hist.length, won: G.won, keep: G.keep, dead: G.dead,
        max: G.board ? G.board.maxTile() : 0, values: G.board ? G.board.values() : null, theme: save.theme, best: save.best, bestTile: save.bestTile, parts: fx.parts.length };
    },
    set: function (vals) { if (!G.board || !validVals(vals, G.N)) return false; G.board.load(vals, now, 0.01); G.dead = false; G.maxT = G.board.maxTile(); refreshHUD(); saveGame(); return true; },
    move: doMove, undo: undo, pause: pause, menu: toMenu, setTheme: setTheme,
    bench: function (n) { n = n || 100; var t = performance.now(); for (var i = 0; i < n; i++) render(); return (performance.now() - t) / n; },
    unlockAll: function () { save.bestTile = Math.max(save.bestTile, 2048); store.set('bestTile', save.bestTile); refreshTitle(); },
    nearWin: function () {
      var N = G.N, v = []; for (var i = 0; i < N * N; i++) v.push(0);
      v[N * (N - 1)] = WIN[N] / 2; v[N * (N - 1) + 1] = WIN[N] / 2; v[N * (N - 1) + 2] = 256; v[0] = 4;
      return this.set(v);
    },
    forceOver: function () {
      var N = G.N, v = [];
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) v.push((r + c) % 2 ? 4 : 2);
      v[0] = 256; v[N * N - 1] = 128;
      if (!this.set(v)) return false;
      markDead(); return true;
    }
  };
})();
