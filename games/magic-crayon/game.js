/* Magic Crayon 3D (القلم السحري) — UI controller, Kit integration, controls,
 * ghost coach, DDA adaptive assist, sound effects (Kit.juice), and window.__game hook. */
(function () {
  'use strict';
  var MC = window.MagicCrayon;
  var J = Kit.juice;
  function $(id) { return document.getElementById(id); }

  var canvas = $('scene');
  var body = document.body;

  /* --------------------------------------------------------------- save v3 */
  var store = Kit.store('magic-crayon');
  var saveStatus = Kit.saveStatus({ retry: persistSave });
  var save = MC.loadSave(store.get('save', null));

  function persistSave() {
    if (store.set('save', save) === false) {
      saveStatus.failed();
      return false;
    }
    saveStatus.saved();
    return true;
  }

  /* ------------------------------------------------------------ Kit.dda */
  var dda = Kit.dda('magic-crayon', { id: 'main', target: 0.72, tiers: 5 });

  function currentDdaOpts() {
    return {
      inkMul: dda.value(1.42, 0.98),
      gravityScale: dda.value(0.92, 1.02),
      tractionBonus: dda.value(1.08, 1.0)
    };
  }

  /* ---------------------------------------------------------------- state */
  var screen = 'title'; // 'title' | 'play' | 'pause' | 'win' | 'levels' | 'garage' | 'error'
  var returnScreen = 'title';
  var levelIdx = 0;
  var selectedWorldTab = 0;
  var world = MC.createWorld(0);
  var view = null;
  var loop = null;
  var failed = false;
  var live = false;
  var queuedAction = null;
  var contextLost = false;
  var dirty = true;
  var lastRenderMs = 0;

  // Pointer & drawing state
  var pointer = { x: MC.WORLD_W / 2, y: MC.WORLD_H / 2, visible: false, drawing: false, pointerId: null };
  var drawFxCd = 0;
  var coachSeen = false;
  var tutorialStarted = false;
  var tutorialDone = false;
  var roundOpen = false;
  var winDelay = 0;
  var pendingWin = null;
  var bannerTimer = 0;
  var guideNudgeT = 0;
  var lastHudInk = -1;
  var lastHudStars = -1;
  var lastHudRolling = null;
  var lastHudCrayon = -1;

  function say(text) { $('live').textContent = text; }

  function showToast(text, dur) {
    var el = $('banner');
    el.textContent = text;
    el.hidden = false;
    bannerTimer = dur || 1.5;
  }

  function focusCanvas() {
    try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------ screens */
  var OVERLAYS = {
    title: 'scrTitle',
    pause: 'scrPause',
    win: 'scrWin',
    levels: 'scrLevels',
    garage: 'scrGarage',
    error: 'scrError'
  };

  function setScreen(next) {
    screen = next;
    body.dataset.screen = next;
    for (var k in OVERLAYS) $(OVERLAYS[k]).hidden = k !== next;
    $('hud').hidden = !(next === 'play' || next === 'pause' || next === 'win');
    dirty = true;
    if (document.activeElement && document.activeElement !== canvas && document.activeElement.blur) {
      document.activeElement.blur();
    }
    if (next === 'play') focusCanvas();
  }

  function closeRoundIfOpen(reason) {
    if (roundOpen) {
      roundOpen = false;
      Kit.stats.end(reason || 'quit');
    }
  }

  function setupTitleShowcase() {
    // Load level 1-1 with a cheerful sample bridge so the live 3D title diorama pops!
    world = MC.createWorld(0);
    MC.addStroke(world, MC.CRAYON_BRIDGE, [[6.8, 4.95], [10.8, 5.2], [15.2, 4.95]]);
    if (view) {
      view.clearParticles();
      view.loadLevel(world);
      view.applySkin(save.skin);
    }
    $('titleStars').textContent = MC.totalStars(save) + '/' + (MC.LEVELS.length * 3);
    setScreen('title');
  }

  function startLevel(idx) {
    if (!live) { queuedAction = function () { startLevel(idx); }; return; }
    closeRoundIfOpen('quit');
    levelIdx = Math.max(0, Math.min(MC.LEVELS.length - 1, idx | 0));
    world = MC.createWorld(levelIdx, currentDdaOpts());
    pendingWin = null;
    winDelay = 0;
    pointer.drawing = false;
    pointer.pointerId = null;

    var lv = world.level;
    var rid = 'w' + (lv.world + 1) + '-' + lv.stage;
    Kit.stats.round(rid);
    roundOpen = true;

    if (levelIdx === 0 && !tutorialStarted) {
      tutorialStarted = true;
      Kit.stats.tutorial('start');
    }

    if (view) {
      view.clearParticles();
      view.loadLevel(world);
      view.applySkin(save.skin);
    }

    lastHudInk = -1;
    lastHudStars = -1;
    lastHudRolling = null;
    lastHudCrayon = -1;
    guideNudgeT = 0;
    syncHud();
    setScreen('play');
    showToast(lv.name, 1.8);
    say(lv.name);
  }

  function restartLevel() {
    if (!live) return;
    J.tap();
    startLevel(levelIdx);
  }

  function pauseGame() {
    if (screen !== 'play') return;
    if (world.activeStroke) MC.endStroke(world);
    pointer.drawing = false;
    pointer.pointerId = null;
    $('pauseStage').textContent = world.level.id + ' · ' + world.level.name;
    setScreen('pause');
  }

  function resumeGame() {
    if (screen !== 'pause') return;
    J.select();
    setScreen('play');
  }

  function goHome() {
    J.back();
    closeRoundIfOpen('quit');
    setupTitleShowcase();
  }

  /* --------------------------------------------------------------- HUD */
  function syncHud() {
    var lv = world.level;
    $('hudStage').textContent = lv.id;

    if (lastHudStars !== world.starsCollected) {
      lastHudStars = world.starsCollected;
      var nodes = $('hudStars').children;
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].classList.toggle('on', i < world.starsCollected);
      }
    }

    var pct = world.inkBudget > 0 ? Math.max(0, Math.round(((world.inkBudget - world.inkUsed) / world.inkBudget) * 100)) : 0;
    if (lastHudInk !== pct || lastHudCrayon !== world.crayonType) {
      lastHudInk = pct;
      var fill = $('inkFill');
      fill.style.width = pct + '%';
      fill.className = 'ink-fill c' + world.crayonType + (pct <= 18 ? ' low' : '');
      $('inkPct').textContent = pct + '%';
    }

    if (lastHudCrayon !== world.crayonType) {
      lastHudCrayon = world.crayonType;
      for (var c = 0; c < 3; c++) {
        var btn = $('ink' + c);
        btn.classList.toggle('active', world.crayonType === c);
        btn.classList.toggle('rec', lv.recCrayon === c && world.strokes.length === 0);
      }
    }

    if (lastHudRolling !== world.rolling) {
      lastHudRolling = world.rolling;
      var go = $('btnLaunch');
      go.classList.toggle('rolling', world.rolling);
      go.classList.toggle('pulse', !world.rolling && world.strokes.length > 0);
      $('launchLbl').textContent = world.rolling ? 'منطلق!' : 'انطلق!';
    } else {
      $('btnLaunch').classList.toggle('pulse', !world.rolling && world.strokes.length > 0);
    }
  }

  /* ------------------------------------------------------ level select UI */
  function buildWorldTabs() {
    var box = $('worldTabs');
    box.innerHTML = '';
    MC.WORLDS.forEach(function (w, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wtab' + (i === selectedWorldTab ? ' active' : '');
      btn.textContent = w.name;
      btn.addEventListener('click', function () {
        J.tap();
        selectedWorldTab = i;
        renderLevelSelect();
      });
      box.appendChild(btn);
    });
  }

  function renderLevelSelect() {
    var tabs = $('worldTabs').children;
    for (var t = 0; t < tabs.length; t++) tabs[t].classList.toggle('active', t === selectedWorldTab);
    var grid = $('levelGrid');
    grid.innerHTML = '';
    var nextOpen = MC.nextUnfinishedLevel(save);
    MC.LEVELS.forEach(function (lv, idx) {
      if (lv.world !== selectedWorldTab) return;
      var open = MC.isLevelOpen(save, idx);
      var st = save.stars[idx] | 0;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lvl-btn' + (open ? '' : ' locked') + (st > 0 ? ' done' : '') + (idx === nextOpen && open ? ' next' : '');
      btn.dataset.level = String(idx);
      var starHtml = '';
      for (var k = 0; k < 3; k++) starHtml += k < st ? '<b>★</b>' : '★';
      btn.innerHTML = '<span dir="ltr">' + lv.id + '</span><span class="lvl-stars">' + (open ? starHtml : '🔒') + '</span>';
      btn.disabled = !open;
      btn.addEventListener('click', function () {
        if (!open) { J.error(); return; }
        J.select();
        startLevel(idx);
      });
      grid.appendChild(btn);
    });
  }

  function openLevels(from) {
    J.select();
    returnScreen = from || screen;
    if (screen === 'play' || screen === 'pause') closeRoundIfOpen('quit');
    selectedWorldTab = MC.LEVELS[levelIdx].world;
    renderLevelSelect();
    setScreen('levels');
  }

  /* ------------------------------------------------------------ garage UI */
  function renderGarage() {
    var total = MC.totalStars(save);
    $('garageStars').textContent = String(total);
    var grid = $('skinGrid');
    grid.innerHTML = '';
    MC.SKINS.forEach(function (sk, idx) {
      var unlocked = MC.isSkinUnlocked(save, idx);
      var eq = save.skin === idx;
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'skin-card' + (eq ? ' equipped' : '') + (unlocked ? '' : ' locked');
      card.dataset.skin = String(idx);
      var bodyHex = '#' + sk.body.toString(16).padStart(6, '0');
      var trimHex = '#' + sk.trim.toString(16).padStart(6, '0');
      card.innerHTML =
        '<div class="skin-swatch" style="background:' + bodyHex + '"><div class="skin-stripe" style="background:' + trimHex + '"></div></div>' +
        '<span>' + sk.name + '</span>' +
        '<span class="skin-req">' + (eq ? '✓ مختارة' : unlocked ? 'جاهزة' : '🔒 ' + sk.needStars + ' ⭐') + '</span>';
      card.addEventListener('click', function () {
        if (!unlocked) { J.error(); return; }
        J.select();
        save.skin = idx;
        if (view) view.applySkin(idx);
        persistSave();
        renderGarage();
      });
      grid.appendChild(card);
    });
  }

  function openGarage(from) {
    J.select();
    returnScreen = from || screen;
    renderGarage();
    setScreen('garage');
  }

  /* --------------------------------------------------------------- win UI */
  function showWinScreen(info) {
    var stars = info.stars;
    var oldBest = save.stars[levelIdx] | 0;
    var prevTotal = MC.totalStars(save);
    var isNewBest = stars > oldBest;
    if (isNewBest) save.stars[levelIdx] = stars;
    if (levelIdx + 1 > save.bestLevel && levelIdx + 1 < MC.LEVELS.length) {
      save.bestLevel = levelIdx + 1;
    }
    var newTotal = MC.totalStars(save);
    persistSave();

    // Check if a new truck skin just unlocked!
    var unlockedSkin = null;
    for (var i = 0; i < MC.SKINS.length; i++) {
      if (MC.SKINS[i].needStars > prevTotal && MC.SKINS[i].needStars <= newTotal) {
        unlockedSkin = MC.SKINS[i];
      }
    }

    $('winBadge').hidden = !isNewBest;
    $('winTitle').textContent = stars === 3 ? 'مذهل!' : stars === 2 ? 'رائع!' : 'أحسنت!';
    var starEls = $('winStars').children;
    for (var s = 0; s < starEls.length; s++) {
      starEls[s].classList.toggle('on', s < stars);
    }

    var unlockEl = $('winUnlock');
    if (unlockedSkin) {
      unlockEl.textContent = '🎉 شاحنة جديدة: ' + unlockedSkin.name + '!';
      unlockEl.hidden = false;
    } else {
      unlockEl.hidden = true;
    }

    var hasNext = levelIdx + 1 < MC.LEVELS.length;
    $('btnNext').textContent = hasNext ? 'المرحلة التالية ▶' : 'العب من البداية ▶';
    setScreen('win');
    J.levelUp();
  }

  /* -------------------------------------------------- gameplay actions */
  function pickCrayon(type) {
    if (screen !== 'play') return;
    MC.setCrayon(world, type);
    J.tap();
    syncHud();
    dirty = true;
  }

  function doUndo() {
    if (screen !== 'play') return;
    if (MC.undoStroke(world)) {
      J.back();
      if (view) view.syncStrokes(world, false);
      syncHud();
      dirty = true;
    }
  }

  function doLaunch() {
    if (screen !== 'play') return;
    var noBridge = levelIdx === 0 && world.strokes.length === 0;
    if (MC.launch(world)) {
      J.whoosh(0.8);
      if (noBridge) guideNudgeT = 1.6;
      if (levelIdx === 0 && world.strokes.length > 0 && !tutorialDone) {
        tutorialDone = true;
        Kit.stats.tutorial('done');
      }
      syncHud();
      dirty = true;
    }
  }

  /* ----------------------------------------------------- pointer drawing */
  function updatePointer(e) {
    if (!view) return;
    var p = view.unproject(e.clientX, e.clientY);
    pointer.x = p.x;
    pointer.y = p.y;
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (screen !== 'play' || !view) return;
    focusCanvas();
    if (e.button === 2) {
      e.preventDefault();
      doUndo();
      return;
    }
    if (e.button !== 0) return;
    updatePointer(e);
    pointer.visible = true;
    if (MC.beginStroke(world, world.crayonType, pointer.x, pointer.y)) {
      pointer.drawing = true;
      pointer.pointerId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      J.tap();
      syncHud();
      dirty = true;
    } else if (world.inkUsed >= world.inkBudget - 0.15) {
      J.error();
      showToast('نفد الحبر! اضغط Z للتراجع', 1.2);
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!view) return;
    updatePointer(e);
    if (screen === 'play') pointer.visible = true;
    if (pointer.drawing && screen === 'play') {
      if (MC.extendStroke(world, pointer.x, pointer.y)) {
        if (drawFxCd <= 0) {
          drawFxCd = 0.06;
          var cr = MC.CRAYONS[world.crayonType];
          view.burst(pointer.x, pointer.y, {
            count: 2, colors: [cr.hex, cr.accent], speed: 2.2, up: 0.6, life: 0.3, size: 0.55, gravity: -6
          });
        }
        syncHud();
        dirty = true;
      }
    }
  });

  function finishPointerDraw(e) {
    if (!pointer.drawing) return;
    if (e && pointer.pointerId != null && e.pointerId !== pointer.pointerId) return;
    pointer.drawing = false;
    pointer.pointerId = null;
    MC.endStroke(world);
    syncHud();
    dirty = true;
  }

  canvas.addEventListener('pointerup', finishPointerDraw);
  canvas.addEventListener('pointercancel', finishPointerDraw);
  canvas.addEventListener('pointerleave', function () {
    if (!pointer.drawing) pointer.visible = false;
  });

  /* ------------------------------------------------------------ keyboard */
  function handleKeys() {
    var K = Kit.keys;
    if (screen === 'title') {
      if (K.anyPressed(['Space', 'Enter'])) {
        J.select();
        startLevel(MC.nextUnfinishedLevel(save));
      }
      return;
    }
    if (screen === 'pause') {
      if (K.anyPressed(['KeyP', 'Escape'])) resumeGame();
      else if (K.pressed('KeyR')) restartLevel();
      return;
    }
    if (screen === 'win') {
      if (K.anyPressed(['Space', 'Enter'])) {
        J.select();
        startLevel(levelIdx + 1 < MC.LEVELS.length ? levelIdx + 1 : 0);
      } else if (K.pressed('KeyR')) {
        restartLevel();
      } else if (K.pressed('Escape')) {
        openLevels('title');
      }
      return;
    }
    if (screen === 'levels' || screen === 'garage') {
      if (K.pressed('Escape')) {
        J.back();
        setScreen(returnScreen === 'play' ? 'play' : 'title');
      }
      return;
    }
    if (screen !== 'play') return;

    if (K.anyPressed(['KeyP', 'Escape'])) { pauseGame(); return; }
    if (K.pressed('Digit1')) pickCrayon(0);
    else if (K.pressed('Digit2')) pickCrayon(1);
    else if (K.pressed('Digit3')) pickCrayon(2);
    if (K.pressed('KeyZ')) doUndo();
    if (K.pressed('KeyR')) restartLevel();
    if (K.pressed('Space')) doLaunch();
  }

  /* -------------------------------------------------------- simulation step */
  function processWorldEvents(events) {
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'star') {
        Kit.track.hit();
        J.star(ev.count);
        if (view) view.burst(ev.x, ev.y, { count: 14, colors: [0xffd22b, 0xfff59e, 0xffffff], speed: 6.2, up: 3.0, life: 0.75, size: 1.15 });
      } else if (ev.type === 'crate') {
        Kit.track.hit();
        J.impact(0.65);
        if (view) {
          view.addShake(0.65);
          view.burst(ev.x, ev.y, { count: 16, colors: [0xd99043, 0x9c5922, 0xffd23f], speed: 6.8, up: 3.5, life: 0.72, size: 1.05 });
        }
      } else if (ev.type === 'boost') {
        J.whoosh(0.95);
        if (view) {
          view.addShake(0.35);
          view.burst(ev.x, ev.y, { count: 10, colors: [0xff7b1a, 0xffe047, 0xffffff], speed: 5.5, up: 2.0, life: 0.45, size: 0.95 });
        }
      } else if (ev.type === 'bounce') {
        J.jump(0.9);
        if (view) {
          view.addShake(0.45);
          view.burst(ev.x, ev.y, { count: 14, colors: [0x2de380, 0xd9ff70, 0xffffff], speed: 6.0, up: 4.0, life: 0.55, size: 1.0 });
        }
      } else if (ev.type === 'bumper') {
        J.pop(0.9);
        if (view) {
          view.popBumper(ev.idx);
          view.addShake(0.55);
          view.burst(ev.x, ev.y, { count: 14, colors: [0xff4fa3, 0xffd23f, 0xffffff], speed: 6.5, up: 3.2, life: 0.6, size: 1.05 });
        }
      } else if (ev.type === 'land') {
        J.land(ev.power);
        if (view) view.burst(ev.x, ev.y, { count: 5, colors: [0xfff4d6, 0xd9c2a3], speed: 2.6, up: 1.2, life: 0.35, size: 0.65 });
      } else if (ev.type === 'crash') {
        Kit.track.miss();
        dda.result(0);
        J.fail();
        if (view) {
          view.addShake(0.85);
          view.burst(ev.x, ev.y, { count: 22, colors: [0xff477e, 0xffd23f, 0x22b8ff, 0xffffff], speed: 7.5, up: 4.5, life: 0.78, size: 1.15 });
        }
        showToast('أعد المحاولة!', 0.9);
      } else if (ev.type === 'win') {
        Kit.track.hit();
        dda.result(0.5 + (ev.stars / 3) * 0.5);
        if (roundOpen) {
          roundOpen = false;
          Kit.stats.end('win', ev.stars);
        }
        J.chime(ev.stars);
        if (view) {
          view.burst(ev.x, ev.y, { count: 44, colors: [0xff477e, 0xffd23f, 0x22b8ff, 0x2de380, 0xffffff], speed: 9.2, up: 6.2, life: 1.25, size: 1.25 });
        }
        pendingWin = ev;
        winDelay = 0.75;
      } else if (ev.type === 'reset') {
        syncHud();
      }
    }
  }

  function update(dt) {
    handleKeys();
    Kit.keys.endFrame();

    if (drawFxCd > 0) drawFxCd = Math.max(0, drawFxCd - dt);
    if (guideNudgeT > 0 && screen !== 'pause') guideNudgeT = Math.max(0, guideNudgeT - dt);
    if (bannerTimer > 0 && screen !== 'pause') {
      bannerTimer -= dt;
      if (bannerTimer <= 0) $('banner').hidden = true;
    }

    if (screen === 'play') {
      if (world.rolling) Kit.stats.busy();
      MC.step(world, dt);
      var events = MC.consumeEvents(world);
      if (events.length) {
        processWorldEvents(events);
        syncHud();
      }
      if (pendingWin) {
        winDelay -= dt;
        if (winDelay <= 0) {
          var info = pendingWin;
          pendingWin = null;
          showWinScreen(info);
        }
      }
      dirty = true;
    } else if (screen !== 'pause') {
      dirty = true;
    }
  }

  function render() {
    if (!view || contextLost) return;
    if (screen === 'pause' && !dirty) return;
    var now = performance.now();
    if (!view.mayDraw(now, screen === 'play')) return;
    if (screen === 'play' && lastRenderMs && view.frameTime(now - lastRenderMs)) {
      layout();
    }
    var dt = lastRenderMs ? Math.min(0.05, (now - lastRenderMs) / 1000) : 1 / 60;
    lastRenderMs = now;

    var showCoach = screen === 'play' && !world.won && world.strokes.length === 0 && !pointer.drawing &&
      ((levelIdx === 0 && (!world.rolling || guideNudgeT > 0)) || (!world.rolling && world.crashes >= 2));
    if (showCoach) coachSeen = true;

    var guideEl = $('drawGuide');
    var showGuideLabel = showCoach && levelIdx === 0 && !world.crashed;
    guideEl.hidden = !showGuideLabel;
    if (showGuideLabel) {
      var gp = view.project(11.0, 2.7, 0);
      guideEl.style.left = Math.round(gp.x) + 'px';
      guideEl.style.top = Math.round(gp.y) + 'px';
      guideEl.classList.toggle('nudge', guideNudgeT > 0);
    }

    view.update({
      mode: screen,
      dt: screen === 'pause' ? 0 : dt,
      world: world,
      pointer: pointer,
      showCoach: showCoach,
      guideNudge: guideNudgeT > 0
    });
    view.render();
    dirty = false;
  }

  function layout() {
    if (view) view.resize(window.innerWidth, window.innerHeight);
    dirty = true;
  }

  /* -------------------------------------------------------- UI bindings */
  $('btnPlay').addEventListener('click', function () {
    J.select();
    startLevel(MC.nextUnfinishedLevel(save));
  });
  $('btnLevels').addEventListener('click', function () { openLevels('title'); });
  $('btnGarage').addEventListener('click', function () { openGarage('title'); });
  $('btnPause').addEventListener('click', function () { J.tap(); pauseGame(); });
  $('btnReset').addEventListener('click', function (e) { if (e.detail > 0) this.blur(); restartLevel(); });
  $('btnUndo').addEventListener('click', function (e) { if (e.detail > 0) this.blur(); doUndo(); focusCanvas(); });
  $('btnLaunch').addEventListener('click', function (e) { if (e.detail > 0) this.blur(); doLaunch(); focusCanvas(); });
  $('ink0').addEventListener('click', function (e) { if (e.detail > 0) this.blur(); pickCrayon(0); focusCanvas(); });
  $('ink1').addEventListener('click', function (e) { if (e.detail > 0) this.blur(); pickCrayon(1); focusCanvas(); });
  $('ink2').addEventListener('click', function (e) { if (e.detail > 0) this.blur(); pickCrayon(2); focusCanvas(); });

  $('btnResume').addEventListener('click', resumeGame);
  $('btnRestart').addEventListener('click', restartLevel);
  $('btnMap').addEventListener('click', function () { openLevels('pause'); });
  $('btnHome').addEventListener('click', goHome);

  $('btnNext').addEventListener('click', function () {
    J.select();
    startLevel(levelIdx + 1 < MC.LEVELS.length ? levelIdx + 1 : 0);
  });
  $('btnReplay').addEventListener('click', restartLevel);
  $('winMap').addEventListener('click', function () { openLevels('title'); });

  $('levelsBack').addEventListener('click', function () {
    J.back();
    setScreen(returnScreen === 'play' ? 'play' : 'title');
  });
  $('garageBack').addEventListener('click', function () {
    J.back();
    setScreen(returnScreen === 'play' ? 'play' : 'title');
  });
  $('btnErrorReload').addEventListener('click', function () { window.location.reload(); });

  /* --------------------------------------------------- debug / test hook */
  function snapshot() {
    var tr = world.truck;
    return {
      screen: screen,
      paused: screen === 'pause',
      level: levelIdx,
      id: world.id,
      world: world.worldIdx,
      time: Math.round(world.time * 1000) / 1000,
      rolling: world.rolling,
      won: world.won,
      crashed: world.crashed,
      crayonType: world.crayonType,
      inkUsed: Math.round(world.inkUsed * 1000) / 1000,
      inkBudget: world.inkBudget,
      strokes: world.strokes.length,
      starsCollected: world.starsCollected,
      cratesSmashed: world.cratesSmashed,
      totalStars: MC.totalStars(save),
      skin: save.skin,
      coach: coachSeen,
      particles: view ? view.particleCount() : 0,
      shake: view ? Math.round(view.shakeAmount() * 1000) / 1000 : 0,
      truck: {
        x: Math.round(tr.x * 1000) / 1000,
        y: Math.round(tr.y * 1000) / 1000,
        vx: Math.round(tr.vx * 1000) / 1000,
        vy: Math.round(tr.vy * 1000) / 1000,
        angle: Math.round(tr.angle * 1000) / 1000
      }
    };
  }

  /* --------------------------------------------------------------- init */
  Kit.muteButton();
  Kit.lifecycle({
    pause: pauseGame,
    reset: function () {
      if (world && world.activeStroke) MC.endStroke(world);
      pointer.drawing = false;
      pointer.pointerId = null;
    }
  });
  Kit.motion.onChange(function (r) {
    if (view) {
      view.calm = r;
      if (r) view.clearParticles();
    }
    dirty = true;
  });

  window.addEventListener('resize', layout);
  window.addEventListener('pageshow', function () { dirty = true; });
  Kit.webgl.watchContext(canvas, {
    notice: 'contextNotice',
    onLost: function () { contextLost = true; pauseGame(); },
    onRestored: function () { contextLost = false; dirty = true; layout(); }
  });

  function failInit(err) {
    if (failed) return;
    failed = true;
    live = false;
    if (loop) loop.stop();
    setScreen('error');
    Kit.fail(err);
  }

  function goLive() {
    window.__game = {
      get state() { return snapshot(); },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get world() { return world; },
      point: function (wx, wy, wz) { return view ? view.project(wx, wy, wz || 0) : { x: 0, y: 0 }; }
    };
    loop = Kit.loop(update, render);
    live = true;
    Kit.ready();
    if (queuedAction) {
      var fn = queuedAction;
      queuedAction = null;
      fn();
    }
  }

  function start3D() {
    try {
      view = MC.createView(canvas);
      view.calm = Kit.motion.reduced();
      layout();
      setupTitleShowcase();
      view.update({ mode: 'title', dt: 0, world: world, pointer: pointer, showCoach: false });
      view.render();
      view.whenDrawn(function () { if (!failed) goLive(); }, 8000);
    } catch (err) {
      failInit(err);
    }
  }

  try {
    buildWorldTabs();
    setupTitleShowcase();
    Kit.webgl.boot(start3D, { guard: function () { return !failed; }, onError: failInit, fallbackMs: 100 });
  } catch (err) {
    failInit(err);
  }
})();
