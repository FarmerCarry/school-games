/* Hoop Heads - synthesized sounds (WebAudio via Kit.audio). */
(function () {
  'use strict';
  var HH = window.HH;
  var A = Kit.audio;
  var S = HH.sfx = { enabled: true };
  var buf = null;

  function ok() { return S.enabled && A.ctx && !A.muted; }
  // Like Kit.audio.tone, but raw square/saw waves are rounded off with a low-pass (they are harsh on
  // school speakers) and an optional o.lp sets the cut-off.
  function tone(o) {
    if (!ok()) return;
    var c = A.ctx, t0 = c.currentTime + (o.delay || 0), dur = o.dur || 0.12, vol = o.vol == null ? 0.3 : o.vol;
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq || 440, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    var lpF = o.lp || ((osc.type === 'square' || osc.type === 'sawtooth') ? Math.min(4500, Math.max(1200, (o.freq || 440) * 5)) : 0);
    if (lpF) { var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpF; osc.connect(f); f.connect(g); }
    else osc.connect(g);
    g.connect(A.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  var last = {};
  function limit(name, gap) {
    var t = A.ctx ? A.ctx.currentTime : 0;
    if (last[name] != null && t - last[name] < gap && t >= last[name]) return false;
    last[name] = t; return true;
  }
  /* crowd-begin */
  /* ---- crowd: many detuned "voices" through vowel formants + hand claps.
     Sounds like people cheering instead of a burst of radio static (the old
     crowd was plain band-passed white noise). */
  var VOWEL = { a: [[800, 1, 6], [1300, 0.95, 7], [2600, 0.45, 8]], o: [[450, 1, 5], [850, 0.7, 6], [2400, 0.15, 8]],
    e: [[600, 1, 6], [1900, 1.3, 7], [2700, 0.6, 8]], w: [[680, 1, 5], [1050, 0.8, 6], [2500, 0.2, 8]] };
  var clapBuf = null;
  function getClap(c) {
    if (!clapBuf) {
      var n = Math.floor(c.sampleRate * 0.05);
      clapBuf = c.createBuffer(1, n, c.sampleRate);
      var d = clapBuf.getChannelData(0);
      for (var i = 0; i < n; i++) { var t = i / c.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 90) * (t < 0.002 ? t / 0.002 : 1); }
    }
    return clapBuf;
  }
  var applauseBuf = null;
  function getApplause(c) {
    if (!applauseBuf) {
      var sr = c.sampleRate, n = Math.floor(sr * 2.6), cl = getClap(c).getChannelData(0);
      applauseBuf = c.createBuffer(1, n, sr);
      var d = applauseBuf.getChannelData(0);
      for (var j = 0; j < 70; j++) {
        var at = Math.floor(Math.pow(Math.random(), 1.3) * (n - cl.length)), g = 0.5 + Math.random() * 0.5;
        for (var i = 0; i < cl.length; i++) d[at + i] += cl[i] * g;
      }
    }
    return applauseBuf;
  }
  var breathBuf = null;
  function getBreath(c) {
    if (!breathBuf) {
      breathBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      var d = breathBuf.getChannelData(0), last = 0;
      for (var i = 0; i < d.length; i++) { last = last * 0.8 + (Math.random() * 2 - 1) * 0.2; d[i] = last * 2.5; }
    }
    return breathBuf;
  }
  // o: { dur, vol, voices, lo, hi (Hz), rise (pitch glide, 1 = flat), vowel, delay, attack, claps (count), clapVol }
  function crowd(c, dest, o) {
    var t0 = c.currentTime + (o.delay || 0), dur = o.dur || 1.5, vol = o.vol || 0.2;
    var att = o.attack || 0.12, n = o.voices || 10;
    var out = c.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(vol, t0 + att);
    out.gain.setValueAtTime(vol, t0 + dur * 0.45);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    out.connect(dest);
    var bus = c.createGain(); bus.gain.value = 1 / Math.sqrt(n);
    var F = VOWEL[o.vowel || 'a'];
    for (var k = 0; k < F.length; k++) {
      var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = F[k][0]; bp.Q.value = F[k][2];
      var fg = c.createGain(); fg.gain.value = F[k][1] * 2.2;
      bus.connect(bp); bp.connect(fg); fg.connect(out);
    }
    // a little body so it is not thin
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    var lg = c.createGain(); lg.gain.value = 0.25;
    bus.connect(lp); lp.connect(lg); lg.connect(out);
    // shared vibrato (two rates so the voices do not wobble in lockstep)
    var lfos = [];
    for (var l = 0; l < 2; l++) {
      var lfo = c.createOscillator(), lfg = c.createGain();
      lfo.frequency.value = l ? 6.3 : 4.7; lfg.gain.value = l ? 28 : 22;   // cents
      lfo.connect(lfg); lfo.start(t0); lfo.stop(t0 + dur + 0.1);
      lfos.push(lfg);
    }
    var lo = o.lo || 170, hi = o.hi || 420, rise = o.rise == null ? 1.25 : o.rise;
    for (var i = 0; i < n; i++) {
      var osc = c.createOscillator(), g = c.createGain();
      osc.type = 'sawtooth';
      var f = lo * Math.pow(hi / lo, Math.random());
      var ts = t0 + Math.random() * Math.min(0.25, dur * 0.2), te = t0 + dur * (0.55 + Math.random() * 0.45);
      osc.frequency.setValueAtTime(f, ts);
      osc.frequency.linearRampToValueAtTime(f * rise, ts + (te - ts) * 0.35);
      osc.frequency.linearRampToValueAtTime(f * (rise > 1 ? rise * 0.92 : rise * 0.97), te);
      lfos[i & 1].connect(osc.detune);
      var gv = 0.6 + Math.random() * 0.4;
      g.gain.setValueAtTime(0.0001, ts);
      g.gain.exponentialRampToValueAtTime(gv, ts + 0.06 + Math.random() * 0.12);
      g.gain.setValueAtTime(gv, ts + (te - ts) * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, te);
      osc.connect(g); g.connect(bus);
      osc.start(ts); osc.stop(te + 0.05);
    }
    // soft breath under the voices (low-passed, quiet: never a hiss)
    if (o.breath !== 0) {
      var nb = c.createBufferSource(); nb.buffer = getBreath(c);
      nb.loop = true;
      var nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1100;
      var ng = c.createGain(); ng.gain.value = 0.18 * (o.breath || 1);
      nb.connect(nf); nf.connect(ng); ng.connect(out);
      nb.start(t0); nb.stop(t0 + dur + 0.05);
    }
    // hand claps (applause): one pre-mixed buffer, so a cheer stays cheap (few live audio nodes)
    var claps = o.claps || 0;
    if (claps) {
      var s = c.createBufferSource(); s.buffer = getApplause(c);
      s.playbackRate.value = 0.9 + Math.random() * 0.2;
      var cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 1500; cf.Q.value = 0.9;
      var cg = c.createGain(), cv = (o.clapVol == null ? vol * 1.6 : o.clapVol) * Math.min(1, claps / 40);
      var cend = t0 + Math.min(dur, 2.3);
      cg.gain.setValueAtTime(cv, t0);
      cg.gain.setValueAtTime(cv, t0 + (cend - t0) * 0.6);
      cg.gain.exponentialRampToValueAtTime(0.0001, cend);
      s.connect(cf); cf.connect(cg); cg.connect(dest);
      s.start(t0 + 0.06, Math.random() * 0.1); s.stop(cend + 0.05);
    }
  }
  /* crowd-end */

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
  // net swish: a sharp "tssh" that sweeps down, a second ripple of the net, and a soft catch
  S.swish = function () {
    band({ freq: 4300, to: 2300, q: 0.9, dur: 0.22, vol: 0.3, attack: 0.012 });
    band({ freq: 3000, to: 1500, q: 1.1, dur: 0.24, vol: 0.15, attack: 0.02, delay: 0.07 });
    tone({ freq: 190, to: 120, type: 'sine', dur: 0.08, vol: 0.12 });
  };
  // rim: a hard metallic hit with inharmonic partials that ring out (not a square beep)
  S.clank = function (v) {
    if (!limit('clank', 0.06)) return;
    v = Math.max(0.2, Math.min(1, v || 0.7));
    band({ freq: 3000, q: 1.5, dur: 0.035, vol: 0.2 * v, attack: 0.002 });
    tone({ freq: 612, type: 'triangle', dur: 0.32, vol: 0.13 * v, attack: 0.002 });
    tone({ freq: 1567, type: 'sine', dur: 0.26, vol: 0.09 * v, attack: 0.002 });
    tone({ freq: 2471, type: 'sine', dur: 0.18, vol: 0.06 * v, attack: 0.002 });
    tone({ freq: 3689, type: 'sine', dur: 0.1, vol: 0.035 * v, attack: 0.002 });
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
    if (!ok() || !limit('cheer', 0.4)) return;
    crowd(A.ctx, A.master, big ? { dur: 2.4, vol: 0.2, voices: 11, lo: 190, hi: 470, rise: 1.3, vowel: 'e', attack: 0.12, claps: 40 }
      : { dur: 1.4, vol: 0.13, voices: 10, lo: 180, hi: 430, rise: 1.22, vowel: 'a', attack: 0.12, claps: 14 });
  };
  S.aww = function () {
    if (!ok() || !limit('aww', 1)) return;
    crowd(A.ctx, A.master, { dur: 1.1, vol: 0.09, voices: 8, lo: 200, hi: 380, rise: 0.78, vowel: 'w', attack: 0.1, breath: 0.5 });
  };
  S.whistle = function () {
    tone({ freq: 2300, type: 'sine', dur: 0.12, vol: 0.18 });
    tone({ freq: 2300, to: 2200, type: 'sine', dur: 0.3, vol: 0.18, delay: 0.15 });
  };
  S.buzzer = function () {
    tone({ freq: 190, type: 'sawtooth', dur: 0.9, vol: 0.22, lp: 1400 });
    tone({ freq: 196, type: 'square', dur: 0.9, vol: 0.12, lp: 1400 });
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
  S.coin = function () { tone({ freq: 988, type: 'square', dur: 0.07, vol: 0.16 }); tone({ freq: 1319, type: 'square', dur: 0.16, vol: 0.16, delay: 0.07 }); };
  S.win = function () { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.3, delay: i * 0.1 }); }); S.cheer(true); };
  S.lose = function () { if (ok()) Kit.sfx.lose(); };
  S.buy = function () { [523, 659, 784, 1047].forEach(function (f, i) { tone({ freq: f, type: 'square', dur: 0.09, vol: 0.15, delay: i * 0.06 }); }); };
  S.error = function () { tone({ freq: 200, to: 140, type: 'square', dur: 0.15, vol: 0.12 }); };
})();
