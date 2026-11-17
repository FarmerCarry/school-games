/* القلم السحري (Magic Crayon: Turbo Stunt Rider) — Canvas renderer, Kit.art sprites,
 * live & pre-launch crayon input, 3 magic inks, open stages, sandbox, garage, DDA & telemetry. */
(function () {
  'use strict';
  var E = window.MCEngine, J = Kit.juice, W = E.W, H = E.H, TAU = Math.PI * 2, INK_DARK = '#0f172a';
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ui = $('ui'), clamp = Kit.clamp, dirty = true;
  var calm = function () { return Kit.motion.reduced(); };

  Kit.art.init({ canvas: canvas, mode: '2d', theme: 'day' });
  var view = Kit.fit(canvas, W, H, {
    maxDpr: 1.5,
    onResize: function (v) {
      ui.style.left = canvas.style.left; ui.style.top = canvas.style.top;
      ui.style.transform = 'scale(' + v.scale + ')'; dirty = true;
    }
  });

  var fx = Kit.particles(), shake = Kit.shake();
  var store = Kit.store('magic-crayon');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = E.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved(); return true;
  }
  var dda = Kit.dda('magic-crayon', { id: 'main', start: 0.35 });

  /* -------------------------------------- Bounded Static Kit.art Sprites -- */
  function bake(key, w, h, fn) { return Kit.art.sprite(key, w, h, fn).canvas; }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function starPath(g, cx, cy, ro, ri) {
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 === 0 ? ro : ri, a = -Math.PI / 2 + (i * Math.PI) / 5;
      if (i === 0) g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      else g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath();
  }
  function drawText(g, str, x, y, size, fill, align) {
    g.font = '700 ' + size + 'px Fredoka'; g.direction = 'rtl';
    g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = Math.max(4, size * 0.2); g.strokeStyle = INK_DARK; g.strokeText(str, x, y);
    g.fillStyle = fill || '#ffffff'; g.fillText(str, x, y);
  }

  function podSprite(idx) {
    var P = E.PODS[idx] || E.PODS[0];
    return bake('pod_' + idx, 72, 72, function (g) {
      g.translate(36, 36);
      if (idx === 4) {
        g.beginPath(); g.moveTo(-8, -18); g.lineTo(-20, -33); g.lineTo(6, -22); g.closePath();
        g.fillStyle = P.trim; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK_DARK; g.stroke();
      }
      rr(g, -31, -8, 12, 16, 4); g.fillStyle = '#475569'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK_DARK; g.stroke();
      g.beginPath(); g.arc(0, -2, 22, 0, TAU); g.fillStyle = P.body; g.fill(); g.lineWidth = 4; g.strokeStyle = INK_DARK; g.stroke();
      g.beginPath(); g.moveTo(-20, 3); g.lineTo(20, 3); g.lineWidth = 5; g.strokeStyle = P.trim; g.stroke();
      g.beginPath(); g.arc(6, -7, 10, -1.2, 0.8); g.closePath(); g.fillStyle = '#bae6fd'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK_DARK; g.stroke();
    });
  }
  function wheelSprite(idx) {
    var P = E.PODS[idx] || E.PODS[0];
    return bake('wheel_' + idx, 44, 44, function (g) {
      g.translate(22, 22);
      g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.fillStyle = P.wheel; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK_DARK; g.stroke();
      for (var i = 0; i < 6; i++) {
        var a = (i * TAU) / 6;
        g.beginPath(); g.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); g.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
        g.lineWidth = 2.5; g.strokeStyle = P.trim; g.stroke();
      }
      g.beginPath(); g.arc(0, 0, 5.5, 0, TAU); g.fillStyle = P.trim; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK_DARK; g.stroke();
    });
  }
  function starSprite() {
    return bake('star_gold', 64, 64, function (g) {
      g.translate(32, 32); starPath(g, 0, 0, 25, 11);
      g.fillStyle = '#fde047'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK_DARK; g.stroke();
      starPath(g, 0, -2, 13, 6); g.fillStyle = '#fef9c3'; g.fill();
    });
  }
  function crateSprite(kind) {
    var tnt = kind === 'tnt';
    return bake(tnt ? 'crate_tnt' : 'crate_wood', 52, 52, function (g) {
      rr(g, 6, 6, 40, 40, 8); g.fillStyle = tnt ? '#ef4444' : '#d97706'; g.fill();
      g.lineWidth = 4; g.strokeStyle = INK_DARK; g.stroke();
      if (tnt) {
        rr(g, 10, 20, 32, 12, 4); g.fillStyle = '#fde047'; g.fill();
        starPath(g, 26, 26, 9, 4); g.fillStyle = '#0f172a'; g.fill();
      } else {
        g.beginPath(); g.moveTo(11, 11); g.lineTo(41, 41); g.moveTo(41, 11); g.lineTo(11, 41);
        g.lineWidth = 3.5; g.strokeStyle = '#92400e'; g.stroke();
      }
    });
  }
  function cannonSprite() {
    return bake('cannon_body', 88, 72, function (g) {
      g.translate(38, 36); rr(g, -18, -18, 52, 36, 12);
      g.fillStyle = '#334155'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK_DARK; g.stroke();
      rr(g, 18, -15, 12, 30, 4); g.fillStyle = '#f97316'; g.fill(); g.stroke();
      g.beginPath(); g.arc(-4, 14, 12, 0, TAU); g.fillStyle = '#facc15'; g.fill(); g.stroke();
    });
  }
  function sawSprite() {
    return bake('saw_blade', 88, 88, function (g) {
      g.translate(44, 44); g.beginPath();
      for (var i = 0; i < 20; i++) {
        var r = i % 2 === 0 ? 37 : 27, a = (i * TAU) / 20;
        if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r); else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath(); g.fillStyle = '#cbd5e1'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK_DARK; g.stroke();
      g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fillStyle = '#ef4444'; g.fill(); g.stroke();
    });
  }
  function fanRotorSprite() {
    return bake('fan_rotor', 72, 72, function (g) {
      g.translate(36, 36);
      for (var i = 0; i < 4; i++) {
        g.save(); g.rotate((i * TAU) / 4); rr(g, -6, -30, 12, 26, 6);
        g.fillStyle = '#38bdf8'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK_DARK; g.stroke(); g.restore();
      }
      g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fillStyle = '#fde047'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK_DARK; g.stroke();
    });
  }
  function ringSprite() {
    return bake('ring_boost', 116, 116, function (g) {
      g.translate(58, 58); g.beginPath(); g.arc(0, 0, 46, 0, TAU);
      g.lineWidth = 13; g.strokeStyle = INK_DARK; g.stroke();
      g.lineWidth = 7; g.strokeStyle = '#f97316'; g.stroke();
      g.setLineDash([10, 10]); g.lineWidth = 4; g.strokeStyle = '#fde047'; g.stroke();
    });
  }
  function goalSprite() {
    return bake('goal_portal', 120, 120, function (g) {
      g.translate(60, 60); g.beginPath(); g.arc(0, 0, 48, 0, TAU);
      g.fillStyle = '#10b981'; g.fill(); g.lineWidth = 12; g.strokeStyle = '#ffffff'; g.stroke();
      g.setLineDash([13, 13]); g.lineWidth = 12; g.strokeStyle = INK_DARK; g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(0, 0, 54, 0, TAU); g.lineWidth = 4; g.strokeStyle = INK_DARK; g.stroke();
      starPath(g, 0, 0, 22, 10); g.fillStyle = '#fde047'; g.fill(); g.lineWidth = 3.5; g.stroke();
    });
  }
  function crayonSprite(inkIdx) {
    var C = E.INKS[inkIdx] || E.INKS[0];
    return bake('crayon_' + inkIdx, 72, 72, function (g) {
      g.translate(12, 60); g.rotate(0.62);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-9, -18); g.lineTo(9, -18); g.closePath();
      g.fillStyle = C.color; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK_DARK; g.stroke();
      rr(g, -9, -56, 18, 38, 5); g.fillStyle = C.color; g.fill(); g.stroke();
      g.fillStyle = C.hi; g.fillRect(-7, -48, 14, 6); g.fillRect(-7, -28, 14, 6);
    });
  }
  function worldBackdrop(wIdx) {
    var wd = E.WORLDS[wIdx] || E.WORLDS[0];
    return bake('bg_w' + wIdx, W, H, function (g) {
      var gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, wd.skyTop); gr.addColorStop(1, wd.skyBot);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.strokeStyle = wd.grid; g.lineWidth = 1.5; g.beginPath();
      for (var x = 64; x < W; x += 64) { g.moveTo(x, 76); g.lineTo(x, H); }
      for (var y = 112; y < H; y += 64) { g.moveTo(0, y); g.lineTo(W, y); }
      g.stroke();
      g.fillStyle = 'rgba(15, 23, 42, 0.07)'; g.beginPath();
      g.moveTo(0, H); g.lineTo(0, 560); g.quadraticCurveTo(280, 495, 580, 555);
      g.quadraticCurveTo(920, 480, W, 545); g.lineTo(W, H); g.closePath(); g.fill();
    });
  }

  /* --------------------------------------------------- Runtime Game State */
  var screen = 'title', curStage = 0, world = null, time = 0, roundOpen = false;
  var celebrate = 0, winData = null, intro = 0, drawTickCd = 0;
  var ghostStrokes = [], floats = [], trail = [], trailDist = 0, lastX = 0, lastY = 0;
  var ptr = { x: W / 2, y: H / 2, inside: false, down: false };
  var kbd = { x: 480, y: 350, active: false, drawing: false };
  var ptrBegin = null, ptrMoves = [], ptrEnd = false, ptrErase = null;
  var SCREENS = { title: 'scrTitle', map: 'scrMap', garage: 'scrGarage', pause: 'scrPause', win: 'scrWin' };

  function setScreen(name) {
    screen = name;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    dirty = true;
    if (name === 'play') { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  function say(msg) { $('live').textContent = msg; }
  function sfx(name, arg) { if (J && typeof J[name] === 'function') J[name](arg); }
  function hasCoach() { return !!(world && world.L.guide && world.strokes.length === 0 && !world.rolling && (world.P.showGuide || world.L.index === 0)); }

  function syncTierUI() {
    document.querySelectorAll('#tierRow .tier-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tier') === save.tier);
    });
  }
  function syncInkUI() {
    var activeInk = world ? world.ink : 0;
    for (var i = 0; i < 3; i++) $('ink' + i).classList.toggle('active', i === activeInk);
  }
  function syncLaunchUI() {
    if (!world) return;
    var btn = $('btnLaunch'), rolling = world.rolling, canHop = rolling && world.ball.hopAvail;
    btn.classList.toggle('rolling', rolling && canHop);
    btn.classList.toggle('spent', rolling && !canHop);
    btn.classList.toggle('ring', !rolling && world.strokes.length > 0);
    $('lblLaunch').textContent = !rolling ? 'انطلق!' : canHop ? 'دفعة!' : 'ينطلق!';
  }

  function closeRound(reason, val) {
    if (!roundOpen) return;
    roundOpen = false;
    Kit.stats.end(reason, val || 0);
  }

  function startStage(stageOrIdx, keepGhost) {
    closeRound('quit', 0);
    if (curStage !== stageOrIdx || !keepGhost) ghostStrokes = [];
    curStage = stageOrIdx;
    world = E.create(stageOrIdx, E.params(save.tier, dda.value(0, 1)));
    if (world.L.guideInk) E.setInk(world, world.L.guideInk);
    var rk = world.L.sandbox ? 'sbx_free' : 'st_' + (world.L.world + 1) + '_' + ((world.L.index % 5) + 1);
    Kit.stats.round(rk);
    roundOpen = true;
    fx.clear(); floats = []; trail = []; trailDist = 0; celebrate = 0; winData = null;
    ptr.down = false; ptrBegin = null; ptrMoves.length = 0; ptrEnd = false; ptrErase = null;
    kbd.active = false; kbd.drawing = false;
    var g = world.L.guide;
    kbd.x = g && g.length ? g[0][0] : clamp(world.ball.x + 200, 120, W - 120);
    kbd.y = g && g.length ? g[0][1] : clamp(world.ball.y + 50, 130, H - 80);
    lastX = world.ball.x; lastY = world.ball.y;
    Kit.keys.reset();
    $('sbxBar').hidden = !world.L.sandbox;
    intro = 2.0; syncInkUI(); syncLaunchUI(); setScreen('play');
    say(world.L.id + ' ' + world.L.name);
  }

  function restartStage(keepGhost) {
    if (!world) return;
    if (keepGhost && world.strokes.length) ghostStrokes = world.strokes.map(function (st) { return st.pts.slice(); });
    else if (!keepGhost) ghostStrokes = [];
    sfx('tap');
    startStage(curStage, keepGhost);
  }

  function toTitle() {
    closeRound('quit', 0);
    $('titleStars').querySelector('b').textContent = E.totalStars(save) + '/' + (E.STAGES.length * 3);
    $('titleCoins').querySelector('b').textContent = String(save.coins);
    syncTierUI(); setScreen('title');
  }

  /* --------------------------------------------------- Map & Stunt Garage */
  var stageBtns = [], garageTiles = { pod: [], trail: [] };
  function buildMap() {
    var box = $('worlds');
    E.WORLDS.forEach(function (wd, wi) {
      var row = document.createElement('div');
      row.className = 'wrow'; row.style.setProperty('--wc', wd.color);
      row.innerHTML = '<div class="wname"><i>العالم ' + (wi + 1) + '</i><b>' + wd.name + '</b></div>';
      for (var k = 0; k < E.PER_WORLD; k++) {
        (function (idx) {
          var st = E.STAGES[idx], b = document.createElement('button');
          b.type = 'button'; b.className = 'mc-btn lvl';
          b.innerHTML = '<span class="lvl-id" dir="ltr">' + st.id + '</span><span class="lvl-nm">' + st.name + '</span><span class="st">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span>';
          on(b, function () { sfx('select'); ghostStrokes = []; startStage(idx, false); });
          row.appendChild(b); stageBtns.push(b);
        })(wi * E.PER_WORLD + k);
      }
      box.appendChild(row);
    });
  }
  function refreshMap() {
    stageBtns.forEach(function (b, i) {
      var s = save.lv[i].s;
      b.querySelectorAll('.st svg').forEach(function (el, k) { el.classList.toggle('on', k < s); });
    });
    $('mapStars').querySelector('b').textContent = E.totalStars(save) + '/' + (E.STAGES.length * 3);
  }
  function toMap() { closeRound('quit', 0); refreshMap(); setScreen('map'); sfx('whoosh', 0.3); }

  function buildGarage() {
    [['pod', E.PODS, 'shelfPods'], ['trail', E.TRAILS, 'shelfTrails']].forEach(function (grp) {
      grp[1].forEach(function (item, idx) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'mc-btn tile';
        b.innerHTML = '<canvas width="136" height="120"></canvas><b>' + item.name + '</b><span class="price"><i class="coin"></i><em dir="ltr">' + item.price + '</em></span>';
        on(b, function () {
          var res = E.buy(save, grp[0], idx);
          if (!res) { sfx('error'); return; }
          persist(); sfx(res === 'bought' ? 'levelUp' : 'tap'); refreshGarage();
        });
        $(grp[2]).appendChild(b); garageTiles[grp[0]].push(b);
      });
    });
  }
  function refreshGarage() {
    ['pod', 'trail'].forEach(function (kind) {
      var isPod = kind === 'pod', list = isPod ? E.PODS : E.TRAILS;
      var own = isPod ? save.pods : save.trails, cur = isPod ? save.pod : save.trail;
      garageTiles[kind].forEach(function (b, idx) {
        var g = b.querySelector('canvas').getContext('2d');
        g.clearRect(0, 0, 136, 120);
        if (isPod) {
          g.drawImage(podSprite(idx), 32, 16, 72, 72);
          g.drawImage(wheelSprite(idx), 46, 62, 44, 44);
        } else {
          var cols = list[idx].colors;
          for (var c = 0; c < cols.length; c++) {
            g.beginPath(); g.moveTo(20, 40 + c * 12); g.quadraticCurveTo(68, 18 + c * 12, 116, 46 + c * 12);
            g.lineWidth = 8; g.lineCap = 'round'; g.strokeStyle = cols[c]; g.stroke();
          }
        }
        b.classList.toggle('own', !!own[idx]);
        b.classList.toggle('wear', cur === idx);
        b.classList.toggle('poor', !own[idx] && save.coins < list[idx].price);
        b.querySelector('.price em').textContent = cur === idx ? 'مختار' : own[idx] ? 'جاهز' : String(list[idx].price);
      });
    });
    $('garageCoins').querySelector('b').textContent = String(save.coins);
  }
  function toGarage() { closeRound('quit', 0); refreshGarage(); setScreen('garage'); sfx('select'); }

  /* --------------------------------------------------- Pause, Launch, Win */
  function finishInput() {
    if (world && world.active) E.endStroke(world);
    ptr.down = false; ptrBegin = null; ptrMoves.length = 0; ptrEnd = false; kbd.drawing = false;
  }
  function pauseGame(withSfx) {
    if (screen !== 'play') return;
    finishInput(); setScreen('pause'); if (withSfx) sfx('tap');
  }
  function resumeGame() {
    if (screen !== 'pause') return;
    sfx('select'); ptrBegin = null; ptrMoves.length = 0; ptrEnd = false; setScreen('play'); Kit.keys.reset();
  }
  function triggerLaunch() {
    if (!world || world.done || world.crashed) return;
    var wasRolling = world.rolling;
    if (E.launch(world)) { sfx(wasRolling ? 'jump' : 'whoosh', 0.55); syncLaunchUI(); dirty = true; }
  }
  function pickInk(idx) {
    if (!world) return;
    E.setInk(world, idx); syncInkUI(); sfx('tap'); dirty = true;
  }
  function undoLast() {
    if (!world || world.done) return;
    if (E.undo(world)) { sfx('pop', 0.35); syncLaunchUI(); dirty = true; } else sfx('error');
  }

  function onStageGoal() {
    var L = world.L, stars = E.calcStars(L, world.starsGot, world.inkUsed);
    var res = E.applyWin(save, L.index, stars, world.inkUsed);
    persist(); Kit.track.hit(); dda.result(E.outcome(true, stars)); closeRound('win', stars);
    ghostStrokes = [];
    winData = { stars: stars, got: world.starsGot, ink: Math.round(world.inkUsed), par: L.inkPar, coins: res.coins, best: res.best };
    celebrate = 0.72; sfx('levelUp');
    if (!calm()) {
      fx.burst(L.goal.x, L.goal.y, { count: 32, colors: ['#fde047', '#f97316', '#10b981', '#38bdf8', '#ffffff'], speed: 380, life: 0.9, size: 8, gravity: 320 });
      shake.add(4);
    }
  }
  function showWinScreen() {
    var d = winData;
    $('winTitle').textContent = d.stars === 3 ? 'قفزة أسطورية!' : d.stars === 2 ? 'سباق رائع!' : 'أحسنت الانطلاق!';
    $('winStars').querySelectorAll('svg').forEach(function (s, i) { s.classList.toggle('on', i < d.stars); });
    $('winPicked').querySelector('b').textContent = d.got + '/3';
    $('winInk').querySelector('b').textContent = d.ink + ' / ' + d.par;
    $('winCoins').querySelector('b').textContent = '+' + d.coins;
    $('winBest').hidden = !d.best;
    $('winNext').hidden = typeof curStage !== 'number' || curStage + 1 >= E.STAGES.length;
    setScreen('win');
  }

  /* ---------------------------------------------------- DOM & Input Hooks */
  function on(el, fn) {
    el.addEventListener('click', function (e) {
      e.stopPropagation(); Kit.audio.unlock(); if (e.detail > 0) el.blur(); fn(e);
    });
  }
  on($('btnPlay'), function () { sfx('select'); ghostStrokes = []; startStage(0, false); });
  on($('btnLevels'), toMap);
  on($('btnSandbox'), function () { sfx('select'); ghostStrokes = []; startStage('sandbox', false); });
  on($('btnGarage'), toGarage);
  on($('mapHome'), function () { sfx('back'); toTitle(); });
  on($('mapSandbox'), function () { sfx('select'); ghostStrokes = []; startStage('sandbox', false); });
  on($('garageBack'), function () { sfx('back'); toTitle(); });
  on($('btnPause'), function () { pauseGame(true); });
  on($('btnRetry'), function () { restartStage(true); });
  on($('btnUndo'), undoLast);
  on($('btnLaunch'), triggerLaunch);
  on($('ink0'), function () { pickInk(0); });
  on($('ink1'), function () { pickInk(1); });
  on($('ink2'), function () { pickInk(2); });
  on($('btnResume'), resumeGame);
  on($('btnRestart'), function () { restartStage(false); });
  on($('btnMap'), toMap);
  on($('winNext'), function () {
    if (typeof curStage === 'number' && curStage + 1 < E.STAGES.length) { sfx('select'); startStage(curStage + 1, false); }
    else toMap();
  });
  on($('winAgain'), function () { sfx('select'); startStage(curStage, false); });
  on($('winMap'), toMap);

  document.querySelectorAll('#tierRow .tier-btn').forEach(function (b) {
    on(b, function () { save.tier = b.getAttribute('data-tier') || 'normal'; persist(); syncTierUI(); sfx('tap'); });
  });
  document.querySelectorAll('#sbxBar [data-prop]').forEach(function (b) {
    on(b, function () {
      if (!world || !world.L.sandbox) return;
      var px = clamp(ptr.inside ? ptr.x : 640, 180, 1080), py = clamp(ptr.inside && ptr.y > 120 ? ptr.y : 420, 160, 580);
      E.addSandboxProp(world, b.getAttribute('data-prop'), px, py); sfx('pop', 0.45); dirty = true;
    });
  });
  on($('btnClearInk'), function () {
    if (world && world.L.sandbox) { world.strokes.length = 0; world.inkUsed = 0; sfx('pop', 0.4); dirty = true; }
  });

  var toLogical = function (e) { return view.toLogical(e.clientX, e.clientY); };
  var inFrame = function (p) { return p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H; };
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('pointerdown', function (e) {
    if (screen === 'play') Kit.audio.unlock();
    var p = toLogical(e);
    ptr.x = p.x; ptr.y = p.y; ptr.inside = inFrame(p); kbd.active = false;
    if (screen !== 'play' || !ptr.inside || p.y < 80) return;
    if (e.button === 2) { ptrErase = { x: p.x, y: p.y }; return; }
    if (e.button === 0) { ptr.down = true; ptrBegin = { x: p.x, y: p.y }; }
  });
  window.addEventListener('pointermove', function (e) {
    var list = e.getCoalescedEvents ? e.getCoalescedEvents() : null, evs = list && list.length ? list : [e];
    for (var i = 0; i < evs.length; i++) {
      var p = toLogical(evs[i]);
      if (ptr.down && screen === 'play' && inFrame(p)) ptrMoves.push([p.x, p.y]);
    }
    if (ptrMoves.length > 120) ptrMoves.splice(0, ptrMoves.length - 120);
    var curP = toLogical(e);
    ptr.x = curP.x; ptr.y = curP.y; ptr.inside = inFrame(curP);
    if (ptr.down && e.buttons === 0) { ptr.down = false; ptrEnd = true; }
  });
  window.addEventListener('pointerup', function (e) { if (e.button === 0 && ptr.down) { ptr.down = false; ptrEnd = true; } });
  window.addEventListener('pointercancel', function () { if (ptr.down) { ptr.down = false; ptrEnd = true; } });

  function handleKeys(dt) {
    var K = Kit.keys, go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']);
    if (screen === 'title') {
      if (go) { sfx('select'); ghostStrokes = []; startStage(0, false); }
    } else if (screen === 'map' || screen === 'garage') {
      if (K.pressed('Escape')) { sfx('back'); toTitle(); }
    } else if (screen === 'pause') {
      if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resumeGame();
      else if (K.pressed('KeyR')) restartStage(false);
    } else if (screen === 'win') {
      if (go) {
        if (typeof curStage === 'number' && curStage + 1 < E.STAGES.length) startStage(curStage + 1, false); else toMap();
      } else if (K.pressed('KeyR')) startStage(curStage, false);
      else if (K.pressed('Escape')) toMap();
    } else if (screen === 'play' && world) {
      if (K.anyPressed(['KeyP', 'Escape'])) { pauseGame(true); return; }
      if (K.pressed('KeyR') && !celebrate) { restartStage(true); return; }
      if (K.anyPressed(['Backspace', 'KeyX']) && !celebrate) { undoLast(); return; }
      if (K.anyPressed(['Digit1', 'Numpad1'])) pickInk(0);
      if (K.anyPressed(['Digit2', 'Numpad2'])) pickInk(1);
      if (K.anyPressed(['Digit3', 'Numpad3'])) pickInk(2);
      if (go && !celebrate) triggerLaunch();

      var kx = (K.anyDown(['ArrowRight', 'KeyD']) ? 1 : 0) - (K.anyDown(['ArrowLeft', 'KeyA']) ? 1 : 0);
      var ky = (K.anyDown(['ArrowDown', 'KeyS']) ? 1 : 0) - (K.anyDown(['ArrowUp', 'KeyW']) ? 1 : 0);
      var drawHold = K.anyDown(['ShiftLeft', 'ShiftRight', 'KeyZ']);
      world.input.steer = (!drawHold && world.rolling) ? kx : 0;

      if (kx || ky) {
        kbd.active = true;
        var norm = kx && ky ? 0.7071 : 1;
        kbd.x = clamp(kbd.x + kx * norm * 460 * dt, 26, W - 26);
        kbd.y = clamp(kbd.y + ky * norm * 460 * dt, 86, H - 24);
      }
      if (drawHold && !celebrate && !world.done && !world.crashed) {
        kbd.active = true;
        if (!kbd.drawing) { kbd.drawing = true; E.beginStroke(world, kbd.x, kbd.y); } else E.moveStroke(world, kbd.x, kbd.y);
      } else if (kbd.drawing) { kbd.drawing = false; E.endStroke(world); }
    }
  }

  /* ----------------------------------------------------- Events & Loop */
  function addFloat(x, y, text, color) {
    floats.push({ x: x, y: y, text: text, color: color || '#fde047', t: 0 });
    if (floats.length > 8) floats.shift();
  }
  function burst(x, y, count, colors, speed, shakeAmt) {
    if (calm()) return;
    fx.burst(x, y, { count: count, colors: colors, speed: speed || 240, life: 0.55, size: 6.5, gravity: 230 });
    if (shakeAmt) shake.add(shakeAmt);
  }
  function processEvents() {
    var evs = world.ev;
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i], t = ev.t;
      if (t === 'draw') { if (drawTickCd <= 0) { drawTickCd = 0.06; sfx('tap', 0.2); } syncLaunchUI(); }
      else if (t === 'strokeEnd') syncLaunchUI();
      else if (t === 'noInk') { sfx('error'); addFloat(clamp(ev.x, 90, W - 90), Math.max(115, ev.y - 22), 'انتهى الحبر!', '#ef4444'); }
      else if (t === 'hop') { burst(ev.x, ev.y + 12, 10, ['#f97316', '#fde047'], 200, 0); syncLaunchUI(); }
      else if (t === 'turbo') { sfx('whoosh', 0.4); burst(ev.x, ev.y, 8, ['#f97316', '#fde047', '#ffffff'], 220, 0); }
      else if (t === 'spring') { sfx('jump'); burst(ev.x, ev.y, 12, ['#10b981', '#6ee7b7', '#ffffff'], 230, 2.5); }
      else if (t === 'crate') {
        var tnt = ev.kind === 'tnt';
        sfx('impact'); addFloat(ev.x, ev.y - 20, tnt ? 'انفجار!' : '+25', tnt ? '#f97316' : '#fde047');
        burst(ev.x, ev.y, tnt ? 22 : 12, tnt ? ['#ef4444', '#f97316', '#fde047'] : ['#d97706', '#fbbf24'], tnt ? 340 : 220, tnt ? 5 : 2);
      } else if (t === 'cannon') { sfx('impact'); sfx('whoosh', 0.6); burst(ev.x, ev.y, 16, ['#fde047', '#f97316', '#e2e8f0'], 300, 4); }
      else if (t === 'ring') { sfx('whoosh', 0.55); addFloat(ev.x, ev.y - 28, 'تيربو!', '#38bdf8'); burst(ev.x, ev.y, 14, ['#38bdf8', '#fde047', '#ffffff'], 250, 0); }
      else if (t === 'wind') sfx('whoosh', 0.22);
      else if (t === 'star') { Kit.track.hit(); sfx('star', world.starsGot); addFloat(ev.x, ev.y - 22, '+1', '#fde047'); burst(ev.x, ev.y, 16, ['#fde047', '#ffffff', '#f97316'], 240, 0); }
      else if (t === 'shield') { sfx('jump'); addFloat(ev.x, ev.y - 28, 'درع الحماية!', '#fde047'); burst(ev.x, ev.y, 16, ['#fde047', '#38bdf8', '#ffffff'], 260, 0); }
      else if (t === 'crash') { sfx('pop', 0.65); dda.result(0); addFloat(ev.x, Math.min(H - 60, ev.y - 24), 'جرّب مجددًا!', '#f97316'); burst(ev.x, Math.min(H - 30, ev.y), 18, ['#f97316', '#ef4444', '#cbd5e1'], 260, 5); }
      else if (t === 'sandboxGoal') { Kit.track.hit(); sfx('levelUp'); addFloat(ev.x, ev.y - 30, 'هدف رائع!', '#10b981'); burst(ev.x, ev.y, 24, ['#fde047', '#10b981', '#38bdf8'], 320, 0); }
      else if (t === 'goal') onStageGoal();
    }
    evs.length = 0;
  }

  function update(dt) {
    if (screen === 'pause') {
      handleKeys(dt);
      ptrMoves.length = 0; ptrBegin = null; ptrEnd = false; ptrErase = null;
      Kit.keys.endFrame();
      return;
    }
    time += dt;
    if (drawTickCd > 0) drawTickCd = Math.max(0, drawTickCd - dt);
    handleKeys(dt);

    if (screen === 'play' && world) {
      if (celebrate > 0) {
        celebrate -= dt;
        if (celebrate <= 0) showWinScreen();
      } else {
        if (ptrErase) { if (E.eraseAt(world, ptrErase.x, ptrErase.y, 32)) { sfx('pop', 0.35); syncLaunchUI(); } ptrErase = null; }
        if (ptrBegin) { E.beginStroke(world, ptrBegin.x, ptrBegin.y); ptrBegin = null; }
        for (var i = 0; i < ptrMoves.length; i++) E.moveStroke(world, ptrMoves[i][0], ptrMoves[i][1]);
        ptrMoves.length = 0;
        if (ptrEnd) { E.endStroke(world); ptrEnd = false; }

        var wasCrashed = world.crashed;
        E.step(world, dt);
        if (wasCrashed && !world.crashed) syncLaunchUI();
        processEvents();
        if (intro > 0) intro = Math.max(0, intro - dt);

        if (world.rolling && !world.crashed && !calm()) {
          var b = world.ball, d = Math.hypot(b.x - lastX, b.y - lastY);
          if (d < 80) {
            trailDist += d;
            if (trailDist > 12) {
              trailDist = 0;
              trail.push({ x: b.x, y: b.y, t: 0, life: 0.34, c: trail.length % 5 });
              if (trail.length > 36) trail.shift();
            }
          }
          lastX = b.x; lastY = b.y;
        }
      }
    } else { ptrMoves.length = 0; ptrBegin = null; ptrEnd = false; ptrErase = null; }

    fx.update(dt); shake.update(dt);
    for (var fi = floats.length - 1; fi >= 0; fi--) {
      floats[fi].t += dt; if (!calm()) floats[fi].y -= dt * 36;
      if (floats[fi].t > 1.0) floats.splice(fi, 1);
    }
    for (var ti = trail.length - 1; ti >= 0; ti--) {
      trail[ti].t += dt; if (trail[ti].t >= trail[ti].life) trail.splice(ti, 1);
    }
    Kit.keys.endFrame();
  }

  /* --------------------------------------------------- Canvas Rendering */
  function drawBeam(g, ax, ay, bx, by, rad, fill) {
    var ang = Math.atan2(by - ay, bx - ax), len = Math.hypot(bx - ax, by - ay);
    g.save(); g.translate(ax, ay); g.rotate(ang);
    rr(g, -rad, -rad, len + rad * 2, rad * 2, rad);
    g.fillStyle = fill; g.fill(); g.lineWidth = 4; g.strokeStyle = INK_DARK; g.stroke();
    g.beginPath(); g.moveTo(0, -rad + 3); g.lineTo(len, -rad + 3);
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.45)'; g.stroke(); g.restore();
  }
  function drawCrayonStroke(g, st, still) {
    var pts = st.pts; if (pts.length < 2) return;
    var C = E.INKS[st.ink] || E.INKS[0], boing = (!still && st.boing > 0) ? Math.sin(st.boing * 18) * st.boing * 5 : 0;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var py = pts[i][1] + (i > 0 && i < pts.length - 1 ? boing : 0);
      if (i === 0) g.moveTo(pts[i][0], py); else g.lineTo(pts[i][0], py);
    }
    g.lineWidth = E.INK_R * 2 + 5; g.strokeStyle = INK_DARK; g.stroke();
    g.lineWidth = E.INK_R * 2 - 1; g.strokeStyle = C.color; g.stroke();
    g.setLineDash(st.ink === 1 ? [12, 8] : st.ink === 2 ? [6, 8] : [14, 12]);
    if (!still && st.ink === 1) g.lineDashOffset = -time * 90;
    g.lineWidth = 4; g.strokeStyle = C.hi; g.stroke(); g.restore();
  }
  function drawPod(g, b, still) {
    var hop = (!still && !world.rolling) ? Math.sin(time * 4) * 2 : 0;
    g.save(); g.translate(b.x, b.y - hop);
    if (!still && (b.turboT > 0 || (world.rolling && Math.hypot(b.vx, b.vy) > 260))) {
      var fl = b.turboT > 0 ? 34 : 20;
      g.beginPath(); g.moveTo(-18, -2); g.lineTo(-18 - fl, -9); g.lineTo(-14 - fl * 0.6, 0); g.lineTo(-18 - fl, 9); g.closePath();
      g.fillStyle = b.turboT > 0 ? '#f97316' : '#fbbf24'; g.fill();
    }
    if (b.shield > 0) { g.beginPath(); g.arc(0, 0, E.BALL_R + 7, 0, TAU); g.lineWidth = 3.5; g.strokeStyle = '#fde047'; g.stroke(); }
    g.drawImage(podSprite(save.pod), -36, -38, 72, 72);
    g.save(); g.translate(0, 8); g.rotate(b.ang); g.drawImage(wheelSprite(save.pod), -22, -22, 44, 44); g.restore();
    g.restore();
  }
  function drawHudMeter(g) {
    var L = world.L, wd = E.WORLDS[L.world] || E.WORLDS[0], bx = 652, by = 14, bw = 302, bh = 50;
    rr(g, bx, by, bw, bh, 25); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK_DARK; g.stroke();
    rr(g, bx + bw - 74, by + 6, 68, 38, 19); g.fillStyle = wd.color; g.fill();
    drawText(g, L.sandbox ? 'حر' : L.id, bx + bw - 40, by + 25, 20, '#ffffff');
    for (var s = 0; s < 3; s++) {
      starPath(g, bx + bw - 95 - s * 26, by + 25, 10.5, 4.8);
      g.fillStyle = world.stars[2 - s] ? '#fde047' : '#e2e8f0'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK_DARK; g.stroke();
    }
    var mx = bx + 12, my = by + 13, mw = 122, mh = 24;
    rr(g, mx, my, mw, mh, 12); g.fillStyle = '#e2e8f0'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK_DARK; g.stroke();
    var frac = L.infiniteInk ? 1 : clamp(1 - world.inkUsed / L.inkMax, 0, 1);
    if (frac > 0.01) { rr(g, mx + 2, my + 2, (mw - 4) * frac, mh - 4, 10); g.fillStyle = E.INKS[world.ink].color; g.fill(); }
    if (!L.infiniteInk) {
      var px = mx + 2 + (mw - 4) * clamp(1 - L.inkPar / L.inkMax, 0.08, 0.92);
      g.beginPath(); g.moveTo(px, my - 3); g.lineTo(px, my + mh + 3); g.lineWidth = 3; g.strokeStyle = INK_DARK; g.stroke();
    }
    if (intro > 0 && !world.rolling) {
      g.save(); g.globalAlpha = clamp(intro, 0, 1); drawText(g, L.name, 640, 114, 34, '#fde047'); g.restore();
    }
  }

  function drawWorld(g) {
    var L = world.L, still = calm(), wd = E.WORLDS[L.world] || E.WORLDS[0], i;
    g.drawImage(worldBackdrop(L.world), 0, 0, W, H);

    if (ghostStrokes.length) {
      g.save(); g.setLineDash([8, 10]); g.lineWidth = 6; g.strokeStyle = 'rgba(37,99,235,0.28)';
      for (i = 0; i < ghostStrokes.length; i++) {
        var gp = ghostStrokes[i]; g.beginPath();
        for (var j = 0; j < gp.length; j++) if (j === 0) g.moveTo(gp[j][0], gp[j][1]); else g.lineTo(gp[j][0], gp[j][1]);
        g.stroke();
      }
      g.restore();
    }
    if (hasCoach()) {
      var gi = L.guideInk || 0;
      g.save(); g.setLineDash([12, 12]); if (!still) g.lineDashOffset = -time * 40;
      g.lineWidth = 8; g.lineCap = 'round'; g.strokeStyle = E.INKS[gi].color; g.globalAlpha = 0.45;
      g.beginPath();
      for (i = 0; i < L.guide.length; i++) if (i === 0) g.moveTo(L.guide[i][0], L.guide[i][1]); else g.lineTo(L.guide[i][0], L.guide[i][1]);
      g.stroke(); g.globalAlpha = 0.88; g.setLineDash([]);
      var gt = still ? 0.5 : (time * 0.55) % 1, gp0 = L.guide[0], gp1 = L.guide[L.guide.length - 1];
      g.drawImage(crayonSprite(gi), gp0[0] + (gp1[0] - gp0[0]) * gt - 12, gp0[1] + (gp1[1] - gp0[1]) * gt - 60, 72, 72);
      g.restore();
    }

    for (i = 0; i < L.fans.length; i++) {
      var f = L.fans[i]; g.save(); rr(g, f.x, f.y, f.w, f.h, 18);
      g.fillStyle = 'rgba(56, 189, 248, 0.16)'; g.fill();
      g.setLineDash([10, 12]); g.lineWidth = 3; g.strokeStyle = 'rgba(2, 132, 199, 0.45)'; g.stroke(); g.setLineDash([]);
      g.translate(f.x + f.w / 2, f.y + f.h - 28); if (!still) g.rotate(time * 9);
      g.drawImage(fanRotorSprite(), -36, -36, 72, 72); g.restore();
    }
    for (i = 0; i < L.hazards.length; i++) {
      var hz = L.hazards[i];
      if (hz.kind === 'lava') {
        rr(g, hz.x, hz.y, hz.w, hz.h, 12); g.fillStyle = '#ef4444'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK_DARK; g.stroke();
        rr(g, hz.x + 6, hz.y + 5, hz.w - 12, 14, 7); g.fillStyle = '#fde047'; g.fill();
      } else {
        var sr = hz.r * 2.3; g.save(); g.translate(hz.x, hz.y); if (!still) g.rotate(time * 7 * world.P.hazardSpeed);
        g.drawImage(sawSprite(), -sr / 2, -sr / 2, sr, sr); g.restore();
      }
    }
    for (i = 0; i < L.walls.length; i++) drawBeam(g, L.walls[i][0], L.walls[i][1], L.walls[i][2], L.walls[i][3], E.WALL_R, wd.beam);
    for (i = 0; i < world.movers.length; i++) drawBeam(g, world.movers[i].ax, world.movers[i].ay, world.movers[i].bx, world.movers[i].by, E.WALL_R, '#38bdf8');
    for (i = 0; i < world.strokes.length; i++) drawCrayonStroke(g, world.strokes[i], still);
    for (i = 0; i < L.crates.length; i++) if (!L.crates[i].smashed) g.drawImage(crateSprite(L.crates[i].kind), L.crates[i].x - 26, L.crates[i].y - 26, 52, 52);
    for (i = 0; i < L.rings.length; i++) g.drawImage(ringSprite(), L.rings[i].x - 58, L.rings[i].y - 58, 116, 116);
    for (i = 0; i < L.cannons.length; i++) {
      g.save(); g.translate(L.cannons[i].x, L.cannons[i].y); g.rotate(L.cannons[i].ang);
      g.drawImage(cannonSprite(), -38, -36, 88, 72); g.restore();
    }
    for (i = 0; i < world.starsPos.length; i++) if (!world.stars[i]) {
      g.drawImage(starSprite(), world.starsPos[i][0] - 28, world.starsPos[i][1] - 28 + (still ? 0 : Math.sin(time * 4 + i) * 4), 56, 56);
    }
    g.save(); g.translate(L.goal.x, L.goal.y); if (!still) g.rotate(time * 1.1); g.drawImage(goalSprite(), -56, -56, 112, 112); g.restore();

    var trCols = (E.TRAILS[save.trail] || E.TRAILS[0]).colors;
    for (i = 0; i < trail.length; i++) {
      var tr = trail[i], k = 1 - tr.t / tr.life;
      g.globalAlpha = k * 0.55; g.beginPath(); g.arc(tr.x, tr.y, 9 * k + 2, 0, TAU);
      g.fillStyle = trCols[tr.c % trCols.length]; g.fill();
    }
    g.globalAlpha = 1;
    if (!world.crashed) drawPod(g, world.ball, still);

    if (screen === 'play' && !world.done && !world.crashed) {
      if (kbd.active) {
        g.beginPath(); g.arc(kbd.x, kbd.y, 7, 0, TAU); g.lineWidth = 2.5; g.strokeStyle = INK_DARK; g.stroke();
        g.drawImage(crayonSprite(world.ink), kbd.x - 12, kbd.y - 60, 72, 72);
      } else if (ptr.down && ptr.inside) g.drawImage(crayonSprite(world.ink), ptr.x - 12, ptr.y - 60, 72, 72);
    }
    fx.draw(g);
    for (i = 0; i < floats.length; i++) {
      g.globalAlpha = clamp(1 - floats[i].t, 0, 1);
      drawText(g, floats[i].text, floats[i].x, floats[i].y, 30, floats[i].color);
    }
    g.globalAlpha = 1; drawHudMeter(g);
  }

  function drawMenuBackdrop(g) {
    var still = calm();
    g.drawImage(worldBackdrop(screen === 'garage' ? 1 : 0), 0, 0, W, H);
    if (screen === 'title') {
      drawBeam(g, 90, 635, 390, 645, 9, '#f59e0b'); drawBeam(g, 890, 645, 1190, 635, 9, '#f59e0b');
      var demo = { ink: 1, boing: 0, pts: [] };
      for (var i = 0; i <= 16; i++) demo.pts.push([390 + i * 31.25, 645 - Math.sin((i / 16) * Math.PI) * 58]);
      drawCrayonStroke(g, demo, still);
      g.drawImage(goalSprite(), 1040, 535, 100, 100);
      var p = still ? 0.45 : (time * 0.35) % 1, px = 390 + p * 500, py = 645 - Math.sin(p * Math.PI) * 58 - E.BALL_R - E.INK_R;
      g.drawImage(podSprite(save.pod), px - 36, py - 38, 72, 72);
      g.drawImage(wheelSprite(save.pod), px - 22, py - 14, 44, 44);
    }
    fx.draw(g);
  }

  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    var g = view.ctx;
    g.save(); g.translate(shake.x, shake.y);
    if (world && (screen === 'play' || screen === 'pause' || screen === 'win')) drawWorld(g);
    else drawMenuBackdrop(g);
    g.restore();
  }

  /* ---------------------------------------------- Scenario & Debug Hook */
  var r1 = function (v) { return Math.round(v * 10) / 10; };
  window.__game = {
    get state() {
      var w = world;
      return {
        screen: screen, paused: screen === 'pause',
        level: curStage === 'sandbox' ? 15 : curStage, id: w ? w.L.id : '',
        sandbox: !!(w && w.L.sandbox), tier: save.tier, ddaTier: dda.tier,
        inkType: w ? w.ink : 0, coach: hasCoach(),
        time: w ? Math.round(w.t * 1000) / 1000 : 0, rolling: !!(w && w.rolling),
        strokes: w ? w.strokes.length : 0, inkUsed: w ? r1(w.inkUsed) : 0,
        inkMax: w ? w.L.inkMax : 0, inkPar: w ? w.L.inkPar : 0,
        ball: w ? { x: r1(w.ball.x), y: r1(w.ball.y), vx: r1(w.ball.vx), vy: r1(w.ball.vy) } : { x: 0, y: 0, vx: 0, vy: 0 },
        starsGot: w ? w.starsGot : 0, cratesLeft: w ? w.L.crates.filter(function (c) { return !c.smashed; }).length : 0,
        done: !!(w && w.done), crashed: !!(w && w.crashed), ghosts: ghostStrokes.length,
        stars: winData ? winData.stars : 0, trail: trail.length, fx: fx.list.length, shake: shake.power
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    point: function (x, y) { var r = canvas.getBoundingClientRect(); return { x: r.left + x * view.scale, y: r.top + y * view.scale }; },
    get guide() { return world && world.L.guide ? world.L.guide.slice() : []; }
  };

  buildMap(); buildGarage(); Kit.muteButton();
  Kit.lifecycle({ pause: function () { pauseGame(false); }, reset: function () { finishInput(); } });
  toTitle(); Kit.loop(update, render); Kit.ready();
})();
