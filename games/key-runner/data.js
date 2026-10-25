/* Stage kit for عدّاء المفاتيح. Pieces are plain data; engine.js simulates them. */
(function (KR) {
  'use strict';
  var C = KR.C = {
    TICK: 1 / 120,
    GRAV: 24,
    CUT: 64,
    JUMP: 11.4,
    TRAMP: 14.2,
    LAUNCH_V: 12.6,
    LAUNCH_Z: 8,
    COYOTE: 0.12,
    BUFFER: 0.12,
    CORNER: 0.25,
    HX: 0.28,
    HZ: 0.28,
    H: 0.96,
    STEP: 2,
    CAP: 22,
    KEY: 1.7,
    HH: 0.23,
    FALL_Y: -1.2,
    FALL_T: 0.5,
    CAM_BACK: 7.15,
    CAM_UP: 3.65,
    CAM_AHEAD: 2.4
  };

  KR.topSpeed = function (stat) {
    stat = Math.max(0, Number(stat) || 0);
    return Math.min(C.CAP, 6 + 1.2 * Math.log2(1 + stat / 20));
  };
  KR.stepGain = function (shoe, rebirths) {
    var s = shoe === 5 || shoe === 3 || shoe === 2 ? shoe : 1;
    var r = Math.max(0, Math.min(20, rebirths | 0));
    return s * Math.pow(1.5, r);
  };
  KR.holdHeight = function () { return C.JUMP * C.JUMP / (2 * C.GRAV); };
  KR.tapHeight = function () { return C.JUMP * C.JUMP / (2 * C.CUT); };
  KR.airTime = function (jumps, launch) {
    var t = 2 * (launch ? C.LAUNCH_V : C.JUMP) / C.GRAV;
    if (jumps >= 2 && !launch) t *= 1.75;
    return t;
  };

  var WORDS = ['قطة', 'شمس', 'كرة', 'موز', 'قمر', 'ورد', 'نور', 'فرح'];
  var NAMES = ['مفاتيح الحلوى', 'نهر الشوكولاتة', 'غيوم العلكة', 'جليد الآيس كريم', 'أركيد النيون', 'غابة الجيلي', 'برج الأرقام', 'قوس النهاية'];
  var MECH = ['sink', 'move', 'gum', 'caps', 'fan', 'pop', 'shift', 'launch'];

  KR.themes = [
    { sky: 0xffd4f0, fog: 0xffc2e8, sea: 0xff7eb8, key: 0xff4eb6, top: 0xffe0f6, accent: 0xfff1a8, dark: 0xd43a8e },
    { sky: 0x8a4b32, fog: 0x6b3824, sea: 0x4a2414, key: 0xa35a30, top: 0xe0a06a, accent: 0xffd7a1, dark: 0x6a3018 },
    { sky: 0xd9f6ff, fog: 0xc4eeff, sea: 0x8fd8ff, key: 0xff8ad0, top: 0xfff0fb, accent: 0xbaf7ff, dark: 0xe45aaa },
    { sky: 0xf3fbff, fog: 0xe4f6ff, sea: 0xc9ecff, key: 0xfff7ef, top: 0xffd0e4, accent: 0xbfe9ff, dark: 0xf0b0cc },
    { sky: 0x140820, fog: 0x1c0c2e, sea: 0x2a1450, key: 0x2a1248, top: 0xff3ad4, accent: 0x39f3ff, dark: 0x140818 },
    { sky: 0xc8f7d4, fog: 0xb4f0c4, sea: 0x7ddea8, key: 0xff5ea8, top: 0xffd0e6, accent: 0xfff4a0, dark: 0xe04488 },
    { sky: 0x2c3648, fog: 0x232c3c, sea: 0x1a2230, key: 0x46556c, top: 0xf4f7fb, accent: 0xffc857, dark: 0x2a3344 },
    { sky: 0x24143a, fog: 0x301848, sea: 0x4a2080, key: 0xffffff, top: 0xffe56a, accent: 0x7af0ff, dark: 0xff4eb6 }
  ];

  KR.NAMES = NAMES;
  KR.WORDS = WORDS;

  function Builder(z0, stage) {
    this.z = z0;
    this.surf = 0;
    this.x = 0;
    this.stage = stage;
    this.pieces = [];
    this.n = 1;
    this.path = [];
  }
  Builder.prototype.piece = function (t, o) {
    o = o || {};
    var hh = o.hh != null ? o.hh : KR.C.HH;
    var p = {
      id: this.stage * 1000 + this.n++,
      t: t,
      stage: this.stage,
      x: o.x != null ? o.x : this.x,
      z: o.z != null ? o.z : this.z,
      hw: o.hw != null ? o.hw : 0.85,
      hh: hh,
      hd: o.hd != null ? o.hd : 0.85,
      stand: o.stand != null ? o.stand : true,
      y: (o.surf != null ? o.surf : this.surf) - hh
    };
    if (o.ch) p.ch = o.ch;
    if (o.need) p.need = o.need;
    if (o.charm) p.charm = 1;
    if (o.amp) { p.amp = o.amp; p.freq = o.freq || 1.15; p.baseX = p.x; }
    if (o.cvx) p.cvx = o.cvx;
    if (o.cvz) p.cvz = o.cvz;
    if (o.fx) p.fx = o.fx;
    if (o.fz) p.fz = o.fz;
    if (o.n) p.n = o.n;
    if (o.flag) p.flag = 1;
    if (o.r) p.r = o.r;
    if (o.range) { p.range = o.range; p.baseX = p.x; p.speed = o.speed || 1.4; }
    if (o.len) { p.len = o.len; p.pivot = o.pivot; p.baseX = p.x; p.baseZ = p.z; }
    if (o.wide) p.wide = 1;
    this.pieces.push(p);
    return p;
  };
  Builder.prototype.pad = function (t, o) {
    o = o || {};
    var hd = o.hd != null ? o.hd : 0.85;
    var hw = o.hw != null ? o.hw : 0.85;
    var p = this.piece(t || 'key', {
      x: this.x, z: this.z + hd, hw: hw, hd: hd, hh: KR.C.HH,
      surf: this.surf, stand: true, ch: o.ch, need: o.need, charm: o.charm,
      amp: o.amp, freq: o.freq, cvx: o.cvx, cvz: o.cvz
    });
    p.path = this.path.length;
    this.path.push(p);
    this.z = p.z + hd;
    if (o.rails) {
      this.piece('rail', { x: p.x - hw - 0.2, z: p.z, hw: 0.14, hd: hd, hh: 0.32, surf: this.surf + 0.64, stand: false });
      this.piece('rail', { x: p.x + hw + 0.2, z: p.z, hw: 0.14, hd: hd, hh: 0.32, surf: this.surf + 0.64, stand: false });
    }
    return p;
  };
  Builder.prototype.run = function (n, t, o) {
    var last;
    for (var i = 0; i < n; i++) last = this.pad(t || 'key', o);
    return last;
  };
  Builder.prototype.hole = function (keys) { this.z += keys * KR.C.KEY; };
  Builder.prototype.floor = function (hd, drop) {
    return this.piece('floor', {
      x: this.x, z: this.z + hd, hw: 3.1, hd: hd, hh: 0.2,
      surf: this.surf - (drop == null ? 0.55 : drop), stand: true
    });
  };
  Builder.prototype.gate = function (n) {
    var pad = this.pad('key', { hw: 1.45, hd: 1.15 });
    this.piece('gate', {
      x: pad.x, z: pad.z, hw: 2.8, hh: 1.75, hd: 0.22,
      surf: this.surf + 3.5, stand: false, n: n
    });
  };

  function demo(b, mech) {
    if (mech === 'sink') {
      var sinkAt = b.z;
      var sinkX = b.x;
      b.run(2, 'sink');
      var span = b.z - sinkAt;
      b.piece('floor', {
        x: sinkX, z: sinkAt + span / 2, hw: 2.4, hd: Math.max(0.4, span / 2 - 0.08), hh: 0.2,
        surf: b.surf - 0.55, stand: true
      });
      return;
    }
    if (mech === 'move') { b.floor(3.2, 0.02); b.pad('move', { amp: 0.85, hw: 1.25 }); b.pad('move', { amp: 0.85, hw: 1.25 }); return; }
    if (mech === 'gum') {
      b.pad('key', { hw: 2.3 });
      b.piece('gum', { x: b.x + 3.3, z: b.z - 0.8, r: 0.42, range: 0.7, stand: false, surf: b.surf + 0.7, hh: 0.42, hw: 0.42, hd: 0.42 });
      return;
    }
    if (mech === 'caps') { b.floor(2.4, 0.7); b.run(2, 'caps'); return; }
    if (mech === 'fan') {
      b.run(3, 'key', { hw: 1.5 });
      b.piece('fan', { x: b.x, z: b.z - 2, hw: 1.4, hd: 1.6, hh: 0.8, surf: b.surf + 1.6, stand: false, fz: 11 });
      return;
    }
    if (mech === 'pop') {
      var p = b.pad('key', { hw: 2.2 });
      b.piece('pop', { x: p.x, z: p.z, len: 1.15, pivot: b.surf + 2.35, r: 0.34, stand: false, hh: 0.34, hw: 0.34, hd: 0.34, surf: b.surf + 1.2 });
      return;
    }
    if (mech === 'shift') {
      b.floor(2.6, 0.02);
      var s = b.pad('key', { hw: 0.75 });
      b.piece('sweep', { x: s.x, z: s.z, amp: 1.7, r: 0.32, stand: false, hh: 0.32, hw: 0.32, hd: 0.32, surf: b.surf + 0.7 });
      return;
    }
    if (mech === 'launch') {
      b.pad('launch', { hd: 1.15, hw: 1.1 });
      b.hole(3.1);
      b.run(8, 'key', { hw: 1.15 });
    }
  }

  function hazard(b, mech, i, hard) {
    if (mech === 'sink') { b.pad('sink'); return; }
    if (mech === 'move') { b.pad('move', { amp: 0.8, hw: 1.2 }); return; }
    if (mech === 'gum') {
      var p = b.pad('key', { hw: hard ? 1.7 : 2.15 });
      b.piece('gum', {
        x: p.x, z: p.z, r: 0.4, range: hard ? 1.35 : 0.9, stand: false,
        surf: b.surf + 0.72, hh: 0.4, hw: 0.4, hd: 0.4, speed: hard ? 1.8 : 1.3
      });
      return;
    }
    if (mech === 'caps') {
      if (!hard) b.floor(1.3, 0.7);
      b.pad(i % 2 ? 'ice' : 'caps', { hw: 1.15 });
      return;
    }
    if (mech === 'fan') {
      b.pad('convey', { cvz: 3.2, hw: 1.15 });
      if (hard && i % 2 === 0) {
        b.piece('fan', { x: b.x - 1.6, z: b.z - 0.4, hw: 0.8, hd: 1.1, hh: 0.7, surf: b.surf + 1.4, stand: false, fx: 7 });
      }
      return;
    }
    if (mech === 'pop') {
      var q = b.pad('jelly', { hw: hard ? 1.35 : 1.8 });
      if (i % 2 === 0) b.piece('pop', { x: q.x, z: q.z, len: hard ? 1.45 : 1.2, pivot: b.surf + (hard ? 2.15 : 2.4), r: 0.32, stand: false, hh: 0.32, hw: 0.32, hd: 0.32, surf: b.surf + 1 });
      return;
    }
    if (mech === 'shift') {
      var s = b.pad('key', { hw: 0.78 });
      b.piece('sweep', { x: s.x, z: s.z, amp: hard ? 1.55 : 1.25, r: 0.3, stand: false, hh: 0.3, hw: 0.3, hd: 0.3, surf: b.surf + 0.65, speed: hard ? 2 : 1.4 });
      return;
    }
    if (mech === 'launch' && i % 3 === 2) {
      b.pad('launch', { hd: 1.05, hw: 1.05 });
      b.hole(3.1);
      b.run(8, 'key', { hw: 1.1 });
      return;
    }
    b.pad('key', { hw: 1.05 });
  }

  function wordPath(b, word) {
    b.run(2, 'key');
    for (var i = 0; i < word.length; i++) {
      if (i) b.hole(0.85);
      b.pad('key', { ch: word.charAt(i), hw: 1.05 });
    }
    b.run(2, 'key');
  }

  function floodStairs(b) {
    var approach = b.run(3, 'key', { hw: 1.3, hd: 1.15 });
    approach.mark = 1;
    var z0 = b.z;
    for (var i = 0; i < 12; i++) {
      b.hole(0.22);
      b.surf += 0.7;
      b.pad('key', { hw: 1.3, hd: 1.15 });
    }
    return { z0: z0, z1: b.z + 0.6, rate: 0.58, from: -0.85 };
  }

  function candyStage(b, stage) {
    if (stage === 0) {
      var zRun = b.z;
      b.run(3, 'key', { rails: true, hw: 1.25 });
      for (var c = 0; c < 3; c++) {
        b.piece('chev', { x: 0, z: zRun + 1.3 + c * 1.7, hw: 0.26, hd: 0.16, hh: 0.045, surf: 0.52, stand: false });
      }
      b.x = 1.55;
      b.pad('key', { hw: 1.9 });
      b.x = 2.35;
      b.pad('tramp', { hw: 2.15, hd: 1.2 });
      b.hole(1.35);
      b.x = 1.15;
      b.pad('key', { hw: 1.7, hd: 1.05 });
      b.x = -0.2;
      b.run(3, 'key', { hw: 1.35 });
      b.x = -1.7;
      b.run(2, 'key', { hw: 2.05 });
      b.x = -0.4;
      b.run(3, 'key', { hw: 1.35 });
      b.x = 1.2;
      b.run(3, 'key', { hw: 1.6 });
      b.x = 0;
      demo(b, 'sink');
      for (var k = 0; k < 36; k++) {
        b.x = Math.sin(k * 0.55) * 0.65;
        b.pad('key', { hw: 1.35 });
      }
      b.x = 0;
      return;
    }
    if (stage === 1) {
      b.run(2, 'key', { hw: 1.2 });
      b.x = -1.25;
      demo(b, 'sink');
      b.x = -0.2;
      b.pad('key', { hw: 1.25 });
      b.x = 1.2;
      b.pad('tramp', { hw: 1.4, hd: 1.1 });
      b.x = 0.35;
      b.run(2, 'key', { hw: 1.2 });
      b.x = 0;
      return;
    }
    b.run(2, 'key', { hw: 1.15 });
    b.x = 1.15;
    b.pad('move', { amp: 0.45, hw: 1.45, freq: 0.65 });
    b.x = 0;
    b.hole(1.55);
    b.pad('key', { hw: 1.5, hd: 1.1 });
    b.x = -1.05;
    b.pad('tramp', { hw: 1.35, hd: 1.05 });
    b.x = 0;
    b.run(2, 'key', { hw: 1.15 });
  }

  function buildStage(world, stage, z0) {
    var b = new Builder(z0, stage);
    var mech = MECH[world];
    var rails = false;
    var padKind = world === 3 ? 'ice' : 'key';
    var opt = { rails: rails, hw: world === 3 ? 1.2 : 0.9 };
    if (world === 0 && stage < 3) candyStage(b, stage);
    else {
      b.run(stage === 0 ? 8 : 5, padKind, opt);
      if (world === 0 || stage === 0) {
        b.pad('tramp', { hw: 1.35, hd: 1.1 });
        b.run(8, 'key', { hw: 1.15 });
      }
      if (stage === 0 || stage === 1) demo(b, mech);
    }
    var gateAt = world === 0 ? -1 : (world < 4 ? 3 : 1);
    var gateN = [0, 300, 700, 1100, 400, 500, 600, 700][world];
    var cycles = 3 + Math.floor(stage / 2);
    if (world === 6) cycles = 5 + stage;
    var land = stage >= 3 ? 5 : 4;
    for (var i = 0; i < cycles; i++) {
      if (stage === gateAt && i === 0 && gateN) {
        b.gate(gateN);
        b.run(2, 'key', { hw: 1.2 });
        b.hole(3.15);
        b.pad('key', { hw: 1.45, hd: 1.35, need: gateN });
        b.run(land, 'key', { hw: 1.15 });
        continue;
      }
      if (world === 4 && stage === 2 && i === 1) {
        b.run(2, 'key', { hw: 1.15 });
        b.hole(6.6);
        b.pad('key', { hw: 1.7, hd: 1.6, charm: 1, need: gateN });
        b.run(land, 'key', { hw: 1.15 });
        continue;
      }
      var gapKeys = stage >= 2 && i % 2 === 1 ? 2 : 1;
      if (world === 0) gapKeys = Math.min(gapKeys, 2);
      if (world === 6) {
        b.hole(0.28);
        b.surf += stage > 2 && i % 2 === 0 ? 1.45 : 0.98;
        b.run(2, 'key', { hw: 1.05 });
      } else {
        b.hole(gapKeys);
        if (i % 3 === 1 && stage > 0) hazard(b, mech, i, stage >= 3);
        else if (world === 3) b.pad('ice', { hw: 1.25, rails: rails });
        else if (world === 5 && i % 2 === 0) b.pad('jelly', { hw: 1.3 });
        else b.pad(padKind, { rails: rails, hw: rails ? 1.2 : 1.05 });
        b.run(land - 1, world === 3 ? 'ice' : 'key', { hw: rails ? 1.2 : 1.1, rails: rails });
      }
    }
    var flood = null;
    if (stage === 5) {
      wordPath(b, WORDS[world]);
      flood = floodStairs(b);
    }
    var flag = b.pad('key', { hw: 1.35, hd: 1.15 });
    flag.flag = 1;
    var length = b.z - z0;
    var gold = Math.max(16, Math.min(30, length / 6.2));
    return {
      world: world, index: stage, pieces: b.pieces, path: b.path,
      spawn: { x: 0, y: 0, z: z0 + 0.85 },
      flood: flood, length: length,
      gold: gold, silver: Math.min(40, gold * 1.45), bronze: Math.min(45, gold * 2.05),
      word: WORDS[world], z0: z0, z1: b.z
    };
  }

  function buildWorld(w) {
    var stages = [];
    var z = 0;
    for (var s = 0; s < 6; s++) {
      var stage = buildStage(w, s, z);
      stages.push(stage);
      z = stage.z1 + 0.2;
    }
    return {
      id: w, name: NAMES[w], word: WORDS[w], theme: KR.themes[w],
      stages: stages,
      rebirth: w >= 4 ? w - 3 : 0,
      charm: w >= 4 ? 1 : 0,
      gate: [0, 300, 700, 1100, 400, 500, 600, 700][w]
    };
  }

  var worlds = null;
  KR.worlds = function () {
    if (!worlds) {
      worlds = [];
      for (var i = 0; i < 8; i++) worlds.push(buildWorld(i));
    }
    return worlds;
  };

  KR.audit = function () {
    var problems = [];
    var list = KR.worlds();
    for (var w = 0; w < list.length; w++) {
      var world = list[w];
      for (var s = 0; s < world.stages.length; s++) {
        var stage = world.stages[s];
        var pads = stage.path;
        var gates = 0;
        for (var i = 0; i < stage.pieces.length; i++) if (stage.pieces[i].t === 'gate') gates++;
        if (world.gate && s === (w < 4 ? 3 : 1) && !gates) problems.push({ w: w, s: s, why: 'missing gate' });
        for (var i = 0; i < pads.length - 1; i++) {
          var a = pads[i], b = pads[i + 1];
          var gap = (b.z - b.hd) - (a.z + a.hd);
          var rise = (b.y + b.hh) - (a.y + a.hh);
          var stat = b.need || 0;
          var speed = KR.topSpeed(stat);
          var launch = a.t === 'launch';
          var jumps = b.charm ? 2 : 1;
          var air = KR.airTime(jumps, launch);
          var spd = launch ? Math.min(16, speed + C.LAUNCH_Z) : speed;
          if (gap > 0.08) {
            var have = spd * air;
            var margin = have / gap;
            if (margin < 1.25) problems.push({ w: w, s: s, gap: +gap.toFixed(2), have: +have.toFixed(2), margin: +margin.toFixed(2), rise: +rise.toFixed(2), need: stat, charm: b.charm || 0 });
            if (b.charm) {
              var single = (speed + (launch ? C.LAUNCH_Z : 0)) * KR.airTime(1, launch) / gap;
              if (single >= 1) problems.push({ w: w, s: s, why: 'charm gap clearable without charm', single: +single.toFixed(2) });
            }
          }
          var maxRise = KR.holdHeight() - 0.32;
          if (rise > maxRise) problems.push({ w: w, s: s, why: 'rise', rise: +rise.toFixed(2), max: +maxRise.toFixed(2) });
        }
        var span = stage.length / Math.max(4, KR.topSpeed(0));
        if (span > 45 && s < 5) problems.push({ w: w, s: s, why: 'long', span: +span.toFixed(1) });
      }
    }
    return problems;
  };

  function row(letters, z, pieces, id) {
    var n = letters.length;
    var shift = n % 2 === 0 ? -0.91 : 0;
    for (var i = 0; i < n; i++) {
      var x = (i - (n - 1) / 2) * 1.82 + shift;
      pieces.push({
        id: id++, t: 'key', stage: -1, x: x, z: z, y: -KR.C.HH, hw: 0.82, hh: KR.C.HH, hd: 0.82,
        stand: true, ch: letters.charAt(i), plaza: 1
      });
    }
    return id;
  }

  KR.plaza = function () {
    var pieces = [];
    var id = 1;
    id = row('ضصثقفغعهخحجد', 3.2, pieces, id);
    id = row('شسيبلاتنمكط', 5.15, pieces, id);
    id = row('ئءؤرلاىةوزظ', 7.1, pieces, id);
    pieces.push({
      id: id++, t: 'key', stage: -1, x: 0, z: 1.3, y: -KR.C.HH, hw: 1.7, hh: KR.C.HH, hd: 1.7,
      stand: true, plaza: 1
    });
    pieces.push({
      id: id++, t: 'key', stage: -1, x: 0, z: 9.1, y: -KR.C.HH, hw: 1.45, hh: KR.C.HH, hd: 1.7,
      stand: true, plaza: 1
    });
    pieces.push({
      id: id++, t: 'key', stage: -1, x: 0, z: 18, y: -KR.C.HH, hw: 16, hh: KR.C.HH, hd: 8,
      stand: true, plaza: 1
    });
    pieces.push({
      id: id++, t: 'key', stage: -1, x: 3.1, z: 15.2, y: -KR.C.HH, hw: 1.7, hh: KR.C.HH, hd: 1.15,
      stand: true, plaza: 1
    });
    pieces.push({
      id: id++, t: 'tramp', stage: -1, x: 6.2, z: 15.2, y: -KR.C.HH + 0.08, hw: 1.3, hh: KR.C.HH, hd: 1.15,
      stand: true, plaza: 1
    });
    for (var t = 0; t < 3; t++) {
      pieces.push({
        id: id++, t: 'tread', stage: -1, x: 8.4, z: 4 + t * 2.3, y: -0.18, hw: 1.15, hh: 0.2, hd: 1.05,
        stand: true, tread: 1, plaza: 1
      });
    }
    pieces.push({ id: id++, t: 'shop', stage: -1, x: -8.2, z: 5.2, y: -KR.C.HH, hw: 1.4, hh: KR.C.HH, hd: 1.4, stand: true, shop: 1, plaza: 1 });
    var slots = [
      [0, 0, 16.2], [1, -3.6, 16.2], [2, 3.6, 16.2], [3, -7.1, 19],
      [4, 7.1, 19], [5, -3.6, 21.6], [6, 3.6, 21.6], [7, 0, 24]
    ];
    for (var s = 0; s < slots.length; s++) {
      var sl = slots[s];
      pieces.push({
        id: id++, t: 'portal', stage: -1, world: sl[0], x: sl[1], z: sl[2],
        y: -KR.C.HH + 0.06, hw: 1.35, hh: KR.C.HH, hd: 1.35, stand: true, portal: sl[0], plaza: 1
      });
    }
    pieces.push({
      id: id++, t: 'tower', stage: -1, x: -8.2, z: 9.4, y: -KR.C.HH, hw: 1.3, hh: KR.C.HH, hd: 1.3,
      stand: true, tower: 1, plaza: 1
    });
    return pieces;
  };

  KR.tower = function (seed) {
    var rng = seed | 0 || 1;
    function rnd() { rng = Math.imul(rng ^ (rng >>> 15), 2246822507) >>> 0; rng = Math.imul(rng ^ (rng >>> 13), 3266489909) >>> 0; return ((rng ^= rng >>> 16) >>> 0) / 4294967296; }
    var pieces = [];
    var z = 0, surf = 0, id = 1;
    pieces.push({ id: id++, t: 'key', stage: 0, x: 0, z: 0.8, y: -KR.C.HH, hw: 1.4, hh: KR.C.HH, hd: 1.2, stand: true, path: 0 });
    for (var i = 0; i < 90; i++) {
      var rise = 0.85 + rnd() * 0.45;
      var gap = 0.45 + rnd() * 0.85;
      if (rise > KR.holdHeight() - 0.45) rise = KR.holdHeight() - 0.5;
      if (gap > 2.4) gap = 2.4;
      z += 1.7 + gap;
      surf += rise;
      var kind = rnd() < 0.18 ? 'move' : rnd() < 0.28 ? 'sink' : 'key';
      var p = {
        id: id++, t: kind, stage: 0, x: (rnd() - 0.5) * 1.1, z: z, y: surf - KR.C.HH,
        hw: 1.05, hh: KR.C.HH, hd: 0.9, stand: true, path: i + 1
      };
      if (kind === 'move') { p.amp = 0.55; p.freq = 1; p.baseX = p.x; p.hw = 1.2; }
      pieces.push(p);
      if (rnd() < 0.22) {
        pieces.push({
          id: id++, t: 'gum', stage: 0, x: p.x, z: p.z, y: surf + 0.45, r: 0.36, range: 1.1,
          hw: 0.36, hh: 0.36, hd: 0.36, stand: false, baseX: p.x, speed: 1.5
        });
      }
    }
    return { seed: seed >>> 0, pieces: pieces, spawn: { x: 0, y: 0, z: 0.8 } };
  };

  KR.SHOP = {
    shoes: [
      { id: 2, cost: 8, name: 'حذاء +2' },
      { id: 3, cost: 20, name: 'حذاء +3' },
      { id: 5, cost: 40, name: 'حذاء +5' }
    ],
    trails: [
      { id: 1, cost: 6, name: 'أثر قوس قزح' },
      { id: 2, cost: 12, name: 'أثر نجوم' },
      { id: 3, cost: 18, name: 'أثر حروف' }
    ],
    auras: [
      { id: 1, cost: 8, name: 'هالة شرر' },
      { id: 2, cost: 16, name: 'هالة حلقة' }
    ],
    hats: [
      { id: 1, cost: 5, name: 'تاج حلوى' },
      { id: 2, cost: 10, name: 'مروحة' },
      { id: 3, cost: 14, name: 'نجمة' },
      { id: 4, cost: 18, name: 'كعكة' }
    ],
    charm: { id: 1, cost: 24, name: 'حذاء القفز', need: 4 }
  };

  function num(v, min, max, d) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return d;
    if (v < min) return d;
    if (v > max) return max;
    return v;
  }
  KR.defaultSave = function () {
    return {
      v: 1, speed: 0, wins: 0, rebirths: 0, unlocked: 1, best: 0,
      shoe: 1, trail: 0, aura: 0, hat: 0, charm: 0,
      owned: { shoes: [1], trails: [0], auras: [0], hats: [0], charm: 0 },
      medals: {}, tower: {}, quality: 'high'
    };
  };
  KR.normalizeSave = function (raw) {
    var d = KR.defaultSave();
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return d;
    d.speed = num(raw.speed, 0, 1e7, 0);
    d.wins = num(raw.wins, 0, 1e7, 0);
    d.rebirths = num(raw.rebirths, 0, 30, 0) | 0;
    d.unlocked = num(raw.unlocked, 1, 8, 1) | 0;
    d.best = num(raw.best, 0, 1e7, 0);
    d.shoe = raw.shoe === 2 || raw.shoe === 3 || raw.shoe === 5 ? raw.shoe : 1;
    d.trail = raw.trail === 1 || raw.trail === 2 || raw.trail === 3 ? raw.trail : 0;
    d.aura = raw.aura === 1 || raw.aura === 2 ? raw.aura : 0;
    d.hat = raw.hat >= 1 && raw.hat <= 4 ? raw.hat | 0 : 0;
    d.charm = raw.charm ? 1 : 0;
    d.quality = raw.quality === 'low' ? 'low' : 'high';
    var own = raw.owned && typeof raw.owned === 'object' ? raw.owned : {};
    function ids(list, ok) {
      var out = [];
      if (!Array.isArray(list)) return out;
      for (var i = 0; i < list.length && out.length < 12; i++) if (ok(list[i]) && out.indexOf(list[i]) < 0) out.push(list[i]);
      return out;
    }
    d.owned.shoes = ids(own.shoes, function (n) { return n === 1 || n === 2 || n === 3 || n === 5; });
    if (d.owned.shoes.indexOf(1) < 0) d.owned.shoes.unshift(1);
    d.owned.trails = ids(own.trails, function (n) { return n === 0 || n === 1 || n === 2 || n === 3; });
    d.owned.auras = ids(own.auras, function (n) { return n === 0 || n === 1 || n === 2; });
    d.owned.hats = ids(own.hats, function (n) { return n === 0 || (n >= 1 && n <= 4); });
    d.owned.charm = own.charm ? 1 : 0;
    if (d.owned.shoes.indexOf(d.shoe) < 0) d.shoe = 1;
    if (d.trail && d.owned.trails.indexOf(d.trail) < 0) d.trail = 0;
    if (d.aura && d.owned.auras.indexOf(d.aura) < 0) d.aura = 0;
    if (d.hat && d.owned.hats.indexOf(d.hat) < 0) d.hat = 0;
    if (d.charm && !d.owned.charm) d.charm = 0;
    if (raw.medals && typeof raw.medals === 'object') {
      var keys = Object.keys(raw.medals);
      for (var i = 0; i < keys.length && i < 80; i++) {
        var k = keys[i];
        if (!/^[0-7]-[0-5]$/.test(k)) continue;
        var m = raw.medals[k];
        if (!m || typeof m !== 'object') continue;
        var medal = m.medal === 'gold' || m.medal === 'silver' || m.medal === 'bronze' ? m.medal : '';
        d.medals[k] = { time: num(m.time, 0, 600, 0), medal: medal, noFall: m.noFall ? 1 : 0, word: m.word ? 1 : 0 };
      }
    }
    if (raw.tower && typeof raw.tower === 'object') {
      var tk = Object.keys(raw.tower);
      for (var i = 0; i < tk.length && i < 40; i++) {
        if (!/^[0-9]{6,8}$/.test(tk[i])) continue;
        d.tower[tk[i]] = num(raw.tower[tk[i]], 0, 5000, 0);
      }
    }
    return d;
  };

  KR.dailySeed = function (date) {
    var d = date || new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  };
})(globalThis.KeyRunner = globalThis.KeyRunner || {});
