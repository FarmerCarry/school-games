/*
 * جزيرة الفوضى (Chaos Island) — Kit.art 2D Renderer, Kit.juice SFX, Shop, DDA & Telemetry.
 */
(function () {
  'use strict';

  var E = window.CIEngine;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ui = $('ui');

  // Initialize Kit.art BEFORE Kit.fit so retina sprite bucketing hooks resize automatically.
  Kit.art.init({ canvas: canvas, mode: '2d', theme: 'day' });

  var pauseDirty = true;
  function syncUI(v) {
    ui.style.transform = 'translate(' + canvas.style.left + ',' + canvas.style.top + ') scale(' + v.scale + ')';
    pauseDirty = true;
  }
  var view = Kit.fit(canvas, E.W, E.H, { onResize: syncUI });
  var ctx = view.ctx;
  var ptr = Kit.pointer(view);
  Kit.muteButton();

  var store = Kit.store('chaos-island');
  var dda = Kit.dda('chaos-island', { id: 'main', target: 0.7, tiers: 5 });
  var fx = Kit.art.fx(320);

  function clampInt(n, lo, hi) { n = n | 0; return n < lo ? lo : n > hi ? hi : n; }
  function defaultSave() {
    return {
      v: 3, coins: 0, stars: 0, wins: 0, diff: 'normal', island: 0,
      helm: 'h_bandana', trail: 't_spark',
      owned: { h_bandana: 1, t_spark: 1 }, best: [0, 0, 0, 0]
    };
  }
  function loadSave() {
    var raw = store.get('save', null), s = defaultSave();
    if (raw && typeof raw === 'object') {
      s.coins = clampInt(raw.coins, 0, 999999);
      s.stars = clampInt(raw.stars, 0, 9999);
      s.wins = clampInt(raw.wins, 0, 9999);
      if (E.DIFFICULTIES[raw.diff]) s.diff = raw.diff;
      s.island = clampInt(raw.island, 0, E.ISLANDS.length - 1);
      if (raw.owned && typeof raw.owned === 'object') {
        var all = E.SHOP.helmets.concat(E.SHOP.trails);
        for (var i = 0; i < all.length; i++) if (raw.owned[all[i].id]) s.owned[all[i].id] = 1;
      }
      if (s.owned[raw.helm]) s.helm = raw.helm;
      if (s.owned[raw.trail]) s.trail = raw.trail;
      if (Array.isArray(raw.best)) {
        for (var b = 0; b < 4; b++) s.best[b] = clampInt(raw.best[b], 0, 99999);
      }
    }
    return s;
  }
  var save = loadSave();
  var saveUI = Kit.saveStatus({ retry: function () { persistSave(); } });
  function persistSave() {
    var ok = store.set('save', save) !== false;
    if (ok) saveUI.saved(); else saveUI.failed();
    return ok;
  }

  // One-shot procedural SFX via Kit.juice (ZERO background music or loops)
  var J = Kit.juice;
  var sfx = {
    tap: function () { if (J) J.tap(); },
    select: function () { if (J) J.select(); },
    back: function () { if (J) J.back(); },
    toggle: function (on) { if (J) J.toggle(on); },
    jump: function (dbl) { if (J) J.jump(dbl ? 0.85 : 0.45); },
    land: function () { if (J) J.land(0.45); },
    dash: function () { if (J) J.whoosh(0.85); },
    bonk: function () { if (J) { J.impact(0.75); J.pop(0.7); } },
    boom: function (p) { if (J) J.impact(p || 0.9); },
    hurt: function () { if (J) { J.impact(0.65); J.error(); } },
    shield: function () { if (J) J.chime(2); },
    crate: function () { if (J) J.chime(3); },
    coin: function (n) { if (J) J.coin((n % 5) + 1); },
    orb: function (c) { if (J) J.star(Math.min(3, c || 1)); },
    revive: function () { if (J) J.levelUp(); },
    win: function () { if (J) J.levelUp(); },
    lose: function () { if (J) J.fail(); }
  };

  /* -------------------- Procedural Outlined Sprites (Bounded Static Keys) -------------------- */
  var A = Kit.art, INK = A.pal.ink;
  var BODY_COLORS = ['#ff9f1c', '#2ec4b6', '#ef476f', '#00b4d8', '#38b000', '#8338ec'];
  var TRAIL_COLORS = { t_spark: '#ffffff', t_fire: '#ff5400', t_bolt: '#00f5d4', t_plasma: '#f72585' };
  var ISLE_ICONS = ['🌋', '🦖', '🛸', '🦈'];

  function bodySprite(idx) {
    var col = BODY_COLORS[idx % BODY_COLORS.length];
    return A.sprite('ci_body_' + (idx % 6), 50, 50, function (c) {
      // Boots
      A.round(c, 9, 36, 13, 10, 5); A.outlined(c, '#2b2d42', 3);
      A.round(c, 28, 36, 13, 10, 5); A.outlined(c, '#2b2d42', 3);
      // Heroic rounded torso
      A.round(c, 7, 8, 36, 33, 15); A.outlined(c, col, 3.2);
      // Belly highlight & battle belt
      c.fillStyle = A.shade(col, 0.35);
      A.round(c, 13, 12, 20, 11, 6); c.fill();
      c.fillStyle = '#1b1640';
      c.fillRect(8, 30, 34, 6);
      c.fillStyle = '#ffd166';
      c.fillRect(21, 29, 8, 8);
      // Fists
      c.beginPath(); c.arc(7, 27, 6, 0, 6.283); A.outlined(c, A.shade(col, -0.15), 2.8);
      c.beginPath(); c.arc(43, 27, 6, 0, 6.283); A.outlined(c, A.shade(col, -0.15), 2.8);
    }, { pad: 6 });
  }

  function helmSprite(helmId) {
    return A.sprite('ci_helm_' + helmId, 56, 38, function (c) {
      if (helmId === 'h_pirate') {
        c.beginPath();
        c.moveTo(4, 28); c.quadraticCurveTo(28, 2, 52, 28); c.lineTo(46, 33); c.lineTo(10, 33); c.closePath();
        A.outlined(c, '#2b2d42', 3);
        c.fillStyle = '#ffd166'; c.fillRect(14, 27, 28, 4);
        c.beginPath(); c.arc(28, 19, 5, 0, 6.283); c.fillStyle = '#fff'; c.fill();
      } else if (helmId === 'h_dino') {
        A.round(c, 8, 6, 40, 26, 11); A.outlined(c, '#2dc653', 3);
        c.fillStyle = '#fff';
        for (var t = 0; t < 4; t++) {
          c.beginPath(); c.moveTo(13 + t * 8, 28); c.lineTo(17 + t * 8, 35); c.lineTo(21 + t * 8, 28); c.fill();
        }
        c.fillStyle = '#ffbe0b'; c.beginPath(); c.arc(38, 15, 4, 0, 6.283); c.fill();
      } else if (helmId === 'h_mech') {
        A.round(c, 9, 6, 38, 26, 9); A.outlined(c, '#adb5bd', 3);
        A.round(c, 14, 14, 28, 10, 5); A.outlined(c, '#00f5d4', 2.5);
        c.fillStyle = '#ff006e'; c.fillRect(26, 1, 4, 7);
      } else if (helmId === 'h_astro') {
        c.beginPath(); c.arc(28, 21, 17, 3.14, 0); c.lineTo(45, 31); c.lineTo(11, 31); c.closePath();
        A.outlined(c, '#f8f9fa', 3);
        A.round(c, 15, 13, 26, 13, 6); A.outlined(c, '#ffb703', 2.5);
      } else if (helmId === 'h_crown') {
        c.beginPath();
        c.moveTo(10, 31); c.lineTo(12, 10); c.lineTo(21, 20); c.lineTo(28, 6); c.lineTo(35, 20); c.lineTo(44, 10); c.lineTo(46, 31); c.closePath();
        A.outlined(c, '#ffd000', 3);
        c.fillStyle = '#ff0054'; c.beginPath(); c.arc(28, 23, 4, 0, 6.283); c.fill();
      } else {
        // h_bandana
        A.round(c, 9, 17, 38, 12, 6); A.outlined(c, '#e63946', 3);
        c.beginPath(); c.moveTo(10, 22); c.lineTo(2, 16); c.lineTo(4, 28); c.closePath(); A.outlined(c, '#e63946', 2.5);
      }
    }, { pad: 6 });
  }

  function droneSprite(slot) {
    var tint = slot === 1 ? '#2ec4b6' : '#ff9f1c';
    return A.sprite('ci_drone_' + (slot ? 1 : 0), 66, 44, function (c) {
      c.fillStyle = '#1b1640';
      c.fillRect(6, 8, 18, 4); c.fillRect(42, 8, 18, 4);
      c.fillRect(13, 10, 4, 8); c.fillRect(49, 10, 4, 8);
      A.round(c, 14, 15, 38, 22, 11); A.outlined(c, tint, 3);
      A.round(c, 22, 18, 22, 12, 6); A.outlined(c, '#caf0f8', 2.5);
    }, { pad: 6 });
  }

  function platSprite(islId, kind, w, h) {
    return A.sprite('ci_pl_' + islId + '_' + kind, w, h, function (c, bw, bh) {
      var topCol = islId === 'volcano' ? '#f59e0b' : islId === 'dino' ? '#84cc16' : islId === 'alien' ? '#00f5d4' : '#90e0ef';
      var baseCol = islId === 'volcano' ? '#5c2d0c' : islId === 'dino' ? '#57534e' : islId === 'alien' ? '#312e81' : '#1d3557';
      var midCol = A.shade(baseCol, 0.18);
      A.round(c, 2, 2, bw - 4, bh - 4, 10); A.outlined(c, baseCol, 3.2);
      // Plank / stone block seams
      c.strokeStyle = 'rgba(27,22,64,0.45)'; c.lineWidth = 2;
      for (var sx = 46; sx < bw - 30; sx += 52) {
        c.beginPath(); c.moveTo(sx, 10); c.lineTo(sx, bh - 5); c.stroke();
      }
      A.round(c, 5, bh * 0.42, bw - 10, bh * 0.34, 5);
      c.fillStyle = midCol; c.fill();
      A.round(c, 4, 3, bw - 8, Math.max(10, bh * 0.38), 7);
      c.fillStyle = topCol; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.fillRect(14, 5, bw - 28, 3.5);
      // Corner rivets
      c.fillStyle = '#ffd166';
      c.beginPath(); c.arc(14, bh - 10, 3, 0, 6.283); c.arc(bw - 14, bh - 10, 3, 0, 6.283); c.fill();
    }, { pad: 4 });
  }

  function bgCenterSprite(islId) {
    return A.sprite('ci_bg_' + islId, 1180, 480, function (c) {
      if (islId === 'volcano') {
        // Distant sunlit clouds & volcanic islands
        c.fillStyle = 'rgba(255, 240, 180, 0.28)';
        c.beginPath(); c.arc(240, 110, 68, 0, 6.283); c.fill();
        c.fillStyle = 'rgba(124, 45, 18, 0.35)';
        c.beginPath(); c.moveTo(40, 470); c.lineTo(170, 270); c.lineTo(330, 470); c.fill();
        c.beginPath(); c.moveTo(850, 470); c.lineTo(1010, 285); c.lineTo(1140, 470); c.fill();

        // Pirate Galleon silhouette on left horizon
        c.save();
        c.translate(155, 385);
        c.beginPath(); c.moveTo(-65, 0); c.lineTo(65, 0); c.lineTo(46, 36); c.lineTo(-46, 36); c.closePath();
        A.outlined(c, '#5c2d0c', 3);
        c.fillStyle = '#1b1640'; c.fillRect(-4, -82, 7, 82);
        c.beginPath(); c.moveTo(2, -76); c.quadraticCurveTo(48, -50, 2, -16); c.closePath();
        A.outlined(c, '#fef3c7', 3);
        c.fillStyle = '#ef233c'; c.fillRect(2, -88, 22, 11);
        c.restore();

        // Smoke puffs above crater
        c.fillStyle = 'rgba(65, 45, 55, 0.45)';
        c.beginPath();
        c.arc(545, 72, 34, 0, 6.283); c.arc(590, 52, 44, 0, 6.283); c.arc(640, 74, 32, 0, 6.283);
        c.fill();

        // Main Erupting Pirate Volcano
        c.beginPath(); c.moveTo(355, 470); c.lineTo(520, 125); c.lineTo(660, 125); c.lineTo(825, 470); c.closePath();
        A.outlined(c, '#4a2016', 4.5);
        // Shading facet
        c.fillStyle = 'rgba(0,0,0,0.2)';
        c.beginPath(); c.moveTo(590, 125); c.lineTo(660, 125); c.lineTo(825, 470); c.lineTo(630, 470); c.closePath(); c.fill();
        // Glowing magma crown & lava rivers
        c.beginPath();
        c.moveTo(520, 125); c.lineTo(548, 195); c.lineTo(576, 156); c.lineTo(604, 206); c.lineTo(632, 160); c.lineTo(660, 125); c.closePath();
        A.outlined(c, '#ff5400', 3.5);
        c.fillStyle = '#ffee32';
        c.beginPath(); c.moveTo(540, 125); c.lineTo(565, 165); c.lineTo(595, 142); c.lineTo(625, 170); c.lineTo(644, 125); c.closePath(); c.fill();

        // Carved Pirate Skull Cavern
        c.beginPath(); c.arc(590, 315, 44, 0, 6.283); A.outlined(c, '#f1f5f9', 4);
        A.round(c, 568, 344, 44, 22, 6); A.outlined(c, '#f1f5f9', 3.5);
        c.fillStyle = '#ff4800';
        c.beginPath(); c.arc(574, 310, 11, 0, 6.283); c.arc(606, 310, 11, 0, 6.283); c.fill();
        c.fillStyle = '#1b1640';
        c.beginPath(); c.moveTo(590, 322); c.lineTo(583, 335); c.lineTo(597, 335); c.closePath(); c.fill();
      } else if (islId === 'dino') {
        // Prehistoric Jungle Ridges & Stepped Dino Temple
        c.fillStyle = 'rgba(15, 118, 110, 0.28)';
        c.beginPath(); c.arc(190, 420, 110, 3.14, 0); c.arc(990, 420, 110, 3.14, 0); c.fill();
        A.round(c, 390, 340, 400, 125, 12); A.outlined(c, '#78716c', 4);
        A.round(c, 450, 245, 280, 100, 12); A.outlined(c, '#a8a29e', 4);
        A.round(c, 510, 165, 160, 86, 12); A.outlined(c, '#d6d3d1', 4);
        c.fillStyle = '#4d7c0f'; c.fillRect(400, 336, 380, 14); c.fillRect(460, 242, 260, 12);
        // Giant T-Rex Skull Emblem
        A.round(c, 552, 272, 76, 52, 16); A.outlined(c, '#fef3c7', 3.5);
        c.fillStyle = '#ef4444'; c.beginPath(); c.arc(574, 294, 9, 0, 6.283); c.arc(606, 294, 9, 0, 6.283); c.fill();
      } else if (islId === 'alien') {
        // Cosmic Starfield + Ringed Cyber Planet
        c.fillStyle = 'rgba(255,255,255,0.75)';
        for (var st = 0; st < 28; st++) {
          c.beginPath(); c.arc((st * 137) % 1140 + 20, (st * 79) % 320 + 20, (st % 3) + 1.5, 0, 6.283); c.fill();
        }
        c.beginPath(); c.arc(590, 245, 88, 0, 6.283); A.outlined(c, '#4cc9f0', 4);
        c.strokeStyle = '#f72585'; c.lineWidth = 12;
        c.beginPath(); c.ellipse(590, 245, 175, 34, -0.2, 0, 6.283); c.stroke();
      } else {
        // Mecha-Glacier Peaks & Giant Industrial Gears
        c.beginPath(); c.moveTo(310, 470); c.lineTo(465, 155); c.lineTo(585, 305); c.lineTo(715, 120); c.lineTo(875, 470); c.closePath();
        A.outlined(c, '#a2d2ff', 4);
        c.fillStyle = 'rgba(255,255,255,0.45)';
        c.beginPath(); c.moveTo(465, 155); c.lineTo(510, 250); c.lineTo(430, 250); c.closePath(); c.fill();
        c.beginPath(); c.arc(590, 345, 52, 0, 6.283); A.outlined(c, '#495057', 4);
        c.beginPath(); c.arc(590, 345, 22, 0, 6.283); A.outlined(c, '#00f5d4', 3.5);
      }
    }, { pad: 6 });
  }

  function hazardSprite(kind) {
    if (kind === 'meteor') {
      return A.sprite('ci_hz_meteor', 58, 58, function (c) {
        c.beginPath(); c.moveTo(29, 2); c.lineTo(50, 26); c.lineTo(42, 52); c.lineTo(16, 52); c.lineTo(8, 26); c.closePath();
        A.outlined(c, '#ff5400', 3);
        c.beginPath(); c.arc(29, 34, 16, 0, 6.283); A.outlined(c, '#7f1d1d', 3);
        c.fillStyle = '#ffd000'; c.beginPath(); c.arc(24, 30, 5, 0, 6.283); c.fill();
      }, { pad: 6 });
    }
    if (kind === 'bomb') {
      return A.sprite('ci_hz_bomb', 46, 46, function (c) {
        c.strokeStyle = '#ffd166'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(23, 12); c.quadraticCurveTo(32, 2, 39, 8); c.stroke();
        c.beginPath(); c.arc(23, 27, 16, 0, 6.283); A.outlined(c, '#1e293b', 3);
        c.fillStyle = '#ff0054'; c.beginPath(); c.arc(39, 8, 5, 0, 6.283); c.fill();
      }, { pad: 6 });
    }
    if (kind === 'boulder') {
      return A.sprite('ci_hz_boulder', 62, 62, function (c) {
        A.blob(c, 31, 31, 26, 0.08, 1.2); A.outlined(c, '#78716c', 3.5);
        c.fillStyle = '#a8a29e'; c.beginPath(); c.arc(23, 22, 8, 0, 6.283); c.fill();
      }, { pad: 6 });
    }
    if (kind === 'ufo') {
      return A.sprite('ci_hz_ufo', 96, 50, function (c) {
        c.beginPath(); c.arc(48, 22, 20, 3.14, 0); A.outlined(c, '#72efdd', 3);
        c.beginPath(); c.ellipse(48, 28, 44, 13, 0, 0, 6.283); A.outlined(c, '#5e60ce', 3.2);
        c.fillStyle = '#ffbe0b';
        for (var i = -1; i <= 1; i++) { c.beginPath(); c.arc(48 + i * 22, 28, 4.5, 0, 6.283); c.fill(); }
      }, { pad: 6 });
    }
    if (kind === 'crate') {
      return A.sprite('ci_it_crate', 46, 46, function (c) {
        A.round(c, 3, 3, 40, 40, 8); A.outlined(c, '#f59e0b', 3);
        A.round(c, 9, 9, 28, 28, 5); A.outlined(c, '#fef3c7', 2.5);
        c.fillStyle = '#ef4444'; c.font = '700 22px Fredoka'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('⚡', 23, 24);
      }, { pad: 6 });
    }
    if (kind === 'coin') {
      return A.sprite('ci_it_coin', 28, 28, function (c) {
        c.beginPath(); c.arc(14, 14, 12, 0, 6.283); A.outlined(c, '#ffd166', 2.8);
        c.beginPath(); c.arc(14, 14, 7, 0, 6.283); c.strokeStyle = '#d97706'; c.lineWidth = 2; c.stroke();
      }, { pad: 4 });
    }
    if (kind === 'orb') {
      return A.sprite('ci_it_orb', 38, 38, function (c) {
        c.beginPath(); c.arc(19, 19, 15, 0, 6.283); A.outlined(c, '#ffee32', 3);
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(15, 15, 6, 0, 6.283); c.fill();
      }, { pad: 6 });
    }
    // Shark
    return A.sprite('ci_hz_shark', 68, 50, function (c) {
      c.beginPath();
      c.moveTo(6, 28); c.quadraticCurveTo(34, 4, 62, 26); c.lineTo(48, 42); c.lineTo(14, 40); c.closePath();
      A.outlined(c, '#3a86ff', 3);
      c.beginPath(); c.moveTo(26, 15); c.lineTo(34, 2); c.lineTo(42, 16); c.closePath(); A.outlined(c, '#3a86ff', 3);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(49, 24, 4.5, 0, 6.283); c.fill();
    }, { pad: 6 });
  }

  /* -------------------- Game State & Match Flow -------------------- */
  var mode = 'title'; // 'title' | 'play' | 'pause' | 'result' | 'shop'
  var matches = 0;
  var curIsland = save.island;
  var curDiff = save.diff;
  var lastDuo = false, lastDuoMode = 'coop';
  var world = null;
  var demo = E.createWorld({ island: curIsland, diff: 'normal', demo: true, seed: 77 });
  var roundOpen = false;
  var mouseActive = false;
  var blinkSlots = [{}, {}, {}, {}, {}, {}];

  canvas.addEventListener('pointerdown', function (e) {
    if (mode === 'play' && e.button === 0) mouseActive = true;
  });
  window.addEventListener('pointerup', function () { mouseActive = false; });

  function showScreen(name) {
    $('scrTitle').hidden = name !== 'title';
    $('scrShop').hidden = name !== 'shop';
    $('scrPause').hidden = name !== 'pause';
    $('scrResult').hidden = name !== 'result';
    $('hud').hidden = name !== 'play';
    pauseDirty = true;
  }

  function refreshTitleUI() {
    $('titleCoins').querySelector('b').textContent = Kit.fmt(save.coins);
    $('titleStars').querySelector('b').textContent = Kit.fmt(save.stars);
    $('diffDesc').textContent = E.DIFFICULTIES[curDiff].desc;

    var dBtns = $('diffBar').querySelectorAll('.diff-btn');
    for (var i = 0; i < dBtns.length; i++) {
      dBtns[i].classList.toggle('on', dBtns[i].getAttribute('data-diff') === curDiff);
    }

    var bar = $('islandBar');
    bar.innerHTML = '';
    for (var k = 0; k < E.ISLANDS.length; k++) {
      (function (idx) {
        var isl = E.ISLANDS[idx];
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'isle-btn' + (idx === curIsland ? ' on' : '');
        b.setAttribute('data-isle', String(idx));
        b.innerHTML = '<span class="isle-ico">' + ISLE_ICONS[idx] + '</span><span class="isle-name">' + isl.name + '</span>';
        b.addEventListener('click', function () {
          curIsland = idx;
          save.island = idx;
          persistSave();
          sfx.tap();
          demo = E.createWorld({ island: curIsland, diff: 'normal', demo: true });
          refreshTitleUI();
        });
        bar.appendChild(b);
      })(k);
    }
  }

  function openTitle() {
    if (roundOpen) {
      Kit.stats.end('quit', world ? world.p1Score : 0);
      roundOpen = false;
    }
    mode = 'title';
    world = null;
    mouseActive = false;
    demo = E.createWorld({ island: curIsland, diff: 'normal', demo: true });
    refreshTitleUI();
    showScreen('title');
  }

  function startMatch(duo, duoMode) {
    if (roundOpen) {
      Kit.stats.end('quit', world ? world.p1Score : 0);
      roundOpen = false;
    }
    lastDuo = !!duo;
    lastDuoMode = duoMode || 'coop';
    matches++;
    mouseActive = false;
    Kit.keys.reset();
    ptr.reset();

    var ddaLv = dda.level;
    world = E.createWorld({
      island: curIsland,
      diff: curDiff,
      duo: lastDuo,
      duoMode: lastDuoMode,
      ddaLevel: ddaLv,
      p1Cosm: { helm: save.helm, trail: save.trail },
      p2Cosm: { helm: 'h_mech', trail: 't_bolt' }
    });
    mode = 'play';
    var islSlug = E.ISLANDS[curIsland].id;
    Kit.stats.round(islSlug);
    roundOpen = true;
    showScreen('play');
    sfx.select();
    try { if (document.activeElement && document.activeElement !== canvas) document.activeElement.blur(); } catch (e) {}
  }

  function setPause(on) {
    if (on && mode === 'play') {
      mode = 'pause';
      mouseActive = false;
      Kit.keys.reset();
      ptr.reset();
      pauseDirty = true;
      showScreen('pause');
      sfx.toggle(false);
    } else if (!on && mode === 'pause') {
      mode = 'play';
      mouseActive = false;
      Kit.keys.reset();
      ptr.reset();
      showScreen('play');
      sfx.toggle(true);
    }
  }

  function openShop() {
    mode = 'shop';
    renderShop();
    showScreen('shop');
    sfx.select();
  }

  function renderShop() {
    $('shopCoins').querySelector('b').textContent = Kit.fmt(save.coins);
    function fillShelf(gridId, list, field) {
      var g = $(gridId);
      g.innerHTML = '';
      for (var i = 0; i < list.length; i++) {
        (function (item) {
          var owned = !!save.owned[item.id];
          var eq = save[field] === item.id;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'shop-item' + (eq ? ' eq' : '');
          btn.setAttribute('data-item', item.id);
          var tag = eq ? 'مجهّز ✓' : owned ? 'اختر' : ('🪙 ' + item.price);
          btn.innerHTML = '<b>' + item.name + '</b><small>' + item.desc + '</small><span class="tag">' + tag + '</span>';
          btn.addEventListener('click', function () {
            if (owned) {
              save[field] = item.id;
              persistSave();
              sfx.select();
              renderShop();
            } else if (save.coins >= item.price) {
              save.coins -= item.price;
              save.owned[item.id] = 1;
              save[field] = item.id;
              persistSave();
              sfx.crate();
              renderShop();
            } else {
              if (J) J.error();
            }
          });
          g.appendChild(btn);
        })(list[i]);
      }
    }
    fillShelf('helmGrid', E.SHOP.helmets, 'helm');
    fillShelf('trailGrid', E.SHOP.trails, 'trail');
  }

  function openResult(ev) {
    if (roundOpen) {
      Kit.stats.end(ev.won ? 'win' : 'lose', ev.p1Score);
      roundOpen = false;
    }
    dda.result(ev.won ? Math.min(1, 0.62 + ev.stars * 0.13) : 0.15);

    var earnedCoins = 8 + world.actors[0].coins + (ev.won ? 12 + ev.stars * 5 : 4);
    if (world.duo && world.actors[1] && world.actors[1].isHuman) earnedCoins += world.actors[1].coins;
    save.coins += earnedCoins;
    save.stars += ev.stars;
    if (ev.won) save.wins++;
    if (ev.p1Score > save.best[curIsland]) save.best[curIsland] = ev.p1Score;
    persistSave();

    $('resKicker').textContent = E.ISLANDS[curIsland].name + ' · ' + E.DIFFICULTIES[curDiff].label;
    $('resTitle').textContent = ev.won ? 'انتصار الأبطال!' : 'معركة شجاعة! حاول مجدداً';
    var starStr = '';
    for (var s = 0; s < 3; s++) starStr += s < ev.stars ? '⭐' : '☆';
    $('resStars').textContent = starStr;

    var sorted = world.actors.slice().sort(function (a, b) { return b.score - a.score; });
    var board = $('resBoard');
    board.innerHTML = '';
    for (var i = 0; i < Math.min(4, sorted.length); i++) {
      var ac = sorted[i];
      var row = document.createElement('div');
      row.className = 'res-row' + (ac.isHuman ? ' me' : '');
      row.innerHTML = '<span>#' + (i + 1) + ' ' + ac.name + '</span><span>' + Kit.fmt(ac.score) + ' نقطة · ' + ac.roundsWon + ' جولات</span>';
      board.appendChild(row);
    }
    $('resReward').textContent = 'المكافأة: +' + earnedCoins + ' عملة ذهبية 🪙 (الرصيد: ' + Kit.fmt(save.coins) + ')';

    mode = 'result';
    showScreen('result');
    if (ev.won) sfx.win(); else sfx.lose();
  }

  /* -------------------- Input & UI Wiring -------------------- */
  $('diffBar').addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.diff-btn');
    if (!b) return;
    var d = b.getAttribute('data-diff');
    if (E.DIFFICULTIES[d]) {
      curDiff = d;
      save.diff = d;
      persistSave();
      sfx.tap();
      refreshTitleUI();
    }
  });

  $('btnPlay').addEventListener('click', function () { startMatch(false, 'coop'); });
  $('btnDuoCoop').addEventListener('click', function () { startMatch(true, 'coop'); });
  $('btnDuoVersus').addEventListener('click', function () { startMatch(true, 'versus'); });
  $('btnShop').addEventListener('click', openShop);
  $('shopBack').addEventListener('click', function () { sfx.back(); openTitle(); });

  $('btnPause').addEventListener('click', function () { setPause(true); });
  $('btnResume').addEventListener('click', function () { setPause(false); });
  $('btnRestart').addEventListener('click', function () { startMatch(lastDuo, lastDuoMode); });
  $('btnMenu').addEventListener('click', function () { sfx.back(); openTitle(); });

  $('resAgain').addEventListener('click', function () { startMatch(lastDuo, lastDuoMode); });
  $('resNext').addEventListener('click', function () {
    curIsland = (curIsland + 1) % E.ISLANDS.length;
    save.island = curIsland;
    persistSave();
    startMatch(lastDuo, lastDuoMode);
  });
  $('resMenu').addEventListener('click', function () { sfx.back(); openTitle(); });

  // CRITICAL: Guard ALL custom keydown handlers with Kit.isGameKeyEvent(e)!
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e) || e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (mode === 'play') { e.preventDefault(); setPause(true); }
      else if (mode === 'pause') { e.preventDefault(); setPause(false); }
      else if (mode === 'shop' && e.code === 'Escape') { e.preventDefault(); sfx.back(); openTitle(); }
    } else if (e.code === 'Enter') {
      if (mode === 'title') { e.preventDefault(); startMatch(false, 'coop'); }
      else if (mode === 'result') { e.preventDefault(); startMatch(lastDuo, lastDuoMode); }
    }
  });

  Kit.lifecycle({
    pause: function () { if (mode === 'play') setPause(true); },
    reset: function () { mouseActive = false; }
  });

  function readHumanInputs() {
    var p1 = { moveX: 0, up: false, down: false, jump: false, jumpPressed: false, dash: false, dashPressed: false };
    var K = Kit.keys;
    if (!world.duo) {
      var l1 = K.anyDown(['ArrowLeft', 'KeyA']), r1 = K.anyDown(['ArrowRight', 'KeyD']);
      p1.moveX = (r1 ? 1 : 0) - (l1 ? 1 : 0);
      p1.up = K.anyDown(['ArrowUp', 'KeyW']);
      p1.jump = p1.up;
      p1.jumpPressed = K.anyPressed(['ArrowUp', 'KeyW']);
      p1.down = K.anyDown(['ArrowDown', 'KeyS']);
      p1.dash = K.anyDown(['Space', 'KeyE']);
      p1.dashPressed = K.anyPressed(['Space', 'KeyE']) || ptr.right;

      // Active mouse drag in 1P (ONLY when left button was actively pressed on canvas!)
      var hero = world.actors[0];
      if (mouseActive && ptr.down && hero && p1.moveX === 0) {
        var dx = ptr.x - hero.x, dy = ptr.y - hero.y;
        if (Math.abs(dx) > 26) p1.moveX = dx > 0 ? 1 : -1;
        if (dy < -55) {
          p1.up = true; p1.jump = true;
          if (ptr.pressed || hero.onGround) p1.jumpPressed = true;
        }
      }
      return [p1];
    }

    // 2P split keyboard: P1 = WASD + Space, P2 = Arrows + Enter
    p1.moveX = (K.down('KeyD') ? 1 : 0) - (K.down('KeyA') ? 1 : 0);
    p1.up = K.down('KeyW'); p1.jump = p1.up;
    p1.jumpPressed = K.pressed('KeyW');
    p1.down = K.down('KeyS');
    p1.dash = K.anyDown(['Space', 'KeyE']);
    p1.dashPressed = K.anyPressed(['Space', 'KeyE']);

    var p2 = {
      moveX: (K.down('ArrowRight') ? 1 : 0) - (K.down('ArrowLeft') ? 1 : 0),
      up: K.down('ArrowUp'),
      jump: K.down('ArrowUp'),
      jumpPressed: K.pressed('ArrowUp'),
      down: K.down('ArrowDown'),
      dash: K.anyDown(['Enter', 'ShiftRight']),
      dashPressed: K.anyPressed(['Enter', 'ShiftRight'])
    };
    return [p1, p2];
  }

  function consumeEvents(w) {
    var evs = w.events;
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (w.demo) continue;
      if (ev.type === 'jump') {
        if (ev.human) sfx.jump(ev.double);
        fx.burst(ev.x, ev.y, { n: 6, color: '#ffffff', size: 7, speed: 120, life: 0.35, shape: 'smoke' });
      } else if (ev.type === 'land') {
        if (ev.human) sfx.land();
      } else if (ev.type === 'dash') {
        if (ev.human) sfx.dash();
        fx.burst(ev.x, ev.y, { n: 10, color: TRAIL_COLORS[ev.trail] || '#fff', size: 8, speed: 180, life: 0.35, shape: 'star' });
        if (ev.hammer) { A.shake.add(0.45); A.pop('موجة الصدمة!', ev.x, ev.y - 36, { color: '#ffd000', size: 26 }); }
      } else if (ev.type === 'bonk') {
        sfx.bonk();
        A.shake.add(0.3);
        fx.burst(ev.x, ev.y, { n: 12, color: '#ffd166', size: 9, speed: 220, life: 0.45, shape: 'star' });
        A.pop(ev.head ? 'قفزة الرأس!' : 'بوم! +25', ev.x, ev.y - 28, { color: '#ffcc00', size: 25 });
        if (ev.attacker === 0 || (w.actors[ev.attacker] && w.actors[ev.attacker].isHuman)) Kit.track.hit();
      } else if (ev.type === 'hurt') {
        if (ev.shielded) {
          sfx.shield();
          A.pop('صدّ الدرع!', ev.x, ev.y - 30, { color: '#00f5d4', size: 24 });
        } else {
          if (ev.human) { sfx.hurt(); Kit.track.miss(); A.flash('#ff3b30', 110); }
          A.shake.add(0.42);
          fx.burst(ev.x, ev.y, { n: 14, color: '#ff4d6d', size: 8, speed: 240, life: 0.5 });
        }
      } else if (ev.type === 'crate') {
        sfx.crate();
        if (ev.human) Kit.track.hit();
        fx.burst(ev.x, ev.y, { n: 14, color: '#ffee32', size: 9, speed: 210, life: 0.5, shape: 'star' });
        A.pop(ev.name, ev.x, ev.y - 32, { color: '#ffee32', size: 26 });
      } else if (ev.type === 'coin') {
        if (ev.human) sfx.coin(w.actors[ev.slot].coins);
        fx.burst(ev.x, ev.y, { n: 6, color: '#ffd166', size: 7, speed: 140, life: 0.35, shape: 'star' });
      } else if (ev.type === 'boom') {
        sfx.boom(ev.power);
        A.shake.add(0.35 * (ev.power || 0.8));
        fx.burst(ev.x, ev.y, { n: 16, color: '#ff5400', size: 11, speed: 260, life: 0.5 });
      } else if (ev.type === 'droneStart') {
        sfx.shield();
        A.pop('طائرة الإنقاذ! اجمع 3 كرات!', ev.x, ev.y - 36, { color: '#ffee32', size: 26 });
      } else if (ev.type === 'orb') {
        sfx.orb(ev.count);
        A.pop('طاقة ' + ev.count + '/3', ev.x, ev.y - 26, { color: '#ffee32', size: 24 });
      } else if (ev.type === 'revive') {
        sfx.revive();
        A.shake.add(0.45);
        fx.burst(ev.x, ev.y, { n: 22, color: '#3ddc84', size: 10, speed: 280, life: 0.6, shape: 'star' });
        A.pop('عودة خارقة!', ev.x, ev.y - 38, { color: '#3ddc84', size: 30 });
      } else if (ev.type === 'roundClear') {
        if (ev.survivedHumans) { sfx.orb(3); Kit.track.hit(); }
      } else if (ev.type === 'matchEnd') {
        openResult(ev);
      }
    }
    evs.length = 0;
  }

  /* -------------------- Rendering -------------------- */
  function drawDangerArrow(x, y, label) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#ff1e42';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 18); ctx.lineTo(-16, -10); ctx.lineTo(16, -10); ctx.closePath();
    ctx.fill(); ctx.stroke();
    if (label) {
      ctx.font = '700 18px Fredoka';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.strokeText(label, 0, -20);
      ctx.fillText(label, 0, -20);
    }
    ctx.restore();
  }

  function drawActor(w, a, idx) {
    if (a.state === 'out') return;
    if (a.state === 'drone') {
      var dr = droneSprite(a.slot);
      var bob = Math.sin(w.frames * 0.18) * 4;
      A.blit(ctx, dr, a.x, a.y + bob, { sx: a.facing });
      ctx.save();
      ctx.font = '700 16px Fredoka';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.fillStyle = '#ffee32';
      var txt = 'إنقاذ ' + a.droneOrbs + '/3';
      ctx.strokeText(txt, a.x, a.y - 32);
      ctx.fillText(txt, a.x, a.y - 32);
      ctx.restore();
      return;
    }

    var blink = A.blink(blinkSlots[idx % blinkSlots.length]);
    var flashAlpha = (a.invulnT > 0 && ((w.frames >> 2) & 1)) ? 0.55 : 1;
    var rot = a.flipT > 0 ? (1 - a.flipT / 0.36) * 6.283 * a.facing : (a.dashT > 0 ? a.facing * 0.25 : 0);
    var sx = a.facing * (a.dashT > 0 ? 1.22 : 1);
    var sy = a.dashT > 0 ? 0.84 : (!a.onGround && Math.abs(a.vy) > 160 ? 1.08 : 1);

    if (a.onGround) A.shadow(ctx, a.x - 22, a.y - 16, 44, 38, 0.45);

    // Jetpack flame behind body
    if (a.gadget === 'jetpack') {
      ctx.fillStyle = '#ff5400';
      ctx.beginPath(); ctx.arc(a.x - a.facing * 18, a.y + 8, 9 + (w.frames % 4), 0, 6.283); ctx.fill();
    }

    var bSpr = bodySprite(a.slot);
    A.blit(ctx, bSpr, a.x, a.y, { rot: rot, sx: sx, sy: sy, alpha: flashAlpha });

    // Expressive eyes
    ctx.save();
    ctx.translate(a.x + a.facing * 5, a.y - 4);
    for (var e = -1; e <= 1; e += 2) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(e * 6.5, 0, 4.5, blink > 0.5 ? 1 : 5.2, 0, 0, 6.283);
      ctx.fill();
      if (blink <= 0.5) {
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(e * 6.5 + a.facing * 1.5, 0, 2.4, 0, 6.283); ctx.fill();
      }
    }
    ctx.restore();

    // Helmet
    var hSpr = helmSprite(a.helm);
    A.blit(ctx, hSpr, a.x, a.y - 20, { rot: rot * 0.4, sx: a.facing, alpha: flashAlpha });

    // Giant Hammer gadget
    if (a.gadget === 'hammer') {
      ctx.save();
      ctx.translate(a.x + a.facing * 24, a.y - 4);
      ctx.rotate(a.facing * (a.dashT > 0 ? 1.1 : -0.35));
      ctx.fillStyle = '#78350f'; ctx.fillRect(-3, -18, 6, 28);
      A.round(ctx, -14, -30, 28, 16, 5); A.outlined(ctx, '#ffd000', 2.8);
      ctx.restore();
    }

    // Electric Shield bubble
    if (a.gadget === 'shield') {
      ctx.save();
      ctx.strokeStyle = '#00f5d4'; ctx.lineWidth = 3.5;
      ctx.globalAlpha = 0.78;
      ctx.beginPath(); ctx.arc(a.x, a.y - 2, 32 + Math.sin(w.frames * 0.2) * 2, 0, 6.283); ctx.stroke();
      ctx.restore();
    }

    // Player crown / tag above human heroes
    if (a.isHuman && !w.demo) {
      ctx.save();
      ctx.font = '700 15px Fredoka';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.5; ctx.strokeStyle = INK;
      ctx.fillStyle = a.slot === 0 ? '#ffee32' : '#72efdd';
      var tag = a.slot === 0 ? 'أنت (1)' : 'لاعب 2';
      ctx.strokeText(tag, a.x, a.y - 44);
      ctx.fillText(tag, a.x, a.y - 44);
      ctx.restore();
    }
  }

  function drawWorld(w) {
    var isl = w.isl;
    var sky = A.sky('ci_sky_' + isl.id, 64, 360, isl.sky);
    if (sky.canvas) ctx.drawImage(sky.canvas, 0, 0, E.W, E.H);

    // Scenic island centerpiece
    A.blit(ctx, bgCenterSprite(isl.id), E.W / 2, 335);

    // Anti-gravity lift column (Alien Mothership)
    if (isl.gravZone) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 245, 212, 0.14)';
      ctx.fillRect(isl.gravZone.x, 120, isl.gravZone.w, 440);
      ctx.restore();
    }

    // Volcano geysers
    for (var g = 0; g < w.geysers.length; g++) {
      var gy = w.geysers[g];
      if (gy.warnT > 0) {
        drawDangerArrow(gy.x, 520, 'حمم!');
      } else if (gy.activeT > 0) {
        ctx.save();
        A.round(ctx, gy.x - 20, 340, 40, 225, 16);
        A.outlined(ctx, '#ff5400', 3);
        ctx.restore();
      }
    }

    // Platforms
    for (var p = 0; p < w.plats.length; p++) {
      var pl = w.plats[p];
      if (pl.sunkT > 0) continue;
      var kind = pl.id === 'top' ? 'top' : pl.oneWay ? 'ledge' : 'deck';
      var spr = platSprite(isl.id, kind, pl.w, pl.h);
      var jx = pl.sinkWarn > 0 ? Math.sin(w.frames * 1.4) * 4 : 0;
      A.blit(ctx, spr, pl.x + pl.w / 2 + jx, pl.y + pl.h / 2, { alpha: pl.sinkWarn > 0 ? 0.82 : 1 });
      if (pl.sinkWarn > 0) drawDangerArrow(pl.x + pl.w / 2, pl.y - 20, 'سقوط!');
    }

    // Springs & side rescue bumpers
    for (var s = 0; s < isl.springs.length; s++) {
      A.round(ctx, isl.springs[s] - 20, 546, 40, 16, 7);
      A.outlined(ctx, '#ff006e', 3);
    }
    for (var b = 0; b < w.bumpers.length; b++) {
      ctx.beginPath(); ctx.arc(w.bumpers[b], 525, 20, 0, 6.283);
      A.outlined(ctx, '#00f5d4', 3);
    }

    // Crates, Coins, Rescue Orbs
    for (var c = 0; c < w.crates.length; c++) A.blit(ctx, hazardSprite('crate'), w.crates[c].x, w.crates[c].y);
    for (var k = 0; k < w.coins.length; k++) A.blit(ctx, hazardSprite('coin'), w.coins[k].x, w.coins[k].y);
    for (var oi = 0; oi < w.orbs.length; oi++) {
      var orb = w.orbs[oi];
      A.blit(ctx, hazardSprite('orb'), orb.x, orb.y + Math.sin(orb.bob) * 6);
    }

    // Hazards + clear danger telegraphs
    for (var h = 0; h < w.hazards.length; h++) {
      var hz = w.hazards[h];
      if (hz.kind === 'meteor') {
        if (hz.warnT > 0) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 30, 66, 0.55)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(hz.tx, 80); ctx.lineTo(hz.tx, hz.ty); ctx.stroke();
          ctx.restore();
          drawDangerArrow(hz.tx, hz.ty - 32, 'نيزك!');
        } else {
          A.blit(ctx, hazardSprite('meteor'), hz.x, hz.y);
        }
      } else if (hz.kind === 'bomb') {
        var pulse = hz.fuse < 0.8 && ((w.frames >> 2) & 1) ? 1.2 : 1.0;
        A.blit(ctx, hazardSprite('bomb'), hz.x, hz.y, { sx: pulse, sy: pulse });
      } else if (hz.kind === 'boulder') {
        if (hz.warnT > 0) drawDangerArrow(hz.vx > 0 ? 130 : E.W - 130, 505, 'صخرة!');
        else A.blit(ctx, hazardSprite('boulder'), hz.x, hz.y, { rot: hz.rot });
      } else if (hz.kind === 'ufo') {
        if (hz.beamWarn > 0) {
          ctx.fillStyle = 'rgba(255, 238, 50, 0.22)';
          ctx.fillRect(hz.x - 36, hz.y + 18, 72, 440);
        } else if (hz.beamOn > 0) {
          ctx.fillStyle = 'rgba(0, 245, 212, 0.52)';
          ctx.fillRect(hz.x - 42, hz.y + 18, 84, 440);
        }
        A.blit(ctx, hazardSprite('ufo'), hz.x, hz.y);
      } else if (hz.kind === 'shark') {
        if (hz.warnT > 0) drawDangerArrow(hz.vx > 0 ? 130 : E.W - 130, w.waterY - 30, 'قرش!');
        else A.blit(ctx, hazardSprite('shark'), hz.x, hz.y, { sx: hz.vx >= 0 ? 1 : -1 });
      }
    }

    // Actors
    for (var a = 0; a < w.actors.length; a++) drawActor(w, w.actors[a], a);

    // Animated Lava / Sea plane
    ctx.save();
    ctx.fillStyle = isl.sea;
    ctx.beginPath();
    ctx.moveTo(0, E.H);
    for (var wx = 0; wx <= E.W; wx += 64) {
      var wy = w.waterY + Math.sin(wx * 0.02 + w.frames * 0.09) * 6;
      ctx.lineTo(wx, wy);
    }
    ctx.lineTo(E.W, E.H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = isl.seaHi;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }

  function drawHUD(w) {
    var dInfo = E.currentDisasterInfo(w);
    // Top-center round & timer bar
    ctx.save();
    A.round(ctx, 450, 12, 380, 52, 16);
    A.outlined(ctx, 'rgba(20, 16, 48, 0.9)', 3);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcc00';
    ctx.font = '700 18px Fredoka';
    ctx.fillText('الجولة ' + (w.round + 1) + ' / ' + w.rounds + ' · ' + dInfo.name, 640, 33);

    var pct = w.phase === 'action' ? Math.max(0, 1 - w.t / E.ACTION_TIME) : 1;
    A.round(ctx, 474, 44, 332, 11, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
    if (pct > 0) {
      A.round(ctx, 474, 44, Math.max(10, 332 * pct), 11, 5);
      ctx.fillStyle = '#3ddc84'; ctx.fill();
    }

    // Player status badges (left of mute button, right of center)
    var humans = w.actors.filter(function (a) { return a.isHuman; });
    for (var i = 0; i < humans.length; i++) {
      var h = humans[i];
      var bx = i === 0 ? 855 : 95;
      A.round(ctx, bx, 12, 345, 52, 16);
      A.outlined(ctx, 'rgba(20, 16, 48, 0.9)', 3);
      var hearts = '';
      for (var k = 0; k < h.maxHearts; k++) hearts += k < h.hearts ? '❤️' : '🖤';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.font = '700 17px Fredoka';
      ctx.fillText((i === 0 ? 'بطل 1 ' : 'بطل 2 ') + hearts, bx + 330, 34);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd166';
      ctx.font = '700 16px Fredoka';
      var extra = h.state === 'drone' ? ('إنقاذ ' + h.droneOrbs + '/3') : (h.gadget ? E.GADGETS[h.gadget].name : ('🪙 ' + h.coins));
      ctx.fillText(extra, bx + 14, 52);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#7dd3fc';
      ctx.fillText('النقاط: ' + Kit.fmt(h.score), bx + 330, 54);
    }

    // Snappy Non-Blocking Comic Disaster Card (top-upper banner so players already run & jump below!)
    if (w.phase === 'card') {
      A.round(ctx, 351, 76, 578, 116, 24);
      A.outlined(ctx, '#ffcc00', 4);
      A.round(ctx, 358, 82, 564, 104, 19);
      ctx.fillStyle = 'rgba(27, 22, 64, 0.95)'; ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff7b00';
      ctx.font = '700 17px Fredoka';
      ctx.fillText('⚠️ استعد للفوضى — تحرّك واقفز الآن!', 640, 107);
      ctx.fillStyle = '#ffee32';
      ctx.font = '700 34px Fredoka';
      ctx.fillText(dInfo.name, 640, 145);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '700 17px Fredoka';
      ctx.fillText(dInfo.tip, 640, 174);
    } else if (w.phase === 'inter') {
      A.round(ctx, 420, 96, 440, 84, 22);
      A.outlined(ctx, 'rgba(22, 163, 74, 0.95)', 4);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = '700 32px Fredoka';
      ctx.fillText('انتهت الجولة ' + (w.round + 1) + '!', 640, 148);
    }
    ctx.restore();
  }

  /* -------------------- Main Loop -------------------- */
  function update(dt) {
    if (mode === 'pause') {
      Kit.keys.endFrame();
      ptr.endFrame();
      return;
    }
    if (mode === 'play' && world) {
      var prevPhase = world.phase;
      var inputs = readHumanInputs();
      E.stepWorld(world, inputs, dt);
      if (prevPhase === 'card' && world.phase === 'action') Kit.track.cue();
      consumeEvents(world);
    } else if (demo) {
      E.stepWorld(demo, null, dt);
      demo.events.length = 0;
    }
    fx.update(dt);
    A.shake.update(dt);
    A.pop.update(dt);
    A.flash.update(dt);
    Kit.keys.endFrame();
    ptr.endFrame();
  }

  function render() {
    if (mode === 'pause') {
      if (!pauseDirty) return;
      pauseDirty = false;
    }
    var activeWorld = world || demo;
    ctx.save();
    A.shake.apply(ctx);
    drawWorld(activeWorld);
    fx.draw(ctx);
    A.pop.draw(ctx);
    ctx.restore();
    A.vignette(ctx, E.W, E.H, 0.32);
    A.flash.draw(ctx, E.W, E.H);
    if ((mode === 'play' || mode === 'pause') && world) drawHUD(world);
  }

  // Expose exact smoke-scenario & test contract on window.__game
  var api = {
    get mode() { return mode; },
    get matches() { return matches; },
    get world() { return world; },
    get player() { return world ? world.actors[0] : null; },
    get demo() { return demo; },
    get island() { return curIsland; },
    get diff() { return curDiff; },
    get duo() { return lastDuo; },
    get duoMode() { return lastDuoMode; },
    get save() { return save; }
  };
  window.__game = api;

  refreshTitleUI();
  showScreen('title');
  A.loop(update, render);
  Kit.ready();
})();
