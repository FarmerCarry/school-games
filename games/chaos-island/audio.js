/* جزيرة الفوضى — one-shot disaster cues. WebAudio only, silent while muted. */
(function () {
  'use strict';
  var A = Kit.audio;

  function live() { return !!(A.ctx && !A.muted); }
  function tone(o) {
    if (!live()) return;
    var c = A.ctx, t0 = c.currentTime + (o.delay || 0), dur = o.dur || 0.12, vol = o.vol == null ? 0.12 : o.vol;
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(Math.max(40, o.freq || 440), t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    var lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = o.lp || 2400;
    osc.connect(lp); lp.connect(g); g.connect(A.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  function noise(o) {
    if (!live()) return;
    A.noise({ dur: o.dur || 0.12, vol: o.vol || 0.05, filter: o.filter || 900, to: o.to || 200, delay: o.delay || 0 });
  }

  var CUES = {
    jelly: function () {
      [196, 247, 330, 392].forEach(function (f, i) { tone({ freq: f, to: f * 1.4, type: 'sine', dur: 0.16, vol: 0.1, delay: i * 0.09 }); });
    },
    meteor: function () { tone({ freq: 880, to: 180, type: 'triangle', dur: 0.42, vol: 0.1 }); noise({ dur: 0.2, vol: 0.04, filter: 1600, to: 200 }); },
    tornado: function () { [520, 640, 520, 700].forEach(function (f, i) { tone({ freq: f, type: 'sawtooth', dur: 0.1, vol: 0.05, delay: i * 0.06, lp: 1400 }); }); },
    sauce: function () { tone({ freq: 160, to: 90, type: 'sawtooth', dur: 0.3, vol: 0.06, lp: 700 }); },
    bowl: function () { tone({ freq: 220, type: 'square', dur: 0.08, vol: 0.05, lp: 900 }); tone({ freq: 180, type: 'square', dur: 0.1, vol: 0.05, delay: 0.1, lp: 800 }); },
    quake: function () { noise({ dur: 0.45, vol: 0.08, filter: 240, to: 60 }); tone({ freq: 70, to: 40, type: 'sine', dur: 0.4, vol: 0.1 }); },
    gum: function () { tone({ freq: 500, to: 760, type: 'triangle', dur: 0.18, vol: 0.08 }); },
    snow: function () { [880, 988, 1046].forEach(function (f, i) { tone({ freq: f, type: 'sine', dur: 0.08, vol: 0.06, delay: i * 0.05 }); }); },
    beach: function () { tone({ freq: 300, to: 180, type: 'sine', dur: 0.2, vol: 0.08 }); },
    ice: function () { tone({ freq: 1200, to: 700, type: 'triangle', dur: 0.18, vol: 0.05 }); },
    spark: function () { tone({ freq: 900, to: 1400, type: 'square', dur: 0.08, vol: 0.04, lp: 2000 }); },
    stomp: function () { noise({ dur: 0.16, vol: 0.07, filter: 500, to: 80 }); tone({ freq: 140, to: 60, type: 'sine', dur: 0.18, vol: 0.08 }); }
  };

  window.CIAudio = {
    cue: function (id) { if (CUES[id]) CUES[id](); },
    siren: function () {
      tone({ freq: 660, type: 'square', dur: 0.12, vol: 0.06, lp: 1600 });
      tone({ freq: 880, type: 'square', dur: 0.14, vol: 0.06, delay: 0.14, lp: 1800 });
    },
    plip: function () {
      tone({ freq: 620, to: 980, type: 'sine', dur: 0.09, vol: 0.1 });
      noise({ dur: 0.05, vol: 0.03, filter: 2000, to: 600 });
    },
    ooh: function () {
      [330, 392, 494].forEach(function (f, i) { tone({ freq: f, type: 'sine', dur: 0.22, vol: 0.04, delay: i * 0.02, lp: 1200 }); });
    },
    fanfare: function () {
      [523, 659, 784, 1047].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.18, vol: 0.09, delay: i * 0.11 }); });
    }
  };
})();
