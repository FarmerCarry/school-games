/* Block World — TNT Mine Dash (عالم المكعبات)
 * Pure deterministic underground mine generator & arcade simulation engine.
 * Zero DOM, zero Canvas, zero Kit calls — runs identically in browser & Node tests! */
(function (root) {
  'use strict';
  var BW = root.BW;
  var T = BW.T, BLOCKS = BW.BLOCKS, W = BW.W, H = BW.H, clamp = BW.clamp;

  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function idx(x, y) { return y * W + x; }

  // Compact ASCII string RLE for tiny <2 KB saves on visibilitychange/pause.
  function encodeRLE(arr) {
    var out = '', cur = arr[0], run = 1;
    for (var i = 1; i < arr.length; i++) {
      if (arr[i] === cur) run++;
      else {
        out += String.fromCharCode(65 + cur) + (run > 1 ? run : '');
        cur = arr[i]; run = 1;
      }
    }
    return out + String.fromCharCode(65 + cur) + (run > 1 ? run : '');
  }

  function decodeRLE(str) {
    if (typeof str !== 'string' || !str.length) return null;
    var arr = new Uint8Array(W * H), p = 0, i = 0;
    while (i < str.length && p < arr.length) {
      var code = str.charCodeAt(i++) - 65;
      if (code < 0 || code > 25) return null;
      var num = 0;
      while (i < str.length) {
        var ch = str.charCodeAt(i);
        if (ch < 48 || ch > 57) break;
        num = num * 10 + (ch - 48);
        i++;
      }
      var count = num || 1;
      for (var k = 0; k < count && p < arr.length; k++) arr[p++] = code;
    }
    return p === arr.length ? arr : null;
  }

  function createWorld(opts) {
    opts = opts || {};
    var freeMode = !!opts.freeMode;
    var seed = (opts.seed >>> 0) || 4219;
    var rng = makeRng(seed);
    var ddaLevel = clamp(typeof opts.ddaLevel === 'number' && isFinite(opts.ddaLevel) ? opts.ddaLevel : 0.35, 0, 1);
    var stats = BW.statsForUpgrades(opts.upgrades);
    var tiles = new Uint8Array(W * H);

    // 1. Build vibrant 3-layer underground mine:
    //    y 0..3: sunny surface camp
    //    y 4..16: Dirt & Gold Mines
    //    y 17..30: Crystal Caves
    //    y 31..44: Magma Vaults
    //    y 45 + x=0/63: Bedrock bounds
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (x === 0 || x === W - 1 || y === H - 1) {
          tiles[idx(x, y)] = T.BEDROCK;
        } else if (y < 4) {
          tiles[idx(x, y)] = T.AIR;
        } else if (y === 4) {
          tiles[idx(x, y)] = T.GRASS;
        } else if (y < 17) {
          var r1 = rng();
          tiles[idx(x, y)] = r1 < 0.08 ? T.GOLD : r1 < 0.17 ? T.COAL : r1 < 0.21 ? T.TNT_BARREL : r1 < 0.34 ? T.STONE : T.DIRT;
        } else if (y < 31) {
          var r2 = rng();
          tiles[idx(x, y)] = r2 < 0.09 ? T.DIAMOND : r2 < 0.17 ? T.RUBY : r2 < 0.25 ? T.GOLD : r2 < 0.30 ? T.TNT_BARREL : r2 < 0.36 ? T.CRYSTAL_BLK : T.STONE;
        } else {
          var r3 = rng();
          tiles[idx(x, y)] = r3 < 0.14 ? T.DIAMOND : r3 < 0.25 ? T.RUBY : r3 < 0.32 ? T.TNT_BARREL : r3 < 0.42 ? T.GOLD : r3 < 0.62 ? T.OBSIDIAN : T.STONE;
        }
      }
    }

    function carveRect(x0, y0, x1, y1, val) {
      for (var yy = Math.max(1, y0); yy <= Math.min(H - 2, y1); yy++) {
        for (var xx = Math.max(1, x0); xx <= Math.min(W - 2, x1); xx++) {
          tiles[idx(xx, yy)] = val == null ? T.AIR : val;
        }
      }
    }

    var sx = Math.floor(W / 2); // x = 32

    // 2. Natural winding caverns & juicy TNT-barrel chains across the mine (keeping starter zone intact)!
    for (var c = 0; c < 14; c++) {
      var cx = 6 + Math.floor(rng() * (W - 12));
      var cy = 11 + Math.floor(rng() * (H - 17));
      var cw = 2 + Math.floor(rng() * 3);
      var ch = 1 + Math.floor(rng() * 2);
      if (Math.abs(cx - sx) <= 7 && cy - ch <= 11) cy = 14 + ch;
      carveRect(cx - cw, cy - ch, cx + cw, cy + ch, T.AIR);
      if (cy + ch + 1 < H - 1) tiles[idx(cx, cy + ch + 1)] = T.TNT_BARREL;
    }

    // 3. Place the 3 Glowing Relics in rich treasure vaults (spread cleanly across depth & sides)!
    var sideA = rng() < 0.5 ? -1 : 1;
    var relicCoords = [
      { x: clamp(sx + sideA * (11 + Math.floor(rng() * 6)), 7, W - 8),  y: 12 + Math.floor(rng() * 3) },
      { x: clamp(sx - sideA * (13 + Math.floor(rng() * 8)), 7, W - 8),  y: 22 + Math.floor(rng() * 4) },
      { x: clamp(sx + (rng() < 0.5 ? -1 : 1) * (5 + Math.floor(rng() * 12)), 8, W - 9), y: 34 + Math.floor(rng() * 5) }
    ];
    var relics = [];
    for (var ri = 0; ri < 3; ri++) {
      var rc = relicCoords[ri];
      var def = BW.RELICS[ri];
      // Golden brick treasure vault chamber around each relic!
      carveRect(rc.x - 3, rc.y - 2, rc.x + 3, rc.y + 2, T.BRICK);
      carveRect(rc.x - 2, rc.y - 1, rc.x + 2, rc.y + 1, T.AIR);
      tiles[idx(rc.x - 2, rc.y + 2)] = ri === 2 ? T.DIAMOND : T.GOLD;
      tiles[idx(rc.x + 2, rc.y + 2)] = ri === 0 ? T.GOLD : T.RUBY;
      tiles[idx(rc.x, rc.y + 2)] = T.TNT_BARREL;
      relics.push({
        id: ri,
        name: def.name,
        col: def.col,
        glow: def.glow,
        icon: def.icon,
        value: def.value,
        x: rc.x + 0.5,
        y: rc.y + 0.45,
        got: false
      });
    }

    // 4. Bouncy Crystal Slimes in deeper caverns (never in starter room!).
    var slimes = [];
    var slimeCount = freeMode ? 4 : Math.round(5 + ddaLevel * 4);
    for (var si = 0; si < slimeCount; si++) {
      var slx = 6 + Math.floor(rng() * (W - 12));
      var sly = 15 + Math.floor(rng() * 24);
      carveRect(slx - 1, sly - 1, slx + 1, sly, T.AIR);
      slimes.push({
        id: si + 1,
        x: slx + 0.5,
        y: sly + 0.1,
        vx: (si % 2 === 0 ? 1 : -1) * (1.8 + ddaLevel * 1.0),
        vy: 0,
        hopT: rng() * 1.4,
        col: sly > 28 ? '#ff5286' : '#32e8a0',
        alive: true
      });
    }

    // 5. Entry shaft & cozy starter cavern stamped LAST so spawn & row-10 floor are 100% protected across all seeds!
    carveRect(sx - 1, 3, sx + 1, 9, T.AIR);
    carveRect(sx - 4, 7, sx + 4, 9, T.AIR);
    // Solid rich floor on row 10 with tempting Gold + TNT Barrel right beside hero for instant joy!
    for (var fx = sx - 4; fx <= sx + 4; fx++) tiles[idx(fx, 10)] = T.DIRT;
    tiles[idx(sx + 2, 10)] = T.TNT_BARREL;
    tiles[idx(sx + 3, 10)] = T.GOLD;
    tiles[idx(sx + 4, 10)] = T.GOLD;
    tiles[idx(sx - 3, 10)] = T.GOLD;
    tiles[idx(sx - 4, 10)] = T.TNT_BARREL;
    // Rich walls right beside starter room so Auto-Drill immediately scores gold!
    tiles[idx(sx + 5, 9)] = T.GOLD;
    tiles[idx(sx + 5, 8)] = T.DIRT;

    var duration = freeMode ? Infinity : Math.round(92 - ddaLevel * 10); // 92s gentle -> 82s crisp
    var world = {
      seed: seed,
      freeMode: freeMode,
      W: W,
      H: H,
      tiles: tiles,
      dmg: new Float32Array(W * H),
      stats: stats,
      time: 0,
      timeLeft: duration,
      duration: duration,
      done: false,
      won: false,
      gemsRun: 0,
      score: 0,
      blasts: 0,
      blocksBroken: 0,
      relicsGot: 0,
      streak: 0,
      streakT: 0,
      selBlock: 0, // For Free Sandbox placement
      portals: [
        { x: sx + 6.0, y: 2.95, active: false, express: false }
      ],
      relics: relics,
      slimes: slimes,
      tnts: [],
      drops: [],
      ev: [],
      nextId: 100,
      p: {
        x: sx + 0.5,
        y: 9.2,
        w: 0.68,
        h: 0.84,
        vx: 0,
        vy: 0,
        face: 1,
        ground: false,
        jetting: false,
        fuel: stats.jetFuelMax,
        fuelMax: stats.jetFuelMax,
        tntAmmo: stats.tntMax,
        tntMax: stats.tntMax,
        tntTimer: 0,
        tntCooldown: 0,
        invuln: 0,
        drilling: null, // { x, y, pct }
        drillAnim: 0,
        squash: 0
      }
    };

    world.get = function (tx, ty) {
      if (tx < 0 || tx >= W || ty < 0 || ty >= H) return T.BEDROCK;
      return world.tiles[idx(tx, ty)];
    };
    world.set = function (tx, ty, val) {
      if (tx <= 0 || tx >= W - 1 || ty <= 0 || ty >= H - 1) return false;
      world.tiles[idx(tx, ty)] = val;
      world.dmg[idx(tx, ty)] = 0;
      return true;
    };
    world.serialize = function () {
      return {
        v: BW.SAVE_VERSION,
        seed: world.seed,
        freeMode: world.freeMode,
        time: Math.round(world.time * 100) / 100,
        timeLeft: isFinite(world.timeLeft) ? Math.round(world.timeLeft * 100) / 100 : -1,
        gemsRun: world.gemsRun,
        score: world.score,
        blasts: world.blasts,
        relicsGot: world.relicsGot,
        px: Math.round(world.p.x * 100) / 100,
        py: Math.round(world.p.y * 100) / 100,
        relics: world.relics.map(function (r) { return [r.x, r.y, r.got ? 1 : 0]; }),
        rle: encodeRLE(world.tiles)
      };
    };

    // Spawn 4 instant shiny loose gems right in the starter chamber for immediate 1s pickup!
    for (var g = 0; g < 4; g++) {
      world.drops.push({
        id: ++world.nextId,
        x: sx + 1.4 + g * 0.72,
        y: 9.4,
        vx: 0, vy: 0,
        val: 5,
        col: g % 2 === 0 ? '#ffd633' : '#38f6ee',
        age: 0
      });
    }

    return world;
  }

  function restoreWorld(raw, upgrades) {
    if (!raw || typeof raw !== 'object' || typeof raw.rle !== 'string') return null;
    var tiles = decodeRLE(raw.rle);
    if (!tiles) return null;
    var w = createWorld({ seed: raw.seed || 4219, freeMode: !!raw.freeMode, upgrades: upgrades });
    w.tiles = tiles;
    w.time = Math.max(0, Number(raw.time) || 0);
    if (!w.freeMode && typeof raw.timeLeft === 'number' && raw.timeLeft > 0) w.timeLeft = raw.timeLeft;
    w.gemsRun = Math.max(0, raw.gemsRun | 0);
    w.score = Math.max(0, raw.score | 0);
    w.blasts = Math.max(0, raw.blasts | 0);
    w.p.x = clamp(Number(raw.px) || w.p.x, 1.5, W - 1.5);
    w.p.y = clamp(Number(raw.py) || w.p.y, 1.5, H - 1.5);
    if (Array.isArray(raw.relics)) {
      var got = 0;
      for (var i = 0; i < w.relics.length && i < raw.relics.length; i++) {
        var rr = raw.relics[i];
        if (Array.isArray(rr) && rr.length >= 3) {
          w.relics[i].x = Number(rr[0]) || w.relics[i].x;
          w.relics[i].y = Number(rr[1]) || w.relics[i].y;
          w.relics[i].got = !!rr[2];
          if (w.relics[i].got) got++;
        }
      }
      w.relicsGot = got;
      if (got >= 3) w.portals[0].active = true;
    }
    w.drops.length = 0;
    return w;
  }

  function emit(world, type, data) {
    var ev = { t: type };
    if (data) for (var k in data) ev[k] = data[k];
    world.ev.push(ev);
  }

  function solidAt(world, tx, ty) {
    var b = BLOCKS[world.get(tx, ty)];
    return !!(b && b.solid);
  }

  function spawnDrop(world, x, y, val, col) {
    var multVal = Math.max(1, Math.round(val * world.stats.gemBonus));
    world.drops.push({
      id: ++world.nextId,
      x: x, y: y,
      vx: ((world.nextId * 73 % 100) / 100 - 0.5) * 4.5,
      vy: -2.8 - ((world.nextId * 37 % 100) / 100) * 3.0,
      val: multVal,
      col: col || '#ffd633',
      age: 0
    });
    if (world.drops.length > 140) world.drops.shift();
  }

  function breakTile(world, tx, ty, fromBlast) {
    var id = world.get(tx, ty);
    var def = BLOCKS[id];
    if (!def || !def.solid || def.unbreakable) return false;
    world.set(tx, ty, T.AIR);
    world.blocksBroken++;
    world.score += Math.max(2, def.gems * 2);

    // Chain-reaction buried TNT Barrel!!
    if (def.tnt) {
      world.tnts.push({
        id: ++world.nextId,
        x: tx + 0.5, y: ty + 0.5,
        fuse: fromBlast ? 0.14 : 0.25,
        maxFuse: fromBlast ? 0.14 : 0.25,
        radius: world.stats.tntRadius + 0.55,
        chain: true
      });
      emit(world, 'tntChain', { x: tx + 0.5, y: ty + 0.5 });
      return true;
    }

    if (def.gems >= 5) {
      var dropCol = def.ore || def.hi || '#ffd633';
      var count = def.gems >= 20 ? 3 : def.gems >= 10 ? 2 : 1;
      var each = Math.max(1, Math.round(def.gems / count));
      for (var c = 0; c < count; c++) spawnDrop(world, tx + 0.5, ty + 0.5, each, dropCol);
    } else if (fromBlast && (tx + ty) % 2 === 0) {
      spawnDrop(world, tx + 0.5, ty + 0.5, 2, '#ffe066');
    }
    emit(world, 'dig', { x: tx + 0.5, y: ty + 0.5, id: id, col: def.ore || def.col, blast: !!fromBlast });
    return true;
  }

  function plantTNT(world, tx, ty) {
    var p = world.p;
    if (!world.freeMode && (p.tntAmmo < 1 || p.tntCooldown > 0)) return false;
    var bx = clamp(Math.floor(tx == null ? p.x : tx), 1, W - 2) + 0.5;
    var by = clamp(Math.floor(ty == null ? p.y : ty), 1, H - 2) + 0.5;
    if (!world.freeMode) {
      p.tntAmmo--;
      p.tntCooldown = 0.22;
    }
    var fuse = 0.78;
    world.tnts.push({
      id: ++world.nextId,
      x: bx, y: by,
      fuse: fuse,
      maxFuse: fuse,
      radius: world.stats.tntRadius,
      chain: false
    });
    emit(world, 'plant', { x: bx, y: by });
    return true;
  }

  function detonateTNT(world, tnt) {
    world.blasts++;
    var r = tnt.radius;
    var cx = Math.floor(tnt.x), cy = Math.floor(tnt.y);
    var ir = Math.ceil(r);
    var broken = 0;
    for (var dy = -ir; dy <= ir; dy++) {
      for (var dx = -ir; dx <= ir; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          if (breakTile(world, cx + dx, cy + dy, true)) broken++;
        }
      }
    }
    // Blast pops nearby slimes into generous gem pinatas!
    for (var si = 0; si < world.slimes.length; si++) {
      var sl = world.slimes[si];
      if (!sl.alive) continue;
      var sdx = sl.x - tnt.x, sdy = sl.y - tnt.y;
      if (sdx * sdx + sdy * sdy <= (r + 1.2) * (r + 1.2)) {
        sl.alive = false;
        world.score += 75;
        for (var k = 0; k < 4; k++) spawnDrop(world, sl.x, sl.y, 6, sl.col);
        emit(world, 'slimePop', { x: sl.x, y: sl.y, col: sl.col });
      }
    }
    // Kid-safe playful bounce if standing right on your own TNT (zero self-damage!)
    var p = world.p;
    var pdx = p.x - tnt.x, pdy = p.y - tnt.y;
    var pdist = Math.sqrt(pdx * pdx + pdy * pdy);
    if (pdist < r + 0.9) {
      var push = (1 - pdist / (r + 0.9)) * 7.5;
      p.vx += (pdist > 0.05 ? pdx / pdist : 0) * push;
      p.vy = Math.min(p.vy, -5.8);
      p.squash = 1;
    }
    emit(world, 'boom', { x: tnt.x, y: tnt.y, r: r, broken: broken, chain: tnt.chain });
  }

  function placeSandboxBlock(world, tx, ty) {
    if (!world.freeMode) return false;
    var gx = Math.floor(tx), gy = Math.floor(ty);
    if (gx <= 0 || gx >= W - 1 || gy <= 1 || gy >= H - 1) return false;
    // Don't entomb player
    var p = world.p;
    if (Math.abs((gx + 0.5) - p.x) < 0.7 && Math.abs((gy + 0.5) - p.y) < 0.8) return false;
    var pick = BW.SANDBOX_PALETTE[world.selBlock % BW.SANDBOX_PALETTE.length];
    if (world.get(gx, gy) !== T.AIR) return false;
    world.set(gx, gy, pick.id);
    emit(world, 'place', { x: gx + 0.5, y: gy + 0.5, id: pick.id });
    return true;
  }

  function step(world, dt, input) {
    if (!world || world.done) return world;
    dt = clamp(dt, 0, 0.05);
    input = input || {};
    var p = world.p;
    var st = world.stats;
    world.time += dt;

    // Timer countdown in 90s Heist mode!
    if (!world.freeMode) {
      world.timeLeft = Math.max(0, world.timeLeft - dt);
      if (world.timeLeft <= 0) {
        world.done = true;
        world.won = false;
        emit(world, 'timeout', { score: world.score, gems: world.gemsRun, relics: world.relicsGot });
        return world;
      }
    }

    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (p.tntCooldown > 0) p.tntCooldown = Math.max(0, p.tntCooldown - dt);
    if (p.squash > 0) p.squash = Math.max(0, p.squash - dt * 5);
    else if (p.squash < 0) p.squash = Math.min(0, p.squash + dt * 5);
    if (world.streakT > 0) {
      world.streakT -= dt;
      if (world.streakT <= 0) world.streak = 0;
    }

    // Fast automatic TNT recharge so kids can blast constantly!
    if (p.tntAmmo < p.tntMax) {
      p.tntTimer += dt;
      if (p.tntTimer >= st.tntReload) {
        p.tntTimer -= st.tntReload;
        p.tntAmmo++;
        emit(world, 'tntReady', { ammo: p.tntAmmo });
      }
    } else p.tntTimer = 0;

    // Plant TNT verb!
    if (input.tntPressed) plantTNT(world, input.tntX, input.tntY);
    if (input.placePressed && world.freeMode) placeSandboxBlock(world, input.placeX, input.placeY);

    // Compute desired move vector from Keyboard OR Mouse-Hold steering!
    var mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    var my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx === 0 && my === 0 && input.steer) {
      var sdx = input.steer.x - p.x, sdy = input.steer.y - p.y;
      var sLen = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sLen > 0.35) {
        mx = clamp(sdx / Math.max(0.8, sLen), -1, 1);
        my = clamp(sdy / Math.max(0.8, sLen), -1, 1);
      }
    }
    if (mx > 0.1) p.face = 1;
    else if (mx < -0.1) p.face = -1;

    // Horizontal velocity + snappy air/ground control.
    var targetVx = mx * st.moveSpeed;
    p.vx += (targetVx - p.vx) * Math.min(1, dt * 16);

    // Jetpack upward thrust + forgiving fast fuel recharge!
    p.jetting = false;
    if (my < -0.25) {
      if (p.fuel > 0 || world.freeMode) {
        p.jetting = true;
        p.vy -= st.jetAccel * dt * Math.min(1, Math.abs(my) * 1.3);
        if (p.vy < -8.2) p.vy = -8.2;
        if (!world.freeMode) p.fuel = Math.max(0, p.fuel - dt * 0.72);
      }
    } else if (my > 0.35 && !p.ground) {
      p.vy += 22 * dt; // swift dive downward
    }
    // Gravity & terminal fall speed.
    if (!p.jetting) {
      p.vy = Math.min(11.5, p.vy + 18.5 * dt);
    }

    // Move X + Auto-Drill any diggable block we press into!
    var hw = p.w * 0.5, hh = p.h * 0.5;
    var nextX = p.x + p.vx * dt;
    var blockedX = null;
    if (Math.abs(p.vx) > 0.01) {
      var sideX = p.vx > 0 ? Math.floor(nextX + hw) : Math.floor(nextX - hw);
      var yTop = Math.floor(p.y - hh + 0.08), yBot = Math.floor(p.y + hh - 0.08);
      for (var yy = yTop; yy <= yBot; yy++) {
        if (solidAt(world, sideX, yy)) { blockedX = { x: sideX, y: yy }; break; }
      }
    }
    if (blockedX) {
      p.x = p.vx > 0 ? blockedX.x - hw - 0.002 : blockedX.x + 1 + hw + 0.002;
      p.vx = 0;
    } else {
      p.x = nextX;
    }

    // Move Y + ground detection + Auto-Drill down/up!
    var nextY = p.y + p.vy * dt;
    var blockedY = null;
    p.ground = false;
    var xL = Math.floor(p.x - hw + 0.08), xR = Math.floor(p.x + hw - 0.08);
    if (p.vy >= 0) {
      var footY = Math.floor(nextY + hh);
      for (var xx = xL; xx <= xR; xx++) {
        if (solidAt(world, xx, footY)) { blockedY = { x: xx, y: footY, dir: 1 }; break; }
      }
      if (blockedY) {
        p.y = blockedY.y - hh - 0.002;
        p.vy = 0;
        p.ground = true;
      } else p.y = nextY;
    } else {
      var headY = Math.floor(nextY - hh);
      for (var xx2 = xL; xx2 <= xR; xx2++) {
        if (solidAt(world, xx2, headY)) { blockedY = { x: xx2, y: headY, dir: -1 }; break; }
      }
      if (blockedY) {
        p.y = blockedY.y + 1 + hh + 0.002;
        p.vy = 0;
      } else p.y = nextY;
    }

    // Recharge Jetpack super fast whenever standing or cruising!
    if (p.ground) p.fuel = Math.min(p.fuelMax, p.fuel + dt * 2.6);
    else if (!p.jetting) p.fuel = Math.min(p.fuelMax, p.fuel + dt * 0.55);

    // Effortless Auto-Drill: pressing in any direction against a diggable tile drills it immediately!
    var drillTarget = null;
    if (blockedX && Math.abs(mx) > 0.25) {
      drillTarget = { x: blockedX.x, y: Math.floor(p.y) };
      if (!solidAt(world, drillTarget.x, drillTarget.y)) drillTarget = { x: blockedX.x, y: blockedX.y };
    } else if (my > 0.35 && p.ground) {
      var bxD = Math.floor(p.x), byD = Math.floor(p.y + hh + 0.15);
      if (solidAt(world, bxD, byD)) drillTarget = { x: bxD, y: byD };
    } else if (my < -0.35 && blockedY && blockedY.dir < 0) {
      drillTarget = { x: Math.floor(p.x), y: blockedY.y };
      if (!solidAt(world, drillTarget.x, drillTarget.y)) drillTarget = { x: blockedY.x, y: blockedY.y };
    }

    p.drilling = null;
    if (drillTarget) {
      var tId = world.get(drillTarget.x, drillTarget.y);
      var tDef = BLOCKS[tId];
      if (tDef && tDef.solid && !tDef.unbreakable) {
        var di = idx(drillTarget.x, drillTarget.y);
        world.dmg[di] += (st.drillPower * dt) / Math.max(0.08, tDef.hp);
        p.drillAnim += dt * 24;
        var pct = Math.min(1, world.dmg[di]);
        p.drilling = { x: drillTarget.x, y: drillTarget.y, pct: pct };
        if (world.dmg[di] >= 1) {
          breakTile(world, drillTarget.x, drillTarget.y, false);
          p.drilling = null;
        }
      }
    }

    // Update active TNT bombs & detonations!
    for (var ti = world.tnts.length - 1; ti >= 0; ti--) {
      var bomb = world.tnts[ti];
      bomb.fuse -= dt;
      if (bomb.fuse <= 0) {
        world.tnts.splice(ti, 1);
        detonateTNT(world, bomb);
      }
    }

    // Update bouncy Crystal Slimes!
    for (var si = 0; si < world.slimes.length; si++) {
      var sl = world.slimes[si];
      if (!sl.alive) continue;
      sl.hopT -= dt;
      sl.vy = Math.min(9.5, sl.vy + 16 * dt);
      var nx = sl.x + sl.vx * dt;
      if (solidAt(world, Math.floor(nx + (sl.vx > 0 ? 0.36 : -0.36)), Math.floor(sl.y))) {
        sl.vx = -sl.vx;
      } else sl.x = nx;
      var ny = sl.y + sl.vy * dt;
      if (sl.vy >= 0 && solidAt(world, Math.floor(sl.x), Math.floor(ny + 0.36))) {
        sl.y = Math.floor(ny + 0.36) - 0.36;
        sl.vy = 0;
        if (sl.hopT <= 0) { sl.vy = -5.6; sl.hopT = 0.9 + (si % 3) * 0.3; }
      } else if (sl.vy < 0 && solidAt(world, Math.floor(sl.x), Math.floor(ny - 0.36))) {
        sl.vy = 0;
      } else sl.y = ny;

      // Player contact with slime: drilling/falling onto it pops it; side bonk bounces gently!
      var sdx = p.x - sl.x, sdy = p.y - sl.y;
      if (sdx * sdx + sdy * sdy < 0.72 * 0.72) {
        if (p.vy > 1.2 && p.y < sl.y) {
          // Stomp pop!
          sl.alive = false;
          p.vy = -6.8;
          world.score += 75;
          for (var k = 0; k < 3; k++) spawnDrop(world, sl.x, sl.y, 6, sl.col);
          emit(world, 'slimePop', { x: sl.x, y: sl.y, col: sl.col });
        } else if (p.invuln <= 0) {
          p.invuln = 1.4;
          p.vx = (sdx >= 0 ? 1 : -1) * 7.2;
          p.vy = -5.2;
          if (!world.freeMode) world.timeLeft = Math.max(1, world.timeLeft - 3);
          emit(world, 'bonk', { x: p.x, y: p.y });
        }
      }
    }

    // Collect the 3 Glowing Relics!
    for (var ri = 0; ri < world.relics.length; ri++) {
      var rel = world.relics[ri];
      if (rel.got) continue;
      var rdx = p.x - rel.x, rdy = p.y - rel.y;
      if (rdx * rdx + rdy * rdy < 1.15 * 1.15) {
        rel.got = true;
        world.relicsGot++;
        world.gemsRun += Math.round(rel.value * 0.5);
        world.score += rel.value;
        p.fuel = p.fuelMax;
        p.tntAmmo = p.tntMax;
        emit(world, 'relic', { id: rel.id, name: rel.name, count: world.relicsGot, x: rel.x, y: rel.y, col: rel.col });

        // Once all 3 Relics are grabbed, open Surface Portal + Express Escape Portal nearby!
        if (world.relicsGot >= 3) {
          world.portals[0].active = true;
          var ex = clamp(Math.floor(p.x), 4, W - 5);
          var ey = clamp(Math.floor(p.y) - 6, 5, H - 6);
          for (var eyy = ey - 1; eyy <= ey + 1; eyy++) {
            for (var exx = ex - 1; exx <= ex + 1; exx++) world.set(exx, eyy, T.AIR);
          }
          world.portals.push({ x: ex + 0.5, y: ey + 0.4, active: true, express: true });
          if (!world.freeMode && world.timeLeft < 18) world.timeLeft += 12;
          emit(world, 'portalOpen', { x: ex + 0.5, y: ey + 0.4 });
        }
      }
    }

    // Escape Portal Victory!
    if (world.relicsGot >= 3 && !world.freeMode) {
      for (var pi = 0; pi < world.portals.length; pi++) {
        var pt = world.portals[pi];
        if (!pt.active) continue;
        var pdx = p.x - pt.x, pdy = p.y - pt.y;
        if (pdx * pdx + pdy * pdy < 1.25 * 1.25) {
          world.done = true;
          world.won = true;
          var timeBonus = Math.round(world.timeLeft * 6);
          world.score += timeBonus;
          world.gemsRun += Math.round(world.timeLeft * 1.5);
          var stars = BW.computeStars(true, world.timeLeft, world.gemsRun, world.score);
          emit(world, 'win', { score: world.score, gems: world.gemsRun, stars: stars, timeLeft: world.timeLeft });
          return world;
        }
      }
    }

    // Magnetized Gem Pickups!
    var magR = st.magnetRadius;
    var magR2 = magR * magR;
    for (var di2 = world.drops.length - 1; di2 >= 0; di2--) {
      var d = world.drops[di2];
      d.age += dt;
      if (d.age > 18) { world.drops.splice(di2, 1); continue; }
      var ddx = p.x - d.x, ddy = p.y - d.y;
      var dist2 = ddx * ddx + ddy * ddy;
      if (dist2 < magR2 && d.age > 0.08) {
        var pull = (1 - Math.sqrt(dist2) / magR) * 24 + 10;
        var inv = 1 / Math.max(0.05, Math.sqrt(dist2));
        d.vx += ddx * inv * pull * dt * 4.5;
        d.vy += ddy * inv * pull * dt * 4.5;
        d.vx *= 0.88; d.vy *= 0.88;
      } else {
        d.vy = Math.min(8, d.vy + 14 * dt);
        d.vx *= 0.94;
      }
      var dnx = d.x + d.vx * dt, dny = d.y + d.vy * dt;
      if (!solidAt(world, Math.floor(dnx), Math.floor(d.y))) d.x = dnx; else d.vx = -d.vx * 0.3;
      if (!solidAt(world, Math.floor(d.x), Math.floor(dny + 0.18))) d.y = dny; else { d.vy = 0; d.vx *= 0.7; }

      if (dist2 < 0.72 * 0.72) {
        world.drops.splice(di2, 1);
        world.gemsRun += d.val;
        world.score += d.val * 3;
        world.streak++;
        world.streakT = 2.0;
        // Collecting gems tops up jetpack fuel & accelerates TNT recharge!
        p.fuel = Math.min(p.fuelMax, p.fuel + 0.14);
        if (p.tntAmmo < p.tntMax) p.tntTimer += 0.16;
        emit(world, 'gem', { x: d.x, y: d.y, val: d.val, streak: world.streak, col: d.col });
      }
    }

    return world;
  }

  // Returns the active objective target (nearest uncollected Relic, or nearest active Escape Portal!)
  function activeTarget(world) {
    var p = world.p, best = null, bestD2 = Infinity;
    if (world.relicsGot < 3) {
      for (var i = 0; i < world.relics.length; i++) {
        var r = world.relics[i];
        if (r.got) continue;
        var dx = r.x - p.x, dy = r.y - p.y, d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = { kind: 'relic', x: r.x, y: r.y, col: r.col, label: r.name, dist: Math.round(Math.sqrt(d2)) }; }
      }
    } else {
      for (var j = 0; j < world.portals.length; j++) {
        var pt = world.portals[j];
        if (!pt.active) continue;
        var px = pt.x - p.x, py = pt.y - p.y, pd2 = px * px + py * py;
        if (pd2 < bestD2) { bestD2 = pd2; best = { kind: 'portal', x: pt.x, y: pt.y, col: '#4df59c', label: 'بوابة الخروج!', dist: Math.round(Math.sqrt(pd2)) }; }
      }
    }
    return best;
  }

  BW.createWorld = createWorld;
  BW.restoreWorld = restoreWorld;
  BW.step = step;
  BW.plantTNT = plantTNT;
  BW.placeSandboxBlock = placeSandboxBlock;
  BW.activeTarget = activeTarget;
})(typeof window !== 'undefined' ? window : globalThis);
