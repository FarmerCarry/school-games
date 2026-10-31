/* Balloon Blast — deterministic grid sim. No DOM and no Kit.
 * step(world, dt, inputs[]) moves everyone, burns fuses, and resolves
 * a whole chain of splashes before it returns. */
(function (BLB) {
  'use strict';
  const D = globalThis.BBD;
  const COLS = BLB.COLS = 15, ROWS = BLB.ROWS = 11, TILE = BLB.TILE = 48;
  const RADIUS = BLB.RADIUS = 15.5, FORGIVE = BLB.FORGIVE = 24;
  const FUSE = 2.5, BUBBLE = 3, SUDDEN = 75, CAP = 100, MIN_END = 23;
  const BASE = 4.35 * TILE, STEP_PX = 0.5 * TILE, KICK = BLB.KICK = 7.6 * TILE;
  const EMPTY = 0, PILLAR = 1, CRATE = 2, JELLY = 3;
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  BLB.EMPTY = EMPTY; BLB.PILLAR = PILLAR; BLB.CRATE = CRATE; BLB.JELLY = JELLY;
  BLB.FUSE = FUSE; BLB.MIN_END = MIN_END; BLB.CAP = CAP;

  function makeRand(seed) {
    let a = (seed >>> 0) || 1;
    const fn = () => {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    fn.state = () => a >>> 0;
    return fn;
  }

  function idx(c, r) { return r * COLS + c; }
  function inside(c, r) { return c >= 0 && r >= 0 && c < COLS && r < ROWS; }
  function tile(w, c, r) { return inside(c, r) ? w.grid[idx(c, r)] : PILLAR; }
  function setTile(w, c, r, v) { if (inside(c, r)) w.grid[idx(c, r)] = v; }
  function center(i) { return (i + 0.5) * TILE; }
  function cellOf(x) { return Math.floor(x / TILE); }
  BLB.cellOf = p => ({ c: cellOf(p.x), r: cellOf(p.y) });
  BLB.tile = tile;
  BLB.setTile = setTile;
  BLB.center = center;

  function solid(t) { return t === PILLAR || t === CRATE || t === JELLY; }

  function blockedCircle(w, x, y, p) {
    const rad = RADIUS - 0.01;
    const c0 = cellOf(x - rad), c1 = cellOf(x + rad), r0 = cellOf(y - rad), r1 = cellOf(y + rad);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!solid(tile(w, c, r))) continue;
      const nx = Math.max(c * TILE, Math.min(x, (c + 1) * TILE));
      const ny = Math.max(r * TILE, Math.min(y, (r + 1) * TILE));
      const dx = x - nx, dy = y - ny;
      if (dx * dx + dy * dy < rad * rad) return true;
    }
    for (let i = 0; i < w.balloons.length; i++) {
      const b = w.balloons[i];
      if (b.gone) continue;
      // The critter who just dropped it can walk off, even while their body still overlaps it.
      if (p && b.pass === p.id) {
        const ox = x - b.x, oy = y - b.y, reach = rad + 14;
        if (ox * ox + oy * oy < reach * reach) continue;
        b.pass = -1;
      }
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy < (rad + 14) * (rad + 14)) return true;
    }
    return false;
  }

  function overlaps(p, c, r) {
    const x0 = c * TILE, y0 = r * TILE;
    const nx = Math.max(x0, Math.min(p.x, x0 + TILE));
    const ny = Math.max(y0, Math.min(p.y, y0 + TILE));
    const dx = p.x - nx, dy = p.y - ny;
    return dx * dx + dy * dy < RADIUS * RADIUS;
  }

  BLB.splashCells = function (w, c, r, range) {
    const cells = [{ c: c, r: r }];
    for (let d = 0; d < 4; d++) {
      const dc = DIRS[d][0], dr = DIRS[d][1];
      for (let i = 1; i <= range; i++) {
        const cc = c + dc * i, rr = r + dr * i;
        const t = tile(w, cc, rr);
        if (t === PILLAR || t === JELLY || !inside(cc, rr)) break;
        cells.push({ c: cc, r: rr });
        if (t === CRATE) break;
      }
    }
    return cells;
  };

  function layerOf(c, r) { return Math.min(c, r, COLS - 1 - c, ROWS - 1 - r); }

  function escapeOf(c, r) {
    const dc = c <= 1 ? 1 : -1, dr = r <= 1 ? 1 : -1;
    return [[c, r], [c + dc, r], [c, r + dr]];
  }
  BLB.escapeOf = escapeOf;

  const SPAWNS = [[1, 1], [13, 1], [1, 9], [13, 9]];

  function genArena(rand) {
    const g = new Uint8Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const border = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
      const pillar = (r % 2 === 0) && (c % 2 === 0);
      g[idx(c, r)] = border || pillar ? PILLAR : EMPTY;
    }
    const safe = new Set();
    for (const [c, r] of SPAWNS) for (const cell of escapeOf(c, r)) safe.add(cell[0] + ',' + cell[1]);
    // One extra step down each lane so a fresh critter is not staring at a crate.
    for (const [c, r] of SPAWNS) {
      const dc = c <= 1 ? 1 : -1, dr = r <= 1 ? 1 : -1;
      safe.add((c + dc * 2) + ',' + r);
      safe.add(c + ',' + (r + dr * 2));
    }
    for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
      if (g[idx(c, r)] !== EMPTY || safe.has(c + ',' + r)) continue;
      if (rand() < 0.76) g[idx(c, r)] = CRATE;
    }
    return g;
  }

  function parseGrid(rows) {
    const g = new Uint8Array(COLS * ROWS);
    const marks = { '1': [], '2': [], R: [], E: null, K: null, D: null };
    for (let r = 0; r < ROWS; r++) {
      const row = rows[r] || '';
      for (let c = 0; c < COLS; c++) {
        const ch = row[c] || '#';
        if (ch === '#') g[idx(c, r)] = PILLAR;
        else if (ch === 'C') g[idx(c, r)] = CRATE;
        else g[idx(c, r)] = EMPTY;
        if (ch === '1') marks['1'].push([c, r]);
        else if (ch === '2') marks['2'].push([c, r]);
        else if (ch === 'R') marks.R.push([c, r]);
        else if (ch === 'E') marks.E = [c, r];
        else if (ch === 'K') marks.K = [c, r];
        else if (ch === 'D') marks.D = [c, r];
      }
    }
    return { g: g, marks: marks };
  }

  function makePlayer(spec, i, c, r) {
    return {
      id: i, critter: spec.critter || 'frog', name: spec.name || '',
      team: spec.team == null ? i : spec.team, cpu: !!spec.cpu, robot: !!spec.robot,
      tier: spec.tier || 1, brain: spec.brain || (spec.cpu && !spec.robot ? 'bot' : spec.brain || ''),
      wake: spec.wake || 0,
      x: center(c), y: center(r), face: spec.face == null ? 1 : spec.face,
      balloons: 1, range: 1, speed: 0, kick: false, slowT: 0,
      state: 'play', bubbleT: 0, trappedBy: -1, rounds: spec.rounds || 0,
      axis: 'h', bufX: 0, bufY: 0, bufT: 0, dropBuf: 0, kickBuf: 0,
      nextThink: 0, mx: 0, my: 0, goal: null
    };
  }

  function baseWorld(opts, grid, rand) {
    return {
      seed: opts.seed || 1, rand: rand, grid: grid, time: 0, phase: 'play',
      battle: !!opts.battle, adventure: !!opts.adventure, demo: !!opts.demo,
      kind: opts.kind || 'ffa', goal: opts.goal || '',
      arena: opts.arena || 'garden', round: opts.round || 1, minEnd: MIN_END,
      freeze: opts.freeze || 0, intro: opts.intro || 0,
      players: [], balloons: [], drops: [], splashes: [], events: [],
      nextId: 1, winner: -1, lastTeam: 0, booms: 0, pendingShake: 0,
      botDrops: 0, selfTraps: 0, trappedHuman: false,
      par: opts.par || 70, wake: opts.wake || 0,
      exit: null, cake: null, duck: null, outcome: '', stars: 0,
      sudden: false
    };
  }

  BLB.newMatch = function (opts) {
    opts = opts || {};
    const rand = makeRand(opts.seed == null ? 1 : opts.seed);
    const grid = opts.grid ? opts.grid.slice() : genArena(rand);
    const w = baseWorld(Object.assign({ battle: true, intro: opts.intro == null ? 2.2 : opts.intro }, opts), grid, rand);
    w.freeze = w.intro;
    const specs = opts.players || [
      { cpu: false, team: 0, critter: 'frog' },
      { cpu: true, team: 1, critter: 'penguin', tier: opts.tier || 3 },
      { cpu: true, team: 2, critter: 'cat', tier: opts.tier || 3 },
      { cpu: true, team: 3, critter: 'robot', tier: opts.tier || 3 }
    ];
    for (let i = 0; i < specs.length && i < SPAWNS.length; i++) {
      const s = SPAWNS[i];
      w.players.push(makePlayer(specs[i], i, s[0], s[1]));
    }
    return w;
  };

  BLB.newStage = function (opts) {
    opts = opts || {};
    const stage = typeof opts.stage === 'string' ? D.stageById(opts.stage) : (opts.stage || D.STAGES[0]);
    const rand = makeRand(opts.seed == null ? 1 : opts.seed);
    const parsed = parseGrid(stage.grid);
    const w = baseWorld({
      adventure: true, battle: false, demo: !!opts.demo, seed: opts.seed, arena: stage.arena,
      goal: stage.kind, par: stage.par, wake: stage.wake, intro: opts.intro || 0, freeze: opts.intro || 0
    }, parsed.g, rand);
    w.stageId = stage.id;
    const coop = !!opts.coop;
    const marks = parsed.marks;
    const s1 = marks['1'][0] || [1, 1];
    w.players.push(makePlayer({ cpu: false, team: 0, critter: opts.p1 || 'frog', brain: '' }, 0, s1[0], s1[1]));
    if (coop) {
      const s2 = marks['2'][0] || [1, 2];
      w.players.push(makePlayer({ cpu: false, team: 0, critter: opts.p2 || 'penguin', brain: '', face: 2 }, 1, s2[0], s2[1]));
    }
    const tier = opts.tier || 1;
    for (let i = 0; i < marks.R.length; i++) {
      const brain = stage.kind === 'cake' ? 'sleep' : 'still';
      w.players.push(makePlayer({
        cpu: true, robot: true, team: 1, critter: 'robot', tier: tier, brain: brain, wake: stage.wake || 0, face: 3
      }, w.players.length, marks.R[i][0], marks.R[i][1]));
    }
    w.exit = marks.E ? { c: marks.E[0], r: marks.E[1] } : (stage.exit ? { c: stage.exit[0], r: stage.exit[1] } : null);
    const cakeAt = marks.K || stage.cake;
    w.cake = cakeAt ? { c: cakeAt[0], r: cakeAt[1], hp: 3 } : null;
    if (marks.D || stage.duck) {
      const d = stage.duck || { c: marks.D[0], r: marks.D[1], c2: marks.D[0], r2: marks.D[1] };
      w.duck = { c: d.c, r: d.r, c2: d.c2, r2: d.r2, hp: 6, max: 6, inv: 0, t: 0, lay: 3.2, home: true };
    }
    w.stage = stage;
    return w;
  };

  function speedOf(p) {
    let s = BASE + p.speed * STEP_PX;
    if (p.slowT > 0) s *= 0.55;
    return s;
  }
  BLB.speedOf = speedOf;

  function liveCount(w, id) {
    let n = 0;
    for (let i = 0; i < w.balloons.length; i++) if (!w.balloons[i].gone && w.balloons[i].owner === id) n++;
    return n;
  }

  function tryDrop(w, p) {
    if (p.state !== 'play') return false;
    if (liveCount(w, p.id) >= p.balloons) return false;
    const c = cellOf(p.x), r = cellOf(p.y);
    if (solid(tile(w, c, r))) return false;
    for (let i = 0; i < w.balloons.length; i++) {
      const b = w.balloons[i];
      if (!b.gone && b.c === c && b.r === r) return false;
    }
    w.balloons.push({
      id: w.nextId++, owner: p.id, c: c, r: r, x: center(c), y: center(r),
      fuse: FUSE, range: p.range, slide: -1, pass: p.id, gone: false
    });
    if (p.cpu) w.botDrops++;
    w.events.push({ t: 'drop', id: p.id, c: c, r: r });
    return true;
  }
  BLB.tryDrop = tryDrop;

  function tryKick(w, p) {
    if (!p.kick || p.state !== 'play') return false;
    const dc = DIRS[p.face][0], dr = DIRS[p.face][1];
    const c = cellOf(p.x), r = cellOf(p.y);
    let b = null;
    for (let i = 0; i < w.balloons.length; i++) {
      const o = w.balloons[i];
      if (o.gone || o.slide >= 0) continue;
      if ((o.c === c + dc && o.r === r + dr) || (o.c === c && o.r === r)) { b = o; break; }
    }
    if (!b) return false;
    b.slide = p.face;
    b.pass = -1;
    w.events.push({ t: 'kick', id: p.id });
    return true;
  }

  function nudge(w, p, axis, spd) {
    const pos = axis === 'x' ? p.x : p.y;
    const cell = cellOf(pos);
    let best = null, bestD = FORGIVE + 0.01;
    for (let k = -1; k <= 1; k++) {
      const ctr = center(cell + k);
      const d = Math.abs(pos - ctr);
      if (d <= FORGIVE && d < bestD) { bestD = d; best = ctr; }
    }
    if (best == null || bestD < 0.4) return;
    const step = Math.min(spd, bestD);
    const dir = Math.sign(best - pos);
    const nx = axis === 'x' ? p.x + dir * step : p.x;
    const ny = axis === 'y' ? p.y + dir * step : p.y;
    if (!blockedCircle(w, nx, ny, p)) { p.x = nx; p.y = ny; }
  }

  function slide(w, p, dx, dy) {
    if (!dx && !dy) return;
    if (!blockedCircle(w, p.x + dx, p.y + dy, p)) { p.x += dx; p.y += dy; return; }
    let lo = 0, hi = 1;
    for (let i = 0; i < 5; i++) {
      const m = (lo + hi) / 2;
      if (!blockedCircle(w, p.x + dx * m, p.y + dy * m, p)) lo = m; else hi = m;
    }
    if (lo > 0.02) { p.x += dx * lo; p.y += dy * lo; }
  }

  function movePlayer(w, p, input, dt) {
    if (p.state !== 'play') return;
    let ix = input && input.x ? (input.x > 0 ? 1 : input.x < 0 ? -1 : 0) : 0;
    let iy = input && input.y ? (input.y > 0 ? 1 : input.y < 0 ? -1 : 0) : 0;
    if (ix && iy) { if (p.axis === 'v') ix = 0; else iy = 0; }
    if (ix || iy) { p.axis = ix ? 'h' : 'v'; p.bufX = ix; p.bufY = iy; p.bufT = 0.12; }
    else if (p.bufT > 0) { ix = p.bufX; iy = p.bufY; p.bufT -= dt; }
    if (input && input.drop) p.dropBuf = 0.12;
    if (input && input.kick) p.kickBuf = 0.12;
    // Drop before sliding, so the balloon lands on the cell the bot planned to leave.
    if (p.dropBuf > 0) { p.dropBuf -= dt; if (tryDrop(w, p)) p.dropBuf = 0; }
    if (p.kickBuf > 0) { p.kickBuf -= dt; if (tryKick(w, p)) p.kickBuf = 0; }
    const spd = speedOf(p) * dt;
    if (iy) { p.face = iy > 0 ? 2 : 0; nudge(w, p, 'x', spd * 1.15); slide(w, p, 0, iy * spd); }
    if (ix) { p.face = ix > 0 ? 1 : 3; nudge(w, p, 'y', spd * 1.15); slide(w, p, ix * spd, 0); }
  }

  function moveBalloons(w, dt) {
    for (let i = 0; i < w.balloons.length; i++) {
      const b = w.balloons[i];
      if (b.gone) continue;
      b.fuse -= dt;
      if (b.slide < 0) { b.x = center(b.c); b.y = center(b.r); continue; }
      const dc = DIRS[b.slide][0], dr = DIRS[b.slide][1];
      const nx = b.x + dc * KICK * dt, ny = b.y + dr * KICK * dt;
      const nc = cellOf(nx), nr = cellOf(ny);
      let stop = solid(tile(w, nc, nr));
      if (!stop) for (let j = 0; j < w.balloons.length; j++) {
        const o = w.balloons[j];
        if (o !== b && !o.gone && o.c === nc && o.r === nr) stop = true;
      }
      if (stop) {
        b.slide = -1; b.x = center(b.c); b.y = center(b.r);
      } else {
        b.x = nx; b.y = ny; b.c = nc; b.r = nr;
      }
    }
  }

  function maybeDrop(w, c, r) {
    if (!w.battle || w.rand() > 0.4) return;
    const roll = w.rand();
    const kind = roll < 0.30 ? 'balloon' : roll < 0.58 ? 'range' : roll < 0.80 ? 'speed' : roll < 0.94 ? 'kick' : 'slow';
    w.drops.push({ c: c, r: r, kind: kind, dead: false, born: w.time });
    w.events.push({ t: 'gift', c: c, r: r, kind: kind });
  }

  function trap(w, p, owner, direct) {
    if (p.state !== 'play') return;
    p.state = 'bubble';
    p.bubbleT = BUBBLE;
    p.grace = 0.18;
    p.trappedBy = owner;
    const ownBalloon = direct === p.id || owner === p.id;
    if (ownBalloon) {
      if (p.cpu && direct === p.id) w.selfTraps++;
      if (!p.cpu) w.trappedHuman = true;
    }
    w.events.push({ t: 'trap', victim: p.id, by: owner, direct: direct, own: direct === p.id, robot: !!p.robot, cpu: !!p.cpu });
  }

  function detonate(w, b, root) {
    if (b.gone) return;
    b.gone = true;
    if (root == null) root = b.owner;
    const cells = BLB.splashCells(w, b.c, b.r, b.range);
    w.splashes.push({ cells: cells, life: 0.72, max: 0.72, owner: b.owner });
    w.booms++;
    w.events.push({ t: 'boom', id: b.id, owner: b.owner, c: b.c, r: b.r, n: cells.length });
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (tile(w, cell.c, cell.r) === CRATE) {
        setTile(w, cell.c, cell.r, EMPTY);
        w.events.push({ t: 'crate', c: cell.c, r: cell.r });
        maybeDrop(w, cell.c, cell.r);
      }
      for (let d = 0; d < w.drops.length; d++) {
        const drop = w.drops[d];
        if (!drop.dead && drop.c === cell.c && drop.r === cell.r) drop.dead = true;
      }
      for (let k = 0; k < w.balloons.length; k++) {
        const o = w.balloons[k];
        if (!o.gone && o !== b && o.c === cell.c && o.r === cell.r) { o.fuse = 0; detonate(w, o, root); }
      }
      for (let p = 0; p < w.players.length; p++) {
        const pl = w.players[p];
        // The center cell counts. A toe still in the previous lane is not a trap —
        // otherwise leaving a splash always catches you on the line.
        if (pl.state === 'play' && cellOf(pl.x) === cell.c && cellOf(pl.y) === cell.r) trap(w, pl, root, b.owner);
      }
      if (w.duck && w.duck.hp > 0 && w.duck.inv <= 0) {
        const on = (w.duck.c === cell.c && w.duck.r === cell.r) || (w.duck.c2 === cell.c && w.duck.r2 === cell.r);
        if (on) {
          w.duck.hp--;
          w.duck.inv = 0.85;
          w.events.push({ t: 'boss', hp: w.duck.hp, by: b.owner });
        }
      }
    }
  }

  function resolve(w) {
    w.booms = 0;
    const due = [];
    for (let i = 0; i < w.balloons.length; i++) if (!w.balloons[i].gone && w.balloons[i].fuse <= 0) due.push(w.balloons[i]);
    due.sort((a, b) => a.id - b.id);
    for (let i = 0; i < due.length; i++) detonate(w, due[i]);
    if (w.booms) w.pendingShake = Math.min(14, Math.max(w.pendingShake, 8 + Math.min(4, w.booms)));
    w.balloons = w.balloons.filter(b => !b.gone);
    w.drops = w.drops.filter(d => !d.dead);
  }

  function applySudden(w) {
    if (!w.battle || w.time < SUDDEN) return;
    w.sudden = true;
    const layer = Math.min(5, Math.floor((w.time - SUDDEN) / 4));
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (layerOf(c, r) > layer) continue;
      const t = tile(w, c, r);
      if (t === PILLAR || t === JELLY) continue;
      setTile(w, c, r, JELLY);
      for (let i = 0; i < w.balloons.length; i++) {
        const b = w.balloons[i];
        if (!b.gone && b.c === c && b.r === r) b.fuse = 0;
      }
      for (let i = 0; i < w.drops.length; i++) if (w.drops[i].c === c && w.drops[i].r === r) w.drops[i].dead = true;
      for (let i = 0; i < w.players.length; i++) {
        const p = w.players[i];
        if (p.state !== 'out' && cellOf(p.x) === c && cellOf(p.y) === r) {
          p.state = 'out';
          w.lastTeam = p.team;
          w.events.push({ t: 'out', id: p.id, how: 'jelly' });
        }
      }
    }
  }

  function pickups(w) {
    for (let i = 0; i < w.players.length; i++) {
      const p = w.players[i];
      if (p.state !== 'play') continue;
      const c = cellOf(p.x), r = cellOf(p.y);
      for (let d = 0; d < w.drops.length; d++) {
        const drop = w.drops[d];
        if (drop.dead || drop.c !== c || drop.r !== r) continue;
        drop.dead = true;
        if (drop.kind === 'balloon') p.balloons = Math.min(6, p.balloons + 1);
        else if (drop.kind === 'range') p.range = Math.min(7, p.range + 1);
        else if (drop.kind === 'speed') p.speed = Math.min(4, p.speed + 1);
        else if (drop.kind === 'kick') p.kick = true;
        else if (drop.kind === 'slow') p.slowT = 8;
        w.events.push({ t: 'item', id: p.id, kind: drop.kind });
      }
    }
    w.drops = w.drops.filter(d => !d.dead);
  }

  function bubbles(w, dt) {
    for (let i = 0; i < w.players.length; i++) {
      const p = w.players[i];
      if (p.state !== 'bubble') continue;
      p.bubbleT -= dt;
      p.grace = Math.max(0, (p.grace || 0) - dt);
      if (p.bubbleT <= 0) {
        p.state = 'play';
        w.events.push({ t: 'free', id: p.id, how: 'time' });
        continue;
      }
      if (p.grace > 0) continue;
      for (let j = 0; j < w.players.length; j++) {
        const o = w.players[j];
        if (o === p || o.state !== 'play') continue;
        const dx = o.x - p.x, dy = o.y - p.y;
        if (dx * dx + dy * dy > (TILE * 0.74) * (TILE * 0.74)) continue;
        if (o.team === p.team) {
          p.state = 'play';
          w.events.push({ t: 'free', id: p.id, by: o.id });
        } else {
          p.state = 'out';
          w.lastTeam = p.team;
          w.events.push({ t: 'pop', victim: p.id, by: o.id, robot: !!p.robot, owner: p.trappedBy });
        }
        break;
      }
    }
  }

  function march(w, p, dt) {
    if (p.state !== 'play' || !w.cake) return;
    if (p.brain === 'sleep') {
      if (w.time >= (p.wake || 70)) p.brain = 'march';
      return;
    }
    if (p.brain !== 'march') return;
    const goal = w.cake;
    const c = cellOf(p.x), r = cellOf(p.y);
    if (c === goal.c && r === goal.r) {
      w.cake.hp--;
      p.state = 'out';
      w.events.push({ t: 'bite', id: p.id });
      if (w.cake.hp <= 0) w.events.push({ t: 'cake' });
      return;
    }
    // Greedy step toward the cake through open cells. Recomputed, so a new hole in the crates is used.
    let best = null, bestD = Math.abs(goal.c - c) + Math.abs(goal.r - r);
    for (let d = 0; d < 4; d++) {
      const nc = c + DIRS[d][0], nr = r + DIRS[d][1];
      if (solid(tile(w, nc, nr))) continue;
      const dist = Math.abs(goal.c - nc) + Math.abs(goal.r - nr);
      if (dist < bestD) { bestD = dist; best = [DIRS[d][0], DIRS[d][1]]; }
    }
    if (!best) return;
    const spd = 1.15 * TILE * dt;
    p.face = best[0] > 0 ? 1 : best[0] < 0 ? 3 : best[1] > 0 ? 2 : 0;
    slide(w, p, best[0] * spd, best[1] * spd);
  }

  function tickDuck(w, dt) {
    const d = w.duck;
    if (!d || d.hp <= 0) return;
    d.t += dt;
    d.inv = Math.max(0, d.inv - dt);
    // Waddle between the two cells that share the approach. Both stay inside a range-1 splash.
    const flip = Math.floor(d.t / 0.85) % 2 === 1 && (d.c !== d.c2 || d.r !== d.r2);
    d.x = center(flip ? d.c2 : d.c);
    d.y = center(flip ? d.r2 : d.r);
    d.lay -= dt;
    if (d.lay <= 0) {
      d.lay = 5.4;
      const c = flip ? d.c2 : d.c, r = flip ? d.r2 : d.r;
      let occupied = solid(tile(w, c, r));
      for (let i = 0; i < w.balloons.length; i++) if (!w.balloons[i].gone && w.balloons[i].c === c && w.balloons[i].r === r) occupied = true;
      if (!occupied) w.balloons.push({
        id: w.nextId++, owner: -1, c: c, r: r, x: center(c), y: center(r),
        fuse: FUSE, range: 1, slide: -1, pass: -1, gone: false
      });
    }
  }

  function livingTeams(w) {
    const seen = [];
    for (let i = 0; i < w.players.length; i++) {
      const p = w.players[i];
      if (p.state !== 'out' && seen.indexOf(p.team) < 0) seen.push(p.team);
    }
    return seen;
  }

  function humansLeft(w) {
    let n = 0;
    for (let i = 0; i < w.players.length; i++) if (!w.players[i].cpu && w.players[i].state !== 'out') n++;
    return n;
  }

  function robotsLeft(w) {
    let n = 0;
    for (let i = 0; i < w.players.length; i++) if (w.players[i].robot && w.players[i].state !== 'out') n++;
    return n;
  }

  function finishAdventure(w, outcome) {
    w.phase = outcome === 'win' ? 'won' : 'lost';
    w.outcome = outcome;
    let stars = 0;
    if (outcome === 'win') {
      stars = 1;
      if (w.time <= w.par) stars++;
      if (!w.trappedHuman) stars++;
    }
    w.stars = stars;
    w.events.push({ t: 'clear', outcome: outcome, stars: stars });
  }

  function checkEnd(w) {
    if (w.noEnd || w.phase !== 'play') return;
    if (w.battle) {
      const teams = livingTeams(w);
      if (teams.length === 1) w.lastTeam = teams[0];
      const decided = teams.length <= 1;
      if ((decided && w.time >= w.minEnd) || w.time >= CAP) {
        w.winner = teams.length === 1 ? teams[0] : (teams.length === 0 ? w.lastTeam : -1);
        w.phase = 'end';
        w.events.push({ t: 'round', winner: w.winner });
      }
      return;
    }
    if (w.cake && w.cake.hp <= 0) return finishAdventure(w, 'lose');
    if (!humansLeft(w)) return finishAdventure(w, 'lose');
    if (w.time >= 130) return finishAdventure(w, 'lose');
    if (w.goal === 'exit' && w.exit) {
      for (let i = 0; i < w.players.length; i++) {
        const p = w.players[i];
        if (p.cpu || p.state !== 'play') continue;
        if (cellOf(p.x) === w.exit.c && cellOf(p.y) === w.exit.r) return finishAdventure(w, 'win');
      }
    } else if (w.goal === 'robots' || w.goal === 'cake') {
      if (robotsLeft(w) === 0) return finishAdventure(w, 'win');
    } else if (w.goal === 'boss') {
      if (w.duck && w.duck.hp <= 0) return finishAdventure(w, 'win');
    }
  }

  function tick(w, dt, inputs) {
    w.booms = 0;
    if (w.freeze > 0) {
      w.time += dt;
      w.freeze = Math.max(0, w.freeze - dt);
      return;
    }
    w.time += dt;
    for (let i = 0; i < w.players.length; i++) if (w.players[i].slowT > 0) w.players[i].slowT = Math.max(0, w.players[i].slowT - dt);
    applySudden(w);
    // Move first. A critter who steps out on the frame a fuse hits zero is clear.
    for (let i = 0; i < w.players.length; i++) {
      const p = w.players[i];
      if (p.brain === 'march' || p.brain === 'sleep') march(w, p, dt);
      else if (p.brain !== 'still') movePlayer(w, p, inputs ? inputs[i] : null, dt);
    }
    moveBalloons(w, dt);
    resolve(w);
    pickups(w);
    bubbles(w, dt);
    tickDuck(w, dt);
    for (let i = w.splashes.length - 1; i >= 0; i--) {
      w.splashes[i].life -= dt;
      if (w.splashes[i].life <= 0) w.splashes.splice(i, 1);
    }
    if (w.events.length > 40) w.events.splice(0, w.events.length - 40);
    checkEnd(w);
  }

  BLB.step = function (w, dt, inputs) {
    if (!w || w.phase === 'end' || w.phase === 'won' || w.phase === 'lost') return w;
    let left = dt > 0 ? dt : 0;
    let first = true;
    while (left > 1e-5) {
      const h = Math.min(1 / 30, left);
      let ins = inputs;
      if (!first && inputs) ins = inputs.map(i => i ? { x: i.x || 0, y: i.y || 0, drop: false, kick: false } : i);
      tick(w, h, ins);
      first = false;
      left -= h;
      if (w.phase !== 'play') break;
    }
    return w;
  };

  BLB.forceEnd = function (w, winner) {
    for (let i = 0; i < w.players.length; i++) if (w.players[i].team !== winner) w.players[i].state = 'out';
    w.time = Math.max(w.time, w.minEnd || MIN_END);
    w.freeze = 0;
    checkEnd(w);
    if (w.phase === 'play') { w.winner = winner; w.phase = 'end'; w.events.push({ t: 'round', winner: winner }); }
    return w;
  };

  BLB.fingerprint = function (w) {
    return JSON.stringify({
      t: Math.round(w.time * 1000), phase: w.phase,
      grid: Array.from(w.grid),
      players: w.players.map(p => [Math.round(p.x), Math.round(p.y), p.state, p.balloons, p.range, p.speed, p.kick ? 1 : 0, Math.round((p.slowT || 0) * 10)]),
      balloons: w.balloons.map(b => [b.c, b.r, Math.round(b.fuse * 100), b.owner, b.range]),
      drops: w.drops.map(d => [d.c, d.r, d.kind]),
      winner: w.winner
    });
  };

  BLB.put = function (w, i, c, r, dx, dy) {
    const p = w.players[i];
    p.x = center(c) + (dx || 0);
    p.y = center(r) + (dy || 0);
    p.state = 'play';
    return p;
  };

  BLB.addBalloon = function (w, o) {
    const b = {
      id: o.id || w.nextId++, owner: o.owner == null ? 0 : o.owner,
      c: o.c, r: o.r, x: center(o.c), y: center(o.r),
      fuse: o.fuse == null ? FUSE : o.fuse, range: o.range || 1, slide: -1, pass: -1, gone: false
    };
    w.balloons.push(b);
    if (b.id >= w.nextId) w.nextId = b.id + 1;
    return b;
  };

  BLB.addDrop = function (w, c, r, kind) { w.drops.push({ c: c, r: r, kind: kind, dead: false, born: w.time }); };
})(globalThis.BLB = globalThis.BLB || {});
