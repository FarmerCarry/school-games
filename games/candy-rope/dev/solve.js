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
 * Output per level: best stars, "win-robust" = how often the most forgiving
 * winning plan still wins when every action is shifted by up to +-5 frames
 * (1/12 s), and for the recorded plan "3*-robust" (still 3 stars) and
 * "plan-win" (still wins). The recorded plan is the 3-star line that best
 * survives small mistakes, with every action moved to the middle of its timing
 * window, because the game's hint and "watch the solution" demo teach it.
 */
'use strict';
var path = require('path');
var fs = require('fs');
var Sim = require(path.join(__dirname, '..', 'sim.js'));
var LEVELS = require(path.join(__dirname, '..', 'levels.js'));
var SOLUTIONS = [];
try { SOLUTIONS = require(path.join(__dirname, '..', 'solutions.js')); } catch (e) { SOLUTIONS = []; }

var args = process.argv.slice(2);
var TRIES = 6000, WRITE = false, only = [];
for (var i = 0; i < args.length; i++) {
  if (args[i] === '--tries') TRIES = +args[++i];
  else if (args[i] === '--write') WRITE = true;
  else only.push(+args[i] - 1);
}

var seed = 12345;
// Math.imul keeps the multiply exact (a plain * loses low bits and the sequence repeats after ~18k values)
function rnd() { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

function actionPool(L) {
  var cuts = [], i;
  (L.ropes || []).forEach(function (_, i) { cuts.push('p' + i); });
  (L.rings || []).forEach(function (_, i) { cuts.push('g' + i); });
  return { cuts: cuts, pops: (L.bubbles || []).length, blowers: (L.blowers || []).length };
}

// One rollout: simulate, and at random moments apply a random action that is valid right then.
function rollout(L, pool) {
  var w = Sim.create(L, { visual: false }), plan = [];
  var maxActs = pool.cuts.length + pool.pops + (pool.blowers ? 8 : 0) + 1;
  while (w.state === 'play' && w.frame < 1500 && plan.length < maxActs) {
    var lastPuff = plan.length && plan[plan.length - 1][1] === 'puff';
    var wait = lastPuff && rnd() < 0.6 ? ri(9, 14) : rnd() < 0.25 ? ri(0, 6) : rnd() < 0.7 ? ri(3, 90) : ri(60, 300);
    for (var i = 0; i < wait && w.state === 'play'; i++) { Sim.step(w); w.events.length = 0; }
    if (w.state !== 'play') break;
    var opts = [];
    w.ropes.forEach(function (r) { opts.push(['cut', r.key]); });
    if (w.candy.bubble) { opts.push(['pop']); opts.push(['pop']); }
    for (i = 0; i < pool.blowers; i++) opts.push(['puff', i]);
    if (!opts.length) { if (!w.rings.some(function (g) { return !g.used; }) && !w.bubbles.some(function (b) { return !b.used; })) break; continue; }
    if (rnd() < 0.08) break;
    var a = lastPuff && rnd() < 0.6 ? plan[plan.length - 1].slice(1) : opts[ri(0, opts.length - 1)];
    plan.push([w.frame].concat(a));
    Sim.act(w, a);
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

// Every plan gets the same sequence of shifts, so plans are compared fairly.
function robust(L, plan, needStars, J, trials) {
  var ok = 0, js = 99991;
  function jit() { js = (Math.imul(js, 1103515245) + 12345) & 0x7fffffff; return Math.floor(js / 0x80000000 * (2 * J + 1)) - J; }
  for (var t = 0; t < trials; t++) {
    var p = plan.map(function (a) { var b = a.slice(); b[0] = Math.max(0, b[0] + jit()); return b; });
    p.sort(function (a, b) { return a[0] - b[0]; });
    var r = Sim.run(L, p);
    if (r.state === 'won' && r.stars >= needStars) ok++;
  }
  return ok / trials;
}

// drop actions that don't matter (keeps hints clean)
function prune(L, plan) {
  if (!plan) return plan;
  var base = Sim.run(L, plan);
  for (var i = plan.length - 1; i >= 0; i--) {
    var p = plan.slice(0, i).concat(plan.slice(i + 1));
    var r = Sim.run(L, p);
    if (r.state === base.state && r.stars >= base.stars) plan = p;
  }
  return plan;
}

// Start the plan as early as it still works (no idle wait before the first move), then
// move each action to the middle of its winning window, as far as it keeps needStars (it
// and every later action shift together; an action may pass the one before it).
function byFrame(p) { return p.slice().sort(function (a, b) { return a[0] - b[0]; }); }
function center(L, plan, needStars) {
  function ok(p, need) { var r = Sim.run(L, byFrame(p)); return r.state === 'won' && r.stars >= need; }
  function shift(p, k, d) { return p.map(function (a, j) { return j < k ? a : [a[0] + d].concat(a.slice(1)); }); }
  function range(k, need) {
    var lo = 0, hi = 0;
    while (lo > -20 && plan[k][0] + lo > 0 && ok(shift(plan, k, lo - 1), need)) lo--;
    while (hi < 20 && ok(shift(plan, k, hi + 1), need)) hi++;
    return [lo, hi];
  }
  while (plan[0][0] > 0 && ok(shift(plan, 0, -1), needStars)) plan = shift(plan, 0, -1);
  for (var k = 0; k < plan.length; k++) {
    var win = range(k, 0), keep = needStars ? range(k, needStars) : win;
    plan = shift(plan, k, Math.min(keep[1], Math.max(keep[0], Math.round((win[0] + win[1]) / 2))));
  }
  return byFrame(plan);
}

function solveLevel(L, recorded) {
  var pool = actionPool(L);
  var best = null, bestS = -1, winners = [], threeStars = [];
  for (var t = 0; t < TRIES; t++) {
    var plan = rollout(L, pool);
    var r = Sim.run(L, plan);
    var s = score(r);
    if (r.state === 'won') { winners.push({ plan: plan, stars: r.stars }); if (r.stars === 3) threeStars.push(plan); }
    if (s > bestS) { bestS = s; best = plan; }
  }
  // hill-climb toward more stars from the best winner of each route (order of actions) first,
  // so a forgiving route that random play only finished with fewer stars gets a chance too
  var routes = {}, seeds = [], rest = [];
  winners.sort(function (a, b) { return b.stars - a.stars; }).forEach(function (w) {
    var sig = w.plan.map(function (a) { return a[1] + a[2]; }).join();
    if (routes[sig]) rest.push(w.plan); else { routes[sig] = true; seeds.push(w.plan); }
  });
  seeds = seeds.concat(rest).slice(0, 12);
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
    var p = center(L, prune(L, w.plan), 0), rb = robust(L, p, 0, 5, 30);
    if (rb > winRob) { winRob = rb; winPlan = p; }
  });
  // recorded plan: the 3-star line that most often still wins (then still gets 3 stars),
  // preferring the quicker one; the plan already recorded competes too
  var candidates = threeStars.slice(0, 40);
  if (recorded && Sim.run(L, recorded).stars === 3) candidates.push(recorded);
  var r3 = 0, rWin = 0, plan3 = null, best3 = -1;
  candidates.forEach(function (p) {
    p = center(L, prune(L, p), 3);
    var rw = robust(L, p, 0, 5, 100), rb = robust(L, p, 3, 5, 100), sc = rw + rb / 2 - p[p.length - 1][0] * 2e-4;
    if (sc > best3) { best3 = sc; r3 = rb; rWin = rw; plan3 = p; }
  });
  var bestRes = best ? Sim.run(L, best) : null;
  return {
    won: winners.length > 0, winRate: winners.length / TRIES, stars: bestRes && bestRes.state === 'won' ? bestRes.stars : -1,
    winRob: winRob, r3: r3, rWin: rWin, plan: plan3 || best, winPlan: winPlan
  };
}

var results = [];
var idx = only.length ? only : LEVELS.map(function (_, i) { return i; });
idx.forEach(function (i) {
  var L = LEVELS[i];
  seed = 777 + i * 31;
  var t0 = Date.now();
  var r = solveLevel(L, SOLUTIONS[i]);
  results[i] = r;
  var noAct = Sim.run(L, []);
  console.log(
    ('#' + (i + 1)).padEnd(4) + (L.name || '').padEnd(20) +
    (r.won ? 'WIN ' : '--- ') + 'stars ' + r.stars +
    '  rand-win ' + (r.winRate * 100).toFixed(1).padStart(5) + '%' +
    '  win-robust ' + Math.round(r.winRob * 100).toString().padStart(3) + '%' +
    '  3*-robust ' + Math.round(r.r3 * 100).toString().padStart(3) + '%' +
    '  plan-win ' + Math.round(r.rWin * 100).toString().padStart(3) + '%' +
    '  idle:' + noAct.state + (noAct.state === 'won' ? '!!' : '') +
    '  ' + (Date.now() - t0) + 'ms' +
    '\n     plan ' + JSON.stringify(r.plan)
  );
});

if (WRITE) {
  var file = path.join(__dirname, '..', 'solutions.js');
  var existing = SOLUTIONS.slice();
  results.forEach(function (r, i) { if (r && r.plan && r.won) existing[i] = r.plan; });
  for (var k = 0; k < LEVELS.length; k++) if (!existing[k]) existing[k] = null;
  var out = '/* Recorded solutions for every Munch Rope level: [frame, action, arg].\n' +
    ' * Generated by dev/solve.js and checked by dev/verify.js. The game uses the\n' +
    ' * plans for its hint (order and timing) and its "watch the solution" demo. */\n' +
    '(function (root) {\n  var S = [\n' +
    existing.slice(0, LEVELS.length).map(function (p, i) { return '    /* ' + (i + 1) + ' */ ' + JSON.stringify(p); }).join(',\n') +
    '\n  ];\n  root.MUNCH_SOLUTIONS = S;\n  if (typeof module !== \'undefined\' && module.exports) module.exports = S;\n})(typeof window !== \'undefined\' ? window : globalThis);\n';
  fs.writeFileSync(file, out);
  console.log('wrote ' + file);
}
