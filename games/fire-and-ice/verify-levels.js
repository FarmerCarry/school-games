#!/usr/bin/env node
/*
 * Fire & Ice — level verifier (development tool, not loaded by the game).
 *   node games/fire-and-ice/verify-levels.js [levelNumber] [--map]
 * Runs the scripted solutions in solutions.js through the real engine and
 * checks that both players reach their doors with every gem collected
 * and that the par time is beatable.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = __dirname;
const ctx = { console, Math, Object, Array, JSON, Error, Uint8Array };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['engine.js', 'levels.js', 'bot.js', 'solutions.js']) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
}
const FI = ctx.FI;
const only = process.argv[2] && !process.argv[2].startsWith('--') ? Number(process.argv[2]) : null;
const showMap = process.argv.includes('--map');
let fails = 0;
FI.LEVELS.forEach((def, i) => {
  const n = i + 1;
  if (only && n !== only) return;
  const rows = def.map;
  const bad = rows.findIndex(r => r.length !== rows[0].length);
  if (bad >= 0) { console.log(`L${n} ${def.name}: row ${bad} has length ${rows[bad].length}, expected ${rows[0].length}`); fails++; return; }
  if (showMap) {
    console.log('   ' + [...Array(rows[0].length).keys()].map(k => k % 10).join(''));
    rows.forEach((r, y) => console.log(String(y).padStart(2) + ' ' + r));
  }
  let w;
  try { w = FI.build(def, i); } catch (e) { console.log(`L${n}: build error ${e.message}`); fails++; return; }
  const sol = FI.SOLUTIONS && FI.SOLUTIONS[n];
  if (!sol) { console.log(`L${n} ${def.name}: ${rows[0].length}x${rows.length} NO SOLUTION YET (gems ${w.gemsTotal.fire}/${w.gemsTotal.ice})`); fails++; return; }
  const bot = new FI.Runner(sol);
  const pos = p => `${p.kind}@(${((p.x + p.w / 2) / 32).toFixed(1)},${((p.y + p.h) / 32).toFixed(2)})${p.alive ? '' : ' DEAD'}`;
  let f = 0, err = null;
  try {
    while (w.state === 'play' && f < 60 * 400) {
      const inp = FI.botInput();
      const bi = bot.i;
      bot.tick(w, inp);
      if (process.env.TRACE && bot.i !== bi) console.log('   cmd', bi, JSON.stringify(sol[bi].slice(0,3)), 'f=' + f, pos(w.fire), pos(w.ice));
      FI.step(w, inp, 1 / 60);
      w.events.length = 0;
      f++;
      if (bot.done() && w.state === 'play') { f += 0; break; }
    }
  } catch (e) { err = e.message; }
  // let the win timer finish if both are standing at doors
  for (let k = 0; k < 60 && w.state === 'play'; k++) { FI.step(w, FI.botInput(), 1 / 60); }
  const gemsOk = w.gemsGot.fire === w.gemsTotal.fire && w.gemsGot.ice === w.gemsTotal.ice;
  const ok = w.state === 'won' && gemsOk && w.t <= def.par;
  if (!ok) fails++;
  console.log(`L${n} ${def.name.padEnd(22)} ${ok ? 'OK  ' : 'FAIL'} state=${w.state} t=${w.t.toFixed(1)}s par=${def.par} ` +
    `gems F${w.gemsGot.fire}/${w.gemsTotal.fire} I${w.gemsGot.ice}/${w.gemsTotal.ice} step=${bot.i}/${sol.length} ${pos(w.fire)} ${pos(w.ice)}` +
    (w.deadCause ? ' cause=' + w.deadCause : '') + (err ? ' ERR ' + err : '') +
    (gemsOk ? '' : ' missing: ' + w.gems.filter(g => !g.got).map(g => g.kind[0] + '(' + ((g.x - 16) / 32) + ',' + ((g.y - 16) / 32) + ')').join(' ')));
});
process.exit(fails ? 1 : 0);
