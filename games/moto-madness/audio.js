/*
 * Moto Madness — synthesized sound (no audio files).
 * Engine: a sawtooth "firing" note + a triangle sub-octave through two gentle low-pass
 * filters (so it growls instead of buzzing), with a soft sine "putt-putt" pulse at the
 * firing rate. Pitch follows RPM with fake gear shifts; letting off the gas at high revs
 * gives a couple of exhaust pops. A light music loop plays underneath (toggle in pause).
 */
(function () {
  'use strict';
  var A = window.MMA = {};
  var au = Kit.audio;
  var eng = null;

  function ensureEngine() {
    var ctx = au.ctx;
    if (!ctx || eng) return eng;
    try {
      var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lfo = ctx.createOscillator();
      var f = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), g = ctx.createGain(), lg = ctx.createGain(), am = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'triangle'; lfo.type = 'sine';
      o1.frequency.value = 45; o2.frequency.value = 22.5; lfo.frequency.value = 22.5;
      f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 1.6;
      f2.type = 'lowpass'; f2.frequency.value = 2300; f2.Q.value = 0.5;
      g.gain.value = 0;
      am.gain.value = 0.78; lg.gain.value = 0.22;           // 0.56..1.0 soft pulse, never silent
      lfo.connect(lg); lg.connect(am.gain);
      var m1 = ctx.createGain(); m1.gain.value = 0.7;
      var m2 = ctx.createGain(); m2.gain.value = 0.45;
      o1.connect(m1); m1.connect(f); o2.connect(m2); m2.connect(f);
      f.connect(f2); f2.connect(am); am.connect(g); g.connect(au.master);
      o1.start(); o2.start(); lfo.start();
      eng = { o1: o1, o2: o2, lfo: lfo, f: f, g: g, rpm: 0, gas: 0, wasGas: false, popCd: 0 };
    } catch (e) { eng = null; }
    return eng;
  }

  // a short low "bup" from the exhaust (lift-off crackle)
  function pop(delay, vol) {
    au.noise({ dur: 0.07, vol: vol, filter: 700, to: 150, delay: delay });
    au.tone({ freq: 95 + Math.random() * 30, to: 55, type: 'triangle', dur: 0.07, vol: vol * 0.9, delay: delay });
  }

  // on: engine audible; speed: rear wheel surface speed (px/s); gas: bool; air: bool
  A.engine = function (on, speed, gas, air, dt) {
    var e = ensureEngine();
    if (!e) return;
    var ctx = au.ctx, now = ctx.currentTime;
    e.gas += ((gas ? 1 : 0) - e.gas) * Math.min(1, dt * 8);
    var sp = Math.abs(speed), target;
    if (air && gas) target = 1;
    else {
      // four gears
      var gears = [0, 240, 480, 720, 1600], gi = 0;
      while (gi < gears.length - 2 && sp > gears[gi + 1]) gi++;
      var frac = (sp - gears[gi]) / (gears[gi + 1] - gears[gi]);
      target = 0.12 + Math.min(1, frac) * 0.72 + e.gas * 0.12;
    }
    e.rpm += (target - e.rpm) * Math.min(1, dt * (target > e.rpm ? 7 : 4));
    // lift off the throttle at high revs: "bup-bup"
    if (e.popCd > 0) e.popCd -= dt;
    if (on && e.wasGas && !gas && e.rpm > 0.62 && e.popCd <= 0 && !au.muted) {
      pop(0.03, 0.11); pop(0.13 + Math.random() * 0.05, 0.08);
      if (Math.random() < 0.5) pop(0.27 + Math.random() * 0.06, 0.06);
      e.popCd = 1.2;
    }
    e.wasGas = gas;
    var freq = 44 + e.rpm * 180;
    e.o1.frequency.setTargetAtTime(freq, now, 0.03);
    e.o2.frequency.setTargetAtTime(freq * 0.5, now, 0.03);
    e.lfo.frequency.setTargetAtTime(freq * 0.5, now, 0.03);
    e.f.frequency.setTargetAtTime(Math.min(2400, 220 + freq * (3 + e.gas * 3.2)), now, 0.05);
    e.g.gain.setTargetAtTime(on ? (0.052 + e.gas * 0.048) : 0, now, on ? 0.05 : 0.08);
  };
  A.silence = function () { if (eng && au.ctx) eng.g.gain.setTargetAtTime(0, au.ctx.currentTime, 0.05); };

  /* ------------------------------------------------------------ music */
  // A short upbeat rock loop (A minor, 144 bpm): driving 8th-note bass, soft kick/snare,
  // and a mellow filtered lead that only comes in every other pass so it doesn't nag.
  // Scheduled a little ahead from the game loop (so it stops when the tab is hidden).
  var mus = { on: true, gain: null, level: 1, next: 0, step: 0, nb: null };
  var BPM = 144, E8 = 60 / BPM / 2;
  var CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];     // Am F C G
  var LEAD = [
    [76, -1, 74, 76, -1, 72, 74, -1], [72, -1, 69, 72, -1, 74, 72, -1], [72, 74, 76, -1, 79, -1, 76, -1], [74, -1, 71, 74, -1, 76, 74, -1],
    [81, -1, 79, 76, -1, 74, 76, -1], [77, -1, 76, 72, -1, 69, 72, -1], [72, -1, 76, 79, -1, 84, 79, -1], [79, -1, -1, 74, -1, 71, -1, -1]
  ];
  var BASS8 = [0, 0, 12, 0, 0, 0, 12, 7];
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function mnote(freq, t, dur, type, vol, cutoff) {
    var c = au.ctx, o = c.createOscillator(), g = c.createGain(), dest = mus.gain;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    if (cutoff) { var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.7; g.connect(f); f.connect(dest); }
    else g.connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function kick(t) {
    var c = au.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(mus.gain); o.start(t); o.stop(t + 0.22);
  }
  function snare(t) {
    var c = au.ctx;
    if (!mus.nb) { mus.nb = c.createBuffer(1, c.sampleRate * 0.3 | 0, c.sampleRate); var d = mus.nb.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = mus.nb; f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(f); f.connect(g); g.connect(mus.gain); src.start(t); src.stop(t + 0.14);
    mnote(190, t, 0.08, 'triangle', 0.16);
  }
  function schedule() {
    var c = au.ctx;
    if (mus.next < c.currentTime - 0.2) mus.next = c.currentTime + 0.05;
    while (mus.next < c.currentTime + 0.2) {
      var t = mus.next, s8 = mus.step % 8, bar = Math.floor(mus.step / 8) % 8, pass = Math.floor(mus.step / 64) % 2;
      var ch = CH[bar % 4];
      mnote(mtof(ch[0] - 12 + BASS8[s8]), t, E8 * 0.9, 'triangle', 0.3, 0);
      if (s8 === 0 || s8 === 4 || (s8 === 7 && bar % 2 === 1)) kick(t);
      if (s8 === 2 || s8 === 6) snare(t);
      if (s8 % 2 === 1) mnote(mtof(ch[(s8 >> 1) % 3] + 12), t, E8 * 0.8, 'triangle', 0.07, 0);
      if (pass === 1 || bar >= 4) { var n = LEAD[bar][s8]; if (n > 0) mnote(mtof(n), t, E8 * 1.7, 'square', 0.06, 1700); }
      mus.next += E8; mus.step++;
    }
  }
  // call every frame; level: 1 = normal, lower to duck (e.g. under the win jingle)
  A.music = function (level) {
    var c = au.ctx;
    if (!c || !au.master) return;
    if (!mus.gain) { mus.gain = c.createGain(); mus.gain.gain.value = 0; mus.gain.connect(au.master); mus.next = c.currentTime + 0.1; }
    var want = mus.on ? 0.42 * (level == null ? 1 : level) : 0;
    if (want !== mus.level) { mus.gain.gain.setTargetAtTime(want, c.currentTime, 0.15); mus.level = want; }
    if (!mus.on || au.muted || c.state !== 'running' && c.state !== 'suspended') return;
    if (want > 0) schedule(); else mus.next = c.currentTime + 0.1;
  };
  A.setMusic = function (on) { mus.on = !!on; };
  A.musicOn = function () { return mus.on; };

  var tone = function (o) { au.tone(o); }, noise = function (o) { au.noise(o); };
  A.land = function (v) {
    var k = Math.min(1, v / 1400);
    noise({ dur: 0.12 + k * 0.15, vol: 0.12 + k * 0.3, filter: 900, to: 120 });
    tone({ freq: 140, to: 50, type: 'triangle', dur: 0.14, vol: 0.2 + k * 0.2 });
  };
  A.bump = function () { tone({ freq: 110, to: 60, type: 'triangle', dur: 0.08, vol: 0.12 }); };
  A.flip = function (n) {
    var base = [523, 659, 784, 1047, 1319];
    for (var i = 0; i < 4 + n; i++) tone({ freq: base[i % 5] * (i >= 5 ? 2 : 1), type: 'square', dur: 0.1, vol: 0.12, delay: i * 0.06 });
    tone({ freq: 1568, type: 'triangle', dur: 0.35, vol: 0.18, delay: (4 + n) * 0.06 });
  };
  A.crash = function () {
    tone({ freq: 700, to: 90, type: 'triangle', dur: 0.45, vol: 0.3 });
    noise({ dur: 0.35, vol: 0.35, filter: 2000, to: 200 });
    tone({ freq: 220, to: 110, type: 'square', dur: 0.1, vol: 0.12, delay: 0.05 });
  };
  A.bonk = function () { tone({ freq: 380, to: 180, type: 'sine', dur: 0.12, vol: 0.25 }); };
  A.respawn = function () { tone({ freq: 400, to: 900, type: 'sine', dur: 0.14, vol: 0.2 }); };
  A.checkpoint = function () { [784, 988, 1175].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.18, vol: 0.25, delay: i * 0.08 }); }); };
  A.finish = function () { Kit.sfx.win(); noise({ dur: 0.5, vol: 0.15, filter: 5000, to: 1500, delay: 0.1 }); };
  A.bounce = function () {
    tone({ freq: 180, to: 720, type: 'sine', dur: 0.28, vol: 0.35 });
    tone({ freq: 360, to: 1100, type: 'triangle', dur: 0.2, vol: 0.12, delay: 0.03 });
  };
  A.boost = function () { noise({ dur: 0.45, vol: 0.16, filter: 700, to: 3000 }); tone({ freq: 200, to: 800, type: 'triangle', dur: 0.4, vol: 0.16 }); };
  A.crate = function () { noise({ dur: 0.12, vol: 0.3, filter: 2500, to: 600 }); tone({ freq: 240, to: 140, type: 'square', dur: 0.06, vol: 0.12 }); };
  A.crateBreak = function () { noise({ dur: 0.18, vol: 0.2, filter: 3000, to: 400 }); };
  A.creak = function () { tone({ freq: 160, to: 120, type: 'sawtooth', dur: 0.12, vol: 0.06 }); };
  A.plank = function () { tone({ freq: 300, to: 80, type: 'triangle', dur: 0.3, vol: 0.12 }); };
  A.thunk = function () { tone({ freq: 120, to: 60, type: 'square', dur: 0.1, vol: 0.15 }); noise({ dur: 0.1, vol: 0.15, filter: 600 }); };
  A.boulder = function () { noise({ dur: 1.2, vol: 0.35, filter: 300, to: 80 }); tone({ freq: 70, to: 40, type: 'sawtooth', dur: 1.0, vol: 0.15 }); };
  A.boulderBreak = function () { Kit.sfx.boom(); };
  A.rumble = function () { noise({ dur: 0.25, vol: 0.18, filter: 250, to: 60 }); };
  A.thud = function () { tone({ freq: 160, to: 70, type: 'sine', dur: 0.12, vol: 0.25 }); };
  A.loop = function () { tone({ freq: 400, to: 1400, type: 'sine', dur: 0.4, vol: 0.2 }); };
  A.wheelie = function () { tone({ freq: 660, type: 'square', dur: 0.08, vol: 0.12 }); tone({ freq: 880, type: 'square', dur: 0.12, vol: 0.12, delay: 0.08 }); };
  A.lift = function () { tone({ freq: 90, to: 140, type: 'sawtooth', dur: 0.5, vol: 0.1 }); };
  A.liftStop = function () { tone({ freq: 140, to: 70, type: 'square', dur: 0.1, vol: 0.12 }); };
  A.star = function (i) { tone({ freq: [880, 1109, 1319][i] || 1319, type: 'triangle', dur: 0.25, vol: 0.3 }); tone({ freq: ([880, 1109, 1319][i] || 1319) * 2, type: 'sine', dur: 0.3, vol: 0.12, delay: 0.05 }); };
  A.click = function () { Kit.sfx.click(); };
  A.go = function () { tone({ freq: 523, type: 'square', dur: 0.08, vol: 0.12 }); tone({ freq: 1047, type: 'square', dur: 0.14, vol: 0.12, delay: 0.08 }); };
  A.unlock = function () { Kit.sfx.power(); };
})();
