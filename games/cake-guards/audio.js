/* Cake Guards sounds: short synthesised tones, rate-limited so a busy wave stays pleasant. */
(function (CG) {
  'use strict';
  const T = o => Kit.audio.tone(o), N = o => Kit.audio.noise(o), last = {};
  // Plays at most once every `gap` seconds per kind.
  function limited(kind, gap, fn) {
    return function () {
      const ctx = Kit.audio.ctx, now = ctx ? ctx.currentTime : 0;
      if (last[kind] && now - last[kind] < gap) return;
      last[kind] = now;
      fn.apply(null, arguments);
    };
  }
  CG.sfx = {
    click: () => T({ freq: 700, type: 'triangle', dur: 0.05, vol: 0.14 }),
    deny: () => T({ freq: 220, to: 160, type: 'square', dur: 0.12, vol: 0.12 }),
    build: () => { T({ freq: 330, to: 660, type: 'triangle', dur: 0.12, vol: 0.22 }); T({ freq: 880, type: 'sine', dur: 0.1, vol: 0.14, delay: 0.1 }); },
    upgrade: () => [523, 659, 784, 1047].forEach((f, i) => T({ freq: f, type: 'triangle', dur: 0.08, vol: 0.16, delay: i * 0.05 })),
    sell: () => { T({ freq: 988, type: 'triangle', dur: 0.06, vol: 0.15 }); T({ freq: 740, type: 'triangle', dur: 0.12, vol: 0.15, delay: 0.06 }); },
    pop: limited('shoot-pop', 0.07, () => T({ freq: 900, to: 1400, type: 'sine', dur: 0.04, vol: 0.08 })),
    bubble: limited('shoot-bubble', 0.12, () => T({ freq: 500, to: 900, type: 'sine', dur: 0.12, vol: 0.1 })),
    cake: limited('shoot-cake', 0.12, () => T({ freq: 260, to: 140, type: 'triangle', dur: 0.14, vol: 0.16 })),
    cane: limited('shoot-cane', 0.1, () => { T({ freq: 1600, to: 600, type: 'sawtooth', dur: 0.12, vol: 0.07 }); N({ dur: 0.08, vol: 0.06, filter: 5000 }); }),
    splash: limited('splash', 0.1, () => N({ dur: 0.18, vol: 0.14, filter: 1400, to: 300 })),
    blobPop: limited('blob-pop', 0.05, () => T({ freq: 420 + Math.random() * 240, to: 1100, type: 'sine', dur: 0.08, vol: 0.18 })),
    bossPop: () => { N({ dur: 0.5, vol: 0.3, filter: 1500, to: 120 }); [392, 523, 659, 784].forEach((f, i) => T({ freq: f, type: 'triangle', dur: 0.14, vol: 0.2, delay: 0.1 + i * 0.08 })); },
    chomp: limited('chomp', 0.12, () => { N({ dur: 0.1, vol: 0.25, filter: 900 }); T({ freq: 180, to: 90, type: 'square', dur: 0.1, vol: 0.12, delay: 0.04 }); }),
    wave: () => { T({ freq: 392, type: 'triangle', dur: 0.12, vol: 0.2 }); T({ freq: 523, type: 'triangle', dur: 0.2, vol: 0.2, delay: 0.12 }); },
    clear: () => [659, 784, 988].forEach((f, i) => T({ freq: f, type: 'triangle', dur: 0.1, vol: 0.18, delay: i * 0.07 })),
    boss: () => { T({ freq: 110, to: 70, type: 'sawtooth', dur: 0.6, vol: 0.14 }); T({ freq: 165, to: 110, type: 'triangle', dur: 0.6, vol: 0.14, delay: 0.2 }); },
    star: i => T({ freq: [784, 988, 1175][i] || 1175, type: 'triangle', dur: 0.18, vol: 0.22 }),
    win: () => Kit.sfx.win(),
    lose: () => Kit.sfx.lose()
  };
})(globalThis.CG = globalThis.CG || {});
