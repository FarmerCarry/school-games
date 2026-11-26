/* Dino 3D (الديناصور ثلاثي الأبعاد) — UI, controls, Kit.dda, Kit.juice, Kit.stats/track,
 * 3-step software-WebGL startup & compatibility hooks (window.Dino3DGame + window.__game). */
(function () {
  'use strict';
  var D = window.Dino3D;
  var J = Kit.juice;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('scene'), ui = $('ui'), body = document.body;

  var JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'];
  var DUCK_KEYS = ['ArrowDown', 'KeyS'];
  var ROAR_KEYS = ['ArrowRight', 'KeyD', 'ShiftLeft', 'ShiftRight'];
  var PRAISE = ['رائع!', 'ممتاز!', 'بطل!', 'مذهل!'];

  /* --------------------------------------------------------------- Saving */
  var store = Kit.store('dino-3d');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = D.loadSave(store.get('save', null));

  function persist() {
    if (store.set('save', save) === false) {
      saveStatus.failed();
      return false;
    }
    saveStatus.saved();
    return true;
  }

  // Adaptive difficulty per mode (UI layer only; engine.js stays pure).
  var ddaMain = Kit.dda('dino-3d', { id: 'main', target: 0.75, tiers: 5 });
  var ddaRun = Kit.dda('dino-3d', { id: 'endless', target: 0.68, tiers: 5 });

  /* ---------------------------------------------------------------- State */
  var mode = 'title';
  var world = null;
  var cur = { level: 0, endless: false, code: '' };
  var view = null;
  var time = 0, viewTime = 0, lastFrame = 0;
  var live = false, queued = null, failed = false, loop = null;
  var dirty = true, snap = true, contextLost = false;
  var inputJumps = 0, pointerDown = false, pointerJumpEdge = false;
  var ending = null, result = null, resultLock = 0, wardSpin = 0;
  var coach = { active: false, action: '', timer: 0, shown: {}, doneJump: false, tutorialStarted: false };
  var bannerTimer = 0;
  var hudCache = { hp: -1, eggs: -1, roarPct: -1, roarReady: false, m: -1, combo: 0 };
  var uiScale = 1, uiLeft = 0, uiTop = 0;
  var SCREENS = { title: 'title', map: 'map', endless: 'endless', wardrobe: 'wardrobe', paused: 'pause-screen', result: 'result' };

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

  function hasNewWardrobe() {
    return D.unlockedBetween(save.seenBank, save.bank).length > 0;
  }

  /* ---------------------------------------------------------- SVG Art Icons */
  function svgIcon(inner) {
    return '<svg class="art-ico" viewBox="0 0 64 64" aria-hidden="true">' + inner + '</svg>';
  }
  var ST = ' stroke="#222947" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  var WORLD_SVGS = [
    svgIcon('<circle cx="48" cy="16" r="9" fill="#ffe457"' + ST + '/><path d="M2 52 Q22 38 42 48 T62 46 V62 H2 Z" fill="#f7c863"' + ST + '/><path d="M24 52 V22 Q24 16 28 16 Q32 16 32 22 V52 M32 36 H38 V28 M24 32 H18 V24" fill="#36bf5d"' + ST + '/><circle cx="28" cy="14" r="4" fill="#ff629e"/>'),
    svgIcon('<path d="M20 56 Q22 32 14 18" fill="none" stroke="#8f5a30" stroke-width="7" stroke-linecap="round"/><path d="M14 18 Q2 18 4 28 Q12 28 18 22 M14 18 Q24 8 34 18 Q24 24 16 20 M14 18 Q28 24 26 34 Q18 30 14 22" fill="#46d468"' + ST + '/><path d="M40 24 H54 V56 H40 Z" fill="#5ce8ff"' + ST + '/><circle cx="47" cy="54" r="8" fill="#c7fbff"/>'),
    svgIcon('<path d="M4 56 L24 16 L36 36 L44 24 L60 56 Z" fill="#8eb8e5"' + ST + '/><path d="M18 28 L24 16 L30 28 L25 25 L21 28 Z" fill="#fff"/><path d="M46 42 L52 30 L58 42 Z M43 52 L52 38 L61 52 Z" fill="#2d8a68"' + ST + '/>'),
    svgIcon('<path d="M4 58 L22 22 H42 L60 58 Z" fill="#4d3659"' + ST + '/><path d="M22 22 H42 L38 31 H26 Z" fill="#ff6b29"' + ST + '/><circle cx="27" cy="12" r="5" fill="#ffd24d"/><circle cx="37" cy="9" r="4" fill="#ff9e42"/>'),
    svgIcon('<path d="M8 46 A24 24 0 0 1 56 46" fill="none" stroke="#ff6ba9" stroke-width="6"/><path d="M14 46 A18 18 0 0 1 50 46" fill="none" stroke="#ffe44d" stroke-width="6"/><ellipse cx="32" cy="48" rx="22" ry="9" fill="#c4813d"' + ST + '/><path d="M25 45 C25 32 29 27 32 27 C35 27 39 32 39 45 Z" fill="#fff6db"' + ST + '/>')
  ];
  var HAT_SVGS = {
    none: '<svg class="hat-pic" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="20" fill="none" stroke="#b0b8d1" stroke-width="6"/><path d="M18 46 L46 18" stroke="#b0b8d1" stroke-width="6" stroke-linecap="round"/></svg>',
    leaf: '<svg class="hat-pic" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 52 V28" stroke="#2f9e44" stroke-width="6" stroke-linecap="round"/><path d="M32 30 Q10 24 14 12 Q28 12 32 28 Z" fill="#5ce668"' + ST + '/><path d="M32 30 Q54 24 50 12 Q36 12 32 28 Z" fill="#42c954"' + ST + '/></svg>',
    explorer: '<svg class="hat-pic" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="44" rx="26" ry="8" fill="#e8c47a"' + ST + '/><path d="M14 42 Q14 16 32 16 Q50 16 50 42 Z" fill="#f2d28b"' + ST + '/><path d="M15 36 H49" stroke="#d95638" stroke-width="6"/></svg>',
    party: '<svg class="hat-pic" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 10 L50 52 H14 Z" fill="#7c5cff"' + ST + '/><circle cx="28" cy="34" r="4" fill="#ffd23f"/><circle cx="38" cy="42" r="4" fill="#4df5d8"/><circle cx="32" cy="10" r="6" fill="#ff5fa2"' + ST + '/></svg>',
    astronaut: '<svg class="hat-pic" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="36" r="21" fill="#8be2ff"' + ST + '/><path d="M18 28 Q26 20 38 22" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M32 15 V7" stroke="#222947" stroke-width="4"/><circle cx="32" cy="6" r="4.5" fill="#ffe44d"' + ST + '/></svg>',
    crown: '<svg class="hat-pic" viewBox="0 0 64 64" aria-hidden="true"><path d="M10 48 L10 18 L23 32 L32 12 L41 32 L54 18 L54 48 Z" fill="#ffd23f"' + ST + '/><circle cx="32" cy="38" r="5" fill="#ff3b6e"/></svg>'
  };

  /* --------------------------------------------------------------- Screens */
  function setMode(next) {
    mode = next;
    body.dataset.mode = next;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== next;
    var showHud = next === 'playing' || next === 'paused' || next === 'ending';
    $('hud').hidden = !showHud;
    $('pause-button').hidden = next !== 'playing';
    dirty = true;
    if (next === 'playing') focusCanvas();
  }

  function menuScene(worldIdx) {
    world = null;
    if (view) {
      view.resetWorld(worldIdx);
      view.setDinoLook(save.color, save.hat);
    }
    snap = true;
  }

  function refreshTitle() {
    $('title-stars').textContent = String(D.totalStars(save));
    $('title-eggs').textContent = String(save.bank);
    var hasFar = save.far > 0;
    $('title-best-pill').hidden = !hasFar;
    if (hasFar) $('title-best').textContent = String(save.far);
    $('btn-wardrobe').classList.toggle('has-new', hasNewWardrobe());
  }

  function openTitle() {
    if (mode === 'playing' || mode === 'paused') Kit.stats.end('quit', world ? world.score : 0);
    var nextLv = D.LEVELS[D.nextLevel(save)];
    menuScene(nextLv.world);
    refreshTitle();
    setMode('title');
  }

  /* ------------------------------------------------------------ World Map */
  var levelBtns = [], worldCards = [];
  function buildMapUI() {
    var box = $('cards');
    box.innerHTML = '';
    D.WORLDS.forEach(function (W, wIdx) {
      var card = document.createElement('div');
      card.className = 'world-card w' + wIdx;

      var artBtn = document.createElement('button');
      artBtn.type = 'button';
      artBtn.className = 'world-banner-art';
      artBtn.innerHTML = WORLD_SVGS[wIdx] + '<b>' + W.name + '</b><svg class="world-lock" aria-hidden="true"><use href="#i-lock"/></svg>';
      onBtn(artBtn, function () {
        if (!D.isWorldOpen(save, wIdx)) { J.error(); wiggle(card); return; }
        J.select();
        for (var k = wIdx * 3; k < wIdx * 3 + 3; k++) {
          if (D.isLevelOpen(save, k) && !save.stars[k]) { startJourney(k); return; }
        }
        startJourney(wIdx * 3);
      });
      card.appendChild(artBtn);

      var row = document.createElement('div');
      row.className = 'stage-row';
      for (var s = 0; s < 3; s++) (function (idx) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pebble';
        b.dataset.level = String(idx);
        b.innerHTML = '<b>' + (idx % 3 + 1) + '</b><span class="st"><svg><use href="#i-star"/></svg><svg><use href="#i-star"/></svg><svg><use href="#i-star"/></svg></span><svg class="p-lock"><use href="#i-lock"/></svg>';
        onBtn(b, function () {
          if (!D.isLevelOpen(save, idx)) { J.error(); wiggle(b); return; }
          J.select();
          startJourney(idx);
        });
        row.appendChild(b);
        levelBtns[idx] = b;
      })(wIdx * 3 + s);

      card.appendChild(row);
      box.appendChild(card);
      worldCards.push({ card: card, btn: artBtn });
    });
  }

  function refreshMap() {
    var nxt = D.nextLevel(save);
    $('map-stars').textContent = String(D.totalStars(save));
    levelBtns.forEach(function (btn, idx) {
      var open = D.isLevelOpen(save, idx);
      var st = save.stars[idx] || 0;
      btn.classList.toggle('locked', !open);
      btn.classList.toggle('done', st > 0);
      btn.classList.toggle('next', idx === nxt && open && st === 0);
      btn.querySelectorAll('.st svg').forEach(function (el, j) { el.classList.toggle('on', j < st); });
      btn.setAttribute('aria-label', D.WORLDS[Math.floor(idx / 3)].name + ' مرحلة ' + (idx % 3 + 1) + (open ? '' : ' مقفلة'));
    });
    worldCards.forEach(function (wc, wIdx) {
      var open = D.isWorldOpen(save, wIdx);
      wc.card.classList.toggle('locked', !open);
      wc.btn.setAttribute('aria-label', D.WORLDS[wIdx].name + (open ? '' : ' مقفل'));
    });
  }

  function openMap() {
    if (mode === 'playing' || mode === 'paused') Kit.stats.end('quit', world ? world.score : 0);
    if (mode !== 'title' && mode !== 'map') menuScene(D.LEVELS[D.nextLevel(save)].world);
    refreshMap();
    setMode('map');
    J.tap();
  }

  function wiggle(el) {
    el.classList.remove('wiggle');
    void el.offsetWidth;
    el.classList.add('wiggle');
  }

  /* ------------------------------------------------------------- Wardrobe */
  var colorBtns = [], hatBtns = [];
  function buildWardrobeUI() {
    var cBox = $('colors'), hBox = $('hats');
    cBox.innerHTML = ''; hBox.innerHTML = '';
    D.COLORS.forEach(function (col, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch'; b.title = col.name;
      var hex = '#' + col.hex.toString(16).padStart(6, '0');
      b.innerHTML = '<span class="dot" style="background:' + hex + '"></span>' + (col.cost ? '<span class="cost" dir="ltr">' + col.cost + '</span>' : '');
      onBtn(b, function () {
        if (save.bank < col.cost) { J.error(); wiggle(b); return; }
        save.color = i;
        persist();
        if (view) { view.setDinoLook(save.color, save.hat); view.triggerHop(); }
        J.select();
        refreshWardrobe();
      });
      cBox.appendChild(b);
      colorBtns.push(b);
    });
    D.HATS.forEach(function (hat, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch'; b.title = hat.name;
      b.innerHTML = HAT_SVGS[hat.id] + (hat.cost ? '<span class="cost" dir="ltr">' + hat.cost + '</span>' : '');
      onBtn(b, function () {
        if (save.bank < hat.cost) { J.error(); wiggle(b); return; }
        save.hat = i;
        persist();
        if (view) { view.setDinoLook(save.color, save.hat); view.triggerHop(); }
        J.select();
        refreshWardrobe();
      });
      hBox.appendChild(b);
      hatBtns.push(b);
    });
  }

  function refreshWardrobe() {
    $('bank').textContent = String(save.bank);
    colorBtns.forEach(function (b, i) {
      var c = D.COLORS[i], unlocked = save.bank >= c.cost;
      b.classList.toggle('locked', !unlocked);
      b.classList.toggle('on', save.color === i);
      var costEl = b.querySelector('.cost');
      if (costEl) costEl.hidden = unlocked;
      b.setAttribute('aria-pressed', String(save.color === i));
      b.setAttribute('aria-label', c.name + (unlocked ? '' : ' مقفل ' + c.cost + ' بيضة'));
    });
    hatBtns.forEach(function (b, i) {
      var h = D.HATS[i], unlocked = save.bank >= h.cost;
      b.classList.toggle('locked', !unlocked);
      b.classList.toggle('on', save.hat === i);
      var costEl = b.querySelector('.cost');
      if (costEl) costEl.hidden = unlocked;
      b.setAttribute('aria-pressed', String(save.hat === i));
      b.setAttribute('aria-label', h.name + (unlocked ? '' : ' مقفل ' + h.cost + ' بيضة'));
    });
  }

  function openWardrobe() {
    if (save.seenBank < save.bank) {
      save.seenBank = save.bank;
      persist();
    }
    menuScene(D.LEVELS[D.nextLevel(save)].world);
    wardSpin = 0;
    refreshWardrobe();
    setMode('wardrobe');
    if (view) view.triggerHop();
    J.select();
  }

  /* ---------------------------------------------------------- Endless Menu */
  function openEndless() {
    $('far-best').textContent = String(save.far);
    $('code-row').hidden = true;
    $('code-btn').setAttribute('aria-expanded', 'false');
    $('code-error').hidden = true;
    $('code-input').value = '';
    setMode('endless');
    J.tap();
  }

  /* ----------------------------------------------------------- Run Control */
  function queueOrRun(fn) {
    if (!live) { queued = fn; return; }
    fn();
  }

  function beginRun(opts) {
    cur.endless = !!opts.endless;
    cur.level = opts.level || 0;
    cur.code = cur.endless ? D.parseCode(opts.code) : '';

    var ctrl = cur.endless ? ddaRun : ddaMain;
    var levelVal = ctrl.level;
    var tierVal = ctrl.tier;

    world = D.createWorld({
      endless: cur.endless,
      level: cur.level,
      code: cur.code,
      ddaLevel: levelVal,
      tier: tierVal
    });

    ending = null;
    result = null;
    pointerDown = false;
    pointerJumpEdge = false;
    hudCache = { hp: -1, eggs: -1, roarPct: -1, roarReady: false, m: -1, combo: 0 };
    $('floats').innerHTML = '';
    hideCoach();
    hideBanner();

    if (view) {
      view.resetWorld(world.worldIndex);
      view.setDinoLook(save.color, save.hat);
    }
    snap = true;

    // HUD mode toggle
    $('trip').hidden = cur.endless;
    $('meters').hidden = !cur.endless;
    $('code-tag').hidden = !(cur.endless && cur.code);
    if (cur.code) $('code-now').textContent = cur.code;
    $('hud-far').textContent = String(save.far);
    updateWorldLabel();

    setMode('playing');
    syncHud();

    // First-time gentle coach hint in Level 1-1!
    if (!save.coached && !cur.endless && cur.level === 0) {
      coach.tutorialStarted = true;
      coach.doneJump = false;
      Kit.stats.tutorial('start');
      showCoach('jump', '<span dir="ltr"><span class="sg-key">مسافة</span> <span class="sg-key">↑</span></span> اضغط للقفز!');
    }

    Kit.stats.round(world.id);
    showBanner(D.WORLDS[world.worldIndex].name);
    say(cur.endless ? 'بدأت رحلة الجري بلا نهاية' : 'بدأت المرحلة ' + world.id);
  }

  function startJourney(levelIdx) {
    queueOrRun(function () { beginRun({ endless: false, level: levelIdx }); });
  }

  function startEndless(codeStr) {
    queueOrRun(function () { beginRun({ endless: true, code: codeStr || '' }); });
  }

  function restartRun() {
    if (!cur) return;
    J.select();
    beginRun({ endless: cur.endless, level: cur.level, code: cur.code });
  }

  function pauseGame(playSfx) {
    if (mode !== 'playing') return;
    if (playSfx) J.back();
    setMode('paused');
    say('توقف مؤقت');
  }

  function resumeGame() {
    if (mode !== 'paused') return;
    J.select();
    Kit.keys.reset();
    pointerDown = false;
    pointerJumpEdge = false;
    setMode('playing');
    say('متابعة اللعب');
  }

  /* --------------------------------------------------------- Coach & Toast */
  function showCoach(action, html) {
    coach.active = true;
    coach.action = action;
    coach.timer = 4.2;
    var el = $('coach');
    el.innerHTML = html;
    el.hidden = false;
  }

  function hideCoach() {
    coach.active = false;
    coach.action = '';
    $('coach').hidden = true;
  }

  function showBanner(text) {
    var el = $('banner');
    el.textContent = text;
    el.hidden = false;
    bannerTimer = 2.0;
  }

  function hideBanner() {
    bannerTimer = 0;
    $('banner').hidden = true;
  }

  function spawnPopup(worldX, worldY, text, big) {
    if (!view) return;
    var pr = view.project(worldX, worldY + 0.85, 0);
    var div = document.createElement('div');
    div.className = 'pop-float' + (big ? ' big' : '');
    div.textContent = text;
    div.style.left = Math.round(D.clamp(pr.x, 0.12, 0.88) * 1280) + 'px';
    div.style.top = Math.round(D.clamp(pr.y, 0.14, 0.82) * 720) + 'px';
    $('floats').appendChild(div);
    setTimeout(function () { if (div.parentNode) div.parentNode.removeChild(div); }, 740);
  }

  function updateWorldLabel() {
    if (!world) return;
    var wName = D.WORLDS[world.worldIndex].name;
    $('world-tag').textContent = cur.endless
      ? wName
      : (wName + ' • ' + (world.worldIndex + 1) + '-' + (world.stage + 1));
  }

  /* --------------------------------------------------------------- HUD Sync */
  function syncHud() {
    if (!world) return;
    var p = world.p;
    if (hudCache.hp !== p.hp) {
      hudCache.hp = p.hp;
      var icons = $('hearts').children;
      for (var i = 0; i < icons.length; i++) {
        icons[i].classList.toggle('lost', i >= p.hp);
      }
    }
    if (hudCache.eggs !== world.eggs) {
      var grew = hudCache.eggs >= 0 && world.eggs > hudCache.eggs;
      hudCache.eggs = world.eggs;
      $('hud-eggs').textContent = String(world.eggs);
      if (grew) {
        var chip = $('hud-eggs').parentElement;
        chip.classList.remove('pop');
        void chip.offsetWidth;
        chip.classList.add('pop');
      }
    }
    if (hudCache.combo !== world.streak) {
      hudCache.combo = world.streak;
      $('combo').hidden = world.streak < 3;
      if (world.streak >= 3) $('combo-n').textContent = String(world.streak);
    }
    var roarPct = Math.round(p.roar * 100);
    var roarReady = p.roar >= 0.999 && p.roarT <= 0;
    if (hudCache.roarPct !== roarPct || hudCache.roarReady !== roarReady) {
      hudCache.roarPct = roarPct;
      hudCache.roarReady = roarReady;
      $('roar-fill').style.width = roarPct + '%';
      $('roar').classList.toggle('ready', roarReady);
    }
    if (cur.endless) {
      var m = Math.floor(world.x);
      if (hudCache.m !== m) {
        hudCache.m = m;
        $('hud-m').textContent = String(m);
      }
    } else {
      var pct = Math.round(D.progress(world) * 1000) / 10;
      $('trip-fill').style.width = pct + '%';
      $('trip-me').style.left = pct + '%';
    }
  }

  /* --------------------------------------------------------- End & Results */
  function finishRun(won) {
    hideCoach();
    var w = world;
    var stars = cur.endless ? 0 : D.computeStars(w.eggs, w.totalEggs, w.bumps, won);
    var meters = Math.floor(w.x);
    var prevBank = save.bank;
    var newBest = false;

    if (w.eggs > 0) save.bank += w.eggs;
    if (cur.endless) {
      if (meters > save.far) { save.far = meters; newBest = true; }
      var endlessScore = D.clamp(meters / 260, 0, 1);
      ddaRun.result(endlessScore);
      Kit.stats.end('end', meters);
    } else {
      if (won) {
        if (stars > save.stars[cur.level]) save.stars[cur.level] = stars;
        if (w.eggs > save.best[cur.level]) { save.best[cur.level] = w.eggs; newBest = true; }
      }
      var outcome = won ? (0.55 + stars * 0.15) : D.clamp(D.progress(w) * 0.45, 0, 0.42);
      ddaMain.result(outcome);
      Kit.stats.end(won ? 'win' : 'lose', won ? stars : w.eggs);
    }

    var unlocked = D.unlockedBetween(prevBank, save.bank);
    persist();

    result = {
      won: won,
      endless: cur.endless,
      stars: stars,
      eggs: w.eggs,
      meters: meters,
      newBest: newBest,
      unlocked: unlocked
    };

    if (won) {
      // Short joyful reunion celebration before showing the Result Card!
      ending = { t: 0, wait: 1.05 };
      setMode('ending');
      J.levelUp();
      if (view) {
        view.burst(w.x + 1.4, 1.5, 0, {
          count: 34, colors: [0xffe44d, 0xff5c9b, 0x45e373, 0x38b6ff, 0xb873ff],
          speed: 7.5, up: 7.2, life: 1.15, size: 0.28, gravity: 11
        });
      }
    } else {
      J.fail();
      showResultCard();
    }
  }

  function showResultCard() {
    var r = result;
    resultLock = 0.35;
    $('res-title').textContent = r.endless
      ? (r.newBest ? 'رقم قياسي جديد!' : 'جولة رائعة!')
      : (r.won ? (cur.level === D.LEVEL_COUNT - 1 ? 'أهلاً بك في العش الملكي!' : PRAISE[r.stars % PRAISE.length]) : 'حاول مرة أخرى!');

    var starsEl = $('res-stars');
    starsEl.hidden = r.endless || !r.won;
    var svgs = starsEl.querySelectorAll('svg');
    svgs.forEach(function (s) { s.classList.remove('on'); });
    if (!starsEl.hidden) {
      for (var i = 0; i < r.stars; i++) (function (idx) {
        setTimeout(function () {
          if (mode === 'result') {
            svgs[idx].classList.add('on');
            J.star(idx + 1);
          }
        }, 160 + idx * 240);
      })(i);
    }

    $('res-n').textContent = String(r.eggs);
    $('res-far').hidden = !r.endless;
    if (r.endless) $('res-m').textContent = String(r.meters);
    $('res-best').hidden = !r.newBest;

    var giftBtn = $('res-gift');
    if (r.unlocked.length > 0) {
      $('res-gift-txt').textContent = 'فُتح: ' + r.unlocked[0].name + '!';
      giftBtn.hidden = false;
    } else {
      giftBtn.hidden = true;
    }

    var hasNext = !r.endless && r.won && cur.level + 1 < D.LEVEL_COUNT;
    $('next').hidden = !hasNext && !r.endless && r.won;
    if (hasNext) {
      $('next-label').textContent = 'التالي';
      $('next').hidden = false;
    } else if (r.endless || !r.won) {
      $('next-label').textContent = 'مرة أخرى';
      $('next').hidden = false;
    }

    setMode('result');
    say($('res-title').textContent);
  }

  /* -------------------------------------------------------- Update & Render */
  function handleEvents(w) {
    for (var i = 0; i < w.ev.length; i++) {
      var ev = w.ev[i];
      if (ev.t === 'jump') {
        J.jump(0.72);
        if (view) {
          view.triggerSquash(1);
          view.burst(ev.x, 0.15, 0, { count: 7, colors: [0xffffff, 0xffe49e], speed: 2.5, up: 1.8, life: 0.35, size: 0.18, gravity: 8 });
        }
        if (coach.tutorialStarted && !coach.doneJump) {
          coach.doneJump = true;
          save.coached = true;
          persist();
          Kit.stats.tutorial('done');
          if (coach.action === 'jump') hideCoach();
        }
      } else if (ev.t === 'land') {
        J.land(ev.power);
        if (view) {
          view.triggerSquash(-1);
          view.burst(ev.x, 0.1, 0, { count: 6, colors: [0xfff0c4, 0xffffff], speed: 2.2, up: 1.2, life: 0.3, size: 0.15, gravity: 6 });
        }
      } else if (ev.t === 'bounce') {
        J.pop(0.85);
        J.jump(1.0);
        if (view) {
          view.triggerSquash(1);
          view.burst(ev.x, ev.y, 0, { count: 16, colors: [0xff5c9b, 0xffe44d, 0x4df5d8], speed: 4.5, up: 4.8, life: 0.55, size: 0.22, gravity: 10 });
        }
        spawnPopup(ev.x, ev.y + 0.6, 'قفزة خارقة!', true);
      } else if (ev.t === 'roar') {
        J.whoosh(0.95);
        J.impact(0.85);
        if (view) {
          view.triggerRoar();
          view.burst(ev.x + 1.0, ev.y + 0.9, 0, { count: 18, colors: [0xffe853, 0xff922b, 0xffffff], speed: 6.0, up: 2.6, life: 0.45, size: 0.22, gravity: 5, vx: 6.5 });
        }
        if (coach.action === 'roar') hideCoach();
      } else if (ev.t === 'roarReady') {
        J.chime(1);
      } else if (ev.t === 'smash') {
        Kit.track.hit();
        J.impact(1.0);
        J.chime(2);
        if (view) {
          view.shake(0.42);
          view.burst(ev.x, ev.y, 0, { count: 24, colors: [0xffe44d, 0xff6b35, 0x4df5d8, 0xff5c9b, 0xe8a445], speed: 6.8, up: 5.5, life: 0.72, size: 0.26, gravity: 14 });
        }
        spawnPopup(ev.x, ev.y, '+' + ev.bonus + ' تحطيم!', true);
      } else if (ev.t === 'clear') {
        Kit.track.hit();
      } else if (ev.t === 'cue') {
        Kit.track.cue();
        // Gentle first-time visual cue for Duck or Roar on early levels!
        if (!cur.endless && cur.level <= 2) {
          if (ev.action === 'duck' && !coach.shown.duck) {
            coach.shown.duck = true;
            showCoach('duck', '<span dir="ltr"><span class="sg-key">↓</span></span> انزلق للأسفل!');
          } else if (ev.action === 'roar' && !coach.shown.roar && w.p.roar >= 0.99) {
            coach.shown.roar = true;
            showCoach('roar', '<span dir="ltr"><span class="sg-key">→</span></span> زئير للتحطيم!');
          }
        }
      } else if (ev.t === 'egg') {
        if (ev.kind === 'gold') {
          J.chime(2);
          spawnPopup(ev.x, ev.y, '+3', true);
        } else if (ev.kind === 'rainbow') {
          J.streak(Math.min(12, ev.streak));
          spawnPopup(ev.x, ev.y, '+2', false);
        } else {
          J.coin(Math.min(5, ev.streak));
        }
        if (view) {
          view.burst(ev.x, ev.y, 0, {
            count: ev.kind === 'gold' ? 12 : 6,
            colors: ev.kind === 'gold' ? [0xffe44d, 0xffffff, 0xffa62b] : [0xfff6db, 0x38b6ff, 0xff6ba9],
            speed: 3.2, up: 2.5, life: 0.4, size: 0.16, gravity: 7
          });
        }
      } else if (ev.t === 'heart') {
        J.chime(3);
        spawnPopup(ev.x, ev.y, ev.healed ? '+1 ❤' : '+2', true);
      } else if (ev.t === 'bump') {
        Kit.track.miss();
        J.impact(0.65);
        J.error();
        if (view) {
          view.shake(0.45);
          view.burst(ev.x, ev.y, 0, { count: 14, colors: [0xff5277, 0xffe44d, 0xffffff], speed: 4.4, up: 3.5, life: 0.5, size: 0.2, gravity: 12 });
        }
        // the first world keeps the last heart: say so once, so the child keeps going
        if (w.gentle && ev.hp === 1 && !coach.shown.gentle) {
          coach.shown.gentle = true;
          showBanner('لا تقلق! الديناصور يكمل الطريق');
        }
      } else if (ev.t === 'worldChange') {
        J.chime(2);
        updateWorldLabel();
        showBanner(ev.name);
      } else if (ev.t === 'finish') {
        finishRun(true);
      } else if (ev.t === 'over') {
        finishRun(false);
      }
    }
    w.ev.length = 0;
  }

  function update(dt) {
    time += dt;
    if (resultLock > 0) resultLock = Math.max(0, resultLock - dt);
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) hideBanner();
    }
    if (coach.active) {
      coach.timer -= dt;
      if (coach.timer <= 0) hideCoach();
    }

    if (mode === 'wardrobe') {
      wardSpin += dt * 1.1;
    } else if (mode === 'ending' && ending) {
      ending.t += dt;
      if (ending.t >= ending.wait) {
        ending = null;
        showResultCard();
      }
    } else if (mode === 'playing' && world) {
      var jumpPressed = Kit.keys.anyPressed(JUMP_KEYS) || pointerJumpEdge;
      var jumpHeld = Kit.keys.anyDown(JUMP_KEYS) || pointerDown;
      var duckHeld = Kit.keys.anyDown(DUCK_KEYS);
      var roarPressed = Kit.keys.anyPressed(ROAR_KEYS);
      if (jumpPressed) inputJumps++;
      if (duckHeld && coach.action === 'duck') hideCoach();
      pointerJumpEdge = false;

      D.step(world, dt, {
        jumpPressed: jumpPressed,
        jump: jumpHeld,
        duck: duckHeld,
        roarPressed: roarPressed
      });
      handleEvents(world);
      syncHud();
    }
    Kit.keys.endFrame();
  }

  function playerVisualState() {
    if (world) {
      return {
        x: world.x,
        y: world.p.y,
        vy: world.p.vy,
        ground: world.p.ground,
        duck: world.p.duck,
        roaring: world.p.roarT > 0,
        superBounce: world.p.superBounce,
        invuln: world.p.invuln,
        stride: world.p.stride,
        running: mode === 'playing'
      };
    }
    return { x: 0, y: 0, vy: 0, ground: true, duck: false, roaring: false, superBounce: false, invuln: 0, stride: 0, running: false };
  }

  function render() {
    if (!view || contextLost) return;
    // Freeze GPU redraws while paused or hidden unless dirty (resize/resume/restore).
    if (mode === 'paused' && !dirty) return;

    var now = performance.now();
    var playing = mode === 'playing' || mode === 'ending';
    if (!dirty && !view.mayDraw(now, playing)) return;

    if (lastFrame && playing) view.frameTime(now - lastFrame);
    lastFrame = now;

    var dt = Math.max(0, Math.min(0.08, time - viewTime));
    viewTime = time;
    var camMode = (mode === 'playing' || mode === 'paused') ? 'play'
      : (mode === 'ending' || mode === 'result') ? 'finish'
      : mode === 'wardrobe' ? 'wardrobe' : 'menu';

    var menuWorldIdx = D.LEVELS[D.nextLevel(save)].world;
    view.update({
      mode: camMode,
      dt: dt,
      t: time,
      world: world,
      worldIndex: menuWorldIdx,
      player: playerVisualState(),
      spin: mode === 'wardrobe' ? Math.sin(wardSpin) * 0.72 : 0,
      snap: snap
    });
    snap = false;
    view.render();
    dirty = false;
  }

  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    uiScale = Math.min(w / 1280, h / 720);
    uiLeft = (w - 1280 * uiScale) / 2;
    uiTop = (h - 720 * uiScale) / 2;
    ui.style.transform = 'scale(' + uiScale + ')';
    ui.style.left = uiLeft + 'px';
    ui.style.top = uiTop + 'px';
    if (view) view.resize(w, h);
    dirty = true;
  }

  /* ------------------------------------------------- Keyboard & Mouse Wire */
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e)) return;
    if (e.repeat) return;

    if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      if (mode === 'playing') pauseGame(true);
      else if (mode === 'paused') resumeGame();
      else if (mode === 'map' || mode === 'endless' || mode === 'wardrobe') { J.back(); openTitle(); }
      return;
    }

    if (mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      J.select();
      startJourney(D.nextLevel(save));
      return;
    }

    if (mode === 'paused') {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); resumeGame(); }
      else if (e.code === 'KeyR') { e.preventDefault(); restartRun(); }
      return;
    }

    if (mode === 'result' && resultLock <= 0) {
      if (e.code === 'KeyR') { e.preventDefault(); restartRun(); }
      else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        if (result && !result.endless && result.won && cur.level + 1 < D.LEVEL_COUNT) {
          J.select();
          startJourney(cur.level + 1);
        } else {
          restartRun();
        }
      }
    }
  });

  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    focusCanvas();
    if (mode === 'playing') {
      pointerDown = true;
      pointerJumpEdge = true;
    } else if (mode === 'title' || mode === 'wardrobe') {
      if (view) view.triggerHop();
      J.pop(0.6);
    }
  });
  window.addEventListener('pointerup', function () { pointerDown = false; });
  window.addEventListener('pointercancel', function () { pointerDown = false; });

  // Button bindings
  onBtn($('play'), function () { J.select(); startJourney(D.nextLevel(save)); });
  onBtn($('btn-map'), openMap);
  onBtn($('btn-endless'), openEndless);
  onBtn($('btn-wardrobe'), openWardrobe);
  onBtn($('map-home'), function () { J.back(); openTitle(); });
  onBtn($('endless-home'), function () { J.back(); openTitle(); });
  onBtn($('wardrobe-back'), function () { J.back(); openTitle(); });
  onBtn($('endless-go'), function () { J.select(); startEndless(''); });
  onBtn($('code-btn'), function () {
    var row = $('code-row');
    row.hidden = !row.hidden;
    $('code-btn').setAttribute('aria-expanded', String(!row.hidden));
    $('code-error').hidden = true;
    if (!row.hidden) $('code-input').focus();
    J.tap();
  });
  $('code-row').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = D.parseCode($('code-input').value);
    if (!code) {
      $('code-error').hidden = false;
      J.error();
      return;
    }
    $('code-error').hidden = true;
    J.select();
    startEndless(code);
  });

  onBtn($('pause-button'), function () { pauseGame(true); });
  onBtn($('resume'), resumeGame);
  onBtn($('restart'), restartRun);
  onBtn($('pause-menu'), openMap);
  onBtn($('pause-home'), function () { J.back(); openTitle(); });
  onBtn($('result-menu'), openMap);
  onBtn($('again'), restartRun);
  onBtn($('next'), function () {
    if (result && !result.endless && result.won && cur.level + 1 < D.LEVEL_COUNT) {
      J.select();
      startJourney(cur.level + 1);
    } else {
      restartRun();
    }
  });
  onBtn($('res-gift'), openWardrobe);

  /* --------------------------------------------------- Test & Debug Handle */
  function snapshot() {
    var w = world, p = w && w.p;
    return {
      screen: mode,
      mode: mode,
      paused: mode === 'paused',
      score: w ? w.score : 0,
      eggs: w ? w.eggs : 0,
      total: w ? w.totalEggs : 0,
      distance: w ? Math.round(w.x * 1000) / 1000 : 0,
      hearts: p ? p.hp : D.MAX_HEARTS,
      roar: p ? Math.round(p.roar * 1000) / 1000 : 0,
      level: cur.level,
      id: w ? w.id : '',
      world: w ? w.worldIndex : 0,
      tier: w ? w.tier : 0,
      endless: cur.endless,
      code: cur.code,
      progress: w ? Math.round(D.progress(w) * 1000) / 1000 : 0,
      done: !!(w && w.done),
      over: !!(w && w.over),
      bumps: w ? w.bumps : 0,
      smashed: w ? w.smashed : 0,
      stars: result && !result.endless ? result.stars : 0,
      player: p
        ? { y: Math.round(p.y * 1000) / 1000, vy: Math.round(p.vy * 1000) / 1000, ground: p.ground, duck: p.duck, roar: p.roarT > 0 }
        : { y: 0, vy: 0, ground: true, duck: false, roar: false }
    };
  }

  /* --------------------------------------------- 3-Step Software-Safe Init */
  $('hearts').querySelectorAll('i').forEach(function (h) {
    h.innerHTML = '<svg aria-hidden="true"><use href="#i-heart"/></svg>';
  });
  Kit.muteButton();
  Kit.lifecycle({
    pause: function () { pauseGame(false); },
    reset: function () { pointerDown = false; pointerJumpEdge = false; }
  });
  Kit.motion.onChange(function (r) { if (view) view.calm = r; dirty = true; });
  window.addEventListener('resize', layout);
  window.addEventListener('pageshow', function () { dirty = true; });
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    contextLost = true;
    pauseGame(false);
    $('context-notice').hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', function () {
    contextLost = false;
    $('context-notice').hidden = true;
    snap = true;
    dirty = true;
    layout();
  });
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'رائع 5').then(function () { dirty = true; }, function () {});
  }

  function showError(err) {
    if (failed) return;
    failed = true;
    live = false;
    queued = null;
    if (loop) loop.stop();
    for (var k in SCREENS) $(SCREENS[k]).hidden = true;
    $('hud').hidden = true;
    $('pause-button').hidden = true;
    $('scrError').hidden = false;
    body.dataset.mode = 'error';
    Kit.fail(err);
  }

  function guarded(fn) {
    return function () {
      if (failed) return;
      try { fn(); } catch (err) { showError(err); }
    };
  }

  function goLive() {
    var api = {
      get mode() { return mode; },
      get state() { return snapshot(); },
      get inputJumps() { return inputJumps; },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get world() { return world; },
      point: function (x, y, z) {
        var p = view.project(x, y, z || 0);
        return { x: p.x * window.innerWidth, y: p.y * window.innerHeight };
      }
    };
    window.Dino3DGame = api;
    window.__game = api;
    loop = Kit.loop(update, render);
    live = true;
    Kit.ready();
    if (queued) { var runFn = queued; queued = null; runFn(); }
  }

  function firstFrame() {
    render();
    view.compileRest();
    view.whenDrawn(guarded(goLive), 8000);
  }

  function init3D() {
    view = D.createView(canvas);
    view.calm = Kit.motion.reduced();
    view.setDinoLook(save.color, save.hat);
    layout();
    menuScene(D.LEVELS[D.nextLevel(save)].world);
    view.prepare(guarded(firstFrame));
  }

  try {
    buildMapUI();
    buildWardrobeUI();
    refreshTitle();
    layout();
    setMode('title');
    var started = false;
    var kick = function () {
      if (started) return;
      started = true;
      setTimeout(guarded(init3D), 0);
    };
    requestAnimationFrame(kick);
    setTimeout(kick, 100);
  } catch (err) {
    showError(err);
  }
})();
