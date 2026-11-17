/* مقلاع الألوان — Mega Paint-Cannon & Toppling Forts (Canvas + Kit.art + Kit.juice) */
(function () {
  'use strict';

  var E = window.SCEngine, Kit = window.Kit, art = Kit.art, juice = Kit.juice;
  var canvas = document.getElementById('game'), ui = document.getElementById('ui');

  art.init({ canvas: canvas, mode: '2d', theme: 'day' });
  var dirty = true, drawCount = 0;
  var view = Kit.fit(canvas, E.W, E.H, { maxDpr: 1.5, onResize: syncUi });
  var ctx = view.ctx;

  function syncUi(v) {
    v = v || view;
    if (!v || !ui) return;
    ui.style.left = canvas.style.left;
    ui.style.top = canvas.style.top;
    ui.style.transform = 'scale(' + v.scale + ')';
    dirty = true;
  }
  syncUi(view);

  Kit.muteButton();
  var store = Kit.store('splat-catapult');
  var dda = Kit.dda('splat-catapult', { id: 'main', start: 0.35 });
  var save = E.loadSave(store.get('save', null));
  var saveState = Kit.saveStatus({ retry: persist });

  function persist() {
    if (store.set('save', save)) { saveState.saved(); return true; }
    saveState.failed();
    return false;
  }

  /* --------------------------------------------------------- DOM Elements */
  function $(id) { return document.getElementById(id); }
  var scrTitle = $('scrTitle'), scrMap = $('scrMap'), scrPause = $('scrPause'), scrResult = $('scrResult'), scrShop = $('scrShop'), hud = $('hud');
  var liveEl = $('live'), worldsEl = $('worlds'), shelfLaunchers = $('shelfLaunchers'), shelfPalettes = $('shelfPalettes');
  var screen = 'title', prevScreen = 'title', world = E.createStage(0, E.params(save.diff, 0.35));
  var cam = { x: 640, zoom: 1 }, slingSpring = art.spring(240, 13), fx = art.fx(420);
  var trail = [], blasts = [], turnBanner = { text: '', t: 0 }, goblinBlinks = [{}, {}, {}, {}, {}, {}];
  var dragging = false, dragAnchor = { x: 0, y: 0 }, dragMoved = false, dragDist = 0, lastStretchBucket = -1;

  function announce(msg) { if (liveEl) liveEl.textContent = msg; }
  function activePalette() { return (E.PALETTES[save.palette] || E.PALETTES[0]).colors; }
  function pickColor(fallback, i) {
    var pal = activePalette();
    return save.palette > 0 ? pal[(i == null ? (art.rand() * pal.length) | 0 : i) % pal.length] : (fallback || pal[0]);
  }

  /* --------------------------------------------------- Bounded Kit.art Sprites */
  function getGoblinSprite(boss, blink) {
    var key = (boss ? 'gob_boss_' : 'gob_norm_') + (blink ? '1' : '0');
    var sz = boss ? 72 : 46;
    return art.sprite(key, sz, sz, function (c, w, h) {
      var cx = w / 2, cy = h / 2 + 2, r = boss ? 29 : 19;
      // Pointy robo-goblin ears
      c.beginPath();
      c.moveTo(cx - r * 0.7, cy - r * 0.2); c.lineTo(cx - r * 1.28, cy - r * 0.85); c.lineTo(cx - r * 0.3, cy - r * 0.75);
      c.moveTo(cx + r * 0.7, cy - r * 0.2); c.lineTo(cx + r * 1.28, cy - r * 0.85); c.lineTo(cx + r * 0.3, cy - r * 0.75);
      art.outlined(c, boss ? '#5c667d' : '#7b869c', 2.6);
      if (boss) {
        c.beginPath();
        c.moveTo(cx - 16, cy - r + 2); c.lineTo(cx - 20, cy - r - 12); c.lineTo(cx - 7, cy - r - 5);
        c.lineTo(cx, cy - r - 15); c.lineTo(cx + 7, cy - r - 5); c.lineTo(cx + 20, cy - r - 12); c.lineTo(cx + 16, cy - r + 2);
        c.closePath();
        art.outlined(c, '#ffd23f', 2.5);
      }
      // Body
      c.beginPath(); c.arc(cx, cy, r, 0, 6.2832);
      art.outlined(c, boss ? '#646f89' : '#8a95ab', 3);
      // Belly plate / visor
      art.round(c, cx - r * 0.68, cy - r * 0.36, r * 1.36, r * 0.56, 6);
      art.outlined(c, '#232942', 2.2);
      if (!blink) {
        c.fillStyle = boss ? '#ff3877' : '#ffe033';
        c.beginPath(); c.arc(cx - r * 0.32, cy - r * 0.08, boss ? 5.5 : 4, 0, 6.2832); c.arc(cx + r * 0.32, cy - r * 0.08, boss ? 5.5 : 4, 0, 6.2832); c.fill();
      } else {
        c.strokeStyle = '#ffe033'; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(cx - r * 0.5, cy - r * 0.08); c.lineTo(cx - r * 0.14, cy - r * 0.08);
        c.moveTo(cx + r * 0.14, cy - r * 0.08); c.lineTo(cx + r * 0.5, cy - r * 0.08); c.stroke();
      }
      // Grumpy brow & mechanical grin
      c.strokeStyle = '#1b1640'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx - r * 0.56, cy - r * 0.36); c.lineTo(cx, cy - r * 0.18); c.lineTo(cx + r * 0.56, cy - r * 0.36); c.stroke();
      art.round(c, cx - r * 0.42, cy + r * 0.3, r * 0.84, r * 0.28, 4);
      art.outlined(c, '#e2e8f0', 2);
    }, { pad: 6 });
  }

  function getTntSprite() {
    return art.sprite('tnt_barrel', 40, 48, function (c, w, h) {
      art.round(c, 3, 5, w - 6, h - 7, 7);
      art.outlined(c, '#ff2e55', 3);
      c.fillStyle = '#ffe033'; c.fillRect(5, 18, w - 10, 12);
      c.strokeStyle = '#1b1640'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(4, 18); c.lineTo(w - 4, 18); c.moveTo(4, 30); c.lineTo(w - 4, 30); c.stroke();
      c.fillStyle = '#1b1640'; c.font = '900 11px Fredoka'; c.textAlign = 'center'; c.fillText('طلاء', w / 2, 28);
      c.strokeStyle = '#ffe033'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(w / 2, 5); c.quadraticCurveTo(w / 2 + 7, 0, w / 2 + 11, 3); c.stroke();
    }, { pad: 6 });
  }

  function getBoulderSprite(worldIdx) {
    var icy = worldIdx === 1;
    return art.sprite(icy ? 'boulder_ice' : 'boulder_rock', 62, 62, function (c, w, h) {
      var cx = w / 2, cy = h / 2, r = 27;
      art.blob(c, cx, cy, r, 0.05, 1.2);
      art.outlined(c, icy ? '#b8f2ff' : '#8d7b88', 3);
      c.fillStyle = icy ? '#ffffff' : '#ff7b3a';
      c.beginPath(); c.arc(cx - 8, cy - 8, 7, 0, 6.2832); c.arc(cx + 9, cy + 7, 4.5, 0, 6.2832); c.fill();
    }, { pad: 6 });
  }

  function getProjSprite(type) {
    var def = E.PROJECTILES[type] || E.PROJECTILES.bomb, sz = def.r * 2 + 8;
    return art.sprite('proj_' + def.id, sz, sz, function (c, w, h) {
      var cx = w / 2, cy = h / 2, r = def.r;
      if (def.id === 'saw') {
        c.beginPath();
        for (var i = 0; i < 16; i++) {
          var a = (i / 16) * 6.2832, rad = i % 2 ? r * 0.74 : r * 1.08;
          if (i) c.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); else c.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        }
        c.closePath(); art.outlined(c, def.color, 2.6);
        c.beginPath(); c.arc(cx, cy, r * 0.38, 0, 6.2832); art.outlined(c, def.accent, 2.2);
      } else if (def.id === 'drill') {
        c.beginPath();
        c.moveTo(cx + r * 1.2, cy); c.lineTo(cx - r * 0.85, cy - r * 0.8); c.lineTo(cx - r * 0.55, cy); c.lineTo(cx - r * 0.85, cy + r * 0.8);
        c.closePath(); art.outlined(c, def.color, 2.8);
        c.fillStyle = def.accent; c.beginPath(); c.arc(cx + 2, cy, 4.5, 0, 6.2832); c.fill();
      } else if (def.id === 'melon') {
        c.beginPath(); c.arc(cx, cy, r, 0, 6.2832); art.outlined(c, '#2ec44d', 3);
        c.beginPath(); c.arc(cx, cy, r * 0.72, 0, 6.2832); c.fillStyle = '#ff3b5c'; c.fill();
        c.fillStyle = '#1b1640'; c.fillRect(cx - 6, cy - 4, 3, 5); c.fillRect(cx + 4, cy - 3, 3, 5); c.fillRect(cx - 1, cy + 4, 3, 5);
      } else {
        c.beginPath(); c.arc(cx, cy, r, 0, 6.2832); art.outlined(c, def.color, 3);
        c.fillStyle = def.accent; c.beginPath(); c.arc(cx - r * 0.28, cy - r * 0.28, r * 0.32, 0, 6.2832); c.fill();
        if (def.id === 'cluster') {
          c.fillStyle = '#ff3877'; c.beginPath(); c.arc(cx + 5, cy + 4, 4, 0, 6.2832); c.fill();
          c.fillStyle = '#ffe033'; c.beginPath(); c.arc(cx - 5, cy + 5, 4, 0, 6.2832); c.fill();
        }
      }
    }, { pad: 6 });
  }

  /* --------------------------------------------------- Camera & Coordinates */
  function worldToLogical(wx, wy) {
    return { x: 640 + (wx - cam.x) * cam.zoom, y: E.H + (wy - E.H) * cam.zoom };
  }
  function worldToClient(wx, wy) {
    var l = worldToLogical(wx, wy), r = canvas.getBoundingClientRect();
    return { x: r.left + l.x * view.scale, y: r.top + l.y * view.scale };
  }

  function updateCamera(dt, snap) {
    if (!world) return;
    var tx = 640, tz = 1;
    if (world.mode === 'duel') {
      if (Kit.motion.reduced()) { tx = world.width / 2; tz = E.W / world.width; }
      else if (world.phase === 'flight' && world.projectiles.length) {
        var lp = world.projectiles[0];
        for (var i = 0; i < world.projectiles.length; i++) if (world.projectiles[i].alive) { lp = world.projectiles[i]; break; }
        tz = 0.74; tx = lp.x + lp.vx * 0.16;
      } else if (world.phase === 'settle' || world.phase === 'win') {
        tz = 0.82; tx = world.turn === 1 ? world.width - 260 : 260;
      } else {
        var sl = E.activeSling(world), dir = E.aimDir(world);
        tz = dragging ? 0.68 : 0.76; tx = sl.x + dir * (dragging ? 340 : 210);
      }
    } else if (!Kit.motion.reduced() && (world.phase === 'settle' || world.phase === 'win')) {
      tz = 1.05; tx = 860;
    }
    var hw = 640 / tz;
    tx = hw * 2 >= world.width ? world.width / 2 : Kit.clamp(tx, hw, world.width - hw);
    if (snap || Kit.motion.reduced()) { cam.x = tx; cam.zoom = tz; }
    else { var k = Math.min(1, dt * 6.5); cam.x = Kit.lerp(cam.x, tx, k); cam.zoom = Kit.lerp(cam.zoom, tz, k); }
  }

  /* --------------------------------------------------- Screens & Rounds */
  function syncHeaderChips() {
    var st = E.totalStars(save) + '/48', cn = Kit.fmt(save.coins);
    $('titleStars').querySelector('b').textContent = st;
    $('mapStars').querySelector('b').textContent = st;
    $('titleCoins').querySelector('b').textContent = cn;
    $('shopCoins').querySelector('b').textContent = cn;
    ['easy', 'mid', 'hero'].forEach(function (d) {
      var el = $('diff' + d.charAt(0).toUpperCase() + d.slice(1));
      if (el) el.classList.toggle('active', save.diff === d);
    });
  }

  function showScreen(next) {
    screen = next;
    scrTitle.hidden = next !== 'title';
    scrMap.hidden = next !== 'map';
    scrPause.hidden = next !== 'pause';
    scrResult.hidden = next !== 'result';
    scrShop.hidden = next !== 'shop';
    hud.hidden = next !== 'play';
    syncHeaderChips();
    dirty = true;
  }

  function beginRoundStats() {
    var roundKey = world.mode === 'duel' ? 'sc_duel' : 'sc_' + ((world.stageIndex >> 2) + 1) + '_' + ((world.stageIndex & 3) + 1);
    Kit.stats.round(roundKey);
  }

  function startStage(idx) {
    Kit.stats.end('quit', world ? Math.round(world.score) : 0);
    var P = E.params(save.diff, dda.level);
    world = E.createStage(idx, P);
    art.init({ canvas: canvas, mode: '2d', theme: E.WORLDS[world.world].theme });
    trail.length = 0; blasts.length = 0; dragging = false; turnBanner.t = 0;
    updateCamera(0, true);
    showScreen('play');
    beginRoundStats();
    announce('المرحلة ' + world.id + ': ' + world.name);
  }

  function startDuel() {
    Kit.stats.end('quit', world ? Math.round(world.score) : 0);
    world = E.createDuel(save.diff);
    art.init({ canvas: canvas, mode: '2d', theme: 'day' });
    trail.length = 0; blasts.length = 0; dragging = false;
    turnBanner = { text: 'دور اللاعب 1!', t: 1.4 };
    updateCamera(0, true);
    showScreen('play');
    beginRoundStats();
    announce('مبارزة القلعتين — دور اللاعب 1');
  }

  function openPause() {
    if (screen !== 'play') return;
    dragging = false;
    showScreen('pause');
    announce('استراحة');
  }

  function resumePlay() {
    if (screen !== 'pause') return;
    showScreen('play');
    announce('متابعة اللعب');
  }

  function restartRound() {
    if (!world) return;
    juice.select();
    if (world.mode === 'duel') startDuel(); else startStage(world.stageIndex);
  }

  function finishRound(won, ev) {
    dragging = false;
    var isDuel = world.mode === 'duel';
    $('resStars').hidden = isDuel || !won;
    $('resDuel').hidden = !isDuel;
    $('resBest').hidden = true;
    if (isDuel) {
      $('resTitle').textContent = 'حُسمت المبارزة!';
      $('resDuelText').textContent = 'فاز اللاعب ' + world.winner + '!';
      $('resScore').textContent = Kit.fmt(world.score);
      $('resShots').textContent = String(world.shots);
      $('resCoins').textContent = '+0';
      $('resNext').hidden = true;
      Kit.stats.end('end', Math.round(world.score));
      juice.levelUp();
    } else if (won) {
      var stars = (ev && ev.stars) || E.calcStars(world);
      var r = E.applyResult(save, world.stageIndex, stars, world.score);
      persist();
      dda.result(stars === 3 ? 1 : stars === 2 ? 0.78 : 0.55);
      Kit.stats.end('win', Math.round(world.score));
      $('resTitle').textContent = stars === 3 ? 'تدمير أسطوري!' : 'انتصار ملوّن!';
      $('resBest').hidden = !r.newBest;
      var svgs = $('resStars').querySelectorAll('svg');
      for (var i = 0; i < svgs.length; i++) svgs[i].classList.toggle('on', i < stars);
      $('resScore').textContent = Kit.fmt(world.score);
      $('resShots').textContent = String(world.shots);
      $('resCoins').textContent = '+' + r.earned;
      $('resNext').hidden = world.stageIndex >= E.STAGES.length - 1;
      juice.levelUp();
      for (var s = 1; s <= stars; s++) juice.star(s);
    } else {
      dda.result(0);
      Kit.stats.end('lose', Math.round(world.score));
      $('resTitle').textContent = 'نفدت القذائف — جرّب مجدداً!';
      $('resScore').textContent = Kit.fmt(world.score);
      $('resShots').textContent = String(world.shots);
      $('resCoins').textContent = '+0';
      $('resNext').hidden = true;
      juice.fail();
    }
    showScreen('result');
  }

  /* --------------------------------------------------- Map & Workshop */
  function renderMap() {
    worldsEl.innerHTML = '';
    for (var wIdx = 0; wIdx < E.WORLDS.length; wIdx++) {
      var wd = E.WORLDS[wIdx], box = document.createElement('div');
      box.className = 'world-box';
      box.innerHTML = '<div class="world-head"><span class="world-title">' + (wIdx + 1) + '. ' + wd.name + '</span><span class="world-sub">' + wd.sub + '</span></div><div class="world-levels"></div>';
      var grid = box.querySelector('.world-levels');
      for (var s = 0; s < 4; s++) {
        var idx = wIdx * 4 + s, st = E.STAGES[idx], rec = save.lv[idx] || { s: 0 };
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'lvl'; btn.dataset.stage = String(idx);
        btn.setAttribute('aria-label', 'المرحلة ' + st.id + ' ' + st.name);
        var starsHtml = '';
        for (var k = 0; k < 3; k++) starsHtml += '<svg class="' + (k < rec.s ? 'on' : '') + '" aria-hidden="true"><use href="#i-star"/></svg>';
        btn.innerHTML = '<span class="lvl-num" dir="ltr">' + st.id + '</span><span class="lvl-name">' + st.name + '</span><span class="lvl-stars">' + starsHtml + '</span>';
        btn.addEventListener('click', (function (stageIdx) {
          return function () { juice.select(); startStage(stageIdx); };
        })(idx));
        grid.appendChild(btn);
      }
      worldsEl.appendChild(box);
    }
  }

  function renderShop() {
    syncHeaderChips();
    shelfLaunchers.innerHTML = '';
    E.LAUNCHERS.forEach(function (ln, i) {
      var owned = !!save.launchers[i], eq = save.launcher === i, b = document.createElement('button');
      b.type = 'button'; b.className = 'tile' + (eq ? ' active' : '');
      b.dataset.launcher = String(i);
      var tag = eq ? 'مُجهّز' : owned ? 'اختيار' : ln.price + ' عملة';
      b.innerHTML = '<div class="tile-swatches"><span class="tile-dot" style="background:' + ln.body + '"></span><span class="tile-dot" style="background:' + ln.trim + '"></span><span class="tile-dot" style="background:' + ln.glow + '"></span></div>' +
        '<span class="tile-name">' + ln.name + '</span><span class="tile-sub">' + ln.desc + '</span><span class="tile-tag">' + tag + '</span>';
      b.addEventListener('click', function () {
        var r = E.buyItem(save, 'launcher', i);
        if (!r) { juice.error(); return; }
        if (r === 'bought') juice.coin(3); else juice.select();
        persist(); renderShop();
      });
      shelfLaunchers.appendChild(b);
    });
    shelfPalettes.innerHTML = '';
    E.PALETTES.forEach(function (pl, i) {
      var owned = !!save.palettes[i], eq = save.palette === i, b = document.createElement('button');
      b.type = 'button'; b.className = 'tile' + (eq ? ' active' : '');
      b.dataset.palette = String(i);
      var dots = pl.colors.slice(0, 4).map(function (c) { return '<span class="tile-dot" style="background:' + c + '"></span>'; }).join('');
      var tag = eq ? 'مُفعّل' : owned ? 'اختيار' : pl.price + ' عملة';
      b.innerHTML = '<div class="tile-swatches">' + dots + '</div><span class="tile-name">' + pl.name + '</span><span class="tile-tag">' + tag + '</span>';
      b.addEventListener('click', function () {
        var r = E.buyItem(save, 'palette', i);
        if (!r) { juice.error(); return; }
        if (r === 'bought') juice.coin(2); else juice.select();
        persist(); renderShop();
      });
      shelfPalettes.appendChild(b);
    });
  }

  /* --------------------------------------------------- Gameplay Actions & Input */
  function launchShot() {
    if (!world || world.phase !== 'aim') return;
    if (E.fire(world)) { trail.length = 0; dirty = true; }
  }

  function triggerSpecial() {
    if (!world || world.phase !== 'flight') return;
    if (E.activateSpecial(world)) dirty = true;
  }

  function doSwap() {
    if (!world || world.phase !== 'aim') return;
    if (E.swapProjectile(world)) { juice.tap(); dirty = true; }
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (e.button === 2 || screen !== 'play' || !world) return;
    if (world.phase === 'flight') { triggerSpecial(); return; }
    if (world.phase !== 'aim') return;
    var pt = view.toLogical(e.clientX, e.clientY);
    var sl = E.activeSling(world), slL = worldToLogical(sl.x, sl.y - 12);
    dragAnchor = Math.hypot(pt.x - slL.x, pt.y - slL.y) < 70 ? slL : pt;
    dragging = true; dragMoved = false; dragDist = 0; lastStretchBucket = -1;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    dirty = true;
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!dragging || screen !== 'play' || !world || world.phase !== 'aim') return;
    var pt = view.toLogical(e.clientX, e.clientY), dir = E.aimDir(world);
    var pf = (dragAnchor.x - pt.x) * dir, pu = pt.y - dragAnchor.y;
    var d = Math.hypot(pf, pu);
    dragDist = d;
    if (d < 8) return;
    dragMoved = true;
    if (pf < -14) { pf = -pf; pu = -pu; }
    var ang = Math.atan2(pu, Math.max(8, pf)), pwr = Kit.clamp(d / 150, 0.24, 1);
    E.setAim(world, ang, pwr);
    var bucket = (pwr * 5) | 0;
    if (bucket !== lastStretchBucket) { lastStretchBucket = bucket; juice.tap(); }
    dirty = true;
  });

  function endDrag() {
    if (!dragging) return;
    var shouldFire = screen === 'play' && world && world.phase === 'aim' && dragMoved && dragDist >= 14;
    dragging = false;
    if (shouldFire) launchShot();
    dirty = true;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', function () { dragging = false; dirty = true; });

  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    if (screen === 'play') {
      if (e.code === 'Escape' || e.code === 'KeyP') { openPause(); return; }
      if (e.code === 'KeyR') { restartRound(); return; }
      if (e.code === 'KeyC') { doSwap(); return; }
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (world.phase === 'aim') launchShot();
        else if (world.phase === 'flight') triggerSpecial();
      }
    } else if (screen === 'pause') {
      if (e.code === 'Escape' || e.code === 'KeyP') resumePlay();
      else if (e.code === 'KeyR') restartRound();
    } else if (screen === 'result') {
      if (e.code === 'KeyR') $('resAgain').click();
      else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); ($('resNext').hidden ? $('resAgain') : $('resNext')).click(); }
    } else if ((screen === 'map' || screen === 'shop') && e.code === 'Escape') {
      juice.back(); showScreen(prevScreen || 'title');
    }
  });

  /* UI Button Bindings */
  ['easy', 'mid', 'hero'].forEach(function (d) {
    var btn = $('diff' + d.charAt(0).toUpperCase() + d.slice(1));
    btn.addEventListener('click', function () {
      save.diff = d; persist(); syncHeaderChips(); juice.toggle(true);
      world = E.createStage(0, E.params(save.diff, dda.level)); dirty = true;
    });
  });
  $('btnPlay').addEventListener('click', function () { juice.select(); startStage(0); });
  $('btnDuel').addEventListener('click', function () { juice.select(); startDuel(); });
  $('btnLevels').addEventListener('click', function () { prevScreen = 'title'; juice.select(); renderMap(); showScreen('map'); });
  $('btnShop').addEventListener('click', function () { prevScreen = 'title'; juice.select(); renderShop(); showScreen('shop'); });
  $('mapHome').addEventListener('click', function () { juice.back(); showScreen(prevScreen === 'pause' ? 'pause' : 'title'); });
  $('shopBack').addEventListener('click', function () { juice.back(); showScreen('title'); });
  $('btnPause').addEventListener('click', function () { juice.tap(); openPause(); });
  $('btnSwap').addEventListener('click', doSwap);
  $('btnResume').addEventListener('click', function () { juice.select(); resumePlay(); });
  $('btnRestart').addEventListener('click', restartRound);
  $('btnMap').addEventListener('click', function () { prevScreen = 'pause'; juice.select(); renderMap(); showScreen('map'); });
  $('btnPauseHome').addEventListener('click', function () {
    Kit.stats.end('quit', world ? Math.round(world.score) : 0);
    juice.back(); world = E.createStage(0, E.params(save.diff, dda.level)); updateCamera(0, true); showScreen('title');
  });
  $('resNext').addEventListener('click', function () { juice.select(); startStage(Math.min(E.STAGES.length - 1, world.stageIndex + 1)); });
  $('resAgain').addEventListener('click', restartRound);
  $('resMap').addEventListener('click', function () { prevScreen = 'title'; juice.select(); renderMap(); showScreen('map'); });

  Kit.lifecycle({ pause: function () { if (screen === 'play') openPause(); } });

  /* --------------------------------------------------- Events & Simulation */
  function paintBurst(x, y, col, n) {
    var c = pickColor(col);
    fx.burst(x, y, { n: n, color: c, speed: 250, size: 9, life: 0.65 });
    fx.burst(x, y, { n: Math.max(4, n >> 1), color: '#ffe033', speed: 190, size: 7, shape: 'star', life: 0.55 });
  }

  function drainEvents() {
    while (world.ev.length) {
      var ev = world.ev.shift();
      if (ev.t === 'launch') { juice.whoosh(ev.power); slingSpring.kick(-3.2); }
      else if (ev.t === 'special') {
        juice.select(); paintBurst(ev.x, ev.y, ev.color, 18);
        art.pop('قوة خارقة!', ev.x, ev.y - 26, { color: '#ffe033', size: 24 });
      } else if (ev.t === 'portal') {
        juice.chime(2); paintBurst(ev.x1, ev.y1, ev.color, 10); paintBurst(ev.x2, ev.y2, ev.color, 14);
      } else if (ev.t === 'geyser') {
        juice.jump(0.85); fx.burst(ev.x, ev.y, { n: 14, color: '#ffffff', speed: 240, size: 11, shape: 'smoke' });
      } else if (ev.t === 'slice') { juice.pop(0.3); paintBurst(ev.x, ev.y, ev.color, 9); }
      else if (ev.t === 'bounce') { juice.impact(0.65); art.shake.add(0.2); paintBurst(ev.x, ev.y, ev.color, 16); blasts.push({ x: ev.x, y: ev.y, r: 90, t: 0.28, color: pickColor(ev.color) }); }
      else if (ev.t === 'impact') {
        juice.impact(ev.slammed ? 0.95 : 0.6); art.shake.add(ev.slammed ? 0.34 : 0.16);
        paintBurst(ev.x, ev.y, ev.color, ev.slammed ? 26 : 16);
        blasts.push({ x: ev.x, y: ev.y, r: ev.r, t: 0.28, color: pickColor(ev.color) });
      } else if (ev.t === 'smash') {
        juice.tap(); paintBurst(ev.x, ev.y, ev.color, 10);
        art.pop('+' + ev.pts, ev.x, ev.y - 10, { color: '#ffffff', size: 20 });
      } else if (ev.t === 'boom') {
        juice.impact(1); juice.streak(3); art.shake.add(0.46); art.hitstop(42); art.flash(pickColor(ev.color), 130);
        paintBurst(ev.x, ev.y, ev.color, 34); blasts.push({ x: ev.x, y: ev.y, r: ev.r, t: 0.36, color: pickColor(ev.color) });
        art.pop('انفجار! +' + ev.pts, ev.x, ev.y - 24, { color: '#ffe033', size: 28 });
      } else if (ev.t === 'goblinHit') { juice.pop(0.45); paintBurst(ev.x, ev.y, ev.color, 8); }
      else if (ev.t === 'goblinPop') {
        juice.pop(0.85); juice.streak(Math.min(8, ev.combo + 1)); art.shake.add(ev.boss ? 0.4 : 0.18);
        paintBurst(ev.x, ev.y, ev.color, ev.boss ? 30 : 20);
        art.pop((ev.boss ? 'سحق الزعيم! +' : '+') + ev.pts, ev.x, ev.y - 20, { color: '#5ef38c', size: ev.boss ? 30 : 24 });
      } else if (ev.t === 'shotEnd') {
        if (ev.hitTarget) Kit.track.hit(); else if (!ev.hitAny) Kit.track.miss();
      } else if (ev.t === 'turn') {
        juice.select(); turnBanner = { text: 'دور اللاعب ' + ev.turn + '!', t: 1.5 }; announce(turnBanner.text);
      } else if (ev.t === 'win') { finishRound(true, ev); return; }
      else if (ev.t === 'lose') { finishRound(false, ev); return; }
    }
  }

  function update(dt) {
    if (screen === 'pause') { Kit.keys.endFrame(); return; }
    if (screen === 'play' && world) {
      if (world.phase === 'aim' && !dragging) {
        var up = Kit.keys.anyDown(['ArrowUp', 'KeyW']), dn = Kit.keys.anyDown(['ArrowDown', 'KeyS']);
        var rt = Kit.keys.anyDown(['ArrowRight', 'KeyD']), lt = Kit.keys.anyDown(['ArrowLeft', 'KeyA']);
        if (up !== dn) E.setAim(world, world.aimAngle + (up ? 1 : -1) * 1.15 * dt, world.aimPower);
        if (rt !== lt) E.setAim(world, world.aimAngle, world.aimPower + (rt ? 1 : -1) * E.aimDir(world) * 0.85 * dt);
      }
      E.step(world, dt);
      drainEvents();
      if (world.phase === 'flight' && !Kit.motion.reduced()) {
        for (var i = 0; i < world.projectiles.length; i++) {
          var p = world.projectiles[i];
          if (p.alive) trail.push({ x: p.x, y: p.y, r: p.r * 0.45, color: pickColor(p.color, i), a: 0.85 });
        }
        if (trail.length > 90) trail.splice(0, trail.length - 90);
      }
      for (var ti = trail.length - 1; ti >= 0; ti--) { trail[ti].a -= dt * 1.3; if (trail[ti].a <= 0) trail.splice(ti, 1); }
      for (var bi = blasts.length - 1; bi >= 0; bi--) { blasts[bi].t -= dt; if (blasts[bi].t <= 0) blasts.splice(bi, 1); }
      if (turnBanner.t > 0) turnBanner.t = Math.max(0, turnBanner.t - dt);
      updateCamera(dt, false);
      slingSpring.update(dt); fx.update(dt); art.pop.update(dt); art.shake.update(dt); art.flash.update(dt);
      dirty = true;
    }
    Kit.keys.endFrame();
  }

  /* --------------------------------------------------- Rendering */
  function drawSling(sl, dir, isActive) {
    var ln = E.LAUNCHERS[save.launcher] || E.LAUNCHERS[0];
    var bx = sl.x, by = world.groundY, px = sl.x, py = sl.y - 12;
    if (isActive && world.phase === 'aim') {
      var pull = 20 + world.aimPower * 44;
      px = sl.x - Math.cos(world.aimAngle) * pull * dir;
      py = sl.y - 12 + Math.sin(world.aimAngle) * pull;
    }
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(slingSpring.sx, slingSpring.sy);
    ctx.translate(-bx, -by);
    // Back elastic band
    if (isActive && world.phase === 'aim' && world.queue.length) {
      ctx.strokeStyle = '#3b1c32'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(sl.x - 14 * dir, sl.y - 18); ctx.lineTo(px, py); ctx.stroke();
    }
    // Base pedestal & Y-fork
    art.round(ctx, bx - 34, by - 22, 68, 22, 8); art.outlined(ctx, '#475569', 3);
    ctx.beginPath();
    ctx.moveTo(bx - 13, by - 18); ctx.lineTo(bx - 10, sl.y + 8); ctx.lineTo(bx - 24, sl.y - 24);
    ctx.lineTo(bx - 12, sl.y - 24); ctx.lineTo(bx, sl.y - 2); ctx.lineTo(bx + 12, sl.y - 24);
    ctx.lineTo(bx + 24, sl.y - 24); ctx.lineTo(bx + 10, sl.y + 8); ctx.lineTo(bx + 13, by - 18);
    ctx.closePath(); art.outlined(ctx, ln.body, 3.2);
    ctx.fillStyle = ln.trim; ctx.beginPath(); ctx.arc(bx, sl.y + 8, 9, 0, 6.2832); ctx.fill();
    // Loaded projectile & front band
    if (isActive && world.phase === 'aim' && world.queue.length) {
      art.blit(ctx, getProjSprite(world.queue[0]), px, py, { rot: -world.aimAngle * dir });
      ctx.strokeStyle = ln.glow; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(sl.x + 14 * dir, sl.y - 18); ctx.lineTo(px, py); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBlock(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.rot) ctx.rotate(b.rot);
    if (b.isTnt) {
      art.blit(ctx, getTntSprite(), 0, 0);
    } else if (b.shape === 'circle') {
      art.blit(ctx, getBoulderSprite(world.world), 0, 0);
    } else {
      var fill = b.flash > 0 ? '#ffffff' : b.mat === 'ice' ? '#88e7ff' : b.mat === 'steel' ? '#8292ad' : '#dc8b3c';
      art.round(ctx, -b.bw / 2, -b.bh / 2, b.bw, b.bh, 5);
      art.outlined(ctx, fill, 2.6);
      if (b.mat === 'ice') {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(-b.bw / 2 + 4, -b.bh / 2 + 3, Math.max(4, b.bw - 8), Math.max(3, b.bh * 0.26));
      } else if (b.mat === 'steel') {
        ctx.fillStyle = '#475569';
        ctx.fillRect(-b.bw / 2 + 5, -b.bh / 2 + 5, Math.max(2, b.bw - 10), Math.max(2, b.bh - 10));
      } else {
        ctx.strokeStyle = 'rgba(110,55,15,0.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-b.bw * 0.35, 0); ctx.lineTo(b.bw * 0.35, 0); ctx.stroke();
      }
      if (b.splatColor) {
        ctx.fillStyle = pickColor(b.splatColor, b.id);
        art.blob(ctx, 0, 0, Math.min(b.bw, b.bh) * 0.38, 0.18, b.id); ctx.fill();
      }
      if (b.hp < b.maxHp * 0.72) {
        ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(-b.bw * 0.22, -b.bh * 0.25); ctx.lineTo(0, 0); ctx.lineTo(b.bw * 0.18, b.bh * 0.28); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    drawCount++;
    var wd = E.WORLDS[world ? world.world : 0] || E.WORLDS[0];

    // Sky backdrop (screen space so Duel zoom always fills top sky)
    var gSky = ctx.createLinearGradient(0, 0, 0, E.H);
    gSky.addColorStop(0, wd.sky[0]); gSky.addColorStop(1, wd.sky[1]);
    ctx.fillStyle = gSky; ctx.fillRect(0, 0, E.W, E.H);

    // Clouds & distant hills
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (var ci = 0; ci < 4; ci++) {
      var cx = 170 + ci * 310;
      ctx.beginPath(); ctx.arc(cx, 115 + (ci % 2) * 35, 34, 0, 6.2832); ctx.arc(cx + 30, 120 + (ci % 2) * 35, 26, 0, 6.2832); ctx.arc(cx - 28, 122 + (ci % 2) * 35, 24, 0, 6.2832); ctx.fill();
    }

    ctx.save();
    ctx.translate(640, E.H);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -E.H);
    art.shake.apply(ctx);

    var ww = world.width, gy = world.groundY;
    // Rolling hills in world space
    ctx.fillStyle = wd.hill;
    ctx.beginPath(); ctx.moveTo(-120, gy);
    for (var hx = -120; hx <= ww + 120; hx += 220) ctx.quadraticCurveTo(hx + 110, gy - 95 - ((hx / 220 | 0) % 2) * 40, hx + 220, gy);
    ctx.lineTo(ww + 120, gy + 40); ctx.lineTo(-120, gy + 40); ctx.closePath(); ctx.fill();

    // Steam Geysers & Portals
    for (var gi = 0; gi < world.geysers.length; gi++) {
      var gey = world.geysers[gi];
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      for (var sp = 0; sp < 4; sp++) {
        var py = gy - 28 - ((world.time * 90 + sp * 38) % 145);
        ctx.beginPath(); ctx.arc(gey.x + Math.sin(sp + world.time * 3) * 12, py, 14 + sp * 3, 0, 6.2832); ctx.fill();
      }
      art.round(ctx, gey.x - gey.w * 0.42, gy - 14, gey.w * 0.84, 18, 6); art.outlined(ctx, '#ff6e40', 3);
    }
    for (var pi = 0; pi < world.portals.length; pi++) {
      var pt = world.portals[pi];
      [ [pt.x1, pt.y1], [pt.x2, pt.y2] ].forEach(function (pair, idx) {
        ctx.save(); ctx.translate(pair[0], pair[1]); ctx.rotate((idx ? -1 : 1) * world.time * 2.5);
        ctx.strokeStyle = pt.color; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(0, 0, pt.r, 0, 5.1); ctx.stroke();
        ctx.fillStyle = 'rgba(16,20,48,0.65)'; ctx.beginPath(); ctx.arc(0, 0, pt.r * 0.68, 0, 6.2832); ctx.fill();
        ctx.restore();
      });
    }

    // Ground & trim
    ctx.fillStyle = wd.ground; ctx.fillRect(-160, gy, ww + 320, 140);
    ctx.fillStyle = wd.trim; ctx.fillRect(-160, gy, ww + 320, 14);
    ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(-160, gy); ctx.lineTo(ww + 160, gy); ctx.stroke();

    // Permanent Neon Paint Splatters
    for (var si = 0; si < world.splats.length; si++) {
      var spl = world.splats[si];
      ctx.fillStyle = pickColor(spl.color, spl.seed);
      ctx.globalAlpha = 0.82;
      art.blob(ctx, spl.x, spl.y, spl.r * 0.55, 0.22, spl.seed); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Static Pedestals
    for (var pdi = 0; pdi < world.pedestals.length; pdi++) {
      var pd = world.pedestals[pdi];
      art.round(ctx, pd.x - pd.bw / 2, pd.y - pd.bh / 2, pd.bw, pd.bh, 8);
      art.outlined(ctx, '#4b5563', 3);
    }

    // Queue Preview behind active catapult
    var slActive = E.activeSling(world), qDir = E.aimDir(world);
    for (var qi = 1; qi < Math.min(world.queue.length, 6); qi++) {
      art.blit(ctx, getProjSprite(world.queue[qi]), slActive.x - qDir * (48 + qi * 34), gy - 16);
    }

    // Trajectory Arc Preview
    if (screen === 'play' && world.phase === 'aim') {
      var arc = E.trajectory(world);
      for (var ai = 0; ai < arc.length; ai++) {
        var alpha = 1 - (ai / (arc.length + 4)) * 0.68;
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(arc[ai].x, arc[ai].y, ai % 3 === 0 ? 5.5 : 4, 0, 6.2832);
        art.outlined(ctx, ai % 3 === 0 ? '#ffe033' : '#ffffff', 2);
      }
      ctx.globalAlpha = 1;
    }

    // Catapults
    drawSling(world.sling1, 1, world.turn === 1);
    if (world.mode === 'duel') drawSling(world.sling2, -1, world.turn === 2);

    // Rigid-Body Fort Blocks
    for (var bi = 0; bi < world.blocks.length; bi++) if (world.blocks[bi].alive) drawBlock(world.blocks[bi]);

    // Grumpy Grey Robo-Goblins
    for (var gbi = 0; gbi < world.goblins.length; gbi++) {
      var gb = world.goblins[gbi];
      if (!gb.alive) continue;
      var blink = art.blink(goblinBlinks[gbi % goblinBlinks.length]) > 0.5;
      art.blit(ctx, getGoblinSprite(gb.boss, blink), gb.x, gb.y, { rot: gb.rot * 0.45 });
      if (gb.boss && gb.hp < gb.maxHp) {
        art.round(ctx, gb.x - 28, gb.y - gb.r - 18, 56, 8, 4); art.outlined(ctx, '#1b1640', 2);
        ctx.fillStyle = '#34d85c'; ctx.fillRect(gb.x - 26, gb.y - gb.r - 16, 52 * (gb.hp / gb.maxHp), 4);
      }
    }

    // Trail & Flying Projectiles & Blast Rings
    for (var tr = 0; tr < trail.length; tr++) {
      ctx.globalAlpha = Math.max(0, trail[tr].a * 0.65);
      ctx.fillStyle = trail[tr].color;
      ctx.beginPath(); ctx.arc(trail[tr].x, trail[tr].y, trail[tr].r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (var pr = 0; pr < world.projectiles.length; pr++) {
      var p = world.projectiles[pr];
      if (p.alive) art.blit(ctx, getProjSprite(p.type), p.x, p.y, { rot: p.rot });
    }
    for (var bl = 0; bl < blasts.length; bl++) {
      var br = blasts[bl], u = 1 - br.t / 0.32;
      ctx.globalAlpha = Math.max(0, 1 - u);
      ctx.strokeStyle = br.color; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(br.x, br.y, br.r * (0.35 + u * 0.65), 0, 6.2832); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    fx.draw(ctx);
    art.pop.draw(ctx);
    ctx.restore();

    art.flash.draw(ctx, E.W, E.H);

    // Canvas HUD during play (leaves top-left for #hud and top-right for .sg-mute)
    if (screen === 'play' && world) {
      art.round(ctx, 350, 12, 580, 52, 26);
      art.outlined(ctx, 'rgba(20,16,48,0.88)', 3);
      ctx.fillStyle = '#ffe033'; ctx.font = '800 21px Fredoka'; ctx.textAlign = 'right';
      var titleTxt = world.mode === 'duel'
        ? 'مبارزة القلعتين — دور اللاعب ' + world.turn
        : 'المرحلة ' + world.id + ': ' + world.name;
      ctx.fillText(titleTxt, 908, 45);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
      var statTxt = world.mode === 'duel'
        ? 'غوبلن 1: ' + E.goblinsLeft(world, 1) + ' | 2: ' + E.goblinsLeft(world, 2)
        : 'الغوبلن: ' + E.goblinsLeft(world) + '  |  النقاط: ' + Kit.fmt(world.score);
      ctx.fillText(statTxt, 372, 45);

      // Wind Flag Indicator (Hero tier)
      if (world.wind) {
        art.round(ctx, 545, 72, 190, 34, 17);
        art.outlined(ctx, 'rgba(20,16,48,0.84)', 2.5);
        ctx.fillStyle = '#00e5ff'; ctx.font = '700 16px Fredoka'; ctx.textAlign = 'center';
        ctx.fillText('الرياح ' + (world.wind > 0 ? '→ ' : '← ') + Math.abs(world.wind), 640, 95);
      }

      // Bottom Projectile & Mid-Air Special Banner
      var curId = world.phase === 'flight' && world.projectiles[0] ? world.projectiles[0].type : world.queue[0];
      var pDef = E.PROJECTILES[curId] || E.PROJECTILES.bomb;
      var canSpec = world.phase === 'flight' && world.projectiles.some(function (q) { return q.alive && !q.specialUsed; });
      art.round(ctx, 330, 668, 620, 42, 21);
      art.outlined(ctx, canSpec ? '#ff3877' : 'rgba(20,16,48,0.88)', 3);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 18px Fredoka'; ctx.textAlign = 'center';
      var barTxt = canSpec
        ? 'اضغط المسافة أو انقر الآن لتفعيل القوة الخارقة: ' + pDef.hint
        : pDef.name + ' (' + world.queue.length + ') — ' + pDef.hint;
      ctx.fillText(barTxt, 640, 695);

      if (turnBanner.t > 0) {
        art.round(ctx, 470, 140, 340, 60, 22);
        art.outlined(ctx, '#ffe033', 3.5);
        ctx.fillStyle = '#1b1640'; ctx.font = '900 28px Fredoka';
        ctx.fillText(turnBanner.text, 640, 179);
      }
    }
  }

  /* --------------------------------------------------- Public Debug/Test API */
  window.__game = {
    engine: E,
    get world() { return world; },
    get save() { return save; },
    persist: persist,
    startStage: startStage,
    startDuel: startDuel,
    worldToClient: worldToClient,
    get state() {
      var active = null, aliveProj = 0;
      if (world && world.projectiles) {
        for (var i = 0; i < world.projectiles.length; i++) {
          var p = world.projectiles[i];
          if (!p.alive) continue;
          aliveProj++;
          if (!active) active = { type: p.type, x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), specialUsed: !!p.specialUsed };
        }
      }
      return {
        screen: screen,
        mode: world ? world.mode : 'solo',
        id: world ? world.id : '1-1',
        stageIndex: world ? world.stageIndex : 0,
        diff: save.diff,
        time: world ? Math.round(world.time * 1000) / 1000 : 0,
        aimAngle: world ? Math.round(world.aimAngle * 10000) / 10000 : E.DEFAULT_ANGLE,
        aimPower: world ? Math.round(world.aimPower * 1000) / 1000 : E.DEFAULT_POWER,
        shots: world ? world.shots : 0,
        score: world ? Math.round(world.score) : 0,
        phase: world ? world.phase : 'aim',
        turn: world ? world.turn : 1,
        winner: world ? world.winner : 0,
        goblinsLeft: world ? E.goblinsLeft(world) : 0,
        p1Goblins: world ? E.goblinsLeft(world, 1) : 0,
        p2Goblins: world ? E.goblinsLeft(world, 2) : 0,
        activeProjectile: active,
        projectileCount: aliveProj,
        nextType: world && world.queue.length ? world.queue[0] : null,
        shotsLeft: world ? world.queue.length : 0,
        wind: world ? world.wind : 0,
        dragging: dragging,
        paused: screen === 'pause',
        camX: Math.round(cam.x),
        camZoom: Math.round(cam.zoom * 1000) / 1000,
        draws: drawCount,
        trailLen: trail.length
      };
    }
  };

  syncHeaderChips();
  art.loop(update, render);
  Kit.ready();
})();
