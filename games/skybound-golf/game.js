/* Skybound Golf (ضربة إلى الفضاء) — UI, one-button input, Kit DDA/stats/juice/lifecycle wiring.
 * Pure deterministic physics lives in physics.js; 3D Three.js rendering lives in art.js. */
(function () {
  'use strict';

  var P = window.GolfPhysics;
  var A = window.SkyboundArt;
  var J = Kit.juice;
  var M = Math;
  function $(id) { return document.getElementById(id); }

  var canvas = $('game');
  var ui = $('ui');
  var popupsEl = $('popups');

  /* --------------------------------------------------------------- Save & DDA */
  var SAVE_KEY = 'save_v3';
  var store = Kit.store('skybound-golf');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = P.sanitizeSave(store.get(SAVE_KEY, null));
  function persist() {
    if (store.set(SAVE_KEY, save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }

  var dda = Kit.dda('skybound-golf', { id: 'main', target: 0.72, tiers: 5 });

  /* --------------------------------------------------------------- Skin SVGs */
  function skinSvg(id) {
    if (id === 'fireball') {
      return '<svg class="skin-swatch" viewBox="0 0 64 64"><circle cx="32" cy="34" r="21" fill="#ff4d1a" stroke="#fff3a8" stroke-width="3"/><circle cx="28" cy="30" r="11" fill="#ffaa22"/><circle cx="26" cy="28" r="5" fill="#fff599"/></svg>';
    }
    if (id === 'disco') {
      return '<svg class="skin-swatch" viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#3ef2ff" stroke="#fff" stroke-width="3"/><rect x="16" y="18" width="12" height="12" rx="2" fill="#ff52d9"/><rect x="34" y="18" width="12" height="12" rx="2" fill="#ffe44d"/><rect x="22" y="34" width="14" height="12" rx="2" fill="#9c6bff"/></svg>';
    }
    if (id === 'planet') {
      return '<svg class="skin-swatch" viewBox="0 0 64 64"><circle cx="32" cy="32" r="18" fill="#249eff" stroke="#fff" stroke-width="2.5"/><circle cx="25" cy="27" r="6" fill="#4ce875"/><circle cx="39" cy="36" r="5" fill="#4ce875"/><ellipse cx="32" cy="33" rx="28" ry="8" fill="none" stroke="#ffd426" stroke-width="4" transform="rotate(-18 32 33)"/></svg>';
    }
    if (id === 'star') {
      return '<svg class="skin-swatch" viewBox="0 0 64 64"><polygon points="32,7 39,23 57,25 43,37 47,55 32,45 17,55 21,37 7,25 25,23" fill="#ffd524" stroke="#fff9c4" stroke-width="3" stroke-linejoin="round"/></svg>';
    }
    return '<svg class="skin-swatch" viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#ffffff" stroke="#ffd426" stroke-width="3.5"/><circle cx="24" cy="25" r="3" fill="#d9e2f2"/><circle cx="36" cy="23" r="3" fill="#d9e2f2"/><circle cx="30" cy="35" r="3" fill="#d9e2f2"/><circle cx="41" cy="36" r="3" fill="#d9e2f2"/></svg>';
  }

  /* --------------------------------------------------------------- Game State */
  var phase = 'title'; // title | aim | power | swing | flight | landed | result
  var modalKind = '';  // '' | pause | result | shop | skins
  var skinsReturn = 'title';
  var paused = false;
  var course = null;
  var ball = null;
  var view = null;
  var loop = null;
  var live = false;
  var failed = false;
  var contextLost = false;
  var dirty = true;
  var snap = true;

  var t = 0;
  var phaseT = 0;
  var aimAngle = 45;
  var powerVal = 0.5;
  var swingT = 0;
  var hitStop = 0;
  var golferJump = 0;
  var landedT = 0;
  var shotCommitted = false;
  var lastReward = null;
  var isNewBest = false;
  var reticle = null;
  var roundOpen = false;
  var shotsThisSession = 0;
  var tutorialStarted = false;
  var tutorialDone = false;

  // Input flags
  var holdKeyBoost = false;
  var holdPtrBoost = false;
  var boostSfxCd = 0;
  var boostBurstCd = 0;
  var idleHintT = 0;
  var ptrGuardT = 0;

  // Popups & Toasts (JS-timed, never animationend -> safe in reduced motion!)
  var popups = [];
  var toastTimer = 0;

  // Cached HUD text to avoid redundant DOM writes
  var hudMeters = -1, hudAlt = -1, hudCoins = -1, hudLayer = -1;

  function focusCanvas() {
    try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function say(txt) { $('announce').textContent = txt; }

  function ddaParams() {
    return {
      perfectWidth: dda.value(0.22, 0.11),
      targetBonus: dda.value(1.22, 0.94),
      aimSpeed: dda.value(1.18, 1.72),
      powerSpeed: dda.value(1.42, 2.15)
    };
  }

  function makeCourse() {
    var seed = 101 + (save.shots * 37 + shotsThisSession * 19);
    return P.createCourse(seed, ddaParams());
  }

  /* --------------------------------------------------------------- Popups & Toast */
  function spawnPopup(text, wx, wy, cls) {
    if (!view) return;
    var p = view.project(wx, wy, 0.4);
    if (!p.visible) return;
    var el = document.createElement('div');
    el.className = 'pop' + (cls ? ' ' + cls : '');
    el.textContent = text;
    el.style.left = M.round(p.x) + 'px';
    el.style.top = M.round(p.y) + 'px';
    popupsEl.appendChild(el);
    popups.push({ el: el, text: text, x: p.x, y: p.y, life: 0.95, max: 0.95 });
    if (popups.length > 10) {
      var old = popups.shift();
      if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
    }
  }

  function clearPopups() {
    for (var i = 0; i < popups.length; i++) {
      if (popups[i].el.parentNode) popups[i].el.parentNode.removeChild(popups[i].el);
    }
    popups.length = 0;
  }

  function updatePopups(dt) {
    var reduced = Kit.motion.reduced();
    for (var i = popups.length - 1; i >= 0; i--) {
      var p = popups[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.el.parentNode) p.el.parentNode.removeChild(p.el);
        popups.splice(i, 1);
        continue;
      }
      if (!reduced) {
        p.y -= 52 * dt;
        p.el.style.top = M.round(p.y) + 'px';
      }
      p.el.style.opacity = String(P.clamp(p.life / (p.max * 0.45), 0, 1));
    }
  }

  function showToast(text, dur) {
    var el = $('toast');
    el.textContent = text;
    el.hidden = false;
    toastTimer = dur || 2.1;
    say(text);
  }

  /* --------------------------------------------------------------- UI Screens */
  function nextMilestoneInfo() {
    for (var i = 0; i < P.MILESTONES.length; i++) {
      if (save.bestDist < P.MILESTONES[i].dist) return P.MILESTONES[i];
    }
    return P.MILESTONES[P.MILESTONES.length - 1];
  }

  function refreshTitleUI() {
    $('title-coins').textContent = Kit.fmt(save.coins);
    $('best-meters').textContent = Kit.fmt(save.bestDist);
    var ms = nextMilestoneInfo();
    $('title-milestone').textContent = ms.icon + ' ' + Kit.fmt(ms.dist) + 'م';
  }

  function setModal(kind) {
    modalKind = kind || '';
    var open = modalKind !== '';
    if (open) { $('toast').hidden = true; toastTimer = 0; }
    $('modal').hidden = !open;
    $('pause-content').hidden = modalKind !== 'pause';
    $('result-content').hidden = modalKind !== 'result';
    $('shop-content').hidden = modalKind !== 'shop';
    $('skins-content').hidden = modalKind !== 'skins';
    $('close-modal').hidden = modalKind === 'result';

    if (modalKind === 'pause') $('modal-heading').textContent = 'إيقاف مؤقت';
    else if (modalKind === 'shop') {
      $('modal-heading').textContent = 'الترقيات';
      renderUpgrades($('shop-upgrades'));
      $('shop-coins').textContent = Kit.fmt(save.coins);
    } else if (modalKind === 'skins') {
      $('modal-heading').textContent = 'اختر كرتك';
      renderSkins();
    }
    ptrGuardT = 0.14;
    dirty = true;
  }

  function syncChrome() {
    ui.dataset.phase = phase;
    var inPlay = phase !== 'title';
    $('title-screen').hidden = inPlay;
    $('hud').hidden = !inPlay;
    $('pause').hidden = !inPlay || modalKind === 'result' || modalKind === 'skins';
    if (!inPlay || paused || modalKind) $('ghost-hint').hidden = true;
    dirty = true;
  }

  function renderUpgrades(container) {
    container.innerHTML = '';
    for (var i = 0; i < P.UPGRADES.length; i++) {
      (function (u) {
        var lv = save.upgrades[u.id] || 0;
        var maxed = lv >= u.max;
        var cost = P.upgradeCost(u.id, lv);
        var canBuy = !maxed && save.coins >= cost;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'up-card' + (maxed ? ' maxed' : '');
        btn.dataset.upgrade = u.id;
        btn.disabled = !canBuy;
        btn.innerHTML =
          '<span class="up-ico">' + u.icon + '</span>' +
          '<span class="up-name">' + u.short + '</span>' +
          '<span class="up-lv" dir="ltr">' + lv + '/' + u.max + '</span>' +
          '<span class="up-cost" dir="ltr">' + (maxed ? 'الحد الأقصى' : '🪙 ' + Kit.fmt(cost)) + '</span>';
        btn.addEventListener('click', function () { buyUpgrade(u.id); });
        container.appendChild(btn);
      })(P.UPGRADES[i]);
    }
  }

  function buyUpgrade(id) {
    var u = null;
    for (var i = 0; i < P.UPGRADES.length; i++) if (P.UPGRADES[i].id === id) u = P.UPGRADES[i];
    if (!u) return;
    var lv = save.upgrades[id] || 0;
    if (lv >= u.max) return;
    var cost = P.upgradeCost(id, lv);
    if (save.coins < cost) { J.error(); return; }
    save.coins -= cost;
    save.upgrades[id] = lv + 1;
    persist();
    J.levelUp();
    refreshTitleUI();
    $('res-wallet-val').textContent = Kit.fmt(save.coins);
    $('shop-coins').textContent = Kit.fmt(save.coins);
    if (modalKind === 'result') renderUpgrades($('upgrades'));
    if (modalKind === 'shop') renderUpgrades($('shop-upgrades'));
  }

  function renderSkins() {
    $('skins-coins').textContent = Kit.fmt(save.coins);
    var grid = $('skins-grid');
    grid.innerHTML = '';
    for (var i = 0; i < P.SKINS.length; i++) {
      (function (sk) {
        var owned = save.ownedSkins.indexOf(sk.id) !== -1;
        var eq = save.skin === sk.id;
        var canBuy = !owned && save.coins >= sk.cost;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'skin-card' + (eq ? ' equipped' : owned ? ' owned' : '') + (!owned && !canBuy ? ' poor' : '');
        btn.dataset.skin = sk.id;
        btn.innerHTML =
          skinSvg(sk.id) +
          '<span class="skin-name">' + sk.name + '</span>' +
          '<span class="skin-tag">' + (eq ? '✓ مفعّلة' : owned ? 'اختر' : '🪙 ' + Kit.fmt(sk.cost)) + '</span>';
        btn.addEventListener('click', function () { selectSkin(sk.id); });
        grid.appendChild(btn);
      })(P.SKINS[i]);
    }
  }

  function selectSkin(id) {
    var sk = null;
    for (var i = 0; i < P.SKINS.length; i++) if (P.SKINS[i].id === id) sk = P.SKINS[i];
    if (!sk) return;
    var owned = save.ownedSkins.indexOf(id) !== -1;
    if (!owned) {
      if (save.coins < sk.cost) { J.error(); return; }
      save.coins -= sk.cost;
      save.ownedSkins.push(id);
      J.levelUp();
    } else {
      J.select();
    }
    save.skin = id;
    persist();
    refreshTitleUI();
    renderSkins();
    dirty = true;
  }

  /* --------------------------------------------------------------- Round Flow */
  function resetHeldInput() {
    holdKeyBoost = false;
    holdPtrBoost = false;
  }

  function closeOpenRound(outcome, score) {
    if (!roundOpen) return;
    Kit.stats.end(outcome || 'quit', score);
    roundOpen = false;
  }

  function startShot() {
    resetHeldInput();
    clearPopups();
    if (view) view.clearFX();
    closeOpenRound('quit');
    shotsThisSession++;
    course = makeCourse();
    ball = null;
    reticle = null;
    shotCommitted = false;
    lastReward = null;
    isNewBest = false;
    paused = false;
    phase = 'aim';
    phaseT = 0;
    aimAngle = P.aimAngle(0, course.aimSpeed);
    powerVal = P.powerValue(0, course.powerSpeed);
    swingT = 0;
    hitStop = 0;
    golferJump = 0;
    landedT = 0;
    idleHintT = 0;
    hudMeters = hudAlt = hudCoins = hudLayer = -1;
    snap = true;
    setModal('');
    syncChrome();
    updateHUD(true);
    Kit.stats.round('shot');
    roundOpen = true;
    focusCanvas();
  }

  function goTitle() {
    if (ball && !shotCommitted && ball.maxX >= 12) commitShot(true);
    closeOpenRound('quit');
    resetHeldInput();
    clearPopups();
    if (view) view.clearFX();
    paused = false;
    phase = 'title';
    ball = null;
    reticle = null;
    if (!course) course = makeCourse();
    snap = true;
    refreshTitleUI();
    setModal('');
    syncChrome();
  }

  function pauseGame(manual) {
    if (phase === 'title' || phase === 'result' || modalKind === 'skins' || modalKind === 'shop') return;
    if (paused && modalKind === 'pause') return;
    resetHeldInput();
    paused = true;
    setModal('pause');
    syncChrome();
    if (manual) J.tap();
  }

  function resumeGame() {
    if (!paused) return;
    paused = false;
    setModal('');
    syncChrome();
    J.select();
    focusCanvas();
  }

  function commitShot(partial) {
    if (shotCommitted || !ball) return;
    shotCommitted = true;
    var rew = P.reward(ball, save.upgrades, save.milestones);
    lastReward = rew;
    var prevBest = save.bestDist;
    isNewBest = rew.dist > prevBest && rew.dist >= 20;
    save.coins += rew.total;
    if (rew.dist > save.bestDist) save.bestDist = rew.dist;
    if (rew.alt > save.bestAlt) save.bestAlt = rew.alt;
    save.shots++;
    for (var i = 0; i < rew.newMilestones.length; i++) {
      if (save.milestones.indexOf(rew.newMilestones[i].id) === -1) {
        save.milestones.push(rew.newMilestones[i].id);
      }
    }
    if (save.tips < 2) save.tips++;
    persist();
    refreshTitleUI();

    // Report DDA outcome (0..1) and Kit.stats round end
    if (!partial) {
      var gradeScore = ball.grade === 'perfect' ? 1 : ball.grade === 'great' ? 0.8 : ball.grade === 'good' ? 0.55 : 0.25;
      var distTarget = 95 + save.upgrades.power * 38 + save.upgrades.fuel * 28;
      var perf = P.clamp(gradeScore * 0.55 + P.clamp(rew.dist / distTarget, 0, 1.1) * 0.45, 0, 1);
      dda.result(perf);
      var won = !!(ball.space || rew.newMilestones.length > 0 || isNewBest);
      closeOpenRound(won ? 'win' : 'end', rew.dist);
    } else {
      closeOpenRound('quit', rew.dist);
    }
  }

  function openResultCard() {
    if (!ball) return;
    if (!shotCommitted) commitShot(false);
    resetHeldInput();
    phase = 'result';
    var rew = lastReward || P.reward(ball, save.upgrades, save.milestones);
    $('modal-heading').textContent = ball.space ? 'وصلت إلى الفضاء!' : (rew.stars === 3 ? 'ضربة أسطورية!' : 'ضربة رائعة!');
    $('res-record').hidden = !isNewBest;

    var starsHtml = '';
    for (var s = 1; s <= 3; s++) {
      starsHtml += '<span class="' + (s <= rew.stars ? 'star-on' : 'star-off') + '">⭐</span>';
    }
    $('res-stars').innerHTML = starsHtml;
    $('result-meters').textContent = Kit.fmt(rew.dist);
    $('result-alt').textContent = Kit.fmt(rew.alt);
    $('result-coins').textContent = '+' + Kit.fmt(rew.total);
    $('res-wallet-val').textContent = Kit.fmt(save.coins);

    if (rew.newMilestones.length > 0) {
      var nm = rew.newMilestones[rew.newMilestones.length - 1];
      $('res-milestone').textContent = '🏆 فتحت ' + nm.icon + ' ' + nm.name + ' (+' + nm.bonus + ' عملة!)';
    } else {
      var nxt = nextMilestoneInfo();
      var rem = M.max(0, nxt.dist - save.bestDist);
      $('res-milestone').textContent = rem > 0
        ? 'الهدف القادم: ' + nxt.icon + ' ' + nxt.name + ' (بقي ' + Kit.fmt(rem) + ' م)'
        : '🪐 بطل الفضاء! وصلت إلى المريخ!';
    }

    renderUpgrades($('upgrades'));
    setModal('result');
    syncChrome();
    if (isNewBest || rew.newMilestones.length > 0) J.levelUp();
    else J.star(rew.stars);
  }

  /* --------------------------------------------------------------- One-Button Actions */
  function triggerPrimaryDown(fromPointer) {
    if (!live || paused || modalKind) return;

    if (phase === 'aim') {
      aimAngle = P.aimAngle(phaseT, course.aimSpeed);
      var perfA = P.isPerfectAngle(aimAngle);
      phase = 'power';
      phaseT = 0;
      idleHintT = 0;
      powerVal = P.powerValue(0, course.powerSpeed);
      if (perfA) {
        J.chime(2);
        Kit.track.hit();
        spawnPopup('زاوية ممتازة!', 1.5, 5.2, 'cyan');
      } else {
        J.tap();
      }
      Kit.track.cue();
      syncChrome();
      return;
    }

    if (phase === 'power') {
      powerVal = P.powerValue(phaseT, course.powerSpeed);
      phase = 'swing';
      swingT = 0;
      idleHintT = 0;
      J.whoosh(0.75);
      syncChrome();
      return;
    }

    if (phase === 'flight' && ball && !ball.done) {
      if (fromPointer) holdPtrBoost = true; else holdKeyBoost = true;
      // Near ground while descending -> arm a Super Bounce without burning fuel!
      if (reticle && ball.vy < -2 && !ball.armed) {
        var arm = P.pressDive(course, ball);
        if (arm.type === 'arm') {
          J.chime(arm.perfect ? 2 : 1);
          Kit.track.hit();
          spawnPopup(arm.perfect ? 'توقيت ذهبي!' : 'جاهز للقفز!', ball.x, ball.y + 2.2, 'cyan');
        }
      } else if (ball.fuel <= 0 && ball.mode === 'air') {
        var dv = P.pressDive(course, ball);
        if (dv.type === 'dive') {
          J.whoosh(0.85);
          spawnPopup('غوص سريع!', ball.x, ball.y + 1.8, 'coral');
        }
      } else if (ball.fuel > 0) {
        J.whoosh(0.55);
        if (tutorialStarted && !tutorialDone) {
          tutorialDone = true;
          Kit.stats.tutorial('done');
        }
      }
      return;
    }

    if (phase === 'landed') {
      openResultCard();
    }
  }

  function triggerDiveKey() {
    if (!live || paused || modalKind || phase !== 'flight' || !ball || ball.done) return;
    var res = P.pressDive(course, ball);
    if (res.type === 'arm') {
      J.chime(res.perfect ? 2 : 1);
      Kit.track.hit();
      spawnPopup(res.perfect ? 'توقيت ذهبي!' : 'جاهز للقفز!', ball.x, ball.y + 2.2, 'cyan');
    } else if (res.type === 'dive') {
      J.whoosh(0.9);
      spawnPopup('غوص خارق!', ball.x, ball.y + 2.0, 'coral');
    }
  }

  function launchNow() {
    ball = P.launch(course, save.upgrades, aimAngle, powerVal);
    phase = 'flight';
    golferJump = ball.grade === 'perfect' ? 0.85 : 0.35;
    if (ball.grade === 'perfect') {
      hitStop = Kit.motion.reduced() ? 0 : 0.065;
      J.impact(1.0);
      J.chime(3);
      Kit.track.hit();
      if (view) {
        view.shake(1.1);
        view.shockwave(0.6, ball.y, 0xffe44d, 6.2);
        view.burst(0.5, ball.y, 0, { count: 26, colors: [0xffe44d, 0xffffff, 0xff9224], speed: 16, life: 0.75, size: 1.25 });
      }
      spawnPopup('ضربة ذهبية!', 2.2, ball.y + 2.8, 'big');
    } else if (ball.grade === 'great') {
      J.impact(0.75);
      J.chime(2);
      Kit.track.hit();
      if (view) {
        view.shake(0.55);
        view.shockwave(0.6, ball.y, 0x6eff78, 4.2);
        view.burst(0.5, ball.y, 0, { count: 16, colors: [0x6eff78, 0xffe44d, 0xffffff], speed: 12, life: 0.6 });
      }
      spawnPopup('ضربة رائعة!', 2.0, ball.y + 2.4, 'cyan');
    } else if (ball.grade === 'good') {
      J.impact(0.5);
      if (view) view.burst(0.5, ball.y, 0, { count: 10, colors: [0x88e8ff, 0xffffff], speed: 9, life: 0.5 });
      spawnPopup('ضربة جيدة!', 2.0, ball.y + 2.0);
    } else {
      J.impact(0.32);
      Kit.track.miss();
      if (view) view.burst(0.5, ball.y, 0, { count: 8, colors: [0x5ee658, 0xffffff], speed: 7, life: 0.45 });
    }
    syncChrome();
  }

  /* --------------------------------------------------------------- Events & HUD */
  function handlePhysicsEvents(events) {
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type === 'coin') {
        J.coin(e.star ? 3 : 1);
        if (view) view.burst(e.x, e.y, 0, { count: e.star ? 12 : 6, colors: [0xffe44d, 0xffffff], speed: 8, life: 0.45, size: e.star ? 1.0 : 0.7, g: 4 });
        if (e.star) spawnPopup('+' + e.value + ' ⭐', e.x, e.y + 1.5);
      } else if (e.type === 'trampoline') {
        J.jump(0.9);
        J.streak(e.combo || 1);
        Kit.track.hit();
        if (view) {
          view.shake(0.65);
          view.shockwave(e.x, e.y, 0xffdf2b, 5.0);
          view.burst(e.x, e.y, 0, { count: 16, colors: [0xffdf2b, 0xff4747, 0xffffff], speed: 13, up: 6 });
        }
        spawnPopup('قفزة ترامبولين!', e.x, e.y + 2.2, 'big');
      } else if (e.type === 'tnt') {
        J.impact(1.0);
        J.pop(0.95);
        Kit.track.hit();
        if (view) {
          view.shake(1.15);
          view.shockwave(e.x, e.y, 0xff6229, 6.8);
          view.burst(e.x, e.y, 0, { count: 28, colors: [0xff451a, 0xffcc22, 0xffffff, 0xff8833], speed: 18, life: 0.8, size: 1.35, g: 8 });
        }
        spawnPopup('انفجار خارق! 💥', e.x, e.y + 2.5, 'coral big');
      } else if (e.type === 'balloon') {
        J.pop(0.75);
        J.streak(e.combo || 1);
        Kit.track.hit();
        if (view) {
          view.shake(0.5);
          view.shockwave(e.x, e.y, 0x5ceeff, 5.2);
          view.burst(e.x, e.y, 0, { count: 20, colors: [0xff5282, 0x5ceeff, 0xffe44d, 0x6dff78], speed: 14, life: 0.7, g: 6 });
        }
        spawnPopup('منطاد نطّاط! 🎈', e.x, e.y + 2.6, 'cyan');
      } else if (e.type === 'ring') {
        J.chime(3);
        J.whoosh(0.95);
        Kit.track.hit();
        if (view) {
          view.shake(0.7);
          view.shockwave(e.x, e.y, 0xffdf2b, 7.2);
          view.burst(e.x, e.y, 0, { count: 22, colors: [0xffe44d, 0x5ceeff, 0xffffff], speed: 15, life: 0.65, g: 2 });
        }
        spawnPopup('حلقة السرعة! ⚡', e.x, e.y + 2.8, 'big');
      } else if (e.type === 'ufo') {
        J.chime(3);
        J.jump(1.0);
        Kit.track.hit();
        if (view) {
          view.shake(0.9);
          view.shockwave(e.x, e.y, 0x5ceeff, 7.8);
          view.burst(e.x, e.y, 0, { count: 26, colors: [0x5ceeff, 0xd46bff, 0xffe44d, 0xffffff], speed: 17, life: 0.8, g: 1 });
        }
        spawnPopup('قفزة فضائية! 🛸', e.x, e.y + 3.0, 'cyan big');
      } else if (e.type === 'super') {
        J.jump(0.95);
        J.streak(e.combo || 1);
        Kit.track.hit();
        if (view) {
          view.shake(0.8);
          view.shockwave(e.x, e.y, 0xffe44d, 5.6);
          view.burst(e.x, e.y, 0, { count: 20, colors: [0xffe44d, 0x5ceeff, 0xffffff], speed: 14, up: 6 });
        }
        spawnPopup(e.perfect ? 'قفزة خارقة! ×' + e.combo : 'قفزة قوية!', e.x, e.y + 2.4, e.perfect ? 'big' : 'cyan');
      } else if (e.type === 'skip') {
        J.pop(0.65);
        Kit.track.hit();
        if (view) view.burst(e.x, e.y, 0, { count: 16, colors: [0x5ceeff, 0xffffff, 0x22b8ff], speed: 11, up: 5 });
        spawnPopup('قفز مائي! 💧', e.x, e.y + 2.0, 'cyan');
      } else if (e.type === 'splash') {
        J.land(0.7);
        Kit.track.miss();
        if (view) view.burst(e.x, e.y, 0, { count: 20, colors: [0x5ceeff, 0xffffff, 0x22b8ff], speed: 10, up: 6 });
        spawnPopup('طرطشة!', e.x, e.y + 2.0, 'cyan');
      } else if (e.type === 'bounce') {
        J.land(P.clamp((e.impact || 8) / 28, 0.25, 0.9));
        if (view) {
          var col = e.surface === 'sand' ? [0xf5d47a, 0xfff0b8] : [0x52db54, 0x9eff7a, 0xffffff];
          view.burst(e.x, e.y, 0, { count: 8, colors: col, speed: 7, up: 3, life: 0.45 });
        }
      } else if (e.type === 'layer') {
        J.chime(e.index >= 4 ? 3 : 2);
        showToast(e.layer.icon + ' دخلت ' + e.layer.name + '!', 2.2);
      } else if (e.type === 'milestone') {
        J.levelUp();
        showToast('🏆 عبرت ' + e.milestone.icon + ' ' + e.milestone.name + '!', 2.5);
      } else if (e.type === 'stop') {
        phase = 'landed';
        landedT = 0;
        resetHeldInput();
        commitShot(false);
        syncChrome();
      }
    }
  }

  function updateHUD(force) {
    if (phase === 'title') return;
    var dist = ball ? M.floor(ball.maxX) : 0;
    var alt = ball ? M.floor(M.max(0, ball.y - 2.2)) : 0;
    var coins = ball ? ball.coins : 0;
    var li = ball ? P.layerIndexAt(ball.y) : 0;

    if (force || dist !== hudMeters) {
      hudMeters = dist;
      $('meters').textContent = Kit.fmt(dist);
    }
    if (force || alt !== hudAlt) {
      hudAlt = alt;
      $('alt-meters').textContent = Kit.fmt(alt);
      var pct = P.clamp(alt / 320, 0, 1) * 100;
      $('alt-fill').style.height = pct.toFixed(1) + '%';
      $('alt-dot').style.bottom = pct.toFixed(1) + '%';
    }
    if (force || coins !== hudCoins) {
      hudCoins = coins;
      $('run-coins').textContent = Kit.fmt(coins);
    }
    if (force || li !== hudLayer) {
      hudLayer = li;
      var ly = P.LAYERS[li];
      $('layer-pill').textContent = ly.icon + ' ' + ly.name;
    }

    var fuelPct = ball ? P.clamp(ball.fuel / M.max(0.01, ball.maxFuel), 0, 1) * 100 : 100;
    $('fuel-fill').style.width = fuelPct.toFixed(1) + '%';
    $('fuel-fill').parentNode.parentNode.classList.toggle('empty', fuelPct <= 0.5);

    // Ghost hint (teaches by doing in the first 10 s or when idle!)
    var showHint = false;
    var hintTxt = '';
    if (!paused && !modalKind) {
      if (phase === 'aim' && (save.shots === 0 || idleHintT > 2.2)) {
        showHint = true; hintTxt = 'اختر الزاوية!';
      } else if (phase === 'power' && (save.shots === 0 || idleHintT > 2.0)) {
        showHint = true; hintTxt = 'اضرب في الذهبي!';
      } else if (phase === 'flight' && ball && !ball.done) {
        if (reticle && ball.vy < -2 && !ball.armed) {
          showHint = true; hintTxt = 'اضغط الآن لقفزة خارقة!';
        } else if (save.shots < 2 && ball.fuel > 0 && ball.time > 0.35 && ball.time < 2.8) {
          showHint = true; hintTxt = 'اضغط مطوّلاً للصاروخ! 🚀';
        }
      }
    }
    var gh = $('ghost-hint');
    gh.hidden = !showHint;
    if (showHint) {
      $('ghost-text').textContent = hintTxt;
      if (!tutorialStarted) {
        tutorialStarted = true;
        Kit.stats.tutorial('start');
      }
    }
  }

  var renderDt = 0;

  /* --------------------------------------------------------------- Loop */
  function update(dt) {
    if (failed || contextLost) return;
    if (paused) return;

    t += dt;
    renderDt = M.min(0.2, renderDt + dt);
    if (ptrGuardT > 0) ptrGuardT = M.max(0, ptrGuardT - dt);
    dirty = true;

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) $('toast').hidden = true;
    }
    updatePopups(dt);

    if (golferJump > 0) golferJump = M.max(0, golferJump - dt * 2.8);

    if (phase === 'title') return;

    if (phase === 'aim') {
      phaseT += dt;
      idleHintT += dt;
      aimAngle = P.aimAngle(phaseT, course.aimSpeed);
      updateHUD(false);
      return;
    }

    if (phase === 'power') {
      phaseT += dt;
      idleHintT += dt;
      powerVal = P.powerValue(phaseT, course.powerSpeed);
      updateHUD(false);
      return;
    }

    if (phase === 'swing') {
      swingT += dt * 9.5;
      if (swingT >= 1) launchNow();
      return;
    }

    if (phase === 'flight' && ball) {
      Kit.stats.busy();
      if (ball.done) {
        phase = 'landed';
        landedT = 0;
        resetHeldInput();
        commitShot(false);
        syncChrome();
        return;
      }
      if (hitStop > 0) {
        hitStop -= dt;
        return;
      }

      var wantBoost = (holdKeyBoost || holdPtrBoost) && ball.fuel > 0 && ball.mode === 'air';
      var ev = P.step(course, ball, save.upgrades, dt, { boost: wantBoost });

      if (ball.boosting) {
        boostSfxCd -= dt;
        boostBurstCd -= dt;
        if (boostSfxCd <= 0) {
          J.whoosh(0.45);
          boostSfxCd = 0.19;
        }
        if (boostBurstCd <= 0 && view) {
          var backAng = M.atan2(-ball.vy, -ball.vx);
          view.burst(ball.x, ball.y, 0, {
            count: 3,
            colors: [0xff5e1a, 0xffd426, 0xffffff],
            speed: 10,
            angle: backAng,
            spread: 0.7,
            life: 0.34,
            size: 0.85,
            g: 2
          });
          view.shake(0.18);
          boostBurstCd = 0.045;
        }
      }

      var prevRet = reticle;
      reticle = !ball.done && ball.mode === 'air' && ball.vy < -2 ? P.predictImpact(course, ball, 0.50) : null;
      if (reticle && !prevRet) Kit.track.cue();

      handlePhysicsEvents(ev);
      updateHUD(false);
      return;
    }

    if (phase === 'landed') {
      landedT += dt;
      if (landedT >= 1.15) openResultCard();
    }
  }

  function render() {
    if (!view || failed || contextLost) return;
    if (paused && !dirty) return;
    var playing = phase === 'aim' || phase === 'power' || phase === 'swing' || phase === 'flight';
    if (!dirty && !playing) return;
    if (!view.mayDraw(performance.now(), playing)) return;

    var stepDt = paused ? 0 : (renderDt > 0 ? renderDt : 1 / 60);
    renderDt = 0;

    view.sync({
      course: course,
      ball: ball,
      phase: phase,
      t: t,
      aimAngle: aimAngle,
      powerVal: powerVal,
      swingT: swingT,
      golferJump: golferJump,
      skin: save.skin,
      reticle: reticle,
      snap: snap
    }, stepDt);
    snap = false;
    view.render();
    if (paused) dirty = false;
  }

  function layout() {
    if (!view) return;
    var w = window.innerWidth || 1280;
    var h = window.innerHeight || 720;
    view.resize(w, h);
    dirty = true;
    if (paused) render();
  }

  /* --------------------------------------------------------------- Input Binding */
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (phase === 'title') return; // Title uses explicit Play button!
    if (phase === 'aim' && e.detail >= 2 && phaseT < 0.25) return;
    focusCanvas();
    triggerPrimaryDown(true);
  });

  window.addEventListener('pointerup', function () { holdPtrBoost = false; });
  window.addEventListener('pointercancel', function () { holdPtrBoost = false; });

  window.addEventListener('keydown', function (e) {
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;

    // Escape closes sub-modals or toggles pause cleanly (even if a modal button has focus!)
    if (e.code === 'Escape' && !e.repeat) {
      if (Kit.keys.isNativeTarget(e.target) && e.target.closest('input, textarea, select')) return;
      if (modalKind === 'shop') { e.preventDefault(); J.back(); setModal(''); return; }
      if (modalKind === 'skins') {
        e.preventDefault(); J.back();
        if (skinsReturn === 'result') setModal('result');
        else setModal('');
        return;
      }
      if (modalKind === 'pause') { e.preventDefault(); resumeGame(); return; }
      if (phase !== 'title' && phase !== 'result') { e.preventDefault(); pauseGame(true); return; }
    }

    // P pauses/resumes (even when Resume button has focus, never inside text inputs!)
    if (e.code === 'KeyP' && !e.repeat) {
      if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
      if (modalKind === 'pause') { e.preventDefault(); resumeGame(); return; }
      if (!modalKind && phase !== 'title' && phase !== 'result' && Kit.isGameKeyEvent(e)) {
        e.preventDefault(); pauseGame(true); return;
      }
    }

    // R plays again on result screen (never inside text inputs)
    if (e.code === 'KeyR' && !e.repeat && modalKind === 'result') {
      if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
      e.preventDefault(); J.select(); startShot(); return;
    }

    if (!Kit.isGameKeyEvent(e)) return;

    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
      e.preventDefault();
      if (phase === 'title' && !modalKind) { J.select(); startShot(); return; }
      if (modalKind === 'result') { J.select(); startShot(); return; }
      triggerPrimaryDown(false);
      return;
    }

    if ((e.code === 'ArrowDown' || e.code === 'KeyS') && !e.repeat) {
      e.preventDefault();
      triggerDiveKey();
    }
  });

  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space' || e.code === 'Enter') holdKeyBoost = false;
  });

  /* --------------------------------------------------------------- Buttons */
  $('play').addEventListener('click', function () { J.select(); startShot(); });
  $('open-shop').addEventListener('click', function () { J.tap(); setModal('shop'); });
  $('open-skins').addEventListener('click', function () { J.tap(); skinsReturn = 'title'; setModal('skins'); });
  $('pause').addEventListener('click', function () { pauseGame(true); });
  $('resume').addEventListener('click', function () { resumeGame(); });
  $('restart').addEventListener('click', function () { J.select(); startShot(); });
  $('pause-menu').addEventListener('click', function () { J.back(); goTitle(); });
  $('again').addEventListener('click', function () { J.select(); startShot(); });
  $('res-skins').addEventListener('click', function () { J.tap(); skinsReturn = 'result'; setModal('skins'); });
  $('menu').addEventListener('click', function () { J.back(); goTitle(); });
  $('close-modal').addEventListener('click', function () {
    J.back();
    if (modalKind === 'pause') resumeGame();
    else if (modalKind === 'skins' && skinsReturn === 'result') setModal('result');
    else setModal('');
  });

  /* --------------------------------------------------------------- Boot */
  function fail(err) {
    if (failed) return;
    failed = true; live = false;
    if (loop) loop.stop();
    $('title-screen').hidden = true;
    $('hud').hidden = true;
    $('modal').hidden = true;
    $('pause').hidden = true;
    $('webgl-error').hidden = false;
    Kit.fail(err);
  }

  function goLive() {
    if (failed) return;
    window.__game = {
      get phase() { return phase; },
      get paused() { return paused; },
      get modal() { return modalKind; },
      get meters() { return ball ? M.floor(ball.maxX) : 0; },
      get alt() { return ball ? M.floor(M.max(0, ball.y - 2.2)) : 0; },
      get layer() { return ball ? P.layerAt(ball.y).id : 'meadow'; },
      get aimAngle() { return aimAngle; },
      get powerVal() { return powerVal; },
      get ball() { return ball; },
      get course() { return course; },
      get reticle() { return reticle; },
      get skin() { return save.skin; },
      get reduced() { return Kit.motion.reduced(); },
      get popups() { return popups.map(function (p) { return p.text; }); },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get state() { return { phase: phase, paused: paused, modal: modalKind, meters: ball ? M.floor(ball.maxX) : 0 }; },
      info: function () {
        return {
          phase: phase,
          paused: paused,
          modal: modalKind,
          meters: ball ? M.floor(ball.maxX) : 0,
          alt: ball ? M.floor(M.max(0, ball.y - 2.2)) : 0,
          aimAngle: M.round(aimAngle * 10) / 10,
          powerVal: M.round(powerVal * 100) / 100,
          fuel: ball ? M.round(ball.fuel * 100) / 100 : 0,
          coins: save.coins,
          bestDist: save.bestDist,
          skin: save.skin
        };
      }
    };
    loop = Kit.loop(update, render);
    live = true;
    Kit.ready();
  }

  Kit.muteButton();
  Kit.lifecycle({
    pause: function () { pauseGame(false); },
    reset: resetHeldInput
  });
  Kit.motion.onChange(function (r) {
    if (view) view.calm = r;
    dirty = true;
    if (paused) render();
  });
  window.addEventListener('resize', layout);
  window.addEventListener('pageshow', function () { dirty = true; });
  Kit.webgl.watchContext(canvas, {
    notice: 'ctx-notice',
    onLost: function () { contextLost = true; pauseGame(false); },
    onRestored: function () { contextLost = false; snap = true; dirty = true; layout(); }
  });

  try {
    course = makeCourse();
    refreshTitleUI();
    syncChrome();

    Kit.webgl.boot(function () {
      view = A.createView(canvas);
      view.calm = Kit.motion.reduced();
      layout();
      view.prepare(function () {
        if (failed) return;
        try {
          view.sync({ course: course, ball: null, phase: 'title', t: 0, skin: save.skin, snap: true }, 0);
          view.render();
          view.whenDrawn(goLive, 5000);
        } catch (e) { fail(e); }
      });
    }, { guard: function () { return !failed; }, onError: fail });
  } catch (err) {
    fail(err);
  }
})();
