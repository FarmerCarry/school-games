/* Magic Crayon (القلم السحري): screens, mouse/touch & keyboard crayon drawing,
 * wordless coach hand on Level 1, DDA parameters, telemetry, shop, saves, and SFX. */
(function () {
  'use strict';
  var A = MC.art, J = Kit.juice, W = MC.W, H = MC.H;
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
  var CELEBRATE = 1.25, POP_WAIT = 0.95;

  /* ---------------------------------------------------------------- save */
  var store = Kit.store('magic-crayon');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = MC.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  var dda = Kit.dda('magic-crayon', { id: 'main', start: 0.3 });

  /* --------------------------------------------------------------- state */
  var screen = 'title', cur = 0, world = null, time = 0, tried = false;
  var celebrate = 0, popTimer = 0, result = null, resultT = 0, resultLock = 0, intro = 0;
  var ghostStrokes = [], floats = [], bubbles = [], trail = [], trailGap = 0, lastX = 0, lastY = 0;
  var drawSfxCd = 0;
  var coach = { idle: 0, on: false, t: 0 };
  var ptr = { x: W / 2, y: H / 2, inside: false, down: false };
  var kbd = { x: 480, y: 360, active: false, drawing: false };
  var ptrMoves = [], ptrBegin = null, ptrEnd = false, ptrErase = null;

  /* ------------------------------------------------------------- screens */
  var SCREENS = { title: 'scrTitle', map: 'scrMap', pause: 'scrPause', result: 'scrResult', shop: 'scrShop' };
  function setScreen(name) {
    screen = name;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    dirty = true;
    setCursor('');
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(msg) { $('live').textContent = msg; }
  function chip(id, val) { $(id).querySelector('b').textContent = String(val); }
  var curClass = '';
  function setCursor(c) { if (c !== curClass) { curClass = c; canvas.className = c; } }
  function wiggle(el) {
    if (calm()) return;
    el.classList.remove('wiggle');
    void el.offsetWidth;
    el.classList.add('wiggle');
    setTimeout(function () { el.classList.remove('wiggle'); }, 460);
  }

  function syncRollBtn() {
    var btn = $('btnRoll');
    var rolling = !!(world && world.rolling);
    btn.classList.toggle('rolling', rolling);
    btn.classList.toggle('ring', !rolling && !!(world && world.strokes.length > 0));
    btn.querySelector('span').textContent = rolling ? 'يتدحرج!' : 'انطلق!';
  }

  function toTitle() {
    leaveLevel();
    chip('titleStars', MC.totalStars(save) + '/' + (MC.LEVELS.length * 3));
    chip('titleCoins', save.coins);
    setScreen('title');
  }

  function playFromTitle() {
    J.select();
    if (!MC.totalStars(save)) startLevel(0, false);
    else toMap();
  }

  /* ----------------------------------------------------------------- map */
  var levelBtns = [], worldRows = [];
  function buildMap() {
    var box = $('worlds');
    MC.WORLDS.forEach(function (wd, wi) {
      var row = document.createElement('div');
      row.className = 'wrow';
      row.style.setProperty('--wc', wd.color);
      row.innerHTML = '<div class="wname"><i>الدفتر ' + (wi + 1) + '</i><b>' + wd.name + '</b></div>';
      for (var k = 0; k < MC.PER_WORLD; k++) {
        (function (idx, num) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'mc-btn lvl';
          b.innerHTML = '<b>' + num + '</b><span class="st">' + '<svg><use href="#i-star"/></svg>'.repeat(3) + '</span><svg class="lk" aria-hidden="true"><use href="#i-lock"/></svg>';
          on(b, function () { pickLevel(idx, b); });
          row.appendChild(b);
          levelBtns.push(b);
        })(wi * MC.PER_WORLD + k, k + 1);
      }
      box.appendChild(row);
      worldRows.push(row);
    });
  }

  function refreshMap() {
    var next = MC.nextLevel(save);
    levelBtns.forEach(function (b, i) {
      var open = MC.isOpen(save, i), st = save.lv[i].s, R = MC.LEVELS[i];
      b.classList.toggle('locked', !open);
      b.classList.toggle('next', open && i === next);
      b.querySelectorAll('.st svg').forEach(function (s, k) { s.classList.toggle('on', k < st); });
      b.setAttribute('aria-label', R.id + ' ' + R.name + (open ? '، ' + st + ' من 3 نجوم' : ' (مقفلة)'));
    });
    worldRows.forEach(function (r, wi) { r.classList.toggle('locked', !MC.isOpen(save, wi * MC.PER_WORLD)); });
    chip('mapStars', MC.totalStars(save) + '/' + (MC.LEVELS.length * 3));
  }

  function toMap() {
    leaveLevel();
    refreshMap();
    setScreen('map');
    J.whoosh(0.35);
  }

  function pickLevel(i, el) {
    if (!MC.isOpen(save, i)) { J.error(); wiggle(el); return; }
    J.select();
    ghostStrokes = [];
    startLevel(i, false);
  }

  /* ---------------------------------------------------------------- shop */
  var tiles = { crayon: [], skin: [] };
  function buildShop() {
    [['crayon', MC.CRAYONS, 'shelfColors'], ['skin', MC.SKINS, 'shelfSkins']].forEach(function (grp) {
      var kind = grp[0], list = grp[1], id = grp[2];
      list.forEach(function (item, k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'mc-btn tile';
        b.innerHTML = '<canvas width="240" height="240"></canvas><b>' + item.name + '</b><span class="price"><i class="coin"></i><em>' + item.price + '</em></span>';
        on(b, function () { buyItem(kind, k, b); });
        $(id).appendChild(b);
        tiles[kind].push(b);
      });
    });
  }

  function drawTile(kind, k, c) {
    var g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, 120, 120);
    if (kind === 'crayon') {
      var pts = [];
      for (var i = 0; i <= 10; i++) pts.push([18 + i * 7.5, 84 - Math.sin(i * 0.55) * 20]);
      A.stroke(g, pts, k, 0, true);
      A.crayonTool(g, 92, 74, k, 1, false);
    } else {
      A.glow(g, 60, 64, 42, MC.SKINS[k].body, 0.45);
      A.marble(g, 60, 66, { skin: k, scale: 1.55, lx: 0.35, ly: -0.1 });
    }
  }

  function refreshShop() {
    ['crayon', 'skin'].forEach(function (kind) {
      var isSkin = kind === 'skin';
      var own = isSkin ? save.skins : save.crayons;
      var wear = isSkin ? save.skin : save.crayon;
      var list = isSkin ? MC.SKINS : MC.CRAYONS;
      tiles[kind].forEach(function (b, k) {
        drawTile(kind, k, b.querySelector('canvas'));
        b.classList.toggle('own', !!own[k]);
        b.classList.toggle('wear', wear === k);
        b.classList.toggle('poor', !own[k] && save.coins < list[k].price);
        b.setAttribute('aria-label', list[k].name + (wear === k ? ' (مختار)' : own[k] ? '' : '، السعر ' + list[k].price));
      });
    });
    chip('shopCoins', save.coins);
  }

  function openShop() {
    leaveLevel();
    J.select();
    refreshShop();
    setScreen('shop');
  }

  function buyItem(kind, k, el) {
    var did = MC.buy(save, kind, k);
    if (!did) { J.error(); wiggle(el); return; }
    persist();
    if (did === 'bought') {
      J.coin(2);
      J.levelUp();
      if (!calm()) {
        var r = el.getBoundingClientRect(), p = view.toLogical(r.left + r.width / 2, r.top + r.height / 3);
        fx.burst(p.x, p.y, { count: 24, colors: ['#ffd166', '#ff5964', '#00d9f5', '#10b981'], speed: 300, life: 0.7, size: 7, gravity: 280 });
      }
    } else {
      J.tap();
    }
    refreshShop();
  }

  /* ---------------------------------------------------------------- play */
  function params() {
    var E = MC.EASY, D = MC.HARD;
    return {
      inkBonus: dda.value(E.inkBonus, D.inkBonus),
      cupMagnet: dda.value(E.cupMagnet, D.cupMagnet),
      bounceAssist: dda.value(E.bounceAssist, D.bounceAssist)
    };
  }

  function startLevel(i, keepGhost) {
    leaveLevel();
    if (cur !== i || !keepGhost) ghostStrokes = [];
    cur = i;
    world = MC.create(i, params());
    tried = true;
    resetPlayState();
    var rid = 'L' + (cur + 1);
    Kit.stats.round(rid);
    if (!save.coach && cur === 0) {
      Kit.stats.tutorial('start');
      coach.on = true;
      coach.t = 0;
    }
    intro = 2.4;
    syncRollBtn();
    setScreen('play');
    say(world.L.id + ' ' + world.L.name);
  }

  function resetPlayState() {
    fx.clear();
    floats = [];
    bubbles = [];
    trail = [];
    trailGap = 0;
    celebrate = 0;
    popTimer = 0;
    result = null;
    ptr.down = false;
    ptrMoves = [];
    ptrBegin = null;
    ptrEnd = false;
    ptrErase = null;
    kbd.drawing = false;
    kbd.active = false;
    var g = world.L.guide;
    kbd.x = g && g.length ? g[0][0] : clamp(world.ball.x + 180, 120, W - 120);
    kbd.y = g && g.length ? g[0][1] : clamp(world.ball.y + 40, 140, H - 80);
    coach.idle = 0;
    coach.on = false;
    coach.t = 0;
    lastX = world.ball.x;
    lastY = world.ball.y;
    Kit.keys.reset();
  }

  function snapshotGhost() {
    if (world && world.strokes.length) {
      ghostStrokes = world.strokes.map(function (st) {
        return st.pts.map(function (p) { return [p[0], p[1]]; });
      });
    }
  }

  function leaveLevel() {
    if (tried) {
      Kit.stats.end('quit');
      if (world && !world.done && !world.popped && world.rolling && world.rollT > 1.5) {
        dda.result(MC.outcome(false, 0));
      }
      tried = false;
    }
  }

  function restartLevel(keepGhost) {
    if (!world) return;
    if (keepGhost) snapshotGhost(); else ghostStrokes = [];
    J.tap();
    startLevel(cur, keepGhost);
  }

  function finishActiveInput() {
    if (world && world.active) MC.endStroke(world);
    ptr.down = false;
    ptrMoves = [];
    ptrBegin = null;
    ptrEnd = false;
    kbd.drawing = false;
    setCursor('');
  }

  function pause(own) {
    if (screen !== 'play') return;
    finishActiveInput();
    setScreen('pause');
    if (own) J.back();
  }

  function resume() {
    if (screen !== 'pause') return;
    J.select();
    ptrMoves = [];
    ptrBegin = null;
    ptrEnd = false;
    setScreen('play');
    Kit.keys.reset();
  }

  function launchBall() {
    if (!world || world.done || world.popped) return;
    if (!world.rolling) {
      MC.launch(world);
      coach.on = false;
      coach.idle = 0;
      syncRollBtn();
      J.whoosh(0.55);
    }
  }

  function undoStroke() {
    if (!world || world.done || world.popped) return;
    if (MC.undo(world)) {
      J.pop(0.35);
      syncRollBtn();
      dirty = true;
    } else {
      J.error();
      wiggle($('btnUndo'));
    }
  }

  /* --------------------------------------------------------- goal & pop */
  function onGoal() {
    var L = world.L;
    var stars = MC.stars(L, world.starsGot, world.inkUsed);
    var before = save.lv[cur].s;
    var res = MC.applyResult(save, cur, stars, world.inkUsed, world.stars);
    if (!save.coach) {
      save.coach = true;
      Kit.stats.tutorial('done');
    }
    persist();
    Kit.track.hit();
    dda.result(MC.outcome(true, stars));
    Kit.stats.end('win', stars);
    tried = false;
    ghostStrokes = [];
    result = {
      stars: stars,
      before: before,
      res: res,
      got: world.starsGot,
      all: L.stars.length,
      ink: Math.round(world.inkUsed),
      par: L.inkPar
    };
    celebrate = CELEBRATE;
    J.levelUp();
    if (!calm()) {
      fx.burst(L.cup.x, L.cup.y - 16, {
        count: 34,
        colors: ['#ffd166', '#ff5964', '#00d9f5', '#10b981', '#ffffff'],
        speed: 380,
        life: 0.95,
        size: 8,
        gravity: 340
      });
      shake.add(4);
    }
  }

  function onPop(ev) {
    Kit.track.miss();
    dda.result(MC.outcome(false, 0));
    Kit.stats.end('lose', 0);
    tried = false;
    popTimer = POP_WAIT;
    J.pop(0.6);
    addFloat(ev.x, ev.y - 30, ev.kind === 'slime' ? 'دغدغة!' : 'أوبس!', '#c084fc', 36);
    if (!calm()) {
      shake.add(6);
      for (var i = 0; i < 10; i++) {
        var a = (i / 10) * Math.PI * 2;
        bubbles.push({
          x: ev.x + Math.cos(a) * 10,
          y: ev.y + Math.sin(a) * 10,
          vx: Math.cos(a) * (60 + (i % 3) * 35),
          vy: -90 - (i % 4) * 35,
          r: 6 + (i % 3) * 4,
          t: 0
        });
      }
    }
  }

  function showResult() {
    var r = result, R = MC.LEVELS[cur];
    resultT = 0;
    resultLock = 0.45;
    $('resTitle').textContent = r.stars === 3 ? 'ممتاز!' : r.stars === 2 ? 'رائع!' : 'أحسنت!';
    $('resStars').querySelectorAll('svg').forEach(function (s, i) {
      s.classList.toggle('on', i < Math.min(r.before, r.stars));
      s.classList.remove('pop');
    });
    $('resPicked').querySelector('b').textContent = r.got + '/' + r.all;
    $('resPicked').classList.toggle('good', r.got >= r.all);
    $('resInk').querySelector('b').textContent = r.ink + ' / ' + r.par;
    $('resInk').classList.toggle('good', r.ink <= r.par);
    $('resCoins').querySelector('b').textContent = '+' + r.res.coins;
    $('resBest').hidden = true;
    $('resWorld').hidden = true;
    $('resNext').hidden = cur + 1 >= MC.LEVELS.length;
    say(R.id + '، ' + r.stars + ' نجوم');
    setScreen('result');
  }

  function resultStep(dt) {
    var r = result, before = resultT;
    resultT += dt;
    var at = function (t) { return before < t && resultT >= t; };
    var base = Math.min(r.before, r.stars);
    for (var i = base; i < r.stars; i++) {
      if (at(0.22 + (i - base) * 0.24)) {
        var s = $('resStars').children[i];
        s.classList.add('on', 'pop');
        J.star(i + 1);
        if (!calm()) fx.burst(540 + i * 100, 250, { count: 16, colors: ['#ffd166', '#ffffff'], speed: 260, life: 0.65, size: 7, gravity: 280 });
      }
    }
    var late = 0.3 + Math.max(0, r.stars - base) * 0.24;
    if (at(late)) {
      if (r.res.best) { $('resBest').hidden = false; J.chime(2); }
      if (r.res.world >= 0) { $('resWorld').hidden = false; J.levelUp(); }
      else if (r.res.coins > 0) J.coin(Math.min(3, r.res.coins));
    }
  }

  function resultNext() {
    if (!result || resultLock > 0) return;
    if (cur + 1 >= MC.LEVELS.length) { J.back(); toMap(); return; }
    J.select();
    ghostStrokes = [];
    startLevel(cur + 1, false);
  }

  function resultAgain() {
    if (result && resultLock <= 0) {
      J.select();
      ghostStrokes = [];
      startLevel(cur, false);
    }
  }

  /* --------------------------------------------------------------- input */
  function on(el, fn) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.detail > 1) return;
      Kit.audio.unlock();
      if (e.detail > 0) { el.blur(); focusGame(); }
      fn(e);
    });
  }

  on($('btnPlay'), playFromTitle);
  on($('btnLevels'), function () { J.select(); toMap(); });
  on($('btnShop'), openShop);
  on($('mapHome'), function () { J.back(); toTitle(); });
  on($('shopBack'), function () { J.back(); toTitle(); });
  on($('btnPause'), function () { pause(true); });
  on($('btnRetry'), function () { restartLevel(true); });
  on($('btnUndo'), undoStroke);
  on($('btnRoll'), launchBall);
  on($('btnResume'), resume);
  on($('btnRestart'), function () { restartLevel(false); });
  on($('btnMap'), function () { J.back(); toMap(); });
  on($('resNext'), resultNext);
  on($('resAgain'), resultAgain);
  on($('resMap'), function () { if (resultLock <= 0) { J.back(); toMap(); } });

  var toLogical = function (e) { return view.toLogical(e.clientX, e.clientY); };
  var inFrame = function (p) { return p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H; };

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  canvas.addEventListener('pointerdown', function (e) {
    focusGame();
    if (screen === 'play') Kit.audio.unlock();
    var p = toLogical(e);
    ptr.x = p.x;
    ptr.y = p.y;
    ptr.inside = inFrame(p);
    kbd.active = false;
    if (screen !== 'play' || !ptr.inside || p.y < 80) return;
    if (e.button === 2) {
      ptrErase = { x: p.x, y: p.y };
      return;
    }
    if (e.button !== 0) return;
    ptr.down = true;
    ptrBegin = { x: p.x, y: p.y };
    coach.idle = 0;
  });

  window.addEventListener('pointermove', function (e) {
    var list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    var evs = list && list.length ? list : [e];
    for (var i = 0; i < evs.length; i++) {
      var p = toLogical(evs[i]);
      if (ptr.down && screen === 'play' && inFrame(p)) ptrMoves.push([p.x, p.y]);
    }
    if (ptrMoves.length > 120) ptrMoves.splice(0, ptrMoves.length - 120);
    var curP = toLogical(e);
    ptr.x = curP.x;
    ptr.y = curP.y;
    ptr.inside = inFrame(curP);
    if (ptr.down && e.buttons === 0) {
      ptr.down = false;
      ptrEnd = true;
    }
  });

  window.addEventListener('pointerup', function (e) {
    if (e.button === 0 && ptr.down) {
      ptr.down = false;
      ptrEnd = true;
    }
  });
  window.addEventListener('pointercancel', function () {
    if (ptr.down) { ptr.down = false; ptrEnd = true; }
  });

  function handleKeys(dt) {
    var K = Kit.keys, go = K.anyPressed(KEYS_GO);
    if (screen === 'title') {
      if (go) playFromTitle();
    } else if (screen === 'map') {
      if (go) { J.select(); ghostStrokes = []; startLevel(MC.nextLevel(save), false); }
      else if (K.pressed('Escape')) { J.back(); toTitle(); }
    } else if (screen === 'shop') {
      if (go || K.pressed('Escape')) { J.back(); toTitle(); }
    } else if (screen === 'play' && world) {
      if (K.anyPressed(['KeyP', 'Escape'])) { pause(true); return; }
      if (K.pressed('KeyR') && !celebrate) { restartLevel(true); return; }
      if (K.anyPressed(['KeyZ', 'Backspace']) && !celebrate) { undoStroke(); return; }
      if (K.anyPressed(KEYS_GO) && !celebrate && !popTimer) launchBall();

      // Keyboard accessibility: move crayon cursor with Arrows/WASD and hold Shift to draw!
      var kx = (K.anyDown(['ArrowRight', 'KeyD']) ? 1 : 0) - (K.anyDown(['ArrowLeft', 'KeyA']) ? 1 : 0);
      var ky = (K.anyDown(['ArrowDown', 'KeyS']) ? 1 : 0) - (K.anyDown(['ArrowUp', 'KeyW']) ? 1 : 0);
      if (kx || ky) {
        kbd.active = true;
        var norm = kx && ky ? 0.7071 : 1;
        kbd.x = clamp(kbd.x + kx * norm * 420 * dt, 24, W - 24);
        kbd.y = clamp(kbd.y + ky * norm * 420 * dt, 88, H - 24);
        coach.idle = 0;
      }
      var shift = K.anyDown(['ShiftLeft', 'ShiftRight']);
      if (shift && !celebrate && !popTimer && !world.done && !world.popped) {
        kbd.active = true;
        if (!kbd.drawing) {
          kbd.drawing = true;
          MC.beginStroke(world, kbd.x, kbd.y);
        } else {
          MC.moveStroke(world, kbd.x, kbd.y);
        }
      } else if (kbd.drawing) {
        kbd.drawing = false;
        MC.endStroke(world);
      }
    } else if (screen === 'pause') {
      if (K.anyPressed(['KeyP', 'Escape', 'Enter', 'NumpadEnter', 'Space'])) resume();
      else if (K.pressed('KeyR')) restartLevel(false);
    } else if (screen === 'result' && resultLock <= 0) {
      if (go) resultNext();
      else if (K.pressed('KeyR')) resultAgain();
      else if (K.pressed('Escape')) { J.back(); toMap(); }
    }
  }

  /* -------------------------------------------------------------- events */
  function addFloat(x, y, txt, color, size) {
    floats.push({ x: x, y: y, text: txt, color: color, size: size || 30, t: 0 });
    if (floats.length > 8) floats.shift();
  }

  function softWaxTick() {
    if (drawSfxCd > 0) return;
    drawSfxCd = 0.045;
    var a = Kit.audio;
    if (!a.ctx || a.muted) return;
    a.tone({ freq: 290 + ((world.strokes.length * 37) % 120), to: 360, type: 'triangle', dur: 0.025, vol: 0.04 });
  }

  function handleEvents() {
    var evs = world.ev;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      switch (e.t) {
        case 'draw':
          softWaxTick();
          coach.on = false;
          coach.idle = 0;
          if (!save.coach && world.inkUsed > 90) {
            save.coach = true;
            Kit.stats.tutorial('done');
          }
          syncRollBtn();
          if (!calm() && ((world.inkUsed | 0) % 3 === 0)) {
            fx.burst(e.x, e.y, { count: 2, colors: [MC.CRAYONS[save.crayon].color, '#ffffff'], speed: 70, life: 0.25, size: 3.5, gravity: 120 });
          }
          break;
        case 'strokeEnd':
          syncRollBtn();
          break;
        case 'noInk':
          J.error();
          addFloat(clamp(e.x, 90, W - 90), Math.max(120, e.y - 26), 'انتهى الحبر!', '#ff5964', 28);
          break;
        case 'bounce':
          J.bounce();
          if (!calm()) {
            fx.burst(e.x, e.y, { count: 12, colors: ['#ff75b5', '#ffd166', '#ffffff'], speed: 220, life: 0.45, size: 6, gravity: 240 });
            shake.add(2.5);
          }
          break;
        case 'wind':
          J.whoosh(0.28);
          break;
        case 'grav':
          J.toggle(e.dir < 0);
          addFloat(e.x, e.y - 24, e.dir < 0 ? 'جاذبية للأعلى!' : 'جاذبية للأسفل!', '#a855f7', 26);
          break;
        case 'portal':
          J.chime(1);
          if (!calm()) {
            var po = world.L.portals[e.i];
            fx.burst(e.fx, e.fy, { count: 12, colors: [po.color, '#ffffff'], speed: 200, life: 0.45, size: 5, gravity: 0 });
            fx.burst(e.x, e.y, { count: 14, colors: [po.color2 || po.color, '#ffffff'], speed: 240, life: 0.5, size: 6, gravity: 0 });
          }
          break;
        case 'star':
          Kit.track.hit();
          J.star(world.starsGot);
          addFloat(e.x, e.y - 24, '+1', '#f59e0b', 32);
          if (!calm()) {
            fx.burst(e.x, e.y, { count: 18, colors: ['#ffd166', '#ffffff', '#ff9f1c'], speed: 250, life: 0.6, size: 6.5, gravity: 220 });
          }
          break;
        case 'ballCup':
          if (world.balls.length > 1 && !world.done) {
            J.chime(1);
            addFloat(e.x, e.y - 36, 'بقي الصديق!', '#10b981', 28);
          }
          break;
        case 'pop':
          onPop(e);
          break;
        case 'goal':
          onGoal();
          break;
      }
    }
    evs.length = 0;
  }

  /* ---------------------------------------------------------------- loop */
  function playStep(dt) {
    if (drawSfxCd > 0) drawSfxCd = Math.max(0, drawSfxCd - dt);

    if (celebrate > 0) {
      MC.step(world, dt);
      world.ev.length = 0;
      celebrate -= dt;
      if (celebrate <= 0) showResult();
      return;
    }

    if (popTimer > 0) {
      popTimer -= dt;
      if (popTimer <= 0) restartLevel(true);
      return;
    }

    // Apply queued pointer erase / begin / move / end actions on the game frame.
    if (ptrErase) {
      if (MC.eraseAt(world, ptrErase.x, ptrErase.y, 34)) { J.pop(0.35); syncRollBtn(); }
      ptrErase = null;
    }
    if (ptrBegin) {
      MC.beginStroke(world, ptrBegin.x, ptrBegin.y);
      ptrBegin = null;
    }
    for (var i = 0; i < ptrMoves.length; i++) {
      MC.moveStroke(world, ptrMoves[i][0], ptrMoves[i][1]);
    }
    ptrMoves.length = 0;
    if (ptrEnd) {
      MC.endStroke(world);
      ptrEnd = false;
    }

    MC.step(world, dt);
    handleEvents();

    // Wordless coach on Level 1 (or any guided level after 4s idle before drawing/rolling).
    var L = world.L;
    if (L.guide && !world.rolling && world.strokes.length === 0 && !ptr.down && !kbd.drawing) {
      coach.idle += dt;
      if (!coach.on && coach.idle >= (save.coach ? 4.0 : 0.4)) {
        coach.on = true;
        coach.t = 0;
      }
    } else {
      coach.idle = 0;
      coach.on = false;
    }
    if (coach.on) {
      coach.t += dt;
      if (coach.t > 3.15) {
        coach.on = false;
        coach.idle = save.coach ? 1.5 : 0.2;
      }
    }

    setCursor(ptr.down ? 'drawing' : '');
    if (intro > 0) intro = Math.max(0, intro - dt);
  }

  function trailStep() {
    if (!world || !world.rolling || world.popped) return;
    var b = world.ball;
    var d = Math.hypot(b.x - lastX, b.y - lastY);
    if (d > 80) { lastX = b.x; lastY = b.y; return; }
    trailGap += d;
    if (!calm() && trailGap > 11) {
      trailGap = 0;
      trail.push({ x: b.x, y: b.y, r: 5, t: 0, life: 0.36 });
      if (trail.length > 40) trail.shift();
    }
    lastX = b.x;
    lastY = b.y;
  }

  function decay(dt) {
    var i;
    for (i = floats.length - 1; i >= 0; i--) {
      floats[i].t += dt;
      if (!calm()) floats[i].y -= dt * 36;
      if (floats[i].t > 1.1) floats.splice(i, 1);
    }
    for (i = bubbles.length - 1; i >= 0; i--) {
      var bb = bubbles[i];
      bb.t += dt;
      bb.x += bb.vx * dt;
      bb.y += bb.vy * dt;
      if (bb.t > 0.85) bubbles.splice(i, 1);
    }
    for (i = trail.length - 1; i >= 0; i--) {
      trail[i].t += dt;
      if (trail[i].t >= trail[i].life) trail.splice(i, 1);
    }
  }

  function update(dt) {
    time += dt;
    handleKeys(dt);
    if (screen === 'play' && world) {
      playStep(dt);
      trailStep();
    } else {
      ptrMoves.length = 0;
      ptrBegin = null;
      ptrEnd = false;
      ptrErase = null;
    }
    if (screen !== 'pause') {
      fx.update(dt);
      shake.update(dt);
      decay(dt);
      if (fx.list.length > 260) fx.list.splice(0, fx.list.length - 260);
      if (screen === 'result' && result) resultStep(dt);
      if (resultLock > 0) resultLock = Math.max(0, resultLock - dt);
    }
    Kit.keys.endFrame();
  }

  /* -------------------------------------------------------------- render */
  function drawHudBar(ctx, still) {
    var L = world.L, wd = MC.WORLDS[L.world];
    var barX = 248, barY = 17, barW = 676, barH = 48;
    A.rr(ctx, barX, barY, barW, barH, 24);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = A.INK;
    ctx.stroke();

    // Level badge on the right side of the HUD pill (RTL).
    A.rr(ctx, barX + barW - 96, barY + 6, 88, 36, 18);
    ctx.fillStyle = wd.color;
    ctx.fill();
    A.text(ctx, L.id, barX + barW - 52, barY + 25, 24, '#ffffff', { stroke: false, dir: 'ltr' });

    // 3 level star slots next to the badge.
    for (var s = 0; s < 3; s++) {
      var sx = barX + barW - 126 - s * 34, sy = barY + 24;
      ctx.save();
      ctx.translate(sx, sy);
      A.starPath(ctx, 0, 0, 13, 6, 5);
      ctx.fillStyle = world.stars[2 - s] ? '#ffd166' : '#e2e8f0';
      ctx.fill();
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = A.INK;
      ctx.stroke();
      ctx.restore();
    }

    // Generous Crayon Ink Meter on the left half of the HUD pill!
    var mX = barX + 18, mY = barY + 12, mW = 408, mH = 24;
    A.rr(ctx, mX, mY, mW, mH, 12);
    ctx.fillStyle = '#f1f5f9';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = A.INK;
    ctx.stroke();

    var remFrac = clamp(1 - world.inkUsed / L.inkMax, 0, 1);
    var cr = MC.CRAYONS[save.crayon] || MC.CRAYONS[0];
    if (remFrac > 0.01) {
      ctx.save();
      A.rr(ctx, mX + 2, mY + 2, mW - 4, mH - 4, 10);
      ctx.clip();
      var fillW = (mW - 4) * remFrac;
      if (cr.rainbow) {
        var rg = ctx.createLinearGradient(mX, 0, mX + mW, 0);
        rg.addColorStop(0, '#ff5964');
        rg.addColorStop(0.33, '#ffd166');
        rg.addColorStop(0.66, '#10b981');
        rg.addColorStop(1, '#00b4d8');
        ctx.fillStyle = rg;
      } else {
        ctx.fillStyle = cr.color;
      }
      ctx.fillRect(mX + 2, mY + 2, fillW, mH - 4);
      ctx.restore();
    }

    // Par star marker tick on the ink meter!
    var parRemFrac = clamp(1 - L.inkPar / L.inkMax, 0.06, 0.94);
    var px = mX + 2 + (mW - 4) * parRemFrac;
    ctx.beginPath();
    ctx.moveTo(px, mY - 3);
    ctx.lineTo(px, mY + mH + 3);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = A.INK;
    ctx.stroke();
    ctx.save();
    ctx.translate(px, mY - 7);
    A.starPath(ctx, 0, 0, 8.5, 4, 5);
    ctx.fillStyle = world.inkUsed <= L.inkPar ? '#ffd166' : '#cbd5e1';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = A.INK;
    ctx.stroke();
    ctx.restore();

    // Brief level title banner at start of level.
    if (intro > 0 && !world.rolling && !world.done) {
      var a = clamp(Math.min(1, intro / 0.45, (2.4 - intro) / 0.25 + 0.25), 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      var by = 116 - (still ? 0 : Math.max(0, intro - 2.1) * 30);
      ctx.font = '700 32px Fredoka';
      var tw = ctx.measureText(L.name).width + 88;
      A.rr(ctx, 640 - tw / 2, by - 28, tw, 56, 28);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = wd.color;
      ctx.stroke();
      A.text(ctx, L.name, 640, by + 1, 31, A.INK, { stroke: false });
      ctx.restore();
    }
  }

  function drawPlayWorld(ctx) {
    var L = world.L, still = calm(), t = world.t;
    ctx.drawImage(A.stage(L, pixelScale()), 0, 0, W, H);

    // Ghost strokes from previous try & level dotted guide.
    if (ghostStrokes.length) A.ghostStrokes(ctx, ghostStrokes);
    if (L.guide && world.strokes.length === 0) A.guide(ctx, L.guide, t, still);

    // Interactive world gadgets.
    var i;
    for (i = 0; i < L.gravPads.length; i++) A.gravPad(ctx, L.gravPads[i], t, still);
    for (i = 0; i < L.fans.length; i++) A.fan(ctx, L.fans[i], t, still);
    for (i = 0; i < L.portals.length; i++) A.portal(ctx, L.portals[i], t, still);
    for (i = 0; i < L.slimes.length; i++) A.slime(ctx, L.slimes[i], t, still);
    for (i = 0; i < L.pads.length; i++) A.pad(ctx, L.pads[i], world.padBoing[i]);
    for (i = 0; i < L.gates.length; i++) A.gate(ctx, L.gates[i], world.gates[i].ang);

    // Player's waxy crayon strokes!
    for (i = 0; i < world.strokes.length; i++) {
      A.stroke(ctx, world.strokes[i].pts, save.crayon, t, still);
    }

    // Collectible floating stars & Golden Star Cup.
    for (i = 0; i < L.stars.length; i++) {
      if (!world.stars[i]) A.star(ctx, L.stars[i][0], L.stars[i][1], t, still);
    }
    A.cup(ctx, L.cup, world.done, t, still);

    // Soft motion trail behind rolling Karroum.
    for (i = 0; i < trail.length; i++) {
      var tr = trail[i], k = 1 - tr.t / tr.life;
      ctx.globalAlpha = k * 0.45;
      A.circle(ctx, tr.x, tr.y, tr.r * k + 2);
      ctx.fillStyle = MC.SKINS[save.skin].body;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Karroum & any rescue buddy marble!
    for (i = 0; i < world.balls.length; i++) {
      var b = world.balls[i];
      if (b.popped) continue;
      var lookX = world.rolling ? b.vx / 220 : (L.cup.x - b.x) / 400;
      var lookY = world.rolling ? b.vy / 220 : (L.cup.y - b.y) / 400;
      var hop = (!still && !world.rolling && !b.inCup) ? Math.sin(time * 3.5 + i) * 2 : 0;
      A.marble(ctx, b.x, b.y - hop, {
        skin: save.skin,
        ang: b.ang,
        grav: b.grav,
        buddy: i > 0,
        lx: lookX,
        ly: lookY,
        face: Math.hypot(b.vx, b.vy) > 360 || b.inWind ? 'wow' : 'smile'
      });
    }

    // Giggling slime pop bubbles!
    for (i = 0; i < bubbles.length; i++) {
      var bb = bubbles[i], ba = Math.max(0, 1 - bb.t / 0.85);
      ctx.globalAlpha = ba;
      A.circle(ctx, bb.x, bb.y, bb.r);
      ctx.fillStyle = '#e9d5ff';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#7e22ce';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Wordless coach hand on Level 1!
    if (coach.on && L.guide) {
      A.coachHand(ctx, L.guide, coach.t, save.crayon, still);
    }

    // Live crayon tool at active pointer or keyboard cursor!
    if (screen === 'play' && !world.done && !world.popped) {
      if (kbd.active) {
        A.circle(ctx, kbd.x, kbd.y, 7);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(30,27,75,0.5)';
        ctx.stroke();
        A.crayonTool(ctx, kbd.x, kbd.y, save.crayon, 0.95, kbd.drawing);
      } else if (ptr.down && ptr.inside) {
        A.crayonTool(ctx, ptr.x, ptr.y, save.crayon, 0.95, true);
      }
    }

    fx.draw(ctx);
    for (i = 0; i < floats.length; i++) {
      var fl = floats[i];
      ctx.globalAlpha = clamp(1 - Math.max(0, fl.t - 0.65) / 0.45, 0, 1);
      A.text(ctx, fl.text, fl.x, fl.y, fl.size, fl.color);
    }
    ctx.globalAlpha = 1;

    drawHudBar(ctx, still);
  }

  function drawMenuScene(ctx) {
    var still = calm(), ps = pixelScale();
    if (screen === 'title') {
      ctx.drawImage(A.backdrop(0, ps), 0, 0, W, H);
      // Cheerful decorative bridge & rolling Karroum along the bottom of the title page!
      var bridge = [];
      for (var i = 0; i <= 24; i++) {
        var bx = 170 + i * 36;
        var by = 636 - Math.sin((i / 24) * Math.PI) * 34;
        bridge.push([bx, by]);
      }
      A.stroke(ctx, bridge, save.crayon, time, still);
      A.cup(ctx, { x: 1090, y: 636 }, false, time, still);
      var prog = still ? 0.42 : ((time * 0.28) % 1);
      var idx = prog * (bridge.length - 1), k = idx | 0, f = idx - k;
      var p0 = bridge[k], p1 = bridge[Math.min(bridge.length - 1, k + 1)];
      var mx = p0[0] + (p1[0] - p0[0]) * f;
      var my = p0[1] + (p1[1] - p0[1]) * f - MC.BALL_R - MC.INK_R;
      A.marble(ctx, mx, my, { skin: save.skin, ang: prog * 18, lx: 0.8, ly: 0 });
      A.crayonTool(ctx, 995, 624, save.crayon, 0.92, false);
    } else {
      var wd = screen === 'map' ? Math.floor(MC.nextLevel(save) / MC.PER_WORLD) : 3;
      ctx.drawImage(A.backdrop(wd, ps), 0, 0, W, H);
    }
    fx.draw(ctx);
  }

  function render() {
    if (screen === 'pause' && !dirty) return;
    dirty = false;
    var ctx = view.ctx;
    ctx.save();
    ctx.translate(shake.x, shake.y);
    if (world && (screen === 'play' || screen === 'pause' || screen === 'result')) drawPlayWorld(ctx);
    else drawMenuScene(ctx);
    ctx.restore();
  }

  canvas.addEventListener('contextrestored', function () {
    A.reset();
    dirty = true;
    if (screen === 'shop') refreshShop();
  });
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'القلم 5').then(function () {
      dirty = true;
      if (screen === 'shop') refreshShop();
    }, function () { /* fallback fonts */ });
  }

  /* --------------------------------------------------- test and debug hook */
  var pagePoint = function (x, y) {
    var r = canvas.getBoundingClientRect();
    return { x: r.left + x * view.scale, y: r.top + y * view.scale };
  };
  var r1 = function (v) { return Math.round(v * 10) / 10; };

  window.__game = {
    get state() {
      var w = world;
      return {
        screen: screen,
        paused: screen === 'pause',
        level: cur,
        id: w ? w.L.id : '',
        time: w ? Math.round(w.t * 1000) / 1000 : 0,
        rolling: !!(w && w.rolling),
        strokes: w ? w.strokes.length : 0,
        inkUsed: w ? r1(w.inkUsed) : 0,
        inkMax: w ? w.L.inkMax : 0,
        inkPar: w ? w.L.inkPar : 0,
        ball: w ? { x: r1(w.ball.x), y: r1(w.ball.y) } : { x: 0, y: 0 },
        balls: w ? w.balls.map(function (b) { return { x: r1(b.x), y: r1(b.y), inCup: b.inCup }; }) : [],
        starsGot: w ? w.starsGot : 0,
        done: !!(w && w.done),
        popped: !!(w && w.popped),
        coach: coach.on,
        ghosts: ghostStrokes.length,
        stars: result ? result.stars : 0,
        celebrate: celebrate > 0,
        trail: trail.length,
        fx: fx.list.length,
        shake: shake.power,
        tier: dda.tier
      };
    },
    get save() { return JSON.parse(JSON.stringify(save)); },
    point: pagePoint,
    get guide() { return world && world.L.guide ? world.L.guide.slice() : []; }
  };

  buildMap();
  buildShop();
  Kit.muteButton();
  Kit.lifecycle({
    pause: function () { pause(false); },
    reset: function () { finishActiveInput(); }
  });
  toTitle();
  Kit.loop(update, render);
  Kit.ready();
})();
