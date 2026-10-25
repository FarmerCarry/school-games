/* Short cues on Kit.audio. Mute sets the master gain to zero, so every cue stops. */
(function () {
  'use strict';
  function tone(o) { if (window.Kit && Kit.audio) Kit.audio.tone(o); }
  function noise(o) { if (window.Kit && Kit.audio) Kit.audio.noise(o); }
  window.LLAudio = {
    cast: function () {
      tone({ freq: 520, to: 220, type: 'triangle', dur: 0.12, vol: 0.1 });
      noise({ dur: 0.12, vol: 0.08, filter: 1800, to: 400 });
    },
    perfect: function () {
      tone({ freq: 740, type: 'triangle', dur: 0.08, vol: 0.11 });
      tone({ freq: 988, type: 'triangle', dur: 0.14, vol: 0.11, delay: 0.07 });
    },
    plip: function () {
      tone({ freq: 980, to: 420, type: 'sine', dur: 0.07, vol: 0.1 });
      noise({ dur: 0.08, vol: 0.07, filter: 2200, to: 300 });
    },
    bite: function () { tone({ freq: 660, to: 1180, type: 'square', dur: 0.1, vol: 0.09 }); },
    splash: function (big) { noise({ dur: big ? 0.32 : 0.16, vol: big ? 0.14 : 0.09, filter: 1600, to: 160 }); },
    reel: function (tense) {
      tone({ freq: tense ? 320 : 180, to: tense ? 480 : 250, type: 'triangle', dur: tense ? 0.05 : 0.04, vol: tense ? 0.07 : 0.045 });
    },
    catch: function (rare) {
      if (window.Kit) Kit.sfx.coin();
      if (rare >= 3) tone({ freq: 880, type: 'triangle', dur: 0.16, vol: 0.1, delay: 0.12 });
    },
    rare: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.11, delay: i * 0.07 });
      });
    },
    best: function () {
      tone({ freq: 784, type: 'triangle', dur: 0.1, vol: 0.12 });
      tone({ freq: 988, type: 'triangle', dur: 0.12, vol: 0.12, delay: 0.09 });
      tone({ freq: 1319, type: 'triangle', dur: 0.24, vol: 0.13, delay: 0.18 });
    },
    miss: function () { tone({ freq: 280, to: 120, type: 'sine', dur: 0.2, vol: 0.08 }); },
    buy: function () { if (window.Kit) Kit.sfx.coin(); },
    gull: function () {
      tone({ freq: 760, to: 980, type: 'square', dur: 0.09, vol: 0.05 });
      tone({ freq: 640, to: 420, type: 'square', dur: 0.12, vol: 0.05, delay: 0.1 });
    },
    pad: function () {
      tone({ freq: 196, type: 'sine', dur: 1.5, vol: 0.02 });
      tone({ freq: 247, type: 'sine', dur: 1.7, vol: 0.015, delay: 0.08 });
    }
  };
})();
