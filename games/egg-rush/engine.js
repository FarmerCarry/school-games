/* Egg Rush (سباق البيض): the pure race simulation. A school sports-day egg-and-spoon race.
 * Tracks, runners, the egg balancing on the spoon, obstacles, CPU runners (rubber band),
 * checkpoints, golden eggs, places and stars. No Kit, no DOM: game.js passes difficulty
 * in (from Kit.dda) and Node tests load this file directly. */
(function (root) {
  'use strict';
  var ER = {};
  var M = Math;

  /* ------------------------------------------------------------ constants */
  ER.HALF = 3.5;          // furthest a runner's centre may go from the middle of the track
  ER.TRACK_W = 4.3;       // half width of the running surface
  ER.V_JOG = 10.5;        // automatic jog (m/s)
  ER.V_SPRINT = 14.2;     // ↑ / W
  ER.V_SLOW = 6.5;        // ↓ / S
  ER.V_TURBO = 18.2;      // turbo speed pad boost
  ER.VX_MAX = 6.2;        // sideways speed
  ER.JUMP_V = 8.4;
  ER.RAMP_V = 11.4;
  ER.GRAVITY = 24;
  ER.COUNTDOWN = 0.8;
  var K_LEAN = 2.75, K_AX = 0.022, K_TURN = 0.24, RIM = 0.65, RIM_PUSH = 1.55;

  /* ------------------------------------------------------------ worlds */
  ER.WORLDS = [
    { name: 'ساحة المدرسة', kinds: ['cone1', 'cones2', 'hurdleFull', 'puddle', 'slalom', 'hurdleHalf', 'ball'] },
    { name: 'المزرعة', kinds: ['critters', 'hurdleFull', 'cone1', 'puddle', 'sprinkler', 'hurdleHalf', 'cones2'] },
    { name: 'الشاطئ', kinds: ['ball', 'critters', 'sprinkler', 'hurdleFull', 'slalom', 'puddle', 'hurdleHalf'] }
  ];
  ER.TRACK_COUNT = 9;
  var LENGTHS = [220, 240, 260, 260, 280, 300, 300, 320, 350];
  ER.trackId = function (i) { return 'w' + (M.floor(i / 3) + 1) + '-' + (i % 3 + 1); };

  /* ------------------------------------------------------------ helpers */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = M.imul(t ^ (t >>> 15), t | 1);
      t ^= t + M.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  ER.rng = rng;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function approach(v, t, d) { return v < t ? M.min(t, v + d) : M.max(t, v - d); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  ER.clamp = clamp;

  /* ------------------------------------------------------------ tracks */
  var cache = [];
  ER.track = function (i) {
    if (cache[i]) return cache[i];
    var world = M.floor(i / 3), local = i % 3, d = i / 8, len = LENGTHS[i];
    var R = rng(1000 + i * 7919);
    // Curvature, one value per metre: straight start and finish, alternating bends between.
    var n = len + 1, kap = new Float32Array(n), pieces = [], s = 28, sign = R() < 0.5 ? -1 : 1;
    while (s < len - 38) {
      var straight = lerp(26, 16, d) * (0.7 + R() * 0.5);
      s += straight;
      var bend = lerp(28, 46, R()), k = sign * lerp(0.007, 0.012 + 0.01 * d, R());
      if (s + bend > len - 32) break;
      pieces.push([s, s + bend, k]);
      s += bend; sign = -sign;
    }
    for (var m = 0; m < n; m++) {
      var v = 0;
      for (var p = 0; p < pieces.length; p++) {
        var a = pieces[p][0], b = pieces[p][1];
        if (m > a && m < b) v = pieces[p][2] * clamp(M.min(m - a, b - m) / 10, 0, 1);
      }
      kap[m] = v;
    }
    // Centre line: heading th, position (px, pz). Forward = (sin th, -cos th).
    var px = new Float32Array(n), pz = new Float32Array(n), th = new Float32Array(n);
    for (m = 1; m < n; m++) {
      th[m] = th[m - 1] + (kap[m - 1] + kap[m]) / 2;
      var h = (th[m - 1] + th[m]) / 2;
      px[m] = px[m - 1] + M.sin(h);
      pz[m] = pz[m - 1] - M.cos(h);
    }
    // Checkpoints: joyful healing/boost arches roughly every 58 m.
    var cps = [0], nc = M.max(3, M.round(len / 58));
    for (var c = 1; c < nc; c++) cps.push(M.round(len * c / nc));
    // Obstacles + turbo speed pads + jump ramps: dense arcade rhythm!
    var kinds = ER.WORLDS[world].kinds.slice(0, M.min(7, 3 + local * 2 + (world > 0 ? 1 : 0)));
    var items = [], last = '', gap = lerp(21, 13, d), stepIdx = 0;
    function nearCp(at) { for (var q = 1; q < cps.length; q++) if (M.abs(cps[q] - at) < 7) return true; return false; }
    var script = i === 0 ? [['pad', 1], ['cone1', 0], ['ramp', 2], ['cones2', 1], ['hurdleFull', 0], ['pad', 2]] : [['pad', R() < 0.5 ? 1 : 2]];
    s = 25;
    while (s < len - 24) {
      if (nearCp(s)) { s += 5; continue; }
      var kind, lane = R();
      if (script.length) { var sc = script.shift(); kind = sc[0]; lane = sc[1]; }
      else if (stepIdx % 3 === 2 && last !== 'pad' && last !== 'ramp') { kind = (stepIdx % 6 === 2) ? 'ramp' : 'pad'; }
      else { do { kind = kinds[M.floor(R() * kinds.length)]; } while (kind === last && kinds.length > 1); }
      last = kind;
      stepIdx++;
      s = addPattern(items, kind, s, lane, R, d, len);
      s += gap * (0.82 + R() * 0.32);
    }
    items = items.filter(function (it) { return it.s > 20 && it.s < len - 20; });
    items.sort(function (x, y) { return x.s - y.s; });
    items.forEach(function (it, idx) { it.i = idx; });
    // Coin arcs: opening line, soaring arcs over jump ramps, and streaks after turbo pads!
    var coins = [];
    for (var c0 = 0; c0 < 4; c0++) coins.push({ s: 10 + c0 * 2.8, x: 0, y: 0.9 });
    items.forEach(function (it) {
      if (it.k === 'ramp') {
        for (var q = 0; q < 5; q++) {
          var cs = it.s + 2.0 + q * 2.1;
          if (cs < len - 12) coins.push({ s: cs, x: it.x, y: 0.9 + M.sin((q + 0.5) / 5 * M.PI) * 2.0 });
        }
      } else if (it.k === 'pad') {
        for (var q2 = 0; q2 < 3; q2++) {
          var cs2 = it.s + 2.8 + q2 * 2.4;
          if (cs2 < len - 12) coins.push({ s: cs2, x: it.x, y: 0.9 });
        }
      }
    });
    // Golden eggs: three per track, over a hurdle/ramp (jump for it) or out at the edge.
    var gold = [];
    [0.28, 0.58, 0.85].forEach(function (f) {
      var want = len * f, best = null;
      items.forEach(function (it) {
        if ((it.k === 'hurdle' || it.k === 'ramp') && M.abs(it.s - want) < 34 && (!best || M.abs(it.s - want) < M.abs(best.s - want))) best = it;
      });
      if (best && !gold.some(function (g) { return g.s === best.s; })) {
        gold.push({ s: best.s + (best.k === 'ramp' ? 4 : 0), x: clamp(best.x + (R() - 0.5) * best.hw * 0.6, -2.5, 2.5), need: 0.3 });
      } else {
        var at = want;
        for (var tries = 0; tries < 30 && items.some(function (it) { return M.abs(it.s - at) < 5; }); tries++) at += 3;
        gold.push({ s: M.round(clamp(at, 22, len - 18)), x: R() < 0.5 ? -2.6 : 2.6, need: 0 });
      }
    });
    var t = { i: i, id: ER.trackId(i), world: world, len: len, kap: kap, px: px, pz: pz, th: th, cps: cps, items: items, gold: gold, coins: coins };
    cache[i] = t;
    return t;
  };

  function item(k, s, x, hw, hd, h, extra) {
    var o = { k: k, s: s, x: x, hw: hw, hd: hd, h: h };
    for (var key in extra) o[key] = extra[key];
    return o;
  }
  var LANES = [-2.4, -0.8, 0.8, 2.4];
  // Adds one pattern at s and returns where it ends.
  function addPattern(items, kind, s, lane, R, d, len) {
    var L = LANES[M.floor(lane * 4) % 4];
    switch (kind) {
      case 'cone1': items.push(item('cone', s, lane === 0 ? 0 : L, 0.35, 0.35, 0.6)); return s;
      case 'cones2': {
        var gapAt = M.floor(R() * 4);
        for (var j = 0; j < 4; j++) if (j !== gapAt && (j === (gapAt + 1) % 4 || j === (gapAt + 3) % 4)) items.push(item('cone', s, LANES[j], 0.35, 0.35, 0.6));
        return s;
      }
      case 'slalom': {
        var side = R() < 0.5 ? -1 : 1;
        for (var q = 0; q < 3; q++) items.push(item('cone', s + q * 8, side * (q % 2 ? -1.3 : 1.3), 0.35, 0.35, 0.6));
        return s + 16;
      }
      case 'hurdleFull': items.push(item('hurdle', s, 0, ER.TRACK_W, 0.25, 0.5, { full: true })); return s;
      case 'hurdleHalf': {
        var hs = R() < 0.5 ? -1 : 1;
        items.push(item('hurdle', s, hs * 2.1, 2.2, 0.25, 0.5, { full: false })); return s;
      }
      case 'puddle': items.push(item('puddle', s, clamp(L * 0.8, -2.2, 2.2), 1.3, 1.0, 0.05)); return s;
      case 'ball': items.push(item('ball', s, 0, 0.55, 0.55, 1.1, { amp: 2.9, per: lerp(4.2, 3, d), ph: R() * 6.28 })); return s;
      case 'critters': {
        var nc = 1 + M.floor(R() * (1 + d * 2.5));
        for (var c = 0; c < nc; c++) items.push(item('critter', s + c * 3.5, 0, 0.35, 0.3, 0.5, { sp: lerp(1.1, 1.9, R()), ph: R() * 14 }));
        return s + (nc - 1) * 3.5;
      }
      case 'sprinkler': {
        var sx = clamp(L, -2.4, 2.4);
        items.push(item('sprinkler', s, sx, 0.85, 0.85, 3, { per: 2.6, on: 1.3, ph: R() * 2.6 }));
        if (d > 0.4) items.push(item('sprinkler', s + 9, -sx, 0.85, 0.85, 3, { per: 2.6, on: 1.3, ph: R() * 2.6 }));
        return s + 9;
      }
      case 'pad': {
        var px2 = clamp(L * 0.75, -2.1, 2.1);
        items.push(item('pad', s, px2, 1.35, 1.6, 0.05));
        return s + 3;
      }
      case 'ramp': {
        var rx2 = clamp(L * 0.65, -1.8, 1.8);
        items.push(item('ramp', s, rx2, 1.5, 1.4, 0.5));
        return s + 7;
      }
    }
    return s;
  }

  // Where an item is (sideways) at race time t, and whether it is active.
  ER.itemX = function (it, t) {
    if (it.k === 'ball') return it.amp * M.sin(t * 6.2832 / it.per + it.ph);
    if (it.k === 'critter') {
      // Walks across and back between the edges (a triangle wave).
      var span = 7, p = ((t + it.ph) * it.sp) % (span * 2);
      return p < span ? -3.5 + p : 3.5 - (p - span);
    }
    return it.x;
  };
  ER.critterDir = function (it, t) { var p = ((t + it.ph) * it.sp) % 14; return p < 7 ? 1 : -1; };
  ER.sprinklerOn = function (it, t) { return ((t + it.ph) % it.per + it.per) % it.per < it.on; };

  // Curvature, heading and the centre line at distance s (interpolated).
  ER.kappa = function (tr, s) { var i = clamp(M.floor(s), 0, tr.len); return tr.kap[i]; };
  ER.frame = function (tr, s, out) {
    var c = clamp(s, 0, tr.len), i = M.min(tr.len - 1, M.floor(c)), f = c - i;
    var th = tr.th[i] + (tr.th[i + 1] - tr.th[i]) * f;
    out = out || {};
    out.x = tr.px[i] + (tr.px[i + 1] - tr.px[i]) * f;
    out.z = tr.pz[i] + (tr.pz[i + 1] - tr.pz[i]) * f;
    // Beyond the finish the line goes straight on.
    if (s > tr.len) { out.x += M.sin(th) * (s - tr.len); out.z -= M.cos(th) * (s - tr.len); }
    out.th = th;
    return out;
  };
  // World position of track point (s, lateral x).
  ER.toWorld = function (tr, s, x, out) {
    out = ER.frame(tr, s, out);
    out.x += M.cos(out.th) * x;
    out.z += M.sin(out.th) * x;
    return out;
  };

  /* ------------------------------------------------------------ difficulty */
  // level 0..1 (from Kit.dda in game.js) -> the knobs the race uses.
  ER.tuning = function (level) {
    var l = clamp(level || 0, 0, 1);
    return {
      cpuSpeed: lerp(0.84, 1.08, l),    // CPU jog speed relative to the player's
      sens: lerp(0.42, 0.98, l),        // how strongly running shakes the egg
      cradle: lerp(3.4, 1.1, l),        // how much the spoon pulls the egg back to the middle
      damp: lerp(2.1, 1.2, l),
      hurdleH: lerp(0.35, 0.52, l),
      cpuSkill: lerp(0.55, 0.92, l)     // how often CPUs see an obstacle in time
    };
  };

  /* ------------------------------------------------------------ race */
  ER.CPU = [
    { name: 'زوزو', skin: 2 }, { name: 'لولو', skin: 4 }, { name: 'سوسو', skin: 3 }
  ];
  // opts: { humans: 1|2, cpus, tune (ER.tuning), seed, skins: [p1, p2], demo }
  ER.create = function (trackIndex, opts) {
    opts = opts || {};
    var tr = ER.track(trackIndex), demo = !!opts.demo;
    var humans = demo ? 0 : (opts.humans === 2 ? 2 : 1);
    var cpus = opts.cpus == null ? (demo ? 4 : (humans === 2 ? 2 : 3)) : opts.cpus;
    var tune = opts.tune || ER.tuning(0.35), R = rng(opts.seed == null ? 77 : opts.seed);
    var count = humans + cpus, runners = [];
    var lanes = count === 4 ? [-2.4, -0.8, 0.8, 2.4] : [-1.6, 0, 1.6];
    // Players start in the middle lanes.
    var order = count === 4 ? (humans === 2 ? [1, 2, 0, 3] : [1, 0, 2, 3]) : [1, 0, 2];
    // CPU looks: never the same outfit as a player.
    var taken = [], cpuSkins = [];
    for (var h = 0; h < M.max(1, humans); h++) taken.push((opts.skins && opts.skins[h]) || 0);
    [2, 4, 3, 1, 5, 6, 0].forEach(function (sk) { if (taken.indexOf(sk) < 0 && cpuSkins.length < 4) cpuSkins.push(sk); });
    for (var i = 0; i < count; i++) {
      var human = i < humans, cpu = human ? null : ER.CPU[(i - humans) % ER.CPU.length];
      var sk = human ? taken[i] : (demo && i === 0 ? taken[0] : cpuSkins[(i - humans) % cpuSkins.length]);
      runners.push({
        i: i, human: human, name: human ? '' : cpu.name, skin: sk,
        s: 0, x: lanes[order[i]], v: 0, vx: 0, y: 0, vy: 0, air: false, lean: 0,
        e: 0, ev: 0, ph: R() * 6.28, state: 'run', timer: 0, stun: 0, ghost: 0, slow: 0, splash: 0, boost: 0, jumpBuf: 0,
        cracks: 0, coins: 0, combo: 0, comboT: 0,
        cp: 0, drops: 0, gold: 0, hits: 0, jumps: 0, cleared: 0, finished: false, finishT: 0, place: 0, warn: false,
        lastHit: -1, hitCd: 0, phase: 0,
        ai: human ? null : { speed: tune.cpuSpeed * (0.97 + 0.06 * R()), tx: lanes[order[i]], seen: {}, react: {}, think: 0, jumpAt: -1 }
      });
    }
    return {
      track: tr, tune: tune, humans: humans, demo: demo, runners: runners, rng: R,
      phase: demo ? 'race' : 'count', clock: 0, t: 0,
      goldTaken: tr.gold.map(function () { return -1; }),
      coinsTaken: tr.coins.map(function () { return -1; }),
      finishers: 0, over: false, overT: 0, ev: [], lastCount: 4
    };
  };

  function emit(race, e) { if (race.ev.length < 64) race.ev.push(e); }

  // inputs[i] for each human: { steer: -1..1, up, down, jump (pressed this step) }
  ER.step = function (race, dt, inputs) {
    race.clock += dt;
    if (race.phase === 'count') {
      var left = ER.COUNTDOWN - race.clock;
      var n = left > ER.COUNTDOWN * 0.66 ? 3 : left > ER.COUNTDOWN * 0.33 ? 2 : left > 0 ? 1 : 0;
      if (n < race.lastCount && n > 0) { race.lastCount = n; emit(race, { t: 'count', n: n }); }
      // Wiggle in place while waiting: steering only, no running.
      for (var w = 0; w < race.humans; w++) {
        var rr = race.runners[w], inp0 = (inputs && inputs[w]) || {};
        rr.lean = approach(rr.lean, (inp0.steer || 0) * 0.5, dt * 8);
      }
      if (left <= 0) { race.phase = 'race'; race.t = 0; emit(race, { t: 'count', n: 0 }); }
      return;
    }
    race.t += dt;
    var leader = 0, lead = null;
    for (var i = 0; i < race.runners.length; i++) {
      var r = race.runners[i];
      if (r.human && (!lead || r.s > lead.s)) lead = r;
    }
    for (i = 0; i < race.runners.length; i++) {
      r = race.runners[i];
      var inp = r.human ? (inputs && inputs[i]) || {} : think(race, r, dt, lead);
      stepRunner(race, r, dt, inp);
      if (!r.finished) leader = M.max(leader, r.s);
    }
    places(race);
    if (race.over) race.overT += dt;
  };

  function think(race, r, dt, lead) {
    var a = r.ai, tr = race.track, t = race.t, inp = { steer: 0, jump: false };
    // Rubber band: CPUs far ahead of the players ease off, CPUs behind speed up.
    var gap = lead ? lead.s - r.s : 0, end = r.s > tr.len * 0.85 ? 0.5 : 1;
    var band = clamp(1 + gap * 0.012 * end, 0.82, 1.18);
    if (lead && lead.state === 'splat') band = M.min(band, 1);
    a.vt = ER.V_JOG * a.speed * band;
    // Look ahead and pick a lane that is clear, or plan a jump.
    a.think -= dt;
    if (a.think <= 0) {
      a.think = 0.12;
      var want = a.tx, jumpAt = -1;
      for (var k = 0; k < tr.items.length; k++) {
        var it = tr.items[k], ds = it.s - r.s;
        if (ds < 0.5 || ds > 16) continue;
        if (it.k === 'pad' || it.k === 'ramp') {
          if (M.abs(it.x - want) < 2.2 && ds > 3) want = it.x;
          continue;
        }
        if (a.react[k] == null) a.react[k] = race.rng() < race.tune.cpuSkill;
        if (!a.react[k]) continue;
        var arrive = t + ds / M.max(1, r.v), ix = ER.itemX(it, arrive);
        if (it.k === 'sprinkler' && !ER.sprinklerOn(it, arrive) && !ER.sprinklerOn(it, arrive + 0.3)) continue;
        var blocked = M.abs(ix - want) < it.hw + 0.6;
        if (!blocked) continue;
        if (it.k === 'hurdle' && (it.full || ds < 6)) { jumpAt = it.s; continue; }
        if ((it.k === 'puddle' || it.k === 'critter') && ds < 5) { jumpAt = it.s; continue; }
        // Nearest clear lane.
        var best = want, bestCost = 1e9;
        for (var c = -3; c <= 3; c++) {
          var cx = c * 1.1;
          if (M.abs(ix - cx) < it.hw + 0.7) continue;
          var cost = M.abs(cx - r.x);
          if (cost < bestCost) { bestCost = cost; best = cx; }
        }
        want = best;
      }
      a.tx = want;
      a.jumpAt = jumpAt;
    }
    var dx = a.tx - r.x;
    inp.steer = M.abs(dx) < 0.15 ? 0 : clamp(dx * 1.5, -1, 1);
    if (a.jumpAt >= 0) {
      var dj = a.jumpAt - r.s, lead2 = 1.4 + r.v * 0.12;
      if (dj > 0 && dj < lead2) { inp.jump = true; a.jumpAt = -1; }
    }
    return inp;
  }

  function stepRunner(race, r, dt, inp) {
    var tr = race.track, tune = race.tune;
    r.hitCd = M.max(0, r.hitCd - dt);
    r.ghost = M.max(0, r.ghost - dt);
    if (r.state === 'splat') {
      r.timer -= dt;
      r.v = M.max(0, r.v - 16 * dt);
      r.s += r.v * dt;
      r.vx = 0;
      if (r.timer <= 0) respawn(race, r);
      return;
    }
    var stunned = r.stun > 0;
    r.stun = M.max(0, r.stun - dt);
    r.slow = M.max(0, r.slow - dt);
    r.splash = M.max(0, r.splash - dt);
    r.boost = M.max(0, r.boost - dt);
    r.comboT = M.max(0, r.comboT - dt);
    if (r.comboT <= 0) r.combo = 0;
    // Forward speed.
    var vt;
    if (r.finished) vt = 3.5;
    else if (r.human) vt = r.boost > 0 ? ER.V_TURBO : (inp.up ? ER.V_SPRINT : inp.down ? ER.V_SLOW : ER.V_JOG);
    else vt = r.boost > 0 ? ER.V_TURBO * 0.92 : r.ai.vt;
    if (r.slow > 0) vt *= 0.65;
    if (stunned) vt *= 0.45;
    r.v = approach(r.v, vt, (vt > r.v ? (r.boost > 0 ? 18 : 10) : 14) * dt);
    // Sideways: smooth steering + gentle inward cushion bounce on wall contact (never deadlocks!).
    var steer = stunned || r.finished ? 0 : clamp(inp.steer || 0, -1, 1);
    var vxPrev = r.vx, wallBounce = 0;
    r.vx = approach(r.vx, steer * ER.VX_MAX, 34 * dt);
    r.x += r.vx * dt;
    if (r.x > ER.HALF) {
      r.x = ER.HALF;
      r.vx = -M.max(1.8, M.abs(r.vx) * 0.45);
      wallBounce = 1;
    } else if (r.x < -ER.HALF) {
      r.x = -ER.HALF;
      r.vx = M.max(1.8, M.abs(r.vx) * 0.45);
      wallBounce = -1;
    }
    var ax = wallBounce ? 0 : (r.vx - vxPrev) / dt;
    if (wallBounce && r.e * wallBounce > 0.2) {
      // Soft curb cushion nudges egg inward off the wall instead of trapping it.
      r.ev -= wallBounce * 1.45;
      r.e = clamp(r.e, -0.82, 0.82);
    }
    // Jump (with a short buffer so an early press still counts).
    // Helper: after two trips on the same hurdle the runner hops it by itself (nobody gets stuck).
    if (r.human && !r.air && r.trips) {
      for (var hk in r.trips) {
        var hi = tr.items[hk], dh = hi.s - r.s;
        if (r.trips[hk] >= 2 && dh > 0 && dh < 1.8 + r.v * 0.12 && M.abs(hi.x - r.x) < hi.hw + 0.4) { inp = { steer: inp.steer, up: inp.up, down: inp.down, jump: true }; r.helped = true; }
      }
    }
    if (inp.jump) r.jumpBuf = 0.2;
    else r.jumpBuf = M.max(0, r.jumpBuf - dt);
    if (r.jumpBuf > 0 && !r.air && !stunned && !r.finished) {
      r.air = true; r.vy = ER.JUMP_V; r.jumpBuf = 0; r.jumps++;
      emit(race, { t: 'jump', r: r.i });
    }
    if (r.air) {
      r.vy -= ER.GRAVITY * dt;
      r.y += r.vy * dt;
      if (r.y <= 0) {
        r.y = 0; r.air = false; r.vy = 0;
        if (!r.finished) r.ev += (race.rng() - 0.5) * 0.75 * tune.sens;
        emit(race, { t: 'land', r: r.i });
      }
    }
    var s0 = r.s;
    r.s += r.v * dt;
    r.phase += r.v * dt * 1.35;
    // The egg on the spoon (counter-lean driven directly by player steer input!).
    if (!r.finished) egg(race, r, dt, ax, steer);
    if (r.state !== 'run') return;
    if (!r.finished) {
      collide(race, r, s0);
      if (r.state !== 'run') return;
      if (r.human) collect(race, r);
      for (var c = r.cp + 1; c < tr.cps.length; c++) {
        if (r.s >= tr.cps[c]) {
          r.cp = c;
          r.boost = M.max(r.boost, 0.55);
          if (r.cracks > 0) { r.cracks = 0; emit(race, { t: 'heal', r: r.i }); }
          emit(race, { t: 'cp', r: r.i, i: c });
        }
      }
      if (r.s >= tr.len) {
        r.finished = true; r.finishT = race.t; race.finishers++;
        r.place = race.finishers;
        r.e *= 0.3; r.ev = 0;
        emit(race, { t: 'finish', r: r.i, place: r.place, human: r.human });
        if (r.human && race.runners.every(function (q) { return !q.human || q.finished; })) race.over = true;
      }
    }
  }

  function egg(race, r, dt, ax, steer) {
    var tune = race.tune, t = race.t;
    var target;
    // Drive counter-lean from player input (inp.steer), NEVER from clamped r.vx!
    if (r.human) target = steer;
    else target = clamp(1.6 * r.e + 0.5 * r.ev, -1, 1) * (0.35 + 0.5 * race.tune.cpuSkill) + (r.vx / ER.VX_MAX) * 0.2;
    r.lean = approach(r.lean, target, dt * 11);
    var v = M.min(1.15, r.v / ER.V_SPRINT);
    var noise = 0.55 * M.sin(4.3 * t + r.ph) + 0.35 * M.sin(9.1 * t + 1.7 * r.ph) + 0.3 * M.sin(1.9 * t + 2.3 * r.ph);
    var amp = tune.sens * (0.28 + 1.05 * v * v);
    if (r.boost > 0) amp *= 0.55;
    if (r.splash > 0) amp *= 1.75;
    var acc = -r.lean * K_LEAN - ax * K_AX - ER.kappa(race.track, r.s) * r.v * r.v * K_TURN + noise * amp;
    var ae = M.abs(r.e);
    acc += -tune.cradle * r.e + (ae > RIM ? RIM_PUSH * (ae - RIM) * (r.e > 0 ? 1 : -1) : 0);
    r.ev += acc * dt;
    r.ev -= r.ev * tune.damp * dt;
    r.e += r.ev * dt;
    var warn = M.abs(r.e) > 0.7;
    if (warn && !r.warn) emit(race, { t: 'wobble', r: r.i });
    r.warn = warn;
    if (M.abs(r.e) > 1) drop(race, r);
  }

  function drop(race, r) {
    r.state = 'splat'; r.timer = 0.55; r.drops++; r.cracks = 0;
    emit(race, { t: 'drop', r: r.i, side: r.e > 0 ? 1 : -1, s: r.s, x: r.x, human: r.human });
  }

  function respawn(race, r) {
    // Quick in-place recovery (at most 2 m step-back — ZERO rage-quit 75 m rollbacks!).
    r.s = M.max(0, r.s - 2); r.x = clamp(r.x, -2.5, 2.5); r.v = ER.V_JOG * 0.55; r.vx = 0; r.y = 0; r.vy = 0; r.air = false;
    r.e = 0; r.ev = 0; r.lean = 0; r.cracks = 0; r.state = 'run'; r.ghost = 1.6; r.stun = 0; r.slow = 0; r.splash = 0; r.warn = false;
    if (r.ai) { r.ai.tx = 0; r.ai.jumpAt = -1; r.ai.react = {}; }
    emit(race, { t: 'respawn', r: r.i });
  }

  var IMPULSE = { cone: 1.15, hurdle: 1.45, ball: 1.75, critter: 1.4, sprinkler: 1.55 };
  function collide(race, r, s0) {
    var tr = race.track, t = race.t, items = tr.items, tune = race.tune;
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      if (it.s - it.hd - 0.3 > r.s) break;
      if (it.s + it.hd + 0.3 < s0) continue;
      var ix = ER.itemX(it, t);
      if (M.abs(r.x - ix) > it.hw + 0.35) continue;
      // Helpful pads and jump ramps always trigger even while ghost-protected!
      if (it.k === 'pad') {
        if (r.y < 0.6 && !(r.lastHit === k && r.hitCd > 0)) {
          r.lastHit = k; r.hitCd = 0.5;
          r.boost = M.max(r.boost, 1.55);
          r.v = M.max(r.v, ER.V_TURBO * 0.92);
          r.e *= 0.6; r.ev *= 0.4;
          emit(race, { t: 'pad', r: r.i, s: it.s, x: ix });
        }
        continue;
      }
      if (it.k === 'ramp') {
        if (!r.air && !(r.lastHit === k && r.hitCd > 0)) {
          r.lastHit = k; r.hitCd = 0.6;
          r.air = true; r.vy = ER.RAMP_V; r.jumps++;
          r.boost = M.max(r.boost, 0.95);
          r.v = M.max(r.v, ER.V_SPRINT);
          r.e *= 0.65; r.ev *= 0.45;
          emit(race, { t: 'ramp', r: r.i, s: it.s, x: ix });
        }
        continue;
      }
      if (r.ghost > 0) continue;
      var h = it.k === 'hurdle' ? tune.hurdleH : it.h;
      if (it.k === 'sprinkler' && !ER.sprinklerOn(it, t)) continue;
      if (r.y > h) {
        if (it.k === 'hurdle' && r.lastHit !== k) { r.lastHit = k; r.cleared++; emit(race, { t: 'clear', r: r.i, k: it.k }); }
        continue;
      }
      if (r.lastHit === k && r.hitCd > 0) continue;
      r.lastHit = k; r.hitCd = 0.7;
      if (it.k === 'puddle') {
        r.slow = 0.55; r.splash = 0.55;
        emit(race, { t: 'splash', r: r.i, s: it.s, x: ix });
        continue;
      }
      var side = r.x === ix ? (race.rng() < 0.5 ? -1 : 1) : (r.x > ix ? 1 : -1);
      r.ev += side * IMPULSE[it.k] * (0.8 + 0.35 * race.rng());
      r.hits++;
      if (it.k === 'hurdle') {
        // Funny bounce + brief wobble + 2-crack egg shield instead of instant 75 m rollback!
        r.trips = r.trips || {}; r.trips[k] = (r.trips[k] || 0) + 1;
        r.cracks++;
        r.stun = 0.25;
        r.v *= 0.58;
        r.air = true; r.vy = 4.6;
        emit(race, { t: 'hit', r: r.i, k: it.k, i: k, s: it.s, x: ix, human: r.human, crack: r.cracks });
        if (r.cracks >= 2) { r.e = side * 1.01; drop(race, r); return; }
        continue;
      }
      r.stun = 0.28;
      r.v *= 0.62;
      if (it.k === 'sprinkler' || it.k === 'ball') r.vx = side * 3.6;
      emit(race, { t: 'hit', r: r.i, k: it.k, i: k, s: it.s, x: ix, human: r.human });
    }
  }

  function collect(race, r) {
    var g = race.track.gold;
    for (var k = 0; k < g.length; k++) {
      if (race.goldTaken[k] >= 0) continue;
      if (M.abs(g[k].s - r.s) < 1.25 && M.abs(g[k].x - r.x) < 1.15 && r.y >= g[k].need) {
        race.goldTaken[k] = r.i; r.gold++;
        emit(race, { t: 'gold', r: r.i, i: k });
      }
    }
    var cs = race.track.coins;
    for (k = 0; k < cs.length; k++) {
      if (race.coinsTaken[k] >= 0) continue;
      if (M.abs(cs[k].s - r.s) < 1.3 && M.abs(cs[k].x - r.x) < 1.25 && M.abs(cs[k].y - (r.y + 0.85)) < 1.5) {
        race.coinsTaken[k] = r.i; r.coins++;
        r.combo = r.comboT > 0 ? r.combo + 1 : 1;
        r.comboT = 2.2;
        emit(race, { t: 'coin', r: r.i, i: k, combo: r.combo });
      }
    }
  }

  // Live places: finishers by finish order, then by distance.
  function places(race) {
    var list = race.runners.slice().sort(function (a, b) {
      if (a.finished && b.finished) return a.place - b.place;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.s - a.s;
    });
    for (var i = 0; i < list.length; i++) list[i].rank = i + 1;
  }
  ER.progress = function (race, r) { return clamp(r.s / race.track.len, 0, 1); };

  /* ------------------------------------------------------------ results */
  // Stars: 1 = finished, 2 = first place, 3 = never dropped the egg.
  ER.stars = function (r) {
    if (!r.finished) return 0;
    return 1 + (r.place === 1 ? 1 : 0) + (r.drops === 0 ? 1 : 0);
  };
  ER.starFlags = function (r) { return [r.finished, r.finished && r.place === 1, r.finished && r.drops === 0]; };
  // 0..1 for Kit.dda (one-player races only).
  ER.outcome = function (r) {
    var p = [1, 0.7, 0.4, 0.15][clamp(r.place - 1, 0, 3)];
    return clamp(p * 0.75 + M.max(0, 0.25 - r.drops * 0.1), 0, 1);
  };
  ER.reward = function (r) { return (r.gold || 0) + M.floor((r.coins || 0) / 8) + [3, 2, 1, 1][clamp(r.place - 1, 0, 3)]; };

  /* ------------------------------------------------------------ skins + save */
  // Runner looks: shirt, shorts, hair, extra (hat kind), price in golden eggs.
  ER.RUNNERS = [
    { name: 'رياضي', shirt: '#ff4d4d', shorts: '#2b59c3', hair: '#3b2416', hat: 'cap', capColor: '#ffd23f', price: 0 },
    { name: 'كتكوت', shirt: '#ffd23f', shorts: '#ff9f1c', hair: '#ffd23f', hat: 'crest', capColor: '#ff5a36', price: 5 },
    { name: 'بطل أزرق', shirt: '#2ea8ff', shorts: '#1b3a8a', hair: '#1f1a17', hat: 'band', capColor: '#ffffff', price: 0 },
    { name: 'ديناصور', shirt: '#4cd964', shorts: '#2a8f3d', hair: '#4cd964', hat: 'spikes', capColor: '#ffe14d', price: 8 },
    { name: 'وردي', shirt: '#ff6fb5', shorts: '#8e44ad', hair: '#6b3b1e', hat: 'bun', capColor: '#ff6fb5', price: 10 },
    { name: 'أرنب', shirt: '#f4f4f8', shorts: '#ff8fb8', hair: '#f4f4f8', hat: 'ears', capColor: '#ffb3cf', price: 12 },
    { name: 'رائد فضاء', shirt: '#e8eef7', shorts: '#ff7a1a', hair: '#e8eef7', hat: 'helmet', capColor: '#5bd1ff', price: 16 },
    { name: 'ملك السباق', shirt: '#7a3cff', shorts: '#2b1a66', hair: '#2b1a10', hat: 'crown', capColor: '#ffd23f', price: 22 }
  ];
  ER.EGGS = [
    { name: 'أبيض', base: '#fffaf0', spot: null, price: 0 },
    { name: 'بني', base: '#e3b07a', spot: null, price: 3 },
    { name: 'منقّط', base: '#fff3df', spot: '#c98a4b', price: 5 },
    { name: 'ديناصور', base: '#9be564', spot: '#3c8d2f', price: 8 },
    { name: 'قوس قزح', base: 'rainbow', spot: null, price: 12 },
    { name: 'ذهبي', base: '#ffcc1a', spot: '#fff2a8', price: 18 }
  ];
  ER.SAVE_VERSION = 2;
  ER.newSave = function () {
    return { v: 2, stars: zeros(9), best: zeros(9), gold: zeros(9), eggs: 0, runner: 0, egg: 0, ownR: [0, 2], ownE: [0], coach: false, duo: false };
  };
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  // Old saves (other shapes) are ignored; bad values are cleaned up.
  ER.loadSave = function (raw) {
    var s = ER.newSave();
    if (!raw || typeof raw !== 'object' || raw.v !== 2) return s;
    function nums(a, max) { return Array.isArray(a) ? s.stars.map(function (_, i) { var v = +a[i]; return isFinite(v) ? clamp(v, 0, max) : 0; }) : zeros(9); }
    s.stars = nums(raw.stars, 3).map(M.floor);
    s.best = nums(raw.best, 3600);
    s.gold = nums(raw.gold, 3).map(M.floor);
    s.eggs = isFinite(+raw.eggs) ? clamp(M.floor(+raw.eggs), 0, 99999) : 0;
    function owned(a, list) { var o = (Array.isArray(a) ? a : []).filter(function (i) { return i === (i | 0) && i >= 0 && i < list.length; }); return o; }
    s.ownR = owned(raw.ownR, ER.RUNNERS); if (s.ownR.indexOf(0) < 0) s.ownR.push(0); if (s.ownR.indexOf(2) < 0) s.ownR.push(2);
    s.ownE = owned(raw.ownE, ER.EGGS); if (s.ownE.indexOf(0) < 0) s.ownE.push(0);
    s.runner = s.ownR.indexOf(raw.runner) >= 0 ? raw.runner : 0;
    s.egg = s.ownE.indexOf(raw.egg) >= 0 ? raw.egg : 0;
    s.coach = !!raw.coach;
    s.duo = !!raw.duo;
    return s;
  };
  ER.isOpen = function (save, i) { return i === 0 || save.stars[i - 1] > 0; };
  ER.totalStars = function (save) { return save.stars.reduce(function (a, b) { return a + b; }, 0); };
  ER.nextTrack = function (save) {
    for (var i = 0; i < 9; i++) if (!save.stars[i]) return i;
    var low = 0;
    for (i = 1; i < 9; i++) if (save.stars[i] < save.stars[low]) low = i;
    return low;
  };
  // Records a finished one-player race; returns what changed.
  ER.record = function (save, i, r) {
    var stars = ER.stars(r), out = { stars: stars, newStars: M.max(0, stars - save.stars[i]), newBest: false, reward: ER.reward(r) };
    if (!r.finished) return out;
    var wasOpen = i < 8 ? ER.isOpen(save, i + 1) : true;
    save.stars[i] = M.max(save.stars[i], stars);
    if (!save.best[i] || r.finishT < save.best[i]) { out.newBest = !!save.best[i]; save.best[i] = M.round(r.finishT * 100) / 100; }
    save.gold[i] = M.max(save.gold[i], r.gold);
    save.eggs += out.reward;
    out.unlocked = i < 8 && !wasOpen && ER.isOpen(save, i + 1);
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ER;
  else root.ER = ER;
})(this);
