/*
 * Rail Rush — audio.js
 * One-shot sound effects (no background music). Everything is synthesised with
 * WebAudio and routed through Kit.audio.master so the shared mute button
 * silences it.
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
    // gain must be silent BEFORE t too (its default is 1): otherwise the first sample of a note
    // that starts between two samples leaks through at full volume = a click.
    g.gain.value = 0;
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
    g.gain.value = 0;
    g.gain.setValueAtTime(o.vol == null ? 0.2 : o.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.03);
  }

  /* ------------------------------------------------------------ mix */
  // The effects share one gain into the shared master (so mute still works).
  var bus = null;
  function D(c) {
    if (!bus || bus.c !== c) {
      var sfxG = c.createGain(); sfxG.gain.value = 1; sfxG.connect(A.master);
      bus = { c: c, sfx: sfxG };
    }
    return bus.sfx;
  }
  // Soft bell: sine body plus two quick upper partials ("ding" instead of a square "beep").
  function bell(c, dest, t, f, dur, vol) {
    voice(c, dest, t, { f: f, dur: dur, vol: vol, type: 'sine', att: 0.003 });
    voice(c, dest, t, { f: f * 2, dur: dur * 0.55, vol: vol * 0.32, type: 'sine', att: 0.002 });
    voice(c, dest, t, { f: f * 3.01, dur: dur * 0.25, vol: vol * 0.14, type: 'sine', att: 0.002 });
  }

  /* ------------------------------------------------------------ sfx */
  var coinStreak = 0, lastCoin = 0;
  // a coin streak walks up and back down a pentatonic scale (one octave), so long coin lines
  // stay musical instead of climbing into shrill territory and sitting there
  var COIN_LADDER = [0, 2, 4, 7, 9, 12, 14, 12, 9, 7, 4, 2];
  var S = {
    click: function () { var c = ctx(); if (!c) return; voice(c, D(c), c.currentTime, { f: 880, to: 1250, dur: 0.06, vol: 0.13, type: 'triangle' }); },
    hover: function () { var c = ctx(); if (!c) return; voice(c, D(c), c.currentTime, { f: 1200, dur: 0.03, vol: 0.035, type: 'sine' }); },
    jump: function (big) {
      var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c);
      voice(c, d, t, { f: big ? 200 : 290, to: big ? 1050 : 720, dur: big ? 0.3 : 0.17, vol: 0.2, type: 'triangle', lp: 2400 });
      if (big) voice(c, d, t + 0.04, { f: 400, to: 1600, dur: 0.24, vol: 0.06, type: 'sine' });
      nz(c, d, t, { bp: 900, to: 2600, q: 0.9, dur: big ? 0.26 : 0.14, vol: 0.07 });
    },
    land: function (hard) {
      var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c);
      voice(c, d, t, { f: hard ? 180 : 140, to: 60, dur: 0.1, vol: hard ? 0.3 : 0.2, type: 'triangle' });
      nz(c, d, t, { lp: 900, dur: 0.08, vol: 0.1 });
    },
    roll: function () { var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c); nz(c, d, t, { lp: 1500, to: 280, dur: 0.3, vol: 0.18 }); voice(c, d, t, { f: 400, to: 150, dur: 0.16, vol: 0.1, type: 'triangle' }); },
    swipe: function (dir) { var c = ctx(); if (!c) return; var t = c.currentTime; nz(c, D(c), t, { bp: dir < 0 ? 950 : 1150, to: dir < 0 ? 380 : 460, q: 1.3, dur: 0.14, vol: 0.24 }); },
    coin: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c);
      if (t - lastCoin < 0.45) coinStreak = (coinStreak + 1) % COIN_LADDER.length; else coinStreak = 0;
      lastCoin = t;
      var base = 76 + COIN_LADDER[coinStreak];
      bell(c, d, t, mtof(base), 0.1, 0.12);
      bell(c, d, t + 0.055, mtof(base + 7), 0.22, 0.13);
    },
    power: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c);
      [60, 64, 67, 72, 76, 79, 84].forEach(function (n, i) { voice(c, d, t + i * 0.045, { f: mtof(n), dur: 0.16, vol: 0.11, type: 'triangle' }); voice(c, d, t + i * 0.045, { f: mtof(n), dur: 0.1, vol: 0.035, type: 'square', lp: 2500 }); });
      bell(c, d, t + 0.32, mtof(96), 0.4, 0.06);
      nz(c, d, t, { bp: 5000, q: 0.7, dur: 0.4, vol: 0.04 });
    },
    powerEnd: function () { var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c); [79, 72, 67].forEach(function (n, i) { voice(c, d, t + i * 0.07, { f: mtof(n), dur: 0.12, vol: 0.09, type: 'triangle' }); }); },
    stumble: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c);
      voice(c, d, t, { f: 520, to: 180, dur: 0.22, vol: 0.2, type: 'square', lp: 1600 });
      nz(c, d, t, { lp: 1500, to: 200, dur: 0.2, vol: 0.25 });
      voice(c, d, t + 0.25, { f: 880, dur: 0.1, vol: 0.13, type: 'triangle' });
      voice(c, d, t + 0.4, { f: 880, dur: 0.1, vol: 0.13, type: 'triangle' });
    },
    crash: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c);
      nz(c, d, t, { lp: 2200, to: 80, dur: 0.5, vol: 0.45 });
      voice(c, d, t, { f: 180, to: 50, dur: 0.35, vol: 0.35, type: 'sawtooth', lp: 900 });
      // cartoon "boing" + slide whistle down
      voice(c, d, t + 0.12, { f: 300, to: 900, slide: 0.08, dur: 0.3, vol: 0.14, type: 'sine' });
      voice(c, d, t + 0.4, { f: 1400, to: 220, dur: 0.7, vol: 0.12, type: 'sine' });
    },
    horn: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c);
      [0, 0.32].forEach(function (dl) {
        voice(c, d, t + dl, { f: 311, dur: 0.26, vol: 0.08, type: 'sawtooth', lp: 1300, att: 0.03 });
        voice(c, d, t + dl, { f: 392, dur: 0.26, vol: 0.08, type: 'sawtooth', lp: 1300, att: 0.03 });
      });
    },
    boardOn: function () { var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c); voice(c, d, t, { f: 200, to: 1200, dur: 0.35, vol: 0.14, type: 'sawtooth', lp: 2400 }); nz(c, d, t, { bp: 1500, to: 4000, dur: 0.35, vol: 0.1 }); bell(c, d, t + 0.3, mtof(88), 0.3, 0.07); },
    boardBreak: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c);
      nz(c, d, t, { bp: 2400, q: 0.6, to: 900, dur: 0.3, vol: 0.28 });
      voice(c, d, t, { f: 170, to: 60, dur: 0.18, vol: 0.22, type: 'triangle' });
      [96, 91, 84, 79].forEach(function (n, i) { voice(c, d, t + i * 0.04, { f: mtof(n), dur: 0.12, vol: 0.08, type: 'triangle' }); });
    },
    buy: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c);
      nz(c, d, t, { bp: 6000, q: 0.8, dur: 0.15, vol: 0.06 });
      [84, 88, 91, 96].forEach(function (n, i) { bell(c, d, t + 0.05 + i * 0.06, mtof(n), 0.22, 0.1); });
    },
    deny: function () { var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c); voice(c, d, t, { f: 220, dur: 0.12, vol: 0.14, type: 'square', lp: 1000 }); voice(c, d, t + 0.13, { f: 180, dur: 0.18, vol: 0.14, type: 'square', lp: 1000 }); },
    mission: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c);
      [72, 76, 79, 84].forEach(function (n, i) { voice(c, d, t + i * 0.08, { f: mtof(n), dur: 0.2, vol: 0.12, type: 'triangle' }); bell(c, d, t + i * 0.08, mtof(n + 12), 0.14, 0.035); });
    },
    newBest: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c);
      [67, 72, 76, 79, 84, 79, 84, 88].forEach(function (n, i) { voice(c, d, t + i * 0.09, { f: mtof(n), dur: 0.22, vol: 0.12, type: 'triangle' }); voice(c, d, t + i * 0.09, { f: mtof(n), dur: 0.16, vol: 0.04, type: 'square', lp: 3000 }); });
      bell(c, d, t + 0.72, mtof(96), 0.6, 0.07);
      nz(c, d, t + 0.7, { bp: 7000, q: 0.7, dur: 0.6, vol: 0.05 });
    },
    gameOver: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c);
      [67, 64, 60, 55].forEach(function (n, i) { voice(c, d, t + i * 0.13, { f: mtof(n), dur: 0.22, vol: 0.13, type: 'triangle' }); });
    },
    countTick: function (i) { var c = ctx(); if (!c) return; voice(c, D(c), c.currentTime, { f: mtof(79 + (i % 12)), dur: 0.05, vol: 0.06, type: 'triangle' }); },
    mystery: function () {
      var c = ctx(); if (!c) return; var t = c.currentTime, d = D(c);
      for (var i = 0; i < 10; i++) voice(c, d, t + i * 0.035, { f: mtof(79 + (i * 5) % 12), dur: 0.06, vol: 0.07, type: 'triangle' });
      bell(c, d, t + 0.38, mtof(96), 0.4, 0.1);
    },
    edge: function () { var c = ctx(); if (!c) return; voice(c, D(c), c.currentTime, { f: 130, to: 90, dur: 0.08, vol: 0.16, type: 'triangle' }); },
    close: function () { var c = ctx(); if (!c) return; var t = c.currentTime; nz(c, D(c), t, { bp: 700, to: 2400, q: 1.5, dur: 0.35, vol: 0.2 }); }
  };
  RR.sfx = S;
})();
