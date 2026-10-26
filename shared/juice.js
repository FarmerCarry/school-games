/*
 * Juice — procedural sound effects for games and the portal (docs/ARCHITECTURE.md "Juice").
 * Plain script (no modules). A game loads it after kit.js and gets Kit.juice; the
 * portal loads it before js/site.js and gets window.Juice.
 *
 *   J.tap()  J.select()  J.back()  J.toggle(on)  J.error()  J.hover() (very soft)
 *   J.streak(n)      pluck climbing a pentatonic ladder with the combo count n = 1, 2, 3…
 *   J.impact(power)  0..1: click + noise burst + pitched thump
 *   J.chime(level)   1..3: bell partials, sparkle at higher levels
 *   J.coin(n)        n = 1..5 climbs the same ladder for quick pickups
 *   J.pop(size)  J.whoosh(speed)  J.jump(h)  J.land(power)   (0..1)
 *   J.star(i)        1..3: ascending star award
 *   J.levelUp()  J.fail()  J.countdown(i)   (3, 2, 1 beep; 0 is "go")
 *   J.setQuiet(on)   an extra quiet switch: no sound at all while on
 *
 * Games play through the Kit audio graph: Kit creates Kit.audio.ctx on the first key
 * press or click and mute turns Kit.audio.master down. The portal creates its own
 * AudioContext on the first key press or click and follows sg:site:muted and the stored
 * classroom preset (sg:site:classroom), read again at every sound.
 * Nothing plays before a user gesture or while muted (no audio nodes are created then).
 *
 * Every sound is one short one-shot synthesised on the spot: no files, no loops, no
 * music. Voices -> juice bus -> limiter -> master. At most 14 voices sound at once
 * (busy gameplay sounds are skipped when full; UI and reward cues always play), the
 * same sound again within 25 ms is dropped, each play varies its pitch by up to 2 %,
 * and every source stops within 1.5 s of its start. Odd arguments fall back to defaults.
 */
