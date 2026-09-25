/*
 * Drift King — sound: engine hum, tyre screech, a light music loop and effects.
 * Everything is synthesised with WebAudio through Kit.audio (shared master gain,
 * so the mute button silences all of it).
 */
(function (root) {
  'use strict';
  var DK = root.DK || (root.DK = {});
  var A = Kit.audio;
  var S = DK.snd = {};

  var eng = null;       // engine nodes
  var scr = null;       // screech nodes
  var musicOn = true, musicTimer = 0, nextNote = 0, step = 0, musicGain = null, musicLevel = 0.55;

  function ctx() { return A.ctx; }

  function noiseBuffer(c) {
    var b = c.createBuffer(1, c.sampleRate * 1, c.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  S.startEngine = function (pitch) {
    var c = ctx();
    if (!c || !A.master) return;
    S.stopEngine(true);
    try {
      var o1 = c.createOscillator(), o2 = c.createOscillator();
      var f = c.createBiquadFilter(), g = c.createGain();
      o1.type = 'sawtooth'; o2.type = 'square';
      f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 2;
      g.gain.value = 0.0001;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(A.master);
      o1.start(); o2.start();
      g.gain.setTargetAtTime(0.045, c.currentTime, 0.2);
      var src = c.createBufferSource(); src.buffer = noiseBuffer(c); src.loop = true;
      var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 4;
      var g2 = c.createGain(); g2.gain.value = 0;
      src.connect(bp); bp.connect(g2); g2.connect(A.master); src.start();
      eng = { o1: o1, o2: o2, f: f, g: g, pitch: pitch || 1 };
      scr = { src: src, bp: bp, g: g2 };
    } catch (e) { eng = null; scr = null; }
  };

  S.updateEngine = function (speed, slip, air) {
    var c = ctx();
    if (!c || !eng) return;
    var t = c.currentTime;
    var base = (55 + speed * 7 + Math.abs(slip) * 30 + (air ? 25 : 0)) * eng.pitch;
    eng.o1.frequency.setTargetAtTime(base, t, 0.05);
    eng.o2.frequency.setTargetAtTime(base * 0.5, t, 0.05);
    eng.f.frequency.setTargetAtTime(400 + speed * 40, t, 0.1);
    var sl = Math.abs(slip);
    var sv = air ? 0 : Math.max(0, Math.min(1, (sl - 0.12) * 2.2)) * 0.13;
    scr.g.gain.setTargetAtTime(sv, t, 0.04);
    scr.bp.frequency.setTargetAtTime(1500 + sl * 1500, t, 0.05);
  };

  S.stopEngine = function (now) {
    var c = ctx();
    if (!c) return;
    var t = c.currentTime;
    if (eng) {
      var e = eng; eng = null;
      try {
        e.g.gain.setTargetAtTime(0.0001, t, now ? 0.01 : 0.15);
        e.o1.stop(t + (now ? 0.05 : 0.6)); e.o2.stop(t + (now ? 0.05 : 0.6));
      } catch (er) { /* ignore */ }
    }
    if (scr) {
      var s = scr; scr = null;
      try { s.g.gain.setTargetAtTime(0, t, 0.02); s.src.stop(t + 0.2); } catch (er) { /* ignore */ }
    }
  };

  /* ------------------------------------------------------------- music */
  // Cheerful 8-bar loop: bass + pluck arpeggio + soft hat. 124 bpm.
  var BPM = 124, SPB = 60 / BPM / 2; // eighth notes
  var CHORDS = [
    [60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67],
    [60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 71]
  ];
  var ARP = [0, 1, 2, 3, 2, 1, 2, 3];
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function note(freq, t, dur, type, vol, dest) {
    var c = ctx();
    var o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function hat(t, vol, dest) {
    var c = ctx();
    if (!S._nb) S._nb = noiseBuffer(c);
    var src = c.createBufferSource(); src.buffer = S._nb;
    var f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    var g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + 0.06);
  }
  function schedule() {
    var c = ctx();
    if (!c || !musicGain) return;
    if (nextNote < c.currentTime - 0.2) nextNote = c.currentTime + 0.05;
    while (nextNote < c.currentTime + 0.25) {
      var bar = Math.floor(step / 8) % 8, s8 = step % 8;
      var ch = CHORDS[bar];
      if (!A.muted) {
        if (s8 === 0 || s8 === 3 || s8 === 6) note(mtof(ch[0] - 24), nextNote, SPB * 1.6, 'triangle', 0.32, musicGain);
        note(mtof(ch[ARP[s8]] + 12), nextNote, SPB * 0.9, 'square', 0.045, musicGain);
        if (s8 % 2 === 1) hat(nextNote, 0.06, musicGain);
        if (s8 === 4) note(mtof(ch[2] + 12), nextNote, SPB * 1.8, 'triangle', 0.09, musicGain);
      }
      nextNote += SPB;
      step++;
    }
  }
  S.setMusic = function (on) {
    musicOn = !!on;
    var c = ctx();
    if (!musicOn) {
      if (musicTimer) { clearInterval(musicTimer); musicTimer = 0; }
      if (musicGain) { try { musicGain.gain.setTargetAtTime(0, c.currentTime, 0.05); } catch (e) { /* */ } }
      return;
    }
    S.ensureMusic();
  };
  S.musicOn = function () { return musicOn; };
  S.ensureMusic = function () {
    var c = ctx();
    if (!musicOn || !c || !A.master) return;
    if (!musicGain) { musicGain = c.createGain(); musicGain.connect(A.master); }
    musicGain.gain.setTargetAtTime(0.5 * musicLevel, c.currentTime, 0.1);
    if (!musicTimer) { nextNote = c.currentTime + 0.1; musicTimer = setInterval(schedule, 60); }
  };
  S.musicLevel = function (lv) {
    musicLevel = lv;
    var c = ctx();
    if (musicGain && c && musicOn) musicGain.gain.setTargetAtTime(0.5 * lv, c.currentTime, 0.15);
  };

  /* ----------------------------------------------------------- effects */
  var T = function (o) { A.tone(o); };
  S.coin = function (streak) {
    var k = Math.pow(2, Math.min(streak, 12) / 24);
    T({ freq: 988 * k, type: 'square', dur: 0.06, vol: 0.13 });
    T({ freq: 1480 * k, type: 'square', dur: 0.14, vol: 0.13, delay: 0.055 });
  };
  S.gem = function () { [1047, 1319, 1568, 2093].forEach(function (f, i) { T({ freq: f, type: 'triangle', dur: 0.12, vol: 0.2, delay: i * 0.04 }); }); };
  S.perfect = function (combo) {
    var base = 523 * Math.pow(2, Math.min(combo - 1, 10) / 12);
    T({ freq: base, type: 'triangle', dur: 0.1, vol: 0.25 });
    T({ freq: base * 1.26, type: 'triangle', dur: 0.1, vol: 0.25, delay: 0.06 });
    T({ freq: base * 1.5, type: 'triangle', dur: 0.18, vol: 0.25, delay: 0.12 });
    if (combo >= 5) T({ freq: base * 2, type: 'sine', dur: 0.25, vol: 0.18, delay: 0.18 });
  };
  S.close = function () { T({ freq: 300, to: 900, type: 'sine', dur: 0.2, vol: 0.2 }); };
  S.jump = function () { A.noise({ dur: 0.35, vol: 0.18, filter: 2500, to: 600 }); T({ freq: 220, to: 660, type: 'triangle', dur: 0.3, vol: 0.2 }); };
  S.land = function () { T({ freq: 140, to: 60, type: 'triangle', dur: 0.15, vol: 0.35 }); A.noise({ dur: 0.15, vol: 0.2, filter: 900, to: 200 }); };
  S.fall = function () {
    T({ freq: 900, to: 180, type: 'sine', dur: 1.1, vol: 0.22 });
    T({ freq: 180, to: 90, type: 'square', dur: 0.12, vol: 0.12 });
  };
  S.poof = function () { A.noise({ dur: 0.5, vol: 0.28, filter: 1400, to: 120 }); T({ freq: 200, to: 80, type: 'sine', dur: 0.3, vol: 0.2 }); };
  S.zone = function () { [659, 784, 988, 1319].forEach(function (f, i) { T({ freq: f, type: 'triangle', dur: 0.22, vol: 0.2, delay: i * 0.09 }); }); };
  S.click = function () { T({ freq: 700, type: 'square', dur: 0.04, vol: 0.12 }); T({ freq: 1050, type: 'square', dur: 0.05, vol: 0.1, delay: 0.035 }); };
  S.buy = function () { Kit.sfx.power(); T({ freq: 1568, type: 'triangle', dur: 0.3, vol: 0.2, delay: 0.26 }); };
  S.deny = function () { T({ freq: 200, type: 'square', dur: 0.1, vol: 0.14 }); T({ freq: 150, type: 'square', dur: 0.14, vol: 0.14, delay: 0.1 }); };
  S.best = function () { [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { T({ freq: f, type: 'square', dur: 0.14, vol: 0.12, delay: i * 0.08 }); T({ freq: f / 2, type: 'triangle', dur: 0.14, vol: 0.2, delay: i * 0.08 }); }); };
  S.gift = function () { A.noise({ dur: 0.3, vol: 0.25, filter: 3000, to: 500 }); Kit.sfx.win(); };
  S.mission = function () { [784, 1047, 1319].forEach(function (f, i) { T({ freq: f, type: 'square', dur: 0.1, vol: 0.12, delay: i * 0.07 }); }); };
  S.start = function () { T({ freq: 330, to: 660, type: 'square', dur: 0.15, vol: 0.14 }); T({ freq: 660, to: 990, type: 'square', dur: 0.15, vol: 0.12, delay: 0.12 }); };
  S.flick = function () { T({ freq: 180, to: 120, type: 'triangle', dur: 0.05, vol: 0.12 }); };
})(typeof window !== 'undefined' ? window : globalThis);
