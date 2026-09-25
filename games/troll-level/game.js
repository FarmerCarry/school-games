/*
 * Sneaky Levels (المراحل الماكرة) — main controller: screens, input, save,
 * sounds, effects and rendering. Engine = engine.js, levels = levels.js,
 * drawing helpers = art.js.
 */
(function () {
  'use strict';
  var K = window.Kit, E = window.TrollEngine, LV = window.TrollLevels, Art = window.TrollArt;
  var LEVELS = LV.LEVELS, WORLDS = LV.WORLDS, PER = LV.PER_WORLD, N = LEVELS.length, MAXSTARS = N * 3;
  var T = E.T, PH = E.PH, FONT = Art.FONT;
  var $ = function (id) { return document.getElementById(id); };

  /* ================================================================ save */
  var store = K.store('troll-level');
  function arr(v) { var a = Array.isArray(v) ? v.slice(0, N) : []; while (a.length < N) a.push(null); return a; }
  var save = {
    best: arr(store.get('best', [])),       // fewest deaths per level (null = not beaten)
    stars: arr(store.get('stars', [])),     // best stars per level
    total: +store.get('total', 0) || 0,      // all deaths ever
    unl: Math.max(0, Math.min(N - 1, +store.get('unl', 0) || 0)), // highest unlocked level index
    skin: store.get('skin', 'blob'),
    last: Math.max(0, Math.min(N - 1, +store.get('last', 0) || 0)),
    ended: !!store.get('ended', false)
  };
  function persist() {
    store.set('best', save.best); store.set('stars', save.stars); store.set('total', save.total);
    store.set('unl', save.unl); store.set('skin', save.skin); store.set('last', save.last); store.set('ended', save.ended);
  }
  function starCount() { var s = 0; for (var i = 0; i < N; i++) s += save.stars[i] || 0; return s; }
  function doneCount() { var s = 0; for (var i = 0; i < N; i++) if (save.best[i] != null) s++; return s; }
  function skinUnlocked(sk) { return starCount() >= sk.stars; }
  if (!skinUnlocked(Art.skinById(save.skin))) save.skin = 'blob';

  /* ============================================================== canvas */
  var cv = $('cv'), ui = $('ui');
  var staticDirty = true;
  var view = K.fit(cv, 1280, 720, {
    onResize: function (v) {
      ui.style.transform = 'translate(' + cv.style.left + ',' + cv.style.top + ') scale(' + v.scale + ')';
      staticDirty = true;
    }
  });
  var ctx = view.ctx;
  var fx = K.particles(), shake = K.shake();

  /* ============================================================== sounds */
  var A = K.audio;
  var S = {
    jump: function () { A.tone({ freq: 320, to: 760, type: 'square', dur: 0.11, vol: 0.13 }); },
    land: function (v) { A.tone({ freq: 170, to: 70, type: 'triangle', dur: 0.08, vol: Math.min(0.3, 0.08 + v / 4000) }); },
    splat: function () {
      A.noise({ dur: 0.28, vol: 0.4, filter: 2400, to: 200 });
      A.tone({ freq: 520, to: 90, type: 'sawtooth', dur: 0.25, vol: 0.16 });
      A.tone({ freq: 140, to: 50, type: 'sine', dur: 0.3, vol: 0.3 });
    },
    respawn: function () { A.tone({ freq: 420, to: 900, type: 'sine', dur: 0.1, vol: 0.14 }); },
    shing: function () {
      A.tone({ freq: 1500, to: 2600, type: 'square', dur: 0.06, vol: 0.07 });
      A.noise({ dur: 0.08, vol: 0.18, filter: 7000, to: 3000 });
    },
    rumble: function () { A.noise({ dur: 0.35, vol: 0.2, filter: 300, to: 120 }); },
    thud: function () { A.noise({ dur: 0.35, vol: 0.45, filter: 900, to: 60 }); A.tone({ freq: 110, to: 40, type: 'sine', dur: 0.25, vol: 0.35 }); },
    crack: function () { A.noise({ dur: 0.09, vol: 0.22, filter: 3500, to: 800 }); A.tone({ freq: 240, to: 120, type: 'square', dur: 0.05, vol: 0.06 }); },
    giggle: function () {
      [880, 1175, 988, 1319].forEach(function (f, i) { A.tone({ freq: f, to: f * 1.12, type: 'triangle', dur: 0.07, vol: 0.12, delay: i * 0.07 }); });
      A.noise({ dur: 0.25, vol: 0.12, filter: 3000, to: 500 });
    },
    buzz: function () { A.tone({ freq: 90, to: 150, type: 'sawtooth', dur: 0.45, vol: 0.13 }); A.tone({ freq: 180, to: 300, type: 'sawtooth', dur: 0.45, vol: 0.06 }); },
    flip: function (up) { A.tone({ freq: up ? 250 : 900, to: up ? 900 : 250, type: 'sine', dur: 0.22, vol: 0.2 }); A.tone({ freq: up ? 500 : 1800, to: up ? 1800 : 500, type: 'triangle', dur: 0.22, vol: 0.06 }); },
    wobble: function () { [0, 1, 2, 3].forEach(function (i) { A.tone({ freq: i % 2 ? 500 : 350, to: i % 2 ? 350 : 500, type: 'sine', dur: 0.1, vol: 0.15, delay: i * 0.09 }); }); },
    boing: function () { A.tone({ freq: 180, to: 760, type: 'sine', dur: 0.18, vol: 0.28 }); A.tone({ freq: 760, to: 420, type: 'sine', dur: 0.14, vol: 0.14, delay: 0.16 }); },
    bonk: function () { A.tone({ freq: 300, to: 120, type: 'square', dur: 0.07, vol: 0.12 }); },
    sparkle: function () { [1319, 1568, 2093].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.1, vol: 0.12, delay: i * 0.06 }); }); },
    raspberry: function () { A.tone({ freq: 110, to: 70, type: 'sawtooth', dur: 0.45, vol: 0.2 }); A.tone({ freq: 116, to: 74, type: 'square', dur: 0.45, vol: 0.08 }); },
    elevator: function () { A.tone({ freq: 200, to: 420, type: 'triangle', dur: 0.6, vol: 0.12 }); },
    whoosh: function () { A.noise({ dur: 0.22, vol: 0.14, filter: 2500, to: 400 }); },
    poof: function () { A.noise({ dur: 0.2, vol: 0.2, filter: 1600, to: 300 }); A.tone({ freq: 600, to: 200, type: 'sine', dur: 0.12, vol: 0.12 }); },
    win: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { A.tone({ freq: f, type: 'square', dur: 0.12, vol: 0.12, delay: i * 0.075 }); A.tone({ freq: f / 2, type: 'triangle', dur: 0.14, vol: 0.18, delay: i * 0.075 }); }); },
    star: function (i) { A.tone({ freq: [784, 988, 1319][i], to: [1175, 1480, 1976][i], type: 'square', dur: 0.14, vol: 0.14 }); A.tone({ freq: [1568, 1976, 2637][i], type: 'triangle', dur: 0.2, vol: 0.08, delay: 0.06 }); },
    cheer: function () { [659, 784, 988, 1319, 988, 1319, 1568].forEach(function (f, i) { A.tone({ freq: f, type: 'triangle', dur: 0.15, vol: 0.2, delay: i * 0.09 }); }); },
    click: function () { A.tone({ freq: 700, to: 900, type: 'square', dur: 0.05, vol: 0.1 }); },
    nope: function () { A.tone({ freq: 220, to: 160, type: 'square', dur: 0.12, vol: 0.12 }); A.tone({ freq: 180, to: 120, type: 'square', dur: 0.14, vol: 0.12, delay: 0.1 }); }
  };

  /* ============================================================== text */
  var TAUNT = [
    'هاها! لم تتوقع هذا!', 'أوبس!', 'مرة أخرى؟', 'الفخ يضحك عليك!', 'تقريبًا... تقريبًا!',
    'المرحلة 1 - أنت 0', 'لا تستسلم!', 'هل رأيت الفخ الآن؟', 'ركّز يا بطل!', 'كان ذلك مضحكًا!',
    'حاول مرة أخرى!', 'المرحلة ماكرة جدًا!'
  ];
  var CAUSE = {
    spike: ['آخ! شوكة!', 'من أين جاء هذا الشوك؟!', 'الشوك يحب المفاجآت!'],
    fall: ['إلى الأسفل... بعيدًا!', 'وداعًا يا أرض!', 'سقطة كبيرة!'],
    crush: ['صرت فطيرة!', 'طاخ! مثل الفطيرة!', 'انتبه لرأسك!'],
    saw: ['المنشار كان جائعًا!', 'زززز! أمسكك المنشار!'],
    door: ['هذا ليس بابًا!', 'باب مزيف! هاها!']
  };
  var WIN_TITLES = ['أحسنت!', 'رائع!', 'نجوت!', 'ممتاز!', 'يا سلام!', 'بطل!'];
  var WIN_SUBS = ['لقد كشفت الخدعة!', 'المرحلة لم تستطع خداعك!', 'عقلك أذكى من الفخاخ!', 'هل أنت ساحر؟'];
  var HINT_AFTER = 3, SKIP_AFTER = 10;

  /* ============================================================== screens */
  var SCREENS = ['scr-title', 'scr-select', 'scr-skins', 'scr-pause', 'scr-win', 'scr-end'];
  var mode = 'title', guardT = 0;
  function show(id) {
    SCREENS.forEach(function (s) { $(s).hidden = s !== id; });
    $('btn-pause').hidden = id !== null;
    guardT = 0.25;
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* */ }
  }

  function goTitle() {
    mode = 'title'; show('scr-title'); refreshTitle(); startDemo();
  }
  function refreshTitle() {
    $('t-stars').textContent = starCount();
    $('t-stars-max').textContent = '/' + MAXSTARS;
    $('t-levels').textContent = doneCount() + '/' + N;
    $('t-deaths').textContent = K.fmt(save.total);
    $('btn-play').textContent = doneCount() > 0 && doneCount() < N ? 'تابع!' : 'العب!';
  }
  function playTarget() {
    if (doneCount() >= N) return save.last;
    for (var i = 0; i <= save.unl; i++) if (save.best[i] == null) return i;
    return Math.min(save.unl, N - 1);
  }

  /* ----------------------------------------------------- level select */
  var selIdx = 0;
  function goSelect() {
    mode = 'select'; show('scr-select');
    selIdx = Math.min(save.last, save.unl);
    buildSelect();
    if (!game.demo) startDemo();
  }
  function buildSelect() {
    var box = $('worlds'); box.innerHTML = '';
    $('s-stars').textContent = starCount(); $('s-stars-max').textContent = MAXSTARS;
    for (var w = 0; w < WORLDS.length; w++) {
      var pal = WORLDS[w];
      var row = document.createElement('div'); row.className = 'wrow';
      var lab = document.createElement('div'); lab.className = 'wlabel';
      lab.style.background = pal.bg; lab.style.color = pal.ink; lab.style.borderColor = pal.ink;
      var ws = 0; for (var q = w * PER; q < (w + 1) * PER; q++) ws += save.stars[q] || 0;
      lab.innerHTML = '<span></span><small></small>';
      lab.firstChild.textContent = pal.name;
      lab.lastChild.textContent = '★ ' + ws + '/' + (PER * 3);
      row.appendChild(lab);
      for (var k = 0; k < PER; k++) row.appendChild(levelTile(w * PER + k, pal));
      box.appendChild(row);
    }
    markSel();
  }
  function levelTile(i, pal) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'lv'; b.dataset.i = i;
    var locked = i > save.unl;
    b.style.background = pal.bg; b.style.color = pal.ink; b.style.borderColor = pal.ink;
    if (locked) {
      b.classList.add('locked');
      b.innerHTML = '<span class="num">🔒</span><span class="best">' + (i + 1) + '</span>';
    } else {
      var st = save.stars[i] || 0, s = '';
      for (var k = 0; k < 3; k++) s += '<i class="' + (k < st ? 'on' : '') + '">★</i>';
      var best = save.best[i];
      b.innerHTML = '<span class="num">' + (i + 1) + '</span><span class="stars">' + s + '</span>' +
        '<span class="best">' + (best == null ? 'لم تُحل بعد' : 'أقل سقطات: ' + best) + '</span>' +
        (best == null ? '<span class="new">جديد!</span>' : '');
    }
    b.addEventListener('click', function () {
      if (locked) { S.nope(); b.animate([{ translate: '-6px 0' }, { translate: '6px 0' }, { translate: '0 0' }], { duration: 200 }); return; }
      S.click(); startLevel(i);
    });
    b.addEventListener('mouseenter', function () { if (!locked) { selIdx = i; markSel(); } });
    return b;
  }
  function markSel() {
    var list = document.querySelectorAll('#worlds .lv');
    for (var i = 0; i < list.length; i++) list[i].classList.toggle('focus', +list[i].dataset.i === selIdx);
  }

  /* ----------------------------------------------------- skins */
  function goSkins() {
    mode = 'skins'; show('scr-skins');
    $('k-stars').textContent = starCount();
    var box = $('skins'); box.innerHTML = '';
    Art.SKINS.forEach(function (sk) {
      var d = document.createElement('div'); d.className = 'skin';
      var un = skinUnlocked(sk);
      if (!un) d.classList.add('locked');
      if (sk.id === save.skin) d.classList.add('sel');
      var c = document.createElement('canvas'); c.width = 130; c.height = 130;
      var g = c.getContext('2d');
      g.fillStyle = un ? '#ffa41b' : '#8f7fa6'; g.fillRect(0, 0, 130, 130);
      g.fillStyle = '#1c1226'; g.fillRect(0, 112, 130, 18);
      if (un) Art.drawPlayer(g, 65, 112, { skin: sk.id, face: 1, t: 0.4, scale: 1.75, ink: '#1c1226' });
      else {
        // mystery silhouette with a question mark
        var tmp = document.createElement('canvas'); tmp.width = 130; tmp.height = 130;
        var tg = tmp.getContext('2d');
        Art.drawPlayer(tg, 65, 112, { skin: sk.id, face: 1, t: 0.4, scale: 1.75, ink: '#1c1226' });
        tg.globalCompositeOperation = 'source-in'; tg.fillStyle = '#3a2d4f'; tg.fillRect(0, 0, 130, 130);
        g.drawImage(tmp, 0, 0);
        g.font = '700 46px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'ltr';
        g.fillStyle = '#ffe14d'; g.fillText('?', 65, 76);
      }
      d.appendChild(c);
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = sk.name; d.appendChild(nm);
      var rq = document.createElement('div'); rq.className = 'req';
      rq.textContent = un ? (sk.id === save.skin ? 'مختار ✔' : 'اختر') : 'اجمع ' + sk.stars + ' ★';
      d.appendChild(rq);
      d.addEventListener('click', function () {
        if (!un) { S.nope(); d.animate([{ translate: '-6px 0' }, { translate: '6px 0' }, { translate: '0 0' }], { duration: 200 }); return; }
        save.skin = sk.id; persist(); S.sparkle(); goSkins();
      });
      box.appendChild(d);
    });
  }

  /* ============================================================== game state */
  var game = {
    world: null, demo: false, li: 0, pal: WORLDS[0], deaths: 0, t: 0, winT: -1, deadT: 0,
    vis: { sx: 1, sy: 1, sc: 1, blink: 0 }, msg: null, msgT: 0, introT: 0, flash: 0, flashC: '#fff',
    marks: [], staticC: null, staticFor: null, auto: null, autoF: 0, prevJ: false,
    botInputs: null, botF: 0, demoWait: 0, revLabelT: 0
  };

  function makeWorld(def, demo) {
    var w = new E.World(def, { emit: function (type, d) { onEvent(type, d, demo); } });
    return w;
  }

  function startLevel(i) {
    i = Math.max(0, Math.min(N - 1, i));
    game.li = i; game.demo = false;
    game.pal = WORLDS[Math.floor(i / PER)];
    game.deaths = 0; game.marks.length = 0; game.winT = -1; game.auto = null;
    game.msg = null; game.msgT = 0; game.introT = 2.2; game.flash = 0;
    fx.clear();
    game.world = makeWorld(LEVELS[i], false);
    game.staticFor = null;
    save.last = i; persist();
    mode = 'play'; show(null);
    game.vis.sc = 0.3; S.respawn();
    if (LEVELS[i].msg) say(LEVELS[i].msg, 3);
    K.keys.reset();
    try { cv.focus(); } catch (e) { /* */ }
  }

  function startDemo() {
    game.demo = true; game.pal = WORLDS[0]; game.winT = -1; game.marks.length = 0;
    game.world = makeWorld(LV.DEMO, true);
    game.staticFor = null; game.msg = null;
    game.botInputs = E.parseInputs(LV.DEMO.bots[0]); game.botF = 0; game.demoWait = 1.0;
    fx.clear();
  }

  function say(text, dur) { game.msg = text; game.msgT = dur || 1.8; }

  /* ============================================================== events */
  function onEvent(type, d, demo) {
    var w = game.world, pal = game.pal;
    if (demo && !game.demo) return;
    var loud = !demo;
    switch (type) {
      case 'jump':
        game.vis.sx = 0.72; game.vis.sy = 1.32;
        fx.burst(d.x, d.y, { count: 5, color: '#ffffff', speed: 90, life: 0.3, size: 5, gravity: -80 });
        if (loud) S.jump();
        break;
      case 'land':
        if (d.v > 250) {
          var k = Math.min(1, d.v / 1000);
          game.vis.sx = 1 + 0.4 * k; game.vis.sy = 1 - 0.34 * k;
          fx.burst(d.x, d.y, { count: 6, color: '#ffffff', speed: 120, life: 0.3, size: 5, gravity: 0, angle: -Math.PI / 2 * w.gs, spread: Math.PI * 1.2 });
          if (loud) S.land(d.v);
        }
        break;
      case 'step':
        fx.burst(d.x, d.y, { count: 1, color: '#ffffff', speed: 40, life: 0.25, size: 4, gravity: -60 });
        break;
      case 'die':
        if (!demo) {
          game.deaths++; save.total++; persist();
          var pool = Math.random() < 0.55 && CAUSE[d.cause] ? CAUSE[d.cause] : TAUNT;
          var m = K.pick(pool);
          if (game.deaths === 5) m = '5 سقطات! المرحلة تضحك عليك!';
          else if (game.deaths === 10) m = '10 سقطات! لا تستسلم يا بطل!';
          else if (game.deaths === HINT_AFTER) m = 'خذ تلميحًا... انظر للأسفل!';
          say(m, 1.7);
          if (game.marks.length > 40) game.marks.shift();
          game.marks.push({ x: d.x, y: d.y });
          S.splat();
        } else say(K.pick(TAUNT), 1.3);
        var skin = Art.skinById(save.skin);
        fx.burst(d.x, d.y, { count: 22, colors: [skin.body, pal.ink, '#ffffff'], speed: 420, life: 0.7, size: 9, gravity: 900 });
        fx.burst(d.x, d.y, { count: 10, color: '#ff4d6d', speed: 260, life: 0.5, size: 6, gravity: 400 });
        shake.add(demo ? 5 : 11);
        game.flash = 0.35; game.flashC = '#ffffff';
        break;
      case 'respawn':
        game.vis.sc = 0.2; game.vis.sx = 1; game.vis.sy = 1;
        var p = w.p;
        fx.burst(p.x + PH.w / 2, p.y + PH.h / 2, { count: 10, color: '#ffffff', speed: 160, life: 0.35, size: 6, gravity: 0 });
        if (loud) S.respawn();
        if (demo) {
          var bi = Math.min(w.attempt, LV.DEMO.bots.length - 1);
          game.botInputs = E.parseInputs(LV.DEMO.bots[bi]); game.botF = 0;
        } else if (game.auto) { game.auto = null; }
        break;
      case 'pop':
        shake.add(3);
        fx.burst(d.x, d.y, { count: 6, color: pal.ink, speed: 150, life: 0.3, size: 5 });
        if (loud) S.shing();
        break;
      case 'drop':
        if (loud) { if (d.delay > 0.02) S.rumble(); else S.whoosh(); }
        break;
      case 'thud':
        shake.add(demo ? 3 : 8);
        dustUnder(d.g);
        if (loud) S.thud();
        break;
      case 'crumble':
        crumbs(d.g, 5);
        if (loud) S.crack();
        break;
      case 'poof':
        crumbs(d.g, 3);
        if (loud) S.poof();
        break;
      case 'doormove':
        if (loud) S.giggle();
        break;
      case 'saw':
        if (loud) S.buzz();
        break;
      case 'flip':
        shake.add(4); game.flash = 0.25; game.flashC = pal.bg2;
        if (loud) S.flip(d.gs < 0);
        break;
      case 'reverse':
        game.revLabelT = d.t;
        say('التحكم انقلب! ← صار →', 1.6);
        if (loud) S.wobble();
        break;
      case 'msg':
        say(d.text, 2);
        break;
      case 'shake':
        shake.add(d.a);
        break;
      case 'sfx':
        if (loud) { if (d.name === 'slam') S.thud(); else if (d.name === 'elevator') S.elevator(); }
        break;
      case 'bonk':
        fx.burst(d.x, d.y, { count: 5, color: '#ffe14d', speed: 140, life: 0.35, size: 5, gravity: 200 });
        if (loud) S.bonk();
        break;
      case 'spring':
        shake.add(3);
        game.vis.sx = 0.6; game.vis.sy = 1.45;
        fx.burst(d.x, d.y, { count: 8, color: '#ff4d6d', speed: 200, life: 0.4, size: 6 });
        if (loud) S.boing();
        break;
      case 'reveal':
        d.g.rects(function (rx, ry) { fx.burst(rx + T / 2, ry + T / 2, { count: 4, color: '#ffffff', speed: 120, life: 0.45, size: 5, gravity: -100 }); });
        if (loud) S.sparkle();
        break;
      case 'fakedoor':
        if (loud) S.raspberry();
        break;
      case 'win':
        game.winT = 0;
        var dx = d.d.x + (d.d.g ? d.d.g.ox : 0) + 20, dy = d.d.y + (d.d.g ? d.d.g.oy : 0) + 30;
        fx.burst(dx, dy, { count: 40, colors: ['#ffe14d', '#ff4d6d', '#3fe0c5', '#ffffff', '#8b5cf6'], speed: 520, life: 1.1, size: 9, gravity: 700 });
        shake.add(4);
        if (loud) S.win();
        break;
    }
  }
  function dustUnder(g) {
    if (!g) return;
    var maxY = -1e9; g.rects(function (rx, ry) { maxY = Math.max(maxY, ry); });
    g.rects(function (rx, ry) {
      if (ry === maxY) fx.burst(rx + T / 2, ry + T, { count: 4, color: '#ffffff', speed: 160, life: 0.4, size: 7, gravity: 100, angle: -Math.PI / 2, spread: Math.PI });
    });
  }
  function crumbs(g, n) {
    if (!g) return;
    var pal = game.pal;
    g.rects(function (rx, ry) { fx.burst(rx + T / 2, ry + T / 2, { count: n, colors: [pal.ink, pal.ink2], speed: 160, life: 0.6, size: 8, gravity: 1100 }); });
  }

  /* ============================================================== win flow */
  function levelWon() {
    var i = game.li, d = game.deaths;
    var stars = d === 0 ? 3 : d <= 3 ? 2 : 1;
    var starsBefore = starCount();
    var prev = save.best[i];
    var newBest = prev != null && d < prev;
    var first = prev == null;
    if (prev == null || d < prev) save.best[i] = d;
    save.stars[i] = Math.max(save.stars[i] || 0, stars);
    var unlockedNext = false;
    if (i + 1 < N && save.unl < i + 1) { save.unl = i + 1; unlockedNext = true; }
    persist();
    var starsAfter = starCount();

    mode = 'win'; show('scr-win');
    $('w-lvl').textContent = WORLDS[Math.floor(i / PER)].name + ' · المرحلة ' + (i + 1);
    $('w-title').textContent = K.pick(WIN_TITLES);
    $('w-sub').textContent = LEVELS[i].winMsg || (d === 0 ? 'بلا أي سقطة! مذهل!' : K.pick(WIN_SUBS));
    $('w-deaths').textContent = d;
    $('w-best').textContent = save.best[i];
    $('w-newbest').hidden = !newBest;
    var un = [];
    Art.SKINS.forEach(function (sk) { if (sk.stars > starsBefore && sk.stars <= starsAfter) un.push('شخصية جديدة: ' + sk.name + '!'); });
    if (unlockedNext && (i + 1) % PER === 0) un.unshift('فتحت ' + WORLDS[(i + 1) / PER].name + '!');
    $('w-unlock').hidden = !un.length;
    $('w-unlock').textContent = un.join(' · ');
    var last = i === N - 1;
    $('btn-next').textContent = last ? 'النهاية!' : 'التالي';
    for (var k = 0; k < 3; k++) {
      var el = $('st' + (k + 1));
      el.classList.remove('on');
      void el.offsetWidth;
      if (k < stars) {
        (function (el, k) {
          setTimeout(function () { if (mode === 'win') { el.classList.add('on'); S.star(k); } }, 250 + k * 280);
        })(el, k);
      }
    }
    if (newBest || un.length) setTimeout(function () { if (mode === 'win') S.cheer(); }, 1100);
    guardT = 0.55;
  }
  function nextLevel() {
    if (game.li >= N - 1) { goEnd(); return; }
    startLevel(game.li + 1);
  }
  function goEnd() {
    mode = 'end'; show('scr-end');
    save.ended = true; persist();
    $('e-stars').textContent = starCount() + '/' + MAXSTARS;
    $('e-deaths').textContent = K.fmt(save.total);
    $('e-tip').textContent = starCount() >= MAXSTARS ? 'جمعت كل النجوم! أنت أمهر لاعب في المدرسة!' : 'عُد واجمع 3 نجوم في كل مرحلة لتفتح كل الشخصيات!';
    S.cheer();
    for (var i = 0; i < 6; i++) fx.burst(200 + i * 180, 200, { count: 20, colors: ['#ffe14d', '#ff4d6d', '#3fe0c5', '#ffffff'], speed: 500, life: 1.4, size: 9, gravity: 600 });
  }

  /* ----------------------------------------------------- pause */
  function pause() {
    if (mode !== 'play' || game.winT >= 0) return;
    mode = 'pause'; show('scr-pause');
    $('p-info').textContent = 'المرحلة ' + (game.li + 1) + ': ' + LEVELS[game.li].name + ' · السقطات: ' + game.deaths;
    $('btn-skip').hidden = !(game.deaths >= SKIP_AFTER && game.li < N - 1);
    S.click();
    guardT = 0.08; // a quick second P/Esc should resume right away
  }
  function resume() { if (mode !== 'pause') return; mode = 'play'; show(null); K.keys.reset(); S.click(); }
  function restart() {
    if (!game.world || game.demo) return;
    game.world.reset(); game.vis.sc = 0.3; game.winT = -1;
    mode = 'play'; show(null); S.respawn(); K.keys.reset();
  }
  function skipLevel() {
    if (game.li + 1 < N && save.unl < game.li + 1) { save.unl = game.li + 1; persist(); }
    startLevel(game.li + 1);
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden && mode === 'play') pause(); });

  /* ----------------------------------------------------- buttons */
  function on(id, fn) {
    $(id).addEventListener('click', function (e) { e.stopPropagation(); K.audio.unlock(); fn(); });
  }
  on('btn-play', function () { S.click(); startLevel(playTarget()); });
  on('btn-levels', function () { S.click(); goSelect(); });
  on('btn-skins', function () { S.click(); goSkins(); });
  on('btn-sel-back', function () { S.click(); goTitle(); });
  on('btn-skin-back', function () { S.click(); goTitle(); });
  on('btn-resume', resume);
  on('btn-restart', function () { S.click(); restart(); });
  on('btn-p-levels', function () { S.click(); goSelect(); });
  on('btn-p-menu', function () { S.click(); goTitle(); });
  on('btn-skip', function () { S.click(); skipLevel(); });
  on('btn-next', function () { S.click(); nextLevel(); });
  on('btn-replay', function () { S.click(); startLevel(game.li); });
  on('btn-w-levels', function () { S.click(); goSelect(); });
  on('btn-e-levels', function () { S.click(); goSelect(); });
  on('btn-e-menu', function () { S.click(); goTitle(); });
  on('btn-pause', pause);
  // Enter on a focused button must not fire twice (button click + our key handler).
  window.addEventListener('keydown', function (e) {
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && e.target && e.target.tagName === 'BUTTON') e.preventDefault();
  }, true);
  var muteBtn = K.muteButton();
  muteBtn.title = 'الصوت (M)';

  /* ============================================================== input */
  var KL = ['ArrowLeft', 'KeyA'], KR = ['ArrowRight', 'KeyD'], KJ = ['ArrowUp', 'KeyW', 'Space'];
  var KOK = ['Enter', 'NumpadEnter', 'Space'];
  function menuKeys() {
    var kk = K.keys;
    if (guardT > 0) return;
    if (mode === 'title') {
      if (kk.anyPressed(KOK)) { S.click(); startLevel(playTarget()); }
      else if (kk.pressed('KeyL')) { S.click(); goSelect(); }
    } else if (mode === 'select') {
      var w = Math.floor(selIdx / PER), c = selIdx % PER, moved = false;
      if (kk.anyPressed(['ArrowLeft', 'KeyA'])) { c = Math.min(PER - 1, c + 1); moved = true; }   // RTL: left = next
      if (kk.anyPressed(['ArrowRight', 'KeyD'])) { c = Math.max(0, c - 1); moved = true; }
      if (kk.anyPressed(['ArrowUp', 'KeyW'])) { w = Math.max(0, w - 1); moved = true; }
      if (kk.anyPressed(['ArrowDown', 'KeyS'])) { w = Math.min(WORLDS.length - 1, w + 1); moved = true; }
      if (moved) {
        var ni = w * PER + c;
        if (ni <= save.unl) { selIdx = ni; markSel(); S.click(); } else S.nope();
      }
      if (kk.anyPressed(KOK)) { S.click(); startLevel(selIdx); }
      if (kk.pressed('Escape')) { S.click(); goTitle(); }
    } else if (mode === 'skins') {
      if (kk.anyPressed(['Escape', 'Enter'])) { S.click(); goTitle(); }
    } else if (mode === 'pause') {
      if (kk.anyPressed(['KeyP', 'Escape'])) resume();
      else if (kk.pressed('KeyR')) restart();
      else if (kk.anyPressed(['Enter', 'NumpadEnter'])) resume();
    } else if (mode === 'win') {
      if (kk.anyPressed(KOK)) { S.click(); nextLevel(); }
      else if (kk.pressed('KeyR')) { S.click(); startLevel(game.li); }
      else if (kk.pressed('Escape')) { S.click(); goSelect(); }
    } else if (mode === 'end') {
      if (kk.anyPressed(KOK) || kk.pressed('Escape')) { S.click(); goTitle(); }
    }
  }

  /* ============================================================== update */
  function update(dt) {
    var kk = K.keys;
    game.t += dt;
    if (guardT > 0) guardT -= dt;
    menuKeys();
    var w = game.world;

    if (mode === 'play' && w) {
      if (kk.anyPressed(['KeyP', 'Escape'])) { pause(); kk.endFrame(); return; }
      if (kk.pressed('KeyR') && game.winT < 0) restart();
      var inp;
      if (game.auto) {
        var a = game.auto[game.autoF++] || '_';
        var j = a.indexOf('J') >= 0;
        inp = { l: a.indexOf('L') >= 0, r: a.indexOf('R') >= 0, jh: j, jp: j && !game.prevJ };
        game.prevJ = j;
      } else {
        inp = { l: kk.anyDown(KL), r: kk.anyDown(KR), jh: kk.anyDown(KJ), jp: kk.anyPressed(KJ) };
      }
      w.step(inp);
      if (game.winT >= 0) {
        game.winT += dt;
        if (game.winT > 0.9 && mode === 'play') levelWon();
      }
    } else if (game.demo && w && (mode === 'title' || mode === 'select' || mode === 'skins')) {
      if (game.demoWait > 0) game.demoWait -= dt;
      else {
        var b = game.botInputs[game.botF++] || 'R';
        var jj = b.indexOf('J') >= 0;
        w.step({ l: b.indexOf('L') >= 0, r: b.indexOf('R') >= 0, jh: jj, jp: jj && !game.prevJ });
        game.prevJ = jj;
        if (game.winT >= 0) { game.winT += dt; if (game.winT > 1.6) startDemo(); }
      }
    } else if (mode === 'win' || mode === 'end') {
      if (w) w.step({});
    }

    // visuals
    var v = game.vis, e = Math.min(1, dt * 12);
    v.sx += (1 - v.sx) * e; v.sy += (1 - v.sy) * e; v.sc += (1 - v.sc) * Math.min(1, dt * 16);
    v.blink -= dt; if (v.blink < -3) v.blink = 0.12 + Math.random() * 0.4;
    if (game.msgT > 0) game.msgT -= dt;
    if (game.introT > 0) game.introT -= dt;
    if (game.flash > 0) game.flash -= dt;
    if (game.revLabelT > 0) game.revLabelT -= dt;
    fx.update(dt); shake.update(dt);
    kk.endFrame();
  }

  /* ============================================================== render */
  function txt(s, x, y, size, color, align, o) {
    o = o || {};
    ctx.font = (o.w || 700) + ' ' + size + 'px ' + FONT;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.direction = o.ltr ? 'ltr' : 'rtl';
    if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = o.lw || 6; ctx.strokeStyle = o.stroke; ctx.strokeText(s, x, y); }
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  function tw(s, size, w) { ctx.font = (w || 700) + ' ' + size + 'px ' + FONT; ctx.direction = 'rtl'; return ctx.measureText(s).width; }

  function ensureStatic() {
    var w = game.world;
    var key = (game.demo ? 'demo' : game.li) + ':' + view.scale.toFixed(3);
    if (!staticDirty && game.staticFor === key && game.staticC) return;
    var res = Math.min(2, Math.max(0.5, view.scale * view.dpr));
    game.staticC = Art.buildStatic(w, game.pal, res);
    game.staticFor = key; staticDirty = false;
  }

  function drawWorld() {
    var w = game.world, pal = game.pal, t = game.t;
    ensureStatic();
    ctx.drawImage(game.staticC, 0, 0, E.W, E.H);
    // death marks (this session)
    if (game.marks.length) {
      ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = pal.ink; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (var i = 0; i < game.marks.length; i++) {
        var m = game.marks[i];
        ctx.beginPath(); ctx.moveTo(m.x - 7, m.y - 7); ctx.lineTo(m.x + 7, m.y + 7); ctx.moveTo(m.x + 7, m.y - 7); ctx.lineTo(m.x - 7, m.y + 7); ctx.stroke();
      }
      ctx.restore();
    }
    if (!game.demo && game.li === 0) drawTutorial();
    Art.drawGZones(ctx, w, pal, t);
    Art.drawGroups(ctx, w, pal, t);
    Art.drawSpikes(ctx, w, pal);
    Art.drawSprings(ctx, w, pal);
    for (var k = 0; k < w.doors.length; k++) {
      var d = w.doors[k];
      var glow = w.state === 'win' && w.winDoor === d;
      if (!d.bit && !(d.g && !d.g.active)) {
        // gentle "come here" pulse behind every door (fake ones look just as inviting)
        var dx = d.x + (d.g ? d.g.ox : 0) + 20, dy = d.y + (d.g ? d.g.oy : 0) + (d.hang ? 28 : 32);
        ctx.save(); ctx.globalAlpha = glow ? 0.6 : 0.18 + 0.1 * Math.sin(t * 4); ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(dx, dy, (glow ? 52 : 38) + 4 * Math.sin(t * 4), 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      Art.drawDoor(ctx, d, pal, t, glow);
    }
    for (k = 0; k < w.saws.length; k++) Art.drawSaw(ctx, w.saws[k], pal);
    drawPlayer();
    fx.draw(ctx);
  }

  function drawPlayer() {
    var w = game.world, p = w.p, v = game.vis;
    if (w.state === 'dead') return;
    var x = p.x + PH.w / 2, y = w.gs > 0 ? p.y + PH.h : p.y, sc = v.sc, alpha = 1;
    if (w.state === 'win' && w.winDoor) {
      var d = w.winDoor, k = Math.min(1, w.stateT / 0.45);
      var dx = d.x + (d.g ? d.g.ox : 0) + 20, dy = d.y + (d.g ? d.g.oy : 0) + (d.hang ? 4 : 56);
      x += (dx - x) * k; y += (dy - y) * k;
      sc *= 1 - k * 0.85; alpha = 1 - k * 0.6;
      if (k >= 1) return;
    }
    var run = p.onGround && Math.abs(p.vx) > 40;
    Art.drawPlayer(ctx, x, y, {
      sx: v.sx, sy: v.sy, face: p.face, skin: save.skin, t: game.t, flip: w.gs < 0, ink: game.pal.ink,
      run: run, air: !p.onGround, blink: v.blink > 0, look: p.onGround ? 0 : (p.vy * w.gs > 0 ? 1 : -1),
      scale: sc, alpha: alpha, dizzy: w.revT > 0
    });
  }

  function keycap(label, x, y, wdt) {
    wdt = wdt || 44;
    Art.rr(ctx, x - wdt / 2, y - 22, wdt, 44, 9);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = game.pal.ink; ctx.stroke();
    ctx.fillStyle = game.pal.ink; ctx.fillRect(x - wdt / 2 + 3, y + 16, wdt - 6, 4);
    txt(label, x, y - 1, label.length > 2 ? 17 : 24, game.pal.ink, 'center', { ltr: label.length <= 2 });
  }
  function drawTutorial() {
    var w = game.world, a = w.p.x < 480 ? 0.95 : 0.4;
    ctx.save(); ctx.globalAlpha = a;
    keycap('←', 170, 300); keycap('→', 222, 300);
    txt('تحرّك', 196, 350, 26, game.pal.ink, 'center');
    keycap('↑', 330, 300); keycap('مسافة', 410, 300, 84);
    txt('اقفز', 370, 350, 26, game.pal.ink, 'center');
    ctx.restore();
  }

  // Speech bubble centred on (x, y), kept inside the screen, optionally scaled.
  function bubble(s, x, y, size, a, sc) {
    sc = sc || 1;
    var wdt = tw(s, size) + 44, h = size + 26;
    var half = wdt * sc / 2;
    x = Math.max(10 + half, Math.min(1270 - half, x));
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(sc, sc);
    Art.rr(ctx, -wdt / 2, -h / 2, wdt, h, h / 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = game.pal.ink; ctx.stroke();
    txt(s, 0, 1, size, game.pal.ink, 'center');
    ctx.restore();
  }

  function drawHUD() {
    var w = game.world, pal = game.pal;
    // death counter (left, next to the pause button)
    var dtext = 'السقطات: ' + game.deaths;
    var dw = tw(dtext, 26) + 64;
    Art.rr(ctx, 64, 12, dw, 44, 22); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    // little splat icon
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath(); ctx.arc(90, 34, 11, 0, Math.PI * 2); ctx.fill();
    for (var i = 0; i < 6; i++) { var an = i / 6 * Math.PI * 2 + 0.3; ctx.beginPath(); ctx.arc(90 + Math.cos(an) * 13, 34 + Math.sin(an) * 13, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(84, 29, 3, 3); ctx.fillRect(93, 29, 3, 3);
    txt(dtext, 110, 35, 26, '#ffffff', 'left');
    // level name (center)
    var name = 'المرحلة ' + (game.li + 1) + ': ' + LEVELS[game.li].name;
    txt(name, 640, 36, 30, '#ffffff', 'center', { stroke: pal.ink, lw: 6 });
    // world chip + best (right, left of the mute button)
    var best = save.best[game.li];
    var rtext = best == null ? WORLDS[Math.floor(game.li / PER)].name : 'أقل سقطات: ' + best;
    txt(rtext, 1200, 35, 22, 'rgba(255,255,255,0.85)', 'right', { w: 500 });
    // reversed controls
    if (w.revT > 0) {
      bubble('التحكم معكوس! ' + w.revT.toFixed(1), 640, 92, 24, 1, 1 + 0.06 * Math.sin(game.t * 18));
    }
    // auto gravity flip timer
    if (w.flipWarn) {
      var left = w.flipWarn - (w.t % w.flipWarn), k = left / w.flipWarn;
      var bw = 300, bx = 640 - bw / 2, by = 76;
      Art.rr(ctx, bx, by, bw, 22, 11); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
      Art.rr(ctx, bx + 3, by + 3, Math.max(16, (bw - 6) * k), 16, 8); ctx.fillStyle = left < 0.6 ? '#ff4d6d' : '#ffe14d'; ctx.fill();
      txt(left < 0.6 ? 'انقلاب!' : 'الانقلاب القادم', 640 + bw / 2 + 12, by + 11, 20, '#ffffff', 'left');
    }
    // taunt / level message bubble
    if (game.msg && game.msgT > 0) {
      var a = Math.min(1, game.msgT * 4), pop = 1 + Math.max(0, game.msgT - 1.5) * 0.4;
      bubble(game.msg, 640, 170, 28, a, pop);
    }
    // hint after a few deaths
    if (game.deaths >= HINT_AFTER && LEVELS[game.li].hint) {
      var h = 'تلميح: ' + LEVELS[game.li].hint;
      var size = 22, hw = tw(h, size) + 40;
      while (hw > 1220 && size > 14) { size--; hw = tw(h, size) + 40; }
      Art.rr(ctx, 640 - hw / 2, 672, hw, 38, 19);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#ffe14d'; ctx.stroke();
      txt(h, 640, 692, size, pal.ink, 'center');
    }
    // skip offer
    if (game.deaths >= SKIP_AFTER && game.li < N - 1) {
      txt('عالق؟ اضغط P لتتخطى المرحلة', 640, 648, 18, 'rgba(255,255,255,0.9)', 'center', { stroke: pal.ink, lw: 4, w: 500 });
    }
    // level intro card
    if (game.introT > 0) {
      var ia = Math.min(1, game.introT * 2.5), s = 1 + Math.max(0, game.introT - 1.9) * 1.2;
      ctx.save(); ctx.globalAlpha = ia; ctx.translate(640, 330); ctx.scale(s, s);
      txt('المرحلة ' + (game.li + 1), 0, -34, 40, '#ffffff', 'center', { stroke: pal.ink, lw: 10 });
      txt(LEVELS[game.li].name, 0, 22, 64, '#ffe14d', 'center', { stroke: pal.ink, lw: 12 });
      ctx.restore();
    }
  }

  function render() {
    var w = game.world;
    ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, 0, 0);
    if (!w) { ctx.fillStyle = '#1c1226'; ctx.fillRect(0, 0, 1280, 720); return; }
    ctx.save();
    ctx.translate(shake.x, shake.y);
    drawWorld();
    ctx.restore();
    if (!game.demo && (mode === 'play' || mode === 'pause')) drawHUD();
    if (game.demo && game.msg && game.msgT > 0 && mode === 'title') {
      var p = w.p;
      bubble(game.msg, p.x + PH.w / 2, p.y - 40, 22, Math.min(1, game.msgT * 4));
    }
    if (game.flash > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(0.5, game.flash); ctx.fillStyle = game.flashC; ctx.fillRect(0, 0, 1280, 720); ctx.restore();
    }
  }

  /* ============================================================== debug hook */
  window.__game = {
    get mode() { return mode; },
    get level() { return game.li; },
    get deaths() { return game.deaths; },
    get save() { return JSON.parse(JSON.stringify(save)); },
    get player() { var p = game.world && game.world.p; return p ? { x: (p.x + PH.w / 2) / T, y: (p.y + PH.h) / T, state: game.world.state, gs: game.world.gs } : null; },
    start: function (i) { startLevel(i); return mode; },
    // Replay the recorded solution for the current level in real time (see solutions.js).
    solve: function () {
      if (mode !== 'play' || !window.TrollSolutions) return false;
      game.world.attempt = 0; game.world.reset();
      game.auto = E.parseInputs(window.TrollSolutions[game.li]); game.autoF = 0; game.prevJ = false;
      return true;
    },
    // Instantly win the current level (skips the trap).
    win: function () {
      var w = game.world; if (mode !== 'play' || !w || !w.door) return false;
      var d = w.door; w.p.x = d.x + (d.g ? d.g.ox : 0) + 7; w.p.y = d.y + (d.g ? d.g.oy : 0) + 20; w.p.vx = 0; w.p.vy = 0;
      return true;
    },
    setDeaths: function (n) { game.deaths = n; return n; },
    // Replays every recorded solution through the engine (headless, instant).
    verifyAll: function () {
      if (!window.TrollSolutions) return 'no solutions';
      return LEVELS.map(function (lv, i) { return E.simulate(lv, window.TrollSolutions[i]).result; }).join(',');
    },
    unlockAll: function () { save.unl = N - 1; persist(); if (mode === 'select') buildSelect(); return true; },
    resetSave: function () { ['best', 'stars', 'total', 'unl', 'skin', 'last', 'ended'].forEach(function (k) { store.remove(k); }); location.reload(); }
  };

  /* ============================================================== boot */
  goTitle();
  K.loop(update, render);
  try { document.fonts.load('700 40px Fredoka', 'ب'); } catch (e) { /* */ }
})();
