/* Air Hockey — synthesized sound effects (WebAudio via Kit.audio). */
(function () {
  'use strict';
  var AH = window.AH = window.AH || {};
  var A = Kit.audio;
  var lastHit = -1, lastWall = -1;

  function ok() { return A.ctx && !A.muted && A.master; }
  // Like Kit.audio.tone, but raw square/saw waves go through a low-pass (softer on school speakers).
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
  // short band-passed noise click (plastic impacts)
  function click(o) {
    if (!ok()) return;
    var c = A.ctx, t0 = c.currentTime + (o.delay || 0), dur = o.dur || 0.03;
    var src = c.createBufferSource(); src.buffer = getNoise();
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.freq || 2500; f.Q.value = o.q || 1.5;
    var g = c.createGain();
    g.gain.setValueAtTime(o.vol || 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.02);
  }

  var noiseBuf = null;
  function getNoise() {
    if (!noiseBuf) {
      var ctx = A.ctx, len = ctx.sampleRate * 2;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // Band-passed noise with an envelope (crowd, whoosh, ice).
  function band(opts) {
    if (!ok()) return;
    var ctx = A.ctx, t0 = ctx.currentTime + (opts.delay || 0), dur = opts.dur || 1;
    var src = ctx.createBufferSource(); src.buffer = getNoise();
    src.loop = true;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = opts.freq || 1000; f.Q.value = opts.q || 0.8;
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
    var g = ctx.createGain();
    var v = opts.vol || 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + (opts.attack || 0.08));
    g.gain.setValueAtTime(v, t0 + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g);
    if (opts.wobble) {
      // amplitude wobble = crowd "yeah!" texture
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = opts.wobble; lg.gain.value = v * 0.45;
      var g2 = ctx.createGain(); g2.gain.value = 1;
      lfo.connect(lg); lg.connect(g2.gain);
      g.connect(g2); g2.connect(A.master);
      lfo.start(t0); lfo.stop(t0 + dur + 0.05);
    } else {
      g.connect(A.master);
    }
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
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

  AH.sfx = {
    // mallet on puck: a hard plastic "clack" (short, bright, pitched by speed) + a thump on big hits
    hit: function (speed) {
      if (!ok()) return;
      var now = A.ctx.currentTime;
      if (now - lastHit < 0.035 && now >= lastHit) return;
      lastHit = now;
      var k = Math.min(1, speed / 1800);
      click({ freq: 2200 + k * 1400, q: 2.2, dur: 0.025 + k * 0.02, vol: 0.22 + k * 0.3 });
      tone({ freq: 980 + k * 520, to: 700 + k * 300, type: 'triangle', dur: 0.045 + k * 0.03, vol: 0.12 + k * 0.14, attack: 0.002 });
      tone({ freq: 180 + k * 60, to: 90, type: 'sine', dur: 0.06 + k * 0.08, vol: 0.12 + k * 0.25, attack: 0.002 });
      if (k > 0.75) click({ freq: 700, q: 0.8, dur: 0.12, vol: 0.18, delay: 0.005 });
    },
    // puck on the rail: a duller "tok"
    wall: function (speed) {
      if (!ok()) return;
      var now = A.ctx.currentTime;
      if (now - lastWall < 0.04 && now >= lastWall) return;
      lastWall = now;
      var k = Math.min(1, speed / 1600);
      click({ freq: 1400 + k * 600, q: 1.8, dur: 0.02 + k * 0.015, vol: 0.08 + k * 0.16 });
      tone({ freq: 520 + k * 160, to: 380, type: 'triangle', dur: 0.05, vol: 0.06 + k * 0.1, attack: 0.002 });
    },
    goal: function (good) {
      if (!ok()) return;
      // stadium horn (filtered, so it honks instead of buzzing)
      [0, 0.18].forEach(function (d) {
        tone({ freq: 233, type: 'sawtooth', dur: 0.16, vol: 0.14, delay: d, lp: 1500 });
        tone({ freq: 294, type: 'sawtooth', dur: 0.16, vol: 0.12, delay: d, lp: 1500 });
      });
      tone({ freq: 349, type: 'sawtooth', dur: 0.5, vol: 0.14, delay: 0.36, lp: 1600 });
      tone({ freq: 466, type: 'square', dur: 0.5, vol: 0.08, delay: 0.36, lp: 1800 });
      // the puck slamming into the goal box
      click({ freq: 500, q: 0.7, dur: 0.25, vol: 0.35 });
      tone({ freq: 110, to: 45, type: 'sine', dur: 0.3, vol: 0.35, attack: 0.002 });
      // crowd: a big cheer for you, a disappointed "aww" when the bot scores
      if (good) crowd(A.ctx, A.master, { dur: 2.2, vol: 0.19, voices: 11, lo: 190, hi: 460, rise: 1.3, vowel: 'e', attack: 0.12, claps: 30, delay: 0.05 });
      else crowd(A.ctx, A.master, { dur: 1.3, vol: 0.1, voices: 9, lo: 200, hi: 380, rise: 0.78, vowel: 'w', attack: 0.12, breath: 0.5, delay: 0.1 });
    },
    count: function (n) {
      if (!n) { tone({ freq: 880, type: 'square', dur: 0.28, vol: 0.18 }); tone({ freq: 1320, type: 'triangle', dur: 0.3, vol: 0.16 }); return; }
      tone({ freq: 520, type: 'square', dur: 0.12, vol: 0.14 });
    },
    power: function () { [660, 880, 1100, 1320].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.09, vol: 0.18, delay: i * 0.05 }); }); },
    grow: function () { tone({ freq: 200, to: 700, type: 'square', dur: 0.35, vol: 0.14 }); },
    shrink: function () { tone({ freq: 900, to: 250, type: 'square', dur: 0.3, vol: 0.12 }); },
    freeze: function () { band({ freq: 5000, q: 2, dur: 0.6, vol: 0.2, attack: 0.01 }); tone({ freq: 1800, to: 2600, type: 'sine', dur: 0.25, vol: 0.12 }); tone({ freq: 2400, to: 3200, type: 'sine', dur: 0.25, vol: 0.1, delay: 0.08 }); },
    fire: function () { band({ freq: 500, to: 2500, q: 0.7, dur: 0.5, vol: 0.28, attack: 0.02 }); tone({ freq: 150, to: 600, type: 'sawtooth', dur: 0.3, vol: 0.1 }); },
    spawn: function () { tone({ freq: 400, to: 900, type: 'sine', dur: 0.18, vol: 0.14 }); },
    ui: function () { tone({ freq: 700, type: 'square', dur: 0.045, vol: 0.12 }); },
    uiBack: function () { tone({ freq: 480, type: 'square', dur: 0.05, vol: 0.1 }); },
    buy: function () { Kit.sfx.coin(); tone({ freq: 1568, type: 'triangle', dur: 0.2, vol: 0.14, delay: 0.16 }); },
    nope: function () { tone({ freq: 200, to: 140, type: 'square', dur: 0.18, vol: 0.14 }); },
    award: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone({ freq: f, type: 'square', dur: 0.1, vol: 0.12, delay: i * 0.07 }); }); },
    win: function () {
      [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.28, delay: i * 0.1 }); });
      if (ok()) crowd(A.ctx, A.master, { dur: 2.8, vol: 0.18, voices: 11, lo: 190, hi: 470, rise: 1.3, vowel: 'e', attack: 0.2, claps: 55 });
    },
    lose: function () { [392, 330, 262, 196].forEach(function (f, i) { tone({ freq: f, type: 'triangle', dur: 0.24, vol: 0.26, delay: i * 0.16 }); }); },
    matchPoint: function () { tone({ freq: 988, type: 'square', dur: 0.1, vol: 0.12 }); tone({ freq: 988, type: 'square', dur: 0.1, vol: 0.12, delay: 0.14 }); }
  };
})();
