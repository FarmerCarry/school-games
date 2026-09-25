/*
 * Moto Madness — synthesized sound. Engine = two oscillators (sawtooth + square sub)
 * through a low-pass filter; pitch follows RPM with fake gear shifts.
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
      var f = ctx.createBiquadFilter(), g = ctx.createGain(), lg = ctx.createGain(), trem = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; lfo.type = 'square';
      o1.frequency.value = 50; o2.frequency.value = 25; lfo.frequency.value = 25;
      f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 4;
      g.gain.value = 0;
      trem.gain.value = 0.8; lg.gain.value = 0.2;
      lfo.connect(lg); lg.connect(trem.gain);
      var m2 = ctx.createGain(); m2.gain.value = 0.55;
      o1.connect(f); o2.connect(m2); m2.connect(f);
      f.connect(trem); trem.connect(g); g.connect(au.master);
      o1.start(); o2.start(); lfo.start();
      eng = { o1: o1, o2: o2, lfo: lfo, f: f, g: g, rpm: 0, gas: 0 };
    } catch (e) { eng = null; }
    return eng;
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
      target = 0.15 + Math.min(1, frac) * 0.7 + e.gas * 0.12;
    }
    e.rpm += (target - e.rpm) * Math.min(1, dt * (target > e.rpm ? 7 : 4));
    var freq = 42 + e.rpm * 110;
    e.o1.frequency.setTargetAtTime(freq, now, 0.03);
    e.o2.frequency.setTargetAtTime(freq * 0.5, now, 0.03);
    e.lfo.frequency.setTargetAtTime(freq * 0.5, now, 0.03);
    e.f.frequency.setTargetAtTime(260 + e.gas * 900 + e.rpm * 700, now, 0.05);
    e.g.gain.setTargetAtTime(on ? (0.07 + e.gas * 0.07) : 0, now, on ? 0.05 : 0.08);
  };
  A.silence = function () { if (eng && au.ctx) eng.g.gain.setTargetAtTime(0, au.ctx.currentTime, 0.05); };

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
  A.boost = function () { noise({ dur: 0.5, vol: 0.2, filter: 800, to: 5000 }); tone({ freq: 200, to: 800, type: 'sawtooth', dur: 0.4, vol: 0.1 }); };
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
