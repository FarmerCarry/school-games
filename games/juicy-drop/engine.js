/* سلّة الفواكه (Juicy Drop): the pure fruit-jar simulation and the save rules.
 * No DOM, no Kit, no timers and no Math.random: the same seed and the same calls always
 * give the same jar, so Node tests can replay it (tools/tests/juicy-drop-engine.test.mjs).
 *
 * Units: the inside of the jar is JW wide, x runs 0..JW from the left wall and y runs up
 * from the jar floor (0). Every fruit is a circle. Each frame runs small sub-steps: gravity,
 * then contact impulses on the velocities (small bounce, damped sliding, heavier fruit move
 * less), then the move, then leftover overlaps pushed apart in small capped steps that add
 * NO velocity. That keeps stacks still (no jitter) and a growing merged fruit or a wedged
 * pile can never fling its neighbours. */
(function (root) {
  'use strict';

  var JW = 8.4, JH = 9.6, LINE = 8.4, DROP_Y = 10.15;
  // Eleven fruits, smallest first. r is the radius in jar units.
  var FRUITS = [
    { id: 'blueberry', name: 'توتة', r: 0.36, color: '#4f7dff', juice: '#7aa2ff' },
    { id: 'cherry', name: 'كرزة', r: 0.46, color: '#e8203a', juice: '#ff4d6a' },
    { id: 'strawberry', name: 'فراولة', r: 0.58, color: '#ff4f6d', juice: '#ff7a92' },
    { id: 'grape', name: 'عنبة', r: 0.70, color: '#a35cff', juice: '#c08bff' },
    { id: 'lemon', name: 'ليمونة', r: 0.84, color: '#ffe04a', juice: '#fff07a' },
    { id: 'orange', name: 'برتقالة', r: 1.00, color: '#ff9a1c', juice: '#ffb44d' },
    { id: 'apple', name: 'تفاحة', r: 1.18, color: '#6fd447', juice: '#b6f08a' },
    { id: 'peach', name: 'خوخة', r: 1.38, color: '#ffa48c', juice: '#ffc2ae' },
    { id: 'pineapple', name: 'أناناسة', r: 1.60, color: '#ffc43a', juice: '#ffe07a' },
    { id: 'melon', name: 'شمّامة', r: 1.86, color: '#c5ec7a', juice: '#e2ffa6' },
    { id: 'watermelon', name: 'بطيخة', r: 2.15, color: '#2fbf4a', juice: '#ff5470' }
  ];
  var TOP = FRUITS.length - 1;
  // Points for making a fruit of each level (two watermelons together: MELON_POINTS).
  var POINTS = [0, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66], MELON_POINTS = 100;
  // How likely each droppable fruit is (the pool is the first 3..5 fruits).
  var WEIGHTS = [5, 4, 3.2, 2.4, 1.6];

  var G = 30, SUB = 8, ITER = 2, VITER = 4, VMAX = 24, REST = 0.14, BOUNCE_MIN = 2.2;
  var SLIDE = 0.022, FLOOR_SLIDE = 0.03, WALL_SLIDE = 0.01, AIR = 0.2, TOUCH = 0.003;
  var MAXPUSH = 0.08, GROW_T = 0.14, COOLDOWN = 0.45, CHAIN_T = 1.15, MAX_CHARGES = 3, SETTLE = 0.7, MERGE_GAP = 0.04;
  var DROP_V = -2.5, ROLL = 24, WAKE_V = 1.2, SLEEP_V = 0.3, SLEEP_T = 0.5;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, fallback) { return typeof v === 'number' && v === v && v !== 1 / 0 && v !== -1 / 0 ? v : fallback; }
  function int(v, a, b, fallback) { v = num(v, fallback); return clamp(Math.round(v), a, b); }

  // mulberry32: a tiny seeded generator kept in the world, so replays match exactly.
  function rand(w) {
    var t = (w.rs = (w.rs + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function pickFruit(w) {
    var total = 0, i, x;
    for (i = 0; i < w.pool; i++) total += WEIGHTS[i];
    x = rand(w) * total;
    for (i = 0; i < w.pool - 1; i++) { x -= WEIGHTS[i]; if (x < 0) return i; }
    return w.pool - 1;
  }

  /* -------------------------------------------------------------- world */
  // opts: seed, pool (3..5 kinds of fruit to drop), grace (seconds a fruit may stay over the
  // line before the jar overflows), charges (jar shakes to start with).
  function create(opts) {
    opts = opts || {};
    var w = {
      rs: (num(opts.seed, 1) >>> 0) || 1,
      pool: int(opts.pool, 3, 5, 5),
      grace: clamp(num(opts.grace, 3), 0.5, 8),
      fruits: [], ev: [], nextId: 1,
      t: 0, aim: JW / 2, held: 0, next: 0, cool: 0,
      score: 0, drops: 0, merges: 0, combo: 0, chainT: 0, bestCombo: 0, melons: 0,
      maxLevel: -1, charges: int(opts.charges, 0, MAX_CHARGES, 1), blasts: 0,
      warn: false, overT: 0, danger: 0, height: 0, over: false
    };
    w.held = pickFruit(w);
    w.next = pickFruit(w);
    return w;
  }

  function makeFruit(w, lv, x, y) {
    var r = FRUITS[lv].r;
    return { id: w.nextId++, lv: lv, x: x, y: y, vx: 0, vy: 0,
      r: r, r0: r, rt: r, age: 0, born: 99, landed: false, touch: 0, a: 0, av: 0, hitT: 0, m: 0,
      sup: 0, side: 0, snx: 0, wall: 0, floor: 0, zz: false, sl: 0 };
  }

  function aimLimit(w) { return FRUITS[w.held].r; }
  function setAim(w, x) {
    var r = aimLimit(w);
    w.aim = clamp(num(x, w.aim), r, JW - r);
    return w.aim;
  }
  function canDrop(w) { return !w.over && w.cool <= 0; }
  function drop(w) {
    if (!canDrop(w)) return null;
    setAim(w, w.aim);
    var f = makeFruit(w, w.held, w.aim, DROP_Y);
    f.vy = DROP_V;
    w.fruits.push(f);
    w.drops++;
    if (f.lv > w.maxLevel) w.maxLevel = f.lv;
    w.ev.push({ t: 'drop', id: f.id, lv: f.lv, x: f.x, y: f.y });
    w.held = w.next;
    w.next = pickFruit(w);
    w.cool = COOLDOWN;
    setAim(w, w.aim);
    return f;
  }

  // The jar shake: every fruit of the smallest kind in the jar pops, and the rest get a
  // gentle shove up so the pile can settle again. Costs one charge.
  function blast(w) {
    if (w.over || w.charges <= 0 || !w.fruits.length) return false;
    var fr = w.fruits, lv = TOP, i, f, n = 0, keep = [];
    for (i = 0; i < fr.length; i++) if (fr[i].lv < lv) lv = fr[i].lv;
    for (i = 0; i < fr.length; i++) {
      f = fr[i];
      if (f.lv === lv) { n++; w.score += lv + 1; w.ev.push({ t: 'pop', id: f.id, lv: f.lv, x: f.x, y: f.y, r: f.r }); }
      else keep.push(f);
    }
    w.fruits = keep;
    for (i = 0; i < keep.length; i++) {
      f = keep[i];
      wake(f);
      f.vy += 4 + rand(w) * 2.5;
      f.vx += (rand(w) - 0.5) * 3;
    }
    w.charges--;
    w.blasts++;
    w.overT = Math.max(0, w.overT - w.grace * 0.5);
    w.ev.push({ t: 'blast', lv: lv, n: n, charges: w.charges });
    return true;
  }

  /* ------------------------------------------------------------ physics */
  // Sleeping fruit (zz) have settled: they keep still and act as solid ground for the others
  // until something hits them, their support goes, or a merge happens next to them.
  function solvePositions(fr, n) {
    var i, j, a, b, dx, dy, rr, d2, d, nx, ny, over, ma, mb, wa;
    for (i = 0; i < n; i++) {
      a = fr[i];
      for (j = i + 1; j < n; j++) {
        b = fr[j];
        if (a.zz && b.zz) continue;
        rr = a.r + b.r;
        dx = a.x - b.x; if (dx > rr || dx < -rr) continue;
        dy = a.y - b.y; if (dy > rr || dy < -rr) continue;
        d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        d = Math.sqrt(d2);
        if (d < 1e-9) { nx = 0; ny = 1; } else { nx = dx / d; ny = dy / d; }
        over = rr - d;
        if (over > MAXPUSH) over = MAXPUSH;
        ma = a.r * a.r; mb = b.r * b.r;
        wa = a.zz ? 0 : b.zz ? 1 : mb / (ma + mb);
        a.x += nx * over * wa; a.y += ny * over * wa;
        b.x -= nx * over * (1 - wa); b.y -= ny * over * (1 - wa);
      }
    }
    for (i = 0; i < n; i++) {
      a = fr[i];
      if (a.x < a.r) a.x = a.r; else if (a.x > JW - a.r) a.x = JW - a.r;
      if (a.y < a.r) a.y = a.r;
    }
  }
  function wake(f) { f.zz = false; f.sl = 0; }
  // Before the move: touching fruit stop moving into each other (a small bounce only when
  // they really hit), sliding is damped, and first landings are noted for sounds and squash.
  // Only these impulses change speeds; the push-out above never adds any, so a merged fruit
  // that grows, or one squeezed between others, is moved aside without being flung.
  function solveVelocities(w, fr, n, first) {
    var i, j, a, b, dx, dy, rr, d2, d, nx, ny, ma, mb, wa, rvx, rvy, vn, want, dv, vt;
    for (i = 0; i < n; i++) {
      a = fr[i];
      for (j = i + 1; j < n; j++) {
        b = fr[j];
        rr = a.r + b.r + TOUCH;
        dx = a.x - b.x; if (dx > rr || dx < -rr) continue;
        dy = a.y - b.y; if (dy > rr || dy < -rr) continue;
        d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        d = Math.sqrt(d2);
        if (d < 1e-9) { nx = 0; ny = 1; } else { nx = dx / d; ny = dy / d; }
        a.touch = b.touch = 1;
        if (first) {
          // Who rests on whom: supports from below, and anything beside or on top.
          if (ny > 0.2) { a.sup++; a.snx = nx; } else a.side++;
          if (ny < -0.2) { b.sup++; b.snx = -nx; } else b.side++;
        }
        if (a.zz && b.zz) continue;
        rvx = a.vx - b.vx; rvy = a.vy - b.vy;
        vn = rvx * nx + rvy * ny;
        // A real hit, or a fast neighbour, wakes a sleeping fruit.
        if ((a.zz || b.zz) && (vn < -WAKE_V || rvx * rvx + rvy * rvy > WAKE_V * WAKE_V * 4)) { wake(a); wake(b); }
        ma = a.r * a.r; mb = b.r * b.r;
        wa = a.zz ? 0 : b.zz ? 1 : mb / (ma + mb);
        if (vn < 0) {
          want = first && vn < -BOUNCE_MIN ? -REST * vn : 0;
          dv = want - vn;
          a.vx += nx * dv * wa; a.vy += ny * dv * wa; b.vx -= nx * dv * (1 - wa); b.vy -= ny * dv * (1 - wa);
          if (first) {
            if (!a.landed) land(w, a, -vn);
            if (!b.landed) land(w, b, -vn);
            if (vn < -6) { bump(w, a, -vn); bump(w, b, -vn); }
          }
        }
        vt = -rvy * nx + rvx * ny;
        dv = -vt * SLIDE;
        a.vx += ny * dv * wa; a.vy -= nx * dv * wa; b.vx -= ny * dv * (1 - wa); b.vy += nx * dv * (1 - wa);
      }
    }
    for (i = 0; i < n; i++) {
      a = fr[i];
      if (a.zz) {
        if (first) { if (a.y - a.r <= TOUCH) a.floor = 1; if (a.x - a.r <= TOUCH || a.x + a.r >= JW - TOUCH) a.wall = 1; }
        continue;
      }
      if (a.y - a.r <= TOUCH) {
        if (first) a.floor = 1;
        if (a.vy < 0) {
          if (first) { if (!a.landed) land(w, a, -a.vy); else if (a.vy < -6) bump(w, a, -a.vy); }
          a.vy = first && a.vy < -BOUNCE_MIN ? -REST * a.vy : 0;
        }
        a.vx -= a.vx * FLOOR_SLIDE;
        a.touch = 1;
      }
      if (a.x - a.r <= TOUCH) {
        if (first) a.wall = 1;
        if (a.vx < 0) a.vx = first && a.vx < -BOUNCE_MIN ? -REST * a.vx : 0;
        a.vy -= a.vy * WALL_SLIDE; a.touch = 1;
      } else if (a.x + a.r >= JW - TOUCH) {
        if (first) a.wall = 1;
        if (a.vx > 0) a.vx = first && a.vx > BOUNCE_MIN ? -REST * a.vx : 0;
        a.vy -= a.vy * WALL_SLIDE; a.touch = 1;
      }
    }
  }
  function land(w, f, power) {
    f.landed = true;
    w.ev.push({ t: 'land', id: f.id, lv: f.lv, x: f.x, y: f.y, power: Math.max(0, power) });
  }
  function bump(w, f, power) {
    if (f.hitT > 0) return;
    f.hitT = 0.25;
    w.ev.push({ t: 'bump', id: f.id, lv: f.lv, x: f.x, y: f.y, power: power });
  }
  // Balanced on the very top of one other fruit, with nothing beside it: it must roll off.
  function perched(f) { return f.sup === 1 && !f.side && !f.wall && !f.floor; }

  function physics(w, dt) {
    var fr = w.fruits, n = fr.length, h = dt / SUB, k, it, i, f, sp, damp = 1 - AIR * h;
    if (!n) return;
    for (i = 0; i < n; i++) fr[i].touch = 0;
    for (k = 0; k < SUB; k++) {
      for (i = 0; i < n; i++) {
        f = fr[i];
        f.sup = f.side = f.wall = f.floor = 0; f.snx = 0;
        if (!f.zz) f.vy -= G * h;
      }
      solveVelocities(w, fr, n, true);
      for (it = 1; it < VITER; it++) solveVelocities(w, fr, n, false);
      for (i = 0; i < n; i++) {
        f = fr[i];
        if (f.zz) { f.vx = f.vy = 0; continue; }
        // A point balance tips to the side it leans to (or a fixed side when dead centre).
        if (f.landed && perched(f)) f.vx += (f.snx > 1e-3 ? 1 : f.snx < -1e-3 ? -1 : (f.id & 1 ? 1 : -1)) * ROLL * h;
        f.vx *= damp; f.vy *= damp;
        sp = f.vx * f.vx + f.vy * f.vy;
        if (sp > VMAX * VMAX) { sp = VMAX / Math.sqrt(sp); f.vx *= sp; f.vy *= sp; }
        f.x += f.vx * h; f.y += f.vy * h;
      }
      for (it = 0; it < ITER; it++) solvePositions(fr, n);
    }
    for (i = 0; i < n; i++) {
      f = fr[i];
      if (f.zz) {
        // Its support went (merged away, rolled off): fall again.
        if ((!f.sup && !f.floor) || perched(f)) wake(f);
        continue;
      }
      sp = f.vx * f.vx + f.vy * f.vy;
      if (f.touch && sp < 4e-4) { f.vx = 0; f.vy = 0; }
      // Slow for a moment while resting on something: go to sleep.
      if (f.landed && f.touch && (f.sup || f.floor) && !perched(f) && f.r >= f.rt && sp < SLEEP_V * SLEEP_V) {
        f.sl += dt;
        if (f.sl > SLEEP_T) { f.zz = true; f.vx = f.vy = 0; f.av = 0; }
      } else f.sl = 0;
    }
    // Rolling (for the picture): touching fruit turn with their sideways speed.
    for (i = 0; i < n; i++) {
      f = fr[i];
      if (f.touch) f.av += (-f.vx / f.r - f.av) * Math.min(1, dt * 10);
      else f.av *= 1 - Math.min(1, dt * 0.6);
      f.a += f.av * dt;
      if (f.a > Math.PI) f.a -= 2 * Math.PI; else if (f.a < -Math.PI) f.a += 2 * Math.PI;
      if (f.hitT > 0) f.hitT -= dt;
    }
  }
  // Wakes the fruit near a spot where something changed (a merge, a pop).
  function wakeNear(w, x, y, reach) {
    var fr = w.fruits, i, f, dx, dy, rr;
    for (i = 0; i < fr.length; i++) {
      f = fr[i]; rr = reach + f.r; dx = f.x - x; dy = f.y - y;
      if (dx * dx + dy * dy < rr * rr) wake(f);
    }
  }

  /* ------------------------------------------------------------- merges */
  var pairA = [], pairB = [];
  function merges(w) {
    var fr = w.fruits, n = fr.length, i, j, a, b, dx, dy, rr, np = 0, gone = 0;
    for (i = 0; i < n; i++) fr[i].m = 0;
    for (i = 0; i < n; i++) {
      a = fr[i];
      if (a.m) continue;
      for (j = i + 1; j < n; j++) {
        b = fr[j];
        if (b.m || b.lv !== a.lv) continue;
        rr = a.r + b.r + MERGE_GAP;
        dx = a.x - b.x; dy = a.y - b.y;
        if (dx * dx + dy * dy > rr * rr) continue;
        a.m = 1; b.m = 2;
        pairA[np] = i; pairB[np] = j; np++;
        break;
      }
    }
    if (!np) return;
    for (var p = 0; p < np; p++) {
      a = fr[pairA[p]]; b = fr[pairB[p]];
      w.combo = w.chainT > 0 ? w.combo + 1 : 1;
      w.chainT = CHAIN_T;
      if (w.combo > w.bestCombo) w.bestCombo = w.combo;
      var mult = 1 + 0.5 * (w.combo - 1), x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      w.merges++;
      if (a.lv === TOP) {
        // Two watermelons: both burst into a shower of juice and points.
        var pts = Math.round(MELON_POINTS * mult);
        w.score += pts; w.melons++;
        a.m = 2;
        wakeNear(w, x, y, 2 * a.r + 0.6);
        w.ev.push({ t: 'melon', x: x, y: y, combo: w.combo, points: pts, a: a.id, b: b.id });
      } else {
        var lv = a.lv + 1, ma = a.r * a.r, mb = b.r * b.r, s = ma + mb;
        var pts2 = Math.round(POINTS[lv] * mult), wasMax = w.maxLevel;
        w.score += pts2;
        var old = { ax: a.x, ay: a.y, bx: b.x, by: b.y, r: a.r };
        // The bigger fruit takes the place of the first one (keeps the order deterministic).
        a.lv = lv; a.x = x; a.y = y;
        a.vx = (a.vx * ma + b.vx * mb) / s; a.vy = (a.vy * ma + b.vy * mb) / s;
        a.r0 = a.r; a.rt = FRUITS[lv].r; a.born = 0; a.landed = true; a.age = SETTLE; a.av *= 0.5;
        wakeNear(w, x, y, 2 * a.rt + 0.6);
        if (lv > w.maxLevel) w.maxLevel = lv;
        w.ev.push({ t: 'merge', id: a.id, gone: b.id, lv: lv, x: x, y: y, combo: w.combo, points: pts2,
          ax: old.ax, ay: old.ay, bx: old.bx, by: old.by, r: old.r, first: lv > wasMax });
      }
      gone++;
      if (w.combo >= 3 && w.combo % 3 === 0 && w.charges < MAX_CHARGES) {
        w.charges++;
        w.ev.push({ t: 'charge', charges: w.charges, x: x, y: y });
      }
    }
    var keep = [];
    for (i = 0; i < n; i++) if (fr[i].m !== 2) keep.push(fr[i]);
    w.fruits = keep;
  }

  /* --------------------------------------------------------- the line */
  function checkLine(w, dt) {
    var fr = w.fruits, i, f, top = 0, over = false, rest;
    for (i = 0; i < fr.length; i++) {
      f = fr[i];
      if (!f.landed) continue;
      rest = f.y + f.r;
      if (rest > top) top = rest;
      if (f.age >= SETTLE && rest > LINE) over = true;
    }
    w.height = top;
    if (over) {
      if (!w.warn) { w.warn = true; w.ev.push({ t: 'danger' }); }
      w.overT += dt;
    } else {
      if (w.warn) { w.warn = false; w.ev.push({ t: 'safe' }); }
      w.overT = Math.max(0, w.overT - dt * 1.5);
    }
    w.danger = clamp(w.overT / w.grace, 0, 1);
    if (w.overT >= w.grace) {
      w.over = true;
      w.ev.push({ t: 'over', score: w.score, maxLevel: w.maxLevel });
    }
  }

  function step(w, dt) {
    if (w.over) return;
    dt = clamp(num(dt, 0), 0, 1 / 30);
    if (!dt) return;
    w.t += dt;
    if (w.cool > 0) w.cool = Math.max(0, w.cool - dt);
    if (w.chainT > 0) { w.chainT -= dt; if (w.chainT <= 0) { w.chainT = 0; w.combo = 0; } }
    var fr = w.fruits, i, f;
    for (i = 0; i < fr.length; i++) {
      f = fr[i];
      f.age += dt; f.born += dt;
      if (f.r < f.rt) f.r = Math.min(f.rt, f.r + (f.rt - f.r0) * dt / GROW_T);
    }
    physics(w, dt);
    merges(w);
    checkLine(w, dt);
  }

  // Where a fruit of radius r dropped at x would first rest (for the aiming guide).
  function landingY(w, x, r) {
    var y = r, fr = w.fruits, i, f, dx, rr, yy;
    for (i = 0; i < fr.length; i++) {
      f = fr[i];
      dx = Math.abs(f.x - x); rr = f.r + r;
      if (dx < rr) { yy = f.y + Math.sqrt(rr * rr - dx * dx); if (yy > y) y = yy; }
    }
    return y;
  }
  function maxSpeed(w) {
    var m = 0, fr = w.fruits, i, s;
    for (i = 0; i < fr.length; i++) { s = Math.sqrt(fr[i].vx * fr[i].vx + fr[i].vy * fr[i].vy); if (s > m) m = s; }
    return m;
  }
  // Debug/test helper: put a resting fruit straight into the jar.
  function place(w, lv, x, y) {
    var f = makeFruit(w, int(lv, 0, TOP, 0), x, y);
    f.landed = true; f.age = SETTLE;
    w.fruits.push(f);
    if (f.lv > w.maxLevel) w.maxLevel = f.lv;
    return f;
  }

  /* -------------------------------------------------------- save rules */
  // Jar skins open by the biggest fruit ever made on this PC.
  var SKINS = [
    { id: 'glass', name: 'زجاج', need: -1 },
    { id: 'candy', name: 'حلوى', need: 5 },
    { id: 'honey', name: 'عسل', need: 7 },
    { id: 'rainbow', name: 'قوس قزح', need: 10 }
  ];
  function starsFor(maxLevel) { return maxLevel >= 8 ? 3 : maxLevel >= 6 ? 2 : maxLevel >= 4 ? 1 : 0; }
  // For Kit.dda: making an orange is a so-so run, a pineapple a great one.
  function outcome(maxLevel) { return clamp((maxLevel - 3) / 5, 0, 1); }
  function skinOpen(save, i) { return !!SKINS[i] && save.top >= SKINS[i].need; }
  function loadSave(raw) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    var s = {
      v: 3,
      best: int(raw.best, 0, 1e9, 0),
      top: int(raw.top, -1, TOP, -1),
      skin: int(raw.skin, 0, SKINS.length - 1, 0),
      coach: raw.coach === true,
      games: int(raw.games, 0, 1e9, 0),
      seen: int(raw.seen, 0, SKINS.length - 1, 0)
    };
    if (!skinOpen(s, s.skin)) s.skin = 0;
    return s;
  }
  // Folds a finished run into the save; returns what to celebrate.
  function applyResult(save, run) {
    var score = int(run && run.score, 0, 1e9, 0), maxLevel = int(run && run.maxLevel, -1, TOP, -1);
    var prevBest = save.best, prevTop = save.top, opened = [], i;
    if (score > save.best) save.best = score;
    if (maxLevel > save.top) save.top = maxLevel;
    for (i = 1; i < SKINS.length; i++) if (prevTop < SKINS[i].need && save.top >= SKINS[i].need) opened.push(i);
    save.games++;
    return { best: score > prevBest && score > 0, prevBest: prevBest, newFruit: maxLevel > prevTop, opened: opened, stars: starsFor(maxLevel), score: score, maxLevel: maxLevel };
  }

  var API = {
    JW: JW, JH: JH, LINE: LINE, DROP_Y: DROP_Y, FRUITS: FRUITS, TOP: TOP, POINTS: POINTS, MELON_POINTS: MELON_POINTS,
    MAX_CHARGES: MAX_CHARGES, COOLDOWN: COOLDOWN, CHAIN_T: CHAIN_T, SETTLE: SETTLE, SKINS: SKINS,
    create: create, step: step, setAim: setAim, canDrop: canDrop, drop: drop, blast: blast,
    landingY: landingY, maxSpeed: maxSpeed, place: place,
    starsFor: starsFor, outcome: outcome, skinOpen: skinOpen, loadSave: loadSave, applyResult: applyResult
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.JDEngine = API;
})(typeof window !== 'undefined' ? window : this);
