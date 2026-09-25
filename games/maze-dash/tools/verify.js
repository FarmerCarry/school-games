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
  // Exhaustive state search (player rest cell + exact block state, blocks
  // reverse when they would hit the player). Proves: the exit is reachable,
  // every dot/coin can be collected on some path that can still finish,
  // and no reachable state is a dead end (soft lock).
  {
    const L0 = C.parseLevel(def), G0 = C.levelGrid(L0), K = C.key;
    const b0 = L0.blocks.map(b => ({ x: b.x, y: b.y, dx: b.dx, dy: b.dy }));
    const enc = (x, y, bl) => x + ',' + y + '|' + bl.map(b => b.x + ',' + b.y + ',' + b.dx + ',' + b.dy).join(';');
    const idx = new Map(), states = [], edges = [], exitEdge = [];
    function add(x, y, bl) { const k = enc(x, y, bl); let i = idx.get(k); if (i === undefined) { i = states.length; idx.set(k, i); states.push({ x, y, bl }); edges.push([]); exitEdge.push(null); } return i; }
    add(L0.start.x, L0.start.y, b0);
    for (let h = 0; h < states.length && states.length < 400000; h++) {
      const st = states[h], snap = {};
      st.bl.forEach(b => { snap[K(b.x, b.y)] = 1; });
      for (let d = 0; d < 4; d++) {
        const m = C.dash(G0, st.x, st.y, d, snap);
        if (!m || m.dead) continue;
        if (m.exit) { exitEdge[h] = (exitEdge[h] || []).concat([m.cells]); continue; }
        edges[h].push([add(m.x, m.y, st.bl), m.cells]);
      }
      if (st.bl.length) {
        const bl = st.bl.map(b => ({ x: b.x, y: b.y, dx: b.dx, dy: b.dy }));
        C.stepBlocks(G0, bl, (x, y) => x === st.x && y === st.y);
        edges[h].push([add(st.x, st.y, bl), []]);
      }
    }
    // good = can reach exit
    const good = new Uint8Array(states.length); let changed = true;
    for (let i = 0; i < states.length; i++) if (exitEdge[i]) good[i] = 1;
    while (changed) { changed = false; for (let i = 0; i < states.length; i++) if (!good[i]) for (const [j] of edges[i]) if (good[j]) { good[i] = 1; changed = true; break; } }
    if (!good[0]) probs.push('EXIT UNREACHABLE');
    const got = new Set();
    for (let i = 0; i < states.length; i++) {
      for (const [j, cells] of edges[i]) if (good[j]) cells.forEach(c => got.add(c));
      if (exitEdge[i]) exitEdge[i].forEach(cells => cells.forEach(c => got.add(c)));
    }
    const unget = [];
    for (let y = 0; y < L0.h; y++) for (let x = 0; x < L0.w; x++) { const it = L0.items[y * L0.w + x]; if (it && !got.has(K(x, y))) unget.push(`(${x},${y})`); }
    if (unget.length) probs.push('uncollectable ' + unget.join(' '));
    const deadCells = new Set();
    for (let i = 0; i < states.length; i++) if (!good[i]) deadCells.add(`(${states[i].x},${states[i].y})`);
    if (deadCells.size) probs.push('dead-end rest points ' + [...deadCells].join(' '));
    r.states = states.length;
  }
  const tag = probs.length ? 'BAD ' : 'OK  ';
  if (probs.length) fails++;
  const est = (r.dist / C.TIMING.DASH_SPEED + r.moves * 0.45 + r.waits * C.TIMING.BLOCK_STEP);
  console.log(`L${String(n).padStart(2)} ${tag} ${def.name.padEnd(18)} ${rows.length}r dots ${r.dots} coins ${r.coins} states ${r.states} greedy:${r.allItems ? 'all' : 'no'} moves ${r.moves} waits ${r.waits} est ${est.toFixed(1)}s par ${def.par}` +
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
