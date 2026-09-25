/*
 * Neon Slope — synthesized music and sound effects (WebAudio only).
 * Everything routes through Kit.audio.master so the shared mute button works.
 */
(function () {
  'use strict';
  var A = Kit.audio;
  var NA = {
    musicOn: true, level: 0, running: false,
    musicBus: null, sfxBus: null, noiseBuf: null, roll: null
  };

  function ctx() {
    var c = A.ctx;
    if (!c || !A.master) return null;
    if (!NA.sfxBus) {
      NA.musicBus = c.createGain();
      NA.musicBus.gain.value = NA.musicOn ? 0.5 : 0;
      NA.musicBus.connect(A.master);
      NA.sfxBus = c.createGain();
      NA.sfxBus.gain.value = 0.9;
      NA.sfxBus.connect(A.master);
      var len = c.sampleRate;
      NA.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      var d = NA.noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // continuous rolling rumble
      try {
        var src = c.createBufferSource(); src.buffer = NA.noiseBuf; src.loop = true;
        var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.7;
        var g = c.createGain(); g.gain.value = 0;
        src.connect(bp); bp.connect(g); g.connect(NA.sfxBus); src.start();
        NA.roll = { g: g, f: bp };
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
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(bus || NA.sfxBus);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.03);
  }

  /* ------------------------------------------------------------ music */
  var BPM = 122, STEP = 60 / BPM / 4;
  var CHORDS = [
    { root: 55.0, notes: [440, 523.25, 659.25] },      // Am
    { root: 43.65, notes: [349.23, 440, 523.25] },     // F
    { root: 65.41, notes: [392, 523.25, 659.25] },     // C
    { root: 49.0, notes: [392, 493.88, 587.33] }       // G
  ];
  var nextT = 0, step = 0, timer = 0;

  function kick(t) {
    var c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g); g.connect(NA.musicBus); o.start(t); o.stop(t + 0.3);
  }
  function mnoise(t, dur, vol, type, freq, q) {
    var c = A.ctx, s = c.createBufferSource(); s.buffer = NA.noiseBuf;
    var f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    var g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(NA.musicBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  function bass(t, freq, dur) {
    var c = A.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq;
    f.type = 'lowpass'; f.Q.value = 7; f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(1100, t + 0.03); f.frequency.exponentialRampToValueAtTime(260, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.26, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(NA.musicBus); o.start(t); o.stop(t + dur + 0.02);
  }
  function lead(t, freq, dur, vol) {
    var c = A.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'square'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = 2600;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(NA.musicBus); o.start(t); o.stop(t + dur + 0.02);
  }
  function pad(t, notes, dur) {
    var c = A.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.4); g.gain.setValueAtTime(0.05, t + dur - 0.4); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    f.connect(g); g.connect(NA.musicBus);
    for (var i = 0; i < notes.length; i++) {
      for (var k = -1; k <= 1; k += 2) {
        var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = notes[i] / 2; o.detune.value = k * 9;
        o.connect(f); o.start(t); o.stop(t + dur + 0.02);
      }
    }
  }

  function schedule(s, t) {
    var bar = Math.floor(s / 16) % 4, i = s % 16, ch = CHORDS[bar], lvl = NA.level;
    if (i === 0) pad(t, ch.notes, STEP * 16);
    if (lvl >= 2) {
      if (i % 4 === 0) kick(t);
      if (i === 4 || i === 12) mnoise(t, 0.16, 0.32, 'bandpass', 1600, 0.9);
      if (i % 2 === 1) mnoise(t, 0.04, 0.12, 'highpass', 7500);
      bass(t, (i % 4 === 2) ? ch.root * 2 : ch.root, STEP * 1.6);
      if (lvl >= 3) {
        var n = ch.notes[[0, 1, 2, 1][i % 4]] * (i >= 8 ? 2 : 1);
        lead(t, n, STEP * 0.9, 0.035);
      }
    } else if (lvl === 1) {
      if (i % 8 === 0) bass(t, ch.root, STEP * 4);
      if (i % 4 === 2) mnoise(t, 0.05, 0.06, 'highpass', 8000);
      if (i % 2 === 0) lead(t, ch.notes[(i / 2) % 3] * 2, STEP * 1.4, 0.018);
    }
  }
  function tick() {
    var c = A.ctx;
    if (!c || !NA.running) return;
    if (!ctx()) return;
    if (nextT < c.currentTime) nextT = c.currentTime + 0.05;
    while (nextT < c.currentTime + 0.15) {
      if (!A.muted && NA.musicOn) schedule(step, nextT);
      nextT += STEP; step++;
    }
  }

  NA.setMusic = function (level) {
    NA.level = level;
    if (level > 0 && !NA.running) {
      NA.running = true; step = 0; nextT = 0;
      if (!timer) timer = setInterval(tick, 30);
    } else if (level === 0) {
      NA.running = false;
    }
  };
  NA.setMusicOn = function (on) {
    NA.musicOn = !!on;
    if (NA.musicBus) NA.musicBus.gain.value = on ? 0.5 : 0;
  };
  NA.rollSound = function (amount, speed) {
    var c = ctx();
    if (!c || !NA.roll) return;
    var t = c.currentTime;
    NA.roll.g.gain.setTargetAtTime(A.muted ? 0 : amount * 0.16, t, 0.05);
    NA.roll.f.frequency.setTargetAtTime(250 + speed * 22, t, 0.1);
  };

  /* -------------------------------------------------------------- sfx */
  NA.sfx = {
    click: function () { tone(700, 900, 'square', 0.05, 0.12); },
    gem: function (combo) {
      var f = 880 * Math.pow(1.06, Math.min(combo, 14));
      tone(f, 0, 'square', 0.06, 0.13); tone(f * 1.5, 0, 'square', 0.12, 0.12, 0.05);
    },
    bigGem: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, 0, 'square', 0.1, 0.13, i * 0.05); }); },
    jump: function () { tone(220, 880, 'sawtooth', 0.28, 0.12); noise(0.3, 0.14, 'bandpass', 800, 3500, 0, null, 1.2); },
    land: function (p) { tone(140, 50, 'sine', 0.18, 0.35 * p + 0.1); noise(0.14, 0.15 * p + 0.05, 'lowpass', 1200, 200); },
    drop: function () { tone(500, 200, 'triangle', 0.25, 0.08); },
    crash: function () {
      noise(0.7, 0.5, 'lowpass', 3000, 80); tone(200, 40, 'sawtooth', 0.5, 0.25);
      for (var i = 0; i < 7; i++) tone(1800 + Math.random() * 2600, 0, 'sine', 0.12, 0.07, 0.04 + i * 0.05);
    },
    fall: function () { tone(900, 120, 'triangle', 0.8, 0.18); },
    whoosh: function () { noise(0.3, 0.18, 'bandpass', 600, 3000, 0, null, 1.5); },
    near: function () { noise(0.22, 0.22, 'bandpass', 2500, 700, 0, null, 2); tone(1200, 1600, 'sine', 0.08, 0.06); },
    zone: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0, 'square', 0.14, 0.1, i * 0.07); tone(f / 2, 0, 'triangle', 0.2, 0.1, i * 0.07); }); },
    best: function () { [659, 784, 988, 1319, 988, 1319, 1568].forEach(function (f, i) { tone(f, 0, 'square', 0.14, 0.12, i * 0.08); }); },
    shield: function () { tone(400, 1600, 'sine', 0.35, 0.18); tone(600, 2400, 'triangle', 0.35, 0.1, 0.05); },
    shieldPop: function () { noise(0.3, 0.3, 'highpass', 3000, 800); tone(1400, 300, 'square', 0.25, 0.12); },
    magnet: function () { [300, 450, 600, 900].forEach(function (f, i) { tone(f, f * 1.2, 'sawtooth', 0.1, 0.07, i * 0.05); }); },
    buy: function () { [523, 784, 1047, 1568].forEach(function (f, i) { tone(f, 0, 'square', 0.12, 0.13, i * 0.06); }); noise(0.4, 0.1, 'highpass', 6000, 0, 0.2); },
    nope: function () { tone(220, 160, 'square', 0.18, 0.12); tone(180, 120, 'square', 0.2, 0.1, 0.1); },
    unlock: function () { [392, 523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0, 'triangle', 0.2, 0.18, i * 0.07); }); },
    over: function () { [523, 440, 349, 262].forEach(function (f, i) { tone(f, f * 0.98, 'triangle', 0.25, 0.18, 0.25 + i * 0.13); }); },
    start: function () { tone(300, 1200, 'sawtooth', 0.35, 0.1); noise(0.4, 0.16, 'bandpass', 500, 4000, 0, null, 1); },
    steer: function () { noise(0.12, 0.05, 'bandpass', 1800, 900, 0, null, 2); }
  };

  window.NS_AUDIO = NA;
})();
