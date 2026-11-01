/* سباق التوربو — deterministic kart race. No DOM, no Kit, no stats. */
(function () {
  'use strict';
  var TAU = Math.PI * 2;
  var VBASE = 96;
  var PLACE = [10, 8, 6, 5, 4, 3];
  var IDS = ['jelly', 'spring', 'shield', 'cookie', 'rocket'];
  // 1st never rolls a rocket. Later places do, more often the further back you are.
  var ODDS = [
    [46, 28, 18, 8, 0],
    [32, 24, 20, 18, 6],
    [22, 20, 18, 24, 16],
    [14, 16, 18, 26, 26],
    [8, 12, 16, 28, 36],
    [4, 8, 12, 30, 46]
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  function mulberry32(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function pointAt(track, s) {
    var pts = track.pts, cum = track.cum, total = track.total, n = pts.length;
    s = ((s % total) + total) % total;
    var lo = 0, hi = n - 1, mid;
    while (lo < hi) {
      mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid - 1;
    }
    var seg = lo, span = cum[seg + 1] - cum[seg] || 1, u = (s - cum[seg]) / span;
    var a = pts[seg], b = pts[(seg + 1) % n];
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    return { x: a.x + dx * u, y: a.y + dy * u, tx: dx / L, ty: dy / L, nx: -dy / L, ny: dx / L, seg: seg, s: s };
  }

  function rollItem(place, rng) {
    var row = ODDS[clamp(place | 0, 1, 6) - 1];
    var x = rng() * 100, acc = 0, i;
    for (i = 0; i < 5; i++) { acc += row[i]; if (x < acc) return IDS[i]; }
    return 'jelly';
  }

  function ttPoints(par, total) {
    return Math.max(1, Math.round(par * 100 / Math.max(0.01, total)));
  }

  // Proper segment cross. Shared endpoints and grazes do not count.
  function crosses(a, b, c, d) {
    function o(p, q, r) { return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x); }
    var o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 * o2 < 0 && o3 * o4 < 0;
  }

  function intersections(track) {
    var pts = track.pts, n = pts.length, out = [], i, j, a, b, c, d;
    for (i = 0; i < n; i++) {
      a = pts[i]; b = pts[(i + 1) % n];
      for (j = i + 1; j < n; j++) {
        if (j === i + 1) continue;
        if (i === 0 && j === n - 1) continue;
        c = pts[j]; d = pts[(j + 1) % n];
        if (crosses(a, b, c, d)) out.push([i, j]);
      }
    }
    return out;
  }

  function zoneAt(track, s) {
    var z = track.zones, i, a, b;
    for (i = 0; i < z.length; i++) {
      a = z[i].s0; b = z[i].s1;
      if (a <= b) { if (s >= a && s < b) return z[i].kind; }
      else if (s >= a || s < b) return z[i].kind;
    }
    return '';
  }

  function projectSeg(pts, i, px, py) {
    var n = pts.length, a = pts[i], b = pts[(i + 1) % n];
    var dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    var t = ((px - a.x) * dx + (py - a.y) * dy) / L2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var x = a.x + dx * t, y = a.y + dy * t;
    var ddx = px - x, ddy = py - y;
    return { i: i, u: t, x: x, y: y, d: ddx * ddx + ddy * ddy };
  }

  // Stay near the segment we were on. Searching the whole loop hops a wiggle and skips a gate.
  function project(track, k) {
    var pts = track.pts, n = pts.length, seg0 = k.seg || 0;
    var best = null, j, i, hit, span;
    for (j = -3; j <= 4; j++) {
      i = (seg0 + j) % n; if (i < 0) i += n;
      hit = projectSeg(pts, i, k.x, k.y);
      if (!best || hit.d < best.d) best = hit;
    }
    var a = pts[best.i], b = pts[(best.i + 1) % n];
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    span = track.cum[best.i + 1] - track.cum[best.i];
    return {
      x: best.x, y: best.y, dist: Math.sqrt(best.d), seg: best.i,
      s: track.cum[best.i] + best.u * span,
      tx: dx / L, ty: dy / L, nx: -dy / L, ny: dx / L
    };
  }

  function side(ax, ay, bx, by, px, py) {
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  }

  function gateCross(gate, x0, y0, x1, y1) {
    var s0 = side(gate.ax, gate.ay, gate.bx, gate.by, x0, y0);
    var s1 = side(gate.ax, gate.ay, gate.bx, gate.by, x1, y1);
    if (!(s0 < 0 && s1 >= 0) && !(s0 > 0 && s1 <= 0) && !(s0 === 0 && s1 !== 0)) return false;
    var dx = x1 - x0, dy = y1 - y0;
    if (dx * gate.tx + dy * gate.ty <= 0) return false;
    var den = s0 - s1 || 1, t = s0 / den;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var px = x0 + dx * t, py = y0 + dy * t;
    var gx = gate.bx - gate.ax, gy = gate.by - gate.ay, gl = gx * gx + gy * gy || 1;
    var u = ((px - gate.ax) * gx + (py - gate.ay) * gy) / gl;
    return u >= -0.05 && u <= 1.05;
  }

  function passed(prev, now, target, total) {
    var d = now - prev;
    if (d < -total * 0.5) d += total;
    else if (d > total * 0.5) d -= total;
    if (d <= 0.5) return false;
    var rel = target - prev;
    if (rel < 0) rel += total;
    if (rel > total) rel -= total;
    return rel >= -4 && rel <= d + 8;
  }

  function kartByPlace(race, place) {
    var ks = race.karts, i;
    for (i = 0; i < ks.length; i++) if (ks[i].place === place && !ks[i].finished) return ks[i];
    return null;
  }

  function burstItem(race, k) {
    var item = k.item;
    k.item = '';
    if (item === 'jelly') {
      var back = 34;
      race.puddles.push({
        x: k.x - Math.cos(k.ang) * back, y: k.y - Math.sin(k.ang) * back,
        r: 26, life: 8, owner: k.i, arm: 0.25, hit: 0
      });
      race.ev.push({ t: 'drop', i: k.i });
    } else if (item === 'spring') {
      k.hopT = 0.5;
      k.vf = Math.max(k.vf, 40) + 36;
      k.vl *= 0.2;
      race.ev.push({ t: 'hop', i: k.i });
    } else if (item === 'shield') {
      k.shield = 1;
      race.ev.push({ t: 'shield', i: k.i });
    } else if (item === 'cookie') {
      k.boostMul = Math.max(k.boostMul, 1.4);
      k.boostT = Math.max(k.boostT, 1.2);
      race.ev.push({ t: 'cookie', i: k.i });
    } else if (item === 'rocket') {
      var prey = k.place > 1 ? kartByPlace(race, k.place - 1) : null;
      if (!prey) { race.ev.push({ t: 'fizz', i: k.i }); return; }
      var ang = Math.atan2(prey.y - k.y, prey.x - k.x);
      race.rockets.push({ x: k.x, y: k.y, vx: Math.cos(ang) * 40, vy: Math.sin(ang) * 40, target: prey.i, owner: k.i, life: 3.2 });
      race.ev.push({ t: 'rocket', i: k.i, target: prey.i });
    }
  }

  function trySpin(race, k, dur, kind) {
    if (k.finished || k.hopT > 0) return false;
    if (k.shield) {
      k.shield = 0;
      race.ev.push({ t: 'block', i: k.i, kind: kind });
      return false;
    }
    if (k.spinT > 0) return false;
    k.spinT = dur;
    k.charge = 0;
    k.vl += (race.rng() - 0.5) * 40;
    race.ev.push({ t: 'spin', i: k.i, kind: kind });
    return true;
  }

  function finishKart(race, k) {
    if (k.finished) return;
    k.finished = 1;
    k.finishT = race.time;
    k.item = '';
    race.ev.push({ t: 'finish', i: k.i, time: race.time, lapT: k.split });
  }

  function newRace(opts) {
    opts = opts || {};
    var track = window.TKD.TRACKS[opts.track | 0];
    var tier = clamp(opts.tier == null ? 3 : opts.tier | 0, 1, 5);
    var tierMul = opts.tierMul != null ? opts.tierMul : 0.86 + (tier - 1) * (0.14 / 4);
    var noiseTab = [6, 4, 2.5, 1, 0];
    var rubberTab = [0.2, 0.15, 0.1, 0.06, 0.02];
    var aggTab = [0.45, 0.58, 0.72, 0.86, 1];
    var humans = opts.humans == null ? 1 : opts.humans | 0;
    var cpus = opts.cpus == null ? 5 : opts.cpus | 0;
    var nK = humans + cpus;
    if (nK < 1) nK = 1;
    var seed = (opts.seed >>> 0) || 1;
    var bodies = window.TKD.KARTS, cpu = window.TKD.CPU;
    var humanBody = bodies[clamp(opts.body | 0, 0, bodies.length - 1)];
    var ref = opts.refSpeed != null ? opts.refSpeed : VBASE * (humans ? humanBody.speed : 1);
    var race = {
      track: track, laps: opts.laps || 3, phase: opts.phase || 'race', seed: seed,
      tier: tier, tierMul: tierMul, noise: opts.noise != null ? opts.noise : noiseTab[tier - 1],
      rubber: opts.rubber != null ? opts.rubber : rubberTab[tier - 1],
      agg: opts.agg != null ? opts.agg : aggTab[tier - 1],
      items: opts.items !== false, refSpeed: ref, time: 0, rng: mulberry32(seed),
      karts: [], puddles: [], rockets: [], ev: [], places: [], over: 0
    };
    race.boxes = track.boxes.map(function (b) { return { s: b.s, hot: 0 }; });
    var i, slot, row, col, s, p, body, liv, off;
    for (i = 0; i < nK; i++) {
      var isHuman = i < humans;
      // Index 0 is the back of the grid, so the child starts behind the pack.
      slot = i;
      if (nK === 1) slot = 0;
      row = slot >> 1; col = slot & 1 ? 1 : -1;
      s = 42 + row * 46;
      p = pointAt(track, s);
      off = nK === 1 ? 0 : col * 24;
      body = isHuman ? humanBody : bodies[cpu[(i - humans) % cpu.length].body];
      liv = isHuman ? null : cpu[(i - humans) % cpu.length];
      race.karts.push({
        i: i, cpu: isHuman ? 0 : 1, name: isHuman ? (opts.name || 'أنت') : liv.name,
        color: isHuman ? (opts.color || '#ff4b4b') : liv.color,
        body: isHuman ? (opts.body | 0) : liv.body,
        speed: body.speed, grip: body.grip, accel: body.accel,
        x: p.x + p.nx * off, y: p.y + p.ny * off, px: p.x + p.nx * off, py: p.y + p.ny * off,
        ang: Math.atan2(p.ty, p.tx), vf: 0, vl: 0, v: 0,
        seg: p.seg, s: s, off: off, maxV: ref,
        lap: 0, next: 1, split: 0, mark: 0, markT: 0, place: i + 1,
        item: '', charge: 0, drifting: 0, steer: 0, boostT: 0, boostMul: 1, spinT: 0, hopT: 0,
        shield: 0, useCd: 0, padCd: 0, wallCd: 0, zone: '', wasRamp: 0,
        turbos: 0, finished: 0, finishT: 0, z: 0, lapT: []
      });
    }
    rank(race);
    return race;
  }

  function rank(race) {
    var ks = race.karts, total = race.track.total, nC = race.track.cps.length, i, k, prev, a, b, span, along, f;
    for (i = 0; i < ks.length; i++) {
      k = ks[i];
      prev = (k.next + nC - 1) % nC;
      a = race.track.cps[prev].s;
      b = k.next === 0 ? total : race.track.cps[k.next].s;
      span = b - a; if (span <= 1) span += total;
      along = k.s - a; if (along < 0) along += total;
      f = clamp(along / span, 0, 0.999);
      k.prog = (k.finished ? race.laps : k.lap) * nC + prev + f + (k.finished ? 0.05 : 0);
    }
    var order = ks.slice().sort(function (p, q) { return q.prog - p.prog || p.i - q.i; });
    for (i = 0; i < order.length; i++) order[i].place = i + 1;
    race.places = order.map(function (k) { return k.i; });
    race.leader = order[0].prog;
  }

  function stepKart(race, k, inp, dt) {
    var track = race.track, bodyV = k.speed, zone, grip, drifting, rate, acc, c, s, vx, vy, proj, half;
    if (k.finished) {
      k.px = k.x; k.py = k.y;
      k.vf *= Math.pow(0.15, dt);
      k.x += Math.cos(k.ang) * k.vf * dt;
      k.y += Math.sin(k.ang) * k.vf * dt;
      return;
    }
    if (!inp) inp = { th: 0, br: 0, st: 0, drift: 0, use: 0 };
    if (k.useCd > 0) k.useCd -= dt;
    if (inp.use && k.item && k.useCd <= 0 && race.items) { burstItem(race, k); k.useCd = 0.35; }
    if (k.boostT > 0) { k.boostT -= dt; if (k.boostT <= 0) { k.boostT = 0; k.boostMul = 1; } }
    if (k.padCd > 0) k.padCd -= dt;
    if (k.wallCd > 0) k.wallCd -= dt;
    if (k.hopT > 0) k.hopT -= dt;
    if (k.spinT > 0) { k.spinT -= dt; k.ang += 8.5 * dt; }

    zone = zoneAt(track, k.s);
    k.zone = zone;
    var zMul = zone === 'carpet' ? 0.74 : 1;
    var boost = k.boostT > 0 ? k.boostMul : 1;
    var band = 1;
    if (k.cpu && race.rubber) {
      var behind = (race.leader - k.prog) / 8;
      band = clamp(1 + race.rubber * clamp(behind, -1, 2.2), 0.92, 1.08);
    }
    // Human top speed follows the kart body. CPU top speed is that same cap times the tier.
    if (k.cpu) k.maxV = race.refSpeed * race.tierMul * zMul * boost * band;
    else k.maxV = VBASE * bodyV * zMul * boost;

    grip = 10.5 * k.grip * (zone === 'carpet' ? 1.25 : 1) * (zone === 'ice' ? 0.38 : 1);
    drifting = !!(inp.drift && k.spinT <= 0 && k.hopT <= 0 && k.vf > 68);
    if (drifting) grip *= 0.26;
    var was = k.drifting;
    k.drifting = drifting ? 1 : 0;
    if (drifting && (Math.abs(k.vl) > 16 || Math.abs(inp.st) > 0.18)) k.charge = Math.min(1.75, k.charge + dt * 1.35);
    else if (!inp.drift && was && k.charge >= 0.48) {
      var level = k.charge >= 1.45 ? 3 : k.charge >= 0.95 ? 2 : 1;
      k.boostMul = level === 3 ? 1.5 : level === 2 ? 1.34 : 1.2;
      k.boostT = level === 3 ? 1.15 : level === 2 ? 0.85 : 0.6;
      k.turbos++;
      k.charge = 0;
      race.ev.push({ t: 'turbo', i: k.i, level: level });
    } else if (!drifting) k.charge = Math.max(0, k.charge - dt * 0.85);

    rate = (inp.st || 0) * (2.7 / (1 + Math.max(0, k.vf) / 240)) * (drifting ? 1.28 : 1);
    if (k.spinT > 0) rate *= 0.12;
    k.ang += rate * dt;

    acc = 250 * k.accel * (zone === 'carpet' ? 0.85 : 1);
    if (inp.th) k.vf += acc * clamp(inp.th, 0, 1) * dt;
    if (inp.br) k.vf -= (k.vf > 15 ? 460 : 200) * clamp(inp.br, 0, 1) * dt;
    else if (!inp.th) k.vf -= k.vf * 0.45 * dt;
    if (k.spinT > 0) k.vf -= k.vf * 1.4 * dt;
    if (k.vf > k.maxV) k.vf = k.maxV;
    if (k.vf < -96) k.vf = -96;
    k.vl *= Math.exp(-grip * dt);
    if (drifting) k.vl += (inp.st || 0) * k.vf * 1.15 * dt;
    if (k.hopT > 0) k.vl *= 0.85;

    c = Math.cos(k.ang); s = Math.sin(k.ang);
    vx = c * k.vf - s * k.vl; vy = s * k.vf + c * k.vl;
    k.px = k.x; k.py = k.y;
    k.x += vx * dt; k.y += vy * dt;
    k.v = k.vf;

    if (k.hopT <= 0) {
      proj = project(track, k);
      k.seg = proj.seg; k.s = proj.s; k.off = (k.x - proj.x) * proj.nx + (k.y - proj.y) * proj.ny;
      half = track.width * 0.5 - 16;
      if (proj.dist > half) {
        k.x = proj.x + (k.x - proj.x) * (half / proj.dist);
        k.y = proj.y + (k.y - proj.y) * (half / proj.dist);
        k.vf *= 0.84;
        k.vl *= 0.35;
        if (k.wallCd <= 0) { k.wallCd = 0.55; race.ev.push({ t: 'wall', i: k.i }); }
      }
    } else {
      proj = project(track, k);
      k.seg = proj.seg; k.s = proj.s;
    }

    var frac = k.s / track.total;
    k.z = track.bridge && frac >= track.bridge.over0 && frac < track.bridge.over1 ? 1 : 0;

    var nowZone = zoneAt(track, k.s);
    if (nowZone === 'ramp' && !k.wasRamp && k.vf > 80 && k.hopT <= 0) {
      k.hopT = 0.55;
      k.vf += 28;
      race.ev.push({ t: 'ramp', i: k.i });
    }
    k.wasRamp = nowZone === 'ramp' ? 1 : 0;

    if (k.hopT <= 0) {
      var bi, box, pi;
      for (bi = 0; bi < race.boxes.length && race.items; bi++) {
        box = race.boxes[bi];
        if (race.time < box.hot || k.item) continue;
        if (Math.abs(k.off) > track.width * 0.42) continue;
        if (passed(k._ps == null ? k.s : k._ps, k.s, box.s, track.total)) {
          k.item = rollItem(k.place, race.rng);
          box.hot = race.time + 8;
          race.ev.push({ t: 'item', i: k.i, item: k.item });
        }
      }
      for (pi = 0; pi < track.pads.length; pi++) {
        if (k.padCd > 0) break;
        if (Math.abs(k.off) > track.width * 0.45) continue;
        if (passed(k._ps == null ? k.s : k._ps, k.s, track.pads[pi], track.total)) {
          k.boostMul = Math.max(k.boostMul, 1.22);
          k.boostT = Math.max(k.boostT, 0.7);
          k.padCd = 1.6;
          race.ev.push({ t: 'pad', i: k.i });
        }
      }
    }
    k._ps = k.s;

    var gates = track.cps, gi, g;
    for (gi = 0; gi < gates.length; gi++) {
      g = gates[gi];
      if (g.i !== k.next) continue;
      if (!gateCross(g, k.px, k.py, k.x, k.y)) continue;
      k.next = (k.next + 1) % gates.length;
      k.markT = race.time;
      if (g.i === 0) {
        k.lap++;
        k.split = race.time - k.mark;
        k.lapT.push(k.split);
        k.mark = race.time;
        race.ev.push({ t: 'lap', i: k.i, lap: k.lap, split: k.split });
        if (k.lap >= race.laps) finishKart(race, k);
      }
      break;
    }

    if (!k.finished && race.time - k.markT > 6.5) {
      var back = pointAt(track, k.s);
      k.x = back.x; k.y = back.y; k.px = back.x; k.py = back.y;
      k.seg = back.seg; k.s = back.s;
      k.ang = Math.atan2(back.ty, back.tx);
      k.vf = Math.max(90, k.maxV * 0.72);
      k.vl = 0; k.spinT = 0; k.markT = race.time;
      race.ev.push({ t: 'rescue', i: k.i });
    }
  }

  function collide(race) {
    var ks = race.karts, i, j, a, b, dx, dy, d, min, nx, ny, push, ov;
    for (i = 0; i < ks.length; i++) {
      a = ks[i];
      if (a.finished || a.hopT > 0) continue;
      for (j = i + 1; j < ks.length; j++) {
        b = ks[j];
        if (b.finished || b.hopT > 0) continue;
        if (a.z !== b.z) continue;
        dx = b.x - a.x; dy = b.y - a.y;
        d = Math.hypot(dx, dy) || 0.001;
        min = 30;
        if (d >= min) continue;
        nx = dx / d; ny = dy / d;
        ov = (min - d) * 0.5;
        a.x -= nx * ov; a.y -= ny * ov;
        b.x += nx * ov; b.y += ny * ov;
        push = (b.vf - a.vf) * 0.15;
        a.vf -= push; b.vf += push;
        a.vl += nx * 8; b.vl -= nx * 8;
        race.ev.push({ t: 'bump', i: a.i, j: b.i });
      }
    }
  }

  function stepWorld(race, dt) {
    var i, p, r, target, dx, dy, d, ang, spd;
    for (i = race.puddles.length - 1; i >= 0; i--) {
      p = race.puddles[i];
      p.life -= dt; p.arm -= dt;
      if (p.life <= 0) race.puddles.splice(i, 1);
    }
    for (i = race.rockets.length - 1; i >= 0; i--) {
      r = race.rockets[i];
      r.life -= dt;
      target = race.karts[r.target];
      if (!target || target.finished || r.life <= 0) { race.rockets.splice(i, 1); continue; }
      dx = target.x - r.x; dy = target.y - r.y;
      d = Math.hypot(dx, dy) || 1;
      ang = Math.atan2(dy, dx);
      spd = 250;
      r.vx += (Math.cos(ang) * spd - r.vx) * Math.min(1, dt * 4);
      r.vy += (Math.sin(ang) * spd - r.vy) * Math.min(1, dt * 4);
      r.x += r.vx * dt; r.y += r.vy * dt;
      if (d < 22) {
        trySpin(race, target, 0.8, 'rocket');
        race.ev.push({ t: 'confetti', i: target.i, x: target.x, y: target.y });
        race.rockets.splice(i, 1);
      }
    }
    var ks = race.karts, pud, k;
    for (p = 0; p < race.puddles.length; p++) {
      pud = race.puddles[p];
      if (pud.arm > 0) continue;
      for (i = 0; i < ks.length; i++) {
        k = ks[i];
        if (k.i === pud.owner || k.finished || k.hopT > 0 || k.spinT > 0) continue;
        if (pud.hit && pud.hit[k.i]) continue;
        if (Math.hypot(k.x - pud.x, k.y - pud.y) < pud.r + 12) {
          if (!pud.hit) pud.hit = {};
          pud.hit[k.i] = 1;
          trySpin(race, k, 1, 'jelly');
        }
      }
    }
  }

  function step(race, dt, inputs) {
    if (!race || race.phase !== 'race' || race.over) return race;
    if (dt > 1 / 40) dt = 1 / 40;
    if (dt < 0) return race;
    race.ev.length = 0;
    race.time += dt;
    var ks = race.karts, i, done = 1;
    for (i = 0; i < ks.length; i++) stepKart(race, ks[i], inputs && inputs[i], dt);
    collide(race);
    stepWorld(race, dt);
    rank(race);
    for (i = 0; i < ks.length; i++) if (!ks[i].finished) done = 0;
    if (done) race.over = 1;
    return race;
  }

  // Human reference speed is VBASE * the driven kart's speed stat. newRace stores that in refSpeed
  // only when a human is in the race; bot-only races use VBASE. Fix the human branch to use body
  // speed against that reference without dividing twice. Recomputed here once per race via _humanSpeed.
  var _new = newRace;
  newRace = function (opts) {
    var race = _new(opts);
    var bodies = window.TKD.KARTS;
    var humans = opts && opts.humans != null ? opts.humans | 0 : 1;
    var body = bodies[clamp((opts && opts.body) | 0, 0, bodies.length - 1)];
    race._humanSpeed = humans ? body.speed : 1;
    if (opts && opts.refSpeed == null) race.refSpeed = VBASE * race._humanSpeed;
    return race;
  };

  window.TK = {
    VBASE: VBASE,
    PLACE: PLACE,
    newRace: function (opts) { return newRace(opts); },
    step: step,
    pointAt: pointAt,
    rollItem: rollItem,
    ttPoints: ttPoints,
    intersections: intersections,
    makeRng: mulberry32,
    zoneAt: zoneAt,
    wrap: wrap
  };
})();
