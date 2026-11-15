/* Recess Kitchen (مطبخ الفسحة): UI screens, 1P keyboard + mouse click-to-walk controls,
 * 2P cooperative shared-goal controls, shop, DDA, telemetry, and render loop. */
(function () {
  'use strict';
  var A = RK.art, J = Kit.juice, W = RK.W, H = RK.H;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ui = $('ui');
  var calm = function () { return Kit.motion.reduced(); };
  var clamp = Kit.clamp;
  var dirty = true;

  var view = Kit.fit(canvas, W, H, {
    maxDpr: 1.5,
    onResize: function (v) {
      ui.style.left = canvas.style.left;
      ui.style.top = canvas.style.top;
      ui.style.transform = 'scale(' + v.scale + ')';
      dirty = true;
    }
  });

  var fx = Kit.particles(), shake = Kit.shake();
  var pixelScale = function () { return clamp(Math.round(view.scale * view.dpr * 4) / 4, 0.5, 2); };
  var KEYS_GO = ['Enter', 'NumpadEnter', 'Space'];
  var CELEBRATE = 1.35;

  /* ----------------------------------------------------------- save & DDA */
  var store = Kit.store('recess-kitchen');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = RK.loadSave(store.get('save', null));

  function persist() {
    if (store.set('save', save) === false) {
      saveStatus.failed();
      return false;
    }
    saveStatus.saved();
    return true;
  }

  var dda = Kit.dda('recess-kitchen', { id: 'main', start: 0.3 });

  /* ---------------------------------------------------------------- state */
  var screen = 'title', cur = 0, players = 1, world = null, time = 0, activeRound = false;
  var celebrate = 0, result = null, resultT = 0, resultLock = 0, intro = 0;
  var floats = [];
  var ptr = { x: W / 2, y: H / 2, down: false, holdT: 0, inside: false };
  var clickQ = null;

  var SCREENS = { title: 'scrTitle', map: 'scrMap', pause: 'scrPause', result: 'scrResult', shop: 'scrShop' };

  function setScreen(name) {
    screen = name;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    dirty = true;
    if (name === 'play') focusGame();
  }

  function focusGame() {
    try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function say(msg) { $('live').textContent = msg; }
  function chip(id, val) { $(id).querySelector('b').textContent = String(val); }

  function wiggle(el) {
    if (calm()) return;
    el.classList.remove('wiggle');
    void el.offsetWidth;
    el.classList.add('wiggle');
    setTimeout(function () { el.classList.remove('wiggle'); }, 460);
  }

  function toTitle() {
    leaveLevel();
    chip('titleStars', RK.totalStars(save) + '/' + (RK.LEVELS.length * 3));
    chip('titleCoins', save.coins);
    setScreen('title');
  }

  function playSolo() {
    players = 1;
    J.select();
    if (!RK.totalStars(save)) startLevel(0); else toMap();
  }

  function playCoop() {
    players = 2;
    J.select();
    if (!RK.totalStars(save)) startLevel(0); else toMap();
  }

  /* ------------------------------------------------------------------ map */
  var levelBtns = [], worldRows = [];

  function buildMap() {
    var box = $('worlds');
    RK.WORLDS.forEach(function (wd, wi) {
      var row = document.createElement('div');
      row.className = 'wrow';
      row.style.setProperty('--wc', wd.color);
      row.innerHTML = '<div class="wname"><i>العالم ' + (wi + 1) + '</i><b>' + wd.name + '</b></div>';
      for (var k = 0; k < 3; k++) {
        (function (i) {
          var R = RK.LEVELS[i];
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'rk-btn lvl';
          b.innerHTML = '<b>' + R.id + '</b><small>' + R.name + '</small><span class="st">' +
            '<svg><use href="#i-star"/></svg><svg><use href="#i-star"/></svg><svg><use href="#i-star"/></svg></span>' +
            '<svg class="lk" aria-hidden="true"><use href="#i-lock"/></svg>';
          on(b, function () { pickLevel(i, b); });
          row.appendChild(b);
          levelBtns.push(b);
        })(wi * 3 + k);
      }
      box.appendChild(row);
      worldRows.push(row);
    });
  }

  function refreshModeBtn() {
    var btn = $('mapMode');
    btn.classList.toggle('coop', players === 2);
    $('mapModeTxt').textContent = players === 2 ? 'تعاون اثنين' : 'لاعب واحد';
  }

  function refreshMap() {
    var next = RK.nextLevel(save);
    levelBtns.forEach(function (b, i) {
      var open = RK.isOpen(save, i), st = save.lv[i].s, R = RK.LEVELS[i];
      b.classList.toggle('locked', !open);
      b.classList.toggle('next', open && i === next);
      b.querySelectorAll('.st svg').forEach(function (s, k) { s.classList.toggle('on', k < st); });
      b.setAttribute('aria-label', R.id + ' ' + R.name + (open ? '، ' + st + ' من 3 نجوم' : ' (مقفلة)'));
    });
    worldRows.forEach(function (r, wi) { r.classList.toggle('locked', !RK.isOpen(save, wi * 3)); });
    chip('mapStars', RK.totalStars(save) + '/' + (RK.LEVELS.length * 3));
    refreshModeBtn();
  }

  function toMap() {
    leaveLevel();
    refreshMap();
    setScreen('map');
    J.whoosh(0.4);
  }

  function pickLevel(i, el) {
    if (!RK.isOpen(save, i)) { J.error(); wiggle(el); return; }
    J.select();
    startLevel(i);
  }

  /* ----------------------------------------------------------------- shop */
  var tiles = { apron: [], hat: [] };

  function buildShop() {
    [['apron', RK.APRONS, 'shelfAprons'], ['hat', RK.HATS, 'shelfHats']].forEach(function (pair) {
      var kind = pair[0], list = pair[1], id = pair[2];
      list.forEach(function (item, k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'rk-btn tile';
        b.innerHTML = '<canvas width="236" height="236"></canvas><b>' + item.name + '</b>' +
          '<span class="price"><i class="coin"></i><em>' + item.price + '</em></span>';
        on(b, function () { buy(kind, k, b); });
        $(id).appendChild(b);
        tiles[kind].push(b);
      });
    });
  }

  function drawShopTile(kind, k, c) {
    var g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, 118, 118);
    var apIdx = kind === 'apron' ? k : save.apron;
    var htIdx = kind === 'hat' ? k : save.hat;
    A.chef(g, { id: 0, x: 59, y: 68, dirX: 0, dirY: 0.4, walk: 0, held: null }, {
      apron: apIdx, hat: htIdx, t: 0, still: true, scale: 1.55
    });
  }

  function refreshShop() {
    ['apron', 'hat'].forEach(function (kind) {
      var isHat = kind === 'hat';
      var own = isHat ? save.hats : save.aprons;
      var wear = isHat ? save.hat : save.apron;
      var list = isHat ? RK.HATS : RK.APRONS;
      tiles[kind].forEach(function (b, k) {
        drawShopTile(kind, k, b.querySelector('canvas'));
        b.classList.toggle('own', !!own[k]);
        b.classList.toggle('wear', wear === k);
        b.classList.toggle('poor', !own[k] && save.coins < list[k].price);
        b.setAttribute('aria-label', list[k].name + (wear === k ? ' (قيد الارتداء)' : own[k] ? '' : '، السعر ' + list[k].price));
      });
    });
    chip('shopCoins', save.coins);
  }

  function openShop() {
    J.select();
    refreshShop();
    setScreen('shop');
  }

  function buy(kind, k, el) {
    var did = RK.buy(save, kind, k);
    if (!did) { J.error(); wiggle(el); return; }
    persist();
    if (did === 'bought') {
      J.coin(3);
      J.levelUp();
      if (!calm()) {
        var r = el.getBoundingClientRect(), p = view.toLogical(r.left + r.width / 2, r.top + r.height / 3);
        fx.burst(p.x, p.y, { count: 26, colors: ['#ffd23f', '#ffffff', '#ff5d9e', '#34d399'], speed: 320, life: 0.75, size: 8, gravity: 280 });
      }
    } else {
      J.tap();
    }
    refreshShop();
    dirty = true;
  }

  /* ---------------------------------------------------------- round lifecycle */
  function buildRoundOpts() {
    if (players === 2) return { players: 2 };
    var E = RK.EASY, D = RK.HARD;
    return {
      players: 1,
      patienceScale: dda.value(E.patienceScale, D.patienceScale),
      cookSpeed: dda.value(E.cookSpeed, D.cookSpeed),
      burnDelay: dda.value(E.burnDelay, D.burnDelay),
      goalScale: dda.value(E.goalScale, D.goalScale)
    };
  }

  function startLevel(i) {
    leaveLevel();
    cur = clamp(i | 0, 0, RK.LEVELS.length - 1);
    world = RK.create(cur, buildRoundOpts());
    world.ev.length = 0; // silence initial order spawn events on round start
    activeRound = true;
    fx.clear();
    floats = [];
    celebrate = 0;
    result = null;
    clickQ = null;
    ptr.down = false;
    ptr.holdT = 0;
    intro = 2.4;
    Kit.keys.reset();

    var rid = players === 2 ? 'coop-' + (cur + 1) : 'L' + (cur + 1);
    Kit.stats.round(rid);

    setScreen('play');
    J.whoosh(0.45);
    say(world.R.id + ' ' + world.R.name);
  }

  function leaveLevel() {
    if (activeRound) {
      Kit.stats.end('quit');
      activeRound = false;
    }
  }

  function restart() {
    if (!world) return;
    J.select();
    startLevel(cur);
  }

  function pause(byUser) {
    if (screen !== 'play') return;
    ptr.down = false;
    ptr.holdT = 0;
    clickQ = null;
    setScreen('pause');
    if (byUser) J.back();
  }

  function resume() {
    if (screen !== 'pause') return;
    J.select();
    clickQ = null;
    ptr.down = false;
    ptr.holdT = 0;
    setScreen('play');
    Kit.keys.reset();
  }

  /* -------------------------------------------------------- bell & result */
  function onBell() {
    var stars = RK.stars(world);
    var won = stars >= 1;
    var before = save.lv[cur].s;
    var res = RK.applyResult(save, cur, stars, world.coins);
    persist();

    if (players === 1) {
      dda.result(RK.outcome(world));
      Kit.stats.end(won ? 'win' : 'lose', world.coins);
    } else {
      Kit.stats.end('end');
    }
    activeRound = false;

    result = { stars: stars, before: before, res: res, served: world.served, coins: world.coins };
    celebrate = CELEBRATE;
    if (won) {
      J.levelUp();
      if (!calm()) {
        fx.burst(W / 2, 220, { count: 34, colors: ['#ffd23f', '#ffffff', '#ff5d9e', '#34d399', '#38bdf8'], speed: 380, life: 1.0, size: 9, gravity: 320 });
        shake.add(3);
      }
    } else {
      J.back();
    }
  }

  function showResult() {
    var r = result, R = RK.LEVELS[cur];
    resultT = 0;
    resultLock = 0.45;
    $('resTitle').textContent = r.stars === 3 ? 'ممتاز!' : r.stars === 2 ? 'رائع!' : r.stars === 1 ? 'أحسنت!' : 'حاول مرة أخرى!';
    $('resStars').querySelectorAll('svg').forEach(function (s, i) {
      s.classList.toggle('on', i < Math.min(r.before, r.stars));
      s.classList.remove('pop');
    });
    $('resServed').querySelector('b').textContent = String(r.served);
    $('resServed').classList.toggle('good', r.served > 0);
    $('resCoins').querySelector('b').textContent = '+' + r.coins;
    $('resBest').hidden = true;
    $('resWorld').hidden = true;
    $('resNext').hidden = (cur + 1 >= RK.LEVELS.length) || !RK.isOpen(save, cur + 1);
    say(R.id + '، ' + r.stars + ' نجوم');
    setScreen('result');
  }

  function resultStep(dt) {
    var r = result, prev = resultT;
    resultT += dt;
    var at = function (t) { return prev < t && resultT >= t; };
    for (var i = Math.min(r.before, r.stars); i < r.stars; i++) {
      if (at(0.3 + (i - Math.min(r.before, r.stars)) * 0.35)) {
        var s = $('resStars').children[i];
        s.classList.add('on', 'pop');
        J.star(i + 1);
        if (!calm()) fx.burst(530 + i * 108, 250, { count: 16, colors: ['#ffd23f', '#ffffff'], speed: 280, life: 0.7, size: 8, gravity: 280 });
      }
    }
    var late = 0.45 + Math.max(0, r.stars - r.before) * 0.35;
    if (at(late)) {
      if (r.res.best) { $('resBest').hidden = false; J.chime(2); }
      if (r.res.world >= 0) { $('resWorld').hidden = false; J.levelUp(); }
    }
  }

  function resultNext() {
    if (!result || resultLock > 0) return;
    if (cur + 1 >= RK.LEVELS.length || !RK.isOpen(save, cur + 1)) { J.back(); toMap(); return; }
    J.select();
    startLevel(cur + 1);
  }

  function resultAgain() {
    if (result && resultLock <= 0) { J.select(); startLevel(cur); }
  }

  /* --------------------------------------------------------------- inputs */
  function on(el, fn) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.detail > 1) return;
      Kit.audio.unlock();
      if (e.detail > 0) { el.blur(); focusGame(); }
      fn(e);
    });
  }

  on($('btnPlay'), playSolo);
  on($('btnCoop'), playCoop);
  on($('btnLevels'), function () { J.select(); toMap(); });
  on($('btnShop'), openShop);
  on($('mapHome'), function () { J.back(); toTitle(); });
  on($('mapMode'), function () {
    players = players === 2 ? 1 : 2;
    J.tap();
    refreshModeBtn();
  });
  on($('shopBack'), function () { J.back(); toTitle(); });
  on($('btnPause'), function () { pause(true); });
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnMap'), function () { J.back(); toMap(); });
  on($('resNext'), resultNext);
  on($('resAgain'), resultAgain);
  on($('resMap'), function () { if (resultLock <= 0) { J.back(); toMap(); } });

  var toLogical = function (e) { return view.toLogical(e.clientX, e.clientY); };
  var inFrame = function (p) { return p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H; };

  canvas.addEventListener('pointerdown', function (e) {
    focusGame();
    if (e.button !== 0) return;
    Kit.audio.unlock();
    var p = toLogical(e);
    ptr.x = p.x; ptr.y = p.y; ptr.inside = inFrame(p);
    if (screen === 'play' && players === 1 && !celebrate && ptr.inside) {
      ptr.down = true;
      ptr.holdT = 0;
      clickQ = { x: p.x, y: p.y };
    }
  });

  window.addEventListener('pointermove', function (e) {
    var p = toLogical(e);
    ptr.x = p.x; ptr.y = p.y; ptr.inside = inFrame(p);
    if (ptr.down && e.buttons === 0) ptr.down = false;
  });
  window.addEventListener('pointerup', function (e) { if (e.button === 0) ptr.down = false; });
  window.addEventListener('pointercancel', function () { ptr.down = false; });

  function handleMenuKeys() {
    var K = Kit.keys, go = K.anyPressed(KEYS_GO);
    if (screen === 'title') {
      if (go) playSolo();
    } else if (screen === 'map') {
      if (go) { J.select(); startLevel(RK.nextLevel(save)); }
      else if (K.pressed('Escape')) { J.back(); toTitle(); }
    } else if (screen === 'shop') {
      if (K.pressed('Escape')) { J.back(); toTitle(); }
    } else if (screen === 'play') {
      if (K.anyPressed(['KeyP', 'Escape'])) pause(true);
      else if (K.pressed('KeyR') && !celebrate) restart();
    } else if (screen === 'pause') {
      if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume();
      else if (K.pressed('KeyR')) restart();
    } else if (screen === 'result' && resultLock <= 0) {
      if (go) resultNext();
      else if (K.pressed('KeyR')) resultAgain();
      else if (K.pressed('Escape')) { J.back(); toMap(); }
    }
  }

  function buildChefInputs(dt) {
    var K = Kit.keys;
    if (players === 1) {
      if (ptr.down) ptr.holdT += dt;
      var mx = (K.anyDown(['KeyD', 'ArrowRight']) ? 1 : 0) - (K.anyDown(['KeyA', 'ArrowLeft']) ? 1 : 0);
      var my = (K.anyDown(['KeyS', 'ArrowDown']) ? 1 : 0) - (K.anyDown(['KeyW', 'ArrowUp']) ? 1 : 0);
      var inp = {
        mx: mx,
        my: my,
        interact: K.anyPressed(['Space', 'KeyE']),
        dash: K.anyPressed(['ShiftLeft', 'ShiftRight', 'KeyQ']),
        click: clickQ,
        hold: (ptr.down && ptr.holdT > 0.22 && ptr.inside) ? { x: ptr.x, y: ptr.y } : null
      };
      clickQ = null;
      return [inp];
    }
    // 2-Player Co-op: Chef 1 (WASD + Space + Q), Chef 2 (Arrows + Enter/Slash + RightShift)
    clickQ = null;
    return [
      {
        mx: (K.down('KeyD') ? 1 : 0) - (K.down('KeyA') ? 1 : 0),
        my: (K.down('KeyS') ? 1 : 0) - (K.down('KeyW') ? 1 : 0),
        interact: K.anyPressed(['Space', 'KeyE']),
        dash: K.anyPressed(['KeyQ', 'ShiftLeft'])
      },
      {
        mx: (K.down('ArrowRight') ? 1 : 0) - (K.down('ArrowLeft') ? 1 : 0),
        my: (K.down('ArrowDown') ? 1 : 0) - (K.down('ArrowUp') ? 1 : 0),
        interact: K.anyPressed(['Enter', 'NumpadEnter', 'Slash']),
        dash: K.pressed('ShiftRight')
      }
    ];
  }

  /* --------------------------------------------------------------- events */
  function addFloat(x, y, text, color, size) {
    floats.push({ x: x, y: y, text: text, color: color, size: size || 30, t: 0 });
    if (floats.length > 12) floats.shift();
  }

  function handleEvents() {
    for (var i = 0; i < world.ev.length; i++) {
      var e = world.ev[i];
      switch (e.t) {
        case 'pickup': J.pop(0.35); break;
        case 'place': J.tap(); break;
        case 'assemble':
          J.pop(0.5);
          if (!calm()) fx.burst(e.x, e.y, { count: 8, colors: ['#ffffff', '#ffd23f'], speed: 150, life: 0.4, size: 5, gravity: 120 });
          break;
        case 'chop': J.tap(); break;
        case 'chopped':
          J.chime(1);
          addFloat(e.x, e.y - 26, 'جاهز!', '#34d399', 26);
          if (!calm()) fx.burst(e.x, e.y, { count: 12, colors: ['#ef4444', '#34d399', '#ffffff'], speed: 180, life: 0.45, size: 5, gravity: 180 });
          break;
        case 'cookStart': J.pop(0.4); break;
        case 'cooked':
          J.chime(2);
          addFloat(e.x, e.y - 28, 'نضج!', '#ffd23f', 26);
          break;
        case 'warn': J.tap(); break;
        case 'burn':
          Kit.track.miss();
          J.error();
          addFloat(e.x, e.y - 28, 'أوبس!', '#cbd5e1', 26);
          if (!calm()) shake.add(3);
          break;
        case 'toss':
          J.pop(0.45);
          addFloat(e.x, e.y - 24, 'بوف!', '#38bdf8', 25);
          if (!calm()) fx.burst(e.x, e.y, { count: 14, colors: ['#38bdf8', '#ff5d9e', '#ffd23f', '#34d399'], speed: 210, life: 0.5, size: 6, gravity: 200 });
          break;
        case 'plateReturn': J.pop(0.25); break;
        case 'dash':
          J.whoosh(0.35);
          if (!calm()) fx.burst(e.x, e.y + 12, { count: 7, colors: ['#ffffff', '#bae6fd'], speed: 120, life: 0.3, size: 5, gravity: 0 });
          break;
        case 'wrongOrder':
          J.error();
          addFloat(e.x, e.y - 22, '؟', '#fda4af', 32);
          break;
        case 'serve':
          Kit.track.hit();
          J.coin(Math.min(5, world.streak));
          J.chime(2);
          addFloat(e.x, e.y - 28, '+' + e.coins, '#ffd23f', 34);
          if (!calm()) {
            fx.burst(e.x, e.y - 10, { count: 22, colors: ['#ffd23f', '#ffffff', '#34d399', '#ff5d9e'], speed: 290, life: 0.7, size: 7, gravity: 240 });
            shake.add(2.5);
          }
          break;
        case 'expire':
          Kit.track.miss();
          J.error();
          break;
        case 'bell':
          onBell();
          break;
      }
    }
    world.ev.length = 0;
  }

  /* ----------------------------------------------------------- main loop */
  function playStep(dt) {
    if (celebrate > 0) {
      celebrate -= dt;
      if (celebrate <= 0) showResult();
      return;
    }
    var inputs = buildChefInputs(dt);
    RK.step(world, dt, inputs);
    handleEvents();
    if (intro > 0) intro = Math.max(0, intro - dt);
  }

  function update(dt) {
    handleMenuKeys();
    if (screen === 'pause') {
      Kit.keys.endFrame();
      return;
    }
    time += dt;
    if (screen === 'play' && world) playStep(dt);
    if (!calm()) {
      fx.update(dt);
      shake.update(dt);
    } else {
      fx.clear();
    }
    for (var i = floats.length - 1; i >= 0; i--) {
      floats[i].t += dt;
      if (!calm()) floats[i].y -= dt * 36;
      if (floats[i].t > 1.05) floats.splice(i, 1);
    }
    if (screen === 'result' && result) resultStep(dt);
    if (resultLock > 0) resultLock = Math.max(0, resultLock - dt);
    Kit.keys.endFrame();
  }

  /* --------------------------------------------------------------- render */
  function drawIntroBanner(ctx, still) {
    if (intro <= 0 || world.done) return;
    var a = Math.min(1, intro / 0.45, (2.4 - intro) / 0.25 + 0.25);
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    var wd = RK.WORLDS[world.world];
    var y = 430 + (still ? 0 : Math.max(0, intro - 2.1) * 40);
    var bw = players === 2 ? 560 : 490, bx = (W - bw) / 2;
    A.rr(ctx, bx, y - 42, bw, 84, 30);
    ctx.fillStyle = 'rgba(35,20,12,0.9)'; ctx.fill();
    ctx.lineWidth = 4.5; ctx.strokeStyle = wd.color; ctx.stroke();
    A.text(ctx, world.R.name, W / 2, y - 12, 34, '#fffdf7', { stroke: false });
    var sub = players === 2 ? 'طاهي 1: WASD + مسافة   |   طاهي 2: الأسهم + Enter' : 'تحرّك بالأسهم أو الفأرة • مسافة للتفاعل';
    A.text(ctx, sub, W / 2, y + 22, 20, '#fde047', { stroke: false });
    ctx.restore();
  }

  function drawWorld(ctx) {
    var still = calm();
    ctx.drawImage(A.room(world, pixelScale()), 0, 0, W, H);
    A.orders(ctx, world, time, still);
    A.stations(ctx, world, time, still);

    // Sort chefs by Y for clean overlap depth
    var sorted = world.chefs.slice().sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < sorted.length; i++) {
      var ch = sorted[i];
      var apIdx = ch.id === 0 ? save.apron : (save.apron + 2) % RK.APRONS.length;
      var htIdx = ch.id === 0 ? save.hat : (save.hat + (save.hat === 0 ? 1 : 0)) % RK.HATS.length;
      A.chef(ctx, ch, { apron: apIdx, hat: htIdx, t: time, still: still, twoPlayer: world.players === 2 });
    }

    if (!still) fx.draw(ctx);
    for (var j = 0; j < floats.length; j++) {
      var f = floats[j];
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, f.t - 0.6) / 0.45);
      A.text(ctx, f.text, f.x, f.y, f.size, f.color);
    }
    ctx.globalAlpha = 1;
    A.hud(ctx, world, time, still);
    drawIntroBanner(ctx, still);
  }

  function drawMenu(ctx) {
    var still = calm(), ps = pixelScale();
    if (screen === 'title') {
      A.titleScene(ctx, save, time, still, ps);
    } else {
      var wdIdx = screen === 'map' ? Math.floor(RK.nextLevel(save) / 3) : 1;
      ctx.drawImage(A.backdrop(wdIdx, ps), 0, 0, W, H);
    }
    if (!still) fx.draw(ctx);
  }

  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    var ctx = view.ctx;
    ctx.save();
    if (!calm()) ctx.translate(shake.x, shake.y);
    if (world && (screen === 'play' || screen === 'pause' || screen === 'result')) drawWorld(ctx);
    else drawMenu(ctx);
    ctx.restore();
  }

  canvas.addEventListener('contextrestored', function () {
    A.reset();
    dirty = true;
    if (screen === 'shop') refreshShop();
  });
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'مطبخ 5').then(function () {
      dirty = true;
      if (screen === 'shop') refreshShop();
    }, function () { /* fallback fonts */ });
  }

  /* --------------------------------------------------- test & debug hook */
  var pagePoint = function (x, y) {
    var r = canvas.getBoundingClientRect();
    return { x: r.left + x * view.scale, y: r.top + y * view.scale };
  };
  var r1 = function (v) { return Math.round(v * 10) / 10; };
  var clone = function (v) { return v == null ? null : JSON.parse(JSON.stringify(v)); };

  window.__game = {
    get state() {
      var w = world;
      return {
        screen: screen,
        paused: screen === 'pause',
        players: players,
        level: cur,
        id: w ? w.R.id : '',
        time: w ? Math.round(w.t * 100) / 100 : 0,
        timeLeft: w ? Math.round(w.timeLeft * 100) / 100 : 0,
        chefs: w ? w.chefs.map(function (c) {
          return {
            id: c.id, x: r1(c.x), y: r1(c.y), vx: r1(c.vx), vy: r1(c.vy),
            held: clone(c.held), onIce: c.onIce, dashT: r1(c.dashT), moved: c.moved, focus: clone(c.focus)
          };
        }) : [],
        orders: w ? clone(w.orders) : [],
        served: w ? w.served : 0,
        coins: w ? w.coins : 0,
        goals: w ? w.goals.slice() : [],
        stars: result ? result.stars : (w ? RK.stars(w) : 0),
        atStart: !!(w && w.served === 0 && w.coins === 0 && w.chefs.every(function (c) {
          return !c.moved && Math.hypot(c.x - c.sx, c.y - c.sy) < 0.5;
        })),
        fx: fx.list.length,
        shake: shake.power,
        celebrate: celebrate > 0
      };
    },
    get stations() {
      return world ? world.stations.map(function (s) {
        return {
          c: s.c, r: s.r, x: s.x, y: s.y, type: s.type, kind: s.kind || null,
          plates: s.plates || 0, item: clone(s.item), cook: clone(s.cook)
        };
      }) : [];
    },
    get save() { return clone(save); },
    point: pagePoint
  };

  buildMap();
  buildShop();
  Kit.muteButton();
  Kit.lifecycle({
    pause: function () { pause(false); },
    reset: function () { ptr.down = false; ptr.holdT = 0; clickQ = null; }
  });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
