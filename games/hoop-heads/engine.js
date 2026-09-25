/* Hoop Heads - match simulation: players, ball, hoops, rules and CPU brains.
   Pure game logic; drawing lives in render.js and menus in ui.js. */
(function () {
  'use strict';
  var HH = window.HH;
  var S = HH.sfx;

  var W = 1280, H = 720, FLOOR = 632, BALL_R = 17;
  var G_BALL = 1450, G_PL = 2150;
  var RIM_Y = 318, RIM_HALF = 44, RIM_PT = 6, THREE = 410;
  var CHARGE_SPEED = 1.15, SWEET = 0.78;
  HH.W = W; HH.H = H; HH.FLOOR = FLOOR; HH.BALL_R = BALL_R; HH.RIM_Y = RIM_Y; HH.THREE = THREE; HH.SWEET = SWEET;

  function sgn(v) { return v < 0 ? -1 : 1; }
  function randn() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.732; }

  /* --------------------------------------------------------------- hoops */
  function makeHoop(side) {
    var s = side ? 1 : -1, cx = side ? 1148 : 132;
    var bIn = cx + s * 58;
    return {
      side: side, s: s, x: cx, y: RIM_Y,
      front: cx - s * RIM_HALF, back: cx + s * RIM_HALF,
      bx0: side ? bIn : bIn - 12, bx1: side ? bIn + 12 : bIn, by0: 192, by1: 350,
      net: 0, netT: 0, bend: 0, glow: 0, sway: 0
    };
  }

  /* ------------------------------------------------------------- players */
  function makePlayer(m, idx, ch, ctrl, lv) {
    var p = {
      idx: idx, ch: ch, ctrl: ctrl,
      x: idx ? 880 : 400, y: FLOOR, vx: 0, vy: 0, onGround: true, facing: idx ? -1 : 1,
      speed: 300 + ch.spd * 38, jumpV: 690 + ch.jmp * 55, zone: 0.05 + ch.sht * 0.018, headR: ch.headR,
      charging: false, charge: 0, chargeDir: 1, chargeTick: 0,
      coyote: 0, jumpBuf: 0, jumpCut: false,
      stun: 0, protect: 0, grabCd: 0, stealCd: 0, bonkCd: 0,
      sqx: 1, sqy: 1, walkT: 0, drib: 0, mood: 'normal', moodT: 0, blinkT: 2 + Math.random() * 2, blink: false,
      dunk: null, hang: 0, hangX: 0, hangY: 0,
      streak: ch.fireStart ? 1 : 0, fire: false, fireT: 0, score: 0,
      st: { pts: 0, shots: 0, made: 0, threes: 0, dunks: 0, blocks: 0, steals: 0 },
      inp: { l: false, r: false, jump: false, jumpP: false, shoot: false, shootP: false, shootR: false },
      prevShoot: false, prevJump: false,
      ai: null, t: Math.random() * 10
    };
    if (ctrl === 'cpu') p.ai = { lv: lv, p: HH.aiParams(lv), think: 0, tx: p.x, plan: null, hold: 0, jumpHold: 0, jumpAt: -1, rush: 0, blockRolled: false, stuck: 0, tp: SWEET };
    return p;
  }
  function headY(p) { return p.y - 84 - p.headR * 0.78; }
  HH.headY = headY;
  function attackHoop(m, p) { return m.hoops[p.idx === 0 ? 1 : 0]; }
  function defHoop(m, p) { return m.hoops[p.idx === 0 ? 0 : 1]; }
  function other(m, p) { return m.players[1 - p.idx]; }

  /* -------------------------------------------------------------- match */
  // opts: { mode: 'cpu'|'duo'|'tour'|'demo', p1, p2 (char ids), lv (cpu level), len (s), target, court, ball }
  HH.newMatch = function (opts) {
    var m = {
      mode: opts.mode, opts: opts, demo: opts.mode === 'demo',
      time: opts.len || 120, len: opts.len || 120, target: opts.target || 21,
      hoops: [makeHoop(0), makeHoop(1)], players: [],
      ball: { x: 640, y: 380, vx: 0, vy: 0, rot: 0, holder: null, state: 'loose', shooter: null, pts: 2, fire: false, dunk: false, touched: false, rimHit: false, ignore: null, ignoreT: 0, noGrab: 0, scoredT: 0, prevY: 380, trail: [], lastBounce: 0 },
      phase: 'intro', phaseT: 2.1, clock: 0, timeUp: false, overtime: false, ended: false, winner: -1, waitShot: 0,
      popups: [], fx: Kit.particles(), shake: Kit.shake(), flash: 0, slow: 0, slowScale: 1,
      crowd: 0, crowdMood: 0, hint: null, hintT: 0, nextPoss: -1, lastTickSec: -1, events: [], swish: true,
      tipCount: 0
    };
    var c1 = HH.charById(opts.p1), c2 = HH.charById(opts.p2);
    var cpu2 = opts.mode !== 'duo';
    m.players.push(makePlayer(m, 0, c1, opts.mode === 'demo' ? 'cpu' : 'human', opts.lv1 != null ? opts.lv1 : 1.5));
    m.players.push(makePlayer(m, 1, c2, cpu2 ? 'cpu' : 'human', opts.lv != null ? opts.lv : 1));
    if (m.demo) m.time = 9999;
    resetPositions(m, -1);
    return m;
  };

  function resetPositions(m, poss) {
    var a = m.players[0], b = m.players[1], ball = m.ball;
    [a, b].forEach(function (p) {
      p.vx = 0; p.vy = 0; p.y = FLOOR; p.onGround = true; p.charging = false; p.charge = 0; p.dunk = null; p.hang = 0;
      p.stun = 0; p.grabCd = 0; p.stealCd = 0.3; p.mood = 'normal'; p.moodT = 0;
      if (p.ai) { p.ai.plan = null; p.ai.hold = 0; p.ai.rush = 0; p.ai.jumpAt = -1; p.ai.jumpHold = 0; }
    });
    ball.holder = null; ball.state = 'loose'; ball.shooter = null; ball.pts = 2; ball.fire = false; ball.dunk = false; ball.touched = false;
    ball.noGrab = 0; ball.trail.length = 0; ball.ignore = null; ball.ignoreT = 0;
    if (poss < 0) {
      a.x = 520; b.x = 760; a.facing = 1; b.facing = -1;
      ball.x = 640; ball.y = 420; ball.vx = 0; ball.vy = 0; ball.hidden = true;
    } else {
      var c = m.players[poss], d = other(m, c);
      if (poss === 0) { c.x = 330; d.x = 780; } else { c.x = 950; d.x = 500; }
      c.facing = poss === 0 ? 1 : -1; d.facing = -c.facing;
      giveBall(m, c, true);
      c.protect = 0.9;
    }
  }

  function jumpBall(m) {
    var b = m.ball;
    b.hidden = false; b.x = 640; b.y = 460; b.vx = (Math.random() - 0.5) * 60; b.vy = -900; b.state = 'loose'; b.noGrab = 0.35;
    S.whistle();
  }

  function giveBall(m, p, quiet) {
    var b = m.ball;
    b.holder = p; b.state = 'held'; b.pts = 2; b.fire = false; b.dunk = false; b.touched = false; b.shooter = null; b.hidden = false;
    // a moment to make a move before the defender can knock it away (a bit longer for humans)
    p.protect = Math.max(p.protect, p.ctrl === 'human' ? 1.15 : 0.7);
    if (p.ai) { p.ai.plan = null; p.ai.hold = 0; }
    if (!quiet && !m.demo) S.grab();
    m.lastShotBy = null;
    heldPos(m, p, b, 0);
  }

  /* --------------------------------------------------------------- input */
  var K = Kit.keys;
  function readHuman(m, p) {
    var i = p.inp, solo = m.mode !== 'duo';
    var L, R, J, Sh;
    if (p.idx === 0) {
      L = K.down('KeyA') || (solo && K.down('ArrowLeft'));
      R = K.down('KeyD') || (solo && K.down('ArrowRight'));
      J = K.down('KeyW') || K.down('Space') || (solo && K.down('ArrowUp'));
      Sh = K.down('KeyS') || (solo && K.down('ArrowDown'));
    } else {
      L = K.down('ArrowLeft'); R = K.down('ArrowRight');
      J = K.down('ArrowUp'); Sh = K.down('ArrowDown') || K.down('Numpad0');
    }
    i.l = L; i.r = R;
    i.jumpP = J && !p.prevJump; i.jump = J;
    i.shootP = Sh && !p.prevShoot; i.shootR = !Sh && p.prevShoot; i.shoot = Sh;
    p.prevJump = J; p.prevShoot = Sh;
  }

  /* ---------------------------------------------------------- helpers */
  function popup(m, text, x, y, o) {
    o = o || {};
    if (m.popups.length > 10) m.popups.shift();
    m.popups.push({ text: text, x: x, y: y, t: 0, life: o.life || 1.1, color: o.color || '#fff', size: o.size || 44, vy: o.vy == null ? -60 : o.vy, sub: o.sub || null });
  }
  HH.popup = popup;
  function slowmo(m, t, scale) { m.slow = Math.max(m.slow, t); m.slowScale = Math.min(scale, m.slow > 0 ? m.slowScale : 1); if (m.slowScale > scale) m.slowScale = scale; }
  function setMood(p, mood, t) { p.mood = mood; p.moodT = t; }

  function heldPos(m, p, b, dt) {
    var hy = headY(p);
    if (p.dunk || !p.onGround || p.charging || p.hang > 0) {
      var up = p.charging ? p.charge * 8 : 0;
      b.x = p.x + p.facing * (p.charging ? 8 : 20);
      b.y = hy - p.headR - 16 - up;
      if (p.hang > 0) { b.x = p.x; }
    } else {
      var moving = Math.abs(p.vx) > 40;
      var prev = Math.sin(p.drib);
      p.drib += dt * (moving ? 12.5 : 8);
      var s = Math.sin(p.drib);
      if (prev < 0 && s >= 0 || prev > 0 && s <= 0) {
        if (!m.demo && m.phase === 'play') S.bounce(0.22);
      }
      var k = Math.abs(s);
      var handY = p.y - 66;
      b.x = p.x + p.facing * 40;
      b.y = FLOOR - BALL_R - k * (FLOOR - BALL_R - handY);
    }
    b.rot += p.vx * dt / BALL_R;
  }
  HH.heldPos = heldPos;

  function canDunk(m, p) {
    if (p.onGround || m.ball.holder !== p) return false;
    var h = attackHoop(m, p);
    var dx = p.x - h.x;
    if (Math.abs(dx) > 215) return false;
    if (h.s * dx > 30) return false; // behind the backboard
    return headY(p) - p.headR - 16 < RIM_Y + 55;
  }
  HH.canDunk = canDunk;

  function zoneFor(p, h) {
    var z = p.fire ? 0.3 : p.zone;
    var d = Math.abs(p.x - h.x);
    if (d > THREE) z *= 0.85; else if (d < 200) z *= 1.25;
    return z;
  }
  HH.zoneFor = zoneFor;

  function solveShot(x0, y0, tx, ty) {
    var dx = tx - x0, d = Math.abs(dx);
    var apex = Math.min(y0, ty) - (95 + d * 0.3);
    if (apex < -200) apex = -200;
    var vy = -Math.sqrt(2 * G_BALL * (y0 - apex));
    var tUp = -vy / G_BALL, tDown = Math.sqrt(2 * (ty - apex) / G_BALL);
    return { vx: dx / (tUp + tDown), vy: vy };
  }

  /* -------------------------------------------------------------- shots */
  function releaseShot(m, p) {
    var b = m.ball, h = attackHoop(m, p);
    p.charging = true;
    heldPos(m, p, b, 0);
    p.charging = false;
    var zone = zoneFor(p, h);
    var center = SWEET;
    var e = (p.charge - center) / zone;
    var inZone = Math.abs(e) <= 1;
    // In the zone: land within a few px of the centre. Outside: miss by a distance that
    // grows with the error (small errors clank the rim, big ones fly past).
    var off = inZone ? e * 11 + (p.fire ? 0 : randn() * 1.2 * (5 - p.ch.sht) * 0.5)
      : sgn(e) * ((e < 0 ? 42 : 36) + 210 * (Math.abs(p.charge - center) - zone) * (1 + 120 / Math.max(60, Math.abs(b.x - h.x)))) + randn() * 3;
    var tx = h.x + h.s * off, ty = RIM_Y - 4;
    var v = solveShot(b.x, b.y, tx, ty);
    b.holder = null; b.state = 'shot'; b.shooter = p; b.touched = false; b.rimHit = false;
    b.vx = v.vx; b.vy = v.vy;
    b.pts = Math.abs(p.x - h.x) > THREE ? 3 : 2;
    b.fire = p.fire; b.dunk = false;
    b.ignore = p; b.ignoreT = 0.3;
    m.lastShotBy = p; m.lastShotHoop = h;
    if (p.fire) { p.fire = false; p.streak = 0; }
    p.st.shots++;
    p.protect = 0; p.charge = 0;
    p.sqx = 0.9; p.sqy = 1.12;
    if (!m.demo) {
      S.shoot();
      if (inZone && Math.abs(e) < 0.4) { S.perfect(); popup(m, 'مثالية!', p.x, headY(p) - 80, { color: '#7dff9a', size: 30, life: 0.8 }); }
      else if (!inZone) popup(m, e > 0 ? 'قوية جدًا!' : 'ضعيفة!', p.x, headY(p) - 80, { color: '#ffb0b0', size: 26, life: 0.8 });
      m.events.push({ type: 'shot', p: p.idx, inZone: inZone });
    }
    if (m.tip === 'shoot' && p.ctrl === 'human') m.tipDone = true;
  }

  function startDunk(m, p) {
    var h = attackHoop(m, p);
    p.charging = false;
    p.dunk = { t: 0, dur: 0.36, x0: p.x, y0: p.y, tx: h.x - h.s * 30, ty: RIM_Y + 150, h: h };
    p.facing = h.s;
    slowmo(m, 0.55, 0.32);
    if (!m.demo) { S.jump(); popup(m, 'دانك!', h.x - h.s * 60, RIM_Y - 120, { color: '#ffd23f', size: 64, life: 1.2, vy: -30 }); }
    if (m.tip === 'dunk' && p.ctrl === 'human') m.tipDone = true;
  }

  function updateDunk(m, p, dt) {
    var d = p.dunk, b = m.ball;
    d.t += dt;
    var k = Math.min(1, d.t / d.dur), e = 1 - (1 - k) * (1 - k);
    p.x = d.x0 + (d.tx - d.x0) * e;
    p.y = d.y0 + (d.ty - d.y0) * e - Math.sin(k * Math.PI) * 40;
    p.vx = 0; p.vy = 0;
    heldPos(m, p, b, dt);
    b.x = p.x + d.h.s * 30 * e; b.y = RIM_Y - 30 - (1 - k) * 60;
    if (k >= 1) {
      p.dunk = null;
      p.hang = 0.42; p.hangX = p.x; p.hangY = p.y;
      b.holder = null; b.state = 'shot'; b.shooter = p; b.pts = 2; b.dunk = true; b.touched = false;
      b.fire = p.fire; if (p.fire) { p.fire = false; p.streak = 0; }
      b.x = d.h.x; b.y = RIM_Y - 22; b.prevY = b.y; b.vx = 0; b.vy = 950;
      b.ignore = p; b.ignoreT = 0.5;
      d.h.bend = 1;
      p.st.shots++;
      m.shake.add(m.demo ? 4 : 16);
      m.flash = m.demo ? 0 : 0.35;
      m.fx.burst(d.h.x, RIM_Y, { count: m.demo ? 8 : 30, colors: ['#ffd23f', '#ff9f1c', '#fff'], speed: 520, life: 0.7, size: 7 });
      if (!m.demo) S.dunk();
    }
  }

  function knockLoose(m, c, o) {
    var b = m.ball;
    b.holder = null; b.state = 'loose'; b.touched = true;
    var dir = sgn(o.x - c.x);
    b.vx = dir * (140 + Math.random() * 80) + o.vx * 0.25;
    b.vy = -560 - Math.random() * 120;
    b.noGrab = 0.12;
    c.charging = false; c.charge = 0;
    c.stun = 0.5; c.grabCd = 0.5; c.vx = -dir * 260;
    if (!c.onGround) c.vy = Math.max(c.vy, -100);
    o.stealCd = 0.9; o.vx *= 0.3;
    setMood(c, 'dizzy', 0.7);
    o.st.steals++;
    m.shake.add(m.demo ? 2 : 6);
    m.fx.burst(c.x, headY(c) - 20, { count: 12, colors: ['#ffd23f', '#fff'], speed: 260, life: 0.5, size: 6, gravity: 0 });
    if (!m.demo) { S.steal(); popup(m, 'خطف!', (c.x + o.x) / 2, headY(c) - 70, { color: '#5fd0ff', size: 42 }); }
    if (m.tip === 'steal' && o.ctrl === 'human') m.tipDone = true;
  }

  // Bumped into the carrier's back: bounce off with a bonk (no steal).
  function bumpOff(m, c, o, ballSide) {
    var dir = sgn(o.x - c.x);
    o.vx = dir * 330; o.stealCd = 0.5;
    o.sqx = 1.15; o.sqy = 0.88; c.sqx = 1.1; c.sqy = 0.92;
    if (!m.demo) {
      S.bonk();
      if (ballSide) { if (o.ctrl === 'human') popup(m, 'أفلتت!', o.x, headY(o) - 70, { color: '#ffd23f', size: 28, life: 0.7 }); }
      else if (o.ctrl === 'human' && (m.bumpHintT || 0) <= 0) {
        m.bumpHintT = 2.5;
        popup(m, 'اخطفها من الأمام!', o.x, headY(o) - 70, { color: '#ffd23f', size: 30, life: 1.0 });
      }
    }
  }

  /* -------------------------------------------------------- players step */
  function updatePlayer(m, p, dt) {
    var inp = p.inp, b = m.ball;
    p.t += dt;
    p.stun = Math.max(0, p.stun - dt); p.protect = Math.max(0, p.protect - dt);
    p.grabCd = Math.max(0, p.grabCd - dt); p.stealCd = Math.max(0, p.stealCd - dt); p.bonkCd = Math.max(0, p.bonkCd - dt);
    if (p.moodT > 0) { p.moodT -= dt; if (p.moodT <= 0) p.mood = 'normal'; }
    p.blinkT -= dt; if (p.blinkT <= 0) { p.blink = !p.blink; p.blinkT = p.blink ? 0.12 : 2 + Math.random() * 3; }
    p.sqx += (1 - p.sqx) * Math.min(1, dt * 12); p.sqy += (1 - p.sqy) * Math.min(1, dt * 12);
    if (p.fire) p.fireT += dt;

    if (p.dunk) { updateDunk(m, p, dt); return; }
    if (p.hang > 0) {
      p.hang -= dt; p.x = p.hangX; p.y = p.hangY; p.vx = 0; p.vy = 0;
      if (p.hang <= 0) { p.vy = 60; p.onGround = false; }
      return;
    }
    var hasBall = b.holder === p;
    var live = m.phase === 'play';
    var dir = live ? (inp.r ? 1 : 0) - (inp.l ? 1 : 0) : 0;
    var spd = p.speed * (p.ai ? p.ai.p.spd : 1) * (p.stun > 0 ? 0.45 : 1) * (hasBall ? 0.94 : 1);
    if (p.charging && p.onGround) spd *= 0.12;
    var target = dir * spd;
    var acc = p.onGround ? 5200 : 2400;
    if (p.vx < target) p.vx = Math.min(target, p.vx + acc * dt);
    else if (p.vx > target) p.vx = Math.max(target, p.vx - acc * dt);

    // facing
    if (hasBall && (p.charging || !p.onGround)) p.facing = attackHoop(m, p).s;
    else if (dir) p.facing = dir;
    else if (!hasBall && live && Math.abs(b.x - p.x) > 30) p.facing = sgn(b.x - p.x);

    // jumping (buffer + coyote + variable height)
    if (live && inp.jumpP) p.jumpBuf = 0.12;
    if (p.jumpBuf > 0) {
      p.jumpBuf -= dt;
      if ((p.onGround || p.coyote > 0) && p.stun <= 0) {
        p.vy = -p.jumpV * (p.ai ? 0.97 + p.ai.p.spd * 0.03 : 1); p.onGround = false; p.coyote = 0; p.jumpBuf = 0; p.jumpCut = false;
        p.sqx = 0.78; p.sqy = 1.25;
        if (!m.demo) S.jump();
        m.fx.burst(p.x, FLOOR - 4, { count: 5, color: 'rgba(255,255,255,0.7)', speed: 120, life: 0.3, size: 6, gravity: -100, angle: -Math.PI / 2, spread: 2.4 });
      }
    }
    if (!p.onGround && !inp.jump && !p.jumpCut && p.vy < -260) { p.vy *= 0.6; p.jumpCut = true; }

    p.vy += G_PL * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.y >= FLOOR) {
      if (!p.onGround) {
        if (p.vy > 350) { p.sqx = 1.22; p.sqy = 0.8; if (!m.demo) S.land(); m.fx.burst(p.x, FLOOR - 3, { count: 6, color: 'rgba(255,255,255,0.6)', speed: 160, life: 0.3, size: 6, gravity: -60, angle: -Math.PI / 2, spread: 3 }); }
      }
      p.y = FLOOR; p.vy = 0; p.onGround = true; p.coyote = 0.08;
    } else if (p.onGround && p.y < FLOOR) { p.onGround = false; }
    if (!p.onGround) p.coyote = Math.max(0, p.coyote - dt);
    if (p.x < 34) { p.x = 34; p.vx = 0; }
    if (p.x > W - 34) { p.x = W - 34; p.vx = 0; }
    p.walkT += Math.abs(p.vx) * dt * 0.028;

    // shooting
    if (hasBall && live) {
      if (inp.shootP) {
        if (canDunk(m, p)) { startDunk(m, p); return; }
        p.charging = true; p.charge = 0; p.chargeDir = 1; p.chargeTick = 0;
      }
      if (p.charging) {
        p.charge += dt * CHARGE_SPEED * p.chargeDir;
        if (p.charge >= 1) { p.charge = 1; p.chargeDir = -1; }
        if (p.charge <= 0.05 && p.chargeDir < 0) { p.chargeDir = 1; }
        p.chargeTick -= dt;
        if (p.chargeTick <= 0 && !m.demo && p.ctrl === 'human') { S.charge(p.charge); p.chargeTick = 0.07; }
        setMood(p, 'effort', 0.1);
        if (!inp.shoot) releaseShot(m, p);
      }
    } else { p.charging = false; }
  }

  /* ------------------------------------------------------------- ball */
  function collidePoint(m, b, px, py, pr, rest, h) {
    var dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy, rr = BALL_R + pr;
    if (d2 >= rr * rr || d2 < 0.0001) return false;
    var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    b.x = px + nx * rr; b.y = py + ny * rr;
    var vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      var tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty;
      vn = -vn * rest; vt *= 0.92;
      b.vx = nx * vn + tx * vt; b.vy = ny * vn + ty * vt;
      var sp = Math.abs(vn);
      if (sp > 60) {
        if (!m.demo) S.clank(sp / 500);
        if (h) { h.glow = 1; h.sway = Math.min(1, h.sway + sp / 600); }
      }
    }
    return true;
  }
  function collideRect(m, b, x0, y0, x1, y1, rest, h) {
    var cx = Math.max(x0, Math.min(b.x, x1)), cy = Math.max(y0, Math.min(b.y, y1));
    var dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= BALL_R * BALL_R) return false;
    var d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d;
    if (d2 < 0.0001) { nx = h ? -h.s : 0; ny = 0; }
    b.x = cx + nx * BALL_R; b.y = cy + ny * BALL_R;
    var vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + rest) * vn * nx; b.vy -= (1 + rest) * vn * ny;
      if (Math.abs(vn) > 80 && !m.demo) S.board(Math.abs(vn) / 700);
      if (h) h.glow = Math.max(h.glow, 0.5);
    }
    return true;
  }

  function updateBall(m, dt) {
    var b = m.ball;
    b.ignoreT = Math.max(0, b.ignoreT - dt); b.noGrab = Math.max(0, b.noGrab - dt); b.scoredT = Math.max(0, b.scoredT - dt);
    if (b.hidden) return;
    if (b.holder) {
      heldPos(m, b.holder, b, dt);
      b.vx = b.holder.vx; b.vy = b.holder.vy; b.prevY = b.y;
      b.trail.length = 0;
      return;
    }
    var steps = 3, h = dt / steps;
    for (var s = 0; s < steps; s++) {
      b.prevY = b.y;
      b.vy += G_BALL * h;
      b.x += b.vx * h; b.y += b.vy * h;
      // floor
      if (b.y > FLOOR - BALL_R) {
        b.y = FLOOR - BALL_R;
        if (b.vy > 0) {
          var imp = b.vy;
          b.vy = -b.vy * 0.72; b.vx *= 0.9;
          if (Math.abs(b.vy) < 70) b.vy = 0;
          if (imp > 90 && !m.demo) S.bounce(imp / 900);
          if (b.state === 'shot') {
            if (b.rimHit && !b.dunk && !m.demo && b.shooter && b.shooter.ctrl === 'human' && m.phase === 'play') {
              var hh = attackHoop(m, b.shooter);
              popup(m, 'قريبة جدًا!', hh.x - hh.s * 90, RIM_Y - 70, { color: '#ffb0b0', size: 34, life: 0.9 });
              if (S.aww) S.aww();
            }
            b.state = 'loose'; b.touched = true;
          }
          b.pts = 2; b.fire = false;
        }
        b.vx *= 1 - 1.2 * h;
      }
      if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.7; }
      if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx) * 0.7; }
      if (b.y < -500) { b.y = -500; b.vy = Math.abs(b.vy) * 0.5; }
      for (var i = 0; i < 2; i++) {
        var hp = m.hoops[i];
        var rising = b.state === 'shot' && !b.touched && b.vy < 0 && b.y > hp.y;
        var hit = rising ? 0 : (collidePoint(m, b, hp.front, hp.y, RIM_PT, 0.5, hp) | collidePoint(m, b, hp.back, hp.y, RIM_PT, 0.5, hp));
        hit |= collideRect(m, b, hp.bx0, hp.by0, hp.bx1, hp.by1, 0.62, hp);
        if (hit) { b.touched = true; b.rimHit = true; }
        // score
        var lo = Math.min(hp.front, hp.back) + 3, hi = Math.max(hp.front, hp.back) - 3;
        if (b.prevY < hp.y && b.y >= hp.y && b.vy > 0 && b.x > lo && b.x < hi && b.scoredT <= 0) score(m, hp);
      }
    }
    b.rot += b.vx * dt / BALL_R;
    // never let the ball get stuck up high (e.g. on top of a backboard)
    if (Math.abs(b.vx) < 40 && Math.abs(b.vy) < 60 && b.y < FLOOR - 60) {
      b.restT = (b.restT || 0) + dt;
      if (b.restT > 0.5) { b.vx = b.x < W / 2 ? 160 : -160; b.vy = -120; b.restT = 0; }
    } else b.restT = 0;
    // trail for fire / fast shots
    if (b.fire || b.dunk || (b.state === 'shot' && !m.demo)) {
      b.trail.push(b.x, b.y);
      if (b.trail.length > 24) b.trail.splice(0, 2);
    } else if (b.trail.length) b.trail.splice(0, 2);

    // players: blocks, head bonks, grabs
    var best = null, bestD = 1e9;
    for (var k = 0; k < 2; k++) {
      var p = m.players[k];
      if (p.dunk || p.hang > 0) continue;
      if (b.ignore === p && b.ignoreT > 0) continue;
      var hy = headY(p);
      var canGrab = b.noGrab <= 0 && p.grabCd <= 0 && p.stun <= 0 && (b.state !== 'shot' || b.touched) && m.phase !== 'score' && m.phase !== 'end';
      if (b.state === 'shot' && !b.touched && b.shooter !== p && !p.onGround) {
        var bx = b.x - p.x, by = b.y - (hy - p.headR * 0.4);
        if (bx * bx + by * by < Math.pow(p.headR + 34, 2)) { block(m, p); continue; }
      }
      // head bonk (bouncy big heads!)
      if (!canGrab || b.state === 'shot') {
        var dx = b.x - p.x, dy = b.y - hy, rr = p.headR + BALL_R;
        if (dx * dx + dy * dy < rr * rr) {
          var d = Math.sqrt(dx * dx + dy * dy) || 1, nx = dx / d, ny = dy / d;
          b.x = p.x + nx * rr; b.y = hy + ny * rr;
          var vn = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
          if (vn < 0) {
            b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny;
            b.vx += p.vx * 0.3; b.vy += Math.min(0, p.vy) * 0.3;
            if (p.bonkCd <= 0 && Math.abs(vn) > 120) {
              p.bonkCd = 0.25; p.sqx = 1.15; p.sqy = 0.88;
              if (!m.demo) S.bonk();
              if (b.state === 'shot') { b.state = 'loose'; b.touched = true; b.pts = 2; }
            }
          }
          continue;
        }
      }
      if (canGrab && !b.holder) {
        // capsule from the feet to the top of the head, so floor balls can be scooped up
        var cyy = Math.max(p.y - 150, Math.min(p.y - 14, b.y));
        var gx = b.x - (p.x + p.facing * 10), gy = b.y - cyy;
        var dd = gx * gx + gy * gy;
        if (dd < 52 * 52 && dd < bestD) { best = p; bestD = dd; }
      }
    }
    if (best && !b.holder) {
      b.state = 'held';
      giveBall(m, best, false);
    }
  }

  function block(m, p) {
    var b = m.ball, sh = b.shooter;
    b.state = 'loose'; b.touched = true; b.pts = 2; b.fire = false;
    var dir = attackHoop(m, p).s;
    b.vx = dir * (360 + Math.random() * 160) + p.vx * 0.3;
    b.vy = -120 - Math.random() * 180;
    b.noGrab = 0.15;
    p.st.blocks++;
    p.sqx = 1.2; p.sqy = 0.85;
    setMood(p, 'happy', 0.9);
    if (sh) setMood(sh, 'sad', 0.9);
    m.shake.add(m.demo ? 3 : 10);
    slowmo(m, 0.3, 0.35);
    m.fx.burst(b.x, b.y, { count: m.demo ? 6 : 22, colors: ['#fff', '#5fd0ff', '#ffd23f'], speed: 420, life: 0.5, size: 7, gravity: 200 });
    if (!m.demo) { S.block(); popup(m, 'صدّ!', b.x, b.y - 50, { color: '#5fd0ff', size: 60 }); m.events.push({ type: 'block', p: p.idx }); }
  }

  /* ------------------------------------------------------------- scoring */
  function score(m, h) {
    var b = m.ball;
    b.scoredT = 0.8;
    var att = m.players[h.side === 1 ? 0 : 1], def = other(m, att);
    var pts = b.dunk ? 2 : b.pts;
    if (b.shooter !== att) pts = 2;
    if (m.phase !== 'play') return; // after the buzzer / during a celebration
    att.score += pts;
    att.st.pts += pts; att.st.made++;
    if (pts === 3) att.st.threes++;
    if (b.dunk) att.st.dunks++;
    h.net = 1; h.netT = 0;
    b.vx *= 0.25; b.vy = Math.min(b.vy, 320);
    var big = pts === 3 || b.dunk || b.fire;
    var clean = !b.rimHit && !b.dunk;
    var txt = b.dunk ? 'دانك!' : pts === 3 ? 'ثلاثية!' : clean ? 'نظيفة!' : 'سلة!';
    if (b.fire) txt = 'رمية نارية!';
    var col = b.fire ? '#ff7a1a' : pts === 3 ? '#b18cff' : b.dunk ? '#ffd23f' : '#7dff9a';
    if (!m.demo) {
      S.swish();
      S.cheer(big);
      if (!b.dunk) popup(m, txt, h.x - h.s * 70, RIM_Y - 90, { color: col, size: big ? 60 : 50, life: 1.3, sub: '+' + pts });
      else popup(m, '+' + pts, h.x - h.s * 70, RIM_Y - 40, { color: '#fff', size: 44, life: 1.2 });
      m.flash = Math.max(m.flash, big ? 0.3 : 0.15);
      m.events.push({ type: 'score', p: att.idx, pts: pts, dunk: b.dunk, fire: b.fire });
    }
    m.crowd = big ? 2.2 : 1.4;
    m.shake.add(big ? 9 : 4);
    m.fx.burst(h.x, RIM_Y + 30, { count: m.demo ? 10 : (big ? 50 : 26), colors: ['#ffd23f', '#ff4d6d', '#5fd0ff', '#7dff9a', '#fff', '#b18cff'], speed: big ? 520 : 380, life: 1.0, size: 8, gravity: 500 });
    if (b.fire) m.fx.burst(h.x, RIM_Y, { count: 30, colors: ['#ff3d00', '#ff9f1c', '#ffd23f'], speed: 600, life: 0.8, size: 9, gravity: -100 });
    setMood(att, 'happy', 1.8); setMood(def, 'sad', 1.6);
    // fire streak
    att.streak++; def.streak = 0; def.fire = false;
    if (att.streak >= 2 && !att.fire) {
      att.fire = true; att.fireT = 0;
      if (!m.demo) { S.fire(); popup(m, 'مشتعل!', att.x, headY(att) - 90, { color: '#ff9f1c', size: 46, life: 1.5, vy: -40 }); }
    }
    b.fire = false;
    m.phase = 'score'; m.phaseT = m.demo ? 1.1 : 1.6; m.nextPoss = def.idx;
    if (att.score >= m.target || m.overtime || (m.timeUp && att.score !== def.score)) { m.ended = true; m.winner = att.idx; m.phaseT = 1.2; slowmo(m, 1.2, 0.35); }
    if (m.tip === 'dunk' && b.dunk) m.tipDone = true;
  }

  /* ------------------------------------------------------------------ AI */
  function predictX(b, yLine) {
    var x = b.x, y = b.y, vx = b.vx, vy = b.vy, dt = 1 / 30;
    for (var i = 0; i < 60; i++) {
      vy += G_BALL * dt; x += vx * dt; y += vy * dt;
      if (x < BALL_R || x > W - BALL_R) vx = -vx;
      if (vy > 0 && y >= yLine) return x;
    }
    return x;
  }

  function aiUpdate(m, p, dt) {
    var ai = p.ai, P = ai.p, inp = p.inp, b = m.ball, o = other(m, p);
    var hA = attackHoop(m, p), hD = defHoop(m, p), sA = hA.s;
    inp.jumpP = false; inp.shootP = false; inp.shootR = false;
    if (m.phase !== 'play' || p.dunk || p.hang > 0) {
      inp.l = inp.r = inp.jump = inp.shoot = false;
      if (m.phase === 'score' && p.mood === 'happy' && p.onGround && Math.random() < dt * 1.5) { inp.jumpP = true; inp.jump = true; ai.jumpHold = 0.2; }
      return;
    }
    ai.think -= dt;
    ai.rush = Math.max(0, ai.rush - dt);
    var clock = m.clock;
    var tx = ai.tx;
    var wantShoot = inp.shoot;

    function scheduleJump(delay, hold) { if (ai.jumpAt < 0) { ai.jumpAt = clock + delay; ai.jumpHoldAmt = hold; } }

    if (b.holder === p) {
      ai.hold += dt;
      if (!ai.plan) {
        var r = Math.random();
        var kind = r < P.dunk ? 'drive' : (r < P.dunk + 0.28 ? 'three' : 'mid');
        var spot = kind === 'drive' ? 110 : kind === 'three' ? THREE + 25 + Math.random() * 70 : 170 + Math.random() * 190;
        ai.plan = { kind: kind, spot: spot, js: Math.random() < P.jumpShot, started: false, t: 0 };
        ai.stuck = 0;
      }
      var pl = ai.plan;
      pl.t += dt;
      var goal = hA.x - sA * pl.spot;
      if (!pl.started) tx = goal;
      var blocked = o.onGround && Math.abs(o.x - p.x) < 95 && sgn(o.x - p.x) === sA;
      if (blocked) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt);
      // Pressure: a defender rushing in on the ball side -> pull up for a jump shot over them.
      var odx = o.x - p.x;
      var press = o.onGround && Math.abs(odx) < 160 && sgn(odx) === p.facing && o.vx * -sgn(odx) > 60 && p.protect < 0.25;
      if (press && !pl.started && pl.kind !== 'drive' && p.onGround && !p.charging && Math.abs(p.x - hA.x) < 760 &&
          Math.random() < dt * (3 + ai.lv * 3)) {
        pl.kind = 'mid'; pl.started = true; pl.pull = 0.001;
        ai.tp = Math.max(0.35, Math.min(0.99, SWEET + randn() * P.aimErr * zoneFor(p, hA) * 1.1));
        scheduleJump(0, 0.45);
      }
      if (pl.pull) pl.pull += dt;
      if (pl.kind === 'drive') {
        var near = Math.abs(p.x - hA.x) < 230 + (p.jumpV - 700) * 0.35;
        if (p.onGround && (near || ai.stuck > 0.45 + P.react) && sgn(hA.x - p.x) === sA) { scheduleJump(0, 0.35); pl.dunkOk = Math.random() < P.dunkSkill; }
        if (!p.onGround && pl.dunkOk && canDunk(m, p)) inp.shootP = true;
        if (p.onGround && pl.t > 3.5) pl.kind = 'mid', pl.spot = Math.abs(p.x - hA.x);
      } else {
        if (!pl.started && (Math.abs(p.x - goal) < 20 || pl.t > 3 || (ai.stuck > 0.9 && Math.abs(p.x - hA.x) < 560) || ai.hold > 5)) {
          pl.started = true; wantShoot = true;
          var z = zoneFor(p, hA);
          ai.tp = Math.max(0.35, Math.min(0.99, SWEET + randn() * P.aimErr * z * 0.9));
          if (pl.js || (o.onGround && Math.abs(o.x - p.x) < 110)) scheduleJump(0.12 + Math.random() * 0.1, 0.4);
        }
        if (pl.started) {
          tx = p.x;
          if (!p.charging && !wantShoot) wantShoot = true;
          if (pl.pull && p.onGround && !p.charging && pl.pull < 0.3) wantShoot = false; // jump first, then shoot
          if (p.charging) {
            wantShoot = true;
            if (p.chargeDir > 0 && p.charge >= ai.tp) wantShoot = false;
            if (p.chargeDir < 0 && p.charge <= ai.tp) wantShoot = false;
          }
        }
      }
      if (ai.hold > 6 && !p.charging) { pl.kind = 'mid'; pl.started = true; wantShoot = true; ai.tp = SWEET + randn() * P.aimErr * zoneFor(p, hA); }
    } else {
      ai.plan = null; ai.hold = 0; wantShoot = false;
      if (b.holder === o) {
        // defense: get between the carrier and our hoop, but go around (not through) unless rushing
        if (ai.think <= 0) {
          ai.think = P.react;
          ai.rushCd = Math.max(0, (ai.rushCd || 0) - P.react);
          if (Math.abs(o.x - p.x) < 170 && ai.rushCd <= 0 && Math.random() < P.steal * 0.16) { ai.rush = 0.45; ai.rushCd = 1.3; }
        }
        var toHoop = sgn(hD.x - o.x);
        var goodSide = sgn(p.x - o.x) === toHoop;
        if (goodSide) tx = o.x + toHoop * 85;
        else {
          // behind the carrier: chase and hover at arm's length, jump over to get in front sometimes
          tx = o.x - toHoop * 72;
          if (Math.abs(o.x - p.x) < 80 && p.onGround && o.onGround && Math.random() < dt * P.steal * 1.5) scheduleJump(0, 0.4);
          if (!p.onGround) tx = o.x + toHoop * 90;
        }
        if (ai.rush > 0) tx = o.x;
        ai.tx = tx;
        var threat = (o.charging || !o.onGround) && Math.abs(o.x - p.x) < 180;
        if (threat && !ai.blockRolled) {
          ai.blockRolled = true;
          if (Math.random() < P.block) scheduleJump(P.react * 0.7 + (o.charging ? 0.25 : 0.02), 0.35);
        }
        if (!threat) ai.blockRolled = false;
      } else {
        // loose ball or ball in flight
        if (ai.think <= 0) {
          ai.think = P.react * 0.8;
          if (b.state === 'shot' && b.shooter === p && !b.touched) ai.tx = hA.x - sA * 150;
          else if (b.state === 'shot' && !b.touched) ai.tx = hD.x - hD.s * 150;
          else ai.tx = predictX(b, FLOOR - 110);
          ai.tx = Math.max(40, Math.min(W - 40, ai.tx));
        }
        tx = ai.tx;
        if (b.state === 'shot' && !b.touched && b.shooter === o && p.onGround && Math.abs(b.x - p.x) < 200 && b.vy < 0 && !ai.blockRolled) {
          ai.blockRolled = true;
          if (Math.random() < P.block * 0.8) scheduleJump(0, 0.3);
        }
        if (b.state !== 'shot') ai.blockRolled = false;
        if ((b.state !== 'shot' || b.touched) && p.onGround && Math.abs(b.x - p.x) < 100 && b.y < p.y - 175 && b.y > p.y - 380 && b.vy > -250) scheduleJump(P.react * 0.4, 0.3);
      }
    }

    if (ai.jumpAt >= 0 && clock >= ai.jumpAt) {
      ai.jumpAt = -1;
      if (p.onGround) { inp.jumpP = true; ai.jumpHold = ai.jumpHoldAmt || 0.3; }
    }
    if (ai.jumpHold > 0) { ai.jumpHold -= dt; inp.jump = true; } else inp.jump = false;

    var dx = tx - p.x;
    inp.l = dx < -14; inp.r = dx > 14;
    if (p.charging && p.onGround) { inp.l = inp.r = false; }
    inp.shootP = inp.shootP || (wantShoot && !inp.shoot);
    inp.shoot = wantShoot || (inp.shootP && b.holder === p);
    ai.tx = ai.tx == null ? p.x : ai.tx;
  }

  /* ------------------------------------------------------------ tips */
  var TIPS = {
    shoot: { cpu: 'امسك S… واتركه عندما يكون المؤشر في الأخضر!', duo: 'امسك S أو ↓ واتركه في الأخضر!' },
    dunk: { cpu: 'اقترب من السلة، اقفز واضغط S = دانك!', duo: 'اقفز قرب السلة واضغط زر التصويب = دانك!' },
    steal: { cpu: 'اركض نحو الخصم من الأمام لتخطف الكرة!', duo: 'اصطدم بصاحب الكرة من الأمام لتخطفها!' }
  };
  function updateTips(m, dt) {
    if (m.demo) return;
    var tips = HH.save.tips;
    if (m.tip && m.phase !== 'play') { m.tip = null; m.hint = null; m.tipCd = 2; return; }
    if (m.tip) {
      m.tipT += dt;
      if (m.tipDone || m.tipT > 7) {
        tips[m.tip] = (tips[m.tip] || 0) + (m.tipDone ? 3 : 1);
        m.tip = null; m.hint = null; m.tipDone = false; m.tipCd = 3;
      }
      return;
    }
    m.tipCd = (m.tipCd || 0) - dt;
    if (m.tipCd > 0 || m.phase !== 'play') return;
    var h = m.players[0], b = m.ball, want = null;
    if (b.holder === h && (tips.shoot || 0) < 3) want = 'shoot';
    else if (b.holder === h && (tips.shoot || 0) >= 3 && (tips.dunk || 0) < 3 && m.clock > 10) want = 'dunk';
    else if (b.holder && b.holder !== h && (tips.steal || 0) < 3 && m.clock > 4) want = 'steal';
    if (want) { m.tip = want; m.tipT = 0; m.tipDone = false; m.hint = TIPS[want][m.mode === 'duo' ? 'duo' : 'cpu']; }
  }

  /* ------------------------------------------------------------ step */
  HH.stepMatch = function (m, rdt) {
    // slow motion
    var scale = 1;
    if (m.slow > 0) { m.slow -= rdt; scale = m.slowScale; if (m.slow <= 0) m.slowScale = 1; }
    var dt = rdt * scale;
    m.clock += dt;
    m.flash = Math.max(0, m.flash - rdt * 1.5);
    m.shake.update(rdt);
    m.crowd = Math.max(0, m.crowd - rdt);
    m.bumpHintT = Math.max(0, (m.bumpHintT || 0) - rdt);

    var a = m.players[0], b2 = m.players[1];
    [a, b2].forEach(function (p) { if (p.ctrl === 'human') readHuman(m, p); else aiUpdate(m, p, dt); });

    if (m.phase === 'intro') {
      m.phaseT -= rdt;
      var sec = Math.ceil(m.phaseT - 0.6);
      if (!m.demo && sec !== m.lastTickSec && sec > 0 && sec <= 2) { m.lastTickSec = sec; S.tick(); }
      if (m.phaseT <= 0.6 && !m.goSaid) { m.goSaid = true; if (!m.demo) S.go(); }
      if (m.phaseT <= 0) { m.phase = 'play'; jumpBall(m); }
    } else if (m.phase === 'play') {
      if (!m.timeUp && !m.overtime) {
        var before = Math.ceil(m.time);
        m.time -= dt;
        if (!m.demo && m.time <= 10 && Math.ceil(m.time) !== before && m.time > 0) S.tick();
        if (m.time <= 0) {
          m.time = 0; m.timeUp = true; m.waitShot = 0;
          if (!m.demo) { S.buzzer(); m.events.push({ type: 'buzzer' }); }
        }
      }
      if (m.timeUp && !m.ended) {
        m.waitShot += dt;
        var inFlight = m.ball.state === 'shot' && !m.ball.touched;
        var nearRim = m.ball.state !== 'held' && m.ball.y < RIM_Y + 60 && m.ball.touched && m.waitShot < 2.5;
        if ((!inFlight && !nearRim) || m.waitShot > 3) {
          if (a.score === b2.score) {
            m.overtime = true; m.timeUp = false; m.time = 0;
            m.phase = 'intro'; m.phaseT = 2.6; m.goSaid = false; m.lastTickSec = -1;
            resetPositions(m, -1);
          } else {
            m.ended = true; m.winner = a.score > b2.score ? 0 : 1;
            m.phase = 'end'; m.phaseT = 2.2; slowmo(m, 1.0, 0.4);
            setMood(m.players[m.winner], 'happy', 5); setMood(m.players[1 - m.winner], 'sad', 5);
            m.crowd = 3;
            if (!m.demo) S.cheer(true);
          }
        }
      }
      // steals and body contact
      var c = m.ball.holder;
      if (c && !c.dunk && c.hang <= 0) {
        var o = other(m, c);
        var dx = o.x - c.x, dy = o.y - c.y;
        if (Math.abs(dx) < 58 && Math.abs(dy) < 115 && o.stealCd <= 0 && o.stun <= 0 && c.protect <= 0 && !o.dunk && o.hang <= 0) {
          var toward = o.vx * -sgn(dx) > 140;
          var fromAbove = !o.onGround && o.vy > 0 && dy < -30;
          var air = !c.onGround && !o.onGround && o.vy < -150 && Math.abs(c.x - attackHoop(m, c).x) < 260;
          // A ground steal only works from the ball side (in front of the dribbler).
          // Charging into the carrier's back just bounces you off, so chasing is not a free win.
          var ballSide = sgn(dx) === c.facing || c.charging;
          // ...and even then a good dribbler sometimes keeps it (CPU ball security grows with level).
          var keep = c.ai ? 0.33 + Math.min(2, c.ai.lv) * 0.1 : 0.45;
          if (c.charging && c.onGround) keep *= 0.5;
          if (fromAbove || air) knockLoose(m, c, o);
          else if (toward && ballSide && Math.random() >= keep) knockLoose(m, c, o);
          else if (toward) bumpOff(m, c, o, ballSide);
        }
      }
    } else if (m.phase === 'score') {
      m.phaseT -= rdt;
      if (m.phaseT <= 0) {
        if (m.ended) { m.phase = 'end'; m.phaseT = 2.0; m.crowd = 3; setMood(m.players[m.winner], 'happy', 5); setMood(m.players[1 - m.winner], 'sad', 5); }
        else if (m.timeUp && a.score !== b2.score) { m.ended = true; m.winner = a.score > b2.score ? 0 : 1; m.phase = 'end'; m.phaseT = 2.0; }
        else if (m.timeUp) {
          m.overtime = true; m.timeUp = false; m.time = 0; m.phase = 'intro'; m.phaseT = 2.6; m.goSaid = false; m.lastTickSec = -1; resetPositions(m, -1);
        } else { m.phase = 'play'; resetPositions(m, m.nextPoss); }
        if (m.demo && m.ended) { a.score = 0; b2.score = 0; m.ended = false; m.phase = 'intro'; m.phaseT = 1; resetPositions(m, -1); }
      }
    } else if (m.phase === 'end') {
      m.phaseT -= rdt;
      var w = m.players[m.winner];
      if (w && w.onGround && Math.random() < rdt * 2.5) { w.vy = -w.jumpV * 0.7; w.onGround = false; }
      if (Math.random() < rdt * 6) m.fx.burst(Kit.rand(100, 1180), -10, { count: 6, colors: ['#ffd23f', '#ff4d6d', '#5fd0ff', '#7dff9a', '#b18cff'], speed: 120, life: 2.2, size: 9, gravity: 260, angle: Math.PI / 2, spread: 1 });
      if (m.phaseT <= 0 && !m.done) { m.done = true; m.events.push({ type: 'end' }); }
    }

    a.inp.jumpP = a.inp.jumpP && m.phase === 'play';
    updatePlayer(m, a, dt); updatePlayer(m, b2, dt);
    // soft body push
    var pdx = b2.x - a.x;
    if (Math.abs(pdx) < 50 && Math.abs(b2.y - a.y) < 100 && !a.dunk && !b2.dunk && a.hang <= 0 && b2.hang <= 0) {
      var push = (50 - Math.abs(pdx)) / 2, sd = pdx === 0 ? 1 : sgn(pdx);
      a.x -= sd * push; b2.x += sd * push;
    }
    updateBall(m, dt);

    // hoops anim
    m.hoops.forEach(function (h) {
      h.bend = Math.max(0, h.bend - dt * 2.5);
      h.glow = Math.max(0, h.glow - dt * 3);
      h.sway = Math.max(0, h.sway - dt * 2);
      if (h.net > 0) { h.netT += dt; h.net = Math.max(0, h.net - dt * 1.2); }
    });
    // popups
    for (var i = m.popups.length - 1; i >= 0; i--) {
      var pp = m.popups[i]; pp.t += rdt; pp.y += pp.vy * rdt;
      if (pp.t > pp.life) m.popups.splice(i, 1);
    }
    m.fx.update(dt);
    updateTips(m, rdt);
  };

  HH.debugScore = function (m, idx, pts) { m.players[idx].score += pts; };
  HH._t = { releaseShot: releaseShot, giveBall: giveBall, resetPositions: resetPositions };
})();
