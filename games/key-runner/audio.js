/* Soft candy loop plus the clicks that match a key press. No audio files. */
(function (KR) {
  'use strict';
  var music = null;
  var playing = false;
  var next = 0;
  var step = 0;
  var bpm = 112;
  var MELODY = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46];
  var BASS = [196, 196, 246.94, 220, 174.61, 196, 246.94, 164.81];

  function bus() {
    var ctx = Kit.audio.ctx;
    if (!ctx || !Kit.audio.master) return null;
    if (!music) {
      music = ctx.createGain();
      music.gain.value = 0.22;
      music.connect(Kit.audio.master);
    }
    return ctx;
  }
  function tone(ctx, t, freq, dur, type, vol) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, freq), t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(music);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  function hat(ctx, t) {
    var len = Math.floor(ctx.sampleRate * 0.04);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 5000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(filter);
    filter.connect(g);
    g.connect(music);
    src.start(t);
    src.stop(t + 0.05);
  }

  KR.music = function (on, height) {
    playing = !!on;
    bpm = Math.max(108, Math.min(156, 112 + (height || 0) * 0.85));
    if (on) {
      Kit.audio.unlock();
      bus();
    }
  };
  KR.musicTick = function () {
    if (!playing) return;
    var ctx = bus();
    if (!ctx || Kit.audio.muted) return;
    var eighth = 60 / bpm / 2;
    var t = ctx.currentTime;
    if (next < t) next = t + 0.04;
    var guard = 0;
    while (next < t + 0.24 && guard++ < 8) {
      var i = step % 16;
      var bar = Math.floor(step / 16) % 4;
      if (i % 4 === 0) tone(ctx, next, i % 8 === 0 ? 90 : 70, 0.09, 'sine', 0.16);
      if (i % 2 === 0) hat(ctx, next);
      if (i % 2 === 0) tone(ctx, next, BASS[(Math.floor(step / 2) + bar) % BASS.length], 0.16, 'triangle', 0.07);
      tone(ctx, next, MELODY[(step + bar) % MELODY.length] * (bar === 3 ? 1.25 : 1), 0.14, 'square', 0.035);
      if (i === 14) tone(ctx, next, MELODY[2], 0.18, 'triangle', 0.04);
      step++;
      next += eighth;
    }
  };

  KR.sound = function (name, extra) {
    var toneKit = Kit.audio.tone;
    if (name === 'jump') Kit.sfx.jump();
    else if (name === 'land') {
      toneKit({ freq: 210 + ((extra || 0) % 6) * 24, to: 90, type: 'triangle', dur: 0.07, vol: 0.07 });
      Kit.audio.noise({ dur: 0.05, vol: 0.035, filter: 800, to: 200 });
    }
    else if (name === 'press') {
      var n = Math.min(12, extra || 1);
      toneKit({ freq: 520 + n * 38, to: 980 + n * 46, type: 'square', dur: 0.045, vol: 0.06 });
    }
    else if (name === 'bounce') toneKit({ freq: 280, to: 960, type: 'square', dur: 0.12, vol: 0.08 });
    else if (name === 'haste') toneKit({ freq: 360, to: 880, type: 'square', dur: 0.16, vol: 0.07 });
    else if (name === 'checkpoint') {
      [523, 659, 784, 1046].forEach(function (f, i) {
        toneKit({ freq: f, type: 'square', dur: 0.1, vol: 0.07, delay: i * 0.06 });
      });
    }
    else if (name === 'fall' || name === 'splash') {
      Kit.audio.noise({ dur: 0.18, vol: 0.06, filter: 500, to: 120 });
      toneKit({ freq: 180, to: 70, type: 'sine', dur: 0.2, vol: 0.06 });
    }
    else if (name === 'glug') {
      toneKit({ freq: 70, to: 46, type: 'sine', dur: 0.28, vol: 0.08 });
      Kit.audio.noise({ dur: 0.16, vol: 0.04, filter: 240 });
    }
    else if (name === 'world') Kit.sfx.win();
    else if (name === 'record') {
      [523, 659, 784, 1047].forEach(function (f, i) {
        toneKit({ freq: f, type: 'triangle', dur: 0.11, vol: 0.09, delay: i * 0.07 });
      });
    }
  };
})(window.KeyRunner = window.KeyRunner || {});
