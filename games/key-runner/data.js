/* Candy Key Tower. Eight hand-built climbs. Pieces are data; engine.js simulates them. */
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
    HH: 0.22,
    FALL_Y: -6,
    FALL_T: 0.8,
    CAM_BACK: 9.2,
    CAM_UP: 6.45,
    CAM_AHEAD: 5.4,
    RUN: 7.6,
    BOOST: 11.8,
    FLOOD: 0.24,
    FLOOD_FAST: 0.95,
    FLOOD_FROM: -2.2
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

  KR.NAMES = ['برج الحلوى'];
  KR.WORDS = [''];
  KR.themes = [
    { sky: 0xffd6f2, fog: 0xffc4ea, sea: 0x6a3418, key: 0xff4eb6, top: 0xfff6ea, accent: 0xffe14a, dark: 0x5a2a38 }
  ];
  /* Eight candy keyboards. Neighbours never share a colour. */
  KR.PAL = [
    [0xff4b8d, 0xfff6ea, 0xffe14a, 0x7dffa0, 0x8fd4ff],
    [0xffe14a, 0xff4b8d, 0xfff6ea, 0x5ee0ff, 0xff9a3c],
    [0x7dffa0, 0xfff6ea, 0xff4b8d, 0xffe14a, 0xc9a6ff],
    [0x8fd4ff, 0xfff6ea, 0xff4b8d, 0xffe14a, 0x7dffa0],
    [0xff9a3c, 0xfff6ea, 0xff4b8d, 0xffe14a, 0x8fd4ff],
    [0xc9a6ff, 0xfff6ea, 0xffe14a, 0xff4b8d, 0x7dffa0],
    [0xff4b8d, 0xffe14a, 0x8fd4ff, 0xfff6ea, 0xff9a3c],
    [0xffe14a, 0xfff6ea, 0xff4b8d, 0x7dffa0, 0xc9a6ff]
  ];

  function Builder(z, surf, stage) {
    this.z = z;
    this.surf = surf;
    this.x = 0;
    this.stage = stage;
    this.pieces = [];
    this.path = [];
    this.n = 1;
  }
  Builder.prototype.piece = function (t, o) {
    o = o || {};
    var hh = o.hh != null ? o.hh : C.HH;
    var p = {
      id: this.stage * 1000 + this.n++,
      t: t,
      stage: this.stage,
      x: o.x != null ? o.x : this.x,
      z: o.z != null ? o.z : this.z,
      hw: o.hw != null ? o.hw : 0.9,
      hh: hh,
      hd: o.hd != null ? o.hd : 0.9,
      stand: o.stand !== false,
      y: (o.surf != null ? o.surf : this.surf) - hh
    };
    if (o.ch) p.ch = o.ch;
    if (o.foot) p.foot = 1;
    if (o.hint) p.hint = o.hint;
    if (o.amp) { p.amp = o.amp; p.freq = o.freq || 0.8; p.baseX = p.x; }
    if (o.cvz) p.cvz = o.cvz;
    if (o.cvx) p.cvx = o.cvx;
    if (o.haste) p.haste = 1;
    if (o.flag) p.flag = 1;
    if (o.mark) p.mark = 1;
    this.pieces.push(p);
    return p;
  };
  Builder.prototype.pad = function (t, o) {
    o = o || {};
    var hd = o.hd != null ? o.hd : 0.92;
    var hw = o.hw != null ? o.hw : 1.25;
    if (o.rise) this.surf += o.rise;
    if (o.x != null) this.x = o.x;
    var p = this.piece(t || 'key', {
      x: this.x, z: this.z + hd, hw: hw, hd: hd, hh: o.hh != null ? o.hh : C.HH,
      surf: this.surf, ch: o.ch || GLYPH[this.n % GLYPH.length], foot: o.foot, hint: o.hint,
      amp: o.amp, freq: o.freq, cvz: o.cvz, cvx: o.cvx, haste: o.haste,
      flag: o.flag, mark: o.mark
    });
    p.path = this.path.length;
    this.path.push(p);
    this.z = p.z + hd - 0.1;
    return p;
  };
  Builder.prototype.run = function (n, t, o) {
    var last, i;
    for (i = 0; i < n; i++) last = this.pad(t || 'key', o);
    return last;
  };
  Builder.prototype.hole = function (gap) { this.z += gap; };
  Builder.prototype.flag = function () {
    this.x = 0;
    var p = this.pad('key', { hw: 2.35, hd: 1.45, hh: 0.26 });
    p.flag = 1;
    p.mark = 1;
    return p;
  };

  var GLYPH = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
  var EASY = { hw: 1.42, hd: 0.92, rise: 0.055 };
  function stretch(b, n) { b.x = 0; b.run(n, 'key', EASY); }

  function stage0(b) {
    var hello = ['و', 'ا', 'ق', 'ف', 'ز'];
    var i;
    for (i = 0; i < 5; i++) {
      b.pad('key', {
        hw: 1.55, hd: 1.02, ch: hello[i], foot: 1,
        hint: i === 0 ? 'w' : i === 3 ? 'space' : '',
        rise: i ? 0.05 : 0
      });
    }
    stretch(b, 14);
    b.run(6, 'key', { hw: 1.7, hd: 1.0, cvz: 1.6, rise: 0.04 });
    for (i = 0; i < 10; i++) b.pad('key', { x: Math.sin(i * 0.55) * 0.28, hw: 1.9, hd: 0.92, rise: 0.05 });
    stretch(b, 12);
    b.pad('tramp', { hw: 2.3, hd: 0.78, rise: 0.04 });
    stretch(b, 16);
    b.run(4, 'move', { amp: 0.28, hw: 1.85, hd: 0.95, freq: 0.55, rise: 0.04 });
    stretch(b, 26);
    b.flag();
  }
  function stage1(b) {
    b.hole(2.4);
    b.pad('key', { hw: 1.6, hd: 1.12, rise: 0.35 });
    stretch(b, 18);
    b.pad('tramp', { hw: 2.2, hd: 0.72, rise: 0.05 });
    b.hole(1.8);
    b.pad('key', { hw: 1.55, hd: 1.15, rise: 0.95 });
    stretch(b, 8);
    b.run(4, 'move', { amp: 0.75, hw: 1.55, hd: 0.95, rise: 0.06 });
    b.hole(1.85);
    b.pad('key', { hw: 1.55, hd: 1.12, rise: 0.3 });
    stretch(b, 8);
    b.pad('key', { haste: 1, hw: 1.45, hd: 1.0, rise: 0.1 });
    stretch(b, 10);
    b.run(3, 'sink', { hw: 1.5, hd: 0.95, rise: 0.05 });
    stretch(b, 22);
    b.flag();
  }
  function stage2(b) {
    stretch(b, 6);
    b.hole(2.0);
    b.pad('key', { hw: 1.55, hd: 1.12, rise: 0.45 });
    stretch(b, 6);
    b.run(3, 'sink', { hw: 1.45, hd: 0.95, rise: 0.06 });
    stretch(b, 6);
    b.pad('key', { x: 1.15, hw: 1.3, hd: 0.98, rise: 0.18 });
    b.pad('key', { x: 2.05, hw: 1.25, hd: 0.95, rise: 0.14 });
    b.pad('key', { x: 1.05, hw: 1.3, rise: 0.12 });
    b.pad('key', { x: 0, hw: 1.45, rise: 0.1 });
    stretch(b, 8);
    b.hole(2.05);
    b.pad('key', { hw: 1.55, hd: 1.15, rise: 0.4 });
    b.pad('key', { x: -1.25, hw: 1.3, rise: 0.16 });
    b.pad('key', { x: -2.1, hw: 1.25, rise: 0.14 });
    b.pad('key', { x: 0, hw: 1.5, rise: 0.16 });
    stretch(b, 24);
    b.flag();
  }
  function stage3(b) {
    stretch(b, 5);
    b.pad('tramp', { hw: 2.15, hd: 0.7, rise: 0.06 });
    b.hole(2.05);
    b.pad('key', { hw: 1.55, hd: 1.15, rise: 1.05 });
    stretch(b, 6);
    b.run(3, 'move', { amp: 0.9, hw: 1.5, freq: 0.65, rise: 0.06 });
    b.hole(1.7);
    b.pad('key', { hw: 1.5, rise: 0.3 });
    stretch(b, 5);
    b.run(3, 'sink', { hw: 1.4, hd: 0.95, rise: 0.06 });
    b.pad('key', { haste: 1, hw: 1.4, rise: 0.12 });
    stretch(b, 6);
    b.pad('key', { x: -1.35, hw: 1.3, rise: 0.18 });
    b.pad('key', { x: -2.15, hw: 1.25, rise: 0.14 });
    b.pad('key', { x: -0.7, hw: 1.3, rise: 0.12 });
    b.pad('key', { x: 0, hw: 1.45, rise: 0.12 });
    stretch(b, 22);
    b.flag();
  }
  function stage4(b) {
    stretch(b, 5);
    b.run(5, 'key', { hw: 1.75, hd: 0.95, cvx: 2.4, rise: 0.05 });
    b.hole(2.15);
    b.pad('key', { hw: 1.6, hd: 1.2, rise: 0.45 });
    stretch(b, 4);
    b.pad('tramp', { hw: 2.05, hd: 0.7, rise: 0.08 });
    b.hole(2.2);
    b.pad('key', { hw: 1.65, hd: 1.2, rise: 1.1 });
    stretch(b, 5);
    b.run(3, 'move', { amp: 0.85, hw: 1.5, rise: 0.08 });
    b.hole(1.7);
    b.pad('key', { hw: 1.5, rise: 0.28 });
    b.run(3, 'sink', { hw: 1.4, rise: 0.06 });
    stretch(b, 22);
    b.flag();
  }
  function stage5(b) {
    b.hole(2.05);
    b.pad('key', { hw: 1.55, hd: 1.12, rise: 0.4 });
    stretch(b, 6);
    b.hole(1.6);
    b.pad('key', { x: 1.45, hw: 1.3, rise: 0.22 });
    b.pad('key', { x: 2.25, hw: 1.25, rise: 0.16 });
    b.hole(1.45);
    b.pad('key', { x: 1.0, hw: 1.35, rise: 0.28 });
    b.pad('move', { x: 0, amp: 0.7, hw: 1.55, rise: 0.12 });
    stretch(b, 6);
    b.hole(1.9);
    b.pad('key', { hw: 1.55, hd: 1.15, rise: 0.45 });
    b.pad('key', { haste: 1, hw: 1.4, rise: 0.12 });
    stretch(b, 20);
    b.flag();
  }
  function stage6(b) {
    stretch(b, 4);
    b.run(3, 'sink', { hw: 1.4, rise: 0.06 });
    b.hole(2.15);
    b.pad('key', { hw: 1.55, hd: 1.15, rise: 0.5 });
    b.pad('tramp', { hw: 2.15, hd: 0.68, rise: 0.06 });
    b.hole(2.25);
    b.pad('key', { hw: 1.6, hd: 1.2, rise: 1.15 });
    stretch(b, 4);
    b.run(4, 'key', { cvx: -2.2, hw: 1.85, hd: 1.0, rise: 0.05 });
    stretch(b, 3);
    b.pad('key', { x: -0.95, hw: 1.55, rise: 0.12 });
    b.pad('key', { x: -1.55, hw: 1.45, rise: 0.1 });
    b.pad('key', { x: -0.65, hw: 1.55, rise: 0.1 });
    b.pad('key', { x: 0, hw: 1.6, rise: 0.1 });
    b.run(3, 'move', { amp: 0.4, hw: 1.85, hd: 1.0, rise: 0.05 });
    stretch(b, 18);
    b.flag();
  }
  function stage7(b) {
    b.hole(2.1);
    b.pad('key', { hw: 1.55, hd: 1.15, rise: 0.45 });
    stretch(b, 5);
    b.pad('key', { haste: 1, hw: 1.4, rise: 0.12 });
    stretch(b, 10);
    b.hole(1.75);
    b.pad('key', { hw: 1.6, hd: 1.2, rise: 0.35 });
    stretch(b, 4);
    b.run(4, 'key', { hw: 1.45, hd: 0.95, rise: 0.16 });
    b.pad('tramp', { hw: 2.3, hd: 0.72, rise: 0.05 });
    b.run(12, 'key', { hw: 2.2, hd: 1.25, rise: 0.03 });
    b.flag();
  }

  var BUILD = [stage0, stage1, stage2, stage3, stage4, stage5, stage6, stage7];

  function buildTower() {
    var stages = [];
    var z = 0;
    var surf = 0;
    var s, b, length, flag;
    for (s = 0; s < 8; s++) {
      b = new Builder(z, surf, s);
      BUILD[s](b);
      flag = b.path[b.path.length - 1];
      length = Math.max(8, b.z - z);
      stages.push({
        index: s,
        pieces: b.pieces,
        path: b.path,
        spawn: { x: 0, y: 0, z: s === 0 ? b.path[0].z : z },
        gold: Math.max(18, length / 7.2),
        silver: Math.max(26, length / 5.4),
        bronze: Math.max(36, length / 4.2),
        word: '',
        flood: null,
        flagY: flag ? flag.y + flag.hh : surf
      });
      z = b.z;
      surf = b.surf;
    }
    return stages;
  }

  var cached = null;
  KR.worlds = function () {
    if (!cached) cached = [{ stages: buildTower(), word: '', charm: 0, rebirth: 0 }];
    return cached;
  };
  KR.audit = function () { return []; };

  KR.suggest = function (state, index, memory) {
    var pl = state.players[index || 0];
    if (!memory) {
      state._bot = state._bot || {};
      memory = state._bot;
    }
    var best = null;
    var bestD = 1e9;
    var on = null;
    var i, p, edge, d, rise, gap, lip, x, jump;
    for (i = 0; i < state.pieces.length; i++) {
      p = state.pieces[i];
      if (p.id === pl.ground) on = p;
      if (!p.stand || p.gone) continue;
      if (p.z < pl.z - 0.25) continue;
      edge = p.z - p.hd;
      d = Math.max(0, edge - pl.z) + Math.abs(p.x - pl.x) * 0.7 + Math.max(0, (p.y + p.hh) - pl.y) * 0.35;
      if (d < bestD) { bestD = d; best = p; }
    }
    x = 0;
    jump = false;
    if (best && best.t !== 'tramp') {
      x = Math.max(-1, Math.min(1, (best.x - pl.x) / 0.9));
      rise = (best.y + best.hh) - pl.y;
      gap = (best.z - best.hd) - pl.z;
      lip = on ? (on.z + on.hd - pl.z) : 1;
      if (pl.onGround) {
        if (gap > 1.15 && gap < 3.5 && lip < 1.2) {
          jump = true;
          if (gap > 2.15) memory.hold = 36;
        } else if (rise > 0.48 && gap < 1.45 && gap > -0.35 && lip < 1.3) {
          jump = true;
          if (rise > 0.85) memory.hold = 42;
        }
      }
    } else if (best) x = Math.max(-1, Math.min(1, (best.x - pl.x) / 0.9));
    if (!pl.onGround && memory.hold > 0) { jump = true; memory.hold--; }
    else if (pl.onGround && !jump) memory.hold = 0;
    return { x: x, z: pl.finished ? 0 : 1, jump: jump };
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
      medals: {}, tower: {}, quality: 'high', flags: 0, bestTime: 0
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
    d.flags = num(raw.flags, 0, 8, 0) | 0;
    d.bestTime = num(raw.bestTime, 0, 1e7, 0);
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
      for (var ti = 0; ti < tk.length && ti < 40; ti++) {
        if (!/^[0-9]{6,8}$/.test(tk[ti])) continue;
        d.tower[tk[ti]] = num(raw.tower[tk[ti]], 0, 5000, 0);
      }
    }
    return d;
  };

  KR.dailySeed = function (date) {
    var d = date || new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  };
})(globalThis.KeyRunner = globalThis.KeyRunner || {});
