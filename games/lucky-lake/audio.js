/* Short cues on Kit.audio. Every cue also has a picture in the scene. */
(function () {
  'use strict';
  function tone(o) { if (window.Kit && Kit.audio) Kit.audio.tone(o); }
  function noise(o) { if (window.Kit && Kit.audio) Kit.audio.noise(o); }
  window.LLAudio = {
    cast: function () {
      tone({ freq: 520, to: 220, type: 'triangle', dur: 0.12, vol: 0.07 });
      noise({ dur: 0.1, vol: 0.05, filter: 1800, to: 400 });
    },
    perfect: function () {
      tone({ freq: 740, type: 'triangle', dur: 0.08, vol: 0.08 });
      tone({ freq: 988, type: 'triangle', dur: 0.12, vol: 0.08, delay: 0.07 });
    },
    plip: function () { tone({ freq: 920, to: 480, type: 'sine', dur: 0.06, vol: 0.07 }); },
    bite: function () { tone({ freq: 660, to: 990, type: 'square', dur: 0.09, vol: 0.08 }); },
    splash: function (big) { noise({ dur: big ? 0.28 : 0.14, vol: big ? 0.1 : 0.06, filter: 1500, to: 180 }); },
    reel: function () { tone({ freq: 160, to: 220, type: 'triangle', dur: 0.04, vol: 0.035 }); },
    catch: function (rare) {
      if (window.Kit) Kit.sfx.coin();
      if (rare >= 3) tone({ freq: 880, type: 'triangle', dur: 0.14, vol: 0.08, delay: 0.12 });
    },
    miss: function () { tone({ freq: 280, to: 120, type: 'sine', dur: 0.2, vol: 0.07 }); },
    buy: function () { if (window.Kit) Kit.sfx.coin(); },
    gull: function () {
      tone({ freq: 760, to: 980, type: 'square', dur: 0.09, vol: 0.04 });
      tone({ freq: 640, to: 420, type: 'square', dur: 0.12, vol: 0.04, delay: 0.1 });
    },
    pad: function () {
      tone({ freq: 196, type: 'sine', dur: 1.5, vol: 0.025 });
      tone({ freq: 247, type: 'sine', dur: 1.7, vol: 0.018, delay: 0.08 });
    }
  };
})();
