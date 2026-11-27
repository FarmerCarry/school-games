/* Bonk Garden (حديقة البونك): the pure engine. No DOM, no Kit, no timers, no Math.random.
 *
 * A garden of holes (3 by 3, later 4 by 3). Goofy critters pop up, wiggle and go back
 * down. A swing at a hole bonks whatever is up there: +points, the combo grows, and ten
 * bonks in a row start a FRENZY (every hole pops, points x2, the giant hammer bonks the
 * neighbours too). The bunny is a friend: bonking it costs 3 and resets the combo.
 * Levels are timed rounds with three score goals (stars); the endless garden has three
 * hearts and every critter that gets away costs one.
 *
 * The UI layer (game.js) owns the save, reads Kit.dda and passes the difficulty in
 * (0 easy .. 1 hard). Units: logical pixels of the 1280x720 field; times in seconds.
 */
(function (root) {
  'use strict';
  var BG = {}, M = Math;
  BG.W = 1280; BG.H = 720;
  BG.COMBO = 10;     // bonks in a row that start a frenzy
  BG.FRENZY = 6;     // seconds of frenzy
  BG.RISE = 0.14;    // a critter popping up
  BG.SINK = 0.2;     // going back down (still bonkable for the first part)
  BG.DUCK = 0.12;    // the sock ducking before it pops up somewhere else
  BG.HIT = 0.62;     // squashed flat with stars, then gone
  BG.OVER = 1.4;     // the outro after the round ends
  BG.HEARTS = 3;
  BG.LEVELS_N = 12;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return typeof v === 'number' && v === v && v > -1e9 && v < 1e9 ? v : d; }
  BG.clamp = clamp;

  /* -------------------------------------------------------------- critters */
  // pts: points for a bonk (the helmet one: +1 for the helmet, then pts); hp: bonks to
  // knock out; stay: how long it stays up, times the level's stay.
  BG.KINDS = {
    potato: { pts: 1, hp: 1, stay: 1 },
    crab: { pts: 1, hp: 1, stay: 1 },
    alien: { pts: 1, hp: 1, stay: 1 },
    carrot: { pts: 1, hp: 1, stay: 0.7 },
    helmet: { pts: 2, hp: 2, stay: 1.3 },
    disco: { pts: 5, hp: 1, stay: 0.55 },
    sock: { pts: 2, hp: 1, stay: 0.62, hops: 2 },
    pie: { pts: 2, hp: 1, stay: 1.15 },
    bunny: { pts: -3, hp: 1, stay: 1.15, friend: true }
  };
  BG.WORLDS = [
    { id: 'garden', name: 'حقل الخضار', base: 'potato', cols: 3 },
    { id: 'beach', name: 'الشاطئ', base: 'crab', cols: 4 },
    { id: 'moon', name: 'قاعدة القمر', base: 'alien', cols: 4 }
  ];
  // The twelve levels. kinds: [kind, weight] ('base' is the world's own critter);
  // stay: seconds up for a weight-1 critter; gap: seconds between pops; up: most at once;
  // goals: the scores for 1, 2 and 3 stars; intro: the critter this level brings in.
  var L = [
    { w: 0, dur: 30, kinds: [['base', 3], ['carrot', 1]], stay: 2.6, gap: 1.05, up: 2, goals: [5, 14, 24] },
    { w: 0, dur: 40, kinds: [['base', 3], ['carrot', 1.5], ['helmet', 1.3]], stay: 2.25, gap: 0.95, up: 2, goals: [8, 26, 46], intro: 'helmet' },
    { w: 0, dur: 40, kinds: [['base', 3], ['carrot', 1.5], ['helmet', 1], ['disco', 0.45]], stay: 1.95, gap: 0.9, up: 3, goals: [10, 30, 56], intro: 'disco' },
    { w: 0, dur: 40, kinds: [['base', 3], ['carrot', 1.5], ['helmet', 1], ['disco', 0.4], ['bunny', 1]], stay: 1.85, gap: 0.86, up: 3, goals: [10, 30, 56], intro: 'bunny' },
    { w: 1, dur: 40, kinds: [['base', 3], ['carrot', 1.5], ['helmet', 1], ['bunny', 0.7]], stay: 1.8, gap: 0.82, up: 3, goals: [10, 30, 60], intro: 'crab' },
    { w: 1, dur: 40, kinds: [['base', 3], ['carrot', 1.2], ['helmet', 0.8], ['sock', 1.4], ['bunny', 0.7]], stay: 1.72, gap: 0.8, up: 3, goals: [11, 32, 64], intro: 'sock' },
    { w: 1, dur: 45, kinds: [['base', 3], ['carrot', 1.2], ['helmet', 1], ['sock', 1], ['disco', 0.45], ['bunny', 0.9]], stay: 1.62, gap: 0.76, up: 4, goals: [12, 34, 72] },
    { w: 1, dur: 45, kinds: [['base', 3], ['carrot', 1], ['helmet', 0.9], ['sock', 0.9], ['pie', 1.4], ['bunny', 0.9]], stay: 1.55, gap: 0.74, up: 4, goals: [12, 34, 74], intro: 'pie' },
    { w: 2, dur: 45, kinds: [['base', 3], ['carrot', 1.2], ['helmet', 1], ['sock', 1], ['bunny', 0.9]], stay: 1.5, gap: 0.72, up: 4, goals: [12, 36, 78], intro: 'alien' },
    { w: 2, dur: 45, kinds: [['base', 3], ['carrot', 1.2], ['helmet', 1], ['sock', 1], ['pie', 1], ['disco', 0.45], ['bunny', 1]], stay: 1.42, gap: 0.68, up: 4, goals: [13, 38, 82] },
    { w: 2, dur: 45, kinds: [['base', 3], ['carrot', 1.4], ['helmet', 1.1], ['sock', 1.1], ['pie', 1.1], ['disco', 0.5], ['bunny', 1.1]], stay: 1.34, gap: 0.64, up: 5, goals: [14, 40, 88] },
    { w: 2, dur: 45, kinds: [['base', 3], ['carrot', 1.5], ['helmet', 1.2], ['sock', 1.2], ['pie', 1.2], ['disco', 0.55], ['bunny', 1.2]], stay: 1.26, gap: 0.6, up: 5, goals: [15, 42, 95] }
  ];
  BG.ENDLESS_GOALS = [15, 50, 120];
  // The silly hammers, unlocked by the stars of all levels together.
  BG.HAMMERS = [
    { id: 'squeak', name: 'مطرقة الصفّارة', stars: 0 },
    { id: 'chicken', name: 'الدجاجة المطاطية', stars: 3 },
    { id: 'bread', name: 'الخبز الطويل', stars: 7 },
    { id: 'spoon', name: 'الملعقة العملاقة', stars: 11 },
    { id: 'pillow', name: 'الوسادة', stars: 15 },
    { id: 'fish', name: 'السمكة', stars: 20 },
    { id: 'balloon', name: 'المطرقة المنفوخة', stars: 25 },
    { id: 'gold', name: 'المطرقة الذهبية', stars: 31 }
  ];
  BG.ENDLESS_AT = 4; // winning level 4 opens the endless garden

  // A level's numbers with the difficulty d (0 easy .. 1 hard) applied. n: 1..12.
  BG.level = function (n, d) {
    n = clamp(M.floor(num(n, 1)), 1, BG.LEVELS_N);
    d = clamp(num(d, 0.35), 0, 1);
    var b = L[n - 1], world = BG.WORLDS[b.w];
    var stayF = 1.22 - 0.44 * d, gapF = 1.08 - 0.16 * d;
    var kinds = b.kinds.map(function (k) {
      return [k[0] === 'base' ? world.base : k[0], k[0] === 'bunny' ? k[1] * (0.7 + 0.6 * d) : k[1]];
    });
    var spec = {
      n: n, endless: false, world: b.w, cols: world.cols, dur: b.dur, kinds: kinds,
      stay: b.stay * stayF, gap: b.gap * gapF, up: b.up + (d > 0.66 && n > 1 ? 1 : 0),
      goals: b.goals.slice(), intro: b.intro || '', whiffBreaks: n >= 3, d: d
    };
    if (n === 1) { spec.stay = M.max(2.3, spec.stay); spec.up = M.min(2, spec.up); }
    return spec;
  };
  // The endless garden at a stage (one stage every 12 s): faster and busier as it goes.
  BG.ENDLESS_STAGE = 12;
  BG.endless = function (stage, d) {
    stage = M.max(0, M.floor(num(stage, 0)));
    d = clamp(num(d, 0.35), 0, 1);
    var world = M.floor(stage / 4) % 3, base = BG.WORLDS[world].base;
    var kinds = [[base, 3], ['carrot', 1]];
    if (stage >= 1) kinds.push(['helmet', 1]);
    if (stage >= 2) kinds.push(['bunny', 0.8 * (0.7 + 0.6 * d)]);
    if (stage >= 3) kinds.push(['disco', 0.4], ['sock', 1]);
    if (stage >= 4) kinds.push(['pie', 0.9]);
    return {
      n: 0, endless: true, world: world, cols: 4, dur: 0, kinds: kinds, stage: stage,
      stay: M.max(0.8, 2.7 * M.pow(0.9, stage)) * (1.22 - 0.44 * d),
      gap: M.max(0.42, 1.3 * M.pow(0.92, stage)) * (1.08 - 0.16 * d),
      up: M.min(6, 1 + M.ceil(stage / 2)), goals: BG.ENDLESS_GOALS.slice(), intro: '', whiffBreaks: true, d: d
    };
  };
  BG.stars = function (goals, score) { var s = 0; for (var i = 0; i < 3; i++) if (score >= goals[i]) s++; return s; };

  /* ---------------------------------------------------------------- the field */
  // The holes, back row first. y: the hole's centre; rx, ry: its opening; h: how tall a
  // critter stands above it. Keys: the keyboard keys laid out like the holes.
  var KEYROWS = [['Q', 'W', 'E', 'R'], ['A', 'S', 'D', 'F'], ['Z', 'X', 'C', 'V']];
  BG.layout = function (cols) {
    var four = cols === 4, xs = four ? [298, 528, 752, 982] : [420, 640, 860], ys = [338, 474, 614];
    var rxs = four ? [75, 81, 87] : [86, 94, 102], out = [];
    for (var r = 0; r < 3; r++) for (var c = 0; c < xs.length; c++) {
      var rx = rxs[r];
      out.push({ x: xs[c], y: ys[r], rx: rx, ry: M.round(rx * 0.36), h: M.round(rx * 1.45), row: r, col: c, key: KEYROWS[r][c], code: 'Key' + KEYROWS[r][c] });
    }
    return out;
  };

  /* -------------------------------------------------------------------- rng */
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
  BG.rng = rng;

  /* ------------------------------------------------------------------ world */
  // opts: { level: 1..12 or 0 for the endless garden, d: 0..1, seed }
  BG.create = function (opts) {
    opts = opts || {};
    var lvl = M.floor(num(opts.level, 1)), d = clamp(num(opts.d, 0.35), 0, 1);
    var spec = lvl === 0 ? BG.endless(0, d) : BG.level(lvl, d);
    var holes = BG.layout(spec.cols);
    holes.forEach(function (h) { h.c = null; h.cool = 0; });
    return {
      spec: spec, d: d, holes: holes, rnd: rng(num(opts.seed, 1)), ev: [],
      phase: 'play', t: 0, pt: 0, score: 0, swings: 0, bonks: 0, whiffs: 0, hits: 0, ouches: 0,
      combo: 0, bestCombo: 0, frenzy: 0, frenzies: 0, hearts: lvl === 0 ? BG.HEARTS : 0,
      escapes: 0, pies: 0, popped: 0, nextId: 1, spawnT: spec.gap - (lvl === 1 ? 0.35 : 0.55),
      kindsSeen: {}, stars: 0, up: 0
    };
  };
  function emit(w, e) { if (w.ev.length < 200) w.ev.push(e); }
  // A critter can be bonked while it rises, while it is up and early in going down.
  function bonkable(c) { return !!c && (c.st === 'rise' || c.st === 'up' || (c.st === 'down' && c.t < BG.SINK * 0.6)); }
  BG.bonkable = bonkable;
  function countUp(w) {
    var n = 0;
    for (var i = 0; i < w.holes.length; i++) { var c = w.holes[i].c; if (c && c.st !== 'hit' && c.st !== 'gone') n++; }
    return n;
  }
  function has(w, kind) {
    for (var i = 0; i < w.holes.length; i++) { var c = w.holes[i].c; if (c && c.kind === kind && c.st !== 'hit') return true; }
    return false;
  }
  function emptyHoles(w, except) {
    var out = [];
    for (var i = 0; i < w.holes.length; i++) if (i !== except && !w.holes[i].c && w.holes[i].cool <= 0) out.push(i);
    return out;
  }
  function pickKind(w) {
    var ks = w.spec.kinds, total = 0, i, list = [];
    for (i = 0; i < ks.length; i++) {
      var k = ks[i][0], wt = ks[i][1];
      // Never a friend first, one bunny, one golden broccoli and one pie at a time.
      if ((k === 'bunny' || k === 'disco' || k === 'pie') && has(w, k)) continue;
      if (k === 'bunny' && w.popped < 2) continue;
      list.push([k, wt]); total += wt;
    }
    var r = w.rnd() * total;
    for (i = 0; i < list.length; i++) { r -= list[i][1]; if (r <= 0) return list[i][0]; }
    return list[list.length - 1][0];
  }
  function place(w, i, kind, opts) {
    opts = opts || {};
    var k = BG.KINDS[kind], h = w.holes[i];
    var c = {
      id: opts.id || w.nextId++, kind: kind, st: 'rise', t: 0,
      stay: opts.stay || w.spec.stay * k.stay * (0.9 + w.rnd() * 0.2),
      hp: k.hp, helmet: kind === 'helmet', hops: opts.hops != null ? opts.hops : (k.hops || 0), free: !!opts.free,
      wind: 0, mood: M.floor(w.rnd() * 4), born: w.t
    };
    h.c = c;
    if (!opts.hop) { w.popped++; if (!w.kindsSeen[kind]) w.kindsSeen[kind] = 1; }
    emit(w, { type: opts.hop ? 'hop' : 'pop', hole: i, kind: kind, id: c.id, free: c.free, first: w.kindsSeen[kind] === 1 && !opts.hop });
    if (w.kindsSeen[kind] === 1) w.kindsSeen[kind] = 2;
    return c;
  }
  function spawn(w) {
    var free = emptyHoles(w, -1);
    if (!free.length) return false;
    var i = free[M.floor(w.rnd() * free.length)];
    place(w, i, pickKind(w));
    return true;
  }
  function frenzyKind(w) {
    var r = w.rnd(), base = BG.WORLDS[w.spec.world].base;
    return r < 0.06 && !has(w, 'disco') ? 'disco' : r < 0.32 ? 'carrot' : base;
  }
  function startOver(w, why) {
    if (w.frenzy > 0) w.combo = 0;
    w.phase = 'over'; w.pt = 0; w.frenzy = 0;
    for (var i = 0; i < w.holes.length; i++) {
      var c = w.holes[i].c;
      if (c && (c.st === 'rise' || c.st === 'up')) { c.st = 'down'; c.t = 0; c.quiet = true; }
    }
    w.stars = BG.stars(w.spec.goals, w.score);
    emit(w, { type: why, score: w.score, stars: w.stars });
  }
  // The hearts of the endless garden. Frenzy critters and friends never cost one.
  function escaped(w, i, c) {
    if (c.quiet || BG.KINDS[c.kind].friend) { if (!c.quiet) emit(w, { type: 'bye', hole: i, kind: c.kind }); return; }
    w.escapes++;
    var heart = w.spec.endless && !c.free && w.frenzy <= 0 && w.phase === 'play';
    if (heart) w.hearts = M.max(0, w.hearts - 1);
    emit(w, { type: 'escape', hole: i, kind: c.kind, heart: heart, hearts: w.hearts });
    if (heart && w.hearts <= 0) startOver(w, 'out');
  }

  BG.step = function (w, dt) {
    if (w.phase === 'done') return w;
    var s = w.spec, i, h, c;
    if (w.phase === 'play') {
      w.t += dt;
      if (s.endless) {
        var stage = M.floor(w.t / BG.ENDLESS_STAGE);
        if (stage !== s.stage) {
          var was = s.world;
          w.spec = s = BG.endless(stage, w.d);
          emit(w, { type: 'stage', stage: stage, world: s.world, newWorld: s.world !== was });
        }
      }
    } else w.pt += dt;
    if (w.frenzy > 0) {
      w.frenzy = M.max(0, w.frenzy - dt);
      if (w.frenzy === 0) { w.combo = 0; emit(w, { type: 'calm' }); }
    }
    for (i = 0; i < w.holes.length; i++) {
      h = w.holes[i]; c = h.c;
      if (h.cool > 0) h.cool = M.max(0, h.cool - dt);
      if (!c) continue;
      c.t += dt;
      if (c.st === 'rise' && c.t >= BG.RISE) { c.st = 'up'; c.t = 0; }
      else if (c.st === 'up') {
        if (c.kind === 'pie') c.wind = clamp((c.t - (c.stay - 0.6)) / 0.6, 0, 1);
        if (c.t >= c.stay) {
          c.t = 0;
          if (c.kind === 'sock' && c.hops > 0) c.st = 'duck';
          else {
            c.st = 'down';
            if (c.kind === 'pie' && !c.quiet) { w.pies++; emit(w, { type: 'pie', hole: i, id: c.id }); }
          }
        }
      } else if (c.st === 'duck' && c.t >= BG.DUCK) {
        // The sneaky sock pops up somewhere else.
        h.c = null; h.cool = 0.3;
        var to = emptyHoles(w, i);
        if (w.phase === 'play' && to.length) place(w, to[M.floor(w.rnd() * to.length)], 'sock', { id: c.id, hops: c.hops - 1, stay: c.stay * 0.9, free: c.free, hop: true });
        else escaped(w, i, c);
      } else if (c.st === 'down' && c.t >= BG.SINK) {
        h.c = null; h.cool = 0.35;
        escaped(w, i, c);
      } else if (c.st === 'hit' && c.t >= BG.HIT) {
        h.c = null; h.cool = w.frenzy > 0 ? 0.22 : 0.3;
      }
    }
    if (w.phase === 'play') {
      if (w.frenzy > 0) {
        // FRENZY: every hole pops.
        for (i = 0; i < w.holes.length; i++) {
          h = w.holes[i];
          if (!h.c && h.cool <= 0) place(w, i, frenzyKind(w), { free: true, stay: 1.5, hops: 0 });
        }
      } else {
        w.up = countUp(w);
        var gap = s.gap * (w.up === 0 ? 0.45 : 1);
        w.spawnT = M.min(w.spawnT + dt, s.gap);
        if (w.spawnT >= gap && w.up < s.up && spawn(w)) w.spawnT = 0;
      }
      if (!s.endless && w.t >= s.dur) { w.t = s.dur; startOver(w, 'time'); }
    } else if (w.phase === 'over' && w.pt >= BG.OVER) {
      w.phase = 'done';
      emit(w, { type: 'end', score: w.score, stars: w.stars, endless: s.endless, level: s.n });
    }
    w.up = countUp(w);
    return w;
  };

  // The hole a click at (x, y) means: one with a critter near the click if any (a click
  // near a critter counts), otherwise the hole under it, otherwise -1 (the grass).
  BG.holeAt = function (w, x, y) {
    var best = -1, bestD = 1e12, any = -1, anyD = 1e12;
    for (var i = 0; i < w.holes.length; i++) {
      var h = w.holes[i], dx = x - h.x, dy = y - h.y;
      if (M.abs(dx) > h.rx * 1.22 || dy < -h.h * 1.3 || dy > h.ry * 2.4) continue;
      var cy = y - (h.y - h.h * 0.5), cd = dx * dx + cy * cy;
      if (bonkable(h.c) && cd < bestD) { bestD = cd; best = i; }
      var hd = dx * dx + dy * dy * 2;
      if (hd < anyD) { anyD = hd; any = i; }
    }
    return best >= 0 ? best : any;
  };
  // Neighbours above, below, left and right (the giant frenzy hammer bonks them too).
  BG.neighbours = function (w, i) {
    var h = w.holes[i], out = [];
    for (var j = 0; j < w.holes.length; j++) {
      var o = w.holes[j];
      if (M.abs(o.row - h.row) + M.abs(o.col - h.col) === 1) out.push(j);
    }
    return out;
  };
  function knock(w, i, extra) {
    var c = w.holes[i].c, k = BG.KINDS[c.kind], mult = w.frenzy > 0 ? 2 : 1;
    if (k.friend) {
      // The bunny: آخ!
      if (extra) return false;
      var lost = M.min(w.score, 3);
      w.score -= lost; w.ouches++;
      w.combo = 0;
      c.st = 'hit'; c.t = 0;
      emit(w, { type: 'ouch', hole: i, lost: lost, id: c.id });
      return false;
    }
    var pts;
    w.combo++; w.bestCombo = M.max(w.bestCombo, w.combo); w.bonks++;
    if (c.helmet) {
      c.helmet = false; c.hp--;
      c.st = 'up'; c.t = M.min(c.t, M.max(0, c.stay - 0.95)); // a moment to bonk it again
      pts = 1 * mult;
      w.score += pts;
      emit(w, { type: 'clank', hole: i, pts: pts, combo: w.combo, extra: !!extra, id: c.id, frenzy: w.frenzy > 0 });
    } else {
      pts = k.pts * mult;
      w.score += pts;
      c.st = 'hit'; c.t = 0;
      emit(w, { type: 'bonk', hole: i, kind: c.kind, pts: pts, combo: w.combo, extra: !!extra, id: c.id, frenzy: w.frenzy > 0 });
    }
    if (w.combo >= BG.COMBO && w.frenzy <= 0) {
      w.frenzy = BG.FRENZY; w.frenzies++;
      emit(w, { type: 'frenzy', hole: i });
    }
    return true;
  }
  // A swing at hole i (-1: the grass). Every swing counts, hit or miss.
  BG.swing = function (w, i) {
    if (w.phase !== 'play') return false;
    w.swings++;
    var h = i >= 0 ? w.holes[i] : null;
    if (h && bonkable(h.c)) {
      var giant = w.frenzy > 0, ok = knock(w, i, false);
      if (ok) w.hits++;
      if (giant) {
        var nb = BG.neighbours(w, i);
        for (var n = 0; n < nb.length; n++) { var o = w.holes[nb[n]]; if (bonkable(o.c) && !BG.KINDS[o.c.kind].friend) knock(w, nb[n], true); }
      }
      return ok;
    }
    w.whiffs++;
    var broke = w.spec.whiffBreaks && w.frenzy <= 0 && w.combo > 0;
    if (broke) w.combo = 0;
    emit(w, { type: 'whiff', hole: i, broke: broke });
    return false;
  };

  /* ----------------------------------------------------------------- saves */
  BG.newSave = function () {
    var z = [];
    for (var i = 0; i < BG.LEVELS_N; i++) z.push(0);
    return { v: 1, stars: z.slice(), best: z.slice(), endless: 0, hammer: 0, coach: false, keys: false, rounds: 0 };
  };
  function int(v, lo, hi, d) { return typeof v === 'number' && v === v && v >= lo && v <= hi ? M.floor(v) : d; }
  // Anything odd in a stored save falls back to the fresh value for that field.
  BG.loadSave = function (raw) {
    var s = BG.newSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
    for (var i = 0; i < BG.LEVELS_N; i++) {
      if (Array.isArray(raw.stars)) s.stars[i] = int(raw.stars[i], 0, 3, 0);
      if (Array.isArray(raw.best)) s.best[i] = int(raw.best[i], 0, 1e6, 0);
      if (s.stars[i] > 0 && s.best[i] < L[i].goals[s.stars[i] - 1]) s.best[i] = L[i].goals[s.stars[i] - 1];
    }
    s.endless = int(raw.endless, 0, 1e6, 0);
    s.hammer = int(raw.hammer, 0, BG.HAMMERS.length - 1, 0);
    if (!BG.hammerOpen(s, s.hammer)) s.hammer = 0;
    s.coach = raw.coach === true;
    s.keys = raw.keys === true;
    s.rounds = int(raw.rounds, 0, 1e9, 0);
    return s;
  };
  BG.totalStars = function (save) { var n = 0; for (var i = 0; i < save.stars.length; i++) n += save.stars[i]; return n; };
  BG.hammerOpen = function (save, i) { return !!BG.HAMMERS[i] && BG.totalStars(save) >= BG.HAMMERS[i].stars; };
  BG.unlocked = function (save, n) { return n === 1 || (n >= 2 && n <= BG.LEVELS_N && (save.stars[n - 2] > 0 || save.stars[n - 1] > 0)); };
  BG.endlessOpen = function (save) { return save.stars[BG.ENDLESS_AT - 1] > 0; };
  // Where Play goes: the first level not won yet, or the endless garden (0) when all are.
  BG.next = function (save) {
    for (var n = 1; n <= BG.LEVELS_N; n++) if (save.stars[n - 1] === 0 && BG.unlocked(save, n)) return n;
    return 0;
  };
  // Records a finished level round. Returns what changed, for the result screen.
  BG.record = function (save, n, score) {
    var i = n - 1, stars = BG.stars(L[i].goals, score), before = BG.totalStars(save), had = save.stars[i];
    var out = { stars: stars, newBest: score > save.best[i] && score > 0, prevBest: save.best[i], gained: M.max(0, stars - had), hammers: [], opened: 0, endless: false };
    var wasEndless = BG.endlessOpen(save), wasNext = n < BG.LEVELS_N && BG.unlocked(save, n + 1);
    save.best[i] = M.max(save.best[i], score);
    save.stars[i] = M.max(had, stars);
    var after = BG.totalStars(save);
    for (var h = 0; h < BG.HAMMERS.length; h++) if (BG.HAMMERS[h].stars > before && BG.HAMMERS[h].stars <= after) out.hammers.push(h);
    if (!wasNext && n < BG.LEVELS_N && BG.unlocked(save, n + 1)) out.opened = n + 1;
    if (!wasEndless && BG.endlessOpen(save)) out.endless = true;
    return out;
  };
  BG.recordEndless = function (save, score) {
    var out = { stars: BG.stars(BG.ENDLESS_GOALS, score), newBest: score > save.endless && score > 0, prevBest: save.endless, gained: 0, hammers: [], opened: 0, endless: false };
    save.endless = M.max(save.endless, score);
    return out;
  };

  root.BG = BG;
})(typeof window !== 'undefined' ? window : this);
