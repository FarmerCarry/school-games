/* Desk Karts 3D (سباق المكاتب) — Pure deterministic micro-kart racing engine.
 * UMD export (module.exports in Node, window.DeskKartsEngine in browser).
 * Zero DOM, zero timers, zero Math.random, zero external runtime dependencies. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeskKartsEngine = factory();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var LAPS = 3;
  var KART_R = 1.18;
  var KART_W = 2.1;
  var KART_L = 3.1;
  var FIXED_DT = 1 / 60;
  var SAMPLES = 220;

  var MAX_SPEED = 27.5;
  var BOOST_SPEED = 39.0;
  var ACCEL = 38.0;
  var BRAKE_DECEL = 42.0;
  var REVERSE_MAX = -9.5;
  var DRAG = 1.32;
  var STEER_RATE = 2.65;
  var DRIFT_STEER = 3.25;
  var GRAVITY = 28.0;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function wrapS(len, s) {
    s = s % len;
    return s < 0 ? s + len : s;
  }
  function wrapDelta(ds, len) {
    if (ds > len * 0.5) ds -= len;
    if (ds < -len * 0.5) ds += len;
    return ds;
  }

  function makeRng(seed) {
    var s = (seed >>> 0) || 1337;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* --------------------------------------------------------------- Catalogs */
  var CUPS = [
    { id: 0, name: 'كأس الفصل الأول', accent: '#ff9f1c' },
    { id: 1, name: 'كأس الأبطال', accent: '#7c4dff' }
  ];

  var ITEMS = {
    rocket: { id: 'rocket', name: 'صاروخ التيربو', icon: '🚀', color: 0xff5a36 },
    shield: { id: 'shield', name: 'درع المطاط', icon: '🛡️', color: 0x38e890 },
    ink:    { id: 'ink',    name: 'بقعة حبر', icon: '💧', color: 0x4b38b3 }
  };

  var BODIES = [
    { id: 0, name: 'الممحاة السريعة', cost: 0,   tag: 'classic' },
    { id: 1, name: 'صاروخ القلم',    cost: 60,  tag: 'rocket' },
    { id: 2, name: 'باص المدرسة',    cost: 110, tag: 'bus' },
    { id: 3, name: 'البطل الخارق',   cost: 170, tag: 'buggy' }
  ];

  var PAINTS = [
    { id: 0, name: 'أحمر ناري',     cost: 0,  hex: 0xff4252, css: '#ff4252', trim: 0xffd54f },
    { id: 1, name: 'أزرق سماوي',    cost: 0,  hex: 0x22a7ff, css: '#22a7ff', trim: 0xffffff },
    { id: 2, name: 'أصفر ذهبي',     cost: 35, hex: 0xffc400, css: '#ffc400', trim: 0x2a314a },
    { id: 3, name: 'أخضر نيون',     cost: 50, hex: 0x28d96c, css: '#28d96c', trim: 0xfff176 },
    { id: 4, name: 'بنفسجي ملكي',   cost: 75, hex: 0x9b51ff, css: '#9b51ff', trim: 0x64ffda },
    { id: 5, name: 'برتقالي تيربو', cost: 95, hex: 0xff7722, css: '#ff7722', trim: 0xfff59d }
  ];

  var RACER_NAMES = ['أنت', 'اللاعب 2', 'زيكو', 'ميمي', 'بومبو'];
  var BOT_PRESETS = [
    { name: 'زيكو',  body: 1, hex: 0xffc400, trim: 0x2a314a, helmet: 0x22a7ff },
    { name: 'ميمي',  body: 2, hex: 0x28d96c, trim: 0xffffff, helmet: 0xff6b9d },
    { name: 'بومبو', body: 3, hex: 0x9b51ff, trim: 0xffd54f, helmet: 0xff9f1c }
  ];

  /* --------------------------------------------------------------- 6 Handcrafted Circuits */
  // Control points flow counter-clockwise around the desk; start at bottom straight heading +X.
  var TRACKS = [
    {
      id: '1-1', cup: 0, name: 'مكتب الحساب', theme: 'math', hw: 6.2,
      deskColor: 0xd99b58, matColor: 0xfcf8ec, roadColor: 0x4b648c, curbA: 0xff5252, curbB: 0xffffff,
      skyColor: 0x8ad6ff,
      pts: [
        [-22, 22], [0, 22], [22, 22], [38, 14], [38, -8],
        [24, -22], [4, -18], [-16, -22], [-36, -14], [-38, 8]
      ],
      boosts: [0.11, 0.56],
      ramps: [0.34],
      erasers: [
        { u: 0.25, off: -3.2 },
        { u: 0.76, off: 3.1 }
      ],
      inks: [
        { u: 0.64, off: -2.4, r: 2.3 }
      ],
      itemRows: [0.19, 0.48, 0.82],
      coinLines: [
        { u: 0.08, count: 4, off: 0 },
        { u: 0.34, count: 3, off: 0 },
        { u: 0.54, count: 4, off: 1.5 },
        { u: 0.86, count: 4, off: -1.2 }
      ]
    },
    {
      id: '1-2', cup: 0, name: 'طاولة الرسم', theme: 'art', hw: 6.0,
      deskColor: 0xe5b071, matColor: 0x2eb88c, roadColor: 0x269e78, curbA: 0xffca28, curbB: 0xffffff,
      skyColor: 0x9ae2ff,
      pts: [
        [-24, 24], [2, 24], [28, 22], [42, 8], [38, -14],
        [20, -24], [2, -10], [-16, -24], [-36, -18], [-42, 2], [-38, 17]
      ],
      boosts: [0.09, 0.42, 0.74],
      ramps: [0.27, 0.63],
      erasers: [
        { u: 0.20, off: 3.0 },
        { u: 0.52, off: -3.0 },
        { u: 0.84, off: 2.8 }
      ],
      inks: [
        { u: 0.36, off: -2.2, r: 2.3 },
        { u: 0.70, off: 2.3, r: 2.3 }
      ],
      itemRows: [0.16, 0.48, 0.79],
      coinLines: [
        { u: 0.07, count: 4, off: 0 },
        { u: 0.27, count: 3, off: 0 },
        { u: 0.63, count: 3, off: 0 },
        { u: 0.88, count: 4, off: -1.4 }
      ]
    },
    {
      id: '1-3', cup: 0, name: 'منضدة العلوم', theme: 'science', hw: 5.8,
      deskColor: 0xd6cfc2, matColor: 0x2f7ec4, roadColor: 0x286fae, curbA: 0x4de6b8, curbB: 0xffffff,
      skyColor: 0x99dcff,
      pts: [
        [-26, 25], [2, 25], [30, 24], [46, 12], [44, -10],
        [26, -24], [8, -12], [-8, -26], [-32, -24], [-46, -8], [-42, 16]
      ],
      boosts: [0.10, 0.38, 0.68],
      ramps: [0.24, 0.58],
      erasers: [
        { u: 0.18, off: -2.9 },
        { u: 0.49, off: 2.8 },
        { u: 0.81, off: -2.9 }
      ],
      inks: [
        { u: 0.31, off: 2.2, r: 2.4 },
        { u: 0.64, off: -2.1, r: 2.3 },
        { u: 0.88, off: 2.0, r: 2.2 }
      ],
      itemRows: [0.15, 0.45, 0.76],
      coinLines: [
        { u: 0.06, count: 4, off: 0 },
        { u: 0.24, count: 3, off: 0 },
        { u: 0.58, count: 3, off: 0 },
        { u: 0.72, count: 4, off: 1.5 }
      ]
    },
    {
      id: '2-1', cup: 1, name: 'أبراج المكتبة', theme: 'library', hw: 5.7,
      deskColor: 0xb57442, matColor: 0xf9eed5, roadColor: 0x7c4f35, curbA: 0xff5252, curbB: 0xfff8e1,
      skyColor: 0xffd59e,
      pts: [
        [-28, 26], [0, 26], [30, 26], [48, 14], [46, -10],
        [30, -26], [12, -22], [0, -6], [-14, -24], [-36, -22], [-48, -4], [-44, 18]
      ],
      boosts: [0.08, 0.32, 0.57, 0.84],
      ramps: [0.22, 0.67],
      erasers: [
        { u: 0.16, off: 2.8 },
        { u: 0.44, off: -2.7 },
        { u: 0.60, off: 2.8 },
        { u: 0.89, off: -2.6 }
      ],
      inks: [
        { u: 0.28, off: -2.1, r: 2.3 },
        { u: 0.52, off: 2.1, r: 2.3 },
        { u: 0.76, off: -2.0, r: 2.4 }
      ],
      itemRows: [0.14, 0.40, 0.72],
      coinLines: [
        { u: 0.06, count: 4, off: 0 },
        { u: 0.22, count: 3, off: 0 },
        { u: 0.48, count: 4, off: -1.5 },
        { u: 0.67, count: 3, off: 0 }
      ]
    },
    {
      id: '2-2', cup: 1, name: 'حلبة الهندسة', theme: 'geometry', hw: 5.6,
      deskColor: 0xdca563, matColor: 0x265fb8, roadColor: 0x2052a3, curbA: 0xffd600, curbB: 0xffffff,
      skyColor: 0x89ceff,
      pts: [
        [-30, 26], [0, 26], [32, 26], [50, 14], [48, -10],
        [32, -26], [12, -14], [-6, -28], [-30, -24], [-48, -12], [-48, 12], [-40, 23]
      ],
      boosts: [0.09, 0.34, 0.60, 0.86],
      ramps: [0.21, 0.50, 0.75],
      erasers: [
        { u: 0.15, off: -2.7 },
        { u: 0.41, off: 2.8 },
        { u: 0.66, off: -2.7 },
        { u: 0.90, off: 2.6 }
      ],
      inks: [
        { u: 0.28, off: 2.0, r: 2.3 },
        { u: 0.55, off: -2.0, r: 2.3 },
        { u: 0.80, off: 2.1, r: 2.3 }
      ],
      itemRows: [0.13, 0.44, 0.70],
      coinLines: [
        { u: 0.06, count: 4, off: 0 },
        { u: 0.21, count: 3, off: 0 },
        { u: 0.50, count: 3, off: 0 },
        { u: 0.75, count: 3, off: 0 }
      ]
    },
    {
      id: '2-3', cup: 1, name: 'مكتب المدير العملاق', theme: 'principal', hw: 5.6,
      deskColor: 0x8f4e2a, matColor: 0x1e7d53, roadColor: 0x1a6b47, curbA: 0xffd54f, curbB: 0xffffff,
      skyColor: 0xffcf96,
      pts: [
        [-34, 28], [0, 28], [34, 28], [54, 16], [54, -10],
        [38, -28], [18, -14], [0, -28], [-22, -26], [-44, -22], [-54, -4], [-48, 18]
      ],
      boosts: [0.08, 0.30, 0.54, 0.76, 0.92],
      ramps: [0.20, 0.46, 0.68],
      erasers: [
        { u: 0.14, off: 2.8 },
        { u: 0.38, off: -2.8 },
        { u: 0.61, off: 2.7 },
        { u: 0.84, off: -2.7 }
      ],
      inks: [
        { u: 0.25, off: -2.1, r: 2.4 },
        { u: 0.50, off: 2.1, r: 2.4 },
        { u: 0.72, off: -2.0, r: 2.4 },
        { u: 0.88, off: 2.0, r: 2.2 }
      ],
      itemRows: [0.12, 0.35, 0.60, 0.82],
      coinLines: [
        { u: 0.06, count: 4, off: 0 },
        { u: 0.20, count: 3, off: 0 },
        { u: 0.46, count: 3, off: 0 },
        { u: 0.68, count: 3, off: 0 },
        { u: 0.91, count: 4, off: 0 }
      ]
    }
  ];

  /* --------------------------------------------------------------- Spline Track Builder */
  function catmullRom(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  var builtCache = [];

  function buildTrack(index) {
    index = clamp(index | 0, 0, TRACKS.length - 1);
    if (builtCache[index]) return builtCache[index];

    var def = TRACKS[index];
    var pts = def.pts;
    var m = pts.length;

    // Dense raw sampling first for uniform arc-length resampling
    var rawN = m * 36;
    var rx = new Float64Array(rawN);
    var rz = new Float64Array(rawN);
    var rc = new Float64Array(rawN + 1);
    for (var i = 0; i < rawN; i++) {
      var u = (i / rawN) * m;
      var seg = Math.floor(u) % m;
      var lt = u - Math.floor(u);
      var p0 = pts[(seg - 1 + m) % m];
      var p1 = pts[seg];
      var p2 = pts[(seg + 1) % m];
      var p3 = pts[(seg + 2) % m];
      rx[i] = catmullRom(p0[0], p1[0], p2[0], p3[0], lt);
      rz[i] = catmullRom(p0[1], p1[1], p2[1], p3[1], lt);
    }
    var totalLen = 0;
    rc[0] = 0;
    for (i = 0; i < rawN; i++) {
      var j = (i + 1) % rawN;
      totalLen += Math.hypot(rx[j] - rx[i], rz[j] - rz[i]);
      rc[i + 1] = totalLen;
    }

    // Resample to SAMPLES evenly spaced points
    var samples = [];
    var k = 0;
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (i = 0; i < SAMPLES; i++) {
      var targetS = (i / SAMPLES) * totalLen;
      while (k < rawN - 1 && rc[k + 1] < targetS) k++;
      var segLen = Math.max(1e-6, rc[k + 1] - rc[k]);
      var f = (targetS - rc[k]) / segLen;
      var k2 = (k + 1) % rawN;
      var x = lerp(rx[k], rx[k2], f);
      var z = lerp(rz[k], rz[k2], f);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      samples.push({ x: x, z: z, s: targetS, tx: 1, tz: 0, nx: 0, nz: 1, curv: 0 });
    }

    // Tangents, right-hand normals, and curvature
    for (i = 0; i < SAMPLES; i++) {
      var prev = samples[(i - 1 + SAMPLES) % SAMPLES];
      var next = samples[(i + 1) % SAMPLES];
      var dx = next.x - prev.x, dz = next.z - prev.z;
      var d = Math.hypot(dx, dz) || 1;
      samples[i].tx = dx / d;
      samples[i].tz = dz / d;
      // Right-hand normal when moving along (tx, tz) in XZ plane (+x right, +z down/south)
      samples[i].nx = -samples[i].tz;
      samples[i].nz = samples[i].tx;
    }
    for (i = 0; i < SAMPLES; i++) {
      var pA = samples[(i - 2 + SAMPLES) % SAMPLES];
      var pB = samples[(i + 2) % SAMPLES];
      var a1 = Math.atan2(pA.tz, pA.tx);
      var a2 = Math.atan2(pB.tz, pB.tx);
      samples[i].curv = wrapAngle(a2 - a1);
    }

    var L = {
      index: index,
      id: def.id,
      cup: def.cup,
      name: def.name,
      theme: def.theme,
      hw: def.hw,
      deskColor: def.deskColor,
      matColor: def.matColor,
      roadColor: def.roadColor,
      curbA: def.curbA,
      curbB: def.curbB,
      skyColor: def.skyColor,
      len: totalLen,
      stepS: totalLen / SAMPLES,
      samples: samples,
      bounds: { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ },
      boosts: [],
      ramps: [],
      erasers: [],
      inks: [],
      itemSpawns: [],
      coinSpawns: []
    };

    // Place track features cleanly along spline
    for (i = 0; i < def.boosts.length; i++) {
      var bs = def.boosts[i] * totalLen;
      var bp = sampleAt(L, bs);
      L.boosts.push({ s: bs, off: 0, x: bp.x, z: bp.z, tx: bp.tx, tz: bp.tz, ang: Math.atan2(bp.tz, bp.tx), r: 2.3 });
    }
    for (i = 0; i < def.ramps.length; i++) {
      var rs = def.ramps[i] * totalLen;
      var rp = sampleAt(L, rs);
      L.ramps.push({ s: rs, off: 0, x: rp.x, z: rp.z, tx: rp.tx, tz: rp.tz, ang: Math.atan2(rp.tz, rp.tx), halfLen: 2.8, halfW: def.hw * 0.56 });
    }
    for (i = 0; i < def.erasers.length; i++) {
      var er = def.erasers[i];
      var es = er.u * totalLen;
      var ep = sampleAt(L, es);
      var ex = ep.x + ep.nx * er.off;
      var ez = ep.z + ep.nz * er.off;
      L.erasers.push({ s: es, off: er.off, x: ex, z: ez, ang: Math.atan2(ep.tz, ep.tx) + 0.35, r: 1.45 });
    }
    for (i = 0; i < def.inks.length; i++) {
      var ik = def.inks[i];
      var is = ik.u * totalLen;
      var ip = sampleAt(L, is);
      L.inks.push({ s: is, off: ik.off, x: ip.x + ip.nx * ik.off, z: ip.z + ip.nz * ik.off, r: ik.r });
    }
    for (i = 0; i < def.itemRows.length; i++) {
      var is2 = def.itemRows[i] * totalLen;
      var ip2 = sampleAt(L, is2);
      var offsets = [-def.hw * 0.48, 0, def.hw * 0.48];
      for (var c = 0; c < offsets.length; c++) {
        L.itemSpawns.push({
          s: is2, off: offsets[c],
          x: ip2.x + ip2.nx * offsets[c],
          z: ip2.z + ip2.nz * offsets[c]
        });
      }
    }
    for (i = 0; i < def.coinLines.length; i++) {
      var cl = def.coinLines[i];
      for (var n = 0; n < cl.count; n++) {
        var cs = wrapS(totalLen, cl.u * totalLen + (n - (cl.count - 1) * 0.5) * 3.2);
        var cp = sampleAt(L, cs);
        L.coinSpawns.push({
          s: cs, off: cl.off,
          x: cp.x + cp.nx * cl.off,
          z: cp.z + cp.nz * cl.off
        });
      }
    }

    builtCache[index] = L;
    return L;
  }

  function sampleAt(L, s) {
    s = wrapS(L.len, s);
    var fi = (s / L.len) * SAMPLES;
    var i0 = Math.floor(fi) % SAMPLES;
    var i1 = (i0 + 1) % SAMPLES;
    var f = fi - Math.floor(fi);
    var a = L.samples[i0], b = L.samples[i1];
    var tx = lerp(a.tx, b.tx, f), tz = lerp(a.tz, b.tz, f);
    var td = Math.hypot(tx, tz) || 1;
    tx /= td; tz /= td;
    return {
      x: lerp(a.x, b.x, f),
      z: lerp(a.z, b.z, f),
      tx: tx, tz: tz,
      nx: -tz, nz: tx,
      curv: lerp(a.curv, b.curv, f),
      idx: i0,
      s: s
    };
  }

  function projectPoint(L, x, z, hintIdx) {
    var samples = L.samples;
    var bestIdx = 0;
    var bestD2 = Infinity;
    var i, d2, dx, dz;

    if (hintIdx != null && hintIdx >= 0 && hintIdx < SAMPLES) {
      var win = 24;
      for (var w = -win; w <= win; w++) {
        i = (hintIdx + w + SAMPLES) % SAMPLES;
        dx = x - samples[i].x;
        dz = z - samples[i].z;
        d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
      }
    }
    if (bestD2 > (L.hw * 1.9) * (L.hw * 1.9)) {
      for (i = 0; i < SAMPLES; i++) {
        dx = x - samples[i].x;
        dz = z - samples[i].z;
        d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
      }
    }

    var p = samples[bestIdx];
    dx = x - p.x;
    dz = z - p.z;
    var along = dx * p.tx + dz * p.tz;
    var s = wrapS(L.len, p.s + along);
    var sp = sampleAt(L, s);
    var off = (x - sp.x) * sp.nx + (z - sp.z) * sp.nz;
    return {
      idx: bestIdx,
      s: s,
      off: off,
      cx: sp.x, cz: sp.z,
      tx: sp.tx, tz: sp.tz,
      nx: sp.nx, nz: sp.nz,
      curv: sp.curv
    };
  }

  /* --------------------------------------------------------------- Save Management */
  function freshSave() {
    var tracks = [];
    for (var i = 0; i < TRACKS.length; i++) {
      tracks.push({ stars: 0, bestScore: 0, bestTime: 0, bestPlace: 0 });
    }
    return {
      v: 3,
      coins: 0,
      bestScore: 0,
      body: 0,
      paint: 0,
      bodies: [1, 0, 0, 0],
      paints: [1, 1, 0, 0, 0, 0],
      tracks: tracks
    };
  }

  function loadSave(raw) {
    var base = freshSave();
    if (!raw || typeof raw !== 'object' || raw.v !== 3) return base;
    base.coins = clamp(raw.coins | 0, 0, 999999);
    base.bestScore = clamp(raw.bestScore | 0, 0, 999999);
    if (Array.isArray(raw.bodies)) {
      for (var i = 0; i < BODIES.length; i++) base.bodies[i] = (i === 0 || raw.bodies[i]) ? 1 : 0;
    }
    if (Array.isArray(raw.paints)) {
      for (var j = 0; j < PAINTS.length; j++) base.paints[j] = (j < 2 || raw.paints[j]) ? 1 : 0;
    }
    base.body = (raw.body >= 0 && raw.body < BODIES.length && base.bodies[raw.body]) ? (raw.body | 0) : 0;
    base.paint = (raw.paint >= 0 && raw.paint < PAINTS.length && base.paints[raw.paint]) ? (raw.paint | 0) : 0;
    if (Array.isArray(raw.tracks)) {
      for (var k = 0; k < TRACKS.length; k++) {
        var tr = raw.tracks[k];
        if (!tr || typeof tr !== 'object') continue;
        base.tracks[k] = {
          stars: clamp(tr.stars | 0, 0, 3),
          bestScore: clamp(tr.bestScore | 0, 0, 999999),
          bestTime: (typeof tr.bestTime === 'number' && tr.bestTime > 0 && tr.bestTime < 9999) ? Math.round(tr.bestTime * 100) / 100 : 0,
          bestPlace: clamp(tr.bestPlace | 0, 0, 4)
        };
      }
    }
    return base;
  }

  function totalStars(save) {
    var n = 0;
    if (!save || !Array.isArray(save.tracks)) return 0;
    for (var i = 0; i < save.tracks.length; i++) n += clamp((save.tracks[i] && save.tracks[i].stars) | 0, 0, 3);
    return n;
  }

  function buyBody(save, idx) {
    if (idx < 0 || idx >= BODIES.length) return false;
    if (save.bodies[idx]) { save.body = idx; return true; }
    if (save.coins < BODIES[idx].cost) return false;
    save.coins -= BODIES[idx].cost;
    save.bodies[idx] = 1;
    save.body = idx;
    return true;
  }

  function buyPaint(save, idx) {
    if (idx < 0 || idx >= PAINTS.length) return false;
    if (save.paints[idx]) { save.paint = idx; return true; }
    if (save.coins < PAINTS[idx].cost) return false;
    save.coins -= PAINTS[idx].cost;
    save.paints[idx] = 1;
    save.paint = idx;
    return true;
  }

  function applyResult(save, trackIndex, summary) {
    var tr = save.tracks[trackIndex];
    var prevBest = save.bestScore;
    var prevTrackBest = tr.bestScore;
    save.coins = clamp((save.coins | 0) + (summary.coinsEarned | 0), 0, 999999);
    if (summary.stars > tr.stars) tr.stars = summary.stars;
    if (summary.score > tr.bestScore) tr.bestScore = summary.score;
    if (summary.time > 0 && (tr.bestTime === 0 || summary.time < tr.bestTime)) {
      tr.bestTime = Math.round(summary.time * 100) / 100;
    }
    if (summary.place > 0 && (tr.bestPlace === 0 || summary.place < tr.bestPlace)) {
      tr.bestPlace = summary.place;
    }
    if (summary.score > save.bestScore) save.bestScore = summary.score;
    return {
      newBest: summary.score > prevBest && summary.score > 0,
      newTrackBest: summary.score > prevTrackBest && summary.score > 0
    };
  }

  /* --------------------------------------------------------------- World Creation */
  function create(opts) {
    opts = opts || {};
    var trackIdx = clamp(opts.track | 0, 0, TRACKS.length - 1);
    var L = buildTrack(trackIdx);
    var duo = !!opts.duo;
    var demo = !!opts.demo;
    var aiSkill = clamp(opts.aiSkill == null ? 0.35 : opts.aiSkill, 0, 1);
    var rng = makeRng(opts.seed || (trackIdx * 7919 + 101));

    var p1Body = clamp(opts.body | 0, 0, BODIES.length - 1);
    var p1PaintIdx = clamp(opts.paint | 0, 0, PAINTS.length - 1);
    var p1Paint = PAINTS[p1PaintIdx];
    var p2Paint = PAINTS[(p1PaintIdx + 1) % PAINTS.length];

    // Starting grid: staggered front-to-back near s = len - 3.5 so nobody sits directly behind P1.
    var grid = [
      { ds: -2.4, off: -2.3 }, // P1 front-left
      { ds: -2.4, off:  2.3 }, // P2 or Bot 1 front-right
      { ds: -6.4, off: -2.3 }, // Bot 2
      { ds: -6.4, off:  2.3 }  // Bot 3
    ];

    var karts = [];
    for (var i = 0; i < 4; i++) {
      var isHuman = !demo && (i === 0 || (duo && i === 1));
      var g = grid[i];
      var gs = wrapS(L.len, L.len + g.ds);
      var sp = sampleAt(L, gs);
      var x = sp.x + sp.nx * g.off;
      var z = sp.z + sp.nz * g.off;
      var ang = Math.atan2(sp.tz, sp.tx);

      var botIdx = duo ? i - 2 : i - 1;
      var bp = BOT_PRESETS[clamp(botIdx, 0, BOT_PRESETS.length - 1)];

      var kartColor = i === 0 ? p1Paint.hex : (duo && i === 1 ? p2Paint.hex : bp.hex);
      var kartTrim = i === 0 ? p1Paint.trim : (duo && i === 1 ? p2Paint.trim : bp.trim);
      var helmetCol = i === 0 ? 0xffffff : (duo && i === 1 ? 0xffe066 : bp.helmet);
      var bodyId = i === 0 ? p1Body : (duo && i === 1 ? (p1Body + 1) % BODIES.length : bp.body);

      karts.push({
        id: i,
        human: isHuman,
        name: i === 0 ? RACER_NAMES[0] : (duo && i === 1 ? RACER_NAMES[1] : bp.name),
        body: bodyId,
        color: kartColor,
        trim: kartTrim,
        helmet: helmetCol,
        x: x, y: 0, z: z,
        vx: 0, vy: 0, vz: 0,
        ang: ang,
        speed: 0,
        steerVis: 0,
        wheelSpin: 0,
        s: gs,
        idx: sp.idx,
        off: g.off,
        lap: 0,
        cpMask: 0,
        progress: g.ds,
        dist: 0,
        place: i + 1,
        finished: false,
        finishTime: 0,
        // Arcade feel timers
        drifting: false,
        driftDir: 0,
        driftT: 0,
        driftStage: 0, // 0 none, 1 blue, 2 gold
        driftCount: 0,
        boostT: 0,
        shieldT: 0,
        spinT: 0,
        invulnT: 0,
        bounceT: 0,
        warpT: 0,
        airborne: false,
        rampCD: 0,
        item: null,
        coins: 0,
        // AI personal traits (scales cleanly from kid-friendly 0.68 up to fierce 1.01 via aiSkill)
        aiBase: 0.66 + aiSkill * 0.34 + (i - 2) * 0.03,
        aiLine: (rng() - 0.5) * L.hw * 0.7,
        aiShiftT: 1.5 + rng() * 2.5,
        aiItemT: 0.8 + rng() * 1.6,
        behindT: 0
      });
    }

    // Dynamic world items & coins
    var itemBoxes = [];
    for (i = 0; i < L.itemSpawns.length; i++) {
      itemBoxes.push({ x: L.itemSpawns[i].x, z: L.itemSpawns[i].z, s: L.itemSpawns[i].s, off: L.itemSpawns[i].off, active: true, cd: 0 });
    }
    var coins = [];
    for (i = 0; i < L.coinSpawns.length; i++) {
      coins.push({ x: L.coinSpawns[i].x, z: L.coinSpawns[i].z, active: true, cd: 0 });
    }
    var erasers = [];
    for (i = 0; i < L.erasers.length; i++) {
      erasers.push({ x: L.erasers[i].x, z: L.erasers[i].z, ang: L.erasers[i].ang, r: L.erasers[i].r, squash: 0 });
    }
    var inks = [];
    for (i = 0; i < L.inks.length; i++) {
      inks.push({ x: L.inks[i].x, z: L.inks[i].z, r: L.inks[i].r, temp: false, life: 9999, owner: -1 });
    }

    return {
      L: L,
      trackIdx: trackIdx,
      id: L.id,
      duo: duo,
      demo: demo,
      aiSkill: aiSkill,
      rng: rng,
      worldTime: 0,
      time: 0,
      started: demo, // In real play, race clock & launch activate cleanly on first human input
      finished: false,
      winner: -1,
      p1Dist: 0,
      karts: karts,
      itemBoxes: itemBoxes,
      coins: coins,
      erasers: erasers,
      inks: inks,
      ev: []
    };
  }

  /* --------------------------------------------------------------- Bot AI */
  function computeBotInput(w, k, dt) {
    var L = w.L;
    k.aiShiftT -= dt;
    if (k.aiShiftT <= 0) {
      k.aiShiftT = 1.6 + w.rng() * 2.4;
      k.aiLine = (w.rng() - 0.5) * L.hw * 0.76;
    }

    var wantOff = k.aiLine;
    // Dodge erasers and ink spills ahead
    var look = 9.0 + Math.abs(k.speed) * 0.36;
    for (var i = 0; i < w.erasers.length; i++) {
      var er = w.erasers[i];
      var dx = er.x - k.x, dz = er.z - k.z;
      var d = Math.hypot(dx, dz);
      if (d < 13) {
        var proj = projectPoint(L, er.x, er.z, k.idx);
        if (Math.abs(wantOff - proj.off) < er.r + KART_R + 1.2) {
          wantOff = proj.off >= 0 ? -L.hw * 0.45 : L.hw * 0.45;
        }
      }
    }
    for (i = 0; i < w.inks.length; i++) {
      var ik = w.inks[i];
      if (Math.hypot(ik.x - k.x, ik.z - k.z) < 12) {
        var proj2 = projectPoint(L, ik.x, ik.z, k.idx);
        if (Math.abs(wantOff - proj2.off) < ik.r + KART_R + 1.0) {
          wantOff = proj2.off >= 0 ? -L.hw * 0.48 : L.hw * 0.48;
        }
      }
    }

    var aim = sampleAt(L, k.s + look);
    var tx = aim.x + aim.nx * wantOff;
    var tz = aim.z + aim.nz * wantOff;
    var diff = wrapAngle(Math.atan2(tz - k.z, tx - k.x) - k.ang);

    // Rubber-banding relative to leading human (or average human)
    var refProg = w.karts[0].progress;
    if (w.duo) refProg = Math.max(w.karts[0].progress, w.karts[1].progress);
    var gap = k.progress - refProg; // positive = bot ahead of human

    var throttle = k.aiBase;
    if (!w.demo) {
      if (gap > 10) {
        // Ease off when ahead so kids always feel in contention
        var ease = lerp(0.28, 0.08, w.aiSkill);
        throttle -= clamp((gap - 10) / 42, 0, 1) * ease;
      } else if (gap < -18) {
        // Gentle catch-up when far behind
        var push = lerp(0.06, 0.16, w.aiSkill);
        throttle += clamp((-gap - 18) / 48, 0, 1) * push;
      }
    }
    throttle = clamp(throttle, 0.48, 1.05);

    // Use held item after short natural delay
    var useItem = false;
    if (k.item) {
      k.aiItemT -= dt;
      if (k.aiItemT <= 0) {
        useItem = true;
        k.aiItemT = 1.0 + w.rng() * 1.4;
      }
    }

    return {
      gas: throttle,
      brake: 0,
      steer: clamp(diff / 0.55, -1, 1),
      drift: Math.abs(diff) > 0.62 && k.speed > 17 && !k.airborne,
      item: useItem
    };
  }

  /* --------------------------------------------------------------- Item Use */
  function grantItem(w, k) {
    // Fair Mario-Kart-style odds: trailing karts more likely to get Rocket!
    var r = w.rng();
    var id;
    if (k.place >= 3) {
      id = r < 0.62 ? 'rocket' : (r < 0.88 ? 'shield' : 'ink');
    } else if (k.place === 2) {
      id = r < 0.42 ? 'rocket' : (r < 0.76 ? 'shield' : 'ink');
    } else {
      id = r < 0.24 ? 'rocket' : (r < 0.62 ? 'shield' : 'ink');
    }
    k.item = id;
    w.ev.push({ type: 'pickup', kart: k.id, item: id, x: k.x, z: k.z });
  }

  function useKartItem(w, k) {
    if (!k.item) return false;
    var item = k.item;
    k.item = null;
    if (item === 'rocket') {
      k.boostT = Math.max(k.boostT, 1.75);
      k.invulnT = Math.max(k.invulnT, 1.75);
      k.speed = Math.max(k.speed, BOOST_SPEED * 0.92);
      w.ev.push({ type: 'rocket', kart: k.id, x: k.x, z: k.z });
    } else if (item === 'shield') {
      k.shieldT = 5.0;
      k.boostT = Math.max(k.boostT, 0.45);
      w.ev.push({ type: 'shield', kart: k.id, x: k.x, z: k.z });
    } else if (item === 'ink') {
      // Drop glossy ink splash right behind the kart
      var bx = k.x - Math.cos(k.ang) * 2.9;
      var bz = k.z - Math.sin(k.ang) * 2.9;
      if (w.inks.length < 18) {
        w.inks.push({ x: bx, z: bz, r: 2.2, temp: true, life: 11.0, owner: k.id });
      }
      w.ev.push({ type: 'inkDrop', kart: k.id, x: bx, z: bz });
    }
    return true;
  }

  /* --------------------------------------------------------------- Simulation Step */
  function step(w, dt, inputs) {
    dt = clamp(dt || FIXED_DT, 0.001, 0.05);
    w.worldTime += dt;
    inputs = inputs || [];

    // Check if any human player pressed gas/brake/steer/item to launch the race from the grid
    if (!w.started && !w.demo) {
      var humanCount = w.duo ? 2 : 1;
      for (var h = 0; h < humanCount; h++) {
        var hi = inputs[h];
        if (hi && (hi.gas > 0.05 || hi.brake > 0.05 || Math.abs(hi.steer || 0) > 0.1 || hi.item)) {
          w.started = true;
          w.ev.push({ type: 'go' });
          break;
        }
      }
    }

    if (w.started && !w.finished) {
      w.time += dt;
    }

    // Update respawning boxes, coins, temporary ink, eraser squash
    var i, j;
    for (i = 0; i < w.itemBoxes.length; i++) {
      var ib = w.itemBoxes[i];
      if (!ib.active) {
        ib.cd -= dt;
        if (ib.cd <= 0) ib.active = true;
      }
    }
    for (i = 0; i < w.coins.length; i++) {
      var co = w.coins[i];
      if (!co.active) {
        co.cd -= dt;
        if (co.cd <= 0) co.active = true;
      }
    }
    for (i = 0; i < w.erasers.length; i++) {
      if (w.erasers[i].squash > 0) w.erasers[i].squash = Math.max(0, w.erasers[i].squash - dt * 3.6);
    }
    for (i = w.inks.length - 1; i >= 0; i--) {
      if (w.inks[i].temp) {
        w.inks[i].life -= dt;
        if (w.inks[i].life <= 0) w.inks.splice(i, 1);
      }
    }

    var L = w.L;

    // Step every kart
    for (i = 0; i < w.karts.length; i++) {
      var k = w.karts[i];
      if (k.boostT > 0) k.boostT = Math.max(0, k.boostT - dt);
      if (k.shieldT > 0) k.shieldT = Math.max(0, k.shieldT - dt);
      if (k.spinT > 0) k.spinT = Math.max(0, k.spinT - dt);
      if (k.invulnT > 0) k.invulnT = Math.max(0, k.invulnT - dt);
      if (k.bounceT > 0) k.bounceT = Math.max(0, k.bounceT - dt);
      if (k.warpT > 0) k.warpT = Math.max(0, k.warpT - dt);
      if (k.rampCD > 0) k.rampCD = Math.max(0, k.rampCD - dt);

      // Before the race starts, karts wait cleanly on the grid (p1Dist stays strictly 0)
      if (!w.started) continue;

      var inp;
      if (k.human && !k.finished) {
        inp = inputs[k.id] || { gas: 0, brake: 0, steer: 0, drift: false, item: false };
      } else {
        inp = computeBotInput(w, k, dt);
      }

      if (inp.item && k.item && !k.finished) {
        useKartItem(w, k);
      }

      var gas = clamp(inp.gas || 0, 0, 1.1);
      var brake = clamp(inp.brake || 0, 0, 1);
      var steer = clamp(inp.steer || 0, -1, 1);
      var wantDrift = !!inp.drift;

      // Spin-out slowdown from ink spill
      if (k.spinT > 0) {
        gas *= 0.35;
        steer *= 0.25;
      }

      // Arcade Drift State Machine
      var canDrift = !k.airborne && k.spinT <= 0 && k.speed > 11.5 && wantDrift;
      if (canDrift && (Math.abs(steer) > 0.12 || k.drifting)) {
        if (!k.drifting) {
          k.drifting = true;
          k.driftDir = steer >= 0 ? 1 : -1;
          k.driftT = 0;
          k.driftStage = 0;
        }
        k.driftT += dt;
        var prevStage = k.driftStage;
        if (k.driftT >= 1.10) k.driftStage = 2;
        else if (k.driftT >= 0.48) k.driftStage = 1;
        if (k.driftStage > prevStage) {
          w.ev.push({ type: 'driftCharge', kart: k.id, stage: k.driftStage, x: k.x, z: k.z });
        }
      } else if (k.drifting) {
        // Release drift -> award mini-turbo if charged!
        if (k.driftStage === 2) {
          k.boostT = Math.max(k.boostT, 1.15);
          k.speed = Math.max(k.speed, BOOST_SPEED * 0.88);
          k.driftCount++;
          w.ev.push({ type: 'driftBoost', kart: k.id, stage: 2, x: k.x, z: k.z });
        } else if (k.driftStage === 1) {
          k.boostT = Math.max(k.boostT, 0.70);
          k.speed = Math.max(k.speed, BOOST_SPEED * 0.80);
          k.driftCount++;
          w.ev.push({ type: 'driftBoost', kart: k.id, stage: 1, x: k.x, z: k.z });
        }
        k.drifting = false;
        k.driftDir = 0;
        k.driftT = 0;
        k.driftStage = 0;
      }

      // Visual steering wheel angle
      k.steerVis = lerp(k.steerVis, steer, clamp(dt * 12, 0, 1));

      // Turning (snappy even at low speeds, stronger when drifting)
      var speedFactor = clamp(Math.abs(k.speed) / 6.5, 0.35, 1.0);
      var revSign = k.speed < -0.5 ? -1 : 1;
      if (k.drifting) {
        var driftTurn = k.driftDir * 0.55 + steer * 0.65;
        k.ang = wrapAngle(k.ang + driftTurn * DRIFT_STEER * speedFactor * dt);
      } else {
        k.ang = wrapAngle(k.ang + steer * STEER_RATE * speedFactor * revSign * dt);
      }

      // Forward speed & boost
      var topSpeed = k.boostT > 0 ? BOOST_SPEED : MAX_SPEED;
      if (!k.human) topSpeed *= clamp(gas, 0.60, 1.05);
      else if (k.coins > 0) topSpeed += Math.min(k.coins, 12) * 0.14;

      var curAccel = k.boostT > 0 ? ACCEL * 1.65 : ACCEL;
      if (k.boostT > 0) {
        k.speed += (topSpeed - k.speed) * clamp(dt * 6.5, 0, 1);
      } else if (gas > 0.02) {
        k.speed += curAccel * (k.human ? gas : 1.0) * dt;
        if (k.speed > topSpeed) k.speed = lerp(k.speed, topSpeed, clamp(dt * 4, 0, 1));
      } else if (brake > 0.02) {
        if (k.speed > 1.2) k.speed -= BRAKE_DECEL * brake * dt;
        else k.speed = Math.max(REVERSE_MAX, k.speed - ACCEL * 0.55 * brake * dt);
      } else {
        k.speed *= Math.max(0, 1 - DRAG * dt * 2.1);
        if (Math.abs(k.speed) < 0.08) k.speed = 0;
      }

      if (k.spinT > 0) k.speed = Math.min(k.speed, MAX_SPEED * 0.45);

      // Velocity integration with snappy arcade grip (slight lateral drift slide)
      var fx = Math.cos(k.ang), fz = Math.sin(k.ang);
      var targetVx = fx * k.speed, targetVz = fz * k.speed;
      var grip = k.airborne ? 2.2 : (k.drifting ? 5.6 : 11.5);
      k.vx = lerp(k.vx, targetVx, clamp(dt * grip, 0, 1));
      k.vz = lerp(k.vz, targetVz, clamp(dt * grip, 0, 1));

      var prevX = k.x, prevZ = k.z;
      k.x += k.vx * dt;
      k.z += k.vz * dt;
      k.wheelSpin += k.speed * dt * 1.4;

      // Vertical jump arc (Textbook Ramps!)
      if (k.airborne || k.y > 0 || k.vy > 0) {
        k.vy -= GRAVITY * dt;
        k.y += k.vy * dt;
        if (k.y <= 0) {
          k.y = 0;
          k.vy = 0;
          if (k.airborne) {
            k.airborne = false;
            k.boostT = Math.max(k.boostT, 0.55);
            w.ev.push({ type: 'land', kart: k.id, x: k.x, z: k.z });
          }
        }
      }

      var moved = Math.hypot(k.x - prevX, k.z - prevZ);
      k.dist += moved;
      if (k.id === 0) w.p1Dist = k.dist;

      // Project onto track spline & apply forgiving bouncy pencil/ruler wall cushion
      var prevS = k.s;
      var pr = projectPoint(L, k.x, k.z, k.idx);
      k.idx = pr.idx;
      k.s = pr.s;
      k.off = pr.off;

      var limit = L.hw - KART_R;
      if (Math.abs(k.off) > limit) {
        var sign = k.off > 0 ? 1 : -1;
        k.off = sign * limit;
        k.x = pr.cx + pr.nx * k.off;
        k.z = pr.cz + pr.nz * k.off;

        // Reflect outward normal velocity softly & gently align nose along forward tangent so kart NEVER gets stuck!
        var vn = k.vx * pr.nx + k.vz * pr.nz;
        if (vn * sign > 0) {
          k.vx -= (1.42) * vn * pr.nx;
          k.vz -= (1.42) * vn * pr.nz;
          // Push slightly inward
          k.vx -= sign * pr.nx * 2.2;
          k.vz -= sign * pr.nz * 2.2;
          k.speed = Math.max(k.speed * 0.86, 6.0);
          var tangAng = Math.atan2(pr.tz, pr.tx);
          var aDiff = wrapAngle(tangAng - k.ang);
          k.ang = wrapAngle(k.ang + aDiff * 0.28);
          if (k.bounceT <= 0) {
            k.bounceT = 0.22;
            w.ev.push({ type: 'wall', kart: k.id, x: k.x, z: k.z, power: clamp(Math.abs(vn) / 14, 0.2, 1) });
          }
        }
      }

      // Track quarter checkpoints & lap counting
      var ds = wrapDelta(k.s - prevS, L.len);
      var q = clamp(Math.floor((k.s / L.len) * 4), 0, 3);
      if (q === 0 && (k.cpMask & 7) === 7 && ds > 0 && prevS > L.len * 0.75) {
        k.lap++;
        k.cpMask = 1;
        if (!w.demo && k.lap >= LAPS && !k.finished) {
          k.finished = true;
          k.finishTime = w.time;
          w.ev.push({ type: 'finish', kart: k.id, lap: k.lap, place: k.place });
        } else {
          w.ev.push({ type: 'lap', kart: k.id, lap: k.lap });
        }
      } else {
        // Mark checkpoints sequentially so reverse driving cannot skip
        if (q === 0) k.cpMask |= 1;
        else if (q === 1 && (k.cpMask & 1)) k.cpMask |= 2;
        else if (q === 2 && (k.cpMask & 2)) k.cpMask |= 4;
        else if (q === 3 && (k.cpMask & 4)) k.cpMask |= 8;
      }

      // Continuous race progress (handles starting behind line cleanly)
      var rawProg = k.lap * L.len + (k.lap === 0 && k.s > L.len * 0.85 && !(k.cpMask & 4) ? k.s - L.len : k.s);
      k.progress = rawProg;

      // Interactive track props (skip ground hazards while airborne!)
      if (!k.airborne) {
        // 1) Boost chevrons
        for (j = 0; j < L.boosts.length; j++) {
          var b = L.boosts[j];
          if (Math.hypot(k.x - b.x, k.z - b.z) < b.r + KART_R * 0.7) {
            if (k.boostT < 0.75) {
              k.boostT = Math.max(k.boostT, 1.05);
              k.speed = Math.max(k.speed, BOOST_SPEED * 0.92);
              w.ev.push({ type: 'boost', kart: k.id, x: b.x, z: b.z });
            }
          }
        }
        // 2) Stacked Textbook Jump Ramps
        if (k.rampCD <= 0 && k.speed > 8.5) {
          for (j = 0; j < L.ramps.length; j++) {
            var rm = L.ramps[j];
            var rdx = k.x - rm.x, rdz = k.z - rm.z;
            var rAlong = rdx * rm.tx + rdz * rm.tz;
            var rSide = Math.abs(-rdx * rm.tz + rdz * rm.tx);
            if (Math.abs(rAlong) < rm.halfLen && rSide < rm.halfW) {
              k.airborne = true;
              k.vy = 11.8 + clamp(k.speed * 0.14, 0, 3.6);
              k.rampCD = 0.95;
              w.ev.push({ type: 'jump', kart: k.id, x: k.x, z: k.z });
              break;
            }
          }
        }
        // 3) Bouncy Pink Erasers (always boing cleanly toward open track center + forward so karts NEVER pinch!)
        for (j = 0; j < w.erasers.length; j++) {
          var er2 = w.erasers[j];
          var edx = k.x - er2.x, edz = k.z - er2.z;
          var ed = Math.hypot(edx, edz);
          var minEd = er2.r + KART_R;
          if (ed < minEd) {
            var erPr = projectPoint(L, er2.x, er2.z, k.idx);
            var openSide = erPr.off >= 0 ? -1 : 1;
            // Blend radial push with guaranteed open-side + forward escape vector
            var enx = (ed > 0.001 ? edx / ed : 0) * 0.45 + pr.nx * openSide * 0.75 + pr.tx * 0.45;
            var enz = (ed > 0.001 ? edz / ed : 0) * 0.45 + pr.nz * openSide * 0.75 + pr.tz * 0.45;
            var elen = Math.hypot(enx, enz) || 1;
            enx /= elen; enz /= elen;
            k.x = er2.x + enx * (minEd + 0.18);
            k.z = er2.z + enz * (minEd + 0.18);
            var kick = k.shieldT > 0 ? 11.5 : 14.5;
            k.vx = enx * kick + pr.tx * 9.5;
            k.vz = enz * kick + pr.tz * 9.5;
            k.speed = Math.max(12.0, k.speed * 0.88);
            k.ang = wrapAngle(k.ang + wrapAngle(Math.atan2(pr.tz, pr.tx) - k.ang) * 0.35);
            er2.squash = 1.0;
            w.ev.push({ type: 'eraser', kart: k.id, x: er2.x, z: er2.z });
          }
        }
        // 4) Glossy Ink Puddles
        if (k.shieldT <= 0 && k.invulnT <= 0 && k.spinT <= 0) {
          for (j = 0; j < w.inks.length; j++) {
            var ink = w.inks[j];
            if (ink.owner === k.id && ink.life > 10.2) continue;
            if (Math.hypot(k.x - ink.x, k.z - ink.z) < ink.r + KART_R * 0.45) {
              k.spinT = 0.65;
              k.invulnT = 1.25;
              k.speed *= 0.52;
              k.drifting = false;
              k.driftStage = 0;
              w.ev.push({ type: 'inkHit', kart: k.id, x: k.x, z: k.z });
              break;
            }
          }
        }
      }

      // 5) Floating Item Pickup Boxes (collectible even mid-jump!)
      for (j = 0; j < w.itemBoxes.length; j++) {
        var box = w.itemBoxes[j];
        if (!box.active) continue;
        if (Math.hypot(k.x - box.x, k.z - box.z) < 1.35 + KART_R) {
          box.active = false;
          box.cd = 4.5;
          if (!k.item) grantItem(w, k);
          else w.ev.push({ type: 'boxBreak', kart: k.id, x: box.x, z: box.z });
        }
      }

      // 6) Spinning Gold Coins
      for (j = 0; j < w.coins.length; j++) {
        var cn = w.coins[j];
        if (!cn.active) continue;
        if (Math.hypot(k.x - cn.x, k.z - cn.z) < 1.25 + KART_R) {
          cn.active = false;
          cn.cd = 9.0;
          k.coins++;
          w.ev.push({ type: 'coin', kart: k.id, x: cn.x, z: cn.z });
        }
      }
    }

    // Kart-vs-kart bouncy bumps (soft, playful, never locks together!)
    if (w.started) {
      for (i = 0; i < w.karts.length; i++) {
        for (j = i + 1; j < w.karts.length; j++) {
          var a = w.karts[i], b2 = w.karts[j];
          if (Math.abs(a.y - b2.y) > 1.8) continue;
          var dx2 = b2.x - a.x, dz2 = b2.z - a.z;
          var d2 = Math.hypot(dx2, dz2);
          var minD = KART_R * 2.02;
          if (d2 < minD && d2 > 0.0001) {
            var nx2 = dx2 / d2, nz2 = dz2 / d2;
            var ov = (minD - d2) * 0.52;
            a.x -= nx2 * ov; a.z -= nz2 * ov;
            b2.x += nx2 * ov; b2.z += nz2 * ov;
            var aBoost = a.shieldT > 0 ? 1.7 : 1.0;
            var bBoost = b2.shieldT > 0 ? 1.7 : 1.0;
            a.vx -= nx2 * 6.5 * bBoost; a.vz -= nz2 * 6.5 * bBoost;
            b2.vx += nx2 * 6.5 * aBoost; b2.vz += nz2 * 6.5 * aBoost;
            if (a.bounceT <= 0 || b2.bounceT <= 0) {
              a.bounceT = 0.24; b2.bounceT = 0.24;
              w.ev.push({ type: 'bump', a: a.id, b: b2.id, x: (a.x + b2.x) * 0.5, z: (a.z + b2.z) * 0.5 });
            }
          }
        }
      }

      // 2P Micro-Machines automatic catch-up warp if one human falls far behind the other
      if (w.duo && !w.finished) {
        var k0 = w.karts[0], k1 = w.karts[1];
        if (!k0.finished && !k1.finished) {
          var sep = Math.hypot(k0.x - k1.x, k0.z - k1.z);
          var pDiff = Math.abs(k0.progress - k1.progress);
          var trailer = k0.progress < k1.progress ? k0 : k1;
          var leader = trailer === k0 ? k1 : k0;
          if (sep > 34 || pDiff > 36) {
            trailer.behindT += dt;
            if (trailer.behindT >= 0.65) {
              var ws = wrapS(L.len, leader.s - 4.8);
              var wp = sampleAt(L, ws);
              var wOff = clamp(-leader.off * 0.5, -L.hw * 0.45, L.hw * 0.45);
              trailer.x = wp.x + wp.nx * wOff;
              trailer.z = wp.z + wp.nz * wOff;
              trailer.y = 0; trailer.vy = 0; trailer.airborne = false;
              trailer.ang = Math.atan2(wp.tz, wp.tx);
              trailer.speed = Math.max(leader.speed * 0.92, 16);
              trailer.vx = Math.cos(trailer.ang) * trailer.speed;
              trailer.vz = Math.sin(trailer.ang) * trailer.speed;
              trailer.s = ws; trailer.idx = wp.idx; trailer.off = wOff;
              trailer.lap = leader.lap;
              trailer.cpMask = leader.cpMask;
              trailer.progress = leader.progress - 4.8;
              trailer.invulnT = 1.4;
              trailer.boostT = Math.max(trailer.boostT, 0.85);
              trailer.warpT = 0.6;
              trailer.behindT = 0;
              w.ev.push({ type: 'warp', kart: trailer.id, x: trailer.x, z: trailer.z });
            }
          } else {
            k0.behindT = Math.max(0, k0.behindT - dt * 2);
            k1.behindT = Math.max(0, k1.behindT - dt * 2);
          }
        }
      }
    }

    // Update live race rankings (1st..4th)
    var order = w.karts.slice().sort(function (a, b3) {
      if (a.finished && b3.finished) return a.finishTime - b3.finishTime;
      if (a.finished) return -1;
      if (b3.finished) return 1;
      return b3.progress - a.progress;
    });
    for (i = 0; i < order.length; i++) order[i].place = i + 1;

    // Check race completion (1P: when P1 finishes; 2P: when either human finishes, or both)
    if (!w.demo && !w.finished) {
      if (!w.duo && w.karts[0].finished) {
        w.finished = true;
        w.winner = order[0].id;
        w.ev.push({ type: 'raceOver', summary: buildSummary(w) });
      } else if (w.duo && (w.karts[0].finished || w.karts[1].finished)) {
        w.finished = true;
        w.winner = w.karts[0].finished ? 0 : 1;
        w.ev.push({ type: 'raceOver', summary: buildSummary(w) });
      }
    }
  }

  function buildSummary(w) {
    var p1 = w.karts[0];
    var p2 = w.karts[1];
    var place = p1.place;
    var stars = place === 1 ? 3 : (place === 2 ? 2 : (place === 3 ? 1 : 0));
    var placePts = place === 1 ? 1000 : (place === 2 ? 700 : (place === 3 ? 450 : 200));
    var timeBonus = clamp(Math.round((130 - w.time) * 5), 0, 500);
    var score = placePts + p1.coins * 25 + p1.driftCount * 40 + timeBonus;
    var coinsEarned = (place === 1 ? 40 : (place === 2 ? 25 : (place === 3 ? 15 : 8))) + p1.coins * 2;
    if (w.duo) {
      var winnerKart = w.karts[w.winner] || p1;
      coinsEarned = 25 + p1.coins + p2.coins;
      return {
        duo: true,
        winner: w.winner,
        winnerName: winnerKart.name,
        p1Place: p1.place,
        p2Place: p2.place,
        place: Math.min(p1.place, p2.place),
        stars: 3,
        score: score,
        coinsEarned: coinsEarned,
        time: Math.round(w.time * 100) / 100,
        outcome: 0.72
      };
    }
    return {
      duo: false,
      winner: w.winner,
      place: place,
      stars: stars,
      score: score,
      coinsEarned: coinsEarned,
      time: Math.round(w.time * 100) / 100,
      outcome: place === 1 ? 1.0 : (place === 2 ? 0.75 : (place === 3 ? 0.45 : 0.15))
    };
  }

  return {
    LAPS: LAPS,
    KART_R: KART_R,
    KART_W: KART_W,
    KART_L: KART_L,
    FIXED_DT: FIXED_DT,
    SAMPLES: SAMPLES,
    MAX_SPEED: MAX_SPEED,
    BOOST_SPEED: BOOST_SPEED,
    CUPS: CUPS,
    TRACKS: TRACKS,
    ITEMS: ITEMS,
    BODIES: BODIES,
    PAINTS: PAINTS,
    clamp: clamp,
    lerp: lerp,
    wrapAngle: wrapAngle,
    wrapS: wrapS,
    buildTrack: buildTrack,
    sampleAt: sampleAt,
    projectPoint: projectPoint,
    freshSave: freshSave,
    loadSave: loadSave,
    totalStars: totalStars,
    buyBody: buyBody,
    buyPaint: buyPaint,
    applyResult: applyResult,
    create: create,
    step: step,
    buildSummary: buildSummary
  };
});
