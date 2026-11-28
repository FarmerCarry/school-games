/* Toy Castle (قلعة الألعاب) — UI, controls, Kit lifecycle/DDA/stats/juice wiring.
 * Pure deterministic simulation lives in engine.js; 3D diorama lives in art.js. */
(function () {
  'use strict';

  var E = window.ToyCastleEngine;
  var A = window.ToyCastleArt;
  var J = Kit.juice;
  function $(id) { return document.getElementById(id); }

  var canvas = $('scene');
  var body = document.body;
  var fxLayer = $('fxLayer');

  /* ------------------------------------------- Bold Inline SVG Unit Icons */
  function unitSvg(kind, red) {
    var team = red ? '#ef4444' : '#3b82f6';
    var dark = red ? '#991b1b' : '#1d4ed8';
    var trim = red ? '#ff9f1c' : '#ffd23f';
    if (kind === 0) {
      // Foam Knight
      return '<svg class="tc-card-svg" viewBox="0 0 64 64" aria-hidden="true">' +
        '<rect x="18" y="28" width="24" height="24" rx="6" fill="' + team + '" stroke="#1e2342" stroke-width="3.5"/>' +
        '<rect x="18" y="13" width="24" height="19" rx="6" fill="' + team + '" stroke="#1e2342" stroke-width="3.5"/>' +
        '<path d="M26 7 Q32 3 38 11 L26 13 Z" fill="' + trim + '" stroke="#1e2342" stroke-width="2.5"/>' +
        '<rect x="23" y="19" width="16" height="8" rx="3" fill="#ffd6a5"/>' +
        '<circle cx="28" cy="23" r="2" fill="#1e2342"/><circle cx="35" cy="23" r="2" fill="#1e2342"/>' +
        '<circle cx="16" cy="41" r="10" fill="' + trim + '" stroke="#1e2342" stroke-width="3.5"/>' +
        '<rect x="44" y="14" width="8" height="32" rx="3" fill="#7be0ff" stroke="#1e2342" stroke-width="3"/>' +
        '<rect x="40" y="38" width="16" height="6" rx="2" fill="' + trim + '" stroke="#1e2342" stroke-width="2.5"/>' +
        '</svg>';
    }
    if (kind === 1) {
      // Toy Blaster Ranger
      return '<svg class="tc-card-svg" viewBox="0 0 64 64" aria-hidden="true">' +
        '<rect x="14" y="29" width="22" height="23" rx="6" fill="' + team + '" stroke="#1e2342" stroke-width="3.5"/>' +
        '<rect x="14" y="13" width="22" height="19" rx="6" fill="#ffd6a5" stroke="#1e2342" stroke-width="3.5"/>' +
        '<path d="M12 18 H40 V12 Q26 7 12 12 Z" fill="' + team + '" stroke="#1e2342" stroke-width="3"/>' +
        '<rect x="28" y="16" width="15" height="4" rx="2" fill="' + trim + '" stroke="#1e2342" stroke-width="2"/>' +
        '<circle cx="22" cy="24" r="2" fill="#1e2342"/><circle cx="30" cy="24" r="2" fill="#1e2342"/>' +
        '<rect x="28" y="33" width="26" height="12" rx="4" fill="#ff8c2b" stroke="#1e2342" stroke-width="3.2"/>' +
        '<rect x="50" y="35" width="9" height="8" rx="2" fill="#38f2ff" stroke="#1e2342" stroke-width="2.5"/>' +
        '</svg>';
    }
    if (kind === 2) {
      // Wind-Up Dino Tank
      return '<svg class="tc-card-svg" viewBox="0 0 64 64" aria-hidden="true">' +
        '<path d="M10 18 L18 10 L26 18 L18 26 Z" fill="' + trim + '" stroke="#1e2342" stroke-width="3"/>' +
        '<rect x="12" y="24" width="32" height="22" rx="7" fill="' + team + '" stroke="#1e2342" stroke-width="3.5"/>' +
        '<rect x="36" y="16" width="20" height="20" rx="6" fill="' + team + '" stroke="#1e2342" stroke-width="3.5"/>' +
        '<path d="M52 21 L61 17 L55 27 Z" fill="#fff" stroke="#1e2342" stroke-width="2.5"/>' +
        '<circle cx="47" cy="24" r="3" fill="#fff"/><circle cx="48" cy="24" r="1.6" fill="#1e2342"/>' +
        '<rect x="10" y="45" width="42" height="11" rx="5.5" fill="#2c2b47" stroke="#1e2342" stroke-width="3"/>' +
        '<circle cx="19" cy="50.5" r="3" fill="' + trim + '"/><circle cx="31" cy="50.5" r="3" fill="' + trim + '"/><circle cx="43" cy="50.5" r="3" fill="' + trim + '"/>' +
        '</svg>';
    }
    // 3: Mega Mech
    return '<svg class="tc-card-svg" viewBox="0 0 64 64" aria-hidden="true">' +
      '<rect x="16" y="10" width="32" height="16" rx="5" fill="' + team + '" stroke="#1e2342" stroke-width="3.5"/>' +
      '<rect x="21" y="14" width="22" height="7" rx="3" fill="#ffe066" stroke="#1e2342" stroke-width="2"/>' +
      '<rect x="12" y="25" width="40" height="23" rx="6" fill="' + team + '" stroke="#1e2342" stroke-width="3.5"/>' +
      '<circle cx="32" cy="36" r="6" fill="#38f2ff" stroke="#1e2342" stroke-width="2.5"/>' +
      '<rect x="5" y="26" width="10" height="18" rx="4" fill="' + trim + '" stroke="#1e2342" stroke-width="3"/>' +
      '<rect x="49" y="26" width="10" height="18" rx="4" fill="' + trim + '" stroke="#1e2342" stroke-width="3"/>' +
      '<rect x="17" y="47" width="12" height="11" rx="3" fill="' + dark + '" stroke="#1e2342" stroke-width="3"/>' +
      '<rect x="35" y="47" width="12" height="11" rx="3" fill="' + dark + '" stroke="#1e2342" stroke-width="3"/>' +
      '</svg>';
  }

  /* ------------------------------------------- Save & DDA */
  var store = Kit.store('toy-castle');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = E.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }

  var dda = Kit.dda('toy-castle', { id: 'main', target: 0.72, tiers: 5, start: 0.35 });

  /* ------------------------------------------- State */
  var screen = 'title';
  var world = null;
  var demo = null;
  var view = null;
  var time = 0;
  var dirty = true;
  var contextLost = false;
  var live = false;
  var failed = false;
  var queuedAction = null;
  var loop = null;
  var roundOpen = false;
  var shopFrom = 'title';
  var resultLock = 0;
  var resultMeta = null;
  var starTimer = 0;
  var starsRevealed = 0;
  var idleT = 0;
  var coachStage = 0; // 0 not shown, 1 spawn hint, 2 cannon hint, 3 done
  var coachStarted = false;
  var p1UsedCannon = false;
  var activeStageIndex = 0;
  var activeDuo = false;
  var matchCount = 0;

  var cardsP1 = [];
  var cardsP2 = [];
  var castleTiles = [];
  var bannerTiles = [];

  var hudCache = { hp1: -1, hp2: -1, en1: -1, en2: -1, score: -1, cd1: -1, cd2: -1 };

  function say(txt) { $('live').textContent = txt; }
  function focusCanvas() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }

  /* ------------------------------------------- Floating Popups */
  function spawnFloat(text, wx, wy, cls) {
    if (!view) return;
    var pt = view.worldToScreen(wx, wy, 0.5);
    var el = document.createElement('div');
    el.className = 'tc-float' + (cls ? ' ' + cls : '');
    el.textContent = text;
    el.style.left = Math.round(pt.x) + 'px';
    el.style.top = Math.round(pt.y) + 'px';
    fxLayer.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 950);
  }

  function clearFloats() {
    while (fxLayer.firstChild) fxLayer.removeChild(fxLayer.firstChild);
  }

  /* ------------------------------------------- Screen Management */
  var SCREENS = { title: 'scrTitle', map: 'scrMap', shop: 'scrShop', pause: 'scrPause', result: 'scrResult' };
  function setScreen(next) {
    screen = next;
    body.dataset.mode = next;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== next;
    $('hud').hidden = !(next === 'play' || next === 'pause');
    $('btnPause').hidden = next !== 'play';
    if (next !== 'play') $('ghostHint').hidden = true;
    dirty = true;
    if (next === 'play') focusCanvas();
  }

  function closeOpenRound() {
    if (roundOpen) {
      Kit.stats.end('quit');
      roundOpen = false;
    }
  }

  function refreshTitleUI() {
    $('titleCoins').querySelector('b').textContent = Kit.fmt(save.coins);
    $('titleStars').querySelector('b').textContent = E.totalStars(save) + '/' + (E.STAGES.length * 3);
    $('titleBest').querySelector('b').textContent = Kit.fmt(save.bestScore);
  }

  function initDemo() {
    demo = E.create({ demo: true, stageIndex: 0, worldIndex: 0, seed: 2026 });
    // Seed a lively mid-arena clash so the title battle diorama shines right away
    E.spawnUnit(demo, 0, 0, { free: true });
    E.spawnUnit(demo, 1, 0, { free: true });
    for (var i = 0; i < 65; i++) E.step(demo, 1 / 30);
    E.spawnUnit(demo, 0, 1, { free: true });
    E.spawnUnit(demo, 1, 2, { free: true });
    for (var j = 0; j < 45; j++) E.step(demo, 1 / 30);
    demo.events.length = 0;
  }

  function toTitle() {
    closeOpenRound();
    clearFloats();
    world = null;
    body.classList.remove('is-duo');
    if (!demo) initDemo();
    refreshTitleUI();
    setScreen('title');
  }

  /* ------------------------------------------- Build Unit Docks */
  var UNIT_SHORT_NAMES = ['فارس', 'رامي', 'ديناصور', 'العملاق'];
  function cardInnerHtml(kind, side, key) {
    var u = E.UNITS[kind];
    return '<span class="tc-card-key">' + key + '</span>' +
      unitSvg(kind, side === 1) +
      '<span class="tc-card-name" dir="rtl">' + UNIT_SHORT_NAMES[kind] + '</span>' +
      '<span class="tc-card-cost">⚡ ' + u.cost + '</span>' +
      '<span class="tc-card-cd" style="transform:scaleY(0)"></span>';
  }
  function buildUnitDocks() {
    var p1Keys = ['1', '2', '3', '4'];
    var p2Keys = ['7', '8', '9', '0'];
    function populate(container, side, keys, arr) {
      container.innerHTML = '';
      for (var i = 0; i < E.UNITS.length; i++) {
        (function (kind) {
          var u = E.UNITS[kind];
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tc-card';
          btn.dataset.side = String(side);
          btn.dataset.kind = String(kind);
          btn.title = u.name + ' (' + u.cost + ' ⚡)';
          btn.innerHTML = cardInnerHtml(kind, side, keys[kind]);
          btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            trySpawn(side, kind);
            focusCanvas();
          });
          container.appendChild(btn);
          arr.push(btn);
        })(i);
      }
    }
    populate($('cardsP1'), 0, p1Keys, cardsP1);
    populate($('cardsP2'), 1, p2Keys, cardsP2);
  }

  function updateCardDock(side, cards) {
    if (!world) return;
    var s = world.sides[side];
    for (var i = 0; i < cards.length; i++) {
      var btn = cards[i];
      var u = E.UNITS[i];
      var unlocked = s.unlocked[i];
      var cdEl = btn.querySelector('.tc-card-cd');
      if (!unlocked) {
        if (!btn.classList.contains('locked')) {
          btn.classList.add('locked');
          btn.classList.remove('disabled');
          btn.disabled = true;
          var unlockStage = i === 2 ? '1-2' : (i === 3 ? '1-3' : '1-1');
          btn.innerHTML =
            '<span class="tc-card-lock" aria-hidden="true">🔒</span>' +
            '<span class="tc-card-name" dir="rtl">' + UNIT_SHORT_NAMES[i] + '</span>' +
            '<span class="tc-card-unlock" dir="ltr">' + unlockStage + '</span>';
        }
        continue;
      }
      if (btn.classList.contains('locked')) {
        btn.classList.remove('locked');
        var keys = side === 0 ? ['1', '2', '3', '4'] : ['7', '8', '9', '0'];
        btn.innerHTML = cardInnerHtml(i, side, keys[i]);
        cdEl = btn.querySelector('.tc-card-cd');
      }
      var affordable = E.canSpawn(world, side, i);
      btn.disabled = !affordable;
      btn.classList.toggle('disabled', !affordable);
      if (cdEl) {
        var frac = u.cd > 0 ? Kit.clamp(s.unitCds[i] / u.cd, 0, 1) : 0;
        cdEl.style.transform = 'scaleY(' + frac.toFixed(3) + ')';
      }
    }
  }

  /* ------------------------------------------- Map & Shop UI */
  function openMap() {
    J.select();
    var wrap = $('mapWorlds');
    wrap.innerHTML = '';
    for (var w = 0; w < E.WORLDS.length; w++) {
      var worldDef = E.WORLDS[w];
      var row = document.createElement('div');
      row.className = 'tc-world-row';
      row.innerHTML = '<div class="tc-world-title"><span style="color:' + worldDef.accent + '">●</span> ' + worldDef.name + '</div>';
      var grid = document.createElement('div');
      grid.className = 'tc-stage-btns';
      for (var k = 0; k < 3; k++) {
        (function (idx) {
          var st = E.STAGES[idx];
          var unlocked = idx <= save.unlockedStage;
          var stars = save.stars[idx];
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'tc-stage-btn' + (stars > 0 ? ' cleared' : unlocked ? ' unlocked' : '');
          b.disabled = !unlocked;
          var starStr = unlocked ? ('★'.repeat(stars) + '☆'.repeat(3 - stars)) : '🔒';
          b.innerHTML = '<span>' + st.id + (st.boss ? ' 👑' : '') + '</span>' +
            '<span class="tc-stage-stars">' + starStr + '</span>' +
            '<span class="tc-stage-name">' + st.name + '</span>';
          b.addEventListener('click', function () { startBattle(idx, false); });
          grid.appendChild(b);
        })(w * 3 + k);
      }
      row.appendChild(grid);
      wrap.appendChild(row);
    }
    setScreen('map');
  }

  function buildShop() {
    var cg = $('castleGrid');
    var bg = $('bannerGrid');
    cg.innerHTML = '';
    bg.innerHTML = '';
    E.CASTLE_SKINS.forEach(function (sk, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tc-skin-tile';
      b.title = sk.name;
      b.innerHTML = '<span class="tc-skin-swatch" style="background:' + sk.accent + '"></span><span class="tc-tile-price"></span>';
      b.addEventListener('click', function () { clickSkin('castle', i); });
      cg.appendChild(b);
      castleTiles.push(b);
    });
    E.BANNER_SKINS.forEach(function (bn, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tc-skin-tile';
      b.title = bn.name;
      b.innerHTML = '<span class="tc-skin-ico">' + bn.icon + '</span><span class="tc-tile-price"></span>';
      b.addEventListener('click', function () { clickSkin('banner', i); });
      bg.appendChild(b);
      bannerTiles.push(b);
    });
  }

  function refreshShopUI() {
    $('shopCoins').querySelector('b').textContent = Kit.fmt(save.coins);
    castleTiles.forEach(function (b, i) {
      var owned = !!save.ownedCastles[i];
      var active = save.castleSkin === i;
      b.classList.toggle('active', active);
      b.querySelector('.tc-tile-price').textContent = active ? '✓' : (owned ? 'اختر' : '🪙' + E.CASTLE_SKINS[i].price);
    });
    bannerTiles.forEach(function (b, i) {
      var owned = !!save.ownedBanners[i];
      var active = save.bannerSkin === i;
      b.classList.toggle('active', active);
      b.querySelector('.tc-tile-price').textContent = active ? '✓' : (owned ? 'اختر' : '🪙' + E.BANNER_SKINS[i].price);
    });
  }

  function openShop(from) {
    shopFrom = from || 'title';
    J.select();
    refreshShopUI();
    setScreen('shop');
  }

  function clickSkin(kind, idx) {
    var res = E.buyOrEquipSkin(save, kind, idx);
    if (!res.ok) {
      J.error();
      return;
    }
    if (res.action === 'buy') J.chime(2);
    else J.tap();
    persist();
    refreshShopUI();
    refreshTitleUI();
    dirty = true;
  }

  /* ------------------------------------------- Start / Pause / End Battle */
  function startBattle(stageIndex, isDuo) {
    if (!live) {
      queuedAction = function () { startBattle(stageIndex, isDuo); };
      return;
    }
    closeOpenRound();
    clearFloats();
    matchCount++;
    activeDuo = !!isDuo;
    activeStageIndex = Kit.clamp(stageIndex | 0, 0, E.STAGES.length - 1);
    var ddaLevel = activeDuo ? 0.35 : dda.level;
    var seed = ((Date.now() ^ (matchCount * 2654435761)) >>> 0) || 1337;

    world = E.create({
      duo: activeDuo,
      stageIndex: activeStageIndex,
      worldIndex: activeDuo ? (matchCount % E.WORLDS.length) : E.STAGES[activeStageIndex].world,
      dda: ddaLevel,
      seed: seed
    });

    body.classList.toggle('is-duo', activeDuo);
    $('dockP2').hidden = !activeDuo;
    $('stageBadge').textContent = activeDuo ? '👥 لاعبان' : (E.STAGES[activeStageIndex].id + ' · ' + E.WORLDS[world.worldIndex].name);
    hudCache = { hp1: -1, hp2: -1, en1: -1, en2: -1, score: -1, cd1: -1, cd2: -1 };
    idleT = 0;
    coachStage = 0;
    coachStarted = false;
    p1UsedCannon = false;
    resultMeta = null;
    starsRevealed = 0;

    // Reset card DOM cleanly for this stage's unlocked units
    updateCardDock(0, cardsP1);
    if (activeDuo) updateCardDock(1, cardsP2);
    syncHud();

    // Telemetry: valid round id (never 3 digits in a row)
    var roundId = activeDuo ? 'duo' : ('L' + E.STAGES[activeStageIndex].id);
    Kit.stats.round(roundId);
    roundOpen = true;

    J.select();
    setScreen('play');
    say(activeDuo ? 'بدأت معركة لاعبين!' : 'بدأت المرحلة ' + E.STAGES[activeStageIndex].id);
  }

  function pauseGame(userClicked) {
    if (screen !== 'play') return;
    if (userClicked) J.tap();
    setScreen('pause');
    say('استراحة');
  }

  function resumeGame() {
    if (screen !== 'pause') return;
    J.select();
    setScreen('play');
    say('متابعة اللعب');
  }

  function finishBattle(ev) {
    resultLock = 0.38;
    starTimer = 0;
    starsRevealed = 0;
    var won = ev.winner === 0;
    var meta = { isNewBest: false, coinsEarned: ev.coins || 0, newUnit: null };

    if (!activeDuo) {
      var rec = E.recordSoloResult(save, activeStageIndex, ev);
      meta.isNewBest = rec.isNewBest;
      meta.coinsEarned = rec.coinsEarned;
      persist();
      // Report DDA and telemetry for solo rounds only
      var ddaOutcome = won ? (0.55 + ev.stars * 0.15) : 0;
      dda.result(ddaOutcome);
      Kit.stats.end(won ? 'win' : 'lose', ev.score);
      if (won && activeStageIndex + 1 < E.STAGES.length) {
        var nextSt = E.STAGES[activeStageIndex + 1];
        if (nextSt.newUnit != null) meta.newUnit = E.UNITS[nextSt.newUnit].name;
      }
    } else {
      Kit.stats.end('end');
    }
    roundOpen = false;
    resultMeta = { ev: ev, meta: meta };

    // Big victory / defeat fanfare & brick explosion!
    if (won || activeDuo) {
      J.levelUp();
      var lostX = ev.winner === 0 ? E.RIGHT_CASTLE_X : E.LEFT_CASTLE_X;
      if (view) {
        view.shake(1.1);
        view.burst(lostX, 2.8, 0, { count: 44, speed: 11, size: 0.42, life: 1.25, colors: [0xffd23f, 0xff595e, 0x3b82f6, 0x38f2ff, 0x2ee57b] });
      }
    } else {
      J.fail();
      if (view) {
        view.shake(0.9);
        view.burst(E.LEFT_CASTLE_X, 2.8, 0, { count: 36, speed: 9, size: 0.38, life: 1.1, colors: [0x3b82f6, 0xffd23f, 0xffffff] });
      }
    }

    // Populate Result UI
    $('resTitle').textContent = activeDuo
      ? (won ? '🏆 فاز اللاعب 1!' : '🏆 فاز اللاعب 2!')
      : (won ? '🎉 نصر ساحق!' : '💪 حاول مجددًا!');
    $('resNewBest').hidden = !meta.isNewBest;
    $('resScore').querySelector('b').textContent = Kit.fmt(ev.score);
    $('resCoins').querySelector('b').textContent = '+' + Kit.fmt(meta.coinsEarned);
    $('resCoins').hidden = activeDuo;
    $('resStars').hidden = activeDuo;
    var starEls = $('resStars').querySelectorAll('.tc-star');
    for (var s = 0; s < starEls.length; s++) starEls[s].classList.remove('lit');

    var unlockEl = $('resUnlock');
    if (meta.newUnit) {
      unlockEl.hidden = false;
      unlockEl.textContent = '✨ بطل جديد مفتوح: ' + meta.newUnit + '!';
    } else {
      unlockEl.hidden = true;
    }

    var hasNext = !activeDuo && won && activeStageIndex + 1 < E.STAGES.length;
    $('btnNext').hidden = !hasNext;
    $('btnAgain').textContent = hasNext ? '↻ إعادة' : '↻ العب مجددًا';

    refreshTitleUI();
    setScreen('result');
  }

  /* ------------------------------------------- Player Actions */
  function trySpawn(side, kind) {
    if (screen !== 'play' || !world || world.winner !== -1) return false;
    var u = E.spawnUnit(world, side, kind);
    if (!u) {
      if (side === 0) J.error();
      return false;
    }
    if (side === 0) {
      idleT = 0;
      if (coachStage < 2) {
        coachStage = 2;
        $('ghostHint').hidden = true;
      }
    }
    J.pop(0.35 + kind * 0.18);
    if (view) {
      view.burst(u.x, 0.8, u.z, { count: 8, speed: 4.5, size: 0.2, life: 0.4, colors: side === 0 ? [0x3b82f6, 0xffd23f, 0xffffff] : [0xef4444, 0xff9f1c, 0xffffff] });
    }
    return true;
  }

  function tryFireCannon(side) {
    if (screen !== 'play' || !world || world.winner !== -1) return false;
    if (!E.fireCannon(world, side)) return false;
    if (side === 0) {
      idleT = 0;
      p1UsedCannon = true;
      if (coachStage < 3) {
        coachStage = 3;
        $('ghostHint').hidden = true;
        if (coachStarted) {
          coachStarted = false;
          Kit.stats.tutorial('done');
        }
      }
    }
    J.whoosh(0.7);
    if (view) {
      view.shake(0.32);
      var sx = side === 0 ? E.LEFT_CASTLE_X + 1.4 : E.RIGHT_CASTLE_X - 1.4;
      view.burst(sx, E.CANNON_Y + 0.3, 0, { count: 10, speed: 5.5, size: 0.24, life: 0.4, gravity: 4, colors: [0xffffff, 0xffe066, 0xd89e5a] });
    }
    return true;
  }

  /* ------------------------------------------- Process Engine Events */
  function handleEvents(events) {
    if (!events || !events.length) return;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'cratePop') {
        J.coin(2);
        J.chime(2);
        if (ev.side === 0 && !activeDuo) Kit.track.hit();
        if (view) {
          view.shake(0.38);
          view.burst(ev.x, ev.y, 0, { count: 22, speed: 8, size: 0.28, life: 0.7, colors: [0xffd23f, 0x38f2ff, 0xff595e, 0xffffff] });
        }
        spawnFloat('+' + ev.energy + ' ⚡', ev.x, ev.y + 0.8, 'gold');
      } else if (ev.type === 'cannonHit') {
        J.impact(0.65);
        if (ev.side === 0 && !activeDuo) Kit.track.hit();
        if (view) {
          view.shake(0.42);
          view.burst(ev.x, ev.y, 0, { count: 16, speed: 7, size: 0.24, life: 0.55, colors: [0xffd23f, 0xff7b29, 0xffffff] });
        }
        spawnFloat('بونك!', ev.x, ev.y + 1.0, 'cyan');
      } else if (ev.type === 'cannonMiss') {
        J.land(0.3);
        if (ev.side === 0 && !activeDuo) Kit.track.miss();
        if (view) {
          view.burst(ev.x, 0.35, 0, { count: 7, speed: 3.5, size: 0.18, life: 0.35, colors: [0xffffff, 0xd89e5a] });
        }
      } else if (ev.type === 'dartFire') {
        J.tap();
      } else if (ev.type === 'meleeAttack') {
        J.impact(ev.kind === 3 ? 0.72 : (ev.kind === 2 ? 0.5 : 0.28));
        if (view && ev.kind >= 2) view.shake(ev.kind === 3 ? 0.35 : 0.18);
      } else if (ev.type === 'unitDefeat') {
        J.pop(ev.isBoss ? 0.9 : 0.55);
        if (view) {
          view.burst(ev.x, ev.y + 0.5, ev.z, {
            count: ev.isBoss ? 28 : 12, speed: ev.isBoss ? 8.5 : 6, size: 0.24, life: 0.65,
            colors: ev.side === 0 ? [0x3b82f6, 0xffd23f, 0xffffff] : [0xef4444, 0xff9f1c, 0xffe066]
          });
        }
      } else if (ev.type === 'castleHit') {
        J.impact(0.55);
        if (view) {
          view.shake(0.28);
          var cx = ev.side === 0 ? E.LEFT_GATE_X : E.RIGHT_GATE_X;
          view.burst(cx, 1.8, 0, { count: 10, speed: 6, size: 0.26, life: 0.5, colors: ev.side === 0 ? [0x3b82f6, 0xffd23f] : [0xef4444, 0xff9f1c] });
        }
      } else if (ev.type === 'bossSpawn') {
        J.countdown(0);
        if (view) view.shake(0.55);
        var bName = world && world.bossSpec ? world.bossSpec.name : 'زعيم!';
        spawnFloat('👑 ' + bName + '!', 0, 5.2, 'boss');
      } else if (ev.type === 'matchEnd') {
        finishBattle(ev);
      }
    }
  }

  /* ------------------------------------------- HUD Sync */
  function syncHud() {
    if (!world) return;
    var s0 = world.sides[0];
    var s1 = world.sides[1];
    var hp1 = Math.ceil(s0.hp);
    var hp2 = Math.ceil(s1.hp);
    if (hp1 !== hudCache.hp1) {
      hudCache.hp1 = hp1;
      $('hpText1').textContent = String(hp1);
      $('hpFill1').style.width = (Kit.clamp(s0.hp / s0.maxHp, 0, 1) * 100).toFixed(1) + '%';
    }
    if (hp2 !== hudCache.hp2) {
      hudCache.hp2 = hp2;
      $('hpText2').textContent = String(hp2);
      $('hpFill2').style.width = (Kit.clamp(s1.hp / s1.maxHp, 0, 1) * 100).toFixed(1) + '%';
    }
    var en1 = Math.floor(s0.energy);
    if (en1 !== hudCache.en1) {
      hudCache.en1 = en1;
      $('enText1').textContent = String(en1);
      $('enFill1').style.width = (Kit.clamp(s0.energy / E.MAX_ENERGY, 0, 1) * 100).toFixed(1) + '%';
    }
    var rdy1 = s0.cannonCd <= 0.05 ? 1 : 0;
    if (rdy1 !== hudCache.cd1) {
      hudCache.cd1 = rdy1;
      $('cannonPill1').classList.toggle('reloading', !rdy1);
      $('cannonPill1').disabled = !rdy1;
      $('cannonState1').textContent = rdy1 ? 'أطلق المدفع!' : 'شحن…';
    }
    $('cannonCd1').style.transform = 'scaleY(' + Kit.clamp(s0.cannonCd / E.CANNON_COOLDOWN, 0, 1).toFixed(3) + ')';
    if (activeDuo) {
      var en2 = Math.floor(s1.energy);
      if (en2 !== hudCache.en2) {
        hudCache.en2 = en2;
        $('enText2').textContent = String(en2);
        $('enFill2').style.width = (Kit.clamp(s1.energy / E.MAX_ENERGY, 0, 1) * 100).toFixed(1) + '%';
      }
      var rdy2 = s1.cannonCd <= 0.05 ? 1 : 0;
      if (rdy2 !== hudCache.cd2) {
        hudCache.cd2 = rdy2;
        $('cannonPill2').classList.toggle('reloading', !rdy2);
        $('cannonPill2').disabled = !rdy2;
        $('cannonState2').textContent = rdy2 ? 'أطلق المدفع!' : 'شحن…';
      }
      $('cannonCd2').style.transform = 'scaleY(' + Kit.clamp(s1.cannonCd / E.CANNON_COOLDOWN, 0, 1).toFixed(3) + ')';
    }
    if (world.score !== hudCache.score) {
      hudCache.score = world.score;
      $('scoreText').textContent = '🏆 ' + Kit.fmt(world.score);
    }
    updateCardDock(0, cardsP1);
    if (activeDuo) updateCardDock(1, cardsP2);
  }

  /* ------------------------------------------- Keyboard & Mouse Input */
  var P1_SPAWN_KEYS = [
    ['Digit1', 'KeyQ'],
    ['Digit2', 'KeyW'],
    ['Digit3', 'KeyE'],
    ['Digit4', 'KeyR']
  ];
  var P2_SPAWN_KEYS = [
    ['Digit7', 'KeyU'],
    ['Digit8', 'KeyI'],
    ['Digit9', 'KeyO'],
    ['Digit0', 'KeyP']
  ];

  function handleCanvasAim(clientX, clientY, fireNow) {
    if (screen !== 'play' || !world || world.winner !== -1 || !view) return;
    var r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    var ndcX = ((clientX - r.left) / r.width) * 2 - 1;
    var ndcY = -((clientY - r.top) / r.height) * 2 + 1;
    var pt = view.screenToLane(ndcX, ndcY);
    if (pt) {
      E.setCannonAim(world, 0, pt.x, Math.max(0.45, pt.y));
      if (fireNow) tryFireCannon(0);
    }
  }

  canvas.addEventListener('pointermove', function (e) {
    if (screen === 'play' && !activeDuo) handleCanvasAim(e.clientX, e.clientY, false);
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    if (screen === 'play' && !activeDuo) {
      handleCanvasAim(e.clientX, e.clientY, true);
    }
  });

  function processKeyboard(dt) {
    var K = Kit.keys;
    if (screen === 'title') {
      if (K.anyPressed(['Enter', 'Space'])) {
        startBattle(save.unlockedStage, false);
      }
    } else if (screen === 'map' || screen === 'shop') {
      if (K.pressed('Escape')) {
        J.back();
        if (screen === 'shop' && shopFrom === 'result' && resultMeta) setScreen('result');
        else toTitle();
      }
    } else if (screen === 'pause') {
      if (K.anyPressed(['Escape', 'KeyP'])) resumeGame();
      else if (K.pressed('KeyR')) startBattle(activeStageIndex, activeDuo);
    } else if (screen === 'result') {
      if (resultLock <= 0 && K.anyPressed(['Enter', 'Space', 'KeyR'])) {
        var won = resultMeta && resultMeta.ev.winner === 0;
        if (!activeDuo && won && activeStageIndex + 1 < E.STAGES.length) {
          startBattle(activeStageIndex + 1, false);
        } else {
          startBattle(activeStageIndex, activeDuo);
        }
      }
    } else if (screen === 'play' && world) {
      // Pause: Esc always; P pauses in solo (in 2P, P summons P2's Mega Mech!)
      if (K.pressed('Escape') || (!activeDuo && K.pressed('KeyP'))) {
        pauseGame(true);
        return;
      }

      // P1 Unit Summon (1-4 or Q/W/E/R — works on press or held on slow frames)
      for (var i = 0; i < 4; i++) {
        if (K.anyPressed(P1_SPAWN_KEYS[i]) || K.anyDown(P1_SPAWN_KEYS[i])) {
          if (E.canSpawn(world, 0, i)) trySpawn(0, i);
        }
      }

      // P1 Cannon Aim & Fire
      var aim1 = 0;
      if (K.down('KeyA') || (!activeDuo && K.down('ArrowLeft'))) aim1 -= 1;
      if (K.down('KeyD') || (!activeDuo && K.down('ArrowRight'))) aim1 += 1;
      if (aim1) E.nudgeCannonAim(world, 0, aim1, dt);
      if (K.anyPressed(['Space', 'KeyS'])) tryFireCannon(0);

      // P2 Controls in 2-Player Local Mode
      if (activeDuo) {
        for (var j = 0; j < 4; j++) {
          if (K.anyPressed(P2_SPAWN_KEYS[j]) || K.anyDown(P2_SPAWN_KEYS[j])) {
            if (E.canSpawn(world, 1, j)) trySpawn(1, j);
          }
        }
        var aim2 = 0;
        if (K.down('ArrowLeft')) aim2 -= 1;
        if (K.down('ArrowRight')) aim2 += 1;
        if (aim2) E.nudgeCannonAim(world, 1, aim2, dt);
        if (K.anyPressed(['ArrowDown', 'Enter'])) tryFireCannon(1);
      }
    }
  }

  /* ------------------------------------------- Main Update & Render */
  function update(dt) {
    if (failed) return;
    processKeyboard(dt);
    Kit.keys.endFrame();

    if (screen === 'pause') return;
    time += dt;

    if (screen === 'play' && world) {
      Kit.stats.busy();
      var evs = E.step(world, dt);
      handleEvents(evs);
      syncHud();

      // First-10-seconds teach-by-doing ghost hint on Stage 1-1
      if (!activeDuo && activeStageIndex === 0 && world.winner === -1) {
        idleT += dt;
        if (coachStage === 0 && world.sides[0].spawned === 0 && idleT >= 2.2) {
          coachStage = 1;
          $('ghostKey').textContent = '1';
          $('ghostMsg').textContent = 'اضغط 1 أو انقر لإرسال فارس!';
          $('ghostHint').hidden = false;
          if (!coachStarted) { coachStarted = true; Kit.stats.tutorial('start'); }
        } else if (coachStage === 2 && !p1UsedCannon && idleT >= 3.2) {
          $('ghostKey').textContent = 'مسافة';
          $('ghostMsg').textContent = 'انقر أو اضغط مسافة لإطلاق المدفع!';
          $('ghostHint').hidden = false;
          if (!coachStarted) { coachStarted = true; Kit.stats.tutorial('start'); }
        }
      }
      dirty = true;
    } else if (screen === 'result') {
      resultLock = Math.max(0, resultLock - dt);
      if (world) E.step(world, dt);
      // Stagger star award animations with Kit.juice.star(1..3)
      if (resultMeta && !activeDuo && resultMeta.ev.stars > starsRevealed) {
        starTimer += dt;
        if (starTimer >= 0.26) {
          starTimer = 0;
          starsRevealed++;
          var starEls = $('resStars').querySelectorAll('.tc-star');
          if (starEls[starsRevealed - 1]) starEls[starsRevealed - 1].classList.add('lit');
          J.star(starsRevealed);
        }
      }
      dirty = true;
    } else if (screen === 'title' || screen === 'shop' || screen === 'map') {
      if (demo) {
        E.step(demo, dt);
        demo.events.length = 0; // Silent live 3D attract scene
      }
      dirty = true;
    }
  }

  function render() {
    if (failed || !view || contextLost) return;
    if (screen === 'pause' && !dirty) return;
    var playing = screen === 'play';
    if (!view.mayDraw(performance.now(), playing)) return;
    var active = (screen === 'play' || screen === 'pause' || screen === 'result') ? world : demo;
    view.sync(active, {
      dt: screen === 'pause' ? 0 : 1 / 60,
      t: time,
      mode: screen,
      castleSkin: save.castleSkin,
      bannerSkin: save.bannerSkin
    });
    view.render();
    dirty = false;
  }

  function layout() {
    if (view) view.resize(window.innerWidth, window.innerHeight);
    dirty = true;
  }

  /* ------------------------------------------- Bind Buttons */
  function bindButtons() {
    $('btnPlay').addEventListener('click', function () { startBattle(save.unlockedStage, false); });
    $('btnMap').addEventListener('click', openMap);
    $('btnMapBack').addEventListener('click', function () { J.back(); toTitle(); });
    $('btnDuo').addEventListener('click', function () { startBattle(0, true); });
    $('btnShop').addEventListener('click', function () { openShop('title'); });
    $('btnShopBack').addEventListener('click', function () {
      J.back();
      if (shopFrom === 'result' && resultMeta) setScreen('result');
      else toTitle();
    });
    $('btnPause').addEventListener('click', function () { pauseGame(true); });
    $('btnResume').addEventListener('click', resumeGame);
    $('btnRestart').addEventListener('click', function () { startBattle(activeStageIndex, activeDuo); });
    $('btnHome').addEventListener('click', function () { J.back(); toTitle(); });
    $('btnNext').addEventListener('click', function () { startBattle(activeStageIndex + 1, false); });
    $('btnAgain').addEventListener('click', function () { startBattle(activeStageIndex, activeDuo); });
    $('btnResShop').addEventListener('click', function () { openShop('result'); });
    $('btnResHome').addEventListener('click', function () { J.back(); toTitle(); });
    ['cannonPill1', 'cannonPill2'].forEach(function (id, idx) {
      var btn = $(id);
      btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        tryFireCannon(idx);
        focusCanvas();
      });
    });
  }

  /* ------------------------------------------- Boot & Lifecycle */
  function fail(err) {
    if (failed) return;
    failed = true;
    live = false;
    queuedAction = null;
    if (loop) loop.stop();
    for (var k in SCREENS) $(SCREENS[k]).hidden = true;
    $('hud').hidden = true;
    $('scrError').hidden = false;
    body.dataset.mode = 'error';
    Kit.fail(err);
  }

  function buildStateSnapshot() {
    var w = world;
    var s0 = w ? w.sides[0] : null;
    var s1 = w ? w.sides[1] : null;
    return {
      screen: screen,
      id: w ? w.id : '',
      mode: activeDuo ? 'duo' : 'solo',
      duo: activeDuo,
      stageIndex: activeStageIndex,
      worldIndex: w ? w.worldIndex : 0,
      time: w ? w.time : 0,
      frames: w ? w.frames : 0,
      energy: s0 ? s0.energy : 0,
      energy2: s1 ? s1.energy : 0,
      p1Spawned: s0 ? s0.spawned : 0,
      p2Spawned: s1 ? s1.spawned : 0,
      units: w ? w.units.length : 0,
      crates: w ? w.crates.length : 0,
      corks: w ? w.corks.length : 0,
      hp1: s0 ? s0.hp : 0,
      hp2: s1 ? s1.hp : 0,
      maxHp1: s0 ? s0.maxHp : 0,
      maxHp2: s1 ? s1.maxHp : 0,
      aimX1: s0 ? s0.aimX : 0,
      aimY1: s0 ? s0.aimY : 0,
      aimX2: s1 ? s1.aimX : 0,
      aimY2: s1 ? s1.aimY : 0,
      cannonShots1: s0 ? s0.cannonShots : 0,
      cannonHits1: s0 ? s0.cannonHits : 0,
      cratesPopped: s0 ? s0.cratesPopped : 0,
      score: w ? w.score : 0,
      winner: w ? w.winner : -1,
      stars: w ? w.stars : 0
    };
  }

  function goLive() {
    if (failed) return;
    window.__game = {
      get state() { return buildStateSnapshot(); },
      get world() { return world; },
      get demo() { return demo; },
      get save() { return JSON.parse(JSON.stringify(save)); },
      info: buildStateSnapshot,
      point: function (wx, wy) {
        return view ? view.worldToScreen(wx, wy, 0) : { x: 0, y: 0 };
      },
      startStage: function (idx) { startBattle(idx, false); },
      startDuo: function () { startBattle(0, true); }
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

  Kit.muteButton();
  Kit.lifecycle({
    pause: function () { pauseGame(false); },
    reset: function () { Kit.keys.reset(); }
  });
  Kit.motion.onChange(function (r) { if (view) view.calm = r; dirty = true; });
  window.addEventListener('resize', layout);
  window.addEventListener('pageshow', function () { dirty = true; });
  Kit.webgl.watchContext(canvas, {
    notice: 'ctxNotice',
    onLost: function () { contextLost = true; pauseGame(false); },
    onRestored: function () { contextLost = false; dirty = true; layout(); }
  });

  try {
    buildUnitDocks();
    buildShop();
    bindButtons();
    initDemo();
    refreshTitleUI();
    setScreen('title');

    Kit.webgl.boot(function () {
      view = A.createView(canvas);
      view.calm = Kit.motion.reduced();
      layout();
      view.prepare(function () {
        if (failed) return;
        try {
          view.sync(demo, { dt: 0, t: 0, mode: 'title', castleSkin: save.castleSkin, bannerSkin: save.bannerSkin });
          view.render();
          view.whenDrawn(goLive, 5000);
        } catch (e) { fail(e); }
      });
    }, { guard: function () { return !failed; }, onError: fail });
  } catch (err) {
    fail(err);
  }
})();
