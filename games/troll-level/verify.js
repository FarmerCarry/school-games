/*
 * Level verifier (developer tool, not loaded by the game).
 *   node games/troll-level/verify.js            -> replay every solution
 *   node games/troll-level/verify.js 7 map      -> print level 7's map
 *   node games/troll-level/verify.js 7 trace "R60 RJ20"  -> trace a custom input
 *   node games/troll-level/verify.js only 31-40          -> replay a range of levels
 * Each level's solution must WIN, and the naive "hold right" run must not win
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
// The game's own scripts in page order, minus the browser-only ones (shared kit,
// drawing, controller), so every world file is checked as soon as the page loads it.
const scripts = [...fs.readFileSync(path.join(dir, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)]
  .map(m => m[1]).filter(f => !f.includes('/') && !['art.js', 'game.js'].includes(f));
scripts.forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
const E = ctx.TrollEngine, LV = ctx.TrollLevels.LEVELS, SOL = ctx.TrollSolutions;
const solution = i => LV[i].sol || SOL[i];

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
const [from, to] = args[0] === 'only' ? args[1].split('-').map(Number) : [1, LV.length];
LV.forEach((lv, i) => {
  if (i + 1 < from || i + 1 > (to || from)) return;
  if (lv.map.length !== 18 || lv.map.some(r => r.length !== 32)) { console.log('BAD MAP SIZE', i + 1); bad++; }
  const sol = solution(i);
  const r = sol ? E.simulate(lv, sol) : { result: 'nosolution' };
  const naive = E.simulate(lv, 'R900', { extra: 0 });
  if (r.result !== 'win') bad++;
  if (naive.result === 'win') bad++;
  console.log(`${String(i + 1).padStart(2)} ${lv.name.padEnd(16)} solution:${r.result}${r.result === 'win' ? ' ' + r.seconds + 's' : ' ' + (r.cause || '') + ' @' + (r.x || 0).toFixed(2) + ',' + (r.y || 0).toFixed(2)}  naive-right:${naive.result}${naive.cause ? '(' + naive.cause + ')' : ''}`);
});
console.log(bad ? `\n${bad} PROBLEM(S)` : '\nALL LEVELS BEATABLE');
process.exit(bad ? 1 : 0);
