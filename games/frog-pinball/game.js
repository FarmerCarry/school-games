/* Frog Pinball (بينبول الضفدع): screens, input, saves, the level map and the shop, sounds,
 * the HUD and play statistics. engine.js runs the table; art.js draws it. This is the UI
 * layer: it reads Kit.dda at the start of every try (the table's slope, the ball save and
 * the bumper kick; free play has a level of its own) and reports each try back to it, and it
 * reports every try as a round.
 */
(function () {
  'use strict';
  var W = 1280, H = 720, M = Math, X0 = FP.X0, T = FP.TABLE;
  var SLUG = 'frog-pinball';
  var J = Kit.juice, AU = Kit.audio;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ui = $('ui');
  var calm = function () { return Kit.motion.reduced(); };
  var dirty = true, view = null;
  var fit = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: function (v) {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    if (view) view.resize(M.min(2.25, M.max(0.5, v.scale * v.dpr)));
    dirty = true;
  } });
  var ctx = fit.ctx;

  /* ---------------------------------------------------------------- save */
  var store = Kit.store(SLUG);
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = FP.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // The table's slope, how long a drained ball comes back and how hard the bumpers kick follow
  // how the tries go on this PC. Free play keeps its own level, from how long its balls last:
  // its big scores say nothing about the missions.
  var dda = Kit.dda(SLUG, { id: 'main', target: 0.7 }), ddaFree = Kit.dda(SLUG, { id: 'free', target: 0.6 });

  /* --------------------------------------------------------------- state */
  var screen = 'title', world = null, demo = null, demoMem = {}, demoRnd = FP.rng(11), time = 0, lastT = 0;
  var level = 1, roundOpen = false, outcome = null, endT = 0;
  var floats = [], banner = null, fx = Kit.particles(), shake = Kit.shake();
  var mouse = { l: false, r: false, pull: false, hl: false, hr: false, hp: false };
  var mood = { name: 'idle', t: 0, len: 0 }, frogFx = { burp: 0, multi: false }, tongue = { k: 0, x: 0, y: 0 };
  var viewOpts = { t: 0, skin: '', frog: frogFx, tongue: tongue };
  var hint = 0, noFlip = 0, scorePop = 0, shownScore = 0, wallAt = 0, spinAt = 0, flipAt = 0, waitAt = -1, pullWas = false;
  var MISSION = {
    bump: 'اضرب المصدّات 10 مرات', duck: 'أسقط البطات الثلاث', feed1: 'أطعم الضفدع', score5: 'اجمع 5,000 نقطة',
    orbit: 'لفّة في المدار', feed3: 'أطعم الضفدع 3 مرات', mult: 'اصنع مضاعفًا ' + ltr('×3'), score20: 'اجمع 20,000 نقطة',
    multi: 'مطر الكرات مرتين', free: 'أعلى نتيجة!'
  };
  var MKEY = ['bump', 'duck', 'feed1', 'score5', 'orbit', 'feed3', 'mult', 'score20', 'multi', 'free'];
  var MSHORT = ['المصدّات', 'البط', 'الضفدع', '5,000', 'المدار', '3 وجبات', 'مضاعف', '20,000', 'مطر الكرات', 'لعب حر'];
  var MICON = ['i-bump', 'i-duck', 'i-frog', 'i-coin', 'i-orbit', 'i-frog', 'i-mult', 'i-coin', 'i-rain', 'i-free'];
  var SKIN_NAMES = ['الكرة اللامعة', 'لؤلؤة', 'كرة العين', 'دعسوقة', 'كوكب صغير', 'دونات', 'ذبابة للضفدع'];
  var THEME_NAMES = ['بركة النهار', 'بركة الليل', 'بركة الحلوى'];
  var CHEERS = ['رائع!', 'واو!', 'ممتاز!', 'هيا!', 'يا سلام!'];

  var SCREENS = { title: 'scrTitle', pause: 'scrPause', result: 'scrResult', levels: 'scrLevels', shop: 'scrShop' };
  function setScreen(name) {
    screen = name;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    mouse.l = mouse.r = mouse.pull = mouse.hl = mouse.hr = mouse.hp = false;
    Kit.keys.reset();
    dirty = true;
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function fmt(n) { return Kit.fmt(n); }
  // A number kept left-to-right inside Arabic text.
  function ltr(t) { return '⁦' + t + '⁩'; }
  // "n stars" as Arabic counts it: نجمة واحدة, نجمتان, 3-10 نجوم, 11 and up نجمة.
  function starsText(n) { return n === 1 ? 'نجمة واحدة' : n === 2 ? 'نجمتان' : n + (n > 10 ? ' نجمة' : ' نجوم'); }
  function missionText(lv) { return MISSION[MKEY[lv - 1]]; }

  /* ------------------------------------------------------------ the title */
  function refreshTitle() {
    var nx = FP.nextLevel(save);
    $('titleLevel').querySelector('b').textContent = nx === FP.FREE ? '★' : String(nx);
    $('titleLevel').querySelector('small').textContent = nx === FP.FREE ? 'لعب حر' : 'المرحلة';
    $('titleStars').querySelector('b').textContent = String(FP.totalStars(save));
    $('shopDot').hidden = FP.unlockCount(save) <= save.seen;
  }
  function toTitle() {
    quitRound();
    world = null;
    persist();
    refreshTitle();
    setScreen('title');
  }
  function quitRound() { if (roundOpen) { roundOpen = false; Kit.stats.end('quit'); } }

  /* --------------------------------------------------------------- rounds */
  function start(lv) {
    quitRound();
    level = lv;
    var k = lv === FP.FREE ? ddaFree : dda;
    var d = { level: lv, gravity: k.value(960, 1300), save: k.value(13, 7), kick: k.value(360, 440), seed: (time * 1000 + lv * 7919) | 0 };
    world = FP.create(d);
    floats.length = 0; banner = null; fx.clear(); outcome = null; endT = 0;
    frogFx.burp = 0; tongue.k = 0; shownScore = 0; noFlip = 0; waitAt = -1;
    setMood('wow', 1);
    Kit.stats.round(lv === FP.FREE ? 'free' : 'L' + lv);
    Kit.track.tier(k.tier);
    roundOpen = true;
    if (!save.coach) { hint = 1; Kit.stats.tutorial('start'); } else hint = 0;
    setScreen('play');
    showBanner(lv === FP.FREE ? 'لعب حر' : 'المرحلة ' + lv, '#fff', 2.2, missionText(lv));
    say((lv === FP.FREE ? 'لعب حر' : 'المرحلة ' + lv) + ': ' + missionText(lv));
  }
  function play() { J.select(); start(FP.nextLevel(save)); }

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
    setScreen(outcome && endT > endDelay() ? 'result' : 'play');
  }
  function restart() { J.select(); start(level); }

  /* -------------------------------------------------------------- results */
  function endDelay() { return outcome && outcome.won ? 2.4 : 1.6; }
  function finish(kind) {
    if (!roundOpen) return;
    roundOpen = false;
    var won = kind === 'win', score = world.score, balls = world.ballsLeft;
    Kit.stats.end(kind, score);
    // free play: how long its three balls lasted (5 minutes or more is the top)
    if (level === FP.FREE) ddaFree.result(M.min(1, world.t / 300));
    else dda.result(won ? (balls >= 3 ? 1 : balls === 2 ? 0.85 : 0.7) : 0);
    var rec = FP.record(save, level, score, won);
    outcome = { won: won, kind: kind, score: score, stars: rec.stars, newBest: rec.newBest, unlocked: rec.unlocked, best: save.best[level - 1] };
    if (won && !save.coach) { save.coach = true; Kit.stats.tutorial('done'); hint = 0; }
    persist();
    endT = 0;
  }
  function showResult() {
    var o = outcome;
    setScreen('result');
    $('resTitle').textContent = o.won ? 'أحسنت!' : o.kind === 'end' ? 'انتهى اللعب!' : 'انتهت الكرات!';
    var stars = $('resStars').children;
    for (var i = 0; i < 3; i++) {
      stars[i].innerHTML = '<use href="#i-star' + (i < o.stars ? '' : '0') + '"/>';
      stars[i].setAttribute('class', i < o.stars ? 'on' : '');
    }
    $('resStars').hidden = level === FP.FREE;
    $('resScore').textContent = fmt(o.score);
    $('resNew').hidden = !o.newBest;
    $('resBest').textContent = 'الأفضل: ' + ltr(fmt(o.best));
    $('resUnlock').hidden = !(o.unlocked > 0);
    $('btnNext').hidden = !o.won;
    if (o.won) { J.levelUp(); for (var s = 1; s <= o.stars; s++) (function (n) { setTimeout(function () { if (screen === 'result') J.star(n); }, 200 + n * 200); })(s); }
    else J.fail();
    if (o.newBest) setTimeout(function () { if (screen === 'result') J.chime(3); }, 900);
    say(o.won ? 'أحسنت! ' + starsText(o.stars) : 'انتهت الكرات');
    refreshTitle();
  }
  function next() {
    if (!outcome || !outcome.won) { again(); return; }
    J.select();
    start(level >= FP.MISSIONS ? FP.FREE : level + 1);
  }
  function again() { J.select(); start(level); }

  /* ---------------------------------------------------------- level map */
  function buildLevels() {
    var grid = $('levelGrid');
    grid.innerHTML = '';
    for (var lv = 1; lv <= FP.FREE; lv++) {
      var b = document.createElement('button');
      var open = FP.open(save, lv), st = lv <= FP.MISSIONS ? save.stars[lv - 1] : 0, free = lv === FP.FREE;
      b.type = 'button';
      b.className = 'lv' + (open ? '' : ' locked') + (free ? ' free' : '') + (open && !st && !free ? ' next' : '');
      var stars = '';
      if (!free) for (var s = 0; s < 3; s++) stars += '<svg><use href="#i-star' + (s < st ? '' : '0') + '"/></svg>';
      b.innerHTML = '<span class="num">' + (free ? '∞' : lv) + '</span><svg class="ic" aria-hidden="true"><use href="#' + MICON[lv - 1] + '"/></svg>' +
        '<span class="ms">' + MSHORT[lv - 1] + '</span><span class="st">' + (free ? (save.best[lv - 1] ? fmt(save.best[lv - 1]) : '') : stars) + '</span>' +
        (open ? '' : '<svg class="lock" aria-hidden="true"><use href="#i-lock"/></svg>');
      b.setAttribute('aria-label', (free ? 'لعب حر' : 'المرحلة ' + lv) + (open ? '' : '، مقفلة'));
      (function (n, el, ok) {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!ok) { J.error(); wiggle(el); return; }
          J.select(); start(n);
        });
      })(lv, b, open);
      grid.appendChild(b);
    }
    $('levelsStars').querySelector('b').textContent = String(FP.totalStars(save));
  }
  function openLevels() { J.select(); buildLevels(); setScreen('levels'); }
  function closeLevels() { J.back(); refreshTitle(); setScreen('title'); }

  /* ---------------------------------------------------------------- shop */
  var skinBtns = [], themeBtns = [];
  function buildShop() {
    FP.SKINS.forEach(function (sk, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'item';
      b.innerHTML = '<canvas width="180" height="180"></canvas><b>' + SKIN_NAMES[i] + '</b><span></span>';
      on(b, function () { pick('skin', i, b); });
      $('skinGrid').appendChild(b); skinBtns.push(b);
    });
    FP.THEMES.forEach(function (tm, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'item';
      b.innerHTML = '<canvas width="400" height="180"></canvas><b>' + THEME_NAMES[i] + '</b><span></span>';
      on(b, function () { pick('theme', i, b); });
      $('themeGrid').appendChild(b); themeBtns.push(b);
    });
    paintShop();
  }
  function paintShop() {
    skinBtns.forEach(function (b, i) {
      var c = b.querySelector('canvas').getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 180, 180);
      c.lineJoin = 'round'; c.lineCap = 'round';
      FP.drawBall(c, FP.SKINS[i].id, 90, 92, 52, 0.4, 0.2);
    });
    themeBtns.forEach(function (b, i) {
      var c = b.querySelector('canvas').getContext('2d'), a = FP.THEME_ART[i];
      c.setTransform(1, 0, 0, 1, 0, 0);
      var g = c.createLinearGradient(0, 0, 0, 180); g.addColorStop(0, a.water[0]); g.addColorStop(1, a.water[1]);
      c.fillStyle = g; c.fillRect(0, 0, 400, 180);
      c.fillStyle = a.pad; c.beginPath(); c.moveTo(70, 120); c.arc(70, 120, 34, 0.4, 5.9); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(330, 60); c.arc(330, 60, 26, 2, 7.6); c.closePath(); c.fill();
      if (a.flies) { c.fillStyle = a.glow; [[120, 40], [250, 30], [300, 140], [180, 150]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], 5, 0, 7); c.fill(); }); }
      if (a.candy) { c.fillStyle = '#fff'; [[110, 50], [240, 120], [300, 30], [160, 140]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], 6, 0, 7); c.fill(); }); }
      c.setTransform(0.95, 0, 0, 0.95, 200, 96);
      FP.drawFrogHead(c, 0, 0, 0.62, { t: 0.3 });
      c.setTransform(1, 0, 0, 1, 0, 0);
      FP.drawBall(c, FP.SKINS[save.skin].id, 266, 150, 16, 0, 0);
    });
  }
  function refreshShop() {
    var total = FP.totalStars(save);
    $('shopStars').querySelector('b').textContent = String(total);
    function mark(list, kind, chosen) {
      list.forEach(function (b, i) {
        var own = FP.owns(save, kind, i), cost = (kind === 'skin' ? FP.SKINS : FP.THEMES)[i].cost;
        b.classList.toggle('on', chosen === i);
        b.classList.toggle('locked', !own);
        b.querySelector('span').innerHTML = own ? (chosen === i ? '✔' : '') : cost + ' <svg aria-hidden="true"><use href="#i-star"/></svg>';
        b.setAttribute('aria-pressed', String(chosen === i));
        b.setAttribute('aria-label', (kind === 'skin' ? SKIN_NAMES[i] : THEME_NAMES[i]) + (own ? '' : '، ' + starsText(cost)));
      });
    }
    mark(skinBtns, 'skin', save.skin);
    mark(themeBtns, 'theme', save.theme);
  }
  function pick(kind, i, el) {
    if (!FP.owns(save, kind, i)) { J.error(); wiggle(el); return; }
    if (kind === 'skin') save.skin = i; else { save.theme = i; view.setTheme(i); }
    J.coin(3);
    persist();
    paintShop();
    refreshShop();
    dirty = true;
  }
  function openShop() {
    J.select();
    save.seen = FP.unlockCount(save);
    persist();
    refreshShop();
    setScreen('shop');
  }
  function closeShop() { J.back(); refreshTitle(); setScreen('title'); }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); }

  /* ---------------------------------------------------------------- input */
  function on(el, fn) { el.addEventListener('click', function (e) { e.stopPropagation(); fn(); if (e.detail > 0) el.blur(); }); }
  on($('btnPlay'), play);
  on($('btnLevels'), openLevels);
  on($('btnShop'), openShop);
  on($('btnPause'), pause);
  on($('btnResume'), resume);
  on($('btnHome'), function () { J.back(); toTitle(); });
  on($('btnRestart'), restart);
  on($('btnNext'), next);
  on($('btnAgain'), again);
  on($('btnMenu'), function () { J.back(); toTitle(); });
  on($('levelsBack'), closeLevels);
  on($('shopBack'), closeShop);
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    var c = e.code;
    if (screen === 'play' && (c === 'KeyP' || c === 'Escape')) { e.preventDefault(); pause(); return; }
    if (screen === 'pause') {
      if (c === 'KeyP' || c === 'Escape' || c === 'Enter' || c === 'Space') { e.preventDefault(); resume(); }
      else if (c === 'KeyR') restart();
      return;
    }
    if (screen === 'result') {
      if (c === 'Enter' || c === 'Space') { e.preventDefault(); next(); }
      else if (c === 'KeyR') again();
      else if (c === 'Escape') { J.back(); toTitle(); }
      return;
    }
    if (screen === 'levels' && c === 'Escape') { e.preventDefault(); closeLevels(); return; }
    if (screen === 'shop' && (c === 'Escape' || c === 'Enter')) { e.preventDefault(); closeShop(); return; }
    if (screen === 'title' && (c === 'Enter' || c === 'Space')) { e.preventDefault(); play(); }
  });
  // The mouse: the left button is the left flipper, the right button the right one (Kit blocks
  // the menu). A left click on the plunger lane while a ball waits pulls the plunger instead.
  function inLane(e) { var p = fit.toLogical(e.clientX, e.clientY); return p.x > X0 + 470 && p.y > 300; }
  canvas.addEventListener('mousedown', function (e) {
    if (screen !== 'play' || !world) return;
    if (e.button === 0) { if (FP.waiting(world) && inLane(e)) mouse.pull = mouse.hp = true; else mouse.l = mouse.hl = true; }
    else if (e.button === 2) mouse.r = mouse.hr = true;
  });
  window.addEventListener('mouseup', function (e) {
    if (e.button === 0) { mouse.l = false; mouse.pull = false; }
    else if (e.button === 2) mouse.r = false;
  });
  // A touch screen: the left half is the left flipper, the right half the right one.
  var touches = {};
  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' || screen !== 'play' || !world) return;
    var p = fit.toLogical(e.clientX, e.clientY);
    touches[e.pointerId] = FP.waiting(world) && p.x > X0 + 470 ? 'pull' : p.x < W / 2 ? 'l' : 'r';
    touchState();
  });
  function touchEnd(e) { if (touches[e.pointerId]) { delete touches[e.pointerId]; touchState(); } }
  window.addEventListener('pointerup', touchEnd);
  window.addEventListener('pointercancel', touchEnd);
  function touchState() {
    var s = { l: false, r: false, pull: false };
    for (var k in touches) s[touches[k]] = true;
    mouse.tl = s.l; mouse.tr = s.r; mouse.tp = s.pull;
  }
  // Held keys and buttons, plus presses that came and went between two frames.
  var KL = ['ArrowLeft', 'KeyA', 'KeyZ', 'ShiftLeft'], KR = ['ArrowRight', 'KeyD', 'Slash', 'ShiftRight'], KP = ['Space', 'ArrowDown'];
  // (one reused object: this runs every frame)
  var buttons = { left: false, right: false, pull: false };
  function readInput() {
    var k = Kit.keys, b = buttons;
    b.left = k.anyDown(KL) || k.anyPressed(KL) || mouse.l || mouse.hl || !!mouse.tl;
    b.right = k.anyDown(KR) || k.anyPressed(KR) || mouse.r || mouse.hr || !!mouse.tr;
    b.pull = k.anyDown(KP) || k.anyPressed(KP) || mouse.pull || mouse.hp || !!mouse.tp;
    mouse.hl = mouse.hr = mouse.hp = false;
    return b;
  }

  /* -------------------------------------------------------- sounds and fx */
  var LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  function note(base, i) { return base * M.pow(2, LADDER[M.min(LADDER.length - 1, i)] / 12); }
  var S = {
    flip: function () { AU.noise({ dur: 0.035, vol: 0.1, filter: 2600 }); AU.tone({ freq: 210, to: 120, type: 'square', dur: 0.04, vol: 0.05 }); },
    thwack: function (p) { J.impact(0.15 + 0.35 * p); },
    boing: function (combo) {
      var f = note(220, combo - 1);
      AU.tone({ freq: f, to: f * 2.4, type: 'sine', dur: 0.1, vol: 0.24 });
      AU.tone({ freq: f * 2.4, to: f * 1.5, type: 'triangle', dur: 0.16, vol: 0.12, delay: 0.08 });
    },
    sling: function () { AU.tone({ freq: 880, to: 420, type: 'triangle', dur: 0.06, vol: 0.13 }); AU.noise({ dur: 0.03, vol: 0.06, filter: 3500 }); },
    quack: function (i) {
      var f = 560 + i * 40;
      AU.tone({ freq: f, to: f * 0.6, type: 'sawtooth', dur: 0.1, vol: 0.1 });
      AU.tone({ freq: f * 0.95, to: f * 0.55, type: 'sawtooth', dur: 0.12, vol: 0.1, delay: 0.12 });
    },
    gulp: function () { AU.tone({ freq: 460, to: 80, type: 'sine', dur: 0.24, vol: 0.32 }); AU.noise({ dur: 0.12, vol: 0.1, filter: 700, to: 150 }); },
    burp: function (big) {
      var n = big ? 9 : 6;
      for (var i = 0; i < n; i++) AU.tone({ freq: (i % 2 ? 92 : 108) - i * 2, to: 70, type: 'sawtooth', dur: 0.075, vol: 0.15, delay: i * 0.055 });
      AU.noise({ dur: n * 0.055, vol: 0.12, filter: 420, to: 120 });
    },
    boost: function () { J.whoosh(0.6); AU.tone({ freq: 300, to: 900, type: 'triangle', dur: 0.14, vol: 0.12 }); },
    orbit: function () { J.whoosh(0.9); [0, 4, 7, 12].forEach(function (s, i) { AU.tone({ freq: 523 * M.pow(2, s / 12), type: 'triangle', dur: 0.1, vol: 0.13, delay: 0.05 + i * 0.06 }); }); },
    spin: function (w) { AU.tone({ freq: 1500 + M.min(1500, w * 40), type: 'triangle', dur: 0.025, vol: 0.05 }); },
    kick: function () { J.jump(1); AU.tone({ freq: 140, to: 520, type: 'square', dur: 0.12, vol: 0.06 }); },
    launch: function (p) { AU.tone({ freq: 110, to: 420 + p * 400, type: 'triangle', dur: 0.22, vol: 0.2 }); AU.noise({ dur: 0.18, vol: 0.1, filter: 1600, to: 300 }); },
    saved: function () { J.pop(0.4); J.chime(1); },
    drain: function () { AU.tone({ freq: 760, to: 160, type: 'sine', dur: 0.55, vol: 0.2 }); },
    wall: function (p) { J.land(0.2 + p * 0.5); },
    clack: function () { AU.tone({ freq: 1800, to: 1200, type: 'triangle', dur: 0.03, vol: 0.08 }); }
  };
  function float(text, x, y, color, size, vy) {
    if (floats.length > 36) floats.shift();
    floats.push({ text: text, x: x, y: y, color: color || '#fff', size: size || 28, vy: vy || -120, life: 1, rtl: /[؀-ۿ]/.test(text) });
  }
  function showBanner(text, color, secs, sub) { banner = { text: text, sub: sub || '', color: color || '#fff', t: 0, max: secs || 1.6 }; }
  function setMood(name, secs) { if (mood.name === 'cheer' && name !== 'cheer' && mood.t < mood.len) return; mood = { name: name, t: 0, len: secs || 1 }; }
  function burst(x, y, colors, n, speed, life) { if (!calm()) fx.burst(X0 + x, y, { count: n, colors: colors, speed: speed || 260, life: life || 0.5, size: 6, gravity: 300 }); }
  function pts(p) { return '+' + fmt(p); }
  function handle(ev) {
    switch (ev.type) {
      case 'flip':
        if (time - flipAt > 0.04) S.flip();
        flipAt = time; noFlip = 0;
        if (hint === 2) { hint = 0; save.coach = true; Kit.stats.tutorial('done'); persist(); }
        break;
      case 'flipHit': S.thwack(ev.p); break;
      case 'launch':
        S.launch(ev.power / FP.MAXP);
        if (hint === 1) hint = save.coach ? 0 : 2;
        waitAt = -1;
        burst(ev.x, ev.y, ['#fff', '#ffe14f'], 10, 220);
        break;
      // a new ball after a drain waits for the child (a saved ball goes by itself): the time
      // to the plunger press is a reaction time
      case 'serve': waitAt = world.launches && ev.auto > 1 ? world.t : -1; break;
      case 'bumper':
        S.boing(ev.combo); Kit.track.hit();
        burst(ev.x, ev.y, ['#d8ff6b', '#fff', '#ff8cc6'], 10, 260);
        shake.add(2.5);
        if (ev.score) float(pts(ev.score), X0 + ev.x, ev.y - 10, '#fff36b', 26);
        if (ev.combo >= 3 && ev.combo % 3 === 0) { float('بونغ ' + ltr('×' + ev.combo) + '!', X0 + ev.x, ev.y - 44, '#ffffff', 34, -90); setMood('laugh', 1.2); }
        else if (ev.combo === 1) float('بونغ!', X0 + ev.x + 20, ev.y - 40, '#d8ff6b', 26, -80);
        break;
      case 'sling': S.sling(); burst(ev.x, ev.y, ['#fff', '#ff8cc6'], 6, 200); if (ev.score) float(pts(ev.score), X0 + ev.x, ev.y - 14, '#fff', 20); break;
      case 'duck':
        S.quack(ev.i); Kit.track.hit();
        burst(ev.x, ev.y, ['#ffd93d', '#fff', '#7debd9'], 14, 260);
        float('كواك!', X0 + ev.x, ev.y - 30, '#ffd93d', 34, -100);
        if (ev.score) float(pts(ev.score), X0 + ev.x + 20, ev.y, '#fff', 22);
        break;
      case 'bank':
        J.chime(3); J.coin(5);
        showBanner(ltr('×' + ev.mult) + '!', '#ffe14f', 1.3, 'البط كله!');
        burst(ev.x, ev.y, ['#ffd93d', '#ffffff', '#ff8cc6'], 30, 380, 0.8);
        setMood('cheer', 1.2);
        break;
      case 'ducksUp': AU.tone({ freq: 400, to: 800, type: 'triangle', dur: 0.12, vol: 0.1 }); break;
      case 'gulp':
        S.gulp(); Kit.track.hit();
        tongue.k = 1; tongue.x = ev.from[0]; tongue.y = ev.from[1];
        float('غلب!', X0 + ev.x, ev.y + 40, '#ff8cc6', 46, -70);
        if (ev.score) float(pts(ev.score), X0 + ev.x + 60, ev.y + 10, '#fff36b', 28);
        setMood('gulp', 1.1);
        shake.add(4);
        break;
      case 'burp':
        if (!ev.extra) {
          S.burp(ev.multi); frogFx.burp = 1; frogFx.multi = ev.multi;
          float('بُرررب!', X0 + ev.x, ev.y + 30, '#7dff6a', 48, -60);
          shake.add(ev.multi ? 10 : 5);
          setMood('laugh', 1.3);
        } else J.pop(0.6);
        burst(ev.x, ev.y, ['#c9f59a', '#ffffff', '#7debd9'], 12, 240);
        break;
      case 'multiball':
        J.levelUp(); Kit.stats.busy();
        showBanner('مطر الكرات!', '#7debd9', 2, pts(ev.score));
        burst(ev.x, ev.y, ['#ffffff', '#c9d4e3', '#7debd9', '#ffe14f'], 40, 420, 1);
        setMood('cheer', 2);
        break;
      case 'boost': S.boost(); burst(ev.x, ev.y, ['#fff36b', '#ffffff'], 8, 200); break;
      case 'orbit':
        S.orbit(); Kit.track.hit();
        float('لفّة!', X0 + 261, 40, '#4fd8ff', 44, 40);
        if (ev.score) float(pts(ev.score), X0 + ev.x, ev.y + 30, '#fff36b', 28);
        setMood('wow', 1);
        break;
      case 'spin': if (time - spinAt > 0.05) { spinAt = time; S.spin(ev.w); } break;
      case 'kick':
        S.kick(); shake.add(5);
        float('بوينغ!', X0 + ev.x + (ev.side ? -40 : 40), ev.y - 40, '#ffe14f', 32, -80);
        burst(ev.x, ev.y, ['#ffe14f', '#fff'], 16, 300);
        break;
      case 'saved':
        S.saved();
        float('مرة أخرى!', X0 + 261, 640, '#ffffff', 40, -70);
        setMood('wow', 1);
        break;
      case 'lost': J.pop(0.8); break;
      case 'drain':
        S.drain(); Kit.track.miss(); shake.add(6);
        float(ev.left > 0 ? 'أوه!' : 'أوه لا!', X0 + 261, 620, '#ffb0c8', 44, -60);
        setMood('sad', 1.6);
        break;
      case 'wall': if (time - wallAt > 0.09) { wallAt = time; S.wall(ev.p); } break;
      case 'clack': S.clack(); break;
      case 'bud': AU.tone({ freq: 520, to: 980, type: 'sine', dur: 0.09, vol: 0.12 }); burst(ev.x, ev.y + 10, ['#ff8cc6', '#ffffff'], 6, 160); break;
      case 'nudge': AU.tone({ freq: 300, to: 500, type: 'triangle', dur: 0.08, vol: 0.08 }); break;
      case 'progress':
        if (world.L.m !== 'score' && world.L.m !== 'free' && ev.prog < ev.goal && ev.prog > 0) J.coin(M.min(5, ev.prog));
        break;
      case 'mission':
        finish('win');
        J.levelUp(); Kit.stats.busy();
        showBanner('مهمة تمّت!', '#ffe14f', 2.4, CHEERS[(level * 7) % CHEERS.length]);
        setMood('cheer', 3);
        if (!calm()) for (var i = 0; i < 5; i++) fx.burst(X0 + 60 + i * 110, 120, { count: 26, colors: ['#ff5fa2', '#ffe14f', '#4fd8ff', '#7dff6a', '#ffffff'], speed: 420, life: 1.4 });
        if (ev.bonus) float('كرات باقية ' + ltr(pts(ev.bonus)), X0 + 280, 540, '#7dff6a', 34, -50);
        say('أحسنت! مهمة تمّت');
        break;
      case 'gameover':
        finish(level === FP.FREE ? 'end' : 'lose');
        setMood('sad', 2);
        break;
    }
  }

  /* --------------------------------------------------------------- update */
  function update(dt) {
    time += dt;
    if (screen === 'play' && world) {
      var inp = readInput();
      if (outcome) { inp.pull = false; }
      if (waitAt >= 0 && inp.pull && !pullWas) { Kit.track.react((world.t + dt - waitAt) * 1000); waitAt = -1; }
      pullWas = inp.pull;
      FP.step(world, dt, inp);
      for (var i = 0; i < world.ev.length; i++) handle(world.ev[i]);
      world.ev.length = 0;
      for (var b = 0; b < world.balls.length; b++) { var ball = world.balls[b]; ball.spin = (ball.spin || 0) + ball.vx * dt / FP.R; }
      if (FP.launched(world) && world.balls.length) noFlip += dt;
      if (outcome) {
        endT += dt;
        if (outcome.won) Kit.stats.busy();
        if (endT > endDelay()) showResult();
      }
      dirty = true;
    } else if (screen === 'title' && demo && !calm()) {
      // the title's attract run: no sound, no statistics
      FP.step(demo, dt, FP.bot(demo, demoRnd, 0.8, demoMem));
      demo.ev.length = 0;
      for (var d = 0; d < demo.balls.length; d++) { var db = demo.balls[d]; db.spin = (db.spin || 0) + db.vx * dt / FP.R; }
      if (demo.over || demo.t > 90) demo = FP.create({ level: FP.FREE, gravity: 1000, seed: (time * 100) | 0 });
      dirty = true;
    }
    for (var f = floats.length - 1; f >= 0; f--) {
      var p = floats[f];
      p.life -= dt * 1.1; p.y += p.vy * dt; p.vy *= 0.97;
      if (p.life <= 0) floats.splice(f, 1);
    }
    if (banner) { banner.t += dt; if (banner.t > banner.max) banner = null; }
    mood.t += dt; if (mood.t > mood.len && mood.name !== 'idle') mood = { name: 'idle', t: 0, len: 0 };
    frogFx.burp = M.max(0, frogFx.burp - dt * 1.8);
    tongue.k = M.max(0, tongue.k - dt * 5);
    scorePop = M.max(0, scorePop - dt * 4);
    fx.update(dt); shake.update(dt);
    Kit.keys.endFrame();
  }

  /* ------------------------------------------------------------------ HUD */
  function text(str, x, y, size, color, align, rtl, stroke) {
    ctx.font = '700 ' + size + 'px Fredoka'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    if (stroke !== false) { ctx.lineJoin = 'round'; ctx.lineWidth = M.max(4, size * 0.18); ctx.strokeStyle = FP.INK; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
    ctx.direction = 'ltr';
  }
  function card(x, y, w, h, fill, r) {
    FP.rrect(ctx, x, y, w, h, r || 24); ctx.fillStyle = fill || 'rgba(18,53,54,0.82)'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
  }
  // Wraps Arabic words into lines no wider than w.
  var missionLines = null, linesFor = 0;
  function lines(str, size, w) {
    ctx.font = '700 ' + size + 'px Fredoka'; ctx.direction = 'rtl';
    var words = str.split(' '), out = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var test = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > w && cur) { out.push(cur); cur = words[i]; } else cur = test;
    }
    if (cur) out.push(cur);
    ctx.direction = 'ltr';
    return out;
  }
  function star(x, y, r, on) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) { var a = -M.PI / 2 + i * M.PI / 5, rr = i % 2 ? r * 0.48 : r; ctx.lineTo(x + M.cos(a) * rr, y + M.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = on ? '#ffd93d' : 'rgba(255,255,255,0.22)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = on ? FP.INK : 'rgba(255,255,255,0.5)'; ctx.stroke();
  }
  function missionIcon(m, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    if (m === 'bump') { ctx.drawImage(view.bumper, -30, -30, 60, 60); FP.googly(ctx, -8, -12, 7.5, 0, 0.5, 2); FP.googly(ctx, 8, -13, 6.5, 0, 0.5, 2); }
    else if (m === 'duck') { ctx.rotate(0.3); ctx.drawImage(view.duck, -30, -34, 60, 60); }
    else if (m === 'feed' || m === 'multi') { FP.drawFrogHead(ctx, 0, 6, 0.3, { t: time, open: m === 'feed' ? 0.8 : 0 }); if (m === 'multi') { FP.drawBall(ctx, 'chrome', -22, -26, 9, 0, 0); FP.drawBall(ctx, 'chrome', 22, -30, 9, 0, 0); FP.drawBall(ctx, 'chrome', 0, -40, 9, 0, 0); } }
    else if (m === 'orbit') { ctx.beginPath(); ctx.moveTo(-22, 26); ctx.lineTo(-22, -4); ctx.arc(0, -4, 22, M.PI, 0); ctx.lineTo(22, 22); ctx.lineWidth = 12; ctx.strokeStyle = FP.INK; ctx.stroke(); ctx.lineWidth = 7; ctx.strokeStyle = '#4fd8ff'; ctx.stroke(); ctx.beginPath(); ctx.moveTo(12, 18); ctx.lineTo(22, 32); ctx.lineTo(32, 18); ctx.closePath(); ctx.fillStyle = FP.INK; ctx.fill(); }
    else if (m === 'mult') { text('×3', 0, 2, 40, '#ffe14f'); }
    else { ctx.beginPath(); ctx.arc(0, 0, 24, 0, 7); ctx.fillStyle = '#ffd93d'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = FP.INK; ctx.stroke(); text('★', 0, 2, 26, '#fff7c2'); }
    ctx.restore();
  }
  function drawHud() {
    var w = world, L = w.L;
    // left panel: the level, the mission, the balls and the star targets
    card(96, 16, 250, 62, 'rgba(18,53,54,0.85)', 31);
    text(level === FP.FREE ? 'لعب حر' : 'المرحلة ' + level, 221, 48, 32, '#ffffff', 'center', true);
    card(16, 92, 330, 196, '#fffdf2', 26);
    missionIcon(L.m, 288, 146, 0.95);
    if (linesFor !== level) { missionLines = lines(missionText(level), 29, 204); linesFor = level; }
    var ml = missionLines, top = ml.length > 1 ? 128 : 146;
    for (var i = 0; i < ml.length && i < 3; i++) text(ml[i], 240, top + i * 38, 29, FP.INK, 'right', true, false);
    if (L.m !== 'free') {
      var goal = L.goal, prog = w.prog, f = M.min(1, (L.m === 'mult' ? prog - 1 : prog) / (L.m === 'mult' ? goal - 1 : goal));
      var bx = 34, by = 220, bw = 294, bh = 48;
      FP.rrect(ctx, bx, by, bw, bh, bh / 2); ctx.fillStyle = '#d9efe7'; ctx.fill();
      if (f > 0.01) { FP.rrect(ctx, bx + bw * (1 - f), by, M.max(bh, bw * f), bh, bh / 2); ctx.fillStyle = f >= 1 ? '#3ddc84' : '#ffd93d'; ctx.fill(); }
      FP.rrect(ctx, bx, by, bw, bh, bh / 2); ctx.lineWidth = 4; ctx.strokeStyle = FP.INK; ctx.stroke();
      var label = L.m === 'score' ? fmt(M.min(prog, goal)) + ' / ' + fmt(goal) : L.m === 'mult' ? '×' + prog + ' / ×' + goal : prog + ' / ' + goal;
      text(label, bx + bw / 2, by + bh / 2 + 1, 30, '#ffffff');
    } else {
      text('الأفضل', 300, 244, 28, FP.INK, 'right', true, false);
      text(fmt(save.best[FP.FREE - 1]), 120, 244, 34, '#ff5fa2', 'center', false);
    }
    // balls left (small and spaced enough that the tiny planet's rings stay apart)
    card(16, 304, 330, 92, 'rgba(18,53,54,0.85)', 26);
    text('الكرات', 314, 350, 30, '#ffffff', 'right', true);
    for (var k = 0; k < FP.BALLS; k++) {
      var cx = 58 + k * 62, has = k < w.ballsLeft;
      if (has) FP.drawBall(ctx, FP.SKINS[save.skin].id, cx, 350, 16, 0, time);
      else { ctx.beginPath(); ctx.arc(cx, 350, 15, 0, 7); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke(); }
    }
    // the star targets: one star for the mission, two and three for more points
    if (L.m !== 'free') {
      card(16, 412, 330, 84, 'rgba(18,53,54,0.85)', 26);
      for (var st = 0; st < 3; st++) {
        var sx = 291 - st * 110, need = st ? L.stars[st - 1] : 0, got = st ? w.score >= need : !!(w.over === 'win');
        star(sx, 440, 17, got);
        if (st) text(fmt(need), sx, 476, 21, got ? '#ffe14f' : 'rgba(255,255,255,0.8)', 'center', false, false);
        else text('المهمة', sx, 476, 20, got ? '#ffe14f' : 'rgba(255,255,255,0.8)', 'center', true, false);
      }
    }
    if (w.saveT > 0 && !w.over) {
      card(16, 512, 330, 70, 'rgba(255,255,255,0.92)', 26);
      var pulse = calm() ? 1 : 1 + 0.08 * M.sin(time * 8);
      ctx.save(); ctx.translate(58, 547); ctx.scale(pulse, pulse);
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.fillStyle = 'rgba(125,235,217,0.6)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = FP.INK; ctx.stroke();
      FP.drawBall(ctx, FP.SKINS[save.skin].id, 0, 2, 11, 0, time);
      ctx.restore();
      text(w.saveFor === 1 / 0 ? 'الكرة تعود دائمًا' : 'الكرة تعود: ' + ltr(String(M.ceil(w.saveT))), 316, 548, 26, FP.INK, 'right', true, false);
    }
    // right panel: the score, the multiplier and the frog
    if (w.score !== shownScore) { scorePop = 1; shownScore = w.score; }
    card(934, 92, 330, 118, 'rgba(18,53,54,0.85)', 30);
    text('النقاط', 1099, 122, 26, '#c9f59a', 'center', true);
    var sc = 1 + scorePop * 0.12;
    ctx.save(); ctx.translate(1099, 168); ctx.scale(sc, sc); text(fmt(w.score), 0, 0, 56, '#ffffff'); ctx.restore();
    var mk = w.mult > 1;
    ctx.save(); ctx.translate(1099, 262);
    var wob = calm() || !mk ? 0 : M.sin(time * 5) * 0.08;
    ctx.rotate(wob);
    ctx.beginPath();
    for (var s = 0; s < 24; s++) { var a = s / 24 * M.PI * 2, r = s % 2 ? 40 : 54; ctx.lineTo(M.cos(a) * r, M.sin(a) * r); }
    ctx.closePath(); ctx.fillStyle = mk ? '#ffe14f' : 'rgba(255,255,255,0.25)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = FP.INK; ctx.stroke();
    text(ltr('×' + w.mult), 0, 3, 40, mk ? '#ff5fa2' : '#ffffff');
    ctx.restore();
    drawMascot();
  }
  function drawMascot() {
    FP.drawMascot(ctx, 1099, 520, 0.92, mood.name, mood.len ? M.min(1, mood.t / mood.len) : 0, time, calm());
  }
  // The first-time hint: the Space keycap at the plunger, then the arrow keycaps at the flippers.
  function keycap(label, x, y, w) {
    w = w || 56;
    FP.rrect(ctx, x - w / 2, y - 26, w, 52, 12); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = FP.INK; ctx.stroke();
    FP.rrect(ctx, x - w / 2, y + 18, w, 8, 4); ctx.fillStyle = '#9aa3c7'; ctx.fill();
    text(label, x, y - 2, 28, FP.INK, 'center', /[؀-ۿ]/.test(label), false);
  }
  function drawHints() {
    var w = world, bob = calm() ? 0 : M.abs(M.sin(time * 5)) * 10;
    var waiting = FP.waiting(w);
    if (hint === 1 && waiting) {
      // beside the plunger, in the right panel under the frog
      keycap('مسافة', 1010, 676, 112);
      text('أطلق الكرة!', 1180, 676, 30, '#ffffff', 'center', true);
      var ax = 938 - bob;
      ctx.beginPath(); ctx.moveTo(ax + 6, 664); ctx.lineTo(ax - 14, 676); ctx.lineTo(ax + 6, 688); ctx.closePath();
      ctx.fillStyle = '#ffe14f'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = FP.INK; ctx.stroke();
    }
    var show = (hint === 2 && !waiting) || (noFlip > 9 && FP.launched(w) && !w.over);
    if (show) {
      keycap('←', X0 + 104, 682 - bob); keycap('→', X0 + 418, 682 - bob);
      card(X0 + 186, 586, 150, 46, 'rgba(255,95,162,0.95)', 23);
      text('اضرب!', X0 + 261, 610, 28, '#fff', 'center', true);
    }
  }

  /* --------------------------------------------------------------- render */
  function render() {
    if (screen !== 'play' && screen !== 'title' && !dirty) return; // a still menu keeps its last frame
    if (screen === 'title' && calm() && !dirty) return;
    var w = screen === 'title' ? demo : world;
    ctx.save();
    if (shake.power && screen === 'play') ctx.translate(shake.x, shake.y);
    if (w) {
      viewOpts.t = time; viewOpts.skin = FP.SKINS[save.skin].id;
      view.render(w, viewOpts);
    } else view.panelsOnly();
    ctx.restore();
    if (screen === 'title') { FP.drawMascot(ctx, 180, 410, 0.78, 'idle', 0, time, calm()); dirty = false; return; }
    if (world) {
      drawHud();
      drawHints();
      fx.draw(ctx);
      for (var i = 0; i < floats.length; i++) {
        var p = floats[i];
        ctx.globalAlpha = M.max(0, M.min(1, p.life * 1.6));
        text(p.text, p.x, p.y, p.size, p.color, 'center', p.rtl);
      }
      ctx.globalAlpha = 1;
      if (banner) {
        var k = banner.t / banner.max, s = calm() ? 1 : k < 0.12 ? 0.4 + k / 0.12 * 0.7 : k < 0.2 ? 1.1 - (k - 0.12) * 1.2 : 1;
        ctx.globalAlpha = k > 0.82 ? M.max(0, (1 - k) / 0.18) : 1;
        ctx.save(); ctx.translate(X0 + 280, 430); ctx.scale(s, s);
        text(banner.text, 0, 0, 72, banner.color, 'center', /[؀-ۿ]/.test(banner.text));
        if (banner.sub) text(banner.sub, 0, 62, 34, '#ffffff', 'center', /[؀-ۿ]/.test(banner.sub));
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
    dirty = false;
  }

  /* ----------------------------------------------------- test and debug hook */
  var r3 = function (v) { return M.round(v * 1000) / 1000; };
  function snapshot() {
    var w = world, b = w ? FP.mainBall(w) : null;
    return {
      screen: screen, t: w ? r3(w.t) : 0, bx: b ? M.round(b.x) : 0, by: b ? M.round(b.y) : 0,
      score: w ? w.score : 0, flipL: w ? r3(w.flippers[0].ang) : r3(T.rest), flipR: w ? r3(w.flippers[1].ang) : r3(T.rest),
      balls: w ? w.ballsLeft : 0, launched: w ? FP.launched(w) : false, level: level, mission: w ? w.prog : 0,
      goal: w ? w.L.goal : 0, mult: w ? w.mult : 1, live: w ? FP.liveCount(w) : 0, over: w ? w.over : '',
      saveT: w ? (w.saveT === 1 / 0 ? -1 : r3(w.saveT)) : 0, feeds: w ? w.feeds : 0, bumps: w ? w.bumps : 0, ducks: w ? w.duckHits : 0,
      orbits: w ? w.orbits : 0, multis: w ? w.multis : 0, drains: w ? w.drains : 0, saves: w ? w.saves : 0, kick: w ? w.kick.slice() : [false, false],
      hint: hint, stars: FP.totalStars(save), skin: save.skin, theme: save.theme, result: outcome ? outcome.kind : '', calm: calm()
    };
  }

  /* ----------------------------------------------------------------- init */
  Kit.muteButton();
  Kit.lifecycle({ pause: pause, reset: function () { mouse.l = mouse.r = mouse.pull = false; touches = {}; touchState(); } });
  Kit.motion.onChange(function (r) { if (view) view.calm = r; dirty = true; });
  window.addEventListener('pageshow', function () { dirty = true; });
  window.addEventListener('pagehide', function () { persist(); });
  canvas.addEventListener('contextrestored', function () { if (view) view.resize(view.k); dirty = true; render(); });
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'ب').then(function () { dirty = true; linesFor = 0; render(); }, function () { /* fallback fonts */ });
  }
  var loop = null;
  try {
    view = FP.createView(ctx);
    view.calm = calm();
    view.setTheme(save.theme, M.min(2.25, M.max(0.5, fit.scale * fit.dpr)));
    demo = FP.create({ level: FP.FREE, gravity: 1000, seed: 5 });
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
