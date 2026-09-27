/*
 * Beat Dash — procedural chiptune music (WebAudio, no audio files).
 * Every song is generated from a small recipe (tempo, key, chords, seed) and is
 * fully deterministic, so the same level always has the same tune and the
 * music can start from any point (used by practice checkpoints).
 * Timing is locked to the game clock: call sync(songTime) every frame.
 */
(function (root) {
  'use strict';
  var BD = root.BD || (root.BD = {});

  var SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // rhythm templates for one bar of 16th notes: [step, length]
  var RHY = [
    [[0, 2], [3, 1], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]],
    [[0, 3], [3, 3], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
    [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]],
    [[0, 1], [2, 1], [4, 2], [7, 1], [8, 2], [10, 1], [12, 2], [14, 2]],
    [[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]],
    [[0, 2], [3, 2], [6, 2], [8, 2], [11, 2], [14, 2]],
    [[2, 2], [4, 1], [6, 2], [8, 2], [10, 2], [12, 1], [14, 2]],
    [[0, 3], [3, 1], [4, 3], [7, 1], [8, 3], [11, 1], [12, 2], [14, 2]]
  ];

  // Build a 4-bar melody (list of {step, len, deg}) from a seed.
  function makeMotif(r) {
    var bars = [];
    var rA = RHY[Math.floor(r() * RHY.length)], rB = RHY[Math.floor(r() * RHY.length)];
    var deg = Math.floor(r() * 3) * 2; // start on a chord tone
    function barNotes(rh, endHome) {
      var out = [];
      for (var i = 0; i < rh.length; i++) {
        var mv = r();
        if (mv < 0.35) deg += 1; else if (mv < 0.7) deg -= 1; else if (mv < 0.85) deg += 2; else deg -= 2;
        if (deg > 9) deg -= 3; if (deg < -2) deg += 3;
        var d = deg;
        if (rh[i][0] % 4 === 0 && (d % 2 !== 0)) d += (r() < 0.5 ? 1 : -1); // strong beats on chord tones
        if (endHome && i === rh.length - 1) d = 7;
        out.push({ step: rh[i][0], len: rh[i][1], deg: d });
      }
      return out;
    }
    var a = barNotes(rA, false), b = barNotes(rB, false);
    var a2 = a.map(function (n) { return { step: n.step, len: n.len, deg: n.deg }; });
    var c = barNotes(rB, true);
    bars.push(a, b, a2, c);
    return bars;
  }

  BD.makeSong = function (def, bpm) {
    var r = rng(def.seed * 9973 + 17);
    var song = {
      bpm: bpm, root: def.root, scale: SCALES[def.scale] || SCALES.major, prog: def.prog,
      lead: def.lead || 'pulse25', style: def.style || 'bounce',
      motifA: makeMotif(r), motifB: makeMotif(r), motifC: makeMotif(r),
      intro: def.intro == null ? 4 : def.intro, chill: !!def.chill
    };
    song.stepDur = 60 / bpm / 4;
    return song;
  };

  // section for a bar: 0 intro, 1 verse, 2 drop
  function section(song, bar) {
    if (bar < song.intro) return 0;
    var b = (bar - song.intro) % 32;
    if (song.chill) return b < 16 ? 1 : 3;
    if (b < 8) return 1;
    if (b < 16) return 2;
    if (b < 24) return 3;
    return 2;
  }
  BD.songSection = section;

  function Music() {
    this.ctx = null; this.out = null; this.bus = null; this.song = null; this.playing = false;
    this.anchor = 0; this.nextStep = 0; this.vol = 0.55;
  }

  Music.prototype.init = function () {
    var A = root.Kit && root.Kit.audio;
    if (!A) return false;
    var ctx = A.unlock();
    if (!ctx || !A.master) return false;
    if (this.ctx === ctx) return true;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    // cut the inaudible sub rumble (it only eats headroom and makes the compressor pump)
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.7;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3.5;
    comp.attack.value = 0.006; comp.release.value = 0.18;
    this.out.connect(hp); hp.connect(comp); comp.connect(A.master);
    // pulse waves for the chiptune sound (fewer harmonics = rounder, less buzzy)
    this.waves = {};
    var self = this;
    [['pulse12', 0.125], ['pulse25', 0.25], ['pulse50', 0.5]].forEach(function (p) {
      var n = 24, re = new Float32Array(n), im = new Float32Array(n);
      for (var k = 1; k < n; k++) { re[k] = 0; im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * p[1]) * (1 - k / (n + 4)); }
      try { self.waves[p[0]] = ctx.createPeriodicWave(re, im); } catch (e) { self.waves[p[0]] = null; }
    });
    var len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = this.noise.getChannelData(0), seed = rng(99);
    for (var i = 0; i < len; i++) d[i] = seed() * 2 - 1;
    return true;
  };

  // Sound leaves the speakers a little after it is scheduled (audio buffers).
  // Scheduling that much earlier keeps what you HEAR in sync with what you SEE.
  Music.prototype.latency = function () {
    var c = this.ctx; if (!c) return 0;
    var l = (c.outputLatency || 0) + (c.baseLatency || 0);
    return l > 0 && l < 0.2 ? l : 0;
  };

  Music.prototype.play = function (song, fromTime, vol) {
    if (!this.init()) return;
    this.stop(0.03);
    var ctx = this.ctx;
    this.song = song;
    this.vol = vol == null ? 0.55 : vol;
    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(this.vol, ctx.currentTime);
    this.bus.connect(this.out);
    // lead goes through a soft filter and a dotted-eighth echo: sounds "produced", costs 4 nodes
    this.lead = ctx.createGain(); this.lead.gain.value = 1;
    var tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 4400; tone.Q.value = 0.5;
    var dl = ctx.createDelay(1); dl.delayTime.value = Math.min(0.9, song.stepDur * 3);
    var dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2200;
    var fb = ctx.createGain(); fb.gain.value = 0.3;
    var wet = ctx.createGain(); wet.gain.value = song.chill ? 0.3 : 0.24;
    this.lead.connect(tone); tone.connect(this.bus);
    tone.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(wet); wet.connect(this.bus);
    this.fx = [this.lead, tone, dl, dlp, fb, wet];
    this.anchor = ctx.currentTime + 0.03 - fromTime - this.latency();
    this.nextStep = Math.max(0, Math.ceil(fromTime / song.stepDur - 0.001));
    this.firstStep = this.nextStep; // never drop the downbeat, even with a large output latency
    this.playing = true;
    this.schedule();
  };

  Music.prototype.stop = function (fade) {
    if (!this.bus || !this.ctx) { this.playing = false; return; }
    var b = this.bus, fx = this.fx, t = this.ctx.currentTime;
    fade = fade == null ? 0.05 : fade;
    try {
      b.gain.cancelScheduledValues(t);
      b.gain.setValueAtTime(b.gain.value, t);
      b.gain.linearRampToValueAtTime(0, t + fade);
    } catch (e) { /* ignore */ }
    setTimeout(function () {
      try { b.disconnect(); } catch (e) { /* ignore */ }
      if (fx) fx.forEach(function (n) { try { n.disconnect(); } catch (e) { /* ignore */ } });
    }, (fade + 0.4) * 1000);
    this.bus = null; this.fx = null; this.lead = null;
    this.playing = false;
  };

  // Keep the music locked to the game clock and schedule upcoming notes.
  Music.prototype.sync = function (songTime) {
    if (!this.playing || !this.ctx) return;
    var now = this.ctx.currentTime;
    if (songTime != null) {
      var drift = (now - this.latency() - this.anchor) - songTime;
      if (Math.abs(drift) > 0.06) {
        this.anchor = now - this.latency() - songTime;
        this.nextStep = Math.max(this.nextStep, Math.ceil(songTime / this.song.stepDur));
      } else this.anchor += drift * 0.02;
    }
    this.schedule();
  };

  // song position the player is HEARING right now
  Music.prototype.time = function () { return this.ctx ? this.ctx.currentTime - this.latency() - this.anchor : 0; };

  Music.prototype.schedule = function () {
    var ctx = this.ctx, song = this.song, now = ctx.currentTime;
    var guard = 0;
    while (this.anchor + this.nextStep * song.stepDur < now + 0.12 && guard++ < 64) {
      var t = this.anchor + this.nextStep * song.stepDur;
      if (t >= now - 0.02 || this.nextStep === this.firstStep) this.step(this.nextStep, Math.max(t, now));
      this.nextStep++;
    }
  };

  /* ---------------------------------------------------------- instruments */
  Music.prototype.env = function (t, vol, a, dur, rel, dest) {
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + Math.max(a, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest || this.bus);
    return g;
  };
  Music.prototype.osc = function (type, freq, t, dur, vol, opts) {
    opts = opts || {};
    var ctx = this.ctx, o = ctx.createOscillator();
    if (this.waves[type]) o.setPeriodicWave(this.waves[type]); else o.type = (type.indexOf('pulse') === 0 ? 'square' : type);
    o.frequency.setValueAtTime(freq, t);
    if (opts.detune) o.detune.setValueAtTime(opts.detune, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + (opts.slide || dur));
    var g = this.env(t, vol, opts.a || 0.004, dur, opts.rel || 0.03, opts.lead ? (this.lead || this.bus) : null);
    var node = o;
    if (opts.lp) {
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = opts.q || 1;
      f.frequency.setValueAtTime(opts.lp, t);
      if (opts.lpTo) f.frequency.exponentialRampToValueAtTime(opts.lpTo, t + dur);
      o.connect(f); node = f;
    }
    node.connect(g);
    o.start(t); o.stop(t + dur + 0.02);
  };
  Music.prototype.noiseHit = function (t, dur, vol, type, freq, q) {
    var ctx = this.ctx, s = ctx.createBufferSource();
    s.buffer = this.noise;
    var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.bus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  };
  // punchy kick: short pitch-dropping body + a tiny click so it is heard on small speakers too
  Music.prototype.kick = function (t, v) {
    this.osc('sine', 150, t, 0.2, 0.66 * v, { to: 50, slide: 0.09, a: 0.002, rel: 0.08 });
    this.osc('triangle', 1100, t, 0.025, 0.16 * v, { to: 180, a: 0.001, rel: 0.015 });
  };
  Music.prototype.snare = function (t, v) { this.noiseHit(t, 0.15, 0.36 * v, 'bandpass', 2600, 0.6); this.osc('triangle', 200, t, 0.09, 0.26 * v, { to: 150 }); };
  Music.prototype.hat = function (t, v, open) { this.noiseHit(t, open ? 0.14 : 0.03, (open ? 0.09 : 0.12) * v, 'highpass', 7000); };
  Music.prototype.crash = function (t) { this.noiseHit(t, 1.0, 0.1, 'highpass', 4500); };
  // warm chord pad (filtered saw) that makes the songs sound full
  Music.prototype.pad = function (t, notes, dur, vol) {
    for (var i = 0; i < notes.length; i++) this.osc('sawtooth', mtof(notes[i]), t, dur, vol, { a: 0.06, rel: dur * 0.35, lp: 1300, lpTo: 700, q: 0.5, detune: (i - 1) * 6 });
  };

  Music.prototype.step = function (n, t) {
    var song = this.song, sc = song.scale;
    var bar = Math.floor(n / 16), st = n % 16;
    var sec = section(song, bar);
    var barInPhrase = (bar - song.intro) % 8;
    var chordDeg = song.prog[((bar - (bar < song.intro ? 0 : song.intro)) % song.prog.length + song.prog.length) % song.prog.length];
    function note(deg, oct) {
      var d = chordDeg + deg, o = Math.floor(d / 7);
      return song.root + sc[((d % 7) + 7) % 7] + 12 * (o + (oct || 0));
    }
    var fill = sec !== 0 && barInPhrase === 7 && !song.chill;
    var sd = song.stepDur;

    // ---- drums
    if (st === 0 && bar >= song.intro && barInPhrase === 0) this.crash(t);
    if (sec === 0) {
      if (st % 4 === 0) this.kick(t, song.chill ? 0.6 : 0.85);
      if (st % 4 === 2) this.hat(t, 0.7, false);
    } else if (sec === 1 || sec === 3) {
      if (st === 0 || st === 8 || (st === 10 && sec === 1) || (song.style === 'drive' && st % 4 === 0)) this.kick(t, song.chill ? 0.6 : 1);
      if ((st === 4 || st === 12) && !fill) { if (song.chill) this.hat(t, 1, true); else this.snare(t, 1); }
      if (st % 2 === 0) this.hat(t, st % 4 === 2 ? 1 : 0.6, false);
    } else {
      if (st % 4 === 0) this.kick(t, 1.05);
      if ((st === 4 || st === 12) && !fill) this.snare(t, 1.05);
      this.hat(t, st % 4 === 2 ? 1 : 0.5, st % 4 === 2);
    }
    if (fill && st >= 8) this.snare(t, 0.45 + (st - 8) * 0.08);

    // ---- bass
    var root = note(0, -1);
    if (song.style === 'drive') {
      if (st % 2 === 0) this.osc('pulse50', mtof(root + (st % 8 === 6 ? 12 : 0)), t, sd * 1.6, 0.17, { lp: 1100, lpTo: 380, q: 2 });
    } else if (song.style === 'walk') {
      if (st % 4 === 0) { var w = [0, 7, 12, 7][st / 4]; this.osc('triangle', mtof(root + w), t, sd * 3.5, 0.27); }
    } else {
      if (st % 2 === 0) this.osc('triangle', mtof(root + ((st / 2) % 2 ? 12 : 0)), t, sd * 1.8, 0.25);
    }
    if (sec === 2 && st % 4 === 0) this.osc('pulse25', mtof(root), t, sd * 2, 0.05, { lp: 700 });

    // ---- chord pad (one per bar; softer in the verse, fuller in the drop)
    if (st === 0 && !song.chill) {
      var pv = sec === 0 ? 0.022 : sec === 2 ? 0.034 : 0.026;
      this.pad(t, [note(0, 0), note(2, 0), note(4, 0)], sd * 15.5, pv);
    }

    // ---- lead
    if (sec >= 1) {
      var motif = sec === 2 ? song.motifB : sec === 3 ? song.motifC : song.motifA;
      var notes = motif[barInPhrase % 4];
      for (var i = 0; i < notes.length; i++) {
        if (notes[i].step !== st) continue;
        var m = note(notes[i].deg, 1);
        var vol = song.chill ? 0.085 : 0.13;
        var nd = sd * notes[i].len * 0.95;
        this.osc(song.lead, mtof(m), t, nd, vol, { rel: 0.05, lead: true });
        // the drop: a second, slightly detuned voice makes the lead wide and bright
        if (sec === 2 && !song.chill) this.osc('pulse50', mtof(m), t, nd, 0.05, { rel: 0.05, lead: true, detune: 9, lp: 2600 });
      }
    }
    // ---- arpeggio in the drop
    if (sec === 2 || (sec === 3 && !song.chill)) {
      var arp = [0, 2, 4, 7][st % 4];
      this.osc('pulse12', mtof(note(arp, 0)), t, sd * 0.9, sec === 2 ? 0.045 : 0.03, { lp: 2400 });
    }
    if (song.chill && sec >= 1 && st % 8 === 0) {
      // soft chord pad
      [0, 2, 4].forEach(function (dg) { this.osc('triangle', mtof(note(dg, 0)), t, sd * 7.5, 0.04, { a: 0.04, rel: 0.2 }); }, this);
    }
  };

  BD.Music = Music;
})(typeof window !== 'undefined' ? window : globalThis);
