/* Fire & Ice (النار والجليد) — game controller, Kit integration, audio, UI & save v2. */
(function () {
  'use strict';

  var FI = window.FI;
  var Kit = window.Kit;
  var J = Kit && Kit.juice;
  var $ = function (id) { return document.getElementById(id); };

  var canvas = $('game');
  var hud = $('hud');
  var hudStage = $('hudStage');
  var hudTimer = $('hudTimer');
  var hudFireGems = $('hudFireGems');
  var hudIceGems = $('hudIceGems');
  var soloChip = $('soloChip');
  var soloName = $('soloName');
  var coachPill = $('coachPill');

  var titleScreen = $('titleScreen');
  var titleStars = $('titleStars');
  var playBtn = $('playBtn');
  var playLabel = $('playLabel');
  var modeDuoBtn = $('modeDuo');
  var modeSoloBtn = $('modeSolo');
  var mapBtn = $('mapBtn');
  var hatsBtn = $('hatsBtn');

  var pauseScreen = $('pauseScreen');
  var pauseLevelName = $('pauseLevelName');
  var pauseSoloBtn = $('pauseSolo');
  var deadScreen = $('deadScreen');
  var deadTitle = $('deadTitle');
  var deadSub = $('deadSub');
  var winScreen = $('winScreen');
  var winBadge = $('winBadge');
  var winTitle = $('winTitle');
  var winStars = $('winStars');
  var winTime = $('winTime');
  var winPar = $('winPar');
  var winGems = $('winGems');
  var winUnlock = $('winUnlock');
  var winNext = $('winNext');

  var mapScreen = $('mapScreen');
  var mapStars = $('mapStars');
  var wingsWrap = $('wingsWrap');
  var hatsScreen = $('hatsScreen');
  var hatsStars = $('hatsStars');
  var hatsGrid = $('hatsGrid');

  var scrError = $('scrError');
  var contextNotice = $('contextNotice');

  /* --------------------------------------------------- persistence v2 */
  var store = Kit.store('fire-and-ice');
  var save = FI.sanitizeSave(store.get('v2', null));
  var saveUI = Kit.saveStatus({ retry: function () { return persistSave(); } });

  function persistSave() {
    var ok = store.set('v2', save);
    if (!ok) saveUI.failed();
    else saveUI.saved();
    return ok;
  }

  /* ---------------------------------------------------- state & modes */
  var mode = 'title'; // 'title' | 'play' | 'paused' | 'dead' | 'won' | 'map' | 'hats'
  var returnMode = 'title';
  var levelIdx = Math.max(0, Math.min(FI.LEVELS.length - 1, save.unlocked - 1));
  var world = null;
  var activeHero = 'fire';
  var view = null;
  var dirty = true;
  var contextLost = false;
  var movedOnLevel = false;
  var winDelay = 0;
  var winModalShown = false;
  var deadDelay = 0;
  var deadModalShown = false;
  var roundOpen = false;
  var tutStarted = false;
  var tutDone = false;
  var lastHudSec = -1;
  var shiftSawTab = false;

  var mqReduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  function isReducedMotion() { return !!(mqReduce && mqReduce.matches); }

  /* --------------------------------------------------- sound & juice */
  function sfx(name, arg) {
    if (J && typeof J[name] === 'function') J[name](arg);
  }

  function handleWorldEvents(w) {
    if (!w.events.length) return;
    for (var i = 0; i < w.events.length; i++) {
      var ev = w.events[i];
      if (ev.t === 'jump') {
        sfx('jump', ev.kind === 'fire' ? 0.65 : 0.45);
        if (view) view.burst(ev.x, ev.y, ev.kind, 6);
      } else if (ev.t === 'land') {
        var p = Math.min(1, ev.power / 550);
        if (p > 0.25) sfx('land', p);
        if (view && p > 0.35) view.burst(ev.x, ev.y, 'dust', 5);
      } else if (ev.t === 'push') {
        sfx('impact', 0.2);
      } else if (ev.t === 'gem') {
        sfx('coin', Math.min(5, ev.got));
        if (view) view.burst(ev.x, ev.y, ev.kind, 12);
        syncHudCounters();
      } else if (ev.t === 'lever') {
        sfx('toggle', ev.on);
        if (view) view.burst(ev.x, ev.y, 'lever', 9);
      } else if (ev.t === 'btn') {
        sfx('tap');
        if (view && ev.down) view.burst(ev.x, ev.y, 'btn', 6);
      } else if (ev.t === 'door') {
        if (ev.on) {
          sfx('chime', 1);
          if (view) view.burst(ev.x, ev.y, ev.kind, 10);
        }
      } else if (ev.t === 'dead') {
        onDeath(ev);
      } else if (ev.t === 'respawn') {
        // the first wing: a fall puts the hero back on the last stone, and the level goes on
        sfx('pop', 0.5);
        if (view) view.burst(ev.x, ev.y, ev.cause === 'goo' ? 'goo' : ev.kind, 14);
        var whoR = ev.kind === 'fire' ? 'شعلة' : 'ثلجة';
        var whatR = ev.cause === 'water' ? 'الماء' : ev.cause === 'lava' ? 'الحمم' : 'الوحل الأخضر';
        coachPill.textContent = 'عادت ' + whoR + ' إلى الحجر. احذر من ' + whatR + '!';
        coachPill.hidden = false;
        respawnT = 2.6;
      } else if (ev.t === 'win') {
        onWin(ev);
      }
    }
    w.events.length = 0;
  }

  /* -------------------------------------------------------- telemetry */
  function roundId() {
    return 'L' + (levelIdx + 1) + (save.solo ? '' : '-2p');
  }

  function beginRound() {
    if (roundOpen) Kit.stats.end('quit');
    Kit.stats.round(roundId());
    roundOpen = true;
    if (levelIdx === 0 && !tutStarted && !tutDone) {
      tutStarted = true;
      Kit.stats.tutorial('start');
    }
  }

  function finishRound(result, score) {
    if (!roundOpen) return;
    roundOpen = false;
    if (score != null && save.solo) Kit.stats.end(result, score);
    else Kit.stats.end(result);
  }

  /* ------------------------------------------------------ UI updates */
  function hideOverlays() {
    titleScreen.hidden = true;
    pauseScreen.hidden = true;
    deadScreen.hidden = true;
    winScreen.hidden = true;
    mapScreen.hidden = true;
    hatsScreen.hidden = true;
  }

  function syncTitleUI() {
    var maxStars = FI.LEVELS.length * 3;
    var curStars = FI.totalStars(save);
    titleStars.textContent = '★ ' + curStars + ' / ' + maxStars;
    modeDuoBtn.classList.toggle('active', !save.solo);
    modeSoloBtn.classList.toggle('active', !!save.solo);
    modeDuoBtn.setAttribute('aria-pressed', String(!save.solo));
    modeSoloBtn.setAttribute('aria-pressed', String(!!save.solo));
    playLabel.textContent = curStars > 0 ? 'تابع المغامرة' : 'ابدأ اللعب';
  }

  function syncSoloChip() {
    soloChip.hidden = !save.solo;
    if (!save.solo) return;
    var isIce = activeHero === 'ice';
    soloName.textContent = isIce ? 'ثلجة' : 'شعلة';
    soloChip.classList.toggle('is-ice', isIce);
  }

  function syncHudCounters() {
    if (!world) return;
    hudStage.textContent = (levelIdx + 1) + ' / ' + FI.LEVELS.length;
    hudFireGems.textContent = '◆ ' + world.gemsGot.fire + '/' + world.gemsTotal.fire;
    hudIceGems.textContent = '◆ ' + world.gemsGot.ice + '/' + world.gemsTotal.ice;
    syncSoloChip();
  }

  function syncHudTime(force) {
    if (!world) return;
    var tenths = Math.round(world.t * 10);
    if (!force && tenths === lastHudSec) return;
    lastHudSec = tenths;
    hudTimer.textContent = FI.formatTime(world.t);
  }

  var respawnT = 0; // seconds the "back to the stone" note stays up (the first wing's levels)
  function syncCoach() {
    if (respawnT > 0 && mode === 'play') return;
    var show = mode === 'play' && levelIdx === 0 && !movedOnLevel;
    coachPill.hidden = !show;
    if (!show) return;
    if (save.solo) {
      coachPill.innerHTML = '<span class="coach-fire">حركة <kbd dir="ltr">←</kbd><kbd dir="ltr">↑</kbd><kbd dir="ltr">→</kbd></span><span class="coach-sep">•</span><span class="coach-ice">تبديل البطل <kbd dir="ltr">Tab</kbd></span>';
    } else {
      coachPill.innerHTML = '<span class="coach-fire">شعلة <kbd dir="ltr">←</kbd><kbd dir="ltr">↑</kbd><kbd dir="ltr">→</kbd></span><span class="coach-sep">•</span><span class="coach-ice">ثلجة <kbd dir="ltr">A</kbd><kbd dir="ltr">W</kbd><kbd dir="ltr">D</kbd></span>';
    }
  }

  function renderMap() {
    var maxStars = FI.LEVELS.length * 3;
    mapStars.textContent = '★ ' + FI.totalStars(save) + ' / ' + maxStars;
    wingsWrap.innerHTML = '';
    for (var wi = 0; wi < FI.WINGS.length; wi++) {
      var wing = FI.WINGS[wi];
      var block = document.createElement('div');
      block.className = 'wing-block';
      var h = document.createElement('h3');
      h.className = 'wing-title';
      h.textContent = wing.name;
      block.appendChild(h);
      var grid = document.createElement('div');
      grid.className = 'lv-grid';
      for (var i = 0; i < FI.LEVELS.length; i++) {
        if (FI.LEVELS[i].wing !== wi) continue;
        (function (idx) {
          var unlocked = idx < save.unlocked;
          var best = save.best[idx];
          var st = best ? best.stars : 0;
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'lv-btn' + (idx === levelIdx ? ' is-cur' : '');
          b.disabled = !unlocked;
          b.innerHTML = '<span class="lv-num">' + (idx + 1) + '</span>' +
            '<span class="lv-name">' + FI.LEVELS[idx].name + '</span>' +
            '<span class="lv-stars">' + (unlocked ? ('★'.repeat(st) + '☆'.repeat(3 - st)) : '🔒') + '</span>';
          b.addEventListener('click', function () {
            sfx('select');
            startLevel(idx);
          });
          grid.appendChild(b);
        })(i);
      }
      block.appendChild(grid);
      wingsWrap.appendChild(block);
    }
  }

  function renderHats() {
    var curStars = FI.totalStars(save);
    hatsStars.textContent = '★ ' + curStars + ' / ' + (FI.LEVELS.length * 3);
    hatsGrid.innerHTML = '';
    for (var i = 0; i < FI.HATS.length; i++) {
      (function (hat) {
        var unlocked = curStars >= hat.stars;
        var equipped = save.hat === hat.id;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'hat-btn' + (equipped ? ' equipped' : '');
        b.disabled = !unlocked;
        var reqTxt = equipped ? 'مُرتداة ✓' : (unlocked ? 'اختيار' : ('تحتاج ★ ' + hat.stars));
        b.innerHTML = '<span class="hat-ico">' + hat.icon + '</span>' +
          '<span class="hat-lbl">' + hat.name + '</span>' +
          '<span class="hat-req">' + reqTxt + '</span>';
        b.addEventListener('click', function () {
          if (!unlocked) return;
          sfx('select');
          save.hat = hat.id;
          if (view) view.applyHat(save.hat);
          dirty = true;
          persistSave();
          renderHats();
        });
        hatsGrid.appendChild(b);
      })(FI.HATS[i]);
    }
  }

  /* --------------------------------------------------- game flow */
  function loadWorld(idx, nextMode) {
    levelIdx = Math.max(0, Math.min(FI.LEVELS.length - 1, idx | 0));
    world = FI.build(FI.LEVELS[levelIdx], levelIdx);
    activeHero = 'fire';
    movedOnLevel = false;
    winDelay = 0;
    winModalShown = false;
    deadDelay = 0;
    deadModalShown = false;
    lastHudSec = -1;
    mode = nextMode;
    if (view) {
      view.loadLevel(world);
      view.applyHat(save.hat);
    }
    syncHudCounters();
    syncHudTime(true);
    dirty = true;
  }

  function startLevel(idx) {
    respawnT = 0;
    hideOverlays();
    loadWorld(idx, 'play');
    hud.hidden = false;
    syncCoach();
    Kit.keys.reset();
    beginRound();
    if (view) {
      view.update(world, 0, renderCtx());
      view.render();
      dirty = false;
    }
    try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
  }

  function showTitle() {
    finishRound('quit');
    hideOverlays();
    hud.hidden = true;
    coachPill.hidden = true;
    var previewIdx = Math.max(0, Math.min(FI.LEVELS.length - 1, save.unlocked - 1));
    loadWorld(previewIdx, 'title');
    syncTitleUI();
    titleScreen.hidden = false;
    Kit.keys.reset();
  }

  function pauseGame() {
    if (mode !== 'play') return;
    mode = 'paused';
    Kit.keys.reset();
    hideOverlays();
    pauseLevelName.textContent = (levelIdx + 1) + '. ' + FI.LEVELS[levelIdx].name;
    pauseSoloBtn.textContent = 'النمط: ' + (save.solo ? 'لاعب واحد' : 'لاعبان');
    pauseScreen.hidden = false;
    coachPill.hidden = true;
    dirty = true; // draw once so paused visual state is fresh, then freeze completely
  }

  function resumeGame() {
    if (mode !== 'paused') return;
    sfx('select');
    hideOverlays();
    mode = 'play';
    Kit.keys.reset();
    syncCoach();
    dirty = true;
    try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
  }

  function setSolo(v) {
    save.solo = !!v;
    activeHero = 'fire';
    syncTitleUI();
    syncSoloChip();
    syncCoach();
    pauseSoloBtn.textContent = 'النمط: ' + (save.solo ? 'لاعب واحد' : 'لاعبان');
    dirty = true;
    persistSave();
  }

  function switchHero() {
    if (!save.solo || mode !== 'play') return;
    activeHero = activeHero === 'fire' ? 'ice' : 'fire';
    syncSoloChip();
    sfx('pop', activeHero === 'fire' ? 0.6 : 0.35);
    var h = activeHero === 'fire' ? world.fire : world.ice;
    if (view) view.burst(h.x + h.w / 2, h.y, activeHero, 8);
    dirty = true;
  }

  function onDeath(ev) {
    mode = 'dead';
    deadDelay = 0.55;
    deadModalShown = false;
    coachPill.hidden = true;
    sfx('fail');
    if (view) {
      view.addShake(0.65);
      view.burst(ev.x, ev.y, ev.cause === 'goo' ? 'goo' : ev.kind, 22);
    }
    finishRound('loss');
    var who = ev.kind === 'fire' ? 'شعلة' : 'ثلجة';
    var what = ev.cause === 'water' ? 'بركة الماء' : ev.cause === 'lava' ? 'بركة الحمم' : 'الوحل الأخضر';
    deadTitle.textContent = 'أوه! سقط ' + who;
    deadSub.textContent = 'احذر من ' + what + ' وحاول مجدداً!';
  }

  function onWin(ev) {
    mode = 'won';
    winDelay = 0.65;
    winModalShown = false;
    coachPill.hidden = true;
    sfx('levelUp');
    if (view) {
      view.burst(ev.x1, ev.y1, 'win', 22);
      view.burst(ev.x2, ev.y2, 'win', 22);
    }

    var res = FI.starsFor(world);
    var prevStars = FI.totalStars(save);
    var prevBest = save.best[levelIdx];
    var bestStars = Math.max(res.stars, prevBest ? prevBest.stars : 0);
    var bestTime = prevBest && prevBest.time != null ? Math.min(prevBest.time, world.t) : world.t;
    save.best[levelIdx] = { stars: bestStars, time: Math.round(bestTime * 100) / 100 };
    if (levelIdx + 1 >= save.unlocked && levelIdx + 1 < FI.LEVELS.length) {
      save.unlocked = levelIdx + 2;
    }
    if (levelIdx === FI.LEVELS.length - 1) save.beaten = true;

    // Persist immediately BEFORE win modal delay so reload/close never loses progress!
    persistSave();

    var newStars = FI.totalStars(save);
    var unlockedNow = null;
    for (var i = 0; i < FI.HATS.length; i++) {
      var ht = FI.HATS[i];
      if (ht.stars > prevStars && ht.stars <= newStars) unlockedNow = ht;
    }

    if (levelIdx === 0 && !tutDone) {
      tutDone = true;
      Kit.stats.tutorial('done');
    }
    finishRound('win', res.stars);

    winBadge.textContent = levelIdx === FI.LEVELS.length - 1 ? 'أتممت كل المعابد!' : (res.stars === 3 ? 'أداء أسطوري!' : 'عمل جماعي رائع!');
    winTitle.textContent = 'فُتح معبد ' + FI.LEVELS[levelIdx].name + '!';
    winStars.textContent = '★'.repeat(res.stars) + '☆'.repeat(3 - res.stars);
    winTime.textContent = FI.formatTime(world.t);
    winPar.textContent = FI.formatTime(world.par);
    var gotAll = world.gemsGot.fire + world.gemsGot.ice;
    var totAll = world.gemsTotal.fire + world.gemsTotal.ice;
    winGems.textContent = gotAll + ' / ' + totAll;
    if (unlockedNow) {
      winUnlock.hidden = false;
      winUnlock.textContent = '🎉 فتحت قبعة جديدة: ' + unlockedNow.icon + ' ' + unlockedNow.name;
    } else {
      winUnlock.hidden = true;
    }
    winNext.textContent = levelIdx + 1 < FI.LEVELS.length ? 'المعبد التالي' : 'خريطة المعابد';
  }

  /* --------------------------------------------------- input reading */
  function readInputs() {
    var k = Kit.keys;
    if (save.solo) {
      var mv = {
        l: k.anyDown(['ArrowLeft', 'KeyA']),
        r: k.anyDown(['ArrowRight', 'KeyD']),
        j: k.anyDown(['ArrowUp', 'KeyW', 'Space'])
      };
      var zero = { l: false, r: false, j: false };
      return activeHero === 'fire' ? { fire: mv, ice: zero } : { fire: zero, ice: mv };
    }
    return {
      fire: { l: k.down('ArrowLeft'), r: k.down('ArrowRight'), j: k.down('ArrowUp') },
      ice: { l: k.down('KeyA'), r: k.down('KeyD'), j: k.down('KeyW') }
    };
  }

  function renderCtx() {
    return { mode: mode, solo: save.solo, activeHero: activeHero };
  }

  /* --------------------------------------------------- fixed update */
  function stepSim(dt) {
    if (mode === 'play' && world) {
      if (save.solo && Kit.keys.pressed('Tab')) {
        switchHero();
      }
      var inp = readInputs();
      if (!movedOnLevel && (inp.fire.l || inp.fire.r || inp.fire.j || inp.ice.l || inp.ice.r || inp.ice.j)) {
        movedOnLevel = true;
        syncCoach();
      }
      FI.step(world, inp, dt);
      handleWorldEvents(world);
      if (respawnT > 0 && (respawnT -= dt) <= 0) { respawnT = 0; coachPill.hidden = true; syncCoach(); }
      syncHudTime(false);
    } else if (mode === 'dead') {
      if (!deadModalShown) {
        deadDelay -= dt;
        if (deadDelay <= 0) {
          deadModalShown = true;
          deadScreen.hidden = false;
        }
      }
    } else if (mode === 'won') {
      if (!winModalShown) {
        winDelay -= dt;
        if (winDelay <= 0) {
          winModalShown = true;
          winScreen.hidden = false;
        }
      }
    }
    Kit.keys.endFrame();

    // Update 3D diorama animations ONLY when not paused!
    if (view && mode !== 'paused') {
      view.update(world, dt, renderCtx());
    }
  }

  function renderFrame() {
    if (!view || contextLost) return;
    // Strict pause freeze: render only once when dirty (pause entry, resize, context restore)
    if (mode === 'paused') {
      if (!dirty) return;
      view.render();
      dirty = false;
      return;
    }
    var playing = (mode === 'play');
    if (!dirty && !view.mayDraw(performance.now(), playing)) return;
    var t0 = performance.now();
    view.render();
    dirty = false;
    if (playing) view.frameTime(performance.now() - t0);
  }

  /* --------------------------------------------------- DOM events */
  playBtn.addEventListener('click', function () {
    sfx('select');
    var target = Math.max(0, Math.min(FI.LEVELS.length - 1, save.unlocked - 1));
    startLevel(target);
  });
  modeDuoBtn.addEventListener('click', function () { sfx('toggle', false); setSolo(false); });
  modeSoloBtn.addEventListener('click', function () { sfx('toggle', true); setSolo(true); });
  mapBtn.addEventListener('click', function () {
    sfx('select');
    returnMode = 'title';
    hideOverlays();
    renderMap();
    mapScreen.hidden = false;
    mode = 'map';
  });
  hatsBtn.addEventListener('click', function () {
    sfx('select');
    returnMode = 'title';
    hideOverlays();
    renderHats();
    hatsScreen.hidden = false;
    mode = 'hats';
  });

  $('pauseBtn').addEventListener('click', function () { sfx('tap'); pauseGame(); });
  $('hudRestartBtn').addEventListener('click', function () { sfx('tap'); startLevel(levelIdx); });
  soloChip.addEventListener('click', function () { switchHero(); try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } });

  $('resumeBtn').addEventListener('click', resumeGame);
  $('restartBtn').addEventListener('click', function () { sfx('select'); startLevel(levelIdx); });
  pauseSoloBtn.addEventListener('click', function () { sfx('toggle', !save.solo); setSolo(!save.solo); });
  $('pauseMapBtn').addEventListener('click', function () {
    sfx('select');
    returnMode = 'paused';
    hideOverlays();
    renderMap();
    mapScreen.hidden = false;
    mode = 'map';
  });
  $('pauseHomeBtn').addEventListener('click', function () { sfx('back'); showTitle(); });

  $('retryBtn').addEventListener('click', function () { sfx('select'); startLevel(levelIdx); });
  $('deadMapBtn').addEventListener('click', function () {
    sfx('select');
    returnMode = 'title';
    hideOverlays();
    renderMap();
    mapScreen.hidden = false;
    mode = 'map';
  });

  winNext.addEventListener('click', function () {
    sfx('select');
    if (levelIdx + 1 < FI.LEVELS.length) {
      startLevel(levelIdx + 1);
    } else {
      returnMode = 'title';
      hideOverlays();
      renderMap();
      mapScreen.hidden = false;
      mode = 'map';
    }
  });
  $('winReplay').addEventListener('click', function () { sfx('select'); startLevel(levelIdx); });
  $('winMap').addEventListener('click', function () {
    sfx('select');
    returnMode = 'title';
    hideOverlays();
    renderMap();
    mapScreen.hidden = false;
    mode = 'map';
  });

  $('mapBackBtn').addEventListener('click', function () {
    sfx('back');
    hideOverlays();
    if (returnMode === 'paused') {
      mode = 'paused';
      pauseScreen.hidden = false;
      dirty = true;
    } else {
      showTitle();
    }
  });
  $('hatsBackBtn').addEventListener('click', function () {
    sfx('back');
    showTitle();
  });
  $('errReloadBtn').addEventListener('click', function () { window.location.reload(); });

  // Keyboard shortcuts (always respecting native controls!)
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Tab' && e.shiftKey) { shiftSawTab = true; return; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { shiftSawTab = false; return; }

    if (e.code === 'Escape') {
      if (mode === 'play') { e.preventDefault(); pauseGame(); }
      else if (mode === 'paused') { e.preventDefault(); resumeGame(); }
      else if (mode === 'map' || mode === 'hats') {
        e.preventDefault();
        sfx('back');
        if (returnMode === 'paused') { hideOverlays(); mode = 'paused'; pauseScreen.hidden = false; dirty = true; }
        else showTitle();
      }
      return;
    }

    if (Kit.keys.isNativeTarget(e.target)) return;

    if (e.code === 'KeyP' && !e.repeat) {
      if (mode === 'play') { e.preventDefault(); pauseGame(); }
      else if (mode === 'paused') { e.preventDefault(); resumeGame(); }
      return;
    }
    if (e.code === 'KeyR' && !e.repeat && (mode === 'play' || mode === 'dead' || mode === 'paused')) {
      e.preventDefault();
      sfx('tap');
      startLevel(levelIdx);
      return;
    }
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
      if (mode === 'title') {
        e.preventDefault();
        sfx('select');
        startLevel(Math.max(0, Math.min(FI.LEVELS.length - 1, save.unlocked - 1)));
      } else if (mode === 'dead') {
        e.preventDefault();
        sfx('select');
        startLevel(levelIdx);
      } else if (mode === 'won' && winModalShown) {
        e.preventDefault();
        winNext.click();
      }
    }
  });

  // Allow single-tap Shift in 1P mode to switch active hero without clashing with Shift+Tab
  window.addEventListener('keyup', function (e) {
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !shiftSawTab && mode === 'play' && save.solo) {
      if (!Kit.keys.isNativeTarget(e.target)) switchHero();
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') shiftSawTab = false;
  });

  /* --------------------------------------------------- Kit hooks */
  Kit.muteButton();
  Kit.keys.captureTab(function () { return mode === 'play' && save.solo; });
  Kit.lifecycle({
    pause: function () { pauseGame(); },
    reset: function () { Kit.keys.reset(); }
  });

  function resizeView() {
    if (!view) return;
    view.resize(window.innerWidth, window.innerHeight);
    view.calm = isReducedMotion();
    dirty = true;
    if (mode === 'paused' && !contextLost) {
      view.render();
      dirty = false;
    }
  }
  window.addEventListener('resize', resizeView);
  if (mqReduce && mqReduce.addEventListener) {
    mqReduce.addEventListener('change', function () {
      if (view) view.calm = isReducedMotion();
    });
  }

  /* --------------------------------------------------- test & debug API */
  function exposeApi() {
    var api = {
      load: function (n) {
        var idx = Math.max(0, Math.min(FI.LEVELS.length - 1, (n | 0) - 1));
        startLevel(idx);
        return idx + 1;
      },
      solo: function (v) { setSolo(!!v); return save.solo; },
      win: function () {
        if (!world || world.state !== 'play') return false;
        world.state = 'won';
        onWin({
          x1: world.doors.fire.x + world.doors.fire.w / 2,
          y1: world.doors.fire.y + world.doors.fire.h / 2,
          x2: world.doors.ice.x + world.doors.ice.w / 2,
          y2: world.doors.ice.y + world.doors.ice.h / 2
        });
        return true;
      },
      stars: function () { return FI.totalStars(save); },
      unlockAll: function () {
        save.unlocked = FI.LEVELS.length;
        for (var i = 0; i < FI.LEVELS.length; i++) {
          save.best[i] = { stars: 3, time: FI.LEVELS[i].par - 2 };
        }
        save.beaten = true;
        persistSave();
        syncTitleUI();
        return FI.totalStars(save);
      },
      particles: function () { return view ? view.particleCount() : 0; },
      draws: function () { return view ? view.drawCount() : 0; },
      bench: function (n) {
        var steps = Math.max(1, n | 0);
        for (var i = 0; i < steps; i++) stepSim(1 / 60);
        if (view && !contextLost && mode !== 'paused') view.render();
        return { mode: mode, t: world ? world.t : 0, draws: view ? view.drawCount() : 0 };
      }
    };
    Object.defineProperties(api, {
      mode: { get: function () { return mode; }, enumerable: true },
      world: { get: function () { return world; }, enumerable: true },
      save: { get: function () { return save; }, enumerable: true },
      activeHero: { get: function () { return activeHero; }, enumerable: true },
      levelIdx: { get: function () { return levelIdx; }, enumerable: true }
    });
    window.__game = api;
  }

  /* --------------------------------------------------- bootstrap */
  function boot() {
    try {
      view = FI.createView(canvas);
    } catch (err) {
      titleScreen.hidden = true;
      hud.hidden = true;
      scrError.hidden = false;
      window.__game = { mode: 'error', error: String(err && err.message || err) };
      Kit.fail(err);
      return;
    }

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      contextLost = true;
      if (mode === 'play') pauseGame();
      contextNotice.hidden = false;
    });
    canvas.addEventListener('webglcontextrestored', function () {
      contextLost = false;
      contextNotice.hidden = true;
      view.resize(window.innerWidth, window.innerHeight);
      if (world) {
        view.loadLevel(world);
        view.applyHat(save.hat);
        view.update(world, 0, renderCtx());
      }
      dirty = true;
      view.render();
      dirty = false;
    });

    view.calm = isReducedMotion();
    loadWorld(levelIdx, 'title');
    syncTitleUI();
    titleScreen.hidden = false;
    hud.hidden = true;
    resizeView();
    view.update(world, 0, renderCtx());
    view.render();
    dirty = false;

    if (view.software) { try { view.renderer.getContext().finish(); } catch (e) { /* ignore */ } }
    exposeApi();
    Kit.loop(stepSim, renderFrame);
    Kit.ready();
  }

  boot();
})();
