/*
 * Block Burst (انفجار المكعبات) — browser game: rendering, input, screens, effects.
 * Uses BBCore (core.js), BBRules (rules.js), BB_LEVELS (levels.js), BBArt (art.js), BBSound (audio.js).
 */
(function () {
  'use strict';
  var W = 1280, H = 720, N = 8;
  var Core = window.BBCore, Rules = window.BBRules, LV = window.BB_LEVELS, Art = window.BBArt, Snd = window.BBSound;
  var store = Kit.store('block-burst');

  /* ------------------------------------------------------------ layout */
  var C = 62, BX = 392, BY = 34;             // board grid origin + cell size
  var TC = 30, TY = 628, TX = [410, 640, 870]; // tray
  var LPX = 40, LPW = 300, RPX = 940, RPW = 300;
  var BOMB_BTN = { x: 120, y: 612, r: 46 }, SHUF_BTN = { x: 260, y: 612, r: 46 };

  /* ------------------------------------------------------------- save */
  var save = {
    best: store.get('best', 0) | 0,
    adv: store.get('adv', []),
    skin: store.get('skin', 0) | 0,
    music: store.get('music', true) !== false,
    stats: store.get('stats', { games: 0, lines: 0, perfects: 0, bestCombo: 0 }),
    seen: store.get('seenSkins', [0])
  };
  if (!Array.isArray(save.adv)) save.adv = [];
  for (var li = 0; li < LV.LEVELS.length; li++) save.adv[li] = Math.max(0, Math.min(3, save.adv[li] | 0));
  if (!Array.isArray(save.seen)) save.seen = [0];
  if (!(save.skin >= 0 && save.skin < Art.SKINS.length)) save.skin = 0;
  function totalStars() { var s = 0; for (var i = 0; i < save.adv.length; i++) s += save.adv[i] | 0; return s; }
  function skinUnlocked(i) {
    var n = Art.SKINS[i].need;
    if (!n) return true;
    if (n.stars) return totalStars() >= n.stars;
    if (n.best) return save.best >= n.best;
    return true;
  }
  if (!skinUnlocked(save.skin)) save.skin = 0;
  function persistStats() { store.set('stats', save.stats); }

  /* ------------------------------------------------------------- dom */
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), fxCanvas = $('fx'), ui = $('ui');
  var view = Kit.fit(canvas, W, H, { onResize: onResize });
  var fxView = Kit.fit(fxCanvas, W, H);
  var ctx = view.ctx, fctx = fxView.ctx;
  function onResize(v) {
    ui.style.left = canvas.style.left;
    ui.style.top = canvas.style.top;
    ui.style.transform = 'scale(' + v.scale + ')';
  }
  onResize(view);
  function artK() { return Math.min(2.5, Math.round(view.scale * view.dpr * 100) / 100); }

  var SCR = ['scrTitle', 'scrMap', 'hud', 'scrPause', 'scrOver', 'scrWin', 'scrFail'];
  function show(ids) { SCR.forEach(function (s) { $(s).hidden = ids.indexOf(s) < 0; }); }

  Kit.muteButton();
  var musicBtn = $('btnMusicTop');
  musicBtn.textContent = '🎵';
  function paintMusic() {
    musicBtn.classList.toggle('off', !save.music);
    $('musicState').textContent = save.music ? 'تعمل' : 'متوقفة';
    Snd.music.setOn(save.music);
  }
  function toggleMusic() { save.music = !save.music; store.set('music', save.music); paintMusic(); Snd.button(); }
  musicBtn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  musicBtn.addEventListener('click', function (e) { e.stopPropagation(); Kit.audio.unlock(); toggleMusic(); startMusic(); musicBtn.blur(); });
  paintMusic();
  function startMusic() { if (Kit.audio.ctx) Snd.music.start(); }

  var toastTimer = 0;
  function toast(msg, dur) {
    var t = $('toast');
    t.hidden = true; void t.offsetWidth;
    t.textContent = msg; t.hidden = false;
    toastTimer = dur || 2.2;
  }

  /* ------------------------------------------------------------ state */
  var state = 'title';   // title | map | play | ending | pause | over | win | fail
  var run = null, runLevel = -1;
  var time = 0;
  var placeT = new Float32Array(64), popMode = new Uint8Array(64);
  var dying = [], shards = [], parts = [], popups = [], beams = [], flyGems = [], confetti = [];
  var shake = Kit.shake();
  var slots = [0, 1, 2].map(function () { return { appear: 1, ret: null, hover: 0, fits: true }; });
  var drag = null;      // {slot | bomb, x, y, tx, ty, fx, fy, scale, r, c, valid, pv, sticky, t0, sx, sy}
  var hl = new Uint8Array(64);
  var dispScore = 0, scoreBump = 0, bestAtStart = 0, bestCelebrated = false;
  var bigWord = null, banner = null, endTimer = 0, endKind = null;
  var greyList = [], greyN = 0, greyAcc = 0;
  var powerPulse = 0, goalBump = {}, comboBump = 0;
  var hintIdle = 0;

  /* ----------------------------------------------------------- helpers */
  function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function skin() { return Art.SKINS[save.skin]; }
  function cellX(c) { return BX + c * C; }
  function cellY(r) { return BY + r * C; }

  function txt(s, x, y, size, fill, align, o) {
    o = o || {};
    ctx.font = (o.w || 700) + ' ' + size + 'px Fredoka';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = o.base || 'middle';
    ctx.direction = o.ltr ? 'ltr' : 'rtl';
    if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = o.sw || size * 0.2; ctx.strokeStyle = o.stroke; ctx.strokeText(s, x, y); }
    ctx.fillStyle = fill; ctx.fillText(s, x, y);
    ctx.direction = 'ltr';
  }
  function card(x, y, w, h, fill) {
    Art.rr(ctx, x, y + 5, w, h, 22); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    Art.rr(ctx, x, y, w, h, 22); ctx.fillStyle = fill || 'rgba(27,15,58,0.78)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.stroke();
  }
  function blk(color, gem) { return Art.block(save.skin, color, gem); }

  /* -------------------------------------------------------- particles */
  function spark(x, y, color, n, spd, opts) {
    opts = opts || {};
    for (var i = 0; i < n; i++) {
      if (parts.length >= 520) parts.shift();
      var a = Math.random() * Math.PI * 2, v = spd * (0.35 + Math.random() * 0.65);
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opts.up || 0), life: 0, max: (opts.life || 0.6) * (0.6 + Math.random() * 0.5),
        size: (opts.size || 8) * (0.6 + Math.random() * 0.7), color: color, kind: opts.kind != null ? opts.kind : (Math.random() < 0.3 ? 2 : Math.random() < 0.5 ? 1 : 0),
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, g: opts.g == null ? 900 : opts.g });
    }
  }
  function popup(x, y, text, color, size) { popups.push({ x: x, y: y, text: text, color: color || '#fff', size: size || 34, t: 0 }); if (popups.length > 24) popups.shift(); }
  function confettiBurst(n, x, y) {
    var cols = skin().pal.concat(['#ffffff']);
    for (var i = 0; i < n; i++) {
      if (confetti.length > 360) confetti.shift();
      var fromTop = x == null;
      confetti.push({ x: fromTop ? Math.random() * W : x, y: fromTop ? -20 - Math.random() * 200 : y,
        vx: fromTop ? (Math.random() - 0.5) * 120 : (Math.random() - 0.5) * 900, vy: fromTop ? 80 + Math.random() * 160 : -300 - Math.random() * 600,
        w: 8 + Math.random() * 8, h: 5 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
        color: cols[i % cols.length], life: 0, max: 3 + Math.random() * 1.5, ph: Math.random() * 6 });
    }
  }

  /* ------------------------------------------------------------- deal */
  function dealAnim() {
    for (var i = 0; i < 3; i++) { slots[i].appear = -i * 0.09; slots[i].ret = null; }
    Snd.deal();
  }
  function refreshFits() {
    if (!run) return;
    var f = Rules.trayFits(run);
    for (var i = 0; i < 3; i++) slots[i].fits = f.each[i];
  }
  function trayTL(i, sc) {
    var p = run.tray[i]; sc = sc || TC;
    return { x: TX[i] - p.shape.w * sc / 2, y: TY - p.shape.h * sc / 2 };
  }

  /* ----------------------------------------------------------- start */
  function resetFx() {
    dying.length = 0; shards.length = 0; parts.length = 0; popups.length = 0; beams.length = 0; flyGems.length = 0;
    bigWord = null; drag = null; hl.fill(0); greyList = []; greyN = 0; endTimer = 0; endKind = null; powerPulse = 0; goalBump = {};
    canvas.style.cursor = 'default';
  }
  function introBoard() {
    for (var i = 0; i < 64; i++) { placeT[i] = -((i >> 3) + (i & 7)) * 0.035 - 0.1; popMode[i] = 1; }
  }
  function startClassic(fresh) {
    resetFx();
    var saved = store.get('run', null);
    run = null;
    if (!fresh && saved && saved.mode === 'classic') run = Rules.load(saved, null);
    if (!run) { run = Rules.newRun('classic', null, Math.random); store.remove('run'); }
    runLevel = -1;
    dispScore = run.score; bestAtStart = save.best; bestCelebrated = run.score > save.best;
    introBoard(); dealAnim(); refreshFits();
    save.stats.games++; persistStats();
    overUnlockBefore = unlockSnapshot();
    state = 'play'; show(['hud']);
    banner = run.moves ? { t: 0, title: 'تابع اللعب!', sub: 'النقاط: ' + run.score } : { t: 0, title: 'كلاسيكي', sub: 'املأ الصفوف والأعمدة لتفجيرها!' };
    Snd.button(); startMusic();
    checkStuck();
  }
  function levelGoalText(lv) {
    var parts2 = [];
    if (lv.gems) parts2.push('اجمع الجواهر');
    if (lv.score) parts2.push('اجمع ' + lv.score + ' نقطة');
    var s = parts2.join(' و');
    if (lv.moves) s += ' في ' + lv.moves + ' قطعة';
    return s + '!';
  }
  function startLevel(idx) {
    resetFx();
    runLevel = idx;
    run = Rules.newRun('adv', LV.LEVELS[idx], Math.random);
    dispScore = 0;
    introBoard(); dealAnim(); refreshFits();
    state = 'play'; show(['hud']);
    banner = { t: 0, title: 'المرحلة ' + (idx + 1), sub: levelGoalText(LV.LEVELS[idx]), world: LV.WORLDS[LV.LEVELS[idx].world] };
    Snd.button(); startMusic();
  }
  function restart() { if (runLevel >= 0) startLevel(runLevel); else { store.remove('run'); startClassic(true); } }

  /* ------------------------------------------------------------- place */
  function doPlace(slot, r, c) {
    var piece = run.tray[slot];
    var ev = Rules.place(run, slot, r, c);
    hintIdle = 0;
    var s = piece.shape, cx = 0, cy = 0;
    for (var k = 0; k < s.cells.length; k++) {
      var i = (r + s.cells[k][0]) * N + (c + s.cells[k][1]);
      placeT[i] = 0; popMode[i] = 0;
      cx += cellX(c + s.cells[k][1]) + C / 2; cy += cellY(r + s.cells[k][0]) + C / 2;
    }
    cx /= s.cells.length; cy /= s.cells.length;
    var col = skin().pal[(piece.color - 1) % 8];
    Snd.place(s.n);
    shake.add(2.5);
    for (k = 0; k < s.cells.length; k++) spark(cellX(c + s.cells[k][1]) + C / 2, cellY(r + s.cells[k][0]) + C - 6, 'rgba(255,255,255,0.8)', 2, 120, { kind: 1, life: 0.35, size: 7, g: 200 });
    popup(cx, cy - 10, '+' + ev.placePts, '#ffffff', 26);
    if (ev.lines) handleClear(ev, cx, cy, col);
    afterEvent(ev);
    if (ev.refilled) dealAnim();
    refreshFits();
    if (run.mode === 'classic' && !ev.over) store.set('run', Rules.save(run));
    return ev;
  }

  var WORDS = ['', 'جميل!', 'رائع!', 'مذهل!', 'خيالي!', 'أسطوري!'];
  var WORD_COLS = ['#ffffff', '#7dff9a', '#5fe0ff', '#ffd21f', '#ff8a1f', '#ff5fc8'];
  function handleClear(ev, cx, cy, col) {
    var cleared = ev.cleared;
    for (var q = 0; q < cleared.length; q++) {
      var cl = cleared[q], y = cl.i >> 3, x = cl.i & 7;
      var d = Math.sqrt(Math.pow(cellX(x) + C / 2 - cx, 2) + Math.pow(cellY(y) + C / 2 - cy, 2));
      dying.push({ i: cl.i, color: cl.color, gem: cl.gem, t: -d / 1400, done: false });
      if (cl.gem && run.goalGems && run.goalGems[cl.gem] != null) flyGem(cl.gem, cellX(x) + C / 2, cellY(y) + C / 2, -d / 1400 + 0.05);
    }
    ev.rows.forEach(function (rr) { beams.push({ row: rr, t: 0, color: col }); });
    ev.cols.forEach(function (cc) { beams.push({ col: cc, t: 0, color: col }); });
    Snd.clear(ev.lines, ev.streak);
    shake.add(Math.min(16, 4 + ev.lines * 3 + ev.streak));
    var pts = ev.clearPts + ev.bonus;
    popup(cx, cy - 50, '+' + ev.clearPts, '#ffd21f', 44 + Math.min(4, ev.lines) * 6);
    save.stats.lines += ev.lines;
    if (ev.streak > (save.stats.bestCombo | 0)) save.stats.bestCombo = ev.streak;
    var lvlW = Math.min(5, ev.lines), main = null, sub = '';
    if (ev.lines >= 2) { main = WORDS[lvlW]; if (ev.streak >= 2) sub = 'كومبو ' + ev.streak; }
    else if (ev.streak >= 2) main = 'كومبو ' + ev.streak + '!';
    else main = WORDS[1];
    var big = ev.lines >= 2 || ev.streak >= 2;
    bigWord = { text: main, sub: sub, t: 0, color: WORD_COLS[Math.min(5, Math.max(lvlW, ev.streak >= 2 ? Math.min(5, ev.streak) : 1))], size: big ? 86 + Math.min(3, ev.lines - 1) * 8 : 54 };
    if (big) { Snd.word(Math.min(3, Math.max(ev.lines, ev.streak) - 2)); comboBump = 1; }
    if (ev.perfect) {
      bigWord = { text: 'لوحة نظيفة!', sub: '+' + ev.bonus, t: 0, color: '#ffd21f', size: 96 };
      save.stats.perfects++;
      setTimeout(function () { Snd.perfect(); }, 150);
      confettiBurst(140);
      shake.add(18);
    }
    persistStats();
    return pts;
  }
  function flyGem(kind, x, y, delay) {
    var tgt = goalPos[kind] || { x: LPX + 60, y: 160 };
    flyGems.push({ kind: kind, x0: x, y0: y, x1: tgt.x, y1: tgt.y, t: delay || 0, dur: 0.6 });
  }

  function afterEvent(ev) {
    if (ev.gift) {
      toast(ev.gift === 'bomb' ? 'هدية! قنبلة إضافية 💣' : 'هدية! خلط إضافي 🔀');
      Snd.gift(); powerPulse = 1.5;
    }
    if (run.mode === 'classic' && run.score > save.best) {
      save.best = run.score; store.set('best', save.best);
      if (!bestCelebrated && bestAtStart > 0) {
        bestCelebrated = true;
        toast('🏆 رقم قياسي جديد!');
        Snd.newBest(); confettiBurst(60);
      }
    }
    if (ev.win) { state = 'ending'; endKind = 'win'; endTimer = 1.1; cancelDrag(); return; }
    if (ev.over) {
      state = 'ending'; endKind = run.level ? 'fail' : 'over'; cancelDrag();
      endTimer = ev.fail === 'moves' ? 1.0 : 99;
      if (ev.fail === 'space') startGreying();
      if (run.mode === 'classic') store.remove('run');
      return;
    }
    if (ev.stuck) { toast('لا مكان للقطع! استخدم قوة خارقة 💣🔀', 3); Snd.stuck(); powerPulse = 3; }
  }
  function checkStuck() {
    var f = Rules.trayFits(run);
    if (!f.any && (run.bombs > 0 || run.shuffles > 0)) { toast('لا مكان للقطع! استخدم قوة خارقة 💣🔀', 3); powerPulse = 3; }
  }
  function startGreying() {
    greyList = [];
    for (var i = 0; i < 64; i++) if (run.cells[i]) greyList.push(i);
    greyN = 0; greyAcc = 0;
    Snd.stuck();
    shake.add(6);
  }

  /* -------------------------------------------------------------- power */
  function doBomb(r, c) {
    var ev = Rules.useBomb(run, r, c);
    if (!ev) return;
    hintIdle = 0;
    var cx = cellX(ev.c + 1) + C / 2, cy = cellY(ev.r + 1) + C / 2;
    for (var q = 0; q < ev.cleared.length; q++) {
      var cl = ev.cleared[q], y = cl.i >> 3, x = cl.i & 7;
      var d = Math.sqrt(Math.pow(cellX(x) + C / 2 - cx, 2) + Math.pow(cellY(y) + C / 2 - cy, 2));
      dying.push({ i: cl.i, color: cl.color, gem: cl.gem, t: -d / 2400, done: false, bomb: true });
      if (cl.gem && run.goalGems && run.goalGems[cl.gem] != null) flyGem(cl.gem, cellX(x) + C / 2, cellY(y) + C / 2, 0.05);
    }
    Snd.bomb(); shake.add(20);
    spark(cx, cy, '#ffd21f', 40, 700, { life: 0.7, size: 12 });
    spark(cx, cy, '#ff5a2a', 30, 500, { life: 0.6, size: 14, kind: 1 });
    spark(cx, cy, '#ffffff', 16, 300, { life: 0.4, size: 10, kind: 2 });
    beams.push({ boom: true, x: cx, y: cy, t: 0 });
    if (ev.points) popup(cx, cy - 40, '+' + ev.points, '#ffd21f', 44);
    bigWord = { text: 'بوم!', sub: '', t: 0, color: '#ff8a1f', size: 96 };
    afterEvent(ev);
    refreshFits();
    if (run.mode === 'classic' && !ev.over) store.set('run', Rules.save(run));
  }
  function doShuffle() {
    var ev = Rules.useShuffle(run);
    if (!ev) { Snd.bad(); return; }
    hintIdle = 0;
    Snd.shuffle();
    for (var i = 0; i < 3; i++) spark(TX[i], TY, '#ffffff', 10, 300, { kind: 2, life: 0.5, g: 0 });
    dealAnim(); refreshFits();
    afterEvent(ev);
    if (run.mode === 'classic' && !ev.over) store.set('run', Rules.save(run));
  }

  /* -------------------------------------------------------------- input */
  function logical(e) { return view.toLogical(e.clientX, e.clientY); }
  function slotAt(p) {
    for (var i = 0; i < 3; i++) {
      if (!run.tray[i] || slots[i].appear < 0.6) continue;
      if (Math.abs(p.x - TX[i]) < 108 && Math.abs(p.y - TY) < 80) return i;
    }
    return -1;
  }
  function inBtn(p, b) { return Math.pow(p.x - b.x, 2) + Math.pow(p.y - b.y, 2) < Math.pow(b.r + 8, 2); }
  var lastPtr = { x: 640, y: 360 };

  canvas.addEventListener('pointerdown', function (e) {
    Kit.audio.unlock(); startMusic();
    try { canvas.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
    if (state !== 'play') return;
    var p = logical(e); lastPtr = p;
    if (e.button === 2) { if (drag) returnPiece(); return; }
    if (e.button !== 0) return;
    if (drag && drag.sticky) { drop(p); return; }
    if (drag) return;
    var s = slotAt(p);
    if (s >= 0) { startDrag(s, p); return; }
    if (inBtn(p, BOMB_BTN)) {
      if (run.bombs > 0) { drag = { bomb: true, x: p.x, y: p.y, tx: p.x, ty: p.y, t0: time, sx: p.x, sy: p.y, sticky: false, r: -1, c: -1, valid: false, scale: 1 }; Snd.pick(); Snd.fuse(); canvas.style.cursor = 'grabbing'; }
      else { Snd.bad(); toast('لا توجد قنابل الآن'); }
      return;
    }
    if (inBtn(p, SHUF_BTN)) {
      if (run.shuffles > 0) doShuffle(); else { Snd.bad(); toast('لا يوجد خلط الآن'); }
    }
  });
  window.addEventListener('pointermove', function (e) {
    var p = logical(e); lastPtr = p;
    if (state !== 'play') return;
    if (drag) { moveDrag(p); return; }
    var s = slotAt(p), hov = s >= 0 || (inBtn(p, BOMB_BTN) && run.bombs > 0) || (inBtn(p, SHUF_BTN) && run.shuffles > 0);
    canvas.style.cursor = hov ? 'grab' : 'default';
  });
  window.addEventListener('pointerup', function (e) {
    if (!drag || state !== 'play' || e.button === 2) return;
    var p = logical(e);
    var moved = Math.abs(p.x - drag.sx) + Math.abs(p.y - drag.sy);
    if (!drag.sticky && time - drag.t0 < 0.3 && moved < 12) { drag.sticky = true; drag.stickyT = time; return; }
    if (drag.sticky && time - drag.stickyT < 0.05) return;
    drop(p);
  });

  function startDrag(s, p) {
    var tl = trayTL(s), sh = run.tray[s].shape;
    var fx = clamp((p.x - tl.x) / (sh.w * TC), 0.1, 0.9), fy = clamp((p.y - tl.y) / (sh.h * TC), 0.1, 0.9);
    drag = { slot: s, fx: fx, fy: fy, x: tl.x, y: tl.y, scale: TC / C, sticky: false, t0: time, sx: p.x, sy: p.y, r: -1, c: -1, valid: false, pv: null };
    moveDrag(p);
    drag.x = tl.x; drag.y = tl.y; // start from tray position, glide to cursor
    Snd.pick();
    canvas.style.cursor = 'grabbing';
  }
  function moveDrag(p) {
    if (drag.bomb) {
      drag.tx = p.x; drag.ty = p.y;
      var r = Math.floor((p.y - BY) / C), c = Math.floor((p.x - BX) / C);
      var on = r >= 0 && r < N && c >= 0 && c < N;
      if (on) { var a = Rules.bombArea(r, c); if (a.r !== drag.r || a.c !== drag.c) Snd.snap(); drag.r = a.r; drag.c = a.c; } else { drag.r = -1; drag.c = -1; }
      drag.valid = on;
      return;
    }
    var sh = run.tray[drag.slot].shape;
    var lift = 18;
    drag.tx = p.x - drag.fx * sh.w * C;
    drag.ty = p.y - drag.fy * sh.h * C - lift;
    var rf = (drag.ty - BY) / C, cf = (drag.tx - BX) / C;
    var mask = Core.maskFromBoard(run.cells), best = null, bd = 1e9;
    var r0 = Math.round(rf), c0 = Math.round(cf);
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      var rr = r0 + dr, cc = c0 + dc;
      var d = Math.pow(rr - rf, 2) + Math.pow(cc - cf, 2);
      if (d > 0.62 || d >= bd) continue;
      if (Core.fits(mask, sh, rr, cc)) { bd = d; best = [rr, cc]; }
    }
    var ocx = rf + sh.h / 2, occ = cf + sh.w / 2;
    var over = ocx > -0.3 && ocx < N + 0.3 && occ > -0.3 && occ < N + 0.3;
    var nr, nc, valid;
    if (best) { nr = best[0]; nc = best[1]; valid = true; }
    else if (over) { nr = clamp(r0, 0, N - sh.h); nc = clamp(c0, 0, N - sh.w); valid = false; }
    else { nr = -1; nc = -1; valid = false; }
    if (nr !== drag.r || nc !== drag.c || valid !== drag.valid) {
      if (valid) Snd.snap();
      drag.r = nr; drag.c = nc; drag.valid = valid;
      hl.fill(0);
      drag.pv = null;
      if (valid) {
        var pv = Core.previewLines(mask, sh, nr, nc);
        if (pv.rows.length || pv.cols.length) {
          drag.pv = pv;
          pv.rows.forEach(function (y) { for (var x = 0; x < N; x++) hl[y * N + x] = 1; });
          pv.cols.forEach(function (x) { for (var y = 0; y < N; y++) hl[y * N + x] = 1; });
        }
      }
    }
  }
  function drop(p) {
    if (!drag) return;
    moveDrag(p);
    if (drag.bomb) {
      var d = drag; drag = null; canvas.style.cursor = 'default';
      if (d.valid) doBomb(d.r + 1, d.c + 1); else Snd.back();
      return;
    }
    if (drag.valid) {
      var s = drag.slot, r = drag.r, c = drag.c;
      drag = null; hl.fill(0); canvas.style.cursor = 'default';
      doPlace(s, r, c);
    } else returnPiece();
  }
  function returnPiece() {
    if (!drag) return;
    if (!drag.bomb) {
      slots[drag.slot].ret = { x: drag.x, y: drag.y, scale: drag.scale, t: 0 };
      if (drag.r >= 0) { Snd.bad(); } else Snd.back();
    }
    drag = null; hl.fill(0); canvas.style.cursor = 'default';
  }
  function cancelDrag() { if (drag) { if (!drag.bomb) slots[drag.slot].ret = { x: drag.x, y: drag.y, scale: drag.scale, t: 0 }; drag = null; hl.fill(0); canvas.style.cursor = 'default'; } }

  /* ------------------------------------------------------------ keyboard */
  window.addEventListener('keydown', function (e) {
    var k = e.code;
    if (k === 'Enter' || k === 'Space' || k === 'NumpadEnter') e.preventDefault();
    if (e.repeat) return;
    Kit.audio.unlock(); startMusic();
    var go = k === 'Enter' || k === 'Space' || k === 'NumpadEnter';
    switch (state) {
      case 'title':
        if (go) startClassic(false);
        else if (k === 'KeyA') openMap();
        break;
      case 'map':
        if (k === 'Escape') openTitle();
        else if (go) startLevel(nextLevelIdx());
        break;
      case 'play': case 'ending':
        if ((k === 'KeyP' || k === 'Escape') && state === 'play') pause();
        break;
      case 'pause':
        if (k === 'KeyP' || k === 'Escape') resume();
        else if (k === 'KeyR') restart();
        break;
      case 'over':
        if (go || k === 'KeyR') restart();
        else if (k === 'Escape') openTitle();
        break;
      case 'win':
        if (go) nextLevel();
        else if (k === 'KeyR') startLevel(runLevel);
        else if (k === 'Escape') openMap();
        break;
      case 'fail':
        if (go || k === 'KeyR') startLevel(runLevel);
        else if (k === 'Escape') openMap();
        break;
    }
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden && state === 'play') pause(); });

  /* ------------------------------------------------------------ screens */
  function pause() { cancelDrag(); state = 'pause'; show(['hud', 'scrPause']); Snd.button(); }
  function resume() { state = 'play'; show(['hud']); Snd.button(); }
  function openTitle() { state = 'title'; run = null; resetFx(); buildTitle(); show(['scrTitle']); }
  function openMap() { state = 'map'; run = null; resetFx(); buildMap(); show(['scrMap']); Snd.button(); }
  function nextLevelIdx() {
    for (var i = 0; i < LV.LEVELS.length; i++) if (!save.adv[i]) return i;
    return LV.LEVELS.length - 1;
  }
  function levelUnlocked(i) { return i === 0 || save.adv[i - 1] > 0; }
  function nextLevel() {
    if (runLevel + 1 < LV.LEVELS.length) startLevel(runLevel + 1); else openMap();
  }

  function unlockSnapshot() { return Art.SKINS.map(function (s, i) { return skinUnlocked(i); }); }
  function announceUnlocks(before) {
    var got = [];
    Art.SKINS.forEach(function (s, i) { if (!before[i] && skinUnlocked(i)) got.push(s.name); });
    if (got.length) {
      setTimeout(function () { toast('🎉 شكل جديد: ' + got.join(' و'), 3); Snd.unlock(); }, 900);
    }
  }
  function unlockBarHTML() {
    var ts = totalStars(), best = save.best;
    for (var i = 0; i < Art.SKINS.length; i++) {
      var s = Art.SKINS[i];
      if (skinUnlocked(i)) continue;
      var have, need, label;
      if (s.need.stars) { have = ts; need = s.need.stars; label = 'اجمع ' + need + ' نجمة في المغامرة'; }
      else { have = best; need = s.need.best; label = 'سجّل ' + need + ' نقطة في الكلاسيكي'; }
      var pct = Math.round(Math.min(1, have / need) * 100);
      return '🔒 الشكل التالي «' + s.name + '»: ' + label + ' (' + Math.min(have, need) + ' / ' + need + ')' +
        '<div class="ub"><i style="width:' + pct + '%"></i></div>';
    }
    return '✨ فتحت كل الأشكال! أنت بطل!';
  }

  function showOver() {
    state = 'over';
    var isBest = run.score > 0 && run.score >= save.best && (run.score > bestAtStart);
    if (run.score > save.best) { save.best = run.score; store.set('best', save.best); }
    $('overHead').textContent = run.score >= 1500 ? 'لعب رائع!' : 'لا مساحة!';
    $('overScore').textContent = Kit.fmt(0);
    $('overBest').textContent = Kit.fmt(save.best);
    $('overLines').textContent = run.linesTotal;
    $('overCombo').textContent = run.bestStreak;
    $('overNewBest').hidden = !isBest;
    $('overUnlock').innerHTML = unlockBarHTML();
    show(['hud', 'scrOver']);
    countUp($('overScore'), run.score);
    if (isBest) { Snd.newBest(); confettiBurst(160); } else Snd.over();
    if (overUnlockBefore) announceUnlocks(overUnlockBefore);
    overUnlockBefore = null;
    buildTitle();
  }
  var overUnlockBefore = null;
  function countUp(el, target) {
    var t0 = performance.now(), dur = Math.min(1200, 300 + target / 3);
    function step() {
      var k = Math.min(1, (performance.now() - t0) / dur);
      el.textContent = Kit.fmt(target * easeOutCubic(k));
      if (k < 1 && state !== 'play') requestAnimationFrame(step);
      else el.textContent = Kit.fmt(target);
    }
    step();
  }
  function showWin() {
    state = 'win';
    var lv = LV.LEVELS[runLevel], st = Rules.stars(lv, run.moves);
    var before = unlockSnapshot();
    var prev = save.adv[runLevel] | 0;
    if (st > prev) { save.adv[runLevel] = st; store.set('adv', save.adv); }
    $('winHead').textContent = st === 3 ? 'مثالي!' : st === 2 ? 'أحسنت!' : 'نجحت!';
    $('winSub').textContent = 'المرحلة ' + (runLevel + 1) + ' مكتملة';
    $('winScore').textContent = Kit.fmt(run.score);
    $('winMoves').textContent = run.moves;
    $('winHint').textContent = st < 3 ? 'للحصول على 3 نجوم: أنهِها بـ ' + lv.stars[0] + ' قطعة أو أقل' : 'أنت نجم! ★';
    var last = runLevel + 1 >= LV.LEVELS.length;
    $('btnNext').innerHTML = last ? '🏁 الخريطة <span class="sg-key">Enter</span>' : 'التالي ◀ <span class="sg-key">Enter</span>';
    $('winUnlock').innerHTML = unlockBarHTML();
    var stars = $('winStars').children;
    for (var i = 0; i < 3; i++) stars[i].className = '';
    show(['hud', 'scrWin']);
    Snd.win();
    confettiBurst(120);
    for (i = 0; i < st; i++) (function (j) {
      setTimeout(function () { if (state !== 'win') return; stars[j].className = 'on'; Snd.star(j); confettiBurst(24, 640 + (j - 1) * 96, 250); }, 450 + j * 380);
    })(i);
    if (last && st > 0 && prev === 0) setTimeout(function () { toast('🏆 أنهيت المغامرة كلها! مذهل!', 3.5); }, 1800);
    announceUnlocks(before);
  }
  function showFail(reason) {
    state = 'fail';
    $('failHead').textContent = reason === 'moves' ? 'نفدت القطع!' : 'لا مساحة!';
    var close = goalProgress() >= 0.6;
    $('failSub').textContent = close ? 'كنت قريبًا جدًا!' : 'حاول مرة أخرى، ستنجح!';
    $('failGoal').innerHTML = remainingGoalHTML();
    show(['hud', 'scrFail']);
    Snd.over();
  }
  function goalProgress() {
    var lv = run.level, tot = 0, got = 0;
    if (lv.gems) for (var k in lv.gems) { tot += lv.gems[k]; got += lv.gems[k] - (run.goalGems[k] || 0); }
    if (lv.score) { tot += 10; got += 10 * Math.min(1, run.score / lv.score); }
    return tot ? got / tot : 0;
  }
  var gemURL = {};
  function gemIcon(kind) {
    if (!gemURL[kind]) { try { gemURL[kind] = Art.gemSprite(kind).toDataURL(); } catch (e) { gemURL[kind] = ''; } }
    return gemURL[kind];
  }
  function remainingGoalHTML() {
    var lv = run.level, out = [];
    if (run.goalGems) for (var k in run.goalGems) if (run.goalGems[k] > 0) out.push('<span class="gi" style="background-image:url(' + gemIcon(k) + ')"></span> ' + run.goalGems[k]);
    if (lv.score && run.score < lv.score) out.push('النقاط ' + run.score + ' / ' + lv.score);
    return out.length ? 'بقي: ' + out.join(' &nbsp; ') : '';
  }

  /* ------------------------------------------------------------ title */
  function blockURL(skinIdx, color, gem, size) {
    var cv = document.createElement('canvas'); cv.width = cv.height = size;
    cv.getContext('2d').drawImage(Art.block(skinIdx, color, gem), 0, 0, size, size);
    return cv.toDataURL();
  }
  function artURL(cells, size, gemAt) {
    var cv = document.createElement('canvas'); cv.width = cv.height = size;
    var g = cv.getContext('2d'), cs = size / 4;
    cells.forEach(function (c, i) { g.drawImage(Art.block(save.skin, c[2], gemAt === i ? c[3] : 0), c[1] * cs, c[0] * cs, cs, cs); });
    return cv.toDataURL();
  }
  function buildTitle() {
    var bl = document.querySelectorAll('.logo-blocks i');
    [1, 3, 6].forEach(function (col, i) { if (bl[i]) bl[i].style.backgroundImage = 'url(' + blockURL(save.skin, col, 0, 96) + ')'; });
    document.querySelector('.art-classic').style.backgroundImage = 'url(' + artURL([[1, 0, 6], [1, 1, 6], [1, 2, 6], [2, 1, 6], [3, 0, 3], [3, 1, 3], [3, 2, 1], [3, 3, 1], [2, 3, 1], [0, 3, 5]], 160) + ')';
    document.querySelector('.art-adv').style.backgroundImage = 'url(' + artURL([[0, 1, 4], [1, 0, 2], [1, 1, 8, 1], [1, 2, 2], [2, 1, 4], [3, 0, 7, 3], [3, 1, 7], [3, 2, 5], [2, 3, 5, 2], [3, 3, 5]], 160, 2) + ')';
    var saved = store.get('run', null), cont = saved && saved.mode === 'classic' && saved.score > 0;
    $('classicSub').textContent = cont ? 'النقاط الآن: ' + saved.score : 'الأفضل: ' + Kit.fmt(save.best);
    $('classicGo').textContent = cont ? '▶ تابع' : '▶ العب';
    $('btnNew').hidden = !cont;
    $('advSub').innerHTML = '<i class="st"></i> ' + totalStars() + ' / ' + (LV.LEVELS.length * 3);
    var box = $('skins'); box.innerHTML = '';
    Art.SKINS.forEach(function (s, i) {
      var b = document.createElement('button'); b.type = 'button';
      var open = skinUnlocked(i);
      b.className = 'skin' + (i === save.skin ? ' on' : '') + (open ? '' : ' locked') + (open && save.seen.indexOf(i) < 0 ? ' fresh' : '');
      var prev = document.createElement('span'); prev.className = 'sprev';
      prev.style.backgroundImage = 'url(' + skinPreview(i) + ')';
      b.appendChild(prev);
      var nm = document.createElement('span'); nm.className = 'sname'; nm.textContent = s.name; b.appendChild(nm);
      if (!open) {
        var lk = document.createElement('span'); lk.className = 'lock'; lk.textContent = '🔒'; b.appendChild(lk);
        nm.className = 'need';
        nm.textContent = s.need.stars ? s.need.stars + ' ★' : 'الأفضل ' + s.need.best;
      }
      b.addEventListener('click', function () {
        b.blur();
        if (!skinUnlocked(i)) { Snd.bad(); toast(s.need.stars ? 'اجمع ' + s.need.stars + ' نجمة في المغامرة لفتحه' : 'سجّل ' + s.need.best + ' نقطة في الكلاسيكي لفتحه'); return; }
        save.skin = i; store.set('skin', i);
        if (save.seen.indexOf(i) < 0) { save.seen.push(i); store.set('seenSkins', save.seen); }
        Snd.pick(); buildTitle();
      });
      box.appendChild(b);
    });
  }
  var skinPrevCache = {};
  function skinPreview(i) {
    if (skinPrevCache[i]) return skinPrevCache[i];
    var cv = document.createElement('canvas'); cv.width = cv.height = 116;
    var g = cv.getContext('2d');
    g.drawImage(Art.block(i, 1, 0), 0, 0, 58, 58); g.drawImage(Art.block(i, 4, 0), 58, 0, 58, 58);
    g.drawImage(Art.block(i, 6, 0), 0, 58, 58, 58); g.drawImage(Art.block(i, 3, 0), 58, 58, 58, 58);
    return (skinPrevCache[i] = cv.toDataURL());
  }

  function buildMap() {
    var box = $('worlds'); box.innerHTML = '';
    $('mapStars').textContent = totalStars();
    var nxt = nextLevelIdx();
    LV.WORLDS.forEach(function (w, wi) {
      var d = document.createElement('div'); d.className = 'world';
      d.style.background = 'linear-gradient(180deg, ' + w.color + ', ' + w.dark + ')';
      var ws = 0; for (var q = wi * 5; q < wi * 5 + 5; q++) ws += save.adv[q] | 0;
      d.innerHTML = '<h3>' + w.name + '</h3><div class="wstars"><i class="st"></i> ' + ws + ' / 15</div>';
      var gemEl = document.createElement('div'); gemEl.className = 'wgem'; gemEl.style.backgroundImage = 'url(' + gemIcon([1, 2, 4, 3][wi % 4]) + ')'; d.appendChild(gemEl);
      if (!levelUnlocked(wi * 5)) d.classList.add('locked');
      var row = document.createElement('div'); row.className = 'levels';
      for (var i = wi * 5; i < wi * 5 + 5; i++) (function (idx) {
        var lv = LV.LEVELS[idx], open = levelUnlocked(idx);
        var b = document.createElement('button'); b.type = 'button';
        b.className = 'lvl' + (open ? '' : ' locked') + (open && idx === nxt && !save.adv[idx] ? ' next' : '');
        var kind = lv.gems ? 'جواهر' : 'نقاط';
        if (lv.moves) kind += ' ⏱';
        var st = '';
        for (var s = 0; s < 3; s++) st += '<i' + (s < save.adv[idx] ? ' class="on"' : '') + '></i>';
        b.innerHTML = '<span class="ln">' + (idx + 1) + '</span><span class="lk">' + kind + '</span><span class="ls">' + st + '</span>';
        b.addEventListener('click', function () {
          b.blur();
          if (!open) { Snd.bad(); toast('أكمل المرحلة السابقة أولًا'); return; }
          startLevel(idx);
        });
        row.appendChild(b);
      })(i);
      d.appendChild(row);
      box.appendChild(d);
    });
  }

  /* ------------------------------------------------------------ buttons */
  function onClick(id, fn) { $(id).addEventListener('click', function (e) { e.currentTarget.blur(); Kit.audio.unlock(); fn(); }); }
  onClick('btnClassic', function () { startClassic(false); });
  onClick('btnNew', function () { store.remove('run'); startClassic(true); });
  onClick('btnAdv', openMap);
  onClick('btnMapBack', function () { Snd.back(); openTitle(); });
  onClick('btnPause', function () { if (state === 'play') pause(); });
  onClick('btnResume', resume);
  onClick('btnRestart', restart);
  onClick('btnMusic', toggleMusic);
  onClick('btnPauseMenu', function () { Snd.back(); if (runLevel >= 0) openMap(); else openTitle(); });
  onClick('btnAgain', restart);
  onClick('btnOverMenu', function () { Snd.back(); openTitle(); });
  onClick('btnNext', nextLevel);
  onClick('btnReplay', function () { startLevel(runLevel); });
  onClick('btnWinMap', function () { Snd.back(); openMap(); });
  onClick('btnRetry', function () { startLevel(runLevel); });
  onClick('btnFailMap', function () { Snd.back(); openMap(); });

  /* ------------------------------------------------------------- update */
  function update(dt) {
    time += dt;
    shake.update(dt);
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').hidden = true; }
    var i;
    for (i = 0; i < 64; i++) placeT[i] += dt;
    for (i = 0; i < 3; i++) {
      var s = slots[i];
      if (s.appear < 1) s.appear = Math.min(1, s.appear + dt / 0.35);
      if (s.ret) { s.ret.t += dt / 0.2; if (s.ret.t >= 1) s.ret = null; }
      var hov = state === 'play' && !drag && run && run.tray[i] && Math.abs(lastPtr.x - TX[i]) < 108 && Math.abs(lastPtr.y - TY) < 80;
      s.hover += ((hov ? 1 : 0) - s.hover) * Math.min(1, dt * 14);
    }
    if (drag) {
      var target = drag.bomb ? 1 : 1;
      drag.scale += (target - drag.scale) * Math.min(1, dt * 18);
      drag.x += (drag.tx - drag.x) * Math.min(1, dt * 28);
      drag.y += (drag.ty - drag.y) * Math.min(1, dt * 28);
      if (drag.bomb && Math.random() < dt * 30) spark(drag.x + 22, drag.y - 30, '#ffd21f', 1, 80, { kind: 2, life: 0.3, size: 6, g: -100 });
    }
    for (i = dying.length - 1; i >= 0; i--) {
      var d = dying[i], was = d.t;
      d.t += dt;
      if (was < 0 && d.t >= 0) burstCell(d);
      if (d.t > 0.05) dying.splice(i, 1);
    }
    for (i = shards.length - 1; i >= 0; i--) {
      var sh = shards[i];
      sh.life += dt;
      if (sh.life >= sh.max) { shards.splice(i, 1); continue; }
      sh.vy += 1500 * dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.rot += sh.vr * dt;
    }
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (i = popups.length - 1; i >= 0; i--) { popups[i].t += dt; if (popups[i].t > 1.0) popups.splice(i, 1); }
    for (i = beams.length - 1; i >= 0; i--) { beams[i].t += dt; if (beams[i].t > 0.5) beams.splice(i, 1); }
    for (i = flyGems.length - 1; i >= 0; i--) {
      var fg = flyGems[i];
      fg.t += dt;
      if (fg.t >= fg.dur) { goalBump[fg.kind] = 1; Snd.gem(i); spark(fg.x1, fg.y1, Art.GEM_COLS[fg.kind], 8, 200, { kind: 2, life: 0.4, g: 0 }); flyGems.splice(i, 1); }
    }
    for (var gk in goalBump) goalBump[gk] = Math.max(0, goalBump[gk] - dt * 3);
    for (i = confetti.length - 1; i >= 0; i--) {
      var cf = confetti[i];
      cf.life += dt;
      if (cf.life > cf.max || cf.y > H + 40) { confetti.splice(i, 1); continue; }
      cf.vy += 500 * dt; cf.vy = Math.min(cf.vy, 260); cf.vx *= 0.99;
      cf.x += (cf.vx + Math.sin(time * 4 + cf.ph) * 50) * dt; cf.y += cf.vy * dt; cf.rot += cf.vr * dt;
    }
    if (bigWord) { bigWord.t += dt; if (bigWord.t > 1.3) bigWord = null; }
    if (banner) { banner.t += dt; if (banner.t > 2.4) banner = null; }
    if (powerPulse > 0) powerPulse -= dt;
    comboBump = Math.max(0, comboBump - dt * 3);
    if (run) {
      var diff = run.score - dispScore;
      if (diff > 0) { dispScore += Math.max(1, diff * Math.min(1, dt * 9)); if (dispScore > run.score) dispScore = run.score; scoreBump = 1; }
      else dispScore = run.score;
      scoreBump = Math.max(0, scoreBump - dt * 4);
    }
    if (state === 'play') hintIdle += dt;
    if (state === 'ending') {
      if (greyList.length && greyN < greyList.length) {
        greyAcc += dt;
        while (greyAcc > 0.022 && greyN < greyList.length) { greyAcc -= 0.022; greyN++; if (greyN % 3 === 0) Snd.greyTick(greyN % 12); }
        if (greyN >= greyList.length) endTimer = 0.8;
      } else {
        endTimer -= dt;
        if (endTimer <= 0 && !dying.length && !flyGems.length) {
          if (endKind === 'win') showWin();
          else if (endKind === 'over') showOver();
          else showFail(run.result === 'fail' && run.movesLimit && run.moves >= run.movesLimit ? 'moves' : 'space');
        }
      }
    }
  }
  function burstCell(d) {
    var y = d.i >> 3, x = d.i & 7, cx = cellX(x) + C / 2, cy = cellY(y) + C / 2;
    var hex = skin().pal[(d.color - 1) % 8] || '#fff';
    if (shards.length < 90) shards.push({ x: cx, y: cy, vx: (Math.random() - 0.5) * 420, vy: -250 - Math.random() * 350, rot: 0, vr: (Math.random() - 0.5) * 14, life: 0, max: 0.75, spr: blk(d.color, d.gem) });
    spark(cx, cy, hex, 5, 380, { life: 0.55, size: 9 });
    spark(cx, cy, '#ffffff', 2, 260, { kind: 2, life: 0.4, size: 9, g: 200 });
  }

  /* -------------------------------------------------------------- render */
  var goalPos = {};
  var floaters = [];
  for (var fi = 0; fi < 14; fi++) floaters.push({ x: Math.random() * W, y: Math.random() * H, s: 30 + Math.random() * 50, v: 14 + Math.random() * 26, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.6, c: 1 + (fi % 8) });

  function render() {
    var k = artK();
    ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, 0, 0);
    ctx.drawImage(Art.background(save.skin, W, H, k), 0, 0, W, H);
    if (!run || state === 'title' || state === 'map') { drawFloaters(); renderFx(); return; }
    ctx.save();
    ctx.translate(shake.x, shake.y);
    ctx.drawImage(Art.boardImage(save.skin, C, k), BX - 24, BY - 20, (C * 8 + 48), (C * 8 + 48));
    drawCells();
    drawGhost();
    drawBeams();
    drawShards();
    drawParts();
    ctx.restore();
    drawTray();
    drawLeftPanel();
    drawRightPanel();
    drawFlyGems();
    drawDragged();
    drawPopups();
    drawBigWord();
    drawBanner();
    drawHint();
    renderFx();
  }
  function drawFloaters() {
    var dt = 1 / 60;
    for (var i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      f.y -= f.v * dt; f.r += f.vr * dt;
      if (f.y < -80) { f.y = H + 80; f.x = Math.random() * W; }
      ctx.save(); ctx.globalAlpha = 0.35; ctx.translate(f.x, f.y); ctx.rotate(f.r);
      ctx.drawImage(blk(f.c, 0), -f.s / 2, -f.s / 2, f.s, f.s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  function drawCells() {
    var pcol = drag && !drag.bomb && drag.valid && drag.pv ? run.tray[drag.slot].color : 0;
    var pulse = 0.5 + 0.5 * Math.sin(time * 12);
    var greyUpTo = {};
    for (var g = 0; g < greyN && g < greyList.length; g++) greyUpTo[greyList[g]] = 1;
    for (var i = 0; i < 64; i++) {
      if (!run.cells[i]) continue;
      var t = placeT[i];
      if (t < 0) continue;
      var x = cellX(i & 7), y = cellY(i >> 3), s = 1;
      if (popMode[i]) s = t < 0.3 ? easeOutBack(t / 0.3) : 1;
      else if (t < 0.25) { var e = t / 0.25; s = 1 + 0.2 * Math.sin(e * Math.PI) * (1 - e * 0.5); }
      var col = greyUpTo[i] ? 'grey' : (hl[i] && pcol ? pcol : run.cells[i]);
      var sz = C * s;
      ctx.drawImage(blk(col, run.gems[i]), x + (C - sz) / 2, y + (C - sz) / 2, sz, sz);
      if (hl[i] && pcol) {
        ctx.globalAlpha = 0.18 + 0.2 * pulse; ctx.fillStyle = '#fff';
        Art.rr(ctx, x + 4, y + 4, C - 8, C - 8, 10); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    // cells about to burst: flash white
    for (var q = 0; q < dying.length; q++) {
      var d = dying[q];
      var dx = cellX(d.i & 7), dy = cellY(d.i >> 3);
      var k2 = clamp(1 + d.t / 0.12, 0, 1);
      ctx.drawImage(blk(d.color, d.gem), dx, dy, C, C);
      ctx.globalAlpha = 0.25 + 0.6 * k2; ctx.fillStyle = '#fff';
      Art.rr(ctx, dx + 3, dy + 3, C - 6, C - 6, 12); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  function drawGhost() {
    if (!drag) return;
    if (drag.bomb) {
      if (drag.r < 0) return;
      var pulse = 0.5 + 0.5 * Math.sin(time * 14);
      ctx.fillStyle = 'rgba(255,70,40,' + (0.25 + 0.2 * pulse) + ')';
      Art.rr(ctx, cellX(drag.c) + 2, cellY(drag.r) + 2, C * 3 - 4, C * 3 - 4, 16); ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,230,120,' + (0.6 + 0.4 * pulse) + ')'; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -time * 40; ctx.stroke(); ctx.setLineDash([]);
      return;
    }
    if (drag.r < 0) return;
    var p = run.tray[drag.slot], s = p.shape;
    ctx.globalAlpha = drag.valid ? (drag.pv ? 0.8 : 0.45) : 0.5;
    for (var k = 0; k < s.cells.length; k++) {
      var x = cellX(drag.c + s.cells[k][1]), y = cellY(drag.r + s.cells[k][0]);
      ctx.drawImage(blk(drag.valid ? p.color : 'red', drag.valid && k === p.gemCell ? p.gemKind : 0), x, y, C, C);
    }
    ctx.globalAlpha = 1;
  }
  function drawBeams() {
    for (var i = 0; i < beams.length; i++) {
      var b = beams[i], t = b.t / 0.5, a = 1 - t;
      if (b.boom) {
        ctx.globalAlpha = a; ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 16 * a + 2;
        ctx.beginPath(); ctx.arc(b.x, b.y, 30 + 260 * easeOutCubic(t), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1; continue;
      }
      var grow = 1 + 0.6 * easeOutCubic(t);
      ctx.globalAlpha = a * 0.85; ctx.fillStyle = '#ffffff';
      if (b.row != null) { var h = C * grow; Art.rr(ctx, BX - 20 * t, cellY(b.row) + C / 2 - h / 2, C * 8 + 40 * t, h, h / 2); ctx.fill(); }
      else { var w = C * grow; Art.rr(ctx, cellX(b.col) + C / 2 - w / 2, BY - 20 * t, w, C * 8 + 40 * t, w / 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }
  function drawShards() {
    for (var i = 0; i < shards.length; i++) {
      var s = shards[i], k = 1 - s.life / s.max, sz = C * (0.3 + 0.7 * k);
      ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.6); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
      ctx.drawImage(s.spr, -sz / 2, -sz / 2, sz, sz); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  function drawParts() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], a = 1 - p.life / p.max;
      ctx.globalAlpha = a; ctx.fillStyle = p.color;
      if (p.kind === 1) { ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      else if (p.kind === 2) { var z = p.size * (0.5 + a * 0.5); ctx.fillRect(p.x - z, p.y - z * 0.18, z * 2, z * 0.36); ctx.fillRect(p.x - z * 0.18, p.y - z, z * 0.36, z * 2); }
      else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
  }
  function drawPiece(piece, x, y, cell, alpha, color) {
    var s = piece.shape;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    for (var k = 0; k < s.cells.length; k++) {
      ctx.drawImage(blk(color || piece.color, k === piece.gemCell ? piece.gemKind : 0), x + s.cells[k][1] * cell, y + s.cells[k][0] * cell, cell, cell);
    }
    ctx.globalAlpha = 1;
  }
  function drawTray() {
    // tray shelf
    Art.rr(ctx, 318, 552, 644, 156, 30); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();
    Art.rr(ctx, 318, 548, 644, 156, 30); ctx.fillStyle = 'rgba(27,15,58,0.55)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.stroke();
    for (var i = 0; i < 3; i++) {
      var p = run.tray[i], sl = slots[i];
      if (!p || (drag && !drag.bomb && drag.slot === i)) continue;
      if (sl.appear <= 0) continue;
      var e = easeOutBack(clamp(sl.appear, 0, 1));
      var sc = TC * (1 + 0.1 * sl.hover);
      var tl = trayTL(i, sc), x = tl.x + (1 - e) * 280, y = tl.y - Math.sin(time * 2.2 + i * 1.3) * 2.5 * sl.hover;
      var alpha = clamp(sl.appear * 2, 0, 1);
      if (sl.ret) {
        var r = easeOutCubic(sl.ret.t), cs = sl.ret.scale * C + (sc - sl.ret.scale * C) * r;
        x = sl.ret.x + (tl.x - sl.ret.x) * r; y = sl.ret.y + (tl.y - sl.ret.y) * r;
        drawPiece(p, x, y, cs, 1, sl.fits ? null : 'grey');
        continue;
      }
      drawPiece(p, x, y, sc, sl.fits ? alpha : alpha * 0.6, sl.fits ? null : 'grey');
    }
  }
  function drawDragged() {
    if (!drag) return;
    if (drag.bomb) { drawBombIcon(drag.x, drag.y - 20, 40, false, 1.1 + 0.05 * Math.sin(time * 20)); return; }
    var p = run.tray[drag.slot], cs = C * drag.scale;
    // drop shadow
    ctx.globalAlpha = 0.28;
    var s = p.shape;
    ctx.fillStyle = '#000';
    for (var k = 0; k < s.cells.length; k++) { Art.rr(ctx, drag.x + s.cells[k][1] * cs + 8, drag.y + s.cells[k][0] * cs + 12, cs - 4, cs - 4, 10); ctx.fill(); }
    ctx.globalAlpha = 1;
    drawPiece(p, drag.x, drag.y, cs, 1);
  }
  function drawPopups() {
    for (var i = 0; i < popups.length; i++) {
      var p = popups[i], t = p.t, s = t < 0.15 ? easeOutBack(t / 0.15) : 1;
      ctx.globalAlpha = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      txt(p.text, p.x, p.y - t * 50, p.size * s, p.color, 'center', { stroke: '#1b0f3a', sw: p.size * 0.22, ltr: true });
      ctx.globalAlpha = 1;
    }
  }
  function drawBigWord() {
    if (!bigWord) return;
    var b = bigWord, t = b.t, s = t < 0.25 ? easeOutBack(t / 0.25) : 1 + (t - 0.25) * 0.06;
    var a = t > 1.0 ? 1 - (t - 1.0) / 0.3 : 1;
    var x = BX + C * 4, y = BY + C * 4 - 20 - (t > 1 ? (t - 1) * 60 : 0);
    ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(-0.05);
    ctx.font = '700 ' + b.size + 'px Fredoka'; ctx.direction = 'rtl';
    var wmax = ctx.measureText(b.text).width, fit = wmax > 620 ? 620 / wmax : 1;
    if (fit < 1) ctx.scale(fit, fit);
    txt(b.text, 0, 6, b.size, 'rgba(0,0,0,0.35)', 'center', { stroke: 'rgba(0,0,0,0.35)', sw: b.size * 0.3 });
    txt(b.text, 0, 0, b.size, b.color, 'center', { stroke: '#1b0f3a', sw: b.size * 0.26 });
    if (b.sub) txt(b.sub, 0, b.size * 0.78, b.size * 0.46, '#ffffff', 'center', { stroke: '#1b0f3a', sw: b.size * 0.14 });
    ctx.restore();
  }
  function drawBanner() {
    if (!banner) return;
    var t = banner.t, a = t < 0.3 ? t / 0.3 : t > 2.0 ? 1 - (t - 2.0) / 0.4 : 1;
    var s = t < 0.35 ? easeOutBack(t / 0.35) : 1;
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(BX + C * 4, BY + C * 4 - 30); ctx.scale(s, s);
    ctx.font = '700 30px Fredoka'; ctx.direction = 'rtl';
    var w = Math.max(360, ctx.measureText(banner.sub).width + 70);
    Art.rr(ctx, -w / 2, -80, w, 150, 30); ctx.fillStyle = 'rgba(27,15,58,0.9)'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = banner.world ? banner.world.color : '#ffd21f'; ctx.stroke();
    txt(banner.title, 0, -26, 58, banner.world ? banner.world.color : '#ffd21f', 'center', { stroke: '#1b0f3a', sw: 12 });
    txt(banner.sub, 0, 36, 30, '#ffffff', 'center');
    ctx.restore();
  }
  function drawHint() {
    if (state !== 'play' || drag || !run || run.moves > 0 || hintIdle < 1.2 || banner) return;
    if (run.mode !== 'classic' && runLevel > 1) return;
    var i = 0;
    while (i < 3 && (!run.tray[i] || !slots[i].fits)) i++;
    if (i >= 3) return;
    var t = (time * 0.7) % 1, e = easeOutCubic(Math.min(1, t * 1.4));
    var x0 = TX[i], y0 = TY, x1 = BX + C * 4, y1 = BY + C * 4;
    var hx = x0 + (x1 - x0) * e, hy = y0 + (y1 - y0) * e;
    ctx.globalAlpha = t > 0.8 ? (1 - t) / 0.2 : 1;
    drawHand(hx, hy);
    ctx.globalAlpha = 1;
    txt('اسحب قطعة إلى اللوحة!', BX + C * 4, 530, 30, '#ffffff', 'center', { stroke: '#1b0f3a', sw: 8 });
  }
  function drawHand(x, y) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.3);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b0f3a'; ctx.lineWidth = 4;
    Art.rr(ctx, -6, -4, 14, 34, 7); ctx.fill(); ctx.stroke();
    Art.rr(ctx, -14, 18, 40, 34, 14); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawBombIcon(x, y, r, dis, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s || 1, s || 1);
    var body = dis ? '#6b6784' : '#2b2440';
    ctx.strokeStyle = dis ? '#9c98b3' : '#c98a3a'; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r * 0.35, -r * 0.55); ctx.quadraticCurveTo(r * 0.7, -r * 1.05, r * 0.95, -r * 0.8); ctx.stroke();
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = r * 0.08; ctx.strokeStyle = '#1b0f3a'; ctx.stroke();
    ctx.fillStyle = dis ? '#8e8aa8' : '#4a4266'; Art.rr(ctx, r * 0.12, -r * 0.78, r * 0.4, r * 0.3, r * 0.08); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-r * 0.25, -r * 0.25, r * 0.2, r * 0.12, -0.7, 0, Math.PI * 2); ctx.fill();
    if (!dis) {
      var f = 0.7 + 0.3 * Math.sin(time * 30);
      ctx.fillStyle = '#ffd21f'; Art.star(ctx, r * 0.98, -r * 0.84, r * 0.3 * f, r * 0.1);
      ctx.fillStyle = '#fff'; Art.star(ctx, r * 0.98, -r * 0.84, r * 0.14 * f, r * 0.05);
    }
    ctx.restore();
  }
  function drawShuffleIcon(x, y, r, dis) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = dis ? '#9c98b3' : '#ffffff'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = r * 0.2; ctx.lineCap = 'round';
    for (var k = 0; k < 2; k++) {
      ctx.save(); ctx.rotate(k * Math.PI + (dis ? 0 : Math.sin(time * 2) * 0.1));
      ctx.beginPath(); ctx.arc(0, 0, r * 0.52, Math.PI * 1.1, Math.PI * 1.85); ctx.stroke();
      var ax = Math.cos(Math.PI * 1.85) * r * 0.52, ay = Math.sin(Math.PI * 1.85) * r * 0.52;
      ctx.beginPath(); ctx.moveTo(ax + r * 0.28, ay - r * 0.02); ctx.lineTo(ax - r * 0.12, ay - r * 0.26); ctx.lineTo(ax - r * 0.04, ay + r * 0.22); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  function powerBtn(b, n, kind, label) {
    var dis = n <= 0, pulse = powerPulse > 0 && !dis ? 1 + 0.08 * Math.sin(time * 14) : 1;
    var hov = !drag && state === 'play' && inBtn(lastPtr, b) && !dis ? 1.06 : 1;
    ctx.save(); ctx.translate(b.x, b.y); ctx.scale(pulse * hov, pulse * hov);
    ctx.beginPath(); ctx.arc(0, 5, b.r, 0, Math.PI * 2); ctx.fillStyle = '#1b0f3a'; ctx.fill();
    var g = ctx.createLinearGradient(0, -b.r, 0, b.r);
    if (dis) { g.addColorStop(0, '#8f8aad'); g.addColorStop(1, '#5d587a'); }
    else if (kind === 'bomb') { g.addColorStop(0, '#ff8a4f'); g.addColorStop(1, '#e0352a'); }
    else { g.addColorStop(0, '#5fe0ff'); g.addColorStop(1, '#2d7bff'); }
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#1b0f3a'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(0, -b.r * 0.5, b.r * 0.6, b.r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (kind === 'bomb') drawBombIcon(b.x - 3, b.y + 4, b.r * 0.72, dis, pulse * hov);
    else drawShuffleIcon(b.x, b.y, b.r * 0.9, dis);
    // count badge
    ctx.beginPath(); ctx.arc(b.x + b.r * 0.72, b.y - b.r * 0.72, 17, 0, Math.PI * 2);
    ctx.fillStyle = dis ? '#5d587a' : '#ffd21f'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = '#1b0f3a'; ctx.stroke();
    txt(String(n), b.x + b.r * 0.72, b.y - b.r * 0.72 + 1, 22, '#1b0f3a', 'center', { ltr: true });
    txt(label, b.x, b.y + b.r + 20, 21, dis ? '#9c98b3' : '#ffffff', 'center');
  }
  function drawLeftPanel() {
    // power-ups card
    card(LPX, 516, LPW, 192);
    txt('قوى خارقة', LPX + LPW / 2, 540, 21, '#ffd21f', 'center');
    powerBtn(BOMB_BTN, run.bombs, 'bomb', 'قنبلة');
    powerBtn(SHUF_BTN, run.shuffles, 'shuffle', 'خلط');
    if (run.level) { drawGoals(); return; }
    // classic: gift progress + stats
    card(LPX, 96, LPW, 150);
    txt('🎁 الهدية التالية', LPX + LPW / 2, 126, 24, '#ffffff', 'center');
    var prev = run.nextGift - Rules.GIFT_EVERY, k = clamp((run.score - prev) / Rules.GIFT_EVERY, 0, 1);
    var bx = LPX + 24, bw = LPW - 48;
    Art.rr(ctx, bx, 152, bw, 26, 13); ctx.fillStyle = '#120a33'; ctx.fill();
    if (k > 0.02) { Art.rr(ctx, bx + bw * (1 - k), 152, bw * k, 26, 13); ctx.fillStyle = '#ff8a4f'; ctx.fill(); }
    ctx.lineWidth = 3; ctx.strokeStyle = '#1b0f3a'; Art.rr(ctx, bx, 152, bw, 26, 13); ctx.stroke();
    txt('بعد ' + Math.max(0, run.nextGift - run.score) + ' نقطة', LPX + LPW / 2, 208, 22, '#cfc8ff', 'center');
    card(LPX, 266, LPW, 110);
    txt('الصفوف المفجّرة', LPX + LPW / 2, 296, 22, '#cfc8ff', 'center');
    txt(String(run.linesTotal), LPX + LPW / 2, 342, 44, '#ffffff', 'center', { ltr: true, stroke: '#1b0f3a', sw: 8 });
  }
  function drawGoals() {
    var lv = run.level, y = 96;
    var rowsH = 70 + (lv.gems ? 88 : 0) + (lv.score ? 80 : 0) + (lv.moves ? 64 : 0);
    card(LPX, y, LPW, rowsH);
    txt('الهدف', LPX + LPW / 2, y + 30, 28, '#ffd21f', 'center', { stroke: '#1b0f3a', sw: 6 });
    var cy = y + 64;
    if (lv.gems) {
      var kinds = Object.keys(lv.gems), n = kinds.length, sp = Math.min(72, (LPW - 30) / n);
      var x0 = LPX + LPW / 2 + (n - 1) * sp / 2;
      for (var i = 0; i < n; i++) {
        var kd = +kinds[i], gx = x0 - i * sp, gy = cy + 26;
        goalPos[kd] = { x: gx, y: gy };
        var left = run.goalGems[kd], flying = 0;
        for (var f = 0; f < flyGems.length; f++) if (flyGems[f].kind === kd) flying++;
        left += flying;
        var bump = 1 + 0.3 * (goalBump[kd] || 0);
        var sz = 50 * bump;
        ctx.drawImage(Art.gemSprite(kd), gx - sz / 2, gy - sz / 2 - 6, sz, sz);
        if (left <= 0) {
          ctx.beginPath(); ctx.arc(gx + 18, gy + 20, 13, 0, Math.PI * 2); ctx.fillStyle = '#3ddc5a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#1b0f3a'; ctx.stroke();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(gx + 11, gy + 20); ctx.lineTo(gx + 16, gy + 26); ctx.lineTo(gx + 25, gy + 14); ctx.stroke();
        } else txt(String(left), gx, gy + 34, 26, '#ffffff', 'center', { ltr: true, stroke: '#1b0f3a', sw: 7 });
      }
      cy += 88;
    }
    if (lv.score) {
      var k = clamp(run.score / lv.score, 0, 1), bx = LPX + 24, bw = LPW - 48;
      txt('النقاط: ' + Math.floor(dispScore) + ' / ' + lv.score, LPX + LPW / 2, cy + 8, 22, '#ffffff', 'center');
      Art.rr(ctx, bx, cy + 28, bw, 24, 12); ctx.fillStyle = '#120a33'; ctx.fill();
      if (k > 0.02) { Art.rr(ctx, bx + bw * (1 - k), cy + 28, bw * k, 24, 12); ctx.fillStyle = k >= 1 ? '#3ddc5a' : '#ffd21f'; ctx.fill(); }
      ctx.lineWidth = 3; ctx.strokeStyle = '#1b0f3a'; Art.rr(ctx, bx, cy + 28, bw, 24, 12); ctx.stroke();
      cy += 80;
    }
    if (lv.moves) {
      var leftM = Math.max(0, lv.moves - run.moves), warn = leftM <= 5;
      var s = warn ? 1 + 0.06 * Math.sin(time * 10) : 1;
      ctx.save(); ctx.translate(LPX + LPW / 2, cy + 18); ctx.scale(s, s);
      txt('القطع المتبقية: ' + leftM, 0, 0, 26, warn ? '#ff7a7a' : '#ffffff', 'center', { stroke: '#1b0f3a', sw: 6 });
      ctx.restore();
    }
  }
  function drawRightPanel() {
    var cx = RPX + RPW / 2;
    if (run.level) {
      var w = LV.WORLDS[run.level.world];
      card(RPX, 96, RPW, 96);
      txt('المرحلة ' + (runLevel + 1), cx, 128, 36, w.color, 'center', { stroke: '#1b0f3a', sw: 8 });
      txt(w.name, cx, 168, 20, '#cfc8ff', 'center');
      card(RPX, 210, RPW, 150);
      txt('النقاط', cx, 238, 22, '#cfc8ff', 'center');
      var sb = 1 + 0.12 * scoreBump;
      ctx.save(); ctx.translate(cx, 290); ctx.scale(sb, sb);
      txt(Kit.fmt(dispScore), 0, 0, 60, '#ffffff', 'center', { ltr: true, stroke: '#1b0f3a', sw: 10 });
      ctx.restore();
      // star meter
      card(RPX, 378, RPW, 140);
      var st = run.moves <= run.level.stars[0] ? 3 : run.moves <= run.level.stars[1] ? 2 : 1;
      for (var i = 0; i < 3; i++) {
        var sx = cx + (i - 1) * 62, on = i < st;
        drawStar(sx, 422 - (i === 1 ? 6 : 0), 26, on);
      }
      var nextT = st === 3 ? run.level.stars[0] : st === 2 ? run.level.stars[1] : 0;
      txt('القطع المستخدمة: ' + run.moves, cx, 470, 21, '#ffffff', 'center');
      if (nextT) txt('لتبقى ' + st + ' نجوم: حتى ' + nextT, cx, 498, 18, '#ffe38a', 'center');
      else txt('أكمل الهدف لتفوز!', cx, 498, 18, '#ffe38a', 'center');
      return;
    }
    card(RPX, 96, RPW, 186);
    txt('النقاط', cx, 126, 24, '#cfc8ff', 'center');
    var sb2 = 1 + 0.12 * scoreBump;
    ctx.save(); ctx.translate(cx, 184); ctx.scale(sb2, sb2);
    txt(Kit.fmt(dispScore), 0, 0, 72, '#ffffff', 'center', { ltr: true, stroke: '#1b0f3a', sw: 12 });
    ctx.restore();
    var bestStr = 'الأفضل: ' + Kit.fmt(save.best);
    ctx.font = '700 22px Fredoka'; ctx.direction = 'rtl';
    var bw2 = ctx.measureText(bestStr).width; ctx.direction = 'ltr';
    txt(bestStr, cx - 16, 250, 22, '#ffd21f', 'center');
    drawCrown(cx - 16 + bw2 / 2 + 22, 248, 0.9);
    // combo card
    card(RPX, 300, RPW, 124, run.streak >= 2 ? 'rgba(90,20,110,0.85)' : null);
    var cb = 1 + 0.25 * comboBump;
    ctx.save(); ctx.translate(cx, 340); ctx.scale(cb, cb);
    if (run.streak >= 1) txt('كومبو ' + run.streak, 0, 0, 38, run.streak >= 2 ? '#ff8fd8' : '#ffffff', 'center', { stroke: '#1b0f3a', sw: 8 });
    else txt('كومبو', 0, 0, 34, 'rgba(255,255,255,0.45)', 'center');
    ctx.restore();
    var grace = Rules.STREAK_GRACE, left = run.streak ? grace - run.miss : 0;
    for (var g = 0; g < grace; g++) {
      var px = cx + (g - (grace - 1) / 2) * 34;
      ctx.beginPath(); ctx.arc(px, 392, 11, 0, Math.PI * 2);
      ctx.fillStyle = g < left ? '#ff5fc8' : '#120a33'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#1b0f3a'; ctx.stroke();
    }
  }
  function drawStar(x, y, r, on) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = '#1b0f3a'; ctx.stroke();
    ctx.fillStyle = on ? '#ffc21f' : '#4a3d8a'; ctx.fill();
  }
  function drawCrown(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(-16, 10); ctx.lineTo(-18, -10); ctx.lineTo(-8, 0); ctx.lineTo(0, -14); ctx.lineTo(8, 0); ctx.lineTo(18, -10); ctx.lineTo(16, 10); ctx.closePath();
    ctx.fillStyle = '#ffd21f'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#1b0f3a'; ctx.stroke();
    ctx.restore();
  }
  function drawFlyGems() {
    for (var i = 0; i < flyGems.length; i++) {
      var g = flyGems[i];
      if (g.t < 0) continue;
      var k = easeOutCubic(g.t / g.dur), x = g.x0 + (g.x1 - g.x0) * k, y = g.y0 + (g.y1 - g.y0) * k - Math.sin(k * Math.PI) * 120;
      var s = 44 + Math.sin(k * Math.PI) * 26;
      ctx.drawImage(Art.gemSprite(g.kind), x - s / 2, y - s / 2, s, s);
    }
  }
  function renderFx() {
    fctx.setTransform(fxView.scale * fxView.dpr, 0, 0, fxView.scale * fxView.dpr, 0, 0);
    fctx.clearRect(0, 0, W, H);
    for (var i = 0; i < confetti.length; i++) {
      var c = confetti[i];
      fctx.save(); fctx.translate(c.x, c.y); fctx.rotate(c.rot); fctx.scale(1, Math.cos(time * 6 + c.ph));
      fctx.globalAlpha = c.life > c.max - 0.5 ? (c.max - c.life) / 0.5 : 1;
      fctx.fillStyle = c.color; fctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      fctx.restore();
    }
    fctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------- debug */
  function greedyMove() {
    if (!run || state !== 'play') return null;
    var mask = Core.maskFromBoard(run.cells), best = null, bv = -1;
    for (var s = 0; s < 3; s++) {
      var p = run.tray[s]; if (!p) continue;
      for (var r = 0; r <= N - p.shape.h; r++) for (var c = 0; c <= N - p.shape.w; c++) {
        if (!Core.fits(mask, p.shape, r, c)) continue;
        var l = Core.linesIfPlaced(mask, p.shape, r, c) * 10 + p.shape.n + Math.random();
        if (l > bv) { bv = l; best = [s, r, c]; }
      }
    }
    return best;
  }
  window.__game = {
    get state() { return state; },
    get run() { return run; },
    get level() { return runLevel; },
    save: save,
    classic: function (fresh) { startClassic(!!fresh); },
    startLevel: function (i) { startLevel(i); },
    place: function (s, r, c) { return doPlace(s, r, c); },
    auto: function (n) {
      var done = 0;
      for (var i = 0; i < (n || 1); i++) {
        if (state !== 'play') break;
        var m = greedyMove();
        if (!m) { if (run.bombs) doBomb(4, 4); else if (run.shuffles) doShuffle(); else break; continue; }
        doPlace(m[0], m[1], m[2]); done++;
      }
      return { done: done, state: state, score: run && run.score };
    },
    fill: function () { // make the board nearly full so the game ends soon
      for (var i = 0; i < 64; i++) if ((i * 7) % 5) { run.cells[i] = 1 + (i % 8); }
      run.bombs = 0; run.shuffles = 0; run.tray = [Core.BY_ID.sq30, Core.BY_ID.five0, Core.BY_ID.five1].map(function (s, i) { return { shape: s, color: i + 2, gemCell: -1, gemKind: 0 }; });
      refreshFits();
    },
    endNow: function () { if (state === 'play') { state = 'ending'; endKind = run.level ? 'fail' : 'over'; startGreying(); } },
    win: function () { if (state === 'play' && run.level) { run.result = 'win'; state = 'ending'; endKind = 'win'; endTimer = 0.1; } },
    stars: function (arr) { save.adv = arr; store.set('adv', arr); },
    map: openMap, title: openTitle
  };

  /* ------------------------------------------------------------- boot */
  buildTitle();
  show(['scrTitle']);
  if (document.fonts && document.fonts.load) { try { document.fonts.load('700 40px Fredoka', 'بلوك'); document.fonts.load('700 40px Fredoka', '0123'); } catch (e) { /* ignore */ } }
  Kit.loop(update, render);
})();
