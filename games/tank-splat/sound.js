/* Paint Tanks — synthesized sound effects (WebAudio via Kit.audio). */
(function () {
  'use strict';
  var A = Kit.audio, S = { enabled: true }, lastT = {}, noiseBuf = null;
  function gate(n, g) { var t = performance.now(); if (lastT[n] && t - lastT[n] < g) return false; lastT[n] = t; return true; }
  function tn(f, to, tp, d, v, dl, at) {
    var ctx = A.ctx; if (!S.enabled || !ctx || A.muted) return;
    var t0 = ctx.currentTime + (dl || 0), dur = d || 0.12, vol = v == null ? 0.3 : v, type = tp || 'square';
    var o = ctx.createOscillator(), g = ctx.createGain(), node = o;
    o.type = type; o.frequency.setValueAtTime(f || 440, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    if (type === 'square' || type === 'sawtooth') {
      var fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 0.6;
      fl.frequency.value = Math.min(5000, Math.max(f || 440, to || 0) * 3.5);
      o.connect(fl); node = fl;
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (at || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    node.connect(g); g.connect(A.master); o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function ns(d, v, flt, to, dl) {
    var ctx = A.ctx; if (!S.enabled || !ctx || A.muted) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      for (var arr = noiseBuf.getChannelData(0), i = 0; i < arr.length; i++) arr[i] = Math.random() * 2 - 1;
    }
    var t0 = ctx.currentTime + (dl || 0), dur = d || 0.25, vol = v == null ? 0.3 : v;
    var src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    src.buffer = noiseBuf; src.loop = true; f.type = 'lowpass'; f.frequency.setValueAtTime(flt || 4000, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(A.master); src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.03);
  }
  function seq(arr, tp, d, v, step) { arr.forEach(function (f, i) { tn(f, 0, tp, d, v, i * step); }); }

  S.fire = function (p) { if (!gate('f', 30)) return; p = p || 1; tn(620 * p, 240 * p, 'sine', 0.09, 0.28); ns(0.06, 0.12, 2600, 800); };
  S.giant = function () { tn(260, 70, 'triangle', 0.28, 0.35); ns(0.2, 0.2, 900, 150); };
  S.bounce = function (n) { if (gate('b', 45)) tn(420 + n * 70, 300 + n * 40, 'triangle', 0.06, 0.12); };
  S.boing = function () { if (!gate('g', 80)) return; tn(260, 680, 'sine', 0.13, 0.24); tn(520, 360, 'triangle', 0.1, 0.14, 0.07); };
  S.boom = function () { ns(0.45, 0.5, 1600, 90); tn(180, 42, 'sawtooth', 0.34, 0.28); tn(420, 110, 'triangle', 0.2, 0.18, 0.04); };
  S.pop = function () { if (gate('p', 60)) tn(900, 1500, 'sine', 0.05, 0.1); };
  S.splat = function () { ns(0.4, 0.45, 2400, 180); tn(240, 55, 'sawtooth', 0.28, 0.18); tn(1300, 700, 'sine', 0.05, 0.12, 0.12); tn(1100, 600, 'sine', 0.05, 0.1, 0.2); };
  S.oops = function () { tn(440, 400, 'triangle', 0.18, 0.2, 0.3); tn(370, 250, 'triangle', 0.35, 0.2, 0.5); };
  S.pickup = function () { seq([660, 880, 1100, 1320], 'square', 0.07, 0.12, 0.045); };
  S.crate = function () { if (gate('c', 100)) tn(300, 900, 'sine', 0.12, 0.18); };
  S.shield = function () { tn(300, 1000, 'triangle', 0.2, 0.28); tn(1200, 1800, 'sine', 0.12, 0.12, 0.08); };
  S.speed = function () { ns(0.3, 0.18, 1200, 5000); tn(300, 1200, 'sawtooth', 0.25, 0.08); };
  S.beep = function () { tn(660, 0, 'square', 0.09, 0.14); };
  S.go = function () { tn(880, 0, 'square', 0.1, 0.14); tn(1320, 0, 'square', 0.22, 0.14, 0.09); };
  S.roundWin = function () { seq([523, 659, 784, 1047], 'triangle', 0.14, 0.26, 0.08); };
  S.roundDraw = function () { tn(400, 300, 'triangle', 0.2, 0.2); tn(400, 300, 'triangle', 0.2, 0.2, 0.22); };
  S.point = function () { tn(988, 0, 'square', 0.06, 0.14); tn(1480, 0, 'square', 0.14, 0.14, 0.06); };
  S.fanfare = function () {
    var n = [523, 523, 523, 659, 784, 659, 784, 1047], d = [0, 0.12, 0.24, 0.36, 0.52, 0.72, 0.84, 1.0];
    n.forEach(function (f, i) { tn(f, 0, 'square', i === 7 ? 0.5 : 0.12, 0.14, d[i]); tn(f / 2, 0, 'triangle', 0.14, 0.2, d[i]); });
  };
  S.lose = function () { seq([392, 330, 262, 196], 'triangle', 0.22, 0.26, 0.15); };
  S.click = function () { tn(660, 0, 'square', 0.05, 0.12); };
  S.coin = function () { if (gate('o', 85)) tn(1568 + Math.random() * 120, 0, 'triangle', 0.06, 0.07); };
  S.hover = function () { if (gate('h', 60)) tn(880, 0, 'sine', 0.03, 0.05); };
  S.buy = function () { tn(988, 0, 'square', 0.07, 0.16); tn(1319, 0, 'square', 0.2, 0.16, 0.07); };
  S.nope = function () { tn(200, 150, 'square', 0.15, 0.14); };
  S.star = function (i) { tn(880 + i * 220, 0, 'square', 0.12, 0.14); tn(1320 + i * 330, 0, 'sine', 0.2, 0.12, 0.05); };
  window.TS_SND = S;
})();
