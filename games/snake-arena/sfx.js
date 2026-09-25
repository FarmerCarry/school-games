/* Snake Arena — synthesized sounds (WebAudio via Kit.audio). */
(function () {
  'use strict';
  var SA = window.SA;
  var A = Kit.audio;
  function tone(o) { A.tone(o); }
  function now() { return A.ctx ? A.ctx.currentTime : 0; }

  var lastEat = -1, eatStep = 0;
  var boost = null; // continuous boost hum nodes

  var sfx = {
    eat: function (big) {
      var t = now();
      if (t - lastEat < (big ? 0.03 : 0.05)) return;
      if (t - lastEat > 0.45) eatStep = 0;
      lastEat = t;
      eatStep = Math.min(eatStep + 1, 16);
      var f = 480 * Math.pow(1.055, eatStep);
      tone({ freq: f, to: f * 1.6, type: 'sine', dur: big ? 0.09 : 0.06, vol: big ? 0.17 : 0.09 });
      if (big) tone({ freq: f * 2, type: 'triangle', dur: 0.05, vol: 0.06, delay: 0.03 });
    },
    boostStart: function () { A.noise({ dur: 0.22, vol: 0.12, filter: 2600, to: 500 }); },
    kill: function (combo) {
      A.noise({ dur: 0.18, vol: 0.28, filter: 3000, to: 300 });
      tone({ freq: 300, to: 900, type: 'square', dur: 0.1, vol: 0.14 });
      var base = 660 * Math.pow(1.12, Math.min(combo || 0, 5));
      [1, 1.25, 1.5, 2].forEach(function (m, i) {
        tone({ freq: base * m, type: 'triangle', dur: 0.12, vol: 0.2, delay: 0.08 + i * 0.07 });
      });
    },
    popFar: function (vol) {
      if (vol < 0.02) return;
      A.noise({ dur: 0.14, vol: 0.25 * vol, filter: 2200, to: 200 });
      tone({ freq: 420, to: 140, type: 'sine', dur: 0.12, vol: 0.22 * vol });
    },
    die: function () {
      A.noise({ dur: 0.5, vol: 0.4, filter: 1800, to: 80 });
      tone({ freq: 520, to: 90, type: 'sawtooth', dur: 0.45, vol: 0.16 });
      [392, 330, 262, 196].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.2, delay: 0.35 + i * 0.13 }); });
    },
    power: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone({ freq: f, type: 'square', dur: 0.08, vol: 0.12, delay: i * 0.05 }); }); },
    milestone: function () { [659, 784, 988, 1319].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.22, delay: i * 0.08 }); }); },
    rankUp: function () { tone({ freq: 880, type: 'square', dur: 0.07, vol: 0.12 }); tone({ freq: 1175, type: 'square', dur: 0.12, vol: 0.12, delay: 0.07 }); },
    crown: function () { [784, 988, 1175, 1568, 1175, 1568].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.2, delay: i * 0.07 }); }); },
    unlock: function () { [523, 784, 1047, 1568].forEach(function (f, i) { tone({ freq: f, type: 'sine', dur: 0.18, vol: 0.22, delay: i * 0.09 }); }); },
    warn: function () { tone({ freq: 220, to: 180, type: 'square', dur: 0.08, vol: 0.07 }); },
    click: function () { tone({ freq: 700, to: 900, type: 'square', dur: 0.05, vol: 0.12 }); },
    select: function () { tone({ freq: 520, to: 1200, type: 'sine', dur: 0.09, vol: 0.22 }); },
    start: function () { [392, 523, 659, 784].forEach(function (f, i) { tone({ freq: f, type: 'square', dur: 0.08, vol: 0.12, delay: i * 0.06 }); }); A.noise({ dur: 0.3, vol: 0.12, filter: 4000, to: 600, delay: 0.2 }); },
    newBest: function () { [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.26, delay: 0.5 + i * 0.1 }); }); },

    // Continuous low hum while boosting. on = boolean each frame.
    boostHum: function (on) {
      var ctx = A.ctx;
      if (!ctx) return;
      if (!boost) {
        if (!on) return;
        try {
          var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
          o.type = 'sawtooth'; o.frequency.value = 85;
          f.type = 'lowpass'; f.frequency.value = 420;
          g.gain.value = 0.0001;
          o.connect(f); f.connect(g); g.connect(A.master);
          o.start();
          boost = { o: o, g: g, on: false };
        } catch (e) { return; }
      }
      if (boost.on !== on) {
        boost.on = on;
        var t = ctx.currentTime;
        boost.g.gain.cancelScheduledValues(t);
        boost.g.gain.setTargetAtTime(on ? 0.07 : 0.0001, t, on ? 0.04 : 0.08);
        boost.o.frequency.setTargetAtTime(on ? 110 : 70, t, 0.1);
      }
    }
  };
  SA.sfx = sfx;
})();
