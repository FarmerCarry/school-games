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
    grab: () => { T({ freq: 520, to: 880, type: 'sine', dur: 0.12, vol: 0.18 }); T({ freq: 990, type: 'triangle', dur: 0.08, vol: 0.1, delay: 0.04 }); },
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
    cheer: () => { T({ freq: 784, type: 'triangle', dur: 0.08, vol: 0.14 }); T({ freq: 1046, type: 'triangle', dur: 0.12, vol: 0.14, delay: 0.07 }); },
    buy: () => T({ freq: 440, to: 660, type: 'triangle', dur: 0.12, vol: 0.16 }),
    deny: () => T({ freq: 180, to: 120, type: 'square', dur: 0.1, vol: 0.08 }),
    slip: () => T({ freq: 300, to: 140, type: 'sawtooth', dur: 0.2, vol: 0.08 }),
    fox: () => T({ freq: 392, to: 260, type: 'triangle', dur: 0.2, vol: 0.14 }),
    bump: () => N({ dur: 0.1, vol: 0.16, filter: 1400, to: 300 }),
    gate: () => T({ freq: 200, type: 'square', dur: 0.08, vol: 0.08 }),
    open: () => { [523, 659, 784, 1046].forEach((f, i) => T({ freq: f, type: 'triangle', dur: 0.12, vol: 0.16, delay: i * 0.07 })); },
    carry: false,
    riser: (dur, rare) => {
      const n = rare ? 14 : 10;
      const base = rare ? 349 : 220;
      const span = dur > 0 ? dur : 1.1;
      for (let i = 0; i < n; i++) {
        T({ freq: base + i * (rare ? 42 : 34), type: 'sine', dur: 0.16, vol: rare ? 0.07 : 0.055, delay: (span / n) * i });
      }
      if (rare) T({ freq: 988, type: 'triangle', dur: 0.22, vol: 0.06, delay: span * 0.55 });
    },
    popHatch: () => {
      N({ dur: 0.14, vol: 0.18, filter: 2400, to: 380 });
      T({ freq: 494, to: 1174, type: 'triangle', dur: 0.18, vol: 0.2 });
      T({ freq: 784, type: 'sine', dur: 0.22, vol: 0.12, delay: 0.06 });
      T({ freq: 1568, type: 'sine', dur: 0.16, vol: 0.08, delay: 0.1 });
    },
    cascade: () => {
      for (let i = 0; i < 8; i++) {
        T({ freq: 698 + (i % 5) * 80, type: 'sine', dur: 0.07, vol: 0.12, delay: i * 0.06 });
        T({ freq: 1318, type: 'triangle', dur: 0.09, vol: 0.07, delay: i * 0.06 + 0.035 });
      }
    },
    heart: (() => {
      let n = 0;
      return red => {
        n++;
        if (n % (red ? 22 : 40)) return;
        T({ freq: red ? 98 : 72, type: 'sine', dur: 0.09, vol: red ? 0.11 : 0.05 });
        T({ freq: red ? 64 : 52, type: 'sine', dur: 0.12, vol: 0.05, delay: 0.11 });
      };
    })()
  };
})(globalThis.EggRush = globalThis.EggRush || {});
