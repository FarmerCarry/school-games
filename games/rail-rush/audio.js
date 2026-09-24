/*
 * Rail Rush — audio.js
 * Sound effects and a small step-sequencer that plays an upbeat synth track.
 * Everything is synthesised with WebAudio and routed through Kit.audio.master
 * so the shared mute button silences it.
 */
(function () {
  'use strict';
  var RR = window.RR = window.RR || {};
  var A = Kit.audio;

  function ctx() { return (A.ctx && !A.muted) ? A.ctx : null; }
  var noiseBuf = null;
  function noise(c) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // Generic voice: osc -> (filter) -> gain -> dest
  function voice(c, dest, t, o) {
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.slide || o.dur));
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    var node = osc;
    if (o.lp) {
      var f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.lp, t);
      if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, t + o.dur);
      f.Q.value = o.q || 1;
      osc.connect(f); node = f;
    }
    var v = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.att || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    node.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + o.dur + 0.03);
  }
  function nz(c, dest, t, o) {
    var src = c.createBufferSource();
    src.buffer = noise(c);
    src.playbackRate.value = o.rate || 1;
    var f = c.createBiquadFilter();
    f.type = o.hp ? 'highpass' : (o.bp ? 'bandpass' : 'lowpass');
    f.frequency.setValueAtTime(o.hp || o.bp || o.lp || 3000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    if (o.q) f.Q.value = o.q;
    var g = c.createGain();
    g.gain.setValueAtTime(o.vol == null ? 0.2 : o.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.03);
  }

  /* ------------------------------------------------------------ sfx */
  var coinStreak = 0, lastCoin = 0;
  var S = {
    click: function () { var c = ctx(); if (!c) return; voice(c, A.master, c.currentTime, { f: 700, to: 900, dur: 0.06, vol: 0.12, type: 'square' }); },
    hover: function () { var c = ctx(); if (!c) return; voice(c, A.master, c.currentTime, { f: 1200, dur: 0.03, vol: 0.04, type: 'sine' }); },
    jump: function (big) {
      var c = ctx(); if (!c) return; var t = c.currentTime;
      voice(c, A.master, t, { f: big ? 220 : 320, to: big ? 1100 : 760, dur: big ? 0.28 : 0.16, vol: 0.14, type: 'square', lp: 2600 });
      nz(c, A.master, t, { hp: 2500, dur: 0.12, vol: 0.06 });
    },
    land: function (hard) {
      var c = ctx(); if (!c) return; var t = c.currentTime;
      voice(c, A.master, t, { f: hard ? 180 : 140, to: 60, dur: 0.1, vol: hard ? 0.28 : 0.18, type: 'triangle' });
      nz(c, A.master, t, { lp: 900, dur: 0.08, vol: 0.1 });
    },
    roll: function () { var c = ctx(); if (!c) return; var t = c.currentTime; nz(c, A.master, t, { lp: 1800, to: 300, dur: 0.3, vol: 0.18 }); voice(c, A.master, t, { f: 400, to: 150, dur: 0.16, vol: 0.09, type: 'triangle' }); },
    swipe: function (dir) { var c = ctx(); if (!c) return; var t = c.currentTime; nz(c, A.master, t, { bp: dir < 0 ? 2200 : 2800, to: dir < 0 ? 900 : 1200, q: 1.2, dur: 0.13, vol: 0.2 }); },
    coin: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime;
      if (t - lastCoin < 0.45) coinStreak = Math.min(coinStreak + 1, 14); else coinStreak = 0;
      lastCoin = t;
      var base = 76 + [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24][coinStreak];
      voice(c, A.master, t, { f: mtof(base), dur: 0.06, vol: 0.09, type: 'square' });
      voice(c, A.master, t + 0.05, { f: mtof(base + 7), dur: 0.14, vol: 0.08, type: 'square' });
    },
    power: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime;
      [60, 64, 67, 72, 76, 79, 84].forEach(function (n, i) { voice(c, A.master, t + i * 0.045, { f: mtof(n), dur: 0.12, vol: 0.1, type: 'square', lp: 4000 }); });
      nz(c, A.master, t, { hp: 3000, dur: 0.4, vol: 0.06 });
    },
    powerEnd: function () { var c = ctx(); if (!c) return; var t = c.currentTime; [79, 72, 67].forEach(function (n, i) { voice(c, A.master, t + i * 0.07, { f: mtof(n), dur: 0.1, vol: 0.08, type: 'triangle' }); }); },
    stumble: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime;
      voice(c, A.master, t, { f: 520, to: 180, dur: 0.22, vol: 0.22, type: 'square', lp: 2000 });
      nz(c, A.master, t, { lp: 1500, to: 200, dur: 0.2, vol: 0.25 });
      voice(c, A.master, t + 0.25, { f: 880, dur: 0.09, vol: 0.12, type: 'square' });
      voice(c, A.master, t + 0.4, { f: 880, dur: 0.09, vol: 0.12, type: 'square' });
    },
    crash: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime;
      nz(c, A.master, t, { lp: 2200, to: 80, dur: 0.5, vol: 0.45 });
      voice(c, A.master, t, { f: 180, to: 50, dur: 0.35, vol: 0.35, type: 'sawtooth', lp: 900 });
      // cartoon "boing" + slide whistle down
      voice(c, A.master, t + 0.12, { f: 300, to: 900, slide: 0.08, dur: 0.3, vol: 0.14, type: 'sine' });
      voice(c, A.master, t + 0.4, { f: 1400, to: 220, dur: 0.7, vol: 0.12, type: 'sine' });
    },
    horn: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime;
      [0, 0.32].forEach(function (d) {
        voice(c, A.master, t + d, { f: 311, dur: 0.26, vol: 0.07, type: 'sawtooth', lp: 1400, att: 0.03 });
        voice(c, A.master, t + d, { f: 392, dur: 0.26, vol: 0.07, type: 'sawtooth', lp: 1400, att: 0.03 });
      });
    },
    boardOn: function () { var c = ctx(); if (!c) return; var t = c.currentTime; voice(c, A.master, t, { f: 200, to: 1200, dur: 0.35, vol: 0.14, type: 'sawtooth', lp: 3000 }); nz(c, A.master, t, { bp: 1500, to: 5000, dur: 0.35, vol: 0.12 }); },
    boardBreak: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime;
      nz(c, A.master, t, { hp: 1800, dur: 0.35, vol: 0.3 });
      [96, 91, 84, 79].forEach(function (n, i) { voice(c, A.master, t + i * 0.04, { f: mtof(n), dur: 0.12, vol: 0.08, type: 'triangle' }); });
    },
    buy: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime;
      nz(c, A.master, t, { hp: 5000, dur: 0.15, vol: 0.12 });
      [84, 88, 91, 96].forEach(function (n, i) { voice(c, A.master, t + 0.05 + i * 0.06, { f: mtof(n), dur: 0.16, vol: 0.1, type: 'square' }); });
    },
    deny: function () { var c = ctx(); if (!c) return; var t = c.currentTime; voice(c, A.master, t, { f: 220, dur: 0.12, vol: 0.14, type: 'square', lp: 1200 }); voice(c, A.master, t + 0.13, { f: 180, dur: 0.18, vol: 0.14, type: 'square', lp: 1200 }); },
    mission: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime;
      [72, 76, 79, 84].forEach(function (n, i) { voice(c, A.master, t + i * 0.08, { f: mtof(n), dur: 0.2, vol: 0.12, type: 'triangle' }); voice(c, A.master, t + i * 0.08, { f: mtof(n + 12), dur: 0.1, vol: 0.04, type: 'square' }); });
    },
    newBest: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime;
      [67, 72, 76, 79, 84, 79, 84, 88].forEach(function (n, i) { voice(c, A.master, t + i * 0.09, { f: mtof(n), dur: 0.22, vol: 0.12, type: 'square', lp: 5000 }); });
      nz(c, A.master, t + 0.7, { hp: 4000, dur: 0.6, vol: 0.1 });
    },
    gameOver: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime;
      [67, 64, 60, 55].forEach(function (n, i) { voice(c, A.master, t + i * 0.13, { f: mtof(n), dur: 0.2, vol: 0.12, type: 'triangle' }); });
    },
    countTick: function (i) { var c = ctx(); if (!c) return; voice(c, A.master, c.currentTime, { f: mtof(79 + (i % 12)), dur: 0.04, vol: 0.05, type: 'square' }); },
    mystery: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime;
      for (var i = 0; i < 10; i++) voice(c, A.master, t + i * 0.035, { f: mtof(84 + (i * 5) % 12), dur: 0.05, vol: 0.07, type: 'square' });
      voice(c, A.master, t + 0.38, { f: mtof(96), dur: 0.3, vol: 0.1, type: 'triangle' });
    },
    close: function () { var c = ctx(); if (!c) return; var t = c.currentTime; nz(c, A.master, t, { bp: 800, to: 3000, q: 2, dur: 0.35, vol: 0.18 }); }
  };
  RR.sfx = S;

  /* ---------------------------------------------------------- music */
  // 126 BPM, 16 steps per bar, 8-bar loop. Chords: C - Am - F - G (x2).
  var BPM = 126, STEP = 60 / BPM / 4;
  var CH = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];
  var ROOT = [36, 33, 29, 31];
  var BASS_PAT = [0, null, 12, null, 0, null, 12, 0, null, 0, 12, null, 0, null, 12, 7];
  // lead hook (MIDI, per 16th step) for bars 5-8 (x = hold/rest)
  var HOOK = [
    [76, null, 79, null, 81, null, 79, null, 76, null, null, 74, 76, null, 72, null],
    [72, null, null, null, 74, null, 76, null, 72, null, 69, null, 72, null, null, null],
    [77, null, 76, null, 77, null, 81, null, 79, null, 77, null, 76, null, 74, null],
    [74, null, null, 71, 74, null, 79, null, 77, null, 76, null, 74, null, 71, null]
  ];
  var music = { on: false, mode: 'game', step: 0, next: 0, timer: 0, gain: null, target: 0.3 };
  function ensureGain(c) {
    if (!music.gain) {
      music.gain = c.createGain();
      music.gain.gain.value = 0.0001;
      music.gain.connect(A.master);
      music.gain.gain.setTargetAtTime(music.mode === 'game' ? 0.34 : 0.26, c.currentTime, 0.2);
    }
    return music.gain;
  }
  function kick(c, g, t) {
    var o = c.createOscillator(), v = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    v.gain.setValueAtTime(0.9, t); v.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(v); v.connect(g); o.start(t); o.stop(t + 0.25);
  }
  function schedStep(c, g, s, t) {
    var bar = Math.floor(s / 16) % 8, st = s % 16, ch = bar % 4;
    var game = music.mode === 'game';
    // drums
    if (game) {
      if (st % 4 === 0) kick(c, g, t);
      if (st === 4 || st === 12) { nz(c, g, t, { bp: 1800, q: 0.8, dur: 0.14, vol: 0.32 }); voice(c, g, t, { f: 190, to: 140, dur: 0.07, vol: 0.12, type: 'triangle' }); }
      if (st % 2 === 1) nz(c, g, t, { hp: 7500, dur: 0.035, vol: st % 4 === 3 ? 0.12 : 0.07 });
      if (bar === 7 && st >= 12) nz(c, g, t, { bp: 2400, q: 1, dur: 0.08, vol: 0.15 });
    } else if (st % 4 === 2) nz(c, g, t, { hp: 8000, dur: 0.03, vol: 0.04 });
    // bass
    var bp = BASS_PAT[st];
    if (bp != null) voice(c, g, t, { f: mtof(ROOT[ch] + bp), dur: STEP * 1.6, vol: game ? 0.22 : 0.12, type: 'sawtooth', lp: game ? 700 : 450, lpTo: 200, q: 4 });
    // arpeggio
    var chord = CH[ch];
    var an = chord[[0, 1, 2, 1][st % 4]] + 24 + (st >= 8 ? 12 : 0) * (st % 3 === 0 ? 1 : 0);
    if (st % 2 === 0) voice(c, g, t, { f: mtof(an), dur: STEP * 1.2, vol: game ? (bar >= 4 ? 0.035 : 0.06) : 0.04, type: 'square', lp: 3500 });
    // pad on bar starts
    if (st === 0) chord.forEach(function (n) { voice(c, g, t, { f: mtof(n + 12), dur: STEP * 15, vol: 0.035, type: 'triangle', att: 0.2 }); });
    // hook
    if (game && bar >= 4) {
      var hn = HOOK[ch][st];
      if (hn != null) {
        voice(c, g, t, { f: mtof(hn), dur: STEP * 1.8, vol: 0.08, type: 'square', lp: 2800 });
        voice(c, g, t, { f: mtof(hn), dur: STEP * 1.8, vol: 0.05, type: 'sawtooth', lp: 2000, detune: 8 });
      }
    }
  }
  function tick() {
    var c = A.ctx;
    if (!music.on || !c || A.muted || c.state !== 'running') return;
    var g = ensureGain(c);
    if (music.next < c.currentTime) music.next = c.currentTime + 0.05;
    while (music.next < c.currentTime + 0.14) {
      schedStep(c, g, music.step, music.next);
      music.step++;
      music.next += STEP;
    }
  }
  RR.music = {
    play: function (mode) {
      var c = A.ctx;
      music.mode = mode || 'game';
      if (!music.on) { music.on = true; music.step = 0; music.next = 0; }
      if (!music.timer) music.timer = setInterval(tick, 30);
      if (c) {
        var g = ensureGain(c);
        g.gain.cancelScheduledValues(c.currentTime);
        g.gain.setTargetAtTime(music.mode === 'game' ? 0.34 : 0.26, c.currentTime, 0.2);
      }
    },
    stop: function () {
      var c = A.ctx;
      music.on = false;
      if (music.timer) { clearInterval(music.timer); music.timer = 0; }
      if (c && music.gain) { music.gain.gain.cancelScheduledValues(c.currentTime); music.gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.05); }
    },
    get playing() { return music.on; },
    get mode() { return music.mode; }
  };
})();
