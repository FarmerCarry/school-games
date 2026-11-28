/* Hoop Heads 3D (سلة الرؤوس الكبيرة) — UI controller, keyboard input, HUD, Locker, Kit DDA/stats/juice.
 * Pure deterministic physics lives in engine.js; 3D Three.js renderer lives in art.js. Zero BGM! */
(function () {
  'use strict';

  var E = window.HoopHeadsEngine;
  var A = window.HoopHeadsArt;
  var J = Kit.juice;
  function $(id) { return document.getElementById(id); }

  var canvas = $('game');
  var body = document.body;

  /* --------------------------------------------------------------- Save & DDA */
  var store = Kit.store('hoop-heads');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = E.loadSave(store.get('save_v3', null));
  function persist() {
    if (store.set('save_v3', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }

  var dda = Kit.dda('hoop-heads', { id: 'main', target: 0.72, tiers: 5 });

  /* --------------------------------------------------------------- App State */
  var state = 'title'; // 'title' | 'shop' | 'play' | 'pause' | 'result'
  var selectedStage = save.unlocked;
  var match = null;
  var demo = null;
  var view = null;
  var loop = null;
  var contextLost = false;
  var dirty = true;
  var snapCam = true;
  var drawCount = 0;

  var roundOpen = false;
  var resultLock = 0;
  var calloutT = 0;
  var idleT = 0;
  var hasPlayerActed = false;
  var tutorialStarted = false;
  var tutorialDone = false;

  // Track edge-triggered shoot release & jump taps across frames + 1-hand Mouse/Pointer play!
  var prevS = [false, false];
  var prevJ = [false, false];
  var ptr = { follow: false, courtX: 640, down: false, pressed: false, released: false, jumpPressed: false };
  var hudCache = { s1: -1, s2: -1, sup1: -1, sup2: -1, clock: '', ot: false, urgent: false, pw1: '', pw2: '' };

  function resetPtr() {
    ptr.follow = false; ptr.down = false; ptr.pressed = false; ptr.released = false; ptr.jumpPressed = false;
  }
  function clientToCourt(cx, cy) {
    var r = canvas.getBoundingClientRect();
    var w = Math.max(1, r.width), h = Math.max(1, r.height);
    return { x: ((cx - r.left) / w) * E.COURT_W, y: ((cy - r.top) / h) * E.COURT_H };
  }

  function say(txt) { $('live').textContent = txt; }
  function focusCanvas() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }

  /* --------------------------------------------------------------- Screens */
  var SCREENS = { title: 'scrTitle', shop: 'scrShop', pause: 'scrPause', result: 'scrResult' };
  function setState(next) {
    state = next;
    body.dataset.mode = next;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== next;
    $('hud').hidden = !(next === 'play' || next === 'pause');
    if (next !== 'play') {
      $('shotGauge').hidden = true;
      $('orbTag').hidden = true;
      $('ghostHint').hidden = true;
      $('callout').hidden = true;
    }
    dirty = true;
    if (next === 'play') focusCanvas();
  }

  function showCallout(text, kind, dur) {
    var el = $('callout');
    el.textContent = text;
    el.className = kind || '';
    el.hidden = false;
    calloutT = dur || 1.15;
  }

  function refreshTitleUI() {
    selectedStage = E.clamp(selectedStage, 0, E.OPPONENTS.length - 1);
    $('titleStars').querySelector('b').textContent = E.totalStars(save) + '/' + (E.OPPONENTS.length * 3);
    $('titleCoins').querySelector('b').textContent = Kit.fmt(save.coins);
    $('titleBest').querySelector('b').textContent = Kit.fmt(save.bestScore);

    var opp = E.OPPONENTS[selectedStage];
    $('stageText').textContent = (selectedStage + 1) + '/' + E.OPPONENTS.length + ' · ' + opp.title + ' — ' + opp.name;
    var dots = $('stageDots');
    dots.innerHTML = '';
    for (var i = 0; i < E.OPPONENTS.length; i++) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'stage-dot unlocked' + (save.stars[i] > 0 ? ' beaten' : '') + (i === selectedStage ? ' active' : '');
      dot.setAttribute('aria-label', E.OPPONENTS[i].title);
      dot.addEventListener('click', (function (idx) {
        return function () {
          selectedStage = idx;
          J.tap();
          refreshTitleUI();
          initDemo();
        };
      })(i));
      dots.appendChild(dot);
    }
    $('stagePrev').disabled = selectedStage <= 0;
    $('stageNext').disabled = selectedStage >= E.OPPONENTS.length - 1;
  }

  function buildShopUI() {
    $('shopCoins').querySelector('b').textContent = Kit.fmt(save.coins);

    var bGrid = $('ballGrid');
    bGrid.innerHTML = '';
    for (var bi = 0; bi < E.BALLS.length; bi++) {
      var b = E.BALLS[bi];
      var bOwned = !!save.ownedBalls[b.id];
      var bActive = save.ball === b.id;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shop-item' + (bActive ? ' active' : '') + (!bOwned ? ' locked' : '');
      btn.dataset.ball = b.id;
      btn.innerHTML =
        '<span class="shop-ico">' + b.icon + '</span>' +
        '<span class="shop-name">' + b.name + '</span>' +
        '<span class="shop-tag">' + (bActive ? 'مُختار ✓' : (bOwned ? 'اختيار' : '🪙 ' + b.cost)) + '</span>';
      btn.addEventListener('click', (function (id) {
        return function () {
          var res = E.buyOrEquipBall(save, id);
          if (res.ok) {
            if (res.bought) J.chime(2); else J.select();
            persist();
            initDemo();
            buildShopUI();
            refreshTitleUI();
          } else {
            J.error();
          }
        };
      })(b.id));
      bGrid.appendChild(btn);
    }

    var hGrid = $('headGrid');
    hGrid.innerHTML = '';
    for (var hi = 0; hi < E.HEADS.length; hi++) {
      var h = E.HEADS[hi];
      var hOwned = !!save.ownedHeads[h.id];
      var hActive = save.head === h.id;
      var hbtn = document.createElement('button');
      hbtn.type = 'button';
      hbtn.className = 'shop-item' + (hActive ? ' active' : '') + (!hOwned ? ' locked' : '');
      hbtn.dataset.head = h.id;
      hbtn.innerHTML =
        '<span class="shop-ico">' + h.icon + '</span>' +
        '<span class="shop-name">' + h.name + '</span>' +
        '<span class="shop-tag">' + (hActive ? 'مُختار ✓' : (hOwned ? 'اختيار' : '🪙 ' + h.cost)) + '</span>';
      hbtn.addEventListener('click', (function (id) {
        return function () {
          var res = E.buyOrEquipHead(save, id);
          if (res.ok) {
            if (res.bought) J.chime(2); else J.select();
            persist();
            initDemo();
            buildShopUI();
            refreshTitleUI();
          } else {
            J.error();
          }
        };
      })(h.id));
      hGrid.appendChild(hbtn);
    }
  }

  /* --------------------------------------------------------------- Demo & Match Lifecycle */
  function initDemo() {
    demo = E.createMatch({
      mode: 'demo',
      stage: selectedStage,
      head: save.head,
      ball: save.ball,
      seed: 4242 + selectedStage * 31
    });
    demo.phase = 'play';
    demo.time = 9999;
    demo.powerSpawnT = 1.6;
    demo.players[0].x = 290;
    demo.players[1].x = 990;
    demo.ball.holder = demo.players[0];
    demo.ball.state = 'held';
    snapCam = true;
    dirty = true;
  }

  function closeOpenRoundAsQuit() {
    if (roundOpen) {
      Kit.stats.end('quit');
      roundOpen = false;
    }
  }

  function startMatch(opts) {
    opts = opts || {};
    var mMode = opts.mode === 'duo' ? 'duo' : 'cpu';
    var stage = opts.stage != null ? E.clamp(opts.stage | 0, 0, E.OPPONENTS.length - 1) : selectedStage;
    selectedStage = stage;

    closeOpenRoundAsQuit();

    var ddaVal = mMode === 'cpu' ? dda.level : 0.35;
    match = E.createMatch({
      mode: mMode,
      stage: stage,
      head: save.head,
      ball: save.ball,
      dda: ddaVal,
      aiSkill: opts.aiSkill,
      target: opts.target || 0,
      duration: opts.duration || E.MATCH_SECONDS,
      seed: opts.seed || ((Date.now() & 0xffff) + stage * 131)
    });

    prevS[0] = prevS[1] = false;
    prevJ[0] = prevJ[1] = false;
    resetPtr();
    Kit.hitstop.reset();
    Kit.keys.reset();

    hudCache.s1 = hudCache.s2 = hudCache.sup1 = hudCache.sup2 = -1;
    hudCache.clock = ''; hudCache.pw1 = ''; hudCache.pw2 = '';
    $('hudPw1').hidden = true; $('hudPw2').hidden = true;
    $('orbTag').hidden = true;
    $('hudP1Name').textContent = match.players[0].name;
    $('hudP2Name').textContent = match.players[1].name;

    idleT = 0;
    hasPlayerActed = false;
    tutorialStarted = false;
    tutorialDone = false;
    snapCam = true;

    Kit.stats.round(mMode === 'duo' ? 'duo' : ('stage-' + (stage + 1)));
    roundOpen = true;

    setState('play');
    showCallout(mMode === 'duo' ? 'لاعب 1 ضد لاعب 2! 🏀' : ('تحدّي ' + match.players[1].name + '! 🏀'), 'blue', 1.1);
    updateHUD();
    say('بدأت المباراة');
  }

  function pauseGame() {
    if (state !== 'play') return;
    setState('pause');
    dirty = true;
    say('إيقاف مؤقت');
  }

  function resumeGame() {
    if (state !== 'pause') return;
    prevS[0] = prevS[1] = false;
    prevJ[0] = prevJ[1] = false;
    resetPtr();
    Kit.keys.reset();
    setState('play');
    say('متابعة اللعب');
  }

  function goHome() {
    closeOpenRoundAsQuit();
    match = null;
    initDemo();
    refreshTitleUI();
    setState('title');
  }

  function showResult(m) {
    var rew = E.applyMatchResult(save, m);
    if (m.mode === 'cpu') persist();

    if (roundOpen) {
      if (m.mode === 'duo') {
        Kit.stats.end(m.winner === -1 ? 'draw' : 'end');
      } else {
        Kit.stats.end(rew.won ? 'win' : 'lose', rew.score);
        // Report smooth 0..1 performance outcome to Kit.dda
        var ddaOut = rew.won ? (rew.margin >= 6 ? 1.0 : 0.78) : (rew.margin >= -4 ? 0.35 : 0.10);
        dda.result(ddaOut);
      }
      roundOpen = false;
    }

    var banner = $('resBanner');
    if (m.mode === 'duo') {
      banner.textContent = m.winner === 0 ? '🏆 فاز اللاعب 1!' : '🏆 فاز اللاعب 2!';
      banner.classList.remove('lose');
    } else if (rew.won) {
      banner.textContent = m.stage === E.OPPONENTS.length - 1 ? '👑 بطل السلة الأعظم!' : '🏆 فوز رائع!';
      banner.classList.remove('lose');
    } else {
      banner.textContent = '💪 حاول مجدداً!';
      banner.classList.add('lose');
    }

    var starsWrap = $('resStars');
    starsWrap.hidden = m.mode === 'duo';
    var stEls = starsWrap.querySelectorAll('.st');
    for (var i = 0; i < 3; i++) stEls[i].classList.toggle('on', i < rew.stars);

    $('resS1').textContent = String(m.players[0].score);
    $('resS2').textContent = String(m.players[1].score);
    $('resBestBadge').hidden = !rew.isNewBest;

    var rewWrap = $('resRewards');
    rewWrap.innerHTML = '';
    if (m.mode === 'cpu') {
      var cPill = document.createElement('span');
      cPill.className = 'pill coin-pill';
      cPill.innerHTML = '🪙 <b dir="ltr">+' + rew.coins + '</b>';
      rewWrap.appendChild(cPill);
      if (rew.unlockedNext) {
        var uPill = document.createElement('span');
        uPill.className = 'pill best-pill';
        uPill.textContent = '🔓 فُتح الخصم التالي!';
        rewWrap.appendChild(uPill);
      }
    }

    var hasNext = m.mode === 'cpu' && rew.won && m.stage < E.OPPONENTS.length - 1;
    $('rNext').hidden = !hasNext;

    // Next-unlock "Almost!" motivator bar
    var nu = $('resNextUnlock');
    var nextItem = null;
    for (var bi = 0; bi < E.BALLS.length; bi++) {
      if (!save.ownedBalls[E.BALLS[bi].id] && (!nextItem || E.BALLS[bi].cost < nextItem.cost)) nextItem = E.BALLS[bi];
    }
    for (var hi = 0; hi < E.HEADS.length; hi++) {
      if (!save.ownedHeads[E.HEADS[hi].id] && (!nextItem || E.HEADS[hi].cost < nextItem.cost)) nextItem = E.HEADS[hi];
    }
    if (m.mode === 'cpu' && nextItem) {
      var need = Math.max(0, nextItem.cost - save.coins);
      nu.textContent = need === 0
        ? ('🎉 يمكنك فتح ' + nextItem.icon + ' ' + nextItem.name + ' في الخزانة!')
        : ('قريب! ينقصك ' + need + ' 🪙 لفتح ' + nextItem.icon + ' ' + nextItem.name);
      nu.hidden = false;
    } else {
      nu.hidden = true;
    }

    if (rew.won || m.mode === 'duo') {
      J.levelUp();
      if (rew.stars >= 1) J.star(rew.stars);
      if (view) view.burst(640, 260, 42, [0xffcf26, 0x4ade80, 0x38bdf8, 0xff5a5f, 0xffffff], 9, 5);
    } else {
      J.fail();
    }

    resultLock = 0.40;
    setState('result');
    refreshTitleUI();
    say(banner.textContent);
  }

  /* --------------------------------------------------------------- Input Reading (Keyboard + 1-Hand Mouse) */
  function readPlayerInputs(m) {
    var k = Kit.keys;
    var isDuo = m.mode === 'duo';

    var kbL = k.down('KeyA') || (!isDuo && k.down('ArrowLeft'));
    var kbR = k.down('KeyD') || (!isDuo && k.down('ArrowRight'));
    if (kbL || kbR) ptr.follow = false;

    var p0L = kbL;
    var p0R = kbR;
    if (!isDuo && ptr.follow && !kbL && !kbR) {
      var diffX = ptr.courtX - m.players[0].x;
      if (diffX < -28) p0L = true;
      else if (diffX > 28) p0R = true;
    }

    var p0J = k.down('KeyW') || (!isDuo && k.down('ArrowUp'));
    var p0S = k.down('KeyS') || k.down('Space') || (!isDuo && (k.down('ArrowDown') || ptr.down));

    var j0Pressed = (p0J && !prevJ[0]) || k.pressed('KeyW') || (!isDuo && (k.pressed('ArrowUp') || ptr.jumpPressed));
    var s0Pressed = (p0S && !prevS[0]) || k.pressed('KeyS') || k.pressed('Space') || (!isDuo && (k.pressed('ArrowDown') || ptr.pressed));
    var s0Released = (!p0S && prevS[0]) || (!isDuo && ptr.released);
    prevJ[0] = p0J;
    prevS[0] = p0S;
    ptr.pressed = false;
    ptr.released = false;
    ptr.jumpPressed = false;

    if (p0L || p0R || p0J || p0S || j0Pressed || s0Pressed) {
      hasPlayerActed = true;
      idleT = 0;
      if (tutorialStarted && !tutorialDone) {
        tutorialDone = true;
        $('ghostHint').hidden = true;
        Kit.stats.tutorial('done');
      }
    }

    var p1L = isDuo && k.down('ArrowLeft');
    var p1R = isDuo && k.down('ArrowRight');
    var p1J = isDuo && k.down('ArrowUp');
    var p1S = isDuo && (k.down('ArrowDown') || k.down('Enter') || k.down('Numpad0'));

    var j1Pressed = isDuo && ((p1J && !prevJ[1]) || k.pressed('ArrowUp'));
    var s1Pressed = isDuo && ((p1S && !prevS[1]) || k.pressed('ArrowDown') || k.pressed('Enter') || k.pressed('Numpad0'));
    var s1Released = isDuo && !p1S && prevS[1];
    prevJ[1] = p1J;
    prevS[1] = p1S;

    return [
      { l: p0L, r: p0R, j: p0J, jPressed: j0Pressed, s: p0S, sPressed: s0Pressed, sReleased: s0Released },
      { l: p1L, r: p1R, j: p1J, jPressed: j1Pressed, s: p1S, sPressed: s1Pressed, sReleased: s1Released }
    ];
  }

  /* --------------------------------------------------------------- Events -> Juice & FX */
  function handleEvents(m, events) {
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'jump') {
        J.jump(0.7);
        if (view) view.burst(ev.x, ev.y, 7, [0xffffff, 0xffe8b6], 3.2, 1.8);
      } else if (ev.type === 'land') {
        J.land(ev.power * 0.6);
        if (view) view.burst(ev.x, ev.y, 6, [0xffe8b6, 0xffffff], 2.5, 1.2);
      } else if (ev.type === 'dribble') {
        J.tap();
      } else if (ev.type === 'bounce') {
        J.impact(ev.power * 0.45);
      } else if (ev.type === 'rim') {
        J.impact(ev.power * 0.65);
        if (view) view.burst(ev.x, ev.y, 6, [0xff9f1c, 0xffffff], 4, 2.2);
      } else if (ev.type === 'board') {
        J.impact(ev.power * 0.55);
      } else if (ev.type === 'shoot') {
        J.whoosh(ev.swishAim ? 0.85 : 0.55);
        if (ev.swishAim && view) view.burst(ev.x, ev.y, 10, [0x4ade80, 0xffe066], 4.5, 2.5);
      } else if (ev.type === 'dunk_launch') {
        J.whoosh(0.95);
        if (view) view.burst(ev.x, ev.y, 14, [0x38bdf8, 0xffe066, 0xffffff], 5.5, 3.5);
      } else if (ev.type === 'powerup_spawn') {
        J.pop(0.75);
        if (view) view.burst(ev.x, ev.y, 12, [0xffe066, 0xffffff, 0x38bdf8], 5, 2.5);
      } else if (ev.type === 'powerup') {
        Kit.hitstop(0.03);
        J.coin(3);
        J.chime(2);
        showCallout(ev.icon + ' ' + ev.name, ev.player === 0 ? 'blue' : 'fire', 1.25);
        if (view) {
          view.shake(0.20);
          view.burst(ev.x, ev.y, 24, [ev.color, 0xffe066, 0xffffff], 7.5, 3.8);
        }
      } else if (ev.type === 'ice_block') {
        J.chime(3);
        J.impact(0.7);
        showCallout('❄️ السلة مجمّدة!', 'blue', 0.9);
        if (view) {
          view.shake(0.22);
          view.burst(ev.x, ev.y, 20, [0x7dd3fc, 0x38bdf8, 0xffffff], 7, 3.2);
        }
      } else if (ev.type === 'super_dunk') {
        J.whoosh(1.0);
        J.chime(3);
        showCallout('☄️ دانك النيزك الناري!', 'fire', 1.25);
        if (view) {
          view.shake(0.38);
          view.burst(ev.x, ev.y, 26, [0xff6b00, 0xffe066, 0xff2a55, 0xffffff], 8, 4.5);
        }
      } else if (ev.type === 'lunge') {
        J.whoosh(0.45);
      } else if (ev.type === 'steal') {
        Kit.hitstop(0.03);
        J.pop(0.85);
        J.impact(0.6);
        if (ev.player === 0) Kit.track.hit(); else Kit.track.miss();
        showCallout('⚡ خطف ذكي!', 'blue', 0.85);
        if (view) {
          view.shake(0.22);
          view.burst(ev.x, ev.y, 16, [0x38bdf8, 0xffe066, 0xffffff], 6, 3.2);
        }
      } else if (ev.type === 'block') {
        Kit.hitstop(0.04);
        J.impact(0.9);
        J.pop(0.9);
        if (ev.player === 0) Kit.track.hit();
        showCallout('🛡️ صدّ رائع!', 'blue', 0.9);
        if (view) {
          view.shake(0.30);
          view.burst(ev.x, ev.y, 20, [0x22d3ee, 0xffffff, 0xffe066], 7, 3.8);
        }
      } else if (ev.type === 'miss') {
        if (ev.player === 0) Kit.track.miss();
      } else if (ev.type === 'score') {
        if (ev.scorer === 0) Kit.track.hit();
        if (ev.isSuper) {
          Kit.hitstop(0.065);
          J.impact(1.0);
          J.chime(3);
          showCallout('🔥 +' + ev.pts + ' دانك النيزك!', 'fire', 1.15);
          if (view) {
            view.shake(0.60);
            view.burst(ev.x, ev.y, 40, [0xff6b00, 0xffe066, 0xff3d00, 0xffffff], 10, 5);
          }
        } else if (ev.dunk) {
          Kit.hitstop(0.05);
          J.impact(0.95);
          J.chime(2);
          showCallout('💥 سلام دانك! +' + ev.pts, '', 1.0);
          if (view) {
            view.shake(0.42);
            view.burst(ev.x, ev.y, 30, [0xffcf26, 0x38bdf8, 0x4ade80, 0xffffff], 8.5, 4.2);
          }
        } else if (ev.swish) {
          Kit.hitstop(0.035);
          J.whoosh(0.9);
          J.chime(ev.pts >= 3 ? 3 : 2);
          J.streak(ev.pts >= 3 ? 5 : 3);
          showCallout(ev.isMega ? ('🏀 عملاقة مثالية! +' + ev.pts) : (ev.pts >= 3 ? '✨ ثلاثية مثالية! +' + ev.pts : '✨ سويش مثالي! +' + ev.pts), '', 1.05);
          if (view) {
            view.shake(0.24);
            view.burst(ev.x, ev.y, 28, [0x4ade80, 0xffe066, 0xffffff], 7.5, 4.0);
          }
        } else {
          J.whoosh(0.65);
          J.chime(1);
          showCallout((ev.isMega ? '🏀 كرة عملاقة! +' : (ev.pts >= 3 ? '🔥 ثلاثية! +' : '🏀 سلة! +')) + ev.pts, ev.scorer === 0 ? 'blue' : '', 0.9);
          if (view) {
            view.shake(0.14);
            view.burst(ev.x, ev.y, 20, [0xffe066, 0x38bdf8, 0xff7a18], 6.5, 3.2);
          }
        }
      } else if (ev.type === 'overtime') {
        J.countdown(0);
        showCallout('🔥 وقت إضافي! أول سلة تفوز!', 'fire', 1.6);
      } else if (ev.type === 'buzzer') {
        J.countdown(0);
      } else if (ev.type === 'end') {
        showResult(m);
      }
    }
  }

  /* --------------------------------------------------------------- HUD Sync */
  function updateHUD() {
    if (!match) return;
    var p0 = match.players[0];
    var p1 = match.players[1];
    if (hudCache.s1 !== p0.score) { hudCache.s1 = p0.score; $('hudS1').textContent = String(p0.score); }
    if (hudCache.s2 !== p1.score) { hudCache.s2 = p1.score; $('hudS2').textContent = String(p1.score); }

    var sup1 = Math.round(p0.super);
    if (hudCache.sup1 !== sup1) {
      hudCache.sup1 = sup1;
      var f1 = $('hudSup1');
      f1.style.width = sup1 + '%';
      f1.classList.toggle('ready', sup1 >= 100);
      $('hudSupRow1').classList.toggle('ready', sup1 >= 100);
    }
    var sup2 = Math.round(p1.super);
    if (hudCache.sup2 !== sup2) {
      hudCache.sup2 = sup2;
      var f2 = $('hudSup2');
      f2.style.width = sup2 + '%';
      f2.classList.toggle('ready', sup2 >= 100);
      $('hudSupRow2').classList.toggle('ready', sup2 >= 100);
    }

    var clkText = match.overtime ? 'إضافي!' : String(Math.ceil(match.time));
    var isUrgent = !match.overtime && match.time <= 10;
    if (hudCache.clock !== clkText || hudCache.ot !== match.overtime || hudCache.urgent !== isUrgent) {
      hudCache.clock = clkText;
      hudCache.ot = match.overtime;
      hudCache.urgent = isUrgent;
      $('hudClock').textContent = clkText;
      var cw = $('hudClockWrap');
      cw.classList.toggle('overtime', match.overtime);
      cw.classList.toggle('urgent', isUrgent);
    }

    // Active Power-Up pills for P1 and P2
    function pwText(pl, myHoop, targetHoop) {
      var parts = [];
      if (pl.megaT > 0) parts.push('🏀 ' + Math.ceil(pl.megaT) + 's');
      if (pl.rocketT > 0) parts.push('🚀 ' + Math.ceil(pl.rocketT) + 's');
      if (pl.magnetT > 0) parts.push('🧲 ' + Math.ceil(pl.magnetT) + 's');
      if (myHoop.frozenT > 0) parts.push('❄️ ' + Math.ceil(myHoop.frozenT) + 's');
      if (targetHoop.bigRimT > 0) parts.push('⭕ ' + Math.ceil(targetHoop.bigRimT) + 's');
      return parts.join(' ');
    }
    var pw1 = pwText(p0, match.hoops[0], match.hoops[1]);
    if (hudCache.pw1 !== pw1) {
      hudCache.pw1 = pw1;
      var e1 = $('hudPw1');
      e1.hidden = !pw1;
      if (pw1) e1.textContent = pw1;
    }
    var pw2 = pwText(p1, match.hoops[1], match.hoops[0]);
    if (hudCache.pw2 !== pw2) {
      hudCache.pw2 = pw2;
      var e2 = $('hudPw2');
      e2.hidden = !pw2;
      if (pw2) e2.textContent = pw2;
    }

    // World-Space Shot Power Arc right beside the charging player!
    var charger = null;
    if (state === 'play' && match.phase === 'play') {
      if (p0.ctrl === 'human' && p0.charging) charger = p0;
      else if (p1.ctrl === 'human' && p1.charging) charger = p1;
    }
    var gauge = $('shotGauge');
    if (charger) {
      gauge.hidden = false;
      var pct = Math.round(charger.charge * 100);
      $('gaugeFill').style.height = pct + '%';
      $('gaugePin').style.bottom = pct + '%';
      var inSweet = charger.charge >= E.SWEET_MIN && charger.charge <= E.SWEET_MAX;
      gauge.classList.toggle('sweet', inSweet);
      $('gaugeLbl').textContent = inSweet ? '✨ مثالية!' : 'أطلق!';
      if (view && view.project) {
        var gp = view.project(charger.x - charger.dir * 66, charger.y - 84);
        var gx = E.clamp(gp.x, 48, Math.max(48, window.innerWidth - 48));
        var gy = E.clamp(gp.y, 92, Math.max(92, window.innerHeight - 64));
        gauge.style.left = Math.round(gx) + 'px';
        gauge.style.top = Math.round(gy) + 'px';
      }
    } else {
      gauge.hidden = true;
    }

    // World-Space Floating Power-Up Orb Icon
    var orbEl = $('orbTag');
    if (state === 'play' && match.powerup && view && view.project) {
      var pw = match.powerup;
      var bobY = pw.y + Math.sin(pw.t * 4.2) * 14;
      var op = view.project(pw.x, bobY - 46);
      orbEl.textContent = pw.icon + ' ' + pw.name;
      orbEl.style.borderColor = pw.hex;
      orbEl.style.left = Math.round(E.clamp(op.x, 80, Math.max(80, window.innerWidth - 80))) + 'px';
      orbEl.style.top = Math.round(E.clamp(op.y, 82, Math.max(82, window.innerHeight - 40))) + 'px';
      orbEl.hidden = false;
    } else {
      orbEl.hidden = true;
    }
  }

  /* --------------------------------------------------------------- Main Loop */
  function update(dt) {
    if (resultLock > 0) resultLock = Math.max(0, resultLock - dt);
    if (calloutT > 0) {
      calloutT = Math.max(0, calloutT - dt);
      if (calloutT <= 0) $('callout').hidden = true;
    }

    if (state === 'title' || state === 'shop') {
      if (!demo) initDemo();
      E.stepMatch(demo, dt);
      if (demo.done || demo.time < 50) { demo.time = 9999; demo.done = false; }
      dirty = true;
    } else if (state === 'play' && match) {
      if (Kit.hitstop.tick(dt)) {
        dirty = true;
        Kit.keys.endFrame();
        return;
      }
      var inputs = readPlayerInputs(match);
      var evs = E.stepMatch(match, dt, inputs);
      handleEvents(match, evs);
      updateHUD();

      // Gentle ghost keycap hint if child sits idle during first 10 seconds
      if (match.phase === 'play' && !hasPlayerActed && match.mode === 'cpu') {
        idleT += dt;
        if (idleT >= 2.8 && !tutorialStarted) {
          tutorialStarted = true;
          $('ghostHint').hidden = false;
          Kit.stats.tutorial('start');
        }
      }
      dirty = true;
    }
    Kit.keys.endFrame();
  }

  function render() {
    if (!view || contextLost) return;
    var active = state === 'play' || state === 'pause' || state === 'result' ? (match || demo) : demo;
    if (!active) return;

    // Paused matches draw once then rest until dirty (resize / restore / motion / resume)!
    if (state === 'pause' && !dirty) return;

    var bypassPace = state === 'play' || (state === 'pause' && dirty);
    if (!view.mayDraw(performance.now(), bypassPace)) return;

    view.sync(active, E.FIXED_DT, snapCam);
    snapCam = false;
    view.render();
    drawCount++;
    dirty = false;
  }

  /* --------------------------------------------------------------- DOM Events */
  $('playBtn').addEventListener('click', function () {
    J.select();
    startMatch({ mode: 'cpu', stage: selectedStage });
  });
  $('duoBtn').addEventListener('click', function () {
    J.select();
    startMatch({ mode: 'duo', stage: selectedStage });
  });
  $('shopBtn').addEventListener('click', function () {
    J.select();
    buildShopUI();
    setState('shop');
  });
  $('shopBack').addEventListener('click', function () {
    J.back();
    setState('title');
  });
  $('stagePrev').addEventListener('click', function () {
    if (selectedStage > 0) {
      selectedStage--;
      J.tap();
      refreshTitleUI();
      initDemo();
    }
  });
  $('stageNext').addEventListener('click', function () {
    if (selectedStage < E.OPPONENTS.length - 1) {
      selectedStage++;
      J.tap();
      refreshTitleUI();
      initDemo();
    }
  });

  // 1-Hand Mouse / Pointer Play on canvas (in 1P CPU mode)
  canvas.addEventListener('pointermove', function (e) {
    if (state !== 'play' || !match || match.mode === 'duo') return;
    var pt = clientToCourt(e.clientX, e.clientY);
    ptr.courtX = pt.x;
    ptr.follow = true;
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (state !== 'play' || !match || match.mode === 'duo') return;
    var pt = clientToCourt(e.clientX, e.clientY);
    ptr.courtX = pt.x;
    ptr.follow = true;
    if (e.button === 2) {
      ptr.jumpPressed = true;
      return;
    }
    if (pt.y < 370) ptr.jumpPressed = true;
    ptr.down = true;
    ptr.pressed = true;
  });
  window.addEventListener('pointerup', function (e) {
    if (e.button === 2) return;
    if (ptr.down) {
      ptr.down = false;
      ptr.released = true;
    }
  });
  window.addEventListener('pointercancel', resetPtr);

  $('pauseBtn').addEventListener('click', function () { J.tap(); pauseGame(); });
  $('pResume').addEventListener('click', function () { J.select(); resumeGame(); });
  $('pRestart').addEventListener('click', function () {
    J.select();
    startMatch({ mode: match ? match.mode : 'cpu', stage: selectedStage });
  });
  $('pHome').addEventListener('click', function () { J.back(); goHome(); });

  $('rNext').addEventListener('click', function () {
    J.select();
    selectedStage = Math.min(E.OPPONENTS.length - 1, selectedStage + 1);
    startMatch({ mode: 'cpu', stage: selectedStage });
  });
  $('rAgain').addEventListener('click', function () {
    J.select();
    startMatch({ mode: match ? match.mode : 'cpu', stage: selectedStage });
  });
  $('rHome').addEventListener('click', function () { J.back(); goHome(); });

  window.addEventListener('keydown', function (e) {
    if (e.repeat || !Kit.isGameKeyEvent(e)) return;
    if (state === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        J.select();
        startMatch({ mode: 'cpu', stage: selectedStage });
      }
    } else if (state === 'shop') {
      if (e.code === 'Escape') {
        e.preventDefault();
        J.back();
        setState('title');
      }
    } else if (state === 'play') {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        pauseGame();
      }
    } else if (state === 'pause') {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        resumeGame();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        J.select();
        startMatch({ mode: match ? match.mode : 'cpu', stage: selectedStage });
      }
    } else if (state === 'result') {
      if (resultLock <= 0 && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR')) {
        e.preventDefault();
        J.select();
        startMatch({ mode: match ? match.mode : 'cpu', stage: selectedStage });
      }
    }
  });

  /* --------------------------------------------------------------- Resize, Motion & Lifecycle */
  function resize() {
    if (!view) return;
    view.resize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
    dirty = true;
    if (state === 'pause') render();
  }
  window.addEventListener('resize', resize);

  Kit.motion.onChange(function (reduced) {
    if (view) view.calm = reduced;
    dirty = true;
    if (state === 'pause') render();
  });

  Kit.muteButton();
  Kit.lifecycle({
    pause: function () { if (state === 'play') pauseGame(); },
    reset: function () { prevS[0] = prevS[1] = false; prevJ[0] = prevJ[1] = false; resetPtr(); }
  });

  Kit.webgl.watchContext(canvas, {
    notice: 'ctxNotice',
    onLost: function () { contextLost = true; },
    onRestored: function () { contextLost = false; dirty = true; if (state === 'pause') render(); }
  });

  /* --------------------------------------------------------------- Compatibility & Test Handle */
  function getInfo() {
    var m = match || demo;
    return {
      state: state,
      mode: m ? m.mode : 'demo',
      stage: m ? m.stage : selectedStage,
      time: m ? Math.round(m.time * 100) / 100 : 0,
      overtime: !!(m && m.overtime),
      score: m ? [m.players[0].score, m.players[1].score] : [0, 0],
      ball: m ? { x: Math.round(m.ball.x * 10) / 10, y: Math.round(m.ball.y * 10) / 10, state: m.ball.state } : null,
      p: m ? m.players.map(function (pl) {
        return {
          x: Math.round(pl.x * 10) / 10,
          y: Math.round(pl.y * 10) / 10,
          vx: Math.round(pl.vx * 10) / 10,
          score: pl.score,
          super: Math.round(pl.super)
        };
      }) : [],
      draws: drawCount
    };
  }

  window.__game = {
    get state() { return state; },
    get match() { return match; },
    get save() { return save; },
    get draws() { return drawCount; },
    info: getInfo,
    start: startMatch,
    pause: pauseGame,
    resume: resumeGame,
    skipIntro: function () { if (match && match.phase === 'intro') { match.phase = 'play'; match.phaseT = 0; } },
    give: function (idx, x) {
      if (!match) return;
      var p = match.players[idx | 0];
      if (!p) return;
      if (typeof x === 'number') p.x = x;
      p.y = E.FLOOR_Y; p.onGround = true; p.vx = 0; p.vy = 0; p.dunk = null; p.stunT = 0;
      match.ball.holder = p; match.ball.state = 'held'; match.ball.scoredT = 0;
      p.protect = 0;
    },
    endNow: function (winner) {
      if (!match) return;
      var w = winner === 1 ? 1 : 0;
      match.players[w].score = Math.max(match.players[w].score, match.players[1 - w].score + 2);
      match.time = 0; match.timeUp = true; match.ended = true; match.winner = w;
      match.phase = 'goal'; match.phaseT = 0.02;
    }
  };

  // Light namespace helper for persistence/regression tests
  window.HH = {
    engine: E,
    store: store,
    get save() { return save; },
    persist: persist,
    stepMatch: E.stepMatch
  };

  /* --------------------------------------------------------------- Fast Non-Blocking Boot via Kit.webgl.boot */
  refreshTitleUI();
  initDemo();

  function failBoot() {
    $('scrTitle').hidden = true;
    $('scrError').hidden = false;
    Kit.ready();
  }

  Kit.webgl.boot(function () {
    view = A.createView(canvas);
    view.calm = Kit.motion.reduced();
    resize();
    view.sync(match || demo, E.FIXED_DT, true);
    view.render();
    drawCount++;
    dirty = false;
    view.whenDrawn(function () {
      loop = Kit.loop(update, render);
      Kit.ready();
    }, 5000);
  }, { fallbackMs: 50, onError: failBoot });
})();
