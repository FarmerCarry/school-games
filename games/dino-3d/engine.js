/* Dino 3D (الديناصور ثلاثي الأبعاد): the journey engine. Tuning tables per difficulty
 * tier, seeded course generation (15 journey levels and the endless run), the baby
 * dino's physics with coyote time, jump buffering and a held high jump, forgiving
 * colliders, eggs, fruit and the roar dash, hearts, stars and saves.
 * Pure: no DOM, no Kit, no THREE, no timers and no unseeded randomness, so
 * tools/tests/dino-3d-engine.test.mjs loads it with { window: {} } and plays whole
 * levels with scripted players. game.js reads the DDA tier, steps a world with the
 * child's input and turns its events into pictures and sound. */
(function () {
  'use strict';
  var D = window.Dino3D = window.Dino3D || {};
  D.TIERS = 5;
  D.HP = 6;                 // three hearts, counted in halves
  D.LEVELS = 15;
  D.ZONE = 300;             // endless: metres per biome
  D.CUE_S = 1.1;            // an obstacle this many seconds away is a cue (the coach shows its move)
  // The baby dino's collider: narrower and lower than the art.
  var HALF_W = 0.3, STAND = 1.3, DUCK = 0.72, AIR_DUCK = 0.95;
  var HOLD = 0.3, DASH_S = 0.85, DASH_X = 1.85, MUD_X = 0.55, SUB = 1 / 120, ACT = 24;
  D.BODY = { halfW: HALF_W, stand: STAND, duck: DUCK, dash: DASH_S };

  // One entry per DDA tier: tier 1 is for a six-year-old's first run, tier 5 a real
  // challenge for a ten-year-old. D.HARDER says which way each knob makes it harder;
  // the engine test checks every row.
  D.TUNE = {
    speed:   [5.6, 6.5, 7.5, 8.6, 9.8],        // run speed, m/s
    ramp:    [0.06, 0.09, 0.12, 0.15, 0.18],   // speed gained by the end of a level
    space:   [2.8, 2.35, 1.95, 1.65, 1.4],     // s between obstacles, at least
    spread:  [1.0, 0.85, 0.75, 0.65, 0.55],    // s of random extra space
    grace:   [0.24, 0.17, 0.11, 0.06, 0.03],   // colliders shrink by this, m
    foot:    [0.3, 0.27, 0.24, 0.21, 0.18],    // standing on a goo edge still counts, m
    jumpV:   [9.6, 9.4, 9.2, 9.0, 9.0],        // take-off speed (a floatier jump when young)
    gravity: [26, 28, 30, 31, 32],
    coyote:  [0.16, 0.14, 0.12, 0.1, 0.09],    // s to jump after running off an edge
    buffer:  [0.22, 0.19, 0.16, 0.14, 0.12],   // s an early jump press is remembered
    cost:    [1, 1, 2, 2, 2],                  // half hearts lost per bump
    blink:   [1.7, 1.6, 1.5, 1.35, 1.25],      // s of safe blinking after a bump
    roarNeed: [4, 4, 5, 5, 6],                 // fruit to fill the roar meter
    big:     [0, 0.15, 0.3, 0.4, 0.5],         // share of tall and wide obstacles
    double:  [0, 0, 0.12, 0.22, 0.32],         // share of back-to-back pairs
    roll:    [1.4, 2.0, 2.6, 3.2, 3.8],        // snowball / coconut speed, m/s
    span:    [0.42, 0.5, 0.58, 0.64, 0.7],     // goo span, share of a tap jump
    stones:  [1, 1, 2, 2, 3],                  // most goo spans in one river
    hearts:  [2, 1, 1, 0, 0],                  // heart pickups per level
    high:    [0.1, 0.2, 0.3, 0.35, 0.4],       // share of egg rows that need a high jump
    par:     [250, 400, 600, 800, 1000]        // endless: metres that count as a great run
  };
  D.HARDER = { speed: 1, ramp: 1, space: -1, spread: -1, grace: -1, foot: -1, jumpV: -1, gravity: 1, coyote: -1, buffer: -1,
    cost: 1, blink: -1, roarNeed: 1, big: 1, double: 1, roll: 1, span: 1, stones: 1, hearts: -1, high: 1, par: 1 };
  D.tune = function (tier) {
    var i = typeof tier === 'number' && tier >= 1 && tier <= D.TIERS ? Math.floor(tier) - 1 : 2, t = { tier: i + 1 };
    for (var k in D.TUNE) t[k] = D.TUNE[k][i];
    return t;
  };

  // Five biomes, three levels each. Every biome brings one new obstacle (fresh).
  D.BIOMES = [
    { key: 'desert', fresh: 'block', sets: [['block'], ['block', 'crate'], ['block', 'crate']] },
    { key: 'jungle', fresh: 'vine', sets: [['vine', 'block'], ['vine', 'block', 'mud', 'crate'], ['vine', 'block', 'mud', 'crate']] },
    { key: 'snow', fresh: 'roller', sets: [['roller', 'block'], ['roller', 'block', 'crate', 'vine'], ['roller', 'block', 'crate', 'vine', 'mud']] },
    { key: 'volcano', fresh: 'gap', sets: [['gap', 'block'], ['gap', 'block', 'roller', 'crate'], ['gap', 'block', 'roller', 'crate', 'vine']] },
    { key: 'night', fresh: 'flyer', sets: [['flyer', 'block'], ['flyer', 'block', 'gap', 'vine'], ['flyer', 'block', 'gap', 'vine', 'roller', 'crate', 'mud']] }
  ];
  D.LEVEL = [];
  for (var li = 0; li < 15; li++) {
    var lb = Math.floor(li / 3), ln = li % 3;
    D.LEVEL.push({ i: li, id: 'b' + (lb + 1) + 'L' + (ln + 1), biome: lb, n: ln, secs: 44 + ln * 7 + lb * 2, seed: 9173 + li * 7919 });
  }
  // What each obstacle asks of the child (the coach shows this key).
  D.ACTION = { block: 'jump', crate: 'jump', roller: 'jump', gap: 'jump', mud: 'jump', vine: 'duck', flyer: 'jump' };

  /* ------------------------------------------------------------ random */
  function rnd(w) {
    var t = (w.rs = (w.rs + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // A course code "0042" is the same endless course for everyone on this version.
  D.codeSeed = function (code) {
    var n = /^[0-9]{4}$/.test(String(code)) ? Number(code) : 0;
    return (Math.imul(n + 1, 2654435761) ^ 0x5bd1e995) >>> 0;
  };
  D.validCode = function (code) { return /^[0-9]{4}$/.test(String(code)); };

  /* ------------------------------------------------------------- world */
  function speedAt(w, x) {
    var T = w.T;
    return w.endless ? T.speed * (1 + Math.min(0.75, x / 2200)) : T.speed * (1 + T.ramp * Math.min(1, x / w.len));
  }
  D.speedAt = speedAt;
  D.biomeAt = function (w, x) {
    if (!w.endless) return w.biome;
    return (w.biome + Math.max(0, Math.floor(x / D.ZONE))) % 5;
  };
  // opts: { level: 0..14 } or { endless: true, seed }, and tier 1..5.
  D.create = function (opts) {
    opts = opts || {};
    var T = D.tune(opts.tier), endless = !!opts.endless, L = endless ? null : D.LEVEL[opts.level | 0] || D.LEVEL[0];
    var w = {
      endless: endless, level: L ? L.i : -1, id: L ? L.id : 'endless', biome: L ? L.biome : 0, n: L ? L.n : 0,
      tier: T.tier, T: T, rs: (endless ? (opts.seed >>> 0) || 1 : L.seed) >>> 0, seed: 0,
      t: 0, x: 0, speed: T.speed, len: Infinity, gx: 0, gend: Infinity, nid: 1,
      p: { y: 0, vy: 0, ground: true, duck: false, coy: 0, buf: 0, hold: HOLD, air: 0, jw: false, dw: false,
        hurt: 0, tumble: 0, slow: 0, dash: 0, roar: 0, hp: D.HP },
      obs: [], items: [], oi: 0, ii: 0, ev: [],
      eggs: 0, total: 0, bonus: 0, fruit: 0, bumps: 0, splashes: 0, smashed: 0, cleared: 0, jumps: 0,
      streak: 0, lastEgg: -9, lastKind: '', dry: 0, hearts: [], placed: 0, meter: 0, zone: 0, done: false, over: false
    };
    w.seed = w.rs;
    if (!endless) {
      w.len = Math.round(L.secs * T.speed * (1 + T.ramp / 2));
      w.gend = w.len - 2.8 * speedAt(w, w.len);
      for (var h = 0; h < T.hearts; h++) w.hearts.push(w.len * (h ? 0.72 : 0.42));
    }
    var intro = 3 * T.speed;
    row(w, intro * 0.4, 3, 0.45, 1.1);
    w.gx = intro;
    gen(w, endless ? intro + 90 : Infinity);
    return w;
  };

  function ev(w, t, extra) { var e = extra || {}; e.t = t; w.ev.push(e); return e; }
  function addObs(w, o) { o.id = w.nid++; o.cued = false; o.passed = false; o.dead = false; w.obs.push(o); return o; }
  function addItem(w, k, x, y) {
    w.items.push({ id: w.nid++, k: k, x: x, y: y, got: false });
    if (k === 'egg') w.total++;
  }
  function row(w, x, n, y, gap) { for (var i = 0; i < n; i++) addItem(w, 'egg', x + i * gap, y); }
  // Eggs along a jump over a spot: only a jump at the right time gathers them (a
  // running dino reaches eggs up to 1.5 m).
  function arc(w, cx, v, high, share) {
    if (w.placed >= 2 && rnd(w) > (share || 0.42)) return;
    var T = w.T, air = 2 * T.jumpV / T.gravity, apex = T.jumpV * T.jumpV / (2 * T.gravity);
    if (high) apex = Math.max(apex, 1.7);
    var dx = Math.min(1.2, v * air * 0.28), hs = Math.max(1.6, 0.5 + apex * 0.72);
    addItem(w, 'egg', cx - dx, hs);
    addItem(w, 'egg', cx, Math.max(1.75, 0.5 + apex * 0.95));
    addItem(w, 'egg', cx + dx, hs);
  }

  function pickKind(w, b, n) {
    var B = D.BIOMES[b], set = B.sets[w.endless ? 2 : n], total = 0, weights = [];
    // A new obstacle comes first, twice, so the child meets it alone.
    if (!w.endless && n === 0 && w.placed < 2) return B.fresh;
    for (var i = 0; i < set.length; i++) {
      var k = set[i], wt = k === B.fresh ? (n === 0 && !w.endless ? 1.8 : 1.3) : 1;
      if (k === 'mud' || k === 'crate') wt *= 0.7;
      if (k === w.lastKind && k !== 'block') wt *= 0.5;
      weights.push(wt); total += wt;
    }
    var r = rnd(w) * total;
    for (i = 0; i < set.length; i++) { r -= weights[i]; if (r <= 0) return set[i]; }
    return set[set.length - 1];
  }

  // Places one obstacle (or a pair) at x and returns how much course it takes.
  function place(w, kind, x, v) {
    var T = w.T, gentle = w.placed < 2, pair = !gentle && rnd(w) < T.double, look = (rnd(w) * 3) | 0, o, used;
    var tapD = v * 2 * T.jumpV / T.gravity;
    if (kind === 'block') {
      var big = !gentle && rnd(w) < T.big, form = big ? (rnd(w) < 0.5 ? 'tall' : 'wide') : 'small';
      var bw = form === 'wide' ? 1.7 : form === 'tall' ? 0.8 : 0.85, bh = form === 'tall' ? 1.3 : form === 'wide' ? 0.72 : 0.8;
      addObs(w, { kind: 'block', form: form, look: look, x: x, w: bw, y0: 0, y1: bh });
      arc(w, x + bw / 2, v, form === 'tall');
      used = bw;
      if (pair && form === 'small') {
        var x2 = x + bw / 2 + tapD + 0.28 * v - 0.42;
        addObs(w, { kind: 'block', form: 'small', look: (look + 1) % 3, x: x2, w: 0.85, y0: 0, y1: 0.8 });
        used = x2 + 0.85 - x;
      }
      return used;
    }
    if (kind === 'crate') {
      var cw = pair && w.tier >= 3 ? 2 : 1;
      addObs(w, { kind: 'crate', form: cw > 1 ? 'wall' : 'one', look: look, x: x, w: cw, y0: 0, y1: 1 });
      arc(w, x + cw / 2, v, cw > 1);
      return cw;
    }
    if (kind === 'vine') {
      addObs(w, { kind: 'vine', look: look, x: x, w: 0.55, y0: 1.0, y1: 4.5 });
      addItem(w, 'egg', x + 0.27, 0.32);
      return 0.55;
    }
    if (kind === 'flyer') {
      var low = gentle ? false : rnd(w) < 0.5;
      if (low) { addObs(w, { kind: 'flyer', form: 'low', look: look, x: x, w: 1.1, y0: 0.32, y1: 0.95 }); arc(w, x + 0.55, v, false); }
      else { addObs(w, { kind: 'flyer', form: 'mid', look: look, x: x, w: 1.2, y0: 1.0, y1: 1.75 }); addItem(w, 'egg', x + 0.6, 0.32); }
      return low ? 1.1 : 1.2;
    }
    if (kind === 'roller') {
      // Placed further away so that it meets the dino about here.
      var shift = T.roll * ACT / (v + T.roll);
      addObs(w, { kind: 'roller', look: look, x: x + shift, w: 0.9, y0: 0, y1: 0.9, vx: T.roll, active: false, slot: x });
      return 0.9;
    }
    if (kind === 'mud') {
      var mw = 2.6 + rnd(w) * 1.6;
      addObs(w, { kind: 'mud', look: look, x: x, w: mw, y0: 0, y1: 0 });
      row(w, x + mw / 2 - 0.9, 3, 1.85, 0.9);
      return mw;
    }
    // gap: a goo river, crossed in one hop when young, over stepping stones later.
    var spans = gentle ? 1 : 1 + Math.floor(rnd(w) * T.stones), gx = x, goo = [];
    var maxSpan = T.span * tapD, stone = Math.max(1.3, 0.34 * v);
    for (var k = 0; k < spans; k++) {
      var sp = maxSpan * (0.72 + 0.28 * rnd(w));
      goo.push([gx, gx + sp]);
      arc(w, gx + sp / 2, v, false, 0.6);
      gx += sp;
      if (k < spans - 1) gx += stone;
    }
    addObs(w, { kind: 'gap', look: look, x: x, w: gx - x, y0: -2, y1: 0, goo: goo, jelly: false });
    return gx - x;
  }

  // Eggs, fruit or a heart in the open run between two obstacles.
  function filler(w, x, room, v) {
    var T = w.T, mid = x + room / 2;
    if (w.hearts.length && mid >= w.hearts[0]) { w.hearts.shift(); addItem(w, 'heart', mid, 1.9); return; }
    if (room < 3.2) return;
    var r = rnd(w);
    // Fruit at least every third open run, so the roar comes round in every level.
    if (r < 0.4 || w.dry >= 2) { addItem(w, 'fruit', mid, rnd(w) < 0.5 ? 0.5 : 1.9); w.dry = 0; return; }
    w.dry++;
    if (r < 0.4 + 0.45 * T.high) { var hn = Math.min(3, Math.floor(room / 2.4)); if (hn > 0) row(w, mid - (hn - 1) * 0.5, hn, 2.9, 1); }
    else if (r < 0.7) row(w, mid - 0.9, 3, 0.45, 0.9);
  }

  function gen(w, until) {
    var T = w.T;
    while (w.gx < until && w.gx < w.gend) {
      var x = w.gx, v = speedAt(w, x);
      if (w.endless) {
        // A biome change gets a clear run (and young runners a heart).
        var z = Math.floor(x / D.ZONE), end = (z + 1) * D.ZONE;
        if (x > end - 1.6 * v) {
          w.gx = end + 1.2 * v;
          if (T.hearts > 0) addItem(w, 'heart', end + 0.6 * v, 1.9);
          continue;
        }
      }
      var b = D.biomeAt(w, x), kind = pickKind(w, b, w.n);
      var used = place(w, kind, x, v);
      w.lastKind = kind; w.placed++;
      var after = x + used, room = (T.space + rnd(w) * T.spread) * v;
      if (kind === 'roller') room += 0.4 * v;
      if (!w.endless && after + room > w.gend) room = Math.max(room, w.len - after - 1);
      filler(w, after, room, v);
      w.gx = after + room;
    }
    // Items are kept in course order for the collector.
    for (var i = Math.max(w.ii, 1); i < w.items.length; i++) {
      if (w.items[i].x >= w.items[i - 1].x) continue;
      var a = w.items.slice(w.ii).sort(function (p, q) { return p.x - q.x; });
      for (var j = 0; j < a.length; j++) w.items[w.ii + j] = a[j];
      break;
    }
  }

  // Is there ground under the dino at x? Not over goo, unless a splash made it jelly.
  function solid(w, x) {
    var f = w.T.foot;
    for (var i = w.oi; i < w.obs.length; i++) {
      var o = w.obs[i];
      if (o.x > x + 1) break;
      if (o.kind !== 'gap' || o.jelly || x > o.x + o.w) continue;
      for (var k = 0; k < o.goo.length; k++) if (x > o.goo[k][0] + f && x < o.goo[k][1] - f) return false;
    }
    return true;
  }
  D.solid = solid;

  /* -------------------------------------------------------------- step */
  // input: { jump: held (or tapped this frame), duck: held, dash: held }.
  D.step = function (w, dt, input) {
    if (w.done || w.over || !(dt > 0)) return w.ev;
    input = input || {};
    var left = Math.min(dt, 0.25);
    while (left > 1e-9 && !w.done && !w.over) {
      var h = Math.min(SUB, left);
      tick(w, h, input);
      left -= h;
    }
    return w.ev;
  };

  function hurt(w, cost) {
    var p = w.p;
    p.hp = Math.max(0, p.hp - cost);
    p.hurt = w.T.blink; p.tumble = 0.5;
    if (p.hp <= 0) { w.over = true; ev(w, 'over'); }
  }

  function tick(w, h, inp) {
    var p = w.p, T = w.T, jump = !!inp.jump, press = jump && !p.jw, dashKey = !!inp.dash, dashPress = dashKey && !p.dw;
    w.t += h;
    p.jw = jump; p.dw = dashKey;
    p.buf = press ? T.buffer : Math.max(0, p.buf - h);
    p.hurt = Math.max(0, p.hurt - h); p.tumble = Math.max(0, p.tumble - h); p.slow = Math.max(0, p.slow - h);
    if (p.dash > 0) { p.dash = Math.max(0, p.dash - h); if (!p.dash) ev(w, 'dashEnd'); }
    if (dashPress && p.dash <= 0) {
      if (p.roar >= 1) { p.dash = DASH_S; p.roar = 0; p.tumble = 0; ev(w, 'dash'); }
      else ev(w, 'noRoar');
    }
    p.duck = !!inp.duck && p.tumble <= 0;
    var target = speedAt(w, w.x) * (p.dash > 0 ? DASH_X : p.slow > 0 ? MUD_X : 1) * (p.tumble > 0 ? 0.62 : 1);
    w.speed += (target - w.speed) * Math.min(1, h * (p.dash > 0 ? 14 : 6));

    if (p.buf > 0 && (p.ground || p.coy > 0) && p.tumble <= 0) {
      p.vy = T.jumpV; p.ground = false; p.coy = 0; p.buf = 0; p.hold = 0; p.air = 0;
      w.jumps++;
      ev(w, 'jump');
    }
    if (!p.ground) {
      var g = T.gravity;
      if (jump && p.vy > 0 && p.hold < HOLD) { g *= 0.5; p.hold += h; } else p.hold = HOLD;
      if (inp.duck && p.vy < 4) g *= 2.3; // fast fall
      p.vy -= g * h; p.y += p.vy * h; p.air += h;
      p.coy = Math.max(0, p.coy - h);
    }
    var nx = w.x + w.speed * h, sup = p.dash > 0 || solid(w, nx);
    if (p.ground) {
      if (!sup) { p.ground = false; p.coy = T.coyote; p.vy = 0; p.hold = HOLD; }
    } else if (p.vy <= 0 && p.y <= 0) {
      if (sup && p.y > -0.42) {
        var power = -p.vy;
        p.y = 0; p.vy = 0; p.ground = true; p.air = 0;
        ev(w, 'land', { power: Math.min(1, power / 14) });
      } else if (p.y <= -0.45) splash(w, nx);
    }
    w.x = nx;
    if (p.dash > 0 && p.y < 0) { p.y = 0; p.vy = 0; p.ground = true; }

    var top = p.duck ? (p.ground ? DUCK : AIR_DUCK) : STAND;
    var x0 = w.x - HALF_W, x1 = w.x + HALF_W, y0 = p.y + 0.05, y1 = p.y + top, gr = T.grace;
    for (var i = w.oi; i < w.obs.length; i++) {
      var o = w.obs[i];
      if (o.x > w.x + 40) break;
      if (o.kind === 'roller') {
        if (!o.active && o.x - w.x <= ACT) o.active = true;
        if (o.active && o.x > w.x - 8) o.x -= o.vx * h;
      }
      if (!o.cued && o.kind !== 'mud' && o.x - x1 < (w.speed + (o.active ? o.vx : 0)) * D.CUE_S) { o.cued = true; ev(w, 'cue', { id: o.id, kind: o.kind, form: o.form || '' }); }
      if (o.kind === 'mud') {
        if (!o.dead && p.ground && p.dash <= 0 && w.x > o.x && w.x < o.x + o.w) { if (p.slow <= 0) ev(w, 'mud'); p.slow = 0.3; }
        continue;
      }
      if (o.passed) continue;
      if (x0 > o.x + o.w - gr) {
        o.passed = true;
        if (!o.dead) { w.cleared++; ev(w, 'clear', { id: o.id, kind: o.kind }); }
        continue;
      }
      if (o.dead || o.kind === 'gap') continue;
      if (x1 > o.x + gr && x0 < o.x + o.w - gr && y1 > o.y0 + (o.y0 > 0 ? gr : 0) && y0 < o.y1 - gr) {
        if (p.dash > 0) {
          o.dead = true; o.smashed = true; w.smashed++;
          var bonus = o.kind === 'crate' ? 2 : 1;
          w.eggs += bonus; w.bonus += bonus;
          ev(w, 'smash', { id: o.id, kind: o.kind, bonus: bonus });
        } else if (p.hurt <= 0) {
          o.dead = true; o.hit = true; w.bumps++;
          ev(w, 'bump', { id: o.id, kind: o.kind });
          hurt(w, T.cost);
          if (p.ground) { p.vy = 4.5; p.ground = false; p.hold = HOLD; }
        } else { o.dead = true; o.soft = true; }
      }
    }
    while (w.oi < w.obs.length) {
      var q = w.obs[w.oi];
      if (q.x + q.w < w.x - 6 && (q.kind !== 'roller' || q.passed)) w.oi++; else break;
    }

    for (var j = w.ii; j < w.items.length; j++) {
      var it = w.items[j];
      if (it.x > x1 + 0.6) break;
      if (it.got || Math.abs(it.x - w.x) > HALF_W + 0.42 || it.y < p.y - 0.25 || it.y > p.y + top + 0.2) continue;
      it.got = true;
      if (it.k === 'egg') {
        w.streak = w.t - w.lastEgg < 0.7 ? w.streak + 1 : 1; w.lastEgg = w.t;
        w.eggs++;
        ev(w, 'egg', { id: it.id, n: w.streak });
      } else if (it.k === 'fruit') {
        var was = p.roar;
        w.fruit++;
        p.roar = Math.min(1, p.roar + 1 / T.roarNeed + 1e-9);
        ev(w, 'fruit', { id: it.id, full: was < 1 && p.roar >= 1 });
      } else {
        p.hp = Math.min(D.HP, p.hp + 2);
        ev(w, 'heart', { id: it.id });
      }
    }
    while (w.ii < w.items.length && w.items[w.ii].x < w.x - 4) w.ii++;

    if (w.endless) {
      if (w.x + 90 > w.gx) gen(w, w.x + 120);
      var m = Math.floor(w.x / 100);
      if (m > w.meter) { w.meter = m; ev(w, 'meter', { m: m * 100 }); }
      var z = Math.floor(w.x / D.ZONE);
      if (z > w.zone) { w.zone = z; ev(w, 'biome', { b: D.biomeAt(w, w.x) }); }
      // Long runs keep only the course near the dino.
      if (w.oi > 80) { w.obs.splice(0, w.oi); w.oi = 0; }
      if (w.ii > 160) { w.items.splice(0, w.ii); w.ii = 0; }
    } else if (w.x >= w.len) { w.done = true; ev(w, 'finish'); }
  }

  function splash(w, x) {
    var p = w.p;
    for (var i = w.oi; i < w.obs.length; i++) {
      var o = w.obs[i];
      if (o.kind === 'gap' && x >= o.x - 0.5 && x <= o.x + o.w + 0.5) { o.jelly = true; if (!o.dead) { o.dead = true; o.hit = true; } break; }
    }
    w.splashes++; w.bumps++;
    p.y = -0.45; p.vy = 8.5; p.ground = false; p.hold = HOLD;
    ev(w, 'splash');
    hurt(w, w.T.cost);
  }

  // A copy that can be stepped without touching the original (the test's planner).
  D.clone = function (w) {
    var c = Object.assign({}, w);
    c.p = Object.assign({}, w.p); c.ev = []; c.hearts = w.hearts.slice();
    c.obs = w.obs.slice(); c.items = w.items.slice();
    for (var i = w.oi; i < c.obs.length && c.obs[i].x < w.x + 90; i++) c.obs[i] = Object.assign({}, c.obs[i]);
    for (i = w.ii; i < c.items.length && c.items[i].x < w.x + 90; i++) c.items[i] = Object.assign({}, c.items[i]);
    return c;
  };
  D.progress = function (w) { return w.endless ? 0 : Math.max(0, Math.min(1, w.x / w.len)); };

  /* ------------------------------------------------------ stars, DDA */
  D.result = function (w) {
    return { endless: w.endless, finished: w.done, over: w.over, eggs: w.eggs, total: w.total, lost: D.HP - w.p.hp,
      bumps: w.bumps, tier: w.tier, progress: D.progress(w), distance: Math.floor(w.x), smashed: w.smashed, time: w.t };
  };
  D.eggGoal = function (total) { return Math.ceil(total * 0.7); };
  // Finishing earns a star, 70% of the eggs another, and few bumps the third
  // (none from tier 3 up; up to one heart at tiers 1 and 2).
  D.stars = function (r) {
    if (!r.finished) return 0;
    var safe = r.tier <= 2 ? r.lost <= 2 : r.lost === 0;
    return 1 + (r.eggs >= D.eggGoal(r.total) ? 1 : 0) + (safe ? 1 : 0);
  };
  // 0..1 for Kit.dda: a finish counts most, then the eggs and the hearts kept.
  D.outcome = function (r) {
    var x;
    if (r.endless) x = r.distance / D.TUNE.par[(r.tier || 3) - 1];
    else if (!r.finished) x = 0.3 * r.progress;
    else x = 0.5 + 0.25 * Math.min(1, r.eggs / Math.max(1, 0.85 * r.total)) + 0.25 * Math.max(0, 1 - 1.5 * r.lost / D.HP);
    return Math.round(Math.max(0, Math.min(1, x)) * 1000) / 1000;
  };

  /* ------------------------------------------------------ the wardrobe */
  // Unlocked by all the eggs a child has ever gathered (nothing is spent).
  D.COLORS = [
    { c: 0x67d35c, need: 0 }, { c: 0xff9a3c, need: 20 }, { c: 0x4fb8ff, need: 50 }, { c: 0xff7ec4, need: 90 },
    { c: 0xa47bff, need: 140 }, { c: 0xffd23f, need: 200 }, { c: 0xff5a5a, need: 280 }, { c: 0x2fd6c4, need: 380 }
  ];
  D.HATS = [
    { id: 'none', need: 0 }, { id: 'bow', need: 10 }, { id: 'cap', need: 35 }, { id: 'flower', need: 70 }, { id: 'party', need: 110 },
    { id: 'shades', need: 160 }, { id: 'crown', need: 220 }, { id: 'viking', need: 300 }, { id: 'wizard', need: 400 }
  ];
  D.unlocks = function (before, after) {
    var out = [];
    D.COLORS.forEach(function (c, i) { if (c.need > before && c.need <= after) out.push({ type: 'color', i: i }); });
    D.HATS.forEach(function (h, i) { if (h.need > before && h.need <= after) out.push({ type: 'hat', i: i }); });
    return out;
  };

  /* ------------------------------------------------------------ saves */
  // { v: 2, stars: [15] 0..3, best: [15] most eggs in a level, bank: every egg ever
  //   gathered, far: best endless metres, color, hat, seen: the bank when the wardrobe
  //   was last opened, coach: the first level was finished once }
  D.freshSave = function () {
    var z = []; for (var i = 0; i < 15; i++) z.push(0);
    return { v: 2, stars: z.slice(), best: z.slice(), bank: 0, far: 0, color: 0, hat: 0, seen: 0, coach: false };
  };
  function int(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  // Every field is checked: an old save from the first Dino 3D, junk, or a hand-edited
  // save always loads as a playable one.
  D.loadSave = function (raw) {
    var s = D.freshSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 2) return s;
    for (var i = 0; i < 15; i++) {
      var st = Array.isArray(raw.stars) ? raw.stars[i] : 0, b = Array.isArray(raw.best) ? raw.best[i] : 0;
      s.stars[i] = int(st, 0, 3) ? st : 0;
      s.best[i] = int(b, 0, 9999) ? b : 0;
    }
    s.bank = int(raw.bank, 0, 99999999) ? raw.bank : 0;
    s.far = int(raw.far, 0, 99999999) ? raw.far : 0;
    s.color = int(raw.color, 0, D.COLORS.length - 1) && D.COLORS[raw.color].need <= s.bank ? raw.color : 0;
    s.hat = int(raw.hat, 0, D.HATS.length - 1) && D.HATS[raw.hat].need <= s.bank ? raw.hat : 0;
    s.seen = int(raw.seen, 0, s.bank) ? raw.seen : 0;
    s.coach = raw.coach === true;
    return s;
  };
  D.totalStars = function (s) { var n = 0; for (var i = 0; i < 15; i++) n += s.stars[i]; return n; };
  // A level opens when the one before it has a star.
  D.isOpen = function (s, i) { return i === 0 || s.stars[i - 1] > 0 || s.stars[i] > 0; };
  D.biomeOpen = function (s, b) { return D.isOpen(s, b * 3); };
  D.nextLevel = function (s) {
    for (var i = 0; i < 15; i++) if (D.isOpen(s, i) && !s.stars[i]) return i;
    return 14;
  };
})();
