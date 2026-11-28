/* Paint Tanks — match / round engine and world rendering.
   window.TS_GAME.create(opts) -> game object with update(dt) and render(ctx). */
(function () {
  'use strict';
  var A = window.TS_ART, M = window.TS_MAZE, S = window.TS_SND;
  var W = 1280, H = 720, TOP = 70;
  var m = Math, HY = m.hypot, CS = m.cos, SN = m.sin, MN = m.min, MX = m.max, AB = m.abs, FL = m.floor, RD = m.random, PI = m.PI;
  var mulberry = A.seedRand;

  var TANK_SPEED = 175, TANK_ROT = 3.5, BALL_SPEED = 335, BALL_R = 7;
  var MAX_BALLS = 5, FIRE_CD = 0.13, BALL_LIFE = 7, BALL_BOUNCES = 6;
  var GIANT_R = 15, GIANT_SPEED = 245;
  var HIT_R = 17, TANK_R = 15, BARREL_R = 16, PAD_R = 22;
  var OWN_GRACE = 0.3; // s: a brand-new ball can't bounce/hit its own tank right at muzzle
  var LASER_AIM = { r: BALL_R, bounces: 3, len: 1000 }, GUIDE_AIM = { r: BALL_R, bounces: 1, len: 300 };
  var MOUSE = { x: W / 2, y: H / 2, active: false, down: false, pressed: false };

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
  var SELF_MSG = 'كرتك ارتدّت عليك!';

  /* ------------------------------------------------------------ helpers */
  function angDiff(a, b) { var d = b - a; while (d > PI) d -= PI * 2; while (d < -PI) d += PI * 2; return d; }

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
      tanks: [], balls: [], crates: [], barrels: [], pads: [], parts: [], pops: [], splats: [], dots: [],
      maze: null, theme: null, themeIdx: FL(RD() * A.THEMES.length),
      round: 0, state: 'ready', timer: 0, time: 0, playT: 0,
      slow: 0, spectate: 0, over: false, winner: null, coins: 0, onEnd: opts.onEnd || null,
      humans: 0, firstRound: true, banner: null, laserPts: [], lastSplatBy: null,
      guide: !!opts.guide, selfOut: false,
      chaosRicochet: !!opts.chaosRicochet,
      playerHp: opts.playerHp > 1 ? opts.playerHp : 1
    };
    var humanCount = 0;
    opts.players.forEach(function (p) { if (p.human) humanCount++; });
    G.humans = humanCount;
    opts.players.forEach(function (p, i) {
      var hp = p.human && !opts.demo ? G.playerHp : 1;
      var t = {
        id: i, slot: p.slot, pal: A.PAL[p.slot], name: p.name, human: !!p.human, hat: p.hat || 0, splat: p.splat || 0,
        ctrl: p.human ? (humanCount === 1 ? SOLO : CONTROLS[p.ctrl]) : null, ctrlIdx: p.ctrl || 0,
        bot: p.bot ? window.TS_BOT.create(p.bot) : null,
        score: 0, x: 0, y: 0, a: 0, bodyA: 0, alive: true, dead: 0, cool: 0, active: 0,
        hp: hp, maxHp: hp, invuln: 0, boingCd: 0,
        weapon: null, ammo: 0, laser: 0, speed: 0, shield: 0,
        sq: 0, recoil: 0, tread: 0, blinkT: 1 + RD() * 3, blink: 0, flash: 0, muzzle: 0, scale: 0, popHud: 0,
        paint: '#000', blobs: null, splats: 0, lastKill: -9, moving: 0, dispScore: 0
      };
      t.spring = Kit.art.spring(200, 13);
      G.tanks.push(t);
    });
    var fx = Kit.art.fx(160);
    G.fx = fx;

    G.newRound = newRound; G.update = update; G.render = render; G.skipSpectate = false;
    G.rebuildLayers = function () { buildLayers(G); };
    newRound();
    return G;

    /* -------------------------------------------------------- rounds */
    function newRound() {
      G.round++;
      G.themeIdx = (G.themeIdx + 1 + FL(RD() * (A.THEMES.length - 1))) % A.THEMES.length;
      G.theme = A.THEMES[G.themeIdx];
      var n = G.tanks.length, cols, rows;
      if (n <= 2) { cols = 9 + FL(RD() * 4); rows = 6 + FL(RD() * 2); }
      else { cols = 11 + FL(RD() * 4); rows = 6 + FL(RD() * 2); }
      var cs = MN(94, FL(1180 / cols), FL((H - TOP - 68) / rows));
      var ox = Math.round((W - cols * cs) / 2), oy = Math.round(TOP + 12 + (H - TOP - 44 - rows * cs) / 2);
      G.maze = M.generate(cols, rows, cs, ox, oy, 0.28 + RD() * 0.12);
      G.balls.length = 0; G.crates.length = 0; G.barrels.length = 0; G.pads.length = 0;
      G.pops.length = 0; G.splats.length = 0; G.dots.length = 0;
      G.crateT = 2.6 + RD() * 1.8;
      G.spectate = 0; G.skipSpectate = false; G.slow = 0; G.endT = 0; G.playT = 0; G.banner = null; G.selfOut = false;
      placeTanks();
      placeArenaToys();
      G.state = 'ready'; G.timer = 0.5;
      if (!G.demo) S.beep();
      buildLayers(G);
    }

    function placeArenaToys() {
      var m = G.maze, N = m.cols * m.rows, used = [];
      G.tanks.forEach(function (t) { used.push(M.cellOf(m, t.x, t.y)); });
      function pickFreeCell(minTankDist) {
        for (var tries = 0; tries < 40; tries++) {
          var c = FL(RD() * N);
          if (used.indexOf(c) >= 0) continue;
          var cc = M.cellCenter(m, c), ok = true;
          for (var i = 0; i < G.tanks.length; i++) {
            if (HY(G.tanks[i].x - cc.x, G.tanks[i].y - cc.y) < minTankDist) { ok = false; break; }
          }
          if (ok) { used.push(c); return cc; }
        }
        return null;
      }
      var barrelCount = G.tanks.length > 2 ? 3 : 2;
      for (var bi = 0; bi < barrelCount; bi++) {
        var bp = pickFreeCell(135);
        if (bp) G.barrels.push({ x: bp.x, y: bp.y, r: BARREL_R, alive: true });
      }
      for (var pi = 0; pi < 2; pi++) {
        var pp = pickFreeCell(105);
        if (pp) G.pads.push({ x: pp.x, y: pp.y, r: PAD_R, cd: 0 });
      }
    }

    function placeTanks() {
      var m = G.maze, N = m.cols * m.rows, best = null, bestScore = -1;
      for (var tries = 0; tries < 80; tries++) {
        var cells = [];
        for (var i = 0; i < G.tanks.length; i++) {
          var c; do { c = FL(RD() * N); } while (cells.indexOf(c) >= 0);
          cells.push(c);
        }
        var sc = 1e9;
        for (var a = 0; a < cells.length; a++) for (var b = a + 1; b < cells.length; b++) {
          var d = AB(cells[a] % m.cols - cells[b] % m.cols) + AB(((cells[a] / m.cols) | 0) - ((cells[b] / m.cols) | 0));
          if (d < sc) sc = d;
        }
        if (sc > bestScore) { bestScore = sc; best = cells; }
      }
      G.tanks.forEach(function (t, i) {
        var cc = M.cellCenter(m, best[i]);
        t.x = cc.x; t.y = cc.y;
        var cx = best[i] % m.cols, cy = (best[i] / m.cols) | 0, open = [];
        for (var d = 0; d < 4; d++) if (M.canPass(m, cx, cy, d)) open.push(d);
        var dd = open.length ? open[FL(RD() * open.length)] : 0;
        t.a = [0, PI / 2, PI, -PI / 2][dd];
        t.bodyA = t.a;
        t.alive = true; t.dead = 0; t.cool = 0.18; t.active = 0; t.weapon = null; t.ammo = 0;
        t.hp = t.human && !G.demo ? G.playerHp : 1; t.maxHp = t.hp; t.invuln = 0; t.boingCd = 0;
        t.laser = 0; t.speed = 0; t.shield = 0; t.sq = 0; t.recoil = 0; t.flash = 0; t.muzzle = 0; t.scale = 0; t.blobs = null;
        if (t.spring) { t.spring.sx = 1; t.spring.sy = 1; t.spring.v = 0; }
        if (t.bot) window.TS_BOT.reset(t.bot);
      });
    }

    function finishRound(winner) {
      if (G.state !== 'play') return;
      G.state = 'roundEnd';
      G.timer = G.demo ? 1.0 : 1.45;
      G.slow = 0; G.spectate = 0;
      G.winner = winner;
      if (winner) {
        winner.score++;
        winner.popHud = 1;
        if (winner.human && !G.demo) G.coins += 10;
        if (!G.demo) { S.roundWin(); setTimeout(function () { S.point(); }, 280); }
        burst(winner.x, winner.y, 30, [winner.pal.paint, '#fff', '#ffe14d'], 260, 5, 0.9);
      } else if (!G.demo) S.roundDraw();
      G.banner = { t: 0, winner: winner, draw: !winner };
      // solo: the banner pill says it now, so the ribbon does not half-cover the popup
      if (G.selfOut && G.humans === 1) G.pops = G.pops.filter(function (p) { return p.text !== SELF_MSG; });
      if (winner && winner.score >= G.target && !G.demo) {
        G.over = true;
        if (winner.human) G.coins += 30;
        G.timer = 1.6;
      }
    }

    /* -------------------------------------------------------- update */
    function update(dt) {
      G.time += dt;
      var sdt = dt;
      if (G.slow > 0) { G.slow -= dt; sdt = dt * 0.3; }
      if (G.state === 'play' && G.spectate > 0) sdt = dt * 2.2;

      Kit.art.shake.update(dt);

      if (G.state === 'ready') {
        G.timer -= dt;
        G.tanks.forEach(function (t) { t.scale = MN(1, t.scale + dt * 5.5); animTank(t, dt); });
        if (G.timer <= 0) {
          G.state = 'play';
          if (!G.demo) { S.go(); pop(W / 2, H / 2 + 10, 'انطلق!', '#ffffff', 72, 0.65, true); }
          G.tanks.forEach(function (t) { t.scale = 1; t.cool = 0; });
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
        if (RD() < 0.25 && !Kit.motion.reduced()) {
          var wt = G.matchWinner;
          burst(RD() * W, -10, 3, ['#ff4f63', '#ffc61f', '#3fd15d', '#3b8cff', '#a64dff', wt ? wt.pal.paint : '#fff'], 120, 6, 2.5, 220);
        }
      }
      fx.update(dt);
      Kit.art.pop.update(dt);
      Kit.art.flash.update(dt);
      stepPops(dt);
    }

    function animTank(t, dt) {
      t.sq = MX(0, t.sq - dt * 4);
      t.recoil = MX(0, t.recoil - dt * 7);
      t.flash = MX(0, t.flash - dt * 4);
      if (t.muzzle) t.muzzle = MX(0, t.muzzle - dt * 9);
      if (t.spring) t.spring.update(dt);
      t.blinkT -= dt;
      if (t.blinkT < 0) { t.blink = 0.12; t.blinkT = 2 + RD() * 3.5; }
      t.blink = MX(0, t.blink - dt);
      if (!t.alive) t.dead = MN(1, t.dead + dt * 3);
      t.dispScore += (t.score - t.dispScore) * MN(1, dt * 6);
    }

    function readInput(t) {
      var k = Kit.keys, c = t.ctrl;
      if (G.humans === 1) {
        var mx = (k.anyDown(c.right) ? 1 : 0) - (k.anyDown(c.left) ? 1 : 0);
        var my = (k.anyDown(c.back) ? 1 : 0) - (k.anyDown(c.fwd) ? 1 : 0);
        return {
          direct: true, mx: mx, my: my,
          fire: k.anyPressed(c.fire) || MOUSE.pressed || (MOUSE.down && t.cool <= 0)
        };
      }
      return {
        fwd: (k.anyDown(c.fwd) ? 1 : 0) - (k.anyDown(c.back) ? 1 : 0),
        turn: (k.anyDown(c.right) ? 1 : 0) - (k.anyDown(c.left) ? 1 : 0),
        fire: k.anyPressed(c.fire)
      };
    }

    function playStep(dt, realDt) {
      G.playT += realDt;
      var i;
      for (i = 0; i < G.tanks.length; i++) {
        var t = G.tanks[i];
        animTank(t, dt);
        if (!t.alive) continue;
        var inp = t.human && !t.bot ? readInput(t) : window.TS_BOT.think(t.bot, t, G, dt);
        t.cool -= dt;
        if (t.invuln > 0) t.invuln = MX(0, t.invuln - dt);
        if (t.boingCd > 0) t.boingCd = MX(0, t.boingCd - dt);
        if (t.laser > 0) t.laser -= dt;
        if (t.speed > 0) t.speed -= dt;
        if (t.shield > 0) t.shield -= dt;
        var spd = TANK_SPEED * (t.speed > 0 ? 1.55 : 1);
        var rot = TANK_ROT * (t.speed > 0 ? 1.25 : 1);
        var ox = t.x, oy = t.y;
        if (inp.direct) {
          var len = HY(inp.mx, inp.my);
          if (len > 0) {
            var ux = inp.mx / len, uy = inp.my / len;
            var dspd = spd * 1.12;
            t.x += ux * dspd * dt; t.y += uy * dspd * dt;
            var moveAng = Math.atan2(uy, ux);
            t.bodyA += angDiff(t.bodyA, moveAng) * MN(1, dt * 15);
            if (!MOUSE.active) t.a += angDiff(t.a, moveAng) * MN(1, dt * 15);
          }
          if (MOUSE.active) t.a = Math.atan2(MOUSE.y - t.y, MOUSE.x - t.x);
          resolveTank(t);
          var dmoved = HY(t.x - ox, t.y - oy);
          t.tread += dmoved;
          t.moving = dmoved / MX(dt, 1e-4);
        } else {
          t.a += inp.turn * rot * dt;
          t.bodyA = t.a;
          var mv = inp.fwd * spd * (inp.fwd < 0 ? 0.72 : 1) * dt;
          t.x += CS(t.a) * mv; t.y += SN(t.a) * mv;
          resolveTank(t);
          var moved = HY(t.x - ox, t.y - oy);
          t.tread += (inp.fwd >= 0 ? 1 : -1) * moved + AB(inp.turn) * dt * 30;
          t.moving = moved / MX(dt, 1e-4);
        }
        if (t.speed > 0 && t.moving > 25 && RD() < 0.5) {
          burst(t.x - CS(t.bodyA) * 20, t.y - SN(t.bodyA) * 20, 1, ['#ffe14d', '#fff'], 40, 4, 0.35);
        }
        if (inp.fire) fire(t);
      }
      MOUSE.pressed = false;
      // tank vs tank
      for (i = 0; i < G.tanks.length; i++) {
        var a = G.tanks[i]; if (!a.alive) continue;
        for (var j = i + 1; j < G.tanks.length; j++) {
          var b = G.tanks[j]; if (!b.alive) continue;
          var dx = b.x - a.x, dy = b.y - a.y, d = HY(dx, dy);
          if (d < 34 && d > 0.01) {
            var push = (34 - d) / 2; dx /= d; dy /= d;
            a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
            resolveTank(a); resolveTank(b);
          }
        }
      }
      stepBalls(dt, false);
      stepCrates(dt);
      stepPads(dt);

      // round end?
      var alive = 0, last = null, humansAlive = 0;
      G.tanks.forEach(function (t) { if (t.alive) { alive++; last = t; if (t.human) humansAlive++; } });
      if (alive <= 1) {
        // short wait (in game time, so the slow-motion splat plays out) to catch a trade
        G.endT += dt;
        if (G.endT > 0.35) finishRound(last);
      } else if (!G.demo && humansAlive === 0 && !G.ffing) {
        G.spectate += realDt;
        if (G.spectate > 9 || G.skipSpectate || (G.spectate > 0.6 && Kit.keys.anyPressed(['Space', 'Enter']))) fastForward();
      }
    }

    // All humans are out: play the rest of the round instantly (silently) so the
    // computer tanks still earn their point fairly. Skipping must not turn a lost
    // round into a draw (that would make 3-star wins free).
    function fastForward() {
      var wasOn = S.enabled; S.enabled = false; G.ffing = true;
      var step = 1 / 60, alive = 2, last = null;
      for (var n = 0; n < 60 * 25; n++) {
        playStep(step, 0);
        alive = 0; last = null;
        for (var i = 0; i < G.tanks.length; i++) if (G.tanks[i].alive) { alive++; last = G.tanks[i]; }
        if (alive <= 1) break;
      }
      // let paint already in the air land (a last-second double splat is a draw)
      for (var k = 0; k < 18 && alive === 1 && G.balls.length; k++) {
        playStep(step, 0);
        alive = 0; last = null;
        for (var j = 0; j < G.tanks.length; j++) if (G.tanks[j].alive) { alive++; last = G.tanks[j]; }
      }
      G.ffing = false; S.enabled = wasOn; G.slow = 0; G.spectate = 0;
      if (alive > 1) last = null;
      S.splat();
      finishRound(last);
    }

    // Smooth snag-free circular tank collision against walls & intact paint barrels.
    function resolveTank(t) {
      var m = G.maze;
      for (var it = 0; it < 3; it++) {
        var o = M.collideCircle(m, t.x, t.y, TANK_R);
        t.x = o.x; t.y = o.y;
        for (var bi = 0; bi < G.barrels.length; bi++) {
          var br = G.barrels[bi];
          if (!br.alive) continue;
          var dx = t.x - br.x, dy = t.y - br.y, d = HY(dx, dy), minD = TANK_R + br.r;
          if (d < minD && d > 0.001) {
            t.x = br.x + (dx / d) * minD;
            t.y = br.y + (dy / d) * minD;
          }
        }
      }
      var x1 = m.ox + TANK_R, x2 = m.ox + m.cols * m.cs - TANK_R, y1 = m.oy + TANK_R, y2 = m.oy + m.rows * m.cs - TANK_R;
      if (t.x < x1) t.x = x1; if (t.x > x2) t.x = x2; if (t.y < y1) t.y = y1; if (t.y > y2) t.y = y2;
    }

    function fire(t) {
      if (t.cool > 0) return;
      var lim = t.bot ? t.bot.p.maxBalls : MAX_BALLS;
      if (t.active >= lim && t.weapon !== 'giant') { if (t.human && !G.demo) S.nope(); t.cool = 0.12; return; }
      t.cool = FIRE_CD;
      t.recoil = 1; t.sq = 0.7; t.muzzle = 1;
      if (t.spring) t.spring.kick(8);
      var giant = false, angles = [0];
      if (t.weapon === 'triple') { angles = [-0.24, 0, 0.24]; }
      else if (t.weapon === 'giant') { giant = true; }
      if (t.weapon) { t.ammo--; if (t.ammo <= 0) t.weapon = null; }
      for (var i = 0; i < angles.length; i++) spawnBall(t, t.a + angles[i], giant);
      var mx = t.x + CS(t.a) * 28, my = t.y + SN(t.a) * 28;
      burst(mx, my, giant ? 10 : 5, [t.pal.paint, '#fff'], 120, giant ? 6 : 4, 0.25);
      var tier = Kit.art.quality.tier;
      fx.burst(mx, my, { n: tier === 0 ? 3 : 6, color: t.pal.paint, speed: 80, life: 0.32, size: tier === 0 ? 3 : 5, shape: 'dot' });
      if (!G.demo) { if (giant) S.giant(); else S.fire(t.human ? 1 : 0.85 + t.slot * 0.05); }
    }

    function spawnBall(t, ang, giant) {
      var r = giant ? GIANT_R : BALL_R, sp = giant ? GIANT_SPEED : BALL_SPEED;
      var b = {
        x: t.x, y: t.y, vx: CS(ang) * sp, vy: SN(ang) * sp, r: r, owner: t,
        life: BALL_LIFE, age: 0, bounces: 0, maxB: giant ? 4 : BALL_BOUNCES, safe: true, dist: 0,
        color: t.pal.paint, sq: 0, sqA: 0, giant: giant
      };
      // travel from the tank centre to the muzzle, bouncing if the barrel is in a wall
      moveBall(b, 26, true);
      t.active++;
      G.balls.push(b);
    }

    function moveBall(b, len, spawning) {
      var sp = HY(b.vx, b.vy); if (sp < 1) return;
      var steps = MX(1, Math.ceil(len / 3)), stepLen = len / steps;
      for (var s = 0; s < steps; s++) {
        b.x += b.vx / sp * stepLen; b.y += b.vy / sp * stepLen;
        b.dist += stepLen;
        var o = M.collideCircle(G.maze, b.x, b.y, b.r);
        if (o.hit) {
          b.x = o.x; b.y = o.y;
          var nl = HY(o.nx, o.ny);
          if (nl > 0) {
            var nx = o.nx / nl, ny = o.ny / nl, dot = b.vx * nx + b.vy * ny;
            if (dot < 0) {
              b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
              b.bounces++; b.sq = 1; b.sqA = Math.atan2(ny, nx);
              if (!spawning) {
                if (!G.demo) S.bounce(MN(b.bounces, 6));
                addDot(b.x - nx * b.r * 0.6, b.y - ny * b.r * 0.6, b.giant ? 7 : 3.2, b.color);
                if (b.giant) Kit.art.shake.add(0.12);
              }
            }
          }
        }
        if (b.safe && b.dist > 30 && HY(b.x - b.owner.x, b.y - b.owner.y) > HIT_R + b.r + 4) b.safe = false;
        if (!spawning && hitBarrels(b)) return true;
        if (!spawning && hitTanks(b)) return true;
        if (b.bounces > b.maxB) { b.life = 0; return true; }
      }
      return false;
    }

    function hitBarrels(b) {
      for (var i = 0; i < G.barrels.length; i++) {
        var br = G.barrels[i];
        if (!br.alive) continue;
        if (HY(b.x - br.x, b.y - br.y) < br.r + b.r) {
          b.life = 0;
          explodeBarrel(br, b.owner);
          return true;
        }
      }
      return false;
    }

    function explodeBarrel(br, killer) {
      if (!br.alive) return;
      br.alive = false;
      var paintCol = killer ? killer.pal.paint : '#ff6b00';
      addSplat(br.x, br.y, 74, paintCol, killer ? killer.splat : 0);
      burst(br.x, br.y, 34, ['#ff6b00', '#ffe14d', paintCol, '#fff'], 350, 7, 0.72);
      Kit.art.shake.add(G.demo ? 0.25 : 0.52);
      Kit.art.hitstop(G.demo ? 35 : 65);
      Kit.art.flash('#ff9d00', 80);
      if (!G.demo) { S.boom(); pop(br.x, br.y - 28, 'بوووم! 💥', '#ffe14d', 38, 1.0); }
      // Spawn 6 energetic paint droplets flying radially
      for (var k = 0; k < 6; k++) {
        var a = (k / 6) * PI * 2 + 0.25;
        G.balls.push({
          x: br.x + CS(a) * 14, y: br.y + SN(a) * 14,
          vx: CS(a) * 290, vy: SN(a) * 290,
          r: 6.5, owner: killer || G.tanks[0], life: 1.4, age: 0.4,
          bounces: 0, maxB: 2, safe: false, dist: 40, color: paintCol, sq: 0.5, sqA: a, giant: false
        });
        if (killer) killer.active++;
      }
      // Chain-detonate adjacent barrels & blast tanks in blast radius
      for (var j = 0; j < G.barrels.length; j++) {
        var ob = G.barrels[j];
        if (ob.alive && HY(ob.x - br.x, ob.y - br.y) < 120) explodeBarrel(ob, killer);
      }
      for (var ti = 0; ti < G.tanks.length; ti++) {
        var t = G.tanks[ti];
        if (!t.alive) continue;
        var dx = t.x - br.x, dy = t.y - br.y, d = HY(dx, dy);
        if (d < 105) {
          if (t === killer && !G.chaosRicochet) {
            var nx = dx / (d || 1), ny = dy / (d || 1);
            t.x += nx * 16; t.y += ny * 16; resolveTank(t);
            t.sq = 0.6; t.flash = 0.35;
          } else {
            damageTank(t, killer || t, null);
          }
        }
      }
    }

    function damageTank(t, killer, b) {
      if (!t.alive || t.invuln > 0) return;
      if (t.hp > 1) {
        t.hp--;
        t.invuln = 0.85;
        t.flash = 0.75;
        t.sq = 0.7;
        if (t.spring) t.spring.kick(9);
        burst(t.x, t.y, 20, ['#ffe14d', '#7dd3fc', '#fff'], 240, 5.5, 0.55);
        Kit.art.shake.add(0.28);
        Kit.art.hitstop(45);
        if (!G.demo) { S.shield(); pop(t.x, t.y - 34, 'درع الطلاء! 🛡️', '#ffe14d', 30, 1.1); }
        return;
      }
      splatTank(t, killer, b);
    }

    function hitTanks(b) {
      for (var i = 0; i < G.tanks.length; i++) {
        var t = G.tanks[i];
        if (!t.alive) continue;
        if (t === b.owner && (b.safe || b.age < OWN_GRACE)) continue;
        var dx = b.x - t.x, dy = b.y - t.y, d = HY(dx, dy);
        // Safe playful bounce off your own tank in Solo/Campaign (zero frustrating self-splat!)
        if (t === b.owner && !G.chaosRicochet) {
          if (d < HIT_R + b.r + 2) {
            var bnx = dx / (d || 1), bny = dy / (d || 1), bdot = b.vx * bnx + b.vy * bny;
            if (bdot < 0) {
              b.vx -= 2 * bdot * bnx; b.vy -= 2 * bdot * bny;
              b.bounces++; b.sq = 1; b.sqA = Math.atan2(bny, bnx);
            }
            b.x = t.x + bnx * (HIT_R + b.r + 4); b.y = t.y + bny * (HIT_R + b.r + 4);
            t.x -= bnx * 4; t.y -= bny * 4; resolveTank(t);
            t.sq = 0.55; t.flash = 0.28;
            if (t.spring) t.spring.kick(5);
            burst(t.x + bnx * 16, t.y + bny * 16, 7, ['#ffe14d', '#fff', t.pal.light], 120, 4, 0.3);
            if (!G.demo) {
              S.boing();
              if (t.boingCd <= 0) { t.boingCd = 0.9; pop(t.x, t.y - 30, 'بوينج!', '#ffe14d', 28, 0.75); }
            }
          }
          continue;
        }
        if (t.shield > 0 && d < 28 + b.r) {
          // bounce off the shield bubble
          var nx = dx / (d || 1), ny = dy / (d || 1), dot = b.vx * nx + b.vy * ny;
          if (dot < 0) {
            b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; b.bounces++; b.safe = false; b.sq = 1; b.sqA = Math.atan2(ny, nx);
            t.flash = 0.4;
            if (!G.demo) S.shield();
            burst(t.x + nx * 28, t.y + ny * 28, 6, ['#bff0ff', '#fff'], 120, 4, 0.3);
          }
          b.x = t.x + nx * (29 + b.r); b.y = t.y + ny * (29 + b.r);
          continue;
        }
        if (d < HIT_R + b.r) {
          damageTank(t, b.owner, b);
          b.life = 0;
          return true;
        }
      }
      return false;
    }

    function stepPads(dt) {
      for (var i = 0; i < G.pads.length; i++) {
        var pad = G.pads[i];
        if (pad.cd > 0) { pad.cd = MX(0, pad.cd - dt); continue; }
        for (var j = 0; j < G.tanks.length; j++) {
          var t = G.tanks[j];
          if (!t.alive || HY(t.x - pad.x, t.y - pad.y) > pad.r + 10) continue;
          pad.cd = 3.5;
          t.speed = MX(t.speed, 2.8);
          t.sq = 0.5; t.flash = 0.4;
          burst(pad.x, pad.y, 14, ['#ffe14d', '#ff9d00', '#fff'], 180, 4.5, 0.4);
          if (!G.demo) { S.speed(); pop(pad.x, pad.y - 26, 'انطلاق! ⚡', '#ffe14d', 28, 0.85); }
          break;
        }
      }
    }

    function stepBalls(dt, frozen) {
      for (var i = G.balls.length - 1; i >= 0; i--) {
        var b = G.balls[i];
        if (frozen) { b.life = MN(b.life, 0.25); }
        b.life -= dt; b.age += dt;
        b.sq = MX(0, b.sq - dt * 7);
        if (b.life > 0 && !frozen) moveBall(b, HY(b.vx, b.vy) * dt, false);
        if (b.life <= 0) {
          G.balls.splice(i, 1);
          b.owner.active = MX(0, b.owner.active - 1);
          burst(b.x, b.y, b.giant ? 12 : 6, [b.color, '#fff'], 90, b.giant ? 6 : 3.5, 0.3);
          if (!G.demo && !frozen) S.pop();
        }
      }
    }

    function splatTank(t, killer, b) {
      t.alive = false; t.dead = 0; t.paint = killer.pal.paint; t.shield = 0;
      var rnd = RD, blobs = [];
      for (var k = 0; k < 7; k++) blobs.push((rnd() - 0.5) * 30, (rnd() - 0.5) * 26, 4 + rnd() * 6);
      t.blobs = blobs;
      addSplat(t.x, t.y, b && b.giant ? 62 : 46, killer.pal.paint, killer.splat);
      burst(t.x, t.y, 34, [killer.pal.paint, killer.pal.light, t.pal.main, '#fff'], 340, 7, 0.75);
      Kit.art.shake.add(G.demo ? 0.22 : 0.45);
      Kit.art.hitstop(G.demo ? 40 : 80);
      Kit.art.flash(killer.pal.paint, 90);
      if (!G.demo) S.splat();
      var self = killer === t;
      if (G.demo) { /* quiet title-screen demo */ }
      else if (self) {
        // Beginners often think the bot got them: say what really happened.
        if (t.human) { pop(MX(160, MN(W - 160, t.x)), t.y - 34, SELF_MSG, '#ffffff', 34, 2); G.selfOut = true; }
        else pop(t.x, t.y - 34, 'أوبس!', '#ffffff', 40, 1.2);
        if (!G.demo) S.oops();
      } else {
        killer.splats++;
        var word = SPLAT_WORDS[FL(RD() * SPLAT_WORDS.length)];
        if (G.time - killer.lastKill < 3) word = 'ضربة مزدوجة!';
        killer.lastKill = G.time;
        pop(t.x, t.y - 34, word, killer.pal.light, 40, 1.2);
        if (killer.human && !G.demo) G.coins += 5;
      }
      // A splatted tank's paint balls burst in mid-air: whoever splats first wins,
      // so near-simultaneous shots rarely end in a draw.
      for (var q = 0; q < G.balls.length; q++) {
        var ob = G.balls[q];
        if (ob.owner === t && ob !== b && ob.life > 0) { ob.life = 0; addDot(ob.x, ob.y, ob.giant ? 8 : 4.5, ob.color); }
      }
      var alive = 0; G.tanks.forEach(function (x) { if (x.alive) alive++; });
      if (alive <= 1 && !G.demo) G.slow = 0.55;
    }

    /* -------------------------------------------------------- crates */
    function stepCrates(dt) {
      var m = G.maze, maxC = G.tanks.length > 2 ? 3 : 2;
      G.crateT -= dt;
      if (G.crateT <= 0) {
        G.crateT = 4.5 + RD() * 3.5;
        if (G.crates.length < maxC) {
          for (var tries = 0; tries < 30; tries++) {
            var c = FL(RD() * m.cols * m.rows), cc = M.cellCenter(m, c), ok = true;
            G.tanks.forEach(function (t) { if (t.alive && HY(t.x - cc.x, t.y - cc.y) < 150) ok = false; });
            G.crates.forEach(function (k) { if (HY(k.x - cc.x, k.y - cc.y) < 10) ok = false; });
            if (ok) {
              var pw = A.POWERS[FL(RD() * A.POWERS.length)];
              G.crates.push({ x: cc.x, y: cc.y, pw: pw, t: RD() * 3, pop: 0 });
              if (!G.demo) S.crate();
              break;
            }
          }
        }
      }
      for (var i = G.crates.length - 1; i >= 0; i--) {
        var k = G.crates[i];
        k.t += dt; k.pop = MN(1, k.pop + dt * 4);
        for (var j = 0; j < G.tanks.length; j++) {
          var t = G.tanks[j];
          if (!t.alive || HY(t.x - k.x, t.y - k.y) > 32) continue;
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
      if (Kit.motion.reduced()) n = Math.ceil(n / 3);
      var tier = Kit.art.quality.tier;
      var vn = tier === 0 ? MN(6, n) : MN(tier === 1 ? 12 : 16, n);
      if (vn > 0) fx.burst(x, y, {
        n: vn, color: colors[0], speed: MN(speed, 260), life: MN(life, 0.7),
        size: tier === 0 ? MN(size, 4) : MN(size, 6.5),
        shape: n >= 24 || grav ? 'confetti' : 'dot'
      });
      if (tier > 0 && n >= 24) fx.burst(x, y, { n: tier === 2 ? 7 : 4, color: colors[1] || '#fff', speed: speed * 0.45, life: 0.6, size: 6, shape: 'star' });
    }
    function pop(x, y, text, color, size, life, center) {
      if (G.pops.length > 12) G.pops.shift();
      G.pops.push({ x: x, y: y, text: text, color: color, size: size, life: life, max: life, center: !!center });
    }
    function stepPops(dt) {
      for (var i = G.pops.length - 1; i >= 0; i--) {
        var p = G.pops[i];
        p.life -= dt; if (!p.center) p.y = MX(TOP + 30, p.y - dt * 30); // stays below the HUD
        if (p.life <= 0) G.pops.splice(i, 1);
      }
    }

    function stampCap() {
      var tier = Kit.art.quality.tier;
      return tier <= 0 ? 48 : tier === 1 ? 110 : 200;
    }
    function addSplat(x, y, s, color, style) {
      var seed = (RD() * 1e9) | 0;
      var tier = Kit.art.quality.tier;
      if (tier === 0) s *= 0.62;
      var rec = { x: x, y: y, s: s, color: color, style: style, seed: seed };
      if (G.splats.length + G.dots.length >= stampCap()) return;
      G.splats.push(rec);
      drawSplatRec(rec);
    }
    function addDot(x, y, r, color) {
      var tier = Kit.art.quality.tier;
      if (tier === 0) r *= 0.55;
      if (G.splats.length + G.dots.length >= stampCap()) return;
      if (tier === 0 && (G.dots.length & 1)) return;
      var rec = { x: x, y: y, r: r, color: color };
      G.dots.push(rec); drawDotRec(rec);
    }
  }

  function paintCtx() { var c = layers.paint.getContext('2d'); c.setTransform(layers.k, 0, 0, layers.k, 0, 0); return c; }
  var curGame = null;
  function clipMaze(c, m) { c.beginPath(); c.rect(m.ox - 4, m.oy - 4, m.cols * m.cs + 8, m.rows * m.cs + 8); c.clip(); }
  function drawSplatRec(rec) {
    if (!layers.paint || !curGame) return;
    var c = paintCtx(); c.save(); clipMaze(c, curGame.maze);
    var sp = A.splatSprite(rec.color, rec.style, rec.seed % 3);
    var sc = rec.s / 46;
    if (sp && sp.canvas) c.drawImage(sp.canvas, rec.x - 48 * sc, rec.y - 48 * sc, 96 * sc, 96 * sc);
    else A.drawSplat(c, rec.x, rec.y, rec.s, rec.color, rec.style, mulberry(rec.seed));
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
    if (!layers.paint) layers.paint = mkLayer();
    var tier = Kit.art.quality.tier;
    var key = G.maze.seed + ':' + G.themeIdx + ':' + G.maze.cols + 'x' + G.maze.rows + ':' + G.maze.cs + ':' + tier;
    layers.floor = Kit.art.bake('ts-floor:' + key, W, H, function (c) {
      A.drawFloor(c, G.maze, G.theme, mulberry(G.maze.seed));
    });
    layers.walls = Kit.art.bake('ts-walls:' + key, W, H, function (c) {
      A.drawWalls(c, G.maze, G.theme, true);
      A.drawWalls(c, G.maze, G.theme, false);
    });
    sizeLayer(layers.paint, k);
    G.splats.forEach(drawSplatRec);
    G.dots.forEach(drawDotRec);
  }

  function setQuality(k, G) {
    k = MX(0.5, MN(2, k));
    if (AB(k - layers.k) < 0.01 && layers.floor) return;
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
    Kit.art.shake.apply(c);
    if (layers.floor && layers.floor.canvas) c.drawImage(layers.floor.canvas, 0, 0, W, H);
    if (layers.paint) c.drawImage(layers.paint, 0, 0, W, H);
    if (layers.walls && layers.walls.canvas) c.drawImage(layers.walls.canvas, 0, 0, W, H);
    var i, t;
    // boost pads on floor (under tanks & barrels)
    for (i = 0; i < G.pads.length; i++) A.drawPad(c, G.pads[i], G.time);
    // explosive paint barrels
    for (i = 0; i < G.barrels.length; i++) if (G.barrels[i].alive) A.drawBarrel(c, G.barrels[i], G.time);
    // crates
    for (i = 0; i < G.crates.length; i++) { var k = G.crates[i]; A.drawCrate(c, k.x, k.y, k.pw, k.t, easeBack(k.pop)); }
    // laser aim lines (and the beginner guide, which the laser replaces)
    var mk = false, mx = 0, my = 0, mux = 0, muy = 0; // point-blank bounce marker, drawn over the tank
    for (i = 0; i < G.tanks.length; i++) {
      t = G.tanks[i];
      if (!t.alive || G.state !== 'play') continue;
      var laser = t.laser > 0;
      // Campaign stages 1-2 show a faint one-bounce guide, so beginners see a wall shot come back.
      if (!laser && !(G.guide && t.human)) continue;
      M.trace(G.maze, t.x, t.y, t.a, laser ? LASER_AIM : GUIDE_AIM, G.laserPts);
      var p = G.laserPts;
      c.save();
      c.globalAlpha = !laser ? 0.5 : t.laser < 2 ? (SN(G.time * 14) > 0 ? 0.8 : 0.35) : 0.85;
      c.lineWidth = laser ? 4 : 3; c.lineCap = 'round'; c.strokeStyle = t.pal.paint;
      c.setLineDash([2, 10]); c.lineDashOffset = Kit.motion.reduced() ? 0 : -G.time * 40;
      c.beginPath(); c.moveTo(p[0], p[1]);
      var ox = 0, oy = 0;
      for (var q = 2; q < p.length; q += 2) {
        if (q > 2 && !laser) { // guide: a shot that comes straight back is drawn beside the way out
          var ax = p[q - 2] - p[q - 4], ay = p[q - 1] - p[q - 3], al = HY(ax, ay), bx = p[q] - p[q - 2], by = p[q + 1] - p[q - 1];
          if (ax * bx + ay * by < -0.9 * al * HY(bx, by)) {
            ox = -ay / al * 10; oy = ax / al * 10; c.lineTo(p[q - 2] + ox, p[q - 1] + oy);
            // nose at the wall: the bounce hides under the tank, so mark the wall with an arrow back
            if (al < 34) { mk = true; mux = ax / al; muy = ay / al; mx = p[q - 2] + mux * BALL_R; my = p[q - 1] + muy * BALL_R; }
          }
        }
        c.lineTo(p[q] + ox, p[q + 1] + oy);
      }
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
          x: t.x, y: t.y, a: t.a, bodyA: t.bodyA, pal: t.pal, hat: t.hat, sq: t.sq, tread: t.tread, t: G.time,
          blink: t.blink > 0 && !Kit.motion.reduced(), dead: t.alive ? 0 : t.dead, paint: t.paint, blobs: t.blobs,
          shield: t.alive ? t.shield : 0, hp: t.alive ? t.hp : 0, invuln: t.alive ? t.invuln : 0,
          flash: t.flash, muzzle: t.muzzle, recoil: MX(t.recoil, t.spring ? MN(1, AB(1 - t.spring.sy) * 3.2) : 0), scale: easeBack(t.scale)
        });
      }
    }
    if (mk) A.drawBounce(c, mx, my, mux, muy);
    // Subtle barrel aim dots & Round-1 P1 ownership halo + "أنت" tag (no setLineDash)
    if (!G.demo && G.state === 'play') {
      var rm = Kit.motion.reduced();
      for (i = 0; i < G.tanks.length; i++) {
        t = G.tanks[i];
        if (!t.alive || !t.human || t.laser > 0 || G.guide) continue;
        for (var ad = 0; ad < 3; ad++) {
          var dist = 34 + ad * 10, dr = 2.9 - ad * 0.45;
          var ax2 = t.x + CS(t.a) * dist, ay2 = t.y + SN(t.a) * dist;
          c.globalAlpha = 0.72 - ad * 0.14;
          A.circle(c, ax2, ay2, dr + 1.3); c.fillStyle = '#1b1640'; c.fill();
          A.circle(c, ax2, ay2, dr); c.fillStyle = t.pal.light; c.fill();
        }
      }
      c.globalAlpha = 1;
      var p1 = G.tanks[0];
      if (G.firstRound && G.playT < 3.6 && p1 && p1.human && p1.alive) {
        var ha = MN(1, (3.6 - G.playT) / 0.6), hr = 27 + (rm ? 0 : SN(G.time * 7) * 3.5);
        var flip = p1.y < G.maze.oy + 58, ty = flip ? p1.y + 42 : p1.y - 44 + (rm ? 0 : SN(G.time * 6) * 2.5);
        c.save(); c.globalAlpha = ha;
        A.circle(c, p1.x, p1.y, hr); c.lineWidth = 6.5; c.strokeStyle = '#fff'; c.stroke();
        A.circle(c, p1.x, p1.y, hr); c.lineWidth = 3.5; c.strokeStyle = p1.pal.main; c.stroke();
        A.rr(c, p1.x - 27, ty - 13, 54, 25, 12.5); c.fillStyle = p1.pal.dark; c.fill();
        c.lineWidth = 2.5; c.strokeStyle = '#fff'; c.stroke();
        c.beginPath();
        if (flip) { c.moveTo(p1.x - 6, ty - 12); c.lineTo(p1.x + 6, ty - 12); c.lineTo(p1.x, ty - 19); }
        else { c.moveTo(p1.x - 6, ty + 11); c.lineTo(p1.x + 6, ty + 11); c.lineTo(p1.x, ty + 18); }
        c.closePath(); c.fillStyle = '#fff'; c.fill();
        text(c, 'أنت', p1.x, ty, 16, '#fff', 'center');
        c.restore();
      }
    }
    // Crisp 1P mouse aim crosshair
    if (!G.demo && G.state === 'play' && G.humans === 1 && MOUSE.active && G.tanks[0] && G.tanks[0].alive) {
      c.save();
      c.translate(MOUSE.x, MOUSE.y);
      c.strokeStyle = '#1b1640'; c.lineWidth = 4;
      A.circle(c, 0, 0, 10); c.stroke();
      c.strokeStyle = G.tanks[0].pal.light; c.lineWidth = 2.2;
      A.circle(c, 0, 0, 10); c.stroke();
      c.beginPath(); c.moveTo(-14, 0); c.lineTo(-6, 0); c.moveTo(6, 0); c.lineTo(14, 0);
      c.moveTo(0, -14); c.lineTo(0, -6); c.moveTo(0, 6); c.lineTo(0, 14); c.stroke();
      c.restore();
    }
    // balls
    for (i = 0; i < G.balls.length; i++) {
      var b = G.balls[i], sp = HY(b.vx, b.vy);
      c.globalAlpha = 0.25; A.circle(c, b.x - b.vx / sp * b.r * 1.6, b.y - b.vy / sp * b.r * 1.6, b.r * 0.75); c.fillStyle = b.color; c.fill();
      c.globalAlpha = 0.12; A.circle(c, b.x - b.vx / sp * b.r * 3, b.y - b.vy / sp * b.r * 3, b.r * 0.55); c.fill();
      c.globalAlpha = b.life < 1 ? (SN(G.time * 14) > 0 ? 1 : 0.55) : 1;
      A.drawBall(c, b.x, b.y, b.r, b.color, b.sq, b.sqA);
      c.globalAlpha = 1;
    }
    if (G.fx) G.fx.draw(c);
    c.globalAlpha = 1;
    // name tags during the countdown
    if (G.state === 'ready' && !G.demo) {
      for (i = 0; i < G.tanks.length; i++) {
        t = G.tanks[i];
        var bob = Kit.motion.reduced() ? 0 : SN(G.time * 6 + i) * 3;
        text(c, t.name, t.x, t.y - 44 + bob, 22, '#fff', 'center', t.pal.dark, 6);
        c.fillStyle = t.pal.dark;
        c.beginPath(); c.moveTo(t.x - 7, t.y - 31 + bob); c.lineTo(t.x + 7, t.y - 31 + bob); c.lineTo(t.x, t.y - 23 + bob); c.closePath(); c.fill();
        if (t.human && G.firstRound) {
          var hint = G.humans === 1 ? 'WASD / ↑←↓→ + 🖱️' : KEY_HINT[t.ctrlIdx];
          c.font = '700 17px Fredoka'; c.direction = 'ltr';
          var tw = c.measureText(hint).width + 20;
          var hx = MX(G.maze.ox + tw / 2, MN(G.maze.ox + G.maze.cols * G.maze.cs - tw / 2, t.x));
          // below the tank, or above the name tag when the tank is on the bottom row
          var hy = t.y + 58 > G.maze.oy + G.maze.rows * G.maze.cs ? t.y - 94 + bob : t.y + 30;
          A.rr(c, hx - tw / 2, hy, tw, 28, 14); c.fillStyle = 'rgba(42,34,64,0.85)'; c.fill();
          c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(hint, hx, hy + 15);
        }
      }
    }
    // popups
    for (i = 0; i < G.pops.length; i++) {
      var pp = G.pops[i], f = pp.life / pp.max, age = pp.max - pp.life;
      var s = age < 0.15 ? 0.5 + age / 0.15 * 0.7 : age < 0.3 ? 1.2 - (age - 0.15) / 0.15 * 0.2 : 1;
      c.save(); c.globalAlpha = MN(1, f * 3);
      c.translate(pp.x, pp.y); c.scale(s, s);
      text(c, pp.text, 0, 0, pp.size, pp.color, 'center', '#1b1640', pp.size * 0.22);
      c.restore();
    }
    c.restore();

    if (!G.demo && G.state !== 'matchEnd') drawHud(c, G);
    Kit.art.pop.draw(c);
    Kit.art.flash.draw(c, W, H);
  }

  function easeBack(t) { if (t >= 1) return 1; if (t <= 0) return 0; var s = 1.7; t = t - 1; return t * t * ((s + 1) * t + s) + 1; }

  /* ------------------------------------------------------------ HUD */
  function drawHud(c, G) {
    var n = G.tanks.length, gap = 12, rm = Kit.motion.reduced();
    var bw = MN(250, (W - 170 - (n - 1) * gap) / n), bh = 54;
    var total = n * bw + (n - 1) * gap, x0 = W / 2 + total / 2;
    for (var i = 0; i < n; i++) {
      var t = G.tanks[i];
      var x = x0 - (i + 1) * bw - i * gap, y = 8;
      var hl = G.state === 'roundEnd' && G.winner === t ? 1 + (rm ? 0.03 : SN(G.time * 12) * 0.04) : 1; // reduced: still, a bit bigger
      c.save();
      c.translate(x + bw / 2, y + bh / 2); c.scale(hl, hl); c.translate(-(x + bw / 2), -(y + bh / 2));
      A.rr(c, x, y + 5, bw, bh, 18); c.fillStyle = 'rgba(27,22,64,0.28)'; c.fill();
      A.rr(c, x, y, bw, bh, 18); c.fillStyle = t.alive || G.state === 'ready' ? '#fff7ea' : '#e4e0ee'; c.fill();
      c.lineWidth = 4; c.strokeStyle = t.pal.dark; c.stroke();
      if (Kit.art.gloss) Kit.art.gloss(c, x + 10, y + 3, bw - 20, 16);
      if (t.popHud) {
        Kit.art.pop('+1', x + bw - 78, y + 6, { color: t.pal.main, size: 28 });
        t.popHud = 0;
      }
      // mini tank on the right
      c.save(); c.beginPath(); A.rr(c, x, y, bw, bh, 18); c.clip();
      A.rr(c, x + bw - 58, y, 58, bh, 0); c.fillStyle = t.pal.light; c.fill();
      c.restore();
      A.drawTank(c, { x: x + bw - 30, y: y + bh / 2 + 2, a: -PI / 2, pal: t.pal, hat: 0, t: G.time, scale: 0.62,
        dead: t.alive || G.state === 'ready' ? 0 : 1, paint: t.paint, blobs: t.blobs });
      // name
      c.font = '700 20px Fredoka';
      var name = t.name;
      text(c, name, x + bw - 64, y + 17, 20, '#1b1640', 'right');
      // pips
      var pr = G.target > 5 ? 6 : 7.5, ps = pr * 2 + 5;
      var px = x + bw - 64 - pr;
      for (var p = 0; p < G.target; p++) {
        var cx = px - p * ps, cy = y + 39;
        A.circle(c, cx, cy, pr);
        var filled = p < t.score;
        var popIn = filled && p === t.score - 1 && G.state === 'roundEnd' && G.winner === t ? MN(1, G.banner.t * 3) : 1;
        c.fillStyle = '#ece8f5'; c.fill();
        if (filled) { A.circle(c, cx, cy, pr * easeBack(popIn)); c.fillStyle = t.pal.main; c.fill(); }
        A.circle(c, cx, cy, pr); c.lineWidth = 2; c.strokeStyle = t.pal.dark; c.stroke();
      }
      // power icon or 2-HP paint-shield badge at the left end
      var ic = t.weapon || (t.laser > 0 ? 'laser' : t.shield > 0 ? 'shield' : t.speed > 0 ? 'speed' : null);
      if (ic && t.alive) A.drawPowerIcon(c, ic, x + 20, y + bh / 2, 0.85, G.time);
      else if (t.alive && t.hp > 1) text(c, '🛡️', x + 22, y + bh / 2 + 1, 22, '#ffe14d', 'center');
      c.restore();
    }

    // round banner / states
    if (G.state === 'ready') {
      var bt = 1 - MX(0, G.timer * 2);
      var sc = easeBack(MN(1, bt * 2.5 + 0.35));
      c.save(); c.translate(W / 2, H / 2); c.scale(sc, sc);
      ribbon(c, 0, 0, 420, 96, G.theme.wall);
      text(c, 'الجولة ' + G.round, 0, -8, 50, '#fff', 'center', '#1b1640', 9);
      text(c, G.theme.name, 0, 34, 22, '#fff', 'center', '#1b1640', 5);
      c.restore();
    }
    if (G.state === 'play' && G.spectate > 0) {
      A.rr(c, W / 2 - 250, H - 62, 500, 46, 23); c.fillStyle = 'rgba(42,34,64,0.8)'; c.fill();
      text(c, 'الكمبيوتر يكمل الجولة... اضغط مسافة للتخطي', W / 2, H - 39, 22, '#fff', 'center');
    }
    if ((G.state === 'roundEnd') && G.banner) {
      var bn = G.banner, s2 = easeBack(MN(1, bn.t * 3.5));
      var w = bn.winner;
      var msg = bn.draw ? 'تعادل!' : (w.human && G.humans === 1 ? 'ربحت الجولة!' : 'الجولة لـ ' + w.name);
      if (G.over && w) msg = (w.human && G.humans === 1) ? 'فزت بالمباراة!' : 'بطل المباراة: ' + w.name;
      var col = bn.draw ? '#8a84a8' : w.pal.main;
      c.save(); c.translate(W / 2, H / 2); c.scale(s2, s2); c.rotate(-0.03);
      c.font = '700 54px Fredoka'; c.direction = 'rtl';
      var mw = MX(420, c.measureText(msg).width + 120);
      ribbon(c, 0, 0, mw, 100, col);
      text(c, msg, 0, 2, 54, '#fff', 'center', '#1b1640', 10);
      if (G.selfOut && G.humans === 1) {
        A.rr(c, -210, 72, 420, 42, 21); c.fillStyle = 'rgba(42,34,64,0.85)'; c.fill();
        text(c, 'انتبه: كراتك ترتدّ وتلطّخك!', 0, 93, 24, '#fff', 'center');
      }
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
      c.closePath(); c.fill(); c.lineWidth = 4; c.strokeStyle = '#1b1640'; c.stroke();
    });
    A.rr(c, x - w / 2, y - h / 2, w, h, 22); c.fillStyle = col; c.fill();
    c.lineWidth = 5; c.strokeStyle = '#1b1640'; c.stroke();
    A.rr(c, x - w / 2 + 12, y - h / 2 + 8, w - 24, 12, 6); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fill();
    c.restore();
  }
  function shade(hex) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) * 0.72, g = ((n >> 8) & 255) * 0.72, b = (n & 255) * 0.72;
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }

  window.TS_GAME = {
    W: W, H: H, create: create, setQuality: setQuality, text: text, ribbon: ribbon, easeBack: easeBack,
    CONTROLS: CONTROLS, BALL_R: BALL_R, BALL_SPEED: BALL_SPEED, HIT_R: HIT_R, angDiff: angDiff, mouse: MOUSE
  };
})();
