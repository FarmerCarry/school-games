/* Recess Kitchen 3D (مطبخ الفسحة) — UI, controls, picture tickets, Kit DDA/stats/juice wiring.
 * Pure simulation lives in engine.js; 3D kitchen renderer lives in art.js. */
(function () {
  'use strict';

  var E = window.RecessEngine;
  var A = window.RecessArt;
  var J = Kit.juice;
  function $(id) { return document.getElementById(id); }

  var canvas = $('scene');
  var body = document.body;

  /* --------------------------------------------------------------- Picture SVG Tickets */
  function svg(inner) {
    return '<svg viewBox="0 0 64 56" aria-hidden="true">' + inner + '</svg>';
  }

  var DISH_SVG = {
    burger: svg(
      '<ellipse cx="32" cy="46" rx="26" ry="7" fill="#fff" stroke="#352116" stroke-width="3"/>' +
      '<rect x="13" y="34" width="38" height="10" rx="5" fill="#e89c3c" stroke="#352116" stroke-width="3"/>' +
      '<rect x="11" y="25" width="42" height="10" rx="5" fill="#7a381e" stroke="#352116" stroke-width="3"/>' +
      '<path d="M12 25 Q22 19 32 25 Q42 19 52 25" fill="none" stroke="#4cd957" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M13 24 C13 7 51 7 51 24 Z" fill="#f5ab42" stroke="#352116" stroke-width="3"/>' +
      '<circle cx="24" cy="15" r="1.8" fill="#fff5cc"/><circle cx="33" cy="13" r="1.8" fill="#fff5cc"/><circle cx="41" cy="16" r="1.8" fill="#fff5cc"/>'
    ),
    cheeseburger: svg(
      '<ellipse cx="32" cy="46" rx="26" ry="7" fill="#fff" stroke="#352116" stroke-width="3"/>' +
      '<rect x="13" y="35" width="38" height="9" rx="4.5" fill="#e89c3c" stroke="#352116" stroke-width="3"/>' +
      '<rect x="11" y="26" width="42" height="10" rx="5" fill="#7a381e" stroke="#352116" stroke-width="3"/>' +
      '<path d="M11 25 H53 L47 33 L36 27 L25 34 L16 28 Z" fill="#ffd428" stroke="#352116" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M13 24 C13 7 51 7 51 24 Z" fill="#f5ab42" stroke="#352116" stroke-width="3"/>' +
      '<circle cx="25" cy="15" r="1.8" fill="#fff5cc"/><circle cx="34" cy="13" r="1.8" fill="#fff5cc"/><circle cx="42" cy="16" r="1.8" fill="#fff5cc"/>'
    ),
    salad: svg(
      '<ellipse cx="32" cy="45" rx="25" ry="7" fill="#fff" stroke="#352116" stroke-width="3"/>' +
      '<path d="M12 32 C12 48 52 48 52 32 Z" fill="#4ecdc4" stroke="#352116" stroke-width="3"/>' +
      '<circle cx="22" cy="28" r="10" fill="#4cd957" stroke="#352116" stroke-width="2.8"/>' +
      '<circle cx="42" cy="28" r="10" fill="#4cd957" stroke="#352116" stroke-width="2.8"/>' +
      '<circle cx="32" cy="24" r="11" fill="#6ae868" stroke="#352116" stroke-width="2.8"/>' +
      '<circle cx="24" cy="23" r="4.5" fill="#ff3b47" stroke="#352116" stroke-width="2"/>' +
      '<circle cx="39" cy="22" r="4.5" fill="#ff3b47" stroke="#352116" stroke-width="2"/>' +
      '<circle cx="32" cy="29" r="4" fill="#ff3b47" stroke="#352116" stroke-width="2"/>'
    ),
    fries: svg(
      '<g fill="#ffd447" stroke="#352116" stroke-width="2.6">' +
      '<rect x="19" y="8" width="6" height="22" rx="2" transform="rotate(-8 22 19)"/>' +
      '<rect x="27" y="5" width="6" height="24" rx="2"/>' +
      '<rect x="34" y="6" width="6" height="23" rx="2" transform="rotate(6 37 18)"/>' +
      '<rect x="40" y="10" width="6" height="20" rx="2" transform="rotate(14 43 20)"/></g>' +
      '<path d="M16 24 H48 L43 50 H21 Z" fill="#ff4052" stroke="#352116" stroke-width="3" stroke-linejoin="round"/>' +
      '<circle cx="32" cy="37" r="6" fill="#ffe066"/>'
    ),
    pizza: svg(
      '<path d="M12 14 Q32 6 52 14 L32 50 Z" fill="#ffd447" stroke="#352116" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M11 15 Q32 5 53 15 L50 22 Q32 13 14 22 Z" fill="#e89432" stroke="#352116" stroke-width="3" stroke-linejoin="round"/>' +
      '<circle cx="26" cy="26" r="4.5" fill="#e63946" stroke="#352116" stroke-width="2"/>' +
      '<circle cx="38" cy="28" r="4.5" fill="#e63946" stroke="#352116" stroke-width="2"/>' +
      '<circle cx="32" cy="38" r="4" fill="#e63946" stroke="#352116" stroke-width="2"/>'
    ),
    juice: svg(
      '<path d="M35 4 L42 22" stroke="#ff4d79" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M20 18 H44 L40 50 H24 Z" fill="#ff842b" stroke="#352116" stroke-width="3" stroke-linejoin="round"/>' +
      '<ellipse cx="32" cy="18" rx="12" ry="4" fill="#ffe066" stroke="#352116" stroke-width="2.6"/>' +
      '<circle cx="28" cy="33" r="3.5" fill="#fff5cc" opacity="0.65"/>'
    )
  };

  var RECIPE_HEADER_BG = {
    burger: '#ff6b35',
    cheeseburger: '#e08e00',
    salad: '#2eb85c',
    fries: '#e63946',
    pizza: '#f77f00',
    juice: '#e84393'
  };

  var RECIPE_STEPS_HTML = {
    burger: '<span class="step-chip">🥩🔥</span><span class="step-chip">🍞</span>',
    cheeseburger: '<span class="step-chip">🥩🔥</span><span class="step-chip">🍞</span><span class="step-chip">🧀</span>',
    salad: '<span class="step-chip">🥬🔪</span><span class="step-chip">🍅🔪</span>',
    fries: '<span class="step-chip">🥔🔪</span><span class="step-chip">🔥</span>',
    pizza: '<span class="step-chip">🍕🔥</span>',
    juice: '<span class="step-chip">🍓⚡</span>'
  };

  var HAT_ICONS = ['👨‍🍳', '🎀', '🧢', '🍓', '⭐', '👑'];

  /* --------------------------------------------------------------- Save & DDA */
  var store = Kit.store('recess-kitchen');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = E.loadSave(store.get('save3', null));
  function persist() {
    if (store.set('save3', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }

  var dda = Kit.dda('recess-kitchen', { id: 'main', target: 0.72, tiers: 5 });

  /* --------------------------------------------------------------- App State */
  var mode = 'title';
  var duo = false;
  var world = null;
  var demo = null;
  var view = null;
  var loop = null;
  var live = false;
  var failed = false;
  var contextLost = false;
  var dirty = true;
  var snap = true;

  var time = 0;
  var viewTime = 0;
  var roundOpen = false;
  var resultData = null;
  var resultT = 0;
  var resultLock = 0;
  var starShown = 0;
  var toastT = 0;
  var idleT = 0;
  var tutorialActive = false;

  var prevAct1 = false, prevDash1 = false;
  var prevAct2 = false, prevDash2 = false;

  var hudCache = { stage: '', score: -1, time: -1, combo: -1, stars: -1, orderSig: '' };
  var ticketEls = {};

  function say(txt) { $('live').textContent = txt; }
  function focusCanvas() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }

  /* --------------------------------------------------------------- Screens */
  var SCREENS = { title: 'scrTitle', levels: 'scrLevels', wardrobe: 'scrWardrobe', pause: 'scrPause', result: 'scrResult' };
  function setMode(next) {
    mode = next;
    body.dataset.mode = next;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== next;
    $('hud').hidden = !(next === 'play' || next === 'pause');
    if (next !== 'play') $('ghostHint').hidden = true;
    dirty = true;
    if (next === 'play') focusCanvas();
  }

  function refreshTitleUI() {
    $('titleStars').querySelector('b').textContent = E.totalStars(save) + '/' + (E.LEVELS.length * 3);
    $('titleCoins').querySelector('b').textContent = Kit.fmt(save.coins);
    $('titleBest').querySelector('b').textContent = Kit.fmt(Math.max(save.bestScore, save.bestEndless));
    var btnDuo = $('btnDuo');
    btnDuo.setAttribute('aria-pressed', String(duo));
    btnDuo.textContent = duo ? '👥 لاعبان (تعاون)' : '👤 لاعب واحد';
    $('controlsBar').innerHTML = duo
      ? 'طاهي 1: <span dir="ltr"><span class="sg-key">W</span><span class="sg-key">A</span><span class="sg-key">S</span><span class="sg-key">D</span> <span class="sg-key">مسافة</span> <span class="sg-key">Q</span></span> <span class="sep">·</span> طاهي 2: <span dir="ltr"><span class="sg-key">←</span><span class="sg-key">→</span><span class="sg-key">↑</span><span class="sg-key">↓</span> <span class="sg-key">Enter</span> <span class="sg-key">/</span></span>'
      : '<span dir="ltr"><span class="sg-key">←</span><span class="sg-key">→</span><span class="sg-key">↑</span><span class="sg-key">↓</span> / <span class="sg-key">WASD</span></span> حركة <span class="sep">·</span> <span dir="ltr"><span class="sg-key">مسافة</span> / <span class="sg-key">E</span></span> تفاعل <span class="sep">·</span> <span dir="ltr"><span class="sg-key">Shift</span></span> اندفاع';
  }

  function initDemo() {
    demo = E.create({ demo: true, level: 0, seed: 4242, apron: save.apron, hat: save.hat });
  }

  function closeOpenRound() {
    if (roundOpen) {
      Kit.stats.end('quit');
      roundOpen = false;
    }
  }

  function toTitle() {
    closeOpenRound();
    world = null;
    if (!demo) initDemo();
    demo.chefs[0].apron = save.apron;
    demo.chefs[0].hat = save.hat;
    snap = true;
    refreshTitleUI();
    setMode('title');
  }

  /* --------------------------------------------------------------- Levels & Wardrobe UI */
  function openLevels() {
    J.select();
    $('levelsStars').querySelector('b').textContent = E.totalStars(save) + '/' + (E.LEVELS.length * 3);
    var host = $('levelsGrid');
    host.innerHTML = '';
    for (var c = 0; c < E.CANTEENS.length; c++) {
      var wrap = document.createElement('div');
      wrap.className = 'canteen-row';
      var title = document.createElement('div');
      title.className = 'canteen-title';
      title.textContent = (c + 1) + '. ' + E.CANTEENS[c].name;
      wrap.appendChild(title);
      var row = document.createElement('div');
      row.className = 'canteen-levels';
      for (var i = 0; i < E.LEVELS.length; i++) {
        var lv = E.LEVELS[i];
        if (lv.canteen !== c) continue;
        var unlocked = E.isLevelUnlocked(save, lv.index);
        var prog = save.levels[lv.index];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lvl-btn';
        btn.disabled = !unlocked;
        btn.dataset.level = String(lv.index);
        var starsHtml = '';
        for (var st = 0; st < 3; st++) starsHtml += st < prog.stars ? '<b>★</b>' : '★';
        btn.innerHTML = '<span class="lvl-id">' + (unlocked ? lv.id : '🔒 ' + lv.id) + '</span>' +
          '<span class="lvl-name">' + lv.name + '</span>' +
          '<span class="lvl-stars">' + starsHtml + '</span>';
        (function (idx) {
          btn.addEventListener('click', function () { startLevel(idx, false); });
        })(lv.index);
        row.appendChild(btn);
      }
      wrap.appendChild(row);
      host.appendChild(wrap);
    }
    setMode('levels');
  }

  function renderWardrobe() {
    $('shopCoins').querySelector('b').textContent = Kit.fmt(save.coins);
    var aHost = $('apronGrid');
    aHost.innerHTML = '';
    for (var i = 0; i < E.APRONS.length; i++) {
      var ap = E.APRONS[i];
      var owned = save.aprons.indexOf(i) !== -1;
      var eq = save.apron === i;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'skin-card' + (eq ? ' equipped' : owned ? '' : ' locked');
      var hex = '#' + ap.color.toString(16).padStart(6, '0');
      btn.innerHTML = '<span class="skin-swatch" style="background:' + hex + '"></span>' +
        '<span class="skin-meta"><span class="skin-name">' + ap.name + '</span>' +
        '<span class="skin-cost">' + (eq ? '✓ مُرتدى' : owned ? 'اختيار' : '🪙 ' + ap.cost) + '</span></span>';
      (function (idx) {
        btn.addEventListener('click', function () { selectSkin('apron', idx); });
      })(i);
      aHost.appendChild(btn);
    }

    var hHost = $('hatGrid');
    hHost.innerHTML = '';
    for (var j = 0; j < E.HATS.length; j++) {
      var ht = E.HATS[j];
      var hOwned = save.hats.indexOf(j) !== -1;
      var hEq = save.hat === j;
      var hBtn = document.createElement('button');
      hBtn.type = 'button';
      hBtn.className = 'skin-card' + (hEq ? ' equipped' : hOwned ? '' : ' locked');
      hBtn.innerHTML = '<span class="skin-swatch" style="background:#fff3da">' + (HAT_ICONS[j] || '👒') + '</span>' +
        '<span class="skin-meta"><span class="skin-name">' + ht.name + '</span>' +
        '<span class="skin-cost">' + (hEq ? '✓ مُرتدى' : hOwned ? 'اختيار' : '🪙 ' + ht.cost) + '</span></span>';
      (function (idx) {
        hBtn.addEventListener('click', function () { selectSkin('hat', idx); });
      })(j);
      hHost.appendChild(hBtn);
    }
  }

  function selectSkin(kind, idx) {
    var list = kind === 'apron' ? E.APRONS : E.HATS;
    var ownedList = kind === 'apron' ? save.aprons : save.hats;
    var item = list[idx];
    if (!item) return;
    if (ownedList.indexOf(idx) === -1) {
      if (save.coins < item.cost) {
        J.error();
        return;
      }
      save.coins -= item.cost;
      ownedList.push(idx);
      J.coin(3);
      if (view && demo) view.burst(demo.chefs[0].x, demo.chefs[0].y, { count: 20, colors: [0xffd447, 0x38d975, 0xff5a5f], speed: 4.5, up: 4.5 });
    } else {
      J.select();
    }
    if (kind === 'apron') save.apron = idx;
    else save.hat = idx;
    if (demo && demo.chefs[0]) {
      demo.chefs[0].apron = save.apron;
      demo.chefs[0].hat = save.hat;
    }
    persist();
    renderWardrobe();
    refreshTitleUI();
  }

  /* --------------------------------------------------------------- Start / Pause / End */
  function startLevel(levelIndex, endless) {
    closeOpenRound();
    J.select();
    Kit.keys.reset();
    prevAct1 = prevDash1 = prevAct2 = prevDash2 = false;

    var opts = {
      level: levelIndex,
      endless: !!endless,
      duo: duo,
      apron: save.apron,
      hat: save.hat,
      apron2: save.apron === 4 ? 1 : 4,
      hat2: save.hat === 1 ? 2 : 1
    };

    if (!duo) {
      opts.patienceMult = dda.value(1.28, 0.86);
      opts.spawnMult = dda.value(1.22, 0.84);
      opts.burnMult = dda.value(1.40, 0.85);
    } else {
      opts.patienceMult = 1.08;
      opts.spawnMult = 0.88;
      opts.burnMult = 1.15;
    }

    world = E.create(opts);
    resultData = null;
    toastT = 0;
    idleT = 0;
    $('toast').hidden = true;
    hudCache = { stage: '', score: -1, time: -1, combo: -1, stars: -1, orderSig: '' };
    ticketEls = {};
    $('ordersBar').innerHTML = '';

    var rid = (duo ? 'duo-' : 'L') + (endless ? 'endless' : (levelIndex + 1));
    Kit.stats.round(rid);
    roundOpen = true;

    tutorialActive = !endless && levelIndex === 0 && !save.tutorialDone;
    if (tutorialActive) Kit.stats.tutorial('start');

    snap = true;
    setMode('play');
    syncHUD();
    say('بدأت المرحلة ' + world.id);
  }

  function pauseGame(userClicked) {
    if (mode !== 'play') return;
    if (userClicked) J.back();
    $('pauseSub').innerHTML = world ? ('المرحلة <span dir="ltr">' + world.id + '</span> — ' + world.levelName) : '';
    setMode('pause');
    dirty = true;
  }

  function resumeGame() {
    if (mode !== 'pause') return;
    J.select();
    Kit.keys.reset();
    prevAct1 = prevDash1 = prevAct2 = prevDash2 = false;
    setMode('play');
  }

  function showToast(text, cls, dur) {
    var el = $('toast');
    el.textContent = text;
    el.className = 'toast' + (cls ? ' ' + cls : '');
    el.hidden = false;
    toastT = dur || 1.5;
  }

  function handleRoundEnd(res) {
    resultData = res;
    resultT = 0;
    resultLock = 0.35;
    starShown = 0;

    var isNewBest = false;
    save.coins += res.coins;
    if (res.endless) {
      if (res.score > save.bestEndless) { save.bestEndless = res.score; isNewBest = res.score > 0; }
    } else if (res.levelIndex >= 0 && res.levelIndex < save.levels.length) {
      var lvSave = save.levels[res.levelIndex];
      if (res.stars > lvSave.stars) lvSave.stars = res.stars;
      if (res.score > lvSave.best) lvSave.best = res.score;
      if (res.score > save.bestScore) { save.bestScore = res.score; isNewBest = res.score > 0; }
    }
    persist();

    if (roundOpen) {
      if (res.duo) {
        Kit.stats.end('end');
      } else if (res.endless) {
        Kit.stats.end('end', res.score);
      } else {
        Kit.stats.end(res.won ? 'win' : 'lose', res.score);
      }
      roundOpen = false;
    }

    if (!res.duo) {
      dda.result(res.ddaOutcome);
    }

    $('resNewBest').hidden = !isNewBest;
    if (res.endless) {
      $('resTitle').textContent = res.served >= 6 ? 'شيف لا يُقهر! 🏆' : 'انتهى الوقت! ⏱';
    } else if (res.stars === 3) {
      $('resTitle').textContent = 'شيف أسطوري! 🌟';
    } else if (res.won) {
      $('resTitle').textContent = 'ممتاز يا شيف! 🎉';
    } else {
      $('resTitle').textContent = 'حاول مرة أخرى! 💪';
    }

    $('resScore').textContent = Kit.fmt(res.score);
    $('resServed').textContent = String(res.served);
    $('resCoins').textContent = '+' + Kit.fmt(res.coins);

    var starEls = $('resStars').querySelectorAll('.star');
    for (var i = 0; i < starEls.length; i++) starEls[i].classList.remove('on');
    $('resStars').hidden = res.endless;

    var hasNext = !res.endless && res.levelIndex + 1 < E.LEVELS.length && E.isLevelUnlocked(save, res.levelIndex + 1);
    $('btnNext').hidden = !hasNext;

    setMode('result');
    if (res.won) {
      J.levelUp();
      if (view) view.burst(5.5, 3.5, { count: 36, colors: [0xffd447, 0x38d975, 0xff5a5f, 0x3ec6ff], y: 1.8, speed: 6.5, up: 6.5, life: 1.1, size: 0.24 });
    } else {
      J.fail();
    }
    say($('resTitle').textContent);
  }

  /* --------------------------------------------------------------- HUD Sync */
  function syncHUD() {
    if (!world) return;
    var stageTxt = world.endless ? '∞' : world.id;
    if (hudCache.stage !== stageTxt) {
      hudCache.stage = stageTxt;
      $('hudStage').textContent = stageTxt;
    }
    if (hudCache.score !== world.score) {
      hudCache.score = world.score;
      $('hudScore').textContent = Kit.fmt(world.score);
    }
    var curStars = world.endless ? 0 : E.calcStars(world.level, world.score, world.served);
    if (hudCache.stars !== curStars) {
      hudCache.stars = curStars;
      var dots = $('hudStars');
      dots.hidden = world.endless;
      var kids = dots.children;
      for (var s = 0; s < kids.length; s++) kids[s].classList.toggle('on', s < curStars);
    }
    var sec = Math.ceil(world.timeLeft);
    if (hudCache.time !== sec) {
      hudCache.time = sec;
      $('hudTime').textContent = String(sec);
      $('hudTimeWrap').classList.toggle('low', sec <= 15 && sec > 0);
    }
    if (hudCache.combo !== world.combo) {
      hudCache.combo = world.combo;
      $('hudCombo').hidden = world.combo < 2;
      $('hudComboVal').textContent = '×' + world.combo;
    }

    // Picture Order Tickets (DOM diffed by order IDs to avoid layout thrash)
    var sig = '';
    for (var i = 0; i < world.orders.length; i++) sig += world.orders[i].id + ',';
    var bar = $('ordersBar');
    if (sig !== hudCache.orderSig) {
      hudCache.orderSig = sig;
      var alive = {};
      for (i = 0; i < world.orders.length; i++) alive[world.orders[i].id] = 1;
      for (var idKey in ticketEls) {
        if (!alive[idKey]) {
          if (ticketEls[idKey].el.parentNode) bar.removeChild(ticketEls[idKey].el);
          delete ticketEls[idKey];
        }
      }
      for (i = 0; i < world.orders.length; i++) {
        var ord = world.orders[i];
        if (!ticketEls[ord.id]) {
          var rec = E.RECIPES[ord.recipe];
          var card = document.createElement('div');
          card.className = 'ticket';
          card.innerHTML =
            '<div class="ticket-head" style="background:' + (RECIPE_HEADER_BG[ord.recipe] || '#ff6b35') + '">' + rec.name + '</div>' +
            '<div class="ticket-dish">' + (DISH_SVG[ord.recipe] || '') + '</div>' +
            '<div class="ticket-steps">' + (RECIPE_STEPS_HTML[ord.recipe] || '') + '</div>' +
            '<div class="ticket-bar"><div class="ticket-fill"></div></div>';
          bar.appendChild(card);
          ticketEls[ord.id] = { el: card, fill: card.querySelector('.ticket-fill') };
        }
      }
    }
    // Update ticket patience bars smoothly
    for (var j = 0; j < world.orders.length; j++) {
      var o = world.orders[j];
      var tObj = ticketEls[o.id];
      if (!tObj) continue;
      var pct = Math.max(0, Math.min(100, (o.patience / Math.max(1, o.maxPatience)) * 100));
      tObj.fill.style.width = pct.toFixed(1) + '%';
      tObj.fill.className = 'ticket-fill' + (pct < 28 ? ' low' : pct < 55 ? ' mid' : '');
      tObj.el.classList.toggle('urgent', pct < 28);
    }
  }

  /* --------------------------------------------------------------- Inputs & Events */
  function readInputs() {
    var K = Kit.keys;
    if (!duo) {
      var mx = (K.anyDown(['ArrowRight', 'KeyD']) ? 1 : 0) - (K.anyDown(['ArrowLeft', 'KeyA']) ? 1 : 0);
      var my = (K.anyDown(['ArrowDown', 'KeyS']) ? 1 : 0) - (K.anyDown(['ArrowUp', 'KeyW']) ? 1 : 0);
      var aDown = K.anyDown(['Space', 'KeyE']);
      var aPress = K.anyPressed(['Space', 'KeyE']) || (aDown && !prevAct1);
      var dDown = K.anyDown(['ShiftLeft', 'ShiftRight', 'KeyQ']);
      var dPress = K.anyPressed(['ShiftLeft', 'ShiftRight', 'KeyQ']) || (dDown && !prevDash1);
      prevAct1 = aDown; prevDash1 = dDown;
      return [{ mx: mx, my: my, interact: aPress, dash: dPress }];
    }
    // 2P Co-op: P1 WASD + Space/E (+ Q/ShiftLeft dash), P2 Arrows + Enter/. (+ / / ShiftRight dash)
    var p1x = (K.down('KeyD') ? 1 : 0) - (K.down('KeyA') ? 1 : 0);
    var p1y = (K.down('KeyS') ? 1 : 0) - (K.down('KeyW') ? 1 : 0);
    var a1D = K.anyDown(['Space', 'KeyE']);
    var a1P = K.anyPressed(['Space', 'KeyE']) || (a1D && !prevAct1);
    var d1D = K.anyDown(['KeyQ', 'ShiftLeft']);
    var d1P = K.anyPressed(['KeyQ', 'ShiftLeft']) || (d1D && !prevDash1);
    prevAct1 = a1D; prevDash1 = d1D;

    var p2x = (K.down('ArrowRight') ? 1 : 0) - (K.down('ArrowLeft') ? 1 : 0);
    var p2y = (K.down('ArrowDown') ? 1 : 0) - (K.down('ArrowUp') ? 1 : 0);
    var a2D = K.anyDown(['Enter', 'Period', 'NumpadEnter']);
    var a2P = K.anyPressed(['Enter', 'Period', 'NumpadEnter']) || (a2D && !prevAct2);
    var d2D = K.anyDown(['Slash', 'ShiftRight']);
    var d2P = K.anyPressed(['Slash', 'ShiftRight']) || (d2D && !prevDash2);
    prevAct2 = a2D; prevDash2 = d2D;

    return [
      { mx: p1x, my: p1y, interact: a1P, dash: d1P },
      { mx: p2x, my: p2y, interact: a2P, dash: d2P }
    ];
  }

  function handleEvents(events) {
    if (!events || !events.length) return;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'pickup') {
        J.pop(0.45);
        if (view) view.burst(ev.x, ev.y, { count: 6, colors: [0xffffff, 0xffe066], speed: 2.2, up: 2.4, life: 0.3, size: 0.12 });
      } else if (ev.type === 'drop') {
        J.tap();
      } else if (ev.type === 'combine') {
        J.chime(ev.dish ? 2 : 1);
        if (view) view.burst(ev.x, ev.y, { count: 12, colors: [0xffd447, 0x38d975, 0xffffff], speed: 3.4, up: 3.4, life: 0.45, size: 0.15 });
      } else if (ev.type === 'chopStart' || ev.type === 'chopBoost') {
        J.impact(0.35);
      } else if (ev.type === 'chopDone') {
        J.chime(1);
        if (view) view.burst(ev.x, ev.y, { count: 10, colors: [0x52d165, 0xffe066, 0xffffff], speed: 3.0, up: 3.0, life: 0.42, size: 0.14 });
      } else if (ev.type === 'cookStart') {
        J.whoosh(0.5);
      } else if (ev.type === 'cookDone' || ev.type === 'juiceDone') {
        J.chime(2);
        if (view) view.burst(ev.x, ev.y, { count: 14, colors: [0xffcf2e, 0xffffff, 0xff842b], speed: 3.6, up: 3.8, life: 0.5, size: 0.16 });
      } else if (ev.type === 'burnWarn') {
        J.error();
      } else if (ev.type === 'burnt') {
        J.impact(0.75);
        Kit.track.miss();
        showToast('احترق الطعام! ارمِه في السلة 🗑️', 'warn', 1.7);
        if (view) {
          view.shake(0.5);
          view.burst(ev.x, ev.y, { count: 16, colors: [0x3d3a42, 0xff5a5f, 0x6c6573], speed: 3.2, up: 4.0, life: 0.65, size: 0.2 });
        }
      } else if (ev.type === 'trash') {
        J.whoosh(0.7);
        if (view) view.burst(ev.x, ev.y, { count: 8, colors: [0xd9e2ec, 0x9aa5b1], speed: 2.5, up: 2.8, life: 0.35, size: 0.14 });
      } else if (ev.type === 'dash') {
        J.whoosh(0.85);
        if (view) view.burst(ev.x, ev.y, { count: 7, colors: [0xffffff, 0xfff3d4], y: 0.2, speed: 2.4, up: 1.4, life: 0.32, size: 0.15, g: 3 });
      } else if (ev.type === 'serve') {
        J.chime(3);
        J.streak(Math.min(ev.combo, 8));
        J.coin(Math.min(ev.combo, 5));
        Kit.track.hit();
        if (tutorialActive) {
          tutorialActive = false;
          save.tutorialDone = true;
          persist();
          Kit.stats.tutorial('done');
        }
        var msg = '+' + ev.points + ' ⭐' + (ev.combo >= 2 ? '  🔥 ×' + ev.combo : '');
        showToast(msg, 'good', 1.4);
        if (view) {
          view.shake(0.32);
          view.burst(ev.x, ev.y, { count: 26, colors: [0xffd447, 0x38d975, 0xff5a5f, 0x3ec6ff, 0xffffff], y: 1.3, speed: 5.5, up: 5.5, life: 0.85, size: 0.2 });
        }
      } else if (ev.type === 'wrongDish') {
        J.error();
        showToast('هذا الطبق غير مطلوب الآن!', 'warn', 1.3);
      } else if (ev.type === 'notReady') {
        J.error();
        showToast('أكمِل تجهيز الطبق أولًا!', 'warn', 1.3);
      } else if (ev.type === 'bonk') {
        J.tap();
      } else if (ev.type === 'expired') {
        J.fail();
        Kit.track.miss();
        showToast('فات موعد أحد الطلبات! ⏱', 'warn', 1.5);
      } else if (ev.type === 'roundEnd') {
        handleRoundEnd(ev.result);
      }
    }
  }

  /* --------------------------------------------------------------- Update & Render */
  var currentHintStation = null;

  function update(dt) {
    time += dt;
    if (mode === 'play' && world) {
      var inputs = readInputs();
      var anyInput = false;
      for (var i = 0; i < inputs.length; i++) {
        if (inputs[i].mx || inputs[i].my || inputs[i].interact || inputs[i].dash) anyInput = true;
      }
      idleT = anyInput ? 0 : idleT + dt;

      var events = E.step(world, dt, inputs);
      handleEvents(events);
      syncHUD();

      // Ghost hint: in every round until its first dish is served (the step-by-step arrow is
      // what a new child needs, and the PC's tutorial flag says nothing about this child), and
      // whenever the player stands idle for 3 s
      var showGhost = !world.over && (tutorialActive || world.served === 0 || idleT >= 3);
      if (showGhost) {
        var hint = E.nextHint(world);
        if (hint && hint.station) {
          currentHintStation = hint.station;
          $('ghostText').textContent = hint.text;
          $('ghostHint').hidden = false;
        } else {
          currentHintStation = null;
          $('ghostHint').hidden = true;
        }
      } else {
        currentHintStation = null;
        $('ghostHint').hidden = true;
      }
    } else if (mode === 'title' || mode === 'levels' || mode === 'wardrobe') {
      currentHintStation = null;
      if (demo) E.step(demo, dt); // Zero audio in demo!
    } else if (mode === 'result' && resultData) {
      currentHintStation = null;
      resultT += dt;
      if (resultLock > 0) resultLock -= dt;
      if (!resultData.endless && starShown < resultData.stars && resultT >= 0.26 + starShown * 0.28) {
        starShown++;
        var sEl = $('resStars').querySelector('[data-i="' + starShown + '"]');
        if (sEl) sEl.classList.add('on');
        J.star(starShown);
      }
    }

    if (toastT > 0 && mode !== 'pause') {
      toastT -= dt;
      if (toastT <= 0) $('toast').hidden = true;
    }
    if (mode !== 'pause') dirty = true;
    Kit.keys.endFrame();
  }

  function render() {
    if (!view || contextLost || (!dirty && mode === 'pause')) return;
    var now = performance.now();
    if (!view.mayDraw(now, mode === 'play')) return;

    if (mode !== 'pause' || snap) {
      var dt = Math.max(0, Math.min(0.1, time - viewTime));
      viewTime = time;
      var activeWorld = (mode === 'play' || mode === 'pause' || mode === 'result') && world ? world : demo;
      view.sync(activeWorld, { dt: dt, t: time, mode: mode, snap: snap, hintStation: currentHintStation });
      snap = false;
    }
    view.render();
    dirty = false;
  }

  function layout() {
    if (view) view.resize(window.innerWidth, window.innerHeight);
    dirty = true;
  }

  /* --------------------------------------------------------------- Keyboard & Buttons */
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (mode === 'play') { e.preventDefault(); pauseGame(true); }
      else if (mode === 'pause') { e.preventDefault(); resumeGame(); }
      else if (mode === 'levels' || mode === 'wardrobe') { e.preventDefault(); J.back(); toTitle(); }
      return;
    }
    if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      startLevel(E.nextPlayableLevel(save), false);
      return;
    }
    if (mode === 'result' && resultLock <= 0 && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR')) {
      e.preventDefault();
      if (world) startLevel(Math.max(0, world.levelIndex), world.endless);
      return;
    }
    if (mode === 'play' && e.code === 'KeyR') {
      e.preventDefault();
      if (world) startLevel(Math.max(0, world.levelIndex), world.endless);
    }
  });

  function bindButtons() {
    $('btnPlay').addEventListener('click', function () { startLevel(E.nextPlayableLevel(save), false); });
    $('btnDuo').addEventListener('click', function () {
      duo = !duo;
      J.toggle(duo);
      refreshTitleUI();
    });
    $('btnLevels').addEventListener('click', openLevels);
    $('btnEndless').addEventListener('click', function () { startLevel(0, true); });
    $('btnLevelsEndless').addEventListener('click', function () { startLevel(0, true); });
    $('btnLevelsBack').addEventListener('click', function () { J.back(); toTitle(); });
    $('btnWardrobe').addEventListener('click', function () { J.select(); renderWardrobe(); setMode('wardrobe'); });
    $('btnShopBack').addEventListener('click', function () { J.back(); toTitle(); });
    $('btnPause').addEventListener('click', function () { pauseGame(true); });
    $('btnResume').addEventListener('click', resumeGame);
    $('btnRestart').addEventListener('click', function () {
      if (world) startLevel(Math.max(0, world.levelIndex), world.endless);
    });
    $('btnHome').addEventListener('click', function () { J.back(); toTitle(); });
    $('btnNext').addEventListener('click', function () {
      if (world && !world.endless && world.levelIndex + 1 < E.LEVELS.length) {
        startLevel(world.levelIndex + 1, false);
      }
    });
    $('btnAgain').addEventListener('click', function () {
      if (world) startLevel(Math.max(0, world.levelIndex), world.endless);
    });
    $('btnResHome').addEventListener('click', function () { J.back(); toTitle(); });
  }

  /* --------------------------------------------------------------- Boot */
  function fail(err) {
    if (failed) return;
    failed = true; live = false;
    if (loop) loop.stop();
    for (var k in SCREENS) $(SCREENS[k]).hidden = true;
    $('hud').hidden = true;
    $('scrError').hidden = false;
    body.dataset.mode = 'error';
    Kit.fail(err);
  }

  function goLive() {
    if (failed) return;
    window.__game = {
      get mode() { return mode; },
      get duo() { return duo; },
      get world() { return world; },
      get demo() { return demo; },
      get stations() { return world ? world.stations : []; },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get result() { return resultData; },
      get state() { return E.publicState(world, mode); },
      startLevel: function (idx, endless) { startLevel(idx, endless); },
      setDuo: function (on) { duo = !!on; refreshTitleUI(); }
    };
    loop = Kit.loop(update, render);
    live = true;
    Kit.ready();
  }

  Kit.muteButton();
  Kit.lifecycle({
    pause: function () { pauseGame(false); },
    reset: function () { prevAct1 = prevDash1 = prevAct2 = prevDash2 = false; }
  });
  Kit.motion.onChange(function (r) { if (view) view.calm = r; dirty = true; });
  window.addEventListener('resize', layout);
  window.addEventListener('pageshow', function () { dirty = true; });
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    contextLost = true;
    pauseGame(false);
    $('ctxNotice').hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', function () {
    contextLost = false;
    $('ctxNotice').hidden = true;
    snap = true;
    dirty = true;
    layout();
  });

  try {
    bindButtons();
    initDemo();
    refreshTitleUI();
    setMode('title');

    var started3D = false;
    var boot3D = function () {
      if (started3D || failed) return;
      started3D = true;
      try {
        view = A.createView(canvas);
        view.calm = Kit.motion.reduced();
        layout();
        view.prepare(function () {
          if (failed) return;
          try {
            view.sync(demo, { dt: 0, t: 0, mode: 'title', snap: true });
            view.render();
            view.whenDrawn(goLive, 5000);
          } catch (e) { fail(e); }
        });
      } catch (e) { fail(e); }
    };
    requestAnimationFrame(function () { setTimeout(boot3D, 0); });
    setTimeout(boot3D, 80);
  } catch (err) {
    fail(err);
  }
})();
