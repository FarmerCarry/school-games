/* Sandwich Tower (برج السندويش): screens, input, saves, sounds, the HUD and play
 * statistics. engine.js runs the tower; art.js draws it. This is the UI layer: it reads
 * Kit.dda at the start of every try (slide speed and how wide a perfect is) and reports
 * each try back to it, and it reports every try as a round (Kit.stats).
 */
(function () {
  'use strict';
  var W = 1280, H = 720, M = Math;
  var J = Kit.juice, AU = Kit.audio;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ui = $('ui');
  var calm = function () { return Kit.motion.reduced(); };
  var dirty = true;
  var fit = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: function (v) {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    dirty = true;
  } });
  var ctx = fit.ctx;
  var INK = ST.INK;

  /* ---------------------------------------------------------------- save */
  var store = Kit.store('sandwich-tower');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = ST.loadSave(store.get('save', null));
  function persist() {
    saveTimer = 0;
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  // How fast pieces slide and how wide a perfect is follow how the tries go on this PC.
  var dda = Kit.dda('sandwich-tower', { id: 'main', target: 0.72 });

  /* --------------------------------------------------------------- state */
  var screen = 'title', world = null, demo = null, time = 0, saveTimer = 0;
  var floats = [], banner = null, debris = [], fx = Kit.particles(), shake = Kit.shake();
  var sway = [0, 0], swayV = [0, 0], pop = [0, 0], heartPop = [0, 0], idle = 0, hint = false, hinted = false;
  var clicks = [], result = null, resultT = 0, starsShown = 0, flash = 0, mode = 'levels', level = 1;
  var demoAim = 0, view = null;
  var WIN_WORDS = ['رائع!', 'لذيذ!', 'يا سلام!', 'نام نام!'];
  var PERFECT_WORDS = ['مثالي!', 'بالضبط!', 'واو!', 'خارق!'];
  var MILESTONES = ['فوق السطح!', 'بين الغيوم!', 'في الفضاء!', 'مجرّة الحلوى!', 'إلى القمر!'];
  var SCREENS = { title: 'scrTitle', pause: 'scrPause', result: 'scrResult', levels: 'scrLevels', eaters: 'scrEaters' };

  function setScreen(name) {
    screen = name;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    clicks.length = 0;
    Kit.keys.reset();
    dirty = true;
    if (name === 'play' || name === 'title') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function eaterId() { return ST.EATERS[save.eater].id; }
  function themeOf(w) { return w.mode === 'levels' ? ST.WORLDS[ST.worldOf(w.level)].id : w.mode === 'duo' ? 'canteen' : 'canteen'; }

  /* ------------------------------------------------------------ the title */
  function refreshTitle() {
    var next = ST.nextLevel(save);
    $('titleLevel').querySelector('b').textContent = next ? String(next) : '★';
    $('titleStars').querySelector('b').textContent = String(ST.totalStars(save));
    $('eatersNew').hidden = save.seen >= ST.eatersOpen(save);
  }
  function toTitle() {
    if (world) { Kit.stats.end('quit'); world = null; }
    persist();
    refreshTitle();
    setScreen('title');
  }

  /* --------------------------------------------------------------- rounds */
  function roundId() { return mode === 'levels' ? 'L' + level : mode; }
  function startRound(m, lv) {
    mode = m; level = lv || 1;
    var o = { mode: mode, level: level, seed: (M.random() * 4294967295) >>> 0 };
    if (mode !== 'duo') { o.speedMul = dda.value(0.85, 1.2); o.tol = dda.value(18, 6); }
    else { o.speedMul = 1; o.tol = 10; }
    world = ST.create(o);
    floats.length = 0; debris.length = 0; banner = null; fx.clear(); clicks.length = 0;
    sway[0] = sway[1] = swayV[0] = swayV[1] = 0; pop[0] = pop[1] = 1; idle = 0; result = null; flash = 0;
    Kit.stats.round(roundId());
    if (mode !== 'duo') Kit.track.tier(dda.tier);
    hint = mode === 'levels' && !save.coach;
    if (hint && !hinted) { hinted = true; Kit.stats.tutorial('start'); }
    setScreen('play');
    if (mode === 'levels') showBanner('المرحلة ' + level, '#fff', 1.5, ST.WORLDS[ST.worldOf(level)].name);
    else if (mode === 'endless') showBanner('إلى القمر!', '#ffe14f', 1.5, 'الأفضل: ' + save.endless);
    else showBanner('من يصل إلى ' + ST.DUO_GOAL + ' أولًا؟', '#fff', 1.8);
  }
  function play() {
    J.select();
    var next = ST.nextLevel(save);
    if (next) startRound('levels', next); else startRound('endless');
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
    if (!world) { play(); return; }
    J.select();
    Kit.stats.end('quit');
    startRound(mode, level);
  }

  /* --------------------------------------------------------------- result */
  // The outcome is saved, ended and reported the moment it is decided (the 'goal' or 'lose'
  // event), not when the chomp is over: Home, Restart or a pause during the celebration keep it.
  function decide() {
    var w = world, t = w.towers[0];
    if (result) return;
    result = ST.record(save, w);
    result.won = w.won; result.mode = w.mode;
    if (w.mode === 'levels') {
      Kit.stats.end(w.won ? 'win' : 'lose', t.score);
      dda.result(w.won ? 0.5 + 0.5 * M.min(1, t.perfects / ST.starNeed(w.spec.goal)[1]) : 0);
    } else if (w.mode === 'endless') {
      Kit.stats.end('end', t.height);
      dda.result(M.min(1, t.height / 30));
    } else Kit.stats.end('end');
    persist();
  }
  function finishRound() {
    decide();
    var e = result.eaters;
    if (e.length) save.eater = e[e.length - 1]; // the new eater is worn from its reveal on
    persist();
    showResult(world, world.towers[0], result);
  }
  function showResult(w, t, rec) {
    var title = $('resTitle'), sub = $('resSub');
    var stars = $('resStars').children;
    for (var i = 0; i < 3; i++) { stars[i].classList.remove('on'); stars[i].querySelector('use').setAttribute('href', '#i-star0'); }
    $('resStars').hidden = w.mode !== 'levels' || !w.won;
    $('resBest').hidden = true;
    starsShown = 0; resultT = 0;
    if (w.mode === 'duo') {
      title.textContent = 'فاز اللاعب ' + (w.winner + 1) + '!';
      title.style.color = w.winner ? '#2f6fd0' : '#ff6a2e';
      var wt = w.towers[w.winner];
      sub.textContent = wt.height >= ST.DUO_GOAL ? 'وصل إلى القمة أولًا!' : 'صمد حتى النهاية!';
      $('resScore').hidden = $('resPerf').hidden = false;
      // RTL rows put the first chip on the right, like player 2's half of the screen.
      $('resScore').querySelector('small').textContent = 'اللاعب 2';
      $('resScore').querySelector('b').textContent = String(w.towers[1].height);
      $('resPerf').querySelector('small').textContent = 'اللاعب 1';
      $('resPerf').querySelector('b').textContent = String(w.towers[0].height);
    } else {
      $('resScore').hidden = $('resPerf').hidden = false;
      title.style.color = '';
      if (w.mode === 'endless') {
        title.textContent = 'وصلت إلى ' + t.height + '!';
        sub.textContent = rec.newBest ? 'أعلى برج بنيته!' : 'الأفضل: ' + save.endless;
        $('resScore').querySelector('small').textContent = 'الارتفاع';
        $('resScore').querySelector('b').textContent = String(t.height);
      } else {
        title.textContent = w.won ? WIN_WORDS[(w.level + t.perfects) % WIN_WORDS.length] : 'أوبس!';
        sub.textContent = w.won ? 'المرحلة ' + w.level : 'نفدت القلوب. جرّب مرة أخرى!';
        $('resScore').querySelector('small').textContent = 'النقاط';
        $('resScore').querySelector('b').textContent = String(t.score);
      }
      $('resPerf').querySelector('small').textContent = 'مثالي';
      $('resPerf').querySelector('b').textContent = String(t.perfects);
    }
    var face = $('resEater').getContext('2d');
    face.setTransform(1, 0, 0, 1, 0, 0); face.clearRect(0, 0, 240, 220);
    var fed = w.won || w.mode !== 'levels' && t.height > 0;
    ST.drawEater(face, eaterId(), 120, 124, 80, { open: fed ? 0 : 0.7, t: 0.4, happy: fed, look: { x: 0.3, y: 0.3 } });
    var un = $('resUnlock');
    un.hidden = !rec.eaters.length;
    $('resEater').hidden = !un.hidden; // the unlock box shows this same (new) eater
    if (rec.eaters.length) {
      var e = rec.eaters[rec.eaters.length - 1];
      un.querySelector('b').textContent = ST.EATERS[e].name;
      paintEater(un.querySelector('canvas'), ST.EATERS[e].id, 200, 180);
    }
    var next = $('btnNext');
    next.hidden = !(w.mode === 'levels' && w.won);
    next.setAttribute('aria-label', w.level >= ST.COUNT ? 'إلى القمر' : 'المرحلة التالية');
    setScreen('result');
    if (!w.won && w.mode === 'levels') J.fail();
    say(title.textContent);
  }
  // Stars pop in one by one, then the new-best badge (one-shot cues, all within 2 s).
  function stepResult(dt) {
    resultT += dt;
    if (!result) return;
    if (result.mode === 'levels' && result.won && starsShown < result.stars && resultT > 0.3 + starsShown * 0.32) {
      var s = $('resStars').children[starsShown];
      s.querySelector('use').setAttribute('href', '#i-star');
      s.classList.add('on');
      starsShown++;
      J.star(starsShown);
      Kit.stats.busy();
    }
    var at = 0.4 + (result.mode === 'levels' ? result.stars * 0.32 : 0);
    if (result.newBest && resultT > at && $('resBest').hidden) { $('resBest').hidden = false; J.chime(3); }
    if (result.eaters.length && resultT > at + 0.3 && !result.unlockCue) { result.unlockCue = true; J.levelUp(); }
  }
  function next() {
    if (!result) return;
    if (mode === 'levels' && result.won) { J.select(); if (level < ST.COUNT) startRound('levels', level + 1); else startRound('endless'); }
    else again();
  }
  function again() { J.select(); startRound(mode, level); }

  /* ------------------------------------------------------------- levels */
  function star(on) { return '<svg aria-hidden="true"><use href="#i-star' + (on ? '' : '0') + '"/></svg>'; }
  function buildLevels() {
    var box = $('worlds');
    box.textContent = '';
    for (var wi = 0; wi < ST.WORLDS.length; wi++) {
      var row = document.createElement('div');
      row.className = 'world w' + wi;
      row.innerHTML = '<h3>' + ST.WORLDS[wi].name + '</h3>';
      for (var j = 0; j < 4; j++) {
        var n = wi * 4 + j + 1, b = document.createElement('button');
        b.type = 'button'; b.className = 'lvl'; b.dataset.level = String(n);
        b.addEventListener('click', pickLevel);
        row.appendChild(b);
      }
      box.appendChild(row);
    }
  }
  function refreshLevels() {
    $('levelsStars').querySelector('b').textContent = String(ST.totalStars(save));
    var next = ST.nextLevel(save);
    Array.prototype.forEach.call(document.querySelectorAll('.lvl'), function (b) {
      var n = +b.dataset.level, open = ST.levelOpen(save, n), s = save.stars[n - 1];
      b.classList.toggle('locked', !open);
      b.classList.toggle('next', open && n === next);
      b.innerHTML = open ? '<b>' + n + '</b><span class="ls">' + star(s > 0) + star(s > 1) + star(s > 2) + '</span>' : '<svg class="lk" aria-hidden="true"><use href="#i-lock"/></svg>';
      b.setAttribute('aria-label', 'المرحلة ' + n + (open ? '، ' + s + ' نجوم' : '، مقفلة'));
    });
  }
  function pickLevel(e) {
    e.stopPropagation();
    var b = e.currentTarget, n = +b.dataset.level;
    if (!ST.levelOpen(save, n)) { J.error(); wiggle(b); return; }
    J.select();
    startRound('levels', n);
  }
  function openLevels() { J.select(); refreshLevels(); setScreen('levels'); }
  function wiggle(el) { el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); }

  /* ------------------------------------------------------------- eaters */
  var eaterBtns = [];
  function paintEater(c, id, w, h) {
    var g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
    ST.drawEater(g, id, w / 2, h * 0.56, h * 0.36, { open: 0.45, t: 0.3, look: { x: 0, y: 0.4 } });
  }
  function buildEaters() {
    var box = $('eaters');
    ST.EATERS.forEach(function (e, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'eater';
      b.innerHTML = '<canvas width="200" height="180"></canvas><b>' + e.name + '</b><span></span>';
      b.addEventListener('click', function (ev) { ev.stopPropagation(); pickEater(i, b); });
      box.appendChild(b);
      eaterBtns.push(b);
    });
    paintEaters();
  }
  function paintEaters() { eaterBtns.forEach(function (b, i) { paintEater(b.querySelector('canvas'), ST.EATERS[i].id, 200, 180); }); }
  function refreshEaters() {
    $('eatersStars').querySelector('b').textContent = String(ST.totalStars(save));
    eaterBtns.forEach(function (b, i) {
      var open = ST.eaterOpen(save, i);
      b.classList.toggle('on', save.eater === i);
      b.classList.toggle('locked', !open);
      b.querySelector('span').innerHTML = open ? (save.eater === i ? '✔' : '') : star(true) + ST.EATERS[i].need;
      b.setAttribute('aria-label', ST.EATERS[i].name + (open ? '' : '، ' + ST.EATERS[i].need + ' نجمة'));
      b.setAttribute('aria-pressed', String(save.eater === i));
    });
  }
  function pickEater(i, b) {
    if (!ST.eaterOpen(save, i)) { J.error(); wiggle(b); return; }
    if (save.eater !== i) { save.eater = i; chomp(0); J.pop(0.6); persist(); } else J.tap();
    refreshEaters();
  }
  function openEaters() {
    J.select();
    save.seen = ST.eatersOpen(save);
    persist();
    refreshEaters();
    setScreen('eaters');
  }
  function closeList() { J.back(); refreshTitle(); setScreen('title'); }

  /* ---------------------------------------------------------------- input */
  function on(el, fn) { el.addEventListener('click', function (e) { e.stopPropagation(); fn(); if (e.detail > 0) el.blur(); }); }
  on($('btnPlay'), play);
  on($('btnLevels'), openLevels);
  on($('btnEndless'), function () { J.select(); startRound('endless'); });
  on($('btnDuo'), function () { J.select(); startRound('duo'); });
  on($('btnEaters'), openEaters);
  on($('btnPause'), pause);
  on($('btnResume'), resume);
  on($('btnHome'), function () { J.back(); toTitle(); });
  on($('btnRestart'), restart);
  on($('btnNext'), next);
  on($('btnAgain'), again);
  on($('btnMenu'), function () { J.back(); world = null; refreshTitle(); setScreen('title'); });
  on($('levelsBack'), closeList);
  on($('eatersBack'), closeList);
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
      if (resultT < 0.6) return; // a drop still held from the last piece must not skip the result
      if (c === 'Enter' || c === 'Space' || c === 'NumpadEnter') { e.preventDefault(); next(); }
      else if (c === 'KeyR') again();
      else if (c === 'Escape') { J.back(); world = null; refreshTitle(); setScreen('title'); }
      return;
    }
    if ((screen === 'levels' || screen === 'eaters') && c === 'Escape') { e.preventDefault(); closeList(); return; }
    if (screen === 'title' && (c === 'Enter' || c === 'Space')) { e.preventDefault(); play(); }
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (screen !== 'play' || e.button !== 0 || !world) return;
    var x = fit.toLogical(e.clientX, e.clientY).x;
    if (clicks.length < 4) clicks.push(world.mode === 'duo' ? (x < W / 2 ? 0 : 1) : 0);
  });
  var KEYS1 = ['Space', 'Enter', 'NumpadEnter', 'ArrowDown', 'KeyS'], KEYS_P1 = ['KeyS', 'Space'], KEYS_P2 = ['ArrowDown', 'Enter', 'NumpadEnter'];
  function readInput() {
    var k = Kit.keys, w = world, want = [false, false];
    if (w.mode === 'duo') { want[0] = k.anyPressed(KEYS_P1); want[1] = k.anyPressed(KEYS_P2); }
    else want[0] = k.anyPressed(KEYS1);
    for (var i = 0; i < clicks.length; i++) want[clicks[i]] = true;
    clicks.length = 0;
    if (w.phase === 'eat' && (want[0] || want[1])) w.eatFast = 3; // a press hurries the chomping
    for (var j = 0; j < w.towers.length; j++) if (want[j] && ST.drop(w, j)) idle = 0;
  }

  /* -------------------------------------------------------- sounds and fx */
  var THUD = { bread: 150, bun: 130, lettuce: 260, tomato: 220, cheese: 300, cucumber: 280, egg: 240, patty: 110, falafel: 170, pickles: 320 };
  function thwump(kind, power) {
    var f = THUD[kind] || 190;
    AU.tone({ freq: f * 1.7, to: f * 0.55, type: 'sine', dur: 0.16, vol: 0.28 * power });
    AU.noise({ dur: 0.07, vol: 0.1 * power, filter: 900, to: 200 });
  }
  var SILLY = {
    cat: function () { AU.noise({ dur: 0.5, vol: 0.16, filter: 420, to: 160 }); AU.tone({ freq: 92, to: 70, type: 'sawtooth', dur: 0.45, vol: 0.06 }); AU.tone({ freq: 700, to: 1050, type: 'triangle', dur: 0.12, vol: 0.1, delay: 0.42 }); AU.tone({ freq: 1050, to: 600, type: 'triangle', dur: 0.2, vol: 0.1, delay: 0.53 }); },
    duck: function () { AU.tone({ freq: 560, to: 360, type: 'sawtooth', dur: 0.1, vol: 0.09 }); AU.tone({ freq: 540, to: 340, type: 'sawtooth', dur: 0.12, vol: 0.09, delay: 0.13 }); },
    sneaker: function () { AU.tone({ freq: 1500, to: 2200, type: 'sine', dur: 0.07, vol: 0.12 }); AU.tone({ freq: 2200, to: 1500, type: 'sine', dur: 0.09, vol: 0.12, delay: 0.07 }); },
    pillow: function () { AU.noise({ dur: 0.35, vol: 0.22, filter: 700, to: 120 }); },
    donut: function () { AU.tone({ freq: 150, to: 560, type: 'sine', dur: 0.12, vol: 0.2 }); AU.tone({ freq: 560, to: 240, type: 'sine', dur: 0.24, vol: 0.16, delay: 0.11 }); },
    melon: function () { AU.noise({ dur: 0.2, vol: 0.24, filter: 2400, to: 300 }); AU.tone({ freq: 220, to: 90, type: 'sine', dur: 0.16, vol: 0.2 }); },
    pizza: function () { AU.noise({ dur: 0.4, vol: 0.07, filter: 7000, to: 3500 }); AU.tone({ freq: 320, to: 200, type: 'triangle', dur: 0.1, vol: 0.12 }); },
    gamepad: function () { AU.tone({ freq: 880, type: 'square', dur: 0.07, vol: 0.06 }); AU.tone({ freq: 660, type: 'square', dur: 0.07, vol: 0.06, delay: 0.08 }); AU.tone({ freq: 1320, type: 'square', dur: 0.1, vol: 0.06, delay: 0.16 }); },
    toaster: function () { AU.tone({ freq: 1568, type: 'triangle', dur: 0.6, vol: 0.13 }); AU.tone({ freq: 2093, type: 'sine', dur: 0.4, vol: 0.05, delay: 0.01 }); },
    cactus: function () { AU.tone({ freq: 330, to: 160, type: 'sawtooth', dur: 0.32, vol: 0.06 }); AU.tone({ freq: 180, to: 520, type: 'sine', dur: 0.12, vol: 0.14 }); }
  };
  var SILLY_WORDS = { cat: 'خرررر...', duck: 'كواك!', sneaker: 'سكويك!', pillow: 'بوف!', donut: 'بوينغ!', melon: 'سبلوش!', pizza: 'ششش!', gamepad: 'بيب بوب!', toaster: 'دينغ!', cactus: 'أوتش!' };
  function chomp(bite) {
    AU.noise({ dur: 0.09, vol: 0.3, filter: 1700, to: 380 });
    AU.tone({ freq: 190 + bite * 18, to: 90, type: 'triangle', dur: 0.11, vol: 0.26 });
  }
  function burp() {
    AU.tone({ freq: 118, to: 68, type: 'sawtooth', dur: 0.6, vol: 0.18 });
    AU.tone({ freq: 96, to: 58, type: 'square', dur: 0.55, vol: 0.05, delay: 0.03 });
    AU.noise({ dur: 0.5, vol: 0.12, filter: 500, to: 160 });
  }
  function splat(x) {
    AU.noise({ dur: 0.18, vol: 0.2, filter: 1500, to: 220 });
    AU.tone({ freq: 150, to: 60, type: 'sine', dur: 0.15, vol: 0.18 });
    fx.burst(x, H - 6, { count: 12, colors: ['#ff4b3e', '#ffd23f', '#6fd34e', '#fff'], speed: 320, angle: -M.PI / 2, spread: 2, life: 0.6, size: 9, gravity: 900 });
  }
  var COLORS = { bread: '#ffdf9e', bun: '#ee9a3c', lettuce: '#6fd34e', tomato: '#ff4b3e', cheese: '#ffd23f', cucumber: '#3f9e3a', egg: '#ffc21f', patty: '#8a4a24', falafel: '#b8742f', pickles: '#7bbf3a',
    cat: '#ffa53d', sneaker: '#4f8cff', duck: '#ffd93d', pillow: '#d4c6ff', donut: '#ff7ac8', melon: '#ff5a6e', pizza: '#ffd84f', gamepad: '#7a5cff', toaster: '#cdd8e6', cactus: '#5fc04a' };
  function float(text, x, y, color, size, vy) {
    if (floats.length > 30) floats.shift();
    floats.push({ text: text, x: x, y: y, color: color || '#fff', size: size || 34, vy: vy || -120, life: 1, rtl: /[\u0600-\u06ff]/.test(text) });
  }
  function showBanner(text, color, secs, sub, x, y) { banner = { text: text, sub: sub || '', color: color || '#fff', t: 0, max: secs || 1.6, x: x || 640, y: y || 180 }; }
  function sy(tw, y) { return ST.PLATE_Y - y + tw.cam; }
  function addDebris(e, vy) {
    if (debris.length > 24) debris.shift();
    debris.push({ tower: e.tower, kind: e.kind, x: e.x, y: e.y + e.h / 2, w: e.w, h: e.h, face: e.face, rot: 0,
      vx: e.side * (90 + M.random() * 120), vy: vy, vr: e.side * (2.5 + M.random() * 4) });
  }
  function handle(ev) {
    var w = world, tw = w.towers[ev.tower || 0], duo = w.mode === 'duo';
    switch (ev.type) {
      case 'spawn':
        pop[ev.tower] = 1;
        break;
      case 'drop':
        AU.tone({ freq: 520, to: 300, type: 'sine', dur: 0.08, vol: 0.07 });
        break;
      case 'land': {
        var ly = sy(tw, ev.y + ev.h), power = ev.perfect ? 1 : 0.75;
        thwump(ev.kind, power);
        if (SILLY[ev.kind]) { SILLY[ev.kind](); float(SILLY_WORDS[ev.kind], ev.x + (ev.x > tw.cx ? -1 : 1) * M.min(180, ev.w / 2 + 70), ly - 10, '#fff', 32, -60); }
        swayV[ev.tower] += M.max(-260, M.min(260, ev.d * 2.2)) + (ev.perfect ? 0 : 0);
        fx.burst(ev.x, ly + ev.h * 0.5, { count: ev.perfect ? 10 : 6, colors: [COLORS[ev.kind] || '#fff', '#fff'], speed: 200, life: 0.45, size: 6, gravity: 500 });
        if (ev.perfect) {
          J.streak(ev.combo);
          Kit.track.hit();
          // an LTR isolate keeps the plus before the 3 inside the Arabic (RTL) line, like the plain +1
          float(PERFECT_WORDS[M.min(PERFECT_WORDS.length - 1, (ev.combo - 1) >> 1)] + ' \u2066+3\u2069', ev.x, ly - 24, '#ffe14f', 36 + M.min(18, ev.combo * 3), -140);
          fx.burst(ev.x - ev.w / 2, ly + 6, { count: 8, colors: ['#ffe14f', '#fff'], speed: 260, life: 0.5, size: 7, gravity: 200 });
          fx.burst(ev.x + ev.w / 2, ly + 6, { count: 8, colors: ['#ffe14f', '#fff'], speed: 260, life: 0.5, size: 7, gravity: 200 });
          if (ev.combo >= 3) shake.add(3);
          if (ev.grow) {
            J.chime(2);
            AU.tone({ freq: 400, to: 900, type: 'triangle', dur: 0.3, vol: 0.12, delay: 0.08 });
            float('يكبر!', ev.x, ly - 76, '#7dffb0', 46, -90);
            fx.burst(ev.x, ly + 8, { count: 24, colors: ['#7dffb0', '#ffe14f', '#fff'], speed: 380, life: 0.7, size: 8 });
          }
        } else float('+1', ev.x + (M.random() - 0.5) * 40, ly - 20, '#fff', 34, -130);
        if (hint) { hint = false; save.coach = true; Kit.stats.tutorial('done'); persist(); }
        flash = M.max(flash, ev.perfect ? 0.18 : 0);
        break;
      }
      case 'slice':
        AU.noise({ dur: 0.08, vol: 0.14, filter: 7000, to: 2500 });
        addDebris(ev, 160);
        fx.burst(ev.x - ev.side * ev.w / 2, sy(tw, ev.y + ev.h / 2), { count: 8, colors: [COLORS[ev.kind] || '#fff'], speed: 180, life: 0.5, size: 6 });
        break;
      case 'miss': {
        Kit.track.miss();
        AU.tone({ freq: 1100, to: 220, type: 'sine', dur: 0.45, vol: 0.15 });
        addDebris(ev, -ev.vy * 0.4);
        float('أوبس!', M.max(120, M.min(W - 120, ev.x)), sy(tw, ev.y) - 40, '#ff9aa8', 48, -80);
        if (ev.heart) { J.impact(0.5); shake.add(9); heartPop[ev.tower] = 1; }
        break;
      }
      case 'milestone':
        J.levelUp();
        showBanner(String(ev.height) + '!', '#ffe14f', 1.8, MILESTONES[M.min(MILESTONES.length - 1, ev.height / 25 - 1)]);
        fx.burst(640, 260, { count: 50, colors: ['#ff5fa2', '#ffe14f', '#4fd8ff', '#7dffb0'], speed: 480, life: 1.1 });
        break;
      case 'goal':
        decide();
        if (ev.won) { J.chime(3); if (!duo) showBanner('اكتمل!', '#7dffb0', 1.0); }
        else { J.fail(); showBanner('نفدت القلوب!', '#ff9aa8', 1.2); }
        if (duo) { showBanner('فاز اللاعب ' + (w.winner + 1) + '!', w.winner ? '#4f9bff' : '#ff8a3d', 2.4); J.levelUp(); }
        break;
      case 'bun':
        thwump('bun', 1); J.land(1);
        AU.tone({ freq: 180, to: 520, type: 'sine', dur: 0.14, vol: 0.16, delay: 0.05 });
        fx.burst(ev.x, sy(tw, ev.y), { count: 18, colors: ['#ffdf9e', '#ee9a3c', '#fff'], speed: 300, life: 0.6 });
        shake.add(5);
        break;
      case 'eat':
        J.whoosh(0.8);
        if (!duo) showBanner('نام نام نام!', '#ffe14f', 2, '', tw.tx > 640 ? 250 : 1030, 300);
        break;
      case 'bite': {
        chomp(ev.bite);
        var by = sy(tw, ev.y) - 10;
        float('نام!', ev.x + (ev.bite % 2 ? 270 : -270), by - 30, '#fff', 40 + ev.bite * 2, -110);
        fx.burst(ev.x, by, { count: 26, colors: ['#ffdf9e', '#ee9a3c', '#6fd34e', '#ff4b3e', '#ffd23f'], speed: 420, life: 0.8, size: 9, gravity: 800 });
        shake.add(5);
        break;
      }
      case 'burp':
        burp();
        float('بُرررب!', tw.tx + (tw.tx > 640 ? -390 : 390), sy(tw, 0) - 290, '#b6f28a', 62, -60); // beside the face, not over its eyes
        break;
      case 'lose':
        decide();
        J.fail();
        showBanner('أوبس!', '#ff9aa8', 1.2, 'نفدت القلوب');
        break;
      case 'done':
        finishRound();
        break;
    }
  }

  /* -------------------------------------------------------------- the demo */
  // The title's attract tower: it stacks itself and gets eaten, silently, no statistics.
  var DEMO = { goal: 7, w0: 230, speed: 200, amp: 150, floor: 150, hearts: 0, tolBonus: 8, move: 'slide', feature: 'cat', silly: 0.45, wobble: 0, period: 4, gravity: 2600 };
  var DEMO_HOME = { x: 1110, y: 600 };
  function newDemo() { demo = ST.create({ mode: 'demo', spec: DEMO, cx: 250, seed: (M.random() * 1e9) >>> 0, tol: 6 }); demoAim = 0; }
  function stepDemo(dt) {
    var t = demo.towers[0];
    if (t.phase === 'slide') {
      if (t.cur.t < 0.05) demoAim = M.random() < 0.7 ? 0 : (M.random() - 0.5) * 70;
      if (M.abs(t.cur.x - t.tx - demoAim) < 5 && t.cur.t > 0.3) ST.drop(demo, 0);
    }
    ST.step(demo, dt);
    demo.ev.length = 0;
    if (demo.phase === 'done' && demo.pt > 1.2) newDemo();
  }

  /* --------------------------------------------------------------- update */
  function update(dt) {
    time += dt;
    if (screen === 'play' && world) {
      readInput();
      ST.step(world, dt);
      for (var i = 0; i < world.ev.length && world; i++) handle(world.ev[i]);
      if (world) world.ev.length = 0;
      if (world && (world.phase === 'eat' || world.phase === 'bun' || world.phase === 'bunwait')) Kit.stats.busy();
      idle += dt;
      saveTimer += dt;
      if (saveTimer > 8) persist();
      stepFx(dt);
      dirty = true;
    } else if (screen === 'title' && demo && !calm()) {
      stepDemo(dt);
      stepFx(dt);
      dirty = true;
    } else if (screen === 'result') {
      stepResult(dt);
    }
    Kit.keys.endFrame();
  }
  function stepFx(dt) {
    for (var f = floats.length - 1; f >= 0; f--) {
      var p = floats[f];
      p.life -= dt * 1.1; p.y += p.vy * dt; p.vy *= 0.97;
      if (p.life <= 0) floats.splice(f, 1);
    }
    if (banner) { banner.t += dt; if (banner.t > banner.max) banner = null; }
    var w = world;
    for (var d = debris.length - 1; d >= 0; d--) {
      var b = debris[d], tw = w && w.towers[b.tower];
      b.vy -= 2200 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt;
      if (!tw || sy(tw, b.y) > H + 70) { if (tw && screen === 'play') splat(b.x); debris.splice(d, 1); }
    }
    for (var i = 0; i < 2; i++) {
      // the tower sways like jelly after a landing
      swayV[i] += -sway[i] * 120 * dt; swayV[i] *= M.pow(0.02, dt); sway[i] += swayV[i] * dt;
      if (calm()) sway[i] = swayV[i] = 0;
      pop[i] = M.max(0, pop[i] - dt * 5); heartPop[i] = M.max(0, heartPop[i] - dt * 2);
    }
    flash = M.max(0, flash - dt * 2);
    fx.update(dt); shake.update(dt);
  }

  /* ------------------------------------------------------------------ HUD */
  function text(str, x, y, size, color, align, rtl) {
    ctx.font = '700 ' + size + 'px Fredoka'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.lineJoin = 'round'; ctx.lineWidth = M.max(4, size * 0.16); ctx.strokeStyle = INK;
    ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y);
    ctx.direction = 'ltr';
  }
  function panel(x, y, w, h, fill) {
    ST.rrect(ctx, x, y, w, h, h / 2); ctx.fillStyle = fill || 'rgba(58,34,22,0.82)'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
  }
  function hearts(x, y, n, i, size) {
    for (var k = 0; k < 3; k++) {
      var s = size * (k === n && heartPop[i] > 0 ? 1 + heartPop[i] * 0.6 : 1);
      ST.heart(ctx, x + k * (size * 1.25), y, s, k < n ? '#ff4f6d' : 'rgba(255,255,255,0.35)');
    }
  }
  // The bar fills right to left, like the Arabic reading order (a level's bun goal sits at its left end).
  function progress(cx, y, w, cur, goal, color) {
    var h = 34, x = cx - w / 2, f = M.min(1, cur / goal), fw = M.max(h - 10, (w - 10) * f);
    ST.rrect(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(58,34,22,0.82)'; ctx.fill();
    if (f > 0.02) { ST.rrect(ctx, x + w - 5 - fw, y + 5, fw, h - 10, (h - 10) / 2); ctx.fillStyle = color; ctx.fill(); }
    ST.rrect(ctx, x, y, w, h, h / 2); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
    text(cur + ' / ' + goal, cx, y + h / 2 + 1, 24, '#fff');
  }
  function drawHud() {
    var w = world, t = w.towers[0];
    if (w.mode === 'duo') { drawDuoHud(); return; }
    var sp = w.spec;
    if (w.mode === 'levels') {
      progress(640, 18, 380, M.min(t.height, sp.goal), sp.goal, '#ffe14f');
      ST.drawPiece(ctx, 'bun', 640 - 190 - 36, 54, 52, 26, {});
      text('المرحلة ' + w.level, 640, 76, 24, '#fff', 'center', true);
    } else {
      panel(520, 12, 240, 70);
      text(String(t.height), 600, 48, 46, '#ffe14f');
      text('الارتفاع', 690, 48, 24, '#fff', 'center', true);
      if (save.endless) text('الأفضل ' + save.endless, 640, 98, 22, '#fff', 'center', true);
    }
    panel(1010, 14, 190, 62);
    text(String(t.score), 1060, 46, 36, '#fff');
    text('النقاط', 1145, 46, 22, '#ffe14f', 'center', true);
    if (t.combo >= 2) {
      var pulse = calm() ? 1 : 1 + M.sin(time * 10) * 0.06;
      ctx.save(); ctx.translate(1105, 112); ctx.scale(pulse, pulse);
      panel(-90, -26, 180, 52, 'rgba(255,95,138,0.95)');
      text('×' + t.combo, -44, 1, 32, '#ffe14f');
      text('كومبو', 32, 1, 26, '#fff', 'center', true);
      ctx.restore();
    }
    if (sp.hearts) hearts(112, 46, t.hearts, 0, 34);
  }
  function drawDuoHud() {
    var w = world;
    ctx.fillStyle = INK; ctx.fillRect(637, 0, 6, H);
    for (var i = 0; i < 2; i++) {
      var t = w.towers[i], cx = i * 640 + 320, col = i ? '#4f9bff' : '#ff8a3d';
      panel(cx - 150, 12, 300, 58, i ? 'rgba(47,111,208,0.9)' : 'rgba(224,112,42,0.9)');
      text('اللاعب ' + (i + 1), cx + 62, 41, 28, '#fff', 'center', true);
      text(i ? '↓ / Enter' : 'S / مسافة', cx - 70, 42, 22, '#ffe14f', 'center', !i);
      progress(cx, 80, 260, M.min(t.height, ST.DUO_GOAL), ST.DUO_GOAL, col);
      hearts(cx - 40, 140, t.hearts, i, 28);
      if (t.combo >= 2) text('×' + t.combo, cx + 120, 140, 30, '#ffe14f');
    }
  }
  function drawHint() {
    var t = world.towers[0], c = t.cur;
    if (!c || t.phase !== 'slide') return;
    var cy = sy(t, c.y + c.h), b = calm() ? 0 : M.abs(M.sin(time * 5)) * 16;
    ST.hand(ctx, c.x, cy - 12 - b, 64);
    // the bubble sits beside the hand, on the side with more room
    var right = c.x < W / 2, bx = right ? c.x + 60 + 150 : c.x - 60 - 150, byy = cy - 58 - b;
    panel(bx - 150, byy - 34, 300, 68, 'rgba(255,95,138,0.96)');
    text('انقر أو مسافة!', bx, byy + 2, 34, '#fff', 'center', true);
  }

  /* --------------------------------------------------------------- render */
  function render() {
    if (screen !== 'play' && screen !== 'title' && !dirty) return; // a still menu keeps its last frame
    if (screen === 'title' && calm() && !dirty) return;
    var w = screen === 'title' || !world ? demo : world;
    ctx.save();
    if (shake.power) ctx.translate(shake.x, shake.y);
    if (w) {
      var isDemo = w === demo;
      view.render(w, {
        t: time, theme: isDemo ? 'canteen' : themeOf(w), endless: !isDemo && w.mode === 'endless', eater: eaterId(),
        debris: isDemo ? null : debris, sway: sway, pop: pop, guide: !isDemo && w.mode === 'levels' && w.level <= 2,
        eaterHome: isDemo ? DEMO_HOME : null, eaterScale: isDemo ? 0.72 : w.mode === 'duo' ? 0.72 : 1
      });
      if (isDemo && demo.phase !== 'eat' && demo.phase !== 'bunwait') {
        var dc = demo.towers[0].cur, lx = dc ? M.max(-1, M.min(1, (dc.x - DEMO_HOME.x) / 600)) : -0.6;
        view.peek(eaterId(), DEMO_HOME.x, DEMO_HOME.y, 150, time, { x: lx, y: -0.4 });
      }
    } else { ctx.fillStyle = '#ffe2a8'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    fx.draw(ctx);
    if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.6) + ')'; ctx.fillRect(0, 0, W, H); }
    if (world && screen !== 'title') {
      if (hint || (idle > 7 && world.phase === 'play' && world.mode !== 'duo')) drawHint();
      drawHud();
      drawFloats();
    }
    dirty = false;
  }
  function drawFloats() {
    for (var i = 0; i < floats.length; i++) {
      var p = floats[i];
      ctx.globalAlpha = M.max(0, M.min(1, p.life * 1.6));
      text(p.text, p.x, p.y, p.size, p.color, 'center', p.rtl);
    }
    ctx.globalAlpha = 1;
    if (banner) {
      var k = banner.t / banner.max, s = calm() ? 1 : k < 0.15 ? 0.4 + k / 0.15 * 0.7 : k < 0.25 ? 1.1 - (k - 0.15) : 1;
      ctx.globalAlpha = k > 0.8 ? M.max(0, (1 - k) / 0.2) : 1;
      ctx.save(); ctx.translate(banner.x, banner.y); ctx.scale(s, s);
      text(banner.text, 0, 0, banner.x === 640 ? 84 : 64, banner.color, 'center', /[\u0600-\u06ff]/.test(banner.text));
      if (banner.sub) text(banner.sub, 0, 70, 36, '#fff', 'center', /[\u0600-\u06ff]/.test(banner.sub));
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  /* ----------------------------------------------------- test and debug hook */
  var r3 = function (v) { return M.round(v * 1000) / 1000; };
  function snapshot() {
    var w = world, t = w && w.towers[0], c = t && t.cur, t2 = w && w.towers[1];
    return {
      screen: screen, paused: screen === 'pause', mode: w ? w.mode : '', level: w ? w.level : 0, phase: w ? w.phase : '',
      t: w ? r3(w.t) : 0, x: c ? M.round(c.x) : t ? M.round(t.tx) : 0, drops: t ? t.drops : 0, height: t ? t.height : 0,
      width: t ? M.round(c && t.phase !== 'bun' ? c.w : t.tw) : 0, perfects: t ? t.perfects : 0, hearts: t ? t.hearts : 0,
      combo: t ? t.combo : 0, score: t ? t.score : 0, misses: t ? t.misses : 0, goal: w ? w.spec.goal : 0, won: w ? w.won : false,
      piece: c ? c.kind : '', move: c ? c.move : '', towerX: t ? M.round(t.tx) : 0,
      p2: t2 ? { drops: t2.drops, height: t2.height, hearts: t2.hearts, x: t2.cur ? M.round(t2.cur.x) : M.round(t2.tx) } : null,
      winner: w ? w.winner : -1, hint: hint, stars: ST.totalStars(save), eater: save.eater, next: ST.nextLevel(save),
      floats: floats.length, debris: debris.length, banner: banner ? banner.text : '', calm: calm()
    };
  }

  /* ----------------------------------------------------------------- init */
  Kit.muteButton();
  Kit.lifecycle({ pause: pause, reset: function () { clicks.length = 0; } });
  Kit.motion.onChange(function (r) { if (view) view.calm = r; dirty = true; });
  window.addEventListener('pageshow', function () { dirty = true; });
  window.addEventListener('pagehide', function () { persist(); });
  canvas.addEventListener('contextrestored', function () { dirty = true; render(); });
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'ب').then(function () { dirty = true; render(); }, function () { /* fallback fonts */ });
  }
  var loop = null;
  try {
    view = ST.createView(ctx);
    view.calm = calm();
    newDemo();
    // a calm title still shows a tower: build the demo up a little at once
    for (var s = 0; s < 400 && demo.towers[0].height < 4; s++) stepDemo(1 / 60);
    buildLevels();
    buildEaters();
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
