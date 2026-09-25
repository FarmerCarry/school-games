/*
 * Level verifier (developer tool, not loaded by the game).
 *   node games/troll-level/verify.js            -> replay every solution
 *   node games/troll-level/verify.js 7 map      -> print level 7's map
 *   node games/troll-level/verify.js 7 trace "R60 RJ20"  -> trace a custom input
 * Each level's solution must WIN, and the naive "hold right" run should die
 * (so every level actually has a trap).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = __dirname;
const ctx = { console, Math };
ctx.globalThis = ctx;
vm.createContext(ctx);
['engine.js', 'levels.js', 'solutions.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
const E = ctx.TrollEngine, LV = ctx.TrollLevels.LEVELS, SOL = ctx.TrollSolutions;

const args = process.argv.slice(2);
if (args[1] === 'map') {
  const m = LV[+args[0] - 1].map;
  console.log('    ' + Array.from({ length: 32 }, (_, i) => (i % 10)).join(''));
  m.forEach((r, i) => console.log(String(i).padStart(2) + '  ' + r));
  process.exit(0);
}
if (args[1] === 'trace') {
  const r = E.simulate(LV[+args[0] - 1], args[2], { trace: +(args[3] || 6), log: console.log, extra: 60 });
  console.log(JSON.stringify(r));
  process.exit(0);
}
if (args[1] === 'search') {
  // node verify.js 2 search "R{X} RJ20 R200" 40 120  -> which X values win
  const wins = [];
  for (let x = +args[3]; x <= +args[4]; x++) {
    const r = E.simulate(LV[+args[0] - 1], args[2].replace(/\{X\}/g, x));
    if (r.result === 'win') wins.push(x);
  }
  console.log('wins for X =', wins.join(' '));
  process.exit(0);
}
let bad = 0;
LV.forEach((lv, i) => {
  if (lv.map.length !== 18 || lv.map.some(r => r.length !== 32)) { console.log('BAD MAP SIZE', i + 1); bad++; }
  const sol = SOL[i];
  const r = sol ? E.simulate(lv, sol) : { result: 'nosolution' };
  const naive = E.simulate(lv, 'R900', { extra: 0 });
  const ok = r.result === 'win';
  if (!ok) bad++;
  console.log(`${String(i + 1).padStart(2)} ${lv.name.padEnd(16)} solution:${r.result}${r.result === 'win' ? ' ' + r.seconds + 's' : ' ' + (r.cause || '') + ' @' + (r.x || 0).toFixed(2) + ',' + (r.y || 0).toFixed(2)}  naive-right:${naive.result}${naive.cause ? '(' + naive.cause + ')' : ''}`);
});
console.log(bad ? `\n${bad} PROBLEM(S)` : '\nALL LEVELS BEATABLE');
process.exit(bad ? 1 : 0);
