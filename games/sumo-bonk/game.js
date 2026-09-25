/* Sumo Bonk — main game: wobbly physics, combat, CPU, rounds, screens. */
(function () {
  'use strict';

  var W = 1280, H = 720;
  var GRAV = 2400, R = 50, CR = 46, WATER_Y = 640, STEP = 1 / 60;
  var JUMPV = 930, DASHV = 900, DASH_T = 0.27, WINDUP_T = 0.085;
  var DIVE_VX = 640, DIVE_VY = 1150;
  var WIN_SCORE = 5, SD_TIME = 15;
  var CPU_WINDUP = { easy: 0.25, medium: 0.15, hard: 0.1 };
  var SA = window.SBArt, SFX = window.SBSound, MUSIC = SFX.music;
  var SUMOS = SA.SUMOS, HATS = SA.HATS;
  var FONT = 'Fredoka, "Segoe UI Rounded", "Segoe UI", system-ui, sans-serif';
  var OUT = SA.OUT;
  var clamp = Kit.clamp, rand = Kit.rand;

  /* ================================================================ setup */
  var canvas = document.getElementById('game');
  var uiEl = document.getElementById('ui');
  var skyCache = document.createElement('canvas');
  var skyTheme = null, skyDirty = true;
  var view = Kit.fit(canvas, W, H, { onResize: onResize });
  var ctx = view.ctx;
  var store = Kit.store('sumo-bonk');

  function onResize(v) {
    var s = v.scale;
    uiEl.style.left = v.canvas.style.left;
    uiEl.style.top = v.canvas.style.top;
    uiEl.style.transform = 'scale(' + s + ')';
    skyDirty = true;
    sizeMiniCanvases && sizeMiniCanvases();
  }
  var sizeMiniCanvases = null;

  /* ================================================================= save */
  var save = {
    stars: store.get('stars', 0),
    wins: store.get('wins', { easy: 0, medium: 0, hard: 0, pvp: 0 }),
    special: store.get('special', {}),
    picks: store.get('picks', { s0: 0, h0: 1, s1: 1, h1: 1 }),
    mode: store.get('mode', 1),
    diff: store.get('diff', 'easy'),
    streak: store.get('streak', 0),
    bestStreak: store.get('bestStreak', 0),
    matches: store.get('matches', 0),
    bonks: store.get('bonks', 0),
    music: store.get('music', true),
    seenHats: store.get('seenHats', 2),
    beaten: store.get('beaten', {})
  };
  var DIFF_LV = { easy: 1, medium: 2, hard: 3 };
  var DIFF_AR = { easy: 'السهل', medium: 'المتوسط', hard: 'الصعب' };
  function medals() { var n = 0; for (var i = 0; i < 8; i++) n += save.beaten[i] || 0; return n; }
  function persist() {
    ['stars', 'wins', 'special', 'picks', 'mode', 'diff', 'streak', 'bestStreak', 'matches', 'bonks', 'music', 'seenHats', 'beaten'].forEach(function (k) { store.set(k, save[k]); });
  }
  function hatUnlocked(i) {
    var h = HATS[i]; if (!h) return false;
    if (h.special) return !!save.special[h.special];
    return save.stars >= h.stars;
  }
  function unlockedCount() { var n = 0; for (var i = 0; i < HATS.length; i++) if (hatUnlocked(i)) n++; return n; }
  function nextHat() {
    var best = null;
    for (var i = 0; i < HATS.length; i++) { var h = HATS[i]; if (!h.special && save.stars < h.stars && (!best || h.stars < best.stars)) best = h; }
    return best;
  }
  function diffUnlocked(d) { return d === 'easy' || (d === 'medium' && save.wins.easy > 0) || (d === 'hard' && save.wins.medium > 0); }
  MUSIC.on = save.music;

  /* ============================================================== effects */
  var PMAX = 420, parts = [], pIdx = 0;
  for (var pi = 0; pi < PMAX; pi++) parts.push({ on: false });
  function spawn(kind, x, y, vx, vy, life, size, color, g, rot, vr) {
    var q = parts[pIdx]; pIdx = (pIdx + 1) % PMAX;
    q.on = true; q.kind = kind; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = life; q.max = life;
    q.size = size; q.color = color; q.g = g || 0; q.rot = rot || 0; q.vr = vr || 0;
    return q;
  }
  function burst(kind, x, y, n, o) {
    for (var i = 0; i < n; i++) {
      var a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || 1) : Math.random() * Math.PI * 2;
      var sp = (o.speed || 200) * (0.35 + Math.random() * 0.65);
      spawn(kind, x, y, Math.cos(a) * sp, Math.sin(a) * sp, (o.life || 0.6) * (0.6 + Math.random() * 0.5), (o.size || 6) * (0.6 + Math.random() * 0.7),
        o.colors ? o.colors[(Math.random() * o.colors.length) | 0] : o.color, o.g == null ? 600 : o.g, Math.random() * 6, (Math.random() - 0.5) * 12);
    }
  }
  function updateParts(dt) {
    for (var i = 0; i < PMAX; i++) {
      var q = parts[i]; if (!q.on) continue;
      q.life -= dt; if (q.life <= 0) { q.on = false; continue; }
      q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      if (q.kind === 'dust' || q.kind === 'ring') { q.vx *= 1 - 3 * dt; q.vy *= 1 - 3 * dt; }
      if (q.kind === 'confetti') { q.vx *= 1 - 1.5 * dt; q.vx += Math.sin(q.rot * 2) * 30 * dt; if (q.vy > 160) q.vy = 160; }
      if (q.kind === 'leaf' || q.kind === 'snow') { q.vx += (arena ? arena.wind : 0) * 0.3 * dt; q.vx *= 1 - 0.5 * dt; }
      if (q.kind === 'drop' && q.y > WATER_Y + 4 && q.vy > 0) q.on = false;
    }
  }
  function drawParts(c) {
    for (var i = 0; i < PMAX; i++) {
      var q = parts[i]; if (!q.on) continue;
      var t = q.life / q.max;
      c.globalAlpha = Math.min(1, t * 2);
      switch (q.kind) {
        case 'star': SA.star(c, q.x, q.y, q.size * (0.5 + t * 0.5), q.rot, q.color, OUT, 2.5); break;
        case 'dust': c.globalAlpha = t * 0.8; SA.circ(c, q.x, q.y, q.size * (1.6 - t * 0.6)); c.fillStyle = q.color; c.fill(); break;
        case 'ring': c.globalAlpha = t; SA.ell(c, q.x, q.y, q.size * (1.8 - t), q.size * (1.8 - t) * (q.vr || 1)); c.strokeStyle = q.color; c.lineWidth = 6 * t + 1; c.stroke(); break;
        case 'confetti': c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.scale(1, Math.cos(q.rot * 3)); c.fillStyle = q.color; c.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2); c.restore(); break;
        case 'drop': SA.ell(c, q.x, q.y, q.size * 0.7, q.size); c.fillStyle = q.color; c.fill(); break;
        case 'streak': c.globalAlpha = t * 0.6; c.strokeStyle = q.color; c.lineWidth = q.size; SA.line(c, q.x, q.y, q.x - q.vx * 0.06, q.y - q.vy * 0.06); break;
        case 'leaf': c.save(); c.translate(q.x, q.y); c.rotate(q.rot); SA.ell(c, 0, 0, q.size, q.size * 0.5); c.fillStyle = q.color; c.fill(); c.restore(); break;
        case 'crumb': c.fillStyle = q.color; c.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size); break;
        default: SA.circ(c, q.x, q.y, q.size * (0.4 + t * 0.6)); c.fillStyle = q.color; c.fill();
      }
    }
    c.globalAlpha = 1;
  }

  var popups = [];
  function popup(text, x, y, color, size) {
    if (popups.length > 6) popups.shift();
    size = size || 54;
    ctx.font = '700 ' + size + 'px ' + FONT;
    var hw = Math.min(W / 2 - 10, ctx.measureText(text).width * 0.72 + 16);
    popups.push({ hw: hw, text: text, x: clamp(x, hw, W - hw), y: clamp(y, 90, H - 60), t: 0, life: 0.95, color: color || '#ffe14a', size: size || 54, rot: rand(-0.18, 0.18) });
  }
  var banner = null;
  function showBanner(text, sub, color, life, size) { banner = { text: text, sub: sub || '', color: color || '#ffe14a', t: 0, life: life || 1.2, size: size || 96 }; }

  var shake = Kit.shake();
  var cam = { x: W / 2, y: H / 2, z: 1, punch: 0 };
  var hitstop = 0, timeScale = 1, slowT = 0, flash = 0, hype = 0;

  /* ============================================================== players */
  function newPlayer(idx) {
    return {
      idx: idx, x: 0, y: 0, vx: 0, vy: 0, f: idx ? -1 : 1, dir: 1, grounded: false, plat: null, lx: 0, noSnap: 0,
      action: 'none', t: 0, jb: 0, sb: 0, canDive: true, hits: 0, out: false, splashed: false, splashT: 0,
      spin: 0, sumo: idx, hat: 1, cpu: false, level: 'easy', ai: { think: 0, plan: null, planT: 0, saw: false },
      lean: 0, leanV: 0, sq: 0, sqV: 0, sqRest: 0, bx: 0, bxV: 0, by: 0, byV: 0, hx: 0, hxV: 0, hy: 0, hyV: 0,
      armF: 0.3, armFV: 0, armB: -0.2, armBV: 0, pv: 50, hatTilt: 0, hatV: 0, blink: 0, blinkT: 2, lookX: 0, lookY: 0,
      mood: 'idle', legMode: 'stand', legPh: 0, dizzy: 0, sweat: false, teeter: false, teeterT: 0, T: rand(0, 5),
      pvx: 0, pvy: 0, tails: null, floatX: 0, label: 'P' + (idx + 1)
    };
  }
  var P = [newPlayer(0), newPlayer(1)];

  function initTails(p) {
    var a = SA.localToWorld(p, SA.HEAD_X + p.hx - 29, SA.HEAD_Y + p.hy - 12);
    p.tails = [];
    for (var i = 0; i < 5; i++) p.tails.push({ x: a.x - p.f * i * 8, y: a.y + i * 4, px: a.x - p.f * i * 8, py: a.y + i * 4 });
  }
  function resetPlayer(p, x, y, f) {
    p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.f = f; p.dir = f; p.grounded = false; p.plat = null; p.noSnap = 0;
    p.action = 'none'; p.t = 0; p.jb = 0; p.sb = 0; p.canDive = true; p.hits = 0; p.out = false; p.splashed = false; p.splashT = 0;
    p.spin = 0; p.lean = 0; p.leanV = 0; p.sq = 0; p.sqV = 0; p.bx = p.by = p.hx = p.hy = 0; p.bxV = p.byV = p.hxV = p.hyV = 0;
    p.pv = 0; p.brake = false; p.teeter = false; p.voidT = 0; p.wasHit = false; p.teeterT = 0; p.dizzy = 0; p.ai.plan = null; p.ai.saw = false; p.pvx = 0; p.pvy = 0;
    initTails(p);
  }

  /* =============================================================== arenas */
  var ARENA_TYPES = ['classic', 'shrink', 'ice', 'seesaw', 'moving', 'bouncy', 'windy', 'gap'];
  var ARENA_INFO = {
    classic: { name: 'حلبة السومو', tip: 'ادفع خصمك خارج الحلبة!' },
    shrink: { name: 'الحلبة المتقلصة', tip: 'الحلبة تصغر وتصغر!' },
    ice: { name: 'حلبة الجليد', tip: 'أرض زلقة جدا!' },
    seesaw: { name: 'لوح التوازن', tip: 'اللوح يميل تحت وزنك!' },
    moving: { name: 'السحابة الطائرة', tip: 'السحابة تتحرك يمينا ويسارا!' },
    bouncy: { name: 'الترامبولين', tip: 'اضغط قفز لحظة الهبوط لقفزة خارقة!' },
    windy: { name: 'قمة الرياح', tip: 'انتبه لاتجاه الريح!' },
    gap: { name: 'انتبه للفجوة', tip: 'لا تسقط في المنتصف!' }
  };
  function plat(kind, x, y, w, h, o) {
    var p = { kind: kind, x: x, y: y, w: w, h: h, a: 0, av: 0, fric: 6, bounce: 0, dx: 0, dy: 0, vx: 0, vy: 0, anchor: 0, minW: 220, bx: x, by: y, crack: 0, dips: null };
    if (o) for (var k in o) p[k] = o[k];
    return p;
  }
  function makeArena(type) {
    var A = { type: type, t: 0, mt: 0, wind: 0, windTarget: 0, windT: 1.4, windWarn: 0, windNext: 1, knock: 1, knockUp: 1, jump: 1, sd: false,
      theme: 'day', plats: [], start: [470, 810], waterY: WATER_Y, lowTop: 440, crumbT: 0 };
    A.name = ARENA_INFO[type].name; A.tip = ARENA_INFO[type].tip;
    switch (type) {
      case 'classic': A.theme = 'day'; A.plats = [plat('dohyo', 640, 440, 780, 30)]; break;
      case 'shrink': A.theme = 'sunset'; A.plats = [plat('dohyo', 640, 440, 880, 30, { minW: 240, crack: 1 })]; A.start = [455, 825]; break;
      case 'ice': A.theme = 'snow'; A.plats = [plat('ice', 640, 440, 800, 30, { fric: 1.1 })]; A.knock = 0.82; break;
      case 'seesaw': A.theme = 'pink'; A.plats = [plat('plank', 640, 432, 860, 22, { minW: 320 })]; break;
      case 'moving': A.theme = 'dusk'; A.plats = [plat('cloud', 640, 424, 600, 20, { minW: 240 })]; A.start = [500, 780]; break;
      case 'bouncy': A.theme = 'candy'; A.plats = [plat('tramp', 640, 440, 760, 20, { bounce: 0.78, dips: [], minW: 260 })]; A.jump = 1.22; A.knockUp = 1.35; break;
      case 'windy': A.theme = 'windy'; A.plats = [plat('grass', 640, 440, 780, 30)]; break;
      case 'gap':
        A.theme = 'lagoon';
        A.plats = [plat('pillar', 435, 446, 290, WATER_Y + 40 - 446, { anchor: 1, minW: 110 }), plat('pillar', 845, 446, 290, WATER_Y + 40 - 446, { anchor: -1, minW: 110 })];
        A.start = [455, 825];
        break;
    }
    return A;
  }
  var arena = makeArena('classic');

  function platTopAt(x) {
    for (var i = 0; i < arena.plats.length; i++) { var pl = arena.plats[i]; if (Math.abs(x - pl.x) <= pl.w / 2 + 2) return pl.y; }
    return null;
  }
  function overPlatform(x, margin) {
    for (var i = 0; i < arena.plats.length; i++) { var pl = arena.plats[i]; if (Math.abs(x - pl.x) <= pl.w / 2 * Math.cos(pl.a) - (margin || 0)) return true; }
    return false;
  }

  function updateArena(dt, live) {
    var A = arena; A.t += dt;
    for (var i = 0; i < A.plats.length; i++) {
      var pl = A.plats[i], ox = pl.x, oy = pl.y;
      if (A.type === 'moving') { A.mt += live ? dt : dt * 0.4; pl.x = pl.bx + 200 * Math.sin(A.mt * 0.9); pl.y = pl.by + 16 * Math.sin(A.mt * 1.8); }
      if (A.type === 'seesaw') {
        var torque = 0;
        for (var k = 0; k < 2; k++) { var p = P[k]; if (p.grounded && p.plat === pl) torque += p.lx; }
        pl.av += (torque * 0.0042 - pl.a * 2.4 - pl.av * 1.8) * dt;
        pl.a += pl.av * dt;
        if (pl.a > 0.3) { pl.a = 0.3; pl.av = Math.min(0, pl.av); }
        if (pl.a < -0.3) { pl.a = -0.3; pl.av = Math.max(0, pl.av); }
      }
      var shrinkRate = 0;
      if (live && A.type === 'shrink' && A.t > 1.5) shrinkRate = A.sd ? 45 : 30;
      else if (live && A.sd) shrinkRate = 26;
      var minW = roundT > 25 ? pl.minW * 0.5 : pl.minW;
      if (live && roundT > 25) shrinkRate = Math.max(shrinkRate, 26);
      if (shrinkRate && pl.w > minW) {
        var d = Math.min(shrinkRate * dt, pl.w - minW);
        pl.w -= d; pl.x += pl.anchor * d / 2; pl.bx += pl.anchor * d / 2;
        A.crumbT -= dt;
        if (A.crumbT <= 0) {
          A.crumbT = 0.07;
          var edges = pl.anchor ? [pl.x - pl.anchor * pl.w / 2] : [pl.x - pl.w / 2, pl.x + pl.w / 2];
          for (var e = 0; e < edges.length; e++) spawn('crumb', edges[e] + rand(-6, 6), pl.y + rand(0, 20), rand(-40, 40), rand(-60, 20), 0.9, rand(5, 10), Math.random() < 0.5 ? '#b07a4a' : '#e0b377', 1200, 0, 0);
        }
      }
      if (pl.dips) {
        for (var j = pl.dips.length - 1; j >= 0; j--) { var dp = pl.dips[j]; dp.t += dt; dp.a = dp.a0 * Math.exp(-5 * dp.t) * Math.cos(dp.t * 18); if (dp.t > 1.2) pl.dips.splice(j, 1); }
      }
      pl.dx = pl.x - ox; pl.dy = pl.y - oy;
      pl.vx = dt > 0 ? pl.dx / dt : 0; pl.vy = dt > 0 ? pl.dy / dt : 0;
    }
    // wind
    if (A.type === 'windy') {
      if (live) {
        A.windT -= dt;
        if (A.windT < 0.9 && !A.windWarn) { A.windWarn = 1; A.windNext = A.windTarget === 0 ? (Math.random() < 0.5 ? 1 : -1) : -Math.sign(A.windTarget); if (Math.random() < 0.25 && A.windTarget) A.windNext = Math.sign(A.windTarget); }
        if (A.windT <= 0) { A.windTarget = A.windNext * 680; A.windT = rand(3.2, 4.8); A.windWarn = 0; if (sfxOn()) SFX.wind(); }
      } else A.windTarget = 0;
      A.wind += (A.windTarget - A.wind) * Math.min(1, dt * 2.5);
      if (Math.abs(A.wind) > 80 && Math.random() < Math.abs(A.wind) / 680 * 0.9) {
        var sx = A.wind > 0 ? -20 : W + 20;
        spawn('streak', sx, rand(60, 620), A.wind * 1.4, rand(-10, 10), 1.3, rand(2, 4), 'rgba(255,255,255,0.9)', 0);
        if (Math.random() < 0.3) spawn('leaf', sx, rand(100, 600), A.wind * 0.9, rand(-40, 40), 2, rand(5, 8), Math.random() < 0.5 ? '#6fd36a' : '#ffc84a', 60, 0, rand(-8, 8));
      }
    }
    if (A.type === 'ice' && Math.random() < 0.35) spawn('snow', rand(-40, W + 40), -10, rand(-20, 20), rand(40, 90), 8, rand(2.5, 5), '#ffffff', 5);
    var low = 0;
    for (var m = 0; m < A.plats.length; m++) { var q = A.plats[m]; low = Math.max(low, q.y + Math.abs(Math.sin(q.a)) * q.w / 2); }
    A.lowTop = low;
  }

  /* ============================================================= match state */
  var scr = 'title';            // title | select | game | over
  var paused = false;
  var mode = save.mode;         // 1 = vs CPU, 2 = two players
  var diff = diffUnlocked(save.diff) ? save.diff : 'easy';
  var demo = true;
  var score = [0, 0], roundNo = 0, bag = [];
  var phase = 'intro', phaseT = 0, roundT = 0, endT = 0, resolved = false, roundWinner = -1, matchWinner = -1;
  var stats = { bonks: [0, 0], perfect: [0, 0], draws: 0 };
  var forcedArena = null;
  var T = 0;
  var overData = null;
  var roundLog = [];
  var firstMatch = !save.matches;

  function sfxOn() { return !demo; }

  function pickArena() {
    if (forcedArena) { var f = forcedArena; forcedArena = null; return f; }
    if (!demo && roundNo === 1) return 'classic';
    if (!bag.length) {
      bag = Kit.shuffle(ARENA_TYPES.filter(function (t) { return t !== 'classic'; }));
      if (demo) bag.push('classic');
      if (arena && bag[bag.length - 1] === arena.type) bag.unshift(bag.pop());
    }
    return bag.pop();
  }

  function beginRound() {
    arena = makeArena(pickArena());
    if (skyTheme !== arena.theme) skyDirty = true;
    for (var i = 0; i < 2; i++) {
      var sx = arena.start[i], top = platTopAt(sx) || 440;
      resetPlayer(P[i], sx, top - R - 300 - i * 30, i ? -1 : 1);
    }
    phase = 'intro'; phaseT = 0; roundT = 0; endT = 0; resolved = false; roundWinner = -1;
    timeScale = 1; slowT = 0; popups.length = 0;
    for (var q = 0; q < PMAX; q++) { var pq = parts[q]; if (pq.on && (pq.kind === 'snow' || pq.kind === 'leaf' || pq.kind === 'streak' || pq.kind === 'crumb')) pq.on = false; }
    cam.x = W / 2; cam.y = H / 2; cam.z = 1;
    if (!demo) {
      var sub = arena.tip;
      if (score[0] === WIN_SCORE - 1 || score[1] === WIN_SCORE - 1) sub = 'نقطة الفوز!';
      showBanner('الجولة ' + roundNo, arena.name + '  •  ' + sub, '#ffffff', 1.05, 92);
    }
  }

  function startMatch() {
    demo = false; scr = 'game'; paused = false;
    score = [0, 0]; roundNo = 1; bag = [];
    stats = { bonks: [0, 0], perfect: [0, 0], draws: 0 };
    P[0].sumo = save.picks.s0; P[0].hat = hatUnlocked(save.picks.h0) ? save.picks.h0 : 0;
    P[0].cpu = false; P[0].label = mode === 1 ? 'أنت' : 'لاعب 1';
    if (mode === 1) {
      P[1].cpu = true; P[1].level = diff; P[1].label = 'الكمبيوتر';
      P[1].sumo = cpuPick.sumo; P[1].hat = cpuPick.hat;
    } else {
      P[1].cpu = false; P[1].label = 'لاعب 2'; P[1].sumo = save.picks.s1; P[1].hat = hatUnlocked(save.picks.h1) ? save.picks.h1 : 0;
    }
    MUSIC.play(128, false);
    beginRound();
    showScreen(null);
  }

  function startDemo() {
    demo = true; score = [0, 0]; roundNo = 1; bag = [];
    var a = Kit.randInt(0, 7), b = (a + Kit.randInt(1, 7)) % 8;
    P[0].sumo = a; P[1].sumo = b;
    P[0].hat = Kit.randInt(0, HATS.length - 1); P[1].hat = Kit.randInt(0, HATS.length - 1);
    P[0].cpu = P[1].cpu = true; P[0].level = P[1].level = 'medium';
    P[0].label = P[1].label = '';
    beginRound();
  }

  /* ============================================================== physics */
  function groundCheck(p) {
    var prevPlat = p.grounded ? p.plat : null;
    p.grounded = false;
    if (p.out) { p.plat = null; return; }
    var best = null;
    for (var i = 0; i < arena.plats.length; i++) {
      var pl = arena.plats[i]; if (pl.w < 4) continue;
      var c = Math.cos(pl.a), s = Math.sin(pl.a);
      var rx = p.x - pl.x, ry = p.y - pl.y;
      var lx = rx * c + ry * s, ly = -rx * s + ry * c;
      var vlx = p.vx * c + p.vy * s, vly = -p.vx * s + p.vy * c;
      var half = pl.w / 2, feet = ly + R;
      var stick = prevPlat === pl && p.noSnap <= 0 && feet >= -14 && vly > -80;
      var land = feet >= -1 && vly >= -1 && p.noSnap <= 0;
      if (Math.abs(lx) <= half + 2 && feet <= 30 && (stick || land)) {
        var landing = prevPlat !== pl;
        ly = -R;
        if (landing && pl.bounce && vly > 380) {
          var bv = Math.min(1500, vly * pl.bounce);
          if (p.jb > 0 && p.action === 'none') { bv = Math.max(bv, JUMPV * 1.4); p.jb = 0; if (sfxOn()) SFX.superJump(); popup('قفزة خارقة!', p.x, p.y - 90, '#7de3ff', 40); }
          vly = -bv; p.noSnap = 0.06;
          if (pl.dips.length < 6) pl.dips.push({ x: p.x, a: 0, a0: Math.min(34, bv * 0.03), t: 0 });
          if (sfxOn()) SFX.tramp();
          p.sqV += bv * 0.004;
          p.canDive = true;
          if (p.action === 'dive') { p.action = 'none'; shockwave(p, 1.3); }
          best = null;
          p.x = pl.x + lx * c - ly * s; p.y = pl.y + lx * s + ly * c;
          p.vx = vlx * c - vly * s; p.vy = vlx * s + vly * c;
          p.bounced = true;
          continue;
        }
        if (vly > 0) vly = 0;
        p.x = pl.x + lx * c - ly * s; p.y = pl.y + lx * s + ly * c;
        p.vx = vlx * c - vly * s; p.vy = vlx * s + vly * c;
        p.grounded = true; p.plat = pl; p.lx = lx; p.half = half; best = pl;
      } else if (feet > 30 && ly < pl.h + 10 && Math.abs(lx) < half + CR * 0.75) {
        var side = lx < 0 ? -1 : 1;
        lx = side * (half + CR * 0.75);
        if (vlx * side < 0) vlx = 0;
        p.x = pl.x + lx * c - ly * s; p.y = pl.y + lx * s + ly * c;
        p.vx = vlx * c - vly * s; p.vy = vlx * s + vly * c;
      }
    }
    if (!best) p.plat = null;
  }

  function applyFriction(p, dt) {
    var pl = p.plat; if (!pl) return;
    var c = Math.cos(pl.a), s = Math.sin(pl.a);
    var vlx = p.vx * c + p.vy * s, vly = -p.vx * s + p.vy * c;
    vlx *= Math.exp(-(p.brake ? Math.max(pl.fric, 9) : pl.fric) * dt);
    if (Math.abs(vlx) < 3) vlx = 0;
    p.vx = vlx * c - vly * s; p.vy = vlx * s + vly * c;
  }

  function dust(x, y, n, spread, col) {
    burst('dust', x, y, n, { angle: -Math.PI / 2, spread: spread || 2.6, speed: 160, life: 0.5, size: 9, color: col || 'rgba(255,255,255,0.85)', g: -40 });
  }

  function doJump(p) {
    var pl = p.plat;
    p.vy = -JUMPV * arena.jump;
    p.vx += p.f * 70;
    if (pl) { p.vx += pl.vx; if (pl.vy < 0) p.vy += pl.vy; }
    p.grounded = false; p.plat = null; p.noSnap = 0.08; p.jb = 0; p.sb = 0; p.canDive = true;
    p.sqV -= 4.5;
    if (sfxOn()) SFX.jump();
    dust(p.x, p.y + R, 6);
  }
  function startWindup(p) {
    p.action = 'windup'; p.t = p.cpu && !demo ? CPU_WINDUP[p.level] || WINDUP_T : WINDUP_T; p.dir = p.f; p.sb = 0; p.jb = 0;
    p.leanV -= p.f * 3;
    if (sfxOn()) SFX.hup();
  }
  function startDash(p) {
    p.action = 'dash'; p.t = DASH_T; p.vx = p.dir * DASHV; p.vy = 0;
    p.sqV -= 2.5; p.leanV += p.dir * 6;
    if (sfxOn()) SFX.dash();
    burst('dust', p.x - p.dir * 30, p.y + R - 6, 7, { angle: p.dir > 0 ? Math.PI : 0, spread: 0.9, speed: 260, life: 0.45, size: 10, color: 'rgba(255,255,255,0.85)', g: -30 });
  }
  function startDive(p) {
    p.action = 'dive'; p.dir = p.f; p.vx = p.dir * DIVE_VX; p.vy = Math.max(p.vy, 250); p.canDive = false; p.sb = 0;
    p.leanV += p.dir * 10;
    if (sfxOn()) SFX.dive();
  }

  function shockwave(p, power) {
    var o = P[1 - p.idx];
    shake.add(8 * power);
    burst('dust', p.x, p.y + R - 4, 14, { angle: -Math.PI / 2, spread: 3.2, speed: 380, life: 0.5, size: 11, color: 'rgba(255,255,255,0.9)', g: 100 });
    spawn('ring', p.x, p.y + R - 4, 0, 0, 0.4, 70 * power, 'rgba(255,255,255,0.9)', 0, 0, 0.25);
    if (o.out || o.splashed || !o.grounded || o.action === 'stun') return;
    if (Math.abs(o.x - p.x) < 175 * power && Math.abs(o.y - p.y) < 60) {
      var dir = o.x >= p.x ? 1 : -1;
      o.vx += dir * 300 * power; o.vy = -400 * power * arena.jump;
      o.grounded = false; o.plat = null; o.noSnap = 0.08; o.action = 'stun'; o.t = 0.22; o.spin = dir * 4;
      o.hits += 0.5;
      popup('زلزال!', o.x, o.y - 100, '#9ff0ff', 40);
      if (sfxOn()) SFX.boing();
    }
  }

  function onLand(p, v) {
    p.canDive = true;
    if (p.voidT > 0.1 && p.wasHit && !demo) {
      popup(Math.random() < 0.5 ? 'نجاة!' : 'كاد يسقط!', p.x, p.y - 110, '#b6ff7a', 44);
      if (sfxOn()) SFX.cheer(false);
      hype = 1;
    }
    p.voidT = 0; p.wasHit = false;
    if (p.spin) { p.spin = 0; p.lean = Math.atan2(Math.sin(p.lean), Math.cos(p.lean)); }
    if (p.plat && p.plat.a !== undefined && arena.type === 'seesaw') p.plat.av += p.lx * v * 0.0000035;
    if (p.action === 'dive') {
      p.action = 'faceplant'; p.t = 0.32; p.vx *= 0.3;
      p.sqV += 6;
      if (sfxOn()) SFX.slamLand();
      shockwave(p, 1);
      return;
    }
    if (v > 260) {
      p.sqV += Math.min(7, v * 0.0045);
      p.bxV += (Math.random() - 0.5) * 60; p.byV += v * 0.08;
      dust(p.x, p.y + R - 2, Math.min(10, 2 + (v / 150) | 0));
      if (sfxOn()) SFX.land(v);
      if (v > 900) shake.add(4);
    }
  }

  function markOut(p) {
    if (p.out) return;
    p.outInfo = { t: +roundT.toFixed(2), act: p.action, x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), hits: p.hits, o: P[1 - p.idx].action };
    p.out = true; p.outT = T; p.action = 'fall'; p.grounded = false; p.plat = null;
    var o = P[1 - p.idx];
    if (sfxOn()) SFX.fall();
    if (phase === 'fight' && !o.out) {
      timeScale = 0.35; slowT = 0.55;
      // the survivor puts the brakes on so a finished dash doesn't carry them off too
      if (o.action === 'dash' || o.action === 'windup') { o.action = 'recover'; o.t = 0.25; o.vx *= 0.25; }
      o.brake = true;
    }
  }

  function splash(p) {
    p.splashed = true; p.splashT = 0;
    var sx = clamp(p.x, 40, W - 40);
    p.floatX = clamp(p.x, 90, W - 90);
    burst('drop', sx, WATER_Y, 34, { angle: -Math.PI / 2, spread: 1.4, speed: 900, life: 1.1, size: 8, colors: ['#ffffff', '#bdf0ff', '#8fdcff'], g: 1800 });
    burst('drop', sx, WATER_Y, 14, { angle: -Math.PI / 2, spread: 2.6, speed: 420, life: 0.9, size: 6, color: '#e8fbff', g: 1400 });
    spawn('ring', sx, WATER_Y + 4, 0, 0, 0.7, 60, '#ffffff', 0, 0, 0.22);
    spawn('ring', sx, WATER_Y + 4, 0, 0, 1.0, 100, 'rgba(255,255,255,0.7)', 0, 0, 0.22);
    shake.add(7);
    if (sfxOn()) { SFX.splash(); SFX.cheer(true); }
    popup('طرطشة!', sx, WATER_Y - 120, '#8fdcff', 70);
    hype = 1;
  }

  var HIT_WORDS = ['بوم!', 'طاخ!', 'دبّ!', 'بف!', 'ترااخ!', 'بوم!', 'بونغ!'];
  function hit(a, b, kind) {
    var dir = b.x >= a.x ? 1 : -1;
    if (Math.abs(b.x - a.x) < 6) dir = a.dir || a.f;
    var sc = Math.min(2.4, 1 + 0.22 * b.hits) * arena.knock;
    var counter = b.action === 'windup' || b.action === 'recover' || b.action === 'faceplant';
    if (counter) sc *= 1.12;
    var kx = kind === 'dive' ? 490 : 440, ky = kind === 'dive' ? 250 : 300;
    b.vx = dir * kx * sc; b.vy = -ky * arena.knockUp * (0.9 + 0.1 * sc);
    b.action = 'stun'; b.t = 0.3; b.grounded = false; b.plat = null; b.noSnap = 0.1; b.canDive = true;
    b.spin = dir * (5 + 4 * sc); b.hits += 1; b.wasHit = true; b.voidT = 0;
    b.sqV -= 3; b.bxV += dir * 200; b.hxV += dir * 150;
    if (kind === 'dash') { a.vx = dir * 120; a.action = 'recover'; a.t = 0.14; a.sqV += 3; }
    else { a.vy = -640; a.vx = -dir * 110; a.action = 'none'; a.canDive = true; a.noSnap = 0.1; a.grounded = false; }
    a.bxV -= dir * 120;
    var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2 - 10;
    hitstop = 0.06 + 0.025 * sc; shake.add(9 + 5 * sc); cam.punch = 0.045 * sc; flash = 0.18;
    burst('star', cx, cy, 9, { speed: 520, life: 0.6, size: 13, colors: ['#ffe14a', '#ffffff', '#ffb3d9'], g: 700 });
    burst('dot', cx, cy, 10, { speed: 380, life: 0.35, size: 7, color: '#ffffff', g: 0 });
    spawn('ring', cx, cy, 0, 0, 0.3, 60, '#ffffff', 0, 0, 1);
    var word = kind === 'dive' ? 'ضربة البطن!' : counter ? 'ضربة مضادة!' : HIT_WORDS[(Math.random() * HIT_WORDS.length) | 0];
    popup(word, cx, cy - 70, kind === 'dive' ? '#ff9ad5' : '#ffe14a', kind === 'dive' ? 50 : 62);
    if (sfxOn()) { SFX.bonk(sc); if (sc > 1.3) SFX.cheer(false); }
    hype = Math.min(1, hype + 0.6);
    if (!demo) stats.bonks[a.idx]++;
  }
  function clash(a, b) {
    var dir = b.x >= a.x ? 1 : -1;
    a.vx = -dir * 440; b.vx = dir * 440; a.vy = b.vy = -270;
    [a, b].forEach(function (p) { p.action = 'recover'; p.t = 0.22; p.grounded = false; p.plat = null; p.noSnap = 0.1; p.sqV += 5; p.canDive = true; });
    a.leanV -= dir * 8; b.leanV += dir * 8;
    var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    hitstop = 0.1; shake.add(14); flash = 0.25; cam.punch = 0.06;
    burst('star', cx, cy, 14, { speed: 600, life: 0.7, size: 14, colors: ['#ffe14a', '#7de3ff', '#ffffff'], g: 500 });
    spawn('ring', cx, cy, 0, 0, 0.4, 90, '#ffffff', 0, 0, 1);
    popup('تصادم البطون!', cx, cy - 90, '#7de3ff', 56);
    if (sfxOn()) SFX.clash();
    hype = 1;
  }
  function stomp(top, bot) {
    top.vy = -820; top.vx *= 0.5; top.action = 'none'; top.canDive = true; top.noSnap = 0.1; top.grounded = false;
    bot.action = 'stun'; bot.t = 0.45; bot.sqV += 8; if (bot.vy < 100) bot.vy = 100; bot.hits += 0.5;
    var cx = bot.x, cy = bot.y - 70;
    hitstop = 0.05; shake.add(7);
    burst('star', cx, cy, 8, { angle: -Math.PI / 2, spread: 2.4, speed: 380, life: 0.55, size: 11, colors: ['#ffe14a', '#ffffff'], g: 800 });
    popup('على الرأس!', cx, cy - 50, '#b6ff7a', 46);
    if (sfxOn()) SFX.stomp();
    hype = Math.min(1, hype + 0.4);
  }

  var pairCD = 0;
  function isAttacking(p, nx) {
    if (p.action === 'dash') return p.dir * nx > -0.3;
    if (p.action === 'dive') return true;
    return false;
  }
  function collide(a, b) {
    if (a.splashed || b.splashed || a.out || b.out) return;
    var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d >= CR * 2) return;
    var nx = d > 0.01 ? dx / d : (a.f || 1), ny = d > 0.01 ? dy / d : 0;
    var ov = CR * 2 - d;
    a.x -= nx * ov / 2; a.y -= ny * ov / 2 * (a.grounded ? 0 : 1);
    b.x += nx * ov / 2; b.y += ny * ov / 2 * (b.grounded ? 0 : 1);
    if (pairCD > 0) return;
    // falling onto a head
    if (Math.abs(dy) > Math.abs(dx) * 1.15) {
      var top = dy > 0 ? a : b, bot = dy > 0 ? b : a;
      if (top.vy - bot.vy > 150 && top.action !== 'dive') { stomp(top, bot); pairCD = 0.2; return; }
    }
    var aA = isAttacking(a, nx), bA = isAttacking(b, -nx);
    if (aA && bA) { clash(a, b); pairCD = 0.25; return; }
    if (aA) { hit(a, b, a.action); pairCD = 0.22; return; }
    if (bA) { hit(b, a, b.action); pairCD = 0.22; return; }
    var vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vrel < 0) {
      var j = -(1 + 0.9) * vrel / 2;
      a.vx -= j * nx; a.vy -= j * ny * (a.grounded ? 0 : 1);
      b.vx += j * nx; b.vy += j * ny * (b.grounded ? 0 : 1);
      if (-vrel > 180) {
        if (sfxOn()) SFX.boing();
        a.bxV -= nx * 160; b.bxV += nx * 160;
        pairCD = 0.12;
      }
    }
    if (a.grounded && b.grounded) { a.vx -= nx * 70; b.vx += nx * 70; }
  }

  /* ================================================================== AI */
  var AI = {
    easy: { react: 0.36, tick: 0.12, dodge: 0.3, aggr: 0.45, punish: 0.3, dive: 0.3, edge: 0.3, feint: 0.15, clash: 0.05 },
    medium: { react: 0.22, tick: 0.09, dodge: 0.6, aggr: 0.9, punish: 0.65, dive: 0.6, edge: 0.7, feint: 0.08, clash: 0.12 },
    hard: { react: 0.13, tick: 0.06, dodge: 0.85, aggr: 1.3, punish: 0.95, dive: 0.85, edge: 0.95, feint: 0.04, clash: 0.2 }
  };
  function aiInput(p, o, dt) {
    var inp = { j: false, s: false };
    var ai = p.ai, L = AI[p.level] || AI.easy;
    var react = L.react, dodge = L.dodge;
    if (!demo && mode === 1) {
      var lead = score[0] - score[1];
      if (lead >= 2) { react *= 0.85; dodge = Math.min(0.95, dodge + 0.08); }
      if (lead <= -3) { react *= 1.15; dodge *= 0.9; }
    }
    if (ai.plan) {
      ai.planT -= dt;
      if (ai.planT <= 0) { if (ai.plan === 'jump') inp.j = true; else inp.s = true; ai.plan = null; }
      return inp;
    }
    if (p.out) return inp;
    ai.think -= dt;
    var dx = o.x - p.x, adx = Math.abs(dx), dir = dx >= 0 ? 1 : -1;
    // threat detection runs every frame so reactions are consistent
    var threat = (o.action === 'windup' || o.action === 'dash') && o.dir === -dir && adx < 470 && !o.out && Math.abs(o.y - p.y) < 80;
    if (!threat) ai.saw = false;
    if (threat && !ai.saw && p.grounded && (p.action === 'none' || p.action === 'recover')) {
      ai.saw = true;
      var tc = (o.action === 'windup' ? o.t : 0) + Math.max(0, adx - CR * 2) / DASHV;
      var r = Math.random();
      if (r < dodge) { ai.plan = 'jump'; ai.planT = Math.max(react * rand(0.75, 1.2), tc - 0.36); return inp; }
      if (r < dodge + L.clash) { ai.plan = 'slam'; ai.planT = react * 0.8; return inp; }
      ai.plan = null;
    }
    if (ai.think > 0) return inp;
    ai.think = L.tick * rand(0.7, 1.3);
    if (p.action !== 'none') return inp;
    if (p.grounded) {
      if (threat) return inp;
      var want = L.aggr * L.tick;
      if (o.action === 'stun' || o.action === 'recover' || o.action === 'faceplant') want *= 1 + 4 * L.punish;
      if (!o.grounded && o.vy < -100) want *= 0.15;
      else if (!o.grounded) want *= 0.35;
      if (o.out) want = 0;
      // don't chase someone who is already flying off the stage
      if (!o.grounded && !overPlatform(o.x, -20) && Math.random() < L.edge) want = 0;
      var helpless = o.grounded && (o.action === 'stun' || o.action === 'faceplant');
      var endX = p.x + dir * 300;
      if (!overPlatform(endX, 10) && !helpless) want *= 1 - L.edge;
      if (Math.random() < want) { ai.plan = 'slam'; ai.planT = react * 0.3; return inp; }
      if (Math.random() < L.feint * L.tick) { ai.plan = 'jump'; ai.planT = 0; return inp; }
      if (p.teeter && Math.random() < 0.3 && overPlatform(p.x + dir * 80, 0)) { ai.plan = 'jump'; ai.planT = 0; }
    } else if (p.canDive) {
      var overVoid = !overPlatform(p.x, -10);
      var towardSafe = overPlatform(p.x + p.f * 140, 0);
      if (overVoid && p.vy > 0 && towardSafe && Math.random() < L.dive + 0.1) { inp.s = true; return inp; }
      if (o.y > p.y + 20 && adx < 280 && adx > 20 && p.vy > -250 && !o.out && Math.random() < L.dive * 0.5) {
        var top = platTopAt(p.x) || arena.plats[0].y;
        var fallT = Math.max(0.05, (top - (p.y + R)) / 900);
        if (overPlatform(p.x + p.f * DIVE_VX * fallT, 20) || Math.random() > L.edge) inp.s = true;
      }
    }
    return inp;
  }

  /* ============================================================== player step */
  function humanInput(p) {
    var k = Kit.keys;
    if (mode === 1) return { j: k.anyPressed(['KeyW', 'ArrowUp']), s: k.anyPressed(['KeyS', 'ArrowDown']) };
    if (p.idx === 0) return { j: k.pressed('KeyW'), s: k.pressed('KeyS') };
    return { j: k.pressed('ArrowUp'), s: k.pressed('ArrowDown') };
  }

  function updatePlayer(p, o, dt, controls) {
    p.T += dt;
    if (p.noSnap > 0) p.noSnap -= dt;
    if (p.jb > 0) p.jb -= dt;
    if (p.sb > 0) p.sb -= dt;
    var inp = { j: false, s: false };
    if (controls && !p.out && !o.out) inp = p.cpu ? aiInput(p, o, dt) : humanInput(p);
    if (inp.j) p.jb = 0.13;
    if (inp.s) p.sb = 0.13;

    if (p.splashed) { floatStep(p, dt); return; }

    // facing
    if (!p.out && (p.action === 'none' || p.action === 'recover' || p.action === 'win') && Math.abs(o.x - p.x) > 10) {
      var nf = o.x > p.x ? 1 : -1;
      if (nf !== p.f) { p.f = nf; p.sqV += 2.5; }
    }
    switch (p.action) {
      case 'windup': p.t -= dt; if (p.t <= 0) startDash(p); break;
      case 'dash':
        p.t -= dt; p.vx = p.dir * DASHV; p.vy = 0;
        if (Math.random() < 0.5) spawn('dust', p.x - p.dir * 40, p.y + R - 8 + rand(-6, 6), -p.dir * 60, rand(-30, 0), 0.35, rand(6, 10), 'rgba(255,255,255,0.75)', -20);
        if (p.t <= 0) { p.action = 'recover'; p.t = 0.16; p.vx = p.dir * 250; }
        break;
      case 'dive':
        p.vx = p.dir * DIVE_VX; p.vy = Math.min(DIVE_VY, p.vy + 4200 * dt);
        if (Math.random() < 0.6) spawn('streak', p.x - p.dir * 30, p.y - 20 + rand(-20, 20), -p.dir * 200, -300, 0.3, 3, 'rgba(255,255,255,0.9)', 0);
        break;
      case 'recover': case 'stun': case 'faceplant':
        p.t -= dt; if (p.t <= 0) p.action = 'none'; break;
    }
    if (p.action === 'none' && controls && !p.out && !o.out) {
      if (p.grounded) { if (p.jb > 0) doJump(p); else if (p.sb > 0) startWindup(p); }
      else if (p.sb > 0 && p.canDive) startDive(p);
    }
    // forces
    if (p.action !== 'dash' && p.action !== 'dive') p.vy += GRAV * dt;
    if (arena.wind && !p.out) p.vx += arena.wind * dt * (p.grounded ? 0.45 : 1);
    if (!p.grounded) p.vx *= 1 - 0.2 * dt;
    if (p.grounded && p.plat) { p.x += p.plat.dx; p.y += p.plat.dy; }
    var wasG = p.grounded, prevVy = p.vy;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.bounced = false;
    groundCheck(p);
    if (p.grounded && !wasG) onLand(p, prevVy);
    if (p.grounded && p.action !== 'dash') applyFriction(p, dt);
    // teeter at edges
    p.teeter = false;
    if (p.grounded && p.plat && (p.action === 'none' || p.action === 'recover') && p.half - Math.abs(p.lx) < 20) {
      p.teeter = true; p.teeterT += dt;
      if (p.teeterT > 0.35 && Math.random() < dt * 3 && sfxOn()) SFX.teeter();
      if (p.teeterT > 0.12 && p.teeterT - dt <= 0.12 && !demo) popup('انتبه!', p.x, p.y - 120, '#ffffff', 36);
    } else p.teeterT = Math.max(0, p.teeterT - dt * 2);
    if (p.spin) { p.spin *= 1 - 1.2 * dt; }
    if (!p.grounded && !p.out && !overPlatform(p.x, 0)) p.voidT = (p.voidT || 0) + dt;
    // out of play?
    if (!p.out && !p.grounded) {
      if (p.y - R > arena.lowTop + 35 || p.x < -150 || p.x > W + 150) markOut(p);
    }
    if (p.out && p.y > WATER_Y - 20) splash(p);
  }

  function floatStep(p, dt) {
    p.splashT += dt;
    var ty = WATER_Y - 12 + Math.sin(p.splashT * 3) * 4;
    if (p.splashT < 0.45) { p.y += 400 * dt; p.vy = -380; }
    else { p.vy += (ty - p.y) * 60 * dt; p.vy *= 1 - 5 * dt; p.y += p.vy * dt; }
    p.x += (p.floatX - p.x) * Math.min(1, dt * 3);
    p.lean = Math.sin(p.splashT * 2.2) * 0.12; p.leanV = 0;
    p.action = 'float';
  }

  function spring(p, key, vkey, target, K, C, dt) {
    var a = -K * (p[key] - target) - C * p[vkey];
    p[vkey] += a * dt; p[key] += p[vkey] * dt;
  }

  function updateVis(p, o, dt) {
    var t = p.T, f = p.f;
    var leanT = 0, aF = 0.35 + Math.sin(t * 2.3) * 0.08, aB = -0.28 + Math.sin(t * 2.3 + 1) * 0.06;
    var mood = 'idle', legs = 'stand', sqRest = 0, direct = false;
    p.sweat = false;
    if (p.splashed) {
      mood = p.idx === roundWinner ? 'happy' : 'dizzy'; legs = 'float';
      aF = 2.6 + Math.sin(t * 6) * 0.4; aB = 2.4 + Math.cos(t * 6) * 0.4;
      if (resolved && p.idx !== roundWinner) { mood = 'sad'; aF = 0.9 + Math.sin(t * 3) * 0.2; aB = 0.7; }
    } else if (p.out) {
      mood = 'scared'; legs = 'air'; aF = 2.7 + Math.sin(t * 28) * 0.5; aB = 2.5 + Math.cos(t * 28) * 0.5;
    } else {
      switch (p.action) {
        case 'windup': leanT = -0.2 * f; aF = -0.9; aB = -1.0; mood = 'angry'; sqRest = 0.2; break;
        case 'dash': leanT = 0.34 * f; aF = 1.55; aB = 1.3; mood = 'angry'; legs = 'run'; sqRest = -0.06; break;
        case 'dive': leanT = 1.2 * f; aF = 2.2; aB = 1.9; mood = 'angry'; legs = 'dive'; break;
        case 'stun':
          mood = p.grounded ? 'dizzy' : 'hurt'; aF = 2.3 + Math.sin(t * 22) * 0.6; aB = 2.1 + Math.cos(t * 19) * 0.6;
          legs = p.grounded ? 'stand' : 'air'; break;
        case 'faceplant': leanT = 0.95 * f; mood = 'dizzy'; aF = 1.6; aB = 1.4; break;
        case 'recover': leanT = 0.1 * f; break;
        case 'win': mood = 'win'; aF = 2.8 + Math.sin(t * 10) * 0.25; aB = 2.8 + Math.cos(t * 10) * 0.25; legs = p.grounded ? 'stomp' : 'air'; break;
        default:
          if (!p.grounded) { mood = 'air'; aF = 1.8 + Math.sin(t * 16) * 0.35; aB = 2.0 + Math.cos(t * 16) * 0.35; legs = 'air'; }
          else if (p.teeter) {
            mood = 'scared'; p.sweat = true; legs = 'teeter'; direct = true;
            var side = p.lx >= 0 ? 1 : -1;
            leanT = side * (0.22 + Math.sin(t * 9) * 0.1);
            p.armF = t * 15; p.armB = t * 15 + Math.PI;
          }
      }
    }
    if (p.plat && p.grounded) leanT += p.plat.a * 0.5;
    if (p.jb > 0 && p.action !== 'none') mood = mood === 'idle' ? 'angry' : mood;
    p.mood = mood; p.legMode = legs;
    if (legs === 'run') p.legPh += dt * 32;
    p.dizzy = (p.action === 'faceplant' || (p.action === 'stun' && p.grounded) || (p.splashed && p.idx !== roundWinner && !resolved)) ? 1 : 0;

    // lean / tumble
    if (Math.abs(p.spin) > 1.2 && !p.grounded) { p.lean += p.spin * dt; p.leanV = 0; }
    else spring(p, 'lean', 'leanV', leanT, 150, 9, dt);
    // squash
    spring(p, 'sq', 'sqV', sqRest, 320, 13, dt);
    p.sq = clamp(p.sq, -0.35, 0.45);
    // belly & head jiggle driven by acceleration
    var dvx = clamp(p.vx - p.pvx, -1200, 1200), dvy = clamp(p.vy - p.pvy, -1500, 1500);
    p.pvx = p.vx; p.pvy = p.vy;
    p.bxV -= dvx * 0.16 * f; p.byV -= dvy * 0.08;
    spring(p, 'bx', 'bxV', 0, 230, 7, dt);
    spring(p, 'by', 'byV', Math.sin(t * 2.2) * 1.2, 230, 7, dt);
    p.bx = clamp(p.bx, -14, 14); p.by = clamp(p.by, -10, 10);
    p.hxV -= dvx * 0.1 * f; p.hyV -= dvy * 0.05;
    spring(p, 'hx', 'hxV', 0, 260, 10, dt);
    spring(p, 'hy', 'hyV', 0, 260, 10, dt);
    p.hx = clamp(p.hx, -9, 9); p.hy = clamp(p.hy, -8, 8);
    // arms
    if (!direct) { spring(p, 'armF', 'armFV', aF, 180, 12, dt); spring(p, 'armB', 'armBV', aB, 160, 11, dt); }
    else { p.armFV = 0; p.armBV = 0; }
    // hat
    spring(p, 'hatTilt', 'hatV', -p.hxV * 0.004 - p.leanV * 0.02, 120, 6, dt);
    p.hatTilt = clamp(p.hatTilt, -0.5, 0.5);
    // pivot (feet when grounded)
    p.pv += ((p.grounded ? 50 : 0) - p.pv) * Math.min(1, dt * 10);
    // blink & look
    p.blinkT -= dt; if (p.blink > 0) p.blink -= dt;
    if (p.blinkT <= 0) { p.blink = 0.12; p.blinkT = rand(1.8, 4.5); }
    p.lookX = clamp((o.x - p.x) * f / 220, -1, 1); p.lookY = clamp((o.y - p.y) / 160, -1, 1);
    // headband tails (verlet rope)
    var a = SA.localToWorld(p, SA.HEAD_X + p.hx - 29, SA.HEAD_Y + p.hy - 12);
    var tl = p.tails;
    if (!tl) { initTails(p); tl = p.tails; }
    tl[0].x = a.x; tl[0].y = a.y;
    var wind = (arena && !p.splashed ? arena.wind : 0) * 0.35;
    for (var i = 1; i < tl.length; i++) {
      var q = tl[i], vx = (q.x - q.px) * 0.93, vy = (q.y - q.py) * 0.93;
      q.px = q.x; q.py = q.y;
      q.x += vx + (-f * 500 + wind) * dt * dt; q.y += vy + 700 * dt * dt;
    }
    for (var it = 0; it < 3; it++) {
      for (var j = 1; j < tl.length; j++) {
        var p0 = tl[j - 1], p1 = tl[j], ddx = p1.x - p0.x, ddy = p1.y - p0.y, dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        var diffL = (dd - 8) / dd;
        if (j === 1) { p1.x -= ddx * diffL; p1.y -= ddy * diffL; }
        else { p0.x += ddx * diffL * 0.5; p0.y += ddy * diffL * 0.5; p1.x -= ddx * diffL * 0.5; p1.y -= ddy * diffL * 0.5; }
      }
    }
  }

  /* ============================================================ round step */
  function step(dt) {
    T += dt;
    var live = phase === 'fight';
    var controls = live;
    if (phase === 'intro') {
      phaseT += dt;
      if (phaseT > 0.95 && phaseT - dt <= 0.95) { if (!demo) showBanner('استعد...', '', '#ffffff', 0.62, 110); if (sfxOn()) SFX.ready(); }
      if (phaseT >= 1.6) { phase = 'fight'; if (!demo) showBanner('هيا!', '', '#ffe14a', 0.6, 140); if (sfxOn()) SFX.go(); }
    } else if (phase === 'fight') {
      roundT += dt;
      if (roundT >= SD_TIME && !arena.sd) {
        arena.sd = true;
        if (!demo) { showBanner('أسرع!', 'الحلبة بدأت تصغر!', '#ff5a5f', 1.2, 90); SFX.siren(); }
      }
    } else if (phase === 'end') {
      endT += dt;
      if (!resolved && endT > 0.5) resolveRound();
      if (resolved && endT > (demo ? 1.6 : 2.3)) { afterRound(); return; }
    }
    updateArena(dt, live);
    var a = P[0], b = P[1];
    updatePlayer(a, b, dt, controls);
    updatePlayer(b, a, dt, controls);
    if (pairCD > 0) pairCD -= dt;
    collide(a, b);
    // celebration hops for the round winner
    if (phase === 'end' && resolved && roundWinner >= 0) {
      var w = P[roundWinner];
      if (!w.out) { if (w.action === 'none' || w.action === 'recover') w.action = 'win'; if (w.grounded && Math.random() < dt * 2.2) { w.vy = -560; w.grounded = false; w.noSnap = 0.08; } }
    }
    updateVis(a, b, dt); updateVis(b, a, dt);
    if (phase === 'fight' && (a.splashed || b.splashed)) { phase = 'end'; endT = 0; }
    if (phase === 'fight' && roundT > 40) { markOut(a); markOut(b); }
  }

  function resolveRound() {
    resolved = true;
    var aOut = P[0].out, bOut = P[1].out;
    arena.windTarget = 0;
    // both fell: whoever went out FIRST loses (bonking your rival off and tumbling after them still scores);
    // only a truly simultaneous fall is a double splash
    if (aOut && bOut && Math.abs(P[0].outT - P[1].outT) >= 0.06) {
      if (P[0].outT < P[1].outT) bOut = false; else aOut = false;
    }
    if (aOut && bOut) {
      roundWinner = -1;
      roundLog.push({ arena: arena.type, t: +roundT.toFixed(2), winner: -1, hits: [P[0].hits, P[1].hits], out: [P[0].outInfo, P[1].outInfo] }); if (roundLog.length > 300) roundLog.shift();
      if (!demo) { showBanner('سقطة مزدوجة!', 'لا نقاط لأحد، جولة جديدة!', '#8fdcff', 1.4, 84); SFX.draw(); stats.draws++; }
      return;
    }
    roundWinner = aOut ? 1 : 0;
    if (demo) return;
    score[roundWinner]++;
    var w = P[roundWinner];
    if (w.hits === 0) stats.perfect[roundWinner]++;
    roundLog.push({ arena: arena.type, t: +roundT.toFixed(2), winner: roundWinner, hits: [P[0].hits, P[1].hits] }); if (roundLog.length > 300) roundLog.shift();
    var name = mode === 1 ? (roundWinner === 0 ? 'نقطة لك!' : 'نقطة للكمبيوتر!') : 'نقطة للاعب ' + (roundWinner + 1) + '!';
    var sub = w.hits === 0 ? 'جولة مثالية!' : (score[roundWinner] === WIN_SCORE - 1 ? 'نقطة الفوز!' : '');
    if (score[roundWinner] >= WIN_SCORE) { name = 'الضربة القاضية!'; sub = ''; }
    showBanner(name, sub, SUMOS[w.sumo].body, 1.6, 84);
    SFX.point();
    hudPop[roundWinner] = 1;
    burst('confetti', W / 2 + (roundWinner ? 170 : -170), 40, 26, { angle: Math.PI / 2, spread: 2.4, speed: 300, life: 1.6, size: 12, colors: ['#ffe14a', '#ff5fae', '#7de3ff', '#8be066', '#ffffff'], g: 300 });
  }

  function afterRound() {
    if (demo) { roundNo++; beginRound(); return; }
    if (score[0] >= WIN_SCORE || score[1] >= WIN_SCORE) { matchWinner = score[0] >= WIN_SCORE ? 0 : 1; toOver(); return; }
    roundNo++;
    beginRound();
  }

  /* ================================================================ over */
  function toOver() {
    scr = 'over';
    var humanWon = mode === 2 || matchWinner === 0;
    var before = save.stars;
    var earned = 0, mult = { easy: 1, medium: 2, hard: 3 }[diff], bonus = { easy: 3, medium: 6, hard: 10 }[diff];
    var newSpecial = [], newMedal = null;
    if (mode === 1) {
      earned = score[0] * mult + (matchWinner === 0 ? bonus : 0);
      if (matchWinner === 0) {
        var cs = P[1].sumo, lvn = DIFF_LV[diff];
        if ((save.beaten[cs] || 0) < lvn) { save.beaten[cs] = lvn; newMedal = SUMOS[cs].name + ' في المستوى ' + DIFF_AR[diff]; }
        save.wins[diff] = (save.wins[diff] || 0) + 1;
        save.streak++;
        if (diff === 'hard' && !save.special.crown) { save.special.crown = true; newSpecial.push('crown'); }
        if (score[1] === 0 && !save.special.halo) { save.special.halo = true; newSpecial.push('halo'); }
      } else save.streak = 0;
    } else {
      earned = score[0] + score[1] + 3;
      save.wins.pvp = (save.wins.pvp || 0) + 1;
      if (Math.min(score[0], score[1]) === 0 && !save.special.halo) { save.special.halo = true; newSpecial.push('halo'); }
    }
    var newStreak = mode === 1 && matchWinner === 0 && save.streak > save.bestStreak && save.streak >= 2;
    if (mode === 1 && save.streak > save.bestStreak) save.bestStreak = save.streak;
    earned = Math.max(1, earned);
    save.stars += earned;
    save.matches++;
    save.bonks += stats.bonks[0] + (mode === 2 ? stats.bonks[1] : 0);
    var newHats = [];
    HATS.forEach(function (h, i) {
      if (!h.special && before < h.stars && save.stars >= h.stars) newHats.push(i);
      if (h.special && newSpecial.indexOf(h.special) >= 0) newHats.push(i);
    });
    var unlockedDiff = null;
    if (mode === 1 && matchWinner === 0) {
      if (diff === 'easy' && save.wins.easy === 1) unlockedDiff = DIFF_AR.medium;
      if (diff === 'medium' && save.wins.medium === 1) unlockedDiff = DIFF_AR.hard;
    }
    persist();
    overData = { newMedal: newMedal, humanWon: humanWon, earned: earned, newHats: newHats, newStreak: newStreak, unlockedDiff: unlockedDiff, t: 0, shown: 0 };
    // set up the victory scene
    var w = P[matchWinner], l = P[1 - matchWinner];
    resetPlayer(w, 330, 350, 1); resetPlayer(l, 560, 460, -1);
    w.grounded = true; l.grounded = true; w.action = 'win'; l.action = 'none';
    parts.forEach(function (q) { q.on = false; });
    popups.length = 0; banner = null;
    if (humanWon) SFX.matchWin(); else SFX.matchLose();
    SFX.cheer(true);
    MUSIC.play(118, true);
    skyDirty = true;
    buildOver();
    showScreen('over');
  }

  function overStep(dt) {
    T += dt;
    var w = P[matchWinner], l = P[1 - matchWinner];
    overData.t += dt;
    var hop = Math.max(0, Math.sin(overData.t * 4.2));
    var wasG = w.grounded;
    w.y = 350 - hop * 44; w.grounded = hop < 0.02; w.vx = 0; w.vy = 0; w.T += dt; w.action = 'win';
    if (w.grounded && !wasG) { w.sqV += 3.5; dust(w.x, w.y + R, 3); }
    if (!w.grounded && wasG) w.sqV -= 3;
    l.y = 460; l.grounded = true; l.T += dt; l.action = 'none';
    updateVis(w, l, dt); updateVis(l, w, dt);
    l.mood = mode === 2 ? 'happy' : (matchWinner === 0 ? 'dizzy' : 'sad'); l.dizzy = matchWinner === 0 && mode === 1 ? 1 : 0;
    if (Math.random() < 0.55) spawn('confetti', rand(0, W), -10, rand(-40, 40), rand(60, 140), 5, rand(9, 15), Kit.pick(['#ffe14a', '#ff5fae', '#7de3ff', '#8be066', '#ffffff', '#b98aff']), 40, rand(0, 6), rand(-6, 6));
    updateParts(dt);
    shake.update(dt);
    // count up stars
    if (overData.shown < overData.earned) {
      overData.acc = (overData.acc || 0) + dt;
      if (overData.acc > Math.max(0.03, 0.9 / Math.max(1, overData.earned))) { overData.acc = 0; overData.shown++; SFX.star(overData.shown % 8); updateOverStars(); }
    }
  }

  /* ============================================================== rendering */
  function refreshSky() {
    skyCache.width = canvas.width; skyCache.height = canvas.height;
    var c2 = skyCache.getContext('2d');
    var s = view.scale * view.dpr;
    c2.setTransform(s, 0, 0, s, 0, 0);
    var th = scr === 'over' ? 'party' : arena.theme;
    SA.paintSky(c2, SA.THEMES[th], W, H, WATER_Y);
    skyTheme = th; skyDirty = false;
  }

  var CLOUDS = [{ x: 100, y: 90, s: 1.1, v: 9 }, { x: 520, y: 60, s: 0.8, v: 14 }, { x: 900, y: 150, s: 1.0, v: 7 }, { x: 300, y: 190, s: 0.7, v: 11 }, { x: 1150, y: 80, s: 0.9, v: 10 }];
  function drawSkyLayer() {
    var th = scr === 'over' ? 'party' : arena.theme;
    if (skyDirty || skyTheme !== th) refreshSky();
    ctx.drawImage(skyCache, 0, 0, W, H);
    for (var i = 0; i < CLOUDS.length; i++) {
      var c = CLOUDS[i], x = ((c.x + T * c.v) % (W + 260)) - 130;
      SA.drawCloud(ctx, x, c.y, c.s, 'rgba(255,255,255,0.8)');
    }
  }

  var AR_RE = /[\u0600-\u06FF]/;
  function text(str, x, y, size, fill, align, lw, stroke) {
    ctx.font = '700 ' + size + 'px ' + FONT;
    ctx.direction = AR_RE.test(str) ? 'rtl' : 'ltr';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    var w = lw == null ? Math.max(4, size * 0.16) : lw;
    if (w > 0) { ctx.lineWidth = w; ctx.strokeStyle = stroke || OUT; ctx.strokeText(str, x, y); }
    ctx.fillStyle = fill; ctx.fillText(str, x, y);
  }

  function drawWorld() {
    drawSkyLayer();
    SA.drawFans(ctx, T, hype, W);
    ctx.save();
    var z = cam.z + cam.punch;
    ctx.translate(W / 2 + shake.x, H / 2 + shake.y);
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y);
    SA.drawBackDecor(ctx, arena, T);
    for (var i = 0; i < arena.plats.length; i++) SA.drawPlatform(ctx, arena.plats[i], T, arena);
    if (arena.sd && !demo) {
      var fl = 0.35 + Math.sin(T * 10) * 0.25;
      ctx.fillStyle = 'rgba(255,60,80,' + fl + ')';
      arena.plats.forEach(function (pl) {
        if (pl.w <= pl.minW + 1) return;
        ctx.save(); ctx.translate(pl.x, pl.y); ctx.rotate(pl.a);
        if (pl.anchor !== -1) ctx.fillRect(-pl.w / 2, -3, 26, 10);
        if (pl.anchor !== 1) ctx.fillRect(pl.w / 2 - 26, -3, 26, 10);
        ctx.restore();
      });
    }
    // draw the player that is attacking on top
    var order = (P[0].action === 'dash' || P[0].action === 'dive') ? [1, 0] : [0, 1];
    for (var k = 0; k < 2; k++) {
      var p = P[order[k]];
      if (p.splashed && p.splashT < 0.45) continue;
      if (!p.splashed && p.grounded) {
        ctx.fillStyle = 'rgba(40,20,60,0.22)';
        SA.ell(ctx, p.x, p.y + R + 2, 46, 8); ctx.fill();
      }
      SA.drawSumo(ctx, p, p.T);
    }
    var x0 = cam.x - W / (2 * z) - 40, x1 = cam.x + W / (2 * z) + 40;
    SA.drawWater(ctx, SA.THEMES[arena.theme], W, H + 60, WATER_Y, T, x0, x1);
    for (var m = 0; m < 2; m++) { var fp = P[m]; if (fp.splashed && fp.splashT >= 0.45) SA.drawFloatie(ctx, fp.x, WATER_Y + 2 + Math.sin(fp.splashT * 3) * 3, T); }
    drawParts(ctx);
    ctx.restore();
    drawPopups(z);
  }

  // popups live in world coordinates but are clamped in SCREEN space, so a zoomed camera never pushes them off the edge
  function drawPopups(z) {
    for (var i = 0; i < popups.length; i++) {
      var q = popups[i], t = q.t;
      var s = t < 0.1 ? t / 0.1 * 1.35 : t < 0.2 ? 1.35 - (t - 0.1) * 3.5 : 1;
      var a = t > q.life - 0.25 ? (q.life - t) / 0.25 : 1;
      var hw = Math.min(W / 2 - 4, q.hw * z);
      var sx = clamp((q.x - cam.x) * z + W / 2 + shake.x, hw, W - hw);
      var sy = clamp((q.y - t * 40 - cam.y) * z + H / 2 + shake.y, 60, H - 40);
      ctx.save(); ctx.globalAlpha = Math.max(0, a);
      ctx.translate(sx, sy); ctx.rotate(q.rot); ctx.scale(s * z, s * z);
      text(q.text, 0, 0, q.size, q.color, 'center', q.size * 0.2);
      ctx.restore();
    }
  }

  var hudPop = [0, 0];
  function drawKey(x, y, label, w) {
    w = w || 34;
    SA.rrect(ctx, x - w / 2, y - 15, w, 30, 7);
    ctx.fillStyle = '#9aa3c7'; ctx.save(); ctx.translate(0, 4); ctx.fill(); ctx.restore();
    SA.rrect(ctx, x - w / 2, y - 15, w, 30, 7); SA.fs(ctx, '#ffffff', OUT, 2.5);
    ctx.font = '700 18px ' + FONT; ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#1d2340'; ctx.fillText(label, x, y + 1);
  }

  function drawHUD() {
    // score board
    var cx = W / 2;
    for (var i = 0; i < 2; i++) {
      var p = P[i], S = SUMOS[p.sumo], side = i ? 1 : -1;
      var pop = hudPop[i];
      // name plate: the label (أنت / الكمبيوتر / لاعب 1) on the outer side, the sumo name on the inner side
      ctx.font = '700 18px ' + FONT; var lw = ctx.measureText(p.label).width;
      ctx.font = '700 25px ' + FONT; var nw = ctx.measureText(S.name).width;
      var pw = Math.max(184, lw + nw + 52), px = cx + side * (198 + pw / 2);
      ctx.save(); ctx.translate(px, 38);
      SA.rrect(ctx, -pw / 2, -24, pw, 48, 24); SA.fs(ctx, S.body, OUT, 4);
      ctx.restore();
      text(p.label, px + side * (pw / 2 - 16), 38, 18, '#ffffff', side > 0 ? 'right' : 'left', 5);
      text(S.name, px - side * (pw / 2 - 18), 38, 25, '#ffffff', side > 0 ? 'left' : 'right', 5);
      // pips
      for (var k = 0; k < WIN_SCORE; k++) {
        var x = cx + side * (52 + k * 30), filled = k < score[i];
        var r = 12 + (filled && k === score[i] - 1 ? pop * 8 : 0);
        SA.circ(ctx, x, 38, r); SA.fs(ctx, filled ? '#ffe14a' : 'rgba(0,0,0,0.3)', OUT, 3.5);
        if (filled) SA.star(ctx, x, 39, r * 0.62, 0, '#fff7c2', null);
      }
    }
    for (var h = 0; h < 2; h++) hudPop[h] = Math.max(0, hudPop[h] - 0.03);
    SA.circ(ctx, cx, 38, 24); SA.fs(ctx, '#ffffff', OUT, 4);
    text(String(roundNo), cx, 39, 26, '#2b1d3a', 'center', 0);
    text(arena.name, cx, 82, 18, '#ffffff', 'center', 5);

    // wind indicator
    if (arena.type === 'windy' && (Math.abs(arena.windTarget) > 0 || arena.windWarn)) {
      var dir = arena.windWarn ? arena.windNext : Math.sign(arena.windTarget);
      var blink = arena.windWarn ? (Math.sin(T * 20) > 0 ? 1 : 0.35) : 1;
      ctx.save(); ctx.globalAlpha = blink; ctx.translate(cx, 122); ctx.scale(dir, 1);
      ctx.beginPath(); ctx.moveTo(-60, -10); ctx.lineTo(20, -10); ctx.lineTo(20, -24); ctx.lineTo(56, 0); ctx.lineTo(20, 24); ctx.lineTo(20, 10); ctx.lineTo(-60, 10); ctx.closePath();
      SA.fs(ctx, arena.windWarn ? '#ffe14a' : '#ffffff', OUT, 4);
      ctx.restore();
      text(arena.windWarn ? 'الريح ستتغير!' : 'ريح قوية', cx, 158, 18, '#ffffff', 'center', 5);
    }

    // labels + tutorial keycaps over players
    var showKeys = roundNo === 1 && phase === 'fight' && roundT > 0.5 && roundT < 6 && (firstMatch || score[0] + score[1] === 0);
    for (var j = 0; j < 2; j++) {
      var q = P[j]; if (q.out || q.splashed) continue;
      var z = cam.z + cam.punch;
      var sx = (q.x - cam.x) * z + W / 2 + shake.x, sy = (q.y - cam.y) * z + H / 2 + shake.y;
      var ty = sy - (q.hat ? 172 : 140);
      if (sy < -40) {
        // off-screen arrow
        var ax = clamp(sx, 30, W - 30);
        ctx.beginPath(); ctx.moveTo(ax, 104); ctx.lineTo(ax - 14, 128); ctx.lineTo(ax + 14, 128); ctx.closePath(); SA.fs(ctx, SUMOS[q.sumo].body, OUT, 3);
        continue;
      }
      if (ty < 150) ty = 150;
      if (showKeys && !q.cpu) {
        var k1 = mode === 1 ? 'W' : (j ? '↑' : 'W'), k2 = mode === 1 ? 'S' : (j ? '↓' : 'S');
        var bob = Math.sin(T * 5) * 3;
        SA.rrect(ctx, sx - 100, ty - 58 + bob, 200, 50, 14); SA.fs(ctx, 'rgba(255,255,255,0.92)', OUT, 3);
        drawKey(sx + 76, ty - 33 + bob, k1); text('قفز', sx + 52, ty - 31 + bob, 19, '#2b1d3a', 'right', 0);
        drawKey(sx - 8, ty - 33 + bob, k2); text('هجوم', sx - 32, ty - 31 + bob, 19, '#2b1d3a', 'right', 0);
      }
      if (q.action === 'windup') {
        var ex = sx + q.f * 34, ey = ty + 40;
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(q.f * 0.25);
        text('!', 0, 0, 44, '#ff4f6d', 'center', 8);
        ctx.restore();
      }
      if (q.label) {
        var col = SUMOS[q.sumo].body;
        ctx.beginPath(); ctx.moveTo(sx - 9, ty + 16); ctx.lineTo(sx + 9, ty + 16); ctx.lineTo(sx, ty + 27); ctx.closePath(); SA.fs(ctx, col, OUT, 3);
        text(q.label, sx, ty, 22, col, 'center', 6);
      }
    }
    drawBanner();
  }

  function drawBanner() {
    if (!banner) return;
    var b = banner, t = b.t;
    var s = t < 0.12 ? 0.3 + t / 0.12 * 0.9 : t < 0.22 ? 1.2 - (t - 0.12) * 2 : 1;
    var a = t > b.life - 0.2 ? Math.max(0, (b.life - t) / 0.2) : 1;
    ctx.save(); ctx.globalAlpha = a;
    ctx.translate(W / 2, 190); ctx.scale(s, s); ctx.rotate(-0.03);
    text(b.text, 0, 0, b.size, b.color, 'center', b.size * 0.2);
    if (b.sub) text(b.sub, 0, b.size * 0.72, 30, '#ffffff', 'center', 7);
    ctx.restore();
  }

  function drawOver() {
    drawSkyLayer();
    // spinning rays
    ctx.save(); ctx.translate(330, 300); ctx.rotate(T * 0.25);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (var i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-70, -900); ctx.lineTo(70, -900); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.save(); ctx.translate(shake.x, shake.y);
    // podiums
    SA.rrect(ctx, 215, 400, 230, 190, 16); SA.fs(ctx, '#ffcf2e', OUT, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(227, 410, 206, 10);
    SA.star(ctx, 330, 480, 40, 0, '#fff4b0', OUT, 4);
    text('1', 330, 484, 40, '#2b1d3a', 'center', 0);
    SA.rrect(ctx, 470, 510, 180, 90, 16); SA.fs(ctx, '#cfd6ea', OUT, 5);
    text('2', 560, 552, 38, '#2b1d3a', 'center', 0);
    SA.drawWater(ctx, SA.THEMES.party, W, H + 60, 600, T);
    var w = P[matchWinner], l = P[1 - matchWinner];
    SA.drawSumo(ctx, l, l.T);
    SA.drawSumo(ctx, w, w.T);
    SA.drawTrophy(ctx, w.x + 4, w.y - 200, 0.85, T);
    drawParts(ctx);
    ctx.restore();
  }

  function render() {
    ctx.save();
    if (scr === 'over') drawOver();
    else {
      drawWorld();
      if (scr === 'game' && !demo) drawHUD();
    }
    if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.5, flash) + ')'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  /* ================================================================ camera */
  function updateCamera(dt) {
    var tx = W / 2, ty = H / 2, tz = 1;
    if (scr === 'game' && slowT > 0) {
      var f = P[0].out ? P[0] : P[1].out ? P[1] : null;
      if (f) { tz = 1.14; tx = W / 2 + (clamp(f.x, 0, W) - W / 2) * 0.35; ty = H / 2 + (clamp(f.y, 0, H) - H / 2) * 0.3; }
    }
    var k = Math.min(1, dt * 5);
    cam.z += (tz - cam.z) * k; cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    var hw = W / (2 * cam.z), hh = H / (2 * cam.z);
    cam.x = clamp(cam.x, hw, W - hw); cam.y = clamp(cam.y, hh, H - hh);
    cam.punch *= Math.max(0, 1 - dt * 10);
  }

  /* ============================================================= main loop */
  function update(dt) {
    MUSIC.update();
    handleKeys();
    if (paused) { Kit.keys.endFrame(); return; }
    if (flash > 0) flash -= dt * 1.5;
    hype = Math.max(0, hype - dt * 0.6);
    if (scr === 'over') { overStep(dt); Kit.keys.endFrame(); return; }
    if (scr === 'select') drawPreviews(dt);
    if (scr === 'title') drawHatBar();
    shake.update(dt);
    for (var i = 0; i < popups.length; i++) popups[i].t += dt;
    while (popups.length && popups[0].t > popups[0].life) popups.shift();
    if (banner) { banner.t += dt; if (banner.t > banner.life) banner = null; }
    if (hitstop > 0) {
      hitstop -= dt;
      if (phase === 'fight') for (var hb = 0; hb < 2; hb++) { var hp = P[hb]; if (!hp.cpu && !hp.out) { var hi = humanInput(hp); if (hi.j) hp.jb = 0.13; if (hi.s) hp.sb = 0.13; } }
      Kit.keys.endFrame(); return;
    }
    if (slowT > 0) { slowT -= dt; if (slowT <= 0) timeScale = 1; }
    var sdt = dt * timeScale;
    step(sdt);
    updateParts(sdt);
    updateCamera(dt);
    Kit.keys.endFrame();
  }

  /* ================================================================== UI */
  var $ = function (id) { return document.getElementById(id); };
  var screens = { title: $('scr-title'), select: $('scr-select'), pause: $('scr-pause'), over: $('scr-over') };
  var btnPause = $('bPause'), btnMusic = $('bMusic');
  function showScreen(name) {
    for (var k in screens) screens[k].hidden = k !== name;
    btnPause.hidden = !(scr === 'game' && !paused && name !== 'pause');
  }

  function goTitle() {
    scr = 'title'; paused = false;
    startDemo();
    MUSIC.play(112, true);
    refreshTitle();
    showScreen('title');
  }

  function refreshTitle() {
    $('tStars').textContent = save.stars;
    $('tHats').textContent = unlockedCount() + ' / ' + HATS.length;
    var nh = nextHat();
    if (nh) {
      var prev = 0;
      HATS.forEach(function (h) { if (!h.special && h.stars <= save.stars && h.stars > prev) prev = h.stars; });
      $('tNext').innerHTML = 'القبعة التالية: <b>' + nh.name + '</b> عند <span dir="ltr">★ ' + nh.stars + '</span>';
      $('tBar').style.width = Math.round(100 * (save.stars - prev) / Math.max(1, nh.stars - prev)) + '%';
    } else { $('tNext').textContent = 'فتحت كل قبعات النجوم!'; $('tBar').style.width = '100%'; }
    $('tRecord').textContent = save.bestStreak ? 'أطول سلسلة انتصارات: ' + save.bestStreak : '';
    $('tMedals').textContent = medals() + ' / 24';
    hatBarDirty = true;
  }

  // ---- select screen
  var cpuPick = { sumo: 1, hat: 1 };
  var pv = [newPlayer(0), newPlayer(1)];
  var pvCtx = [];
  function toSelect(m) {
    if (m) mode = m;
    save.mode = mode; persist();
    scr = 'select';
    // make sure picks are valid
    if (!hatUnlocked(save.picks.h0)) save.picks.h0 = 0;
    if (!hatUnlocked(save.picks.h1)) save.picks.h1 = 0;
    if (save.picks.s1 === save.picks.s0) save.picks.s1 = (save.picks.s0 + 1) % 8;
    rollCpu();
    buildSelect();
    showScreen('select');
  }
  function rollCpu() {
    var lv = DIFF_LV[diff] || 1, fresh = [], any = [];
    for (var i0 = 0; i0 < 8; i0++) { if (i0 === save.picks.s0) continue; any.push(i0); if ((save.beaten[i0] || 0) < lv) fresh.push(i0); }
    cpuPick.sumo = Kit.pick(fresh.length ? fresh : any);
    var pool = []; for (var i = 1; i < HATS.length; i++) pool.push(i);
    cpuPick.hat = Kit.pick(pool);
  }
  function buildSelect() {
    var one = mode === 1;
    $('selTitle').textContent = one ? 'اختر مصارعك!' : 'اختارا مصارعيكما!';
    $('who1').textContent = one ? 'الكمبيوتر' : 'اللاعب 2';
    $('who0').textContent = one ? 'أنت' : 'اللاعب 1';
    $('diffBox').hidden = !one;
    $('hatp1').hidden = one; $('keys1').hidden = one; $('rivalBox').hidden = !one;
    $('card1').classList.toggle('one', one);
    $('keys0').innerHTML = one
      ? '<span dir="ltr"><span class="sg-key">←</span><span class="sg-key">→</span></span> المصارع &nbsp; <span dir="ltr"><span class="sg-key">↑</span><span class="sg-key">↓</span></span> القبعة'
      : '<span dir="ltr"><span class="sg-key">A</span><span class="sg-key">D</span></span> المصارع &nbsp; <span dir="ltr"><span class="sg-key">W</span><span class="sg-key">S</span></span> القبعة';
    ['easy', 'medium', 'hard'].forEach(function (d) {
      var b = $('d-' + d), ok = diffUnlocked(d);
      b.classList.toggle('on', d === diff); b.classList.toggle('locked', !ok);
      var wins = save.wins[d] || 0;
      b.querySelector('.dw').innerHTML = ok ? (wins ? 'فوز: <span dir="ltr">' + wins + ' ★</span>' : 'النجوم <span dir="ltr">×' + { easy: 1, medium: 2, hard: 3 }[d] + '</span>') : (d === 'medium' ? 'اهزم السهل' : 'اهزم المتوسط');
    });
    $('dDesc').hidden = !one;
    $('dDesc').textContent = { easy: 'مصارع نعسان وبطيء. رائع لتتعلم الحركات!', medium: 'يقفز فوق هجماتك ويرد عليك بضربة بطن!', hard: 'بطل سريع كالبرق! اهزمه لتربح التاج الذهبي!' }[diff];
    refreshSelectNames();
  }
  function refreshSelectNames() {
    var s0 = save.picks.s0, h0 = save.picks.h0;
    $('nm0').textContent = SUMOS[s0].name; $('hn0').textContent = HATS[h0].name;
    pv[0].sumo = s0; pv[0].hat = h0;
    if (mode === 1) { pv[1].sumo = cpuPick.sumo; pv[1].hat = cpuPick.hat; $('nm1').textContent = SUMOS[cpuPick.sumo].name; }
    else { pv[1].sumo = save.picks.s1; pv[1].hat = save.picks.h1; $('nm1').textContent = SUMOS[save.picks.s1].name; $('hn1').textContent = HATS[save.picks.h1].name; }
    $('card0').style.setProperty('--c', SUMOS[pv[0].sumo].body);
    $('card1').style.setProperty('--c', SUMOS[pv[1].sumo].body);
    var nh = nextHat();
    $('selNext').innerHTML = 'معك <b dir="ltr">★ ' + save.stars + '</b> &nbsp;•&nbsp; ' + (nh ? 'القبعة التالية <b>' + nh.name + '</b> عند <b dir="ltr">★ ' + nh.stars + '</b>' : 'فتحت كل قبعات النجوم!');
  }
  function cycleSumo(i, d) {
    if (mode === 1 && i === 1) {
      var c = cpuPick.sumo;
      do { c = (c + d + 8) % 8; } while (c === save.picks.s0);
      cpuPick.sumo = c; cpuPick.hat = Kit.randInt(1, HATS.length - 1);
      pv[1].sqV += 5; pv[1].leanV += d * 4;
      SFX.tick(); refreshSelectNames(); return;
    }
    var key = 's' + i, other = mode === 1 ? -1 : save.picks['s' + (1 - i)];
    var v = save.picks[key];
    do { v = (v + d + 8) % 8; } while (v === other);
    save.picks[key] = v;
    if (mode === 1 && v === cpuPick.sumo) rollCpu();
    pv[i].sqV += 5; pv[i].leanV += d * 4;
    SFX.tick(); refreshSelectNames(); persist();
  }
  function cycleHat(i, d) {
    var key = 'h' + i, v = save.picks[key], n = HATS.length;
    for (var k = 0; k < n; k++) { v = (v + d + n) % n; if (hatUnlocked(v)) break; }
    save.picks[key] = v;
    pv[i].sqV -= 4; pv[i].hatV += d * 6;
    SFX.tick(); refreshSelectNames(); persist();
  }
  function setDiff(d) {
    if (!diffUnlocked(d)) { SFX.locked(); var b = $('d-' + d); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
    diff = d; save.diff = d; persist(); SFX.click(); rollCpu(); buildSelect();
  }
  var rivalsCtx = null, rivalPv = [];
  for (var rp = 0; rp < 8; rp++) { rivalPv.push(newPlayer(rp)); rivalPv[rp].sumo = rp; rivalPv[rp].hat = 0; }
  var MEDAL = [null, '#d98b4a', '#cfd6ea', '#ffcf2e'];
  function drawRivals(c, w, dt) {
    var cv = c.canvas, s = cv.width / w;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(s, 0, 0, s, 0, 0);
    var gap = w / 8;
    for (var i = 0; i < 8; i++) {
      var p = rivalPv[i], x = gap * i + gap / 2, lv = save.beaten[i] || 0;
      p.T += dt; p.x = 0; p.y = 0; p.f = 1; p.grounded = true;
      var sel = scr === 'select' && mode === 1 && cpuPick.sumo === i;
      if (sel) { SA.circ(c, x, 30, 26); c.fillStyle = 'rgba(255,210,63,0.55)'; c.fill(); }
      c.save(); c.translate(x - 2, 34 + (sel ? Math.sin(p.T * 8) * 2 : 0)); c.scale(0.27, 0.27);
      if (!lv) c.globalAlpha = 0.55;
      p.mood = sel ? 'angry' : 'idle'; p.lookX = 0.3;
      SA.drawSumo(c, p, p.T);
      c.restore();
      if (lv) { SA.circ(c, x + 14, 50, 9); SA.fs(c, MEDAL[lv], OUT, 2.5); SA.star(c, x + 14, 50.5, 5, 0, '#ffffff', null); }
    }
  }
  function drawPreviews(dt) {
    if (rivalsCtx && mode === 1) drawRivals(rivalsCtx, 360, dt);
    for (var i = 0; i < 2; i++) {
      var c = pvCtx[i]; if (!c) continue;
      var p = pv[i];
      p.x = 110; p.y = 140; p.grounded = true; p.f = i ? -1 : 1; p.T += dt;
      if (Math.random() < dt * 0.4) p.sqV += 3;
      updateVis(p, { x: i ? -100 : 400, y: 140 }, dt);
      var cv = c.canvas, s = cv.width / 220;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
      c.setTransform(s, 0, 0, s, 0, 0);
      c.fillStyle = 'rgba(40,20,60,0.25)'; SA.ell(c, 110, 192, 70, 11); c.fill();
      SA.drawSumo(c, p, p.T);
    }
  }

  // ---- title hat collection bar
  var hatBarDirty = true, hatBarCtx = null;
  function drawHatBar() {
    if (!hatBarCtx) return;
    var cv = hatBarCtx.canvas, s = cv.width / 900, c = hatBarCtx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(s, 0, 0, s, 0, 0);
    var n = HATS.length - 1;
    for (var i = 1; i < HATS.length; i++) {
      var x = 26 + (i - 1) * (848 / (n - 1)), y = 50, ok = hatUnlocked(i);
      SA.circ(c, x, 44, 24); SA.fs(c, ok ? 'rgba(255,255,255,0.95)' : 'rgba(20,16,40,0.55)', ok ? OUT : 'rgba(255,255,255,0.35)', 3);
      c.save(); c.translate(x, y); c.scale(0.5, 0.5);
      if (!ok) c.globalAlpha = 0.35;
      SA.drawHat(c, HATS[i].id, T + i);
      c.restore();
      if (!ok) {
        c.font = '700 13px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 4; c.strokeStyle = OUT; c.fillStyle = '#ffe14a';
        var lab = HATS[i].special ? HATS[i].short : '★' + HATS[i].stars;
        c.direction = HATS[i].special === 'crown' ? 'rtl' : 'ltr';
        c.strokeText(lab, x, 80); c.fillText(lab, x, 80);
      }
    }
  }

  // ---- game over screen
  function buildOver() {
    var d = overData;
    var S = SUMOS[P[matchWinner].sumo];
    var head;
    if (mode === 1) head = matchWinner === 0 ? 'فزت!' : 'فاز الكمبيوتر!';
    else head = 'فاز اللاعب ' + (matchWinner + 1) + '!';
    $('oHead').textContent = head;
    $('oHead').style.color = mode === 1 && matchWinner === 1 ? '#ffffff' : S.body;
    var sub = '<span dir="ltr">' + score[0] + ' – ' + score[1] + '</span>';
    if (mode === 1 && matchWinner === 1) sub += score[0] >= 3 ? '  •  كدت تفوز! حاول مرة أخرى!' : '  •  استمر، أنت قادر على الفوز!';
    else if (Math.min(score[0], score[1]) === 0) sub += '  •  فوز ساحق!';
    $('oSub').innerHTML = sub;
    $('oStars').textContent = '+0';
    var lines = [];
    d.newHats.forEach(function (i) { lines.push('<div class="unlock"><span class="new">قبعة جديدة!</span> ' + HATS[i].name + '</div>'); });
    if (d.newMedal) lines.push('<div class="unlock"><span class="new">ميدالية!</span> هزمت ' + d.newMedal + '</div>');
    if (d.unlockedDiff) lines.push('<div class="unlock"><span class="new">مستوى جديد!</span> الكمبيوتر ' + d.unlockedDiff + '</div>');
    if (d.newStreak) lines.push('<div class="unlock"><span class="new">رقم قياسي!</span> انتصارات متتالية: ' + save.streak + '</div>');
    if (!lines.length) {
      var nh = nextHat();
      if (nh) lines.push('<div class="hint">باقي <b dir="ltr">' + Math.max(0, nh.stars - save.stars) + ' ★</b> لتحصل على <b>' + nh.name + '</b></div>');
      else lines.push('<div class="hint">ضربات هذه المباراة: <b>' + (stats.bonks[0] + stats.bonks[1]) + '</b></div>');
    }
    $('oLines').innerHTML = lines.join('');
    $('oStats').innerHTML = (mode === 1 ? 'ضرباتك: <b>' + stats.bonks[0] + '</b>' : 'ضربات لاعب 1: <b>' + stats.bonks[0] + '</b> • لاعب 2: <b>' + stats.bonks[1] + '</b>') +
      ' &nbsp;•&nbsp; كل نجومك <b dir="ltr">★ ' + save.stars + '</b>';
    $('bAgain').innerHTML = mode === 1 && matchWinner === 0 ? 'الخصم التالي! <small>Enter</small>' : 'مباراة أخرى! <small>Enter</small>';
    if (d.newHats.length) setTimeout(function () { if (scr === 'over') SFX.unlock(); }, 900);
  }
  function updateOverStars() { $('oStars').textContent = '+' + overData.shown; }

  function pause(on) {
    if (scr !== 'game') return;
    paused = on;
    if (on) { SFX.pause(); MUSIC.stop(); Kit.keys.reset(); showScreen('pause'); }
    else { MUSIC.play(128, false); showScreen(null); }
  }

  function handleKeys() {
    var k = Kit.keys;
    var ok = k.anyPressed(['Enter', 'Space', 'NumpadEnter']);
    if (scr === 'title') {
      if (ok) { SFX.click(); toSelect(mode); }
      else if (k.pressed('Digit1') || k.pressed('Numpad1')) { SFX.click(); toSelect(1); }
      else if (k.pressed('Digit2') || k.pressed('Numpad2')) { SFX.click(); toSelect(2); }
    } else if (scr === 'select') {
      if (ok) { SFX.click(); startMatch(); return; }
      if (k.pressed('Escape')) { SFX.click(); goTitle(); return; }
      if (mode === 1) {
        if (k.anyPressed(['KeyA', 'ArrowLeft'])) cycleSumo(0, -1);
        if (k.anyPressed(['KeyD', 'ArrowRight'])) cycleSumo(0, 1);
        if (k.anyPressed(['KeyW', 'ArrowUp'])) cycleHat(0, -1);
        if (k.anyPressed(['KeyS', 'ArrowDown'])) cycleHat(0, 1);
        if (k.pressed('Digit1')) setDiff('easy');
        if (k.pressed('Digit2')) setDiff('medium');
        if (k.pressed('Digit3')) setDiff('hard');
      } else {
        if (k.pressed('KeyA')) cycleSumo(0, -1);
        if (k.pressed('KeyD')) cycleSumo(0, 1);
        if (k.pressed('KeyW')) cycleHat(0, -1);
        if (k.pressed('KeyS')) cycleHat(0, 1);
        if (k.pressed('ArrowLeft')) cycleSumo(1, -1);
        if (k.pressed('ArrowRight')) cycleSumo(1, 1);
        if (k.pressed('ArrowUp')) cycleHat(1, -1);
        if (k.pressed('ArrowDown')) cycleHat(1, 1);
      }
    } else if (scr === 'game') {
      if (k.anyPressed(['KeyP', 'Escape'])) { pause(!paused); return; }
      if (paused && k.pressed('KeyR')) { SFX.click(); pause(false); startMatch(); return; }
    } else if (scr === 'over') {
      if (overData && overData.t > 0.6) {
        if (ok || k.pressed('KeyR')) { SFX.click(); again(); }
        else if (k.pressed('KeyC')) { SFX.click(); toSelect(mode); }
        else if (k.pressed('Escape')) { SFX.click(); goTitle(); }
      }
    }
  }

  // buttons
  function onClick(id, fn) { $(id).addEventListener('click', function (e) { e.preventDefault(); Kit.audio.unlock(); fn(e); this.blur(); }); }
  onClick('b1p', function () { SFX.click(); toSelect(1); });
  onClick('b2p', function () { SFX.click(); toSelect(2); });
  onClick('bFight', function () { SFX.click(); startMatch(); });
  onClick('bBack', function () { SFX.click(); goTitle(); });
  onClick('bResume', function () { SFX.click(); pause(false); });
  onClick('bRestart', function () { SFX.click(); pause(false); startMatch(); });
  onClick('bMenu', function () { SFX.click(); paused = false; goTitle(); });
  function again() { if (mode === 1 && matchWinner === 0) rollCpu(); startMatch(); }
  onClick('bAgain', function () { SFX.click(); again(); });
  onClick('bChange', function () { SFX.click(); toSelect(mode); });
  onClick('bOverMenu', function () { SFX.click(); goTitle(); });
  onClick('bPause', function () { pause(true); });
  ['easy', 'medium', 'hard'].forEach(function (d) { onClick('d-' + d, function () { setDiff(d); }); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-arr]'), function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault(); Kit.audio.unlock();
      var a = b.getAttribute('data-arr').split(','), i = +a[1], d = +a[2];
      if (a[0] === 's') cycleSumo(i, d); else cycleHat(i, d);
      b.blur();
    });
  });
  function paintMusic() { btnMusic.textContent = '♫'; btnMusic.style.opacity = save.music ? '1' : '0.45'; btnMusic.title = save.music ? 'الموسيقى تعمل' : 'الموسيقى متوقفة'; }
  onClick('bMusic', function () { save.music = !save.music; MUSIC.on = save.music; persist(); paintMusic(); });
  btnMusic.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  btnPause.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  paintMusic();
  var muteBtn = Kit.muteButton();
  muteBtn.setAttribute('aria-label', 'تشغيل الصوت أو كتمه');
  muteBtn.title = 'الصوت (M)';

  window.addEventListener('blur', function () { if (scr === 'game' && !paused) pause(true); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && scr === 'game' && !paused) pause(true); });

  // mini canvases (previews + hat bar) sized for crisp drawing
  sizeMiniCanvases = function () {
    var s = view.scale * view.dpr;
    ['pv0', 'pv1'].forEach(function (id, i) { var c = $(id); c.width = Math.round(220 * s); c.height = Math.round(220 * s); pvCtx[i] = c.getContext('2d'); });
    var rv = $('rivals'); rv.width = Math.round(360 * s); rv.height = Math.round(64 * s); rivalsCtx = rv.getContext('2d');
    var hb = $('hatbar'); hb.width = Math.round(900 * s); hb.height = Math.round(96 * s); hatBarCtx = hb.getContext('2d');
  };
  sizeMiniCanvases();
  onResize(view);

  /* ============================================================ debug hook */
  window.__game = {
    get state() {
      return {
        scr: scr, paused: paused, phase: phase, mode: mode, diff: diff, demo: demo, round: roundNo, score: score.slice(), arena: arena.type,
        roundT: +roundT.toFixed(2), stars: save.stars, hats: unlockedCount(),
        players: P.map(function (p) { return { x: Math.round(p.x), y: Math.round(p.y), action: p.action, grounded: p.grounded, out: p.out, splashed: p.splashed, hits: p.hits, cpu: p.cpu, sumo: p.sumo, hat: p.hat }; }),
        particles: parts.filter(function (q) { return q.on; }).length
      };
    },
    save: save,
    roundLog: roundLog,
    P: P,
    freeze: function () { hitstop = 999; },
    setArena: function (t) { forcedArena = t; },
    restartRound: function (t) { if (t) forcedArena = t; beginRound(); },
    skipRound: function (winner) { var l = P[1 - (winner || 0)]; l.x = winner ? -200 : W + 200; l.y = 700; markOut(l); },
    cpuBoth: function (lvA, lvB) { P[0].cpu = true; P[0].level = lvA || 'medium'; P[1].cpu = true; P[1].level = lvB || lvA || 'medium'; },
    simulate: function (sec) { var n = Math.round(sec * 60); for (var i = 0; i < n; i++) { if (scr === 'over') break; step(STEP); updateParts(STEP); } return this.state; },
    bench: function (n) {
      n = n || 120; var t0 = performance.now();
      for (var i = 0; i < n; i++) { step(STEP); updateParts(STEP); render(); }
      var ms = (performance.now() - t0) / n;
      return { msPerFrame: +ms.toFixed(2), particles: parts.filter(function (q) { return q.on; }).length, canvas: canvas.width + 'x' + canvas.height };
    },
    setStars: function (n) { save.stars = n; persist(); refreshTitle(); },
    start: function (m, d) { mode = m || 1; if (d) diff = d; rollCpu(); startMatch(); }
  };

  // go!
  if (document.fonts && document.fonts.load) { document.fonts.load('700 40px Fredoka', 'بونغ BONK').catch(function () {}); }
  goTitle();
  Kit.loop(update, render);
})();
