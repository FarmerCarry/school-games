/* Wacky Soccer — synthesized sounds (WebAudio, no files). */
(function () {
  'use strict';
  var WS = window.WS = window.WS || {};
  var A = Kit.audio;
  var S = WS.sfx = { quiet: false };
  var noiseBuf = null;
  var lastPlay = {};

  function ctx() { return (!A.ctx || A.muted || S.quiet) ? null : A.ctx; }
  function limit(name, gap) {
    var c = A.ctx; if (!c) return false;
    var t = c.currentTime;
    if (lastPlay[name] && t - lastPlay[name] < gap) return false;
    lastPlay[name] = t; return true;
  }
  function getNoise(c) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  // flexible tone: {f, to, type, dur, vol, delay, attack, vib, vibF}
  function tone(o) {
    var c = ctx(); if (!c) return;
    var t0 = c.currentTime + (o.delay || 0), dur = o.dur || 0.15, vol = o.vol == null ? 0.2 : o.vol;
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f || 440, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    if (o.vib) {
      var l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = o.vibF || 30; lg.gain.value = o.vib;
      l.connect(lg); lg.connect(osc.frequency); l.start(t0); l.stop(t0 + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.006));
    if (o.hold) g.gain.setValueAtTime(vol, t0 + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(A.master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  // filtered noise: {dur, vol, delay, type:'lowpass'|'bandpass'|'highpass', f, to, q, attack}
  function noise(o) {
    var c = ctx(); if (!c) return;
    var t0 = c.currentTime + (o.delay || 0), dur = o.dur || 0.2, vol = o.vol == null ? 0.2 : o.vol;
    var src = c.createBufferSource(); src.buffer = getNoise(c);
    var f = c.createBiquadFilter(); f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t0 + dur);
    f.Q.value = o.q || 1;
    var g = c.createGain();
    var at = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + at);
    if (o.hold) g.gain.setValueAtTime(vol, t0 + at + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.05);
  }
  S.tone = tone; S.noise = noise;

  S.kick = function (p) {
    if (!limit('kick', 0.04)) return;
    var v = Math.min(1, p / 900);
    tone({ f: 180, to: 45, type: 'sine', dur: 0.16, vol: 0.45 * (0.5 + v * 0.5) });
    noise({ f: 2400, to: 300, dur: 0.09, vol: 0.25 * v });
  };
  S.touch = function (p) {
    if (!limit('touch', 0.05)) return;
    var v = Math.min(1, p / 700);
    tone({ f: 220, to: 90, type: 'sine', dur: 0.09, vol: 0.25 * v + 0.05 });
  };
  S.header = function () {
    if (!limit('head', 0.08)) return;
    tone({ f: 520, to: 260, type: 'sine', dur: 0.12, vol: 0.28 });
    tone({ f: 780, to: 390, type: 'triangle', dur: 0.08, vol: 0.12 });
  };
  S.bounce = function (p) {
    if (!limit('bounce', 0.05)) return;
    var v = Math.min(1, p / 900);
    tone({ f: 150, to: 70, type: 'sine', dur: 0.1, vol: 0.2 * v + 0.04 });
  };
  S.post = function () {
    if (!limit('post', 0.08)) return;
    tone({ f: 1320, type: 'triangle', dur: 0.5, vol: 0.2 });
    tone({ f: 1870, type: 'sine', dur: 0.35, vol: 0.12 });
    tone({ f: 990, to: 960, type: 'square', dur: 0.12, vol: 0.06 });
  };
  S.jump = function (pitch) {
    if (!limit('jump', 0.03)) return;
    pitch = pitch || 1;
    tone({ f: 200 * pitch, to: 520 * pitch, type: 'sine', dur: 0.16, vol: 0.18, vib: 25, vibF: 18 });
  };
  S.flip = function () { tone({ f: 300, to: 900, type: 'triangle', dur: 0.2, vol: 0.14 }); };
  S.land = function (p) {
    if (!limit('land', 0.05)) return;
    noise({ f: 500, to: 120, dur: 0.12, vol: Math.min(0.25, p / 3000) });
  };
  S.bonk = function () {
    if (!limit('bonk', 0.1)) return;
    tone({ f: 600, to: 200, type: 'square', dur: 0.1, vol: 0.1 });
    tone({ f: 900, to: 450, type: 'sine', dur: 0.14, vol: 0.18, delay: 0.02 });
  };
  S.bump = function () {
    if (!limit('bump', 0.12)) return;
    tone({ f: 140, to: 90, type: 'square', dur: 0.08, vol: 0.09 });
    tone({ f: 330, to: 180, type: 'sine', dur: 0.12, vol: 0.16 });
  };
  S.boing = function () {
    if (!limit('boing', 0.12)) return;
    tone({ f: 180, to: 620, type: 'sine', dur: 0.35, vol: 0.2, vib: 60, vibF: 14 });
  };
  S.whistle = function (n) {
    n = n || 1;
    for (var i = 0; i < n; i++) {
      var long = (i === n - 1) ? (n > 1 ? 0.7 : 0.4) : 0.18;
      tone({ f: 2900, type: 'sine', dur: long, vol: 0.13, vib: 160, vibF: 34, hold: long * 0.7, delay: i * 0.28 });
      tone({ f: 3350, type: 'sine', dur: long, vol: 0.05, vib: 160, vibF: 34, hold: long * 0.7, delay: i * 0.28 });
    }
  };
  S.cheer = function (big) {
    var d = big ? 2.6 : 1.4, v = big ? 0.22 : 0.12;
    noise({ type: 'bandpass', f: 1100, q: 0.7, dur: d, vol: v, attack: 0.18, hold: d * 0.35 });
    noise({ type: 'bandpass', f: 2400, q: 1.2, dur: d * 0.9, vol: v * 0.5, attack: 0.25, hold: d * 0.3 });
    // a few voices of "yaaay"
    for (var i = 0; i < (big ? 6 : 3); i++) {
      var f = 380 + Math.random() * 380;
      tone({ f: f, to: f * 1.25, type: 'sawtooth', dur: 0.6 + Math.random() * 0.6, vol: 0.018, delay: Math.random() * 0.3, attack: 0.08 });
    }
  };
  S.ooh = function () {
    if (!limit('ooh', 1.2)) return;
    for (var i = 0; i < 5; i++) {
      var f = 200 + Math.random() * 120;
      tone({ f: f * 1.2, to: f * 0.85, type: 'sawtooth', dur: 1.0, vol: 0.022, attack: 0.15, delay: Math.random() * 0.1 });
    }
    noise({ type: 'bandpass', f: 600, q: 2, dur: 1.0, vol: 0.06, attack: 0.15 });
  };
  S.horn = function () {
    [220, 277, 330, 440].forEach(function (f) { tone({ f: f, type: 'sawtooth', dur: 0.9, vol: 0.07, hold: 0.6, attack: 0.02 }); });
  };
  S.goal = function () {
    S.horn();
    [523, 659, 784, 1047].forEach(function (f, i) { tone({ f: f, type: 'square', dur: 0.14, vol: 0.1, delay: 0.1 + i * 0.08 }); });
    S.cheer(true);
  };
  S.drumroll = function (dur) {
    var n = Math.floor(dur / 0.045);
    for (var i = 0; i < n; i++) noise({ f: 900, to: 300, dur: 0.05, vol: 0.06 + 0.1 * i / n, delay: i * 0.045 });
  };
  S.tada = function () {
    [392, 523, 659, 784].forEach(function (f, i) { tone({ f: f, type: 'triangle', dur: 0.5, vol: 0.14, delay: i * 0.05 }); });
    tone({ f: 1047, type: 'square', dur: 0.4, vol: 0.06, delay: 0.2 });
    noise({ type: 'highpass', f: 6000, dur: 0.5, vol: 0.08, delay: 0.2 });
  };
  S.tick = function () { tone({ f: 1600, type: 'square', dur: 0.025, vol: 0.05 }); };
  S.beep = function (hi) { tone({ f: hi ? 1047 : 587, type: 'square', dur: hi ? 0.35 : 0.14, vol: 0.12 }); };
  S.click = function () { tone({ f: 700, to: 1000, type: 'square', dur: 0.06, vol: 0.09 }); };
  S.hover = function () { if (limit('hover', 0.05)) tone({ f: 1200, type: 'sine', dur: 0.04, vol: 0.05 }); };
  S.nope = function () { tone({ f: 220, to: 160, type: 'square', dur: 0.18, vol: 0.1 }); };
  S.coin = function () {
    if (!limit('coin', 0.05)) return;
    tone({ f: 988, type: 'square', dur: 0.06, vol: 0.08 }); tone({ f: 1319, type: 'square', dur: 0.12, vol: 0.08, delay: 0.06 });
  };
  S.buy = function () {
    [659, 784, 988, 1319].forEach(function (f, i) { tone({ f: f, type: 'square', dur: 0.1, vol: 0.09, delay: i * 0.06 }); });
    noise({ type: 'highpass', f: 5000, dur: 0.4, vol: 0.06, delay: 0.2 });
  };
  S.win = function () {
    var m = [523, 659, 784, 1047, 784, 1047, 1319];
    m.forEach(function (f, i) { tone({ f: f, type: 'square', dur: i === m.length - 1 ? 0.6 : 0.14, vol: 0.1, delay: i * 0.12 }); });
    m.forEach(function (f, i) { tone({ f: f / 2, type: 'triangle', dur: 0.16, vol: 0.12, delay: i * 0.12 }); });
    S.cheer(true);
  };
  S.lose = function () {
    tone({ f: 392, to: 370, type: 'sawtooth', dur: 0.35, vol: 0.08, vib: 8, vibF: 6 });
    tone({ f: 370, to: 349, type: 'sawtooth', dur: 0.35, vol: 0.08, vib: 8, vibF: 6, delay: 0.38 });
    tone({ f: 349, to: 330, type: 'sawtooth', dur: 0.35, vol: 0.08, vib: 8, vibF: 6, delay: 0.76 });
    tone({ f: 330, to: 220, type: 'sawtooth', dur: 1.0, vol: 0.09, vib: 12, vibF: 5, delay: 1.14 });
  };
  S.trophy = function () {
    var m = [523, 523, 523, 698, 880, 784, 880, 1047];
    var d = [0, 0.12, 0.24, 0.36, 0.72, 0.96, 1.08, 1.2];
    m.forEach(function (f, i) { tone({ f: f, type: 'square', dur: i === m.length - 1 ? 0.8 : 0.16, vol: 0.1, delay: d[i] }); tone({ f: f / 2, type: 'triangle', dur: 0.2, vol: 0.12, delay: d[i] }); });
    S.cheer(true);
  };
})();
