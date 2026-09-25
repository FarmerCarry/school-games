/*
 * Dev tool (not loaded by the game): proves every Munch Rope level is
 * completable by replaying the recorded plans in ../solutions.js through the
 * real simulation, and checks that doing nothing never wins.
 *
 *   node games/candy-rope/dev/verify.js
 */
'use strict';
var path = require('path');
var Sim = require(path.join(__dirname, '..', 'sim.js'));
var LEVELS = require(path.join(__dirname, '..', 'levels.js'));
var SOL = require(path.join(__dirname, '..', 'solutions.js'));

var bad = 0, three = 0;
LEVELS.forEach(function (L, i) {
  var plan = SOL[i];
  var idle = Sim.run(L, []);
  if (!L.stars || L.stars.length !== 3) { console.log('#' + (i + 1) + ' needs exactly 3 stars'); bad++; }
  if (!plan) { console.log('#' + (i + 1) + ' ' + L.name + ': NO SOLUTION'); bad++; return; }
  var r = Sim.run(L, plan);
  var ok = r.state === 'won';
  if (!ok) bad++;
  if (r.stars === 3) three++;
  if (idle.state === 'won') { bad++; console.log('#' + (i + 1) + ' wins with no input!'); }
  console.log(('#' + (i + 1)).padEnd(4) + L.name.padEnd(20) + (ok ? 'OK  ' : 'FAIL') + '  stars ' + r.stars + '  actions ' + plan.length + '  time ' + (r.frame / 60).toFixed(1) + 's');
});
console.log(LEVELS.length + ' levels, ' + (LEVELS.length - bad) + ' solvable, ' + three + ' with a recorded 3-star solution');
process.exit(bad ? 1 : 0);
