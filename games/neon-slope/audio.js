/*
 * Neon Slope — synthesized sound effects and the rolling rumble (WebAudio only, no
 * background music). Everything routes through Kit.audio.master so the shared mute
 * button works.
 */
(function () {
  'use strict';
  var A = Kit.audio;
  var NA = { sfxBus: null, noiseBuf: null, roll: null };

  function ctx() {
    var c = A.ctx;
    if (!c || !A.master) return null;
    if (!NA.sfxBus) {
      NA.sfxBus = c.createGain();
      NA.sfxBus.gain.value = 0.9;
      NA.sfxBus.connect(A.master);
      var len = c.sampleRate;
      NA.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      var d = NA.noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // Continuous rolling rumble: soft, low "brown" noise (not white hiss), made loopable
      // without a click. Silent (gain 0) unless the ball rolls on the track (rollSound).
      try {
        var rl = c.sampleRate * 3, rb = c.createBuffer(1, rl, c.sampleRate), rd = rb.getChannelData(0), last = 0, j;
        for (j = 0; j < rl; j++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; rd[j] = last * 3.5; }
        var drift = rd[rl - 1] - rd[0];
        for (j = 0; j < rl; j++) rd[j] -= drift * j / (rl - 1);
        var src = c.createBufferSource(); src.buffer = rb; src.loop = true;
        var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140; lp.Q.value = 0.5;
        var g = c.createGain(); g.gain.value = 0;
        src.connect(lp); lp.connect(g); g.connect(NA.sfxBus); src.start();
        NA.roll = { g: g, f: lp };
      } catch (e) { NA.roll = null; }
    }
    return c;
  }

  function tone(freq, to, type, dur, vol, delay, bus, attack) {
    var c = ctx(); if (!c || A.muted) return;
    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    // silent before t0 as well (a gain's default is 1): stops the first-sample click
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus || NA.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function noise(dur, vol, type, freq, to, delay, bus, q) {
    var c = ctx(); if (!c || A.muted) return;
    var t0 = c.currentTime + (delay || 0);
    var s = c.createBufferSource(); s.buffer = NA.noiseBuf;
    var f = c.createBiquadFilter(); f.type = type || 'lowpass';
    f.frequency.setValueAtTime(freq || 2000, t0);
    if (q) f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);
    var g = c.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(bus || NA.sfxBus);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.03);
  }

  var rollLast = { a: -1, f: -1, t: 0 };
  NA.rollSound = function (amount, speed) {
    var c = ctx();
    if (!c || !NA.roll) return;
    var t = c.currentTime, a = A.muted ? 0 : amount * 0.09, f = Math.min(420, 110 + Math.abs(speed) * 6);
    // only touch the AudioParams when something changed (not 60 automation events a second)
    if (Math.abs(a - rollLast.a) < 0.004 && Math.abs(f - rollLast.f) < 8 && t - rollLast.t < 0.5) return;
    rollLast.a = a; rollLast.f = f; rollLast.t = t;
    NA.roll.g.gain.setTargetAtTime(a, t, 0.08);
    NA.roll.f.frequency.setTargetAtTime(f, t, 0.15);
  };

  /* -------------------------------------------------------------- sfx */
  // Soft bell ("ding"): sine body + two quick upper partials. Used for gems and rewards
  // instead of raw square beeps, which get shrill when heard hundreds of times a run.
  function bell(f, dur, vol, delay) {
    tone(f, 0, 'sine', dur, vol, delay, null, 0.003);
    tone(f * 2, 0, 'sine', dur * 0.5, vol * 0.3, delay, null, 0.002);
    tone(f * 3.01, 0, 'sine', dur * 0.22, vol * 0.12, delay, null, 0.002);
  }
  NA.sfx = {
    click: function () { tone(880, 1250, 'triangle', 0.06, 0.13); },
    gem: function (combo) {
      var f = 880 * Math.pow(1.06, Math.min(combo, 10));
      bell(f, 0.1, 0.16); bell(f * 1.5, 0.2, 0.15, 0.05);
    },
    bigGem: function () { [784, 988, 1175, 1568].forEach(function (f, i) { bell(f, 0.2, 0.13, i * 0.05); }); tone(392, 784, 'triangle', 0.25, 0.1); },
    jump: function () { tone(220, 880, 'triangle', 0.3, 0.2); tone(440, 1760, 'sine', 0.22, 0.05, 0.03); noise(0.3, 0.12, 'bandpass', 700, 3000, 0, null, 1.2); },
    land: function (p) { tone(140, 50, 'sine', 0.18, 0.28 * p + 0.1); noise(0.14, 0.13 * p + 0.05, 'lowpass', 1100, 200); },
    drop: function () { tone(500, 200, 'triangle', 0.25, 0.08); },
    crash: function () {
      noise(0.7, 0.45, 'lowpass', 2600, 80); tone(200, 40, 'triangle', 0.5, 0.3); tone(200, 40, 'sawtooth', 0.35, 0.08);
      // glassy shatter
      for (var i = 0; i < 7; i++) tone(1300 + Math.random() * 1800, 0, 'sine', 0.14, 0.06, 0.04 + i * 0.05);
    },
    fall: function () { tone(900, 120, 'triangle', 0.8, 0.18); },
    whoosh: function () { noise(0.3, 0.16, 'bandpass', 600, 2400, 0, null, 1.5); },
    near: function () { noise(0.22, 0.2, 'bandpass', 1800, 600, 0, null, 1.6); tone(1200, 1600, 'sine', 0.1, 0.07); },
    zone: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0, 'triangle', 0.18, 0.12, i * 0.07); tone(f / 2, 0, 'triangle', 0.2, 0.08, i * 0.07); }); bell(2093, 0.5, 0.06, 0.36); },
    best: function () { [659, 784, 988, 1319, 988, 1319, 1568].forEach(function (f, i) { tone(f, 0, 'triangle', 0.16, 0.13, i * 0.08); bell(f * 2, 0.12, 0.03, i * 0.08); }); },
    shield: function () { tone(400, 1600, 'sine', 0.35, 0.18); tone(600, 2400, 'triangle', 0.35, 0.08, 0.05); },
    shieldPop: function () { noise(0.3, 0.26, 'bandpass', 2600, 700, 0, null, 0.7); tone(1400, 300, 'triangle', 0.25, 0.14); bell(1568, 0.3, 0.06, 0.05); },
    magnet: function () { [300, 450, 600, 900].forEach(function (f, i) { tone(f, f * 1.2, 'triangle', 0.12, 0.1, i * 0.05); }); },
    buy: function () { [523, 784, 1047, 1568].forEach(function (f, i) { bell(f, 0.22, 0.13, i * 0.06); }); noise(0.4, 0.05, 'bandpass', 6000, 0, 0.2, null, 0.7); },
    nope: function () { tone(220, 160, 'triangle', 0.18, 0.16); tone(180, 120, 'triangle', 0.2, 0.14, 0.1); },
    unlock: function () { [392, 523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0, 'triangle', 0.2, 0.18, i * 0.07); }); bell(2637, 0.5, 0.05, 0.42); },
    over: function () { [523, 440, 349, 262].forEach(function (f, i) { tone(f, f * 0.98, 'triangle', 0.25, 0.18, 0.25 + i * 0.13); }); },
    start: function () { tone(300, 1200, 'triangle', 0.35, 0.14); noise(0.4, 0.12, 'bandpass', 500, 3000, 0, null, 1); },
    steer: function () { noise(0.12, 0.05, 'bandpass', 1400, 800, 0, null, 1.5); }
  };

  window.NS_AUDIO = NA;
})();
