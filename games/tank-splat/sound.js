/* Paint Tanks — synthesized sound effects (WebAudio via Kit.audio). */
(function () {
  'use strict';
  var A = Kit.audio;
  var S = { enabled: true };
  var lastT = {};
  // Limit how often the same sound can start (many balls bounce at once).
  function gate(name, gap) {
    var now = performance.now();
    if (lastT[name] && now - lastT[name] < gap) return false;
    lastT[name] = now;
    return true;
  }
  function tone(o) { if (S.enabled) A.tone(o); }
  function noise(o) { if (S.enabled) A.noise(o); }

  S.fire = function (pitch) {
    if (!gate('fire', 30)) return;
    var p = pitch || 1;
    tone({ freq: 620 * p, to: 240 * p, type: 'sine', dur: 0.09, vol: 0.28 });
    noise({ dur: 0.06, vol: 0.12, filter: 2600, to: 800 });
  };
  S.giant = function () {
    tone({ freq: 260, to: 70, type: 'triangle', dur: 0.28, vol: 0.35 });
    noise({ dur: 0.2, vol: 0.2, filter: 900, to: 150 });
  };
  S.bounce = function (n) {
    if (!gate('bounce', 45)) return;
    tone({ freq: 420 + n * 70, to: 300 + n * 40, type: 'triangle', dur: 0.06, vol: 0.12 });
  };
  S.pop = function () {
    if (!gate('pop', 60)) return;
    tone({ freq: 900, to: 1500, type: 'sine', dur: 0.05, vol: 0.1 });
  };
  S.splat = function () {
    noise({ dur: 0.4, vol: 0.5, filter: 3000, to: 180 });
    tone({ freq: 240, to: 55, type: 'sawtooth', dur: 0.28, vol: 0.18 });
    tone({ freq: 1300, to: 700, type: 'sine', dur: 0.05, vol: 0.12, delay: 0.12 });
    tone({ freq: 1100, to: 600, type: 'sine', dur: 0.05, vol: 0.1, delay: 0.2 });
  };
  S.oops = function () {
    tone({ freq: 440, to: 400, type: 'triangle', dur: 0.18, vol: 0.2, delay: 0.3 });
    tone({ freq: 370, to: 250, type: 'triangle', dur: 0.35, vol: 0.2, delay: 0.5 });
  };
  S.pickup = function () {
    [660, 880, 1100, 1320].forEach(function (f, i) { tone({ freq: f, type: 'square', dur: 0.07, vol: 0.12, delay: i * 0.045 }); });
  };
  S.crate = function () {
    if (!gate('crate', 100)) return;
    tone({ freq: 300, to: 900, type: 'sine', dur: 0.12, vol: 0.18 });
  };
  S.shield = function () {
    tone({ freq: 300, to: 1000, type: 'triangle', dur: 0.2, vol: 0.28 });
    tone({ freq: 1200, to: 1800, type: 'sine', dur: 0.12, vol: 0.12, delay: 0.08 });
  };
  S.speed = function () {
    noise({ dur: 0.3, vol: 0.18, filter: 1200, to: 5000 });
    tone({ freq: 300, to: 1200, type: 'sawtooth', dur: 0.25, vol: 0.08 });
  };
  S.beep = function () { tone({ freq: 660, type: 'square', dur: 0.09, vol: 0.14 }); };
  S.go = function () {
    tone({ freq: 880, type: 'square', dur: 0.1, vol: 0.14 });
    tone({ freq: 1320, type: 'square', dur: 0.22, vol: 0.14, delay: 0.09 });
  };
  S.roundWin = function () {
    [523, 659, 784, 1047].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.26, delay: i * 0.08 }); });
  };
  S.roundDraw = function () {
    tone({ freq: 400, to: 300, type: 'triangle', dur: 0.2, vol: 0.2 });
    tone({ freq: 400, to: 300, type: 'triangle', dur: 0.2, vol: 0.2, delay: 0.22 });
  };
  S.point = function () { tone({ freq: 988, type: 'square', dur: 0.06, vol: 0.14 }); tone({ freq: 1480, type: 'square', dur: 0.14, vol: 0.14, delay: 0.06 }); };
  S.fanfare = function () {
    var n = [523, 523, 523, 659, 784, 659, 784, 1047];
    var d = [0, 0.12, 0.24, 0.36, 0.52, 0.72, 0.84, 1.0];
    n.forEach(function (f, i) {
      tone({ freq: f, type: 'square', dur: i === n.length - 1 ? 0.5 : 0.12, vol: 0.14, delay: d[i] });
      tone({ freq: f / 2, type: 'triangle', dur: 0.14, vol: 0.2, delay: d[i] });
    });
  };
  S.lose = function () {
    [392, 330, 262, 196].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.26, delay: i * 0.15 }); });
  };
  S.click = function () { tone({ freq: 660, type: 'square', dur: 0.05, vol: 0.12 }); };
  S.hover = function () { if (gate('hover', 60)) tone({ freq: 880, type: 'sine', dur: 0.03, vol: 0.05 }); };
  S.buy = function () {
    tone({ freq: 988, type: 'square', dur: 0.07, vol: 0.16 });
    tone({ freq: 1319, type: 'square', dur: 0.2, vol: 0.16, delay: 0.07 });
  };
  S.nope = function () { tone({ freq: 200, to: 150, type: 'square', dur: 0.15, vol: 0.14 }); };
  S.star = function (i) { tone({ freq: 880 + i * 220, type: 'square', dur: 0.12, vol: 0.14 }); tone({ freq: 1320 + i * 330, type: 'sine', dur: 0.2, vol: 0.12, delay: 0.05 }); };

  window.TS_SND = S;
})();
