/* Egg Rush (سباق البيض): screens, keys, HUD, sound, saving and Kit hooks.
 * engine.js runs the race (pure); art.js draws it. This UI layer reads Kit.dda at each
 * one-player race start and reports the result back; two-player races never touch it. */
(function () {
  'use strict';
  var J = Kit.juice, AU = Kit.audio, W = 1280, H = 720, M = Math;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('gl'), ui = $('ui');
  var calm = function () { return Kit.motion.reduced(); };
  var software = ER.softwareGL();
  var view = null, contextLost = false, dirty = true, lastFrame = 0, lastDraw = 0;
  var fit = Kit.fit(canvas, W, H, { webgl: true, maxDpr: 1.5, onResize: function (v) {
    ui.style.left = canvas.style.left; ui.style.top = canvas.style.top; ui.style.transform = 'scale(' + v.scale + ')';
    if (view) view.resize(M.round(W * v.scale), M.round(H * v.scale));
    dirty = true;
  } });

  /* ---------------------------------------------------------------- save */
  var store = Kit.store('egg-rush');
  var saveStatus = Kit.saveStatus({ retry: persist });
  var save = ER.loadSave(store.get('save2', null));
  function persist() {
    if (store.set('save2', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  var dda = Kit.dda('egg-rush', { id: 'race', start: 0.3 });

  /* --------------------------------------------------------------- state */
  var screen = 'title', race = null, demo = null, cur = 0, time = 0, viewTime = 0, idle = 0, resultT = 0, lock = 0;
  var result = null, roundOpen = false, hintsOn = false, coachStarted = false;
  var preview = { r: save.runner, e: save.egg, row: 0 };
  var SCREENS = { title: 'scrTitle', map: 'scrMap', skins: 'scrSkins', pause: 'scrPause', result: 'scrResult' };
  var PLACE = ['', 'المركز الأول!', 'المركز الثاني!', 'المركز الثالث!', 'المركز الرابع'];
  var PRAISE = ['رائع!', 'ممتاز!', 'قفزة!', 'بطل!'];
  var DOT = ['#ff4d4d', '#2ea8ff', '#4cd964', '#ff6fb5'];

  function setScreen(name) {
    screen = name;
    for (var k in SCREENS) $(SCREENS[k]).hidden = k !== name;
    $('hud').hidden = name !== 'play' && name !== 'pause';
    dirty = true;
    if (name === 'play') focusGame();
  }
  function focusGame() { try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function say(t) { $('live').textContent = t; }
  function on(el, fn) { el.addEventListener('click', function (e) { fn(e); if (e.detail > 0) el.blur(); }); }
  function setText(el, t) { if (el.textContent !== t) el.textContent = t; }

  /* --------------------------------------------------------- demo scene */
  // Behind the title: live runners race down the track! In skins: hero poses close-up.
  function showDemo(i, stationary) {
    view.setTrack(i);
    demo = ER.create(i, stationary ? { humans: save.duo ? 2 : 1, skins: [preview.r, 2] } : { demo: true, seed: 42 + i, skins: [preview.r, 2] });
    if (!stationary) {
      for (var k = 0; k < 30; k++) ER.step(demo, 1 / 60, []);
      demo.ev.length = 0;
    }
    view.setRunners(runnerList(demo, true));
    view.snap();
  }
  function runnerList(r, menu) {
    return r.runners.map(function (q, i) {
      if (i === 0) return { skin: menu ? preview.r : save.runner, egg: menu ? preview.e : save.egg, tone: 0 };
      if (q.human) return { skin: 2, egg: 1, tone: 1 };
      return { skin: q.skin, egg: [1, 2, 3][i % 3], tone: (i + 1) % 4 };
    });
  }

  /* ------------------------------------------------------------ menus */
  function refreshChips() {
    var st = ER.totalStars(save) + '/27';
    setText($('titleStars'), st); setText($('mapStars'), st);
    setText($('titleEggs'), String(save.eggs)); setText($('mapEggs'), String(save.eggs)); setText($('skinEggs'), String(save.eggs));
    $('btnDuo').setAttribute('aria-pressed', String(save.duo));
    $('keysSolo').hidden = save.duo; $('keysDuo').hidden = !save.duo;
  }
  function toTitle() {
    leaveRace();
    preview.r = save.runner; preview.e = save.egg;
    showDemo(ER.nextTrack(save), false);
    refreshChips();
    setScreen('title');
  }
  var lvlButtons = [], mapBuilt = false;
  function buildMap() {
    if (mapBuilt) return;
    mapBuilt = true;
    var box = $('worlds');
    ER.WORLDS.forEach(function (wd, w) {
      var col = document.createElement('div');
      col.className = 'world w' + w;
      col.innerHTML = '<h3>' + wd.name + '</h3>';
      for (var l = 0; l < 3; l++) {
        var i = w * 3 + l, b = document.createElement('button');
        b.type = 'button'; b.className = 'er-btn lvl';
        b.innerHTML = '<span class="num">' + (l + 1) + '</span><span class="info"><span class="st">' + '<svg><use href="#i-star"/></svg>'.repeat(3) +
          '</span><span class="ge">' + '<svg><use href="#i-egg"/></svg>'.repeat(3) + '</span></span><svg class="lock" aria-hidden="true"><use href="#i-lock"/></svg>';
        (function (idx, btn) { on(btn, function () { pick(idx); }); btn.addEventListener('mouseenter', function () { if (ER.isOpen(save, idx)) { J.hover(); } }); })(i, b);
        col.appendChild(b);
        lvlButtons.push(b);
      }
      box.appendChild(col);
    });
  }
  function refreshMap() {
    buildMap();
    var nx = ER.nextTrack(save);
    lvlButtons.forEach(function (b, i) {
      var open = ER.isOpen(save, i);
      b.classList.toggle('locked', !open);
      b.classList.toggle('next', open && i === nx);
      b.querySelectorAll('.st svg').forEach(function (s, k) { s.classList.toggle('on', k < save.stars[i]); });
      b.querySelectorAll('.ge svg').forEach(function (s, k) { s.classList.toggle('on', k < save.gold[i]); });
      b.setAttribute('aria-label', ER.WORLDS[M.floor(i / 3)].name + ' ' + (i % 3 + 1) + (open ? '، ' + save.stars[i] + ' من 3 نجوم' : ' (مقفل)'));
    });
    refreshChips();
  }
  function toMap() {
    leaveRace();
    preview.r = save.runner; preview.e = save.egg;
    if (!demo || race) showDemo(ER.nextTrack(save), false);
    race = null;
    refreshMap();
    setScreen('map');
  }
  function pick(i) {
    if (!ER.isOpen(save, i)) { J.error(); return; }
    J.select();
    startRace(i);
  }
  function play() {
    J.select();
    // A first visit goes straight into the first race.
    if (!ER.totalStars(save)) startRace(0); else toMap();
  }
  function toggleDuo() {
    save.duo = !save.duo; persist();
    J.toggle(save.duo);
    refreshChips();
    showDemo(ER.nextTrack(save), false);
    say(save.duo ? 'لاعبان' : 'لاعب واحد');
  }

  /* ------------------------------------------------------------ skins */
  function openSkins() { J.select(); preview.r = save.runner; preview.e = save.egg; preview.row = 0; refreshSkins(); setScreen('skins'); showDemo(ER.nextTrack(save), true); }
  function refreshSkins() {
    [['pickRunner', ER.RUNNERS, preview.r, save.ownR], ['pickEgg', ER.EGGS, preview.e, save.ownE]].forEach(function (row, k) {
      var el = $(row[0]), item = row[1][row[2]], owned = row[3].indexOf(row[2]) >= 0, buy = el.querySelector('.buy');
      el.querySelector('.pname b').textContent = item.name;
      el.classList.toggle('focus', preview.row === k);
      buy.hidden = owned;
      buy.querySelector('b').textContent = String(item.price);
      buy.classList.toggle('cant', save.eggs < item.price);
      buy.setAttribute('aria-label', 'اشترِ بـ ' + item.price + ' بيضة ذهبية');
    });
    refreshChips();
    if (demo) view.setRunners(runnerList(demo, true));
  }
  function cycle(row, dir) {
    preview.row = row;
    if (row === 0) preview.r = (preview.r + dir + ER.RUNNERS.length) % ER.RUNNERS.length;
    else preview.e = (preview.e + dir + ER.EGGS.length) % ER.EGGS.length;
    // Browsing to something owned puts it on straight away.
    if (row === 0 && save.ownR.indexOf(preview.r) >= 0) { save.runner = preview.r; persist(); }
    if (row === 1 && save.ownE.indexOf(preview.e) >= 0) { save.egg = preview.e; persist(); }
    J.tap();
    refreshSkins();
  }
  function buy(row) {
    var list = row === 0 ? ER.RUNNERS : ER.EGGS, idx = row === 0 ? preview.r : preview.e, own = row === 0 ? save.ownR : save.ownE;
    if (own.indexOf(idx) >= 0) return;
    if (save.eggs < list[idx].price) { J.error(); return; }
    save.eggs -= list[idx].price; own.push(idx);
    if (row === 0) save.runner = idx; else save.egg = idx;
    persist();
    J.levelUp();
    if (view && demo) view.burstAt(demo.runners[0], 'gold');
    say('اشتريت ' + list[idx].name);
    refreshSkins();
  }
  function closeSkins() { J.back(); preview.r = save.runner; preview.e = save.egg; toTitle(); }

  /* ------------------------------------------------------------ race */
  function startRace(i) {
    leaveRace();
    cur = i;
    var duo = save.duo, tune = duo ? ER.tuning(0.3) : ER.tuning(dda.level);
    race = ER.create(i, { humans: duo ? 2 : 1, tune: tune, seed: (M.random() * 1e9) | 0, skins: [save.runner, 2] });
    view.setTrack(i);
    view.setRunners(runnerList(race, false));
    view.snap();
    demo = null; result = null; idle = 0; resultT = 0; reported = false;
    hintsOn = !duo && (i < 2 || !save.coach);
    Kit.stats.round((duo ? 'duo-' : '') + ER.trackId(i));
    roundOpen = true;
    if (!save.coach && i === 0 && !duo && !coachStarted) { coachStarted = true; Kit.stats.tutorial('start'); }
    Kit.keys.reset();
    Kit.hitstop.reset();
    resetMouse();
    buildHud();
    setScreen('play');
    say(ER.WORLDS[race.track.world].name + ' ' + (i % 3 + 1));
  }
  var reported = false;
  function leaveRace() {
    if (race && roundOpen) Kit.stats.end('quit');
    roundOpen = false;
    Kit.hitstop.reset();
    resetMouse();
    hidePops();
  }
  function pause() {
    if (screen !== 'play') return;
    J.back();
    resetMouse();
    setScreen('pause');
  }
  function resume() { J.select(); Kit.keys.reset(); resetMouse(); setScreen('play'); }
  function restart() { J.select(); startRace(cur); }

  /* ------------------------------------------------------------ input */
  var K = Kit.keys;
  var mouse = { on: false, x: W / 2, lastX: null, moved: 0, hop: false };
  function resetMouse() { mouse.on = false; mouse.lastX = null; mouse.moved = 0; mouse.hop = false; }
  canvas.addEventListener('pointermove', function (e) {
    if (screen !== 'play' || !race || race.humans !== 1 || race.phase !== 'race') return;
    var p = fit.toLogical(e.clientX, e.clientY);
    if (mouse.lastX != null) mouse.moved += M.abs(p.x - mouse.lastX);
    mouse.lastX = p.x;
    mouse.x = p.x;
    if (mouse.moved > 18) mouse.on = true;
  });
  function inputs() {
    var a = [], duo = race.humans === 2;
    if (!duo) {
      var kbSteer = (K.anyDown(['ArrowRight', 'KeyD']) ? 1 : 0) - (K.anyDown(['ArrowLeft', 'KeyA']) ? 1 : 0);
      if (kbSteer !== 0) { mouse.on = false; mouse.moved = 0; }
      var steer = kbSteer;
      if (kbSteer === 0 && mouse.on && race.runners[0]) {
        var targetX = ER.clamp((mouse.x / W - 0.5) * 2.15, -1, 1) * ER.HALF;
        var diffX = targetX - race.runners[0].x;
        steer = M.abs(diffX) < 0.08 ? 0 : ER.clamp(diffX * 1.25, -1, 1);
      }
      var hop = mouse.hop;
      mouse.hop = false;
      a.push({
        steer: steer,
        up: K.anyDown(['ArrowUp', 'KeyW']), down: K.anyDown(['ArrowDown', 'KeyS']),
        jump: K.anyPressed(['Space', 'Enter', 'NumpadEnter']) || hop
      });
    } else {
      a.push({ steer: (K.down('KeyD') ? 1 : 0) - (K.down('KeyA') ? 1 : 0), up: K.down('KeyW'), down: K.down('KeyS'), jump: K.anyPressed(['Space', 'KeyF', 'KeyG']) });
      a.push({ steer: (K.down('ArrowRight') ? 1 : 0) - (K.down('ArrowLeft') ? 1 : 0), up: K.down('ArrowUp'), down: K.down('ArrowDown'),
        jump: K.anyPressed(['Enter', 'NumpadEnter', 'Slash', 'Numpad0', 'ShiftRight', 'Period']) });
    }
    return a;
  }
  var lastInput = [null, null];
  function handleKeys() {
    var go = K.anyPressed(['Enter', 'NumpadEnter', 'Space']);
    if (screen === 'title') {
      if (go) play();
      else if (K.pressed('KeyT')) toggleDuo();
    } else if (screen === 'map') {
      if (go) { var n = ER.nextTrack(save); pick(n); }
      else if (K.pressed('Escape')) { J.back(); toTitle(); }
    } else if (screen === 'skins') {
      if (K.pressed('Escape')) closeSkins();
      else if (K.anyPressed(['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'])) { preview.row = 1 - preview.row; J.tap(); refreshSkins(); }
      else if (K.anyPressed(['ArrowLeft', 'KeyA'])) cycle(preview.row, -1);
      else if (K.anyPressed(['ArrowRight', 'KeyD'])) cycle(preview.row, 1);
      else if (go) {
        var own = preview.row === 0 ? save.ownR.indexOf(preview.r) >= 0 : save.ownE.indexOf(preview.e) >= 0;
        if (own) closeSkins(); else buy(preview.row);
      }
    } else if (screen === 'play') {
      if (K.anyPressed(['Escape', 'KeyP'])) pause();
    } else if (screen === 'pause') {
      if (K.anyPressed(['Escape', 'KeyP', 'Enter', 'NumpadEnter', 'Space'])) resume();
      else if (K.pressed('KeyR')) restart();
    } else if (screen === 'result' && lock <= 0) {
      if (go) next();
      else if (K.pressed('KeyR')) again();
      else if (K.pressed('Escape')) { J.back(); toMap(); }
    }
  }

  /* ------------------------------------------------------------ HUD */
  var dots = [], ticks = [], pops = [];
  function buildHud() {
    var duo = race.humans === 2, dotBox = $('dots'), tickBox = $('ticks');
    dotBox.innerHTML = ''; tickBox.innerHTML = ''; dots = [];
    race.track.cps.slice(1).forEach(function (s) { var t = document.createElement('i'); t.style.left = (480 * (1 - s / race.track.len)) + 'px'; tickBox.appendChild(t); });
    // CPU dots first so the players' sit on top.
    for (var k = race.runners.length - 1; k >= 0; k--) {
      var q = race.runners[k], d = document.createElement('i');
      d.className = q.human ? 'me' : 'cpu';
      d.style.background = q.human ? DOT[q.i] : ER.RUNNERS[q.skin].shirt;
      if (q.human) d.textContent = duo ? String(q.i + 1) : '';
      dotBox.appendChild(d);
      dots[k] = d;
    }
    $('place1').hidden = !duo; $('meter1').hidden = !duo; $('tag0').hidden = !duo; $('tag1').hidden = !duo; $('splitline').hidden = !duo;
    $('meter0').classList.toggle('duo', duo);
    $('hud').classList.toggle('duo', duo);
    $('place0').classList.toggle('duo', duo);
    $('count').hidden = true;
    $('hint0').hidden = true; $('hint1').hidden = true;
    hudCache = {};
  }
  var hudCache = {};
  function fmt(t) { var s = M.floor(t); return M.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function drawHud() {
    if (!race) return;
    var tr = race.track, n = race.runners.length;
    for (var k = 0; k < n; k++) {
      var q = race.runners[k];
      dots[k].style.transform = 'translateX(' + (480 * (1 - ER.progress(race, q))).toFixed(1) + 'px)';
    }
    for (var h = 0; h < race.humans; h++) {
      var r = race.runners[h], pl = $('place' + h);
      if (hudCache['p' + h] !== r.rank) {
        var bump = hudCache['p' + h] && r.rank < hudCache['p' + h];
        hudCache['p' + h] = r.rank;
        pl.querySelector('b').textContent = String(r.rank);
        pl.querySelector('small').textContent = '/' + n;
        pl.className = 'place p' + h + ' r' + r.rank + (race.humans === 2 && h === 0 ? ' duo' : '');
        if (bump && !calm()) { pl.classList.add('bump'); setTimeout(function (el) { el.classList.remove('bump'); }, 220, pl); }
      }
      var m = $('meter' + h), e = r.state === 'splat' ? (r.e > 0 ? 1.1 : -1.1) : ER.clamp(r.e, -1.1, 1.1);
      m.querySelector('.needle').style.transform = 'rotate(' + (e * 62).toFixed(1) + 'deg)';
      var crk = r.state === 'splat' ? 2 : (r.cracks || 0);
      if (hudCache['c' + h] !== crk) { hudCache['c' + h] = crk; m.dataset.cracks = String(crk); }
      var warn = M.abs(r.e) > 0.65 && r.state === 'run';
      if (hudCache['w' + h] !== warn) { hudCache['w' + h] = warn; m.classList.toggle('warn', warn); }
      // Light the key that brings the egg back (run under it).
      var kl = hintsOn && r.state === 'run' && r.e < -0.45, kr = hintsOn && r.state === 'run' && r.e > 0.45;
      if (hudCache['kl' + h] !== kl) { hudCache['kl' + h] = kl; m.querySelector('.kc.l').classList.toggle('on', kl); }
      if (hudCache['kr' + h] !== kr) { hudCache['kr' + h] = kr; m.querySelector('.kc.r').classList.toggle('on', kr); }
    }
    var gold = race.runners[0].gold + (race.humans === 2 ? race.runners[1].gold : 0);
    setText($('hudGold'), String(gold));
    setText($('hudTime'), fmt(race.t));
    hints();
    placePops();
  }
  // Countdown numbers.
  function showCount(n) {
    var el = $('count');
    el.hidden = false;
    el.className = 'count' + (n === 0 ? ' go' : '');
    el.textContent = n === 0 ? 'انطلق!' : String(n);
    Kit.retrigger(el, 'er-pop');
    clearTimeout(showCount.t);
    if (n === 0) showCount.t = setTimeout(function () { el.hidden = true; }, 650);
  }
  // Floating words over a runner's head.
  function pop(text, r, big, color) {
    if (pops.length > 6) { var old = pops.shift(); old.el.remove(); }
    var el = document.createElement('div');
    el.className = 'pop' + (big ? ' big' : '');
    if (color) el.style.color = color;
    el.textContent = text;
    $('pops').appendChild(el);
    var p = { el: el, r: r, t: 0 };
    pops.push(p);
    setTimeout(function () { el.remove(); var i = pops.indexOf(p); if (i >= 0) pops.splice(i, 1); }, 1100);
    placePop(p);
  }
  function placePop(p) {
    var q = race && race.runners[p.r];
    if (!q) return;
    var cam = race.humans === 2 ? p.r : 0, pt = view.project(q.s, q.x, 2.6 + q.y, cam);
    p.el.style.left = pt.x.toFixed(0) + 'px'; p.el.style.top = pt.y.toFixed(0) + 'px';
  }
  function placePops() { for (var i = 0; i < pops.length; i++) placePop(pops[i]); }
  function hidePops() { pops.forEach(function (p) { p.el.remove(); }); pops = []; }

  // Keycap hints over the runner: jump a hurdle, steer round something, balance.
  var hintKey = ['', ''];
  function hints() {
    for (var h = 0; h < race.humans; h++) {
      var r = race.runners[h], el = $('hint' + h), want = '';
      if (race.phase === 'race' && r.state === 'run' && !r.finished) {
        var tr = race.track, helped = r.trips;
        for (var k = 0; k < tr.items.length; k++) {
          var it = tr.items[k], ds = it.s - r.s;
          if (ds < 2 || ds > 15) continue;
          var ix = ER.itemX(it, race.t + ds / M.max(1, r.v));
          if (M.abs(ix - r.x) > it.hw + 0.5) continue;
          if (it.k === 'hurdle' && (hintsOn || (helped && helped[k]))) { want = 'jump'; break; }
          if (hintsOn && (it.k === 'cone' || it.k === 'ball' || it.k === 'sprinkler')) { want = ix > r.x || (ix === r.x && r.x < 0) ? (r.x > -2.5 ? 'left' : 'right') : (r.x < 2.5 ? 'right' : 'left'); break; }
        }
        if (!want && hintsOn && idle > 3 && race.t < 25) want = 'steer';
      }
      if (want !== hintKey[h]) {
        hintKey[h] = want;
        el.hidden = !want;
        var duo = race.humans === 2, jumpKey = duo ? (h === 0 ? 'مسافة' : 'Enter') : 'مسافة';
        var L = duo && h === 0 ? 'A' : '←', R = duo && h === 0 ? 'D' : '→';
        el.innerHTML = want === 'jump' ? '<kbd class="wide">' + jumpKey + '</kbd>' : want === 'left' ? '<kbd>' + L + '</kbd>' : want === 'right' ? '<kbd>' + R + '</kbd>' :
          want === 'steer' ? '<span dir="ltr"><kbd>' + L + '</kbd> <kbd>' + R + '</kbd></span>' : '';
      }
      if (want) {
        var pt = view.project(r.s, r.x, 3.1 + r.y, duo ? h : 0);
        el.style.left = pt.x.toFixed(0) + 'px'; el.style.top = pt.y.toFixed(0) + 'px';
      }
    }
  }

  /* ------------------------------------------------------------ sound */
  function cluck() { AU.tone({ freq: 900, to: 1400, type: 'square', dur: 0.06, vol: 0.06 }); AU.tone({ freq: 1100, to: 700, type: 'square', dur: 0.08, vol: 0.06, delay: 0.08 }); }
  function boing() { AU.tone({ freq: 160, to: 520, type: 'sine', dur: 0.25, vol: 0.18 }); }
  function crack() { AU.noise({ dur: 0.12, vol: 0.3, filter: 3500, to: 1500 }); AU.noise({ dur: 0.3, vol: 0.18, filter: 900, to: 200, delay: 0.05 }); J.pop(0.9); }
  function ohNo() { AU.tone({ freq: 520, to: 300, type: 'triangle', dur: 0.2, vol: 0.12, delay: 0.1 }); AU.tone({ freq: 400, to: 210, type: 'triangle', dur: 0.3, vol: 0.12, delay: 0.3 }); }
  function wobble() { AU.tone({ freq: 300, to: 420, type: 'sine', dur: 0.09, vol: 0.08 }); AU.tone({ freq: 420, to: 300, type: 'sine', dur: 0.09, vol: 0.08, delay: 0.09 }); }
  function splash() { AU.noise({ dur: 0.35, vol: 0.2, filter: 2200, to: 400 }); }

  /* ------------------------------------------------------------ events */
  function handleEvents() {
    var duo = race.humans === 2;
    for (var i = 0; i < race.ev.length; i++) {
      var e = race.ev[i], r = e.r != null ? race.runners[e.r] : null, me = r && r.human;
      view.event(e, race);
      switch (e.t) {
        case 'count': J.countdown(e.n); showCount(e.n); break;
        case 'jump': if (me) J.jump(0.5); break;
        case 'land': if (me) J.land(0.3); break;
        case 'pad': if (me) { Kit.track.hit(); J.whoosh(0.85); pop('تيربو! ⚡', e.r, false, '#4df5ff'); } break;
        case 'ramp': if (me) { Kit.track.hit(); J.jump(0.9); pop('طيران! 🚀', e.r, false, '#ffd23f'); } break;
        case 'coin': if (me) { Kit.track.hit(); J.coin(M.min(5, e.combo || 1)); } break;
        case 'heal': if (me) { J.chime(2); pop('درع جديد! 🥚', e.r, false, '#5ee36a'); } break;
        case 'clear': if (me) { Kit.track.hit(); J.streak(M.min(8, r.cleared)); if (r.cleared % 2 === 1) pop(PRAISE[r.cleared % PRAISE.length], e.r); } break;
        case 'hit':
          if (me) {
            Kit.track.miss();
            J.impact(0.6);
            Kit.hitstop(0.04);
            if (e.k === 'critter') cluck(); else if (e.k === 'ball') boing(); else if (e.k === 'sprinkler') splash();
            pop(e.crack === 1 ? 'شق! 🥚' : e.k === 'critter' ? 'كاك!' : e.k === 'ball' ? 'بونغ!' : 'بوينغ!', e.r, false, e.crack === 1 ? '#ffe066' : '#ffffff');
          }
          break;
        case 'splash': if (me) { splash(); pop('بلوب!', e.r, false, '#bdf0ff'); } break;
        case 'wobble': if (me) wobble(); break;
        case 'drop': if (me) { Kit.track.miss(); Kit.hitstop(0.05); J.whoosh(0.5); ohNo(); pop('أوه لا!', e.r, true, '#ffffff'); say('سقطت البيضة'); } break;
        case 'respawn': if (me) { J.pop(0.4); pop('بيضة جديدة!', e.r, false, '#fffaf0'); } break;
        case 'gold': if (me) { Kit.track.hit(); J.coin(1); pop('+1', e.r, true); } break;
        case 'cp': if (me) J.chime(1); break;
        case 'finish':
          if (me) {
            if (e.place === 1) J.levelUp(); else J.chime(2);
            pop(duo ? 'وصلت!' : PLACE[e.place], e.r, true);
          }
          break;
      }
    }
    race.ev.length = 0;
  }

  /* ------------------------------------------------------------ results */
  function finishRace() {
    var duo = race.humans === 2, r = race.runners[0];
    roundOpen = false;
    if (duo) {
      var a = race.runners[0], b = race.runners[1], win = a.place < b.place ? 0 : 1;
      Kit.stats.end('end');
      save.eggs += a.gold + b.gold; persist();
      result = { duo: true, win: win, stars: 0, time: race.runners[win].finishT, eggs: a.gold + b.gold, best: false, next: cur < 8 && ER.isOpen(save, cur + 1) };
    } else {
      var out = ER.record(save, cur, r);
      dda.result(ER.outcome(r));
      Kit.stats.end(r.place === 1 ? 'win' : 'lose', out.stars);
      if (!save.coach) { save.coach = true; Kit.stats.tutorial('done'); }
      persist();
      result = { duo: false, place: r.place, flags: ER.starFlags(r), stars: out.stars, time: r.finishT, eggs: out.reward, best: out.newBest, next: cur < 8 && ER.isOpen(save, cur + 1) };
    }
    showResult();
  }
  var starTimers = [];
  function showResult() {
    resultT = 0; lock = 0.6;
    $('resTitle').textContent = result.duo ? 'فاز اللاعب ' + (result.win + 1) + '!' : PLACE[result.place];
    $('resTitle').style.color = result.duo ? DOT[result.win] : result.place === 1 ? '#ffd23f' : '#ffffff';
    $('resStars').hidden = result.duo;
    var stars = $('resStars').querySelectorAll('.st');
    stars.forEach(function (s) { s.classList.remove('on'); });
    starTimers.forEach(clearTimeout); starTimers = [];
    if (!result.duo) result.flags.forEach(function (f, k) {
      if (!f) return;
      starTimers.push(setTimeout(function () { stars[k].classList.add('on'); J.star(k + 1); }, calm() ? 0 : 450 + k * 380));
    });
    $('resTime').textContent = fmt(result.time) + '.' + M.floor((result.time % 1) * 10);
    $('resEggs').textContent = '+' + result.eggs;
    $('resBest').hidden = !result.best;
    $('resNext').hidden = !result.next;
    if (result.best || (!result.duo && result.place === 1)) { view.confetti(); }
    say(result.duo ? $('resTitle').textContent : PLACE[result.place] + '، ' + result.stars + ' نجوم');
    setScreen('result');
    $('hud').hidden = true;
  }
  function next() {
    if (result && result.next) { J.select(); startRace(cur + 1); }
    else again();
  }
  function again() { J.select(); startRace(cur); }

  /* ----------------------------------------------------------------- loop */
  function update(dt) {
    if (screen !== 'pause') time += dt;
    handleKeys();
    if (screen === 'play' && race) {
      if (!Kit.hitstop.tick(dt)) {
        var inp = inputs();
        if (inp.some(function (x) { return x.steer || x.up || x.down || x.jump; })) idle = 0; else idle += dt;
        lastInput = inp;
        ER.step(race, dt, inp);
        handleEvents();
        if (race.over && race.overT > 1.4 && screen === 'play') finishRace();
      }
    } else if ((screen === 'title' || screen === 'map') && demo && demo.demo) {
      ER.step(demo, dt, []);
      demo.ev.length = 0;
      if (demo.runners[0] && demo.runners[0].s > demo.track.len - 26) {
        demo.runners.forEach(function (q, idx) { q.s = 6 + idx * 1.2; q.finished = false; q.state = 'run'; q.e = 0; q.ev = 0; q.cp = 0; });
        demo.coinsTaken = demo.track.coins.map(function () { return -1; });
        demo.goldTaken = demo.track.gold.map(function () { return -1; });
        view.snap();
      }
    } else if (screen === 'result') {
      resultT += dt; lock -= dt;
      if (race) { ER.step(race, dt, [{}, {}]); race.ev.length = 0; }
    }
    if (screen !== 'pause') dirty = true;
    K.endFrame();
  }

  function render() {
    if (!view || contextLost) return;
    var now = performance.now();
    if (screen === 'pause' && !dirty) return;
    // A software renderer rests between menu frames so the page stays responsive.
    if (software && screen !== 'play' && now - lastDraw < 90) return;
    if (screen === 'play' && lastFrame && view.frameTime(now - lastFrame)) fit.resize();
    lastFrame = now; lastDraw = now;
    var dt = M.max(0, M.min(0.1, time - viewTime));
    viewTime = time;
    view.calm = calm();
    var r = race || demo, mode = screen === 'play' || screen === 'pause' ? 'play' : screen === 'result' ? 'result' : screen === 'skins' ? 'skins' : 'title';
    var follow = race && race.humans === 2 && mode === 'play' ? [0, 1] : [0];
    var intro = race && race.phase === 'count' && mode === 'play' && !calm() ? M.max(0, 1 - race.clock / (ER.COUNTDOWN * 0.85)) : null;
    view.update({ mode: mode, dt: dt, t: time, race: r, follow: follow, intro: intro });
    view.render();
    if (screen === 'play' || screen === 'pause') drawHud();
    dirty = false;
  }

  /* ------------------------------------------------------------ buttons */
  on($('btnPlay'), play);
  on($('btnDuo'), toggleDuo);
  on($('btnSkins'), openSkins);
  on($('mapHome'), function () { J.back(); toTitle(); });
  on($('skinsBack'), closeSkins);
  on($('btnPause'), pause);
  on($('btnResume'), resume);
  on($('btnRestart'), restart);
  on($('btnHome'), function () { J.back(); toMap(); });
  on($('resNext'), next);
  on($('resAgain'), again);
  on($('resMap'), function () { J.back(); toMap(); });
  ['pickRunner', 'pickEgg'].forEach(function (id, row) {
    $(id).querySelectorAll('.er-arrow').forEach(function (b) { on(b, function () { cycle(row, +b.dataset.dir); }); });
    on($(id).querySelector('.buy'), function () { preview.row = row; buy(row); });
  });
  canvas.addEventListener('pointerdown', function (e) {
    focusGame();
    if (screen === 'play' && race && race.humans === 1 && race.phase === 'race' && e.button === 0) mouse.hop = true;
  });

  /* --------------------------------------------------- test and debug hook */
  var r3 = function (v) { return M.round(v * 1000) / 1000; };
  function runnerInfo(q) {
    return q ? { s: r3(q.s), x: r3(q.x), y: r3(q.y), v: r3(q.v), e: r3(q.e), lean: r3(q.lean), state: q.state, cracks: q.cracks || 0, coins: q.coins || 0, boost: r3(q.boost || 0),
      drops: q.drops, gold: q.gold, hits: q.hits, jumps: q.jumps, place: q.place, rank: q.rank || 0, finished: q.finished, cp: q.cp } : null;
  }
  function snapshot() {
    return {
      screen: screen, phase: race ? race.phase : '', track: race ? cur : -1, id: race ? race.track.id : '', duo: save.duo, humans: race ? race.humans : 0,
      time: race ? r3(race.t) : 0, clock: race ? r3(race.clock) : 0, over: !!(race && race.over), len: race ? race.track.len : 0,
      p1: race ? runnerInfo(race.runners[0]) : null, p2: race && race.humans === 2 ? runnerInfo(race.runners[1]) : null,
      cpus: race ? race.runners.filter(function (q) { return !q.human; }).map(runnerInfo) : [],
      result: result ? { place: result.place || 0, stars: result.stars, eggs: result.eggs, best: result.best, win: result.win } : null,
      hint: hintKey[0], calm: calm(), software: software, particles: view ? view.particleCount() : 0, tune: race ? race.tune : null
    };
  }

  /* ---------------------------------------------------------------- init */
  Kit.muteButton();
  Kit.lifecycle({ pause: pause, reset: function () { lastInput = [null, null]; } });
  Kit.motion.onChange(function () { dirty = true; });
  window.addEventListener('pageshow', function () { dirty = true; });
  Kit.webgl.watchContext(canvas, {
    notice: 'contextNotice',
    onLost: function () { contextLost = true; pause(); },
    onRestored: function () { contextLost = false; dirty = true; fit.resize(); }
  });
  var loop = null;
  try {
    view = ER.createView(canvas, { software: software });
    view.onSplat = function (i) { if (race && race.runners[i] && race.runners[i].human) { crack(); } };
    fit.resize();
    toTitle();
    window.__game = {
      get state() { return snapshot(); },
      get save() { return JSON.parse(JSON.stringify(save)); },
      get race() { return race; },
      point: function (x, y) { var r = canvas.getBoundingClientRect(); return { x: r.left + x * fit.scale, y: r.top + y * fit.scale }; },
      drawCalls: function () { return view.info().calls; }
    };
    loop = Kit.loop(update, render);
    Kit.ready();
  } catch (error) {
    if (loop) loop.stop();
    for (var k in SCREENS) $(SCREENS[k]).hidden = true;
    $('hud').hidden = true;
    $('scrError').hidden = false;
    Kit.fail(error);
  }
})();
