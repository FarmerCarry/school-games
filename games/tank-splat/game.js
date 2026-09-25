/* Paint Tanks — match / round engine and world rendering.
   window.TS_GAME.create(opts) -> game object with update(dt) and render(ctx). */
(function () {
  'use strict';
  var A = window.TS_ART, M = window.TS_MAZE, S = window.TS_SND;
  var W = 1280, H = 720, TOP = 70;

  var TANK_SPEED = 165, TANK_ROT = 3.4, BALL_SPEED = 330, BALL_R = 7;
  var MAX_BALLS = 5, FIRE_CD = 0.13, BALL_LIFE = 7, BALL_BOUNCES = 6;
  var GIANT_R = 15, GIANT_SPEED = 245;
  var HIT_R = 17;
  var CORNERS = [[15, 15], [15, -15], [-15, 15], [-15, -15]];

  var CONTROLS = [
    { fwd: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'], fire: ['KeyQ', 'Space'] },
    { fwd: ['ArrowUp'], back: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], fire: ['Slash', 'Enter', 'NumpadEnter', 'Numpad0'] },
    { fwd: ['KeyI'], back: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], fire: ['KeyU'] }
  ];
  // A lone player can use either the WASD set or the arrow set.
  var SOLO = {
    fwd: CONTROLS[0].fwd.concat(CONTROLS[1].fwd), back: CONTROLS[0].back.concat(CONTROLS[1].back),
    left: CONTROLS[0].left.concat(CONTROLS[1].left), right: CONTROLS[0].right.concat(CONTROLS[1].right),
    fire: CONTROLS[0].fire.concat(CONTROLS[1].fire)
  };
  var KEY_HINT = ['W A S D  +  Q', '↑ ← ↓ →  +  /', 'I J K L  +  U'];

  var SPLAT_WORDS = ['طاخ!', 'بقعة!', 'لطخة!', 'سبلاش!', 'أصبت!', 'رائع!'];

  /* ------------------------------------------------------------ helpers */
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function angDiff(a, b) { var d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

  /* ------------------------------------------------------------ layers */
  // Floor, paint and walls are pre-rendered into offscreen canvases and
  // re-drawn only when the maze changes, the paint changes or the window resizes.
  var layers = { k: 1, floor: null, paint: null, walls: null };
  function mkLayer() { var cv = document.createElement('canvas'); return cv; }
  function sizeLayer(cv, k) { cv.width = Math.round(W * k); cv.height = Math.round(H * k); var c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0); return c; }

  /* ------------------------------------------------------------ game */
  function create(opts) {
    var G = {
      demo: !!opts.demo, target: opts.target || 3, stage: opts.stage == null ? -1 : opts.stage,
      tanks: [], balls: [], crates: [], parts: [], pops: [], splats: [], dots: [],
      maze: null, theme: null, themeIdx: Math.floor(Math.random() * A.THEMES.length),
      round: 0, state: 'ready', timer: 0, time: 0, shakeP: 0, shx: 0, shy: 0,
      slow: 0, spectate: 0, over: false, winner: null, coins: 0, onEnd: opts.onEnd || null,
      humans: 0, firstRound: true, banner: null, laserPts: [], lastSplatBy: null
    };
    var humanCount = 0;
    opts.players.forEach(function (p) { if (p.human) humanCount++; });
    G.humans = humanCount;
    opts.players.forEach(function (p, i) {
      var t = {
        id: i, slot: p.slot, pal: A.PAL[p.slot], name: p.name, human: !!p.human, hat: p.hat || 0, splat: p.splat || 0,
        ctrl: p.human ? (humanCount === 1 ? SOLO : CONTROLS[p.ctrl]) : null, ctrlIdx: p.ctrl || 0,
        bot: p.bot ? window.TS_BOT.create(p.bot) : null,
        score: 0, x: 0, y: 0, a: 0, alive: true, dead: 0, cool: 0, active: 0,
        weapon: null, ammo: 0, laser: 0, speed: 0, shield: 0,
        sq: 0, recoil: 0, tread: 0, blinkT: 1 + Math.random() * 3, blink: 0, flash: 0, scale: 0,
        paint: '#000', blobs: null, splats: 0, lastKill: -9, moving: 0, dispScore: 0
      };
      G.tanks.push(t);
    });

    G.newRound = newRound; G.update = update; G.render = render; G.skipSpectate = false;
    G.rebuildLayers = function () { buildLayers(G); };
    newRound();
    return G;

    /* -------------------------------------------------------- rounds */
    function newRound() {
      G.round++;
      G.themeIdx = (G.themeIdx + 1 + Math.floor(Math.random() * (A.THEMES.length - 1))) % A.THEMES.length;
      G.theme = A.THEMES[G.themeIdx];
      var n = G.tanks.length, cols, rows;
      if (n <= 2) { cols = 9 + Math.floor(Math.random() * 4); rows = 6 + Math.floor(Math.random() * 2); }
      else { cols = 11 + Math.floor(Math.random() * 4); rows = 6 + Math.floor(Math.random() * 2); }
      var cs = Math.min(90, Math.floor(1180 / cols), Math.floor((H - TOP - 44) / rows));
      var ox = Math.round((W - cols * cs) / 2), oy = Math.round(TOP + 8 + (H - TOP - 8 - rows * cs) / 2);
      G.maze = M.generate(cols, rows, cs, ox, oy, 0.22 + Math.random() * 0.12);
      G.balls.length = 0; G.crates.length = 0; G.pops.length = 0; G.splats.length = 0; G.dots.length = 0;
      G.crateT = 3 + Math.random() * 2;
      G.spectate = 0; G.skipSpectate = false; G.slow = 0; G.endT = 0; G.banner = null;
      placeTanks();
      G.state = 'ready'; G.timer = G.demo ? 0.6 : (G.round === 1 ? 2.2 : 1.5);
      if (!G.demo) S.beep();
      buildLayers(G);
    }

    function placeTanks() {
      var m = G.maze, N = m.cols * m.rows, best = null, bestScore = -1;
      for (var tries = 0; tries < 80; tries++) {
        var cells = [];
        for (var i = 0; i < G.tanks.length; i++) {
          var c; do { c = Math.floor(Math.random() * N); } while (cells.indexOf(c) >= 0);
          cells.push(c);
        }
        var sc = 1e9;
        for (var a = 0; a < cells.length; a++) for (var b = a + 1; b < cells.length; b++) {
          var d = Math.abs(cells[a] % m.cols - cells[b] % m.cols) + Math.abs(((cells[a] / m.cols) | 0) - ((cells[b] / m.cols) | 0));
          if (d < sc) sc = d;
        }
        if (sc > bestScore) { bestScore = sc; best = cells; }
      }
      G.tanks.forEach(function (t, i) {
        var cc = M.cellCenter(m, best[i]);
        t.x = cc.x; t.y = cc.y;
        var cx = best[i] % m.cols, cy = (best[i] / m.cols) | 0, open = [];
        for (var d = 0; d < 4; d++) if (M.canPass(m, cx, cy, d)) open.push(d);
        var dd = open.length ? open[Math.floor(Math.random() * open.length)] : 0;
        t.a = [0, Math.PI / 2, Math.PI, -Math.PI / 2][dd];
        t.alive = true; t.dead = 0; t.cool = 0.2; t.active = 0; t.weapon = null; t.ammo = 0;
        t.laser = 0; t.speed = 0; t.shield = 0; t.sq = 0; t.recoil = 0; t.flash = 0; t.scale = 0; t.blobs = null;
        if (t.bot) window.TS_BOT.reset(t.bot);
      });
    }

    function finishRound(winner) {
      if (G.state !== 'play') return;
      G.state = 'roundEnd';
      G.timer = G.demo ? 1.2 : 2.3;
      G.slow = 0; G.spectate = 0;
      G.winner = winner;
      if (winner) {
        winner.score++;
        if (winner.human && !G.demo) G.coins += 10;
        if (!G.demo) { S.roundWin(); setTimeout(function () { S.point(); }, 380); }
        burst(winner.x, winner.y, 30, [winner.pal.paint, '#fff', '#ffe14d'], 260, 5, 0.9);
      } else if (!G.demo) S.roundDraw();
      G.banner = { t: 0, winner: winner, draw: !winner };
      if (winner && winner.score >= G.target && !G.demo) {
        G.over = true;
        if (winner.human) G.coins += 30;
        G.timer = 2.6;
      }
    }

    /* -------------------------------------------------------- update */
    function update(dt) {
      G.time += dt;
      var sdt = dt;
      if (G.slow > 0) { G.slow -= dt; sdt = dt * 0.3; }
      if (G.state === 'play' && G.spectate > 0) sdt = dt * 2.2;

      // shake
      G.shakeP = Math.max(0, G.shakeP - dt * 38);
      G.shx = (Math.random() - 0.5) * 2 * G.shakeP; G.shy = (Math.random() - 0.5) * 2 * G.shakeP;

      if (G.state === 'ready') {
        G.timer -= dt;
        G.tanks.forEach(function (t) { t.scale = Math.min(1, t.scale + dt * 3.2); animTank(t, dt); });
        if (G.timer <= 0) {
          G.state = 'play';
          if (!G.demo) { S.go(); pop(W / 2, H / 2 + 10, 'انطلق!', '#ffffff', 78, 0.9, true); }
          G.tanks.forEach(function (t) { t.scale = 1; });
        }
      } else if (G.state === 'play') {
        playStep(sdt, dt);
      } else if (G.state === 'roundEnd') {
        G.timer -= dt;
        if (G.banner) G.banner.t += dt;
        G.tanks.forEach(function (t) { animTank(t, dt); });
        stepBalls(sdt, true);
        if (G.timer <= 0) {
          if (G.over) {
            G.state = 'matchEnd';
            var w = null; G.tanks.forEach(function (t) { if (t.score >= G.target) w = t; });
            G.matchWinner = w;
            if (G.onEnd) G.onEnd(G, w);
          } else {
            G.firstRound = false;
            newRound();
          }
        }
      } else if (G.state === 'matchEnd') {
        G.tanks.forEach(function (t) { animTank(t, dt); });
        if (Math.random() < 0.25) {
          var wt = G.matchWinner;
          burst(Math.random() * W, -10, 3, ['#ff4f63', '#ffc61f', '#3fd15d', '#3b8cff', '#a64dff', wt ? wt.pal.paint : '#fff'], 120, 6, 2.5, 220);
        }
      }
      stepParts(dt);
      stepPops(dt);
    }

    function animTank(t, dt) {
      t.sq = Math.max(0, t.sq - dt * 4);
      t.recoil = Math.max(0, t.recoil - dt * 7);
      t.flash = Math.max(0, t.flash - dt * 4);
      t.blinkT -= dt;
      if (t.blinkT < 0) { t.blink = 0.12; t.blinkT = 2 + Math.random() * 3.5; }
      t.blink = Math.max(0, t.blink - dt);
      if (!t.alive) t.dead = Math.min(1, t.dead + dt * 3);
      t.dispScore += (t.score - t.dispScore) * Math.min(1, dt * 6);
    }

    function readInput(t) {
      var k = Kit.keys, c = t.ctrl;
      return {
        fwd: (k.anyDown(c.fwd) ? 1 : 0) - (k.anyDown(c.back) ? 1 : 0),
        turn: (k.anyDown(c.right) ? 1 : 0) - (k.anyDown(c.left) ? 1 : 0),
        fire: k.anyPressed(c.fire)
      };
    }

    function playStep(dt, realDt) {
      var m = G.maze, i;
      for (i = 0; i < G.tanks.length; i++) {
        var t = G.tanks[i];
        animTank(t, dt);
        if (!t.alive) continue;
        var inp = t.human && !t.bot ? readInput(t) : window.TS_BOT.think(t.bot, t, G, dt);
        t.cool -= dt;
        if (t.laser > 0) t.laser -= dt;
        if (t.speed > 0) t.speed -= dt;
        if (t.shield > 0) t.shield -= dt;
        var spd = TANK_SPEED * (t.speed > 0 ? 1.55 : 1);
        var rot = TANK_ROT * (t.speed > 0 ? 1.25 : 1);
        t.a += inp.turn * rot * dt;
        var mv = inp.fwd * spd * (inp.fwd < 0 ? 0.72 : 1) * dt;
        var ox = t.x, oy = t.y;
        t.x += Math.cos(t.a) * mv; t.y += Math.sin(t.a) * mv;
        resolveTank(t);
        var moved = Math.hypot(t.x - ox, t.y - oy);
        t.tread += (inp.fwd >= 0 ? 1 : -1) * moved + Math.abs(inp.turn) * dt * 30;
        t.moving = moved / Math.max(dt, 1e-4);
        if (t.speed > 0 && moved > 0.5 && Math.random() < 0.5) {
          burst(t.x - Math.cos(t.a) * 22, t.y - Math.sin(t.a) * 22, 1, ['#ffe14d', '#fff'], 40, 4, 0.35);
        }
        if (inp.fire) fire(t);
      }
      // tank vs tank
      for (i = 0; i < G.tanks.length; i++) {
        var a = G.tanks[i]; if (!a.alive) continue;
        for (var j = i + 1; j < G.tanks.length; j++) {
          var b = G.tanks[j]; if (!b.alive) continue;
          var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d < 36 && d > 0.01) {
            var push = (36 - d) / 2; dx /= d; dy /= d;
            a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
            resolveTank(a); resolveTank(b);
          }
        }
      }
      stepBalls(dt, false);
      stepCrates(dt);

      // round end?
      var alive = 0, last = null, humansAlive = 0;
      G.tanks.forEach(function (t) { if (t.alive) { alive++; last = t; if (t.human) humansAlive++; } });
      if (alive <= 1) {
        G.endT += realDt;
        if (G.endT > 1.0) finishRound(last);
      } else if (!G.demo && humansAlive === 0) {
        G.spectate += realDt;
        if (G.spectate > 9 || G.skipSpectate || Kit.keys.anyPressed(['Space', 'Enter'])) finishRound(null);
      }
    }

    // Tank collision: one centre circle plus four corner circles.
    function resolveTank(t) {
      var m = G.maze;
      for (var it = 0; it < 3; it++) {
        var o = M.collideCircle(m, t.x, t.y, 16);
        t.x = o.x; t.y = o.y;
        var ca = Math.cos(t.a), sa = Math.sin(t.a);
        for (var k = 0; k < 4; k++) {
          var lx = CORNERS[k][0], ly = CORNERS[k][1];
          var wx = t.x + lx * ca - ly * sa, wy = t.y + lx * sa + ly * ca;
          var o2 = M.collideCircle(m, wx, wy, 6);
          t.x += o2.x - wx; t.y += o2.y - wy;
        }
      }
      // keep inside maze bounds (safety)
      var x1 = m.ox + 16, x2 = m.ox + m.cols * m.cs - 16, y1 = m.oy + 16, y2 = m.oy + m.rows * m.cs - 16;
      if (t.x < x1) t.x = x1; if (t.x > x2) t.x = x2; if (t.y < y1) t.y = y1; if (t.y > y2) t.y = y2;
    }

    function fire(t) {
      if (t.cool > 0) return;
      var lim = t.bot ? t.bot.p.maxBalls : MAX_BALLS;
      if (t.active >= lim && t.weapon !== 'giant') { if (t.human && !G.demo) S.nope(); t.cool = 0.12; return; }
      t.cool = FIRE_CD;
      t.recoil = 1; t.sq = 0.7;
      var giant = false, angles = [0];
      if (t.weapon === 'triple') { angles = [-0.24, 0, 0.24]; }
      else if (t.weapon === 'giant') { giant = true; }
      if (t.weapon) { t.ammo--; if (t.ammo <= 0) t.weapon = null; }
      for (var i = 0; i < angles.length; i++) spawnBall(t, t.a + angles[i], giant);
      var mx = t.x + Math.cos(t.a) * 28, my = t.y + Math.sin(t.a) * 28;
      burst(mx, my, giant ? 10 : 5, [t.pal.paint, '#fff'], 120, giant ? 6 : 4, 0.25);
      if (!G.demo) { if (giant) S.giant(); else S.fire(t.human ? 1 : 0.85 + t.slot * 0.05); }
    }

    function spawnBall(t, ang, giant) {
      var r = giant ? GIANT_R : BALL_R, sp = giant ? GIANT_SPEED : BALL_SPEED;
      var b = {
        x: t.x, y: t.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: r, owner: t,
        life: BALL_LIFE, bounces: 0, maxB: giant ? 4 : BALL_BOUNCES, safe: true, dist: 0,
        color: t.pal.paint, sq: 0, sqA: 0, giant: giant
      };
      // travel from the tank centre to the muzzle, bouncing if the barrel is in a wall
      moveBall(b, 26, true);
      t.active++;
      G.balls.push(b);
    }

    function moveBall(b, len, spawning) {
      var sp = Math.hypot(b.vx, b.vy); if (sp < 1) return;
      var steps = Math.max(1, Math.ceil(len / 3)), stepLen = len / steps;
      for (var s = 0; s < steps; s++) {
        b.x += b.vx / sp * stepLen; b.y += b.vy / sp * stepLen;
        b.dist += stepLen;
        var o = M.collideCircle(G.maze, b.x, b.y, b.r);
        if (o.hit) {
          b.x = o.x; b.y = o.y;
          var nl = Math.hypot(o.nx, o.ny);
          if (nl > 0) {
            var nx = o.nx / nl, ny = o.ny / nl, dot = b.vx * nx + b.vy * ny;
            if (dot < 0) {
              b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
              b.bounces++; b.sq = 1; b.sqA = Math.atan2(ny, nx);
              if (!spawning) {
                if (!G.demo) S.bounce(Math.min(b.bounces, 6));
                addDot(b.x - nx * b.r * 0.6, b.y - ny * b.r * 0.6, b.giant ? 7 : 3.2, b.color);
                if (b.giant) G.shakeP = Math.max(G.shakeP, 3);
              }
            }
          }
        }
        if (b.safe && b.dist > 30 && Math.hypot(b.x - b.owner.x, b.y - b.owner.y) > HIT_R + b.r + 4) b.safe = false;
        if (!spawning && hitTanks(b)) return true;
        if (b.bounces > b.maxB) { b.life = 0; return true; }
      }
      return false;
    }

    function hitTanks(b) {
      for (var i = 0; i < G.tanks.length; i++) {
        var t = G.tanks[i];
        if (!t.alive) continue;
        if (t === b.owner && b.safe) continue;
        var dx = b.x - t.x, dy = b.y - t.y, d = Math.hypot(dx, dy);
        if (t.shield > 0 && d < 30 + b.r) {
          if (t === b.owner && b.safe) continue;
          // bounce off the shield bubble
          var nx = dx / (d || 1), ny = dy / (d || 1), dot = b.vx * nx + b.vy * ny;
          if (dot < 0) {
            b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; b.bounces++; b.safe = false; b.sq = 1; b.sqA = Math.atan2(ny, nx);
            t.flash = 0.4;
            if (!G.demo) S.shield();
            burst(t.x + nx * 30, t.y + ny * 30, 6, ['#bff0ff', '#fff'], 120, 4, 0.3);
          }
          b.x = t.x + nx * (31 + b.r); b.y = t.y + ny * (31 + b.r);
          continue;
        }
        if (d < HIT_R + b.r) {
          splatTank(t, b.owner, b);
          b.life = 0;
          return true;
        }
      }
      return false;
    }

    function stepBalls(dt, frozen) {
      for (var i = G.balls.length - 1; i >= 0; i--) {
        var b = G.balls[i];
        if (frozen) { b.life = Math.min(b.life, 0.25); }
        b.life -= dt;
        b.sq = Math.max(0, b.sq - dt * 7);
        if (b.life > 0 && !frozen) moveBall(b, Math.hypot(b.vx, b.vy) * dt, false);
        if (b.life <= 0) {
          G.balls.splice(i, 1);
          b.owner.active = Math.max(0, b.owner.active - 1);
          burst(b.x, b.y, b.giant ? 12 : 6, [b.color, '#fff'], 90, b.giant ? 6 : 3.5, 0.3);
          if (!G.demo && !frozen) S.pop();
        }
      }
    }

    function splatTank(t, killer, b) {
      t.alive = false; t.dead = 0; t.paint = killer.pal.paint; t.shield = 0;
      var rnd = Math.random, blobs = [];
      for (var k = 0; k < 7; k++) blobs.push((rnd() - 0.5) * 30, (rnd() - 0.5) * 26, 4 + rnd() * 6);
      t.blobs = blobs;
      addSplat(t.x, t.y, b && b.giant ? 62 : 46, killer.pal.paint, killer.splat);
      burst(t.x, t.y, 34, [killer.pal.paint, killer.pal.light, t.pal.main, '#fff'], 340, 7, 0.75);
      G.shakeP = Math.max(G.shakeP, G.demo ? 4 : 13);
      if (!G.demo) S.splat();
      var self = killer === t;
      if (G.demo) { /* quiet title-screen demo */ }
      else if (self) {
        pop(t.x, t.y - 34, 'أوبس!', '#ffffff', 40, 1.2);
        if (!G.demo) S.oops();
      } else {
        killer.splats++;
        var word = SPLAT_WORDS[Math.floor(Math.random() * SPLAT_WORDS.length)];
        if (G.time - killer.lastKill < 3) word = 'ضربة مزدوجة!';
        killer.lastKill = G.time;
        pop(t.x, t.y - 34, word, killer.pal.light, 40, 1.2);
        if (killer.human && !G.demo) G.coins += 5;
      }
      var alive = 0; G.tanks.forEach(function (x) { if (x.alive) alive++; });
      if (alive <= 1 && !G.demo) G.slow = 0.55;
    }

    /* -------------------------------------------------------- crates */
    function stepCrates(dt) {
      var m = G.maze, maxC = G.tanks.length > 2 ? 3 : 2;
      G.crateT -= dt;
      if (G.crateT <= 0) {
        G.crateT = 4.5 + Math.random() * 3.5;
        if (G.crates.length < maxC) {
          for (var tries = 0; tries < 30; tries++) {
            var c = Math.floor(Math.random() * m.cols * m.rows), cc = M.cellCenter(m, c), ok = true;
            G.tanks.forEach(function (t) { if (t.alive && Math.hypot(t.x - cc.x, t.y - cc.y) < 150) ok = false; });
            G.crates.forEach(function (k) { if (Math.hypot(k.x - cc.x, k.y - cc.y) < 10) ok = false; });
            if (ok) {
              var pw = A.POWERS[Math.floor(Math.random() * A.POWERS.length)];
              G.crates.push({ x: cc.x, y: cc.y, pw: pw, t: Math.random() * 3, pop: 0 });
              if (!G.demo) S.crate();
              break;
            }
          }
        }
      }
      for (var i = G.crates.length - 1; i >= 0; i--) {
        var k = G.crates[i];
        k.t += dt; k.pop = Math.min(1, k.pop + dt * 4);
        for (var j = 0; j < G.tanks.length; j++) {
          var t = G.tanks[j];
          if (!t.alive || Math.hypot(t.x - k.x, t.y - k.y) > 32) continue;
          givePower(t, k.pw);
          burst(k.x, k.y, 18, [k.pw.color, '#fff', '#ffe14d'], 220, 5, 0.5);
          if (!G.demo) pop(k.x, k.y - 28, k.pw.name, k.pw.color, 30, 1.1);
          G.crates.splice(i, 1);
          break;
        }
      }
    }

    function givePower(t, pw) {
      t.flash = 0.6; t.sq = 0.6;
      if (!G.demo) S.pickup();
      switch (pw.id) {
        case 'laser': t.laser = 10; break;
        case 'triple': t.weapon = 'triple'; t.ammo = 3; break;
        case 'giant': t.weapon = 'giant'; t.ammo = 2; break;
        case 'speed': t.speed = 7; if (!G.demo) S.speed(); break;
        case 'shield': t.shield = 7; if (!G.demo) S.shield(); break;
      }
    }

    /* -------------------------------------------------------- effects */
    function burst(x, y, n, colors, speed, size, life, grav) {
      for (var i = 0; i < n; i++) {
        if (G.parts.length > 450) G.parts.shift();
        var a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
        G.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: size * (0.5 + Math.random() * 0.7),
          life: life * (0.6 + Math.random() * 0.4), max: life, c: colors[Math.floor(Math.random() * colors.length)], g: grav || 0 });
      }
    }
    function stepParts(dt) {
      for (var i = G.parts.length - 1; i >= 0; i--) {
        var p = G.parts[i];
        p.life -= dt;
        if (p.life <= 0) { G.parts.splice(i, 1); continue; }
        var f = p.g ? 1 : Math.pow(0.04, dt);
        p.vx *= f; p.vy = p.vy * f + p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }
    function pop(x, y, text, color, size, life, center) {
      if (G.pops.length > 12) G.pops.shift();
      G.pops.push({ x: x, y: y, text: text, color: color, size: size, life: life, max: life, center: !!center });
    }
    function stepPops(dt) {
      for (var i = G.pops.length - 1; i >= 0; i--) {
        var p = G.pops[i];
        p.life -= dt; if (!p.center) p.y -= dt * 30;
        if (p.life <= 0) G.pops.splice(i, 1);
      }
    }
    G.burst = burst; G.pop = pop;

    function addSplat(x, y, s, color, style) {
      var rec = { x: x, y: y, s: s, color: color, style: style, seed: (Math.random() * 1e9) | 0 };
      if (G.splats.length > 60) G.splats.shift();
      G.splats.push(rec);
      drawSplatRec(rec);
    }
    function addDot(x, y, r, color) {
      var rec = { x: x, y: y, r: r, color: color };
      if (G.dots.length < 400) { G.dots.push(rec); drawDotRec(rec); }
    }
  }

  function paintCtx() { var c = layers.paint.getContext('2d'); c.setTransform(layers.k, 0, 0, layers.k, 0, 0); return c; }
  var curGame = null;
  function clipMaze(c, m) { c.beginPath(); c.rect(m.ox - 4, m.oy - 4, m.cols * m.cs + 8, m.rows * m.cs + 8); c.clip(); }
  function drawSplatRec(rec) {
    if (!layers.paint || !curGame) return;
    var c = paintCtx(); c.save(); clipMaze(c, curGame.maze);
    A.drawSplat(c, rec.x, rec.y, rec.s, rec.color, rec.style, mulberry(rec.seed));
    c.restore();
  }
  function drawDotRec(rec) {
    if (!layers.paint || !curGame) return;
    var c = paintCtx(); c.save(); clipMaze(c, curGame.maze);
    c.globalAlpha = 0.55; c.fillStyle = rec.color; A.circle(c, rec.x, rec.y, rec.r); c.fill();
    c.restore();
  }

  function buildLayers(G) {
    curGame = G;
    var k = layers.k;
    if (!layers.floor) { layers.floor = mkLayer(); layers.paint = mkLayer(); layers.walls = mkLayer(); }
    var fc = sizeLayer(layers.floor, k);
    A.drawFloor(fc, G.maze, G.theme);
    sizeLayer(layers.paint, k);
    G.splats.forEach(drawSplatRec);
    G.dots.forEach(drawDotRec);
    var wc = sizeLayer(layers.walls, k);
    A.drawWalls(wc, G.maze, G.theme, true);
    A.drawWalls(wc, G.maze, G.theme, false);
  }

  function setQuality(k, G) {
    k = Math.max(0.5, Math.min(2, k));
    if (Math.abs(k - layers.k) < 0.01 && layers.floor) return;
    layers.k = k;
    if (G && G.maze) buildLayers(G);
  }

  /* ------------------------------------------------------------ render */
  function text(c, str, x, y, size, fill, align, stroke, sw) {
    c.font = '700 ' + size + 'px Fredoka';
    c.direction = 'rtl';
    c.textAlign = align || 'center';
    c.textBaseline = 'middle';
    if (stroke) { c.lineJoin = 'round'; c.lineWidth = sw || size * 0.2; c.strokeStyle = stroke; c.strokeText(str, x, y); }
    c.fillStyle = fill; c.fillText(str, x, y);
  }

  function render(c) {
    var G = this;
    if (curGame !== G) buildLayers(G);
    c.save();
    c.translate(G.shx, G.shy);
    c.drawImage(layers.floor, 0, 0, W, H);
    c.drawImage(layers.paint, 0, 0, W, H);
    c.drawImage(layers.walls, 0, 0, W, H);
    var i, t;
    // crates
    for (i = 0; i < G.crates.length; i++) { var k = G.crates[i]; A.drawCrate(c, k.x, k.y, k.pw, k.t, easeBack(k.pop)); }
    // laser aim lines
    for (i = 0; i < G.tanks.length; i++) {
      t = G.tanks[i];
      if (!t.alive || t.laser <= 0 || G.state !== 'play') continue;
      var mx = t.x, my = t.y;
      M.trace(G.maze, mx, my, t.a, { r: BALL_R, bounces: 3, len: 1000 }, G.laserPts);
      var p = G.laserPts;
      c.save();
      c.globalAlpha = t.laser < 2 ? (Math.sin(G.time * 20) > 0 ? 0.8 : 0.3) : 0.85;
      c.lineWidth = 4; c.lineCap = 'round'; c.strokeStyle = t.pal.paint;
      c.setLineDash([2, 10]); c.lineDashOffset = -G.time * 40;
      c.beginPath(); c.moveTo(p[0], p[1]);
      for (var q = 2; q < p.length; q += 2) c.lineTo(p[q], p[q + 1]);
      c.stroke();
      c.setLineDash([]);
      c.restore();
    }
    // dead tanks first, then living
    for (var pass = 0; pass < 2; pass++) {
      for (i = 0; i < G.tanks.length; i++) {
        t = G.tanks[i];
        if ((pass === 0) === t.alive) continue;
        A.drawTank(c, {
          x: t.x, y: t.y, a: t.a, pal: t.pal, hat: t.hat, sq: t.sq, recoil: t.recoil, tread: t.tread, t: G.time,
          blink: t.blink > 0, dead: t.alive ? 0 : t.dead, paint: t.paint, blobs: t.blobs, shield: t.alive ? t.shield : 0,
          flash: t.flash, scale: easeBack(t.scale)
        });
      }
    }
    // balls
    for (i = 0; i < G.balls.length; i++) {
      var b = G.balls[i], sp = Math.hypot(b.vx, b.vy);
      c.globalAlpha = 0.25; A.circle(c, b.x - b.vx / sp * b.r * 1.6, b.y - b.vy / sp * b.r * 1.6, b.r * 0.75); c.fillStyle = b.color; c.fill();
      c.globalAlpha = 0.12; A.circle(c, b.x - b.vx / sp * b.r * 3, b.y - b.vy / sp * b.r * 3, b.r * 0.55); c.fill();
      c.globalAlpha = b.life < 1 ? (Math.sin(G.time * 30) > 0 ? 1 : 0.5) : 1;
      A.drawBall(c, b.x, b.y, b.r, b.color, b.sq, b.sqA);
      c.globalAlpha = 1;
    }
    // particles
    for (i = 0; i < G.parts.length; i++) {
      var pt = G.parts[i];
      c.globalAlpha = Math.max(0, Math.min(1, pt.life / pt.max * 1.5));
      c.fillStyle = pt.c; A.circle(c, pt.x, pt.y, pt.r); c.fill();
    }
    c.globalAlpha = 1;
    // name tags during the countdown
    if (G.state === 'ready' && !G.demo) {
      for (i = 0; i < G.tanks.length; i++) {
        t = G.tanks[i];
        var bob = Math.sin(G.time * 6 + i) * 3;
        text(c, t.name, t.x, t.y - 44 + bob, 22, '#fff', 'center', t.pal.dark, 6);
        c.fillStyle = t.pal.dark;
        c.beginPath(); c.moveTo(t.x - 7, t.y - 31 + bob); c.lineTo(t.x + 7, t.y - 31 + bob); c.lineTo(t.x, t.y - 23 + bob); c.closePath(); c.fill();
        if (t.human && G.firstRound) {
          var hint = G.humans === 1 ? 'W A S D  +  Q' : KEY_HINT[t.ctrlIdx];
          c.font = '700 17px Fredoka'; c.direction = 'ltr';
          var tw = c.measureText(hint).width + 20;
          var hx = Math.max(G.maze.ox + tw / 2, Math.min(G.maze.ox + G.maze.cols * G.maze.cs - tw / 2, t.x));
          A.rr(c, hx - tw / 2, t.y + 30, tw, 28, 14); c.fillStyle = 'rgba(42,34,64,0.85)'; c.fill();
          c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(hint, hx, t.y + 45);
        }
      }
    }
    // popups
    for (i = 0; i < G.pops.length; i++) {
      var pp = G.pops[i], f = pp.life / pp.max, age = pp.max - pp.life;
      var s = age < 0.15 ? 0.5 + age / 0.15 * 0.7 : age < 0.3 ? 1.2 - (age - 0.15) / 0.15 * 0.2 : 1;
      c.save(); c.globalAlpha = Math.min(1, f * 3);
      c.translate(pp.x, pp.y); c.scale(s, s);
      text(c, pp.text, 0, 0, pp.size, pp.color, 'center', '#2a2240', pp.size * 0.22);
      c.restore();
    }
    c.restore();

    if (!G.demo && G.state !== 'matchEnd') drawHud(c, G);
  }

  function easeBack(t) { if (t >= 1) return 1; var s = 1.7; t = t - 1; return t * t * ((s + 1) * t + s) + 1; }

  /* ------------------------------------------------------------ HUD */
  function drawHud(c, G) {
    var n = G.tanks.length, gap = 12;
    var bw = Math.min(250, (W - 170 - (n - 1) * gap) / n), bh = 54;
    var total = n * bw + (n - 1) * gap, x0 = W / 2 + total / 2;
    for (var i = 0; i < n; i++) {
      var t = G.tanks[i];
      var x = x0 - (i + 1) * bw - i * gap, y = 8;
      var hl = G.state === 'roundEnd' && G.winner === t ? 1 + Math.sin(G.time * 12) * 0.04 : 1;
      c.save();
      c.translate(x + bw / 2, y + bh / 2); c.scale(hl, hl); c.translate(-(x + bw / 2), -(y + bh / 2));
      A.rr(c, x, y + 4, bw, bh, 18); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fill();
      A.rr(c, x, y, bw, bh, 18); c.fillStyle = t.alive || G.state === 'ready' ? '#fff' : '#e4e0ee'; c.fill();
      c.lineWidth = 4; c.strokeStyle = t.pal.dark; c.stroke();
      // mini tank on the right
      c.save(); c.beginPath(); A.rr(c, x, y, bw, bh, 18); c.clip();
      A.rr(c, x + bw - 58, y, 58, bh, 0); c.fillStyle = t.pal.light; c.fill();
      c.restore();
      A.drawTank(c, { x: x + bw - 30, y: y + bh / 2 + 2, a: -Math.PI / 2, pal: t.pal, hat: 0, t: G.time, scale: 0.62,
        dead: t.alive || G.state === 'ready' ? 0 : 1, paint: t.paint, blobs: t.blobs });
      // name
      c.font = '700 20px Fredoka';
      var name = t.name;
      text(c, name, x + bw - 64, y + 17, 20, '#2a2240', 'right');
      // pips
      var pr = G.target > 5 ? 6 : 7.5, ps = pr * 2 + 5;
      var px = x + bw - 64 - pr;
      for (var p = 0; p < G.target; p++) {
        var cx = px - p * ps, cy = y + 39;
        A.circle(c, cx, cy, pr);
        var filled = p < t.score;
        var popIn = filled && p === t.score - 1 && G.state === 'roundEnd' && G.winner === t ? Math.min(1, G.banner.t * 3) : 1;
        c.fillStyle = '#ece8f5'; c.fill();
        if (filled) { A.circle(c, cx, cy, pr * easeBack(popIn)); c.fillStyle = t.pal.main; c.fill(); }
        A.circle(c, cx, cy, pr); c.lineWidth = 2; c.strokeStyle = t.pal.dark; c.stroke();
      }
      // power icon at the left end
      var ic = t.weapon || (t.laser > 0 ? 'laser' : t.shield > 0 ? 'shield' : t.speed > 0 ? 'speed' : null);
      if (ic && t.alive) A.drawPowerIcon(c, ic, x + 20, y + bh / 2, 0.85, G.time);
      c.restore();
    }

    // round banner / states
    if (G.state === 'ready') {
      var bt = 1 - Math.max(0, G.timer - (G.round === 1 ? 1.2 : 0.5));
      var sc = easeBack(Math.min(1, bt * 3));
      c.save(); c.translate(W / 2, H / 2); c.scale(sc, sc);
      ribbon(c, 0, 0, 420, 96, G.theme.wall);
      text(c, 'الجولة ' + G.round, 0, -8, 50, '#fff', 'center', '#2a2240', 9);
      text(c, G.theme.name, 0, 34, 22, '#fff', 'center', '#2a2240', 5);
      c.restore();
    }
    if (G.state === 'play' && G.spectate > 0) {
      A.rr(c, W / 2 - 250, H - 62, 500, 46, 23); c.fillStyle = 'rgba(42,34,64,0.8)'; c.fill();
      text(c, 'الكمبيوتر يكمل الجولة...  مسافة = تخطٍّ', W / 2, H - 39, 22, '#fff', 'center');
    }
    if ((G.state === 'roundEnd') && G.banner) {
      var bn = G.banner, s2 = easeBack(Math.min(1, bn.t * 3.5));
      var w = bn.winner;
      var msg = bn.draw ? 'تعادل!' : (w.human && G.humans === 1 ? 'ربحت الجولة!' : 'الجولة لـ ' + w.name);
      if (G.over && w) msg = (w.human && G.humans === 1) ? 'فزت بالمباراة!' : 'بطل المباراة: ' + w.name;
      var col = bn.draw ? '#8a84a8' : w.pal.main;
      c.save(); c.translate(W / 2, H / 2); c.scale(s2, s2); c.rotate(-0.03);
      c.font = '700 54px Fredoka'; c.direction = 'rtl';
      var mw = Math.max(420, c.measureText(msg).width + 120);
      ribbon(c, 0, 0, mw, 100, col);
      text(c, msg, 0, 2, 54, '#fff', 'center', '#2a2240', 10);
      c.restore();
    }
  }

  function ribbon(c, x, y, w, h, col) {
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.25)';
    A.rr(c, x - w / 2 + 4, y - h / 2 + 8, w, h, 22); c.fill();
    // tails
    c.fillStyle = shade(col);
    [-1, 1].forEach(function (s) {
      c.beginPath();
      c.moveTo(x + s * (w / 2 - 20), y - h / 2 + 18); c.lineTo(x + s * (w / 2 + 40), y - h / 2 + 18);
      c.lineTo(x + s * (w / 2 + 22), y + 8); c.lineTo(x + s * (w / 2 + 40), y + h / 2 + 12); c.lineTo(x + s * (w / 2 - 20), y + h / 2 + 12);
      c.closePath(); c.fill(); c.lineWidth = 4; c.strokeStyle = '#2a2240'; c.stroke();
    });
    A.rr(c, x - w / 2, y - h / 2, w, h, 22); c.fillStyle = col; c.fill();
    c.lineWidth = 5; c.strokeStyle = '#2a2240'; c.stroke();
    A.rr(c, x - w / 2 + 12, y - h / 2 + 8, w - 24, 12, 6); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fill();
    c.restore();
  }
  function shade(hex) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) * 0.72, g = ((n >> 8) & 255) * 0.72, b = (n & 255) * 0.72;
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }

  window.TS_GAME = {
    W: W, H: H, create: create, setQuality: setQuality, text: text, ribbon: ribbon, easeBack: easeBack,
    CONTROLS: CONTROLS, BALL_R: BALL_R, BALL_SPEED: BALL_SPEED, HIT_R: HIT_R, angDiff: angDiff
  };
})();
