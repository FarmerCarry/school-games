/* Skybound Golf (ضربة إلى الفضاء) — Pure deterministic 2D-plane arcade golf physics,
 * procedural altitude-layered course generator, upgrades, milestones & save sanitization.
 * Zero DOM, zero Kit, zero Math.random(). UMD export for browser & Node verification. */
(function (root) {
  'use strict';

  var M = Math;
  var DEG2RAD = M.PI / 180;
  var BALL_R = 0.65;
  var CHUNK_W = 48;
  var MAX_TIME = 60;
  var PERFECT_ANGLE_MIN = 38;
  var PERFECT_ANGLE_MAX = 54;

  var LAYERS = [
    { id: 'meadow', name: 'المرج المشمس', minY: 0, icon: '☀️' },
    { id: 'clouds', name: 'الغيوم والمناطيد', minY: 42, icon: '🎈' },
    { id: 'sky', name: 'السماء العالية', minY: 110, icon: '✈️' },
    { id: 'aurora', name: 'الشفق القطبي', minY: 205, icon: '🌌' },
    { id: 'space', name: 'الفضاء الخارجي', minY: 310, icon: '🛸' }
  ];

  var MILESTONES = [
    { id: 'cloud_gate', dist: 250, name: 'بوابة الغيوم', bonus: 40, icon: '☁️' },
    { id: 'air_club', dist: 600, name: 'نادي الطائرات', bonus: 90, icon: '✈️' },
    { id: 'moon', dist: 1200, name: 'هبوط القمر', bonus: 180, icon: '🌙' },
    { id: 'mars', dist: 2400, name: 'كوكب المريخ', bonus: 400, icon: '🪐' }
  ];

  var UPGRADES = [
    { id: 'power', name: 'قوة الضربة', short: 'القوة', max: 12, base: 25, mult: 1.46, icon: '⚡' },
    { id: 'fuel', name: 'وقود الصاروخ', short: 'الصاروخ', max: 10, base: 30, mult: 1.48, icon: '🚀' },
    { id: 'bounce', name: 'الارتداد', short: 'الارتداد', max: 10, base: 25, mult: 1.46, icon: '🏀' },
    { id: 'magnet', name: 'المغناطيس والحظ', short: 'المغناطيس', max: 10, base: 35, mult: 1.48, icon: '🧲' }
  ];

  var SKINS = [
    { id: 'classic', name: 'الكلاسيكية', cost: 0, primary: 0xffffff, accent: 0xffcc00, trail: 0xfff4b8 },
    { id: 'fireball', name: 'كرة النار', cost: 120, primary: 0xff551a, accent: 0xffdd33, trail: 0xff7722 },
    { id: 'disco', name: 'كرة الديسكو', cost: 250, primary: 0x3ef2ff, accent: 0xff4fd8, trail: 0xb877ff },
    { id: 'planet', name: 'الكوكب الصغير', cost: 450, primary: 0x2e9dff, accent: 0x4de87c, trail: 0x7ce6ff },
    { id: 'star', name: 'النجمة الذهبية', cost: 750, primary: 0xffd52e, accent: 0xfff8b0, trail: 0xffe45c }
  ];

  var SAVE_VERSION = 3;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function finite(v, fb) { return typeof v === 'number' && isFinite(v) ? v : fb; }

  // Deterministic 32-bit hash in [0, 1).
  function hash(n, salt) {
    var x = ((n | 0) * 374761393 + (salt | 0) * 668265263) | 0;
    x = ((x ^ (x >>> 13)) * 1274126177) | 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return x / 4294967296;
  }

  function normUpgrades(raw) {
    var out = {};
    raw = raw && typeof raw === 'object' ? raw : {};
    for (var i = 0; i < UPGRADES.length; i++) {
      var u = UPGRADES[i];
      var v = Math.floor(finite(Number(raw[u.id]), 0));
      out[u.id] = clamp(v, 0, u.max);
    }
    return out;
  }

  function upgradeCost(id, level) {
    for (var i = 0; i < UPGRADES.length; i++) {
      if (UPGRADES[i].id === id) {
        var u = UPGRADES[i];
        var lv = clamp(Math.floor(finite(level, 0)), 0, u.max);
        if (lv >= u.max) return Infinity;
        return Math.round(u.base * M.pow(u.mult, lv) / 5) * 5;
      }
    }
    return Infinity;
  }

  function sanitizeSave(raw) {
    var fresh = {
      v: SAVE_VERSION,
      coins: 0,
      bestDist: 0,
      bestAlt: 0,
      shots: 0,
      upgrades: normUpgrades(null),
      skin: 'classic',
      ownedSkins: ['classic'],
      milestones: [],
      tips: 0
    };
    if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return fresh;
    fresh.coins = Math.max(0, Math.floor(finite(Number(raw.coins), 0)));
    fresh.bestDist = Math.max(0, Math.floor(finite(Number(raw.bestDist), 0)));
    fresh.bestAlt = Math.max(0, Math.floor(finite(Number(raw.bestAlt), 0)));
    fresh.shots = Math.max(0, Math.floor(finite(Number(raw.shots), 0)));
    fresh.upgrades = normUpgrades(raw.upgrades);
    fresh.tips = clamp(Math.floor(finite(Number(raw.tips), 0)), 0, 10);

    var validSkin = {};
    for (var i = 0; i < SKINS.length; i++) validSkin[SKINS[i].id] = true;
    var owned = { classic: true };
    if (Array.isArray(raw.ownedSkins)) {
      for (i = 0; i < raw.ownedSkins.length; i++) {
        if (validSkin[raw.ownedSkins[i]]) owned[raw.ownedSkins[i]] = true;
      }
    }
    fresh.ownedSkins = Object.keys(owned);
    fresh.skin = validSkin[raw.skin] && owned[raw.skin] ? raw.skin : 'classic';

    var validMs = {};
    for (i = 0; i < MILESTONES.length; i++) validMs[MILESTONES[i].id] = true;
    var seenMs = {};
    if (Array.isArray(raw.milestones)) {
      for (i = 0; i < raw.milestones.length; i++) {
        var mId = raw.milestones[i];
        if (validMs[mId] && !seenMs[mId]) { seenMs[mId] = true; fresh.milestones.push(mId); }
      }
    }
    return fresh;
  }

  /* --------------------------------------------------------------- meters */
  // Smooth back-and-forth oscillation 0..1 using cosine easing.
  function osc01(t, speed) {
    return 0.5 - 0.5 * M.cos(t * speed * M.PI);
  }

  function aimAngle(t, speed) {
    var u = osc01(t, speed || 1.35);
    return lerp(20, 70, u);
  }

  function isPerfectAngle(deg) {
    return deg >= PERFECT_ANGLE_MIN && deg <= PERFECT_ANGLE_MAX;
  }

  function powerValue(t, speed) {
    var u = osc01(t, speed || 1.75);
    return lerp(0.18, 1.0, u);
  }

  function perfectBand(ddaParams) {
    var w = ddaParams && finite(ddaParams.perfectWidth, 0.14) || 0.14;
    return clamp(1.0 - w, 0.72, 0.92);
  }

  function grade(power, ddaParams) {
    var pf = perfectBand(ddaParams);
    if (power >= pf) return 'perfect';
    if (power >= pf - 0.14) return 'great';
    if (power >= 0.48) return 'good';
    return 'weak';
  }

  function layerAt(y) {
    var idx = 0;
    for (var i = LAYERS.length - 1; i >= 0; i--) {
      if (y >= LAYERS[i].minY) { idx = i; break; }
    }
    return LAYERS[idx];
  }

  function layerIndexAt(y) {
    for (var i = LAYERS.length - 1; i >= 0; i--) {
      if (y >= LAYERS[i].minY) return i;
    }
    return 0;
  }

  function magnetRadius(upgrades) {
    var u = normUpgrades(upgrades);
    return 3.4 + u.magnet * 0.85;
  }

  function maxFuelOf(upgrades) {
    var u = normUpgrades(upgrades);
    return 1.15 + u.fuel * 0.27;
  }

  /* --------------------------------------------------------------- course */
  function createCourse(seed, ddaParams) {
    var s = Math.floor(finite(seed, 101)) | 0;
    if (s === 0) s = 101;
    var dp = ddaParams && typeof ddaParams === 'object' ? ddaParams : {};
    return {
      seed: s,
      perfectWidth: clamp(finite(dp.perfectWidth, 0.15), 0.08, 0.28),
      targetBonus: clamp(finite(dp.targetBonus, 1.0), 0.8, 1.4),
      aimSpeed: clamp(finite(dp.aimSpeed, 1.4), 0.9, 2.1),
      powerSpeed: clamp(finite(dp.powerSpeed, 1.75), 1.1, 2.5),
      chunks: {}
    };
  }

  function rawHeight(course, x) {
    if (x <= 10) return 2.2;
    var s = course.seed;
    var p1 = hash(s, 11) * M.PI * 2;
    var p2 = hash(s, 23) * M.PI * 2;
    var blend = clamp((x - 10) / 22, 0, 1);
    var smooth = blend * blend * (3 - 2 * blend);
    var hills = 2.4 * M.sin(x * 0.028 + p1) + 1.35 * M.cos(x * 0.067 + p2) + 0.55 * M.sin(x * 0.13);
    // Gentle dip right after tee creates a fun natural launch bowl!
    var bowl = -1.6 * M.exp(-M.pow((x - 28) / 14, 2));
    return lerp(2.2, 2.6 + hills + bowl, smooth);
  }

  function buildChunk(course, idx) {
    var cached = course.chunks[idx];
    if (cached) return cached;
    var x0 = idx * CHUNK_W;
    var s = course.seed;
    var flats = [];
    var trampolines = [];
    var tnts = [];
    var balloons = [];
    var rings = [];
    var ufos = [];
    var stars = [];
    var scenery = [];

    if (idx >= 1) {
      // Surface patch: sand bunker or sparkling water pond (never overlapping the tee).
      var surfRoll = hash(idx, s + 3);
      if (idx >= 2 && surfRoll < 0.24) {
        var wx = x0 + 14 + hash(idx, s + 4) * 20;
        var hw = 6.5 + hash(idx, s + 5) * 4.5;
        var lvl = rawHeight(course, wx) - 0.55;
        flats.push({ id: 'w' + idx, type: 'water', x: wx, hw: hw, level: lvl });
      } else if (surfRoll > 0.72) {
        var sx = x0 + 12 + hash(idx, s + 6) * 22;
        var shw = 5.5 + hash(idx, s + 7) * 4.0;
        var slvl = rawHeight(course, sx) - 0.15;
        flats.push({ id: 's' + idx, type: 'sand', x: sx, hw: shw, level: slvl });
      }

      var flatAt = function (px) {
        for (var f = 0; f < flats.length; f++) {
          if (M.abs(px - flats[f].x) < flats[f].hw + 2.5) return flats[f];
        }
        return null;
      };

      // Ground Trampoline (super bouncy pad!)
      var trRoll = hash(idx, s + 10);
      if (trRoll < 0.52 * course.targetBonus) {
        var tx = x0 + 9 + hash(idx, s + 11) * 30;
        if (!flatAt(tx)) {
          var ty = rawHeight(course, tx) + 0.55;
          trampolines.push({ id: 'tr' + idx, x: tx, y: ty, r: 2.35 });
          // Guiding coin arc right above the trampoline!
          for (var tc = 0; tc < 3; tc++) {
            var a = (tc - 1) * 3.4;
            stars.push({ id: 'tc' + idx + '_' + tc, x: tx + a, y: ty + 3.6 - M.abs(a) * 0.22, value: 2, star: tc === 1 });
          }
        }
      }

      // Friendly TNT Boost Crate!
      var tntRoll = hash(idx, s + 14);
      if (tntRoll < 0.48 * course.targetBonus) {
        var bx = x0 + 16 + hash(idx, s + 15) * 26;
        var fl = flatAt(bx);
        var elevated = hash(idx, s + 16) > 0.58;
        var by = elevated ? rawHeight(course, bx) + 9 + hash(idx, s + 17) * 18 : (fl ? fl.level + 2.2 : rawHeight(course, bx) + 1.05);
        tnts.push({ id: 'tnt' + idx, x: bx, y: by, r: 2.1, floating: elevated });
      }

      // Ground / low-altitude star-coin arc
      var arcX = x0 + 10 + hash(idx, s + 20) * 18;
      var arcY = rawHeight(course, arcX) + 5 + hash(idx, s + 21) * 12;
      for (var c = 0; c < 5; c++) {
        var u = (c - 2) / 2;
        stars.push({
          id: 'c' + idx + '_' + c,
          x: arcX + c * 3.2,
          y: arcY + (1 - u * u) * 3.8,
          value: c === 2 ? 5 : 1,
          star: c === 2
        });
      }

      // Mid-sky Hot-Air Balloons (y = 26..118 m)
      var balCount = hash(idx, s + 25) < 0.78 * course.targetBonus ? 2 : 1;
      for (var bi = 0; bi < balCount; bi++) {
        var blx = x0 + 10 + hash(idx * 3 + bi, s + 26) * 32;
        var bly = (bi === 0 ? 28 : 66) + hash(idx * 3 + bi, s + 27) * 42;
        var colIdx = Math.floor(hash(idx * 3 + bi, s + 28) * 5);
        balloons.push({ id: 'bal' + idx + '_' + bi, x: blx, y: bly, r: 3.6, colorIdx: colIdx });
      }

      // Golden Boost Rings (mid-sky, high-sky & stratosphere!)
      var ringBands = [
        { minY: 22, span: 36 },
        { minY: 78, span: 55 },
        { minY: 160, span: 80 },
        { minY: 265, span: 95 }
      ];
      for (var ri = 0; ri < ringBands.length; ri++) {
        if (hash(idx * 5 + ri, s + 31) < 0.56 * course.targetBonus) {
          var rx = x0 + 8 + hash(idx * 5 + ri, s + 32) * 34;
          var ry = ringBands[ri].minY + hash(idx * 5 + ri, s + 33) * ringBands[ri].span;
          rings.push({ id: 'rng' + idx + '_' + ri, x: rx, y: ry, r: 3.9 });
          // Leading sparkle stars through the ring
          stars.push({ id: 'rs' + idx + '_' + ri + '_a', x: rx - 4.2, y: ry - 0.8, value: 2, star: false });
          stars.push({ id: 'rs' + idx + '_' + ri + '_b', x: rx + 4.2, y: ry + 1.2, value: 5, star: true });
        }
      }

      // High-sky & Outer Space Bouncy UFOs!
      var ufoBands = [
        { minY: 135, span: 75 },
        { minY: 240, span: 90 },
        { minY: 335, span: 120 }
      ];
      for (var ui = 0; ui < ufoBands.length; ui++) {
        if (hash(idx * 7 + ui, s + 41) < 0.62 * course.targetBonus) {
          var ux = x0 + 10 + hash(idx * 7 + ui, s + 42) * 32;
          var uy = ufoBands[ui].minY + hash(idx * 7 + ui, s + 43) * ufoBands[ui].span;
          ufos.push({ id: 'ufo' + idx + '_' + ui, x: ux, y: uy, r: 4.2 });
        }
      }

      // High-altitude & Space Star Clusters
      for (var si = 0; si < 3; si++) {
        var stx = x0 + 12 + hash(idx * 4 + si, s + 51) * 28;
        var sty = 95 + si * 115 + hash(idx * 4 + si, s + 52) * 65;
        for (var k = 0; k < 3; k++) {
          stars.push({
            id: 'hs' + idx + '_' + si + '_' + k,
            x: stx + (k - 1) * 4.5,
            y: sty + (k === 1 ? 2.4 : 0),
            value: k === 1 ? 8 : 3,
            star: true
          });
        }
      }

      // Decorative 3D Scenery for parallax depth (purely deterministic!)
      // Trees on near & far sides of the fairway
      for (var ti = 0; ti < 4; ti++) {
        var trx = x0 + 5 + hash(idx * 7 + ti, s + 60) * 40;
        var flT = flatAt(trx);
        if (!flT) {
          var side = ti % 2 === 0 ? -(4.5 + hash(idx * 7 + ti, s + 61) * 7.5) : (4.2 + hash(idx * 7 + ti, s + 62) * 4.5);
          scenery.push({
            kind: hash(idx * 7 + ti, s + 63) > 0.45 ? 'pine' : 'roundTree',
            x: trx,
            y: rawHeight(course, trx),
            z: side,
            scale: 0.8 + hash(idx * 7 + ti, s + 64) * 0.75
          });
        }
      }
      // Cute course flag every chunk
      if (idx % 2 === 0) {
        var fx = x0 + 24;
        if (!flatAt(fx)) {
          scenery.push({ kind: 'flag', x: fx, y: rawHeight(course, fx), z: -3.4, scale: 1 });
        }
      }
      // Fluffy clouds at y = 32..115
      for (var ci = 0; ci < 3; ci++) {
        scenery.push({
          kind: 'cloud',
          x: x0 + 6 + hash(idx * 5 + ci, s + 70) * 38,
          y: 34 + hash(idx * 5 + ci, s + 71) * 78,
          z: -14 - hash(idx * 5 + ci, s + 72) * 18,
          scale: 0.9 + hash(idx * 5 + ci, s + 73) * 1.1
        });
      }
      // High sky birds / biplanes / blimps (y = 115..205)
      var skyRoll = hash(idx, s + 80);
      if (skyRoll < 0.45) {
        scenery.push({ kind: 'biplane', x: x0 + 20, y: 125 + hash(idx, s + 81) * 65, z: -12 - hash(idx, s + 82) * 10, scale: 1.1 });
      } else if (skyRoll < 0.78) {
        scenery.push({ kind: 'blimp', x: x0 + 24, y: 140 + hash(idx, s + 83) * 55, z: -18 - hash(idx, s + 84) * 10, scale: 1.25 });
      } else {
        scenery.push({ kind: 'bird', x: x0 + 18, y: 105 + hash(idx, s + 85) * 45, z: -8 - hash(idx, s + 86) * 8, scale: 1.0 });
      }
      // Space satellites, asteroids & ringed planets (y = 310..500)
      if (idx % 2 === 1) {
        scenery.push({
          kind: 'satellite',
          x: x0 + 22,
          y: 325 + hash(idx, s + 90) * 110,
          z: -10 - hash(idx, s + 91) * 12,
          scale: 1.0
        });
      }
      if (idx % 3 === 0) {
        scenery.push({
          kind: 'planet',
          x: x0 + 26,
          y: 345 + hash(idx, s + 92) * 130,
          z: -28 - hash(idx, s + 93) * 16,
          scale: 1.1 + hash(idx, s + 94) * 0.9,
          colorIdx: Math.floor(hash(idx, s + 95) * 4)
        });
      }
      for (var ai = 0; ai < 2; ai++) {
        scenery.push({
          kind: 'asteroid',
          x: x0 + 10 + hash(idx * 3 + ai, s + 96) * 32,
          y: 318 + hash(idx * 3 + ai, s + 97) * 140,
          z: -8 - hash(idx * 3 + ai, s + 98) * 14,
          scale: 0.7 + hash(idx * 3 + ai, s + 99) * 0.9
        });
      }
    } else if (idx === 0) {
      // Tee surroundings: inviting sunny meadow trees, starting flag & first coin arc!
      scenery.push({ kind: 'pine', x: -8, y: rawHeight(course, -8), z: -7.5, scale: 1.25 });
      scenery.push({ kind: 'roundTree', x: -3, y: rawHeight(course, -3), z: -10, scale: 1.1 });
      scenery.push({ kind: 'pine', x: 14, y: rawHeight(course, 14), z: -8.5, scale: 1.15 });
      scenery.push({ kind: 'roundTree', x: 26, y: rawHeight(course, 26), z: -9.5, scale: 1.3 });
      scenery.push({ kind: 'flag', x: 38, y: rawHeight(course, 38), z: -3.2, scale: 1 });
      scenery.push({ kind: 'cloud', x: -6, y: 12.5, z: -22, scale: 1.05 });
      scenery.push({ kind: 'cloud', x: 14, y: 13.5, z: -20, scale: 1.25 });
      scenery.push({ kind: 'cloud', x: 36, y: 24, z: -22, scale: 1.1 });
      // Guaranteed first-shot friendly coins & trampoline so first shot feels awesome!
      trampolines.push({ id: 'tr0', x: 38, y: rawHeight(course, 38) + 0.55, r: 2.7 });
      for (var f0 = 0; f0 < 5; f0++) {
        var fu = (f0 - 2) / 2;
        stars.push({ id: 'c0_' + f0, x: 11 + f0 * 4.2, y: 12.2 + (1 - fu * fu) * 4.6, value: f0 === 2 ? 3 : 1, star: f0 === 2 });
      }
      for (var f1 = 0; f1 < 3; f1++) {
        stars.push({ id: 'c0b_' + f1, x: 14 + f1 * 4.5, y: 6.8 + (f1 === 1 ? 2.2 : 0), value: 1, star: false });
      }
      balloons.push({ id: 'bal0_0', x: 24, y: 15.5, r: 3.8, colorIdx: 0 });
      balloons.push({ id: 'bal0_1', x: 44, y: 26, r: 3.8, colorIdx: 1 });
    }

    var chunk = {
      idx: idx,
      flats: flats,
      trampolines: trampolines,
      tnts: tnts,
      balloons: balloons,
      rings: rings,
      ufos: ufos,
      stars: stars,
      scenery: scenery
    };
    course.chunks[idx] = chunk;
    return chunk;
  }

  function heightAt(course, x) {
    var idx = M.floor(x / CHUNK_W);
    var chunk = buildChunk(course, idx);
    for (var i = 0; i < chunk.flats.length; i++) {
      var f = chunk.flats[i];
      var d = M.abs(x - f.x);
      if (d <= f.hw) return f.level;
      if (d < f.hw + 3.0) {
        var t = (d - f.hw) / 3.0;
        var st = t * t * (3 - 2 * t);
        return lerp(f.level, rawHeight(course, x), st);
      }
    }
    return rawHeight(course, x);
  }

  function slopeAt(course, x) {
    return (heightAt(course, x + 0.4) - heightAt(course, x - 0.4)) / 0.8;
  }

  function surfaceAt(course, x) {
    var idx = M.floor(x / CHUNK_W);
    var chunk = buildChunk(course, idx);
    for (var i = 0; i < chunk.flats.length; i++) {
      var f = chunk.flats[i];
      if (M.abs(x - f.x) <= f.hw) return f.type;
    }
    return 'turf';
  }

  function features(course, x0, x1) {
    var c0 = M.max(0, M.floor(x0 / CHUNK_W));
    var c1 = M.max(c0, M.floor(x1 / CHUNK_W));
    var out = { flats: [], trampolines: [], tnts: [], balloons: [], rings: [], ufos: [], stars: [], scenery: [] };
    for (var ci = c0; ci <= c1; ci++) {
      var ch = buildChunk(course, ci);
      var k;
      for (k = 0; k < ch.flats.length; k++) out.flats.push(ch.flats[k]);
      for (k = 0; k < ch.trampolines.length; k++) out.trampolines.push(ch.trampolines[k]);
      for (k = 0; k < ch.tnts.length; k++) out.tnts.push(ch.tnts[k]);
      for (k = 0; k < ch.balloons.length; k++) out.balloons.push(ch.balloons[k]);
      for (k = 0; k < ch.rings.length; k++) out.rings.push(ch.rings[k]);
      for (k = 0; k < ch.ufos.length; k++) out.ufos.push(ch.ufos[k]);
      for (k = 0; k < ch.stars.length; k++) out.stars.push(ch.stars[k]);
      for (k = 0; k < ch.scenery.length; k++) out.scenery.push(ch.scenery[k]);
    }
    return out;
  }

  function gravityAt(y) {
    // Ground 17.5 m/s^2 -> High sky 11.5 -> Outer space 6.8 (floaty & epic, always returns!)
    if (y <= 40) return 17.5;
    if (y >= 320) return 6.8;
    var t = (y - 40) / 280;
    return lerp(17.5, 6.8, t * (2 - t));
  }

  /* --------------------------------------------------------------- ball */
  function launch(course, upgrades, angleDeg, power) {
    var u = normUpgrades(upgrades);
    var ang = clamp(finite(angleDeg, 45), 18, 72);
    var pwr = clamp(finite(power, 0.85), 0.15, 1.0);
    var g = grade(pwr, course);
    var perfectAng = isPerfectAngle(ang);
    var baseSpeed = 24 + u.power * 4.2;
    var pwrFactor = 0.42 + pwr * 0.58;
    var gradeMult = g === 'perfect' ? 1.22 : g === 'great' ? 1.10 : g === 'good' ? 1.0 : 0.86;
    var angMult = perfectAng ? 1.08 : 1.0;
    var speed = baseSpeed * pwrFactor * gradeMult * angMult;
    var rad = ang * DEG2RAD;
    var y0 = heightAt(course, 0) + BALL_R + 0.08;
    var fuelMax = maxFuelOf(u);

    return {
      x: 0,
      y: y0,
      vx: M.cos(rad) * speed,
      vy: M.sin(rad) * speed,
      r: BALL_R,
      spin: 12,
      mode: 'air',
      done: false,
      reason: '',
      time: 0,
      maxX: 0,
      maxY: y0,
      angle: ang,
      power: pwr,
      grade: g,
      perfectAngle: perfectAng,
      fuel: fuelMax,
      maxFuel: fuelMax,
      boosting: false,
      diving: false,
      armed: false,
      armedPerfect: false,
      armTimer: 0,
      bounces: 0,
      supers: 0,
      combo: 0,
      skips: 0,
      coins: 0,
      starsCollected: 0,
      space: false,
      layerIdx: 0,
      hitIds: {},
      coinIds: {},
      milestonesHit: {},
      squash: 0
    };
  }

  // Predicts upcoming ground impact within maxHorizon seconds while descending.
  function predictImpact(course, ball, maxHorizon) {
    if (!ball || ball.done || ball.mode !== 'air' || ball.vy >= -0.5) return null;
    var horizon = finite(maxHorizon, 0.55);
    var x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
    var dt = 1 / 60;
    for (var t = dt; t <= horizon; t += dt) {
      var g = gravityAt(y);
      vy -= g * dt;
      x += vx * dt;
      y += vy * dt;
      var h = heightAt(course, x) + ball.r;
      if (y <= h) {
        return { t: t, x: x, y: h, surface: surfaceAt(course, x), perfect: t <= 0.22 };
      }
    }
    return null;
  }

  // Player invokes Dive / Super-Bounce (via ArrowDown/S, or Space/Click near ground or when fuel empty).
  function pressDive(course, ball) {
    if (!ball || ball.done || ball.mode !== 'air') return { type: 'none' };
    var pred = predictImpact(course, ball, 0.52);
    if (pred && !ball.armed) {
      ball.armed = true;
      ball.armedPerfect = pred.perfect;
      ball.armTimer = 0.55;
      ball.diving = true;
      if (ball.vy > -18) ball.vy -= 6;
      return { type: 'arm', perfect: pred.perfect, x: pred.x, y: pred.y };
    }
    if (!ball.diving) {
      ball.diving = true;
      ball.vy = M.min(ball.vy - 15, -18);
      ball.vx += 3.0;
      ball.armed = true;
      ball.armedPerfect = false;
      ball.armTimer = 0.7;
      return { type: 'dive', x: ball.x, y: ball.y };
    }
    return { type: 'none' };
  }

  function step(course, ball, upgrades, dt, input) {
    if (!ball || ball.done) return [];
    var u = normUpgrades(upgrades);
    var events = [];
    var stepDt = clamp(finite(dt, 1 / 60), 0.001, 0.05);
    var inp = input && typeof input === 'object' ? input : {};
    var wantBoost = !!inp.boost;

    ball.time += stepDt;
    ball.boosting = false;
    if (ball.armTimer > 0) {
      ball.armTimer -= stepDt;
      if (ball.armTimer <= 0) { ball.armed = false; ball.armedPerfect = false; }
    }
    if (ball.squash > 0) ball.squash = M.max(0, ball.squash - stepDt * 4.5);

    if (ball.mode === 'air') {
      // Continuous Rocket Boost while held and fuel remains!
      if (wantBoost && ball.fuel > 0) {
        var burn = M.min(ball.fuel, stepDt);
        ball.fuel = M.max(0, ball.fuel - burn);
        ball.boosting = true;
        ball.diving = false;
        var thrustY = 34 + u.fuel * 3.1;
        var thrustX = 16 + u.fuel * 1.9;
        ball.vy += thrustY * burn;
        ball.vx += thrustX * burn;
        ball.vy = M.min(ball.vy, 68 + u.fuel * 3.2);
        ball.vx = M.min(ball.vx, 98 + u.power * 3.5);
        events.push({ type: 'boost', x: ball.x, y: ball.y, fuel: ball.fuel });
      }

      var grav = gravityAt(ball.y);
      ball.vy -= grav * stepDt;
      // Subtle atmospheric drag (almost zero in outer space!)
      var drag = ball.y > 260 ? 0.008 : lerp(0.055, 0.015, clamp(ball.y / 260, 0, 1));
      ball.vx *= M.max(0.9, 1 - drag * stepDt);
      ball.vy *= M.max(0.9, 1 - drag * 0.65 * stepDt);

      ball.x += ball.vx * stepDt;
      ball.y += ball.vy * stepDt;
      ball.spin = ball.vx * 0.8;

      // Check interactive targets & pickups in nearby chunks
      var f = features(course, ball.x - 14, ball.x + 14);
      var magR = magnetRadius(u);
      var i, o, dx, dy, dist;

      // 1) Coins & Stars (with magnetic pull!)
      for (i = 0; i < f.stars.length; i++) {
        o = f.stars[i];
        if (ball.coinIds[o.id]) continue;
        dx = o.x - ball.x;
        dy = o.y - ball.y;
        dist = M.hypot(dx, dy);
        if (dist <= magR) {
          ball.coinIds[o.id] = true;
          ball.coins += o.value;
          if (o.star) ball.starsCollected++;
          events.push({ type: 'coin', id: o.id, x: o.x, y: o.y, value: o.value, star: !!o.star });
        }
      }

      // 2) Trampolines
      for (i = 0; i < f.trampolines.length; i++) {
        o = f.trampolines[i];
        if (ball.hitIds[o.id]) continue;
        if (M.hypot(ball.x - o.x, ball.y - o.y) <= o.r + ball.r) {
          ball.hitIds[o.id] = true;
          ball.vy = M.max(25 + u.bounce * 1.45, M.abs(ball.vy) * 1.1 + 14);
          ball.vx = M.max(ball.vx * 1.08, ball.vx + 7.5);
          ball.bounces++;
          ball.combo++;
          ball.diving = false;
          ball.armed = false;
          ball.squash = 1;
          events.push({ type: 'trampoline', id: o.id, x: o.x, y: o.y, combo: ball.combo });
        }
      }

      // 3) Friendly TNT Boost Crates
      for (i = 0; i < f.tnts.length; i++) {
        o = f.tnts[i];
        if (ball.hitIds[o.id]) continue;
        if (M.hypot(ball.x - o.x, ball.y - o.y) <= o.r + ball.r) {
          ball.hitIds[o.id] = true;
          ball.vy = M.max(30 + u.power * 1.15, ball.vy + 22);
          ball.vx = M.max(ball.vx * 1.14, ball.vx + 11.5);
          ball.fuel = M.min(ball.maxFuel, ball.fuel + 0.18);
          ball.bounces++;
          ball.combo++;
          ball.diving = false;
          ball.squash = 1;
          events.push({ type: 'tnt', id: o.id, x: o.x, y: o.y, combo: ball.combo });
        }
      }

      // 4) Hot-Air Balloons
      for (i = 0; i < f.balloons.length; i++) {
        o = f.balloons[i];
        if (ball.hitIds[o.id]) continue;
        if (M.hypot(ball.x - o.x, ball.y - o.y) <= o.r + ball.r) {
          ball.hitIds[o.id] = true;
          ball.vy = M.max(26 + u.bounce * 1.2, ball.vy + 17);
          ball.vx = M.max(ball.vx * 1.06, ball.vx + 7.5);
          ball.coins += 4;
          ball.bounces++;
          ball.combo++;
          ball.diving = false;
          ball.squash = 0.85;
          events.push({ type: 'balloon', id: o.id, x: o.x, y: o.y, combo: ball.combo });
        }
      }

      // 5) Golden Boost Rings
      for (i = 0; i < f.rings.length; i++) {
        o = f.rings[i];
        if (ball.hitIds[o.id]) continue;
        if (M.hypot(ball.x - o.x, ball.y - o.y) <= o.r + ball.r) {
          ball.hitIds[o.id] = true;
          ball.vx += 13 + u.fuel * 0.95;
          ball.vy = M.max(ball.vy + 15, 25);
          ball.fuel = M.min(ball.maxFuel, ball.fuel + 0.30);
          ball.coins += 6;
          ball.combo++;
          ball.diving = false;
          events.push({ type: 'ring', id: o.id, x: o.x, y: o.y, combo: ball.combo });
        }
      }

      // 6) Bouncy UFOs
      for (i = 0; i < f.ufos.length; i++) {
        o = f.ufos[i];
        if (ball.hitIds[o.id]) continue;
        if (M.hypot(ball.x - o.x, ball.y - o.y) <= o.r + ball.r) {
          ball.hitIds[o.id] = true;
          ball.vy = M.max(33 + u.bounce * 1.35, ball.vy + 22);
          ball.vx += 12.5 + u.power * 0.5;
          ball.fuel = M.min(ball.maxFuel, ball.fuel + 0.35);
          ball.coins += 10;
          ball.bounces++;
          ball.combo++;
          ball.diving = false;
          ball.squash = 1;
          events.push({ type: 'ufo', id: o.id, x: o.x, y: o.y, combo: ball.combo });
        }
      }

      // Ground / Water / Sand collision
      var groundY = heightAt(course, ball.x) + ball.r;
      if (ball.y <= groundY) {
        ball.y = groundY;
        var surf = surfaceAt(course, ball.x);
        var impactVy = M.abs(ball.vy);

        if (surf === 'water') {
          var skipMinVx = 9.5 - u.bounce * 0.5;
          var maxSkips = 3 + M.floor(u.bounce / 2);
          if ((ball.vx >= skipMinVx || ball.armed) && ball.skips < maxSkips) {
            ball.skips++;
            ball.bounces++;
            var superW = ball.armed;
            ball.vy = M.max(superW ? 18 : 11.5, impactVy * (superW ? 0.85 : 0.62) + (superW ? 8 : 5));
            ball.vx *= superW ? 0.96 : 0.88;
            if (superW) { ball.supers++; ball.combo++; }
            ball.armed = false; ball.armedPerfect = false; ball.diving = false;
            ball.squash = 0.8;
            events.push({ type: 'skip', x: ball.x, y: ball.y, superBounce: superW });
          } else {
            ball.vx = 0; ball.vy = 0; ball.done = true; ball.reason = 'water';
            events.push({ type: 'splash', x: ball.x, y: ball.y });
            events.push({ type: 'stop', x: ball.x, y: ball.y, reason: 'water' });
          }
        } else {
          var isSand = surf === 'sand';
          var restit = isSand ? (0.40 + u.bounce * 0.024) : M.min(0.84, 0.58 + u.bounce * 0.026);
          if (ball.armed) {
            var mult = ball.armedPerfect ? 1.55 : 1.32;
            ball.vy = M.max(17 + u.bounce * 0.9, impactVy * restit * mult + 6);
            ball.vx = M.max(ball.vx * 1.05, ball.vx + (ball.armedPerfect ? 6.5 : 3.5));
            ball.bounces++;
            ball.supers++;
            ball.combo++;
            var wasPerfect = ball.armedPerfect;
            ball.armed = false; ball.armedPerfect = false; ball.diving = false;
            ball.squash = 1;
            events.push({ type: 'super', x: ball.x, y: ball.y, perfect: wasPerfect, combo: ball.combo });
          } else if (impactVy > (isSand ? 4.2 : 2.8)) {
            var sl = slopeAt(course, ball.x);
            ball.vy = impactVy * restit;
            ball.vx = ball.vx * (isSand ? 0.78 : 0.90) - sl * 2.5;
            if (ball.vx < 0) ball.vx = 0;
            ball.bounces++;
            ball.combo = 0;
            ball.diving = false;
            ball.squash = clamp(impactVy / 28, 0.2, 0.9);
            events.push({ type: 'bounce', x: ball.x, y: ball.y, surface: surf, impact: impactVy });
          } else {
            ball.mode = 'roll';
            ball.vy = 0;
            ball.diving = false;
            ball.combo = 0;
            events.push({ type: 'land', x: ball.x, y: ball.y, surface: surf });
          }
        }
      }
    } else if (ball.mode === 'roll') {
      var rSurf = surfaceAt(course, ball.x);
      var rSlope = slopeAt(course, ball.x);
      if (rSurf === 'water') {
        if (ball.vx >= 10 - u.bounce * 0.5 && ball.skips < 3 + M.floor(u.bounce / 2)) {
          ball.mode = 'air';
          ball.skips++;
          ball.vy = 11.5;
          ball.vx *= 0.88;
          events.push({ type: 'skip', x: ball.x, y: ball.y, superBounce: false });
        } else {
          ball.vx = 0; ball.vy = 0; ball.done = true; ball.reason = 'water';
          events.push({ type: 'splash', x: ball.x, y: ball.y });
          events.push({ type: 'stop', x: ball.x, y: ball.y, reason: 'water' });
        }
      } else {
        var fric = rSurf === 'sand' ? 9.5 : M.max(2.6, 5.2 - u.bounce * 0.22);
        ball.vx -= (fric + rSlope * 10) * stepDt;
        ball.x += M.max(0, ball.vx) * stepDt;
        ball.y = heightAt(course, ball.x) + ball.r;
        ball.spin = ball.vx * 1.4;
        // Collect ground coins along roll too
        var rf = features(course, ball.x - 10, ball.x + 10);
        var rMag = magnetRadius(u);
        for (var ri2 = 0; ri2 < rf.stars.length; ri2++) {
          var ro = rf.stars[ri2];
          if (!ball.coinIds[ro.id] && M.hypot(ro.x - ball.x, ro.y - ball.y) <= rMag) {
            ball.coinIds[ro.id] = true;
            ball.coins += ro.value;
            if (ro.star) ball.starsCollected++;
            events.push({ type: 'coin', id: ro.id, x: ro.x, y: ro.y, value: ro.value, star: !!ro.star });
          }
        }
        // Check trampolines & TNT even while rolling!
        for (var rt = 0; rt < rf.trampolines.length; rt++) {
          var tr = rf.trampolines[rt];
          if (!ball.hitIds[tr.id] && M.hypot(ball.x - tr.x, ball.y - tr.y) <= tr.r + ball.r) {
            ball.hitIds[tr.id] = true;
            ball.mode = 'air';
            ball.vy = 24 + u.bounce * 1.4;
            ball.vx = M.max(ball.vx + 8, 18);
            ball.bounces++;
            events.push({ type: 'trampoline', id: tr.id, x: tr.x, y: tr.y, combo: 1 });
          }
        }
        if (ball.vx <= 0.35 && ball.mode === 'roll') {
          ball.vx = 0; ball.vy = 0; ball.done = true; ball.reason = 'rest';
          events.push({ type: 'stop', x: ball.x, y: ball.y, reason: 'rest' });
        }
      }
    }

    // Track peaks, altitude layer & milestone crossings
    if (ball.x > ball.maxX) ball.maxX = ball.x;
    if (ball.y > ball.maxY) ball.maxY = ball.y;
    var li = layerIndexAt(ball.y);
    if (li > ball.layerIdx) {
      ball.layerIdx = li;
      if (li === LAYERS.length - 1) ball.space = true;
      events.push({ type: 'layer', index: li, layer: LAYERS[li] });
    }
    for (var mi = 0; mi < MILESTONES.length; mi++) {
      var ms = MILESTONES[mi];
      if (!ball.milestonesHit[ms.id] && ball.maxX >= ms.dist) {
        ball.milestonesHit[ms.id] = true;
        events.push({ type: 'milestone', milestone: ms });
      }
    }

    // Hard safety cap so every shot is guaranteed to terminate!
    if (!ball.done && ball.time >= MAX_TIME) {
      ball.y = M.max(ball.y, heightAt(course, ball.x) + ball.r);
      ball.vx = 0; ball.vy = 0; ball.done = true; ball.reason = 'timeout';
      events.push({ type: 'stop', x: ball.x, y: ball.y, reason: 'timeout' });
    }

    return events;
  }

  function reward(ball, upgrades, prevMilestones) {
    var u = normUpgrades(upgrades);
    var dist = M.floor(finite(ball && ball.maxX, 0));
    var alt = M.floor(finite(ball && ball.maxY, 0));
    var distCoins = M.max(3, M.floor(dist * 0.16));
    var altCoins = M.floor(alt * 0.24);
    var bounceCoins = (ball && ball.bounces ? ball.bounces * 2 : 0) + (ball && ball.supers ? ball.supers * 5 : 0);
    var pickupCoins = ball && ball.coins ? ball.coins : 0;
    var sub = distCoins + altCoins + bounceCoins + pickupCoins;
    var luckyBonus = M.floor(sub * u.magnet * 0.08);
    var prev = {};
    if (Array.isArray(prevMilestones)) {
      for (var i = 0; i < prevMilestones.length; i++) prev[prevMilestones[i]] = true;
    }
    var newMilestones = [];
    var milestoneBonus = 0;
    for (var j = 0; j < MILESTONES.length; j++) {
      var m = MILESTONES[j];
      if (dist >= m.dist && !prev[m.id]) {
        newMilestones.push(m);
        milestoneBonus += m.bonus;
      }
    }
    var stars = 1;
    if (dist >= 420 || alt >= 115) stars = 2;
    if (dist >= 1000 || alt >= 310 || (ball && ball.space)) stars = 3;
    return {
      dist: dist,
      alt: alt,
      distCoins: distCoins,
      altCoins: altCoins,
      bounceCoins: bounceCoins,
      pickupCoins: pickupCoins,
      luckyBonus: luckyBonus,
      milestoneBonus: milestoneBonus,
      newMilestones: newMilestones,
      total: sub + luckyBonus + milestoneBonus,
      stars: stars
    };
  }

  var GolfPhysics = {
    BALL_R: BALL_R,
    CHUNK_W: CHUNK_W,
    MAX_TIME: MAX_TIME,
    SAVE_VERSION: SAVE_VERSION,
    LAYERS: LAYERS,
    MILESTONES: MILESTONES,
    UPGRADES: UPGRADES,
    SKINS: SKINS,
    clamp: clamp,
    lerp: lerp,
    hash: hash,
    normUpgrades: normUpgrades,
    upgradeCost: upgradeCost,
    sanitizeSave: sanitizeSave,
    aimAngle: aimAngle,
    isPerfectAngle: isPerfectAngle,
    powerValue: powerValue,
    perfectBand: perfectBand,
    grade: grade,
    layerAt: layerAt,
    layerIndexAt: layerIndexAt,
    magnetRadius: magnetRadius,
    maxFuelOf: maxFuelOf,
    createCourse: createCourse,
    heightAt: heightAt,
    slopeAt: slopeAt,
    surfaceAt: surfaceAt,
    features: features,
    gravityAt: gravityAt,
    launch: launch,
    predictImpact: predictImpact,
    pressDive: pressDive,
    step: step,
    reward: reward
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GolfPhysics;
  if (typeof root !== 'undefined') root.GolfPhysics = GolfPhysics;
})(typeof window !== 'undefined' ? window : globalThis);
