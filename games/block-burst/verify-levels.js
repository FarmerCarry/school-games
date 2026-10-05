#!/usr/bin/env node
/*
 * Block Burst level checker (dev tool, not loaded by the game).
 *   node games/block-burst/verify-levels.js [runs=200] [--classic] [--report-balance]
 *   ONLY=20 node games/block-burst/verify-levels.js 1 --bot=kid --seed=19007 --json
 * --seed selects the first game seed (subsequent runs add 13). --json includes
 * every failed seed with remaining goals; output is reproducible across reruns.
 * The "kid" bot is a noisy policy, not a measurement of children's performance.
 * Plays every adventure level with a greedy bot and a sloppier "kid" bot over many
 * seeds, reports win rates and move counts, and checks board sanity.
 * By default balance thresholds also fail verification. --report-balance
 * reports those thresholds as warnings; invalid boards and zero smart-bot
 * wins still fail. --classic only reports endless-mode score distributions.
 */
'use strict';
var Core = require('./core.js');
var Rules = require('./rules.js');
var Lv = require('./levels.js');

var BIG = [Core.BY_ID.sq30, Core.BY_ID.five0, Core.BY_ID.five1, Core.BY_ID.rect0, Core.BY_ID.rect1];

function holes(mask) {
  var h = 0;
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    if (mask[r] & (1 << c)) continue;
    var n = 0;
    if (r === 0 || (mask[r - 1] & (1 << c))) n++;
    if (r === 7 || (mask[r + 1] & (1 << c))) n++;
    if (c === 0 || (mask[r] & (1 << (c - 1)))) n++;
    if (c === 7 || (mask[r] & (1 << (c + 1)))) n++;
    if (n === 4) h++;
  }
  return h;
}

function evalMove(run, slot, r, c, skill, policyRng) {
  var p = run.tray[slot], mask = Core.maskFromBoard(run.cells), o = {};
  var m2 = Core.placeMask(mask, p.shape, r, c, o);
  var v = o.lines * 120;
  // gems on cleared lines
  if (run.goalGems && o.lines) {
    var pv = Core.previewLines(mask, p.shape, r, c), g = 0;
    pv.rows.forEach(function (y) { for (var x = 0; x < 8; x++) if (run.gems[y * 8 + x]) g++; });
    pv.cols.forEach(function (x) { for (var y = 0; y < 8; y++) if (run.gems[y * 8 + x]) g++; });
    if (p.gemKind) { var cell = p.shape.cells[p.gemCell]; var gy = r + cell[0], gx = c + cell[1]; if (pv.rows.indexOf(gy) >= 0 || pv.cols.indexOf(gx) >= 0) g++; }
    v += g * 90;
  }
  v += (64 - Core.filled(m2)) * 3;
  v -= holes(m2) * 14;
  for (var i = 0; i < BIG.length; i++) v += Math.min(6, Core.countFits(m2, BIG[i])) * 2;
  if (skill < 1) v += (policyRng() - 0.5) * 400 * (1 - skill);
  return v;
}

// Smart bot: search the whole tray (orders x top-K positions) and play the best line.
function playSmart(run) {
  var guard = 0;
  while (!run.result && guard++ < 400) {
    var plan = null, pv = -1e9;
    function rec(r0, depth, first, acc) {
      var slots = [];
      for (var s = 0; s < 3; s++) if (r0.tray[s]) slots.push(s);
      if (!slots.length || depth === 0 || r0.result) {
        var sc = acc + (r0.result === 'win' ? 1e6 : 0) - (r0.result && r0.result !== 'win' ? 1e5 : 0);
        if (sc > pv) { pv = sc; plan = first; }
        return;
      }
      var mask = Core.maskFromBoard(r0.cells), cands = [];
      slots.forEach(function (s) {
        var p = r0.tray[s];
        for (var r = 0; r <= 8 - p.shape.h; r++) for (var c = 0; c <= 8 - p.shape.w; c++)
          if (Core.fits(mask, p.shape, r, c)) cands.push([evalMove(r0, s, r, c, 1), s, r, c]);
      });
      if (!cands.length) { if (acc - 1e5 > pv) { pv = acc - 1e5; plan = first; } return; }
      cands.sort(function (a, b) { return b[0] - a[0]; });
      cands.slice(0, 5).forEach(function (cd) {
        var r1 = clone(r0);
        Rules.place(r1, cd[1], cd[2], cd[3]);
        if (r1.sets !== r0.sets) { r1.tray = [null, null, null]; }
        rec(r1, depth - 1, first || [cd[1], cd[2], cd[3]], acc + cd[0] * 0.3 + (depth === 1 || !r1.tray.some(Boolean) ? cd[0] : 0));
      });
    }
    rec(run, 3, null, 0);
    if (!plan) { if (!usePower(run)) { run.result = 'stuck'; break; } continue; }
    Rules.place(run, plan[0], plan[1], plan[2]);
  }
  return run;
}
function clone(run) {
  var o = {};
  for (var k in run) o[k] = run[k];
  o.cells = new Uint8Array(run.cells); o.gems = new Uint8Array(run.gems); o.tray = run.tray.slice();
  if (run.goalGems) { o.goalGems = {}; for (k in run.goalGems) o.goalGems[k] = run.goalGems[k]; }
  if (typeof run.rng.clone !== 'function') throw new Error('Verifier requires a cloneable seeded game RNG');
  o.rng = run.rng.clone();
  return o;
}

