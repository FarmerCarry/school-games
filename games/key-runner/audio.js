/* One-shot sound effects for the tower. No music loop. */
(function (KR) {
  'use strict';
  KR.sound = function (name, extra) {
    var tone = Kit.audio.tone;
    if (name === 'jump') Kit.sfx.jump();
    else if (name === 'land') {
      tone({ freq: 210 + ((extra || 0) % 6) * 24, to: 90, type: 'triangle', dur: 0.07, vol: 0.07 });
      Kit.audio.noise({ dur: 0.05, vol: 0.035, filter: 800, to: 200 });
    }
    else if (name === 'press') {
      var n = Math.min(12, extra || 1);
      tone({ freq: 520 + n * 38, to: 980 + n * 46, type: 'square', dur: 0.045, vol: 0.06 });
    }
    else if (name === 'bounce') tone({ freq: 280, to: 960, type: 'square', dur: 0.12, vol: 0.08 });
    else if (name === 'haste') tone({ freq: 360, to: 880, type: 'square', dur: 0.16, vol: 0.07 });
    else if (name === 'checkpoint') {
      [523, 659, 784, 1046].forEach(function (f, i) {
        tone({ freq: f, type: 'square', dur: 0.1, vol: 0.07, delay: i * 0.06 });
      });
    }
    else if (name === 'fall' || name === 'splash') {
      Kit.audio.noise({ dur: 0.18, vol: 0.06, filter: 500, to: 120 });
      tone({ freq: 180, to: 70, type: 'sine', dur: 0.2, vol: 0.06 });
    }
    else if (name === 'glug') {
      tone({ freq: 70, to: 46, type: 'sine', dur: 0.28, vol: 0.08 });
      Kit.audio.noise({ dur: 0.16, vol: 0.04, filter: 240 });
    }
    else if (name === 'world') Kit.sfx.win();
    else if (name === 'record') {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ freq: f, type: 'triangle', dur: 0.11, vol: 0.09, delay: i * 0.07 });
      });
    }
  };
})(window.KeyRunner = window.KeyRunner || {});