/* Math Gates (بوابات الحساب) engine: the five worlds and thirty levels, the seeded
 * generator of gate rows and questions, the run (three lanes, coins, soft obstacles,
 * gates), the number battle at the finish, the bonus staircase, stars and saves.
 * Pure: no DOM, no Kit, no THREE, no timers and no unseeded randomness, so
 * tools/tests/math-gates-engine.test.mjs loads it with { window: {} } and plays whole
 * levels with scripted players. game.js reads the DDA tier, steps a run with the
 * child's input and turns its events into pictures and sound.
 *
 * A level is a seeded generator. Coins and obstacles are laid out when the run is
 * created; each gate row is made the moment the crowd passes the row before it, for
 * the crowd's real number, so there is always exactly one best gate (the obstacles
 * between the two rows are taken into account: the best gate stays best whichever
 * of them the crowd hits). A ghost run of the same seed that always picks the best
 * gate, dodges every obstacle and answers every question sets the "par" number,
 * and the rival crowd at the finish is a share of it: picking the best gates wins. */
(function () {
  'use strict';
  var MG = window.MG = window.MG || {};
  MG.TIERS = 5;
  MG.WORLDS_N = 5;
  MG.PER_WORLD = 6;
  MG.LEVELS_N = 30;
  MG.LANE_W = 4;            // m between lane centres
  MG.FINISH = 30;           // m from the last row to the number battle
  MG.FLOOR = 1;             // the crowd never drops below one runner
  MG.FINISH_COINS = 5;      // every win pays this before the staircase multiplies, so a
                            // perfect run on the best gates never ends with no coins
  MG.STEPS = 10;            // the bonus staircase: ×1 .. ×10
  MG.MINUS = '−';      // − (a real minus sign, not a hyphen)

  // One entry per DDA tier: tier 1 is for a six-year-old (small numbers, a slow run,
  // decoys that are clearly worse), tier 5 a real challenge for an eleven-year-old.
  // MG.HARDER says which way each knob moves as the tiers get harder; the engine test
  // checks every row.
  MG.TUNE = {
    speed: [5, 5.8, 6.6, 7.4, 8.2],            // run speed, m/s
    gap: [34, 32, 31, 30, 29],                 // m between gate rows
    margin: [0.34, 0.24, 0.15, 0.09, 0.05],    // every decoy is at least this share of the best result below it
    marginMin: [3, 2, 2, 1, 1],                // .. and at least this many runners below it
    size: [0.5, 0.65, 0.8, 0.9, 1],            // share of each world's number pools
    quiz: [1, 1, 2, 2, 3],                     // question rows per level
    rocks: [0, 1, 1, 2, 2],                    // extra obstacles per level (from the second level of a world)
    double: [0, 0, 0, 0.3, 0.5],               // chance an obstacle stretch has two obstacles
    loss: [0.05, 0.07, 0.08, 0.1, 0.12],       // share of the crowd an obstacle knocks off
    lossMin: [1, 1, 2, 2, 3],
    rival: [0.62, 0.66, 0.7, 0.72, 0.75],      // the rival crowd: this share of a perfect run
    quizNear: [3, 2, 2, 1, 1],                 // wrong answers are at least this far from the right one
    extraRows: [0, 0, 1, 1, 2]                 // more rows per level
  };
  MG.HARDER = { speed: 1, gap: -1, margin: -1, marginMin: -1, size: 1, quiz: 1, rocks: 1, double: 1, loss: 1, lossMin: 1, rival: 1, quizNear: -1, extraRows: 1 };
  MG.BIG = 0.8;
  // A slip costs more where gates halve the crowd: the division world's rival is smaller.
  MG.RIVAL_WORLD = [1, 1, 1, 0.85, 0.95];             // the "big crowd" star: at least this share of a perfect run
  var ROWS = [5, 6, 6, 7, 7, 8];

  MG.WORLDS = [
    { id: 'add20', name: 'وادي الحلوى', sub: 'جمع وطرح حتى 20', icon: '+' + MG.MINUS, focus: '+' },
    { id: 'add100', name: 'غابة المصاصات', sub: 'جمع وطرح حتى 100', icon: '100', focus: '+' },
    { id: 'mul', name: 'جزر الجيلي', sub: 'الضرب', icon: '×', focus: '×' },
    { id: 'div', name: 'قلعة الكعك', sub: 'القسمة', icon: '÷', focus: '÷' },
    { id: 'mix', name: 'سماء قوس قزح', sub: 'كل العمليات', icon: '+' + MG.MINUS + '×÷', focus: 'two' }
  ];
  MG.LEVELS = [];
  for (var li = 0; li < MG.LEVELS_N; li++) MG.LEVELS.push({ i: li, world: Math.floor(li / MG.PER_WORLD), n: li % MG.PER_WORLD, tag: (Math.floor(li / MG.PER_WORLD) + 1) + '-' + (li % MG.PER_WORLD + 1) });

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function tierOf(t) { t = Math.round(Number(t)); return t >= 1 && t <= MG.TIERS ? t : 1; }
  MG.clamp = clamp;
  MG.tierOf = tierOf;
  MG.laneX = function (lane) { return (lane - 1) * MG.LANE_W; };
  // Seeded random numbers (mulberry32), so a run replays exactly in tests.
  MG.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  function knob(T, key) { return MG.TUNE[key][T - 1]; }
  MG.knob = function (tier, key) { return knob(tierOf(tier), key); };
  function rint(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }
  function range(a, b) { var out = []; for (var i = a; i <= b; i++) out.push(i); return out; }
  function shuffle(r, list) {
    for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = list[i]; list[i] = list[j]; list[j] = t; }
    return list;
  }

  /* -------------------------------------------------------- gate maths */
  // One operation on a whole number. ÷ rounds down (the generator only makes ÷ gates
  // that divide exactly; MG.exact says whether a gate needs no rounding).
  function op1(op, n, c) {
    if (op === '+') return c + n;
    if (op === MG.MINUS) return c - n;
    if (op === '×') return c * n;
    return Math.floor(c / n);
  }
  MG.apply = function (g, c) {
    var r = op1(g.op, g.n, c);
    return g.op2 ? op1(g.op2, g.n2, r) : r;
  };
  MG.exact = function (g, c) {
    if (g.op === '÷' && c % g.n) return false;
    return !(g.op2 === '÷' && op1(g.op, g.n, c) % g.n2);
  };
  // What a gate does to the crowd: never below one runner.
  MG.pass = function (g, c) { return Math.max(MG.FLOOR, MG.apply(g, c)); };
  MG.label = function (g) { return g.op + g.n; };
  MG.labels = function (g) { return g.op2 ? [g.op + g.n, g.op2 + g.n2] : [g.op + g.n]; };
  MG.gateText = function (g) { return MG.labels(g).join(' '); };
  function family(op) { return op === '+' || op === MG.MINUS ? 'add' : 'mul'; }
  function bigNum(g) { return g.op2 ? Math.max(g.n, g.n2) : g.n; }

  /* ------------------------------------------------------ number pools */
  // What each world's gates and questions may use at a tier and level.
  function pools(world, n, T) {
    var k = knob(T, 'size'), sc = function (max, min) { return Math.max(min, Math.round(max * k)); };
    var P = { add: [], sub: [], mul: [], div: [], two: false, cap: 20, start: 3 };
    if (world === 0) {
      var top = sc(9, 5);
      P.add = range(1, top); P.sub = range(1, top); P.cap = 20; P.start = n < 2 ? 2 : 3;
    } else if (world === 1) {
      var ta = sc(20, 12), ts = sc(30, 12);
      P.add = range(2, ta).concat([20].filter(function (v) { return v > ta; }));
      P.sub = range(2, ts).concat([20, 30].filter(function (v) { return v > ts; }));
      P.cap = 100; P.start = 8 + n * 2;
    } else if (world === 2) {
      P.mul = n < 3 ? (T === 1 ? [2, 3, 5] : [2, 3, 5, 10]) : T <= 2 ? [2, 3, 4, 5, 10] : range(2, 10);
      P.add = range(1, sc(30, 10)); P.sub = range(1, sc(20, 6));
      P.cap = sc(999, 400); P.start = 2;
    } else if (world === 3) {
      P.div = n < 3 ? [2, 5, 10] : T <= 2 ? [2, 3, 4, 5, 10] : range(2, 10);
      P.mul = [2, 3]; P.add = range(2, sc(30, 10)); P.sub = range(2, sc(40, 10));
      P.cap = sc(800, 300); P.start = 12;
    } else {
      P.mul = [2, 3, 4, 5]; P.div = [2, 3, 4, 5, 10]; P.add = range(1, sc(50, 15)); P.sub = range(1, sc(40, 10));
      P.two = n > 0; P.cap = sc(999, 400); P.start = 4;
    }
    return P;
  }
  MG.pools = function (world, n, tier) { return pools(world, n, tierOf(tier)); };

  // Every gate the pools allow that is valid for each crowd number in A: whole
  // results of at least one runner and at most the world's cap.
  function nice(v) { return v < 20 ? Math.round(v) : v < 100 ? Math.round(v / 5) * 5 : Math.round(v / 10) * 10; }
  function candidates(P, A, style) {
    var out = [], seen = {};
    function add(g) {
      var r = [], key = MG.gateText(g);
      if (seen[key]) return;
      seen[key] = 1;
      for (var k = 0; k < A.length; k++) {
        if (!MG.exact(g, A[k])) return;
        if (g.op2 && op1(g.op, g.n, A[k]) < 1) return;
        var v = MG.apply(g, A[k]);
        if (v < 1 || (v > P.cap && v >= A[k])) return;
        r.push(v);
      }
      g.r = r; out.push(g);
    }
    P.add.forEach(function (n) { add({ op: '+', n: n }); });
    P.sub.forEach(function (n) { add({ op: MG.MINUS, n: n }); });
    // A row that takes runners away also offers round shares of a big crowd: −20, −50.
    if (style === 'cut' && A[0] > 30) [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6].forEach(function (f) { var v = nice(A[0] * f); if (v > 0) add({ op: MG.MINUS, n: v }); });
    P.mul.forEach(function (n) { add({ op: '×', n: n }); });
    P.div.forEach(function (n) { add({ op: '÷', n: n }); });
    if (P.two) {
      // Two steps from two different families: "×2 then +5", "+4 then ×3", "÷2 then −3".
      var small = [1, 2, 3, 4, 5, 6, 8, 10].filter(function (v) { return v <= P.add[P.add.length - 1]; });
      var firsts = [['×', 2], ['×', 3], ['÷', 2]].concat(small.map(function (v) { return ['+', v]; }), small.map(function (v) { return [MG.MINUS, v]; }));
      firsts.forEach(function (f) {
        var seconds = family(f[0]) === 'add' ? [['×', 2], ['×', 3]] : small.map(function (v) { return ['+', v]; }).concat(small.map(function (v) { return [MG.MINUS, v]; }));
        seconds.forEach(function (s) { add({ op: f[0], n: f[1], op2: s[0], n2: s[1] }); });
      });
    }
    return out;
  }

  // The crowd numbers a row may be reached with: A[0] is the number when the row is
  // made, then one value more for each obstacle in the stretch before it that the
  // crowd might hit (obstacles take a share of the crowd at that moment).
  MG.loss = function (tier, c) {
    var T = tierOf(tier);
    return Math.min(c - MG.FLOOR, Math.max(knob(T, 'lossMin'), Math.round(c * knob(T, 'loss'))));
  };
  function arrivals(run, c, obstacles) {
    var A = [c];
    for (var i = 0; i < obstacles; i++) {
      var a = A[A.length - 1], b = Math.max(MG.FLOOR, a - MG.loss(run.tier, a));
      if (b !== a) A.push(b);
    }
    return A;
  }

  // How much worse every decoy must be than the best gate: the tier's share of the
  // best gate's change plus a little of the crowd (so +5 against +2 needs less than
  // ×2 against +30), at least the tier's minimum.
  function need(T, a, v) { return Math.max(knob(T, 'marginMin'), Math.ceil(knob(T, 'margin') * (Math.abs(v - a) + 0.3 * a))); }
  MG.need = function (tier, a, v) { return need(tierOf(tier), a, v); };
  // Three gates for crowd numbers A: B (the best for every number in A, by at least
  // the tier's margin) and two decoys. One decoy is tempting: a bigger number, or the
  // other kind of operation (+10 next to ×2). Returns null when the pools cannot.
  function pickGates(run, A, style) {
    var P = run.P, T = run.tier, r = run.rand, all = candidates(P, A, style), focus = MG.WORLDS[run.world].focus;
    function gain(g) { for (var k = 0; k < A.length; k++) if (g.r[k] <= A[k]) return false; return true; }
    function cut(g) { for (var k = 0; k < A.length; k++) if (g.r[k] >= A[k]) return false; return true; }
    function isFocus(g) { return focus === 'two' ? !!g.op2 : g.op === focus || g.op2 === focus; }
    var bests = all.filter(style === 'grow' ? gain : cut);
    if (!bests.length) return null;
    var top = 1;
    bests.forEach(function (g) { top = Math.max(top, Math.abs(g.r[0] - A[0])); });
    bests.forEach(function (g) {
      g.s = r() + (isFocus(g) ? (run.world === 3 && style === 'cut' ? 1.1 : 0.55) : 0) - (g.op === run.lastOp ? 0.45 : 0) + 0.5 * Math.abs(g.r[0] - A[0]) / top * (style === 'grow' ? 1 : -1);
    });
    bests.sort(function (a, b) { return b.s - a.s; });
    for (var bi = 0; bi < bests.length && bi < 14; bi++) {
      var B = bests[bi], lb = MG.gateText(B);
      var m = B.r.map(function (v, k) { return need(T, A[k], v); });
      var ds = all.filter(function (d) {
        if (d === B || MG.gateText(d) === lb) return false;
        if (style === 'cut' && !cut(d)) return false;
        for (var k = 0; k < A.length; k++) if (d.r[k] > B.r[k] - m[k]) return false;
        return true;
      });
      if (ds.length < 2) continue;
      ds.forEach(function (d) {
        d.t = (bigNum(d) > bigNum(B) ? 2 : 0) + (family(d.op) !== family(B.op) || !!d.op2 !== !!B.op2 ? 1 : 0) +
          (1 - Math.min(1, (B.r[0] - d.r[0]) / Math.max(1, B.r[0]))) + (isFocus(d) ? 1.2 : 0) + r() * 0.7;
      });
      ds.sort(function (a, b) { return b.t - a.t; });
      var D1 = ds[0], l1 = MG.gateText(D1), rest = ds.slice(1).filter(function (d) { return d.r[0] !== D1.r[0] && MG.gateText(d) !== l1; });
      if (!rest.length) continue;
      // The second decoy: clearly worse for the youngest (a loss next to two gains),
      // another close call for the oldest.
      var easy = T <= 2 && style === 'grow', pool2 = rest.filter(function (d) { return easy ? cut(d) : gain(d) || style === 'cut'; });
      if (!pool2.length) pool2 = rest;
      var D2 = pool2[Math.floor(r() * Math.min(pool2.length, easy ? pool2.length : 6))];
      return [B, D1, D2];
    }
    return null;
  }
  // When the pools have nothing (a crowd of one at the cap, say): plain gates that are
  // always valid.
  function fallback(run, A, style) {
    var T = run.tier, lo = A[A.length - 1], K = 1, B, D1, D2;
    if (style === 'cut') {
      // −1, and two bigger cuts.
      var M = 1;
      A.forEach(function (a) { M = Math.max(M, need(T, a, a - 1)); });
      return lo - 1 - M - 1 >= 1 ? [{ op: MG.MINUS, n: 1 }, { op: MG.MINUS, n: 1 + M }, { op: MG.MINUS, n: 2 + M }] : null;
    }
    D1 = { op: '+', n: 1 }; D2 = lo > 1 ? { op: MG.MINUS, n: 1 } : { op: '+', n: 2 };
    function ok(a) { return K - Math.max(1, MG.apply(D2, a) - a) >= need(T, a, a + K); }
    while (!A.every(ok)) K++;
    B = { op: '+', n: K };
    return [B, D1, D2];
  }
  // Which row style: "grow" (pick the biggest gain) or "cut" (every gate takes some
  // away: pick the one that takes the least). Near the world's cap, every second row in
  // the division world, and now and then elsewhere.
  function rowStyle(run, row, c) {
    if (c <= 2) return 'grow';
    if (c >= run.P.cap) return 'cut';
    return row.plan;
  }
  // The share of gate rows that take runners away, by world and level; the division
  // world takes turns. Planned with the layout, so every player meets the same kinds.
  function cutShare(world, n) { return [n ? 0.35 : 0, n ? 0.3 : 0.15, n >= 2 ? 0.15 : 0, 0.5, n ? 0.25 : 0.1][world]; }

  /* ---------------------------------------------------------- questions */
  // A question: its text (Western digits and the signs + − × ÷ =), its answer and three
  // answers to choose from (exactly one right, all different, all positive).
  function q(a, op, b, op2, c2) {
    var ans = op1(op, b, a), text = a + ' ' + op + ' ' + b;
    if (op2) { ans = op1(op2, c2, ans); text += ' ' + op2 + ' ' + c2; }
    return { a: a, op: op, b: b, op2: op2 || '', c: op2 ? c2 : 0, ans: ans, text: text + ' = ?' };
  }
  function makeQuestion(run) {
    var r = run.rand, T = run.tier, w = run.world, n = run.n, Q;
    if (w === 0) {
      var S = T === 1 ? 10 : T === 2 ? 15 : 20;
      if (n === 0 || r() < 0.6) { var a = rint(r, 1, S - 1); Q = q(a, '+', rint(r, 1, S - a)); }
      else { var x = rint(r, 3, S); Q = q(x, MG.MINUS, rint(r, 1, x - 1)); }
    } else if (w === 1) {
      if (r() < 0.6) {
        var a2 = T <= 2 ? rint(r, 1, 8) * 10 : rint(r, 11, 80), b2 = T <= 2 ? rint(r, 1, 9) : rint(r, 3, 99 - a2);
        if (T <= 2 && r() < 0.5) b2 = rint(r, 1, Math.max(1, 9 - a2 / 10)) * 10;
        Q = q(a2, '+', b2);
      } else {
        var x2 = T <= 2 ? rint(r, 2, 9) * 10 + rint(r, 0, 9) : rint(r, 30, 99), y2 = T <= 2 ? rint(r, 1, 9) : rint(r, 11, x2 - 5);
        Q = q(x2, MG.MINUS, Math.min(x2 - 1, y2));
      }
    } else if (w === 2) {
      var tab = n < 3 ? (T === 1 ? [2, 3, 10] : [2, 3, 5, 10]) : T <= 2 ? [2, 3, 4, 5, 10] : range(2, 9);
      Q = q(rint(r, 1, T === 1 ? 5 : T === 2 ? 6 : 10), '×', tab[Math.floor(r() * tab.length)]);
      if (r() < 0.5) Q = q(Q.b, '×', Q.a);
    } else if (w === 3) {
      var dv = n < 3 ? [2, 5, 10] : T <= 2 ? [2, 3, 4, 5, 10] : range(2, 9), d = dv[Math.floor(r() * dv.length)];
      var k = rint(r, 1, T === 1 ? 5 : 10);
      Q = q(k * d, '÷', d);
    } else {
      var f = Math.floor(r() * 4), m1 = rint(r, 2, T <= 2 ? 5 : 9), m2 = rint(r, 2, T <= 2 ? 5 : 9);
      if (f === 0) Q = q(m1, '×', m2, '+', rint(r, 1, 10));
      else if (f === 1) Q = q(m1, '×', m2, MG.MINUS, rint(r, 1, Math.min(10, m1 * m2 - 1)));
      else if (f === 2) { var s1 = rint(r, 5, 30), s2 = rint(r, 2, 20); Q = q(s1, '+', s2, MG.MINUS, rint(r, 1, s1 + s2 - 1)); }
      else Q = q(m1 * m2, '÷', m2, '+', rint(r, 1, 10));
    }
    // Wrong answers: near misses and classic slips (a + b for a × b, the next number in the table).
    var near = knob(T, 'quizNear'), ans = Q.ans, step = Q.op === '×' || Q.op === '÷' ? Q.b : 0;
    var pool = [ans + 1, ans - 1, ans + 2, ans - 2, ans + 3, ans - 3, ans + 10, ans - 10, ans + 5, ans - 5];
    if (step) pool.push(ans + step, ans - step);
    if (Q.op === '×' && !Q.op2) pool.push(Q.a + Q.b);
    if (Q.op === '÷') pool.push(Q.a - Q.b);
    var seen = {}, wrong = [];
    shuffle(r, pool).forEach(function (v) {
      if (v >= 1 && v !== ans && Math.abs(v - ans) >= near && !seen[v]) { seen[v] = 1; wrong.push(v); }
    });
    // The first wrong answer is a near one, the second may be a slip.
    wrong.sort(function (x, y) { return Math.abs(x - ans) - Math.abs(y - ans); });
    var w1 = wrong[0], w2 = wrong[Math.min(wrong.length - 1, 1 + Math.floor(r() * Math.min(3, wrong.length - 1)))];
    if (w2 === w1) w2 = wrong[1];
    Q.wrong = [w1, w2];
    return Q;
  }
  MG.question = function (o) {
    var run = { rand: MG.rng(o.seed), tier: tierOf(o.tier), world: clamp(o.world | 0, 0, 4), n: clamp(o.n | 0, 0, 5) };
    return makeQuestion(run);
  };
  MG.quizBonus = function (c) { return Math.max(3, Math.round(c * 0.2)); };
  MG.quizLoss = function (c) { return Math.max(0, Math.min(c - MG.FLOOR, Math.max(2, Math.round(c * 0.1)))); };

  /* -------------------------------------------------------------- a run */
  function base(o) {
    var level = clamp(o.level | 0, 0, MG.LEVELS_N - 1), L = MG.LEVELS[level], T = tierOf(o.tier);
    var run = {
      level: level, world: L.world, n: L.n, tag: L.tag, tier: T, seed: (o.seed >>> 0) || 1,
      rand: MG.rng((o.seed >>> 0) || 1), P: pools(L.world, L.n, T),
      speed: knob(T, 'speed'), gap: knob(T, 'gap'), t: 0, d: 0, lane: 1, x: 0, count: 0,
      rows: [], segs: [], coins: [], obs: [], R: ROWS[L.n] + knob(T, 'extraRows'), made: 0, lastOp: '', lastLanes: [],
      phase: 'run', ev: [], runCoins: 0, asked: 0, right: 0, picks: 0, bestPicks: 0, hits: 0, par: 0, rival: 0, battleD: 0,
      battle: null, stairs: null, result: null, next: 0
    };
    run.count = run.P.start;
    if (L.world === 0 && L.n === 0) run.R = Math.min(run.R, 6);
    return run;
  }
  // The level's layout: row distances and kinds, coin lines and obstacles.
  function layout(run) {
    var r = run.rand, T = run.tier, R = run.R, i;
    for (i = 0; i < R; i++) run.rows.push({ i: i, d: run.gap * (i + 1), kind: 'gate', plan: 'grow', shown: false, passed: false, pick: -1, best: -1, gates: null, q: null, answers: null, before: 0, after: 0 });
    run.battleD = run.rows[R - 1].d + MG.FINISH;
    // Question rows: never the first row, never two in a row.
    var nq = Math.min(knob(T, 'quiz'), Math.floor(R / 2)), slots = shuffle(r, range(1, R - 1)), picked = [];
    for (i = 0; i < slots.length && picked.length < nq; i++) {
      var s = slots[i];
      if (picked.every(function (p) { return Math.abs(p - s) > 1; })) picked.push(s);
    }
    picked.forEach(function (s) { run.rows[s].kind = 'quiz'; });
    // Gate row kinds: the first is always a "grow" row, and no two "cut" rows follow each other.
    var share = cutShare(run.world, run.n), prev = 'grow', made = 0;
    run.rows.forEach(function (row) {
      if (row.kind !== 'gate') return;
      var cut = made > 0 && prev !== 'cut' && (run.world === 3 ? made % 2 === 1 : r() < share);
      row.plan = prev = cut ? 'cut' : 'grow';
      made++;
    });
    // Obstacle stretches: none in a world's first level, never before the first two rows.
    var nObs = run.n === 0 ? 0 : Math.min(R - 1, 1 + Math.floor(run.n / 2) + knob(T, 'rocks'));
    var rocky = shuffle(r, range(2, R)).slice(0, nObs), id = 1;
    for (i = 0; i <= R; i++) {
      var a = i ? run.rows[i - 1].d : 0, b = i < R ? run.rows[i].d : run.battleD, seg = { i: i, a: a, b: b, obs: 0 }, here = [];
      run.segs.push(seg);
      if (rocky.indexOf(i) >= 0) {
        var two = r() < knob(T, 'double') && b - a >= 30, first = a + 14 + r() * 2;
        var spots = two ? [first, Math.min(b - 10, first + 8 + r() * 3)] : [a + 14 + r() * Math.max(0, b - a - 25)];
        spots.forEach(function (d) {
          var roller = r() < (T <= 2 ? 0.35 : 0.6), lanes;
          if (roller) lanes = r() < 0.5 ? [0, 1] : [1, 2];
          else lanes = [rint(r, 0, 2)];
          var o = { id: id++, d: d, kind: roller ? 'roller' : 'pillar', lanes: lanes, seg: i, hit: false, passed: false };
          run.obs.push(o); here.push(o);
          seg.obs++;
        });
      }
      // A line of five coins near the start of every stretch (two in the last one),
      // never in an obstacle's lane beside it.
      var lines = i === R ? 2 : 1;
      for (var l = 0; l < lines; l++) {
        var lane = rint(r, 0, 2), d0 = a + (i ? 4 : 8) + l * 13;
        var blocked = function (ln) { return here.some(function (o) { return o.lanes.indexOf(ln) >= 0 && o.d > d0 - 2.5 && o.d < d0 + 9.7; }); };
        for (var tries = 0; tries < 3 && blocked(lane); tries++) lane = (lane + 1) % 3;
        if (blocked(lane)) continue;
        for (var k = 0; k < 5; k++) run.coins.push({ id: id++, d: d0 + k * 1.8, lane: lane, got: false });
      }
    }
    run.obs.sort(function (x, y) { return x.d - y.d; });
  }
  // Makes row i for the crowd's number now.
  function makeRow(run, i) {
    var row = run.rows[i], r = run.rand, c = run.count;
    if (row.shown) return row;
    // The best lane: anywhere, but not the same lane three rows running.
    var lanes = [0, 1, 2], L = run.lastLanes, best = rint(r, 0, 2);
    if (L.length >= 2 && L[L.length - 1] === L[L.length - 2] && best === L[L.length - 1]) best = (best + 1 + rint(r, 0, 1)) % 3;
    if (row.kind === 'quiz') {
      row.q = makeQuestion(run);
      var others = lanes.filter(function (l) { return l !== best; });
      if (r() < 0.5) others.reverse();
      row.answers = [0, 0, 0];
      row.answers[best] = row.q.ans; row.answers[others[0]] = row.q.wrong[0]; row.answers[others[1]] = row.q.wrong[1];
    } else {
      var A = arrivals(run, c, run.segs[i].obs), style = rowStyle(run, row, c);
      var g = pickGates(run, A, style) || (style === 'cut' ? fallback(run, A, 'cut') || pickGates(run, A, 'grow') : null) || fallback(run, A, 'grow');
      var rest = lanes.filter(function (l) { return l !== best; });
      if (r() < 0.5) rest.reverse();
      row.gates = [null, null, null];
      row.gates[best] = { op: g[0].op, n: g[0].n, op2: g[0].op2 || '', n2: g[0].n2 || 0 };
      row.gates[rest[0]] = { op: g[1].op, n: g[1].n, op2: g[1].op2 || '', n2: g[1].n2 || 0 };
      row.gates[rest[1]] = { op: g[2].op, n: g[2].n, op2: g[2].op2 || '', n2: g[2].n2 || 0 };
      row.style = style;
      run.lastOp = g[0].op;
      run.made++;
    }
    row.best = best; row.made = c; row.shown = true;
    L.push(best);
    run.ev.push({ t: 'reveal', row: i });
    return row;
  }
  // The best lane of a gate row for a crowd of c (strictly the biggest result), or -1.
  MG.bestLane = function (row, c) {
    if (row.kind === 'quiz') return row.answers ? row.answers.indexOf(row.q.ans) : -1;
    var best = -1, top = -Infinity, tie = false;
    for (var l = 0; l < 3; l++) {
      var v = MG.pass(row.gates[l], c);
      if (v > top) { top = v; best = l; tie = false; } else if (v === top) tie = true;
    }
    return tie ? -1 : best;
  };
  // A ghost of the same level and seed that picks the best gate every time, dodges every
  // obstacle and answers every question: its number at the finish is the par.
  function ghostPar(o) {
    var g = base(o);
    layout(g);
    makeRow(g, 0);
    for (var i = 0; i < g.R; i++) {
      var row = g.rows[i];
      g.count = row.kind === 'quiz' ? g.count + MG.quizBonus(g.count) : MG.pass(row.gates[row.best], g.count);
      if (i + 1 < g.R) makeRow(g, i + 1);
    }
    return g.count;
  }
  // o: { level 0..29, tier 1..5, seed }
  MG.create = function (o) {
    o = o || {};
    var run = base(o);
    run.par = ghostPar(o);
    run.rival = Math.max(1, Math.min(run.par - 1, Math.floor(run.par * knob(run.tier, 'rival') * MG.RIVAL_WORLD[run.world])));
    run.startCount = run.count;
    layout(run);
    makeRow(run, 0);
    run.ev.length = 0;
    return run;
  };

  /* ------------------------------------------------------------- steps */
  function setLane(run, lane) {
    lane = clamp(lane | 0, 0, 2);
    if (lane === run.lane) return;
    run.ev.push({ t: 'lane', from: run.lane, to: lane });
    run.lane = lane;
  }
  function passRow(run, row) {
    var before = run.count, lane = run.lane, after;
    row.passed = true; row.pick = lane; row.before = before;
    if (row.kind === 'quiz') {
      var right = row.answers[lane] === row.q.ans;
      run.asked++;
      if (right) { run.right++; after = before + MG.quizBonus(before); }
      else after = Math.max(MG.FLOOR, before - MG.quizLoss(before));
      run.count = after; row.after = after;
      run.ev.push({ t: 'quiz', row: row.i, lane: lane, right: right, ans: row.q.ans, picked: row.answers[lane], best: row.best, before: before, after: after });
    } else {
      var g = row.gates[lane], bestNow = MG.bestLane(row, before);
      if (!MG.exact(g, before)) run.ev.push({ t: 'rounded', row: row.i, lane: lane });
      after = MG.pass(g, before);
      run.count = after; row.after = after;
      run.picks++;
      if (lane === bestNow) run.bestPicks++;
      run.ev.push({ t: 'gate', row: row.i, lane: lane, gate: g, before: before, after: after, best: lane === bestNow, bestLane: bestNow });
    }
    if (row.i + 1 < run.R) makeRow(run, row.i + 1);
  }
  function startBattle(run) {
    run.phase = 'battle';
    run.battle = { t: 0, ours: run.count, theirs: run.rival, acc: 0, rate: Math.max(8, run.rival / 1.4), done: false, won: false };
    run.finishCount = run.count;
    run.ev.push({ t: 'finish', count: run.count, rival: run.rival });
  }
  function stepBattle(run, dt) {
    var B = run.battle;
    B.t += dt;
    // The crowd slows to a stop just before the rival crowd.
    var stop = run.battleD + 2.5, v = Math.max(0, Math.min(run.speed, (stop - run.d) * 3));
    run.d = Math.min(stop, run.d + v * dt);
    run.x += (MG.laneX(1) - run.x) * Math.min(1, dt * 4);
    if (B.done) {
      if (B.t >= B.end) {
        if (B.won) startStairs(run);
        else finish(run);
      }
      return;
    }
    if (B.t < 0.8) return;
    B.acc += B.rate * dt;
    var n = Math.min(B.ours, B.theirs, Math.floor(B.acc));
    if (n > 0) {
      B.acc -= n; B.ours -= n; B.theirs -= n;
      run.count = B.ours;
      run.ev.push({ t: 'clash', n: n, ours: B.ours, theirs: B.theirs });
    }
    if (!B.ours || !B.theirs) {
      B.done = true; B.won = B.ours > 0; B.end = B.t + (B.won ? 0.7 : 1.4);
      run.ev.push({ t: B.won ? 'won' : 'lost', left: B.ours, theirs: B.theirs });
    }
  }
  // The crowd that is left climbs the steps: what a perfect run has left reaches ×10,
  // half of it ×5. Each step keeps a share of the runners.
  MG.stepCost = function (par, rival) { return Math.max(1, par - rival) / MG.STEPS; };
  MG.stepsFor = function (left, par, rival) { return left > 0 ? Math.min(MG.STEPS, Math.max(1, Math.ceil(left / MG.stepCost(par, rival) - 1e-9))) : 0; };
  function startStairs(run) {
    run.phase = 'stairs';
    var left = run.battle.ours;
    run.stairs = { t: 0, left: left, cost: MG.stepCost(run.par, run.rival), goal: MG.stepsFor(left, run.par, run.rival), k: 0 };
  }
  MG.STEP_S = 0.3;
  function stepStairs(run, dt) {
    var S = run.stairs;
    S.t += dt;
    while (S.k < S.goal && S.t >= (S.k + 1) * MG.STEP_S) { S.k++; run.ev.push({ t: 'step', k: S.k, goal: S.goal }); }
    if (S.t >= S.goal * MG.STEP_S + 1.1) finish(run);
  }
  function finish(run) {
    run.phase = 'done';
    run.result = MG.result(run);
    run.ev.push({ t: 'done', won: run.result.won, stars: run.result.stars });
  }
  // One fixed step. input: { move: -1 | 0 | 1 (a lane to the left or right), lane: 0..2 (a lane picked with the mouse) }
  MG.step = function (run, dt, input) {
    if (run.phase === 'done') return run;
    input = input || {};
    run.t += dt;
    if (run.phase === 'battle') { stepBattle(run, dt); return run; }
    if (run.phase === 'stairs') { stepStairs(run, dt); return run; }
    if (input.lane != null && input.lane >= 0) setLane(run, input.lane);
    else if (input.move) setLane(run, run.lane + (input.move > 0 ? 1 : -1));
    var v = run.speed * Math.min(1, 0.35 + run.t / 0.9), d0 = run.d, d1 = d0 + v * dt;
    run.d = d1;
    run.x += (MG.laneX(run.lane) - run.x) * Math.min(1, dt * 14);
    var i;
    for (i = 0; i < run.coins.length; i++) {
      var k = run.coins[i];
      if (k.got || k.d <= d0 || k.d > d1) continue;
      if (k.lane === run.lane) { k.got = true; run.runCoins++; run.ev.push({ t: 'coin', id: k.id, lane: k.lane, n: run.runCoins }); }
    }
    for (i = 0; i < run.obs.length; i++) {
      var o = run.obs[i];
      if (o.passed || o.d > d1) continue;
      o.passed = true;
      if (o.lanes.indexOf(run.lane) >= 0) {
        var lost = run.count - Math.max(MG.FLOOR, run.count - MG.loss(run.tier, run.count));
        o.hit = true; run.hits++; run.count -= lost;
        run.ev.push({ t: 'hit', id: o.id, kind: o.kind, lost: lost, count: run.count });
      } else run.ev.push({ t: 'dodge', id: o.id });
    }
    while (run.next < run.R && run.rows[run.next].d <= d1) passRow(run, run.rows[run.next++]);
    if (run.d >= run.battleD) startBattle(run);
    return run;
  };
  // How far along the level the crowd is, 0..1.
  MG.progress = function (run) { return clamp(run.d / run.battleD, 0, 1); };

  /* ----------------------------------------------------------- results */
  MG.result = function (run) {
    var B = run.battle, won = !!(B && B.won), count = run.finishCount || run.count;
    var big = count >= Math.ceil(run.par * MG.BIG), all = run.right === run.asked;
    var mult = won ? Math.max(1, run.stairs ? run.stairs.goal : 1) : 0;
    return {
      level: run.level, won: won, count: count, left: B ? B.ours : 0, rival: run.rival, par: run.par,
      big: won && big, allRight: all, stars: won ? 1 + (big ? 1 : 0) + (all ? 1 : 0) : 0,
      mult: mult, runCoins: run.runCoins, coins: won ? (run.runCoins + MG.FINISH_COINS) * mult : run.runCoins,
      asked: run.asked, right: run.right, picks: run.picks, bestPicks: run.bestPicks, hits: run.hits
    };
  };
  // 0..1 for Kit.dda: three stars 1, two 0.8, one 0.6; a lost battle at most 0.25.
  MG.outcome = function (res) {
    if (!res) return 0;
    if (res.won) return [0.6, 0.6, 0.8, 1][res.stars];
    return Math.round(clamp(0.25 * res.count / Math.max(1, res.rival), 0, 0.25) * 1000) / 1000;
  };

  /* ------------------------------------------------------- crowd looks */
  // Unlocked by all the coins ever earned (nothing is spent).
  MG.COLORS = [
    { id: 'pink', c: 0xff6fae, need: 0 }, { id: 'sky', c: 0x4fb8ff, need: 0 }, { id: 'lemon', c: 0xffd23f, need: 60 },
    { id: 'mint', c: 0x3fd89a, need: 150 }, { id: 'grape', c: 0xa77bff, need: 300 }, { id: 'orange', c: 0xff8a3c, need: 500 },
    { id: 'rainbow', c: -1, need: 800 }, { id: 'gold', c: 0xffc21a, need: 1200 }
  ];
  MG.HATS = [
    { id: 'none', need: 0 }, { id: 'party', need: 40 }, { id: 'bow', need: 120 }, { id: 'cap', need: 220 },
    { id: 'crown', need: 400 }, { id: 'flower', need: 650 }, { id: 'wizard', need: 1000 }, { id: 'propeller', need: 1500 }
  ];
  MG.unlocks = function (before, after) {
    var out = [];
    MG.COLORS.forEach(function (c, i) { if (c.need > before && c.need <= after) out.push({ type: 'color', i: i }); });
    MG.HATS.forEach(function (h, i) { if (h.need > before && h.need <= after) out.push({ type: 'hat', i: i }); });
    return out;
  };

  /* -------------------------------------------------------------- saves */
  // { v: 1, coins (all ever earned), stars: [30 × 0..3], best: [30 × the biggest crowd
  //   at a won finish], color, hat, seen (coins when the wardrobe was last opened),
  //   coach (the first level was won) }
  MG.freshSave = function () {
    var z = [];
    for (var i = 0; i < MG.LEVELS_N; i++) z.push(0);
    return { v: 1, coins: 0, stars: z.slice(), best: z.slice(), color: 0, hat: 0, seen: 0, coach: false };
  };
  function int(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  // Every field is checked: an old, damaged or hand-edited save loads as a playable save.
  MG.loadSave = function (raw) {
    var s = MG.freshSave(), r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    if (!r || r.v !== 1) return s;
    s.coins = int(r.coins, 0, 9999999) ? r.coins : 0;
    var st = Array.isArray(r.stars) ? r.stars : [], be = Array.isArray(r.best) ? r.best : [];
    for (var i = 0; i < MG.LEVELS_N; i++) {
      s.stars[i] = int(st[i], 0, 3) ? st[i] : 0;
      s.best[i] = int(be[i], 0, 9999999) ? be[i] : 0;
    }
    s.color = int(r.color, 0, MG.COLORS.length - 1) && MG.COLORS[r.color].need <= s.coins ? r.color : 0;
    s.hat = int(r.hat, 0, MG.HATS.length - 1) && MG.HATS[r.hat].need <= s.coins ? r.hat : 0;
    s.seen = int(r.seen, 0, s.coins) ? r.seen : s.coins;
    s.coach = r.coach === true;
    return s;
  };
  MG.totalStars = function (s) { var n = 0; for (var i = 0; i < MG.LEVELS_N; i++) n += s.stars[i]; return n; };
  // A world opens when the third level of the world before it is won; inside a world
  // each level opens when the one before it is won.
  MG.worldOpen = function (s, w) { return w === 0 || (w > 0 && w < MG.WORLDS_N && s.stars[(w - 1) * MG.PER_WORLD + 2] > 0); };
  MG.isOpen = function (s, i) {
    if (!(i >= 0 && i < MG.LEVELS_N)) return false;
    var w = Math.floor(i / MG.PER_WORLD), n = i % MG.PER_WORLD;
    return MG.worldOpen(s, w) && (n === 0 || s.stars[i - 1] > 0);
  };
  // The level to play next: the first open level not yet won, else the last open one.
  MG.nextLevel = function (s) {
    var last = 0;
    for (var i = 0; i < MG.LEVELS_N; i++) {
      if (!MG.isOpen(s, i)) continue;
      if (!s.stars[i]) return i;
      last = i;
    }
    return last;
  };
  // Records one finished run. Returns what changed, for the celebration.
  MG.applyResult = function (s, level, res) {
    var out = { best: false, more: 0, unlocked: [], opened: [] }, before = s.coins, open = [];
    for (var i = 0; i < MG.LEVELS_N; i++) open.push(MG.isOpen(s, i));
    s.coins = Math.min(9999999, s.coins + res.coins);
    out.unlocked = MG.unlocks(before, s.coins);
    if (res.won) {
      if (s.best[level] > 0 && res.count > s.best[level]) out.best = true;
      if (res.count > s.best[level]) s.best[level] = Math.min(9999999, res.count);
      if (res.stars > s.stars[level]) { out.more = res.stars - s.stars[level]; s.stars[level] = res.stars; }
      if (!s.coach) s.coach = true;
    }
    for (i = 0; i < MG.LEVELS_N; i++) if (!open[i] && MG.isOpen(s, i)) out.opened.push(i);
    return out;
  };
})();
