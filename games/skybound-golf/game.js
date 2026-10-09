/* ضربة إلى الفضاء: game flow, input, camera, effects, sound and menus.
 * The canvas and the DOM layer share a fixed logical 1280 × 720 view.
 * No requests or module loader: this also runs from a downloaded folder.
 */
(function () {
  'use strict';
  var P = window.GolfPhysics, A = window.GolfArt, K = window.Kit;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ui = $('ui');
  var view = K.fit(canvas, 1280, 720, { maxDpr: 1.5 });
  var ctx = view.ctx, storage = K.store('skybound-golf');
  var save = P.sanitizeSave(storage.get('progress', {}));
  var reduced = K.motion.reduced();

  var GAUGE_PERIOD = 1.3, SWING_TIME = 0.08, MAX_PARTICLES = 220;
  var TEE_CAM = { x: 5.5, y: 3.6, zoom: 1.9 };
  var s = {
    world: save.world, course: P.createCourse(save.world), phase: 'title', time: 0,
    cam: { x: TEE_CAM.x, y: TEE_CAM.y, zoom: TEE_CAM.zoom }, ball: null, skin: save.skin, reduced: reduced,
    golfer: { angle: A.ADDRESS, jump: 0, jumpT: 0 }, gauge: { show: false, value: 0 },
    trail: [], particles: [], popups: [], shake: { x: 0, y: 0 }, flash: 0, reticle: null,
    bestX: 0, unlockX: 0, unlockName: '', flame: 0, squash: null, landed: null,
    padPulse: null, propHit: null, magnet: 0, space: false, hints: true
  };
  var modalMode = '', paused = false, gaugeT = 0, swing = null, hitStop = 0, follow = -1, shake = 0;
  var landedT = 0, result = null, newWorld = -1, burstEl = null, lastFocus = null, toastTimer = 0;
  var coinStreak = 0, lastCoinAt = -9, busyAt = 0, gaugeHot = false, emptyWarned = false, unlockSeen = false;
  var renderDirty = true, renderedTime = -1, hud = { meters: -1, coins: -1, alt: -1, rockets: '' };
  var mute = K.muteButton(); ui.appendChild(mute);
  var saveStatus = K.saveStatus({ retry: persist });

  K.motion.onChange(function (value) {
    reduced = s.reduced = value;
    if (value) { s.trail.length = 0; s.particles.length = 0; s.shake.x = s.shake.y = 0; s.flash = 0; }
    renderDirty = true;
  });
  canvas.addEventListener('contextrestored', function () { view.resize(); renderDirty = true; });

  var UPGRADES = {
    power: { name: 'قوة الضربة', explain: 'انطلق أبعد', icon: '<path d="M22 3 9 21h10l-4 14 16-20H21z" fill="#ffd000" stroke="#24133f" stroke-width="3" stroke-linejoin="round"/>' },
    bounce: { name: 'الارتداد', explain: 'قفزات أعلى', icon: '<path d="M5 33Q11 4 19 24Q24 10 33 28" fill="none" stroke="#7dff8a" stroke-width="5" stroke-linecap="round"/><circle cx="31" cy="11" r="5" fill="#fff" stroke="#24133f" stroke-width="3"/>' },
    rockets: { name: 'الصواريخ', explain: 'صاروخ إضافي', icon: '<path d="M20 3c7 6 9 15 6 24h-12C11 18 13 9 20 3z" fill="#fff" stroke="#24133f" stroke-width="3"/><circle cx="20" cy="15" r="3.5" fill="#2bd1c1" stroke="#24133f" stroke-width="2"/><path d="M14 22l-6 8 7-1M26 22l6 8-7-1" fill="#ff4f6d" stroke="#24133f" stroke-width="2.5" stroke-linejoin="round"/><path d="M16 29l4 9 4-9z" fill="#ff8a1a"/>' },
    magnet: { name: 'المغناطيس', explain: 'اجذب العملات', icon: '<path d="M9 6v14a11 11 0 0 0 22 0V6h-7v14a4 4 0 0 1-8 0V6z" fill="#ff4f6d" stroke="#24133f" stroke-width="3" stroke-linejoin="round"/><path d="M9 6h7v6H9zM24 6h7v6h-7z" fill="#e6e8ff" stroke="#24133f" stroke-width="3"/>' }
  };
  var ROCKET_SVG = '<svg viewBox="0 0 40 44" aria-hidden="true">' + UPGRADES.rockets.icon + '</svg>';
  var WORLD_LOOKS = [['#3aa6f2', '#6fd64b'], ['#ff8f5a', '#f8d27c'], ['#5ea8ff', '#ffffff'], ['#8a74ff', '#ffffff'], ['#0d0a2c', '#cfcbea']];
  var INK = 'stroke="#24133f" stroke-width="3" stroke-linejoin="round"';
  var WORLD_ICONS = [
    '<rect x="27" y="34" width="8" height="20" rx="3" fill="#8a5531" ' + INK + '/><circle cx="31" cy="26" r="17" fill="#3fb653" ' + INK + '/><circle cx="25" cy="20" r="5" fill="#7fe06a"/><circle cx="38" cy="30" r="3" fill="#ff5f6f"/>',
    '<rect x="25" y="12" width="12" height="44" rx="6" fill="#3fbf6e" ' + INK + '/><rect x="12" y="24" width="8" height="18" rx="4" fill="#3fbf6e" ' + INK + '/><rect x="42" y="18" width="8" height="18" rx="4" fill="#3fbf6e" ' + INK + '/><circle cx="31" cy="12" r="4" fill="#ff6fa8" ' + INK + '/>',
    '<path d="M4 54 30 10l26 44z" fill="#7d9ad6" ' + INK + '/><path d="M21 25 30 10l9 15-5 4-4-3-4 3z" fill="#fff"/>',
    '<path d="M10 44a10 10 0 0 1 4-19 14 14 0 0 1 27-3 11 11 0 0 1 11 22z" fill="#fff" ' + INK + '/><path d="M23 34q3 3 6 0M34 34q3 3 6 0" fill="none" stroke="#24133f" stroke-width="2.5" stroke-linecap="round"/>',
    '<circle cx="31" cy="30" r="17" fill="#ff9f5a" ' + INK + '/><ellipse cx="31" cy="30" rx="28" ry="8" fill="none" stroke="#24133f" stroke-width="7" transform="rotate(-18 31 30)"/><ellipse cx="31" cy="30" rx="28" ry="8" fill="none" stroke="#ffd9a0" stroke-width="3.5" transform="rotate(-18 31 30)"/>'
  ];

  /* -------------------------------------------------------- utilities */
  function resize() {
    renderDirty = true;
    var scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    ui.style.left = Math.round((window.innerWidth - 1280 * scale) / 2) + 'px';
    ui.style.top = Math.round((window.innerHeight - 720 * scale) / 2) + 'px';
    ui.style.transform = 'scale(' + scale + ')';
  }
  window.addEventListener('resize', resize); resize();
  function persist() { if (storage.set('progress', save)) saveStatus.saved(); else saveStatus.failed(); }
  function announce(text) { $('announce').textContent = text; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function worldId() { return P.worlds[s.world].id; }
  function button(id, fn) {
    $(id).addEventListener('click', function (e) { K.audio.unlock(); K.sfx.click(); if (e.detail) this.blur(); fn(); });
  }

  /* ------------------------------------------------------------ sound */
  var A2 = K.audio;
  var sfx = {
    thwack: function (grade) {
      A2.noise({ dur: 0.09, vol: 0.5, filter: 5200, to: 700 });
      A2.tone({ freq: 230, to: 70, type: 'square', dur: 0.12, vol: 0.22 });
      if (grade === 'perfect') {
        A2.noise({ dur: 0.5, vol: 0.25, filter: 900, to: 60 });
        [1047, 1319, 1568, 2093].forEach(function (f, i) { A2.tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.13, delay: 0.04 + i * 0.05 }); });
      }
    },
    swing: function () { A2.noise({ dur: 0.12, vol: 0.18, filter: 2600, to: 6000 }); },
    bounce: function (strength, surface) {
      if (surface === 'sand') { A2.noise({ dur: 0.14, vol: 0.12 + strength * 0.2, filter: 900, to: 200 }); return; }
      if (surface === 'snow' || surface === 'cloud') A2.noise({ dur: 0.1, vol: 0.08 + strength * 0.12, filter: 3000, to: 600 });
      A2.tone({ freq: 190 + strength * 70, to: 85, type: 'triangle', dur: 0.1, vol: 0.08 + strength * 0.22 });
    },
    boing: function (combo, perfect) {
      var lift = Math.pow(2, Math.min(combo, 8) / 12);
      A2.tone({ freq: 220 * lift, to: 820 * lift, type: 'sine', dur: 0.22, vol: 0.28 });
      A2.tone({ freq: 330 * lift, to: 990 * lift, type: 'triangle', dur: 0.16, vol: 0.12 });
      if (perfect) A2.tone({ freq: 1568 * lift, type: 'triangle', dur: 0.14, vol: 0.12, delay: 0.08 });
    },
    coin: function (streak, gem) {
      var f = (gem ? 1319 : 988) * Math.pow(2, Math.min(streak, 14) / 12);
      A2.tone({ freq: f, type: 'square', dur: 0.05, vol: 0.09 });
      A2.tone({ freq: f * 1.5, type: 'square', dur: 0.08, vol: 0.09, delay: 0.05 });
      if (gem) A2.tone({ freq: f * 2, type: 'triangle', dur: 0.12, vol: 0.1, delay: 0.1 });
    },
    rocket: function () {
      A2.noise({ dur: 0.4, vol: 0.32, filter: 2400, to: 300 });
      A2.tone({ freq: 110, to: 440, type: 'sawtooth', dur: 0.3, vol: 0.12 });
    },
    pad: function () { A2.tone({ freq: 140, to: 640, type: 'square', dur: 0.18, vol: 0.1 }); A2.tone({ freq: 300, to: 950, type: 'triangle', dur: 0.22, vol: 0.2 }); },
    ring: function () { A2.noise({ dur: 0.25, vol: 0.18, filter: 4000, to: 900 }); A2.tone({ freq: 660, to: 1320, type: 'triangle', dur: 0.2, vol: 0.18 }); },
    pop: function () { K.sfx.pop(); A2.noise({ dur: 0.06, vol: 0.25, filter: 7000 }); },
    bonk: function (soft) {
      if (soft) { A2.tone({ freq: 200, to: 700, type: 'sine', dur: 0.2, vol: 0.25 }); return; }
      A2.tone({ freq: 150, to: 60, type: 'square', dur: 0.1, vol: 0.18 }); A2.noise({ dur: 0.22, vol: 0.12, filter: 6000, to: 2000 });
    },
    splash: function () { A2.noise({ dur: 0.6, vol: 0.32, filter: 2600, to: 250 }); A2.tone({ freq: 420, to: 120, type: 'sine', dur: 0.25, vol: 0.15 }); },
    skip: function () { A2.tone({ freq: 520, to: 980, type: 'sine', dur: 0.09, vol: 0.18 }); A2.noise({ dur: 0.12, vol: 0.12, filter: 3000, to: 800 }); },
    tick: function () { A2.tone({ freq: 1250, type: 'sine', dur: 0.04, vol: 0.08 }); },
    empty: function () { A2.tone({ freq: 190, to: 120, type: 'square', dur: 0.12, vol: 0.08 }); },
    gauge: function () { A2.tone({ freq: 1568, type: 'sine', dur: 0.05, vol: 0.05 }); },
    fanfare: function () { [784, 988, 1175, 1568, 1175, 1568].forEach(function (f, i) { A2.tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.18, delay: i * 0.08 }); }); },
    space: function () { [523, 659, 784, 1047, 1319, 1568, 2093].forEach(function (f, i) { A2.tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.16, delay: i * 0.07 }); }); },
    land: function () { A2.tone({ freq: 160, to: 80, type: 'triangle', dur: 0.12, vol: 0.2 }); }
  };

  /* ---------------------------------------------------------- effects */
  function particle(kind, x, y, o) {
    if (s.particles.length >= MAX_PARTICLES) s.particles.shift();
    s.particles.push({ kind: kind, x: x, y: y, vx: o.vx || 0, vy: o.vy || 0, t: 0, life: o.life || 0.6, size: o.size || 8,
      color: o.color || '#fff', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, g: o.g == null ? 18 : o.g });
  }
  function burst(kind, x, y, count, o) {
    if (reduced) count = Math.min(count, kind === 'ring' ? 1 : 3);
    for (var n = 0; n < count; n++) {
      var a = (o.angle == null ? Math.random() * Math.PI * 2 : o.angle + (Math.random() - 0.5) * (o.spread || 1));
      var v = (o.speed || 8) * (0.4 + Math.random() * 0.6);
      particle(kind, x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: (o.life || 0.6) * (0.7 + Math.random() * 0.5),
        size: (o.size || 8) * (0.7 + Math.random() * 0.6), color: o.colors ? o.colors[n % o.colors.length] : o.color, g: o.g });
    }
  }
  var CONFETTI = ['#ff4f6d', '#ffd000', '#2bd1c1', '#8a5cff', '#7dff8a', '#ff8a1a'];
  function popup(text, x, y, color, size, screen) {
    if (s.popups.length > 7) s.popups.shift();
    s.popups.push({ text: text, x: x, y: y, color: color || '#fff', size: size || 34, t: 0, life: 1.1, screen: !!screen });
  }
  function kick(power, flash) {
    if (!reduced) { shake = Math.max(shake, power); s.flash = Math.max(s.flash, flash || 0); }
  }
  function toast(text, seconds) {
    $('toast').textContent = text; $('toast').hidden = false; toastTimer = seconds || 1.8; announce(text);
  }

  /* ------------------------------------------------------------ menus */
  function stats() {
    $('coins').textContent = K.fmt(save.coins);
    $('shop-coins').textContent = K.fmt(save.coins);
    $('best-meters').textContent = K.fmt(save.best);
    $('world-label').textContent = P.worlds[save.world].name;
    var next = P.worlds.filter(function (w) { return w.unlock > save.best; })[0];
    $('journey').textContent = next ? 'العالم التالي: ' + next.name + ' عند ' + next.unlock + ' متر' : 'فتحت كل العوالم… هل تصل إلى حافة الفضاء؟';
    s.unlockX = next ? next.unlock : 0; s.unlockName = next ? next.name : '';
    s.magnet = P.magnetOf(save.upgrades);
    s.hints = save.tips < 2 || save.shots < 8;
  }
  function controls() {
    renderDirty = true;
    ui.dataset.phase = s.phase;
    var playing = s.phase !== 'title' && s.phase !== 'result';
    $('title-screen').hidden = s.phase !== 'title' || !!modalMode;
    $('hud').hidden = !playing && s.phase !== 'result';
    $('pause').hidden = !playing;
    s.gauge.show = s.phase === 'ready';
    hint();
  }
  function hint() {
    var text = '', pulse = false;
    if (s.phase === 'ready') { text = save.shots ? 'مسافة أو انقر: اضرب في الذهبي!' : 'انقر أو اضغط مسافة عندما يصل المضرب إلى الذهبي!'; pulse = !save.shots; }
    else if (s.phase === 'flight' && save.tips < 2) text = s.ball && s.ball.rocketsLeft ? 'في الهواء: صاروخ · قرب الأرض: قفزة خارقة' : 'اضغط قرب الأرض لقفزة خارقة!';
    else if (s.phase === 'landed') text = 'مسافة: النتيجة';
    $('hint').textContent = text; $('hint').hidden = !text || !!modalMode;
    $('hint').classList.toggle('pulse', pulse);
  }
  function openModal(mode, focus) {
    if (!modalMode) lastFocus = document.activeElement;
    modalMode = mode; $('modal').hidden = false;
    $('panel').className = 'panel ' + mode + '-panel';
    $('result-content').hidden = mode !== 'result';
    $('shop-content').hidden = mode !== 'shop' && mode !== 'result';
    $('skins-content').hidden = mode !== 'shop';
    $('worlds-content').hidden = mode !== 'worlds';
    $('pause-content').hidden = mode !== 'pause';
    $('again').hidden = mode !== 'result';
    $('close-modal').hidden = mode === 'result' || mode === 'pause';
    $('menu').hidden = mode === 'shop' || mode === 'worlds';
    $('modal-heading').textContent = mode === 'shop' ? 'المتجر' : mode === 'worlds' ? 'اختر عالمك' : mode === 'pause' ? 'استراحة' : '';
    $('modal-tip').textContent = mode === 'result' ? 'مسافة أو Enter أو R: ضربة أخرى' : mode === 'pause' ? 'P أو Esc للمتابعة' : 'Esc للرجوع · كل شيء يُحفظ تلقائيًا';
    if (mode === 'shop' || mode === 'result') renderShop();
    if (mode === 'worlds') renderWorlds();
    controls();
    if (focus !== false) (mode === 'result' ? $('again') : mode === 'pause' ? $('resume') : $('close-modal')).focus({ preventScroll: true });
  }
  function closeModal() {
    modalMode = ''; $('modal').hidden = true; paused = false;
    $('panel').classList.remove('celebrate');
    controls();
    if (lastFocus && lastFocus !== document.body && !lastFocus.hidden && lastFocus.offsetParent) lastFocus.focus({ preventScroll: true });
    else canvas.focus({ preventScroll: true });
  }
  function menu() {
    closeModal(); s.phase = 'title'; resetScene(); stats(); controls();
    $('play').focus({ preventScroll: true });
  }
  function pause(focus) {
    if (modalMode || s.phase === 'title' || s.phase === 'result') return;
    paused = true; openModal('pause', focus);
  }
  function togglePause() { if (modalMode === 'pause') closeModal(); else pause(); }

  function renderShop() {
    var focusKind = document.activeElement && document.activeElement.dataset.upgrade;
    var host = $('upgrades'); host.textContent = '';
    P.kinds.forEach(function (kind) {
      var level = save.upgrades[kind], max = P.upgrades[kind].max, price = P.cost(kind, level), maxed = level >= max;
      var b = document.createElement('button'); b.type = 'button'; b.dataset.upgrade = kind;
      b.className = 'upgrade' + (maxed ? ' maxed' : save.coins >= price ? ' can' : '');
      b.disabled = maxed || save.coins < price;
      var pips = '';
      for (var n = 0; n < max; n++) pips += '<i class="' + (n < level ? 'on' : '') + '"></i>';
      b.innerHTML = '<span class="upgrade-icon" aria-hidden="true"><svg viewBox="0 0 40 40">' + UPGRADES[kind].icon + '</svg></span><strong>' + UPGRADES[kind].name +
        '</strong><span class="explain">' + UPGRADES[kind].explain + '</span><span class="pips" aria-hidden="true">' + pips + '</span><span class="price">' +
        (maxed ? 'مكتمل' : '<i class="coin-ico"></i>' + K.fmt(price)) + '</span>';
      b.setAttribute('aria-label', UPGRADES[kind].name + '، المستوى ' + level + ' من ' + max + (maxed ? '، مكتمل' : '، السعر ' + price + ' عملة' + (save.coins < price ? '، العملات غير كافية' : '')));
      b.addEventListener('click', function (e) { buy(kind, e); });
      host.appendChild(b);
    });
    if (focusKind) {
      // A keyboard purchase keeps the focus on the card while it can be bought
      // again; otherwise Space and Enter fall back to the screen's main action.
      var again = host.querySelector('[data-upgrade="' + focusKind + '"]'), go = modalMode === 'result' && newWorld >= 0 && $('result-unlock').querySelector('button');
      if (again && !again.disabled && !go) again.focus({ preventScroll: true });
      else (go || (modalMode === 'result' ? $('again') : $('close-modal'))).focus({ preventScroll: true });
    }
    renderSkins();
    $('shop-coins').textContent = K.fmt(save.coins);
  }
  function buy(kind, e) {
    var price = P.cost(kind, save.upgrades[kind]);
    if (save.upgrades[kind] >= P.upgrades[kind].max || save.coins < price) return;
    // After a mouse purchase, Space and Enter keep the screen's main action.
    if (e && e.detail) e.currentTarget.blur();
    save.coins -= price; save.upgrades[kind]++; persist(); stats(); A2.unlock(); K.sfx.power();
    announce('تم تطوير ' + UPGRADES[kind].name + ' إلى المستوى ' + save.upgrades[kind]);
    renderShop();
  }
  function renderSkins() {
    if ($('skins-content').hidden) return;
    var focusSkin = document.activeElement && document.activeElement.dataset.skin;
    var host = $('skins'); host.textContent = '';
    P.skins.forEach(function (k) {
      var owned = save.skins.indexOf(k.id) >= 0, chosen = save.skin === k.id;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'skin'; b.dataset.skin = k.id;
      b.disabled = !owned && save.coins < k.price; b.setAttribute('aria-pressed', String(chosen));
      var preview = document.createElement('canvas'); preview.width = preview.height = 104; preview.setAttribute('aria-hidden', 'true');
      var pctx = preview.getContext('2d'); pctx.scale(2, 2); A.preview(pctx, k.id, 52);
      b.appendChild(preview);
      b.insertAdjacentHTML('beforeend', '<strong>' + k.name + '</strong><span>' + (chosen ? 'مختارة' : owned ? 'اختر' : K.fmt(k.price)) + '</span>');
      b.addEventListener('click', function (e) {
        if (save.skins.indexOf(k.id) < 0) {
          if (save.coins < k.price) return;
          save.coins -= k.price; save.skins.push(k.id); K.sfx.power();
        }
        if (e.detail) b.blur();
        save.skin = s.skin = k.id; persist(); stats(); renderDirty = true;
        announce('الكرة الآن: ' + k.name);
        renderShop();
      });
      host.appendChild(b);
    });
    var again = focusSkin && host.querySelector('[data-skin="' + focusSkin + '"]');
    if (again) again.focus({ preventScroll: true });
  }
  function renderWorlds() {
    var host = $('worlds-content'); host.textContent = '';
    P.worlds.forEach(function (w, i) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'world-option' + (i === save.world ? ' selected' : ''); b.disabled = save.best < w.unlock;
      b.style.setProperty('--sky', 'linear-gradient(' + WORLD_LOOKS[i][0] + ', ' + WORLD_LOOKS[i][0] + 'aa)');
      b.style.setProperty('--ground', WORLD_LOOKS[i][1]);
      b.innerHTML = '<svg class="world-icon" viewBox="0 0 62 62" aria-hidden="true">' + WORLD_ICONS[i] + '</svg><strong>' + w.name + '</strong><span>' +
        (b.disabled ? 'تُفتح عند <bdi dir="ltr">' + w.unlock + '</bdi> م' : i === save.world ? 'العالم الحالي' : 'العب هنا') + '</span>';
      b.setAttribute('aria-pressed', i === save.world ? 'true' : 'false');
      b.addEventListener('click', function () { save.world = i; persist(); K.sfx.power(); menu(); });
      host.appendChild(b);
    });
  }

  /* ------------------------------------------------------------- flow */
  function resetScene() {
    s.world = save.world; s.course = P.createCourse(save.world);
    s.cam.x = TEE_CAM.x; s.cam.y = TEE_CAM.y; s.cam.zoom = TEE_CAM.zoom;
    s.ball = null; s.trail.length = 0; s.particles.length = 0; s.popups.length = 0; s.reticle = null;
    s.landed = null; s.flame = 0; s.squash = null; s.padPulse = null; s.propHit = null; s.space = false; s.flash = 0;
    s.golfer.angle = A.ADDRESS; s.golfer.jump = s.golfer.jumpT = 0; s.gauge.value = 0;
    // The best flag shows the record to beat, so it moves only between shots.
    s.bestX = save.bests[worldId()] || 0;
    swing = null; hitStop = 0; follow = -1; shake = 0; result = null; newWorld = -1; landedT = 0;
    coinStreak = 0; emptyWarned = false; unlockSeen = false; gaugeT = 0;
    $('toast').hidden = true; toastTimer = 0;
    $('altimeter').classList.remove('space');
    hud.meters = hud.coins = hud.alt = -1; hud.rockets = '';
  }
  function start() {
    closeModal(); resetScene(); stats();
    s.phase = 'ready';
    if (!save.shots) Kit.stats.tutorial('start');
    updateHud(); controls(); canvas.focus({ preventScroll: true });
    announce('اضرب عندما يصل المضرب إلى المنطقة الذهبية');
  }
  function playWorld(i) { save.world = i; persist(); start(); }

  // The player's one button.
  function action() {
    if (modalMode || paused) return;
    if (s.phase === 'title') start();
    else if (s.phase === 'ready') strike();
    else if (s.phase === 'flight') flightPress();
    else if (s.phase === 'landed') showResult();
  }
  function strike() {
    var power = s.gauge.value;
    // Play stats: each shot is a round of its world.
    Kit.stats.round(worldId());
    swing = { power: power, grade: P.grade(power), from: s.golfer.angle, t: 0 };
    s.phase = 'swing'; sfx.swing(); controls();
  }
  function contact() {
    var g = swing.grade;
    s.ball = P.launch(s.course, save.upgrades, swing.power);
    s.phase = 'flight'; follow = 0; swing = null;
    hitStop = reduced ? 0 : g === 'perfect' ? 0.13 : g === 'great' ? 0.07 : 0.04;
    sfx.thwack(g); K.sfx.whoosh();
    var bx = s.ball.x, by = s.ball.y;
    burst('spark', bx, by, g === 'perfect' ? 14 : 6, { speed: 14, size: 12, color: '#ffd000', g: 6, life: 0.5 });
    burst('ring', bx, by, 1, { speed: 0, size: g === 'perfect' ? 90 : 50, color: '#ffffff', life: 0.4, g: 0 });
    burst('dust', bx, by - 0.4, 6, { speed: 4, size: 10, color: '#ffffff', angle: Math.PI * 0.85, spread: 1, life: 0.5, g: 2 });
    var words = { perfect: 'ضربة مثالية!', great: 'ضربة قوية!', good: 'جيدة!', weak: 'ضعيفة…' };
    popup(words[g], 2, by + 4.5, g === 'perfect' ? '#ffd000' : g === 'great' ? '#ff8a1a' : '#ffffff', g === 'perfect' ? 52 : 40);
    kick(g === 'perfect' ? 14 : g === 'great' ? 8 : 4, g === 'perfect' ? 0.55 : 0.2);
    if (g === 'perfect') s.golfer.jumpT = 0.001;
    controls();
  }
  function flightPress() {
    var b = s.ball;
    if (!b || b.done) return;
    var r = P.press(s.course, b, save.upgrades);
    if (r.type === 'rocket') {
      s.flame = 0.45; sfx.rocket(); kick(7, 0.12);
      var sp = Math.hypot(b.vx, b.vy) || 1;
      burst('flame', b.x, b.y, 16, { angle: Math.atan2(-b.vy, -b.vx), spread: 1.2, speed: 16, size: 14, life: 0.5, g: -2 });
      burst('ring', b.x, b.y, 1, { speed: 0, size: 70, color: '#ffb020', life: 0.35, g: 0 });
      popup('صاروخ!', b.x, b.y + 3 + sp * 0.02, '#ffb020', 36);
      $('rockets').classList.remove('empty');
    } else if (r.type === 'late') {
      sfx.boing(0, false); kick(5, 0.08);
      burst('ring', r.x, r.y + 0.3, 1, { speed: 0, size: 70, color: '#ffffff', life: 0.45, g: 0 });
      popup('قفزة جيدة', r.x, r.y + 4, '#ffffff', 32);
    } else if (r.type === 'arm') {
      sfx.tick();
    } else if (r.type === 'empty') {
      sfx.empty();
      var row = $('rockets'); row.classList.remove('empty'); void row.offsetWidth; row.classList.add('empty');
      if (!emptyWarned) { emptyWarned = true; popup('لا صواريخ! اضغط قرب الأرض', b.x, b.y + 3, '#ffffff', 28); }
    }
    updateHud();
  }
  function onEvent(e) {
    var b = s.ball;
    if (e.type === 'coin') {
      coinStreak = s.time - lastCoinAt < 0.7 ? coinStreak + 1 : 0; lastCoinAt = s.time;
      sfx.coin(coinStreak, e.gem);
      burst('spark', e.x, e.y, e.gem ? 8 : 4, { speed: 7, size: e.gem ? 12 : 8, color: e.gem ? '#e9a6ff' : '#ffe14d', g: 4, life: 0.4 });
      if (e.gem) popup('+5', e.x, e.y + 1, '#e9a6ff', 34);
      var chip = $('run-coins').parentNode; chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
    } else if (e.type === 'ring') {
      sfx.ring(); kick(5, 0.15);
      burst('ring', e.x, e.y, 1, { speed: 0, size: 110, color: '#ffd000', life: 0.45, g: 0 });
      popup('تسارع! +3', e.x, e.y + 4, '#ffb020', 36);
    } else if (e.type === 'balloon') {
      sfx.pop(); kick(4);
      burst('confetti', e.x, e.y, 16, { speed: 12, size: 12, colors: CONFETTI, life: 0.9, g: 14 });
      popup('بوب! +2', e.x, e.y + 3, '#ffffff', 34);
    } else if (e.type === 'prop') {
      var soft = e.prop === 'puff' || e.prop === 'crystal';
      sfx.bonk(soft); kick(4 + e.strength * 6);
      s.propHit = { id: e.id, t: 0 };
      var leaf = { tree: '#3fb653', cactus: '#7ee39a', pine: '#ffffff', puff: '#ffffff', crystal: '#c79bff' }[e.prop];
      burst(e.prop === 'pine' || e.prop === 'puff' ? 'dust' : 'confetti', e.x, e.y, 10, { speed: 8, size: 10, color: leaf, life: 0.7, g: 8 });
      popup(soft ? 'بوينغ!' : 'بونك!', e.x, e.y + 2.5, '#ffffff', 30);
    } else if (e.type === 'pad') {
      sfx.pad(); kick(7, 0.1);
      s.padPulse = { x: nearestPadX(e.x), t: 0 };
      burst('spark', e.x, e.y, 10, { speed: 12, size: 11, colors: CONFETTI, g: 10, life: 0.6, angle: -Math.PI / 2, spread: 1.8 });
      popup('قفزة!', e.x, e.y + 4, '#7dff8a', 40);
    } else if (e.type === 'bounce' || e.type === 'roll') {
      var dust = { sand: '#ffe39a', snow: '#ffffff', ice: '#d9f8ff', cloud: '#ffffff', dust: '#d8d4f2', green: '#c8ff9a' }[e.surface] || '#e9ffd0';
      if (e.type === 'bounce') { sfx.bounce(e.strength, e.surface); kick(e.strength * 6); s.squash = { t: 0, angle: Math.PI / 2 }; }
      burst('dust', e.x, e.y, e.type === 'bounce' ? 6 : 3, { speed: 5, size: 12, color: dust, angle: -Math.PI / 2, spread: 2.6, g: -1, life: 0.55 });
    } else if (e.type === 'super') {
      var perfect = e.quality === 'perfect';
      sfx.boing(e.combo, perfect); kick(perfect ? 9 : 5, perfect ? 0.22 : 0.08);
      s.squash = { t: 0, angle: Math.PI / 2 };
      if (perfect) hitStop = Math.max(hitStop, reduced ? 0 : 0.05);
      burst('ring', e.x, e.y + 0.3, 1, { speed: 0, size: perfect ? 120 : 70, color: perfect ? '#ffd000' : '#ffffff', life: 0.45, g: 0 });
      burst('spark', e.x, e.y + 0.3, perfect ? 12 : 5, { speed: 14, size: 11, color: perfect ? '#ffd000' : '#ffffff', angle: -Math.PI / 2, spread: 2.2, g: 10, life: 0.6 });
      popup(perfect ? 'قفزة خارقة!' + (e.combo > 1 ? ' ×' + e.combo : '') : 'قفزة جيدة', e.x, e.y + 4, perfect ? '#ffd000' : '#ffffff', perfect ? 44 : 32);
      if (perfect && save.tips < 2) { save.tips = 2; Kit.stats.tutorial('done'); hint(); }
    } else if (e.type === 'skip') {
      sfx.skip(); kick(4);
      burst('dust', e.x, e.y, 10, { speed: 9, size: 9, color: '#9fe3ff', angle: -Math.PI / 2, spread: 1.6, g: 20, life: 0.6 });
      popup('قفزة على الماء!' + (e.count > 1 ? ' ×' + e.count : ''), e.x, e.y + 4, '#7fd4ff', 34);
    } else if (e.type === 'splash') {
      sfx.splash(); kick(8);
      burst('dust', e.x, e.y, 18, { speed: 14, size: 12, color: '#7fd4ff', angle: -Math.PI / 2, spread: 1.2, g: 26, life: 0.9 });
      popup('سبلاش!', e.x, e.y + 4, '#7fd4ff', 48);
    } else if (e.type === 'hole') {
      sfx.fanfare(); kick(10, 0.4);
      burst('confetti', e.x, e.y + 1, 30, { speed: 16, size: 12, colors: CONFETTI, angle: -Math.PI / 2, spread: 1.4, g: 16, life: 1.2 });
      popup(e.ace ? 'حفرة من ضربة واحدة!' : 'في الحفرة!', e.x, e.y + 5, '#ffd000', 54);
    } else if (e.type === 'space') {
      s.space = true; sfx.space(); kick(10, 0.6);
      burst('confetti', b.x, b.y, 30, { speed: 18, size: 13, colors: CONFETTI, g: 6, life: 1.4 });
      toast('وصلت إلى حافة الفضاء! +100', 2.6);
      $('altimeter').classList.add('space');
    }
  }
  function nearestPadX(x) {
    var f = P.features(s.course, x - 4, x + 4).flats.filter(function (o) { return o.type === 'pad'; })[0];
    return f ? f.x : x;
  }

  // Saves the finished shot once, before any animation can be interrupted.
  function commit() {
    if (result) return result;
    var b = s.ball, distance = Math.floor(b.maxX), reward = P.reward(b), id = worldId();
    var oldBest = save.best, oldWorldBest = save.bests[id] || 0;
    result = { distance: distance, reward: reward, oldBest: oldBest, record: distance > oldWorldBest && save.shots > 0, reason: b.reason,
      hole: b.hole, ace: b.ace, space: b.space, height: Math.floor(b.maxY) };
    save.coins = Math.min(9999999, save.coins + reward.total);
    save.bests[id] = Math.max(oldWorldBest, distance); save.best = Math.max(save.best, distance);
    save.high = Math.max(save.high, Math.floor(b.maxY));
    save.shots++; if (b.hole) save.holes++; if (b.space) save.spaces++;
    if (save.tips < 1) save.tips = 1;
    Kit.stats.end('end', distance);
    persist(); stats();
    return result;
  }
  function land() {
    commit();
    s.phase = 'landed'; landedT = 0; s.reticle = null;
    s.landed = { x: s.ball.x, d: Math.floor(s.ball.maxX), t: 0 };
    if (s.ball.reason !== 'water' && s.ball.reason !== 'hole') sfx.land();
    if (result.record) { popup('رقم قياسي!', s.ball.x, s.ball.y + 7, '#ffd000', 48); K.sfx.win(); }
    controls();
  }
  function showResult() {
    if (s.phase === 'result') return;
    var r = commit();
    $('toast').hidden = true;
    s.phase = 'result'; openModal('result');
    var heading = r.ace ? 'حفرة من ضربة واحدة!' : r.hole ? 'في الحفرة!' : r.space ? 'إلى الفضاء!' : r.record ? 'رقم قياسي جديد!' : r.reason === 'water' ? 'سبلاش!' : 'رحلة رائعة!';
    $('modal-heading').textContent = heading;
    var best = save.bests[worldId()] || 0, gap = best - r.distance;
    $('result-note').textContent = r.record ? 'أبعد من أي ضربة سابقة في ' + P.worlds[s.world].name + '!' :
      gap > 0 && gap <= Math.max(15, best * 0.12) ? 'قريب جدًا! أفضل ضربة لك ' + best + ' متر' :
      r.reason === 'water' ? 'اضغط قرب الماء لتقفز عليه!' : 'طوّر ضربتك وانطلق أبعد';
    $('result-meters').textContent = K.fmt(r.distance);
    var parts = r.reward, html = '<span class="chip total"><i class="coin-ico"></i>+' + K.fmt(parts.total) + '</span>';
    if (parts.coins) html += '<span class="chip">جمعت ' + parts.coins + '</span>';
    html += '<span class="chip">المسافة ' + parts.distance + '</span>';
    if (parts.bonus) html += '<span class="chip">مكافأة ' + parts.bonus + '</span>';
    $('result-coins').innerHTML = html;
    var unlocked = P.worlds.filter(function (w) { return w.unlock > r.oldBest && w.unlock <= save.best; });
    var box = $('result-unlock'); box.hidden = !unlocked.length;
    $('again').className = 'button ' + (unlocked.length ? 'secondary' : 'primary');
    newWorld = -1;
    if (unlocked.length) {
      newWorld = P.worlds.indexOf(unlocked[unlocked.length - 1]);
      box.textContent = 'عالم جديد: ' + P.worlds[newWorld].name + '!';
      var go = document.createElement('button'); go.type = 'button'; go.className = 'button primary';
      go.textContent = 'العب هناك'; box.appendChild(go);
      go.addEventListener('click', function () { A2.unlock(); K.sfx.click(); playWorld(newWorld); });
      // A held Enter that just bought an upgrade must not carry on into the new world.
      go.addEventListener('keydown', function (e) { if (e.repeat) e.preventDefault(); });
      go.focus({ preventScroll: true });
      $('modal-tip').textContent = 'مسافة أو Enter: العالم الجديد · R: ضربة أخرى';
    }
    if (r.record || r.hole || r.space || unlocked.length) { K.sfx.win(); if (!reduced) celebrate(r.distance); }
    else K.sfx.coin();
    announce(heading + '، ' + r.distance + ' متر، ' + parts.total + ' عملة');
  }
  // CSS confetti and a quick count-up while the canvas rests.
  function celebrate(distance) {
    if (!burstEl) {
      burstEl = document.createElement('div'); burstEl.className = 'burst'; burstEl.setAttribute('aria-hidden', 'true');
      for (var n = 0; n < 16; n++) burstEl.innerHTML += '<i style="--a:' + (n * 22.5) + 'deg;background:' + CONFETTI[n % 6] + '"></i>';
      $('panel').appendChild(burstEl);
    }
    $('panel').classList.remove('celebrate'); void $('panel').offsetWidth; $('panel').classList.add('celebrate');
    var meters = $('result-meters'), began = performance.now();
    (function count(now) {
      var k = Math.min(1, (now - began) / 650);
      meters.textContent = K.fmt(modalMode === 'result' ? distance * k * (2 - k) : distance);
      if (k < 1 && modalMode === 'result') requestAnimationFrame(count);
    })(began);
  }

  /* ------------------------------------------------------------- loop */
  function updateHud() {
    var b = s.ball, meters = b ? Math.floor(b.maxX) : 0;
    if (meters !== hud.meters) { $('meters').textContent = K.fmt(meters); hud.meters = meters; }
    var coins = b ? P.reward({ coins: b.coins, gems: b.gems, rings: b.rings, pops: b.pops }).coins : 0;
    if (coins !== hud.coins) { $('run-coins').textContent = K.fmt(coins); hud.coins = coins; }
    var alt = b ? Math.max(0, Math.floor(b.y - P.heightAt(s.course, b.x))) : 0;
    if (alt !== hud.alt) {
      hud.alt = alt; $('alt-meters').textContent = K.fmt(alt);
      var f = Math.min(1, alt / P.SPACE);
      $('alt-fill').style.height = (f * 286) + 'px'; $('alt-ball').style.bottom = (f * 292) + 'px';
    }
    var total = b ? b.rockets : P.rocketsOf(save.upgrades), left = b ? b.rocketsLeft : total, key = total + '/' + left;
    if (key !== hud.rockets) {
      hud.rockets = key;
      var row = $('rockets'), html = '';
      for (var n = 0; n < total; n++) html += ROCKET_SVG.replace('<svg', '<svg class="' + (n >= left ? 'spent' : '') + '"');
      row.innerHTML = html;
      row.setAttribute('aria-label', 'الصواريخ: ' + left + ' من ' + total);
    }
  }
  function camera(dt) {
    var c = s.cam, tx, ty, tz;
    if (s.phase === 'flight' || s.phase === 'landed') {
      var b = s.ball, ground = P.heightAt(s.course, b.x), speed = Math.hypot(b.vx, b.vy), alt = Math.max(0, b.y - ground);
      tz = s.phase === 'landed' ? 1.35 : clamp(1.5 - speed * 0.012 - alt * 0.005, 0.32, 1.5);
      var k = A.PPM * c.zoom;
      tx = b.x + (s.phase === 'landed' ? 0 : clamp(b.vx * 0.3, -6, 26)) + 150 / k;
      ty = Math.max(ground + 190 / k, b.y - 170 / k);
      if (s.phase === 'landed') ty = ground + 90 / k;
      c.x += (tx - c.x) * Math.min(1, dt * 7);
      c.y += (ty - c.y) * Math.min(1, dt * 5);
      c.zoom += (tz - c.zoom) * Math.min(1, dt * 2.2);
      // The easing may lag behind a rocket; never let the ball leave a safe box.
      k = A.PPM * c.zoom;
      var bx = 640 + (b.x - c.x) * k, by = 360 - (b.y - c.y) * k;
      if (bx < 220) c.x -= (220 - bx) / k; else if (bx > 900) c.x += (bx - 900) / k;
      if (by < 150) c.y += (150 - by) / k; else if (by > 600) c.y -= (by - 600) / k;
    } else {
      tx = TEE_CAM.x; ty = TEE_CAM.y + P.heightAt(s.course, 0); tz = TEE_CAM.zoom;
      c.x += (tx - c.x) * Math.min(1, dt * 4); c.y += (ty - c.y) * Math.min(1, dt * 4); c.zoom += (tz - c.zoom) * Math.min(1, dt * 4);
    }
  }
  function effects(dt) {
    for (var n = s.particles.length - 1; n >= 0; n--) {
      var p = s.particles[n]; p.t += dt;
      if (p.t >= p.life) { s.particles.splice(n, 1); continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      p.vx *= 1 - dt * 1.5;
    }
    for (n = s.popups.length - 1; n >= 0; n--) { s.popups[n].t += dt / s.popups[n].life; if (s.popups[n].t >= 1) s.popups.splice(n, 1); }
    shake = Math.max(0, shake - dt * 45);
    s.shake.x = reduced ? 0 : (Math.random() - 0.5) * shake; s.shake.y = reduced ? 0 : (Math.random() - 0.5) * shake;
    s.flash = Math.max(0, s.flash - dt * 3);
    if (s.flame > 0) s.flame -= dt;
    if (s.squash) s.squash.t += dt;
    if (s.padPulse) { s.padPulse.t += dt; if (s.padPulse.t > 0.5) s.padPulse = null; }
    if (s.propHit) { s.propHit.t += dt; if (s.propHit.t > 0.5) s.propHit = null; }
    if (s.landed) s.landed.t += dt;
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').hidden = true; }
  }
  function golferPose(dt) {
    var g = s.golfer;
    if (s.phase === 'title' || s.phase === 'ready') {
      gaugeT += dt;
      var v = s.phase === 'ready' ? 0.5 - 0.5 * Math.cos(gaugeT * Math.PI * 2 / GAUGE_PERIOD) : 0;
      s.gauge.value = v;
      // On the title the golfer lines up the ball with a small waggle.
      g.angle = s.phase === 'ready' ? A.gaugeAngle(v) : A.ADDRESS + 0.12 + 0.08 * Math.sin(s.time * 2.4);
      var hot = s.phase === 'ready' && v >= P.bands.perfect;
      if (hot && !gaugeHot) sfx.gauge();
      gaugeHot = hot;
    } else if (s.phase === 'swing') {
      swing.t += dt;
      var k = Math.min(1, swing.t / SWING_TIME);
      g.angle = swing.from + (A.ADDRESS - swing.from) * k * k;
      if (k >= 1) contact();
    } else if (follow >= 0) {
      follow += dt;
      var f = Math.min(1, follow / 0.3);
      g.angle = A.ADDRESS - (1 - Math.pow(1 - f, 3)) * 2.6;
    }
    // A little hop of joy after a perfect hit.
    if (g.jumpT > 0) { g.jumpT += dt; g.jump = Math.sin(Math.min(1, g.jumpT / 0.5) * Math.PI) * 24; if (g.jumpT > 0.5) g.jumpT = g.jump = 0; }
  }
  function step(dt) {
    if (paused || modalMode || document.hidden) { K.keys.endFrame(); return; }
    s.time += dt;
    golferPose(dt);
    if (hitStop > 0) { hitStop -= dt; s.flash = Math.max(0, s.flash - dt * 2); K.keys.endFrame(); return; }
    if (s.phase === 'flight') flight(dt);
    else if (s.phase === 'landed') { landedT += dt; if (landedT > 1.6) showResult(); }
    camera(dt);
    effects(dt);
    K.keys.endFrame();
  }
  function flight(dt) {
    var b = s.ball;
    var events = P.step(s.course, b, save.upgrades, dt * P.pace(b));
    for (var n = 0; n < events.length; n++) onEvent(events[n]);
    if (s.time > busyAt) { busyAt = s.time + 1; Kit.stats.busy(); }
    if (!reduced && !b.done) { s.trail.push({ x: b.x, y: b.y }); if (s.trail.length > 26) s.trail.shift(); }
    if (b.mode === 'air' && b.vy < 0 && !b.done) {
      var p = P.predictImpact(s.course, b, P.ARM_WINDOW);
      s.reticle = p ? { x: p.x, y: p.y, t: p.t } : null;
    } else s.reticle = null;
    if (s.unlockX && !unlockSeen && b.maxX >= s.unlockX) {
      unlockSeen = true; sfx.fanfare();
      toast('فتحت ' + s.unlockName + '!', 2.2);
    }
    updateHud();
    if (b.done) land();
  }
  function render() {
    // Paused, a menu open or nothing new: keep the last frame.
    if (!renderDirty && renderedTime === s.time) return;
    renderDirty = false; renderedTime = s.time;
    ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, 0, 0);
    A.draw(ctx, s);
  }

  /* ------------------------------------------------------------ input */
  button('play', start); button('pause', togglePause); button('resume', closeModal); button('restart', start);
  button('again', start); button('menu', menu); button('close-modal', closeModal);
  button('open-shop', function () { openModal('shop'); }); button('open-worlds', function () { openModal('worlds'); });
  // Act on press, like Space: a click fires on release, after the gauge has moved on.
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault(); A2.unlock(); canvas.focus({ preventScroll: true }); action();
  });
  window.addEventListener('keydown', function (e) {
    if (e.repeat || e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;
    // Keep the advertised P and R shortcuts while a modal button has focus,
    // without taking native Enter/Space activation from that button.
    var modalShortcut = ((modalMode === 'pause' && e.code === 'KeyP') || (modalMode === 'result' && e.code === 'KeyR')) &&
      !e.defaultPrevented && !e.target.isContentEditable && e.target.closest && e.target.closest('button');
    if (!K.isGameKeyEvent(e) && !modalShortcut) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      if (modalMode === 'shop' || modalMode === 'worlds') closeModal(); else togglePause();
      return;
    }
    if (e.code === 'KeyR' && s.phase === 'result') { e.preventDefault(); start(); return; }
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (modalMode === 'result') { if (newWorld >= 0) playWorld(newWorld); else start(); }
      else if (!modalMode) action();
    }
  });

  resetScene(); stats(); controls(); updateHud();
  K.loop(step, render);
  // Losing the frame must neither resume an existing pause nor pull focus back
  // from the portal into the newly opened pause dialog.
  K.lifecycle({ pause: function () { pause(false); } });
  K.ready();
})();
