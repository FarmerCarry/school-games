/* سباق البيض (Egg Rush: Turbo Dino & Robo-Coop Heist!) — Kit.art Canvas, Juice SFX & UI */
(function () {
  'use strict';

  var E = window.EREngine, J = Kit.juice, A = Kit.art;
  var W = E.W, H = E.H, TAU = Math.PI * 2, INK = '#1b1640';
  function $(id) { return document.getElementById(id); }

  var canvas = $('game');
  A.init({ canvas: canvas, mode: '2d', theme: 'day' });

  var dirty = true;
  var view = Kit.fit(canvas, W, H, {
    maxDpr: 1.5,
    onResize: function () {
      dirty = true;
    }
  });
  var ctx = view.ctx;

  var store = Kit.store('egg-rush');
  var saveStatus = Kit.saveStatus({ retry: persistSave });
  var save = E.loadSave(store.get('save', null));
  var dda = Kit.dda('egg-rush', { id: 'main', target: 0.72, tiers: 5, start: 0.35 });

  function persistSave() {
    if (store.set('save', save) === false) { saveStatus.failed(); return false; }
    saveStatus.saved();
    return true;
  }
  function sfx(kind, a) { if (J && typeof J[kind] === 'function') J[kind](a); }

  /* ------------------------------ Bounded Static Kit.art Sprites */
  var BG_KEYS = ['bg_0', 'bg_1', 'bg_2', 'bg_3'];
  var HERO_OPEN = ['hero_0_0', 'hero_1_0', 'hero_2_0', 'hero_3_0', 'hero_4_0', 'hero_5_0'];
  var HERO_BLINK = ['hero_0_1', 'hero_1_1', 'hero_2_1', 'hero_3_1', 'hero_4_1', 'hero_5_1'];
  var EGG_KEYS = { normal: 'egg_normal', gold: 'egg_gold', dino: 'egg_dino', cyber: 'egg_cyber' };
  var BABY_KEYS = { chick: 'baby_chick', raptor: 'baby_raptor', mecha: 'baby_mecha' };
  var GUARD_KEYS = { rooster: 'guard_rooster', dog: 'guard_dog', trex: 'guard_trex', yeti: 'guard_yeti', drone: 'guard_drone' };
  var POD_KEYS = { hay: 'pod_hay', fern: 'pod_fern', igloo: 'pod_igloo', holo: 'pod_holo' };

  var fx = A.fx(280), hatchSpring = A.spring(240, 12);
  var pSprings = [A.spring(260, 13), A.spring(260, 13)], blinkSlots = [{}, {}];

  function drawEyes(c, cx, cy, sep, r, blink, angry) {
    for (var s = -1; s <= 1; s += 2) {
      var ex = cx + s * sep;
      if (blink) {
        c.beginPath(); c.moveTo(ex - r, cy); c.quadraticCurveTo(ex, cy + r * 0.45, ex + r, cy);
        c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
      } else {
        c.beginPath(); c.arc(ex, cy, r, 0, TAU); A.outlined(c, '#ffffff', 2.4);
        c.beginPath(); c.arc(ex + r * 0.2, cy, r * 0.52, 0, TAU); c.fillStyle = INK; c.fill();
        c.beginPath(); c.arc(ex - r * 0.2, cy - r * 0.25, r * 0.24, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
      }
      if (angry) {
        c.beginPath(); c.moveTo(ex - r * 1.1, cy - r * (s < 0 ? 1.25 : 0.75));
        c.lineTo(ex + r * 1.1, cy - r * (s < 0 ? 0.75 : 1.25));
        c.lineWidth = 3.2; c.strokeStyle = INK; c.stroke();
      }
    }
  }

  function getWorldBg(worldIdx) {
    var wi = Kit.clamp(worldIdx | 0, 0, 3);
    return A.bake(BG_KEYS[wi], W, H, function (c) {
      var palettes = [
        { top: '#2b6a3e', floorA: '#5fd368', floorB: '#4ec259', rim: '#c97a3d', trim: '#ffd23f' },
        { top: '#59331d', floorA: '#e7a955', floorB: '#dc9b45', rim: '#8f4726', trim: '#ff9f1c' },
        { top: '#1d4d73', floorA: '#b8ecff', floorB: '#9ce0fb', rim: '#38bdf8', trim: '#e0f7ff' },
        { top: '#1f1b3d', floorA: '#334155', floorB: '#293548', rim: '#7c3aed', trim: '#00e5ff' }
      ];
      var pal = palettes[wi];
      c.fillStyle = pal.top; c.fillRect(0, 0, W, H);
      A.round(c, E.AX0 - 14, E.AY0 - 14, (E.AX1 - E.AX0) + 28, (E.AY1 - E.AY0) + 28, 28);
      A.outlined(c, pal.rim, 5);

      c.save();
      A.round(c, E.AX0, E.AY0, E.AX1 - E.AX0, E.AY1 - E.AY0, 18); c.clip();
      c.fillStyle = pal.floorA; c.fillRect(E.AX0, E.AY0, E.AX1 - E.AX0, E.AY1 - E.AY0);
      c.fillStyle = pal.floorB;
      for (var gy = E.AY0; gy < E.AY1; gy += 64) {
        for (var gx = E.AX0; gx < E.AX1; gx += 64) {
          if ((((gx - E.AX0) >> 6) + ((gy - E.AY0) >> 6)) % 2 === 0) c.fillRect(gx, gy, 64, 64);
        }
      }
      c.strokeStyle = wi === 3 ? 'rgba(0,229,255,0.16)' : 'rgba(255,255,255,0.22)'; c.lineWidth = 3;
      for (var k = 0; k < 14; k++) {
        var px = E.AX0 + 90 + ((k * 173) % (E.AX1 - E.AX0 - 180));
        var py = E.AY0 + 60 + ((k * 137) % (E.AY1 - E.AY0 - 120));
        c.beginPath();
        if (wi === 0) { c.arc(px - 4, py, 3, 0, TAU); c.moveTo(px + 7, py + 2); c.arc(px + 4, py + 2, 2.5, 0, TAU); }
        else if (wi === 1) { c.moveTo(px - 12, py); c.lineTo(px, py - 6); c.lineTo(px + 11, py + 4); }
        else if (wi === 2) { c.moveTo(px - 8, py); c.lineTo(px + 8, py); c.moveTo(px, py - 8); c.lineTo(px, py + 8); }
        else c.arc(px, py, 5, 0, TAU);
        c.stroke();
      }
      c.restore();

      A.round(c, E.AX0, E.AY0, E.AX1 - E.AX0, E.AY1 - E.AY0, 18);
      c.strokeStyle = INK; c.lineWidth = 4; c.stroke();
      var posts = [[E.AX0 - 4, E.AY0 - 4], [E.AX1 + 4, E.AY0 - 4], [E.AX0 - 4, E.AY1 + 4], [E.AX1 + 4, E.AY1 + 4]];
      for (var pi = 0; pi < posts.length; pi++) { c.beginPath(); c.arc(posts[pi][0], posts[pi][1], 11, 0, TAU); A.outlined(c, pal.trim, 3.5); }
    });
  }

  function getHeroSprite(skinIdx, blink) {
    var idx = Kit.clamp(skinIdx | 0, 0, 5), key = blink ? HERO_BLINK[idx] : HERO_OPEN[idx];
    return A.sprite(key, 64, 64, function (c, w, h) {
      var cx = w / 2, cy = h / 2, spec = idx === 5 ? { body: '#ff5964', trim: '#ffd23f', cape: '#38bdf8' } : E.SKINS[idx];
      c.beginPath(); c.moveTo(cx - 8, cy - 12); c.lineTo(cx - 27, cy - 16); c.lineTo(cx - 23, cy); c.lineTo(cx - 28, cy + 16); c.lineTo(cx - 8, cy + 12); c.closePath();
      A.outlined(c, spec.cape, 3.2);
      if (idx === 2) {
        for (var rs = -1; rs <= 1; rs++) {
          c.beginPath(); c.moveTo(cx - 16, cy + rs * 9 - 4); c.lineTo(cx - 26, cy + rs * 9); c.lineTo(cx - 16, cy + rs * 9 + 4); c.closePath();
          A.outlined(c, spec.trim, 2.5);
        }
      } else if (idx === 4) {
        for (var fs = -1; fs <= 1; fs += 2) {
          c.beginPath(); c.moveTo(cx - 4, cy + fs * 14); c.lineTo(cx - 12, cy + fs * 27); c.lineTo(cx + 8, cy + fs * 19); c.closePath();
          A.outlined(c, spec.trim, 3);
        }
      }
      c.beginPath(); c.arc(cx + 2, cy, 20, 0, TAU); A.outlined(c, spec.body, 4);
      if (idx === 1) { A.round(c, cx - 10, cy - 18, 16, 36, 6); A.outlined(c, spec.trim, 2.8); }
      else if (idx === 3) { c.beginPath(); c.arc(cx + 6, cy, 14, 0, TAU); A.outlined(c, spec.trim, 2.8); }
      else { c.beginPath(); c.arc(cx - 2, cy, 19, 1.8, 4.48); c.lineWidth = 5; c.strokeStyle = spec.trim; c.stroke(); }
      drawEyes(c, cx + 8, cy, 7.5, 5.2, blink, idx === 1 || idx === 2);
      c.beginPath(); c.ellipse(cx - 4, cy - 9, 6, 3.5, -0.4, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill();
    }, { pad: 6 });
  }

  function getEggSprite(kind) {
    var key = EGG_KEYS[kind] || EGG_KEYS.normal;
    return A.sprite(key, 44, 50, function (c, w, h) {
      var cx = w / 2, cy = h / 2 + 2;
      var fill = kind === 'gold' ? '#ffd23f' : kind === 'dino' ? '#4ade80' : kind === 'cyber' ? '#38bdf8' : '#fff7e6';
      var spot = kind === 'gold' ? '#fff4b8' : kind === 'dino' ? '#f43f5e' : kind === 'cyber' ? '#e879f9' : '#fbbf24';
      c.beginPath(); c.moveTo(cx, cy - 20);
      c.bezierCurveTo(cx + 18, cy - 18, cx + 19, cy + 17, cx, cy + 18);
      c.bezierCurveTo(cx - 19, cy + 17, cx - 18, cy - 18, cx, cy - 20);
      c.closePath(); A.outlined(c, fill, 3.6);
      c.fillStyle = spot;
      if (kind === 'cyber') {
        c.strokeStyle = spot; c.lineWidth = 3;
        c.beginPath(); c.moveTo(cx - 11, cy + 2); c.lineTo(cx, cy - 5); c.lineTo(cx + 11, cy + 2); c.stroke();
      } else {
        c.beginPath(); c.arc(cx - 5, cy + 3, 4, 0, TAU); c.fill();
        c.beginPath(); c.arc(cx + 6, cy - 3, 3.2, 0, TAU); c.fill();
        if (kind === 'dino') { c.beginPath(); c.arc(cx + 2, cy + 9, 3, 0, TAU); c.fill(); }
      }
      c.beginPath(); c.ellipse(cx - 5, cy - 8, 3.8, 6.5, 0.25, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.75)'; c.fill();
    }, { pad: 4 });
  }

  function getBabySprite(kind) {
    var key = BABY_KEYS[kind] || BABY_KEYS.chick;
    return A.sprite(key, 34, 34, function (c, w, h) {
      var cx = w / 2, cy = h / 2 + 2, col = kind === 'raptor' ? '#4ade80' : kind === 'mecha' ? '#38bdf8' : '#ffe14d';
      c.beginPath(); c.arc(cx, cy, 11, 0, TAU); A.outlined(c, col, 3);
      c.fillStyle = INK; c.beginPath(); c.arc(cx - 4, cy - 2, 2.2, 0, TAU); c.arc(cx + 4, cy - 2, 2.2, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(cx - 3, cy + 2); c.lineTo(cx + 3, cy + 2); c.lineTo(cx, cy + 7); c.closePath();
      c.fillStyle = '#ff9f1c'; c.fill();
    }, { pad: 4 });
  }

  function getGuardSprite(type) {
    var key = GUARD_KEYS[type] || GUARD_KEYS.rooster, sz = type === 'trex' ? 80 : 66;
    return A.sprite(key, sz, sz, function (c, w, h) {
      var cx = w / 2, cy = h / 2;
      if (type === 'rooster') {
        c.beginPath(); c.moveTo(cx - 8, cy - 12); c.lineTo(cx - 18, cy); c.lineTo(cx - 8, cy + 12); c.closePath(); A.outlined(c, '#ef4444', 3);
        c.beginPath(); c.moveTo(cx + 16, cy - 7); c.lineTo(cx + 29, cy); c.lineTo(cx + 16, cy + 7); c.closePath(); A.outlined(c, '#fbbf24', 3);
        c.beginPath(); c.arc(cx, cy, 21, 0, TAU); A.outlined(c, '#f8fafc', 4);
        c.beginPath(); c.arc(cx - 2, cy, 8, 0, TAU); A.outlined(c, '#ef4444', 2.5);
        drawEyes(c, cx + 8, cy, 8, 5, false, true);
      } else if (type === 'dog') {
        for (var ds = -1; ds <= 1; ds += 2) { A.round(c, cx - 10, cy + ds * 18 - 5, 14, 10, 4); A.outlined(c, '#475569', 3); }
        c.beginPath(); c.arc(cx, cy, 22, 0, TAU); A.outlined(c, '#94a3b8', 4);
        A.round(c, cx + 6, cy - 11, 16, 22, 7); A.outlined(c, '#cbd5e1', 3);
        drawEyes(c, cx + 6, cy, 8, 5, false, true);
      } else if (type === 'trex') {
        c.beginPath(); c.moveTo(cx - 14, cy - 10); c.lineTo(cx - 34, cy); c.lineTo(cx - 14, cy + 10); c.closePath(); A.outlined(c, '#16a34a', 3.5);
        c.beginPath(); c.arc(cx, cy, 27, 0, TAU); A.outlined(c, '#22c55e', 4.5);
        A.round(c, cx + 6, cy - 16, 24, 32, 10); A.outlined(c, '#4ade80', 3.5);
        for (var ts = -1; ts <= 1; ts++) { c.beginPath(); c.arc(cx - 10, cy + ts * 9, 4.5, 0, TAU); A.outlined(c, '#ff9f1c', 2.2); }
        drawEyes(c, cx + 8, cy, 10, 5.8, false, true);
      } else if (type === 'yeti') {
        for (var ys = -1; ys <= 1; ys += 2) {
          c.beginPath(); c.moveTo(cx - 2, cy + ys * 18); c.lineTo(cx + 10, cy + ys * 30); c.lineTo(cx + 14, cy + ys * 16); c.closePath();
          A.outlined(c, '#38bdf8', 3);
        }
        c.beginPath(); c.arc(cx, cy, 24, 0, TAU); A.outlined(c, '#f1f5f9', 4);
        c.beginPath(); c.arc(cx + 4, cy, 15, 0, TAU); c.fillStyle = '#bae6fd'; c.fill();
        drawEyes(c, cx + 7, cy, 8.5, 5.2, false, true);
      } else {
        for (var ri = 0; ri < 3; ri++) {
          var ra = ri * (TAU / 3);
          c.beginPath(); c.arc(cx + Math.cos(ra) * 20, cy + Math.sin(ra) * 20, 8, 0, TAU); A.outlined(c, '#334155', 3);
        }
        c.beginPath(); c.arc(cx, cy, 18, 0, TAU); A.outlined(c, '#7c3aed', 3.8);
        c.beginPath(); c.arc(cx + 6, cy, 8, 0, TAU); A.outlined(c, '#ff3b5c', 2.8);
        c.beginPath(); c.arc(cx + 8, cy - 2, 2.8, 0, TAU); c.fillStyle = '#fff'; c.fill();
      }
    }, { pad: 6 });
  }

  function getPodSprite(kind) {
    var key = POD_KEYS[kind] || POD_KEYS.hay;
    return A.sprite(key, 92, 92, function (c, w, h) {
      var cx = w / 2, cy = h / 2;
      if (kind === 'hay') { A.blob(c, cx, cy, 36, 0.08, 0.4); A.outlined(c, '#f59e0b', 4); A.blob(c, cx, cy - 3, 25, 0.08, 1.4); c.fillStyle = '#fbbf24'; c.fill(); }
      else if (kind === 'fern') { A.blob(c, cx, cy, 37, 0.14, 0.2); A.outlined(c, '#15803d', 4); A.blob(c, cx, cy, 24, 0.12, 1.8); c.fillStyle = '#22c55e'; c.fill(); }
      else if (kind === 'igloo') { c.beginPath(); c.arc(cx, cy + 2, 35, 0, TAU); A.outlined(c, '#e0f2fe', 4); A.round(c, cx - 14, cy + 6, 28, 22, 8); A.outlined(c, '#38bdf8', 3); }
      else { c.beginPath(); c.arc(cx, cy, 36, 0, TAU); A.outlined(c, 'rgba(168,85,247,0.55)', 4); c.beginPath(); c.arc(cx, cy, 22, 0, TAU); c.strokeStyle = '#00e5ff'; c.lineWidth = 3; c.stroke(); }
    }, { pad: 4 });
  }

  function getDuckSprite() {
    return A.sprite('decoy_duck', 46, 46, function (c, w, h) {
      var cx = w / 2, cy = h / 2 + 2;
      c.beginPath(); c.ellipse(cx - 2, cy + 4, 15, 11, 0, 0, TAU); A.outlined(c, '#ffe135', 3.4);
      c.beginPath(); c.arc(cx + 7, cy - 7, 9.5, 0, TAU); A.outlined(c, '#ffe135', 3.4);
      c.beginPath(); c.moveTo(cx + 14, cy - 9); c.lineTo(cx + 22, cy - 6); c.lineTo(cx + 14, cy - 3); c.closePath(); A.outlined(c, '#ff7b00', 2.6);
      c.beginPath(); c.arc(cx + 9, cy - 9, 2.3, 0, TAU); c.fillStyle = INK; c.fill();
    }, { pad: 4 });
  }

  function getSpringSprite() {
    return A.sprite('pad_spring', 68, 68, function (c, w, h) {
      var cx = w / 2, cy = h / 2;
      c.beginPath(); c.arc(cx, cy, 28, 0, TAU); A.outlined(c, '#ef4444', 4);
      c.beginPath(); c.arc(cx, cy, 18, 0, TAU); A.outlined(c, '#ffd23f', 3.2);
      c.beginPath(); c.moveTo(cx - 7, cy - 8); c.lineTo(cx + 9, cy); c.lineTo(cx - 7, cy + 8); c.closePath(); c.fillStyle = INK; c.fill();
    }, { pad: 4 });
  }

  function getPickupSprite(kind) {
    return A.sprite(kind === 'shield' ? 'pk_shield' : 'pk_feather', 48, 48, function (c, w, h) {
      var cx = w / 2, cy = h / 2;
      if (kind === 'shield') {
        c.beginPath(); c.arc(cx, cy, 18, 0, TAU); A.outlined(c, '#38bdf8', 3.5);
        c.beginPath(); c.arc(cx - 5, cy - 5, 5, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.75)'; c.fill();
      } else {
        c.beginPath(); c.moveTo(cx - 14, cy + 12); c.quadraticCurveTo(cx - 6, cy - 16, cx + 15, cy - 14);
        c.quadraticCurveTo(cx + 8, cy + 8, cx - 14, cy + 12); c.closePath(); A.outlined(c, '#ffd23f', 3.5);
      }
    }, { pad: 4 });
  }

  /* ------------------------------ Game State & Controls */
  var screen = 'title', curMode = 'solo', curDiff = save.diff || 'normal';
  var curWorld = save.world || 0, curStage = save.stage || 0;
  var world = null, intro = false, tries = 0;
  var previewWorld = E.createWorld({ mode: 'solo', diff: curDiff, world: curWorld, stage: E.stageIndexOf(curWorld, curStage), skin: save.skin });
  var mouseSteer = { active: false, x: 0, y: 0, startX: -999, startY: -999, dashQueued: false };
  var p1DashQueued = false, p2DashQueued = false;

  function resetInputs() { mouseSteer.active = false; mouseSteer.dashQueued = false; p1DashQueued = false; p2DashQueued = false; }
  function formatClock(sec) { var s = Math.max(0, Math.ceil(sec)), m = (s / 60) | 0, r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
  function totalStars() { var sum = 0; for (var i = 0; i < save.stars.length; i++) sum += save.stars[i] || 0; return sum; }

  function setScreen(next) {
    screen = next;
    $('hud').hidden = next !== 'play';
    $('scrTitle').hidden = next !== 'title';
    $('scrShop').hidden = next !== 'shop';
    $('scrPause').hidden = next !== 'pause';
    $('scrResult').hidden = next !== 'result';
    if (next !== 'play') $('introCard').hidden = true;
    dirty = true;
  }

  function dismissIntro() {
    if (!intro) return;
    intro = false; $('introCard').hidden = true;
    if (!save.coached) { save.coached = true; persistSave(); }
    Kit.stats.tutorial('done'); dirty = true;
  }

  function startRound(opts) {
    opts = opts || {};
    var isRestart = !!opts.restart, stgIdx = E.stageIndexOf(curWorld, curStage);
    world = E.createWorld({
      mode: curMode, diff: curDiff, world: curWorld, stage: stgIdx,
      skin: save.skin, dda: dda.level, seed: ((Date.now() & 0xffff) ^ (stgIdx * 131 + tries * 17)) >>> 0
    });
    tries++; resetInputs();
    var roundKey = world.id + '_' + curMode;
    Kit.stats.round(roundKey);

    if (!isRestart && !save.coached && curMode === 'solo') {
      intro = true; $('introCard').hidden = false; Kit.stats.tutorial('start');
    } else {
      if (intro) Kit.stats.tutorial('done');
      intro = false; $('introCard').hidden = true;
      if (!save.coached) { save.coached = true; persistSave(); }
    }
    setScreen('play'); updateHud();
    try { canvas.focus(); } catch (e) { /* ignore */ }
  }

  function pauseGame() { if (screen !== 'play') return; resetInputs(); setScreen('pause'); }
  function resumeGame() {
    if (screen !== 'pause') return;
    resetInputs(); setScreen('play'); $('introCard').hidden = !intro;
    try { canvas.focus(); } catch (e) { /* ignore */ }
  }
  function showTitle() {
    if (screen === 'play' || screen === 'pause') Kit.stats.end('quit', world ? world.score : 0);
    intro = false; resetInputs();
    previewWorld = E.createWorld({ mode: 'solo', diff: curDiff, world: curWorld, stage: E.stageIndexOf(curWorld, curStage), skin: save.skin });
    renderTitleUI(); setScreen('title');
  }
  function openShop() { renderShopUI(); setScreen('shop'); }

  function handleRoundEnd() {
    if (!world) return;
    var stgIdx = E.stageIndexOf(curWorld, curStage);
    if (curMode !== 'vs') dda.result(world.won ? (world.stars >= 3 ? 1 : world.stars === 2 ? 0.8 : 0.62) : 0);
    if (world.won && curMode !== 'vs') {
      if (world.stars > (save.stars[stgIdx] || 0)) save.stars[stgIdx] = world.stars;
      if (world.score > (save.best[stgIdx] || 0)) save.best[stgIdx] = world.score;
    }
    if (world.coinsEarned > 0) save.coins = Math.min(999999, save.coins + world.coinsEarned);
    persistSave();
    Kit.stats.end(world.won ? 'win' : 'lose', world.score);

    if (world.won) {
      sfx('levelUp'); if (world.stars >= 1) sfx('star', world.stars);
      $('resBadge').textContent = curMode === 'vs' ? 'نهاية السباق الثنائي' : world.title;
      $('resTitle').textContent = curMode === 'vs' ? ('فاز اللاعب ' + (world.winner + 1) + '!') : (world.stars === 3 ? 'فقس أسطوري خارق!' : 'انتصار رائع!');
      var stStr = '';
      for (var i = 0; i < 3; i++) stStr += (i < world.stars ? '★' : '☆') + (i < 2 ? ' ' : '');
      $('resStars').textContent = stStr;
    } else {
      sfx('fail');
      $('resBadge').textContent = world.title;
      $('resTitle').textContent = 'انتهى الوقت — حاول مجدداً!';
      $('resStars').textContent = '☆ ☆ ☆';
    }
    if (curMode === 'vs') {
      $('resStats').textContent = 'لاعب 1: ' + world.players[0].hatched + ' بيضات · لاعب 2: ' + world.players[1].hatched + ' بيضات · العملات المكتسبة: +' + world.coinsEarned;
      $('btnNext').hidden = true;
    } else {
      $('resStats').textContent = 'فقست ' + world.hatched + ' من ' + world.goal + ' · أطول سلسلة: ' + world.bestChain + '× · النقاط: ' + Kit.fmt(world.score) + ' · العملات: +' + world.coinsEarned;
      $('btnNext').hidden = !world.won;
    }
    setScreen('result');
  }

  function processEvents(w) {
    for (var i = 0; i < w.events.length; i++) {
      var ev = w.events[i];
      if (ev.type === 'pickup') {
        sfx('coin', Math.min(5, ev.chain)); sfx('pop', 0.45);
        if (pSprings[ev.pid]) pSprings[ev.pid].kick(0.32);
        fx.burst(ev.x, ev.y, { n: 8, color: '#ffd23f', shape: 'star', speed: 150, life: 0.45, size: 8 });
        if (ev.chain >= 2) A.pop('سلسلة ' + ev.chain + '×!', ev.x, ev.y - 24, { color: '#fde047', size: 24 });
      } else if (ev.type === 'dash') {
        sfx('whoosh', 0.85);
        if (ev.decoy) { sfx('pop', 0.8); A.pop('كواك!', ev.x, ev.y - 20, { color: '#ffe135', size: 22 }); }
        if (pSprings[ev.pid]) pSprings[ev.pid].kick(-0.38);
        fx.burst(ev.x, ev.y, { n: 7, color: '#38bdf8', shape: 'spark', speed: 170, life: 0.35, size: 7 });
      } else if (ev.type === 'distract') sfx('jump', 0.35);
      else if (ev.type === 'spring') {
        sfx('jump', 0.9); if (pSprings[ev.pid]) pSprings[ev.pid].kick(0.45);
        fx.burst(ev.x, ev.y, { n: 10, color: '#ffd23f', shape: 'spark', speed: 200, life: 0.4, size: 8 });
        A.pop('بووم!', ev.x, ev.y - 24, { color: '#ffd23f', size: 24 });
      } else if (ev.type === 'portal') {
        sfx('chime', 1); fx.burst(ev.x, ev.y, { n: 14, color: '#00e5ff', shape: 'star', speed: 210, life: 0.5, size: 9 });
      } else if (ev.type === 'switch') {
        sfx('toggle', true); A.pop('فُتح الليزر!', ev.x, ev.y - 24, { color: '#3ddc84', size: 24 });
      } else if (ev.type === 'powerup') {
        sfx('chime', 2); fx.burst(ev.x, ev.y, { n: 12, color: ev.kind === 'shield' ? '#38bdf8' : '#ffd23f', shape: 'star', speed: 190, life: 0.5, size: 9 });
        A.pop(ev.kind === 'shield' ? 'درع الفقاعة!' : 'ريشة التيربو!', ev.x, ev.y - 26, { color: '#7ef29d', size: 25 });
      } else if (ev.type === 'hatch') {
        for (var hi = 0; hi < ev.count; hi++) Kit.track.hit();
        sfx('streak', Math.min(10, w.hatched));
        if (ev.mega) { sfx('chime', 3); A.shake.add(0.32); A.flash('#ffd23f', 130); }
        hatchSpring.kick(0.5);
        fx.burst(ev.x, ev.y, { n: ev.mega ? 24 : 14, color: '#ffd23f', shape: 'star', speed: 240, life: 0.65, size: 11 });
        A.pop(ev.mega ? 'فقس خارق ×' + ev.count + '! +' + ev.points : '+' + ev.points, ev.x, ev.y - 38, { color: '#ffd23f', size: ev.mega ? 30 : 25 });
      } else if (ev.type === 'shieldPop') {
        sfx('pop', 0.75); fx.burst(ev.x, ev.y, { n: 12, color: '#38bdf8', shape: 'spark', speed: 190, life: 0.45, size: 8 });
        A.pop('حماك الدرع!', ev.x, ev.y - 28, { color: '#38bdf8', size: 25 });
      } else if (ev.type === 'bonk') {
        Kit.track.miss(); sfx('impact', 0.55); A.shake.add(0.24);
        if (pSprings[ev.pid]) pSprings[ev.pid].kick(0.45);
        fx.burst(ev.x, ev.y, { n: 10, color: '#ff5470', shape: 'star', speed: 180, life: 0.45, size: 9 });
        A.pop('بونك!', ev.x, ev.y - 26, { color: '#ff8fa3', size: 27 });
      }
    }
    w.events.length = 0;
  }

  /* ------------------------------ UI Rendering & Bindings */
  function updateHud() {
    if (!world) return;
    $('hudEggs').textContent = curMode === 'vs'
      ? ('🔵 \u2066' + world.players[0].hatched + ' / ' + world.goal + '\u2069 · 🔴 \u2066' + world.players[1].hatched + ' / ' + world.goal + '\u2069')
      : ('🥚 \u2066' + world.hatched + ' / ' + world.goal + '\u2069');
    var p0 = world.players[0], chEl = $('hudChain'), tmEl = $('hudTime');
    chEl.textContent = (p0.shield > 0 ? '🫧' + p0.shield + ' · ' : '') + '⚡ تيربو \u2066' + E.chainSpeedMult(p0.carry.length).toFixed(2) + '×\u2069';
    chEl.classList.toggle('hot', p0.carry.length >= 3 || p0.featherTimer > 0);
    tmEl.textContent = '⏱️ \u2066' + formatClock(world.timeLeft) + '\u2069';
    tmEl.classList.toggle('warn', world.timeLeft <= 15);
    $('hudScore').textContent = '⭐ ' + Kit.fmt(world.score) + ' · 🪙 ' + (save.coins + world.coinsEarned);
  }

  function renderTitleUI() {
    $('titleStars').textContent = String(totalStars());
    $('titleCoins').textContent = Kit.fmt(save.coins);
    $('shopBtnCoins').textContent = Kit.fmt(save.coins);

    var modeBtns = $('modeBar').querySelectorAll('button');
    for (var m = 0; m < modeBtns.length; m++) modeBtns[m].classList.toggle('on', modeBtns[m].getAttribute('data-mode') === curMode);
    $('howtoSolo').hidden = curMode !== 'solo';
    $('howtoDuo').hidden = curMode === 'solo';

    var diffBtns = $('diffBar').querySelectorAll('button');
    for (var d = 0; d < diffBtns.length; d++) diffBtns[d].classList.toggle('on', diffBtns[d].getAttribute('data-diff') === curDiff);
    $('diffDesc').textContent = E.DIFFS[curDiff].desc;

    var grid = $('worldGrid'); grid.textContent = '';
    for (var wi = 0; wi < E.WORLDS.length; wi++) {
      (function (wIdx) {
        var wInfo = E.WORLDS[wIdx], card = document.createElement('div');
        card.className = 'er-wcard' + (curWorld === wIdx ? ' on' : '');
        card.setAttribute('data-world', String(wIdx));
        var head = document.createElement('div'); head.className = 'er-whead';
        var nm = document.createElement('span'); nm.className = 'er-wname'; nm.textContent = wInfo.name;
        var dot = document.createElement('span'); dot.className = 'er-wdot'; dot.style.background = wInfo.color;
        head.appendChild(nm); head.appendChild(dot);
        var sub = document.createElement('div'); sub.className = 'er-wsub'; sub.textContent = wInfo.sub;
        var stRow = document.createElement('div'); stRow.className = 'er-stages';
        for (var si = 0; si < 3; si++) {
          (function (sIdx) {
            var stCount = save.stars[E.stageIndexOf(wIdx, sIdx)] || 0;
            var sb = document.createElement('button'); sb.type = 'button';
            sb.className = 'er-stg-btn' + (curWorld === wIdx && curStage === sIdx ? ' on' : '');
            sb.textContent = (sIdx + 1) + (stCount ? ' ★' + stCount : '');
            sb.addEventListener('click', function (ev) {
              ev.stopPropagation(); sfx('tap');
              curWorld = wIdx; curStage = sIdx; save.world = curWorld; save.stage = curStage; persistSave();
              previewWorld = E.createWorld({ mode: 'solo', diff: curDiff, world: curWorld, stage: E.stageIndexOf(curWorld, curStage), skin: save.skin });
              renderTitleUI(); dirty = true;
            });
            stRow.appendChild(sb);
          })(si);
        }
        card.addEventListener('click', function () {
          sfx('tap'); curWorld = wIdx; save.world = curWorld; persistSave();
          previewWorld = E.createWorld({ mode: 'solo', diff: curDiff, world: curWorld, stage: E.stageIndexOf(curWorld, curStage), skin: save.skin });
          renderTitleUI(); dirty = true;
        });
        card.appendChild(head); card.appendChild(sub); card.appendChild(stRow); grid.appendChild(card);
      })(wi);
    }
  }

  function renderShopUI() {
    $('shopCoins').textContent = Kit.fmt(save.coins);
    var grid = $('skinGrid'); grid.textContent = '';
    for (var i = 0; i < E.SKINS.length; i++) {
      (function (skin) {
        var owned = save.skins.indexOf(skin.id) !== -1, eq = save.skin === skin.id;
        var card = document.createElement('div'); card.className = 'er-skin-card' + (eq ? ' equipped' : '');
        var sw = document.createElement('div'); sw.className = 'er-skin-swatch';
        sw.style.background = 'radial-gradient(circle at 35% 30%, ' + skin.trim + ', ' + skin.body + ')';
        var nm = document.createElement('div'); nm.className = 'er-skin-name'; nm.textContent = skin.name;
        var ds = document.createElement('div'); ds.className = 'er-skin-desc'; ds.textContent = skin.desc;
        var btn = document.createElement('button'); btn.type = 'button'; btn.setAttribute('data-skin', String(skin.id));
        if (eq) { btn.className = 'er-skin-btn equipped'; btn.textContent = 'مُرتدى ✓'; }
        else if (owned) { btn.className = 'er-skin-btn owned'; btn.textContent = 'ارتداء'; }
        else { btn.className = 'er-skin-btn'; btn.textContent = 'شراء · 🪙 ' + skin.cost; if (save.coins < skin.cost) btn.disabled = true; }
        btn.addEventListener('click', function () {
          var res = E.buyOrEquipSkin(save, skin.id);
          if (res.ok) {
            sfx(res.action === 'buy' ? 'levelUp' : 'select');
            persistSave(); renderShopUI(); renderTitleUI(); dirty = true;
          } else sfx('error');
        });
        card.appendChild(sw); card.appendChild(nm); card.appendChild(ds); card.appendChild(btn); grid.appendChild(card);
      })(E.SKINS[i]);
    }
  }

  $('modeBar').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mode]'); if (!b) return;
    sfx('tap'); curMode = b.getAttribute('data-mode'); renderTitleUI();
  });
  $('diffBar').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-diff]'); if (!b) return;
    sfx('tap'); curDiff = b.getAttribute('data-diff'); save.diff = curDiff; persistSave(); renderTitleUI();
  });
  $('btnPlay').addEventListener('click', function () { sfx('select'); startRound({ restart: false }); });
  $('btnShop').addEventListener('click', function () { sfx('select'); openShop(); });
  $('btnShopBack').addEventListener('click', function () { sfx('back'); renderTitleUI(); setScreen('title'); });
  $('btnPause').addEventListener('click', function () { sfx('tap'); pauseGame(); });
  $('btnResume').addEventListener('click', function () { sfx('select'); resumeGame(); });
  $('btnRestart').addEventListener('click', function () { sfx('select'); startRound({ restart: true }); });
  $('btnMenu').addEventListener('click', function () { sfx('back'); showTitle(); });
  $('btnAgain').addEventListener('click', function () { sfx('select'); startRound({ restart: true }); });
  $('btnNext').addEventListener('click', function () {
    sfx('select');
    var nextIdx = (E.stageIndexOf(curWorld, curStage) + 1) % E.STAGES.length;
    curWorld = (nextIdx / 3) | 0; curStage = nextIdx % 3; save.world = curWorld; save.stage = curStage;
    persistSave(); startRound({ restart: true });
  });
  $('btnResShop').addEventListener('click', function () { sfx('select'); openShop(); });
  $('btnResMenu').addEventListener('click', function () { sfx('back'); showTitle(); });

  /* Keyboard Input — strictly guarded by Kit.isGameKeyEvent(e)! */
  var ALL_PLAY_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'Enter', 'NumpadEnter'];
  window.addEventListener('keydown', function (e) {
    if (!Kit.isGameKeyEvent(e)) return;
    if (!e.repeat && (e.code === 'KeyP' || e.code === 'Escape')) {
      if (screen === 'play') { sfx('tap'); pauseGame(); return; }
      if (screen === 'pause') { sfx('select'); resumeGame(); return; }
      if (screen === 'shop') { sfx('back'); renderTitleUI(); setScreen('title'); return; }
    }
    if (screen !== 'play') return;
    if (intro && ALL_PLAY_KEYS.indexOf(e.code) !== -1) dismissIntro();
    if (!e.repeat) {
      if (e.code === 'Space') p1DashQueued = true;
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        if (curMode === 'solo') p1DashQueued = true; else p2DashQueued = true;
      }
    }
  });

  window.addEventListener('pointerdown', function (e) {
    if (screen !== 'play' || e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest('button')) return;
    var pt = view.toLogical(e.clientX, e.clientY);
    if (intro) dismissIntro();
    if (curMode === 'solo') {
      mouseSteer.active = true; mouseSteer.x = pt.x; mouseSteer.y = pt.y;
      mouseSteer.startX = pt.x; mouseSteer.startY = pt.y; mouseSteer.dashQueued = true;
    }
  });
  window.addEventListener('pointermove', function (e) {
    if (screen !== 'play' || curMode !== 'solo' || intro) return;
    var pt = view.toLogical(e.clientX, e.clientY);
    if (mouseSteer.startX < -900) { mouseSteer.startX = pt.x; mouseSteer.startY = pt.y; return; }
    if (!mouseSteer.active && Math.hypot(pt.x - mouseSteer.startX, pt.y - mouseSteer.startY) > 16) mouseSteer.active = true;
    if (mouseSteer.active) { mouseSteer.x = pt.x; mouseSteer.y = pt.y; }
  });

  function gatherInputs() {
    if (intro && Kit.keys.anyDown(ALL_PLAY_KEYS)) dismissIntro();
    var p1x = 0, p1y = 0, p2x = 0, p2y = 0;
    if (curMode === 'solo') {
      if (Kit.keys.anyDown(['ArrowLeft', 'KeyA'])) p1x -= 1;
      if (Kit.keys.anyDown(['ArrowRight', 'KeyD'])) p1x += 1;
      if (Kit.keys.anyDown(['ArrowUp', 'KeyW'])) p1y -= 1;
      if (Kit.keys.anyDown(['ArrowDown', 'KeyS'])) p1y += 1;
      if (p1x || p1y) mouseSteer.active = false;
      else if (mouseSteer.active && world && world.players[0]) {
        var dx = mouseSteer.x - world.players[0].x, dy = mouseSteer.y - world.players[0].y, d = Math.hypot(dx, dy);
        if (d > 14) { p1x = dx / d; p1y = dy / d; }
      }
      var dash1 = p1DashQueued || mouseSteer.dashQueued || Kit.keys.pressed('Space');
      p1DashQueued = false; mouseSteer.dashQueued = false;
      return [{ x: p1x, y: p1y, dash: dash1 }];
    }
    if (Kit.keys.down('KeyA')) p1x -= 1;
    if (Kit.keys.down('KeyD')) p1x += 1;
    if (Kit.keys.down('KeyW')) p1y -= 1;
    if (Kit.keys.down('KeyS')) p1y += 1;
    if (Kit.keys.down('ArrowLeft')) p2x -= 1;
    if (Kit.keys.down('ArrowRight')) p2x += 1;
    if (Kit.keys.down('ArrowUp')) p2y -= 1;
    if (Kit.keys.down('ArrowDown')) p2y += 1;
    var d1 = p1DashQueued || Kit.keys.pressed('Space');
    var d2 = p2DashQueued || Kit.keys.pressed('Enter') || Kit.keys.pressed('NumpadEnter');
    p1DashQueued = false; p2DashQueued = false;
    return [{ x: p1x, y: p1y, dash: d1 }, { x: p2x, y: p2y, dash: d2 }];
  }

  /* ------------------------------ Canvas Arena Drawing */
  function drawWall(c, w) {
    A.shadow(c, w.x, w.y, w.w, w.h, 0.42);
    var fill = w.kind === 'barn' ? '#e8473f' : w.kind === 'crate' ? '#d97706' : w.kind === 'rock' ? '#92400e' : w.kind === 'ice' ? '#38bdf8' : '#475569';
    A.round(c, w.x, w.y, w.w, w.h, 16); A.outlined(c, fill, 4);
    A.round(c, w.x + 8, w.y + 7, w.w - 16, Math.max(16, w.h - 22), 10);
    c.fillStyle = A.shade(fill, 0.25); c.fill();
  }

  function drawHatcher(c, home, pid, isVs, count) {
    var col = pid === 1 ? '#ff5964' : (isVs ? '#2b8cff' : '#3ddc84');
    A.blit(c, A.glow(col, 62), home.x, home.y, { alpha: 0.45 });
    c.save(); c.translate(home.x, home.y); c.scale(hatchSpring.sx, hatchSpring.sy);
    c.beginPath(); c.arc(0, 0, home.r, 0, TAU); A.outlined(c, 'rgba(255,255,255,0.28)', 4);
    c.beginPath(); c.arc(0, 0, home.r - 12, 0, TAU); c.strokeStyle = col; c.lineWidth = 5; c.setLineDash([12, 8]); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(0, 0, 24, 0, TAU); A.outlined(c, col, 3.5);
    c.font = '700 16px Fredoka'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = INK;
    c.fillText(isVs ? ('م' + (pid + 1)) : ('🥚' + count), 0, 1);
    c.restore();
  }

  function drawWorldScene(w) {
    var bg = getWorldBg(w.worldIdx);
    if (bg.canvas) ctx.drawImage(bg.canvas, 0, 0, W, H);
    ctx.save(); A.shake.apply(ctx);

    for (var pi = 0; pi < w.pads.length; pi++) {
      var pad = w.pads[pi];
      if (pad.kind === 'mud') {
        A.round(ctx, pad.x, pad.y, pad.w, pad.h, 28); A.outlined(ctx, '#854d0e', 3);
        A.round(ctx, pad.x + 12, pad.y + 10, pad.w - 24, pad.h - 20, 18); ctx.fillStyle = '#a16207'; ctx.fill();
      } else if (pad.kind === 'boost') {
        A.round(ctx, pad.x, pad.y, pad.w, pad.h, 16); A.outlined(ctx, w.worldIdx === 2 ? '#0284c7' : '#ea580c', 3.2);
        ctx.fillStyle = '#fde047';
        var dir = pad.dx >= 0 ? 1 : -1, cy = pad.y + pad.h / 2;
        for (var bx = pad.x + 28; bx < pad.x + pad.w - 20; bx += 52) {
          ctx.beginPath(); ctx.moveTo(bx - 8 * dir, cy - 12); ctx.lineTo(bx + 10 * dir, cy); ctx.lineTo(bx - 8 * dir, cy + 12); ctx.closePath(); ctx.fill();
        }
      } else if (pad.kind === 'spring') A.blit(ctx, getSpringSprite(), pad.x, pad.y, { rot: Math.atan2(pad.dy, pad.dx) });
    }

    for (var ti = 0; ti < w.portals.length; ti++) {
      var pt = w.portals[ti], pGlow = A.glow(pt.color, 38), ends = [[pt.x1, pt.y1], [pt.x2, pt.y2]];
      for (var ei = 0; ei < 2; ei++) {
        A.blit(ctx, pGlow, ends[ei][0], ends[ei][1], { alpha: 0.55 });
        ctx.beginPath(); ctx.arc(ends[ei][0], ends[ei][1], pt.r, 0, TAU); A.outlined(ctx, '#1e1b4b', 3.5);
        ctx.beginPath(); ctx.arc(ends[ei][0], ends[ei][1], pt.r - 9, 0, TAU); ctx.strokeStyle = pt.color; ctx.lineWidth = 4; ctx.stroke();
      }
    }

    for (var si = 0; si < w.switches.length; si++) {
      var sw = w.switches[si], gateOpen = false;
      for (var li = 0; li < w.lasers.length; li++) if (w.lasers[li].id === sw.gateId && w.lasers[li].openTimer > 0) gateOpen = true;
      ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.r, 0, TAU); A.outlined(ctx, gateOpen ? '#3ddc84' : '#f43f5e', 3.5);
      ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.r - 9, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    }
    for (var lzi = 0; lzi < w.lasers.length; lzi++) {
      var lz = w.lasers[lzi];
      if (lz.openTimer > 0) {
        ctx.strokeStyle = 'rgba(61,220,132,0.45)'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]); ctx.strokeRect(lz.x, lz.y, lz.w, lz.h); ctx.setLineDash([]);
      } else {
        A.round(ctx, lz.x, lz.y, lz.w, lz.h, 8); A.outlined(ctx, '#ff3b5c', 3);
        ctx.fillStyle = '#fff'; ctx.fillRect(lz.x + lz.w * 0.38, lz.y + 4, lz.w * 0.24, lz.h - 8);
      }
    }

    if (w.mode === 'vs' && w.players.length >= 2) {
      drawHatcher(ctx, w.players[0].home, 0, true, w.players[0].hatched);
      drawHatcher(ctx, w.players[1].home, 1, true, w.players[1].hatched);
    } else if (w.players[0]) drawHatcher(ctx, w.players[0].home, 0, false, w.hatched);

    for (var bi = 0; bi < w.babies.length; bi++) {
      var bb = w.babies[bi];
      A.blit(ctx, getBabySprite(bb.kind), bb.x, bb.y - Math.abs(Math.sin(bb.phase)) * 6);
    }
    for (var wi = 0; wi < w.walls.length; wi++) drawWall(ctx, w.walls[wi]);

    for (var gi = 0; gi < w.guards.length; gi++) {
      var g = w.guards[gi];
      if (g.state === 'sleep') continue;
      ctx.save(); ctx.beginPath(); ctx.moveTo(g.x, g.y);
      ctx.arc(g.x, g.y, g.coneRange, g.look - g.coneHalf, g.look + g.coneHalf); ctx.closePath();
      ctx.fillStyle = g.state === 'chase' ? 'rgba(255, 59, 92, 0.26)' : g.state === 'decoy' ? 'rgba(255, 225, 53, 0.24)' : 'rgba(255, 238, 120, 0.20)';
      ctx.fill(); ctx.restore();
    }

    for (var ki = 0; ki < w.pickups.length; ki++) {
      var pk = w.pickups[ki]; if (!pk.active) continue;
      var pkBob = Math.sin(w.time * 4 + ki) * 4;
      A.blit(ctx, A.glow('#ffd23f', 30), pk.x, pk.y + pkBob, { alpha: 0.45 });
      A.blit(ctx, getPickupSprite(pk.kind), pk.x, pk.y + pkBob);
    }

    var eGlow = A.glow('#ffd23f', 34);
    for (var egi = 0; egi < w.eggs.length; egi++) {
      var eg = w.eggs[egi]; if (eg.state === 'hatched' || eg.state === 'carried') continue;
      ctx.beginPath(); ctx.ellipse(eg.nestX, eg.nestY + 12, 20, 10, 0, 0, TAU); ctx.fillStyle = 'rgba(120, 72, 24, 0.35)'; ctx.fill();
      var bob = Math.sin(w.time * 3.6 + eg.wobble) * 3;
      A.blit(ctx, eGlow, eg.x, eg.y + bob, { alpha: eg.kind === 'normal' ? 0.3 : 0.6 });
      A.blit(ctx, getEggSprite(eg.kind), eg.x, eg.y + bob);
    }

    for (var dci = 0; dci < w.decoys.length; dci++) {
      var dc = w.decoys[dci];
      ctx.beginPath(); ctx.arc(dc.x, dc.y, 20 + ((w.time * 70) % 45), 0, TAU);
      ctx.strokeStyle = 'rgba(255, 225, 53, 0.55)'; ctx.lineWidth = 3; ctx.stroke();
      A.blit(ctx, getDuckSprite(), dc.x, dc.y, { rot: Math.sin(w.time * 14) * 0.2 });
    }

    for (var pli = 0; pli < w.players.length; pli++) {
      var pl = w.players[pli];
      if (pl.carry.length > 0) {
        ctx.beginPath(); ctx.moveTo(pl.x, pl.y);
        for (var cei = 0; cei < pl.carry.length; cei++) ctx.lineTo(pl.carry[cei].x, pl.carry[cei].y);
        ctx.strokeStyle = pl.carry.length >= 3 ? '#ffd23f' : 'rgba(255,255,255,0.65)';
        ctx.lineWidth = pl.carry.length >= 3 ? 5 : 3.5; ctx.stroke();
        for (var cei2 = pl.carry.length - 1; cei2 >= 0; cei2--) {
          var ce = pl.carry[cei2];
          A.blit(ctx, getEggSprite(ce.kind), ce.x, ce.y, { rot: Math.sin(ce.wobble) * 0.16, sx: 0.9, sy: 0.9 });
        }
      }
      var alpha = pl.hidden ? 0.52 : (pl.invuln > 0 && ((w.time * 16 | 0) % 2 === 0) ? 0.55 : 1);
      var spr = getHeroSprite(pli === 1 ? 5 : pl.skin, A.blink(blinkSlots[pli] || blinkSlots[0]) > 0.5);
      var sp = pSprings[pli] || pSprings[0];
      A.shadow(ctx, pl.x - 20, pl.y - 16, 40, 34, 0.4);
      if (pl.carry.length >= 3 || pl.featherTimer > 0 || pl.dashTimer > 0) A.blit(ctx, A.glow('#ffd23f', 40), pl.x, pl.y, { alpha: 0.55 });
      A.blit(ctx, spr, pl.x, pl.y, { rot: pl.facing, sx: sp.sx, sy: sp.sy, alpha: alpha });
      if (pl.shield > 0) {
        ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r + 7, 0, TAU);
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3.5; ctx.stroke();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.18)'; ctx.fill();
      }
    }

    for (var hi = 0; hi < w.hides.length; hi++) {
      var hd = w.hides[hi]; A.blit(ctx, getPodSprite(hd.kind), hd.x, hd.y);
      for (var hpi = 0; hpi < w.players.length; hpi++) {
        var hp = w.players[hpi];
        if (hp.hidden && Math.hypot(hp.x - hd.x, hp.y - hd.y) <= hd.r) drawEyes(ctx, hd.x, hd.y - 4, 8, 5, false, false);
      }
    }

    for (var gi2 = 0; gi2 < w.guards.length; gi2++) {
      var gd = w.guards[gi2];
      A.shadow(ctx, gd.x - gd.r, gd.y - gd.r, gd.r * 2, gd.r * 2, 0.42);
      A.blit(ctx, getGuardSprite(gd.type), gd.x, gd.y, { rot: gd.look });
      if (gd.bubble) {
        var bx2 = gd.x, by2 = gd.y - gd.r - 20;
        A.round(ctx, bx2 - 22, by2 - 15, 44, 30, 12); A.outlined(ctx, '#ffffff', 3);
        ctx.font = '800 18px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = gd.bubble === '!' ? '#ef4444' : '#1b1640';
        ctx.fillText(gd.bubble, bx2, by2 + 1);
      }
    }

    fx.draw(ctx); A.pop.draw(ctx); ctx.restore();
    A.flash.draw(ctx, W, H); A.vignette(ctx, W, H, 0.25);
  }

  function update(dt) {
    if (screen !== 'play' || !world) { Kit.keys.endFrame(); return; }
    var inputs = gatherInputs();
    if (intro) { Kit.keys.endFrame(); return; }
    E.stepWorld(world, dt, inputs);
    processEvents(world);
    fx.update(dt); A.pop.update(dt); A.shake.update(dt); A.flash.update(dt);
    hatchSpring.update(dt); pSprings[0].update(dt); pSprings[1].update(dt);
    updateHud(); dirty = true;
    if (world.over) handleRoundEnd();
    Kit.keys.endFrame();
  }

  function render() {
    if (screen !== 'play' && !dirty) return;
    dirty = false;
    drawWorldScene(world || previewWorld);
  }

  window.__game = {
    get screen() { return screen; },
    get mode() { return curMode; },
    get diff() { return curDiff; },
    get level() { return world ? world.id : ''; },
    get stageId() { return world ? world.id : E.STAGES[E.stageIndexOf(curWorld, curStage)].id; },
    get tries() { return tries; },
    get intro() { return intro; },
    get px() { return world && world.players[0] ? world.players[0].x : 0; },
    get py() { return world && world.players[0] ? world.players[0].y : 0; },
    get time() { return world ? world.time : 0; },
    get timeLeft() { return world ? world.timeLeft : 0; },
    get hatched() { return world ? world.hatched : 0; },
    get goal() { return world ? world.goal : 0; },
    get score() { return world ? world.score : 0; },
    get carrying() { return world && world.players[0] ? world.players[0].carry.length : 0; },
    get atStart() { return world ? E.isAtStart(world) : true; },
    get guards() { return world ? world.guards.map(function (g) { return { type: g.type, x: g.x, y: g.y, state: g.state, look: g.look }; }) : []; },
    get eggList() { return world ? world.eggs : []; },
    get world() { return world; },
    get save() { return save; },
    point: function (lx, ly) { var r = canvas.getBoundingClientRect(); return { x: r.left + lx * view.scale, y: r.top + ly * view.scale }; }
  };

  Kit.muteButton();
  Kit.lifecycle({ pause: function () { if (screen === 'play') pauseGame(); }, reset: resetInputs });
  renderTitleUI(); setScreen('title'); render();
  A.loop(update, render);
  Kit.ready();
})();
