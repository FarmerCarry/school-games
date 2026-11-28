/* هجوم الروبوتات — Crisp 1280x720 Canvas renderer, procedural sprites, Kit.juice SFX, UI & telemetry. */
(function () {
  'use strict';

  var D = window.RSData, E = window.RSEngine;
  var VW = D.VIEW_W, VH = D.VIEW_H, TILE = 256;
  var canvas = document.getElementById('game'), uiEl = document.getElementById('ui');

  var view = Kit.fit(canvas, VW, VH, { maxDpr: 1.5, onResize: syncUi });
  var ctx = view.ctx, dirty = true;

  function syncUi(v) {
    var cur = v || view;
    uiEl.style.left = canvas.style.left;
    uiEl.style.top = canvas.style.top;
    uiEl.style.transform = 'scale(' + cur.scale + ')';
    dirty = true;
  }
  canvas.addEventListener('contextrestored', function () { spriteCache = Object.create(null); dirty = true; });

  var store = Kit.store('robo-swarm');
  var saveStatus = Kit.saveStatus ? Kit.saveStatus({ retry: persist }) : null;
  var rawSave = store.get('save', null);
  if (!rawSave || typeof rawSave !== 'object') rawSave = {};
  var save = {
    coins: Math.max(0, rawSave.coins | 0),
    equipped: Math.max(0, Math.min(4, rawSave.equipped | 0)),
    skins: Array.isArray(rawSave.skins) && rawSave.skins.length === 5
      ? [1, rawSave.skins[1] ? 1 : 0, rawSave.skins[2] ? 1 : 0, rawSave.skins[3] ? 1 : 0, rawSave.skins[4] ? 1 : 0]
      : [1, 0, 0, 0, 0],
    wins: Math.max(0, rawSave.wins | 0),
    best: Math.max(0, rawSave.best | 0)
  };
  function persist() {
    var ok = store.set('save', save) !== false;
    if (saveStatus) { if (ok) saveStatus.saved(); else saveStatus.failed(); }
  }

  var dda = Kit.dda('robo-swarm', { id: 'arena', target: 0.72, tiers: 5 });
  var shake = Kit.shake();
  Kit.muteButton();

  var spriteCache = Object.create(null);
  function bake(key, w, h, fn) {
    var cached = spriteCache[key];
    if (cached) return cached;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h);
    spriteCache[key] = c;
    return c;
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function tileSprite(idx) {
    var a = D.arenas[idx];
    return bake('tile_' + a.id, TILE, TILE, function (g) {
      g.fillStyle = a.bg; g.fillRect(0, 0, TILE, TILE);
      // Brushed metallic floor plates with subtle top bevel & rivets
      var plates = [[10, 10, 108, 108], [138, 10, 108, 108], [10, 138, 108, 108], [138, 138, 108, 108]];
      for (var p = 0; p < plates.length; p++) {
        var pl = plates[p];
        g.fillStyle = (p === 0 || p === 3) ? a.plate : 'rgba(255,255,255,0.035)';
        rr(g, pl[0], pl[1], pl[2], pl[3], 12); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.22)';
        var rv = [[10, 10], [pl[2] - 10, 10], [10, pl[3] - 10], [pl[2] - 10, pl[3] - 10]];
        for (var r = 0; r < 4; r++) { g.beginPath(); g.arc(pl[0] + rv[r][0], pl[1] + rv[r][1], 2.2, 0, 6.28); g.fill(); }
      }
      // Subtle industrial panel seam grid
      g.strokeStyle = a.grid; g.lineWidth = 2;
      g.beginPath(); g.moveTo(128, 0); g.lineTo(128, TILE); g.moveTo(0, 128); g.lineTo(TILE, 128); g.stroke();
      // Glowing junction node + subtle diagonal accent stripe
      g.fillStyle = a.border; g.globalAlpha = 0.38;
      g.beginPath(); g.arc(128, 128, 5, 0, 6.28); g.fill();
      g.fillStyle = a.accent; g.globalAlpha = 0.22;
      g.beginPath(); g.arc(128, 128, 2.5, 0, 6.28); g.fill();
      g.globalAlpha = 1;
    });
  }

  function mechSprite(skinIdx) {
    var sk = D.skins[skinIdx] || D.skins[0];
    return bake('mech_' + skinIdx, 96, 96, function (g) {
      g.translate(48, 48);
      // Thruster flame + twin alloy plasma cannons
      g.fillStyle = sk.trim;
      g.beginPath(); g.moveTo(-26, -9); g.lineTo(-40, 0); g.lineTo(-26, 9); g.closePath(); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#090d1a';
      g.fillStyle = '#92b4d8';
      rr(g, 8, -24, 31, 12, 5); g.fill(); g.stroke();
      rr(g, 8, 12, 31, 12, 5); g.fill(); g.stroke();
      g.fillStyle = sk.trim;
      rr(g, 30, -22, 9, 8, 3); g.fill();
      rr(g, 30, 14, 9, 8, 3); g.fill();
      // Armored shoulders & hull
      g.fillStyle = sk.dark;
      rr(g, -22, -32, 36, 16, 8); g.fill(); g.stroke();
      rr(g, -22, 16, 36, 16, 8); g.fill(); g.stroke();
      g.fillStyle = sk.body;
      rr(g, -24, -22, 48, 44, 15); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.32)';
      rr(g, -17, -16, 22, 12, 6); g.fill();
      // Glowing visor
      g.fillStyle = '#0c1326'; rr(g, 1, -14, 18, 28, 7); g.fill();
      g.fillStyle = sk.visor; rr(g, 4, -11, 12, 22, 5); g.fill();
      g.fillStyle = '#fff'; rr(g, 7, -8, 4, 8, 2); g.fill();
    });
  }

  function enemySprite(kind, frame) {
    if (kind === 5) {
      return bake('boss_' + frame, 168, 168, function (g) {
        g.translate(84, 84);
        var weak = frame === 2;
        g.lineWidth = 5; g.strokeStyle = '#0d0612';
        g.fillStyle = '#2d142c';
        rr(g, -54, -66, 56, 26, 10); g.fill(); g.stroke();
        rr(g, -54, 40, 56, 26, 10); g.fill(); g.stroke();
        g.fillStyle = '#ff9f1c';
        for (var r = -46; r <= -12; r += 16) { g.beginPath(); g.arc(r, -53, 5, 0, 6.28); g.arc(r, 53, 5, 0, 6.28); g.fill(); }
        g.fillStyle = weak ? '#ff8a24' : '#d92648';
        rr(g, -50, -48, 98, 96, 24); g.fill(); g.stroke();
        g.fillStyle = '#8fa6c9';
        rr(g, 32, -32, 32, 18, 7); g.fill(); g.stroke();
        rr(g, 32, 14, 32, 18, 7); g.fill(); g.stroke();
        g.fillStyle = '#140b1c'; g.beginPath(); g.arc(-4, 0, 24, 0, 6.28); g.fill();
        g.fillStyle = weak ? '#fff275' : '#ff3ea5'; g.beginPath(); g.arc(-4, 0, weak ? 19 : 13, 0, 6.28); g.fill();
        g.fillStyle = '#ffe14a'; rr(g, 18, -22, 16, 44, 6); g.fill();
      });
    }
    return bake('bot_' + kind + '_' + frame, 88, 88, function (g) {
      g.translate(44, 44);
      var off = frame ? 3 : -3;
      g.lineWidth = 3.5; g.strokeStyle = '#0d1021';
      if (kind === 0) {
        g.strokeStyle = '#70e4ff';
        for (var l = -1; l <= 1; l++) {
          g.beginPath(); g.moveTo(l * 8, -10); g.lineTo(l * 16 + off * 0.6, -29); g.stroke();
          g.beginPath(); g.moveTo(l * 8, 10); g.lineTo(l * 16 - off * 0.6, 29); g.stroke();
        }
        g.strokeStyle = '#0d1021'; g.fillStyle = '#25b8ff';
        g.beginPath(); g.arc(0, 0, 18, 0, 6.28); g.fill(); g.stroke();
        g.fillStyle = '#ffe14a'; g.beginPath(); g.arc(7, -5, 4.5, 0, 6.28); g.arc(7, 5, 4.5, 0, 6.28); g.fill();
      } else if (kind === 1) {
        g.fillStyle = '#ffe14a';
        g.beginPath(); g.moveTo(19, 0); g.lineTo(-13, -15 - off * 0.4); g.lineTo(-6, 0); g.lineTo(-13, 15 + off * 0.4); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(5, 0, 4.5, 0, 6.28); g.fill();
      } else if (kind === 2) {
        g.fillStyle = '#28e7ff'; rr(g, -30, -10, 9, 20, 4); g.fill();
        g.fillStyle = '#ff6b2b'; rr(g, -22, -18, 42, 36, 10); g.fill(); g.stroke();
        g.fillStyle = '#ffe14a'; g.beginPath(); g.moveTo(29, 0); g.lineTo(12, -17); g.lineTo(12, 17); g.closePath(); g.fill(); g.stroke();
      } else if (kind === 3) {
        g.fillStyle = 'rgba(194,102,255,0.42)';
        g.beginPath(); g.arc(-14, -17, 10 + (frame ? 1 : 0), 0, 6.28); g.arc(-14, 17, 10 + (frame ? 0 : 1), 0, 6.28); g.fill();
        g.fillStyle = '#a64dff'; rr(g, -16, -16, 34, 32, 12); g.fill(); g.stroke();
        g.fillStyle = '#ff3864'; g.beginPath(); g.arc(10, 0, 7, 0, 6.28); g.fill();
      } else {
        g.fillStyle = '#4a608a'; rr(g, -26, -26, 52, 52, 14); g.fill(); g.stroke();
        g.fillStyle = '#5ce07a'; rr(g, -16, -18, 32, 36, 9); g.fill();
        g.fillStyle = '#ff385c'; rr(g, 6, -11, 10, 22, 4); g.fill();
      }
    });
  }

  function podSprite(kind) {
    var spec = D.pods[kind];
    return bake('pod_' + kind, 76, 76, function (g) {
      g.translate(38, 38);
      g.fillStyle = 'rgba(10,18,40,0.9)'; g.strokeStyle = spec.color; g.lineWidth = 4;
      g.beginPath(); g.arc(0, 0, 28, 0, 6.28); g.fill(); g.stroke();
      g.fillStyle = spec.color;
      if (kind === 0) {
        rr(g, -14, -7, 28, 14, 5); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(10, 0, 5, 0, 6.28); g.fill();
      } else if (kind === 1) {
        for (var i = 0; i < 6; i++) { g.save(); g.rotate(i * 1.047); rr(g, -4, -18, 8, 10, 2); g.fill(); g.restore(); }
        g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 8, 0, 6.28); g.fill();
      } else if (kind === 2) {
        g.beginPath(); g.moveTo(16, 0); g.lineTo(-10, -11); g.lineTo(-6, 0); g.lineTo(-10, 11); g.closePath(); g.fill();
      } else if (kind === 3) {
        g.beginPath(); g.moveTo(4, -16); g.lineTo(-10, 2); g.lineTo(0, 2); g.lineTo(-4, 16); g.lineTo(10, -2); g.lineTo(0, -2); g.closePath(); g.fill();
      } else {
        g.lineWidth = 6; g.strokeStyle = spec.color; g.beginPath(); g.arc(0, 2, 12, Math.PI, 0); g.stroke();
        g.fillStyle = '#fff'; g.fillRect(-15, 2, 6, 10); g.fillRect(9, 2, 6, 10);
      }
    });
  }

  function boltSprite() {
    return bake('bolt_pickup', 28, 28, function (g) {
      g.translate(14, 14); g.fillStyle = '#ffe14a'; g.strokeStyle = '#1b1200'; g.lineWidth = 2.5;
      g.beginPath();
      for (var i = 0; i < 6; i++) { var a = i * 1.047; if (i === 0) g.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); else g.lineTo(Math.cos(a) * 10, Math.sin(a) * 10); }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff8b8'; g.beginPath(); g.arc(0, 0, 4, 0, 6.28); g.fill();
    });
  }

  function sawSprite() {
    return bake('buzzsaw', 44, 44, function (g) {
      g.translate(22, 22); g.fillStyle = '#ffe14a';
      for (var i = 0; i < 8; i++) { g.save(); g.rotate(i * 0.785); g.beginPath(); g.moveTo(0, -20); g.lineTo(6, -11); g.lineTo(-6, -11); g.closePath(); g.fill(); g.restore(); }
      g.fillStyle = '#28e7ff'; g.beginPath(); g.arc(0, 0, 11, 0, 6.28); g.fill();
      g.fillStyle = '#0d152b'; g.beginPath(); g.arc(0, 0, 4, 0, 6.28); g.fill();
    });
  }

  var PMAX = 140, POP_MAX = 20, sparks = new Array(PMAX), spIdx = 0, popups = new Array(POP_MAX), popIdx = 0;
  for (var si = 0; si < PMAX; si++) sparks[si] = { on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 4, color: '#fff' };
  for (var pi = 0; pi < POP_MAX; pi++) popups[pi] = { on: false, x: 0, y: 0, life: 0, label: '', color: '#fff' };

  function addBurst(x, y, n, color, spd) {
    if (Kit.motion && Kit.motion.reduced()) n = Math.min(3, n);
    for (var i = 0; i < n; i++) {
      var p = sparks[spIdx]; spIdx = (spIdx + 1) % PMAX;
      var a = (i / n) * 6.28 + spIdx * 0.37, v = spd * (0.45 + (i % 4) * 0.2);
      p.on = true; p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
      p.life = p.max = 0.28 + (i % 3) * 0.08; p.r = 3 + (i % 3) * 1.8; p.color = color;
    }
  }
  function addPopup(x, y, label, color) {
    var p = popups[popIdx]; popIdx = (popIdx + 1) % POP_MAX;
    p.on = true; p.x = x; p.y = y; p.life = 1.15; p.label = label; p.color = color || '#ffe14a';
  }
  function clearFx() {
    for (var i = 0; i < PMAX; i++) sparks[i].on = false;
    for (var j = 0; j < POP_MAX; j++) popups[j].on = false;
  }

  var lastPopAt = 0, lastCoinAt = 0;
  function sfxPop(mag) { var t = performance.now(); if (t - lastPopAt >= 55 && Kit.juice) { lastPopAt = t; Kit.juice.pop(mag); } }
  function sfxCoin(st) { var t = performance.now(); if (t - lastCoinAt >= 75 && Kit.juice) { lastCoinAt = t; Kit.juice.coin(st); } }

  var gameState = 'title', garageReturn = 'title', pick = { players: 1, difficulty: 'easy', arena: 0 };
  var run = null, roundEnded = true, bannerUntil = 0, titleT = 0;
  var mouse = { active: false, screenX: 640, screenY: 360, startX: 640, startY: 360, down: false, rightDash: false };

  function $(id) { return document.getElementById(id); }
  function showOverlay(id) {
    var list = ['scrTitle', 'scrGarage', 'scrPause', 'scrResult'];
    for (var i = 0; i < list.length; i++) $(list[i]).hidden = list[i] !== id;
  }
  function fmtClock(sec) { var s = Math.max(0, Math.floor(sec)); return ((s / 60) | 0) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function showBanner(msg, dur) { var b = $('banner'); b.textContent = msg; b.hidden = false; bannerUntil = (run ? run.t : 0) + (dur || 2.2); }

  function paintTitleUI() {
    $('coinLbl').textContent = String(save.coins);
    $('btn1p').className = 'rs-chip' + (pick.players === 1 ? ' on' : '');
    $('btn2p').className = 'rs-chip' + (pick.players === 2 ? ' on' : '');
    $('howto1p').hidden = pick.players !== 1;
    $('howto2p').hidden = pick.players !== 2;
    var diffBtns = $('diffRow').querySelectorAll('button');
    for (var i = 0; i < diffBtns.length; i++) diffBtns[i].className = 'rs-chip' + (pick.difficulty === diffBtns[i].getAttribute('data-diff') ? ' on' : '');

    var arenaRow = $('arenaRow'); arenaRow.innerHTML = '';
    D.arenas.forEach(function (ar, idx) {
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'rs-arena' + (pick.arena === idx ? ' on' : '');
      btn.title = ar.desc;
      var sw = document.createElement('span'); sw.className = 'sw';
      sw.style.background = 'linear-gradient(135deg,' + ar.border + ',' + ar.accent + ')';
      sw.textContent = ar.icon || '⚡';
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = ar.name;
      btn.appendChild(sw); btn.appendChild(nm);
      btn.addEventListener('click', function () { pick.arena = idx; if (Kit.juice) Kit.juice.tap(); paintTitleUI(); dirty = true; });
      arenaRow.appendChild(btn);
    });
  }

  function paintGarageUI() {
    $('garageCoins').textContent = String(save.coins);
    var box = $('skinList'); box.innerHTML = '';
    D.skins.forEach(function (sk, idx) {
      var card = document.createElement('div');
      card.className = 'rs-skin' + (save.equipped === idx ? ' on' : '');
      var prev = document.createElement('canvas'); prev.width = 96; prev.height = 96;
      prev.getContext('2d').drawImage(mechSprite(idx), 0, 0);
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = sk.name;
      var btn = document.createElement('button'); btn.type = 'button';
      btn.className = 'sg-btn' + (save.equipped === idx ? ' good' : '');
      if (save.skins[idx]) {
        btn.textContent = save.equipped === idx ? 'مُجهّز' : 'تجهيز';
        btn.disabled = save.equipped === idx;
        btn.addEventListener('click', function () { save.equipped = idx; persist(); if (Kit.juice) Kit.juice.select(); paintGarageUI(); dirty = true; });
      } else {
        btn.textContent = sk.cost + ' ⚙️'; btn.disabled = save.coins < sk.cost;
        btn.addEventListener('click', function () {
          if (save.coins < sk.cost) return;
          save.coins -= sk.cost; save.skins[idx] = 1; save.equipped = idx; persist();
          if (Kit.juice) Kit.juice.levelUp(); paintGarageUI(); dirty = true;
        });
      }
      card.appendChild(prev); card.appendChild(nm); card.appendChild(btn); box.appendChild(card);
    });
  }

  function closeOpenRoundAsQuit() {
    if (run && !roundEnded) { roundEnded = true; Kit.stats.end('quit', run.score | 0); }
  }

  function startRun() {
    closeOpenRoundAsQuit(); clearFx();
    var ddaMul = dda.pick([0.86, 0.93, 1.0, 1.07, 1.15]);
    run = E.createRun({
      arena: pick.arena, difficulty: pick.difficulty, players: pick.players, ddaMul: ddaMul,
      skins: [save.equipped, (save.equipped + 1) % D.skins.length],
      seed: ((Date.now() & 0xfffffff) ^ ((Math.random() * 0xffffff) | 0)) >>> 0
    });
    var rk = run.arena.id + '_' + run.players + 'p';
    Kit.stats.round(rk);
    roundEnded = false; gameState = 'play';
    mouse.active = false; mouse.down = false; mouse.rightDash = false;
    mouse.startX = mouse.screenX; mouse.startY = mouse.screenY;

    showOverlay(null);
    canvas.focus({ preventScroll: true });
    $('xpTrack').hidden = false; $('btnPause').hidden = false; $('hud').hidden = false; $('bossBar').hidden = true;
    showBanner(D.waves[0].title, 1.5);
    updateHud();
    if (Kit.juice) Kit.juice.select();
    dirty = true;
  }

  function finishRound(outcome) {
    if (!run || roundEnded) return;
    roundEnded = true;
    var win = outcome === 'win', pts = run.score | 0;
    gameState = win ? 'win' : 'over';
    if (run.players === 1) dda.result(win ? 1 : Math.min(0.85, run.t / D.ROUND_SEC));
    Kit.stats.end(win ? 'win' : 'lose', pts);

    var earned = Math.max(8, (run.bolts | 0) + Math.floor(run.kills * 0.5) + (win ? 35 : 8));
    save.coins += earned;
    if (win) save.wins++;
    if (pts > save.best) save.best = pts;
    persist();

    $('xpTrack').hidden = true; $('btnPause').hidden = true; $('hud').hidden = true; $('bossBar').hidden = true; $('banner').hidden = true;
    $('resTitle').textContent = win ? 'انتصار ساحق!' : 'تحطّم الآلي!';
    var st = win ? run.stars : 0, starHtml = '';
    for (var i = 0; i < 3; i++) starHtml += i < st ? '★ ' : '<i>★</i> ';
    $('resStars').innerHTML = starHtml.trim();
    $('resStats').textContent = 'النقاط: ' + pts + ' · المدمّرة: ' + run.kills + ' · المكافأة: +' + earned + ' ⚙️';
    showOverlay('scrResult');
    if (Kit.juice) { if (win) Kit.juice.levelUp(); else Kit.juice.fail(); }
    dirty = true;
  }

  function pauseGame() {
    if (gameState !== 'play') return;
    gameState = 'pause'; mouse.down = false; mouse.rightDash = false;
    Kit.keys.reset(); showOverlay('scrPause'); dirty = true;
  }
  function resumeGame() {
    if (gameState !== 'pause') return;
    gameState = 'play'; mouse.active = false; mouse.startX = mouse.screenX; mouse.startY = mouse.screenY;
    showOverlay(null); canvas.focus({ preventScroll: true }); if (Kit.juice) Kit.juice.tap(); dirty = true;
  }
  function openTitle() {
    closeOpenRoundAsQuit(); run = null; clearFx(); gameState = 'title';
    $('xpTrack').hidden = true; $('btnPause').hidden = true; $('hud').hidden = true; $('bossBar').hidden = true; $('banner').hidden = true;
    paintTitleUI(); showOverlay('scrTitle'); dirty = true;
  }
  function openGarage(fromState) { garageReturn = fromState; paintGarageUI(); showOverlay('scrGarage'); if (Kit.juice) Kit.juice.tap(); dirty = true; }

  function pointerToLogical(ev) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    mouse.screenX = ((ev.clientX - rect.left) / rect.width) * VW;
    mouse.screenY = ((ev.clientY - rect.top) / rect.height) * VH;
  }
  canvas.addEventListener('pointermove', function (ev) {
    pointerToLogical(ev);
    if (gameState === 'play' && run && run.players === 1 && Math.hypot(mouse.screenX - mouse.startX, mouse.screenY - mouse.startY) > 8) mouse.active = true;
  });
  canvas.addEventListener('contextmenu', function (ev) {
    if (gameState === 'play') ev.preventDefault();
  });
  canvas.addEventListener('pointerdown', function (ev) {
    if (gameState !== 'play' || !run || run.players !== 1) return;
    if (ev.button === 2) {
      ev.preventDefault();
      pointerToLogical(ev);
      mouse.rightDash = true;
      return;
    }
    if (ev.button !== 0) return;
    pointerToLogical(ev); mouse.down = true; mouse.active = true;
  });
  window.addEventListener('pointerup', function () { mouse.down = false; });

  function axis(pos, neg) { return (Kit.keys.down(pos) ? 1 : 0) - (Kit.keys.down(neg) ? 1 : 0); }
  function gatherInputs() {
    var one = run.players === 1, x1 = axis('KeyD', 'KeyA'), y1 = axis('KeyS', 'KeyW');
    if (one) { x1 += axis('ArrowRight', 'ArrowLeft'); y1 += axis('ArrowDown', 'ArrowUp'); }
    if (x1 !== 0 || y1 !== 0) { mouse.active = false; mouse.startX = mouse.screenX; mouse.startY = mouse.screenY; }
    var dash1 = (Kit.keys.pressed('Space') || Kit.keys.pressed('ShiftLeft') || Kit.keys.pressed('ShiftRight') || (one && mouse.rightDash)) ? 1 : 0;
    mouse.rightDash = false;
    var inp1 = { x: x1, y: y1, dash: dash1, mouse: one && mouse.active, tx: run.cam.x - VW * 0.5 + mouse.screenX, ty: run.cam.y - VH * 0.5 + mouse.screenY };
    if (one) return [inp1];
    return [inp1, { x: axis('ArrowRight', 'ArrowLeft'), y: axis('ArrowDown', 'ArrowUp'), dash: (Kit.keys.pressed('Enter') || Kit.keys.pressed('NumpadEnter') || Kit.keys.pressed('Slash')) ? 1 : 0 }];
  }

  var hudEls = null;
  var hudLast = { wave: '', hearts: '', score: '', combo: '', xpW: '', xpLvl: '', bossW: '', bossLabel: '' };
  function getHudEls() {
    if (!hudEls) {
      hudEls = {
        wave: $('hudWave'), hearts: $('hudHearts'), score: $('hudScore'),
        combo: $('hudCombo'), xpFill: $('xpFill'), xpLvl: $('xpLvl'),
        bossBar: $('bossBar'), bossFill: $('bossFill'), bossLabel: $('bossLabel'),
        banner: $('banner')
      };
    }
    return hudEls;
  }
  function heartMarks(m) { var s = ''; for (var i = 0; i < m.maxHp; i++) s += i < m.hp ? '♥' : '♡'; return s; }
  function updateHud() {
    if (!run) return;
    var el = getHudEls();
    var waveTxt = (run.wave <= 3 ? ('⚡ ' + run.wave + '/3') : '👑 الزعيم') + ' · ' + fmtClock(run.t);
    if (hudLast.wave !== waveTxt) { hudLast.wave = waveTxt; el.wave.textContent = waveTxt; }
    var heartsTxt = run.players === 2 ? ('م1 ' + heartMarks(run.mechs[0]) + ' · م2 ' + heartMarks(run.mechs[1])) : heartMarks(run.mechs[0]);
    if (hudLast.hearts !== heartsTxt) { hudLast.hearts = heartsTxt; el.hearts.textContent = heartsTxt; }
    var scoreTxt = '⚙️ ' + run.bolts;
    if (hudLast.score !== scoreTxt) { hudLast.score = scoreTxt; el.score.textContent = scoreTxt; }
    var lvlTxt = 'مستوى ' + run.level;
    if (hudLast.xpLvl !== lvlTxt) { hudLast.xpLvl = lvlTxt; el.xpLvl.textContent = lvlTxt; }
    var comboHidden = run.combo < 3;
    if (el.combo.hidden !== comboHidden) el.combo.hidden = comboHidden;
    if (!comboHidden) {
      var comboTxt = '🔥 سلسلة ' + run.combo + '×';
      if (hudLast.combo !== comboTxt) { hudLast.combo = comboTxt; el.combo.textContent = comboTxt; }
    }
    var xpPct = run.xpNext > 0 ? Math.min(100, (run.xp / run.xpNext) * 100) : 0;
    var xpW = (Math.round(xpPct * 10) / 10) + '%';
    if (hudLast.xpW !== xpW) { hudLast.xpW = xpW; el.xpFill.style.width = xpW; }

    var boss = null;
    for (var i = 0; i < run.enemies.length; i++) if (run.enemies[i].kind === 5) { boss = run.enemies[i]; break; }
    var bossHidden = !boss;
    if (el.bossBar.hidden !== bossHidden) el.bossBar.hidden = bossHidden;
    if (boss) {
      var bossPct = Math.max(0, (boss.hp / boss.maxHp) * 100);
      var bossW = (Math.round(bossPct * 10) / 10) + '%';
      if (hudLast.bossW !== bossW) { hudLast.bossW = bossW; el.bossFill.style.width = bossW; }
      var bossLbl = boss.weakOpen ? 'الزعيم الآلي — نقطة ضعف مكشوفة!' : 'الزعيم الآلي العملاق';
      if (hudLast.bossLabel !== bossLbl) { hudLast.bossLabel = bossLbl; el.bossLabel.textContent = bossLbl; }
    }
    if (run.t >= bannerUntil && !el.banner.hidden) el.banner.hidden = true;
  }

  function processEvents() {
    for (var i = 0; i < run.events.length; i++) {
      var ev = run.events[i];
      if (ev.type === 'kill') {
        Kit.track.hit(); sfxPop(ev.isBoss ? 0.95 : 0.45);
        addBurst(ev.x, ev.y, ev.isBoss ? 28 : 9, ev.isBoss ? '#ffe14a' : '#ff8a24', ev.isBoss ? 260 : 150);
        shake.add(ev.isBoss ? 16 : 3.5);
        if (run.combo > 0 && run.combo % 10 === 0 && Kit.juice) Kit.juice.streak(Math.min(5, (run.combo / 10) | 0));
      } else if (ev.type === 'hit') {
        addBurst(ev.x, ev.y, ev.crit ? 6 : 3, ev.shield ? '#28e7ff' : (ev.crit ? '#ffe14a' : '#fff'), 95);
      } else if (ev.type === 'hurt') {
        Kit.track.miss(); if (Kit.juice) Kit.juice.impact(0.75);
        addBurst(ev.x, ev.y, 12, '#ff4d6d', 180); shake.add(11);
      } else if (ev.type === 'dash') {
        if (Kit.juice) Kit.juice.whoosh(0.8); addBurst(ev.x, ev.y, 8, '#28e7ff', 140);
      } else if (ev.type === 'bolt') {
        sfxCoin(1 + (run.bolts % 4));
      } else if (ev.type === 'pod') {
        if (Kit.juice) Kit.juice.levelUp();
        addPopup(ev.x, ev.y - 24, ev.text, D.pods[ev.podKind].color);
        addBurst(ev.x, ev.y, 14, D.pods[ev.podKind].color, 180); shake.add(6);
      } else if (ev.type === 'podSpawn') {
        if (Kit.juice) Kit.juice.select(); addPopup(ev.x, ev.y - 24, 'كبسولة سلاح!', '#70e4ff');
      } else if (ev.type === 'wave') {
        showBanner(ev.title, 2.2); if (Kit.juice) Kit.juice.whoosh(0.5);
      } else if (ev.type === 'bossSpawn') {
        showBanner('الزعيم الآلي وصل!', 2.6); if (Kit.juice) Kit.juice.impact(0.9); shake.add(12);
      } else if (ev.type === 'bossPhase2') {
        showBanner('المرحلة الثانية للزعيم!', 2.4); if (Kit.juice) Kit.juice.impact(0.85); shake.add(10);
      } else if (ev.type === 'revive') {
        if (Kit.juice) Kit.juice.levelUp(); addPopup(ev.x, ev.y - 26, 'عاد للقتال!', '#3ddc84');
      }
    }
    run.events.length = 0;
  }

  function update(dt) {
    if (gameState === 'play' && run) {
      if (Kit.keys.pressed('Escape') || Kit.keys.pressed('KeyP')) pauseGame();
      else {
        E.step(run, dt, gatherInputs());
        processEvents();
        for (var i = 0; i < PMAX; i++) {
          var sp = sparks[i];
          if (sp.on) { if ((sp.life -= dt) <= 0) sp.on = false; else { sp.x += sp.vx * dt; sp.y += sp.vy * dt; } }
        }
        for (var j = 0; j < POP_MAX; j++) {
          var pp = popups[j];
          if (pp.on) { pp.y -= 36 * dt; if ((pp.life -= dt) <= 0) pp.on = false; }
        }
        shake.update(dt); updateHud();
        if (run.state === 'win' || run.state === 'over') finishRound(run.state);
      }
    } else if (gameState === 'title') {
      if (!(Kit.motion && Kit.motion.reduced())) { titleT += dt; dirty = true; }
      if ($('scrGarage').hidden && (Kit.keys.pressed('Enter') || Kit.keys.pressed('NumpadEnter') || Kit.keys.pressed('Space'))) {
        startRun();
      }
    } else if (gameState === 'pause') {
      if (Kit.keys.pressed('KeyP') || Kit.keys.pressed('Escape')) resumeGame();
      else if (Kit.keys.pressed('KeyR')) startRun();
    } else if ((gameState === 'win' || gameState === 'over') && $('scrGarage').hidden && Kit.keys.pressed('KeyR')) {
      startRun();
    }
    Kit.keys.endFrame();
  }

  function drawLabel(label, x, y, size, fill) {
    ctx.save(); ctx.direction = 'rtl'; ctx.textAlign = 'center';
    ctx.font = '700 ' + size + 'px Fredoka, sans-serif';
    ctx.lineWidth = 5; ctx.strokeStyle = '#090e21'; ctx.strokeText(label, x, y);
    ctx.fillStyle = fill || '#fff'; ctx.fillText(label, x, y); ctx.restore();
  }
  function circ(x, y, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; if (lw) ctx.lineWidth = lw; ctx.stroke(); }
  }
  function glow(x, y, r0, r1, c0, c1) {
    var gr = ctx.createRadialGradient(x, y, r0, x, y, r1);
    gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    circ(x, y, r1, gr);
  }
  function drawShadow(x, y, rx, ry) {
    ctx.fillStyle = 'rgba(5,9,22,0.44)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.28); ctx.fill();
  }
  function drawHazardBorder(x, y, w, h, border, accent) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 14; ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = border; ctx.lineWidth = 5; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = accent; ctx.globalAlpha = 0.72;
    for (var s = 0; s < 5; s++) {
      var o = 22 + s * 22;
      ctx.fillRect(x + o, y - 4, 12, 8); ctx.fillRect(x + w - o - 12, y - 4, 12, 8);
      ctx.fillRect(x + o, y + h - 4, 12, 8); ctx.fillRect(x + w - o - 12, y + h - 4, 12, 8);
    }
    ctx.restore();
  }

  function drawTitleBackdrop() {
    var tile = tileSprite(pick.arena), ar = D.arenas[pick.arena], t = titleT;
    for (var y = 0; y < VH; y += TILE) for (var x = 0; x < VW; x += TILE) ctx.drawImage(tile, x, y);
    var spot = ctx.createRadialGradient(VW * 0.5, VH * 0.48, 40, VW * 0.5, VH * 0.48, 560);
    spot.addColorStop(0, 'rgba(64,210,255,0.14)'); spot.addColorStop(1, 'rgba(6,10,24,0.34)');
    ctx.fillStyle = spot; ctx.fillRect(0, 0, VW, VH);

    ctx.save(); ctx.globalAlpha = 0.22;
    circ(VW * 0.5, VH * 0.47, 175, 0, ar.border, 4);
    ctx.setLineDash([18, 14]);
    ctx.beginPath(); ctx.arc(VW * 0.5, VH * 0.47, 215, t * 0.3, t * 0.3 + 6.28); ctx.stroke();
    ctx.restore();
    drawHazardBorder(18, 18, VW - 36, VH - 36, ar.border, ar.accent);

    ctx.fillStyle = 'rgba(14,26,52,0.72)'; rr(ctx, 90, 495, 220, 56, 14); ctx.fill();
    ctx.strokeStyle = ar.border; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = ar.accent;
    for (var bx = 0; bx < 4; bx++) {
      var ax = 122 + ((bx * 52 + t * 65) % 192);
      if (ax < 292) { ctx.beginPath(); ctx.moveTo(ax + 12, 523); ctx.lineTo(ax - 8, 507); ctx.lineTo(ax - 8, 539); ctx.fill(); }
    }

    var hx = 335 + Math.cos(t * 1.4) * 16, hy = 355 + Math.sin(t * 2.1) * 18;
    var bossX = 955 + Math.cos(t * 1.1) * 14, bossY = 345 + Math.sin(t * 1.6) * 16;
    var aimA = Math.atan2(bossY - hy, bossX - hx), saw = sawSprite();
    drawShadow(hx, hy + 38, 44, 18);
    glow(hx, hy, 12, 118, 'rgba(40,231,255,0.28)', 'rgba(40,231,255,0)');
    for (var sw = 0; sw < 3; sw++) {
      var sa = t * 3.2 + sw * 2.094, sx = hx + Math.cos(sa) * 112, sy = hy + Math.sin(sa) * 92;
      drawShadow(sx, sy + 22, 18, 8);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(t * 10); ctx.drawImage(saw, -22, -22); ctx.restore();
    }
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(aimA); ctx.scale(1.45, 1.45);
    ctx.drawImage(mechSprite(save.equipped), -48, -48);
    circ(42, -18, 9, '#fff6a8'); circ(42, 18, 9, '#fff6a8');
    ctx.restore();

    for (var s = 0; s < 5; s++) {
      var frac = (t * 0.95 + s * 0.2) % 1;
      ctx.save(); ctx.translate(hx + 72 + frac * (bossX - hx - 160), hy + (s % 2 ? -24 : 24) + frac * (bossY - hy)); ctx.rotate(aimA);
      ctx.fillStyle = 'rgba(40,231,255,0.34)'; rr(ctx, -20, -10, 42, 20, 10); ctx.fill();
      ctx.fillStyle = s % 2 ? '#ffe14a' : '#28e7ff'; rr(ctx, -15, -5, 32, 10, 5); ctx.fill();
      ctx.fillStyle = '#fff'; rr(ctx, -8, -2.5, 18, 5, 2.5); ctx.fill();
      ctx.restore();
    }
    var sc1y = 255 + Math.sin(t * 3) * 12, sc2y = 435 + Math.cos(t * 2.7) * 12;
    ctx.beginPath(); ctx.moveTo(765, sc1y); ctx.lineTo(725, 345); ctx.lineTo(740, sc2y);
    ctx.strokeStyle = 'rgba(213,128,255,0.55)'; ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();

    var podY = 390 + Math.sin(t * 4) * 6;
    drawShadow(145, 434, 28, 11);
    circ(145, podY, 36 + Math.sin(t * 5) * 3, 0, '#ffe14a', 3);
    ctx.drawImage(podSprite(1), 107, podY - 38);

    glow(bossX, bossY, 20, 150, 'rgba(255,62,165,0.28)', 'rgba(255,62,165,0)');
    drawShadow(bossX, bossY + 62, 68, 24);
    var af = ((t * 5) | 0) & 1;
    ctx.save(); ctx.translate(bossX, bossY); ctx.scale(-1.12, 1.12); ctx.drawImage(enemySprite(5, af), -84, -84); ctx.restore();

    var bots = [[0, 765, sc1y], [2, 740, sc2y], [1, 1130, 230 + Math.sin(t * 4) * 10], [3, 1125, 470 + Math.cos(t * 3.2) * 10]];
    for (var bi = 0; bi < bots.length; bi++) {
      var bt = bots[bi]; drawShadow(bt[1], bt[2] + 24, 22, 9);
      ctx.save(); ctx.translate(bt[1], bt[2]); ctx.scale(-1.05, 1.05); ctx.drawImage(enemySprite(bt[0], af), -44, -44); ctx.restore();
    }
    for (var sp = 0; sp < 8; sp++) {
      var sa2 = t * 2.4 + sp * 0.785, sr = 24 + ((t * 48 + sp * 11) % 38);
      circ(bossX - 78 + Math.cos(sa2) * sr, bossY + Math.sin(sa2) * sr, 3.8, sp % 2 ? '#ffe14a' : '#28e7ff');
    }
  }

  function drawWorld() {
    var ar = run.arena, tile = tileSprite(ar.index);
    var camX = run.cam.x - VW * 0.5 + (gameState === 'play' ? shake.x : 0);
    var camY = run.cam.y - VH * 0.5 + (gameState === 'play' ? shake.y : 0);
    var anim = ((run.t * 6) | 0) & 1, i;

    ctx.save(); ctx.translate(-camX, -camY);
    var x0 = Math.max(0, Math.floor(camX / TILE) * TILE), y0 = Math.max(0, Math.floor(camY / TILE) * TILE);
    for (var ty = y0; ty < Math.min(D.H, camY + VH + TILE); ty += TILE)
      for (var tx = x0; tx < Math.min(D.W, camX + VW + TILE); tx += TILE) ctx.drawImage(tile, tx, ty);

    ctx.save(); ctx.globalAlpha = 0.2; circ(D.W * 0.5, D.H * 0.5, 165, 0, ar.border, 4);
    ctx.globalAlpha = 0.16; circ(D.W * 0.5, D.H * 0.5, 92, 0, ar.accent, 3); ctx.restore();
    drawHazardBorder(D.PAD, D.PAD, D.W - D.PAD * 2, D.H - D.PAD * 2, ar.border, ar.accent);

    for (i = 0; i < ar.boosts.length; i++) {
      var st = ar.boosts[i], dir = st.vx > 0 ? 1 : -1;
      ctx.fillStyle = 'rgba(40,231,255,0.12)'; rr(ctx, st.x - 8, st.y - 8, st.w + 16, st.h + 16, 20); ctx.fill();
      ctx.fillStyle = '#13213d'; rr(ctx, st.x, st.y, st.w, st.h, 14); ctx.fill();
      ctx.fillStyle = 'rgba(40,231,255,0.22)'; rr(ctx, st.x + 6, st.y + 6, st.w - 12, st.h - 12, 10); ctx.fill();
      ctx.strokeStyle = '#28e7ff'; ctx.lineWidth = 3.5; rr(ctx, st.x, st.y, st.w, st.h, 14); ctx.stroke();
      ctx.fillStyle = '#ffe14a';
      var scroll = ((run.t * 90) % 58) * dir;
      for (var cx = st.x + 34; cx < st.x + st.w - 22; cx += 58) {
        var ax = cx + scroll;
        if (ax < st.x + 18 || ax > st.x + st.w - 18) continue;
        ctx.beginPath(); ctx.moveTo(ax + dir * 14, st.y + st.h * 0.5); ctx.lineTo(ax - dir * 10, st.y + 15); ctx.lineTo(ax - dir * 10, st.y + st.h - 15); ctx.fill();
      }
    }
    for (i = 0; i < ar.coils.length; i++) {
      var c = ar.coils[i], cs = E.coilState(run, i);
      glow(c.x, c.y, 14, cs > 0 ? 142 : 76, cs === 2 ? 'rgba(255,225,74,0.45)' : (cs === 1 ? 'rgba(40,231,255,0.34)' : 'rgba(40,231,255,0.22)'), 'rgba(40,231,255,0)');
      if (cs > 0) { ctx.save(); ctx.setLineDash([12, 10]); circ(c.x, c.y, 140, 0, cs === 2 ? '#ffe14a' : 'rgba(112,228,255,0.65)', cs === 2 ? 4 : 2.5); ctx.restore(); }
      drawShadow(c.x, c.y + 8, c.r + 3, c.r * 0.72);
      circ(c.x, c.y, c.r, '#1b2c52', '#28e7ff', 4);
      ctx.fillStyle = cs ? '#ffe14a' : '#28e7ff'; ctx.beginPath(); ctx.arc(c.x, c.y, 11, 0, 6.28); gProngs(c.x, c.y); ctx.fill();
      circ(c.x, c.y, 4.5, '#fff');
    }
    for (i = 0; i < ar.vents.length; i++) {
      var v = ar.vents[i], vs = E.ventState(run, i);
      glow(v.x, v.y, 10, v.r * 1.35, vs === 2 ? 'rgba(255,225,74,0.6)' : 'rgba(255,107,43,0.32)', 'rgba(255,107,43,0)');
      circ(v.x, v.y, v.r, vs === 2 ? 'rgba(255,90,36,0.65)' : (vs === 1 ? 'rgba(255,155,40,0.35)' : 'rgba(60,20,30,0.75)'), vs === 2 ? '#ffe14a' : '#ff7b3a', vs === 2 ? 5 : 3);
      if (vs === 2) circ(v.x, v.y, v.r * 0.55, '#ffe14a');
    }
    for (i = 0; i < ar.warps.length; i++) {
      var wp = ar.warps[i];
      glow(wp.x, wp.y, 6, wp.r * 1.5, 'rgba(61,245,255,0.38)', 'rgba(61,245,255,0)');
      circ(wp.x, wp.y, wp.r, 'rgba(61,245,255,0.22)', '#3df5ff', 4);
      circ(wp.x, wp.y, wp.r * 0.58, 0, '#ff52b8', 4);
    }
    for (i = 0; i < ar.bumpers.length; i++) {
      var bp = ar.bumpers[i];
      drawShadow(bp.x, bp.y + 8, bp.r + 3, bp.r * 0.75);
      circ(bp.x, bp.y, bp.r, '#2d1854', '#ff52b8', 5); circ(bp.x, bp.y, 12, '#3df5ff');
    }

    var bolt = boltSprite();
    for (i = 0; i < run.boltDrops.length; i++) ctx.drawImage(bolt, run.boltDrops[i].x - 14, run.boltDrops[i].y - 14);
    for (i = 0; i < run.pods.length; i++) {
      var pod = run.pods[i], bob = Math.sin(run.t * 5 + i) * 4;
      drawShadow(pod.x, pod.y + 28, 24, 9);
      circ(pod.x, pod.y, 42, 'rgba(255,225,74,0.14)');
      circ(pod.x, pod.y, 35 + Math.sin(run.t * 6) * 3, 0, D.pods[pod.kind].color, 3);
      ctx.drawImage(podSprite(pod.kind), pod.x - 38, pod.y - 38 + bob);
      drawLabel(D.pods[pod.kind].name, pod.x, pod.y + 52, 16, D.pods[pod.kind].color);
    }

    for (i = 0; i < run.enemies.length; i++) {
      var e = run.enemies[i];
      if (e.kind === 2 && e.aiState === 1) {
        ctx.strokeStyle = 'rgba(255,140,40,0.75)'; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.aim) * 260, e.y + Math.sin(e.aim) * 260); ctx.stroke();
      } else if (e.kind === 5) {
        if (e.aiState === 1) {
          ctx.strokeStyle = 'rgba(255,56,92,0.42)'; ctx.lineWidth = 92;
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.aim) * 580, e.y + Math.sin(e.aim) * 580); ctx.stroke();
        } else if (e.aiState === 4 || e.aiState === 5) {
          var bms = e.phase2 ? [-0.26, 0.26] : [0];
          for (var bi = 0; bi < bms.length; bi++) {
            var ba = e.aim + bms[bi];
            ctx.strokeStyle = e.aiState === 5 ? '#ff3864' : 'rgba(255,225,74,0.6)'; ctx.lineWidth = e.aiState === 5 ? 30 : 5;
            ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(ba) * e.beamLen, e.y + Math.sin(ba) * e.beamLen); ctx.stroke();
            if (e.aiState === 5) { ctx.strokeStyle = '#fff8c4'; ctx.lineWidth = 10; ctx.stroke(); }
          }
        }
      }
      drawShadow(e.x, e.y + (e.kind === 5 ? 46 : e.r * 0.72), e.kind === 5 ? 58 : e.r * 0.95, e.kind === 5 ? 20 : e.r * 0.45);
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.aim);
      ctx.drawImage(enemySprite(e.kind, e.kind === 5 && e.weakOpen ? 2 : anim), e.kind === 5 ? -84 : -44, e.kind === 5 ? -84 : -44);
      ctx.restore();
      if (e.shield > 0) circ(e.x, e.y, e.r + 7, 0, '#28e7ff', 4);
      if (e.kind !== 5 && e.hp < e.maxHp) {
        ctx.fillStyle = 'rgba(8,14,30,0.8)'; ctx.fillRect(e.x - 18, e.y - e.r - 12, 36, 5);
        ctx.fillStyle = '#ff5a7a'; ctx.fillRect(e.x - 18, e.y - e.r - 12, 36 * Math.max(0, e.hp / e.maxHp), 5);
      }
      if (e.kind === 5 && e.weakOpen) drawLabel('نقطة ضعف!', e.x, e.y - 72, 22, '#ffe14a');
    }

    for (i = 0; i < run.mechs.length; i++) {
      var m = run.mechs[i];
      if (!m.alive) {
        circ(m.x, m.y, 68, 0, '#3ddc84', 6);
        ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(m.x, m.y, 68, -1.57, -1.57 + (m.revive / 1.5) * 6.28); ctx.stroke();
        drawLabel('أنقذ زميلك!', m.x, m.y - 16, 20, '#3ddc84'); continue;
      }
      if (m.dashT > 0) circ(m.x, m.y, 38, 0, 'rgba(40,231,255,0.65)', 5);
      if (m.lv[1] > 0) {
        var sN = D.pods[1].count[m.lv[1] - 1], saw = sawSprite();
        for (var s = 0; s < sN; s++) {
          var sa = m.sawAng + (6.283 * s) / sN;
          ctx.save(); ctx.translate(m.x + Math.cos(sa) * D.pods[1].orbit, m.y + Math.sin(sa) * D.pods[1].orbit);
          ctx.rotate(run.t * 12); ctx.drawImage(saw, -22, -22); ctx.restore();
        }
      }
      drawShadow(m.x, m.y + 20, 28, 13);
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.aim); ctx.translate(-m.recoil, 0);
      if (m.invuln > 0 && (((run.t * 16) | 0) & 1)) ctx.globalAlpha = 0.65;
      ctx.drawImage(mechSprite(m.skin), -48, -48);
      if (m.muzzleT > 0) { circ(40, -18, 8, '#fff6a8'); circ(40, 18, 8, '#fff6a8'); }
      ctx.restore();
      if (m.dashCd > 0) {
        ctx.fillStyle = 'rgba(8,14,30,0.8)'; ctx.fillRect(m.x - 24, m.y + 34, 48, 6);
        ctx.fillStyle = '#28e7ff'; ctx.fillRect(m.x - 24, m.y + 34, 48 * (1 - m.dashCd / m.dashMaxCd), 6);
      }
      if (run.players === 2) drawLabel('م' + (i + 1), m.x, m.y - 38, 16, i === 0 ? '#70e4ff' : '#ffe14a');
    }

    for (i = 0; i < run.shots.length; i++) {
      var sh = run.shots[i];
      if (sh.team === 1) {
        circ(sh.x, sh.y, sh.r * 1.5, 'rgba(255,56,100,0.32)'); circ(sh.x, sh.y, sh.r, '#ff3864'); circ(sh.x, sh.y, sh.r * 0.45, '#ffd6e0');
      } else {
        ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(sh.ang);
        if (sh.kind === 1) {
          ctx.fillStyle = '#ff6b35'; rr(ctx, -12, -5, 24, 10, 4); ctx.fill(); circ(-13, 0, 5, '#ffe14a');
        } else {
          ctx.fillStyle = sh.r >= 10 ? 'rgba(255,225,74,0.3)' : 'rgba(40,231,255,0.32)'; rr(ctx, -16, -8, 32, 16, 8); ctx.fill();
          ctx.fillStyle = sh.r >= 10 ? '#ffe14a' : '#28e7ff'; rr(ctx, -12, -4, 24, 8, 4); ctx.fill();
          ctx.fillStyle = '#fff'; rr(ctx, -6, -2, 14, 4, 2); ctx.fill();
        }
        ctx.restore();
      }
    }

    for (i = 0; i < run.arcs.length; i++) {
      var arc = run.arcs[i]; ctx.strokeStyle = arc.color;
      if (arc.kind === 'ring') circ(arc.x, arc.y, arc.r * (1.1 - arc.t * 2), 0, arc.color, 5);
      else { ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(arc.x1, arc.y1); ctx.lineTo((arc.x1 + arc.x2) * 0.5 + 14, (arc.y1 + arc.y2) * 0.5 - 14); ctx.lineTo(arc.x2, arc.y2); ctx.stroke(); }
    }
    for (i = 0; i < PMAX; i++) { var sp = sparks[i]; if (sp.on) circ(sp.x, sp.y, sp.r * (sp.life / sp.max), sp.color); }
    for (i = 0; i < POP_MAX; i++) { var pp = popups[i]; if (pp.on) drawLabel(pp.label, pp.x, pp.y, 24, pp.color); }
    ctx.restore();
  }

  function gProngs(x, y) {
    ctx.fillRect(x - 22, y - 3, 8, 6); ctx.fillRect(x + 14, y - 3, 8, 6);
    ctx.fillRect(x - 3, y - 22, 6, 8); ctx.fillRect(x - 3, y + 14, 6, 8);
  }

  function render() {
    if (gameState !== 'play') {
      if (!dirty) return;
      if (run) drawWorld(); else drawTitleBackdrop();
      dirty = false; return;
    }
    drawWorld(); dirty = false;
  }

  $('btnPlay').addEventListener('click', function () { startRun(); });
  $('btn1p').addEventListener('click', function () { pick.players = 1; if (Kit.juice) Kit.juice.tap(); paintTitleUI(); });
  $('btn2p').addEventListener('click', function () { pick.players = 2; if (Kit.juice) Kit.juice.tap(); paintTitleUI(); });
  $('diffRow').addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-diff]');
    if (btn) { pick.difficulty = btn.getAttribute('data-diff'); if (Kit.juice) Kit.juice.tap(); paintTitleUI(); }
  });
  $('btnGarage').addEventListener('click', function () { openGarage('title'); });
  $('btnResultGarage').addEventListener('click', function () { openGarage(gameState); });
  $('btnGarageBack').addEventListener('click', function () {
    if (Kit.juice) Kit.juice.tap();
    if (garageReturn === 'title') { paintTitleUI(); showOverlay('scrTitle'); } else showOverlay('scrResult');
    dirty = true;
  });
  $('btnPause').addEventListener('click', function () { pauseGame(); });
  $('btnResume').addEventListener('click', function () { resumeGame(); });
  $('btnRestart').addEventListener('click', function () { startRun(); });
  $('btnMenu').addEventListener('click', function () { if (Kit.juice) Kit.juice.tap(); openTitle(); });
  $('btnAgain').addEventListener('click', function () { startRun(); });
  $('btnResultMenu').addEventListener('click', function () { if (Kit.juice) Kit.juice.tap(); openTitle(); });

  window.__game = {
    get state() { return gameState; },
    get paused() { return gameState === 'pause'; },
    get px() { return run ? run.mechs[0].x : D.W * 0.5; },
    get py() { return run ? run.mechs[0].y : D.H * 0.5; },
    get t() { return run ? run.t : 0; },
    get run() { return run; },
    get save() { return save; }
  };

  openTitle();
  Kit.loop(update, render);
  Kit.lifecycle({ pause: function () { pauseGame(); } });
  Kit.ready();
})();
