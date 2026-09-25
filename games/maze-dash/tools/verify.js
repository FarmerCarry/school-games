#!/usr/bin/env node
/*
 * Maze Dash level verifier (development tool, not loaded by the game).
 *   node games/maze-dash/tools/verify.js [levelNumber] [--map]
 * Checks every level parses (13 wide, rectangular, one start, one exit) and
 * that a greedy planner using the real dash rules can collect every dot and
 * coin and reach the exit. Timed hazards (bats, traps, puffers) are assumed
 * avoidable by waiting; moving blocks are simulated exactly.
 * The in-browser autoplayer (window.__game.autoplay) re-checks each level with
 * real hazard timing.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const dir = path.join(__dirname, '..');
const ctx = { console, Math, Object, Array, JSON, Uint8Array };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['core.js', 'levels.js']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
const C = ctx.MDCore, LEVELS = ctx.MD_LEVELS;
const only = process.argv[2] && !process.argv[2].startsWith('--') ? Number(process.argv[2]) : null;
const showMap = process.argv.includes('--map');
let fails = 0;
LEVELS.forEach((def, i) => {
  const n = i + 1;
  if (only && n !== only) return;
  const rows = def.map;
  const bad = rows.findIndex(r => r.length !== 13);
  const probs = [];
  if (bad >= 0) probs.push(`row ${bad} length ${rows[bad].length}`);
  const all = rows.join('');
  if ((all.match(/P/g) || []).length !== 1) probs.push('needs exactly one P');
  if ((all.match(/E/g) || []).length !== 1) probs.push('needs exactly one E');
  rows.forEach((r, y) => { if (r[0] !== '#' && r[0] !== 'X' || r[12] !== '#' && r[12] !== 'X') probs.push('border open at row ' + y); });
  if (rows[0] !== '#############' || rows[rows.length - 1] !== '#############') probs.push('top/bottom border');
  const r = C.verifyLevel(def);
  const tag = r.allItems ? 'OK ' : (r.ok ? 'MISS' : 'FAIL');
  if (!r.allItems || probs.length) fails++;
  const est = (r.dist / C.TIMING.DASH_SPEED + r.moves * 0.45 + r.waits * C.TIMING.BLOCK_STEP);
  console.log(`L${String(n).padStart(2)} ${tag} ${def.name.padEnd(18)} ${rows.length}r dots ${r.dots} coins ${r.coins} moves ${r.moves} waits ${r.waits} est ${est.toFixed(1)}s par ${def.par}` +
    (r.missing.length ? ' missing ' + r.missing.map(m => `(${m.x},${m.y})`).join(' ') : '') + (probs.length ? ' PROBLEMS: ' + probs.join('; ') : '') +
    (def.par && def.par < est * 1.2 ? ' PAR-TIGHT' : ''));
  if (showMap || (!r.allItems && only)) {
    const miss = new Set(r.missing.map(m => m.x + ',' + m.y));
    // static reachability: rest points (R) and cells passed (lowercase-ish marks)
    const L = r.L, G = C.levelGrid(L), rest = new Set(), passed = new Set(), q = [[L.start.x, L.start.y]];
    rest.add(L.start.x + ',' + L.start.y);
    while (q.length) {
      const [x, y] = q.shift();
      for (let d = 0; d < 4; d++) {
        const m = C.dash(G, x, y, d, null);
        if (!m || m.dead) continue;
        m.cells.forEach(c => passed.add((c % 64) + ',' + (Math.floor(c / 64) - 8192)));
        if (m.exit) continue;
        const k = m.x + ',' + m.y;
        if (!rest.has(k)) { rest.add(k); q.push([m.x, m.y]); }
      }
    }
    console.log('    ' + [...Array(13).keys()].map(k => k % 10).join('') + '     ' + [...Array(13).keys()].map(k => k % 10).join(''));
    rows.forEach((row, y) => console.log(String(y).padStart(3) + ' ' + [...row].map((c, x) => miss.has(x + ',' + y) ? '!' : c).join('') + '     ' +
      [...row].map((c, x) => rest.has(x + ',' + y) ? 'R' : passed.has(x + ',' + y) ? (c === '#' ? '?' : '+') : (C.isSolid(L.tiles[y * 13 + x]) ? c : ' ')).join('')));
  }
});
console.log(fails ? `${fails} level(s) with problems` : 'all levels OK');
process.exit(fails ? 1 : 0);
