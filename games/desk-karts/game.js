/* سباق المكاتب — Canvas Renderer, Kit.art Sprites, Dynamic Chase Camera, Audio & UI */
(function () {
  'use strict';

  var E = window.DKEngine, SAVE_KEY = 'sg:desk-karts:save';
  var canvas = document.getElementById('game');
  Kit.art.init({ canvas: canvas, mode: '2d', theme: 'day' });
  var view = Kit.fit(canvas, E.VIEW_W, E.VIEW_H);
  var ctx = view.ctx || canvas.getContext('2d');
  Kit.muteButton();

  var save = loadStoredSave();
  var saveBanner = Kit.saveStatus({ retry: function () { return persistSave(); } });
  var dda = Kit.dda('desk-karts', { start: 0.35, stepUp: 0.08, stepDown: 0.10 });

  var screen = 'title', modeHumans = 1, selectedTrack = 0, roundOpen = false, pausedDrawn = false;
  var bannerText = '', bannerT = 0, shakeT = 0, shakeMag = 0, particles = [], roadCache = null;

  var demoWorld = makeDemoWorld();
  var world = E.create(0, { humans: 1, diff: save.diff, dda: dda.level, kart: save.kart, flame: save.flame });

  var keys = Object.create(null), itemQueued = [false, false];
  var ptr = { down: false, id: -1, lx: E.VIEW_W * 0.5, ly: E.VIEW_H * 0.5 };

  function clearInputs() {
    for (var k in keys) keys[k] = false;
    itemQueued[0] = false; itemQueued[1] = false; ptr.down = false; ptr.id = -1;
  }

  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e)) return;
    var code = e.code;
    if (code === 'Escape' || code === 'KeyP') {
      if (screen === 'play') { e.preventDefault(); setPause(true); return; }
      if (screen === 'pause') { e.preventDefault(); setPause(false); return; }
    }
    if (screen !== 'play') return;
    if (code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight' || code === 'Space') e.preventDefault();
    if (!e.repeat) {
      if (code === 'Space' || code === 'ShiftRight' || (modeHumans === 1 && (code === 'KeyE' || code === 'ShiftLeft'))) itemQueued[0] = true;
      if (modeHumans === 2 && (code === 'Enter' || code === 'ShiftLeft' || code === 'KeyQ')) itemQueued[1] = true;
    }
    keys[code] = true;
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', clearInputs);

  canvas.addEventListener('pointerdown', function (e) {
    if (screen !== 'play' || e.button > 0) return;
    var lp = view.toLogical(e.clientX, e.clientY);
    ptr.down = true; ptr.id = e.pointerId; ptr.lx = lp.x; ptr.ly = lp.y;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!ptr.down || e.pointerId !== ptr.id) return;
    var lp = view.toLogical(e.clientX, e.clientY); ptr.lx = lp.x; ptr.ly = lp.y;
  });
  function releasePtr(e) { if (ptr.down && (!e || e.pointerId === ptr.id)) { ptr.down = false; ptr.id = -1; } }
  canvas.addEventListener('pointerup', releasePtr);
  canvas.addEventListener('pointercancel', releasePtr);

  function gatherInputs() {
    var out = [];
    if (world.humans === 1) {
      var up = keys.ArrowUp || keys.KeyW ? 1 : 0, dn = keys.ArrowDown || keys.KeyS ? 1 : 0;
      var lf = keys.ArrowLeft || keys.KeyA ? 1 : 0, rt = keys.ArrowRight || keys.KeyD ? 1 : 0;
      var p1 = world.karts[0], raw = {
        gas: up, brake: dn, steer: rt - lf, dirX: rt - lf, dirY: dn - up,
        drift: !!(keys.Space || keys.ShiftLeft || keys.ShiftRight), item: itemQueued[0],
        active: !!(up || dn || lf || rt || keys.Space || itemQueued[0] || ptr.down)
      };
      if (ptr.down) {
        var wx = (ptr.lx - E.VIEW_W * 0.5) / world.cam.zoom + world.cam.x;
        var wy = (ptr.ly - E.VIEW_H * 0.5) / world.cam.zoom + world.cam.y;
        if (Math.hypot(wx - p1.x, wy - p1.y) > 16) { raw.targetAngle = Math.atan2(wy - p1.y, wx - p1.x); raw.gas = 1; raw.brake = 0; }
      }
      out.push(raw);
    } else {
      var u1 = keys.ArrowUp ? 1 : 0, d1 = keys.ArrowDown ? 1 : 0, l1 = keys.ArrowLeft ? 1 : 0, r1 = keys.ArrowRight ? 1 : 0;
      var u2 = keys.KeyW ? 1 : 0, d2 = keys.KeyS ? 1 : 0, l2 = keys.KeyA ? 1 : 0, r2 = keys.KeyD ? 1 : 0;
      out.push({ gas: u1, brake: d1, steer: r1 - l1, dirX: r1 - l1, dirY: d1 - u1, drift: !!(keys.Space || keys.ShiftRight), item: itemQueued[0], active: !!(u1 || d1 || l1 || r1 || keys.Space || itemQueued[0]) });
      out.push({ gas: u2, brake: d2, steer: r2 - l2, dirX: r2 - l2, dirY: d2 - u2, drift: !!(keys.Enter || keys.ShiftLeft), item: itemQueued[1], active: !!(u2 || d2 || l2 || r2 || keys.Enter || itemQueued[1]) });
    }
    itemQueued[0] = false; itemQueued[1] = false;
    return out;
  }

  function loadStoredSave() {
    try { var raw = localStorage.getItem(SAVE_KEY); return raw ? E.loadSave(JSON.parse(raw)) : E.freshSave(); }
    catch (_) { return E.freshSave(); }
  }
  function persistSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); if (saveBanner) saveBanner.saved(); return true; }
    catch (_) { if (saveBanner) saveBanner.failed(); return false; }
  }

  var els = {
    hud: document.getElementById('hud'), btnPause: document.getElementById('btnPause'), btnItemUse: document.getElementById('btnItemUse'),
    scrTitle: document.getElementById('scrTitle'), scrMap: document.getElementById('scrMap'), scrShop: document.getElementById('scrShop'),
    scrPause: document.getElementById('scrPause'), scrResult: document.getElementById('scrResult'),
    titleStars: document.querySelector('#titleStars b'), titleCoins: document.querySelector('#titleCoins b'),
    diffRow: document.getElementById('diffRow'), diffDesc: document.getElementById('diffDesc'),
    cupGrid: document.getElementById('cupGrid'), btnMapMode: document.getElementById('btnMapMode'), btnMapDiff: document.getElementById('btnMapDiff'),
    shopCoins: document.querySelector('#shopCoins b'), shelfKarts: document.getElementById('shelfKarts'), shelfFlames: document.getElementById('shelfFlames'),
    pauseTrackLabel: document.getElementById('pauseTrackLabel'),
    resBadge: document.getElementById('resBadge'), resTitle: document.getElementById('resTitle'), resStars: document.getElementById('resStars'), resSummary: document.getElementById('resSummary')
  };

  function showScreen(next) {
    screen = next;
    els.hud.hidden = next !== 'play';
    els.scrTitle.hidden = next !== 'title'; els.scrMap.hidden = next !== 'map'; els.scrShop.hidden = next !== 'shop';
    els.scrPause.hidden = next !== 'pause'; els.scrResult.hidden = next !== 'result';
    if (next === 'title') refreshTitleUI();
    else if (next === 'map') renderMapUI();
    else if (next === 'shop') renderShopUI();
  }

  function refreshTitleUI() {
    els.titleStars.textContent = E.totalStars(save) + '/' + (E.TRACKS.length * 3);
    els.titleCoins.textContent = String(save.coins);
    var btns = els.diffRow.querySelectorAll('.diff-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('is-on', btns[i].getAttribute('data-diff') === save.diff);
    els.diffDesc.textContent = E.DIFFS[save.diff].desc;
  }

  function startRace(trackIdx, humans) {
    if (roundOpen) { Kit.stats.end('quit', 0); roundOpen = false; }
    selectedTrack = E.clamp(trackIdx | 0, 0, E.TRACKS.length - 1);
    modeHumans = humans === 2 ? 2 : 1;
    clearInputs(); particles.length = 0; shakeT = 0; bannerT = 0; bannerText = '';
    world = E.create(selectedTrack, { humans: modeHumans, diff: save.diff, dda: dda.level, kart: save.kart, flame: save.flame });
    buildRoadCache(world.L);
    var rk = 'dk_' + world.id.replace('-', '_');
    Kit.stats.round(rk); roundOpen = true;
    els.pauseTrackLabel.textContent = world.R.name + ' · ' + world.id;
    showScreen('play'); canvas.focus();
  }

  function setPause(pauseNow) {
    if (pauseNow && screen === 'play') { clearInputs(); pausedDrawn = false; showScreen('pause'); }
    else if (!pauseNow && screen === 'pause') { clearInputs(); showScreen('play'); canvas.focus(); }
  }

  function finishRace() {
    var p1 = world.karts[0], bestRank = world.humans === 2 ? Math.min(p1.rank, world.karts[1].rank) : p1.rank;
    var bestCoins = world.humans === 2 ? Math.max(p1.coins, world.karts[1].coins) : p1.coins;
    var res = E.applyResult(save, world.trackIdx, bestRank, world.time, bestCoins, save.diff);
    persistSave();
    var won = bestRank <= 3, score = Math.max(0, (5 - bestRank) * 250 + bestCoins * 25);
    if (roundOpen) { Kit.stats.end(won ? 'win' : 'lose', score); roundOpen = false; }
    dda.result(bestRank === 1 ? 1 : bestRank === 2 ? 0.75 : bestRank === 3 ? 0.4 : 0);
    if (won) Kit.juice.levelUp(); else Kit.juice.fail();

    var rankNames = ['المركز الأول! 🏆', 'المركز الثاني! 🥈', 'المركز الثالث! 🥉', 'المركز الرابع — حاول مجدداً!'];
    els.resBadge.textContent = world.R.name + ' · ' + world.id;
    els.resTitle.textContent = rankNames[E.clamp(bestRank - 1, 0, 3)];
    els.resStars.textContent = (res.stars >= 1 ? '★' : '☆') + ' ' + (res.stars >= 2 ? '★' : '☆') + ' ' + (res.stars >= 3 ? '★' : '☆');
    els.resSummary.innerHTML = '<div><b>' + world.time.toFixed(1) + ' ث</b><span>زمن السباق</span></div><div><b>+' + res.earned + ' 🪙</b><span>عملات مكتسبة' + (res.bestNew ? ' · رقم قياسي!' : '') + '</span></div>';
    selectedTrack = res.nextIdx;
    showScreen('result');
  }

  function renderMapUI() {
    els.btnMapMode.textContent = 'الطور: ' + (modeHumans === 2 ? 'لاعبان 👥' : 'لاعب 1');
    els.btnMapDiff.textContent = 'المستوى: ' + E.DIFFS[save.diff].name;
    var html = '';
    for (var c = 0; c < E.CUPS.length; c++) {
      var cup = E.CUPS[c];
      html += '<div class="cup-card"><div class="cup-head"><h3>' + (c + 1) + '. ' + cup.name + '</h3><span>' + cup.sub + '</span></div><div class="track-row">';
      for (var t = 0; t < E.TRACKS.length; t++) {
        var tr = E.TRACKS[t]; if (tr.cup !== c) continue;
        var st = save.tracks[t].s, stars = (st >= 1 ? '★' : '☆') + (st >= 2 ? '★' : '☆') + (st >= 3 ? '★' : '☆');
        html += '<button type="button" class="track-btn" data-track="' + t + '"><span class="track-id">' + tr.id + '</span><span class="track-name">' + tr.name + '</span><span class="track-stars">' + stars + '</span></button>';
      }
      html += '</div></div>';
    }
    els.cupGrid.innerHTML = html;
  }

  function renderShopUI() {
    els.shopCoins.textContent = String(save.coins);
    var kh = '', fh = '';
    for (var i = 0; i < E.KARTS.length; i++) {
      var k = E.KARTS[i], owned = !!save.karts[i], worn = save.kart === i;
      kh += '<button type="button" class="shop-item' + (worn ? ' is-worn' : '') + '" data-shelf="kart" data-idx="' + i + '"' + (!owned && save.coins < k.price ? ' disabled' : '') + '>' +
        '<span class="swatch" style="background:linear-gradient(135deg,' + k.body + ' 58%,' + k.trim + ' 58%)"></span><span class="shop-name">' + k.name + '</span><span class="shop-tag">' + (worn ? 'مجهّز ✓' : owned ? 'اختر' : (k.price + ' 🪙')) + '</span></button>';
    }
    for (var j = 0; j < E.FLAMES.length; j++) {
      var f = E.FLAMES[j], fOwned = !!save.flames[j], fWorn = save.flame === j;
      fh += '<button type="button" class="shop-item' + (fWorn ? ' is-worn' : '') + '" data-shelf="flame" data-idx="' + j + '"' + (!fOwned && save.coins < f.price ? ' disabled' : '') + '>' +
        '<span class="swatch" style="background:linear-gradient(90deg,' + f.c0 + ',' + f.c1 + ')"></span><span class="shop-name">' + f.name + '</span><span class="shop-tag">' + (fWorn ? 'مجهّز ✓' : fOwned ? 'اختر' : (f.price + ' 🪙')) + '</span></button>';
    }
    els.shelfKarts.innerHTML = kh; els.shelfFlames.innerHTML = fh;
  }

  document.getElementById('btnPlay').addEventListener('click', function () { Kit.juice.select(); startRace(0, 1); });
  document.getElementById('btnTwo').addEventListener('click', function () { Kit.juice.select(); startRace(0, 2); });
  document.getElementById('btnLevels').addEventListener('click', function () { Kit.juice.tap(); showScreen('map'); });
  document.getElementById('btnShop').addEventListener('click', function () { Kit.juice.tap(); showScreen('shop'); });
  els.diffRow.addEventListener('click', function (e) {
    var b = e.target.closest('[data-diff]'); if (!b) return;
    var dk = b.getAttribute('data-diff');
    if (E.DIFFS[dk]) { save.diff = dk; persistSave(); Kit.juice.tap(); refreshTitleUI(); }
  });
  els.btnMapMode.addEventListener('click', function () { modeHumans = modeHumans === 1 ? 2 : 1; Kit.juice.tap(); renderMapUI(); });
  els.btnMapDiff.addEventListener('click', function () {
    var order = ['easy', 'normal', 'hero'];
    save.diff = order[(order.indexOf(save.diff) + 1) % order.length]; persistSave(); Kit.juice.tap(); renderMapUI();
  });
  document.getElementById('btnMapBack').addEventListener('click', function () { Kit.juice.tap(); showScreen('title'); });
  els.cupGrid.addEventListener('click', function (e) {
    var b = e.target.closest('[data-track]'); if (!b) return;
    Kit.juice.select(); startRace(parseInt(b.getAttribute('data-track'), 10), modeHumans);
  });
  document.getElementById('btnShopBack').addEventListener('click', function () { Kit.juice.tap(); showScreen('title'); });
  function onShelfClick(e) {
    var b = e.target.closest('[data-shelf]'); if (!b || b.disabled) return;
    var act = E.buy(save, b.getAttribute('data-shelf'), parseInt(b.getAttribute('data-idx'), 10));
    if (act) { persistSave(); if (act === 'bought') Kit.juice.coin(); else Kit.juice.tap(); renderShopUI(); }
  }
  els.shelfKarts.addEventListener('click', onShelfClick);
  els.shelfFlames.addEventListener('click', onShelfClick);
  els.btnPause.addEventListener('click', function () { Kit.juice.tap(); setPause(true); });
  els.btnItemUse.addEventListener('click', function () { if (screen === 'play') itemQueued[0] = true; });
  document.getElementById('btnResume').addEventListener('click', function () { Kit.juice.tap(); setPause(false); });
  document.getElementById('btnRestart').addEventListener('click', function () { Kit.juice.select(); startRace(world.trackIdx, world.humans); });
  document.getElementById('btnPauseMap').addEventListener('click', function () { if (roundOpen) { Kit.stats.end('quit', 0); roundOpen = false; } Kit.juice.tap(); showScreen('map'); });
  document.getElementById('btnPauseHome').addEventListener('click', function () { if (roundOpen) { Kit.stats.end('quit', 0); roundOpen = false; } Kit.juice.tap(); showScreen('title'); });
  document.getElementById('resNext').addEventListener('click', function () { Kit.juice.select(); startRace(selectedTrack, modeHumans); });
  document.getElementById('resAgain').addEventListener('click', function () { Kit.juice.select(); startRace(world.trackIdx, modeHumans); });
  document.getElementById('resMap').addEventListener('click', function () { Kit.juice.tap(); showScreen('map'); });
  document.getElementById('resShop').addEventListener('click', function () { Kit.juice.tap(); showScreen('shop'); });
  Kit.lifecycle({ pause: function () { if (screen === 'play') setPause(true); } });

  function makeDemoWorld() {
    var dw = E.create(0, { humans: 1, diff: 'normal', dda: 0.45, seed: 7 });
    dw.karts[0].human = false; dw.karts[0].started = true; dw.karts[0].aiSkill = 1.02;
    return dw;
  }

  /* ---------------- Kit.art Cached Sprite Getters (Static Keys) ---------------- */
  function drawKartArt(c, w, h, body, trim, cockpit, style) {
    c.save(); c.translate(w * 0.5, h * 0.5);
    var wheels = [[-17, -19], [16, -19], [-17, 13], [16, 13]];
    for (var i = 0; i < 4; i++) {
      Kit.art.round(c, wheels[i][0], wheels[i][1], 14, 7, 3);
      c.fillStyle = '#1e2436'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#0f1220'; c.stroke();
      c.fillStyle = '#94a3b8'; c.fillRect(wheels[i][0] + 4, wheels[i][1] + 2, 6, 2);
    }
    c.fillStyle = '#cbd5e1'; c.fillRect(-30, -9, 7, 5); c.fillRect(-30, 4, 7, 5);
    Kit.art.round(c, -26, -15, 52, 30, 11);
    var g = c.createLinearGradient(0, -15, 0, 15);
    g.addColorStop(0, Kit.art.shade(body, 0.24)); g.addColorStop(0.55, body); g.addColorStop(1, Kit.art.shade(body, -0.24));
    c.fillStyle = g; c.fill(); c.lineWidth = 3; c.strokeStyle = '#1b1640'; c.stroke();
    c.fillStyle = trim;
    if (style === 1) { Kit.art.round(c, 4, -13, 20, 26, 8); c.fill(); }
    else if (style === 2) { Kit.art.round(c, 10, -14, 16, 28, 5); c.fill(); }
    else if (style === 3) { c.beginPath(); c.moveTo(-22, -21); c.lineTo(18, 0); c.lineTo(-22, 21); c.closePath(); c.fill(); c.lineWidth = 2; c.stroke(); }
    else c.fillRect(-20, -5, 44, 10);
    Kit.art.round(c, -27, -16, 9, 32, 4);
    c.fillStyle = trim; c.fill(); c.lineWidth = 2.4; c.strokeStyle = '#1b1640'; c.stroke();
    Kit.art.round(c, -9, -10, 20, 20, 8); c.fillStyle = cockpit; c.fill();
    c.beginPath(); c.arc(0, 0, 8.5, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = '#1b1640'; c.stroke();
    Kit.art.round(c, 1, -6, 7, 12, 3); c.fillStyle = '#38bdf8'; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(12, -10, 9, 4);
    c.restore();
  }

  var KART_KEYS = ['kart_p1_0', 'kart_p1_1', 'kart_p1_2', 'kart_p1_3', 'kart_p1_4'];
  var RIVAL_KEYS = ['kart_rv_0', 'kart_rv_1', 'kart_rv_2'];
  function getKartSprite(k) {
    if (k.human && k.id === 0) {
      var idx = E.clamp(k.kartIdx | 0, 0, 4), kd = E.KARTS[idx];
      return Kit.art.sprite(KART_KEYS[idx], 68, 52, function (c, bw, bh) { drawKartArt(c, bw, bh, kd.body, kd.trim, kd.cockpit, idx); }, { pad: 6 });
    }
    if (k.human) return Kit.art.sprite('kart_p2', 68, 52, function (c, bw, bh) { drawKartArt(c, bw, bh, '#00d2ff', '#a8ff78', '#1b1640', 0); }, { pad: 6 });
    var rIdx = (k.rivalStyle - 1 + 3) % 3, rv = E.RIVALS[rIdx];
    return Kit.art.sprite(RIVAL_KEYS[rIdx], 68, 52, function (c, bw, bh) { drawKartArt(c, bw, bh, rv.body, rv.trim, '#1b1640', 0); }, { pad: 6 });
  }

  function getItemSprite(kind) {
    if (kind === 'box') return Kit.art.sprite('box_up', 48, 48, function (c, bw, bh) {
      Kit.art.round(c, 6, 6, bw - 12, bh - 12, 10);
      var g = c.createLinearGradient(6, 6, bw - 6, bh - 6);
      g.addColorStop(0, '#ff5964'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#38bdf8');
      c.fillStyle = g; c.fill(); c.lineWidth = 3; c.strokeStyle = '#1b1640'; c.stroke();
      c.fillStyle = '#1b1640'; c.font = '900 22px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('؟', bw * 0.5, bh * 0.54);
    }, { pad: 4 });
    if (kind === 'coin') return Kit.art.sprite('coin_gold', 32, 32, function (c, bw, bh) {
      c.beginPath(); c.arc(bw * 0.5, bh * 0.5, 12, 0, Math.PI * 2); c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 2.6; c.strokeStyle = '#1b1640'; c.stroke();
      c.beginPath(); c.arc(bw * 0.5, bh * 0.5, 7, 0, Math.PI * 2); c.strokeStyle = '#f59e0b'; c.lineWidth = 2; c.stroke();
    }, { pad: 4 });
    if (kind === 'glue') return Kit.art.sprite('glue_blob', 68, 68, function (c, bw, bh) {
      Kit.art.blob(c, bw * 0.5, bh * 0.5, 24, 0.16, 1.2);
      c.fillStyle = '#fef3c7'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#1b1640'; c.stroke();
      c.fillStyle = '#f59e0b'; c.beginPath(); c.arc(bw * 0.45, bh * 0.45, 7, 0, Math.PI * 2); c.fill();
    }, { pad: 4 });
    if (kind === 'rocket') return Kit.art.sprite('ink_rocket', 52, 26, function (c, bw, bh) {
      c.save(); c.translate(bw * 0.5, bh * 0.5);
      Kit.art.round(c, -18, -7, 30, 14, 6); c.fillStyle = '#3b82f6'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#1b1640'; c.stroke();
      c.beginPath(); c.moveTo(12, -7); c.lineTo(23, 0); c.lineTo(12, 7); c.closePath(); c.fillStyle = '#1e1b4b'; c.fill(); c.stroke();
      c.fillStyle = '#f43f5e'; c.fillRect(-22, -10, 7, 20); c.restore();
    }, { pad: 4 });
    return Kit.art.sprite('pad_boost', 76, 52, function (c, bw, bh) {
      Kit.art.round(c, 5, 6, bw - 10, bh - 12, 10); c.fillStyle = '#0ea5e9'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#1b1640'; c.stroke();
      c.strokeStyle = '#fef08a'; c.lineWidth = 4.5;
      for (var o = -14; o <= 14; o += 14) { c.beginPath(); c.moveTo(bw * 0.5 + o - 7, 14); c.lineTo(bw * 0.5 + o + 6, bh * 0.5); c.lineTo(bw * 0.5 + o - 7, bh - 14); c.stroke(); }
    }, { pad: 4 });
  }

  function getHazardSprite(hk) {
    var key = hk === 'slime' ? 'hz_slime' : hk === 'juice' ? 'hz_juice' : 'hz_paint';
    var col = hk === 'slime' ? '#84cc16' : hk === 'juice' ? '#fb923c' : '#ec4899';
    return Kit.art.sprite(key, 82, 74, function (c, bw, bh) {
      Kit.art.blob(c, bw * 0.5, bh * 0.5, 28, 0.18, 0.5);
      c.fillStyle = col; c.fill(); c.lineWidth = 3; c.strokeStyle = '#1b1640'; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.arc(bw * 0.42, bh * 0.4, 6, 0, Math.PI * 2); c.fill();
    }, { pad: 4 });
  }

  function getBumperSprite(bk) {
    if (bk === 'keycap') return Kit.art.sprite('bmp_keycap', 68, 68, function (c) {
      Kit.art.round(c, 8, 8, 52, 52, 12); c.fillStyle = '#a855f7'; c.fill(); c.lineWidth = 3.5; c.strokeStyle = '#1b1640'; c.stroke();
      Kit.art.round(c, 15, 14, 38, 36, 8); c.fillStyle = '#f8fafc'; c.fill();
      c.fillStyle = '#1b1640'; c.font = '900 18px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('⚡', 34, 33);
    }, { pad: 4 });
    return Kit.art.sprite('bmp_eraser', 68, 68, function (c, bw, bh) {
      c.beginPath(); c.arc(bw * 0.5, bh * 0.5, 27, 0, Math.PI * 2); c.fillStyle = '#fb7185'; c.fill(); c.lineWidth = 3.5; c.strokeStyle = '#1b1640'; c.stroke();
      c.beginPath(); c.arc(bw * 0.5, bh * 0.5, 17, 0, Math.PI * 2); c.fillStyle = '#38bdf8'; c.fill(); c.stroke();
    }, { pad: 4 });
  }

  var PROP_DEFS = {
    crayon_r: ['prop_cr_r', 132, 34, '#ef4444'], crayon_b: ['prop_cr_b', 132, 34, '#3b82f6'],
    ruler: ['prop_ruler', 156, 42, '#fbbf24'], eraser: ['prop_eraser', 88, 52, '#fb7185'],
    notebook: ['prop_note', 114, 88, '#fef9c3'], beaker: ['prop_beak', 76, 80, '#a3e635'],
    magnet_prop: ['prop_mag', 76, 72, '#ef4444'], keyboard: ['prop_kbd', 136, 58, '#334155'],
    mouse: ['prop_mse', 72, 50, '#e2e8f0'], pizza: ['prop_pza', 98, 88, '#fde047'],
    juice_box: ['prop_jce', 68, 82, '#fb923c'], stapler_prop: ['prop_stp', 118, 46, '#6366f1']
  };
  function getPropSprite(kind) {
    var d = PROP_DEFS[kind] || PROP_DEFS.ruler;
    return Kit.art.sprite(d[0], d[1], d[2], function (c, bw, bh) {
      Kit.art.round(c, 8, 6, bw - 16, bh - 12, 9);
      c.fillStyle = d[3]; c.fill(); c.lineWidth = 3; c.strokeStyle = '#1b1640'; c.stroke();
      if (kind === 'ruler') {
        for (var x = 20; x < bw - 18; x += 14) { c.beginPath(); c.moveTo(x, 6); c.lineTo(x, x % 28 === 6 ? 20 : 14); c.stroke(); }
      } else if (kind === 'eraser') {
        Kit.art.round(c, bw * 0.55, 6, bw * 0.36, bh - 12, 7); c.fillStyle = '#38bdf8'; c.fill(); c.stroke();
      } else {
        c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(22, 12, bw - 44, 8);
      }
    }, { pad: 4 });
  }

  function buildRoadCache(L) {
    if (roadCache && roadCache.L === L) return;
    var path = new Path2D();
    for (var i = 0; i < L.pts.length; i++) { var p = L.pts[i]; if (i === 0) path.moveTo(p.x, p.y); else path.lineTo(p.x, p.y); }
    path.closePath();
    roadCache = { L: L, path: path };
  }

  var ITEM_NAMES = { ink_rocket: '🚀 صاروخ الحبر', eraser_turbo: '🔥 تيربو الممحاة', clip_magnet: '🧲 مغناطيس المشابك', glue_trap: '🍯 بقعة الصمغ', ruler_jump: '📐 قفزة المسطرة' };
  function spawnBurst(x, y, col, count) {
    if (Kit.motion.reduced()) return;
    for (var i = 0; i < count && particles.length < 110; i++) {
      var a = (i / count) * Math.PI * 2 + i * 0.37, spd = 70 + (i % 4) * 45;
      particles.push({ x: x, y: y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.42, max: 0.42, col: col, r: 5 + (i % 3) * 2 });
    }
  }
  function showBanner(txt, dur) { bannerText = txt; bannerT = dur || 1.2; }

  function handleEvents(ev) {
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i], isHuman = e.kart != null && world.karts[e.kart] && world.karts[e.kart].human;
      if (e.t === 'coin' && isHuman) { Kit.juice.coin(); Kit.track.hit(); spawnBurst(e.x, e.y, '#ffd23f', 6); }
      else if (e.t === 'box' && isHuman) { Kit.juice.pop(); Kit.track.hit(); spawnBurst(e.x, e.y, '#38bdf8', 8); }
      else if ((e.t === 'pad' || e.t === 'ramp') && isHuman) {
        Kit.juice.whoosh(); Kit.track.hit();
        showBanner(e.t === 'ramp' ? 'قفزة المسطرة! ⭐' : 'انطلاق تيربو! ⚡', 1.0);
        spawnBurst(e.x, e.y, '#00e5ff', 10);
      } else if (e.t === 'driftBoost' && isHuman) {
        Kit.juice.streak(e.lv + 1); Kit.track.hit();
        showBanner(e.lv === 2 ? 'شرارات تيربو خارقة! 🔥' : 'دفعة دريفت! ⚡', 1.0);
        spawnBurst(e.x, e.y, e.lv === 2 ? '#ff7b00' : '#38bdf8', 10);
      } else if (e.t === 'trickLand' && isHuman) { Kit.juice.star(); Kit.track.hit(); showBanner('هبوط بهلواني! ⭐', 1.0); }
      else if (e.t === 'item' && isHuman) { Kit.juice.whoosh(); Kit.track.hit(); showBanner((ITEM_NAMES[e.kind] || 'تيربو') + '!', 1.1); }
      else if (e.t === 'inkHit' || e.t === 'glueHit' || e.t === 'zap' || e.t === 'chomp' || e.t === 'edgeDrop') {
        if (isHuman) {
          Kit.juice.impact(); Kit.track.miss();
          if (!Kit.motion.reduced()) { shakeT = 0.25; shakeMag = 7; }
          showBanner(e.t === 'inkHit' ? 'لطخة حبر! 🖋️' : e.t === 'chomp' ? 'عضة الدباسة! 📎' : 'انزلاق!', 1.0);
        } else if (e.owner != null && world.karts[e.owner] && world.karts[e.owner].human) {
          Kit.juice.pop(); Kit.track.hit(); showBanner('إصابة مباشرة! 🎯', 1.0);
        }
      } else if (e.t === 'lap' && isHuman && e.lap < E.LAPS) {
        Kit.juice.star(); Kit.track.hit();
        showBanner(e.lap === E.LAPS - 1 ? 'الدورة الأخيرة! 🏁' : ('دورة ' + (e.lap + 1) + '/' + E.LAPS + '!'), 1.3);
      } else if (e.t === 'warp' && isHuman) { Kit.juice.whoosh(); showBanner('لحاق سريع! ✨', 0.9); }
    }
  }

  function update(dt) {
    if (screen === 'title') {
      demoWorld.ev.length = 0; E.step(demoWorld, dt, []);
      if (demoWorld.worldTime > 42) demoWorld = makeDemoWorld();
      return;
    }
    if (screen !== 'play') return;

    var wasStarted = world.karts[0].started;
    world.ev.length = 0;
    E.step(world, dt, gatherInputs());
    if (!wasStarted && world.karts[0].started) Kit.juice.whoosh();
    handleEvents(world.ev);

    var p1 = world.karts[0];
    els.btnItemUse.hidden = !p1.item;
    if (p1.item) els.btnItemUse.textContent = (ITEM_NAMES[p1.item] || 'مفاجأة') + ' · أطلق!';

    if (!Kit.motion.reduced()) {
      for (var ki = 0; ki < world.karts.length; ki++) {
        var k = world.karts[ki];
        if (!k.started) continue;
        if ((k.turboT > 0 || k.miniBoostT > 0 || k.padBoostT > 0 || k.drifting) && particles.length < 110) {
          var fl = E.FLAMES[k.flameIdx || 0];
          var col = k.drifting ? (k.driftLv === 2 ? '#ff7b00' : k.driftLv === 1 ? '#38bdf8' : '#e2e8f0') : fl.c0;
          particles.push({ x: k.x - Math.cos(k.ang) * 28, y: k.y - Math.sin(k.ang) * 28, vx: ((ki * 19 % 7) - 3) * 14, vy: ((ki * 13 % 7) - 3) * 14, life: 0.24, max: 0.24, col: col, r: k.turboT > 0 ? 9 : 6 });
        }
      }
    }
    for (var pi = particles.length - 1; pi >= 0; pi--) {
      var pt = particles[pi]; pt.life -= dt;
      if (pt.life <= 0) { particles.splice(pi, 1); continue; }
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    }
    if (bannerT > 0) bannerT = Math.max(0, bannerT - dt);
    if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
    if (world.done) finishRace();
  }

  function renderWorldScene(w, centerVx, centerVy) {
    var L = w.L, cup = L.cup;
    buildRoadCache(L);
    ctx.fillStyle = cup.bg; ctx.fillRect(0, 0, E.VIEW_W, E.VIEW_H);

    ctx.save();
    var sx = (shakeT > 0 && !Kit.motion.reduced()) ? Math.sin(w.worldTime * 55) * shakeMag : 0;
    var sy = (shakeT > 0 && !Kit.motion.reduced()) ? Math.cos(w.worldTime * 48) * shakeMag : 0;
    ctx.translate(centerVx + sx, centerVy + sy);
    ctx.scale(w.cam.zoom, w.cam.zoom);
    ctx.translate(-w.cam.x, -w.cam.y);

    var vx0 = Math.max(0, Math.floor((w.cam.x - 900) / 160) * 160), vx1 = Math.min(E.WORLD_W, w.cam.x + 900);
    var vy0 = Math.max(0, Math.floor((w.cam.y - 650) / 160) * 160), vy1 = Math.min(E.WORLD_H, w.cam.y + 650);
    ctx.strokeStyle = cup.grid; ctx.lineWidth = 3; ctx.beginPath();
    for (var gx = vx0; gx <= vx1; gx += 160) { ctx.moveTo(gx, vy0); ctx.lineTo(gx, vy1); }
    for (var gy = vy0; gy <= vy1; gy += 160) { ctx.moveTo(vx0, gy); ctx.lineTo(vx1, gy); }
    ctx.stroke();
    ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 14; ctx.strokeRect(40, 40, E.WORLD_W - 80, E.WORLD_H - 80);

    for (var pr = 0; pr < L.props.length; pr++) {
      var prop = L.props[pr];
      if (Math.abs(prop.x - w.cam.x) < 960 && Math.abs(prop.y - w.cam.y) < 680) Kit.art.blit(ctx, getPropSprite(prop.kind), prop.x, prop.y, { rot: prop.rot });
    }

    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(15, 12, 36, 0.34)'; ctx.lineWidth = L.hw * 2 + 28; ctx.stroke(roadCache.path);
    ctx.strokeStyle = '#1b1640'; ctx.lineWidth = L.hw * 2 + 18; ctx.stroke(roadCache.path);
    if (!w.params.openEdges) {
      ctx.strokeStyle = cup.curbB; ctx.lineWidth = L.hw * 2 + 10; ctx.stroke(roadCache.path);
      ctx.save(); ctx.setLineDash([42, 42]); ctx.strokeStyle = w.params.diff === 'easy' ? '#ffd23f' : cup.curbA; ctx.lineWidth = L.hw * 2 + 10; ctx.stroke(roadCache.path); ctx.restore();
    }
    ctx.strokeStyle = cup.road; ctx.lineWidth = L.hw * 2 - 6; ctx.stroke(roadCache.path);
    ctx.save(); ctx.setLineDash([30, 32]); ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 5; ctx.stroke(roadCache.path); ctx.restore();

    for (var wi = 0; wi < L.winds.length; wi++) {
      var wn = L.winds[wi]; ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)'; ctx.lineWidth = 4;
      for (var ws = wn.s0; ws < wn.s1; ws += 55) {
        var wc = E.at(L, ws + ((w.worldTime * 160) % 55));
        ctx.beginPath(); ctx.moveTo(wc.x - wc.tx * 18, wc.y - wc.ty * 18); ctx.lineTo(wc.x + wc.tx * 18, wc.y + wc.ty * 18); ctx.stroke();
      }
    }

    var st = E.at(L, 28), sq = 18, rows = Math.floor((L.hw * 2 - 12) / sq);
    ctx.save(); ctx.translate(st.x, st.y); ctx.rotate(Math.atan2(st.ty, st.tx));
    for (var r = 0; r < rows; r++) {
      var ry = -L.hw + 8 + r * sq;
      ctx.fillStyle = r % 2 === 0 ? '#fff' : '#1b1640'; ctx.fillRect(-sq, ry, sq, sq);
      ctx.fillStyle = r % 2 === 0 ? '#1b1640' : '#fff'; ctx.fillRect(0, ry, sq, sq);
    }
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -L.hw - 6, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, L.hw + 6, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();

    for (var mi = 0; mi < L.magnets.length; mi++) {
      var mg = L.magnets[mi]; ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(mg.x, mg.y, mg.r * (0.7 + 0.25 * ((w.worldTime * 1.6) % 1)), 0, Math.PI * 2); ctx.stroke();
    }
    for (var rmi = 0; rmi < L.ramps.length; rmi++) {
      var rm = L.ramps[rmi];
      ctx.save(); ctx.translate(rm.x, rm.y); ctx.rotate(rm.ang);
      Kit.art.round(ctx, -48, -40, 96, 80, 10); ctx.fillStyle = '#f59e0b'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = '#1b1640'; cStrokeFillRamp(); ctx.restore();
    }
    for (var pdi = 0; pdi < L.pads.length; pdi++) Kit.art.blit(ctx, getItemSprite('pad'), L.pads[pdi].x, L.pads[pdi].y, { rot: L.pads[pdi].ang });
    for (var hzi = 0; hzi < L.hazards.length; hzi++) Kit.art.blit(ctx, getHazardSprite(L.hazards[hzi].kind), L.hazards[hzi].x, L.hazards[hzi].y);
    for (var trp = 0; trp < w.traps.length; trp++) Kit.art.blit(ctx, getItemSprite('glue'), w.traps[trp].x, w.traps[trp].y);
    for (var bmi = 0; bmi < L.bumpers.length; bmi++) Kit.art.blit(ctx, getBumperSprite(L.bumpers[bmi].kind), L.bumpers[bmi].x, L.bumpers[bmi].y);

    for (var coi = 0; coi < L.coils.length; coi++) {
      var co = L.coils[coi], zapOn = ((w.worldTime + co.phase) % co.period) < 0.85;
      ctx.beginPath(); ctx.arc(co.x, co.y, co.r, 0, Math.PI * 2);
      ctx.fillStyle = zapOn ? 'rgba(56, 189, 248, 0.45)' : 'rgba(148, 163, 184, 0.2)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = zapOn ? '#00e5ff' : '#64748b'; ctx.stroke();
    }
    for (var chi = 0; chi < L.chompers.length; chi++) {
      var ch = L.chompers[chi], snapOn = ((w.worldTime + ch.phase) % ch.period) < 0.65;
      ctx.save(); ctx.translate(ch.x, ch.y); ctx.rotate(ch.ang);
      Kit.art.round(ctx, -32, snapOn ? -16 : -28, 64, snapOn ? 32 : 20, 8);
      ctx.fillStyle = snapOn ? '#ef4444' : '#4f46e5'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#1b1640'; ctx.stroke();
      ctx.restore();
    }

    var bob = Kit.motion.reduced() ? 0 : Math.sin(w.worldTime * 5) * 3;
    for (var ci = 0; ci < w.coins.length; ci++) if (!w.coins[ci].taken) Kit.art.blit(ctx, getItemSprite('coin'), w.coins[ci].x, w.coins[ci].y + bob);
    for (var bi = 0; bi < w.boxes.length; bi++) if (w.boxes[bi].cd <= 0) Kit.art.blit(ctx, getItemSprite('box'), w.boxes[bi].x, w.boxes[bi].y - bob);

    for (var pi = 0; pi < particles.length; pi++) {
      var pt = particles[pi]; ctx.globalAlpha = E.clamp(pt.life / pt.max, 0, 1); ctx.fillStyle = pt.col;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (var rki = 0; rki < w.rockets.length; rki++) Kit.art.blit(ctx, getItemSprite('rocket'), w.rockets[rki].x, w.rockets[rki].y, { rot: w.rockets[rki].ang });

    var drawOrder = w.karts.slice().sort(function (a, b) { return a.z - b.z; });
    for (var ki = 0; ki < drawOrder.length; ki++) {
      var k = drawOrder[ki], scale = 1 + E.clamp(k.z / 170, 0, 0.36);
      var spinRot = k.spinT > 0 ? k.ang + k.spinT * 14 : k.ang + (k.drifting ? k.driftDir * 0.22 : 0);
      ctx.fillStyle = 'rgba(15, 12, 36, 0.35)'; ctx.beginPath(); ctx.ellipse(k.x + 4, k.y + 7, 26, 17, k.ang, 0, Math.PI * 2); ctx.fill();
      if (k.turboT > 0 || k.magnetT > 0) {
        ctx.strokeStyle = k.turboT > 0 ? '#ffd23f' : '#38bdf8'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(k.x, k.y - k.z * 0.65, 34 * scale, 0, Math.PI * 2); ctx.stroke();
      }
      if (k.drifting && k.driftLv > 0) {
        ctx.fillStyle = k.driftLv === 2 ? '#ff7b00' : '#00e5ff';
        ctx.beginPath(); ctx.arc(k.x - Math.cos(k.ang) * 26, k.y - Math.sin(k.ang) * 26 - k.z * 0.65, k.driftLv === 2 ? 12 : 8, 0, Math.PI * 2); ctx.fill();
      }
      Kit.art.blit(ctx, getKartSprite(k), k.x, k.y - k.z * 0.65, { rot: spinRot, sx: scale, sy: scale });
      if (k.human && screen === 'play') {
        ctx.font = '900 13px Fredoka, Cairo, sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = k.id === 0 ? '#ffd23f' : '#38bdf8'; ctx.strokeStyle = '#1b1640'; ctx.lineWidth = 3.5;
        var tagTxt = w.humans === 2 ? k.name : 'أنت ▼';
        ctx.strokeText(tagTxt, k.x, k.y - k.z * 0.65 - 30 * scale); ctx.fillText(tagTxt, k.x, k.y - k.z * 0.65 - 30 * scale);
      }
    }
    ctx.restore();
  }

  function cStrokeFillRamp() {
    ctx.stroke();
    ctx.fillStyle = '#fef08a'; ctx.fillRect(-38, -32, 76, 10); ctx.fillRect(-38, 22, 76, 10);
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 4.5;
    for (var rx = -20; rx <= 20; rx += 20) { ctx.beginPath(); ctx.moveTo(rx - 8, -14); ctx.lineTo(rx + 6, 0); ctx.lineTo(rx - 8, 14); ctx.stroke(); }
  }

  function renderHUD() {
    var p1 = world.karts[0], L = world.L;
    if (p1.inkedT > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(0.6, p1.inkedT * 0.35); ctx.fillStyle = '#1e1b4b';
      var blobs = [[220, 160, 95], [1040, 190, 105], [340, 560, 90], [950, 530, 100]];
      for (var bi = 0; bi < 4; bi++) { ctx.beginPath(); ctx.arc(blobs[bi][0], blobs[bi][1], blobs[bi][2], 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    drawPill(955, 11, 200, 44, '#ffd23f', '#1b1640', 'المركز ' + p1.rank + '/4');
    drawPill(765, 11, 178, 44, '#1e293b', '#f8fafc', 'دورة ' + Math.min(E.LAPS, p1.lap + 1) + '/' + E.LAPS);
    drawPill(555, 11, 198, 44, '#1e293b', '#fde68a', '🪙 ' + p1.coins + ' · ' + world.time.toFixed(1) + ' ث');
    drawPill(315, 11, 228, 44, p1.item ? '#7c3aed' : 'rgba(30,41,59,0.85)', '#fff', p1.item ? ITEM_NAMES[p1.item] : '🎁 صندوق المفاجآت');
    if (world.humans === 2) drawPill(135, 11, 168, 44, '#0284c7', '#fff', 'لاعب 2: مركز ' + world.karts[1].rank);

    var mx = 18, my = E.VIEW_H - 166, mw = 206, mh = 148, sx = (mw - 28) / E.WORLD_W, sy = (mh - 24) / E.WORLD_H, ox = mx + 14, oy = my + 12;
    ctx.save(); Kit.art.round(ctx, mx, my, mw, mh, 16); ctx.fillStyle = 'rgba(19, 15, 45, 0.84)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
    ctx.beginPath();
    for (var i = 0; i < L.pts.length; i += 2) { var p = L.pts[i]; if (i === 0) ctx.moveTo(ox + p.x * sx, oy + p.y * sy); else ctx.lineTo(ox + p.x * sx, oy + p.y * sy); }
    ctx.closePath(); ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 5; ctx.stroke();
    for (var ki = world.karts.length - 1; ki >= 0; ki--) {
      var k = world.karts[ki]; ctx.beginPath(); ctx.arc(ox + k.x * sx, oy + k.y * sy, k.id === 0 ? 6.5 : 4.8, 0, Math.PI * 2);
      ctx.fillStyle = k.id === 0 ? '#ff4757' : (k.human ? '#00e5ff' : k.bodyColor); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    ctx.restore();

    var msg = !p1.started ? 'انطلق! اضغط ↑ أو ← → أو اسحب بالماوس 🏎️' : (bannerT > 0 ? bannerText : '');
    if (msg) {
      ctx.save();
      ctx.font = '900 22px Fredoka, Cairo, sans-serif';
      var tw = Math.min(620, ctx.measureText(msg).width + 44);
      Kit.art.round(ctx, (E.VIEW_W - tw) * 0.5, 68, tw, 44, 16);
      ctx.fillStyle = 'rgba(27, 22, 64, 0.88)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(msg, E.VIEW_W * 0.5, 91);
      ctx.restore();
    }
  }

  function drawPill(x, y, w, h, bg, fg, text) {
    ctx.save(); Kit.art.round(ctx, x, y, w, h, 14); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#1b1640'; ctx.stroke();
    ctx.fillStyle = fg; ctx.font = '900 16px Fredoka, Cairo, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w * 0.5, y + h * 0.52); ctx.restore();
  }

  function render() {
    if (screen === 'pause') { if (pausedDrawn) return; pausedDrawn = true; }
    if (screen === 'title') { renderWorldScene(demoWorld, E.VIEW_W * 0.34, E.VIEW_H * 0.52); return; }
    renderWorldScene(world, E.VIEW_W * 0.5, E.VIEW_H * 0.5);
    if (screen === 'play' || screen === 'pause') renderHUD();
  }

  function worldToClient(wx, wy) {
    var rect = canvas.getBoundingClientRect();
    var vx = (wx - world.cam.x) * world.cam.zoom + E.VIEW_W * 0.5, vy = (wy - world.cam.y) * world.cam.zoom + E.VIEW_H * 0.5;
    return { x: rect.left + (vx / E.VIEW_W) * rect.width, y: rect.top + (vy / E.VIEW_H) * rect.height };
  }

  function snapshotState() {
    var p1 = world.karts[0];
    return {
      screen: screen, id: world.id, trackIdx: world.trackIdx, cup: world.R.cup, humans: world.humans, diff: save.diff,
      worldTime: world.worldTime, time: world.time, p1Dist: p1.dist, p1GasTime: p1.gasTime, p1Inputs: p1.inputs, finished: world.done,
      cam: { x: world.cam.x, y: world.cam.y, zoom: world.cam.zoom },
      karts: world.karts.map(function (k) {
        return {
          id: k.id, name: k.name, human: k.human, started: k.started, x: k.x, y: k.y, z: k.z, s: k.s, off: k.off,
          ang: k.ang, speed: k.speed, lap: k.lap, rank: k.rank, dist: k.dist, totalDist: k.totalDist,
          finished: k.finished, item: k.item, coins: k.coins, driftLv: k.driftLv, turboT: k.turboT, spinT: k.spinT, inkedT: k.inkedT
        };
      })
    };
  }

  Object.defineProperty(window, '__game', {
    configurable: true,
    value: {
      get state() { return snapshotState(); },
      get trackInfo() {
        return { len: world.L.len, w: world.L.hw * 2, hw: world.L.hw, hazards: world.L.hazards, bumpers: world.L.bumpers, coils: world.L.coils, chompers: world.L.chompers, ramps: world.L.ramps };
      },
      at: function (s) { return E.at(world.L, s); },
      point: worldToClient,
      startTrack: function (idx, humans) { startRace(idx, humans || modeHumans); }
    }
  });

  showScreen('title');
  Kit.loop(update, render);
  Kit.ready();
})();
