/* Sumo Bonk — synthesized sound effects (WebAudio only). No background music: every sound is a
 * one-shot caused by a move or a match event. */
(function () {
  'use strict';
  var A = Kit.audio;
  var enabled = true;
  // Own tiny synth (same options as Kit.audio.tone/noise) so sounds stay soft: square/saw
  // tones pass a low-pass filter (no fizzy buzz), noise fades in over 3 ms (no click) and
  // loops its buffer so long bursts (the crowd cheer) never cut off abruptly.
  var noiseBuf = null;
  function T(o) {
    var ctx = A.ctx;
    if (!enabled || !ctx || A.muted) return;
    var t0 = ctx.currentTime + (o.delay || 0), dur = o.dur || 0.12, vol = o.vol == null ? 0.3 : o.vol;
    var type = o.type || 'square';
    var osc = ctx.createOscillator(), g = ctx.createGain(), node = osc;
    osc.type = type;
    osc.frequency.setValueAtTime(o.freq || 440, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + dur);
    if (type === 'square' || type === 'sawtooth') {
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = 0.6;
      f.frequency.value = Math.min(5000, Math.max(o.freq || 440, o.to || 0) * 3.5);
      osc.connect(f); node = f;
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    node.connect(g); g.connect(A.master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  function N(o) {
    var ctx = A.ctx;
    if (!enabled || !ctx || A.muted) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t0 = ctx.currentTime + (o.delay || 0), dur = o.dur || 0.25, vol = o.vol == null ? 0.3 : o.vol;
    var src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    src.buffer = noiseBuf; src.loop = true;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(o.filter || 4000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.03);
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  var SFX = {
    setEnabled: function (v) { enabled = !!v; },
    jump: function () { T({ freq: 200, to: 560, type: 'sine', dur: 0.17, vol: 0.32 }); T({ freq: 420, to: 900, type: 'triangle', dur: 0.1, vol: 0.07, delay: 0.02 }); },
    superJump: function () { T({ freq: 150, to: 760, type: 'sine', dur: 0.3, vol: 0.34 }); T({ freq: 300, to: 1200, type: 'triangle', dur: 0.22, vol: 0.08 }); },
    hup: function () { T({ freq: 250, to: 170, type: 'square', dur: 0.06, vol: 0.08 }); },
    dash: function () { N({ dur: 0.24, vol: 0.2, filter: 3200, to: 500 }); T({ freq: 110, to: 230, type: 'sawtooth', dur: 0.14, vol: 0.06 }); },
    dive: function () { T({ freq: 1250, to: 360, type: 'sine', dur: 0.28, vol: 0.12 }); N({ dur: 0.2, vol: 0.1, filter: 2200, to: 600 }); },
    bonk: function (power) {
      var p = Math.min(2, power || 1), r = rnd(0.9, 1.15) / (0.75 + p * 0.25);
      T({ freq: 880 * r, to: 240 * r, type: 'square', dur: 0.12, vol: 0.16 });
      T({ freq: 170, to: 48, type: 'sine', dur: 0.26, vol: 0.55 });
      N({ dur: 0.16, vol: 0.32, filter: 2600, to: 280 });
      T({ freq: 1600 * r, to: 2400 * r, type: 'triangle', dur: 0.08, vol: 0.05, delay: 0.05 });
    },
    clash: function () {
      T({ freq: 150, to: 420, type: 'sine', dur: 0.4, vol: 0.38 });
      T({ freq: 157, to: 440, type: 'sine', dur: 0.4, vol: 0.2, delay: 0.015 });
      T({ freq: 160, to: 45, type: 'sine', dur: 0.25, vol: 0.5 });
      N({ dur: 0.2, vol: 0.28, filter: 1800, to: 200 });
    },
    stomp: function () { T({ freq: 520, to: 140, type: 'square', dur: 0.1, vol: 0.14 }); T({ freq: 220, to: 620, type: 'sine', dur: 0.22, vol: 0.3, delay: 0.05 }); },
    boing: function () { T({ freq: 130, to: 300, type: 'sine', dur: 0.2, vol: 0.26 }); },
    tramp: function () { T({ freq: 110, to: 380, type: 'sine', dur: 0.26, vol: 0.3 }); T({ freq: 220, to: 520, type: 'triangle', dur: 0.16, vol: 0.06 }); },
    land: function (v) { var vol = Math.min(0.45, 0.12 + (v || 400) / 2600); T({ freq: 125, to: 52, type: 'sine', dur: 0.13, vol: vol }); N({ dur: 0.08, vol: vol * 0.3, filter: 700 }); },
    slamLand: function () { T({ freq: 100, to: 38, type: 'sine', dur: 0.35, vol: 0.6 }); N({ dur: 0.3, vol: 0.35, filter: 900, to: 120 }); },
    teeter: function () { T({ freq: 620, to: 720, type: 'triangle', dur: 0.07, vol: 0.07 }); T({ freq: 720, to: 560, type: 'triangle', dur: 0.08, vol: 0.07, delay: 0.08 }); },
    fall: function () { T({ freq: 1300, to: 260, type: 'sine', dur: 0.75, vol: 0.13 }); },
    splash: function () {
      N({ dur: 0.55, vol: 0.42, filter: 3200, to: 180 });
      for (var i = 0; i < 5; i++) T({ freq: rnd(500, 900), to: rnd(1100, 1600), type: 'sine', dur: 0.06, vol: 0.08, delay: 0.12 + i * rnd(0.05, 0.09) });
    },
    ready: function () { T({ freq: 130, to: 58, type: 'sine', dur: 0.3, vol: 0.5 }); N({ dur: 0.05, vol: 0.14, filter: 1400 }); },
    go: function () {
      T({ freq: 110, to: 46, type: 'sine', dur: 0.35, vol: 0.55 });
      T({ freq: 392, type: 'triangle', dur: 0.4, vol: 0.18 });
      T({ freq: 523, type: 'triangle', dur: 0.45, vol: 0.14, delay: 0.04 });
      N({ dur: 0.12, vol: 0.18, filter: 3000, to: 800 });
    },
    point: function () { [659, 784, 1047].forEach(function (f, i) { T({ freq: f, type: 'triangle', dur: 0.14, vol: 0.28, delay: i * 0.08 }); }); },
    draw: function () { T({ freq: 400, to: 300, type: 'triangle', dur: 0.25, vol: 0.2 }); T({ freq: 400, to: 300, type: 'triangle', dur: 0.25, vol: 0.2, delay: 0.25 }); },
    matchWin: function () {
      [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { T({ freq: f, type: 'triangle', dur: i === 6 ? 0.5 : 0.15, vol: 0.3, delay: i * 0.11 }); T({ freq: f / 2, type: 'square', dur: 0.12, vol: 0.05, delay: i * 0.11 }); });
    },
    matchLose: function () {
      [[392, 370], [370, 349], [349, 330], [330, 247]].forEach(function (n, i) { T({ freq: n[0], to: n[1], type: 'triangle', dur: i === 3 ? 0.7 : 0.26, vol: 0.28, delay: i * 0.3 }); });
    },
    cheer: function (big) {
      N({ dur: big ? 1.4 : 0.8, vol: big ? 0.15 : 0.09, filter: 1800, to: 600, attack: 0.12 });
      for (var i = 0; i < (big ? 10 : 5); i++) N({ dur: 0.03, vol: 0.09, filter: 3200, delay: rnd(0.05, big ? 1.0 : 0.6) });
    },
    ooh: function () { T({ freq: 330, to: 250, type: 'triangle', dur: 0.5, vol: 0.1 }); T({ freq: 415, to: 320, type: 'triangle', dur: 0.5, vol: 0.07 }); },
    siren: function () { [0, 0.25].forEach(function (d) { T({ freq: 600, to: 950, type: 'square', dur: 0.2, vol: 0.08, delay: d }); }); },
    wind: function () { N({ dur: 1.0, vol: 0.12, filter: 900, to: 300 }); },
    click: function () { T({ freq: 720, type: 'square', dur: 0.04, vol: 0.1 }); },
    tick: function () { T({ freq: 980, to: 1300, type: 'square', dur: 0.04, vol: 0.08 }); },
    locked: function () { T({ freq: 160, type: 'square', dur: 0.1, vol: 0.12 }); T({ freq: 120, type: 'square', dur: 0.12, vol: 0.12, delay: 0.1 }); },
    unlock: function () { [784, 988, 1175, 1568, 1976].forEach(function (f, i) { T({ freq: f, type: 'square', dur: 0.09, vol: 0.12, delay: i * 0.07 }); }); },
    star: function (i) { T({ freq: 900 + (i || 0) * 60, type: 'square', dur: 0.05, vol: 0.08 }); },
    pause: function () { T({ freq: 520, to: 390, type: 'triangle', dur: 0.12, vol: 0.18 }); }
  };

  window.SBSound = SFX;
})();
