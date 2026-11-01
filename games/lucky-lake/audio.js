/* Short one-shot cues. Mute zeros the master gain, so every cue stops. */
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
      tone({ freq: 1319, type: 'sine', dur: 0.22, vol: 0.08, delay: 0.16 });
    },
    plip: function () {
      tone({ freq: 980, to: 420, type: 'sine', dur: 0.07, vol: 0.1 });
      noise({ dur: 0.08, vol: 0.07, filter: 2200, to: 300 });
    },
    bite: function (rare) {
      var f = 380 + (rare || 0) * 70;
      tone({ freq: f, to: f * 0.62, type: 'sine', dur: 0.11, vol: 0.12 });
      tone({ freq: f * 1.2, to: f * 0.7, type: 'sine', dur: 0.13, vol: 0.1, delay: 0.09 });
    },
    splash: function (big) {
      noise({ dur: big ? 0.34 : 0.18, vol: big ? 0.16 : 0.1, filter: 1800, to: 180 });
      tone({ freq: big ? 180 : 240, to: 90, type: 'sine', dur: 0.16, vol: 0.06 });
    },
    reel: function (tense) {
      tone({ freq: tense ? 280 : 160, to: tense ? 420 : 220, type: 'square', dur: 0.035, vol: tense ? 0.045 : 0.03 });
    },
    creak: function () {
      noise({ dur: 0.09, vol: 0.05, filter: 700, to: 180 });
      tone({ freq: 140, to: 90, type: 'sawtooth', dur: 0.08, vol: 0.03 });
    },
    catch: function (rare) {
      if (window.Kit) Kit.sfx.coin();
      this.fanfare(rare || 0);
    },
    fanfare: function (rare) {
      var base = [392, 523, 659, 784, 1047][Math.max(0, Math.min(4, rare | 0))];
      tone({ freq: base, type: 'triangle', dur: 0.12, vol: 0.1 });
      tone({ freq: base * 1.25, type: 'triangle', dur: 0.14, vol: 0.1, delay: 0.08 });
      tone({ freq: base * 1.5, type: 'sine', dur: 0.22, vol: 0.09, delay: 0.16 });
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
    }
  };
})();
