/*
 * Drift King — sound: engine hum, tyre screech and effects (no background music).
 * Everything is synthesised with WebAudio through Kit.audio (shared master gain,
 * so the mute button silences all of it). The engine runs only while driving.
 */
(function (root) {
  'use strict';
  var DK = root.DK || (root.DK = {});
  var A = Kit.audio;
  var S = DK.snd = {};

  var eng = null;       // engine nodes
  var scr = null;       // screech nodes

  function ctx() { return A.ctx; }

  function noiseBuffer(c) {
    var b = c.createBuffer(1, c.sampleRate * 1, c.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // Engine: a mellow sawtooth + triangle sub through a soft low-pass (a purr, not a buzz).
  // Tyre squeal: a TONAL "eeee" (triangle, ~800-1300 Hz) with a slow wobble and a fast rubbery
  // flutter, band-limited so it never gets shrill, plus just a touch of low grit.
  // (A plain band-passed white-noise loop sounds like hiss/static, so it is not used.)
  S.startEngine = function (pitch) {
    var c = ctx();
    if (!c || !A.master) return;
    S.stopEngine(true);
    try {
      var o1 = c.createOscillator(), o2 = c.createOscillator();
      var f = c.createBiquadFilter(), g = c.createGain(), m2 = c.createGain();
      o1.type = 'sawtooth'; o2.type = 'triangle';
      f.type = 'lowpass'; f.frequency.value = 480; f.Q.value = 0.9;
      m2.gain.value = 0.8;
      g.gain.value = 0.0001;
      o1.connect(f); o2.connect(m2); m2.connect(f); f.connect(g); g.connect(A.master);
      o1.start(); o2.start();
      g.gain.setTargetAtTime(0.05, c.currentTime, 0.2);
      // squeal
      var so = c.createOscillator(), wob = c.createOscillator(), flt = c.createOscillator();
      var wg = c.createGain(), fg = c.createGain(), bp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g2 = c.createGain();
      so.type = 'triangle'; so.frequency.value = 900;
      wob.type = 'sine'; wob.frequency.value = 5.5; wg.gain.value = 22;
      flt.type = 'sine'; flt.frequency.value = 31; fg.gain.value = 14;
      wob.connect(wg); wg.connect(so.frequency); flt.connect(fg); fg.connect(so.frequency);
      bp.type = 'bandpass'; bp.frequency.value = 1000; bp.Q.value = 1.2;
      lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.5;
      g2.gain.value = 0;
      so.connect(bp); bp.connect(lp); lp.connect(g2);
      // grit: noise low-passed well below the hiss range, very quiet
      var src = c.createBufferSource(); src.buffer = S._nb || (S._nb = noiseBuffer(c)); src.loop = true;
      var nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 900; nf.Q.value = 0.3;
      var ng = c.createGain(); ng.gain.value = 0.12;
      src.connect(nf); nf.connect(ng); ng.connect(g2);
      g2.connect(A.master);
      so.start(); wob.start(); flt.start(); src.start();
      eng = { o1: o1, o2: o2, f: f, g: g, pitch: pitch || 1 };
      scr = { so: so, wob: wob, flt: flt, src: src, bp: bp, g: g2, on: 0 };
    } catch (e) { eng = null; scr = null; }
  };

  S.updateEngine = function (speed, slip, air) {
    var c = ctx();
    if (!c || !eng) return;
    var t = c.currentTime;
    var sl = Math.abs(slip);
    var base = (52 + speed * 6.5 + sl * 26 + (air ? 30 : 0)) * eng.pitch;
    eng.o1.frequency.setTargetAtTime(base, t, 0.06);
    eng.o2.frequency.setTargetAtTime(base * 0.5, t, 0.06);
    eng.f.frequency.setTargetAtTime(360 + speed * 38 + sl * 250, t, 0.1);
    var k = air ? 0 : Math.max(0, Math.min(1, (sl - 0.12) * 2.2));
    // fade in a little slower than it fades out, so short wiggles don't "chirp"
    scr.g.gain.setTargetAtTime(k * 0.06, t, k > scr.on ? 0.06 : 0.05);
    scr.on = k;
    var sf = 820 + sl * 420 + speed * 12;
    scr.so.frequency.setTargetAtTime(sf, t, 0.08);
    scr.bp.frequency.setTargetAtTime(sf * 1.1, t, 0.08);
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
      try {
        s.g.gain.setTargetAtTime(0, t, 0.02);
        s.src.stop(t + 0.2); s.so.stop(t + 0.2); s.wob.stop(t + 0.2); s.flt.stop(t + 0.2);
      } catch (er) { /* ignore */ }
    }
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
