/* Desk Karts 3D (سباق المكاتب) — UI controller, keyboard input, HUD, minimap, Kit DDA/stats/juice.
 * Pure racing simulation lives in engine.js; 3D Three.js renderer lives in art.js. */
(function () {
  'use strict';

  var E = window.DeskKartsEngine;
  var A = window.DeskKartsArt;
  var J = Kit.juice;
  function $(id) { return document.getElementById(id); }

  var canvas = $('scene');
  var mapCanvas = $('minimap');
  var mapCtx = mapCanvas.getContext('2d');
  var body = document.body;

  /* --------------------------------------------------------------- Save & DDA */
  var store = Kit.store('desk-karts');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = E.loadSave(store.get('save3', null));
  function persist() {
    if (store.set('save3', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }

  var dda = Kit.dda('desk-karts', { id: 'main', target: 0.72, tiers: 5 });

  /* --------------------------------------------------------------- App State */
  var mode = 'title';
  var duo = false;
  var selectedTrack = 0;
  var world = null;
  var demo = null;
  var view = null;
  var loop = null;
  var live = false;
  var contextLost = false;
  var dirty = true;
  var snapCam = true;
  var drawCount = 0;

  var roundOpen = false;
  var resultData = null;
  var resultLock = 0;
  var bannerT = 0;
  var idleT = 0;
  var tutorialStarted = false;
  var tutorialDone = false;

  var pointerFire = false;

  var hudCache = { place: -1, lap: -1, coins: -1, speed: -1, boost: false, p1Item: '-', p2Item: '-', trackId: '' };
  var BODY_ICONS = ['🏎️', '🚀', '🚌', '🚙'];
  var ITEM_ICONS = { plane: '✈️', shell: '💥', rocket: '🚀', shield: '🛡️', ink: '💧' };

  function say(txt) { $('live').textContent = txt; }
  function focusCanvas() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }

  /* --------------------------------------------------------------- Screens */
  var SCREENS = { title: 'scrTitle', tracks: 'scrTracks', garage: 'scrGarage', pause: 'scrPause', result: 'scrResult' };
  function setMode(next) {
    mode = next;
    body.dataset.mode = next;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== next;
    $('hud').hidden = !(next === 'play' || next === 'pause');
    if (next !== 'play') $('ghostHint').hidden = true;
    dirty = true;
    if (next === 'play') focusCanvas();
  }

  function showBanner(text, dur) {
    var el = $('banner');
    el.textContent = text;
    el.hidden = false;
    bannerT = dur || 1.4;
  }

  function refreshTitleUI() {
    $('titleStars').querySelector('b').textContent = E.totalStars(save) + '/' + (E.TRACKS.length * 3);
    $('titleCoins').querySelector('b').textContent = Kit.fmt(save.coins);
    $('titleBest').querySelector('b').textContent = Kit.fmt(save.bestScore);
    var btnDuo = $('btnDuo');
    btnDuo.setAttribute('aria-pressed', String(duo));
    btnDuo.textContent = duo ? '👥 لاعبان (محلي)' : '👤 لاعب واحد';
    $('controlsBar').innerHTML = duo
      ? '1P: <span dir="ltr"><span class="sg-key">A</span><span class="sg-key">D</span></span> توجيه · <span class="sg-key">S</span> دريفت · <span class="sg-key">مسافة</span> سلاح <span class="sep">|</span> 2P: <span dir="ltr"><span class="sg-key">←</span><span class="sg-key">→</span></span> · <span class="sg-key">↓</span> دريفت · <span class="sg-key">Enter</span> سلاح'
      : '<span dir="ltr"><span class="sg-key">←</span><span class="sg-key">→</span> / <span class="sg-key">AD</span></span> توجيه تلقائي <span class="sep">·</span> <span dir="ltr"><span class="sg-key">Shift</span> / <span class="sg-key">S</span></span> دريفت <span class="sep">·</span> <span dir="ltr"><span class="sg-key">مسافة</span> / <span class="sg-key">E</span> / 🖱️</span> سلاح';
  }

  function buildTracksUI() {
    $('tracksStars').querySelector('b').textContent = E.totalStars(save) + '/' + (E.TRACKS.length * 3);
    var wrap = $('tracksGrid');
    wrap.innerHTML = '';
    for (var c = 0; c < E.CUPS.length; c++) {
      var cup = E.CUPS[c];
      var sec = document.createElement('div');
      sec.className = 'cup-block';
      sec.innerHTML = '<div class="cup-title"><span class="cup-dot" style="background:' + cup.accent + '"></span>' + cup.name + '</div>';
      var row = document.createElement('div');
      row.className = 'track-row';
      for (var i = 0; i < E.TRACKS.length; i++) {
        var tr = E.TRACKS[i];
        if (tr.cup !== cup.id) continue;
        var st = save.tracks[i] || { stars: 0 };
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'track-card' + (i === selectedTrack ? ' selected' : '');
        btn.dataset.idx = String(i);
        var starsHtml = '';
        for (var s = 1; s <= 3; s++) starsHtml += '<span class="' + (s <= st.stars ? 'on' : '') + '">★</span>';
        btn.innerHTML = '<span class="track-id" dir="ltr">' + tr.id + '</span><span class="track-name">' + tr.name + '</span><span class="track-stars">' + starsHtml + '</span>';
        btn.addEventListener('click', (function (idx) {
          return function () {
            J.select();
            selectedTrack = idx;
            startRace(idx);
          };
        })(i));
        row.appendChild(btn);
      }
      sec.appendChild(row);
      wrap.appendChild(sec);
    }
  }

  function buildGarageUI() {
    $('garageCoins').querySelector('b').textContent = Kit.fmt(save.coins);
    var bGrid = $('bodyGrid');
    bGrid.innerHTML = '';
    for (var i = 0; i < E.BODIES.length; i++) {
      var bd = E.BODIES[i];
      var owned = !!save.bodies[i];
      var active = save.body === i;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shop-item' + (active ? ' active' : '') + (!owned ? ' locked' : '');
      btn.innerHTML = '<span class="shop-ico">' + BODY_ICONS[i] + '</span><span class="shop-name">' + bd.name + '</span><span class="shop-tag">' + (active ? 'مُختار ✓' : (owned ? 'اختيار' : '🪙 ' + bd.cost)) + '</span>';
      btn.addEventListener('click', (function (idx) {
        return function () {
          if (E.buyBody(save, idx)) {
            J.chime(2);
            persist();
            initDemo();
            buildGarageUI();
            refreshTitleUI();
          } else {
            J.error();
          }
        };
      })(i));
      bGrid.appendChild(btn);
    }

    var pGrid = $('paintGrid');
    pGrid.innerHTML = '';
    for (var j = 0; j < E.PAINTS.length; j++) {
      var pt = E.PAINTS[j];
      var pOwned = !!save.paints[j];
      var pActive = save.paint === j;
      var pBtn = document.createElement('button');
      pBtn.type = 'button';
      pBtn.className = 'shop-item' + (pActive ? ' active' : '') + (!pOwned ? ' locked' : '');
      pBtn.innerHTML = '<span class="swatch" style="background:' + pt.css + '"></span><span class="shop-name">' + pt.name + '</span><span class="shop-tag">' + (pActive ? '✓' : (pOwned ? 'اختيار' : '🪙 ' + pt.cost)) + '</span>';
      pBtn.addEventListener('click', (function (idx) {
        return function () {
          if (E.buyPaint(save, idx)) {
            J.chime(2);
            persist();
            initDemo();
            buildGarageUI();
            refreshTitleUI();
          } else {
            J.error();
          }
        };
      })(j));
      pGrid.appendChild(pBtn);
    }
  }

  /* --------------------------------------------------------------- Demo & Race Lifecycle */
  function initDemo() {
    demo = E.create({
      demo: true,
      track: selectedTrack,
      seed: 2026 + selectedTrack * 31,
      body: save.body,
      paint: save.paint,
      aiSkill: 0.45
    });
    // Advance slightly so karts are already zooming smoothly on the title screen
    for (var i = 0; i < 45; i++) E.step(demo, E.FIXED_DT, []);
    demo.ev.length = 0;
    snapCam = true;
    dirty = true;
  }

  function closeOpenRound(reason) {
    if (!roundOpen) return;
    roundOpen = false;
    Kit.stats.end(reason || 'quit');
  }

  function startRace(trackIdx) {
    if (trackIdx != null) selectedTrack = E.clamp(trackIdx | 0, 0, E.TRACKS.length - 1);
    closeOpenRound('quit');

    var skill = duo ? 0.45 : dda.value(0.18, 0.92);
    world = E.create({
      track: selectedTrack,
      duo: duo,
      demo: false,
      aiSkill: skill,
      body: save.body,
      paint: save.paint,
      seed: (Date.now() & 0xffff) || 404
    });

    Kit.keys.reset();
    Kit.hitstop.reset();
    pointerFire = false;
    resultData = null;
    resultLock = 0;
    idleT = 0;
    bannerT = 0;
    $('banner').hidden = true;
    $('p2ItemSlot').hidden = !duo;
    $('splitline').hidden = !duo;
    $('p1ItemTag').textContent = duo ? '1P' : 'سلاح';
    $('p1ItemKey').textContent = duo ? 'مسافة / Q' : 'مسافة / E';
    $('ghostKeys').innerHTML = duo
      ? '<span class="sg-key">A</span><span class="sg-key">D</span> / <span class="sg-key">←</span><span class="sg-key">→</span>'
      : '<span class="sg-key">←</span><span class="sg-key">→</span> <span class="sg-key">Shift</span> <span class="sg-key">مسافة</span>';

    hudCache.place = -1;
    hudCache.lap = -1;
    hudCache.coins = -1;
    hudCache.speed = -1;
    hudCache.p1Item = '-';
    hudCache.p2Item = '-';
    hudCache.trackId = '';

    var rid = (duo ? 'duo-' : 't') + world.L.id;
    Kit.stats.round(rid);
    roundOpen = true;

    if (!tutorialStarted) {
      tutorialStarted = true;
      Kit.stats.tutorial('start');
    }

    snapCam = true;
    setMode('play');
    updateHUD(true);
    drawMinimap();
    say('بدأت الحلبة ' + world.L.name);
  }

  function pauseGame() {
    if (mode !== 'play') return;
    $('pauseSub').textContent = world ? ('حلبة ' + world.L.name) : 'سيارتك جاهزة للانطلاق!';
    setMode('pause');
    J.back();
  }

  function resumeGame() {
    if (mode !== 'pause') return;
    Kit.keys.reset();
    setMode('play');
    J.select();
  }

  function goHome() {
    closeOpenRound('quit');
    world = null;
    initDemo();
    refreshTitleUI();
    setMode('title');
    J.back();
  }

  function openResult(summary) {
    resultData = summary;
    resultLock = 0.45;
    roundOpen = false;

    var resMeta = { newBest: false };
    if (summary.duo) {
      save.coins = E.clamp((save.coins | 0) + summary.coinsEarned, 0, 999999);
      persist();
      Kit.stats.end('end');
      $('resTitle').textContent = 'فاز ' + summary.winnerName + '! 🏆';
      $('resPlace').textContent = summary.winner === 0 ? '1P 🏆' : '2P 🏆';
      J.levelUp();
    } else {
      resMeta = E.applyResult(save, selectedTrack, summary);
      persist();
      dda.result(summary.outcome);
      Kit.stats.end(summary.place <= 3 ? 'win' : 'lose', summary.score);
      var titles = ['', 'المركز الأول! 🏆', 'المركز الثاني! 🥈', 'المركز الثالث! 🥉', 'حاول مجددًا! 🏁'];
      $('resTitle').textContent = titles[summary.place] || 'انتهى السباق!';
      $('resPlace').textContent = summary.place + '/4';
      if (summary.place === 1) J.levelUp();
      else if (summary.place <= 3) J.star(summary.stars);
      else J.fail();
    }

    $('resNewBest').hidden = !resMeta.newBest;
    $('resScore').textContent = Kit.fmt(summary.score);
    $('resCoins').textContent = '+' + Kit.fmt(summary.coinsEarned);

    var starEls = $('resStars').querySelectorAll('.star');
    for (var i = 0; i < starEls.length; i++) {
      starEls[i].classList.toggle('on', i < summary.stars);
    }

    $('btnNext').hidden = selectedTrack >= E.TRACKS.length - 1;
    setMode('result');
    if (view && world) {
      view.burst(world.karts[0].x, 2.2, world.karts[0].z, 26, [0xffd54f, 0xff4252, 0x22a7ff, 0x2ee06c], 12, 10, 0.36, 1.1);
    }
  }

  /* --------------------------------------------------------------- Input Reading */
  // Strict separation: Drift = Shift / S (never fires items!), Item = Space / E / Click (never triggers drift!).
  // Auto-Gas drives automatically once launched; W / ↑ still gives extra manual boost feel!
  function readInputs() {
    var K = Kit.keys;
    if (!duo) {
      var gas = (K.down('ArrowUp') || K.down('KeyW')) ? 1.04 : 0;
      var left = K.down('ArrowLeft') || K.down('KeyA');
      var right = K.down('ArrowRight') || K.down('KeyD');
      var steer = (right ? 1 : 0) - (left ? 1 : 0);
      var shiftDrift = K.down('ShiftLeft') || K.down('ShiftRight');
      var sDown = K.down('KeyS') || K.down('ArrowDown');
      var p1Spd = world && world.karts[0] ? world.karts[0].speed : 0;
      var drift = shiftDrift || (sDown && (Math.abs(steer) > 0.1 || (world && world.karts[0] && world.karts[0].drifting)) && p1Spd > 10);
      var brake = (sDown && !drift) ? 1 : 0;
      var itemEdge = K.anyPressed(['Space', 'KeyE', 'Enter']) || pointerFire;
      pointerFire = false;
      return [{ gas: gas, brake: brake, steer: steer, drift: drift, item: itemEdge }];
    }

    // 2P Local Split-Screen: P1 = A/D steer, W boost-gas, S/ShiftLeft drift, Space/E/Q item
    //                        P2 = ←/→ steer, ↑ boost-gas, ↓/ShiftRight drift, Enter/Slash item
    var p1Gas = K.down('KeyW') ? 1.04 : 0;
    var p1Steer = (K.down('KeyD') ? 1 : 0) - (K.down('KeyA') ? 1 : 0);
    var p1S = K.down('KeyS');
    var p1Spd2 = world && world.karts[0] ? world.karts[0].speed : 0;
    var p1Drift = K.down('ShiftLeft') || (p1S && (Math.abs(p1Steer) > 0.1 || (world && world.karts[0] && world.karts[0].drifting)) && p1Spd2 > 10);
    var p1Brake = (p1S && !p1Drift) ? 1 : 0;
    var p1ItemEdge = K.anyPressed(['Space', 'KeyE', 'KeyQ']);

    var p2Gas = K.down('ArrowUp') ? 1.04 : 0;
    var p2Steer = (K.down('ArrowRight') ? 1 : 0) - (K.down('ArrowLeft') ? 1 : 0);
    var p2S = K.down('ArrowDown');
    var p2Spd = world && world.karts[1] ? world.karts[1].speed : 0;
    var p2Drift = K.down('ShiftRight') || (p2S && (Math.abs(p2Steer) > 0.1 || (world && world.karts[1] && world.karts[1].drifting)) && p2Spd > 10);
    var p2Brake = (p2S && !p2Drift) ? 1 : 0;
    var p2ItemEdge = K.anyPressed(['Enter', 'NumpadEnter', 'Slash']);

    return [
      { gas: p1Gas, brake: p1Brake, steer: p1Steer, drift: p1Drift, item: p1ItemEdge },
      { gas: p2Gas, brake: p2Brake, steer: p2Steer, drift: p2Drift, item: p2ItemEdge }
    ];
  }

  /* --------------------------------------------------------------- Events, SFX & Particles */
  function handleEvents(w) {
    for (var i = 0; i < w.ev.length; i++) {
      var ev = w.ev[i];
      var isHuman = ev.kart === 0 || (w.duo && ev.kart === 1);
      if (ev.type === 'go') {
        J.countdown(0);
        showBanner('انطلق! 🏁', 1.1);
        if (!tutorialDone) { tutorialDone = true; Kit.stats.tutorial('done'); }
      } else if (ev.type === 'coin' && isHuman) {
        J.coin(w.karts[ev.kart].coins);
        Kit.track.hit();
        if (view) view.burst(ev.x, 1.2, ev.z, 8, [0xffe066, 0xffca28, 0xffffff], 6, 5, 0.24, 0.45);
      } else if (ev.type === 'boost') {
        if (isHuman) {
          J.whoosh(0.85);
          Kit.track.hit();
          showBanner('تيربو! ⚡', 0.9);
          if (view) view.shake(0.5);
        }
        if (view) view.burst(ev.x, 0.6, ev.z, 10, [0xffcf2b, 0x4df5ff, 0xffffff], 7, 4, 0.28, 0.4);
      } else if (ev.type === 'jump') {
        if (isHuman) {
          J.jump(0.8);
          Kit.track.hit();
          showBanner('قفزة رائعة! 🚀', 0.95);
        }
        if (view) view.burst(ev.x, 0.6, ev.z, 9, [0xffffff, 0xffd54f], 6, 5, 0.26, 0.42);
      } else if (ev.type === 'land' && isHuman) {
        J.land(0.65);
        if (view) view.shake(0.35);
      } else if (ev.type === 'driftCharge' && isHuman) {
        J.chime(ev.stage);
      } else if (ev.type === 'driftBoost') {
        if (isHuman) {
          J.whoosh(ev.stage === 2 ? 1.0 : 0.72);
          Kit.track.hit();
          showBanner(ev.stage === 2 ? 'دريفت خارق! 🔥' : 'تيربو دريفت! ⚡', 0.9);
          if (view) view.shake(ev.stage === 2 ? 0.65 : 0.35);
        }
        if (view) view.burst(ev.x, 0.5, ev.z, 12, ev.stage === 2 ? [0xffd600, 0xff6b22] : [0x38d9ff, 0xffffff], 8, 5, 0.28, 0.45);
      } else if (ev.type === 'pickup' && isHuman) {
        J.pop(0.75);
        Kit.track.hit();
        var itemDef = E.ITEMS[ev.item];
        if (itemDef) showBanner(itemDef.icon + ' ' + itemDef.name, 1.05);
        if (view) view.burst(ev.x, 1.4, ev.z, 10, [0xffcf2b, 0xffffff, itemDef ? itemDef.color : 0xffffff], 7, 5, 0.26, 0.45);
      } else if (ev.type === 'planeFire') {
        if (isHuman) { J.whoosh(0.95); showBanner('طائرة موجّهة! ✈️', 0.9); if (view) view.shake(0.35); }
        if (view) view.burst(ev.x, 1.2, ev.z, 10, [0xff3d7f, 0xffffff, 0xffd54f], 8, 5, 0.25, 0.42);
      } else if (ev.type === 'shellFire') {
        if (isHuman) { J.pop(0.85); showBanner('ممحاة قاذفة! 💥', 0.9); if (view) view.shake(0.32); }
        if (view) view.burst(ev.x, 0.8, ev.z, 10, [0x29e3ff, 0xff5a9c, 0xffffff], 8, 4, 0.25, 0.4);
      } else if (ev.type === 'shellBounce') {
        J.tap();
        if (view) view.burst(ev.x, 0.6, ev.z, 8, [0x29e3ff, 0xffffff], 6, 4, 0.22, 0.32);
      } else if (ev.type === 'shieldBlock') {
        if (isHuman || ev.attacker === 0 || (w.duo && ev.attacker === 1)) J.chime(2);
        if (view) view.burst(ev.x, 1.2, ev.z, 14, [0x38e890, 0xffffff, 0xffe066], 9, 6, 0.28, 0.48);
      } else if (ev.type === 'missileHit') {
        var humanHit = isHuman, humanAtk = ev.attacker === 0 || (w.duo && ev.attacker === 1);
        if (humanHit || humanAtk) {
          Kit.hitstop(0.055);
          if (view) view.shake(0.95);
          J.impact(0.95);
          if (humanAtk && !humanHit) {
            J.streak(3);
            Kit.track.hit();
            showBanner('إصابة مباشرة! 🎯', 1.1);
          } else if (humanHit) {
            Kit.track.miss();
            showBanner('مفاجأة! 💥', 0.95);
          }
        }
        if (view) view.burst(ev.x, 1.4, ev.z, 26, [0xff3d7f, 0xffe066, 0x29e3ff, 0x2ee06c, 0xffffff], 13, 10, 0.34, 0.78);
      } else if (ev.type === 'rocket') {
        if (isHuman) { J.whoosh(1.0); showBanner('صاروخ التيربو! 🚀', 1.0); if (view) view.shake(0.7); }
        if (view) view.burst(ev.x, 0.8, ev.z, 14, [0xff5a36, 0xffe066, 0xffffff], 9, 5, 0.32, 0.5);
      } else if (ev.type === 'shield') {
        if (isHuman) { J.chime(3); showBanner('درع المطاط! 🛡️', 1.0); }
      } else if (ev.type === 'inkDrop' && isHuman) {
        J.pop(0.5);
      } else if (ev.type === 'inkHit') {
        if (isHuman) {
          J.impact(0.6);
          Kit.track.miss();
          showBanner('بقعة حبر! 💧', 0.9);
          if (view) view.shake(0.6);
        }
        if (view) view.burst(ev.x, 0.7, ev.z, 12, [0x2c1d6b, 0x6247aa, 0x99aaff], 7, 6, 0.28, 0.52);
      } else if (ev.type === 'eraser') {
        if (isHuman) { J.pop(0.85); if (view) view.shake(0.45); }
        if (view) view.burst(ev.x, 0.9, ev.z, 10, [0xff77a9, 0x3ba7ff, 0xffffff], 7, 6, 0.25, 0.45);
      } else if (ev.type === 'wall' && isHuman) {
        J.impact(ev.power * 0.45);
        if (view) view.shake(ev.power * 0.28);
      } else if (ev.type === 'bump' && (ev.a === 0 || ev.b === 0 || (w.duo && (ev.a === 1 || ev.b === 1)))) {
        J.impact(0.42);
      } else if (ev.type === 'warp') {
        J.jump(0.9);
        showBanner('تلحّق سريع! ✨', 0.95);
        if (view) view.burst(ev.x, 1.2, ev.z, 14, [0x38e890, 0xffe066, 0xffffff], 8, 6, 0.3, 0.5);
      } else if (ev.type === 'lap' && isHuman) {
        J.chime(ev.lap + 1);
        showBanner(ev.lap === E.LAPS - 1 ? 'اللفة الأخيرة! 🏁' : ('اللفة ' + (ev.lap + 1) + '/' + E.LAPS), 1.35);
      } else if (ev.type === 'raceOver') {
        openResult(ev.summary);
      }
    }
    w.ev.length = 0;
  }

  /* --------------------------------------------------------------- HUD & Minimap */
  function updateHUD(force) {
    if (!world) return;
    var p1 = world.karts[0];
    var p2 = world.karts[1];
    if (force || hudCache.trackId !== world.L.id) {
      hudCache.trackId = world.L.id;
      $('hudTrackId').textContent = world.L.id;
      $('hudTrackName').textContent = world.L.name;
    }
    if (force || hudCache.place !== p1.place) {
      hudCache.place = p1.place;
      $('hudPlace').textContent = p1.place + '/4';
      var pw = $('hudPlaceWrap');
      pw.className = 'pill place-pill p' + p1.place + (p1.place === 1 ? 'st' : (p1.place === 2 ? 'nd' : (p1.place === 3 ? 'rd' : 'th')));
    }
    var dispLap = Math.min(E.LAPS, p1.lap + 1);
    if (force || hudCache.lap !== dispLap) {
      hudCache.lap = dispLap;
      $('hudLap').textContent = dispLap + '/' + E.LAPS;
    }
    if (force || hudCache.coins !== p1.coins) {
      hudCache.coins = p1.coins;
      $('hudCoins').textContent = String(p1.coins);
    }
    var kmh = Math.round(Math.abs(p1.speed) * 3.6);
    var boosted = p1.boostT > 0;
    if (force || hudCache.speed !== kmh || hudCache.boost !== boosted) {
      hudCache.speed = kmh;
      hudCache.boost = boosted;
      $('hudSpeed').textContent = String(kmh);
      $('hudSpeedWrap').classList.toggle('boost', boosted);
    }
    var i1 = p1.item || '';
    if (force || hudCache.p1Item !== i1) {
      hudCache.p1Item = i1;
      $('p1ItemIco').textContent = i1 ? ITEM_ICONS[i1] : '?';
      $('p1ItemSlot').classList.toggle('ready', !!i1);
      $('p1ItemSlot').classList.toggle('empty', !i1);
    }
    if (duo) {
      var i2 = p2.item || '';
      if (force || hudCache.p2Item !== i2) {
        hudCache.p2Item = i2;
        $('p2ItemIco').textContent = i2 ? ITEM_ICONS[i2] : '?';
        $('p2ItemSlot').classList.toggle('ready', !!i2);
        $('p2ItemSlot').classList.toggle('empty', !i2);
      }
    }
  }

  function drawMinimap() {
    if (!world || !mapCtx) return;
    var L = world.L;
    var w = mapCanvas.width, h = mapCanvas.height;
    mapCtx.clearRect(0, 0, w, h);

    var b = L.bounds;
    var spanX = Math.max(1, b.maxX - b.minX + 18);
    var spanZ = Math.max(1, b.maxZ - b.minZ + 18);
    var scale = Math.min((w - 16) / spanX, (h - 16) / spanZ);
    var cx = (b.minX + b.maxX) * 0.5;
    var cz = (b.minZ + b.maxZ) * 0.5;
    function mx(x) { return w * 0.5 + (x - cx) * scale; }
    function my(z) { return h * 0.5 + (z - cz) * scale; }

    mapCtx.beginPath();
    for (var i = 0; i < L.samples.length; i += 3) {
      var sx = mx(L.samples[i].x), sy = my(L.samples[i].z);
      if (i === 0) mapCtx.moveTo(sx, sy); else mapCtx.lineTo(sx, sy);
    }
    mapCtx.closePath();
    mapCtx.lineWidth = 7;
    mapCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    mapCtx.stroke();
    mapCtx.lineWidth = 3.5;
    mapCtx.strokeStyle = '#ffffff';
    mapCtx.stroke();

    // Draw all 4 kart dots (humans larger with dark outline)
    for (i = world.karts.length - 1; i >= 0; i--) {
      var k = world.karts[i];
      var kx = mx(k.x), ky = my(k.z);
      mapCtx.beginPath();
      mapCtx.arc(kx, ky, k.human ? 4.8 : 3.4, 0, Math.PI * 2);
      mapCtx.fillStyle = '#' + ('000000' + k.color.toString(16)).slice(-6);
      mapCtx.fill();
      mapCtx.lineWidth = 1.6;
      mapCtx.strokeStyle = k.human ? '#ffffff' : '#182038';
      mapCtx.stroke();
    }
  }

  /* --------------------------------------------------------------- Loop */
  function update(dt) {
    if (resultLock > 0) resultLock = Math.max(0, resultLock - dt);

    if (mode === 'play' && world) {
      if (!Kit.hitstop.tick(dt)) {
        var inputs = readInputs();
        E.step(world, dt, inputs);
        handleEvents(world);
      }

      if (bannerT > 0) {
        bannerT -= dt;
        if (bannerT <= 0) $('banner').hidden = true;
      }

      // Gentle ghost hint only if player sits idle after start
      if (world.started && world.karts[0].speed < 1.2) {
        idleT += dt;
        if (idleT > 2.4) {
          $('ghostHint').hidden = false;
          $('ghostText').textContent = 'وجّه بـ ← → واضغط مسافة للسلاح!';
        }
      } else {
        idleT = 0;
        $('ghostHint').hidden = true;
      }

      updateHUD(false);
      drawMinimap();
      if (view) view.sync(world, dt, snapCam, false);
      snapCam = false;
      dirty = true;
    } else if ((mode === 'title' || mode === 'tracks' || mode === 'garage') && demo) {
      E.step(demo, dt, []);
      demo.ev.length = 0;
      if (view) view.sync(demo, dt, snapCam, true);
      snapCam = false;
      dirty = true;
    }

    Kit.keys.endFrame();
  }

  function render() {
    if (!view || contextLost || !dirty) return;
    // Keep last paused frame untouched without redrawing while paused!
    if (mode === 'pause' && !dirty) return;
    if (!view.mayDraw(performance.now(), mode === 'play')) return;
    view.render();
    drawCount++;
    dirty = false;
  }

  /* --------------------------------------------------------------- Events & Buttons */
  $('btnPlay').addEventListener('click', function () { J.select(); startRace(selectedTrack); });
  $('btnDuo').addEventListener('click', function () {
    duo = !duo;
    J.toggle(duo);
    refreshTitleUI();
  });
  $('btnTracks').addEventListener('click', function () { J.select(); buildTracksUI(); setMode('tracks'); });
  $('btnTracksBack').addEventListener('click', function () { J.back(); setMode('title'); });
  $('btnGarage').addEventListener('click', function () { J.select(); buildGarageUI(); setMode('garage'); });
  $('btnGarageBack').addEventListener('click', function () { J.back(); setMode('title'); });
  $('btnPause').addEventListener('click', pauseGame);
  $('btnResume').addEventListener('click', resumeGame);
  $('btnRestart').addEventListener('click', function () { J.select(); startRace(selectedTrack); });
  $('btnHome').addEventListener('click', goHome);
  $('btnAgain').addEventListener('click', function () { J.select(); startRace(selectedTrack); });
  $('btnNext').addEventListener('click', function () {
    J.select();
    startRace(Math.min(E.TRACKS.length - 1, selectedTrack + 1));
  });
  $('btnResHome').addEventListener('click', goHome);
  canvas.addEventListener('pointerdown', function (e) {
    focusCanvas();
    if (mode === 'play' && world && !duo && e.button === 0) pointerFire = true;
  });

  window.addEventListener('keydown', function (e) {
    if (e.repeat || !Kit.isGameKeyEvent(e)) return;
    if (mode === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); J.select(); startRace(selectedTrack); }
    } else if (mode === 'play') {
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); pauseGame(); }
      else if (e.code === 'KeyR') { e.preventDefault(); J.select(); startRace(selectedTrack); }
    } else if (mode === 'pause') {
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); resumeGame(); }
      else if (e.code === 'KeyR') { e.preventDefault(); J.select(); startRace(selectedTrack); }
    } else if (mode === 'result') {
      if (resultLock <= 0 && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR')) {
        e.preventDefault();
        J.select();
        startRace(selectedTrack);
      }
    } else if (mode === 'tracks' || mode === 'garage') {
      if (e.code === 'Escape') { e.preventDefault(); J.back(); setMode('title'); }
    }
  });

  /* --------------------------------------------------------------- Resize, Motion, Lifecycle */
  function resize() {
    if (!view) return;
    view.resize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
    dirty = true;
    if (mode === 'pause') render();
  }
  window.addEventListener('resize', resize);

  Kit.motion.onChange(function (reduced) {
    if (view) view.calm = reduced;
  });

  Kit.muteButton();
  Kit.lifecycle({
    pause: function () { if (mode === 'play') pauseGame(); },
    reset: function () { pointerFire = false; }
  });

  Kit.webgl.watchContext(canvas, {
    notice: 'ctxNotice',
    onLost: function () { contextLost = true; },
    onRestored: function () { contextLost = false; dirty = true; }
  });

  /* --------------------------------------------------------------- Debug / Test Handle */
  function snapshotState() {
    var w = world || demo;
    var p1 = w ? w.karts[0] : null;
    var aim = (w && p1) ? E.sampleAt(w.L, p1.s + 11) : null;
    return {
      screen: mode,
      duo: duo,
      trackIdx: selectedTrack,
      id: w ? w.id : E.TRACKS[selectedTrack].id,
      worldTime: w ? w.worldTime : 0,
      time: w ? w.time : 0,
      started: w ? w.started : false,
      finished: w ? w.finished : false,
      p1Dist: w ? w.p1Dist : 0,
      laps: E.LAPS,
      projectiles: w && w.projectiles ? w.projectiles.length : 0,
      cam: view && view.camInfo ? view.camInfo() : null,
      draws: drawCount,
      karts: w ? w.karts.map(function (k) {
        return {
          id: k.id, x: Math.round(k.x * 100) / 100, y: Math.round(k.y * 100) / 100, z: Math.round(k.z * 100) / 100,
          ang: Math.round(k.ang * 1000) / 1000, speed: Math.round(k.speed * 100) / 100,
          lap: k.lap, place: k.place, coins: k.coins, item: k.item, hitsLanded: k.hitsLanded || 0,
          drifting: k.drifting, driftStage: k.driftStage, boostT: k.boostT, shieldT: k.shieldT, spinT: k.spinT, finished: k.finished
        };
      }) : [],
      aim: aim ? { x: aim.x, z: aim.z } : null,
      save: save
    };
  }

  window.__game = {
    get state() { return snapshotState(); },
    selectTrack: function (idx) { selectedTrack = E.clamp(idx | 0, 0, E.TRACKS.length - 1); },
    setDuo: function (on) { duo = !!on; refreshTitleUI(); }
  };

  /* --------------------------------------------------------------- Non-Blocking Fast Boot */
  refreshTitleUI();
  initDemo();

  try {
    view = A.createView(canvas);
    view.calm = Kit.motion.reduced();
    resize();
    view.sync(demo, E.FIXED_DT, true, true);
    live = true;
    loop = Kit.loop(update, render);
    Kit.ready();
  } catch (err) {
    $('scrTitle').hidden = true;
    $('scrError').hidden = false;
    Kit.ready();
  }
})();
