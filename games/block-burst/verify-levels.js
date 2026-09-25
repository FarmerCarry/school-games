#!/usr/bin/env node
/*
 * Block Burst level checker (dev tool, not loaded by the game).
 *   node games/block-burst/verify-levels.js [runs=200] [--classic]
 * Plays every adventure level with a greedy bot and a sloppier "kid" bot over many
 * seeds, reports win rates and move counts, and checks board sanity.
 */
'use strict';
var Core = require('./core.js');
var Rules = require('./rules.js');
var Lv = require('./levels.js');

var runs = +process.argv[2] || 200;
var classic = process.argv.indexOf('--classic') >= 0;

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

function evalMove(run, slot, r, c, skill) {
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
  if (skill < 1) v += (Math.random() - 0.5) * 400 * (1 - skill);
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
        var before = r1.score;
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
  var seed = Math.floor(run.rng() * 1e9); o.rng = Core.mulberry(seed);
  return o;
}

function play(run, skill, rng) {
  if (skill === 2) return playSmart(run);
  var guard = 0;
  while (!run.result && guard++ < 400) {
    var best = null, bv = -1e9, mask = Core.maskFromBoard(run.cells);
    for (var s = 0; s < 3; s++) {
      var p = run.tray[s];
      if (!p) continue;
      for (var r = 0; r <= 8 - p.shape.h; r++) for (var c = 0; c <= 8 - p.shape.w; c++) {
        if (!Core.fits(mask, p.shape, r, c)) continue;
        var v = evalMove(run, s, r, c, skill);
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

if (classic) {
  [2, 1, 0.55, 0.25].forEach(function (skill) {
    var scores = [], moves = [];
    for (var i = 0; i < runs; i++) {
      var saved = Math.random;
      var run = Rules.newRun('classic', null, Core.mulberry(1000 + i));
      play(run, skill);
      scores.push(run.score); moves.push(run.moves);
    }
    console.log('classic skill', skill, 'score p10/50/90', pct(scores, 0.1), pct(scores, 0.5), pct(scores, 0.9), 'moves p50', pct(moves, 0.5));
  });
  process.exit(0);
}

var bad = 0;
var ONLY = process.env.ONLY ? process.env.ONLY.split(",").map(Number) : null;
Lv.LEVELS.forEach(function (lv, idx) {
  if (ONLY && ONLY.indexOf(idx + 1) < 0) return;
  // sanity: no full lines at start
  var b = Core.parseBoard(lv.board), m = Core.maskFromBoard(b.cells), colFull = 255;
  for (var r = 0; r < 8; r++) { colFull &= m[r]; if (m[r] === 255) { console.log('L' + (idx + 1) + ' starts with full row'); bad++; } }
  if (colFull) { console.log('L' + (idx + 1) + ' starts with full column'); bad++; }
  var out = [];
  [2, 0.4].forEach(function (skill) {
    var wins = 0, mv = [];
    for (var i = 0; i < runs; i++) {
      var run = Rules.newRun('adv', lv, Core.mulberry(7 + i * 13 + idx * 1000));
      play(run, skill);
      if (run.result === 'win') { wins++; mv.push(run.moves); }
    }
    out.push({ skill: skill, win: Math.round(wins / runs * 100), p25: pct(mv, 0.25), p50: pct(mv, 0.5), p90: pct(mv, 0.9) });
  });
  var g = out[0], k = out[1];
  var flag = (g.win < 97 || k.win < 70) ? '  <-- CHECK' : '';
  if (flag) bad++;
  console.log('L' + (idx + 1) + ' stars=' + lv.stars.join('/') + (lv.moves ? ' limit=' + lv.moves : '') +
    ' | bot win ' + g.win + '% moves p25/50/90 ' + g.p25 + '/' + g.p50 + '/' + g.p90 +
    ' | kid win ' + k.win + '% p50/90 ' + k.p50 + '/' + k.p90 + flag);
});
console.log(bad ? bad + ' issue(s)' : 'all levels OK');
