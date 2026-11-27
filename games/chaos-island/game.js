/* Chaos Island (جزيرة الفوضى) — UI, controls, Kit lifecycle/DDA/stats/juice wiring.
 * Pure simulation lives in engine.js; 3D rendering lives in art.js. */
(function () {
  'use strict';

  var E = window.ChaosEngine;
  var A = window.ChaosArt;
  var J = Kit.juice;
  function $(id) { return document.getElementById(id); }

  var canvas = $('scene');
  var body = document.body;

  /* --------------------------------------------------------------- SVG icons */
  function svg(inner) {
    return '<svg viewBox="0 0 64 64" aria-hidden="true">' + inner + '</svg>';
  }
  var DISASTER_ICONS = {
    meteor: svg('<path d="M46 10 L28 28 L36 36 L54 18 Z" fill="#ff9d2e"/><circle cx="24" cy="40" r="15" fill="#ff4824" stroke="#231c3d" stroke-width="4"/><circle cx="20" cy="36" r="5" fill="#ffe14d"/><ellipse cx="32" cy="57" rx="20" ry="4" fill="none" stroke="#ff3824" stroke-width="3"/>'),
    flood: svg('<path d="M4 38 Q16 26 28 38 T52 38 L60 34 V60 H4 Z" fill="#ff5a1f" stroke="#231c3d" stroke-width="4"/><path d="M8 46 Q20 38 32 46 T56 46" fill="none" stroke="#ffe14d" stroke-width="4" stroke-linecap="round"/><path d="M32 24 V8 M22 16 L32 6 L42 16" fill="none" stroke="#22c860" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'),
    tornado: svg('<ellipse cx="32" cy="14" rx="22" ry="7" fill="#7ae4ff" stroke="#231c3d" stroke-width="4"/><ellipse cx="34" cy="26" rx="16" ry="5" fill="#b8f3ff" stroke="#231c3d" stroke-width="4"/><ellipse cx="30" cy="37" rx="11" ry="4" fill="#7ae4ff" stroke="#231c3d" stroke-width="4"/><ellipse cx="33" cy="48" rx="6" ry="3" fill="#b8f3ff" stroke="#231c3d" stroke-width="4"/><circle cx="32" cy="56" r="3" fill="#2ad4ff"/>'),
    lightning: svg('<path d="M16 24 Q14 10 30 10 Q42 8 48 18 Q56 18 54 28 H14 Z" fill="#635c91" stroke="#231c3d" stroke-width="4"/><polygon points="36,24 20,42 32,42 26,60 46,36 34,36" fill="#ffe436" stroke="#231c3d" stroke-width="3.5" stroke-linejoin="round"/>'),
    coconuts: svg('<circle cx="34" cy="36" r="19" fill="#8c4e24" stroke="#231c3d" stroke-width="4"/><circle cx="28" cy="30" r="3.5" fill="#3a1f0d"/><circle cx="38" cy="28" r="3.5" fill="#3a1f0d"/><circle cx="34" cy="38" r="3.5" fill="#3a1f0d"/><path d="M6 26 H16 M4 38 H14 M8 50 H18" stroke="#ff5238" stroke-width="4" stroke-linecap="round"/>'),
    quake: svg('<rect x="6" y="34" width="52" height="22" rx="6" fill="#52c949" stroke="#231c3d" stroke-width="4"/><polygon points="24,34 32,44 26,56 38,56 42,42 34,34" fill="#ff4824"/><path d="M26 28 L32 10 L38 28" fill="#ffaa24" stroke="#231c3d" stroke-width="3" stroke-linejoin="round"/>')
  };
  var HAT_EMOJI = { none: '🚫', leaf: '🌿', shades: '🕶️', pirate: '🏴‍☠️', party: '🎉', viking: '🛡️', dino: '🦖', crown: '👑' };

  /* --------------------------------------------------------------- save & DDA */
  var store = Kit.store('chaos-island');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = E.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }

  var ddaMatch = Kit.dda('chaos-island', { id: 'main', target: 0.72, tiers: 5 });
  var ddaEndless = Kit.dda('chaos-island', { id: 'endless', target: 0.72, tiers: 5 });

  /* --------------------------------------------------------------- state */
  var mode = 'title';
  var duo = false;
  var endless = false;
  var matches = 0;
  var world = null;
  var demo = null;
  var view = null;
  var time = 0;
  var viewTime = 0;
  var dirty = true;
  var snap = true;
  var contextLost = false;
  var live = false;
  var failed = false;
  var queuedAction = null;
  var loop = null;

  var resultData = null;
  var resultT = 0;
  var resultLock = 0;
  var starShown = 0;
  var toastT = 0;
  var idleT = 0;
  var coachShown = false;
  var lastCueAt = -10;
  var roundOpen = false;
  var shopFrom = 'title';

  var prevJump1 = false, prevJump2 = false;
  var prevDown1 = false, prevDown2 = false;
  var hudCache = { round: '', p1h: -1, p2h: -1, coins: -1, score: -1, phase: '', dis: '' };

  function say(txt) { $('live').textContent = txt; }
  function focusCanvas() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }

  /* --------------------------------------------------------------- screens */
  var SCREENS = { title: 'scrTitle', shop: 'scrShop', pause: 'scrPause', result: 'scrResult' };
  function setMode(next) {
    mode = next;
    body.dataset.mode = next;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== next;
    $('hud').hidden = !(next === 'play' || next === 'pause');
    $('btnPause').hidden = next !== 'play';
    if (next !== 'play') $('ghostHint').hidden = true;
    dirty = true;
    if (next === 'play') focusCanvas();
  }

  function refreshTitleUI() {
    $('titleCoins').querySelector('b').textContent = Kit.fmt(save.coins);
    $('titleBest').querySelector('b').textContent = Kit.fmt(save.bestScore);
    $('titleStars').querySelector('b').textContent = save.bestStars + '/3';
    var btnDuo = $('btnDuo');
    btnDuo.setAttribute('aria-pressed', String(duo));
    btnDuo.textContent = duo ? '👥 لاعبان' : '👤 لاعب واحد';
    $('controlsBar').innerHTML = duo
      ? 'اللاعب 1: <span dir="ltr"><span class="sg-key">W</span><span class="sg-key">A</span><span class="sg-key">S</span><span class="sg-key">D</span>+<span class="sg-key">مسافة</span></span> <span class="sep">·</span> اللاعب 2: <span dir="ltr"><span class="sg-key">←</span><span class="sg-key">→</span><span class="sg-key">↑</span><span class="sg-key">↓</span></span>'
      : '<span dir="ltr"><span class="sg-key">←</span><span class="sg-key">→</span> / <span class="sg-key">A</span><span class="sg-key">D</span></span> حركة <span class="sep">·</span> <span dir="ltr"><span class="sg-key">مسافة</span> / <span class="sg-key">↑</span></span> قفز';
  }

  function initDemo() {
    demo = E.create({ demo: true, seed: 4242, p1Color: save.color, p1Hat: save.hat });
    demo.actors[0].colorIndex = save.color;
    demo.actors[0].hatIndex = save.hat;
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
    demo.actors[0].zOff = 0.28;
    demo.actors[0].colorIndex = save.color;
    demo.actors[0].hatIndex = save.hat;
    refreshTitleUI();
    setMode('title');
  }

  /* --------------------------------------------------------------- shop */
  var colorTiles = [], hatTiles = [];
  function buildShop() {
    var cg = $('colorGrid'), hg = $('hatGrid');
    E.COLORS.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'shop-tile';
      b.dataset.kind = 'color';
      b.dataset.index = String(i);
      b.innerHTML = '<span class="swatch" style="background:#' + c.hex.toString(16).padStart(6, '0') + '"></span><span class="tile-price"></span>';
      b.addEventListener('click', function () { handleShopClick('color', i); });
      cg.appendChild(b);
      colorTiles.push(b);
    });
    E.HATS.forEach(function (h, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'shop-tile';
      b.dataset.kind = 'hat';
      b.dataset.index = String(i);
      b.innerHTML = '<span class="hat-ico">' + (HAT_EMOJI[h.id] || '🎩') + '</span><span class="tile-price"></span>';
      b.addEventListener('click', function () { handleShopClick('hat', i); });
      hg.appendChild(b);
      hatTiles.push(b);
    });
  }

  function refreshShop() {
    $('shopCoins').querySelector('b').textContent = Kit.fmt(save.coins);
    colorTiles.forEach(function (b, i) {
      var own = !!save.ownedColors[i], worn = save.color === i, cost = E.COLORS[i].cost;
      b.classList.toggle('owned', own);
      b.classList.toggle('worn', worn);
      b.classList.toggle('poor', !own && save.coins < cost);
      b.setAttribute('aria-pressed', String(worn));
      b.setAttribute('aria-label', E.COLORS[i].name + (own ? '' : ' ' + cost));
      b.querySelector('.tile-price').textContent = own ? '✓' : String(cost);
    });
    hatTiles.forEach(function (b, i) {
      var own = !!save.ownedHats[i], worn = save.hat === i, cost = E.HATS[i].cost;
      b.classList.toggle('owned', own);
      b.classList.toggle('worn', worn);
      b.classList.toggle('poor', !own && save.coins < cost);
      b.setAttribute('aria-pressed', String(worn));
      b.setAttribute('aria-label', E.HATS[i].name + (own ? '' : ' ' + cost));
      b.querySelector('.tile-price').textContent = own ? '✓' : String(cost);
    });
  }

  function openShop(from) {
    shopFrom = from || 'title';
    closeOpenRound();
    if (!demo) initDemo();
    demo.actors[0].x = -3.9;
    demo.actors[0].y = E.GROUND_Y;
    demo.actors[0].zOff = 2.4;
    demo.actors[0].colorIndex = save.color;
    demo.actors[0].hatIndex = save.hat;
    refreshShop();
    setMode('shop');
    J.select();
  }

  function handleShopClick(kind, index) {
    var status = E.buyOrEquip(save, kind, index);
    if (status === 'poor' || status === 'invalid') { J.error(); return; }
    persist();
    if (status === 'buy') { J.coin(3); J.levelUp(); } else J.select();
    if (demo && demo.actors[0]) {
      demo.actors[0].colorIndex = save.color;
      demo.actors[0].hatIndex = save.hat;
      demo.actors[0].vy = 7.5;
      demo.actors[0].squash = 1.3;
    }
    if (view) view.burst(-3.9, 1.6, 2.4, { count: 22, colors: [0xffcf2e, 0xffffff, 0xff5a7a, 0x35e6ff], speed: 5.5, life: 0.75 });
    refreshShop();
    refreshTitleUI();
  }

  /* --------------------------------------------------------------- gameplay */
  function startMatch(isEndless) {
    if (!live) { queuedAction = function () { startMatch(isEndless); }; return; }
    closeOpenRound();
    endless = !!isEndless;
    matches += 1;

    var dda = endless ? ddaEndless : ddaMatch;
    var tier = duo ? 2 : dda.tier;
    var level = duo ? 0.35 : dda.level;
    var seed = ((Date.now() ^ (matches * 2654435761)) >>> 0) || 1337;

    world = E.create({
      seed: seed,
      duo: duo,
      endless: endless,
      tier: tier,
      level: level,
      p1Color: save.color,
      p1Hat: save.hat
    });

    resultData = null;
    toastT = 0;
    idleT = 0;
    coachShown = false;
    lastCueAt = -10;
    prevJump1 = prevJump2 = prevDown1 = prevDown2 = false;
    hudCache = { round: '', p1h: -1, p2h: -1, coins: -1, score: -1, phase: '', dis: '' };
    $('roundToast').hidden = true;
    $('ghostHint').hidden = true;
    Kit.keys.reset();

    var rid = duo ? (endless ? 'duo-endless' : 'duo') : (endless ? 'endless' : 'match');
    Kit.stats.round(rid);
    roundOpen = true;

    showDisasterCard(world.disaster, world.round);
    updateHud();
    snap = true;
    setMode('play');
    J.whoosh(0.5);
  }

  function showDisasterCard(disasterId, roundIdx) {
    var d = E.DISASTER_MAP[disasterId] || E.DISASTERS[0];
    $('cardIcon').innerHTML = DISASTER_ICONS[d.id] || '';
    $('cardRound').textContent = endless ? ('الموجة ' + (roundIdx + 1)) : ('الجولة ' + (roundIdx + 1) + ' من ' + E.MATCH_ROUNDS);
    $('cardName').textContent = d.name;
    $('cardHint').textContent = d.hint;
    $('disasterCard').style.borderColor = d.color;
    $('disasterCard').hidden = false;
    $('disasterPill').hidden = true;
    $('pillIcon').innerHTML = DISASTER_ICONS[d.id] || '';
    $('pillName').textContent = d.name;
    Kit.track.cue();
    lastCueAt = time;
    say(d.name + ' — ' + d.hint);
  }

  function showToast(text, good) {
    var el = $('roundToast');
    el.textContent = text;
    el.style.background = good ? 'linear-gradient(180deg, #3df283, #1ec25e)' : 'linear-gradient(180deg, #ffcf2e, #ff8f24)';
    el.hidden = false;
    toastT = 1.5;
  }

  function heartsText(n) {
    var s = '';
    for (var i = 0; i < E.MAX_HEARTS; i++) s += i < n ? '❤️' : '🖤';
    return s;
  }

  function updateHud() {
    if (!world) return;
    var p1 = world.actors[0];
    var p2 = world.duo ? world.actors[1] : null;
    var rStr = world.endless ? ('موجة ' + (world.round + 1)) : ((world.round + 1) + '/' + E.MATCH_ROUNDS);
    if (hudCache.round !== rStr) { hudCache.round = rStr; $('hudRound').querySelector('b').textContent = rStr; }
    if (hudCache.p1h !== p1.hearts) { hudCache.p1h = p1.hearts; $('hudP1Hearts').textContent = heartsText(p1.hearts); }
    $('hudP2').hidden = !p2;
    if (p2 && hudCache.p2h !== p2.hearts) { hudCache.p2h = p2.hearts; $('hudP2Hearts').textContent = heartsText(p2.hearts); }
    var coins = p2 ? (p1.coins + p2.coins) : p1.coins;
    if (hudCache.coins !== coins) { hudCache.coins = coins; $('hudCoins').querySelector('b').textContent = Kit.fmt(coins); }
    var score = p2 ? Math.max(p1.score, p2.score) : p1.score;
    if (hudCache.score !== score) { hudCache.score = score; $('hudScore').querySelector('b').textContent = Kit.fmt(score); }

    if (world.phase === 'card') {
      $('disasterCard').hidden = false;
      $('disasterPill').hidden = true;
    } else if (world.phase === 'active') {
      $('disasterCard').hidden = true;
      $('disasterPill').hidden = false;
      var rem = Math.max(0, Math.min(1, 1 - world.t / E.ROUND_TIME));
      $('pillFill').style.width = (rem * 100).toFixed(1) + '%';
    } else {
      $('disasterCard').hidden = true;
      $('disasterPill').hidden = true;
    }
  }

  function pauseGame(own) {
    if (mode !== 'play') return;
    Kit.keys.reset();
    prevJump1 = prevJump2 = prevDown1 = prevDown2 = false;
    setMode('pause');
    if (own) J.back();
  }

  function resumeGame() {
    if (mode !== 'pause') return;
    Kit.keys.reset();
    prevJump1 = prevJump2 = prevDown1 = prevDown2 = false;
    setMode('play');
    J.select();
  }

  /* --------------------------------------------------------------- finish & result */
  function handleMatchEnd(res) {
    resultData = res;
    resultT = 0;
    resultLock = 0.45;
    starShown = 0;

    var isNewBest = false;
    if (res.humanMoved) {
      save.coins += res.coins;
      if (res.score > save.bestScore) { save.bestScore = res.score; isNewBest = true; }
      if (!res.endless && res.stars > save.bestStars) save.bestStars = res.stars;
      if (res.endless && res.roundsSurvived > save.bestWaves) { save.bestWaves = res.roundsSurvived; isNewBest = true; }
      if (res.won) save.wins += 1;
      persist();
    }

    // Play statistics & DDA (solo only for DDA; 2P reports 'end' with no score!)
    if (roundOpen) {
      if (res.duo) Kit.stats.end('end');
      else if (res.endless) Kit.stats.end('end', res.roundsSurvived);
      else Kit.stats.end(res.won ? 'win' : 'lose', res.stars);
      roundOpen = false;
    }
    if (!res.duo) {
      var dda = res.endless ? ddaEndless : ddaMatch;
      dda.result(res.ddaOutcome);
    }

    // Populate result screen
    $('resNewBest').hidden = !isNewBest;
    if (res.duo) {
      $('resTitle').textContent = res.winner === 'p1' ? 'فاز اللاعب 1! 🏆' : res.winner === 'p2' ? 'فاز اللاعب 2! 🏆' : 'تعادل رائع! 🤝';
      $('resSub').textContent = 'اللاعب 1: ' + res.p1Survived + ' · اللاعب 2: ' + res.p2Survived;
    } else if (!res.humanMoved) {
      $('resTitle').textContent = 'تحرّك لتنجو!';
      $('resSub').textContent = 'استخدم الأسهم والمسافة للقفز والهرب';
    } else if (res.endless) {
      $('resTitle').textContent = res.roundsSurvived >= 5 ? 'صمود أسطوري! 🏝️' : 'انتهت المغامرة!';
      $('resSub').textContent = 'أفضل رقم: ' + save.bestWaves + ' موجات';
    } else {
      $('resTitle').textContent = res.stars === 3 ? 'بطل الجزيرة! 🏆' : res.won ? 'أحسنت النجاة! 🎉' : 'حاول مجددًا!';
      $('resSub').textContent = res.stars === 3 ? 'نجوت من كل الكوارث!' : 'اجمع العملات وافتح قبعات جديدة';
    }

    $('resRounds').textContent = res.endless ? String(res.roundsSurvived) : (res.roundsSurvived + '/' + E.MATCH_ROUNDS);
    $('resScore').textContent = Kit.fmt(res.score);
    $('resCoins').textContent = '+' + Kit.fmt(res.coins);

    var starEls = $('resStars').querySelectorAll('.star');
    for (var i = 0; i < starEls.length; i++) starEls[i].classList.remove('on');
    $('resStars').hidden = res.endless;

    setMode('result');
    if (res.won) {
      J.levelUp();
      if (view) view.burst(0, 4.5, 0, { count: 40, colors: [0xffcf2e, 0x32d972, 0xff5a7a, 0x35e6ff], speed: 9.5, up: 7, life: 1.2, size: 0.32 });
    } else {
      J.fail();
    }
    say($('resTitle').textContent);
  }

  /* --------------------------------------------------------------- inputs & events */
  function readHumanInputs() {
    var K = Kit.keys;
    if (!duo) {
      var left = K.anyDown(['ArrowLeft', 'KeyA']);
      var right = K.anyDown(['ArrowRight', 'KeyD']);
      var jDown = K.anyDown(['ArrowUp', 'KeyW', 'Space']);
      var jPress = K.anyPressed(['ArrowUp', 'KeyW', 'Space']) || (jDown && !prevJump1);
      var dDown = K.anyDown(['ArrowDown', 'KeyS']);
      var dPress = K.anyPressed(['ArrowDown', 'KeyS']) || (dDown && !prevDown1);
      prevJump1 = jDown;
      prevDown1 = dDown;
      return [{ moveX: (right ? 1 : 0) - (left ? 1 : 0), jumpPressed: jPress, jumpDown: jDown, downPressed: dPress }];
    }
    var p1L = K.down('KeyA'), p1R = K.down('KeyD');
    var p1J = K.anyDown(['KeyW', 'Space']);
    var p1JP = K.anyPressed(['KeyW', 'Space']) || (p1J && !prevJump1);
    var p1D = K.down('KeyS');
    var p1DP = K.pressed('KeyS') || (p1D && !prevDown1);
    prevJump1 = p1J; prevDown1 = p1D;

    var p2L = K.down('ArrowLeft'), p2R = K.down('ArrowRight');
    var p2J = K.down('ArrowUp');
    var p2JP = K.pressed('ArrowUp') || (p2J && !prevJump2);
    var p2D = K.down('ArrowDown');
    var p2DP = K.pressed('ArrowDown') || (p2D && !prevDown2);
    prevJump2 = p2J; prevDown2 = p2D;

    return [
      { moveX: (p1R ? 1 : 0) - (p1L ? 1 : 0), jumpPressed: p1JP, jumpDown: p1J, downPressed: p1DP },
      { moveX: (p2R ? 1 : 0) - (p2L ? 1 : 0), jumpPressed: p2JP, jumpDown: p2J, downPressed: p2DP }
    ];
  }

  function handleEngineEvents(events) {
    if (!events || !events.length) return;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'jump' && ev.isHuman) {
        J.jump(0.65);
        if (view) view.burst(ev.x, ev.y + 0.1, 0, { count: 6, colors: [0xffffff, 0xe8f4ff], speed: 2.6, up: 1.5, life: 0.35, size: 0.16 });
      } else if (ev.type === 'land' && ev.isHuman) {
        J.land(0.35);
      } else if (ev.type === 'bounce') {
        if (ev.isHuman) J.jump(1.0);
        if (view) view.burst(ev.x, ev.y + 0.6, 0, { count: 14, colors: [0xffe45c, 0xff4968, 0xffffff], speed: 5.0, up: 5.5, life: 0.5, size: 0.2 });
      } else if (ev.type === 'coin' && ev.isHuman) {
        J.coin(1);
        Kit.track.hit();
        if (view) view.burst(ev.x, ev.y, 0, { count: 10, colors: [0xffd22e, 0xfff3a0, 0xffffff], speed: 4.0, up: 3.5, life: 0.45, size: 0.18 });
      } else if (ev.type === 'bump' && ev.human) {
        J.pop(0.6);
        if (view) view.burst(ev.x, ev.y, 0, { count: 8, colors: [0xffffff, 0xffe45c], speed: 3.8, up: 2.5, life: 0.38, size: 0.17 });
      } else if (ev.type === 'hit') {
        if (ev.isHuman) {
          J.impact(0.85);
          Kit.track.miss();
          if (view) view.shake(0.95);
        }
        if (view) view.burst(ev.x, ev.y + 0.6, 0, { count: 16, colors: [0xff4b4b, 0xffcf2e, 0xffffff], speed: 6.2, up: 5.0, life: 0.55, size: 0.22 });
      } else if (ev.type === 'ko') {
        if (ev.isHuman) { J.fail(); Kit.track.miss(); }
        if (view) view.burst(ev.x, ev.y + 0.6, 0, { count: 24, colors: [0xffffff, 0x8be9ff, 0xffcf2e], speed: 7.0, up: 6.0, life: 0.8, size: 0.26 });
      } else if (ev.type === 'telegraph') {
        if (time - lastCueAt > 2.2) { Kit.track.cue(); lastCueAt = time; }
      } else if (ev.type === 'impact') {
        if (ev.kind === 'meteor' || ev.kind === 'quake') {
          J.impact(0.5);
          if (view) { view.shake(0.55); view.burst(ev.x, ev.y + 0.3, 0, { count: 14, colors: [0xff5224, 0xffae24, 0xffe866], speed: 6.0, up: 5.5, life: 0.55, size: 0.24 }); }
        } else if (ev.kind === 'lightning') {
          J.impact(0.65);
          if (view) { view.shake(0.5); view.burst(ev.x, ev.y + 0.4, 0, { count: 14, colors: [0xfff36b, 0xffffff, 0x7ae2ff], speed: 6.5, up: 5.5, life: 0.45, size: 0.22 }); }
        }
      } else if (ev.type === 'disasterCard') {
        showDisasterCard(ev.disaster, ev.round);
        J.countdown(3);
      } else if (ev.type === 'disasterStart') {
        J.whoosh(0.75);
      } else if (ev.type === 'roundClear') {
        var survived = ev.p1Alive || ev.p2Alive;
        if (survived) {
          J.chime(2);
          Kit.track.hit();
          showToast('نجوت! +100 ⭐', true);
          if (view) view.burst(0, 3.8, 0, { count: 26, colors: [0x32d972, 0xffcf2e, 0xffffff, 0x4cc3ff], speed: 7.5, up: 6.5, life: 0.9, size: 0.24 });
        } else {
          showToast('الجولة التالية!', false);
        }
      } else if (ev.type === 'matchEnd') {
        handleMatchEnd(ev.result);
      }
    }
  }

  /* --------------------------------------------------------------- loop */
  function handleMenuKeys() {
    var K = Kit.keys;
    if (mode === 'play') {
      if (K.anyPressed(['KeyP', 'Escape'])) pauseGame(true);
    } else if (mode === 'pause') {
      if (K.anyPressed(['KeyP', 'Escape'])) resumeGame();
      else if (K.pressed('KeyR')) startMatch(endless);
    } else if (mode === 'shop') {
      if (K.pressed('Escape')) { J.back(); if (shopFrom === 'result' && resultData) setMode('result'); else toTitle(); }
    } else if (mode === 'title') {
      if (K.anyPressed(['Enter', 'Space'])) startMatch(false);
    } else if (mode === 'result' && resultLock <= 0) {
      if (K.anyPressed(['Enter', 'Space', 'KeyR'])) startMatch(endless);
      else if (K.pressed('Escape')) toTitle();
    }
  }

  function update(dt) {
    if (mode !== 'pause') time += dt;
    handleMenuKeys();

    if (mode === 'play' && world) {
      var inputs = readHumanInputs();
      var evs = E.step(world, dt, inputs);
      handleEngineEvents(evs);
      if (mode === 'play') {
        updateHud();
        Kit.stats.busy();
        // Idle ghost control hint in first 10s if player hasn't moved yet
        if (!world.humanMoved) {
          idleT += dt;
          if (!coachShown && idleT >= 2.2) {
            coachShown = true;
            $('ghostHint').hidden = false;
            if (!save.coachDone) Kit.stats.tutorial('start');
          }
        } else {
          if (coachShown) {
            coachShown = false;
            $('ghostHint').hidden = true;
          }
          if (!save.coachDone) {
            save.coachDone = true;
            Kit.stats.tutorial('done');
            persist();
          }
        }
      }
    } else if ((mode === 'title' || mode === 'shop') && demo) {
      if (mode === 'title') E.step(demo, dt, null);
      else {
        // Gentle idle bob on wardrobe character
        var a0 = demo.actors[0];
        if (a0.y > E.GROUND_Y || a0.vy !== 0) {
          a0.vy -= 28 * dt;
          a0.y += a0.vy * dt;
          if (a0.y <= E.GROUND_Y) { a0.y = E.GROUND_Y; a0.vy = 0; a0.squash = 0.82; }
        }
        a0.squash += (1 - a0.squash) * Math.min(1, dt * 12);
      }
    } else if (mode === 'result' && resultData) {
      resultT += dt;
      if (resultLock > 0) resultLock -= dt;
      if (!resultData.endless && starShown < resultData.stars && resultT >= 0.28 + starShown * 0.28) {
        starShown++;
        var el = $('resStars').querySelector('[data-i="' + starShown + '"]');
        if (el) el.classList.add('on');
        J.star(starShown);
      }
    }

    if (toastT > 0 && mode !== 'pause') {
      toastT -= dt;
      if (toastT <= 0) $('roundToast').hidden = true;
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
      view.sync(activeWorld, { dt: dt, t: time, mode: mode, snap: snap });
      snap = false;
    }
    view.render();
    dirty = false;
  }

  function layout() {
    if (view) view.resize(window.innerWidth, window.innerHeight);
    dirty = true;
  }

  /* --------------------------------------------------------------- buttons */
  function bindButtons() {
    $('btnPlay').addEventListener('click', function () { startMatch(false); });
    $('btnEndless').addEventListener('click', function () { startMatch(true); });
    $('btnDuo').addEventListener('click', function () {
      duo = !duo;
      J.toggle(duo);
      refreshTitleUI();
    });
    $('btnShop').addEventListener('click', function () { openShop('title'); });
    $('btnShopBack').addEventListener('click', function () {
      J.back();
      if (shopFrom === 'result' && resultData) setMode('result');
      else toTitle();
    });
    $('btnPause').addEventListener('click', function () { pauseGame(true); });
    $('btnResume').addEventListener('click', function () { resumeGame(); });
    $('btnRestart').addEventListener('click', function () { J.select(); startMatch(endless); });
    $('btnHome').addEventListener('click', function () { J.back(); toTitle(); });
    $('btnAgain').addEventListener('click', function () { J.select(); startMatch(endless); });
    $('btnResShop').addEventListener('click', function () { openShop('result'); });
    $('btnResHome').addEventListener('click', function () { J.back(); toTitle(); });
  }

  /* --------------------------------------------------------------- boot */
  function fail(err) {
    if (failed) return;
    failed = true; live = false; queuedAction = null;
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
      get matches() { return matches; },
      get duo() { return duo; },
      get endless() { return endless; },
      get world() { return world; },
      get demo() { return demo; },
      get player() { return world ? world.actors[0] : (demo ? demo.actors[0] : null); },
      get players() { return world ? world.actors.filter(function (a) { return a.isHuman; }) : []; },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get result() { return resultData; },
      info: function () {
        var p = world ? world.actors[0] : null;
        return {
          mode: mode, matches: matches, duo: duo, endless: endless,
          round: world ? world.round : 0, phase: world ? world.phase : '',
          disaster: world ? world.disaster : '', frames: world ? world.frames : 0,
          t: world ? world.t : 0, x: p ? p.x : 0, y: p ? p.y : 0, walk: p ? p.walk : 0
        };
      }
    };
    loop = Kit.loop(update, render);
    live = true;
    Kit.ready();
    if (queuedAction) { var fn = queuedAction; queuedAction = null; fn(); }
  }

  Kit.muteButton();
  Kit.lifecycle({
    pause: function () { pauseGame(false); },
    reset: function () { prevJump1 = prevJump2 = prevDown1 = prevDown2 = false; }
  });
  Kit.motion.onChange(function (r) { if (view) view.calm = r; dirty = true; });
  window.addEventListener('resize', layout);
  window.addEventListener('pageshow', function () { dirty = true; });
  Kit.webgl.watchContext(canvas, {
    notice: 'ctxNotice',
    onLost: function () { contextLost = true; pauseGame(false); },
    onRestored: function () { contextLost = false; snap = true; dirty = true; layout(); }
  });

  try {
    buildShop();
    bindButtons();
    initDemo();
    refreshTitleUI();
    setMode('title');

    Kit.webgl.boot(function () {
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
    }, { guard: function () { return !failed; }, onError: fail });
  } catch (err) {
    fail(err);
  }
})();
