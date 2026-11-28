/* Recess Kitchen — Snack Flip & Bump Party! Game controller, Kit integration, HUD, Hats & Input. */
(function () {
  'use strict';
  var Kit = window.Kit, RK = window.RK, J = Kit.juice;
  var $ = function (id) { return document.getElementById(id); };

  var canvas = $('game');
  var view = Kit.fit(canvas, RK.W, RK.H, { maxDpr: 1.5 });
  var ctx = view.ctx;
  var store = Kit.store('recess-kitchen');
  var dda = Kit.dda('recess-kitchen', { id: 'main', start: 0.26, target: 0.72, tiers: 5 });
  var shake = Kit.shake({ decay: 3.4 });
  var particles = Kit.particles();
  Kit.muteButton();

  var save = RK.loadSave(store.get('save4', null));
  var saveStatus = Kit.saveStatus({ retry: function () { persist(); } });
  function persist() {
    var ok = store.set('save4', save);
    if (ok) saveStatus.saved();
    else saveStatus.failed();
    return ok;
  }

  var screen = 'title'; // 'title' | 'play' | 'pause' | 'result' | 'hats'
  var world = RK.create({ demo: true, hat: save.hat, seed: 2026 });
  var popups = [];
  var idleSec = 0;
  var resultLock = 0;
  var roundOpen = false;
  var pointerQueue = [false, false];
  var keyQueue = [false, false];
  var matchSeed = 100;

  var PRAISE = ['ضربة رائعة!', 'يا سلام!', 'ممتاز!', 'بطل المطبخ!', 'بوم! 🔥'];

  function addPopup(x, y, text, color, size) {
    if (Kit.motion.reduced()) return;
    popups.push({ x: x, y: y, text: text, color: color || '#ffe14f', size: size || 30, life: 0.85, max: 0.85 });
    if (popups.length > 12) popups.shift();
  }

  function setScreen(next) {
    screen = next;
    $('scrTitle').hidden = next !== 'title';
    $('hud').hidden = next !== 'play' && next !== 'pause';
    $('btnPause').hidden = next !== 'play' && next !== 'pause';
    $('scrPause').hidden = next !== 'pause';
    $('scrResult').hidden = next !== 'result';
    $('scrHats').hidden = next !== 'hats';
    if (next === 'title') syncTitle();
    if (next === 'hats') renderHats();
  }

  function syncTitle() {
    $('titleCoins').textContent = Kit.fmt(save.coins);
    $('titleWins').textContent = Kit.fmt(save.wins);
    $('titleHatIco').textContent = RK.HATS[save.hat].icon;
  }

  function syncHud() {
    $('scLeft').textContent = String(world.goals[0]);
    $('scRight').textContent = String(world.goals[1]);
    $('hudTimer').textContent = world.suddenDeath ? '⚡' : String(Math.ceil(world.timeLeft));
    $('hudTimer').classList.toggle('urgent', !world.suddenDeath && world.timeLeft <= 8);
    var m = RK.modById(world.mod);
    $('hudMod').textContent = world.suddenDeath ? 'الهدف الذهبي! ⚡' : m.name;
    $('hudMod').style.borderColor = m.color;
    $('p1Tag').textContent = world.duo ? 'اللاعب 1' : 'أنت';
    $('p2Tag').textContent = world.duo ? 'اللاعب 2' : 'الشيف الآلي';
  }

  function startMatch(opts) {
    opts = opts || {};
    var duo = !!opts.duo;
    var seed = opts.seed != null ? opts.seed : (++matchSeed * 7919);
    Kit.hitstop.reset();
    particles.clear();
    popups.length = 0;
    pointerQueue[0] = pointerQueue[1] = false;
    keyQueue[0] = keyQueue[1] = false;
    idleSec = 0;
    world = RK.create({
      duo: duo,
      demo: false,
      dda: duo ? 0.5 : dda.level,
      hat: save.hat,
      seed: seed,
      winGoals: opts.winGoals || RK.WIN_GOALS,
      mod: opts.mod || 'normal'
    });
    if (roundOpen) Kit.stats.end('quit');
    Kit.stats.round(duo ? 'duo' : 'solo');
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
    world = RK.create({ demo: true, hat: save.hat, seed: (++matchSeed * 3571) });
    setScreen('title');
  }

  function pauseGame() {
    if (screen !== 'play') return;
    setScreen('pause');
  }

  function resumeGame() {
    if (screen !== 'pause') return;
    Kit.keys.reset();
    pointerQueue[0] = pointerQueue[1] = false;
    keyQueue[0] = keyQueue[1] = false;
    setScreen('play');
  }

  function showResult(res) {
    if (roundOpen) {
      if (res.duo) {
        Kit.stats.end('end');
      } else {
        Kit.stats.end(res.won ? 'win' : 'lose', res.score);
        var margin = (res.goals[0] - res.goals[1]) / Math.max(1, RK.WIN_GOALS);
        dda.result(Kit.clamp(0.5 + margin * 0.5, 0, 1));
      }
      roundOpen = false;
    }
    RK.applyResult(save, res);
    persist();
    resultLock = 0.35;

    if (res.duo) {
      $('resTitle').textContent = res.winner === 0 ? 'فاز اللاعب 1! 🏆' : 'فاز اللاعب 2! 🏆';
      $('resSub').textContent = 'مباراة نارية في مطبخ الفسحة!';
    } else {
      $('resTitle').textContent = res.won ? 'فوز رائع! 🏆' : 'قريب جدًا! 🔥';
      $('resSub').textContent = res.won ? 'أنت بطل الملعقة الطائرة!' : 'جولة ثانية وستفوز أكيدًا!';
    }
    $('resScoreLeft').textContent = String(res.goals[0]);
    $('resScoreRight').textContent = String(res.goals[1]);
    $('resCoins').textContent = '+' + Kit.fmt(res.duo ? 15 : res.coins);
    $('resWallet').textContent = Kit.fmt(save.coins);

    // Next-hat progress bar on result card (S++ Law #5!)
    var nextHat = null;
    for (var i = 0; i < RK.HATS.length; i++) {
      if (save.hats.indexOf(i) === -1) { nextHat = RK.HATS[i]; break; }
    }
    var progWrap = $('resNextHat');
    if (nextHat) {
      progWrap.hidden = false;
      var pct = Math.min(100, Math.round((save.coins / nextHat.cost) * 100));
      var need = Math.max(0, nextHat.cost - save.coins);
      $('resNextLabel').textContent = need === 0
        ? ('جاهز لفتح ' + nextHat.icon + ' ' + nextHat.name + '!')
        : ('ينقصك ' + need + ' 🪙 لـ ' + nextHat.icon + ' ' + nextHat.name);
      $('resNextFill').style.width = pct + '%';
    } else {
      progWrap.hidden = true;
    }

    setScreen('result');
    if (J) {
      if (res.won || res.duo) J.levelUp();
      else J.fail();
    }
  }

  function renderHats() {
    $('hatsCoins').textContent = Kit.fmt(save.coins);
    var grid = $('hatsGrid');
    grid.innerHTML = '';
    for (var i = 0; i < RK.HATS.length; i++) {
      (function (idx) {
        var h = RK.HATS[idx];
        var owned = save.hats.indexOf(idx) !== -1;
        var active = save.hat === idx;
        var canBuy = !owned && save.coins >= h.cost;
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'hat-card' + (active ? ' active' : '') + (owned ? ' owned' : '') + (canBuy ? ' afford' : '');
        card.setAttribute('data-hat', String(idx));
        card.innerHTML =
          '<span class="hat-ico">' + h.icon + '</span>' +
          '<span class="hat-name">' + h.name + '</span>' +
          '<span class="hat-tag" dir="ltr">' + (active ? '✓' : (owned ? 'اختر' : ('🪙 ' + h.cost))) + '</span>';
        card.addEventListener('click', function (e) {
          if (e.detail > 0) card.blur();
          var res = RK.buyHat(save, idx);
          if (res === 'buy' || res === 'equip') {
            world.chefs[0].hat = save.hat;
            world.p1Hat = save.hat;
            persist();
            if (J) { if (res === 'buy') J.chime(2); else J.select(); }
            renderHats();
          } else if (J) {
            J.error();
          }
        });
        grid.appendChild(card);
      })(i);
    }
  }

  function handleEvents(evs) {
    if (screen !== 'play') return; // Never play SFX on title demo or paused!
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.type === 'jump') {
        if (J) J.jump(0.55);
        particles.burst(e.x, e.y, { count: 7, speed: 150, colors: ['#fff6d6', '#ffd23f'], size: 6, life: 0.32, gravity: 280 });
      } else if (e.type === 'airflip') {
        if (J) J.whoosh(0.75);
        particles.burst(e.x, e.y, { count: 8, speed: 190, colors: ['#80d4ff', '#fff'], size: 5, life: 0.28, gravity: 100 });
      } else if (e.type === 'land') {
        if (J) J.land(0.35);
      } else if (e.type === 'bounce') {
        if (J) J.pop(0.6);
      } else if (e.type === 'whack') {
        Kit.hitstop(0.045);
        shake.add(10 * e.power);
        if (J) {
          J.impact(e.power);
          if (e.rally >= 2) J.streak(Math.min(10, e.rally));
        }
        if (e.side === 0) Kit.track.hit();
        particles.burst(e.x, e.y, {
          count: 16, speed: 320,
          colors: e.golden ? ['#fff9a6', '#ffd23f', '#ff9f1c'] : ['#fff', '#ffd23f', '#ff6b6b', '#7ed957'],
          size: 8, life: 0.48, gravity: 380
        });
        if (e.rally >= 3 || e.golden) {
          addPopup(e.x, e.y - 36, e.golden ? 'ذهبي! ⭐' : PRAISE[e.rally % PRAISE.length], '#ffe14f', 28);
        }
      } else if (e.type === 'bump' || e.type === 'bump_food') {
        if (J) J.pop(0.45);
        shake.add(4);
      } else if (e.type === 'sizzle' || e.type === 'pop_stall' || e.type === 'lid') {
        if (J) J.tap();
        if (e.type === 'pop_stall') {
          particles.burst(e.x, e.y, { count: 10, speed: 170, colors: ['#fff', '#ffe6a3'], size: 7, life: 0.4, gravity: -120 });
        }
      } else if (e.type === 'goal') {
        Kit.hitstop(0.06);
        shake.add(16);
        if (e.scorer === 0) {
          if (J) J.chime(e.points > 1 ? 3 : 2);
        } else {
          if (!world.duo) Kit.track.miss();
          if (J) J.impact(0.8);
        }
        particles.burst(e.x, e.y, {
          count: 34, speed: 420,
          colors: ['#ffd23f', '#ff5964', '#29a8ff', '#3ddc84', '#fff'],
          size: 10, life: 0.85, gravity: 360
        });
        syncHud();
      } else if (e.type === 'serve') {
        if (J) J.power ? J.power() : J.countdown(0);
        syncHud();
      } else if (e.type === 'suddenDeath') {
        if (J) J.chime(3);
        addPopup(RK.W * 0.5, 220, 'الهدف الذهبي! ⚡', '#ffe14f', 42);
        syncHud();
      } else if (e.type === 'matchEnd') {
        showResult(e.result);
      }
    }
  }

  // Keyboard bindings (strictly respecting native controls via Kit.isGameKeyEvent!)
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e)) return;
    if (e.repeat) return;

    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (screen === 'play') { e.preventDefault(); pauseGame(); return; }
      if (screen === 'pause') { e.preventDefault(); resumeGame(); return; }
      if (screen === 'hats') { e.preventDefault(); setScreen('title'); return; }
    }

    if (screen === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        startMatch({ duo: false });
      }
      return;
    }

    if (screen === 'result') {
      if (resultLock <= 0 && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR')) {
        e.preventDefault();
        startMatch({ duo: world.duo });
      }
      return;
    }

    if (screen === 'play') {
      if (e.code === 'KeyR') { e.preventDefault(); startMatch({ duo: world.duo }); return; }
      if (e.code === 'KeyW' || e.code === 'Space' || (!world.duo && (e.code === 'ArrowUp' || e.code === 'ArrowRight'))) {
        e.preventDefault();
        keyQueue[0] = true;
        idleSec = 0;
      } else if (world.duo && (e.code === 'ArrowUp' || e.code === 'Enter')) {
        e.preventDefault();
        keyQueue[1] = true;
        idleSec = 0;
      }
    }
  });

  // Mouse / touch canvas click (only during active play — never starts game from title!)
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button === 2 || screen !== 'play') return;
    var pt = view.toLogical(e.clientX, e.clientY);
    if (world.duo) {
      pointerQueue[pt.x < RK.W * 0.5 ? 0 : 1] = true;
    } else {
      pointerQueue[0] = true;
    }
    idleSec = 0;
  });

  // UI buttons
  function bindBtn(id, fn) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('click', function (e) {
      if (e.detail > 0) el.blur();
      fn();
    });
  }
  bindBtn('btnPlay', function () { startMatch({ duo: false }); });
  bindBtn('btnDuo', function () { startMatch({ duo: true }); });
  bindBtn('btnHats', function () { if (J) J.select(); setScreen('hats'); });
  bindBtn('btnHatsBack', function () { if (J) J.back(); setScreen('title'); });
  bindBtn('btnPause', function () { if (screen === 'play') pauseGame(); else if (screen === 'pause') resumeGame(); });
  bindBtn('btnResume', function () { resumeGame(); });
  bindBtn('btnRestart', function () { startMatch({ duo: world.duo }); });
  bindBtn('btnHome', function () { goHome(); });
  bindBtn('btnAgain', function () { startMatch({ duo: world.duo }); });
  bindBtn('btnResHats', function () { if (J) J.select(); setScreen('hats'); });
  bindBtn('btnResHome', function () { goHome(); });

  Kit.lifecycle({
    pause: function () { if (screen === 'play') pauseGame(); },
    reset: function () { pointerQueue[0] = pointerQueue[1] = keyQueue[0] = keyQueue[1] = false; }
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

    var inp = { p1: false, p2: false, p1Press: false, p2Press: false };
    if (screen === 'play') {
      idleSec += dt;
      inp.p1Press = keyQueue[0] || pointerQueue[0];
      inp.p2Press = keyQueue[1] || pointerQueue[1];
      inp.p1 = inp.p1Press || Kit.keys.down('KeyW') || Kit.keys.down('Space');
      inp.p2 = inp.p2Press || (world.duo && (Kit.keys.down('ArrowUp') || Kit.keys.down('Enter')));
      keyQueue[0] = keyQueue[1] = pointerQueue[0] = pointerQueue[1] = false;
    }

    var evs = RK.step(world, dt, inp);
    if (screen === 'play') {
      handleEvents(evs);
      syncHud();
    }
    Kit.keys.endFrame();
  }

  function render() {
    RK.art.draw(ctx, world, { shake: shake, particles: particles, popups: popups, idleSec: idleSec }, screen);
  }

  canvas.addEventListener('contextrestored', function () { view.resize(); render(); });
  window.addEventListener('resize', function () { render(); });

  setScreen('title');
  render();
  Kit.loop(update, render, { hz: 60 });

  window.__game = {
    get state() { return RK.publicState(world, screen); },
    get world() { return world; },
    get save() { return save; },
    start: function (opts) { startMatch(opts); },
    restart: function () { startMatch({ duo: world.duo }); },
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
