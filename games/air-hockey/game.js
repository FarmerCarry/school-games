/* Air Hockey (هوكي الهواء) — main game: physics, AI, match flow, effects, HUD, menus. */
(function () {
  'use strict';
  var AH = window.AH, G = AH.G, art = AH.art, S = AH.sfx;
  var W = G.W, H = G.H;
  var FONT = 'Fredoka';
  var PMAX = 2300, PMAX_FIRE = 2900, KMH = 0.058;
  var E_MALLET = 0.9, E_WALL = 0.9, E_PUCK = 0.95;
  var MOUSE_MAX = 2600, KEY_MAX = 950, KEY_ACC = 7200;

  /* ============================================================ save */
  var store = Kit.store('air-hockey');
  var save = (function () {
    var d = store.get('save', null);
    if (!d || typeof d !== 'object') d = {};
    function obj(v) { return v && typeof v === 'object' ? v : {}; }
    d.coins = +d.coins || 0;
    d.wins = obj(d.wins); d.losses = obj(d.losses); d.beaten = obj(d.beaten); d.awards = obj(d.awards);
    d.owned = obj(d.owned);
    ['mallet', 'table', 'puck'].forEach(function (k) { if (!Array.isArray(d.owned[k])) d.owned[k] = []; });
    if (d.owned.mallet.indexOf('blue') < 0) d.owned.mallet.push('blue');
    if (d.owned.table.indexOf('neon') < 0) d.owned.table.push('neon');
    if (d.owned.puck.indexOf('classic') < 0) d.owned.puck.push('classic');
    d.eq = obj(d.eq);
    d.eq.mallet = d.eq.mallet || 'blue'; d.eq.table = d.eq.table || 'neon'; d.eq.puck = d.eq.puck || 'classic';
    d.goals = [5, 7, 10].indexOf(d.goals) >= 0 ? d.goals : 7;
    d.chaos = !!d.chaos; d.mode = d.mode === 2 ? 2 : 1;
    d.bot = d.bot || 'easy'; d.bought = +d.bought || 0; d.matches = +d.matches || 0;
    return d;
  })();
  function persist() { store.set('save', save); }

  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return list[0]; }
  function botUnlocked(b) {
    if (b.id === 'hard') return !!save.beaten.medium;
    if (b.id === 'insane') return !!save.beaten.hard;
    return true;
  }
  function itemUnlocked(it) { return it.price >= 0 || !!save.beaten[it.unlock]; }
  // gold/diamond become "owned" automatically when unlocked
  function syncSpecialSkins() {
    AH.MALLETS.forEach(function (m) { if (m.price < 0 && itemUnlocked(m) && save.owned.mallet.indexOf(m.id) < 0) save.owned.mallet.push(m.id); });
  }
  syncSpecialSkins();
  if (!botUnlocked(byId(AH.BOTS, save.bot))) save.bot = 'easy';

  /* ============================================================ view */
  var canvas = document.getElementById('game');
  var uiEl = document.getElementById('ui');
  var tableImg = null, tableKey = '';
  var view = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: function (v) {
    uiEl.style.transform = 'scale(' + v.scale + ')';
    uiEl.style.left = canvas.style.left; uiEl.style.top = canvas.style.top;
  } });
  var ctx = view.ctx;
  var ptr = Kit.pointer(view);
  var mouseMoved = false;
  window.addEventListener('pointermove', function () { mouseMoved = true; });
  canvas.addEventListener('pointerdown', function () { try { canvas.focus(); } catch (e) { /* ignore */ } });

  function ensureTable() {
    var k = Math.min(2, Math.max(0.5, view.scale * view.dpr));
    k = Math.round(k * 4) / 4;
    var key = save.eq.table + '@' + k;
    if (key !== tableKey) { tableImg = art.buildTable(byId(AH.TABLES, save.eq.table), k); tableKey = key; }
  }

  /* ============================================================ world */
  var st = {
    scene: 'title',          // title | countdown | play | goal | ending | over
    paused: false,
    t: 0, stateT: 0,
    mode: 1, bot: null, goalsToWin: 7, chaos: false, demo: true,
    score: [0, 0],
    mallets: [], pucks: [], powers: [],
    goalHalf: [G.GOAL, G.GOAL], tiny: [0, 0],
    powerT: 0, respawn: [],
    stats: null, streak: { side: 0, n: 0 }, maxBehind: [0, 0],
    hitstop: 0, timeScale: 1, slowT: 0,
    flash: 0, flashCol: '#fff', zoom: 0, zoomX: G.CX, zoomY: G.CY,
    big: null, goalFlash: [0, 0],
    earned: 0, newAwards: [], matchPointShown: false, idleT: 0, winner: 0
  };
  var shake = Kit.shake();
  var dbg = { ownGoals: 0, nudges: 0, goals: 0, log: [] };

  function newStats() { return { goals: [0, 0], hits: [0, 0], fast: [0, 0], saves: [0, 0], run: [0, 0] }; }

  function makeMallet(side) {
    return { side: side, x: side < 0 ? G.L + 130 : G.R - 130, y: G.CY, vx: 0, vy: 0, avx: 0, avy: 0,
      r: G.MR, big: 0, frozen: 0, sq: 0, sqAng: 0, mood: '', moodT: 0, blink: 0, blinkT: 2 + Math.random() * 3,
      ctrl: 'ai', skin: null, face: 'normal', bot: null, ai: { t: 0, mode: 'idle', st: 0, snap: null, aimOff: 0, bank: 0, attackT: 0, hes: 0, nap: 0, napT: 6 + Math.random() * 6, contact: false }, name: '' };
  }
  var PUCK_TRAIL = 16;
  function makePuck(x, y, vx, vy) {
    return { x: x, y: y, vx: vx || 0, vy: vy || 0, r: G.PR, last: 0, bank: 0, fire: 0, scored: 0, alive: true,
      tx: new Float32Array(PUCK_TRAIL), ty: new Float32Array(PUCK_TRAIL), ti: 0, tn: 0, spawn: 0.35, stillT: 0 };
  }

  /* ---------------------------------------------------------- effects */
  var PMAXN = 420;
  var parts = [];
  for (var pi = 0; pi < PMAXN; pi++) parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, color: '#fff', drag: 0, kind: 0, rot: 0 });
  var pNext = 0;
  function emit(x, y, o) {
    var n = o.count || 10;
    for (var i = 0; i < n; i++) {
      var p = parts[pNext]; pNext = (pNext + 1) % PMAXN;
      var a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread == null ? Math.PI * 2 : o.spread) : Math.random() * Math.PI * 2;
      var sp = (o.speed || 300) * (0.35 + Math.random() * 0.65);
      p.on = true; p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.max = (o.life || 0.5) * (0.6 + Math.random() * 0.5); p.life = p.max;
      p.size = (o.size || 4) * (0.6 + Math.random() * 0.7);
      p.color = o.colors ? o.colors[(Math.random() * o.colors.length) | 0] : (o.color || '#fff');
      p.drag = o.drag == null ? 3 : o.drag; p.kind = o.kind || 0; p.rot = Math.random() * 6;
    }
  }
  function updParts(dt) {
    for (var i = 0; i < PMAXN; i++) {
      var p = parts[i]; if (!p.on) continue;
      p.life -= dt; if (p.life <= 0) { p.on = false; continue; }
      var k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 8;
    }
  }
  function drawParts() {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (var i = 0; i < PMAXN; i++) {
      var p = parts[i]; if (!p.on || p.kind === 2) continue;
      var a = p.life / p.max;
      ctx.globalAlpha = a;
      if (p.kind === 1) { // spark streak
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (i = 0; i < PMAXN; i++) { // confetti
      p = parts[i]; if (!p.on || p.kind !== 2) continue;
      ctx.globalAlpha = Math.min(1, p.life / p.max * 2);
      ctx.fillStyle = p.color;
      var w = p.size * Math.abs(Math.cos(p.rot));
      ctx.fillRect(p.x - w / 2, p.y - p.size * 0.35, w + 1, p.size * 0.7);
    }
    ctx.globalAlpha = 1;
  }
  var rings = [];
  function ring(x, y, col, max, w) { if (rings.length > 12) rings.shift(); rings.push({ x: x, y: y, r: 8, max: max || 90, life: 0.4, t: 0.4, col: col, w: w || 6 }); }
  var wallFx = [];
  function wallFlash(x, y, col) { if (wallFx.length > 10) wallFx.shift(); wallFx.push({ x: x, y: y, life: 0.35, col: col }); }
  var pops = [];
  function popup(text, x, y, col, size) {
    if (pops.length > 8) pops.shift();
    x = Kit.clamp(x, 150, W - 150); y = Kit.clamp(y, 170, H - 40);
    for (var i = 0; i < pops.length; i++) { // stack instead of overlapping
      if (Math.abs(pops[i].x - x) < 180 && Math.abs(pops[i].y - y) < 40 && pops[i].life > 0.4) { y = pops[i].y - 44; i = -1; }
      if (y < 130) break;
    }
    pops.push({ text: text, x: x, y: y, life: 1.1, col: col || '#fff', size: size || 34 });
  }
  function bigText(text, col, dur, size, sub) { st.big = { text: text, col: col || '#fff', t: 0, dur: dur || 1.2, size: size || 120, sub: sub || '' }; }

  /* ---------------------------------------------------------- setup */
  function sideSkin(side) {
    if (st.mode === 1 || st.demo) {
      if (side < 0) return byId(AH.MALLETS, save.eq.mallet);
      var b = st.bot; return { id: 'bot_' + b.id, kind: 'solid', color: b.color, ring: b.ring };
    }
    if (side < 0) return byId(AH.MALLETS, save.eq.mallet);
    var mine = byId(AH.MALLETS, save.eq.mallet);
    return mine.id === 'pink' ? byId(AH.MALLETS, 'lime') : byId(AH.MALLETS, 'pink');
  }
  function sideColor(side) {
    var s = sideSkin(side);
    if (s.kind === 'rainbow') return '#ff9ed2';
    if (s.kind === 'melon') return '#ff5a6e';
    return s.color;
  }

  function setupMatch(demo) {
    st.demo = demo;
    st.mode = demo ? 1 : save.mode;
    st.bot = byId(AH.BOTS, save.bot);
    st.goalsToWin = save.goals;
    st.chaos = demo ? false : save.chaos;
    st.score = [0, 0]; st.stats = newStats(); st.streak = { side: 0, n: 0 }; st.maxBehind = [0, 0];
    st.goalHalf = [G.GOAL, G.GOAL]; st.tiny = [0, 0]; st.powers = []; st.respawn = []; st.powerT = 4;
    st.earned = 0; st.newAwards = []; st.matchPointShown = false; st.winner = 0; st.timeScale = 1; st.slowT = 0;
    st.big = null; st.hitstop = 0; st.idleT = 0; st.mpPending = 0; st.lastRocket = -9; st.flash = 0; st.zoom = 0;
    var a = makeMallet(-1), b = makeMallet(1);
    if (demo) { a.ctrl = 'ai'; a.bot = byId(AH.BOTS, 'medium'); b.ctrl = 'ai'; b.bot = st.bot; }
    else if (st.mode === 1) { a.ctrl = 'p1solo'; b.ctrl = 'ai'; b.bot = st.bot; }
    else { a.ctrl = 'keys1'; b.ctrl = 'keys2'; }
    a.skin = sideSkin(-1); b.skin = sideSkin(1);
    a.face = 'normal'; b.face = (st.mode === 1 || demo) ? st.bot.face : 'normal';
    a.name = demo ? '' : st.mode === 1 ? 'أنت' : 'اللاعب 1';
    b.name = demo ? '' : st.mode === 1 ? st.bot.name : 'اللاعب 2';
    if (a.ctrl === 'p1solo') { var l = clampMallet(a, ptr.x, ptr.y); a.x = l.x; a.y = l.y; }
    st.mallets = [a, b];
    st.pucks = [];
    if (st.chaos) {
      st.pucks.push(makePuck(G.CX, G.CY - 110, 0, 0));
      st.pucks.push(makePuck(G.CX, G.CY + 110, 0, 0));
    } else st.pucks.push(makePuck(G.CX, G.CY, 0, 0));
    for (var i = 0; i < PMAXN; i++) parts[i].on = false;
    rings.length = 0; pops.length = 0; wallFx.length = 0;
    if (demo) { launchPucks(); setScene('play'); }
    else setScene('countdown');
  }
  function launchPucks() {
    st.pucks.forEach(function (p, i) {
      var dir = st.pucks.length > 1 ? (i % 2 ? 1 : -1) : (Math.random() < 0.5 ? -1 : 1);
      p.vx = dir * 220; p.vy = (Math.random() - 0.5) * 160; p.spawn = 0;
    });
  }
  function setScene(s) { st.scene = s; st.stateT = 0; }

  /* ---------------------------------------------------------- bounds */
  function clampMallet(m, x, y) {
    var r = m.r;
    var minX = m.side < 0 ? G.L + r : G.CX + r;
    var maxX = m.side < 0 ? G.CX - r : G.R - r;
    x = Kit.clamp(x, minX, maxX); y = Kit.clamp(y, G.T + r, G.B - r);
    // rounded corners
    var cr = G.CR - r;
    if (cr > 0) {
      var cxL = G.L + G.CR, cxR = G.R - G.CR, cyT = G.T + G.CR, cyB = G.B - G.CR;
      if ((x < cxL || x > cxR) && (y < cyT || y > cyB)) {
        var ccx = x < cxL ? cxL : cxR, ccy = y < cyT ? cyT : cyB;
        var dx = x - ccx, dy = y - ccy, d = Math.sqrt(dx * dx + dy * dy);
        if (d > cr) { x = ccx + dx / d * cr; y = ccy + dy / d * cr; }
      }
    }
    return { x: x, y: y };
  }

  /* ---------------------------------------------------------- input */
  var p1Mode = 'mouse';
  function keyAxis(up, down, left, right) {
    var ax = 0, ay = 0;
    if (Kit.keys.anyDown(left)) ax -= 1;
    if (Kit.keys.anyDown(right)) ax += 1;
    if (Kit.keys.anyDown(up)) ay -= 1;
    if (Kit.keys.anyDown(down)) ay += 1;
    return { x: ax, y: ay };
  }
  var K1 = [['KeyW'], ['KeyS'], ['KeyA'], ['KeyD']];
  var K2 = [['ArrowUp'], ['ArrowDown'], ['ArrowLeft'], ['ArrowRight']];
  var KS = [['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown'], ['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']];

  function keyMove(m, ax, dt) {
    var len = Math.sqrt(ax.x * ax.x + ax.y * ax.y);
    if (len > 0) { ax.x /= len; ax.y /= len; }
    if (ax.x) m.avx += ax.x * KEY_ACC * dt; else m.avx *= Math.exp(-14 * dt);
    if (ax.y) m.avy += ax.y * KEY_ACC * dt; else m.avy *= Math.exp(-14 * dt);
    // turning quickly: kill opposing velocity faster
    if (ax.x && m.avx * ax.x < 0) m.avx *= Math.exp(-10 * dt);
    if (ax.y && m.avy * ax.y < 0) m.avy *= Math.exp(-10 * dt);
    var sp = Math.sqrt(m.avx * m.avx + m.avy * m.avy);
    if (sp > KEY_MAX) { m.avx *= KEY_MAX / sp; m.avy *= KEY_MAX / sp; }
    return { x: m.x + m.avx * dt, y: m.y + m.avy * dt };
  }
  function seekMove(m, tx, ty, maxSp, acc, dt) {
    var dvx = (tx - m.x) * 9, dvy = (ty - m.y) * 9;
    var l = Math.sqrt(dvx * dvx + dvy * dvy);
    if (l > maxSp) { dvx *= maxSp / l; dvy *= maxSp / l; }
    var ax = dvx - m.avx, ay = dvy - m.avy, al = Math.sqrt(ax * ax + ay * ay), lim = acc * dt;
    if (al > lim) { ax *= lim / al; ay *= lim / al; }
    m.avx += ax; m.avy += ay;
    return { x: m.x + m.avx * dt, y: m.y + m.avy * dt };
  }

  // Where does the mallet want to be at the end of this step?
  function malletTarget(m, dt) {
    if (m.frozen > 0) { m.avx = m.avy = 0; return { x: m.x, y: m.y }; }
    if (st.scene === 'ending' || st.scene === 'over') { m.avx *= 0.9; m.avy *= 0.9; return { x: m.x + m.avx * dt, y: m.y + m.avy * dt }; }
    if (m.ctrl === 'keys1') return keyMove(m, keyAxis(K1[0], K1[1], K1[2], K1[3]), dt);
    if (m.ctrl === 'keys2') return keyMove(m, keyAxis(K2[0], K2[1], K2[2], K2[3]), dt);
    if (m.ctrl === 'p1solo') {
      var ax = keyAxis(KS[0], KS[1], KS[2], KS[3]);
      if (ax.x || ax.y) { p1Mode = 'keys'; mouseMoved = false; }
      else if (mouseMoved) p1Mode = 'mouse';
      if (p1Mode === 'keys') return keyMove(m, ax, dt);
      var c = clampMallet(m, ptr.x, ptr.y);
      var dx = c.x - m.x, dy = c.y - m.y, d = Math.sqrt(dx * dx + dy * dy), mx = MOUSE_MAX * dt;
      if (d > mx) { dx *= mx / d; dy *= mx / d; }
      m.avx = dx / dt; m.avy = dy / dt;
      return { x: m.x + dx, y: m.y + dy };
    }
    return aiTarget(m, dt);
  }

  /* ============================================================== AI */
  function threatPuck(m) {
    var best = null, bestScore = -1e9, s = m.side, ownX = s < 0 ? G.L : G.R;
    for (var i = 0; i < st.pucks.length; i++) {
      var p = st.pucks[i]; if (!p.alive || p.scored) continue;
      var dist = Math.abs(p.x - ownX);
      var approaching = (s > 0 ? p.vx > 0 : p.vx < 0);
      var sc = -dist + (approaching ? Math.abs(p.vx) * 0.5 : 0);
      var inHalf = s > 0 ? p.x > G.CX : p.x < G.CX;
      if (inHalf) sc += 300;
      if (sc > bestScore) { bestScore = sc; best = p; }
    }
    return best;
  }
  // predict y where the puck crosses x = lineX (reflecting off top/bottom walls)
  function predictY(p, lineX) {
    if (Math.abs(p.vx) < 1) return { y: p.y, t: 99 };
    var t = (lineX - p.x) / p.vx;
    if (t < 0) return { y: p.y, t: 99 };
    var top = G.T + G.PR, bot = G.B - G.PR, span = bot - top;
    var y = p.y + p.vy * t - top;
    var m = ((y % (2 * span)) + 2 * span) % (2 * span);
    if (m > span) m = 2 * span - m;
    return { y: top + m, t: t };
  }

  function segDist(px, py, ax, ay, bx, by) {
    var vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    var t = l2 > 0 ? Kit.clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
    var dx = ax + vx * t - px, dy = ay + vy * t - py;
    return Math.sqrt(dx * dx + dy * dy);
  }
  // Keep the AI from shoving a puck that sits between it and its own goal.
  function safeSeek(m, tx, ty, maxSp, acc, dt) {
    var s = m.side, rs = m.r + G.PR, best = null;
    for (var i = 0; i < st.pucks.length; i++) {
      var p = st.pucks[i];
      if (!p.alive || p.scored) continue;
      if ((p.x - m.x) * s < -rs * 0.25) continue;            // puck is in front of us: fine
      if ((tx - m.x) * s < 0 && Math.abs(ty - m.y) < 1) continue;
      if (segDist(p.x, p.y, m.x, m.y, tx, ty) > rs + 10) continue;
      best = p; break;
    }
    if (best) {
      var sg = m.y < best.y ? -1 : 1;
      var off = rs + 46;
      if (best.y + sg * off < G.T + m.r || best.y + sg * off > G.B - m.r) sg = -sg;
      if (Math.abs(m.y - best.y) < rs + 12) { tx = m.x - s * 12; ty = best.y + sg * off; }
      else { tx = best.x + s * rs * 0.5; ty = m.y; }
    }
    return seekMove(m, tx, ty, maxSp, acc, dt);
  }

  function aiTarget(m, dt) {
    var b = m.bot, ai = m.ai, s = m.side;
    var speed = b.speed, acc = b.accel, react = b.react, err = b.err;
    // rubber band so kids stay in the match
    if (st.mode === 1 && !st.demo) {
      var diff = st.score[1] - st.score[0];
      if (diff >= 3) { speed *= 0.84; react *= 1.5; err *= 1.4; }
      else if (diff >= 2) { speed *= 0.92; }
      else if (diff <= -3 && b.id !== 'insane') { speed *= 1.08; }
    }
    var ownX = s > 0 ? G.R : G.L, oppX = s > 0 ? G.L : G.R;
    var homeX = ownX - s * b.depth;
    if (st.scene === 'countdown') return seekMove(m, homeX, G.CY, speed * 0.6, acc, dt);
    // sleepy bot naps now and then
    if (b.face === 'sleepy' && !st.demo) {
      ai.napT -= dt;
      if (ai.napT <= 0 && ai.nap <= 0) { ai.nap = 0.75; ai.napT = 7 + Math.random() * 6; }
      if (ai.nap > 0) { ai.nap -= dt; m.avx *= 0.85; m.avy *= 0.85; return { x: m.x + m.avx * dt, y: m.y + m.avy * dt }; }
    }
    ai.t -= dt;
    var tp = threatPuck(m);
    if (!tp) return seekMove(m, homeX, G.CY, speed * 0.5, acc, dt);
    if (ai.t <= 0 || !ai.snap || ai.snap.p !== tp) {
      ai.t = react * (0.7 + Math.random() * 0.6);
      var old = ai.snap;
      // misjudgment is re-rolled only when the puck's path changes (new shot / bounce)
      if (!old || old.p !== tp || Math.abs(old.vx - tp.vx) + Math.abs(old.vy - tp.vy) > 160) ai.noise = (Math.random() - 0.5) * 2 * err;
      ai.snap = { p: tp, x: tp.x, y: tp.y, vx: tp.vx, vy: tp.vy, age: 0 };
    }
    ai.snap.age += dt;
    var sp = ai.snap;
    var px = sp.x + sp.vx * sp.age, py = Kit.clamp(sp.y + sp.vy * sp.age, G.T + G.PR, G.B - G.PR);
    var pvx = sp.vx, pvy = sp.vy, pspeed = Math.sqrt(pvx * pvx + pvy * pvy);
    var inHalf = s > 0 ? px > G.CX - 6 : px < G.CX + 6;
    var toward = pvx * s > 60;
    var tx, ty, sMax = speed;

    if (ai.mode === 'strike') {
      ai.st -= dt;
      tx = tp.x + ai.dir.x * 70; ty = tp.y + ai.dir.y * 70;
      sMax = speed * b.strike;
      if (ai.contact || ai.st <= 0 || !inHalf || (tp.x - m.x) * s > -m.r * 0.2) { ai.mode = 'recover'; ai.st = 0.28; ai.contact = false; }
      var r1 = seekMove(m, tx, ty, sMax, acc * 1.5, dt);
      return r1;
    }
    if (ai.mode === 'recover') {
      ai.st -= dt;
      if (ai.st <= 0) ai.mode = 'idle';
      return safeSeek(m, homeX, G.CY + (py - G.CY) * 0.4, speed * 0.8, acc, dt);
    }
    var canAttack = inHalf && pspeed < b.attackMax && (!toward || pspeed < 320);
    if (canAttack) {
      ai.hes += dt;
      if (ai.mode !== 'attack') {
        ai.mode = 'attack'; ai.attackT = 0;
        ai.aimOff = (Math.random() - 0.5) * G.GOAL * 1.2;
        ai.bank = Math.random() < b.bank ? (Math.random() < 0.5 ? -1 : 1) : 0;
        // smarter bots aim for the side of the goal the defender is NOT covering
        var def = st.mallets[s > 0 ? 0 : 1];
        if (b.bank >= 0.25 && def) {
          var open = def.y < G.CY ? 1 : -1;
          ai.aimOff = open * G.GOAL * (0.45 + Math.random() * 0.3);
          if (ai.bank) ai.bank = open > 0 ? 1 : -1;
        }
      }
    } else { ai.hes = 0; if (ai.mode === 'attack') ai.mode = 'idle'; }

    if (ai.mode === 'attack' && ai.hes >= b.hesitate) {
      ai.attackT += dt;
      var lead = b.lead * 0.14;
      var qx = Kit.clamp(px + pvx * lead, G.L + G.PR, G.R - G.PR), qy = Kit.clamp(py + pvy * lead, G.T + G.PR, G.B - G.PR);
      var gy = G.CY + ai.aimOff + ai.noise * 0.5;
      if (ai.bank) gy = ai.bank < 0 ? 2 * (G.T + G.PR) - gy : 2 * (G.B - G.PR) - gy;
      var dx = oppX - qx, dy = gy - qy, dl = Math.sqrt(dx * dx + dy * dy) || 1;
      var d = { x: dx / dl, y: dy / dl };
      var rs = m.r + G.PR;
      var bx = qx - d.x * (rs + 16), by = qy - d.y * (rs + 16);
      var relx = m.x - qx, rely = m.y - qy;
      var along = relx * d.x + rely * d.y;
      var perp = -relx * d.y + rely * d.x;
      var db = Math.sqrt((m.x - bx) * (m.x - bx) + (m.y - by) * (m.y - by));
      // behind-point unreachable (puck on the back wall)? just hit it
      var bc = clampMallet(m, bx, by);
      var unreachable = Math.abs(bc.x - bx) + Math.abs(bc.y - by) > 20;
      if (ai.attackT > 1.8 || unreachable && ai.attackT > 0.5) {
        var ddx = qx - m.x, ddy = qy - m.y, ddl = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        if (ddx * s < -rs * 0.3) { ai.mode = 'strike'; ai.st = 0.3; ai.dir = { x: ddx / ddl, y: ddy / ddl }; ai.contact = false; }
        else if (ai.attackT > 3) { ai.attackT = 0; ai.aimOff = (Math.random() - 0.5) * G.GOAL * 1.2; ai.bank = 0; }
      }
      if (db < 24 + err * 0.12 || (along < -rs * 0.7 && Math.abs(perp) < rs * 0.35)) {
        ai.mode = 'strike'; ai.st = 0.32; ai.dir = d; ai.contact = false;
        return seekMove(m, qx + d.x * 70, qy + d.y * 70, speed * b.strike, acc * 1.5, dt);
      }
      if (along > -rs * 0.45) {
        // wrong side: circle around the puck
        var sg = perp >= 0 ? 1 : -1;
        var wx = qx - d.y * sg * (rs + 34) - d.x * (rs * 0.6), wy = qy + d.x * sg * (rs + 34) - d.y * (rs * 0.6);
        if (wy < G.T + m.r + 4 || wy > G.B - m.r - 4) { sg = -sg; wx = qx - d.y * sg * (rs + 34) - d.x * (rs * 0.6); wy = qy + d.x * sg * (rs + 34) - d.y * (rs * 0.6); }
        return safeSeek(m, wx, wy, speed, acc, dt);
      }
      return safeSeek(m, bx, by, speed, acc, dt);
    }

    if (toward && pspeed > 120) {
      var pr = b.naive ? { y: py + pvy * 0.08 } : predictY({ x: px, y: py, vx: pvx, vy: pvy }, homeX);
      ty = pr.y + ai.noise;
      ty = Kit.clamp(ty, G.CY - G.GOAL - 40, G.CY + G.GOAL + 40);
      tx = homeX;
      // very close & fast: step into the line between puck and goal
      return safeSeek(m, tx, ty, speed, acc, dt);
    }
    // idle: shadow the puck between it and our goal
    ty = G.CY + (py - G.CY) * 0.55;
    tx = homeX + (inHalf ? -s * 20 : 0);
    return safeSeek(m, tx, ty, speed * 0.6, acc, dt);
  }

  /* ========================================================= physics */
  var tmpStart = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  // during the countdown the pucks are held and mallets must keep a little distance
  function keepAway(m, c) {
    for (var i = 0; i < st.pucks.length; i++) {
      var p = st.pucks[i], min = p.r + m.r + 26;
      var dx = c.x - p.x, dy = c.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < min) {
        if (d < 0.01) { dx = m.side; dy = 0; d = 1; }
        c = clampMallet(m, p.x + dx / d * min, p.y + dy / d * min);
        if (Math.abs(c.x - p.x) < min && Math.abs(c.y - p.y) < min) c = clampMallet(m, p.x + m.side * min, c.y);
      }
    }
    return c;
  }
  function physicsStep(dt) {
    var ms = st.mallets, i, j, k, p, m;
    var held = st.scene === 'countdown';
    // mallet radius (big power-up)
    for (i = 0; i < ms.length; i++) {
      m = ms[i];
      var targetR = m.big > 0 ? G.BIG : G.MR;
      m.r += (targetR - m.r) * Math.min(1, dt * 10);
    }
    var ends = [];
    var maxDisp = 0;
    for (i = 0; i < ms.length; i++) {
      m = ms[i];
      var tgt = malletTarget(m, dt);
      var c = clampMallet(m, tgt.x, tgt.y);
      if (held) c = keepAway(m, c);
      if (m.ctrl !== 'p1solo' || p1Mode === 'keys') {
        // bumping the edge kills velocity along it
        if (c.x !== tgt.x) m.avx = 0;
        if (c.y !== tgt.y) m.avy = 0;
      }
      tmpStart[i].x = m.x; tmpStart[i].y = m.y;
      ends.push(c);
      m.vx = (c.x - m.x) / dt; m.vy = (c.y - m.y) / dt;
      maxDisp = Math.max(maxDisp, Math.abs(c.x - m.x) + Math.abs(c.y - m.y));
    }
    var maxP = 0;
    for (i = 0; i < st.pucks.length; i++) { p = st.pucks[i]; maxP = Math.max(maxP, (Math.abs(p.vx) + Math.abs(p.vy)) * dt); }
    var n = Math.min(20, Math.max(1, Math.ceil((maxDisp + maxP) / 7)));
    var h = dt / n;
    for (k = 1; k <= n; k++) {
      for (i = 0; i < ms.length; i++) {
        m = ms[i];
        m.x += (ends[i].x - tmpStart[i].x) / n; m.y += (ends[i].y - tmpStart[i].y) / n;
      }
      for (i = 0; i < st.pucks.length; i++) {
        p = st.pucks[i];
        if (!p.alive || held) continue;
        if (p.scored) { p.x += p.vx * h; p.y += p.vy * h; pocket(p); continue; }
        p.x += p.vx * h; p.y += p.vy * h;
        for (j = 0; j < ms.length; j++) malletHit(ms[j], p);
        walls(p);
        // squeeze: if still inside a mallet, push the mallet back instead
        for (j = 0; j < ms.length; j++) {
          m = ms[j];
          var dx = p.x - m.x, dy = p.y - m.y, rs = p.r + m.r, d2 = dx * dx + dy * dy;
          if (d2 < rs * rs) {
            var d = Math.sqrt(d2) || 0.01;
            var cm = clampMallet(m, p.x - dx / d * rs, p.y - dy / d * rs);
            m.x = cm.x; m.y = cm.y;
          }
        }
      }
      if (st.pucks.length > 1) puckPuck();
    }
    for (i = 0; i < ms.length; i++) {
      m = ms[i];
      var cc = clampMallet(m, m.x, m.y); m.x = cc.x; m.y = cc.y;
    }
    // drag, speed caps, trails, stuck check
    for (i = 0; i < st.pucks.length; i++) {
      p = st.pucks[i];
      if (!p.alive) continue;
      var damp = Math.exp(-0.16 * dt);
      p.vx *= damp; p.vy *= damp;
      var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      var cap = p.fire > 0 ? PMAX_FIRE : PMAX;
      if (sp > cap) { p.vx *= cap / sp; p.vy *= cap / sp; sp = cap; }
      if (p.fire > 0) {
        p.fire -= dt;
        if (sp < 900 && sp > 1) { p.vx *= 900 / sp; p.vy *= 900 / sp; }
        if (Math.random() < 0.8) emit(p.x, p.y, { count: 2, colors: ['#ffdd33', '#ff8a1f', '#ff3d1f'], speed: 90, life: 0.35, size: 7, drag: 4 });
      }
      p.tx[p.ti] = p.x; p.ty[p.ti] = p.y; p.ti = (p.ti + 1) % PUCK_TRAIL; if (p.tn < PUCK_TRAIL) p.tn++;
      if (p.spawn > 0) p.spawn -= dt;
      if (sp < 30 && !p.scored) {
        p.stillT += dt;
        if (p.stillT > (st.demo ? 2 : 5)) { // nudge a dead puck back into play
          p.stillT = 0; dbg.nudges++;
          p.vx = (G.CX - p.x) * 0.9 + (Math.random() - 0.5) * 80; p.vy = (G.CY - p.y) * 0.6 + (Math.random() - 0.5) * 80;
        }
      } else p.stillT = 0;
    }
  }

  function malletHit(m, p) {
    var dx = p.x - m.x, dy = p.y - m.y, rs = p.r + m.r, d2 = dx * dx + dy * dy;
    if (d2 >= rs * rs) return;
    var d = Math.sqrt(d2);
    var nx, ny;
    if (d < 0.001) { nx = m.side < 0 ? 1 : -1; ny = 0; } else { nx = dx / d; ny = dy / d; }
    p.x = m.x + nx * rs; p.y = m.y + ny * rs;
    var rvx = p.vx - m.vx, rvy = p.vy - m.vy, vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    var before = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    var wasToward = m.side < 0 ? p.vx < -500 : p.vx > 500;
    var saveCandidate = false;
    if (wasToward) {
      var pr = predictY(p, m.side < 0 ? G.L : G.R);
      if (Math.abs(pr.y - G.CY) < st.goalHalf[m.side < 0 ? 0 : 1] + 10) saveCandidate = true;
    }
    p.vx -= (1 + E_MALLET) * vn * nx; p.vy -= (1 + E_MALLET) * vn * ny;
    var cap = p.fire > 0 ? PMAX_FIRE : PMAX;
    var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (sp > cap) { p.vx *= cap / sp; p.vy *= cap / sp; sp = cap; }
    onHit(m, p, -vn, nx, ny, sp, saveCandidate && before > 500);
  }

  function walls(p) {
    var r = p.r;
    var cxL = G.L + G.CR, cxR = G.R - G.CR, cyT = G.T + G.CR, cyB = G.B - G.CR;
    if ((p.x < cxL || p.x > cxR) && (p.y < cyT || p.y > cyB)) {
      var ccx = p.x < cxL ? cxL : cxR, ccy = p.y < cyT ? cyT : cyB;
      var dx = p.x - ccx, dy = p.y - ccy, d = Math.sqrt(dx * dx + dy * dy), cr = G.CR - r;
      if (d > cr) {
        var nx = dx / d, ny = dy / d;
        p.x = ccx + nx * cr; p.y = ccy + ny * cr;
        var vn = p.vx * nx + p.vy * ny;
        if (vn > 0) { p.vx -= (1 + E_WALL) * vn * nx; p.vy -= (1 + E_WALL) * vn * ny; onWall(p, vn, ccx + nx * G.CR, ccy + ny * G.CR); }
      }
      return;
    }
    // top / bottom
    if (p.y < G.T + r) { p.y = G.T + r; if (p.vy < 0) { onWall(p, -p.vy, p.x, G.T); p.vy = -p.vy * E_WALL; } }
    else if (p.y > G.B - r) { p.y = G.B - r; if (p.vy > 0) { onWall(p, p.vy, p.x, G.B); p.vy = -p.vy * E_WALL; } }
    // left / right with goal mouths
    for (var s = -1; s <= 1; s += 2) {
      var gx = s < 0 ? G.L : G.R;
      var half = st.goalHalf[s < 0 ? 0 : 1];
      var beyond = s < 0 ? p.x < gx + r : p.x > gx - r;
      if (!beyond) continue;
      var inMouth = Math.abs(p.y - G.CY) < half;
      if (inMouth) {
        // posts
        for (var q = -1; q <= 1; q += 2) {
          var py = G.CY + q * half, ddx = p.x - gx, ddy = p.y - py, rr = r + 8, dd = ddx * ddx + ddy * ddy;
          if (dd < rr * rr) {
            var dl = Math.sqrt(dd) || 0.01, ux = ddx / dl, uy = ddy / dl;
            p.x = gx + ux * rr; p.y = py + uy * rr;
            var v2 = p.vx * ux + p.vy * uy;
            if (v2 < 0) { p.vx -= (1 + E_WALL) * v2 * ux; p.vy -= (1 + E_WALL) * v2 * uy; onWall(p, -v2, gx, py); }
          }
        }
        var crossed = s < 0 ? p.x < gx - 2 : p.x > gx + 2;
        if (crossed && Math.abs(p.y - G.CY) < half) goal(p, -s);
      } else {
        p.x = s < 0 ? gx + r : gx - r;
        var vx = p.vx * -s;
        if (vx < 0) { onWall(p, -vx, gx, p.y); p.vx = -p.vx * E_WALL; }
      }
    }
  }
  // puck already in the goal pocket: slide to the back and stop
  function pocket(p) {
    var side = p.x < G.CX ? -1 : 1, gx = side < 0 ? G.L : G.R;
    var backX = gx + side * 22;
    var half = st.goalHalf[side < 0 ? 0 : 1];
    if (side < 0 ? p.x < backX : p.x > backX) { p.x = backX; p.vx = 0; }
    p.y = Kit.clamp(p.y, G.CY - half + 6, G.CY + half - 6);
    p.vx *= 0.9; p.vy *= 0.8;
  }
  function puckPuck() {
    var ps = st.pucks;
    for (var i = 0; i < ps.length; i++) for (var j = i + 1; j < ps.length; j++) {
      var a = ps[i], b = ps[j];
      if (!a.alive || !b.alive || a.scored || b.scored) continue;
      var dx = b.x - a.x, dy = b.y - a.y, rs = a.r + b.r, d2 = dx * dx + dy * dy;
      if (d2 >= rs * rs || d2 < 0.0001) continue;
      var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (rs - d) / 2;
      a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
      var vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        var jj = -(1 + E_PUCK) * vn / 2;
        a.vx -= jj * nx; a.vy -= jj * ny; b.vx += jj * nx; b.vy += jj * ny;
        if (-vn > 200) { sfx('wall', -vn); emit(a.x + nx * a.r, a.y + ny * a.r, { count: 6, color: '#fff', speed: 260, life: 0.25, size: 2, kind: 1 }); }
      }
    }
  }

  /* ---------------------------------------------------------- events */
  function sfx(name, arg) { if (st.demo) return; S[name](arg); }
  function sideIdx(s) { return s < 0 ? 0 : 1; }

  function onHit(m, p, impact, nx, ny, sp, isSave) {
    if (m.ai && m.ctrl === 'ai') m.ai.contact = true;
    var idx = sideIdx(m.side);
    p.last = m.side; p.bank = 0;
    var col = sideColor(m.side);
    var cx = m.x + nx * m.r, cy = m.y + ny * m.r;
    var k = Math.min(1, impact / 1600);
    m.sq = Math.min(1, 0.25 + k); m.sqAng = Math.atan2(ny, nx);
    emit(cx, cy, { count: 4 + (k * 16 | 0), colors: [col, '#ffffff'], speed: 250 + k * 600, life: 0.35, size: 2 + k * 2, kind: 1, angle: Math.atan2(ny, nx), spread: 2.2 });
    if (impact > 250) ring(cx, cy, col, 40 + k * 70, 3 + k * 5);
    sfx('hit', impact);
    if (st.demo) return;
    if (impact > 120) st.stats.hits[idx]++;
    if (sp > st.stats.fast[idx]) st.stats.fast[idx] = sp;
    if (impact > 1150) {
      shake.add(4 + k * 7); st.flash = Math.max(st.flash, 0.12 + k * 0.1); st.flashCol = col; st.hitstop = 0.045;
      emit(cx, cy, { count: 10, colors: ['#ffffff', col, '#fff06a'], speed: 700, life: 0.4, size: 3, kind: 1 });
    }
    var kmh = Math.round(sp * KMH);
    if (sp >= 1780 && isHuman(m.side) && st.t - (st.lastRocket || -9) > 1.5) {
      st.lastRocket = st.t;
      popup(Kit.pick(AH.WORDS.rocket) + ' ' + kmh + ' كم/س', p.x, p.y - 50, '#fff06a', 30);
      if (kmh >= 110) award('rocket');
    }
    if (isSave) {
      st.stats.saves[idx]++;
      popup(Kit.pick(AH.WORDS.save), m.x, m.y - 70, '#9ff0ff', 32);
      if (isHuman(m.side) && st.stats.saves[idx] >= 5) award('keeper');
    }
  }
  function onWall(p, v, x, y) {
    if (v < 60) return;
    p.bank++;
    var th = byId(AH.TABLES, save.eq.table);
    var k = Math.min(1, v / 1500);
    emit(x, y, { count: 2 + (k * 8 | 0), colors: [th.line, '#ffffff'], speed: 150 + k * 450, life: 0.3, size: 2, kind: 1 });
    wallFlash(x, y, th.line);
    sfx('wall', v);
    if (v > 1300 && !st.demo) shake.add(3);
  }
  function isHuman(side) { return !st.demo && (st.mode === 2 || side < 0); }

  function goal(p, scorer) {
    if (p.scored) return;
    p.scored = 1;
    dbg.goals++; if (p.last === -scorer) dbg.ownGoals++;
    var si = sideIdx(scorer), ci = 1 - si;
    var gx = scorer > 0 ? G.L : G.R; // goal that was scored in
    var col = sideColor(scorer);
    st.goalFlash[ci] = 1;
    emit(gx, p.y, { count: 60, colors: ['#ff4d6d', '#ffd23f', '#7dff6b', '#35c8ff', '#b98cff', '#ffffff'], speed: 750, life: 1.4, size: 11, drag: 2.2, kind: 2, angle: scorer > 0 ? 0 : Math.PI, spread: 2.6 });
    emit(gx, p.y, { count: 24, colors: [col, '#ffffff'], speed: 900, life: 0.5, size: 3, kind: 1, angle: scorer > 0 ? 0 : Math.PI, spread: 2.8 });
    ring(gx, p.y, col, 240, 10);
    if (st.demo) { respawnLater(p, 0.6); return; }
    if (st.scene === 'ending' || st.scene === 'over') { sfx('wall', 800); return; } // match already decided
    st.score[si]++;
    st.stats.goals[si]++;
    var scorerM = st.mallets[si], conM = st.mallets[ci];
    scorerM.mood = 'joy'; scorerM.moodT = 1.5; conM.mood = 'sad'; conM.moodT = 1.5;
    shake.add(15); st.flash = 0.35; st.flashCol = col; st.zoom = 1; st.zoomX = gx; st.zoomY = p.y;
    var humanScored = isHuman(scorer);
    S.goal(humanScored || st.mode === 2);
    // streaks & words
    if (st.streak.side === scorer) st.streak.n++; else { st.streak.side = scorer; st.streak.n = 1; }
    st.stats.run[si] = Math.max(st.stats.run[si], st.streak.n);
    var word = Kit.pick(AH.WORDS.goal);
    if (p.last === scorer && p.bank >= 1 && p.bank <= 2) popup(AH.WORDS.bank, G.CX, G.CY + 120, '#b98cff', 36);
    if (st.streak.n === 3) { popup(AH.WORDS.hat, G.CX, G.CY + 160, '#fff06a', 44); if (humanScored) award('hat'); }
    if (humanScored) award('goal1');
    if (humanScored) addCoins(2);
    var behind = st.score[1 - si] - st.score[si];
    st.maxBehind[si] = Math.max(st.maxBehind[si], behind);
    st.maxBehind[ci] = Math.max(st.maxBehind[ci], -behind);
    var who = st.mode === 1 ? (scorer < 0 ? 'أنت تسجّل!' : st.bot.name + ' يسجّل!') : (scorer < 0 ? 'اللاعب 1 يسجّل!' : 'اللاعب 2 يسجّل!');
    var won = st.score[si] >= st.goalsToWin;
    if (won) {
      st.winner = scorer;
      bigText(word, col, 1.8, 130, who);
      st.timeScale = 0.3; st.slowT = 1.3;
      setScene('ending');
      return;
    }
    bigText(word, col, 1.4, 130, who);
    if (st.chaos) { respawnLater(p, 1.0, scorer); }
    else setScene('goal');
    st.lastConceder = -scorer;
    var mp = st.score[0] === st.goalsToWin - 1 || st.score[1] === st.goalsToWin - 1;
    if (mp && !st.matchPointShown) { st.matchPointShown = true; st.mpPending = 1.5; }
  }
  function respawnLater(p, delay, scorer) {
    st.respawn.push({ p: p, t: delay, toward: scorer ? -scorer : (Math.random() < 0.5 ? -1 : 1) });
  }
  function servePuck(p, conceder) {
    // conceding player gets the puck on their side
    var x = conceder < 0 ? G.L + 250 : G.R - 250, y = G.CY;
    var m = st.mallets[sideIdx(conceder)];
    if (Math.abs(m.x - x) < m.r + p.r + 20 && Math.abs(m.y - y) < m.r + p.r + 20) y += m.y > G.CY ? -130 : 130;
    p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.scored = 0; p.alive = true; p.spawn = 0.35; p.tn = 0; p.fire = 0; p.last = 0; p.bank = 0;
    emit(x, y, { count: 16, color: '#ffffff', speed: 240, life: 0.35, size: 3, kind: 1 });
    ring(x, y, '#ffffff', 70, 4);
    sfx('spawn');
  }

  /* ---------------------------------------------------------- chaos */
  function spawnPower() {
    if (st.powers.length >= 2) return;
    var def = AH.POWERS[(Math.random() * AH.POWERS.length) | 0];
    if (def.id === 'multi' && st.pucks.filter(function (q) { return q.alive; }).length >= 4) def = AH.POWERS[0];
    for (var tries = 0; tries < 12; tries++) {
      var x = Kit.rand(G.L + 240, G.R - 240), y = Kit.rand(G.T + 70, G.B - 70);
      var ok = true;
      st.mallets.forEach(function (m) { if (Kit.dist(m.x, m.y, x, y) < 120) ok = false; });
      st.pucks.forEach(function (q) { if (Kit.dist(q.x, q.y, x, y) < 80) ok = false; });
      if (ok) { st.powers.push({ x: x, y: y, def: def, age: 0, life: 11, seed: Math.random() * 6 }); sfx('spawn'); return; }
    }
  }
  function updPowers(dt) {
    st.powerT -= dt;
    if (st.powerT <= 0) { st.powerT = Kit.rand(4.5, 7); spawnPower(); }
    for (var i = st.powers.length - 1; i >= 0; i--) {
      var pw = st.powers[i];
      pw.age += dt; pw.life -= dt;
      if (pw.life <= 0) { st.powers.splice(i, 1); continue; }
      var got = 0, byPuck = null;
      for (var j = 0; j < st.mallets.length && !got; j++) { var m = st.mallets[j]; if (Kit.dist(m.x, m.y, pw.x, pw.y) < m.r + 26) got = m.side; }
      for (j = 0; j < st.pucks.length && !got; j++) { var p = st.pucks[j]; if (p.alive && !p.scored && p.last && Kit.dist(p.x, p.y, pw.x, pw.y) < p.r + 26) { got = p.last; byPuck = p; } }
      if (got) { st.powers.splice(i, 1); applyPower(pw, got, byPuck); }
    }
    for (i = 0; i < st.mallets.length; i++) {
      var mm = st.mallets[i];
      if (mm.big > 0) mm.big -= dt;
      if (mm.frozen > 0) { mm.frozen -= dt; if (mm.frozen <= 0) { emit(mm.x, mm.y, { count: 14, colors: ['#ffffff', '#9ff0ff'], speed: 300, life: 0.4, size: 4 }); } }
    }
    for (i = 0; i < 2; i++) {
      if (st.tiny[i] > 0) { st.tiny[i] -= dt; if (st.tiny[i] <= 0) S.grow(); }
      var tgt = st.tiny[i] > 0 ? G.TINY : G.GOAL;
      st.goalHalf[i] += (tgt - st.goalHalf[i]) * Math.min(1, dt * 6);
    }
  }
  function applyPower(pw, side, puck) {
    var idx = sideIdx(side), m = st.mallets[idx], opp = st.mallets[1 - idx];
    var id = pw.def.id;
    emit(pw.x, pw.y, { count: 22, colors: [pw.def.color, '#ffffff'], speed: 420, life: 0.5, size: 3, kind: 1 });
    ring(pw.x, pw.y, pw.def.color, 90, 6);
    popup(pw.def.name, pw.x, pw.y - 40, pw.def.color, 32);
    S.power();
    if (id === 'big') { m.big = 8; S.grow(); }
    else if (id === 'tiny') { st.tiny[idx] = 8; S.shrink(); }
    else if (id === 'fire') {
      var p = puck;
      if (!p) { var best = 1e9; st.pucks.forEach(function (q) { if (q.alive && !q.scored) { var d = Kit.dist(q.x, q.y, m.x, m.y); if (d < best) { best = d; p = q; } } }); }
      if (p) {
        p.fire = 5;
        var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
        var dir = side < 0 ? 1 : -1;
        if (p.vx * dir < 0) p.vx = -p.vx;
        var ns = Math.min(PMAX_FIRE, Math.max(1500, sp * 1.6));
        p.vx *= ns / sp; p.vy *= ns / sp;
        S.fire(); shake.add(6);
      }
    } else if (id === 'freeze') { opp.frozen = 2.2; S.freeze(); emit(opp.x, opp.y, { count: 20, colors: ['#ffffff', '#9ff0ff'], speed: 350, life: 0.5, size: 4 }); }
    else if (id === 'multi') {
      var np = makePuck(pw.x, pw.y, (side < 0 ? 1 : -1) * 500, Kit.rand(-200, 200));
      np.last = side;
      st.pucks.push(np);
    }
  }

  /* ---------------------------------------------------------- update */
  function update(dt) {
    st.t += dt;
    if (st.paused) { Kit.keys.endFrame(); ptr.endFrame(); return; }
    // effects run in real time
    shake.update(dt);
    st.flash = Math.max(0, st.flash - dt * 2.5);
    st.zoom = Math.max(0, st.zoom - dt * 1.6);
    st.goalFlash[0] = Math.max(0, st.goalFlash[0] - dt * 1.5); st.goalFlash[1] = Math.max(0, st.goalFlash[1] - dt * 1.5);
    for (var i = rings.length - 1; i >= 0; i--) { rings[i].t -= dt; if (rings[i].t <= 0) rings.splice(i, 1); }
    for (i = wallFx.length - 1; i >= 0; i--) { wallFx[i].life -= dt; if (wallFx[i].life <= 0) wallFx.splice(i, 1); }
    for (i = pops.length - 1; i >= 0; i--) { pops[i].life -= dt; pops[i].y -= dt * 40; if (pops[i].life <= 0) pops.splice(i, 1); }
    if (st.big) { st.big.t += dt; if (st.big.t > st.big.dur) st.big = null; }
    if (st.mpPending > 0) { st.mpPending -= dt; if (st.mpPending <= 0) { bigText(AH.WORDS.matchPoint, '#ff5c7a', 1.1, 96); S.matchPoint(); } }
    st.mallets.forEach(function (m) {
      m.sq = Math.max(0, m.sq - dt * 5);
      if (m.moodT > 0) { m.moodT -= dt; if (m.moodT <= 0) m.mood = ''; }
      m.blinkT -= dt;
      if (m.blinkT <= 0) { m.blink = 1; m.blinkT = 2 + Math.random() * 4; }
      m.blink = Math.max(0, m.blink - dt * 7);
    });

    if (st.hitstop > 0) { st.hitstop -= dt; Kit.keys.endFrame(); ptr.endFrame(); return; }
    var sdt = dt;
    if (st.slowT > 0) { st.slowT -= dt; sdt = dt * st.timeScale; }
    updParts(sdt);
    st.stateT += dt;

    if (st.scene === 'countdown') {
      var prev = Math.ceil(3 - (st.stateT - dt) / 0.6), now = Math.ceil(3 - st.stateT / 0.6);
      if (now !== prev || st.stateT === dt) {
        if (now >= 1) { bigText(String(now), '#ffffff', 0.55, 150); S.count(now); }
        else { bigText('انطلق!', '#fff06a', 0.8, 130); S.count(0); launchPucks(); setScene('play'); }
      }
      physicsStep(sdt);
    } else if (st.scene === 'play') {
      physicsStep(sdt);
      if (st.chaos) updPowers(sdt);
      for (i = st.respawn.length - 1; i >= 0; i--) {
        var rp = st.respawn[i]; rp.t -= sdt;
        if (rp.t <= 0) {
          st.respawn.splice(i, 1);
          var alive = st.pucks.filter(function (q) { return q.alive && !q.scored; }).length;
          if (st.chaos && alive >= 2) { rp.p.alive = false; }
          else {
            rp.p.x = G.CX; rp.p.y = G.CY + Kit.rand(-120, 120); rp.p.scored = 0; rp.p.alive = true; rp.p.tn = 0; rp.p.fire = 0; rp.p.last = 0;
            rp.p.vx = rp.toward * 260; rp.p.vy = Kit.rand(-150, 150); rp.p.spawn = 0.35;
            ring(rp.p.x, rp.p.y, '#ffffff', 80, 5); sfx('spawn');
          }
        }
      }
      // tidy dead pucks
      for (i = st.pucks.length - 1; i >= 0; i--) if (!st.pucks[i].alive) st.pucks.splice(i, 1);
      if (st.demo && st.stateT > 60) setupMatch(true);
    } else if (st.scene === 'goal') {
      physicsStep(sdt);
      if (st.stateT > 1.5) { servePuck(st.pucks[0], st.lastConceder); setScene('play'); }
    } else if (st.scene === 'ending') {
      physicsStep(sdt);
      if (st.stateT > 1.6) endMatch();
    } else if (st.scene === 'over') {
      physicsStep(sdt);
    }
    Kit.keys.endFrame(); ptr.endFrame();
  }

  /* ========================================================== render */
  function txt(s, x, y, size, col, align, o) {
    o = o || {};
    ctx.font = (o.w || 700) + ' ' + size + 'px ' + FONT;
    ctx.direction = o.ltr ? 'ltr' : 'rtl';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = o.stroke; ctx.strokeStyle = o.sc || 'rgba(0,0,0,0.6)'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = col; ctx.fillText(s, x, y);
  }

  function render() {
    ensureTable();
    ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, 0, 0);
    if (shake.power > 0.05 || st.zoom > 0) { ctx.fillStyle = '#050716'; ctx.fillRect(0, 0, W, H); }
    ctx.save();
    ctx.translate(shake.x, shake.y);
    if (st.zoom > 0) {
      var z = 1 + 0.045 * Math.sin(st.zoom * Math.PI * 0.5);
      var zx = Kit.lerp(G.CX, st.zoomX, 0.5), zy = Kit.lerp(G.CY, st.zoomY, 0.5);
      ctx.translate(zx, zy); ctx.scale(z, z); ctx.translate(-zx, -zy);
    }
    ctx.drawImage(tableImg, 0, 0, W, H);
    var th = byId(AH.TABLES, save.eq.table);
    // goals
    art.goal(ctx, -1, st.goalHalf[0], th.a, st.goalFlash[0], st.t);
    art.goal(ctx, 1, st.goalHalf[1], th.b, st.goalFlash[1], st.t);
    // wall flashes
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < wallFx.length; i++) {
      var w = wallFx[i], a = w.life / 0.35;
      var g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, 60);
      g.addColorStop(0, AH.hexA(w.col, 0.7 * a)); g.addColorStop(1, AH.hexA(w.col, 0));
      ctx.fillStyle = g; ctx.fillRect(w.x - 60, w.y - 60, 120, 120);
    }
    ctx.globalCompositeOperation = 'source-over';
    // power-ups
    for (i = 0; i < st.powers.length; i++) {
      var pw = st.powers[i];
      if (pw.life < 2 && Math.sin(pw.life * 20) < 0) continue;
      art.power(ctx, pw, st.t);
    }
    // rings
    for (i = 0; i < rings.length; i++) {
      var r = rings[i], k = 1 - r.t / r.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.col; ctx.lineWidth = r.w * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, 8 + (r.max - 8) * (1 - (1 - k) * (1 - k)), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // puck trails + pucks
    var pk = byId(AH.PUCKS, save.eq.puck);
    var pspr = art.puckSprite(pk);
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < st.pucks.length; i++) drawTrail(st.pucks[i], pk);
    ctx.globalCompositeOperation = 'source-over';
    for (i = 0; i < st.pucks.length; i++) {
      var p = st.pucks[i]; if (!p.alive) continue;
      var sc = p.spawn > 0 ? 1 + p.spawn * 2 : 1;
      var alpha = p.scored ? 0.75 : 1;
      if (p.spawn > 0) alpha = Math.max(0.2, 1 - p.spawn * 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(p.x + 4, p.y + 6, p.r, 0, Math.PI * 2); ctx.fill();
      var sz = pspr.width / 2 * sc;
      ctx.drawImage(pspr, p.x - sz / 2, p.y - sz / 2, sz, sz);
      if (p.fire > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,120,30,' + (0.35 + 0.2 * Math.sin(st.t * 30)) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 8, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    }
    // mallets
    for (i = 0; i < st.mallets.length; i++) drawMallet(st.mallets[i]);
    drawParts();
    // popups
    for (i = 0; i < pops.length; i++) {
      var pp = pops[i], pa = Math.min(1, pp.life * 3), ps = 1 + Math.max(0, pp.life - 0.9) * 2;
      ctx.globalAlpha = pa;
      ctx.save(); ctx.translate(pp.x, pp.y); ctx.scale(ps, ps);
      txt(pp.text, 0, 0, pp.size, pp.col, 'center', { stroke: 7 });
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // pointer ghost when the mouse is outside your half
    if (!st.demo && st.mallets[0] && st.mallets[0].ctrl === 'p1solo' && p1Mode === 'mouse' && (st.scene === 'play' || st.scene === 'countdown' || st.scene === 'goal') && !st.paused) {
      if (ptr.x > G.CX) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 16, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    ctx.restore();
    if (!st.demo) drawHud();
    if (st.scene === 'countdown') {
      var hint = st.mode === 1 ? (p1Mode === 'keys' ? 'حرّك مضربك بالأسهم واضرب القرص!' : 'حرّك الفأرة لتحريك مضربك!') : 'الأزرق على اليسار · الوردي على اليمين';
      txt(hint, W / 2, H / 2 + 150, 34, '#fff06a', 'center', { stroke: 8, sc: 'rgba(5,8,28,0.9)' });
    }
    drawBig();
    if (st.flash > 0) {
      ctx.globalAlpha = Math.min(0.5, st.flash);
      ctx.fillStyle = st.flashCol; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  function drawTrail(p, pk) {
    if (!p.alive || p.tn < 3 || p.spawn > 0) return;
    var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    var vis = Math.min(1, sp / 900);
    if (p.fire > 0) vis = 1;
    if (vis < 0.08) return;
    var cols = p.fire > 0 ? AH.PUCKS[1].trail : pk.trail;
    for (var j = 1; j < p.tn; j++) {
      var idx = (p.ti - 1 - j + PUCK_TRAIL * 2) % PUCK_TRAIL;
      var f = 1 - j / p.tn;
      ctx.globalAlpha = f * 0.55 * vis;
      ctx.fillStyle = cols[j % cols.length];
      ctx.beginPath(); ctx.arc(p.tx[idx], p.ty[idx], p.r * (0.35 + f * 0.6), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMallet(m) {
    // look at the most interesting puck
    var tp = null, bd = 1e9;
    for (var i = 0; i < st.pucks.length; i++) { var p = st.pucks[i]; if (!p.alive) continue; var d = Kit.dist(p.x, p.y, m.x, m.y); if (d < bd) { bd = d; tp = p; } }
    var look = { x: 0, y: 0 };
    if (tp) { var dx = tp.x - m.x, dy = tp.y - m.y, l = Math.sqrt(dx * dx + dy * dy) || 1; look.x = dx / l; look.y = dy / l; }
    var napping = m.ctrl === 'ai' && m.ai.nap > 0;
    art.mallet(ctx, m, m.skin, { face: m.face, look: look, mood: m.mood, blink: napping ? 1 : m.blink, sq: m.sq, sqAng: m.sqAng, frozen: m.frozen, t: st.t });
    if (napping) txt('ززز', m.x + 30, m.y - m.r - 16 - Math.sin(st.t * 4) * 5, 26, '#ffffff', 'center', { stroke: 5 });
    if (m.big > 0 && m.big < 1.5 && Math.sin(st.t * 20) > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r + 4, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawHud() {
    var a = st.mallets[0], b = st.mallets[1];
    if (!a || !b) return;
    var ca = sideColor(-1), cb = sideColor(1);
    // score plates
    function plate(x, col, name, score, alignRight) {
      ctx.save();
      ctx.fillStyle = 'rgba(5,8,28,0.82)';
      AH.rrect(ctx, x - 190, 10, 380, 74, 22); ctx.fill();
      ctx.strokeStyle = AH.hexA(col, 0.8); ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      // score number (big) nearer to centre, name further out
      var sx = alignRight ? x - 130 : x + 130;
      txt(String(score), sx, 48, 60, '#ffffff', 'center', { stroke: 6, sc: AH.hexA(col, 0.9), ltr: true });
      var nx = alignRight ? x + 172 : x - 172;
      txt(name, nx, 36, 26, col, alignRight ? 'right' : 'left', { stroke: 5 });
      // pips
      var n = st.goalsToWin, pw = Math.min(22, 250 / n), total = pw * (n - 1);
      var startX = alignRight ? nx - total : nx;
      for (var i = 0; i < n; i++) {
        var px = alignRight ? nx - i * pw : nx + i * pw;
        ctx.fillStyle = i < score ? col : 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.arc(px + (alignRight ? -6 : 6), 66, i < score ? 7 : 5, 0, Math.PI * 2); ctx.fill();
      }
      startX = startX;
    }
    plate(360, ca, a.name, st.score[0], false);
    plate(920, cb, b.name, st.score[1], true);
    // centre badge
    ctx.fillStyle = 'rgba(5,8,28,0.82)';
    AH.rrect(ctx, 555, 14, 170, 66, 20); ctx.fill();
    txt('الفوز عند', 640, 34, 19, '#cfe6ff', 'center');
    txt(String(st.goalsToWin), 640, 62, 30, '#fff06a', 'center', { ltr: true });
    if (st.chaos) {
      ctx.fillStyle = '#ff2f9a';
      AH.rrect(ctx, 590, 84, 100, 26, 13); ctx.fill();
      txt('فوضى!', 640, 97, 18, '#ffffff', 'center');
    }
    // power timers under plates
    powerIcons(a, 0, 360); powerIcons(b, 1, 920);
  }
  function powerIcons(m, idx, x) {
    var items = [];
    if (m.big > 0) items.push(['مضرب عملاق', m.big / 8, '#3ddc84']);
    if (st.tiny[idx] > 0) items.push(['مرمى صغير', st.tiny[idx] / 8, '#35c8ff']);
    if (m.frozen > 0) items.push(['متجمّد!', m.frozen / 2.2, '#9ff0ff']);
    for (var i = 0; i < items.length; i++) {
      var yy = 98 + i * 0, xx = x + (i - (items.length - 1) / 2) * 150;
      ctx.fillStyle = 'rgba(5,8,28,0.85)'; AH.rrect(ctx, xx - 68, yy - 13, 136, 26, 13); ctx.fill();
      ctx.fillStyle = items[i][2]; AH.rrect(ctx, xx - 68, yy - 13, 136 * Math.max(0, Math.min(1, items[i][1])), 26, 13); ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
      txt(items[i][0], xx, yy + 1, 17, '#ffffff', 'center');
    }
  }

  function drawBig() {
    var b = st.big;
    if (!b) return;
    var t = b.t, d = b.dur;
    var inT = Math.min(1, t / 0.25);
    var s = inT < 1 ? 2.2 - 1.2 * easeOutBack(inT) : 1 + (t - 0.25) * 0.05;
    var a = t > d - 0.3 ? Math.max(0, (d - t) / 0.3) : Math.min(1, t / 0.08);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, H / 2 + 20);
    ctx.scale(s, s);
    ctx.rotate(-0.04);
    txt(b.text, 0, 0, b.size, b.col, 'center', { stroke: 14, sc: 'rgba(5,8,28,0.9)', ltr: /^[0-9]+$/.test(b.text) });
    ctx.restore();
    if (b.sub) {
      ctx.globalAlpha = a;
      txt(b.sub, W / 2, H / 2 + 20 + b.size * 0.72, 34, '#ffffff', 'center', { stroke: 7 });
    }
    ctx.globalAlpha = 1;
  }
  function easeOutBack(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

  /* ======================================================= match end */
  function addCoins(n) { save.coins += n; st.earned += n; persist(); refreshCoins(); }
  function award(id) {
    if (save.awards[id]) return;
    save.awards[id] = 1;
    var a = byId(AH.AWARDS, id);
    save.coins += AH.AWARD_COINS; st.earned += AH.AWARD_COINS;
    persist(); refreshCoins();
    st.newAwards.push(a.name);
    // at the end of a match the results panel lists new awards as badges, so no toast there
    if (st.scene !== 'over') toast('جائزة جديدة: ' + a.name, AH.AWARD_COINS);
    S.award();
  }

  function endMatch() {
    setScene('over');
    st.timeScale = 1; st.slowT = 0;
    var humanWon = st.mode === 2 || st.winner < 0;
    var wIdx = sideIdx(st.winner);
    var badges = [];
    save.matches++;
    if (st.mode === 1) {
      var b = st.bot;
      if (st.winner < 0) {
        var first = !save.beaten[b.id];
        save.wins[b.id] = (save.wins[b.id] || 0) + 1;
        save.beaten[b.id] = true;
        addCoins(b.coins);
        award('win1');
        award('beat_' + b.id);
        if (st.score[1] === 0) award('clean');
        if (st.maxBehind[0] >= 3) award('comeback');
        if (st.chaos) award('chaos');
        if (first) {
          if (b.id === 'medium') badges.push(['فتحت خصمًا جديدًا: البرق!', 'gold']);
          if (b.id === 'hard') badges.push(['فتحت: المضرب الذهبي + الروبوت الخارق!', 'gold']);
          if (b.id === 'insane') badges.push(['فتحت: مضرب الألماس!', 'gold']);
        }
        syncSpecialSkins();
      } else {
        save.losses[b.id] = (save.losses[b.id] || 0) + 1;
        addCoins(3);
      }
    } else {
      addCoins(10);
      award('friends');
      if (st.chaos) award('chaos');
    }
    persist();
    // UI
    var title = $('ovTitle'), sub = $('ovSub');
    if (st.mode === 1) {
      title.textContent = st.winner < 0 ? 'فزت!' : 'خسرت!';
      title.className = st.winner < 0 ? '' : 'lose';
      var wins = save.wins[st.bot.id] || 0;
      sub.textContent = st.winner < 0 ? (wins === 1 ? 'أول فوز على ' + st.bot.name + '!' : 'فوز رقم ' + wins + ' على ' + st.bot.name + '!')
        : (st.score[0] >= st.goalsToWin - 2 ? 'كنت قريبًا جدًا! حاول مرة أخرى.' : st.bot.name + ' فاز هذه المرة. خذ ثأرك!');
    } else {
      title.textContent = st.winner < 0 ? 'فاز اللاعب 1!' : 'فاز اللاعب 2!';
      title.className = '';
      sub.textContent = 'مباراة رائعة! من سيفوز في المرة القادمة؟';
    }
    var ca = sideColor(-1), cb = sideColor(1);
    $('ovScore').innerHTML = '<span style="color:' + ca + '">' + st.score[0] + '</span><span class="dash">-</span><span style="color:' + cb + '">' + st.score[1] + '</span>';
    var sa = st.stats;
    var rows = [
      ['الأهداف', sa.goals[0], sa.goals[1]],
      ['الضربات', sa.hits[0], sa.hits[1]],
      ['أسرع ضربة (كم/س)', Math.round(sa.fast[0] * KMH), Math.round(sa.fast[1] * KMH)],
      ['الصدّات', sa.saves[0], sa.saves[1]],
      ['أهداف متتالية', sa.run[0], sa.run[1]]
    ];
    var html = '<tr><th style="color:' + ca + '">' + esc(st.mallets[0].name) + '</th><th></th><th style="color:' + cb + '">' + esc(st.mallets[1].name) + '</th></tr>';
    rows.forEach(function (r) {
      var la = r[1] > r[2] ? ' style="color:#fff06a"' : '', lb = r[2] > r[1] ? ' style="color:#fff06a"' : '';
      html += '<tr><td class="v"' + la + '>' + r[1] + '</td><td class="n">' + r[0] + '</td><td class="v"' + lb + '>' + r[2] + '</td></tr>';
    });
    $('ovStats').innerHTML = html;
    $('ovEarn').innerHTML = '<span class="coin"></span>+' + st.earned;
    var bh = '';
    badges.forEach(function (b) { bh += '<span class="badge ' + b[1] + '">' + esc(b[0]) + '</span>'; });
    var shownAw = st.newAwards.slice(0, badges.length ? 2 : 3), more = st.newAwards.length - shownAw.length;
    shownAw.forEach(function (n) { bh += '<span class="badge">' + esc('جائزة: ' + n) + '</span>'; });
    if (more > 0) bh += '<span class="badge">' + esc(more === 1 ? 'وجائزة أخرى' : more === 2 ? 'وجائزتان أخريان' : 'و ' + more + ' جوائز أخرى') + '</span>';
    $('ovBadges').innerHTML = bh;
    $('ovBadges').className = 'badges' + (badges.length + shownAw.length + (more > 0 ? 1 : 0) > 3 ? ' many' : '');
    setTimeout(function () {
      if (st.scene !== 'over') return;
      show('scr-over');
      $('toasts').innerHTML = ''; // awards are shown as badges on the panel; toasts would cover its title
      if (humanWon) { S.win(); celebrate(); } else S.lose();
    }, 250);
    document.body.classList.remove('hidecur');
    $('pauseBtn').hidden = true;
    st.mallets.forEach(function (m, i) { m.mood = i === wIdx ? 'joy' : 'sad'; m.moodT = 99; });
  }
  function celebrate() {
    for (var i = 0; i < 4; i++) emit(Kit.rand(200, 1080), Kit.rand(150, 300), { count: 30, colors: ['#ff4d6d', '#ffd23f', '#7dff6b', '#35c8ff', '#b98cff', '#ffffff'], speed: 600, life: 1.8, size: 12, drag: 1.5, kind: 2 });
  }

  /* ============================================================== UI */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var SCREENS = ['scr-title', 'scr-pause', 'scr-over', 'scr-shop', 'scr-awards'];
  function show(id) { SCREENS.forEach(function (s) { $(s).hidden = s !== id; }); }
  function refreshCoins() { var els = document.querySelectorAll('.coins'); for (var i = 0; i < els.length; i++) els[i].textContent = Kit.fmt(save.coins); }
  function toast(text, coins) {
    var t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = '<span>' + esc(text) + '</span>' + (coins ? '<span dir="ltr" style="display:inline-flex;align-items:center;gap:6px"><span class="coin" style="width:22px;height:22px"></span>+' + coins + '</span>' : '');
    $('toasts').appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3100);
  }

  function goTitle() {
    st.paused = false;
    setupMatch(true);
    show('scr-title');
    buildTitle();
    $('pauseBtn').hidden = true;
    document.body.classList.remove('hidecur');
  }
  function startGame() {
    Kit.audio.unlock();
    S.ui();
    st.paused = false;
    show(null);
    setupMatch(false);
    $('pauseBtn').hidden = false;
    if (st.mode === 1) document.body.classList.add('hidecur'); else document.body.classList.remove('hidecur');
    p1Mode = 'mouse'; mouseMoved = true;
    try { canvas.focus(); } catch (e) { /* ignore */ }
  }
  function pause(on) {
    if (st.scene === 'title' || st.demo || st.scene === 'over') return;
    st.paused = on;
    show(on ? 'scr-pause' : null);
    document.body.classList.toggle('hidecur', !on && st.mode === 1);
    Kit.keys.reset();
    S.ui();
  }

  // ---- title
  var botCanvases = {};
  function buildTitle() {
    refreshCoins();
    $('tab1').classList.toggle('on', save.mode === 1);
    $('tab2').classList.toggle('on', save.mode === 2);
    $('bots').hidden = save.mode !== 1; $('twop').hidden = save.mode !== 2;
    $('howto1').hidden = save.mode !== 1; $('howto2').hidden = save.mode !== 2;
    var gs = document.querySelectorAll('.seg.g');
    for (var i = 0; i < gs.length; i++) gs[i].classList.toggle('on', +gs[i].getAttribute('data-g') === save.goals);
    $('chaosBtn').classList.toggle('on', save.chaos);
    $('chaosBtn').textContent = save.chaos ? 'نعم!' : 'لا';
    var got = 0; AH.AWARDS.forEach(function (a) { if (save.awards[a.id]) got++; });
    $('awCount').textContent = got + '/' + AH.AWARDS.length;
    var box = $('bots');
    if (!box.children.length) {
      AH.BOTS.forEach(function (b) {
        var el = document.createElement('div'); el.className = 'bot'; el.setAttribute('data-id', b.id);
        var cv = document.createElement('canvas'); cv.width = 200; cv.height = 200;
        el.appendChild(cv); botCanvases[b.id] = cv;
        el.insertAdjacentHTML('beforeend', '<div class="nm"></div><div class="lv"></div><div class="rec"></div>');
        el.addEventListener('click', function () {
          if (!botUnlocked(b)) { S.nope(); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return; }
          save.bot = b.id; persist(); S.ui(); buildTitle();
          if (st.demo) { st.bot = b; st.mallets[1].bot = b; st.mallets[1].skin = sideSkin(1); st.mallets[1].face = b.face; }
        });
        box.appendChild(el);
      });
    }
    AH.BOTS.forEach(function (b) {
      var el = box.querySelector('[data-id="' + b.id + '"]');
      var un = botUnlocked(b);
      el.classList.toggle('sel', save.bot === b.id);
      el.classList.toggle('locked', !un);
      el.querySelector('.nm').textContent = b.name;
      var lv = el.querySelector('.lv'); lv.textContent = b.level; lv.style.background = b.lvColor;
      var w = save.wins[b.id] || 0;
      el.querySelector('.rec').textContent = !un ? 'اهزم ' + (b.id === 'hard' ? 'زيزو' : 'البرق') + ' لفتحه' : w ? 'انتصاراتك: ' + w : 'لم تهزمه بعد';
      var old = el.querySelector('.lockbox'); if (old) old.remove();
      var cup = el.querySelector('.cup'); if (cup) cup.remove();
      if (!un) {
        el.insertAdjacentHTML('beforeend', '<div class="lockbox"><div class="lockicon"></div></div>');
      } else if (save.beaten[b.id]) {
        el.insertAdjacentHTML('beforeend', cupSvg('cup'));
      }
      art.preview(botCanvases[b.id], 'bot', b);
    });
  }
  function cupSvg(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 40 40"><path d="M10 6h20v8c0 7-4 12-10 12S10 21 10 14z" fill="#ffd23f" stroke="#b8860b" stroke-width="2"/>' +
      '<path d="M10 9H5c0 6 3 8 6 8M30 9h5c0 6-3 8-6 8" fill="none" stroke="#ffd23f" stroke-width="3"/><rect x="17" y="25" width="6" height="6" fill="#e0a800"/><rect x="12" y="31" width="16" height="5" rx="2" fill="#ffd23f" stroke="#b8860b" stroke-width="1.5"/></svg>';
  }

  // ---- shop
  var shopKind = 'mallet';
  function shopList() { return shopKind === 'mallet' ? AH.MALLETS : shopKind === 'table' ? AH.TABLES : AH.PUCKS; }
  function buildShop() {
    refreshCoins();
    var tabs = document.querySelectorAll('#scr-shop .tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-k') === shopKind);
    var grid = $('shopGrid'); grid.innerHTML = '';
    shopList().forEach(function (it) {
      var el = document.createElement('div'); el.className = 'item';
      var owned = save.owned[shopKind].indexOf(it.id) >= 0;
      var eq = save.eq[shopKind] === it.id;
      if (eq) el.classList.add('eq');
      if (!owned && it.price > save.coins) el.classList.add('poor');
      var cv = document.createElement('canvas'); cv.width = 360; cv.height = 200;
      el.appendChild(cv);
      var pr;
      if (eq) pr = '<div class="pr eqd">مُستخدَم</div>';
      else if (owned) pr = '<div class="pr own">استخدم</div>';
      else if (it.price < 0) pr = '<div class="pr lock">' + (it.unlock === 'hard' ? 'اهزم البرق' : 'اهزم الروبوت الخارق') + '</div>';
      else pr = '<div class="pr"><span class="coin"></span>' + it.price + '</div>';
      el.insertAdjacentHTML('beforeend', '<div class="in">' + esc(it.name) + '</div>' + pr);
      el.addEventListener('click', function () {
        if (eq) return;
        if (owned) { save.eq[shopKind] = it.id; persist(); S.ui(); afterEquip(); buildShop(); return; }
        if (it.price < 0 || it.price > save.coins) { S.nope(); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return; }
        save.coins -= it.price; save.owned[shopKind].push(it.id); save.eq[shopKind] = it.id; save.bought++;
        persist(); S.buy(); afterEquip();
        if (save.bought >= 3) award('shopper');
        buildShop();
      });
      grid.appendChild(el);
      art.preview(cv, shopKind, it);
    });
  }
  function afterEquip() {
    if (st.mallets[0]) st.mallets[0].skin = sideSkin(-1);
    if (st.mallets[1] && st.mode === 2) st.mallets[1].skin = sideSkin(1);
  }

  // ---- awards
  function buildAwards() {
    var grid = $('awGrid'); grid.innerHTML = '';
    var got = 0;
    AH.AWARDS.forEach(function (a) {
      var has = !!save.awards[a.id]; if (has) got++;
      var el = document.createElement('div'); el.className = 'aw' + (has ? ' got' : '');
      el.innerHTML = cupSvg('ic') + '<div><div class="t">' + esc(a.name) + '</div><div class="d">' + esc(a.desc) + '</div></div>' +
        '<div class="rw">' + (has ? '&#10003;' : '<span class="coin" style="width:20px;height:20px"></span>+' + AH.AWARD_COINS) + '</div>';
      grid.appendChild(el);
    });
    $('awProg').textContent = got + '/' + AH.AWARDS.length;
  }

  // ---- wiring
  function btn(id, fn) { $(id).addEventListener('click', function (e) { e.currentTarget.blur(); fn(); }); }
  btn('tab1', function () { save.mode = 1; persist(); S.ui(); buildTitle(); });
  btn('tab2', function () { save.mode = 2; persist(); S.ui(); buildTitle(); });
  Array.prototype.forEach.call(document.querySelectorAll('.seg.g'), function (b) {
    b.addEventListener('click', function () { save.goals = +b.getAttribute('data-g'); persist(); S.ui(); b.blur(); buildTitle(); });
  });
  btn('chaosBtn', function () { save.chaos = !save.chaos; persist(); if (save.chaos) S.power(); else S.ui(); buildTitle(); });
  btn('btnPlay', startGame);
  btn('btnShop', function () { S.ui(); show('scr-shop'); buildShop(); });
  btn('btnAwards', function () { S.ui(); show('scr-awards'); buildAwards(); });
  btn('shopBack', function () { S.uiBack(); show('scr-title'); buildTitle(); });
  btn('awBack', function () { S.uiBack(); show('scr-title'); buildTitle(); });
  Array.prototype.forEach.call(document.querySelectorAll('#scr-shop .tab'), function (b) {
    b.addEventListener('click', function () { shopKind = b.getAttribute('data-k'); S.ui(); b.blur(); buildShop(); });
  });
  btn('btnResume', function () { pause(false); });
  btn('btnRestart', startGame);
  btn('btnMenu1', function () { S.uiBack(); goTitle(); });
  btn('btnAgain', startGame);
  btn('btnMenu2', function () { S.uiBack(); goTitle(); });
  $('pauseBtn').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  $('pauseBtn').addEventListener('click', function (e) { e.currentTarget.blur(); pause(!st.paused); });
  var muteBtn = Kit.muteButton();
  muteBtn.setAttribute('aria-label', 'تشغيل الصوت أو كتمه'); // shared helper sets an English label
  muteBtn.title = 'الصوت (M)';

  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var c = e.code;
    var titleOpen = !$('scr-title').hidden, overOpen = !$('scr-over').hidden;
    var shopOpen = !$('scr-shop').hidden, awOpen = !$('scr-awards').hidden;
    if (shopOpen || awOpen) {
      if (c === 'Escape') { S.uiBack(); show('scr-title'); buildTitle(); }
      return;
    }
    if (titleOpen) {
      if (c === 'Enter' || c === 'Space' || c === 'NumpadEnter') { e.preventDefault(); startGame(); }
      return;
    }
    if (overOpen) {
      if (c === 'Enter' || c === 'Space' || c === 'KeyR' || c === 'NumpadEnter') { e.preventDefault(); startGame(); }
      else if (c === 'Escape') { S.uiBack(); goTitle(); }
      return;
    }
    if (st.scene === 'over') return;
    if (c === 'KeyP' || c === 'Escape') { e.preventDefault(); pause(!st.paused); }
    else if (st.paused && c === 'KeyR') startGame();
    else if (st.paused && (c === 'Enter' || c === 'Space')) { e.preventDefault(); pause(false); }
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden && !st.demo && (st.scene === 'play' || st.scene === 'countdown' || st.scene === 'goal') && !st.paused) pause(true); });

  /* ========================================================== boot */
  goTitle();
  Kit.loop(update, render);
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 40px Fredoka', 'بهو'), document.fonts.load('700 40px Fredoka', '0123')]).then(function () { buildTitle(); }, function () { /* ignore */ });
  }

  /* ========================================================== debug */
  window.__game = {
    st: st, save: save,
    state: function () {
      return { scene: st.scene, paused: st.paused, demo: st.demo, mode: st.mode, bot: st.bot && st.bot.id, score: st.score.slice(), goalsToWin: st.goalsToWin, chaos: st.chaos,
        pucks: st.pucks.map(function (p) { return { x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), scored: p.scored }; }),
        mallets: st.mallets.map(function (m) { return { x: Math.round(m.x), y: Math.round(m.y), r: Math.round(m.r), ctrl: m.ctrl }; }),
        powers: st.powers.length, particles: parts.filter(function (p) { return p.on; }).length, coins: save.coins };
    },
    goal: function (side) { var p = st.pucks.find(function (q) { return q.alive && !q.scored; }); if (p) { p.x = side < 0 ? G.R - 30 : G.L + 30; p.y = G.CY; p.vx = side < 0 ? 900 : -900; p.vy = 0; } },
    setScore: function (a, b) { st.score = [a, b]; },
    shot: function (vx, vy, x, y) { var p = st.pucks[0]; p.x = x == null ? G.CX : x; p.y = y == null ? G.CY : y; p.vx = vx; p.vy = vy; },
    power: function (id, side) { applyPower({ x: G.CX, y: G.CY, def: byId(AH.POWERS, id) }, side || -1, null); },
    spawnPower: spawnPower,
    dbg: dbg,
    bench: function (n) { var t0 = performance.now(); for (var i = 0; i < n; i++) render(); var t1 = performance.now(); for (i = 0; i < n; i++) update(1 / 60); return { renderMs: +((t1 - t0) / n).toFixed(2), updateMs: +((performance.now() - t1) / n).toFixed(2) }; },
    // run the simulation synchronously (no rendering) for balance tests
    sim: function (sec) { var n = Math.round(sec * 60); for (var i = 0; i < n; i++) update(1 / 60); return this.state(); },
    autoplay: function (botId) { var m = st.mallets[0]; m.ctrl = 'ai'; m.bot = typeof botId === 'object' ? botId : byId(AH.BOTS, botId); m.ai.mode = 'idle'; },
    reset: function () { store.remove('save'); location.reload(); }
  };
})();
