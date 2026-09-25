/* Air Hockey — synthesized sound effects (WebAudio via Kit.audio). */
(function () {
  'use strict';
  var AH = window.AH = window.AH || {};
  var A = Kit.audio;
  var lastHit = 0, lastWall = 0;

  function ok() { return A.ctx && !A.muted && A.master; }

  var noiseBuf = null;
  function getNoise() {
    if (!noiseBuf) {
      var ctx = A.ctx, len = ctx.sampleRate * 2;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // Band-passed noise with an envelope (crowd, whoosh, ice).
  function band(opts) {
    if (!ok()) return;
    var ctx = A.ctx, t0 = ctx.currentTime + (opts.delay || 0), dur = opts.dur || 1;
    var src = ctx.createBufferSource(); src.buffer = getNoise();
    src.loop = true;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = opts.freq || 1000; f.Q.value = opts.q || 0.8;
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
    var g = ctx.createGain();
    var v = opts.vol || 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + (opts.attack || 0.08));
    g.gain.setValueAtTime(v, t0 + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g);
    if (opts.wobble) {
      // amplitude wobble = crowd "yeah!" texture
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = opts.wobble; lg.gain.value = v * 0.45;
      var g2 = ctx.createGain(); g2.gain.value = 1;
      lfo.connect(lg); lg.connect(g2.gain);
      g.connect(g2); g2.connect(A.master);
      lfo.start(t0); lfo.stop(t0 + dur + 0.05);
    } else {
      g.connect(A.master);
    }
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  }

  AH.sfx = {
    hit: function (speed) {
      if (!ok()) return;
      var now = A.ctx.currentTime;
      if (now - lastHit < 0.035) return;
      lastHit = now;
      var k = Math.min(1, speed / 1800);
      A.tone({ freq: 240 + k * 260, to: 90, type: 'triangle', dur: 0.09 + k * 0.05, vol: 0.18 + k * 0.22 });
      A.noise({ dur: 0.05 + k * 0.08, vol: 0.12 + k * 0.28, filter: 2200 + k * 3000, to: 400 });
      if (k > 0.75) A.tone({ freq: 90, to: 40, type: 'sine', dur: 0.22, vol: 0.35 });
    },
    wall: function (speed) {
      if (!ok()) return;
      var now = A.ctx.currentTime;
      if (now - lastWall < 0.04) return;
      lastWall = now;
      var k = Math.min(1, speed / 1600);
      A.tone({ freq: 700 + k * 500, to: 500, type: 'square', dur: 0.035, vol: 0.05 + k * 0.1 });
      A.noise({ dur: 0.04, vol: 0.05 + k * 0.12, filter: 4000, to: 1200 });
    },
    goal: function (good) {
      if (!ok()) return;
      // horn
      [0, 0.18].forEach(function (d) {
        A.tone({ freq: 233, type: 'sawtooth', dur: 0.16, vol: 0.14, delay: d });
        A.tone({ freq: 294, type: 'sawtooth', dur: 0.16, vol: 0.12, delay: d });
      });
      A.tone({ freq: 349, type: 'sawtooth', dur: 0.5, vol: 0.14, delay: 0.36 });
      A.tone({ freq: 466, type: 'square', dur: 0.5, vol: 0.08, delay: 0.36 });
      A.noise({ dur: 0.5, vol: 0.4, filter: 900, to: 80 });
      // crowd
      band({ freq: good ? 1100 : 700, q: 0.6, dur: 1.9, vol: good ? 0.34 : 0.2, attack: 0.12, wobble: 9 });
      band({ freq: 2600, q: 1.2, dur: 1.4, vol: 0.1, attack: 0.1, wobble: 13, delay: 0.05 });
    },
    count: function (n) {
      if (!n) { A.tone({ freq: 880, type: 'square', dur: 0.28, vol: 0.18 }); A.tone({ freq: 1320, type: 'triangle', dur: 0.3, vol: 0.16 }); return; }
      A.tone({ freq: 520, type: 'square', dur: 0.12, vol: 0.14 });
    },
    power: function () { [660, 880, 1100, 1320].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.09, vol: 0.18, delay: i * 0.05 }); }); },
    grow: function () { A.tone({ freq: 200, to: 700, type: 'square', dur: 0.35, vol: 0.14 }); },
    shrink: function () { A.tone({ freq: 900, to: 250, type: 'square', dur: 0.3, vol: 0.12 }); },
    freeze: function () { band({ freq: 5000, q: 2, dur: 0.6, vol: 0.2, attack: 0.01 }); A.tone({ freq: 1800, to: 2600, type: 'sine', dur: 0.25, vol: 0.12 }); A.tone({ freq: 2400, to: 3200, type: 'sine', dur: 0.25, vol: 0.1, delay: 0.08 }); },
    fire: function () { band({ freq: 500, to: 2500, q: 0.7, dur: 0.5, vol: 0.28, attack: 0.02 }); A.tone({ freq: 150, to: 600, type: 'sawtooth', dur: 0.3, vol: 0.1 }); },
    spawn: function () { A.tone({ freq: 400, to: 900, type: 'sine', dur: 0.18, vol: 0.14 }); },
    ui: function () { A.tone({ freq: 700, type: 'square', dur: 0.045, vol: 0.12 }); },
    uiBack: function () { A.tone({ freq: 480, type: 'square', dur: 0.05, vol: 0.1 }); },
    buy: function () { Kit.sfx.coin(); A.tone({ freq: 1568, type: 'triangle', dur: 0.2, vol: 0.14, delay: 0.16 }); },
    nope: function () { A.tone({ freq: 200, to: 140, type: 'square', dur: 0.18, vol: 0.14 }); },
    award: function () { [784, 988, 1175, 1568].forEach(function (f, i) { A.tone({ freq: f, type: 'square', dur: 0.1, vol: 0.12, delay: i * 0.07 }); }); },
    win: function () {
      [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.28, delay: i * 0.1 }); });
      band({ freq: 1100, q: 0.6, dur: 2.4, vol: 0.3, attack: 0.2, wobble: 8 });
    },
    lose: function () { [392, 330, 262, 196].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.24, vol: 0.26, delay: i * 0.16 }); }); },
    matchPoint: function () { A.tone({ freq: 988, type: 'square', dur: 0.1, vol: 0.12 }); A.tone({ freq: 988, type: 'square', dur: 0.1, vol: 0.12, delay: 0.14 }); }
  };
})();
