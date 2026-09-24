/*
 * Dev tool (not loaded by the game). Searches for solutions to Munch Rope
 * levels by running the real simulation (../sim.js) with random plans plus
 * hill-climbing, and measures how forgiving each level is.
 *
 *   node games/candy-rope/dev/solve.js            all levels
 *   node games/candy-rope/dev/solve.js 3 7        only levels 3 and 7 (1-based)
 *   --tries N    random plans per level (default 6000)
 *   --write      store the best plans in ../solutions.js
 *
 * Output per level: best stars, "win%" = how often the most forgiving winning
 * plan still wins when every action is shifted by up to +-5 frames (1/12 s),
 * and "3*%" for the best 3-star plan.
 */
'use strict';
var path = require('path');
var fs = require('fs');
var Sim = require(path.join(__dirname, '..', 'sim.js'));
var LEVELS = require(path.join(__dirname, '..', 'levels.js'));

var args = process.argv.slice(2);
var TRIES = 6000, WRITE = false, only = [];
for (var i = 0; i < args.length; i++) {
  if (args[i] === '--tries') TRIES = +args[++i];
  else if (args[i] === '--write') WRITE = true;
  else only.push(+args[i] - 1);
}

var seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

function actionPool(L) {
  var cuts = [], i;
  (L.ropes || []).forEach(function (_, i) { cuts.push('p' + i); });
  (L.rings || []).forEach(function (_, i) { cuts.push('g' + i); });
  return { cuts: cuts, pops: (L.bubbles || []).length, blowers: (L.blowers || []).length };
}

