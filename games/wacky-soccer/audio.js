/* Wacky Soccer — synthesized sounds (WebAudio, no files). */
(function () {
  'use strict';
  var WS = window.WS = window.WS || {};
  var A = Kit.audio;
  var S = WS.sfx = { quiet: false };
  var noiseBuf = null;
  var lastPlay = {};

  function ctx() { return (!A.ctx || A.muted || S.quiet) ? null : A.ctx; }
  function limit(name, gap) {
    var c = A.ctx; if (!c) return false;
    var t = c.currentTime;
    if (lastPlay[name] && t - lastPlay[name] < gap) return false;
    lastPlay[name] = t; return true;
  }
  function getNoise(c) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  // flexible tone: {f, to, type, dur, vol, delay, attack, vib, vibF}
  function tone(o) {
    var c = ctx(); if (!c) return;
    var t0 = c.currentTime + (o.delay || 0), dur = o.dur || 0.15, vol = o.vol == null ? 0.2 : o.vol;
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f || 440, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    if (o.vib) {
      var l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = o.vibF || 30; lg.gain.value = o.vib;
      l.connect(lg); lg.connect(osc.frequency); l.start(t0); l.stop(t0 + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.006));
    if (o.hold) g.gain.setValueAtTime(vol, t0 + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    // raw square/saw waves are harsh on school speakers: round them off with a low-pass
    var lpF = o.lp || ((osc.type === 'square' || osc.type === 'sawtooth') ? Math.min(4500, Math.max(1200, (o.f || 440) * 5)) : 0);
    if (lpF) {
      var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpF; lp.Q.value = 0.7;
      osc.connect(lp); lp.connect(g);
    } else osc.connect(g);
    g.connect(A.master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  // filtered noise: {dur, vol, delay, type:'lowpass'|'bandpass'|'highpass', f, to, q, attack}
  function noise(o) {
    var c = ctx(); if (!c) return;
    var t0 = c.currentTime + (o.delay || 0), dur = o.dur || 0.2, vol = o.vol == null ? 0.2 : o.vol;
    var src = c.createBufferSource(); src.buffer = getNoise(c);
    var f = c.createBiquadFilter(); f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t0 + dur);
    f.Q.value = o.q || 1;
    var g = c.createGain();
    var at = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + at);
    if (o.hold) g.gain.setValueAtTime(vol, t0 + at + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.05);
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

  S.tone = tone; S.noise = noise;

  S.kick = function (p) {
    if (!limit('kick', 0.04)) return;
    var v = Math.min(1, p / 900);
    tone({ f: 180, to: 45, type: 'sine', dur: 0.16, vol: 0.45 * (0.5 + v * 0.5) });
    noise({ f: 2400, to: 300, dur: 0.09, vol: 0.25 * v });
  };
  S.touch = function (p) {
    if (!limit('touch', 0.05)) return;
    var v = Math.min(1, p / 700);
    tone({ f: 220, to: 90, type: 'sine', dur: 0.09, vol: 0.25 * v + 0.05 });
  };
  S.header = function () {
    if (!limit('head', 0.08)) return;
    tone({ f: 520, to: 260, type: 'sine', dur: 0.12, vol: 0.28 });
    tone({ f: 780, to: 390, type: 'triangle', dur: 0.08, vol: 0.12 });
  };
  S.bounce = function (p) {
    if (!limit('bounce', 0.05)) return;
    var v = Math.min(1, p / 900);
    tone({ f: 150, to: 70, type: 'sine', dur: 0.1, vol: 0.2 * v + 0.04 });
  };
  S.post = function () {
    if (!limit('post', 0.08)) return;
    tone({ f: 1320, type: 'triangle', dur: 0.5, vol: 0.2 });
    tone({ f: 1870, type: 'sine', dur: 0.35, vol: 0.12 });
    tone({ f: 990, to: 960, type: 'square', dur: 0.12, vol: 0.06 });
  };
  S.jump = function (pitch) {
    if (!limit('jump', 0.03)) return;
    pitch = pitch || 1;
    tone({ f: 200 * pitch, to: 520 * pitch, type: 'sine', dur: 0.16, vol: 0.18, vib: 25, vibF: 18 });
  };
  S.flip = function () { tone({ f: 300, to: 900, type: 'triangle', dur: 0.2, vol: 0.14 }); };
  S.land = function (p) {
    if (!limit('land', 0.05)) return;
    noise({ f: 500, to: 120, dur: 0.12, vol: Math.min(0.25, p / 3000) });
  };
  S.bonk = function () {
    if (!limit('bonk', 0.1)) return;
    tone({ f: 600, to: 200, type: 'square', dur: 0.1, vol: 0.1 });
    tone({ f: 900, to: 450, type: 'sine', dur: 0.14, vol: 0.18, delay: 0.02 });
  };
  S.bump = function () {
    if (!limit('bump', 0.12)) return;
    tone({ f: 140, to: 90, type: 'square', dur: 0.08, vol: 0.09 });
    tone({ f: 330, to: 180, type: 'sine', dur: 0.12, vol: 0.16 });
  };
  S.boing = function () {
    if (!limit('boing', 0.12)) return;
    tone({ f: 180, to: 620, type: 'sine', dur: 0.35, vol: 0.2, vib: 60, vibF: 14 });
  };
  S.whistle = function (n) {
    n = n || 1;
    for (var i = 0; i < n; i++) {
      var long = (i === n - 1) ? (n > 1 ? 0.7 : 0.4) : 0.18;
      tone({ f: 2900, type: 'sine', dur: long, vol: 0.13, vib: 160, vibF: 34, hold: long * 0.7, delay: i * 0.28 });
      tone({ f: 3350, type: 'sine', dur: long, vol: 0.05, vib: 160, vibF: 34, hold: long * 0.7, delay: i * 0.28 });
    }
  };
  S.cheer = function (big) {
    var c = ctx(); if (!c) return;
    if (!limit('cheer', 0.5)) return;
    crowd(c, A.master, big ? { dur: 2.8, vol: 0.2, voices: 11, lo: 190, hi: 460, rise: 1.3, vowel: 'e', attack: 0.15, claps: 45 }
      : { dur: 1.5, vol: 0.12, voices: 9, lo: 180, hi: 420, rise: 1.2, vowel: 'a', attack: 0.15, claps: 12 });
  };
  // near miss: "ooooh!" (rising then falling, round vowel)
  S.ooh = function () {
    var c = ctx(); if (!c) return;
    if (!limit('ooh', 1.2)) return;
    crowd(c, A.master, { dur: 1.3, vol: 0.13, voices: 10, lo: 160, hi: 340, rise: 1.18, vowel: 'o', attack: 0.18, breath: 0.6 });
  };
  // the other team scored: a small disappointed "awww"
  S.aww = function () {
    var c = ctx(); if (!c) return;
    if (!limit('aww', 1.2)) return;
    crowd(c, A.master, { dur: 1.2, vol: 0.08, voices: 8, lo: 200, hi: 380, rise: 0.78, vowel: 'w', attack: 0.12, breath: 0.5 });
  };
  S.horn = function () {
    [220, 277, 330, 440].forEach(function (f) { tone({ f: f, type: 'sawtooth', dur: 0.9, vol: 0.07, hold: 0.6, attack: 0.02 }); });
  };
  // mine = the goal was scored by a human player (or anyone in 2-player mode)
  S.goal = function (mine) {
    S.horn();
    if (mine === false) { S.aww(); return; }
    [523, 659, 784, 1047].forEach(function (f, i) { tone({ f: f, type: 'square', dur: 0.14, vol: 0.1, delay: 0.1 + i * 0.08 }); });
    S.cheer(true);
  };
  // one noise source with a scheduled hit envelope (was ~33 separate sources)
  S.drumroll = function (dur) {
    var c = ctx(); if (!c) return;
    var t0 = c.currentTime, n = Math.floor(dur / 0.045);
    var src = c.createBufferSource(); src.buffer = getNoise(c); src.loop = true;
    var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 650;
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t0);
    for (var i = 0; i < n; i++) {
      var t = t0 + i * 0.045, v = 0.14 + 0.2 * i / n;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    }
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t0, Math.random()); src.stop(t0 + n * 0.045 + 0.05);
  };
  S.tada = function () {
    [392, 523, 659, 784].forEach(function (f, i) { tone({ f: f, type: 'triangle', dur: 0.5, vol: 0.14, delay: i * 0.05 }); });
    tone({ f: 1047, type: 'square', dur: 0.4, vol: 0.06, delay: 0.2 });
    noise({ type: 'highpass', f: 6000, dur: 0.5, vol: 0.08, delay: 0.2 });
  };
  S.tick = function () { tone({ f: 1600, type: 'square', dur: 0.025, vol: 0.05 }); };
  S.beep = function (hi) { tone({ f: hi ? 1047 : 587, type: 'square', dur: hi ? 0.35 : 0.14, vol: 0.12 }); };
  S.click = function () { tone({ f: 700, to: 1000, type: 'square', dur: 0.06, vol: 0.09 }); };
  S.hover = function () { if (limit('hover', 0.05)) tone({ f: 1200, type: 'sine', dur: 0.04, vol: 0.05 }); };
  S.nope = function () { tone({ f: 220, to: 160, type: 'square', dur: 0.18, vol: 0.1 }); };
  S.coin = function () {
    if (!limit('coin', 0.05)) return;
    tone({ f: 988, type: 'square', dur: 0.06, vol: 0.08 }); tone({ f: 1319, type: 'square', dur: 0.12, vol: 0.08, delay: 0.06 });
  };
  S.buy = function () {
    [659, 784, 988, 1319].forEach(function (f, i) { tone({ f: f, type: 'square', dur: 0.1, vol: 0.09, delay: i * 0.06 }); });
    noise({ type: 'highpass', f: 5000, dur: 0.4, vol: 0.06, delay: 0.2 });
  };
  S.win = function () {
    var m = [523, 659, 784, 1047, 784, 1047, 1319];
    m.forEach(function (f, i) { tone({ f: f, type: 'square', dur: i === m.length - 1 ? 0.6 : 0.14, vol: 0.1, delay: i * 0.12 }); });
    m.forEach(function (f, i) { tone({ f: f / 2, type: 'triangle', dur: 0.16, vol: 0.12, delay: i * 0.12 }); });
    S.cheer(true);
  };
  S.lose = function () {
    tone({ f: 392, to: 370, type: 'sawtooth', dur: 0.35, vol: 0.08, vib: 8, vibF: 6 });
    tone({ f: 370, to: 349, type: 'sawtooth', dur: 0.35, vol: 0.08, vib: 8, vibF: 6, delay: 0.38 });
    tone({ f: 349, to: 330, type: 'sawtooth', dur: 0.35, vol: 0.08, vib: 8, vibF: 6, delay: 0.76 });
    tone({ f: 330, to: 220, type: 'sawtooth', dur: 1.0, vol: 0.09, vib: 12, vibF: 5, delay: 1.14 });
  };
  S.trophy = function () {
    var m = [523, 523, 523, 698, 880, 784, 880, 1047];
    var d = [0, 0.12, 0.24, 0.36, 0.72, 0.96, 1.08, 1.2];
    m.forEach(function (f, i) { tone({ f: f, type: 'square', dur: i === m.length - 1 ? 0.8 : 0.16, vol: 0.1, delay: d[i] }); tone({ f: f / 2, type: 'triangle', dur: 0.2, vol: 0.12, delay: d[i] }); });
    S.cheer(true);
  };
})();
