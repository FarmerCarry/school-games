/* Fire & Ice (النار والجليد) — pure deterministic 2D puzzle-platformer engine.
 * Zero DOM, zero Kit, zero Math.random(): runs identically in browser and Node verifier. */
(function (root) {
  'use strict';

  var T = 32; // logical tile size (px)
  var PW = 20; // forgiving hero hitbox width
  var PH_H = 26; // hero hitbox height (26 + 69 jump apex = 95px < 96px 3-tile headroom!)
  var BW = 30; // crate width
  var BH = 30; // crate height

  var PH = {
    speed: 220,
    gAccel: 2700,
    gDecel: 2900,
    aAccel: 1950,
    aDecel: 550,
    grav: 1480,
    maxFall: 580,
    jumpVy: -452,
    minJumpTime: 0.09,
    cutGravMul: 1.85,
    coyote: 0.11,
    jBuf: 0.16,
    poolGrace: 0.08,
    cornerNudge: 6,
    ledgeStep: 6,
    boxPushSpeed: 126,
    winHold: 0.35
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function tileAt(w, gx, gy) {
    if (gx < 0 || gx >= w.cols || gy < 0 || gy >= w.rows) return '#';
    return w.grid[gy * w.cols + gx];
  }

  function isSolidTile(ch) {
    return ch === '#' || ch === 'L' || ch === 'W' || ch === 'G';
  }

  function isPoolTile(ch) {
    return ch === 'L' || ch === 'W' || ch === 'G';
  }

  function isDeadlyPool(ch, kind) {
    if (ch === 'G') return true;
    if (ch === 'W' && kind === 'fire') return true;
    if (ch === 'L' && kind === 'ice') return true;
    return false;
  }

  function mkHero(kind, x, y) {
    return {
      kind: kind,
      x: x,
      y: y,
      w: PW,
      h: PH_H,
      vx: 0,
      vy: 0,
      grounded: false,
      onStone: false,
      onPlatform: -1,
      coyoteT: 0,
      jBufT: 0,
      jumpHeld: false,
      jumpTime: 0,
      prevJump: false,
      poolGraceT: 0,
      face: 1,
      alive: true,
      pushing: 0,
      pushSfxCd: 0,
      inDoor: false,
      justJumped: false,
      justLanded: 0
    };
  }

  function build(def, idx) {
    if (!def || !def.map || !def.map.length) throw new Error('Invalid level definition');
    var rows = def.map.length;
    var cols = def.map[0].length;
    var grid = new Array(rows * cols);
    var fireSpawn = null, iceSpawn = null;
    var fireDoor = null, iceDoor = null;
    var gems = [];
    var boxes = [];
    var torches = [];
    var pools = [];

    for (var gy = 0; gy < rows; gy++) {
      var row = def.map[gy];
      if (row.length !== cols) throw new Error('Row ' + gy + ' length mismatch');
      for (var gx = 0; gx < cols; gx++) {
        var ch = row.charAt(gx);
        var cell = '.';
        if (ch === '#' || ch === 'L' || ch === 'W' || ch === 'G') {
          cell = ch;
          if (isPoolTile(ch)) pools.push({ gx: gx, gy: gy, kind: ch });
        } else if (ch === 'F') {
          fireSpawn = { x: gx * T + (T - PW) / 2, y: (gy + 1) * T - PH_H };
        } else if (ch === 'I') {
          iceSpawn = { x: gx * T + (T - PW) / 2, y: (gy + 1) * T - PH_H };
        } else if (ch === '1') {
          fireDoor = { gx: gx, gy: gy, x: gx * T, y: (gy + 1) * T - 44, w: T, h: 44, inside: false };
        } else if (ch === '2') {
          iceDoor = { gx: gx, gy: gy, x: gx * T, y: (gy + 1) * T - 44, w: T, h: 44, inside: false };
        } else if (ch === 'f' || ch === 'i') {
          gems.push({
            id: gems.length,
            kind: ch === 'f' ? 'fire' : 'ice',
            gx: gx,
            gy: gy,
            x: gx * T + T / 2,
            y: gy * T + T / 2,
            got: false
          });
        } else if (ch === 'B') {
          boxes.push({
            id: boxes.length,
            x: gx * T + (T - BW) / 2,
            y: (gy + 1) * T - BH,
            w: BW,
            h: BH,
            vx: 0,
            vy: 0,
            grounded: false,
            onPlatform: -1
          });
        } else if (ch === 'T') {
          torches.push({ gx: gx, gy: gy, x: gx * T + T / 2, y: gy * T + T / 2 });
        }
        grid[gy * cols + gx] = cell;
      }
    }

    if (!fireSpawn) fireSpawn = { x: 2 * T, y: (rows - 2) * T - PH_H };
    if (!iceSpawn) iceSpawn = { x: 4 * T, y: (rows - 2) * T - PH_H };
    if (!fireDoor) fireDoor = { gx: cols - 3, gy: 1, x: (cols - 3) * T, y: 2 * T - 44, w: T, h: 44, inside: false };
    if (!iceDoor) iceDoor = { gx: cols - 2, gy: 1, x: (cols - 2) * T, y: 2 * T - 44, w: T, h: 44, inside: false };

    var levers = (def.levers || []).map(function (lv, i) {
      return {
        id: i,
        gx: lv.gx,
        gy: lv.gy,
        x: lv.gx * T + T / 2,
        y: (lv.gy + 1) * T,
        ch: lv.ch | 0,
        on: !!lv.on,
        cd: 0,
        inFire: false,
        inIce: false
      };
    });

    var buttons = (def.buttons || []).map(function (bt, i) {
      return {
        id: i,
        gx: bt.gx,
        gy: bt.gy,
        x: bt.gx * T + 3,
        y: (bt.gy + 1) * T - 9,
        w: T - 6,
        h: 9,
        ch: bt.ch | 0,
        down: false
      };
    });

    var platforms = (def.platforms || []).map(function (pl, i) {
      var x0 = pl.x0 * T, y0 = pl.y0 * T;
      var x1 = pl.x1 * T, y1 = pl.y1 * T;
      var dx = x1 - x0, dy = y1 - y0;
      var dist = Math.sqrt(dx * dx + dy * dy);
      return {
        id: i,
        x0: x0,
        y0: y0,
        x1: x1,
        y1: y1,
        x: x0,
        y: y0,
        dx: 0,
        dy: 0,
        w: Math.round((pl.w || 3) * T),
        h: Math.round((pl.h || 0.6) * T),
        ch: pl.ch == null ? -1 : (pl.ch | 0),
        speed: (pl.speed || 2.2) * T,
        dist: dist || 1,
        prog: pl.startProg || 0,
        auto: !!pl.auto,
        autoDir: 1,
        pauseDur: pl.pause == null ? 0.45 : pl.pause,
        pauseT: 0,
        kind: pl.kind || (Math.abs(dy) > Math.abs(dx) ? 'lift' : 'bridge')
      };
    });

    var gemsTotal = { fire: 0, ice: 0 };
    for (var gi = 0; gi < gems.length; gi++) gemsTotal[gems[gi].kind]++;

    return {
      idx: idx | 0,
      def: def,
      name: def.name || ('المرحلة ' + ((idx | 0) + 1)),
      wing: def.wing | 0,
      par: def.par || 30,
      cols: cols,
      rows: rows,
      width: cols * T,
      height: rows * T,
      grid: grid,
      pools: pools,
      torches: torches,
      fire: mkHero('fire', fireSpawn.x, fireSpawn.y),
      ice: mkHero('ice', iceSpawn.x, iceSpawn.y),
      doors: { fire: fireDoor, ice: iceDoor },
      gems: gems,
      gemsTotal: gemsTotal,
      gemsGot: { fire: 0, ice: 0 },
      boxes: boxes,
      levers: levers,
      buttons: buttons,
      platforms: platforms,
      channels: [false, false, false],
      t: 0,
      winT: 0,
      state: 'play', // 'play' | 'dead' | 'won'
      deadHero: null,
      deadCause: null,
      events: []
    };
  }

  /* --------------------------------------------------- solid collisions */
  function rectHitsTiles(w, x, y, rw, rh) {
    var x0 = Math.floor(x / T);
    var x1 = Math.floor((x + rw - 0.001) / T);
    var y0 = Math.floor(y / T);
    var y1 = Math.floor((y + rh - 0.001) / T);
    for (var gy = y0; gy <= y1; gy++) {
      for (var gx = x0; gx <= x1; gx++) {
        if (isSolidTile(tileAt(w, gx, gy))) return true;
      }
    }
    return false;
  }

  function rectHitsPlatforms(w, x, y, rw, rh, skipIdx) {
    for (var i = 0; i < w.platforms.length; i++) {
      if (i === skipIdx) continue;
      var p = w.platforms[i];
      if (overlap(x, y, rw, rh, p.x, p.y, p.w, p.h)) return i;
    }
    return -1;
  }

  function rectHitsBoxes(w, x, y, rw, rh, skipIdx) {
    for (var i = 0; i < w.boxes.length; i++) {
      if (i === skipIdx) continue;
      var b = w.boxes[i];
      if (overlap(x, y, rw, rh, b.x, b.y, b.w, b.h)) return i;
    }
    return -1;
  }

  function tryMoveBoxX(w, bi, dx) {
    if (dx === 0) return 0;
    var b = w.boxes[bi];
    var origX = b.x;
    var nx = b.x + dx;
    // Clamp against solid tiles
    var y0 = Math.floor(b.y / T);
    var y1 = Math.floor((b.y + b.h - 0.001) / T);
    if (dx > 0) {
      var rx = Math.floor((nx + b.w - 0.001) / T);
      for (var gy = y0; gy <= y1; gy++) {
        if (isSolidTile(tileAt(w, rx, gy))) {
          nx = Math.min(nx, rx * T - b.w);
        }
      }
    } else {
      var lx = Math.floor(nx / T);
      for (var gy2 = y0; gy2 <= y1; gy2++) {
        if (isSolidTile(tileAt(w, lx, gy2))) {
          nx = Math.max(nx, (lx + 1) * T);
        }
      }
    }
    // Clamp against platforms (allow smooth step-up <= 5px onto flush bridges/lifts)
    for (var pi = 0; pi < w.platforms.length; pi++) {
      var p = w.platforms[pi];
      if (overlap(nx, b.y, b.w, b.h, p.x, p.y, p.w, p.h)) {
        var lip = (b.y + b.h) - p.y;
        if (lip > 0 && lip <= 5 && !rectHitsTiles(w, nx, p.y - b.h, b.w, b.h)) {
          b.y = p.y - b.h;
          b.onPlatform = pi;
        } else {
          if (dx > 0) nx = Math.min(nx, p.x - b.w);
          else nx = Math.max(nx, p.x + p.w);
        }
      }
    }
    // Clamp against other crates
    for (var oi = 0; oi < w.boxes.length; oi++) {
      if (oi === bi) continue;
      var ob = w.boxes[oi];
      if (overlap(nx, b.y, b.w, b.h, ob.x, ob.y, ob.w, ob.h)) {
        if (dx > 0) nx = Math.min(nx, ob.x - b.w);
        else nx = Math.max(nx, ob.x + ob.w);
      }
    }
    b.x = nx;
    return b.x - origX;
  }

  /* --------------------------------------------------- platforms step */
  function stepPlatforms(w, dt) {
    var heroes = [w.fire, w.ice];
    for (var i = 0; i < w.platforms.length; i++) {
      var p = w.platforms[i];
      var targetProg = p.prog;
      if (p.auto) {
        if (p.pauseT > 0) {
          p.pauseT -= dt;
        } else {
          targetProg = p.prog + p.autoDir * (p.speed * dt) / p.dist;
          if (targetProg >= 1) { targetProg = 1; p.autoDir = -1; p.pauseT = p.pauseDur; }
          else if (targetProg <= 0) { targetProg = 0; p.autoDir = 1; p.pauseT = p.pauseDur; }
        }
      } else {
        var active = p.ch >= 0 && p.ch < w.channels.length && w.channels[p.ch];
        var goal = active ? 1 : 0;
        var stepP = (p.speed * dt) / p.dist;
        if (p.prog < goal) targetProg = Math.min(goal, p.prog + stepP);
        else if (p.prog > goal) targetProg = Math.max(goal, p.prog - stepP);
      }

      var nx = p.x0 + (p.x1 - p.x0) * targetProg;
      var ny = p.y0 + (p.y1 - p.y0) * targetProg;
      var dx = nx - p.x;
      var dy = ny - p.y;

      // Anti-crush guard: if moving down/sideways would crush a hero or crate into solid tiles, hold position
      var blocked = false;
      if (dx !== 0 || dy !== 0) {
        for (var hi = 0; hi < 2; hi++) {
          var h = heroes[hi];
          if (!h.alive) continue;
          var riding = h.onPlatform === i && h.grounded;
          if (riding) {
            if (rectHitsTiles(w, h.x + dx, h.y + dy, h.w, h.h)) { blocked = true; break; }
          } else if (overlap(nx, ny, p.w, p.h, h.x, h.y, h.w, h.h)) {
            // Check if pushing hero out would put hero inside solid wall
            var pushX = h.x, pushY = h.y;
            if (dy > 0 && h.y + h.h > ny) pushY = ny + p.h;
            else if (dy < 0 && h.y < ny + p.h) pushY = ny - h.h;
            else if (dx > 0) pushX = nx + p.w;
            else if (dx < 0) pushX = nx - h.w;
            if (rectHitsTiles(w, pushX, pushY, h.w, h.h)) { blocked = true; break; }
          }
        }
        if (!blocked) {
          for (var bi = 0; bi < w.boxes.length; bi++) {
            var b = w.boxes[bi];
            var bRiding = b.onPlatform === i && b.grounded;
            if (bRiding) {
              if (rectHitsTiles(w, b.x + dx, b.y + dy, b.w, b.h)) { blocked = true; break; }
            } else if (overlap(nx, ny, p.w, p.h, b.x, b.y, b.w, b.h)) {
              var bpx = b.x, bpy = b.y;
              if (dy > 0) bpy = ny + p.h;
              else if (dy < 0) bpy = ny - b.h;
              else if (dx > 0) bpx = nx + p.w;
              else if (dx < 0) bpx = nx - b.w;
              if (rectHitsTiles(w, bpx, bpy, b.w, b.h)) { blocked = true; break; }
            }
          }
        }
      }

      if (blocked) {
        p.dx = 0;
        p.dy = 0;
        continue;
      }

      p.prog = targetProg;
      p.dx = dx;
      p.dy = dy;
      p.x = nx;
      p.y = ny;

      // Carry riders and push non-riders cleanly
      for (var hi2 = 0; hi2 < 2; hi2++) {
        var h2 = heroes[hi2];
        if (!h2.alive) continue;
        if (h2.onPlatform === i && h2.grounded) {
          h2.x += dx;
          h2.y += dy;
        } else if (overlap(p.x, p.y, p.w, p.h, h2.x, h2.y, h2.w, h2.h)) {
          if (dy < 0 && h2.y + h2.h - p.y <= p.h * 0.65) {
            h2.y = p.y - h2.h;
            h2.grounded = true;
            h2.onPlatform = i;
          } else if (dy > 0) {
            h2.y = p.y + p.h;
          } else if (dx > 0) {
            h2.x = p.x + p.w;
          } else if (dx < 0) {
            h2.x = p.x - h2.w;
          }
        }
      }

      for (var bi2 = 0; bi2 < w.boxes.length; bi2++) {
        var b2 = w.boxes[bi2];
        if (b2.onPlatform === i && b2.grounded) {
          b2.x += dx;
          b2.y += dy;
        } else if (overlap(p.x, p.y, p.w, p.h, b2.x, b2.y, b2.w, b2.h)) {
          if (dy < 0) { b2.y = p.y - b2.h; b2.grounded = true; b2.onPlatform = i; }
          else if (dy > 0) b2.y = p.y + p.h;
          else if (dx > 0) b2.x = p.x + p.w;
          else if (dx < 0) b2.x = p.x - b2.w;
        }
      }
    }
  }

  /* -------------------------------------------------------- boxes step */
  function stepBoxes(w, dt) {
    for (var i = 0; i < w.boxes.length; i++) {
      var b = w.boxes[i];
      b.vy = Math.min(PH.maxFall, b.vy + PH.grav * dt);
      var ny = b.y + b.vy * dt;
      b.grounded = false;
      b.onPlatform = -1;

      if (b.vy >= 0) {
        var by = Math.floor((ny + b.h - 0.001) / T);
        var x0 = Math.floor(b.x / T);
        var x1 = Math.floor((b.x + b.w - 0.001) / T);
        for (var gx = x0; gx <= x1; gx++) {
          if (isSolidTile(tileAt(w, gx, by))) {
            if (b.y + b.h <= by * T + 8) {
              ny = Math.min(ny, by * T - b.h);
              b.vy = 0;
              b.grounded = true;
            }
          }
        }
        // Platforms
        for (var pi = 0; pi < w.platforms.length; pi++) {
          var p = w.platforms[pi];
          if (b.x + b.w > p.x && b.x < p.x + p.w && b.y + b.h <= p.y + 8 && ny + b.h >= p.y) {
            if (p.y - b.h <= ny) {
              ny = p.y - b.h;
              b.vy = 0;
              b.grounded = true;
              b.onPlatform = pi;
            }
          }
        }
        // Other crates
        for (var oi = 0; oi < w.boxes.length; oi++) {
          if (oi === i) continue;
          var ob = w.boxes[oi];
          if (b.x + b.w > ob.x && b.x < ob.x + ob.w && b.y + b.h <= ob.y + 8 && ny + b.h >= ob.y) {
            ny = Math.min(ny, ob.y - b.h);
            b.vy = 0;
            b.grounded = true;
          }
        }
      }
      b.y = ny;
    }
  }

  /* --------------------------------------------------------- hero step */
  function stepHero(w, h, inp, dt) {
    h.justJumped = false;
    h.justLanded = 0;
    h.pushing = 0;
    if (h.pushSfxCd > 0) h.pushSfxCd -= dt;
    if (!h.alive) return;

    var move = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    var jumpDown = !!inp.j;
    var jumpPressed = jumpDown && !h.prevJump;
    h.prevJump = jumpDown;

    if (move !== 0) h.face = move;

    // Horizontal acceleration & friction
    var accel = h.grounded ? PH.gAccel : PH.aAccel;
    var decel = h.grounded ? PH.gDecel : PH.aDecel;
    if (move !== 0) {
      var target = move * PH.speed;
      if (h.vx < target) h.vx = Math.min(target, h.vx + accel * dt);
      else if (h.vx > target) h.vx = Math.max(target, h.vx - accel * dt);
    } else {
      if (h.vx > 0) h.vx = Math.max(0, h.vx - decel * dt);
      else if (h.vx < 0) h.vx = Math.min(0, h.vx + decel * dt);
    }

    // Coyote time & jump buffer
    if (h.grounded) {
      h.coyoteT = PH.coyote;
    } else if (h.coyoteT > 0) {
      h.coyoteT = Math.max(0, h.coyoteT - dt);
    }

    if (jumpPressed) {
      h.jBufT = PH.jBuf;
    } else if (h.jBufT > 0) {
      h.jBufT = Math.max(0, h.jBufT - dt);
    }

    if (h.jBufT > 0 && h.coyoteT > 0) {
      h.vy = PH.jumpVy;
      h.grounded = false;
      h.onStone = false;
      h.onPlatform = -1;
      h.coyoteT = 0;
      h.jBufT = 0;
      h.jumpHeld = true;
      h.jumpTime = 0;
      h.poolGraceT = 0;
      h.justJumped = true;
      w.events.push({ t: 'jump', kind: h.kind, x: h.x + h.w / 2, y: h.y + h.h });
    }

    // Gravity with variable jump height
    if (!jumpDown) h.jumpHeld = false;
    var g = PH.grav;
    if (h.vy < 0) {
      h.jumpTime += dt;
      if (!h.jumpHeld && h.jumpTime >= PH.minJumpTime && h.vy < -140) {
        g = PH.grav * PH.cutGravMul;
      }
    }
    h.vy = Math.min(PH.maxFall, h.vy + g * dt);

    // ---- Move X ----
    var dx = h.vx * dt;
    var nx = h.x + dx;
    var steppedUp = false;

    if (dx !== 0) {
      // Check tile collisions along X (with ledge lip step-up forgiveness)
      if (rectHitsTiles(w, nx, h.y, h.w, h.h)) {
        var canStep = false;
        if (h.vy >= -40) {
          for (var lift = 1; lift <= PH.ledgeStep; lift++) {
            if (!rectHitsTiles(w, nx, h.y - lift, h.w, h.h) &&
                rectHitsPlatforms(w, nx, h.y - lift, h.w, h.h, -1) === -1 &&
                rectHitsBoxes(w, nx, h.y - lift, h.w, h.h, -1) === -1) {
              h.y -= lift;
              if (h.vy > 0) h.vy = 0;
              h.grounded = true;
              steppedUp = true;
              canStep = true;
              break;
            }
          }
        }
        if (!canStep) {
          if (dx > 0) {
            var rcol = Math.floor((nx + h.w - 0.001) / T);
            nx = rcol * T - h.w;
          } else {
            var lcol = Math.floor(nx / T);
            nx = (lcol + 1) * T;
          }
          h.vx = 0;
        }
      }

      // Check platforms along X
      for (var pi = 0; pi < w.platforms.length; pi++) {
        var p = w.platforms[pi];
        if (overlap(nx, h.y, h.w, h.h, p.x, p.y, p.w, p.h)) {
          // Forgiving step-up onto platform lip
          var lip = (h.y + h.h) - p.y;
          if (h.vy >= -40 && lip > 0 && lip <= PH.ledgeStep && !rectHitsTiles(w, nx, p.y - h.h, h.w, h.h)) {
            h.y = p.y - h.h;
            if (h.vy > 0) h.vy = 0;
            h.grounded = true;
            h.onPlatform = pi;
            steppedUp = true;
          } else {
            if (dx > 0) nx = p.x - h.w;
            else nx = p.x + p.w;
            h.vx = 0;
          }
        }
      }

      // Check pushable crates along X
      for (var bi = 0; bi < w.boxes.length; bi++) {
        var b = w.boxes[bi];
        if (overlap(nx, h.y, h.w, h.h, b.x, b.y, b.w, b.h)) {
          var bLip = (h.y + h.h) - b.y;
          if (h.vy >= -40 && bLip > 0 && bLip <= PH.ledgeStep && !rectHitsTiles(w, nx, b.y - h.h, h.w, h.h)) {
            h.y = b.y - h.h;
            if (h.vy > 0) h.vy = 0;
            h.grounded = true;
            steppedUp = true;
          } else if (h.grounded && move !== 0 && ((move > 0 && dx > 0) || (move < 0 && dx < 0))) {
            var pushAmt = move * PH.boxPushSpeed * dt;
            var moved = tryMoveBoxX(w, bi, pushAmt);
            if (dx > 0) nx = Math.min(nx, b.x - h.w);
            else nx = Math.max(nx, b.x + b.w);
            if (Math.abs(moved) > 0.01) {
              h.vx = move * PH.boxPushSpeed;
              h.pushing = move;
              if (h.pushSfxCd <= 0) {
                h.pushSfxCd = 0.22;
                w.events.push({ t: 'push', kind: h.kind, x: b.x + b.w / 2, y: b.y + b.h });
              }
            } else {
              h.vx = 0;
            }
          } else {
            if (dx > 0) nx = b.x - h.w;
            else nx = b.x + b.w;
            h.vx = 0;
          }
        }
      }
    }
    h.x = nx;

    // ---- Move Y ----
    var prevGrounded = h.grounded;
    var prevOnStone = h.onStone;
    var prevVy = h.vy;
    var dy = h.vy * dt;
    var ny = h.y + dy;
    h.grounded = steppedUp;
    h.onPlatform = -1;

    if (dy >= 0) {
      // Floor tiles
      var yBot = Math.floor((ny + h.h - 0.001) / T);
      var xL = Math.floor(h.x / T);
      var xR = Math.floor((h.x + h.w - 0.001) / T);
      for (var gx = xL; gx <= xR; gx++) {
        if (isSolidTile(tileAt(w, gx, yBot))) {
          if (h.y + h.h <= yBot * T + 10) {
            ny = Math.min(ny, yBot * T - h.h);
            h.vy = 0;
            h.grounded = true;
          }
        }
      }
      // Platforms
      for (var pi2 = 0; pi2 < w.platforms.length; pi2++) {
        var p2 = w.platforms[pi2];
        if (h.x + h.w > p2.x && h.x < p2.x + p2.w && h.y + h.h <= p2.y + 10 && ny + h.h >= p2.y) {
          if (p2.y - h.h <= ny) {
            ny = p2.y - h.h;
            h.vy = 0;
            h.grounded = true;
            h.onPlatform = pi2;
          }
        }
      }
      // Crates
      for (var bi2 = 0; bi2 < w.boxes.length; bi2++) {
        var b2 = w.boxes[bi2];
        if (h.x + h.w > b2.x && h.x < b2.x + b2.w && h.y + h.h <= b2.y + 10 && ny + h.h >= b2.y) {
          if (b2.y - h.h <= ny) {
            ny = b2.y - h.h;
            h.vy = 0;
            h.grounded = true;
          }
        }
      }
    } else {
      // Ceiling tiles (with corner nudge forgiveness)
      if (rectHitsTiles(w, h.x, ny, h.w, h.h)) {
        var nudged = false;
        for (var off = 1; off <= PH.cornerNudge; off++) {
          if (!rectHitsTiles(w, h.x + off, ny, h.w, h.h)) {
            h.x += off;
            nudged = true;
            break;
          }
          if (!rectHitsTiles(w, h.x - off, ny, h.w, h.h)) {
            h.x -= off;
            nudged = true;
            break;
          }
        }
        if (!nudged) {
          var yTop = Math.floor(ny / T);
          ny = (yTop + 1) * T;
          h.vy = 0;
        }
      }
      // Ceiling platforms
      for (var pi3 = 0; pi3 < w.platforms.length; pi3++) {
        var p3 = w.platforms[pi3];
        if (overlap(h.x, ny, h.w, h.h, p3.x, p3.y, p3.w, p3.h)) {
          ny = p3.y + p3.h;
          h.vy = 0;
        }
      }
      // Ceiling crates
      for (var bi3 = 0; bi3 < w.boxes.length; bi3++) {
        var b3 = w.boxes[bi3];
        if (overlap(h.x, ny, h.w, h.h, b3.x, b3.y, b3.w, b3.h)) {
          ny = b3.y + b3.h;
          h.vy = 0;
        }
      }
    }
    h.y = ny;

    if (!prevGrounded && h.grounded && prevVy > 150) {
      h.justLanded = clamp(prevVy / PH.maxFall, 0.2, 1);
      w.events.push({ t: 'land', kind: h.kind, x: h.x + h.w / 2, y: h.y + h.h, power: h.justLanded });
    }

    // ---- Pool hazard check (with forgiving safe-edge foothold & flush rim coyote grace) ----
    var footY = Math.floor((h.y + h.h + 1) / T);
    var footL = Math.floor((h.x + 2) / T);
    var footR = Math.floor((h.x + h.w - 2) / T);
    var touchingStone = h.onPlatform >= 0;
    var touchingDeadly = null;

    if (h.grounded) {
      // Check if standing on a crate
      for (var bi4 = 0; bi4 < w.boxes.length; bi4++) {
        var b4 = w.boxes[bi4];
        if (h.x + h.w > b4.x && h.x < b4.x + b4.w && Math.abs((h.y + h.h) - b4.y) <= 2) {
          touchingStone = true;
          break;
        }
      }
      if (!touchingStone) {
        for (var gx2 = footL; gx2 <= footR; gx2++) {
          var tc = tileAt(w, gx2, footY);
          if (tc === '#' || (isPoolTile(tc) && !isDeadlyPool(tc, h.kind))) {
            // Safe stone or own safe element underfoot!
            var tileLeft = gx2 * T, tileRight = (gx2 + 1) * T;
            var overlapW = Math.min(h.x + h.w, tileRight) - Math.max(h.x, tileLeft);
            if (overlapW >= 4) touchingStone = true;
          }
          if (isDeadlyPool(tc, h.kind)) {
            touchingDeadly = tc;
          }
        }
      }
    }

    h.onStone = touchingStone;

    if (touchingDeadly && !touchingStone) {
      // If we stepped horizontally off safe stone onto a flush deadly pool rim, allow a tiny coyote grace
      // so late-rim jumps rescue the player, while falling into a pool or sprinting into it still kills.
      if (prevGrounded && prevOnStone) {
        h.poolGraceT = PH.poolGrace;
      }
      if (h.poolGraceT > 0) {
        h.poolGraceT -= dt;
      } else {
        killHero(w, h, touchingDeadly);
      }
    } else {
      h.poolGraceT = 0;
    }

    // Out-of-bounds safety
    if (h.alive && h.y > w.height + T) {
      killHero(w, h, 'G');
    }
  }

  function killHero(w, h, poolChar) {
    if (!h.alive || w.state !== 'play') return;
    h.alive = false;
    w.state = 'dead';
    w.deadHero = h.kind;
    w.deadCause = poolChar === 'W' ? 'water' : poolChar === 'L' ? 'lava' : 'goo';
    w.events.push({ t: 'dead', kind: h.kind, cause: w.deadCause, x: h.x + h.w / 2, y: h.y + h.h / 2 });
  }

  /* --------------------------------------------------- interactions */
  function stepInteractions(w, dt) {
    var heroes = [w.fire, w.ice];

    // Gems
    for (var gi = 0; gi < w.gems.length; gi++) {
      var gm = w.gems[gi];
      if (gm.got) continue;
      var hero = gm.kind === 'fire' ? w.fire : w.ice;
      if (!hero.alive) continue;
      var cx = hero.x + hero.w / 2, cy = hero.y + hero.h / 2;
      var dx = cx - gm.x, dy = cy - gm.y;
      if (dx * dx + dy * dy <= 22 * 22) {
        gm.got = true;
        w.gemsGot[gm.kind]++;
        w.events.push({ t: 'gem', kind: gm.kind, x: gm.x, y: gm.y, got: w.gemsGot[gm.kind], total: w.gemsTotal[gm.kind] });
      }
    }

    // Levers
    for (var li = 0; li < w.levers.length; li++) {
      var lv = w.levers[li];
      if (lv.cd > 0) lv.cd = Math.max(0, lv.cd - dt);
      var lx = lv.gx * T + 2, ly = lv.gy * T + 4, lw = T - 4, lh = T - 4;
      for (var hi = 0; hi < 2; hi++) {
        var h = heroes[hi];
        var hit = h.alive && overlap(h.x, h.y, h.w, h.h, lx, ly, lw, lh);
        var key = hi === 0 ? 'inFire' : 'inIce';
        if (hit && !lv[key] && lv.cd <= 0) {
          lv.on = !lv.on;
          lv.cd = 0.32;
          w.events.push({ t: 'lever', id: lv.id, ch: lv.ch, on: lv.on, x: lv.x, y: lv.y - 12 });
        }
        lv[key] = hit;
      }
    }

    // Floor buttons
    for (var bi = 0; bi < w.buttons.length; bi++) {
      var bt = w.buttons[bi];
      var pressed = false;
      for (var hi2 = 0; hi2 < 2; hi2++) {
        var h2 = heroes[hi2];
        if (h2.alive && overlap(h2.x, h2.y, h2.w, h2.h, bt.x, bt.y - 2, bt.w, bt.h + 4)) {
          pressed = true;
          break;
        }
      }
      if (!pressed) {
        for (var ci = 0; ci < w.boxes.length; ci++) {
          var b = w.boxes[ci];
          if (overlap(b.x, b.y, b.w, b.h, bt.x, bt.y - 2, bt.w, bt.h + 4)) {
            pressed = true;
            break;
          }
        }
      }
      if (pressed !== bt.down) {
        bt.down = pressed;
        w.events.push({ t: 'btn', id: bt.id, ch: bt.ch, down: pressed, x: bt.x + bt.w / 2, y: bt.y });
      }
    }

    // Channels (any lever on OR any button pressed)
    for (var ch = 0; ch < 3; ch++) {
      var act = false;
      for (var li2 = 0; li2 < w.levers.length; li2++) if (w.levers[li2].ch === ch && w.levers[li2].on) { act = true; break; }
      if (!act) {
        for (var bi2 = 0; bi2 < w.buttons.length; bi2++) if (w.buttons[bi2].ch === ch && w.buttons[bi2].down) { act = true; break; }
      }
      w.channels[ch] = act;
    }

    // Exit doors
    for (var di = 0; di < 2; di++) {
      var k = di === 0 ? 'fire' : 'ice';
      var hd = w[k];
      var dr = w.doors[k];
      var prev = dr.inside;
      var hcx = hd.x + hd.w / 2;
      var dcx = dr.x + dr.w / 2;
      var inside = hd.alive && hd.grounded && Math.abs(hcx - dcx) <= 15 &&
        hd.y + hd.h >= dr.y + 8 && hd.y + hd.h <= dr.y + dr.h + 4;
      dr.inside = inside;
      hd.inDoor = inside;
      if (inside !== prev) {
        w.events.push({ t: 'door', kind: k, on: inside, x: dcx, y: dr.y + dr.h / 2 });
      }
    }

    if (w.doors.fire.inside && w.doors.ice.inside) {
      w.winT += dt;
      if (w.winT >= PH.winHold) {
        w.state = 'won';
        w.events.push({
          t: 'win',
          x1: w.doors.fire.x + w.doors.fire.w / 2,
          y1: w.doors.fire.y + w.doors.fire.h / 2,
          x2: w.doors.ice.x + w.doors.ice.w / 2,
          y2: w.doors.ice.y + w.doors.ice.h / 2
        });
      }
    } else {
      w.winT = 0;
    }
  }

  /* ---------------------------------------------------------- main step */
  function step(w, inp, dt) {
    if (!w || w.state !== 'play') return;
    dt = Math.min(0.05, Math.max(0, dt || 1 / 60));
    inp = inp || {};
    var fInp = inp.fire || { l: false, r: false, j: false };
    var iInp = inp.ice || { l: false, r: false, j: false };

    w.t += dt;
    stepPlatforms(w, dt);
    stepBoxes(w, dt);
    stepHero(w, w.fire, fInp, dt);
    if (w.state === 'play') stepHero(w, w.ice, iInp, dt);
    if (w.state === 'play') stepInteractions(w, dt);
  }

  function starsFor(w) {
    if (!w || w.state !== 'won') return { stars: 0, clear: false, gems: false, time: false };
    var allGems = w.gemsGot.fire === w.gemsTotal.fire && w.gemsGot.ice === w.gemsTotal.ice;
    var underPar = w.t <= w.par;
    return {
      stars: 1 + (allGems ? 1 : 0) + (underPar ? 1 : 0),
      clear: true,
      gems: allGems,
      time: underPar
    };
  }

  var FI = root.FI || {};
  FI.T = T;
  FI.PW = PW;
  FI.PH_H = PH_H;
  FI.BW = BW;
  FI.BH = BH;
  FI.PH = PH;
  FI.build = build;
  FI.step = step;
  FI.starsFor = starsFor;
  FI.tileAt = tileAt;
  FI.isSolidTile = isSolidTile;
  FI.isPoolTile = isPoolTile;
  FI.isDeadlyPool = isDeadlyPool;

  root.FI = FI;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FI;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
