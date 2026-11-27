/* Cloud Hop (نطّة السحاب): screens, input, saves, the characters, sounds, the HUD and play
 * statistics. engine.js runs the sky; art.js draws it. This is the UI layer: it reads
 * Kit.dda at the start of every try (gaps, widths, how many moving, crumbly and grumpy
 * things) and reports each try back to it, and it reports every try as a round.
 */
(function () {
  'use strict';
  var W = 1280, H = 720, M = Math;
  var J = Kit.juice, AU = Kit.audio;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ui = $('ui');
  var calm = function () { return Kit.motion.reduced(); };
  var dirty = true, view = null;
  var fit = Kit.fit(canvas, W, H, { maxDpr: 1.5, onResize: function (v) {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    if (view) view.setScale(v.scale * v.dpr);
    dirty = true;
  } });
  var ctx = fit.ctx;

  /* ---------------------------------------------------------------- save */
  var store = Kit.store('cloud-hop');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = CH.loadSave(store.get('save', null));
  var saveTimer = 0, unsaved = false;
  function persist() {
    saveTimer = 0;
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    unsaved = false;
    saveStatus.saved();
    return true;
  }
  // Gaps, widths and how many moving, crumbly and grumpy things follow how tries go on this PC.
  var dda = Kit.dda('cloud-hop', { id: 'main', target: 0.72 });

  /* --------------------------------------------------------------- state */
  var screen = 'title', world = null, cur = 1, roundOpen = false, time = 0, lastT = 0, best0 = 0, passedBest = false;
  var floats = [], banner = null, flash = 0, flashColor = '255,255,255', idle = 0, coach = false, resultT = 0, result = null, shopFrom = 'title';
  var fx = Kit.particles(), shake = Kit.shake();
  var mouse = { on: false, x: 640 };
  var CHEERS = ['رائع!', 'واااو!', 'بطل السحاب!', 'نطّة خارقة!', 'إلى السماء!', 'لا يوقفك أحد!'];
  var POWER_NAME = { balloon: 'بالون!', hat: 'طيران!', rocket: 'صاروخ!' };

  var SCREENS = { title: 'scrTitle', pause: 'scrPause', result: 'scrResult', levels: 'scrLevels', shop: 'scrShop' };
  function setScreen(name) {
    screen = name;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play';
    Kit.keys.reset();
    dirty = true;
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(text) { $('live').textContent = text; }
  function charId() { return CH.CHARS[save.char].id; }

  /* ------------------------------------------------------------ the title */
  function refreshTitle() {
    var n = CH.nextLevel(save), lv = $('titleLevel');
    // Every level won: Play goes to the endless sky, and the chip says so.
    lv.querySelector('small').textContent = n ? 'المرحلة' : 'بلا نهاية';
    lv.querySelector('b').innerHTML = n || '<svg aria-hidden="true"><use href="#i-inf"/></svg>';
    $('titleStars').querySelector('b').textContent = CH.totalStars(save) + '/36';
    $('titleCandies').querySelector('b').textContent = Kit.fmt(save.candies);
    var open = CH.endlessOpen(save);
    $('btnEndless').classList.toggle('locked', !open);
    $('btnEndless').querySelector('.lockmsg').hidden = open;
    $('btnChars').querySelector('.dot').hidden = !CH.affordable(save);
  }
  function toTitle() {
    if (roundOpen) { Kit.stats.end('quit'); roundOpen = false; }
    world = null;
    persist();
    refreshTitle();
    setScreen('title');
  }
  // First visit: straight into level 1. Later: the next level not yet won (or endless).
  function play() {
    startRound(save.played ? CH.nextLevel(save) : 1);
  }

  /* --------------------------------------------------------------- rounds */
  function startRound(level) {
    J.select();
    if (roundOpen) Kit.stats.end('quit');
    cur = level;
    world = CH.create({ level: level, diff: dda.level, seed: (M.random() * 1e9) >>> 0 });
    Kit.stats.round(level ? 'L' + level : 'endless');
    roundOpen = true;
    best0 = save.best; passedBest = false;
    floats.length = 0; banner = null; flash = 0; fx.clear(); view.debris.length = 0; idle = 0; result = null;
    mouse.on = false;
    if (!save.played) { save.played = true; persist(); }
    coach = !save.coach;
    if (coach) Kit.stats.tutorial('start');
    // On a first visit the steering hint shows instead of the level banner (it would cover it).
    else showBanner(level ? 'المرحلة ' + level : 'بلا نهاية', '#fff', 1.7, level ? CH.WORLDS[CH.worldOf(level)].name : 'إلى أعلى ما تستطيع!');
    setScreen('play');
    say(level ? 'المرحلة ' + level : 'بلا نهاية');
  }
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
    mouse.on = false; // the pointer was on the pause screen: steer again once it moves over the sky
    setScreen('play');
  }
  function restart() { startRound(cur); }
  // dda: 1 for a win with every bubble left, less with fewer, 0 for a loss.
  function tryScore(w) {
    if (!w.won) return 0;
    var max = CH.bubbles(w.level, w.diff);
    if (max < 0) return w.falls === 0 ? 1 : M.max(0.6, 1 - 0.1 * w.falls);
    return 0.6 + 0.4 * w.bubbles / M.max(1, max);
  }
  function arrived() {
    var w = world, n = w.level, prev = save.stars[n - 1], prevCandies = save.bestAt[n - 1];
    var bonus = w.stars * CH.STAR_BONUS;
    save.candies += bonus;
    save.stars[n - 1] = M.max(prev, w.stars);
    save.bestAt[n - 1] = M.max(save.bestAt[n - 1], w.candies);
    if (n < CH.LEVELS) save.unlocked = M.max(save.unlocked, n + 1);
    result = { won: true, level: n, stars: w.stars, bonus: bonus, candies: w.candies + bonus, height: M.floor(w.height), best: prev > 0 && (w.stars > prev || (w.stars === prev && w.candies > prevCandies)) };
    Kit.stats.end('win', w.stars);
    dda.result(tryScore(w));
    roundOpen = false;
    persist();
  }
  function lost() {
    if (result) return;
    var w = world, h = M.floor(w.height);
    if (w.level) {
      Kit.stats.end('lose', h);
      dda.result(0);
      result = { won: false, level: w.level, stars: 0, bonus: 0, candies: w.candies, height: h, best: false };
    } else {
      Kit.stats.end('end', h);
      dda.result(M.min(1, h / M.max(60, best0)));
      save.best = M.max(save.best, h);
      result = { won: false, endless: true, level: 0, stars: h >= 400 ? 3 : h >= 150 ? 2 : 1, bonus: 0, candies: w.candies, height: h, best: h > best0 && h > 0 };
    }
    roundOpen = false;
    persist();
  }
  function showResult() {
    var r = result;
    if (!r) return;
    var card = document.querySelector('.result-card');
    card.classList.toggle('lose', !r.won && !r.endless);
    $('resTitle').textContent = r.won ? 'وصلت!' : r.endless ? 'رائع!' : 'أوووه!';
    $('resSub').textContent = r.won ? 'المرحلة ' + r.level + ' — ' + CH.WORLDS[CH.worldOf(r.level)].name : r.endless ? 'بلا نهاية' : 'نفدت الفقاعات! جرّب مرة أخرى';
    var st = $('resStars').querySelectorAll('.st');
    for (var i = 0; i < 3; i++) st[i].classList.toggle('on', i < r.stars);
    $('resHeight').textContent = Kit.fmt(r.height);
    $('resCandies').textContent = '+' + Kit.fmt(r.candies);
    $('resBest').hidden = !r.best;
    $('btnNext').hidden = !r.won;
    $('btnResChars').querySelector('.dot').hidden = !CH.affordable(save);
    resultT = 0;
    setScreen('result');
    say($('resTitle').textContent);
    if (r.won || r.endless) {
      fx.burst(640, 200, { count: 80, colors: ['#ff5fa2', '#ffe14f', '#4fe0b0', '#7fd8ff', '#a77bff'], speed: 560, life: 1.4 });
      fx.burst(320, 300, { count: 40, colors: ['#ff5fa2', '#ffe14f', '#4fe0b0'], speed: 420, life: 1.2 });
      fx.burst(960, 300, { count: 40, colors: ['#7fd8ff', '#ffe14f', '#a77bff'], speed: 420, life: 1.2 });
    } else J.fail();
  }
  function next() {
    if (!result) return;
    if (result.won) startRound(result.level < CH.LEVELS ? result.level + 1 : 0);
    else startRound(cur);
  }

  /* --------------------------------------------------------- level map */
  var lvlBtns = [];
  function buildLevels() {
    var box = $('worlds');
    for (var wi = 0; wi < 3; wi++) {
      var row = document.createElement('div');
      row.className = 'world w' + wi;
      row.innerHTML = '<span class="wname">' + CH.WORLDS[wi].name + '</span>';
      for (var k = 0; k < 4; k++) {
        var n = wi * 4 + k + 1, b = document.createElement('button');
        b.type = 'button'; b.className = 'lvl'; b.setAttribute('data-level', String(n));
        row.appendChild(b);
        lvlBtns.push(b);
        on(b, pickLevel.bind(null, n, b));
      }
      box.appendChild(row);
    }
    on($('lvlEndless'), function () {
      if (!CH.endlessOpen(save)) { nope($('lvlEndless')); return; }
      startRound(0);
    });
  }
  function pickLevel(n, b) {
    if (n > save.unlocked) { nope(b); return; }
    startRound(n);
  }
  function nope(el) { J.error(); el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); }
  function refreshLevels() {
    var star = '<svg aria-hidden="true"><use href="#i-star"/></svg>', nextN = CH.nextLevel(save);
    lvlBtns.forEach(function (b, i) {
      var n = i + 1, open = n <= save.unlocked, s = save.stars[i];
      b.classList.toggle('locked', !open);
      b.classList.toggle('next', open && n === nextN);
      if (!open) b.innerHTML = '<svg class="lk" aria-hidden="true"><use href="#i-lock"/></svg>';
      else {
        var ss = '';
        for (var k = 0; k < 3; k++) ss += star.replace('<svg', '<svg class="' + (k < s ? 'on' : 'off') + '"');
        b.innerHTML = '<span class="n">' + n + '</span><span class="ss">' + ss + '</span>';
      }
      b.setAttribute('aria-label', 'المرحلة ' + n + (open ? '، ' + s + ' نجوم' : '، مقفلة'));
    });
    var e = $('lvlEndless'), open = CH.endlessOpen(save);
    e.classList.toggle('locked', !open);
    e.querySelector('.best').textContent = open ? (save.best ? 'الأفضل ' + Kit.fmt(save.best) + ' م' : '') : 'بعد المرحلة 4';
    $('levelsStars').textContent = CH.totalStars(save) + '/36';
  }
  function openLevels() { J.select(); refreshLevels(); setScreen('levels'); }

  /* ----------------------------------------------------------- characters */
  var charBtns = [];
  function buildShop() {
    var box = $('chars');
    CH.CHARS.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'char';
      b.innerHTML = '<canvas width="195" height="180"></canvas><b>' + c.name + '</b><span class="pr"></span>';
      on(b, function () { buyChar(i, b); });
      box.appendChild(b);
      charBtns.push(b);
    });
    paintChars();
  }
  function paintChars() {
    charBtns.forEach(function (b, i) {
      var c = b.querySelector('canvas').getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 195, 180);
      c.setTransform(1.5, 0, 0, 1.5, 0, 0);
      CH.drawChar(c, CH.CHARS[i].id, 65, 108, 72, { t: 0.4, arms: 0.7 });
    });
  }
  function refreshShop() {
    $('shopCandies').textContent = Kit.fmt(save.candies);
    var candy = '<svg aria-hidden="true"><use href="#i-candy"/></svg>';
    charBtns.forEach(function (b, i) {
      var own = save.chars[i], c = CH.CHARS[i];
      b.classList.toggle('on', save.char === i);
      b.classList.toggle('owned', own);
      b.classList.toggle('locked', !own);
      b.classList.toggle('can', !own && save.candies >= c.cost);
      b.querySelector('.pr').innerHTML = own ? (save.char === i ? '✔' : '') : candy + Kit.fmt(c.cost);
      b.setAttribute('aria-label', c.name + (own ? '' : '، ' + c.cost + ' حلوى'));
      b.setAttribute('aria-pressed', String(save.char === i));
    });
  }
  function openShop() {
    shopFrom = screen === 'result' ? 'result' : 'title';
    J.select();
    refreshShop();
    setScreen('shop');
  }
  function closeShop() {
    J.back();
    if (shopFrom === 'result' && result) { setScreen('result'); $('btnResChars').querySelector('.dot').hidden = !CH.affordable(save); }
    else { refreshTitle(); setScreen('title'); }
  }
  function buyChar(i, b) {
    var had = save.chars[i];
    if (!CH.buy(save, i)) { nope(b); return; }
    if (had) J.tap();
    else {
      J.coin(5); J.chime(3);
      var r = b.getBoundingClientRect(), p = fit.toLogical(r.left + r.width / 2, r.top + r.height / 2);
      fx.burst(p.x, p.y, { count: 40, colors: ['#ffe14f', '#ff5fa2', '#4fe0b0', '#7fd8ff'], speed: 420 });
      boing(CH.CHARS[i].id, 3, 1);
    }
    persist();
    refreshShop();
  }

  /* ---------------------------------------------------------------- input */
  // The second click of a double-click is ignored: it would land on the screen the first opened.
  function on(el, fn) { el.addEventListener('click', function (e) { e.stopPropagation(); if (e.detail > 1) return; fn(); if (e.detail > 0) el.blur(); }); }
  on($('btnPlay'), play);
  on($('btnLevels'), openLevels);
  on($('btnChars'), openShop);
  on($('btnEndless'), function () {
    if (!CH.endlessOpen(save)) { nope($('btnEndless')); return; }
    startRound(0);
  });
  on($('btnPause'), pause);
  on($('btnResume'), resume);
  on($('btnHome'), function () { J.back(); toTitle(); });
  on($('btnRestart'), restart);
  on($('btnNext'), next);
  on($('btnAgain'), function () { startRound(cur); });
  on($('btnMenu'), function () { J.back(); toTitle(); });
  on($('btnResChars'), openShop);
  on($('levelsBack'), function () { J.back(); refreshTitle(); setScreen('title'); });
  on($('shopBack'), closeShop);
  var STEER = { ArrowLeft: 1, ArrowRight: 1, KeyA: 1, KeyD: 1 };
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    var c = e.code;
    if (screen === 'play') {
      if (c === 'KeyP' || c === 'Escape') { e.preventDefault(); pause(); }
      else if (STEER[c]) mouse.on = false;
      return;
    }
    if (screen === 'pause') {
      if (c === 'KeyP' || c === 'Escape' || c === 'Enter' || c === 'Space') { e.preventDefault(); resume(); }
      else if (c === 'KeyR') restart();
      return;
    }
    if (screen === 'result') {
      if (resultT < 0.45) return; // a key still held from play does not skip the result
      if (c === 'Enter' || c === 'Space') { e.preventDefault(); next(); }
      else if (c === 'KeyR') startRound(cur);
      else if (c === 'Escape') toTitle();
      return;
    }
    if (screen === 'shop' && (c === 'Escape' || c === 'Enter')) { e.preventDefault(); closeShop(); return; }
    if (screen === 'levels' && c === 'Escape') { e.preventDefault(); J.back(); refreshTitle(); setScreen('title'); return; }
    if (screen === 'title' && (c === 'Enter' || c === 'Space')) { e.preventDefault(); play(); }
  });
  // Mouse steering starts only from a move over the game during play.
  window.addEventListener('pointermove', function (e) {
    if (screen !== 'play') return;
    if (e.target === canvas) mouse.on = true;
    mouse.x = fit.toLogical(e.clientX, e.clientY).x;
  });
  var lastMouseX = -1;
  function readInput() {
    var k = Kit.keys, dir = 0;
    if (k.anyDown(['ArrowLeft', 'KeyA'])) dir -= 1;
    if (k.anyDown(['ArrowRight', 'KeyD'])) dir += 1;
    if (dir) mouse.on = false;
    var moved = mouse.on && M.abs(mouse.x - lastMouseX) > 3;
    lastMouseX = mouse.x;
    if (dir || moved) idle = 0;
    return { dir: dir, mouseX: mouse.on ? mouse.x : null };
  }

  /* -------------------------------------------------------- sounds and fx */
  function ladder(i) { i = M.max(0, M.min(14, i)); return M.pow(2, (12 * M.floor(i / 5) + [0, 2, 4, 7, 9][i % 5]) / 12); }
  // Every character has its own boing; its pitch climbs with a streak of higher landings.
  function boing(id, streak, power) {
    var f = 300 * ladder(M.max(0, (streak || 1) - 1)), T = AU.tone, N = AU.noise;
    if (power > 1.3) { T({ freq: 160, to: 900, type: 'sine', dur: 0.42, vol: 0.2 }); J.whoosh(0.8); }
    switch (id) {
      case 'jelly': T({ freq: f, to: f * 1.5, type: 'sine', dur: 0.07, vol: 0.16 }); T({ freq: f * 1.3, to: f * 0.9, type: 'sine', dur: 0.07, vol: 0.14, delay: 0.06 }); T({ freq: f * 1.1, to: f * 1.9, type: 'sine', dur: 0.1, vol: 0.14, delay: 0.12 }); break;
      case 'donut': T({ freq: f * 0.6, to: f * 0.32, type: 'triangle', dur: 0.2, vol: 0.2 }); T({ freq: f * 1.2, to: f * 1.9, type: 'sine', dur: 0.12, vol: 0.1 }); break;
      case 'duck': T({ freq: f * 2, to: f * 1.5, type: 'sawtooth', dur: 0.08, vol: 0.07 }); T({ freq: f * 1.8, to: f * 1.3, type: 'sawtooth', dur: 0.1, vol: 0.07, delay: 0.08 }); break;
      case 'pickle': N({ dur: 0.08, vol: 0.12, filter: 1400, to: 500 }); T({ freq: f * 0.8, to: f * 1.7, type: 'sine', dur: 0.14, vol: 0.18 }); break;
      case 'fatira': N({ dur: 0.12, vol: 0.12, filter: 2600, to: 600 }); T({ freq: f, to: f * 1.5, type: 'triangle', dur: 0.12, vol: 0.14 }); break;
      case 'boba': T({ freq: f * 1.4, to: f * 0.6, type: 'sine', dur: 0.1, vol: 0.18 }); T({ freq: f * 0.7, to: f * 1.9, type: 'sine', dur: 0.12, vol: 0.18, delay: 0.08 }); break;
      case 'gold': T({ freq: f * 2, to: f * 2.1, type: 'triangle', dur: 0.24, vol: 0.12 }); T({ freq: f * 3, type: 'sine', dur: 0.16, vol: 0.08, delay: 0.04 }); T({ freq: f, to: f * 2, type: 'sine', dur: 0.14, vol: 0.14 }); break;
      default: T({ freq: f, to: f * 2.3, type: 'sine', dur: 0.17, vol: 0.2 }); T({ freq: f * 0.5, to: f * 1.1, type: 'triangle', dur: 0.12, vol: 0.1 });
    }
  }
  function float(text, x, y, color, size, vy) {
    if (floats.length > 36) floats.shift();
    var o = { text: text, x: x, y: y, color: color || '#fff', size: size || 34, vy: vy || -120, life: 1, rtl: /[؀-ۿ]/.test(text) };
    floats.push(o);
    return o;
  }
  function showBanner(text, color, secs, sub) { banner = { text: text, sub: sub || '', color: color || '#fff', t: 0, max: secs || 1.6, y: 185 }; }
  function burst(x, y, colors, n, speed, o) {
    o = o || {};
    fx.burst(x, y, { count: n, colors: colors, speed: speed, life: o.life || 0.6, size: o.size || 6, gravity: o.gravity == null ? 500 : o.gravity });
  }
  var candyCount = 0;
  function handle(e) {
    var w = world, sx = e.x, sy = H - (e.y - w.cam);
    switch (e.type) {
      case 'steer':
        if (!save.coach) { save.coach = true; Kit.stats.tutorial('done'); unsaved = true; }
        coach = false;
        break;
      case 'bounce':
        boing(charId(), e.b, e.c);
        if (!calm()) burst(sx, sy, ['#ffffff', '#e8f4ff'], e.a === 'ground' ? 6 : 8, 160, { life: 0.35, gravity: 200 });
        if (e.a === 'tramp') { float('بوينغ!', sx, sy - 120, '#ffe14f', 50, -90); shake.add(5); }
        else if (e.a === 'jelly') { float('بلوبب!', sx, sy - 120, '#7dff9a', 52, -90); shake.add(6); AU.tone({ freq: 140, to: 520, type: 'sine', dur: 0.5, vol: 0.18 }); }
        else if (e.b > 1 && e.b % 5 === 0) float(CHEERS[(e.b / 5 - 1) % CHEERS.length], sx, sy - 110, '#ffe14f', 44, -80);
        break;
      case 'hop': boing(charId(), 1, 1); break;
      case 'mult':
        J.chime(2);
        float('حلوى \u2066×' + e.a + '\u2069', sx, sy - 140, '#ff9ee0', 54, -70);
        break;
      case 'candy':
        candyCount++;
        J.coin(1 + candyCount % 5);
        save.candies += e.a; unsaved = true;
        float('+' + e.a, e.b, H - (e.c - w.cam) - 20, e.a > 1 ? '#ffe14f' : '#fff', e.a > 1 ? 40 : 34, -150);
        burst(e.b, H - (e.c - w.cam), ['#fff', '#ffe14f', '#ff9ee0'], 6, 200, { life: 0.4, gravity: 0, size: 5 });
        break;
      case 'star':
        J.chime(3); J.coin(5);
        save.candies += e.a; unsaved = true;
        float('+' + e.a, e.b, H - (e.c - w.cam) - 30, '#ffd23f', 64, -110);
        burst(e.b, H - (e.c - w.cam), ['#ffd23f', '#fff', '#ffe14f'], 30, 380, { life: 0.8, gravity: 200 });
        shake.add(4);
        break;
      case 'power':
        Kit.track.hit();
        float(POWER_NAME[e.a] || '!', sx, sy - 130, '#7fd8ff', 56, -80);
        burst(sx, sy - 40, ['#fff', '#7fd8ff', '#ffe14f'], 24, 360, { gravity: 100 });
        if (e.a === 'balloon') { AU.tone({ freq: 260, to: 620, type: 'sine', dur: 0.3, vol: 0.18 }); AU.tone({ freq: 520, to: 1240, type: 'triangle', dur: 0.22, vol: 0.08, delay: 0.08 }); }
        else if (e.a === 'hat') { AU.noise({ dur: 0.9, vol: 0.12, filter: 900, to: 2400 }); AU.tone({ freq: 400, to: 900, type: 'triangle', dur: 0.5, vol: 0.12 }); }
        else { J.whoosh(1); AU.noise({ dur: 1.2, vol: 0.16, filter: 700, to: 3000 }); AU.tone({ freq: 120, to: 600, type: 'sawtooth', dur: 0.9, vol: 0.06 }); shake.add(6); }
        break;
      case 'powerEnd':
        if (e.a === 'balloon') { J.pop(1); float('بوب!', sx + 40, sy - 150, '#ff6f8a', 46, -60); burst(sx + 34, sy - 140, ['#ff4f6d', '#fff'], 14, 300, { gravity: 300 }); }
        else J.whoosh(0.3);
        break;
      case 'stomp':
        Kit.track.hit();
        J.impact(0.45);
        AU.tone({ freq: 560, to: 150, type: 'square', dur: 0.13, vol: 0.08 });
        AU.tone({ freq: 420, to: 360, type: 'triangle', dur: 0.12, vol: 0.12, delay: 0.12 }); AU.tone({ freq: 380, to: 330, type: 'triangle', dur: 0.16, vol: 0.12, delay: 0.26 });
        save.candies += e.b; unsaved = true;
        float('بونك!', sx, sy - 70, '#fff', 58, -90);
        float('+' + e.b, sx + 70, sy - 20, '#ffe14f', 40, -130);
        burst(sx, sy, e.a === 'ufo' ? ['#c9d3ea', '#7dea6a', '#ffe14f'] : ['#c9d0e0', '#ffffff', '#a3adc4'], 20, 320, { gravity: 300, size: 8 });
        shake.add(7);
        break;
      case 'bonk':
        Kit.track.miss();
        J.impact(0.75);
        AU.tone({ freq: 520, to: 200, type: 'sawtooth', dur: 0.24, vol: 0.08 });
        float('آخ!', sx, sy - 100, '#ff6f8a', 60, -70);
        shake.add(11);
        break;
      case 'zap':
        Kit.track.miss();
        AU.noise({ dur: 0.3, vol: 0.2, filter: 6000, to: 1500 });
        AU.tone({ freq: 110, to: 85, type: 'sawtooth', dur: 0.32, vol: 0.1 });
        float('ززز!', sx, sy - 100, '#ffe14f', 60, -70);
        shake.add(9); flash = 0.7; flashColor = '255,240,120';
        break;
      case 'crumble':
        AU.noise({ dur: 0.2, vol: 0.22, filter: 1900, to: 300 });
        J.impact(0.15);
        view.crumble(e.a, e.b, e.c);
        burst(e.a, H - (e.b - w.cam) + 8, ['#d98f3e', '#efb262', '#6b3a1f'], 16, 240, { gravity: 700, size: 7 });
        float('قرمش!', e.a, H - (e.b - w.cam) + 40, '#ffd08a', 38, -50);
        break;
      case 'regrow':
        if (M.abs(e.b - w.cam - 360) < 400) AU.tone({ freq: 500, to: 900, type: 'sine', dur: 0.1, vol: 0.06 });
        break;
      case 'fall':
        Kit.track.miss();
        AU.tone({ freq: 1100, to: 260, type: 'sine', dur: 0.55, vol: 0.12 });
        break;
      case 'rescued':
        J.pop(0.9);
        AU.tone({ freq: 400, to: 800, type: 'sine', dur: 0.12, vol: 0.12, delay: 0.05 }); AU.tone({ freq: 600, to: 1200, type: 'sine', dur: 0.12, vol: 0.1, delay: 0.14 });
        float('هوب! رجعنا', sx, sy - 120, '#7fd8ff', 52, -70);
        burst(sx, sy - 36, ['#ffffff', '#bfe9ff'], 24, 340, { gravity: 120 });
        break;
      case 'falling':
        Kit.track.miss();
        lost();
        AU.tone({ freq: 1100, to: 180, type: 'sine', dur: 0.9, vol: 0.13 });
        break;
      case 'lose':
        lost();
        showResult();
        break;
      case 'arrive':
        J.levelUp();
        arrived();
        showBanner('وصلت!', '#ffe14f', CH.ARRIVE); banner.y = 158;
        burst(sx, sy - 40, ['#ff5fa2', '#ffe14f', '#4fe0b0', '#7fd8ff', '#a77bff'], 70, 600, { life: 1.4, gravity: 400, size: 9 });
        shake.add(8); flash = 0.6; flashColor = '255,255,255';
        break;
      case 'done':
        showResult();
        break;
      case 'mile':
        if (e.a % 50 === 0) { J.chime(1); float(CHEERS[(e.a / 50 - 1) % CHEERS.length], 640, 200, '#ffe14f', 50, -60); }
        else AU.tone({ freq: 880, to: 1320, type: 'triangle', dur: 0.08, vol: 0.06 });
        // A fast climb (a power-up, a spring) updates the one milestone popup instead of piling them up.
        var tag = '⁦' + e.a + '⁩ م', mf = null;
        for (var i = 0; i < floats.length; i++) if (floats[i].mile) mf = floats[i];
        if (mf) { mf.text = tag; mf.life = 1; }
        else float(tag, 640 + (e.a % 20 ? 170 : -170), 70, '#fff', 34, -40).mile = true;
        if (!w.level && best0 > 0 && !passedBest && w.height > best0) {
          passedBest = true;
          showBanner('رقم قياسي جديد!', '#ffe14f', 1.6);
          J.levelUp();
        }
        break;
      case 'foe':
        Kit.track.cue();
        if (e.a === 'pigeon') { AU.tone({ freq: 430, to: 380, type: 'triangle', dur: 0.14, vol: 0.06 }); AU.tone({ freq: 400, to: 350, type: 'triangle', dur: 0.18, vol: 0.06, delay: 0.17 }); }
        else AU.tone({ freq: 700, to: 1100, type: 'sine', dur: 0.3, vol: 0.05 });
        break;
    }
  }

  /* --------------------------------------------------------------- update */
  function update(dt) {
    // Paused, the whole picture waits: the sky, popups, the level banner, sparkles and shake.
    if (screen === 'pause') { Kit.keys.endFrame(); return; }
    time += dt;
    if (screen === 'play' && world) {
      var inp = readInput();
      if (world.phase === 'play' || world.phase === 'squat') idle += dt;
      CH.step(world, dt, inp);
      for (var i = 0; i < world.ev.length; i++) handle(world.ev[i]);
      world.ev.length = 0;
      if (world && (world.phase === 'arrive' || world.phase === 'rescue')) Kit.stats.busy();
      saveTimer += dt;
      if (unsaved && saveTimer > 8) persist();
      dirty = true;
    } else if (screen === 'result') {
      var before = resultT;
      resultT += dt;
      if (result) {
        for (var s = 1; s <= result.stars; s++) { var at = 0.05 + 0.3 * s; if (before < at && resultT >= at) J.star(s); }
        if (result.best && before < 1.15 && resultT >= 1.15) J.levelUp();
      }
    }
    for (var f = floats.length - 1; f >= 0; f--) {
      var p = floats[f];
      p.life -= dt * 0.95; p.y += p.vy * dt; p.vy *= 0.97;
      if (p.life <= 0) floats.splice(f, 1);
    }
    if (banner) { banner.t += dt; if (banner.t > banner.max) banner = null; }
    flash = M.max(0, flash - dt * 2.5);
    fx.update(dt); shake.update(dt);
    Kit.keys.endFrame();
  }

  /* ------------------------------------------------------------------ HUD */
  function text(str, x, y, size, color, align, rtl) {
    ctx.font = '700 ' + size + 'px Fredoka'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.lineJoin = 'round'; ctx.lineWidth = M.max(4, size * 0.17); ctx.strokeStyle = '#26305e';
    ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y);
    ctx.direction = 'ltr';
  }
  function panel(x, y, w, h, fill) {
    CH.rrect(ctx, x, y, w, h, h / 2); ctx.fillStyle = fill || 'rgba(38,48,94,0.82)'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
  }
  function keycap(x, y, label, down) {
    var d = down ? 4 : 0;
    CH.rrect(ctx, x - 26, y - 24, 52, 50, 10); ctx.fillStyle = '#9aa3c7'; ctx.fill();
    CH.rrect(ctx, x - 26, y - 26 + d, 52, 46, 10); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#26305e'; ctx.stroke();
    ctx.font = '700 30px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr'; ctx.fillStyle = '#26305e';
    ctx.fillText(label, x, y - 3 + d);
  }
  function mouseIcon(x, y) {
    CH.rrect(ctx, x - 17, y - 25, 34, 50, 17); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#26305e'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 25); ctx.lineTo(x, y - 6); ctx.moveTo(x - 17, y - 6); ctx.lineTo(x + 17, y - 6); ctx.stroke();
  }
  function drawCoach(w) {
    var m = view.marshyAt, k = calm() ? 0 : M.sin(time * 5);
    var cx = M.max(240, M.min(W - 240, m.x)), cy = M.max(150, M.min(H - 120, m.y - 150));
    ctx.save(); ctx.translate(cx, cy); if (!calm()) ctx.scale(1 + k * 0.03, 1 + k * 0.03);
    panel(-200, -50, 400, 100, 'rgba(255,95,162,0.95)');
    var left = k < 0;
    keycap(-150, 2, '←', left); keycap(-90, 2, '→', !left);
    ctx.fillStyle = '#fff'; ctx.font = '700 22px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('/', -48, 2);
    mouseIcon(-14 + k * 10, 2);
    text('وجّه مارشي', 100, 0, 34, '#fff', 'center', true);
    ctx.restore();
    // a little arrow pointing at Marshy
    ctx.fillStyle = 'rgba(255,95,162,0.95)'; ctx.beginPath(); ctx.moveTo(m.x - 14, cy + 50); ctx.lineTo(m.x + 14, cy + 50); ctx.lineTo(m.x, cy + 70); ctx.closePath();
    if (M.abs(m.x - cx) < 190) ctx.fill();
  }
  function bubbleIcon(x, y, r) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, M.PI * 2); ctx.fillStyle = 'rgba(170,230,255,0.6)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.65, M.PI * 1.1, M.PI * 1.5); ctx.stroke();
  }
  function drawHud() {
    var w = world;
    // height
    panel(510, 12, 260, 80);
    text(Kit.fmt(M.floor(w.height)), 660, 52, 54, '#fff');
    text('م', 560, 54, 40, '#ffe14f', 'center', true);
    if (!w.level && save.best > 0) text('الأفضل ⁦' + Kit.fmt(M.max(save.best, M.floor(w.height))) + '⁩ م', 640, 112, 24, '#ffe14f', 'center', true);
    // level
    panel(92, 18, 200, 58);
    text(w.level ? 'المرحلة ' + w.level : 'بلا نهاية', 192, 47, 30, '#fff', 'center', true);
    // candies and bubbles
    panel(990, 16, 180, 60);
    CH.drawCandy(ctx, 1028, 46, 1.05, 0);
    text(Kit.fmt(w.candies), 1110, 47, 36, '#fff');
    // rescue bubbles: endless in level 1, a few later
    var nb = w.bubbles < 0 ? 2 : M.max(1, w.bubbles), bw = 30 + nb * 42;
    panel(1170 - bw, 86, bw, 52, w.bubbles === 0 ? 'rgba(160,40,80,0.85)' : null);
    if (w.bubbles < 0) { bubbleIcon(1170 - bw + 34, 112, 16); text('∞', 1170 - bw + 80, 110, 38, '#fff'); }
    else if (w.bubbles === 0) { ctx.globalAlpha = 0.45; bubbleIcon(1170 - bw + 36, 112, 16); ctx.globalAlpha = 1; }
    else for (var b = 0; b < w.bubbles; b++) bubbleIcon(1170 - 36 - b * 42, 112, 16);
    // the candy multiplier
    if (w.mult > 1) {
      var pul = calm() ? 1 : 1 + M.sin(time * 10) * 0.06;
      ctx.save(); ctx.translate(1100, 178); ctx.scale(pul, pul);
      panel(-70, -26, 140, 52, 'rgba(255,95,162,0.95)');
      CH.drawCandy(ctx, -32, 0, 0.8, 1);
      text('×' + w.mult, 24, 1, 34, '#fff');
      ctx.restore();
    }
    // how far to the castle
    if (w.level) {
      var x = 34, top = 130, bot = 610, f = M.max(0, M.min(1, w.m.y / w.castleY));
      CH.rrect(ctx, x - 11, top, 22, bot - top, 11); ctx.fillStyle = 'rgba(38,48,94,0.7)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      if (w.maxY > 0) { var mf = M.min(1, w.maxY / w.castleY); CH.rrect(ctx, x - 6, bot - 5 - (bot - top - 10) * mf, 12, (bot - top - 10) * mf, 6); ctx.fillStyle = '#ffe14f'; ctx.fill(); }
      ctx.fillStyle = '#ff6fa8'; ctx.beginPath(); ctx.moveTo(x - 16, top - 4); ctx.lineTo(x, top - 32); ctx.lineTo(x + 16, top - 4); ctx.closePath(); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#26305e'; ctx.stroke();
      ctx.fillStyle = '#ffc6e2'; ctx.fillRect(x - 11, top - 6, 22, 14); ctx.strokeRect(x - 11, top - 6, 22, 14);
      CH.drawChar(ctx, charId(), x, bot - (bot - top) * f + 14, 28, { t: time, arms: 0.5 });
    }
    // floats
    for (var i = 0; i < floats.length; i++) {
      var p = floats[i];
      ctx.globalAlpha = M.max(0, M.min(1, p.life * 1.8));
      text(p.text, p.x, p.y, p.size, p.color, 'center', p.rtl);
    }
    ctx.globalAlpha = 1;
    // the first-time hint (and again after a long while without steering)
    if (w.phase === 'play' || w.phase === 'squat') {
      if (coach && w.t > 5) coach = false;
      if (coach || (idle > 7 && !w.steered)) drawCoach(w);
    }
    if (banner) {
      var k = banner.t / banner.max, s = calm() ? 1 : k < 0.12 ? 0.4 + k / 0.12 * 0.75 : k < 0.22 ? 1.15 - (k - 0.12) * 1.5 : 1;
      ctx.globalAlpha = k > 0.8 ? M.max(0, (1 - k) / 0.2) : 1;
      ctx.save(); ctx.translate(640, banner.y); ctx.scale(s, s);
      text(banner.text, 0, 0, 92, banner.color, 'center', true);
      if (banner.sub) text(banner.sub, 0, 64, 36, '#fff', 'center', true); // clear of Marshy's first boing
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  /* --------------------------------------------------------------- render */
  function themeOf(w) {
    if (w.level) return { a: CH.worldOf(w.level), b: 0, mix: 0 };
    var h = (w.cam + 360) / CH.PX, a = CH.themeAt(h), bounds = [150, 400, 800];
    var edge = bounds[a], mix = edge ? M.max(0, M.min(1, (h - (edge - 50)) / 50)) : 0;
    return { a: a, b: M.min(3, a + 1), mix: mix };
  }
  function render() {
    var live = screen === 'play' || (screen === 'title' && !calm()) || (screen !== 'pause' && (fx.list.length > 0 || floats.length > 0));
    if (!live && !dirty) return; // a still menu (or the pause card) keeps its last frame
    var dt = M.min(0.1, M.max(0, time - lastT)); lastT = time;
    ctx.save();
    if (shake.power) ctx.translate(shake.x, shake.y);
    if (world && screen !== 'title' && !(screen === 'shop' && shopFrom === 'title') && screen !== 'levels') {
      var th = themeOf(world);
      view.render(world, { t: time, dt: screen === 'play' ? dt : 0, char: charId(), theme: th.a, theme2: th.b, mix: th.mix });
    } else view.title({ t: time, dt: dt, char: charId() });
    ctx.restore();
    fx.draw(ctx);
    if (flash > 0) { ctx.fillStyle = 'rgba(' + flashColor + ',' + (flash * 0.45) + ')'; ctx.fillRect(0, 0, W, H); }
    if (world && (screen === 'play' || screen === 'pause')) drawHud();
    dirty = false;
  }

  /* ----------------------------------------------------- test and debug hook */
  var r1 = function (v) { return M.round(v * 10) / 10; };
  function snapshot() {
    var w = world, m = w ? w.m : null;
    return {
      screen: screen, level: w ? w.level : cur, t: w ? r1(w.t) : 0, phase: w ? w.phase : '',
      x: m ? r1(m.x) : 640, y: m ? r1(m.y) : 0, vy: m ? r1(m.vy) : 0, height: w ? w.height : 0,
      bubbles: w ? w.bubbles : 0, candies: w ? w.candies : 0, falls: w ? w.falls : 0, mult: w ? w.mult : 1,
      won: w ? w.won : false, stars: result ? result.stars : 0, wallet: save.candies,
      mouse: mouse.on, coach: coach, banner: banner ? banner.text : ''
    };
  }

  /* ----------------------------------------------------------------- init */
  Kit.muteButton();
  Kit.lifecycle({ pause: pause, reset: function () { mouse.on = false; } });
  Kit.motion.onChange(function (r) { if (view) view.calm = r; dirty = true; });
  window.addEventListener('pageshow', function () { dirty = true; });
  window.addEventListener('pagehide', function () { if (unsaved) persist(); });
  canvas.addEventListener('contextrestored', function () { dirty = true; render(); });
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 40px Fredoka', 'ب').then(function () { dirty = true; render(); }, function () { /* fallback fonts */ });
  }
  var loop = null;
  try {
    view = CH.createView(ctx);
    view.calm = calm();
    view.setScale(fit.scale * fit.dpr);
    view.warm([0]);
    buildLevels();
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
