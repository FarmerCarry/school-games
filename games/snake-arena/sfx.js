/* Snake Arena — synthesized sounds (WebAudio via Kit.audio). */
(function () {
  'use strict';
  var SA = window.SA;
  var A = Kit.audio;
  function tone(o) { A.tone(o); }
  function now() { return A.ctx ? A.ctx.currentTime : 0; }

  var lastEat = -1, eatStep = 0, lastBoost = -1;
  var boost = null; // continuous boost hum nodes
  // Eating: a snake can swallow dozens of pellets per second. Every pellet used to fire a blip
  // (up to 20/s) that climbed to one fixed top note and stayed there - a constant high chatter.
  // Now blips are rate-limited, walk up a pentatonic scale and wrap (little melodic runs),
  // and get quieter the faster they come, so a feast sounds like a sparkly munch, not an alarm.
  var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

  var sfx = {
    eat: function (big) {
      var t = now(), gap = t - lastEat;
      if (gap < (big ? 0.06 : 0.085)) return;
      if (gap > 0.5) eatStep = 0;
      lastEat = t;
      var semi = PENTA[eatStep % PENTA.length];
      eatStep++;
      var f = 520 * Math.pow(2, semi / 12);
      var dens = Math.min(1, Math.max(0, (0.3 - gap) / 0.2)); // 0 = lone blip, 1 = rapid feast
      tone({ freq: f, to: f * 1.35, type: 'sine', dur: big ? 0.09 : 0.055, vol: (big ? 0.17 : 0.1) * (1 - 0.35 * dens), attack: 0.004 });
      if (big) tone({ freq: f * 0.5, to: f * 0.75, type: 'triangle', dur: 0.08, vol: 0.08, delay: 0.01 });
    },
    // tonal "vroom" (a bright noise whoosh here used to hiss every time Space was tapped)
    boostStart: function () {
      var t = now();
      if (t - lastBoost < 0.25) return;
      lastBoost = t;
      tone({ freq: 140, to: 320, type: 'triangle', dur: 0.18, vol: 0.12, attack: 0.02 });
      A.noise({ dur: 0.18, vol: 0.05, filter: 900, to: 300 });
    },
    kill: function (combo) {
      A.noise({ dur: 0.16, vol: 0.22, filter: 1600, to: 250 });
      tone({ freq: 300, to: 900, type: 'triangle', dur: 0.12, vol: 0.2 });
      tone({ freq: 110, to: 55, type: 'sine', dur: 0.25, vol: 0.22, attack: 0.01 });
      var base = 660 * Math.pow(1.12, Math.min(combo || 0, 5));
      [1, 1.25, 1.5, 2].forEach(function (m, i) {
        tone({ freq: base * m, type: 'triangle', dur: 0.12, vol: 0.2, delay: 0.08 + i * 0.07 });
      });
    },
    popFar: function (vol) {
      if (vol < 0.02) return;
      A.noise({ dur: 0.12, vol: 0.2 * vol, filter: 1400, to: 200 });
      tone({ freq: 420, to: 140, type: 'sine', dur: 0.12, vol: 0.22 * vol });
    },
    die: function () {
      A.noise({ dur: 0.45, vol: 0.32, filter: 1400, to: 80 });
      tone({ freq: 520, to: 90, type: 'triangle', dur: 0.45, vol: 0.22 });
      [392, 330, 262, 196].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.2, delay: 0.35 + i * 0.13 }); });
    },
    power: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.1, vol: 0.18, delay: i * 0.05 }); }); },
    milestone: function () { [659, 784, 988, 1319].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.22, delay: i * 0.08 }); }); },
    rankUp: function () { tone({ freq: 880, type: 'triangle', dur: 0.09, vol: 0.18 }); tone({ freq: 1175, type: 'triangle', dur: 0.14, vol: 0.18, delay: 0.07 }); },
    crown: function () { [784, 988, 1175, 1568, 1175, 1568].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.2, delay: i * 0.07 }); }); },
    unlock: function () { [523, 784, 1047, 1568].forEach(function (f, i) { tone({ freq: f, type: 'sine', dur: 0.18, vol: 0.22, delay: i * 0.09 }); }); },
    warn: function () { tone({ freq: 330, to: 262, type: 'triangle', dur: 0.12, vol: 0.12 }); },
    click: function () { tone({ freq: 700, to: 900, type: 'triangle', dur: 0.06, vol: 0.16 }); },
    select: function () { tone({ freq: 520, to: 1200, type: 'sine', dur: 0.09, vol: 0.22 }); },
    start: function () { [392, 523, 659, 784].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.1, vol: 0.18, delay: i * 0.06 }); }); tone({ freq: 160, to: 420, type: 'sine', dur: 0.3, vol: 0.1, delay: 0.2, attack: 0.03 }); },
    newBest: function () { [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.26, delay: 0.5 + i * 0.1 }); }); },

    // Continuous low hum while boosting. on = boolean each frame.
    boostHum: function (on) {
      var ctx = A.ctx;
      if (!ctx) return;
      if (!boost) {
        if (!on) return;
        try {
          var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = 85;
          f.type = 'lowpass'; f.frequency.value = 600;
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
        boost.g.gain.setTargetAtTime(on ? 0.06 : 0.0001, t, on ? 0.04 : 0.08);
        boost.o.frequency.setTargetAtTime(on ? 110 : 70, t, 0.1);
      }
    }
  };
  SA.sfx = sfx;
})();
