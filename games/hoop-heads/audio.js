/* Hoop Heads - synthesized sounds (WebAudio via Kit.audio). */
(function () {
  'use strict';
  var HH = window.HH;
  var A = Kit.audio;
  var S = HH.sfx = { enabled: true };
  var buf = null;

  function ok() { return S.enabled && A.ctx && !A.muted; }
  function tone(o) { if (ok()) A.tone(o); }
  function noiseBuf() {
    if (!buf) {
      buf = A.ctx.createBuffer(1, A.ctx.sampleRate * 2, A.ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }
  // Band-passed noise with an attack/release envelope.
  function band(o) {
    if (!ok()) return;
    var c = A.ctx, t0 = c.currentTime + (o.delay || 0), dur = o.dur || 0.3;
    var src = c.createBufferSource(); src.buffer = noiseBuf();
    src.playbackRate.value = o.rate || 1;
    var f = c.createBiquadFilter(); f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    f.Q.value = o.q || 1;
    var g = c.createGain();
    var att = o.attack || 0.01;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t0 + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t0, Math.random() * 1); src.stop(t0 + dur + 0.05);
  }

  S.bounce = function (v) {
    v = Math.max(0.05, Math.min(1, v || 0.6));
    tone({ freq: 140, to: 70, type: 'sine', dur: 0.12, vol: 0.45 * v });
    band({ freq: 500, q: 2, dur: 0.06, vol: 0.12 * v });
  };
  S.swish = function () {
    band({ freq: 3500, to: 1200, q: 0.8, dur: 0.35, vol: 0.35, attack: 0.04 });
  };
  S.clank = function (v) {
    v = Math.max(0.2, Math.min(1, v || 0.7));
    tone({ freq: 980, to: 900, type: 'square', dur: 0.18, vol: 0.09 * v });
    tone({ freq: 1470, to: 1400, type: 'triangle', dur: 0.26, vol: 0.12 * v });
    tone({ freq: 2210, type: 'sine', dur: 0.12, vol: 0.06 * v });
  };
  S.board = function (v) {
    v = Math.max(0.2, Math.min(1, v || 0.7));
    tone({ freq: 110, to: 60, type: 'triangle', dur: 0.16, vol: 0.4 * v });
    band({ freq: 700, q: 1.5, dur: 0.1, vol: 0.2 * v });
  };
  S.jump = function () { tone({ freq: 260, to: 560, type: 'square', dur: 0.1, vol: 0.08 }); };
  S.land = function () { tone({ freq: 120, to: 60, type: 'triangle', dur: 0.08, vol: 0.18 }); };
  S.grab = function () { tone({ freq: 520, to: 700, type: 'triangle', dur: 0.06, vol: 0.14 }); };
  S.shoot = function () {
    band({ freq: 1800, to: 600, q: 1, dur: 0.18, vol: 0.18 });
    tone({ freq: 400, to: 900, type: 'sine', dur: 0.12, vol: 0.14 });
  };
  S.perfect = function () {
    tone({ freq: 1319, type: 'triangle', dur: 0.08, vol: 0.14 });
    tone({ freq: 1760, type: 'triangle', dur: 0.14, vol: 0.14, delay: 0.06 });
  };
  S.charge = function (p) { tone({ freq: 300 + p * 500, type: 'sine', dur: 0.04, vol: 0.05 }); };
  S.steal = function () {
    band({ freq: 2500, to: 500, q: 1, dur: 0.22, vol: 0.28 });
    tone({ freq: 700, to: 250, type: 'square', dur: 0.12, vol: 0.12 });
  };
  S.bonk = function () {
    tone({ freq: 380, to: 140, type: 'sine', dur: 0.14, vol: 0.35 });
    tone({ freq: 760, to: 300, type: 'triangle', dur: 0.08, vol: 0.12 });
  };
  S.block = function () {
    band({ freq: 900, to: 200, q: 1, dur: 0.25, vol: 0.45 });
    tone({ freq: 200, to: 60, type: 'sawtooth', dur: 0.2, vol: 0.18 });
  };
  S.cheer = function (big) {
    var n = big ? 1.8 : 1.1;
    band({ freq: 1200, q: 0.6, dur: n, vol: big ? 0.3 : 0.2, attack: 0.15 });
    band({ freq: 2300, q: 0.9, dur: n * 0.9, vol: big ? 0.16 : 0.1, attack: 0.2, delay: 0.05 });
    for (var i = 0; i < (big ? 6 : 3); i++) {
      var f = 900 + Math.random() * 900;
      tone({ freq: f, to: f * 1.3, type: 'sine', dur: 0.25, vol: 0.03, delay: 0.1 + Math.random() * 0.6 });
    }
  };
  S.aww = function () {
    band({ freq: 700, to: 350, q: 1.2, dur: 0.9, vol: 0.18, attack: 0.1 });
  };
  S.whistle = function () {
    tone({ freq: 2300, type: 'sine', dur: 0.12, vol: 0.18 });
    tone({ freq: 2300, to: 2200, type: 'sine', dur: 0.3, vol: 0.18, delay: 0.15 });
  };
  S.buzzer = function () {
    tone({ freq: 190, type: 'sawtooth', dur: 0.9, vol: 0.22 });
    tone({ freq: 196, type: 'square', dur: 0.9, vol: 0.12 });
  };
  S.dunk = function () {
    band({ freq: 400, to: 80, q: 0.7, dur: 0.5, vol: 0.5 });
    tone({ freq: 90, to: 40, type: 'sine', dur: 0.45, vol: 0.55 });
    tone({ freq: 1200, to: 1100, type: 'square', dur: 0.2, vol: 0.06 });
  };
  S.fire = function () {
    band({ freq: 300, to: 1400, q: 0.8, dur: 0.6, vol: 0.35, attack: 0.1 });
    [523, 659, 784, 1047].forEach(function (f, i) { tone({ freq: f, type: 'square', dur: 0.09, vol: 0.1, delay: i * 0.06 }); });
  };
  S.tick = function () { tone({ freq: 880, type: 'square', dur: 0.05, vol: 0.1 }); };
  S.go = function () { tone({ freq: 660, to: 1320, type: 'square', dur: 0.25, vol: 0.14 }); };
  S.click = function () { tone({ freq: 660, type: 'square', dur: 0.05, vol: 0.12 }); };
  S.move = function () { tone({ freq: 440, type: 'triangle', dur: 0.04, vol: 0.12 }); };
  S.coin = function () { if (ok()) Kit.sfx.coin(); };
  S.win = function () { if (ok()) Kit.sfx.win(); };
  S.lose = function () { if (ok()) Kit.sfx.lose(); };
  S.buy = function () { if (ok()) Kit.sfx.power(); };
  S.error = function () { tone({ freq: 200, to: 140, type: 'square', dur: 0.15, vol: 0.12 }); };
})();
