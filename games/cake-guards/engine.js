/* Cake Guards simulation: roads, build pads, towers, blobs and waves. No randomness,
 * no drawing and no Kit, so Node tests and the level verifier run it as the game does. */
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
    return { pts: pts, segs: segs, len: len };
  }
  // Position on a road d pixels from its start (clamped to the road). A blob keeps the
  // segment it is on in out.seg, so following the road does not search it every frame.
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
  CG.makeRoad = makeRoad;
  CG.pointAt = pointAt;
  CG.roadDist = roadDist;

  // Build pads sit right beside the road. Each level gets the same pads every time:
  // candidates on a 20 px lattice, ranked by how much road a short-range tower there
  // would cover, then picked so no two pads touch.
  const padCache = new WeakMap();
  function padsFor(def) {
    if (padCache.has(def)) return padCache.get(def).map(p => ({ x: p.x, y: p.y }));
    const roads = def.roads.map(makeRoad), cake = roads[0].pts[roads[0].pts.length - 1];
    const near = CG.ROAD + CG.PAD + 6, far = CG.ROAD + CG.PAD + 46, samples = [];
    for (const r of roads) for (let d = 0; d < r.len; d += 20) {
      const p = pointAt(r, d);
      if (p.x > 0 && p.x < CG.W) samples.push(p);
    }
    const cands = [];
    for (let y = CG.TOP + CG.PAD + 6; y <= CG.BAR - CG.PAD - 6; y += 20) {
      for (let x = CG.PAD + 10; x <= CG.W - CG.PAD - 10; x += 20) {
        const dist = roadDist(roads, x, y);
        if (dist < near || dist > far || Math.hypot(x - cake.x, y - cake.y) < 100) continue;
        if (x > CG.W - 110 && y < 140) continue; // the mute button's corner
        let cover = 0;
        for (const p of samples) if (Math.hypot(p.x - x, p.y - y) < 140) cover++;
        cands.push({ x: x, y: y, cover: cover });
      }
    }
    cands.sort((a, b) => b.cover - a.cover || a.y - b.y || a.x - b.x);
    const pads = [], max = def.pads || 14;
    for (const c of cands) {
      if (pads.length >= max) break;
      if (pads.every(p => Math.hypot(p.x - c.x, p.y - c.y) >= CG.PAD * 2 + 20)) pads.push({ x: c.x, y: c.y });
    }
    // Reading order (top to bottom, then right to left) gives the keyboard a stable tour.
    pads.sort((a, b) => a.y - b.y || b.x - a.x);
    padCache.set(def, pads);
    return padsFor(def);
  }
  CG.padsFor = padsFor;

  /* ------------------------------------------------------------- waves */
  // 'g8/0.6 c2' -> [{ type: 'g', n: 8, gap: 0.6 }, { type: 'c', n: 2, gap: 0.9 }]
  function parseWave(text) {
    return String(text).trim().split(/\s+/).map(part => {
      const m = /^([a-z])(\d+)(?:\/([\d.]+))?$/.exec(part);
      if (!m || !CG.ENEMIES[m[1]]) throw new Error('bad wave group: ' + part);
      return { type: m[1], n: +m[2], gap: m[3] ? +m[3] : 0.9 };
    });
  }
  CG.parseWave = parseWave;
  // Endless waves keep growing; every tenth brings a king.
  CG.endlessWave = function (k) {
    const kinds = k < 3 ? 'g' : k < 5 ? 'gz' : k < 8 ? 'gzc' : k < 12 ? 'gzcs' : 'gzcsa';
    const gap = Math.max(0.25, 0.85 - k * 0.025).toFixed(2), n = 6 + Math.floor(k * 1.1);
    const a = kinds[k % kinds.length], b = kinds[(k * 3 + 1) % kinds.length];
    const big = a === 'c' || a === 'a' ? Math.ceil(n / 3) : n;
    let wave = a + big + '/' + gap + ' ' + b + Math.ceil(n / 2) + '/' + gap;
    if (k % 10 === 0) wave += ' ' + (k >= 20 ? 'b' : 'k') + Math.max(1, Math.floor(k / 20)) + '/4';
    return wave;
  };
  CG.endlessHp = k => Math.pow(1.08, k - 1);

  /* ------------------------------------------------------------- world */
  CG.create = function (def) {
    const world = {
      def: def, roads: def.roads.map(makeRoad), pads: padsFor(def).map(p => ({ x: p.x, y: p.y, tower: null })),
      enemies: [], shots: [], ev: [], coins: def.coins, hearts: CG.HEARTS, wave: 0,
      total: def.endless ? Infinity : def.waves.length, phase: 'build', breakT: 0, time: 0,
      queue: [], spawnT: 0, spawned: 0, nextId: 1, pops: 0, leaks: 0
    };
    const last = world.roads[0].pts[world.roads[0].pts.length - 1];
    world.cake = { x: last.x, y: last.y };
    return world;
  };
  function waveText(world, k) { return world.def.endless ? CG.endlessWave(k) : world.def.waves[k - 1]; }
  function hpScale(world) { return world.def.hp * (world.def.endless ? CG.endlessHp(world.wave) : 1); }

  // The next wave starts now. Calling it early during a break pays the seconds left.
  CG.callWave = function (world) {
    if (world.phase !== 'build' && world.phase !== 'break') return false;
    if (world.wave >= world.total) return false;
    if (world.phase === 'break') {
      const bonus = Math.ceil(world.breakT) * 2;
      if (bonus > 0) { world.coins += bonus; world.ev.push({ t: 'early', bonus: bonus }); }
    }
    world.wave++;
    world.queue = parseWave(waveText(world, world.wave)).map(g => ({ type: g.type, n: g.n, gap: g.gap }));
    world.spawnT = 0;
    world.phase = 'wave';
    world.ev.push({ t: 'wave', n: world.wave });
    return true;
  };

  function spawn(world, type, road, d, scale) {
    const e = CG.ENEMIES[type], hp = Math.max(1, Math.round(e.hp * scale));
    const blob = { id: world.nextId++, type: type, hp: hp, max: hp, d: d, road: road, x: 0, y: 0, dx: 1, dy: 0,
      slow: 0, slowT: 0, hitT: 0, armor: e.armor || 0, gone: false };
    pointAt(world.roads[road], d, blob);
    world.enemies.push(blob);
    world.ev.push({ t: 'spawn', type: type });
    return blob;
  }

  function damage(world, blob, dmg, pierce) {
    if (blob.gone) return;
    blob.hp -= pierce ? dmg : Math.max(1, dmg - blob.armor);
    blob.hitT = 0.12;
    if (blob.hp > 0) return;
    const e = CG.ENEMIES[blob.type];
    blob.gone = true;
    // Tougher levels pay more per blob, so later levels can still afford their towers.
    const reward = Math.round(e.reward * Math.sqrt(world.def.endless ? CG.endlessHp(world.wave) : world.def.hp));
    world.coins += reward;
    world.pops++;
    world.ev.push({ t: 'pop', type: blob.type, x: blob.x, y: blob.y, reward: reward, boss: !!e.boss });
    if (e.split) e.split.forEach((kid, i) => {
      // Children keep going from just behind and ahead of their parent.
      const child = spawn(world, kid, blob.road, Math.max(0, blob.d + (i ? 8 : -8)), hpScale(world));
      child.hitT = 0;
    });
  }

  /* ------------------------------------------------------------- towers */
  CG.towerLevel = (tower) => CG.TOWERS[tower.type].lv[tower.lv];
  CG.build = function (world, pad, type) {
    const p = world.pads[pad], spec = CG.TOWERS[type];
    if (!p || p.tower || !spec || world.def.towers.indexOf(type) < 0) return false;
    if (world.phase === 'won' || world.phase === 'lost') return false;
    const cost = spec.lv[0].cost;
    if (world.coins < cost) return false;
    world.coins -= cost;
    p.tower = { type: type, lv: 0, spent: cost, cd: 0.25, angle: -Math.PI / 2, kick: 0 };
    world.ev.push({ t: 'build', pad: pad, type: type });
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
    world.ev.push({ t: 'upgrade', pad: pad, lv: tw.lv });
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
    world.ev.push({ t: 'sell', pad: pad, value: value });
    return true;
  };

  // The best `count` blobs in range, best first, in one pass (towers look every frame).
  const picked = [];
  function targets(world, p, lv, aim, count) {
    picked.length = 0;
    const r2 = lv.range * lv.range, strong = aim === 'strong';
    for (const b of world.enemies) {
      if (b.gone || b.d <= 0) continue;
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy > r2) continue;
      let at = picked.length;
      while (at > 0 && (strong ? b.hp > picked[at - 1].hp || (b.hp === picked[at - 1].hp && b.d > picked[at - 1].d) : b.d > picked[at - 1].d)) at--;
      if (at < count) { picked.splice(at, 0, b); if (picked.length > count) picked.pop(); }
    }
    return picked;
  }

  function fire(world, pi, p, tw) {
    const lv = CG.towerLevel(tw), spec = CG.TOWERS[tw.type];
    const hit = targets(world, p, lv, spec.aim, lv.multi || 1);
    if (!hit.length) return false;
    tw.angle = Math.atan2(hit[0].y - p.y, hit[0].x - p.x);
    tw.kick = 1;
    world.ev.push({ t: 'shoot', type: tw.type, pad: pi, x: p.x, y: p.y });
    if (tw.type === 'cane') {
      // A zap lands at once.
      world.ev.push({ t: 'zap', x: p.x, y: p.y, tx: hit[0].x, ty: hit[0].y });
      damage(world, hit[0], lv.dmg, true);
      return true;
    }
    for (const b of hit) {
      if (tw.type === 'cake') {
        // Lobbed at where the blob will be when it lands.
        const T = 0.6, e = CG.ENEMIES[b.type], ahead = pointAt(world.roads[b.road], b.d + e.speed * (b.slowT > 0 ? 1 - b.slow : 1) * T);
        world.shots.push({ kind: 'cake', x: p.x, y: p.y, sx: p.x, sy: p.y, tx: ahead.x, ty: ahead.y, t: 0, T: T, dmg: lv.dmg, splash: lv.splash });
      } else {
        world.shots.push({ kind: tw.type, x: p.x, y: p.y, target: b.id, tx: b.x, ty: b.y, speed: tw.type === 'pop' ? 640 : 430,
          dmg: lv.dmg, slow: lv.slow || 0, slowT: lv.slowT || 0, area: lv.area || 0 });
      }
    }
    return true;
  }

  function stepShots(world, dt) {
    const byId = {};
    for (const b of world.enemies) if (!b.gone) byId[b.id] = b;
    for (const s of world.shots) {
      if (s.kind === 'cake') {
        s.t += dt;
        const k = Math.min(1, s.t / s.T);
        s.x = s.sx + (s.tx - s.sx) * k; s.y = s.sy + (s.ty - s.sy) * k;
        if (k >= 1) {
          s.done = true;
          world.ev.push({ t: 'splash', x: s.tx, y: s.ty, r: s.splash });
          // A copy: blobs split by this splash are not hit by it as well.
          for (const b of world.enemies.slice()) if (!b.gone && Math.hypot(b.x - s.tx, b.y - s.ty) <= s.splash + CG.ENEMIES[b.type].r * 0.5) damage(world, b, s.dmg, false);
        }
        continue;
      }
      const b = byId[s.target];
      if (b) { s.tx = b.x; s.ty = b.y; }
      const dx = s.tx - s.x, dy = s.ty - s.y, dist = Math.hypot(dx, dy), stepLen = s.speed * dt;
      if (dist <= stepLen + (b ? CG.ENEMIES[b.type].r * 0.5 : 0)) {
        s.done = true;
        if (b && !b.gone) {
          world.ev.push({ t: 'hit', kind: s.kind, x: b.x, y: b.y, r: s.area });
          // A bubble bursts over a small area and slows every blob in it (bosses half as much).
          if (s.slow) for (const o of world.enemies) {
            if (o.gone || (o !== b && Math.hypot(o.x - b.x, o.y - b.y) > s.area)) continue;
            o.slow = Math.max(o.slow, s.slow * (CG.ENEMIES[o.type].boss ? 0.5 : 1)); o.slowT = Math.max(o.slowT, s.slowT);
          }
          damage(world, b, s.dmg, false);
        }
      } else { s.x += dx / dist * stepLen; s.y += dy / dist * stepLen; }
    }
    world.shots = world.shots.filter(s => !s.done);
  }

  /* ------------------------------------------------------------- step */
  CG.step = function (world, dt) {
    if (world.phase === 'won' || world.phase === 'lost') return;
    world.time += dt;
    if (world.phase === 'break') {
      world.breakT -= dt;
      if (world.breakT <= 0) { world.breakT = 0; CG.callWave(world); }
    }
    // Spawning: one group after another, each blob gap seconds after the last.
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
    // Blobs move along their road; one that reaches the cake takes a bite.
    for (const b of world.enemies) {
      if (b.gone) continue;
      const e = CG.ENEMIES[b.type];
      if (b.slowT > 0) { b.slowT -= dt; if (b.slowT <= 0) { b.slowT = 0; b.slow = 0; } }
      if (b.hitT > 0) b.hitT -= dt;
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
    // Towers cool down, then fire at a blob in range.
    for (let i = 0; i < world.pads.length; i++) {
      const p = world.pads[i], tw = p.tower;
      if (!tw) continue;
      if (tw.kick > 0) tw.kick = Math.max(0, tw.kick - dt * 6);
      tw.cd -= dt;
      if (tw.cd <= 0) {
        if (fire(world, i, p, tw)) tw.cd += CG.towerLevel(tw).cd;
        else tw.cd = 0;
      }
    }
    stepShots(world, dt);
    world.enemies = world.enemies.filter(b => !b.gone);
    // A wave is over when it has finished spawning and every blob has popped.
    if (world.phase === 'wave' && !world.queue.length && !world.enemies.length) {
      if (world.wave >= world.total) {
        world.phase = 'won';
        world.ev.push({ t: 'win', stars: CG.stars(world) });
      } else {
        const bonus = 15 + world.wave * 3;
        world.coins += bonus;
        world.phase = 'break';
        world.breakT = CG.BREAK;
        world.ev.push({ t: 'clear', n: world.wave, bonus: bonus });
      }
    }
  };

  // Stars for a won level: how much of the cake is left.
  CG.stars = world => world.hearts >= CG.HEARTS - 2 ? 3 : world.hearts >= CG.HEARTS / 2 ? 2 : 1;
})(globalThis.CG = globalThis.CG || {});
