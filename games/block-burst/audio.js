/*
 * Block Burst — synthesized sounds and a soft music loop (WebAudio via Kit.audio).
 * window.BBSound
 */
(function () {
  'use strict';
  var A = Kit.audio;
  var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
  function hz(semi) { return 261.63 * Math.pow(2, semi / 12); }
  function tone(o) { A.tone(o); }

  // Soft (pink) noise, band-passed, started at a random offset: used for the "clack" body of
  // placements and the rumble of the bomb. Bright white-noise hiss is avoided on purpose.
  var nzBuf = null;
  function noiseBuf(ctx) {
    if (nzBuf) return nzBuf;
    var len = ctx.sampleRate, b0 = 0, b1 = 0, b2 = 0, mx = 0, i;
    nzBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = nzBuf.getChannelData(0);
    for (i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = b0 + b1 + b2 + w * 0.1848; if (Math.abs(d[i]) > mx) mx = Math.abs(d[i]);
    }
    for (i = 0; i < len; i++) d[i] /= mx;
    return nzBuf;
  }
  function hit(o) {
    var ctx = A.ctx;
    if (!ctx || A.muted) return;
    var t0 = ctx.currentTime + (o.delay || 0), dur = o.dur;
    var src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx);
    var f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol, t0 + (o.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t0, Math.random() * 0.6); src.stop(t0 + dur + 0.03);
  }
  // Glittery sparkle: a quick shower of high pentatonic sine pings (replaces the old hiss).
  function sparkle(o) {
    var n = o.n || 5, base = o.base || 36;
    for (var i = 0; i < n; i++) {
      var semi = base + PENTA[Math.floor(Math.random() * 8)];
      tone({ freq: hz(semi), type: 'sine', dur: 0.09 + Math.random() * 0.08, vol: (o.vol || 0.05) * (1 - i / (n * 1.6)), delay: (o.delay || 0) + i * (o.gap || 0.035) + Math.random() * 0.015, attack: 0.003 });
    }
  }
  function crackle(o) { sparkle({ n: Math.round(4 + (o.dur || 0.2) * 8), vol: (o.vol || 0.15) * 0.4, delay: o.delay, base: o.hp >= 4000 ? 38 : 34 }); }

  var S = {
    hover: function () { tone({ freq: 1200, type: 'sine', dur: 0.03, vol: 0.05 }); },
    button: function () { tone({ freq: 520, to: 780, type: 'triangle', dur: 0.08, vol: 0.2 }); },
    pick: function () { tone({ freq: 420, to: 760, type: 'sine', dur: 0.09, vol: 0.22 }); tone({ freq: 900, type: 'triangle', dur: 0.05, vol: 0.06, delay: 0.03 }); },
    snap: function () { tone({ freq: 1500, type: 'sine', dur: 0.025, vol: 0.04 }); },
    back: function () { tone({ freq: 330, to: 170, type: 'triangle', dur: 0.14, vol: 0.22 }); },
    place: function (n) {
      var f = 200 - Math.min(5, n) * 12;
      tone({ freq: f, to: f * 0.55, type: 'triangle', dur: 0.12, vol: 0.45 });
      tone({ freq: f * 3.1, type: 'sine', dur: 0.05, vol: 0.12 });
      hit({ f: 1100, q: 1.2, dur: 0.05, vol: 0.5 });
    },
    clear: function (lines, streak) {
      var base = Math.min(8, Math.max(0, streak - 1)) * 2;
      var n = 3 + Math.min(4, lines);
      for (var i = 0; i < n; i++) {
        var semi = PENTA[Math.min(PENTA.length - 1, base + i)];
        tone({ freq: hz(semi + 12), type: 'triangle', dur: 0.18, vol: 0.25, delay: i * 0.045 });
        tone({ freq: hz(semi + 24), type: 'sine', dur: 0.14, vol: 0.09, delay: i * 0.045 + 0.01 });
      }
      // ring out on the top note (a longer, softer bell) so clears feel like a reward
      var top = PENTA[Math.min(PENTA.length - 1, base + n - 1)];
      tone({ freq: hz(top + 24), type: 'sine', dur: 0.5, vol: 0.06, delay: n * 0.045, attack: 0.01 });
      crackle({ dur: 0.35 + lines * 0.05, vol: 0.16 + Math.min(0.14, lines * 0.03), hp: 3000 });
      hit({ f: 600, type: 'lowpass', to: 110, dur: 0.2, vol: 0.45 });
    },
    word: function (level) {
      // stinger chord for Great / Amazing / Unbelievable
      var roots = [0, 5, 7, 12];
      var r = roots[Math.min(3, level)];
      [0, 4, 7, 12].forEach(function (s, i) {
        tone({ freq: hz(r + s + 12), type: 'triangle', dur: 0.3, vol: 0.09, delay: 0.12 + i * 0.03 });
        tone({ freq: hz(r + s), type: 'triangle', dur: 0.4, vol: 0.12, delay: 0.12 });
      });
      A.tone({ freq: 90, to: 45, type: 'sine', dur: 0.35, vol: 0.4, delay: 0.1 });
    },
    perfect: function () {
      [0, 4, 7, 12, 16, 19, 24].forEach(function (s, i) { tone({ freq: hz(s + 12), type: 'triangle', dur: 0.3, vol: 0.2, delay: i * 0.07 }); });
      [0, 7, 12].forEach(function (s) { tone({ freq: hz(s + 12), type: 'triangle', dur: 1.0, vol: 0.07, delay: 0.5, attack: 0.03 }); });
      crackle({ dur: 0.8, vol: 0.18, hp: 4000, delay: 0.45 });
    },
    gem: function (i) { tone({ freq: hz(24 + PENTA[(i || 0) % 6]), type: 'sine', dur: 0.14, vol: 0.18 }); tone({ freq: hz(31 + PENTA[(i || 0) % 6]), type: 'sine', dur: 0.1, vol: 0.08, delay: 0.04 }); },
    deal: function () {
      hit({ f: 1400, q: 0.8, to: 700, dur: 0.16, vol: 0.18, attack: 0.02 });
      [0, 1, 2].forEach(function (i) { tone({ freq: 500 + i * 140, to: 800 + i * 140, type: 'sine', dur: 0.06, vol: 0.1, delay: 0.08 + i * 0.07 }); });
    },
    bad: function () { tone({ freq: 180, to: 120, type: 'triangle', dur: 0.14, vol: 0.2 }); },
    bomb: function () {
      hit({ f: 1400, type: 'lowpass', to: 50, dur: 0.7, vol: 0.9 });
      tone({ freq: 120, to: 35, type: 'sine', dur: 0.5, vol: 0.55 });
      crackle({ dur: 0.4, vol: 0.12, hp: 2000, delay: 0.05 });
    },
    fuse: function () { hit({ f: 2500, q: 2, dur: 0.1, vol: 0.12 }); },
    shuffle: function () {
      hit({ f: 1800, q: 0.7, to: 500, dur: 0.3, vol: 0.3, attack: 0.03 });
      [0, 2, 4, 7, 9].forEach(function (s, i) { tone({ freq: hz(s + 12), type: 'sine', dur: 0.08, vol: 0.14, delay: i * 0.04 }); });
    },
    gift: function () { [7, 12, 16, 19, 24].forEach(function (s, i) { tone({ freq: hz(s + 12), type: 'triangle', dur: 0.14, vol: 0.18, delay: i * 0.06 }); }); },
    stuck: function () { tone({ freq: 440, to: 330, type: 'triangle', dur: 0.2, vol: 0.18 }); tone({ freq: 440, to: 330, type: 'triangle', dur: 0.2, vol: 0.18, delay: 0.22 }); },
    greyTick: function (i) { tone({ freq: 300 - i * 18, type: 'triangle', dur: 0.06, vol: 0.12 }); },
    over: function () { [7, 4, 0, -5].forEach(function (s, i) { tone({ freq: hz(s), type: 'triangle', dur: 0.3, vol: 0.25, delay: i * 0.16 }); }); },
    win: function () { [0, 4, 7, 12, 7, 12, 16].forEach(function (s, i) { tone({ freq: hz(s + 12), type: 'triangle', dur: 0.18, vol: 0.24, delay: i * 0.09 }); }); },
    star: function (i) { tone({ freq: hz(19 + i * 5), type: 'triangle', dur: 0.25, vol: 0.25 }); tone({ freq: hz(31 + i * 5), type: 'sine', dur: 0.2, vol: 0.1, delay: 0.03 }); crackle({ dur: 0.2, vol: 0.08, hp: 5000 }); },
    newBest: function () { [0, 4, 7, 12, 16, 19, 24, 28].forEach(function (s, i) { tone({ freq: hz(s + 12), type: 'triangle', dur: 0.14, vol: 0.16, delay: i * 0.06 }); }); },
    tick: function () { tone({ freq: 1800, type: 'sine', dur: 0.02, vol: 0.05 }); },
    unlock: function () { [12, 16, 19, 24, 28, 31].forEach(function (s, i) { tone({ freq: hz(s), type: 'sine', dur: 0.22, vol: 0.2, delay: i * 0.08 }); }); }
  };

  /* ------------------------------------------------------------ music */
  // Soft generative loop, 16 bars in an A A B A form so it doesn't feel like one 4-bar loop:
  // A = I - V - vi - IV, B = vi - IV - I - V with a different arpeggio. Bass + plucky arpeggio.
  // It stops scheduling while the tab is hidden and plays quieter while the game is paused.
  var CH_A = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
  var CH_B = [[9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14]];
  var PAT_A = [0, 1, 2, 1, 2, 0, 1, 2], PAT_B = [0, 2, 1, 2, 0, 2, 1, 0];
  var music = { on: true, playing: false, step: 0, next: 0, timer: 0, duck: 1 };
  var BEAT = 60 / 104 / 2; // 8th notes
  function schedule() {
    var ctx = A.ctx;
    if (!ctx || !music.playing) return;
    if (document.hidden) { music.next = 0; return; }
    if (music.next < ctx.currentTime) music.next = ctx.currentTime + 0.05;
    while (music.next < ctx.currentTime + 0.25) {
      var st = music.step, barAll = Math.floor(st / 8), bar = barAll % 4, pos = st % 8;
      var sec = Math.floor(barAll / 4) % 4, isB = sec === 2;
      var ch = (isB ? CH_B : CH_A)[bar], pat = isB ? PAT_B : PAT_A, vol = music.duck;
      var d = music.next - ctx.currentTime;
      if (!A.muted && music.on) {
        if (pos === 0 || pos === 4) A.tone({ freq: hz(ch[0] - 24), type: 'triangle', dur: BEAT * 3, vol: 0.09 * vol, delay: d, attack: 0.01 });
        var semi = ch[pat[pos]] + (pos >= 4 && bar % 2 ? 12 : 0);
        A.tone({ freq: hz(semi), type: 'sine', dur: BEAT * 0.9, vol: (pos % 2 ? 0.035 : 0.05) * vol, delay: d, attack: 0.008 });
        if (pos === 6 && (barAll % 2)) A.tone({ freq: hz(ch[2] + 12), type: 'sine', dur: BEAT * 1.5, vol: 0.025 * vol, delay: d });
        // a tiny bell melody on the B section
        if (isB && (pos === 0 || pos === 3)) A.tone({ freq: hz(ch[pos === 0 ? 2 : 1] + 12), type: 'triangle', dur: BEAT * 2, vol: 0.03 * vol, delay: d, attack: 0.01 });
      }
      music.step++;
      music.next += BEAT;
    }
  }
  S.music = {
    start: function () {
      if (music.playing) return;
      music.playing = true; music.next = 0;
      if (!music.timer) music.timer = setInterval(schedule, 90);
    },
    stop: function () { music.playing = false; },
    duck: function (on) { music.duck = on ? 0.35 : 1; },
    setOn: function (v) { music.on = !!v; },
    isOn: function () { return music.on; }
  };

  window.BBSound = S;
})();
