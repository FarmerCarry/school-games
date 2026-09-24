/*
 * Dev tool (not loaded by the game): proves every level of Swing Hook is
 * completable by running the real simulation (sim.js) with a beam-search bot.
 *
 *   node games/swing-hook/verify-levels.js            all levels
 *   node games/swing-hook/verify-levels.js 3 7        only levels 3 and 7 (1-based)
 *   add --json to print the winning input for each level (per 1/60 s frame)
 *
 * For each level it prints: solved?, bot time, flips, and "robust" = the % of
 * runs that still win when every press/release is shifted by up to ±3 frames
 * (a rough "how forgiving is this level for a kid" score).
 */
'use strict';
var path = require('path');
var Sim = require(path.join(__dirname, 'sim.js'));
var LEVELS = require(path.join(__dirname, 'levels.js'));

var DT = 1 / 60, K = 6;

function solve(def, beamW, maxSeg, flipBias) {
  var L = Sim.build(def);
  var beam = [{ w: Sim.create(L), acts: null, n: 0 }];
  for (var seg = 0; seg < maxSeg; seg++) {
    var buckets = {};
    for (var b = 0; b < beam.length; b++) {
      var node = beam[b];
      for (var a = 0; a < 2; a++) {
        if (node.n === 0 && a === 0 && seg > 30) continue;
        var w = Sim.clone(node.w);
        for (var k = 0; k < K; k++) {
          Sim.step(w, DT, !!a);
          w.ev.length = 0;
          if (w.st !== 'play' && w.st !== 'ready') break;
        }
        if (w.st === 'dead') continue;
        var acts = { a: a, prev: node.acts };
        if (w.st === 'won') return { acts: unroll(acts), time: w.timer, flips: w.flips };
        var score = w.x + (flipBias ? w.flips * flipBias : 0) - (w.y > L.sea - 150 ? 200 : 0);
        var key = Math.floor(w.x / 45) + ',' + Math.floor(w.y / 45) + ',' + (w.hook ? w.hook.id : 0) + ',' + Math.floor(w.vx / 250) + ',' + Math.floor(w.vy / 250) + (flipBias ? ',' + w.flips : '');
        var cur = buckets[key];
        if (!cur || cur.score < score) buckets[key] = { w: w, acts: acts, n: node.n + (a ? 1 : 0) + (node.n ? 0 : 0), score: score };
      }
    }
    var list = Object.keys(buckets).map(function (k) { return buckets[k]; });
    list.sort(function (p, q) { return q.score - p.score; });
    beam = list.slice(0, beamW);
    if (!beam.length) return null;
  }
  return null;
}

function unroll(acts) { var out = []; while (acts) { out.push(acts.a); acts = acts.prev; } return out.reverse(); }

function toFrames(segActs) { var f = []; segActs.forEach(function (a) { for (var k = 0; k < K; k++) f.push(a); }); return f; }

function runFrames(def, frames) {
  var L = Sim.build(def), w = Sim.create(L);
  for (var i = 0; i < frames.length + 600; i++) {
    Sim.step(w, DT, i < frames.length ? !!frames[i] : false);
    w.ev.length = 0;
    if (w.st === 'won') return { won: true, time: w.timer, flips: w.flips };
    if (w.st === 'dead') return { won: false };
  }
  return { won: false };
}

function jitter(frames, J) {
  // find switch points and shift each by random [-J, J]
  var sw = [];
  for (var i = 1; i < frames.length; i++) if (frames[i] !== frames[i - 1]) sw.push(i);
  if (frames[0]) sw.unshift(0);
  var out = [], state = 0, prev = 0;
  var shifted = sw.map(function (s, i) {
    var v = s + Math.round((Math.random() * 2 - 1) * J);
    return Math.max(i === 0 ? 0 : 1, v);
  });
  for (var s = 1; s < shifted.length; s++) if (shifted[s] <= shifted[s - 1]) shifted[s] = shifted[s - 1] + 1;
  var idx = 0; state = 0;
  for (var f = 0; f < frames.length + 12; f++) {
    while (idx < shifted.length && shifted[idx] <= f) { state = 1 - state; idx++; }
    out.push(state);
  }
  return out;
}

var args = process.argv.slice(2);
var json = args.indexOf('--json') >= 0;
var flipMode = args.indexOf('--flips') >= 0;
var only = args.filter(function (a) { return /^\d+$/.test(a); }).map(Number);
var results = {};
var allOk = true;
LEVELS.forEach(function (def, i) {
  if (only.length && only.indexOf(i + 1) < 0) return;
  var t0 = Date.now();
  var sol = solve(def, 260, 420, 0);
  if (!sol) sol = solve(def, 900, 420, 0);
  var line = (i + 1) + '. ' + def.name + ': ';
  if (!sol) { allOk = false; console.log(line + 'NOT SOLVED'); return; }
  var frames = toFrames(sol.acts);
  var chk = runFrames(def, frames);
  var ok = 0, N = 150;
  for (var n = 0; n < N; n++) if (runFrames(def, jitter(frames, 3)).won) ok++;
  var fl = '';
  if (flipMode) {
    var fs = solve(def, 400, 500, 260);
    fl = ' maxflips~' + (fs ? fs.flips + ' (t ' + fs.time.toFixed(1) + ')' : '?');
  }
  console.log(line + (chk.won ? 'OK' : 'REPLAY FAILED') + ' time ' + sol.time.toFixed(2) + 's par ' + def.par + ' flips ' + sol.flips + ' goal ' + def.flips + ' robust ' + Math.round(ok / N * 100) + '%' + fl + '  (' + (Date.now() - t0) + 'ms)');
  if (!chk.won) allOk = false;
  results[i + 1] = frames.join('');
});
if (json) console.log(JSON.stringify(results));
console.log(allOk ? 'ALL LEVELS COMPLETABLE' : 'SOME LEVELS FAILED');
