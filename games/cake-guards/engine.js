/* Cake Guards pure simulation: auto-spawning waves, starter turret, active Frosting Blaster
 * with knockback, 1-click turret auto-place/upgrade, and deterministic physics. No DOM or Kit. */
(function (CG) {
  'use strict';
  const gx = i => 40 + 80 * i, gy = j => 100 + 80 * j;

  /* ------------------------------------------------------------- roads */
  function makeRoad(points) {
    const pts = points.map(p => ({ x: gx(p[0]), y: gy(p[1]) })), segs = [];
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y);
      segs.push({ x: a.x, y: a.y, dx: (b.x - a.x) / l, dy: (b.y - a.y) / l, len: l, start: len });
      len += l;
    }
    return { pts, segs, len };
  }
  function pointAt(road, d, out) {
    out = out || {};
    const segs = road.segs;
    let i = out.seg || 0;
    if (i >= segs.length || d < segs[i].start) i = 0;
    while (i < segs.length - 1 && d >= segs[i].start + segs[i].len) i++;
    out.seg = i;
    const s = segs[i], t = Math.max(0, Math.min(s.len, d - s.start));
    out.x = s.x + s.dx * t; out.y = s.y + s.dy * t; out.dx = s.dx; out.dy = s.dy;
    return out;
  }
  function segDist(s, x, y) {
    const t = Math.max(0, Math.min(s.len, (x - s.x) * s.dx + (y - s.y) * s.dy));
    return Math.hypot(x - (s.x + s.dx * t), y - (s.y + s.dy * t));
  }
  function roadDist(roads, x, y) {
    let best = Infinity;
    for (const r of roads) for (const s of r.segs) best = Math.min(best, segDist(s, x, y));
    return best;
  }
  CG.makeRoad = makeRoad; CG.pointAt = pointAt; CG.roadDist = roadDist;

  const padCache = new WeakMap();
  function padsFor(def) {
    if (padCache.has(def)) return padCache.get(def).map(p => ({ x: p.x, y: p.y, cover: p.cover }));
    const roads = def.roads.map(makeRoad), cake = roads[0].pts[roads[0].pts.length - 1];
    const near = CG.ROAD + CG.PAD + 6, far = CG.ROAD + CG.PAD + 46, samples = [];
    for (const r of roads) for (let d = 0; d < r.len; d += 20) {
      const p = pointAt(r, d); if (p.x > 0 && p.x < CG.W) samples.push(p);
    }
    const cands = [];
    for (let y = CG.TOP + CG.PAD + 6; y <= CG.BAR - CG.PAD - 6; y += 20) {
      for (let x = CG.PAD + 10; x <= CG.W - CG.PAD - 10; x += 20) {
        const dist = roadDist(roads, x, y);
        if (dist < near || dist > far || Math.hypot(x - cake.x, y - cake.y) < 100) continue;
        if (x > CG.W - 110 && y < 140) continue;
        let cover = 0;
        for (const p of samples) if (Math.hypot(p.x - x, p.y - y) < 145) cover++;
        cands.push({ x, y, cover });
      }
    }
    cands.sort((a, b) => b.cover - a.cover || a.y - b.y || a.x - b.x);
    const pads = [], max = def.pads || 14;
    for (const c of cands) {
      if (pads.length >= max) break;
      if (pads.every(p => Math.hypot(p.x - c.x, p.y - c.y) >= CG.PAD * 2 + 20)) pads.push({ x: c.x, y: c.y, cover: c.cover });
    }
    pads.sort((a, b) => a.y - b.y || b.x - a.x);
    padCache.set(def, pads);
    return padsFor(def);
  }
  CG.padsFor = padsFor;

  // Best free pad by road coverage (used for starter turret, glowing pad & 1-click bar).
  CG.bestPad = function (world) {
    let best = -1, score = -1;
    for (let i = 0; i < world.pads.length; i++) {
      const p = world.pads[i];
      if (!p.tower && p.cover > score) { score = p.cover; best = i; }
    }
    return best;
  };

  /* ------------------------------------------------------------- waves */
  function parseWave(text) {
    return String(text).trim().split(/\s+/).map(part => {
      const m = /^([a-z])(\d+)(?:\/([\d.]+))?$/.exec(part);
      if (!m || !CG.ENEMIES[m[1]]) throw new Error('bad wave group: ' + part);
      return { type: m[1], n: +m[2], gap: m[3] ? +m[3] : 0.65 };
    });
  }
  CG.parseWave = parseWave;
  CG.endlessWave = function (k) {
    const kinds = k < 3 ? 'g' : k < 5 ? 'gz' : k < 8 ? 'gzc' : k < 11 ? 'gzcs' : 'gzcsa';
    const gap = Math.max(0.22, 0.65 - k * 0.02).toFixed(2), n = 7 + Math.floor(k * 1.15);
    const a = kinds[k % kinds.length], b = kinds[(k * 3 + 1) % kinds.length];
    const big = a === 'c' || a === 'a' ? Math.ceil(n / 3) : n;
    let wave = a + big + '/' + gap + ' ' + b + Math.ceil(n / 2) + '/' + gap;
    if (k % 10 === 0) wave += ' ' + (k >= 20 ? 'b' : 'k') + Math.max(1, Math.floor(k / 20)) + '/3.5';
    return wave;
  };
  CG.endlessHp = k => Math.pow(1.09, k - 1);

  /* ------------------------------------------------------------- world */
  CG.create = function (def, opts) {
    opts = opts || {};
    const world = {
      def, roads: def.roads.map(makeRoad),
      pads: padsFor(def).map(p => ({ x: p.x, y: p.y, cover: p.cover, tower: null })),
      enemies: [], shots: [], ev: [], coins: def.coins, hearts: CG.HEARTS, wave: 0,
      total: def.endless ? Infinity : def.waves.length, phase: 'intro', breakT: CG.INTRO, time: 0,
      queue: [], spawnT: 0, spawned: 0, nextId: 1, pops: 0, leaks: 0,
      blasts: 0, blastCd: 0, combo: 0, comboT: 0, hpMult: opts.hpMult || 1
    };
    const last = world.roads[0].pts[world.roads[0].pts.length - 1];
    world.cake = { x: last.x, y: last.y };
    // Free starter Frosting Turret already placed & ready to fire at Wave 1!
    if (def.starter !== false && opts.starter !== false) {
      const sp = CG.bestPad(world);
      if (sp >= 0) world.pads[sp].tower = { type: 'pop', lv: 0, spent: 0, cd: 0.12, angle: -Math.PI / 2, kick: 0, free: true };
    }
    return world;
  };
  function waveText(w, k) { return w.def.endless ? CG.endlessWave(k) : w.def.waves[k - 1]; }
  function hpScale(w) { return w.def.hp * w.hpMult * (w.def.endless ? CG.endlessHp(w.wave) : 1); }

  CG.callWave = function (world) {
    if (world.phase !== 'intro' && world.phase !== 'break') return false;
    if (world.wave >= world.total) return false;
    world.wave++;
    world.queue = parseWave(waveText(world, world.wave)).map(g => ({ type: g.type, n: g.n, gap: g.gap }));
    world.spawnT = 0; world.breakT = 0; world.phase = 'wave';
    world.ev.push({ t: 'wave', n: world.wave });
    return true;
  };

  function spawn(world, type, road, d, scale) {
    const e = CG.ENEMIES[type], hp = Math.max(1, Math.round(e.hp * scale));
    const blob = {
      id: world.nextId++, type, hp, max: hp, d, road, x: 0, y: 0, dx: 1, dy: 0,
      slow: 0, slowT: 0, hitT: 0, knockT: 0, armor: e.armor || 0, gone: false
    };
    pointAt(world.roads[road], d, blob);
    world.enemies.push(blob);
    world.ev.push({ t: 'spawn', type });
    return blob;
  }

  function damage(world, blob, dmg, pierce, knock) {
    if (blob.gone) return;
    blob.hp -= pierce ? dmg : Math.max(1, dmg - blob.armor);
    blob.hitT = 0.13;
    if (knock > 0 && blob.hp > 0) {
      const e = CG.ENEMIES[blob.type];
      blob.d = Math.max(0, blob.d - (e.boss ? knock * 0.35 : knock));
      blob.knockT = 0.18;
      pointAt(world.roads[blob.road], blob.d, blob);
    }
    if (blob.hp > 0) return;
    const e = CG.ENEMIES[blob.type];
    blob.gone = true;
    const reward = Math.round(e.reward * Math.sqrt(world.def.endless ? CG.endlessHp(world.wave) : world.def.hp));
    world.coins += reward;
    world.pops++;
    world.combo = world.comboT > 0 ? world.combo + 1 : 1;
    world.comboT = 2.2;
    world.ev.push({ t: 'pop', type: blob.type, x: blob.x, y: blob.y, reward, boss: !!e.boss, combo: world.combo });
    if (e.split) e.split.forEach((kid, i) => {
      const child = spawn(world, kid, blob.road, Math.max(0, blob.d + (i ? 8 : -8)), hpScale(world));
      child.hitT = 0;
    });
  }

  /* --------------------------------------------------- frosting blaster */
  // Player's active Frosting Cannon! Click/hold anywhere or press Space to auto-blast the lead blob.
  CG.blast = function (world, tx, ty) {
    if (!world || world.phase === 'won' || world.phase === 'lost' || world.blastCd > 0) return false;
    let x = tx, y = ty;
    if (x == null || y == null) {
      let lead = null;
      for (const b of world.enemies) if (!b.gone && (!lead || b.d > lead.d)) lead = b;
      if (lead) { x = lead.x; y = lead.y; }
      else { const p = pointAt(world.roads[0], 180); x = p.x; y = p.y; }
    }
    const sx = world.cake.x, sy = world.cake.y - 42;
    const dist = Math.hypot(x - sx, y - sy);
    const B = CG.BLASTER, T = Math.max(0.08, Math.min(0.42, dist / B.speed));
    world.blastCd = B.cd;
    world.blasts++;
    world.shots.push({ kind: 'frost', x: sx, y: sy, sx, sy, tx: x, ty: y, t: 0, T, dmg: B.dmg, splash: B.splash, knock: B.knock });
    world.ev.push({ t: 'blast', sx, sy, tx: x, ty: y });
    return true;
  };

  /* ------------------------------------------------------------- towers */
  CG.towerLevel = tower => CG.TOWERS[tower.type].lv[tower.lv];
  CG.build = function (world, pad, type) {
    const p = world.pads[pad], spec = CG.TOWERS[type];
    if (!p || p.tower || !spec || world.def.towers.indexOf(type) < 0) return false;
    if (world.phase === 'won' || world.phase === 'lost') return false;
    const cost = spec.lv[0].cost;
    if (world.coins < cost) return false;
    world.coins -= cost;
    p.tower = { type, lv: 0, spent: cost, cd: 0.18, angle: -Math.PI / 2, kick: 0 };
    world.ev.push({ t: 'build', pad, type });
    return true;
  };
  CG.upgradeCost = function (world, pad) {
    const tw = world.pads[pad] && world.pads[pad].tower;
    if (!tw) return null;
    const next = CG.TOWERS[tw.type].lv[tw.lv + 1];
    return next ? next.cost : null;
  };
  CG.upgrade = function (world, pad) {
    const tw = world.pads[pad] && world.pads[pad].tower, cost = CG.upgradeCost(world, pad);
    if (!tw || cost === null || world.coins < cost || world.phase === 'won' || world.phase === 'lost') return false;
    world.coins -= cost; tw.spent += cost; tw.lv++;
    world.ev.push({ t: 'upgrade', pad, lv: tw.lv });
    return true;
  };
  CG.sellValue = function (world, pad) {
    const tw = world.pads[pad] && world.pads[pad].tower;
    return tw ? Math.floor(tw.spent * CG.SELL) : 0;
  };
  CG.sell = function (world, pad) {
    const p = world.pads[pad];
    if (!p || !p.tower || world.phase === 'won' || world.phase === 'lost') return false;
    const value = CG.sellValue(world, pad);
    world.coins += value; p.tower = null;
    world.ev.push({ t: 'sell', pad, value });
    return true;
  };
  // 1-click bottom turret card action: builds on best glowing pad, or upgrades best matching turret when pads are full.
  CG.quickAct = function (world, type) {
    if (!world || !CG.TOWERS[type] || world.phase === 'won' || world.phase === 'lost') return { ok: false };
    const free = CG.bestPad(world);
    if (free >= 0) {
      if (CG.build(world, free, type)) return { ok: true, kind: 'build', pad: free };
      return { ok: false, need: CG.TOWERS[type].lv[0].cost - world.coins, pad: free };
    }
    let upPad = -1, bestLv = 99;
    for (let i = 0; i < world.pads.length; i++) {
      const tw = world.pads[i].tower, c = CG.upgradeCost(world, i);
      if (tw && c !== null && tw.type === type && tw.lv < bestLv) { bestLv = tw.lv; upPad = i; }
    }
    if (upPad < 0) for (let i = 0; i < world.pads.length; i++) {
      const c = CG.upgradeCost(world, i);
      if (c !== null && world.pads[i].tower.lv < bestLv) { bestLv = world.pads[i].tower.lv; upPad = i; }
    }
    if (upPad >= 0 && CG.upgrade(world, upPad)) return { ok: true, kind: 'upgrade', pad: upPad };
    return { ok: false, need: upPad >= 0 ? CG.upgradeCost(world, upPad) - world.coins : 0, pad: upPad };
  };

  const picked = [];
  function targets(world, p, lv, count) {
    picked.length = 0;
    const r2 = lv.range * lv.range;
    for (const b of world.enemies) {
      if (b.gone || b.d <= 0) continue;
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy > r2) continue;
      let at = picked.length;
      while (at > 0 && b.d > picked[at - 1].d) at--;
      if (at < count) { picked.splice(at, 0, b); if (picked.length > count) picked.pop(); }
    }
    return picked;
  }
  function fire(world, pi, p, tw) {
    const lv = CG.towerLevel(tw), hit = targets(world, p, lv, lv.multi || 1);
    if (!hit.length) return false;
    tw.angle = Math.atan2(hit[0].y - p.y, hit[0].x - p.x); tw.kick = 1;
    world.ev.push({ t: 'shoot', type: tw.type, pad: pi, x: p.x, y: p.y });
    for (const b of hit) {
      if (tw.type === 'cake') {
        const T = 0.45, e = CG.ENEMIES[b.type], ahead = pointAt(world.roads[b.road], b.d + e.speed * (b.slowT > 0 ? 1 - b.slow : 1) * T);
        world.shots.push({ kind: 'cake', x: p.x, y: p.y, sx: p.x, sy: p.y, tx: ahead.x, ty: ahead.y, t: 0, T, dmg: lv.dmg, splash: lv.splash, pierce: !!lv.pierce });
      } else {
        world.shots.push({
          kind: tw.type, x: p.x, y: p.y, target: b.id, tx: b.x, ty: b.y, speed: tw.type === 'pop' ? 700 : 480,
          dmg: lv.dmg, slow: lv.slow || 0, slowT: lv.slowT || 0, area: lv.area || 0
        });
      }
    }
    return true;
  }
  function stepShots(world, dt) {
    const byId = {};
    for (const b of world.enemies) if (!b.gone) byId[b.id] = b;
    for (const s of world.shots) {
      if (s.kind === 'cake' || s.kind === 'frost') {
        s.t += dt;
        const k = Math.min(1, s.t / s.T);
        s.x = s.sx + (s.tx - s.sx) * k; s.y = s.sy + (s.ty - s.sy) * k;
        if (k >= 1) {
          s.done = true;
          world.ev.push({ t: s.kind === 'frost' ? 'splat' : 'splash', x: s.tx, y: s.ty, r: s.splash });
          const padR = s.kind === 'frost' ? 0.75 : 0.55;
          for (const b of world.enemies.slice()) {
            if (!b.gone && Math.hypot(b.x - s.tx, b.y - s.ty) <= s.splash + CG.ENEMIES[b.type].r * padR) {
              damage(world, b, s.dmg, s.kind === 'frost' ? true : !!s.pierce, s.knock || 0);
            }
          }
        }
        continue;
      }
      const b = byId[s.target];
      if (b) { s.tx = b.x; s.ty = b.y; }
      const dx = s.tx - s.x, dy = s.ty - s.y, dist = Math.hypot(dx, dy), stepLen = s.speed * dt;
      if (dist <= stepLen + (b ? CG.ENEMIES[b.type].r * 0.55 : 0)) {
        s.done = true;
        if (b && !b.gone) {
          world.ev.push({ t: 'hit', kind: s.kind, x: b.x, y: b.y, r: s.area });
          if (s.slow) for (const o of world.enemies) {
            if (o.gone || (o !== b && Math.hypot(o.x - b.x, o.y - b.y) > s.area)) continue;
            o.slow = Math.max(o.slow, s.slow * (CG.ENEMIES[o.type].boss ? 0.5 : 1));
            o.slowT = Math.max(o.slowT, s.slowT);
          }
          damage(world, b, s.dmg, false, 0);
        }
      } else { s.x += dx / dist * stepLen; s.y += dy / dist * stepLen; }
    }
    world.shots = world.shots.filter(s => !s.done);
  }

  /* ------------------------------------------------------------- step */
  CG.step = function (world, dt) {
    if (world.phase === 'won' || world.phase === 'lost') return;
    world.time += dt;
    if (world.blastCd > 0) world.blastCd = Math.max(0, world.blastCd - dt);
    if (world.comboT > 0) { world.comboT -= dt; if (world.comboT <= 0) { world.comboT = 0; world.combo = 0; } }
    if (world.phase === 'intro' || world.phase === 'break') {
      world.breakT -= dt;
      if (world.breakT <= 0) CG.callWave(world);
    }
    if (world.phase === 'wave' && world.queue.length) {
      world.spawnT -= dt;
      while (world.queue.length && world.spawnT <= 0) {
        const g = world.queue[0];
        spawn(world, g.type, world.spawned % world.roads.length, 0, hpScale(world));
        world.spawned++;
        if (--g.n <= 0) world.queue.shift();
        world.spawnT += world.queue.length ? world.queue[0].gap : 0;
        if (CG.ENEMIES[g.type].boss) world.ev.push({ t: 'boss', type: g.type });
      }
    }
    for (const b of world.enemies) {
      if (b.gone) continue;
      const e = CG.ENEMIES[b.type];
      if (b.slowT > 0 && (b.slowT -= dt) <= 0) { b.slowT = 0; b.slow = 0; }
      if (b.hitT > 0) b.hitT -= dt;
      if (b.knockT > 0) b.knockT -= dt;
      b.d += e.speed * (1 - b.slow) * dt;
      const road = world.roads[b.road];
      if (b.d >= road.len) {
        b.gone = true;
        world.hearts = Math.max(0, world.hearts - e.bite);
        world.leaks += e.bite;
        world.ev.push({ t: 'leak', type: b.type, bite: e.bite, x: world.cake.x, y: world.cake.y });
        if (world.hearts <= 0) break;
      } else pointAt(road, b.d, b);
    }
    if (world.hearts <= 0) {
      world.phase = 'lost';
      world.enemies = world.enemies.filter(b => !b.gone);
      world.ev.push({ t: 'lose' });
      return;
    }
    for (let i = 0; i < world.pads.length; i++) {
      const p = world.pads[i], tw = p.tower;
      if (!tw) continue;
      if (tw.kick > 0) tw.kick = Math.max(0, tw.kick - dt * 6);
      tw.cd -= dt;
      if (tw.cd <= 0) { if (fire(world, i, p, tw)) tw.cd += CG.towerLevel(tw).cd; else tw.cd = 0; }
    }
    stepShots(world, dt);
    world.enemies = world.enemies.filter(b => !b.gone);
    if (world.phase === 'wave' && !world.queue.length && !world.enemies.length) {
      if (world.wave >= world.total) {
        world.phase = 'won';
        world.ev.push({ t: 'win', stars: CG.stars(world) });
      } else {
        const bonus = 16 + world.wave * 4;
        world.coins += bonus;
        world.phase = 'break';
        world.breakT = CG.BREAK;
        world.ev.push({ t: 'clear', n: world.wave, bonus });
      }
    }
  };
  CG.stars = world => world.hearts >= CG.HEARTS - 2 ? 3 : world.hearts >= CG.HEARTS / 2 ? 2 : 1;
})(globalThis.CG = globalThis.CG || {});
