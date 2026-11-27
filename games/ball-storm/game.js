/* Ball Storm (عاصفة الكرات): screens, input, saves, the level map, the shop, sounds, the
 * HUD and play statistics. engine.js plays the bricks and balls; art.js draws them. This is
 * the UI layer: it reads Kit.dda at the start of every try (ball speed, paddle width, how
 * often capsules drop) and reports each try back to it, and it reports every try as a
 * round (Kit.stats).
 */
(function () {
  'use strict';
  var W = 1280, H = 720, M = Math, F = BS.F;
  var J = Kit.juice, AU = Kit.audio;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ui = $('ui');
  var calm = function () { return Kit.motion.reduced(); };
  var dirty = true, view = null;
  var fit = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: function (v) {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    if (view) view.setRatio(v.scale * v.dpr);
    dirty = true;
  } });
  var ctx = fit.ctx;

  /* ---------------------------------------------------------------- save */
  var store = Kit.store('ball-storm');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = BS.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // Ball speed, paddle width and capsule drops follow how the tries go on this PC; the
  // endless mode has its own controller for how fast the rows come down.
  var dda = Kit.dda('ball-storm', { id: 'main', target: 0.72 });
  var ddaEndless = Kit.dda('ball-storm', { id: 'endless', target: 0.6 });
  function seed() { return (M.random() * 2147483647) | 0; }
  function params(level) {
    if (!level) return { level: 0, speed: ddaEndless.value(400, 560), paddle: ddaEndless.value(190, 150), drop: 0.08, magnet: ddaEndless.value(0.5, 0), descent: ddaEndless.value(3.4, 7.5), seed: seed() };
    return { level: level, speed: dda.value(380, 560), paddle: dda.value(200, 150), drop: dda.value(0.12, 0.05), magnet: level <= 2 ? 0.9 : dda.value(0.6, 0), seed: seed() };
  }

  /* --------------------------------------------------------------- state */
  var screen = 'title', world = null, demo = null, level = 1, time = 0, roundOpen = false;
  var floats = [], banner = null, fx = Kit.particles(), shake = Kit.shake();
  var mouse = { on: false, x: 640, lx: -1, ly: -1 };
  var inp = { dir: 0, target: null, launch: false }, launchReq = false;
  var sq = 0, bump = 0, flash = 0, hitAt = -9, sfxAt = {}, chain = 0, chainAt = -9, storm = 0, coach = 0, coachT = 0;
  var result = null, resT = 0, resShown = 0, shopFrom = 'title', partBudget = 0;
  var WORLD_COLORS = [['#ff6fc4', '#ffe14f', '#4fd8ff', '#b36bff', '#3ddc84'], ['#4fd8ff', '#ffe14f', '#ffffff', '#b36bff', '#ff6fc4'], ['#4fd8ff', '#3ddc84', '#ffe14f', '#ff9a2e', '#ffffff']];
  // A number with its sign kept left-to-right inside Arabic text (canvas and DOM).
  function ltr(t) { return '\u2066' + t + '\u2069'; }
  var POWER_NAME = { x3: 'كل كرة ' + ltr('×3') + '!', plus: ltr('+10') + ' كرات!', big: 'مضرب عملاق!', fire: 'كرات نارية!', slow: 'حركة بطيئة!', sticky: 'مضرب لاصق!', shield: 'درع الفقاعة!' };
  var STORMS = [[10, 'عاصفة!'], [50, 'إعصار كرات!'], [100, 'مئة كرة!'], [250, 'جنون الكرات!'], [500, 'العاصفة الكبرى!']];
  var CHEERS = ['رائع!', 'واو!', 'مذهل!', 'بطل!', 'خرافي!'];

  var SCREENS = { title: 'scrTitle', levels: 'scrLevels', shop: 'scrShop', pause: 'scrPause', result: 'scrResult' };
  function setScreen(name) {
    screen = name;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    Kit.keys.reset();
    launchReq = false;
    dirty = true;
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function fmt(n) { return Kit.fmt(n); }
  function sfx(name, gap) {
    if (time - (sfxAt[name] || -9) < gap) return false;
    sfxAt[name] = time;
    return true;
  }

  /* ------------------------------------------------------------ the title */
  function refreshTitle() {
    var next = BS.nextLevel(save), open = BS.endlessOpen(save);
    $('titleLevel').querySelector('b').textContent = next ? String(next) : '∞';
    $('titleStars').querySelector('b').textContent = String(BS.totalStars(save));
    $('titleStorm').querySelector('b').textContent = '×' + save.storm;
    $('titleStorm').hidden = save.storm < 3;
    $('btnEndless').classList.toggle('locked', !open);
    $('endlessLock').hidden = open;
    $('shopNew').hidden = !freshItems().length;
  }
  function toTitle() {
    if (roundOpen) { Kit.stats.end('quit'); roundOpen = false; }
    world = null;
    persist();
    refreshTitle();
    newDemo();
    setScreen('title');
  }
  function play() {
    J.select();
    startRound(BS.nextLevel(save));
  }
  function startRound(n) {
    if (n && !BS.levelOpen(save, n)) n = BS.nextLevel(save);
    if (!n && !BS.endlessOpen(save)) n = 1;
    level = n;
    if (roundOpen) Kit.stats.end('quit');
    world = BS.create(params(n));
    roundOpen = true;
    floats.length = 0; banner = null; fx.clear(); view.ghosts.length = 0; view.booms.length = 0;
    mouse.on = false; sq = 0; bump = 0; flash = 0; storm = 0; chain = 0; result = null;
    Kit.stats.round(n ? 'L' + n : 'endless');
    coach = save.coach ? 0 : 1; coachT = 0;
    if (coach) Kit.stats.tutorial('start');
    Kit.track.cue();
    setScreen('play');
    var spec = world.spec;
    showBanner(n ? 'المرحلة ' + n : 'بلا نهاية', '#fff', 1.5, n ? spec.name : 'لا تدع الصفوف تصل إلى الخط!');
    say(n ? 'المرحلة ' + n + ' ' + spec.name : 'بلا نهاية');
  }

  /* --------------------------------------------------------------- pause */
  function pause() {
    if (screen !== 'play') return;
    persist();
    J.back();
    setScreen('pause');
    say('استراحة');
  }
  function resume() {
    if (!world) { play(); return; }
    J.select();
    setScreen('play');
  }
  function restart() {
    J.select();
    startRound(level);
  }

  /* -------------------------------------------------------- round's end */
  function finish(won) {
    if (!roundOpen) return;
    roundOpen = false;
    var w = world, lives = w.lives;
    if (w.endless) {
      Kit.stats.end('end', w.score);
      ddaEndless.result(M.min(1, w.t / 150));
    } else if (won) {
      Kit.stats.end('win', w.score);
      dda.result(lives >= 3 ? 1 : lives === 2 ? 0.75 : 0.5);
    } else {
      Kit.stats.end('lose', w.score);
      dda.result(0);
    }
    var before = BS.totalStars(save);
    result = BS.record(save, w);
    result.won = won; result.before = before;
    if (coach) endCoach(world.moves > 8);
    persist();
  }
  function showResult() {
    if (!result) return;
    var w = world, won = result.won, card = $('scrResult').querySelector('.card');
    card.classList.toggle('lose', !won);
    $('resTitle').textContent = w.endless ? 'انتهت العاصفة!' : won ? CHEERS[(w.level + w.lives) % CHEERS.length] : 'أوبس!';
    $('resScore').textContent = fmt(w.score);
    $('resBest').hidden = !result.newBest;
    $('resStorm').textContent = w.endless ? 'أفضل نتيجة: ' + fmt(save.endless) : won ? 'أكبر عاصفة: ' + ltr('×' + w.maxBalls) : w.left <= 10 ? 'كنت قريبًا جدًا! باقي ' + w.left : 'حاول مرة أخرى!';
    var stars = $('resStars').querySelectorAll('.st');
    for (var i = 0; i < stars.length; i++) stars[i].classList.remove('on');
    $('resStars').hidden = !won || w.endless;
    var next = $('btnNext');
    next.hidden = !(won && !w.endless);
    var un = result.unlocked[0], u = $('resUnlock');
    u.hidden = !un;
    if (un) {
      u.querySelector('small').textContent = un.name;
      var c = u.querySelector('canvas').getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 120, 120);
      if (un.kind === 'ball') BS.drawBallIcon(c, BS.BALLS[un.i].id, 60, 60, 40);
      else { c.setTransform(0.55, 0, 0, 0.55, 0, 0); BS.drawPaddle(c, BS.PADDLES[un.i].id, 110, 112, 180, {}); }
    }
    resT = 0; resShown = 0;
    setScreen('result');
    if (won) say('فزت! ' + result.stars + ' نجوم'); else say('انتهت المحاولة');
    if (!won) J.fail();
    (won ? next : $('btnAgain')).focus({ preventScroll: true });
  }
  function resultTick(dt) {
    if (!result) return;
    resT += dt;
    var stars = $('resStars').querySelectorAll('.st');
    if (result.won && !world.endless && resShown < result.stars && resT > 0.35 + resShown * 0.32) {
      stars[resShown].classList.add('on');
      resShown++;
      J.star(resShown);
      Kit.stats.busy();
      if (resShown === result.stars && result.newBest) J.chime(3);
    }
  }
  function nextLevel() {
    J.select();
    if (!world || world.endless) { startRound(level); return; }
    var n = world.level + 1;
    startRound(n > BS.LEVELS.length ? (BS.endlessOpen(save) ? 0 : 1) : n);
  }
  function again() { J.select(); startRound(level); }

  /* ---------------------------------------------------------- level map */
  function buildLevels() {
    var box = $('worlds');
    box.innerHTML = '';
    BS.WORLDS.forEach(function (wd, wi) {
      var row = document.createElement('div'); row.className = 'world';
      row.innerHTML = '<h3>' + wd.name + '</h3><div class="lvls"></div>';
      var lv = row.querySelector('.lvls');
      BS.LEVELS.forEach(function (spec, i) {
        if (spec.world !== wi) return;
        var n = i + 1, open = BS.levelOpen(save, n), b = document.createElement('button');
        b.type = 'button'; b.className = 'lvl' + (open ? '' : ' locked') + (n === BS.nextLevel(save) ? ' next' : '');
        var st = save.stars[i];
        var marks = '';
        for (var s = 0; s < 3; s++) marks += '<svg class="' + (s < st ? 'on' : '') + '" aria-hidden="true"><use href="#i-star"/></svg>';
        b.innerHTML = '<canvas width="240" height="112"></canvas><b>' + n + '</b><span class="st">' + marks + '</span>';
        b.setAttribute('aria-label', 'المرحلة ' + n + ' ' + spec.name + (open ? '' : ' مقفلة'));
        thumb(b.querySelector('canvas'), spec);
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!BS.levelOpen(save, n)) { J.error(); b.classList.remove('wiggle'); void b.offsetWidth; b.classList.add('wiggle'); return; }
          J.select(); startRound(n);
        });
        lv.appendChild(b);
      });
      box.appendChild(row);
    });
    var e = document.createElement('button'), open = BS.endlessOpen(save);
    e.type = 'button'; e.className = 'lvl endless-btn' + (open ? '' : ' locked');
    e.innerHTML = '<svg aria-hidden="true"><use href="#i-inf"/></svg><span>بلا نهاية</span><small>' + (open ? (save.endless ? 'أفضل نتيجة ' + fmt(save.endless) : '') : 'افتحها بالفوز في المرحلة ' + BS.ENDLESS_AT) + '</small>';
    e.addEventListener('click', function (ev) { ev.stopPropagation(); endless(e); });
    box.appendChild(e);
    $('levelsStars').querySelector('b').textContent = String(BS.totalStars(save));
  }
  // A tiny picture of a level's bricks.
  function thumb(cv, spec) {
    var c = cv.getContext('2d'), p = BS.parse(spec), s = 240 / (F.COLS * F.CW) * 0.95;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    var minR = 99, maxR = 0;
    p.cells.forEach(function (cl) { var r = M.floor(cl.k / F.COLS); minR = M.min(minR, r); maxR = M.max(maxR, r); });
    var ch = (maxR - minR + 1) * F.CH * s, oy = (cv.height - ch) / 2 - minR * F.CH * s;
    p.cells.forEach(function (cl) {
      var x = 6 + (cl.k % F.COLS) * F.CW * s, y = oy + M.floor(cl.k / F.COLS) * F.CH * s;
      c.fillStyle = cl.t === BS.T.TNT ? '#ff3d4f' : BS.PAL[cl.col];
      c.fillRect(x + 1, y + 1, F.CW * s - 2, F.CH * s - 2);
    });
  }
  function openLevels() { J.select(); buildLevels(); setScreen('levels'); }
  function endless(el) {
    if (!BS.endlessOpen(save)) {
      J.error();
      el = el || $('btnEndless');
      el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle');
      showToast('افتحها بالفوز في المرحلة ' + BS.ENDLESS_AT);
      return;
    }
    J.select(); startRound(0);
  }
  function showToast(text) { say(text); }

  /* ---------------------------------------------------------------- shop */
  var itemBtns = [];
  function freshItems() {
    var out = [], total = BS.totalStars(save);
    [['ball', BS.BALLS], ['paddle', BS.PADDLES]].forEach(function (p) {
      p[1].forEach(function (it, i) { if (it.stars > save.seen && it.stars <= total) out.push(p[0] + i); });
    });
    return out;
  }
  function buildShop() {
    [['ball', BS.BALLS, $('shopBalls')], ['paddle', BS.PADDLES, $('shopPaddles')]].forEach(function (p) {
      p[1].forEach(function (it, i) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'item';
        b.innerHTML = '<canvas width="240" height="172"></canvas><b>' + it.name + '</b><span></span>';
        b.addEventListener('click', function (e) { e.stopPropagation(); wear(p[0], i, b); });
        p[2].appendChild(b);
        itemBtns.push({ kind: p[0], i: i, b: b });
      });
    });
    paintItems();
  }
  function paintItems() {
    itemBtns.forEach(function (it) {
      var c = it.b.querySelector('canvas').getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 240, 172);
      if (it.kind === 'ball') BS.drawBallIcon(c, BS.BALLS[it.i].id, 120, 86, 52);
      else { c.setTransform(1.15, 0, 0, 1.15, 0, 0); BS.drawPaddle(c, BS.PADDLES[it.i].id, 104, 80, 150, { lx: 104, ly: 10 }); }
    });
  }
  function refreshShop() {
    var total = BS.totalStars(save), fresh = freshItems();
    $('shopStars').querySelector('b').textContent = String(total);
    itemBtns.forEach(function (it) {
      var list = it.kind === 'ball' ? BS.BALLS : BS.PADDLES, own = BS.owns(save, it.kind, it.i), on = save[it.kind] === it.i;
      it.b.classList.toggle('on', on);
      it.b.classList.toggle('locked', !own);
      it.b.classList.toggle('fresh', own && !on && fresh.indexOf(it.kind + it.i) >= 0);
      it.b.querySelector('span').innerHTML = own ? (on ? '✔' : '') : '<svg aria-hidden="true"><use href="#i-star"/></svg>' + list[it.i].stars;
      it.b.setAttribute('aria-label', list[it.i].name + (own ? '' : '، ' + list[it.i].stars + ' نجمة'));
      it.b.setAttribute('aria-pressed', String(on));
    });
  }
  function openShop() {
    shopFrom = screen === 'result' ? 'result' : 'title';
    J.select();
    refreshShop();
    setScreen('shop');
    save.seen = M.max(save.seen, BS.totalStars(save));
    persist();
  }
  function closeShop() {
    J.back();
    if (shopFrom === 'result' && result) setScreen('result');
    else { refreshTitle(); setScreen('title'); }
  }
  function wear(kind, i, el) {
    if (BS.wear(save, kind, i)) {
      J.coin(4);
      fx.burst(640, 360, { count: 26, colors: ['#ffe14f', '#ff4fb8', '#4fd8ff'], speed: 360 });
      persist();
    } else {
      J.error();
      el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle');
    }
    refreshShop();
    dirty = true;
  }

  /* ---------------------------------------------------------------- input */
  function on(el, fn) { el.addEventListener('click', function (e) { e.stopPropagation(); fn(); if (e.detail > 0) el.blur(); }); }
  on($('btnPlay'), play);
  on($('btnLevels'), openLevels);
  on($('btnShop'), openShop);
  on($('btnEndless'), function () { endless($('btnEndless')); });
  on($('levelsBack'), function () { J.back(); refreshTitle(); setScreen('title'); });
  on($('shopBack'), closeShop);
  on($('btnPause'), pause);
  on($('btnResume'), resume);
  on($('btnHome'), function () { J.back(); toTitle(); });
  on($('btnRestart'), restart);
  on($('btnNext'), nextLevel);
  on($('btnAgain'), again);
  on($('btnMenu'), function () { J.back(); toTitle(); });
  on($('resUnlock'), openShop);
  var LAUNCH = { Space: 1, ArrowUp: 1, KeyW: 1, Enter: 1 }, STEER = { ArrowLeft: 1, ArrowRight: 1, KeyA: 1, KeyD: 1 };
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    var c = e.code;
    if (screen === 'play') {
      if (c === 'KeyP' || c === 'Escape') { e.preventDefault(); pause(); return; }
      if (LAUNCH[c]) { e.preventDefault(); launchReq = true; }
      if (STEER[c]) mouse.on = false;
      return;
    }
    if (screen === 'pause') {
      if (c === 'KeyP' || c === 'Escape' || c === 'Enter' || c === 'Space') { e.preventDefault(); resume(); }
      else if (c === 'KeyR') restart();
      return;
    }
    if (screen === 'result') {
      if (c === 'Enter' || c === 'Space') { e.preventDefault(); if (!$('btnNext').hidden) nextLevel(); else again(); }
      else if (c === 'KeyR') again();
      else if (c === 'Escape') { J.back(); toTitle(); }
      return;
    }
    if ((screen === 'shop' || screen === 'levels') && (c === 'Escape' || c === 'Backspace')) {
      e.preventDefault();
      if (screen === 'shop') closeShop(); else { J.back(); refreshTitle(); setScreen('title'); }
      return;
    }
    if (screen === 'title' && (c === 'Enter' || c === 'Space')) { e.preventDefault(); play(); }
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (screen !== 'play' || e.button !== 0) return;
    var p = fit.toLogical(e.clientX, e.clientY);
    launchReq = true;
    // a click is also an aim: the paddle goes where the child clicked
    if (M.abs(p.x - mouse.lx) + M.abs(p.y - mouse.ly) > 0.5 && mouse.lx >= 0) { mouse.on = true; mouse.x = p.x; }
    mouse.lx = p.x; mouse.ly = p.y;
  });
  // Mouse steering starts only from a real move during play: a pointer resting where Play
  // was clicked moves nothing.
  window.addEventListener('pointermove', function (e) {
    var p = fit.toLogical(e.clientX, e.clientY);
    var moved = M.abs(p.x - mouse.lx) + M.abs(p.y - mouse.ly) > 0.5;
    mouse.lx = p.x; mouse.ly = p.y;
    if (screen === 'play' && moved) { mouse.on = true; mouse.x = p.x; }
  });
  function readInput() {
    var k = Kit.keys, dir = 0;
    if (k.anyDown(['ArrowLeft', 'KeyA'])) dir -= 1;
    if (k.anyDown(['ArrowRight', 'KeyD'])) dir += 1;
    if (dir) mouse.on = false;
    inp.dir = dir; inp.target = mouse.on ? mouse.x : null; inp.launch = launchReq;
    launchReq = false;
    return inp;
  }

  /* -------------------------------------------------------- sounds and fx */
  var PADDLE_SFX = {
    jelly: function () { AU.tone({ freq: 170, to: 430, type: 'sine', dur: 0.14, vol: 0.2 }); AU.tone({ freq: 340, to: 860, type: 'triangle', dur: 0.08, vol: 0.06, delay: 0.02 }); },
    banana: function () { AU.tone({ freq: 900, to: 1500, type: 'triangle', dur: 0.07, vol: 0.12 }); AU.tone({ freq: 1500, to: 950, type: 'triangle', dur: 0.08, vol: 0.1, delay: 0.07 }); },
    skate: function () { AU.noise({ dur: 0.05, vol: 0.22, filter: 3200 }); AU.tone({ freq: 240, to: 150, type: 'triangle', dur: 0.07, vol: 0.16 }); },
    surf: function () { AU.noise({ dur: 0.2, vol: 0.14, filter: 2000, to: 300 }); AU.tone({ freq: 280, to: 520, type: 'sine', dur: 0.12, vol: 0.12 }); },
    cat: function () { AU.tone({ freq: 620, to: 950, type: 'triangle', dur: 0.1, vol: 0.12 }); AU.tone({ freq: 950, to: 520, type: 'triangle', dur: 0.2, vol: 0.12, delay: 0.1 }); }
  };
  function quack() { AU.tone({ freq: 540, to: 380, type: 'sawtooth', dur: 0.11, vol: 0.07 }); AU.tone({ freq: 520, to: 360, type: 'sawtooth', dur: 0.13, vol: 0.07, delay: 0.13 }); }
  function float(text, x, y, color, size, vy) {
    if (floats.length > 36) floats.shift();
    floats.push({ text: text, x: x, y: y, color: color || '#fff', size: size || 30, vy: vy || -120, life: 1, vx: (M.random() - 0.5) * 50, rtl: /[؀-ۿ]/.test(text) });
  }
  function showBanner(text, color, secs, sub) { banner = { text: text, sub: sub || '', color: color || '#fff', t: 0, max: secs || 1.6 }; }
  function burst(x, y, o) {
    if (partBudget <= 0) return;
    o.count = M.min(o.count || 10, partBudget);
    partBudget -= o.count;
    fx.burst(x, y, o);
  }
  function colors() { return WORLD_COLORS[world && world.spec ? world.spec.world : 0]; }
  function handle(e) {
    var w = world;
    switch (e.type) {
      case 'launch':
        J.whoosh(0.5); PADDLE_SFX.jelly();
        if (!e.auto) Kit.stats.busy();
        if (coach === 1) { coach = 2; coachT = 0; }
        sq = 0.8;
        break;
      case 'pad':
        sq = 1;
        if (sfx('pad', 0.07)) (PADDLE_SFX[BS.PADDLES[save.paddle].id] || PADDLE_SFX.jelly)();
        if (w.phase === 'play' && time - hitAt > 0.5) { Kit.track.hit(); hitAt = time; }
        if (M.abs(e.u) > 0.75 && sfx('edge', 0.4)) float('زاوية!', e.x, F.PY - 40, '#4fd8ff', 26, -90);
        burst(e.x, F.PY, { count: 5, colors: ['#5fe3a1', '#fff'], speed: 160, life: 0.35, size: 6, gravity: 500 });
        break;
      case 'stick': if (sfx('stick', 0.1)) AU.tone({ freq: 300, to: 160, type: 'sine', dur: 0.12, vol: 0.14 }); break;
      case 'unstick': J.jump(0.7); break;
      case 'hit':
        if (sfx('hit', 0.045)) AU.tone({ freq: 1050 + e.hp * 120, to: 1600, type: 'triangle', dur: 0.06, vol: 0.08 });
        burst(e.x, e.y, { count: 4, colors: ['#fff'], speed: 150, life: 0.3, size: 5 });
        break;
      case 'clang':
        if (sfx('clang', 0.08)) { AU.tone({ freq: 880, to: 860, type: 'square', dur: 0.07, vol: 0.04 }); AU.tone({ freq: 1320, type: 'triangle', dur: 0.14, vol: 0.05 }); }
        break;
      case 'pop': {
        if (time - chainAt > 0.6) chain = 0;
        chain++; chainAt = time;
        if (sfx('pop', 0.04)) { J.streak(M.min(chain, 24)); J.pop(0.35 + M.min(0.5, chain * 0.02)); }
        view.addGhost(e, w);
        var many = w.n > 24;
        burst(e.x, e.y, { count: many ? 4 : 10, colors: [BS.PAL[e.col] || '#fff', '#fff', colors()[chain % 5]], speed: 260, life: 0.55, size: 7, gravity: 600 });
        if (!many || e.combo >= 3) float('+' + fmt(e.pts), e.x, e.y - 8, e.combo >= 3 ? '#ffe14f' : '#fff', e.combo >= 3 ? 30 : 24, -110);
        break;
      }
      case 'combo':
        float('كومبو ' + ltr('×' + e.n) + '!', e.x, e.y - 30, '#ff6fc4', 34 + M.min(16, e.n), -80);
        if (sfx('combo', 0.25)) J.chime(e.n >= 10 ? 3 : 2);
        break;
      case 'boom':
        J.impact(1); AU.noise({ dur: 0.5, vol: 0.32, filter: 1100, to: 70 });
        shake.add(14); flash = M.max(flash, 0.35);
        view.addBoom(e.x, e.y);
        burst(e.x, e.y, { count: 24, colors: ['#ffe14f', '#ff9a2e', '#ff4f6d', '#fff'], speed: 480, life: 0.6, size: 9, gravity: 300 });
        float('بووم!', e.x, e.y - 20, '#ffe14f', 44, -70);
        break;
      case 'drop':
        if (sfx('drop', 0.15)) AU.tone({ freq: 520, to: 700, type: 'sine', dur: 0.1, vol: 0.1 });
        break;
      case 'power': {
        var big = e.kind === 'x3' || e.kind === 'plus';
        if (e.kind === 'x3') { J.chime(3); AU.tone({ freq: 260, to: 1300, type: 'sine', dur: 0.4, vol: 0.14 }); quack(); }
        else if (e.kind === 'plus') { J.coin(5); for (var p = 0; p < 6; p++) AU.tone({ freq: 700 + p * 110, to: 1400 + p * 90, type: 'triangle', dur: 0.05, vol: 0.06, delay: p * 0.04 }); }
        else { J.chime(2); J.whoosh(0.6); }
        showBanner(POWER_NAME[e.kind], big ? '#ffe14f' : '#7dffd0', big ? 1.2 : 1.0, e.added > 0 ? ltr('+' + e.added) + ' كرة' : '');
        burst(e.x, F.PY - 10, { count: 30, colors: colors(), speed: 420, life: 0.8, size: 8, gravity: 400 });
        bump = 1;
        if (big) shake.add(6);
        if (w.phase === 'play') Kit.track.hit();
        break;
      }
      case 'capMiss': if (sfx('miss', 0.3)) AU.tone({ freq: 400, to: 250, type: 'sine', dur: 0.15, vol: 0.07 }); break;
      case 'ring':
        if (sfx('ring', 0.05)) AU.tone({ freq: 1250 + (w.n % 7) * 90, to: 1900, type: 'sine', dur: 0.05, vol: 0.06 });
        burst(e.x, e.y, { count: 3, colors: ['#ffe14f', '#ff4fb8'], speed: 140, life: 0.3, size: 5, gravity: 0 });
        bump = M.max(bump, 0.5);
        break;
      case 'ringOn': J.chime(2); float('×2!', e.x, 200, '#ffe14f', 44, -60); break;
      case 'ringGone': J.pop(0.8); break;
      case 'floor': if (sfx('floor', 0.12)) AU.tone({ freq: 250, to: 470, type: 'sine', dur: 0.09, vol: 0.11 }); break;
      case 'floorPop':
        J.pop(1); AU.noise({ dur: 0.2, vol: 0.12, filter: 4000, to: 800 });
        for (var b = 0; b < 6; b++) burst(F.L + 100 + b * 200, F.FLOOR, { count: 6, colors: ['#bff6ff', '#fff'], speed: 220, life: 0.5, size: 6 });
        showBanner('بوب!', '#bff6ff', 1.0, 'الفقاعة انفجرت!');
        break;
      case 'lost':
        if (w.n < 6 && sfx('lost', 0.15)) AU.tone({ freq: 560, to: 140, type: 'sine', dur: 0.3, vol: 0.09 });
        break;
      case 'life':
        Kit.track.miss();
        if (e.lives > 0) {
          J.fail(); AU.tone({ freq: 320, to: 150, type: 'sawtooth', dur: 0.4, vol: 0.06, delay: 0.1 });
          shake.add(8);
          showBanner('أوه!', '#ff9aa8', 1.1, 'جرّب مرة أخرى!');
        }
        break;
      case 'serve': Kit.track.cue(); break;
      case 'clear':
        J.levelUp(); shake.add(8); flash = 1;
        showBanner(CHEERS[w.level % CHEERS.length], '#ffe14f', 1.8, 'نظّفت كل المكعبات!');
        for (var q = 0; q < 5; q++) fx.burst(200 + q * 220, 300, { count: 30, colors: colors(), speed: 520, life: 1.2 });
        finish(true);
        break;
      case 'over':
        if (w.endless) { J.fail(); showBanner('انتهت العاصفة!', '#ffe14f', 1.4, e.reason === 'line' ? 'وصلت الصفوف إلى الخط' : ''); }
        else showBanner('أوبس!', '#ff9aa8', 1.4);
        shake.add(10);
        finish(false);
        break;
      case 'result': showResult(); break;
      case 'expire': if (sfx('expire', 0.2)) AU.tone({ freq: 700, to: 350, type: 'triangle', dur: 0.16, vol: 0.07 }); break;
      case 'row': if (sfx('row', 0.2)) AU.tone({ freq: 140, to: 90, type: 'triangle', dur: 0.12, vol: 0.12 }); break;
      case 'wipe': showBanner('مسحت الكل!', '#ffe14f', 1.4, ltr('+1,000')); J.chime(3); break;
    }
  }
  function stormCheck() {
    var n = world.n;
    while (storm < STORMS.length && n >= STORMS[storm][0]) {
      if (world.phase === 'play') {
        showBanner(STORMS[storm][1], '#ff6fc4', 1.4, ltr('×' + n) + ' كرة');
        J.chime(3); bump = 1; shake.add(5);
      }
      storm++;
    }
  }
  // The hint goes once the ball is launched and the paddle has moved; only then is the
  // first-time coach done for good (a hint that just times out comes back next round).
  function endCoach(done) {
    if (!coach) return;
    coach = 0;
    if (done && !save.coach) { save.coach = true; Kit.stats.tutorial('done'); persist(); }
  }
  function coachTick(dt) {
    if (!coach) return;
    coachT += dt;
    if (coach === 1 && world.launched) { coach = 2; coachT = 0; }
    if (coach === 2 && world.moves > 8) endCoach(true);
    else if (coach === 2 && coachT > 10) endCoach(false);
  }

  /* --------------------------------------------------------------- demo */
  function newDemo() {
    var n = 1 + M.floor(M.random() * 5);
    demo = BS.create({ level: n, speed: 420, paddle: 220, drop: 0.12, magnet: 1, seed: seed() });
    demo.floorPerm = true;
    demo.serveT = 0.6;
  }
  var demoInp = { dir: 0, target: null, launch: false };
  function demoInput(w) {
    var best = -1, by = -1;
    for (var i = 0; i < w.n; i++) if (w.dy[i] > 0 && w.y[i] > by) { by = w.y[i]; best = i; }
    var cap = null;
    for (var c = 0; c < w.caps.length; c++) if (w.caps[c].y > 420) cap = w.caps[c];
    demoInp.target = cap && by < 420 ? cap.x : best >= 0 ? w.x[best] + M.sin(w.t * 0.9) * w.pw * 0.3 : w.px;
    return demoInp;
  }

  /* --------------------------------------------------------------- update */
  function update(dt) {
    time += dt;
    partBudget = 90;
    if (screen === 'play' && world) {
      BS.step(world, dt, readInput());
      for (var i = 0; i < world.ev.length; i++) handle(world.ev[i]);
      if (world) {
        stormCheck();
        coachTick(dt);
        if (world.phase === 'clear' || world.phase === 'over') Kit.stats.busy();
      }
      tick(dt);
      dirty = true;
    } else if (screen === 'title' && demo && !calm()) {
      BS.step(demo, dt, demoInput(demo));
      if (demo.phase === 'won' || demo.t > 70) newDemo();
      view.update(dt);
      dirty = true;
    } else if (screen === 'result') {
      resultTick(dt);
      if (fx.list.length) { fx.update(dt); dirty = true; }
    } else if (screen === 'shop' && fx.list.length) { fx.update(dt); dirty = true; }
    Kit.keys.endFrame();
  }
  function tick(dt) {
    for (var f = floats.length - 1; f >= 0; f--) {
      var p = floats[f];
      p.life -= dt * 1.15; p.y += p.vy * dt; p.x += p.vx * dt; p.vy *= 0.96;
      if (p.life <= 0) floats.splice(f, 1);
    }
    if (banner) { banner.t += dt; if (banner.t > banner.max) banner = null; }
    sq = M.max(0, sq - dt * 5);
    bump = M.max(0, bump - dt * 3);
    flash = M.max(0, flash - dt * 2.5);
    view.update(dt);
    fx.update(dt); shake.update(dt);
  }

  /* ------------------------------------------------------------------ HUD */
  var label = BS.label;
  function panel(x, y, w, h, fill) {
    BS.rrect(ctx, x, y, w, h, h / 2); ctx.fillStyle = fill || 'rgba(20,8,48,0.75)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
  }
  // Two pieces read right to left: `right` on the right, `left` on the left, centred on x.
  function pair(right, left, x, y, size, cr, cl) {
    ctx.font = '700 ' + size + 'px Fredoka';
    var rw = ctx.measureText(right).width, lw = ctx.measureText(left).width, gap = size * 0.28, x0 = x - (rw + gap + lw) / 2;
    label(ctx, left, x0 + lw / 2, y, size, cl, 'center', /[؀-ۿ]/.test(left));
    label(ctx, right, x0 + lw + gap + rw / 2, y, size, cr, 'center', /[؀-ۿ]/.test(right));
  }
  function drawHud(w) {
    // score
    panel(94, 14, 236, 66);
    label(ctx, 'النقاط', 212, 33, 17, '#ffd0ec', 'center', true);
    label(ctx, fmt(w.score), 212, 60, 32, '#ffe14f');
    // lives and the level
    panel(890, 14, 290, 66);
    for (var i = 0; i < 3; i++) BS.heart(ctx, 1146 - i * 44, 48, 36, i < w.lives ? '#ff4f6d' : 'rgba(255,255,255,0.22)');
    label(ctx, w.endless ? 'بلا نهاية' : 'المرحلة ' + w.level, 970, 47, 26, '#fff', 'center', true);
    // the big ball counter
    if (w.n >= 2) {
      var s = 1 + bump * 0.25 + (calm() ? 0 : M.min(0.2, w.n / 2500)), size = M.min(64, 40 + M.log(w.n) * 5);
      ctx.save(); ctx.translate(640, 48); ctx.scale(s, s);
      pair('×' + w.n, 'كرة!', 0, 0, size, w.n >= 100 ? '#ff6fc4' : '#ffe14f', '#fff');
      ctx.restore();
    } else if (w.spec) label(ctx, w.spec.name, 640, 48, 30, '#fff', 'center', true);
    // the best live combo
    if (w.comboMax >= 3 && w.phase === 'play') pair('كومبو', '×' + w.comboMax, 640, 126, 26, '#fff', '#ff6fc4');
    // power-up timers
    var px = 74;
    for (var k in w.pow) if (w.pow[k] > 0) {
      var total = BS.POW[k];
      ctx.beginPath(); ctx.arc(px, 132, 24, 0, M.PI * 2); ctx.fillStyle = 'rgba(20,8,48,0.75)'; ctx.fill();
      ctx.beginPath(); ctx.arc(px, 132, 24, -M.PI / 2, -M.PI / 2 + M.PI * 2 * w.pow[k] / total); ctx.lineWidth = 5; ctx.strokeStyle = BS.CAP_ART[k].fill; ctx.stroke();
      BS.powerIcon(ctx, k, px, 132, 30);
      px += 60;
    }
    // the waiting ball: a bouncing arrow and the auto-launch ring
    if (!w.launched && w.phase === 'play') {
      var bx = w.x[0], by = w.y[0] - 34 - (calm() ? 0 : M.abs(M.sin(time * 5)) * 10);
      ctx.beginPath(); ctx.moveTo(bx, by + 14); ctx.lineTo(bx - 12, by); ctx.lineTo(bx - 5, by); ctx.lineTo(bx - 5, by - 14); ctx.lineTo(bx + 5, by - 14); ctx.lineTo(bx + 5, by); ctx.lineTo(bx + 12, by); ctx.closePath();
      ctx.fillStyle = '#ffe14f'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#2a1d4e'; ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, w.y[0], 17, -M.PI / 2, -M.PI / 2 + M.PI * 2 * M.max(0, w.serveT) / F.SERVE); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
    }
    // the first-time coach
    if (coach && w.phase === 'play') drawCoach(w);
    // floats
    for (var f = 0; f < floats.length; f++) {
      var p = floats[f];
      ctx.globalAlpha = M.max(0, M.min(1, p.life * 1.6));
      label(ctx, p.text, p.x, p.y, p.size, p.color, 'center', p.rtl);
    }
    ctx.globalAlpha = 1;
    if (banner) {
      var b = banner.t / banner.max, bs = calm() ? 1 : b < 0.15 ? 0.4 + b / 0.15 * 0.7 : b < 0.25 ? 1.1 - (b - 0.15) : 1;
      ctx.globalAlpha = b > 0.8 ? M.max(0, (1 - b) / 0.2) : 1;
      ctx.save(); ctx.translate(640, 300); ctx.scale(bs, bs);
      label(ctx, banner.text, 0, 0, 84, banner.color, 'center', /[؀-ۿ]/.test(banner.text));
      if (banner.sub) label(ctx, banner.sub, 0, 70, 34, '#fff', 'center', /[؀-ۿ]/.test(banner.sub));
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
  function keycap(x, y, w, text, rtl) {
    BS.rrect(ctx, x - w / 2, y - 22, w, 44, 10); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#2a1d4e'; ctx.stroke();
    ctx.font = '700 22px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.fillStyle = '#2a1d4e'; ctx.fillText(text, x, y + 1); ctx.direction = 'ltr';
  }
  function mouseIcon(x, y) {
    BS.rrect(ctx, x - 16, y - 24, 32, 48, 16); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#2a1d4e'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 24); ctx.lineTo(x, y - 6); ctx.moveTo(x - 16, y - 6); ctx.lineTo(x + 16, y - 6); ctx.stroke();
    BS.rrect(ctx, x - 14, y - 22, 13, 15, 6); ctx.fillStyle = '#ff4fb8'; ctx.fill();
  }
  function drawCoach(w) {
    var pulse = calm() ? 1 : 1 + M.sin(time * 6) * 0.05;
    if (coach === 1) {
      var x = M.max(330, M.min(950, w.x[0])), y = 470;
      ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse);
      panel(-200, -40, 400, 80, 'rgba(255,79,184,0.95)');
      label(ctx, 'انقر أو مسافة!', 46, 2, 34, '#fff', 'center', true);
      mouseIcon(-150, 0);
      ctx.restore();
    } else {
      var px = M.max(260, M.min(1020, w.px)), slide = calm() ? 0 : M.sin(time * 4) * 30;
      ctx.save(); ctx.translate(px, 575);
      panel(-210, -36, 420, 72, 'rgba(61,180,255,0.95)');
      keycap(-170 - (slide < 0 ? 4 : 0), 0, 44, '←'); keycap(170 + (slide > 0 ? 4 : 0), 0, 44, '→');
      mouseIcon(-110 + slide * 0.5, 0);
      label(ctx, 'حرّك المضرب!', 30, 2, 30, '#fff', 'center', true);
      ctx.restore();
    }
  }

  /* --------------------------------------------------------------- render */
  function render() {
    var live = screen === 'play' || (screen === 'title' && !calm());
    if (!live && !dirty) return; // a still menu keeps its last frame
    var w = screen === 'title' ? demo : world || demo;
    ctx.save();
    if (shake.power && screen === 'play') ctx.translate(shake.x, shake.y);
    if (w) {
      view.render(w, { ball: BS.BALLS[save.ball].id, paddle: BS.PADDLES[save.paddle].id, sq: w === world ? sq : 0, endlessWorld: w.endless ? M.floor(w.rowsMade / 14) % 3 : 0 });
    } else { ctx.fillStyle = '#2b0f5e'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    fx.draw(ctx);
    if (flash > 0 && screen === 'play') { ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.45) + ')'; ctx.fillRect(0, 0, W, H); }
    if (world && w === world && screen !== 'title') drawHud(world);
    dirty = false;
  }

  /* ----------------------------------------------------- test and debug hook */
  function snapshot() {
    var w = world;
    return {
      screen: screen, t: w ? M.round(w.t * 1000) / 1000 : 0, paddle: w ? M.round(w.px) : 640,
      bx: w && w.n ? M.round(w.x[0]) : 0, by: w && w.n ? M.round(w.y[0]) : 0,
      bricks: w ? w.left : 0, launched: w ? w.launched : false, balls: w ? w.n : 0, lives: w ? w.lives : 0,
      level: w ? w.level : 0, score: w ? w.score : 0, mode: w ? (w.endless ? 'endless' : 'level') : '', phase: w ? w.phase : '',
      caps: w ? w.caps.length : 0, maxBalls: w ? w.maxBalls : 0, combo: w ? w.comboMax : 0, pw: w ? M.round(w.pw) : 0,
      fire: w ? w.pow.fire > 0 : false, floor: w ? (w.floorPerm ? 'perm' : w.floorHits) : 0,
      stars: BS.totalStars(save), next: BS.nextLevel(save), coach: coach, coached: save.coach, mouse: mouse.on,
      banner: banner ? banner.text : '', result: result ? { won: result.won, stars: result.stars, newBest: result.newBest } : null, calm: calm()
    };
  }

  /* ----------------------------------------------------------------- init */
  Kit.muteButton();
  Kit.lifecycle({ pause: pause, reset: function () { launchReq = false; } });
  Kit.motion.onChange(function (r) { if (view) view.calm = r; dirty = true; });
  window.addEventListener('pageshow', function () { dirty = true; });
  window.addEventListener('pagehide', function () { persist(); });
  canvas.addEventListener('contextrestored', function () { if (view) view.setRatio(0); dirty = true; render(); });
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'ب').then(function () { if (view) view.flush(); paintItems(); dirty = true; render(); }, function () { /* fallback fonts */ });
  }
  var loop = null;
  try {
    view = BS.createView(ctx);
    view.setRatio(fit.scale * fit.dpr);
    view.calm = calm();
    newDemo();
    buildShop();
    refreshTitle();
    setScreen('title');
    window.__game = {
      get state() { return snapshot(); },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get world() { return world; },
      point: function (x, y) { var r = canvas.getBoundingClientRect(); return { x: r.left + x * fit.scale, y: r.top + y * fit.scale }; }
    };
    render();
    loop = Kit.loop(update, render);
    Kit.ready();
  } catch (error) {
    if (loop) loop.stop();
    for (var k in SCREENS) $(SCREENS[k]).hidden = true;
    $('scrError').hidden = false;
    Kit.fail(error);
  }
})();
