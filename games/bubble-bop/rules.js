/* Bubble Bop (فقاعات بوب) rules: the tuning tables, the world simulation, forgiving
 * hit tests, stars, round ids, rewards and saves.
 * Pure: no DOM, no Kit, no timers and no Math.random (a world takes a seed), so the
 * Node test loads this file with { window: {} } and plays whole levels with fake input.
 * game.js reads the DDA tier, builds a plan, steps the world with the child's input
 * and turns the world's events into pictures, sound and statistics. */
(function () {
  'use strict';
  var BB = window.BB = window.BB || {};
  var W = 1280, H = 720;
  BB.W = W; BB.H = H;
  BB.TIERS = 5;
  BB.LEVELS = 3;          // per world, plus one party round
  BB.PARTY_SECONDS = 60;
  BB.WAVE_SECONDS = 15;   // a party gets faster every 15 s
  BB.BOP_R = 42;          // Bop's body radius
  BB.COMBO_WINDOW = 1.6;  // s between two pops that keep a combo going

  // Worlds 1-4 teach one input each; world 5 mixes them.
  BB.WORLDS = [
    { mode: 'touch', scene: 'sea' },
    { mode: 'tap', scene: 'sky' },
    { mode: 'jump', scene: 'pond' },
    { mode: 'catch', scene: 'orchard' },
    { mode: 'mix', scene: 'party' }
  ];
  BB.MODES = ['touch', 'tap', 'jump', 'catch'];

  // The frog's pond and the basket's orchard, in logical pixels.
  BB.FROG = { x: 640, ground: 598, h: 96, v: 1020, g: 2900, tongue: 86 };
  BB.BASKET = { y: 604, ground: 676 };
  // On-screen keys that light up with the real ones (art draws them, game clicks them).
  BB.KEYS = {
    space: { x: 640, y: 676, w: 460, h: 62 },
    left: { x: 86, y: 650, w: 112, h: 84 },
    right: { x: 1194, y: 650, w: 112, h: 84 },
    mouse: { x: 1206, y: 636, w: 76, h: 104 }
  };

  // One entry per DDA tier: 1 is tuned for a six-year-old who has never held a mouse,
  // 5 is a brisk challenge for a ten-year-old. BB.HARDER says which way each knob moves
  // as the tiers get harder; tools/tests/bubble-bop-rules.test.mjs checks every row.
  BB.TUNE = {
    touch: {
      r: [66, 58, 50, 43, 37],            // bubble art radius
      margin: [26, 20, 14, 10, 6],        // hit reach beyond the art (and Bop's body)
      speed: [42, 60, 82, 108, 138],      // drift up, px/s
      live: [2, 3, 3, 4, 5],              // bubbles on screen at once
      gap: [1.5, 1.25, 1, 0.82, 0.68],    // s between new bubbles
      magnet: [170, 125, 88, 56, 30],     // strongest pull towards a moving Bop, px/s
      reach: [240, 205, 170, 140, 115],   // pull range beyond touching, px
      wait: [999, 8, 5.5, 3.8, 2.6],      // s a bubble waits near the top, then floats away
      spread: [380, 480, 620, 820, 1280], // how far from Bop a new bubble may start, px
      sway: [14, 22, 32, 44, 56],         // side-to-side wobble, px
      gold: [0.05, 0.07, 0.09, 0.11, 0.13], // share of gold bubbles in a party
      par: [6, 4.6, 3.6, 2.9, 2.3],       // s per bubble for the pace star
      extra: [0, 3, 6, 9, 12]             // more bubbles per level
    },
    tap: {
      r: [70, 61, 53, 46, 40],
      margin: [46, 36, 27, 19, 12],
      live: [1, 2, 2, 3, 4],
      gap: [1.1, 0.95, 0.8, 0.68, 0.56],
      life: [999, 9, 6.5, 5, 4],          // s before a balloon floats away
      drift: [0, 10, 26, 44, 64],         // sideways wander, px/s
      bob: [8, 11, 15, 19, 24],           // up-and-down bob, px
      magnet: [80, 62, 45, 28, 14],       // pull towards a moving pointer, px/s
      reach: [210, 180, 150, 120, 95],
      spread: [420, 520, 640, 820, 1280],
      gold: [0.05, 0.07, 0.09, 0.11, 0.13],
      par: [5, 3.8, 3, 2.4, 1.9],
      extra: [0, 2, 4, 6, 8]
    },
    jump: {
      speed: [140, 170, 200, 240, 290],   // fly speed, px/s
      window: [140, 118, 100, 86, 74],     // how far beside the frog a fly is still caught, px
      slow: [0, 0.34, 0.48, 0.62, 0.75],   // speed share while passing the frog (0: it waits)
      wait: [999, 0, 0, 0, 0],            // s a fly waits above the frog
      buffer: [0.5, 0.4, 0.3, 0.22, 0.16], // s a press in the air is kept for the next jump
      anyKey: [1, 0, 0, 0, 0],            // 1: any key or a click on the Space bar jumps
      live: [1, 1, 2, 2, 3],
      gap: [1.3, 1.15, 1, 0.85, 0.7],
      spread: [340, 420, 500, 580, 680],  // how far from the frog a fly appears
      zig: [6, 12, 20, 28, 36],           // up-and-down flutter, px
      gold: [0.05, 0.07, 0.09, 0.11, 0.13],
      par: [5, 3.6, 2.8, 2.2, 1.8],
      extra: [0, 2, 4, 6, 8]
    },
    catch: {
      hw: [125, 106, 90, 77, 65],         // half the basket's catching width
      fall: [90, 125, 165, 210, 260],     // fruit speed, px/s
      basket: [560, 600, 650, 700, 760],  // basket top speed, keeps pace with the fruit
      magnet: [150, 110, 76, 46, 22],     // sideways pull into the basket, px/s
      reach: [260, 220, 185, 150, 120],
      live: [1, 1, 2, 2, 3],
      gap: [1.3, 1.1, 0.95, 0.8, 0.66],
      spread: [360, 480, 620, 820, 1280], // how far from the basket a fruit may fall
      sway: [0, 10, 20, 34, 50],
      gold: [0.05, 0.07, 0.09, 0.11, 0.13],
      par: [6, 4.2, 3.2, 2.6, 2.1],
      extra: [0, 2, 4, 6, 8]
    }
  };
  // +1: grows with the tier, -1: shrinks with the tier.
  BB.HARDER = { r: -1, margin: -1, speed: 1, live: 1, gap: -1, magnet: -1, reach: -1, wait: -1, spread: 1, sway: 1,
    gold: 1, par: -1, extra: 1, life: -1, drift: 1, bob: 1, window: -1, slow: 1, buffer: -1, anyKey: -1, zig: 1,
    hw: -1, fall: 1, basket: 1 };
  // Targets per level (before the tier's extra), and per mode in a world-5 level.
  BB.GOALS = { touch: [8, 12, 16], tap: [6, 9, 12], jump: [5, 7, 9], catch: [5, 7, 9], mix: [3, 4, 5] };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function tierOf(t) { t = Math.round(Number(t)); return t >= 1 && t <= BB.TIERS ? t : 1; }
  BB.clamp = clamp;

  // Seeded random numbers (mulberry32), so a level replays exactly in tests.
  BB.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* --------------------------------------------------------------- ids */
  // 'w1L1'..'w5L3' for levels and 'w1P'..'w5P' for party rounds.
  BB.roundId = function (w, l) { return 'w' + (w + 1) + (l === 'P' ? 'P' : 'L' + (l + 1)); };
  BB.ROUND_IDS = [];
  for (var wi = 0; wi < 5; wi++) { for (var li = 0; li < 3; li++) BB.ROUND_IDS.push(BB.roundId(wi, li)); BB.ROUND_IDS.push(BB.roundId(wi, 'P')); }

  /* -------------------------------------------------------------- plans */
  // What one try plays: its modes and goals at a tier, the pace par and, for a party, the clock.
  BB.plan = function (w, l, tier) {
    tier = tierOf(tier);
    w = clamp(w | 0, 0, 4);
    var party = l === 'P', lv = party ? 0 : clamp(l | 0, 0, 2), mix = BB.WORLDS[w].mode === 'mix';
    var modes = mix ? BB.MODES : [BB.WORLDS[w].mode], par = 0, expect = 0;
    var segments = modes.map(function (mode) {
      var t = BB.TUNE[mode];
      var goal = party ? 0 : mix ? BB.GOALS.mix[lv] + (tier - 1) : BB.GOALS[mode][lv] + t.extra[tier - 1];
      par += goal * t.par[tier - 1] + 2;
      expect += BB.WAVE_SECONDS / (t.gap[tier - 1] * 0.62) * 0.55;
      return { mode: mode, goal: goal };
    });
    // A party of one mode lasts four waves of that mode.
    if (!mix) expect *= 4;
    return { w: w, l: party ? 'P' : lv, party: party, tier: tier, segments: segments, par: Math.round(par),
      duration: party ? BB.PARTY_SECONDS : 0, expect: Math.round(expect), id: BB.roundId(w, party ? 'P' : lv) };
  };

  /* --------------------------------------------------------- hit tests */
  // Forgiving hit tests: a point within the art radius plus the margin counts.
  BB.touchHit = function (x, y, t, margin) {
    var dx = x - t.x, dy = y - t.y, r = t.r + (margin || 0);
    return dx * dx + dy * dy <= r * r;
  };
  // A balloon is a little taller than wide: its body counts as 1.1 times its radius.
  BB.clickHit = function (x, y, t, margin) {
    var dx = x - t.x, dy = y - t.y, r = t.r * 1.1 + (margin || 0);
    return dx * dx + dy * dy <= r * r;
  };
  // Aim assist: moves t towards (ax, ay), stronger when closer, only inside reach and
  // never closer than stop. It never pushes a target away and moves it at most
  // strength * dt per step, so a target never jumps. Returns the distance moved.
  BB.magnet = function (t, ax, ay, strength, reach, dt, stop) {
    var dx = ax - t.x, dy = ay - t.y, d = Math.sqrt(dx * dx + dy * dy);
    stop = stop > 0 ? stop : 0;
    if (!(d > stop) || !(d <= reach) || !(strength > 0) || !(dt > 0)) return 0;
    var step = Math.min(strength * (0.35 + 0.65 * (1 - d / reach)) * dt, d - stop);
    t.x += dx / d * step;
    t.y += dy / d * step;
    return step;
  };
  // Bop floats after the pointer on a stiff, critically damped spring.
  BB.follow = function (bop, tx, ty, dt) {
    var k = 24, h = dt / 2;
    for (var i = 0; i < 2; i++) {
      bop.vx += (k * k * (tx - bop.x) - 2 * k * bop.vx) * h;
      bop.vy += (k * k * (ty - bop.y) - 2 * k * bop.vy) * h;
      bop.x += bop.vx * h;
      bop.y += bop.vy * h;
    }
  };

  /* ------------------------------------------------------------- world */
  BB.create = function (plan, seed) {
    var w = {
      plan: plan, tier: plan.tier, party: plan.party, rand: BB.rng(seed == null ? 1 : seed),
      t: 0, seg: -1, mode: '', tune: null, segT: 0, segHits: 0, goal: 0, made: 0,
      hits: 0, escapes: 0, missClicks: 0, spawned: 0, score: 0, combo: 0, bestCombo: 0, mult: 1, lastHit: -9,
      wave: 1, over: false, targets: [], next: 1, spawnT: 0, ev: [], activity: 0,
      bop: { x: W / 2, y: H / 2 + 40, vx: 0, vy: 0 },
      frog: { x: BB.FROG.x, y: BB.FROG.ground, vy: 0, air: false, buffer: 0, tongue: 0, tx: 0, ty: 0, jumps: 0 },
      basket: { x: W / 2, vx: 0, hw: 100, squash: 0 },
      px: W / 2, py: H / 2 + 40, known: false
    };
    enter(w, 0);
    return w;
  };
  function enter(w, i) {
    var seg = w.plan.segments[i];
    w.seg = i; w.mode = seg.mode; w.tune = BB.TUNE[seg.mode];
    w.segT = 0; w.segHits = 0; w.goal = seg.goal; w.spawnT = 0; w.made = 0;
    w.basket.hw = w.mode === 'catch' ? knob(w, 'hw') : w.basket.hw;
  }
  // A knob for the current mode and tier, with the party's faster waves on top.
  function knob(w, key) {
    var v = w.tune[key][w.tier - 1];
    if (!w.party) return v;
    var k = Math.pow(1.12, w.wave - 1);
    if (key === 'gap') return v * 0.62 / k;
    if (key === 'speed' || key === 'fall') return v * 1.1 * k;
    if (key === 'live') return v + 1 + Math.min(2, w.wave - 1);
    if (key === 'wait' || key === 'life') return Math.min(v, 6.5 / k);
    return v;
  }
  BB.knob = knob;

  function make(w, kind, x, y, r) {
    var t = { id: w.next++, kind: kind, x: x, y: y, r: r, age: 0, phase: w.rand() * 6.283, color: Math.floor(w.rand() * 6),
      gold: w.party && w.rand() < knob(w, 'gold'), dead: false };
    w.targets.push(t); w.spawned++; w.made++;
    w.ev.push({ t: 'spawn', kind: kind, id: t.id, x: x, y: y });
    return t;
  }
  function live(w) { var n = 0; for (var i = 0; i < w.targets.length; i++) if (!w.targets[i].dead) n++; return n; }
  // An x within `spread` of `near` but at least `away` from it, clear of other new targets.
  function pickX(w, near, spread, away, edge) {
    var lo = edge, hi = W - edge, i, x, d;
    for (i = 0; i < 10; i++) {
      x = lo + w.rand() * (hi - lo); d = Math.abs(x - near);
      if (d <= spread && d >= away && !crowded(w, x)) return x;
    }
    var side = w.rand() < 0.5 ? -1 : 1;
    d = away + w.rand() * Math.max(0, Math.min(spread, 420) - away);
    x = near + side * d;
    if (x < lo || x > hi) x = near - side * d;
    return clamp(x, lo, hi);
  }
  function crowded(w, x) {
    for (var i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.dead && Math.abs(t.x - x) < t.r * 2.2 + 30 && (t.kind !== 'bubble' || t.y > H - 260) && (t.kind !== 'fruit' || t.y < 260)) return true;
    }
    return false;
  }

  function pop(w, t, by) {
    t.dead = true;
    w.hits++; w.segHits++;
    w.combo = w.t - w.lastHit <= BB.COMBO_WINDOW ? w.combo + 1 : 1;
    w.lastHit = w.t;
    if (w.combo > w.bestCombo) w.bestCombo = w.combo;
    w.mult = w.party ? Math.min(5, 1 + Math.floor(w.combo / 5)) : 1;
    var points = (t.gold ? 5 : 1) * w.mult;
    w.score += points;
    w.ev.push({ t: 'pop', kind: t.kind, id: t.id, x: t.x, y: t.y, r: t.r, gold: t.gold, color: t.color, combo: w.combo,
      mult: w.mult, points: points, by: by, age: t.age, big: !!t.big, type: t.type });
    // A big bubble bursts into three little ones.
    if (t.big) {
      for (var i = 0; i < 3; i++) {
        var m = make(w, 'bubble', t.x, t.y, t.r * 0.5);
        m.vx = (i - 1) * 260; m.vy = 0; m.hoverY = Math.min(t.y, 300); m.wait = t.wait; m.waited = 0; m.sway = t.sway * 0.5; m.speedK = 1.3; m.mini = true;
        m.gold = false;
      }
    }
  }
  function escape(w, t) {
    t.dead = true;
    w.escapes++; w.combo = 0; w.mult = 1;
    w.ev.push({ t: 'escape', kind: t.kind, id: t.id, x: t.x, y: t.y, r: t.r, color: t.color, type: t.type });
  }
  function vanish(w) {
    for (var i = 0; i < w.targets.length; i++) {
      var t = w.targets[i];
      if (!t.dead) { t.dead = true; w.ev.push({ t: 'vanish', kind: t.kind, x: t.x, y: t.y, r: t.r, color: t.color, type: t.type }); }
    }
  }

  /* ------------------------------------------------------------ modes */
  var MODE = {};
  MODE.touch = {
    spawn: function (w) {
      var r = knob(w, 'r'), lv = w.party ? 0 : w.plan.l, big = !w.party && lv === 2 && w.made % 4 === 3;
      var b = make(w, 'bubble', pickX(w, w.bop.x, knob(w, 'spread'), w.party ? 0 : 150, 150), 0, big ? r * 1.3 : w.party && w.rand() < 0.5 ? r * 0.85 : r);
      b.y = H + b.r + 8;
      if (b.gold) b.r = r * 0.8;
      b.hoverY = 190 + w.rand() * 230; b.wait = knob(w, 'wait'); b.waited = 0;
      b.sway = knob(w, 'sway') * [1, 1.8, 2.4][lv]; b.big = big; b.speedK = big ? 0.8 : b.gold ? 1.35 : 1; b.vx = 0;
    },
    update: function (w, dt) {
      var bop = w.bop, margin = knob(w, 'margin'), magnet = knob(w, 'magnet') * w.activity, reach = knob(w, 'reach'), speed = knob(w, 'speed');
      for (var i = 0; i < w.targets.length; i++) {
        var b = w.targets[i];
        if (b.dead) continue;
        b.age += dt;
        if (b.vx) { b.x += b.vx * dt; b.vx *= Math.pow(0.04, dt); if (Math.abs(b.vx) < 3) b.vx = 0; }
        if (b.y <= b.hoverY && b.waited < b.wait) b.waited += dt;
        else b.y -= (speed * b.speedK + Math.max(0, b.y - 560) * 1.8) * dt;
        b.x = clamp(b.x + Math.cos(b.age * 1.5 + b.phase) * b.sway * 1.5 * dt, b.r + 8, W - b.r - 8);
        if (w.known && magnet > 0) BB.magnet(b, bop.x, bop.y, magnet, reach + b.r + BB.BOP_R, dt, b.r * 0.5);
        // Bop's body or the pointer itself pops a bubble: whichever reaches it first.
        if (w.known && (BB.touchHit(bop.x, bop.y, b, BB.BOP_R + margin) || BB.touchHit(w.px, w.py, b, margin))) pop(w, b, 'touch');
        else if (b.y < -b.r - 12) escape(w, b);
      }
    }
  };
  MODE.tap = {
    spawn: function (w) {
      var r = knob(w, 'r'), spread = knob(w, 'spread'), ax = w.known ? w.px : w.bop.x, ay = w.known ? w.py : w.bop.y;
      var x = 0, y = 0, best = -1, i, j;
      for (i = 0; i < 16; i++) {
        var cx = 170 + w.rand() * (W - 340), cy = 200 + w.rand() * 300, d = Math.sqrt((cx - ax) * (cx - ax) + (cy - ay) * (cy - ay));
        var room = 9999;
        for (j = 0; j < w.targets.length; j++) {
          var o = w.targets[j];
          if (!o.dead) room = Math.min(room, Math.sqrt((o.x - cx) * (o.x - cx) + (o.y - cy) * (o.y - cy)) - o.r - r);
        }
        // Near the pointer (but never right under it) and clear of the other balloons.
        var score = (d <= spread && d >= r + 90 ? 2 : 0) + (room > 40 ? 1 : 0);
        if (score > best) { best = score; x = cx; y = cy; }
        if (score === 3) break;
      }
      var b = make(w, 'balloon', x, y, r);
      if (b.gold) b.r = r * 0.85;
      b.bx = x; b.by = y; b.grow = 0; b.leaving = false; b.life = knob(w, 'life');
      b.vx = (knob(w, 'drift') + (w.party ? 0 : w.plan.l * 8)) * (w.rand() < 0.5 ? -1 : 1) * (0.6 + 0.4 * w.rand());
      b.bob = knob(w, 'bob') * (!w.party && w.plan.l === 1 ? 1.4 : 1);
    },
    update: function (w, dt, input) {
      var margin = knob(w, 'margin'), magnet = knob(w, 'magnet') * w.activity, reach = knob(w, 'reach'), i, b;
      for (i = 0; i < w.targets.length; i++) {
        b = w.targets[i];
        if (b.dead) continue;
        b.age += dt;
        b.grow = Math.min(1, b.grow + dt / 0.35);
        if (!b.leaving && b.age > b.life) b.leaving = true;
        if (b.leaving) b.by -= (160 + 60 * b.age / (b.life + 1)) * dt;
        else {
          b.bx += b.vx * dt;
          if (b.bx < b.r + 40 || b.bx > W - b.r - 40) { b.vx = -b.vx; b.bx = clamp(b.bx, b.r + 40, W - b.r - 40); }
        }
        b.x = b.bx; b.y = b.by + Math.sin(b.age * 2.1 + b.phase) * b.bob;
        if (w.known && !b.leaving && magnet > 0) {
          var m = { x: b.x, y: b.y };
          BB.magnet(m, w.px, w.py, magnet, reach + b.r, dt, b.r * 0.3);
          b.bx = clamp(b.bx + m.x - b.x, b.r + 40, W - b.r - 40); b.by = clamp(b.by + m.y - b.y, 150, 560);
          b.x = b.bx; b.y = b.by + Math.sin(b.age * 2.1 + b.phase) * b.bob;
        }
        b.hot = w.known && BB.clickHit(w.px, w.py, b, margin);
        if (b.y < -b.r * 2.6) escape(w, b);
      }
      var clicks = input.clicks || [];
      for (var c = 0; c < clicks.length; c++) {
        var hit = null, near = Infinity;
        for (i = 0; i < w.targets.length; i++) {
          b = w.targets[i];
          if (b.dead || !BB.clickHit(clicks[c].x, clicks[c].y, b, margin)) continue;
          var d = (clicks[c].x - b.x) * (clicks[c].x - b.x) + (clicks[c].y - b.y) * (clicks[c].y - b.y);
          if (d < near) { near = d; hit = b; }
        }
        if (hit) pop(w, hit, 'click');
        else { w.missClicks++; w.ev.push({ t: 'missClick', x: clicks[c].x, y: clicks[c].y }); }
      }
    }
  };
  function launch(w) {
    var f = w.frog;
    f.air = true; f.vy = -BB.FROG.v; f.buffer = 0; f.jumps++;
    w.ev.push({ t: 'jump' });
  }
  MODE.jump = {
    spawn: function (w) {
      var side = w.made % 2 ? -1 : 1, spread = knob(w, 'spread'), tier = w.tier;
      var pair = !w.party && w.plan.l === 2 && w.made % 3 === 2 && live(w) + 2 <= knob(w, 'live') + 1;
      var n = pair ? 2 : 1;
      for (var i = 0; i < n; i++) {
        var y = (tier <= 2 ? 320 : 300) + w.rand() * (tier <= 2 ? 80 : 120);
        var f = make(w, 'fly', w.frog.x + side * (spread + i * 96), y, w.party && w.rand() < 0.3 ? 22 : 26);
        f.dir = -side; f.baseY = y; f.waited = 0; f.wait = knob(w, 'wait');
        f.zig = knob(w, 'zig') * (!w.party && w.plan.l >= 1 ? 1.5 : 1);
      }
    },
    update: function (w, dt, input) {
      var frog = w.frog, F = BB.FROG, speed = knob(w, 'speed'), win = knob(w, 'window'), slow = knob(w, 'slow'), i;
      if (input.jump) { if (!frog.air) launch(w); else frog.buffer = knob(w, 'buffer'); }
      if (frog.air) {
        frog.vy += F.g * dt; frog.y += frog.vy * dt;
        if (frog.y >= F.ground) {
          frog.y = F.ground; frog.air = false; frog.vy = 0;
          w.ev.push({ t: 'land' });
          if (frog.buffer > 0) launch(w);
        }
      }
      frog.buffer = Math.max(0, frog.buffer - dt);
      frog.tongue = Math.max(0, frog.tongue - dt);
      for (i = 0; i < w.targets.length; i++) {
        var f = w.targets[i];
        if (f.dead) continue;
        f.age += dt;
        var dx = f.x - frog.x, ad = Math.abs(dx), k = slow + (1 - slow) * clamp((ad - 10) / (win * 1.5), 0, 1);
        if (slow === 0 && ad <= 10 && f.waited < f.wait) { f.waited += dt; f.x += (frog.x - f.x) * Math.min(1, dt * 4); }
        else f.x += f.dir * speed * Math.max(k, slow > 0 ? slow : 0.16) * dt;
        f.y = f.baseY + Math.sin(f.age * 3.2 + f.phase) * f.zig;
        if (frog.air && ad <= win && f.y >= frog.y - F.h - F.tongue && f.y <= frog.y) {
          frog.tongue = 0.22; frog.tx = f.x; frog.ty = f.y;
          pop(w, f, 'jump');
        } else if (f.x < -70 || f.x > W + 70) escape(w, f);
      }
    }
  };
  MODE.catch = {
    spawn: function (w) {
      var tier = w.tier, x = pickX(w, w.basket.x, knob(w, 'spread'), w.party ? 0 : tier <= 2 ? 130 : 60, 150);
      var f = make(w, 'fruit', x, 60, 34);
      f.type = Math.floor(w.rand() * 5); f.fallK = 0.9 + 0.2 * w.rand();
      f.sway = knob(w, 'sway') * (!w.party && w.plan.l >= 1 ? 1.5 : 1) + (!w.party && w.plan.l >= 1 ? 6 : 0);
    },
    update: function (w, dt, input) {
      var bk = w.basket, B = BB.BASKET, top = knob(w, 'basket'), fall = knob(w, 'fall'), magnet = knob(w, 'magnet'), reach = knob(w, 'reach');
      var want = (input.dir || 0) * top;
      bk.vx += clamp(want - bk.vx, -6000 * dt, 6000 * dt);
      bk.x += bk.vx * dt;
      if (bk.x < bk.hw + 16 || bk.x > W - bk.hw - 16) { bk.x = clamp(bk.x, bk.hw + 16, W - bk.hw - 16); bk.vx = 0; }
      bk.squash = Math.max(0, bk.squash - dt * 4);
      for (var i = 0; i < w.targets.length; i++) {
        var f = w.targets[i];
        if (f.dead) continue;
        f.age += dt;
        f.y += fall * f.fallK * dt;
        f.x = clamp(f.x + Math.cos(f.age * 1.7 + f.phase) * f.sway * 1.7 * dt, 60, W - 60);
        if (f.y > 330 && f.y < B.y) BB.magnet(f, bk.x, f.y, magnet, reach + bk.hw, dt, 0);
        if (f.y >= B.y - 8 && f.y <= B.y + 30 && Math.abs(f.x - bk.x) <= bk.hw + f.r * 0.5) { bk.squash = 1; pop(w, f, 'catch'); }
        else if (f.y > B.ground) escape(w, f);
      }
    }
  };
  BB.MODE = MODE;

  // One fixed step. input: { px, py (pointer in logical pixels, or null), clicks: [{x, y}],
  // jump: a jump press this step, dir: -1, 0 or 1 for the basket }.
  var NONE = { px: null, py: null, clicks: [], jump: false, dir: 0 };
  BB.step = function (w, dt, input) {
    if (w.over) return w;
    input = input || NONE;
    w.t += dt; w.segT += dt;
    if (input.px != null && input.py != null) {
      var nx = clamp(input.px, 0, W), ny = clamp(input.py, 0, H);
      // The magnet only helps a pointer that is moving: nothing pops by itself.
      w.activity = w.known && Math.abs(nx - w.px) + Math.abs(ny - w.py) > 0.5 ? 1 : Math.max(0, w.activity - dt / 1.5);
      w.px = nx; w.py = ny; w.known = true;
    } else w.activity = Math.max(0, w.activity - dt / 1.5);
    if (w.known) BB.follow(w.bop, w.px, w.py, dt);
    if (w.party) {
      var wave = 1 + Math.floor(Math.min(w.t, w.plan.duration - 0.001) / BB.WAVE_SECONDS);
      if (wave !== w.wave) { w.wave = wave; w.ev.push({ t: 'wave', n: wave }); }
      var segs = w.plan.segments.length;
      if (segs > 1) {
        var s = Math.floor(w.t / BB.WAVE_SECONDS) % segs;
        if (s !== w.seg && w.t < w.plan.duration) { vanish(w); enter(w, s); w.ev.push({ t: 'segment', mode: w.mode }); }
      }
    }
    MODE[w.mode].update(w, dt, input);
    // Spawning: never more on screen than the tier allows, never more than the level needs.
    var n = live(w), intro = w.seg > 0 || (w.party && w.t > 1) ? 1.1 : 0.6;
    if (n === 0) w.spawnT = Math.min(w.spawnT, 0.3);
    w.spawnT -= dt;
    if (w.segT >= intro && w.spawnT <= 0 && n < knob(w, 'live') && (w.party || w.segHits + n < w.goal)) {
      MODE[w.mode].spawn(w);
      w.spawnT = knob(w, 'gap');
    }
    for (var i = w.targets.length - 1; i >= 0; i--) if (w.targets[i].dead) w.targets.splice(i, 1);
    if (!w.party && w.segHits >= w.goal) {
      if (w.seg + 1 < w.plan.segments.length) { vanish(w); enter(w, w.seg + 1); w.ev.push({ t: 'segment', mode: w.mode }); }
      else { w.over = true; w.ev.push({ t: 'done' }); }
    }
    if (w.party && w.t >= w.plan.duration) { w.over = true; w.ev.push({ t: 'timeup' }); }
    return w;
  };
  // Remaining goal and party seconds, for the HUD.
  BB.left = function (w) { return w.party ? Math.max(0, w.plan.duration - w.t) : Math.max(0, w.goal - w.segHits); };

  /* ------------------------------------------------------ stars, DDA */
  BB.result = function (w) {
    return { hits: w.hits, escapes: w.escapes, missClicks: w.missClicks, time: w.t, score: w.score, bestCombo: w.bestCombo,
      par: w.plan.par, expect: w.plan.expect, party: w.party };
  };
  // Finishing a level always earns a star; one more for letting few targets get away,
  // one more for keeping pace. Missed clicks never cost a star: mashing is fine.
  BB.stars = function (r) {
    var acc = r.hits / Math.max(1, r.hits + r.escapes);
    return 1 + (acc >= 0.75 ? 1 : 0) + (r.time <= r.par ? 1 : 0);
  };
  // 0..1 for Kit.dda: accuracy (missed clicks count a little) and pace, or for a party
  // the share of the expected pops.
  BB.outcome = function (r) {
    var acc = r.hits / Math.max(1, r.hits + r.escapes + 0.2 * Math.min(r.missClicks, r.hits * 2 + 2));
    var x = r.party ? 0.6 * acc + 0.4 * Math.min(1, r.hits / Math.max(1, r.expect)) : 0.55 * acc + 0.45 * Math.min(1, r.par / Math.max(1, r.time));
    return Math.round(clamp(x, 0, 1) * 1000) / 1000;
  };

  /* ---------------------------------------------------------- rewards */
  // Bop's closet: colours and hats, unlocked by the total of stars.
  BB.COLORS = [
    { c: '#ffd23f', need: 0 }, { c: '#ff7eb6', need: 2 }, { c: '#4fd1ff', need: 4 }, { c: '#5be38f', need: 7 },
    { c: '#ff9f43', need: 10 }, { c: '#b48cff', need: 14 }, { c: '#ff5d6c', need: 19 }, { c: 'rainbow', need: 26 }
  ];
  BB.HATS = [
    { id: 'none', need: 0 }, { id: 'bow', need: 1 }, { id: 'cap', need: 3 }, { id: 'flower', need: 5 }, { id: 'party', need: 8 },
    { id: 'crown', need: 12 }, { id: 'phones', need: 17 }, { id: 'wizard', need: 23 }, { id: 'astro', need: 30 }, { id: 'halo', need: 40 }
  ];
  BB.MAX_STARS = 5 * 3 * 3;
  // Items opened by going from `before` to `after` stars: [{ type: 'color'|'hat', i }].
  BB.unlocks = function (before, after) {
    var out = [];
    BB.COLORS.forEach(function (c, i) { if (c.need > before && c.need <= after) out.push({ type: 'color', i: i }); });
    BB.HATS.forEach(function (h, i) { if (h.need > before && h.need <= after) out.push({ type: 'hat', i: i }); });
    return out;
  };

  /* ------------------------------------------------------------ saves */
  // { v: 1, stars: [world][level] 0..3, best: [world] party score, grip: the picture
  //   cards were seen, color, hat, seenStars: the star total when the closet was last opened }
  BB.freshSave = function () {
    return { v: 1, stars: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], best: [0, 0, 0, 0, 0], grip: false, color: 0, hat: 0, seenStars: 0 };
  };
  function int(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  // Every field is checked: a damaged or hand-edited save always loads as a playable one.
  BB.loadSave = function (raw) {
    var s = BB.freshSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
    for (var w = 0; w < 5; w++) {
      var row = Array.isArray(raw.stars) && Array.isArray(raw.stars[w]) ? raw.stars[w] : [];
      for (var l = 0; l < 3; l++) s.stars[w][l] = int(row[l], 0, 3) ? row[l] : 0;
      var best = Array.isArray(raw.best) ? raw.best[w] : 0;
      s.best[w] = int(best, 0, 9999999) ? best : 0;
    }
    s.grip = raw.grip === true;
    var total = BB.total(s);
    s.color = int(raw.color, 0, BB.COLORS.length - 1) && BB.COLORS[raw.color].need <= total ? raw.color : 0;
    s.hat = int(raw.hat, 0, BB.HATS.length - 1) && BB.HATS[raw.hat].need <= total ? raw.hat : 0;
    s.seenStars = int(raw.seenStars, 0, total) ? raw.seenStars : 0;
    return s;
  };
  BB.total = function (s) { var n = 0; s.stars.forEach(function (row) { row.forEach(function (v) { n += v; }); }); return n; };
  BB.worldOpen = function (s, w) { return w === 0 || s.stars[w - 1][2] > 0 || s.stars[w].some(Boolean); };
  // A level opens when the one before it has a star; the party when level 3 has one.
  BB.isOpen = function (s, w, l) {
    if (!BB.worldOpen(s, w)) return false;
    if (l === 'P') return s.stars[w][2] > 0;
    return l === 0 || s.stars[w][l - 1] > 0 || s.stars[w][l] > 0;
  };
  // The first open level without a star, else the last party.
  BB.nextLevel = function (s) {
    for (var w = 0; w < 5; w++) for (var l = 0; l < 3; l++) if (BB.isOpen(s, w, l) && !s.stars[w][l]) return { w: w, l: l };
    return { w: 4, l: 'P' };
  };
  // The highest open world (0-based).
  BB.topWorld = function (s) { var t = 0; for (var w = 0; w < 5; w++) if (BB.worldOpen(s, w)) t = w; return t; };
})();
