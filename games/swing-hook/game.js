/*
 * Swing Hook — rendering, ragdoll, camera, audio, menus and progression.
 * Physics lives in sim.js, level data in levels.js, endless mode in endless.js.
 */
(function () {
  'use strict';

  var W = 1280, H = 720;
  var Sim = window.SHSim, LEVELS = window.SH_LEVELS, End = window.SHEndless;
  var TAU = Math.PI * 2;
  var canvas = document.getElementById('game');
  var ui = document.getElementById('ui');
  function layoutUI(v) {
    ui.style.left = canvas.style.left;
    ui.style.top = canvas.style.top;
    ui.style.transform = 'scale(' + v.scale + ')';
  }
  var view = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: layoutUI });
  var ctx = view.ctx;
  layoutUI(view);
  Kit.muteButton();
  var store = Kit.store('swing-hook');
  var $ = function (id) { return document.getElementById(id); };
  var FONT = "'Fredoka', 'Segoe UI Rounded', 'Segoe UI', sans-serif";

  /* ------------------------------------------------------------ save data */
  var save = { unlocked: 1, stars: {}, best: {}, skin: 0, trail: 0, endless: 0, seenSkin: 0, seenTrail: 0, lastWorld: 0, seenEndless: 0 };
  (function () {
    var s = store.get('save', null);
    if (s && typeof s === 'object') for (var k in save) if (s[k] != null && typeof s[k] === typeof save[k]) save[k] = s[k];
    save.unlocked = Kit.clamp(save.unlocked | 0, 1, LEVELS.length);
  })();
  function persist() { store.set('save', save); }
  function starBits(i) { return save.stars[i] | 0; }
  function popcount(b) { return (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1); }
  function totalStars() { var n = 0; for (var i = 0; i < LEVELS.length; i++) n += popcount(starBits(i)); return n; }
  var MAXSTARS = LEVELS.length * 3;

  /* --------------------------------------------------------------- themes */
  var THEMES = [
    { name: 'Sunny Park', sky: ['#38b8ff', '#c4f1ff'], sun: '#fff5a0', far: '#9be58a', near: '#52c862', hill: 'round',
      wall: '#ff9f43', wallTop: '#5ed36a', wallDark: '#d97a2a', sea: '#2f86ff', seaTop: '#8fd0ff', ink: '#23244a', cloud: '#ffffff', tile: '#2fb4ff' },
    { name: 'Candy Clouds', sky: ['#ff86cc', '#ffe6f5'], sun: '#fffbe0', far: '#ffc6ea', near: '#c796ff', hill: 'round',
      wall: '#8f6bff', wallTop: '#ffffff', wallDark: '#6a47d6', sea: '#8a4dff', seaTop: '#d0b3ff', ink: '#35164f', cloud: '#ffffff', tile: '#ff5fb8' },
    { name: 'Sunset Canyon', sky: ['#ff5f4a', '#ffd584'], sun: '#fff1a8', far: '#ee8a5c', near: '#c45a3a', hill: 'mesa',
      wall: '#c0633a', wallTop: '#ffcf5c', wallDark: '#8e3f22', sea: '#14b3a6', seaTop: '#7ae8dc', ink: '#3a1c14', cloud: '#ffe8cc', tile: '#ff7a3d' },
    { name: 'Star Night', sky: ['#120c3a', '#4e2c95'], sun: '#fff6cf', far: '#2c2272', near: '#3d2f98', hill: 'spiky',
      wall: '#27c6f5', wallTop: '#ffffff', wallDark: '#1784b8', sea: '#2d44d6', seaTop: '#7f95ff', ink: '#0e0a2a', cloud: '#7d6bd0', tile: '#7b5cff', night: true }
  ];
  var WORLD_NAMES = THEMES.map(function (t) { return t.name; });
  function worldOf(i) { return Math.min(THEMES.length - 1, Math.floor(i / 6)); }
  var skyGrad = [];

  /* ---------------------------------------------------------- skins/trails */
  var SKINS = [
    { name: 'Bubblegum', col: '#ff4fa3', head: '#ffc4e1', acc: 'bow', ac: '#ffe14d', req: 0 },
    { name: 'Ocean', col: '#1e9bff', head: '#c4e8ff', acc: 'cap', ac: '#ff4a4a', req: 2 },
    { name: 'Lime', col: '#2fcf5f', head: '#caffd8', acc: 'sprout', ac: '#2fcf5f', req: 5 },
    { name: 'Sunny', col: '#ffb000', head: '#fff0b0', acc: 'shades', ac: '#23244a', req: 9 },
    { name: 'Grape', col: '#9b5cff', head: '#e4d2ff', acc: 'ears', ac: '#9b5cff', req: 14 },
    { name: 'Ninja', col: '#34385a', head: '#4a5078', acc: 'band', ac: '#ff3b3b', req: 20 },
    { name: 'Robot', col: '#8d9bb8', head: '#dfe6f5', acc: 'antenna', ac: '#ff3b3b', req: 27 },
    { name: 'Tiger', col: '#ff8a1f', head: '#ffd29e', acc: 'tiger', ac: '#3a1c14', req: 35 },
    { name: 'Galaxy', col: '#5a3cff', head: '#241556', acc: 'galaxy', ac: '#7ff6ff', req: 46 },
    { name: 'Golden', col: '#ffc21a', head: '#fff3b0', acc: 'crown', ac: '#ffd21f', req: 60 }
  ];
  var TRAILS = [
    { name: 'Swoosh', req: 0 }, { name: 'Rainbow', req: 3 }, { name: 'Fire', req: 7 }, { name: 'Bubbles', req: 12 },
    { name: 'Candy', req: 18 }, { name: 'Neon', req: 24 }, { name: 'Sparkle', req: 32 }, { name: 'Golden', req: 42 }
  ];
  if (save.skin >= SKINS.length || SKINS[save.skin].req > totalStars()) save.skin = 0;
  if (save.trail >= TRAILS.length || TRAILS[save.trail].req > totalStars()) save.trail = 0;

  /* ----------------------------------------------------------------- audio */
  var A = Kit.audio;
  var sfx = {
    grab: function () { A.tone({ freq: 700, to: 1500, type: 'triangle', dur: 0.07, vol: 0.18 }); A.noise({ dur: 0.05, vol: 0.07, filter: 7000, to: 2500 }); },
    whoosh: function (sp) {
      var v = Kit.clamp(sp / 1700, 0.15, 1);
      A.noise({ dur: 0.25 + 0.2 * v, vol: 0.12 + 0.25 * v, filter: 900 + 3000 * v, to: 220 });
      A.tone({ freq: 240 + 260 * v, to: 120, type: 'sine', dur: 0.22, vol: 0.07 });
    },
    launch: function () { A.tone({ freq: 160, to: 700, type: 'sine', dur: 0.25, vol: 0.3 }); A.noise({ dur: 0.3, vol: 0.15, filter: 2500, to: 300 }); },
    boing: function (v) {
      var p = Kit.clamp(v / 1400, 0.7, 1.4);
      A.tone({ freq: 130 * p, to: 560 * p, type: 'sine', dur: 0.24, vol: 0.34 });
      A.tone({ freq: 260 * p, to: 980 * p, type: 'triangle', dur: 0.16, vol: 0.12, delay: 0.03 });
    },
    bumper: function () {
      A.tone({ freq: 740, type: 'square', dur: 0.06, vol: 0.1 }); A.tone({ freq: 1110, type: 'square', dur: 0.1, vol: 0.1, delay: 0.05 });
      A.tone({ freq: 170, to: 460, type: 'sine', dur: 0.16, vol: 0.28 });
    },
    flip: function (c) {
      var f = 523 * Math.pow(1.1225, Math.min(c, 8) * 2 - 2);
      A.tone({ freq: f, to: f * 1.5, type: 'square', dur: 0.09, vol: 0.1 });
      A.tone({ freq: f * 1.5, type: 'triangle', dur: 0.16, vol: 0.16, delay: 0.07 });
      if (c >= 2) A.tone({ freq: f * 2, type: 'triangle', dur: 0.2, vol: 0.12, delay: 0.14 });
    },
    ring: function () {
      [784, 1047, 1319, 1568].forEach(function (f, i) { A.tone({ freq: f, type: 'sine', dur: 0.12, vol: 0.16, delay: i * 0.04 }); });
      A.noise({ dur: 0.45, vol: 0.22, filter: 4000, to: 300 });
    },
    poof: function () { A.noise({ dur: 0.35, vol: 0.35, filter: 2600, to: 150 }); A.tone({ freq: 520, to: 110, type: 'triangle', dur: 0.32, vol: 0.28 }); },
    splash: function () {
      A.noise({ dur: 0.7, vol: 0.4, filter: 1600, to: 90 }); A.tone({ freq: 650, to: 180, type: 'sine', dur: 0.16, vol: 0.16 });
      A.tone({ freq: 1300, to: 1700, type: 'sine', dur: 0.05, vol: 0.08, delay: 0.25 }); A.tone({ freq: 1100, to: 1500, type: 'sine', dur: 0.05, vol: 0.07, delay: 0.38 });
    },
    thud: function (v) { A.tone({ freq: 150, to: 70, type: 'triangle', dur: 0.09, vol: Kit.clamp(v / 2200, 0.06, 0.3) }); },
    star: function (i) { var f = [784, 988, 1175][i] || 1175; A.tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.28 }); A.tone({ freq: f * 2, type: 'sine', dur: 0.3, vol: 0.12, delay: 0.05 }); },
    win: function () { Kit.sfx.win(); A.noise({ dur: 0.25, vol: 0.2, filter: 5000, to: 1000 }); },
    click: function () { Kit.sfx.click(); },
    unlock: function () { Kit.sfx.power(); },
    tick: function () { A.tone({ freq: 1200, type: 'sine', dur: 0.03, vol: 0.06 }); }
  };
  // Continuous wind noise that rises with speed.
  var wind = null;
  function ensureWind() {
    var c = A.ctx;
    if (!c || wind || !A.master) return;
    try {
      var len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0), last = 0;
      for (var i = 0; i < len; i++) { last = last * 0.96 + (Math.random() * 2 - 1) * 0.04; d[i] = last * 6; }
      var src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.8;
      var g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(A.master); src.start();
      wind = { f: f, g: g };
    } catch (e) { wind = { f: null, g: null, broken: true }; }
  }
  function updateWind(sp, on) {
    if (!wind) ensureWind();
    if (!wind || wind.broken || !A.ctx) return;
    var t = A.ctx.currentTime;
    var target = on ? Kit.clamp((sp - 350) / 1700, 0, 1) * 0.5 : 0;
    wind.g.gain.setTargetAtTime(target, t, 0.08);
    wind.f.frequency.setTargetAtTime(250 + sp * 0.9, t, 0.1);
  }

  /* ----------------------------------------------------------------- music */
  // A tiny cheerful sequencer (bass + chord stabs + arpeggio), scheduled ahead
  // with WebAudio time. Different key and chords per world.
  var MUSIC = [
    { root: 60, prog: [0, 7, 9, 5], minor: [false, false, true, false], bpm: 124 },   // C G Am F
    { root: 65, prog: [0, 5, 7, 5], minor: [false, false, false, false], bpm: 132 },  // F Bb C Bb
    { root: 57, prog: [0, 8, 3, 10], minor: [true, false, false, false], bpm: 120 },  // Am F C G
    { root: 62, prog: [0, 10, 8, 7], minor: [true, false, false, true], bpm: 112 }    // Dm C Bb Am
  ];
  var music = { on: false, next: 0, step: 0, song: 0 };
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function musicTick() {
    var c = A.ctx;
    if (!c || A.muted || !music.on) { if (c) music.next = Math.max(music.next, c.currentTime); return; }
    var sg = MUSIC[music.song], spb = 60 / sg.bpm / 2; // eighth notes
    if (music.next < c.currentTime) music.next = c.currentTime + 0.05;
    while (music.next < c.currentTime + 0.25) {
      var st = music.step, bar = Math.floor(st / 8) % 4, e = st % 8, d = music.next - c.currentTime;
      var r = sg.root + sg.prog[bar], third = sg.minor[bar] ? 3 : 4;
      if (e === 0 || e === 3 || e === 6) A.tone({ freq: mtof(r - 24), type: 'triangle', dur: spb * 1.6, vol: 0.13, delay: d });
      var arp = [0, third, 7, 12, 7, third, 12, 7 + 12][e];
      A.tone({ freq: mtof(r + arp), type: 'square', dur: spb * 0.7, vol: 0.022, delay: d });
      if (e === 2 || e === 6) { A.tone({ freq: mtof(r + 12 + third), type: 'triangle', dur: spb * 0.9, vol: 0.035, delay: d }); }
      if (e % 2 === 1) A.noise({ dur: 0.03, vol: 0.025, filter: 9000, delay: d });
      music.next += spb; music.step++;
    }
  }
  function setMusic(on, song) {
    if (song != null && song !== music.song) { music.song = song; music.step = 0; }
    music.on = on;
  }

  /* ------------------------------------------------------------- particles */
  var PMAX = 480, parts = [], pcur = 0;
  for (var pi = 0; pi < PMAX; pi++) parts.push({ on: false });
  function P(type, x, y, vx, vy, life, size, color, g, drag) {
    var p = parts[pcur]; pcur = (pcur + 1) % PMAX;
    p.on = true; p.type = type; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life;
    p.size = size; p.color = color; p.g = g || 0; p.drag = drag == null ? 1 : drag;
    p.rot = Math.random() * TAU; p.vr = (Math.random() - 0.5) * 14;
    return p;
  }
  function burst(x, y, n, o) {
    for (var i = 0; i < n; i++) {
      var a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || TAU) : Math.random() * TAU;
      var sp = (o.speed || 300) * (0.35 + Math.random() * 0.65);
      var col = o.colors ? o.colors[(Math.random() * o.colors.length) | 0] : o.color;
      P(o.type || 'dot', x, y, Math.cos(a) * sp + (o.vx || 0), Math.sin(a) * sp + (o.vy || 0), (o.life || 0.6) * (0.6 + Math.random() * 0.5),
        (o.size || 6) * (0.6 + Math.random() * 0.7), col, o.g == null ? 600 : o.g, o.drag);
    }
  }
  function updateParts(dt) {
    for (var i = 0; i < PMAX; i++) {
      var p = parts[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      if (p.drag !== 1) { var k = Math.pow(p.drag, dt * 60); p.vx *= k; p.vy *= k; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  }
  function clearParts() { for (var i = 0; i < PMAX; i++) parts[i].on = false; }
  function drawParts(c) {
    for (var i = 0; i < PMAX; i++) {
      var p = parts[i];
      if (!p.on) continue;
      var t = p.life / p.max;
      c.globalAlpha = t < 0.3 ? t / 0.3 : 1;
      c.fillStyle = p.color;
      if (p.type === 'dot') { c.beginPath(); c.arc(p.x, p.y, p.size * (0.4 + 0.6 * t), 0, TAU); c.fill(); }
      else if (p.type === 'puff') { c.beginPath(); c.arc(p.x, p.y, p.size * (1.6 - 0.8 * t), 0, TAU); c.fill(); }
      else if (p.type === 'star') { drawStar(c, p.x, p.y, p.size, p.rot); c.fill(); }
      else if (p.type === 'conf') {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(1, Math.cos(p.rot * 2)); c.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); c.restore();
      } else if (p.type === 'ring') {
        c.strokeStyle = p.color; c.lineWidth = 5 * t + 1; c.beginPath(); c.arc(p.x, p.y, p.size * (1.8 - t), 0, TAU); c.stroke();
      } else if (p.type === 'streak') {
        c.strokeStyle = p.color; c.lineWidth = p.size * t; c.lineCap = 'round';
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); c.stroke();
      }
    }
    c.globalAlpha = 1;
  }
  function drawStar(c, x, y, r, rot) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = rot + i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
      if (i) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }

  /* ---------------------------------------------------------------- popups */
  var pops = [];
  for (var qi = 0; qi < 14; qi++) pops.push({ on: false });
  var popCur = 0;
  function popup(text, x, y, color, size) {
    var p = pops[popCur]; popCur = (popCur + 1) % pops.length;
    p.on = true; p.text = text; p.x = x; p.y = y; p.t = 0; p.life = 1.1; p.color = color || '#fff'; p.size = size || 34;
  }
  function updatePops(dt) { for (var i = 0; i < pops.length; i++) { var p = pops[i]; if (!p.on) continue; p.t += dt; p.y -= 60 * dt; if (p.t > p.life) p.on = false; } }
  function drawPops(c, z) {
    for (var i = 0; i < pops.length; i++) {
      var p = pops[i];
      if (!p.on) continue;
      var k = p.t < 0.15 ? p.t / 0.15 : 1;
      var sc = (p.t < 0.15 ? 0.3 + 1.0 * k : 1.3 - Math.min(0.3, (p.t - 0.15) * 2)) / z;
      c.save(); c.translate(p.x, p.y); c.scale(sc, sc); c.rotate(-0.06);
      c.globalAlpha = p.t > p.life - 0.3 ? (p.life - p.t) / 0.3 : 1;
      c.font = '700 ' + p.size + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineJoin = 'round'; c.lineWidth = 9; c.strokeStyle = '#2a1747'; c.strokeText(p.text, 0, 0);
      c.fillStyle = p.color; c.fillText(p.text, 0, 0);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  /* ----------------------------------------------------------- game state */
  var mode = 'title';       // title | levels | style | play | pause | result
  var lvl = 0, endless = false, attract = false;
  var L = null, w = null, theme = THEMES[0];
  var deadT = 0, winT = 0, slow = 1, needFresh = false, readyT = 0, stuckT = 0, runT = 0;
  var cam = { x: 0, y: 0, z: 0.9 };
  var shake = Kit.shake();
  var time = 0, squash = 0, squashV = 0, ropeT = 1, blinkT = 2;
  var holdMouse = false;
  var auto = null;          // debug: scripted input frames
  var apMem = {};
  var endlessBestShown = false, endlessStartX = 150;
  var tutorialRelease = false;
  var flashT = 0, pruneN = 0;

  /* ----------------------------------------------------------------- input */
  function inUI(e) { return e.target && e.target.closest && e.target.closest('button, .scr'); }
  window.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || inUI(e)) return;
    holdMouse = true; mouseTap = true;
    try { canvas.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
  });
  window.addEventListener('pointerup', function (e) { if (e.button === 0) holdMouse = false; });
  window.addEventListener('pointercancel', function () { holdMouse = false; });
  window.addEventListener('blur', function () { holdMouse = false; });
  var mouseTap = false;
  // a tap shorter than one frame still counts as holding for one step
  function holdInput() { return holdMouse || mouseTap || Kit.keys.down('Space') || Kit.keys.pressed('Space'); }

  /* --------------------------------------------------------------- ragdoll */
  // joints: elbowL handL elbowR handR kneeL footL kneeR footR (world coords, verlet)
  var POSES = {
    stand: [-8, -3, -11, 8, 8, -3, 11, 8, -4, 25, -5, 38, 4, 25, 5, 38],
    fly: [-12, -20, -17, -32, 12, -20, 18, -31, -8, 24, -13, 35, 7, 25, 13, 36],
    swing: [-12, -7, -22, -3, 1, -24, 1, -36, -3, 25, -4, 38, 5, 24, 9, 36],
    tuck: [-10, -2, -7, 9, 10, -2, 7, 9, -9, 4, -8, 17, 9, 4, 8, 17],
    cheer: [-10, -22, -14, -35, 10, -22, 14, -35, -5, 25, -7, 38, 5, 25, 7, 38],
    splat: [-14, -4, -26, -2, 14, -4, 26, -2, -10, 22, -18, 32, 10, 22, 18, 32]
  };
  var J = [];
  for (var ji = 0; ji < 8; ji++) J.push({ x: 0, y: 0, px: 0, py: 0 });
  var LOCAL = new Array(16);
  function toWorld(bx, by, ang, lx, ly, out) {
    var c = Math.cos(ang), s = Math.sin(ang);
    out.x = bx + lx * c - ly * s; out.y = by + lx * s + ly * c;
    return out;
  }
  var tmpP = { x: 0, y: 0 }, tmpA = { x: 0, y: 0 };
  function ragReset(bx, by, ang, pose) {
    var P0 = POSES[pose || 'stand'];
    for (var i = 0; i < 8; i++) { toWorld(bx, by, ang, P0[i * 2], P0[i * 2 + 1], tmpP); J[i].x = J[i].px = tmpP.x; J[i].y = J[i].py = tmpP.y; }
  }
  function choosePose() {
    if (!w) return 'stand';
    if (w.st === 'ready') return 'stand';
    if (w.st === 'won') return 'cheer';
    if (w.hook) return 'swing';
    if (w.grounded > 0) return 'stand';
    if (Math.abs(w.av) > 6.5) return 'tuck';
    return 'fly';
  }
  function constrain(ax, ay, j, len) {
    var dx = j.x - ax, dy = j.y - ay, d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    j.x = ax + dx / d * len; j.y = ay + dy / d * len;
  }
  function constrain2(a, b, len) {
    var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.001, k = (d - len) / d * 0.5;
    a.x += dx * k; a.y += dy * k; b.x -= dx * k; b.y -= dy * k;
  }
  function updateRag() {
    var pose = POSES[choosePose()];
    var bx = w.x, by = w.y + (w.st === 'ready' ? bob() : 0), ang = w.ang;
    var k = w.hook ? 0.3 : 0.24;
    var flail = w.st === 'play' && !w.hook && w.grounded <= 0 ? Math.sin(time * 22) * 4 : 0;
    for (var i = 0; i < 8; i++) {
      var j = J[i];
      var vx = (j.x - j.px) * 0.82, vy = (j.y - j.py) * 0.82;
      j.px = j.x; j.py = j.y;
      j.x += vx; j.y += vy + 0.35;
      toWorld(bx, by, ang, pose[i * 2] + (i === 1 || i === 3 ? flail : 0), pose[i * 2 + 1] + (i === 1 ? flail : i === 3 ? -flail : 0), tmpP);
      j.x += (tmpP.x - j.x) * k; j.y += (tmpP.y - j.y) * k;
    }
    var neck = toWorld(bx, by, ang, 0, -12, tmpA);
    var nx = neck.x, ny = neck.y;
    for (var it = 0; it < 3; it++) {
      constrain(nx, ny, J[0], 12); constrain2(J[0], J[1], 12);
      constrain(nx, ny, J[2], 12); constrain2(J[2], J[3], 12);
      toWorld(bx, by, ang, -3, 12, tmpP); constrain(tmpP.x, tmpP.y, J[4], 13); constrain2(J[4], J[5], 13);
      toWorld(bx, by, ang, 3, 12, tmpP); constrain(tmpP.x, tmpP.y, J[6], 13); constrain2(J[6], J[7], 13);
    }
    if (w.hook) {
      // rope hand reaches for the hook
      var dx = w.hook.cx - nx, dy = w.hook.cy - ny, d = Math.sqrt(dx * dx + dy * dy) || 1;
      J[2].x = nx + dx / d * 11; J[2].y = ny + dy / d * 11;
      J[3].x = nx + dx / d * 23; J[3].y = ny + dy / d * 23;
    }
  }
  function bob() { return Math.sin(time * 5) * 2.5; }

  /* ---------------------------------------------------------- level setup */
  function useLevel(Lv) {
    L = Lv; w = Sim.create(L);
    deadT = 0; winT = 0; slow = 1; readyT = 0; stuckT = 0; runT = 0; ropeT = 1;
    squash = 0; squashV = 0;
    trailN = 0; trailI = 0;
    clearParts();
    for (var i = 0; i < pops.length; i++) pops[i].on = false;
    ragReset(w.x, w.y, 0, 'stand');
    cam.x = w.x + 380; cam.y = L.sea + 70 - H / 2 / 0.9; cam.z = 0.9;
    apMem = {};
  }
  function startLevel(i) {
    endless = false; attract = false; lvl = i;
    theme = THEMES[worldOf(i)];
    useLevel(Sim.build(LEVELS[i]));
    needFresh = holdInput();
    tutorialRelease = i < 2;
    setMode('play');
  }
  function startEndless() {
    endless = true; attract = false;
    theme = THEMES[0];
    var Lv = End.createLevel((Math.random() * 1e9) | 0, false);
    End.extend(Lv, 3500);
    useLevel(Lv);
    endlessStartX = w.x; endlessBestShown = false;
    needFresh = holdInput();
    tutorialRelease = false;
    setMode('play');
  }
  function startAttract() {
    attract = true; endless = true;
    theme = THEMES[(Math.random() * 4) | 0];
    if (save.unlocked <= 6) theme = THEMES[0];
    var Lv = End.createLevel((Math.random() * 1e9) | 0, true);
    End.extend(Lv, 3500);
    useLevel(Lv);
  }
  function restart() {
    if (endless) { startEndless(); return; }
    useLevel(Sim.build(LEVELS[lvl]));
    needFresh = holdInput();
    setMode('play');
  }
  function respawn() {
    // quick respawn after a bonk / splash
    useLevel(Sim.build(LEVELS[lvl]));
    needFresh = holdInput();
  }

  /* ---------------------------------------------------------------- events */
  function kick(v) { squashV += v; }
  function handleEvents() {
    var ev = w.ev;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      var loud = !attract;
      switch (e.type) {
        case 'launch':
          if (loud) sfx.launch();
          burst(e.x, e.y + 18, 14, { type: 'puff', colors: ['#fff', '#fff6d0'], speed: 220, angle: Math.PI / 2, spread: 2.6, g: -80, life: 0.5, size: 9, drag: 0.9 });
          kick(-4); shake.add(4);
          break;
        case 'grab':
          if (loud) sfx.grab();
          ropeT = 0;
          burst(e.x, e.y, 8, { type: 'dot', colors: ['#fff', '#ffe14d'], speed: 220, life: 0.35, size: 5, g: 0 });
          P('ring', e.x, e.y, 0, 0, 0.35, 20, '#ffe14d', 0);
          kick(3);
          break;
        case 'release':
          if (loud) sfx.whoosh(e.sp);
          if (e.sp > 900) {
            for (var k = 0; k < 6; k++) P('streak', w.x + (Math.random() - 0.5) * 30, w.y + (Math.random() - 0.5) * 30, w.vx * 0.6, w.vy * 0.6, 0.3, 5, 'rgba(255,255,255,0.9)', 0, 0.9);
          }
          kick(4);
          if (endless || lvl !== 0) tutorialRelease = false;
          break;
        case 'bounce':
          if (loud) { if (e.kind === 'bumper') sfx.bumper(); else sfx.boing(e.v); }
          burst(e.x, e.y, 16, { type: e.kind === 'bumper' ? 'star' : 'dot', colors: e.kind === 'bumper' ? ['#ffe14d', '#fff', '#ff4fa3'] : ['#ff4fa3', '#ffd1ea', '#fff'], speed: 380, angle: Math.atan2(e.ny, e.nx), spread: 2.2, life: 0.55, size: 7, g: 500 });
          P('ring', e.x, e.y, 0, 0, 0.35, 26, '#fff', 0);
          shake.add(e.kind === 'bumper' ? 5 : 7);
          kick(-7);
          if (loud && Math.random() < 0.55) popup(e.kind === 'bumper' ? 'BONK!' : 'BOING!', e.x, e.y - 50, '#ff8ad0', 30);
          break;
        case 'thud':
          if (loud) sfx.thud(e.v);
          burst(e.x, e.y, 6, { type: 'puff', color: 'rgba(255,255,255,0.8)', speed: 120, life: 0.35, size: 6, g: -40 });
          if (e.v > 500) shake.add(3);
          kick(-3);
          break;
        case 'flip':
          if (loud) sfx.flip(e.combo);
          var names = ['', 'FLIP!', 'DOUBLE FLIP!', 'TRIPLE FLIP!', 'QUAD FLIP!!', 'MEGA FLIP!!'];
          var txt = e.loop ? 'LOOP-DE-LOOP!' : (names[e.combo] || ('SUPER x' + e.combo + '!!'));
          var cols = ['#ffe14d', '#7ff6ff', '#9dff6b', '#ff8ad0', '#ffb000'];
          popup(txt, e.x, e.y - 60, cols[(e.combo - 1) % cols.length], 30 + Math.min(e.combo, 4) * 4);
          burst(e.x, e.y, 10 + e.combo * 4, { type: 'star', colors: ['#ffe14d', '#fff', '#7ff6ff'], speed: 320, life: 0.6, size: 7, g: 200 });
          break;
        case 'ring':
          if (loud) sfx.ring();
          burst(e.x, e.y, 22, { type: 'star', colors: ['#ffe14d', '#ffb000', '#fff'], speed: 420, life: 0.6, size: 8, g: 0, drag: 0.93 });
          P('ring', e.x, e.y, 0, 0, 0.45, 50, '#ffe14d', 0);
          shake.add(5); kick(6);
          if (loud) popup('ZOOM!', e.x, e.y - 80, '#ffe14d', 34);
          break;
        case 'die':
          if (e.kind === 'splash') {
            if (loud) sfx.splash();
            burst(e.x, L.sea - 20, 30, { type: 'dot', colors: [theme.seaTop, '#fff', theme.sea], speed: 520, angle: -Math.PI / 2, spread: 1.4, life: 0.9, size: 9, g: 1400 });
            P('ring', e.x, L.sea - 20, 0, 0, 0.5, 40, '#fff', 0);
            if (loud) popup('SPLASH!', e.x, L.sea - 140, '#7ff6ff', 38);
          } else {
            if (loud) sfx.poof();
            burst(e.x, e.y, 26, { type: 'puff', colors: ['#fff', '#f1e8ff', '#ffe6f3'], speed: 260, life: 0.7, size: 12, g: -60, drag: 0.9 });
            burst(e.x, e.y, 14, { type: 'star', colors: ['#ffe14d', SKINS[save.skin].col], speed: 420, life: 0.7, size: 8, g: 500 });
            if (loud) popup('POOF!', e.x, e.y - 70, '#fff', 40);
          }
          shake.add(12);
          if (loud && !L.endless && e.x > L.finish - 450) popup('SO CLOSE!', e.x, e.y - 130, '#ffe14d', 36);
          break;
        case 'win':
          if (loud) sfx.win();
          confetti(e.x, e.y, 70);
          shake.add(8);
          if (loud) popup('FINISH!', e.x, e.y - 90, '#ffe14d', 48);
          break;
      }
    }
    ev.length = 0;
  }
  function confetti(x, y, n) {
    burst(x, y, n, { type: 'conf', colors: ['#ff4fa3', '#ffe14d', '#2fd35a', '#1fa8ff', '#9b5cff', '#ff7a1a'], speed: 700, angle: -Math.PI / 2, spread: 2.6, life: 1.6, size: 7, g: 700, drag: 0.97 });
  }

  /* ------------------------------------------------------------------ trail */
  var TN = 30, trail = [], trailN = 0, trailI = 0;
  for (var ti = 0; ti < TN; ti++) trail.push({ x: 0, y: 0 });
  function pushTrail(x, y) { var p = trail[trailI]; p.x = x; p.y = y; trailI = (trailI + 1) % TN; if (trailN < TN) trailN++; }

  /* ------------------------------------------------------------------ update */
  function update(dt) {
    time += dt;
    setMusic(mode !== 'pause', Math.max(0, THEMES.indexOf(theme)));
    musicTick();
    var kp = Kit.keys.pressed;
    if (mode === 'play') {
      if (kp('KeyP') || kp('Escape')) pause();
      else if (kp('KeyR')) { sfx.click(); restart(); }
      else stepGame(dt);
    } else if (mode === 'pause') {
      if (kp('KeyP') || kp('Escape') || kp('Enter')) resume();
      else if (kp('KeyR')) { sfx.click(); restart(); }
    } else if (mode === 'result') {
      updateParts(dt); updatePops(dt); shake.update(dt);
      if (resultReady > 0) resultReady -= dt;
      else if (kp('Enter') || kp('Space')) $('rsNext').click();
      else if (kp('KeyR')) $('rsReplay').hidden ? $('rsNext').click() : $('rsReplay').click();
      else if (kp('Escape')) $('rsLevels').click();
    } else {
      // menus: attract mode swings in the background
      if (!w || !attract) startAttract();
      stepGame(dt);
      if (mode === 'title') {
        if (kp('Enter') || kp('Space')) $('btnPlay').click();
      } else if (mode === 'levels') {
        if (kp('Escape')) $('lvBack').click();
        else if (kp('ArrowLeft')) $('lvPrev').click();
        else if (kp('ArrowRight')) $('lvNext').click();
        else if (kp('Enter')) playNext();
      } else if (mode === 'style') {
        if (kp('Escape')) $('stBack').click();
      }
    }
    Kit.keys.endFrame();
    mouseTap = false;
  }

  function stepGame(dt) {
    var hold;
    if (attract) hold = End.autopilot(w, apMem);
    else if (auto) { hold = !!auto.frames[auto.i]; auto.i++; if (auto.i >= auto.frames.length) auto = null; }
    else hold = holdInput();
    if (needFresh) { if (!hold) needFresh = false; hold = false; }
    if (w.st === 'ready') readyT += dt; else runT += dt;

    Sim.step(w, dt * slow, hold);
    handleEvents();

    if (endless) {
      End.extend(L, w.x + 3200);
      if (++pruneN % 60 === 0) End.prune(L, w.x - 1600);
      if (!attract && w.st === 'play') {
        var eti = Math.floor(dist() / 250) % THEMES.length;
        if (THEMES[eti] !== theme) {
          theme = THEMES[eti]; flashT = 0.4;
          popup(theme.name.toUpperCase() + '!', w.x + 120, w.y - 130, '#fff', 44);
          sfx.ring();
        }
      }
      if (!attract && !endlessBestShown && save.endless > 0 && dist() > save.endless) {
        endlessBestShown = true; popup('NEW BEST!', w.x, w.y - 90, '#ffe14d', 44); sfx.unlock(); confetti(w.x, w.y, 40);
      }
    }

    if (w.st === 'play' || w.st === 'won') pushTrail(w.x, w.y);
    else if (w.st === 'ready') trailN = 0;
    if (w.st === 'play' && Sim.speed(w) < 60) stuckT += dt; else stuckT = 0;
    if (attract && stuckT > 2) startAttract();

    // trail extras
    if (w.st === 'play' && Sim.speed(w) > 500) {
      var tr = save.trail;
      if (!attract && (tr === 2 && Math.random() < 0.5)) P('dot', w.x, w.y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.4, 5, Math.random() < 0.5 ? '#ffb000' : '#ff5a1f', -150);
      if (!attract && (tr === 6 || tr === 7) && Math.random() < 0.4) P('star', w.x + (Math.random() - 0.5) * 20, w.y + (Math.random() - 0.5) * 20, 0, 0, 0.5, 6, tr === 7 ? '#ffd21f' : '#fff', 60);
    }

    if (w.st === 'dead') {
      deadT += dt;
      if (deadT > (endless ? 1.0 : 0.75)) {
        if (attract) startAttract();
        else if (endless) endlessOver();
        else respawn();
      }
    }
    if (w.st === 'won') {
      winT += dt;
      slow = winT < 0.7 ? 0.3 : 1;
      if (winT > 0.2 && winT < 1.2 && Math.random() < 0.3) confetti(w.x + (Math.random() - 0.5) * 400, w.y - 300, 6);
      if (winT > 1.5 && mode === 'play') showResult();
    }

    if (w.st !== 'dead') updateRag();
    // squash spring
    squashV += (-squash * 260 - squashV * 14) * dt;
    squash += squashV * dt;
    squash = Kit.clamp(squash, -0.45, 0.45);
    ropeT = Math.min(1, ropeT + dt * 14);
    blinkT -= dt; if (blinkT < -0.12) blinkT = 1.5 + Math.random() * 3;

    updateCamera(dt);
    updateParts(dt); updatePops(dt); shake.update(dt);
    if (flashT > 0) flashT -= dt;
    updateWind(Sim.speed(w), mode === 'play' && w.st === 'play' && !attract);
  }

  function dist() { return Math.max(0, Math.floor((w.maxX - endlessStartX) / 50)); }

  function updateCamera(dt) {
    var sp = Sim.speed(w);
    var tx, ty, tz;
    if (w.st === 'ready') { tx = w.x + 380; ty = L.sea; tz = 0.9; }
    else if (w.st === 'dead') { tx = cam.x; ty = cam.y; tz = cam.z; }
    else {
      tx = w.x + 170 + Kit.clamp(w.vx * 0.32, -420, 360);
      ty = w.y - 30 + Kit.clamp(w.vy * 0.14, -140, 170);
      tz = Kit.clamp(0.96 - sp / 3300, 0.62, 0.96);
      if (w.st === 'won') tz = 0.8;
    }
    var kx = 1 - Math.exp(-dt * 4.2), ky = 1 - Math.exp(-dt * 3.4), kz = 1 - Math.exp(-dt * 1.6);
    cam.z += (tz - cam.z) * kz;
    // keep the water in view whenever the player is not too high up
    var hh = H / 2 / cam.z, comfort = L.sea + 70 - hh;
    if (w.st === 'ready') ty = comfort;
    else if (w.st !== 'dead') ty = Math.min(comfort, w.y + Math.min(0, w.vy * 0.2) + hh - 170);
    cam.x += (tx - cam.x) * kx;
    cam.y += (ty - cam.y) * ky;
    cam.y = Math.min(cam.y, L.sea + 100 - H / 2 / cam.z);
  }

  /* ----------------------------------------------------------------- render */
  function render() {
    var c = ctx;
    if (!w) { c.fillStyle = '#38b8ff'; c.fillRect(0, 0, W, H); return; }
    if (L) Sim.updateMovers(L, w.t);
    drawBackground(c);
    c.save();
    c.translate(W / 2 + shake.x, H / 2 + shake.y);
    c.scale(cam.z, cam.z);
    c.translate(-cam.x, -cam.y);
    var hw = W / 2 / cam.z, hh = H / 2 / cam.z;
    var vb = { x0: cam.x - hw - 80, x1: cam.x + hw + 80, y0: cam.y - hh - 80, y1: cam.y + hh + 80 };
    drawWorld(c, vb);
    c.restore();
    drawSpeedLines(c);
    if (flashT > 0) { c.fillStyle = 'rgba(255,255,255,' + Math.min(0.8, flashT * 2).toFixed(3) + ')'; c.fillRect(0, 0, W, H); }
    if (mode === 'play' || mode === 'pause') drawHUD(c);
  }

  function drawBackground(c) {
    var th = theme, ti = THEMES.indexOf(th);
    if (!skyGrad[ti]) { var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]); skyGrad[ti] = g; }
    c.fillStyle = skyGrad[ti]; c.fillRect(0, 0, W, H);
    var yOff = Kit.clamp((500 - cam.y) * 0.08, -60, 90);
    if (th.night) {
      c.fillStyle = '#fff';
      for (var i = 0; i < 70; i++) {
        var sx = ((i * 197.3 - cam.x * 0.03) % W + W) % W, sy = (i * 83.7) % (H * 0.7) + yOff * 0.3;
        c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + i));
        var s = i % 5 === 0 ? 3 : 2; c.fillRect(sx, sy, s, s);
      }
      c.globalAlpha = 1;
    }
    // sun / moon
    c.fillStyle = th.sun; c.globalAlpha = 0.35;
    c.beginPath(); c.arc(1040, 130 + yOff * 0.3, 92, 0, TAU); c.fill();
    c.globalAlpha = 1; c.beginPath(); c.arc(1040, 130 + yOff * 0.3, 66, 0, TAU); c.fill();
    if (th.night) { c.fillStyle = skyGrad[ti]; c.beginPath(); c.arc(1068, 112 + yOff * 0.3, 56, 0, TAU); c.fill(); }
    // clouds
    c.fillStyle = th.cloud; c.globalAlpha = th.night ? 0.35 : 0.85;
    for (var k = 0; k < 6; k++) {
      var span = W + 500;
      var cx = (((k * 431 + 100) - cam.x * (0.06 + k * 0.012)) % span + span) % span - 250;
      var cy = 70 + (k * 67) % 220 + yOff * 0.5;
      var sc = 0.7 + (k % 3) * 0.25;
      c.beginPath();
      c.arc(cx, cy, 34 * sc, 0, TAU); c.arc(cx + 38 * sc, cy - 14 * sc, 42 * sc, 0, TAU); c.arc(cx + 80 * sc, cy, 32 * sc, 0, TAU);
      c.rect(cx, cy - 4 * sc, 80 * sc, 36 * sc * 0.9);
      c.fill();
    }
    c.globalAlpha = 1;
    drawHills(c, th.far, 0.18, 470 + yOff, 70, 0.0035, th.hill, 1.7);
    drawHills(c, th.near, 0.38, 560 + yOff * 1.5, 60, 0.005, th.hill, 4.2);
  }
  function hash(n) { var s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
  function drawHills(c, color, f, base, amp, freq, style, seed) {
    var ox = cam.x * f;
    c.fillStyle = color;
    c.beginPath(); c.moveTo(0, H);
    var step = style === 'mesa' ? 8 : 24;
    for (var sx = -step; sx <= W + step; sx += step) {
      var wx = sx + ox, y;
      if (style === 'mesa') {
        var q = Math.floor(wx / 210 + seed), fr = wx / 210 + seed - q;
        var hq = hash(q) * amp * 2.2;
        var edge = Math.min(1, Math.min(fr, 1 - fr) * 8);
        y = base - hq * edge + 20;
      } else if (style === 'spiky') {
        var t = wx * freq * 2 + seed, tri = Math.abs((t % 2 + 2) % 2 - 1);
        y = base + 30 - tri * amp * 1.8 - Math.sin(wx * freq * 0.7 + seed) * amp * 0.5;
      } else {
        y = base + Math.sin(wx * freq + seed) * amp + Math.sin(wx * freq * 2.3 + seed * 2) * amp * 0.4;
      }
      c.lineTo(sx, y);
    }
    c.lineTo(W + step, H); c.closePath(); c.fill();
  }

  function drawSpeedLines(c) {
    if (!w || w.st !== 'play') return;
    var sp = Sim.speed(w);
    if (sp < 1250) return;
    var a = Math.min(0.5, (sp - 1250) / 1500);
    var ang = Math.atan2(w.vy, w.vx);
    c.save(); c.translate(W / 2, H / 2); c.rotate(ang);
    c.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath();
    for (var i = 0; i < 14; i++) {
      var yy = (hash(i * 3.1 + Math.floor(time * 20)) - 0.5) * H * 1.3;
      var xx = (hash(i * 7.7 + Math.floor(time * 20)) - 0.5) * W * 1.2;
      if (Math.abs(yy) < 120) continue;
      c.moveTo(xx, yy); c.lineTo(xx - 160, yy);
    }
    c.stroke(); c.restore();
  }

  function rr(c, x, y, w2, h2, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w2, y, x + w2, y + h2, r); c.arcTo(x + w2, y + h2, x, y + h2, r);
    c.arcTo(x, y + h2, x, y, r); c.arcTo(x, y, x + w2, y, r); c.closePath();
  }

  function drawWorld(c, vb) {
    var th = theme, ink = th.ink, i, o;
    c.lineJoin = 'round'; c.lineCap = 'round';

    // start island
    if (L.start.x > vb.x0 - 200 && L.start.x < vb.x1 + 200) drawIsland(c, L.start.x, L.start.y + 20);

    // moving hook rails
    c.setLineDash([6, 10]); c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,0.55)';
    for (i = 0; i < L.hooks.length; i++) {
      o = L.hooks[i];
      if (!o.moving || o.x < vb.x0 - 300 || o.x > vb.x1 + 300) continue;
      c.beginPath();
      if (o.orb) c.arc(o.x, o.y, o.orb, 0, TAU);
      else { c.moveTo(o.x - o.mx, o.y - o.my); c.lineTo(o.x + o.mx, o.y + o.my); }
      c.stroke();
    }
    for (i = 0; i < L.saws.length; i++) {
      o = L.saws[i];
      if (!o.moving || o.x < vb.x0 - 300 || o.x > vb.x1 + 300) continue;
      c.strokeStyle = 'rgba(40,20,60,0.35)';
      c.beginPath();
      if (o.orb) c.arc(o.x, o.y, o.orb, 0, TAU);
      else { c.moveTo(o.x - o.mx, o.y - o.my); c.lineTo(o.x + o.mx, o.y + o.my); }
      c.stroke();
    }
    c.setLineDash([]);

    if (!L.endless) drawFinish(c, vb);

    // walls
    for (i = 0; i < L.walls.length; i++) {
      o = L.walls[i];
      if (o.x > vb.x1 || o.x + o.w < vb.x0 || o.y > vb.y1 || o.y + o.h < vb.y0) continue;
      var r = Math.min(16, o.w / 2, o.h / 2);
      c.fillStyle = ink; rr(c, o.x - 4, o.y - 4, o.w + 8, o.h + 8, r + 4); c.fill();
      c.fillStyle = th.wall; rr(c, o.x, o.y, o.w, o.h, r); c.fill();
      c.fillStyle = th.wallDark;
      if (o.h > 40) { rr(c, o.x, o.y + o.h * 0.55, o.w, o.h * 0.45, r); c.fill(); c.fillStyle = th.wall; c.fillRect(o.x, o.y + o.h * 0.55 - 1, o.w, Math.min(r, o.h * 0.2)); }
      // texture dots
      c.fillStyle = 'rgba(255,255,255,0.18)';
      for (var dI = 0; dI < 6; dI++) {
        var dx = o.x + 12 + hash(o.id * 13 + dI) * Math.max(0, o.w - 24), dy = o.y + 24 + hash(o.id * 7 + dI * 3) * Math.max(0, o.h - 36);
        if (dy > o.y + o.h - 8) continue;
        c.beginPath(); c.arc(dx, dy, 3 + hash(dI + o.id) * 4, 0, TAU); c.fill();
      }
      c.fillStyle = th.wallTop; rr(c, o.x, o.y, o.w, Math.min(16, o.h), Math.min(r, 8)); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(o.x + 8, o.y + 3, Math.max(0, o.w - 16), 3);
    }

    // speed rings (back half)
    for (i = 0; i < L.rings.length; i++) { o = L.rings[i]; if (o.x > vb.x0 - 100 && o.x < vb.x1 + 100) drawRing(c, o, 0); }

    // bouncy pads
    for (i = 0; i < L.pads.length; i++) {
      o = L.pads[i];
      if (Math.max(o.x1, o.x2) < vb.x0 || Math.min(o.x1, o.x2) > vb.x1) continue;
      drawPad(c, o);
    }
    for (i = 0; i < L.bumpers.length; i++) {
      o = L.bumpers[i];
      if (o.x + o.r < vb.x0 || o.x - o.r > vb.x1) continue;
      var ht = w.t - o.hitT, pop = ht < 0.4 ? 1 + Math.sin(ht * 30) * 0.25 * (1 - ht / 0.4) : 1;
      var br = o.r * pop;
      c.fillStyle = ink; c.beginPath(); c.arc(o.x, o.y, br + 5, 0, TAU); c.fill();
      c.fillStyle = '#ff4fa3'; c.beginPath(); c.arc(o.x, o.y, br, 0, TAU); c.fill();
      c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(o.x, o.y, br * 0.72, 0, TAU); c.fill();
      c.fillStyle = '#fff'; drawStar(c, o.x, o.y, br * 0.45, time * 1.5); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(o.x - br * 0.4, o.y - br * 0.45, br * 0.18, 0, TAU); c.fill();
    }

    // spinners
    for (i = 0; i < L.spinners.length; i++) {
      o = L.spinners[i];
      if (o.x + o.len < vb.x0 || o.x - o.len > vb.x1) continue;
      drawSpinner(c, o);
    }
    // saws
    for (i = 0; i < L.saws.length; i++) {
      o = L.saws[i];
      if (o.cx + o.r < vb.x0 || o.cx - o.r > vb.x1 || o.cy + o.r < vb.y0 || o.cy - o.r > vb.y1) continue;
      drawSaw(c, o);
    }

    // hooks
    var tgt = (w.st === 'play' || w.st === 'ready') && !w.hook ? w.target : null;
    for (i = 0; i < L.hooks.length; i++) {
      o = L.hooks[i];
      if (o.cx < vb.x0 || o.cx > vb.x1 || o.cy < vb.y0 || o.cy > vb.y1) continue;
      drawHook(c, o, o === tgt, o === w.hook);
    }
    // target guide
    if (tgt && w.st !== 'dead' && !attract) {
      c.setLineDash([4, 12]); c.lineDashOffset = -time * 40;
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(w.x, w.y); c.lineTo(tgt.cx, tgt.cy); c.stroke();
      c.setLineDash([]); c.lineDashOffset = 0;
    }

    // trail + rope + player
    if (w.st !== 'dead') {
      drawTrail(c);
      if (w.hook) drawRope(c);
      var sk = SKINS[save.skin] || SKINS[0];
      drawGuyWorld(c, sk);
    }

    // speed rings (front half)
    for (i = 0; i < L.rings.length; i++) { o = L.rings[i]; if (o.x > vb.x0 - 100 && o.x < vb.x1 + 100) drawRing(c, o, 1); }

    drawParts(c);
    drawPops(c, cam.z);
    drawWater(c, vb);

    // ready prompt near player
    if (w.st === 'ready' && !attract && mode === 'play') {
      var a = 0.75 + Math.sin(time * 6) * 0.25;
      c.save(); c.translate(w.x, w.y - 78 + Math.sin(time * 5) * 4); c.scale(1 / cam.z * 0.9, 1 / cam.z * 0.9);
      c.globalAlpha = a;
      c.font = '700 30px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 8; c.strokeStyle = '#2a1747'; c.strokeText('HOLD TO GO!', 0, 0);
      c.fillStyle = '#ffe14d'; c.fillText('HOLD TO GO!', 0, 0);
      c.restore(); c.globalAlpha = 1;
    }
    if (tutorialRelease && w.hook && w.st === 'play' && !attract) {
      var va = Math.atan2(-w.vy, w.vx);
      var good = w.vx > 150 && va > 0.35 && va < 1.3 && w.x > w.hook.cx;
      if (good) {
        c.save(); c.translate(w.x + 20, w.y - 70); c.scale(1.2 / cam.z, 1.2 / cam.z); c.rotate(-0.08);
        c.font = '700 34px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 9; c.strokeStyle = '#2a1747'; c.strokeText('LET GO!', 0, 0);
        c.fillStyle = '#7ff6ff'; c.fillText('LET GO!', 0, 0);
        c.restore();
      }
    }
  }

  function drawIsland(c, x, y) {
    var th = theme;
    c.fillStyle = th.ink;
    c.beginPath(); c.moveTo(x - 74, y - 4); c.quadraticCurveTo(x - 60, y + 90, x, y + 120); c.quadraticCurveTo(x + 60, y + 90, x + 74, y - 4); c.closePath(); c.fill();
    c.fillStyle = th.wallDark;
    c.beginPath(); c.moveTo(x - 68, y); c.quadraticCurveTo(x - 54, y + 84, x, y + 112); c.quadraticCurveTo(x + 54, y + 84, x + 68, y); c.closePath(); c.fill();
    c.fillStyle = th.ink; rr(c, x - 78, y - 8, 156, 26, 13); c.fill();
    c.fillStyle = th.wallTop; rr(c, x - 74, y - 4, 148, 18, 9); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(x - 62, y - 1, 124, 3);
  }

  function drawFinish(c, vb) {
    var x = L.finish;
    if (x < vb.x0 - 60 || x > vb.x1 + 60) return;
    var top = Math.max(vb.y0, -2400), bot = L.sea;
    var g = c.createLinearGradient(x - 140, 0, x + 40, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,160,0.45)');
    c.fillStyle = g; c.fillRect(x - 140, top, 160, bot - top);
    c.fillStyle = theme.ink; c.fillRect(x - 4, top, 48, bot - top);
    var sz = 20;
    for (var y = Math.floor(top / sz) * sz; y < bot; y += sz) {
      var r = (y / sz) & 1;
      c.fillStyle = r ? '#fff' : '#23244a'; c.fillRect(x, y, sz, sz);
      c.fillStyle = r ? '#23244a' : '#fff'; c.fillRect(x + sz, y, sz, sz);
    }
    // flag on the finish line near the top of the level
    var fy = L.def.flagY || 150;
    c.save(); c.translate(x + 40, fy);
    c.fillStyle = theme.ink;
    c.beginPath(); c.moveTo(-2, -6);
    for (var i = 0; i <= 8; i++) c.lineTo(i * 18, -6 + Math.sin(time * 6 - i * 0.7) * 6 * i / 8);
    for (i = 8; i >= 0; i--) c.lineTo(i * 18, 76 + Math.sin(time * 6 - i * 0.7) * 6 * i / 8);
    c.closePath(); c.fill();
    c.fillStyle = '#ff4fa3';
    c.beginPath(); c.moveTo(0, 0);
    for (i = 0; i <= 8; i++) c.lineTo(i * 17, Math.sin(time * 6 - i * 0.7) * 6 * i / 8);
    for (i = 8; i >= 0; i--) c.lineTo(i * 17, 70 + Math.sin(time * 6 - i * 0.7) * 6 * i / 8);
    c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.font = '700 30px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('GOAL', 68, 36 + Math.sin(time * 6 - 3) * 3);
    c.restore();
  }

  function drawHook(c, o, isT, isH) {
    var x = o.cx, y = o.cy, ht = w.t - o.hitT;
    var s = ht >= 0 && ht < 0.35 ? 1 + Math.sin(ht * 28) * 0.3 * (1 - ht / 0.35) : 1;
    if (isT) {
      var p = 0.5 + 0.5 * Math.sin(time * 9);
      c.fillStyle = 'rgba(255,240,120,' + (0.25 + 0.2 * p).toFixed(3) + ')';
      c.beginPath(); c.arc(x, y, 34 + p * 6, 0, TAU); c.fill();
      c.strokeStyle = '#ffe14d'; c.lineWidth = 5;
      for (var k = 0; k < 4; k++) { var a0 = time * 3 + k * TAU / 4; c.beginPath(); c.arc(x, y, 30 + p * 4, a0, a0 + 0.9); c.stroke(); }
    }
    var r = 15 * s;
    c.fillStyle = theme.ink; c.beginPath(); c.arc(x, y, r + 5, 0, TAU); c.fill();
    c.fillStyle = isH || isT ? '#ffe14d' : '#ffffff'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.fillStyle = isH ? '#ff4fa3' : o.moving ? '#1fa8ff' : '#ff4fa3'; c.beginPath(); c.arc(x, y, r * 0.45, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(x - r * 0.4, y - r * 0.45, r * 0.18, 0, TAU); c.fill();
  }

  function drawRope(c) {
    var h = w.hook, hx = w.x + (J[3].x - w.x) * 1.18, hy = w.y + (J[3].y - w.y) * 1.18;
    var ex = hx + (h.cx - hx) * ropeT, ey = hy + (h.cy - hy) * ropeT;
    c.strokeStyle = theme.ink; c.lineWidth = 7; c.beginPath(); c.moveTo(hx, hy); c.lineTo(ex, ey); c.stroke();
    c.strokeStyle = '#fff3c4'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(hx, hy); c.lineTo(ex, ey); c.stroke();
  }

  function drawPad(c, o) {
    var ht = w.t - o.hitT, wob = ht >= 0 && ht < 0.6 ? Math.sin(ht * 34) * 18 * (1 - ht / 0.6) : 0;
    var ex = o.x2 - o.x1, ey = o.y2 - o.y1, len = Math.sqrt(ex * ex + ey * ey);
    var nx = ey / len, ny = -ex / len; // normal
    if (ny > 0) { nx = -nx; ny = -ny; }
    var mx = (o.x1 + o.x2) / 2 - nx * wob, my = (o.y1 + o.y2) / 2 - ny * wob;
    function path() { c.beginPath(); c.moveTo(o.x1, o.y1); c.quadraticCurveTo(2 * mx - (o.x1 + o.x2) / 2, 2 * my - (o.y1 + o.y2) / 2, o.x2, o.y2); }
    path(); c.strokeStyle = theme.ink; c.lineWidth = o.r * 2 + 8; c.stroke();
    path(); c.strokeStyle = '#ff3fa0'; c.lineWidth = o.r * 2; c.stroke();
    c.save(); c.translate(nx * 5, ny * 5); path(); c.strokeStyle = '#ff9ad3'; c.lineWidth = o.r * 0.9; c.stroke(); c.restore();
    c.save(); c.translate(nx * 7, ny * 7); path(); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3; c.stroke(); c.restore();
    // chevrons pointing out of the pad
    var n = Math.max(1, Math.floor(len / 70));
    c.strokeStyle = '#ffe14d'; c.lineWidth = 5;
    for (var i = 0; i < n; i++) {
      var t = (i + 0.5) / n, px = o.x1 + ex * t + nx * (22 + 5 * Math.sin(time * 6 + i)) - nx * wob * (1 - Math.abs(t - 0.5) * 2), py = o.y1 + ey * t + ny * (22 + 5 * Math.sin(time * 6 + i)) - ny * wob * (1 - Math.abs(t - 0.5) * 2);
      c.beginPath(); c.moveTo(px - ny * 9 - nx * 6, py + nx * 9 - ny * 6); c.lineTo(px, py); c.lineTo(px + ny * 9 - nx * 6, py - nx * 9 - ny * 6); c.stroke();
    }
  }

  function drawRing(c, o, front) {
    var ht = w.t - o.hitT, glow = ht >= 0 && ht < 0.5 ? 1 - ht / 0.5 : 0;
    c.save(); c.translate(o.x, o.y); c.rotate(o.ang);
    var ry = o.r + glow * 12, rx = 18 + glow * 4;
    var a0 = front ? -Math.PI / 2 : Math.PI / 2, a1 = a0 + Math.PI;
    c.lineWidth = 16; c.strokeStyle = theme.ink; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, a0, a1); c.stroke();
    c.lineWidth = 9; c.strokeStyle = front ? '#ffb000' : '#e08a00'; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, a0, a1); c.stroke();
    c.lineWidth = 3; c.strokeStyle = '#fff6b0'; c.beginPath(); c.ellipse(-2, 0, rx, ry - 3, 0, a0, a1); c.stroke();
    if (!front) {
      // chevrons inside
      c.strokeStyle = 'rgba(255,255,255,' + (0.55 + 0.35 * Math.sin(time * 8)).toFixed(3) + ')'; c.lineWidth = 6;
      for (var i = 0; i < 3; i++) {
        var px = -30 + i * 22 + ((time * 60) % 22);
        c.beginPath(); c.moveTo(px - 10, -14); c.lineTo(px, 0); c.lineTo(px - 10, 14); c.stroke();
      }
    }
    c.restore();
  }

  function drawSaw(c, o) {
    var x = o.cx, y = o.cy, r = o.r, rot = time * 9;
    c.save(); c.translate(x, y);
    c.rotate(rot);
    c.fillStyle = theme.ink;
    c.beginPath();
    var n = 12;
    for (var i = 0; i < n * 2; i++) { var a = i * Math.PI / n, rr2 = i % 2 ? r * 0.78 : r + 5; c.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
    c.closePath(); c.fill();
    c.fillStyle = '#d7deee';
    c.beginPath();
    for (i = 0; i < n * 2; i++) { a = i * Math.PI / n; rr2 = i % 2 ? r * 0.74 : r; c.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
    c.closePath(); c.fill();
    c.fillStyle = '#aab5cc'; c.beginPath(); c.arc(0, 0, r * 0.62, 0, TAU); c.fill();
    c.rotate(-rot);
    // grumpy face
    c.fillStyle = '#ff5a5f'; c.beginPath(); c.arc(0, 0, r * 0.5, 0, TAU); c.fill();
    c.strokeStyle = theme.ink; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(-r * 0.2, -r * 0.06, r * 0.13, 0, TAU); c.arc(r * 0.2, -r * 0.06, r * 0.13, 0, TAU); c.fill();
    c.fillStyle = theme.ink;
    c.beginPath(); c.arc(-r * 0.18, -r * 0.03, r * 0.06, 0, TAU); c.arc(r * 0.18, -r * 0.03, r * 0.06, 0, TAU); c.fill();
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(-r * 0.36, -r * 0.3); c.lineTo(-r * 0.08, -r * 0.18); c.moveTo(r * 0.36, -r * 0.3); c.lineTo(r * 0.08, -r * 0.18); c.stroke();
    c.beginPath(); c.arc(0, r * 0.28, r * 0.12, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.restore();
  }

  function drawSpinner(c, o) {
    c.save(); c.translate(o.x, o.y);
    for (var k = 0; k < o.arms; k++) {
      var a = o.ang + k * TAU / o.arms;
      var ex = Math.cos(a) * o.len, ey = Math.sin(a) * o.len;
      c.lineCap = 'round';
      c.strokeStyle = theme.ink; c.lineWidth = 26; c.beginPath(); c.moveTo(0, 0); c.lineTo(ex, ey); c.stroke();
      c.strokeStyle = '#ff5a5f'; c.lineWidth = 17; c.beginPath(); c.moveTo(0, 0); c.lineTo(ex, ey); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 17; c.lineCap = 'butt'; c.setLineDash([10, 12]);
      c.beginPath(); c.moveTo(Math.cos(a) * 14, Math.sin(a) * 14); c.lineTo(ex * 0.97, ey * 0.97); c.stroke();
      c.setLineDash([]); c.lineCap = 'round';
      // spiky tip
      c.fillStyle = '#ffe14d'; c.strokeStyle = theme.ink; c.lineWidth = 3;
      drawStar(c, ex, ey, 15, time * 4); c.fill(); c.stroke();
    }
    c.fillStyle = theme.ink; c.beginPath(); c.arc(0, 0, 20, 0, TAU); c.fill();
    c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill();
    c.fillStyle = theme.ink; c.beginPath(); c.arc(0, 0, 5, 0, TAU); c.fill();
    c.restore();
  }

  function drawWater(c, vb) {
    var top = L.sea - 22;
    if (top > vb.y1) return;
    var x0 = Math.floor(vb.x0 / 40) * 40, x1 = vb.x1 + 40;
    c.fillStyle = theme.seaTop;
    c.beginPath(); c.moveTo(x0, vb.y1 + 200);
    for (var x = x0; x <= x1; x += 40) c.lineTo(x, top - 8 + Math.sin(x * 0.02 + time * 2.4) * 7);
    c.lineTo(x1, vb.y1 + 200); c.closePath(); c.fill();
    c.fillStyle = theme.sea;
    c.beginPath(); c.moveTo(x0, vb.y1 + 200);
    for (x = x0; x <= x1; x += 40) c.lineTo(x, top + 6 + Math.sin(x * 0.017 - time * 2) * 7);
    c.lineTo(x1, vb.y1 + 200); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (x = x0; x <= x1; x += 160) {
      var sx = x + ((time * 30) % 160);
      c.fillRect(sx, top + 40 + Math.sin(x) * 16, 50, 5);
    }
  }

  function trailColor(style, k, n, idx) {
    switch (style) {
      case 1: return 'hsl(' + ((idx * 16 - time * 300) % 360 + 360) % 360 + ',100%,60%)';
      case 2: return k / n > 0.6 ? '#fff27a' : k / n > 0.3 ? '#ffae2b' : '#ff4a1f';
      case 4: return (idx >> 1) % 2 ? '#ffffff' : '#ff4fa3';
      case 5: return '#7ff6ff';
      case 6: return '#fff6b0';
      case 7: return '#ffd21f';
      default: return 'rgba(255,255,255,0.85)';
    }
  }
  function drawTrail(c) {
    if (trailN < 3) return;
    var style = save.trail;
    var n = trailN, start = (trailI - n + TN) % TN;
    if (style === 3) {
      for (var b = 0; b < n; b += 2) {
        var q = trail[(start + b) % TN], kb = b / n;
        c.strokeStyle = 'rgba(160,240,255,' + (0.3 + kb * 0.6).toFixed(2) + ')'; c.lineWidth = 3;
        c.beginPath(); c.arc(q.x + Math.sin(b * 1.7 + time * 5) * 6, q.y + Math.cos(b * 1.3) * 6, 3 + kb * 9, 0, TAU); c.stroke();
      }
      return;
    }
    c.lineCap = 'round';
    if (style === 5) {
      c.globalAlpha = 0.35;
      for (var i0 = 1; i0 < n; i0++) {
        var a0 = trail[(start + i0 - 1) % TN], b0 = trail[(start + i0) % TN];
        c.strokeStyle = '#ff3fd8'; c.lineWidth = 6 + 22 * i0 / n;
        c.beginPath(); c.moveTo(a0.x, a0.y); c.lineTo(b0.x, b0.y); c.stroke();
      }
      c.globalAlpha = 1;
    }
    for (var i = 1; i < n; i++) {
      var a = trail[(start + i - 1) % TN], p = trail[(start + i) % TN], k = i / n;
      c.globalAlpha = style === 0 ? k * 0.8 : Math.min(1, 0.25 + k);
      c.strokeStyle = trailColor(style, i, n, i + trailI);
      c.lineWidth = 2 + 16 * k;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(p.x, p.y); c.stroke();
    }
    c.globalAlpha = 1;
  }

  function drawGuyWorld(c, sk) {
    var bx = w.x, by = w.y + (w.st === 'ready' ? bob() : 0), ang = w.ang;
    var co = Math.cos(-ang), si = Math.sin(-ang);
    for (var i = 0; i < 8; i++) {
      var dx = J[i].x - bx, dy = J[i].y - by;
      LOCAL[i * 2] = dx * co - dy * si; LOCAL[i * 2 + 1] = dx * si + dy * co;
    }
    // look direction in local space
    var sp = Sim.speed(w), lx = 0, ly = 0;
    if (w.hook) { lx = w.hook.cx - bx; ly = w.hook.cy - by; }
    else if (sp > 50) { lx = w.vx; ly = w.vy; }
    else if (w.target) { lx = w.target.cx - bx; ly = w.target.cy - by; }
    var ll = Math.sqrt(lx * lx + ly * ly) || 1;
    var llx = (lx * co - ly * si) / ll, lly = (lx * si + ly * co) / ll;
    var face = w.st === 'won' ? 'yay' : sp > 1300 ? 'wow' : 'happy';
    c.save(); c.translate(bx, by); c.scale(1.18, 1.18); c.translate(-bx, -by);
    drawGuy(c, bx, by, ang, sk, LOCAL, { sq: squash, lx: llx, ly: lly, face: face, blink: blinkT < 0 });
    c.restore();
  }

  // Draw the stick figure. J = 16 numbers of local joint coords.
  function drawGuy(c, x, y, ang, sk, Jl, o) {
    c.save(); c.translate(x, y); c.rotate(ang);
    var s = o.sq || 0; c.scale(1 - s * 0.55, 1 + s);
    c.lineCap = 'round'; c.lineJoin = 'round';
    var ink = '#23163f';
    function limb(ax, ay, i, lw, col) {
      c.strokeStyle = col; c.lineWidth = lw;
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(Jl[i * 2], Jl[i * 2 + 1]); c.lineTo(Jl[i * 2 + 2], Jl[i * 2 + 3]); c.stroke();
    }
    // outlines
    limb(0, -12, 0, 11, ink); limb(-3, 12, 4, 11, ink); limb(3, 12, 6, 11, ink); limb(0, -12, 2, 11, ink);
    c.strokeStyle = ink; c.lineWidth = 14; c.beginPath(); c.moveTo(0, -12); c.lineTo(0, 12); c.stroke();
    c.fillStyle = ink; c.beginPath(); c.arc(0, -25, 15.5, 0, TAU); c.fill();
    // back limbs darker
    c.globalAlpha = 1;
    limb(0, -12, 0, 6.5, shade(sk.col)); limb(-3, 12, 4, 6.5, shade(sk.col));
    c.strokeStyle = sk.col; c.lineWidth = 9; c.beginPath(); c.moveTo(0, -12); c.lineTo(0, 12); c.stroke();
    limb(3, 12, 6, 6.5, sk.col); limb(0, -12, 2, 6.5, sk.col);
    // hands & feet dots
    c.fillStyle = sk.head;
    c.beginPath(); c.arc(Jl[2], Jl[3], 3.6, 0, TAU); c.arc(Jl[6], Jl[7], 3.6, 0, TAU); c.fill();
    // head
    c.fillStyle = sk.head; c.beginPath(); c.arc(0, -25, 12.5, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.arc(-5, -31, 3.5, 0, TAU); c.fill();
    drawAccessory(c, sk, 'back');
    // face
    var ex = (o.lx || 0) * 1.6, ey = (o.ly || 0) * 1.6;
    if (sk.acc === 'shades') {
      c.fillStyle = ink; rr(c, -10, -30, 9, 7, 3); c.fill(); rr(c, 1, -30, 9, 7, 3); c.fill(); c.fillRect(-2, -29, 4, 2);
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(-8, -29, 3, 2); c.fillRect(3, -29, 3, 2);
    } else {
      var eyeCol = sk.acc === 'galaxy' ? '#7ff6ff' : '#fff';
      if (o.blink) {
        c.strokeStyle = ink; c.lineWidth = 2; c.beginPath(); c.moveTo(-7.5, -26); c.lineTo(-2, -26); c.moveTo(2, -26); c.lineTo(7.5, -26); c.stroke();
      } else {
        c.fillStyle = eyeCol; c.beginPath(); c.arc(-4.6, -26.5, 4, 0, TAU); c.arc(4.6, -26.5, 4, 0, TAU); c.fill();
        c.strokeStyle = ink; c.lineWidth = 1.4; c.beginPath(); c.arc(-4.6, -26.5, 4, 0, TAU); c.stroke(); c.beginPath(); c.arc(4.6, -26.5, 4, 0, TAU); c.stroke();
        c.fillStyle = ink; c.beginPath(); c.arc(-4.6 + ex, -26.5 + ey, 2.1, 0, TAU); c.arc(4.6 + ex, -26.5 + ey, 2.1, 0, TAU); c.fill();
      }
    }
    c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 2;
    if (o.face === 'wow') { c.beginPath(); c.ellipse(0, -18.5, 2.6, 3.4, 0, 0, TAU); c.fill(); }
    else if (o.face === 'yay') { c.beginPath(); c.arc(0, -20, 4.5, 0, Math.PI); c.closePath(); c.fill(); }
    else { c.beginPath(); c.arc(0, -21, 4, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); }
    // cheeks
    c.fillStyle = 'rgba(255,90,140,0.35)'; c.beginPath(); c.arc(-8, -21, 2.2, 0, TAU); c.arc(8, -21, 2.2, 0, TAU); c.fill();
    drawAccessory(c, sk, 'front');
    c.restore();
  }
  var shadeCache = {};
  function shade(hex) {
    if (shadeCache[hex]) return shadeCache[hex];
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var out = 'rgb(' + Math.round(r * 0.72) + ',' + Math.round(g * 0.72) + ',' + Math.round(b * 0.72) + ')';
    shadeCache[hex] = out; return out;
  }
  function drawAccessory(c, sk, layer) {
    var ink = '#23163f', a = sk.acc;
    c.lineWidth = 2.5; c.strokeStyle = ink;
    if (layer === 'back') {
      if (a === 'band') {
        c.fillStyle = sk.ac;
        c.beginPath(); c.moveTo(-11, -30); c.quadraticCurveTo(-22, -28 + Math.sin(time * 14) * 3, -27, -22 + Math.sin(time * 14 + 1) * 4); c.lineTo(-24, -19); c.quadraticCurveTo(-19, -26, -11, -26); c.closePath(); c.fill(); c.stroke();
      } else if (a === 'galaxy') {
        c.fillStyle = '#fff';
        for (var i = 0; i < 5; i++) c.fillRect(-8 + hash(i) * 16, -35 + hash(i + 9) * 8, 1.6, 1.6);
      } else if (a === 'tiger') {
        c.strokeStyle = sk.ac; c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(-3, -37.5); c.lineTo(-2, -33); c.moveTo(3, -37.5); c.lineTo(2, -33); c.moveTo(-11, -30); c.lineTo(-7, -29); c.moveTo(11, -30); c.lineTo(7, -29); c.stroke();
      }
      return;
    }
    if (a === 'bow') {
      c.fillStyle = sk.ac;
      c.beginPath(); c.moveTo(6, -36); c.lineTo(14, -42); c.lineTo(15, -32); c.closePath(); c.moveTo(6, -36); c.lineTo(-1, -43); c.lineTo(-2, -33); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.arc(6, -36, 2.6, 0, TAU); c.fill(); c.stroke();
    } else if (a === 'cap') {
      c.fillStyle = sk.ac;
      c.beginPath(); c.arc(0, -28, 12.5, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(8, -30); c.lineTo(21, -29); c.lineTo(20, -26); c.lineTo(8, -27); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -39, 2.2, 0, TAU); c.fill();
    } else if (a === 'sprout') {
      c.strokeStyle = '#1f8a3e'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, -37); c.quadraticCurveTo(1, -43, -1, -46); c.stroke();
      c.fillStyle = sk.ac; c.strokeStyle = ink; c.lineWidth = 2;
      c.beginPath(); c.ellipse(-6, -46, 6, 3.2, -0.4, 0, TAU); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(5, -47, 6, 3.2, 0.5, 0, TAU); c.fill(); c.stroke();
    } else if (a === 'ears' || a === 'tiger') {
      c.fillStyle = a === 'tiger' ? sk.col : sk.col;
      c.beginPath(); c.moveTo(-11, -31); c.lineTo(-10, -44); c.lineTo(-3, -36.5); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(11, -31); c.lineTo(10, -44); c.lineTo(3, -36.5); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ffb3d9'; c.beginPath(); c.moveTo(-9, -34); c.lineTo(-9, -40); c.lineTo(-5.5, -36.5); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(9, -34); c.lineTo(9, -40); c.lineTo(5.5, -36.5); c.closePath(); c.fill();
    } else if (a === 'band') {
      c.fillStyle = sk.ac; c.beginPath(); c.rect(-12.5, -33, 25, 5); c.fill(); c.stroke();
    } else if (a === 'antenna') {
      c.beginPath(); c.moveTo(0, -37); c.lineTo(0, -47); c.stroke();
      c.fillStyle = (Math.sin(time * 6) > 0) ? sk.ac : '#ffe14d'; c.beginPath(); c.arc(0, -49, 3.6, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#9aa6c2'; c.fillRect(-14.5, -28, 3, 6); c.fillRect(11.5, -28, 3, 6);
    } else if (a === 'crown') {
      c.fillStyle = sk.ac;
      c.beginPath(); c.moveTo(-10, -34); c.lineTo(-11, -46); c.lineTo(-5, -40); c.lineTo(0, -48); c.lineTo(5, -40); c.lineTo(11, -46); c.lineTo(10, -34); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ff4fa3'; c.beginPath(); c.arc(0, -38, 2, 0, TAU); c.fill();
    }
  }

  /* -------------------------------------------------------------------- HUD */
  function panel(c, x, y, w2, h2) {
    c.fillStyle = 'rgba(35,22,80,0.55)'; rr(c, x, y, w2, h2, 18); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 3; c.stroke();
  }
  function text(c, s, x, y, size, col, align) {
    c.font = '700 ' + size + 'px ' + FONT; c.textAlign = align || 'left'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = Math.max(4, size * 0.22); c.strokeStyle = '#2a1747'; c.strokeText(s, x, y);
    c.fillStyle = col || '#fff'; c.fillText(s, x, y);
  }
  function hudStar(c, x, y, r, on) {
    c.fillStyle = '#2a1747'; drawStar(c, x, y, r + 3, 0); c.fill();
    c.fillStyle = on ? '#ffd21f' : 'rgba(255,255,255,0.25)'; drawStar(c, x, y, r, 0); c.fill();
  }
  function drawHUD(c) {
    if (endless) {
      var d = dist();
      text(c, d + ' m', W / 2, 46, 52, '#fff', 'center');
      if (save.endless > 0) text(c, 'BEST ' + save.endless + ' m', W / 2, 92, 22, '#ffe14d', 'center');
      if (w.flips) text(c, '↻ ' + w.flips, 30, 40, 30, '#7ff6ff');
    } else {
      var def = LEVELS[lvl];
      panel(c, 14, 12, 382, 96);
      text(c, (worldOf(lvl) + 1) + '-' + (lvl % 6 + 1), 32, 40, 30, '#ffe14d');
      text(c, def.name, 92, 40, 26, '#fff');
      var t = w.timer, underPar = t <= def.par;
      text(c, t.toFixed(1) + 's', 32, 82, 26, underPar ? '#9dff6b' : '#fff');
      text(c, '/ ' + def.par + 's', 112, 82, 18, 'rgba(255,255,255,0.75)');
      var fOk = w.flips >= def.flips;
      text(c, '↻ ' + w.flips + '/' + def.flips, 200, 82, 26, fOk ? '#9dff6b' : '#fff');
      var bits = starBits(lvl);
      hudStar(c, 318, 82, 11, w.st === 'won' || (bits & 1));
      hudStar(c, 346, 82, 11, underPar && w.st !== 'ready' || (bits & 2));
      hudStar(c, 374, 82, 11, fOk || (bits & 4));
      if (w.st === 'ready' && readyT < 3 && def.hint) {
        var a = Math.min(1, readyT * 3);
        c.globalAlpha = a;
        var tw = Math.min(900, def.hint.length * 17 + 80);
        panel(c, W / 2 - tw / 2, H - 110, tw, 64);
        text(c, def.hint, W / 2, H - 78, 28, '#fff', 'center');
        c.globalAlpha = 1;
      }
      if (w.st === 'ready' && readyT < 1.6) {
        var k = Math.min(1, readyT * 4), out = readyT > 1.2 ? (readyT - 1.2) / 0.4 : 0;
        c.save(); c.globalAlpha = 1 - out; c.translate(W / 2, 170 - out * 40); c.scale(0.6 + 0.4 * k + Math.sin(readyT * 20) * 0.02 * (1 - k), 0.6 + 0.4 * k);
        text(c, 'LEVEL ' + (lvl + 1), 0, -34, 30, '#ffe14d', 'center');
        text(c, def.name.toUpperCase(), 0, 16, 64, '#fff', 'center');
        c.restore(); c.globalAlpha = 1;
      }
    }
    if (stuckT > 1.8 && w.st === 'play') {
      text(c, w.hook ? 'Stuck? Let go, or press R to restart' : 'Stuck? Press R to restart', W / 2, H - 40, 26, '#fff', 'center');
    }
  }

  /* ------------------------------------------------------------------ menus */
  var screens = ['title', 'levels', 'style', 'pause', 'result'];
  function setMode(m) {
    mode = m;
    screens.forEach(function (s) { $('scr-' + s).hidden = s !== m; });
    $('pauseBtn').hidden = m !== 'play';
    if (m === 'title') refreshTitle();
    if (m !== 'play') holdMouse = false;
  }
  function pause() { if (mode !== 'play') return; sfx.click(); setMode('pause'); updateWind(0, false); }
  function resume() { sfx.click(); setMode('play'); needFresh = holdInput(); }
  function toTitle() { attract = false; w = null; setMode('title'); }

  function refreshTitle() {
    var ts = totalStars(), done = 0;
    for (var i = 0; i < LEVELS.length; i++) if (starBits(i)) done++;
    $('titleProgress').innerHTML = '<span class="st">★ ' + ts + ' / ' + MAXSTARS + '</span> &nbsp;·&nbsp; Levels ' + done + ' / ' + LEVELS.length + (save.endless ? ' &nbsp;·&nbsp; Endless best ' + save.endless + ' m' : '');
    var eb = $('btnEndless');
    eb.classList.toggle('locked', !endlessUnlocked());
    eb.textContent = endlessUnlocked() ? 'Endless' : 'Endless 🔒';
    $('styleNew').hidden = !hasNewStyle();
    $('btnPlay').textContent = done === 0 ? '▶ PLAY' : '▶ PLAY ' + (nextLevelIndex() + 1);
  }
  function endlessUnlocked() { return !!(starBits(5)) || save.unlocked > 6; }
  function hasNewStyle() {
    var ts = totalStars(), ns = 0, nt = 0;
    SKINS.forEach(function (s, i) { if (s.req <= ts) ns = i + 1; });
    TRAILS.forEach(function (s, i) { if (s.req <= ts) nt = i + 1; });
    return ns > save.seenSkin || nt > save.seenTrail;
  }
  function nextLevelIndex() {
    // first unfinished level, else the last unlocked one
    for (var k = 0; k < save.unlocked && k < LEVELS.length; k++) if (!starBits(k)) return k;
    return Math.min(save.unlocked, LEVELS.length) - 1;
  }
  function playNext() { startLevel(nextLevelIndex()); }

  function btn(id, fn) {
    $(id).addEventListener('click', function (e) { e.preventDefault(); A.unlock(); sfx.click(); fn(); this.blur(); });
  }
  btn('btnPlay', playNext);
  btn('btnLevels', function () { openLevels(worldOf(Math.min(save.unlocked, LEVELS.length) - 1)); });
  btn('btnStyle', openStyle);
  btn('btnEndless', function () {
    if (endlessUnlocked()) startEndless();
    else { var b = $('btnEndless'); b.textContent = 'Beat level 6!'; setTimeout(function () { if (mode === 'title') refreshTitle(); }, 1400); }
  });
  btn('pauseBtn', pause);
  btn('psResume', resume);
  btn('psRestart', restart);
  btn('psLevels', function () { toTitle(); openLevels(endless ? 0 : worldOf(lvl)); });
  btn('psMenu', toTitle);
  btn('lvBack', toTitle);
  btn('stBack', toTitle);
  btn('lvPrev', function () { if (curWorld > 0) openLevels(curWorld - 1); });
  btn('lvNext', function () { if (curWorld < THEMES.length - 1) openLevels(curWorld + 1); });
  btn('rsReplay', function () { if (endless) startEndless(); else startLevel(lvl); });
  btn('rsLevels', function () { if (endless) toTitle(); else { toTitle(); openLevels(worldOf(lvl)); } });
  btn('rsNext', function () {
    if (endless) startEndless();
    else if (lvl + 1 < LEVELS.length) startLevel(lvl + 1);
    else if (endlessUnlocked()) startEndless();
    else toTitle();
  });

  var curWorld = 0;
  function openLevels(wi) {
    curWorld = Kit.clamp(wi, 0, THEMES.length - 1);
    if (!attract) startAttract();
    setMode('levels');
    var ts = totalStars();
    $('lvStars').textContent = '★ ' + ts + ' / ' + MAXSTARS;
    $('lvWorldName').textContent = 'World ' + (curWorld + 1) + ': ' + WORLD_NAMES[curWorld];
    var g = $('lvGrid'); g.innerHTML = '';
    var nextI = -1;
    for (var k = 0; k < save.unlocked && k < LEVELS.length; k++) if (!starBits(k)) { nextI = k; break; }
    for (var i = curWorld * 6; i < curWorld * 6 + 6 && i < LEVELS.length; i++) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'tile';
      b.style.setProperty('--tc', THEMES[curWorld].tile);
      var locked = i >= save.unlocked;
      if (locked) b.classList.add('lock');
      if (i === nextI) b.classList.add('next');
      var bits = starBits(i), st = '';
      for (var s = 0; s < 3; s++) st += (bits >> s) & 1 ? '<i>★</i>' : '★';
      b.innerHTML = '<span class="num">' + (i + 1) + '</span><span class="nm">' + (locked ? '???' : LEVELS[i].name) + '</span><span class="ts">' + st + '</span>' + (locked ? '<span class="lk"></span>' : '');
      (function (idx, lk) {
        b.addEventListener('click', function () { if (lk) { sfx.thud(600); return; } A.unlock(); sfx.click(); startLevel(idx); });
      })(i, locked);
      g.appendChild(b);
    }
    $('lvPrev').disabled = curWorld === 0;
    $('lvNext').disabled = curWorld === THEMES.length - 1;
    var dots = $('lvDots'); dots.innerHTML = '';
    for (var d = 0; d < THEMES.length; d++) { var sp = document.createElement('span'); if (d === curWorld) sp.className = 'on'; dots.appendChild(sp); }
    theme = THEMES[curWorld];
    save.lastWorld = curWorld;
  }

  function previewCanvas(wd, ht) {
    var cv = document.createElement('canvas');
    cv.width = wd * 2; cv.height = ht * 2;
    return cv;
  }
  function drawSkinPreview(cv, sk) {
    var c = cv.getContext('2d');
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    var pose = POSES.cheer, Jl = pose.slice(), sz = cv.width / 2, k = sz / 88;
    c.save(); c.translate(sz / 2, sz / 2 + 14 * k); c.scale(1.35 * k, 1.35 * k);
    drawGuy(c, 0, 0, 0, sk, Jl, { sq: 0, lx: 0.3, ly: 0.2, face: 'yay' });
    c.restore();
  }
  function drawTrailPreview(cv, ti) {
    var c = cv.getContext('2d');
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    var old = save.trail, oN = trailN, oI = trailI, keep = trail.map(function (p) { return { x: p.x, y: p.y }; });
    save.trail = ti; trailN = TN; trailI = 0;
    var pw = cv.width / 2, ph = cv.height / 2;
    for (var i = 0; i < TN; i++) { trail[i].x = 6 + i * (pw - 14) / TN; trail[i].y = ph / 2 + Math.sin(i * 0.25) * ph * 0.26; }
    c.save(); c.scale(1, 1); drawTrail(c); c.restore();
    if (ti === 6 || ti === 7) { c.fillStyle = ti === 7 ? '#ffd21f' : '#fff'; for (var k = 0; k < 4; k++) { drawStar(c, 20 + k * 22, 20 + (k % 2) * 30, 4, 0); c.fill(); } }
    if (ti === 2) { c.fillStyle = '#ffb000'; for (k = 0; k < 5; k++) { c.beginPath(); c.arc(14 + k * 18, 30 + (k % 3) * 10, 2.5, 0, TAU); c.fill(); } }
    save.trail = old; trailN = oN; trailI = oI; keep.forEach(function (p, j) { trail[j].x = p.x; trail[j].y = p.y; });
  }

  function openStyle() {
    if (!attract) startAttract();
    setMode('style');
    var ts = totalStars();
    $('stStars').textContent = '★ ' + ts + ' / ' + MAXSTARS;
    var prevSeenS = save.seenSkin, prevSeenT = save.seenTrail;
    var sk = $('stSkins'); sk.innerHTML = '';
    SKINS.forEach(function (s, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'skin';
      var locked = s.req > ts;
      if (locked) b.classList.add('lock');
      if (i === save.skin) b.classList.add('sel');
      var cv = previewCanvas(76, 76); drawSkinPreview(cv, s);
      b.appendChild(cv);
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = s.name; b.appendChild(nm);
      if (locked) { var rq = document.createElement('span'); rq.className = 'req'; rq.textContent = '★ ' + s.req; b.appendChild(rq); }
      else if (i >= prevSeenS && i > 0) { var nw = document.createElement('span'); nw.className = 'isnew'; nw.textContent = 'NEW'; b.appendChild(nw); }
      b.addEventListener('click', function () {
        if (locked) { sfx.thud(600); return; }
        save.skin = i; persist(); sfx.star(1);
        Array.prototype.forEach.call(sk.children, function (el, j) { el.classList.toggle('sel', j === i); });
      });
      sk.appendChild(b);
      if (!locked) save.seenSkin = Math.max(save.seenSkin, i + 1);
    });
    var tr = $('stTrails'); tr.innerHTML = '';
    TRAILS.forEach(function (s, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'skin';
      var locked = s.req > ts;
      if (locked) b.classList.add('lock');
      if (i === save.trail) b.classList.add('sel');
      var cv = previewCanvas(100, 64); drawTrailPreview(cv, i);
      b.appendChild(cv);
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = s.name; b.appendChild(nm);
      if (locked) { var rq = document.createElement('span'); rq.className = 'req'; rq.style.top = '22px'; rq.textContent = '★ ' + s.req; b.appendChild(rq); }
      else if (i >= prevSeenT && i > 0) { var nw = document.createElement('span'); nw.className = 'isnew'; nw.textContent = 'NEW'; b.appendChild(nw); }
      b.addEventListener('click', function () {
        if (locked) { sfx.thud(600); return; }
        save.trail = i; persist(); sfx.star(2);
        Array.prototype.forEach.call(tr.children, function (el, j) { el.classList.toggle('sel', j === i); });
      });
      tr.appendChild(b);
      if (!locked) save.seenTrail = Math.max(save.seenTrail, i + 1);
    });
    persist();
  }

  /* ----------------------------------------------------------------- result */
  var resultReady = 0;
  var STAR_SVG = '<svg viewBox="-50 -50 100 100"><path d="M0,-46 L13,-16 L45,-14 L20,7 L28,40 L0,22 L-28,40 L-20,7 L-45,-14 L-13,-16 Z" fill="FILL" stroke="#2a1747" stroke-width="7" stroke-linejoin="round"/><path d="M-6,-30 L-12,-16 L-28,-14" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="5" stroke-linecap="round"/></svg>';
  function showResult() {
    var def = LEVELS[lvl], t = w.timer, f = w.flips;
    var got = 1 | (t <= def.par ? 2 : 0) | (f >= def.flips ? 4 : 0);
    var before = totalStars(), prev = starBits(lvl);
    save.stars[lvl] = prev | got;
    var best = save.best[lvl], newBest = false;
    if (!best) { save.best[lvl] = { t: t, f: f }; if (prev) newBest = true; }
    else {
      if (t < best.t - 0.005) { best.t = t; newBest = true; }
      if (f > best.f) best.f = f;
    }
    if (lvl + 2 > save.unlocked) save.unlocked = Math.min(LEVELS.length, lvl + 2);
    var after = totalStars();
    persist();
    setMode('result');
    resultReady = 0.5;
    $('rsBest').hidden = !newBest;
    $('rsBest').textContent = 'NEW BEST!';
    var n = popcount(got);
    $('rsTitle').textContent = lvl === LEVELS.length - 1 ? 'YOU WIN!' : lvl % 6 === 5 ? 'World Clear!' : n === 3 ? 'PERFECT!' : n === 2 ? 'Great Swing!' : 'Level Clear!';
    var labels = ['Finish', '≤ ' + def.par + 's', def.flips + (def.flips === 1 ? ' flip' : ' flips')];
    var html = '';
    for (var i = 0; i < 3; i++) {
      var on = (got >> i) & 1;
      html += '<div class="rs-star' + (i === 1 ? ' mid' : '') + (on ? ' got' : '') + '" id="rsS' + i + '">' + STAR_SVG.replace('FILL', on ? '#ffd21f' : 'rgba(255,255,255,0.18)') + '<span class="lb">' + labels[i] + '</span></div>';
    }
    $('rsStars').innerHTML = html;
    $('rsStars').hidden = false;
    var b2 = save.best[lvl];
    $('rsStats').innerHTML = '<div>Time<br><b>' + t.toFixed(2) + 's</b><span class="pb">best ' + b2.t.toFixed(2) + 's</span></div>' +
      '<div>Flips<br><b>' + f + '</b><span class="pb">best ' + b2.f + '</span></div>' +
      '<div>Stars<br><b>★ ' + after + '</b><span class="pb">of ' + MAXSTARS + '</span></div>';
    [0, 1, 2].forEach(function (i) {
      setTimeout(function () {
        var el = $('rsS' + i); if (!el || mode !== 'result') return;
        el.classList.add('show');
        if ((got >> i) & 1) sfx.star(i);
      }, 250 + i * 280);
    });
    showUnlocks(before, after, lvl);
    $('rsNext').textContent = lvl + 1 < LEVELS.length ? 'Next ▶' : 'Endless ▶';
    $('rsReplay').hidden = false;
    $('rsLevels').textContent = 'Levels';
    $('rsHint').innerHTML = '<span class="sg-key">Enter</span> next · <span class="sg-key">R</span> replay';
    if (n === 3) setTimeout(function () { if (mode === 'result') { confetti(w.x, w.y - 200, 60); } }, 1000);
  }
  function showUnlocks(before, after, li) {
    var box = $('rsUnlock'), items = [];
    SKINS.forEach(function (s) { if (s.req > before && s.req <= after) items.push({ kind: 'skin', s: s }); });
    TRAILS.forEach(function (s, i) { if (s.req > before && s.req <= after) items.push({ kind: 'trail', s: s, i: i }); });
    if (li === 5 && before !== after && save.unlocked >= 7 && !save.seenEndless) { items.push({ kind: 'endless' }); save.seenEndless = 1; }
    if (!items.length) { box.hidden = true; return; }
    var it = items[0];
    box.innerHTML = '';
    var cv = previewCanvas(60, 60);
    if (it.kind === 'skin') drawSkinPreview(cv, it.s);
    else if (it.kind === 'trail') drawTrailPreview(cv, it.i);
    else { cv.getContext('2d').font = '700 60px sans-serif'; cv.getContext('2d').fillText('∞', 28, 80); }
    box.appendChild(cv);
    var tx = document.createElement('div');
    tx.innerHTML = it.kind === 'endless' ? 'ENDLESS MODE unlocked!<small>How far can you swing?</small>' :
      'NEW ' + (it.kind === 'skin' ? 'SKIN' : 'TRAIL') + ': ' + it.s.name + '!' + '<small>' + (items.length > 1 ? '+' + (items.length - 1) + ' more · ' : '') + 'Click to use it!</small>';
    box.appendChild(tx);
    box.onclick = function () {
      if (it.kind === 'skin') save.skin = SKINS.indexOf(it.s);
      else if (it.kind === 'trail') save.trail = it.i;
      else return;
      persist(); sfx.star(2);
      tx.querySelector('small').textContent = 'Equipped!';
    };
    box.hidden = false;
    setTimeout(function () { if (mode === 'result') sfx.unlock(); }, 950);
  }
  function endlessOver() {
    var d = dist(), prev = save.endless, nb = d > prev;
    if (nb) save.endless = d;
    persist();
    setMode('result');
    resultReady = 0.6;
    $('rsBest').hidden = !nb || prev === 0;
    $('rsTitle').textContent = w.deadKind === 'splash' ? 'SPLASH!' : 'BONK!';
    $('rsStars').hidden = true;
    $('rsStats').innerHTML = '<div>Distance<br><b class="big-num">' + d + ' m</b><span class="pb">best ' + save.endless + ' m</span></div><div>Flips<br><b>' + w.flips + '</b></div>';
    $('rsUnlock').hidden = true;
    $('rsNext').textContent = '↻ Again';
    $('rsReplay').hidden = true;
    $('rsLevels').textContent = 'Menu';
    $('rsHint').innerHTML = '<span class="sg-key">Enter</span> or <span class="sg-key">R</span> play again';
    if (nb && prev > 0) { sfx.win(); confetti(w.x, w.y - 300, 70); }
  }

  document.addEventListener('visibilitychange', function () { if (document.hidden && mode === 'play') pause(); });

  /* ------------------------------------------------------------ debug hook */
  window.__game = {
    get mode() { return mode; },
    get level() { return lvl; },
    state: function () {
      return w ? { mode: mode, level: lvl, endless: endless, st: w.st, x: Math.round(w.x), y: Math.round(w.y), vx: Math.round(w.vx), vy: Math.round(w.vy),
        hooked: !!w.hook, timer: +w.timer.toFixed(2), flips: w.flips, cam: { x: Math.round(cam.x), y: Math.round(cam.y), z: +cam.z.toFixed(2) }, stars: totalStars(), unlocked: save.unlocked } : { mode: mode };
    },
    start: function (i) { startLevel(i); return mode; },
    endless: function () { startEndless(); return mode; },
    // play a recorded input: string/array of 0/1 per 1/60 s step
    script: function (frames) { auto = { frames: typeof frames === 'string' ? frames.split('').map(Number) : frames, i: 0 }; needFresh = false; },
    win: function () { if (w && w.st !== 'won') { w.st = 'won'; w.ev.push({ type: 'win', x: w.x, y: w.y }); } },
    unlockAll: function () { save.unlocked = LEVELS.length; for (var i = 0; i < LEVELS.length; i++) save.stars[i] = 7; persist(); },
    reset: function () { store.remove('save'); location.reload(); },
    // advance the game n fixed steps synchronously (for deterministic screenshots)
    run: function (n) { for (var i = 0; i < n; i++) update(1 / 60); render(); return this.state(); },
    peek: function (x, y, z) { cam.x = x; cam.y = y; cam.z = z || 0.5; mode = 'peek'; screens.forEach(function (s) { $('scr-' + s).hidden = true; }); },
    save: save
  };

  /* ------------------------------------------------------------------ boot */
  setMode('title');
  startAttract();
  if (document.fonts && document.fonts.load) { try { document.fonts.load('700 20px Fredoka'); } catch (e) { /* ignore */ } }
  Kit.loop(function (dt) { if (mode !== 'peek') update(dt); else { time += dt; Kit.keys.endFrame(); } }, render);
})();