function randomPlan(L, pool) {
  var plan = [], f = ri(0, 90);
  var cuts = pool.cuts.slice();
  var pops = pool.pops;
  var nPuff = pool.blowers ? ri(0, 7) : 0;
  var bag = [];
  // cut a random subset (usually most) of the ropes
  cuts.forEach(function (k) { if (rnd() < 0.85) bag.push(['cut', k]); });
  for (var i = 0; i < pops; i++) if (rnd() < 0.8) bag.push(['pop']);
  for (i = 0; i < nPuff; i++) bag.push(['puff', ri(0, pool.blowers - 1)]);
  // shuffle
  for (i = bag.length - 1; i > 0; i--) { var j = ri(0, i); var t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
  for (i = 0; i < bag.length; i++) {
    plan.push([f].concat(bag[i]));
    f += rnd() < 0.2 ? ri(0, 8) : ri(4, 110);
  }
  return plan;
}

function score(res) { return res.state === 'won' ? 10 + res.stars * 10 : res.stars; }

function mutate(plan) {
  var p = plan.map(function (a) { return a.slice(); });
  var k = ri(0, p.length - 1);
  var d = ri(-12, 12);
  for (var i = k; i < p.length; i++) p[i][0] = Math.max(0, p[i][0] + d);
  if (rnd() < 0.3 && p.length > 1) { var j = ri(0, p.length - 1); p[j][0] = Math.max(0, p[j][0] + ri(-6, 6)); }
  p.sort(function (a, b) { return a[0] - b[0]; });
  return p;
}

function robust(L, plan, needStars, J, trials) {
  var ok = 0;
  for (var t = 0; t < trials; t++) {
    var p = plan.map(function (a) { var b = a.slice(); b[0] = Math.max(0, b[0] + ri(-J, J)); return b; });
    p.sort(function (a, b) { return a[0] - b[0]; });
    var r = Sim.run(L, p);
    if (r.state === 'won' && r.stars >= needStars) ok++;
  }
  return ok / trials;
}

function solveLevel(L) {
  var pool = actionPool(L);
  var best = null, bestS = -1, winners = [], threeStars = [];
  for (var t = 0; t < TRIES; t++) {
    var plan = randomPlan(L, pool);
    var r = Sim.run(L, plan);
    var s = score(r);
    if (r.state === 'won') { winners.push({ plan: plan, stars: r.stars }); if (r.stars === 3) threeStars.push(plan); }
    if (s > bestS) { bestS = s; best = plan; }
  }
  // hill-climb from the best few winners toward more stars
  var seeds = winners.sort(function (a, b) { return b.stars - a.stars; }).slice(0, 12).map(function (w) { return w.plan; });
  if (!seeds.length && best) seeds = [best];
  seeds.forEach(function (sp) {
    var cur = sp, cs = score(Sim.run(L, cur));
    for (var k = 0; k < 500 && cs < 40; k++) {
      var m = mutate(cur), ms = score(Sim.run(L, m));
      if (ms >= cs) { cur = m; cs = ms; if (ms > bestS) { bestS = ms; best = m; } }
    }
    var rr = Sim.run(L, cur);
    if (rr.state === 'won') { winners.push({ plan: cur, stars: rr.stars }); if (rr.stars === 3) threeStars.push(cur); }
  });
  // most forgiving winner and most forgiving 3-star plan
  var winRob = 0, winPlan = null;
  winners.slice(0, 60).forEach(function (w) {
    var rb = robust(L, w.plan, 0, 5, 30);
    if (rb > winRob) { winRob = rb; winPlan = w.plan; }
  });
  var r3 = 0, plan3 = null;
  threeStars.slice(0, 40).forEach(function (p) {
    var rb = robust(L, p, 3, 5, 30);
    if (rb > r3 || !plan3) { r3 = rb; plan3 = p; }
  });
  var bestRes = best ? Sim.run(L, best) : null;
  return {
    won: winners.length > 0, winRate: winners.length / TRIES, stars: bestRes && bestRes.state === 'won' ? bestRes.stars : -1,
    winRob: winRob, r3: r3, plan: plan3 || best, winPlan: winPlan
  };
}

var results = [];
var idx = only.length ? only : LEVELS.map(function (_, i) { return i; });
idx.forEach(function (i) {
  var L = LEVELS[i];
  seed = 777 + i * 31;
  var t0 = Date.now();
  var r = solveLevel(L);
  results[i] = r;
  var noAct = Sim.run(L, []);
  console.log(
    ('#' + (i + 1)).padEnd(4) + (L.name || '').padEnd(20) +
    (r.won ? 'WIN ' : '--- ') + 'stars ' + r.stars +
    '  rand-win ' + (r.winRate * 100).toFixed(1).padStart(5) + '%' +
    '  win-robust ' + Math.round(r.winRob * 100).toString().padStart(3) + '%' +
    '  3*-robust ' + Math.round(r.r3 * 100).toString().padStart(3) + '%' +
    '  idle:' + noAct.state + (noAct.state === 'won' ? '!!' : '') +
    '  ' + (Date.now() - t0) + 'ms' +
    '\n     plan ' + JSON.stringify(r.plan)
  );
});

if (WRITE) {
  var file = path.join(__dirname, '..', 'solutions.js');
  var existing = [];
  try { existing = require(file); } catch (e) { existing = []; }
  results.forEach(function (r, i) { if (r && r.plan && r.won) existing[i] = r.plan; });
  for (var k = 0; k < LEVELS.length; k++) if (!existing[k]) existing[k] = null;
  var out = '/* Recorded solutions for every Munch Rope level: [frame, action, arg].\n' +
    ' * Generated by dev/solve.js and checked by dev/verify.js. The game uses the\n' +
    ' * order of actions for its hint button. */\n' +
    '(function (root) {\n  var S = [\n' +
    existing.slice(0, LEVELS.length).map(function (p, i) { return '    /* ' + (i + 1) + ' */ ' + JSON.stringify(p); }).join(',\n') +
    '\n  ];\n  root.MUNCH_SOLUTIONS = S;\n  if (typeof module !== \'undefined\' && module.exports) module.exports = S;\n})(typeof window !== \'undefined\' ? window : globalThis);\n';
  fs.writeFileSync(file, out);
  console.log('wrote ' + file);
}
