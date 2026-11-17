/* Toy Castle: Mega-Mech & Lego-Knight Siege (قلعة الألعاب) — Presentation, Input & HUD */
(function () {
  'use strict';

  var TC = window.TCEngine;
  var Kit = window.Kit;
  var art = Kit.art;
  var J = Kit.juice;

  var canvas = document.getElementById('game');
  var ui = document.getElementById('ui');
  var liveEl = document.getElementById('live');

  /* MUST call Kit.art.init BEFORE Kit.fit so HiDPI sprite buckets bind cleanly */
  art.init({ canvas: canvas, mode: '2d', theme: 'day' });

  var pauseDrawn = false;
  function syncUi(v) {
    var cw = Math.round(TC.W * v.scale), ch = Math.round(TC.H * v.scale);
    ui.style.left = Math.round((window.innerWidth - cw) / 2) + 'px';
    ui.style.top = Math.round((window.innerHeight - ch) / 2) + 'px';
    ui.style.transform = 'scale(' + v.scale + ')';
  }
  var view = Kit.fit(canvas, TC.W, TC.H, {
    onResize: function (v) { syncUi(v); pauseDrawn = false; }
  });
  var ctx = view.ctx;
  syncUi(view);

  Kit.muteButton();
  var store = Kit.store('toy-castle');
  var save = TC.loadSave(store.get('save'));
  var saveFlag = Kit.saveStatus({ retry: function () { return persist(); } });
  var dda = Kit.dda('toy-castle', { id: 'main', start: 0.35 });

  function persist() {
    var ok = store.set('save', save);
    if (ok) saveFlag.saved(); else saveFlag.failed();
    return ok;
  }

  function announce(msg) {
    if (liveEl) liveEl.textContent = msg;
  }

  /* ------------------------------ Visual FX & Springs ------------------------------ */
  var fx = art.fx(280);
  var fxCount = 0, shakeAmt = 0;
  var cannonSpring = [art.spring(280, 14), art.spring(280, 14)];
  var fortSpring = [art.spring(240, 13), art.spring(240, 13)];
  var rings = [];
  var titleTick = 0;

  function addBurst(x, y, opts) {
    if (Kit.motion.reduced()) return;
    var n = (opts && opts.n) || 10;
    fxCount = Math.min(280, fxCount + n);
    fx.burst(x, y, opts);
  }

  function addRing(x, y, maxR, color) {
    if (Kit.motion.reduced()) return;
    if (rings.length < 18) rings.push({ x: x, y: y, r: 10, maxR: maxR, life: 0.28, max: 0.28, color: color });
  }

  function addShake(power) {
    if (Kit.motion.reduced()) { shakeAmt = 0; return; }
    shakeAmt = Math.min(1, shakeAmt + power);
    art.shake.add(power);
  }

  function clearFx() {
    rings.length = 0;
    fxCount = 0;
    shakeAmt = 0;
  }

  /* ------------------------------ Baked Sprites (Bounded Static Keys) ------------------------------ */
  var WORLD_THEMES = [
    { sky: ['#1e40af', '#38bdf8', '#fde68a'], bridge: '#64748b', trim: '#fbbf24', moat: '#0284c7', hill: '#1e3a8a' },
    { sky: ['#0f172a', '#0e7490', '#67e8f9'], bridge: '#334155', trim: '#22d3ee', moat: '#083344', hill: '#1e293b' },
    { sky: ['#450a0a', '#c2410c', '#fde047'], bridge: '#44403c', trim: '#fb923c', moat: '#ea580c', hill: '#7c2d12' },
    { sky: ['#09061e', '#3b0764', '#818cf8'], bridge: '#1e293b', trim: '#c084fc', moat: '#312e81', hill: '#1e1b4b' }
  ];

  function getWorldBg(wIdx) {
    wIdx = wIdx | 0;
    return art.bake('bg_w' + wIdx, TC.W, TC.H, function (c, w, h) {
      var th = WORLD_THEMES[wIdx] || WORLD_THEMES[0];
      var g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, th.sky[0]);
      g.addColorStop(0.58, th.sky[1]);
      g.addColorStop(1, th.sky[2]);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);

      /* Stars / distant world silhouettes */
      var i;
      if (wIdx === 3) {
        c.fillStyle = 'rgba(255,255,255,0.75)';
        for (i = 0; i < 42; i++) {
          c.beginPath();
          c.arc((i * 173 + 41) % w, (i * 89 + 23) % 340, (i % 3) + 1.2, 0, 6.283);
          c.fill();
        }
        c.fillStyle = '#a855f7';
        c.beginPath(); c.arc(920, 150, 48, 0, 6.283); art.outlined(c, '#a855f7', 3);
        c.strokeStyle = '#fde047'; c.lineWidth = 6;
        c.beginPath(); c.ellipse(920, 150, 86, 18, -0.25, 0, 6.283); c.stroke();
      } else {
        c.fillStyle = 'rgba(255,255,255,0.22)';
        for (i = 0; i < 4; i++) {
          var cx = 210 + i * 280, cy = 115 + (i % 2) * 32;
          art.round(c, cx - 70, cy - 18, 140, 36, 18); c.fill();
          art.round(c, cx - 38, cy - 34, 80, 28, 14); c.fill();
        }
      }

      /* Distant jagged mountains / hangar girders */
      c.beginPath();
      c.moveTo(0, 520);
      var peaks = [0, 380, 190, 290, 380, 395, 560, 265, 740, 385, 930, 275, 1110, 370, 1280, 310];
      for (i = 0; i < peaks.length; i += 2) c.lineTo(peaks[i], peaks[i + 1]);
      c.lineTo(w, 520);
      c.closePath();
      c.fillStyle = th.hill;
      c.fill();

      if (wIdx === 1) {
        c.strokeStyle = 'rgba(34,211,238,0.22)';
        c.lineWidth = 4;
        for (i = 220; i < 1080; i += 140) {
          c.strokeRect(i, 160, 70, 360);
        }
      }

      /* Moat / lava / energy trench under bridge */
      c.fillStyle = th.moat;
      c.fillRect(0, TC.GROUND_Y + 18, w, h - TC.GROUND_Y - 18);
      c.fillStyle = 'rgba(255,255,255,0.16)';
      for (i = 0; i < 9; i++) {
        art.round(c, 90 + i * 135, TC.GROUND_Y + 58 + (i % 2) * 26, 86, 10, 5);
        c.fill();
      }

      /* Bridge arches & pillars */
      for (i = 0; i < 5; i++) {
        var px = 220 + i * 195;
        art.round(c, px, TC.GROUND_Y + 10, 50, 190, 8);
        art.outlined(c, art.shade(th.bridge, -0.24), 3);
      }

      /* Snap-brick studs along bridge top */
      for (i = 176; i < 1104; i += 34) {
        art.round(c, i, TC.GROUND_Y - 11, 20, 12, 4);
        art.outlined(c, th.trim, 2.5);
      }

      /* Main armored battle bridge deck */
      art.round(c, 0, TC.GROUND_Y - 2, w, 36, 6);
      art.outlined(c, th.bridge, 3.5);
      art.gloss(c, 0, TC.GROUND_Y, w, 18);

      /* Center tactical pad visual */
      var pad = TC.WORLDS[wIdx].pad;
      if (pad !== 'none') {
        var pCol = pad === 'turbo' ? '#22d3ee' : pad === 'lava' ? '#f97316' : '#c084fc';
        art.round(c, TC.PAD_X - 46, TC.GROUND_Y - 8, 92, 16, 7);
        art.outlined(c, pCol, 3);
      }
    });
  }

  function getFortSprite(side, styleIdx) {
    var key = side === 0 ? 'fort_0_' + styleIdx : 'fort_1_' + styleIdx;
    return art.sprite(key, 210, 350, function (c, w, h) {
      var arm = side === 0 ? (TC.ARMORS[styleIdx] || TC.ARMORS[0]) : null;
      var rivalCols = [
        { main: '#991b1b', trim: '#f59e0b', glow: '#fb7185' },
        { main: '#334155', trim: '#ef4444', glow: '#f43f5e' },
        { main: '#7c2d12', trim: '#facc15', glow: '#fb923c' },
        { main: '#4c1d95', trim: '#f43f5e', glow: '#e879f9' }
      ];
      var pal = arm || rivalCols[styleIdx % 4];
      var dark = art.shade(pal.main, -0.28);

      c.save();
      if (side === 1) { c.translate(w, 0); c.scale(-1, 1); }

      /* Flagpole & War Banner */
      c.strokeStyle = '#1b1640'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(64, 14); c.lineTo(64, 78); c.stroke();
      c.beginPath();
      c.moveTo(66, 16); c.lineTo(132, 26); c.lineTo(116, 40); c.lineTo(132, 52); c.lineTo(66, 56); c.closePath();
      art.outlined(c, pal.trim, 3);

      /* Rear High Keep */
      art.round(c, 16, 74, 114, 266, 12);
      art.outlined(c, dark, 3.5);

      /* Snap-brick battlements */
      for (var i = 0; i < 4; i++) {
        art.round(c, 14 + i * 31, 54, 24, 28, 6);
        art.outlined(c, pal.trim, 3);
      }

      /* Front Armored Bastion */
      art.round(c, 26, 118, 152, 224, 14);
      art.outlined(c, pal.main, 4);
      art.gloss(c, 30, 122, 144, 52);

      /* Roof Cannon Turret Pedestal */
      art.round(c, 98, 92, 76, 32, 10);
      art.outlined(c, pal.trim, 3.5);

      /* Glowing Reactor Window */
      art.round(c, 52, 154, 42, 58, 20);
      art.outlined(c, '#090e1f', 3);
      art.round(c, 58, 162, 30, 42, 14);
      c.fillStyle = pal.glow; c.fill();

      /* Armored Siege Gate */
      art.round(c, 116, 226, 62, 116, 28);
      art.outlined(c, '#0f172a', 4);
      c.strokeStyle = pal.trim; c.lineWidth = 3;
      c.beginPath();
      c.moveTo(132, 232); c.lineTo(132, 338);
      c.moveTo(148, 230); c.lineTo(148, 338);
      c.moveTo(164, 234); c.lineTo(164, 338);
      c.stroke();

      c.restore();
    }, { pad: 8 });
  }

  function getCannonSprite(side, skinIdx) {
    var key = side === 0 ? 'can_0_' + skinIdx : 'can_1';
    return art.sprite(key, 92, 52, function (c) {
      var sk = side === 0 ? (TC.CANNONS[skinIdx] || TC.CANNONS[0]) : { barrel: '#7f1d1d', tip: '#fb7185', bolt: '#ef4444' };
      /* Barrel */
      art.round(c, 24, 11, 56, 30, 9);
      art.outlined(c, sk.barrel, 3.5);
      art.gloss(c, 26, 13, 50, 14);
      /* Muzzle Tip */
      art.round(c, 70, 7, 16, 38, 6);
      art.outlined(c, sk.tip, 3.5);
      /* Breech Core */
      c.beginPath(); c.arc(28, 26, 18, 0, 6.283);
      art.outlined(c, art.shade(sk.barrel, -0.2), 3.5);
      c.beginPath(); c.arc(28, 26, 8, 0, 6.283);
      c.fillStyle = sk.bolt; c.fill();
    }, { pad: 6 });
  }

  function getCrateSprite() {
    return art.sprite('crate_sky', 64, 80, function (c) {
      /* Parachute */
      c.beginPath();
      c.arc(32, 28, 26, Math.PI, 0);
      c.closePath();
      art.outlined(c, '#f97316', 3);
      c.beginPath(); c.arc(32, 28, 14, Math.PI, 0); c.closePath();
      c.fillStyle = '#fde047'; c.fill();
      c.strokeStyle = '#1b1640'; c.lineWidth = 2;
      c.beginPath();
      c.moveTo(10, 28); c.lineTo(22, 46);
      c.moveTo(54, 28); c.lineTo(42, 46);
      c.stroke();
      /* Supply Box */
      art.round(c, 14, 42, 36, 34, 8);
      art.outlined(c, '#eab308', 3.5);
      art.round(c, 18, 46, 28, 26, 5);
      c.fillStyle = '#0284c7'; c.fill();
      /* Bolt icon */
      c.fillStyle = '#fef08a';
      c.beginPath();
      c.moveTo(35, 48); c.lineTo(25, 60); c.lineTo(32, 60); c.lineTo(29, 70); c.lineTo(39, 57); c.lineTo(32, 57);
      c.closePath(); c.fill();
    }, { pad: 6 });
  }

  function getUnitSprite(side, type, gold, step, wIdx) {
    var key = type === 'boss' ? ('boss_' + wIdx + '_' + step) : ('u_' + side + '_' + type + '_' + (gold ? 1 : 0) + '_' + step);
    var dims = type === 'boss' ? [112, 108] : type === 'mech' ? [92, 92] : type === 'dino' ? [84, 68] : type === 'balloon' ? [68, 66] : [60, 62];
    return art.sprite(key, dims[0], dims[1], function (c, w, h) {
      var main = side === 0 ? (gold ? '#eab308' : '#2563eb') : '#dc2626';
      var trim = side === 0 ? (gold ? '#fef08a' : '#38bdf8') : '#fb923c';
      var metal = side === 0 ? '#cbd5e1' : '#94a3b8';
      var bob = step ? 3 : -2;

      if (type === 'sword') {
        /* Legs */
        art.round(c, 18 - bob, 44, 10, 14, 4); art.outlined(c, '#334155', 2.5);
        art.round(c, 30 + bob, 44, 10, 14, 4); art.outlined(c, '#334155', 2.5);
        /* Snap-brick Torso */
        art.round(c, 16, 25, 26, 22, 6); art.outlined(c, main, 3);
        /* Plumed Knight Helmet */
        c.beginPath(); c.moveTo(22, 8); c.quadraticCurveTo(10, 2, 14, 16); c.lineTo(28, 14); c.closePath();
        art.outlined(c, trim, 2.5);
        art.round(c, 16, 10, 26, 19, 8); art.outlined(c, metal, 3);
        art.round(c, 26, 16, 14, 6, 3); c.fillStyle = '#090e1f'; c.fill();
        /* Energy Sword & Shield */
        c.save(); c.translate(42, 30); c.rotate(step ? 0.35 : -0.25);
        art.round(c, -3, -24, 8, 28, 4); art.outlined(c, trim, 2.5);
        c.restore();
        art.round(c, 26, 26, 16, 20, 7); art.outlined(c, trim, 2.5);
      } else if (type === 'rocket') {
        art.round(c, 18 - bob, 45, 10, 14, 4); art.outlined(c, '#1e293b', 2.5);
        art.round(c, 30 + bob, 45, 10, 14, 4); art.outlined(c, '#1e293b', 2.5);
        /* Backpack + Trooper Body */
        art.round(c, 10, 24, 10, 18, 4); art.outlined(c, '#475569', 2.5);
        art.round(c, 17, 25, 25, 22, 6); art.outlined(c, main, 3);
        /* Visor Helmet */
        art.round(c, 17, 10, 25, 18, 8); art.outlined(c, main, 3);
        art.round(c, 26, 14, 15, 8, 4); art.outlined(c, '#fde047', 2);
        /* Shoulder Bazooka */
        art.round(c, 14, 18, 40, 13, 5); art.outlined(c, '#334155', 3);
        art.round(c, 48, 16, 8, 17, 3); art.outlined(c, '#f97316', 2.5);
      } else if (type === 'dino') {
        /* Stomping Armored Legs */
        art.round(c, 18 - bob, 48, 15, 16, 5); art.outlined(c, '#334155', 3);
        art.round(c, 44 + bob, 48, 15, 16, 5); art.outlined(c, '#334155', 3);
        /* Tail & Armored Dino Shell */
        c.beginPath(); c.moveTo(16, 36); c.lineTo(3, 28 + bob); c.lineTo(16, 46); c.closePath();
        art.outlined(c, trim, 3);
        art.round(c, 14, 22, 48, 30, 13); art.outlined(c, side === 0 ? '#15803d' : '#991b1b', 3.5);
        art.round(c, 22, 18, 30, 14, 6); art.outlined(c, main, 3);
        /* Triceratops Frill Shield & Chrome Horns */
        art.round(c, 50, 12, 18, 34, 8); art.outlined(c, trim, 3);
        art.round(c, 56, 22, 20, 22, 8); art.outlined(c, side === 0 ? '#22c55e' : '#ef4444', 3);
        c.beginPath(); c.moveTo(72, 24); c.lineTo(83, 16); c.lineTo(75, 31); c.closePath();
        art.outlined(c, '#fef08a', 2.5);
        c.beginPath(); c.arc(67, 29, 3.5, 0, 6.283); c.fillStyle = '#090e1f'; c.fill();
      } else if (type === 'mech') {
        /* Heavy Mech Legs */
        art.round(c, 24 - bob, 64, 16, 24, 5); art.outlined(c, '#334155', 3.5);
        art.round(c, 50 + bob, 64, 16, 24, 5); art.outlined(c, '#334155', 3.5);
        /* Shoulder Laser Pod */
        art.round(c, 16, 10, 26, 14, 5); art.outlined(c, '#475569', 3);
        art.round(c, 38, 12, 10, 10, 3); art.outlined(c, trim, 2.5);
        /* Broad Armored Chest */
        art.round(c, 18, 22, 54, 46, 14); art.outlined(c, main, 4);
        art.gloss(c, 22, 25, 46, 20);
        /* Glowing Cockpit Visor */
        art.round(c, 34, 30, 30, 14, 6); art.outlined(c, '#090e1f', 3);
        art.round(c, 38, 33, 22, 8, 4); c.fillStyle = trim; c.fill();
        /* Power Core */
        c.beginPath(); c.arc(46, 54, 8, 0, 6.283); art.outlined(c, '#fde047', 2.5);
        /* Giant Smash Fist */
        art.round(c, 62, 42 + bob, 24, 22, 8); art.outlined(c, trim, 3.5);
      } else if (type === 'balloon') {
        /* Armored Rival Bomb-Blimp */
        art.round(c, 8, 10, 52, 32, 16); art.outlined(c, '#b91c1c', 3.5);
        art.gloss(c, 14, 13, 40, 14);
        c.fillStyle = '#fde047'; c.fillRect(28, 12, 12, 28);
        /* Gondola */
        art.round(c, 22, 44, 24, 14, 5); art.outlined(c, '#334155', 3);
        c.beginPath(); c.arc(34, 58, 5, 0, 6.283); art.outlined(c, '#f97316', 2);
      } else {
        /* World Boss! */
        var bCols = ['#7c2d12', '#0f766e', '#991b1b', '#581c87'];
        var bMain = bCols[wIdx % 4];
        art.round(c, 28 - bob, 74, 20, 30, 6); art.outlined(c, '#1e293b', 4);
        art.round(c, 62 + bob, 74, 20, 30, 6); art.outlined(c, '#1e293b', 4);
        /* Crown Spikes */
        c.beginPath();
        c.moveTo(32, 22); c.lineTo(24, 4); c.lineTo(44, 16); c.lineTo(56, 2); c.lineTo(68, 16); c.lineTo(86, 4); c.lineTo(78, 22);
        c.closePath(); art.outlined(c, '#facc15', 3.5);
        /* Boss Titan Torso */
        art.round(c, 18, 20, 74, 58, 18); art.outlined(c, bMain, 4.5);
        art.gloss(c, 24, 24, 62, 24);
        /* Menacing Visor */
        art.round(c, 42, 32, 38, 14, 6); art.outlined(c, '#090e1f', 3);
        art.round(c, 46, 35, 30, 8, 4); c.fillStyle = '#fb7185'; c.fill();
        /* Twin Plasma Siege Claws */
        art.round(c, 76, 46 + bob, 30, 24, 8); art.outlined(c, '#f97316', 4);
      }
    }, { pad: 6 });
  }

  /* ------------------------------ DOM Elements & HUD Building ------------------------------ */
  var screens = {
    title: document.getElementById('scrTitle'),
    map: document.getElementById('scrMap'),
    armory: document.getElementById('scrShop'),
    pause: document.getElementById('scrPause'),
    result: document.getElementById('scrResult')
  };
  var elHud = document.getElementById('hud');
  var elTray1p = document.getElementById('tray1p');
  var elTray2p = document.getElementById('tray2p');
  var elTrayP1 = document.getElementById('trayP1');
  var elTrayP2 = document.getElementById('trayP2');
  var elWorlds = document.getElementById('worlds');
  var elShelfArmors = document.getElementById('shelfArmors');
  var elShelfCannons = document.getElementById('shelfCannons');

  var screen = 'title', fromScreen = 'title';
  var world = null, roundOpen = false, nextStageIdx = 0;
  var hudRefs = { p1: null, p2: null };

  var UNIT_ICONS = { sword: 'i-sword', rocket: 'i-rocket', dino: 'i-dino', mech: 'i-mech' };
  var SHORT_NAMES = { sword: 'محارب السيف', rocket: 'رامي الصواريخ', dino: 'دبابة الديناصور', mech: 'العملاق الآلي' };

  function makeCard(opts) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'u-card' + (opts.cls ? ' ' + opts.cls : '');
    if (opts.id) b.id = opts.id;
    b.setAttribute('aria-label', opts.label);
    b.innerHTML =
      '<div class="cd-bar"></div>' +
      '<svg aria-hidden="true"><use href="#' + opts.icon + '"/></svg>' +
      '<span class="u-name">' + opts.name + '</span>' +
      '<div class="u-foot"><span class="u-cost" dir="ltr">' + opts.cost + '</span>' +
      '<span class="sg-key" dir="ltr">' + opts.key + '</span></div>';
    b.addEventListener('click', function (e) {
      opts.onClick();
      if (e.detail > 0) canvas.focus({ preventScroll: true });
    });
    return {
      el: b,
      cd: b.querySelector('.cd-bar'),
      cost: b.querySelector('.u-cost'),
      name: b.querySelector('.u-name')
    };
  }

  function buildDeck(container, side, keys, compact) {
    container.innerHTML = '';
    var eBox = document.createElement('div');
    eBox.className = 'e-box';
    eBox.innerHTML =
      '<div class="e-top"><svg aria-hidden="true"><use href="#i-bolt"/></svg><span class="e-val" dir="ltr">35</span></div>' +
      '<div class="e-sub">طاقة القلعة</div>';
    container.appendChild(eBox);

    var refs = { eVal: eBox.querySelector('.e-val'), eSub: eBox.querySelector('.e-sub'), units: {} };

    if (!compact) {
      refs.cannon = makeCard({
        id: 'card-cannon', cls: 'cannon-card', icon: 'i-cannon',
        name: 'مدفع القلعة', label: 'مدفع القلعة', cost: 'إطلاق', key: 'مسافة',
        onClick: function () { triggerFireOrSuper(0, false); }
      });
      container.appendChild(refs.cannon.el);
    }

    for (var i = 0; i < TC.UNIT_ORDER.length; i++) {
      (function (uType, kLabel) {
        var def = TC.UNITS[uType];
        var cRef = makeCard({
          id: side === 0 && !compact ? 'card-' + uType : '',
          icon: UNIT_ICONS[uType],
          name: compact ? SHORT_NAMES[uType].split(' ')[0] : SHORT_NAMES[uType],
          label: def.name, cost: String(def.cost), key: kLabel,
          onClick: function () { trySummon(side, uType); }
        });
        refs.units[uType] = cRef;
        container.appendChild(cRef.el);
      })(TC.UNIT_ORDER[i], keys.units[i]);
    }

    refs.sup = makeCard({
      id: side === 0 && !compact ? 'card-super' : '',
      cls: 'super-card', icon: 'i-meteor',
      name: compact ? 'خارقة' : 'الضربة الخارقة',
      label: 'الضربة الخارقة', cost: '0%', key: keys.sup,
      onClick: function () {
        if (compact) triggerFireOrSuper(side, false);
        else trySuper(side);
      }
    });
    container.appendChild(refs.sup.el);

    refs.gen = makeCard({
      id: side === 0 && !compact ? 'card-gen' : '',
      cls: 'gen-card', icon: 'i-bolt',
      name: compact ? 'المولّد' : 'تطوير المولّد',
      label: 'تطوير المولّد', cost: '40', key: keys.gen,
      onClick: function () { tryUpgrade(side); }
    });
    container.appendChild(refs.gen.el);
    return refs;
  }

  function setupTrays(humans) {
    if (humans === 1) {
      elTray1p.hidden = false;
      elTray2p.hidden = true;
      hudRefs.p1 = buildDeck(elTray1p, 0, { units: ['1', '2', '3', '4'], sup: '5', gen: '6' }, false);
      hudRefs.p2 = null;
    } else {
      elTray1p.hidden = true;
      elTray2p.hidden = false;
      hudRefs.p1 = buildDeck(elTrayP1, 0, { units: ['1', '2', '3', '4'], sup: 'مسافة', gen: '6' }, true);
      hudRefs.p2 = buildDeck(elTrayP2, 1, { units: ['7', '8', '9', '0'], sup: '⏎', gen: '=' }, true);
    }
  }

  function syncDeck(refs, side) {
    if (!refs || !world) return;
    var s = world.sides[side];
    var eFloor = Math.floor(s.energy);
    refs.eVal.textContent = String(eFloor);
    refs.eSub.textContent = 'مولّد ' + (s.genLv + 1) + '/' + TC.GEN_LEVELS.length;

    if (refs.cannon) {
      var cPct = Math.round((s.cannonCd / 0.62) * 100);
      refs.cannon.cd.style.height = (cPct > 0 ? cPct : 0) + '%';
    }

    for (var i = 0; i < TC.UNIT_ORDER.length; i++) {
      var t = TC.UNIT_ORDER[i], def = TC.UNITS[t], uRef = refs.units[t];
      var cdRatio = s.cds[t] > 0 ? Math.min(100, Math.round((s.cds[t] / def.cd) * 100)) : 0;
      uRef.cd.style.height = cdRatio + '%';
      uRef.el.classList.toggle('dim', s.energy < def.cost || s.cds[t] > 0);
    }

    var supPct = Math.floor(s.superCharge);
    var supReady = supPct >= 100;
    refs.sup.el.classList.toggle('ready', supReady);
    refs.sup.el.classList.toggle('dim', !supReady && ! hudRefs.p2);
    refs.sup.cost.textContent = supReady ? 'جاهز!' : (supPct + '%');

    var nextGen = TC.GEN_LEVELS[s.genLv + 1];
    if (!nextGen) {
      refs.gen.cost.textContent = 'أقصى';
      refs.gen.el.classList.add('dim');
    } else {
      refs.gen.cost.textContent = String(nextGen.cost);
      refs.gen.el.classList.toggle('dim', s.energy < nextGen.cost);
    }
  }

  /* ------------------------------ Screens, Map & Armory ------------------------------ */
  function syncHeaderChips() {
    var st = TC.totalStars(save) + '/' + (TC.LEVELS.length * 3);
    document.querySelector('#titleStars b').textContent = st;
    document.querySelector('#mapStars b').textContent = st;
    document.querySelector('#titleCoins b').textContent = Kit.fmt(save.coins);
    document.querySelector('#shopCoins b').textContent = Kit.fmt(save.coins);
    var pills = document.querySelectorAll('.diff-pill');
    for (var i = 0; i < pills.length; i++) {
      pills[i].classList.toggle('on', pills[i].getAttribute('data-diff') === save.diff);
    }
  }

  function renderMap() {
    syncHeaderChips();
    elWorlds.innerHTML = '';
    for (var w = 0; w < TC.WORLDS.length; w++) {
      var col = document.createElement('div');
      col.className = 'w-col';
      var head = document.createElement('div');
      head.className = 'w-head';
      head.innerHTML = '<h3>' + TC.WORLDS[w].name + '</h3>';
      col.appendChild(head);

      for (var i = 0; i < TC.LEVELS.length; i++) {
        if (TC.LEVELS[i].world !== w) continue;
        (function (idx) {
          var stg = TC.LEVELS[idx], rec = save.lv[idx];
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'lvl';
          b.setAttribute('data-idx', String(idx));
          var starsHtml = '';
          for (var k = 1; k <= 3; k++) {
            starsHtml += '<svg class="' + (rec.s >= k ? 'on' : '') + '" aria-hidden="true"><use href="#i-star"/></svg>';
          }
          b.innerHTML =
            '<span class="l-id" dir="ltr">' + stg.id + '</span>' +
            '<span class="l-name">' + stg.name + '</span>' +
            '<span class="l-stars">' + starsHtml + '</span>';
          b.addEventListener('click', function () { J.select(); startBattle(idx, 1); });
          col.appendChild(b);
        })(i);
      }
      elWorlds.appendChild(col);
    }
  }

  function renderShelf(el, list, ownedArr, wornIdx, kind, iconId) {
    el.innerHTML = '';
    for (var i = 0; i < list.length; i++) {
      (function (idx) {
        var it = list[idx], isOwned = !!ownedArr[idx], isWorn = wornIdx === idx;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tile' + (isOwned ? ' owned' : '') + (isWorn ? ' wear' : '');
        b.setAttribute('data-kind', kind);
        b.setAttribute('data-idx', String(idx));
        var swBg = kind === 'armor' ? it.main : it.barrel;
        var swBorder = kind === 'armor' ? it.trim : it.tip;
        var tagHtml = isWorn ? 'مجهّز' : isOwned ? 'تجهيز' : ('<i class="coin"></i><span dir="ltr">' + it.price + '</span>');
        b.innerHTML =
          '<div class="sw" style="background:' + swBg + ';border-color:' + swBorder + '">' +
          '<svg aria-hidden="true"><use href="#' + iconId + '"/></svg></div>' +
          '<div class="t-name">' + it.name + '</div>' +
          '<div class="t-tag">' + tagHtml + '</div>';
        b.addEventListener('click', function () {
          var res = TC.buy(save, kind, idx);
          if (res === 'bought') { J.coin(3); J.chime(2); persist(); renderArmory(); }
          else if (res === 'wear') { J.select(); persist(); renderArmory(); }
          else J.error();
        });
        el.appendChild(b);
      })(i);
    }
  }

  function renderArmory() {
    syncHeaderChips();
    renderShelf(elShelfArmors, TC.ARMORS, save.armors, save.armor, 'armor', 'i-shield');
    renderShelf(elShelfCannons, TC.CANNONS, save.cannons, save.cannon, 'cannon', 'i-cannon');
  }

  function showScreen(next) {
    screen = next;
    pauseDrawn = false;
    for (var k in screens) screens[k].hidden = (k !== next);
    elHud.hidden = (next !== 'play');
    if (next === 'title') syncHeaderChips();
    else if (next === 'map') renderMap();
    else if (next === 'armory') renderArmory();
  }

  /* ------------------------------ Battle Lifecycle & Actions ------------------------------ */
  function startBattle(idx, humans) {
    if (roundOpen) { Kit.stats.end('quit', 0); roundOpen = false; }
    clearFx();
    Kit.keys.reset();
    if (humans === 2) {
      world = TC.createVersus({ worldIdx: idx % TC.WORLDS.length, seed: (Date.now() & 0xffff) || 4242 });
    } else {
      var prm = TC.params(dda.level, save.diff);
      world = TC.create(idx, prm, { diff: save.diff, seed: ((Date.now() & 0xffff) + idx * 97) || 1337 });
    }
    var roundTag = humans === 2 ? 'tc_vs' : 'tc_' + world.stage.id;
    Kit.stats.round(roundTag);
    roundOpen = true;
    setupTrays(humans);
    syncDeck(hudRefs.p1, 0);
    if (hudRefs.p2) syncDeck(hudRefs.p2, 1);
    showScreen('play');
    announce('بدأت المعركة: ' + world.stage.name);
    canvas.focus({ preventScroll: true });
  }

  function restartBattle() {
    if (!world) return;
    J.tap();
    startBattle(world.humans === 2 ? world.worldIdx : world.level, world.humans);
  }

  function setPause(on) {
    if (on && screen === 'play') {
      Kit.keys.reset();
      showScreen('pause');
      announce('استراحة');
    } else if (!on && screen === 'pause') {
      Kit.keys.reset();
      showScreen('play');
      canvas.focus({ preventScroll: true });
    }
  }

  function quitTo(target) {
    if (roundOpen) { Kit.stats.end('quit', 0); roundOpen = false; }
    world = null;
    clearFx();
    J.back();
    showScreen(target);
  }

  function trySummon(side, type) {
    if (screen !== 'play' || !world || world.done) return false;
    var u = TC.summon(world, side, type);
    if (!u) return false;
    return true;
  }

  function tryUpgrade(side) {
    if (screen !== 'play' || !world || world.done) return false;
    return TC.upgradeGen(world, side);
  }

  function trySuper(side) {
    if (screen !== 'play' || !world || world.done) return false;
    return TC.fireSuper(world, side);
  }

  function tryCannon(side, opts) {
    if (screen !== 'play' || !world || world.done) return false;
    return TC.fireCannon(world, side, opts);
  }

  function triggerFireOrSuper(side, withAssist) {
    if (screen !== 'play' || !world || world.done) return;
    var s = world.sides[side];
    if (s && s.superCharge >= 100) TC.fireSuper(world, side);
    TC.fireCannon(world, side, { assist: withAssist !== false });
  }

  function finishBattle() {
    if (!world || !roundOpen) return;
    roundOpen = false;
    var resBest = document.getElementById('resBest');
    var resTitle = document.getElementById('resTitle');
    var resStars = document.getElementById('resStars');
    var resNext = document.getElementById('resNext');
    var starNodes = resStars.querySelectorAll('svg');

    var hpPct = Math.round((world.sides[0].hp / world.sides[0].hpMax) * 100);
    document.querySelector('#resHp b').textContent = hpPct + '%';
    document.querySelector('#resTime b').textContent = Math.round(world.t) + 's';

    if (world.humans === 2) {
      Kit.stats.end('end', TC.scoreOf(world));
      resBest.hidden = true;
      resStars.hidden = true;
      resNext.hidden = true;
      resTitle.textContent = world.winner === 1 ? 'فاز اللاعب 1!' : 'فاز اللاعب 2!';
      document.querySelector('#resCoins b').textContent = '+0';
      J.levelUp();
    } else {
      var won = world.winner === 1;
      var st = TC.stars(world);
      var sc = TC.scoreOf(world);
      dda.result(won ? (0.62 + st * 0.12) : 0);
      Kit.stats.end(won ? 'win' : 'lose', sc);
      var out = TC.applyResult(save, world.level, st, world.t, save.diff);
      nextStageIdx = out.nextIdx;
      persist();

      resBest.hidden = !out.best;
      resStars.hidden = false;
      for (var i = 0; i < 3; i++) starNodes[i].classList.toggle('on', i < st);
      resTitle.textContent = won ? 'انتصار ساحق!' : 'حاول مجدداً!';
      document.querySelector('#resCoins b').textContent = '+' + out.earned;
      resNext.hidden = !won;
      if (won) { J.levelUp(); J.coin(2); } else J.fail();
    }
    showScreen('result');
    announce(resTitle.textContent);
  }

  /* ------------------------------ Event Drain (SFX, FX & Telemetry) ------------------------------ */
  function drainEvents(w) {
    var evs = w.ev;
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (ev.t === 'summon') {
        if (ev.side === 0 || w.humans === 2) J.pop(ev.unit === 'mech' ? 0.9 : 0.45);
        addBurst(ev.x, ev.y - 18, { n: 7, color: ev.side === 0 ? '#38bdf8' : '#fb7185', speed: 120, life: 0.35, size: 6 });
      } else if (ev.t === 'deny') {
        J.error();
      } else if (ev.t === 'upgrade') {
        J.chime(ev.lv);
        if (!Kit.motion.reduced()) art.pop('مولّد ' + ev.lv + '!', ev.side === 0 ? 160 : 1120, 320, { color: '#fde047', size: 28 });
      } else if (ev.t === 'cannon') {
        cannonSpring[ev.side].kick(-4.2);
        J.whoosh(0.75);
        addBurst(ev.x, ev.y, { n: 8, color: '#fde047', speed: 160, life: 0.28, size: 6, shape: 'spark' });
      } else if (ev.t === 'super') {
        J.streak(4);
        addShake(0.38);
        art.flash('#fde047', 160);
        if (!Kit.motion.reduced()) art.pop('الضربة الخارقة!', 640, 180, { color: '#fde047', size: 36 });
      } else if (ev.t === 'cratePop') {
        if (ev.side === 0) Kit.track.hit();
        J.coin(2);
        addBurst(ev.x, ev.y, { n: 14, color: '#fde047', speed: 210, life: 0.5, size: 8, shape: 'star' });
        if (!Kit.motion.reduced()) art.pop('+' + ev.energy, ev.x, ev.y - 12, { color: '#38bdf8', size: 28 });
      } else if (ev.t === 'clash') {
        J.tap();
        addBurst(ev.x, ev.y, { n: 5, color: '#fef08a', speed: 130, life: 0.25, size: 5, shape: 'spark' });
      } else if (ev.t === 'slam') {
        J.impact(0.65);
        addRing(ev.x, ev.y - 6, 68, ev.side === 0 ? '#38bdf8' : '#fb923c');
        addShake(0.16);
      } else if (ev.t === 'boom') {
        if (ev.kind === 'meteor' || ev.kind === 'cannon') {
          J.impact(ev.kind === 'meteor' ? 0.9 : 0.55);
          addRing(ev.x, ev.y, ev.kind === 'meteor' ? 92 : 58, '#fb923c');
          if (ev.kind === 'meteor') addShake(0.22);
        }
        addBurst(ev.x, ev.y, { n: ev.kind === 'meteor' ? 14 : 8, color: '#fb923c', speed: 190, life: 0.4, size: 7 });
      } else if (ev.t === 'kill') {
        if (ev.side === 0) Kit.track.hit();
        J.pop(0.7);
        addBurst(ev.x, ev.y - 20, { n: 12, color: ev.victimSide === 1 ? '#fb923c' : '#60a5fa', speed: 200, life: 0.45, size: 7, shape: 'confetti' });
      } else if (ev.t === 'castleHit') {
        fortSpring[ev.side].kick(-3.2);
        J.impact(0.5);
        addShake(0.14);
        if (ev.side === 1) Kit.track.hit();
        else if (w.humans === 1) Kit.track.miss();
      } else if (ev.t === 'boss') {
        J.impact(0.95);
        addShake(0.35);
        if (!Kit.motion.reduced()) art.pop(TC.WORLDS[w.worldIdx].bossName + '!', 920, 220, { color: '#fb7185', size: 34 });
      } else if (ev.t === 'pad' || ev.t === 'vent') {
        J.whoosh(0.5);
        addBurst(ev.x, ev.y - 10, { n: 8, color: '#22d3ee', speed: 150, life: 0.35, size: 6 });
      }
    }
    evs.length = 0;
  }

  /* ------------------------------ UI & Keyboard Wiring ------------------------------ */
  document.getElementById('btnPlay').addEventListener('click', function () { J.select(); startBattle(0, 1); });
  document.getElementById('btnLevels').addEventListener('click', function () { J.tap(); showScreen('map'); });
  document.getElementById('btnTwo').addEventListener('click', function () { J.select(); startBattle(0, 2); });
  document.getElementById('btnShop').addEventListener('click', function () { fromScreen = 'title'; J.tap(); showScreen('armory'); });

  document.getElementById('mapHome').addEventListener('click', function () { J.back(); showScreen('title'); });
  document.getElementById('mapShop').addEventListener('click', function () { fromScreen = 'map'; J.tap(); showScreen('armory'); });
  document.getElementById('shopBack').addEventListener('click', function () { J.back(); showScreen(fromScreen || 'title'); });

  document.getElementById('btnPause').addEventListener('click', function () { J.tap(); setPause(true); });
  document.getElementById('btnResume').addEventListener('click', function () { J.tap(); setPause(false); });
  document.getElementById('btnRestart').addEventListener('click', restartBattle);
  document.getElementById('btnMap').addEventListener('click', function () { quitTo('map'); });
  document.getElementById('btnPauseHome').addEventListener('click', function () { quitTo('title'); });

  document.getElementById('resNext').addEventListener('click', function () { J.select(); startBattle(nextStageIdx, 1); });
  document.getElementById('resAgain').addEventListener('click', restartBattle);
  document.getElementById('resMap').addEventListener('click', function () { J.tap(); showScreen('map'); });
  document.getElementById('resShop').addEventListener('click', function () { fromScreen = 'result'; J.tap(); showScreen('armory'); });

  var diffBtns = document.querySelectorAll('.diff-pill');
  for (var di = 0; di < diffBtns.length; di++) {
    diffBtns[di].addEventListener('click', function () {
      var d = this.getAttribute('data-diff');
      if (TC.DIFFS[d]) {
        save.diff = d;
        J.select();
        persist();
        syncHeaderChips();
      }
    });
  }

  /* Mouse aiming & firing directly on the battlefield canvas */
  canvas.addEventListener('pointermove', function (e) {
    if (screen !== 'play' || !world || world.humans !== 1) return;
    var p = view.toLogical(e.clientX, e.clientY);
    if (p.x > TC.CANNON_LX + 24 && p.y < 590) TC.aimAtPoint(world, 0, p.x, p.y);
  });

  canvas.addEventListener('pointerdown', function (e) {
    if (screen !== 'play' || !world || world.done || e.button === 2) return;
    var p = view.toLogical(e.clientX, e.clientY);
    if (p.y > 592) return;
    var cSide = (world.humans === 2 && p.x > 640) ? 1 : 0;
    if (TC.popCrate(world, p.x, p.y, cSide)) return;
    if (world.humans === 1) {
      tryCannon(0, { tx: p.x, ty: p.y, assist: false });
    } else if (p.x < 640) {
      tryCannon(0, { tx: p.x + 340, ty: p.y, assist: true });
    } else {
      tryCannon(1, { tx: p.x - 340, ty: p.y, assist: true });
    }
  });

  var P1_KEY_MAP = { Digit1: 'sword', Digit2: 'rocket', Digit3: 'dino', Digit4: 'mech' };
  var P1_PAD_MAP = { Numpad1: 'sword', Numpad2: 'rocket', Numpad3: 'dino', Numpad4: 'mech' };
  var P2_KEY_MAP = {
    Digit7: 'sword', Digit8: 'rocket', Digit9: 'dino', Digit0: 'mech',
    KeyU: 'sword', KeyI: 'rocket', KeyO: 'dino', KeyK: 'mech',
    Numpad1: 'sword', Numpad2: 'rocket', Numpad3: 'dino', Numpad4: 'mech'
  };

  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e)) return;
    var code = e.code;

    if (code === 'KeyP' && !e.repeat) {
      if (screen === 'play') { J.tap(); setPause(true); }
      else if (screen === 'pause') { J.tap(); setPause(false); }
      return;
    }
    if (code === 'Escape' && !e.repeat) {
      if (screen === 'play') { J.tap(); setPause(true); }
      else if (screen === 'pause') { J.tap(); setPause(false); }
      else if (screen === 'armory') { J.back(); showScreen(fromScreen || 'title'); }
      else if (screen === 'map') { J.back(); showScreen('title'); }
      else if (screen === 'result') { J.back(); showScreen('map'); }
      return;
    }
    if (code === 'KeyR' && !e.repeat && (screen === 'play' || screen === 'pause' || screen === 'result')) {
      restartBattle();
      return;
    }
    if ((code === 'Enter' || code === 'NumpadEnter') && !e.repeat && screen === 'result') {
      var rn = document.getElementById('resNext');
      if (!rn.hidden) { J.select(); startBattle(nextStageIdx, 1); }
      else restartBattle();
      return;
    }

    if (screen !== 'play' || !world || world.done || e.repeat) return;

    /* P1 Actions */
    var u1 = P1_KEY_MAP[code] || (world.humans === 1 ? P1_PAD_MAP[code] : null);
    if (u1) { trySummon(0, u1); return; }
    if (code === 'Digit5' || (world.humans === 1 && code === 'Numpad5')) { trySuper(0); return; }
    if (code === 'Digit6' || code === 'KeyG' || (world.humans === 1 && code === 'Numpad6')) { tryUpgrade(0); return; }
    if (code === 'Space') { triggerFireOrSuper(0, true); return; }

    /* P2 Actions (Shared Keyboard Duel — never touches P, R, M, Esc, Tab) */
    if (world.humans === 2) {
      var u2 = P2_KEY_MAP[code];
      if (u2) { trySummon(1, u2); return; }
      if (code === 'Minus' || code === 'KeyJ' || code === 'Numpad5') { trySuper(1); return; }
      if (code === 'Equal' || code === 'KeyL' || code === 'Numpad6') { tryUpgrade(1); return; }
      if (code === 'Enter' || code === 'NumpadEnter') { triggerFireOrSuper(1, true); }
    }
  });

  Kit.lifecycle({
    pause: function () { if (screen === 'play') setPause(true); }
  });

  /* ------------------------------ Simulation & Rendering Loop ------------------------------ */
  function pollHeldKeys(dt) {
    if (!world || world.done) return;
    /* Continuous unit deployment when holding key (silent when waiting for energy/cooldown) */
    var codes1 = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
    for (var i = 0; i < 4; i++) {
      var t = TC.UNIT_ORDER[i], def = TC.UNITS[t];
      var s0 = world.sides[0];
      if (Kit.keys.down(codes1[i]) && s0.cds[t] <= 0 && s0.energy >= def.cost) TC.summon(world, 0, t);
    }
    if (world.humans === 2) {
      var codes2 = ['Digit7', 'Digit8', 'Digit9', 'Digit0'];
      for (var j = 0; j < 4; j++) {
        var t2 = TC.UNIT_ORDER[j], def2 = TC.UNITS[t2], s1 = world.sides[1];
        if (Kit.keys.down(codes2[j]) && s1.cds[t2] <= 0 && s1.energy >= def2.cost) TC.summon(world, 1, t2);
      }
    }

    /* Smooth Roof Cannon keyboard barrel tilt */
    if (world.humans === 1) {
      if (Kit.keys.anyDown(['ArrowUp', 'KeyW'])) TC.setAim(world, 0, world.sides[0].aim - 1.35 * dt);
      if (Kit.keys.anyDown(['ArrowDown', 'KeyS'])) TC.setAim(world, 0, world.sides[0].aim + 1.35 * dt);
      if (Kit.keys.down('Space') && world.sides[0].cannonCd <= 0) triggerFireOrSuper(0, true);
    } else {
      if (Kit.keys.down('KeyW')) TC.setAim(world, 0, world.sides[0].aim - 1.35 * dt);
      if (Kit.keys.down('KeyS')) TC.setAim(world, 0, world.sides[0].aim + 1.35 * dt);
      if (Kit.keys.down('Space') && world.sides[0].cannonCd <= 0) triggerFireOrSuper(0, true);
      if (Kit.keys.down('ArrowUp')) TC.setAim(world, 1, world.sides[1].aim - 1.35 * dt);
      if (Kit.keys.down('ArrowDown')) TC.setAim(world, 1, world.sides[1].aim + 1.35 * dt);
      if ((Kit.keys.down('Enter') || Kit.keys.down('NumpadEnter')) && world.sides[1].cannonCd <= 0) triggerFireOrSuper(1, true);
    }
  }

  function update(dt) {
    if (screen === 'pause') return;
    if (screen !== 'play') {
      if (!Kit.motion.reduced()) titleTick += dt;
      return;
    }
    if (!world) return;

    pollHeldKeys(dt);
    TC.step(world, dt);
    drainEvents(world);

    cannonSpring[0].update(dt); cannonSpring[1].update(dt);
    fortSpring[0].update(dt); fortSpring[1].update(dt);
    fx.update(dt);
    art.pop.update(dt);
    art.flash.update(dt);
    art.shake.update(dt);

    if (Kit.motion.reduced()) {
      fxCount = 0; shakeAmt = 0; rings.length = 0;
    } else {
      fxCount = Math.max(0, fxCount - Math.ceil(dt * 45));
      shakeAmt = Math.max(0, shakeAmt - dt * 2.4);
      for (var i = rings.length - 1; i >= 0; i--) {
        rings[i].life -= dt;
        rings[i].r = rings[i].maxR * (1 - rings[i].life / rings[i].max);
        if (rings[i].life <= 0) rings.splice(i, 1);
      }
    }

    syncDeck(hudRefs.p1, 0);
    if (hudRefs.p2) syncDeck(hudRefs.p2, 1);

    if (world.done) finishBattle();
    Kit.keys.endFrame();
  }

  function drawAimArc(side) {
    var s = world.sides[side];
    var dir = side === 0 ? 1 : -1;
    var cx = (side === 0 ? TC.CANNON_LX : TC.CANNON_RX) + dir * 28;
    var cy = TC.CANNON_Y + Math.sin(s.aim) * 24;
    var vx = Math.cos(s.aim) * 820 * dir, vy = Math.sin(s.aim) * 820;
    ctx.save();
    ctx.fillStyle = side === 0 ? 'rgba(56, 189, 248, 0.78)' : 'rgba(251, 113, 133, 0.78)';
    for (var i = 1; i <= 7; i++) {
      var t = i * 0.095;
      var px = cx + vx * t, py = cy + vy * t + 0.5 * 230 * t * t;
      if (py > TC.GROUND_Y) break;
      ctx.beginPath();
      ctx.arc(px, py, i === 7 ? 6 : 4, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHpBar(x, y, w, h, hp, maxHp, label, fillCol, alignRight) {
    var ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    art.round(ctx, x, y, w, h, 12);
    art.outlined(ctx, '#090e1f', 3.5);
    if (ratio > 0) {
      var fw = Math.max(14, Math.round((w - 8) * ratio));
      var fx0 = alignRight ? (x + w - 4 - fw) : (x + 4);
      art.round(ctx, fx0, y + 4, fw, h - 8, 8);
      ctx.fillStyle = fillCol;
      ctx.fill();
      art.gloss(ctx, fx0, y + 4, fw, h - 8);
    }
    ctx.font = '800 18px Fredoka';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1b1640';
    ctx.lineWidth = 4;
    ctx.textAlign = alignRight ? 'right' : 'left';
    var tx = alignRight ? (x + w - 14) : (x + 14);
    ctx.strokeText(label, tx, y + h / 2);
    ctx.fillText(label, tx, y + h / 2);

    var hpTxt = hp + '/' + maxHp;
    ctx.textAlign = alignRight ? 'left' : 'right';
    var nx = alignRight ? (x + 14) : (x + w - 14);
    ctx.strokeText(hpTxt, nx, y + h / 2);
    ctx.fillText(hpTxt, nx, y + h / 2);
  }

  function drawPreviewScene() {
    var bg = getWorldBg(0);
    if (bg.canvas) ctx.drawImage(bg.canvas, 0, 0, TC.W, TC.H);
    var gold = TC.ARMORS[save.armor] && TC.ARMORS[save.armor].goldTrim;
    art.blit(ctx, getFortSprite(0, save.armor), 96, 366);
    art.blit(ctx, getFortSprite(1, 0), TC.W - 96, 366);
    var wob = Math.sin(titleTick * 2.2) * 0.08;
    art.blit(ctx, getCannonSprite(0, save.cannon), TC.CANNON_LX + 12, TC.CANNON_Y, { rot: -0.18 + wob });
    art.blit(ctx, getCannonSprite(1, 0), TC.CANNON_RX - 12, TC.CANNON_Y, { sx: -1, rot: 0.18 - wob });

    /* Elevated Hero Clash Showcase visible above command box */
    var step = ((titleTick * 3) | 0) % 2;
    var hover = Math.sin(titleTick * 2.6) * 6;
    art.round(ctx, 310, 382, 660, 22, 10);
    art.outlined(ctx, '#334155', 3.5);
    art.gloss(ctx, 314, 384, 652, 10);

    art.blit(ctx, getUnitSprite(0, 'mech', gold, step, 0), 420, 336, { sx: 1.08, sy: 1.08 });
    art.blit(ctx, getUnitSprite(0, 'sword', gold, step, 0), 525, 354);
    art.blit(ctx, getCrateSprite(), 640, 258 + hover, { rot: wob * 0.8 });
    art.blit(ctx, getUnitSprite(1, 'dino', false, step, 0), 760, 350, { sx: -1.05, sy: 1.05 });
    art.blit(ctx, getUnitSprite(1, 'boss', false, step, 0), 875, 330, { sx: -1 });
    art.blit(ctx, getUnitSprite(1, 'balloon', false, step, 0), 825, 214 - hover, { sx: -1 });

    /* Cannon plasma shot arc */
    ctx.beginPath(); ctx.arc(278, 240, 10, 0, 6.283); art.outlined(ctx, '#fde047', 3);
    ctx.beginPath(); ctx.arc(242, 248, 6, 0, 6.283); ctx.fillStyle = '#38bdf8'; ctx.fill();
    art.vignette(ctx, TC.W, TC.H, 0.28);
  }

  function render() {
    if (screen === 'pause' && pauseDrawn) return;
    if (screen === 'pause') pauseDrawn = true;

    ctx.clearRect(0, 0, TC.W, TC.H);
    if (!world) {
      drawPreviewScene();
      return;
    }

    ctx.save();
    art.shake.apply(ctx);

    var bg = getWorldBg(world.worldIdx);
    if (bg.canvas) ctx.drawImage(bg.canvas, 0, 0, TC.W, TC.H);

    /* Fortresses & Roof Cannons */
    var gold = TC.ARMORS[save.armor] && TC.ARMORS[save.armor].goldTrim;
    art.blit(ctx, getFortSprite(0, save.armor), 96, 366, { sx: fortSpring[0].sx, sy: fortSpring[0].sy });
    art.blit(ctx, getFortSprite(1, world.worldIdx), TC.W - 96, 366, { sx: fortSpring[1].sx, sy: fortSpring[1].sy });

    if (screen === 'play') {
      drawAimArc(0);
      if (world.humans === 2) drawAimArc(1);
    }

    art.blit(ctx, getCannonSprite(0, save.cannon), TC.CANNON_LX + 12, TC.CANNON_Y, {
      rot: world.sides[0].aim, sx: cannonSpring[0].sy, sy: cannonSpring[0].sx
    });
    art.blit(ctx, getCannonSprite(1, 0), TC.CANNON_RX - 12, TC.CANNON_Y, {
      sx: -cannonSpring[1].sy, sy: cannonSpring[1].sx, rot: -world.sides[1].aim
    });

    /* Sky Bonus Energy Crates */
    var crateSpr = getCrateSprite();
    for (var ci = 0; ci < world.crates.length; ci++) {
      var cr = world.crates[ci];
      art.blit(ctx, crateSpr, cr.x, cr.y - 10, { rot: Math.sin(cr.phase) * 0.1 });
    }

    /* Marching Toy Squads */
    for (var i = 0; i < world.units.length; i++) {
      var u = world.units[i];
      var step = ((u.anim * 1.4) | 0) & 1;
      var spr = getUnitSprite(u.side, u.type, u.side === 0 && gold, step, world.worldIdx);
      if (!u.flying) art.shadow(ctx, u.x - u.r, TC.GROUND_Y - u.r * 1.4, u.r * 2, u.r * 1.5, 0.45);
      var jumpSquash = u.atkT > 0 ? 1.12 : 1;
      art.blit(ctx, spr, u.x, u.y - spr.h * 0.45, {
        sx: (u.side === 0 ? 1 : -1) * jumpSquash,
        sy: u.hurtT > 0 ? 0.9 : 1
      });
      if (u.hp < u.hpMax) {
        var bw = Math.max(30, u.r * 1.6), bx = u.x - bw / 2, by = u.y - spr.h - 6;
        ctx.fillStyle = '#090e1f';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
        ctx.fillStyle = u.side === 0 ? '#4ade80' : '#fb7185';
        ctx.fillRect(bx, by, bw * (u.hp / u.hpMax), 5);
      }
    }

    /* Projectiles (Cannonballs, Missiles, Lasers, Super Meteors) */
    for (var pi = 0; pi < world.projs.length; pi++) {
      var p = world.projs[pi];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      if (p.kind === 'meteor') {
        art.round(ctx, -28, -12, 42, 24, 12);
        art.outlined(ctx, '#f97316', 3);
        ctx.beginPath(); ctx.arc(8, 0, 12, 0, 6.283);
        cFill(ctx, '#fef08a');
      } else if (p.kind === 'laser') {
        art.round(ctx, -16, -4, 32, 8, 4);
        art.outlined(ctx, p.side === 0 ? '#38bdf8' : '#fb7185', 2.5);
      } else {
        art.round(ctx, -10, -7, 20, 14, 7);
        art.outlined(ctx, p.side === 0 ? '#fde047' : '#fb7185', 3);
      }
      ctx.restore();
    }

    /* Shockwave Rings & Particles */
    for (var ri = 0; ri < rings.length; ri++) {
      var rg = rings[ri];
      ctx.save();
      ctx.globalAlpha = Math.max(0, rg.life / rg.max);
      ctx.strokeStyle = rg.color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(rg.x, rg.y, rg.r, rg.r * 0.42, 0, 0, 6.283);
      ctx.stroke();
      ctx.restore();
    }
    fx.draw(ctx);
    art.pop.draw(ctx);
    ctx.restore();

    art.flash.draw(ctx, TC.W, TC.H);

    /* Top Fortress Health Bars & Stage Badge (clear of #btnPause at left & .sg-mute at right) */
    var s0 = world.sides[0], s1 = world.sides[1];
    drawHpBar(82, 18, 360, 34, s0.hp, s0.hpMax, world.humans === 2 ? 'لاعب 1' : 'قلعتك', '#22c55e', false);
    drawHpBar(790, 18, 360, 34, s1.hp, s1.hpMax, world.humans === 2 ? 'لاعب 2' : 'الخصم', '#ef4444', true);

    art.round(ctx, 516, 14, 248, 42, 20);
    art.outlined(ctx, '#0f172a', 3.5);
    ctx.font = '800 19px Fredoka';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fde047';
    var badge = world.humans === 2 ? 'مواجهة لاعبين' : (world.stage.id + ' • ' + world.stage.name);
    ctx.fillText(badge, 640, 35);
  }

  function cFill(c, col) { c.fillStyle = col; c.fill(); }

  /* ------------------------------ Public Debug/Test Handle & Ready ------------------------------ */
  window.__game = {
    get state() {
      var s0 = world ? world.sides[0] : null, s1 = world ? world.sides[1] : null;
      return {
        screen: screen,
        id: world ? world.stage.id : '',
        level: world ? world.level : 0,
        worldIdx: world ? world.worldIdx : 0,
        humans: world ? world.humans : 1,
        diff: save.diff,
        time: world ? Math.round(world.t * 1000) / 1000 : 0,
        energy: s0 ? Math.round(s0.energy * 100) / 100 : 0,
        energyMax: s0 ? s0.energyMax : 0,
        energyR: s1 ? Math.round(s1.energy * 100) / 100 : 0,
        genLv: s0 ? s0.genLv + 1 : 1,
        superCharge: s0 ? Math.round(s0.superCharge) : 0,
        aim: s0 ? Math.round(s0.aim * 1000) / 1000 : 0,
        shots: s0 ? s0.shots : 0,
        shotsR: s1 ? s1.shots : 0,
        hpL: s0 ? s0.hp : 0, hpLMax: s0 ? s0.hpMax : 0,
        hpR: s1 ? s1.hp : 0, hpRMax: s1 ? s1.hpMax : 0,
        p1Spawned: world ? world.spawned[0] : 0,
        p2Spawned: world ? world.spawned[1] : 0,
        units: world ? world.units.length : 0,
        crates: world ? world.crates.length : 0,
        cratesPopped: world ? world.cratesPopped : 0,
        fx: fxCount,
        shake: Math.round(shakeAmt * 100) / 100,
        winner: world ? world.winner : 0
      };
    },
    get save() { return save; },
    get world() { return world; },
    point: function (x, y) {
      var r = canvas.getBoundingClientRect();
      return { x: r.left + x * view.scale, y: r.top + y * view.scale };
    }
  };

  showScreen('title');
  art.loop(update, render);
  Kit.ready();
})();