function play(run, skill, policyRng) {
  policyRng = policyRng || Core.mulberry(1);
  if (skill === 2) return playSmart(run);
  var guard = 0;
  while (!run.result && guard++ < 400) {
    var best = null, bv = -1e9, mask = Core.maskFromBoard(run.cells);
    for (var s = 0; s < 3; s++) {
      var p = run.tray[s];
      if (!p) continue;
      for (var r = 0; r <= 8 - p.shape.h; r++) for (var c = 0; c <= 8 - p.shape.w; c++) {
        if (!Core.fits(mask, p.shape, r, c)) continue;
        var v = evalMove(run, s, r, c, skill, policyRng);
        if (v > bv) { bv = v; best = [s, r, c]; }
      }
    }
    if (!best) { if (!usePower(run)) { run.result = 'stuck'; break; } continue; }
    Rules.place(run, best[0], best[1], best[2]);
  }
  return run;
}

function usePower(run) {
  if (run.result) return false;
  if (run.bombs > 0) {
    // bomb the densest 3x3
    var best = null, bv = -1;
    for (var r = 1; r < 7; r++) for (var c = 1; c < 7; c++) {
      var n = 0;
      for (var y = r - 1; y <= r + 1; y++) for (var x = c - 1; x <= c + 1; x++) if (run.cells[y * 8 + x]) n += run.gems[y * 8 + x] ? 3 : 1;
      if (n > bv) { bv = n; best = [r, c]; }
    }
    Rules.useBomb(run, best[0], best[1]); return true;
  }
  if (run.shuffles > 0) { Rules.useShuffle(run); return true; }
  return false;
}
function pct(arr, q) { var a = arr.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : NaN; }

// Policy randomness is independent of piece generation and of other attempts.
function policyFor(seed, skill) {
  return Core.mulberry((seed ^ (skill === 2 ? 0x9e3779b9 : 0x85ebca6b)) >>> 0);
}
function runLevel(lv, runs, skills, firstSeed) {
  return skills.map(function (skill) {
    var wins = 0, moves = [], failures = [], reasons = {};
    for (var i = 0; i < runs; i++) {
      var seed = (firstSeed + i * 13) >>> 0;
      var run = Rules.newRun('adv', lv, Core.mulberry(seed));
      play(run, skill, policyFor(seed, skill));
      if (run.result === 'win') { wins++; moves.push(run.moves); }
      else {
        var reason = !run.result ? 'guard' : run.movesLimit && run.moves >= run.movesLimit ? 'moves' : 'space';
        reasons[reason] = (reasons[reason] || 0) + 1;
        failures.push({ seed: seed, reason: reason, moves: run.moves,
          score: run.score, missingScore: Math.max(0, run.goalScore - run.score),
          remainingGems: run.goalGems });
      }
    }
    return { bot: skill === 2 ? 'smart' : 'kid', skill: skill, wins: wins, runs: runs,
      win: wins / runs * 100, p25: pct(moves, 0.25), p50: pct(moves, 0.5), p90: pct(moves, 0.9),
      reasons: reasons, failures: failures };
  });
}

