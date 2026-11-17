/* Balloon Blast — deterministic Bomberman-style water-balloon battle engine. */
(function () {
  'use strict';

  var D = (typeof globalThis !== 'undefined' && globalThis.BBData) || (typeof require === 'function' ? require('./data.js') : null);
  var COLS = D.COLS, ROWS = D.ROWS, TILE = D.TILE;
  var EMPTY = D.EMPTY, PILLAR = D.PILLAR, CRATE = D.CRATE, JELLY = D.JELLY, PIPE = D.PIPE;
  var RADIUS = 20, FORGIVE = 28, BASE_SPD = 4.35 * TILE, STEP_SPD = 0.48 * TILE, MOUNT_SPD = 1.15 * TILE;
  var KICK_SPD = 8.2 * TILE, SUDDEN_T = 65, CAP_T = 90, ADV_CAP_T = 140;
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  function makeRand(seed) {
    var a = (seed >>> 0) || 1;
    var fn = function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    fn.state = function () { return a >>> 0; };
    return fn;
  }

  function idx(c, r) { return r * COLS + c; }
  function inside(c, r) { return c >= 0 && r >= 0 && c < COLS && r < ROWS; }
  function tile(w, c, r) { return inside(c, r) ? w.grid[idx(c, r)] : PILLAR; }
  function setTile(w, c, r, v) { if (inside(c, r)) w.grid[idx(c, r)] = v; }
  function center(i) { return (i + 0.5) * TILE; }
  function cellCoord(px) { return Math.floor(px / TILE); }
  function cellOf(ent) { return { c: cellCoord(ent.x), r: cellCoord(ent.y) }; }
  function solid(t) { return t === PILLAR || t === CRATE || t === JELLY; }

  function escapeRunway(c, r) {
    var dc = c <= 2 ? 1 : -1, dr = r <= 2 ? 1 : -1;
    return [[c, r], [c + dc, r], [c + dc * 2, r], [c, r + dr], [c, r + dr * 2]];
  }

  var BBEngine = {
    COLS: COLS, ROWS: ROWS, TILE: TILE, RADIUS: RADIUS,
    EMPTY: EMPTY, PILLAR: PILLAR, CRATE: CRATE, JELLY: JELLY, PIPE: PIPE,
    DIRS: DIRS, KICK_SPD: KICK_SPD, makeRand: makeRand,
    idx: idx, inside: inside, tile: tile, setTile: setTile, center: center,
    cellCoord: cellCoord, cellOf: cellOf, solid: solid, escapeRunway: escapeRunway
  };

  function genArena(rand, crateRate) {
    var g = new Uint8Array(COLS * ROWS), r, c, safe = {};
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      var border = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
      var pillar = (r % 2 === 0) && (c % 2 === 0) && !(c === 6 && r === 4);
      g[idx(c, r)] = (border || pillar) ? PILLAR : EMPTY;
    }
    for (var s = 0; s < D.SPAWNS.length; s++) {
      var run = escapeRunway(D.SPAWNS[s][0], D.SPAWNS[s][1]);
      for (var k = 0; k < run.length; k++) safe[run[k][0] + ',' + run[k][1]] = 1;
    }
    var pipes = [[6, 1], [6, 7]];
    for (var p = 0; p < pipes.length; p++) {
      var pc = pipes[p][0], pr = pipes[p][1];
      g[idx(pc, pr)] = PIPE;
      safe[pc + ',' + pr] = safe[(pc - 1) + ',' + pr] = safe[(pc + 1) + ',' + pr] = 1;
    }
    safe['6,4'] = 1;
    var rate = crateRate == null ? 0.64 : crateRate;
    for (r = 1; r < ROWS - 1; r++) for (c = 1; c < COLS - 1; c++) {
      if (g[idx(c, r)] === EMPTY && !safe[c + ',' + r] && rand() < rate) g[idx(c, r)] = CRATE;
    }
    return { grid: g, pipes: [{ c: 6, r: 1 }, { c: 6, r: 7 }] };
  }

  function parseStageGrid(rows) {
    var g = new Uint8Array(COLS * ROWS), pipes = [], mobs = [], p1 = [1, 1], p2 = [1, 2], bossAt = null;
    for (var r = 0; r < ROWS; r++) {
      var line = rows[r] || '';
      for (var c = 0; c < COLS; c++) {
        var ch = line[c] || '#';
        if (ch === '#') g[idx(c, r)] = PILLAR;
        else if (ch === 'C') g[idx(c, r)] = CRATE;
        else if (ch === 'P') { g[idx(c, r)] = PIPE; pipes.push({ c: c, r: r }); }
        else g[idx(c, r)] = EMPTY;
        if (ch === '1') p1 = [c, r];
        else if (ch === '2') p2 = [c, r];
        else if (ch === 'm') mobs.push({ c: c, r: r, mob: 'crab' });
        else if (ch === 'f') mobs.push({ c: c, r: r, mob: 'bot' });
        else if (ch === 's') mobs.push({ c: c, r: r, mob: 'suds' });
        else if (ch === 'B') bossAt = { c: c, r: r };
      }
    }
    return { grid: g, pipes: pipes, mobs: mobs, p1: p1, p2: p2, bossAt: bossAt };
  }

  function makeFighter(spec, id, c, r, diff) {
    var isHuman = !spec.cpu;
    return {
      id: id, name: spec.name || (isHuman ? 'أنت' : 'منافس'), skin: spec.skin || 'ninja',
      team: spec.team == null ? id : spec.team, cpu: !!spec.cpu, mob: spec.mob || '',
      tier: spec.tier || diff.botTier || 3, x: center(c), y: center(r), face: spec.face == null ? 1 : spec.face,
      hp: spec.hp || 1, maxHp: spec.hp || 1, balloons: spec.balloons || 1, range: spec.range || 1,
      speed: spec.speed || 0, kick: !!spec.kick,
      shield: spec.shield != null ? spec.shield : (isHuman ? diff.startShield : 0),
      mount: !!spec.mount, selfMercy: spec.selfMercy != null ? !!spec.selfMercy : (isHuman && !!diff.selfMercy),
      invT: 0, warpCd: 0, state: 'play', koT: 0, axis: 'h', bufX: 0, bufY: 0, bufT: 0,
      dropBuf: 0, kickBuf: 0, nextThink: 0, mx: 0, my: 0
    };
  }

  function baseWorld(opts, grid, pipes, rand, diff) {
    var frz = opts.freeze != null ? opts.freeze : (opts.intro != null ? opts.intro : 0.4);
    return {
      seed: opts.seed || 1, rand: rand, diffId: diff.id, fuse: opts.fuse || diff.fuse || 2.3,
      grid: grid, pipes: pipes || [], time: 0, phase: 'play', round: opts.round || 1, freeze: frz,
      battle: !!opts.battle, adventure: !!opts.adventure, demo: !!opts.demo,
      arena: opts.arena || 'sand', stageId: opts.stageId || '', par: opts.par || 60,
      players: [], balloons: [], drops: [], splashes: [], events: [], boss: null,
      nextId: 1, winner: -1, lastTeam: 0, outcome: '', stars: 0, hitsTaken: 0,
      botDrops: 0, selfHits: 0, pendingShake: 0, sudden: false, noEnd: !!opts.noEnd
    };
  }

  BBEngine.newMatch = function (opts) {
    opts = opts || {};
    var diff = D.diffById(opts.diff || 'normal'), rand = makeRand(opts.seed == null ? 1 : opts.seed);
    var built = opts.grid ? { grid: opts.grid.slice(), pipes: opts.pipes || [] } : genArena(rand, diff.crateRate);
    var w = baseWorld({ seed: opts.seed, freeze: opts.freeze, intro: opts.intro, round: opts.round || 1, battle: true, demo: !!opts.demo, arena: opts.arena || 'sand', noEnd: opts.noEnd }, built.grid, built.pipes, rand, diff);
    var specs = opts.players || [
      { cpu: false, team: 0, skin: opts.skin || 'ninja', name: 'أنت' },
      { cpu: true, team: 1, skin: 'shark', name: 'قرش', tier: opts.tier || diff.botTier },
      { cpu: true, team: 2, skin: 'neon', name: 'نيون', tier: opts.tier || diff.botTier },
      { cpu: true, team: 3, skin: 'gold', name: 'ذهبي', tier: opts.tier || diff.botTier }
    ];
    for (var i = 0; i < specs.length && i < D.SPAWNS.length; i++) w.players.push(makeFighter(specs[i], i, D.SPAWNS[i][0], D.SPAWNS[i][1], diff));
    return w;
  };

  BBEngine.newStage = function (opts) {
    opts = opts || {};
    var stage = typeof opts.stage === 'string' ? D.stageById(opts.stage) : (opts.stage || D.STAGES[0]);
    var diff = D.diffById(opts.diff || 'normal'), rand = makeRand(opts.seed == null ? 1 : opts.seed);
    var parsed = parseStageGrid(stage.grid);
    var w = baseWorld({ seed: opts.seed, freeze: opts.freeze, intro: opts.intro, round: opts.round || 1, adventure: true, demo: !!opts.demo, arena: stage.arena, stageId: stage.id, par: stage.par, noEnd: opts.noEnd }, parsed.grid, parsed.pipes, rand, diff);
    w.stage = stage;
    w.players.push(makeFighter({ cpu: false, team: 0, skin: opts.skin || 'ninja', name: opts.coop ? 'اللاعب 1' : 'أنت' }, 0, parsed.p1[0], parsed.p1[1], diff));
    if (opts.coop) w.players.push(makeFighter({ cpu: false, team: 0, skin: opts.skin2 || 'shark', name: 'اللاعب 2', face: 1 }, 1, parsed.p2[0], parsed.p2[1], diff));
    var tier = opts.tier || diff.botTier;
    for (var m = 0; m < parsed.mobs.length; m++) {
      var mb = parsed.mobs[m];
      w.players.push(makeFighter({ cpu: true, mob: mb.mob, team: 9, skin: 'neon', name: 'وحش', tier: tier, speed: mb.mob === 'suds' ? 1 : 0, shield: 0, selfMercy: false, face: 3 }, w.players.length, mb.c, mb.r, diff));
    }
    if (stage.boss && parsed.bossAt) {
      var bs = stage.boss, bhp = Math.max(3, bs.hp + (diff.id === 'hero' ? 1 : diff.id === 'easy' ? -1 : 0));
      w.boss = { kind: bs.kind, name: bs.name, x: center(parsed.bossAt.c), y: center(parsed.bossAt.r), hp: bhp, maxHp: bhp, speed: bs.speed, atkCd: bs.atkCd, atkT: bs.atkCd * 0.75, invT: 0, dir: 1, turnT: 0.8 };
    }
    return w;
  };

  function speedOf(p) {
    if (p.mob === 'crab') return 2.5 * TILE;
    if (p.mob === 'bot') return 2.9 * TILE;
    if (p.mob === 'suds') return 3.3 * TILE;
    return BASE_SPD + p.speed * STEP_SPD + (p.mount ? MOUNT_SPD : 0);
  }
  BBEngine.speedOf = speedOf;

  function splashCells(w, c, r, range) {
    var cells = [{ c: c, r: r }];
    for (var d = 0; d < 4; d++) {
      for (var i = 1; i <= range; i++) {
        var cc = c + DIRS[d][0] * i, rr = r + DIRS[d][1] * i;
        if (!inside(cc, rr)) break;
        var t = tile(w, cc, rr);
        if (t === PILLAR || t === JELLY) break;
        cells.push({ c: cc, r: rr });
        if (t === CRATE) break;
      }
    }
    return cells;
  }
  BBEngine.splashCells = splashCells;

  function balloonAt(w, c, r, ignore) {
    for (var i = 0; i < w.balloons.length; i++) {
      var b = w.balloons[i];
      if (!b.gone && !b.lob && b !== ignore && b.c === c && b.r === r) return b;
    }
    return null;
  }

  function startSlide(w, b, dir, kickerId) {
    var nc = b.c + DIRS[dir][0], nr = b.r + DIRS[dir][1];
    if (!inside(nc, nr) || solid(tile(w, nc, nr)) || balloonAt(w, nc, nr, b)) return false;
    b.slide = dir; b.pass = -1; b.warped = false;
    w.events.push({ t: 'kick', id: kickerId, c: b.c, r: b.r });
    return true;
  }

  function blockedAt(w, x, y, p, kickDir) {
    var rad = RADIUS - 0.05;
    var c0 = cellCoord(x - rad), c1 = cellCoord(x + rad), r0 = cellCoord(y - rad), r1 = cellCoord(y + rad);
    for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
      if (!solid(tile(w, c, r))) continue;
      var nx = Math.max(c * TILE, Math.min(x, (c + 1) * TILE)), ny = Math.max(r * TILE, Math.min(y, (r + 1) * TILE));
      if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < rad * rad) return true;
    }
    var reach = rad + 18;
    for (var i = 0; i < w.balloons.length; i++) {
      var b = w.balloons[i];
      if (b.gone || b.lob) continue;
      if (p) {
        if ((p.x - b.x) * (p.x - b.x) + (p.y - b.y) * (p.y - b.y) < reach * reach) continue;
        if (b.pass === p.id) b.pass = -1;
      }
      if ((x - b.x) * (x - b.x) + (y - b.y) * (y - b.y) < reach * reach) {
        if (p && p.kick && kickDir >= 0 && b.slide < 0 && startSlide(w, b, kickDir, p.id)) continue;
        return true;
      }
    }
    return false;
  }

  function tryDrop(w, p) {
    if (p.state !== 'play') return false;
    var live = 0;
    for (var i = 0; i < w.balloons.length; i++) if (!w.balloons[i].gone && w.balloons[i].owner === p.id) live++;
    if (live >= p.balloons) return false;
    var c = cellCoord(p.x), r = cellCoord(p.y);
    if (solid(tile(w, c, r)) || balloonAt(w, c, r, null)) return false;
    w.balloons.push({
      id: w.nextId++, owner: p.id, team: p.team, c: c, r: r, x: center(c), y: center(r),
      fuse: w.fuse, maxFuse: w.fuse, range: p.range, color: D.skinById(p.skin).splash,
      slide: -1, pass: p.id, lob: null, warped: false, gone: false
    });
    if (p.cpu && !p.mob) w.botDrops++;
    w.events.push({ t: 'drop', id: p.id, c: c, r: r });
    return true;
  }
  BBEngine.tryDrop = tryDrop;

  function tryKickOrThrow(w, p) {
    if (!p.kick || p.state !== 'play') return false;
    var dc = DIRS[p.face][0], dr = DIRS[p.face][1], c = cellCoord(p.x), r = cellCoord(p.y);
    var b = balloonAt(w, c + dc, r + dr, null) || balloonAt(w, c, r, null);
    if (!b || b.slide >= 0 || b.lob) return false;
    if (startSlide(w, b, p.face, p.id)) return true;
    for (var step = 2; step <= 4; step++) {
      var tc = b.c + dc * step, tr = b.r + dr * step;
      if (!inside(tc, tr)) break;
      if (!solid(tile(w, tc, tr)) && !balloonAt(w, tc, tr, b)) {
        b.pass = -1;
        b.lob = { sx: b.x, sy: b.y, tx: center(tc), ty: center(tr), tc: tc, tr: tr, t: 0, dur: 0.34 };
        w.events.push({ t: 'throw', id: p.id, c: tc, r: tr });
        return true;
      }
    }
    return false;
  }
  BBEngine.tryKickOrThrow = tryKickOrThrow;

  function nudge(w, p, axis, spd) {
    var pos = axis === 'x' ? p.x : p.y, base = cellCoord(pos), best = null, bestD = FORGIVE + 0.01;
    for (var k = -1; k <= 1; k++) {
      var ctr = center(base + k), d = Math.abs(pos - ctr);
      if (d <= FORGIVE && d < bestD) { bestD = d; best = ctr; }
    }
    if (best == null || bestD < 0.4) return;
    var step = Math.min(spd, bestD), sgn = Math.sign(best - pos);
    var nx = axis === 'x' ? p.x + sgn * step : p.x, ny = axis === 'y' ? p.y + sgn * step : p.y;
    if (!blockedAt(w, nx, ny, p, -1)) { p.x = nx; p.y = ny; }
  }

  function slideMove(w, p, dx, dy, kickDir) {
    if (!dx && !dy) return;
    if (!blockedAt(w, p.x + dx, p.y + dy, p, kickDir)) { p.x += dx; p.y += dy; return; }
    var lo = 0, hi = 1;
    for (var i = 0; i < 5; i++) {
      var m = (lo + hi) * 0.5;
      if (!blockedAt(w, p.x + dx * m, p.y + dy * m, p, -1)) lo = m; else hi = m;
    }
    if (lo > 0.02) { p.x += dx * lo; p.y += dy * lo; }
  }

  function movePlayer(w, p, input, dt) {
    if (p.state !== 'play') return;
    var ix = input && input.x ? (input.x > 0 ? 1 : -1) : 0;
    var iy = input && input.y ? (input.y > 0 ? 1 : -1) : 0;
    if (ix && iy) { if (p.axis === 'v') ix = 0; else iy = 0; }
    if (ix || iy) { p.axis = ix ? 'h' : 'v'; p.bufX = ix; p.bufY = iy; p.bufT = 0.08; }
    else if (p.bufT > 0) { ix = p.bufX; iy = p.bufY; p.bufT -= dt; }
    if (input && input.drop) p.dropBuf = 0.12;
    if (input && input.kick) p.kickBuf = 0.12;
    if (p.dropBuf > 0) { p.dropBuf -= dt; if (tryDrop(w, p)) p.dropBuf = 0; }
    if (p.kickBuf > 0) { p.kickBuf -= dt; if (tryKickOrThrow(w, p)) p.kickBuf = 0; }
    var spd = speedOf(p) * dt;
    if (iy) { p.face = iy > 0 ? 2 : 0; nudge(w, p, 'x', spd * 1.15); slideMove(w, p, 0, iy * spd, p.face); }
    if (ix) { p.face = ix > 0 ? 1 : 3; nudge(w, p, 'y', spd * 1.15); slideMove(w, p, ix * spd, 0, p.face); }
    if (w.pipes.length >= 2 && p.warpCd <= 0) {
      for (var i = 0; i < w.pipes.length; i++) {
        var pipe = w.pipes[i], dx = p.x - center(pipe.c), dy = p.y - center(pipe.r);
        if (dx * dx + dy * dy < 324) {
          var dest = w.pipes[(i + 1) % w.pipes.length];
          if (!balloonAt(w, dest.c, dest.r, null)) {
            p.x = center(dest.c); p.y = center(dest.r); p.warpCd = 1.45;
            w.events.push({ t: 'warp', id: p.id, c: dest.c, r: dest.r });
          }
          break;
        }
      }
    }
  }

  function updateBalloons(w, dt) {
    for (var i = 0; i < w.balloons.length; i++) {
      var b = w.balloons[i];
      if (b.gone) continue;
      if (b.lob) {
        b.lob.t += dt;
        var u = Math.min(1, b.lob.t / b.lob.dur);
        b.x = b.lob.sx + (b.lob.tx - b.lob.sx) * u;
        b.y = b.lob.sy + (b.lob.ty - b.lob.sy) * u;
        if (u >= 1) { b.c = b.lob.tc; b.r = b.lob.tr; b.x = center(b.c); b.y = center(b.r); b.lob = null; }
        continue;
      }
      b.fuse -= dt;
      if (b.slide < 0) { b.x = center(b.c); b.y = center(b.r); continue; }
      var dc = DIRS[b.slide][0], dr = DIRS[b.slide][1];
      var nx = b.x + dc * KICK_SPD * dt, ny = b.y + dr * KICK_SPD * dt, nc = cellCoord(nx), nr = cellCoord(ny);
      if (!inside(nc, nr) || solid(tile(w, nc, nr)) || balloonAt(w, nc, nr, b)) {
        b.slide = -1; b.x = center(b.c); b.y = center(b.r);
      } else {
        b.x = nx; b.y = ny; b.c = nc; b.r = nr;
        if (!b.warped && w.pipes.length >= 2 && tile(w, nc, nr) === PIPE) {
          for (var pi = 0; pi < w.pipes.length; pi++) {
            if (w.pipes[pi].c === nc && w.pipes[pi].r === nr) {
              var outP = w.pipes[(pi + 1) % w.pipes.length];
              if (!balloonAt(w, outP.c, outP.r, b)) {
                b.c = outP.c; b.r = outP.r; b.x = center(b.c); b.y = center(b.r); b.warped = true;
                w.events.push({ t: 'warp', id: -1, c: b.c, r: b.r });
              }
              break;
            }
          }
        }
      }
    }
  }

  function rollLoot(w, c, r) {
    if (w.rand() > (w.adventure ? 0.58 : 0.52)) return;
    var total = 0, j;
    for (j = 0; j < D.POWERUPS.length; j++) total += D.POWERUPS[j].weight;
    var pick = w.rand() * total, acc = 0, chosen = D.POWERUPS[0].id;
    for (j = 0; j < D.POWERUPS.length; j++) { acc += D.POWERUPS[j].weight; if (pick <= acc) { chosen = D.POWERUPS[j].id; break; } }
    w.drops.push({ c: c, r: r, kind: chosen, born: w.time, dead: false });
    w.events.push({ t: 'gift', c: c, r: r, kind: chosen });
  }

  function hitFighter(w, pl, rootOwner, directOwner) {
    if (pl.state !== 'play' || pl.invT > 0) return;
    var ownerPl = directOwner >= 0 && directOwner < w.players.length ? w.players[directOwner] : null;
    if (ownerPl && ownerPl.team === pl.team && pl.id !== directOwner) return;
    var ownBlast = directOwner === pl.id || rootOwner === pl.id;
    if (ownBlast) {
      if (pl.cpu && !pl.mob) w.selfHits++;
      if (pl.selfMercy && !pl.cpu) { pl.invT = 0.85; w.events.push({ t: 'mercy', id: pl.id, x: pl.x, y: pl.y }); return; }
    }
    if (!pl.cpu) w.hitsTaken++;
    if (pl.mount) { pl.mount = false; pl.invT = 1.15; w.events.push({ t: 'unmount', id: pl.id, by: rootOwner, own: ownBlast, x: pl.x, y: pl.y }); return; }
    if (pl.shield > 0) { pl.shield--; pl.invT = 1.15; w.events.push({ t: 'shieldPop', id: pl.id, by: rootOwner, own: ownBlast, x: pl.x, y: pl.y }); return; }
    if (pl.hp > 1) { pl.hp--; pl.invT = 1.0; w.events.push({ t: 'hurt', id: pl.id, by: rootOwner, own: ownBlast, x: pl.x, y: pl.y }); return; }
    pl.hp = 0; pl.state = 'out'; pl.koT = 0; w.lastTeam = pl.team;
    if (rootOwner >= 0 && rootOwner !== pl.id) w.events.push({ t: 'score', id: rootOwner, pts: 100 });
    w.events.push({ t: 'ko', victim: pl.id, by: rootOwner, direct: directOwner, own: ownBlast, cpu: pl.cpu, mob: pl.mob, skin: pl.skin, x: pl.x, y: pl.y });
  }

  function detonate(w, b, root) {
    if (b.gone) return;
    b.gone = true;
    if (root == null) root = b.owner;
    var cells = splashCells(w, b.c, b.r, b.range);
    w.splashes.push({ cells: cells, life: 0.55, max: 0.55, owner: b.owner, color: b.color || '#22b8ff' });
    w.pendingShake = Math.min(14, Math.max(w.pendingShake, 6 + cells.length * 0.4));
    w.events.push({ t: 'boom', id: b.id, owner: b.owner, c: b.c, r: b.r, n: cells.length });
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      for (var d = 0; d < w.drops.length; d++) {
        var drp = w.drops[d];
        if (!drp.dead && drp.c === cell.c && drp.r === cell.r && (w.time - drp.born) > 0.55) drp.dead = true;
      }
      if (tile(w, cell.c, cell.r) === CRATE) {
        setTile(w, cell.c, cell.r, EMPTY);
        w.events.push({ t: 'crate', c: cell.c, r: cell.r, by: root });
        if (root >= 0) w.events.push({ t: 'score', id: root, pts: 10 });
        rollLoot(w, cell.c, cell.r);
      }
      for (var k = 0; k < w.balloons.length; k++) {
        var other = w.balloons[k];
        if (!other.gone && !other.lob && other !== b && other.c === cell.c && other.r === cell.r) { other.fuse = 0; detonate(w, other, root); }
      }
      for (var p = 0; p < w.players.length; p++) {
        var pl = w.players[p];
        if (pl.state === 'play' && cellCoord(pl.x) === cell.c && cellCoord(pl.y) === cell.r) hitFighter(w, pl, root, b.owner);
      }
      if (w.boss && w.boss.hp > 0 && w.boss.invT <= 0 && b.owner >= 0) {
        var bx = w.boss.x - center(cell.c), by = w.boss.y - center(cell.r);
        if (bx * bx + by * by < (TILE * 0.92) * (TILE * 0.92)) {
          w.boss.hp--; w.boss.invT = 0.85; w.pendingShake = 14;
          w.events.push({ t: 'score', id: root, pts: w.boss.hp <= 0 ? 250 : 60 });
          w.events.push({ t: 'bossHit', hp: w.boss.hp, by: root, x: w.boss.x, y: w.boss.y });
          if (w.boss.hp > 0 && w.boss.hp % 2 === 1) rollLoot(w, cell.c, cell.r);
        }
      }
    }
  }

  function tickBoss(w, dt) {
    var boss = w.boss;
    if (!boss || boss.hp <= 0) return;
    boss.invT = Math.max(0, boss.invT - dt); boss.turnT -= dt;
    var rage = boss.hp <= Math.ceil(boss.maxHp * 0.5) ? 1.3 : 1, spd = boss.speed * rage * TILE * dt;
    var dc = DIRS[boss.dir][0], dr = DIRS[boss.dir][1], nx = boss.x + dc * spd, ny = boss.y + dr * spd;
    var aheadC = cellCoord(nx + dc * 24), aheadR = cellCoord(ny + dr * 24);
    if (inside(aheadC, aheadR) && tile(w, aheadC, aheadR) === CRATE) {
      setTile(w, aheadC, aheadR, EMPTY); w.events.push({ t: 'crate', c: aheadC, r: aheadR, by: -1 }); rollLoot(w, aheadC, aheadR);
    }
    if (!inside(aheadC, aheadR) || tile(w, aheadC, aheadR) === PILLAR || boss.turnT <= 0) {
      var bc = cellCoord(boss.x), br = cellCoord(boss.y), opts = [];
      for (var d = 0; d < 4; d++) if (inside(bc + DIRS[d][0], br + DIRS[d][1]) && tile(w, bc + DIRS[d][0], br + DIRS[d][1]) !== PILLAR) opts.push(d);
      if (opts.length) boss.dir = opts[Math.floor(w.rand() * opts.length)];
      boss.turnT = 0.9 + w.rand() * 1.1;
    } else { boss.x = nx; boss.y = ny; }
    boss.atkT -= dt * rage;
    if (boss.atkT <= 0) {
      boss.atkT = boss.atkCd;
      var shots = boss.kind === 'king' ? 3 : (boss.kind === 'octo' ? 2 : 1), hero = w.players[0];
      var hc = hero ? cellCoord(hero.x) : 6, hr = hero ? cellCoord(hero.y) : 4;
      for (var s = 0; s < shots; s++) for (var tries = 0; tries < 10; tries++) {
        var tc2 = Math.max(1, Math.min(COLS - 2, hc + Math.floor(w.rand() * 5) - 2));
        var tr2 = Math.max(1, Math.min(ROWS - 2, hr + Math.floor(w.rand() * 5) - 2));
        if (!solid(tile(w, tc2, tr2)) && !balloonAt(w, tc2, tr2, null)) {
          w.balloons.push({
            id: w.nextId++, owner: -1, team: 9, c: tc2, r: tr2, x: boss.x, y: boss.y,
            fuse: w.fuse + 0.35, maxFuse: w.fuse + 0.35, range: 2, color: '#f43f5e', slide: -1, pass: -1, warped: false, gone: false,
            lob: { sx: boss.x, sy: boss.y, tx: center(tc2), ty: center(tr2), tc: tc2, tr: tr2, t: 0, dur: 0.45 }
          });
          w.events.push({ t: 'bossLob', c: tc2, r: tr2 }); break;
        }
      }
    }
  }

  function checkEnd(w) {
    if (w.noEnd || w.phase !== 'play') return;
    if (w.battle) {
      var teams = [];
      for (var t = 0; t < w.players.length; t++) if (w.players[t].state === 'play' && teams.indexOf(w.players[t].team) < 0) teams.push(w.players[t].team);
      if (teams.length <= 1 || w.time >= CAP_T) {
        w.winner = teams.length === 1 ? teams[0] : (teams.length === 0 ? w.lastTeam : -1);
        w.phase = 'end';
        w.outcome = w.winner === 0 ? 'win' : (w.winner < 0 ? 'draw' : 'lose');
        if (w.winner >= 0) w.events.push({ t: 'score', id: w.winner, pts: 150 });
        w.events.push({ t: 'roundEnd', winner: w.winner, outcome: w.outcome });
      }
      return;
    }
    var humans = 0, mobs = 0;
    for (var i = 0; i < w.players.length; i++) {
      if (w.players[i].state !== 'play') continue;
      if (!w.players[i].cpu) humans++; else if (w.players[i].mob) mobs++;
    }
    if (humans === 0 || w.time >= ADV_CAP_T) { w.phase = 'lost'; w.outcome = 'lose'; w.stars = 0; w.events.push({ t: 'stageEnd', outcome: 'lose', stars: 0 }); return; }
    if (mobs === 0 && (!w.boss || w.boss.hp <= 0)) {
      w.phase = 'won'; w.outcome = 'win';
      w.stars = 1 + (w.time <= w.par ? 1 : 0) + (w.hitsTaken === 0 ? 1 : 0);
      w.events.push({ t: 'score', id: 0, pts: 200 });
      w.events.push({ t: 'stageEnd', outcome: 'win', stars: w.stars });
    }
  }

  function subTick(w, dt, inputs) {
    if (w.freeze > 0) { w.time += dt; w.freeze = Math.max(0, w.freeze - dt); return; }
    w.time += dt;
    for (var i = 0; i < w.players.length; i++) {
      var pl = w.players[i];
      if (pl.invT > 0) pl.invT = Math.max(0, pl.invT - dt);
      if (pl.warpCd > 0) pl.warpCd = Math.max(0, pl.warpCd - dt);
      if (pl.state === 'out') pl.koT += dt;
    }
    if (w.battle && w.time >= SUDDEN_T) {
      w.sudden = true;
      var layer = Math.min(4, Math.floor((w.time - SUDDEN_T) / 3.5) + 1);
      for (var r = 1; r < ROWS - 1; r++) for (var c = 1; c < COLS - 1; c++) {
        if (Math.min(c, r, COLS - 1 - c, ROWS - 1 - r) > layer) continue;
        var tl = tile(w, c, r);
        if (tl === PILLAR || tl === JELLY) continue;
        setTile(w, c, r, JELLY);
        var bl = balloonAt(w, c, r, null); if (bl) bl.fuse = 0;
        for (var sp = 0; sp < w.players.length; sp++) {
          var fp = w.players[sp];
          if (fp.state === 'play' && cellCoord(fp.x) === c && cellCoord(fp.y) === r) {
            fp.state = 'out'; w.lastTeam = fp.team;
            w.events.push({ t: 'ko', victim: fp.id, by: -1, direct: -1, own: false, cpu: fp.cpu, mob: fp.mob, skin: fp.skin, x: fp.x, y: fp.y });
          }
        }
      }
    }
    for (var j = 0; j < w.players.length; j++) movePlayer(w, w.players[j], inputs ? inputs[j] : null, dt);
    updateBalloons(w, dt);
    tickBoss(w, dt);
    var due = [];
    for (var b = 0; b < w.balloons.length; b++) if (!w.balloons[b].gone && !w.balloons[b].lob && w.balloons[b].fuse <= 0) due.push(w.balloons[b]);
    due.sort(function (x, y) { return x.id - y.id; });
    for (var d = 0; d < due.length; d++) detonate(w, due[d], due[d].owner);
    w.balloons = w.balloons.filter(function (x) { return !x.gone; });

    for (var pk = 0; pk < w.players.length; pk++) {
      var hp = w.players[pk];
      if (hp.state !== 'play' || hp.mob) continue;
      var hc = cellCoord(hp.x), hr = cellCoord(hp.y);
      for (var di = 0; di < w.drops.length; di++) {
        var drp = w.drops[di];
        if (drp.dead || drp.c !== hc || drp.r !== hr) continue;
        drp.dead = true;
        if (drp.kind === 'balloon') hp.balloons = Math.min(6, hp.balloons + 1);
        else if (drp.kind === 'range') hp.range = Math.min(6, hp.range + 1);
        else if (drp.kind === 'speed') hp.speed = Math.min(4, hp.speed + 1);
        else if (drp.kind === 'kick') hp.kick = true;
        else if (drp.kind === 'shield') hp.shield = 1;
        else if (drp.kind === 'turtle') hp.mount = true;
        w.events.push({ t: 'item', id: hp.id, kind: drp.kind, c: hc, r: hr });
        w.events.push({ t: 'score', id: hp.id, pts: 15 });
      }
    }
    w.drops = w.drops.filter(function (x) { return !x.dead; });

    if (w.adventure) {
      for (var hi = 0; hi < w.players.length; hi++) {
        var hero = w.players[hi];
        if (hero.cpu || hero.state !== 'play' || hero.invT > 0) continue;
        for (var mi = 0; mi < w.players.length; mi++) {
          var mob = w.players[mi];
          if (mob.mob && mob.state === 'play' && (hero.x - mob.x) * (hero.x - mob.x) + (hero.y - mob.y) * (hero.y - mob.y) < (RADIUS * 1.7) * (RADIUS * 1.7)) hitFighter(w, hero, mob.id, mob.id);
        }
        if (w.boss && w.boss.hp > 0 && (hero.x - w.boss.x) * (hero.x - w.boss.x) + (hero.y - w.boss.y) * (hero.y - w.boss.y) < (TILE * 0.72) * (TILE * 0.72)) hitFighter(w, hero, -1, -1);
      }
    }
    for (var s = w.splashes.length - 1; s >= 0; s--) { w.splashes[s].life -= dt; if (w.splashes[s].life <= 0) w.splashes.splice(s, 1); }
    if (w.events.length > 64) w.events.splice(0, w.events.length - 64);
    checkEnd(w);
  }

  BBEngine.step = function (w, dt, inputs) {
    if (!w || w.phase !== 'play') return w;
    var left = dt > 0 ? Math.min(dt, 0.25) : 0, first = true;
    while (left > 1e-5 && w.phase === 'play') {
      var h = Math.min(1 / 30, left);
      var ins = (!first && inputs) ? inputs.map(function (inp) { return inp ? { x: inp.x || 0, y: inp.y || 0, drop: false, kick: false } : null; }) : inputs;
      subTick(w, h, ins);
      first = false; left -= h;
    }
    return w;
  };

  BBEngine.forceEnd = function (w, winnerTeam) {
    for (var i = 0; i < w.players.length; i++) if (w.players[i].team !== winnerTeam) w.players[i].state = 'out';
    if (w.boss && winnerTeam === 0) w.boss.hp = 0;
    w.freeze = 0; checkEnd(w);
    return w;
  };

  BBEngine.put = function (w, i, c, r, dx, dy) {
    var p = w.players[i]; p.x = center(c) + (dx || 0); p.y = center(r) + (dy || 0); p.state = 'play';
    return p;
  };

  BBEngine.addBalloon = function (w, o) {
    var b = {
      id: o.id || w.nextId++, owner: o.owner == null ? 0 : o.owner, team: o.team == null ? 0 : o.team,
      c: o.c, r: o.r, x: center(o.c), y: center(o.r), fuse: o.fuse == null ? w.fuse : o.fuse, maxFuse: w.fuse,
      range: o.range || 1, color: o.color || '#22b8ff', slide: o.slide == null ? -1 : o.slide,
      pass: o.pass == null ? -1 : o.pass, lob: null, warped: false, gone: false
    };
    w.balloons.push(b);
    if (b.id >= w.nextId) w.nextId = b.id + 1;
    return b;
  };

  BBEngine.addDrop = function (w, c, r, kind) { w.drops.push({ c: c, r: r, kind: kind, born: -1, dead: false }); };

  if (typeof module !== 'undefined' && module.exports) module.exports = BBEngine;
  if (typeof window !== 'undefined') window.BBEngine = BBEngine;
  globalThis.BBEngine = BBEngine;
})();
