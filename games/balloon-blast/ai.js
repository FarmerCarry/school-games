/* Balloon Blast bots. Every think builds a danger map (fuse plus chain),
 * flees with BFS when its cell will be splashed, and only drops a balloon
 * when a safe cell still exists afterwards. */
(function (BBAI) {
  'use strict';
  const BLB = globalThis.BLB;
  const COLS = 15, ROWS = 11, N = COLS * ROWS, TILE = 48;
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const DELAY = [0.45, 0.36, 0.27, 0.18, 0.12];
  const LOOK = [0.8, 1.1, 1.45, 1.9, 2.35];
  const GREED = [0.2, 0.38, 0.55, 0.74, 0.9];
  const AGGR = [0.18, 0.36, 0.55, 0.74, 0.92];
  const KICKP = [0, 0.1, 0.34, 0.6, 0.86];
  // Tier 1–2 fumble on purpose. From tier 3 the only reckless drops are rare noise.
  const NOISE = [0.12, 0.05, 0.008, 0.004, 0.002];

  function idx(c, r) { return r * COLS + c; }
// Danger rays keep going through crates. A crate that breaks can lengthen a later
// splash in the same chain, and treating that as already open keeps bots out of it.
function dangerCells(w, c, r, range) {
  const cells = [{ c: c, r: r }];
  for (let d = 0; d < 4; d++) {
    for (let i = 1; i <= range; i++) {
      const cc = c + DIRS[d][0] * i, rr = r + DIRS[d][1] * i;
      const t = BLB.tile(w, cc, rr);
      if (t === BLB.PILLAR || t === BLB.JELLY || !inside(cc, rr)) break;
      cells.push({ c: cc, r: rr });
    }
  }
  return cells;
}
  function inside(c, r) { return c >= 0 && r >= 0 && c < COLS && r < ROWS; }
  function tierOf(p) { return Math.max(1, Math.min(5, p.tier || 1)) - 1; }

  function predict(w, b) {
    if (b.slide < 0) return { c: b.c, r: b.r, fuse: Math.max(0, b.fuse), range: b.range, id: b.id };
    let x = b.x, y = b.y, c = b.c, r = b.r;
    const dc = DIRS[b.slide][0], dr = DIRS[b.slide][1];
    const fuse = Math.max(0, b.fuse);
    const steps = Math.max(1, Math.ceil(fuse / 0.05));
    const dt = fuse / steps;
    for (let s = 0; s < steps; s++) {
      const nx = x + dc * BLB.KICK * dt, ny = y + dr * BLB.KICK * dt;
      const nc = Math.floor(nx / TILE), nr = Math.floor(ny / TILE);
      if (BLB.tile(w, nc, nr) === BLB.PILLAR || BLB.tile(w, nc, nr) === BLB.CRATE || BLB.tile(w, nc, nr) === BLB.JELLY) break;
      let hit = false;
      for (let i = 0; i < w.balloons.length; i++) {
        const o = w.balloons[i];
        if (o !== b && !o.gone && o.c === nc && o.r === nr) hit = true;
      }
      if (hit) break;
      x = nx; y = ny; c = nc; r = nr;
    }
    return { c: c, r: r, fuse: fuse, range: b.range, id: b.id };
  }

  // Time until a splash covers each cell. Infinity means the cell stays safe.
  BBAI.danger = function (w, extra) {
    const bombs = [];
    for (let i = 0; i < w.balloons.length; i++) if (!w.balloons[i].gone) bombs.push(predict(w, w.balloons[i]));
    if (extra) bombs.push(extra);
    const when = new Float64Array(bombs.length);
    for (let i = 0; i < bombs.length; i++) when[i] = bombs[i].fuse;
    const danger = new Float64Array(N);
    danger.fill(Infinity);
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (let i = 0; i < bombs.length; i++) {
        const cells = dangerCells(w, bombs[i].c, bombs[i].r, bombs[i].range);
        for (let k = 0; k < cells.length; k++) {
          const cell = cells[k];
          const at = idx(cell.c, cell.r);
          if (when[i] < danger[at]) danger[at] = when[i];
          for (let j = 0; j < bombs.length; j++) {
            if (j !== i && bombs[j].c === cell.c && bombs[j].r === cell.r && when[i] < when[j] - 1e-4) {
              when[j] = when[i];
              changed = true;
            }
          }
        }
      }
      if (!changed && pass > 0) break;
    }
    return danger;
  };

  function walkable(w, c, r, ignoreBalloonAt) {
    if (!inside(c, r)) return false;
    const t = BLB.tile(w, c, r);
    if (t === BLB.PILLAR || t === BLB.CRATE || t === BLB.JELLY) return false;
    for (let i = 0; i < w.balloons.length; i++) {
      const b = w.balloons[i];
      if (b.gone || (b.c === c && b.r === r && ignoreBalloonAt && ignoreBalloonAt.c === c && ignoreBalloonAt.r === r)) continue;
      if (b.c === c && b.r === r) return false;
    }
    return true;
  }

// First step toward a refuge. A drop is safe only when some cell is never splashed
// (forever). Fleeing an existing fuse can also stop on the cell that blows latest.
function fleeStep(w, p, danger, opts) {
  opts = opts || {};
  const forever = !!opts.forever;
  const stand = opts.stand == null ? 0.5 : opts.stand;
  const start = BLB.cellOf(p);
  const stepT = TILE / BLB.speedOf(p);
  const q = [[start.c, start.r, 0]];
  const seen = new Uint8Array(N);
  const parent = new Int16Array(N);
  parent.fill(-1);
  seen[idx(start.c, start.r)] = 1;
  let found = -1, goalC = -1, goalR = -1;
  let best = -1, bestT = -1;
  while (q.length) {
    const cur = q.shift();
    const c = cur[0], r = cur[1], dist = cur[2];
    const arrive = dist * stepT;
    const dang = danger[idx(c, r)];
    if (dist > 0 && arrive > dang - 0.06) continue;
    const refuge = dang === Infinity || (!forever && dist > 0 && dang > arrive + stand);
    if (refuge && (dang === Infinity || dist > 0)) { found = idx(c, r); goalC = c; goalR = r; break; }
    if (dist > 0 && dang > bestT) { bestT = dang; best = idx(c, r); }
    if (dist >= (opts.maxDist || 12)) continue;
    for (let d = 0; d < 4; d++) {
      const nc = c + DIRS[d][0], nr = r + DIRS[d][1];
      if (!walkable(w, nc, nr, null)) continue;
      const ni = idx(nc, nr);
      if (seen[ni]) continue;
      seen[ni] = 1;
      parent[ni] = idx(c, r);
      q.push([nc, nr, dist + 1]);
    }
  }
  if (found < 0) found = forever ? -1 : best;
  if (found < 0) return null;
  let at = found;
  const startI = idx(start.c, start.r);
  if (at === startI) return null;
  while (parent[at] !== -1 && parent[at] !== startI) at = parent[at];
  return { c: at % COLS, r: Math.floor(at / COLS), goalC: goalC, goalR: goalR, stay: false };
}
  BBAI.fleeStep = fleeStep;

  function canEscape(w, p) {
    const here = BLB.cellOf(p);
    const extra = { c: here.c, r: here.r, fuse: BLB.FUSE, range: p.range, id: -1 };
const danger = BBAI.danger(w, extra);
  // Only bomb when a neighbouring cell is already outside every splash, so the
// bot steps out of its own plus instead of hoping a corridor stays clear.
return fleeStep(w, p, danger, { forever: true, maxDist: 2 });
  }
  BBAI.canEscape = canEscape;

function dirToward(p, c, r) {
  const here = BLB.cellOf(p);
  // One axis at a time, toward the next cell. The engine nudges the other axis
  // into the lane; doing it here made bots shimmy in place until their own fuse.
  if (here.c !== c) return { x: Math.sign(c - here.c), y: 0 };
  if (here.r !== r) return { x: 0, y: Math.sign(r - here.r) };
  const cx = (here.c + 0.5) * TILE, cy = (here.r + 0.5) * TILE;
  if (Math.abs(p.x - cx) > 4) return { x: Math.sign(cx - p.x), y: 0 };
  if (Math.abs(p.y - cy) > 4) return { x: 0, y: Math.sign(cy - p.y) };
  return { x: 0, y: 0 };
}

  function nearestFoe(w, p) {
    const here = BLB.cellOf(p);
    let best = null, bd = 1e9;
    for (let i = 0; i < w.players.length; i++) {
      const o = w.players[i];
      if (o === p || o.team === p.team || o.state === 'out') continue;
      const c = BLB.cellOf(o);
      const d = Math.abs(c.c - here.c) + Math.abs(c.r - here.r);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  function nearestDrop(w, p) {
    const here = BLB.cellOf(p);
    let best = null, bd = 1e9;
    for (let i = 0; i < w.drops.length; i++) {
      const d = w.drops[i];
      if (d.dead || d.kind === 'slow') continue;
      const dist = Math.abs(d.c - here.c) + Math.abs(d.r - here.r);
      if (dist < bd) { bd = dist; best = d; }
    }
    return bd <= 10 ? best : null;
  }

  function nearestCrate(w, p) {
    const here = BLB.cellOf(p);
    let best = null, bd = 1e9;
    for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
      if (BLB.tile(w, c, r) !== BLB.CRATE) continue;
      const dist = Math.abs(c - here.c) + Math.abs(r - here.r);
      if (dist < bd) { bd = dist; best = { c: c, r: r }; }
    }
    return best;
  }

  // A cell next to a crate, or lined up with a foe, where a balloon would reach.
  function bombCell(w, p, foe) {
    const here = BLB.cellOf(p);
    if (!foe || foe.state === 'out') return null;
    const fc = BLB.cellOf(foe);
    if (fc.c === here.c || fc.r === here.r) {
      const dist = Math.abs(fc.c - here.c) + Math.abs(fc.r - here.r);
      if (dist >= 1 && dist <= p.range + (foe.state === 'bubble' ? 0 : 1)) return here;
    }
    return null;
  }

  function think(w, p) {
    const ti = tierOf(p);
    const here = BLB.cellOf(p);
    const danger = BBAI.danger(w);
    const look = LOOK[ti];
    const hereD = danger[idx(here.c, here.r)];
    p.urgent = hereD < BLB.FUSE + 0.2;
    // A cell that a splash will reach is never a place to keep standing. Lookahead
    // only changes how early a tier bothers with a fuse that is still long.
    if (hereD < Math.max(look, BLB.FUSE + 0.15)) {
      const step = fleeStep(w, p, danger, { forever: true }) || fleeStep(w, p, danger, { stand: 0.8 });
      if (step && !step.stay) {
        const d = dirToward(p, step.c, step.r);
        return { x: d.x, y: d.y, drop: false, kick: false };
      }
      return { x: 0, y: 0, drop: false, kick: false };
    }
    const rand = w.rand;
    let goal = null;
    if (rand() < GREED[ti]) {
      const drop = nearestDrop(w, p);
      if (drop) goal = { c: drop.c, r: drop.r, bomb: false };
    }
    const foe = nearestFoe(w, p);
    if (!goal && foe && rand() < AGGR[ti]) {
      const lined = bombCell(w, p, foe);
      if (lined) goal = { c: lined.c, r: lined.r, bomb: true };
      else {
        const fc = BLB.cellOf(foe);
        goal = { c: fc.c, r: fc.r, bomb: false };
      }
    }
    if (!goal) {
      const crate = nearestCrate(w, p);
      if (crate) {
        // Stand on a free side of the crate.
        let stand = null;
        for (let d = 0; d < 4; d++) {
          const nc = crate.c + DIRS[d][0], nr = crate.r + DIRS[d][1];
          if (walkable(w, nc, nr, null)) { stand = { c: nc, r: nr }; break; }
        }
        goal = stand ? { c: stand.c, r: stand.r, bomb: true, crate: crate } : { c: crate.c, r: crate.r, bomb: false };
      }
    }
    if (!goal) {
      const wander = [[here.c + 2, here.r], [here.c, here.r + 2], [here.c - 2, here.r], [here.c, here.r - 2]];
      const pick = wander[Math.floor(rand() * wander.length)];
      goal = { c: Math.max(1, Math.min(13, pick[0])), r: Math.max(1, Math.min(9, pick[1])), bomb: false };
    }
    let drop = false;
    const onGoal = here.c === goal.c && here.r === goal.r;
    const besideCrate = goal.crate && Math.abs(goal.crate.c - here.c) + Math.abs(goal.crate.r - here.r) === 1;
    if ((goal.bomb && (onGoal || besideCrate)) || (foe && foe.state === 'bubble' && Math.abs(BLB.cellOf(foe).c - here.c) + Math.abs(BLB.cellOf(foe).r - here.r) <= 1)) {
      const escape = canEscape(w, p);
      let contested = false;
      if (escape && escape.goalC >= 0) {
        for (let oi = 0; oi < w.players.length; oi++) {
          const o = w.players[oi];
          if (o === p || o.state !== 'play') continue;
          const oc = BLB.cellOf(o);
          if (Math.abs(oc.c - escape.goalC) + Math.abs(oc.r - escape.goalR) <= 2) contested = true;
        }
      }
      if (escape && !escape.stay && !contested) {
        drop = true;
        goal = { c: escape.goalC >= 0 ? escape.goalC : escape.c, r: escape.goalR >= 0 ? escape.goalR : escape.r, bomb: false };
      } else if (ti < 4 && rand() < NOISE[ti]) drop = true;
    }
    let kick = false;
    if (p.kick && rand() < KICKP[ti]) {
      // Kick when a balloon is sitting in front and the lane is open.
      const dc = DIRS[p.face][0], dr = DIRS[p.face][1];
      for (let i = 0; i < w.balloons.length; i++) {
        const b = w.balloons[i];
        if (!b.gone && b.slide < 0 && b.c === here.c + dc && b.r === here.r + dr) kick = true;
      }
    }
    const move = dirToward(p, goal.c, goal.r);
    const nc = here.c + (move.x || 0), nr = here.r + (move.y || 0);
    if ((move.x || move.y) && inside(nc, nr) && danger[idx(nc, nr)] < hereD) {
      const away = fleeStep(w, p, danger, { forever: true });
      if (away) {
        const d = dirToward(p, away.c, away.r);
        return { x: d.x, y: d.y, drop: false, kick: false };
      }
      return { x: 0, y: 0, drop: false, kick: false };
    }
    return { x: move.x, y: move.y, drop: drop, kick: kick };
  }

  BBAI.inputs = function (w) {
    const out = [];
    for (let i = 0; i < w.players.length; i++) {
      const p = w.players[i];
      if (!p.cpu || p.brain === 'still' || p.brain === 'march' || p.brain === 'sleep' || p.state !== 'play') {
        out.push({ x: 0, y: 0, drop: false, kick: false });
        continue;
      }
      const ti = tierOf(p);
      if (w.time < (p.nextThink || 0)) {
        out.push({ x: p.mx || 0, y: p.my || 0, drop: false, kick: false });
        continue;
      }
      const decision = think(w, p);
      p.mx = decision.x; p.my = decision.y;
      p.nextThink = w.time + (p.urgent ? 0 : DELAY[ti]);
      out.push(decision);
    }
    return out;
  };

  // One human-sized input list: bots filled in, humans left null for the UI to replace.
  BBAI.mix = function (w, humans) {
    const bots = BBAI.inputs(w);
    for (let i = 0; i < w.players.length; i++) if (humans[i]) bots[i] = humans[i];
    return bots;
  };
})(globalThis.BBAI = globalThis.BBAI || {});
