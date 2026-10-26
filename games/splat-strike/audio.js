/*
 * Splat Strike — audio.js
 * Toy-blaster sound effects, all synthesised with WebAudio. No background music: every sound
 * is a one-shot caused by the player or a game event.
 * Chain: voices -> (panner) -> sfx gain -> compressor -> Kit.audio.master (so the shared
 * mute button works). No noise beds: noise is only used in short, filtered bursts.
 */
(function () {
  'use strict';
  var SS = window.SS;
  var A = Kit.audio;

  function ctx() { return (A.ctx && !A.muted && A.ctx.state === 'running') ? A.ctx : null; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  var noiseBuf = null;
  function noise(c) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      var d = noiseBuf.getChannelData(0), b0 = 0, b1 = 0;
      // slightly pink noise: softer than white, less hiss
      for (var i = 0; i < d.length; i++) { var w = Math.random() * 2 - 1; b0 = 0.97 * b0 + w * 0.3; b1 = 0.6 * b1 + w * 0.5; d[i] = (b0 + b1) * 0.55; }
    }
    return noiseBuf;
  }
  var bus = null;
  function out(c) {
    if (!bus || bus.c !== c) {
      var comp = c.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.18;
      comp.connect(A.master);
      var sfx = c.createGain(); sfx.gain.value = 1.7; sfx.connect(comp);
      bus = { c: c, comp: comp, sfx: sfx };
    }
    return bus;
  }
  // destination for a sound: straight to the sfx bus, or through a stereo panner
  function dest(c, pan) {
    var b = out(c);
    if (!pan || !c.createStereoPanner) return b.sfx;
    var p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(b.sfx);
    return p;
  }
  function osc(c, d, t, o) {
    var s = c.createOscillator(), g = c.createGain();
    s.type = o.type || 'sine';
    s.frequency.setValueAtTime(o.f, t);
    if (o.to) s.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.slide || o.dur));
    if (o.det) s.detune.setValueAtTime(o.det, t);
    var node = s;
    if (o.lp) {
      var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(o.lp, t); f.Q.value = o.q || 0.8;
      if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, t + o.dur);
      s.connect(f); node = f;
    }
    var v = o.vol == null ? 0.2 : o.vol;
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.att || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    node.connect(g); g.connect(d);
    s.start(t); s.stop(t + o.dur + 0.02);
  }
  function nz(c, d, t, o) {
    var s = c.createBufferSource();
    s.buffer = noise(c);
    var f = c.createBiquadFilter();
    f.type = o.hp ? 'highpass' : (o.bp ? 'bandpass' : 'lowpass');
    f.frequency.setValueAtTime(o.hp || o.bp || o.lp || 2000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    f.Q.value = o.q || 0.9;
    var g = c.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol == null ? 0.2 : o.vol, t + (o.att || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f); f.connect(g); g.connect(d);
    s.start(t, Math.random() * 0.6); s.stop(t + o.dur + 0.02);
  }
  function bell(c, d, t, f, dur, vol) {
    osc(c, d, t, { f: f, dur: dur, vol: vol, att: 0.002 });
    osc(c, d, t, { f: f * 2.01, dur: dur * 0.5, vol: vol * 0.3, att: 0.002 });
    osc(c, d, t, { f: f * 3.0, dur: dur * 0.22, vol: vol * 0.12, att: 0.002 });
  }
  // simple rate limiter per sound key
  var lastAt = {};
  function gate(key, gap, c) { var t = c.currentTime; if (lastAt[key] && t - lastAt[key] < gap) return false; lastAt[key] = t; return true; }
  var live = 0; // rough count of sounds started in the last 100 ms
  var liveT = 0;
  function budget(c, cost) {
    if (c.currentTime - liveT > 0.1) { liveT = c.currentTime; live = 0; }
    if (live + cost > 26) return false;
    live += cost; return true;
  }

  var S = {
    // blaster shots. kind 0 auto, 1 splat shotgun, 2 sniper. vol 0..1, pan -1..1
    fire: function (kind, vol, pan, mine) {
      var c = ctx(); if (!c) return;
      if (!mine && !gate('f' + kind, kind === 0 ? 0.05 : 0.08, c)) return;
      if (!budget(c, mine ? 1 : 3)) return;
      var t = c.currentTime, d = dest(c, pan), v = vol == null ? 1 : vol;
      var j = 1 + (Math.random() - 0.5) * 0.08;
      if (kind === 0) {
        osc(c, d, t, { f: 820 * j, to: 260, dur: 0.075, vol: 0.2 * v, type: 'triangle', lp: 2600 });
        osc(c, d, t, { f: 180 * j, to: 90, dur: 0.07, vol: 0.2 * v });
        if (mine) nz(c, d, t, { bp: 1500, q: 1.2, dur: 0.035, vol: 0.09 * v });
      } else if (kind === 1) {
        osc(c, d, t, { f: 230 * j, to: 62, dur: 0.2, vol: 0.34 * v });
        osc(c, d, t, { f: 520 * j, to: 150, dur: 0.12, vol: 0.14 * v, type: 'triangle', lp: 1800 });
        nz(c, d, t, { bp: 900, to: 300, q: 0.8, dur: 0.16, vol: 0.2 * v });
      } else {
        osc(c, d, t, { f: 1500 * j, to: 180, dur: 0.24, vol: 0.16 * v, type: 'triangle', lp: 3000 });
        osc(c, d, t, { f: 300 * j, to: 70, dur: 0.18, vol: 0.28 * v });
        nz(c, d, t, { bp: 1800, to: 500, q: 1, dur: 0.1, vol: 0.1 * v });
        if (mine) osc(c, d, t + 0.05, { f: 2400, to: 900, dur: 0.18, vol: 0.03, type: 'sine' });
      }
    },
    empty: function () { var c = ctx(); if (!c || !gate('empty', 0.2, c)) return; var t = c.currentTime; osc(c, out(c).sfx, t, { f: 1400, dur: 0.03, vol: 0.08, type: 'triangle' }); osc(c, out(c).sfx, t + 0.05, { f: 900, dur: 0.03, vol: 0.06, type: 'triangle' }); },
    // crisp hitmarker tick (headshots get a bright "ding")
    hitTick: function (head) {
      var c = ctx(); if (!c || !gate('tick', 0.03, c)) return;
      var t = c.currentTime, d = out(c).sfx;
      // two-partial "tik": the most noticeable repeating sound, above your own blaster
      osc(c, d, t, { f: 1900, to: 1450, dur: 0.048, vol: 0.22, type: 'triangle' });
      osc(c, d, t, { f: 3300, to: 2900, dur: 0.026, vol: 0.07 });
      if (head) { bell(c, d, t + 0.01, 1760, 0.22, 0.12); bell(c, d, t + 0.06, 2637, 0.2, 0.06); }
    },
    // paint squelch on a body
    squelch: function (vol, pan) {
      var c = ctx(); if (!c || !gate('sq', 0.04, c) || !budget(c, 2)) return;
      var t = c.currentTime, d = dest(c, pan), v = vol == null ? 1 : vol;
      nz(c, d, t, { bp: 700, to: 240, q: 2.2, dur: 0.1, vol: 0.3 * v });
      osc(c, d, t, { f: 320, to: 120, dur: 0.08, vol: 0.2 * v });
    },
    // paint blob hitting a wall
    wallSplat: function (vol, pan) {
      var c = ctx(); if (!c || !gate('ws', 0.06, c) || !budget(c, 1)) return;
      var t = c.currentTime;
      nz(c, dest(c, pan), t, { lp: 900, to: 200, dur: 0.07, vol: 0.09 * (vol == null ? 1 : vol) });
    },
    // buddy pops into paint + confetti
    pop: function (vol, pan) {
      var c = ctx(); if (!c || !budget(c, 4)) return;
      var t = c.currentTime, d = dest(c, pan), v = vol == null ? 1 : vol;
      osc(c, d, t, { f: 420, to: 1250, dur: 0.09, vol: 0.28 * v, slide: 0.07 });
      nz(c, d, t + 0.02, { lp: 1600, to: 250, dur: 0.22, vol: 0.2 * v });
      osc(c, d, t + 0.03, { f: 140, to: 50, dur: 0.2, vol: 0.25 * v });
      for (var i = 0; i < 3; i++) osc(c, d, t + 0.08 + i * 0.045, { f: mtof(84 + [0, 4, 7][i]) , dur: 0.08, vol: 0.05 * v, type: 'triangle' });
    },
    // you splatted someone
    confirm: function (n) {
      var c = ctx(); if (!c) return;
      var t = c.currentTime, d = out(c).sfx, base = 76 + Math.min(4, (n || 1) - 1) * 2;
      bell(c, d, t + 0.04, mtof(base), 0.18, 0.12);
      bell(c, d, t + 0.1, mtof(base + 4), 0.18, 0.11);
      bell(c, d, t + 0.16, mtof(base + 7), 0.3, 0.12);
    },
    // you got hit
    hurt: function (vol) {
      var c = ctx(); if (!c || !gate('hurt', 0.07, c)) return;
      var t = c.currentTime, d = out(c).sfx, v = vol == null ? 1 : vol;
      osc(c, d, t, { f: 200, to: 80, dur: 0.12, vol: 0.3 * v });
      nz(c, d, t, { lp: 700, to: 150, dur: 0.1, vol: 0.18 * v });
    },
    splatted: function () {
      var c = ctx(); if (!c) return;
      var t = c.currentTime, d = out(c).sfx;
      osc(c, d, t, { f: 600, to: 90, dur: 0.5, vol: 0.2, type: 'triangle', lp: 1500 });
      nz(c, d, t, { lp: 1400, to: 120, dur: 0.4, vol: 0.25 });
      [67, 64, 60].forEach(function (n, i) { osc(c, d, t + 0.25 + i * 0.12, { f: mtof(n), dur: 0.18, vol: 0.09, type: 'triangle' }); });
    },
    step: function (surface, vol, pan) {
      var c = ctx(); if (!c || !budget(c, 1)) return;
      var t = c.currentTime, d = dest(c, pan), v = (vol == null ? 1 : vol);
      var j = 0.9 + Math.random() * 0.2;
      if (surface === 'snow') nz(c, d, t, { bp: 1300 * j, q: 0.7, dur: 0.07, vol: 0.07 * v });
      else if (surface === 'metal') { osc(c, d, t, { f: 420 * j, to: 300, dur: 0.05, vol: 0.05 * v, type: 'triangle' }); }
      else if (surface === 'tile') osc(c, d, t, { f: 260 * j, to: 150, dur: 0.04, vol: 0.06 * v, type: 'triangle', lp: 900 });
      else nz(c, d, t, { lp: 600 * j, dur: 0.06, vol: 0.08 * v });
      osc(c, d, t, { f: 110 * j, to: 70, dur: 0.05, vol: 0.09 * v });
    },
    jump: function () { var c = ctx(); if (!c) return; osc(c, out(c).sfx, c.currentTime, { f: 260, to: 520, dur: 0.1, vol: 0.08, type: 'triangle' }); },
    land: function (hard) { var c = ctx(); if (!c || !gate('land', 0.15, c)) return; var t = c.currentTime; osc(c, out(c).sfx, t, { f: hard ? 150 : 120, to: 55, dur: 0.1, vol: hard ? 0.22 : 0.14 }); nz(c, out(c).sfx, t, { lp: 500, dur: 0.07, vol: hard ? 0.12 : 0.07 }); },
    reload: function (kind) {
      var c = ctx(); if (!c) return;
      var t = c.currentTime, d = out(c).sfx;
      osc(c, d, t, { f: 1200, dur: 0.025, vol: 0.1, type: 'triangle' });
      nz(c, d, t + 0.18, { lp: 700, to: 300, dur: 0.16, vol: 0.08 });          // paint slosh
      osc(c, d, t + 0.2, { f: 330, to: 440, dur: 0.12, vol: 0.05 });
    },
    reloadDone: function () {
      var c = ctx(); if (!c) return;
      var t = c.currentTime, d = out(c).sfx;
      osc(c, d, t, { f: 900, dur: 0.025, vol: 0.1, type: 'triangle' });
      osc(c, d, t + 0.06, { f: 1350, dur: 0.035, vol: 0.12, type: 'triangle' });
      nz(c, d, t + 0.06, { bp: 2200, q: 2, dur: 0.03, vol: 0.05 });
    },
    swap: function () { var c = ctx(); if (!c) return; var t = c.currentTime; osc(c, out(c).sfx, t, { f: 700, dur: 0.025, vol: 0.08, type: 'triangle' }); osc(c, out(c).sfx, t + 0.07, { f: 1000, dur: 0.03, vol: 0.09, type: 'triangle' }); },
    throwB: function () { var c = ctx(); if (!c) return; var t = c.currentTime; osc(c, out(c).sfx, t, { f: 300, to: 700, dur: 0.14, vol: 0.12, type: 'triangle' }); nz(c, out(c).sfx, t, { bp: 1200, to: 2400, dur: 0.12, vol: 0.05 }); },
    balloon: function (vol, pan) {
      var c = ctx(); if (!c) return;
      var t = c.currentTime, d = dest(c, pan), v = vol == null ? 1 : vol;
      osc(c, d, t, { f: 900, to: 200, dur: 0.06, vol: 0.2 * v, type: 'triangle' });
      nz(c, d, t, { lp: 1800, to: 160, dur: 0.35, vol: 0.32 * v });
      osc(c, d, t + 0.01, { f: 120, to: 40, dur: 0.35, vol: 0.35 * v });
      for (var i = 0; i < 4; i++) osc(c, d, t + 0.1 + i * 0.05, { f: 500 + Math.random() * 500, to: 900 + Math.random() * 400, dur: 0.05, vol: 0.05 * v });
    },
    pickup: function (type) {
      var c = ctx(); if (!c) return;
      var t = c.currentTime, d = out(c).sfx;
      var notes = type === 'hp' ? [72, 76, 79, 84] : type === 'ammo' ? [67, 71, 74] : [72, 76, 79, 84, 88, 91];
      if (type === 'ammo') osc(c, d, t, { f: 240, to: 160, dur: 0.08, vol: 0.14, type: 'triangle' });
      notes.forEach(function (n, i) { bell(c, d, t + 0.03 + i * 0.055, mtof(n), 0.18, 0.08); });
    },
    heartbeat: function () {
      var c = ctx(); if (!c) return;
      var t = c.currentTime, d = out(c).sfx;
      osc(c, d, t, { f: 70, to: 45, dur: 0.14, vol: 0.12 });
      osc(c, d, t + 0.2, { f: 62, to: 40, dur: 0.16, vol: 0.09 });
    },
    shield: function () { var c = ctx(); if (!c) return; var t = c.currentTime; osc(c, out(c).sfx, t, { f: 300, to: 900, dur: 0.35, vol: 0.08, att: 0.05 }); bell(c, out(c).sfx, t + 0.2, 1320, 0.3, 0.05); },
    shieldHit: function () { var c = ctx(); if (!c || !gate('shh', 0.08, c)) return; osc(c, out(c).sfx, c.currentTime, { f: 1600, to: 1200, dur: 0.06, vol: 0.05, type: 'triangle' }); },
    count: function (i) { var c = ctx(); if (!c) return; bell(c, out(c).sfx, c.currentTime, mtof(i > 0 ? 72 : 84), i > 0 ? 0.25 : 0.6, 0.14); if (i <= 0) bell(c, out(c).sfx, c.currentTime + 0.02, mtof(79), 0.5, 0.08); },
    callout: function (level) {
      var c = ctx(); if (!c) return;
      var t = c.currentTime, d = out(c).sfx;
      var seq = level >= 3 ? [72, 76, 79, 84, 88, 91, 96] : level === 2 ? [72, 76, 79, 84, 88] : [74, 79, 83];
      seq.forEach(function (n, i) { osc(c, d, t + i * 0.05, { f: mtof(n), dur: 0.14, vol: 0.07, type: 'triangle' }); osc(c, d, t + i * 0.05, { f: mtof(n), dur: 0.1, vol: 0.03, type: 'square', lp: 2200 }); });
    },
    roundEnd: function (win) {
      var c = ctx(); if (!c) return;
      var t = c.currentTime, d = out(c).sfx;
      var seq = win ? [67, 72, 76, 79, 84, 79, 84, 88] : [72, 67, 64, 60, 64, 67];
      seq.forEach(function (n, i) { osc(c, d, t + i * 0.11, { f: mtof(n), dur: 0.2, vol: 0.12, type: 'triangle' }); osc(c, d, t + i * 0.11, { f: mtof(n - 12), dur: 0.2, vol: 0.06 }); });
      if (win) bell(c, d, t + seq.length * 0.11, mtof(96), 0.8, 0.08);
    },
    start: function () {
      var c = ctx(); if (!c) return;
      var t = c.currentTime, d = out(c).sfx;
      [60, 64, 67, 72].forEach(function (n, i) { osc(c, d, t + i * 0.07, { f: mtof(n), dur: 0.16, vol: 0.1, type: 'triangle' }); });
    },
    level: function () {
      var c = ctx(); if (!c) return;
      var t = c.currentTime, d = out(c).sfx;
      [72, 76, 79, 84, 79, 84, 88, 91].forEach(function (n, i) { bell(c, d, t + i * 0.08, mtof(n), 0.25, 0.08); });
    },
    coin: function (i) { var c = ctx(); if (!c || !gate('coin', 0.04, c)) return; bell(c, out(c).sfx, c.currentTime, mtof(84 + (i || 0) % 8), 0.12, 0.06); },
    buy: function () { var c = ctx(); if (!c) return; var t = c.currentTime; [84, 88, 91, 96].forEach(function (n, i) { bell(c, out(c).sfx, t + i * 0.06, mtof(n), 0.2, 0.09); }); },
    deny: function () { var c = ctx(); if (!c) return; var t = c.currentTime; osc(c, out(c).sfx, t, { f: 220, dur: 0.1, vol: 0.12, type: 'triangle' }); osc(c, out(c).sfx, t + 0.11, { f: 175, dur: 0.16, vol: 0.12, type: 'triangle' }); },
    click: function () { var c = ctx(); if (!c) return; osc(c, out(c).sfx, c.currentTime, { f: 880, to: 1250, dur: 0.05, vol: 0.1, type: 'triangle' }); },
    hover: function () { var c = ctx(); if (!c || !gate('hov', 0.05, c)) return; osc(c, out(c).sfx, c.currentTime, { f: 1300, dur: 0.025, vol: 0.03 }); },
    glint: function (vol, pan) { var c = ctx(); if (!c || !gate('glint', 0.4, c)) return; var t = c.currentTime, d = dest(c, pan); bell(c, d, t, 1976, 0.3, 0.05 * (vol == null ? 1 : vol)); bell(c, d, t + 0.07, 2637, 0.25, 0.03 * (vol == null ? 1 : vol)); },
    zoom: function (inn) { var c = ctx(); if (!c) return; osc(c, out(c).sfx, c.currentTime, { f: inn ? 500 : 700, to: inn ? 800 : 450, dur: 0.07, vol: 0.05, type: 'triangle' }); }
  };
  SS.sfx = S;
})();
