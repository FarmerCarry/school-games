/* Block World — TNT Mine Dash (عالم المكعبات)
 * 1-click launch over live animated mine, 2 effortless verbs (Move+Auto-Drill+Jetpack & TNT),
 * 90-second 3-Relic Escape Heist + 1-click Result Card Upgrades + Free Sandbox toggle! */
(function () {
  'use strict';
  var BW = window.BW;
  var J = Kit.juice;
  var $ = function (id) { return document.getElementById(id); };

  var canvas = $('game'), ui = $('ui');
  var G = {
    mode: 'title', // 'title' | 'play' | 'pause' | 'result'
    gm: 'heist',   // 'heist' | 'free'
    world: null,
    titleWorld: null,
    play: 0,       // Elapsed gameplay seconds (frozen on pause, tested by runtime-cleanup!)
    tod: 0,        // Continuous play clock (frozen on pause, tested by game-scenarios!)
    saveError: null,
    savedFlash: 0,
    dirty: true,
    snap: true
  };

  var view = Kit.fit(canvas, 1280, 720, {
    onResize: function (v) {
      var r = canvas.getBoundingClientRect();
      ui.style.left = r.left + 'px';
      ui.style.top = r.top + 'px';
      ui.style.transform = 'scale(' + v.scale + ')';
      G.dirty = true;
    }
  });
  var rend = BW.createRenderer(canvas, view.ctx);
  var particles = Kit.particles();
  var shake = Kit.shake({ decay: 3.4 });

  /* ------------------------------------------------- Persistence + Status */
  var store = Kit.store('block-world');
  var saveStatus = Kit.saveStatus({ retry: function () { persist(true); } });
  var dda = Kit.dda('block-world', { id: 'heist', target: 0.72, tiers: 5 });

  var rawStored = store.get('save', null);
  var saveData = BW.loadSave(rawStored);

  var time = 0, bannerT = 0, resultLock = 0;
  var lastResult = null;
  var pointer = { down: false, x: 640, y: 360, downAt: 0, startX: 0, startY: 0, dragged: false };
  var pendingTnt = null, pendingPlace = null;
  var hudCache = { gems: -1, relics: -1, time: -1, ammo: -1, goal: '' };

  function say(txt) { $('live').textContent = txt; }
  function focusCanvas() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function onBtn(el, fn) {
    el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.detail > 0) el.blur();
      fn(e);
    });
  }

  function persist(includeWorld) {
    var payload = {
      v: BW.SAVE_VERSION,
      gems: saveData.gems,
      bestScore: saveData.bestScore,
      bestTime: saveData.bestTime,
      wins: saveData.wins,
      totalStars: saveData.totalStars,
      runs: saveData.runs,
      freeMode: saveData.freeMode,
      upgrades: saveData.upgrades
    };
    if (includeWorld && G.world && !G.world.done) {
      payload.run = G.world.serialize();
    }
    var ok = store.set('save', payload);
    if (!ok) {
      G.saveError = 'save';
      G.savedFlash = 0;
      saveStatus.failed();
      return false;
    }
    G.saveError = null;
    G.savedFlash = 1.5;
    saveStatus.saved();
    return true;
  }

  /* --------------------------------------------------------------- Screens */
  function setMode(next) {
    G.mode = next;
    $('title').hidden = next !== 'title';
    $('pause').hidden = next !== 'pause';
    $('result').hidden = next !== 'result';
    $('hud').hidden = !(next === 'play' || next === 'pause');
    $('pausebtn').hidden = next !== 'play';
    G.dirty = true;
    if (next === 'play') focusCanvas();
  }

  function refreshTitle() {
    $('titleGems').textContent = String(saveData.gems);
    $('titleStars').textContent = String(saveData.totalStars);
    $('titleWinsPill').hidden = saveData.wins <= 0;
    $('titleWins').textContent = String(saveData.wins);
    var free = !!saveData.freeMode;
    $('modeSurv').classList.toggle('on', !free);
    $('modeSurv').setAttribute('aria-pressed', String(!free));
    $('modeFree').classList.toggle('on', free);
    $('modeFree').setAttribute('aria-pressed', String(free));
  }

  function showBanner(text) {
    var el = $('banner');
    el.textContent = text;
    el.hidden = false;
    bannerT = 2.0;
  }

  function buildSandboxBar() {
    var bar = $('sandboxBar');
    bar.innerHTML = '';
    BW.SANDBOX_PALETTE.forEach(function (item, idx) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sb-btn' + (idx === 0 ? ' on' : '');
      b.textContent = (idx + 1) + ' ' + item.name;
      onBtn(b, function () {
        if (!G.world) return;
        G.world.selBlock = idx;
        refreshSandboxBar();
        J.tap();
      });
      bar.appendChild(b);
    });
  }
  function refreshSandboxBar() {
    if (!G.world) return;
    var btns = $('sandboxBar').children;
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', i === G.world.selBlock);
  }

  /* ----------------------------------------------------------- Run Control */
  function startRun(opts) {
    opts = opts || {};
    var free = opts.freeMode != null ? !!opts.freeMode : !!saveData.freeMode;
    G.gm = free ? 'free' : 'heist';
    var seed = opts.seed || (((Date.now() ^ (saveData.runs * 7919)) >>> 0) || 4219);
    G.world = BW.createWorld({
      seed: seed,
      freeMode: free,
      ddaLevel: dda.level,
      upgrades: saveData.upgrades
    });
    saveData.runs++;
    G.play = 0;
    G.tod = 0;
    G.snap = true;
    particles.clear();
    rend.clearFx();
    Kit.hitstop.reset();
    pointer.down = false;
    pendingTnt = null;
    pendingPlace = null;
    hudCache = { gems: -1, relics: -1, time: -1, ammo: -1, goal: '' };
    $('sandboxBar').hidden = !free;
    if (free) refreshSandboxBar();
    syncHud();
    setMode('play');
    Kit.stats.round(free ? 'free' : 'heist');
    showBanner(free ? '🧱 وضع حر: احفر وفجّر بحرية!' : '💣 اجمع 3 آثار واهرب قبل انتهاء الوقت!');
    say(free ? 'بدأ الوضع الحر' : 'بدأت مهمة المنجم');
  }

  function pauseGame(playSfx, saveNow) {
    if (G.mode === 'play') {
      if (playSfx) J.back();
      var w = G.world;
      $('pauseStats').textContent = w
        ? ('الآثار: ' + w.relicsGot + '/3  •  الجواهر: ' + w.gemsRun + ' 💎')
        : '';
      setMode('pause');
      say('استراحة');
    }
    if (saveNow && G.world && (G.mode === 'pause' || G.mode === 'play')) {
      persist(true);
    }
  }

  function resumeGame() {
    if (G.mode !== 'pause') return;
    J.select();
    Kit.keys.reset();
    pointer.down = false;
    pendingTnt = null;
    pendingPlace = null;
    setMode('play');
    say('متابعة اللعب');
  }

  function returnTitle() {
    if (G.mode === 'play' || G.mode === 'pause') {
      if (G.world && G.world.gemsRun > 0) saveData.gems += G.world.gemsRun;
      persist(false);
      Kit.stats.end('quit', G.world ? G.world.score : 0);
    }
    G.world = null;
    if (!G.titleWorld) G.titleWorld = BW.createWorld({ seed: 2026, freeMode: true, upgrades: saveData.upgrades });
    G.snap = true;
    refreshTitle();
    setMode('title');
  }

  /* --------------------------------------------------- Result & Upgrades */
  function finishRun(won) {
    var w = G.world;
    var stars = BW.computeStars(won, w.timeLeft, w.gemsRun, w.score);
    saveData.gems += w.gemsRun;
    if (w.score > saveData.bestScore) saveData.bestScore = w.score;
    if (won) {
      saveData.wins++;
      saveData.totalStars += stars;
      var elapsed = Math.max(1, Math.round(w.duration - w.timeLeft));
      if (!saveData.bestTime || elapsed < saveData.bestTime) saveData.bestTime = elapsed;
    }
    var outcome = won ? (0.58 + stars * 0.14) : BW.clamp(w.relicsGot * 0.24, 0, 0.45);
    dda.result(outcome);
    Kit.stats.end(won ? 'win' : 'lose', w.score);
    persist(false);

    lastResult = { won: won, stars: stars, gems: w.gemsRun, score: w.score, relics: w.relicsGot, timeLeft: Math.ceil(w.timeLeft) };
    resultLock = 0.35;

    $('resTitle').textContent = won
      ? (stars === 3 ? '🏆 أسطورة المنجم!' : '🎉 هربت بالكنز!')
      : (w.relicsGot >= 2 ? '⏱️ قريب جدًا!' : '⏱️ انتهى الوقت!');
    $('resSub').textContent = won
      ? ('جمعت 3 آثار وهربت وبقي ' + Math.ceil(w.timeLeft) + ' ثانية!')
      : ('جمعت ' + w.relicsGot + '/3 آثار واحتفظت بكل الجواهر لتطوير أدواتك!');
    $('resGems').textContent = '+' + w.gemsRun;
    $('resScore').textContent = String(w.score);

    var starSpans = $('resStars').children;
    for (var i = 0; i < starSpans.length; i++) starSpans[i].classList.remove('on');
    $('resStars').hidden = !won;
    if (won) {
      J.levelUp();
      for (var s = 0; s < stars; s++) (function (idx) {
        setTimeout(function () {
          if (G.mode === 'result') { starSpans[idx].classList.add('on'); J.star(idx + 1); }
        }, 160 + idx * 220);
      })(s);
    } else {
      J.fail();
    }

    renderUpgrades();
    setMode('result');
    say($('resTitle').textContent);
  }

  function renderUpgrades() {
    $('resBank').textContent = String(saveData.gems);
    var grid = $('upgradeGrid');
    grid.innerHTML = '';
    BW.UPGRADES.forEach(function (u) {
      var lv = saveData.upgrades[u.id] || 1;
      var cost = BW.upgradeCost(saveData, u.id);
      var maxed = lv >= u.max;
      var afford = !maxed && saveData.gems >= cost;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'up-card' + (afford ? ' afford' : '') + (maxed ? ' maxed' : '');
      btn.dataset.upgrade = u.id;
      btn.disabled = maxed || !afford;
      btn.innerHTML = '<span class="up-ico">' + u.icon + '</span>'
        + '<span class="up-name">' + u.name + '</span>'
        + '<span class="up-lv" dir="ltr">Lv ' + lv + '/' + u.max + '</span>'
        + '<span class="up-cost">' + (maxed ? 'أقصى مستوى ✓' : ('💎 ' + cost)) + '</span>';
      onBtn(btn, function () {
        if (BW.buyUpgrade(saveData, u.id)) {
          J.levelUp();
          persist(false);
          renderUpgrades();
        } else {
          J.error();
        }
      });
      grid.appendChild(btn);
    });
  }

  /* --------------------------------------------------------------- HUD Sync */
  function syncHud() {
    var w = G.world;
    if (!w) return;
    var p = w.p;
    if (hudCache.relics !== w.relicsGot) {
      hudCache.relics = w.relicsGot;
      $('hudRelics').textContent = w.relicsGot + '/3';
      var slots = $('relicsHud').querySelectorAll('.r-slot');
      for (var i = 0; i < slots.length; i++) slots[i].classList.toggle('got', w.relics[i] && w.relics[i].got);
    }
    if (hudCache.gems !== w.gemsRun) {
      hudCache.gems = w.gemsRun;
      $('hudGems').textContent = String(w.gemsRun);
    }
    var fuelPct = Math.round(BW.clamp(p.fuel / Math.max(0.01, p.fuelMax), 0, 1) * 100);
    $('fuelFill').style.width = fuelPct + '%';

    var tDisp = w.freeMode ? -1 : Math.ceil(w.timeLeft);
    if (hudCache.time !== tDisp) {
      hudCache.time = tDisp;
      $('hudTime').textContent = w.freeMode ? '♾️' : String(tDisp);
      $('hudTimeUnit').hidden = w.freeMode;
      $('timerPill').classList.toggle('urgent', !w.freeMode && tDisp <= 15);
    }
    var goalText = w.freeMode ? 'وضع حر — نقرة يمين للبناء' : (w.relicsGot >= 3 ? '✨ اهرب للبوابة الآن!' : 'اجمع 3 آثار متوهجة!');
    if (hudCache.goal !== goalText) {
      hudCache.goal = goalText;
      var gEl = $('hudGoal');
      gEl.textContent = goalText;
      gEl.classList.toggle('escape', w.relicsGot >= 3 && !w.freeMode);
    }
    var ammo = w.freeMode ? 99 : p.tntAmmo;
    if (hudCache.ammo !== ammo) {
      hudCache.ammo = ammo;
      $('tntAmmo').textContent = w.freeMode ? '∞' : (p.tntAmmo + '/' + p.tntMax);
      $('tntBtn').classList.toggle('empty', !w.freeMode && p.tntAmmo <= 0);
    }
  }

  /* -------------------------------------------------------- Events & Loop */
  function handleEvents(w) {
    var TS = BW.TS;
    for (var i = 0; i < w.ev.length; i++) {
      var ev = w.ev[i];
      if (ev.t === 'dig') {
        if (!ev.blast) {
          J.pop(0.35);
          particles.burst(ev.x * TS, ev.y * TS, { count: 6, color: ev.col || '#b58456', speed: 150, life: 0.35, size: 6 });
        }
      } else if (ev.t === 'plant') {
        J.tap();
      } else if (ev.t === 'tntChain') {
        J.chime(1);
        rend.addFloat(ev.x, ev.y - 0.6, 'سلسلة TNT! 🔥', '#ffae33');
      } else if (ev.t === 'boom') {
        J.impact(1.0);
        Kit.sfx.boom();
        Kit.hitstop(0.045);
        shake.add(ev.chain ? 18 : 13);
        rend.addRing(ev.x, ev.y, ev.r * 1.15, ev.chain ? '#ffe44d' : '#ff6b35');
        particles.burst(ev.x * TS, ev.y * TS, {
          count: 26, colors: ['#fff27a', '#ff7b29', '#ff3b5c', '#58607a', '#a87248'],
          speed: 320, life: 0.62, size: 9, gravity: 380
        });
        Kit.track.hit();
      } else if (ev.t === 'gem') {
        J.coin(Math.min(5, ev.streak));
        if (ev.val >= 10) rend.addFloat(ev.x, ev.y - 0.4, '+' + ev.val + ' 💎', ev.col);
      } else if (ev.t === 'relic') {
        J.chime(3);
        Kit.hitstop(0.055);
        shake.add(10);
        rend.addRing(ev.x, ev.y, 3.2, ev.col);
        particles.burst(ev.x * TS, ev.y * TS, { count: 32, colors: [ev.col, '#ffffff', '#ffd633'], speed: 300, life: 0.78, size: 8, gravity: 240 });
        rend.addFloat(ev.x, ev.y - 0.8, ev.name + '!', ev.col);
        showBanner('✨ ' + ev.name + ' (' + ev.count + '/3)');
      } else if (ev.t === 'portalOpen') {
        J.levelUp();
        showBanner('🚪 بوابة الخروج مفتوحة! اهرب الآن!');
      } else if (ev.t === 'slimePop') {
        J.pop(0.9);
        particles.burst(ev.x * TS, ev.y * TS, { count: 18, colors: [ev.col, '#ffffff'], speed: 240, life: 0.5, size: 8 });
        rend.addFloat(ev.x, ev.y - 0.5, '+75!', ev.col);
      } else if (ev.t === 'bonk') {
        J.error();
        shake.add(9);
        Kit.track.miss();
        rend.addFloat(ev.x, ev.y - 0.6, '-3ث!', '#ff5277');
      } else if (ev.t === 'place') {
        J.tap();
      } else if (ev.t === 'win') {
        finishRun(true);
      } else if (ev.t === 'timeout') {
        finishRun(false);
      }
    }
    w.ev.length = 0;
  }

  function update(dt) {
    time += dt;
    if (resultLock > 0) resultLock = Math.max(0, resultLock - dt);
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').hidden = true; }
    if (G.savedFlash > 0) G.savedFlash = Math.max(0, G.savedFlash - dt);

    if (G.mode === 'title' && G.titleWorld) {
      // Gentle live animated mine behind title screen (zero sound!)
      var tw = G.titleWorld;
      var hoverX = 32.5 + Math.sin(time * 0.9) * 2.2;
      var hoverY = 8.4 + Math.cos(time * 1.6) * 0.7;
      BW.step(tw, dt, { steer: { x: hoverX, y: hoverY } });
      tw.ev.length = 0;
      G.dirty = true;
    } else if (G.mode === 'pause') {
      // Let active visual effects settle quickly, then freeze 100% (0 canvas paints!)
      if (particles.list.length > 0 || rend.hasFx() || shake.trauma > 0) {
        particles.update(dt);
        rend.updateFx(dt);
        shake.update(dt);
        G.dirty = true;
      }
    } else if (G.mode === 'play' && G.world) {
      shake.update(dt);
      particles.update(dt);
      rend.updateFx(dt);

      if (Kit.hitstop.tick(dt)) {
        Kit.keys.endFrame();
        G.dirty = true;
        return;
      }

      G.play += dt;
      G.tod += dt;

      var left = Kit.keys.anyDown(['ArrowLeft', 'KeyA']);
      var right = Kit.keys.anyDown(['ArrowRight', 'KeyD']);
      var up = Kit.keys.anyDown(['ArrowUp', 'KeyW']);
      var down = Kit.keys.anyDown(['ArrowDown', 'KeyS']);
      var tntKey = Kit.keys.anyPressed(['Space', 'KeyE', 'KeyF']);

      var steer = null;
      if (pointer.down && (pointer.dragged || (time - pointer.downAt) > 0.14)) {
        steer = rend.screenToWorld(pointer.x, pointer.y);
      }

      var inp = {
        left: left, right: right, up: up, down: down,
        steer: steer,
        tntPressed: tntKey || !!pendingTnt,
        tntX: pendingTnt ? pendingTnt.x : null,
        tntY: pendingTnt ? pendingTnt.y : null,
        placePressed: !!pendingPlace,
        placeX: pendingPlace ? pendingPlace.x : null,
        placeY: pendingPlace ? pendingPlace.y : null
      };
      pendingTnt = null;
      pendingPlace = null;

      BW.step(G.world, dt, inp);
      handleEvents(G.world);
      syncHud();
      G.dirty = true;
    }

    Kit.keys.endFrame();
  }

  function render() {
    var activeWorld = G.world || G.titleWorld;
    if (!activeWorld) return;
    if (G.mode === 'pause' && !G.dirty) return;
    rend.draw(activeWorld, {
      dt: 1 / 60,
      t: G.mode === 'play' ? G.tod : time,
      shake: shake,
      particles: particles,
      snap: G.snap,
      hideArrows: G.mode === 'title'
    });
    G.snap = false;
    G.dirty = false;
  }

  /* ------------------------------------------------- Keyboard & Mouse Wire */
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      if (G.mode === 'play') pauseGame(true, false);
      else if (G.mode === 'pause') resumeGame();
      return;
    }
    if (G.mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault(); J.select(); startRun(); return;
    }
    if (G.mode === 'pause') {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); resumeGame(); }
      else if (e.code === 'KeyR') { e.preventDefault(); J.select(); startRun(); }
      return;
    }
    if (G.mode === 'result' && resultLock <= 0) {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR') {
        e.preventDefault(); J.select(); startRun(); return;
      }
    }
    if (G.mode === 'play' && G.world && G.world.freeMode) {
      var m = /^Digit([1-4])$/.exec(e.code);
      if (m) {
        G.world.selBlock = Number(m[1]) - 1;
        refreshSandboxBar();
        J.tap();
      }
    }
  });

  canvas.addEventListener('pointerdown', function (e) {
    focusCanvas();
    if (G.mode !== 'play' || !G.world) return;
    var lp = view.toLogical(e.clientX, e.clientY);
    var wp = rend.screenToWorld(lp.x, lp.y);
    if (e.button === 2) {
      if (G.world.freeMode) pendingPlace = wp;
      else pendingTnt = { x: G.world.p.x, y: G.world.p.y };
      return;
    }
    if (e.button !== 0) return;
    pointer.down = true;
    pointer.x = lp.x; pointer.y = lp.y;
    pointer.startX = lp.x; pointer.startY = lp.y;
    pointer.downAt = time;
    pointer.dragged = false;
  });

  window.addEventListener('pointermove', function (e) {
    if (!pointer.down) return;
    var lp = view.toLogical(e.clientX, e.clientY);
    pointer.x = lp.x; pointer.y = lp.y;
    if (Math.hypot(lp.x - pointer.startX, lp.y - pointer.startY) > 18) pointer.dragged = true;
  });

  window.addEventListener('pointerup', function (e) {
    if (e.button !== 0 || !pointer.down) return;
    var quickTap = !pointer.dragged && (time - pointer.downAt) < 0.22;
    pointer.down = false;
    if (quickTap && G.mode === 'play' && G.world) {
      pendingTnt = { x: G.world.p.x, y: G.world.p.y };
    }
  });
  window.addEventListener('pointercancel', function () { pointer.down = false; });

  onBtn($('playBtn'), function () { J.select(); startRun(); });
  onBtn($('modeSurv'), function () {
    if (G.mode !== 'title') return; // Harmless if clicked after Play starts
    saveData.freeMode = false; refreshTitle(); J.tap();
  });
  onBtn($('modeFree'), function () {
    if (G.mode !== 'title') return;
    saveData.freeMode = true; refreshTitle(); J.tap();
  });
  onBtn($('tntBtn'), function () {
    if (G.mode === 'play' && G.world) pendingTnt = { x: G.world.p.x, y: G.world.p.y };
  });
  onBtn($('pausebtn'), function () { pauseGame(true, false); });
  onBtn($('resumeBtn'), resumeGame);
  onBtn($('restartBtn'), function () { J.select(); startRun(); });
  onBtn($('quitBtn'), function () { J.back(); returnTitle(); });
  onBtn($('againBtn'), function () { J.select(); startRun(); });
  onBtn($('resultHome'), function () { J.back(); returnTitle(); });

  /* --------------------------------------------------- Lifecycle & Boot */
  Kit.muteButton();
  Kit.lifecycle({
    pause: function (reason) {
      pauseGame(false, reason === 'hidden' || reason === 'portal');
    },
    reset: function () { pointer.down = false; pendingTnt = null; pendingPlace = null; }
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { G.dirty = true; });
  }
  canvas.addEventListener('contextrestored', function () {
    view.resize();
    G.dirty = true;
  });

  buildSandboxBar();
  G.titleWorld = BW.createWorld({ seed: 2026, freeMode: true, upgrades: saveData.upgrades });
  refreshTitle();
  setMode('title');
  view.resize();

  window.__game = {
    G: G,
    get player() { return G.world ? G.world.p : (G.titleWorld ? G.titleWorld.p : null); },
    get saveData() { return saveData; },
    save: function () { return persist(true); },
    startRun: startRun,
    pause: function () { pauseGame(false, false); },
    resume: resumeGame,
    plantTNT: function (x, y) { return G.world ? BW.plantTNT(G.world, x, y) : false; },
    buyUpgrade: function (id) {
      var ok = BW.buyUpgrade(saveData, id);
      if (ok) { persist(false); if (G.mode === 'result') renderUpgrades(); }
      return ok;
    },
    render: render
  };

  Kit.loop(update, render);
  Kit.ready();
})();
