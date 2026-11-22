#!/usr/bin/env node
/*
 * Fire & Ice (النار والجليد) — automated level verifier (dev tool, not loaded by index.html).
 *   node games/fire-and-ice/verify-levels.js [levelNumber] [--map]
 * Loads engine.js, levels.js and solutions.js via vm.runInContext and replays every
 * level's scripted solution through the real deterministic engine, verifying that:
 *   1. Every map row has uniform width and valid spawns/doors.
 *   2. Both heroes reach their doors simultaneously (state === 'won').
 *   3. Every Fire & Ice gem is collected (100% gems).
 *   4. Clear time is within the level's par time.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const ctx = { console, Math, Object, Array, JSON, Error, Uint8Array, Number, String, Boolean, isFinite };
ctx.globalThis = ctx;
vm.createContext(ctx);

for (const f of ['engine.js', 'levels.js', 'solutions.js']) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
}

const FI = ctx.FI;
const T = FI.T;

function emptyInput() {
  return {
    fire: { l: false, r: false, j: false },
    ice: { l: false, r: false, j: false }
  };
}

function makeRunner(steps) {
  let idx = 0;
  let state = null;

  function stepCmd(cmd, st, w, inp) {
    const op = cmd[0];
    if (op === 'wait') {
      st.f = (st.f || 0) + 1;
      return st.f >= Math.ceil((cmd[1] || 0.2) * 60);
    }
    if (op === 'plat') {
      const p = w.platforms[cmd[1]];
      if (!p) return true;
      const tol = cmd[3] != null ? cmd[3] : 0.08;
      return Math.abs(p.prog - cmd[2]) <= tol;
    }
    if (op === 'par') {
      if (!st.a) st.a = {};
      if (!st.b) st.b = {};
      if (!st.da) st.da = stepCmd(cmd[1], st.a, w, inp);
      if (!st.db) st.db = stepCmd(cmd[2], st.b, w, inp);
      return st.da && st.db;
    }

    const kind = op === 'f' ? 'fire' : 'ice';
    const act = cmd[1];
    const h = w[kind];
    const hi = inp[kind];
    const cx = h.x + h.w / 2;
    st.f = (st.f || 0) + 1;

    if (act === 'go' || act === 'door') {
      const tx = act === 'door' ? (w.doors[kind].x + w.doors[kind].w / 2) : ((cmd[2] + 0.5) * T);
      const dx = tx - cx;
      if (Math.abs(dx) <= 4 && Math.abs(h.vx) < 40) return true;
      if (dx > 3) hi.r = true;
      else if (dx < -3) hi.l = true;
      return Math.abs(dx) <= 4;
    }

    if (act === 'jmp') {
      // ['f'|'i', 'jmp', targetCol, holdFrames?]
      const tx = (cmd[2] + 0.5) * T;
      const hold = cmd[3] != null ? cmd[3] : 24;
      const dx = tx - cx;
      if (!st.launched) {
        if (h.grounded) {
          hi.j = true;
          st.launched = true;
          st.airF = 0;
        }
      } else {
        st.airF++;
        if (st.airF < hold) hi.j = true;
      }
      if (dx > 4) hi.r = true;
      else if (dx < -4) hi.l = true;
      return st.launched && st.airF >= 6 && h.grounded && Math.abs(dx) <= 12;
    }

    if (act === 'rjmp') {
      // ['f'|'i', 'rjmp', takeoffCol, targetCol, holdFrames?]
      // Run at full speed toward takeoffCol, jump immediately upon reaching it, steer to targetCol.
      const takeX = (cmd[2] + 0.5) * T;
      const landX = (cmd[3] + 0.5) * T;
      const hold = cmd[4] != null ? cmd[4] : 24;
      const dir = landX >= takeX ? 1 : -1;
      if (!st.launched) {
        if (dir > 0) {
          hi.r = true;
          if (cx >= takeX - 4 && h.grounded) { hi.j = true; st.launched = true; st.airF = 0; }
        } else {
          hi.l = true;
          if (cx <= takeX + 4 && h.grounded) { hi.j = true; st.launched = true; st.airF = 0; }
        }
      } else {
        st.airF++;
        if (st.airF < hold) hi.j = true;
        const dx = landX - cx;
        if (dx > 4) hi.r = true;
        else if (dx < -4) hi.l = true;
      }
      return st.launched && st.airF >= 6 && h.grounded && Math.abs(landX - cx) <= 12;
    }

    if (act === 'hop') {
      // ['f'|'i', 'hop', dir, holdFrames?, targetCol?]
      const dir = cmd[2] | 0;
      const hold = cmd[3] != null ? cmd[3] : 22;
      const tCol = cmd[4];
      if (!st.launched) {
        if (h.grounded) {
          hi.j = true;
          st.launched = true;
          st.airF = 0;
        }
      } else {
        st.airF++;
        if (st.airF < hold) hi.j = true;
      }
      if (tCol != null) {
        const tx = (tCol + 0.5) * T;
        if (tx - cx > 4) hi.r = true;
        else if (tx - cx < -4) hi.l = true;
        return st.launched && st.airF >= 6 && h.grounded && Math.abs(tx - cx) <= 10;
      } else {
        if (dir > 0) hi.r = true;
        else if (dir < 0) hi.l = true;
        return st.launched && st.airF >= 6 && h.grounded;
      }
    }

    if (act === 'push') {
      // ['f'|'i', 'push', boxIdx, targetCol]
      const b = w.boxes[cmd[2]];
      if (!b) return true;
      const btx = (cmd[3] + 0.5) * T;
      const bcx = b.x + b.w / 2;
      const bdx = btx - bcx;
      if (Math.abs(bdx) <= 5) return true;
      const dir = bdx > 0 ? 1 : -1;
      // Walk into the pushing side of the box
      if (dir > 0) {
        if (cx > bcx) {
          // Need to get to the left side first
          hi.l = true;
        } else {
          hi.r = true;
        }
      } else {
        if (cx < bcx) {
          hi.r = true;
        } else {
          hi.l = true;
        }
      }
      return false;
    }

    if (act === 'hold') {
      // ['f'|'i', 'hold', dir, frames, jump?]
      const dir = cmd[2] | 0;
      const frames = cmd[3] | 0;
      if (dir > 0) hi.r = true;
      else if (dir < 0) hi.l = true;
      if (cmd[4]) hi.j = true;
      return st.f >= frames;
    }

    if (act === 'waitY') {
      // ['f'|'i', 'waitY', row, tol?]
      const ty = cmd[2] * T;
      const tol = (cmd[3] != null ? cmd[3] : 0.08) * T;
      return Math.abs((h.y + h.h) - ty) <= tol;
    }

    throw new Error('Unknown command: ' + JSON.stringify(cmd));
  }

  return {
    get i() { return idx; },
    done() { return idx >= steps.length; },
    tick(w, inp) {
      if (idx >= steps.length) return;
      if (!state) state = {};
      const cmd = steps[idx];
      if (stepCmd(cmd, state, w, inp)) {
        idx++;
        state = null;
      } else if (state.f > 60 * 14) {
        throw new Error('Step ' + idx + ' timed out: ' + JSON.stringify(cmd));
      }
    }
  };
}

const arg = process.argv[2] && !process.argv[2].startsWith('--') ? Number(process.argv[2]) : null;
const showMap = process.argv.includes('--map');
if (arg !== null && !(Number.isInteger(arg) && arg >= 1 && arg <= FI.LEVELS.length)) {
  console.error(`Usage: node games/fire-and-ice/verify-levels.js [1-${FI.LEVELS.length}] [--map]`);
  process.exit(2);
}

let fails = 0;
FI.LEVELS.forEach((def, i) => {
  const n = i + 1;
  if (arg && n !== arg) return;
  const rows = def.map;
  const bad = rows.findIndex(r => r.length !== rows[0].length);
  if (bad >= 0) {
    console.log(`L${n} ${def.name}: FAIL row ${bad} length ${rows[bad].length}, expected ${rows[0].length}`);
    fails++;
    return;
  }
  if (showMap) {
    console.log('   ' + [...Array(rows[0].length).keys()].map(k => k % 10).join(''));
    rows.forEach((r, y) => console.log(String(y).padStart(2) + ' ' + r));
  }
  let w;
  try {
    w = FI.build(def, i);
  } catch (e) {
    console.log(`L${n} ${def.name}: FAIL build error ${e.message}`);
    fails++;
    return;
  }
  const sol = FI.SOLUTIONS && FI.SOLUTIONS[n];
  if (!sol) {
    console.log(`L${n} ${def.name}: FAIL NO SOLUTION (gems F${w.gemsTotal.fire}/I${w.gemsTotal.ice})`);
    fails++;
    return;
  }

  const bot = makeRunner(sol);
  const pos = p => `${p.kind[0]}@(${((p.x + p.w / 2) / T).toFixed(1)},${((p.y + p.h) / T).toFixed(1)})${p.alive ? '' : ' DEAD'}`;
  let f = 0;
  let err = null;
  try {
    while (w.state === 'play' && f < 60 * 180) {
      const inp = emptyInput();
      const bi = bot.i;
      bot.tick(w, inp);
      if (process.env.TRACE && bot.i !== bi) {
        console.log('  step', bi, JSON.stringify(sol[bi]), 't=' + w.t.toFixed(2), pos(w.fire), pos(w.ice));
      }
      FI.step(w, inp, 1 / 60);
      w.events.length = 0;
      f++;
      if (bot.done() && w.state === 'play') break;
    }
  } catch (e) {
    err = e.message;
  }

  // Let win hold timer complete while both stand at doors
  for (let k = 0; k < 45 && w.state === 'play'; k++) {
    FI.step(w, emptyInput(), 1 / 60);
    w.events.length = 0;
  }

  const gemsOk = w.gemsGot.fire === w.gemsTotal.fire && w.gemsGot.ice === w.gemsTotal.ice;
  const timeOk = w.t <= def.par;
  const ok = w.state === 'won' && gemsOk && timeOk && !err;
  if (!ok) fails++;
  const missing = gemsOk ? '' : ' missing:' + w.gems.filter(g => !g.got).map(g => `${g.kind[0]}(${g.gx},${g.gy})`).join(' ');
  console.log(
    `L${n} ${def.name.padEnd(20)} ${ok ? 'OK  ' : 'FAIL'} state=${w.state} t=${w.t.toFixed(1)}s par=${def.par} ` +
    `gems F${w.gemsGot.fire}/${w.gemsTotal.fire} I${w.gemsGot.ice}/${w.gemsTotal.ice} step=${bot.i}/${sol.length} ` +
    `${pos(w.fire)} ${pos(w.ice)}` +
    (w.deadCause ? ` cause=${w.deadCause}` : '') +
    (err ? ` ERR=${err}` : '') +
    missing
  );
});

console.log(fails ? `${fails} LEVEL(S) FAILED` : 'ALL LEVELS SOLVED');
process.exit(fails ? 1 : 0);