function main(args, env) {
  var runArgs = args.filter(function (a) { return /^\d+$/.test(a); });
  var runs = runArgs.length ? +runArgs[0] : 200;
  var classic = args.indexOf('--classic') >= 0;
  var reportBalance = args.indexOf('--report-balance') >= 0;
  var json = args.indexOf('--json') >= 0;
  var only = env.ONLY ? env.ONLY.split(',').map(Number) : null;
  var seeds = args.filter(function (a) { return a.indexOf('--seed=') === 0; });
  var bots = args.filter(function (a) { return a.indexOf('--bot=') === 0; });
  var seed = seeds.length ? Number(seeds[0].slice(7)) : null;
  var bot = bots.length ? bots[0].slice(6) : 'both';
  if (runArgs.length > 1 || !Number.isSafeInteger(runs) || runs < 1 || seeds.length > 1 || bots.length > 1 ||
      (seeds.length && (!/^--seed=\d+$/.test(seeds[0]) || !Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295)) ||
      ['both', 'smart', 'kid'].indexOf(bot) < 0 ||
      args.some(function (a) { return a !== '--classic' && a !== '--report-balance' && a !== '--json' && !/^\d+$/.test(a) && a.indexOf('--seed=') !== 0 && a.indexOf('--bot=') !== 0; }) ||
      (classic && (only || seeds.length || bots.length || json)) ||
      (only && only.some(function (n) { return !Number.isInteger(n) || n < 1 || n > Lv.LEVELS.length; }))) {
    console.error('Usage: node games/block-burst/verify-levels.js [positive run count] [--classic] [--report-balance] [--json] [--seed=uint32] [--bot=smart|kid|both]; ONLY selects level numbers 1-' + Lv.LEVELS.length);
    return 2;
  }
  if (classic) {
    [2, 1, 0.55, 0.25].forEach(function (skill) {
      var scores = [], moves = [];
      for (var i = 0; i < runs; i++) {
        var run = Rules.newRun('classic', null, Core.mulberry(1000 + i));
        play(run, skill, policyFor(1000 + i, skill));
        scores.push(run.score); moves.push(run.moves);
      }
      console.log('classic skill', skill, 'score p10/50/90', pct(scores, 0.1), pct(scores, 0.5), pct(scores, 0.9), 'moves p50', pct(moves, 0.5));
    });
    return 0;
  }
  var bad = 0, balanceWarnings = 0, results = [];
  var skills = bot === 'smart' ? [2] : bot === 'kid' ? [0.4] : [2, 0.4];
  Lv.LEVELS.forEach(function (lv, idx) {
    if (only && only.indexOf(idx + 1) < 0) return;
    var b = Core.parseBoard(lv.board), m = Core.maskFromBoard(b.cells), colFull = 255, errors = [];
    for (var r = 0; r < 8; r++) { colFull &= m[r]; if (m[r] === 255) errors.push('starts with full row'); }
    if (colFull) errors.push('starts with full column');
    bad += errors.length;
    var firstSeed = seed == null ? 7 + idx * 1000 : seed;
    var out = runLevel(lv, runs, skills, firstSeed);
    var unsolved = out.some(function (o) { return o.bot === 'smart' && !o.wins; });
    var balance = out.some(function (o) { return o.win < (o.bot === 'smart' ? 97 : 70); });
    if (unsolved) bad++;
    else if (balance) balanceWarnings++;
    results.push({ level: idx + 1, firstSeed: firstSeed, movesLimit: lv.moves || 0,
      bombs: lv.bombs == null ? 1 : lv.bombs, errors: errors, bots: out });
    if (json) return;
    errors.forEach(function (e) { console.log('L' + (idx + 1) + ' ' + e); });
    var flag = unsolved ? '  <-- FAIL: no smart-bot wins' : balance ? reportBalance ? '  <-- BALANCE WARNING' : '  <-- BALANCE FAIL' : '';
    console.log('L' + (idx + 1) + ' stars=' + lv.stars.join('/') + (lv.moves ? ' limit=' + lv.moves : '') + out.map(function (o) {
      return ' | ' + o.bot + ' win ' + o.win.toFixed(1) + '% (' + o.wins + '/' + runs + ') moves p25/50/90 ' + o.p25 + '/' + o.p50 + '/' + o.p90 +
        (o.failures.length ? ' failures=' + JSON.stringify(o.reasons) : '');
    }).join('') + flag);
    out.forEach(function (o) {
      if (!o.failures.length) return;
      console.log('  ' + o.bot + ' failed seeds: ' + o.failures.slice(0, 5).map(function (f) { return f.seed; }).join(', ') +
        (o.failures.length > 5 ? ' (all in --json)' : ''));
      console.log('  Replay: ONLY=' + (idx + 1) + ' node games/block-burst/verify-levels.js 1 --bot=' + o.bot + ' --seed=' + o.failures[0].seed + ' --report-balance --json');
    });
  });
  var failures = bad + (reportBalance ? 0 : balanceWarnings);
  if (json) console.log(JSON.stringify({ runs: runs, seedStep: 13, targets: { smart: 97, kid: 70 },
    note: 'Seeded bot simulation; kid is a noisy policy, not measured student performance.',
    failures: failures, balanceWarnings: balanceWarnings, levels: results }, null, 2));
  else {
    console.log(failures ? failures + ' issue(s)' : 'all required checks OK');
    if (balanceWarnings) console.log(balanceWarnings + ' balance threshold(s) ' + (reportBalance ? 'reported as warnings (--report-balance)' : 'failed (strict default)'));
  }
  return failures ? 1 : 0;
}
module.exports = { clone: clone, play: play, runLevel: runLevel, policyFor: policyFor, main: main };
// Also support tooling tests that select the CLI via process.argv before requiring it.
if (require.main === module || process.argv[1] === __filename) process.exitCode = main(process.argv.slice(2), process.env);
