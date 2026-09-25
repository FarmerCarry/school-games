/* Tunnel Blitz — an original tunnel dodger for Recess Arcade.
 * Pseudo-3D: the tunnel is a polygon tube projected onto a 2D canvas.
 * The ship always sits at the bottom of the screen; ←/→ spin the whole tunnel.
 *
 * World units: the tunnel radius is 1. D = distance flown (camera position).
 * Angles are in "tunnel space"; screen angle = tunnel angle + rot.
 */
(function () {
  'use strict';
  var TB = window.TB;
  var TAU = Math.PI * 2, PI = Math.PI;

  var W = 1280, H = 720, CX = 640, CY = 336;
  var F = 520;            // focal length (px)
  var NEAR = 0.42, FAR = 36, RING = 1;
  var WS = 0.55;          // world scale: world units per displayed metre (keeps obstacles big on screen)
  var ZS = 1.9;           // ship depth in front of the camera
  var SHIP_R = 0.78;      // ship distance from the tunnel axis
  var HIT = 0.085;        // half-width of the ship hitbox (radians) — forgiving
  var NEARMISS = 0.17;    // gap (radians) that still counts as a CLOSE! call
  var ORB_R = 0.74;
  var SHIP_X = CX, SHIP_Y = CY + SHIP_R * F / ZS;
  var SHIP_SCALE = 34;

  /* ------------------------------------------------------------ helpers */
  function mod(a, m) { a %= m; return a < 0 ? a + m : a; }
  function angDiff(a, b) { return mod(a - b + PI, TAU) - PI; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rsign() { return Math.random() < 0.5 ? -1 : 1; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a.toFixed(3) + ')'; }
  function rgb(r, g, b) { return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')'; }
  function hsv(h, s, v, out) {
    h = mod(h, 360) / 60; var i = Math.floor(h), f = h - i;
    var p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f)), r, g, b;
    switch (i) { case 0: r = v; g = t; b = p; break; case 1: r = q; g = v; b = p; break; case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break; case 4: r = t; g = p; b = v; break; default: r = v; g = p; b = q; }
    out = out || [0, 0, 0]; out[0] = r * 255; out[1] = g * 255; out[2] = b * 255; return out;
  }
  function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  var WHITE = [255, 255, 255];

  /* ------------------------------------------------------------- saving */
  var store = Kit.store('tunnel-blitz');
  var DEFAULT_SAVE = {
    best: 0, bestD: 0, bestZone: 1, orbs: 0, ships: ['blitz'], tunnels: ['grid'], ship: 'blitz', tunnel: 'grid',
    mdone: [], mSeen: -1, runs: 0, orbsTotal: 0, closeTotal: 0, recOrbs: 0, recClose: 0, recStreak: 0, recShield: 0
  };
  function loadSave() {
    var s = store.get('save', null), d = JSON.parse(JSON.stringify(DEFAULT_SAVE));
    if (s && typeof s === 'object') {
      for (var k in d) {
        if (s[k] == null) continue;
        if (Array.isArray(d[k])) { if (Array.isArray(s[k])) d[k] = s[k]; }
        else if (typeof s[k] === typeof d[k]) d[k] = s[k];
      }
    }
    if (d.ships.indexOf('blitz') < 0) d.ships.push('blitz');
    if (d.tunnels.indexOf('grid') < 0) d.tunnels.push('grid');
    if (d.ships.indexOf(d.ship) < 0) d.ship = 'blitz';
    if (d.tunnels.indexOf(d.tunnel) < 0) d.tunnel = 'grid';
    return d;
  }
  var save = loadSave();
  function persist() { store.set('save', save); }

  function shipSkin() { for (var i = 0; i < TB.SHIPS.length; i++) if (TB.SHIPS[i].id === save.ship) return TB.SHIPS[i]; return TB.SHIPS[0]; }

  /* -------------------------------------------------------------- zones */
  var ROMAN = ['', ' 2', ' 3', ' 4', ' 5', ' 6', ' 7', ' 8'];
  var ZT = [null];
  (function () {
    var s = 0;
    for (var k = 1; k <= 60; k++) {
      var z = TB.ZDEF[(k - 1) % 8];
      var vn = k <= 8 ? 15 + 3 * (k - 1) : Math.min(46, 36 + 2 * (k - 8));
      var v = vn * WS;
      var loop = Math.min(7, Math.floor((k - 1) / 8));
      ZT.push({ k: k, start: s, len: v * 16, v: v, vn: vn, N: z.N, col: z.col, alt: z.alt, bg: z.bg, name: z.name + ROMAN[loop],
        rainbow: !!z.rainbow, key: z.key });
      s += v * 16;
    }
  })();
  var zCache = 1;
  function zoneAt(d) {
    var k = zCache;
    if (ZT[k].start > d) k = 1;
    while (k < ZT.length - 1 && ZT[k + 1].start <= d) k++;
    zCache = k;
    return k;
  }
  function rotMaxFor(v) { return Math.min(6.4, 4.5 + (v / WS - 15) * 0.07); }

  var TMP_C = [0, 0, 0];
  function zoneCol(Z, k, time) { // main colour of a zone (rainbow zones cycle)
    if (!Z.rainbow) return Z.col;
    return hsv(k * 22 + time * 50, 0.75, 1, TMP_C);
  }

  function params(k) {
    var i = Math.min(k, 9) - 1, Z = ZT[k];
    var late = k > 9 ? Math.max(0.82, 1 - 0.025 * (k - 9)) : 1;
    return {
      k: k, v: Z.v, N: Z.N, Z: Z,
      gapW: Math.max(0.66, [2.1, 1.75, 1.45, 1.25, 1.1, 0.98, 0.9, 0.82, 0.76][i] * (k > 9 ? late : 1)),
      rowT: [1.1, 0.95, 0.86, 0.8, 0.74, 0.7, 0.66, 0.62, 0.58][i] * late,
      shift: [1.3, 1.7, 2.1, 2.4, 2.7, 2.9, 3.1, 3.14, 3.14][i],
      rm: rotMaxFor(Z.v)
    };
  }

  // Pattern weights by zone. Each zone has a "signature" pattern that shows up most.
  var WEIGHTS = [
    null,
    { half: 4, wall: 4, twoGaps: 2, spiral: 1 },
    { wall: 3, half: 1, slalom: 4, twoGaps: 1, spiral: 2, bars: 1 },
    { wall: 3, slalom: 2, bars: 4, spiral: 2, twoGaps: 1, spinWall: 1 },
    { wall: 2, slalom: 2, bars: 2, checker: 4, spiral: 2, spinWall: 1, zigzag: 1 },
    { wall: 2, slalom: 2, bars: 2, checker: 2, spiral: 4, spinWall: 2, zigzag: 1 },
    { wall: 2, slalom: 2, bars: 2, checker: 2, spiral: 2, spinWall: 2, zigzag: 4 },
    { wall: 1, slalom: 2, bars: 2, checker: 2, spiral: 2, spinWall: 4, zigzag: 2 },
    { wall: 1, slalom: 2, bars: 3, checker: 2, spiral: 2, spinWall: 3, zigzag: 3, twoGaps: 1 }
  ];

  /* ------------------------------------------------------------ canvas */
  var canvas = document.getElementById('game');
  var ui = document.getElementById('ui');
  var view = Kit.fit(canvas, W, H, {
    maxDpr: 1.5,
    onResize: function (v) {
      ui.style.left = canvas.style.left;
      ui.style.top = canvas.style.top;
      ui.style.transform = 'scale(' + v.scale + ')';
    }
  });
  var ctx = view.ctx;

  /* -------------------------------------------------------------- audio */
  var A = Kit.audio;
  var Mus = (function () {
    var ac = null, out = null, nb = null, on = false, mode = 'title', bpm = 110, nextT = 0, step = 0;
    var intensity = 0, key = 0, kicks = [], wind = null, windG = null;
    function ensure() {
      ac = A.ctx;
      if (!ac || !A.master) return false;
      if (!out) {
        out = ac.createGain(); out.gain.value = 0.55; out.connect(A.master);
        nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        var d = nb.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        // continuous wind that follows how fast you spin
        wind = ac.createBufferSource(); wind.buffer = nb; wind.loop = true;
        var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
        windG = ac.createGain(); windG.gain.value = 0;
        wind.connect(bp); bp.connect(windG); windG.connect(A.master);
        wind.start();
      }
      return true;
    }
    function env(g, t, peak, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    function kick(t, v) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      env(g, t, v, 0.24); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.26);
      kicks.push(t); if (kicks.length > 12) kicks.shift();
    }
    function noiseHit(t, v, dur, type, freq, q) {
      var s = ac.createBufferSource(); s.buffer = nb;
      var f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
      var g = ac.createGain(); env(g, t, v, dur);
      s.connect(f); f.connect(g); g.connect(out);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    }
    function bass(t, hz, dur, v) {
      var o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = hz;
      f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(220, t + dur);
      env(g, t, v, dur); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
    }
    function pluck(t, hz, dur, v, type) {
      var o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = type; o.frequency.value = hz;
      f.type = 'lowpass'; f.frequency.value = 3200;
      env(g, t, v, dur); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
    }
    var PROG = [[0, 0], [-4, 1], [3, 1], [-2, 1]];
    var MEL = [0, 2, 1, 3, 2, 1, 0, 3];
    function hz(semi) { return 55 * Math.pow(2, semi / 12); }
    function schedule(s, t) {
      var bar = Math.floor(s / 16), st = s % 16, ch = PROG[bar % 4];
      var root = ch[0] + key, tones = [root, root + (ch[1] ? 4 : 3), root + 7, root + 12];
      var sp = 60 / bpm / 4;
      if (mode === 'game') {
        if (st % 4 === 0) kick(t, 0.85);
        if (st % 4 === 2) noiseHit(t, 0.12, 0.05, 'highpass', 7000);
        if (intensity >= 3 && st % 2 === 1) noiseHit(t, 0.045, 0.03, 'highpass', 8000);
        if (intensity >= 2 && (st === 4 || st === 12)) noiseHit(t, 0.28, 0.13, 'bandpass', 1600, 0.8);
        if (st % 2 === 0) bass(t, hz((st % 4 === 2 ? root + 12 : root) + 12), sp * 1.7, 0.2);
        if (intensity >= 1) pluck(t, hz(tones[(st + bar) % 4] + 36), sp * 0.9, 0.045, 'square');
        if (intensity >= 4 && st % 4 === 0) pluck(t, hz(tones[MEL[(st / 4 + bar * 4) % 8]] + 48), sp * 3.4, 0.05, 'triangle');
      } else {
        if (st === 0 || st === 8) kick(t, 0.45);
        if (st % 4 === 2) noiseHit(t, 0.05, 0.04, 'highpass', 7000);
        if (st % 2 === 0) pluck(t, hz(tones[(st / 2) % 4] + 36), sp * 1.8, 0.05, 'triangle');
        if (st === 0) bass(t, hz(root + 12), sp * 8, 0.15);
      }
    }
    return {
      get on() { return on; },
      play: function (m) {
        if (!ensure()) return;
        if (!on || mode !== m) { step = 0; nextT = ac.currentTime + 0.06; }
        mode = m; on = true;
      },
      stop: function () { on = false; kicks.length = 0; },
      set: function (b, i, k) { bpm = b; intensity = i; key = k; },
      tick: function () {
        if (!ensure()) return;
        var now = ac.currentTime;
        if (!on || A.muted) { nextT = now + 0.05; return; }
        if (nextT < now - 0.2) nextT = now + 0.05;
        while (nextT < now + 0.12) { schedule(step, nextT); nextT += 60 / bpm / 4; step++; }
      },
      wind: function (level) {
        if (!windG || !ac) return;
        windG.gain.setTargetAtTime(A.muted ? 0 : level, ac.currentTime, 0.05);
      },
      sinceKick: function () {
        if (!ac || !on || A.muted) return -1;
        var now = ac.currentTime, last = -9;
        for (var i = 0; i < kicks.length; i++) if (kicks[i] <= now) last = kicks[i];
        return now - last;
      }
    };
  })();

  var Sfx = {
    orb: function (n) {
      var f = 820 * Math.pow(2, Math.min(n, 14) / 12);
      A.tone({ freq: f, type: 'sine', dur: 0.09, vol: 0.2 });
      A.tone({ freq: f * 1.5, type: 'triangle', dur: 0.12, vol: 0.1, delay: 0.04 });
    },
    close: function (n) {
      var base = 1320 * Math.pow(2, Math.min(n - 1, 8) / 12);
      [1, 1.26, 1.5, 2].forEach(function (m, i) { A.tone({ freq: base * m, type: 'sine', dur: 0.09, vol: 0.12, delay: i * 0.03 }); });
      A.noise({ dur: 0.2, vol: 0.07, filter: 9000, to: 2500 });
    },
    whoosh: function () { A.noise({ dur: 0.14, vol: 0.05, filter: 2600, to: 400 }); },
    shieldGet: function () { [392, 523, 659, 784, 1047].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.1, vol: 0.2, delay: i * 0.045 }); }); },
    shieldBreak: function () {
      A.noise({ dur: 0.35, vol: 0.35, filter: 6000, to: 400 });
      A.tone({ freq: 900, to: 200, type: 'square', dur: 0.25, vol: 0.12 });
      for (var i = 0; i < 5; i++) A.tone({ freq: rnd(2500, 4200), type: 'triangle', dur: 0.06, vol: 0.06, delay: 0.03 + i * 0.03 });
    },
    crash: function () {
      A.noise({ dur: 0.75, vol: 0.55, filter: 2600, to: 70 });
      A.tone({ freq: 330, to: 38, type: 'sawtooth', dur: 0.7, vol: 0.2 });
      for (var i = 0; i < 8; i++) A.tone({ freq: rnd(2000, 4400), type: 'triangle', dur: 0.07, vol: 0.07, delay: 0.02 + i * 0.035 });
    },
    zone: function () {
      A.tone({ freq: 200, to: 1200, type: 'sawtooth', dur: 0.45, vol: 0.07 });
      A.noise({ dur: 0.5, vol: 0.12, filter: 500, to: 7000 });
      [523, 659, 784, 1047].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.13, delay: 0.32 + i * 0.02 }); });
    },
    go: function () {
      A.tone({ freq: 523, type: 'square', dur: 0.08, vol: 0.14 });
      A.tone({ freq: 1047, type: 'square', dur: 0.2, vol: 0.14, delay: 0.09 });
      A.noise({ dur: 0.4, vol: 0.12, filter: 800, to: 6000 });
    },
    newBest: function () { [659, 784, 988, 1319].forEach(function (f, i) { A.tone({ freq: f, type: 'square', dur: 0.12, vol: 0.12, delay: i * 0.07 }); }); },
    mission: function () { [784, 988, 1175, 1568].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.22, delay: i * 0.08 }); }); },
    buy: function () { [988, 1319, 1568, 1976, 2637].forEach(function (f, i) { A.tone({ freq: f, type: 'square', dur: 0.08, vol: 0.12, delay: i * 0.05 }); }); },
    deny: function () { A.tone({ freq: 160, type: 'square', dur: 0.18, vol: 0.14 }); A.tone({ freq: 120, type: 'square', dur: 0.2, vol: 0.12, delay: 0.1 }); },
    click: function () { Kit.sfx.click(); },
    equip: function () { Kit.sfx.pop(); },
    pause: function () { A.tone({ freq: 660, to: 330, type: 'triangle', dur: 0.15, vol: 0.18 }); },
    resume: function () { A.tone({ freq: 330, to: 660, type: 'triangle', dur: 0.15, vol: 0.18 }); }
  };

  /* -------------------------------------------------------- game state */
  var G = {
    state: 'title', modal: null,
    t: 0, D: 0, v: 12, rot: 0, rotVel: 0, lastInp: 0,
    zone: 1, runT: 0, score: 0, bonus: 0,
    orbsRun: 0, closeRun: 0, streak: 0, lastCloseT: -9, lastCloseRow: -1, bestStreak: 0, shieldsRun: 0,
    orbStreak: 0, orbStreakT: 0,
    shield: false, invuln: 0, dyingT: 0, overT: 0, shake: 0, flash: 0, flashCol: [255, 255, 255],
    squash: 0, bump: 0, fovKick: 0, beat: 0, passedBest: false, runActive: false,
    runMissions: [], lastWhoosh: 0,
    autopilot: false, invincible: false, dispScore: 0
  };
  var obs = [], pick = [], path = [];
  var cam = { D: 0, rot: 0, bx: 0, by: 0, f: F };

  /* ---------------------------------------------------------- generator */
  var gen = null;
  function genReset(startD, a) {
    gen = { d: startD, a: a == null ? PI / 2 : a, half: PI, plen: 0, row: 0, shieldD: startD + 280 };
  }
  function snapGap(c, w, N) {
    var ca = PI / N, v0 = PI / 2 + PI / N;
    var g = Math.max(1, Math.round(w / ca));
    var s = Math.round((c - v0) / ca - g / 2);
    var a0 = v0 + s * ca;
    return [a0, a0 + g * ca];
  }
  function addOrb(d, a, kind) {
    if (pick.length > 90) return;
    pick.push({ d: d, a: a, kind: kind || 'orb', taken: false });
  }
  function addBlock(d, a0, a1, o) {
    if (obs.length > 280) return;
    obs.push({ d: d, len: o.len || 0.6, a0: a0, a1: a1, rIn: o.rIn == null ? 0.2 : o.rIn, spin: o.spin || 0,
      N: o.N, c: o.c, row: gen.row, broken: 0, minGap: 9, done: false });
    obs[obs.length - 1].spin /= WS;
  }
  // A ring of blocks with the given gaps cut out. gaps: [[a0,a1], ...]
  function addRing(d, gaps, o) {
    var gs = gaps.map(function (g) { var s = mod(g[0], TAU); return [s, s + (g[1] - g[0])]; });
    gs.sort(function (a, b) { return a[0] - b[0]; });
    for (var i = 0; i < gs.length; i++) {
      var s = gs[i][1], e = i < gs.length - 1 ? gs[i + 1][0] : gs[0][0] + TAU;
      if (e - s > 0.03) addBlock(d, s, e, o);
    }
  }
  // Moves the generator to the next row, keeping it reachable in time.
  function adv(P, lim, nc, half, len, minT, trail, react) {
    len = len || 0.6;
    var da = Math.abs(angDiff(nc, gen.a));
    var move = Math.min(PI - half, Math.max(0, da + gen.half - half)) + 0.12;
    var need = move / (P.rm * 0.7) + (react == null ? 0.26 : react);
    var sp = gen.plen + P.v * Math.max(minT || P.rowT, need);
    var nd = gen.d + sp;
    if (nd + len > lim) return -1;
    if (trail && Math.random() < 0.45) {
      var from = gen.d + gen.plen, dd = nd - 1.5 - from, dA = angDiff(nc, gen.a);
      for (var i = 1; i <= 3; i++) addOrb(from + dd * i / 4, gen.a + dA * i / 4);
    }
    gen.row++;
    gen.d = nd; gen.a = nc; gen.half = half; gen.plen = len;
    path.push({ d: nd, a: nc, len: len });
    if (P.k >= 2 && nd > gen.shieldD && !G.shield) {
      addOrb(nd - 0.7, nc, 'shield');
      gen.shieldD = nd + P.v * rnd(35, 50);
    }
    return nd;
  }
  function colOf(P, alt) {
    if (P.Z.rainbow) return hsv(gen.row * 47, 0.8, 1).slice();
    return alt ? P.Z.alt : P.Z.col;
  }
  function gapOrb(d, a, chance) { if (Math.random() < chance) addOrb(d - 0.7, a); }

  var PAT = {
    wall: function (P, lim) {
      var gp = snapGap(gen.a + rsign() * rnd(Math.min(0.9, P.gapW * 0.45), P.shift), P.gapW, P.N);
      var nc = (gp[0] + gp[1]) / 2, d = adv(P, lim, nc, (gp[1] - gp[0]) / 2, 0.6, 0, true);
      if (d < 0) return false;
      addRing(d, [gp], { rIn: 0.2, N: P.N, c: colOf(P) });
      gapOrb(d, nc, 0.4);
      return true;
    },
    half: function (P, lim) {
      var n = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (var i = 0; i < n; i++) {
        var gp = snapGap(gen.a + rsign() * rnd(0.9, 1.8), PI, P.N);
        var nc = (gp[0] + gp[1]) / 2, d = adv(P, lim, nc, (gp[1] - gp[0]) / 2, 0.6, 0, true);
        if (d < 0) return false;
        addRing(d, [gp], { rIn: 0.2, N: P.N, c: colOf(P, i % 2) });
        gapOrb(d, nc, 0.45);
      }
      return true;
    },
    twoGaps: function (P, lim) {
      var w = P.gapW * 0.85;
      var g1 = snapGap(gen.a + rnd(-P.shift * 0.5, P.shift * 0.5), w, P.N);
      var c1 = (g1[0] + g1[1]) / 2;
      var g2 = snapGap(c1 + PI + rnd(-0.4, 0.4), w, P.N);
      var d = adv(P, lim, c1, (g1[1] - g1[0]) / 2, 0.6, 0, false);
      if (d < 0) return false;
      addRing(d, [g1, g2], { rIn: 0.2, N: P.N, c: colOf(P) });
      var c2 = (g2[0] + g2[1]) / 2; // bonus orbs down the far gap
      addOrb(d - 2.2, c2); addOrb(d - 1.4, c2); addOrb(d - 0.6, c2);
      return true;
    },
    slalom: function (P, lim) {
      var n = P.k <= 2 ? 3 : 3 + Math.floor(Math.random() * 3);
      var gw = (P.k <= 2 ? 0.95 : 0.78) * PI, len = Math.min(2.0, Math.max(1.2, P.v * 0.13));
      var c = gen.a + rnd(-0.6, 0.6), side = rsign();
      for (var i = 0; i < n; i++) {
        var gp = snapGap(c + (i % 2) * side * gw, gw, P.N);
        var nc = (gp[0] + gp[1]) / 2, d = adv(P, lim, nc, (gp[1] - gp[0]) / 2, len, 0, false);
        if (d < 0) return false;
        addRing(d, [gp], { rIn: 0.3, len: len, N: P.N, c: colOf(P, i % 2) });
        gapOrb(d + len * 0.5 + 0.7, nc, 0.5);
      }
      return true;
    },
    spiral: function (P, lim) {
      var n = 5 + Math.floor(Math.random() * 4) + (P.k >= 5 ? 2 : 0);
      var step = rsign() * rnd(0.32, 0.5) * (P.k >= 5 ? 1.15 : 1);
      var w = Math.max(1.0, P.gapW), c = gen.a + rnd(-0.5, 0.5), col = colOf(P, true);
      for (var i = 0; i < n; i++) {
        var d = adv(P, lim, c, w / 2, 0.5, 0.2, false, i === 0 ? null : 0.06);
        if (d < 0) return false;
        addRing(d, [[c - w / 2, c + w / 2]], { rIn: 0.4, len: 0.5, N: P.N, c: P.Z.rainbow ? colOf(P) : col });
        if (i % 2 === 1 && i < n - 1) addOrb(d + 0.3 * P.v * 0.2, c + step * 0.5);
        c += step;
      }
      return true;
    },
    zigzag: function (P, lim) {
      var n = 4 + Math.floor(Math.random() * 3), dir = rsign(), w = Math.max(0.66, P.gapW * 0.85);
      for (var i = 0; i < n; i++) {
        var gp = snapGap(gen.a + dir * rnd(0.9, 1.7), w, P.N);
        dir = -dir;
        var nc = (gp[0] + gp[1]) / 2, d = adv(P, lim, nc, (gp[1] - gp[0]) / 2, 0.6, 0, false);
        if (d < 0) return false;
        addRing(d, [gp], { rIn: 0.2, N: P.N, c: colOf(P, i % 2) });
        gapOrb(d, nc, 0.45);
      }
      return true;
    },
    bars: function (P, lim) {
      var rows = 1 + Math.floor(Math.random() * 3);
      for (var r = 0; r < rows; r++) {
        var B = P.k < 4 ? 2 : [2, 3, 3, 4][Math.floor(Math.random() * 4)];
        if (P.k >= 7 && B === 2) B = 3;
        var bw = 0.36, step = TAU / B;
        var target = gen.a + rnd(-P.shift * 0.5, P.shift * 0.5);
        var spin = rsign() * rnd(0.035, 0.06) * (P.k >= 5 ? 1.25 : 1);
        var d = adv(P, lim, target, (step - bw) / 2, 0.6, 0, true);
        if (d < 0) return false;
        var col = colOf(P, true);
        for (var i = 0; i < B; i++) {
          var bc = target + step / 2 + i * step;
          addBlock(d, bc - bw / 2, bc + bw / 2, { rIn: 0, spin: spin, len: 0.6, N: P.N, c: col });
        }
      }
      return true;
    },
    spinWall: function (P, lim) {
      var rows = 1 + Math.floor(Math.random() * 3);
      for (var r = 0; r < rows; r++) {
        var w = P.gapW * 1.1;
        var gp = snapGap(gen.a + rsign() * rnd(0.5, P.shift), w, P.N);
        var spin = rsign() * rnd(0.03, 0.055) * (1 + 0.05 * P.k);
        var nc = (gp[0] + gp[1]) / 2, d = adv(P, lim, nc, (gp[1] - gp[0]) / 2, 0.6, 0, true);
        if (d < 0) return false;
        addRing(d, [gp], { rIn: 0.2, N: P.N, c: colOf(P, r % 2), spin: spin });
      }
      return true;
    },
    checker: function (P, lim) {
      var sideA = TAU / P.N, m = Math.max(1, Math.round(0.62 / sideA)), t = sideA * m;
      var T = Math.floor(TAU / (2 * t));
      if (T < 2) return PAT.wall(P, lim);
      var v0 = PI / 2 + PI / P.N, ph = Math.random() < 0.5 ? 0 : 1;
      var rows = 2 + Math.floor(Math.random() * 3);
      for (var r = 0; r < rows; r++) {
        var want = r === 0 ? gen.a + rnd(-0.4, 0.4) : gen.a + rsign() * t;
        var best = null, bestD = 99;
        for (var i = 0; i < T; i++) {
          var gs = v0 + (2 * i + ph + 1) * t, ge = i < T - 1 ? gs + t : v0 + ph * t + TAU;
          var gc = (gs + ge) / 2, dd = Math.abs(angDiff(gc, want));
          if (dd < bestD) { bestD = dd; best = [gc, (ge - gs) / 2]; }
        }
        var d = adv(P, lim, best[0], best[1], 0.6, 0.5, false);
        if (d < 0) return false;
        var col = colOf(P, r % 2);
        for (i = 0; i < T; i++) {
          var bs = v0 + (2 * i + ph) * t;
          addBlock(d, bs, bs + t, { rIn: 0.42, len: 0.6, N: P.N, c: col });
        }
        gapOrb(d, best[0], 0.45);
        ph ^= 1;
      }
      return true;
    }
  };

  function pickPattern(k) {
    var w = WEIGHTS[Math.min(k, 8)], tot = 0, n;
    for (n in w) if (n !== gen.last) tot += w[n];
    var r = Math.random() * tot;
    for (n in w) { if (n === gen.last) continue; r -= w[n]; if (r <= 0) return n; }
    return 'wall';
  }
  function genStep() {
    var k = zoneAt(gen.d), P = params(k), lim = ZT[k + 1].start - 8;
    if (gen.d > lim - P.v * 0.6) { // clear air before each zone gate
      var nz = ZT[k + 1];
      gen.d = nz.start + nz.v * 0.8; gen.half = PI; gen.plen = 0; gen.last = '';
      return;
    }
    // warm-up: the first rows of a run are always gentle
    var name = (gen.row < 3 && k === 1) ? (gen.row === 0 ? 'half' : 'wall') : pickPattern(k);
    if (!PAT[name](P, lim)) { gen.d = lim; return; }
    gen.last = name;
    gen.d += P.v * rnd(0.2, 0.45);
  }

  /* --------------------------------------------------------- particles */
  var PS = [], MAXP = 450;
  function part(x, y, vx, vy, life, size, col, type, grav, spin) {
    if (PS.length >= MAXP) return null;
    var p = { x: x, y: y, vx: vx, vy: vy, life: life, max: life, size: size, col: col, type: type || 0, g: grav || 0,
      a: Math.random() * TAU, va: spin || 0 };
    PS.push(p);
    return p;
  }
  function burst(x, y, n, col, speed, life, size, type, grav) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.65);
      part(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.6), col, type, grav, rnd(-8, 8));
    }
  }
  function updateParts(dt) {
    for (var i = PS.length - 1; i >= 0; i--) {
      var p = PS[i];
      p.life -= dt;
      if (p.life <= 0) { PS[i] = PS[PS.length - 1]; PS.pop(); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
      if (p.type !== 4) { p.vx *= 1 - dt * 1.2; p.vy *= 1 - dt * 1.2; }
    }
  }
  function drawParts(g) {
    for (var i = 0; i < PS.length; i++) {
      var p = PS[i], f = p.life / p.max, s = p.size;
      g.globalAlpha = Math.min(1, f * 1.5);
      if (p.type === 3) { // shard (normal blend)
        g.globalCompositeOperation = 'source-over';
        g.save(); g.translate(p.x, p.y); g.rotate(p.a);
        g.fillStyle = p.col; g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.8, s * 0.7); g.lineTo(-s * 0.7, s * 0.5); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.stroke();
        g.restore();
        continue;
      }
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = p.col; g.strokeStyle = p.col;
      if (p.type === 1) { // spark streak
        g.lineWidth = s * 0.5; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); g.stroke();
      } else if (p.type === 2) { // twinkle star
        var k = s * (0.5 + f);
        g.beginPath(); g.moveTo(p.x, p.y - k); g.lineTo(p.x + k * 0.25, p.y); g.lineTo(p.x, p.y + k); g.lineTo(p.x - k * 0.25, p.y); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(p.x - k, p.y); g.lineTo(p.x, p.y + k * 0.25); g.lineTo(p.x + k, p.y); g.lineTo(p.x, p.y - k * 0.25); g.closePath(); g.fill();
      } else if (p.type === 4) { // expanding ring
        g.lineWidth = 6 * f + 1; g.beginPath(); g.arc(p.x, p.y, s * (1 - f) + 4, 0, TAU); g.stroke();
      } else {
        g.beginPath(); g.arc(p.x, p.y, s * (0.4 + 0.6 * f), 0, TAU); g.fill();
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // Speed streaks flying past near the walls (3D).
  var STREAKS = [];
  for (var si = 0; si < 34; si++) STREAKS.push({ a: Math.random() * TAU, r: rnd(0.55, 0.95), d: rnd(0, FAR) });

  /* ---------------------------------------------------- pops & banners */
  var pops = [], banner = null;
  function pop(text, x, y, col, size, life) {
    if (pops.length > 12) pops.shift();
    pops.push({ text: text, x: x, y: y, col: col || '#fff', size: size || 40, t: 0, life: life || 0.9 });
  }
  function showBanner(title, sub, col, life) { banner = { title: title, sub: sub, col: col, t: 0, life: life || 1.8 }; }

  /* -------------------------------------------------------- projection */
  var px = 0, py = 0;
  function proj(a, r, z) {
    var s = cam.f * r / z, zz = z / FAR; zz *= zz;
    a += cam.rot;
    px = CX + Math.cos(a) * s + cam.bx * zz;
    py = CY + Math.sin(a) * s + cam.by * zz;
  }
  function polyR(a, N) {
    var seg = TAU / N, t = mod(a - (PI / 2 + PI / N), seg) - seg / 2;
    return Math.cos(PI / N) / Math.cos(t);
  }
  var ARC = [];
  function arcAngles(A0, B0, N) {
    ARC.length = 0; ARC.push(A0);
    var seg = TAU / N, v0 = PI / 2 + PI / N;
    var v = v0 + (Math.floor((A0 - v0) / seg) + 1) * seg;
    while (v < B0 - 1e-6) { ARC.push(v); v += seg; }
    ARC.push(B0);
    return ARC;
  }
  function fog(z) { var f = clamp(1.12 - z / FAR, 0, 1); return f * Math.sqrt(f); }

  /* ------------------------------------------------------------ tunnel */
  var VAX = [], VAY = [], VBX = [], VBY = [], FC = [0, 0, 0];
  function faceColor(style, j, k, N, col, time, beat) { // returns strength; colour in FC
    FC[0] = col[0]; FC[1] = col[1]; FC[2] = col[2];
    var odd = (j + k) & 1;
    switch (style) {
      case 'stripes': return (k & 3) < 2 ? 0.22 : 0.05;
      case 'stars': return 0.05 + odd * 0.03;
      case 'checker': return odd ? 0.04 : 0.34;
      case 'rainbow': hsv(k * 26 + time * 60, 0.85, 1, FC); return 0.2 + odd * 0.06;
      case 'pulse': return (odd ? 0.08 : 0.13) + beat * ((k & 3) === 0 ? 0.25 : 0.08);
      case 'lava':
        var s = 0.5 + 0.5 * Math.sin(j * 1.7 + k * 0.45 + time * 2.2);
        FC[0] = 255; FC[1] = 60 + 150 * s; FC[2] = 20; return 0.1 + 0.22 * s;
      case 'zebra':
        if (((j + k) & 3) < 2) { FC[0] = lerp(col[0], 255, 0.7); FC[1] = lerp(col[1], 255, 0.7); FC[2] = lerp(col[2], 255, 0.7); return 0.38; }
        return 0.02;
      case 'candy':
        if (((j * 2 + k) & 3) < 2) { FC[0] = 255; FC[1] = 110; FC[2] = 200; return 0.32; }
        FC[0] = 255; FC[1] = 250; FC[2] = 255; return 0.16;
      case 'galaxy':
        hsv(265 + 55 * Math.sin(j * 0.9 + k * 0.33 + time * 0.6), 0.75, 1, FC); return 0.09 + odd * 0.03;
      default: return odd ? 0.13 : 0.22;
    }
  }
  function drawTunnel(g, style, time, beat, fixedZone, boost) {
    boost = boost || 1;
    var D = cam.D;
    var kStart = Math.floor((D + NEAR) / RING), kEnd = Math.floor((D + FAR) / RING);
    var starsStyle = style === 'stars' || style === 'galaxy';
    for (var k = kEnd; k >= kStart; k--) {
      var dA = k * RING, zA = dA - D, zB = zA + RING;
      var ringVisible = zA >= NEAR;
      if (zA < NEAR) zA = NEAR;
      if (zB > FAR) zB = FAR;
      if (zB <= zA) continue;
      var Z = ZT[fixedZone || zoneAt(dA)], N = Z.N;
      var col = zoneCol(Z, k, time), bg = Z.bg;
      var seg = TAU / N, v0 = PI / 2 + PI / N, j;
      for (j = 0; j < N; j++) {
        var a = v0 + j * seg;
        proj(a, 1, zA); VAX[j] = px; VAY[j] = py;
        proj(a, 1, zB); VBX[j] = px; VBY[j] = py;
      }
      var fo = fog((zA + zB) * 0.5);
      for (j = 0; j < N; j++) {
        var j2 = (j + 1) % N;
        var s = Math.min(1, faceColor(style, j, k, N, col, time, beat) * fo * boost);
        g.fillStyle = rgb(bg[0] + (FC[0] - bg[0]) * s, bg[1] + (FC[1] - bg[1]) * s, bg[2] + (FC[2] - bg[2]) * s);
        g.beginPath();
        g.moveTo(VAX[j], VAY[j]); g.lineTo(VAX[j2], VAY[j2]); g.lineTo(VBX[j2], VBY[j2]); g.lineTo(VBX[j], VBY[j]);
        g.closePath(); g.fill();
        if (starsStyle) {
          var h = ((j * 73856093) ^ (k * 19349663)) >>> 0;
          if (h % 3 === 0) {
            var u = ((h >> 4) % 100) / 100, w = ((h >> 11) % 100) / 100;
            var sx = lerp(lerp(VAX[j], VAX[j2], u), lerp(VBX[j], VBX[j2], u), w);
            var sy = lerp(lerp(VAY[j], VAY[j2], u), lerp(VBY[j], VBY[j2], u), w);
            var ss = clamp(10 / zA, 1, 5) * (style === 'galaxy' ? 0.6 + 0.4 * Math.sin(time * 5 + h) : 1);
            g.fillStyle = rgba(WHITE, 0.8 * fo);
            g.fillRect(sx - ss / 2, sy - ss / 2, ss, ss);
          }
        }
      }
      // edge lines
      var bright = (k & 7) === 0;
      var la = fo * (style === 'stripes' || style === 'zebra' || style === 'candy' ? 0.3 : 0.55);
      g.strokeStyle = rgba(col, la);
      g.lineWidth = clamp(3 / zA, 0.6, 2.2);
      g.beginPath();
      for (j = 0; j < N; j++) { g.moveTo(VAX[j], VAY[j]); g.lineTo(VBX[j], VBY[j]); }
      g.stroke();
      if (ringVisible && (style !== 'stripes' || (k & 3) === 0)) {
        var pulse = style === 'pulse' ? beat * 1.6 : beat * 0.5;
        g.strokeStyle = rgba(bright ? mix(col, WHITE, 0.5) : col, Math.min(1, fo * ((bright ? 0.95 : 0.35) + pulse * 0.4)));
        g.lineWidth = clamp((bright ? 7 : 3) / zA, 0.6, bright ? 6 : 3) * (1 + pulse * 0.6);
        g.beginPath();
        g.moveTo(VAX[0], VAY[0]);
        for (j = 1; j < N; j++) g.lineTo(VAX[j], VAY[j]);
        g.closePath(); g.stroke();
      }
    }
  }

  /* --------------------------------------------------------- obstacles */
  function drawBlock(g, o, shipD) {
    var zN = o.d - cam.D, zF = zN + o.len;
    if (zF <= NEAR || zN >= FAR) return;
    var off = o.spin * (o.d - shipD), A0 = o.a0 + off, B0 = o.a1 + off;
    var z0 = Math.max(zN, NEAR);
    var fa = fog(z0) * Math.min(1, (FAR - z0) / 6);
    if (o.broken) fa *= Math.max(0, 1 - o.broken * 4);
    if (fa <= 0.01) return;
    var c = o.c, N = o.N, arcs = arcAngles(A0, B0, N), n = arcs.length, i, a, pr;
    var lw = clamp(5 / z0, 1, 6);
    // inner face (long slabs only)
    if (o.len > 1 && o.rIn > 0.05) {
      var zf = Math.min(zF, FAR);
      g.beginPath();
      for (i = 0; i < n; i++) { a = arcs[i]; proj(a, polyR(a, N) * o.rIn, zf); if (i) g.lineTo(px, py); else g.moveTo(px, py); }
      for (i = n - 1; i >= 0; i--) { a = arcs[i]; proj(a, polyR(a, N) * o.rIn, z0); g.lineTo(px, py); }
      g.closePath();
      g.fillStyle = rgba([c[0] * 0.45, c[1] * 0.45, c[2] * 0.45], 0.8 * fa);
      g.fill();
      g.strokeStyle = rgba(c, 0.8 * fa); g.lineWidth = lw * 0.6; g.stroke();
      // side edges of the slab along the wall
      g.beginPath();
      proj(A0, polyR(A0, N), z0); g.moveTo(px, py); proj(A0, polyR(A0, N), zf); g.lineTo(px, py);
      proj(B0, polyR(B0, N), z0); g.moveTo(px, py); proj(B0, polyR(B0, N), zf); g.lineTo(px, py);
      g.stroke();
    }
    if (zN < NEAR) return;
    // front face
    g.beginPath();
    for (i = 0; i < n; i++) { a = arcs[i]; proj(a, polyR(a, N), zN); if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    if (o.rIn > 0.02) {
      for (i = n - 1; i >= 0; i--) { a = arcs[i]; proj(a, polyR(a, N) * o.rIn, zN); g.lineTo(px, py); }
    } else { proj(0, 0, zN); g.lineTo(px, py); }
    g.closePath();
    g.fillStyle = rgba(c, 0.42 * fa);
    g.fill();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = rgba(c, 0.35 * fa); g.lineWidth = lw * 2.6; g.stroke();
    g.strokeStyle = rgba(mix(c, WHITE, 0.55), 0.95 * fa); g.lineWidth = lw; g.stroke();
    // inner trim line for depth
    g.beginPath();
    for (i = 0; i < n; i++) { a = arcs[i]; pr = polyR(a, N) * (0.86 + o.rIn * 0.05); proj(a, pr, zN); if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    g.strokeStyle = rgba(c, 0.5 * fa); g.lineWidth = lw * 0.6; g.stroke();
    g.globalCompositeOperation = 'source-over';
  }

  function drawPickup(g, p) {
    var z = p.d - cam.D;
    if (z < ZS - 0.7 || z > FAR) return;
    var fa = fog(z) * Math.min(1, (FAR - z) / 6) * Math.min(1, (z - ZS + 0.7) / 0.6);
    proj(p.a, ORB_R, z);
    var s = cam.f / z * (p.kind === 'shield' ? 0.13 : 0.085) * (1 + 0.12 * Math.sin(G.t * 9 + p.d));
    g.globalCompositeOperation = 'lighter';
    if (p.kind === 'shield') {
      g.fillStyle = 'rgba(80, 200, 255,' + (0.25 * fa) + ')';
      g.beginPath(); g.arc(px, py, s * 1.9, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(160, 240, 255,' + fa + ')'; g.lineWidth = Math.max(1.5, s * 0.18);
      g.beginPath(); g.arc(px, py, s, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,255,255,' + fa + ')';
      g.beginPath(); // little shield emblem
      g.moveTo(px, py - s * 0.6); g.lineTo(px + s * 0.5, py - s * 0.35); g.lineTo(px + s * 0.4, py + s * 0.25);
      g.lineTo(px, py + s * 0.6); g.lineTo(px - s * 0.4, py + s * 0.25); g.lineTo(px - s * 0.5, py - s * 0.35); g.closePath(); g.fill();
    } else {
      g.fillStyle = 'rgba(255, 190, 40,' + (0.28 * fa) + ')';
      g.beginPath(); g.arc(px, py, s * 2, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255, 210, 60,' + fa + ')';
      g.beginPath(); g.arc(px, py, s, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255, 255, 230,' + fa + ')';
      g.beginPath(); g.arc(px - s * 0.25, py - s * 0.25, s * 0.42, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }

  function drawGate(g, k) {
    var Z = ZT[k], z = Z.start - cam.D;
    if (z < NEAR + 0.2 || z > FAR) return;
    var fa = fog(z) * Math.min(1, (FAR - z) / 5), col = zoneCol(Z, 0, G.t), N = Z.N, seg = TAU / N, v0 = PI / 2 + PI / N;
    g.globalCompositeOperation = 'lighter';
    for (var pass = 0; pass < 2; pass++) {
      g.beginPath();
      for (var j = 0; j <= N; j++) { proj(v0 + j * seg, pass ? 0.93 : 0.99, z); if (j) g.lineTo(px, py); else g.moveTo(px, py); }
      g.strokeStyle = rgba(pass ? WHITE : col, (pass ? 0.9 : 0.5) * fa);
      g.lineWidth = clamp((pass ? 10 : 30) / z, 1, pass ? 10 : 34);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    // zone number floating in the middle
    proj(0, 0, z);
    var fs = clamp(360 / z, 8, 220);
    if (fs > 10) {
      g.font = '700 ' + fs.toFixed(0) + 'px Fredoka, "Segoe UI", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
      g.fillStyle = rgba(col, 0.9 * fa);
      g.fillText('المنطقة ' + k, px, py);
    }
  }

  function drawBestRing(g) {
    if (save.bestD < 30 || !G.runActive) return;
    var z = save.bestD - cam.D;
    if (z < NEAR + 0.2 || z > FAR) return;
    var fa = fog(z), N = ZT[zoneAt(save.bestD)].N, seg = TAU / N, v0 = PI / 2 + PI / N;
    g.beginPath();
    for (var j = 0; j <= N; j++) { proj(v0 + j * seg, 0.97, z); if (j) g.lineTo(px, py); else g.moveTo(px, py); }
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255, 190, 40,' + (0.45 * fa) + ')';
    g.lineWidth = clamp(40 / z, 2, 40);
    g.stroke();
    g.strokeStyle = 'rgba(255, 235, 120,' + fa + ')';
    g.lineWidth = clamp(14 / z, 1.5, 14);
    g.setLineDash([clamp(50 / z, 3, 50), clamp(30 / z, 2, 30)]);
    g.stroke(); g.setLineDash([]);
    g.globalCompositeOperation = 'source-over';
    proj(PI * 1.5 - cam.rot, 0.62, z);
    var fs = clamp(150 / z, 10, 70);
    g.font = '700 ' + fs.toFixed(0) + 'px Fredoka, "Segoe UI", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.fillStyle = 'rgba(255, 220, 80,' + fa + ')';
    g.fillText('الأفضل', px, py);
  }

  /* --------------------------------------------------------------- ship */
  function drawShip(g) {
    var sk = shipSkin(), rm = rotMaxFor(G.v);
    var bank = -G.rotVel / rm * 0.4;
    var sway = -G.rotVel / rm * 14;
    var sq = G.squash, bmp = G.bump;
    var sx = 1 + 0.16 * sq + 0.12 * bmp, sy = 1 - 0.12 * sq + 0.12 * bmp;
    var bob = G.state === 'title' ? Math.sin(G.t * 3) * 5 : Math.sin(G.t * 11) * 1.2;
    var x = SHIP_X + sway, y = SHIP_Y + bob;
    // glow cast on the floor
    var Z = ZT[G.zone], col = zoneCol(Z, 0, G.t);
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rgba(col, 0.18);
    g.beginPath(); g.ellipse(x, SHIP_Y + 26, 58, 12, 0, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.save();
    g.translate(x, y); g.rotate(bank); g.scale(SHIP_SCALE * sx, SHIP_SCALE * sy);
    var fl = 0.3 + clamp((G.v / WS - 12) / 30, 0, 1) * 0.35;
    TB.drawShip(g, sk, G.t, fl);
    g.restore();
    if (G.shield || G.invuln > 0) {
      var blink = G.invuln > 0 && !G.shield ? (Math.floor(G.t * 16) % 2 ? 0.2 : 0.7) : 1;
      var r = SHIP_SCALE * 1.45 * (1 + 0.04 * Math.sin(G.t * 7));
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(80, 200, 255,' + (0.14 * blink) + ')';
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(170, 240, 255,' + (0.85 * blink) + ')'; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,' + (0.6 * blink) + ')'; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, r * 0.8, -2.4 + Math.sin(G.t * 2) * 0.2, -1.6); g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
  }

  /* ----------------------------------------------------------- the HUD */
  var FONT = 'Fredoka, "Segoe UI", sans-serif';
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  var ARABIC = /[\u0600-\u06FF]/;
  function textOutlined(g, text, x, y, size, fill, stroke) {
    g.direction = ARABIC.test(text) ? 'rtl' : 'ltr';
    g.font = '700 ' + size + 'px ' + FONT;
    g.lineJoin = 'round';
    g.lineWidth = Math.max(4, size * 0.16);
    g.strokeStyle = stroke || 'rgba(0,0,0,0.55)';
    g.strokeText(text, x, y);
    g.fillStyle = fill;
    g.fillText(text, x, y);
  }
  function drawHUD(g) {
    var Z = ZT[G.zone], col = zoneCol(Z, 0, G.t);
    g.textBaseline = 'alphabetic';
    // score
    g.textAlign = 'center';
    var sc = Kit.fmt(G.score);
    var pulse = 1 + G.bump * 0.06;
    g.save(); g.translate(CX, 66); g.scale(pulse, pulse);
    textOutlined(g, sc, 0, 0, 56, '#ffffff');
    g.restore();
    g.font = '700 24px ' + FONT;
    var w = g.measureText(sc).width * 56 / 24;
    g.textAlign = 'right';
    textOutlined(g, 'م', CX - w / 2 - 12, 64, 28, 'rgba(255,255,255,0.8)');
    g.textAlign = 'center';
    if (save.best > 0) {
      var beat = G.passedBest;
      textOutlined(g, beat ? 'رقم قياسي جديد!' : 'الأفضل ' + Kit.fmt(save.best), CX, 98, 21, beat ? '#ffd23f' : 'rgba(255,255,255,0.75)');
    }
    // zone badge
    var bx = 18, by = 16;
    g.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(g, bx, by, 250, 84, 16); g.fill();
    g.strokeStyle = rgba(col, 0.9); g.lineWidth = 3; g.stroke();
    g.textAlign = 'right';
    textOutlined(g, 'المنطقة ' + G.zone, bx + 236, by + 34, 28, rgba(col, 1));
    textOutlined(g, Z.name, bx + 236, by + 60, 16, 'rgba(255,255,255,0.9)');
    var prog = clamp((G.D + ZS - Z.start) / Z.len, 0, 1);
    g.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(g, bx + 14, by + 68, 222, 8, 4); g.fill();
    g.fillStyle = rgba(col, 1); roundRect(g, bx + 236 - Math.max(8, 222 * prog), by + 68, Math.max(8, 222 * prog), 8, 4); g.fill();
    // orbs
    var oy = by + 114;
    g.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(g, bx, oy - 20, 124, 40, 20); g.fill();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(bx + 22, oy, 11, 0, TAU); g.fill();
    g.fillStyle = '#fffbe0'; g.beginPath(); g.arc(bx + 19, oy - 3, 4, 0, TAU); g.fill();
    g.textAlign = 'left';
    textOutlined(g, '' + G.orbsRun, bx + 42, oy + 10, 26, '#ffffff');
    if (G.shield) {
      g.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(g, bx + 132, oy - 20, 118, 40, 20); g.fill();
      g.strokeStyle = '#8ff4ff'; g.lineWidth = 3; g.beginPath(); g.arc(bx + 154, oy, 11, 0, TAU); g.stroke();
      textOutlined(g, 'درع', bx + 176, oy + 8, 22, '#8ff4ff');
    }
  }

  function drawPops(g) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (var i = 0; i < pops.length; i++) {
      var p = pops[i], f = p.t / p.life;
      var s = f < 0.15 ? lerp(0.4, 1.25, f / 0.15) : f < 0.3 ? lerp(1.25, 1, (f - 0.15) / 0.15) : 1;
      g.save();
      g.globalAlpha = f > 0.7 ? 1 - (f - 0.7) / 0.3 : 1;
      g.translate(p.x, p.y - f * 50); g.scale(s, s);
      textOutlined(g, p.text, 0, 0, p.size, p.col, 'rgba(0,0,0,0.6)');
      g.restore();
    }
    if (banner) {
      var b = banner, t = b.t / b.life;
      var sc = t < 0.12 ? lerp(2.2, 1, t / 0.12) : 1;
      var al = t > 0.8 ? 1 - (t - 0.8) / 0.2 : Math.min(1, t / 0.08);
      g.save(); g.globalAlpha = al;
      g.translate(CX, 250); g.scale(sc, sc);
      textOutlined(g, b.title, 0, 0, 92, b.col, 'rgba(0,0,0,0.6)');
      if (b.sub) textOutlined(g, b.sub, 0, 70, 34, '#ffffff', 'rgba(0,0,0,0.6)');
      g.restore();
    }
    g.globalAlpha = 1;
    g.textBaseline = 'alphabetic';
  }

  /* ------------------------------------------------------------ render */
  var vignette = null;
  function render() {
    var g = ctx;
    var shipD = G.D + ZS;
    var zk = G.zone, Z = ZT[zk];
    // camera
    cam.D = G.D; cam.rot = G.rot;
    var bd = G.D / WS;
    cam.bx = (Math.sin(bd * 0.011) * 0.8 + Math.sin(bd * 0.0063 + 1.3) * 0.5) * 260;
    cam.by = (Math.sin(bd * 0.0085 + 2.1) * 0.7 + Math.sin(bd * 0.0051) * 0.4) * 150;
    cam.f = F * (1 - 0.1 * G.fovKick);
    var bg = Z.bg;
    g.fillStyle = rgb(bg[0], bg[1], bg[2]);
    g.fillRect(0, 0, W, H);
    g.save();
    if (G.shake > 0.1) g.translate((Math.random() - 0.5) * G.shake * 2, (Math.random() - 0.5) * G.shake * 2);
    drawTunnel(g, save.tunnel, G.t, G.beat, 0);
    // light at the end of the tunnel
    var gx = CX + cam.bx * 0.85, gy = CY + cam.by * 0.85;
    var col = zoneCol(Z, 0, G.t);
    var gr = g.createRadialGradient(gx, gy, 0, gx, gy, 140);
    gr.addColorStop(0, rgba(mix(col, WHITE, 0.5), 0.55 + G.beat * 0.2)); gr.addColorStop(1, rgba(col, 0));
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = gr; g.fillRect(gx - 140, gy - 140, 280, 280);
    // speed streaks
    g.lineCap = 'round';
    var sl = clamp(G.v * 0.1, 0.5, 2.5);
    for (var i = 0; i < STREAKS.length; i++) {
      var s = STREAKS[i], z = s.d - G.D;
      if (z < NEAR + sl || z > FAR) continue;
      proj(s.a, s.r, z); var x1 = px, y1 = py;
      proj(s.a, s.r, z + sl);
      g.strokeStyle = rgba(mix(col, WHITE, 0.6), 0.5 * fog(z));
      g.lineWidth = clamp(4 / z, 0.5, 4);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(px, py); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    // depth-sorted things
    var list = DRAW; list.length = 0;
    for (i = 0; i < obs.length; i++) list.push(obs[i]);
    for (i = 0; i < pick.length; i++) if (!pick[i].taken) list.push(pick[i]);
    list.sort(byFar);
    var gateK = zoneAt(G.D + FAR) ;
    var gates = [];
    for (var k = zk + 1; k <= gateK; k++) gates.push(k);
    var gi = gates.length - 1;
    drawBestRingOrdered(g, list, gates, gi, shipD);
    // ship
    if (G.state !== 'dying' && G.state !== 'over') drawShip(g);
    drawParts(g);
    g.restore();
    // flash
    if (G.flash > 0.01) {
      g.fillStyle = rgba(G.flashCol, G.flash * 0.7);
      g.fillRect(0, 0, W, H);
    }
    if (!vignette) {
      vignette = g.createRadialGradient(CX, CY, 260, CX, CY, 780);
      vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    }
    g.fillStyle = vignette; g.fillRect(0, 0, W, H);
    if (G.state === 'play' || G.state === 'dying' || G.state === 'paused') drawHUD(g);
    if (G.state !== 'paused') drawPops(g);
  }
  var DRAW = [];
  function farOf(o) { return o.len != null ? o.d + o.len : o.d; }
  function byFar(a, b) { return farOf(b) - farOf(a); }
  function drawBestRingOrdered(g, list, gates, gi, shipD) {
    var bestDrawn = !(save.bestD >= 30 && G.runActive);
    for (var i = 0; i < list.length; i++) {
      var o = list[i], f = farOf(o);
      while (gi >= 0 && ZT[gates[gi]].start > f) { drawGate(g, gates[gi]); gi--; }
      if (!bestDrawn && save.bestD > f) { drawBestRing(g); bestDrawn = true; }
      if (o.len != null) drawBlock(g, o, shipD); else drawPickup(g, o);
    }
    while (gi >= 0) { drawGate(g, gates[gi]); gi--; }
    if (!bestDrawn) drawBestRing(g);
  }

  /* ------------------------------------------------------------ gameplay */
  var mouse = { down: false, x: CX };
  function theta() { return PI / 2 - G.rot; }

  function botTarget() {
    var sD = G.D + ZS;
    for (var i = 0; i < path.length; i++) if (path[i].d + path[i].len > sD - 0.05) return path[i].a;
    return null;
  }
  function botInput() { var t = botTarget(); return t == null ? 0 : steerTo(t); }
  function steerTo(a) {
    var th = theta();
    var d = angDiff(a, th);
    if (Math.abs(d) < 0.05) return 0;
    if (Math.abs(d) < Math.abs(G.rotVel) * 0.06) return 0;
    return d > 0 ? -1 : 1;
  }

  function resetWorld(speed) {
    obs.length = 0; pick.length = 0; path.length = 0;
    G.D = 0; G.rot = 0; G.rotVel = 0; G.v = speed; G.zone = 1; zCache = 1;
    genReset(13, PI / 2);
  }

  function startGame() {
    hideAll();
    Kit.keys.reset();
    resetWorld(ZT[1].v);
    G.state = 'play'; G.runActive = true; G.committed = false;
    G.runT = 0; G.score = 0; G.bonus = 0; G.orbsRun = 0; G.closeRun = 0; G.streak = 0; G.bestStreak = 0; G.lastCloseT = -9;
    G.lastCloseRow = -1; G.shieldsRun = 0; G.shield = false; G.invuln = 0; G.passedBest = false; G.runMissions = [];
    G.orbStreak = 0; G.zoneOrbs = 0; G.flash = 0.6; G.flashCol = ZT[1].col; G.fovKick = 1; G.dispScore = 0; G.missionTimer = 0;
    PS.length = 0; pops.length = 0;
    save.runs++; persist();
    showBanner('انطلق!', ZT[1].name, rgba(ZT[1].col, 1), 1.4);
    Sfx.go();
    Mus.play('game'); musicForZone(1);
    document.getElementById('pauseBtn').hidden = false;
    checkMissions();
  }

  function musicForZone(k) {
    var i = k >= 5 ? 4 : k >= 4 ? 3 : k >= 3 ? 2 : k >= 2 ? 1 : 0;
    Mus.set(116 + (ZT[k].vn - 15) * 1.6, i, ZT[k].key);
  }

  function enterZone(k) {
    G.zone = k;
    var Z = ZT[k], col = zoneCol(Z, 0, G.t);
    if (G.state !== 'play') return;
    showBanner('المنطقة ' + k, Z.name + ' - أسرع!', rgba(col, 1), 2);
    G.flash = 0.55; G.flashCol = col.slice(); G.fovKick = 1; G.shake = Math.max(G.shake, 6);
    Sfx.zone();
    musicForZone(k);
    // reward for reaching a new zone: bonus orbs (makes shop unlocks come faster)
    var zb = Math.min(40, 5 * (k - 1));
    if (zb > 0) {
      G.orbsRun += zb; G.zoneOrbs = (G.zoneOrbs || 0) + zb;
      pop('+' + zb, CX, 400, '#ffd23f', 54, 1.6);
      pop('مكافأة المنطقة', CX, 450, '#fff6c0', 28, 1.6);
      Sfx.orb(10);
    }
    for (var i = 0; i < 40; i++) {
      var a = Math.random() * TAU, sp = rnd(300, 900);
      part(CX, CY, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.4, 0.9), rnd(3, 7), rgba(col, 1), 1);
    }
    checkMissions();
  }

  function nearMiss() {
    G.closeRun++;
    G.streak = (G.runT - G.lastCloseT < 2.6) ? G.streak + 1 : 1;
    G.lastCloseT = G.runT;
    if (G.streak > G.bestStreak) G.bestStreak = G.streak;
    var pts = Math.min(50, 10 * G.streak);
    G.bonus += pts;
    var col = rgba(mix(zoneCol(ZT[G.zone], 0, G.t), WHITE, 0.3), 1);
    pop('على الحافة!', SHIP_X + rnd(-20, 20), SHIP_Y - 92, col, 44 + Math.min(G.streak, 5) * 3, 0.9);
    if (G.streak > 1) pop('×' + G.streak, SHIP_X - 150, SHIP_Y - 40, '#ff5ad0', 40 + Math.min(G.streak, 6) * 4, 0.9);
    pop('+' + pts, SHIP_X + 110, SHIP_Y - 40, '#ffd23f', 28, 0.8);
    for (var i = 0; i < 14; i++) {
      var a = rnd(-PI, 0), sp = rnd(150, 420);
      part(SHIP_X + rnd(-30, 30), SHIP_Y - 10, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.4, 0.8), rnd(7, 13), i % 2 ? '#ffffff' : col, 2, 300);
    }
    G.bump = 1; G.flash = Math.max(G.flash, 0.12); G.flashCol = [255, 255, 255];
    Sfx.close(G.streak);
  }

  function collect(p) {
    p.taken = true;
    if (p.kind === 'shield') {
      G.shield = true; G.shieldsRun++;
      pop('درع!', SHIP_X, SHIP_Y - 100, '#8ff4ff', 46, 1);
      burst(SHIP_X, SHIP_Y, 24, '#8ff4ff', 400, 0.6, 7, 2, 0);
      part(SHIP_X, SHIP_Y, 0, 0, 0.5, 90, '#8ff4ff', 4);
      Sfx.shieldGet();
      return;
    }
    G.orbsRun++;
    G.orbStreak = G.orbStreakT > 0 ? G.orbStreak + 1 : 0;
    G.orbStreakT = 1.2;
    G.bump = Math.max(G.bump, 0.6);
    pop('+1', SHIP_X + rnd(-40, 40), SHIP_Y - 60, '#ffd23f', 28, 0.6);
    burst(SHIP_X, SHIP_Y - 20, 10, '#ffd23f', 320, 0.45, 6, 2, 200);
    part(SHIP_X, SHIP_Y - 10, 0, 0, 0.35, 50, '#ffd23f', 4);
    Sfx.orb(G.orbStreak);
  }

  function hitBlock(o) {
    if (G.invincible || G.invuln > 0) return;
    if (G.shield) {
      G.shield = false; G.invuln = 1.1; o.broken = 0.001;
      for (var i = 0; i < obs.length; i++) if (obs[i].row === o.row) obs[i].broken = 0.001;
      G.shake = 12; G.flash = 0.5; G.flashCol = [140, 230, 255];
      pop('الدرع أنقذك!', CX, SHIP_Y - 120, '#8ff4ff', 40, 1.2);
      for (i = 0; i < 22; i++) {
        var a = Math.random() * TAU, sp = rnd(200, 650);
        part(SHIP_X, SHIP_Y - 20, Math.cos(a) * sp, Math.sin(a) * sp - 100, rnd(0.6, 1.1), rnd(10, 20), rgba(o.c, 1), 3, 700, rnd(-10, 10));
      }
      Sfx.shieldBreak();
      return;
    }
    die(o);
  }

  function die(o) {
    G.state = 'dying'; G.dyingT = 0;
    G.shake = 24; G.flash = 1; G.flashCol = [255, 255, 255];
    document.getElementById('pauseBtn').hidden = true;
    var sk = shipSkin(), cols = [sk.body, sk.trim, sk.dark, sk.flame[1]];
    if (sk.rainbow) cols = ['#ff5a5a', '#ffd23f', '#3ddc84', '#19e6ff', '#b44dff'];
    for (var i = 0; i < 22; i++) {
      var a = rnd(-PI, 0.3) + (Math.random() < 0.2 ? PI : 0), sp = rnd(250, 820);
      part(SHIP_X + rnd(-20, 20), SHIP_Y + rnd(-15, 15), Math.cos(a) * sp, Math.sin(a) * sp, rnd(1.0, 1.8), rnd(9, 22), cols[i % cols.length], 3, 900, rnd(-14, 14));
    }
    var oc = rgba(o ? o.c : WHITE, 1);
    for (i = 0; i < 40; i++) {
      a = Math.random() * TAU; sp = rnd(200, 1100);
      part(SHIP_X, SHIP_Y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.4, 1.0), rnd(4, 9), i % 3 ? oc : '#ffffff', 1, 400);
    }
    part(SHIP_X, SHIP_Y, 0, 0, 0.6, 260, '#ffffff', 4);
    part(SHIP_X, SHIP_Y, 0, 0, 0.9, 420, oc, 4);
    Sfx.crash();
    Mus.stop(); Mus.wind(0);
    finalizeRun();
  }

  function finalizeRun() {
    if (!G.runActive) return;
    checkMissions();
    G.runActive = false;
    G.wasBest = G.score > save.best;
    G.prevBest = save.best;
    if (G.wasBest) { save.best = G.score; save.bestD = G.D; }
    save.bestZone = Math.max(save.bestZone, G.zone);
    save.orbs += G.orbsRun; save.orbsTotal += G.orbsRun; save.closeTotal += G.closeRun;
    save.recOrbs = Math.max(save.recOrbs, G.orbsRun - (G.zoneOrbs || 0)); // picked orbs only (zone bonus excluded)
    save.recClose = Math.max(save.recClose, G.closeRun);
    save.recStreak = Math.max(save.recStreak, G.bestStreak);
    save.recShield = Math.max(save.recShield, G.shieldsRun);
    persist();
    checkMissions();
  }

  /* ------------------------------------------------------------ missions */
  function doneCount() { var n = 0; for (var i = 0; i < TB.MISSIONS.length; i++) if (save.mdone[i]) n++; return n; }
  function activeMissions() {
    var out = [];
    for (var i = 0; i < TB.MISSIONS.length && out.length < 3; i++) if (!save.mdone[i]) out.push(i);
    return out;
  }
  function mVal(m) {
    var r = G.runActive;
    switch (m.t) {
      case 'dist': return Math.max(save.best, r ? G.score : 0);
      case 'zone': return Math.max(save.bestZone, r ? G.zone : 0);
      case 'orbsRun': return Math.max(save.recOrbs, r ? G.orbsRun - (G.zoneOrbs || 0) : 0);
      case 'closeRun': return Math.max(save.recClose, r ? G.closeRun : 0);
      case 'combo': return Math.max(save.recStreak, r ? G.bestStreak : 0);
      case 'shield': return Math.max(save.recShield, r ? G.shieldsRun : 0);
      case 'runs': return save.runs;
      case 'orbsTotal': return save.orbsTotal + (r ? G.orbsRun : 0);
      case 'closeTotal': return save.closeTotal + (r ? G.closeRun : 0);
    }
    return 0;
  }
  function checkMissions() {
    for (var guard = 0; guard < 10; guard++) {
      var act = activeMissions(), done = -1;
      for (var i = 0; i < act.length; i++) if (mVal(TB.MISSIONS[act[i]]) >= TB.MISSIONS[act[i]].n) { done = act[i]; break; }
      if (done < 0) break;
      var m = TB.MISSIONS[done];
      save.mdone[done] = 1; save.orbs += m.r; persist();
      G.runMissions.push(done);
      toast('مهمة منجزة! ' + TB.missionText(m), false, '+' + m.r);
      Sfx.mission();
    }
    refreshBadges();
  }
  var toastBox = document.getElementById('toasts');
  function toast(text, gold, reward) {
    var el = document.createElement('div');
    el.className = 'toast' + (gold ? ' gold' : '');
    el.innerHTML = '<i class="orb"></i>';
    el.appendChild(document.createTextNode(text));
    if (reward) { var rb = document.createElement('bdi'); rb.dir = 'ltr'; rb.className = 'rew'; rb.textContent = reward; el.appendChild(rb); }
    toastBox.appendChild(el);
    while (toastBox.children.length > 3) toastBox.removeChild(toastBox.firstChild);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2700);
  }

  /* -------------------------------------------------------------- update */
  function update(dt) {
    G.t += dt;
    Mus.tick();
    // beat pulse for the walls
    var sk = Mus.sinceKick();
    if (sk >= 0) G.beat = Math.max(0, 1 - sk * 5);
    else { var ph = (G.t * (G.state === 'play' ? 2.2 : 1.6)) % 1; G.beat = Math.max(0, 1 - ph * 5); }
    G.shake = Math.max(0, G.shake - dt * 45);
    G.flash = Math.max(0, G.flash - dt * 2.2);
    G.squash = Math.max(0, G.squash - dt * 5);
    G.bump = Math.max(0, G.bump - dt * 5);
    G.fovKick = Math.max(0, G.fovKick - dt * 1.6);
    G.orbStreakT -= dt;
    for (var i = pops.length - 1; i >= 0; i--) { pops[i].t += dt; if (pops[i].t >= pops[i].life) pops.splice(i, 1); }
    if (banner) { banner.t += dt; if (banner.t >= banner.life) banner = null; }

    if (G.state === 'play') updatePlay(dt);
    else if (G.state === 'title') updateAttract(dt);
    else if (G.state === 'dying') {
      G.dyingT += dt;
      updateParts(dt * (G.dyingT < 0.35 ? 0.35 : 1));
      if (G.dyingT > 1.05) showOver();
    } else if (G.state === 'over') {
      G.overT += dt;
      G.rot += dt * 0.12;
      updateParts(dt);
      if (G.dispScore < G.score) {
        G.dispScore = Math.min(G.score, G.dispScore + Math.max(1, G.score * dt * 1.6));
        document.getElementById('oScore').textContent = Kit.fmt(G.dispScore);
      }
      if (G.wasBest && Math.random() < dt * 14) confetti(1);
    }
    if (G.state !== 'play') Mus.wind(0);
    Kit.keys.endFrame();
  }

  function updateStreaks() {
    for (var i = 0; i < STREAKS.length; i++) {
      var s = STREAKS[i];
      if (s.d - G.D < NEAR) { s.d = G.D + rnd(FAR * 0.4, FAR); s.a = Math.random() * TAU; s.r = rnd(0.55, 0.95); }
    }
  }

  function updateAttract(dt) {
    G.v += (11 * WS - G.v) * dt;
    var inp = botInput();
    var rm = rotMaxFor(G.v) * 0.8;
    G.rotVel += (inp * rm - G.rotVel) * (1 - Math.exp(-dt * 10));
    G.rot += G.rotVel * dt;
    G.D += G.v * dt;
    var k = zoneAt(G.D + ZS);
    if (k !== G.zone) G.zone = k;
    if (G.D > ZT[2].start - 22) { resetWorld(11 * WS); } // loop the demo inside zone 1
    while (gen.d < G.D + FAR + 16) genStep();
    cleanup();
    updateStreaks();
    updateParts(dt);
  }

  function cleanup() {
    var i;
    for (i = obs.length - 1; i >= 0; i--) if (obs[i].d + obs[i].len < G.D - 1) { obs[i] = obs[obs.length - 1]; obs.pop(); }
    for (i = pick.length - 1; i >= 0; i--) if (pick[i].d < G.D - 1 || pick[i].taken) { pick[i] = pick[pick.length - 1]; pick.pop(); }
    while (path.length && path[0].d + path[0].len < G.D + ZS - 6) path.shift();
  }

  function updatePlay(dt) {
    G.runT += dt;
    var inp = 0;
    if (Kit.keys.anyDown(['ArrowLeft', 'KeyA'])) inp -= 1;
    if (Kit.keys.anyDown(['ArrowRight', 'KeyD'])) inp += 1;
    if (mouse.down) inp += mouse.x < CX ? -1 : 1;
    inp = clamp(inp, -1, 1);
    if (G.autopilot === 'sloppy') { // test bot that notices each new gap late (human-like)
      G.lagBuf = G.lagBuf || [];
      G.lagBuf.push(botTarget());
      var lt = G.lagBuf.length > G.lagN ? G.lagBuf.shift() : null;
      inp = lt == null ? 0 : steerTo(lt);
    } else if (G.autopilot) inp = botInput();
    var rm = rotMaxFor(G.v);
    if (inp !== 0 && inp !== G.lastInp) G.squash = 1;
    G.lastInp = inp;
    G.rotVel += (inp * rm - G.rotVel) * (1 - Math.exp(-dt * 16));
    G.rot += G.rotVel * dt;
    Mus.wind(0.07 * Math.abs(G.rotVel) / rm);
    // drift sparks off the wing tip when spinning hard
    if (Math.abs(G.rotVel) > rm * 0.7 && Math.random() < 0.6) {
      var sgn = G.rotVel > 0 ? 1 : -1;
      part(SHIP_X + sgn * 30, SHIP_Y + 14, sgn * rnd(60, 200), rnd(40, 160), 0.3, rnd(3, 5), rgba(zoneCol(ZT[G.zone], 0, G.t), 1), 1);
    }
    // engine sparkles
    var sk = shipSkin();
    if (Math.random() < 0.7) part(SHIP_X + rnd(-10, 10), SHIP_Y + 26, rnd(-30, 30), rnd(120, 260), 0.25, rnd(3, 6), sk.rainbow ? 'hsl(' + ((G.t * 300) % 360) + ',100%,60%)' : sk.flame[1], 0);

    // speed and zones
    var sD0 = G.D + ZS;
    var k = zoneAt(sD0);
    if (k !== G.zone) enterZone(k);
    var Z = ZT[k];
    var tv = Z.v + clamp((sD0 - Z.start) / Z.len, 0, 1) * 1.5 * WS;
    G.v += (tv - G.v) * (1 - Math.exp(-dt * 2.5));
    var prevS = sD0;
    G.D += G.v * dt;
    var sD = G.D + ZS, th = theta();
    G.score = Math.floor(G.D / WS) + G.bonus;
    if (!G.passedBest && save.best >= 100 && G.score > save.best) {
      G.passedBest = true;
      showBanner('رقم قياسي جديد!', 'استمر!', '#ffd23f', 1.6);
      Sfx.newBest(); confetti(30);
    }
    if (G.invuln > 0) G.invuln -= dt;

    while (gen.d < G.D + FAR + 16) genStep();

    // obstacles
    var lastRowPassed = -1;
    for (var i = 0; i < obs.length; i++) {
      var o = obs[i];
      if (o.broken) { o.broken += dt; continue; }
      if (o.done) continue;
      if (o.d + o.len < prevS - 0.05) {
        o.done = true;
        if (o.minGap < NEARMISS && o.row !== G.lastCloseRow && G.state === 'play') { G.lastCloseRow = o.row; nearMiss(); }
        if (o.row !== lastRowPassed) { lastRowPassed = o.row; if (G.runT - G.lastWhoosh > 0.25) { G.lastWhoosh = G.runT; Sfx.whoosh(); } }
        continue;
      }
      if (o.d > sD + 0.05) continue;
      var off = o.spin * (o.d - sD), A0 = o.a0 + off, span = o.a1 - o.a0;
      var x = mod(th + HIT - A0, TAU);
      if (x < span + 2 * HIT) {
        if (G.invincible || G.invuln > 0) continue;
        hitBlock(o);
        if (G.state !== 'play') return;
        continue;
      }
      var gd = Math.min(x - span - 2 * HIT, TAU - x);
      if (gd < o.minGap) o.minGap = gd;
    }
    // pickups
    for (i = 0; i < pick.length; i++) {
      var p = pick[i];
      if (p.taken || p.d > sD + 0.4 || p.d < prevS - 0.4) continue;
      if (Math.abs(angDiff(p.a, th)) < 0.27) collect(p);
    }
    cleanup();
    updateStreaks();
    updateParts(dt);
    G.missionTimer = (G.missionTimer || 0) - dt;
    if (G.missionTimer <= 0) { G.missionTimer = 0.3; checkMissions(); }
  }

  function confetti(n) {
    var cols = ['#ffd23f', '#ff5ad0', '#19e6ff', '#7dff3a', '#ffffff', '#ff7a1f'];
    for (var i = 0; i < n; i++) {
      part(rnd(0, W), -10, rnd(-60, 60), rnd(80, 260), rnd(1.6, 2.6), rnd(7, 12), cols[i % cols.length], 3, 160, rnd(-6, 6));
    }
  }

  /* ------------------------------------------------------------------ UI */
  var $ = function (id) { return document.getElementById(id); };
  var screens = ['title', 'hangar', 'missions', 'pause', 'over'];
  function hideAll() { screens.forEach(function (s) { $(s).hidden = true; }); G.modal = null; blurActive(); }
  function blurActive() { try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* ignore */ } }

  function showTitle() {
    hideAll();
    G.state = 'title'; G.runActive = false;
    resetWorld(11 * WS);
    PS.length = 0; pops.length = 0; banner = null;
    $('title').hidden = false;
    $('pauseBtn').hidden = true;
    $('tBest').textContent = Kit.fmt(save.best) + ' م';
    $('tZone').textContent = save.bestZone;
    $('tOrbs').textContent = Kit.fmt(save.orbs);
    refreshBadges();
    Mus.play('title'); Mus.set(104, 0, 0);
  }

  function cheapestLocked() {
    var best = null;
    TB.SHIPS.concat(TB.TUNNELS).forEach(function (it) {
      var owned = save.ships.indexOf(it.id) >= 0 || save.tunnels.indexOf(it.id) >= 0;
      if (!owned && (!best || it.price < best.price)) best = it;
    });
    return best;
  }
  function refreshBadges() {
    var c = cheapestLocked();
    $('hangarBadge').hidden = !(c && save.orbs >= c.price);
    var mb = $('missionBadge');
    mb.hidden = doneCount() === save.mSeen || activeMissions().length === 0;
    mb.textContent = '!';
  }

  function showOver() {
    G.state = 'over'; G.overT = 0;
    hideAll();
    $('over').hidden = false;
    G.dispScore = 0;
    $('oScore').textContent = '0';
    $('oNewBest').hidden = !G.wasBest;
    var line = $('oLine');
    line.className = 'oline';
    if (G.wasBest) line.textContent = G.prevBest > 0 ? 'رقمك السابق: ' + Kit.fmt(G.prevBest) + ' م' : 'أول رقم قياسي لك!';
    else if (save.best - G.score <= Math.max(40, save.best * 0.15)) { line.textContent = 'قريب جدًا! ينقصك ' + Kit.fmt(save.best - G.score + 1) + ' م فقط لتحطيم رقمك!'; line.className = 'oline close'; }
    else line.textContent = 'أفضل نتيجة: ' + Kit.fmt(save.best) + ' م';
    var Z = ZT[G.zone];
    $('oZone').textContent = G.zone;
    $('oZone').style.color = rgba(zoneCol(Z, 0, G.t), 1);
    $('oOrbs').textContent = G.orbsRun;
    $('oClose').textContent = G.closeRun;
    var om = $('oMissions'); om.innerHTML = '';
    G.runMissions.forEach(function (i, n) {
      if (n > 2) return;
      var d = document.createElement('div'); d.className = 'om';
      d.textContent = '✔ ' + TB.missionText(TB.MISSIONS[i]) + ' ';
      var rb = document.createElement('bdi'); rb.dir = 'ltr'; rb.className = 'rew';
      rb.innerHTML = '+' + TB.MISSIONS[i].r + ' <i class="orb"></i>';
      d.appendChild(rb);
      om.appendChild(d);
    });
    if (G.runMissions.length > 3) {
      var more = document.createElement('div'); more.className = 'om';
      var mn = G.runMissions.length - 3;
      more.textContent = mn === 1 ? 'ومهمة أخرى!' : mn === 2 ? 'ومهمتان أخريان!' : 'و' + TB.count(mn, ['', '', 'مهمات', 'مهمة']) + ' أخرى!';
      om.appendChild(more);
    }
    var c = cheapestLocked(), u = $('oUnlock');
    if (c) {
      u.hidden = false;
      var ready = save.orbs >= c.price;
      u.className = 'unlock' + (ready ? ' ready' : '');
      $('oUnlockText').innerHTML = ready ? 'يمكنك الآن فتح <b>' + c.name + '</b> من المتجر!'
        : 'باقٍ لك <b>' + Kit.fmt(c.price - save.orbs) + '</b> <i class="orb"></i> لتفتح <b>' + c.name + '</b>!';
      $('oUnlockFill').style.width = '0%';
      setTimeout(function () { $('oUnlockFill').style.width = Math.min(100, save.orbs / c.price * 100).toFixed(1) + '%'; }, 60);
    } else u.hidden = true;
    if (G.wasBest && G.prevBest > 0) { Sfx.newBest(); confetti(60); }
    else if (G.wasBest) confetti(40);
    refreshBadges();
  }

  function pauseGame() {
    if (G.state !== 'play') return;
    G.state = 'paused';
    $('pause').hidden = false;
    $('pauseBtn').hidden = true;
    mouse.down = false;
    Mus.stop(); Mus.wind(0);
    Sfx.pause();
  }
  function resumeGame() {
    if (G.state !== 'paused') return;
    hideAll();
    G.state = 'play';
    $('pauseBtn').hidden = false;
    Kit.keys.reset();
    Mus.play('game'); musicForZone(G.zone);
    Sfx.resume();
  }
  function toMenu() {
    if (G.runActive) finalizeRun();
    showTitle();
  }

  /* hangar */
  var hangarTab = 'ships';
  function openHangar() {
    G.modal = 'hangar';
    $('hangar').hidden = false;
    renderHangar();
  }
  function closeModal() {
    if (!G.modal) return;
    $(G.modal).hidden = true;
    G.modal = null;
    blurActive();
    if (G.state === 'title') { $('tOrbs').textContent = Kit.fmt(save.orbs); }
    if (G.state === 'over') showOver2();
    refreshBadges();
    Sfx.click();
  }
  function showOver2() { // return to the game-over panel after the hangar, keeping it static
    $('over').hidden = false;
    var c = cheapestLocked(), u = $('oUnlock');
    if (c) {
      var ready = save.orbs >= c.price;
      u.hidden = false;
      u.className = 'unlock' + (ready ? ' ready' : '');
      $('oUnlockText').innerHTML = ready ? 'يمكنك الآن فتح <b>' + c.name + '</b> من المتجر!'
        : 'باقٍ لك <b>' + Kit.fmt(c.price - save.orbs) + '</b> <i class="orb"></i> لتفتح <b>' + c.name + '</b>!';
      $('oUnlockFill').style.width = Math.min(100, save.orbs / c.price * 100).toFixed(1) + '%';
    } else u.hidden = true;
  }
  function renderHangar() {
    $('hOrbs').textContent = Kit.fmt(save.orbs);
    var items = hangarTab === 'ships' ? TB.SHIPS : TB.TUNNELS;
    var owned = hangarTab === 'ships' ? save.ships : save.tunnels;
    var eq = hangarTab === 'ships' ? save.ship : save.tunnel;
    var grid = $('grid');
    grid.innerHTML = '';
    items.forEach(function (it, idx) {
      var card = document.createElement('div');
      var have = owned.indexOf(it.id) >= 0;
      var cls = have ? (eq === it.id ? 'equipped' : 'owned') : (save.orbs >= it.price ? 'buy' : 'locked');
      card.className = 'card ' + cls;
      card.setAttribute('data-id', it.id);
      var cv = document.createElement('canvas'); cv.width = 340; cv.height = 208;
      card.appendChild(cv);
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = it.name; card.appendChild(nm);
      var pr = document.createElement('div'); pr.className = 'pr';
      if (have) pr.textContent = eq === it.id ? 'مُختارة' : 'اختر';
      else pr.innerHTML = '<i class="orb"></i> ' + Kit.fmt(it.price);
      card.appendChild(pr);
      card.addEventListener('click', function () { hangarClick(it, card); });
      grid.appendChild(card);
      drawPreview(cv, it, idx);
    });
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-tab') === hangarTab); });
  }
  function hangarClick(it, card) {
    var isShip = hangarTab === 'ships';
    var owned = isShip ? save.ships : save.tunnels;
    if (owned.indexOf(it.id) >= 0) {
      if (isShip) save.ship = it.id; else save.tunnel = it.id;
      persist(); Sfx.equip(); renderHangar();
      return;
    }
    if (save.orbs < it.price) {
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      Sfx.deny();
      return;
    }
    save.orbs -= it.price;
    owned.push(it.id);
    if (isShip) save.ship = it.id; else save.tunnel = it.id;
    persist();
    Sfx.buy();
    toast('تم الفتح: ' + it.name + '!', true);
    renderHangar();
    var c2 = document.querySelector('.card[data-id="' + it.id + '"]');
    if (c2) c2.classList.add('bought');
  }
  function drawPreview(cv, it, idx) {
    var g = cv.getContext('2d');
    var sc = 208 / 720;
    g.save();
    g.scale(sc, sc);
    g.translate((340 / sc - W) / 2, 0);
    var saved = { D: cam.D, rot: cam.rot, bx: cam.bx, by: cam.by, f: cam.f };
    cam.D = 3; cam.bx = 0; cam.by = 0; cam.f = F;
    if (hangarTab === 'ships') {
      cam.rot = 0;
      var Z = ZT[1];
      g.fillStyle = rgb(Z.bg[0], Z.bg[1], Z.bg[2]); g.fillRect(0, 0, W, H);
      drawTunnel(g, 'grid', 0, 0, 1, 1.6);
      g.restore(); g.save();
      g.fillStyle = 'rgba(4,6,18,0.35)'; g.fillRect(0, 0, 340, 208);
      g.translate(170, 108); g.scale(70, 70);
      TB.drawShip(g, it, 0.5, 0.35);
    } else {
      cam.rot = 0.25;
      var zk = [1, 2, 3, 4, 5, 6, 7, 2, 5, 1][idx % 10];
      var Z2 = ZT[zk];
      g.fillStyle = rgb(Z2.bg[0], Z2.bg[1], Z2.bg[2]); g.fillRect(0, 0, W, H);
      drawTunnel(g, it.id, 1.3, 0.5, zk, 2.2);
    }
    g.restore();
    cam.D = saved.D; cam.rot = saved.rot; cam.bx = saved.bx; cam.by = saved.by; cam.f = saved.f;
  }

  /* missions screen */
  function openMissions() {
    G.modal = 'missions';
    $('missions').hidden = false;
    $('mOrbs').textContent = Kit.fmt(save.orbs);
    var doneN = doneCount();
    save.mSeen = doneN; persist(); refreshBadges();
    $('mCount').textContent = doneN + ' / ' + TB.MISSIONS.length + ' مكتملة';
    var list = $('mList'); list.innerHTML = '';
    var act = activeMissions();
    if (!act.length) {
      list.innerHTML = '<div class="mdone">أنجزت كل المهمات! أنت <b>بطل النفق</b> الحقيقي.<br>واصل تحطيم رقمك القياسي!</div>';
      return;
    }
    act.forEach(function (idx) {
      var m = TB.MISSIONS[idx], v = Math.min(mVal(m), m.n);
      var row = document.createElement('div'); row.className = 'mission';
      row.innerHTML = '<div class="mnum">' + (idx + 1) + '</div><div class="mbody"><div class="mtext"></div>' +
        '<div class="mbar"><div class="mfill" style="width:' + (v / m.n * 100).toFixed(1) + '%"></div></div>' +
        '<div class="mprog">' + Kit.fmt(v) + ' من ' + Kit.fmt(m.n) + '</div></div>' +
        '<div class="mrew"><i class="orb"></i><bdi dir="ltr">+' + m.r + '</bdi></div>';
      row.querySelector('.mtext').textContent = TB.missionText(m);
      list.appendChild(row);
    });
  }

  /* ------------------------------------------------------------- input */
  function onBtn(id, fn) {
    $(id).addEventListener('click', function (e) { e.stopPropagation(); A.unlock(); fn(); blurActive(); });
  }
  onBtn('playBtn', function () { Sfx.click(); startGame(); });
  onBtn('hangarBtn', function () { Sfx.click(); openHangar(); });
  onBtn('missionsBtn', function () { Sfx.click(); openMissions(); });
  onBtn('resumeBtn', resumeGame);
  onBtn('restartBtn', function () { if (G.runActive) finalizeRun(); startGame(); });
  onBtn('menuBtn1', function () { Sfx.click(); toMenu(); });
  onBtn('againBtn', function () { startGame(); });
  onBtn('hangarBtn2', function () { Sfx.click(); $('over').hidden = true; openHangar(); });
  onBtn('menuBtn2', function () { Sfx.click(); toMenu(); });
  onBtn('pauseBtn', pauseGame);
  $('pauseBtn').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  document.querySelectorAll('.back').forEach(function (b) {
    b.addEventListener('click', function (e) { e.stopPropagation(); closeModal(); });
  });
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function (e) {
      e.stopPropagation(); hangarTab = t.getAttribute('data-tab'); Sfx.click(); renderHangar(); blurActive();
    });
  });

  window.addEventListener('keydown', function (e) {
    var c = e.code;
    if (c === 'Enter' || c === 'Space') e.preventDefault();
    if (!Mus.on && G.state === 'title') { A.unlock(); Mus.play('title'); Mus.set(104, 0, 0); }
    if (e.repeat) return;
    if (G.modal) {
      if (c === 'Escape' || c === 'Backspace') closeModal();
      return;
    }
    switch (G.state) {
      case 'title':
        if (c === 'Enter' || c === 'Space') startGame();
        break;
      case 'play':
        if (c === 'KeyP' || c === 'Escape') pauseGame();
        break;
      case 'paused':
        if (c === 'KeyP' || c === 'Escape' || c === 'Enter' || c === 'Space') resumeGame();
        else if (c === 'KeyR') { finalizeRun(); startGame(); }
        break;
      case 'dying':
        if ((c === 'Enter' || c === 'Space' || c === 'KeyR') && G.dyingT > 0.5) startGame();
        break;
      case 'over':
        if ((c === 'Enter' || c === 'Space' || c === 'KeyR') && G.overT > 0.25) startGame();
        else if (c === 'Escape') toMenu();
        break;
    }
  });
  window.addEventListener('pointerdown', function (e) {
    if (!Mus.on && G.state === 'title') { A.unlock(); Mus.play('title'); Mus.set(104, 0, 0); }
    if (G.state !== 'play' || e.button !== 0) return;
    if (e.target !== canvas && e.target !== document.body && e.target !== ui) return;
    mouse.down = true; mouse.x = view.toLogical(e.clientX, e.clientY).x;
  });
  window.addEventListener('pointermove', function (e) { if (mouse.down) mouse.x = view.toLogical(e.clientX, e.clientY).x; });
  window.addEventListener('pointerup', function () { mouse.down = false; });
  window.addEventListener('blur', function () { mouse.down = false; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pauseGame(); });
  canvas.addEventListener('pointerdown', function () { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } });

  var muteBtn = Kit.muteButton();
  muteBtn.setAttribute('aria-label', 'الصوت'); muteBtn.title = 'الصوت (M)';
  A.onMuteChange(function () { if (A.muted) Mus.wind(0); });

  /* -------------------------------------------------------------- debug */
  window.__game = {
    info: function () {
      return { state: G.state, modal: G.modal, D: Math.round(G.D / WS), v: +(G.v / WS).toFixed(2), zone: G.zone, score: G.score,
        orbsRun: G.orbsRun, closeRun: G.closeRun, shield: G.shield, obs: obs.length, pick: pick.length, parts: PS.length,
        rot: +G.rot.toFixed(2), best: save.best, orbs: save.orbs, runs: save.runs, missionsDone: save.mdone.filter(Boolean).length };
    },
    save: function () { return JSON.parse(JSON.stringify(save)); },
    autopilot: function (b, lagMs) { G.autopilot = b === 'sloppy' ? 'sloppy' : b !== false; G.lagN = Math.round((lagMs || 250) / 16.7); G.lagBuf = []; return G.autopilot; },
    invincible: function (b) { G.invincible = b !== false; return G.invincible; },
    setBest: function (m) { save.best = m; save.bestD = m * WS; persist(); return m; },
    addOrbs: function (n) { save.orbs += n; persist(); return save.orbs; },
    skipZone: function () {
      if (G.state !== 'play') return false;
      var nz = ZT[G.zone + 1];
      G.D = nz.start - 17; G.v = ZT[G.zone].v;
      obs.length = 0; pick.length = 0; path.length = 0;
      genReset(G.D + 13, theta());
      return G.zone;
    },
    sim: function (sec) { // run game logic quickly (no drawing) for automated checks
      var n = Math.round((sec || 1) * 60);
      for (var i = 0; i < n && (G.state === 'play' || G.state === 'title'); i++) update(1 / 60);
      var out = this.info();
      for (i = 0; i < 200 && G.state === 'dying'; i++) update(1 / 60);
      for (i = 0; i < 30 && G.state === 'over'; i++) update(1 / 60);
      return out;
    },
    bench: function (n) { // average ms per render() call, to judge drawing cost
      n = n || 60; var t0 = performance.now();
      for (var i = 0; i < n; i++) render();
      return +((performance.now() - t0) / n).toFixed(2);
    },
    zones: function () { return ZT.slice(1, 12).map(function (z) { return { k: z.k, start: Math.round(z.start / WS), v: z.vn }; }); }
  };

  /* --------------------------------------------------------------- boot */
  try {
    if (document.fonts && document.fonts.load) {
      document.fonts.load('700 40px Fredoka', 'ب').catch(function () {});
      document.fonts.load('700 40px Fredoka', 'A0').catch(function () {});
    }
  } catch (e) { /* ignore */ }
  showTitle();
  Kit.loop(update, render);
})();
