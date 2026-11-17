/* Hoop Heads: Turbo Super-Dunk Brawl — deterministic match physics, AI, dunks & power-ups. */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};

  HH.W = 1280;
  HH.H = 720;
  HH.FLOOR = 590;
  HH.BALL_R = 18;
  HH.LEFT_WALL = 86;
  HH.RIGHT_WALL = 1194;
  HH.HOOP_LX = 148;
  HH.HOOP_RX = 1132;
  HH.HOOP_Y = 292;
  HH.RIM_R = 31;
  HH.THREE_DIST = 470;
  HH.DUNK_DIST = 265;
  HH.SUPER_DIST = 700;

  var GRAV = 1980;
  var BALL_G = 1480;
  var POWER_IDS = ['mega', 'ice', 'rocket', 'magnet'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) {
    if (typeof Kit !== 'undefined' && Kit && typeof Kit.rand === 'function') return Kit.rand(a, b);
    return a + Math.random() * (b - a);
  }
  function sfx(name) {
    if (HH.sfx && typeof HH.sfx[name] === 'function') HH.sfx[name]();
  }

  HH.aiParams = function (lv) {
    var d = clamp(+lv || 0, 0, 2.8);
    var u = d / 2.4;
    return {
      lv: d,
      react: clamp(0.34 - u * 0.22, 0.09, 0.36),
      spdMul: clamp(0.78 + u * 0.26, 0.76, 1.08),
      shootCd: clamp(1.25 - u * 0.65, 0.45, 1.3),
      stealCd: clamp(1.35 - u * 0.72, 0.48, 1.4),
      errPx: clamp(18 - u * 13, 4, 20),
      dunkChance: clamp(0.38 + u * 0.48, 0.35, 0.92),
      blockChance: clamp(0.18 + u * 0.55, 0.15, 0.8),
      orbSeek: clamp(0.35 + u * 0.5, 0.3, 0.9)
    };
  };

  function makePlayer(idx, charId, ctrl, lv) {
    var ch = HH.charById ? HH.charById(charId) : { id: charId || 'robo', spd: 3, jmp: 3, sht: 3, headR: 44 };
    var homeX = idx === 0 ? 320 : HH.W - 320;
    return {
      idx: idx,
      ch: ch,
      ctrl: ctrl || 'human',
      ai: ctrl === 'ai' ? {
        cfg: HH.aiParams(lv),
        thinkT: 0.18,
        shootT: 0.65,
        stealT: 0.6,
        wantX: homeX,
        wantJump: false,
        wantAct: false
      } : null,
      x: homeX,
      y: HH.FLOOR,
      vx: 0,
      vy: 0,
      facing: idx === 0 ? 1 : -1,
      onGround: true,
      score: 0,
      super: 0,
      superLit: false,
      rocketT: 0,
      magnet: 0,
      aimT: 0,
      dashT: 0,
      blockT: 0,
      stealCd: 0,
      stunT: 0,
      protect: 0,
      dunk: null,
      animT: idx * 1.7,
      landSquash: 0,
      inp: { l: false, r: false, j: false, s: false },
      latch: { j: false, sDown: false, sUp: false },
      st: { pts: 0, dunks: 0, threes: 0, steals: 0, blocks: 0, supers: 0 }
    };
  }

  HH.newMatch = function (opts) {
    opts = opts || {};
    var mode = opts.mode || 'cpu';
    var lv = opts.lv !== undefined ? opts.lv : 0;
    var p0Ctrl = mode === 'demo' ? 'ai' : 'human';
    var p1Ctrl = mode === 'duo' ? 'human' : 'ai';
    var p0 = makePlayer(0, opts.p1 || 'robo', p0Ctrl, mode === 'demo' ? 1.2 : lv);
    var p1 = makePlayer(1, opts.p2 || 'shark', p1Ctrl, mode === 'demo' ? 1.2 : lv);

    var m = {
      mode: mode,
      lv: lv,
      diff: opts.diff !== undefined ? opts.diff : (lv < 0.7 ? 0 : lv < 1.5 ? 1 : 2),
      court: opts.court || 'recess',
      ballSkin: opts.ball || 'classic',
      trailSkin: opts.trail || 'flame',
      phase: mode === 'demo' ? 'play' : 'intro',
      phaseT: mode === 'demo' ? 0 : 0.85,
      clock: 0,
      time: opts.len || 60,
      maxTime: opts.len || 60,
      target: opts.target || 15,
      overtime: false,
      pendingOT: false,
      timeUp: false,
      ended: false,
      winner: -1,
      flash: 0,
      slowMo: 0,
      hitstop: 0,
      megaT: 0,
      orbTimer: mode === 'demo' ? 2.5 : 4.5,
      orbIdx: 0,
      orb: null,
      serveTo: 0,
      hoops: [
        { x: HH.HOOP_LX, y: HH.HOOP_Y, side: 0, iceT: 0, rattle: 0, netKick: 0 },
        { x: HH.HOOP_RX, y: HH.HOOP_Y, side: 1, iceT: 0, rattle: 0, netKick: 0 }
      ],
      players: [p0, p1],
      ball: {
        x: HH.W / 2,
        y: 260,
        vx: (mode === 'demo' ? 1 : -1) * 40,
        vy: -120,
        rot: 0,
        r: HH.BALL_R,
        hidden: false,
        holder: null,
        state: 'loose',
        shooter: null,
        pts: 2,
        perfect: false,
        superShot: false,
        magnet: false,
        touched: false,
        scoredT: 0,
        pickupLock: -1,
        pickupLockT: 0
      },
      events: []
    };

    if (mode !== 'demo') {
      giveBall(m, p0, true);
    }
    return m;
  };

  function giveBall(m, p, quiet) {
    var b = m.ball;
    b.hidden = false;
    b.holder = p;
    b.state = 'held';
    b.shooter = null;
    b.vx = 0;
    b.vy = 0;
    b.touched = false;
    b.perfect = false;
    b.superShot = false;
    b.magnet = false;
    b.x = p.x + p.facing * 24;
    b.y = p.y - 54;
    p.protect = 0.72;
    p.aimT = 0;
    if (!quiet) sfx('bounce');
  }
  HH.giveBall = giveBall;

  function resetPositions(m, serverIdx) {
    for (var i = 0; i < 2; i++) {
      var p = m.players[i];
      p.x = i === 0 ? 320 : HH.W - 320;
      p.y = HH.FLOOR;
      p.vx = 0;
      p.vy = 0;
      p.onGround = true;
      p.facing = i === 0 ? 1 : -1;
      p.aimT = 0;
      p.dashT = 0;
      p.blockT = 0;
      p.stunT = 0;
      p.dunk = null;
      p.latch.j = false;
      p.latch.sDown = false;
      p.latch.sUp = false;
    }
    var srv = m.players[serverIdx === 1 ? 1 : 0];
    giveBall(m, srv, true);
  }

  HH.canDunk = function (m, p) {
    if (!m || !p) return false;
    var hoop = m.hoops[1 - p.idx];
    var dist = Math.abs(hoop.x - p.x);
    if (p.super >= 100) return dist <= HH.SUPER_DIST;
    if (hoop.iceT > 0) return false;
    return dist <= HH.DUNK_DIST;
  };

  HH.latchKey = function (m, code, isDown) {
    if (!m || !m.players) return;
    var duo = m.mode === 'duo';
    var p0 = m.players[0], p1 = m.players[1];
    if (p0 && p0.ctrl === 'human') {
      var j0 = code === 'KeyW' || (!duo && (code === 'ArrowUp'));
      var s0 = code === 'Space' || code === 'KeyS' || code === 'KeyF' || (!duo && (code === 'Enter' || code === 'ArrowDown'));
      if (j0 && isDown) p0.latch.j = true;
      if (s0) {
        if (isDown) p0.latch.sDown = true;
        else p0.latch.sUp = true;
      }
    }
    if (duo && p1 && p1.ctrl === 'human') {
      var j1 = code === 'ArrowUp' || code === 'KeyI';
      var s1 = code === 'Enter' || code === 'ArrowDown' || code === 'Slash' || code === 'ShiftRight' || code === 'KeyL';
      if (j1 && isDown) p1.latch.j = true;
      if (s1) {
        if (isDown) p1.latch.sDown = true;
        else p1.latch.sUp = true;
      }
    }
  };

  function addSuper(m, p, amt) {
    if (!p || amt <= 0) return;
    var was = p.super >= 100;
    p.super = clamp(p.super + amt, 0, 100);
    if (!was && p.super >= 100) {
      p.superLit = true;
      sfx('fire');
      m.events.push({ type: 'superReady', who: p.idx, x: p.x, y: p.y - 95 });
    }
  }

  function startDunk(m, p) {
    var hoop = m.hoops[1 - p.idx];
    var opp = m.players[1 - p.idx];
    var isSuper = p.super >= 100;
    var dist = Math.abs(hoop.x - p.x);
    var pts = (isSuper && dist >= HH.THREE_DIST) ? 3 : 2;
    if (m.megaT > 0) pts += 1;
    if (isSuper) {
      p.super = 0;
      p.superLit = false;
      p.st.supers++;
      m.slowMo = 0.26;
      m.hitstop = 0.055;
      m.flash = 0.28;
      if (hoop.iceT > 0) {
        hoop.iceT = 0;
        m.events.push({ type: 'iceBreak', side: hoop.side, x: hoop.x, y: hoop.y });
      }
      if (Math.abs(opp.x - p.x) < 340 || Math.abs(opp.x - hoop.x) < 280) {
        var pushDir = opp.x < p.x ? -1 : 1;
        opp.vx = pushDir * 540;
        opp.vy = -360;
        opp.onGround = false;
        opp.stunT = 0.44;
      }
      sfx('superDunk');
      m.events.push({ type: 'superStart', who: p.idx, x: p.x, y: p.y - 60 });
    } else {
      sfx('jump');
    }

    p.facing = hoop.x > p.x ? 1 : -1;
    p.onGround = false;
    p.aimT = 0;
    p.protect = 0.9;
    p.dunk = {
      isSuper: isSuper,
      pts: pts,
      t: 0,
      dur: isSuper ? clamp(0.34 + dist / 2200, 0.36, 0.54) : clamp(0.26 + dist / 1400, 0.26, 0.38),
      sx: p.x,
      sy: p.y,
      tx: hoop.x - p.facing * 18,
      ty: hoop.y + 52
    };
  }

  function finishDunk(m, p) {
    var d = p.dunk;
    var hoop = m.hoops[1 - p.idx];
    p.dunk = null;
    p.vy = 120;
    p.vx = -p.facing * 110;
    p.st.dunks++;
    hoop.rattle = d.isSuper ? 1.35 : 0.95;
    hoop.netKick = 1.0;

    var b = m.ball;
    b.holder = null;
    b.state = 'loose';
    b.x = hoop.x;
    b.y = hoop.y + 24;
    b.vx = -p.facing * 45;
    b.vy = 260;
    b.touched = true;
    b.scoredT = 0.45;
    if (m.megaT > 0) m.megaT = 0;

    sfx(d.isSuper ? 'superDunk' : 'dunk');
    scoreBasket(m, p.idx, d.pts, { dunk: true, superDunk: d.isSuper, perfect: true });
  }

  function releaseShot(m, p, reason) {
    var b = m.ball;
    if (b.holder !== p) return;
    var hoop = m.hoops[1 - p.idx];
    var dist = Math.abs(hoop.x - p.x);
    var basePts = dist >= HH.THREE_DIST ? 3 : 2;
    var pts = basePts + (m.megaT > 0 ? 1 : 0);
    if (m.megaT > 0) m.megaT = 0;

    var nearApex = !p.onGround && Math.abs(p.vy) < 220;
    var sweetHold = p.aimT >= 0.14 && p.aimT <= 0.36;
    var usedMagnet = p.magnet > 0;
    if (usedMagnet) p.magnet = 0;
    var perfect = usedMagnet || nearApex || (reason === 'release' && sweetHold);

    var sx = p.x + p.facing * 20;
    var sy = p.y - 78;
    var T = clamp(0.62 + dist / 1420, 0.64, 0.98);

    var err = 0;
    if (!perfect) {
      if (p.ctrl === 'ai' && p.ai) {
        err = rand(-p.ai.cfg.errPx, p.ai.cfg.errPx);
      } else {
        var maxErr = m.diff === 0 ? 6.5 : m.diff === 1 ? 11.5 : 14.5;
        var shtBonus = clamp((p.ch.sht || 3) - 3, -1, 2) * 1.6;
        maxErr = Math.max(3.5, maxErr - shtBonus);
        err = rand(-maxErr, maxErr);
      }
    }

    var tx = hoop.x + err;
    var ty = hoop.y - 6;
    b.holder = null;
    b.hidden = false;
    b.state = 'shot';
    b.shooter = p;
    b.pts = pts;
    b.perfect = perfect;
    b.superShot = false;
    b.magnet = usedMagnet;
    b.touched = false;
    b.scoredT = 0;
    b.pickupLock = p.idx;
    b.pickupLockT = 0.34;
    b.x = sx;
    b.y = sy;
    b.vx = (tx - sx) / T;
    b.vy = (ty - sy - 0.5 * BALL_G * T * T) / T;

    p.aimT = 0;
    p.facing = hoop.x > p.x ? 1 : -1;
    if (perfect) addSuper(m, p, 12);
    sfx('shoot');
    m.events.push({
      type: 'shoot',
      who: p.idx,
      perfect: perfect,
      magnet: usedMagnet,
      pts: pts,
      x: p.x,
      y: p.y - 92
    });
  }
  HH.releaseShot = releaseShot;

  function performDefense(m, p) {
    if (p.stealCd > 0 || p.stunT > 0) return;
    var opp = m.players[1 - p.idx];
    var b = m.ball;

    if (!p.onGround) {
      p.blockT = 0.28;
      p.stealCd = 0.45;
      if (p.vy > -200) p.vy -= 170;
      sfx('dash');
      if (b.state === 'shot' && b.shooter === opp && Math.hypot(b.x - p.x, b.y - (p.y - 68)) <= 90) {
        var goingDownAtRim = b.vy > 120 && Math.abs(b.x - m.hoops[p.idx].x) < 65 && b.y < m.hoops[p.idx].y + 20;
        if (!goingDownAtRim) {
          b.state = 'loose';
          b.touched = true;
          b.magnet = false;
          b.vx = (p.idx === 0 ? 1 : -1) * 420;
          b.vy = -280;
          b.pickupLock = opp.idx;
          b.pickupLockT = 0.45;
          p.st.blocks++;
          addSuper(m, p, 28);
          m.hitstop = 0.045;
          sfx('block');
          m.events.push({ type: 'block', who: p.idx, x: b.x, y: b.y });
        }
      }
      return;
    }

    // Ground Dash-Steal: works cleanly from EITHER side within close range!
    var dir = b.holder === opp ? (opp.x >= p.x ? 1 : -1) : (b.x >= p.x ? 1 : -1);
    p.facing = dir || p.facing;
    p.dashT = 0.17;
    p.stealCd = 0.55;
    p.vx = p.facing * 590;
    sfx('dash');

    if (b.holder === opp && !opp.dunk && opp.protect <= 0) {
      var dx = Math.abs(opp.x - p.x);
      var dy = Math.abs(opp.y - p.y);
      if (dx <= 104 && dy <= 96) {
        opp.stunT = 0.24;
        opp.aimT = 0;
        opp.vx = -p.facing * 220;
        giveBall(m, p, true);
        p.st.steals++;
        addSuper(m, p, 22);
        sfx('steal');
        m.events.push({ type: 'steal', who: p.idx, x: p.x, y: p.y - 62 });
      }
    }
  }

  function scoreBasket(m, scorerIdx, pts, meta) {
    meta = meta || {};
    var att = m.players[scorerIdx];
    var def = m.players[1 - scorerIdx];
    var hoop = m.hoops[1 - scorerIdx];

    att.score += pts;
    att.st.pts += pts;
    if (pts >= 3 && !meta.dunk) att.st.threes++;
    if (!meta.superDunk) addSuper(m, att, meta.perfect ? 30 : 22);
    hoop.netKick = 1.0;
    hoop.rattle = Math.max(hoop.rattle, meta.dunk ? 1.0 : 0.45);
    m.flash = meta.superDunk ? 0.34 : 0.18;
    m.serveTo = 1 - scorerIdx;

    if (!meta.dunk) sfx('swish');
    m.events.push({
      type: 'score',
      who: scorerIdx,
      pts: pts,
      dunk: !!meta.dunk,
      superDunk: !!meta.superDunk,
      perfect: !!meta.perfect,
      x: hoop.x,
      y: hoop.y
    });

    // Exact end / buzzer / overtime contract:
    if (m.overtime || att.score >= m.target) {
      m.ended = true;
      m.winner = scorerIdx;
      m.phase = 'end';
      m.phaseT = 0.72;
      sfx('whistle');
      return;
    }

    if (m.timeUp) {
      if (att.score === def.score) {
        m.ended = false;
        m.winner = -1;
        m.pendingOT = true;
        m.phase = 'celebrate';
        m.phaseT = 0.72;
      } else {
        m.ended = true;
        m.winner = att.score > def.score ? att.idx : def.idx;
        m.phase = 'end';
        m.phaseT = 0.72;
        sfx('whistle');
      }
      return;
    }

    m.phase = 'celebrate';
    m.phaseT = 0.68;
  }

  function resolveTimeUpAfterMiss(m) {
    var p0 = m.players[0], p1 = m.players[1];
    if (p0.score === p1.score) {
      m.ended = false;
      m.winner = -1;
      m.pendingOT = true;
      m.phase = 'celebrate';
      m.phaseT = 0.65;
    } else {
      m.ended = true;
      m.winner = p0.score > p1.score ? 0 : 1;
      m.phase = 'end';
      m.phaseT = 0.72;
      sfx('whistle');
    }
  }

  function readHumanInput(m, p) {
    var k = typeof Kit !== 'undefined' && Kit && Kit.keys ? Kit.keys : null;
    var duo = m.mode === 'duo';
    var l = false, r = false, jDown = false, sDown = false;
    if (k) {
      if (p.idx === 0) {
        l = k.down('KeyA') || (!duo && k.down('ArrowLeft'));
        r = k.down('KeyD') || (!duo && k.down('ArrowRight'));
        jDown = k.down('KeyW') || (!duo && k.down('ArrowUp'));
        sDown = k.down('Space') || k.down('KeyS') || k.down('KeyF') || (!duo && (k.down('Enter') || k.down('ArrowDown')));
        if (k.pressed('KeyW') || (!duo && k.pressed('ArrowUp'))) p.latch.j = true;
        if (k.pressed('Space') || k.pressed('KeyS') || k.pressed('KeyF') || (!duo && (k.pressed('Enter') || k.pressed('ArrowDown')))) {
          p.latch.sDown = true;
        }
      } else {
        l = k.down('ArrowLeft') || k.down('KeyJ');
        r = k.down('ArrowRight') || k.down('KeyL');
        jDown = k.down('ArrowUp') || k.down('KeyI');
        sDown = k.down('Enter') || k.down('ArrowDown') || k.down('Slash') || k.down('ShiftRight');
        if (k.pressed('ArrowUp') || k.pressed('KeyI')) p.latch.j = true;
        if (k.pressed('Enter') || k.pressed('ArrowDown') || k.pressed('Slash') || k.pressed('ShiftRight')) {
          p.latch.sDown = true;
        }
      }
    }
    p.inp.l = !!l;
    p.inp.r = !!r;
    p.inp.j = !!(jDown || p.latch.j);
    p.inp.s = !!(sDown || p.latch.sDown);
  }

  function updateAI(m, p, dt) {
    var ai = p.ai;
    if (!ai) return;
    var cfg = ai.cfg;
    var opp = m.players[1 - p.idx];
    var b = m.ball;
    var myHoop = m.hoops[p.idx];
    var oppHoop = m.hoops[1 - p.idx];

    ai.thinkT -= dt;
    if (ai.shootT > 0) ai.shootT -= dt;
    if (ai.stealT > 0) ai.stealT -= dt;

    if (ai.thinkT <= 0) {
      ai.thinkT = cfg.react;
      ai.wantJump = false;
      ai.wantAct = false;

      if (b.holder === p) {
        var distToHoop = Math.abs(oppHoop.x - p.x);
        if (p.super >= 100 && distToHoop <= HH.SUPER_DIST - 40) {
          ai.wantAct = true;
        } else if (HH.canDunk(m, p) && rand(0, 1) < cfg.dunkChance) {
          ai.wantAct = true;
        } else if (m.orb && Math.abs(m.orb.x - p.x) < 220 && rand(0, 1) < cfg.orbSeek) {
          ai.wantX = m.orb.x;
          if (m.orb.y < HH.FLOOR - 95 && Math.abs(m.orb.x - p.x) < 70) ai.wantJump = true;
        } else {
          var idealDist = oppHoop.iceT > 0 ? 360 : (rand(0, 1) < 0.45 ? 210 : 490);
          ai.wantX = oppHoop.x + (p.idx === 0 ? -idealDist : idealDist);
          if (distToHoop < 540 && ai.shootT <= 0 && oppHoop.iceT <= 0.4) {
            if (p.onGround && rand(0, 1) < 0.65) ai.wantJump = true;
            ai.wantAct = true;
            ai.shootT = cfg.shootCd;
          }
        }
      } else if (b.holder === opp) {
        var guardX = opp.x + (myHoop.x > opp.x ? 68 : -68);
        ai.wantX = clamp(guardX, HH.LEFT_WALL + 40, HH.RIGHT_WALL - 40);
        if (Math.abs(opp.x - p.x) < 98 && opp.protect <= 0 && ai.stealT <= 0) {
          ai.wantAct = true;
          ai.stealT = cfg.stealCd;
        } else if (!opp.onGround && Math.abs(opp.x - p.x) < 130 && rand(0, 1) < cfg.blockChance) {
          ai.wantJump = true;
          ai.wantAct = true;
        }
      } else {
        ai.wantX = clamp(b.x, HH.LEFT_WALL + 30, HH.RIGHT_WALL - 30);
        if (b.y < HH.FLOOR - 110 && Math.abs(b.x - p.x) < 85 && b.vy > -80) {
          ai.wantJump = true;
          if (b.state === 'shot' && b.shooter === opp && rand(0, 1) < cfg.blockChance) ai.wantAct = true;
        }
      }
    }

    var dx = ai.wantX - p.x;
    p.inp.l = dx < -18;
    p.inp.r = dx > 18;
    if (ai.wantJump) { p.latch.j = true; ai.wantJump = false; }
    if (ai.wantAct) { p.latch.sDown = true; p.latch.sUp = true; ai.wantAct = false; }
    p.inp.j = p.latch.j;
    p.inp.s = p.latch.sDown;
  }

  function updatePlayer(m, p, dt) {
    p.animT += dt;
    if (p.rocketT > 0) p.rocketT = Math.max(0, p.rocketT - dt);
    if (p.stealCd > 0) p.stealCd = Math.max(0, p.stealCd - dt);
    if (p.dashT > 0) p.dashT = Math.max(0, p.dashT - dt);
    if (p.blockT > 0) p.blockT = Math.max(0, p.blockT - dt);
    if (p.stunT > 0) p.stunT = Math.max(0, p.stunT - dt);
    if (p.protect > 0) p.protect = Math.max(0, p.protect - dt);
    if (p.landSquash > 0) p.landSquash = Math.max(0, p.landSquash - dt * 5);

    // Passive Fire Super trickle (+ extra comeback juice when trailing)
    if (m.phase === 'play' && !p.dunk) {
      var opp = m.players[1 - p.idx];
      var rate = opp.score - p.score >= 4 ? 6.8 : 4.4;
      addSuper(m, p, rate * dt);
    }

    if (p.dunk) {
      var d = p.dunk;
      d.t += dt;
      var u = clamp(d.t / d.dur, 0, 1);
      var arcLift = Math.sin(u * Math.PI) * (d.isSuper ? 195 : 125);
      p.x = d.sx + (d.tx - d.sx) * u;
      p.y = d.sy + (d.ty - d.sy) * u - arcLift;
      p.vx = 0;
      p.vy = 0;
      if (m.ball.holder === p) {
        m.ball.x = p.x + p.facing * 24;
        m.ball.y = p.y - 78;
      }
      if (u >= 1) finishDunk(m, p);
      p.latch.j = false;
      p.latch.sDown = false;
      p.latch.sUp = false;
      return;
    }

    if (p.ctrl === 'ai') updateAI(m, p, dt);
    else readHumanInput(m, p);

    var spdMul = (p.rocketT > 0 ? 1.32 : 1) * (p.ctrl === 'ai' && p.ai ? p.ai.cfg.spdMul : 1);
    var maxSpd = (430 + (p.ch.spd || 3) * 26) * spdMul;
    var accel = p.onGround ? 3400 : 2400;

    // 100% FULL MOVEMENT SPEED EVEN WHILE AIMING/SHOOTING!
    if (p.stunT <= 0 && p.dashT <= 0) {
      var move = (p.inp.r ? 1 : 0) - (p.inp.l ? 1 : 0);
      if (move !== 0) {
        p.facing = move;
        var targetVx = move * maxSpd;
        if (p.vx < targetVx) p.vx = Math.min(targetVx, p.vx + accel * dt);
        else if (p.vx > targetVx) p.vx = Math.max(targetVx, p.vx - accel * dt);
      } else {
        var fric = p.onGround ? 2900 : 900;
        if (p.vx > 0) p.vx = Math.max(0, p.vx - fric * dt);
        else if (p.vx < 0) p.vx = Math.min(0, p.vx + fric * dt);
      }
    }

    // Jump (supports sub-frame tap via p.latch.j!)
    if ((p.latch.j || p.inp.j) && p.onGround && p.stunT <= 0) {
      var jmpMul = p.rocketT > 0 ? 1.26 : 1;
      p.vy = -(765 + (p.ch.jmp || 3) * 28) * jmpMul;
      p.onGround = false;
      p.landSquash = -0.35;
      sfx('jump');
    }

    // Action: Shoot / Slam Dunk / Super Dunk with ball, or Dash-Steal / Monster Block without!
    var actPressed = p.latch.sDown;
    var actReleased = p.latch.sUp;
    var actHeld = p.inp.s;

    if (m.ball.holder === p && p.stunT <= 0) {
      var oppHoop = m.hoops[1 - p.idx];
      p.facing = oppHoop.x > p.x ? 1 : -1;
      if (actPressed) {
        if (HH.canDunk(m, p)) {
          startDunk(m, p);
          p.latch.j = false;
          p.latch.sDown = false;
          p.latch.sUp = false;
          return;
        }
        p.aimT = 0.01;
      }
      if (p.aimT > 0) {
        p.aimT += dt;
        if (HH.canDunk(m, p) && p.super >= 100) {
          startDunk(m, p);
          p.latch.j = false;
          p.latch.sDown = false;
          p.latch.sUp = false;
          return;
        }
        if (actReleased || !actHeld) {
          releaseShot(m, p, p.aimT >= 0.13 ? 'release' : 'tap');
        } else if (p.aimT >= 0.44) {
          releaseShot(m, p, 'auto');
        }
      }
    } else if (actPressed && m.ball.holder !== p) {
      performDefense(m, p);
    }

    p.latch.j = false;
    p.latch.sDown = false;
    p.latch.sUp = false;

    // Integrate vertical & horizontal motion
    p.vy += GRAV * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.x < HH.LEFT_WALL) { p.x = HH.LEFT_WALL; if (p.vx < 0) p.vx = 0; }
    if (p.x > HH.RIGHT_WALL) { p.x = HH.RIGHT_WALL; if (p.vx > 0) p.vx = 0; }

    if (p.y >= HH.FLOOR) {
      if (!p.onGround && p.vy > 180) {
        p.landSquash = 0.42;
        sfx('land');
      }
      p.y = HH.FLOOR;
      p.vy = 0;
      p.onGround = true;
    }
  }

  function separatePlayers(m) {
    var a = m.players[0], b = m.players[1];
    if (a.dunk || b.dunk) return;
    var dx = b.x - a.x;
    var dy = Math.abs(b.y - a.y);
    var minDist = 66;
    if (Math.abs(dx) < minDist && dy < 88) {
      var sign = dx >= 0 ? 1 : -1;
      var push = (minDist - Math.abs(dx)) * 0.5;
      a.x = clamp(a.x - sign * push, HH.LEFT_WALL, HH.RIGHT_WALL);
      b.x = clamp(b.x + sign * push, HH.LEFT_WALL, HH.RIGHT_WALL);
    }
  }

  function applyOrb(m, p) {
    if (!m.orb) return;
    var kind = m.orb.id;
    var ox = m.orb.x, oy = m.orb.y;
    m.orb = null;
    m.orbTimer = 9.0;

    if (kind === 'mega') {
      m.megaT = 8.5;
      sfx('power');
    } else if (kind === 'ice') {
      m.hoops[p.idx].iceT = 5.0;
      sfx('ice');
    } else if (kind === 'rocket') {
      p.rocketT = 7.0;
      sfx('power');
    } else if (kind === 'magnet') {
      p.magnet = 1;
      sfx('power');
    }
    addSuper(m, p, 16);
    m.events.push({ type: 'power', who: p.idx, kind: kind, x: ox, y: oy });
  }

  function updateOrb(m, dt) {
    if (m.megaT > 0) m.megaT = Math.max(0, m.megaT - dt);
    for (var h = 0; h < 2; h++) {
      if (m.hoops[h].iceT > 0) m.hoops[h].iceT = Math.max(0, m.hoops[h].iceT - dt);
      if (m.hoops[h].rattle > 0) m.hoops[h].rattle = Math.max(0, m.hoops[h].rattle - dt * 2.4);
      if (m.hoops[h].netKick > 0) m.hoops[h].netKick = Math.max(0, m.hoops[h].netKick - dt * 3.2);
    }

    if (m.phase !== 'play' || m.timeUp || m.overtime) return;

    if (!m.orb) {
      m.orbTimer -= dt;
      if (m.orbTimer <= 0) {
        var id = POWER_IDS[m.orbIdx % POWER_IDS.length];
        m.orbIdx++;
        m.orb = {
          id: id,
          x: clamp(HH.W / 2 + rand(-150, 150), 470, 810),
          y: rand(392, 448),
          baseY: 420,
          t: 0,
          life: 11.0
        };
        m.orb.baseY = m.orb.y;
        m.events.push({ type: 'orbSpawn', kind: id, x: m.orb.x, y: m.orb.y });
      }
      return;
    }

    m.orb.t += dt;
    m.orb.life -= dt;
    m.orb.y = m.orb.baseY + Math.sin(m.orb.t * 4.2) * 10;
    if (m.orb.life <= 0) {
      m.orb = null;
      m.orbTimer = 7.5;
      return;
    }

    for (var i = 0; i < 2; i++) {
      var p = m.players[i];
      if (Math.hypot(p.x - m.orb.x, (p.y - 54) - m.orb.y) <= 62) {
        applyOrb(m, p);
        return;
      }
    }
    var b = m.ball;
    if (!b.holder && b.shooter && Math.hypot(b.x - m.orb.x, b.y - m.orb.y) <= 46) {
      applyOrb(m, b.shooter);
    }
  }

  function updateBall(m, dt) {
    var b = m.ball;
    b.r = m.megaT > 0 ? 25 : HH.BALL_R;
    if (b.scoredT > 0) b.scoredT = Math.max(0, b.scoredT - dt);
    if (b.pickupLockT > 0) b.pickupLockT = Math.max(0, b.pickupLockT - dt);

    if (b.state !== 'held') b.holder = null;
    if (b.holder) {
      var hp = b.holder;
      if (!hp.dunk) {
        var dribble = hp.onGround && Math.abs(hp.vx) > 25 ? Math.abs(Math.sin(hp.animT * 11)) * 18 : 0;
        b.x = hp.x + hp.facing * 26;
        b.y = hp.y - (hp.aimT > 0 ? 78 : 52 - dribble);
        b.rot += hp.vx * dt * 0.025;
      }
      return;
    }

    var prevX = b.x, prevY = b.y;
    if (b.magnet && b.state === 'shot' && b.shooter) {
      var targetHoop = m.hoops[1 - b.shooter.idx];
      var pullX = targetHoop.x - b.x;
      if (Math.abs(pullX) < 320 && b.y < targetHoop.y + 40) {
        b.vx += clamp(pullX * 9.5, -520, 520) * dt;
      }
    }

    b.vy += BALL_G * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.vx * dt * 0.022;

    // Side walls
    if (b.x - b.r < 54) { b.x = 54 + b.r; b.vx = Math.abs(b.vx) * 0.75; sfx('board'); }
    if (b.x + b.r > HH.W - 54) { b.x = HH.W - 54 - b.r; b.vx = -Math.abs(b.vx) * 0.75; sfx('board'); }

    // Backboards (left at x=98, right at x=1182, y in [185..318])
    for (var s = 0; s < 2; s++) {
      var hoop = m.hoops[s];
      var boardX = s === 0 ? hoop.x - 46 : hoop.x + 46;
      if (b.y + b.r > 182 && b.y - b.r < 318) {
        if (s === 0 && prevX - b.r >= boardX && b.x - b.r < boardX) {
          b.x = boardX + b.r;
          b.vx = Math.abs(b.vx) * 0.68 + 45;
          hoop.rattle = Math.max(hoop.rattle, 0.35);
          sfx('board');
        } else if (s === 1 && prevX + b.r <= boardX && b.x + b.r > boardX) {
          b.x = boardX - b.r;
          b.vx = -Math.abs(b.vx) * 0.68 - 45;
          hoop.rattle = Math.max(hoop.rattle, 0.35);
          sfx('board');
        }
      }

      // Ice Shield dome bounce!
      if (hoop.iceT > 0 && b.scoredT <= 0) {
        var idx = b.x - hoop.x, idy = b.y - (hoop.y - 8);
        var idist = Math.hypot(idx, idy);
        var shieldR = 46 + b.r;
        if (idist < shieldR && idist > 0.001) {
          var nx = idx / idist, ny = idy / idist;
          b.x = hoop.x + nx * shieldR;
          b.y = (hoop.y - 8) + ny * shieldR;
          var dot = b.vx * nx + b.vy * ny;
          if (dot < 0) {
            b.vx -= 1.75 * dot * nx;
            b.vy -= 1.75 * dot * ny;
          }
          b.vy = Math.min(b.vy, -190);
          b.touched = true;
          b.state = 'loose';
          b.magnet = false;
          sfx('ice');
          m.events.push({ type: 'iceBlock', side: s, x: hoop.x, y: hoop.y - 16 });
          continue;
        }
      }

      // Scoring cylinder check BEFORE rim collision if cleanly inside opening
      var isTargetHoop = b.state === 'shot' && b.shooter && (1 - b.shooter.idx === s);
      if (isTargetHoop && b.scoredT <= 0 && hoop.iceT <= 0) {
        if (prevY <= hoop.y && b.y >= hoop.y && b.vy > 0 && Math.abs(b.x - hoop.x) <= HH.RIM_R - 3) {
          b.scoredT = 0.5;
          b.state = 'loose';
          b.touched = true;
          b.vx *= 0.25;
          b.vy = Math.max(190, b.vy * 0.55);
          scoreBasket(m, b.shooter.idx, b.pts || 2, { perfect: b.perfect, dunk: false });
          return;
        }
      }

      // Rim outer edge bounce (front & back iron)
      var rims = [hoop.x - HH.RIM_R, hoop.x + HH.RIM_R];
      for (var rIdx = 0; rIdx < 2; rIdx++) {
        var rx = rims[rIdx], ry = hoop.y;
        var rdx = b.x - rx, rdy = b.y - ry;
        var rd = Math.hypot(rdx, rdy);
        var minR = b.r + 5;
        if (rd < minR && rd > 0.001 && b.scoredT <= 0) {
          var rnx = rdx / rd, rny = rdy / rd;
          b.x = rx + rnx * minR;
          b.y = ry + rny * minR;
          var rdot = b.vx * rnx + b.vy * rny;
          if (rdot < 0) {
            b.vx -= 1.62 * rdot * rnx;
            b.vy -= 1.62 * rdot * rny;
          }
          hoop.rattle = Math.max(hoop.rattle, 0.45);
          sfx('clank');
        }
      }
    }

    // Floor collision (marks in-flight shots as touched/missed!)
    if (b.y >= HH.FLOOR - HH.BALL_R) {
      b.y = HH.FLOOR - HH.BALL_R;
      if (Math.abs(b.vy) > 90) sfx('bounce');
      b.vy = -Math.abs(b.vy) * 0.62;
      if (Math.abs(b.vy) < 75) b.vy = 0;
      b.vx *= 0.86;
      b.touched = true;
      b.magnet = false;
      if (b.state === 'shot') b.state = 'loose';
    }

    // Player ball pickup & head bonk when loose
    if (m.phase === 'play' && !m.timeUp && b.scoredT <= 0) {
      for (var i = 0; i < 2; i++) {
        var p = m.players[i];
        if (p.stunT > 0) continue;
        if (b.pickupLock === i && b.pickupLockT > 0) continue;
        if (b.state === 'shot' && b.shooter === p && !b.touched) continue;
        // Don't auto-grab an enemy shot high above players unless defender actively blocks
        if (b.state === 'shot' && !b.touched && b.y < p.y - 92 && p.blockT <= 0) continue;
        if (Math.hypot(b.x - p.x, b.y - (p.y - 52)) <= 56) {
          giveBall(m, p, false);
          return;
        }
      }
    }
  }

  HH.stepMatch = function (m, rawDt) {
    if (!m || m.done) return;
    var dt = clamp(+rawDt || 1 / 60, 0, 0.05);
    m.clock += dt;
    if (m.flash > 0) m.flash = Math.max(0, m.flash - dt);

    if (m.hitstop > 0) {
      m.hitstop = Math.max(0, m.hitstop - dt);
      return;
    }
    if (m.slowMo > 0) {
      m.slowMo = Math.max(0, m.slowMo - dt);
      dt *= 0.42;
    }

    if (m.phase === 'intro') {
      m.phaseT -= dt;
      updateOrb(m, dt * 0.2);
      if (m.phaseT <= 0) {
        m.phase = 'play';
        m.phaseT = 0;
        sfx('whistle');
      }
      return;
    }

    if (m.phase === 'celebrate') {
      m.phaseT -= dt;
      updateBall(m, dt);
      updateOrb(m, dt * 0.5);
      if (m.phaseT <= 0) {
        if (m.pendingOT) {
          m.pendingOT = false;
          m.overtime = true;
          m.timeUp = false;
          m.phase = 'play';
          resetPositions(m, m.serveTo);
          sfx('whistle');
          m.events.push({ type: 'overtime' });
        } else {
          m.phase = 'play';
          resetPositions(m, m.serveTo);
        }
      }
      return;
    }

    if (m.phase === 'end') {
      m.phaseT -= dt;
      updateBall(m, dt);
      if (m.phaseT <= 0) {
        m.done = true;
        m.events.push({ type: 'end', winner: m.winner });
      }
      return;
    }

    // Active 'play' phase
    if (!m.overtime && !m.timeUp && m.mode !== 'demo') {
      var prevSec = Math.ceil(m.time);
      m.time -= dt;
      var nextSec = Math.ceil(m.time);
      if (m.time > 0 && m.time <= 5 && nextSec < prevSec) sfx('tick');
      if (m.time <= 0) {
        m.time = 0;
        m.timeUp = true;
        sfx('buzzer');
        m.events.push({ type: 'buzzer' });
      }
    } else if (m.mode === 'demo') {
      m.time -= dt;
      if (m.time <= 0 || m.players[0].score >= 99 || m.players[1].score >= 99) {
        m.time = 60;
        m.players[0].score = 0;
        m.players[1].score = 0;
      }
    }

    // Only allow new player inputs if clock hasn't expired (during buzzer flight, ball finishes its arc!)
    if (!m.timeUp) {
      updatePlayer(m, m.players[0], dt);
      updatePlayer(m, m.players[1], dt);
      separatePlayers(m);
    } else {
      // Finish an already-started dunk at the buzzer
      for (var di = 0; di < 2; di++) {
        if (m.players[di].dunk) updatePlayer(m, m.players[di], dt);
      }
    }

    updateOrb(m, dt);
    updateBall(m, dt);

    // If timer expired and no live untouched shot/dunk remains in flight, decide tie->OT or winner!
    if (m.timeUp && !m.ended && m.phase === 'play') {
      var shotAlive = (m.ball.state === 'shot' && !m.ball.touched) || !!(m.players[0].dunk || m.players[1].dunk);
      if (!shotAlive) {
        resolveTimeUpAfterMiss(m);
      }
    }
  };
})();
