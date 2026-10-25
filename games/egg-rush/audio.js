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
    alert: () => { T({ freq: 740, type: 'square', dur: 0.08, vol: 0.1 }); T({ freq: 980, type: 'square', dur: 0.1, vol: 0.1, delay: 0.08 }); },
    boop: () => { T({ freq: 220, to: 90, type: 'triangle', dur: 0.18, vol: 0.22 }); N({ dur: 0.12, vol: 0.12, filter: 900, to: 200 }); },
    coin: lim('coin', 0.05, () => { T({ freq: 988, type: 'triangle', dur: 0.06, vol: 0.14 }); T({ freq: 1319, type: 'triangle', dur: 0.1, vol: 0.12, delay: 0.05 }); }),
    xp: lim('xp', 0.06, () => T({ freq: 660, to: 990, type: 'square', dur: 0.05, vol: 0.06 })),
    hatch: () => { T({ freq: 523, type: 'triangle', dur: 0.1, vol: 0.16 }); T({ freq: 784, type: 'triangle', dur: 0.16, vol: 0.16, delay: 0.08 }); },
    legend: () => Kit.sfx.win(),
    buy: () => T({ freq: 440, to: 660, type: 'triangle', dur: 0.12, vol: 0.16 }),
    deny: () => T({ freq: 180, to: 120, type: 'square', dur: 0.1, vol: 0.08 }),
    slip: () => T({ freq: 300, to: 140, type: 'sawtooth', dur: 0.2, vol: 0.08 }),
    fox: () => T({ freq: 392, to: 260, type: 'triangle', dur: 0.2, vol: 0.14 }),
    bump: () => N({ dur: 0.1, vol: 0.16, filter: 1400, to: 300 }),
    gate: () => T({ freq: 200, type: 'square', dur: 0.08, vol: 0.08 })
  };
})(globalThis.EggRush = globalThis.EggRush || {});