(function () {
  'use strict';
  var W = window, Kit = W.Kit, kit = Kit && Kit.audio;
  if (Kit ? Kit.juice : W.Juice) return;
  var own = null, master = null, up = false, quiet = false, bus = null, buf = null, last = {}, ends = [];
  var C, T, P, L; // context, start time, pitch factor and length of the voice being built
  var WAVES = ['sine', 'triangle'], FILTERS = ['lowpass', 'highpass', 'bandpass'];
  var J = {};

  function num(x, lo, hi, fallback) { return typeof x === 'number' && x === x ? x < lo ? lo : x > hi ? hi : x : fallback; }
  // The portal's own stored switches: sg:site:muted and the classroom preset.
  function site(key) { try { return !!JSON.parse(W.localStorage.getItem('sg:site:' + key)); } catch (e) { return false; } }
  function muted() { return quiet || (kit ? kit.muted : site('muted') || site('classroom')); }

  // Portal only: an own context on the first gesture, resumed by later ones.
  function unlock() {
    var AC = W.AudioContext || W.webkitAudioContext;
    try {
      if (!own && AC) {
        own = new AC(); master = own.createGain();
        master.gain.value = (up = !muted()) ? 0.5 : 0;
        master.connect(own.destination);
      }
      if (own && own.state === 'suspended') { var p = own.resume(); if (p && p.catch) p.catch(function () { /* a later gesture retries */ }); }
    } catch (e) { own = master = null; }
  }
  // Cut what is still sounding when the portal mutes (another tab, or setQuiet), and
  // turn the master up again at the next sound after the portal's own unmute (which
  // fires no storage event in this page).
  function paint() { if (master) try { master.gain.setTargetAtTime((up = !muted()) ? 0.5 : 0, own.currentTime, 0.015); } catch (e) { /* ignore */ } }
  if (!kit && W.addEventListener) {
    W.addEventListener('pointerdown', unlock, true);
    W.addEventListener('keydown', unlock, true);
    W.addEventListener('storage', function (e) { if (!e.key || /^sg:site:(muted|classroom)$/.test(e.key)) paint(); });
  }

  // The context to play in, or null before the first gesture or while muted.
  // The bus, limiter and noise buffer are made once per context.
  function live() {
    var c = kit ? kit.ctx : own;
    if (!c || muted()) return null;
    if (!up) paint();
    if (!bus || bus.context !== c) {
      var limit = c.createDynamicsCompressor(), n = c.sampleRate, data;
      // Ratio 12, attack 3 ms. A new compressor starts fully turned down and recovers
      // at its release speed, which would swallow the first sounds: release starts at
      // 2 ms and becomes 250 ms once it has settled.
      limit.threshold.value = -6; limit.knee.value = 4;
      limit.release.setValueAtTime(0.002, c.currentTime); limit.release.setValueAtTime(0.25, c.currentTime + 0.05);
      bus = c.createGain();
      bus.connect(limit).connect(kit ? kit.master : master);
      buf = c.createBuffer(1, n, n); data = buf.getChannelData(0);
      for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    }
    return c;
  }

  // J[name](x) plays one voice; hi marks UI and reward cues that play even when full.
  function sound(name, hi, build) {
    J[name] = function (x) {
      var c, now;
      try {
        if (!(c = live())) return;
        now = c.currentTime;
        if (now - last[name] < 0.025) return;
        ends = ends.filter(function (end) { return end > now; });
        if (ends.length >= 14 && !hi) return;
        last[name] = now; C = c; T = now; P = 1 + (Math.random() - 0.5) * 0.04; L = 0;
        build(x);
        ends.push(now + L);
      } catch (e) { /* a sound effect never breaks the page */ }
    };
  }

  // Shared envelope: silent start, attack a, exponential fall to -60 dB at len.
  function voice(src, head, d, len, v, a) {
    var g = C.createGain(), t = T + d;
    len = Math.min(len, 1.4); L = Math.max(L, d + len);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(v / 1000, t + len);
    head.connect(g); g.connect(bus);
    // An oscillator ignores the offset; noise starts at a random point of its buffer.
    src.start(t, Math.random() * 0.4); src.stop(t + len + 0.02);
  }
  // A frequency f at time t, gliding to `to` over len s (with the voice's pitch factor).
  function sweep(param, f, to, t, len) {
    param.setValueAtTime(f * P, t);
    if (to) param.exponentialRampToValueAtTime(to * P, t + len);
  }
  // Oscillator wave w (WAVES) at frequency f for len s at peak v, after delay d,
  // gliding to `to` over `glide` s (default len).
  function tone(w, f, len, v, d, to, glide) {
    var o = C.createOscillator();
    o.type = WAVES[w];
    sweep(o.frequency, f, to, T + (d = d || 0), glide || len);
    voice(o, o, d, len, v, 0.003);
  }
  // White noise through filter k (FILTERS) from f, sweeping to `to`; q for the band-pass.
  function noise(k, f, len, v, to, d, q, a) {
    var s = C.createBufferSource(), fl = C.createBiquadFilter();
    s.buffer = buf; fl.type = FILTERS[k];
    if (q) fl.Q.value = q;
    sweep(fl.frequency, f, to, T + (d = d || 0), len);
    s.connect(fl);
    voice(s, fl, d, Math.min(len, 0.5), v, a || 0.002);
  }
  // A glockenspiel-like strike: partials of a struck bar, the high ones fading first.
  function bell(f, d, len, v) {
    tone(0, f, len, v, d);
    tone(0, f * 2.76, len * 0.4, v * 0.3, d);
    tone(0, f * 5.4, len * 0.15, v * 0.12, d);
  }
  // Major pentatonic steps above a base note: 0, 2, 4, 7, 9 semitones, then the next octave.
  function ladder(i) { return Math.pow(2, (12 * Math.floor(i / 5) + [0, 2, 4, 7, 9][i % 5]) / 12); }
  function sparkle(f, d, count) { for (var i = 0; i < count; i++) tone(0, f * ladder(i * 2), 0.12, 0.05, d + i * 0.045); }

  sound('tap', 0, function () {
    tone(0, 1100, 0.07, 0.18, 0, 650, 0.03);
    noise(1, 2500, 0.012, 0.07);
  });
  sound('hover', 0, function () { tone(0, 1500, 0.04, 0.05, 0, 1700); });
  sound('select', 1, function () {
    tone(1, 784, 0.1, 0.24);
    tone(1, 1175, 0.18, 0.24, 0.06);
    tone(0, 2350, 0.1, 0.06, 0.06);
  });
  sound('back', 1, function () {
    tone(1, 784, 0.09, 0.24);
    tone(1, 523, 0.15, 0.24, 0.06);
  });
  sound('toggle', 1, function (on) {
    tone(0, on ? 600 : 900, 0.09, 0.22, 0, on ? 900 : 600, 0.04);
    noise(1, 3000, 0.01, 0.08);
  });
  sound('error', 1, function () {
    tone(1, 330, 0.12, 0.24, 0, 315);
    tone(1, 262, 0.18, 0.24, 0.13, 245);
  });
  sound('streak', 0, function (n) {
    var i = Math.floor(num(n, 1, 13, 1)) - 1, f = 392 * ladder(i);
    tone(1, f * 1.04, 0.3, 0.26 + i * 0.008, 0, f, 0.015);
    tone(0, f * 2, 0.11, 0.09);
  });
  sound('impact', 0, function (power) {
    var p = num(power, 0, 1, 0.5);
    noise(1, 3000, 0.01, 0.1 + 0.1 * p);
    noise(0, 1500 + 3500 * p, 0.08 + 0.17 * p, 0.14 + 0.16 * p, 200);
    tone(0, 160 + 60 * p, 0.14 + 0.2 * p, 0.22 + 0.2 * p, 0, 45, 0.06 + 0.08 * p);
  });
  sound('chime', 1, function (level) {
    var n = Math.round(num(level, 1, 3, 1));
    bell(1047, 0, 0.9, 0.3);
    if (n > 1) bell(1568, 0.08, 0.8, 0.22);
    if (n > 2) { bell(2093, 0.16, 0.7, 0.16); sparkle(2637, 0.22, 4); }
  });
  sound('coin', 0, function (n) {
    var r = ladder(Math.floor(num(n, 1, 5, 1)) - 1);
    tone(1, 988 * r, 0.07, 0.24);
    tone(1, 1319 * r, 0.24, 0.26, 0.065);
    tone(0, 2638 * r, 0.1, 0.06, 0.065);
  });
  sound('pop', 0, function (size) {
    var s = num(size, 0, 1, 0.5), f = 500 + 700 * (1 - s);
    tone(0, f, 0.05 + 0.07 * s, 0.36, 0, f * 2.2);
    noise(1, 4000, 0.006, 0.08);
  });
  sound('whoosh', 0, function (speed) {
    var s = num(speed, 0, 1, 0.5), len = 0.42 - 0.22 * s;
    noise(2, 300 + 300 * s, len, 0.6, 1800 + 2200 * s, 0, 1.4, len * 0.45);
  });
  sound('jump', 0, function (h) {
    var s = num(h, 0, 1, 0.5), len = 0.13 + 0.08 * s;
    tone(1, 260, len, 0.28, 0, 520 + 360 * s, len * 0.8);
    tone(0, 520, len * 0.7, 0.06, 0, 1040 + 720 * s, len * 0.8);
  });
  sound('land', 0, function (power) {
    var p = num(power, 0, 1, 0.5);
    tone(0, 130, 0.08 + 0.08 * p, 0.25 + 0.2 * p, 0, 50);
    noise(0, 900, 0.06 + 0.04 * p, 0.1 + 0.12 * p, 150);
  });
  sound('star', 1, function (i) {
    var n = Math.round(num(i, 1, 3, 1)), f = [1047, 1319, 1568][n - 1];
    tone(1, f * 0.75, 0.3, 0.18, 0, f, 0.035);
    bell(f, 0.03, 0.6, 0.22 + 0.03 * n);
    if (n > 2) sparkle(f * 2, 0.12, 3);
  });
  sound('levelUp', 1, function () {
    [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(1, f, 0.18, 0.22, i * 0.055); });
    bell(1047, 0.3, 0.9, 0.2);
    bell(1568, 0.3, 0.9, 0.24);
    sparkle(3136, 0.34, 3);
  });
  sound('fail', 1, function () {
    tone(1, 392, 0.18, 0.22, 0, 380);
    tone(1, 311, 0.18, 0.22, 0.17, 300);
    tone(1, 262, 0.45, 0.24, 0.34, 233, 0.4);
  });
  sound('countdown', 1, function (i) {
    if (num(i, 0, 9, 1) >= 1) { tone(0, 880, 0.13, 0.22); tone(1, 880, 0.13, 0.09); }
    else { tone(1, 1760, 0.36, 0.2); tone(0, 880, 0.36, 0.16); }
  });
  J.setQuiet = function (on) { quiet = !!on; paint(); };

  if (Kit) Kit.juice = J; else W.Juice = J;
})();
