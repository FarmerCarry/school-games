/* Egg Rush sounds. Every cue also has a picture on screen, so mute is still playable. */
(function (ER) {
  'use strict';
  const T = o => Kit.audio.tone(o), N = o => Kit.audio.noise(o), last = {};
  function lim(kind, gap, fn) {
    return function () {
      const ctx = Kit.audio.ctx, now = ctx ? ctx.currentTime : 0;
      if (last[kind] && now - last[kind] < gap) return;
      last[kind] = now;
      fn();
    };
  }
  ER.sfx = {
    click: () => T({ freq: 680, type: 'triangle', dur: 0.05, vol: 0.12 }),
    grab: () => T({ freq: 520, to: 880, type: 'sine', dur: 0.12, vol: 0.18 }),
    alert: () => {
      T({ freq: 660, type: 'sine', dur: 0.08, vol: 0.12 });
      T({ freq: 880, type: 'sine', dur: 0.09, vol: 0.12, delay: 0.09 });
      T({ freq: 1175, type: 'sine', dur: 0.12, vol: 0.1, delay: 0.18 });
    },
    boop: () => { T({ freq: 220, to: 90, type: 'triangle', dur: 0.18, vol: 0.22 }); N({ dur: 0.12, vol: 0.12, filter: 900, to: 200 }); },
    coin: lim('coin', 0.04, () => { T({ freq: 880, type: 'sine', dur: 0.05, vol: 0.14 }); T({ freq: 1320, type: 'triangle', dur: 0.1, vol: 0.12, delay: 0.05 }); }),
    xp: lim('xp', 0.06, () => T({ freq: 660, to: 990, type: 'square', dur: 0.05, vol: 0.06 })),
    hatch: () => {
      N({ dur: 0.07, vol: 0.1, filter: 1800, to: 420 });
      [392, 523, 659, 784].forEach((f, i) => T({ freq: f, type: 'triangle', dur: 0.12, vol: 0.16, delay: 0.05 + i * 0.07 }));
    },
    legend: () => Kit.sfx.win(),
    fanfare: () => { [523, 659, 784, 1046].forEach((f, i) => T({ freq: f, type: 'triangle', dur: 0.16, vol: 0.18, delay: i * 0.09 })); },
    buy: () => T({ freq: 440, to: 660, type: 'triangle', dur: 0.12, vol: 0.16 }),
    deny: () => T({ freq: 180, to: 120, type: 'square', dur: 0.1, vol: 0.08 }),
    slip: () => T({ freq: 300, to: 140, type: 'sawtooth', dur: 0.2, vol: 0.08 }),
    fox: () => T({ freq: 392, to: 260, type: 'triangle', dur: 0.2, vol: 0.14 }),
    bump: () => N({ dur: 0.1, vol: 0.16, filter: 1400, to: 300 }),
    gate: () => T({ freq: 200, type: 'square', dur: 0.08, vol: 0.08 })
  };
})(globalThis.EggRush = globalThis.EggRush || {});
