#!/usr/bin/env node
/*
 * Maze Dash level verifier (development tool, not loaded by the game).
 *   node games/maze-dash/tools/verify.js [levelNumber] [--map]
 *   node games/maze-dash/tools/verify.js --endless [runs]
 * Checks every level parses (13 wide, rectangular, one start, one exit) and
 * that a greedy planner using the real dash rules can collect every dot and
 * coin and reach the exit; moving blocks are simulated exactly. Timed hazards
 * (bats, traps, puffers) are checked with their real timing: every dash the
 * player can make must have safe moments to start it (a bat that patrols
 * along the whole corridor you must dash through is a guaranteed hit).
 * --endless generates random "Rising Goo" mazes and checks that each one can
 * be climbed to 600 m and has no unavoidable hazard on any dash.
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
for (const f of ['core.js', 'levels.js', 'endless.js']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
const C = ctx.MDCore, LEVELS = ctx.MD_LEVELS, TM = C.TIMING;

// Is the player (at float tile position x,y) hit by a timed hazard at time t?
function hazardAt(H, x, y, t) {
  const rad = TM.BAT_RADIUS + TM.PLAYER_RADIUS;
  for (const b of H.bats) { const q = C.batXY(b, t), dx = q.x - x, dy = q.y - y; if (dx * dx + dy * dy < rad * rad) return 'bat'; }
  const cx = Math.round(x), cy = Math.round(y), tr = H.trapMap[C.key(cx, cy)];
  if (tr && C.trapState(tr, t) === 2 && Math.abs(x - cx) < 0.35 && Math.abs(y - cy) < 0.35) return 'trap';
  for (const p of H.puffers) if (Math.abs(p.x - cx) + Math.abs(p.y - cy) === 1 && C.puffState(p, t) === 2 && Math.abs(x - p.x) + Math.abs(y - p.y) < 1.25) return 'puffer';
  return null;
}
// Fraction of start times (over 20 s) at which this dash gets through untouched.
function dashSafeFraction(H, x, y, d, len) {
  const D = C.DIRS[d], dur = len / TM.DASH_SPEED;
  let ok = 0, n = 0;
  for (let t0 = 0; t0 < 20; t0 += 0.05) {
    n++; let bad = null;
    for (let s = 0; s <= dur + 1e-9 && !bad; s += 1 / 96) { const f = Math.min(len, s * TM.DASH_SPEED); bad = hazardAt(H, x + D.dx * f, y + D.dy * f, t0 + s); }
    if (!bad) ok++;
  }
  return ok / n;
}

if (process.argv.includes('--endless')) {
  const runs = Number(process.argv[process.argv.indexOf('--endless') + 1]) || 20, HEIGHT = 600, K = C.key;
  let bad = 0;
  for (let run = 0; run < runs; run++) {
    const w = { rows: {}, bats: [], traps: [], puffers: [], trapMap: {}, pufMap: {},
      ensureRow(y) { let r = this.rows[y]; if (!r) { r = { t: new Uint8Array(13).fill(C.T.WALL), it: new Uint8Array(13), lock: new Uint8Array(13) }; this.rows[y] = r; } return r; },
      addBat(b) { this.bats.push(b); }, addTrap(t) { this.traps.push(t); this.trapMap[K(t.x, t.y)] = t; }, addPuffer(p) { this.puffers.push(p); this.pufMap[K(p.x, p.y)] = p; } };
    const gen = ctx.MDEndless.create(w);
    for (let y = -50; y >= -HEIGHT - 60; y -= 50) gen.fill(y);
    const G = { tile: (x, y) => (x < 0 || x >= 13 || !w.rows[y]) ? C.T.WALL : w.rows[y].t[x], puffer: (x, y) => !!w.pufMap[K(x, y)] };
    const seen = new Set([K(6, 0)]), q = [[6, 0]]; let top = 0, stuck = 0;
    while (q.length) {
      const [x, y] = q.shift(); top = Math.min(top, y);
      for (let d = 0; d < 4; d++) {
        const m = C.dash(G, x, y, d, null);
        if (!m || m.dead) continue;
        if (y > -HEIGHT && dashSafeFraction(w, x, y, d, m.cells.length) === 0) stuck++;
        const k = K(m.x, m.y); if (!seen.has(k)) { seen.add(k); q.push([m.x, m.y]); }
      }
    }
    if (top > -HEIGHT || stuck) { bad++; console.log(`run ${run}: reached ${-top} m, ${stuck} dash(es) with an unavoidable hazard`); }
  }
  console.log(bad ? `${bad}/${runs} endless mazes with problems` : `all ${runs} endless mazes climbable to ${HEIGHT} m with no unavoidable hazards`);
  process.exit(bad ? 1 : 0);
}
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
    // timed hazards: every dash used by a good path needs a safe moment
    if (L0.bats.length || L0.traps.length || L0.puffers.length) {
      const H = { bats: L0.bats, puffers: L0.puffers, trapMap: {} };
      L0.traps.forEach(t => { H.trapMap[K(t.x, t.y)] = t; });
      const tested = new Set(), unsafe = [];
      for (let i = 0; i < states.length; i++) {
        if (!good[i]) continue;
        const st = states[i], snap = {};
        st.bl.forEach(b => { snap[K(b.x, b.y)] = 1; });
        for (let d = 0; d < 4; d++) {
          const m = C.dash(G0, st.x, st.y, d, snap);
          if (!m || m.dead) continue;
          const ek = st.x + ',' + st.y + ',' + d + ',' + m.cells.length;
          if (tested.has(ek)) continue;
          tested.add(ek);
          if (dashSafeFraction(H, st.x, st.y, d, m.cells.length) === 0) unsafe.push(`(${st.x},${st.y})${'URDL'[d]}`);
        }
      }
      if (unsafe.length) probs.push('unavoidable hazard on dash ' + unsafe.join(' '));
    }
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
