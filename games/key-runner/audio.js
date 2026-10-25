/* Every cue here has a visual twin in the view or the HUD. */
(function (KR) {
  'use strict';
  KR.sound = function (name, extra) {
    var tone = Kit.audio.tone;
    if (name === 'jump') Kit.sfx.jump();
    else if (name === 'double') tone({ freq: 420, to: 880, type: 'square', dur: 0.12, vol: 0.08 });
    else if (name === 'land') {
      tone({ freq: 180 + ((extra || 0) % 8) * 28, to: 90, type: 'triangle', dur: 0.07, vol: 0.07 });
      Kit.audio.noise({ dur: 0.06, vol: 0.04, filter: 900, to: 220 });
    }
    else if (name === 'press') tone({ freq: 640 + ((extra || 0) % 5) * 55, to: 1240, type: 'square', dur: 0.05, vol: 0.055 });
    else if (name === 'bounce') tone({ freq: 260, to: 920, type: 'square', dur: 0.13, vol: 0.09 });
    else if (name === 'launch') tone({ freq: 220, to: 760, type: 'sawtooth', dur: 0.16, vol: 0.06 });
    else if (name === 'step') tone({ freq: 520 + ((extra || 0) % 8) * 18, type: 'square', dur: 0.03, vol: 0.03 });
    else if (name === 'checkpoint') {
      [523, 659, 784].forEach(function (f, i) { tone({ freq: f, type: 'square', dur: 0.1, vol: 0.08, delay: i * 0.07 }); });
    }
    else if (name === 'gate') tone({ freq: 140, to: 70, type: 'square', dur: 0.12, vol: 0.08 });
    else if (name === 'fall') Kit.sfx.pop();
    else if (name === 'stage') {
      [659, 880, 1175].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.1, delay: i * 0.08 }); });
    }
    else if (name === 'world') Kit.sfx.win();
    else if (name === 'record') {
      [523, 659, 784, 1047].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.11, vol: 0.1, delay: i * 0.07 }); });
    }
    else if (name === 'word') Kit.sfx.power();
    else if (name === 'buy') Kit.sfx.coin();
    else if (name === 'rebirth') Kit.sfx.power();
    else if (name === 'flood' && extra) tone({ freq: 48, type: 'sine', dur: 0.2, vol: 0.05 });
  };
})(window.KeyRunner = window.KeyRunner || {});
