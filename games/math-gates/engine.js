/* Math Gates: Galactic Mech Squad (بوابات الحساب — كتيبة الآليين)
 * Pure deterministic simulation engine: 3-lane space highway, fast math holo-gates,
 * auto-blaster number meteors, jetpack turbo jump, endless warp waves, and Titan Boss clash.
 * Zero DOM, zero Kit, zero timers, zero Math.random. Dual Node + browser export. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MGEngine = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var MINUS = '−', FLOOR = 1, CAP_SQUAD = 999, LANE_W = 4;

  var WORLDS = [
    { id: 'galaxy', name: 'طريق المجرة', sub: 'مدار السفينة النجمية', bossName: 'حارس المجرة', icon: '🚀',
      sky: ['#060b24', '#162d6e'], track: '#0f1c44', laneAlt: '#162a63', edge: '#00e5ff', accent: '#38bdf8' },
    { id: 'mars', name: 'قاعدة المريخ', sub: 'وادي الحمم الآلية', bossName: 'عقرب المريخ', icon: '☄️',
      sky: ['#1f0914', '#5c1826'], track: '#2b1020', laneAlt: '#3d172d', edge: '#ff5d3b', accent: '#fb923c' },
    { id: 'reactor', name: 'مفاعل البرق', sub: 'قلب الطاقة الكهرومغناطيسية', bossName: 'عملاق البرق', icon: '⚡',
      sky: ['#12082e', '#3b1578'], track: '#1c1044', laneAlt: '#291861', edge: '#ffd23f', accent: '#c084fc' },
    { id: 'titan', name: 'عرين العملاق', sub: 'قلعة التيتان المدرعة', bossName: 'إمبراطور التيتان', icon: '🤖',
      sky: ['#051c1d', '#0f4c45'], track: '#0b272a', laneAlt: '#123a3e', edge: '#2eff9b', accent: '#f43f5e' }
  ];

  var PER_WORLD = 3, STAGES_N = WORLDS.length * PER_WORLD, ENDLESS_INDEX = STAGES_N;
  var STAGES = [];
  for (var si = 0; si < STAGES_N; si++) {
    var wIdx = Math.floor(si / PER_WORLD), sIdx = si % PER_WORLD;
    STAGES.push({
      i: si, world: wIdx, sub: sIdx, endless: false,
      tag: (wIdx + 1) + '-' + (sIdx + 1),
      name: WORLDS[wIdx].name + ' ' + (wIdx + 1) + '-' + (sIdx + 1),
      roundKey: 'mg_w' + (wIdx + 1) + '_' + (sIdx + 1),
      rows: 7 + sIdx
    });
  }
  STAGES.push({ i: ENDLESS_INDEX, world: 0, sub: 0, endless: true, tag: '∞', name: 'طور الفضاء اللانهائي', roundKey: 'mg_endless', rows: 6 });

  var DIFFS = {
    easy: { id: 'easy', name: 'سهل', badge: '5–7', speed: 22, gap: 33, firstRowD: 28, startCount: 5, shieldRatio: 0.54, marginMin: 2, meteorHp: [4, 7], movingChance: 0, mysteryChance: 0, exprChance: 0.25, laserChance: 0.22, pips: true },
    normal: { id: 'normal', name: 'متوسط', badge: '7–9', speed: 25, gap: 37.5, firstRowD: 30, startCount: 5, shieldRatio: 0.67, marginMin: 2, meteorHp: [6, 12], movingChance: 0.36, mysteryChance: 0, exprChance: 0.48, laserChance: 0.42, pips: false },
    pro: { id: 'pro', name: 'بطل', badge: '10–11', speed: 28, gap: 42, firstRowD: 32, startCount: 6, shieldRatio: 0.75, marginMin: 1, meteorHp: [9, 18], movingChance: 0.46, mysteryChance: 0.34, exprChance: 0.62, laserChance: 0.58, pips: false }
  };
  var DIFF_KEYS = ['easy', 'normal', 'pro'];

  var SKINS = [
    { id: 'neon', name: 'فرسان النيون', cost: 0, primary: '#2563eb', secondary: '#00f0ff', visor: '#7dd3fc', flame: '#38bdf8' },
    { id: 'dragon', name: 'التنين الأحمر', cost: 60, primary: '#dc2626', secondary: '#facc15', visor: '#fef08a', flame: '#fb923c' },
    { id: 'hawk', name: 'صقور الذهب', cost: 140, primary: '#eab308', secondary: '#f8fafc', visor: '#38bdf8', flame: '#fde047' },
    { id: 'plasma', name: 'آليو البلازما', cost: 250, primary: '#9333ea', secondary: '#2eff9b', visor: '#86efac', flame: '#c084fc' }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function laneX(lane) { return (clamp(lane, 0, 2) - 1) * LANE_W; }
  function validDiff(d) { return DIFFS[d] ? d : 'easy'; }

  function rng(seed) {
    var a = (seed >>> 0) || 0x13579bdf;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rint(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }
  function pick(r, list) { return list[Math.floor(r() * list.length)]; }

  /* --------------------------------------------------------- Gate Math */
  function evalOp(op, n, c) {
    if (op === '+') return c + n;
    if (op === MINUS) return c - n;
    if (op === '×') return c * n;
    if (op === '÷') return Math.floor(c / Math.max(1, n));
    return c;
  }
  function applyRaw(gate, c) {
    if (!gate) return c;
    if (gate.kind === 'expr') return c + gate.val;
    var r = evalOp(gate.op, gate.n, c);
    return gate.op2 ? evalOp(gate.op2, gate.n2, r) : r;
  }
  function applyGate(gate, c) { return clamp(applyRaw(gate, c), FLOOR, CAP_SQUAD); }
  function isExactGate(gate, c) {
    if (!gate || gate.kind === 'expr') return true;
    if (gate.op === '÷' && c % gate.n !== 0) return false;
    return !(gate.op2 === '÷' && evalOp(gate.op, gate.n, c) % gate.n2 !== 0);
  }

  function makeOpGate(op, n, op2, n2) {
    var g = { kind: 'op', op: op, n: n };
    if (op2) { g.op2 = op2; g.n2 = n2; }
    g.label = op2 ? (op + n + ' ' + op2 + n2) : (op + n);
    g.tone = (op === '×' || (op === '+' && n >= 8)) ? 'mega' : (op === MINUS || op === '÷') ? 'bad' : 'good';
    return g;
  }

  function makeExprGate(a, eOp, b, val, mixed) {
    var inner = a + ' ' + eOp + ' ' + b;
    var lbl = val < 0 ? (MINUS + Math.abs(val)) : (mixed ? '+(' + inner + ')' : inner);
    return { kind: 'expr', op: val >= 0 ? '+' : MINUS, n: Math.abs(val), val: val, expr: inner, label: lbl, tone: val >= 10 ? 'mega' : val > 0 ? 'good' : 'bad' };
  }

  function buildExprForValue(r, diffId, world, val, mixed) {
    val = Math.max(1, Math.round(val));
    var style = r(), f, factors;
    if (diffId === 'easy') {
      if (val >= 2 && style < 0.65) { var a1 = rint(r, 1, Math.min(val - 1, 7)); return makeExprGate(a1, '+', val - a1, val, mixed); }
      var subB = rint(r, 1, Math.max(1, 10 - val));
      return makeExprGate(val + subB, MINUS, subB, val, mixed);
    }
    if (diffId === 'normal') {
      if (style < 0.4 && val >= 4) {
        factors = [];
        for (f = 2; f <= 6; f++) if (val % f === 0 && val / f <= 9) factors.push(f);
        if (factors.length) { var mf = pick(r, factors); return makeExprGate(mf, '×', val / mf, val, mixed); }
      }
      if (style < 0.72 && val >= 3) { var a2 = rint(r, 1, val - 1); return makeExprGate(a2, '+', val - a2, val, mixed); }
      var sb2 = rint(r, 2, 9);
      return makeExprGate(val + sb2, MINUS, sb2, val, mixed);
    }
    if (style < 0.45 && val <= 12) { var divB = rint(r, 2, 5); return makeExprGate(val * divB, '÷', divB, val, mixed); }
    if (style < 0.8 && val >= 6) {
      factors = [];
      for (f = 2; f <= 9; f++) if (val % f === 0 && val / f <= 9) factors.push(f);
      if (factors.length) { var pm = pick(r, factors); return makeExprGate(pm, '×', val / pm, val, mixed); }
    }
    var sb3 = rint(r, 4, 14);
    return makeExprGate(val + sb3, MINUS, sb3, val, mixed);
  }

  function computePips(results) {
    var lo = Math.min(results[0], results[1], results[2]), hi = Math.max(results[0], results[1], results[2]);
    var span = Math.max(1, hi - lo);
    return results.map(function (v) { return clamp(2 + Math.round(((v - lo) / span) * 6), 1, 8); });
  }

  function bestLaneOf(gates, c) {
    var res = gates.map(function (g) { return applyGate(g, c); });
    var maxV = Math.max(res[0], res[1], res[2]), idx = -1, ties = 0;
    for (var i = 0; i < 3; i++) if (res[i] === maxV) { idx = i; ties++; }
    return ties === 1 ? idx : -1;
  }

  function generateRowGates(r, cfg, world, rowIdx, c, prevBest1, prevBest2, hintAllowed) {
    var diffId = cfg.id;
    var candidates = [0, 1, 2].filter(function (l) { return !(prevBest1 === l && prevBest2 === l); });
    var targetBest = pick(r, candidates);
    var softCap = diffId === 'easy' ? 75 : diffId === 'normal' ? 140 : 220;
    var canMultiply = c <= Math.floor(softCap * 0.44) && (rowIdx % 2 === 1 || r() < 0.45);
    var duelRow = r() < cfg.exprChance * 0.55;
    var bestGate;

    if (duelRow) {
      bestGate = buildExprForValue(r, diffId, world, diffId === 'easy' ? rint(r, 5, 9) : diffId === 'normal' ? rint(r, 8, 16) : rint(r, 12, 24), false);
    } else if (canMultiply && (diffId !== 'easy' || (c <= 18 && r() < 0.55))) {
      var mulN = diffId === 'easy' ? 2 : (c <= 17 && r() < 0.46 ? 3 : 2);
      bestGate = (diffId === 'pro' && r() < 0.4 && c <= 30) ? makeOpGate('×', 2, '+', rint(r, 2, 6)) : makeOpGate('×', mulN);
    } else if (r() < cfg.exprChance) {
      bestGate = buildExprForValue(r, diffId, world, diffId === 'easy' ? rint(r, 4, 9) : diffId === 'normal' ? rint(r, 7, 15) : rint(r, 10, 24), true);
    } else {
      bestGate = makeOpGate('+', diffId === 'easy' ? rint(r, 4, 9) : diffId === 'normal' ? rint(r, 6, 14) : rint(r, 9, 20));
    }

    var bestRes = applyGate(bestGate, c);
    var margin = Math.max(cfg.marginMin, Math.ceil((bestRes - c) * 0.25));
    if (bestRes < c + margin + 1) { bestGate = makeOpGate('+', diffId === 'easy' ? 6 : 10); bestRes = applyGate(bestGate, c); }

    var maxAllowed = Math.max(FLOOR, bestRes - margin), decoy1, decoy2;
    if (duelRow) {
      var d1Val = clamp(bestGate.val - rint(r, 2, Math.max(2, Math.floor(bestGate.val * 0.45))), 1, Math.max(1, maxAllowed - c));
      decoy1 = buildExprForValue(r, diffId, world, d1Val, false);
    } else if (bestGate.op === '×' && maxAllowed - c >= 3) {
      var temptAdd = clamp(rint(r, 3, Math.min(14, maxAllowed - c)), 1, maxAllowed - c);
      decoy1 = r() < cfg.exprChance ? buildExprForValue(r, diffId, world, temptAdd, true) : makeOpGate('+', temptAdd);
    } else if (maxAllowed > c + 1) {
      decoy1 = makeOpGate('+', rint(r, 1, Math.max(1, maxAllowed - c)));
    } else {
      decoy1 = makeOpGate(MINUS, clamp(rint(r, 1, 3), 1, Math.max(1, c - 1)));
    }
    if (applyGate(decoy1, c) > maxAllowed || decoy1.label === bestGate.label) {
      decoy1 = maxAllowed > c ? makeOpGate('+', Math.max(1, maxAllowed - c)) : makeOpGate(MINUS, 1);
    }

    if (duelRow) {
      var usedVal = decoy1.val || 2;
      var d2Val = clamp(usedVal - rint(r, 1, 3), 1, Math.max(1, maxAllowed - c));
      if (d2Val === usedVal) d2Val = Math.max(1, d2Val - 1);
      decoy2 = buildExprForValue(r, diffId, world, d2Val, false);
      if (decoy2.label === decoy1.label || decoy2.label === bestGate.label || applyGate(decoy2, c) >= bestRes) {
        decoy2 = makeOpGate(MINUS, clamp(rint(r, 1, 4), 1, Math.max(1, c - 1)));
      }
    } else if (diffId === 'pro' && c >= 8 && r() < 0.55) {
      decoy2 = makeOpGate('÷', (c % 3 === 0) ? 3 : 2);
    } else {
      var subLim = diffId === 'easy' ? Math.min(5, Math.max(1, c - 2)) : Math.min(9, Math.max(1, c - 2));
      decoy2 = makeOpGate(MINUS, clamp(rint(r, 1, subLim), 1, 9));
    }
    if (decoy2.label === decoy1.label || decoy2.label === bestGate.label || applyGate(decoy2, c) >= bestRes) {
      decoy2 = makeOpGate(MINUS, decoy1.op === MINUS && decoy1.n === 2 ? 3 : 2);
    }

    var gates = [null, null, null];
    gates[targetBest] = bestGate;
    var others = [0, 1, 2].filter(function (l) { return l !== targetBest; });
    if (r() < 0.5) { gates[others[0]] = decoy1; gates[others[1]] = decoy2; }
    else { gates[others[0]] = decoy2; gates[others[1]] = decoy1; }

    for (var gi = 0; gi < 3; gi++) { gates[gi].mystery = false; gates[gi].revealed = true; }
    if (cfg.mysteryChance > 0 && rowIdx >= 1 && r() < cfg.mysteryChance) {
      gates[targetBest].mystery = true; gates[targetBest].shieldHp = 3; gates[targetBest].revealed = false;
    }
    var results = gates.map(function (g) { return applyGate(g, c); });
    return { gates: gates, best: targetBest, results: results, pips: computePips(results), hintBest: !!hintAllowed };
  }

  /* --------------------------------------------------- Stage & Run Creation */
  function spawnStretchObjects(run, r, cfg, segIdx, prevD, rowD) {
    var midD = prevD + (rowD - prevD) * 0.48;
    var meteorCount = (segIdx >= 1 && r() < 0.52) ? 2 : 1;
    var lanes = [0, 1, 2];
    var bonusMax = cfg.id === 'easy' ? 4 : cfg.id === 'normal' ? 6 : 8;
    for (var m = 0; m < meteorCount; m++) {
      var mLane = lanes.splice(Math.floor(r() * lanes.length), 1)[0];
      var hp = rint(r, cfg.meteorHp[0], cfg.meteorHp[1]);
      var kr = r();
      var kind = (segIdx > 0 && kr < 0.22) ? 'laser' : (kr < 0.65 ? 'mech' : 'coin');
      var val = kind === 'mech' ? rint(r, 2, bonusMax) : kind === 'coin' ? rint(r, 4, 7) : 2;
      run.meteors.push({ id: ++run._seq, d: Math.round((midD + (m === 1 ? 2.4 : 0)) * 10) / 10, lane: mLane, hp: hp, maxHp: hp, kind: kind, val: val, shattered: false, passed: false });
    }
    var coinLane = lanes.length ? lanes[0] : rint(r, 0, 2);
    for (var ci = 0; ci < 3; ci++) {
      run.coins.push({ id: ++run._seq, d: Math.round((prevD + 6 + ci * 3.2) * 10) / 10, lane: coinLane, got: false });
    }
    if (segIdx >= 1 && r() < cfg.laserChance) {
      var barLanes = [rint(r, 0, 2)];
      if (cfg.id !== 'easy' && r() < 0.45) barLanes.push((barLanes[0] + 1) % 3);
      run.hazards.push({ id: ++run._seq, d: Math.round((prevD + (rowD - prevD) * 0.24) * 10) / 10, lanes: barLanes, passed: false, hit: false });
    } else if (segIdx >= 1 && r() < 0.35) {
      run.pads.push({ id: ++run._seq, d: Math.round((prevD + (rowD - prevD) * 0.24) * 10) / 10, lane: rint(r, 0, 2), used: false });
    }
  }

  function populateRow(run, rowIdx, forCount) {
    var row = run.rows[rowIdx];
    if (!row || row.shown) return;
    var p1 = rowIdx >= 1 ? run.rows[rowIdx - 1].best : -1;
    var p2 = rowIdx >= 2 ? run.rows[rowIdx - 2].best : -1;
    var built = generateRowGates(row._rng, DIFFS[run.diff], run.world, rowIdx, forCount, p1, p2, run.diff === 'easy' && (run.ddaHint || run.misses > 0));
    row.gates = built.gates; row.best = built.best; row.results = built.results; row.pips = built.pips;
    row.hintBest = built.hintBest; row.madeFor = forCount; row.shown = true;
    run.ev.push({ t: 'reveal', row: rowIdx });
  }

  function appendRows(run, countRows, baseD) {
    var cfg = DIFFS[run.diff], r = run._waveRng;
    for (var k = 0; k < countRows; k++) {
      var idx = run.rows.length;
      var rowD = idx === 0 ? cfg.firstRowD : (baseD + k * cfg.gap);
      var prevD = idx === 0 ? 4 : (k === 0 ? baseD - 18 : rowD - cfg.gap);
      run.rows.push({
        i: idx, d: rowD, shown: false, cued: false, passed: false, pick: -1, best: 0,
        gates: null, results: null, pips: null, hintBest: false,
        moving: cfg.movingChance > 0 && idx >= 1 && r() < cfg.movingChance,
        movePhase: r() * 6.283, moveOffset: 0,
        _rng: rng(((run.seed ^ ((idx + 1) * 0x9e3779b9)) >>> 0) || 1)
      });
      spawnStretchObjects(run, r, cfg, idx, prevD, rowD);
    }
    run.R = run.rows.length;
    run.bossD = run.rows[run.R - 1].d + (run.endless ? 22 : 24);
    run.battleD = run.bossD;
  }

  function estimateWavePar(run, fromRow, toRow, startCount) {
    var cfg = DIFFS[run.diff], c = startCount, p1 = -1, p2 = -1;
    for (var i = fromRow; i < toRow; i++) {
      var built = generateRowGates(rng(((run.seed ^ ((i + 1) * 0x9e3779b9)) >>> 0) || 1), cfg, run.world, i, c, p1, p2, false);
      c = built.results[built.best]; p2 = p1; p1 = built.best;
    }
    return c;
  }

  function create(opts) {
    opts = opts || {};
    var stageIdx = clamp(Math.round(Number(opts.stage != null ? opts.stage : (opts.level || 0))), 0, ENDLESS_INDEX);
    var st = STAGES[stageIdx], diffId = validDiff(opts.diff), cfg = DIFFS[diffId];
    var seed = (opts.seed >>> 0) || 1;
    var ddaLevel = typeof opts.ddaLevel === 'number' ? clamp(opts.ddaLevel, 0, 1) : 0.25;

    var run = {
      stage: stageIdx, level: stageIdx, world: st.world, endless: st.endless, wave: 1,
      diff: diffId, seed: seed, ddaLevel: ddaLevel, ddaHint: diffId === 'easy' && ddaLevel < 0.3,
      lane: 1, x: 0, d: 0, t: 0, speed: cfg.speed + st.world * 0.8 + st.sub * 0.4,
      count: cfg.startCount, phase: 'run', jumpT: 0, jumpDur: 0.68, jumpCd: 0, turboT: 0,
      blasterBoost: 0, fireAcc: 0, runCoins: 0, bestPicks: 0, picks: 0, misses: 0, hits: 0,
      shatteredCount: 0, next: 0, R: 0, rows: [], meteors: [], hazards: [], pads: [], coins: [],
      bolts: [], ev: [], par: 20, bossMax: 12, bossHp: 12, rival: 12, battleD: 0, bossD: 0,
      clashT: 0, finishCount: 0, result: null, _seq: 0, _waveRng: rng((seed ^ 0x5bd1e995) >>> 0)
    };

    appendRows(run, st.rows, cfg.firstRowD);
    run.par = estimateWavePar(run, 0, run.R, run.count);
    var ratio = clamp(cfg.shieldRatio + (ddaLevel - 0.35) * 0.1, 0.46, 0.82);
    run.bossMax = Math.max(7, Math.min(run.par - (st.endless ? 3 : 4), Math.floor(run.par * ratio)));
    run.bossHp = run.bossMax; run.rival = run.bossMax;
    populateRow(run, 0, run.count);
    run.ev.length = 0;
    return run;
  }

  /* -------------------------------------------------------- Simulation Step */
  function step(run, dt, inp) {
    if (!run || run.phase === 'done' || !(dt > 0)) return;
    inp = inp || {};
    dt = Math.min(dt, 0.05);
    run.t += dt;
    if (run.jumpT > 0) run.jumpT = Math.max(0, run.jumpT - dt);
    if (run.jumpCd > 0) run.jumpCd = Math.max(0, run.jumpCd - dt);
    if (run.turboT > 0) run.turboT = Math.max(0, run.turboT - dt);
    if (run.blasterBoost > 0) run.blasterBoost = Math.max(0, run.blasterBoost - dt);
    if (run.phase === 'run') stepRun(run, dt, inp);
    else if (run.phase === 'clash') stepClash(run, dt);
  }

  function stepRun(run, dt, inp) {
    var oldLane = run.lane;
    if (typeof inp.lane === 'number' && inp.lane >= 0 && inp.lane <= 2) run.lane = clamp(Math.round(inp.lane), 0, 2);
    else if (inp.move) run.lane = clamp(run.lane + (inp.move > 0 ? 1 : -1), 0, 2);
    if (run.lane !== oldLane) run.ev.push({ t: 'lane', from: oldLane, to: run.lane });

    if (inp.jump && run.jumpCd <= 0) {
      run.jumpT = run.jumpDur; run.jumpCd = 0.85;
      run.ev.push({ t: 'jump', lane: run.lane, d: run.d });
    }

    var targetX = laneX(run.lane);
    run.x += (targetX - run.x) * (1 - Math.exp(-18 * dt));
    if (Math.abs(targetX - run.x) < 0.01) run.x = targetX;
    run.d += run.speed * (run.turboT > 0 ? 1.28 : 1) * dt;

    for (var ri = run.next; ri < run.R; ri++) {
      var rRow = run.rows[ri], dist = rRow.d - run.d;
      rRow.moveOffset = (rRow.moving && dist > 8.5) ? Math.sin(run.t * 2.6 + rRow.movePhase) * 0.42 * clamp((dist - 8.5) / 6, 0, 1) : 0;
      if (rRow.shown && dist < 12) {
        for (var mg = 0; mg < 3; mg++) {
          if (rRow.gates[mg].mystery && !rRow.gates[mg].revealed) {
            rRow.gates[mg].revealed = true;
            run.ev.push({ t: 'shieldBreak', row: ri, lane: mg });
          }
        }
      }
      if (ri === run.next && rRow.shown && !rRow.cued && dist <= 29) {
        rRow.cued = true; run.ev.push({ t: 'cue', row: ri });
      }
    }

    var fireRate = Math.min(18, (3.6 + Math.sqrt(run.count) * 1.55) * (run.blasterBoost > 0 ? 1.85 : 1));
    run.fireAcc += dt * fireRate;
    while (run.fireAcc >= 1) {
      run.fireAcc -= 1;
      if (run.bolts.length < 28) {
        run.bolts.push({ x: run.x + (((run._seq++) % 3) - 1) * 0.28, lane: run.lane, d: run.d + 1.4, life: 0.52, dmg: run.blasterBoost > 0 ? 2 : 1 });
      }
    }

    for (var bi = run.bolts.length - 1; bi >= 0; bi--) {
      var b = run.bolts[bi], hitSomething = false;
      b.d += 64 * dt; b.life -= dt;
      for (var mi = 0; mi < run.meteors.length; mi++) {
        var met = run.meteors[mi];
        if (met.shattered || met.passed) continue;
        if (Math.abs(b.d - met.d) < 1.35 && Math.abs(b.x - laneX(met.lane)) < 1.45) {
          met.hp = Math.max(0, met.hp - b.dmg); hitSomething = true;
          run.ev.push({ t: 'boltHit', id: met.id, lane: met.lane, d: met.d, hp: met.hp });
          if (met.hp <= 0) {
            met.shattered = true; run.shatteredCount++;
            if (met.kind === 'mech') run.count = clamp(run.count + met.val, FLOOR, CAP_SQUAD);
            else if (met.kind === 'coin') run.runCoins += met.val;
            else { run.blasterBoost = 5.0; run.runCoins += 2; }
            run.ev.push({ t: 'meteorBreak', id: met.id, kind: met.kind, val: met.val, lane: met.lane, d: met.d });
          }
          break;
        }
      }
      if (!hitSomething && run.next < run.R) {
        var curRow = run.rows[run.next];
        if (curRow && curRow.shown && Math.abs(b.d - curRow.d) < 1.4) {
          var gLane = clamp(Math.round(b.x / LANE_W + 1), 0, 2), g = curRow.gates[gLane];
          if (g && g.mystery && !g.revealed) {
            g.shieldHp = (g.shieldHp || 3) - 1; hitSomething = true;
            if (g.shieldHp <= 0) { g.revealed = true; run.ev.push({ t: 'shieldBreak', row: curRow.i, lane: gLane }); }
          }
        }
      }
      if (hitSomething || b.life <= 0) run.bolts.splice(bi, 1);
    }

    for (var ci = 0; ci < run.coins.length; ci++) {
      var coin = run.coins[ci];
      if (!coin.got && run.d >= coin.d - 0.8 && run.d <= coin.d + 1.2 && Math.abs(run.x - laneX(coin.lane)) < 1.5) {
        coin.got = true; run.runCoins++;
        run.ev.push({ t: 'coin', id: coin.id, lane: coin.lane, d: coin.d, total: run.runCoins });
      }
    }
    for (var pi = 0; pi < run.pads.length; pi++) {
      var pad = run.pads[pi];
      if (!pad.used && run.d >= pad.d - 0.8 && run.d <= pad.d + 1.2 && Math.abs(run.x - laneX(pad.lane)) < 1.5) {
        pad.used = true; run.turboT = 1.45; run.count = clamp(run.count + 2, FLOOR, CAP_SQUAD);
        run.ev.push({ t: 'turbo', lane: pad.lane, d: pad.d });
      }
    }
    for (var hi = 0; hi < run.hazards.length; hi++) {
      var haz = run.hazards[hi];
      if (!haz.passed && run.d >= haz.d) {
        haz.passed = true;
        if (haz.lanes.indexOf(run.lane) !== -1) {
          if (run.jumpT > 0.04 || run.turboT > 0) {
            run.runCoins += 2; run.ev.push({ t: 'leap', id: haz.id, lane: run.lane, d: haz.d });
          } else {
            haz.hit = true; run.hits++;
            var prevC = run.count;
            run.count = Math.max(FLOOR, run.count - Math.max(1, Math.min(4, Math.floor(run.count * 0.14))));
            run.ev.push({ t: 'hit', kind: 'laser', id: haz.id, lost: prevC - run.count, count: run.count });
          }
        }
      }
    }
    for (var mci = 0; mci < run.meteors.length; mci++) {
      var mc = run.meteors[mci];
      if (!mc.shattered && !mc.passed && run.d >= mc.d) {
        mc.passed = true;
        if (mc.lane === run.lane && run.jumpT <= 0.04 && run.turboT <= 0) {
          mc.shattered = true; run.hits++;
          var beforeM = run.count;
          run.count = Math.max(FLOOR, run.count - Math.max(1, Math.min(mc.hp, Math.floor(run.count * 0.15))));
          run.ev.push({ t: 'hit', kind: 'meteor', id: mc.id, lost: beforeM - run.count, count: run.count });
        }
      }
    }

    while (run.next < run.R && run.d >= run.rows[run.next].d) {
      var row = run.rows[run.next];
      if (!row.shown) populateRow(run, run.next, run.count);
      var chosenLane = run.lane, gate = row.gates[chosenLane];
      var actualBest = bestLaneOf(row.gates, run.count);
      if (actualBest < 0) actualBest = row.best;
      var before = run.count, after = applyGate(gate, before);
      row.passed = true; row.pick = chosenLane;
      run.count = after; run.picks++;
      var isBest = (chosenLane === actualBest) || (after >= applyGate(row.gates[actualBest], before));
      if (isBest) run.bestPicks++;
      else { run.misses++; if (run.diff === 'easy') run.ddaHint = true; }
      run.ev.push({ t: 'gate', row: row.i, lane: chosenLane, before: before, after: after, best: isBest, bestLane: actualBest, label: gate.label });
      run.next++;
      if (run.next < run.R) populateRow(run, run.next, run.count);
    }

    if (run.next >= run.R && run.d >= run.bossD) {
      if (run.endless && run.count >= run.bossMax) {
        run.count = clamp(Math.max(5, run.count - Math.floor(run.bossMax * 0.48)), 5, 180);
        run.runCoins += 10 + run.wave * 3;
        run.ev.push({ t: 'waveClear', wave: run.wave, bossMax: run.bossMax, count: run.count });
        run.wave++;
        run.world = (run.wave - 1) % WORLDS.length;
        run.speed = Math.min(35, run.speed + 0.9);
        var fromIdx = run.rows.length;
        appendRows(run, 6, run.rows[run.rows.length - 1].d + 22);
        populateRow(run, fromIdx, run.count);
        var wavePar = estimateWavePar(run, fromIdx, run.R, run.count);
        var wRatio = clamp(DIFFS[run.diff].shieldRatio + Math.min(0.14, run.wave * 0.025), 0.5, 0.86);
        run.bossMax = Math.max(12, Math.min(wavePar - 2, Math.floor(wavePar * wRatio)));
        run.bossHp = run.bossMax; run.rival = run.bossMax;
      } else {
        run.d = run.bossD; run.phase = 'clash'; run.finishCount = run.count; run.clashT = 0; run.bolts.length = 0;
        run.ev.push({ t: 'bossStart', count: run.count, bossMax: run.bossMax });
      }
    }
  }

  function stepClash(run, dt) {
    run.clashT += dt;
    var u = clamp(run.clashT / 1.25, 0, 1);
    var drained = Math.round(Math.min(run.finishCount, run.bossMax) * u);
    var prevBoss = run.bossHp;
    run.bossHp = Math.max(0, run.bossMax - drained);
    run.count = Math.max(0, run.finishCount - drained);
    if (run.bossHp !== prevBoss) run.ev.push({ t: 'clash', ours: run.count, theirs: run.bossHp });

    if (u >= 1) {
      var won = run.endless ? (run.wave > 1) : (run.finishCount >= run.bossMax);
      if (run.finishCount >= run.bossMax) { run.bossHp = 0; run.count = Math.max(1, run.finishCount - run.bossMax + 1); }
      else { run.bossHp = run.bossMax - run.finishCount; run.count = 0; }
      var stars = 0;
      if (run.endless) stars = run.wave >= 4 ? 3 : run.wave >= 3 ? 2 : run.wave >= 2 ? 1 : 0;
      else if (won) {
        stars = 1;
        if (run.finishCount >= Math.floor(run.par * 0.8)) stars++;
        if (run.bestPicks >= Math.max(1, run.R - 1)) stars++;
      }
      var totalEarned = run.runCoins + (won ? (12 + stars * 6 + run.world * 4) : 3);
      var score = run.endless ? ((run.wave - 1) * 100 + run.finishCount) : run.finishCount;
      run.result = {
        won: won, stars: stars, count: run.finishCount, left: run.count, bossMax: run.bossMax,
        par: run.par, wave: run.wave, endless: run.endless, bestPicks: run.bestPicks,
        picks: run.picks, shattered: run.shatteredCount, runCoins: run.runCoins, coins: totalEarned, score: score
      };
      run.phase = 'done';
      run.ev.push({ t: won ? 'won' : 'lost', stars: stars, count: run.finishCount, bossMax: run.bossMax });
      run.ev.push({ t: 'done', result: run.result });
    }
  }

  function progress(run) {
    if (!run || !run.bossD) return 0;
    if (run.endless) {
      var waveStart = run.rows.length >= 6 ? run.rows[run.rows.length - 6].d - 24 : 0;
      return clamp((run.d - waveStart) / Math.max(1, run.bossD - waveStart), 0, 1);
    }
    return clamp(run.d / run.bossD, 0, 1);
  }

  function outcome(res) {
    if (!res) return 0.5;
    if (!res.won) return clamp((res.count / Math.max(1, res.bossMax)) * 0.35, 0, 0.35);
    return res.stars >= 3 ? 1 : res.stars === 2 ? 0.82 : 0.65;
  }

  /* --------------------------------------------------- Save & Hangar Shop */
  function freshSave() {
    var stars = [], best = [];
    for (var i = 0; i < STAGES_N; i++) { stars.push(0); best.push(0); }
    return { v: 2, coins: 0, stars: stars, best: best, bestEndless: 0, bestWave: 0, diff: 'easy', skin: 0, unlockedSkins: [true, false, false, false] };
  }

  function loadSave(raw) {
    var base = freshSave();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 2) return base;
    if (Number.isInteger(raw.coins) && raw.coins >= 0 && raw.coins <= 999999) base.coins = raw.coins;
    if (Array.isArray(raw.stars)) for (var i = 0; i < STAGES_N; i++) if (Number.isInteger(raw.stars[i]) && raw.stars[i] >= 0 && raw.stars[i] <= 3) base.stars[i] = raw.stars[i];
    if (Array.isArray(raw.best)) for (var j = 0; j < STAGES_N; j++) if (Number.isInteger(raw.best[j]) && raw.best[j] >= 0 && raw.best[j] <= 99999) base.best[j] = raw.best[j];
    if (Number.isInteger(raw.bestEndless) && raw.bestEndless >= 0) base.bestEndless = Math.min(999999, raw.bestEndless);
    if (Number.isInteger(raw.bestWave) && raw.bestWave >= 0) base.bestWave = Math.min(999, raw.bestWave);
    if (DIFFS[raw.diff]) base.diff = raw.diff;
    if (Array.isArray(raw.unlockedSkins)) for (var k = 1; k < SKINS.length; k++) base.unlockedSkins[k] = !!raw.unlockedSkins[k];
    if (Number.isInteger(raw.skin) && raw.skin >= 0 && raw.skin < SKINS.length && base.unlockedSkins[raw.skin]) base.skin = raw.skin;
    return base;
  }

  function isOpen(save, stageIdx) { return Number.isInteger(stageIdx) && stageIdx >= 0 && stageIdx <= ENDLESS_INDEX; }
  function totalStars(save) {
    if (!save || !Array.isArray(save.stars)) return 0;
    var sum = 0;
    for (var i = 0; i < STAGES_N; i++) sum += save.stars[i] || 0;
    return sum;
  }

  function applyResult(save, stageIdx, res) {
    if (!save || !res) return { newBest: false };
    save.coins = Math.min(999999, (save.coins || 0) + Math.max(0, res.coins | 0));
    var newBest = false;
    if (stageIdx === ENDLESS_INDEX || res.endless) {
      if (res.score > save.bestEndless) { save.bestEndless = res.score; newBest = true; }
      if (res.wave > save.bestWave) save.bestWave = res.wave;
    } else if (stageIdx >= 0 && stageIdx < STAGES_N) {
      if (res.stars > save.stars[stageIdx]) save.stars[stageIdx] = res.stars;
      if (res.won && res.count > save.best[stageIdx]) { newBest = save.best[stageIdx] > 0; save.best[stageIdx] = res.count; }
    }
    return { newBest: newBest };
  }

  function buyOrEquipSkin(save, skinIdx) {
    if (!save || !Number.isInteger(skinIdx) || skinIdx < 0 || skinIdx >= SKINS.length) return { ok: false, bought: false };
    if (save.unlockedSkins[skinIdx]) { save.skin = skinIdx; return { ok: true, bought: false }; }
    if (save.coins < SKINS[skinIdx].cost) return { ok: false, bought: false };
    save.coins -= SKINS[skinIdx].cost;
    save.unlockedSkins[skinIdx] = true; save.skin = skinIdx;
    return { ok: true, bought: true };
  }

  function canAffordAnySkin(save) {
    if (!save) return false;
    for (var i = 1; i < SKINS.length; i++) if (!save.unlockedSkins[i] && save.coins >= SKINS[i].cost) return true;
    return false;
  }

  return {
    MINUS: MINUS, FLOOR: FLOOR, CAP_SQUAD: CAP_SQUAD, LANE_W: LANE_W,
    WORLDS: WORLDS, PER_WORLD: PER_WORLD, STAGES_N: STAGES_N, ENDLESS_INDEX: ENDLESS_INDEX,
    STAGES: STAGES, DIFFS: DIFFS, DIFF_KEYS: DIFF_KEYS, SKINS: SKINS,
    clamp: clamp, laneX: laneX, validDiff: validDiff, rng: rng,
    applyGate: applyGate, isExactGate: isExactGate, bestLaneOf: bestLaneOf,
    makeOpGate: makeOpGate, makeExprGate: makeExprGate,
    create: create, step: step, progress: progress, outcome: outcome,
    freshSave: freshSave, loadSave: loadSave, isOpen: isOpen, totalStars: totalStars,
    applyResult: applyResult, buyOrEquipSkin: buyOrEquipSkin, canAffordAnySkin: canAffordAnySkin
  };
});
