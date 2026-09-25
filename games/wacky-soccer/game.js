/* Wacky Soccer — main game: menus, match flow, modifiers, juice, saving. */
(function () {
  'use strict';
  var WS = window.WS, ART = WS.art, S = WS.sfx;
  var W = WS.W, H = WS.H, G = WS.G, GOAL_D = WS.GOAL_D, BAR_Y = WS.BAR_Y;
  var TAU = Math.PI * 2;
  var OUT = ART.OUT;
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function easeOutBack(t) { var c = 1.9; t = t - 1; return 1 + (c + 1) * t * t * t + c * t * t; }
  function easeOutCubic(t) { t = 1 - t; return 1 - t * t * t; }
  // '+25' kept in LTR order inside Arabic sentences
  function plus(n) { return '\u2066+' + n + '\u2069'; }

  /* ================================================================ save */
  var store = Kit.store('wacky-soccer');
  var DEF = {
    coins: 0, teams: ['pancake', 'melon', 'penguin'], balls: ['classic'], hats: ['none'],
    ball: 'classic', hat: 'none', team: 'pancake', opp: 'melon', p2: 'penguin', diff: 0,
    cups: {}, ach: {}, mods: {}, stats: { goals: 0, wins: 0, matches: 0, headers: 0 }, cupPick: 0
  };
  var save = store.get('save', null);
  (function fix() {
    if (!save || typeof save !== 'object') save = {};
    for (var k in DEF) if (save[k] == null || typeof save[k] !== typeof DEF[k]) save[k] = JSON.parse(JSON.stringify(DEF[k]));
    for (var s in DEF.stats) if (typeof save.stats[s] !== 'number') save.stats[s] = 0;
    if (!Array.isArray(save.teams)) save.teams = DEF.teams.slice();
    if (!Array.isArray(save.balls)) save.balls = ['classic'];
    if (!Array.isArray(save.hats)) save.hats = ['none'];
    if (!owns('teams', save.team)) save.team = 'pancake';
  })();
  function persist() { store.set('save', save); }
  function owns(kind, id) { return save[kind].indexOf(id) >= 0; }

  /* ======================================================== achievements */
  var ACH = [
    { id: 'goal1', ic: '⚽', name: 'أول هدف!', desc: 'سجّل هدفك الأول', rw: 10 },
    { id: 'win1', ic: '🎉', name: 'أول فوز', desc: 'اربح مباراة ضد الكمبيوتر', rw: 20 },
    { id: 'duo', ic: '🤝', name: 'صديقان', desc: 'العب مباراة بلاعبَين', rw: 15 },
    { id: 'header', ic: '💫', name: 'رأس ذهبي', desc: 'سجّل هدفًا بضربة رأسية', rw: 25 },
    { id: 'long', ic: '🚀', name: 'صاروخ بعيد', desc: 'سجّل هدفًا من نصف ملعبك', rw: 25 },
    { id: 'owngoal', ic: '🙈', name: 'أوبس!', desc: 'اجعل الخصم يسجّل في مرماه', rw: 15 },
    { id: 'clean', ic: '🧤', name: 'شباك نظيفة', desc: 'اربح دون أن يدخل مرماك أي هدف', rw: 40 },
    { id: 'comeback', ic: '🔥', name: 'عودة الأبطال', desc: 'اربح بعد أن كنت متأخرًا بهدفين', rw: 50 },
    { id: 'hard', ic: '🤖', name: 'قاهر الكمبيوتر', desc: 'اهزم الكمبيوتر الصعب', rw: 60 },
    { id: 'mods', ic: '🎲', name: 'عالم الجنون', desc: 'العب مع 8 مفاجآت مختلفة', rw: 40, goal: 8, stat: function () { return Object.keys(save.mods).length; } },
    { id: 'goals50', ic: '🥅', name: 'هدّاف كبير', desc: 'سجّل 50 هدفًا', rw: 60, goal: 50, stat: function () { return save.stats.goals; } },
    { id: 'shop', ic: '🛒', name: 'متسوّق صغير', desc: 'اشترِ أول شيء من المتجر', rw: 10 },
    { id: 'teams6', ic: '👕', name: 'جامع الفرق', desc: 'امتلك 6 فرق', rw: 50, goal: 6, stat: function () { return save.teams.length; } },
    { id: 'bronze', ic: '🥉', name: 'بطل البرونز', desc: 'اربح الكأس البرونزية', rw: 0 },
    { id: 'silver', ic: '🥈', name: 'بطل الفضة', desc: 'اربح الكأس الفضية', rw: 0 },
    { id: 'gold', ic: '🥇', name: 'البطل الذهبي', desc: 'اربح الكأس الذهبية', rw: 0 }
  ];
  function unlock(id) {
    if (save.ach[id]) return;
    var a = null;
    for (var i = 0; i < ACH.length; i++) if (ACH[i].id === id) a = ACH[i];
    if (!a) return;
    save.ach[id] = 1;
    if (a.rw) save.coins += a.rw;
    persist();
    toast(a.ic + ' وسام جديد: ' + a.name, a.rw ? (plus(a.rw) + ' عملة') : a.desc);
    S.tada();
  }
  function checkStatAch() {
    for (var i = 0; i < ACH.length; i++) if (ACH[i].goal && ACH[i].stat() >= ACH[i].goal) unlock(ACH[i].id);
  }

  /* =============================================================== view */
  var canvas = $('game'), uiEl = $('ui');
  var view = Kit.fit(canvas, W, H, { onResize: onResize });
  var ctx = view.ctx;
  function onResize(v) {
    uiEl.style.left = canvas.style.left; uiEl.style.top = canvas.style.top;
    uiEl.style.transform = 'scale(' + v.scale + ')';
    ART.setScale(Math.min(2, Math.max(0.5, v.scale * v.dpr)));
  }
  onResize(view);
  var pointer = Kit.pointer(view);
  Kit.muteButton();
  canvas.addEventListener('pointerdown', function () { try { canvas.focus(); } catch (e) { /* ignore */ } });
  // repaint cached backgrounds once the rounded fonts are ready
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 30px Fredoka', 'بكرة'), document.fonts.load('700 30px Fredoka', 'A1')]).then(function () {
      ART.setScale(0); onResize(view); refreshAllCanvases();
    }).catch(function () { /* ignore */ });
  }

  /* ============================================================= effects */
  var parts = [], pops = [], shake = Kit.shake();
  var hitstop = 0, hype = 0, flash = 0;
  var CONF = ['#ff5a5f', '#ffd23f', '#3ddc84', '#4f7cff', '#ff8fb1', '#ffffff', '#9b5de5', '#ff9f1c'];
  function spawn(type, x, y, vx, vy, life, size, color, g) {
    if (parts.length > 520) parts.shift();
    parts.push({ type: type, x: x, y: y, vx: vx, vy: vy, life: life, max: life, size: size, color: color, g: g == null ? 600 : g, rot: Math.random() * TAU, vr: rnd(-10, 10) });
  }
  function dust(x, y, n, col) {
    for (var i = 0; i < n; i++) spawn('dust', x + rnd(-14, 14), y - rnd(0, 6), rnd(-90, 90), rnd(-80, -10), rnd(0.3, 0.55), rnd(7, 13), col || 'rgba(255,255,255,0.8)', 80);
  }
  function stars(x, y, n, cols, sp) {
    for (var i = 0; i < n; i++) { var a = Math.random() * TAU, s = rnd(0.4, 1) * (sp || 260); spawn('star', x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.35, 0.7), rnd(7, 12), pick(cols || ['#fff', '#ffd23f']), 300); }
  }
  function confetti(x, y, n, dirx) {
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + rnd(-0.9, 0.9) + (dirx || 0) * 0.5, s = rnd(300, 900);
      spawn('conf', x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(1.4, 2.6), rnd(8, 14), pick(CONF), 700);
    }
  }
  function popup(text, x, y, color, size) {
    if (pops.length > 10) pops.shift();
    pops.push({ text: text, x: clamp(x, 140, W - 140), y: clamp(y, 150, H - 60), t: 0, life: 1.1, color: color || '#ffd23f', size: size || 40 });
  }
  function updateFx(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      if (p.type === 'conf') { p.vx *= Math.pow(0.12, dt); p.vy = Math.min(p.vy + p.g * dt, 160); p.x += Math.sin(p.life * 7 + p.rot) * 40 * dt; }
      else p.vy += p.g * dt;
      if (p.type === 'wind') p.vy = 0;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.type !== 'wind' && p.y > G + 60) p.y = G + 60;
    }
    for (var j = pops.length - 1; j >= 0; j--) { pops[j].t += dt; pops[j].y -= 40 * dt; if (pops[j].t > pops[j].life) pops.splice(j, 1); }
    shake.update(dt);
    flash = Math.max(0, flash - dt * 3);
  }
  function drawParts() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], k = p.life / p.max;
      ctx.globalAlpha = p.type === 'conf' ? Math.min(1, k * 3) : k;
      ctx.fillStyle = p.color;
      if (p.type === 'dust') { ART.circle(ctx, p.x, p.y, p.size * (1.6 - k * 0.8)); ctx.fill(); }
      else if (p.type === 'star') { ART.star(ctx, p.x, p.y, p.size, p.size * 0.45, 5, p.rot); ctx.fill(); }
      else if (p.type === 'wind') { ctx.fillRect(p.x, p.y, p.size, 3); }
      else {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size * 0.3 * Math.abs(Math.cos(p.rot * 2)), p.size, p.size * 0.6 * Math.abs(Math.cos(p.rot * 2)) + 1);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawPops() {
    for (var i = 0; i < pops.length; i++) {
      var p = pops[i], t = p.t;
      var sc = t < 0.18 ? easeOutBack(t / 0.18) : 1;
      var a = t > p.life - 0.3 ? (p.life - t) / 0.3 : 1;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc, sc); ctx.rotate(Math.sin(t * 9) * 0.05);
      ART.text(ctx, p.text, 0, 0, { size: p.size, color: p.color, stroke: OUT, sw: p.size * 0.22, alpha: Math.max(0, a) });
      ctx.restore();
    }
  }

  /* ============================================================ ambience */
  var amb = null;
  function ambSet(level) {
    var c = Kit.audio.ctx;
    if (!c || !Kit.audio.master) return;
    if (!amb) {
      try {
        var buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0), last = 0;
        for (var i = 0; i < d.length; i++) { last = last * 0.96 + (Math.random() * 2 - 1) * 0.04; d[i] = last * 6; }
        var src = c.createBufferSource(); src.buffer = buf; src.loop = true;
        var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.5;
        var g = c.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(Kit.audio.master); src.start();
        amb = { g: g, level: -1 };
      } catch (e) { amb = { g: null, level: 0 }; return; }
    }
    if (!amb.g || Math.abs(amb.level - level) < 0.004) return;
    amb.level = level;
    try { amb.g.gain.setTargetAtTime(level, c.currentTime, 0.25); } catch (e) { /* ignore */ }
  }

  /* =============================================================== world */
  var world = null, match = null, T = 0;
  var cam = { x: W / 2, y: H / 2, z: 1 };
  var HOMES = [[W / 2 - 150, 250], [W / 2 + 150, W - 250]];

  function makeWorld(teams, modId, opts) {
    opts = opts || {};
    var P = WS.makeParams(modId);
    var w = new WS.World(P);
    var homes = opts.homes || HOMES;
    for (var side = 0; side < 2; side++) {
      var Tm = teams[side];
      if (!Tm) continue;
      for (var i = 0; i < 2; i++) {
        var p = new WS.Player(w, Tm, side, i, homes[side][i], Tm.players[i]);
        p.hat = (opts.hats && opts.hats[side]) || 'none';
        w.players.push(p);
      }
    }
    w.mod = modId;
    return w;
  }
  // lastScorer: the team that just scored (-1 = none). The ball drops a little toward the other team.
  function dropBalls(w, lastScorer) {
    w.balls.length = 0;
    var off = lastScorer === 0 ? 45 : lastScorer === 1 ? -45 : 0;
    if (w.P.ballCount === 2) { w.addBall(W / 2 - 110 + off, 240); w.addBall(W / 2 + 110 + off, 240); }
    else w.addBall(W / 2 + off, 240);
    for (var i = 0; i < w.balls.length; i++) { var b = w.balls[i]; b.hx = b.x; b.hy = b.y; b.trail = []; }
  }
  function teamPress(side) {
    var any = false;
    for (var i = 0; i < world.players.length; i++) { var p = world.players[i]; if (p.side === side && p.press()) any = true; }
    return any;
  }
  function hatsFor(mode) {
    var h = save.hat;
    if (mode === '2p') return [h, h];
    if (mode === 'demo') return [pick(WS.HATS).id, pick(WS.HATS).id];
    return [h, 'none'];
  }

  /* ================================================================ match */
  // mode: 'cpu' | '2p' | 'cup' | 'demo' | 'show'
  function newMatch(cfg) {
    match = {
      mode: cfg.mode, teams: cfg.teams, score: [0, 0], target: cfg.target || WS.WIN_GOALS,
      skill: cfg.skill || 0.5, diff: cfg.diff, cpu: [null, null], mod: 'normal', phase: 'count', t: 0,
      buf: [0, 0], behind: 0, modsSeen: {}, hats: cfg.hats || hatsFor(cfg.mode), celebT: 0,
      goalSide: -1, time: 0, first: !!cfg.first, wob: [0, 0], homes: cfg.homes, noBall: cfg.noBall,
      coins: 0, goalsBy: [0, 0], showT: 0, cupRound: cfg.cupRound
    };
    if (cfg.mode === 'cpu' || cfg.mode === 'cup') match.cpu[1] = new WS.CPU(1, match.skill);
    if (cfg.mode === 'demo') { match.cpu[0] = new WS.CPU(0, 0.5); match.cpu[1] = new WS.CPU(1, 0.55); }
    kickoff(cfg.mod || 'normal');
    if (cfg.mode === 'show') match.phase = 'show';
  }
  function kickoff(modId) {
    var m = match;
    m.mod = modId; m.modsSeen[modId] = 1;
    world = makeWorld(m.teams, modId, { hats: m.hats, homes: m.homes });
    for (var pi = 0; pi < world.players.length; pi++) {
      var pl = world.players[pi];
      if (m.cpu[pl.side] && m.mode !== 'demo') pl.power = 0.45 + 0.55 * m.skill;   // weaker CPU kicks on easy levels
    }
    if (!m.noBall) dropBalls(world, m.goalSide >= 0 && m.mode !== 'demo' ? m.goalSide : -1);
    m.phase = 'count'; m.t = 0; m.beeps = 0; m.buf[0] = m.buf[1] = 0; m.time = 0;
    m.kickoffs = (m.kickoffs || 0) + 1;
    for (var i = 0; i < 2; i++) if (m.cpu[i]) { m.cpu[i].snap = null; m.cpu[i].cool = 0.3; m.cpu[i].pending = -1; }
    if (m.mode === 'cpu' || m.mode === 'cup' || m.mode === '2p') {
      if (!save.mods[modId]) { save.mods[modId] = 1; persist(); checkStatAch(); }
    }
    if (m.mode === 'demo') m.phase = 'count';
  }
  function humanSide(side) {
    var mo = match.mode;
    return mo === '2p' || ((mo === 'cpu' || mo === 'cup') && side === 0);
  }

  function stepMatch(dt) {
    var m = match, i, b;
    if (hitstop > 0) { hitstop -= dt; return; }
    m.t += dt;
    var ts = 1;
    var silent = m.mode === 'demo' || m.mode === 'show';
    var active = state === 'play' || m.mode === 'demo' || m.mode === 'show';
    if (!active && state !== 'over') return;

    if (m.phase === 'show') {
      world.step(dt); processEvents(true);
      for (i = 0; i < world.balls.length; i++) {
        b = world.balls[i];
        if (b.x < 230 || b.x > W - 230 || b.roofT > 0.5) { m.showT += dt; if (m.showT > 2.5) { m.showT = 0; b.x = W / 2; b.y = 240; b.vx = b.vy = 0; b.roofT = 0; } }
      }
      updateBallTrails();
      return;
    }

    if (m.phase === 'count') {
      var dur = m.mode === 'demo' ? 0.5 : 1.2;
      var nb = Math.min(3, Math.floor(m.t / 0.4) + 1);
      if (!silent && nb > m.beeps) { m.beeps = nb; S.beep(false); }
      world.step(dt);
      holdBalls();
      processEvents(silent);
      if (m.t >= dur) {
        m.phase = 'play'; m.t = 0;
        if (!silent) { S.beep(true); S.whistle(1); }
        for (i = 0; i < world.balls.length; i++) { world.balls[i].vx = rnd(-60, 60); world.balls[i].vy = 0; }
      }
      updateBallTrails();
      return;
    }

    if (m.phase === 'play') {
      m.time += dt;
      readInput(dt);
      world.step(dt);
      processEvents(silent);
      for (i = 0; i < 2; i++) if (m.cpu[i] && m.cpu[i].update(world, dt)) teamPress(i);
      for (i = 0; i < world.balls.length; i++) {
        b = world.balls[i];
        if (!isFinite(b.x) || !isFinite(b.y)) { b.x = W / 2; b.y = 240; b.vx = b.vy = 0; }
        var s = WS.goalCheck(b);
        if (s >= 0) { onGoal(s, b); break; }
        if (b.roofT > 1.1) { poofBall(b); }
      }
      for (i = 0; i < world.players.length; i++) { var p = world.players[i]; if (!isFinite(p.x) || !isFinite(p.y)) p.reset(); }
      hypeTarget();
      updateBallTrails();
      return;
    }

    if (m.phase === 'goal' || m.phase === 'end' || m.phase === 'roulette') {
      if (m.phase === 'goal') ts = m.t < 0.8 ? 0.25 : m.t < 1.3 ? lerp(0.25, 1, (m.t - 0.8) / 0.5) : 1;
      if (m.phase === 'end') ts = m.t < 1.0 ? 0.35 : 1;
      world.step(dt * ts);
      processEvents(silent);
      celebrate(dt);
      updateBallTrails();
      if (m.phase === 'goal' && m.t >= (m.mode === 'demo' ? 1.6 : 2.3)) {
        var won = m.score[0] >= m.target || m.score[1] >= m.target;
        if (m.mode === 'demo') {
          if (won) m.score = [0, 0];
          var pool = WS.MODS.filter(function (x) { return x.id !== m.mod; });
          kickoff(Math.random() < 0.3 ? 'normal' : pick(pool).id);
        } else if (won) startEnd();
        else startRoulette();
      } else if (m.phase === 'roulette') stepRoulette(dt);
      else if (m.phase === 'end' && m.t >= 1.9 && state === 'play') showResult();
    }
  }
  function holdBalls() {
    for (var i = 0; i < world.balls.length; i++) { var b = world.balls[i]; b.x = b.hx; b.y = b.hy; b.vx = b.vy = 0; b.spin = 0.6; }
  }
  function updateBallTrails() {
    for (var i = 0; i < world.balls.length; i++) {
      var b = world.balls[i], tr = b.trail || (b.trail = []);
      var fast = b.vx * b.vx + b.vy * b.vy > 560 * 560;
      if (fast) { if (tr.length >= 6) { var o = tr.shift(); o.x = b.x; o.y = b.y; tr.push(o); } else tr.push({ x: b.x, y: b.y }); }
      else if (tr.length) tr.shift();
    }
  }
  function poofBall(b) {
    stars(b.x, b.y, 12, ['#fff', '#b39ddb']);
    S.flip();
    b.x = W / 2; b.y = 220; b.vx = rnd(-50, 50); b.vy = 0; b.roofT = 0;
    popup('الكرة تعود!', W / 2, 200, '#fff', 30);
  }
  function readInput(dt) {
    var m = match, k = Kit.keys;
    var a = k.pressed('KeyW'), b = k.pressed('ArrowUp');
    if (m.mode === 'cpu' || m.mode === 'cup') {
      a = a || b || k.pressed('Space') || (pointer.pressed && state === 'play');
      b = false;
    }
    if (a) m.buf[0] = 0.14;
    if (b) m.buf[1] = 0.14;
    for (var s = 0; s < 2; s++) {
      if (m.buf[s] > 0 && humanSide(s)) {
        if (teamPress(s)) m.buf[s] = 0; else m.buf[s] -= dt;
      }
    }
  }
  function celebrate(dt) {
    var m = match;
    m.celebT -= dt;
    if (m.celebT > 0) return;
    m.celebT = rnd(0.45, 0.9);
    var side = m.phase === 'end' || state === 'over' ? m.winner : m.goalSide;
    if (side == null || side < 0) return;
    for (var i = 0; i < world.players.length; i++) {
      var p = world.players[i];
      if (p.side === side && Math.random() < 0.7) { p.press(); p.mood = 1; p.moodT = 1.5; }
      else if (p.side !== side) { p.mood = -1; p.moodT = 1; }
    }
  }
  function hypeTarget() {
    var h = 0.15;
    for (var i = 0; i < world.balls.length; i++) {
      var b = world.balls[i], d = Math.min(b.x, W - b.x);
      h = Math.max(h, clamp(1 - d / 420, 0, 1) * 0.75);
    }
    hype = lerp(hype, h, 0.05);
  }

  function processEvents(silent) {
    var ev = world.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i], p = e.who, pw = e.power;
      switch (e.type) {
        case 'jump':
          if (!silent) S.jump(p && p.side ? 1.25 : 1);
          dust(e.x, G, 3); break;
        case 'airkick':
          if (!silent) S.noise({ type: 'bandpass', f: 1800, to: 500, q: 1, dur: 0.14, vol: 0.06 });
          break;
        case 'flip':
          if (!silent) S.flip();
          stars(e.x, e.y, 5, ['#fff']); break;
        case 'kick':
          if (!silent) S.kick(pw);
          stars(e.x, e.y, pw > 800 ? 10 : 6, ['#fff', '#ffd23f', '#ffe9a0'], 200 + pw * 0.2);
          shake.add(Math.min(9, pw / 120));
          if (e.extra) { e.extra.lastHow = 'kick'; e.extra.kickX = p.x; }
          if (pw > 840 && !silent) { hitstop = 0.045; popup(pick(['بووم!', 'صاروخ!', 'قذيفة!', 'يا لها من ركلة!']), e.x, e.y - 60, '#ffd23f', 40); }
          if (p && humanSide(p.side) && !silent) { p.mood = 1; p.moodT = 0.4; }
          break;
        case 'header':
          if (!silent) S.header();
          stars(e.x, e.y, 6, ['#fff', '#8fe3ff']);
          if (e.extra) { e.extra.lastHow = 'header'; e.extra.kickX = p.x; }
          if (pw > 380 && !silent) popup('رأسية!', e.x, e.y - 60, '#8fe3ff', 34);
          break;
        case 'touch':
          if (!silent) S.touch(pw);
          if (e.extra) e.extra.lastHow = 'touch';
          break;
        case 'bounce':
          if (!silent) S.bounce(pw);
          if (pw > 420) dust(e.x, G, 3); break;
        case 'post':
          if (!silent) { S.post(); if (pw > 350) { S.ooh(); popup(e.extra === 0 ? 'العارضة!' : 'العارضة!', e.x, e.y - 50, '#fff', 34); } }
          shake.add(5); stars(e.x, e.y, 6, ['#fff']);
          if (e.extra === 0 || e.extra === 1) match.wob[e.extra] = Math.min(12, pw / 60);
          hype = Math.min(1, hype + 0.3);
          break;
        case 'wall':
          if (!silent) S.touch(Math.abs(pw) * 0.6); break;
        case 'land':
          if (!silent) S.land(pw);
          dust(e.x, G, 2); break;
        case 'bonk':
          if (!silent) S.bonk();
          stars(e.x, e.y - 10, 6, ['#ffd23f', '#fff']);
          if (p) { p.mood = -1; p.moodT = 0.9; }
          break;
        case 'thud':
          if (!silent) S.land(pw); dust(e.x, G, 2); break;
        case 'bump':
          if (!silent) S.bump(); stars(e.x, e.y, 4, ['#fff']); break;
        case 'boing':
          if (!silent) S.boing(); break;
      }
    }
    ev.length = 0;
  }

  /* ---------------------------------------------------------------- goals */
  var HOW_TXT = { header: 'ضربة رأسية!', long: 'صاروخ من بعيد!', own: 'أوبس... في مرماه!', normal: '' };
  function onGoal(side, ball) {
    var m = match, conceding = 1 - side;
    m.score[side]++;
    m.goalsBy[side]++;
    var how = 'normal';
    if (ball.lastTeam === conceding) how = 'own';
    else if (ball.lastHow === 'header') how = 'header';
    else if (ball.lastHow === 'kick' && ball.kickX != null && (side === 0 ? ball.kickX < W / 2 : ball.kickX > W / 2)) how = 'long';
    m.phase = 'goal'; m.t = 0; m.goalSide = side; m.goalBall = ball; m.goalHow = how; m.celebT = 0.5;
    var gx = side === 0 ? W - 40 : 40;
    confetti(gx, G - 60, m.mode === 'demo' ? 50 : 110, side === 0 ? -1 : 1);
    stars(ball.x, ball.y, 16, CONF, 420);
    shake.add(14); flash = 0.7; hype = 1;
    for (var i = 0; i < world.players.length; i++) {
      var p = world.players[i];
      if (p.side === side) { p.mood = 1; p.moodT = 3; } else { p.mood = -1; p.moodT = 3; }
    }
    if (m.mode === 'demo') return;
    S.goal(); S.whistle(1);
    // tracking & achievements
    var human = humanSide(side);
    if (m.mode !== '2p') {
      if (side === 0) { m.coins += 2; }
      var diff = m.score[1] - m.score[0];
      if (diff > m.behind) m.behind = diff;
    }
    if (human) {
      save.stats.goals++;
      if (how === 'header') { save.stats.headers++; unlock('header'); }
      if (how === 'long') unlock('long');
      unlock('goal1');
      checkStatAch();
      persist();
    }
    if (how === 'own' && m.mode !== '2p' && side === 0) unlock('owngoal');
  }

  /* ------------------------------------------------------------- roulette */
  function startRoulette() {
    var m = match;
    m.phase = 'roulette'; m.t = 0;
    var pool = WS.MODS.filter(function (x) { return x.id !== 'normal' && x.id !== m.mod; });
    var fresh = pool.filter(function (x) { return !m.modsSeen[x.id]; });
    var next = pick(fresh.length ? fresh : pool);
    var reel = [];
    for (var i = 0; i < 16; i++) { var r = pick(pool); if (reel.length && r === reel[reel.length - 1]) r = pick(pool); reel.push(r); }
    reel.push(next);
    m.reel = reel; m.next = next; m.reelIdx = -1; m.landed = false;
    S.drumroll(1.5);
  }
  var ROUL_SPIN = 1.6, ROUL_HOLD = 1.25;
  function reelPos(t) { return easeOutCubic(clamp(t / ROUL_SPIN, 0, 1)) * (match.reel.length - 1); }
  function stepRoulette() {
    var m = match;
    var idx = Math.floor(reelPos(m.t) + 0.5);
    if (idx !== m.reelIdx) { m.reelIdx = idx; if (!m.landed) S.tick(); }
    if (!m.landed && m.t >= ROUL_SPIN) {
      m.landed = true; S.tada(); shake.add(6);
      confetti(W / 2, 330, 40);
    }
    if (m.t >= ROUL_SPIN + ROUL_HOLD) kickoff(m.next.id);
  }

  /* ------------------------------------------------------------ match end */
  function startEnd() {
    var m = match;
    m.phase = 'end'; m.t = 0;
    m.winner = m.score[0] > m.score[1] ? 0 : 1;
    S.whistle(3);
    for (var i = 0; i < world.players.length; i++) {
      var p = world.players[i];
      p.mood = p.side === m.winner ? 1 : -1; p.moodT = 9;
    }
  }

  /* ================================================================ draw */
  function bgKey(P) { return (P.sky === 'space' ? 'space' : 'day') + (P.ice ? '-ice' : ''); }
  function render() {
    ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, 0, 0);
    if (!world) { ctx.fillStyle = '#39b7ff'; ctx.fillRect(0, 0, W, H); return; }
    var m = match, P = world.P;
    // camera
    var tz = 1, tx = W / 2, ty = H / 2;
    if (m && m.phase === 'goal' && m.t < 1.25 && m.goalBall && m.mode !== 'demo') { tz = 1.4; tx = m.goalBall.x; ty = m.goalBall.y - 40; }
    var k = 0.12;
    cam.z = lerp(cam.z, tz, k); cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k);
    var hw = W / 2 / cam.z, hh = H / 2 / cam.z;
    var cx = clamp(cam.x, hw, W - hw), cy = clamp(cam.y, hh, H - hh);
    ctx.save();
    ctx.translate(W / 2 + shake.x, H / 2 + shake.y); ctx.scale(cam.z, cam.z); ctx.translate(-cx, -cy);
    if (cam.z > 1.001 || shake.power > 0) { ctx.fillStyle = '#2c8c43'; ctx.fillRect(-40, -40, W + 80, H + 80); }
    ART.drawBg(ctx, bgKey(P));
    ART.drawSkyFx(ctx, T, P.sky === 'space');
    var cols = m && m.teams[0] && m.teams[1] ? [m.teams[0].shirt, m.teams[1].shirt] : null;
    ART.drawCrowd(ctx, T, hype, cols);
    var i, p, b;
    for (i = 0; i < world.players.length; i++) { p = world.players[i]; ART.drawShadow(ctx, p.x, Math.max(0, G - (p.pts.f0.y + p.pts.f1.y) / 2), 38 * p.s); }
    for (i = 0; i < world.balls.length; i++) { b = world.balls[i]; ART.drawShadow(ctx, b.x, G - b.y - b.r, b.r * 1.1); }
    // defenders first, then strikers
    for (var pass = 1; pass >= 0; pass--) for (i = 0; i < world.players.length; i++) { p = world.players[i]; if (p.idx === pass) ART.drawPlayer(ctx, p, p.hat); }
    var skin = P.ballSkin || (m && m.mode === 'demo' ? 'classic' : save.ball);
    for (i = 0; i < world.balls.length; i++) {
      b = world.balls[i];
      if (m && m.phase === 'count' && m.mode !== 'demo') drawDropMarker(b);
      var tr = b.trail;
      if (tr && tr.length) {
        for (var j = 0; j < tr.length; j++) { ctx.globalAlpha = 0.07 + j * 0.05; ART.circle(ctx, tr[j].x, tr[j].y, b.r * (0.6 + j * 0.07)); ctx.fillStyle = '#fff'; ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      ART.drawBall(ctx, b.x, b.y, b.r, b.ang, skin, b.squash, b.vx, b.vy, T);
    }
    for (var g = 0; g < 2; g++) {
      var wob = m ? m.wob[g] : 0;
      ART.drawGoalFront(ctx, g, wob ? Math.sin(T * 30) * wob : 0, P.bouncy, m && m.teams[g] ? m.teams[g].shirt : '#ff5a5f');
    }
    if (m) { m.wob[0] *= 0.9; m.wob[1] *= 0.9; }
    if (P.wind) drawWindFx();
    drawParts();
    drawPops();
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.35).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
    if (m && (state === 'play' || state === 'pause' || state === 'over') && m.mode !== 'demo' && m.mode !== 'show') drawHud();
  }
  function drawDropMarker(b) {
    var a = 0.5 + 0.5 * Math.sin(T * 10);
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.4 + a * 0.4).toFixed(2) + ')'; ctx.lineWidth = 4; ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.moveTo(b.x, b.y + b.r + 8); ctx.lineTo(b.x, G - 4); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.ellipse(b.x, G + 3, 30, 8, 0, 0, TAU); ctx.stroke();
  }
  function drawWindFx() {
    var wx = world.windX;
    if (Math.random() < Math.abs(wx) * 0.5) spawn('wind', wx > 0 ? -20 : W + 20, rnd(190, 600), wx * rnd(700, 1000), 0, 2, rnd(30, 70), 'rgba(255,255,255,0.55)', 0);
  }

  function fitSize(str, size, maxW) {
    var w = ART.measure(ctx, str, size);
    return w > maxW ? Math.floor(size * maxW / w) : size;
  }
  function drawHud() {
    var m = match;
    // ---- scoreboard
    var cx = W / 2, y = 14;
    ctx.save();
    ctx.fillStyle = 'rgba(29,26,46,0.35)'; ART.rr(ctx, cx - 380, y + 6, 760, 66, 22); ctx.fill();
    for (var s = 0; s < 2; s++) {
      var Tm = m.teams[s], dirx = s === 0 ? -1 : 1;
      var x0 = s === 0 ? cx - 380 : cx + 80;
      ART.rr(ctx, x0, y, 300, 62, 20); ctx.fillStyle = Tm.shirt; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.save(); ART.rr(ctx, x0, y, 300, 62, 20); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x0, y, 300, 18);
      ctx.restore();
      var fx = s === 0 ? x0 + 10 : x0 + 300 - 10 - 54;
      ART.drawFlag(ctx, Tm, fx, y + 12, 54, 36, T, 0);
      var name = Tm.name, nx = s === 0 ? x0 + 70 + 110 : x0 + 230 - 110;
      var sz = fitSize(name, 26, 210);
      var light = isLight(Tm.shirt);
      ART.text(ctx, name, nx, y + 25, { size: sz, color: light ? OUT : '#fff', stroke: light ? 'rgba(255,255,255,0.6)' : OUT, sw: 5 });
      // goal pips
      for (var gp = 0; gp < m.target; gp++) {
        var px = nx + (gp - (m.target - 1) / 2) * 20;
        if (gp < m.score[s]) {
          ART.circle(ctx, px, y + 49, 7.5); ctx.fillStyle = '#fff'; ctx.fill();
          ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
          ART.circle(ctx, px, y + 49, 2.8); ctx.fillStyle = OUT; ctx.fill();
        } else {
          ART.circle(ctx, px, y + 49, 5); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
        }
      }
      void dirx;
    }
    // score box
    var bump = m.phase === 'goal' ? Math.max(0, 1 - m.t * 2) * 0.35 : 0;
    ctx.save(); ctx.translate(cx, y + 36); ctx.scale(1 + bump, 1 + bump);
    ART.rr(ctx, -74, -40, 148, 80, 22); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = OUT; ctx.stroke();
    ART.text(ctx, m.score[0] + '', -36, 3, { size: 50, color: OUT, dir: 'ltr' });
    ART.text(ctx, '-', 0, 0, { size: 40, color: '#8a86a6', dir: 'ltr' });
    ART.text(ctx, m.score[1] + '', 36, 3, { size: 50, color: OUT, dir: 'ltr' });
    ctx.restore();
    // ---- modifier chip
    var mod = WS.modById(m.mod);
    var label = mod.name;
    var lw = ART.measure(ctx, label, 22) + 70;
    ART.rr(ctx, cx - lw / 2, y + 84, lw, 38, 19); ctx.fillStyle = mod.color; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = OUT; ctx.stroke();
    ART.modIcon(ctx, mod.icon, cx + lw / 2 - 24, y + 103, 30, T * 2);
    ART.text(ctx, label, cx - 14, y + 103, { size: 22, color: '#fff', stroke: OUT, sw: 5 });
    // cup round
    if (m.mode === 'cup' && cupRun) {
      var rn = WS.CUP_ROUNDS[Math.min(3, m.cupRound || 0)];
      ART.text(ctx, rn, 24, 34, { size: 24, align: 'left', color: '#fff', stroke: OUT, sw: 6 });
    } else if (m.mode === 'cpu') {
      var d = WS.DIFFS[m.diff || 0];
      ART.text(ctx, 'الكمبيوتر: ' + d.name, 24, 34, { size: 22, align: 'left', color: d.color, stroke: OUT, sw: 6 });
    }
    // wind gauge
    if (world.P.wind) {
      var wx = world.windX;
      ctx.save(); ctx.translate(W / 2, y + 150);
      ART.rr(ctx, -80, -18, 160, 36, 18); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.fillStyle = '#4f7cff';
      var L = wx * 62;
      ctx.fillRect(Math.min(0, L), -6, Math.abs(L), 12);
      ctx.beginPath(); ctx.moveTo(L + (wx > 0 ? 14 : -14), 0); ctx.lineTo(L, -12); ctx.lineTo(L, 12); ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // ---- key hints at kickoff
    if ((m.phase === 'count' || (m.phase === 'play' && m.time < 3.5)) && m.first && m.kickoffs <= 2) {
      var a = m.phase === 'count' ? 1 : clamp((3.5 - m.time) / 0.6, 0, 1);
      ctx.globalAlpha = a;
      for (var side = 0; side < 2; side++) {
        var hx = HOMES[side][0], hy = 372 + Math.sin(T * 6 + side) * 5;
        if (m.mode === '2p') drawKeyBubble(hx, hy, [side === 0 ? 'W' : '↑'], side === 0 ? 'اللاعب 1' : 'اللاعب 2');
        else if (side === 0) drawKeyBubble(hx, hy, ['W', 'مسافة'], 'أنت! اضغط');
        else drawKeyBubble(hx, hy, null, 'الكمبيوتر');
      }
      ctx.globalAlpha = 1;
    }

    // ---- big center texts
    if (m.phase === 'count') {
      var n = Math.floor(m.t / 0.4);
      var lt = (m.t % 0.4) / 0.4;
      var txt = n < 3 ? String(3 - n) : 'انطلق!';
      var sc = easeOutBack(Math.min(1, lt * 2.5));
      ctx.save(); ctx.translate(W / 2, 335); ctx.scale(sc, sc);
      ART.text(ctx, txt, 0, 0, { size: n < 3 ? 120 : 90, color: n < 3 ? '#fff' : '#3ddc84', stroke: OUT, sw: 16 });
      ctx.restore();
      if (m.score[0] + m.score[1] === 0 && m.mode !== 'show') {
        ART.text(ctx, 'أول من يسجّل ' + m.target + ' أهداف يفوز!', W / 2, 178, { size: 30, color: '#ffd23f', stroke: OUT, sw: 8 });
      }
    } else if (m.phase === 'play' && m.t < 0.5) {
      var gs = 1 + m.t;
      ctx.save(); ctx.translate(W / 2, 335); ctx.scale(gs, gs);
      ART.text(ctx, 'انطلق!', 0, 0, { size: 90, color: '#3ddc84', stroke: OUT, sw: 16, alpha: 1 - m.t / 0.5 });
      ctx.restore();
    } else if (m.phase === 'goal') {
      drawGoalBanner();
    } else if (m.phase === 'roulette') {
      drawRoulette();
    } else if (m.phase === 'end' && state === 'play') {
      var e = clamp(m.t / 0.4, 0, 1);
      ctx.save(); ctx.translate(W / 2, 290); ctx.scale(easeOutBack(e), easeOutBack(e)); ctx.rotate(-0.04);
      ART.text(ctx, 'انتهت المباراة!', 0, 0, { size: 78, color: '#fff', stroke: OUT, sw: 14 });
      ctx.restore();
    }
  }
  function isLight(hex) {
    var n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 > 200;
  }
  function drawKeyBubble(x, y, keys, label) {
    var lw = ART.measure(ctx, label, 20);
    var kw = 0, i;
    if (keys) { ctx.font = '700 19px Fredoka'; for (i = 0; i < keys.length; i++) kw += Math.max(34, ctx.measureText(keys[i]).width + 20) + 6; }
    var w = Math.max(lw, kw) + 28, h = keys ? 76 : 44;
    x = clamp(x, w / 2 + 10, W - w / 2 - 10);
    ctx.save();
    ART.rr(ctx, x - w / 2, y - h, w, h, 14); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 10, y - 2); ctx.lineTo(x, y + 12); ctx.lineTo(x + 10, y - 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x, y + 12); ctx.lineTo(x + 10, y); ctx.stroke();
    ART.text(ctx, label, x, y - h + 20, { size: 20, color: OUT });
    if (keys) {
      var kx = x + kw / 2 - 3;   // keys read left-to-right physically; start from the right for RTL grouping
      var kxs = [];
      for (i = 0; i < keys.length; i++) { var w2 = Math.max(34, ctx.measureText(keys[i]).width + 20); kxs.push(w2); }
      kx = x - kw / 2 + 3;
      for (i = 0; i < keys.length; i++) { ART.keycap(ctx, keys[i], kx + kxs[i] / 2, y - 24, 32); kx += kxs[i] + 6; }
    }
    ctx.restore();
  }
  function drawGoalBanner() {
    var m = match, t = m.t;
    var e = easeOutBack(clamp(t / 0.35, 0, 1));
    var out = t > 1.95 ? clamp((t - 1.95) / 0.3, 0, 1) : 0;
    var Tm = m.teams[m.goalSide];
    ctx.save(); ctx.translate(W / 2, 300 - out * 450); ctx.rotate(-0.06 + Math.sin(t * 6) * 0.03); ctx.scale(e, e);
    // burst
    ctx.save(); ctx.rotate(t * 0.8);
    for (var i = 0; i < 14; i++) {
      ctx.rotate(TAU / 14);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(420, -40); ctx.lineTo(420, 40); ctx.closePath();
      ctx.fillStyle = i % 2 ? 'rgba(255,210,63,0.35)' : 'rgba(255,255,255,0.22)'; ctx.fill();
    }
    ctx.restore();
    ART.text(ctx, 'هدف!', 0, 0, { size: 150, color: '#ffd23f', stroke: OUT, sw: 22, shadow: OUT });
    var sub = HOW_TXT[m.goalHow] || '';
    var who = m.mode === '2p' ? (m.goalSide === 0 ? 'اللاعب 1' : 'اللاعب 2') : (m.goalSide === 0 ? 'أنت' : 'الكمبيوتر');
    var line2 = sub || ('سجّل ' + Tm.name + '!');
    ART.text(ctx, line2, 0, 104, { size: 40, color: '#fff', stroke: OUT, sw: 10 });
    ART.text(ctx, who, 0, -98, { size: 36, color: Tm.shirt, stroke: OUT, sw: 9 });
    ctx.restore();
  }
  function drawRoulette() {
    var m = match, t = m.t;
    var appear = easeOutBack(clamp(t / 0.3, 0, 1));
    var leave = t > ROUL_SPIN + ROUL_HOLD - 0.25 ? clamp((t - (ROUL_SPIN + ROUL_HOLD - 0.25)) / 0.25, 0, 1) : 0;
    ctx.fillStyle = 'rgba(20,16,50,' + (0.45 * (1 - leave)).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
    var mod = m.landed ? m.next : m.reel[clamp(m.reelIdx, 0, m.reel.length - 1)];
    ctx.save(); ctx.translate(W / 2, 360 + leave * 500); ctx.scale(appear, appear);
    var pw = 620, ph = 300;
    var pop = m.landed ? 1 + Math.max(0, 0.12 - (t - ROUL_SPIN) * 0.4) : 1;
    ctx.scale(pop, pop);
    ART.rr(ctx, -pw / 2, -ph / 2 + 10, pw, ph, 34); ctx.fillStyle = 'rgba(29,26,46,0.6)'; ctx.fill();
    ART.rr(ctx, -pw / 2, -ph / 2, pw, ph, 34); ctx.fillStyle = m.landed ? mod.color : '#ffffff'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = OUT; ctx.stroke();
    ART.rr(ctx, -pw / 2 + 50, -ph / 2 - 30, pw - 100, 58, 26); ctx.fillStyle = '#ff5fae'; ctx.fill(); ctx.lineWidth = 5; ctx.stroke();
    ART.text(ctx, 'مفاجأة مجنونة!', 0, -ph / 2 - 1, { size: 36, color: '#fff', stroke: OUT, sw: 8 });
    // slot window
    var pos = reelPos(t), frac = pos - Math.floor(pos);
    ctx.save();
    ART.rr(ctx, -pw / 2 + 24, -ph / 2 + 42, pw - 48, 150, 24); ctx.fillStyle = m.landed ? 'rgba(255,255,255,0.3)' : '#f3f0fa'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.clip();
    if (!m.landed) {
      for (var k = -1; k <= 1; k++) {
        var ri = Math.floor(pos) + k;
        if (ri < 0 || ri >= m.reel.length) continue;
        var md = m.reel[ri], yy = -ph / 2 + 117 + (k - frac) * 150;
        ART.modIcon(ctx, md.icon, 190, yy, 96, t * 4);
        ART.text(ctx, md.name, -50, yy, { size: 50, color: OUT, stroke: '#fff', sw: 6 });
      }
    } else {
      var yy2 = -ph / 2 + 117;
      ctx.save(); ctx.translate(190, yy2); ctx.rotate(Math.sin(t * 8) * 0.15); ART.modIcon(ctx, mod.icon, 0, 0, 110, t * 4); ctx.restore();
      ART.text(ctx, mod.name, -50, yy2, { size: fitSize(mod.name, 56, 380), color: '#fff', stroke: OUT, sw: 11 });
    }
    ctx.restore();
    if (m.landed) ART.text(ctx, mod.desc, 0, ph / 2 - 56, { size: fitSize(mod.desc, 30, pw - 60), color: '#fff', stroke: OUT, sw: 8 });
    else ART.text(ctx, 'ماذا سيحدث...', 0, ph / 2 - 56, { size: 30, color: OUT });
    ctx.restore();
  }

  /* ================================================================== UI */
  var state = 'title', prevState = 'title';
  var SCR = ['title', 'select', 'cup', 'shop', 'ach', 'pause', 'over'];
  function showScr(name) {
    for (var i = 0; i < SCR.length; i++) $('scr-' + SCR[i]).hidden = SCR[i] !== name;
    $('bPause').hidden = !(name === null && state === 'play');
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* ignore */ }
    enterT = 0;
  }
  var enterT = 0;
  function toast(title, sub) {
    var box = $('toasts');
    var d = document.createElement('div');
    d.className = 'toast';
    d.textContent = title;
    if (sub) { var s = document.createElement('small'); s.textContent = sub; d.appendChild(s); }
    box.appendChild(d);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 3700);
  }
  function btn(id, fn) {
    var el = $(id);
    el.addEventListener('click', function (e) { e.stopPropagation(); Kit.audio.unlock(); S.click(); fn(e); });
    el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    el.addEventListener('mouseenter', function () { S.hover(); });
  }
  function flagInto(cv, Tm) {
    var c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.save(); c.scale(cv.width / 180, cv.height / 120);
    ART.drawFlag(c, Tm, 4, 4, 172, 112, 0, 0);
    c.restore();
  }

  /* ------------------------------------------------------------- title */
  function ownedTeams() { return WS.TEAMS.filter(function (t) { return owns('teams', t.id); }); }
  function goTitle() {
    state = 'title'; showScr('title');
    cupRun = null;
    var a = pick(WS.TEAMS.filter(function (t) { return !t.secret; })), b;
    do { b = pick(WS.TEAMS.filter(function (t) { return !t.secret; })); } while (b === a);
    newMatch({ mode: 'demo', teams: [a, b], target: 5 });
    refreshTitle();
  }
  function refreshTitle() {
    $('tCoins').textContent = save.coins;
    $('tWins').textContent = save.stats.wins;
    $('tGoals').textContent = save.stats.goals;
    var got = Object.keys(save.ach).length;
    $('tAch').textContent = got + ' / ' + ACH.length;
    // next unlock goal
    var next = null;
    WS.TEAMS.forEach(function (t) { if (!t.secret && !owns('teams', t.id) && (!next || t.cost < next.cost)) next = t; });
    var bar = $('tBar'), nx = $('tNext');
    if (next) {
      bar.style.width = Math.min(100, save.coins / next.cost * 100) + '%';
      nx.textContent = save.coins >= next.cost ? 'يمكنك شراء فريق ' + next.name + '!' : 'فريق جديد: ' + next.name + ' (' + next.cost + ')';
    } else {
      bar.style.width = '100%';
      nx.textContent = owns('teams', 'golden') ? 'أنت بطل الأبطال!' : 'اربح الكأس الذهبية لفريق سرّي!';
    }
    drawCupsCanvas($('tCups'));
  }
  function drawCupsCanvas(cv) {
    var c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    for (var i = 0; i < 3; i++) {
      var cup = WS.CUPS[i];
      ART.trophy(c, 40 + i * 70, 36, 56, cup.color, cup.dark, !save.cups[cup.id]);
    }
  }
  btn('b1p', function () { goSelect('cpu'); });
  btn('b2p', function () { goSelect('2p'); });
  btn('bCup', function () { goSelect('cup'); });
  btn('bShop', function () { goShop(); });
  btn('bAchv', function () { goAch(); });

  /* ------------------------------------------------------------ select */
  var sel = { mode: 'cpu', t: [0, 1], diff: 0, cup: 0 };
  function teamIdx(id) { for (var i = 0; i < WS.TEAMS.length; i++) if (WS.TEAMS[i].id === id) return i; return 0; }
  function goSelect(mode) {
    state = 'select'; showScr('select');
    sel.mode = mode;
    sel.t[0] = teamIdx(save.team);
    sel.t[1] = teamIdx(mode === '2p' ? save.p2 : save.opp);
    if (sel.t[1] === sel.t[0]) sel.t[1] = cycleIdx(1, 1, true);
    sel.diff = save.diff || 0;
    sel.cup = firstOpenCup();
    $('selTitle').textContent = mode === '2p' ? 'اختارا فريقيكما!' : mode === 'cup' ? 'بطولة الكأس!' : 'اختر فريقك!';
    $('who0').textContent = mode === '2p' ? 'اللاعب 1' : 'فريقك';
    $('who1').textContent = mode === '2p' ? 'اللاعب 2' : 'الخصم';
    $('tc1').hidden = mode === 'cup';
    $('cupPick').hidden = mode !== 'cup';
    document.querySelector('#scr-select .vs').hidden = mode === 'cup';
    $('diffBox').hidden = mode !== 'cpu';
    $('keys0').innerHTML = '<span dir="ltr"><span class="sg-key">A</span><span class="sg-key">D</span></span> لتغيير الفريق' + (mode === '2p' ? ' • اللعب بـ <span class="sg-key">W</span>' : '');
    $('keys1').innerHTML = '<span dir="ltr"><span class="sg-key">←</span><span class="sg-key">→</span></span> لتغيير الفريق' + (mode === '2p' ? ' • اللعب بـ <span class="sg-key">↑</span>' : '');
    $('tc0').style.left = '110px';
    $('bGo').innerHTML = (mode === 'cup' ? 'إلى الكأس!' : 'ابدأ!') + ' <small dir="ltr">Enter</small>';
    buildDiff(); buildCupList();
    refreshSelect(-1);
  }
  function firstOpenCup() {
    for (var i = 0; i < WS.CUPS.length; i++) if (!save.cups[WS.CUPS[i].id]) return cupUnlocked(i) ? i : Math.max(0, i - 1);
    return WS.CUPS.length - 1;
  }
  function cupUnlocked(i) { return i === 0 || !!save.cups[WS.CUPS[i - 1].id]; }
  function pickable(side, i) {
    var t = WS.TEAMS[i];
    if (t.secret && !owns('teams', t.id)) return false;
    if (side === 1 && sel.mode === '2p' && !owns('teams', t.id)) return false;
    return true;
  }
  function cycleIdx(side, d, avoidOther) {
    var n = WS.TEAMS.length, i = sel.t[side];
    for (var k = 0; k < n; k++) {
      i = (i + d + n) % n;
      if (!pickable(side, i)) continue;
      if (avoidOther !== false && sel.mode !== 'cup' && i === sel.t[1 - side]) continue;
      return i;
    }
    return sel.t[side];
  }
  function changeTeam(side, d) {
    if (side === 1 && sel.mode === 'cup') return;
    sel.t[side] = cycleIdx(side, d);
    S.click();
    refreshSelect(side);
  }
  function needsOwn(side) { return side === 0 || sel.mode === '2p'; }
  function refreshSelect(changed) {
    $('selCoins').textContent = save.coins;
    for (var s = 0; s < 2; s++) {
      var Tm = WS.TEAMS[sel.t[s]];
      $('tn' + s).textContent = Tm.name;
      flagInto($('flag' + s), Tm);
    }
    var Tm0 = WS.TEAMS[sel.t[0]];
    var locked0 = !owns('teams', Tm0.id);
    $('lock0').hidden = !locked0;
    $('price0').textContent = Tm0.cost;
    $('buy0').className = 'buy' + (save.coins >= Tm0.cost ? '' : ' no');
    var locked1 = sel.mode === '2p' && !owns('teams', WS.TEAMS[sel.t[1]].id);
    var okGo = !locked0 && !locked1 && (sel.mode !== 'cup' || cupUnlocked(sel.cup));
    $('bGo').className = 'fight' + (okGo ? '' : ' no');
    // 2P: P2 can also buy — reuse lock row by marking the name
    // showcase world
    var teams = [WS.TEAMS[sel.t[0]], sel.mode === 'cup' ? null : WS.TEAMS[sel.t[1]]];
    var hats = sel.mode === '2p' ? [save.hat, save.hat] : [save.hat, 'none'];
    newMatch({ mode: 'show', teams: teams, hats: hats, noBall: false });
    if (changed >= 0) { teamPress(changed); }
    for (var d = 0; d < 3; d++) { var b = $('diffBox').children[d]; if (b) b.className = d === sel.diff ? 'on' : ''; }
    var cl = $('cupList').children;
    for (var c = 0; c < cl.length; c++) cl[c].className = 'cupbtn' + (c === sel.cup ? ' on' : '') + (cupUnlocked(c) ? '' : ' locked');
  }
  function buildDiff() {
    var box = $('diffBox');
    box.innerHTML = '';
    WS.DIFFS.forEach(function (d, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<i>' + (i + 1) + '</i><b>' + d.name + '</b><span><span class="coin sm"></span>+' + d.reward + '</span>';
      b.addEventListener('click', function (e) { e.stopPropagation(); S.click(); sel.diff = i; refreshSelect(-1); });
      b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      box.appendChild(b);
    });
  }
  function buildCupList() {
    var box = $('cupList');
    box.innerHTML = '';
    WS.CUPS.forEach(function (cup, i) {
      var b = document.createElement('button');
      b.type = 'button';
      var cv = document.createElement('canvas'); cv.width = 108; cv.height = 108;
      ART.trophy(cv.getContext('2d'), 54, 58, 92, cup.color, cup.dark, !cupUnlocked(i));
      b.appendChild(cv);
      var d = document.createElement('div');
      var info = cupUnlocked(i) ? ('4 مباريات • الجائزة ' + cup.reward + ' عملة') : ('اربح ' + WS.CUPS[i - 1].name + ' أولًا');
      d.innerHTML = '<b>' + cup.name + '</b><span>' + info + '</span>';
      b.appendChild(d);
      if (save.cups[cup.id]) { var ok = document.createElement('div'); ok.className = 'done'; ok.textContent = '✔'; b.appendChild(ok); }
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!cupUnlocked(i)) { S.nope(); shakeEl(b); return; }
        S.click(); sel.cup = i; refreshSelect(-1);
      });
      b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      box.appendChild(b);
    });
  }
  function shakeEl(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); setTimeout(function () { el.classList.remove('shake'); }, 320); }
  Array.prototype.forEach.call(document.querySelectorAll('[data-arr]'), function (b) {
    var a = b.getAttribute('data-arr').split(',');
    b.addEventListener('click', function (e) { e.stopPropagation(); changeTeam(+a[0], +a[1]); });
    b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  });
  btn('buy0', function () { buyTeam(WS.TEAMS[sel.t[0]], $('buy0')); refreshSelect(0); });
  btn('bBack', function () { goTitle(); });
  btn('bGo', function () { selectGo(); });
  function buyTeam(Tm, el) {
    if (owns('teams', Tm.id)) return true;
    if (Tm.secret || save.coins < Tm.cost) { S.nope(); if (el) shakeEl(el); toast('تحتاج ' + Tm.cost + ' عملة', 'العب مباريات لتجمع المزيد!'); return false; }
    save.coins -= Tm.cost; save.teams.push(Tm.id); persist();
    S.buy(); toast('فريق جديد: ' + Tm.name + '!');
    confetti(W / 2, 420, 60);
    unlock('shop'); checkStatAch();
    return true;
  }
  function selectGo() {
    var Tm0 = WS.TEAMS[sel.t[0]], Tm1 = WS.TEAMS[sel.t[1]];
    if (!owns('teams', Tm0.id)) { S.nope(); shakeEl($('tc0')); toast('هذا الفريق مقفل!', 'اشترِه أولًا أو اختر فريقًا آخر'); return; }
    if (sel.mode === '2p' && !owns('teams', Tm1.id)) { sel.t[1] = cycleIdx(1, 1); refreshSelect(1); return; }
    save.team = Tm0.id;
    if (sel.mode === '2p') save.p2 = Tm1.id; else if (sel.mode === 'cpu') save.opp = Tm1.id;
    save.diff = sel.diff;
    persist();
    if (sel.mode === 'cup') {
      if (!cupUnlocked(sel.cup)) { S.nope(); shakeEl($('cupPick')); return; }
      startCup(sel.cup);
      return;
    }
    startMatch(sel.mode);
  }
  var lastCfg = null;
  function startMatch(mode) {
    var cfg;
    if (mode === 'cpu') {
      var d = WS.DIFFS[save.diff || 0];
      cfg = { mode: 'cpu', teams: [WS.teamById(save.team), WS.teamById(save.opp === save.team ? 'melon' : save.opp)], skill: d.skill, diff: save.diff || 0, target: WS.WIN_GOALS };
      if (cfg.teams[0] === cfg.teams[1]) cfg.teams[1] = WS.teamById(save.team === 'melon' ? 'pancake' : 'melon');
    } else if (mode === '2p') {
      cfg = { mode: '2p', teams: [WS.teamById(save.team), WS.teamById(save.p2)], target: WS.WIN_GOALS };
      if (cfg.teams[0] === cfg.teams[1]) cfg.teams[1] = WS.teamById(save.team === 'melon' ? 'pancake' : 'melon');
    } else if (mode === 'cup') {
      var cup = WS.CUPS[cupRun.id];
      cfg = { mode: 'cup', teams: [WS.teamById(cupRun.team), WS.teamById(cupRun.opps[cupRun.round])], skill: cup.skills[cupRun.round], target: WS.CUP_GOALS, cupRound: cupRun.round };
    }
    cfg.first = save.stats.matches < 3 || mode === '2p';
    lastCfg = cfg;
    beginMatch(cfg);
  }
  function beginMatch(cfg) {
    newMatch(cfg);
    parts.length = 0; pops.length = 0;
    state = 'play'; showScr(null);
    $('bPause').hidden = false;
    hype = 0.3;
    S.cheer(false);
  }
  function quickPlay() {
    if (!owns('teams', save.team)) save.team = 'pancake';
    startMatch('cpu');
  }

  /* --------------------------------------------------------------- cup */
  var cupRun = null;
  function startCup(i) {
    var mine = save.team;
    var pool = WS.TEAMS.filter(function (t) { return t.id !== mine && !t.secret; }).map(function (t) { return t.id; });
    Kit.shuffle(pool);
    var opps = pool.slice(0, 4);
    if (i === 2 && mine !== 'golden') opps[3] = 'golden';   // the golden final boss
    cupRun = { id: i, round: 0, opps: opps, team: mine };
    goBracket();
  }
  function goBracket() {
    state = 'cup'; showScr('cup');
    var cup = WS.CUPS[cupRun.id];
    $('cupTitle').textContent = cup.name;
    var box = $('bracket');
    box.innerHTML = '';
    for (var r = 0; r < 4; r++) {
      var Tm = WS.teamById(cupRun.opps[r]);
      var d = document.createElement('div');
      d.className = 'node' + (r < cupRun.round ? ' won' : r === cupRun.round ? ' cur' : ' next');
      var rn = document.createElement('div'); rn.className = 'rn'; rn.textContent = WS.CUP_ROUNDS[r]; d.appendChild(rn);
      var cv = document.createElement('canvas'); cv.width = 180; cv.height = 120; flagInto(cv, Tm); d.appendChild(cv);
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = Tm.name; d.appendChild(nm);
      var st = document.createElement('div'); st.className = 'st';
      st.textContent = r < cupRun.round ? '✔ فزت!' : r === cupRun.round ? 'المباراة التالية' : '؟';
      d.appendChild(st);
      box.appendChild(d);
    }
    $('cupInfo').textContent = 'أول من يسجّل ' + WS.CUP_GOALS + ' أهداف يفوز • الجائزة: ' + cup.reward + ' عملة';
    newMatch({ mode: 'show', teams: [WS.teamById(cupRun.team), WS.teamById(cupRun.opps[cupRun.round])], hats: [save.hat, 'none'] });
  }
  btn('bCupPlay', function () { startMatch('cup'); });
  btn('bCupQuit', function () { cupRun = null; goTitle(); });

  /* -------------------------------------------------------------- shop */
  var shopTab = 'balls';
  function goShop() {
    state = 'shop'; showScr('shop');
    shopShowcase();
    buildShop();
  }
  function shopShowcase() {
    var Tm = WS.teamById(save.team);
    newMatch({ mode: 'show', teams: [null, Tm], hats: ['none', save.hat], homes: [[0, 0], [930, 1110]] });
    world.balls.length = 0;
    world.addBall(1020, 300);
    world.balls[0].trail = [];
  }
  function buildShop() {
    $('sCoins').textContent = save.coins;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.className = 'tab' + (t.getAttribute('data-tab') === shopTab ? ' on' : ''); });
    var grid = $('shopGrid');
    grid.innerHTML = '';
    grid.className = 'grid' + (shopTab === 'teams' ? ' t5' : '');
    var list = shopTab === 'balls' ? WS.BALLS : shopTab === 'hats' ? WS.HATS : WS.TEAMS;
    list.forEach(function (it) {
      var kind = shopTab;
      var id = it.id, price = kind === 'teams' ? it.cost : it.price;
      var own = owns(kind, id);
      var eq = kind === 'balls' ? save.ball === id : kind === 'hats' ? save.hat === id : save.team === id;
      var d = document.createElement('div');
      var secret = kind === 'teams' && it.secret && !own;
      d.className = 'item' + (eq ? ' eq' : own ? ' own' : save.coins < price ? ' poor' : '') + (secret ? ' secret' : '');
      var cv = document.createElement('canvas'); cv.width = 240; cv.height = 208;
      drawItem(cv, kind, it, secret);
      d.appendChild(cv);
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = secret ? 'بطل الذهب فقط' : it.name; d.appendChild(nm);
      var pr = document.createElement('div'); pr.className = 'pr';
      if (eq) pr.textContent = kind === 'teams' ? 'فريقك ✔' : 'مُستخدَم ✔';
      else if (own) pr.textContent = 'استخدِم';
      else if (secret) pr.textContent = '🔒 سرّي';
      else { pr.innerHTML = '<span class="coin sm"></span><span dir="ltr">' + price + '</span>'; }
      d.appendChild(pr);
      d.addEventListener('click', function (e) { e.stopPropagation(); shopClick(kind, it, d); });
      d.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      grid.appendChild(d);
    });
  }
  function drawItem(cv, kind, it, secret) {
    var c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    if (kind === 'balls') {
      c.fillStyle = 'rgba(0,0,0,0.15)'; c.beginPath(); c.ellipse(120, 180, 60, 12, 0, 0, TAU); c.fill();
      ART.drawBall(c, 120, 100, 66, 0.3, it.id, 0, 0, 0, 0.5);
    } else if (kind === 'hats') {
      var R = 52, x = 120, y = 128;
      ART.circle(c, x, y, R); c.fillStyle = '#f2c08f'; c.fill(); c.lineWidth = 5; c.strokeStyle = OUT; c.stroke();
      for (var e = 0; e < 2; e++) {
        var ex = x - 16 + e * 36, ey = y - 8;
        ART.circle(c, ex, ey, 17); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 4; c.stroke();
        ART.circle(c, ex + 5, ey + 4, 8); c.fillStyle = OUT; c.fill();
      }
      c.beginPath(); c.arc(x + 4, y + 22, 14, 0.15 * Math.PI, 0.85 * Math.PI); c.lineWidth = 4; c.stroke();
      if (it.id !== 'none') { c.save(); c.translate(x, y); c.scale(0.9, 0.9); ART.hat(c, it.id, 0, 0, R, 0.6); c.restore(); }
    } else {
      c.save(); c.translate(20, 34);
      ART.drawFlag(c, it, 0, 0, 200, 134, 0, 0);
      c.restore();
      if (secret) { c.fillStyle = 'rgba(40,36,70,0.75)'; ART.rr(c, 20, 34, 200, 134, 6); c.fill(); ART.lock(c, 120, 100, 70); }
    }
  }
  function shopClick(kind, it, el) {
    var id = it.id, price = kind === 'teams' ? it.cost : it.price;
    if (kind === 'teams') {
      if (!owns('teams', id)) { if (!buyTeam(it, el)) return; }
      save.team = id; persist();
      S.pop && S.pop();
    } else if (!owns(kind, id)) {
      if (save.coins < price) { S.nope(); shakeEl(el); toast('تحتاج ' + price + ' عملة', 'العب مباريات لتجمع المزيد!'); return; }
      save.coins -= price; save[kind].push(id);
      S.buy(); toast('اشتريت: ' + it.name + '!');
      unlock('shop');
    } else S.click();
    if (kind === 'balls') save.ball = id;
    if (kind === 'hats') save.hat = id;
    persist();
    shopShowcase();
    teamPress(1);
    confetti(1020, 420, 40);
    buildShop();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
    t.addEventListener('click', function (e) { e.stopPropagation(); S.click(); shopTab = t.getAttribute('data-tab'); buildShop(); });
    t.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  });
  btn('bShopBack', function () { goTitle(); });

  /* ------------------------------------------------------ achievements */
  function goAch() {
    state = 'ach'; showScr('ach');
    var box = $('achList');
    box.innerHTML = '';
    ACH.forEach(function (a) {
      var d = document.createElement('div');
      d.className = 'ach' + (save.ach[a.id] ? ' got' : '');
      var prog = a.goal && !save.ach[a.id] ? ' (' + Math.min(a.goal, a.stat()) + '/' + a.goal + ')' : '';
      d.innerHTML = '<div class="ic">' + a.ic + '</div><div><b></b><span></span></div>' + (a.rw ? '<div class="rw"><span class="coin sm"></span>' + a.rw + '</div>' : '');
      d.querySelector('b').textContent = a.name;
      d.querySelector('span').textContent = a.desc + prog;
      box.appendChild(d);
    });
    newMatch({ mode: 'show', teams: [WS.teamById(save.team), null], hats: [save.hat, 'none'], homes: [[120, 1160], [0, 0]] });
    world.balls.length = 0;
  }
  btn('bAchBack', function () { goTitle(); });

  /* -------------------------------------------------------------- pause */
  function pauseGame() {
    if (state !== 'play') return;
    state = 'pause'; showScr('pause');
    Kit.keys.reset();
  }
  function resumeGame() {
    if (state !== 'pause') return;
    state = 'play'; showScr(null); $('bPause').hidden = false;
  }
  btn('bResume', resumeGame);
  btn('bRestart', function () { if (lastCfg) beginMatch(lastCfg); });
  btn('bMenu', function () { goTitle(); });
  btn('bPause', function () { if (state === 'play') pauseGame(); else resumeGame(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pauseGame(); });
  window.addEventListener('blur', function () { if (state === 'play' && match && match.phase === 'play') pauseGame(); });

  /* ------------------------------------------------------------- result */
  var resultAct = null;
  function showResult() {
    var m = match;
    state = 'over';
    var win = m.winner === 0;
    var lines = [];
    var coins = 0;
    save.stats.matches++;
    var oHead = $('oHead');
    if (m.mode === '2p') {
      coins = 10;
      oHead.textContent = m.winner === 0 ? 'فاز اللاعب 1!' : 'فاز اللاعب 2!';
      oHead.style.color = m.teams[m.winner].shirt;
      lines.push('مباراة رائعة! ' + plus(10) + ' عملة لكما');
      unlock('duo');
    } else {
      coins = m.goalsBy[0] * 2;
      if (win) {
        save.stats.wins++;
        oHead.textContent = pick(['فوز رائع!', 'أنت بطل!', 'انتصار مجنون!']);
        oHead.style.color = '#ffd23f';
        if (m.mode === 'cpu') {
          var d = WS.DIFFS[m.diff || 0];
          coins += d.reward;
          lines.push('فوز على مستوى ' + d.name + ': ' + plus(d.reward));
          if (m.diff === 2) unlock('hard');
        } else coins += 10;
        if (m.score[1] === 0) { coins += 10; lines.push('شباك نظيفة! ' + plus(10)); unlock('clean'); }
        if (m.behind >= 2) unlock('comeback');
        unlock('win1');
      } else {
        oHead.textContent = pick(['كدت تفوز!', 'خسارة...', 'حاول مجددًا!']);
        oHead.style.color = '#ff8fb1';
        coins += 3;
        lines.push(m.score[0] >= m.target - 1 ? 'كنت قريبًا جدًا! هدف واحد فقط!' : 'لا بأس! كل مباراة تجعلك أقوى');
      }
      if (m.goalsBy[0]) lines.push('أهدافك (' + m.goalsBy[0] + '): ' + plus(m.goalsBy[0] * 2));
    }
    // cup progression
    var again = 'العب مجددًا', againFn = function () { beginMatch(lastCfg); };
    if (m.mode === 'cup' && cupRun) {
      var cup = WS.CUPS[cupRun.id];
      if (win) {
        cupRun.round++;
        if (cupRun.round >= 4) {
          coins += cup.reward;
          var firstTime = !save.cups[cup.id];
          save.cups[cup.id] = true;
          oHead.textContent = 'بطل ' + cup.name + '!';
          lines.unshift('🏆 جائزة الكأس: ' + plus(cup.reward));
          unlock(cup.id);
          if (cupRun.id === 2 && !owns('teams', 'golden')) { save.teams.push('golden'); lines.push('<span class="new">جديد</span> فريق النجوم الذهبية السرّي!'); }
          else if (firstTime && cupRun.id < 2) lines.push('<span class="new">جديد</span> فُتحت ' + WS.CUPS[cupRun.id + 1].name + '!');
          S.trophy();
          again = 'رائع!'; againFn = function () { cupRun = null; goSelect('cup'); };
        } else {
          lines.unshift('تأهلت إلى ' + WS.CUP_ROUNDS[cupRun.round] + '!');
          again = 'التالي: ' + WS.CUP_ROUNDS[cupRun.round]; againFn = function () { goBracket(); };
        }
      } else {
        again = 'أعد المباراة'; againFn = function () { startMatch('cup'); };
      }
    }
    save.coins += coins;
    persist();
    checkStatAch();
    if (!(m.mode === 'cup' && cupRun && cupRun.round >= 4)) { if (win || m.mode === '2p') S.win(); else S.lose(); }
    // score row
    var sc = $('oScore');
    sc.innerHTML = '';
    var mk = function (Tm) { var cv = document.createElement('canvas'); cv.width = 180; cv.height = 120; flagInto(cv, Tm); return cv; };
    var n0 = document.createElement('div'); n0.className = 'tn'; n0.textContent = m.teams[0].name;
    var n1 = document.createElement('div'); n1.className = 'tn'; n1.textContent = m.teams[1].name;
    var s = document.createElement('div'); s.className = 'sc'; s.textContent = m.score[0] + ' - ' + m.score[1];
    sc.appendChild(mk(m.teams[0])); sc.appendChild(n0); sc.appendChild(s); sc.appendChild(n1); sc.appendChild(mk(m.teams[1]));
    $('oLines').innerHTML = lines.map(function (l, i) { return '<div class="line" style="animation-delay:' + (0.3 + i * 0.25) + 's">' + l + '</div>'; }).join('');
    countCoins(coins);
    var champ = m.mode === 'cup' && cupRun && cupRun.round >= 4;
    var tc = $('oTrophy');
    tc.hidden = !champ;
    if (champ) {
      var cc = tc.getContext('2d'), cupD = WS.CUPS[cupRun.id];
      cc.clearRect(0, 0, tc.width, tc.height);
      ART.trophy(cc, 80, 86, 130, cupD.color, cupD.dark, false);
    }
    oHead.style.fontSize = oHead.textContent.length > 13 ? '58px' : '';
    $('bAgain').innerHTML = again + ' <small dir="ltr">Enter</small>';
    resultAct = againFn;
    showScr('over');
    $('bPause').hidden = true;
  }
  function countCoins(n) {
    var el = $('oCoinN'), t0 = performance.now();
    el.textContent = '+0';
    function f() {
      var k = Math.min(1, (performance.now() - t0) / 900);
      el.textContent = '+' + Math.round(n * k);
      if (k < 1 && state === 'over') requestAnimationFrame(f);
      else el.textContent = '+' + n;
    }
    requestAnimationFrame(f);
    for (var i = 0; i < 6; i++) setTimeout(function () { S.coin(); }, 200 + i * 110);
  }
  btn('bAgain', function () { if (resultAct) resultAct(); });
  btn('bOverMenu', function () { goTitle(); });

  function refreshAllCanvases() {
    if (state === 'title') refreshTitle();
    if (state === 'select') refreshSelect(-1);
  }

  /* ----------------------------------------------------------- keyboard */
  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var c = e.code;
    var go = c === 'Enter' || c === 'NumpadEnter' || c === 'Space';
    if (go || c === 'Escape') e.preventDefault();
    switch (state) {
      case 'title':
        if (go) { S.click(); quickPlay(); }
        break;
      case 'select':
        if (go) { S.click(); selectGo(); }
        else if (c === 'Escape') goTitle();
        else if (c === 'KeyA') changeTeam(0, -1);
        else if (c === 'KeyD') changeTeam(0, 1);
        else if (sel.mode === 'cup' && (c === 'ArrowUp' || c === 'ArrowDown' || c === 'ArrowLeft' || c === 'ArrowRight')) {
          var d = c === 'ArrowUp' || c === 'ArrowRight' ? -1 : 1;
          sel.cup = clamp(sel.cup + d, 0, 2); S.click(); refreshSelect(-1);
        }
        else if (c === 'ArrowLeft') changeTeam(1, -1);
        else if (c === 'ArrowRight') changeTeam(1, 1);
        else if (sel.mode === 'cpu' && (c === 'Digit1' || c === 'Digit2' || c === 'Digit3')) { sel.diff = +c.charAt(5) - 1; S.click(); refreshSelect(-1); }
        break;
      case 'cup':
        if (go) { S.click(); startMatch('cup'); }
        else if (c === 'Escape') { cupRun = null; goTitle(); }
        break;
      case 'shop': case 'ach':
        if (c === 'Escape') goTitle();
        break;
      case 'play':
        if (c === 'KeyP' || c === 'Escape') pauseGame();
        break;
      case 'pause':
        if (c === 'KeyP' || c === 'Escape' || go) resumeGame();
        else if (c === 'KeyR' && lastCfg) beginMatch(lastCfg);
        break;
      case 'over':
        if (enterT < 1.1) break;
        if (go || c === 'KeyR') { S.click(); if (resultAct) resultAct(); }
        else if (c === 'Escape') goTitle();
        break;
    }
  });

  /* ---------------------------------------------------------------- loop */
  function update(dt) {
    T += dt;
    enterT += dt;
    updateFx(dt);
    if (state !== 'pause' && world && match) {
      stepMatch(dt);
    }
    if (state !== 'play' && state !== 'over') hype = lerp(hype, 0.25, 0.02);
    var inMatch = (state === 'play' || state === 'over') && match && match.mode !== 'demo';
    ambSet(inMatch ? 0.02 + hype * 0.05 : state === 'pause' ? 0 : 0.008);
    Kit.keys.endFrame();
    pointer.endFrame();
  }
  Kit.loop(update, render);
  goTitle();

  /* --------------------------------------------------------- debug hook */
  window.__game = {
    get state() { return state; },
    get match() { return match; },
    get world() { return world; },
    get save() { return save; },
    info: function () {
      return match ? { state: state, mode: match.mode, phase: match.phase, score: match.score.slice(), mod: match.mod, balls: world.balls.length, parts: parts.length, coins: save.coins } : { state: state };
    },
    goal: function (side) { if (match && match.phase === 'play') { var b = world.balls[0]; b.lastHow = 'kick'; b.kickX = side ? W - 300 : 300; b.lastTeam = side; onGoal(side, b); } return this.info(); },
    setMod: function (id) { if (match) kickoff(id); return this.info(); },
    winNow: function () { if (match && state === 'play') { match.score[0] = match.target - 1; match.phase = 'play'; this.goal(0); } return this.info(); },
    loseNow: function () { if (match && state === 'play') { match.score[1] = match.target - 1; match.phase = 'play'; this.goal(1); } return this.info(); },
    step: function (secs) { var n = Math.round(secs * 60); for (var i = 0; i < n; i++) update(1 / 60); return this.info(); },
    addCoins: function (n) { save.coins += n; persist(); return save.coins; },
    reset: function () { store.remove('save'); location.reload(); }
  };
})();
