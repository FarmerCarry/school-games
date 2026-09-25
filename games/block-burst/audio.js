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

  var hpBuf = null;
  function crackle(o) {
    // bright glassy noise (high-passed)
    var ctx = A.ctx;
    if (!ctx || A.muted) return;
    if (!hpBuf) {
      hpBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      var d = hpBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t0 = ctx.currentTime + (o.delay || 0), dur = o.dur || 0.2;
    var src = ctx.createBufferSource(); src.buffer = hpBuf;
    var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp || 2500;
    var g = ctx.createGain();
    g.gain.setValueAtTime(o.vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

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
      A.noise({ dur: 0.06, vol: 0.18, filter: 2400, to: 400 });
    },
    clear: function (lines, streak) {
      var base = Math.min(8, Math.max(0, streak - 1)) * 2;
      var n = 3 + Math.min(4, lines);
      for (var i = 0; i < n; i++) {
        var semi = PENTA[Math.min(PENTA.length - 1, base + i)];
        tone({ freq: hz(semi + 12), type: 'triangle', dur: 0.16, vol: 0.2, delay: i * 0.045 });
        tone({ freq: hz(semi + 24), type: 'sine', dur: 0.12, vol: 0.07, delay: i * 0.045 + 0.01 });
      }
      crackle({ dur: 0.35 + lines * 0.05, vol: 0.16 + Math.min(0.14, lines * 0.03), hp: 3000 });
      A.noise({ dur: 0.18, vol: 0.2, filter: 900, to: 120 });
    },
    word: function (level) {
      // stinger chord for Great / Amazing / Unbelievable
      var roots = [0, 5, 7, 12];
      var r = roots[Math.min(3, level)];
      [0, 4, 7, 12].forEach(function (s, i) {
        tone({ freq: hz(r + s + 12), type: 'square', dur: 0.26, vol: 0.07, delay: 0.12 + i * 0.03 });
        tone({ freq: hz(r + s), type: 'triangle', dur: 0.4, vol: 0.12, delay: 0.12 });
      });
      A.tone({ freq: 90, to: 45, type: 'sine', dur: 0.35, vol: 0.4, delay: 0.1 });
    },
    perfect: function () {
      [0, 4, 7, 12, 16, 19, 24].forEach(function (s, i) { tone({ freq: hz(s + 12), type: 'triangle', dur: 0.3, vol: 0.2, delay: i * 0.07 }); });
      [0, 7, 12].forEach(function (s) { tone({ freq: hz(s), type: 'sawtooth', dur: 0.9, vol: 0.05, delay: 0.5 }); });
      crackle({ dur: 0.8, vol: 0.18, hp: 4000, delay: 0.45 });
    },
    gem: function (i) { tone({ freq: hz(24 + PENTA[(i || 0) % 6]), type: 'sine', dur: 0.14, vol: 0.18 }); tone({ freq: hz(31 + PENTA[(i || 0) % 6]), type: 'sine', dur: 0.1, vol: 0.08, delay: 0.04 }); },
    deal: function () {
      A.noise({ dur: 0.18, vol: 0.08, filter: 2500, to: 600 });
      [0, 1, 2].forEach(function (i) { tone({ freq: 500 + i * 140, to: 800 + i * 140, type: 'sine', dur: 0.06, vol: 0.1, delay: 0.08 + i * 0.07 }); });
    },
    bad: function () { tone({ freq: 180, to: 120, type: 'square', dur: 0.12, vol: 0.1 }); },
    bomb: function () {
      A.noise({ dur: 0.7, vol: 0.55, filter: 1400, to: 50 });
      tone({ freq: 120, to: 35, type: 'sine', dur: 0.5, vol: 0.55 });
      crackle({ dur: 0.4, vol: 0.12, hp: 2000, delay: 0.05 });
    },
    fuse: function () { crackle({ dur: 0.12, vol: 0.05, hp: 5000 }); },
    shuffle: function () {
      A.noise({ dur: 0.35, vol: 0.18, filter: 4000, to: 500 });
      [0, 2, 4, 7, 9].forEach(function (s, i) { tone({ freq: hz(s + 12), type: 'sine', dur: 0.08, vol: 0.14, delay: i * 0.04 }); });
    },
    gift: function () { [7, 12, 16, 19, 24].forEach(function (s, i) { tone({ freq: hz(s + 12), type: 'triangle', dur: 0.14, vol: 0.18, delay: i * 0.06 }); }); },
    stuck: function () { tone({ freq: 440, to: 330, type: 'triangle', dur: 0.2, vol: 0.18 }); tone({ freq: 440, to: 330, type: 'triangle', dur: 0.2, vol: 0.18, delay: 0.22 }); },
    greyTick: function (i) { tone({ freq: 300 - i * 18, type: 'triangle', dur: 0.06, vol: 0.12 }); },
    over: function () { [7, 4, 0, -5].forEach(function (s, i) { tone({ freq: hz(s), type: 'triangle', dur: 0.3, vol: 0.25, delay: i * 0.16 }); }); },
    win: function () { [0, 4, 7, 12, 7, 12, 16].forEach(function (s, i) { tone({ freq: hz(s + 12), type: 'triangle', dur: 0.18, vol: 0.24, delay: i * 0.09 }); }); },
    star: function (i) { tone({ freq: hz(19 + i * 5), type: 'triangle', dur: 0.25, vol: 0.25 }); tone({ freq: hz(31 + i * 5), type: 'sine', dur: 0.2, vol: 0.1, delay: 0.03 }); crackle({ dur: 0.2, vol: 0.08, hp: 5000 }); },
    newBest: function () { [0, 4, 7, 12, 16, 19, 24, 28].forEach(function (s, i) { tone({ freq: hz(s + 12), type: 'square', dur: 0.12, vol: 0.1, delay: i * 0.06 }); }); },
    tick: function () { tone({ freq: 1800, type: 'sine', dur: 0.02, vol: 0.05 }); },
    unlock: function () { [12, 16, 19, 24, 28, 31].forEach(function (s, i) { tone({ freq: hz(s), type: 'sine', dur: 0.22, vol: 0.2, delay: i * 0.08 }); }); }
  };

  /* ------------------------------------------------------------ music */
  // Soft generative loop: I - V - vi - IV, bass + plucky arpeggio. Low volume.
  var CH = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
  var music = { on: true, playing: false, step: 0, next: 0, timer: 0 };
  var BEAT = 60 / 104 / 2; // 8th notes
  function schedule() {
    var ctx = A.ctx;
    if (!ctx || !music.playing) return;
    if (music.next < ctx.currentTime) music.next = ctx.currentTime + 0.05;
    while (music.next < ctx.currentTime + 0.25) {
      var st = music.step, bar = Math.floor(st / 8) % 4, pos = st % 8, ch = CH[bar];
      var d = music.next - ctx.currentTime;
      if (!A.muted && music.on) {
        if (pos === 0 || pos === 4) A.tone({ freq: hz(ch[0] - 24), type: 'triangle', dur: BEAT * 3, vol: 0.09, delay: d, attack: 0.01 });
        var pat = [0, 1, 2, 1, 2, 0, 1, 2];
        var semi = ch[pat[pos]] + (pos >= 4 && bar % 2 ? 12 : 0);
        A.tone({ freq: hz(semi), type: 'sine', dur: BEAT * 0.9, vol: pos % 2 ? 0.035 : 0.05, delay: d, attack: 0.008 });
        if (pos === 6 && (st >> 3) % 2) A.tone({ freq: hz(ch[2] + 12), type: 'sine', dur: BEAT * 1.5, vol: 0.025, delay: d });
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
    setOn: function (v) { music.on = !!v; },
    isOn: function () { return music.on; }
  };

  window.BBSound = S;
})();
