/* Bonk Garden (حديقة البونك): screens, input, saves, the hammer shop, sounds, the HUD and
 * play statistics. engine.js runs the garden; art.js draws it. This is the UI layer: it
 * reads Kit.dda at the start of every round (how long critters stay up, how often they
 * pop, how many at once) and reports each finished round back to it.
 */
(function () {
  'use strict';
  var W = 1280, H = 720, M = Math, INK = '#2a1d4e';
  var J = Kit.juice, AU = Kit.audio;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ui = $('ui');
  var calm = function () { return Kit.motion.reduced(); };
  var dirty = true, view = null;
  var fit = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: function (v) {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    dirty = true;
    if (view) view.resize();
  } });
  var ctx = fit.ctx;

  /* ---------------------------------------------------------------- save */
  var store = Kit.store('bonk-garden');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = BG.loadSave(store.get('save', null));
  function persist() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // How long critters stay up, how often they pop and how many at once follow how the
  // rounds go on this PC (passed into the engine as one number, 0 easy .. 1 hard; level 1
  // ignores it and stays gentle for every child).
  var dda = Kit.dda('bonk-garden', { id: 'main', target: 0.72 });

  /* --------------------------------------------------------------- state */
  var screen = 'title', world = null, demo = null, level = 1, roundOpen = false, outcome = null, time = 0;
  var floats = [], banner = null, flash = 0, frenzyFlash = 0, fx = Kit.particles(), shake = Kit.shake();
  var swings = [], ham = { x: 640, y: 420, sw: 9, giant: 0 }, lit = -1, litT = 0;
  var hint = -1, hintShown = false, intro = null, starPop = [0, 0, 0], starsHad = 0, heartPop = 0, lastTick = -1, comboPop = 0;
  var resultT = 0, resultStars = 0, resultSounds = 0, demoHam = { x: 900, y: 420, sw: 9, target: -1, wait: 0 };
  var CHEERS = ['بونك!', 'بونك!', 'بونك!', 'طاخ!', 'بوينغ!', 'بونك!'];
  var INTROS = {
    helmet: 'خوذة! اضربه مرتين!', disco: 'بروكلي ذهبي: \u2066+5\u2069!', bunny: 'لا تضرب الأرنب!', crab: 'سلطعون الشاطئ!',
    sock: 'الجورب يقفز! اتبعه!', pie: 'أسرع قبل الكريمة!', alien: 'فضائي نطّاط!'
  };
  var SCREENS = { title: 'scrTitle', pause: 'scrPause', result: 'scrResult', levels: 'scrLevels', hammers: 'scrHammers' };
  function setScreen(name) {
    screen = name;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    document.body.classList.toggle('playing', name === 'play');
    Kit.keys.reset();
    swings.length = 0;
    dirty = true;
    if (name === 'play') { focusGame(); if (follow) aim(); }
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function hammerId() { return BG.HAMMERS[save.hammer].id; }
  // Arabic counted nouns: 3..10 take the plural, 11 and up the singular.
  function count(n, few, many) { return n + ' ' + (n > 2 && n < 11 ? few : many); }

  /* ------------------------------------------------------------ the title */
  function refreshTitle() {
    var n = BG.next(save);
    $('titleStars').querySelector('b').textContent = String(BG.totalStars(save));
    $('titleLevel').querySelector('small').textContent = n ? 'المرحلة' : 'بلا نهاية';
    $('titleLevel').querySelector('b').textContent = n ? String(n) : '∞';
  }
  function toTitle() {
    quitRound();
    world = null;
    persist();
    refreshTitle();
    setScreen('title');
  }
  function quitRound() { if (roundOpen) { Kit.stats.end('quit'); roundOpen = false; } }
  // n: 1..12, or 0 for the endless garden.
  function startRound(n) {
    level = n;
    var d = dda.level; // read at every round start
    world = BG.create({ level: n, d: d, seed: (M.random() * 4294967295) >>> 0 });
    Kit.stats.round(n ? 'L' + n : 'endless');
    roundOpen = true; outcome = null;
    floats.length = 0; banner = null; fx.clear(); view.clearFx();
    starPop = [0, 0, 0]; starsHad = 0; heartPop = 0; lastTick = -1; comboPop = 0; frenzyFlash = 0;
    hint = -1; intro = null; ham.giant = 0; ham.sw = 9;
    save.rounds++;
    var sp = world.spec;
    showBanner(n ? 'المرحلة ' + n : 'بلا نهاية', '#ffffff', 1.5, BG.WORLDS[sp.world].name);
    setScreen('play');
    say(n ? 'المرحلة ' + n : 'بلا نهاية');
  }
  function play() { J.select(); startRound(BG.next(save)); }

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
    quitRound();
    startRound(world ? level : BG.next(save));
  }

  /* ---------------------------------------------------------- the result */
  // The outcome is saved, ended and reported the moment the round is decided (time is up or
  // the hearts are gone), not when the outro is over: a pause, Home or Restart during
  // 'انتهى الوقت!' keep it.
  function decide() {
    if (outcome) return;
    var score = world.score;
    outcome = level ? BG.record(save, level, score) : BG.recordEndless(save, score);
    Kit.stats.end(level ? (outcome.stars > 0 ? 'win' : 'lose') : 'end', score);
    roundOpen = false;
    dda.result(M.max(0, M.min(1, score / world.spec.goals[2])));
    persist();
  }
  function finish() {
    decide();
    var res = outcome;
    if (res.hammers.length) save.hammer = res.hammers[res.hammers.length - 1]; // wear the new toy at once
    persist();
    showResult(res, world.score);
  }
  function showResult(res, score) {
    var s = res.stars;
    resultStars = s; resultT = 0; resultSounds = 0;
    var stars = $('resStars').children;
    for (var i = 0; i < 3; i++) stars[i].classList.toggle('on', i < s);
    $('resTitle').textContent = level ? (s === 3 ? 'مذهل!' : s === 2 ? 'رائع!' : s === 1 ? 'أحسنت!' : 'حاول مرة أخرى!') : (s >= 2 ? 'مذهل!' : 'انتهت القلوب!');
    $('resScore').textContent = Kit.fmt(score);
    $('resBest').hidden = !res.newBest;
    var best = level ? save.best[level - 1] : save.endless;
    $('resSub').textContent = level && s === 0 ? 'تحتاج ' + count(world.spec.goals[0], 'نقاط', 'نقطة') + ' لنجمة' : 'أفضل نتيجة: ' + Kit.fmt(best);
    var note = $('resNote'), text = '';
    note.classList.add('plain');
    if (res.hammers.length) {
      var hm = BG.HAMMERS[res.hammers[res.hammers.length - 1]];
      text = 'مطرقة جديدة: ' + hm.name + '!';
      note.classList.remove('plain');
      paintHammer($('resHammer'), hm.id, 150, 120);
    } else if (res.endless) text = 'فتحتَ «بلا نهاية»!';
    else if (res.opened && res.opened % 4 === 1) text = 'عالم جديد: ' + BG.WORLDS[(res.opened - 1) / 4].name + '!';
    note.querySelector('span').textContent = text;
    note.hidden = !text;
    var nextN = nextAfter();
    $('btnNext').hidden = !level || s === 0 || nextN === null;
    setScreen('result');
    if (res.newBest || s === 3) { fx.burst(640, 200, { count: 60, colors: ['#ff5f7e', '#ffe14f', '#4fd8ff', '#7dffb0', '#b46bff'], speed: 520, life: 1.2 }); }
    dirty = true;
    Kit.stats.busy();
    say($('resTitle').textContent + ' ' + score);
  }
  // Where Next goes after this round: the next level, or the endless garden.
  function nextAfter() {
    if (!level) return 0;
    if (level < BG.LEVELS_N && BG.unlocked(save, level + 1)) return level + 1;
    if (level === BG.LEVELS_N && BG.endlessOpen(save)) return 0;
    return null;
  }
  function next() {
    var n = nextAfter();
    if (n === null || (level && world && world.stars === 0)) { again(); return; }
    J.select(); startRound(n);
  }
  function again() { J.select(); startRound(level); }

  /* -------------------------------------------------------------- levels */
  var lvlBtns = [];
  function buildLevels() {
    var box = $('worlds');
    BG.WORLDS.forEach(function (wd, wi) {
      var row = document.createElement('div');
      row.className = 'world';
      row.innerHTML = '<h3>' + wd.name + '</h3>';
      for (var k = 1; k <= 4; k++) {
        var n = wi * 4 + k, b = document.createElement('button');
        b.type = 'button'; b.className = 'lvl w' + wi;
        b.innerHTML = '<b>' + n + '</b><span class="ss">' + '<svg aria-hidden="true"><use href="#i-star"/></svg>'.repeat(3) + '</span><svg class="lk" aria-hidden="true"><use href="#i-lock"/></svg>';
        (function (n, b) { on(b, function () { pickLevel(n, b); }); })(n, b);
        row.appendChild(b); lvlBtns.push(b);
      }
      box.appendChild(row);
    });
    on($('btnEndless'), function () { pickLevel(0, $('btnEndless')); });
  }
  function refreshLevels() {
    var nx = BG.next(save);
    $('levelsStars').querySelector('b').textContent = String(BG.totalStars(save));
    lvlBtns.forEach(function (b, i) {
      var n = i + 1, open = BG.unlocked(save, n), st = save.stars[i];
      b.classList.toggle('locked', !open);
      b.classList.toggle('next', open && n === nx && !calm());
      b.querySelector('b').classList.toggle('off', !open); b.querySelector('.ss').classList.toggle('off', !open); b.querySelector('.lk').classList.toggle('off', open);
      var ss = b.querySelectorAll('.ss svg');
      for (var k = 0; k < 3; k++) ss[k].classList.toggle('on', k < st);
      b.setAttribute('aria-label', open ? 'المرحلة ' + n + '، ' + ['بلا نجوم', 'نجمة واحدة', 'نجمتان', '3 نجوم'][st] : 'المرحلة ' + n + ' مقفلة');
    });
    var e = $('btnEndless'), eo = BG.endlessOpen(save);
    e.classList.toggle('locked', !eo);
    e.querySelector('span').textContent = eo ? (save.endless ? 'أفضل: ' + Kit.fmt(save.endless) : '') : 'افتحها بالفوز بالمرحلة ' + BG.ENDLESS_AT;
  }
  function openLevels() { J.select(); refreshLevels(); setScreen('levels'); }
  function pickLevel(n, el) {
    if (n ? !BG.unlocked(save, n) : !BG.endlessOpen(save)) { J.error(); wiggle(el); return; }
    J.select(); startRound(n);
  }
  function wiggle(el) { if (!el) return; el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); }

  /* ------------------------------------------------------------- hammers */
  var hamBtns = [];
  function paintHammer(cv, id, w, h) {
    var c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    var k = cv.width / w;
    c.setTransform(k, 0, 0, k, 0, 0);
    BG.drawHammer(c, id, w * 0.44, h * 0.5, 0.62, 0.55, 0, 0.4);
  }
  function buildHammers() {
    var box = $('hammerGrid');
    BG.HAMMERS.forEach(function (hm, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ham';
      b.innerHTML = '<canvas width="300" height="240"></canvas><b>' + hm.name + '</b><span></span>';
      on(b, function () { pickHammer(i, b); });
      box.appendChild(b); hamBtns.push(b);
    });
    paintHammers();
  }
  function paintHammers() { hamBtns.forEach(function (b, i) { paintHammer(b.querySelector('canvas'), BG.HAMMERS[i].id, 150, 120); }); }
  function refreshHammers() {
    var total = BG.totalStars(save);
    $('hammersStars').querySelector('b').textContent = String(total);
    hamBtns.forEach(function (b, i) {
      var open = BG.hammerOpen(save, i), hm = BG.HAMMERS[i];
      b.classList.toggle('on', save.hammer === i);
      b.classList.toggle('locked', !open);
      b.querySelector('span').innerHTML = open ? (save.hammer === i ? '✔' : '') : hm.stars + ' <svg aria-hidden="true"><use href="#i-star"/></svg>';
      b.setAttribute('aria-pressed', String(save.hammer === i));
      b.setAttribute('aria-label', hm.name + (open ? '' : '، تحتاج ' + count(hm.stars, 'نجوم', 'نجمة')));
    });
  }
  function openHammers() { J.select(); refreshHammers(); setScreen('hammers'); }
  function pickHammer(i, el) {
    if (!BG.hammerOpen(save, i)) { J.error(); wiggle(el); return; }
    if (save.hammer !== i) { save.hammer = i; hammerSfx(BG.HAMMERS[i].id); persist(); } else J.tap();
    refreshHammers();
  }

  /* ---------------------------------------------------------------- input */
  function on(el, fn) { el.addEventListener('click', function (e) { e.stopPropagation(); fn(); if (e.detail > 0) el.blur(); }); }
  on($('btnPlay'), play);
  on($('btnLevels'), openLevels);
  on($('btnHammers'), openHammers);
  on($('btnPause'), pause);
  on($('btnResume'), resume);
  on($('btnHome'), function () { J.back(); toTitle(); });
  on($('btnRestart'), restart);
  on($('btnNext'), next);
  on($('btnAgain'), again);
  on($('btnMenu'), function () { J.back(); toTitle(); });
  on($('levelsBack'), function () { J.back(); toTitle(); });
  on($('hammersBack'), function () { J.back(); toTitle(); });
  // R is also the top right hole of the 4 by 3 gardens: there a pause screen leaves it alone
  // (its Restart button stays), and every result screen waits 0.6 s before R plays again,
  // so a child still hammering the hole keys sees the result first.
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    var c = e.code;
    if (screen === 'play') { if (c === 'KeyP' || c === 'Escape') { e.preventDefault(); pause(); } return; }
    if (screen === 'pause') {
      if (c === 'KeyP' || c === 'Escape' || c === 'Enter' || c === 'Space') { e.preventDefault(); resume(); }
      else if (c === 'KeyR' && !(world && world.spec.cols > 3)) restart();
      return;
    }
    if (screen === 'result') {
      if (c === 'Enter' || c === 'Space') { e.preventDefault(); if (resultT > 0.6) { if ($('btnNext').hidden) again(); else next(); } }
      else if (c === 'KeyR' && resultT > 0.6) again();
      else if (c === 'Escape') { J.back(); toTitle(); }
      return;
    }
    if (screen === 'levels' || screen === 'hammers') { if (c === 'Escape') { e.preventDefault(); J.back(); toTitle(); } return; }
    if (screen === 'title' && (c === 'Enter' || c === 'Space')) { e.preventDefault(); play(); }
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (screen !== 'play' || e.button !== 0) return;
    var p = fit.toLogical(e.clientX, e.clientY);
    ham.x = p.x; ham.y = p.y;
    if (swings.length < 8) swings.push({ x: p.x, y: p.y, hole: -2 });
  });
  // The hammer follows the pointer only during play, and only when it really moved (a
  // browser can repeat a move event when nothing moved). Play starts with the hammer where
  // the pointer moved to meanwhile (on Play or Resume, say), or mid-field before the mouse
  // has moved at all; a keyboard player's hammer stays at its last hole.
  var ptr = null, follow = true;
  function aim() {
    var p = ptr ? fit.toLogical(ptr.x, ptr.y) : { x: 640, y: 420 };
    ham.x = M.max(0, M.min(W, p.x)); ham.y = M.max(0, M.min(H, p.y));
    follow = false;
  }
  window.addEventListener('pointermove', function (e) {
    if (ptr && e.clientX === ptr.x && e.clientY === ptr.y) return;
    ptr = { x: e.clientX, y: e.clientY }; follow = true;
    if (screen === 'play') aim();
  });

  /* -------------------------------------------------------- sounds and fx */
  var HSFX = {
    squeak: function () { AU.tone({ freq: 900, to: 1600, type: 'sine', dur: 0.07, vol: 0.16 }); AU.tone({ freq: 1600, to: 760, type: 'sine', dur: 0.11, vol: 0.14, delay: 0.06 }); },
    chicken: function () { AU.tone({ freq: 520, to: 1150, type: 'sawtooth', dur: 0.12, vol: 0.08 }); AU.tone({ freq: 1150, to: 430, type: 'square', dur: 0.22, vol: 0.05, delay: 0.1 }); },
    bread: function () { for (var i = 0; i < 3; i++) AU.noise({ dur: 0.05, vol: 0.24, filter: 2800 - i * 600, delay: i * 0.045 }); },
    spoon: function () { AU.tone({ freq: 160, to: 640, type: 'triangle', dur: 0.12, vol: 0.2 }); AU.tone({ freq: 640, to: 230, type: 'triangle', dur: 0.26, vol: 0.16, delay: 0.1 }); },
    pillow: function () { AU.noise({ dur: 0.3, vol: 0.22, filter: 900, to: 140 }); },
    fish: function () { AU.noise({ dur: 0.16, vol: 0.28, filter: 1700, to: 200 }); AU.tone({ freq: 330, to: 90, type: 'sine', dur: 0.16, vol: 0.2 }); },
    balloon: function () { AU.tone({ freq: 430, to: 300, type: 'square', dur: 0.14, vol: 0.06 }); AU.tone({ freq: 1250, to: 1600, type: 'sine', dur: 0.12, vol: 0.12, delay: 0.03 }); },
    gold: function () { J.chime(1); AU.tone({ freq: 900, to: 1600, type: 'sine', dur: 0.07, vol: 0.13 }); }
  };
  function hammerSfx(id) { (HSFX[id] || HSFX.squeak)(); }
  var HFX = {
    pillow: ['#ffffff', '#ffd1e8'], fish: ['#4fc3ff', '#a8e6ff', '#ffffff'], bread: ['#e0a458', '#f8d898'],
    chicken: ['#ffe14f', '#ffffff'], gold: ['#ffc928', '#fff1a8', '#ffffff'], balloon: ['#ff6fa8', '#4fd8ff', '#ffe14f']
  };
  function float(text, x, y, color, size, vy) {
    if (floats.length > 28) floats.shift();
    floats.push({ text: text, x: x, y: y, color: color || '#fff', size: size || 34, vy: vy || -150, life: 1, vx: (M.random() - 0.5) * 50, rtl: /[؀-ۿ]/.test(text) });
  }
  // One combo popup at a time, by the hammer: it grows with the combo.
  var comboF = null;
  function comboFloat(n) {
    if (comboF && floats.indexOf(comboF) >= 0 && comboF.life > 0.3) { comboF.text = '×' + n; comboF.life = 1; comboF.size = 30 + M.min(30, n * 2); comboF.color = n >= 8 ? '#ff9fd0' : '#ffe14f'; return; }
    float('×' + n, ham.x - 60, ham.y - 90, n >= 8 ? '#ff9fd0' : '#ffe14f', 30 + M.min(30, n * 2), -40);
    comboF = floats[floats.length - 1];
  }
  // Speech bubbles wait for the big banner to leave so they never cover it.
  function bannerUp() { return !!banner && banner.t < banner.max - 0.25; }
  function showBanner(text, color, secs, sub) { banner = { text: text, sub: sub || '', color: color || '#fff', t: 0, max: secs || 1.6 }; }
  function headOf(i) { var h = world.holes[i]; return { x: h.x, y: h.y - h.h * 0.75 }; }
  function siren() { for (var i = 0; i < 4; i++) AU.tone({ freq: i % 2 ? 680 : 960, to: i % 2 ? 960 : 680, type: 'square', dur: 0.16, vol: 0.05, delay: i * 0.17 }); }

  function handle(ev) {
    var p, h;
    switch (ev.type) {
      case 'pop':
        Kit.track.cue();
        h = world.holes[ev.hole];
        if (!ev.free) {
          AU.tone({ freq: 240 + M.random() * 90, to: 520, type: 'sine', dur: 0.06, vol: 0.05 });
          view.puff(h.x, h.y + h.ry * 0.3, 4, world.spec.world === 2 ? '#f2f0fa' : '#fff3dc', h.rx * 0.8);
        }
        if (ev.first && INTROS[ev.kind] && (ev.kind === world.spec.intro)) intro = { hole: ev.hole, id: ev.id, text: INTROS[ev.kind], t: 0 };
        break;
      case 'hop':
        AU.tone({ freq: 500, to: 900, type: 'sine', dur: 0.06, vol: 0.06 });
        h = world.holes[ev.hole];
        view.puff(h.x, h.y + h.ry * 0.6, 4, '#ffffff', h.rx * 0.6);
        break;
      case 'bonk': {
        p = headOf(ev.hole);
        var disco = ev.kind === 'disco';
        if (!ev.extra) {
          hammerSfx(hammerId());
          J.impact(0.3 + M.min(0.5, ev.combo * 0.04));
          J.streak(M.min(13, ev.combo));
          Kit.track.hit();
          view.burst(p.x - 26, p.y - 14, CHEERS[ev.combo % CHEERS.length], disco ? '#ffd23f' : ev.frenzy ? '#ff9fd0' : '#ffe14f', disco);
          if (ev.combo >= 3) comboFloat(ev.combo);
          comboPop = 1;
          shake.add(3 + M.min(7, ev.combo * 0.4) + (ev.frenzy ? 4 : 0));
        } else J.pop(0.4);
        float('+' + ev.pts, p.x + 58, p.y - 52, disco ? '#ffd23f' : ev.pts > 1 ? '#7dffb0' : '#ffffff', disco ? 60 : 42 + (ev.pts > 1 ? 6 : 0));
        if (disco) { J.coin(5); J.chime(2); shake.add(9); }
        fx.burst(p.x, p.y, { count: disco ? 34 : 14, colors: disco ? ['#ffd23f', '#fff1a8', '#ffffff', '#ff5fa2'] : (HFX[hammerId()] || ['#ffe14f', '#ffffff', '#ff9f2e']), speed: disco ? 460 : 320, life: 0.6, size: 9 });
        if (hammerId() === 'pillow' && !calm()) for (var f = 0; f < 3; f++) view.fly(p.x, p.y, f - 1, 'feather');
        firstBonk();
        break;
      }
      case 'clank':
        p = headOf(ev.hole);
        if (!ev.extra) { Kit.track.hit(); J.streak(M.min(13, ev.combo)); }
        AU.tone({ freq: 1900, to: 1750, type: 'triangle', dur: 0.14, vol: 0.14 }); AU.tone({ freq: 2650, type: 'square', dur: 0.05, vol: 0.04 });
        J.impact(0.2);
        if (!calm()) view.fly(p.x, p.y - 10, ham.x < p.x ? 1 : -1, 'helmet');
        view.burst(p.x - 26, p.y - 14, 'تِنك!', '#c9e6ff', false);
        float('+' + ev.pts, p.x + 58, p.y - 52, '#ffffff', 40);
        shake.add(3);
        firstBonk();
        break;
      case 'ouch':
        p = headOf(ev.hole);
        J.error(); AU.tone({ freq: 720, to: 340, type: 'sine', dur: 0.38, vol: 0.14, delay: 0.05 });
        Kit.track.miss();
        view.burst(p.x - 26, p.y - 14, 'آخ!', '#ffb3d1', true);
        if (ev.lost) float('-' + ev.lost, p.x + 58, p.y - 52, '#ff6b6b', 48);
        shake.add(8); flash = 0.5;
        say('لا تضرب الأرنب!');
        break;
      case 'whiff':
        Kit.track.miss();
        J.whoosh(0.8); J.land(0.15);
        view.puff(ham.x, ham.y + 10, 4, world.spec.world === 2 ? '#f2f0fa' : '#fff3dc', 22);
        if (ev.broke) float('أوه!', ham.x, ham.y - 60, '#ffd6e0', 32, -90);
        break;
      case 'frenzy':
        J.levelUp(); siren();
        showBanner('جنون!', '#ff9fd0', 1.6, 'كل الحفر! النقاط \u2066×2\u2069');
        flash = 1; frenzyFlash = 1; shake.add(14);
        fx.burst(640, 360, { count: 80, colors: ['#ff5f7e', '#ffe14f', '#4fd8ff', '#7dffb0', '#b46bff'], speed: 620, life: 1.1, size: 10 });
        Kit.stats.busy();
        say('جنون!');
        break;
      case 'calm':
        J.whoosh(0.3);
        break;
      case 'again': // another bonk on a squashed critter: a squeak, never a miss
        J.pop(0.25);
        break;
      case 'escape':
        if (ev.heart) {
          AU.tone({ freq: 620, to: 190, type: 'triangle', dur: 0.32, vol: 0.18 });
          heartPop = 1; shake.add(5);
          h = world.holes[ev.hole];
          float('-1', h.x, h.y - h.h * 0.5, '#ff6b6b', 40);
        }
        break;
      case 'pie': {
        h = world.holes[ev.hole];
        AU.noise({ dur: 0.3, vol: 0.3, filter: 1500, to: 150 }); AU.tone({ freq: 250, to: 70, type: 'sine', dur: 0.22, vol: 0.22 });
        var sx = 300 + M.random() * 680, sy = 250 + M.random() * 300;
        view.splat(sx, sy);
        float('سبلاط!', sx, sy - 40, '#ffffff', 46, -60);
        shake.add(6);
        break;
      }
      case 'stage':
        if (ev.newWorld) showBanner(BG.WORLDS[ev.world].name, '#ffffff', 1.5, 'أسرع!');
        else float('أسرع!', 640, 200, '#ffe14f', 52, -50);
        J.chime(1);
        break;
      case 'time':
        decide();
        AU.tone({ freq: 1900, to: 2050, type: 'sine', dur: 0.32, vol: 0.14 }); AU.tone({ freq: 1500, type: 'sine', dur: 0.12, vol: 0.12, delay: 0.34 });
        showBanner('انتهى الوقت!', '#ffffff', 1.4);
        Kit.stats.busy();
        break;
      case 'out':
        decide();
        J.fail();
        showBanner('انتهت القلوب!', '#ffb3d1', 1.4);
        Kit.stats.busy();
        break;
      case 'end':
        finish();
        break;
    }
  }
  function firstBonk() {
    if (save.coach) return;
    save.coach = true; hint = -1;
    Kit.stats.tutorial('done');
    persist();
  }
  function doSwing(s) {
    var i = s.hole;
    if (i === -2) i = BG.holeAt(world, s.x, s.y);
    if (s.key) {
      var h = world.holes[i];
      ham.x = h.x; ham.y = h.y - h.h * 0.5; lit = i; litT = 0.2;
      if (!save.keys) save.keys = true;
    }
    ham.sw = 0;
    BG.swing(world, i);
  }

  /* --------------------------------------------------------------- update */
  function update(dt) {
    time += dt;
    if (screen === 'play' && world) {
      if (world.phase === 'play') {
        for (var k = 0; k < world.holes.length; k++) if (Kit.keys.pressed(world.holes[k].code)) swings.push({ hole: k, key: true });
        for (var q = 0; q < swings.length; q++) doSwing(swings[q]);
      }
      swings.length = 0;
      BG.step(world, dt);
      for (var i = 0; i < world.ev.length; i++) handle(world.ev[i]);
      world.ev.length = 0;
      if (screen !== 'play') { Kit.keys.endFrame(); return; } // the round just ended
      tickHud(dt);
      dirty = true;
    } else if (screen === 'title' && demo && !calm()) {
      stepDemo(dt);
      dirty = true;
    } else if (screen === 'result') {
      resultT += dt;
      while (resultSounds < resultStars && resultT > 0.32 + resultSounds * 0.28) { resultSounds++; J.star(resultSounds); }
      if (resultT < 1.6) dirty = true;
    }
    if (screen === 'play' || screen === 'title' || (screen === 'result' && resultT < 1.6)) {
      for (var f = floats.length - 1; f >= 0; f--) {
        var p = floats[f];
        p.life -= dt * 1.15; p.y += p.vy * dt; p.x += p.vx * dt; p.vy *= 0.96;
        if (p.life <= 0) floats.splice(f, 1);
      }
      if (banner) { banner.t += dt; if (banner.t > banner.max) banner = null; }
      flash = M.max(0, flash - dt * 2.5);
      fx.update(dt); shake.update(dt); view.update(dt);
      ham.sw += dt; demoHam.sw += dt;
      litT = M.max(0, litT - dt);
      for (var s = 0; s < 3; s++) starPop[s] = M.max(0, starPop[s] - dt * 2.5);
      heartPop = M.max(0, heartPop - dt * 2); comboPop = M.max(0, comboPop - dt * 4); frenzyFlash = M.max(0, frenzyFlash - dt);
    }
    Kit.keys.endFrame();
  }
  function tickHud(dt) {
    var w = world, sp = w.spec;
    ham.giant += ((w.frenzy > 0 ? 1 : 0) - ham.giant) * M.min(1, dt * 10);
    // the first-time hint: a hand over the first critter until the first bonk
    if (!save.coach) {
      if (hint < 0 || !BG.bonkable(w.holes[hint].c) || BG.KINDS[w.holes[hint].c.kind].friend) {
        hint = -1;
        for (var i = 0; i < w.holes.length; i++) if (BG.bonkable(w.holes[i].c) && !BG.KINDS[w.holes[i].c.kind].friend) { hint = i; break; }
      }
      if (hint >= 0 && !hintShown) { hintShown = true; Kit.stats.tutorial('start'); }
    }
    if (intro) { intro.t += dt; var ic = w.holes[intro.hole].c; if (intro.t > 3 || !ic || ic.id !== intro.id || ic.st === 'hit') intro = null; }
    // stars reached during the round
    var got = BG.stars(sp.goals, w.score);
    while (starsHad < got) { starPop[starsHad] = 1; starsHad++; J.star(starsHad); fx.burst(starX(starsHad - 1), 98, { count: 18, colors: ['#ffd23f', '#ffffff'], speed: 260, life: 0.6 }); }
    if (starsHad > got) starsHad = got;
    // the last five seconds tick
    if (!sp.endless && w.phase === 'play') {
      var left = M.ceil(sp.dur - w.t);
      if (left <= 5 && left > 0 && left !== lastTick) { lastTick = left; AU.tone({ freq: 1250, type: 'triangle', dur: 0.05, vol: 0.09 }); }
    }
    if (w.frenzy > 0 && M.floor(w.t * 2) !== M.floor((w.t - dt) * 2)) Kit.stats.busy();
  }
  // The title's garden plays by itself: no sound, no statistics.
  function stepDemo(dt) {
    BG.step(demo, dt);
    demo.ev.length = 0;
    if (demo.phase !== 'play' || demo.t > 25) { demo = BG.create({ level: 1, d: 0.2, seed: (M.random() * 1e9) >>> 0 }); demo.spec.up = 3; }
    demoHam.wait -= dt;
    if (demoHam.target >= 0) {
      var h = demo.holes[demoHam.target], tx = h.x, ty = h.y - h.h * 0.5;
      demoHam.x += (tx - demoHam.x) * M.min(1, dt * 9); demoHam.y += (ty - demoHam.y) * M.min(1, dt * 9);
      if (M.abs(tx - demoHam.x) < 12 && M.abs(ty - demoHam.y) < 12) {
        if (BG.bonkable(h.c)) { demoHam.sw = 0; BG.swing(demo, demoHam.target); demo.ev.length = 0; view.burst(tx, ty - 40, 'بونك!', '#ffe14f'); fx.burst(tx, ty - 30, { count: 10, colors: ['#ffe14f', '#ffffff'], speed: 280 }); }
        demoHam.target = -1; demoHam.wait = 0.35 + M.random() * 0.5;
      }
    } else if (demoHam.wait <= 0) {
      for (var i = 0; i < demo.holes.length; i++) { var c = demo.holes[i].c; if (c && c.st === 'up' && c.t > 0.5) { demoHam.target = i; break; } }
    }
  }

  /* ------------------------------------------------------------------ HUD */
  function text(str, x, y, size, color, align, rtl) {
    ctx.font = '700 ' + size + 'px Fredoka'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.lineJoin = 'round'; ctx.lineWidth = M.max(4, size * 0.17); ctx.strokeStyle = INK;
    ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y);
    ctx.direction = 'ltr';
  }
  function panel(x, y, w, h, fill) {
    BG.rrect(ctx, x, y, w, h, h / 2); ctx.fillStyle = fill || 'rgba(42,29,78,0.93)'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
  }
  // The star bar fills from right to left (it reads like the Arabic around it).
  var BAR_L = 450, BAR_R = 830;
  function starX(k) { var g = world.spec.goals; return BAR_R - (BAR_R - BAR_L) * g[k] / g[2]; }
  function drawHud() {
    var w = world, sp = w.spec;
    // score and the star bar
    panel(410, 10, 460, 112);
    var sc = 1 + comboPop * 0.06;
    ctx.save(); ctx.translate(640, 46); ctx.scale(sc, sc);
    text(Kit.fmt(w.score), 0, 0, 54, w.frenzy > 0 ? '#ff9fd0' : '#ffffff');
    ctx.restore();
    var f = M.min(1, w.score / sp.goals[2]), by = 96;
    BG.rrect(ctx, BAR_L - 10, by - 11, BAR_R - BAR_L + 20, 22, 11); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
    if (f > 0) { var fw = M.max(22, (BAR_R - BAR_L + 20) * f); BG.rrect(ctx, BAR_R + 10 - fw, by - 11, fw, 22, 11); ctx.fillStyle = '#ffd23f'; ctx.fill(); }
    for (var k = 0; k < 3; k++) {
      var on = w.score >= sp.goals[k], pop = 1 + starPop[k] * 0.6;
      BG.star(ctx, starX(k), by, (k === 2 ? 21 : 17) * pop, on ? '#ffd23f' : '#d9d3ec', 0);
    }
    // the level
    panel(94, 18, 196, 58);
    text(level ? 'المرحلة ' + level : 'بلا نهاية', 192, 48, 28, '#ffffff', 'center', true);
    // time left, or hearts in the endless garden
    if (!sp.endless) {
      var left = M.max(0, sp.dur - w.t), low = left <= 5.5 && w.phase === 'play';
      var cx = 1100, cy = 52, r = 40, pul = low && !calm() ? 1 + 0.08 * M.abs(M.sin(w.t * M.PI * 2)) : 1;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(pul, pul);
      BG.blob(ctx, 0, 0, r + 4, r + 4); ctx.fillStyle = '#ffffff'; ctx.fill();
      BG.blob(ctx, 0, 0, r, r); ctx.fillStyle = low ? '#ff6b6b' : 'rgba(42,29,78,0.85)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r - 5, -M.PI / 2, -M.PI / 2 + M.PI * 2 * (left / sp.dur)); ctx.closePath();
      ctx.fillStyle = low ? '#ffb3b3' : '#7cd651'; ctx.fill();
      text(String(M.ceil(left)), 0, 2, 36, '#ffffff');
      ctx.restore();
    } else {
      panel(1006, 18, 184, 64);
      for (var hI = 0; hI < BG.HEARTS; hI++) {
        var full = hI < w.hearts, hp = hI === w.hearts && heartPop > 0 ? 1 + heartPop * 0.5 : 1;
        BG.heart(ctx, 1040 + hI * 58, 50, 26 * hp, full ? '#ff4f6d' : 'rgba(255,255,255,0.35)');
      }
    }
    drawCombo(w);
  }
  // The combo jar on the left: ten bonks in a row fill it and start the frenzy.
  var JAR = ['#ff5f7e', '#ffa53d', '#ffe14f', '#7dffb0', '#4fd8ff', '#b46bff'], RIM = ['#ff5f7e', '#ffe14f', '#4fd8ff', '#7dffb0', '#b46bff'];
  function drawCombo(w) {
    var x = 26, top = 196, hgt = 380, fr = w.frenzy > 0;
    panel(x, top, 56, hgt + 16, 'rgba(42,29,78,0.78)');
    var n = fr ? BG.COMBO : M.min(BG.COMBO, w.combo), seg = hgt / BG.COMBO;
    for (var i = 0; i < BG.COMBO; i++) {
      var y = top + 8 + hgt - (i + 1) * seg;
      var col = fr ? JAR[(i + M.floor(time * 12)) % 6] : i < n ? (i >= 7 ? '#ff9fd0' : '#ffd23f') : 'rgba(255,255,255,0.16)';
      if (fr && i >= BG.COMBO * w.frenzy / BG.FRENZY) col = 'rgba(255,255,255,0.16)';
      BG.rrect(ctx, x + 9, y + 3, 38, seg - 6, 8); ctx.fillStyle = col; ctx.fill();
    }
    text(fr ? '×2' : String(w.combo), x + 28, top + hgt + 44, fr ? 34 : 30, fr ? '#ff9fd0' : '#ffffff');
    text('جنون', x + 28, top - 22, 22, fr ? '#ff9fd0' : '#ffffff', 'center', true);
  }
  function drawHand(x, y, t) {
    var b = calm() ? 0 : M.sin(t * 7) * 10;
    ctx.save(); ctx.translate(x + 30 + b * 0.5, y + 56 + b); ctx.rotate(-0.45); ctx.scale(0.85, 0.85);
    ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.fillStyle = '#ffffff';
    BG.rrect(ctx, -12, -46, 24, 50, 12); ctx.fill(); ctx.stroke();
    BG.rrect(ctx, -26, -6, 52, 54, 20); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // Speech bubbles sit in a strip under the HUD, above every critter, with a tail down to
  // the critter they mean: they never hide the critter in the hole behind.
  function bubble(str, x, color) {
    var y = 162;
    ctx.font = '700 32px Fredoka'; ctx.direction = 'rtl';
    var tw = ctx.measureText(str).width + 44;
    var bx = M.max(96, M.min(W - tw - 10, x - tw / 2)), tx = M.max(bx + 30, M.min(bx + tw - 30, x));
    panel(bx, y - 30, tw, 60, color);
    ctx.beginPath(); ctx.moveTo(tx - 15, y + 26); ctx.lineTo(tx, y + 46); ctx.lineTo(tx + 15, y + 26);
    ctx.fill(); ctx.stroke();
    text(str, bx + tw / 2, y + 1, 32, '#ffffff', 'center', true);
  }
  function drawHammerAt(hs, id, scale) {
    var k = hs.sw, lift = k < 0.05 ? 1 - k / 0.05 : k < 0.11 ? 0 : k < 0.26 ? (k - 0.11) / 0.15 : 1;
    var squash = k >= 0.05 && k < 0.16 ? 1 - (k - 0.05) / 0.11 : 0;
    BG.blob(ctx, hs.x, hs.y + 6 * scale, 26 * scale, 9 * scale); ctx.fillStyle = 'rgba(42,29,78,0.22)'; ctx.fill();
    BG.drawHammer(ctx, id, hs.x, hs.y, scale, calm() ? (k < 0.12 ? 0 : 1) : lift, squash, time);
  }

  /* --------------------------------------------------------------- render */
  var ro = { t: 0, look: null, keys: 0, lit: -1 }; // the view's options, reused every frame
  function render() {
    if (!dirty) return; // a still screen keeps its last frame
    var w = screen === 'title' || !world ? demo : world;
    var playing = screen !== 'title' && world;
    ctx.save();
    if (shake.power) ctx.translate(shake.x, shake.y);
    ro.t = time; ro.look = playing ? ham : demoHam; ro.keys = playing ? (save.keys ? 0.95 : 0.4) : 0; ro.lit = litT > 0 ? lit : -1;
    view.render(w, ro);
    view.drawFx();
    fx.draw(ctx);
    ctx.restore();
    if (playing && world.frenzy > 0) {
      // the frenzy: a rainbow frame
      ctx.lineWidth = 16; ctx.strokeStyle = RIM[M.floor(time * 10) % 5];
      ctx.globalAlpha = calm() ? 0.6 : 0.5 + 0.3 * M.sin(time * 20); ctx.strokeRect(8, 8, W - 16, H - 16); ctx.globalAlpha = 1;
    }
    if (flash > 0) { ctx.globalAlpha = flash * 0.45; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (playing) {
      if (hint >= 0 && !save.coach) {
        var hh = world.holes[hint];
        drawHand(hh.x + 10, hh.y - hh.h * 0.3, time);
        if (!bannerUp()) bubble('انقر عليه!', hh.x, 'rgba(255,95,126,0.95)');
      } else if (intro && !bannerUp()) bubble(intro.text, world.holes[intro.hole].x, intro.text === INTROS.bunny ? 'rgba(255,79,109,0.96)' : 'rgba(42,29,78,0.9)');
      drawHammerAt(ham, hammerId(), 1 + 0.45 * ham.giant);
    } else if (screen === 'title') drawHammerAt(demoHam, hammerId(), 1);
    // the comic bursts over the hammer, so its head never hides the word
    ctx.save();
    if (shake.power) ctx.translate(shake.x, shake.y);
    view.drawBursts();
    ctx.restore();
    if (playing) { view.drawSplats(); drawHud(); }
    for (var i = 0; i < floats.length; i++) {
      var p = floats[i];
      ctx.globalAlpha = M.max(0, M.min(1, p.life * 1.6));
      text(p.text, p.x, p.y, p.size, p.color, 'center', p.rtl);
    }
    ctx.globalAlpha = 1;
    if (banner && playing) {
      var k = banner.t / banner.max, s = calm() ? 1 : k < 0.15 ? 0.4 + k / 0.15 * 0.7 : k < 0.25 ? 1.1 - (k - 0.15) : 1;
      ctx.globalAlpha = k > 0.8 ? M.max(0, (1 - k) / 0.2) : 1;
      ctx.save(); ctx.translate(640, 250); ctx.scale(s, s);
      text(banner.text, 0, 0, 92, banner.color, 'center', true);
      if (banner.sub) text(banner.sub, 0, 72, 36, '#ffffff', 'center', true);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    dirty = false;
  }

  /* ----------------------------------------------------- test and debug hook */
  var r3 = function (v) { return M.round(v * 1000) / 1000; };
  function snapshot() {
    var w = world;
    return {
      screen: screen, t: w ? r3(w.t) : 0, score: w ? w.score : 0, swings: w ? w.swings : 0, up: w ? w.up : 0,
      level: w ? level : BG.next(save), combo: w ? w.combo : 0, bonks: w ? w.bonks : 0, whiffs: w ? w.whiffs : 0,
      frenzy: w ? r3(w.frenzy) : 0, holes: w ? w.holes.length : 0, hearts: w ? w.hearts : 0, phase: w ? w.phase : '',
      ouches: w ? w.ouches : 0, frenzies: w ? w.frenzies : 0, stars: w ? BG.stars(w.spec.goals, w.score) : 0,
      totalStars: BG.totalStars(save), hammer: BG.HAMMERS[save.hammer].id, coach: save.coach, hint: hint, calm: calm()
    };
  }

  /* ----------------------------------------------------------------- init */
  Kit.muteButton();
  Kit.lifecycle({ pause: pause, reset: function () { swings.length = 0; } });
  Kit.motion.onChange(function (r) { if (view) view.calm = r; dirty = true; });
  window.addEventListener('pageshow', function () { dirty = true; });
  window.addEventListener('pagehide', function () { persist(); });
  canvas.addEventListener('contextrestored', function () { if (view) view.resize(); dirty = true; render(); });
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'ب').then(function () { dirty = true; render(); }, function () { /* fallback fonts */ });
  }
  var loop = null;
  try {
    view = BG.createView(canvas, ctx);
    view.calm = calm();
    demo = BG.create({ level: 1, d: 0.2, seed: 11 });
    demo.spec.up = 3;
    for (var warm = 0; warm < 90; warm++) BG.step(demo, 1 / 60);
    demo.ev.length = 0;
    buildLevels();
    buildHammers();
    refreshTitle();
    setScreen('title');
    window.__game = {
      get state() { return snapshot(); },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get world() { return world; },
      get ham() { return { x: ham.x, y: ham.y }; },
      point: function (x, y) { var r = canvas.getBoundingClientRect(); return { x: r.left + x * fit.scale, y: r.top + y * fit.scale }; },
      // where the critter of hole i stands, in page pixels (for tests)
      hole: function (i) { var h = world.holes[i]; return this.point(h.x, h.y - h.h * 0.5); }
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
