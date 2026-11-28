/* Shortcut Factory — Toy Claw Rush! Game controller, Kit integration, Stages & Result-Card Upgrades. */
(function () {
  'use strict';
  var Kit = window.Kit, SF = window.SF, J = Kit.juice;
  var $ = function (id) { return document.getElementById(id); };

  var canvas = $('game');
  var view = Kit.fit(canvas, SF.W, SF.H, { maxDpr: 1.5 });
  var ctx = view.ctx;
  var store = Kit.store('shortcut-factory');
  var dda = Kit.dda('shortcut-factory', { id: 'main', start: 0.30, target: 0.74, tiers: 5 });
  var shake = Kit.shake({ decay: 3.4 });
  var particles = Kit.particles();
  Kit.muteButton();

  var save = SF.loadSave(store.get('save2', null));
  var saveStatus = Kit.saveStatus({ retry: function () { persist(); } });
  function persist() {
    var ok = store.set('save2', save);
    if (ok) saveStatus.saved();
    else saveStatus.failed();
    return ok;
  }

  var screen = 'title'; // 'title' | 'play' | 'pause' | 'result' | 'map' | 'shop'
  var world = SF.create({ demo: true, level: 0, upg: save.upg, seed: 3030 });
  var popups = [];
  var idleSec = 0;
  var resultLock = 0;
  var roundOpen = false;
  var dropQueued = false;
  var runSeed = 200;

  function addPopup(x, y, text, color, size) {
    if (Kit.motion.reduced()) return;
    popups.push({ x: x, y: y, text: text, color: color || '#ffe14f', size: size || 30, life: 0.9, max: 0.9 });
    if (popups.length > 14) popups.shift();
  }

  function setScreen(next) {
    screen = next;
    $('scrTitle').hidden = next !== 'title';
    $('hud').hidden = next !== 'play' && next !== 'pause';
    $('btnPause').hidden = next !== 'play' && next !== 'pause';
    $('scrPause').hidden = next !== 'pause';
    $('scrResult').hidden = next !== 'result';
    $('scrMap').hidden = next !== 'map';
    $('scrShop').hidden = next !== 'shop';
    if (next === 'title') syncTitle();
    if (next === 'map') renderMap();
    if (next === 'shop') renderUpgradeGrid($('shopUpgrades'), $('shopCoins'));
  }

  function syncTitle() {
    $('titleCoins').textContent = Kit.fmt(save.coins);
    $('titleStars').textContent = Kit.fmt(SF.totalStars(save));
    var nxt = SF.nextLevel(save) + 1;
    $('titleNextLbl').textContent = 'المرحلة ' + nxt;
  }

  function syncHud() {
    $('hudScore').textContent = Kit.fmt(world.score);
    $('hudTarget').textContent = world.endless ? '∞' : Kit.fmt(world.cfg.stars[0]);
    $('hudTimer').textContent = String(Math.ceil(world.timeLeft));
    $('hudTimer').classList.toggle('urgent', world.timeLeft <= 8);
    $('hudStage').textContent = world.endless ? '⚡ بلا نهاية' : ('المرحلة ' + (world.level + 1));

    var maxStar = world.cfg.stars[2];
    var pct = Math.min(100, Math.round((world.score / maxStar) * 100));
    $('hudFill').style.width = pct + '%';

    var starEls = $('hudStars').children;
    for (var i = 0; i < 3; i++) {
      starEls[i].classList.toggle('on', world.stars > i);
    }

    var feverEl = $('hudFever');
    if (world.fever > 0) {
      feverEl.hidden = false;
      feverEl.textContent = 'جنون المصنع! 🔥 ' + Math.ceil(world.fever) + 'ث';
    } else if (world.combo >= 2) {
      feverEl.hidden = false;
      feverEl.textContent = 'سلسلة ×' + world.combo + ' ⚡';
    } else {
      feverEl.hidden = true;
    }
  }

  function startStage(opts) {
    opts = opts || {};
    var endless = !!opts.endless;
    var level = endless ? -1 : (opts.level != null ? opts.level : SF.nextLevel(save));
    var seed = opts.seed != null ? opts.seed : (++runSeed * 6271);
    Kit.hitstop.reset();
    particles.clear();
    popups.length = 0;
    dropQueued = false;
    idleSec = 0;
    world = SF.create({
      level: level,
      endless: endless,
      demo: false,
      dda: dda.level,
      upg: save.upg,
      seed: seed
    });
    if (roundOpen) Kit.stats.end('quit');
    Kit.stats.round(endless ? 'endless' : world.cfg.id);
    roundOpen = true;
    setScreen('play');
    syncHud();
    if (J) J.select();
  }

  function closeRoundEarly() {
    if (roundOpen) {
      Kit.stats.end('quit');
      roundOpen = false;
    }
  }

  function goHome() {
    closeRoundEarly();
    Kit.hitstop.reset();
    particles.clear();
    popups.length = 0;
    world = SF.create({ demo: true, level: 0, upg: save.upg, seed: (++runSeed * 3917) });
    setScreen('title');
  }

  function pauseGame() {
    if (screen !== 'play') return;
    setScreen('pause');
  }

  function resumeGame() {
    if (screen !== 'pause') return;
    Kit.keys.reset();
    dropQueued = false;
    setScreen('play');
  }

  function renderUpgradeGrid(container, walletEl) {
    if (walletEl) walletEl.textContent = Kit.fmt(save.coins);
    container.innerHTML = '';
    for (var i = 0; i < SF.UPGRADES.length; i++) {
      (function (u) {
        var lv = save.upg[u.key] | 0;
        var cost = SF.upgradeCost(save, u.key);
        var maxed = cost < 0;
        var canBuy = !maxed && save.coins >= cost;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'upg-card' + (canBuy ? ' afford' : '') + (maxed ? ' maxed' : '');
        btn.setAttribute('data-upg', u.key);
        btn.innerHTML =
          '<span class="upg-ico">' + u.icon + '</span>' +
          '<span class="upg-name">' + u.name + '</span>' +
          '<span class="upg-lv" dir="ltr">' + lv + ' / 5</span>' +
          '<span class="upg-cost" dir="ltr">' + (maxed ? 'MAX' : ('🪙 ' + cost)) + '</span>';
        btn.addEventListener('click', function (e) {
          if (e.detail > 0) btn.blur();
          var r = SF.buyUpgrade(save, u.key);
          if (r === 'buy') {
            persist();
            if (J) J.chime(2);
            renderUpgradeGrid(container, walletEl);
            syncTitle();
          } else if (J) {
            J.error();
          }
        });
        container.appendChild(btn);
      })(SF.UPGRADES[i]);
    }
  }

  function showResult(res) {
    if (roundOpen) {
      if (res.endless) {
        Kit.stats.end('end', res.score);
      } else {
        Kit.stats.end(res.won ? 'win' : 'lose', res.score);
        dda.result(res.won ? (res.stars >= 3 ? 1 : 0.72) : 0.25);
      }
      roundOpen = false;
    }
    SF.applyResult(save, res);
    persist();
    resultLock = 0.35;

    if (res.endless) {
      $('resTitle').textContent = 'رقم رائع! ⚡';
      $('resSub').textContent = 'أفضل نتيجة: ' + Kit.fmt(save.endlessBest);
    } else if (res.won) {
      $('resTitle').textContent = res.stars === 3 ? 'إنجاز أسطوري! 🌟' : 'أحسنت يا بطل! 🏆';
      $('resSub').textContent = 'جمعت ' + Kit.fmt(res.grabs) + ' ألعاب بنجاح!';
    } else {
      var need = Math.max(1, res.target - res.score);
      $('resTitle').textContent = 'قريب جدًا! 🔥';
      $('resSub').textContent = 'ينقصك ' + Kit.fmt(need) + ' نقطة فقط — طوّر مخلبك!';
    }

    $('resScore').textContent = Kit.fmt(res.score);
    $('resCoins').textContent = '+' + Kit.fmt(res.coins);

    var starRow = $('resStars');
    starRow.hidden = res.endless;
    for (var i = 0; i < 3; i++) {
      starRow.children[i].classList.toggle('on', res.stars > i);
    }

    var hasNext = !res.endless && res.won && res.level + 1 < SF.LEVELS.length;
    $('btnNext').hidden = !hasNext;

    renderUpgradeGrid($('resUpgrades'), $('resWallet'));
    setScreen('result');

    if (J) {
      if (res.won || res.endless) {
        J.levelUp();
        if (res.stars >= 1) J.star(res.stars);
      } else {
        J.fail();
      }
    }
  }

  function renderMap() {
    $('mapStars').textContent = Kit.fmt(SF.totalStars(save));
    var grid = $('mapGrid');
    grid.innerHTML = '';
    for (var i = 0; i < SF.LEVELS.length; i++) {
      (function (idx) {
        var unlocked = SF.isUnlocked(save, idx);
        var st = save.stars[idx] || 0;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lvl-btn' + (unlocked ? ' open' : ' locked') + (st > 0 ? ' done' : '');
        btn.setAttribute('data-level', String(idx));
        btn.disabled = !unlocked;
        var starStr = unlocked ? ('★'.repeat(st) + '☆'.repeat(3 - st)) : '🔒';
        btn.innerHTML = '<b dir="ltr">' + (idx + 1) + '</b><span class="lvl-st">' + starStr + '</span>';
        btn.addEventListener('click', function (e) {
          if (e.detail > 0) btn.blur();
          if (unlocked) startStage({ level: idx, endless: false });
        });
        grid.appendChild(btn);
      })(i);
    }
  }

  function handleEvents(evs) {
    if (screen !== 'play') return; // Zero audio on title or pause!
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.type === 'drop') {
        if (J) J.whoosh(0.72);
      } else if (e.type === 'snatch') {
        Kit.hitstop(0.042);
        shake.add(e.special ? 11 : 6);
        if (J) J.impact(e.special ? 0.78 : 0.45);
        Kit.track.hit();
        particles.burst(e.x, e.y, {
          count: e.special ? 20 : 12, speed: 270,
          colors: ['#ffd23f', '#5ef2ff', '#ff66b2', '#fff'],
          size: 7, life: 0.45, gravity: 320
        });
      } else if (e.type === 'magnet') {
        if (J) J.chime(2);
        addPopup(e.x, e.y - 36, 'مغناطيس ×' + (e.count + 1) + '! 🧲', '#5ef2ff', 32);
      } else if (e.type === 'fizzPop') {
        if (J) J.pop(0.75);
        particles.burst(e.x, e.y, { count: 16, speed: 310, colors: ['#ff7b24', '#ffd23f', '#fff'], size: 8, life: 0.5, gravity: 340 });
        addPopup(e.x, e.y - 20, '+' + e.pts + ' 💥', '#ffd23f', 26);
      } else if (e.type === 'fizzBlast') {
        shake.add(12);
        addPopup(e.x, e.y - 42, 'انفجار فوران! 💥', '#ff9f1c', 32);
      } else if (e.type === 'capsuleTime') {
        if (J) J.chime(3);
        addPopup(e.x, e.y + 18, '+5 ثواني! ⏱️', '#5ef2ff', 32);
      } else if (e.type === 'capsuleJackpot') {
        if (J) J.chime(3);
        addPopup(e.x, e.y + 18, 'كنز سري! 🎁', '#ffd23f', 32);
      } else if (e.type === 'deliver') {
        if (J) {
          if (e.fever || e.combo >= 2) J.streak(Math.min(12, e.combo));
          else J.coin(Math.min(5, Math.max(1, e.combo)));
        }
        particles.burst(e.x, e.y, { count: 14, speed: 220, colors: ['#ffd23f', '#fff6a8', '#3ddc84'], size: 7, life: 0.48, gravity: 260 });
        addPopup(e.x, e.y + 24, '+' + e.pts, e.fever ? '#ffe14f' : '#7dff9e', e.fever ? 34 : 28);
      } else if (e.type === 'feverStart') {
        shake.add(14);
        if (J) J.chime(3);
        addPopup(SF.W * 0.5, 224, 'جنون المصنع! 🔥', '#ffe14f', 46);
      } else if (e.type === 'rainCoin') {
        if (J) J.coin(4);
        particles.burst(e.x, e.y, { count: 7, speed: 150, colors: ['#ffd23f', '#fff'], size: 6, life: 0.3, gravity: 180 });
      } else if (e.type === 'boot') {
        shake.add(6);
        if (J) J.error();
        Kit.track.miss();
        addPopup(e.x, e.y - 26, 'حذاء! 🥾', '#ff8c94', 28);
      } else if (e.type === 'miss') {
        if (J) J.tap();
        Kit.track.miss();
      } else if (e.type === 'roundEnd') {
        showResult(e.result);
      }
    }
  }

  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e)) return;
    if (e.repeat) return;

    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (screen === 'play') { e.preventDefault(); pauseGame(); return; }
      if (screen === 'pause') { e.preventDefault(); resumeGame(); return; }
      if (screen === 'map' || screen === 'shop') { e.preventDefault(); setScreen('title'); return; }
    }

    if (screen === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        startStage({ level: SF.nextLevel(save), endless: false });
      }
      return;
    }

    if (screen === 'result') {
      if (resultLock <= 0 && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR')) {
        e.preventDefault();
        if (e.code === 'KeyR' || !world.won || world.endless || world.level + 1 >= SF.LEVELS.length) {
          startStage({ level: world.level, endless: world.endless });
        } else {
          startStage({ level: world.level + 1, endless: false });
        }
      }
      return;
    }

    if (screen === 'play') {
      if (e.code === 'KeyR') { e.preventDefault(); startStage({ level: world.level, endless: world.endless }); return; }
      if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'Enter') {
        e.preventDefault();
        dropQueued = true;
        idleSec = 0;
      }
    }
  });

  // Left-click anywhere on canvas drops the claw during active play!
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button === 2 || screen !== 'play') return;
    dropQueued = true;
    idleSec = 0;
  });

  function bindBtn(id, fn) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('click', function (e) {
      if (e.detail > 0) el.blur();
      fn();
    });
  }
  bindBtn('btnPlay', function () { startStage({ level: SF.nextLevel(save), endless: false }); });
  bindBtn('btnEndless', function () { startStage({ endless: true }); });
  bindBtn('btnMap', function () { if (J) J.select(); setScreen('map'); });
  bindBtn('btnShop', function () { if (J) J.select(); setScreen('shop'); });
  bindBtn('btnMapBack', function () { if (J) J.back(); setScreen('title'); });
  bindBtn('btnShopBack', function () { if (J) J.back(); setScreen('title'); });
  bindBtn('btnPause', function () { if (screen === 'play') pauseGame(); else if (screen === 'pause') resumeGame(); });
  bindBtn('btnResume', function () { resumeGame(); });
  bindBtn('btnRestart', function () { startStage({ level: world.level, endless: world.endless }); });
  bindBtn('btnHome', function () { goHome(); });
  bindBtn('btnNext', function () { startStage({ level: Math.min(SF.LEVELS.length - 1, world.level + 1), endless: false }); });
  bindBtn('btnAgain', function () { startStage({ level: world.level, endless: world.endless }); });
  bindBtn('btnResHome', function () { goHome(); });

  Kit.lifecycle({
    pause: function () { if (screen === 'play') pauseGame(); },
    reset: function () { dropQueued = false; }
  });

  function update(dt) {
    if (screen === 'pause') return;
    if (screen === 'result') {
      resultLock = Math.max(0, resultLock - dt);
      particles.update(dt);
      return;
    }
    if (screen === 'play' && Kit.hitstop.active()) {
      Kit.hitstop.tick(dt);
      shake.update(dt);
      return;
    }

    shake.update(dt);
    particles.update(dt);
    for (var i = popups.length - 1; i >= 0; i--) {
      popups[i].life -= dt;
      popups[i].y -= 48 * dt;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }

    var inp = { drop: false, dropPress: false };
    if (screen === 'play') {
      idleSec += dt;
      inp.dropPress = dropQueued;
      inp.drop = dropQueued || Kit.keys.down('Space') || Kit.keys.down('ArrowDown') || Kit.keys.down('KeyS');
      dropQueued = false;
    }

    var evs = SF.step(world, dt, inp);
    if (screen === 'play') {
      handleEvents(evs);
      syncHud();
    }
    Kit.keys.endFrame();
  }

  function render() {
    SF.art.draw(ctx, world, { shake: shake, particles: particles, popups: popups, idleSec: idleSec }, screen);
  }

  canvas.addEventListener('contextrestored', function () { view.resize(); render(); });
  window.addEventListener('resize', function () { render(); });

  setScreen('title');
  render();
  Kit.loop(update, render, { hz: 60 });

  window.__game = {
    get state() { return SF.publicState(world, screen); },
    get world() { return world; },
    get save() { return save; },
    start: function (opts) { startStage(opts); },
    restart: function () { startStage({ level: world.level, endless: world.endless }); },
    pause: pauseGame,
    resume: resumeGame,
    home: goHome,
    step: function (n) {
      var k = n || 1;
      for (var i = 0; i < k; i++) update(1 / 60);
      render();
    },
    point: function (lx, ly) {
      var r = canvas.getBoundingClientRect();
      return { x: r.left + lx * view.scale, y: r.top + ly * view.scale };
    }
  };

  Kit.ready();
})();
