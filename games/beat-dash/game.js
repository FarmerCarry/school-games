/*
 * Beat Dash — game flow, rendering, menus and saving.
 * The physics lives in engine.js (deterministic, 60 Hz ticks with 4 substeps).
 */
(function () {
  'use strict';

  var W = 1280, H = 720, U = 56, GROUND0 = 560, PLAYER_SX = 6.2;
  var TAU = Math.PI * 2;
  var BD = window.BD;

  var canvas = document.getElementById('game');
  var uiEl = document.getElementById('ui');
  var view = Kit.fit(canvas, W, H, { onResize: layoutUI });
  var ctx = view.ctx;
  var ptr = Kit.pointer(view);
  var store = Kit.store('beat-dash');
  var music = new BD.Music();
  var shake = Kit.shake();
  var muteBtn = Kit.muteButton();
  muteBtn.setAttribute('aria-label', 'تشغيل الصوت أو كتمه');

  function layoutUI(v) {
    var r = canvas.style;
    uiEl.style.left = r.left; uiEl.style.top = r.top;
    uiEl.style.transform = 'scale(' + v.scale + ')';
  }
  layoutUI(view);

  /* ------------------------------------------------------------ levels */
  var LEVELS = window.BD_LEVELS.map(function (def) {
    var L = BD.compile(def);
    L.song = BD.makeSong(def.song, def.bpm);
    L.theme = def.theme;
    return L;
  });
  var MENU_BPM = 128;
  var menuSong = BD.makeSong({ root: 60, scale: 'major', prog: [0, 5, 3, 4], seed: 7, style: 'walk', chill: true, intro: 2, lead: 'pulse25' }, MENU_BPM);
  var demoL = (function () {
    var pat = ['....|....|..^.|....|....|....|..^.|..^.|....|....|..##|##..|....|....|..^^|....|....|..Y.|....|....|....|....|..^.|....'];
    var chunks = [];
    for (var i = 0; i < 14; i++) chunks.push(pat);
    var L = BD.compile({ id: 'demo', name: 'demo', bpm: MENU_BPM, chunks: chunks });
    L.period = 96;
    return L;
  })();

  /* -------------------------------------------------------------- save */
  var save = {
    best: store.get('best', {}), bestP: store.get('bestP', {}),
    done: store.get('done', {}), doneP: store.get('doneP', {}),
    stars: store.get('stars', {}), att: store.get('att', {}),
    total: store.get('total', { attempts: 0, jumps: 0 }),
    face: store.get('face', 0), c1: store.get('c1', 0), c2: store.get('c2', 1),
    seen: store.get('seen', null), gseen: store.get('gseen', []), last: store.get('last', 0)
  };
  function persist(k) { store.set(k, save[k]); }
  function popcnt(n) { var c = 0; while (n) { c += n & 1; n >>>= 1; } return c; }
  function totalStars() { var t = 0; LEVELS.forEach(function (L) { t += popcnt(save.stars[L.id] || 0); }); return t; }
  function maxStars() { var t = 0; LEVELS.forEach(function (L) { t += L.stars; }); return t; }
  function levelUnlocked(i) { return i === 0 || !!save.done[LEVELS[i - 1].id] || !!save.doneP[LEVELS[i - 1].id]; }
  function beatenCount() { var n = 0; LEVELS.forEach(function (L) { if (save.done[L.id]) n++; }); return n; }
  function needMet(need) {
    if (!need) return true;
    if (need.lvl != null) return !!(LEVELS[need.lvl] && save.done[LEVELS[need.lvl].id]);
    if (need.stars != null) return totalStars() >= need.stars;
    if (need.attempts != null) return save.total.attempts >= need.attempts;
    if (need.jumps != null) return save.total.jumps >= need.jumps;
    return false;
  }
  // Arabic counted nouns: 1 نجمة واحدة, 2 نجمتان, 3-10 نجوم, 11+ نجمة
  function countAr(n, one, two, few, many) {
    if (n === 1) return one;
    if (n === 2) return two;
    return n + ' ' + (n >= 3 && n <= 10 ? few : many);
  }
  function needText(need) {
    if (need.lvl != null) return 'أكمل مرحلة «' + LEVELS[need.lvl].name + '» لتفتحه';
    if (need.stars != null) return 'اجمع ' + countAr(need.stars, 'نجمة واحدة', 'نجمتين', 'نجوم', 'نجمة') + ' لتفتحه (معك ' + totalStars() + ')';
    if (need.attempts != null) return 'العب ' + countAr(need.attempts, 'محاولة واحدة', 'محاولتين', 'محاولات', 'محاولة') + ' لتفتحه (لعبت ' + save.total.attempts + ')';
    if (need.jumps != null) return 'اقفز ' + countAr(need.jumps, 'قفزة واحدة', 'قفزتين', 'قفزات', 'قفزة') + ' لتفتحه (قفزت ' + save.total.jumps + ')';
    return '';
  }
  function allUnlockKeys() {
    var out = [];
    BD.FACES.forEach(function (f, i) { if (needMet(f.need)) out.push('f' + i); });
    BD.COLORS.forEach(function (c, i) { if (needMet(c.need)) out.push('c' + i); });
    return out;
  }
  if (!save.seen) { save.seen = allUnlockKeys(); persist('seen'); save.gseen = save.seen.slice(); persist('gseen'); }
  // returns newly unlocked items [{kind:'f'|'c', i}]
  function checkUnlocks() {
    var now = allUnlockKeys(), fresh = [];
    now.forEach(function (k) { if (save.seen.indexOf(k) < 0) { save.seen.push(k); fresh.push({ kind: k[0], i: +k.slice(1) }); } });
    if (fresh.length) persist('seen');
    return fresh;
  }
  function itemName(u) { return u.kind === 'l' ? 'فتحت مرحلة جديدة: ' + LEVELS[u.i].def.name + '!' : u.kind === 'f' ? 'وجه جديد: ' + BD.FACES[u.i].name + '!' : 'لون جديد: ' + BD.COLORS[u.i].name + '!'; }
  function myLook() {
    return { face: BD.FACES[save.face] ? BD.FACES[save.face].id : 'smile', c1: (BD.COLORS[save.c1] || BD.COLORS[0]).c, c2: (BD.COLORS[save.c2] || BD.COLORS[1]).c };
  }

  /* ----------------------------------------------------------- helpers */
  function $(id) { return document.getElementById(id); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hash(n) { n = Math.imul(n | 0, 374761393) + 668265263 | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function hexA(hex, a) {
    var h = hex.replace('#', '');
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ------------------------------------------------------------- sound */
  var A = Kit.audio;
  var sfx = {
    jump: function () { A.tone({ freq: 520, to: 780, type: 'square', dur: 0.05, vol: 0.05 }); },
    land: function (p) { A.tone({ freq: 140, to: 70, type: 'triangle', dur: 0.06, vol: 0.08 + 0.1 * p }); },
    pad: function () { A.tone({ freq: 300, to: 1100, type: 'square', dur: 0.16, vol: 0.12 }); A.tone({ freq: 600, to: 1600, type: 'sine', dur: 0.2, vol: 0.12 }); },
    orb: function () { A.tone({ freq: 880, type: 'sine', dur: 0.18, vol: 0.2 }); A.tone({ freq: 1320, type: 'sine', dur: 0.22, vol: 0.14, delay: 0.04 }); },
    portal: function () { A.noise({ dur: 0.35, vol: 0.18, filter: 4000, to: 300 }); A.tone({ freq: 200, to: 800, type: 'sine', dur: 0.3, vol: 0.12 }); },
    star: function () { [1047, 1319, 1568, 2093].forEach(function (f, i) { A.tone({ freq: f, type: 'square', dur: 0.1, vol: 0.1, delay: i * 0.05 }); }); },
    die: function () { A.noise({ dur: 0.45, vol: 0.45, filter: 2400, to: 120 }); A.tone({ freq: 300, to: 50, type: 'sawtooth', dur: 0.3, vol: 0.16 }); },
    bump: function () { A.tone({ freq: 180, to: 120, type: 'square', dur: 0.05, vol: 0.06 }); },
    best: function () { [784, 988, 1175, 1568].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.2, delay: 0.25 + i * 0.07 }); }); },
    win: function () { [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { A.tone({ freq: f, type: 'square', dur: 0.16, vol: 0.13, delay: i * 0.09 }); }); },
    click: function () { A.tone({ freq: 660, to: 990, type: 'square', dur: 0.06, vol: 0.1 }); },
    nope: function () { A.tone({ freq: 220, to: 160, type: 'square', dur: 0.12, vol: 0.1 }); },
    cp: function () { A.tone({ freq: 660, type: 'triangle', dur: 0.08, vol: 0.14 }); A.tone({ freq: 990, type: 'triangle', dur: 0.12, vol: 0.14, delay: 0.06 }); },
    firework: function () { A.noise({ dur: 0.5, vol: 0.14, filter: 3000, to: 200, delay: Math.random() * 0.1 }); }
  };

  /* --------------------------------------------------------- particles */
  var parts = [], PMAX = 700;
  // world: x,y in blocks (y up). screen: x,y in px.
  function spawn(p) {
    if (parts.length >= PMAX) parts[Math.floor(Math.random() * parts.length)] = p; else parts.push(p);
    return p;
  }
  function burst(x, y, n, o) {
    for (var i = 0; i < n; i++) {
      var a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || TAU) : Math.random() * TAU;
      var sp = (o.speed || 5) * (0.35 + Math.random() * 0.65);
      spawn({
        x: x + (o.jx ? (Math.random() - 0.5) * o.jx : 0), y: y + (o.jy ? (Math.random() - 0.5) * o.jy : 0),
        vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp + (o.vy || 0),
        life: (o.life || 0.6) * (0.6 + Math.random() * 0.4), max: o.life || 0.6,
        size: (o.size || 0.15) * (0.6 + Math.random() * 0.7),
        color: o.colors ? o.colors[Math.floor(Math.random() * o.colors.length)] : o.color,
        g: o.g == null ? -14 : o.g, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
        shape: o.shape || 0, screen: !!o.screen, drag: o.drag || 0
      });
    }
  }
  function ring(x, y, color, r0, r1, life, screen) {
    spawn({ x: x, y: y, vx: 0, vy: 0, life: life, max: life, size: r0, size1: r1, color: color, g: 0, rot: 0, vr: 0, shape: 3, screen: !!screen });
  }
  function updateParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.vy += p.g * dt;
      if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  }
  function drawParts(camX, gy, screenPass) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.screen !== screenPass) continue;
      var k = p.life / p.max;
      var x = screenPass ? p.x : (p.x - camX) * U, y = screenPass ? p.y : gy - p.y * U;
      var s = screenPass ? p.size : p.size * U;
      ctx.globalAlpha = Math.min(1, k * 1.4);
      if (p.shape === 3) {
        var r = lerp(p.size1, p.size, k) * (screenPass ? 1 : U);
        ctx.strokeStyle = p.color; ctx.lineWidth = 2 + 8 * k;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      } else if (p.shape === 1) {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, s * 0.5 * (0.4 + 0.6 * k), 0, TAU); ctx.fill();
      } else if (p.shape === 4) {
        ctx.fillStyle = p.color; ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); BD.starPath(ctx, 0, 0, s, s * 0.45, 5, 0); ctx.fill(); ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        if (s < 9) ctx.fillRect(x - s / 2, y - s / 2, s, s);
        else { ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore(); }
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------- state */
  var scene = 'title';
  var G = {
    li: 0, L: null, s: null, practice: false, cps: [], sessionAtt: 0,
    dead: false, deadT: 0, won: false, wonT: 0, paused: false,
    camY: 0, rot: 0, sqx: 1, sqy: 1, trail: [], blinkT: 2, blink: 0,
    flash: 0, flashCol: '#fff', popups: [], flashes: {}, winX: 0, winShown: false,
    lastCpTick: 0, jumpsAtStart: 0, runBestShown: false, fireT: 0, winUnlocks: [], newBestRun: false
  };
  var demo = { s: null, L: demoL, camY: 0, rot: 0, trail: [], t: 0 };
  var menuT = 0, sel = 0, themeNow = LEVELS[0].theme, themeFade = null;

  /* ============================================================ SCREENS */
  var screens = { title: $('scr-title'), select: $('scr-select'), garage: $('scr-garage'), pause: $('scr-pause'), win: $('scr-win') };
  function show(name) {
    for (var k in screens) screens[k].hidden = (k !== name);
    $('b-pause').hidden = !(scene === 'play' && name === null);
  }
  // Buttons never keep focus (so Space/Enter never "click" them by accident).
  document.addEventListener('mousedown', function (e) { if (e.target.closest && e.target.closest('button')) e.preventDefault(); });
  uiEl.addEventListener('pointerdown', function (e) { if (e.target.closest && e.target.closest('button, .card, .item, .dots i')) e.stopPropagation(); });
  function onClick(id, fn) {
    $(id).addEventListener('click', function (e) { e.preventDefault(); Kit.audio.unlock(); fn(e); });
  }
  $('b-pause').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  onClick('b-pause', function () { if (scene === 'play' && !G.won) pauseGame(); });

  function goTitle() {
    scene = 'title'; show('title');
    var st = totalStars();
    $('title-summary').innerHTML = BD.starSVG(true).replace('<svg', '<svg style="width:24px;height:24px;vertical-align:-4px"') + ' النجوم: ' + st + ' من ' + maxStars() + ' &nbsp;·&nbsp; المراحل المكتملة: ' + beatenCount() + ' من ' + LEVELS.length;
    setTheme(LEVELS[0].theme);
    ensureMenuMusic(true);
  }
  onClick('b-play', function () { sfx.click(); goSelect(); });
  onClick('b-garage', function () { sfx.click(); goGarage(); });

  /* ---------------------------------------------------------- level select */
  function goSelect(idx) {
    scene = 'select'; show('select');
    if (idx != null) sel = idx;
    else {
      sel = Math.min(save.last || 0, LEVELS.length - 1);
      if (!levelUnlocked(sel)) sel = 0;
    }
    var dots = $('dots'); dots.innerHTML = '';
    LEVELS.forEach(function (L, i) {
      var d = document.createElement('i');
      d.addEventListener('click', function () { sel = i; sfx.click(); refreshSelect(true); });
      dots.appendChild(d);
    });
    refreshSelect(false);
    ensureMenuMusic(true);
  }
  function refreshSelect(anim) {
    var L = LEVELS[sel], def = L.def, th = L.theme, unlocked = levelUnlocked(sel);
    var card = $('card');
    card.style.background = 'linear-gradient(135deg, ' + th.bg2 + ', ' + th.bg1 + ')';
    card.style.borderColor = th.line;
    if (anim) { card.classList.remove('bump'); void card.offsetWidth; card.classList.add('bump'); }
    $('lvl-num').textContent = 'المرحلة ' + (sel + 1);
    $('lvl-name').textContent = def.name;
    var D = BD.DIFFS[def.face];
    $('lvl-diff').textContent = D.label;
    $('lvl-diff').style.color = D.col;
    var sb = save.stars[L.id] || 0, sh = '';
    for (var i = 0; i < L.stars; i++) sh += BD.starSVG(!!(sb & (1 << i)));
    $('lvl-stars').innerHTML = sh;
    var bn = save.best[L.id] || 0, bp = save.bestP[L.id] || 0;
    $('bar-n').style.width = bn + '%'; $('bar-n-t').textContent = bn + '%';
    $('bar-p').style.width = bp + '%'; $('bar-p-t').textContent = bp + '%';
    var fc = $('diff-face').getContext('2d');
    fc.clearRect(0, 0, 120, 120); BD.drawDiffFace(fc, def.face, 120);
    var lock = $('lvl-lock');
    lock.hidden = unlocked;
    if (!unlocked) lock.innerHTML = '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="12" rx="3" fill="#ffe14d"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#ffe14d" stroke-width="2.6" fill="none"/></svg>أكمل مرحلة «' + LEVELS[sel - 1].def.name + '» لتفتح هذه<small>(إكمالها في التدريب يُحسب أيضًا!)</small>';
    $('lvl-done').hidden = !save.done[L.id];
    $('b-go').disabled = !unlocked; $('b-practice').disabled = !unlocked;
    $('b-go').style.opacity = unlocked ? 1 : 0.4; $('b-practice').style.opacity = unlocked ? 1 : 0.4;
    $('b-prev').disabled = sel === 0; $('b-next').disabled = sel === LEVELS.length - 1;
    var ds = $('dots').children;
    for (var j = 0; j < ds.length; j++) {
      ds[j].className = (j === sel ? 'on' : '') + (save.done[LEVELS[j].id] ? ' done' : '');
    }
    $('sel-stars').innerHTML = BD.starSVG(true).replace('<svg', '<svg style="width:26px;height:26px;vertical-align:-4px"') + ' ' + totalStars() + ' من ' + maxStars();
    setTheme(th);
    if (scene === 'select') previewSong();
  }
  var previewing = -1;
  function previewSong() {
    if (!A.ctx || A.ctx.state !== 'running') return;
    if (previewing === sel && music.playing) return;
    previewing = sel;
    var L = LEVELS[sel];
    music.play(L.song, (L.song.intro) * 16 * L.song.stepDur, 0.4);
  }
  function selMove(d) {
    var n = Math.max(0, Math.min(LEVELS.length - 1, sel + d));
    if (n !== sel) { sel = n; sfx.click(); refreshSelect(true); }
  }
  onClick('b-prev', function () { selMove(-1); });
  onClick('b-next', function () { selMove(1); });
  onClick('b-sel-back', function () { sfx.click(); goTitle(); });
  function trySelectPlay(practice) {
    if (!levelUnlocked(sel)) { sfx.nope(); return; }
    sfx.click(); G.auto = null; startLevel(sel, practice);
  }
  onClick('b-go', function () { trySelectPlay(false); });
  onClick('b-practice', function () { trySelectPlay(true); });
  $('card').addEventListener('click', function () { Kit.audio.unlock(); trySelectPlay(false); });

  /* ---------------------------------------------------------- garage */
  var garTab = 'face';
  function goGarage() {
    scene = 'garage'; show('garage');
    buildGrid();
    ensureMenuMusic(true);
  }
  onClick('b-gar-back', function () { sfx.click(); markGarageSeen(); goTitle(); });
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
    t.addEventListener('click', function () {
      garTab = t.getAttribute('data-tab'); sfx.click();
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.toggle('on', x === t); });
      buildGrid();
    });
  });
  function markGarageSeen() { save.gseen = allUnlockKeys(); persist('gseen'); }
  function buildGrid() {
    var grid = $('grid'); grid.innerHTML = '';
    var look = myLook();
    var list = garTab === 'face' ? BD.FACES : BD.COLORS;
    var cur = garTab === 'face' ? save.face : garTab === 'c1' ? save.c1 : save.c2;
    list.forEach(function (it, i) {
      var el = document.createElement('div');
      var ok = needMet(it.need), key = (garTab === 'face' ? 'f' : 'c') + i;
      el.className = 'item' + (i === cur ? ' on' : '') + (ok ? '' : ' locked');
      if (garTab === 'face') {
        var cv = document.createElement('canvas'); cv.width = 168; cv.height = 168;
        var c2 = cv.getContext('2d'); c2.translate(84, 84); BD.drawCube(c2, 120, it.id, look.c1, look.c2, 0);
        el.appendChild(cv);
      } else {
        var sw = document.createElement('div'); sw.className = 'swatch'; sw.style.background = it.c; el.appendChild(sw);
      }
      if (ok && save.gseen.indexOf(key) < 0) { var nb = document.createElement('span'); nb.className = 'new'; nb.textContent = 'جديد'; el.appendChild(nb); }
      el.addEventListener('mouseenter', function () { $('grid-info').textContent = ok ? it.name : '🔒 ' + needText(it.need); });
      el.addEventListener('mouseleave', function () { $('grid-info').textContent = 'أكمل المراحل واجمع النجوم لتفتح المزيد!'; });
      el.addEventListener('click', function () {
        Kit.audio.unlock();
        if (!ok) { sfx.nope(); $('grid-info').textContent = '🔒 ' + needText(it.need); el.animate && el.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 180 }); return; }
        if (garTab === 'face') { save.face = i; persist('face'); }
        else if (garTab === 'c1') { save.c1 = i; persist('c1'); }
        else { save.c2 = i; persist('c2'); }
        sfx.click(); G.previewHop = 1;
        buildGrid();
      });
      grid.appendChild(el);
    });
    $('preview-name').textContent = BD.FACES[save.face].name;
    $('unlock-count').textContent = 'فتحت ' + allUnlockKeys().length + ' من ' + (BD.FACES.length + BD.COLORS.length);
    $('gar-stars').innerHTML = BD.starSVG(true).replace('<svg', '<svg style="width:26px;height:26px;vertical-align:-4px"') + ' ' + totalStars() + ' من ' + maxStars();
  }

  /* ---------------------------------------------------------- pause */
  function pauseGame() {
    if (scene !== 'play' || G.paused || G.won) return;
    G.paused = true; music.stop(0.08);
    show('pause');
    $('pause-level').textContent = G.L.def.name + (G.practice ? ' — تدريب' : '') + ' — المحاولة ' + G.sessionAtt;
    var bn = save.best[G.L.id] || 0, bp = save.bestP[G.L.id] || 0;
    $('pbar-n').style.width = bn + '%'; $('pbar-n-t').textContent = bn + '%';
    $('pbar-p').style.width = bp + '%'; $('pbar-p-t').textContent = bp + '%';
    $('b-toggle-practice').textContent = G.practice ? 'الوضع العادي' : 'وضع التدريب';
    var rt = G.practice && G.cps.length ? 'من نقطة الحفظ' : 'من البداية';
    $('b-restart').textContent = rt; $('pause-r-t').textContent = rt;
  }
  function resumeGame() {
    if (!G.paused) return;
    G.paused = false; show(null);
    Kit.keys.reset();
    if (!G.dead && !G.won) music.play(G.L.song, G.s.tick / 60);
  }
  onClick('b-resume', function () { sfx.click(); resumeGame(); });
  onClick('b-restart', function () { sfx.click(); G.paused = false; show(null); G.cps = G.practice ? G.cps : []; restartFromStart(); });
  onClick('b-toggle-practice', function () { sfx.click(); G.paused = false; startLevel(G.li, !G.practice); });
  onClick('b-menu', function () { sfx.click(); G.paused = false; music.stop(0.1); goSelect(G.li); });

  /* ---------------------------------------------------------- win */
  function showWin() {
    G.winShown = true;
    show('win');
    var L = G.L;
    var t = $('win-title');
    t.textContent = G.practice ? 'أكملت التدريب!' : 'أكملت المرحلة!';
    t.className = 'win-title' + (G.practice ? ' practice' : '');
    $('win-level').textContent = L.def.name;
    var sb = save.stars[L.id] || 0, sh = '';
    for (var i = 0; i < L.stars; i++) sh += BD.starSVG(!!(sb & (1 << i)));
    $('win-stars').innerHTML = G.practice ? '' : sh;
    var jumps = G.s.jumps;
    $('win-stats').innerHTML = G.practice
      ? 'تدريب رائع! الآن جرّبها <b>بجدّ</b> بدون نقاط حفظ!'
      : 'المحاولات: <b>' + G.sessionAtt + '</b> &nbsp;·&nbsp; القفزات: <b>' + jumps + '</b>' + (popcnt(sb) < L.stars ? '<br>هل تجد النجوم الثلاث كلها؟' : '<br><b>وجدت كل النجوم!</b>');
    var un = $('win-unlocks'); un.innerHTML = '';
    G.winUnlocks.forEach(function (u) { un.appendChild(unlockRow(u)); });
    var next = G.li + 1 < LEVELS.length && levelUnlocked(G.li + 1);
    var nb = $('b-win-next');
    if (G.practice) nb.textContent = 'العبها بجدّ!';
    else nb.textContent = next ? 'المرحلة التالية' : 'العب مجددًا';
    $('b-win-again').textContent = G.practice ? 'تدرّب مجددًا' : 'العب مجددًا';
    $('win-enter-t').textContent = G.practice ? 'العبها بجدّ' : next ? 'التالي' : 'مجددًا';
    $('b-win-again').style.display = (!G.practice && !next) ? 'none' : '';
  }
  function unlockRow(u) {
    var row = document.createElement('div'); row.className = 'unlock-row';
    var look = myLook();
    if (u.kind === 'l') {
      var dc = document.createElement('canvas'); dc.width = 88; dc.height = 88;
      BD.drawDiffFace(dc.getContext('2d'), LEVELS[u.i].def.face, 88);
      row.appendChild(dc);
    } else if (u.kind === 'f') {
      var cv = document.createElement('canvas'); cv.width = 88; cv.height = 88;
      var c2 = cv.getContext('2d'); c2.translate(44, 44); BD.drawCube(c2, 64, BD.FACES[u.i].id, look.c1, look.c2, 0);
      row.appendChild(cv);
    } else { var sw = document.createElement('div'); sw.className = 'swatch'; sw.style.background = BD.COLORS[u.i].c; row.appendChild(sw); }
    var tx = document.createElement('span'); tx.textContent = itemName(u); row.appendChild(tx);
    return row;
  }
  function winNext() {
    if (G.wonT < 1.9) return;
    sfx.click();
    if (G.practice) { startLevel(G.li, false); return; }
    if (G.li + 1 < LEVELS.length && levelUnlocked(G.li + 1)) startLevel(G.li + 1, false);
    else startLevel(G.li, false);
  }
  onClick('b-win-next', winNext);
  onClick('b-win-again', function () { sfx.click(); startLevel(G.li, G.practice); });
  function winMenu() { sfx.click(); music.stop(0.2); var n = Math.min(G.li + (G.practice ? 0 : 1), LEVELS.length - 1); goSelect(levelUnlocked(n) ? n : G.li); }
  onClick('b-win-menu', winMenu);

  /* ---------------------------------------------------------- toast */
  var toastT = 0, toastQ = [];
  function toast(msg) { toastQ.push(msg); }
  function updateToast(dt) {
    var el = $('toast');
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.hidden = true; return; }
    if (toastQ.length) { el.textContent = toastQ.shift(); el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; toastT = 2.6; }
  }

  /* ---------------------------------------------------------- theme */
  function setTheme(th) {
    if (th === themeNow) return;
    themeFade = { from: themeNow, t: 0 };
    themeNow = th;
  }

  /* ============================================================ GAMEPLAY */
  function startLevel(li, practice) {
    scene = 'play';
    G.li = li; G.L = LEVELS[li]; G.practice = practice; G.cps = []; G.sessionAtt = 0;
    G.paused = false; G.won = false; G.winShown = false;
    save.last = li; persist('last');
    setTheme(G.L.theme); themeFade = null;
    show(null);
    parts.length = 0;
    Kit.keys.reset();
    newAttempt();
  }
  function restartFromStart() { if (!G.practice) G.cps = []; newAttempt(); }

  function newAttempt() {
    var L = G.L;
    G.sessionAtt++;
    save.att[L.id] = (save.att[L.id] || 0) + 1; persist('att');
    save.total.attempts++; persist('total');
    var s;
    if (G.practice && G.cps.length) s = BD.clone(G.cps[G.cps.length - 1].s);
    else s = BD.newState(L);
    s.ev = [];
    G.s = s; G.dead = false; G.deadT = 0; G.won = false; G.wonT = 0; G.winShown = false;
    G.jumpsAtStart = s.jumps; G.newBestRun = false;
    G.camY = targetCamY(s, 0, true);
    G.trail.length = 0; G.rot = 0; G.sqx = G.sqy = 1; G.flashes = {};
    G.lastCpTick = s.tick;
    G.attemptX = s.x;
    music.play(L.song, s.tick / 60);
    checkUnlocks().forEach(function (u) { toast(itemName(u)); });
  }

  function targetCamY(s, cur, snap) {
    var y = s.y, t = cur, top = (s.mode === 1 || s.grav < 0) ? 7.4 : 5.2;
    if (y - t > top) t = y - top;
    if (y - t < 1.2) t = Math.max(0, y - 1.2);
    if (s.onGround && s.y < 0.01 && s.grav > 0) t = 0;
    return snap ? Math.max(0, t) : t;
  }

  function jumpHeld() { return Kit.keys.anyDown(['Space', 'ArrowUp', 'KeyW']) || ptr.down; }
  function jumpPressed() { return Kit.keys.anyPressed(['Space', 'ArrowUp', 'KeyW']) || ptr.pressed; }

  function pct(s) { return Math.max(0, Math.min(100, Math.floor(s.x / G.L.finishX * 100))); }

  function killPlayer() {
    var s = G.s, L = G.L;
    G.dead = true; G.deadT = 0.42;
    var look = myLook();
    var cx = s.x + 0.5, cy = s.y + 0.5;
    burst(cx, cy, 26, { speed: 11, life: 0.8, size: 0.26, colors: [look.c1, look.c2, '#ffffff'], g: -22, drag: 0.8 });
    burst(cx, cy, 20, { speed: 16, life: 0.5, size: 0.1, color: '#ffffff', g: 0, shape: 1, drag: 2 });
    ring(cx, cy, look.c1, 0.3, 2.6, 0.45);
    shake.add(14); G.flash = 0.45; G.flashCol = '#ffffff';
    sfx.die();
    music.stop(0.12);
    save.total.jumps += s.jumps - G.jumpsAtStart; G.jumpsAtStart = s.jumps; persist('total');
    var p = pct(s);
    var key = G.practice ? 'bestP' : 'best';
    if (p > (save[key][L.id] || 0)) {
      save[key][L.id] = p; persist(key);
      if (!G.practice && p >= 5) {
        popup('رقم قياسي جديد!', p + '%', '#ffe14d');
        sfx.best();
        burst(W / 2, 250, 40, { speed: 520, life: 1.1, size: 12, colors: ['#ffe14d', '#ff5ad1', '#3df2ff', '#7dff5a'], g: 700, screen: true, shape: 4 });
      }
    } else if (!G.practice && p >= 85) popup('قريب جدًا!', p + '%', '#ff8ad8');
    // stuck? point kids at practice mode (every 12 tries in a row)
    if (!G.practice && G.sessionAtt % 12 === 0) toast('صعبة؟ جرّب وضع التدريب: اضغط P ثم «وضع التدريب»');
  }

  function popup(big, small, col) { G.popups.push({ big: big, small: small, col: col, t: 0, life: 1.6 }); }

  function handleEvents(s) {
    var look = myLook(), th = G.L.theme;
    for (var i = 0; i < s.ev.length; i++) {
      var e = s.ev[i], o = e.o;
      switch (e.t) {
        case 'jump':
          G.sqx = 0.78; G.sqy = 1.25;
          burst(s.x + 0.5, s.grav > 0 ? s.y : s.y + 1, 6, { speed: 3, life: 0.3, size: 0.12, color: th.line, angle: s.grav > 0 ? -Math.PI / 2 : Math.PI / 2, spread: 1.8, g: 0 });
          sfx.jump();
          break;
        case 'land':
          var power = Math.min(1, (o || 0) / 30);
          G.sqx = 1.2 + 0.15 * power; G.sqy = 0.78 - 0.1 * power;
          burst(s.x + 0.5, s.grav > 0 ? s.y : s.y + 1, 5 + Math.round(power * 8), { speed: 3 + 3 * power, life: 0.35, size: 0.13, color: th.line, angle: s.grav > 0 ? Math.PI / 2 : -Math.PI / 2, spread: 2.6, g: s.grav > 0 ? -12 : 12 });
          if (power > 0.3) shake.add(2 + 3 * power);
          sfx.land(power);
          break;
        case 'pad':
          G.flashes[o.id] = 1;
          G.sqx = 0.7; G.sqy = 1.35;
          burst(o.x1 + 0.4, o.dir > 0 ? o.y1 + 0.2 : o.y2 - 0.2, 16, { speed: 7, life: 0.5, size: 0.14, color: o.kind === 'Y' ? '#ffe14d' : '#4dc3ff', angle: o.dir > 0 ? Math.PI / 2 : -Math.PI / 2, spread: 1.4, g: 0, drag: 2 });
          sfx.pad();
          break;
        case 'orb':
          G.flashes[o.id] = 1;
          var oc = orbCol(o.kind);
          ring(o.cx, o.cy, oc, 0.4, 1.7, 0.4);
          burst(o.cx, o.cy, 14, { speed: 6, life: 0.4, size: 0.13, color: oc, g: 0, drag: 3, shape: 1 });
          G.sqx = 0.75; G.sqy = 1.3;
          sfx.orb();
          break;
        case 'portal':
          G.flashes[o.id] = 1;
          G.flash = 0.35; G.flashCol = portalCol(o.kind);
          burst(o.cx, o.cy, 18, { speed: 6, life: 0.5, size: 0.15, color: portalCol(o.kind), g: 0, jy: 2.5, drag: 2 });
          shake.add(3);
          sfx.portal();
          break;
        case 'star':
          burst(o.cx, o.cy, 22, { speed: 8, life: 0.8, size: 0.28, colors: ['#ffe14d', '#fff6b0', '#ffffff'], g: -6, shape: 4, drag: 1.5 });
          ring(o.cx, o.cy, '#ffe14d', 0.3, 1.8, 0.5);
          popup('نجمة!', popcnt(s.stars) + ' من ' + G.L.stars, '#ffe14d');
          if (!G.practice) {
            save.stars[G.L.id] = (save.stars[G.L.id] || 0) | (1 << o.idx); persist('stars');
            checkUnlocks().forEach(function (u) { toast(itemName(u)); });
          }
          sfx.star();
          break;
        case 'bump': sfx.bump(); break;
        case 'die': killPlayer(); break;
        case 'win': winLevel(); break;
      }
    }
    s.ev.length = 0;
  }

  function winLevel() {
    var L = G.L, s = G.s;
    var nextWasLocked = G.li + 1 < LEVELS.length && !levelUnlocked(G.li + 1);
    G.won = true; G.wonT = 0; G.winX = s.x; G.fireT = 0;
    save.total.jumps += s.jumps - G.jumpsAtStart; G.jumpsAtStart = s.jumps; persist('total');
    if (G.practice) { save.doneP[L.id] = true; persist('doneP'); save.bestP[L.id] = 100; persist('bestP'); }
    else { save.done[L.id] = true; persist('done'); save.best[L.id] = 100; persist('best'); }
    G.winUnlocks = checkUnlocks();
    if (nextWasLocked) G.winUnlocks.unshift({ kind: 'l', i: G.li + 1 });
    G.flash = 0.6; G.flashCol = '#ffffff';
    shake.add(6);
    sfx.win();
    for (var i = 0; i < 5; i++) firework(true);
  }

  function firework(big) {
    var x = 200 + Math.random() * (W - 400), y = 110 + Math.random() * 260;
    var th = G.L ? G.L.theme : themeNow;
    var cols = [['#ffe14d', '#fff6b0'], ['#ff5ad1', '#ffb3e6'], ['#3df2ff', '#b8fbff'], ['#7dff5a', '#d6ffc4'], [th.line, '#ffffff']][Math.floor(Math.random() * 5)];
    burst(x, y, big ? 46 : 34, { speed: 380, life: 1.2, size: 7, colors: cols, g: 260, screen: true, shape: 1, drag: 1.4 });
    ring(x, y, cols[0], 10, 150, 0.5, true);
    sfx.firework();
  }

  function practiceSafe(s) {
    var t = BD.clone(s); t.ev = null;
    for (var i = 0; i < 18; i++) { BD.tick(G.L, t, false, false); if (t.dead) break; }
    if (!t.dead) return true;
    if (s.mode === 1) {
      t = BD.clone(s); t.ev = null;
      for (i = 0; i < 18; i++) { BD.tick(G.L, t, true, i === 0); if (t.dead) return false; }
      return true;
    }
    return false;
  }
  function addCheckpoint(manual) {
    var s = G.s;
    if (G.dead || G.won) return;
    var c = BD.clone(s); c.ev = [];
    G.cps.push({ s: c });
    if (G.cps.length > 60) G.cps.shift();
    G.lastCpTick = s.tick;
    if (manual) { sfx.cp(); burst(s.x + 0.5, s.y + 0.5, 10, { speed: 4, life: 0.4, size: 0.14, color: '#7dff5a', g: 0, shape: 1 }); }
  }

  function updatePlay(dt) {
    var s = G.s, L = G.L;
    // keys
    if (!G.won && Kit.keys.anyPressed(['KeyP', 'Escape'])) {
      if (G.paused) resumeGame(); else pauseGame();
      return;
    }
    if (G.paused) {
      if (Kit.keys.pressed('KeyR')) { G.paused = false; show(null); restartFromStart(); }
      else if (Kit.keys.pressed('Enter')) resumeGame();
      return;
    }
    if (G.won) {
      G.wonT += dt;
      G.winX += L.speed * BD.PHYS.TIERS[s.tier] * dt;
      G.fireT -= dt;
      if (G.fireT <= 0 && G.wonT < 6) { firework(false); G.fireT = 0.28 + Math.random() * 0.25; }
      if (G.wonT > 1.4 && !G.winShown) showWin();
      if (G.winShown && G.wonT > 1.9) {
        if (Kit.keys.anyPressed(['Enter', 'Space'])) winNext();
        else if (Kit.keys.pressed('KeyR')) { sfx.click(); startLevel(G.li, G.practice); }
        else if (Kit.keys.pressed('Escape')) winMenu();
      }
      if (G.wonT > 4 && music.playing) music.stop(1.5);
      return;
    }
    if (Kit.keys.pressed('KeyR') && !G.dead) { restartFromStart(); return; }
    if (G.practice) {
      if (Kit.keys.pressed('KeyZ')) addCheckpoint(true);
      if (Kit.keys.pressed('KeyX') && G.cps.length) { G.cps.pop(); sfx.bump(); }
    }
    if (G.dead) {
      G.deadT -= dt;
      if (G.deadT <= 0) newAttempt();
      return;
    }
    var held = jumpHeld(), pressed = jumpPressed();
    if (G.auto) { held = G.auto[s.tick] === '1'; pressed = held && G.auto[s.tick - 1] !== '1'; }
    BD.tick(L, s, held, pressed);
    handleEvents(s);
    if (G.dead || G.won) return;
    // practice auto-checkpoints
    if (G.practice && s.tick - G.lastCpTick > 140 && (s.mode === 1 || s.onGround) && practiceSafe(s)) addCheckpoint(false);
    // visuals
    if (s.mode === 0) {
      if (!s.onGround) G.rot += 0.135 * s.grav;
      else { var tr = Math.round(G.rot / (Math.PI / 2)) * (Math.PI / 2); G.rot += (tr - G.rot) * 0.4; }
    } else {
      var ang = -Math.atan2(s.vy, L.speed * BD.PHYS.TIERS[s.tier]) * 0.9;
      G.rot += (ang - G.rot) * 0.35;
    }
    G.trail.push(s.x + 0.5, s.y + 0.5);
    if (G.trail.length > 28) G.trail.splice(0, 2);
    var look = myLook();
    if (s.mode === 0 && s.onGround && s.tick % 3 === 0) spawn({ x: s.x + 0.1, y: s.grav > 0 ? s.y + 0.05 : s.y + 0.95, vx: -2 - Math.random() * 2, vy: (Math.random() * 2) * s.grav, life: 0.35, max: 0.35, size: 0.1, color: G.L.theme.line, g: 0, rot: 0, vr: 0, shape: 0 });
    if (s.mode === 1) spawn({ x: s.x - 0.1, y: s.y + 0.45 + (Math.random() - 0.5) * 0.2, vx: -6 - Math.random() * 3, vy: (Math.random() - 0.5) * 2, life: 0.4, max: 0.4, size: 0.2, color: Math.random() < 0.5 ? '#ffb000' : look.c2, g: 0, rot: 0, vr: 5, shape: 1 });
  }

  /* ---------------------------------------------------------- demo (menus) */
  function demoAI(s) {
    function ok(h) { var t = BD.clone(s); t.ev = null; for (var i = 0; i < 26; i++) { BD.tick(demoL, t, h && i < 2, h && i === 0); if (t.dead) return false; } return true; }
    if (ok(false)) return false;
    return ok(true);
  }
  function updateDemo(dt) {
    if (!demo.s) { demo.s = BD.newState(demoL); demo.s.ev = []; }
    var s = demo.s;
    var h = s.onGround && demoAI(s);
    BD.tick(demoL, s, h, h);
    for (var i = 0; i < s.ev.length; i++) {
      var e = s.ev[i];
      if (e.t === 'jump') { demo.sqx = 0.8; demo.sqy = 1.22; }
      if (e.t === 'land') { demo.sqx = 1.2; demo.sqy = 0.8; burst(s.x + 0.5, s.y, 6, { speed: 3, life: 0.3, size: 0.12, color: themeNow.line, angle: Math.PI / 2, spread: 2.4, g: -10 }); }
      if (e.t === 'pad') { burst(e.o.x1 + 0.4, e.o.y1 + 0.2, 12, { speed: 6, life: 0.4, size: 0.13, color: '#ffe14d', angle: Math.PI / 2, spread: 1.3, g: 0, drag: 2 }); demo.sqx = 0.7; demo.sqy = 1.3; }
    }
    s.ev.length = 0;
    if (s.dead) { demo.s = null; return; }
    if (!s.onGround) demo.rot = (demo.rot || 0) + 0.135;
    else { var tr = Math.round((demo.rot || 0) / (Math.PI / 2)) * (Math.PI / 2); demo.rot += (tr - demo.rot) * 0.4; }
    demo.sqx = lerp(demo.sqx || 1, 1, 0.2); demo.sqy = lerp(demo.sqy || 1, 1, 0.2);
    if (s.x > demoL.period * 8) {
      var sh = demoL.period * 6;
      s.x -= sh; s.px -= sh;
      for (var k = 0; k < parts.length; k++) if (!parts[k].screen) parts[k].x -= sh;
    }
    if (s.onGround && s.tick % 3 === 0) spawn({ x: s.x + 0.1, y: s.y + 0.05, vx: -2 - Math.random() * 2, vy: Math.random() * 2, life: 0.35, max: 0.35, size: 0.1, color: themeNow.line, g: 0, rot: 0, vr: 0, shape: 0 });
  }

  function ensureMenuMusic(force) {
    if (!A.ctx || A.ctx.state !== 'running') return;
    if (scene === 'select') { previewing = -1; previewSong(); return; }
    if (scene !== 'title' && scene !== 'garage') return;
    if (music.playing && music.song === menuSong) return;
    if (force || !music.playing) music.play(menuSong, 0, 0.5);
  }

  /* ============================================================ UPDATE */
  function update(dt) {
    menuT += dt;
    if (themeFade) { themeFade.t += dt * 2.5; if (themeFade.t >= 1) themeFade = null; }
    if (scene === 'play') updatePlay(dt);
    else {
      updateDemo(dt);
      if (!music.playing && A.ctx && A.ctx.state === 'running' && !document.hidden) ensureMenuMusic(false);
      var k = Kit.keys;
      if (scene === 'title') {
        if (k.anyPressed(['Enter', 'Space'])) { sfx.click(); goSelect(); }
        else if (k.pressed('KeyC')) { sfx.click(); goGarage(); }
      } else if (scene === 'select') {
        if (k.anyPressed(['ArrowLeft', 'KeyA'])) selMove(-1);
        else if (k.anyPressed(['ArrowRight', 'KeyD'])) selMove(1);
        else if (k.anyPressed(['Enter', 'Space'])) trySelectPlay(false);
        else if (k.anyPressed(['Escape', 'Backspace'])) { sfx.click(); goTitle(); }
      } else if (scene === 'garage') {
        if (k.anyPressed(['Escape', 'Backspace'])) { sfx.click(); markGarageSeen(); goTitle(); }
      }
    }
    // shared visuals
    updateParts(dt);
    shake.update(dt);
    G.sqx = lerp(G.sqx, 1, 0.2); G.sqy = lerp(G.sqy, 1, 0.2);
    G.flash = Math.max(0, G.flash - dt * 1.8);
    for (var id in G.flashes) { G.flashes[id] -= dt * 3; if (G.flashes[id] <= 0) delete G.flashes[id]; }
    for (var i = G.popups.length - 1; i >= 0; i--) { G.popups[i].t += dt; if (G.popups[i].t > G.popups[i].life) G.popups.splice(i, 1); }
    G.blinkT -= dt; if (G.blinkT < 0) { G.blink = 0.12; G.blinkT = 2 + Math.random() * 3; }
    G.blink = Math.max(0, G.blink - dt);
    if (G.previewHop) G.previewHop = Math.max(0, G.previewHop - dt * 2);
    if (scene === 'play' && G.s) {
      var tgt = targetCamY(G.s, G.camY, false);
      G.camY += (tgt - G.camY) * 0.09;
      if (G.camY < 0.001) G.camY = Math.max(0, G.camY);
    } else if (demo.s) demo.camY = 0;
    updateToast(dt);
    Kit.keys.endFrame(); ptr.endFrame();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (scene === 'play' && !G.paused && !G.won) pauseGame();
      else if (scene !== 'play') music.stop(0.05);
    }
  });

  /* ============================================================ RENDER */
  var gradCache = {};
  function mixHex(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round(lerp(pa >> 16, pb >> 16, t)), g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t)), bl = Math.round(lerp(pa & 255, pb & 255, t));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  function curTheme() {
    if (!themeFade) return themeNow;
    var f = themeFade.from, t = themeNow, k = Math.min(1, themeFade.t), o = {};
    for (var key in t) if (typeof t[key] === 'string' && t[key][0] === '#' && f[key]) o[key] = mixHex(f[key], t[key], k); else o[key] = t[key];
    return o;
  }

  function beatInfo(song, time) {
    var b = time * song.bpm / 60;
    var frac = b - Math.floor(b);
    var bar = Math.floor(b / 4);
    var sec = BD.songSection(song, bar);
    var amp = sec === 0 ? 0.55 : sec === 2 ? 1 : 0.8;
    return { pulse: Math.exp(-frac * 5) * amp, beat: Math.floor(b), sec: sec, frac: frac };
  }

  function drawBackground(th, t, bi, camX, camY) {
    var gk = th.bg1 + th.bg2;
    var g = gradCache[gk];
    if (!g) { if (Object.keys(gradCache).length > 30) gradCache = {}; g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, th.bg1); g.addColorStop(1, th.bg2); gradCache[gk] = g; }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var pulse = bi.pulse;
    // big slow shapes
    ctx.save();
    ctx.strokeStyle = th.deco; ctx.lineWidth = 8;
    var span = 1700;
    for (var i = 0; i < 9; i++) {
      var bx = ((i * 190 - camX * U * 0.08) % span + span) % span - 200;
      var by = 90 + (i * 137 % 5) * 72 + camY * U * 0.05;
      var sz = (70 + (i * 53 % 4) * 34) * (1 + pulse * 0.08);
      ctx.globalAlpha = 0.16 + 0.1 * pulse;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(t * 0.25 * (i % 2 ? 1 : -1) + i);
      if (i % 3 === 0) { ctx.beginPath(); ctx.arc(0, 0, sz / 2, 0, TAU); ctx.stroke(); }
      else ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
    ctx.restore();
    // equalizer bars
    var gy = GROUND0 + camY * U;
    var bw = 38, step = 48, off = camX * U * 0.3;
    var k0 = Math.floor(off / step);
    ctx.fillStyle = th.deco;
    for (var k = k0; k * step - off < W; k++) {
      var x = k * step - off;
      var base = 40 + hash(k) * 150;
      var hop = hash(k * 31 + bi.beat * 7) * 90;
      var hh = (base + hop * (bi.sec === 0 ? 0.3 : 1)) * (0.6 + 0.4 * pulse);
      ctx.globalAlpha = 0.18 + 0.08 * pulse;
      ctx.fillRect(x, gy - hh, bw, hh);
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x, gy - hh - 10, bw, 5);
    }
    ctx.globalAlpha = 1;
    // pulse wash
    if (pulse > 0.02) { ctx.fillStyle = hexA(th.line, 0.07 * pulse); ctx.fillRect(0, 0, W, H); }
  }

  function drawGround(th, camX, camY, bi) {
    var gy = GROUND0 + camY * U;
    if (gy >= H) return;
    var g = ctx.createLinearGradient(0, gy, 0, gy + 170);
    g.addColorStop(0, th.ground1); g.addColorStop(1, th.ground2);
    ctx.fillStyle = g; ctx.fillRect(0, gy, W, H - gy);
    // tiles
    ctx.strokeStyle = hexA(th.line, 0.13); ctx.lineWidth = 3;
    var tw = U * 2, off = ((camX * U) % tw + tw) % tw;
    ctx.beginPath();
    for (var x = -off; x < W + tw; x += tw) { ctx.rect(x + 6, gy + 10, tw - 12, tw - 12); }
    ctx.stroke();
    // bright line
    ctx.strokeStyle = th.line;
    ctx.globalAlpha = 0.25 + 0.35 * bi.pulse; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  }

  function orbCol(k) { return k === 'o' ? '#ffe14d' : k === 'p' ? '#ff6bd6' : '#4dc3ff'; }
  function portalCol(k) { return { G: '#ffb300', N: '#35c6ff', R: '#ff4fd8', C: '#7dff5a', '1': '#ff9f40', '2': '#4dc3ff', '3': '#7dff5a', '4': '#ff4fd8' }[k]; }

  function drawLevel(L, th, camX, camY, t, bi, s, savedStars) {
    var gy = GROUND0 + camY * U;
    function sx(x) { return (x - camX) * U; }
    function sy(y) { return gy - y * U; }
    var c0 = Math.max(0, Math.floor(camX) - 1), c1 = Math.min(L.cols.length - 1, Math.floor(camX + W / U) + 2);
    var c, i, o, list;
    var used = s ? s.used : [];
    // --- solids: fill
    ctx.fillStyle = th.block;
    ctx.beginPath();
    for (c = c0; c <= c1; c++) {
      list = L.cols[c];
      for (i = 0; i < list.length; i++) { o = list[i]; if (o.solid && o.c0 === c) ctx.rect(sx(o.x1), sy(o.y2), U * (o.x2 - o.x1), U * (o.y2 - o.y1)); }
    }
    ctx.fill();
    // inner squares
    ctx.strokeStyle = hexA(th.blockLine, 0.16 + 0.12 * bi.pulse); ctx.lineWidth = 2;
    ctx.beginPath();
    for (c = c0; c <= c1; c++) {
      list = L.cols[c];
      for (i = 0; i < list.length; i++) { o = list[i]; if (o.t === 'block' && o.c0 === c) ctx.rect(sx(o.x1) + 12, sy(o.y2) + 12, U - 24, U - 24); }
    }
    ctx.stroke();
    // outlines on exposed edges
    function solidAt(cc, r) { return r < 0 || !!((L.grid[cc] || 0) & (1 << r)); }
    ctx.beginPath();
    for (c = c0; c <= c1; c++) {
      list = L.cols[c];
      for (i = 0; i < list.length; i++) {
        o = list[i]; if (!o.solid || o.c0 !== c) continue;
        var x1 = sx(o.x1), x2 = sx(o.x2), y1 = sy(o.y2), y2 = sy(o.y1);
        if (o.t === 'slab') { ctx.rect(x1, y1, x2 - x1, y2 - y1); continue; }
        if (!solidAt(c, o.r + 1)) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); }
        if (!solidAt(c, o.r - 1)) { ctx.moveTo(x1, y2); ctx.lineTo(x2, y2); }
        if (!solidAt(c - 1, o.r)) { ctx.moveTo(x1, y1); ctx.lineTo(x1, y2); }
        if (!solidAt(c + 1, o.r)) { ctx.moveTo(x2, y1); ctx.lineTo(x2, y2); }
      }
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = th.blockLine; ctx.globalAlpha = 0.28 + 0.2 * bi.pulse; ctx.lineWidth = 10; ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 3.5; ctx.stroke();
    // --- spikes
    ctx.beginPath();
    for (c = c0; c <= c1; c++) {
      list = L.cols[c];
      for (i = 0; i < list.length; i++) {
        o = list[i]; if (!o.haz || o.c0 !== c) continue;
        var bx = sx(o.c), hgt = o.t === 'mini' ? 0.45 : 0.95, wd = o.t === 'mini' ? 0.7 : 0.9;
        var l = bx + U * (1 - wd) / 2, rr = bx + U * (1 + wd) / 2, mid = bx + U / 2;
        if (o.dir > 0) { var by = sy(o.r); ctx.moveTo(l, by); ctx.lineTo(mid, by - hgt * U); ctx.lineTo(rr, by); ctx.closePath(); }
        else { var ty = sy(o.r + 1); ctx.moveTo(l, ty); ctx.lineTo(mid, ty + hgt * U); ctx.lineTo(rr, ty); ctx.closePath(); }
      }
    }
    ctx.lineJoin = 'round';
    ctx.fillStyle = th.block; ctx.fill();
    ctx.strokeStyle = th.spike; ctx.globalAlpha = 0.3 + 0.2 * bi.pulse; ctx.lineWidth = 9; ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.stroke();
    // --- pads, orbs, portals, stars
    for (c = c0; c <= c1; c++) {
      list = L.cols[c];
      for (i = 0; i < list.length; i++) {
        o = list[i]; if (o.c0 !== c || o.solid || o.haz) continue;
        var fl = G.flashes[o.id] || 0;
        if (o.t === 'pad') drawPad(o, sx(o.c + 0.5), o.dir > 0 ? sy(o.r) : sy(o.r + 1), bi, fl, t);
        else if (o.t === 'orb') drawOrb(o, sx(o.cx), sy(o.cy), bi, fl, t, used.indexOf(o.id) >= 0);
        else if (o.t === 'portal') drawPortal(o, sx(o.cx), sy(o.cy), bi, fl, t);
        else if (o.t === 'star') {
          if (s && (s.stars & (1 << o.idx))) continue;
          drawStar(sx(o.cx), sy(o.cy) + Math.sin(t * 3 + o.idx) * 5, t, !!(savedStars & (1 << o.idx)), bi);
        }
      }
    }
    // --- finish gate
    var fx = sx(L.finishX);
    if (fx < W + 100) {
      ctx.save();
      var gg = ctx.createLinearGradient(fx - 140, 0, fx + 40, 0);
      gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(1, hexA(th.line, 0.55));
      ctx.fillStyle = gg; ctx.fillRect(fx - 140, 0, 180, gy);
      var sq = 20;
      for (var yy = 0; yy * sq < gy; yy++) {
        for (var xx = 0; xx < 2; xx++) {
          ctx.fillStyle = (xx + yy) % 2 ? '#ffffff' : '#1b1033';
          ctx.fillRect(fx + xx * sq, gy - (yy + 1) * sq, sq, sq);
        }
      }
      ctx.restore();
    }
  }

  function drawPad(o, x, y, bi, fl, t) {
    var col = o.kind === 'Y' ? '#ffe14d' : '#4dc3ff';
    var d = o.dir;
    ctx.save(); ctx.translate(x, y); if (d < 0) ctx.scale(1, -1);
    var w = U * 0.42 * (1 + 0.1 * bi.pulse + fl * 0.3), h = U * 0.22 * (1 + fl * 0.6);
    ctx.globalAlpha = 0.3 + 0.3 * bi.pulse;
    ctx.fillStyle = col;
    for (var k = 0; k < 3; k++) {
      var ph = ((t * 1.6 + k / 3) % 1);
      ctx.globalAlpha = (1 - ph) * 0.5;
      ctx.fillRect(-w * 0.6 + k * w * 0.5, -h - ph * U * 0.9, 4, 10);
    }
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#1b1033'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-w * 0.5, -h * 0.7, w * 0.5, 3);
    ctx.restore();
  }
  function drawOrb(o, x, y, bi, fl, t, used) {
    var col = orbCol(o.kind);
    var r = U * 0.3;
    ctx.save(); ctx.translate(x, y);
    ctx.globalAlpha = used ? 0.35 : 1;
    ctx.strokeStyle = col; ctx.lineWidth = 4;
    ctx.globalAlpha *= 0.55 + 0.3 * bi.pulse;
    ctx.beginPath(); ctx.arc(0, 0, U * 0.5 * (1 + 0.14 * bi.pulse), 0, TAU); ctx.stroke();
    ctx.globalAlpha = used ? 0.35 : 1;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * (1 + fl * 0.5), 0, TAU); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#1b1033'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.35, r * 0.3, 0, TAU); ctx.fill();
    if (o.kind === 'b') {
      ctx.strokeStyle = '#1b1033'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(0, -r * 0.55); ctx.lineTo(0, r * 0.55); ctx.moveTo(-r * 0.3, -r * 0.25); ctx.lineTo(0, -r * 0.55); ctx.lineTo(r * 0.3, -r * 0.25);
      ctx.moveTo(-r * 0.3, r * 0.25); ctx.lineTo(0, r * 0.55); ctx.lineTo(r * 0.3, r * 0.25); ctx.stroke();
    }
    ctx.restore();
  }
  function drawPortal(o, x, y, bi, fl, t) {
    var col = portalCol(o.kind), k = o.kind;
    ctx.save(); ctx.translate(x, y);
    if (k >= '1' && k <= '4') {
      var n = +k;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (var j = 0; j < n; j++) {
        var ox = (j - (n - 1) / 2) * U * 0.34 + Math.sin(t * 8 + j) * 2;
        ctx.beginPath(); ctx.moveTo(ox - U * 0.18, -U * 0.8); ctx.lineTo(ox + U * 0.2, 0); ctx.lineTo(ox - U * 0.18, U * 0.8);
        ctx.strokeStyle = '#1b1033'; ctx.lineWidth = 16; ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 10; ctx.stroke();
      }
      ctx.restore(); return;
    }
    var rw = U * 0.55, rh = U * 1.5 * (1 + 0.05 * bi.pulse + fl * 0.2);
    ctx.fillStyle = hexA(col, 0.18 + 0.1 * bi.pulse);
    ctx.beginPath(); ctx.ellipse(0, 0, rw, rh, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = 14; ctx.strokeStyle = '#1b1033'; ctx.stroke();
    ctx.lineWidth = 9; ctx.strokeStyle = col; ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.ellipse(0, 0, rw - 9, rh - 9, 0, 0, TAU); ctx.stroke();
    // swirling dots
    for (var q = 0; q < 5; q++) {
      var a = t * 3 + q * TAU / 5;
      ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(Math.cos(a) * rw * 0.5, Math.sin(a) * rh * 0.6, 3, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // icon
    ctx.lineWidth = 5; ctx.strokeStyle = '#1b1033'; ctx.fillStyle = col; ctx.lineJoin = 'round';
    if (k === 'G' || k === 'N') {
      var dir = k === 'G' ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(-6, -dir * 16); ctx.lineTo(6, -dir * 16); ctx.lineTo(6, 0); ctx.lineTo(14, 0);
      ctx.lineTo(0, dir * 18); ctx.lineTo(-14, 0); ctx.lineTo(-6, 0); ctx.closePath();
      ctx.stroke(); ctx.fill();
    } else if (k === 'R') {
      ctx.save(); ctx.scale(0.55, 0.55); BD.drawRocket(ctx, U, 'smile', col, '#ffffff', t); ctx.restore();
    } else if (k === 'C') {
      ctx.fillRect(-12, -12, 24, 24); ctx.strokeRect(-12, -12, 24, 24);
    }
    ctx.restore();
  }
  function drawStar(x, y, t, ghost, bi) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2) * 0.25);
    var r = U * 0.42 * (1 + 0.08 * bi.pulse);
    ctx.globalAlpha = 0.35 + 0.2 * bi.pulse;
    ctx.fillStyle = ghost ? '#9fd8ff' : '#ffe14d';
    ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, TAU); ctx.fill();
    ctx.globalAlpha = ghost ? 0.6 : 1;
    BD.starPath(ctx, 0, 0, r, r * 0.46, 5, 0);
    ctx.fillStyle = ghost ? '#cfeaff' : '#ffe14d'; ctx.fill();
    ctx.lineWidth = 3.5; ctx.strokeStyle = ghost ? '#3a6d9a' : '#8a5a00'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-r * 0.15, -r * 0.2, r * 0.14, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawPlayer(s, x, y, camX, gy, rot, sqx, sqy, look, t) {
    var cx = (x + 0.5 - camX) * U, cy = gy - (y + 0.5) * U;
    // trail
    var tr = s === G.s ? G.trail : null;
    if (tr && tr.length > 4) {
      ctx.strokeStyle = look.c2; ctx.lineCap = 'round';
      for (var i = 2; i < tr.length; i += 2) {
        var k = i / tr.length;
        ctx.globalAlpha = k * 0.35; ctx.lineWidth = k * U * 0.45;
        ctx.beginPath(); ctx.moveTo((tr[i - 2] - camX) * U, gy - tr[i - 1] * U); ctx.lineTo((tr[i] - camX) * U, gy - tr[i + 1] * U); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(cx, cy);
    if (s.mode === 0) {
      var gs = s.grav;
      ctx.translate(0, gs * (1 - sqy) * U / 2);
      ctx.scale(sqx, sqy);
      if (gs < 0) ctx.scale(1, -1);
      ctx.rotate(rot * gs);
      BD.drawCube(ctx, U, look.face, look.c1, look.c2, G.blink > 0 ? 1 : 0);
    } else {
      ctx.rotate(rot);
      if (s.grav < 0) ctx.scale(1, -1);
      BD.drawRocket(ctx, U, look.face, look.c1, look.c2, t);
    }
    ctx.restore();
  }

  function drawHUD(L, s, t) {
    // progress bar
    var p = s.x / L.finishX; if (p > 1) p = 1;
    var bw = 440, bx = (W - bw) / 2, by = 18, bh = 18;
    ctx.fillStyle = 'rgba(10,5,40,0.6)'; BD.rr(ctx, bx - 4, by - 4, bw + 8, bh + 8, 13); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; BD.rr(ctx, bx, by, bw, bh, 9); ctx.fill();
    var best = (G.practice ? save.bestP : save.best)[L.id] || 0;
    if (best > 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx + bw * best / 100 - 2, by - 3, 4, bh + 6); }
    if (p > 0.005) {
      ctx.fillStyle = G.practice ? '#35c6ff' : '#7dff5a';
      BD.rr(ctx, bx, by, Math.max(bh, bw * p), bh, 9); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(bx + 8, by + 3, Math.max(0, bw * p - 16), 4);
    }
    ctx.font = '700 26px Fredoka, "Segoe UI", sans-serif';
    ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    var txt = Math.floor(p * 100) + '%';
    ctx.strokeText(txt, bx + bw + 16, by + bh / 2 + 1); ctx.fillStyle = '#fff'; ctx.fillText(txt, bx + bw + 16, by + bh / 2 + 1);
    // stars this run
    if (!G.practice) {
      for (var i = 0; i < L.stars; i++) {
        var got = s.stars & (1 << i), saved = (save.stars[L.id] || 0) & (1 << i);
        ctx.save(); ctx.translate(bx - 90 + i * 30, by + bh / 2);
        BD.starPath(ctx, 0, 0, 12, 5.5, 5, 0);
        ctx.fillStyle = got ? '#ffe14d' : saved ? 'rgba(159,216,255,0.5)' : 'rgba(0,0,0,0.35)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = got ? '#8a5a00' : 'rgba(255,255,255,0.4)'; ctx.stroke();
        ctx.restore();
      }
    }
    if (G.practice) drawPracticeHUD();
    ctx.direction = 'ltr';
  }

  // Practice legend (top-left): badge, then keycap rows laid out right-to-left.
  function drawKeycap(x, y, label) {
    ctx.fillStyle = '#9aa3c7'; BD.rr(ctx, x, y + 3, 30, 28, 7); ctx.fill();
    ctx.fillStyle = '#ffffff'; BD.rr(ctx, x, y, 30, 28, 7); ctx.fill();
    ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.fillStyle = '#1d2340';
    ctx.font = '700 17px Fredoka, "Segoe UI", sans-serif';
    ctx.fillText(label, x + 15, y + 15);
  }
  function drawPracticeHUD() {
    var rows = [['Z', 'ضع نقطة حفظ'], ['X', 'احذف آخر نقطة']];
    ctx.textBaseline = 'middle';
    ctx.font = '700 18px Fredoka, "Segoe UI", sans-serif';
    var w = 0;
    for (var i = 0; i < rows.length; i++) w = Math.max(w, ctx.measureText(rows[i][1]).width);
    var pw = Math.max(170, w + 30 + 10 + 24), px = 16;
    ctx.fillStyle = 'rgba(10,5,40,0.55)'; BD.rr(ctx, px, 14, pw, 34 + 10 + rows.length * 36, 17); ctx.fill();
    ctx.fillStyle = 'rgba(53,198,255,0.95)'; BD.rr(ctx, px, 14, pw, 36, 17); ctx.fill();
    ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.fillStyle = '#062a44';
    ctx.font = '700 22px Fredoka, "Segoe UI", sans-serif';
    ctx.fillText('تدريب  ◆ ' + G.cps.length, px + pw / 2, 33);
    for (i = 0; i < rows.length; i++) {
      var ry = 58 + i * 36, kx = px + pw - 12 - 30;
      drawKeycap(kx, ry, rows[i][0]);
      ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff';
      ctx.font = '700 18px Fredoka, "Segoe UI", sans-serif';
      ctx.fillText(rows[i][1], kx - 10, ry + 15);
    }
    ctx.direction = 'ltr';
  }

  function drawPopups() {
    for (var i = 0; i < G.popups.length; i++) {
      var p = G.popups[i];
      var k = p.t / p.life;
      var sc = k < 0.15 ? 0.5 + k / 0.15 * 0.7 : k < 0.25 ? 1.2 - (k - 0.15) : 1.1;
      var a = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      ctx.save(); ctx.globalAlpha = a;
      ctx.translate(W / 2, 200 - i * 10 - k * 20); ctx.scale(sc, sc); ctx.rotate(-0.04);
      ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 72px Fredoka, "Segoe UI", sans-serif';
      ctx.lineWidth = 12; ctx.strokeStyle = '#1b1033'; ctx.lineJoin = 'round';
      ctx.strokeText(p.big, 0, 0); ctx.fillStyle = p.col; ctx.fillText(p.big, 0, 0);
      if (p.small) {
        ctx.font = '700 40px Fredoka, "Segoe UI", sans-serif'; ctx.lineWidth = 9;
        ctx.strokeText(p.small, 0, 58); ctx.fillStyle = '#fff'; ctx.fillText(p.small, 0, 58);
      }
      ctx.restore();
    }
  }

  function worldText(txt, x, y, camX, gy, size, col, alpha) {
    var px = (x - camX) * U, py = gy - y * U;
    if (px < -800 || px > W + 800) return;
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.font = '700 ' + size + 'px Fredoka, "Segoe UI", sans-serif';
    ctx.direction = 'rtl'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.2; ctx.strokeStyle = 'rgba(15,6,40,0.85)';
    ctx.strokeText(txt, px, py); ctx.fillStyle = col || '#fff'; ctx.fillText(txt, px, py);
    ctx.restore();
  }

  function render(alpha) {
    var t = menuT;
    var th = curTheme();
    ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, 0, 0);
    var look = myLook();
    if (scene === 'play' && G.s) {
      var s = G.s, L = G.L;
      var songTime = (G.dead || G.paused) ? s.tick / 60 : (s.tick + (G.won ? 0 : alpha)) / 60;
      if (!G.dead && !G.paused && (!G.won || G.wonT < 4)) music.sync(G.won ? null : songTime);
      var bi = beatInfo(L.song, G.won ? songTime + G.wonT : songTime);
      var x = G.won ? G.winX : lerp(s.px, s.x, G.dead ? 1 : alpha);
      var y = G.dead ? s.y : lerp(s.py, s.y, alpha);
      var camX = Math.min(x, G.won ? G.winX : 1e9) - PLAYER_SX;
      if (G.won) camX = Math.min(G.winX, L.finishX + 2) - PLAYER_SX;
      var camY = G.camY;
      drawBackground(th, t, bi, camX, camY);
      ctx.save(); ctx.translate(shake.x, shake.y);
      var gy = GROUND0 + camY * U;
      // attempt text + signs
      worldText('المحاولة ' + G.sessionAtt, (G.attemptX || 0) + 3.5, 5.2, camX, gy, 64, '#ffffff');
      var signs = L.def.signs || [];
      for (var i = 0; i < signs.length; i++) worldText(signs[i].text, signs[i].x, signs[i].y, camX, gy, 34, signs[i].col || '#fff');
      drawLevel(L, th, camX, camY, t, bi, s, save.stars[L.id] || 0);
      // checkpoints
      if (G.practice) {
        for (var j = 0; j < G.cps.length; j++) {
          var cp = G.cps[j].s, cx = (cp.x + 0.5 - camX) * U, cy = gy - (cp.y + 0.5) * U;
          if (cx < -40 || cx > W + 40) continue;
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4);
          ctx.fillStyle = '#7dff5a'; ctx.strokeStyle = '#0a4a26'; ctx.lineWidth = 3;
          ctx.fillRect(-11, -11, 22, 22); ctx.strokeRect(-11, -11, 22, 22); ctx.restore();
        }
      }
      drawGround(th, camX, camY, bi);
      if (!G.dead) drawPlayer(s, x, y, camX, gy, G.rot, G.sqx, G.sqy, look, t);
      drawParts(camX, gy, false);
      ctx.restore();
      drawHUD(L, s, t);
    } else {
      // menu backdrop: attract mode
      var ds = demo.s || BD.newState(demoL);
      var mt = music.playing ? music.time() : menuT;
      var bi2 = beatInfo(music.playing && music.song ? music.song : menuSong, mt);
      var dx = lerp(ds.px, ds.x, alpha), dy = lerp(ds.py, ds.y, alpha);
      var camX2 = dx - (scene === 'title' ? 3.5 : 3.5);
      drawBackground(th, t, bi2, camX2, 0);
      var gy2 = GROUND0;
      ctx.save(); ctx.translate(shake.x, shake.y);
      drawLevel(demoL, th, camX2, 0, t, bi2, ds, 0);
      drawGround(th, camX2, 0, bi2);
      drawPlayer(ds, dx, dy, camX2, gy2, demo.rot || 0, demo.sqx || 1, demo.sqy || 1, look, t);
      drawParts(camX2, gy2, false);
      ctx.restore();
      if (scene === 'title') {
        var lg = document.querySelector('.logo');
        if (lg) lg.style.transform = 'rotate(-4deg) scale(' + (1 + 0.05 * bi2.pulse).toFixed(3) + ')';
        var pb = $('b-play');
        if (pb) pb.style.transform = 'scale(' + (1 + 0.05 * bi2.pulse).toFixed(3) + ')';
      }
      if (scene === 'garage') drawPreview(look, t, bi2);
    }
    drawParts(0, 0, true);
    if (G.flash > 0) { ctx.globalAlpha = Math.min(0.7, G.flash); ctx.fillStyle = G.flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    drawPopups();
  }

  var pvc = $('preview'), pctx = pvc.getContext('2d');
  function drawPreview(look, t, bi) {
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, 260, 260);
    var hop = Math.abs(Math.sin(t * Math.PI * MENU_BPM / 60 / 2)) * 40 + (G.previewHop || 0) * 30;
    pctx.fillStyle = 'rgba(0,0,0,0.35)';
    pctx.beginPath(); pctx.ellipse(130, 222, 70 - hop * 0.4, 12, 0, 0, TAU); pctx.fill();
    pctx.save(); pctx.translate(130, 150 - hop);
    pctx.rotate(Math.sin(t * 2) * 0.12);
    BD.drawCube(pctx, 130, look.face, look.c1, look.c2, G.blink > 0 ? 1 : 0);
    pctx.restore();
  }

  /* ============================================================ BOOT */
  Kit.loop(update, render);
  goTitle();

  // Debug / test hook
  window.__game = {
    get scene() { return scene; },
    get level() { return G.L ? G.L.id : null; },
    get state() { var s = G.s; return s ? { x: +s.x.toFixed(2), y: +s.y.toFixed(2), pct: G.L ? pct(s) : 0, dead: G.dead, won: G.won, mode: s.mode, grav: s.grav, stars: s.stars, attempt: G.sessionAtt, practice: G.practice, paused: G.paused, cps: G.cps.length } : null; },
    save: save,
    levels: LEVELS.map(function (L) { return { id: L.id, name: L.name, length: L.finishX, seconds: +(L.finishX / L.speed).toFixed(1) }; }),
    start: function (i, practice) { G.auto = null; startLevel(i, !!practice); },
    // replay a recorded input string ('0'/'1' per 60 Hz tick) from the start of level i
    autoplay: function (i, inputs, practice) { startLevel(i, !!practice); G.auto = inputs; },
    // jump forward to a percentage (debug only; uses a clean state at that x)
    skipTo: function (p) { if (!G.s) return; var s = G.s; s.x = G.L.finishX * p / 100; s.px = s.x; s.y = 0; s.py = 0; s.vy = 0; s.onGround = true; },
    // run n game ticks right now (debug / automated tests)
    ff: function (n) { for (var i = 0; i < n; i++) update(1 / 60); return this.state; },
    music: music
  };
})();
