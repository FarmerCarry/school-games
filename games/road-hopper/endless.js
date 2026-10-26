/*
 * عبور الطريق (Road Hopper) — the endless lane generator and its difficulty tiers.
 * Pure: no Kit, no DOM, no three.js, so Node tests load it as it is. game.js picks a
 * tier with Kit.dda at the start of every run and passes it in.
 *
 *   RHEndless.TIERS[t - 1]       the knobs of tier t (1..5); tier 3 is the original balance
 *   RHEndless.KNOBS              per knob: +1 if a larger value is harder, -1 if easier
 *   RHEndless.tier(t)            the knobs of tier t (1..5; anything else is tier 3)
 *   RHEndless.newGen(base, T, themes) -> generator state for a world starting at row base
 *   RHEndless.genLane(g)         the next lane (row g.row) as plain data
 *   RHEndless.diffAt(r, T)       difficulty 0..1 at row r
 *
 * Randomness is Math.random, in the same order as before the tiers existed.
 */
(function (E) {
  'use strict';
  var CAR_COLORS = [0xff4b4b, 0x3f7bff, 0x22c55e, 0xa855f7, 0xff8a1f, 0x14c6c6, 0xff5fa8];
  var TRUCK_COLORS = [0x3f7bff, 0xff4b4b, 0x22c55e, 0xff8a1f];
  var VLEN = { car: 1.34, taxi: 1.34, van: 1.74, truck: 2.36, bus: 2.76 };

  // One column per tier: 1 and 2 for 6–9 year olds (slower, wider gaps, fewer kinds of
  // hazard, kinder hitboxes, a slower ramp), 3 is the game as it always was, 4 and 5 for
  // skilled 10–11 year olds. Hitboxes never get stricter than tier 3 (no unfair deaths).
  var COLUMNS = {
    // The difficulty d rises from dMin to dMax over the first `ramp` rows.
    ramp: [420, 300, 220, 180, 150], dMin: [0, 0, 0, 0.08, 0.16], dMax: [0.6, 0.8, 1, 1, 1],
    // Roads: vehicle speed factor, smallest gap between vehicles (tiles), rows before
    // trucks and buses, rows before fast lanes, fast-lane chance factor, most lanes in a row.
    carSpeed: [0.7, 0.85, 1, 1.1, 1.2], carGap: [4.6, 4, 3.4, 3.2, 3],
    heavyAfter: [40, 24, 12, 10, 8], fastAfter: [100, 60, 25, 20, 15], fast: [0, 0.6, 1, 1.3, 1.6],
    roadMax: [3, 4, 5, 5, 5],
    // Rivers: rows before the first river, most lanes in a row, log speed factor, base
    // water gap between logs, long logs while d is below this, log landing reach (tiles).
    riverAfter: [14, 10, 7, 6, 5], riverMax: [2, 3, 4, 4, 4], logSpeed: [0.75, 0.88, 1, 1.08, 1.16],
    logGap: [0.9, 1.15, 1.4, 1.55, 1.7], longLogs: [0.7, 0.45, 0.25, 0.15, 0.1], land: [0.45, 0.38, 0.3, 0.3, 0.3],
    // Rails: rows before the first rail, how often rails come, warning time (s), wait between trains.
    railAfter: [50, 30, 16, 13, 10], rail: [0.5, 0.75, 1, 1.15, 1.3], warn: [2.4, 1.9, 1.5, 1.35, 1.2],
    trainGap: [1.4, 1.2, 1, 0.9, 0.8],
    // Chance of a grass row to rest on after a road, river or rail.
    rest: [0.9, 0.82, 0.72, 0.66, 0.6],
    // Vehicle and train hitbox margin around the critter (tiles).
    hit: [0.04, 0.12, 0.2, 0.2, 0.2],
    // The eagle: pace factor, rows behind the screen when the warning starts and when it strikes.
    eagle: [0.6, 0.8, 1, 1.1, 1.2], warnAt: [3.7, 3, 2.3, 2.1, 1.9], reach: [5, 4.3, 3.6, 3.4, 3.2],
    // A run this long (rows) counts as a full success for Kit.dda.
    par: [30, 50, 75, 100, 130]
  };
  E.KNOBS = {
    ramp: -1, dMin: 1, dMax: 1, carSpeed: 1, carGap: -1, heavyAfter: -1, fastAfter: -1, fast: 1, roadMax: 1,
    riverAfter: -1, riverMax: 1, logSpeed: 1, logGap: 1, longLogs: -1, land: -1,
    railAfter: -1, rail: 1, warn: -1, trainGap: -1, rest: -1, hit: 1, eagle: 1, warnAt: -1, reach: -1, par: 1
  };
  E.TIERS = [0, 1, 2, 3, 4].map(function (i) {
    var t = { tier: i + 1 };
    for (var k in COLUMNS) t[k] = COLUMNS[k][i];
    return Object.freeze(t);
  });
  E.tier = function (n) { return E.TIERS[typeof n === 'number' && n >= 1 && n <= 5 ? Math.floor(n) - 1 : 2]; };
  E.VLEN = VLEN;

  // Same formulas as Kit.clamp, Kit.randInt and Kit.pick.
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function themeOf(r, themes) { return r < 0 ? 0 : Math.floor(r / 50) % themes; }
  function diffAt(r, T) { return T.dMin + (T.dMax - T.dMin) * clamp(r / T.ramp, 0, 1); }
  function wrapX(x) { return ((x + 18) % 36 + 36) % 36 - 18; }
  E.themeOf = themeOf; E.diffAt = diffAt; E.wrapX = wrapX;

  E.newGen = function (base, T, themes) {
    return { row: base - 10, base: base, safe: 0, cluster: 'grass', left: 0, riverDir: Math.random() < 0.5 ? 1 : -1, prevType: 'grass', T: T, themes: themes };
  };
  function treeKind() { return Math.random() < 0.72 ? (Math.random() < 0.5 ? 'tree1' : 'tree2') : 'rock'; }
  function block(L, c, kind) { L.blocked[c] = kind; L.decor.push({ k: kind, x: c, rot: randInt(0, 3) }); }
  function outerDecor(L) {
    for (var x = -17; x <= 17; x++) {
      if (x >= -4 && x <= 4) continue;
      var edge = x === -5 || x === 5, p = Math.random();
      if (p < (edge ? 0.6 : 0.3)) L.decor.push({ k: Math.random() < 0.45 ? 'tree2' : 'tree1', x: x, rot: randInt(0, 3) });
      else if (p < (edge ? 0.68 : 0.36)) L.decor.push({ k: 'rock', x: x, rot: randInt(0, 3) });
    }
  }

  function chooseCluster(g, rel, d) {
    var T = g.T, prev = g.cluster, c, n;
    if (prev !== 'grass' && Math.random() < T.rest) { c = 'grass'; n = Math.random() < 0.75 ? 1 : 2; }
    else {
      var opts = [['road', 5], ['river', rel > T.riverAfter ? 3.2 : 0], ['rail', rel > T.railAfter ? (1.1 + d * 1.6) * T.rail : 0], ['grass', prev === 'grass' ? 0 : 1]];
      var tot = 0, i;
      for (i = 0; i < opts.length; i++) { if (opts[i][0] === prev) opts[i][1] = 0; tot += opts[i][1]; }
      var p = Math.random() * tot;
      c = 'road';
      for (i = 0; i < opts.length; i++) { p -= opts[i][1]; if (p < 0) { c = opts[i][0]; break; } }
      if (c === 'road') n = randInt(1, Math.min(T.roadMax, (rel < 14 ? 2 : 3) + Math.round(d * 2)));
      else if (c === 'river') n = randInt(1, Math.min(T.riverMax, (rel < 24 ? 2 : 3) + Math.round(d * 1.4)));
      else if (c === 'rail') n = d > 0.35 && Math.random() < 0.4 ? 2 : 1;
      else n = randInt(1, 2);
    }
    g.cluster = c; g.left = n;
  }

  E.genLane = function (g) {
    var r = g.row++, rel = r - g.base, d = diffAt(r, g.T);
    var L = { row: r, type: 'grass', theme: themeOf(r, g.themes), variant: r & 1, blocked: {}, decor: [], coin: null, v: 0, dir: 1,
      vehicles: null, logs: null, rail: null, pads: false };
    if (rel <= 4) { // safe start meadow, a wall of trees behind
      var c;
      if (rel <= -3) for (c = -4; c <= 4; c++) block(L, c, treeKind());
      else if (rel !== 0 && rel !== -1) for (c = -4; c <= 4; c++) if (Math.abs(c) >= 2 && Math.random() < 0.2) block(L, c, treeKind());
      outerDecor(L);
      g.safe = 0; g.prevType = 'grass'; g.cluster = 'grass'; g.left = 0;
      return L;
    }
    if (g.left <= 0) chooseCluster(g, rel, d);
    g.left--;
    if (g.cluster === 'road') genRoad(g, L, d, rel);
    else if (g.cluster === 'river') genRiver(g, L, d, rel);
    else if (g.cluster === 'rail') genRail(g, L, d);
    else genGrass(g, L, d, rel);
    g.prevType = L.type;
    return L;
  };
  function genGrass(g, L, d, rel) {
    var ns = clamp(g.safe + randInt(-2, 2), -4, 4);
    var lo = Math.min(g.safe, ns), hi = Math.max(g.safe, ns);
    var k = randInt(1, 2 + Math.round(d * 3));
    for (var i = 0; i < k; i++) {
      var c = randInt(-4, 4);
      if ((c >= lo && c <= hi) || L.blocked[c]) continue;
      block(L, c, treeKind());
    }
    g.safe = ns;
    if (Math.random() < 0.45) {
      for (var t = 0; t < 6; t++) {
        var cc = randInt(-4, 4);
        if (!L.blocked[cc]) { L.coin = { c: cc, big: rel > 20 && Math.random() < 0.08 }; break; }
      }
    }
    outerDecor(L);
  }
  function pickCar(rel) {
    if (rel < 10) return 'car';
    var p = Math.random();
    return p < 0.68 ? 'car' : p < 0.84 ? 'taxi' : 'van';
  }
  function genRoad(g, L, d, rel) {
    var T = g.T;
    L.type = 'road';
    L.variant = g.prevType === 'road' ? 1 : 0;
    L.dir = Math.random() < 0.5 ? 1 : -1;
    var heavy = rel > T.heavyAfter && Math.random() < 0.18 + d * 0.2;
    var speed = (1.5 + Math.random() * 1.3) * (1 + d * 1.25) * T.carSpeed;
    if (heavy) speed *= 0.75;
    var fast = !heavy && rel > T.fastAfter && Math.random() < (0.1 + d * 0.12) * T.fast;
    if (fast) speed *= 1.6;
    L.v = speed * L.dir;
    L.fast = fast;
    var vs = [], cur = -18 + Math.random() * 3, minGap = fast ? 5 : T.carGap;
    for (var guard = 0; guard < 12; guard++) {
      var t = heavy ? (Math.random() < 0.55 ? 'truck' : 'bus') : pickCar(rel);
      var len = VLEN[t];
      if (cur + len > 18 - minGap) break;
      var col = t === 'truck' ? pick(TRUCK_COLORS) : t === 'car' ? pick(CAR_COLORS) : 0;
      vs.push({ t: t, x: cur + len / 2, len: len, col: col, m: null });
      cur += len + minGap + Math.random() * (fast ? 8 : 7.5 - d * 3.5);
    }
    L.vehicles = vs;
    if (Math.random() < 0.15) L.coin = { c: randInt(-4, 4), big: false };
  }
  function genRiver(g, L, d, rel) {
    var T = g.T;
    L.type = 'river';
    // Ground variant: bit 1 = the next row is land (the cluster ends here), so the far
    // bank gets foam; bit 2 alternates the ripple pattern between rows.
    L.variant = (g.left > 0 ? 0 : 1) | (L.row & 1) << 1;
    var logs = [], i;
    if (rel > 12 && Math.random() < 0.22) { // lily pads: still, one is always on the safe column
      var cols = {}; cols[g.safe] = 1;
      var extra = randInt(2, 4);
      for (i = 0; i < extra; i++) cols[randInt(-4, 4)] = 1;
      for (var c in cols) logs.push({ x: +c, len: 1, pad: true, flower: Math.random() < 0.35, bob: 0, m: null });
      L.v = 0; L.pads = true;
    } else {
      g.riverDir = -g.riverDir; L.dir = g.riverDir;
      L.v = (1.0 + Math.random() * 0.8) * (1 + d * 0.8) * T.logSpeed * L.dir;
      var avgLen = d < T.longLogs ? 3.1 : 2.8, gap = T.logGap + d * 1.3 + Math.random() * 0.6;
      var n = Math.max(3, Math.round(36 / (avgLen + gap))), lens = [], total = 0;
      for (i = 0; i < n; i++) { var ln = d < T.longLogs ? pick([2, 3, 3, 4]) : pick([2, 2, 3, 3, 4]); lens.push(ln); total += ln; }
      while (36 - total < n * 1.1 && lens.length > 3) total -= lens.pop();
      n = lens.length;
      var free = 36 - total, w = [], ws = 0;
      for (i = 0; i < n; i++) { w.push(0.7 + Math.random() * 0.6); ws += w[i]; }
      var cur = -18 + Math.random() * 3;
      for (i = 0; i < n; i++) {
        logs.push({ x: wrapX(cur + lens[i] / 2), len: lens[i], pad: false, bob: 0, m: null });
        cur += lens[i] + free * w[i] / ws;
      }
      g.safe = randInt(-3, 3);
    }
    L.logs = logs;
  }
  function genRail(g, L, d) {
    L.type = 'rail';
    L.dir = Math.random() < 0.5 ? 1 : -1;
    L.rail = { phase: 'wait', t: 1 + Math.random() * 4, x: 0, warn: g.T.warn - d * 0.4, speed: 30 + d * 8, bell: 0 };
  }
})(globalThis.RHEndless = globalThis.RHEndless || {});
